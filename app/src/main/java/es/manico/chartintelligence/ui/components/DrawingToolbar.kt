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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AdsClick
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
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
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import kotlin.math.abs

private val DRAWING_COLOR_SWATCHES = listOf(
    "FF38BDF8" to Color(0xFF38BDF8),
    "FFA855F7" to Color(0xFFA855F7),
    "FFF59E0B" to Color(0xFFF59E0B),
    "FF10B981" to Color(0xFF10B981),
    "FFF43F5E" to Color(0xFFF43F5E),
    "FFF8FAFC" to Color(0xFFF8FAFC)
)

private val DRAWING_WIDTH_OPTIONS = listOf(
    1.2f to "1x",
    2.2f to "2x",
    3.2f to "3x",
    4.2f to "4x"
)

/**
 * Collapsible Floating Touch Drawing Dock:
 * - Sits compactly above the bottom navigation bar in ChartViewScreen
 * - Provides Crosshair, H-Line, V-Line, Trend Line, Delete Selected, and Clear All
 * - Automatically expands the Color Swatch Picker & Line Thickness Selector row when any drawing tool
 *   is active or an existing line is selected on the chart.
 */
@Composable
fun DrawingToolbar(
    activeTool: DrawingTool,
    hasSelectedDrawing: Boolean,
    totalDrawingsCount: Int,
    pendingTrendPoint: TrendAnchorPoint?,
    activeDrawingColorHex: String = "FF38BDF8",
    activeDrawingWidthDp: Float = 2.2f,
    isCollapsed: Boolean = false,
    onSelectTool: (DrawingTool) -> Unit,
    onSelectColorHex: (String) -> Unit = {},
    onSelectWidthDp: (Float) -> Unit = {},
    onToggleCollapsed: () -> Unit = {},
    onDeleteSelected: () -> Unit,
    onClearAll: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current
    val showStyleRow = !isCollapsed && (activeTool != DrawingTool.CURSOR || hasSelectedDrawing)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.96f))
            .border(1.dp, palette.cardBorder, RoundedCornerShape(10.dp))
            .padding(horizontal = 6.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        // Auto-expanding Style Row (Color Swatches + Line Width 1x..4x)
        if (showStyleRow) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 2.dp, vertical = 2.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.draw_color_label),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                for ((hex, swatchColor) in DRAWING_COLOR_SWATCHES) {
                    val isColorSelected = activeDrawingColorHex.equals(hex, ignoreCase = true)
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(swatchColor)
                            .border(
                                width = if (isColorSelected) 2.5.dp else 1.dp,
                                color = if (isColorSelected) Color.White else palette.cardBorder,
                                shape = CircleShape
                            )
                            .clickable { onSelectColorHex(hex) }
                            .testTag("draw_color_${hex.lowercase()}_button")
                    )
                }

                Spacer(modifier = Modifier.width(6.dp))

                Text(
                    text = stringResource(R.string.draw_width_label),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                for ((widthDp, label) in DRAWING_WIDTH_OPTIONS) {
                    val isWidthSelected = abs(activeDrawingWidthDp - widthDp) < 0.35f
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(
                                if (isWidthSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.22f)
                                else MaterialTheme.colorScheme.surfaceVariant
                            )
                            .border(
                                width = 1.dp,
                                color = if (isWidthSelected) MaterialTheme.colorScheme.primary else palette.cardBorder,
                                shape = RoundedCornerShape(6.dp)
                            )
                            .clickable { onSelectWidthDp(widthDp) }
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                            .testTag("draw_width_${label}_button"),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = label,
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = if (isWidthSelected) FontWeight.Bold else FontWeight.Medium,
                            color = if (isWidthSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }

        // Primary Tool Row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            DrawingToolChip(
                label = stringResource(R.string.draw_tools_toggle),
                icon = if (isCollapsed) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                selected = !isCollapsed,
                onClick = onToggleCollapsed,
                testTag = "draw_dock_collapse_button"
            )

            if (!isCollapsed) {
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
        }

        val hintText = when {
            isCollapsed -> null
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
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
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
            .heightIn(min = 38.dp)
            .clip(RoundedCornerShape(7.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(7.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 4.dp)
            .testTag(testTag),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = textColor,
                modifier = Modifier.size(15.dp)
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                color = textColor
            )
        }
    }
}
