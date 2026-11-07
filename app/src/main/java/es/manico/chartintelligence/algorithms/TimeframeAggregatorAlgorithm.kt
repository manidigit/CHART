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

    fun aggregateCandles(
        sourceCandles: List<CandleBar>,
        targetTimeframe: String,
        nowUtcMillis: Long = System.currentTimeMillis()
    ): List<CandleBar> {
        if (sourceCandles.isEmpty()) return emptyList()

        val sortedUnique = sourceCandles
            .sortedBy { it.openTimeUtcMillis }
            .distinctBy { it.openTimeUtcMillis }

        val targetStep = UtcTimeAnchorAlgorithm.timeframeStepMillis(targetTimeframe)
        val buckets = LinkedHashMap<Long, MutableList<CandleBar>>()

        for (bar in sortedUnique) {
            val bucketOpen = (bar.openTimeUtcMillis / targetStep) * targetStep
            if (!UtcTimeAnchorAlgorithm.isCandleClosed(bucketOpen, targetTimeframe, nowUtcMillis)) {
                continue
            }
            buckets.getOrPut(bucketOpen) { ArrayList() }.add(bar)
        }

        val aggregated = ArrayList<CandleBar>(buckets.size)
        for ((bucketOpenMillis, barsInBucket) in buckets) {
            if (barsInBucket.isEmpty()) continue
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
