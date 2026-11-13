package es.manico.chartintelligence.algorithms

import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartDrawing
import es.manico.chartintelligence.data.model.DrawingAnchor
import es.manico.chartintelligence.data.model.DrawingTool
import java.math.BigDecimal
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

data class RegressionChannelResult(
    val startTimeMs: Long,
    val endTimeMs: Long,
    val midStart: Double,
    val midEnd: Double,
    val stdDev: Double,
    val slope: Double,
    val barCount: Int
)

data class PitchforkHandlePoint(
    val timeUtcMillis: Long,
    val price: Double
)

data class PitchforkGeometry(
    val handle: PitchforkHandlePoint,
    val target: PitchforkHandlePoint,
    val b: PitchforkHandlePoint,
    val c: PitchforkHandlePoint,
    val variant: String
)

data class HarmonicRatios(
    val abXa: Double = 0.0,
    val bcAb: Double = 0.0,
    val cdBc: Double = 0.0,
    val adXa: Double = 0.0
)

/**
 * Independent Algorithm Library Module:
 * Pure geometric hit-testing, coordinate-space translation, and analytical computations
 * for core and Phase 2 multi-anchor market-coordinated chart drawings.
 */
object DrawingGeometryAlgorithm {

    fun computeAnchoredVwap(
        candles: List<CandleBar>,
        anchorTimeUtcMillis: Long
    ): List<Pair<Long, Double>> {
        if (candles.isEmpty()) return emptyList()
        val hasRealVol = candles.any { it.volume.toDouble() > 0.0 }
        val result = ArrayList<Pair<Long, Double>>()
        var cumPv = 0.0
        var cumVol = 0.0
        for (c in candles) {
            if (c.openTimeUtcMillis < anchorTimeUtcMillis) continue
            val tp = (c.high.toDouble() + c.low.toDouble() + c.close.toDouble()) / 3.0
            val rawVol = c.volume.toDouble().coerceAtLeast(0.0)
            val effVol = if (hasRealVol) rawVol else 1.0
            cumPv += tp * effVol
            cumVol += effVol
            if (cumVol > 0.0) {
                result.add(c.openTimeUtcMillis to (cumPv / cumVol))
            }
        }
        return result
    }

    fun computeRegressionChannel(
        candles: List<CandleBar>,
        t1Ms: Long,
        t2Ms: Long,
        fallbackP1: Double,
        fallbackP2: Double
    ): RegressionChannelResult {
        val loT = min(t1Ms, t2Ms)
        val hiT = max(t1Ms, t2Ms)
        val sliced = candles.filter { it.openTimeUtcMillis in loT..hiT }
        if (sliced.size < 2) {
            val leftP = if (t1Ms <= t2Ms) fallbackP1 else fallbackP2
            val rightP = if (t1Ms <= t2Ms) fallbackP2 else fallbackP1
            return RegressionChannelResult(loT, hiT, leftP, rightP, 0.0, 0.0, sliced.size)
        }
        val n = sliced.size
        val meanX = (n - 1).toDouble() / 2.0
        val meanY = sliced.sumOf { it.close.toDouble() } / n.toDouble()
        var num = 0.0
        var den = 0.0
        for (i in 0 until n) {
            val dx = i.toDouble() - meanX
            num += dx * (sliced[i].close.toDouble() - meanY)
            den += dx * dx
        }
        val slope = if (den > 1e-12) num / den else 0.0
        val intercept = meanY - slope * meanX
        var sqErr = 0.0
        for (i in 0 until n) {
            val err = sliced[i].close.toDouble() - (slope * i.toDouble() + intercept)
            sqErr += err * err
        }
        val stdDev = sqrt(sqErr / n.toDouble())
        return RegressionChannelResult(
            startTimeMs = sliced.first().openTimeUtcMillis,
            endTimeMs = sliced.last().openTimeUtcMillis,
            midStart = intercept,
            midEnd = slope * (n - 1).toDouble() + intercept,
            stdDev = stdDev,
            slope = slope,
            barCount = n
        )
    }

