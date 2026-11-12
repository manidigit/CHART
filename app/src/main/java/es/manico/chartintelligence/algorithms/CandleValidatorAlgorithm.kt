package es.manico.chartintelligence.algorithms

import es.manico.chartintelligence.data.model.CandleBar
import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.abs

/**
 * Independent Algorithm Library Module:
 * Validates OHLC mathematical invariants, enforces DECIMAL(18,8) scale without float drift,
 * filters synthetic weekend micro-spread "comb/barcode" ticks, and performs idempotent upsert merging.
 */
object CandleValidatorAlgorithm {

    private const val DECIMAL_SCALE = 8

    fun normalizeDecimal(value: BigDecimal): BigDecimal {
        return value.setScale(DECIMAL_SCALE, RoundingMode.HALF_UP)
    }

    fun sanitizeAndValidate(
        rawOpenTimeMillis: Long,
        timeframe: String,
        open: BigDecimal,
        high: BigDecimal,
        low: BigDecimal,
        close: BigDecimal,
        volume: BigDecimal
    ): CandleBar? {
        if (open <= BigDecimal.ZERO || close <= BigDecimal.ZERO) return null
        val anchoredOpenMillis = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(rawOpenTimeMillis, timeframe)
        val normalizedOpen = normalizeDecimal(open)
        val normalizedClose = normalizeDecimal(close)
        val trueHigh = maxOf(normalizeDecimal(high), normalizedOpen, normalizedClose)
        val trueLow = minOf(normalizeDecimal(low), normalizedOpen, normalizedClose)
        val safeVolume = if (volume < BigDecimal.ZERO) BigDecimal.ZERO else normalizeDecimal(volume)

        return CandleBar(
            openTimeUtcMillis = anchoredOpenMillis,
            openTimeUtcIso = UtcTimeAnchorAlgorithm.formatUtcIso(anchoredOpenMillis),
            open = normalizedOpen,
            high = trueHigh,
            low = trueLow,
            close = normalizedClose,
            volume = safeVolume,
            isClosed = true
        )
    }

    /**
     * Filters out synthetic weekend off-market ticks (e.g., Twelve Data weekend XAU/USD flat bars
     * with volume=0 and micro-spread high-low < 0.02% of open) that cause vertical "comb/barcode"
     * chart distortion on M15/H1.
     */
    fun filterSyntheticWeekendAndCombCandles(
        candles: List<CandleBar>,
        symbolCode: String = "XAUUSD",
        timeframe: String = "M15"
    ): List<CandleBar> {
        if (candles.isEmpty()) return emptyList()
        val normTf = timeframe.uppercase()
        val isIntraday = normTf != "D1" && normTf != "W1"

        // Step 1: Remove intraday bars during OTC weekend closure that have zero volume or micro-range
        val step1 = candles.filter { bar ->
            val openD = bar.open.toDouble()
            val rangeD = (bar.high - bar.low).toDouble()
            val volD = bar.volume.toDouble()
            val isMicroRange = openD > 0.0 && (rangeD / openD) < 0.00018
            val isWeekend = isIntraday && UtcTimeAnchorAlgorithm.isOtcWeekendClosed(bar.openTimeUtcMillis, symbolCode)
            !(isWeekend && (volD <= 0.0 || isMicroRange))
        }
        if (step1.size < 4) return step1

        // Step 2: Detect any remaining synthetic "comb" clusters (>= 3 consecutive bars with
        // virtually identical open price, zero volume, and micro high-low range < 0.018% of open)
        val result = ArrayList<CandleBar>(step1.size)
        var i = 0
        while (i < step1.size) {
            val anchor = step1[i]
            val anchorOpen = anchor.open.toDouble()
            var runEnd = i
            while (runEnd < step1.size) {
                val cur = step1[runEnd]
                val curOpen = cur.open.toDouble()
                val curRange = (cur.high - cur.low).toDouble()
                val sameOpen = anchorOpen > 0.0 && abs(curOpen - anchorOpen) / anchorOpen < 0.00005
                val microSpread = anchorOpen > 0.0 && (curRange / anchorOpen) < 0.00018
                if (sameOpen && microSpread && cur.volume.toDouble() <= 0.0) {
                    runEnd++
                } else {
                    break
                }
            }
            val runLen = runEnd - i
            if (runLen >= 3) {
                // Skip this synthetic off-market comb cluster
                i = runEnd
            } else {
                result.add(anchor)
                i++
            }
        }
        return result
    }

    /**
     * Merges existing and newly fetched candles idempotently by [openTimeUtcMillis],
     * keeping only closed candles sorted chronologically.
     */
    fun mergeIdempotent(
        existing: List<CandleBar>,
        incoming: List<CandleBar>,
        timeframe: String,
        nowUtcMillis: Long = System.currentTimeMillis()
    ): List<CandleBar> {
        val byTimestamp = LinkedHashMap<Long, CandleBar>()
        for (candle in existing) {
            if (UtcTimeAnchorAlgorithm.isCandleClosed(candle.openTimeUtcMillis, timeframe, nowUtcMillis)) {
                byTimestamp[candle.openTimeUtcMillis] = candle
            }
        }
        for (candle in incoming) {
            if (UtcTimeAnchorAlgorithm.isCandleClosed(candle.openTimeUtcMillis, timeframe, nowUtcMillis)) {
                byTimestamp[candle.openTimeUtcMillis] = candle
            }
        }
        return byTimestamp.values.sortedBy { it.openTimeUtcMillis }
    }
}
