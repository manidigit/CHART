package es.manico.chartintelligence.algorithms

import es.manico.chartintelligence.data.model.CandleBar
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Independent Algorithm Library Module:
 * Validates OHLC mathematical invariants, enforces DECIMAL(18,8) scale without float drift,
 * and performs idempotent upsert merging by openTimeUtcMillis.
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
