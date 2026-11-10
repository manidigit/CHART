package es.manico.chartintelligence.ui.state

import android.app.Application
import androidx.annotation.StringRes
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import es.manico.chartintelligence.R
import es.manico.chartintelligence.config.AppConfig
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartPreferences
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.ChartType
import es.manico.chartintelligence.data.model.DrawingTool
import es.manico.chartintelligence.data.model.ProviderId
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.data.repository.WorkspaceRepository
import es.manico.chartintelligence.i18n.AppLanguage
import es.manico.chartintelligence.ui.state.coordinators.ChartDrawingCoordinator
import es.manico.chartintelligence.ui.state.coordinators.ChartPreferenceCoordinator
import es.manico.chartintelligence.ui.state.coordinators.SymbolCatalogCoordinator
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.math.BigDecimal
import kotlin.math.max
import kotlin.math.roundToInt

enum class WorkspaceScreen {
    WATCHLIST,
    CHART_VIEW,
    PREDICTION,
    SETTINGS
}

enum class AuthScreenMode {
    LOGIN,
    FORGOT_REQUEST,
    FORGOT_VERIFY
}

data class Phase1UiState(
    val language: AppLanguage = AppLanguage.FA,
    val isDarkTheme: Boolean = true,
    val isOwnerRegistered: Boolean = false,
    val isAuthenticated: Boolean = false,
    val ownerUsername: String = "",
    val ownerEmail: String = "",
    val savedPassword: String = "",
    val rememberCredentials: Boolean = true,
    val authMode: AuthScreenMode = AuthScreenMode.LOGIN,
    @param:StringRes val authErrorResId: Int? = null,
    @param:StringRes val authInfoResId: Int? = null,
    val currentScreen: WorkspaceScreen = WorkspaceScreen.WATCHLIST,
    val screenBackStack: List<WorkspaceScreen> = emptyList(),
    val symbols: List<SymbolConfig> = emptyList(),
    val chartPreferences: ChartPreferences = ChartPreferences(),
    val isSyncingAll: Boolean = false,
    val openTabs: List<ChartTabState> = emptyList(),
    val activeTabId: String? = null,
    @param:StringRes val statusBannerResId: Int? = null
) {
    val watchlistSymbols: List<SymbolConfig>
        get() = symbols.filter { it.inWatchlist }

    val activeTab: ChartTabState?
        get() = openTabs.firstOrNull { it.tabId == activeTabId } ?: openTabs.firstOrNull()
}

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = WorkspaceRepository(application)
    private val drawingCoordinator = ChartDrawingCoordinator(repository)
    private val symbolCoordinator = SymbolCatalogCoordinator(repository)
    private val preferenceCoordinator = ChartPreferenceCoordinator(repository)

    private val _uiState = MutableStateFlow(
        Phase1UiState(
            language = repository.loadLanguage(),
            isDarkTheme = repository.loadDarkTheme(),
            isOwnerRegistered = repository.isOwnerAccountRegistered(),
            isAuthenticated = repository.isSessionAuthenticated(),
            ownerUsername = repository.getOwnerUsername(),
            ownerEmail = repository.getOwnerEmail(),
            savedPassword = repository.getSavedPassword(),
            rememberCredentials = repository.loadRememberCredentials(),
            symbols = symbolCoordinator.loadInitialCatalog(),
            chartPreferences = preferenceCoordinator.loadInitialPreferences()
        )
    )
    val uiState: StateFlow<Phase1UiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val serverStatus = repository.syncOwnerStatusFromServer()
            if (serverStatus.isRegistered) {
                _uiState.update {
                    it.copy(
                        isOwnerRegistered = true,
                        ownerUsername = serverStatus.username.ifBlank { it.ownerUsername },
                        ownerEmail = serverStatus.email.ifBlank { it.ownerEmail }
                    )
                }
            }
        }

        // Proactively fetch real market data for watchlist symbols that have an empty cache
        val uncachedWatchlist = _uiState.value.watchlistSymbols.filter { it.storedCandleCount == 0 }
        if (uncachedWatchlist.isNotEmpty()) {
            syncAllWatchlistUpToNow()
        }
    }

    fun setLanguage(language: AppLanguage) {
        repository.saveLanguage(language)
        _uiState.update { it.copy(language = language) }
    }

    fun setDarkTheme(isDark: Boolean) {
        repository.saveDarkTheme(isDark)
        _uiState.update { it.copy(isDarkTheme = isDark) }
    }

    fun setRememberCredentials(remember: Boolean) {
        repository.saveRememberCredentials(remember)
        _uiState.update {
            it.copy(
                rememberCredentials = remember,
                savedPassword = if (remember) it.savedPassword else ""
            )
        }
    }

    fun navigateTo(screen: WorkspaceScreen) {
        val current = _uiState.value.currentScreen
        if (current == screen) return

        if (screen in listOf(WorkspaceScreen.CHART_VIEW, WorkspaceScreen.PREDICTION) && _uiState.value.openTabs.isEmpty()) {
            val savedCode = if (_uiState.value.chartPreferences.rememberLastChartOnDevice) {
                repository.loadLastOpenedSymbolCode()
            } else null
            val defaultSym = _uiState.value.symbols.firstOrNull { it.symbolCode == savedCode }
                ?: _uiState.value.watchlistSymbols.firstOrNull()
                ?: _uiState.value.symbols.firstOrNull()
            if (defaultSym != null) {
                activateSymbolTab(defaultSym, targetScreen = screen)
                return
            }
        }

        _uiState.update { state ->
            val nextBackStack = if (screen == WorkspaceScreen.WATCHLIST) {
                emptyList()
            } else {
                (state.screenBackStack + state.currentScreen).takeLast(6)
            }
            state.copy(
                currentScreen = screen,
                screenBackStack = nextBackStack,
                statusBannerResId = null
            )
        }
    }

    fun navigateBack() {
        _uiState.update { state ->
            val previous = state.screenBackStack.lastOrNull() ?: WorkspaceScreen.WATCHLIST
            val remainingStack = if (state.screenBackStack.isNotEmpty()) {
                state.screenBackStack.dropLast(1)
            } else {
                emptyList()
            }
            state.copy(
                currentScreen = previous,
                screenBackStack = if (previous == WorkspaceScreen.WATCHLIST) emptyList() else remainingStack,
                statusBannerResId = null
            )
        }
    }

    fun setAuthMode(mode: AuthScreenMode) {
        _uiState.update {
            it.copy(
                authMode = mode,
                authErrorResId = null,
                authInfoResId = null
            )
        }
    }

    fun registerFirstTimeOwner(
        username: String,
        password: String,
        confirmPassword: String,
        email: String = ""
    ) {
        val cleanUser = username.trim()
        val cleanEmail = email.trim().lowercase()
        if (cleanUser.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(authErrorResId = R.string.error_empty_credentials) }
            return
        }
        if (cleanEmail.isNotEmpty() && !cleanEmail.contains("@")) {
            _uiState.update { it.copy(authErrorResId = R.string.error_invalid_email) }
            return
        }
        if (password.length < 4) {
            _uiState.update { it.copy(authErrorResId = R.string.error_password_short) }
            return
        }
        if (password != confirmPassword) {
            _uiState.update { it.copy(authErrorResId = R.string.error_password_mismatch) }
            return
        }
        repository.registerOwnerAccount(cleanUser, password, cleanEmail)
        val shouldRemember = _uiState.value.rememberCredentials
        repository.saveOwnerPasswordIfRemembered(password, shouldRemember)
        _uiState.update {
            it.copy(
                isOwnerRegistered = true,
                isAuthenticated = true,
                ownerUsername = cleanUser,
                ownerEmail = cleanEmail,
                savedPassword = if (shouldRemember) password else "",
                authMode = AuthScreenMode.LOGIN,
                authErrorResId = null,
                authInfoResId = null,
                currentScreen = WorkspaceScreen.WATCHLIST
            )
        }
        viewModelScope.launch {
            repository.registerOwnerOnServer(cleanUser, cleanEmail, password)
        }
    }

    fun signInOwner(username: String, password: String) {
        val cleanUser = username.trim()
        if (cleanUser.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(authErrorResId = R.string.error_empty_credentials) }
            return
        }
        val shouldRemember = _uiState.value.rememberCredentials
        if (repository.verifyOwnerCredentials(cleanUser, password)) {
            repository.saveOwnerPasswordIfRemembered(password, shouldRemember)
            _uiState.update {
                it.copy(
                    isAuthenticated = true,
                    savedPassword = if (shouldRemember) password else "",
                    authMode = AuthScreenMode.LOGIN,
                    authErrorResId = null,
                    authInfoResId = null,
                    currentScreen = WorkspaceScreen.WATCHLIST
                )
            }
            return
        }
        viewModelScope.launch {
            val verifiedOnServer = repository.verifyOwnerCredentialsWithServer(cleanUser, password)
            if (!verifiedOnServer) {
                _uiState.update { it.copy(authErrorResId = R.string.error_invalid_credentials) }
                return@launch
            }
            repository.saveOwnerPasswordIfRemembered(password, shouldRemember)
            _uiState.update {
                it.copy(
                    isOwnerRegistered = true,
                    isAuthenticated = true,
                    ownerUsername = repository.getOwnerUsername().ifBlank { cleanUser },
                    ownerEmail = repository.getOwnerEmail(),
                    savedPassword = if (shouldRemember) password else "",
                    authMode = AuthScreenMode.LOGIN,
                    authErrorResId = null,
                    authInfoResId = null,
                    currentScreen = WorkspaceScreen.WATCHLIST
                )
            }
        }
    }

    fun requestPasswordRecoveryCode(email: String) {
        val cleanEmail = email.trim().lowercase()
        if (cleanEmail.isBlank() || !cleanEmail.contains("@")) {
            _uiState.update {
                it.copy(
                    authErrorResId = R.string.error_invalid_email,
                    authInfoResId = null
                )
            }
            return
        }
        viewModelScope.launch {
            val sent = repository.requestPasswordResetOnServer(cleanEmail)
            if (sent) {
                _uiState.update {
                    it.copy(
                        ownerEmail = cleanEmail,
                        authMode = AuthScreenMode.FORGOT_VERIFY,
                        authErrorResId = null,
                        authInfoResId = R.string.status_recovery_code_sent
                    )
                }
            } else {
                _uiState.update {
                    it.copy(
                        authErrorResId = R.string.error_email_not_found,
                        authInfoResId = null
                    )
                }
            }
        }
    }

    fun confirmPasswordRecovery(
        email: String,
        code: String,
        newPassword: String,
        confirmPassword: String
    ) {
        val cleanEmail = email.trim().lowercase()
        val cleanCode = code.trim()
        if (cleanEmail.isBlank() || cleanCode.isBlank() || newPassword.isBlank()) {
            _uiState.update { it.copy(authErrorResId = R.string.error_empty_credentials) }
            return
        }
        if (newPassword.length < 4) {
            _uiState.update { it.copy(authErrorResId = R.string.error_password_short) }
            return
        }
        if (newPassword != confirmPassword) {
            _uiState.update { it.copy(authErrorResId = R.string.error_password_mismatch) }
            return
        }
        viewModelScope.launch {
            val ok = repository.confirmPasswordResetOnServer(cleanEmail, cleanCode, newPassword)
            if (ok) {
                val shouldRemember = _uiState.value.rememberCredentials
                if (shouldRemember) {
                    repository.saveOwnerPasswordIfRemembered(newPassword, true)
                }
                _uiState.update {
                    it.copy(
                        ownerEmail = cleanEmail,
                        savedPassword = if (shouldRemember) newPassword else "",
                        authMode = AuthScreenMode.LOGIN,
                        authErrorResId = null,
                        authInfoResId = R.string.status_password_reset_success
                    )
                }
            } else {
                _uiState.update {
                    it.copy(
                        authErrorResId = R.string.error_invalid_recovery_code,
                        authInfoResId = null
                    )
                }
            }
        }
    }

    fun updateRecoveryEmail(email: String) {
        val cleanEmail = email.trim().lowercase()
        if (cleanEmail.isBlank() || !cleanEmail.contains("@")) {
            _uiState.update { it.copy(statusBannerResId = R.string.error_invalid_email) }
            return
        }
        repository.updateOwnerEmailLocal(cleanEmail)
        _uiState.update {
            it.copy(
                ownerEmail = cleanEmail,
                statusBannerResId = R.string.status_email_updated
            )
        }
        viewModelScope.launch {
            repository.updateOwnerEmailOnServer(cleanEmail)
        }
    }

    fun signOut() {
        repository.setSessionAuthenticated(false)
        _uiState.update {
            it.copy(
                isAuthenticated = false,
                authMode = AuthScreenMode.LOGIN,
                authErrorResId = null,
                authInfoResId = null,
                statusBannerResId = null,
                currentScreen = WorkspaceScreen.WATCHLIST,
                screenBackStack = emptyList()
            )
        }
    }

    fun changePassword(newPassword: String) {
        if (newPassword.length < 4) {
            _uiState.update { it.copy(statusBannerResId = R.string.error_password_short) }
            return
        }
        repository.updateOwnerPassword(newPassword)
        _uiState.update { it.copy(statusBannerResId = R.string.settings_password_updated) }
        viewModelScope.launch {
            repository.updateOwnerPasswordOnServer(newPassword)
        }
    }

    fun toggleSymbolInWatchlist(symbolCode: String, enabled: Boolean) {
        val updated = symbolCoordinator.toggleWatchlist(_uiState.value.symbols, symbolCode, enabled)
        _uiState.update { it.copy(symbols = updated) }
        if (enabled) {
            val target = updated.firstOrNull { it.symbolCode == symbolCode }
            if (target != null && target.storedCandleCount == 0) {
                syncSingleSymbolUpToNow(symbolCode)
            }
        }
    }

    fun selectProviderForSymbol(symbolCode: String, provider: ProviderId) {
        val (updated, targetTf) = symbolCoordinator.selectProviderForSymbol(_uiState.value.symbols, symbolCode, provider)
        val candles = repository.getCachedOrAggregatedCandles(symbolCode, provider, targetTf)
        val latest = candles.lastOrNull()
        val enriched = updated.map { item ->
            if (item.symbolCode == symbolCode) {
                item.copy(
                    lastClose = latest?.close,
                    lastCandleUtc = latest?.openTimeUtcIso,
                    storedCandleCount = candles.size
                )
            } else {
                item
            }
        }
        repository.saveSymbolCatalog(enriched)
        val newTabId = "${symbolCode}_${provider.id}"
        _uiState.update { state ->
            var nextActiveTabId = state.activeTabId
            val updatedTabs = state.openTabs.map { tab ->
                if (tab.symbolCode == symbolCode) {
                    if (state.activeTabId == tab.tabId) {
                        nextActiveTabId = newTabId
                    }
                    tab.copy(
                        tabId = newTabId,
                        provider = provider,
                        timeframe = targetTf,
                        candles = candles,
                        scrollOffsetFromRight = 0,
                        selectedCandleIndex = null,
                        isLoading = candles.isEmpty(),
                        hasError = false
                    )
                } else {
                    tab
                }
            }
            state.copy(
                symbols = enriched,
                openTabs = updatedTabs,
                activeTabId = nextActiveTabId
            )
        }
        syncSingleSymbolUpToNow(symbolCode)
    }

    /**
     * Updates a tab's candles while preserving the user's current logical viewport position
     * when scrolled back in history (scrollOffsetFromRight > 0).
     */
    private fun applyUpdatedCandlesPreservingViewport(
        tab: ChartTabState,
        newCandles: List<CandleBar>,
        newTimeframe: String = tab.timeframe
    ): ChartTabState {
        val nextOffset = if (tab.timeframe == newTimeframe && tab.scrollOffsetFromRight > 0 && tab.candles.isNotEmpty()) {
            val addedRightCount = (newCandles.size - tab.candles.size).coerceAtLeast(0)
            val maxOff = (newCandles.size - tab.visibleCandleCount).coerceAtLeast(0)
            (tab.scrollOffsetFromRight + addedRightCount).coerceIn(0, maxOff)
        } else {
            0
        }
        return tab.copy(
            timeframe = newTimeframe,
            candles = newCandles,
            scrollOffsetFromRight = nextOffset,
            isLoading = false,
            hasError = newCandles.isEmpty()
        )
    }

    fun syncSingleSymbolUpToNow(symbolCode: String) {
        val target = _uiState.value.symbols.firstOrNull { it.symbolCode == symbolCode } ?: return
        val activeTabTf = _uiState.value.activeTab
            ?.takeIf { it.symbolCode == symbolCode && it.provider == target.activeProvider }
            ?.timeframe ?: target.timeframe

        _uiState.update { state ->
            state.copy(
                symbols = state.symbols.map {
                    if (it.symbolCode == symbolCode) it.copy(isSyncing = true) else it
                },
                openTabs = state.openTabs.map { tab ->
                    if (tab.symbolCode == symbolCode && tab.provider == target.activeProvider) {
                        tab.copy(isLoading = true, hasError = false)
                    } else {
                        tab
                    }
                }
            )
        }

        viewModelScope.launch {
            val (syncedSymbol, mergedCandles) = repository.syncSymbolUpToNow(target, activeTabTf)
            _uiState.update { state ->
                val newSymbols = state.symbols.map {
                    if (it.symbolCode == symbolCode) syncedSymbol else it
                }
                val newTabs = state.openTabs.map { tab ->
                    if (tab.symbolCode == syncedSymbol.symbolCode && tab.provider == syncedSymbol.activeProvider) {
                        applyUpdatedCandlesPreservingViewport(tab, mergedCandles, syncedSymbol.timeframe)
                    } else {
                        tab
                    }
                }
                state.copy(
                    symbols = newSymbols,
                    openTabs = newTabs,
                    statusBannerResId = if (mergedCandles.isNotEmpty()) R.string.status_synced_ok else null
                )
            }
        }
    }

    fun syncAllWatchlistUpToNow() {
        val watchlist = _uiState.value.watchlistSymbols
        if (watchlist.isEmpty()) return
        _uiState.update { state ->
            state.copy(
                isSyncingAll = true,
                symbols = state.symbols.map {
                    if (it.inWatchlist) it.copy(isSyncing = true) else it
                }
            )
        }

        viewModelScope.launch {
            val updatedMap = HashMap<String, SymbolConfig>()
            val candlesBySymbolProvider = HashMap<String, List<CandleBar>>()
            for (symbol in watchlist) {
                val (syncedSymbol, mergedCandles) = repository.syncSymbolUpToNow(symbol, symbol.timeframe)
                updatedMap[symbol.symbolCode] = syncedSymbol
                candlesBySymbolProvider["${syncedSymbol.symbolCode}_${syncedSymbol.activeProvider.id}"] = mergedCandles
            }
            _uiState.update { state ->
                val newSymbols = state.symbols.map { updatedMap[it.symbolCode] ?: it }
                val newTabs = state.openTabs.map { tab ->
                    val refreshed = candlesBySymbolProvider["${tab.symbolCode}_${tab.provider.id}"]
                    if (refreshed != null && tab.timeframe == (updatedMap[tab.symbolCode]?.timeframe ?: tab.timeframe)) {
                        applyUpdatedCandlesPreservingViewport(tab, refreshed)
                    } else {
                        tab
                    }
                }
                state.copy(
                    isSyncingAll = false,
                    symbols = newSymbols,
                    openTabs = newTabs,
                    statusBannerResId = R.string.status_synced_ok
                )
            }
        }
    }

    /**
     * Opens a symbol in Chart View inside its own persistent tab.
     */
    fun openSymbolInChartTab(symbol: SymbolConfig) {
        activateSymbolTab(symbol, targetScreen = WorkspaceScreen.CHART_VIEW)
    }

    /**
     * Switches the active symbol while staying inside the Prediction screen.
     */
    fun selectSymbolInPrediction(symbol: SymbolConfig) {
        activateSymbolTab(symbol, targetScreen = WorkspaceScreen.PREDICTION)
    }

    private fun activateSymbolTab(symbol: SymbolConfig, targetScreen: WorkspaceScreen) {
        repository.saveLastOpenedSymbolCode(symbol.symbolCode)
        val tabId = "${symbol.symbolCode}_${symbol.activeProvider.id}"
        val currentTabs = _uiState.value.openTabs
        val existingTab = currentTabs.firstOrNull { it.tabId == tabId }

        if (existingTab != null) {
            _uiState.update { state ->
                val nextStack = if (state.currentScreen != targetScreen) {
                    (state.screenBackStack + state.currentScreen).takeLast(6)
                } else {
                    state.screenBackStack
                }
                state.copy(
                    activeTabId = tabId,
                    currentScreen = targetScreen,
                    screenBackStack = nextStack
                )
            }
            if (existingTab.candles.isEmpty() && !existingTab.isLoading) {
                syncSingleSymbolUpToNow(symbol.symbolCode)
            }
        } else {
            val cachedCandles = repository.getCachedOrAggregatedCandles(
                symbolCode = symbol.symbolCode,
                provider = symbol.activeProvider,
                timeframe = symbol.timeframe
            )
            val savedDrawings = repository.loadDrawingsForChart(symbol.chartId)
            val newTab = ChartTabState(
                tabId = tabId,
                chartId = symbol.chartId,
                symbolCode = symbol.symbolCode,
                decimals = symbol.decimals,
                provider = symbol.activeProvider,
                timeframe = symbol.timeframe,
                candles = cachedCandles,
                drawings = savedDrawings,
                isLoading = cachedCandles.isEmpty()
            )
            _uiState.update { state ->
                val nextStack = if (state.currentScreen != targetScreen) {
                    (state.screenBackStack + state.currentScreen).takeLast(6)
                } else {
                    state.screenBackStack
                }
                state.copy(
                    openTabs = state.openTabs + newTab,
                    activeTabId = tabId,
                    currentScreen = targetScreen,
                    screenBackStack = nextStack
                )
            }
            if (cachedCandles.isEmpty()) {
                syncSingleSymbolUpToNow(symbol.symbolCode)
            }
        }
    }

    fun selectChartTab(tabId: String) {
        _uiState.update { it.copy(activeTabId = tabId) }
    }

    fun closeChartTab(tabId: String) {
        _uiState.update { state ->
            val remaining = state.openTabs.filterNot { it.tabId == tabId }
            val nextActive = if (state.activeTabId == tabId) {
                remaining.lastOrNull()?.tabId
            } else {
                state.activeTabId
            }
            state.copy(
                openTabs = remaining,
                activeTabId = nextActive
            )
        }
    }

    /**
     * Switches the active tab's timeframe (M15, H1, H4, D1).
     * Immediately displays cached or aggregated candles from lower timeframes so there is zero flicker,
     * and launches a background sync to fetch full historical candles for the selected timeframe.
     */
    fun selectTimeframeForActiveTab(newTimeframe: String) {
        val active = _uiState.value.activeTab ?: return
        val normalizedTf = if (active.provider == ProviderId.EIA_BRENT_SPOT) "D1" else newTimeframe.uppercase()
        if (normalizedTf !in active.allowedTimeframes) return

        val immediateCandles = repository.getCachedOrAggregatedCandles(
            symbolCode = active.symbolCode,
            provider = active.provider,
            timeframe = normalizedTf
        )

        _uiState.update { state ->
            state.copy(
                symbols = state.symbols.map { s ->
                    if (s.symbolCode == active.symbolCode) s.copy(timeframe = normalizedTf) else s
                },
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == active.tabId) {
                        tab.copy(
                            timeframe = normalizedTf,
                            candles = immediateCandles,
                            scrollOffsetFromRight = 0,
                            selectedCandleIndex = null,
                            isLoading = immediateCandles.isEmpty(),
                            hasError = false
                        )
                    } else {
                        tab
                    }
                }
            )
        }
        repository.saveSymbolCatalog(_uiState.value.symbols)

        val targetSymbol = _uiState.value.symbols.firstOrNull { it.symbolCode == active.symbolCode } ?: return
        viewModelScope.launch {
            val (syncedSymbol, mergedCandles) = repository.syncSymbolUpToNow(targetSymbol, normalizedTf)
            _uiState.update { state ->
                state.copy(
                    symbols = state.symbols.map {
                        if (it.symbolCode == syncedSymbol.symbolCode) syncedSymbol else it
                    },
                    openTabs = state.openTabs.map { tab ->
                        if (tab.tabId == active.tabId && tab.timeframe == normalizedTf) {
                            applyUpdatedCandlesPreservingViewport(tab, mergedCandles, normalizedTf)
                        } else {
                            tab
                        }
                    }
                )
            }
        }
    }

    fun selectChartTypeForActiveTab(chartType: ChartType) {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) tab.copy(chartType = chartType) else tab
                }
            )
        }
    }

    fun zoomActiveTab(zoomIn: Boolean) {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        val step = _uiState.value.chartPreferences.zoomStepCandles.coerceIn(2, 32)
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        val delta = if (zoomIn) -step else step
                        val maxCap = max(AppConfig.MIN_VISIBLE_CANDLES, tab.candles.size.coerceAtMost(AppConfig.MAX_VISIBLE_CANDLES))
                        val nextCount = (tab.visibleCandleCount + delta).coerceIn(
                            AppConfig.MIN_VISIBLE_CANDLES,
                            maxCap
                        )
                        val maxOffset = (tab.candles.size - nextCount).coerceAtLeast(0)
                        tab.copy(
                            visibleCandleCount = nextCount,
                            scrollOffsetFromRight = tab.scrollOffsetFromRight.coerceIn(0, maxOffset)
                        )
                    } else {
                        tab
                    }
                }
            )
        }
    }

    fun pinchZoomActiveTab(zoomFactor: Float) {
        if (zoomFactor <= 0f) return
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        // Pinch out (zoomFactor > 1) -> fewer candles visible (zoom in)
                        val scaled = (tab.visibleCandleCount.toFloat() / zoomFactor).roundToInt()
                        val maxCap = max(AppConfig.MIN_VISIBLE_CANDLES, tab.candles.size.coerceAtMost(AppConfig.MAX_VISIBLE_CANDLES))
                        val nextCount = scaled.coerceIn(AppConfig.MIN_VISIBLE_CANDLES, maxCap)
                        val maxOffset = (tab.candles.size - nextCount).coerceAtLeast(0)
                        tab.copy(
                            visibleCandleCount = nextCount,
                            scrollOffsetFromRight = tab.scrollOffsetFromRight.coerceIn(0, maxOffset)
                        )
                    } else {
                        tab
                    }
                }
            )
        }
    }

    fun fitContentOnActiveTab() {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        val fitCount = tab.candles.size.coerceIn(
                            AppConfig.MIN_VISIBLE_CANDLES,
                            AppConfig.MAX_VISIBLE_CANDLES
                        )
                        tab.copy(
                            visibleCandleCount = fitCount,
                            scrollOffsetFromRight = 0,
                            isAutoScaleY = true,
                            yPriceScaleFactor = 1.0f
                        )
                    } else {
                        tab
                    }
                }
            )
        }
    }

    fun panActiveTab(candleDelta: Int) {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        val maxOffset = (tab.candles.size - tab.visibleCandleCount).coerceAtLeast(0)
                        val nextOffset = (tab.scrollOffsetFromRight + candleDelta).coerceIn(0, maxOffset)
                        tab.copy(scrollOffsetFromRight = nextOffset)
                    } else {
                        tab
                    }
                }
            )
        }
    }

    fun resetActiveTabPosition() {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        tab.copy(
                            scrollOffsetFromRight = 0,
                            selectedCandleIndex = null
                        )
                    } else {
                        tab
                    }
                }
            )
        }
    }

    fun scaleYAxisByDrag(verticalDragPx: Float) {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        val deltaScale = verticalDragPx * 0.005f
                        val nextFactor = (tab.yPriceScaleFactor + deltaScale).coerceIn(0.25f, 4.0f)
                        tab.copy(
                            isAutoScaleY = false,
                            yPriceScaleFactor = nextFactor
                        )
                    } else {
                        tab
                    }
                }
            )
        }
    }

    fun resetAutoScaleY() {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        tab.copy(
                            isAutoScaleY = true,
                            yPriceScaleFactor = 1.0f
                        )
                    } else {
                        tab
                    }
                }
            )
        }
    }

    fun selectCandleOnActiveTab(candleIndex: Int?) {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        tab.copy(selectedCandleIndex = candleIndex)
                    } else {
                        tab
                    }
                }
            )
        }
    }

    // --- Drawing Tools Management ---

    fun selectDrawingTool(tool: DrawingTool) {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) drawingCoordinator.selectDrawingTool(tab, tool) else tab
                }
            )
        }
    }

    fun placeDrawingAtCoordinate(timeUtcMillis: Long, price: BigDecimal) {
        val active = _uiState.value.activeTab ?: return
        val updatedTab = drawingCoordinator.placeDrawingAtCoordinate(active, timeUtcMillis, price)
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == active.tabId) updatedTab else tab
                }
            )
        }
    }

    fun selectDrawingOnActiveTab(drawingId: String?) {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) drawingCoordinator.selectDrawing(tab, drawingId) else tab
                }
            )
        }
    }

    fun translateSelectedDrawing(deltaTimeMillis: Long, deltaPrice: BigDecimal) {
        val active = _uiState.value.activeTab ?: return
        val updatedTab = drawingCoordinator.translateSelectedDrawing(active, deltaTimeMillis, deltaPrice)
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == active.tabId) updatedTab else tab
                }
            )
        }
    }

    fun deleteSelectedDrawingOnActiveTab() {
        val active = _uiState.value.activeTab ?: return
        val updatedTab = drawingCoordinator.deleteSelectedDrawing(active)
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == active.tabId) updatedTab else tab
                }
            )
        }
    }

    fun clearAllDrawingsOnActiveTab() {
        val active = _uiState.value.activeTab ?: return
        val updatedTab = drawingCoordinator.clearAllDrawings(active)
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == active.tabId) updatedTab else tab
                }
            )
        }
    }

    fun selectDateRangeForActiveTab(rangeId: String) {
        val active = _uiState.value.activeTab ?: return
        val upperRange = rangeId.uppercase()
        val desiredTf = when (upperRange) {
            "1D" -> "M15"
            "5D", "1W" -> "H1"
            "1M" -> "H4"
            "3M", "6M", "9M", "YTD", "1Y" -> "D1"
            "5Y", "ALL" -> "W1"
            else -> active.timeframe
        }
        val resolvedTf = if (desiredTf in active.allowedTimeframes) desiredTf else active.allowedTimeframes.lastOrNull() ?: active.timeframe
        val autoLogForAll = upperRange == "ALL" && _uiState.value.chartPreferences.logarithmicScaleDefault

        if (resolvedTf != active.timeframe) {
            val immediateCandles = repository.getCachedOrAggregatedCandles(
                symbolCode = active.symbolCode,
                provider = active.provider,
                timeframe = resolvedTf
            )
            val tempTab = active.copy(timeframe = resolvedTf, candles = immediateCandles)
            val preset = tempTab.computeDateRangePresets().firstOrNull { it.id.equals(rangeId, ignoreCase = true) }
            val targetBars = preset?.targetBars ?: AppConfig.DEFAULT_VISIBLE_CANDLES

            _uiState.update { state ->
                state.copy(
                    symbols = state.symbols.map { s ->
                        if (s.symbolCode == active.symbolCode) s.copy(timeframe = resolvedTf) else s
                    },
                    openTabs = state.openTabs.map { tab ->
                        if (tab.tabId == active.tabId) {
                            tab.copy(
                                timeframe = resolvedTf,
                                candles = immediateCandles,
                                activeDateRange = preset?.id ?: rangeId,
                                visibleCandleCount = targetBars,
                                scrollOffsetFromRight = 0,
                                isAutoScaleY = true,
                                isLogScale = if (autoLogForAll) true else tab.isLogScale,
                                yPriceScaleFactor = 1.0f
                            )
                        } else {
                            tab
                        }
                    }
                )
            }
            repository.saveSymbolCatalog(_uiState.value.symbols)
            val targetSymbol = _uiState.value.symbols.firstOrNull { it.symbolCode == active.symbolCode } ?: return
            viewModelScope.launch {
                val (syncedSymbol, mergedCandles) = repository.syncSymbolUpToNow(targetSymbol, resolvedTf)
                _uiState.update { state ->
                    state.copy(
                        symbols = state.symbols.map {
                            if (it.symbolCode == syncedSymbol.symbolCode) syncedSymbol else it
                        },
                        openTabs = state.openTabs.map { tab ->
                            if (tab.tabId == active.tabId && tab.timeframe == resolvedTf) {
                                val updated = applyUpdatedCandlesPreservingViewport(tab, mergedCandles, resolvedTf)
                                val refreshedPreset = updated.computeDateRangePresets().firstOrNull { it.id.equals(rangeId, ignoreCase = true) }
                                updated.copy(
                                    activeDateRange = refreshedPreset?.id ?: rangeId,
                                    visibleCandleCount = refreshedPreset?.targetBars ?: updated.visibleCandleCount
                                )
                            } else {
                                tab
                            }
                        }
                    )
                }
            }
            return
        }

        val preset = active.computeDateRangePresets().firstOrNull { it.id.equals(rangeId, ignoreCase = true) } ?: return
        if (!preset.enabled) return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == active.tabId) {
                        tab.copy(
                            activeDateRange = preset.id,
                            visibleCandleCount = preset.targetBars,
                            scrollOffsetFromRight = 0,
                            isAutoScaleY = true,
                            isLogScale = if (autoLogForAll) true else tab.isLogScale,
                            yPriceScaleFactor = 1.0f
                        )
                    } else {
                        tab
                    }
                }
            )
        }
    }

    fun toggleVolumeOnActiveTab() {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) tab.copy(showVolume = !tab.showVolume) else tab
                }
            )
        }
    }

    fun cycleVolumePaneHeightOnActiveTab() {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        val nextRatio = when {
                            tab.volumePaneRatio < 0.19f -> 0.22f
                            tab.volumePaneRatio < 0.26f -> 0.30f
                            else -> 0.16f
                        }
                        tab.copy(
                            showVolume = true,
                            volumePaneRatio = nextRatio
                        )
                    } else {
                        tab
                    }
                }
            )
        }
    }

    fun toggleSma20OnActiveTab() {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) tab.copy(showSma20 = !tab.showSma20) else tab
                }
            )
        }
    }

    fun toggleEma50OnActiveTab() {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) tab.copy(showEma50 = !tab.showEma50) else tab
                }
            )
        }
    }

    fun toggleBollingerOnActiveTab() {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) tab.copy(showBollinger = !tab.showBollinger) else tab
                }
            )
        }
    }

    fun setDrawingColorOnActiveTab(colorHex: String) {
        val active = _uiState.value.activeTab ?: return
        val updatedTab = drawingCoordinator.updateActiveDrawingColor(active, colorHex)
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == active.tabId) updatedTab else tab
                }
            )
        }
    }

    fun setDrawingWidthOnActiveTab(widthDp: Float) {
        val active = _uiState.value.activeTab ?: return
        val updatedTab = drawingCoordinator.updateActiveDrawingWidth(active, widthDp)
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == active.tabId) updatedTab else tab
                }
            )
        }
    }

    fun toggleDrawingDockOnActiveTab() {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        tab.copy(isDrawingDockCollapsed = !tab.isDrawingDockCollapsed)
                    } else {
                        tab
                    }
                }
            )
        }
    }

    // --- Dynamic Symbol & Preference Management (Anti-Hardcoding) ---

    fun addCustomSymbol(symbolCode: String, customTitle: String, decimals: Int, provider: ProviderId) {
        val cleanCode = symbolCode.trim().uppercase()
        val updated = symbolCoordinator.addCustomSymbol(
            _uiState.value.symbols,
            cleanCode,
            customTitle,
            decimals,
            provider
        )
        if (updated != _uiState.value.symbols) {
            _uiState.update { it.copy(symbols = updated) }
            syncSingleSymbolUpToNow(cleanCode)
        }
    }

    fun deleteSymbol(symbolCode: String) {
        val updated = symbolCoordinator.deleteSymbol(_uiState.value.symbols, symbolCode)
        val updatedTabs = _uiState.value.openTabs.filterNot { it.symbolCode == symbolCode }
        _uiState.update { state ->
            state.copy(
                symbols = updated,
                openTabs = updatedTabs,
                activeTabId = if (state.activeTabId?.startsWith(symbolCode) == true) updatedTabs.lastOrNull()?.tabId else state.activeTabId
            )
        }
    }

    fun toggleLogScaleOnActiveTab() {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) tab.copy(isLogScale = !tab.isLogScale) else tab
                }
            )
        }
    }

    fun projectScenarioLevelsToChart(
        pivot: BigDecimal,
        r1: BigDecimal,
        r2: BigDecimal,
        s1: BigDecimal,
        s2: BigDecimal
    ) {
        val active = _uiState.value.activeTab ?: return
        val nonProjected = active.drawings.filterNot { it.id.startsWith("proj_") }
        val projected = listOf(
            es.manico.chartintelligence.data.model.ChartDrawing.HorizontalLine(
                id = "proj_pivot",
                price = pivot,
                colorHex = "FF2962FF",
                strokeWidthDp = 2.0f
            ),
            es.manico.chartintelligence.data.model.ChartDrawing.HorizontalLine(
                id = "proj_r1",
                price = r1,
                colorHex = "FF26A69A",
                strokeWidthDp = 1.8f
            ),
            es.manico.chartintelligence.data.model.ChartDrawing.HorizontalLine(
                id = "proj_r2",
                price = r2,
                colorHex = "FF26A69A",
                strokeWidthDp = 2.2f
            ),
            es.manico.chartintelligence.data.model.ChartDrawing.HorizontalLine(
                id = "proj_s1",
                price = s1,
                colorHex = "FFEF5350",
                strokeWidthDp = 1.8f
            ),
            es.manico.chartintelligence.data.model.ChartDrawing.HorizontalLine(
                id = "proj_s2",
                price = s2,
                colorHex = "FFEF5350",
                strokeWidthDp = 2.2f
            )
        )
        val mergedDrawings = nonProjected + projected
        repository.saveDrawingsForChart(active.chartId, mergedDrawings)
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == active.tabId) tab.copy(drawings = mergedDrawings) else tab
                },
                currentScreen = WorkspaceScreen.CHART_VIEW,
                statusBannerResId = R.string.prediction_levels_projected
            )
        }
    }

    fun updateTradingViewPreference(transform: (ChartPreferences) -> ChartPreferences) {
        val next = preferenceCoordinator.updateTradingViewPreference(_uiState.value.chartPreferences, transform)
        _uiState.update { it.copy(chartPreferences = next) }
    }

    fun updateBullCandleColor(colorHex: String) {
        val next = preferenceCoordinator.updateBullCandleColor(_uiState.value.chartPreferences, colorHex)
        _uiState.update { it.copy(chartPreferences = next) }
    }

    fun updateBearCandleColor(colorHex: String) {
        val next = preferenceCoordinator.updateBearCandleColor(_uiState.value.chartPreferences, colorHex)
        _uiState.update { it.copy(chartPreferences = next) }
    }

    fun updateTrendLineColor(colorHex: String) {
        val next = preferenceCoordinator.updateTrendLineColor(_uiState.value.chartPreferences, colorHex)
        _uiState.update { it.copy(chartPreferences = next) }
    }

    fun updateHorizontalLineColor(colorHex: String) {
        val next = preferenceCoordinator.updateHorizontalLineColor(_uiState.value.chartPreferences, colorHex)
        _uiState.update { it.copy(chartPreferences = next) }
    }

    fun updateVerticalLineColor(colorHex: String) {
        val next = preferenceCoordinator.updateVerticalLineColor(_uiState.value.chartPreferences, colorHex)
        _uiState.update { it.copy(chartPreferences = next) }
    }

    fun updateAlgorithmParams(fetchLimit: Int, zoomStep: Int, touchTolerance: Float) {
        val next = preferenceCoordinator.updateAlgorithmParams(_uiState.value.chartPreferences, fetchLimit, zoomStep, touchTolerance)
        _uiState.update { it.copy(chartPreferences = next) }
    }

    fun resetChartColorsToDefault() {
        val next = preferenceCoordinator.resetChartColorsToDefault(_uiState.value.chartPreferences)
        _uiState.update { it.copy(chartPreferences = next) }
    }

    fun resetAlgorithmParamsToDefault() {
        val next = preferenceCoordinator.resetAlgorithmParamsToDefault(_uiState.value.chartPreferences)
        _uiState.update { it.copy(chartPreferences = next) }
    }
}
