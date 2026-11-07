package es.manico.chartintelligence.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CandlestickChart
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.ChartType
import es.manico.chartintelligence.data.model.DrawingTool
import es.manico.chartintelligence.ui.components.CandlestickCanvas
import es.manico.chartintelligence.ui.components.ChartTabBar
import es.manico.chartintelligence.ui.components.ChartToolbar
import es.manico.chartintelligence.ui.components.DrawingToolbar
import es.manico.chartintelligence.ui.components.SourceBadgeChip
import java.math.BigDecimal

@Composable
fun ChartViewScreen(
    openTabs: List<ChartTabState>,
    activeTab: ChartTabState?,
    onSelectTab: (String) -> Unit,
    onCloseTab: (String) -> Unit,
    onSyncActiveSymbolNow: (String) -> Unit,
    onBackToWatchlist: () -> Unit,
    onSelectTimeframe: (String) -> Unit,
    onSelectChartType: (ChartType) -> Unit,
    onZoom: (Boolean) -> Unit,
    onPinchZoom: (Float) -> Unit,
    onFitContent: () -> Unit,
    onPanCandles: (Int) -> Unit,
    onResetLatest: () -> Unit,
    onScaleYAxisByDrag: (Float) -> Unit,
    onResetAutoScaleY: () -> Unit,
    onSelectCandle: (Int?) -> Unit,
    onSelectDrawingTool: (DrawingTool) -> Unit,
    onPlaceDrawingAt: (Long, BigDecimal) -> Unit,
    onSelectDrawing: (String?) -> Unit,
    onTranslateSelectedDrawing: (Long, BigDecimal) -> Unit,
    onDeleteSelectedDrawing: () -> Unit,
    onClearAllDrawings: () -> Unit,
    modifier: Modifier = Modifier
) {
    BackHandler(onBack = onBackToWatchlist)

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
                .widthIn(max = 680.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.chart_view_title),
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )

                OutlinedButton(
                    onClick = onBackToWatchlist,
                    modifier = Modifier
                        .heightIn(min = 48.dp)
                        .testTag("chart_back_to_watchlist_button")
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                        contentDescription = stringResource(R.string.chart_open_from_watchlist),
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = stringResource(R.string.chart_open_from_watchlist))
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            if (openTabs.isEmpty() || activeTab == null) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 56.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CandlestickChart,
                        contentDescription = stringResource(R.string.chart_view_no_tabs_title),
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Text(
                        text = stringResource(R.string.chart_view_no_tabs_title),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = stringResource(R.string.chart_view_no_tabs_hint),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
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
                // Persistent Parallel Tab Bar
                ChartTabBar(
                    tabs = openTabs,
                    activeTabId = activeTab.tabId,
                    onSelectTab = onSelectTab,
                    onCloseTab = onCloseTab
                )

                Spacer(modifier = Modifier.height(6.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    SourceBadgeChip(
                        provider = activeTab.provider,
                        timeframe = activeTab.timeframe
                    )
                    Text(
                        text = stringResource(R.string.chart_utc_anchor_badge),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                // TradingView-inspired Timeframe, Chart Type, and Range Toolbar
                ChartToolbar(
                    activeTimeframe = activeTab.timeframe,
                    allowedTimeframes = activeTab.allowedTimeframes,
                    activeChartType = activeTab.chartType,
                    isAutoScaleY = activeTab.isAutoScaleY,
                    onSelectTimeframe = onSelectTimeframe,
                    onSelectChartType = onSelectChartType,
                    onZoomIn = { onZoom(true) },
                    onZoomOut = { onZoom(false) },
                    onFitContent = onFitContent,
                    onResetLatest = onResetLatest,
                    onResetAutoScaleY = onResetAutoScaleY
                )

                Spacer(modifier = Modifier.height(6.dp))

                // Drawing Tools Bar (Crosshair, H-Line, V-Line, Trend Line, Delete, Clear All)
                DrawingToolbar(
                    activeTool = activeTab.activeDrawingTool,
                    hasSelectedDrawing = activeTab.selectedDrawingId != null,
                    totalDrawingsCount = activeTab.drawings.size,
                    pendingTrendPoint = activeTab.pendingTrendPoint,
                    onSelectTool = onSelectDrawingTool,
                    onDeleteSelected = onDeleteSelectedDrawing,
                    onClearAll = onClearAllDrawings
                )

                Spacer(modifier = Modifier.height(8.dp))

                CandlestickCanvas(
                    tab = activeTab,
                    onPinchZoom = onPinchZoom,
                    onPanCandles = onPanCandles,
                    onScaleYAxisByDrag = onScaleYAxisByDrag,
                    onResetAutoScaleY = onResetAutoScaleY,
                    onSelectCandle = onSelectCandle,
                    onPlaceDrawingAt = onPlaceDrawingAt,
                    onSelectDrawing = onSelectDrawing,
                    onTranslateSelectedDrawing = onTranslateSelectedDrawing,
                    onRetrySync = { onSyncActiveSymbolNow(activeTab.symbolCode) }
                )

                Spacer(modifier = Modifier.height(10.dp))

                Button(
                    onClick = { onSyncActiveSymbolNow(activeTab.symbolCode) },
                    enabled = !activeTab.isLoading,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .testTag("chart_sync_active_tab_button")
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Sync,
                        contentDescription = stringResource(R.string.action_sync_now),
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (activeTab.isLoading) {
                            stringResource(R.string.action_syncing)
                        } else {
                            stringResource(R.string.action_sync_now)
                        }
                    )
                }
            }
        }
    }
}
