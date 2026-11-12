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
import androidx.compose.foundation.layout.navigationBarsPadding
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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
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

@Composable
fun FibSymbolIcon(tint: Color, modifier: Modifier = Modifier) {
    androidx.compose.foundation.Canvas(modifier = modifier.size(16.dp)) {
        val w = size.width
        val h = size.height
        drawLine(tint.copy(alpha = 0.55f), Offset(1f, h * 0.15f), Offset(w - 1f, h * 0.15f), strokeWidth = 1.4f)
        drawLine(Color(0xFFF59E0B), Offset(1f, h * 0.42f), Offset(w - 1f, h * 0.42f), strokeWidth = 2.0f)
        drawLine(Color(0xFFF59E0B), Offset(1f, h * 0.65f), Offset(w - 1f, h * 0.65f), strokeWidth = 2.0f)
        drawLine(tint.copy(alpha = 0.55f), Offset(1f, h * 0.88f), Offset(w - 1f, h * 0.88f), strokeWidth = 1.4f)
        drawLine(tint, Offset(2f, h * 0.88f), Offset(w - 2f, h * 0.15f), strokeWidth = 1.8f)
    }
}

@Composable
fun LongPositionSymbolIcon(modifier: Modifier = Modifier) {
    androidx.compose.foundation.Canvas(modifier = modifier.size(16.dp)) {
        val w = size.width
        val h = size.height
        drawRect(Color(0xFF26A69A), topLeft = Offset(1f, 1f), size = Size(w - 2f, h * 0.52f))
        drawRect(Color(0xFFEF5350), topLeft = Offset(1f, h * 0.52f), size = Size(w - 2f, h * 0.44f))
        drawLine(Color.White, Offset(0f, h * 0.52f), Offset(w, h * 0.52f), strokeWidth = 1.5f)
    }
}

@Composable
fun ShortPositionSymbolIcon(modifier: Modifier = Modifier) {
    androidx.compose.foundation.Canvas(modifier = modifier.size(16.dp)) {
        val w = size.width
        val h = size.height
        drawRect(Color(0xFFEF5350), topLeft = Offset(1f, 1f), size = Size(w - 2f, h * 0.44f))
        drawRect(Color(0xFF26A69A), topLeft = Offset(1f, h * 0.44f), size = Size(w - 2f, h * 0.52f))
        drawLine(Color.White, Offset(0f, h * 0.44f), Offset(w, h * 0.44f), strokeWidth = 1.5f)
    }
}

