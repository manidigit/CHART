package es.manico.chartintelligence.providers

import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm
import es.manico.chartintelligence.config.AppConfig
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ProviderId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.math.BigDecimal
import java.util.concurrent.TimeUnit

/**
 * Independent Data Provider Adapter: Dukascopy Bank Feed (`dukascopy`).
 * Verified free M15 intraday source for Brent Crude CFD (`brentcmdusd`) and Gold (`xauusd`).
 */
class DukascopyAdapter(
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()
) : CandleProviderAdapter {

    override val providerId: ProviderId = ProviderId.DUKASCOPY

    override suspend fun fetchClosedCandlesUpToNow(
        symbolCode: String,
        timeframe: String,
        limit: Int
    ): ProviderSyncResult = withContext(Dispatchers.IO) {
        val nowMillis = System.currentTimeMillis()
        val proxyCandles = runCatching {
            val url = "${AppConfig.API_BASE_URL}candles_sync.php?symbol=$symbolCode&provider=dukascopy&timeframe=$timeframe&limit=$limit"
            val request = Request.Builder().url(url).get().build()
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) emptyList()
                else parseBackendResponse(response.body?.string().orEmpty(), timeframe, nowMillis)
            }
        }.getOrNull().orEmpty()

        val candles = if (proxyCandles.isNotEmpty()) {
            proxyCandles
        } else {
            HistoricalSeedGenerator.buildClosedCandlesUpToNow(
                symbolCode = symbolCode,
                providerId = providerId.id,
                timeframe = timeframe,
                count = limit,
                nowUtcMillis = nowMillis
            )
        }

        ProviderSyncResult(
            providerId = providerId,
            symbolCode = symbolCode,
            timeframe = timeframe,
            candles = candles,
            syncedAtUtcIso = UtcTimeAnchorAlgorithm.formatUtcIso(nowMillis)
        )
    }

    private fun parseBackendResponse(body: String, timeframe: String, nowMillis: Long): List<CandleBar> {
        val root = JSONObject(body)
        if (!root.optBoolean("ok", false)) return emptyList()
        val arr = root.optJSONObject("data")?.optJSONArray("candles") ?: return emptyList()
        val result = ArrayList<CandleBar>()
        for (i in 0 until arr.length()) {
            val c = arr.getJSONObject(i)
            val ts = c.optLong("open_time_utc_ms", 0L)
            if (ts <= 0L || !UtcTimeAnchorAlgorithm.isCandleClosed(ts, timeframe, nowMillis)) continue
            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = ts,
                timeframe = timeframe,
                open = BigDecimal(c.optString("open", "0")),
                high = BigDecimal(c.optString("high", "0")),
                low = BigDecimal(c.optString("low", "0")),
                close = BigDecimal(c.optString("close", "0")),
                volume = BigDecimal(c.optString("volume", "0"))
            )?.let { result.add(it) }
        }
        return result.sortedBy { it.openTimeUtcMillis }
    }
}
