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
    val showHighLowLabels: Boolean,
    val timezoneMode: String = "UTC"
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
    val indMaFamilyColorHex: String = "FF2962FF",     // Moving Averages family (Blue/Cyan spectrum)
    val indBandsFamilyColorHex: String = "FFA855F7",  // Volatility Bands family (Purple/Violet spectrum)
    val indLevelsFamilyColorHex: String = "FFF59E0B", // Pivots, VWAP & VRVP family (Amber/Gold spectrum)
    val indTrendFamilyColorHex: String = "FF14B8A6",  // Trend Systems & Cloud family (Teal/Emerald spectrum)
    val indSmcFamilyColorHex: String = "FFEC4899",    // Smart Money Concepts family (Rose/Magenta spectrum)

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
    val timezoneMode: String = "UTC",

    // Group 4 (SYNC & BYOK): Personal API Keys (Bring Your Own Key)
    val twelveDataApiKey: String = "",
    val stooqApiKey: String = "",
    val alphaVantageApiKey: String = "",
    val finnhubApiKey: String = "",

    // Phase 4 Forecast Studio preferences
    val forecastRenderMode: String = "HYBRID",
    val forecastHorizonBars: Int = 30,
    val forecastPluginConfigJson: String = "",
    val forecastWorkerUrl: String = ""
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
            showHighLowLabels = showHighLowLabels,
            timezoneMode = timezoneMode
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
            val clean = hex.trim().removePrefix("#").uppercase()
            val argb = if (clean.length == 6) "FF$clean" else clean
            Color(argb.toLong(16))
        }.getOrDefault(fallback)
    }

    fun shiftShade(base: Color, lumDelta: Float): Color {
        val r = if (lumDelta >= 0f) base.red + (1f - base.red) * lumDelta else base.red * (1f + lumDelta)
        val g = if (lumDelta >= 0f) base.green + (1f - base.green) * lumDelta else base.green * (1f + lumDelta)
        val b = if (lumDelta >= 0f) base.blue + (1f - base.blue) * lumDelta else base.blue * (1f + lumDelta)
        return Color(
            red = r.coerceIn(0f, 1f),
            green = g.coerceIn(0f, 1f),
            blue = b.coerceIn(0f, 1f),
            alpha = 1f
        )
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

    // Indicator Family Base Colors & Cohesive Graduated Shade Spectra
    val maFamilyBaseColor: Color
        get() = parseColor(indMaFamilyColorHex, Color(0xFF2962FF))
    val bandsFamilyBaseColor: Color
        get() = parseColor(indBandsFamilyColorHex, Color(0xFFA855F7))
    val levelsFamilyBaseColor: Color
        get() = parseColor(indLevelsFamilyColorHex, Color(0xFFF59E0B))
    val trendFamilyBaseColor: Color
        get() = parseColor(indTrendFamilyColorHex, Color(0xFF14B8A6))
    val smcFamilyBaseColor: Color
        get() = parseColor(indSmcFamilyColorHex, Color(0xFFEC4899))

    // Category 1: Moving Averages Spectrum
    val sma20Color: Color get() = shiftShade(maFamilyBaseColor, 0.42f)
    val sma50Color: Color get() = shiftShade(maFamilyBaseColor, 0.14f)
    val sma200Color: Color get() = shiftShade(maFamilyBaseColor, -0.22f)
    val ema20Color: Color get() = shiftShade(maFamilyBaseColor, 0.28f)
    val ema50Color: Color get() = maFamilyBaseColor
    val ema200Color: Color get() = shiftShade(maFamilyBaseColor, -0.34f)
    val mtfEmaColor: Color get() = shiftShade(maFamilyBaseColor, 0.52f)

    // Category 2: Volatility Channels Spectrum
    val bollingerColor: Color get() = bandsFamilyBaseColor
    val keltnerColor: Color get() = shiftShade(bandsFamilyBaseColor, 0.24f)
    val donchianColor: Color get() = shiftShade(bandsFamilyBaseColor, -0.18f)

    // Category 3: Key Levels, Pivots & Volume Profile Spectrum
    val vwapColor: Color get() = shiftShade(levelsFamilyBaseColor, 0.22f)
    val pivotPColor: Color get() = levelsFamilyBaseColor
    val pivotR1Color: Color get() = shiftShade(levelsFamilyBaseColor, 0.18f)
    val pivotR2Color: Color get() = shiftShade(levelsFamilyBaseColor, 0.30f)
    val pivotR3Color: Color get() = shiftShade(levelsFamilyBaseColor, 0.42f)
    val pivotR4Color: Color get() = shiftShade(levelsFamilyBaseColor, 0.54f)
    val pivotS1Color: Color get() = shiftShade(levelsFamilyBaseColor, -0.14f)
    val pivotS2Color: Color get() = shiftShade(levelsFamilyBaseColor, -0.26f)
    val pivotS3Color: Color get() = shiftShade(levelsFamilyBaseColor, -0.38f)
    val pivotS4Color: Color get() = shiftShade(levelsFamilyBaseColor, -0.48f)
    val vrvpPocColor: Color get() = levelsFamilyBaseColor
    val vrvpVaColor: Color get() = shiftShade(levelsFamilyBaseColor, 0.34f)

    // Category 4: Trend Systems & Cloud Spectrum
    val supertrendColor: Color get() = trendFamilyBaseColor
    val psarColor: Color get() = shiftShade(trendFamilyBaseColor, 0.26f)
    val ichimokuColor: Color get() = shiftShade(trendFamilyBaseColor, -0.14f)
    val overlayMacdColor: Color get() = shiftShade(trendFamilyBaseColor, 0.38f)

    // Category 5: Smart Money Concepts & Session Killzones Spectrum
    val smcStructureColor: Color get() = smcFamilyBaseColor
    val fvgColor: Color get() = shiftShade(smcFamilyBaseColor, 0.22f)
    val killzonesColor: Color get() = shiftShade(smcFamilyBaseColor, -0.16f)
}
