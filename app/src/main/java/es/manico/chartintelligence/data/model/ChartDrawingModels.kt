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
    TREND_LINE("trend_line");

    companion object {
        fun fromId(id: String?): DrawingTool {
            return entries.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: CURSOR
        }
    }
}

/**
 * Market-coordinate-anchored drawing primitive.
 * Every drawing is stored in real (timeUtcMillis, price) coordinates so it stays locked to its
 * exact market level across Zoom, Pan, and Timeframe switches.
 */
sealed class ChartDrawing {
    abstract val id: String

    data class HorizontalLine(
        override val id: String,
        val price: BigDecimal
    ) : ChartDrawing()

    data class VerticalLine(
        override val id: String,
        val timeUtcMillis: Long
    ) : ChartDrawing()

    data class TrendLine(
        override val id: String,
        val startTimeUtcMillis: Long,
        val startPrice: BigDecimal,
        val endTimeUtcMillis: Long,
        val endPrice: BigDecimal
    ) : ChartDrawing()
}

/**
 * First anchor point when the user is in the middle of placing a two-point Trend Line.
 */
data class TrendAnchorPoint(
    val timeUtcMillis: Long,
    val price: BigDecimal
)
