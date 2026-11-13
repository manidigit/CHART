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
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.util.concurrent.TimeUnit

/**
 * Independent Data Provider Adapter: `biquote` Multi-Asset Feed (`ProviderId.BIQUOTE`).
 *
 * Primary free provider for Crypto (`BTCUSD`, `ETHUSD`) and Silver (`XAGUSD`),
 * and secondary/tertiary provider for Gold (`XAUUSD`), Brent (`SPOTBRENT`), WTI (`USOIL`), and `EURUSD`.
 * Queries `candles_sync.php?provider=biquote` with DB-First incremental `since_ms` support,
 * and falls back to direct public kline/chart endpoints if the central backend is unreachable.
 */
class BiquoteAdapter(
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()
) : CandleProviderAdapter {

    override val providerId: ProviderId = ProviderId.BIQUOTE

    override suspend fun fetchClosedCandlesUpToNow(
        symbolCode: String,
        timeframe: String,
        limit: Int,
        sinceOpenTimeMs: Long
    ): ProviderSyncResult = withContext(Dispatchers.IO) {
        val nowMillis = System.currentTimeMillis()
        val cleanSymbol = symbolCode.trim().uppercase()
        val normTf = timeframe.uppercase()
        val safeLimit = limit.coerceIn(40, 5000)

        var syncMode = if (sinceOpenTimeMs > 0L) "DB_CACHE_HIT" else "INITIAL_BACKFILL"
        var fetchedNewBars = 0
        var backendSucceeded = false
        var backendError: String? = null

        // 1. Query central server DB-First endpoint (`provider=biquote`)
        val backendCandles = runCatching {
            val sinceParam = if (sinceOpenTimeMs > 0L) "&since_ms=$sinceOpenTimeMs" else ""
            val url = "${AppConfig.API_BASE_URL}candles_sync.php?symbol=$cleanSymbol&provider=biquote&timeframe=$normTf&limit=$safeLimit&refresh=1$sinceParam"
            val request = Request.Builder().url(url).get().build()
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    throw IllegalStateException("Backend HTTP ${response.code}")
                }
                backendSucceeded = true
                val bodyStr = response.body?.string().orEmpty()
                val root = runCatching { JSONObject(bodyStr) }.getOrNull()
                val meta = root?.optJSONObject("data")?.optJSONObject("sync_meta")
                if (meta != null) {
                    syncMode = meta.optString("sync_mode", meta.optString("mode", syncMode))
                    fetchedNewBars = meta.optInt("fetched_new_bars", 0)
                }
                parseBackendCandles(bodyStr, normTf, nowMillis)
            }
        }.onFailure { err ->
            backendError = err.message ?: "Biquote backend unreachable"
        }.getOrNull().orEmpty()

        var fetchSucceeded = backendSucceeded
        var errorMsg: String? = backendError
        val finalCandles = if (backendCandles.isNotEmpty() || (backendSucceeded && sinceOpenTimeMs > 0L)) {
            CandleValidatorAlgorithm.filterSyntheticWeekendAndCombCandles(backendCandles, cleanSymbol, normTf)
        } else {
            var directSucceeded = false
            val direct = runCatching {
                val res = fetchDirectPublicFeed(cleanSymbol, normTf, safeLimit, sinceOpenTimeMs, nowMillis)
                directSucceeded = true
                res
            }.onFailure { err ->
                errorMsg = errorMsg ?: err.message ?: "Direct public feed unreachable"
            }.getOrNull().orEmpty()
            if (directSucceeded) {
                fetchSucceeded = true
                errorMsg = null
                syncMode = if (sinceOpenTimeMs > 0L) "DELTA_SYNC" else "INITIAL_BACKFILL"
                fetchedNewBars = direct.size
            } else if (!fetchSucceeded) {
                syncMode = "OFFLINE_CACHE"
            }
            CandleValidatorAlgorithm.filterSyntheticWeekendAndCombCandles(direct, cleanSymbol, normTf)
        }

        ProviderSyncResult(
            providerId = providerId,
            symbolCode = cleanSymbol,
            timeframe = normTf,
            candles = finalCandles.takeLast(safeLimit),
            syncedAtUtcIso = UtcTimeAnchorAlgorithm.formatUtcIso(nowMillis),
            syncMode = syncMode,
            fetchedNewBars = fetchedNewBars,
            fetchSucceeded = fetchSucceeded,
            errorMessage = errorMsg
        )
    }

    private fun fetchDirectPublicFeed(
        symbolCode: String,
        timeframe: String,
        limit: Int,
        sinceOpenTimeMs: Long,
        nowMillis: Long
    ): List<CandleBar> {
        if (symbolCode == "BTCUSD" || symbolCode == "ETHUSD") {
            val pair = if (symbolCode == "BTCUSD") "BTCUSDT" else "ETHUSDT"
            val interval = when (timeframe) {
                "M15" -> "15m"
                "M30" -> "30m"
                "H1" -> "1h"
                "H4" -> "4h"
                "D1" -> "1d"
                else -> "15m"
            }
            val url = "https://api.binance.com/api/v3/klines?symbol=$pair&interval=$interval&limit=${limit.coerceAtMost(1000)}"
            val req = Request.Builder().url(url).get().build()
            val bars = runCatching {
                httpClient.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) emptyList()
                    else {
                        val arr = JSONArray(resp.body?.string().orEmpty())
                        val list = ArrayList<CandleBar>(arr.length())
                        for (i in 0 until arr.length()) {
                            val row = arr.optJSONArray(i) ?: continue
                            val openMs = row.optLong(0, 0L)
                            if (openMs <= 0L || (sinceOpenTimeMs > 0L && openMs < sinceOpenTimeMs)) continue
                            if (!UtcTimeAnchorAlgorithm.isCandleClosed(openMs, timeframe, nowMillis)) continue
                            CandleValidatorAlgorithm.sanitizeAndValidate(
                                rawOpenTimeMillis = openMs,
                                timeframe = timeframe,
                                open = BigDecimal(row.optString(1, "0")),
                                high = BigDecimal(row.optString(2, "0")),
                                low = BigDecimal(row.optString(3, "0")),
                                close = BigDecimal(row.optString(4, "0")),
                                volume = BigDecimal(row.optString(5, "0"))
                            )?.let { list.add(it) }
                        }
                        list.sortedBy { it.openTimeUtcMillis }
                    }
                }
            }.getOrNull().orEmpty()
            if (bars.isNotEmpty()) return bars
        }
        return YahooFinanceAdapter(httpClient).fetchYahooChartCandles(
            symbolCode = symbolCode,
            timeframe = timeframe,
            limit = limit,
            nowMillis = nowMillis,
            sinceOpenTimeMs = sinceOpenTimeMs
        )
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
