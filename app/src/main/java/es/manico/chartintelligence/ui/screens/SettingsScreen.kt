package es.manico.chartintelligence.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.data.model.ChartPreferences
import es.manico.chartintelligence.data.model.ProviderId
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.i18n.AppLanguage
import es.manico.chartintelligence.ui.components.LanguageThemeSelector
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import kotlin.math.roundToInt

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    currentLanguage: AppLanguage,
    isDarkTheme: Boolean,
    symbols: List<SymbolConfig>,
    ownerUsername: String,
    ownerEmail: String = "",
    statusBannerResId: Int?,
    chartPreferences: ChartPreferences,
    onLanguageSelected: (AppLanguage) -> Unit,
    onThemeSelected: (Boolean) -> Unit,
    onToggleSymbolInWatchlist: (String, Boolean) -> Unit,
    onSelectProviderForSymbol: (String, ProviderId) -> Unit,
    onUpdateRecoveryEmail: (String) -> Unit = {},
    onUpdatePassword: (String) -> Unit,
    onSignOut: () -> Unit,
    onBackToWatchlist: () -> Unit,
    onUpdateBullColor: (String) -> Unit,
    onUpdateBearColor: (String) -> Unit,
    onUpdateTrendColor: (String) -> Unit,
    onUpdateHLineColor: (String) -> Unit,
    onUpdateVLineColor: (String) -> Unit,
    onResetColors: () -> Unit,
    onUpdateAlgoParams: (Int, Int, Float) -> Unit,
    onResetAlgoParams: () -> Unit,
    onAddCustomSymbol: (String, String, Int, ProviderId) -> Unit,
    onDeleteSymbol: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    BackHandler(onBack = onBackToWatchlist)

    val financialPalette = LocalFinancialPalette.current
    var recoveryEmailInput by rememberSaveable(ownerEmail) { mutableStateOf(ownerEmail) }
    var newPassword by rememberSaveable { mutableStateOf("") }
    var showAddSymbolDialog by rememberSaveable { mutableStateOf(false) }
    var providerModalSymbolCode by rememberSaveable { mutableStateOf<String?>(null) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 680.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = stringResource(R.string.settings_title),
                style = MaterialTheme.typography.titleLarge,
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
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, financialPalette.cardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
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

            // Section 2: Symbol Catalog & Per-Symbol Data Source Setup (Clean TradingView Rows + Modal Source Picker)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, financialPalette.cardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = stringResource(R.string.settings_symbols_section),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f)
                        )
                        Button(
                            onClick = { showAddSymbolDialog = true },
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                            modifier = Modifier
                                .heightIn(min = 38.dp)
                                .testTag("add_custom_symbol_button")
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Add,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = stringResource(R.string.settings_action_add_symbol),
                                style = MaterialTheme.typography.labelMedium
                            )
                        }
                    }

                    Text(
                        text = stringResource(R.string.settings_symbols_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    for (symbol in symbols) {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("settings_symbol_card_${symbol.symbolCode.lowercase()}"),
                            shape = RoundedCornerShape(8.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.background
                            ),
                            border = BorderStroke(1.dp, financialPalette.cardBorder)
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        val displayTitle = symbol.titleResId?.let { stringResource(it) }
                                            ?: symbol.customTitle
                                            ?: symbol.symbolCode
                                        Text(
                                            text = displayTitle,
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                            Text(
                                                text = "${symbol.symbolCode} · ${symbol.activeProvider.badgeLabel} (${symbol.timeframe})",
                                                style = MaterialTheme.typography.labelSmall,
                                                fontFamily = JetBrainsMonoFontFamily,
                                                color = MaterialTheme.colorScheme.primary
                                            )
                                        }
                                    }

                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        OutlinedButton(
                                            onClick = { providerModalSymbolCode = symbol.symbolCode },
                                            shape = RoundedCornerShape(6.dp),
                                            border = BorderStroke(1.dp, financialPalette.cardBorder),
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                            modifier = Modifier.height(32.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Outlined.Tune,
                                                contentDescription = stringResource(R.string.settings_change_provider),
                                                modifier = Modifier.size(14.dp)
                                            )
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text(
                                                text = stringResource(R.string.settings_change_provider),
                                                style = MaterialTheme.typography.labelSmall
                                            )
                                        }

                                        Switch(
                                            checked = symbol.inWatchlist,
                                            onCheckedChange = { checked ->
                                                onToggleSymbolInWatchlist(symbol.symbolCode, checked)
                                            },
                                            modifier = Modifier.testTag("toggle_watchlist_${symbol.symbolCode.lowercase()}")
                                        )

                                        if (symbol.isCustom) {
                                            IconButton(
                                                onClick = { onDeleteSymbol(symbol.symbolCode) },
                                                modifier = Modifier
                                                    .size(32.dp)
                                                    .testTag("delete_symbol_${symbol.symbolCode.lowercase()}")
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Outlined.Delete,
                                                    contentDescription = stringResource(R.string.action_delete_symbol),
                                                    tint = MaterialTheme.colorScheme.error,
                                                    modifier = Modifier.size(18.dp)
                                                )
                                            }
                                        }
                                    }
                                }

                                // Compact 1-Line Horizontal Badge Strip (keeps direct 1-tap switching + testTag parity)
                                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        for (provider in symbol.allowedProviders) {
                                            val isSelected = symbol.activeProvider == provider
                                            Box(
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(6.dp))
                                                    .background(
                                                        if (isSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.20f)
                                                        else MaterialTheme.colorScheme.surface
                                                    )
                                                    .border(
                                                        width = 1.dp,
                                                        color = if (isSelected) MaterialTheme.colorScheme.primary else financialPalette.cardBorder,
                                                        shape = RoundedCornerShape(6.dp)
                                                    )
                                                    .clickable {
                                                        onSelectProviderForSymbol(symbol.symbolCode, provider)
                                                    }
                                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                                                    .testTag("provider_chip_${symbol.symbolCode.lowercase()}_${provider.id}")
                                            ) {
                                                Text(
                                                    text = provider.badgeLabel,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    fontFamily = JetBrainsMonoFontFamily,
                                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Section 3: Chart Visual Colors Customization (Official TradingView Presets)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, financialPalette.cardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = stringResource(R.string.settings_chart_colors_section),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        OutlinedButton(
                            onClick = onResetColors,
                            shape = RoundedCornerShape(8.dp),
                            border = BorderStroke(1.dp, financialPalette.cardBorder),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                            modifier = Modifier
                                .height(34.dp)
                                .testTag("reset_colors_button")
                        ) {
                            Text(
                                text = stringResource(R.string.settings_action_reset_colors),
                                style = MaterialTheme.typography.labelSmall
                            )
                        }
                    }

                    Text(
                        text = stringResource(R.string.settings_chart_colors_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    // Bullish candle color (TradingView #26A69A first)
                    ColorOptionRow(
                        title = stringResource(R.string.settings_color_bull),
                        selectedHex = chartPreferences.bullCandleColorHex,
                        presetHexes = listOf("FF26A69A", "FF10B981", "FF06B6D4", "FF22C55E", "FFD1D4DC"),
                        onSelectHex = onUpdateBullColor
                    )

                    // Bearish candle color (TradingView #EF5350 first)
                    ColorOptionRow(
                        title = stringResource(R.string.settings_color_bear),
                        selectedHex = chartPreferences.bearCandleColorHex,
                        presetHexes = listOf("FFEF5350", "FFF43F5E", "FFE11D48", "FFF97316", "FFA855F7"),
                        onSelectHex = onUpdateBearColor
                    )

                    // Trend line color (TradingView #2962FF first)
                    ColorOptionRow(
                        title = stringResource(R.string.settings_color_trend),
                        selectedHex = chartPreferences.trendLineColorHex,
                        presetHexes = listOf("FF2962FF", "FFA855F7", "FF38BDF8", "FFF59E0B", "FFD1D4DC"),
                        onSelectHex = onUpdateTrendColor
                    )

                    // Horizontal line color
                    ColorOptionRow(
                        title = stringResource(R.string.settings_color_hline),
                        selectedHex = chartPreferences.horizontalLineColorHex,
                        presetHexes = listOf("FF38BDF8", "FF2962FF", "FF26A69A", "FFF59E0B", "FFD1D4DC"),
                        onSelectHex = onUpdateHLineColor
                    )

                    // Vertical line color
                    ColorOptionRow(
                        title = stringResource(R.string.settings_color_vline),
                        selectedHex = chartPreferences.verticalLineColorHex,
                        presetHexes = listOf("FFF59E0B", "FFD946EF", "FF6366F1", "FF787B86", "FFD1D4DC"),
                        onSelectHex = onUpdateVLineColor
                    )
                }
            }

            // Section 4: Algorithm & Calculation Parameters
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, financialPalette.cardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = stringResource(R.string.settings_algo_params_section),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        OutlinedButton(
                            onClick = onResetAlgoParams,
                            shape = RoundedCornerShape(8.dp),
                            border = BorderStroke(1.dp, financialPalette.cardBorder),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                            modifier = Modifier
                                .height(34.dp)
                                .testTag("reset_algo_params_button")
                        ) {
                            Text(
                                text = stringResource(R.string.settings_action_reset_params),
                                style = MaterialTheme.typography.labelSmall
                            )
                        }
                    }

                    Text(
                        text = stringResource(R.string.settings_algo_params_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    var currentFetchLimit by remember(chartPreferences.candleFetchLimit) {
                        mutableFloatStateOf(chartPreferences.candleFetchLimit.toFloat())
                    }
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = stringResource(R.string.settings_param_fetch_limit),
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold
                            )
                            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                Text(
                                    text = currentFetchLimit.roundToInt().toString(),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                        Slider(
                            value = currentFetchLimit.coerceIn(40f, 5000f),
                            onValueChange = {
                                val stepped = ((it / 20f).roundToInt() * 20).coerceIn(40, 5000)
                                currentFetchLimit = stepped.toFloat()
                            },
                            onValueChangeFinished = {
                                onUpdateAlgoParams(
                                    currentFetchLimit.roundToInt().coerceIn(40, 5000),
                                    chartPreferences.zoomStepCandles,
                                    chartPreferences.drawingHitTolerancePx
                                )
                            },
                            valueRange = 40f..5000f,
                            modifier = Modifier.testTag("slider_fetch_limit")
                        )
                    }

                    var currentZoomStep by remember(chartPreferences.zoomStepCandles) {
                        mutableFloatStateOf(chartPreferences.zoomStepCandles.toFloat())
                    }
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = stringResource(R.string.settings_param_zoom_step),
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold
                            )
                            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                Text(
                                    text = currentZoomStep.roundToInt().toString(),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                        Slider(
                            value = currentZoomStep,
                            onValueChange = { currentZoomStep = it },
                            onValueChangeFinished = {
                                onUpdateAlgoParams(
                                    chartPreferences.candleFetchLimit,
                                    currentZoomStep.roundToInt(),
                                    chartPreferences.drawingHitTolerancePx
                                )
                            },
                            valueRange = 2f..24f,
                            steps = 10,
                            modifier = Modifier.testTag("slider_zoom_step")
                        )
                    }

                    var currentHitTolerance by remember(chartPreferences.drawingHitTolerancePx) {
                        mutableFloatStateOf(chartPreferences.drawingHitTolerancePx)
                    }
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = stringResource(R.string.settings_param_touch_tolerance),
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold
                            )
                            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                Text(
                                    text = "${currentHitTolerance.roundToInt()} px",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                        Slider(
                            value = currentHitTolerance,
                            onValueChange = { currentHitTolerance = it },
                            onValueChangeFinished = {
                                onUpdateAlgoParams(
                                    chartPreferences.candleFetchLimit,
                                    chartPreferences.zoomStepCandles,
                                    currentHitTolerance
                                )
                            },
                            valueRange = 14f..48f,
                            steps = 16,
                            modifier = Modifier.testTag("slider_touch_tolerance")
                        )
                    }
                }
            }

            // Section 5: Personal Account, Recovery Email & Password Management
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, financialPalette.cardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = "${stringResource(R.string.settings_account_section)} ($ownerUsername)",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )

                    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                        OutlinedTextField(
                            value = recoveryEmailInput,
                            onValueChange = { recoveryEmailInput = it },
                            label = { Text(stringResource(R.string.label_recovery_email)) },
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("settings_email_input")
                        )
                    }

                    Button(
                        onClick = { onUpdateRecoveryEmail(recoveryEmailInput) },
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 44.dp)
                            .testTag("settings_save_email_button")
                    ) {
                        Text(text = stringResource(R.string.action_save_email))
                    }

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
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 44.dp)
                                .testTag("settings_update_password_button")
                        ) {
                            Text(text = stringResource(R.string.settings_change_password))
                        }

                        OutlinedButton(
                            onClick = onSignOut,
                            shape = RoundedCornerShape(8.dp),
                            border = BorderStroke(1.dp, financialPalette.cardBorder),
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 44.dp)
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

    // Modal Dialog for Detailed Per-Symbol Data Provider Selection
    val modalSymbol = symbols.firstOrNull { it.symbolCode == providerModalSymbolCode }
    if (modalSymbol != null) {
        AlertDialog(
            onDismissRequest = { providerModalSymbolCode = null },
            title = {
                Text(
                    text = "${modalSymbol.symbolCode} · ${stringResource(R.string.settings_select_provider)}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    for (provider in modalSymbol.allowedProviders) {
                        val isSelected = modalSymbol.activeProvider == provider
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .clickable {
                                    onSelectProviderForSymbol(modalSymbol.symbolCode, provider)
                                    providerModalSymbolCode = null
                                }
                                .padding(vertical = 6.dp, horizontal = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = isSelected,
                                onClick = {
                                    onSelectProviderForSymbol(modalSymbol.symbolCode, provider)
                                    providerModalSymbolCode = null
                                }
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = stringResource(provider.titleResId),
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = provider.badgeLabel,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { providerModalSymbolCode = null }) {
                    Text(stringResource(R.string.action_cancel))
                }
            }
        )
    }

    if (showAddSymbolDialog) {
        AddCustomSymbolDialog(
            onDismiss = { showAddSymbolDialog = false },
            onConfirm = { code, title, decimals, provider ->
                onAddCustomSymbol(code, title, decimals, provider)
                showAddSymbolDialog = false
            }
        )
    }
}

