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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AdsClick
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.HorizontalRule
import androidx.compose.material.icons.outlined.Timeline
import androidx.compose.material.icons.outlined.VerticalAlignCenter
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
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
import es.manico.chartintelligence.data.model.DrawingTool
import es.manico.chartintelligence.data.model.TrendAnchorPoint
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import kotlin.math.abs

private val DRAWING_COLOR_SWATCHES = listOf(
    "FF2962FF" to Color(0xFF2962FF),
    "FF26A69A" to Color(0xFF26A69A),
    "FFEF5350" to Color(0xFFEF5350),
    "FFF59E0B" to Color(0xFFF59E0B),
    "FFD1D4DC" to Color(0xFFD1D4DC),
    "FF758696" to Color(0xFF758696)
)

private val DRAWING_WIDTH_OPTIONS = listOf(
    1.2f to "1px",
    2.2f to "2px",
    3.2f to "3px",
    4.2f to "4px"
)

/**
 * TradingView Mobile Floating Pencil FAB + BottomSheet Drawing Dock:
 * - Zero bulky Persian text buttons on the chart workspace
 * - Takes 0.dp of vertical layout height outside the chart canvas (floats in bottom-start corner of canvas)
 * - Compact 40.dp circular Pencil FAB opens a sleek TradingView BottomSheet for tool selection,
 *   color swatches, and line thickness (4/8dp spacing grid).
 * - When a drawing tool or line is active on canvas, shows a compact LTR floating icon strip for instant control.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DrawingToolbar(
    activeTool: DrawingTool,
    hasSelectedDrawing: Boolean,
    totalDrawingsCount: Int,
    pendingTrendPoint: TrendAnchorPoint?,
    activeDrawingColorHex: String = "FF2962FF",
    activeDrawingWidthDp: Float = 2.2f,
    isCollapsed: Boolean = true,
    onSelectTool: (DrawingTool) -> Unit,
    onSelectColorHex: (String) -> Unit = {},
    onSelectWidthDp: (Float) -> Unit = {},
    onToggleCollapsed: () -> Unit = {},
    onDeleteSelected: () -> Unit,
    onClearAll: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(
            modifier = modifier,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Compact 40.dp TradingView Floating Pencil FAB
            val isToolActive = activeTool != DrawingTool.CURSOR || hasSelectedDrawing
            val fabBg = if (isToolActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface.copy(alpha = 0.94f)
            val fabTint = if (isToolActive) Color.White else MaterialTheme.colorScheme.onSurface
            val fabBorder = if (isToolActive) MaterialTheme.colorScheme.primary else palette.cardBorder

            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(fabBg)
                    .border(1.dp, fabBorder, CircleShape)
                    .clickable(onClick = onToggleCollapsed)
                    .testTag("draw_dock_collapse_button"),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Outlined.Edit,
                    contentDescription = stringResource(R.string.draw_tools_toggle),
                    tint = fabTint,
                    modifier = Modifier.size(18.dp)
                )
            }

            // Compact Floating Quick-Action Icon Pill when an active tool or selected drawing is in use
            if (isToolActive || totalDrawingsCount > 0) {
                Row(
                    modifier = Modifier
                        .height(36.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.94f))
                        .border(1.dp, palette.cardBorder, RoundedCornerShape(18.dp))
                        .padding(horizontal = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    DrawingIconButton(
                        icon = Icons.Outlined.AdsClick,
                        contentDescription = stringResource(R.string.draw_tool_cursor),
                        selected = activeTool == DrawingTool.CURSOR,
                        onClick = { onSelectTool(DrawingTool.CURSOR) },
                        testTag = "draw_tool_cursor_button"
                    )
                    DrawingIconButton(
                        icon = Icons.Outlined.HorizontalRule,
                        contentDescription = stringResource(R.string.draw_tool_hline),
                        selected = activeTool == DrawingTool.HORIZONTAL_LINE,
                        onClick = { onSelectTool(DrawingTool.HORIZONTAL_LINE) },
                        testTag = "draw_tool_hline_button"
                    )
                    DrawingIconButton(
                        icon = Icons.Outlined.VerticalAlignCenter,
                        contentDescription = stringResource(R.string.draw_tool_vline),
                        selected = activeTool == DrawingTool.VERTICAL_LINE,
                        onClick = { onSelectTool(DrawingTool.VERTICAL_LINE) },
                        testTag = "draw_tool_vline_button"
                    )
                    DrawingIconButton(
                        icon = Icons.Outlined.Timeline,
                        contentDescription = stringResource(R.string.draw_tool_trend),
                        selected = activeTool == DrawingTool.TREND_LINE,
                        onClick = { onSelectTool(DrawingTool.TREND_LINE) },
                        testTag = "draw_tool_trend_button"
                    )
                    if (hasSelectedDrawing) {
                        DrawingIconButton(
                            icon = Icons.Outlined.DeleteOutline,
                            contentDescription = stringResource(R.string.draw_delete_selected),
                            selected = false,
                            accentColor = palette.bearCandle,
                            onClick = onDeleteSelected,
                            testTag = "draw_delete_selected_button"
                        )
                    }
                    if (totalDrawingsCount > 0) {
                        DrawingIconButton(
                            icon = Icons.Outlined.DeleteSweep,
                            contentDescription = stringResource(R.string.draw_clear_all),
                            selected = false,
                            onClick = onClearAll,
                            testTag = "draw_clear_all_button"
                        )
                    }
                }
            }
        }
    }

    // TradingView-Style ModalBottomSheet when user taps the Pencil FAB (`!isCollapsed`)
    if (!isCollapsed) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = onToggleCollapsed,
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
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.draw_tools_toggle),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .clickable(onClick = onToggleCollapsed),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Close,
                            contentDescription = stringResource(R.string.draw_tools_toggle),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }

                // Icon Grid of Drawing Tools
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        BottomSheetToolItem(
                            icon = Icons.Outlined.AdsClick,
                            codeLabel = "CSR",
                            selected = activeTool == DrawingTool.CURSOR,
                            onClick = {
                                onSelectTool(DrawingTool.CURSOR)
                                onToggleCollapsed()
                            },
                            testTag = "sheet_draw_tool_cursor"
                        )
                        BottomSheetToolItem(
                            icon = Icons.Outlined.HorizontalRule,
                            codeLabel = "H-LINE",
                            selected = activeTool == DrawingTool.HORIZONTAL_LINE,
                            onClick = {
                                onSelectTool(DrawingTool.HORIZONTAL_LINE)
                                onToggleCollapsed()
                            },
                            testTag = "sheet_draw_tool_hline"
                        )
                        BottomSheetToolItem(
                            icon = Icons.Outlined.VerticalAlignCenter,
                            codeLabel = "V-LINE",
                            selected = activeTool == DrawingTool.VERTICAL_LINE,
                            onClick = {
                                onSelectTool(DrawingTool.VERTICAL_LINE)
                                onToggleCollapsed()
                            },
                            testTag = "sheet_draw_tool_vline"
                        )
                        BottomSheetToolItem(
                            icon = Icons.Outlined.Timeline,
                            codeLabel = "TREND",
                            selected = activeTool == DrawingTool.TREND_LINE,
                            onClick = {
                                onSelectTool(DrawingTool.TREND_LINE)
                                onToggleCollapsed()
                            },
                            testTag = "sheet_draw_tool_trend"
                        )
                        if (hasSelectedDrawing) {
                            BottomSheetToolItem(
                                icon = Icons.Outlined.DeleteOutline,
                                codeLabel = "DEL",
                                selected = false,
                                accentColor = palette.bearCandle,
                                onClick = {
                                    onDeleteSelected()
                                    onToggleCollapsed()
                                },
                                testTag = "sheet_draw_delete_selected"
                            )
                        }
                        if (totalDrawingsCount > 0) {
                            BottomSheetToolItem(
                                icon = Icons.Outlined.DeleteSweep,
                                codeLabel = "CLR ($totalDrawingsCount)",
                                selected = false,
                                accentColor = palette.bearCandle,
                                onClick = {
                                    onClearAll()
                                    onToggleCollapsed()
                                },
                                testTag = "sheet_draw_clear_all"
                            )
                        }
                    }

                    // Color & Stroke Width Row
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        for ((hex, swatchColor) in DRAWING_COLOR_SWATCHES) {
                            val isColorSelected = activeDrawingColorHex.equals(hex, ignoreCase = true)
                            Box(
                                modifier = Modifier
                                    .size(28.dp)
                                    .clip(CircleShape)
                                    .background(swatchColor)
                                    .border(
                                        width = if (isColorSelected) 2.dp else 1.dp,
                                        color = if (isColorSelected) Color.White else palette.cardBorder,
                                        shape = CircleShape
                                    )
                                    .clickable { onSelectColorHex(hex) }
                                    .testTag("draw_color_${hex.lowercase()}_button")
                            )
                        }

                        Spacer(modifier = Modifier.width(8.dp))

                        for ((widthDp, label) in DRAWING_WIDTH_OPTIONS) {
                            val isWidthSelected = abs(activeDrawingWidthDp - widthDp) < 0.35f
                            Box(
                                modifier = Modifier
                                    .height(28.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(
                                        if (isWidthSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.22f)
                                        else MaterialTheme.colorScheme.surfaceVariant
                                    )
                                    .border(
                                        width = 1.dp,
                                        color = if (isWidthSelected) MaterialTheme.colorScheme.primary else palette.cardBorder,
                                        shape = RoundedCornerShape(4.dp)
                                    )
                                    .clickable { onSelectWidthDp(widthDp) }
                                    .padding(horizontal = 8.dp)
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

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}

@Composable
private fun DrawingIconButton(
    icon: ImageVector,
    contentDescription: String,
    selected: Boolean,
    onClick: () -> Unit,
    testTag: String,
    accentColor: Color? = null
) {
    val baseAccent = accentColor ?: MaterialTheme.colorScheme.primary
    val bgColor = if (selected) baseAccent.copy(alpha = 0.22f) else Color.Transparent
    val tintColor = if (selected || accentColor != null) baseAccent else MaterialTheme.colorScheme.onSurfaceVariant

    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(CircleShape)
            .background(bgColor)
            .clickable(onClick = onClick)
            .testTag(testTag),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = tintColor,
            modifier = Modifier.size(16.dp)
        )
    }
}

@Composable
private fun BottomSheetToolItem(
    icon: ImageVector,
    codeLabel: String,
    selected: Boolean,
    onClick: () -> Unit,
    testTag: String,
    accentColor: Color? = null
) {
    val palette = LocalFinancialPalette.current
    val baseAccent = accentColor ?: MaterialTheme.colorScheme.primary
    val bgColor = if (selected) baseAccent.copy(alpha = 0.18f) else MaterialTheme.colorScheme.surfaceVariant
    val borderColor = if (selected || accentColor != null) baseAccent else palette.cardBorder
    val contentColor = if (selected || accentColor != null) baseAccent else MaterialTheme.colorScheme.onSurface

    Column(
        modifier = Modifier
            .width(64.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp)
            .testTag(testTag),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = codeLabel,
            tint = contentColor,
            modifier = Modifier.size(20.dp)
        )
        Text(
            text = codeLabel,
            style = MaterialTheme.typography.labelSmall,
            fontFamily = JetBrainsMonoFontFamily,
            fontWeight = FontWeight.Bold,
            color = contentColor
        )
    }
}
