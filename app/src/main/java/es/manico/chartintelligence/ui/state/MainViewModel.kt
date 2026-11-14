package es.manico.chartintelligence.ui.state

import android.app.Application
import android.net.Uri
import android.provider.OpenableColumns
import androidx.annotation.StringRes
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.CandleExportAlgorithm
import es.manico.chartintelligence.algorithms.CandleImportAlgorithm
import es.manico.chartintelligence.algorithms.ConnectionStatus
import es.manico.chartintelligence.algorithms.GapDetectorAlgorithm
import es.manico.chartintelligence.algorithms.GapReport
import es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm
import es.manico.chartintelligence.config.AppConfig
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartPreferences
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.ChartType
import es.manico.chartintelligence.data.model.DrawingTool
import es.manico.chartintelligence.data.model.ProviderId
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.data.repository.BackupExportHelper
import es.manico.chartintelligence.data.repository.ImportBatchDto
import es.manico.chartintelligence.data.repository.SymbolIntelBundle
import es.manico.chartintelligence.data.repository.SymbolIntelRepository
import es.manico.chartintelligence.data.repository.WorkspaceRepository
import es.manico.chartintelligence.i18n.AppLanguage
import es.manico.chartintelligence.ui.state.coordinators.ChartDrawingCoordinator
import es.manico.chartintelligence.ui.state.coordinators.ChartPreferenceCoordinator
import es.manico.chartintelligence.ui.state.coordinators.SymbolCatalogCoordinator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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
    val systemStatus: es.manico.chartintelligence.data.repository.SystemStatusDto? = null,
    val isWorkspaceSyncing: Boolean = false,
    val lastWorkspaceSyncedAt: String? = null,
    val symbolIntelByCode: Map<String, SymbolIntelBundle> = emptyMap(),
    val isIntelLoading: Boolean = false,
    val backupStatusMessage: String? = null,
    val importBatches: List<ImportBatchDto> = emptyList(),
    val importStatusMessage: String? = null,
    val activeGapAuditReport: GapReport? = null,
    val forecastLocalLedger: List<es.manico.chartintelligence.forecast.ForecastLedgerEntry> = emptyList(),
    val forecastServerLedger: List<es.manico.chartintelligence.forecast.ForecastLedgerEntry> = emptyList(),
    val forecastLedgerVerifyResult: es.manico.chartintelligence.forecast.LedgerVerifyResult = es.manico.chartintelligence.forecast.LedgerVerifyResult(true, 0, -1, "Empty ledger"),
    @param:StringRes val statusBannerResId: Int? = null
) {
    val watchlistSymbols: List<SymbolConfig>
        get() = symbols.filter { it.inWatchlist }

    val activeTab: ChartTabState?
        get() = openTabs.firstOrNull { it.tabId == activeTabId } ?: openTabs.firstOrNull()
}

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = WorkspaceRepository(application)
    private val backupHelper = BackupExportHelper(application, repository.getHttpClient(), repository)
    private val intelRepository = SymbolIntelRepository(repository.getHttpClient())
    private val drawingCoordinator = ChartDrawingCoordinator(repository)
    private val symbolCoordinator = SymbolCatalogCoordinator(repository)
    private val preferenceCoordinator = ChartPreferenceCoordinator(repository)
    private val forecastLedgerStore = es.manico.chartintelligence.forecast.ForecastLedgerStore(repository.getForecastLedgerPrefs())

    private val initialOpenTabs = repository.loadSavedOpenTabs()
    private val initialActiveTabId = repository.loadActiveTabId()
        ?.takeIf { savedId -> initialOpenTabs.any { it.tabId == savedId } }
        ?: initialOpenTabs.firstOrNull()?.tabId
    private val initialLocalForecastLedger = forecastLedgerStore.loadEntries()

    private val _uiState = MutableStateFlow(
        Phase1UiState(
            language = repository.loadLanguage(),
            isDarkTheme = repository.loadDarkTheme(),
            isOwnerRegistered = repository.isOwnerAccountRegistered(),
            isAuthenticated = repository.isSessionAuthenticated(),
            ownerUsername = repository.getOwnerUsername(),
            ownerEmail = repository.getOwnerEmail(),
            rememberCredentials = repository.loadRememberCredentials(),
            symbols = symbolCoordinator.loadInitialCatalog(),
            chartPreferences = preferenceCoordinator.loadInitialPreferences(),
            openTabs = initialOpenTabs,
            activeTabId = initialActiveTabId,
            forecastLocalLedger = initialLocalForecastLedger,
            forecastLedgerVerifyResult = forecastLedgerStore.verifyChain(initialLocalForecastLedger)
        )
    )
    val uiState: StateFlow<Phase1UiState> = _uiState.asStateFlow()

    private var autoSyncJob: kotlinx.coroutines.Job? = null
    private val lastAutoSyncAtMs = java.util.concurrent.ConcurrentHashMap<String, Long>()

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
            if (_uiState.value.isAuthenticated && repository.getSessionToken().isNotBlank()) {
                val valid = repository.validateSessionWithServer()
                if (valid == false) {
                    _uiState.update {
                        it.copy(
                            isAuthenticated = false,
                            authMode = AuthScreenMode.LOGIN
                        )
                    }
                }
            }
            val status = repository.fetchSystemStatus()
            val batches = repository.fetchImportBatches()
            _uiState.update { it.copy(systemStatus = status, importBatches = batches) }
            if (_uiState.value.isAuthenticated) {
                pullAndApplyCloudWorkspaceOnStartup()
            }
        }

        // Proactively fetch real market data for watchlist symbols that have an empty cache
        val uncachedWatchlist = _uiState.value.watchlistSymbols.filter { it.storedCandleCount == 0 }
        if (uncachedWatchlist.isNotEmpty()) {
            syncAllWatchlistUpToNow()
        }

        // Timeframe-aware periodic sync loop near bar close when chart is active and market is open
        viewModelScope.launch {
            while (true) {
                val snapshot = _uiState.value
                val activeTab = snapshot.activeTab
                if (!snapshot.isAuthenticated || snapshot.currentScreen != WorkspaceScreen.CHART_VIEW || activeTab == null) {
                    delay(10_000L)
                    continue
                }
                val nowMs = System.currentTimeMillis()
                if (!UtcTimeAnchorAlgorithm.isMarketOpen(nowMs, activeTab.symbolCode)) {
                    delay(30_000L)
                    continue
                }
                val stepMs = UtcTimeAnchorAlgorithm.timeframeStepMillis(activeTab.timeframe)
                val openMs = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(nowMs, activeTab.timeframe)
                val closePlusMarginMs = openMs + stepMs + 2_000L
                val waitMs = (closePlusMarginMs - nowMs).coerceIn(5_000L, 60_000L)
                delay(waitMs)

                val latestState = _uiState.value
                val tabNow = latestState.activeTab ?: continue
                if (!latestState.isAuthenticated ||
                    latestState.currentScreen != WorkspaceScreen.CHART_VIEW ||
                    tabNow.tabId != activeTab.tabId ||
                    tabNow.isLoading
                ) {
                    continue
                }
                val nowAfterWait = System.currentTimeMillis()
                if (!UtcTimeAnchorAlgorithm.isMarketOpen(nowAfterWait, tabNow.symbolCode)) continue

                val syncKey = "${tabNow.tabId}_${tabNow.timeframe}"
                val prevAuto = lastAutoSyncAtMs[syncKey] ?: 0L
                val minIntervalMs = if (tabNow.timeframe.uppercase() in listOf("D1", "W1")) 60_000L else 15_000L
                if (nowAfterWait - prevAuto >= minIntervalMs) {
                    lastAutoSyncAtMs[syncKey] = nowAfterWait
                    performSingleSymbolSync(tabNow.symbolCode, quiet = true)
                }
            }
        }

        // ENG-02: Non-intrusive 15s read-only forming quote tick polling when chart is open
        viewModelScope.launch {
            while (true) {
                delay(15_000L)
                val snapshot = _uiState.value
                val activeTab = snapshot.activeTab
                if (!snapshot.isAuthenticated ||
                    snapshot.currentScreen != WorkspaceScreen.CHART_VIEW ||
                    activeTab == null ||
                    activeTab.candles.isEmpty() ||
                    !UtcTimeAnchorAlgorithm.isMarketOpen(System.currentTimeMillis(), activeTab.symbolCode)
                ) {
                    continue
                }
                val quote = repository.fetchLiveQuote(
                    symbolCode = activeTab.symbolCode,
                    provider = activeTab.provider,
                    timeframe = activeTab.timeframe
                ) ?: continue
                _uiState.update { st ->
                    st.copy(
                        openTabs = st.openTabs.map { tab ->
                            if (tab.tabId == activeTab.tabId) {
                                tab.copy(
                                    liveQuotePrice = quote.price,
                                    liveQuoteMode = quote.mode,
                                    formingBar = quote.formingBar
                                )
                            } else {
                                tab
                            }
                        }
                    )
                }
            }
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
            it.copy(rememberCredentials = remember)
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
        if (password.length < 8) {
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
                authMode = AuthScreenMode.LOGIN,
                authErrorResId = null,
                authInfoResId = null,
                currentScreen = WorkspaceScreen.WATCHLIST
            )
        }
        viewModelScope.launch {
            repository.registerOwnerOnServer(cleanUser, cleanEmail, password)
            pullAndApplyCloudWorkspaceOnStartup()
        }
    }

    fun signInOwner(username: String, password: String) {
        val cleanUser = username.trim()
        if (cleanUser.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(authErrorResId = R.string.error_empty_credentials) }
            return
        }
        val shouldRemember = _uiState.value.rememberCredentials
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
                    authMode = AuthScreenMode.LOGIN,
                    authErrorResId = null,
                    authInfoResId = null,
                    currentScreen = WorkspaceScreen.WATCHLIST
                )
            }
            pullAndApplyCloudWorkspaceOnStartup()
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
        if (newPassword.length < 8) {
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
        viewModelScope.launch {
            repository.logoutOwnerOnServer()
        }
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
        if (newPassword.length < 8) {
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
        scheduleDebouncedCloudSync()
        if (enabled) {
            val target = updated.firstOrNull { it.symbolCode == symbolCode }
            if (target != null && target.storedCandleCount == 0) {
                syncSingleSymbolUpToNow(symbolCode)
            }
        }
    }

    fun reorderSymbol(symbolCode: String, direction: Int) {
        val currentList = _uiState.value.symbols.toMutableList()
        val currentIndex = currentList.indexOfFirst { it.symbolCode == symbolCode }
        if (currentIndex < 0) return
        val targetIndex = if (direction < 0) currentIndex - 1 else currentIndex + 1
        if (targetIndex in currentList.indices) {
            val item = currentList.removeAt(currentIndex)
            currentList.add(targetIndex, item)
            _uiState.update { it.copy(symbols = currentList) }
            repository.saveSymbolCatalog(currentList)
            scheduleDebouncedCloudSync()
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
        val canonicalChartId = UtcTimeAnchorAlgorithm.canonicalChartKey(symbolCode, targetTf)
        val legacyChartId = enriched.firstOrNull { it.symbolCode == symbolCode }?.chartId
            ?: UtcTimeAnchorAlgorithm.legacyChartId(symbolCode)
        val reloadedDrawings = repository.loadDrawingsForChart(canonicalChartId, legacyChartId)
        val stepMs = UtcTimeAnchorAlgorithm.timeframeStepMillis(targetTf)
        val lastCloseMs = latest?.let { it.openTimeUtcMillis + stepMs } ?: 0L
        var persistedActiveId: String? = null
        _uiState.update { state ->
            var nextActiveTabId = state.activeTabId
            val updatedTabs = state.openTabs.map { tab ->
                if (tab.symbolCode == symbolCode) {
                    if (state.activeTabId == tab.tabId) {
                        nextActiveTabId = newTabId
                    }
                    tab.copy(
                        tabId = newTabId,
                        chartId = canonicalChartId,
                        provider = provider,
                        timeframe = targetTf,
                        candles = candles,
                        drawings = reloadedDrawings,
                        selectedDrawingId = null,
                        pendingTrendPoint = null,
                        pendingAnchors = emptyList(),
                        scrollOffsetFromRight = 0,
                        selectedCandleIndex = null,
                        isLoading = candles.isEmpty(),
                        hasError = false,
                        providerStatus = if (provider == ProviderId.TWELVE_DATA &&
                            state.chartPreferences.twelveDataApiKey.isBlank() &&
                            candles.isEmpty()
                        ) {
                            "API_KEY_REQUIRED"
                        } else {
                            "READY"
                        },
                        lastCandleCloseMs = lastCloseMs
                    )
                } else {
                    tab
                }
            }
            persistedActiveId = nextActiveTabId
            state.copy(
                symbols = enriched,
                openTabs = updatedTabs,
                activeTabId = nextActiveTabId
            )
        }
        repository.saveActiveTabId(persistedActiveId)
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
        syncSingleSymbolUpToNow(symbolCode)
    }

    /**
     * Updates a tab's candles while preserving the user's current logical viewport position
     * when scrolled back in history (scrollOffsetFromRight > 0), and propagates honest
     * connectivity/freshness telemetry without masking errors or offline cache hits.
     */
    private fun applyUpdatedCandlesPreservingViewport(
        tab: ChartTabState,
        newCandles: List<CandleBar>,
        newTimeframe: String = tab.timeframe,
        providerStatus: String = tab.providerStatus,
        connectionStatus: ConnectionStatus = if (newCandles.isNotEmpty()) ConnectionStatus.CONNECTED_LIVE else ConnectionStatus.SYNC_ERROR,
        syncErrorText: String? = null,
        lastSuccessfulFetchMs: Long = tab.lastSuccessfulFetchMs,
        lastCandleCloseMs: Long = tab.lastCandleCloseMs,
        sessionPrevClose: BigDecimal? = tab.sessionPrevClose,
        gapSummary: es.manico.chartintelligence.algorithms.GapReport? = tab.gapSummary
    ): ChartTabState {
        val nextOffset = if (tab.timeframe == newTimeframe && tab.scrollOffsetFromRight > 0 && tab.candles.isNotEmpty()) {
            val addedRightCount = (newCandles.size - tab.candles.size).coerceAtLeast(0)
            val maxOff = (newCandles.size - tab.visibleCandleCount).coerceAtLeast(0)
            (tab.scrollOffsetFromRight + addedRightCount).coerceIn(0, maxOff)
        } else {
            0
        }
        val stepMs = UtcTimeAnchorAlgorithm.timeframeStepMillis(newTimeframe)
        val computedCloseMs = newCandles.lastOrNull()?.let { it.openTimeUtcMillis + stepMs } ?: lastCandleCloseMs
        val isSyncFailure = connectionStatus == ConnectionStatus.SYNC_ERROR ||
            connectionStatus == ConnectionStatus.CACHED_OFFLINE ||
            providerStatus == "API_KEY_REQUIRED"
        return tab.copy(
            timeframe = newTimeframe,
            candles = newCandles,
            scrollOffsetFromRight = nextOffset,
            isLoading = false,
            hasError = if (newCandles.isEmpty()) true else (connectionStatus == ConnectionStatus.SYNC_ERROR),
            providerStatus = if (isSyncFailure || newCandles.isEmpty()) providerStatus else "READY",
            connectionStatus = connectionStatus,
            syncErrorText = syncErrorText,
            lastSuccessfulFetchMs = lastSuccessfulFetchMs,
            lastCandleCloseMs = computedCloseMs,
            sessionPrevClose = sessionPrevClose ?: tab.sessionPrevClose,
            gapSummary = gapSummary
        )
    }

    fun syncSingleSymbolUpToNow(symbolCode: String) {
        performSingleSymbolSync(symbolCode, quiet = false)
    }

    private fun performSingleSymbolSync(symbolCode: String, quiet: Boolean) {
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
                        tab.copy(
                            isLoading = tab.candles.isEmpty(),
                            hasError = false,
                            connectionStatus = ConnectionStatus.SYNCING
                        )
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
                        applyUpdatedCandlesPreservingViewport(
                            tab = tab,
                            newCandles = mergedCandles,
                            newTimeframe = syncedSymbol.timeframe,
                            providerStatus = syncedSymbol.providerStatus,
                            connectionStatus = syncedSymbol.connectionStatus,
                            syncErrorText = syncedSymbol.syncErrorText,
                            lastSuccessfulFetchMs = syncedSymbol.lastSuccessfulFetchMs,
                            lastCandleCloseMs = syncedSymbol.lastCandleCloseMs,
                            sessionPrevClose = syncedSymbol.prevClose,
                            gapSummary = syncedSymbol.gapSummary
                        )
                    } else {
                        tab
                    }
                }
                val banner = when {
                    quiet -> state.statusBannerResId
                    syncedSymbol.connectionStatus == ConnectionStatus.SYNC_ERROR ||
                        syncedSymbol.connectionStatus == ConnectionStatus.CACHED_OFFLINE -> null
                    mergedCandles.isNotEmpty() -> R.string.status_synced_ok
                    else -> null
                }
                state.copy(
                    symbols = newSymbols,
                    openTabs = newTabs,
                    statusBannerResId = banner
                )
            }
            repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
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
            for (batch in watchlist.chunked(4)) {
                val batchResults = coroutineScope {
                    batch.map { symbol ->
                        async { repository.syncSymbolUpToNow(symbol, symbol.timeframe) }
                    }.awaitAll()
                }
                for ((syncedSymbol, mergedCandles) in batchResults) {
                    updatedMap[syncedSymbol.symbolCode] = syncedSymbol
                    candlesBySymbolProvider["${syncedSymbol.symbolCode}_${syncedSymbol.activeProvider.id}"] = mergedCandles
                }
            }
            _uiState.update { state ->
                val newSymbols = state.symbols.map { updatedMap[it.symbolCode] ?: it }
                val newTabs = state.openTabs.map { tab ->
                    val syncedSym = updatedMap[tab.symbolCode]
                    val refreshed = candlesBySymbolProvider["${tab.symbolCode}_${tab.provider.id}"]
                    if (syncedSym != null && refreshed != null && tab.timeframe == syncedSym.timeframe) {
                        applyUpdatedCandlesPreservingViewport(
                            tab = tab,
                            newCandles = refreshed,
                            newTimeframe = tab.timeframe,
                            providerStatus = syncedSym.providerStatus,
                            connectionStatus = syncedSym.connectionStatus,
                            syncErrorText = syncedSym.syncErrorText,
                            lastSuccessfulFetchMs = syncedSym.lastSuccessfulFetchMs,
                            lastCandleCloseMs = syncedSym.lastCandleCloseMs,
                            sessionPrevClose = syncedSym.prevClose,
                            gapSummary = syncedSym.gapSummary
                        )
                    } else {
                        tab
                    }
                }
                val anyHealthySync = updatedMap.values.any {
                    it.connectionStatus == ConnectionStatus.CONNECTED_LIVE ||
                        it.connectionStatus == ConnectionStatus.MARKET_CLOSED
                }
                state.copy(
                    isSyncingAll = false,
                    symbols = newSymbols,
                    openTabs = newTabs,
                    statusBannerResId = if (anyHealthySync) R.string.status_synced_ok else null
                )
            }
            repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
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
            val curActive = _uiState.value.activeTab
            _uiState.update { state ->
                val nextStack = if (state.currentScreen != targetScreen) {
                    (state.screenBackStack + state.currentScreen).takeLast(6)
                } else {
                    state.screenBackStack
                }
                val updatedTabs = if (curActive != null) {
                    state.openTabs.map { tab ->
                        tab.copy(
                            showVolume = curActive.showVolume,
                            volumePaneRatio = curActive.volumePaneRatio,
                            showSma20 = curActive.showSma20,
                            showSma50 = curActive.showSma50,
                            showSma200 = curActive.showSma200,
                            showEma20 = curActive.showEma20,
                            showEma50 = curActive.showEma50,
                            showEma200 = curActive.showEma200,
                            showSupertrend = curActive.showSupertrend,
                            showVwap = curActive.showVwap,
                            showBollinger = curActive.showBollinger,
                            showPsar = curActive.showPsar,
                            showIchimoku = curActive.showIchimoku,
                            showKeltner = curActive.showKeltner,
                            showDonchian = curActive.showDonchian,
                            showMtfEma = curActive.showMtfEma,
                            showKillzones = curActive.showKillzones,
                            showOverlayMacd = curActive.showOverlayMacd,
                            showRsi14 = curActive.showRsi14,
                            showMacd = curActive.showMacd,
                            showAtr14 = curActive.showAtr14,
                            showAdx14 = curActive.showAdx14,
                            showStoch14 = curActive.showStoch14,
                            showCci20 = curActive.showCci20,
                            showWillR14 = curActive.showWillR14,
                            showObv = curActive.showObv,
                            showCmf20 = curActive.showCmf20,
                            showRoc12 = curActive.showRoc12,
                            showSmcStructure = curActive.showSmcStructure,
                            showFvg = curActive.showFvg,
                            showVolumeProfile = curActive.showVolumeProfile,
                            showPivotPoints = curActive.showPivotPoints,
                            showFutureProjection = curActive.showFutureProjection,
                            pitchforkVariant = curActive.pitchforkVariant
                        )
                    }
                } else {
                    state.openTabs
                }
                state.copy(
                    openTabs = updatedTabs,
                    activeTabId = tabId,
                    currentScreen = targetScreen,
                    screenBackStack = nextStack
                )
            }
            repository.saveActiveTabId(tabId)
            repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
            if (existingTab.candles.isEmpty() && !existingTab.isLoading) {
                syncSingleSymbolUpToNow(symbol.symbolCode)
            }
        } else {
            val cachedCandles = repository.getCachedOrAggregatedCandles(
                symbolCode = symbol.symbolCode,
                provider = symbol.activeProvider,
                timeframe = symbol.timeframe
            )
            val canonicalChartId = UtcTimeAnchorAlgorithm.canonicalChartKey(symbol.symbolCode, symbol.timeframe)
            val savedDrawings = repository.loadDrawingsForChart(canonicalChartId, symbol.chartId)
            val curPrefs = _uiState.value.chartPreferences
            val curActive = _uiState.value.activeTab
            val stepMs = UtcTimeAnchorAlgorithm.timeframeStepMillis(symbol.timeframe)
            val lastCloseMs = cachedCandles.lastOrNull()?.let { it.openTimeUtcMillis + stepMs } ?: symbol.lastCandleCloseMs
            val newTab = ChartTabState(
                tabId = tabId,
                chartId = canonicalChartId,
                symbolCode = symbol.symbolCode,
                decimals = symbol.decimals,
                provider = symbol.activeProvider,
                timeframe = symbol.timeframe,
                candles = cachedCandles,
                chartType = curActive?.chartType ?: ChartType.CANDLESTICK,
                showVolume = curActive?.showVolume ?: true,
                volumePaneRatio = curActive?.volumePaneRatio ?: 0.22f,
                showSma20 = curActive?.showSma20 ?: false,
                showSma50 = curActive?.showSma50 ?: false,
                showSma200 = curActive?.showSma200 ?: false,
                showEma20 = curActive?.showEma20 ?: false,
                showEma50 = curActive?.showEma50 ?: false,
                showEma200 = curActive?.showEma200 ?: false,
                showSupertrend = curActive?.showSupertrend ?: false,
                showVwap = curActive?.showVwap ?: false,
                showBollinger = curActive?.showBollinger ?: false,
                showPsar = curActive?.showPsar ?: false,
                showIchimoku = curActive?.showIchimoku ?: false,
                showKeltner = curActive?.showKeltner ?: false,
                showDonchian = curActive?.showDonchian ?: false,
                showMtfEma = curActive?.showMtfEma ?: false,
                showKillzones = curActive?.showKillzones ?: false,
                showOverlayMacd = curActive?.showOverlayMacd ?: false,
                showRsi14 = curActive?.showRsi14 ?: false,
                showMacd = curActive?.showMacd ?: false,
                showAtr14 = curActive?.showAtr14 ?: false,
                showAdx14 = curActive?.showAdx14 ?: false,
                showStoch14 = curActive?.showStoch14 ?: false,
                showCci20 = curActive?.showCci20 ?: false,
                showWillR14 = curActive?.showWillR14 ?: false,
                showObv = curActive?.showObv ?: false,
                showCmf20 = curActive?.showCmf20 ?: false,
                showRoc12 = curActive?.showRoc12 ?: false,
                showSmcStructure = curActive?.showSmcStructure ?: false,
                showFvg = curActive?.showFvg ?: false,
                showVolumeProfile = curActive?.showVolumeProfile ?: false,
                showPivotPoints = curActive?.showPivotPoints ?: false,
                showFutureProjection = curActive?.showFutureProjection ?: false,
                pitchforkVariant = curActive?.pitchforkVariant ?: "original",
                isMagnetMode = curActive?.isMagnetMode ?: false,
                activeDrawingColorHex = curActive?.activeDrawingColorHex ?: curPrefs.defaultDrawingColorHex,
                activeDrawingWidthDp = curActive?.activeDrawingWidthDp ?: curPrefs.defaultDrawingWidthDp,
                drawings = savedDrawings,
                isLoading = cachedCandles.isEmpty(),
                providerStatus = symbol.providerStatus,
                syncErrorText = symbol.syncErrorText,
                lastSuccessfulFetchMs = symbol.lastSuccessfulFetchMs,
                lastCandleCloseMs = lastCloseMs,
                connectionStatus = symbol.connectionStatus,
                sessionPrevClose = symbol.prevClose,
                gapSummary = symbol.gapSummary
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
            repository.saveActiveTabId(tabId)
            repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
            if (cachedCandles.isEmpty()) {
                syncSingleSymbolUpToNow(symbol.symbolCode)
            }
        }
    }

    fun selectChartTab(tabId: String) {
        _uiState.update { it.copy(activeTabId = tabId) }
        repository.saveActiveTabId(tabId)
        scheduleDebouncedCloudSync()
    }

    fun closeChartTab(tabId: String) {
        var nextActiveId: String? = null
        _uiState.update { state ->
            val remaining = state.openTabs.filterNot { it.tabId == tabId }
            val nextActive = if (state.activeTabId == tabId) {
                remaining.lastOrNull()?.tabId
            } else {
                state.activeTabId
            }
            nextActiveId = nextActive
            state.copy(
                openTabs = remaining,
                activeTabId = nextActive
            )
        }
        repository.saveActiveTabId(nextActiveId)
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    /**
     * Switches the active tab's timeframe (M15, H1, H4, D1, W1).
     * Immediately displays cached or aggregated candles from lower timeframes so there is zero flicker,
     * switches drawings cleanly to canonical `SYMBOL_TIMEFRAME` storage,
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
        val canonicalChartId = UtcTimeAnchorAlgorithm.canonicalChartKey(active.symbolCode, normalizedTf)
        val legacyChartId = _uiState.value.symbols.firstOrNull { it.symbolCode == active.symbolCode }?.chartId
            ?: UtcTimeAnchorAlgorithm.legacyChartId(active.symbolCode)
        val tfDrawings = repository.loadDrawingsForChart(canonicalChartId, legacyChartId)

        _uiState.update { state ->
            state.copy(
                symbols = state.symbols.map { s ->
                    if (s.symbolCode == active.symbolCode) s.copy(timeframe = normalizedTf) else s
                },
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == active.tabId) {
                        val nextVisible = if (immediateCandles.isNotEmpty()) {
                            tab.visibleCandleCount.coerceIn(
                                AppConfig.MIN_VISIBLE_CANDLES,
                                max(AppConfig.MIN_VISIBLE_CANDLES, immediateCandles.size)
                            )
                        } else {
                            tab.visibleCandleCount
                        }
                        tab.copy(
                            chartId = canonicalChartId,
                            timeframe = normalizedTf,
                            candles = immediateCandles,
                            drawings = tfDrawings,
                            selectedDrawingId = null,
                            pendingTrendPoint = null,
                            pendingAnchors = emptyList(),
                            activeDateRange = null,
                            visibleCandleCount = nextVisible,
                            scrollOffsetFromRight = 0,
                            selectedCandleIndex = null,
                            isAutoScaleY = true,
                            yPriceScaleFactor = 1.0f,
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
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()

        val targetSymbol = _uiState.value.symbols.firstOrNull { it.symbolCode == active.symbolCode } ?: return
        val minRequiredBars = minBarsForTimeframe(normalizedTf)
        val needsFullBackfill = immediateCandles.size < minRequiredBars
        viewModelScope.launch {
            val (syncedSymbol, mergedCandles) = repository.syncSymbolUpToNow(
                symbol = targetSymbol,
                requestedTimeframe = normalizedTf,
                forceBackfill = needsFullBackfill
            )
            _uiState.update { state ->
                state.copy(
                    symbols = state.symbols.map {
                        if (it.symbolCode == syncedSymbol.symbolCode) syncedSymbol else it
                    },
                    openTabs = state.openTabs.map { tab ->
                        if (tab.tabId == active.tabId && tab.timeframe == normalizedTf) {
                            val updated = applyUpdatedCandlesPreservingViewport(
                                tab = tab,
                                newCandles = mergedCandles,
                                newTimeframe = normalizedTf,
                                providerStatus = syncedSymbol.providerStatus,
                                connectionStatus = syncedSymbol.connectionStatus,
                                syncErrorText = syncedSymbol.syncErrorText,
                                lastSuccessfulFetchMs = syncedSymbol.lastSuccessfulFetchMs,
                                lastCandleCloseMs = syncedSymbol.lastCandleCloseMs,
                                sessionPrevClose = syncedSymbol.prevClose,
                                gapSummary = syncedSymbol.gapSummary
                            )
                            val clampedVis = if (mergedCandles.isNotEmpty()) {
                                updated.visibleCandleCount.coerceIn(
                                    AppConfig.MIN_VISIBLE_CANDLES,
                                    max(AppConfig.MIN_VISIBLE_CANDLES, mergedCandles.size)
                                )
                            } else {
                                updated.visibleCandleCount
                            }
                            updated.copy(visibleCandleCount = clampedVis)
                        } else {
                            tab
                        }
                    }
                )
            }
            repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        }
    }

    private val backfilledSessionKeys = java.util.Collections.synchronizedSet(HashSet<String>())

    private fun minBarsForTimeframe(tf: String): Int = when (tf.uppercase()) {
        "M15" -> 1200
        "M30", "H1" -> 1000
        "H4" -> 500
        "D1" -> 1000
        "W1" -> 250
        else -> 1000
    }

    private fun triggerBackfillIfHistoryShallow(tab: ChartTabState) {
        val key = "${tab.symbolCode}_${tab.provider.id}_${tab.timeframe}"
        val minBars = minBarsForTimeframe(tab.timeframe)
        if (tab.candles.size >= minBars || !backfilledSessionKeys.add(key)) return
        val targetSymbol = _uiState.value.symbols.firstOrNull { it.symbolCode == tab.symbolCode } ?: return
        viewModelScope.launch {
            val (syncedSymbol, mergedCandles) = repository.syncSymbolUpToNow(
                symbol = targetSymbol,
                requestedTimeframe = tab.timeframe,
                forceBackfill = true
            )
            _uiState.update { state ->
                state.copy(
                    symbols = state.symbols.map {
                        if (it.symbolCode == syncedSymbol.symbolCode) syncedSymbol else it
                    },
                    openTabs = state.openTabs.map { t ->
                        if (t.tabId == tab.tabId && t.timeframe == tab.timeframe) {
                            applyUpdatedCandlesPreservingViewport(
                                tab = t,
                                newCandles = mergedCandles,
                                newTimeframe = tab.timeframe,
                                providerStatus = syncedSymbol.providerStatus,
                                connectionStatus = syncedSymbol.connectionStatus,
                                syncErrorText = syncedSymbol.syncErrorText,
                                lastSuccessfulFetchMs = syncedSymbol.lastSuccessfulFetchMs,
                                lastCandleCloseMs = syncedSymbol.lastCandleCloseMs,
                                sessionPrevClose = syncedSymbol.prevClose,
                                gapSummary = syncedSymbol.gapSummary
                            )
                        } else {
                            t
                        }
                    }
                )
            }
            repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
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
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun zoomActiveTab(zoomIn: Boolean) {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        val step = _uiState.value.chartPreferences.zoomStepCandles.coerceIn(2, 32)
        var tabToBackfill: ChartTabState? = null
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        val delta = if (zoomIn) -step else step
                        val maxCap = max(1500, (tab.candles.size * 1.4f).roundToInt()).coerceAtMost(AppConfig.MAX_VISIBLE_CANDLES)
                        val nextCount = (tab.visibleCandleCount + delta).coerceIn(
                            AppConfig.MIN_VISIBLE_CANDLES,
                            maxCap
                        )
                        val maxOffset = (tab.candles.size - nextCount).coerceAtLeast(0)
                        val updated = tab.copy(
                            visibleCandleCount = nextCount,
                            scrollOffsetFromRight = tab.scrollOffsetFromRight.coerceIn(0, maxOffset)
                        )
                        if (!zoomIn && nextCount >= tab.candles.size - 10) {
                            tabToBackfill = updated
                        }
                        updated
                    } else {
                        tab
                    }
                }
            )
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        tabToBackfill?.let { triggerBackfillIfHistoryShallow(it) }
    }

    fun pinchZoomActiveTab(zoomFactor: Float) {
        if (zoomFactor <= 0f) return
        val activeId = _uiState.value.activeTab?.tabId ?: return
        var tabToBackfill: ChartTabState? = null
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        // Pinch out (zoomFactor > 1) -> fewer candles visible (zoom in)
                        val rawScaled = (tab.visibleCandleCount.toFloat() / zoomFactor).roundToInt()
                        val steppedScaled = when {
                            zoomFactor > 1.008f && rawScaled == tab.visibleCandleCount -> tab.visibleCandleCount - 1
                            zoomFactor < 0.992f && rawScaled == tab.visibleCandleCount -> tab.visibleCandleCount + 1
                            else -> rawScaled
                        }
                        val maxCap = max(1500, (tab.candles.size * 1.4f).roundToInt()).coerceAtMost(AppConfig.MAX_VISIBLE_CANDLES)
                        val nextCount = steppedScaled.coerceIn(AppConfig.MIN_VISIBLE_CANDLES, maxCap)
                        val maxOffset = (tab.candles.size - nextCount).coerceAtLeast(0)
                        val updated = tab.copy(
                            visibleCandleCount = nextCount,
                            scrollOffsetFromRight = tab.scrollOffsetFromRight.coerceIn(0, maxOffset)
                        )
                        if (zoomFactor < 1f && nextCount >= tab.candles.size - 10) {
                            tabToBackfill = updated
                        }
                        updated
                    } else {
                        tab
                    }
                }
            )
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        tabToBackfill?.let { triggerBackfillIfHistoryShallow(it) }
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
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
    }

    fun panActiveTab(candleDelta: Int) {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        var tabToBackfill: ChartTabState? = null
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        val maxOffset = (tab.candles.size - tab.visibleCandleCount).coerceAtLeast(0)
                        val nextOffset = (tab.scrollOffsetFromRight + candleDelta).coerceIn(0, maxOffset)
                        val updated = tab.copy(scrollOffsetFromRight = nextOffset)
                        if (candleDelta > 0 && nextOffset >= (maxOffset - 15).coerceAtLeast(0)) {
                            tabToBackfill = updated
                        }
                        updated
                    } else {
                        tab
                    }
                }
            )
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        tabToBackfill?.let { triggerBackfillIfHistoryShallow(it) }
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
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
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
        scheduleDebouncedCloudSync()
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
        scheduleDebouncedCloudSync()
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
        scheduleDebouncedCloudSync()
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
        scheduleDebouncedCloudSync()
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
            val canonicalChartId = UtcTimeAnchorAlgorithm.canonicalChartKey(active.symbolCode, resolvedTf)
            val legacyChartId = _uiState.value.symbols.firstOrNull { it.symbolCode == active.symbolCode }?.chartId
                ?: UtcTimeAnchorAlgorithm.legacyChartId(active.symbolCode)
            val tfDrawings = repository.loadDrawingsForChart(canonicalChartId, legacyChartId)
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
                                chartId = canonicalChartId,
                                timeframe = resolvedTf,
                                candles = immediateCandles,
                                drawings = tfDrawings,
                                selectedDrawingId = null,
                                pendingTrendPoint = null,
                                pendingAnchors = emptyList(),
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
            repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
            val targetSymbol = _uiState.value.symbols.firstOrNull { it.symbolCode == active.symbolCode } ?: return
            val needsFullBackfill = immediateCandles.size < max(targetBars + 20, minBarsForTimeframe(resolvedTf))
            viewModelScope.launch {
                val (syncedSymbol, mergedCandles) = repository.syncSymbolUpToNow(
                    symbol = targetSymbol,
                    requestedTimeframe = resolvedTf,
                    forceBackfill = needsFullBackfill
                )
                _uiState.update { state ->
                    state.copy(
                        symbols = state.symbols.map {
                            if (it.symbolCode == syncedSymbol.symbolCode) syncedSymbol else it
                        },
                        openTabs = state.openTabs.map { tab ->
                            if (tab.tabId == active.tabId && tab.timeframe == resolvedTf) {
                                val updated = applyUpdatedCandlesPreservingViewport(
                                    tab = tab,
                                    newCandles = mergedCandles,
                                    newTimeframe = resolvedTf,
                                    providerStatus = syncedSymbol.providerStatus,
                                    connectionStatus = syncedSymbol.connectionStatus,
                                    syncErrorText = syncedSymbol.syncErrorText,
                                    lastSuccessfulFetchMs = syncedSymbol.lastSuccessfulFetchMs,
                                    lastCandleCloseMs = syncedSymbol.lastCandleCloseMs,
                                    sessionPrevClose = syncedSymbol.prevClose,
                                    gapSummary = syncedSymbol.gapSummary
                                )
                                val refreshedPreset = updated.computeDateRangePresets().firstOrNull { it.id.equals(rangeId, ignoreCase = true) }
                                updated.copy(
                                    activeDateRange = refreshedPreset?.id ?: rangeId,
                                    visibleCandleCount = refreshedPreset?.targetBars ?: updated.visibleCandleCount,
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
                repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
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
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)

        // If local cache has fewer candles than requested by the range preset, trigger background sync
        if (active.candles.size < preset.targetBars || active.candles.size < 30) {
            val targetSymbol = _uiState.value.symbols.firstOrNull { it.symbolCode == active.symbolCode }
            if (targetSymbol != null) {
                val forceBackfill = active.candles.size < 30
                viewModelScope.launch {
                    val (syncedSymbol, mergedCandles) = repository.syncSymbolUpToNow(
                        symbol = targetSymbol,
                        requestedTimeframe = active.timeframe,
                        forceBackfill = forceBackfill
                    )
                    _uiState.update { state ->
                        state.copy(
                            symbols = state.symbols.map {
                                if (it.symbolCode == syncedSymbol.symbolCode) syncedSymbol else it
                            },
                            openTabs = state.openTabs.map { tab ->
                                if (tab.tabId == active.tabId && tab.timeframe == active.timeframe) {
                                    val updated = applyUpdatedCandlesPreservingViewport(
                                        tab = tab,
                                        newCandles = mergedCandles,
                                        newTimeframe = active.timeframe,
                                        providerStatus = syncedSymbol.providerStatus,
                                        connectionStatus = syncedSymbol.connectionStatus,
                                        syncErrorText = syncedSymbol.syncErrorText,
                                        lastSuccessfulFetchMs = syncedSymbol.lastSuccessfulFetchMs,
                                        lastCandleCloseMs = syncedSymbol.lastCandleCloseMs,
                                        sessionPrevClose = syncedSymbol.prevClose,
                                        gapSummary = syncedSymbol.gapSummary
                                    )
                                    val refreshedPreset = updated.computeDateRangePresets().firstOrNull { it.id.equals(rangeId, ignoreCase = true) }
                                    updated.copy(
                                        activeDateRange = refreshedPreset?.id ?: rangeId,
                                        visibleCandleCount = refreshedPreset?.targetBars ?: updated.visibleCandleCount,
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
                    repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
                }
            }
        }
    }

    fun updateIndicatorFamilyColor(family: String, colorHex: String) {
        val cleanHex = colorHex.trim().removePrefix("#").uppercase().let {
            if (it.length == 6) "FF$it" else it
        }
        val cur = _uiState.value.chartPreferences
        val nextPrefs = when (family.lowercase()) {
            "ma" -> cur.copy(indMaFamilyColorHex = cleanHex)
            "bands" -> cur.copy(indBandsFamilyColorHex = cleanHex)
            "levels" -> cur.copy(indLevelsFamilyColorHex = cleanHex)
            "trend" -> cur.copy(indTrendFamilyColorHex = cleanHex)
            "smc" -> cur.copy(indSmcFamilyColorHex = cleanHex)
            else -> cur
        }
        repository.saveChartPreferences(nextPrefs)
        _uiState.update { it.copy(chartPreferences = nextPrefs) }
        scheduleDebouncedCloudSync()
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
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun cycleVolumePaneHeightOnActiveTab() {
        val curRatio = _uiState.value.activeTab?.volumePaneRatio ?: return
        val nextRatio = when {
            curRatio < 0.19f -> 0.22f
            curRatio < 0.26f -> 0.30f
            else -> 0.16f
        }
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    tab.copy(
                        showVolume = true,
                        volumePaneRatio = nextRatio
                    )
                }
            )
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleSma20OnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showSma20 ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showSma20 = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleSma50OnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showSma50 ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showSma50 = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleSma200OnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showSma200 ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showSma200 = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleEma20OnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showEma20 ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showEma20 = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleEma50OnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showEma50 ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showEma50 = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleBollingerOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showBollinger ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showBollinger = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleSupertrendOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showSupertrend ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showSupertrend = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleVwapOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showVwap ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showVwap = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleRsi14OnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showRsi14 ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showRsi14 = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleMacdOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showMacd ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showMacd = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleOverlayMacdOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showOverlayMacd ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showOverlayMacd = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleAtr14OnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showAtr14 ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showAtr14 = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleSmcStructureOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showSmcStructure ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showSmcStructure = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleFvgOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showFvg ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showFvg = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleVolumeProfileOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showVolumeProfile ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showVolumeProfile = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun togglePivotPointsOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showPivotPoints ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showPivotPoints = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun setPivotTypeOnActiveTab(variant: String) {
        val normalized = when (variant.trim().uppercase()) {
            "FIBONACCI", "CAMARILLA", "WOODIE" -> variant.trim().uppercase()
            else -> "STANDARD"
        }
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(pivotType = normalized, showPivotPoints = true) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleFutureProjectionOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showFutureProjection ?: return)
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    tab.copy(
                        showFutureProjection = nextVal,
                        scrollOffsetFromRight = if (nextVal) 0 else tab.scrollOffsetFromRight
                    )
                }
            )
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun enableFutureProjectionAndOpenChart() {
        val nextVal = !(_uiState.value.activeTab?.showFutureProjection ?: false)
        _uiState.update { state ->
            val nextStack = if (state.currentScreen != WorkspaceScreen.CHART_VIEW && nextVal) {
                (state.screenBackStack + state.currentScreen).takeLast(6)
            } else {
                state.screenBackStack
            }
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    tab.copy(
                        showFutureProjection = nextVal,
                        scrollOffsetFromRight = if (nextVal) 0 else tab.scrollOffsetFromRight
                    )
                },
                currentScreen = if (nextVal) WorkspaceScreen.CHART_VIEW else state.currentScreen,
                screenBackStack = nextStack
            )
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleEma200OnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showEma200 ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showEma200 = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun togglePsarOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showPsar ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showPsar = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleIchimokuOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showIchimoku ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showIchimoku = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleKeltnerOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showKeltner ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showKeltner = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleDonchianOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showDonchian ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showDonchian = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleMtfEmaOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showMtfEma ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showMtfEma = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleKillzonesOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showKillzones ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showKillzones = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleAdx14OnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showAdx14 ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showAdx14 = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleStoch14OnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showStoch14 ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showStoch14 = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleCci20OnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showCci20 ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showCci20 = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleWillR14OnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showWillR14 ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showWillR14 = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleObvOnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showObv ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showObv = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleCmf20OnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showCmf20 ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showCmf20 = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleRoc12OnActiveTab() {
        val nextVal = !(_uiState.value.activeTab?.showRoc12 ?: return)
        _uiState.update { state ->
            state.copy(openTabs = state.openTabs.map { it.copy(showRoc12 = nextVal) })
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun setDrawingColorOnActiveTab(colorHex: String) {
        val active = _uiState.value.activeTab ?: return
        val updatedTab = drawingCoordinator.updateActiveDrawingColor(active, colorHex)
        val nextPrefs = preferenceCoordinator.updateDefaultDrawingColor(_uiState.value.chartPreferences, colorHex)
        _uiState.update { state ->
            state.copy(
                chartPreferences = nextPrefs,
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == active.tabId) updatedTab else tab.copy(activeDrawingColorHex = colorHex)
                }
            )
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun setDrawingWidthOnActiveTab(widthDp: Float) {
        val active = _uiState.value.activeTab ?: return
        val updatedTab = drawingCoordinator.updateActiveDrawingWidth(active, widthDp)
        val nextPrefs = preferenceCoordinator.updateDefaultDrawingWidth(_uiState.value.chartPreferences, widthDp)
        _uiState.update { state ->
            state.copy(
                chartPreferences = nextPrefs,
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == active.tabId) updatedTab else tab.copy(activeDrawingWidthDp = widthDp)
                }
            )
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
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

    fun toggleMagnetModeOnActiveTab() {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        drawingCoordinator.toggleMagnetMode(tab)
                    } else {
                        tab
                    }
                }
            )
        }
    }

    fun setPitchforkVariantOnActiveTab(variant: String) {
        val active = _uiState.value.activeTab ?: return
        val updatedTab = drawingCoordinator.setPitchforkVariant(active, variant)
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == active.tabId) updatedTab else tab
                }
            )
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    // --- Dynamic Symbol & Preference Management (Anti-Hardcoding) ---

    fun addCustomSymbol(symbolCode: String, customTitle: String, decimals: Int, provider: ProviderId) {
        val cleanCode = symbolCoordinator.sanitizeSymbolCode(symbolCode)
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
        var nextActiveId: String? = null
        _uiState.update { state ->
            val candidate = if (state.activeTabId?.startsWith("${symbolCode}_") == true) {
                updatedTabs.lastOrNull()?.tabId
            } else {
                state.activeTabId
            }
            nextActiveId = candidate
            state.copy(
                symbols = updated,
                openTabs = updatedTabs,
                activeTabId = candidate
            )
        }
        repository.saveActiveTabId(nextActiveId)
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
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
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
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
        scheduleDebouncedCloudSync()
    }

    fun updatePersonalApiKeys(
        twelveDataKey: String,
        stooqKey: String,
        alphaVantageKey: String,
        finnhubKey: String
    ) {
        // BYOK keys are strictly stored locally on device and never synced to cloud workspace
        val next = repository.saveLocalByokKeys(
            twelveData = twelveDataKey,
            stooq = stooqKey,
            alphaVantage = alphaVantageKey,
            finnhub = finnhubKey
        )
        _uiState.update {
            it.copy(
                chartPreferences = next,
                statusBannerResId = R.string.settings_byok_saved
            )
        }
    }

    fun updateTradingViewPreference(transform: (ChartPreferences) -> ChartPreferences) {
        val next = preferenceCoordinator.updateTradingViewPreference(_uiState.value.chartPreferences, transform)
        _uiState.update { it.copy(chartPreferences = next) }
        scheduleDebouncedCloudSync()
    }

    fun updateTimezoneMode(mode: String) {
        val next = preferenceCoordinator.updateTimezoneMode(_uiState.value.chartPreferences, mode)
        _uiState.update { it.copy(chartPreferences = next) }
        scheduleDebouncedCloudSync()
    }

    fun toggleTimezoneMode() {
        val nextMode = if (_uiState.value.chartPreferences.timezoneMode.equals("LOCAL", ignoreCase = true)) {
            "UTC"
        } else {
            "LOCAL"
        }
        updateTimezoneMode(nextMode)
    }

    fun updateBullCandleColor(colorHex: String) {
        val next = preferenceCoordinator.updateBullCandleColor(_uiState.value.chartPreferences, colorHex)
        _uiState.update { it.copy(chartPreferences = next) }
        scheduleDebouncedCloudSync()
    }

    fun updateBearCandleColor(colorHex: String) {
        val next = preferenceCoordinator.updateBearCandleColor(_uiState.value.chartPreferences, colorHex)
        _uiState.update { it.copy(chartPreferences = next) }
        scheduleDebouncedCloudSync()
    }

    fun updateTrendLineColor(colorHex: String) {
        val next = preferenceCoordinator.updateTrendLineColor(_uiState.value.chartPreferences, colorHex)
        _uiState.update { it.copy(chartPreferences = next) }
        scheduleDebouncedCloudSync()
    }

    fun updateHorizontalLineColor(colorHex: String) {
        val next = preferenceCoordinator.updateHorizontalLineColor(_uiState.value.chartPreferences, colorHex)
        _uiState.update { it.copy(chartPreferences = next) }
        scheduleDebouncedCloudSync()
    }

    fun updateVerticalLineColor(colorHex: String) {
        val next = preferenceCoordinator.updateVerticalLineColor(_uiState.value.chartPreferences, colorHex)
        _uiState.update { it.copy(chartPreferences = next) }
        scheduleDebouncedCloudSync()
    }

    fun updateDefaultDrawingWidth(widthDp: Float) {
        val next = preferenceCoordinator.updateDefaultDrawingWidth(_uiState.value.chartPreferences, widthDp)
        _uiState.update { state ->
            state.copy(
                chartPreferences = next,
                openTabs = state.openTabs.map { tab -> tab.copy(activeDrawingWidthDp = next.defaultDrawingWidthDp) }
            )
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun updateBollingerParams(period: Int, stdDev: Float) {
        val next = preferenceCoordinator.updateBollingerParams(_uiState.value.chartPreferences, period, stdDev)
        _uiState.update { it.copy(chartPreferences = next) }
        scheduleDebouncedCloudSync()
    }

    fun updateAlgorithmParams(fetchLimit: Int, zoomStep: Int, touchTolerance: Float) {
        val next = preferenceCoordinator.updateAlgorithmParams(_uiState.value.chartPreferences, fetchLimit, zoomStep, touchTolerance)
        _uiState.update { it.copy(chartPreferences = next) }
        scheduleDebouncedCloudSync()
    }

    fun resetChartColorsToDefault() {
        val next = preferenceCoordinator.resetChartColorsToDefault(_uiState.value.chartPreferences)
        _uiState.update { state ->
            state.copy(
                chartPreferences = next,
                openTabs = state.openTabs.map { tab ->
                    tab.copy(
                        activeDrawingColorHex = next.defaultDrawingColorHex,
                        activeDrawingWidthDp = next.defaultDrawingWidthDp
                    )
                }
            )
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun resetAlgorithmParamsToDefault() {
        val next = preferenceCoordinator.resetAlgorithmParamsToDefault(_uiState.value.chartPreferences)
        _uiState.update { it.copy(chartPreferences = next) }
        scheduleDebouncedCloudSync()
    }

    fun resetAllPreferencesToDefault() {
        val next = preferenceCoordinator.resetAllPreferencesToDefault(_uiState.value.chartPreferences)
        _uiState.update { state ->
            state.copy(
                chartPreferences = next,
                openTabs = state.openTabs.map { tab ->
                    tab.copy(
                        activeDrawingColorHex = next.defaultDrawingColorHex,
                        activeDrawingWidthDp = next.defaultDrawingWidthDp
                    )
                }
            )
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun refreshSystemStatus() {
        viewModelScope.launch {
            val status = repository.fetchSystemStatus()
            _uiState.update { it.copy(systemStatus = status) }
        }
    }

    private fun scheduleDebouncedCloudSync() {
        autoSyncJob?.cancel()
        autoSyncJob = viewModelScope.launch {
            kotlinx.coroutines.delay(800L)
            val symbols = _uiState.value.symbols
            val prefs = _uiState.value.chartPreferences
            val tabs = _uiState.value.openTabs
            val chartIds = symbols.map { it.chartId }
            val drawings = repository.getAllCachedDrawings(chartIds)
            val success = repository.syncWorkspaceToCloud(symbols, prefs, drawings, tabs)
            if (success) {
                val nowTimeStr = java.time.LocalTime.now().toString().take(5)
                _uiState.update { it.copy(lastWorkspaceSyncedAt = nowTimeStr) }
            }
        }
    }

    private suspend fun pullAndApplyCloudWorkspaceOnStartup() {
        val ws = repository.fetchCloudWorkspace() ?: return
        val applied = repository.applyCloudWorkspaceToLocal(ws)
        if (applied) {
            val refreshedSymbols = repository.loadSymbolCatalog()
            val refreshedPrefs = repository.loadChartPreferences()
            val savedTabs = repository.loadSavedOpenTabs()
            val savedActiveId = repository.loadActiveTabId()
            val nowTimeStr = java.time.LocalTime.now().toString().take(5)
            _uiState.update { state ->
                val existingBySym = state.openTabs.associateBy { it.symbolCode }
                val tabsToUse = if (savedTabs.isNotEmpty()) {
                    savedTabs.map { cloudTab ->
                        val localTab = existingBySym[cloudTab.symbolCode]
                        val mergedCandles = if (cloudTab.candles.isNotEmpty()) {
                            cloudTab.candles
                        } else if (localTab != null && localTab.timeframe == cloudTab.timeframe && localTab.candles.isNotEmpty()) {
                            localTab.candles
                        } else {
                            emptyList()
                        }
                        cloudTab.copy(
                            candles = mergedCandles,
                            drawings = repository.loadDrawingsForChart(
                                cloudTab.chartId,
                                UtcTimeAnchorAlgorithm.legacyChartId(cloudTab.symbolCode)
                            ),
                            liveQuotePrice = localTab?.liveQuotePrice ?: cloudTab.liveQuotePrice,
                            liveQuoteMode = localTab?.liveQuoteMode ?: cloudTab.liveQuoteMode,
                            formingBar = localTab?.formingBar ?: cloudTab.formingBar,
                            gapSummary = localTab?.gapSummary ?: cloudTab.gapSummary
                        )
                    }
                } else if (state.openTabs.isNotEmpty()) {
                    state.openTabs.map { tab ->
                        tab.copy(
                            drawings = repository.loadDrawingsForChart(
                                tab.chartId,
                                UtcTimeAnchorAlgorithm.legacyChartId(tab.symbolCode)
                            )
                        )
                    }
                } else {
                    emptyList()
                }
                val activeId = when {
                    savedActiveId != null && tabsToUse.any { it.tabId == savedActiveId } -> savedActiveId
                    tabsToUse.any { it.tabId == state.activeTabId } -> state.activeTabId
                    else -> tabsToUse.firstOrNull()?.tabId
                }
                state.copy(
                    symbols = refreshedSymbols,
                    chartPreferences = refreshedPrefs,
                    openTabs = tabsToUse,
                    activeTabId = activeId,
                    lastWorkspaceSyncedAt = nowTimeStr
                )
            }
        }
    }

    fun syncCloudWorkspace() {
        if (_uiState.value.isWorkspaceSyncing) return
        viewModelScope.launch {
            _uiState.update { it.copy(isWorkspaceSyncing = true) }
            val symbols = _uiState.value.symbols
            val prefs = _uiState.value.chartPreferences
            val tabs = _uiState.value.openTabs
            val chartIds = symbols.map { it.chartId }
            val drawings = repository.getAllCachedDrawings(chartIds)
            val success = repository.syncWorkspaceToCloud(symbols, prefs, drawings, tabs)
            if (!success) {
                pullAndApplyCloudWorkspaceOnStartup()
            }
            val nowTimeStr = java.time.LocalTime.now().toString().take(5)
            _uiState.update {
                it.copy(
                    isWorkspaceSyncing = false,
                    lastWorkspaceSyncedAt = if (success) nowTimeStr else it.lastWorkspaceSyncedAt
                )
            }
        }
    }

    // --- Batch 2: INF-01 Backup/Restore, ENG-03 Gap Audit, §2.3 Live Intel, Seasonals & Candle Export ---

    fun exportEncryptedBackupToUri(uri: Uri, passphrase: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(backupStatusMessage = "Encrypting workspace (AES-256-GCM)...") }
            val result = backupHelper.exportEncryptedBackupToUri(uri, passphrase)
            _uiState.update {
                it.copy(
                    backupStatusMessage = result.fold(
                        onSuccess = { cipher -> "Encrypted backup saved ($cipher)." },
                        onFailure = { err -> "Backup export failed: ${err.message ?: "Error"}" }
                    )
                )
            }
        }
    }

    fun restoreEncryptedBackupFromUri(uri: Uri, passphrase: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(backupStatusMessage = "Decrypting and verifying backup...") }
            val result = backupHelper.restoreEncryptedBackupFromUri(uri, passphrase)
            if (result.isSuccess) {
                val refreshedSymbols = repository.loadSymbolCatalog()
                val refreshedPrefs = repository.loadChartPreferences()
                val refreshedTabs = repository.loadSavedOpenTabs()
                val refreshedActiveId = repository.loadActiveTabId()
                    ?.takeIf { id -> refreshedTabs.any { it.tabId == id } }
                    ?: refreshedTabs.firstOrNull()?.tabId
                _uiState.update {
                    it.copy(
                        symbols = refreshedSymbols,
                        chartPreferences = refreshedPrefs,
                        openTabs = refreshedTabs,
                        activeTabId = refreshedActiveId,
                        backupStatusMessage = "Backup restored & verified (SHA-256 + GCM)."
                    )
                }
            } else {
                _uiState.update {
                    it.copy(
                        backupStatusMessage = "Restore failed: ${result.exceptionOrNull()?.message ?: "Invalid passphrase or file"}"
                    )
                }
            }
        }
    }

    fun loadSymbolIntel(symbolCode: String, forceRefresh: Boolean = false) {
        val cleanCode = symbolCode.trim().uppercase()
        if (cleanCode.isEmpty()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isIntelLoading = true) }
            val bundle = intelRepository.fetchSymbolIntel(cleanCode, forceRefresh = forceRefresh)
            _uiState.update { state ->
                val nextMap = if (bundle != null) {
                    state.symbolIntelByCode + (cleanCode to bundle)
                } else {
                    state.symbolIntelByCode
                }
                state.copy(
                    symbolIntelByCode = nextMap,
                    isIntelLoading = false
                )
            }
        }
    }

    fun auditGapReportForActiveTab() {
        val activeTab = _uiState.value.activeTab
        val targetSymbol = if (activeTab != null) {
            _uiState.value.symbols.firstOrNull { it.symbolCode == activeTab.symbolCode }
        } else {
            _uiState.value.watchlistSymbols.firstOrNull() ?: _uiState.value.symbols.firstOrNull()
        } ?: return

        val tf = activeTab?.timeframe ?: targetSymbol.timeframe
        val prov = activeTab?.provider ?: targetSymbol.activeProvider
        val candles = activeTab?.candles?.takeIf { it.isNotEmpty() }
            ?: repository.getCachedOrAggregatedCandles(targetSymbol.symbolCode, prov, tf)
        val report = GapDetectorAlgorithm.detectGaps(candles, tf, targetSymbol.symbolCode)
        _uiState.update { state ->
            state.copy(
                activeGapAuditReport = report,
                symbols = state.symbols.map { s ->
                    if (s.symbolCode == targetSymbol.symbolCode) s.copy(gapSummary = report) else s
                },
                openTabs = state.openTabs.map { t ->
                    if (t.symbolCode == targetSymbol.symbolCode && t.timeframe == tf) t.copy(gapSummary = report) else t
                }
            )
        }
    }

    fun getD1CandlesForSymbol(symbolCode: String): List<CandleBar> {
        val sym = _uiState.value.symbols.firstOrNull { it.symbolCode == symbolCode } ?: return emptyList()
        return repository.getCachedOrAggregatedCandles(sym.symbolCode, sym.activeProvider, "D1")
    }

    fun exportCandlesCsvToUri(uri: Uri, symbolCode: String? = null, timeframe: String? = null) {
        exportCandlesInternal(uri, asCsv = true, symbolCode = symbolCode, timeframe = timeframe)
    }

    fun exportCandlesJsonToUri(uri: Uri, symbolCode: String? = null, timeframe: String? = null) {
        exportCandlesInternal(uri, asCsv = false, symbolCode = symbolCode, timeframe = timeframe)
    }

    private fun exportCandlesInternal(
        uri: Uri,
        asCsv: Boolean,
        symbolCode: String?,
        timeframe: String?
    ) {
        val activeTab = _uiState.value.activeTab
        val resolvedSym = symbolCode ?: activeTab?.symbolCode ?: return
        val catalogSym = _uiState.value.symbols.firstOrNull { it.symbolCode == resolvedSym }
        val resolvedProv = activeTab?.takeIf { it.symbolCode == resolvedSym }?.provider
            ?: catalogSym?.activeProvider ?: ProviderId.TVDATAFEED
        val resolvedTf = (timeframe ?: activeTab?.takeIf { it.symbolCode == resolvedSym }?.timeframe
            ?: catalogSym?.timeframe ?: AppConfig.DEFAULT_TIMEFRAME).uppercase()
        val candles = activeTab?.takeIf { it.symbolCode == resolvedSym && it.timeframe == resolvedTf }?.candles
            ?.takeIf { it.isNotEmpty() }
            ?: repository.getCachedOrAggregatedCandles(resolvedSym, resolvedProv, resolvedTf)

        viewModelScope.launch {
            withContext(Dispatchers.IO) {
                val text = if (asCsv) {
                    CandleExportAlgorithm.formatCandlesCsv(resolvedSym, resolvedProv.id, resolvedTf, candles)
                } else {
                    CandleExportAlgorithm.formatCandlesJson(resolvedSym, resolvedProv.id, resolvedTf, candles)
                }
                getApplication<Application>().contentResolver.openOutputStream(uri)?.use { out ->
                    out.write(text.toByteArray(Charsets.UTF_8))
                }
            }
        }
    }

    fun refreshImportBatches() {
        viewModelScope.launch {
            val batches = repository.fetchImportBatches()
            _uiState.update { it.copy(importBatches = batches) }
        }
    }

    fun importHistoricalDocumentFromUri(
        uri: Uri,
        symbolCode: String,
        providerId: String,
        timeframe: String,
        qualityStatus: String
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(importStatusMessage = "Reading and validating file...") }
            val app = getApplication<Application>()
            val (fileName, mimeType, bytes) = withContext(Dispatchers.IO) {
                val cr = app.contentResolver
                val mime = cr.getType(uri).orEmpty()
                var displayName = uri.lastPathSegment ?: "upload.csv"
                cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (idx >= 0) {
                            displayName = cursor.getString(idx) ?: displayName
                        }
                    }
                }
                val raw = cr.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0)
                Triple(displayName, mime, raw)
            }

            if (CandleImportAlgorithm.isImagePayload(bytes, fileName, mimeType)) {
                _uiState.update {
                    it.copy(
                        importStatusMessage = "ERR_IMAGE_UPLOAD_FORBIDDEN: Image files cannot be imported as price history."
                    )
                }
                return@launch
            }

            val res = repository.importHistoricalCandlesToLocalAndServer(
                symbolCode = symbolCode,
                providerId = providerId,
                timeframe = timeframe,
                qualityStatus = qualityStatus,
                rawBytes = bytes,
                fileName = fileName,
                mimeType = mimeType
            )

            if (res.ok) {
                val updatedSymbols = repository.loadSymbolCatalog()
                val batches = repository.fetchImportBatches()
                _uiState.update { state ->
                    val nextTabs = state.openTabs.map { tab ->
                        if (tab.symbolCode == symbolCode && tab.provider.id == providerId && tab.timeframe == res.effectiveTimeframe) {
                            tab.copy(candles = res.candles)
                        } else {
                            tab
                        }
                    }
                    state.copy(
                        symbols = updatedSymbols,
                        openTabs = nextTabs,
                        importBatches = batches,
                        importStatusMessage = "Imported ${res.importedCount} bars ($symbolCode · ${res.effectiveTimeframe}) — +${res.rowsInserted} / ~${res.rowsCorrected} corr"
                    )
                }
            } else {
                _uiState.update {
                    it.copy(
                        importStatusMessage = "Import failed: ${res.errorMessage ?: "PARSE_FAILED"}"
                    )
                }
            }
        }
    }

    fun submitManualOhlcEntry(
        symbolCode: String,
        providerId: String,
        timeframe: String,
        qualityStatus: String,
        dateTimeInput: String,
        open: Double,
        high: Double,
        low: Double,
        close: Double,
        volume: Double
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(importStatusMessage = "Saving manual OHLC candle...") }
            val res = repository.importManualCandleToLocalAndServer(
                symbolCode = symbolCode,
                providerId = providerId,
                timeframe = timeframe,
                qualityStatus = qualityStatus,
                dateTimeInput = dateTimeInput,
                open = open,
                high = high,
                low = low,
                close = close,
                volume = volume
            )
            if (res.ok) {
                val updatedSymbols = repository.loadSymbolCatalog()
                val batches = repository.fetchImportBatches()
                _uiState.update { state ->
                    val nextTabs = state.openTabs.map { tab ->
                        if (tab.symbolCode == symbolCode && tab.provider.id == providerId && tab.timeframe == res.effectiveTimeframe) {
                            tab.copy(candles = res.candles)
                        } else {
                            tab
                        }
                    }
                    state.copy(
                        symbols = updatedSymbols,
                        openTabs = nextTabs,
                        importBatches = batches,
                        importStatusMessage = "Saved manual $symbolCode (${res.effectiveTimeframe}) candle — +${res.rowsInserted} / ~${res.rowsCorrected} corr"
                    )
                }
            } else {
                _uiState.update {
                    it.copy(
                        importStatusMessage = "Manual OHLC failed: ${res.errorMessage ?: "INVALID_MANUAL_OHLC"}"
                    )
                }
            }
        }
    }

    // --- Phase 4: Forecast Studio & Pluggable Ensemble Controls ---

    fun setForecastHorizon(bars: Int) {
        val clamped = es.manico.chartintelligence.forecast.ForecastCalendarHelper.clampHorizonBars(bars)
        val nextPrefs = preferenceCoordinator.updateForecastPreferences(
            current = _uiState.value.chartPreferences,
            horizonBars = clamped
        )
        val activeId = _uiState.value.activeTab?.tabId
        _uiState.update { state ->
            state.copy(
                chartPreferences = nextPrefs,
                openTabs = state.openTabs.map { tab ->
                    if (activeId == null || tab.tabId == activeId) tab.copy(forecastHorizonBars = clamped) else tab
                }
            )
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun setForecastRenderMode(mode: es.manico.chartintelligence.forecast.ForecastRenderMode) {
        val nextPrefs = preferenceCoordinator.updateForecastPreferences(
            current = _uiState.value.chartPreferences,
            renderMode = mode.key
        )
        val activeId = _uiState.value.activeTab?.tabId
        _uiState.update { state ->
            state.copy(
                chartPreferences = nextPrefs,
                openTabs = state.openTabs.map { tab ->
                    if (activeId == null || tab.tabId == activeId) tab.copy(forecastRenderMode = mode.key) else tab
                }
            )
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun toggleForecastModel(modelId: String, enabled: Boolean) {
        val registry = es.manico.chartintelligence.forecast.ForecastModelRegistry().apply {
            applyFromJson(_uiState.value.chartPreferences.forecastPluginConfigJson)
            setEnabled(modelId, enabled)
        }
        val json = registry.serializeToJson()
        val nextPrefs = preferenceCoordinator.updateForecastPreferences(
            current = _uiState.value.chartPreferences,
            pluginConfigJson = json
        )
        _uiState.update { it.copy(chartPreferences = nextPrefs) }
        scheduleDebouncedCloudSync()
    }

    fun setForecastModelWeight(modelId: String, weight: Double) {
        val registry = es.manico.chartintelligence.forecast.ForecastModelRegistry().apply {
            applyFromJson(_uiState.value.chartPreferences.forecastPluginConfigJson)
            setWeight(modelId, weight)
        }
        val json = registry.serializeToJson()
        val nextPrefs = preferenceCoordinator.updateForecastPreferences(
            current = _uiState.value.chartPreferences,
            pluginConfigJson = json
        )
        _uiState.update { it.copy(chartPreferences = nextPrefs) }
        scheduleDebouncedCloudSync()
    }

    fun setForecastModelParam(modelId: String, paramKey: String, value: Double) {
        val registry = es.manico.chartintelligence.forecast.ForecastModelRegistry().apply {
            applyFromJson(_uiState.value.chartPreferences.forecastPluginConfigJson)
            setParam(modelId, paramKey, value)
        }
        val json = registry.serializeToJson()
        val nextPrefs = preferenceCoordinator.updateForecastPreferences(
            current = _uiState.value.chartPreferences,
            pluginConfigJson = json
        )
        _uiState.update { it.copy(chartPreferences = nextPrefs) }
        scheduleDebouncedCloudSync()
    }

    fun resetForecastModels() {
        val registry = es.manico.chartintelligence.forecast.ForecastModelRegistry()
        registry.resetDefaults()
        val nextPrefs = preferenceCoordinator.updateForecastPreferences(
            current = _uiState.value.chartPreferences,
            pluginConfigJson = registry.serializeToJson()
        )
        _uiState.update { it.copy(chartPreferences = nextPrefs) }
        scheduleDebouncedCloudSync()
    }

    fun saveForecastWorkerUrl(url: String) {
        val nextPrefs = preferenceCoordinator.updateForecastPreferences(
            current = _uiState.value.chartPreferences,
            workerUrl = url.trim()
        )
        _uiState.update { it.copy(chartPreferences = nextPrefs) }
        scheduleDebouncedCloudSync()
    }

    fun applyForecastAndOpenChart() {
        val active = _uiState.value.activeTab ?: return
        val prefs = _uiState.value.chartPreferences
        _uiState.update { state ->
            val nextStack = if (state.currentScreen != WorkspaceScreen.CHART_VIEW) {
                (state.screenBackStack + state.currentScreen).takeLast(6)
            } else {
                state.screenBackStack
            }
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == active.tabId) {
                        tab.copy(
                            showFutureProjection = true,
                            scrollOffsetFromRight = 0,
                            forecastHorizonBars = prefs.forecastHorizonBars,
                            forecastRenderMode = prefs.forecastRenderMode
                        )
                    } else tab
                },
                currentScreen = WorkspaceScreen.CHART_VIEW,
                screenBackStack = nextStack
            )
        }
        repository.saveOpenTabsToPrefs(_uiState.value.openTabs)
        scheduleDebouncedCloudSync()
    }

    fun recordAndSyncForecastSnapshot() {
        val active = _uiState.value.activeTab ?: return
        val prefs = _uiState.value.chartPreferences
        val registry = es.manico.chartintelligence.forecast.ForecastModelRegistry().apply {
            applyFromJson(prefs.forecastPluginConfigJson)
        }
        val mode = es.manico.chartintelligence.forecast.ForecastRenderMode.parse(active.forecastRenderMode.ifBlank { prefs.forecastRenderMode })
        val horizon = if (active.forecastHorizonBars in 10..60) active.forecastHorizonBars else prefs.forecastHorizonBars.coerceIn(10, 60)

        viewModelScope.launch {
            val result = withContext(Dispatchers.Default) {
                es.manico.chartintelligence.forecast.ForecastEngine.project(
                    candles = active.candles,
                    symbolCode = active.symbolCode,
                    timeframe = active.timeframe,
                    horizonBars = horizon,
                    renderMode = mode,
                    registry = registry,
                    workerUrl = prefs.forecastWorkerUrl,
                    skipWalkForward = false
                )
            }
            val appended = forecastLedgerStore.appendFromForecast(result)
            if (appended != null) {
                val synced = repository.syncForecastSnapshotToServer(result, prefs.forecastWorkerUrl)
                if (synced) {
                    forecastLedgerStore.markSynced(appended.forecastHash)
                }
                val entries = forecastLedgerStore.loadEntries()
                val verify = forecastLedgerStore.verifyChain(entries)
                val serverEntries = if (synced) repository.fetchForecastLedgerFromServer(active.symbolCode) else _uiState.value.forecastServerLedger
                _uiState.update {
                    it.copy(
                        forecastLocalLedger = entries,
                        forecastServerLedger = serverEntries,
                        forecastLedgerVerifyResult = verify,
                        statusBannerResId = R.string.forecast_snapshot_recorded
                    )
                }
            }
        }
    }

    fun refreshForecastServerLedger() {
        val sym = _uiState.value.activeTab?.symbolCode.orEmpty()
        viewModelScope.launch {
            val entries = repository.fetchForecastLedgerFromServer(sym)
            _uiState.update { it.copy(forecastServerLedger = entries) }
        }
    }
}
