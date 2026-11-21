package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.Layers
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.LockOpen
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.data.model.ChartDrawing
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.DrawingTool
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

data class ActiveIndicatorLayer(
    val id: String,
    val label: String,
    val categoryLabel: String,
    val color: Color,
    val onDisable: () -> Unit
)

/**
 * UI-02 Advanced Object Tree BottomSheet Content:
 * Lists all market-anchored Chart Drawings (with Select, Visibility, Lock, Delete & bulk controls)
 * and all Active Indicators / Overlays (with instant one-tap disable).
 */
@Composable
fun ObjectTreeSheetContent(
    tab: ChartTabState,
    activeIndicators: List<ActiveIndicatorLayer>,
    onSelectDrawing: (String?) -> Unit,
    onToggleDrawingVisibility: (String) -> Unit,
    onToggleDrawingLock: (String) -> Unit,
    onDeleteDrawing: (String) -> Unit,
    onSetAllDrawingsVisibility: (Boolean) -> Unit,
    onClearUnlockedDrawings: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current
    val scrollState = rememberScrollState()
    val allHidden = tab.drawings.isNotEmpty() && tab.drawings.none { it.visible }
    val hasUnlockedDrawings = tab.drawings.any { !it.locked }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(max = 560.dp)
            .verticalScroll(scrollState)
            .testTag("object_tree_sheet_content"),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Sheet Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
            ) {
                Icon(
                    imageVector = Icons.Outlined.Layers,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(8.dp).size(20.dp)
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.object_tree_title),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "${tab.symbolCode} · ${PriceFormatterAlgorithm.displayTimeframeLabel(tab.timeframe)}",
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = JetBrainsMonoFontFamily,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = MaterialTheme.colorScheme.surfaceContainerHigh
            ) {
                Text(
                    text = "${tab.drawings.size + activeIndicators.size}",
                    style = MaterialTheme.typography.labelMedium,
                    fontFamily = JetBrainsMonoFontFamily,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                )
            }
        }

        // Section 1: Chart Drawings
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = stringResource(R.string.object_tree_section_drawings),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                ) {
                    Text(
                        text = tab.drawings.size.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp)
                    )
                }
            }

            if (tab.drawings.isNotEmpty()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    TextButton(
                        onClick = { onSetAllDrawingsVisibility(allHidden) },
                        modifier = Modifier
                            .minimumInteractiveComponentSize()
                            .testTag("object_tree_toggle_all_visible")
                    ) {
                        Icon(
                            imageVector = if (allHidden) Icons.Outlined.Visibility else Icons.Outlined.VisibilityOff,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.size(4.dp))
                        Text(
                            text = stringResource(if (allHidden) R.string.object_tree_show_all else R.string.object_tree_hide_all),
                            style = MaterialTheme.typography.labelMedium
                        )
                    }
                    if (hasUnlockedDrawings) {
                        TextButton(
                            onClick = onClearUnlockedDrawings,
                            modifier = Modifier
                                .minimumInteractiveComponentSize()
                                .testTag("object_tree_clear_unlocked")
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.DeleteSweep,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.size(4.dp))
                            Text(
                                text = stringResource(R.string.object_tree_clear_unlocked),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            }
        }

        if (tab.drawings.isEmpty()) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceContainerLow
            ) {
                Text(
                    text = stringResource(R.string.object_tree_empty_drawings),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(14.dp)
                )
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                tab.drawings.asReversed().forEach { drawing ->
                    val isSelected = drawing.id == tab.selectedDrawingId
                    val swatchColor = parseObjectTreeColor(drawing.colorHex, MaterialTheme.colorScheme.primary)
                    val title = drawingDisplayTitle(drawing)
                    val detail = drawingDisplayDetail(drawing, tab.decimals)

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                if (isSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                                else MaterialTheme.colorScheme.surfaceContainerLow
                            )
                            .border(
                                width = 1.dp,
                                color = if (isSelected) MaterialTheme.colorScheme.primary else palette.cardBorder,
                                shape = RoundedCornerShape(12.dp)
                            )
                            .clickable {
                                onSelectDrawing(if (isSelected) null else drawing.id)
                                if (!isSelected && drawing.visible) onDismiss()
                            }
                            .padding(start = 12.dp, end = 4.dp, top = 6.dp, bottom = 6.dp)
                            .alpha(if (drawing.visible) 1f else 0.58f)
                            .testTag("object_tree_drawing_row_${drawing.id}"),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(swatchColor)
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(
                                    text = title,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                if (!drawing.visible) {
                                    ObjectTreeStatusBadge(
                                        text = stringResource(R.string.object_tree_badge_hidden),
                                        containerColor = MaterialTheme.colorScheme.surfaceContainerHighest,
                                        contentColor = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                if (drawing.locked) {
                                    ObjectTreeStatusBadge(
                                        text = stringResource(R.string.object_tree_badge_locked),
                                        containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                                        contentColor = MaterialTheme.colorScheme.onTertiaryContainer
                                    )
                                }
                            }
                            Text(
                                text = detail,
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }

                        IconButton(
                            onClick = { onToggleDrawingVisibility(drawing.id) },
                            modifier = Modifier
                                .minimumInteractiveComponentSize()
                                .testTag("object_tree_vis_${drawing.id}")
                        ) {
                            Icon(
                                imageVector = if (drawing.visible) Icons.Outlined.Visibility else Icons.Outlined.VisibilityOff,
                                contentDescription = stringResource(
                                    if (drawing.visible) R.string.object_tree_action_hide else R.string.object_tree_action_show
                                ),
                                tint = if (drawing.visible) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        IconButton(
                            onClick = { onToggleDrawingLock(drawing.id) },
                            modifier = Modifier
                                .minimumInteractiveComponentSize()
                                .testTag("object_tree_lock_${drawing.id}")
                        ) {
                            Icon(
                                imageVector = if (drawing.locked) Icons.Outlined.Lock else Icons.Outlined.LockOpen,
                                contentDescription = stringResource(
                                    if (drawing.locked) R.string.object_tree_action_unlock else R.string.object_tree_action_lock
                                ),
                                tint = if (drawing.locked) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        IconButton(
                            onClick = { onDeleteDrawing(drawing.id) },
                            modifier = Modifier
                                .minimumInteractiveComponentSize()
                                .testTag("object_tree_del_${drawing.id}")
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.DeleteOutline,
                                contentDescription = stringResource(R.string.object_tree_action_delete),
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
            }
        }

        HorizontalDivider(color = palette.cardBorder)

        // Section 2: Active Indicators & Overlays
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                text = stringResource(R.string.object_tree_section_indicators),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = MaterialTheme.colorScheme.secondaryContainer
            ) {
                Text(
                    text = activeIndicators.size.toString(),
                    style = MaterialTheme.typography.labelSmall,
                    fontFamily = JetBrainsMonoFontFamily,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp)
                )
            }
        }

        if (activeIndicators.isEmpty()) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceContainerLow
            ) {
                Text(
                    text = stringResource(R.string.object_tree_empty_indicators),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(14.dp)
                )
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                activeIndicators.forEach { layer ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainerLow)
                            .border(1.dp, palette.cardBorder, RoundedCornerShape(12.dp))
                            .padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp)
                            .testTag("object_tree_ind_row_${layer.id}"),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(layer.color)
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = layer.label,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                text = layer.categoryLabel,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        IconButton(
                            onClick = layer.onDisable,
                            modifier = Modifier
                                .minimumInteractiveComponentSize()
                                .testTag("object_tree_ind_off_${layer.id}")
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.VisibilityOff,
                                contentDescription = stringResource(R.string.object_tree_action_disable_indicator),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(4.dp))
    }
}

@Composable
private fun ObjectTreeStatusBadge(
    text: String,
    containerColor: Color,
    contentColor: Color
) {
    Surface(
        shape = RoundedCornerShape(6.dp),
        color = containerColor
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = contentColor,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp)
        )
    }
}

