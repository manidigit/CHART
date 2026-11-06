package es.manico.chartintelligence.providers

import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ProviderId

data class ProviderSyncResult(
    val providerId: ProviderId,
    val symbolCode: String,
    val timeframe: String,
    val candles: List<CandleBar>,
    val syncedAtUtcIso: String
)

/**
 * Unified contract implemented by every independent data provider adapter in `providers/`.
 */
interface CandleProviderAdapter {
    val providerId: ProviderId

    suspend fun fetchClosedCandlesUpToNow(
        symbolCode: String,
        timeframe: String,
        limit: Int
    ): ProviderSyncResult
}
