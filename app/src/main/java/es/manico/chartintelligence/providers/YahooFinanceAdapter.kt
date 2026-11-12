package es.manico.chartintelligence.providers

import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.algorithms.TimeframeAggregatorAlgorithm
import es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm
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
 * Independent Data Provider Adapter: Yahoo Finance (`yahoo_finance`).
 * Fetches real closed market candles for Brent (`BZ=F`), Gold (`GC=F`), Silver (`SI=F`), and EUR/USD (`EURUSD=X`)
 * across M15, H1, H4 (aggregated from 60m), and D1 timeframes. Never fabricates synthetic data.
 */
class YahooFinanceAdapter(
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()
) : CandleProviderAdapter {

    override val providerId: ProviderId = ProviderId.YAHOO_FINANCE

    override suspend fun fetchClosedCandlesUpToNow(
        symbolCode: String,
        timeframe: String,
        limit: Int,
        sinceOpenTimeMs: Long
    ): ProviderSyncResult = withContext(Dispatchers.IO) {
        val nowMillis = System.currentTimeMillis()
        val candles = runCatching {
            fetchYahooChartCandles(symbolCode, timeframe, limit, nowMillis, sinceOpenTimeMs)
        }.getOrNull().orEmpty()

        ProviderSyncResult(
            providerId = providerId,
            symbolCode = symbolCode,
            timeframe = timeframe,
            candles = candles,
            syncedAtUtcIso = UtcTimeAnchorAlgorithm.formatUtcIso(nowMillis),
            syncMode = if (sinceOpenTimeMs > 0L) "DELTA_SYNC" else "INITIAL_BACKFILL",
            fetchedNewBars = candles.size
        )
    }

    fun fetchYahooChartCandles(
        symbolCode: String,
        timeframe: String,
        limit: Int,
        nowMillis: Long = System.currentTimeMillis(),
        sinceOpenTimeMs: Long = 0L
    ): List<CandleBar> {
        val ticker = when (symbolCode.uppercase()) {
            "SPOTBRENT", "BRENT_FUTURES" -> "BZ=F"
            "USOIL" -> "CL=F"
            "XAUUSD" -> "GC=F"
            "XAGUSD" -> "SI=F"
            "EURUSD" -> "EURUSD=X"
            "GBPUSD" -> "GBPUSD=X"
            "USDJPY" -> "JPY=X"
            "BTCUSD" -> "BTC-USD"
            "ETHUSD" -> "ETH-USD"
            "SPX500USD" -> "^GSPC"
            "NDQ" -> "^NDX"
            else -> symbolCode.uppercase()
        }
        val normalizedTf = timeframe.uppercase()
        val (interval, range, sourceTf) = when (normalizedTf) {
            "W1" -> Triple("1wk", "10y", "W1")
            "D1" -> Triple("1d", "10y", "D1")
            "H4" -> Triple("60m", "730d", "H1")
            "H1" -> Triple("60m", "730d", "H1")
            "M30" -> Triple("30m", "60d", "M30")
            else -> Triple("15m", "60d", "M15")
        }

        val url = if (sinceOpenTimeMs > 0L) {
            val period1 = ((sinceOpenTimeMs / 1000L) - 14400L).coerceAtLeast(0L)
            val period2 = (nowMillis / 1000L) + 60L
            "https://query1.finance.yahoo.com/v8/finance/chart/$ticker?interval=$interval&period1=$period1&period2=$period2"
        } else {
            "https://query1.finance.yahoo.com/v8/finance/chart/$ticker?interval=$interval&range=$range"
        }
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "Mozilla/5.0 (Android; ChartIntelligence/1.23)")
            .get()
            .build()

        httpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return emptyList()
            val root = JSONObject(response.body?.string().orEmpty())
            val resultArr = root.optJSONObject("chart")?.optJSONArray("result") ?: return emptyList()
            if (resultArr.length() == 0) return emptyList()
            val first = resultArr.getJSONObject(0)
            val timestamps = first.optJSONArray("timestamp") ?: return emptyList()
            val quote = first.optJSONObject("indicators")
                ?.optJSONArray("quote")
                ?.optJSONObject(0) ?: return emptyList()

            val opens = quote.optJSONArray("open") ?: return emptyList()
            val highs = quote.optJSONArray("high") ?: return emptyList()
            val lows = quote.optJSONArray("low") ?: return emptyList()
            val closes = quote.optJSONArray("close") ?: return emptyList()
            val volumes = quote.optJSONArray("volume")

            val parsed = ArrayList<CandleBar>()
            for (i in 0 until timestamps.length()) {
                if (opens.isNull(i) || highs.isNull(i) || lows.isNull(i) || closes.isNull(i)) continue
                val epochMillis = timestamps.getLong(i) * 1000L
                if (!UtcTimeAnchorAlgorithm.isCandleClosed(epochMillis, sourceTf, nowMillis)) continue
                val vol = if (volumes != null && !volumes.isNull(i)) {
                    BigDecimal.valueOf(volumes.optDouble(i, 0.0))
                } else {
                    BigDecimal.ZERO
                }
                CandleValidatorAlgorithm.sanitizeAndValidate(
                    rawOpenTimeMillis = epochMillis,
                    timeframe = sourceTf,
                    open = BigDecimal.valueOf(opens.getDouble(i)),
                    high = BigDecimal.valueOf(highs.getDouble(i)),
                    low = BigDecimal.valueOf(lows.getDouble(i)),
                    close = BigDecimal.valueOf(closes.getDouble(i)),
                    volume = vol
                )?.let { parsed.add(it) }
            }

            val ordered = parsed.sortedBy { it.openTimeUtcMillis }
            val finalCandles = if (normalizedTf == "H4") {
                TimeframeAggregatorAlgorithm.aggregateCandles(ordered, "H4", nowMillis)
            } else {
                ordered
            }
            return finalCandles.takeLast(limit)
        }
    }
}
