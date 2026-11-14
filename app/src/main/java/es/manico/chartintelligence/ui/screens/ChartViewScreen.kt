package es.manico.chartintelligence.ui.screens

import android.content.Intent
import android.graphics.Bitmap
import android.widget.Toast
import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AdsClick
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.CandlestickChart
import androidx.compose.material.icons.outlined.CenterFocusStrong
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.FitScreen
import androidx.compose.material.icons.outlined.Functions
import androidx.compose.material.icons.outlined.HorizontalRule
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.ShowChart
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material.icons.outlined.Timeline
import androidx.compose.material.icons.outlined.UnfoldMore
import androidx.compose.material.icons.outlined.VerticalAlignCenter
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.ConnectionStatus
import es.manico.chartintelligence.algorithms.MarketStatus
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm
import es.manico.chartintelligence.data.model.ChartPreferences
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.ChartType
import es.manico.chartintelligence.data.model.DrawingTool
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.ui.components.AssetSymbolBadge
import es.manico.chartintelligence.ui.components.CandlestickCanvas
import es.manico.chartintelligence.ui.components.DrawingToolbar
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.math.BigDecimal
import kotlin.math.roundToInt

private enum class ChartControlSheet {
    NONE,
    SYMBOL_PICKER,
    TIMEFRAME_PICKER,
    INDICATORS,
    MORE_OPTIONS
}

