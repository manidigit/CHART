package es.manico.chartintelligence.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

val DarkBackground = Color(0xFF0B0F17)
val DarkSurface = Color(0xFF131A26)
val DarkSurfaceVariant = Color(0xFF1C2536)
val DarkBorder = Color(0xFF263248)
val DarkPrimaryAccent = Color(0xFF38BDF8)
val DarkSecondaryAccent = Color(0xFF818CF8)
val DarkTextPrimary = Color(0xFFF1F5F9)
val DarkTextSecondary = Color(0xFF94A3B8)

val LightBackground = Color(0xFFF8FAFC)
val LightSurface = Color(0xFFFFFFFF)
val LightSurfaceVariant = Color(0xFFF1F5F9)
val LightBorder = Color(0xFFCBD5E1)
val LightPrimaryAccent = Color(0xFF0284C7)
val LightSecondaryAccent = Color(0xFF4F46E5)
val LightTextPrimary = Color(0xFF0F172A)
val LightTextSecondary = Color(0xFF475569)

val BullishEmerald = Color(0xFF10B981)
val BearishCoral = Color(0xFFF43F5E)
val WarningAmber = Color(0xFFF59E0B)
val ChartGridDark = Color(0xFF1E293B)
val ChartGridLight = Color(0xFFE2E8F0)
val CrosshairGold = Color(0xFFFBBF24)

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
    bullCandle = Color(0xFF059669),
    bearCandle = Color(0xFFE11D48),
    warning = Color(0xFFD97706),
    chartGrid = ChartGridLight,
    crosshair = Color(0xFFD97706),
    cardBorder = LightBorder,
    subtleText = LightTextSecondary
)

val LocalFinancialPalette = staticCompositionLocalOf { DarkFinancialPalette }
