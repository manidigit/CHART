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
 * Independent Data Provider Adapter: TradingView `tvdatafeed` (`PEPPERSTONE:SPOTBRENT`).
 * Reads up to 5,000 historical and daily closed candles persisted on the cPanel MariaDB database
 * (`candles_sync.php?provider=tvdatafeed`).
 * Never fabricates synthetic data.
 */
class TvDatafeedAdapter(
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()
) : CandleProviderAdapter {

    override val providerId: ProviderId = ProviderId.TVDATAFEED

    override suspend fun fetchClosedCandlesUpToNow(
        symbolCode: String,
        timeframe: String,
        limit: Int
    ): ProviderSyncResult = withContext(Dispatchers.IO) {
        val nowMillis = System.currentTimeMillis()
        val safeLimit = limit.coerceIn(40, 5000)
        val candles = runCatching {
            val url = "${AppConfig.API_BASE_URL}candles_sync.php?symbol=$symbolCode&provider=tvdatafeed&timeframe=$timeframe&limit=$safeLimit"
            val request = Request.Builder().url(url).get().build()
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) emptyList()
                else parseBackendResponse(response.body?.string().orEmpty(), timeframe, nowMillis)
            }
        }.getOrNull().orEmpty()

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
        val result = ArrayList<CandleBar>(arr.length())
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
