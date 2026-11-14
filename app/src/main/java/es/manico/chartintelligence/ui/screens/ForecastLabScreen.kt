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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SecondaryScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartPreferences
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.forecast.ForecastEngine
import es.manico.chartintelligence.forecast.ForecastLedgerEntry
import es.manico.chartintelligence.forecast.ForecastLifecycleEvent
import es.manico.chartintelligence.forecast.ForecastModelRegistry
import es.manico.chartintelligence.forecast.ForecastRenderMode
import es.manico.chartintelligence.forecast.ForecastResult
import es.manico.chartintelligence.forecast.ForecastStatus
import es.manico.chartintelligence.forecast.ForecastV130Analyzer
import es.manico.chartintelligence.forecast.LedgerVerifyResult
import es.manico.chartintelligence.forecast.LifecycleVerifyResult
import es.manico.chartintelligence.forecast.RemoteWorkerStatus
import es.manico.chartintelligence.ui.components.AssetSymbolBadge
import es.manico.chartintelligence.ui.components.ForecastMiniFanCanvas
import es.manico.chartintelligence.ui.components.ForecastModelPluginCard
import es.manico.chartintelligence.ui.components.ForecastScenarioCard
import es.manico.chartintelligence.ui.components.HashLedgerEntryCard
import es.manico.chartintelligence.ui.components.KeyPriceZonesSection
import es.manico.chartintelligence.ui.components.LifecycleEventLogCard
import es.manico.chartintelligence.ui.components.MtfCoordinationCard
import es.manico.chartintelligence.ui.components.NoEdgeAndOodHeaderBadges
import es.manico.chartintelligence.ui.components.NoEdgeWarningBanner
import es.manico.chartintelligence.ui.components.PathEventAndSensitivityCard
import es.manico.chartintelligence.ui.components.UncertaintyBreakdownCard
import es.manico.chartintelligence.ui.components.WalkForwardBenchmarkTable
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import java.math.BigDecimal
import java.util.Locale

