package com.chartintelligence.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Analytics
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.DocumentScanner
import androidx.compose.material.icons.filled.FactCheck
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.chartintelligence.app.ui.ChartIntelligenceViewModel
import com.chartintelligence.app.ui.screens.DataImportOcrScreen
import com.chartintelligence.app.ui.screens.ForecastTerminalScreen
import com.chartintelligence.app.ui.screens.MasterSpecGovernanceScreen
import com.chartintelligence.app.ui.screens.ProviderPocLabScreen
import com.chartintelligence.app.ui.screens.WalkForwardValidationScreen
import com.chartintelligence.app.ui.theme.BullishEmerald
import com.chartintelligence.app.ui.theme.ChartIntelligenceTheme
import com.chartintelligence.app.ui.theme.DeepSlateSurface
import com.chartintelligence.app.ui.theme.ElevatedCardSurface
import com.chartintelligence.app.ui.theme.ForecastCyan
import com.chartintelligence.app.ui.theme.ObsidianNavy
import com.chartintelligence.app.ui.theme.SubtleBorderSlate
import com.chartintelligence.app.ui.theme.TextPrimary
import com.chartintelligence.app.ui.theme.TextSecondary

enum class AppTab(
    val route: String,
    val titleRes: Int,
    val icon: ImageVector
) {
    FORECAST("forecast", R.string.nav_chart_forecast, Icons.Default.Analytics),
    VALIDATION("validation", R.string.nav_walk_forward, Icons.Default.FactCheck),
    PROVIDER_POC("provider_poc", R.string.nav_provider_poc, Icons.Default.CloudSync),
    IMPORT_OCR("import_ocr", R.string.nav_data_import, Icons.Default.DocumentScanner),
    SPEC_GOVERNANCE("spec_governance", R.string.nav_architecture, Icons.Default.Gavel)
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ChartIntelligenceTheme {
                ChartIntelligenceApp()
            }
        }
    }
}

@Composable
fun ChartIntelligenceApp(
    viewModel: ChartIntelligenceViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var currentTab by rememberSaveable { mutableStateOf(AppTab.FORECAST) }

    if (currentTab != AppTab.FORECAST) {
        BackHandler {
            currentTab = AppTab.FORECAST
        }
    }

    Scaffold(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianNavy)
            .windowInsetsPadding(WindowInsets.safeDrawing),
        containerColor = ObsidianNavy,
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DeepSlateSurface)
                    .padding(horizontal = 16.dp, vertical = 10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = stringResource(R.string.app_name),
                            style = MaterialTheme.typography.titleLarge,
                            color = TextPrimary
                        )
                        Text(
                            text = stringResource(R.string.app_subtitle),
                            style = MaterialTheme.typography.labelSmall,
                            color = TextSecondary
                        )
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(ElevatedCardSurface)
                            .border(1.dp, BullishEmerald.copy(alpha = 0.6f), RoundedCornerShape(8.dp))
                            .padding(horizontal = 9.dp, vertical = 5.dp)
                    ) {
                        Text(
                            text = "${uiState.selectedInstrument.tradingViewSymbol} · ${uiState.selectedTimeframe.id}",
                            style = MaterialTheme.typography.labelMedium,
                            color = BullishEmerald,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                AnimatedVisibility(visible = uiState.statusBannerMessage != null) {
                    val msg = uiState.statusBannerMessage.orEmpty()
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(ElevatedCardSurface)
                            .border(1.dp, ForecastCyan.copy(alpha = 0.6f), RoundedCornerShape(8.dp))
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = msg,
                            style = MaterialTheme.typography.bodySmall,
                            color = TextPrimary,
                            modifier = Modifier.weight(1f)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Dismiss notification",
                            tint = TextSecondary,
                            modifier = Modifier
                                .size(16.dp)
                                .clickable { viewModel.dismissBanner() }
                        )
                    }
                }
            }
        },
        bottomBar = {
            NavigationBar(
                containerColor = DeepSlateSurface,
                tonalElevation = 8.dp
            ) {
                AppTab.entries.forEach { tab ->
                    val selected = currentTab == tab
                    NavigationBarItem(
                        selected = selected,
                        onClick = { currentTab = tab },
                        icon = {
                            Icon(
                                imageVector = tab.icon,
                                contentDescription = stringResource(tab.titleRes)
                            )
                        },
                        label = {
                            Text(
                                text = stringResource(tab.titleRes),
                                style = MaterialTheme.typography.labelSmall
                            )
                        },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = BullishEmerald,
                            selectedTextColor = BullishEmerald,
                            indicatorColor = BullishEmerald.copy(alpha = 0.16f),
                            unselectedIconColor = TextSecondary,
                            unselectedTextColor = TextSecondary
                        ),
                        modifier = Modifier.testTag("nav_tab_${tab.route}")
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
            when (currentTab) {
                AppTab.FORECAST -> ForecastTerminalScreen(
                    uiState = uiState,
                    onSelectInstrument = viewModel::selectInstrument,
                    onLoadCustomSymbol = viewModel::loadCustomOrExistingSymbol,
                    onSelectTimeframe = viewModel::selectTimeframe,
                    onSelectHorizon = viewModel::selectHorizon,
                    onUpdateNeutralParams = viewModel::updateNeutralParameters,
                    onLockImmutableForecast = viewModel::lockImmutableForecast
                )

                AppTab.VALIDATION -> WalkForwardValidationScreen(
                    uiState = uiState,
                    onSelectEvaluationMode = viewModel::selectEvaluationMode
                )

                AppTab.PROVIDER_POC -> ProviderPocLabScreen(
                    uiState = uiState,
                    onRunTwelveDataPoc = viewModel::runTwelveDataPoc,
                    onRunDukascopyAudit = viewModel::runDukascopyAudit,
                    onFetchLiveBinance = viewModel::fetchLiveBinanceBtcUsdt
                )

                AppTab.IMPORT_OCR -> DataImportOcrScreen(
                    uiState = uiState,
                    onSelectInstrument = viewModel::selectInstrument,
                    onProcessEphemeralChartImage = viewModel::processEphemeralChartScreenshot,
                    onCommitCandle = viewModel::commitManualOrOcrCandle
                )

                AppTab.SPEC_GOVERNANCE -> MasterSpecGovernanceScreen()
            }
        }
    }
}
