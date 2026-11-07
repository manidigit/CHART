package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AdsClick
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.HorizontalRule
import androidx.compose.material.icons.outlined.Timeline
import androidx.compose.material.icons.outlined.VerticalAlignCenter
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.data.model.DrawingTool
import es.manico.chartintelligence.data.model.TrendAnchorPoint
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette

/**
 * Compact Drawing Tools Bar:
 * - Crosshair / Cursor (Select & Drag drawings)
 * - Horizontal Line (Price level)
 * - Vertical Line (Time marker)
 * - Trend Line (Two-point trendline)
 * - Delete Selected Line / Clear All Lines
 */
@Composable
fun DrawingToolbar(
    activeTool: DrawingTool,
    hasSelectedDrawing: Boolean,
    totalDrawingsCount: Int,
    pendingTrendPoint: TrendAnchorPoint?,
    onSelectTool: (DrawingTool) -> Unit,
    onDeleteSelected: () -> Unit,
    onClearAll: () -> Unit,
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
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            DrawingToolChip(
                label = stringResource(R.string.draw_tool_cursor),
                icon = Icons.Outlined.AdsClick,
                selected = activeTool == DrawingTool.CURSOR,
                onClick = { onSelectTool(DrawingTool.CURSOR) },
                testTag = "draw_tool_cursor_button"
            )
            DrawingToolChip(
                label = stringResource(R.string.draw_tool_hline),
                icon = Icons.Outlined.HorizontalRule,
                selected = activeTool == DrawingTool.HORIZONTAL_LINE,
                onClick = { onSelectTool(DrawingTool.HORIZONTAL_LINE) },
                testTag = "draw_tool_hline_button"
            )
            DrawingToolChip(
                label = stringResource(R.string.draw_tool_vline),
                icon = Icons.Outlined.VerticalAlignCenter,
                selected = activeTool == DrawingTool.VERTICAL_LINE,
                onClick = { onSelectTool(DrawingTool.VERTICAL_LINE) },
                testTag = "draw_tool_vline_button"
            )
            DrawingToolChip(
                label = stringResource(R.string.draw_tool_trend),
                icon = Icons.Outlined.Timeline,
                selected = activeTool == DrawingTool.TREND_LINE,
                onClick = { onSelectTool(DrawingTool.TREND_LINE) },
                testTag = "draw_tool_trend_button"
            )

            if (hasSelectedDrawing) {
                DrawingToolChip(
                    label = stringResource(R.string.draw_delete_selected),
                    icon = Icons.Outlined.DeleteOutline,
                    selected = false,
                    accentColor = palette.bearCandle,
                    onClick = onDeleteSelected,
                    testTag = "draw_delete_selected_button"
                )
            }

            if (totalDrawingsCount > 0) {
                DrawingToolChip(
                    label = "${stringResource(R.string.draw_clear_all)} ($totalDrawingsCount)",
                    icon = Icons.Outlined.DeleteSweep,
                    selected = false,
                    onClick = onClearAll,
                    testTag = "draw_clear_all_button"
                )
            }
        }

        val hintText = when {
            activeTool == DrawingTool.TREND_LINE && pendingTrendPoint == null ->
                stringResource(R.string.draw_hint_trend_point1)
            activeTool == DrawingTool.TREND_LINE && pendingTrendPoint != null ->
                stringResource(R.string.draw_hint_trend_point2)
            activeTool == DrawingTool.HORIZONTAL_LINE || activeTool == DrawingTool.VERTICAL_LINE ->
                stringResource(R.string.draw_hint_active_tool)
            hasSelectedDrawing ->
                stringResource(R.string.draw_hint_selected)
            else -> null
        }

        if (hintText != null) {
            Text(
                text = hintText,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
            )
        }
    }
}

@Composable
private fun DrawingToolChip(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
    testTag: String,
    accentColor: Color? = null
) {
    val palette = LocalFinancialPalette.current
    val baseAccent = accentColor ?: MaterialTheme.colorScheme.primary
    val bgColor = if (selected) {
        baseAccent.copy(alpha = 0.18f)
    } else {
        MaterialTheme.colorScheme.surfaceVariant
    }
    val borderColor = if (selected || accentColor != null) baseAccent else palette.cardBorder
    val textColor = if (selected || accentColor != null) baseAccent else MaterialTheme.colorScheme.onSurface

    Box(
        modifier = Modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp)
            .testTag(testTag),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = textColor,
                modifier = Modifier.size(16.dp)
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                color = textColor
            )
        }
    }
}