private fun parseObjectTreeColor(hex: String?, fallback: Color): Color {
    if (hex.isNullOrBlank()) return fallback
    val cleaned = hex.trim().removePrefix("#")
    return runCatching {
        val parsed = when (cleaned.length) {
            6 -> 0xFF000000L or cleaned.toLong(16)
            8 -> cleaned.toLong(16)
            else -> return fallback
        }
        Color(parsed)
    }.getOrDefault(fallback)
}

private fun drawingDisplayTitle(drawing: ChartDrawing): String = when (drawing) {
    is ChartDrawing.HorizontalLine -> "Horizontal Line"
    is ChartDrawing.VerticalLine -> "Vertical Line"
    is ChartDrawing.TrendLine -> "Trend Line"
    is ChartDrawing.FibRetracement -> "Fib Retracement"
    is ChartDrawing.LongPosition -> "Long Position"
    is ChartDrawing.ShortPosition -> "Short Position"
    is ChartDrawing.MultiAnchor -> when (drawing.toolType) {
        DrawingTool.AVWAP -> "Anchored VWAP"
        DrawingTool.REGRESSION_CHANNEL -> "Regression Channel"
        DrawingTool.FRVP -> "Fixed Range VP"
        DrawingTool.GANN_FAN -> "Gann Fan"
        DrawingTool.GANN_BOX -> "Gann Box"
        DrawingTool.PITCHFORK -> "Pitchfork (${drawing.variant})"
        DrawingTool.FIB_TIME_ZONE -> "Fib Time Zone"
        DrawingTool.CYCLIC_LINES -> "Cyclic Lines"
        DrawingTool.FIB_SPEED_FAN -> "Fib Speed Fan"
        DrawingTool.ABCD_PATTERN -> "ABCD Pattern"
        DrawingTool.XABCD_PATTERN -> "XABCD Harmonic"
        DrawingTool.HEAD_SHOULDERS -> "Head & Shoulders"
        else -> drawing.toolType.id
    }
}