    fun gannAngleSpecs(): List<Pair<String, Double>> = listOf(
        "8x1" to 8.0,
        "4x1" to 4.0,
        "3x1" to 3.0,
        "2x1" to 2.0,
        "1x1" to 1.0,
        "1x2" to 0.5,
        "1x3" to (1.0 / 3.0),
        "1x4" to 0.25,
        "1x8" to 0.125
    )

    fun computePitchforkGeometry(
        anchors: List<DrawingAnchor>,
        variant: String = "original"
    ): PitchforkGeometry? {
        if (anchors.size < 3) return null
        val a = anchors[0]
        val b = anchors[1]
        val c = anchors[2]
        val aP = a.price.toDouble()
        val bP = b.price.toDouble()
        val cP = c.price.toDouble()
        val midBc = PitchforkHandlePoint(
            timeUtcMillis = (b.timeUtcMillis + c.timeUtcMillis) / 2L,
            price = (bP + cP) / 2.0
        )
        val normVar = variant.lowercase()
        val handle = when (normVar) {
            "schiff" -> PitchforkHandlePoint(
                timeUtcMillis = a.timeUtcMillis,
                price = (aP + bP) / 2.0
            )
            "mod_schiff", "modified_schiff" -> PitchforkHandlePoint(
                timeUtcMillis = (a.timeUtcMillis + b.timeUtcMillis) / 2L,
                price = (aP + bP) / 2.0
            )
            "inside" -> PitchforkHandlePoint(
                timeUtcMillis = (a.timeUtcMillis + b.timeUtcMillis + c.timeUtcMillis) / 3L,
                price = (aP + bP + cP) / 3.0
            )
            else -> PitchforkHandlePoint(
                timeUtcMillis = a.timeUtcMillis,
                price = aP
            )
        }
        return PitchforkGeometry(
            handle = handle,
            target = midBc,
            b = PitchforkHandlePoint(b.timeUtcMillis, bP),
            c = PitchforkHandlePoint(c.timeUtcMillis, cP),
            variant = normVar
        )
    }

    fun computeFibTimeZones(
        t1Ms: Long,
        t2Ms: Long,
        stepMs: Long
    ): List<Pair<Int, Long>> {
        val rawDt = t2Ms - t1Ms
        val dt = if (abs(rawDt) >= max(1L, stepMs)) rawDt else max(60_000L, stepMs)
        val fibs = listOf(0, 1, 2, 3, 5, 8, 13, 21, 34, 55)
        return fibs.map { f -> f to (t1Ms + f.toLong() * dt) }
    }

