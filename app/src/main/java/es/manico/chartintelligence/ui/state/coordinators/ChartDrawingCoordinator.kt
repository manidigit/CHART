package es.manico.chartintelligence.ui.state.coordinators

import es.manico.chartintelligence.algorithms.DrawingGeometryAlgorithm
import es.manico.chartintelligence.data.model.ChartDrawing
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.DrawingAnchor
import es.manico.chartintelligence.data.model.DrawingTool
import es.manico.chartintelligence.data.model.TrendAnchorPoint
import es.manico.chartintelligence.data.repository.WorkspaceRepository
import java.math.BigDecimal
import java.util.UUID

/**
 * Dedicated coordinator for managing interactive chart drawing tools lifecycle:
 * placement, multi-anchor capture, Pitchfork variants, selection, translation, and persistence.
 */
class ChartDrawingCoordinator(private val repository: WorkspaceRepository) {

    fun selectDrawingTool(tab: ChartTabState, tool: DrawingTool): ChartTabState {
        return tab.copy(
            activeDrawingTool = tool,
            pendingTrendPoint = null,
            pendingAnchors = emptyList(),
            isDrawingDockCollapsed = false
        )
    }

    fun placeDrawingAtCoordinate(
        tab: ChartTabState,
        timeUtcMillis: Long,
        price: BigDecimal
    ): ChartTabState {
        return when (tab.activeDrawingTool) {
            DrawingTool.CURSOR -> tab
            DrawingTool.HORIZONTAL_LINE -> {
                val newDrawing = ChartDrawing.HorizontalLine(
                    id = "hl_${UUID.randomUUID()}",
                    price = price,
                    colorHex = tab.activeDrawingColorHex,
                    strokeWidthDp = tab.activeDrawingWidthDp
                )
                val updatedDrawings = tab.drawings + newDrawing
                repository.saveDrawingsForChart(tab.chartId, updatedDrawings)
                tab.copy(
                    drawings = updatedDrawings,
                    selectedDrawingId = newDrawing.id,
                    pendingTrendPoint = null,
                    pendingAnchors = emptyList(),
                    activeDrawingTool = DrawingTool.CURSOR
                )
            }
            DrawingTool.VERTICAL_LINE -> {
                val newDrawing = ChartDrawing.VerticalLine(
                    id = "vl_${UUID.randomUUID()}",
                    timeUtcMillis = timeUtcMillis,
                    colorHex = tab.activeDrawingColorHex,
                    strokeWidthDp = tab.activeDrawingWidthDp
                )
                val updatedDrawings = tab.drawings + newDrawing
                repository.saveDrawingsForChart(tab.chartId, updatedDrawings)
                tab.copy(
                    drawings = updatedDrawings,
                    selectedDrawingId = newDrawing.id,
                    pendingTrendPoint = null,
                    pendingAnchors = emptyList(),
                    activeDrawingTool = DrawingTool.CURSOR
                )
            }
            DrawingTool.TREND_LINE -> {
                if (tab.pendingTrendPoint == null) {
                    val anchor = DrawingAnchor(timeUtcMillis = timeUtcMillis, price = price)
                    tab.copy(
                        pendingTrendPoint = TrendAnchorPoint(timeUtcMillis = timeUtcMillis, price = price),
                        pendingAnchors = listOf(anchor)
                    )
                } else {
                    val p1 = tab.pendingTrendPoint
                    val newDrawing = ChartDrawing.TrendLine(
                        id = "tl_${UUID.randomUUID()}",
                        startTimeUtcMillis = p1.timeUtcMillis,
                        startPrice = p1.price,
                        endTimeUtcMillis = timeUtcMillis,
                        endPrice = price,
                        colorHex = tab.activeDrawingColorHex,
                        strokeWidthDp = tab.activeDrawingWidthDp
                    )
                    val updatedDrawings = tab.drawings + newDrawing
                    repository.saveDrawingsForChart(tab.chartId, updatedDrawings)
                    tab.copy(
                        drawings = updatedDrawings,
                        selectedDrawingId = newDrawing.id,
                        pendingTrendPoint = null,
                        pendingAnchors = emptyList(),
                        activeDrawingTool = DrawingTool.CURSOR
                    )
                }
            }
            DrawingTool.FIB_RETRACEMENT -> {
                if (tab.pendingTrendPoint == null) {
                    val anchor = DrawingAnchor(timeUtcMillis = timeUtcMillis, price = price)
                    tab.copy(
                        pendingTrendPoint = TrendAnchorPoint(timeUtcMillis = timeUtcMillis, price = price),
                        pendingAnchors = listOf(anchor)
                    )
                } else {
                    val p1 = tab.pendingTrendPoint
                    val newDrawing = ChartDrawing.FibRetracement(
                        id = "fib_${UUID.randomUUID()}",
                        startTimeUtcMillis = p1.timeUtcMillis,
                        startPrice = p1.price,
                        endTimeUtcMillis = timeUtcMillis,
                        endPrice = price,
                        colorHex = tab.activeDrawingColorHex,
                        strokeWidthDp = tab.activeDrawingWidthDp
                    )
                    val updatedDrawings = tab.drawings + newDrawing
                    repository.saveDrawingsForChart(tab.chartId, updatedDrawings)
                    tab.copy(
                        drawings = updatedDrawings,
                        selectedDrawingId = newDrawing.id,
                        pendingTrendPoint = null,
                        pendingAnchors = emptyList(),
                        activeDrawingTool = DrawingTool.CURSOR
                    )
                }
            }
            DrawingTool.LONG_POSITION -> {
                val stepMs = es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm.timeframeStepMillis(tab.timeframe)
                val target = es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm.normalizeDecimal(
                    price.multiply(BigDecimal("1.02"))
                )
                val stop = es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm.normalizeDecimal(
                    price.multiply(BigDecimal("0.99"))
                )
                val newDrawing = ChartDrawing.LongPosition(
                    id = "long_${UUID.randomUUID()}",
                    startTimeUtcMillis = timeUtcMillis,
                    endTimeUtcMillis = timeUtcMillis + (16L * stepMs),
                    entryPrice = price,
                    targetPrice = target,
                    stopPrice = stop,
                    colorHex = tab.activeDrawingColorHex,
                    strokeWidthDp = tab.activeDrawingWidthDp
                )
                val updatedDrawings = tab.drawings + newDrawing
                repository.saveDrawingsForChart(tab.chartId, updatedDrawings)
                tab.copy(
                    drawings = updatedDrawings,
                    selectedDrawingId = newDrawing.id,
                    pendingTrendPoint = null,
                    pendingAnchors = emptyList(),
                    activeDrawingTool = DrawingTool.CURSOR
                )
            }
            DrawingTool.SHORT_POSITION -> {
                val stepMs = es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm.timeframeStepMillis(tab.timeframe)
                val target = es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm.normalizeDecimal(
                    price.multiply(BigDecimal("0.98"))
                )
                val stop = es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm.normalizeDecimal(
                    price.multiply(BigDecimal("1.01"))
                )
                val newDrawing = ChartDrawing.ShortPosition(
                    id = "short_${UUID.randomUUID()}",
                    startTimeUtcMillis = timeUtcMillis,
                    endTimeUtcMillis = timeUtcMillis + (16L * stepMs),
                    entryPrice = price,
                    targetPrice = target,
                    stopPrice = stop,
                    colorHex = tab.activeDrawingColorHex,
                    strokeWidthDp = tab.activeDrawingWidthDp
                )
                val updatedDrawings = tab.drawings + newDrawing
                repository.saveDrawingsForChart(tab.chartId, updatedDrawings)
                tab.copy(
                    drawings = updatedDrawings,
                    selectedDrawingId = newDrawing.id,
                    pendingTrendPoint = null,
                    pendingAnchors = emptyList(),
                    activeDrawingTool = DrawingTool.CURSOR
                )
            }
            else -> {
                val tool = tab.activeDrawingTool
                val needed = tool.requiredAnchors.coerceAtLeast(1)
                val nextAnchors = tab.pendingAnchors + DrawingAnchor(timeUtcMillis = timeUtcMillis, price = price)
                if (nextAnchors.size < needed) {
                    tab.copy(
                        pendingAnchors = nextAnchors,
                        pendingTrendPoint = nextAnchors.firstOrNull()?.let {
                            TrendAnchorPoint(it.timeUtcMillis, it.price)
                        }
                    )
                } else {
                    val newDrawing = ChartDrawing.MultiAnchor(
                        id = "${tool.id}_${UUID.randomUUID()}",
                        toolType = tool,
                        anchors = nextAnchors,
                        variant = if (tool == DrawingTool.PITCHFORK) tab.pitchforkVariant else "original",
                        colorHex = tab.activeDrawingColorHex,
                        strokeWidthDp = tab.activeDrawingWidthDp
                    )
                    val updatedDrawings = tab.drawings + newDrawing
                    repository.saveDrawingsForChart(tab.chartId, updatedDrawings)
                    tab.copy(
                        drawings = updatedDrawings,
                        selectedDrawingId = newDrawing.id,
                        pendingAnchors = emptyList(),
                        pendingTrendPoint = null,
                        activeDrawingTool = DrawingTool.CURSOR
                    )
                }
            }
        }
    }

