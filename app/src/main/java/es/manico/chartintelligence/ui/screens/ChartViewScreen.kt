package es.manico.chartintelligence.ui.screens

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
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
import androidx.compose.material.icons.outlined.ShowChart
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material.icons.outlined.Timeline
import androidx.compose.material.icons.outlined.UnfoldMore
import androidx.compose.material.icons.outlined.VerticalAlignCenter
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
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
    onToggleEma50: () -> Unit = {},
    onToggleBollinger: () -> Unit = {},
    onZoom: (Boolean) -> Unit,
    onPinchZoom: (Float) -> Unit,
    onPanCandles: (Int) -> Unit,
    onFitContent: () -> Unit,
    onResetLatest: () -> Unit,
    onScaleYAxisByDrag: (Float) -> Unit,
    onResetAutoScaleY: () -> Unit,
    onToggleLogScale: () -> Unit = {},
    onSelectCandle: (Int?) -> Unit,
    onSelectDrawingTool: (DrawingTool) -> Unit,
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
    var activeSheet by rememberSaveable { mutableStateOf(ChartControlSheet.NONE) }

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

            val statusDotColor = if (activeTab.isLoading) {
                MaterialTheme.colorScheme.primary
            } else {
                when (marketStatus) {
                    MarketStatus.LIVE -> preferences.bullCandleColor
                    MarketStatus.MARKET_CLOSED, MarketStatus.DELAYED -> Color(0xFFF59E0B)
                    MarketStatus.CACHED -> MaterialTheme.colorScheme.onSurfaceVariant
                    MarketStatus.ERROR -> preferences.bearCandleColor
                }
            }

            // [2] Compact Header (48.dp): Left = Rich Asset Icon Badge + Symbol + Live Price + Change | Right = Read-Only Data Source Label
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Left: Rich Asset Icon Badge + Symbol Name + Live Price & Signed Change
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
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

                    // Right: Read-only Data Source Badge (Non-clickable display only)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(MaterialTheme.colorScheme.background)
                            .border(1.dp, palette.cardBorder, RoundedCornerShape(4.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                            .testTag("chart_market_status_pill")
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(statusDotColor)
                        )
                        Text(
                            text = activeTab.provider.badgeLabel,
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            HorizontalDivider(thickness = 1.dp, color = palette.cardBorder)

            // [3] Main Full-Viewport Chart Canvas (>= 85% usable height)
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
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
                    DrawingToolbar(
                        activeTool = activeTab.activeDrawingTool,
                        hasSelectedDrawing = activeTab.selectedDrawingId != null,
                        totalDrawingsCount = activeTab.drawings.size,
                        pendingTrendPoint = activeTab.pendingTrendPoint,
                        activeDrawingColorHex = activeTab.activeDrawingColorHex,
                        activeDrawingWidthDp = activeTab.activeDrawingWidthDp,
                        isCollapsed = activeTab.isDrawingDockCollapsed,
                        onSelectTool = onSelectDrawingTool,
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

                    // 4. Indicator Button (fx) -> Opens Unified 4-Indicator BottomSheet
                    val hasActiveIndicator = activeTab.showSma20 || activeTab.showEma50 || activeTab.showBollinger || activeTab.showVolume
                    val hasOverlayIndicator = activeTab.showSma20 || activeTab.showEma50 || activeTab.showBollinger
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
                                Text(
                                    text = stringResource(R.string.chart_control_indicators),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                // 1. SMA 20
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable(onClick = onToggleSma20)
                                        .padding(vertical = 4.dp)
                                        .testTag("chart_sma20_toggle_button"),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Outlined.Timeline,
                                            contentDescription = "SMA 20",
                                            tint = Color(0xFFF59E0B)
                                        )
                                        Text(
                                            text = "SMA 20 (Simple Moving Average)",
                                            style = MaterialTheme.typography.bodyLarge,
                                            fontFamily = JetBrainsMonoFontFamily,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                    Switch(
                                        checked = activeTab.showSma20,
                                        onCheckedChange = { onToggleSma20() }
                                    )
                                }

                                HorizontalDivider(thickness = 1.dp, color = palette.cardBorder)

                                // 2. EMA 50
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable(onClick = onToggleEma50)
                                        .padding(vertical = 4.dp)
                                        .testTag("chart_ema50_toggle_button"),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Outlined.ShowChart,
                                            contentDescription = "EMA 50",
                                            tint = Color(0xFF06B6D4)
                                        )
                                        Text(
                                            text = "EMA 50 (Exponential Moving Average)",
                                            style = MaterialTheme.typography.bodyLarge,
                                            fontFamily = JetBrainsMonoFontFamily,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                    Switch(
                                        checked = activeTab.showEma50,
                                        onCheckedChange = { onToggleEma50() }
                                    )
                                }

                                HorizontalDivider(thickness = 1.dp, color = palette.cardBorder)

                                // 3. Bollinger Bands (20, 2)
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable(onClick = onToggleBollinger)
                                        .padding(vertical = 4.dp)
                                        .testTag("chart_bollinger_toggle_button"),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Outlined.VerticalAlignCenter,
                                            contentDescription = "Bollinger Bands",
                                            tint = Color(0xFFA855F7)
                                        )
                                        Text(
                                            text = "Bollinger Bands (20, 2)",
                                            style = MaterialTheme.typography.bodyLarge,
                                            fontFamily = JetBrainsMonoFontFamily,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                    Switch(
                                        checked = activeTab.showBollinger,
                                        onCheckedChange = { onToggleBollinger() }
                                    )
                                }

                                HorizontalDivider(thickness = 1.dp, color = palette.cardBorder)

                                // 4. Volume Histogram + Height Selector (16% / 22% / 30%)
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable(onClick = onToggleVolume)
                                        .padding(vertical = 4.dp)
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
                                            style = MaterialTheme.typography.bodyLarge,
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

                                    // Viewport & Sync Actions
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(38.dp)
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(MaterialTheme.colorScheme.background)
                                                .border(1.dp, palette.cardBorder, RoundedCornerShape(6.dp))
                                                .clickable {
                                                    onResetAutoScaleY()
                                                    activeSheet = ChartControlSheet.NONE
                                                }
                                                .testTag("chart_auto_scale_button"),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                Icon(Icons.Outlined.UnfoldMore, contentDescription = null, modifier = Modifier.size(15.dp))
                                                Text(stringResource(R.string.chart_auto_scale), style = MaterialTheme.typography.labelSmall)
                                            }
                                        }

                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(38.dp)
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(
                                                    if (activeTab.isLogScale) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                                                    else MaterialTheme.colorScheme.background
                                                )
                                                .border(
                                                    1.dp,
                                                    if (activeTab.isLogScale) MaterialTheme.colorScheme.primary else palette.cardBorder,
                                                    RoundedCornerShape(6.dp)
                                                )
                                                .clickable {
                                                    onToggleLogScale()
                                                    activeSheet = ChartControlSheet.NONE
                                                }
                                                .testTag("chart_log_scale_button"),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = stringResource(R.string.chart_axis_log),
                                                style = MaterialTheme.typography.labelSmall,
                                                fontFamily = JetBrainsMonoFontFamily,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }

                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(38.dp)
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(MaterialTheme.colorScheme.background)
                                                .border(1.dp, palette.cardBorder, RoundedCornerShape(6.dp))
                                                .clickable {
                                                    onFitContent()
                                                    activeSheet = ChartControlSheet.NONE
                                                }
                                                .testTag("chart_fit_content_button"),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                Icon(Icons.Outlined.FitScreen, contentDescription = null, modifier = Modifier.size(15.dp))
                                                Text(stringResource(R.string.chart_fit_content), style = MaterialTheme.typography.labelSmall)
                                            }
                                        }

                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(38.dp)
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(MaterialTheme.colorScheme.background)
                                                .border(1.dp, palette.cardBorder, RoundedCornerShape(6.dp))
                                                .clickable {
                                                    onResetLatest()
                                                    activeSheet = ChartControlSheet.NONE
                                                }
                                                .testTag("chart_reset_latest_button"),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                Icon(Icons.Outlined.CenterFocusStrong, contentDescription = null, modifier = Modifier.size(15.dp))
                                                Text(stringResource(R.string.chart_reset_view), style = MaterialTheme.typography.labelSmall)
                                            }
                                        }

                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(38.dp)
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(MaterialTheme.colorScheme.background)
                                                .border(1.dp, palette.cardBorder, RoundedCornerShape(6.dp))
                                                .clickable {
                                                    onSyncActiveSymbolNow(activeTab.symbolCode)
                                                    activeSheet = ChartControlSheet.NONE
                                                }
                                                .testTag("chart_sync_active_tab_button"),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                Icon(Icons.Outlined.Sync, contentDescription = null, modifier = Modifier.size(15.dp))
                                                Text("Sync", style = MaterialTheme.typography.labelSmall, fontFamily = JetBrainsMonoFontFamily)
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
