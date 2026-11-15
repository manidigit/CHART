package es.manico.chartintelligence.ui.theme

import android.os.Build
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import es.manico.chartintelligence.i18n.AppLanguage
import es.manico.chartintelligence.i18n.ProvideAppLanguage

private val DarkColorScheme = darkColorScheme(
    primary = DarkPrimaryAccent,
    secondary = DarkSecondaryAccent,
    tertiary = BullishEmerald,
    background = DarkBackground,
    surface = DarkSurface,
    surfaceVariant = DarkSurfaceVariant,
    surfaceContainer = DarkSurface,
    surfaceContainerHigh = Color(0xFF262B38),
    surfaceContainerHighest = Color(0xFF2E3444),
    surfaceContainerLow = Color(0xFF181B24),
    surfaceContainerLowest = DarkBackground,
    outline = DarkBorder,
    outlineVariant = Color(0xFF343B4D),
    onPrimary = Color.White,
    onBackground = DarkTextPrimary,
    onSurface = DarkTextPrimary,
    onSurfaceVariant = DarkTextSecondary,
    error = BearishCoral
)

private val LightColorScheme = lightColorScheme(
    primary = LightPrimaryAccent,
    secondary = LightSecondaryAccent,
    tertiary = BullishEmerald,
    background = LightBackground,
    surface = LightSurface,
    surfaceVariant = LightSurfaceVariant,
    surfaceContainer = LightSurfaceVariant,
    surfaceContainerHigh = Color(0xFFE2E8F0),
    surfaceContainerHighest = Color(0xFFCBD5E1),
    surfaceContainerLow = Color(0xFFF8FAFC),
    surfaceContainerLowest = LightSurface,
    outline = LightBorder,
    outlineVariant = Color(0xFFCBD5E1),
    onPrimary = LightSurface,
    onBackground = LightTextPrimary,
    onSurface = LightTextPrimary,
    onSurfaceVariant = LightTextSecondary,
    error = BearishCoral
)

@Composable
fun ChartIntelligenceTheme(
    darkTheme: Boolean = true,
    dynamicColor: Boolean = true,
    language: AppLanguage = AppLanguage.FA,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            if (darkTheme) {
                val dyn = dynamicDarkColorScheme(context)
                // Harmonize dynamic color with high-contrast trading surfaces and financial tokens
                DarkColorScheme.copy(
                    primary = dyn.primary,
                    secondary = dyn.secondary,
                    primaryContainer = dyn.primaryContainer,
                    secondaryContainer = dyn.secondaryContainer
                )
            } else {
                val dyn = dynamicLightColorScheme(context)
                LightColorScheme.copy(
                    primary = dyn.primary,
                    secondary = dyn.secondary,
                    primaryContainer = dyn.primaryContainer,
                    secondaryContainer = dyn.secondaryContainer
                )
            }
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    val financialPalette = if (darkTheme) DarkFinancialPalette else LightFinancialPalette

    ProvideAppLanguage(language = language) {
        CompositionLocalProvider(LocalFinancialPalette provides financialPalette) {
            MaterialTheme(
                colorScheme = colorScheme,
                typography = AppTypography,
                content = content
            )
        }
    }
}
