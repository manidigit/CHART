package es.manico.chartintelligence.algorithms

import es.manico.chartintelligence.data.model.CandleBar
import java.math.BigDecimal

/**
 * Independent Algorithm Library Module:
 * Deterministic OHLCV timeframe aggregation anchored strictly at 00:00:00 UTC.
 *
 * Aggregates lower-timeframe closed candles (e.g., M15 or H1) into higher timeframes
 * (M15, H1, H4, D1) with exact financial rules:
 * - Open  = open of the chronologically first candle in the UTC bucket
 * - High  = maximum high across all candles in the UTC bucket
 * - Low   = minimum low across all candles in the UTC bucket
 * - Close = close of the chronologically last candle in the UTC bucket
 * - Volume = sum of volumes across all candles in the UTC bucket
 *
 * Only closed target buckets (bucketOpen + targetStep <= nowUtcMillis) are returned,
 * sorted strictly in ascending chronological order with zero duplicate timestamps.
 */
object TimeframeAggregatorAlgorithm {

    private fun minExpectedChildren(
        sourceTf: String?,
        targetTf: String,
        symbolCode: String?
    ): Int {
        val src = sourceTf?.uppercase() ?: return 1
        val dst = targetTf.uppercase()
        val isUsEq = symbolCode != null && UtcTimeAnchorAlgorithm.getSessionCalendar(symbolCode) == SessionCalendar.US_EQUITIES
        val isCrypto = symbolCode != null && UtcTimeAnchorAlgorithm.getSessionCalendar(symbolCode) == SessionCalendar.CRYPTO_24_7
        return when ("$src->$dst") {
            "M15->M30" -> 2
            "M15->H1" -> 4
            "M15->H4" -> if (isUsEq) 8 else 12
            "M30->H1" -> 2
            "M30->H4" -> if (isUsEq) 4 else 6
            "H1->H4" -> if (isUsEq) 2 else 3
            "H1->D1" -> if (isUsEq) 5 else 16
            "H4->D1" -> if (isUsEq) 2 else 4
            "D1->W1" -> if (isCrypto) 5 else 4
            else -> 1
        }
    }

    fun aggregateCandles(
        sourceCandles: List<CandleBar>,
        targetTimeframe: String,
        nowUtcMillis: Long = System.currentTimeMillis(),
        sourceTimeframe: String? = null,
        symbolCode: String? = null
    ): List<CandleBar> {
        if (sourceCandles.isEmpty()) return emptyList()

        val sortedUnique = sourceCandles
            .sortedBy { it.openTimeUtcMillis }
            .distinctBy { it.openTimeUtcMillis }

        val buckets = LinkedHashMap<Long, MutableList<CandleBar>>()
        val effectiveSymbol = symbolCode ?: "XAUUSD"

        for (bar in sortedUnique) {
            val bounds = UtcTimeAnchorAlgorithm.getSessionBucketBounds(
                bar.openTimeUtcMillis,
                targetTimeframe,
                effectiveSymbol
            )
            if (bounds.closeMs > nowUtcMillis) {
                continue
            }
            buckets.getOrPut(bounds.openMs) { ArrayList() }.add(bar)
        }

        val minChildren = minExpectedChildren(sourceTimeframe, targetTimeframe, symbolCode)
        val aggregated = ArrayList<CandleBar>(buckets.size)
        for ((bucketOpenMillis, barsInBucket) in buckets) {
            if (barsInBucket.isEmpty() || barsInBucket.size < minChildren) continue
            val ordered = barsInBucket.sortedBy { it.openTimeUtcMillis }
            val openPrice = ordered.first().open
            val closePrice = ordered.last().close
            var highPrice = ordered.first().high
            var lowPrice = ordered.first().low
            var totalVolume = BigDecimal.ZERO

            for (item in ordered) {
                if (item.high > highPrice) highPrice = item.high
                if (item.low < lowPrice) lowPrice = item.low
                totalVolume = totalVolume.add(item.volume)
            }

            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = bucketOpenMillis,
                timeframe = targetTimeframe,
                open = openPrice,
                high = highPrice,
                low = lowPrice,
                close = closePrice,
                volume = totalVolume
            )?.let { aggregated.add(it) }
        }

        return aggregated.sortedBy { it.openTimeUtcMillis }
    }
}
