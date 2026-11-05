package com.chartintelligence.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.chartintelligence.app.R

val ObsidianNavy = Color(0xFF070D19)
val DeepSlateSurface = Color(0xFF0E1728)
val ElevatedCardSurface = Color(0xFF142036)
val SubtleBorderSlate = Color(0xFF223354)

val BullishEmerald = Color(0xFF00E5A3)
val BearishCrimson = Color(0xFFFF4D6A)
val NeutralAmber = Color(0xFFF5B041)
val ForecastCyan = Color(0xFF4DA3FF)
val BaselineViolet = Color(0xFFB388FF)
val TextPrimary = Color(0xFFEAF1FF)
val TextSecondary = Color(0xFF94A7C6)
val TextMuted = Color(0xFF637899)

val SpaceGroteskFamily = FontFamily(
    Font(R.font.space_grotesk, FontWeight.Normal),
    Font(R.font.space_grotesk, FontWeight.Medium),
    Font(R.font.space_grotesk, FontWeight.Bold)
)

val InterFamily = FontFamily(
    Font(R.font.inter, FontWeight.Normal),
    Font(R.font.inter, FontWeight.Medium),
    Font(R.font.inter, FontWeight.SemiBold)
)

val JetBrainsMonoFamily = FontFamily(
    Font(R.font.jetbrains_mono, FontWeight.Normal),
    Font(R.font.jetbrains_mono, FontWeight.Medium),
    Font(R.font.jetbrains_mono, FontWeight.Bold)
)

private val ChartIntelligenceColorScheme = darkColorScheme(
    primary = BullishEmerald,
    onPrimary = Color(0xFF00291B),
    primaryContainer = Color(0xFF0A3B2D),
    onPrimaryContainer = Color(0xFF8FFFE0),
    secondary = ForecastCyan,
    onSecondary = Color(0xFF001E38),
    secondaryContainer = Color(0xFF103158),
    onSecondaryContainer = Color(0xFFC7E3FF),
    tertiary = NeutralAmber,
    onTertiary = Color(0xFF2E1C00),
    tertiaryContainer = Color(0xFF473008),
    onTertiaryContainer = Color(0xFFFFDFB3),
    error = BearishCrimson,
    onError = Color(0xFF3B000C),
    errorContainer = Color(0xFF4F1120),
    onErrorContainer = Color(0xFFFFB2BC),
    background = ObsidianNavy,
    onBackground = TextPrimary,
    surface = DeepSlateSurface,
    onSurface = TextPrimary,
    surfaceVariant = ElevatedCardSurface,
    onSurfaceVariant = TextSecondary,
    outline = SubtleBorderSlate
)

val ChartIntelligenceTypography = Typography(
    headlineLarge = TextStyle(
        fontFamily = SpaceGroteskFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 26.sp,
        lineHeight = 32.sp,
        letterSpacing = (-0.5).sp
    ),
    headlineMedium = TextStyle(
        fontFamily = SpaceGroteskFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 21.sp,
        lineHeight = 27.sp,
        letterSpacing = (-0.3).sp
    ),
    titleLarge = TextStyle(
        fontFamily = SpaceGroteskFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 18.sp,
        lineHeight = 24.sp
    ),
    titleMedium = TextStyle(
        fontFamily = SpaceGroteskFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 15.sp,
        lineHeight = 21.sp
    ),
    titleSmall = TextStyle(
        fontFamily = JetBrainsMonoFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 13.sp,
        lineHeight = 18.sp
    ),
    bodyLarge = TextStyle(
        fontFamily = InterFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = InterFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 19.sp
    ),
    bodySmall = TextStyle(
        fontFamily = InterFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 11.sp,
        lineHeight = 16.sp
    ),
    labelLarge = TextStyle(
        fontFamily = JetBrainsMonoFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp
    ),
    labelMedium = TextStyle(
        fontFamily = JetBrainsMonoFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 11.sp,
        lineHeight = 15.sp
    ),
    labelSmall = TextStyle(
        fontFamily = JetBrainsMonoFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 10.sp,
        lineHeight = 14.sp
    )
)

@Composable
fun ChartIntelligenceTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = ChartIntelligenceColorScheme,
        typography = ChartIntelligenceTypography,
        content = content
    )
}
