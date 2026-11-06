package es.manico.chartintelligence.i18n

import android.content.Context
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import java.util.Locale

enum class AppLanguage(
    val code: String,
    val layoutDirection: LayoutDirection
) {
    FA(code = "fa", layoutDirection = LayoutDirection.Rtl),
    EN(code = "en", layoutDirection = LayoutDirection.Ltr);

    val locale: Locale
        get() = Locale.forLanguageTag(code)

    companion object {
        fun fromCode(code: String?): AppLanguage {
            return entries.firstOrNull { it.code.equals(code, ignoreCase = true) } ?: FA
        }
    }
}

fun Context.createLocalizedContext(language: AppLanguage): Context {
    val locale = language.locale
    Locale.setDefault(locale)
    val config = Configuration(resources.configuration)
    config.setLocale(locale)
    config.setLayoutDirection(locale)
    return createConfigurationContext(config)
}

@Composable
fun ProvideAppLanguage(
    language: AppLanguage,
    content: @Composable () -> Unit
) {
    val baseContext = LocalContext.current
    val localizedContext = remember(language, baseContext) {
        baseContext.createLocalizedContext(language)
    }
    val localizedConfiguration = remember(language, localizedContext) {
        localizedContext.resources.configuration
    }

    CompositionLocalProvider(
        LocalContext provides localizedContext,
        LocalConfiguration provides localizedConfiguration,
        LocalLayoutDirection provides language.layoutDirection
    ) {
        content()
    }
}
