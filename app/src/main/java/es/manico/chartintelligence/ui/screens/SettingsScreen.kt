package es.manico.chartintelligence.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
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
                .widthIn(max = 680.dp),
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

            // Section 2: Chart Visual Colors Customization (Decoupled & Non-Hardcoded)
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
                            modifier = Modifier.testTag("reset_colors_button")
                        ) {
                            Text(text = stringResource(R.string.settings_action_reset_colors))
                        }
                    }

                    Text(
                        text = stringResource(R.string.settings_chart_colors_hint),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    // Bullish candle color
                    ColorOptionRow(
                        title = stringResource(R.string.settings_color_bull),
                        selectedHex = chartPreferences.bullCandleColorHex,
                        presetHexes = listOf("FF10B981", "FF84CC16", "FF06B6D4", "FF22C55E", "FFFFFFFF"),
                        onSelectHex = onUpdateBullColor
                    )

                    // Bearish candle color
                    ColorOptionRow(
                        title = stringResource(R.string.settings_color_bear),
                        selectedHex = chartPreferences.bearCandleColorHex,
                        presetHexes = listOf("FFF43F5E", "FFE11D48", "FFF97316", "FFEC4899", "FFA855F7"),
                        onSelectHex = onUpdateBearColor
                    )

                    // Trend line color
                    ColorOptionRow(
                        title = stringResource(R.string.settings_color_trend),
                        selectedHex = chartPreferences.trendLineColorHex,
                        presetHexes = listOf("FFA855F7", "FF3B82F6", "FFF59E0B", "FFFFFFFF", "FF10B981"),
                        onSelectHex = onUpdateTrendColor
                    )

                    // Horizontal line color
                    ColorOptionRow(
                        title = stringResource(R.string.settings_color_hline),
                        selectedHex = chartPreferences.horizontalLineColorHex,
                        presetHexes = listOf("FF38BDF8", "FF14B8A6", "FFF43F5E", "FFEAB308", "FFFFFFFF"),
                        onSelectHex = onUpdateHLineColor
                    )

                    // Vertical line color
                    ColorOptionRow(
                        title = stringResource(R.string.settings_color_vline),
                        selectedHex = chartPreferences.verticalLineColorHex,
                        presetHexes = listOf("FFF59E0B", "FFD946EF", "FF6366F1", "FF94A3B8", "FFFFFFFF"),
                        onSelectHex = onUpdateVLineColor
                    )
                }
            }

            // Section 3: Algorithm & Calculation Parameters (Decoupled & Non-Hardcoded)
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
                    verticalArrangement = Arrangement.spacedBy(14.dp)
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
                            modifier = Modifier.testTag("reset_algo_params_button")
                        ) {
                            Text(text = stringResource(R.string.settings_action_reset_params))
                        }
                    }

                    Text(
                        text = stringResource(R.string.settings_algo_params_hint),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    // 1. Fetch limit slider
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
                                style = MaterialTheme.typography.bodyMedium,
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
                            value = currentFetchLimit,
                            onValueChange = { currentFetchLimit = it },
                            onValueChangeFinished = {
                                onUpdateAlgoParams(
                                    currentFetchLimit.roundToInt(),
                                    chartPreferences.zoomStepCandles,
                                    chartPreferences.drawingHitTolerancePx
                                )
                            },
                            valueRange = 40f..300f,
                            steps = 12,
                            modifier = Modifier.testTag("slider_fetch_limit")
                        )
                    }

                    // 2. Zoom step slider
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
                                style = MaterialTheme.typography.bodyMedium,
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

                    // 3. Touch hit tolerance slider
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
                                style = MaterialTheme.typography.bodyMedium,
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

            // Section 4: Symbol Catalog & Per-Symbol Data Source Setup (Dynamic & Extensible)
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
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = stringResource(R.string.settings_symbols_section),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Button(
                            onClick = { showAddSymbolDialog = true },
                            modifier = Modifier.testTag("add_custom_symbol_button")
                        ) {
                            Icon(imageVector = Icons.Outlined.Add, contentDescription = null)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(text = stringResource(R.string.settings_action_add_symbol))
                        }
                    }

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
                                        val displayTitle = symbol.titleResId?.let { stringResource(it) }
                                            ?: symbol.customTitle
                                            ?: symbol.symbolCode
                                        Text(
                                            text = displayTitle,
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold
                                        )
                                        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                            Text(
                                                text = "${symbol.symbolCode} · ${symbol.timeframe} · ${symbol.decimals} dec",
                                                style = MaterialTheme.typography.labelSmall,
                                                fontFamily = JetBrainsMonoFontFamily,
                                                color = MaterialTheme.colorScheme.primary
                                            )
                                        }
                                    }

                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
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
                                                modifier = Modifier.testTag("delete_symbol_${symbol.symbolCode.lowercase()}")
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Outlined.Delete,
                                                    contentDescription = stringResource(R.string.action_delete_symbol),
                                                    tint = MaterialTheme.colorScheme.error
                                                )
                                            }
                                        }
                                    }
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

            // Section 5: Personal Account, Recovery Email & Password Management
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
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
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
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            for (hex in presetHexes) {
                val color = runCatching { Color(hex.toLong(16)) }.getOrDefault(Color.Gray)
                val isSelected = selectedHex.equals(hex, ignoreCase = true)
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(color)
                        .border(
                            width = if (isSelected) 3.dp else 1.dp,
                            color = if (isSelected) MaterialTheme.colorScheme.primary else Color.Gray.copy(alpha = 0.5f),
                            shape = CircleShape
                        )
                        .clickable { onSelectHex(hex) },
                    contentAlignment = Alignment.Center
                ) {
                    if (isSelected) {
                        Icon(
                            imageVector = Icons.Outlined.Check,
                            contentDescription = null,
                            tint = if (color == Color.White) Color.Black else Color.White,
                            modifier = Modifier.size(20.dp)
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
                    listOf(ProviderId.DUKASCOPY, ProviderId.TWELVE_DATA, ProviderId.YAHOO_FINANCE).forEach { prov ->
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
