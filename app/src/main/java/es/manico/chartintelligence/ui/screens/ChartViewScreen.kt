package es.manico.chartintelligence.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CandlestickChart
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.data.model.ChartPreferences
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.ChartType
import es.manico.chartintelligence.data.model.DrawingTool
import es.manico.chartintelligence.ui.components.CandlestickCanvas
import es.manico.chartintelligence.ui.components.ChartTabBar
import es.manico.chartintelligence.ui.components.ChartToolbar
import es.manico.chartintelligence.ui.components.DrawingToolbar
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import java.math.BigDecimal

/**
 * Full-Viewport Professional Chart Workspace:
 * - Zero outer vertical page scrolling when a symbol tab is active
 * - Compact Header Row: Symbol + Provider Badge + Live Close Price + Signed Diff + Signed % + Status Dot + Sync & Back actions
 * - Unified Single-Row Top Subbar: Timeframes (15m..1D) + Historical Date Ranges (1D..All) + Chart Type + Volume Toggle/Resize + SMA 20 + Scale
 * - Multi-Pane CandlestickCanvas filling Modifier.weight(1f) (~80%+ of screen height)
 * - Collapsible Floating Touch Drawing Dock at the bottom with auto-expanding Color & Thickness controls
 */
@Composable
fun ChartViewScreen(
    openTabs: List<ChartTabState>,
    activeTab: ChartTabState?,
    preferences: ChartPreferences = ChartPreferences(),
    onSelectTab: (String) -> Unit,
    onCloseTab: (String) -> Unit,
    onSyncActiveSymbolNow: (String) -> Unit,
    onBackToWatchlist: () -> Unit,
    onSelectTimeframe: (String) -> Unit,
    onSelectDateRange: (String) -> Unit = {},
    onSelectChartType: (ChartType) -> Unit,
    onToggleVolume: () -> Unit = {},
    onCycleVolumeHeight: () -> Unit = {},
    onToggleSma20: () -> Unit = {},
    onZoom: (Boolean) -> Unit,
    onPinchZoom: (Float) -> Unit,
    onFitContent: () -> Unit,
    onPanCandles: (Int) -> Unit,
    onResetLatest: () -> Unit,
    onScaleYAxisByDrag: (Float) -> Unit,
    onResetAutoScaleY: () -> Unit,
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

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        if (openTabs.isEmpty() || activeTab == null) {
            // Empty state when no symbol tabs are open
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.chart_view_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )
                IconButton(
                    onClick = onBackToWatchlist,
                    modifier = Modifier.testTag("chart_back_to_watchlist_button")
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                        contentDescription = stringResource(R.string.chart_open_from_watchlist)
                    )
                }
            }

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
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.chart_view_no_tabs_hint),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = onBackToWatchlist,
                    modifier = Modifier
                        .heightIn(min = 48.dp)
                        .testTag("empty_chart_to_watchlist_button")
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
            val isUp = latestClose != null && latestClose >= refOpen
            val priceColor = if (isUp) preferences.bullCandleColor else preferences.bearCandleColor
            val dateRangePresets = remember(activeTab.candles, activeTab.timeframe) {
                activeTab.computeDateRangePresets()
            }

            // Row 1: Compact Symbol + Live Price + Change + Parallel Tabs + Sync & Back
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.surface)
                    .border(1.dp, palette.cardBorder, RoundedCornerShape(8.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = activeTab.symbolCode,
                            style = MaterialTheme.typography.titleSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = activeTab.provider.badgeLabel,
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.primary
                        )
                        if (latestClose != null) {
                            val diffStr = PriceFormatterAlgorithm.formatSignedPriceDiff(refOpen, latestClose, activeTab.decimals)
                            val pctStr = PriceFormatterAlgorithm.formatSignedPercentChange(refOpen, latestClose)
                            Text(
                                text = PriceFormatterAlgorithm.formatPrice(latestClose, activeTab.decimals),
                                style = MaterialTheme.typography.titleSmall,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = priceColor
                            )
                            Text(
                                text = "$diffStr ($pctStr)",
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.SemiBold,
                                color = priceColor
                            )
                        }
                        // Status Dot + Label
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .clip(CircleShape)
                                    .background(
                                        if (activeTab.isLoading) MaterialTheme.colorScheme.primary
                                        else preferences.bullCandleColor
                                    )
                            )
                            Text(
                                text = if (activeTab.isLoading) {
                                    stringResource(R.string.chart_status_syncing)
                                } else {
                                    stringResource(R.string.chart_status_live)
                                },
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    IconButton(
                        onClick = { onSyncActiveSymbolNow(activeTab.symbolCode) },
                        enabled = !activeTab.isLoading,
                        modifier = Modifier
                            .size(36.dp)
                            .testTag("chart_sync_active_tab_button")
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Sync,
                            contentDescription = stringResource(R.string.action_sync_now),
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    IconButton(
                        onClick = onBackToWatchlist,
                        modifier = Modifier
                            .size(36.dp)
                            .testTag("chart_back_to_watchlist_button")
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                            contentDescription = stringResource(R.string.chart_open_from_watchlist),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }

            // Optional compact tab switcher if multiple tabs are open (or always accessible for testTag parity)
            ChartTabBar(
                tabs = openTabs,
                activeTabId = activeTab.tabId,
                onSelectTab = onSelectTab,
                onCloseTab = onCloseTab
            )

            // Row 2: Unified Single-Row Top Subbar (Timeframes + Date Ranges + Chart Type + Vol + SMA20 + Scale)
            ChartToolbar(
                activeTimeframe = activeTab.timeframe,
                allowedTimeframes = activeTab.allowedTimeframes,
                dateRangePresets = dateRangePresets,
                activeDateRange = activeTab.activeDateRange,
                activeChartType = activeTab.chartType,
                showVolume = activeTab.showVolume,
                volumePaneRatio = activeTab.volumePaneRatio,
                showSma20 = activeTab.showSma20,
                isAutoScaleY = activeTab.isAutoScaleY,
                onSelectTimeframe = onSelectTimeframe,
                onSelectDateRange = onSelectDateRange,
                onSelectChartType = onSelectChartType,
                onToggleVolume = onToggleVolume,
                onCycleVolumeHeight = onCycleVolumeHeight,
                onToggleSma20 = onToggleSma20,
                onZoomIn = { onZoom(true) },
                onZoomOut = { onZoom(false) },
                onFitContent = onFitContent,
                onResetLatest = onResetLatest,
                onResetAutoScaleY = onResetAutoScaleY
            )

            Spacer(modifier = Modifier.height(4.dp))

            // Main Full-Viewport Multi-Pane Chart Canvas (expands to fill all remaining screen height)
            CandlestickCanvas(
                tab = activeTab,
                preferences = preferences,
                onPinchZoom = onPinchZoom,
                onPanCandles = onPanCandles,
                onScaleYAxisByDrag = onScaleYAxisByDrag,
                onResetAutoScaleY = onResetAutoScaleY,
                onSelectCandle = onSelectCandle,
                onPlaceDrawingAt = onPlaceDrawingAt,
                onSelectDrawing = onSelectDrawing,
                onTranslateSelectedDrawing = onTranslateSelectedDrawing,
                onRetrySync = { onSyncActiveSymbolNow(activeTab.symbolCode) },
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(4.dp))

            // Bottom Collapsible Floating Touch Drawing Dock (with auto-expanding Color & Width row)
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
                onClearAll = onClearAllDrawings
            )
        }
    }
}
