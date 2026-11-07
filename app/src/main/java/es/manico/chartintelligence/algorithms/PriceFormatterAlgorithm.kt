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

    fun formatAxisTimestamp(epochMillis: Long, timeframe: String): String {
        val instant = Instant.ofEpochMilli(epochMillis)
        return if (timeframe.equals("D1", ignoreCase = true)) {
            dailyAxisTimeFormatter.format(instant)
        } else {
            shortAxisTimeFormatter.format(instant)
        }
    }
}
