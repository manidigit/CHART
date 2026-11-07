package es.manico.chartintelligence.algorithms

import es.manico.chartintelligence.data.model.ChartDrawing
import java.math.BigDecimal
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * Independent Algorithm Library Module:
 * Pure geometric hit-testing and coordinate-space translation for market-anchored chart drawings
 * (Horizontal Line, Vertical Line, and two-point Trend Line).
 */
object DrawingGeometryAlgorithm {

    /**
     * Computes perpendicular distance in pixels from point (px, py) to segment (x1, y1)-(x2, y2).
     */
    fun distanceToSegmentPx(
        px: Float,
        py: Float,
        x1: Float,
        y1: Float,
        x2: Float,
        y2: Float
    ): Float {
        val dx = x2 - x1
        val dy = y2 - y1
        val lengthSq = dx * dx + dy * dy
        if (lengthSq < 1e-4f) {
            return hypot(px - x1, py - y1)
        }
        val t = (((px - x1) * dx + (py - y1) * dy) / lengthSq).coerceIn(0f, 1f)
        val projX = x1 + t * dx
        val projY = y1 + t * dy
        return hypot(px - projX, py - projY)
    }

    /**
     * Finds the topmost drawing within [hitTolerancePx] of the tap point (tapX, tapY).
     */
    fun hitTestDrawing(
        drawings: List<ChartDrawing>,
        tapX: Float,
        tapY: Float,
        timeToX: (Long) -> Float,
        priceToY: (Double) -> Float,
        hitTolerancePx: Float = 24f
    ): ChartDrawing? {
        for (drawing in drawings.asReversed()) {
            val distance = when (drawing) {
                is ChartDrawing.HorizontalLine -> {
                    val y = priceToY(drawing.price.toDouble())
                    abs(tapY - y)
                }
                is ChartDrawing.VerticalLine -> {
                    val x = timeToX(drawing.timeUtcMillis)
                    abs(tapX - x)
                }
                is ChartDrawing.TrendLine -> {
                    val x1 = timeToX(drawing.startTimeUtcMillis)
                    val y1 = priceToY(drawing.startPrice.toDouble())
                    val x2 = timeToX(drawing.endTimeUtcMillis)
                    val y2 = priceToY(drawing.endPrice.toDouble())
                    distanceToSegmentPx(tapX, tapY, x1, y1, x2, y2)
                }
            }
            if (distance <= hitTolerancePx) {
                return drawing
            }
        }
        return null
    }

    /**
     * Translates a drawing in market coordinates (deltaTimeMillis, deltaPrice) while preserving
     * DECIMAL(18, 8) precision.
     */
    fun translateDrawing(
        drawing: ChartDrawing,
        deltaTimeMillis: Long,
        deltaPrice: BigDecimal
    ): ChartDrawing {
        return when (drawing) {
            is ChartDrawing.HorizontalLine -> {
                val nextPrice = CandleValidatorAlgorithm.normalizeDecimal(
                    drawing.price.add(deltaPrice).max(BigDecimal("0.00000001"))
                )
                drawing.copy(price = nextPrice)
            }
            is ChartDrawing.VerticalLine -> {
                val nextTime = max(0L, drawing.timeUtcMillis + deltaTimeMillis)
                drawing.copy(timeUtcMillis = nextTime)
            }
            is ChartDrawing.TrendLine -> {
                val nextStartPrice = CandleValidatorAlgorithm.normalizeDecimal(
                    drawing.startPrice.add(deltaPrice).max(BigDecimal("0.00000001"))
                )
                val nextEndPrice = CandleValidatorAlgorithm.normalizeDecimal(
                    drawing.endPrice.add(deltaPrice).max(BigDecimal("0.00000001"))
                )
                drawing.copy(
                    startTimeUtcMillis = max(0L, drawing.startTimeUtcMillis + deltaTimeMillis),
                    startPrice = nextStartPrice,
                    endTimeUtcMillis = max(0L, drawing.endTimeUtcMillis + deltaTimeMillis),
                    endPrice = nextEndPrice
                )
            }
        }
    }

    /**
     * Interpolates X pixel position for any arbitrary UTC timestamp relative to the visible candle slice.
     * Supports timestamps inside, before, or after the visible slice using the timeframe step.
     */
    fun timeUtcToCanvasX(
        timeUtcMillis: Long,
        visibleTimestamps: List<Long>,
        timeframeStepMillis: Long,
        canvasWidth: Float
    ): Float {
        if (visibleTimestamps.isEmpty() || canvasWidth <= 0f) return 0f
        val count = visibleTimestamps.size
        val slotW = canvasWidth / count.toFloat()

        val exactIdx = visibleTimestamps.binarySearch(timeUtcMillis)
        if (exactIdx >= 0) {
            return (exactIdx + 0.5f) * slotW
        }

        val insertionPoint = -exactIdx - 1
        val step = max(1L, timeframeStepMillis).toFloat()
        return when {
            insertionPoint == 0 -> {
                val firstTime = visibleTimestamps.first()
                val diffSlots = (timeUtcMillis - firstTime).toFloat() / step
                (0.5f + diffSlots) * slotW
            }
            insertionPoint >= count -> {
                val lastTime = visibleTimestamps.last()
                val diffSlots = (timeUtcMillis - lastTime).toFloat() / step
                (count - 0.5f + diffSlots) * slotW
            }
            else -> {
                val prevIdx = insertionPoint - 1
                val prevTime = visibleTimestamps[prevIdx]
                val nextTime = visibleTimestamps[insertionPoint]
                val span = max(1L, nextTime - prevTime).toFloat()
                val frac = (timeUtcMillis - prevTime).toFloat() / span
                (prevIdx + 0.5f + frac) * slotW
            }
        }
    }

    /**
     * Converts a canvas X coordinate back to the nearest candle open UTC timestamp.
     */
    fun canvasXToTimeUtc(
        x: Float,
        visibleTimestamps: List<Long>,
        timeframeStepMillis: Long,
        canvasWidth: Float
    ): Long {
        if (visibleTimestamps.isEmpty() || canvasWidth <= 0f) return 0L
        val slotW = (canvasWidth / visibleTimestamps.size.toFloat()).coerceAtLeast(1f)
        val idx = (x / slotW).toInt().coerceIn(0, visibleTimestamps.lastIndex)
        return UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(
            visibleTimestamps[idx],
            when (timeframeStepMillis) {
                24L * 60L * 60L * 1000L -> "D1"
                4L * 60L * 60L * 1000L -> "H4"
                60L * 60L * 1000L -> "H1"
                else -> "M15"
            }
        )
    }
}
