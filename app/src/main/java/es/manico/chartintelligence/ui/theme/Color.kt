package es.manico.chartintelligence.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// Official TradingView Dark Palette Tokens
val DarkBackground = Color(0xFF131722)
val DarkSurface = Color(0xFF1E222D)
val DarkSurfaceVariant = Color(0xFF2A2E39)
val DarkBorder = Color(0xFF2A2E39)
val DarkPrimaryAccent = Color(0xFF2962FF)
val DarkSecondaryAccent = Color(0xFF38BDF8)
val DarkTextPrimary = Color(0xFFD1D4DC)
val DarkTextSecondary = Color(0xFF787B86)

val LightBackground = Color(0xFFF8FAFC)
val LightSurface = Color(0xFFFFFFFF)
val LightSurfaceVariant = Color(0xFFF1F5F9)
val LightBorder = Color(0xFFE0E3EB)
val LightPrimaryAccent = Color(0xFF2962FF)
val LightSecondaryAccent = Color(0xFF0284C7)
val LightTextPrimary = Color(0xFF131722)
val LightTextSecondary = Color(0xFF787B86)

val BullishEmerald = Color(0xFF26A69A)
val BearishCoral = Color(0xFFEF5350)
val WarningAmber = Color(0xFFF59E0B)
val ChartGridDark = Color(0xFF2A2E39)
val ChartGridLight = Color(0xFFE0E3EB)
val CrosshairGold = Color(0xFF758696)

@Immutable
data class FinancialPalette(
    val bullCandle: Color,
    val bearCandle: Color,
    val warning: Color,
    val chartGrid: Color,
    val crosshair: Color,
    val cardBorder: Color,
    val subtleText: Color
)

val DarkFinancialPalette = FinancialPalette(
    bullCandle = BullishEmerald,
    bearCandle = BearishCoral,
    warning = WarningAmber,
    chartGrid = ChartGridDark,
    crosshair = CrosshairGold,
    cardBorder = DarkBorder,
    subtleText = DarkTextSecondary
)

val LightFinancialPalette = FinancialPalette(
    bullCandle = Color(0xFF089981),
    bearCandle = Color(0xFFF23645),
    warning = Color(0xFFD97706),
    chartGrid = ChartGridLight,
    crosshair = Color(0xFF758696),
    cardBorder = LightBorder,
    subtleText = LightTextSecondary
)

val LocalFinancialPalette = staticCompositionLocalOf { DarkFinancialPalette }
