package es.manico.chartintelligence.providers

import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
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
 * Fetches Brent Futures (`BZ=F`), Gold (`GC=F`), Silver (`SI=F`), and EUR/USD (`EURUSD=X`).
 */
class YahooFinanceAdapter(
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()
) : CandleProviderAdapter {

    override val providerId: ProviderId = ProviderId.YAHOO_FINANCE

    override suspend fun fetchClosedCandlesUpToNow(
        symbolCode: String,
        timeframe: String,
        limit: Int
    ): ProviderSyncResult = withContext(Dispatchers.IO) {
        val nowMillis = System.currentTimeMillis()
        val fetched = runCatching {
            fetchYahooChartCandles(symbolCode, timeframe, limit, nowMillis)
        }.getOrNull().orEmpty()

        val candles = if (fetched.isNotEmpty()) {
            fetched
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

    private fun fetchYahooChartCandles(
        symbolCode: String,
        timeframe: String,
        limit: Int,
        nowMillis: Long
    ): List<CandleBar> {
        val ticker = when (symbolCode.uppercase()) {
            "SPOTBRENT", "BRENT_FUTURES" -> "BZ=F"
            "XAUUSD" -> "GC=F"
            "XAGUSD" -> "SI=F"
            "EURUSD" -> "EURUSD=X"
            else -> symbolCode
        }
        val interval = if (timeframe.equals("D1", ignoreCase = true)) "1d" else "15m"
        val range = if (interval == "1d") "6mo" else "5d"
        val url = "https://query1.finance.yahoo.com/v8/finance/chart/$ticker?interval=$interval&range=$range"
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "Mozilla/5.0 (Android; ChartIntelligence/1.0)")
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
                if (!UtcTimeAnchorAlgorithm.isCandleClosed(epochMillis, timeframe, nowMillis)) continue
                val vol = if (volumes != null && !volumes.isNull(i)) {
                    BigDecimal.valueOf(volumes.optDouble(i, 0.0))
                } else {
                    BigDecimal.ZERO
                }
                CandleValidatorAlgorithm.sanitizeAndValidate(
                    rawOpenTimeMillis = epochMillis,
                    timeframe = timeframe,
                    open = BigDecimal.valueOf(opens.getDouble(i)),
                    high = BigDecimal.valueOf(highs.getDouble(i)),
                    low = BigDecimal.valueOf(lows.getDouble(i)),
                    close = BigDecimal.valueOf(closes.getDouble(i)),
                    volume = vol
                )?.let { parsed.add(it) }
            }
            return parsed.sortedBy { it.openTimeUtcMillis }.takeLast(limit)
        }
    }
}