    fun setPitchforkVariant(tab: ChartTabState, variant: String): ChartTabState {
        val norm = variant.lowercase()
        val targetId = tab.selectedDrawingId
        val updatedDrawings = if (targetId != null) {
            tab.drawings.map { d ->
                if (d.id == targetId && d is ChartDrawing.MultiAnchor && d.toolType == DrawingTool.PITCHFORK) {
                    d.copy(variant = norm)
                } else {
                    d
                }
            }.also { repository.saveDrawingsForChart(tab.chartId, it) }
        } else {
            tab.drawings
        }
        return tab.copy(
            pitchforkVariant = norm,
            drawings = updatedDrawings
        )
    }

    fun toggleMagnetMode(tab: ChartTabState): ChartTabState {
        return tab.copy(isMagnetMode = !tab.isMagnetMode)
    }

    fun selectDrawing(tab: ChartTabState, drawingId: String?): ChartTabState {
        val selected = tab.drawings.firstOrNull { it.id == drawingId }
        return tab.copy(
            selectedDrawingId = drawingId,
            activeDrawingColorHex = selected?.colorHex ?: tab.activeDrawingColorHex,
            activeDrawingWidthDp = selected?.strokeWidthDp ?: tab.activeDrawingWidthDp,
            isDrawingDockCollapsed = if (drawingId != null) false else tab.isDrawingDockCollapsed
        )
    }

