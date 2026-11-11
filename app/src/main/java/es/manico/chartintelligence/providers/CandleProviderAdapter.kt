package es.manico.chartintelligence.providers

import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ProviderId

data class ProviderSyncResult(
    val providerId: ProviderId,
    val symbolCode: String,
    val timeframe: String,
    val candles: List<CandleBar>,
    val syncedAtUtcIso: String,
    val syncMode: String = "DB_CACHE_HIT",
    val fetchedNewBars: Int = 0
)

/**
 * Unified contract implemented by every independent data provider adapter in `providers/`.
 * Supports DB-First Incremental Historical Sync via [sinceOpenTimeMs]:
 * when [sinceOpenTimeMs] > 0, the server and provider fetch ONLY newly closed bars after [sinceOpenTimeMs].
 */
interface CandleProviderAdapter {
    val providerId: ProviderId

    suspend fun fetchClosedCandlesUpToNow(
        symbolCode: String,
        timeframe: String,
        limit: Int,
        sinceOpenTimeMs: Long = 0L
    ): ProviderSyncResult
}
