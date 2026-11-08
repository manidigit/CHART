package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.CandlestickChart
import androidx.compose.material.icons.outlined.CenterFocusStrong
import androidx.compose.material.icons.outlined.FitScreen
import androidx.compose.material.icons.outlined.ShowChart
import androidx.compose.material.icons.outlined.Timeline
import androidx.compose.material.icons.outlined.UnfoldMore
import androidx.compose.material.icons.outlined.ZoomIn
import androidx.compose.material.icons.outlined.ZoomOut
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.data.model.ChartType
import es.manico.chartintelligence.data.model.DateRangePresetOption
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import kotlin.math.roundToInt

/**
 * TradingView Compact 36.dp Top Control Strip:
 * - Strictly adheres to the 4/8dp spacing grid (`4.dp`, `8.dp`)
 * - Compact LTR pills (`15m`, `1h`, `4h`, `1D`), compact Range selector dropdown + quick chips,
 *   icon-compact Chart Type (`Candles`/`Line`), `Vol`, `SMA20`, and viewport scale icons.
 */
@Composable
fun ChartToolbar(
    activeTimeframe: String,
    allowedTimeframes: List<String>,
    dateRangePresets: List<DateRangePresetOption> = emptyList(),
    activeDateRange: String? = null,
    activeChartType: ChartType,
    showVolume: Boolean = true,
    volumePaneRatio: Float = 0.22f,
    showSma20: Boolean = false,
    isAutoScaleY: Boolean,
    onSelectTimeframe: (String) -> Unit,
    onSelectDateRange: (String) -> Unit = {},
    onSelectChartType: (ChartType) -> Unit,
    onToggleVolume: () -> Unit = {},
    onCycleVolumeHeight: () -> Unit = {},
    onToggleSma20: () -> Unit = {},
    onZoomIn: () -> Unit,
    onZoomOut: () -> Unit,
    onFitContent: () -> Unit,
    onResetLatest: () -> Unit,
    onResetAutoScaleY: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current
    var showRangeMenu by remember { mutableStateOf(false) }

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(
            modifier = modifier
                .fillMaxWidth()
                .height(36.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, palette.cardBorder, RoundedCornerShape(4.dp))
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Group 1: Compact Timeframe Chips (15m, 1h, 4h, 1D)
            val timeframes = listOf("M15", "H1", "H4", "D1")
            for (tf in timeframes) {
                val enabled = tf in allowedTimeframes
                val isSelected = activeTimeframe.equals(tf, ignoreCase = true)
                ToolbarPillButton(
                    label = PriceFormatterAlgorithm.displayTimeframeLabel(tf),
                    selected = isSelected,
                    enabled = enabled,
                    monoFont = true,
                    onClick = { if (enabled) onSelectTimeframe(tf) },
                    testTag = "chart_tf_${tf.lowercase()}_button"
                )
            }

            ToolbarDivider()

            // Group 2: Compact Range Picker Chip + Popover Menu
            if (dateRangePresets.isNotEmpty()) {
                Box {
                    val currentRangeLabel = activeDateRange ?: "Range"
                    ToolbarPillButton(
                        label = "$currentRangeLabel ▾",
                        selected = activeDateRange != null,
                        monoFont = true,
                        onClick = { showRangeMenu = true },
                        testTag = "chart_range_dropdown_button"
                    )
                    DropdownMenu(
                        expanded = showRangeMenu,
                        onDismissRequest = { showRangeMenu = false },
                        modifier = Modifier.background(MaterialTheme.colorScheme.surface)
                    ) {
                        for (preset in dateRangePresets) {
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        text = preset.label,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        fontWeight = if (activeDateRange == preset.id) FontWeight.Bold else FontWeight.Normal,
                                        color = if (activeDateRange == preset.id) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                                    )
                                },
                                enabled = preset.enabled,
                                onClick = {
                                    showRangeMenu = false
                                    if (preset.enabled) onSelectDateRange(preset.id)
                                },
                                modifier = Modifier.testTag("chart_range_${preset.id.lowercase()}_button")
                            )
                        }
                    }
                }
                ToolbarDivider()
            }

            // Group 3: Icon-Only Chart Type Toggle (Candles / Line)
            ToolbarIconOnlyButton(
                icon = Icons.Outlined.CandlestickChart,
                contentDescription = stringResource(R.string.chart_type_candles),
                selected = activeChartType == ChartType.CANDLESTICK,
                onClick = { onSelectChartType(ChartType.CANDLESTICK) },
                testTag = "chart_type_candlestick_button"
            )
            ToolbarIconOnlyButton(
                icon = Icons.Outlined.ShowChart,
                contentDescription = stringResource(R.string.chart_type_line),
                selected = activeChartType == ChartType.LINE,
                onClick = { onSelectChartType(ChartType.LINE) },
                testTag = "chart_type_line_button"
            )

            ToolbarDivider()

            // Group 4: Compact Indicators & Sub-Panes (Vol, SMA20)
            ToolbarPillButton(
                label = "Vol",
                icon = Icons.Outlined.BarChart,
                selected = showVolume,
                monoFont = true,
                onClick = onToggleVolume,
                testTag = "chart_volume_toggle_button"
            )
            if (showVolume) {
                ToolbarPillButton(
                    label = "${(volumePaneRatio * 100f).roundToInt()}%",
                    selected = false,
                    monoFont = true,
                    onClick = onCycleVolumeHeight,
                    testTag = "chart_volume_resize_button"
                )
            }
            ToolbarPillButton(
                label = "SMA20",
                icon = Icons.Outlined.Timeline,
                selected = showSma20,
                monoFont = true,
                onClick = onToggleSma20,
                testTag = "chart_sma20_toggle_button"
            )

            ToolbarDivider()

            // Group 5: Icon-Only Scale & Viewport Controls
            ToolbarIconOnlyButton(
                icon = Icons.Outlined.ZoomIn,
                contentDescription = stringResource(R.string.chart_zoom_in),
                selected = false,
                onClick = onZoomIn,
                testTag = "chart_zoom_in_button"
            )
            ToolbarIconOnlyButton(
                icon = Icons.Outlined.ZoomOut,
                contentDescription = stringResource(R.string.chart_zoom_out),
                selected = false,
                onClick = onZoomOut,
                testTag = "chart_zoom_out_button"
            )
            ToolbarIconOnlyButton(
                icon = Icons.Outlined.FitScreen,
                contentDescription = stringResource(R.string.chart_fit_content),
                selected = false,
                onClick = onFitContent,
                testTag = "chart_fit_content_button"
            )
            ToolbarIconOnlyButton(
                icon = Icons.Outlined.CenterFocusStrong,
                contentDescription = stringResource(R.string.chart_reset_view),
                selected = false,
                onClick = onResetLatest,
                testTag = "chart_reset_latest_button"
            )
            ToolbarPillButton(
                label = "AUTO",
                icon = Icons.Outlined.UnfoldMore,
                selected = isAutoScaleY,
                monoFont = true,
                onClick = onResetAutoScaleY,
                testTag = "chart_auto_scale_button"
            )
        }
    }
}

