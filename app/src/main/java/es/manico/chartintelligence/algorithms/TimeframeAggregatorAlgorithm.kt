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

    private fun inferSourceStepMs(sortedCandles: List<CandleBar>): Long {
        var minDiff = Long.MAX_VALUE
        var prev: Long? = null
        val limit = minOf(40, sortedCandles.size)
        for (i in 0 until limit) {
            val ms = sortedCandles[i].openTimeUtcMillis
            if (prev != null && ms > prev) {
                val diff = ms - prev
                if (diff < minDiff) minDiff = diff
            }
            prev = ms
        }
        return if (minDiff == Long.MAX_VALUE) UtcTimeAnchorAlgorithm.timeframeStepMillis("M15") else minDiff
    }

    private fun minExpectedChildren(
        sourceStepMs: Long,
        targetStepMs: Long,
        sourceTf: String?,
        targetTf: String,
        symbolCode: String?
    ): Int {
        val dst = targetTf.uppercase()
        val isUsEq = symbolCode != null && UtcTimeAnchorAlgorithm.getSessionCalendar(symbolCode) == SessionCalendar.US_EQUITIES
        val isCrypto = symbolCode != null && UtcTimeAnchorAlgorithm.getSessionCalendar(symbolCode) == SessionCalendar.CRYPTO_24_7
        if (sourceTf != null) {
            val src = sourceTf.uppercase()
            return when ("$src->$dst") {
                "M15->M30" -> 2
                "M15->H1" -> 4
                "M15->H4" -> if (isUsEq) 6 else 8
                "M30->H1" -> 2
                "M30->H4" -> if (isUsEq) 3 else 4
                "H1->H4" -> if (isUsEq) 2 else 2
                "H1->D1" -> if (isUsEq) 5 else 12
                "H4->D1" -> if (isUsEq) 2 else 3
                "D1->W1" -> if (isCrypto) 5 else 3
                else -> 1
            }
        }
        if (sourceStepMs <= 0L || sourceStepMs >= targetStepMs) return 1
        if (dst == "W1" && sourceStepMs >= 86_400_000L) {
            return if (isCrypto) 5 else 3
        }
        val ratio = (targetStepMs / sourceStepMs).toInt().coerceAtLeast(1)
        if (dst == "D1" && sourceStepMs < 86_400_000L) {
            return if (isUsEq) maxOf(1, (ratio * 0.2).toInt()) else maxOf(2, (ratio * 0.5).toInt())
        }
        return if (isUsEq) maxOf(1, (ratio * 0.25).toInt()) else maxOf(2, kotlin.math.ceil(ratio * 0.5).toInt())
    }

    private fun hasContiguousChildren(
        ordered: List<CandleBar>,
        sourceStepMs: Long,
        targetTf: String,
        symbolCode: String
    ): Boolean {
        if (ordered.size <= 1 || sourceStepMs <= 0L) return true
        val dst = targetTf.uppercase()
        val cal = UtcTimeAnchorAlgorithm.getSessionCalendar(symbolCode)
        // Maximum allowed active-market gap between consecutive child bars in the same bucket:
        // For W1 from D1, allow up to 3 days (weekend + 1 holiday); for intraday buckets allow up to 3x sourceStepMs
        val maxActiveGapMs = if (dst == "W1") sourceStepMs * 4L else sourceStepMs * 3L
        for (i in 1 until ordered.size) {
            val prevMs = ordered[i - 1].openTimeUtcMillis
            val curMs = ordered[i].openTimeUtcMillis
            val rawGap = curMs - prevMs
            if (rawGap <= maxActiveGapMs) continue
            // Count only active market steps in between (skip OTC/US equity closed hours)
            if (cal == SessionCalendar.CRYPTO_24_7) {
                return false
            }
            var activeStepsMissed = 0L
            var probe = prevMs + sourceStepMs
            while (probe < curMs && activeStepsMissed <= 3L) {
                if (!UtcTimeAnchorAlgorithm.isOtcWeekendClosed(probe, symbolCode)) {
                    activeStepsMissed++
                }
                probe += sourceStepMs
            }
            if (activeStepsMissed > 2L) return false
        }
        return true
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

        val effectiveSymbol = symbolCode ?: "XAUUSD"
        val sourceStepMs = sourceTimeframe?.let { UtcTimeAnchorAlgorithm.timeframeStepMillis(it) }
            ?: inferSourceStepMs(sortedUnique)
        val targetStepMs = UtcTimeAnchorAlgorithm.timeframeStepMillis(targetTimeframe)

        val buckets = LinkedHashMap<Long, MutableList<CandleBar>>()
        val sessionAnchoredBuckets = HashSet<Long>()

        for (bar in sortedUnique) {
            val bounds = UtcTimeAnchorAlgorithm.getSessionBucketBounds(
                bar.openTimeUtcMillis,
                targetTimeframe,
                effectiveSymbol
            )
            if (bounds.closeMs > nowUtcMillis) {
                continue
            }
            if (bounds.sessionAnchored) {
                sessionAnchoredBuckets.add(bounds.openMs)
            }
            buckets.getOrPut(bounds.openMs) { ArrayList() }.add(bar)
        }

        val minChildren = minExpectedChildren(sourceStepMs, targetStepMs, sourceTimeframe, targetTimeframe, symbolCode)
        val aggregated = ArrayList<CandleBar>(buckets.size)
        val bucketEntries = buckets.entries.toList()
        val lastIdx = bucketEntries.lastIndex

        for ((idx, entry) in bucketEntries.withIndex()) {
            val bucketOpenMillis = entry.key
            val barsInBucket = entry.value
            if (barsInBucket.isEmpty()) continue
            val isBoundary = (bucketEntries.size > 1 && (idx == 0 || idx == lastIdx)) || sourceTimeframe != null
            if (isBoundary && barsInBucket.size < minChildren) continue
            val ordered = barsInBucket.sortedBy { it.openTimeUtcMillis }
            if (!hasContiguousChildren(ordered, sourceStepMs, targetTimeframe, effectiveSymbol)) continue

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
                volume = totalVolume,
                preserveOpenTime = bucketOpenMillis in sessionAnchoredBuckets
            )?.let { aggregated.add(it) }
        }

        return aggregated.sortedBy { it.openTimeUtcMillis }
    }
}
