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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
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
import androidx.compose.ui.text.style.TextOverflow
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

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    currentLanguage: AppLanguage,
    isDarkTheme: Boolean,
    symbols: List<SymbolConfig>,
    ownerUsername: String,
    ownerEmail: String = "",
    statusBannerResId: Int?,
    chartPreferences: ChartPreferences,
    systemStatus: es.manico.chartintelligence.data.repository.SystemStatusDto? = null,
    isWorkspaceSyncing: Boolean = false,
    lastWorkspaceSyncedAt: String? = null,
    onSyncCloudWorkspace: () -> Unit = {},
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
    onUpdateDefaultDrawingWidth: (Float) -> Unit = {},
    onUpdateBollingerParams: (Int, Float) -> Unit = { _, _ -> },
    onResetAllPreferences: () -> Unit = {},
    onUpdateTradingViewPreference: ((ChartPreferences) -> ChartPreferences) -> Unit = {},
    onUpdateTimezoneMode: (String) -> Unit = {},
    onSaveApiKeys: (String, String, String, String) -> Unit = { _, _, _, _ -> },
    onAddCustomSymbol: (String, String, Int, ProviderId) -> Unit,
    onDeleteSymbol: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    BackHandler(onBack = onBackToWatchlist)

    val financialPalette = LocalFinancialPalette.current
    var recoveryEmailInput by rememberSaveable(ownerEmail) { mutableStateOf(ownerEmail) }
    var newPassword by rememberSaveable { mutableStateOf("") }
    var showAddSymbolDialog by rememberSaveable { mutableStateOf(false) }
    var showColorsBottomSheet by rememberSaveable { mutableStateOf(false) }
    var providerModalSymbolCode by rememberSaveable { mutableStateOf<String?>(null) }
    var activeSettingsTab by rememberSaveable { mutableStateOf("sync") }

    var twelveDataKeyInput by rememberSaveable(chartPreferences.twelveDataApiKey) { mutableStateOf(chartPreferences.twelveDataApiKey) }
    var stooqKeyInput by rememberSaveable(chartPreferences.stooqApiKey) { mutableStateOf(chartPreferences.stooqApiKey) }
    var alphaVantageKeyInput by rememberSaveable(chartPreferences.alphaVantageApiKey) { mutableStateOf(chartPreferences.alphaVantageApiKey) }
    var finnhubKeyInput by rememberSaveable(chartPreferences.finnhubApiKey) { mutableStateOf(chartPreferences.finnhubApiKey) }

    val settingsTabs = listOf(
        "sync" to R.string.settings_cat_sync,
        "chart" to R.string.settings_cat_chart,
        "notifications" to R.string.settings_cat_notifications,
        "theme" to R.string.settings_cat_theme,
        "account" to R.string.settings_cat_account
    )

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        // [2] Compact 48.dp Header + 42.dp 5-Category Segmented Tab Bar (P1-UPG-9 Parity with Web)
        Surface(
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 0.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.settings_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                HorizontalDivider(thickness = 1.dp, color = financialPalette.cardBorder)

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                        .testTag("settings_category_tabs_bar"),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    for ((tabKey, labelRes) in settingsTabs) {
                        val isSelected = activeSettingsTab == tabKey
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.background,
                            border = BorderStroke(
                                1.dp,
                                if (isSelected) MaterialTheme.colorScheme.primary else financialPalette.cardBorder
                            ),
                            modifier = Modifier
                                .heightIn(min = 34.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { activeSettingsTab = tabKey }
                                .testTag("settings_tab_$tabKey")
                        ) {
                            Box(
                                contentAlignment = Alignment.Center,
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
                            ) {
                                Text(
                                    text = stringResource(labelRes),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                    color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
                HorizontalDivider(thickness = 1.dp, color = financialPalette.cardBorder)
            }
        }

        // [3] Vertical Scroll Content — Categorized by Active Tab (5 Synchronized Categories)
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
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
                if (statusBannerResId != null) {
                    Text(
                        text = stringResource(statusBannerResId),
                        style = MaterialTheme.typography.labelLarge,
                        color = financialPalette.bullCandle,
                        modifier = Modifier.testTag("settings_status_banner")
                    )
                }

                // =========================================================================
                // GROUP 1: 1. User Account (حساب کاربری)
                // =========================================================================
                if (activeSettingsTab == "account") {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("settings_group_account"),
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
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.AccountCircle,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(20.dp)
                                )
                                Column {
                                    Text(
                                        text = stringResource(R.string.settings_group_account),
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = ownerUsername.ifBlank { ownerEmail },
                                        style = MaterialTheme.typography.labelSmall,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        color = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.testTag("top_bar_user_badge")
                                    )
                                }
                            }

                            OutlinedButton(
                                onClick = onSignOut,
                                shape = RoundedCornerShape(8.dp),
                                border = BorderStroke(1.dp, financialPalette.cardBorder),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                modifier = Modifier
                                    .height(34.dp)
                                    .testTag("settings_sign_out_button")
                            ) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Outlined.Logout,
                                    contentDescription = stringResource(R.string.action_sign_out),
                                    tint = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(15.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = stringResource(R.string.action_sign_out),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.error,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }

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
                                .heightIn(min = 42.dp)
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

                        Button(
                            onClick = {
                                onUpdatePassword(newPassword)
                                newPassword = ""
                            },
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 42.dp)
                                .testTag("settings_update_password_button")
                        ) {
                            Text(text = stringResource(R.string.settings_change_password))
                        }
                    }
                }
                }

                // =========================================================================
                // GROUP 5: Theme & Appearance (تم و ظاهر)
                // =========================================================================
                if (activeSettingsTab == "theme") {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("settings_group_appearance"),
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
                            text = stringResource(R.string.settings_group_appearance),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        LanguageThemeSelector(
                            currentLanguage = currentLanguage,
                            isDarkTheme = isDarkTheme,
                            onLanguageSelected = onLanguageSelected,
                            onThemeSelected = onThemeSelected
                        )
                        HorizontalDivider(thickness = 1.dp, color = financialPalette.cardBorder)
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.settings_chart_colors_section),
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = stringResource(R.string.settings_chart_colors_hint),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            OutlinedButton(
                                onClick = { showColorsBottomSheet = true },
                                shape = RoundedCornerShape(8.dp),
                                border = BorderStroke(1.dp, financialPalette.cardBorder),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 42.dp)
                                    .testTag("open_chart_colors_sheet_button")
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.Palette,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = stringResource(R.string.settings_chart_colors_section),
                                    style = MaterialTheme.typography.labelMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }

                        // Live 3-Candle Theme Preview Box (P1-UPG-5)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(MaterialTheme.colorScheme.background)
                                .border(1.dp, financialPalette.cardBorder, RoundedCornerShape(8.dp))
                                .padding(horizontal = 12.dp, vertical = 10.dp)
                                .testTag("settings_live_candle_preview"),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = stringResource(R.string.settings_live_preview_title),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(width = 12.dp, height = 24.dp)
                                        .clip(RoundedCornerShape(2.dp))
                                        .background(chartPreferences.bullCandleColor)
                                )
                                Box(
                                    modifier = Modifier
                                        .size(width = 12.dp, height = 18.dp)
                                        .clip(RoundedCornerShape(2.dp))
                                        .background(chartPreferences.bearCandleColor)
                                )
                                Box(
                                    modifier = Modifier
                                        .size(width = 12.dp, height = 28.dp)
                                        .clip(RoundedCornerShape(2.dp))
                                        .background(chartPreferences.bullCandleColor)
                                )
                            }
                        }

                        HorizontalDivider(thickness = 1.dp, color = financialPalette.cardBorder)

                        // Persistent Default Drawing Line Stroke Width (Stacked vertically for readable mobile text)
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = if (currentLanguage == AppLanguage.FA) "ضخامت پیش‌فرض خطوط ترسیمی" else "Default Drawing Line Width",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = if (currentLanguage == AppLanguage.FA) "در حافظه باقی می‌ماند تا زمان بازنشانی (Reset)" else "Persists across sessions until Reset",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                for (wOpt in listOf(1.0f, 2.0f, 3.0f, 4.0f)) {
                                    val isSel = kotlin.math.abs(chartPreferences.defaultDrawingWidthDp - wOpt) < 0.35f
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .heightIn(min = 38.dp)
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(if (isSel) MaterialTheme.colorScheme.primary.copy(alpha = 0.22f) else MaterialTheme.colorScheme.background)
                                            .border(1.dp, if (isSel) MaterialTheme.colorScheme.primary else financialPalette.cardBorder, RoundedCornerShape(8.dp))
                                            .clickable { onUpdateDefaultDrawingWidth(wOpt) }
                                            .testTag("settings_default_line_width_${wOpt.toInt()}px"),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = "${wOpt.toInt()}px",
                                            style = MaterialTheme.typography.labelMedium,
                                            fontFamily = JetBrainsMonoFontFamily,
                                            fontWeight = if (isSel) FontWeight.Bold else FontWeight.Medium,
                                            color = if (isSel) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                                        )
                                    }
                                }
                            }
                        }

                        HorizontalDivider(thickness = 1.dp, color = financialPalette.cardBorder)

                        // Unified Reset All Settings to Factory Defaults Button
                        OutlinedButton(
                            onClick = onResetAllPreferences,
                            shape = RoundedCornerShape(8.dp),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.65f)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 42.dp)
                                .testTag("reset_all_settings_button")
                        ) {
                            Text(
                                text = if (currentLanguage == AppLanguage.FA) "↺ بازنشانی تمامی تنظیمات و رنگ‌ها به حالت اولیه (Reset)" else "↺ Reset All Colors, Line Widths & Settings to Default",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
                }

                // =========================================================================
                // GROUP 4: Sync & Data Sources — Dual-Mode Source & Symbol Explorer (v1.31.0)
                // =========================================================================
                if (activeSettingsTab == "sync") {
                var explorerMode by rememberSaveable { mutableStateOf("by_source") }
                var selectedExplorerProvider by rememberSaveable { mutableStateOf(ProviderId.TVDATAFEED) }
                var selectedMarketCategory by rememberSaveable { mutableStateOf("ALL") }
                var isFormulaExpanded by rememberSaveable { mutableStateOf(false) }
                var symbolSearchQuery by rememberSaveable { mutableStateOf("") }
                val isFa = currentLanguage == AppLanguage.FA

                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("settings_group_sources"),
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
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = stringResource(R.string.settings_group_sources),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = if (isFa) {
                                        "معماری DB-First: تاریخچه کندل‌های بسته‌شده فقط یک‌بار ذخیره شده و در مراجعات بعدی فقط کندل‌های جدید (Delta Sync) دریافت می‌شوند."
                                    } else {
                                        "DB-First Architecture: Historical closed candles are persisted once; subsequent syncs fetch only missing delta bars."
                                    },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Spacer(modifier = Modifier.width(8.dp))
                            Button(
                                onClick = { showAddSymbolDialog = true },
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                modifier = Modifier
                                    .heightIn(min = 36.dp)
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
                                    style = MaterialTheme.typography.labelSmall,
                                    maxLines = 1,
                                    softWrap = false
                                )
                            }
                        }

                        // Dual-Mode Switcher: (1) By Source Method -> Symbols | (2) By Symbol -> Sources
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(MaterialTheme.colorScheme.background)
                                .border(1.dp, financialPalette.cardBorder, RoundedCornerShape(8.dp))
                                .padding(4.dp)
                                .testTag("settings_source_explorer_mode_bar"),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            val modes = listOf(
                                "by_source" to (if (isFa) "۱. بر اساس منبع" else "1. By Source"),
                                "by_symbol" to (if (isFa) "۲. بر اساس نماد" else "2. By Symbol")
                            )
                            for ((modeKey, modeTitle) in modes) {
                                val isModeSelected = explorerMode == modeKey
                                Surface(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(6.dp))
                                        .clickable { explorerMode = modeKey }
                                        .testTag("explorer_mode_$modeKey"),
                                    shape = RoundedCornerShape(6.dp),
                                    color = if (isModeSelected) MaterialTheme.colorScheme.primary else Color.Transparent
                                ) {
                                    Box(
                                        contentAlignment = Alignment.Center,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp)
                                    ) {
                                        Text(
                                            text = modeTitle,
                                            style = MaterialTheme.typography.labelSmall,
                                            fontWeight = FontWeight.Bold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            color = if (isModeSelected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }
                        }

                        // Market Category Filter Chips (All | Metals | Energy | Crypto | Indices | Stocks | FX)
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text = stringResource(R.string.settings_source_by_market),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                val marketCats = listOf(
                                    "ALL" to stringResource(R.string.watchlist_filter_all),
                                    "METALS" to stringResource(R.string.watchlist_filter_metals),
                                    "ENERGY" to stringResource(R.string.watchlist_filter_energy),
                                    "CRYPTO" to stringResource(R.string.watchlist_filter_crypto),
                                    "INDICES" to stringResource(R.string.watchlist_filter_indices),
                                    "STOCKS" to stringResource(R.string.watchlist_filter_stocks),
                                    "FX" to stringResource(R.string.watchlist_filter_fx)
                                )
                                for ((catKey, catLabel) in marketCats) {
                                    FilterChip(
                                        selected = selectedMarketCategory == catKey,
                                        onClick = { selectedMarketCategory = catKey },
                                        label = {
                                            Text(
                                                text = catLabel,
                                                style = MaterialTheme.typography.labelSmall,
                                                maxLines = 1
                                            )
                                        },
                                        modifier = Modifier.testTag("settings_source_cat_${catKey.lowercase()}")
                                    )
                                }
                            }
                        }

                        if (explorerMode == "by_source") {
                            val methodCatalog = ProviderId.providerMethodCatalog
                            val activeMethodSpec = methodCatalog.firstOrNull { it.providerId == selectedExplorerProvider }
                                ?: methodCatalog.first()
                            val filteredMethodSymbols = activeMethodSpec.supportedSymbols.filter {
                                matchesSettingsMarketCategory(it.symbolCode, selectedMarketCategory)
                            }

                            // Provider Method Selector Chips (Single-row horizontal scroll to avoid clutter)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                for (spec in methodCatalog) {
                                    val isProvSelected = spec.providerId == selectedExplorerProvider
                                    val catCount = spec.supportedSymbols.count {
                                        matchesSettingsMarketCategory(it.symbolCode, selectedMarketCategory)
                                    }
                                    FilterChip(
                                        selected = isProvSelected,
                                        onClick = { selectedExplorerProvider = spec.providerId },
                                        label = {
                                            Text(
                                                text = "${spec.providerId.badgeLabel} ($catCount)",
                                                style = MaterialTheme.typography.labelSmall,
                                                fontFamily = JetBrainsMonoFontFamily,
                                                fontWeight = if (isProvSelected) FontWeight.Bold else FontWeight.Medium
                                            )
                                        },
                                        modifier = Modifier.testTag("select_explorer_provider_${spec.providerId.id}")
                                    )
                                }
                            }

                            if (selectedMarketCategory != "ALL" && filteredMethodSymbols.isNotEmpty()) {
                                OutlinedButton(
                                    onClick = {
                                        for (srcSym in filteredMethodSymbols) {
                                            onSelectProviderForSymbol(srcSym.symbolCode, activeMethodSpec.providerId)
                                            val curSym = symbols.firstOrNull { it.symbolCode == srcSym.symbolCode }
                                            if (curSym == null || !curSym.inWatchlist) {
                                                onToggleSymbolInWatchlist(srcSym.symbolCode, true)
                                            }
                                        }
                                    },
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .heightIn(min = 38.dp)
                                        .testTag("apply_category_provider_button")
                                ) {
                                    Text(
                                        text = "✓ ${stringResource(R.string.settings_source_default_for_cat)}: $selectedMarketCategory → ${activeMethodSpec.providerId.badgeLabel}",
                                        style = MaterialTheme.typography.labelSmall,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }

                            // Collapsible Technical Method Formula Accordion (Closed by default)
                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable { isFormulaExpanded = !isFormulaExpanded }
                                    .testTag("active_method_formula_card"),
                                shape = RoundedCornerShape(8.dp),
                                color = MaterialTheme.colorScheme.background,
                                border = BorderStroke(1.dp, financialPalette.cardBorder)
                            ) {
                                Column(
                                    modifier = Modifier.padding(10.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = if (isFa) activeMethodSpec.nameFa else activeMethodSpec.nameEn,
                                            style = MaterialTheme.typography.bodySmall,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.primary,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f)
                                        )
                                        Icon(
                                            imageVector = if (isFormulaExpanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                                            contentDescription = stringResource(R.string.settings_technical_accordion),
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                    if (isFormulaExpanded) {
                                        Text(
                                            text = (if (isFa) "فرمول و الگوریتم جمع‌آوری: " else "Collection Formula: ") +
                                                (if (isFa) activeMethodSpec.formulaFa else activeMethodSpec.formulaEn),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                            Text(
                                                text = "${activeMethodSpec.persistenceRule} · TF: ${activeMethodSpec.supportedTimeframes.joinToString(", ")}",
                                                style = MaterialTheme.typography.labelSmall,
                                                fontFamily = JetBrainsMonoFontFamily,
                                                color = financialPalette.bullCandle
                                            )
                                        }
                                    }
                                }
                            }

                            // Supported Symbols inside selected Source & Category
                            for (srcSym in filteredMethodSymbols) {
                                val existingSym = symbols.firstOrNull { it.symbolCode == srcSym.symbolCode }
                                val isActiveWithThisSource = existingSym != null &&
                                    existingSym.inWatchlist &&
                                    existingSym.activeProvider == activeMethodSpec.providerId

                                Card(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .testTag("source_symbol_row_${activeMethodSpec.providerId.id}_${srcSym.symbolCode.lowercase()}"),
                                    shape = RoundedCornerShape(8.dp),
                                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                                    border = BorderStroke(
                                        1.dp,
                                        if (isActiveWithThisSource) financialPalette.bullCandle else financialPalette.cardBorder
                                    )
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 10.dp, vertical = 8.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(
                                            modifier = Modifier.weight(1f),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            es.manico.chartintelligence.ui.components.AssetSymbolBadge(
                                                symbolCode = srcSym.symbolCode,
                                                sizeDp = 30.dp
                                            )
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    text = if (isFa) srcSym.labelFa else srcSym.labelEn,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    fontWeight = FontWeight.Bold,
                                                    color = MaterialTheme.colorScheme.onSurface,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                                    val barsInfo = if (existingSym != null && existingSym.activeProvider == activeMethodSpec.providerId) {
                                                        " · ${existingSym.storedCandleCount} bars"
                                                    } else ""
                                                    Text(
                                                        text = "${srcSym.symbolCode} · ${srcSym.providerTicker}$barsInfo",
                                                        style = MaterialTheme.typography.labelSmall,
                                                        fontFamily = JetBrainsMonoFontFamily,
                                                        color = MaterialTheme.colorScheme.primary,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                }
                                            }
                                        }

                                        Spacer(modifier = Modifier.width(6.dp))

                                        Button(
                                            onClick = {
                                                onSelectProviderForSymbol(srcSym.symbolCode, activeMethodSpec.providerId)
                                                if (existingSym == null || !existingSym.inWatchlist) {
                                                    onToggleSymbolInWatchlist(srcSym.symbolCode, true)
                                                }
                                            },
                                            shape = RoundedCornerShape(6.dp),
                                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                            modifier = Modifier
                                                .height(34.dp)
                                                .testTag("activate_source_symbol_${activeMethodSpec.providerId.id}_${srcSym.symbolCode.lowercase()}")
                                        ) {
                                            Text(
                                                text = if (isActiveWithThisSource) {
                                                    if (isFa) "✓ فعال" else "✓ Active"
                                                } else {
                                                    if (isFa) "انتخاب" else "Use Source"
                                                },
                                                style = MaterialTheme.typography.labelSmall,
                                                maxLines = 1,
                                                softWrap = false
                                            )
                                        }
                                    }
                                }
                            }

                            HorizontalDivider(thickness = 1.dp, color = financialPalette.cardBorder)
                        } else {
                            OutlinedTextField(
                                value = symbolSearchQuery,
                                onValueChange = { symbolSearchQuery = it },
                                label = {
                                    Text(
                                        if (isFa) "جستجوی نماد (مثلاً SPOTBRENT، XAUUSD، BTCUSD)…"
                                        else "Search symbol (e.g. SPOTBRENT, XAUUSD, BTCUSD)…"
                                    )
                                },
                                singleLine = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("symbol_explorer_search_input")
                            )
                        }

                        Text(
                            text = stringResource(R.string.settings_symbols_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        val filteredSymbols = symbols.filter {
                            val matchesCat = matchesSettingsMarketCategory(it.symbolCode, selectedMarketCategory)
                            val matchesQ = if (explorerMode == "by_symbol" && symbolSearchQuery.isNotBlank()) {
                                val q = symbolSearchQuery.trim().uppercase()
                                it.symbolCode.uppercase().contains(q) ||
                                    (it.customTitle?.uppercase()?.contains(q) == true)
                            } else {
                                true
                            }
                            matchesCat && matchesQ
                        }

                        for (symbol in filteredSymbols) {
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
                                        Row(
                                            modifier = Modifier.weight(1f),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                                        ) {
                                            es.manico.chartintelligence.ui.components.AssetSymbolBadge(
                                                symbolCode = symbol.symbolCode,
                                                sizeDp = 34.dp
                                            )
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
                                                        text = "${symbol.symbolCode} · ${symbol.activeProvider.badgeLabel} · ${symbol.storedCandleCount} bars · ${symbol.lastSyncMode}",
                                                        style = MaterialTheme.typography.labelSmall,
                                                        fontFamily = JetBrainsMonoFontFamily,
                                                        color = MaterialTheme.colorScheme.primary
                                                    )
                                                }
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
                                                modifier = Modifier
                                                    .height(32.dp)
                                                    .testTag("change_provider_${symbol.symbolCode.lowercase()}")
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Outlined.Tune,
                                                    contentDescription = stringResource(R.string.settings_change_provider),
                                                    modifier = Modifier.size(14.dp)
                                                )
                                                Spacer(modifier = Modifier.width(4.dp))
                                                Text(
                                                    text = symbol.activeProvider.badgeLabel,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    fontFamily = JetBrainsMonoFontFamily
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

                                    // In by_symbol mode, also show direct provider selector chips for all compatible methods
                                    if (explorerMode == "by_symbol") {
                                        FlowRow(
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                            verticalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            for (prov in symbol.allowedProviders) {
                                                val isActive = symbol.activeProvider == prov
                                                FilterChip(
                                                    selected = isActive,
                                                    onClick = { onSelectProviderForSymbol(symbol.symbolCode, prov) },
                                                    label = {
                                                        Text(
                                                            text = prov.badgeLabel,
                                                            style = MaterialTheme.typography.labelSmall,
                                                            fontFamily = JetBrainsMonoFontFamily
                                                        )
                                                    }
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

                // =========================================================================
                // GROUP 2: Chart Scales & Algorithm Parameters (چارت و مقیاس‌ها)
                // =========================================================================
                if (activeSettingsTab == "chart") {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("settings_group_params"),
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
                                text = stringResource(R.string.settings_group_params),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold
                            )
                            OutlinedButton(
                                onClick = onResetAlgoParams,
                                shape = RoundedCornerShape(8.dp),
                                border = BorderStroke(1.dp, financialPalette.cardBorder),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                modifier = Modifier
                                    .height(32.dp)
                                    .testTag("reset_algo_params_button")
                            ) {
                                Text(
                                    text = stringResource(R.string.settings_action_reset_params),
                                    style = MaterialTheme.typography.labelSmall
                                )
                            }
                        }

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

                        HorizontalDivider(thickness = 1.dp, color = financialPalette.cardBorder)

                        TradingViewSwitchRow(
                            title = stringResource(R.string.settings_tv_log_scale),
                            subtitle = stringResource(R.string.settings_tv_log_scale_sub),
                            checked = chartPreferences.logarithmicScaleDefault,
                            onCheckedChange = { v -> onUpdateTradingViewPreference { it.copy(logarithmicScaleDefault = v) } },
                            testTag = "switch_tv_log_scale"
                        )
                        TradingViewSwitchRow(
                            title = stringResource(R.string.settings_tv_remember_last_chart),
                            subtitle = stringResource(R.string.settings_tv_remember_last_chart_sub),
                            checked = chartPreferences.rememberLastChartOnDevice,
                            onCheckedChange = { v -> onUpdateTradingViewPreference { it.copy(rememberLastChartOnDevice = v) } },
                            testTag = "switch_tv_remember_last_chart"
                        )
                        TradingViewSwitchRow(
                            title = stringResource(R.string.settings_tv_hide_tab_bar),
                            subtitle = stringResource(R.string.settings_tv_hide_tab_bar_sub),
                            checked = chartPreferences.hideTabBarInLandscape,
                            onCheckedChange = { v -> onUpdateTradingViewPreference { it.copy(hideTabBarInLandscape = v) } },
                            testTag = "switch_tv_hide_tab_bar"
                        )
                        TradingViewSwitchRow(
                            title = stringResource(R.string.settings_tv_countdown_bar_close),
                            subtitle = null,
                            checked = chartPreferences.showCountdownToBarClose,
                            onCheckedChange = { v -> onUpdateTradingViewPreference { it.copy(showCountdownToBarClose = v) } },
                            testTag = "switch_tv_countdown"
                        )
                        TradingViewSwitchRow(
                            title = stringResource(R.string.settings_tv_prev_close_line),
                            subtitle = null,
                            checked = chartPreferences.showPrevCloseLine,
                            onCheckedChange = { v -> onUpdateTradingViewPreference { it.copy(showPrevCloseLine = v) } },
                            testTag = "switch_tv_prev_close"
                        )
                        TradingViewSwitchRow(
                            title = stringResource(R.string.settings_tv_high_low_labels),
                            subtitle = null,
                            checked = chartPreferences.showHighLowLabels,
                            onCheckedChange = { v -> onUpdateTradingViewPreference { it.copy(showHighLowLabels = v) } },
                            testTag = "switch_tv_high_low_labels"
                        )

                        // Chart Clock & X-Axis Timezone Selector (UTC / Local)
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.settings_timezone_label),
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                val tzIsLocal = chartPreferences.timezoneMode.equals("LOCAL", ignoreCase = true)
                                FilterChip(
                                    selected = !tzIsLocal,
                                    onClick = { onUpdateTimezoneMode("UTC") },
                                    label = {
                                        Text(
                                            text = stringResource(R.string.settings_timezone_utc),
                                            style = MaterialTheme.typography.labelSmall,
                                            maxLines = 1
                                        )
                                    },
                                    modifier = Modifier
                                        .weight(1f)
                                        .testTag("settings_tz_utc")
                                )
                                FilterChip(
                                    selected = tzIsLocal,
                                    onClick = { onUpdateTimezoneMode("LOCAL") },
                                    label = {
                                        Text(
                                            text = stringResource(R.string.settings_timezone_local),
                                            style = MaterialTheme.typography.labelSmall,
                                            maxLines = 1
                                        )
                                    },
                                    modifier = Modifier
                                        .weight(1f)
                                        .testTag("settings_tz_local")
                                )
                            }
                        }

                        HorizontalDivider(thickness = 1.dp, color = financialPalette.cardBorder)

                        // Customizable Bollinger Bands (Period & StdDev) in Chart Settings
                        val bbPeriod = chartPreferences.bollingerPeriod.coerceIn(5, 200)
                        val bbStdDev = chartPreferences.bollingerStdDev.coerceIn(0.5f, 5.0f)
                        Text(
                            text = if (currentLanguage == AppLanguage.FA) "تنظیمات اندیکاتور باندهای بولینگر (Bollinger Bands)" else "Bollinger Bands Parameters (Period & StdDev)",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Period:",
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            for (pOpt in listOf(10, 14, 20, 30, 50)) {
                                val sel = bbPeriod == pOpt
                                FilterChip(
                                    selected = sel,
                                    onClick = { onUpdateBollingerParams(pOpt, bbStdDev) },
                                    label = {
                                        Text(
                                            text = pOpt.toString(),
                                            style = MaterialTheme.typography.labelSmall,
                                            fontFamily = JetBrainsMonoFontFamily
                                        )
                                    },
                                    modifier = Modifier.testTag("settings_bb_period_$pOpt")
                                )
                            }
                        }
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "StdDev:",
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            for (sdOpt in listOf(1.5f, 2.0f, 2.5f, 3.0f)) {
                                val sel = kotlin.math.abs(bbStdDev - sdOpt) < 0.05f
                                FilterChip(
                                    selected = sel,
                                    onClick = { onUpdateBollingerParams(bbPeriod, sdOpt) },
                                    label = {
                                        Text(
                                            text = "${sdOpt}σ",
                                            style = MaterialTheme.typography.labelSmall,
                                            fontFamily = JetBrainsMonoFontFamily
                                        )
                                    },
                                    modifier = Modifier.testTag("settings_bb_stddev_${(sdOpt * 10).toInt()}")
                                )
                            }
                        }
                    }
                }
                }

                // =========================================================================
                // GROUP 3: Notifications, Haptic Feedback & Watchlist Display (نوتیفیکیشن و بازخورد)
                // =========================================================================
                if (activeSettingsTab == "notifications") {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("settings_group_notifications"),
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
                        Text(
                            text = stringResource(R.string.settings_section_notifications_title),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = stringResource(R.string.settings_section_notifications_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        HorizontalDivider(thickness = 1.dp, color = financialPalette.cardBorder)

                        TradingViewSwitchRow(
                            title = stringResource(R.string.settings_tv_chart_vibrations),
                            subtitle = stringResource(R.string.settings_tv_chart_vibrations_sub),
                            checked = chartPreferences.chartVibrations,
                            onCheckedChange = { v -> onUpdateTradingViewPreference { it.copy(chartVibrations = v) } },
                            testTag = "switch_tv_chart_vibrations"
                        )
                        TradingViewSwitchRow(
                            title = stringResource(R.string.settings_tv_picker_vibrates),
                            subtitle = null,
                            checked = chartPreferences.pickerVibrations,
                            onCheckedChange = { v -> onUpdateTradingViewPreference { it.copy(pickerVibrations = v) } },
                            testTag = "switch_tv_picker_vibrates"
                        )
                        TradingViewSwitchRow(
                            title = stringResource(R.string.settings_tv_picker_magnifiers),
                            subtitle = null,
                            checked = chartPreferences.showPickerScrollMagnifiers,
                            onCheckedChange = { v -> onUpdateTradingViewPreference { it.copy(showPickerScrollMagnifiers = v) } },
                            testTag = "switch_tv_picker_magnifiers"
                        )

                        HorizontalDivider(thickness = 1.dp, color = financialPalette.cardBorder)

                        Text(
                            text = stringResource(R.string.settings_tv_watchlist_section),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )

                        TradingViewSwitchRow(
                            title = stringResource(R.string.settings_tv_show_symbol_screen),
                            subtitle = null,
                            checked = chartPreferences.showSymbolScreen,
                            onCheckedChange = { v -> onUpdateTradingViewPreference { it.copy(showSymbolScreen = v) } },
                            testTag = "switch_tv_show_symbol_screen"
                        )
                        TradingViewSwitchRow(
                            title = stringResource(R.string.settings_tv_hide_logos),
                            subtitle = null,
                            checked = chartPreferences.hideWatchlistLogos,
                            onCheckedChange = { v -> onUpdateTradingViewPreference { it.copy(hideWatchlistLogos = v) } },
                            testTag = "switch_tv_hide_logos"
                        )
                    }
                }
                }

                // =========================================================================
                // Server Health & Cloud Workspace Status (under Sync tab) + About (under Theme/Sync)
                // =========================================================================
                if (activeSettingsTab == "sync" || activeSettingsTab == "theme") {
                var isDiagnosticsExpanded by rememberSaveable { mutableStateOf(false) }
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("settings_server_health_card"),
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
                            Row(
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(end = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                val isDbOnline = systemStatus?.dbConnected == true
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .clip(CircleShape)
                                        .background(if (isDbOnline) financialPalette.bullCandle else financialPalette.warning)
                                )
                                Text(
                                    text = stringResource(R.string.server_status_title),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f, fill = false)
                                )
                                Surface(
                                    shape = RoundedCornerShape(4.dp),
                                    color = MaterialTheme.colorScheme.background,
                                    border = BorderStroke(1.dp, financialPalette.cardBorder)
                                ) {
                                    Text(
                                        text = systemStatus?.dbVersion ?: "MariaDB",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }

                            OutlinedButton(
                                onClick = onSyncCloudWorkspace,
                                enabled = !isWorkspaceSyncing,
                                shape = RoundedCornerShape(6.dp),
                                border = BorderStroke(1.dp, financialPalette.cardBorder),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                modifier = Modifier
                                    .heightIn(min = 34.dp)
                                    .testTag("sync_cloud_workspace_button")
                            ) {
                                Text(
                                    text = if (isWorkspaceSyncing) "☁️ " + stringResource(R.string.server_status_syncing) else "☁️ " + stringResource(R.string.server_status_btn_sync),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.primary,
                                    maxLines = 1,
                                    softWrap = false
                                )
                            }
                        }

                        // Collapsible Technical Diagnostics (Closed by default to reduce clutter)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(6.dp))
                                .background(MaterialTheme.colorScheme.background)
                                .clickable { isDiagnosticsExpanded = !isDiagnosticsExpanded }
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = stringResource(R.string.settings_technical_accordion),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Icon(
                                imageVector = if (isDiagnosticsExpanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        if (isDiagnosticsExpanded) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Surface(
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(6.dp),
                                    color = MaterialTheme.colorScheme.background,
                                    border = BorderStroke(1.dp, financialPalette.cardBorder)
                                ) {
                                    Column(modifier = Modifier.padding(8.dp)) {
                                        Text(
                                            text = stringResource(R.string.server_status_db_candles),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        val candleStr = systemStatus?.totalCandles?.let { if (it > 0) it.toString() else "5,000+" } ?: "5,000+"
                                        Text(
                                            text = candleStr,
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Bold,
                                            fontFamily = JetBrainsMonoFontFamily,
                                            color = financialPalette.bullCandle
                                        )
                                    }
                                }

                                Surface(
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(6.dp),
                                    color = MaterialTheme.colorScheme.background,
                                    border = BorderStroke(1.dp, financialPalette.cardBorder)
                                ) {
                                    Column(modifier = Modifier.padding(8.dp)) {
                                        Text(
                                            text = stringResource(R.string.server_status_server_utc),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        val utcStr = systemStatus?.serverTimeUtc?.takeIf { it.isNotBlank() }?.let {
                                            if (it.length >= 19) it.substring(11, 19) + " UTC" else it
                                        } ?: "UTC Connected"
                                        Text(
                                            text = utcStr,
                                            style = MaterialTheme.typography.labelSmall,
                                            fontWeight = FontWeight.SemiBold,
                                            fontFamily = JetBrainsMonoFontFamily,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                    }
                                }

                                Surface(
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(6.dp),
                                    color = MaterialTheme.colorScheme.background,
                                    border = BorderStroke(1.dp, financialPalette.cardBorder)
                                ) {
                                    Column(modifier = Modifier.padding(8.dp)) {
                                        Text(
                                            text = stringResource(R.string.server_status_cloud_sync),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        val syncStr = lastWorkspaceSyncedAt ?: stringResource(R.string.server_status_local_synced)
                                        Text(
                                            text = syncStr,
                                            style = MaterialTheme.typography.labelSmall,
                                            fontWeight = FontWeight.SemiBold,
                                            fontFamily = JetBrainsMonoFontFamily,
                                            color = MaterialTheme.colorScheme.primary
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("settings_group_about"),
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, financialPalette.cardBorder)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Info,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = stringResource(R.string.settings_group_about),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                        Text(
                            text = stringResource(R.string.settings_about_version),
                            style = MaterialTheme.typography.labelMedium,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = stringResource(R.string.app_subtitle),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                }

                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }

    // BottomSheet for Per-Symbol Data Provider Selection (Group 3)
    val modalSymbol = symbols.firstOrNull { it.symbolCode == providerModalSymbolCode }
    if (modalSymbol != null) {
        ModalBottomSheet(
            onDismissRequest = { providerModalSymbolCode = null },
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .navigationBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "${modalSymbol.symbolCode} · ${stringResource(R.string.settings_select_provider)}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
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
                            .padding(vertical = 8.dp, horizontal = 6.dp)
                            .testTag("provider_chip_${modalSymbol.symbolCode.lowercase()}_${provider.id}"),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = isSelected,
                            onClick = {
                                onSelectProviderForSymbol(modalSymbol.symbolCode, provider)
                                providerModalSymbolCode = null
                            }
                        )
                        Spacer(modifier = Modifier.width(8.dp))
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
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }

    // BottomSheet for Chart Visual Colors (Group 2)
    if (showColorsBottomSheet) {
        ModalBottomSheet(
            onDismissRequest = { showColorsBottomSheet = false },
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .navigationBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
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

                ColorOptionRow(
                    title = stringResource(R.string.settings_color_bull),
                    selectedHex = chartPreferences.bullCandleColorHex,
                    presetHexes = listOf("FF26A69A", "FF10B981", "FF06B6D4", "FF22C55E", "FFD1D4DC"),
                    onSelectHex = onUpdateBullColor
                )
                ColorOptionRow(
                    title = stringResource(R.string.settings_color_bear),
                    selectedHex = chartPreferences.bearCandleColorHex,
                    presetHexes = listOf("FFEF5350", "FFF43F5E", "FFE11D48", "FFF97316", "FFA855F7"),
                    onSelectHex = onUpdateBearColor
                )
                ColorOptionRow(
                    title = stringResource(R.string.settings_color_trend),
                    selectedHex = chartPreferences.trendLineColorHex,
                    presetHexes = listOf("FF2962FF", "FFA855F7", "FF38BDF8", "FFF59E0B", "FFD1D4DC"),
                    onSelectHex = onUpdateTrendColor
                )
                ColorOptionRow(
                    title = stringResource(R.string.settings_color_hline),
                    selectedHex = chartPreferences.horizontalLineColorHex,
                    presetHexes = listOf("FF38BDF8", "FF2962FF", "FF26A69A", "FFF59E0B", "FFD1D4DC"),
                    onSelectHex = onUpdateHLineColor
                )
                ColorOptionRow(
                    title = stringResource(R.string.settings_color_vline),
                    selectedHex = chartPreferences.verticalLineColorHex,
                    presetHexes = listOf("FFF59E0B", "FFD946EF", "FF6366F1", "FF787B86", "FFD1D4DC"),
                    onSelectHex = onUpdateVLineColor
                )
                Spacer(modifier = Modifier.height(16.dp))
            }
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
                    listOf(
                        ProviderId.TVDATAFEED,
                        ProviderId.DUKASCOPY,
                        ProviderId.TWELVE_DATA,
                        ProviderId.YAHOO_FINANCE
                    ).forEach { prov ->
                        FilterChip(
                            selected = selectedProvider == prov,
                            onClick = { selectedProvider = prov },
                            label = {
                                Text(
                                    text = prov.badgeLabel,
                                    style = MaterialTheme.typography.labelSmall
                                )
                            }
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val cleanCode = symbolCode.trim().uppercase()
                    if (cleanCode.length >= 2) {
                        val dec = decimalsText.toIntOrNull()?.coerceIn(0, 8) ?: 2
                        onConfirm(cleanCode, displayName.trim().ifBlank { cleanCode }, dec, selectedProvider)
                    }
                },
                enabled = symbolCode.trim().length >= 2
            ) {
                Text(stringResource(R.string.settings_action_add_symbol))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_cancel))
            }
        }
    )
}

@Composable
private fun TradingViewSwitchRow(
    title: String,
    subtitle: String?,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    testTag: String
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) }
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            modifier = Modifier.testTag(testTag)
        )
    }
}

private fun matchesSettingsMarketCategory(symbolCode: String, category: String): Boolean {
    if (category == "ALL") return true
    val code = symbolCode.trim().uppercase()
    return when (category) {
        "METALS" -> code in setOf("XAUUSD", "XAGUSD") || code.contains("XAU") || code.contains("XAG")
        "ENERGY" -> code in setOf("SPOTBRENT", "BRENT_FUTURES", "USOIL") || code.contains("BRENT") || code.contains("OIL") || code.contains("WTI")
        "CRYPTO" -> code in setOf("BTCUSD", "ETHUSD") || code.contains("BTC") || code.contains("ETH")
        "INDICES" -> code in setOf("SPX500USD", "NDQ") || code.contains("SPX") || code.contains("NDQ") || code.contains("NAS")
        "STOCKS" -> code in setOf("NVDA", "AMZN", "TSLA", "AAPL", "GOOGL", "MSFT", "META", "NFLX", "AMD", "UBER", "NKE", "IBM", "SAN")
        "FX" -> code in setOf("EURUSD", "GBPUSD", "USDJPY") || code.contains("EUR") || code.contains("GBP") || code.contains("JPY")
        else -> true
    }
}