@Composable
private fun ToolbarDivider() {
    val palette = LocalFinancialPalette.current
    Spacer(modifier = Modifier.width(4.dp))
    Box(
        modifier = Modifier
            .width(1.dp)
            .height(16.dp)
            .background(palette.cardBorder)
    )
    Spacer(modifier = Modifier.width(4.dp))
}

@Composable
private fun ToolbarIconOnlyButton(
    icon: ImageVector,
    contentDescription: String,
    selected: Boolean,
    onClick: () -> Unit,
    testTag: String
) {
    val palette = LocalFinancialPalette.current
    val bgColor = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.20f) else Color.Transparent
    val borderColor = if (selected) MaterialTheme.colorScheme.primary else palette.cardBorder
    val contentColor = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant

    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(4.dp))
            .clickable(onClick = onClick)
            .testTag(testTag),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = contentColor,
            modifier = Modifier.size(16.dp)
        )
    }
}

@Composable
private fun ToolbarPillButton(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    testTag: String,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    monoFont: Boolean = false
) {
    val palette = LocalFinancialPalette.current
    val bgColor = when {
        !enabled -> Color.Transparent
        selected -> MaterialTheme.colorScheme.primary.copy(alpha = 0.20f)
        else -> Color.Transparent
    }
    val borderColor = when {
        !enabled -> palette.cardBorder.copy(alpha = 0.30f)
        selected -> MaterialTheme.colorScheme.primary
        else -> palette.cardBorder
    }
    val contentColor = when {
        !enabled -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.38f)
        selected -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.onSurface
    }

    Box(
        modifier = Modifier
            .height(28.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(4.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 8.dp)
            .testTag(testTag),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            if (icon != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = contentColor,
                    modifier = Modifier.size(14.dp)
                )
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                fontFamily = if (monoFont) JetBrainsMonoFontFamily else MaterialTheme.typography.labelSmall.fontFamily,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                color = contentColor
            )
        }
    }
}
