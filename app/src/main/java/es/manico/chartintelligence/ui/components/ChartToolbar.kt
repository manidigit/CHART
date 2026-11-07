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
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.data.model.ChartType
import es.manico.chartintelligence.data.model.DateRangePresetOption
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import kotlin.math.roundToInt

/**
 * Unified Single-Row Top Chart Control Bar:
 * Combines Timeframe (15m, 1h, 4h, 1D), Historical Date Range Presets (1D, 5D, 1M, 3M, YTD, 1Y, All),
 * Chart Type (Candles / Line), Volume Sub-Pane Toggle & Height Resizer, SMA 20 Indicator Toggle,
 * and Viewport / Scale actions in a single compact horizontal strip at the top of the workspace.
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

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, palette.cardBorder, RoundedCornerShape(8.dp))
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 6.dp, vertical = 3.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Group 1: Timeframes (15m, 1h, 4h, 1D — mapped internally to M15, H1, H4, D1)
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

        // Group 2: Historical Date Range Presets (1D, 5D, 1M, 3M, YTD, 1Y, All)
        if (dateRangePresets.isNotEmpty()) {
            for (preset in dateRangePresets) {
                val isSelected = activeDateRange != null && activeDateRange.equals(preset.id, ignoreCase = true)
                ToolbarPillButton(
                    label = preset.label,
                    selected = isSelected,
                    enabled = preset.enabled,
                    monoFont = true,
                    onClick = { if (preset.enabled) onSelectDateRange(preset.id) },
                    testTag = "chart_range_${preset.id.lowercase()}_button"
                )
            }
            ToolbarDivider()
        }

        // Group 3: Chart Type (Candles / Line)
        ToolbarPillButton(
            label = stringResource(R.string.chart_type_candles),
            icon = Icons.Outlined.CandlestickChart,
            selected = activeChartType == ChartType.CANDLESTICK,
            onClick = { onSelectChartType(ChartType.CANDLESTICK) },
            testTag = "chart_type_candlestick_button"
        )
        ToolbarPillButton(
            label = stringResource(R.string.chart_type_line),
            icon = Icons.Outlined.ShowChart,
            selected = activeChartType == ChartType.LINE,
            onClick = { onSelectChartType(ChartType.LINE) },
            testTag = "chart_type_line_button"
        )

        ToolbarDivider()

        // Group 4: Volume Sub-Pane & SMA 20 Indicator Controls
        ToolbarPillButton(
            label = stringResource(R.string.chart_volume_toggle),
            icon = Icons.Outlined.BarChart,
            selected = showVolume,
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
            label = stringResource(R.string.chart_indicator_sma20),
            icon = Icons.Outlined.Timeline,
            selected = showSma20,
            monoFont = true,
            onClick = onToggleSma20,
            testTag = "chart_sma20_toggle_button"
        )

        ToolbarDivider()

        // Group 5: Scale & Viewport Controls
        ToolbarPillButton(
            label = stringResource(R.string.chart_zoom_in),
            icon = Icons.Outlined.ZoomIn,
            selected = false,
            onClick = onZoomIn,
            testTag = "chart_zoom_in_button"
        )
        ToolbarPillButton(
            label = stringResource(R.string.chart_zoom_out),
            icon = Icons.Outlined.ZoomOut,
            selected = false,
            onClick = onZoomOut,
            testTag = "chart_zoom_out_button"
        )
        ToolbarPillButton(
            label = stringResource(R.string.chart_fit_content),
            icon = Icons.Outlined.FitScreen,
            selected = false,
            onClick = onFitContent,
            testTag = "chart_fit_content_button"
        )
        ToolbarPillButton(
            label = stringResource(R.string.chart_reset_view),
            icon = Icons.Outlined.CenterFocusStrong,
            selected = false,
            onClick = onResetLatest,
            testTag = "chart_reset_latest_button"
        )
        ToolbarPillButton(
            label = if (isAutoScaleY) {
                stringResource(R.string.chart_auto_scale)
            } else {
                stringResource(R.string.chart_manual_scale)
            },
            icon = Icons.Outlined.UnfoldMore,
            selected = isAutoScaleY,
            onClick = onResetAutoScaleY,
            testTag = "chart_auto_scale_button"
        )
    }
}

@Composable
private fun ToolbarDivider() {
    val palette = LocalFinancialPalette.current
    Spacer(modifier = Modifier.width(2.dp))
    Box(
        modifier = Modifier
            .width(1.dp)
            .height(22.dp)
            .background(palette.cardBorder)
    )
    Spacer(modifier = Modifier.width(2.dp))
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
        !enabled -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.30f)
        selected -> MaterialTheme.colorScheme.primary.copy(alpha = 0.20f)
        else -> MaterialTheme.colorScheme.surfaceVariant
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
            .heightIn(min = 38.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(6.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 4.dp)
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
