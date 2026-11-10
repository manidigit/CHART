package es.manico.chartintelligence.data.model

import java.math.BigDecimal

/**
 * Supported chart visualization types in Phase 1.
 */
enum class ChartType(val id: String) {
    CANDLESTICK("candlestick"),
    LINE("line");

    companion object {
        fun fromId(id: String?): ChartType {
            return entries.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: CANDLESTICK
        }
    }
}

/**
 * Supported interactive chart tools (Cursor/Crosshair + Drawing Tools).
 */
enum class DrawingTool(val id: String) {
    CURSOR("cursor"),
    HORIZONTAL_LINE("horizontal_line"),
    VERTICAL_LINE("vertical_line"),
    TREND_LINE("trend_line"),
    FIB_RETRACEMENT("fib_retracement"),
    LONG_POSITION("long_position"),
    SHORT_POSITION("short_position");

    companion object {
        fun fromId(id: String?): DrawingTool {
            return entries.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: CURSOR
        }
    }
}

data class FibLevelSpec(
    val ratio: Double,
    val price: BigDecimal,
    val label: String,
    val isGolden: Boolean = false
)

/**
 * Market-coordinate-anchored drawing primitive.
 * Every drawing is stored in real (timeUtcMillis, price) coordinates so it stays locked to its
 * exact market level across Zoom, Pan, and Timeframe switches.
 * Supports per-drawing custom colorHex and strokeWidthDp.
 */
sealed class ChartDrawing {
    abstract val id: String
    abstract val colorHex: String?
    abstract val strokeWidthDp: Float

    data class HorizontalLine(
        override val id: String,
        val price: BigDecimal,
        override val colorHex: String? = null,
        override val strokeWidthDp: Float = 2.2f
    ) : ChartDrawing()

    data class VerticalLine(
        override val id: String,
        val timeUtcMillis: Long,
        override val colorHex: String? = null,
        override val strokeWidthDp: Float = 2.2f
    ) : ChartDrawing()

    data class TrendLine(
        override val id: String,
        val startTimeUtcMillis: Long,
        val startPrice: BigDecimal,
        val endTimeUtcMillis: Long,
        val endPrice: BigDecimal,
        override val colorHex: String? = null,
        override val strokeWidthDp: Float = 2.2f
    ) : ChartDrawing()

    data class FibRetracement(
        override val id: String,
        val startTimeUtcMillis: Long,
        val startPrice: BigDecimal,
        val endTimeUtcMillis: Long,
        val endPrice: BigDecimal,
        override val colorHex: String? = null,
        override val strokeWidthDp: Float = 1.8f
    ) : ChartDrawing() {
        fun computeLevels(): List<FibLevelSpec> {
            val p1 = startPrice.toDouble()
            val p2 = endPrice.toDouble()
            val diff = p2 - p1
            val ratios = listOf(
                0.0 to false,
                0.236 to false,
                0.382 to false,
                0.5 to true,
                0.618 to true,
                0.786 to false,
                1.0 to false
            )
            return ratios.map { (r, isGold) ->
                val lvlPrice = p1 + (r * diff)
                FibLevelSpec(
                    ratio = r,
                    price = BigDecimal.valueOf(lvlPrice),
                    label = if (r == 0.0 || r == 1.0) "%.1f".format(r) else "%.3f".format(r),
                    isGolden = isGold
                )
            }
        }
    }

    data class LongPosition(
        override val id: String,
        val startTimeUtcMillis: Long,
        val endTimeUtcMillis: Long,
        val entryPrice: BigDecimal,
        val targetPrice: BigDecimal,
        val stopPrice: BigDecimal,
        override val colorHex: String? = null,
        override val strokeWidthDp: Float = 1.8f
    ) : ChartDrawing() {
        val riskRewardRatio: Double
            get() {
                val risk = entryPrice.subtract(stopPrice).toDouble()
                val reward = targetPrice.subtract(entryPrice).toDouble()
                return if (risk > 1e-6) reward / risk else 0.0
            }
        val targetPercent: Double
            get() {
                val e = entryPrice.toDouble()
                return if (e > 1e-6) kotlin.math.abs((targetPrice.toDouble() - e) / e) * 100.0 else 0.0
            }
        val stopPercent: Double
            get() {
                val e = entryPrice.toDouble()
                return if (e > 1e-6) kotlin.math.abs((stopPrice.toDouble() - e) / e) * 100.0 else 0.0
            }
    }

    data class ShortPosition(
        override val id: String,
        val startTimeUtcMillis: Long,
        val endTimeUtcMillis: Long,
        val entryPrice: BigDecimal,
        val targetPrice: BigDecimal,
        val stopPrice: BigDecimal,
        override val colorHex: String? = null,
        override val strokeWidthDp: Float = 1.8f
    ) : ChartDrawing() {
        val riskRewardRatio: Double
            get() {
                val risk = stopPrice.subtract(entryPrice).toDouble()
                val reward = entryPrice.subtract(targetPrice).toDouble()
                return if (risk > 1e-6) reward / risk else 0.0
            }
        val targetPercent: Double
            get() {
                val e = entryPrice.toDouble()
                return if (e > 1e-6) kotlin.math.abs((targetPrice.toDouble() - e) / e) * 100.0 else 0.0
            }
        val stopPercent: Double
            get() {
                val e = entryPrice.toDouble()
                return if (e > 1e-6) kotlin.math.abs((stopPrice.toDouble() - e) / e) * 100.0 else 0.0
            }
    }
}

/**
 * First anchor point when the user is in the middle of placing a two-point Trend Line.
 */
data class TrendAnchorPoint(
    val timeUtcMillis: Long,
    val price: BigDecimal
)

/**
 * Historical Date Range Presets for quick viewport navigation.
 */
data class DateRangePresetOption(
    val id: String,
    val label: String,
    val enabled: Boolean,
    val targetBars: Int
)
