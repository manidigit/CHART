package es.manico.chartintelligence.ui.state.coordinators

import es.manico.chartintelligence.algorithms.DrawingGeometryAlgorithm
import es.manico.chartintelligence.data.model.ChartDrawing
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.DrawingTool
import es.manico.chartintelligence.data.model.TrendAnchorPoint
import es.manico.chartintelligence.data.repository.WorkspaceRepository
import java.math.BigDecimal
import java.util.UUID

/**
 * Dedicated coordinator for managing interactive chart drawing tools lifecycle:
 * placement, selection, market-coordinate translation, deletion, and local persistence.
 */
class ChartDrawingCoordinator(private val repository: WorkspaceRepository) {

    fun selectDrawingTool(tab: ChartTabState, tool: DrawingTool): ChartTabState {
        return tab.copy(
            activeDrawingTool = tool,
            pendingTrendPoint = null
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
                    price = price
                )
                val updatedDrawings = tab.drawings + newDrawing
                repository.saveDrawingsForChart(tab.chartId, updatedDrawings)
                tab.copy(
                    drawings = updatedDrawings,
                    selectedDrawingId = newDrawing.id,
                    activeDrawingTool = DrawingTool.CURSOR
                )
            }
            DrawingTool.VERTICAL_LINE -> {
                val newDrawing = ChartDrawing.VerticalLine(
                    id = "vl_${UUID.randomUUID()}",
                    timeUtcMillis = timeUtcMillis
                )
                val updatedDrawings = tab.drawings + newDrawing
                repository.saveDrawingsForChart(tab.chartId, updatedDrawings)
                tab.copy(
                    drawings = updatedDrawings,
                    selectedDrawingId = newDrawing.id,
                    activeDrawingTool = DrawingTool.CURSOR
                )
            }
            DrawingTool.TREND_LINE -> {
                if (tab.pendingTrendPoint == null) {
                    tab.copy(
                        pendingTrendPoint = TrendAnchorPoint(
                            timeUtcMillis = timeUtcMillis,
                            price = price
                        )
                    )
                } else {
                    val p1 = tab.pendingTrendPoint
                    val newDrawing = ChartDrawing.TrendLine(
                        id = "tl_${UUID.randomUUID()}",
                        startTimeUtcMillis = p1.timeUtcMillis,
                        startPrice = p1.price,
                        endTimeUtcMillis = timeUtcMillis,
                        endPrice = price
                    )
                    val updatedDrawings = tab.drawings + newDrawing
                    repository.saveDrawingsForChart(tab.chartId, updatedDrawings)
                    tab.copy(
                        drawings = updatedDrawings,
                        selectedDrawingId = newDrawing.id,
                        pendingTrendPoint = null,
                        activeDrawingTool = DrawingTool.CURSOR
                    )
                }
            }
        }
    }

    fun selectDrawing(tab: ChartTabState, drawingId: String?): ChartTabState {
        return tab.copy(selectedDrawingId = drawingId)
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
            pendingTrendPoint = null
        )
    }
}
