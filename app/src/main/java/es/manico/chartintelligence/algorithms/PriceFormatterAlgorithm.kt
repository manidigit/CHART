package es.manico.chartintelligence.algorithms

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Independent Algorithm Library Module:
 * Formats all market prices, OHLC numbers, and timestamps strictly in Latin digits (Locale.US)
 * so financial figures remain LTR-aligned even when the UI is in Persian (RTL).
 */
object PriceFormatterAlgorithm {

    private val shortAxisTimeFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("MM-dd HH:mm", Locale.US).withZone(ZoneOffset.UTC)

    private val dailyAxisTimeFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.US).withZone(ZoneOffset.UTC)

    fun formatPrice(value: BigDecimal?, decimals: Int): String {
        if (value == null) return "—"
        val scaled = value.setScale(decimals, RoundingMode.HALF_UP)
        return String.format(Locale.US, "%.${decimals}f", scaled)
    }

    fun formatSignedPercentChange(open: BigDecimal, close: BigDecimal): String {
        if (open.compareTo(BigDecimal.ZERO) == 0) return "0.00%"
        val pct = close.subtract(open)
            .divide(open, 6, RoundingMode.HALF_UP)
            .multiply(BigDecimal(100))
            .setScale(2, RoundingMode.HALF_UP)
        val sign = if (pct > BigDecimal.ZERO) "+" else ""
        return String.format(Locale.US, "%s%.2f%%", sign, pct)
    }

    fun formatSignedPriceDiff(open: BigDecimal, close: BigDecimal, decimals: Int): String {
        val diff = close.subtract(open).setScale(decimals, RoundingMode.HALF_UP)
        val sign = if (diff > BigDecimal.ZERO) "+" else ""
        return String.format(Locale.US, "%s%.${decimals}f", sign, diff)
    }

    fun formatCompactVolume(volume: BigDecimal?): String {
        if (volume == null) return "0"
        val v = volume.toDouble()
        if (v <= 0.0) return "0"
        return when {
            v >= 1_000_000_000.0 -> String.format(Locale.US, "%.2fB", v / 1_000_000_000.0)
            v >= 1_000_000.0 -> String.format(Locale.US, "%.2fM", v / 1_000_000.0)
            v >= 1_000.0 -> String.format(Locale.US, "%.1fK", v / 1_000.0)
            else -> String.format(Locale.US, "%.0f", v)
        }
    }

    fun displayTimeframeLabel(tf: String): String {
        return when (tf.uppercase(Locale.US)) {
            "M15" -> "15m"
            "H1" -> "1h"
            "H4" -> "4h"
            "D1" -> "1D"
            "W1" -> "1W"
            else -> tf
        }
    }

    fun computeSmaValues(closes: List<Double>, period: Int = 20): List<Double?> {
        if (closes.isEmpty() || period <= 1) return closes.map { it }
        val result = ArrayList<Double?>(closes.size)
        var rollingSum = 0.0
        for (i in closes.indices) {
            rollingSum += closes[i]
            if (i >= period) {
                rollingSum -= closes[i - period]
            }
            if (i >= period - 1) {
                result.add(rollingSum / period.toDouble())
            } else {
                result.add(null)
            }
        }
        return result
    }

    fun computeEmaValues(closes: List<Double>, period: Int = 50): List<Double?> {
        if (closes.isEmpty() || period <= 1) return closes.map { it }
        val result = ArrayList<Double?>(closes.size)
        val k = 2.0 / (period.toDouble() + 1.0)
        var ema: Double? = null
        var sum = 0.0
        for (i in closes.indices) {
            val c = closes[i]
            if (i < period - 1) {
                sum += c
                result.add(null)
            } else if (i == period - 1) {
                sum += c
                ema = sum / period.toDouble()
                result.add(ema)
            } else {
                val prev = ema ?: c
                ema = (c - prev) * k + prev
                result.add(ema)
            }
        }
        return result
    }

    data class BollingerPoint(
        val middle: Double,
        val upper: Double,
        val lower: Double
    )

    fun computeBollingerBands(
        closes: List<Double>,
        period: Int = 20,
        mult: Double = 2.0
    ): List<BollingerPoint?> {
        if (closes.isEmpty() || period <= 1) return closes.map { null }
        val result = ArrayList<BollingerPoint?>(closes.size)
        for (i in closes.indices) {
            if (i < period - 1) {
                result.add(null)
            } else {
                var sum = 0.0
                for (j in (i - period + 1)..i) {
                    sum += closes[j]
                }
                val mean = sum / period.toDouble()
                var sqSum = 0.0
                for (j in (i - period + 1)..i) {
                    val d = closes[j] - mean
                    sqSum += d * d
                }
                val std = kotlin.math.sqrt(sqSum / period.toDouble())
                result.add(
                    BollingerPoint(
                        middle = mean,
                        upper = mean + mult * std,
                        lower = mean - mult * std
                    )
                )
            }
        }
        return result
    }

    private val m15H1AxisTimeFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("dd MMM HH:mm", Locale.US).withZone(ZoneOffset.UTC)

    private val h4AxisTimeFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("dd MMM HH:00", Locale.US).withZone(ZoneOffset.UTC)

    private val d1W1AxisTimeFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.US).withZone(ZoneOffset.UTC)

    private val hourOnlyFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("HH:mm", Locale.US).withZone(ZoneOffset.UTC)

    private val dayMonthFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("dd MMM", Locale.US).withZone(ZoneOffset.UTC)

    private val monthOnlyFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("MMM", Locale.US).withZone(ZoneOffset.UTC)

    private val monthYearFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("MMM yyyy", Locale.US).withZone(ZoneOffset.UTC)

    private val yearOnlyFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy", Locale.US).withZone(ZoneOffset.UTC)

    fun computeNiceAxisBounds(rawLow: Double, rawHigh: Double, intervals: Int = 4): Pair<Double, Double> {
        if (!rawLow.isFinite() || !rawHigh.isFinite() || rawHigh <= rawLow) {
            return Pair(rawLow, rawLow + 1.0)
        }
        val span = (rawHigh - rawLow).coerceAtLeast(1e-5)
        val roughStep = span / intervals.coerceAtLeast(2).toDouble()
        val mag = kotlin.math.floor(kotlin.math.log10(roughStep))
        val magPow = Math.pow(10.0, mag)
        val residual = roughStep / magPow
        val niceFraction = when {
            residual <= 1.2 -> 1.0
            residual <= 2.2 -> 2.0
            residual <= 3.0 -> 2.5
            residual <= 6.0 -> 5.0
            else -> 10.0
        }
        val niceStep = niceFraction * magPow
        val niceMin = kotlin.math.floor(rawLow / niceStep) * niceStep
        val niceMax = kotlin.math.ceil(rawHigh / niceStep) * niceStep
        return if (niceMax > niceMin) Pair(niceMin, niceMax) else Pair(rawLow, rawHigh)
    }

    /**
     * Generates institutional round price ticks (Heckbert nice numbers: 1, 2, 2.5, 5, 10 × 10^k)
     * strictly inside [minPrice..maxPrice] so the right Y-axis never shows awkward fractional numbers.
     */
    fun computeNicePriceTicks(minPrice: Double, maxPrice: Double, targetTicks: Int = 5): List<Double> {
        val span = maxPrice - minPrice
        if (!span.isFinite() || span <= 0.0) return listOf(minPrice)
        val rawStep = span / (targetTicks - 1).coerceAtLeast(2).toDouble()
        val mag = Math.pow(10.0, kotlin.math.floor(kotlin.math.log10(rawStep)))
        val norm = rawStep / mag
        val niceNorm = when {
            norm < 1.3 -> 1.0
            norm < 2.2 -> 2.0
            norm < 3.5 -> 2.5
            norm < 7.0 -> 5.0
            else -> 10.0
        }
        val step = niceNorm * mag
        val firstTick = kotlin.math.ceil(minPrice / step) * step
        val ticks = ArrayList<Double>()
        var v = firstTick
        var guard = 0
        while (v <= maxPrice + step * 0.001 && guard < 20) {
            if (v >= minPrice - step * 0.001 && v <= maxPrice + step * 0.001) {
                ticks.add(v)
            }
            v += step
            guard++
        }
        return if (ticks.size >= 2) ticks else listOf(minPrice, (minPrice + maxPrice) * 0.5, maxPrice)
    }

    data class SmartTimeTick(
        val index: Int,
        val label: String,
        val isMajor: Boolean
    )

    /**
     * Computes TradingView-standard span-aware X-axis labels:
     * - Visible span <= 2.2 days & intraday timeframe: shows HH:mm (or dd MMM on day rollover)
     * - Visible span <= 45 days: shows dd MMM (or MMM on month rollover)
     * - Visible span <= 540 days: shows dd MMM / MMM / yyyy on year rollover
     * - Multi-year span (> 540 days): shows MMM yyyy / yyyy
     */
    fun computeSmartTimeAxisTicks(
        timestampsMillis: List<Long>,
        timeframe: String,
        maxTicks: Int = 4
    ): List<SmartTimeTick> {
        val n = timestampsMillis.size
        if (n == 0) return emptyList()
        val firstTs = timestampsMillis.first()
        val lastTs = timestampsMillis.last()
        val spanDays = kotlin.math.max(0.0, (lastTs - firstTs).toDouble() / 86_400_000.0)
        val tfUpper = timeframe.uppercase(Locale.US)
        val isDailyOrHigher = tfUpper == "D1" || tfUpper == "W1"

        val step = kotlin.math.max(1, kotlin.math.floor(n.toDouble() / maxTicks.coerceAtLeast(2).toDouble()).toInt())
        val result = ArrayList<SmartTimeTick>()
        var prevYear = -1
        var prevMonth = -1
        var prevDay = -1

        var i = 0
        while (i < n) {
            val ts = timestampsMillis[i]
            val zdt = Instant.ofEpochMilli(ts).atZone(ZoneOffset.UTC)
            val yr = zdt.year
            val mo = zdt.monthValue
            val dy = zdt.dayOfMonth

            val label: String
            val isMajor: Boolean

            if (!isDailyOrHigher && spanDays <= 2.2) {
                if (dy != prevDay) {
                    label = dayMonthFormatter.format(zdt)
                    isMajor = true
                } else {
                    label = hourOnlyFormatter.format(zdt)
                    isMajor = false
                }
            } else if (!isDailyOrHigher && spanDays <= 16.0) {
                if (dy != prevDay) {
                    label = dayMonthFormatter.format(zdt)
                    isMajor = true
                } else {
                    label = hourOnlyFormatter.format(zdt)
                    isMajor = false
                }
            } else if (spanDays <= 180.0) {
                if (yr != prevYear && prevYear != -1) {
                    label = yearOnlyFormatter.format(zdt)
                    isMajor = true
                } else if (mo != prevMonth) {
                    label = if (spanDays > 75.0) monthOnlyFormatter.format(zdt) else dayMonthFormatter.format(zdt)
                    isMajor = true
                } else {
                    label = dayMonthFormatter.format(zdt)
                    isMajor = false
                }
            } else if (spanDays <= 730.0) {
                if (yr != prevYear) {
                    label = yearOnlyFormatter.format(zdt)
                    isMajor = true
                } else if (mo != prevMonth) {
                    label = monthOnlyFormatter.format(zdt)
                    isMajor = true
                } else {
                    label = dayMonthFormatter.format(zdt)
                    isMajor = false
                }
            } else {
                if (yr != prevYear) {
                    label = yearOnlyFormatter.format(zdt)
                    isMajor = true
                } else {
                    label = monthYearFormatter.format(zdt)
                    isMajor = false
                }
            }

            prevYear = yr
            prevMonth = mo
            prevDay = dy
            result.add(SmartTimeTick(index = i, label = label, isMajor = isMajor))
            i += step
        }
        return result
    }

    fun formatAxisTimestamp(epochMillis: Long, timeframe: String): String {
        val instant = Instant.ofEpochMilli(epochMillis)
        return when (timeframe.uppercase(Locale.US)) {
            "D1", "W1" -> d1W1AxisTimeFormatter.format(instant)
            "H4" -> h4AxisTimeFormatter.format(instant)
            else -> m15H1AxisTimeFormatter.format(instant)
        }
    }
}
