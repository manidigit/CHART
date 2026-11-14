package es.manico.chartintelligence

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.FormatListBulleted
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.CandlestickChart
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarDefaults
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import es.manico.chartintelligence.ui.screens.ChartViewScreen
import es.manico.chartintelligence.ui.screens.ForecastLabScreen
import es.manico.chartintelligence.ui.screens.LoginScreen
import es.manico.chartintelligence.ui.screens.SettingsScreen
import es.manico.chartintelligence.ui.screens.WatchlistScreen
import es.manico.chartintelligence.ui.state.MainViewModel
import es.manico.chartintelligence.ui.state.WorkspaceScreen
import es.manico.chartintelligence.ui.theme.ChartIntelligenceTheme
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ChartIntelligenceApp()
        }
    }
}

@Composable
fun ChartIntelligenceApp(
    mainViewModel: MainViewModel = viewModel()
) {
    val state by mainViewModel.uiState.collectAsStateWithLifecycle()
    val hideBottomBar = state.currentScreen == WorkspaceScreen.CHART_VIEW

    val handleSignOut: () -> Unit = {
        mainViewModel.signOut()
    }

    ChartIntelligenceTheme(
        darkTheme = state.isDarkTheme,
        language = state.language
    ) {
        val financialPalette = LocalFinancialPalette.current

        Scaffold(
            modifier = Modifier.fillMaxSize(),
            containerColor = MaterialTheme.colorScheme.background,
            contentWindowInsets = WindowInsets.safeDrawing,
            bottomBar = {
                if (state.isAuthenticated && !hideBottomBar) {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        HorizontalDivider(
                            thickness = 1.dp,
                            color = financialPalette.cardBorder
                        )
                        NavigationBar(
                            containerColor = MaterialTheme.colorScheme.surface,
                            tonalElevation = 0.dp,
                            windowInsets = NavigationBarDefaults.windowInsets
                        ) {
                            val navColors = NavigationBarItemDefaults.colors(
                                selectedIconColor = MaterialTheme.colorScheme.primary,
                                selectedTextColor = MaterialTheme.colorScheme.primary,
                                indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                                unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            // 1. Watchlist
                            NavigationBarItem(
                                selected = state.currentScreen == WorkspaceScreen.WATCHLIST,
                                onClick = { mainViewModel.navigateTo(WorkspaceScreen.WATCHLIST) },
                                colors = navColors,
                                icon = {
                                    BadgedBox(
                                        badge = {
                                            if (state.watchlistSymbols.isNotEmpty()) {
                                                Badge(
                                                    containerColor = MaterialTheme.colorScheme.primary,
                                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                                ) {
                                                    Text(state.watchlistSymbols.size.toString())
                                                }
                                            }
                                        }
                                    ) {
                                        Icon(
                                            imageVector = Icons.AutoMirrored.Outlined.FormatListBulleted,
                                            contentDescription = stringResource(R.string.nav_watchlist)
                                        )
                                    }
                                },
                                label = {
                                    Text(
                                        text = stringResource(R.string.nav_watchlist),
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                },
                                modifier = Modifier.testTag("nav_watchlist_item")
                            )

                            // 2. Chart
                            NavigationBarItem(
                                selected = state.currentScreen == WorkspaceScreen.CHART_VIEW,
                                onClick = { mainViewModel.navigateTo(WorkspaceScreen.CHART_VIEW) },
                                colors = navColors,
                                icon = {
                                    Icon(
                                        imageVector = Icons.Outlined.CandlestickChart,
                                        contentDescription = stringResource(R.string.nav_chart_view)
                                    )
                                },
                                label = {
                                    Text(
                                        text = stringResource(R.string.nav_chart_view),
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                },
                                modifier = Modifier.testTag("nav_chart_view_item")
                            )

                            // 3. Forecast Lab
                            NavigationBarItem(
                                selected = state.currentScreen == WorkspaceScreen.PREDICTION,
                                onClick = { mainViewModel.navigateTo(WorkspaceScreen.PREDICTION) },
                                colors = navColors,
                                icon = {
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Outlined.TrendingUp,
                                        contentDescription = stringResource(R.string.nav_forecast_lab)
                                    )
                                },
                                label = {
                                    Text(
                                        text = stringResource(R.string.nav_forecast_lab),
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                },
                                modifier = Modifier.testTag("nav_prediction_item")
                            )

                            // 4. Settings
                            NavigationBarItem(
                                selected = state.currentScreen == WorkspaceScreen.SETTINGS,
                                onClick = { mainViewModel.navigateTo(WorkspaceScreen.SETTINGS) },
                                colors = navColors,
                                icon = {
                                    Icon(
                                        imageVector = Icons.Outlined.Settings,
                                        contentDescription = stringResource(R.string.nav_settings)
                                    )
                                },
                                label = {
                                    Text(
                                        text = stringResource(R.string.nav_settings),
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                },
                                modifier = Modifier.testTag("nav_settings_item")
                            )
                        }
                    }
                }
            }
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            ) {
                if (!state.isAuthenticated) {
                    LoginScreen(
                        isOwnerRegistered = state.isOwnerRegistered,
                        initialUsername = state.ownerUsername,
                        initialEmail = state.ownerEmail,
                        initialPassword = "",
                        rememberCredentials = state.rememberCredentials,
                        authMode = state.authMode,
                        authErrorResId = state.authErrorResId,
                        authInfoResId = state.authInfoResId,
                        currentLanguage = state.language,
                        isDarkTheme = state.isDarkTheme,
                        onLanguageSelected = mainViewModel::setLanguage,
                        onThemeSelected = mainViewModel::setDarkTheme,
                        onRememberCredentialsChanged = mainViewModel::setRememberCredentials,
                        onRegisterFirstOwner = mainViewModel::registerFirstTimeOwner,
                        onSignInOwner = mainViewModel::signInOwner,
                        onSetAuthMode = mainViewModel::setAuthMode,
                        onRequestPasswordRecoveryCode = mainViewModel::requestPasswordRecoveryCode,
                        onConfirmPasswordRecovery = mainViewModel::confirmPasswordRecovery
                    )
                } else {
                    when (state.currentScreen) {
                        WorkspaceScreen.WATCHLIST -> WatchlistScreen(
                            watchlistSymbols = state.watchlistSymbols,
                            allSymbols = state.symbols,
                            openTabs = state.openTabs,
                            isSyncingAll = state.isSyncingAll,
                            statusBannerResId = state.statusBannerResId,
                            preferences = state.chartPreferences,
                            onSyncSymbolNow = mainViewModel::syncSingleSymbolUpToNow,
                            onSyncAllNow = mainViewModel::syncAllWatchlistUpToNow,
                            onOpenSymbolInChartTab = mainViewModel::openSymbolInChartTab,
                            onToggleSymbolInWatchlist = mainViewModel::toggleSymbolInWatchlist,
                            onReorderSymbol = mainViewModel::reorderSymbol,
                            onAddCustomSymbol = mainViewModel::addCustomSymbol,
                            onNavigateToSettings = { mainViewModel.navigateTo(WorkspaceScreen.SETTINGS) },
                            onNavigateToPrediction = { mainViewModel.navigateTo(WorkspaceScreen.PREDICTION) },
                            currentLanguage = state.language,
                            symbolIntelByCode = state.symbolIntelByCode,
                            isIntelLoading = state.isIntelLoading,
                            onLoadSymbolIntel = mainViewModel::loadSymbolIntel,
                            onGetD1CandlesForSymbol = mainViewModel::getD1CandlesForSymbol,
                            onExportCandlesCsvToUri = { uri, sym, tf -> mainViewModel.exportCandlesCsvToUri(uri, sym, tf) },
                            onExportCandlesJsonToUri = { uri, sym, tf -> mainViewModel.exportCandlesJsonToUri(uri, sym, tf) }
                        )

                        WorkspaceScreen.CHART_VIEW -> ChartViewScreen(
                            openTabs = state.openTabs,
                            activeTab = state.activeTab,
                            watchlistSymbols = state.watchlistSymbols,
                            preferences = state.chartPreferences,
                            onSelectTab = mainViewModel::selectChartTab,
                            onCloseTab = mainViewModel::closeChartTab,
                            onOpenSymbolFromWatchlist = mainViewModel::openSymbolInChartTab,
                            onSyncActiveSymbolNow = mainViewModel::syncSingleSymbolUpToNow,
                            onBackToWatchlist = mainViewModel::navigateBack,
                            onSelectTimeframe = mainViewModel::selectTimeframeForActiveTab,
                            onSelectDateRange = mainViewModel::selectDateRangeForActiveTab,
                            onSelectChartType = mainViewModel::selectChartTypeForActiveTab,
                            onToggleVolume = mainViewModel::toggleVolumeOnActiveTab,
                            onCycleVolumeHeight = mainViewModel::cycleVolumePaneHeightOnActiveTab,
                            onToggleSma20 = mainViewModel::toggleSma20OnActiveTab,
                            onToggleSma50 = mainViewModel::toggleSma50OnActiveTab,
                            onToggleSma200 = mainViewModel::toggleSma200OnActiveTab,
                            onToggleEma20 = mainViewModel::toggleEma20OnActiveTab,
                            onToggleEma50 = mainViewModel::toggleEma50OnActiveTab,
                            onToggleBollinger = mainViewModel::toggleBollingerOnActiveTab,
                            onToggleSupertrend = mainViewModel::toggleSupertrendOnActiveTab,
                            onToggleVwap = mainViewModel::toggleVwapOnActiveTab,
                            onToggleRsi14 = mainViewModel::toggleRsi14OnActiveTab,
                            onToggleMacd = mainViewModel::toggleMacdOnActiveTab,
                            onToggleOverlayMacd = mainViewModel::toggleOverlayMacdOnActiveTab,
                            onToggleAtr14 = mainViewModel::toggleAtr14OnActiveTab,
                            onToggleSmcStructure = mainViewModel::toggleSmcStructureOnActiveTab,
                            onToggleFvg = mainViewModel::toggleFvgOnActiveTab,
                            onToggleVolumeProfile = mainViewModel::toggleVolumeProfileOnActiveTab,
                            onTogglePivotPoints = mainViewModel::togglePivotPointsOnActiveTab,
                            onSelectPivotType = mainViewModel::setPivotTypeOnActiveTab,
                            onToggleFutureProjection = mainViewModel::toggleFutureProjectionOnActiveTab,
                            onToggleEma200 = mainViewModel::toggleEma200OnActiveTab,
                            onTogglePsar = mainViewModel::togglePsarOnActiveTab,
                            onToggleIchimoku = mainViewModel::toggleIchimokuOnActiveTab,
                            onToggleKeltner = mainViewModel::toggleKeltnerOnActiveTab,
                            onToggleDonchian = mainViewModel::toggleDonchianOnActiveTab,
                            onToggleMtfEma = mainViewModel::toggleMtfEmaOnActiveTab,
                            onToggleKillzones = mainViewModel::toggleKillzonesOnActiveTab,
                            onToggleAdx14 = mainViewModel::toggleAdx14OnActiveTab,
                            onToggleStoch14 = mainViewModel::toggleStoch14OnActiveTab,
                            onToggleCci20 = mainViewModel::toggleCci20OnActiveTab,
                            onToggleWillR14 = mainViewModel::toggleWillR14OnActiveTab,
                            onToggleObv = mainViewModel::toggleObvOnActiveTab,
                            onToggleCmf20 = mainViewModel::toggleCmf20OnActiveTab,
                            onToggleRoc12 = mainViewModel::toggleRoc12OnActiveTab,
                            onUpdateBollingerParams = mainViewModel::updateBollingerParams,
                            onUpdateIndicatorFamilyColor = mainViewModel::updateIndicatorFamilyColor,
                            onZoom = mainViewModel::zoomActiveTab,
                            onPinchZoom = mainViewModel::pinchZoomActiveTab,
                            onFitContent = mainViewModel::fitContentOnActiveTab,
                            onPanCandles = mainViewModel::panActiveTab,
                            onResetLatest = mainViewModel::resetActiveTabPosition,
                            onScaleYAxisByDrag = mainViewModel::scaleYAxisByDrag,
                            onResetAutoScaleY = mainViewModel::resetAutoScaleY,
                            onToggleLogScale = mainViewModel::toggleLogScaleOnActiveTab,
                            onToggleTimezoneMode = mainViewModel::toggleTimezoneMode,
                            onSelectCandle = mainViewModel::selectCandleOnActiveTab,
                            onSelectDrawingTool = mainViewModel::selectDrawingTool,
                            onSelectPitchforkVariant = mainViewModel::setPitchforkVariantOnActiveTab,
                            onToggleMagnetMode = mainViewModel::toggleMagnetModeOnActiveTab,
                            onSelectDrawingColorHex = mainViewModel::setDrawingColorOnActiveTab,
                            onSelectDrawingWidthDp = mainViewModel::setDrawingWidthOnActiveTab,
                            onToggleDrawingDockCollapsed = mainViewModel::toggleDrawingDockOnActiveTab,
                            onPlaceDrawingAt = mainViewModel::placeDrawingAtCoordinate,
                            onSelectDrawing = mainViewModel::selectDrawingOnActiveTab,
                            onTranslateSelectedDrawing = mainViewModel::translateSelectedDrawing,
                            onDeleteSelectedDrawing = mainViewModel::deleteSelectedDrawingOnActiveTab,
                            onClearAllDrawings = mainViewModel::clearAllDrawingsOnActiveTab
                        )

                        WorkspaceScreen.PREDICTION -> ForecastLabScreen(
                            activeTab = state.activeTab,
                            watchlistSymbols = state.watchlistSymbols,
                            preferences = state.chartPreferences,
                            localLedgerEntries = state.forecastLocalLedger,
                            serverLedgerEntries = state.forecastServerLedger,
                            ledgerVerifyResult = state.forecastLedgerVerifyResult,
                            onSelectSymbol = mainViewModel::selectSymbolInPrediction,
                            onSelectTimeframe = mainViewModel::selectTimeframeForActiveTab,
                            onSelectHorizonBars = mainViewModel::setForecastHorizon,
                            onSelectRenderMode = mainViewModel::setForecastRenderMode,
                            onToggleModelPlugin = mainViewModel::toggleForecastModel,
                            onSetModelWeight = mainViewModel::setForecastModelWeight,
                            onSetModelParam = mainViewModel::setForecastModelParam,
                            onResetModelPlugins = mainViewModel::resetForecastModels,
                            onSaveWorkerUrl = mainViewModel::saveForecastWorkerUrl,
                            onRecordSnapshot = mainViewModel::recordAndSyncForecastSnapshot,
                            onRefreshServerLedger = mainViewModel::refreshForecastServerLedger,
                            onPlotReferenceLevelsToChart = mainViewModel::projectScenarioLevelsToChart,
                            onApplyForecastToChart = mainViewModel::applyForecastAndOpenChart,
                            onBackToWatchlist = mainViewModel::navigateBack,
                            higherTimeframeCandlesProvider = mainViewModel::getHigherTimeframeCandlesForActiveTab,
                            lifecycleEvents = state.forecastLifecycleEvents,
                            lifecycleVerifyResult = state.forecastLifecycleVerifyResult,
                            onEvaluateMaturedOutcomes = mainViewModel::evaluateMaturedForecastOutcomes
                        )

                        WorkspaceScreen.SETTINGS -> SettingsScreen(
                            currentLanguage = state.language,
                            isDarkTheme = state.isDarkTheme,
                            symbols = state.symbols,
                            ownerUsername = state.ownerUsername,
                            ownerEmail = state.ownerEmail,
                            statusBannerResId = state.statusBannerResId,
                            chartPreferences = state.chartPreferences,
                            systemStatus = state.systemStatus,
                            isWorkspaceSyncing = state.isWorkspaceSyncing,
                            lastWorkspaceSyncedAt = state.lastWorkspaceSyncedAt,
                            onSyncCloudWorkspace = mainViewModel::syncCloudWorkspace,
                            onLanguageSelected = mainViewModel::setLanguage,
                            onThemeSelected = mainViewModel::setDarkTheme,
                            onToggleSymbolInWatchlist = mainViewModel::toggleSymbolInWatchlist,
                            onSelectProviderForSymbol = mainViewModel::selectProviderForSymbol,
                            onUpdateRecoveryEmail = mainViewModel::updateRecoveryEmail,
                            onUpdatePassword = mainViewModel::changePassword,
                            onSignOut = handleSignOut,
                            onBackToWatchlist = mainViewModel::navigateBack,
                            onUpdateBullColor = mainViewModel::updateBullCandleColor,
                            onUpdateBearColor = mainViewModel::updateBearCandleColor,
                            onUpdateTrendColor = mainViewModel::updateTrendLineColor,
                            onUpdateHLineColor = mainViewModel::updateHorizontalLineColor,
                            onUpdateVLineColor = mainViewModel::updateVerticalLineColor,
                            onResetColors = mainViewModel::resetChartColorsToDefault,
                            onUpdateAlgoParams = mainViewModel::updateAlgorithmParams,
                            onResetAlgoParams = mainViewModel::resetAlgorithmParamsToDefault,
                            onUpdateDefaultDrawingWidth = mainViewModel::updateDefaultDrawingWidth,
                            onUpdateBollingerParams = mainViewModel::updateBollingerParams,
                            onResetAllPreferences = mainViewModel::resetAllPreferencesToDefault,
                            onUpdateTradingViewPreference = mainViewModel::updateTradingViewPreference,
                            onUpdateTimezoneMode = mainViewModel::updateTimezoneMode,
                            onSaveApiKeys = mainViewModel::updatePersonalApiKeys,
                            onAddCustomSymbol = mainViewModel::addCustomSymbol,
                            onDeleteSymbol = mainViewModel::deleteSymbol,
                            activeGapReport = state.activeGapAuditReport ?: state.activeTab?.gapSummary,
                            activeGapSymbolLabel = state.activeTab?.symbolCode ?: state.watchlistSymbols.firstOrNull()?.symbolCode,
                            backupStatusMessage = state.backupStatusMessage,
                            importBatches = state.importBatches,
                            importStatusMessage = state.importStatusMessage,
                            onRunGapAudit = mainViewModel::auditGapReportForActiveTab,
                            onExportBackupToUri = mainViewModel::exportEncryptedBackupToUri,
                            onRestoreBackupFromUri = mainViewModel::restoreEncryptedBackupFromUri,
                            onImportDocumentUri = mainViewModel::importHistoricalDocumentFromUri,
                            onSubmitManualOhlc = mainViewModel::submitManualOhlcEntry,
                            onRefreshImportBatches = mainViewModel::refreshImportBatches
                        )
                    }
                }
            }
        }
    }
}
