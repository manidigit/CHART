package es.manico.chartintelligence.data.model

import androidx.compose.ui.graphics.Color
import es.manico.chartintelligence.ui.theme.BearishCoral
import es.manico.chartintelligence.ui.theme.BullishEmerald
import es.manico.chartintelligence.ui.theme.ChartGridDark

/**
 * Canonical 5-category grouping for Settings across Android and Web:
 * 1. ACCOUNT (حساب)
 * 2. CHART (چارت)
 * 3. NOTIFICATIONS (نوتیفیکیشن و بازخورد لمسی)
 * 4. SYNC (همگام‌سازی و منابع داده)
 * 5. THEME (تم و ظاهر)
 */
enum class SettingsCategoryGroup(val key: String) {
    SYNC("sync"),
    CHART("chart"),
    NOTIFICATIONS("notifications"),
    THEME("theme"),
    ACCOUNT("account")
}

data class ChartSettingsGroup(
    val candleFetchLimit: Int,
    val minVisibleCandles: Int,
    val maxVisibleCandles: Int,
    val zoomStepCandles: Int,
    val drawingHitTolerancePx: Float,
    val bollingerPeriod: Int,
    val bollingerStdDev: Float,
    val logarithmicScaleDefault: Boolean,
    val rememberLastChartOnDevice: Boolean,
    val hideTabBarInLandscape: Boolean,
    val showCountdownToBarClose: Boolean,
    val showPrevCloseLine: Boolean,
    val showHighLowLabels: Boolean
)

data class NotificationSettingsGroup(
    val chartVibrations: Boolean,
    val pickerVibrations: Boolean,
    val showPickerScrollMagnifiers: Boolean,
    val showSymbolScreen: Boolean,
    val hideWatchlistLogos: Boolean
)

data class ThemeSettingsGroup(
    val bullCandleColorHex: String,
    val bearCandleColorHex: String,
    val trendLineColorHex: String,
    val horizontalLineColorHex: String,
    val verticalLineColorHex: String,
    val chartGridColorHex: String,
    val defaultDrawingColorHex: String,
    val defaultDrawingWidthDp: Float
)

/**
 * Dynamic user preferences for chart visual theme colors, algorithm parameters,
 * drawing defaults, Bollinger parameters, and categorized TradingView switches synced with the Central Core Engine.
 */
data class ChartPreferences(
    // Group 5 (THEME): Visual Theme Colors (Stored as 32-bit ARGB hex strings e.g. "FF26A69A")
    val bullCandleColorHex: String = "FF26A69A", // TradingView Bullish Teal (#26A69A)
    val bearCandleColorHex: String = "FFEF5350", // TradingView Bearish Red (#EF5350)
    val trendLineColorHex: String = "FF2962FF",  // TradingView Accent Blue (#2962FF)
    val horizontalLineColorHex: String = "FF38BDF8", // Sky Blue H-Line
    val verticalLineColorHex: String = "FFF59E0B",   // Amber V-Line
    val chartGridColorHex: String = "FF2A2E39",     // TradingView Grid Dark (#2A2E39)
    val defaultDrawingColorHex: String = "FF2962FF", // Persistent default drawing line color
    val defaultDrawingWidthDp: Float = 2.0f,        // Persistent default drawing line stroke width (px/dp)

    // Group 2 (CHART): Algorithm, Indicator & Scale Calculation Parameters
    val candleFetchLimit: Int = 500,
    val minVisibleCandles: Int = 12,
    val maxVisibleCandles: Int = 5000,
    val zoomStepCandles: Int = 8,
    val drawingHitTolerancePx: Float = 28f,
    val bollingerPeriod: Int = 20,
    val bollingerStdDev: Float = 2.0f,

    // Group 3 (NOTIFICATIONS & HAPTICS) + Group 2 (CHART) Toggles
    val hideWatchlistLogos: Boolean = false,
    val showSymbolScreen: Boolean = true,
    val chartVibrations: Boolean = true,
    val logarithmicScaleDefault: Boolean = false,
    val rememberLastChartOnDevice: Boolean = true,
    val hideTabBarInLandscape: Boolean = true,
    val pickerVibrations: Boolean = true,
    val showPickerScrollMagnifiers: Boolean = true,
    val showCountdownToBarClose: Boolean = true,
    val showPrevCloseLine: Boolean = true,
    val showHighLowLabels: Boolean = true,

    // Group 4 (SYNC & BYOK): Personal API Keys (Bring Your Own Key)
    val twelveDataApiKey: String = "",
    val stooqApiKey: String = "",
    val alphaVantageApiKey: String = "",
    val finnhubApiKey: String = ""
) {
    val chartGroup: ChartSettingsGroup
        get() = ChartSettingsGroup(
            candleFetchLimit = candleFetchLimit,
            minVisibleCandles = minVisibleCandles,
            maxVisibleCandles = maxVisibleCandles,
            zoomStepCandles = zoomStepCandles,
            drawingHitTolerancePx = drawingHitTolerancePx,
            bollingerPeriod = bollingerPeriod,
            bollingerStdDev = bollingerStdDev,
            logarithmicScaleDefault = logarithmicScaleDefault,
            rememberLastChartOnDevice = rememberLastChartOnDevice,
            hideTabBarInLandscape = hideTabBarInLandscape,
            showCountdownToBarClose = showCountdownToBarClose,
            showPrevCloseLine = showPrevCloseLine,
            showHighLowLabels = showHighLowLabels
        )

    val notificationGroup: NotificationSettingsGroup
        get() = NotificationSettingsGroup(
            chartVibrations = chartVibrations,
            pickerVibrations = pickerVibrations,
            showPickerScrollMagnifiers = showPickerScrollMagnifiers,
            showSymbolScreen = showSymbolScreen,
            hideWatchlistLogos = hideWatchlistLogos
        )

    val themeGroup: ThemeSettingsGroup
        get() = ThemeSettingsGroup(
            bullCandleColorHex = bullCandleColorHex,
            bearCandleColorHex = bearCandleColorHex,
            trendLineColorHex = trendLineColorHex,
            horizontalLineColorHex = horizontalLineColorHex,
            verticalLineColorHex = verticalLineColorHex,
            chartGridColorHex = chartGridColorHex,
            defaultDrawingColorHex = defaultDrawingColorHex,
            defaultDrawingWidthDp = defaultDrawingWidthDp
        )

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
