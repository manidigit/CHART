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
    SETTINGS
}

data class Phase1UiState(
    val language: AppLanguage = AppLanguage.FA,
    val isDarkTheme: Boolean = true,
    val isOwnerRegistered: Boolean = false,
    val isAuthenticated: Boolean = false,
    val ownerUsername: String = "",
    @StringRes val authErrorResId: Int? = null,
    val currentScreen: WorkspaceScreen = WorkspaceScreen.WATCHLIST,
    val symbols: List<SymbolConfig> = emptyList(),
    val chartPreferences: ChartPreferences = ChartPreferences(),
    val isSyncingAll: Boolean = false,
    val openTabs: List<ChartTabState> = emptyList(),
    val activeTabId: String? = null,
    @StringRes val statusBannerResId: Int? = null
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
            isAuthenticated = false,
            ownerUsername = repository.getOwnerUsername(),
            symbols = symbolCoordinator.loadInitialCatalog(),
            chartPreferences = preferenceCoordinator.loadInitialPreferences()
        )
    )
    val uiState: StateFlow<Phase1UiState> = _uiState.asStateFlow()

    init {
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

    fun navigateTo(screen: WorkspaceScreen) {
        _uiState.update { it.copy(currentScreen = screen, statusBannerResId = null) }
    }

    fun registerFirstTimeOwner(username: String, password: String, confirmPassword: String) {
        if (username.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(authErrorResId = R.string.error_empty_credentials) }
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
        repository.registerOwnerAccount(username, password)
        _uiState.update {
            it.copy(
                isOwnerRegistered = true,
                isAuthenticated = true,
                ownerUsername = username.trim(),
                authErrorResId = null,
                currentScreen = WorkspaceScreen.WATCHLIST
            )
        }
    }

    fun signInOwner(username: String, password: String) {
        if (username.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(authErrorResId = R.string.error_empty_credentials) }
            return
        }
        val verified = repository.verifyOwnerCredentials(username, password)
        if (!verified) {
            _uiState.update { it.copy(authErrorResId = R.string.error_invalid_credentials) }
            return
        }
        _uiState.update {
            it.copy(
                isAuthenticated = true,
                authErrorResId = null,
                currentScreen = WorkspaceScreen.WATCHLIST
            )
        }
    }

    fun signOut() {
        _uiState.update {
            it.copy(
                isAuthenticated = false,
                authErrorResId = null,
                statusBannerResId = null
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
        _uiState.update { it.copy(symbols = enriched) }
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
        val tabId = "${symbol.symbolCode}_${symbol.activeProvider.id}"
        val currentTabs = _uiState.value.openTabs
        val existingTab = currentTabs.firstOrNull { it.tabId == tabId }

        if (existingTab != null) {
            _uiState.update {
                it.copy(
                    activeTabId = tabId,
                    currentScreen = WorkspaceScreen.CHART_VIEW
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
            _uiState.update {
                it.copy(
                    openTabs = it.openTabs + newTab,
                    activeTabId = tabId,
                    currentScreen = WorkspaceScreen.CHART_VIEW
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
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        val delta = if (zoomIn) -8 else 8
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
