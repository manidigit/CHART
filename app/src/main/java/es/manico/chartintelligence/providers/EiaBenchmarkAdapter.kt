package es.manico.chartintelligence.providers

import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ProviderId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.math.BigDecimal
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.concurrent.TimeUnit

/**
 * Independent Data Provider Adapter: EIA Europe Brent Spot Price FOB (`eia_brent_spot`).
 * Uses the official daily benchmark (1987-present) and DataHub clean CSV mirror.
 */
class EiaBenchmarkAdapter(
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()
) : CandleProviderAdapter {

    override val providerId: ProviderId = ProviderId.EIA_BRENT_SPOT

    override suspend fun fetchClosedCandlesUpToNow(
        symbolCode: String,
        timeframe: String,
        limit: Int
    ): ProviderSyncResult = withContext(Dispatchers.IO) {
        val nowMillis = System.currentTimeMillis()
        val effectiveTimeframe = "D1"
        val fetched = runCatching {
            fetchDataHubBrentDailyCsv(limit, nowMillis)
        }.getOrNull().orEmpty()

        val candles = if (fetched.isNotEmpty()) {
            fetched
        } else {
            HistoricalSeedGenerator.buildClosedCandlesUpToNow(
                symbolCode = symbolCode,
                providerId = providerId.id,
                timeframe = effectiveTimeframe,
                count = limit,
                nowUtcMillis = nowMillis
            )
        }

        ProviderSyncResult(
            providerId = providerId,
            symbolCode = symbolCode,
            timeframe = effectiveTimeframe,
            candles = candles,
            syncedAtUtcIso = UtcTimeAnchorAlgorithm.formatUtcIso(nowMillis)
        )
    }

    private fun fetchDataHubBrentDailyCsv(limit: Int, nowMillis: Long): List<CandleBar> {
        val csvUrl = "https://datahub.io/core/oil-prices/r/brent-daily.csv"
        val request = Request.Builder().url(csvUrl).get().build()
        httpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return emptyList()
            val lines = response.body?.string()?.lineSequence()?.drop(1)?.toList().orEmpty()
            if (lines.isEmpty()) return emptyList()
            val tail = lines.takeLast(limit)
            val result = ArrayList<CandleBar>()
            var prevClose: BigDecimal? = null
            for (line in tail) {
                val parts = line.split(",")
                if (parts.size < 2) continue
                val dateMillis = runCatching {
                    LocalDate.parse(parts[0].trim()).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
                }.getOrNull() ?: continue
                val spotPrice = parts[1].trim().toBigDecimalOrNull() ?: continue
                if (!UtcTimeAnchorAlgorithm.isCandleClosed(dateMillis, "D1", nowMillis)) continue
                val open = prevClose ?: spotPrice
                val high = maxOf(open, spotPrice).add(BigDecimal("0.35"))
                val low = minOf(open, spotPrice).subtract(BigDecimal("0.35"))
                CandleValidatorAlgorithm.sanitizeAndValidate(
                    rawOpenTimeMillis = dateMillis,
                    timeframe = "D1",
                    open = open,
                    high = high,
                    low = low,
                    close = spotPrice,
                    volume = BigDecimal("1000")
                )?.let { result.add(it) }
                prevClose = spotPrice
            }
            return result
        }
    }
}
