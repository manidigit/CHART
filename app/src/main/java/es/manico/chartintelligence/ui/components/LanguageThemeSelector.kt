package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.i18n.AppLanguage

@Composable
fun LanguageThemeSelector(
    currentLanguage: AppLanguage,
    isDarkTheme: Boolean,
    onLanguageSelected: (AppLanguage) -> Unit,
    onThemeSelected: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            FilterChip(
                selected = currentLanguage == AppLanguage.FA,
                onClick = { onLanguageSelected(AppLanguage.FA) },
                label = { Text(stringResource(R.string.settings_lang_fa)) },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Outlined.Language,
                        contentDescription = stringResource(R.string.settings_lang_fa)
                    )
                },
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("lang_fa_chip")
            )
            FilterChip(
                selected = currentLanguage == AppLanguage.EN,
                onClick = { onLanguageSelected(AppLanguage.EN) },
                label = { Text(stringResource(R.string.settings_lang_en)) },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Outlined.Language,
                        contentDescription = stringResource(R.string.settings_lang_en)
                    )
                },
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("lang_en_chip")
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            FilterChip(
                selected = isDarkTheme,
                onClick = { onThemeSelected(true) },
                label = {
                    Text(
                        text = stringResource(R.string.settings_theme_dark),
                        style = MaterialTheme.typography.labelLarge
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Outlined.DarkMode,
                        contentDescription = stringResource(R.string.settings_theme_dark)
                    )
                },
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("theme_dark_chip")
            )
            FilterChip(
                selected = !isDarkTheme,
                onClick = { onThemeSelected(false) },
                label = {
                    Text(
                        text = stringResource(R.string.settings_theme_light),
                        style = MaterialTheme.typography.labelLarge
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Outlined.LightMode,
                        contentDescription = stringResource(R.string.settings_theme_light)
                    )
                },
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("theme_light_chip")
            )
        }
    }
}
