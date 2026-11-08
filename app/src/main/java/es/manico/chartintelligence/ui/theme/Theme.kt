package es.manico.chartintelligence.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import es.manico.chartintelligence.i18n.AppLanguage
import es.manico.chartintelligence.i18n.ProvideAppLanguage

private val DarkColorScheme = darkColorScheme(
    primary = DarkPrimaryAccent,
    secondary = DarkSecondaryAccent,
    tertiary = BullishEmerald,
    background = DarkBackground,
    surface = DarkSurface,
    surfaceVariant = DarkSurfaceVariant,
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
    onPrimary = LightSurface,
    onBackground = LightTextPrimary,
    onSurface = LightTextPrimary,
    onSurfaceVariant = LightTextSecondary,
    error = BearishCoral
)

@Composable
fun ChartIntelligenceTheme(
    darkTheme: Boolean = true,
    language: AppLanguage = AppLanguage.FA,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
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