    fun updateActiveDrawingColor(tab: ChartTabState, colorHex: String): ChartTabState {
        val targetId = tab.selectedDrawingId
        val updatedDrawings = if (targetId != null) {
            tab.drawings.map { d ->
                if (d.id != targetId) d else when (d) {
                    is ChartDrawing.HorizontalLine -> d.copy(colorHex = colorHex)
                    is ChartDrawing.VerticalLine -> d.copy(colorHex = colorHex)
                    is ChartDrawing.TrendLine -> d.copy(colorHex = colorHex)
                    is ChartDrawing.FibRetracement -> d.copy(colorHex = colorHex)
                    is ChartDrawing.LongPosition -> d.copy(colorHex = colorHex)
                    is ChartDrawing.ShortPosition -> d.copy(colorHex = colorHex)
                    is ChartDrawing.MultiAnchor -> d.copy(colorHex = colorHex)
                }
            }.also { repository.saveDrawingsForChart(tab.chartId, it) }
        } else {
            tab.drawings
        }
        return tab.copy(
            activeDrawingColorHex = colorHex,
            drawings = updatedDrawings
        )
    }

    fun updateActiveDrawingWidth(tab: ChartTabState, widthDp: Float): ChartTabState {
        val clamped = widthDp.coerceIn(1.0f, 5.0f)
        val targetId = tab.selectedDrawingId
        val updatedDrawings = if (targetId != null) {
            tab.drawings.map { d ->
                if (d.id != targetId) d else when (d) {
                    is ChartDrawing.HorizontalLine -> d.copy(strokeWidthDp = clamped)
                    is ChartDrawing.VerticalLine -> d.copy(strokeWidthDp = clamped)
                    is ChartDrawing.TrendLine -> d.copy(strokeWidthDp = clamped)
                    is ChartDrawing.FibRetracement -> d.copy(strokeWidthDp = clamped)
                    is ChartDrawing.LongPosition -> d.copy(strokeWidthDp = clamped)
                    is ChartDrawing.ShortPosition -> d.copy(strokeWidthDp = clamped)
                    is ChartDrawing.MultiAnchor -> d.copy(strokeWidthDp = clamped)
                }
            }.also { repository.saveDrawingsForChart(tab.chartId, it) }
        } else {
            tab.drawings
        }
        return tab.copy(
            activeDrawingWidthDp = clamped,
            drawings = updatedDrawings
        )
    }

    fun translateSelectedDrawing(
        tab: ChartTabState,
        deltaTimeMillis: Long,
        deltaPrice: BigDecimal
    ): ChartTabState {
        val targetId = tab.selectedDrawingId ?: return tab
        val updatedDrawings = tab.drawings.map { drawing ->
            if (drawing.id == targetId) {
                DrawingGeometryAlgorithm.translateDrawing(drawing, deltaTimeMillis, deltaPrice)
            } else {
                drawing
            }
        }
        repository.saveDrawingsForChart(tab.chartId, updatedDrawings)
        return tab.copy(drawings = updatedDrawings)
    }

    fun deleteSelectedDrawing(tab: ChartTabState): ChartTabState {
        val targetId = tab.selectedDrawingId ?: return tab
        val updatedDrawings = tab.drawings.filterNot { it.id == targetId }
        repository.saveDrawingsForChart(tab.chartId, updatedDrawings)
        return tab.copy(
            drawings = updatedDrawings,
            selectedDrawingId = null
        )
    }

    fun clearAllDrawings(tab: ChartTabState): ChartTabState {
        repository.saveDrawingsForChart(tab.chartId, emptyList())
        return tab.copy(
            drawings = emptyList(),
            selectedDrawingId = null,
            pendingTrendPoint = null,
            pendingAnchors = emptyList()
        )
    }
}
