package es.manico.chartintelligence

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CandlestickChart
import androidx.compose.material.icons.outlined.FormatListBulleted
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import es.manico.chartintelligence.ui.screens.ChartViewScreen
import es.manico.chartintelligence.ui.screens.LoginScreen
import es.manico.chartintelligence.ui.screens.SettingsScreen
import es.manico.chartintelligence.ui.screens.WatchlistScreen
import es.manico.chartintelligence.ui.state.MainViewModel
import es.manico.chartintelligence.ui.state.WorkspaceScreen
import es.manico.chartintelligence.ui.theme.ChartIntelligenceTheme

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

    ChartIntelligenceTheme(
        darkTheme = state.isDarkTheme,
        language = state.language
    ) {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            contentWindowInsets = WindowInsets.safeDrawing,
            bottomBar = {
                if (state.isAuthenticated) {
                    NavigationBar {
                        NavigationBarItem(
                            selected = state.currentScreen == WorkspaceScreen.WATCHLIST,
                            onClick = { mainViewModel.navigateTo(WorkspaceScreen.WATCHLIST) },
                            icon = {
                                BadgedBox(
                                    badge = {
                                        if (state.watchlistSymbols.isNotEmpty()) {
                                            Badge { Text(state.watchlistSymbols.size.toString()) }
                                        }
                                    }
                                ) {
                                    Icon(
                                        imageVector = Icons.Outlined.FormatListBulleted,
                                        contentDescription = stringResource(R.string.nav_watchlist)
                                    )
                                }
                            },
                            label = { Text(stringResource(R.string.nav_watchlist)) },
                            modifier = Modifier.testTag("nav_watchlist_item")
                        )

                        NavigationBarItem(
                            selected = state.currentScreen == WorkspaceScreen.CHART_VIEW,
                            onClick = { mainViewModel.navigateTo(WorkspaceScreen.CHART_VIEW) },
                            icon = {
                                BadgedBox(
                                    badge = {
                                        if (state.openTabs.isNotEmpty()) {
                                            Badge { Text(state.openTabs.size.toString()) }
                                        }
                                    }
                                ) {
                                    Icon(
                                        imageVector = Icons.Outlined.CandlestickChart,
                                        contentDescription = stringResource(R.string.nav_chart_view)
                                    )
                                }
                            },
                            label = { Text(stringResource(R.string.nav_chart_view)) },
                            modifier = Modifier.testTag("nav_chart_view_item")
                        )

                        NavigationBarItem(
                            selected = state.currentScreen == WorkspaceScreen.SETTINGS,
                            onClick = { mainViewModel.navigateTo(WorkspaceScreen.SETTINGS) },
                            icon = {
                                Icon(
                                    imageVector = Icons.Outlined.Settings,
                                    contentDescription = stringResource(R.string.nav_settings)
                                )
                            },
                            label = { Text(stringResource(R.string.nav_settings)) },
                            modifier = Modifier.testTag("nav_settings_item")
                        )
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
                        authErrorResId = state.authErrorResId,
                        currentLanguage = state.language,
                        isDarkTheme = state.isDarkTheme,
                        onLanguageSelected = mainViewModel::setLanguage,
                        onThemeSelected = mainViewModel::setDarkTheme,
                        onRegisterFirstOwner = mainViewModel::registerFirstTimeOwner,
                        onSignInOwner = mainViewModel::signInOwner
                    )
                } else {
                    when (state.currentScreen) {
                        WorkspaceScreen.WATCHLIST -> WatchlistScreen(
                            watchlistSymbols = state.watchlistSymbols,
                            isSyncingAll = state.isSyncingAll,
                            statusBannerResId = state.statusBannerResId,
                            onSyncSymbolNow = mainViewModel::syncSingleSymbolUpToNow,
                            onSyncAllNow = mainViewModel::syncAllWatchlistUpToNow,
                            onOpenSymbolInChartTab = mainViewModel::openSymbolInChartTab,
                            onNavigateToSettings = { mainViewModel.navigateTo(WorkspaceScreen.SETTINGS) }
                        )

                        WorkspaceScreen.CHART_VIEW -> ChartViewScreen(
                            openTabs = state.openTabs,
                            activeTab = state.activeTab,
                            preferences = state.chartPreferences,
                            onSelectTab = mainViewModel::selectChartTab,
                            onCloseTab = mainViewModel::closeChartTab,
                            onSyncActiveSymbolNow = mainViewModel::syncSingleSymbolUpToNow,
                            onBackToWatchlist = { mainViewModel.navigateTo(WorkspaceScreen.WATCHLIST) },
                            onSelectTimeframe = mainViewModel::selectTimeframeForActiveTab,
                            onSelectChartType = mainViewModel::selectChartTypeForActiveTab,
                            onZoom = mainViewModel::zoomActiveTab,
                            onPinchZoom = mainViewModel::pinchZoomActiveTab,
                            onFitContent = mainViewModel::fitContentOnActiveTab,
                            onPanCandles = mainViewModel::panActiveTab,
                            onResetLatest = mainViewModel::resetActiveTabPosition,
                            onScaleYAxisByDrag = mainViewModel::scaleYAxisByDrag,
                            onResetAutoScaleY = mainViewModel::resetAutoScaleY,
                            onSelectCandle = mainViewModel::selectCandleOnActiveTab,
                            onSelectDrawingTool = mainViewModel::selectDrawingTool,
                            onPlaceDrawingAt = mainViewModel::placeDrawingAtCoordinate,
                            onSelectDrawing = mainViewModel::selectDrawingOnActiveTab,
                            onTranslateSelectedDrawing = mainViewModel::translateSelectedDrawing,
                            onDeleteSelectedDrawing = mainViewModel::deleteSelectedDrawingOnActiveTab,
                            onClearAllDrawings = mainViewModel::clearAllDrawingsOnActiveTab
                        )

                        WorkspaceScreen.SETTINGS -> SettingsScreen(
                            currentLanguage = state.language,
                            isDarkTheme = state.isDarkTheme,
                            symbols = state.symbols,
                            ownerUsername = state.ownerUsername,
                            statusBannerResId = state.statusBannerResId,
                            chartPreferences = state.chartPreferences,
                            onLanguageSelected = mainViewModel::setLanguage,
                            onThemeSelected = mainViewModel::setDarkTheme,
                            onToggleSymbolInWatchlist = mainViewModel::toggleSymbolInWatchlist,
                            onSelectProviderForSymbol = mainViewModel::selectProviderForSymbol,
                            onUpdatePassword = mainViewModel::changePassword,
                            onSignOut = mainViewModel::signOut,
                            onBackToWatchlist = { mainViewModel.navigateTo(WorkspaceScreen.WATCHLIST) },
                            onUpdateBullColor = mainViewModel::updateBullCandleColor,
                            onUpdateBearColor = mainViewModel::updateBearCandleColor,
                            onUpdateTrendColor = mainViewModel::updateTrendLineColor,
                            onUpdateHLineColor = mainViewModel::updateHorizontalLineColor,
                            onUpdateVLineColor = mainViewModel::updateVerticalLineColor,
                            onResetColors = mainViewModel::resetChartColorsToDefault,
                            onUpdateAlgoParams = mainViewModel::updateAlgorithmParams,
                            onResetAlgoParams = mainViewModel::resetAlgorithmParamsToDefault,
                            onAddCustomSymbol = mainViewModel::addCustomSymbol,
                            onDeleteSymbol = mainViewModel::deleteSymbol
                        )
                    }
                }
            }
        }
    }
}