private val FORECAST_HORIZON_PRESETS = listOf(10, 15, 20, 30, 45, 60)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ForecastLabScreen(
    activeTab: ChartTabState?,
    watchlistSymbols: List<SymbolConfig>,
    preferences: ChartPreferences,
    localLedgerEntries: List<ForecastLedgerEntry>,
    serverLedgerEntries: List<ForecastLedgerEntry>,
    ledgerVerifyResult: LedgerVerifyResult,
    onSelectSymbol: (SymbolConfig) -> Unit,
    onSelectTimeframe: (String) -> Unit,
    onSelectHorizonBars: (Int) -> Unit,
    onSelectRenderMode: (ForecastRenderMode) -> Unit,
    onToggleModelPlugin: (String, Boolean) -> Unit,
    onSetModelWeight: (String, Double) -> Unit,
    onSetModelParam: (String, String, Double) -> Unit,
    onResetModelPlugins: () -> Unit,
    onSaveWorkerUrl: (String) -> Unit,
    onRecordSnapshot: () -> Unit,
    onRefreshServerLedger: () -> Unit,
    onPlotReferenceLevelsToChart: (BigDecimal, BigDecimal, BigDecimal, BigDecimal, BigDecimal) -> Unit,
    onApplyForecastToChart: () -> Unit,
    onBackToWatchlist: () -> Unit,
    modifier: Modifier = Modifier,
    higherTimeframeCandlesProvider: (String) -> List<CandleBar> = { emptyList() },
    lifecycleEvents: List<ForecastLifecycleEvent> = emptyList(),
    lifecycleVerifyResult: LifecycleVerifyResult = LifecycleVerifyResult(true, 0, -1, "Empty lifecycle log"),
    onEvaluateMaturedOutcomes: () -> Unit = {}
) {
    BackHandler(onBack = onBackToWatchlist)

    val palette = LocalFinancialPalette.current
    var showSymbolSheet by rememberSaveable { mutableStateOf(false) }
    var selectedSubTab by rememberSaveable { mutableIntStateOf(0) }
    var coordMode by rememberSaveable { mutableStateOf("independent") }
    var workerUrlDraft by remember(preferences.forecastWorkerUrl) {
        mutableStateOf(preferences.forecastWorkerUrl)
    }

    val activeRenderMode = remember(activeTab?.forecastRenderMode, preferences.forecastRenderMode) {
        ForecastRenderMode.parse(activeTab?.forecastRenderMode ?: preferences.forecastRenderMode)
    }
    val activeHorizon = remember(activeTab?.forecastHorizonBars, preferences.forecastHorizonBars) {
        val h = activeTab?.forecastHorizonBars ?: preferences.forecastHorizonBars
        if (h in 10..60) h else 30
    }

    val registry = remember(preferences.forecastPluginConfigJson) {
        ForecastModelRegistry().apply { applyFromJson(preferences.forecastPluginConfigJson) }
    }
    val pluginStates = remember(registry, preferences.forecastPluginConfigJson) {
        registry.listStates()
    }

    val candles = activeTab?.candles.orEmpty()
    val decimals = activeTab?.decimals ?: 2
    val higherTf = remember(activeTab?.timeframe) {
        ForecastV130Analyzer.resolveHigherTimeframe(activeTab?.timeframe.orEmpty())
    }
    val higherCandles = remember(higherTf, candles) {
        if (higherTf.isNotBlank()) higherTimeframeCandlesProvider(higherTf) else emptyList()
    }
    val previousRunMap = remember { mutableMapOf<String, ForecastResult>() }

    val forecastResult = remember(
        candles,
        higherCandles,
        activeTab?.symbolCode,
        activeTab?.timeframe,
        activeHorizon,
        activeRenderMode,
        preferences.forecastPluginConfigJson,
        preferences.forecastWorkerUrl
    ) {
        if (activeTab == null) null
        else {
            val runKey = "${activeTab.symbolCode}|${activeTab.timeframe}|$activeHorizon"
            val prev = previousRunMap[runKey]
            val res = ForecastEngine.project(
                candles = candles,
                symbolCode = activeTab.symbolCode,
                timeframe = activeTab.timeframe,
                horizonBars = activeHorizon,
                renderMode = activeRenderMode,
                registry = registry,
                workerUrl = preferences.forecastWorkerUrl,
                skipWalkForward = false,
                higherTimeframe = higherTf,
                higherTimeframeCandles = higherCandles,
                previousForecast = prev
            )
            if (res.status != ForecastStatus.DATA_NOT_READY && res.inputHash != prev?.inputHash) {
                previousRunMap[runKey] = res
            }
            res
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .testTag("forecast_lab_screen"),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .widthIn(max = 760.dp)
        ) {
            // Top Studio Header
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = stringResource(R.string.nav_forecast_lab),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        if (forecastResult != null) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                val statusColor = when (forecastResult.status) {
                                    ForecastStatus.VALID -> palette.bullCandle
                                    ForecastStatus.PROVISIONAL -> Color(0xFFF59E0B)
                                    ForecastStatus.DATA_NOT_READY -> MaterialTheme.colorScheme.onSurfaceVariant
                                }
                                Surface(color = statusColor.copy(alpha = 0.16f), shape = RoundedCornerShape(4.dp)) {
                                    Text(
                                        text = forecastResult.status.name,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                        style = MaterialTheme.typography.labelSmall,
                                        fontSize = 10.sp,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        fontWeight = FontWeight.Bold,
                                        color = statusColor
                                    )
                                }
                                Surface(color = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f), shape = RoundedCornerShape(4.dp)) {
                                    Text(
                                        text = forecastResult.regime.name,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                        style = MaterialTheme.typography.labelSmall,
                                        fontSize = 10.sp,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                            }
                            NoEdgeAndOodHeaderBadges(result = forecastResult)
                        }
                    }

                    if (activeTab != null) {
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(MaterialTheme.colorScheme.background)
                                .border(1.dp, palette.cardBorder, RoundedCornerShape(8.dp))
                                .minimumInteractiveComponentSize()
                                .clickable { showSymbolSheet = true }
                                .padding(horizontal = 10.dp, vertical = 6.dp)
                                .testTag("forecast_symbol_selector"),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            AssetSymbolBadge(symbolCode = activeTab.symbolCode, sizeDp = 18.dp)
                            Text(
                                text = "${activeTab.symbolCode} ▾",
                                style = MaterialTheme.typography.labelLarge,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            // Filter Chips: Timeframe + Horizon + Render Mode
            if (activeTab != null) {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.72f))
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            for (tf in activeTab.allowedTimeframes) {
                                FilterChip(
                                    selected = activeTab.timeframe.equals(tf, ignoreCase = true),
                                    onClick = { onSelectTimeframe(tf) },
                                    label = {
                                        Text(
                                            PriceFormatterAlgorithm.displayTimeframeLabel(tf),
                                            fontFamily = JetBrainsMonoFontFamily,
                                            fontSize = 11.sp
                                        )
                                    },
                                    modifier = Modifier.testTag("forecast_tf_chip_${tf.lowercase()}")
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
                            for (hVal in FORECAST_HORIZON_PRESETS) {
                                FilterChip(
                                    selected = activeHorizon == hVal,
                                    onClick = { onSelectHorizonBars(hVal) },
                                    label = {
                                        Text("+$hVal", fontFamily = JetBrainsMonoFontFamily, fontSize = 11.sp)
                                    },
                                    modifier = Modifier.testTag("forecast_horizon_chip_$hVal")
                                )
                            }
                            for (rm in ForecastRenderMode.entries) {
                                FilterChip(
                                    selected = activeRenderMode == rm,
                                    onClick = { onSelectRenderMode(rm) },
                                    label = {
                                        Text(
                                            when (rm) {
                                                ForecastRenderMode.HYBRID -> "Hybrid"
                                                ForecastRenderMode.FAN_CHART -> "Fan"
                                                ForecastRenderMode.GHOST_CANDLES -> "Ghost"
                                            },
                                            fontSize = 11.sp
                                        )
                                    },
                                    modifier = Modifier.testTag("forecast_mode_chip_${rm.key.lowercase()}")
                                )
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            val isAppliedOnChart = activeTab?.showFutureProjection == true
                            Button(
                                onClick = onApplyForecastToChart,
                                modifier = Modifier
                                    .weight(1f)
                                    .minimumInteractiveComponentSize()
                                    .testTag("forecast_apply_to_chart_btn"),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text(
                                    text = if (isAppliedOnChart) {
                                        "✓ ${stringResource(R.string.forecast_apply_chart_btn)}"
                                    } else {
                                        stringResource(R.string.forecast_apply_chart_btn)
                                    },
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            OutlinedButton(
                                onClick = onRecordSnapshot,
                                modifier = Modifier
                                    .weight(1f)
                                    .minimumInteractiveComponentSize()
                                    .testTag("forecast_record_snapshot_btn"),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text(
                                    text = stringResource(R.string.forecast_record_snapshot_btn),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }

            // 4 Modular Studio Tabs
            val subTabs = listOf(
                stringResource(R.string.forecast_tab_overview),
                stringResource(R.string.forecast_tab_models),
                stringResource(R.string.forecast_tab_backtest),
                stringResource(R.string.forecast_tab_ledger)
            )
            SecondaryScrollableTabRow(
                selectedTabIndex = selectedSubTab,
                containerColor = MaterialTheme.colorScheme.surface,
                edgePadding = 12.dp
            ) {
                subTabs.forEachIndexed { idx, label ->
                    Tab(
                        selected = selectedSubTab == idx,
                        onClick = { selectedSubTab = idx },
                        text = { Text(label, style = MaterialTheme.typography.labelMedium) },
                        modifier = Modifier.testTag("forecast_subtab_$idx")
                    )
                }
            }

            HorizontalDivider(thickness = 1.dp, color = palette.cardBorder)

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (activeTab == null || forecastResult == null) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, palette.cardBorder)
                    ) {
                        Text(
                            text = stringResource(R.string.chart_state_empty),
                            modifier = Modifier.padding(16.dp),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                } else {
                    when (selectedSubTab) {
                        // TAB 0: PROJECTION OVERVIEW & SCENARIOS
                        0 -> {
                            ForecastMiniFanCanvas(
                                candles = candles,
                                result = forecastResult,
                                decimals = decimals,
                                coordMode = coordMode
                            )

                            if (!forecastResult.readiness.ready) {
                                Card(
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(10.dp),
                                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                    border = BorderStroke(1.dp, Color(0xFFF59E0B))
                                ) {
                                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text(
                                            text = "DATA_NOT_READY",
                                            style = MaterialTheme.typography.titleSmall,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFFF59E0B)
                                        )
                                        for (issue in forecastResult.readiness.issues) {
                                            Text(issue, style = MaterialTheme.typography.bodySmall)
                                        }
                                    }
                                }
                            } else {
                                forecastResult.noEdgeGate?.let { gate ->
                                    NoEdgeWarningBanner(noEdgeGate = gate)
                                }

                                forecastResult.featuresSummary?.let { fs ->
                                    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                        Card(
                                            modifier = Modifier.fillMaxWidth(),
                                            shape = RoundedCornerShape(10.dp),
                                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                            border = BorderStroke(1.dp, palette.cardBorder)
                                        ) {
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .padding(12.dp),
                                                horizontalArrangement = Arrangement.SpaceBetween
                                            ) {
                                                TelemetryItem("ATR(14)", "${String.format(Locale.US, "%.2f", fs.atrPct)}%")
                                                TelemetryItem("EWMA σ", "${String.format(Locale.US, "%.2f", fs.ewmaSigmaPct)}%")
                                                TelemetryItem("RSI(14)", String.format(Locale.US, "%.1f", fs.rsi14))
                                                TelemetryItem("VolRatio", String.format(Locale.US, "%.2f", fs.realizedVolRatio))
                                            }
                                        }
                                    }
                                }

                                forecastResult.uncertainty?.let { unc ->
                                    UncertaintyBreakdownCard(
                                        uncertainty = unc,
                                        stability = forecastResult.stability
                                    )
                                }

                                forecastResult.mtfCoordination?.let { mtf ->
                                    MtfCoordinationCard(
                                        mtf = mtf,
                                        coordMode = coordMode,
                                        onSelectCoordMode = { coordMode = it }
                                    )
                                }

                                for (sc in forecastResult.scenarios) {
                                    ForecastScenarioCard(
                                        scenario = sc,
                                        decimals = decimals,
                                        onPlotScenario = {
                                            val sum = forecastResult.summary
                                            if (sum != null) {
                                                onPlotReferenceLevelsToChart(
                                                    BigDecimal.valueOf(forecastResult.anchorClose),
                                                    BigDecimal.valueOf(sum.terminalQ75),
                                                    BigDecimal.valueOf(sum.terminalQ90),
                                                    BigDecimal.valueOf(sum.terminalQ25),
                                                    BigDecimal.valueOf(sum.terminalQ10)
                                                )
                                            }
                                        }
                                    )
                                }

                                KeyPriceZonesSection(
                                    zones = forecastResult.keyZones,
                                    decimals = decimals
                                )
                            }
                        }

                        // TAB 1: PLUGGABLE MODELS + HONEST DL WORKER BRIDGE
                        1 -> {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = stringResource(R.string.forecast_models_header),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold
                                )
                                OutlinedButton(
                                    onClick = onResetModelPlugins,
                                    modifier = Modifier
                                        .minimumInteractiveComponentSize()
                                        .testTag("forecast_reset_models_btn")
                                ) {
                                    Text(stringResource(R.string.forecast_reset_models_btn))
                                }
                            }

                            val contribMap = forecastResult.modelContributions.associateBy { it.modelId }
                            for (plugin in pluginStates) {
                                ForecastModelPluginCard(
                                    plugin = plugin,
                                    contribution = contribMap[plugin.id],
                                    onToggle = { onToggleModelPlugin(plugin.id, it) },
                                    onWeightChange = { onSetModelWeight(plugin.id, it) },
                                    onParamChange = { k, v -> onSetModelParam(plugin.id, k, v) }
                                )
                            }

                            // Optional Remote DL Worker Bridge (Chronos-2 / TimesFM 2.5 / N-HiTS)
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("forecast_remote_worker_card"),
                                shape = RoundedCornerShape(10.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                border = BorderStroke(1.dp, palette.cardBorder)
                            ) {
                                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = stringResource(R.string.forecast_worker_title),
                                            style = MaterialTheme.typography.titleSmall,
                                            fontWeight = FontWeight.Bold
                                        )
                                        Surface(
                                            color = Color(0xFF38BDF8).copy(alpha = 0.14f),
                                            shape = RoundedCornerShape(4.dp)
                                        ) {
                                            Text(
                                                text = if (forecastResult.remoteWorkerStatus == RemoteWorkerStatus.LOCAL_STATISTICAL_ONLY) {
                                                    "LOCAL_STATISTICAL_ONLY"
                                                } else {
                                                    forecastResult.remoteWorkerStatus.name
                                                },
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                                style = MaterialTheme.typography.labelSmall,
                                                fontSize = 10.sp,
                                                fontFamily = JetBrainsMonoFontFamily,
                                                color = Color(0xFF38BDF8)
                                            )
                                        }
                                    }
                                    Text(
                                        text = stringResource(R.string.forecast_worker_desc),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                        OutlinedTextField(
                                            value = workerUrlDraft,
                                            onValueChange = { workerUrlDraft = it },
                                            label = { Text("FORECAST_WORKER_URL (Chronos-2 / TimesFM 2.5 / N-HiTS)") },
                                            singleLine = true,
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .testTag("forecast_worker_url_input")
                                        )
                                    }
                                    OutlinedButton(
                                        onClick = { onSaveWorkerUrl(workerUrlDraft.trim()) },
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .minimumInteractiveComponentSize()
                                            .testTag("forecast_save_worker_btn")
                                    ) {
                                        Text(stringResource(R.string.forecast_save_worker_btn))
                                    }
                                }
                            }
                        }

                        // TAB 2: PURGED WALK-FORWARD BENCHMARK & SENSITIVITY GRID
                        2 -> {
                            WalkForwardBenchmarkTable(report = forecastResult.walkForward)
                            PathEventAndSensitivityCard(
                                walkForward = forecastResult.walkForward,
                                eventDictionary = forecastResult.eventDictionary
                            )
                        }

                        // TAB 3: SHA-256 HASH-CHAIN LEDGER & APPEND-ONLY LIFECYCLE
                        3 -> {
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                border = BorderStroke(1.dp, if (ledgerVerifyResult.valid) palette.bullCandle else palette.bearCandle)
                            ) {
                                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(
                                        text = if (ledgerVerifyResult.valid) {
                                            "SHA-256 Hash Chain Verified (${ledgerVerifyResult.totalEntries})"
                                        } else {
                                            "SHA-256 Tamper Warning: ${ledgerVerifyResult.reason}"
                                        },
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = if (ledgerVerifyResult.valid) palette.bullCandle else palette.bearCandle
                                    )
                                    OutlinedButton(
                                        onClick = onRefreshServerLedger,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .minimumInteractiveComponentSize()
                                            .testTag("forecast_refresh_ledger_btn")
                                    ) {
                                        Text(stringResource(R.string.forecast_refresh_ledger_btn))
                                    }
                                }
                            }

                            LifecycleEventLogCard(
                                events = lifecycleEvents,
                                verifyResult = lifecycleVerifyResult,
                                decimals = decimals,
                                onEvaluateMatured = onEvaluateMaturedOutcomes
                            )

                            val combinedEntries = remember(localLedgerEntries, serverLedgerEntries) {
                                if (serverLedgerEntries.isNotEmpty()) serverLedgerEntries.reversed()
                                else localLedgerEntries.reversed()
                            }
                            if (combinedEntries.isEmpty()) {
                                Text(
                                    text = stringResource(R.string.forecast_ledger_empty),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            } else {
                                for (entry in combinedEntries) {
                                    HashLedgerEntryCard(entry = entry, decimals = decimals)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showSymbolSheet && activeTab != null) {
        ModalBottomSheet(
            onDismissRequest = { showSymbolSheet = false },
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = stringResource(R.string.nav_watchlist),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                for (sym in watchlistSymbols) {
                    val isSelected = sym.symbolCode == activeTab.symbolCode
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .clickable {
                                showSymbolSheet = false
                                onSelectSymbol(sym)
                            }
                            .padding(vertical = 8.dp, horizontal = 6.dp)
                            .testTag("forecast_symbol_option_${sym.symbolCode.lowercase()}"),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = isSelected,
                            onClick = {
                                showSymbolSheet = false
                                onSelectSymbol(sym)
                            }
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        AssetSymbolBadge(symbolCode = sym.symbolCode, sizeDp = 24.dp)
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = sym.symbolCode,
                            style = MaterialTheme.typography.bodyMedium,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }
}

@Composable
private fun TelemetryItem(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            text = value,
            style = MaterialTheme.typography.labelLarge,
            fontFamily = JetBrainsMonoFontFamily,
            fontWeight = FontWeight.Bold
        )
    }
}