    fun computeHarmonicRatios(anchors: List<DrawingAnchor>): HarmonicRatios {
        if (anchors.size < 4) return HarmonicRatios()
        if (anchors.size == 4) {
            val a = anchors[0].price.toDouble()
            val b = anchors[1].price.toDouble()
            val c = anchors[2].price.toDouble()
            val d = anchors[3].price.toDouble()
            val ab = abs(b - a)
            val bc = abs(c - b)
            val cd = abs(d - c)
            return HarmonicRatios(
                bcAb = if (ab > 1e-9) bc / ab else 0.0,
                cdBc = if (bc > 1e-9) cd / bc else 0.0
            )
        }
        val x = anchors[0].price.toDouble()
        val a = anchors[1].price.toDouble()
        val b = anchors[2].price.toDouble()
        val c = anchors[3].price.toDouble()
        val d = anchors[4].price.toDouble()
        val xa = abs(a - x)
        val ab = abs(b - a)
        val bc = abs(c - b)
        val cd = abs(d - c)
        val ad = abs(d - a)
        return HarmonicRatios(
            abXa = if (xa > 1e-9) ab / xa else 0.0,
            bcAb = if (ab > 1e-9) bc / ab else 0.0,
            cdBc = if (bc > 1e-9) cd / bc else 0.0,
            adXa = if (xa > 1e-9) ad / xa else 0.0
        )
    }

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
                is ChartDrawing.FibRetracement -> {
                    val x1 = timeToX(drawing.startTimeUtcMillis)
                    val y1 = priceToY(drawing.startPrice.toDouble())
                    val x2 = timeToX(drawing.endTimeUtcMillis)
                    val y2 = priceToY(drawing.endPrice.toDouble())
                    val trendDist = distanceToSegmentPx(tapX, tapY, x1, y1, x2, y2)
                    val minX = min(x1, x2) - hitTolerancePx
                    val maxX = max(x1, x2) + hitTolerancePx
                    var minLvlDist = trendDist
                    if (tapX in minX..maxX) {
                        for (lvl in drawing.computeLevels()) {
                            val lvlY = priceToY(lvl.price.toDouble())
                            val dY = abs(tapY - lvlY)
                            if (dY < minLvlDist) minLvlDist = dY
                        }
                    }
                    minLvlDist
                }
                is ChartDrawing.LongPosition -> {
                    val x1 = timeToX(drawing.startTimeUtcMillis)
                    val x2 = timeToX(drawing.endTimeUtcMillis)
                    val yEntry = priceToY(drawing.entryPrice.toDouble())
                    val yTarget = priceToY(drawing.targetPrice.toDouble())
                    val yStop = priceToY(drawing.stopPrice.toDouble())
                    val minX = min(x1, x2)
                    val maxX = max(x1, x2)
                    val minY = minOf(yEntry, yTarget, yStop)
                    val maxY = maxOf(yEntry, yTarget, yStop)
                    if (tapX in (minX - hitTolerancePx)..(maxX + hitTolerancePx) &&
                        tapY in (minY - hitTolerancePx)..(maxY + hitTolerancePx)
                    ) {
                        0f
                    } else {
                        Float.MAX_VALUE
                    }
                }
                is ChartDrawing.ShortPosition -> {
                    val x1 = timeToX(drawing.startTimeUtcMillis)
                    val x2 = timeToX(drawing.endTimeUtcMillis)
                    val yEntry = priceToY(drawing.entryPrice.toDouble())
                    val yTarget = priceToY(drawing.targetPrice.toDouble())
                    val yStop = priceToY(drawing.stopPrice.toDouble())
                    val minX = min(x1, x2)
                    val maxX = max(x1, x2)
                    val minY = minOf(yEntry, yTarget, yStop)
                    val maxY = maxOf(yEntry, yTarget, yStop)
                    if (tapX in (minX - hitTolerancePx)..(maxX + hitTolerancePx) &&
                        tapY in (minY - hitTolerancePx)..(maxY + hitTolerancePx)
                    ) {
                        0f
                    } else {
                        Float.MAX_VALUE
                    }
                }
                is ChartDrawing.MultiAnchor -> {
                    var bestDist = Float.MAX_VALUE
                    val anchors = drawing.anchors
                    for (idx in anchors.indices) {
                        val ax = timeToX(anchors[idx].timeUtcMillis)
                        val ay = priceToY(anchors[idx].price.toDouble())
                        bestDist = min(bestDist, hypot(tapX - ax, tapY - ay))
                        if (idx > 0) {
                            val bx = timeToX(anchors[idx - 1].timeUtcMillis)
                            val by = priceToY(anchors[idx - 1].price.toDouble())
                            bestDist = min(bestDist, distanceToSegmentPx(tapX, tapY, bx, by, ax, ay))
                        }
                    }
                    if (drawing.toolType == DrawingTool.FRVP && anchors.size >= 2) {
                        val x1 = timeToX(anchors[0].timeUtcMillis)
                        val x2 = timeToX(anchors[1].timeUtcMillis)
                        if (tapX in (min(x1, x2) - hitTolerancePx)..(max(x1, x2) + hitTolerancePx)) {
                            bestDist = min(bestDist, hitTolerancePx)
                        }
                    } else if (drawing.toolType == DrawingTool.GANN_BOX && anchors.size >= 2) {
                        val x1 = timeToX(anchors[0].timeUtcMillis)
                        val y1 = priceToY(anchors[0].price.toDouble())
                        val x2 = timeToX(anchors[1].timeUtcMillis)
                        val y2 = priceToY(anchors[1].price.toDouble())
                        if (tapX in (min(x1, x2) - hitTolerancePx)..(max(x1, x2) + hitTolerancePx) &&
                            tapY in (min(y1, y2) - hitTolerancePx)..(max(y1, y2) + hitTolerancePx)
                        ) {
                            bestDist = minOf(bestDist, abs(tapX - x1), abs(tapX - x2), abs(tapY - y1), abs(tapY - y2))
                        }
                    }
                    bestDist
                }
            }
            if (distance <= hitTolerancePx) {
                return drawing
            }
        }
        return null
    }

    /**
     * Magnet Mode snap: Finds the closest price among {Open, High, Low, Close} of the given candle.
     */
    fun snapToCandleOhlc(
        open: BigDecimal,
        high: BigDecimal,
        low: BigDecimal,
        close: BigDecimal,
        rawPrice: BigDecimal
    ): BigDecimal {
        val candidates = listOf(open, high, low, close)
        val best = candidates.minByOrNull { (it.subtract(rawPrice)).abs() } ?: close
        return CandleValidatorAlgorithm.normalizeDecimal(best)
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
            is ChartDrawing.FibRetracement -> {
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
            is ChartDrawing.LongPosition -> {
                val nextEntry = CandleValidatorAlgorithm.normalizeDecimal(
                    drawing.entryPrice.add(deltaPrice).max(BigDecimal("0.00000001"))
                )
                val nextTarget = CandleValidatorAlgorithm.normalizeDecimal(
                    drawing.targetPrice.add(deltaPrice).max(BigDecimal("0.00000001"))
                )
                val nextStop = CandleValidatorAlgorithm.normalizeDecimal(
                    drawing.stopPrice.add(deltaPrice).max(BigDecimal("0.00000001"))
                )
                drawing.copy(
                    startTimeUtcMillis = max(0L, drawing.startTimeUtcMillis + deltaTimeMillis),
                    endTimeUtcMillis = max(0L, drawing.endTimeUtcMillis + deltaTimeMillis),
                    entryPrice = nextEntry,
                    targetPrice = nextTarget,
                    stopPrice = nextStop
                )
            }
            is ChartDrawing.ShortPosition -> {
                val nextEntry = CandleValidatorAlgorithm.normalizeDecimal(
                    drawing.entryPrice.add(deltaPrice).max(BigDecimal("0.00000001"))
                )
                val nextTarget = CandleValidatorAlgorithm.normalizeDecimal(
                    drawing.targetPrice.add(deltaPrice).max(BigDecimal("0.00000001"))
                )
                val nextStop = CandleValidatorAlgorithm.normalizeDecimal(
                    drawing.stopPrice.add(deltaPrice).max(BigDecimal("0.00000001"))
                )
                drawing.copy(
                    startTimeUtcMillis = max(0L, drawing.startTimeUtcMillis + deltaTimeMillis),
                    endTimeUtcMillis = max(0L, drawing.endTimeUtcMillis + deltaTimeMillis),
                    entryPrice = nextEntry,
                    targetPrice = nextTarget,
                    stopPrice = nextStop
                )
            }
            is ChartDrawing.MultiAnchor -> {
                val movedAnchors = drawing.anchors.map { a ->
                    DrawingAnchor(
                        timeUtcMillis = max(0L, a.timeUtcMillis + deltaTimeMillis),
                        price = CandleValidatorAlgorithm.normalizeDecimal(
                            a.price.add(deltaPrice).max(BigDecimal("0.00000001"))
                        )
                    )
                }
                drawing.copy(anchors = movedAnchors)
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
