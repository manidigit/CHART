package es.manico.chartintelligence.ui.state.coordinators

import es.manico.chartintelligence.data.model.ProviderId
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.data.repository.WorkspaceRepository

/**
 * Dedicated coordinator managing the open symbol catalog, watchlist toggling,
 * provider assignment, and custom user-defined symbol registration and deletion.
 */
class SymbolCatalogCoordinator(private val repository: WorkspaceRepository) {

    fun loadInitialCatalog(): List<SymbolConfig> {
        return repository.loadSymbolCatalog()
    }

    fun toggleWatchlist(
        currentSymbols: List<SymbolConfig>,
        symbolCode: String,
        inWatchlist: Boolean
    ): List<SymbolConfig> {
        val updated = currentSymbols.map { s ->
            if (s.symbolCode == symbolCode) s.copy(inWatchlist = inWatchlist) else s
        }
        repository.saveSymbolCatalog(updated)
        return updated
    }

    fun selectProviderForSymbol(
        currentSymbols: List<SymbolConfig>,
        symbolCode: String,
        provider: ProviderId
    ): Pair<List<SymbolConfig>, String> {
        val target = currentSymbols.firstOrNull { it.symbolCode == symbolCode }
        val targetTf = if (provider == ProviderId.EIA_BRENT_SPOT) "D1" else target?.timeframe ?: "M15"
        val updated = currentSymbols.map { s ->
            if (s.symbolCode == symbolCode) {
                s.copy(activeProvider = provider, timeframe = targetTf)
            } else {
                s
            }
        }
        repository.saveSymbolCatalog(updated)
        return Pair(updated, targetTf)
    }

    fun addCustomSymbol(
        currentSymbols: List<SymbolConfig>,
        symbolCode: String,
        customTitle: String,
        decimals: Int,
        provider: ProviderId
    ): List<SymbolConfig> {
        val cleanCode = symbolCode.trim().uppercase()
        if (cleanCode.isBlank() || currentSymbols.any { it.symbolCode == cleanCode }) {
            return currentSymbols
        }
        val newSymbol = SymbolConfig(
            chartId = "chart_${cleanCode.lowercase()}_custom",
            symbolCode = cleanCode,
            titleResId = null,
            customTitle = customTitle.ifBlank { cleanCode },
            decimals = decimals.coerceIn(0, 6),
            inWatchlist = true,
            activeProvider = provider,
            allowedProviders = listOf(
                ProviderId.DUKASCOPY,
                ProviderId.TWELVE_DATA,
                ProviderId.YAHOO_FINANCE
            ),
            timeframe = "M15"
        )
        val updated = currentSymbols + newSymbol
        repository.saveSymbolCatalog(updated)
        return updated
    }

    fun deleteSymbol(
        currentSymbols: List<SymbolConfig>,
        symbolCode: String
    ): List<SymbolConfig> {
        val updated = currentSymbols.filterNot { it.symbolCode == symbolCode }
        repository.saveSymbolCatalog(updated)
        return updated
    }
}