/**
 * Mandatory Chart Screen Structure (Top to Bottom, Zero Outer Scroll):
 * [1] Safe Area / Status Bar Inset (via parent Scaffold)
 * [2] Compact Header (48.dp):
 *     - Left: Rich Asset Icon Badge + Symbol Name + Live Price + Signed Change & %
 *     - Right: Non-clickable Data Source Label (e.g. Twelve Data / TradingView) + Market Status dot
 * [3] Main Chart Canvas (Modifier.weight(1f) — >= 85% usable viewport height):
 *     - Candles + Active Indicators (SMA 20, EMA 50, Bollinger Bands 20,2) + Volume Sub-pane + Dotted Crosshair (#758696)
 *     - Floating Top-Left OHLC + Indicator Legend
 *     - Right Price Axis & Bottom UTC Time Axis
 * [4] Bottom Chart Control Bar (46.dp, directly above App Navigation Bar, Left to Right):
 *     1. Current Symbol (e.g. XAUUSD) -> Opens Watchlist symbol switcher sheet
 *     2. Current Timeframe (e.g. 15m) -> Opens Timeframe picker sheet (15m, 1H, 4H, 1D, 1W)
 *     3. Drawing Tool Button (Pencil Icon) -> Opens Drawing BottomSheet
 *     4. Indicator Button (fx Icon) -> Opens Indicators BottomSheet (SMA 20, EMA 50, Bollinger Bands, Volume)
 *     5. More Button (Three Dots) -> Opens Chart Style (Candles/Line), Historical Date Range, Scale & Sync
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChartViewScreen(
    openTabs: List<ChartTabState>,
    activeTab: ChartTabState?,
    watchlistSymbols: List<SymbolConfig> = emptyList(),
    preferences: ChartPreferences = ChartPreferences(),
    onSelectTab: (String) -> Unit,
    onCloseTab: (String) -> Unit,
    onOpenSymbolFromWatchlist: (SymbolConfig) -> Unit = {},
    onSyncActiveSymbolNow: (String) -> Unit,
    onBackToWatchlist: () -> Unit,
    onSelectTimeframe: (String) -> Unit,
    onSelectDateRange: (String) -> Unit = {},
    onSelectChartType: (ChartType) -> Unit,
    onToggleVolume: () -> Unit = {},
    onCycleVolumeHeight: () -> Unit = {},
    onToggleSma20: () -> Unit = {},
    onToggleSma50: () -> Unit = {},
    onToggleSma200: () -> Unit = {},
    onToggleEma20: () -> Unit = {},
    onToggleEma50: () -> Unit = {},
    onToggleBollinger: () -> Unit = {},
    onToggleSupertrend: () -> Unit = {},
    onToggleVwap: () -> Unit = {},
    onToggleRsi14: () -> Unit = {},
    onToggleMacd: () -> Unit = {},
    onToggleOverlayMacd: () -> Unit = {},
    onToggleAtr14: () -> Unit = {},
    onToggleSmcStructure: () -> Unit = {},
    onToggleFvg: () -> Unit = {},
    onToggleVolumeProfile: () -> Unit = {},
    onTogglePivotPoints: () -> Unit = {},
    onSelectPivotType: (String) -> Unit = {},
    onToggleFutureProjection: () -> Unit = {},
    onToggleEma200: () -> Unit = {},
    onTogglePsar: () -> Unit = {},
    onToggleIchimoku: () -> Unit = {},
    onToggleKeltner: () -> Unit = {},
    onToggleDonchian: () -> Unit = {},
    onToggleMtfEma: () -> Unit = {},
    onToggleKillzones: () -> Unit = {},
    onToggleAdx14: () -> Unit = {},
    onToggleStoch14: () -> Unit = {},
    onToggleCci20: () -> Unit = {},
    onToggleWillR14: () -> Unit = {},
    onToggleObv: () -> Unit = {},
    onToggleCmf20: () -> Unit = {},
    onToggleRoc12: () -> Unit = {},
    onUpdateBollingerParams: (Int, Float) -> Unit = { _, _ -> },
    onUpdateIndicatorFamilyColor: (String, String) -> Unit = { _, _ -> },
    onZoom: (Boolean) -> Unit,
    onPinchZoom: (Float) -> Unit,
    onPanCandles: (Int) -> Unit,
    onFitContent: () -> Unit,
    onResetLatest: () -> Unit,
    onScaleYAxisByDrag: (Float) -> Unit,
    onResetAutoScaleY: () -> Unit,
    onToggleLogScale: () -> Unit = {},
    onToggleTimezoneMode: () -> Unit = {},
    onSelectCandle: (Int?) -> Unit,
    onSelectDrawingTool: (DrawingTool) -> Unit,
    onSelectPitchforkVariant: (String) -> Unit = {},
    onToggleMagnetMode: () -> Unit = {},
    onSelectDrawingColorHex: (String) -> Unit = {},
    onSelectDrawingWidthDp: (Float) -> Unit = {},
    onToggleDrawingDockCollapsed: () -> Unit = {},
    onPlaceDrawingAt: (Long, BigDecimal) -> Unit,
    onSelectDrawing: (String?) -> Unit,
    onTranslateSelectedDrawing: (Long, BigDecimal) -> Unit,
    onDeleteSelectedDrawing: () -> Unit,
    onClearAllDrawings: () -> Unit,
    modifier: Modifier = Modifier
) {
    BackHandler(onBack = onBackToWatchlist)
    val palette = LocalFinancialPalette.current
    val haptic = LocalHapticFeedback.current
    val clipboardManager = LocalClipboardManager.current
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val chartGraphicsLayer = rememberGraphicsLayer()
    val snapshotShareTitle = stringResource(R.string.chart_snapshot_share_title)
    val snapshotErrorMsg = stringResource(R.string.chart_snapshot_error)
    var activeSheet by rememberSaveable { mutableStateOf(ChartControlSheet.NONE) }
    val indicatorsScrollState = rememberScrollState()
    val symbolPickerScrollState = rememberScrollState()
    var liveClockMillis by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            liveClockMillis = System.currentTimeMillis()
            delay(1000L)
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        if (openTabs.isEmpty() || activeTab == null) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = Icons.Outlined.CandlestickChart,
                    contentDescription = stringResource(R.string.chart_view_no_tabs_title),
                    modifier = Modifier.size(48.dp),
                    tint = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = stringResource(R.string.chart_view_no_tabs_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = onBackToWatchlist,
                    modifier = Modifier.testTag("empty_chart_to_watchlist_button")
                ) {
                    Text(text = stringResource(R.string.chart_open_from_watchlist))
                }
            }
        } else {
            val latestCandle = activeTab.candles.lastOrNull()
            val prevCandle = if (activeTab.candles.size >= 2) {
                activeTab.candles[activeTab.candles.size - 2]
            } else {
                latestCandle
            }
            val refOpen = prevCandle?.close ?: latestCandle?.open ?: BigDecimal.ZERO
            val latestClose = latestCandle?.close
            val isUp = latestClose == null || latestClose >= refOpen
            val priceColor = if (isUp) preferences.bullCandleColor else preferences.bearCandleColor
            val dateRangePresets = remember(activeTab.candles, activeTab.timeframe) {
                activeTab.computeDateRangePresets()
            }

            val marketStatus = remember(
                activeTab.symbolCode,
                activeTab.timeframe,
                latestCandle?.openTimeUtcMillis,
                activeTab.hasError
            ) {
                UtcTimeAnchorAlgorithm.determineMarketStatus(
                    symbolCode = activeTab.symbolCode,
                    timeframe = activeTab.timeframe,
                    lastCandleOpenUtcMillis = latestCandle?.openTimeUtcMillis,
                    hasError = activeTab.hasError
                )
            }

            val statusDotColor = when {
                activeTab.isLoading || activeTab.connectionStatus == ConnectionStatus.SYNCING ->
                    MaterialTheme.colorScheme.primary
                activeTab.connectionStatus == ConnectionStatus.SYNC_ERROR ->
                    preferences.bearCandleColor
                activeTab.connectionStatus == ConnectionStatus.CACHED_OFFLINE ->
                    Color(0xFFF59E0B)
                activeTab.connectionStatus == ConnectionStatus.MARKET_CLOSED ||
                    marketStatus == MarketStatus.MARKET_CLOSED ->
                    Color(0xFFF59E0B)
                marketStatus == MarketStatus.LIVE -> preferences.bullCandleColor
                marketStatus == MarketStatus.DELAYED -> Color(0xFFF59E0B)
                marketStatus == MarketStatus.CACHED -> MaterialTheme.colorScheme.onSurfaceVariant
                else -> preferences.bearCandleColor
            }

            // [2] Compact Header (48.dp): Left = Back Button + Asset Icon Badge + Symbol + Price | Right = Snapshot + Honest Status Pill
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(start = 4.dp, end = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Left: Back Button + Rich Asset Icon Badge + Symbol Name + Live Price & Signed Change
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        IconButton(
                            onClick = onBackToWatchlist,
                            modifier = Modifier
                                .size(48.dp)
                                .testTag("chart_back_button")
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                                contentDescription = stringResource(R.string.action_back),
                                tint = MaterialTheme.colorScheme.onSurface
                            )
                        }

                        AssetSymbolBadge(
                            symbolCode = activeTab.symbolCode,
                            sizeDp = 28.dp
                        )

                        Column(modifier = Modifier.weight(1f)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = activeTab.symbolCode,
                                    style = MaterialTheme.typography.titleSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                if (latestClose != null) {
                                    Text(
                                        text = PriceFormatterAlgorithm.formatPrice(latestClose, activeTab.decimals),
                                        style = MaterialTheme.typography.titleSmall,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        fontWeight = FontWeight.Bold,
                                        color = priceColor
                                    )
                                }
                            }
                            if (latestClose != null) {
                                val diffStr = PriceFormatterAlgorithm.formatSignedPriceDiff(refOpen, latestClose, activeTab.decimals)
                                val pctStr = PriceFormatterAlgorithm.formatSignedPercentChange(refOpen, latestClose)
                                Text(
                                    text = "$diffStr ($pctStr)",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Medium,
                                    color = priceColor,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        // TradingView-style Real Chart PNG Snapshot & Share Button
                        IconButton(
                            onClick = {
                                coroutineScope.launch {
                                    runCatching {
                                        val imageBitmap = chartGraphicsLayer.toImageBitmap()
                                        val androidBitmap = imageBitmap.asAndroidBitmap()
                                        val shareUri = withContext(Dispatchers.IO) {
                                            val dir = File(context.cacheDir, "snapshots").apply { mkdirs() }
                                            dir.listFiles()
                                                ?.sortedByDescending { it.lastModified() }
                                                ?.drop(10)
                                                ?.forEach { it.delete() }
                                            val file = File(
                                                dir,
                                                "chart_${activeTab.symbolCode}_${activeTab.timeframe}_${System.currentTimeMillis()}.png"
                                            )
                                            FileOutputStream(file).use { out ->
                                                androidBitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                                            }
                                            FileProvider.getUriForFile(
                                                context,
                                                "${context.packageName}.fileprovider",
                                                file
                                            )
                                        }
                                        val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                            type = "image/png"
                                            putExtra(Intent.EXTRA_STREAM, shareUri)
                                            putExtra(
                                                Intent.EXTRA_SUBJECT,
                                                "${activeTab.symbolCode} ${activeTab.timeframe} Chart"
                                            )
                                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                        }
                                        context.startActivity(Intent.createChooser(shareIntent, snapshotShareTitle))
                                    }.onFailure {
                                        Toast.makeText(context, snapshotErrorMsg, Toast.LENGTH_SHORT).show()
                                    }
                                }
                            },
                            modifier = Modifier
                                .size(48.dp)
                                .testTag("chart_snapshot_button")
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.PhotoCamera,
                                contentDescription = stringResource(R.string.action_take_snapshot),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(18.dp)
                            )
                        }

                        // Compact Market Status Indicator + Clickable UTC/Local Clock
                        val statusLabel = when {
                            activeTab.isLoading || activeTab.connectionStatus == ConnectionStatus.SYNCING ->
                                stringResource(R.string.chart_status_syncing)
                            activeTab.connectionStatus == ConnectionStatus.SYNC_ERROR ->
                                stringResource(R.string.chart_status_sync_error)
                            activeTab.connectionStatus == ConnectionStatus.CACHED_OFFLINE ->
                                stringResource(R.string.chart_status_offline_cached)
                            activeTab.connectionStatus == ConnectionStatus.MARKET_CLOSED ||
                                marketStatus == MarketStatus.MARKET_CLOSED ->
                                stringResource(R.string.chart_status_market_closed)
                            marketStatus == MarketStatus.LIVE -> stringResource(R.string.chart_status_live)
                            marketStatus == MarketStatus.DELAYED -> stringResource(R.string.chart_status_delayed)
                            marketStatus == MarketStatus.CACHED -> stringResource(R.string.chart_status_cached)
                            else -> stringResource(R.string.chart_status_error)
                        }
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(MaterialTheme.colorScheme.background)
                                .border(1.dp, palette.cardBorder, RoundedCornerShape(4.dp))
                                .clickable(onClick = onToggleTimezoneMode)
                                .padding(horizontal = 7.dp, vertical = 4.dp)
                                .testTag("chart_market_status_pill")
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .clip(CircleShape)
                                    .background(statusDotColor)
                            )
                            Text(
                                text = PriceFormatterAlgorithm.formatLiveClock(preferences.timezoneMode, liveClockMillis),
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = statusLabel,
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 9.5.sp,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1
                            )
                        }
                    }
                }
            }

            HorizontalDivider(thickness = 1.dp, color = palette.cardBorder)

            // Multi-Tab Chart Strip (Package 1: 1-click tab switching between open charts)
            if (openTabs.isNotEmpty()) {
                es.manico.chartintelligence.ui.components.ChartTabBar(
                    tabs = openTabs,
                    activeTabId = activeTab.tabId,
                    onSelectTab = onSelectTab,
                    onCloseTab = onCloseTab,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(horizontal = 8.dp, vertical = 2.dp)
                        .testTag("chart_tabs_strip")
                )
                HorizontalDivider(thickness = 1.dp, color = palette.cardBorder)
            }

            // Honest Offline / Sync Error Banner when showing cached candles or degraded connectivity
            if (!activeTab.syncErrorText.isNullOrBlank() &&
                (activeTab.connectionStatus == ConnectionStatus.SYNC_ERROR ||
                    activeTab.connectionStatus == ConnectionStatus.CACHED_OFFLINE)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFF59E0B).copy(alpha = 0.14f))
                        .padding(horizontal = 12.dp, vertical = 4.dp)
                        .testTag("chart_sync_error_banner"),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = activeTab.syncErrorText,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (activeTab.connectionStatus == ConnectionStatus.SYNC_ERROR) {
                            preferences.bearCandleColor
                        } else {
                            Color(0xFFF59E0B)
                        },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = stringResource(R.string.chart_action_retry),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .clickable { onSyncActiveSymbolNow(activeTab.symbolCode) }
                            .padding(start = 8.dp, top = 2.dp, bottom = 2.dp)
                    )
                }
                HorizontalDivider(thickness = 1.dp, color = palette.cardBorder)
            }

            // [3] Main Full-Viewport Chart Canvas (>= 85% usable height) recorded into GraphicsLayer for real PNG Snapshot
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .drawWithContent {
                        chartGraphicsLayer.record {
                            this@drawWithContent.drawContent()
                        }
                        drawLayer(chartGraphicsLayer)
                    }
            ) {
                CandlestickCanvas(
                    tab = activeTab,
                    preferences = preferences,
                    onPinchZoom = onPinchZoom,
                    onPanCandles = onPanCandles,
                    onScaleYAxisByDrag = onScaleYAxisByDrag,
                    onResetAutoScaleY = onResetAutoScaleY,
                    onToggleLogScale = onToggleLogScale,
                    onResetToLatest = onResetLatest,
                    onSelectCandle = onSelectCandle,
                    onPlaceDrawingAt = onPlaceDrawingAt,
                    onSelectDrawing = onSelectDrawing,
                    onTranslateSelectedDrawing = onTranslateSelectedDrawing,
                    onRetrySync = { onSyncActiveSymbolNow(activeTab.symbolCode) },
                    modifier = Modifier.fillMaxSize()
                )

                // Floating Quick Drawing Bar only when a drawing tool or line is actively selected on canvas
                if (activeTab.activeDrawingTool != DrawingTool.CURSOR || activeTab.selectedDrawingId != null || !activeTab.isDrawingDockCollapsed) {
                    val selectedMulti = activeTab.drawings
                        .firstOrNull { it.id == activeTab.selectedDrawingId } as? es.manico.chartintelligence.data.model.ChartDrawing.MultiAnchor
                    val isPitchforkSelected = selectedMulti?.toolType == DrawingTool.PITCHFORK
                    DrawingToolbar(
                        activeTool = activeTab.activeDrawingTool,
                        hasSelectedDrawing = activeTab.selectedDrawingId != null,
                        totalDrawingsCount = activeTab.drawings.size,
                        pendingTrendPoint = activeTab.pendingTrendPoint,
                        pendingAnchorsCount = activeTab.pendingAnchors.size,
                        requiredAnchorsCount = activeTab.activeDrawingTool.requiredAnchors,
                        pitchforkVariant = selectedMulti?.variant ?: activeTab.pitchforkVariant,
                        isPitchforkSelected = isPitchforkSelected,
                        activeDrawingColorHex = activeTab.activeDrawingColorHex,
                        activeDrawingWidthDp = activeTab.activeDrawingWidthDp,
                        isCollapsed = activeTab.isDrawingDockCollapsed,
                        isMagnetMode = activeTab.isMagnetMode,
                        onSelectTool = onSelectDrawingTool,
                        onSelectPitchforkVariant = onSelectPitchforkVariant,
                        onToggleMagnetMode = onToggleMagnetMode,
                        onSelectColorHex = onSelectDrawingColorHex,
                        onSelectWidthDp = onSelectDrawingWidthDp,
                        onToggleCollapsed = onToggleDrawingDockCollapsed,
                        onDeleteSelected = onDeleteSelectedDrawing,
                        onClearAll = onClearAllDrawings,
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(start = 8.dp, bottom = 32.dp)
                    )
                }
            }

            HorizontalDivider(thickness = 1.dp, color = palette.cardBorder)

            // [4] Bottom Chart Control Bar (46.dp, directly above App Navigation Bar, Left to Right):
            //     1. Symbol | 2. Timeframe | 3. Draw (Pencil) | 4. Indicator (fx) | 5. More (...)
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(46.dp)
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(horizontal = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // 1. Current Symbol -> Opens Watchlist Symbol Switcher
                    Row(
                        modifier = Modifier
                            .height(34.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(MaterialTheme.colorScheme.background)
                            .border(1.dp, palette.cardBorder, RoundedCornerShape(6.dp))
                            .clickable { activeSheet = ChartControlSheet.SYMBOL_PICKER }
                            .padding(horizontal = 10.dp)
                            .testTag("chart_bottom_symbol_button"),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        AssetSymbolBadge(
                            symbolCode = activeTab.symbolCode,
                            sizeDp = 18.dp
                        )
                        Text(
                            text = "${activeTab.symbolCode} ▾",
                            style = MaterialTheme.typography.labelLarge,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    // 2. Current Timeframe -> Opens Timeframe Selector
                    Box(
                        modifier = Modifier
                            .height(34.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.16f))
                            .border(1.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(6.dp))
                            .clickable { activeSheet = ChartControlSheet.TIMEFRAME_PICKER }
                            .padding(horizontal = 12.dp)
                            .testTag("chart_bottom_timeframe_button"),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = PriceFormatterAlgorithm.displayTimeframeLabel(activeTab.timeframe),
                            style = MaterialTheme.typography.labelLarge,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }

                    // 3. Drawing Tool Button (Pencil Icon) -> Opens Drawing BottomSheet
                    val isDrawActive = activeTab.activeDrawingTool != DrawingTool.CURSOR || !activeTab.isDrawingDockCollapsed
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(
                                if (isDrawActive) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
                                else MaterialTheme.colorScheme.background
                            )
                            .border(
                                1.dp,
                                if (isDrawActive) MaterialTheme.colorScheme.primary else palette.cardBorder,
                                RoundedCornerShape(6.dp)
                            )
                            .clickable(onClick = onToggleDrawingDockCollapsed)
                            .testTag("draw_dock_collapse_button"),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Edit,
                            contentDescription = stringResource(R.string.draw_tools_toggle),
                            tint = if (isDrawActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    // 4. Indicator Button (fx) -> Opens Unified Phase 2 Indicators, Oscillators & SMC BottomSheet
                    val hasOverlayIndicator = activeTab.showSma20 || activeTab.showSma50 || activeTab.showSma200 ||
                        activeTab.showEma20 || activeTab.showEma50 || activeTab.showEma200 || activeTab.showBollinger ||
                        activeTab.showSupertrend || activeTab.showVwap || activeTab.showPsar ||
                        activeTab.showIchimoku || activeTab.showKeltner || activeTab.showDonchian ||
                        activeTab.showMtfEma || activeTab.showKillzones ||
                        activeTab.showRsi14 || activeTab.showMacd || activeTab.showOverlayMacd ||
                        activeTab.showAtr14 || activeTab.showAdx14 || activeTab.showStoch14 ||
                        activeTab.showCci20 || activeTab.showWillR14 || activeTab.showObv ||
                        activeTab.showCmf20 || activeTab.showRoc12 ||
                        activeTab.showSmcStructure || activeTab.showFvg || activeTab.showVolumeProfile ||
                        activeTab.showPivotPoints || activeTab.showFutureProjection
                    val hasActiveIndicator = hasOverlayIndicator || activeTab.showVolume
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(
                                if (hasOverlayIndicator) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
                                else MaterialTheme.colorScheme.background
                            )
                            .border(
                                1.dp,
                                if (hasOverlayIndicator) MaterialTheme.colorScheme.primary else palette.cardBorder,
                                RoundedCornerShape(6.dp)
                            )
                            .clickable { activeSheet = ChartControlSheet.INDICATORS }
                            .testTag("chart_bottom_indicators_button"),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Functions,
                            contentDescription = stringResource(R.string.chart_control_indicators),
                            tint = if (hasActiveIndicator) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    // 5. More Button (Three Dots) -> Opens Chart Type, Date Range, Auto Scale, Sync
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(MaterialTheme.colorScheme.background)
                            .border(1.dp, palette.cardBorder, RoundedCornerShape(6.dp))
                            .clickable { activeSheet = ChartControlSheet.MORE_OPTIONS }
                            .testTag("chart_bottom_more_button"),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.MoreHoriz,
                            contentDescription = stringResource(R.string.chart_control_more),
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }

            // BottomSheets for Bottom Control Bar Actions
            if (activeSheet != ChartControlSheet.NONE) {
                val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
                ModalBottomSheet(
                    onDismissRequest = { activeSheet = ChartControlSheet.NONE },
                    sheetState = sheetState,
                    containerColor = MaterialTheme.colorScheme.surface,
                    contentColor = MaterialTheme.colorScheme.onSurface
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .navigationBarsPadding()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        when (activeSheet) {
                            ChartControlSheet.SYMBOL_PICKER -> {
                                Text(
                                    text = stringResource(R.string.chart_select_symbol_title),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                val symbolsList = if (watchlistSymbols.isNotEmpty()) watchlistSymbols else emptyList()
                                for (sym in symbolsList) {
                                    val isCurrent = sym.symbolCode == activeTab.symbolCode
                                    val displayName = sym.customTitle
                                        ?: sym.titleResId?.let { stringResource(it) }
                                        ?: sym.symbolCode
                                    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(
                                                    if (isCurrent) MaterialTheme.colorScheme.primary.copy(alpha = 0.16f)
                                                    else MaterialTheme.colorScheme.background
                                                )
                                                .border(
                                                    1.dp,
                                                    if (isCurrent) MaterialTheme.colorScheme.primary else palette.cardBorder,
                                                    RoundedCornerShape(8.dp)
                                                )
                                                .clickable {
                                                    if (preferences.pickerVibrations) {
                                                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                                    }
                                                    activeSheet = ChartControlSheet.NONE
                                                    onOpenSymbolFromWatchlist(sym)
                                                }
                                                .padding(horizontal = 12.dp, vertical = 10.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                                            ) {
                                                AssetSymbolBadge(
                                                    symbolCode = sym.symbolCode,
                                                    sizeDp = 30.dp
                                                )
                                                Column {
                                                    Text(
                                                        text = sym.symbolCode,
                                                        style = MaterialTheme.typography.titleSmall,
                                                        fontFamily = JetBrainsMonoFontFamily,
                                                        fontWeight = FontWeight.Bold,
                                                        color = if (isCurrent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                                                    )
                                                    Text(
                                                        text = displayName,
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                                    )
                                                }
                                            }
                                            Text(
                                                text = PriceFormatterAlgorithm.formatPrice(sym.lastClose, sym.decimals),
                                                style = MaterialTheme.typography.titleSmall,
                                                fontFamily = JetBrainsMonoFontFamily,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                    }
                                }
                            }

                            ChartControlSheet.TIMEFRAME_PICKER -> {
                                Text(
                                    text = stringResource(R.string.chart_select_timeframe_title),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                val allDisplayTfs = listOf(
                                    "M1" to "1m",
                                    "M5" to "5m",
                                    "M15" to "15m",
                                    "M30" to "30m",
                                    "H1" to "1H",
                                    "H4" to "4H",
                                    "D1" to "1D",
                                    "W1" to "1W"
                                )
                                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        for ((tfCode, tfLabel) in allDisplayTfs) {
                                            val enabled = tfCode in activeTab.allowedTimeframes
                                            val isSelected = activeTab.timeframe.equals(tfCode, ignoreCase = true)
                                            Box(
                                                modifier = Modifier
                                                    .height(40.dp)
                                                    .clip(RoundedCornerShape(8.dp))
                                                    .background(
                                                        when {
                                                            isSelected -> MaterialTheme.colorScheme.primary.copy(alpha = 0.22f)
                                                            enabled -> MaterialTheme.colorScheme.background
                                                            else -> MaterialTheme.colorScheme.background.copy(alpha = 0.4f)
                                                        }
                                                    )
                                                    .border(
                                                        1.dp,
                                                        if (isSelected) MaterialTheme.colorScheme.primary else palette.cardBorder,
                                                        RoundedCornerShape(8.dp)
                                                    )
                                                    .clickable(enabled = enabled) {
                                                        if (preferences.pickerVibrations) {
                                                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                                        }
                                                        activeSheet = ChartControlSheet.NONE
                                                        onSelectTimeframe(tfCode)
                                                    }
                                                    .padding(horizontal = 14.dp)
                                                    .testTag("chart_tf_${tfCode.lowercase()}_button"),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Text(
                                                    text = tfLabel,
                                                    style = MaterialTheme.typography.labelLarge,
                                                    fontFamily = JetBrainsMonoFontFamily,
                                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                                    color = when {
                                                        isSelected -> MaterialTheme.colorScheme.primary
                                                        enabled -> MaterialTheme.colorScheme.onSurface
                                                        else -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.38f)
                                                    }
                                                )
                                            }
                                        }
                                    }
                                }
                            }

                            ChartControlSheet.INDICATORS -> {
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .verticalScroll(indicatorsScrollState),
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Text(
                                        text = stringResource(R.string.chart_control_indicators),
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )

                                    data class StudyRowSpec(
                                        val title: String,
                                        val subtitle: String,
                                        val color: Color,
                                        val checked: Boolean,
                                        val onToggle: () -> Unit,
                                        val testTag: String,
                                        val badge: String = "──"
                                    )

                                    data class IndicatorFamilySection(
                                        val key: String,
                                        val titleFa: String,
                                        val titleEn: String,
                                        val activeHex: String,
                                        val activeColor: Color,
                                        val paletteOpts: List<String>,
                                        val specs: List<StudyRowSpec>
                                    )

                                    val bbPeriod = preferences.bollingerPeriod.coerceIn(5, 200)
                                    val bbStdDev = preferences.bollingerStdDev.coerceIn(0.5f, 5.0f)

                                    val familySections = listOf(
                                        IndicatorFamilySection(
                                            key = "ma",
                                            titleFa = "۱. خانواده میانگین‌های متحرک",
                                            titleEn = "Moving Averages Spectrum",
                                            activeHex = preferences.indMaFamilyColorHex,
                                            activeColor = preferences.ema50Color,
                                            paletteOpts = listOf("#2962FF", "#0EA5E9", "#06B6D4", "#6366F1", "#10B981", "#F59E0B", "#EC4899", "#F43F5E"),
                                            specs = listOf(
                                                StudyRowSpec("EMA 20", "Exponential Moving Average (20) — خط پیوسته روشن", preferences.ema20Color, activeTab.showEma20, onToggleEma20, "chart_ema20_toggle_button", "──"),
                                                StudyRowSpec("EMA 50", "Exponential Moving Average (50) — خط پیوسته اصلی", preferences.ema50Color, activeTab.showEma50, onToggleEma50, "chart_ema50_toggle_button", "━━"),
                                                StudyRowSpec("EMA 200", "Institutional EMA Baseline (200) — خط ضخیم تیره", preferences.ema200Color, activeTab.showEma200, onToggleEma200, "chart_ema200_toggle_button", "━━"),
                                                StudyRowSpec("SMA 20", "Simple Moving Average (20) — خط‌چین روشن", preferences.sma20Color, activeTab.showSma20, onToggleSma20, "chart_sma20_toggle_button", "╌╌"),
                                                StudyRowSpec("SMA 50", "Simple Moving Average (50) — خط‌چین میانی", preferences.sma50Color, activeTab.showSma50, onToggleSma50, "chart_sma50_toggle_button", "╌╌"),
                                                StudyRowSpec("SMA 200", "Institutional Trend Baseline (200) — خط‌چین ضخیم", preferences.sma200Color, activeTab.showSma200, onToggleSma200, "chart_sma200_toggle_button", "━╌"),
                                                StudyRowSpec("MTF EMA (20)", "Higher-TF Closed Bar Step (Non-Lookahead)", preferences.mtfEmaColor, activeTab.showMtfEma, onToggleMtfEma, "chart_mtf_ema_toggle_button", "⎍⎍")
                                            )
                                        ),
                                        IndicatorFamilySection(
                                            key = "bands",
                                            titleFa = "۲. کانال‌ها و باندهای نوسان",
                                            titleEn = "Volatility Channels Spectrum",
                                            activeHex = preferences.indBandsFamilyColorHex,
                                            activeColor = preferences.bollingerColor,
                                            paletteOpts = listOf("#A855F7", "#8B5CF6", "#D946EF", "#6366F1", "#3B82F6", "#14B8A6", "#F59E0B", "#EC4899"),
                                            specs = listOf(
                                                StudyRowSpec("Bollinger Bands ($bbPeriod, $bbStdDev)", "Volatility Channel ±${bbStdDev}σ", preferences.bollingerColor, activeTab.showBollinger, onToggleBollinger, "chart_bollinger_toggle_button", "≈≈"),
                                                StudyRowSpec("Keltner Channels (20,10,2)", "EMA 20 ± 2.0× Wilder ATR 10 Channel", preferences.keltnerColor, activeTab.showKeltner, onToggleKeltner, "chart_keltner_toggle_button", "≈≈"),
                                                StudyRowSpec("Donchian Channels (20)", "20-Bar High/Low Breakout Channel", preferences.donchianColor, activeTab.showDonchian, onToggleDonchian, "chart_donchian_toggle_button", "╌╌")
                                            )
                                        ),
                                        IndicatorFamilySection(
                                            key = "levels",
                                            titleFa = "۳. سطوح کلیدی، پیوت و پروفایل حجم",
                                            titleEn = "Levels, Pivots & VRVP Spectrum",
                                            activeHex = preferences.indLevelsFamilyColorHex,
                                            activeColor = preferences.vwapColor,
                                            paletteOpts = listOf("#F59E0B", "#EAB308", "#F97316", "#FB923C", "#10B981", "#06B6D4", "#38BDF8", "#A855F7"),
                                            specs = listOf(
                                                StudyRowSpec("Session VWAP", "Volume Weighted Average Price", preferences.vwapColor, activeTab.showVwap, onToggleVwap, "chart_vwap_toggle_button", "╌╌"),
                                                StudyRowSpec("Pivot Points (Standard / Fib / Camarilla / Woodie)", "Multi-variant P, R1..R4, S1..S4 با برچسب ضدتداخل", preferences.pivotPColor, activeTab.showPivotPoints, onTogglePivotPoints, "chart_pivot_points_toggle_button", "P/R/S"),
                                                StudyRowSpec("Session Volume Profile (VRVP)", "POC, VAH & VAL (70% Value Area)", preferences.vrvpPocColor, activeTab.showVolumeProfile, onToggleVolumeProfile, "chart_vp_toggle_button", "▋POC")
                                            )
                                        ),
                                        IndicatorFamilySection(
                                            key = "trend",
                                            titleFa = "۴. سیستم‌های روند، ایچیموکو و پیش‌بینی",
                                            titleEn = "Trend Systems & Cloud Spectrum",
                                            activeHex = preferences.indTrendFamilyColorHex,
                                            activeColor = preferences.ichimokuColor,
                                            paletteOpts = listOf("#14B8A6", "#10B981", "#22C55E", "#06B6D4", "#3B82F6", "#8B5CF6", "#F97316", "#F43F5E"),
                                            specs = listOf(
                                                StudyRowSpec("Supertrend (10, 3)", "ATR Dynamic Trend Ribbon", preferences.supertrendColor, activeTab.showSupertrend, onToggleSupertrend, "chart_supertrend_toggle_button", "▲▼"),
                                                StudyRowSpec("Parabolic SAR (0.02, 0.20)", "Trailing Acceleration Stop & Reverse Dots", preferences.psarColor, activeTab.showPsar, onTogglePsar, "chart_psar_toggle_button", "•••"),
                                                StudyRowSpec("Ichimoku Cloud (9,26,52)", "Tenkan, Kijun, Kumo Cloud & Chikou", preferences.ichimokuColor, activeTab.showIchimoku, onToggleIchimoku, "chart_ichimoku_toggle_button", "☁"),
                                                StudyRowSpec("MACD Classic (Overlay)", "مکدی کلاسیک مستقیماً روی چارت اصلی", preferences.overlayMacdColor, activeTab.showOverlayMacd, onToggleOverlayMacd, "chart_overlay_macd_toggle_button", "ılı"),
                                                StudyRowSpec("Future Candlesticks (30 Bars)", "AI-Generated 30-Period Future Projection (h≥10)", Color(0xFFA796D4), activeTab.showFutureProjection, onToggleFutureProjection, "chart_future_projection_toggle_button", "🔮")
                                            )
                                        ),
                                        IndicatorFamilySection(
                                            key = "smc",
                                            titleFa = "۵. ساختار بازار هوشمند و کیل‌زون‌ها",
                                            titleEn = "SMC & Session Killzones Spectrum",
                                            activeHex = preferences.indSmcFamilyColorHex,
                                            activeColor = preferences.smcStructureColor,
                                            paletteOpts = listOf("#EC4899", "#F43F5E", "#D946EF", "#A855F7", "#14B8A6", "#38BDF8", "#F59E0B", "#22C55E"),
                                            specs = listOf(
                                                StudyRowSpec("BOS / CHoCH & EQH / EQL", "Break of Structure, Change of Character & Equal Highs/Lows", preferences.smcStructureColor, activeTab.showSmcStructure, onToggleSmcStructure, "chart_smc_toggle_button", "BOS"),
                                                StudyRowSpec("FVG / Imbalance Zones", "3-Candle Bullish & Bearish Fair Value Gaps", preferences.fvgColor, activeTab.showFvg, onToggleFvg, "chart_fvg_toggle_button", "▭"),
                                                StudyRowSpec("Session Killzones (UTC)", "Asia / London / NY & Overlap Highlights", preferences.killzonesColor, activeTab.showKillzones, onToggleKillzones, "chart_killzones_toggle_button", "🕒")
                                            )
                                        )
                                    )

                                    for (section in familySections) {
                                        Column(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(10.dp))
                                                .background(MaterialTheme.colorScheme.background.copy(alpha = 0.55f))
                                                .border(1.dp, section.activeColor.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
                                                .padding(10.dp),
                                            verticalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text(
                                                    text = section.titleFa,
                                                    style = MaterialTheme.typography.labelMedium,
                                                    color = section.activeColor,
                                                    fontWeight = FontWeight.Bold
                                                )
                                                Text(
                                                    text = section.titleEn,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    fontFamily = JetBrainsMonoFontFamily,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            }

                                            // Inline Family Color Spectrum Picker
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .horizontalScroll(rememberScrollState()),
                                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text(
                                                    text = "طیف رنگ دسته:",
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                                for (hexOpt in section.paletteOpts) {
                                                    val isSel = section.activeHex.equals(hexOpt, ignoreCase = true)
                                                    val swatchColor = try {
                                                        Color(android.graphics.Color.parseColor(hexOpt))
                                                    } catch (_: Exception) {
                                                        section.activeColor
                                                    }
                                                    Box(
                                                        modifier = Modifier
                                                            .size(if (isSel) 24.dp else 20.dp)
                                                            .clip(CircleShape)
                                                            .background(swatchColor)
                                                            .border(
                                                                width = if (isSel) 2.dp else 1.dp,
                                                                color = if (isSel) Color.White else palette.cardBorder,
                                                                shape = CircleShape
                                                            )
                                                            .clickable { onUpdateIndicatorFamilyColor(section.key, hexOpt) }
                                                            .testTag("ind_family_${section.key}_color_${hexOpt.removePrefix("#").lowercase()}")
                                                    )
                                                }
                                            }

                                            for (spec in section.specs) {
                                                Row(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .heightIn(min = 48.dp)
                                                        .clickable(onClick = spec.onToggle)
                                                        .padding(vertical = 2.dp)
                                                        .testTag(spec.testTag),
                                                    horizontalArrangement = Arrangement.SpaceBetween,
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Row(
                                                        modifier = Modifier.weight(1f),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                                    ) {
                                                        Row(
                                                            modifier = Modifier
                                                                .clip(RoundedCornerShape(5.dp))
                                                                .background(MaterialTheme.colorScheme.surface)
                                                                .border(1.5.dp, spec.color, RoundedCornerShape(5.dp))
                                                                .padding(horizontal = 6.dp, vertical = 3.dp),
                                                            verticalAlignment = Alignment.CenterVertically,
                                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                                        ) {
                                                            Box(
                                                                modifier = Modifier
                                                                    .size(7.dp)
                                                                    .clip(CircleShape)
                                                                    .background(spec.color)
                                                            )
                                                            Text(
                                                                text = spec.badge,
                                                                style = MaterialTheme.typography.labelSmall,
                                                                fontSize = 10.sp,
                                                                fontFamily = JetBrainsMonoFontFamily,
                                                                fontWeight = FontWeight.ExtraBold,
                                                                color = MaterialTheme.colorScheme.onSurface
                                                            )
                                                        }
                                                        Column {
                                                            Text(
                                                                text = spec.title,
                                                                style = MaterialTheme.typography.bodyMedium,
                                                                fontFamily = JetBrainsMonoFontFamily,
                                                                fontWeight = FontWeight.Bold,
                                                                color = MaterialTheme.colorScheme.onSurface
                                                            )
                                                            Text(
                                                                text = spec.subtitle,
                                                                style = MaterialTheme.typography.labelSmall,
                                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                                            )
                                                        }
                                                    }
                                                    Switch(
                                                        checked = spec.checked,
                                                        onCheckedChange = { spec.onToggle() }
                                                    )
                                                }
                                            }

                                            if (section.key == "levels") {
                                                val currentPivotType = activeTab.pivotType.uppercase()
                                                Row(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .horizontalScroll(rememberScrollState()),
                                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Text(
                                                        text = "Pivot Method:",
                                                        style = MaterialTheme.typography.labelSmall,
                                                        fontFamily = JetBrainsMonoFontFamily,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                                    )
                                                    for ((varKey, varLabel) in listOf(
                                                        "STANDARD" to "Standard",
                                                        "FIBONACCI" to "Fibonacci",
                                                        "CAMARILLA" to "Camarilla",
                                                        "WOODIE" to "Woodie"
                                                    )) {
                                                        val isSelected = currentPivotType == varKey
                                                        Box(
                                                            modifier = Modifier
                                                                .heightIn(min = 48.dp)
                                                                .clip(RoundedCornerShape(8.dp))
                                                                .background(
                                                                    if (isSelected) preferences.pivotPColor.copy(alpha = 0.22f)
                                                                    else MaterialTheme.colorScheme.surface
                                                                )
                                                                .border(
                                                                    1.dp,
                                                                    if (isSelected) preferences.pivotPColor else palette.cardBorder,
                                                                    RoundedCornerShape(8.dp)
                                                                )
                                                                .clickable { onSelectPivotType(varKey) }
                                                                .padding(horizontal = 10.dp, vertical = 6.dp)
                                                                .testTag("pivot_variant_chip_$varKey"),
                                                            contentAlignment = Alignment.Center
                                                        ) {
                                                            Text(
                                                                text = varLabel,
                                                                style = MaterialTheme.typography.labelSmall,
                                                                fontFamily = JetBrainsMonoFontFamily,
                                                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                                                color = MaterialTheme.colorScheme.onSurface
                                                            )
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // Bollinger Bands Inline Parameter Customizer (Period & StdDev)
                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(MaterialTheme.colorScheme.background)
                                            .border(1.dp, palette.cardBorder, RoundedCornerShape(8.dp))
                                            .padding(10.dp),
                                        verticalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Text(
                                            text = "تنظیمات باندهای بولینگر (Bollinger Period & StdDev):",
                                            style = MaterialTheme.typography.labelSmall,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.onSurface
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
                                                Box(
                                                    modifier = Modifier
                                                        .clip(RoundedCornerShape(6.dp))
                                                        .background(if (sel) preferences.bollingerColor.copy(alpha = 0.22f) else MaterialTheme.colorScheme.surface)
                                                        .border(1.dp, if (sel) preferences.bollingerColor else palette.cardBorder, RoundedCornerShape(6.dp))
                                                        .clickable { onUpdateBollingerParams(pOpt, bbStdDev) }
                                                        .padding(horizontal = 8.dp, vertical = 4.dp)
                                                        .testTag("bb_period_chip_$pOpt")
                                                ) {
                                                    Text(
                                                        text = pOpt.toString(),
                                                        style = MaterialTheme.typography.labelSmall,
                                                        fontFamily = JetBrainsMonoFontFamily,
                                                        fontWeight = if (sel) FontWeight.Bold else FontWeight.Medium,
                                                        color = MaterialTheme.colorScheme.onSurface
                                                    )
                                                }
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
                                                Box(
                                                    modifier = Modifier
                                                        .clip(RoundedCornerShape(6.dp))
                                                        .background(if (sel) preferences.bollingerColor.copy(alpha = 0.22f) else MaterialTheme.colorScheme.surface)
                                                        .border(1.dp, if (sel) preferences.bollingerColor else palette.cardBorder, RoundedCornerShape(6.dp))
                                                        .clickable { onUpdateBollingerParams(bbPeriod, sdOpt) }
                                                        .padding(horizontal = 8.dp, vertical = 4.dp)
                                                        .testTag("bb_stddev_chip_${(sdOpt * 10).toInt()}")
                                                ) {
                                                    Text(
                                                        text = "${sdOpt}σ",
                                                        style = MaterialTheme.typography.labelSmall,
                                                        fontFamily = JetBrainsMonoFontFamily,
                                                        fontWeight = if (sel) FontWeight.Bold else FontWeight.Medium,
                                                        color = MaterialTheme.colorScheme.onSurface
                                                    )
                                                }
                                            }
                                        }
                                    }

                                    HorizontalDivider(thickness = 1.dp, color = palette.cardBorder)

                                    // Section 3: Synchronized Multi-Pane Sub-Panels (Package 2)
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = "پنل‌های پایینی همگام",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = MaterialTheme.colorScheme.primary,
                                            fontWeight = FontWeight.Bold
                                        )
                                        Text(
                                            text = "Multi-Pane Oscillators",
                                            style = MaterialTheme.typography.labelSmall,
                                            fontFamily = JetBrainsMonoFontFamily,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }

                                    // Volume Histogram + Height Selector (16% / 22% / 30%)
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable(onClick = onToggleVolume)
                                            .padding(vertical = 2.dp)
                                            .testTag("chart_volume_toggle_button"),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Outlined.BarChart,
                                                contentDescription = "Volume",
                                                tint = MaterialTheme.colorScheme.primary
                                            )
                                            Text(
                                                text = "${stringResource(R.string.chart_volume_panel)} (${(activeTab.volumePaneRatio * 100f).roundToInt()}%)",
                                                style = MaterialTheme.typography.bodyMedium,
                                                fontWeight = FontWeight.SemiBold
                                            )
                                        }
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            if (activeTab.showVolume) {
                                                Box(
                                                    modifier = Modifier
                                                        .clip(RoundedCornerShape(6.dp))
                                                        .background(MaterialTheme.colorScheme.background)
                                                        .border(1.dp, palette.cardBorder, RoundedCornerShape(6.dp))
                                                        .clickable(onClick = onCycleVolumeHeight)
                                                        .padding(horizontal = 8.dp, vertical = 4.dp)
                                                        .testTag("chart_volume_resize_button")
                                                ) {
                                                    Text(
                                                        text = "${(activeTab.volumePaneRatio * 100f).roundToInt()}%",
                                                        style = MaterialTheme.typography.labelSmall,
                                                        fontFamily = JetBrainsMonoFontFamily
                                                    )
                                                }
                                            }
                                            Switch(
                                                checked = activeTab.showVolume,
                                                onCheckedChange = { onToggleVolume() }
                                            )
                                        }
                                    }

                                    val oscSpecs = listOf(
                                        StudyRowSpec("RSI 14", "Relative Strength Index (30 / 70 Levels)", Color(0xFFEC4899), activeTab.showRsi14, onToggleRsi14, "chart_rsi14_toggle_button", "RSI"),
                                        StudyRowSpec("MACD (12, 26, 9)", "Momentum Histogram + MACD / Signal", Color(0xFF3B82F6), activeTab.showMacd, onToggleMacd, "chart_macd_toggle_button", "MACD"),
                                        StudyRowSpec("ATR 14", "Wilder's Average True Range Volatility", Color(0xFFF97316), activeTab.showAtr14, onToggleAtr14, "chart_atr14_toggle_button", "ATR"),
                                        StudyRowSpec("ADX / DMI (14)", "Trend Strength & Directional Index (Ref 25)", Color(0xFFF59E0B), activeTab.showAdx14, onToggleAdx14, "chart_adx14_toggle_button", "ADX"),
                                        StudyRowSpec("Stochastic (14, 3, 3)", "Slow %K / %D Oscillator (20 / 80)", Color(0xFF06B6D4), activeTab.showStoch14, onToggleStoch14, "chart_stoch14_toggle_button", "%K%D"),
                                        StudyRowSpec("CCI (20)", "Commodity Channel Index (±100 Bands)", Color(0xFF10B981), activeTab.showCci20, onToggleCci20, "chart_cci20_toggle_button", "CCI"),
                                        StudyRowSpec("Williams %R (14)", "Momentum Oscillator (-20 / -80)", Color(0xFFEC4899), activeTab.showWillR14, onToggleWillR14, "chart_willr14_toggle_button", "%R"),
                                        StudyRowSpec("OBV", "On-Balance Volume Cumulative Flow", Color(0xFF3B82F6), activeTab.showObv, onToggleObv, "chart_obv_toggle_button", "OBV"),
                                        StudyRowSpec("CMF (20)", "Chaikin Money Flow (-1 to +1)", Color(0xFF22C55E), activeTab.showCmf20, onToggleCmf20, "chart_cmf20_toggle_button", "CMF"),
                                        StudyRowSpec("ROC (12)", "Price Rate of Change (%)", Color(0xFFEAB308), activeTab.showRoc12, onToggleRoc12, "chart_roc12_toggle_button", "ROC")
                                    )

                                    for (spec in oscSpecs) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .heightIn(min = 48.dp)
                                                .clickable(onClick = spec.onToggle)
                                                .padding(vertical = 2.dp)
                                                .testTag(spec.testTag),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Row(
                                                modifier = Modifier.weight(1f),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                                            ) {
                                                Row(
                                                    modifier = Modifier
                                                        .clip(RoundedCornerShape(5.dp))
                                                        .background(MaterialTheme.colorScheme.surface)
                                                        .border(1.5.dp, spec.color, RoundedCornerShape(5.dp))
                                                        .padding(horizontal = 6.dp, vertical = 3.dp),
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                                ) {
                                                    Box(
                                                        modifier = Modifier
                                                            .size(7.dp)
                                                            .clip(CircleShape)
                                                            .background(spec.color)
                                                    )
                                                    Text(
                                                        text = spec.badge,
                                                        style = MaterialTheme.typography.labelSmall,
                                                        fontSize = 10.sp,
                                                        fontFamily = JetBrainsMonoFontFamily,
                                                        fontWeight = FontWeight.ExtraBold,
                                                        color = MaterialTheme.colorScheme.onSurface
                                                    )
                                                }
                                                Column {
                                                    Text(
                                                        text = spec.title,
                                                        style = MaterialTheme.typography.bodyMedium,
                                                        fontFamily = JetBrainsMonoFontFamily,
                                                        fontWeight = FontWeight.Bold,
                                                        color = MaterialTheme.colorScheme.onSurface
                                                    )
                                                    Text(
                                                        text = spec.subtitle,
                                                        style = MaterialTheme.typography.labelSmall,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                                    )
                                                }
                                            }
                                            Switch(
                                                checked = spec.checked,
                                                onCheckedChange = { spec.onToggle() }
                                            )
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(36.dp))
                                }
                            }

                            ChartControlSheet.MORE_OPTIONS -> {
                                Text(
                                    text = stringResource(R.string.chart_control_more),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                // Chart Type: Candles vs Line
                                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(40.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(
                                                    if (activeTab.chartType == ChartType.CANDLESTICK) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                                                    else MaterialTheme.colorScheme.background
                                                )
                                                .border(
                                                    1.dp,
                                                    if (activeTab.chartType == ChartType.CANDLESTICK) MaterialTheme.colorScheme.primary else palette.cardBorder,
                                                    RoundedCornerShape(8.dp)
                                                )
                                                .clickable {
                                                    onSelectChartType(ChartType.CANDLESTICK)
                                                    activeSheet = ChartControlSheet.NONE
                                                }
                                                .testTag("chart_type_candlestick_button"),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                Icon(Icons.Outlined.CandlestickChart, contentDescription = null, modifier = Modifier.size(16.dp))
                                                Text(stringResource(R.string.chart_type_candles), style = MaterialTheme.typography.labelLarge)
                                            }
                                        }

                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(40.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(
                                                    if (activeTab.chartType == ChartType.LINE) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                                                    else MaterialTheme.colorScheme.background
                                                )
                                                .border(
                                                    1.dp,
                                                    if (activeTab.chartType == ChartType.LINE) MaterialTheme.colorScheme.primary else palette.cardBorder,
                                                    RoundedCornerShape(8.dp)
                                                )
                                                .clickable {
                                                    onSelectChartType(ChartType.LINE)
                                                    activeSheet = ChartControlSheet.NONE
                                                }
                                                .testTag("chart_type_line_button"),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                Icon(Icons.Outlined.ShowChart, contentDescription = null, modifier = Modifier.size(16.dp))
                                                Text(stringResource(R.string.chart_type_line), style = MaterialTheme.typography.labelLarge)
                                            }
                                        }
                                    }

                                    // Historical Date Ranges
                                    if (dateRangePresets.isNotEmpty()) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .horizontalScroll(rememberScrollState()),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            for (preset in dateRangePresets) {
                                                val isSel = activeTab.activeDateRange == preset.id
                                                Box(
                                                    modifier = Modifier
                                                        .height(34.dp)
                                                        .clip(RoundedCornerShape(6.dp))
                                                        .background(
                                                            if (isSel) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                                                            else MaterialTheme.colorScheme.background
                                                        )
                                                        .border(
                                                            1.dp,
                                                            if (isSel) MaterialTheme.colorScheme.primary else palette.cardBorder,
                                                            RoundedCornerShape(6.dp)
                                                        )
                                                        .clickable(enabled = preset.enabled) {
                                                            onSelectDateRange(preset.id)
                                                            activeSheet = ChartControlSheet.NONE
                                                        }
                                                        .padding(horizontal = 10.dp)
                                                        .testTag("chart_range_${preset.id.lowercase()}_button"),
                                                    contentAlignment = Alignment.Center
                                                ) {
                                                    Text(
                                                        text = preset.label,
                                                        style = MaterialTheme.typography.labelSmall,
                                                        fontFamily = JetBrainsMonoFontFamily,
                                                        fontWeight = FontWeight.Bold,
                                                        color = if (preset.enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                                                    )
                                                }
                                            }
                                        }
                                    }

                                    // Row 1: Scale & Clock Mode (48.dp Material 3 Ergonomic Targets)
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .heightIn(min = 48.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(
                                                    if (activeTab.isAutoScaleY) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                                                    else MaterialTheme.colorScheme.background
                                                )
                                                .border(
                                                    1.dp,
                                                    if (activeTab.isAutoScaleY) MaterialTheme.colorScheme.primary else palette.cardBorder,
                                                    RoundedCornerShape(8.dp)
                                                )
                                                .clickable {
                                                    onResetAutoScaleY()
                                                    activeSheet = ChartControlSheet.NONE
                                                }
                                                .padding(horizontal = 6.dp)
                                                .testTag("chart_auto_scale_button"),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                                Icon(Icons.Outlined.UnfoldMore, contentDescription = null, modifier = Modifier.size(16.dp))
                                                Text(stringResource(R.string.chart_auto_scale), style = MaterialTheme.typography.labelMedium, maxLines = 1)
                                            }
                                        }

                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .heightIn(min = 48.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(
                                                    if (activeTab.isLogScale) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                                                    else MaterialTheme.colorScheme.background
                                                )
                                                .border(
                                                    1.dp,
                                                    if (activeTab.isLogScale) MaterialTheme.colorScheme.primary else palette.cardBorder,
                                                    RoundedCornerShape(8.dp)
                                                )
                                                .clickable {
                                                    onToggleLogScale()
                                                    activeSheet = ChartControlSheet.NONE
                                                }
                                                .padding(horizontal = 6.dp)
                                                .testTag("chart_log_scale_button"),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = stringResource(R.string.chart_axis_log),
                                                style = MaterialTheme.typography.labelMedium,
                                                fontFamily = JetBrainsMonoFontFamily,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }

                                        val tzLabel = if (preferences.timezoneMode.equals("LOCAL", ignoreCase = true)) "Local" else "UTC"
                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .heightIn(min = 48.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(MaterialTheme.colorScheme.background)
                                                .border(1.dp, palette.cardBorder, RoundedCornerShape(8.dp))
                                                .clickable {
                                                    onToggleTimezoneMode()
                                                }
                                                .padding(horizontal = 6.dp)
                                                .testTag("chart_timezone_toggle_button"),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                Icon(Icons.Outlined.Schedule, contentDescription = null, modifier = Modifier.size(16.dp))
                                                Text(tzLabel, style = MaterialTheme.typography.labelMedium, fontFamily = JetBrainsMonoFontFamily, fontWeight = FontWeight.Bold)
                                            }
                                        }
                                    }

                                    // Row 2: Viewport & Sync Actions (48.dp Material 3 Ergonomic Targets)
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .heightIn(min = 48.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(MaterialTheme.colorScheme.background)
                                                .border(1.dp, palette.cardBorder, RoundedCornerShape(8.dp))
                                                .clickable {
                                                    onFitContent()
                                                    activeSheet = ChartControlSheet.NONE
                                                }
                                                .padding(horizontal = 6.dp)
                                                .testTag("chart_fit_content_button"),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                Icon(Icons.Outlined.FitScreen, contentDescription = null, modifier = Modifier.size(16.dp))
                                                Text(stringResource(R.string.chart_fit_short), style = MaterialTheme.typography.labelMedium, maxLines = 1)
                                            }
                                        }

                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .heightIn(min = 48.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(MaterialTheme.colorScheme.background)
                                                .border(1.dp, palette.cardBorder, RoundedCornerShape(8.dp))
                                                .clickable {
                                                    onResetLatest()
                                                    activeSheet = ChartControlSheet.NONE
                                                }
                                                .padding(horizontal = 6.dp)
                                                .testTag("chart_reset_latest_button"),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                Icon(Icons.Outlined.CenterFocusStrong, contentDescription = null, modifier = Modifier.size(16.dp))
                                                Text(stringResource(R.string.chart_reset_view), style = MaterialTheme.typography.labelMedium, maxLines = 1)
                                            }
                                        }

                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .heightIn(min = 48.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(MaterialTheme.colorScheme.background)
                                                .border(1.dp, palette.cardBorder, RoundedCornerShape(8.dp))
                                                .clickable {
                                                    onSyncActiveSymbolNow(activeTab.symbolCode)
                                                    activeSheet = ChartControlSheet.NONE
                                                }
                                                .padding(horizontal = 6.dp)
                                                .testTag("chart_sync_active_tab_button"),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                Icon(Icons.Outlined.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
                                                Text(stringResource(R.string.chart_sync_short), style = MaterialTheme.typography.labelMedium, maxLines = 1)
                                            }
                                        }
                                    }
                                }
                            }

                            ChartControlSheet.NONE -> Unit
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                    }
                }
            }
        }
    }
}
