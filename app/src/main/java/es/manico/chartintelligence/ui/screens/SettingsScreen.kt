package es.manico.chartintelligence.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.data.model.ProviderId
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.i18n.AppLanguage
import es.manico.chartintelligence.ui.components.LanguageThemeSelector
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    currentLanguage: AppLanguage,
    isDarkTheme: Boolean,
    symbols: List<SymbolConfig>,
    ownerUsername: String,
    statusBannerResId: Int?,
    onLanguageSelected: (AppLanguage) -> Unit,
    onThemeSelected: (Boolean) -> Unit,
    onToggleSymbolInWatchlist: (String, Boolean) -> Unit,
    onSelectProviderForSymbol: (String, ProviderId) -> Unit,
    onUpdatePassword: (String) -> Unit,
    onSignOut: () -> Unit,
    onBackToWatchlist: () -> Unit,
    modifier: Modifier = Modifier
) {
    BackHandler(onBack = onBackToWatchlist)

    val financialPalette = LocalFinancialPalette.current
    var newPassword by rememberSaveable { mutableStateOf("") }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 640.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = stringResource(R.string.settings_title),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )

            if (statusBannerResId != null) {
                Text(
                    text = stringResource(statusBannerResId),
                    style = MaterialTheme.typography.labelLarge,
                    color = financialPalette.bullCandle,
                    modifier = Modifier.testTag("settings_status_banner")
                )
            }

            // Section 1: Instant Language & Visual Theme
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, financialPalette.cardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = stringResource(R.string.settings_appearance_section),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    LanguageThemeSelector(
                        currentLanguage = currentLanguage,
                        isDarkTheme = isDarkTheme,
                        onLanguageSelected = onLanguageSelected,
                        onThemeSelected = onThemeSelected
                    )
                }
            }

            // Section 2: Symbol Catalog & Per-Symbol Data Source Setup
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, financialPalette.cardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = stringResource(R.string.settings_symbols_section),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = stringResource(R.string.settings_symbols_hint),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    for (symbol in symbols) {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("settings_symbol_card_${symbol.symbolCode.lowercase()}"),
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
                            ),
                            border = BorderStroke(1.dp, financialPalette.cardBorder)
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = stringResource(symbol.titleResId),
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold
                                        )
                                        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                            Text(
                                                text = "${symbol.symbolCode} · ${symbol.timeframe}",
                                                style = MaterialTheme.typography.labelSmall,
                                                fontFamily = JetBrainsMonoFontFamily,
                                                color = MaterialTheme.colorScheme.primary
                                            )
                                        }
                                    }

                                    Switch(
                                        checked = symbol.inWatchlist,
                                        onCheckedChange = { checked ->
                                            onToggleSymbolInWatchlist(symbol.symbolCode, checked)
                                        },
                                        modifier = Modifier.testTag("toggle_watchlist_${symbol.symbolCode.lowercase()}")
                                    )
                                }

                                Text(
                                    text = stringResource(R.string.settings_select_provider),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )

                                FlowRow(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    for (provider in symbol.allowedProviders) {
                                        FilterChip(
                                            selected = symbol.activeProvider == provider,
                                            onClick = {
                                                onSelectProviderForSymbol(symbol.symbolCode, provider)
                                            },
                                            label = {
                                                Text(
                                                    text = stringResource(provider.titleResId),
                                                    style = MaterialTheme.typography.bodyMedium
                                                )
                                            },
                                            modifier = Modifier
                                                .heightIn(min = 48.dp)
                                                .testTag("provider_chip_${symbol.symbolCode.lowercase()}_${provider.id}")
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Section 3: Personal Account & Password Management
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, financialPalette.cardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = "${stringResource(R.string.settings_account_section)} ($ownerUsername)",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )

                    OutlinedTextField(
                        value = newPassword,
                        onValueChange = { newPassword = it },
                        label = { Text(stringResource(R.string.settings_new_password)) },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("settings_new_password_input")
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            onClick = {
                                onUpdatePassword(newPassword)
                                newPassword = ""
                            },
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 48.dp)
                                .testTag("settings_update_password_button")
                        ) {
                            Text(text = stringResource(R.string.settings_change_password))
                        }

                        OutlinedButton(
                            onClick = onSignOut,
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 48.dp)
                                .testTag("settings_sign_out_button")
                        ) {
                            Text(text = stringResource(R.string.action_sign_out))
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
