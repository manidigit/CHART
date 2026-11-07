package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.outlined.CandlestickChart
import androidx.compose.material.icons.outlined.CenterFocusStrong
import androidx.compose.material.icons.outlined.FitScreen
import androidx.compose.material.icons.outlined.ShowChart
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
import es.manico.chartintelligence.data.model.ChartType
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette

/**
 * TradingView-inspired compact Chart Toolbar:
 * - Row 1: Timeframe switcher (M15, H1, H4, D1) + Chart Type switcher (Candles / Line)
 * - Row 2: Range & Viewport controls (Zoom In, Zoom Out, Fit Content, Go to Latest, Auto Scale Y)
 */
@Composable
fun ChartToolbar(
    activeTimeframe: String,
    allowedTimeframes: List<String>,
    activeChartType: ChartType,
    isAutoScaleY: Boolean,
    onSelectTimeframe: (String) -> Unit,
    onSelectChartType: (ChartType) -> Unit,
    onZoomIn: () -> Unit,
    onZoomOut: () -> Unit,
    onFitContent: () -> Unit,
    onResetLatest: () -> Unit,
    onResetAutoScaleY: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, palette.cardBorder, RoundedCornerShape(10.dp))
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        // Row 1: Timeframes + Chart Type
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val timeframes = listOf("M15", "H1", "H4", "D1")
                for (tf in timeframes) {
                    val enabled = tf in allowedTimeframes
                    val isSelected = activeTimeframe.equals(tf, ignoreCase = true)
                    ToolbarPillButton(
                        label = tf,
                        selected = isSelected,
                        enabled = enabled,
                        monoFont = true,
                        onClick = { if (enabled) onSelectTimeframe(tf) },
                        testTag = "chart_tf_${tf.lowercase()}_button"
                    )
                }
            }

            Spacer(modifier = Modifier.width(8.dp))

            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
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
            }
        }

        // Row 2: Range & Scale Navigation Controls
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
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
        !enabled -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
        selected -> MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    val borderColor = when {
        !enabled -> palette.cardBorder.copy(alpha = 0.35f)
        selected -> MaterialTheme.colorScheme.primary
        else -> palette.cardBorder
    }
    val contentColor = when {
        !enabled -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
        selected -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.onSurface
    }

    Box(
        modifier = Modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp)
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
                    modifier = Modifier.size(16.dp)
                )
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                fontFamily = if (monoFont) JetBrainsMonoFontFamily else MaterialTheme.typography.labelMedium.fontFamily,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                color = contentColor
            )
        }
    }
}
