package es.manico.chartintelligence.algorithms

import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

enum class MarketStatus {
    LIVE,
    MARKET_CLOSED,
    DELAYED,
    CACHED,
    ERROR
}

/**
 * Independent Algorithm Library Module:
 * Anchors all candle timestamps to 00:00:00 UTC, filters out incomplete (still-open) candles,
 * and evaluates OTC weekend closure / semantic feed freshness.
 */
object UtcTimeAnchorAlgorithm {

    private val isoUtcFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm 'UTC'").withZone(ZoneOffset.UTC)

    private val otcWeekendSymbols = setOf(
        "XAUUSD",
        "XAGUSD",
        "EURUSD",
        "SPOTBRENT",
        "BRENT_FUTURES"
    )

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

    /**
     * Returns true if [epochMillis] falls within the global OTC weekend market closure window
     * (Friday >= 22:00 UTC, all day Saturday, or Sunday < 22:00 UTC) for FX/Metals/Commodities.
     */
    fun isOtcWeekendClosed(epochMillis: Long, symbolCode: String = "XAUUSD"): Boolean {
        val code = symbolCode.trim().uppercase()
        if (code !in otcWeekendSymbols && !code.startsWith("XAU") && !code.startsWith("EUR")) {
            return false
        }
        val zdt = ZonedDateTime.ofInstant(Instant.ofEpochMilli(epochMillis), ZoneOffset.UTC)
        return when (zdt.dayOfWeek) {
            DayOfWeek.SATURDAY -> true
            DayOfWeek.SUNDAY -> zdt.hour < 22
            DayOfWeek.FRIDAY -> zdt.hour >= 22
            else -> false
        }
    }

    /**
     * Evaluates the honest semantic market status for the Top Bar and Status Pill.
     */
    fun determineMarketStatus(
        symbolCode: String,
        timeframe: String,
        lastCandleOpenUtcMillis: Long?,
        nowUtcMillis: Long = System.currentTimeMillis(),
        hasError: Boolean = false
    ): MarketStatus {
        if (hasError) return MarketStatus.ERROR
        if (lastCandleOpenUtcMillis == null || lastCandleOpenUtcMillis <= 0L) {
            return MarketStatus.CACHED
        }
        if (isOtcWeekendClosed(nowUtcMillis, symbolCode)) {
            return MarketStatus.MARKET_CLOSED
        }
        val step = timeframeStepMillis(timeframe)
        val latestExpectedClosedOpen = snapToCandleOpenUtc(nowUtcMillis, timeframe) - step
        val ageSteps = ((latestExpectedClosedOpen - lastCandleOpenUtcMillis) / step).coerceAtLeast(0L)
        return when {
            ageSteps <= 2L -> MarketStatus.LIVE
            ageSteps <= 8L -> MarketStatus.DELAYED
            else -> MarketStatus.CACHED
        }
    }

    fun formatUtcIso(epochMillis: Long): String {
        return isoUtcFormatter.format(Instant.ofEpochMilli(epochMillis))
    }
}
