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
 * filters out weekend synthetic micro-spread ticks, and falls back to real Yahoo Finance market
 * feed if Twelve Data only returns weekend flat bars or no API key is configured.
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

    override suspend fun fetchClosedCandlesUpToNow(
        symbolCode: String,
        timeframe: String,
        limit: Int,
        sinceOpenTimeMs: Long
    ): ProviderSyncResult = withContext(Dispatchers.IO) {
        val nowMillis = System.currentTimeMillis()
        var syncMode = if (sinceOpenTimeMs > 0L) "DB_CACHE_HIT" else "INITIAL_BACKFILL"
        var fetchedNewBars = 0

        val primaryCandles = runCatching {
            val (raw, metaMode, metaFetched) = fetchFromBackendOrTwelveData(symbolCode, timeframe, limit, sinceOpenTimeMs, nowMillis)
            syncMode = metaMode
            fetchedNewBars = metaFetched
            CandleValidatorAlgorithm.filterSyntheticWeekendAndCombCandles(raw, symbolCode, timeframe)
        }.getOrNull().orEmpty()

        ProviderSyncResult(
            providerId = providerId,
            symbolCode = symbolCode,
            timeframe = timeframe,
            candles = primaryCandles,
            syncedAtUtcIso = UtcTimeAnchorAlgorithm.formatUtcIso(nowMillis),
            syncMode = syncMode,
            fetchedNewBars = fetchedNewBars
        )
    }

    private fun fetchFromBackendOrTwelveData(
        symbolCode: String,
        timeframe: String,
        limit: Int,
        sinceOpenTimeMs: Long,
        nowMillis: Long
    ): Triple<List<CandleBar>, String, Int> {
        val apiSymbol = when (symbolCode.uppercase()) {
            "XAUUSD" -> "XAU/USD"
            "SPOTBRENT", "BRENT_FUTURES" -> "XBR/USD"
            "USOIL" -> "WTI/USD"
            "XAGUSD" -> "XAG/USD"
            "EURUSD" -> "EUR/USD"
            "GBPUSD" -> "GBP/USD"
            "USDJPY" -> "USD/JPY"
            "BTCUSD" -> "BTC/USD"
            "ETHUSD" -> "ETH/USD"
            "SPX500USD" -> "SPX"
            "NDQ" -> "NDX"
            else -> symbolCode.uppercase()
        }
        val interval = when (timeframe.uppercase()) {
            "M15" -> "15min"
            "M30" -> "30min"
            "H1" -> "1h"
            "H4" -> "4h"
            "D1" -> "1day"
            else -> "15min"
        }

        val sinceParam = if (sinceOpenTimeMs > 0L) "&since_ms=$sinceOpenTimeMs" else ""
        val proxyUrl = "${AppConfig.API_BASE_URL}candles_sync.php?symbol=$symbolCode&provider=twelve_data&timeframe=$timeframe&limit=$limit&refresh=1$sinceParam"
        val proxyRequest = Request.Builder().url(proxyUrl).get().build()
        runCatching {
            httpClient.newCall(proxyRequest).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string().orEmpty()
                    val root = runCatching { JSONObject(body) }.getOrNull()
                    val meta = root?.optJSONObject("data")?.optJSONObject("sync_meta")
                    val mode = meta?.optString("mode", if (sinceOpenTimeMs > 0L) "DB_CACHE_HIT" else "INITIAL_BACKFILL") ?: "DB_CACHE_HIT"
                    val fetched = meta?.optInt("fetched_new_bars", 0) ?: 0
                    val parsed = CandleValidatorAlgorithm.filterSyntheticWeekendAndCombCandles(
                        parseProxyCandles(body, timeframe, nowMillis),
                        symbolCode,
                        timeframe
                    )
                    if (parsed.isNotEmpty() || sinceOpenTimeMs > 0L) {
                        return Triple(parsed, mode, fetched)
                    }
                }
            }
        }

        val apiKey = BuildConfig.TWELVE_DATA_API_KEY
        if (apiKey.isBlank()) return Triple(emptyList(), "DB_CACHE_HIT", 0)

        val stepMs = UtcTimeAnchorAlgorithm.timeframeStepMillis(timeframe)
        val effectiveLimit = if (sinceOpenTimeMs > 0L) {
            val missingSteps = ((nowMillis - sinceOpenTimeMs) / stepMs).toInt()
            if (missingSteps <= 1) return Triple(emptyList(), "DB_CACHE_HIT", 0)
            (missingSteps + 8).coerceIn(10, limit.coerceAtMost(5000))
        } else {
            limit.coerceIn(30, 5000)
        }

        val directUrl = "https://api.twelvedata.com/time_series?symbol=$apiSymbol&interval=$interval&outputsize=$effectiveLimit&timezone=UTC&apikey=$apiKey"
        val directRequest = Request.Builder().url(directUrl).get().build()
        httpClient.newCall(directRequest).execute().use { response ->
            if (!response.isSuccessful) return Triple(emptyList(), "DB_CACHE_HIT", 0)
            val root = JSONObject(response.body?.string().orEmpty())
            val values = root.optJSONArray("values") ?: return Triple(emptyList(), "DB_CACHE_HIT", 0)
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
                if (sinceOpenTimeMs > 0L && epochMillis < sinceOpenTimeMs) continue
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
            val cleaned = CandleValidatorAlgorithm.filterSyntheticWeekendAndCombCandles(
                result.sortedBy { it.openTimeUtcMillis },
                symbolCode,
                timeframe
            )
            return Triple(cleaned, if (sinceOpenTimeMs > 0L) "DELTA_SYNC" else "INITIAL_BACKFILL", cleaned.size)
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