@Composable
fun MagnetSymbolIcon(tint: Color, modifier: Modifier = Modifier) {
    androidx.compose.foundation.Canvas(modifier = modifier.size(16.dp)) {
        val stroke = Stroke(width = 2.4f, cap = StrokeCap.Round)
        val path = Path().apply {
            moveTo(size.width * 0.2f, size.height * 0.2f)
            lineTo(size.width * 0.2f, size.height * 0.6f)
            cubicTo(
                size.width * 0.2f, size.height * 0.95f,
                size.width * 0.8f, size.height * 0.95f,
                size.width * 0.8f, size.height * 0.6f
            )
            lineTo(size.width * 0.8f, size.height * 0.2f)
        }
        drawPath(path = path, color = tint, style = stroke)
        drawLine(
            color = Color(0xFFEF5350),
            start = Offset(size.width * 0.12f, size.height * 0.2f),
            end = Offset(size.width * 0.28f, size.height * 0.2f),
            strokeWidth = 3f
        )
        drawLine(
            color = Color(0xFF2962FF),
            start = Offset(size.width * 0.72f, size.height * 0.2f),
            end = Offset(size.width * 0.88f, size.height * 0.2f),
            strokeWidth = 3f
        )
    }
}

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
    isMagnetMode: Boolean = false,
    onSelectTool: (DrawingTool) -> Unit,
    onToggleMagnetMode: () -> Unit = {},
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

            // Compact Floating Quick-Action Icon Pill when an active tool, magnet mode or selected drawing is in use
            if (isToolActive || totalDrawingsCount > 0 || isMagnetMode) {
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
                        icon = Icons.Outlined.Timeline,
                        contentDescription = stringResource(R.string.draw_tool_trend),
                        selected = activeTool == DrawingTool.TREND_LINE,
                        onClick = { onSelectTool(DrawingTool.TREND_LINE) },
                        testTag = "draw_tool_trend_button"
                    )
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(if (activeTool == DrawingTool.FIB_RETRACEMENT) MaterialTheme.colorScheme.primary.copy(alpha = 0.22f) else Color.Transparent)
                            .clickable { onSelectTool(DrawingTool.FIB_RETRACEMENT) }
                            .testTag("draw_tool_fib_button"),
                        contentAlignment = Alignment.Center
                    ) {
                        FibSymbolIcon(
                            tint = if (activeTool == DrawingTool.FIB_RETRACEMENT) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(if (activeTool == DrawingTool.LONG_POSITION) Color(0xFF26A69A).copy(alpha = 0.22f) else Color.Transparent)
                            .clickable { onSelectTool(DrawingTool.LONG_POSITION) }
                            .testTag("draw_tool_long_pos_button"),
                        contentAlignment = Alignment.Center
                    ) {
                        LongPositionSymbolIcon()
                    }
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(if (activeTool == DrawingTool.SHORT_POSITION) Color(0xFFEF5350).copy(alpha = 0.22f) else Color.Transparent)
                            .clickable { onSelectTool(DrawingTool.SHORT_POSITION) }
                            .testTag("draw_tool_short_pos_button"),
                        contentAlignment = Alignment.Center
                    ) {
                        ShortPositionSymbolIcon()
                    }
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

                    // Magnet Mode Toggle Button
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(if (isMagnetMode) MaterialTheme.colorScheme.primary.copy(alpha = 0.24f) else Color.Transparent)
                            .clickable(onClick = onToggleMagnetMode)
                            .testTag("draw_tool_magnet_button"),
                        contentAlignment = Alignment.Center
                    ) {
                        MagnetSymbolIcon(
                            tint = if (isMagnetMode) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

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
                    .navigationBarsPadding()
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
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .clickable(onClick = onToggleCollapsed),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Close,
                            contentDescription = stringResource(R.string.draw_tools_toggle),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }

                // 4-Column Symmetrical Grid of Drawing Tools (Zero Truncation)
                data class SheetDrawEntry(
                    val codeLabel: String,
                    val selected: Boolean,
                    val accentColor: Color? = null,
                    val testTag: String,
                    val onClick: () -> Unit,
                    val icon: ImageVector? = null,
                    val customIcon: (@Composable () -> Unit)? = null
                )

                val sheetEntries = buildList {
                    add(
                        SheetDrawEntry(
                            codeLabel = "Cursor",
                            selected = activeTool == DrawingTool.CURSOR,
                            testTag = "sheet_draw_tool_cursor",
                            onClick = { onSelectTool(DrawingTool.CURSOR); onToggleCollapsed() },
                            icon = Icons.Outlined.AdsClick
                        )
                    )
                    add(
                        SheetDrawEntry(
                            codeLabel = "Trend",
                            selected = activeTool == DrawingTool.TREND_LINE,
                            testTag = "sheet_draw_tool_trend",
                            onClick = { onSelectTool(DrawingTool.TREND_LINE); onToggleCollapsed() },
                            icon = Icons.Outlined.Timeline
                        )
                    )
                    add(
                        SheetDrawEntry(
                            codeLabel = "Fib",
                            selected = activeTool == DrawingTool.FIB_RETRACEMENT,
                            testTag = "sheet_draw_tool_fib",
                            onClick = { onSelectTool(DrawingTool.FIB_RETRACEMENT); onToggleCollapsed() },
                            customIcon = {
                                FibSymbolIcon(
                                    tint = if (activeTool == DrawingTool.FIB_RETRACEMENT) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                                )
                            }
                        )
                    )
                    add(
                        SheetDrawEntry(
                            codeLabel = "H-Line",
                            selected = activeTool == DrawingTool.HORIZONTAL_LINE,
                            testTag = "sheet_draw_tool_hline",
                            onClick = { onSelectTool(DrawingTool.HORIZONTAL_LINE); onToggleCollapsed() },
                            icon = Icons.Outlined.HorizontalRule
                        )
                    )
                    add(
                        SheetDrawEntry(
                            codeLabel = "V-Line",
                            selected = activeTool == DrawingTool.VERTICAL_LINE,
                            testTag = "sheet_draw_tool_vline",
                            onClick = { onSelectTool(DrawingTool.VERTICAL_LINE); onToggleCollapsed() },
                            icon = Icons.Outlined.VerticalAlignCenter
                        )
                    )
                    add(
                        SheetDrawEntry(
                            codeLabel = "Long",
                            selected = activeTool == DrawingTool.LONG_POSITION,
                            accentColor = Color(0xFF26A69A),
                            testTag = "sheet_draw_tool_long",
                            onClick = { onSelectTool(DrawingTool.LONG_POSITION); onToggleCollapsed() },
                            customIcon = { LongPositionSymbolIcon() }
                        )
                    )
                    add(
                        SheetDrawEntry(
                            codeLabel = "Short",
                            selected = activeTool == DrawingTool.SHORT_POSITION,
                            accentColor = Color(0xFFEF5350),
                            testTag = "sheet_draw_tool_short",
                            onClick = { onSelectTool(DrawingTool.SHORT_POSITION); onToggleCollapsed() },
                            customIcon = { ShortPositionSymbolIcon() }
                        )
                    )
                    add(
                        SheetDrawEntry(
                            codeLabel = "Magnet",
                            selected = isMagnetMode,
                            testTag = "sheet_draw_tool_magnet",
                            onClick = { onToggleMagnetMode() },
                            customIcon = {
                                MagnetSymbolIcon(
                                    tint = if (isMagnetMode) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                                )
                            }
                        )
                    )
                    if (hasSelectedDrawing) {
                        add(
                            SheetDrawEntry(
                                codeLabel = "Delete",
                                selected = false,
                                accentColor = palette.bearCandle,
                                testTag = "sheet_draw_delete_selected",
                                onClick = { onDeleteSelected(); onToggleCollapsed() },
                                icon = Icons.Outlined.DeleteOutline
                            )
                        )
                    }
                    if (totalDrawingsCount > 0) {
                        add(
                            SheetDrawEntry(
                                codeLabel = "Clear ($totalDrawingsCount)",
                                selected = false,
                                accentColor = palette.bearCandle,
                                testTag = "sheet_draw_clear_all",
                                onClick = { onClearAll(); onToggleCollapsed() },
                                icon = Icons.Outlined.DeleteSweep
                            )
                        )
                    }
                }

                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        sheetEntries.chunked(4).forEach { rowItems ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                rowItems.forEach { item ->
                                    if (item.customIcon != null) {
                                        BottomSheetCustomToolItem(
                                            codeLabel = item.codeLabel,
                                            selected = item.selected,
                                            accentColor = item.accentColor,
                                            onClick = item.onClick,
                                            testTag = item.testTag,
                                            modifier = Modifier.weight(1f),
                                            iconContent = item.customIcon
                                        )
                                    } else {
                                        BottomSheetToolItem(
                                            icon = item.icon ?: Icons.Outlined.Edit,
                                            codeLabel = item.codeLabel,
                                            selected = item.selected,
                                            accentColor = item.accentColor,
                                            onClick = item.onClick,
                                            testTag = item.testTag,
                                            modifier = Modifier.weight(1f)
                                        )
                                    }
                                }
                                repeat(4 - rowItems.size) {
                                    Spacer(modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }

                    // Compact Color & Stroke Width Trigger Row (Popup flyouts)
                    var showColorMenu by remember { mutableStateOf(false) }
                    var showWidthMenu by remember { mutableStateOf(false) }

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Color Selector Trigger Button
                        Box(modifier = Modifier.weight(1f)) {
                            val curSwatch = DRAWING_COLOR_SWATCHES.find { it.first.equals(activeDrawingColorHex, ignoreCase = true) }?.second ?: Color(0xFF2962FF)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(MaterialTheme.colorScheme.surfaceVariant)
                                    .border(1.dp, palette.cardBorder, RoundedCornerShape(8.dp))
                                    .clickable { showColorMenu = true }
                                    .padding(horizontal = 12.dp, vertical = 10.dp)
                                    .testTag("draw_color_picker_trigger"),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(18.dp)
                                        .clip(CircleShape)
                                        .background(curSwatch)
                                        .border(1.5.dp, Color.White.copy(alpha = 0.9f), CircleShape)
                                )
                                Text(
                                    text = "COLOR",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }

                            DropdownMenu(
                                expanded = showColorMenu,
                                onDismissRequest = { showColorMenu = false }
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    for ((hex, swatchColor) in DRAWING_COLOR_SWATCHES) {
                                        val isColorSelected = activeDrawingColorHex.equals(hex, ignoreCase = true)
                                        Box(
                                            modifier = Modifier
                                                .size(30.dp)
                                                .clip(CircleShape)
                                                .background(swatchColor)
                                                .border(
                                                    width = if (isColorSelected) 2.5.dp else 1.dp,
                                                    color = if (isColorSelected) Color.White else palette.cardBorder,
                                                    shape = CircleShape
                                                )
                                                .clickable {
                                                    onSelectColorHex(hex)
                                                    showColorMenu = false
                                                }
                                                .testTag("draw_color_${hex.lowercase()}_button")
                                        )
                                    }
                                }
                            }
                        }

                        // Stroke Width Selector Trigger Button
                        Box(modifier = Modifier.weight(1f)) {
                            val curLabel = DRAWING_WIDTH_OPTIONS.find { abs(it.first - activeDrawingWidthDp) < 0.35f }?.second ?: "${activeDrawingWidthDp.toInt()}px"
                            val onSurfaceColor = MaterialTheme.colorScheme.onSurface
                            val primaryColor = MaterialTheme.colorScheme.primary

                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(MaterialTheme.colorScheme.surfaceVariant)
                                    .border(1.dp, palette.cardBorder, RoundedCornerShape(8.dp))
                                    .clickable { showWidthMenu = true }
                                    .padding(horizontal = 12.dp, vertical = 10.dp)
                                    .testTag("draw_width_picker_trigger"),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                androidx.compose.foundation.Canvas(modifier = Modifier.size(width = 24.dp, height = 10.dp)) {
                                    drawLine(
                                        color = onSurfaceColor,
                                        start = Offset(0f, size.height / 2),
                                        end = Offset(size.width, size.height / 2),
                                        strokeWidth = activeDrawingWidthDp * 1.5f,
                                        cap = StrokeCap.Round
                                    )
                                }
                                Text(
                                    text = curLabel,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }

                            DropdownMenu(
                                expanded = showWidthMenu,
                                onDismissRequest = { showWidthMenu = false }
                            ) {
                                for ((widthDp, label) in DRAWING_WIDTH_OPTIONS) {
                                    val isWidthSelected = abs(activeDrawingWidthDp - widthDp) < 0.35f
                                    val strokeColor = if (isWidthSelected) primaryColor else Color.Gray
                                    val textColor = if (isWidthSelected) primaryColor else onSurfaceColor
                                    DropdownMenuItem(
                                        text = {
                                            Row(
                                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                androidx.compose.foundation.Canvas(modifier = Modifier.size(width = 32.dp, height = 12.dp)) {
                                                    drawLine(
                                                        color = strokeColor,
                                                        start = Offset(0f, size.height / 2),
                                                        end = Offset(size.width, size.height / 2),
                                                        strokeWidth = widthDp * 1.5f,
                                                        cap = StrokeCap.Round
                                                    )
                                                }
                                                Text(
                                                    text = label,
                                                    fontFamily = JetBrainsMonoFontFamily,
                                                    fontWeight = if (isWidthSelected) FontWeight.Bold else FontWeight.Normal,
                                                    color = textColor
                                                )
                                            }
                                        },
                                        onClick = {
                                            onSelectWidthDp(widthDp)
                                            showWidthMenu = false
                                        },
                                        modifier = Modifier.testTag("draw_width_${label}_button")
                                    )
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))
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
    modifier: Modifier = Modifier,
    accentColor: Color? = null
) {
    val palette = LocalFinancialPalette.current
    val baseAccent = accentColor ?: MaterialTheme.colorScheme.primary
    val bgColor = if (selected) baseAccent.copy(alpha = 0.18f) else MaterialTheme.colorScheme.surfaceVariant
    val borderColor = if (selected || accentColor != null) baseAccent else palette.cardBorder
    val contentColor = if (selected || accentColor != null) baseAccent else MaterialTheme.colorScheme.onSurface

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 10.dp)
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
            color = contentColor,
            maxLines = 1
        )
    }
}

@Composable
private fun BottomSheetCustomToolItem(
    codeLabel: String,
    selected: Boolean,
    onClick: () -> Unit,
    testTag: String,
    modifier: Modifier = Modifier,
    accentColor: Color? = null,
    iconContent: @Composable () -> Unit
) {
    val palette = LocalFinancialPalette.current
    val baseAccent = accentColor ?: MaterialTheme.colorScheme.primary
    val bgColor = if (selected) baseAccent.copy(alpha = 0.18f) else MaterialTheme.colorScheme.surfaceVariant
    val borderColor = if (selected || accentColor != null) baseAccent else palette.cardBorder
    val contentColor = if (selected || accentColor != null) baseAccent else MaterialTheme.colorScheme.onSurface

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 10.dp)
            .testTag(testTag),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Box(
            modifier = Modifier.size(20.dp),
            contentAlignment = Alignment.Center
        ) {
            iconContent()
        }
        Text(
            text = codeLabel,
            style = MaterialTheme.typography.labelSmall,
            fontFamily = JetBrainsMonoFontFamily,
            fontWeight = FontWeight.Bold,
            color = contentColor,
            maxLines = 1
        )
    }
}


