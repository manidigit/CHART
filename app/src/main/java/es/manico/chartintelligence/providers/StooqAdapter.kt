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
import java.net.URLEncoder
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.concurrent.TimeUnit

/**
 * Independent Data Provider Adapter: Stooq Historical EOD CSV Feed (`ProviderId.STOOQ`).
 *
 * Implements Grok's OpenMarket Historical Data recommendation (`stooq.com/q/d/l/?s={ticker}&i=d|w`)
 * for multi-year Daily (`D1`) and Weekly (`W1`) closed OHLCV candles across FX, Metals,
 * Commodities, Indices, Crypto, and US Equities.
 */
class StooqAdapter(
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .build(),
    private val customApiKeyProvider: () -> String = { "" }
) : CandleProviderAdapter {

    override val providerId: ProviderId = ProviderId.STOOQ

    companion object {
        fun resolveStooqTicker(symbolCode: String): String {
            return when (symbolCode.trim().uppercase()) {
                "SPOTBRENT", "BRENT_FUTURES" -> "cb.f"
                "USOIL" -> "cl.f"
                "XAUUSD" -> "xauusd"
                "XAGUSD" -> "xagusd"
                "EURUSD" -> "eurusd"
                "GBPUSD" -> "gbpusd"
                "USDJPY" -> "usdjpy"
                "BTCUSD" -> "btcusd"
                "ETHUSD" -> "ethusd"
                "SPX500USD" -> "^spx"
                "NDQ" -> "^ndq"
                "NVDA" -> "nvda.us"
                "AMZN" -> "amzn.us"
                "TSLA" -> "tsla.us"
                "AAPL" -> "aapl.us"
                "GOOGL" -> "googl.us"
                "MSFT" -> "msft.us"
                "META" -> "meta.us"
                "NFLX" -> "nflx.us"
                "AMD" -> "amd.us"
                "UBER" -> "uber.us"
                "NKE" -> "nke.us"
                "IBM" -> "ibm.us"
                "SAN" -> "san.us"
                else -> "${symbolCode.trim().lowercase()}.us"
            }
        }
    }

    override suspend fun fetchClosedCandlesUpToNow(
        symbolCode: String,
        timeframe: String,
        limit: Int,
        sinceOpenTimeMs: Long
    ): ProviderSyncResult = withContext(Dispatchers.IO) {
        val nowMillis = System.currentTimeMillis()
        val cleanSymbol = symbolCode.trim().uppercase()
        val normTf = if (timeframe.uppercase() == "W1") "W1" else "D1"
        val safeLimit = limit.coerceIn(40, 5000)
        val userKey = customApiKeyProvider().trim()

        var syncMode = if (sinceOpenTimeMs > 0L) "DB_CACHE_HIT" else "INITIAL_BACKFILL"
        var fetchedNewBars = 0

        // 1. Query central server DB-First endpoint (`provider=stooq`)
        val backendCandles = runCatching {
            val sinceParam = if (sinceOpenTimeMs > 0L) "&since_ms=$sinceOpenTimeMs" else ""
            val keyParam = if (userKey.isNotEmpty()) "&api_key=${URLEncoder.encode(userKey, "UTF-8")}" else ""
            val url = "${AppConfig.API_BASE_URL}candles_sync.php?symbol=$cleanSymbol&provider=stooq&timeframe=$normTf&limit=$safeLimit&refresh=1$sinceParam$keyParam"
            val request = Request.Builder().url(url).get().build()
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) emptyList()
                else {
                    val bodyStr = response.body?.string().orEmpty()
                    val root = runCatching { JSONObject(bodyStr) }.getOrNull()
                    val meta = root?.optJSONObject("data")?.optJSONObject("sync_meta")
                    if (meta != null) {
                        syncMode = meta.optString("sync_mode", meta.optString("mode", syncMode))
                        fetchedNewBars = meta.optInt("fetched_new_bars", 0)
                    }
                    parseBackendCandles(bodyStr, normTf, nowMillis)
                }
            }
        }.getOrNull().orEmpty()

        val finalCandles = if (backendCandles.isNotEmpty() || sinceOpenTimeMs > 0L) {
            CandleValidatorAlgorithm.filterSyntheticWeekendAndCombCandles(backendCandles, cleanSymbol, normTf)
        } else {
            val direct = runCatching {
                fetchDirectStooqCsv(cleanSymbol, normTf, safeLimit, sinceOpenTimeMs, nowMillis, userKey)
            }.getOrNull().orEmpty()
            syncMode = if (sinceOpenTimeMs > 0L) "DELTA_SYNC" else "INITIAL_BACKFILL"
            fetchedNewBars = direct.size
            CandleValidatorAlgorithm.filterSyntheticWeekendAndCombCandles(direct, cleanSymbol, normTf)
        }

        ProviderSyncResult(
            providerId = providerId,
            symbolCode = cleanSymbol,
            timeframe = normTf,
            candles = finalCandles.takeLast(safeLimit),
            syncedAtUtcIso = UtcTimeAnchorAlgorithm.formatUtcIso(nowMillis),
            syncMode = syncMode,
            fetchedNewBars = fetchedNewBars
        )
    }

    private fun fetchDirectStooqCsv(
        symbolCode: String,
        timeframe: String,
        limit: Int,
        sinceOpenTimeMs: Long,
        nowMillis: Long,
        customApiKey: String
    ): List<CandleBar> {
        val ticker = URLEncoder.encode(resolveStooqTicker(symbolCode), "UTF-8")
        val intervalParam = if (timeframe == "W1") "w" else "d"
        val keySuffix = if (customApiKey.isNotEmpty()) "&apikey=${URLEncoder.encode(customApiKey, "UTF-8")}" else ""
        val url = "https://stooq.com/q/d/l/?s=$ticker&i=$intervalParam$keySuffix"

        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "Mozilla/5.0 (compatible; ChartIntelligence/1.35)")
            .get()
            .build()

        val bars = ArrayList<CandleBar>()
        httpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return emptyList()
            val body = response.body?.string().orEmpty().trim()
            if (body.isEmpty() || body.startsWith("No data", ignoreCase = true) || body.startsWith("Exceeded", ignoreCase = true)) {
                return emptyList()
            }
            val lines = body.lines()
            if (lines.size < 2) return emptyList()

            val todayMidnightUtcMs = LocalDate.now(ZoneOffset.UTC).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

            for (i in 1 until lines.size) {
                val line = lines[i].trim()
                if (line.isEmpty()) continue
                val cols = line.split(",")
                if (cols.size < 5) continue

                val dateStr = cols[0].trim()
                val openTimeMs = runCatching {
                    LocalDate.parse(dateStr).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
                }.getOrDefault(0L)

                if (openTimeMs <= 0L || openTimeMs >= todayMidnightUtcMs) continue
                if (sinceOpenTimeMs > 0L && openTimeMs < sinceOpenTimeMs) continue
                if (!UtcTimeAnchorAlgorithm.isCandleClosed(openTimeMs, timeframe, nowMillis)) continue

                val open = runCatching { BigDecimal(cols[1].trim()) }.getOrNull() ?: continue
                val high = runCatching { BigDecimal(cols[2].trim()) }.getOrNull() ?: continue
                val low = runCatching { BigDecimal(cols[3].trim()) }.getOrNull() ?: continue
                val close = runCatching { BigDecimal(cols[4].trim()) }.getOrNull() ?: continue
                val volume = if (cols.size >= 6) {
                    runCatching { BigDecimal(cols[5].trim()) }.getOrDefault(BigDecimal.ZERO)
                } else {
                    BigDecimal.ZERO
                }

                CandleValidatorAlgorithm.sanitizeAndValidate(
                    rawOpenTimeMillis = openTimeMs,
                    timeframe = timeframe,
                    open = open,
                    high = high,
                    low = low,
                    close = close,
                    volume = volume
                )?.let { bars.add(it) }
            }
        }
        return bars.sortedBy { it.openTimeUtcMillis }.takeLast(limit)
    }

    private fun parseBackendCandles(jsonStr: String, timeframe: String, nowMillis: Long): List<CandleBar> {
        val root = JSONObject(jsonStr)
        if (!root.optBoolean("ok", false)) return emptyList()
        val arr = root.optJSONObject("data")?.optJSONArray("candles") ?: return emptyList()
        val list = ArrayList<CandleBar>(arr.length())
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
