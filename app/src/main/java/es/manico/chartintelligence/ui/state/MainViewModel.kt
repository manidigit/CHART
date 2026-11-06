package es.manico.chartintelligence.ui.state

import android.app.Application
import androidx.annotation.StringRes
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import es.manico.chartintelligence.R
import es.manico.chartintelligence.config.AppConfig
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.ProviderId
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.data.repository.WorkspaceRepository
import es.manico.chartintelligence.i18n.AppLanguage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

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

    private val _uiState = MutableStateFlow(
        Phase1UiState(
            language = repository.loadLanguage(),
            isDarkTheme = repository.loadDarkTheme(),
            isOwnerRegistered = repository.isOwnerAccountRegistered(),
            isAuthenticated = false,
            ownerUsername = repository.getOwnerUsername(),
            symbols = repository.loadSymbolCatalog()
        )
    )
    val uiState: StateFlow<Phase1UiState> = _uiState.asStateFlow()

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
        val updated = _uiState.value.symbols.map { item ->
            if (item.symbolCode == symbolCode) item.copy(inWatchlist = enabled) else item
        }
        repository.saveSymbolCatalog(updated)
        _uiState.update { it.copy(symbols = updated) }
    }

    fun selectProviderForSymbol(symbolCode: String, provider: ProviderId) {
        val updated = _uiState.value.symbols.map { item ->
            if (item.symbolCode == symbolCode) {
                val tf = if (provider == ProviderId.EIA_BRENT_SPOT) "D1" else "M15"
                val candles = repository.getOrSeedCandles(symbolCode, provider, tf)
                val latest = candles.lastOrNull()
                item.copy(
                    activeProvider = provider,
                    timeframe = tf,
                    lastClose = latest?.close,
                    lastCandleUtc = latest?.openTimeUtcIso,
                    storedCandleCount = candles.size
                )
            } else {
                item
            }
        }
        repository.saveSymbolCatalog(updated)
        _uiState.update { it.copy(symbols = updated) }
    }

    fun syncSingleSymbolUpToNow(symbolCode: String) {
        val target = _uiState.value.symbols.firstOrNull { it.symbolCode == symbolCode } ?: return
        _uiState.update { state ->
            state.copy(
                symbols = state.symbols.map {
                    if (it.symbolCode == symbolCode) it.copy(isSyncing = true) else it
                }
            )
        }

        viewModelScope.launch {
            val (syncedSymbol, mergedCandles) = repository.syncSymbolUpToNow(target)
            _uiState.update { state ->
                val newSymbols = state.symbols.map {
                    if (it.symbolCode == symbolCode) syncedSymbol else it
                }
                val newTabs = state.openTabs.map { tab ->
                    if (tab.symbolCode == syncedSymbol.symbolCode && tab.provider == syncedSymbol.activeProvider) {
                        tab.copy(candles = mergedCandles, timeframe = syncedSymbol.timeframe)
                    } else {
                        tab
                    }
                }
                state.copy(
                    symbols = newSymbols,
                    openTabs = newTabs,
                    statusBannerResId = R.string.status_synced_ok
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
            val candlesByTabKey = HashMap<String, List<es.manico.chartintelligence.data.model.CandleBar>>()
            for (symbol in watchlist) {
                val (syncedSymbol, mergedCandles) = repository.syncSymbolUpToNow(symbol)
                updatedMap[symbol.symbolCode] = syncedSymbol
                candlesByTabKey[syncedSymbol.compositeTabKey] = mergedCandles
            }
            _uiState.update { state ->
                val newSymbols = state.symbols.map { updatedMap[it.symbolCode] ?: it }
                val newTabs = state.openTabs.map { tab ->
                    val refreshed = candlesByTabKey[tab.tabId]
                    if (refreshed != null) tab.copy(candles = refreshed) else tab
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
     * Returning to Watchlist and picking another symbol opens a NEW tab next to existing tabs
     * without closing or resetting previous tabs.
     */
    fun openSymbolInChartTab(symbol: SymbolConfig) {
        val tabId = symbol.compositeTabKey
        val currentTabs = _uiState.value.openTabs
        val existingTab = currentTabs.firstOrNull { it.tabId == tabId }

        if (existingTab != null) {
            _uiState.update {
                it.copy(
                    activeTabId = tabId,
                    currentScreen = WorkspaceScreen.CHART_VIEW
                )
            }
        } else {
            val candles = repository.getOrSeedCandles(
                symbolCode = symbol.symbolCode,
                provider = symbol.activeProvider,
                timeframe = symbol.timeframe
            )
            val newTab = ChartTabState(
                tabId = tabId,
                chartId = symbol.chartId,
                symbolCode = symbol.symbolCode,
                decimals = symbol.decimals,
                provider = symbol.activeProvider,
                timeframe = symbol.timeframe,
                candles = candles
            )
            _uiState.update {
                it.copy(
                    openTabs = it.openTabs + newTab,
                    activeTabId = tabId,
                    currentScreen = WorkspaceScreen.CHART_VIEW
                )
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

    fun zoomActiveTab(zoomIn: Boolean) {
        val activeId = _uiState.value.activeTab?.tabId ?: return
        _uiState.update { state ->
            state.copy(
                openTabs = state.openTabs.map { tab ->
                    if (tab.tabId == activeId) {
                        val delta = if (zoomIn) -8 else 8
                        val nextCount = (tab.visibleCandleCount + delta).coerceIn(
                            AppConfig.MIN_VISIBLE_CANDLES,
                            AppConfig.MAX_VISIBLE_CANDLES
                        )
                        tab.copy(visibleCandleCount = nextCount)
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
}
