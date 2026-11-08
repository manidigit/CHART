package es.manico.chartintelligence.data.model

import androidx.compose.ui.graphics.Color
import es.manico.chartintelligence.ui.theme.BearishCoral
import es.manico.chartintelligence.ui.theme.BullishEmerald
import es.manico.chartintelligence.ui.theme.ChartGridDark

/**
 * Dynamic user preferences for chart visual theme colors and algorithm parameters.
 * Eliminates hardcoded magic numbers and color hex values across UI and calculations.
 */
data class ChartPreferences(
    // Visual Theme Colors (Stored as 32-bit ARGB hex strings e.g. "FF26A69A")
    val bullCandleColorHex: String = "FF26A69A", // TradingView Bullish Teal (#26A69A)
    val bearCandleColorHex: String = "FFEF5350", // TradingView Bearish Red (#EF5350)
    val trendLineColorHex: String = "FF2962FF",  // TradingView Accent Blue (#2962FF)
    val horizontalLineColorHex: String = "FF38BDF8", // Sky Blue H-Line
    val verticalLineColorHex: String = "FFF59E0B",   // Amber V-Line
    val chartGridColorHex: String = "FF2A2E39",     // TradingView Grid Dark (#2A2E39)

    // Algorithm & Calculation Parameters
    val candleFetchLimit: Int = 500,
    val minVisibleCandles: Int = 12,
    val maxVisibleCandles: Int = 5000,
    val zoomStepCandles: Int = 8,
    val drawingHitTolerancePx: Float = 28f
) {
    fun parseColor(hex: String, fallback: Color): Color {
        return runCatching {
            Color(hex.toLong(16))
        }.getOrDefault(fallback)
    }

    val bullCandleColor: Color
        get() = parseColor(bullCandleColorHex, BullishEmerald)

    val bearCandleColor: Color
        get() = parseColor(bearCandleColorHex, BearishCoral)

    val trendLineColor: Color
        get() = parseColor(trendLineColorHex, Color(0xFF2962FF))

    val horizontalLineColor: Color
        get() = parseColor(horizontalLineColorHex, Color(0xFF38BDF8))

    val verticalLineColor: Color
        get() = parseColor(verticalLineColorHex, Color(0xFFF59E0B))

    val chartGridColor: Color
        get() = parseColor(chartGridColorHex, ChartGridDark)
}