@Composable
private fun ColorOptionRow(
    title: String,
    selectedHex: String,
    presetHexes: List<String>,
    onSelectHex: (String) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f)
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            for (hex in presetHexes) {
                val color = runCatching { Color(hex.toLong(16)) }.getOrDefault(Color.Gray)
                val isSelected = selectedHex.equals(hex, ignoreCase = true)
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(color)
                        .border(
                            width = if (isSelected) 2.5.dp else 1.dp,
                            color = if (isSelected) Color.White else Color.Gray.copy(alpha = 0.4f),
                            shape = CircleShape
                        )
                        .clickable { onSelectHex(hex) },
                    contentAlignment = Alignment.Center
                ) {
                    if (isSelected) {
                        Icon(
                            imageVector = Icons.Outlined.Check,
                            contentDescription = null,
                            tint = if (color == Color.White || hex == "FFD1D4DC") Color.Black else Color.White,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AddCustomSymbolDialog(
    onDismiss: () -> Unit,
    onConfirm: (code: String, title: String, decimals: Int, provider: ProviderId) -> Unit
) {
    var symbolCode by rememberSaveable { mutableStateOf("") }
    var displayName by rememberSaveable { mutableStateOf("") }
    var decimalsText by rememberSaveable { mutableStateOf("2") }
    var selectedProvider by rememberSaveable { mutableStateOf(ProviderId.DUKASCOPY) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_dialog_add_title)) },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = symbolCode,
                    onValueChange = { symbolCode = it.uppercase() },
                    label = { Text(stringResource(R.string.settings_dialog_symbol_code)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = displayName,
                    onValueChange = { displayName = it },
                    label = { Text(stringResource(R.string.settings_dialog_symbol_name)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = decimalsText,
                    onValueChange = { decimalsText = it.filter { ch -> ch.isDigit() } },
                    label = { Text(stringResource(R.string.settings_dialog_decimals)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Text(
                    text = stringResource(R.string.settings_select_provider),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    listOf(ProviderId.TVDATAFEED, ProviderId.DUKASCOPY, ProviderId.TWELVE_DATA, ProviderId.YAHOO_FINANCE).forEach { prov ->
                        FilterChip(
                            selected = selectedProvider == prov,
                            onClick = { selectedProvider = prov },
                            label = { Text(stringResource(prov.titleResId), style = MaterialTheme.typography.labelSmall) }
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (symbolCode.isNotBlank()) {
                        val dec = decimalsText.toIntOrNull()?.coerceIn(0, 6) ?: 2
                        onConfirm(symbolCode.trim(), displayName.trim(), dec, selectedProvider)
                    }
                },
                enabled = symbolCode.isNotBlank()
            ) {
                Text(stringResource(R.string.action_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_cancel))
            }
        }
    )
}
