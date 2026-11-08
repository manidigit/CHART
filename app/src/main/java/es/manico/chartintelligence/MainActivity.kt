package es.manico.chartintelligence

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.FormatListBulleted
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.AccountCircle
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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import es.manico.chartintelligence.ui.screens.ChartViewScreen
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
            topBar = {
                if (state.isAuthenticated) {
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        tonalElevation = 0.dp,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .statusBarsPadding()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 44.dp)
                                    .padding(horizontal = 12.dp, vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.weight(1f, fill = false)
                                ) {
                                    Icon(
                                        imageVector = Icons.Outlined.AccountCircle,
                                        contentDescription = state.ownerUsername,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = state.ownerUsername.ifBlank { state.ownerEmail },
                                        style = MaterialTheme.typography.labelLarge,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.testTag("top_bar_user_badge")
                                    )
                                }

                                OutlinedButton(
                                    onClick = handleSignOut,
                                    shape = RoundedCornerShape(8.dp),
                                    border = BorderStroke(1.dp, financialPalette.cardBorder),
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                    modifier = Modifier
                                        .height(32.dp)
                                        .testTag("top_bar_sign_out_button")
                                ) {
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Outlined.Logout,
                                        contentDescription = stringResource(R.string.action_sign_out),
                                        tint = MaterialTheme.colorScheme.error,
                                        modifier = Modifier.size(15.dp)
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(
                                        text = stringResource(R.string.action_logout_short),
                                        color = MaterialTheme.colorScheme.error,
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }
                            HorizontalDivider(
                                thickness = 1.dp,
                                color = financialPalette.cardBorder
                            )
                        }
                    }
                }
            },
            bottomBar = {
                if (state.isAuthenticated) {
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

                            NavigationBarItem(
                                selected = state.currentScreen == WorkspaceScreen.CHART_VIEW,
                                onClick = { mainViewModel.navigateTo(WorkspaceScreen.CHART_VIEW) },
                                colors = navColors,
                                icon = {
                                    BadgedBox(
                                        badge = {
                                            if (state.openTabs.isNotEmpty()) {
                                                Badge(
                                                    containerColor = MaterialTheme.colorScheme.primary,
                                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                                ) {
                                                    Text(state.openTabs.size.toString())
                                                }
                                            }
                                        }
                                    ) {
                                        Icon(
                                            imageVector = Icons.Outlined.CandlestickChart,
                                            contentDescription = stringResource(R.string.nav_chart_view)
                                        )
                                    }
                                },
                                label = {
                                    Text(
                                        text = stringResource(R.string.nav_chart_view),
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                },
                                modifier = Modifier.testTag("nav_chart_view_item")
                            )

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
                        authMode = state.authMode,
                        authErrorResId = state.authErrorResId,
                        authInfoResId = state.authInfoResId,
                        currentLanguage = state.language,
                        isDarkTheme = state.isDarkTheme,
                        onLanguageSelected = mainViewModel::setLanguage,
                        onThemeSelected = mainViewModel::setDarkTheme,
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
                            onSelectDateRange = mainViewModel::selectDateRangeForActiveTab,
                            onSelectChartType = mainViewModel::selectChartTypeForActiveTab,
                            onToggleVolume = mainViewModel::toggleVolumeOnActiveTab,
                            onCycleVolumeHeight = mainViewModel::cycleVolumePaneHeightOnActiveTab,
                            onToggleSma20 = mainViewModel::toggleSma20OnActiveTab,
                            onZoom = mainViewModel::zoomActiveTab,
                            onPinchZoom = mainViewModel::pinchZoomActiveTab,
                            onFitContent = mainViewModel::fitContentOnActiveTab,
                            onPanCandles = mainViewModel::panActiveTab,
                            onResetLatest = mainViewModel::resetActiveTabPosition,
                            onScaleYAxisByDrag = mainViewModel::scaleYAxisByDrag,
                            onResetAutoScaleY = mainViewModel::resetAutoScaleY,
                            onSelectCandle = mainViewModel::selectCandleOnActiveTab,
                            onSelectDrawingTool = mainViewModel::selectDrawingTool,
                            onSelectDrawingColorHex = mainViewModel::setDrawingColorOnActiveTab,
                            onSelectDrawingWidthDp = mainViewModel::setDrawingWidthOnActiveTab,
                            onToggleDrawingDockCollapsed = mainViewModel::toggleDrawingDockOnActiveTab,
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
                            ownerEmail = state.ownerEmail,
                            statusBannerResId = state.statusBannerResId,
                            chartPreferences = state.chartPreferences,
                            onLanguageSelected = mainViewModel::setLanguage,
                            onThemeSelected = mainViewModel::setDarkTheme,
                            onToggleSymbolInWatchlist = mainViewModel::toggleSymbolInWatchlist,
                            onSelectProviderForSymbol = mainViewModel::selectProviderForSymbol,
                            onUpdateRecoveryEmail = mainViewModel::updateRecoveryEmail,
                            onUpdatePassword = mainViewModel::changePassword,
                            onSignOut = handleSignOut,
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