private val objectTreeTimeFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneOffset.UTC)

private fun drawingDisplayDetail(drawing: ChartDrawing, decimals: Int): String = when (drawing) {
    is ChartDrawing.HorizontalLine ->
        "@ ${PriceFormatterAlgorithm.formatPrice(drawing.price, decimals)}"
    is ChartDrawing.VerticalLine ->
        "${objectTreeTimeFormatter.format(Instant.ofEpochMilli(drawing.timeUtcMillis))} UTC"
    is ChartDrawing.TrendLine ->
        "${PriceFormatterAlgorithm.formatPrice(drawing.startPrice, decimals)} → ${PriceFormatterAlgorithm.formatPrice(drawing.endPrice, decimals)}"
    is ChartDrawing.FibRetracement ->
        "${PriceFormatterAlgorithm.formatPrice(drawing.startPrice, decimals)} ↔ ${PriceFormatterAlgorithm.formatPrice(drawing.endPrice, decimals)}"
    is ChartDrawing.LongPosition ->
        "E ${PriceFormatterAlgorithm.formatPrice(drawing.entryPrice, decimals)} · R:R ${"%.2f".format(drawing.riskRewardRatio)}"
    is ChartDrawing.ShortPosition ->
        "E ${PriceFormatterAlgorithm.formatPrice(drawing.entryPrice, decimals)} · R:R ${"%.2f".format(drawing.riskRewardRatio)}"
    is ChartDrawing.MultiAnchor -> {
        val first = drawing.anchors.firstOrNull()
        val last = drawing.anchors.lastOrNull()
        if (first != null && last != null && drawing.anchors.size >= 2) {
            "${drawing.anchors.size} pts · ${PriceFormatterAlgorithm.formatPrice(first.price, decimals)} → ${PriceFormatterAlgorithm.formatPrice(last.price, decimals)}"
        } else if (first != null) {
            "1 pt · ${PriceFormatterAlgorithm.formatPrice(first.price, decimals)}"
        } else {
            "0 pts"
        }
    }
}
