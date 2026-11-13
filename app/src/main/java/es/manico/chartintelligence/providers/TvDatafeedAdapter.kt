package es.manico.chartintelligence.providers

import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.algorithms.SessionCalendar
import es.manico.chartintelligence.algorithms.TimeframeAggregatorAlgorithm
import es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm
import es.manico.chartintelligence.config.AppConfig
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ProviderId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneOffset
import java.time.DayOfWeek
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Independent Data Provider Adapter: TradingView `tvdatafeed` (`PEPPERSTONE:SPOTBRENT`, `OANDA:XAUUSD`, etc.).
 *
 * 1. Fetches historical series from `candles_sync.php?provider=tvdatafeed&refresh=1`.
 * 2. Verifies whether the latest candle in the response is up-to-date with the most recent
 *    closed UTC bucket (`computeExpectedLastClosedOpenMs`).
 * 3. Whenever the backend response is behind the current closed bar (e.g. after market reopen on
 *    Sunday night / Monday across M15, H1, and H4), connects directly to TradingView's WebSocket
 *    (`wss://data.tradingview.com/socket.io/websocket`) via OkHttp to fetch all newly closed candles
 *    from the last stored candle right up to `nowMillis` (with Yahoo Finance gap-fill fallback if
 *    WebSocket is blocked), and merges them idempotently.
 * 4. Keeps `D1` strictly for completed daily sessions while preserving Saturday/Sunday D1 bars for 24/7 Crypto.
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
        limit: Int,
        sinceOpenTimeMs: Long
    ): ProviderSyncResult = withContext(Dispatchers.IO) {
        val nowMillis = System.currentTimeMillis()
        val normTf = timeframe.uppercase()
        val safeLimit = limit.coerceIn(40, 5000)
        val cleanSymbol = symbolCode.trim().uppercase()

        // 1. Fetch persisted historical / delta series from DB-First backend engine
        var syncMode = if (sinceOpenTimeMs > 0L) "DB_CACHE_HIT" else "INITIAL_BACKFILL"
        var fetchedNewBars = 0
        var backendSucceeded = false
        var errorMsg: String? = null
        val backendCandles = runCatching {
            val sinceParam = if (sinceOpenTimeMs > 0L) "&since_ms=$sinceOpenTimeMs" else ""
            val url = "${AppConfig.API_BASE_URL}candles_sync.php?symbol=$cleanSymbol&provider=tvdatafeed&timeframe=$normTf&limit=$safeLimit&refresh=1$sinceParam&_t=$nowMillis"
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
                    syncMode = meta.optString("mode", syncMode)
                    fetchedNewBars = meta.optInt("fetched_new_bars", 0)
                }
                parseBackendResponse(bodyStr, cleanSymbol, normTf, nowMillis)
            }
        }.onFailure { err ->
            errorMsg = err.message ?: "Backend unreachable"
        }.getOrNull().orEmpty()

        val minBarsForFullHistory = when (normTf) {
            "M15" -> 300
            "M30", "H1" -> 240
            "H4" -> 180
            "D1" -> 250
            "W1" -> 140
            else -> 240
        }
        val hasShallowHistory = sinceOpenTimeMs == 0L && backendCandles.size < minBarsForFullHistory
        val lastStoredOpenMs = maxOf(
            sinceOpenTimeMs,
            backendCandles.lastOrNull()?.openTimeUtcMillis ?: 0L
        )
        val expectedLastClosedOpenMs = computeExpectedLastClosedOpenMs(normTf, nowMillis, cleanSymbol)
        val stepMs = UtcTimeAnchorAlgorithm.timeframeStepMillis(normTf)

        // 2. If backend candles are shallow or behind the latest closed UTC bucket, fetch from TradingView WebSocket
        var mergedCandles = backendCandles
        var wsSucceeded = false
        if (hasShallowHistory || lastStoredOpenMs < expectedLastClosedOpenMs) {
            val gapBars = if (lastStoredOpenMs > 0L && !hasShallowHistory) {
                (((nowMillis - lastStoredOpenMs) / stepMs).toInt() + 16).coerceIn(24, 1500)
            } else {
                safeLimit.coerceIn(500, 1500)
            }

            val directTvCandles = runCatching {
                fetchDirectFromTradingViewWs(cleanSymbol, normTf, gapBars, nowMillis)
            }.onFailure { err ->
                if (errorMsg == null) errorMsg = err.message ?: "TradingView WebSocket failed"
            }.getOrNull().orEmpty().filter {
                hasShallowHistory || sinceOpenTimeMs <= 0L || it.openTimeUtcMillis >= sinceOpenTimeMs
            }

            if (directTvCandles.isNotEmpty()) {
                wsSucceeded = true
                errorMsg = null
                if (lastStoredOpenMs > 0L && !hasShallowHistory) {
                    syncMode = "DELTA_SYNC"
                    fetchedNewBars = maxOf(fetchedNewBars, directTvCandles.count { it.openTimeUtcMillis > lastStoredOpenMs })
                } else {
                    syncMode = "INITIAL_BACKFILL"
                    fetchedNewBars = maxOf(fetchedNewBars, directTvCandles.size)
                }
                mergedCandles = CandleValidatorAlgorithm.mergeIdempotent(
                    existing = mergedCandles,
                    incoming = directTvCandles,
                    timeframe = normTf,
                    nowUtcMillis = nowMillis
                )
            }

            // For H4, also aggregate closed H1 bars from TradingView so 00:00/04:00/08:00/12:00/16:00/20:00 UTC buckets are exact
            if (normTf == "H4") {
                val directH1 = runCatching {
                    fetchDirectFromTradingViewWs(cleanSymbol, "H1", (gapBars * 4).coerceIn(120, 1500), nowMillis)
                }.getOrNull().orEmpty()
                if (directH1.isNotEmpty()) {
                    wsSucceeded = true
                    val aggregatedH4 = TimeframeAggregatorAlgorithm.aggregateCandles(
                        sourceCandles = directH1,
                        targetTimeframe = "H4",
                        nowUtcMillis = nowMillis,
                        sourceTimeframe = "H1",
                        symbolCode = cleanSymbol
                    ).filter { hasShallowHistory || sinceOpenTimeMs <= 0L || it.openTimeUtcMillis >= sinceOpenTimeMs }
                    if (aggregatedH4.isNotEmpty()) {
                        mergedCandles = CandleValidatorAlgorithm.mergeIdempotent(
                            existing = mergedCandles,
                            incoming = aggregatedH4,
                            timeframe = "H4",
                            nowUtcMillis = nowMillis
                        )
                    }
                }
            }
        }

        val fetchSucceeded = backendSucceeded || wsSucceeded
        if (!fetchSucceeded) {
            syncMode = "OFFLINE_CACHE"
        }

        val finalCandles = CandleValidatorAlgorithm.filterSyntheticWeekendAndCombCandles(
            mergedCandles,
            cleanSymbol,
            normTf
        ).takeLast(safeLimit)

        ProviderSyncResult(
            providerId = providerId,
            symbolCode = cleanSymbol,
            timeframe = normTf,
            candles = finalCandles,
            syncedAtUtcIso = UtcTimeAnchorAlgorithm.formatUtcIso(nowMillis),
            syncMode = syncMode,
            fetchedNewBars = fetchedNewBars,
            fetchSucceeded = fetchSucceeded,
            errorMessage = if (fetchSucceeded) null else errorMsg
        )
    }

    /**
     * Computes the open timestamp (UTC ms) of the most recent candle that SHOULD be closed at `nowMillis`,
     * accounting for the instrument's session calendar (CRYPTO_24_7 vs OTC_FX_METALS vs US_EQUITIES)
     * and Monday-anchored W1 weeks.
     */
    fun computeExpectedLastClosedOpenMs(
        timeframe: String,
        nowMillis: Long,
        symbolCode: String = "XAUUSD"
    ): Long {
        val normTf = timeframe.uppercase()
        val stepMs = UtcTimeAnchorAlgorithm.timeframeStepMillis(normTf)
        val currentBucketOpenMs = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(nowMillis, normTf)
        val candidateOpenMs = currentBucketOpenMs - stepMs

        if (normTf == "W1") {
            return currentBucketOpenMs - (7L * 86_400_000L)
        }

        val cal = UtcTimeAnchorAlgorithm.getSessionCalendar(symbolCode)
        if (cal == SessionCalendar.CRYPTO_24_7) {
            return candidateOpenMs
        }

        val zdt = Instant.ofEpochMilli(nowMillis).atZone(ZoneOffset.UTC)
        val dow = zdt.dayOfWeek
        val hour = zdt.hour

        if (normTf == "D1") {
            val todayMidnightMs = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(nowMillis, "D1")
            return when (dow) {
                DayOfWeek.MONDAY -> todayMidnightMs - (3L * 86_400_000L) // Friday 00:00 UTC
                DayOfWeek.SUNDAY -> todayMidnightMs - (2L * 86_400_000L) // Friday 00:00 UTC
                DayOfWeek.SATURDAY -> todayMidnightMs - 86_400_000L      // Friday 00:00 UTC
                else -> todayMidnightMs - 86_400_000L                    // Yesterday 00:00 UTC
            }
        }

        if (cal == SessionCalendar.US_EQUITIES && UtcTimeAnchorAlgorithm.isOtcWeekendClosed(nowMillis, symbolCode)) {
            if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) {
                val daysBackToFriday = if (dow == DayOfWeek.SATURDAY) 1L else 2L
                val fridayMidnightMs = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(nowMillis, "D1") - (daysBackToFriday * 86_400_000L)
                return fridayMidnightMs + (20L * 3_600_000L)
            }
        }

        if (dow == DayOfWeek.SATURDAY || (dow == DayOfWeek.SUNDAY && hour < 23)) {
            val daysBackToFriday = if (dow == DayOfWeek.SATURDAY) 1L else 2L
            val fridayMidnightMs = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(nowMillis, "D1") - (daysBackToFriday * 86_400_000L)
            return when (normTf) {
                "H4" -> fridayMidnightMs + (20L * 3_600_000L)
                "H1" -> fridayMidnightMs + (21L * 3_600_000L)
                "M30" -> fridayMidnightMs + (21L * 3_600_000L) + (30L * 60_000L)
                else -> fridayMidnightMs + (21L * 3_600_000L) + (45L * 60_000L)
            }
        }

        return candidateOpenMs
    }

    /**
     * Connects directly to `wss://data.tradingview.com/socket.io/websocket` via OkHttp WebSocket
     * and retrieves closed OHLCV bars for `(symbolCode, timeframe)`.
     */
    private fun fetchDirectFromTradingViewWs(
        symbolCode: String,
        timeframe: String,
        nBars: Int,
        nowMillis: Long
    ): List<CandleBar> {
        val normTf = timeframe.uppercase()
        val tvInterval = when (normTf) {
            "M15" -> "15"
            "M30" -> "30"
            "H1" -> "60"
            "H4" -> "240"
            "D1" -> "1D"
            "W1", "1W" -> "1W"
            else -> "15"
        }
        val (exchange, tvTicker) = when (symbolCode.uppercase()) {
            "SPOTBRENT" -> "PEPPERSTONE" to "SPOTBRENT"
            "BRENT_FUTURES" -> "NYMEX" to "BZ1!"
            "USOIL" -> "TVC" to "USOIL"
            "XAUUSD" -> "OANDA" to "XAUUSD"
            "XAGUSD" -> "OANDA" to "XAGUSD"
            "EURUSD" -> "OANDA" to "EURUSD"
            "GBPUSD" -> "OANDA" to "GBPUSD"
            "USDJPY" -> "OANDA" to "USDJPY"
            "BTCUSD" -> "COINBASE" to "BTCUSD"
            "ETHUSD" -> "COINBASE" to "ETHUSD"
            "SPX500USD" -> "OANDA" to "SPX500USD"
            "NDQ" -> "NASDAQ" to "NDX"
            "NVDA" -> "NASDAQ" to "NVDA"
            "AMZN" -> "NASDAQ" to "AMZN"
            "TSLA" -> "NASDAQ" to "TSLA"
            "AAPL" -> "NASDAQ" to "AAPL"
            "GOOGL" -> "NASDAQ" to "GOOGL"
            "MSFT" -> "NASDAQ" to "MSFT"
            "META" -> "NASDAQ" to "META"
            "NFLX" -> "NASDAQ" to "NFLX"
            "AMD" -> "NASDAQ" to "AMD"
            "UBER" -> "NYSE" to "UBER"
            "NKE" -> "NYSE" to "NKE"
            "IBM" -> "NYSE" to "IBM"
            "SAN" -> "NYSE" to "SAN"
            else -> "PEPPERSTONE" to symbolCode.uppercase()
        }

        val stepMs = UtcTimeAnchorAlgorithm.timeframeStepMillis(normTf)
        val rawBuffer = StringBuilder()
        val latch = CountDownLatch(1)
        val chartSession = "cs_" + UUID.randomUUID().toString().replace("-", "").take(12)

        val request = Request.Builder()
            .url("wss://data.tradingview.com/socket.io/websocket?from=chart%2F")
            .header("Origin", "https://www.tradingview.com")
            .header("User-Agent", "Mozilla/5.0")
            .build()

        val ws = httpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                val symObj = JSONObject()
                    .put("symbol", "$exchange:$tvTicker")
                    .put("adjustment", "splits")
                    .put("session", "regular")
                    .toString()

                webSocket.send(tvPackMsg("set_auth_token", JSONArray().put("unauthorized_user_token")))
                webSocket.send(tvPackMsg("chart_create_session", JSONArray().put(chartSession).put("")))
                webSocket.send(tvPackMsg("switch_timezone", JSONArray().put(chartSession).put("Etc/UTC")))
                webSocket.send(tvPackMsg("resolve_symbol", JSONArray().put(chartSession).put("symbol_1").put("=$symObj")))
                webSocket.send(
                    tvPackMsg(
                        "create_series",
                        JSONArray().put(chartSession).put("s1").put("s1").put("symbol_1").put(tvInterval).put(nBars)
                    )
                )
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (text.startsWith("~m~") && text.contains("~h~")) {
                    webSocket.send(text)
                    return
                }
                synchronized(rawBuffer) {
                    rawBuffer.append(text)
                    if (rawBuffer.contains("\"series_completed\"") || text.contains("\"symbol_error\"")) {
                        latch.countDown()
                    }
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                latch.countDown()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                latch.countDown()
            }
        })

        try {
            latch.await(10, TimeUnit.SECONDS)
        } finally {
            runCatching { ws.close(1000, "done") }
        }

        val collected = synchronized(rawBuffer) { rawBuffer.toString() }
        if (collected.isBlank()) return emptyList()

        val result = ArrayList<CandleBar>()
        val regex = Regex("\"s\":\\[(\\{\"i\":.*?\\})\\]", setOf(RegexOption.DOT_MATCHES_ALL))
        for (match in regex.findAll(collected)) {
            val arrStr = "[" + match.groupValues[1] + "]"
            val items = runCatching { JSONArray(arrStr) }.getOrNull() ?: continue
            for (i in 0 until items.length()) {
                val v = items.optJSONObject(i)?.optJSONArray("v") ?: continue
                if (v.length() < 5) continue
                val epochSec = v.optDouble(0, 0.0).toLong()
                if (epochSec <= 0L) continue
                val rawMs = epochSec * 1000L

                val openMs = when (normTf) {
                    "D1" -> {
                        val hourUtc = Instant.ofEpochSecond(epochSec).atZone(ZoneOffset.UTC).hour
                        val adjustedMs = if (hourUtc >= 21) rawMs + (4L * 3_600_000L) else rawMs
                        val snapped = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(adjustedMs, "D1")
                        if (rawMs + stepMs > nowMillis || snapped + stepMs > nowMillis) continue
                        snapped
                    }
                    "H4" -> {
                        val snapped = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(rawMs, "H4")
                        if (rawMs + stepMs > nowMillis || snapped + stepMs > nowMillis) continue
                        snapped
                    }
                    else -> {
                        val snapped = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(rawMs, normTf)
                        if (snapped + stepMs > nowMillis) continue
                        snapped
                    }
                }

                CandleValidatorAlgorithm.sanitizeAndValidate(
                    rawOpenTimeMillis = openMs,
                    timeframe = normTf,
                    open = BigDecimal.valueOf(v.optDouble(1, 0.0)),
                    high = BigDecimal.valueOf(v.optDouble(2, 0.0)),
                    low = BigDecimal.valueOf(v.optDouble(3, 0.0)),
                    close = BigDecimal.valueOf(v.optDouble(4, 0.0)),
                    volume = BigDecimal.valueOf(if (v.length() > 5) v.optDouble(5, 0.0) else 0.0)
                )?.let { result.add(it) }
            }
        }

        return CandleValidatorAlgorithm.filterSyntheticWeekendAndCombCandles(
            result.sortedBy { it.openTimeUtcMillis },
            symbolCode,
            normTf
        )
    }

    private fun tvPackMsg(func: String, params: JSONArray): String {
        val payload = JSONObject().put("m", func).put("p", params).toString()
        return "~m~${payload.length}~m~$payload"
    }

    private fun parseBackendResponse(
        body: String,
        symbolCode: String,
        timeframe: String,
        nowMillis: Long
    ): List<CandleBar> {
        val root = JSONObject(body)
        if (!root.optBoolean("ok", false)) return emptyList()
        val arr = root.optJSONObject("data")?.optJSONArray("candles") ?: return emptyList()
        val result = ArrayList<CandleBar>(arr.length())
        for (i in 0 until arr.length()) {
            val c = arr.getJSONObject(i)
            val ts = c.optLong("open_time_utc_ms", 0L)
            if (ts <= 0L || !UtcTimeAnchorAlgorithm.isCandleClosed(ts, timeframe, nowMillis)) continue
            if (timeframe == "D1" && UtcTimeAnchorAlgorithm.getSessionCalendar(symbolCode) != SessionCalendar.CRYPTO_24_7) {
                val dow = Instant.ofEpochMilli(ts).atZone(ZoneOffset.UTC).dayOfWeek
                if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) continue
            }
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
        return CandleValidatorAlgorithm.filterSyntheticWeekendAndCombCandles(
            result.sortedBy { it.openTimeUtcMillis },
            symbolCode,
            timeframe
        )
    }
}
