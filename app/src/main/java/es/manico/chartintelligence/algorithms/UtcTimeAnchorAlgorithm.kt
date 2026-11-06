package es.manico.chartintelligence.algorithms

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * Independent Algorithm Library Module:
 * Anchors all candle timestamps to 00:00:00 UTC and filters out incomplete (still-open) candles.
 */
object UtcTimeAnchorAlgorithm {

    private val isoUtcFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm 'UTC'").withZone(ZoneOffset.UTC)

    fun timeframeStepMillis(timeframe: String): Long {
        return when (timeframe.uppercase()) {
            "M15" -> 15L * 60L * 1000L
            "M30" -> 30L * 60L * 1000L
            "H1" -> 60L * 60L * 1000L
            "H4" -> 4L * 60L * 60L * 1000L
            "D1" -> 24L * 60L * 60L * 1000L
            else -> 15L * 60L * 1000L
        }
    }

    /**
     * Floors any epoch millisecond timestamp to its canonical candle open boundary
     * anchored at 00:00:00 UTC.
     */
    fun snapToCandleOpenUtc(epochMillis: Long, timeframe: String): Long {
        val step = timeframeStepMillis(timeframe)
        return (epochMillis / step) * step
    }

    /**
     * Returns true only if the candle's [openTimeUtcMillis + step] is <= [nowUtcMillis],
     * guaranteeing no incomplete/unclosed candle contaminates storage or indicators.
     */
    fun isCandleClosed(
        openTimeUtcMillis: Long,
        timeframe: String,
        nowUtcMillis: Long = System.currentTimeMillis()
    ): Boolean {
        val step = timeframeStepMillis(timeframe)
        return (openTimeUtcMillis + step) <= nowUtcMillis
    }

    fun formatUtcIso(epochMillis: Long): String {
        return isoUtcFormatter.format(Instant.ofEpochMilli(epochMillis))
    }
}
