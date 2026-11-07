package es.manico.chartintelligence.providers

import es.manico.chartintelligence.BuildConfig
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
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

/**
 * Independent Data Provider Adapter: Twelve Data API (`twelve_data`).
 * Priority channel for XAU/USD candles; queries chart.manico.es proxy or direct Twelve Data API,
 * and falls back to real Yahoo Finance market feed if no API key is configured.
 * Never fabricates synthetic data.
 */
class TwelveDataAdapter(
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()
) : CandleProviderAdapter {

    override val providerId: ProviderId = ProviderId.TWELVE_DATA

    private val twelveDateTimeFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
    private val yahooFallback = YahooFinanceAdapter(httpClient)

    override suspend fun fetchClosedCandlesUpToNow(
        symbolCode: String,
        timeframe: String,
        limit: Int
    ): ProviderSyncResult = withContext(Dispatchers.IO) {
        val nowMillis = System.currentTimeMillis()
        val primaryCandles = runCatching {
            fetchFromBackendOrTwelveData(symbolCode, timeframe, limit, nowMillis)
        }.getOrNull().orEmpty()

        val realCandles = if (primaryCandles.isNotEmpty()) {
            primaryCandles
        } else {
            runCatching {
                yahooFallback.fetchYahooChartCandles(symbolCode, timeframe, limit, nowMillis)
            }.getOrNull().orEmpty()
        }

        ProviderSyncResult(
            providerId = providerId,
            symbolCode = symbolCode,
            timeframe = timeframe,
            candles = realCandles,
            syncedAtUtcIso = UtcTimeAnchorAlgorithm.formatUtcIso(nowMillis)
        )
    }

    private fun fetchFromBackendOrTwelveData(
        symbolCode: String,
        timeframe: String,
        limit: Int,
        nowMillis: Long
    ): List<CandleBar> {
        val apiSymbol = when (symbolCode.uppercase()) {
            "XAUUSD" -> "XAU/USD"
            "SPOTBRENT", "BRENT_FUTURES" -> "XBR/USD"
            "XAGUSD" -> "XAG/USD"
            "EURUSD" -> "EUR/USD"
            else -> symbolCode
        }
        val interval = when (timeframe.uppercase()) {
            "M15" -> "15min"
            "M30" -> "30min"
            "H1" -> "1h"
            "H4" -> "4h"
            "D1" -> "1day"
            else -> "15min"
        }

        val proxyUrl = "${AppConfig.API_BASE_URL}candles_sync.php?symbol=$symbolCode&provider=twelve_data&timeframe=$timeframe&limit=$limit"
        val proxyRequest = Request.Builder().url(proxyUrl).get().build()
        runCatching {
            httpClient.newCall(proxyRequest).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string().orEmpty()
                    val parsed = parseProxyCandles(body, timeframe, nowMillis)
                    if (parsed.isNotEmpty()) return parsed
                }
            }
        }

        val apiKey = BuildConfig.TWELVE_DATA_API_KEY
        if (apiKey.isBlank()) return emptyList()

        val directUrl = "https://api.twelvedata.com/time_series?symbol=$apiSymbol&interval=$interval&outputsize=$limit&timezone=UTC&apikey=$apiKey"
        val directRequest = Request.Builder().url(directUrl).get().build()
        httpClient.newCall(directRequest).execute().use { response ->
            if (!response.isSuccessful) return emptyList()
            val root = JSONObject(response.body?.string().orEmpty())
            val values = root.optJSONArray("values") ?: return emptyList()
            val result = ArrayList<CandleBar>()
            for (i in 0 until values.length()) {
                val item = values.getJSONObject(i)
                val dtStr = item.optString("datetime")
                val epochMillis = if (dtStr.length == 10) {
                    java.time.LocalDate.parse(dtStr).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
                } else {
                    LocalDateTime.parse(dtStr, twelveDateTimeFormat)
                        .toInstant(ZoneOffset.UTC)
                        .toEpochMilli()
                }
                if (!UtcTimeAnchorAlgorithm.isCandleClosed(epochMillis, timeframe, nowMillis)) continue
                CandleValidatorAlgorithm.sanitizeAndValidate(
                    rawOpenTimeMillis = epochMillis,
                    timeframe = timeframe,
                    open = BigDecimal(item.optString("open", "0")),
                    high = BigDecimal(item.optString("high", "0")),
                    low = BigDecimal(item.optString("low", "0")),
                    close = BigDecimal(item.optString("close", "0")),
                    volume = BigDecimal(item.optString("volume", "0"))
                )?.let { result.add(it) }
            }
            return result.sortedBy { it.openTimeUtcMillis }
        }
    }

    private fun parseProxyCandles(jsonStr: String, timeframe: String, nowMillis: Long): List<CandleBar> {
        val root = JSONObject(jsonStr)
        if (!root.optBoolean("ok", false)) return emptyList()
        val data = root.optJSONObject("data") ?: return emptyList()
        val arr = data.optJSONArray("candles") ?: return emptyList()
        val list = ArrayList<CandleBar>()
        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            val openTimeMillis = obj.optLong("open_time_utc_ms", 0L)
            if (openTimeMillis <= 0L || !UtcTimeAnchorAlgorithm.isCandleClosed(openTimeMillis, timeframe, nowMillis)) continue
            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = openTimeMillis,
                timeframe = timeframe,
                open = BigDecimal(obj.optString("open", "0")),
                high = BigDecimal(obj.optString("high", "0")),
                low = BigDecimal(obj.optString("low", "0")),
                close = BigDecimal(obj.optString("close", "0")),
                volume = BigDecimal(obj.optString("volume", "0"))
            )?.let { list.add(it) }
        }
        return list.sortedBy { it.openTimeUtcMillis }
    }
}
