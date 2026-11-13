package es.manico.chartintelligence.ui.components

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import es.manico.chartintelligence.algorithms.AdxDmiPoint
import es.manico.chartintelligence.algorithms.BandPoint
import es.manico.chartintelligence.algorithms.IchimokuResult
import es.manico.chartintelligence.algorithms.KillzoneSession
import es.manico.chartintelligence.algorithms.Phase2IndicatorsAlgorithm
import es.manico.chartintelligence.algorithms.PsarPoint
import es.manico.chartintelligence.algorithms.StochPoint
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartTabState
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Modular Compose Canvas renderers for Phase 2 Indicators (§2.2) and Killzones (§2.3).
 */
object Phase2IndicatorRenderer {

    fun drawKillzonesOverlay(
        scope: DrawScope,
        visibleSlice: List<CandleBar>,
        timeframe: String,
        slotW: Float,
        pricePaneH: Float
    ) {
        val tfUpper = timeframe.uppercase()
        if (tfUpper == "D1" || tfUpper == "W1") return
        with(scope) {
            visibleSlice.forEachIndexed { idx, candle ->
                val kz = Phase2IndicatorsAlgorithm.classifyKillzone(candle.openTimeUtcMillis) ?: return@forEachIndexed
                val fillColor = when (kz) {
                    KillzoneSession.OVERLAP -> Color(0xFFA855F7).copy(alpha = 0.11f)
                    KillzoneSession.LONDON -> Color(0xFF3B82F6).copy(alpha = 0.07f)
                    KillzoneSession.NEW_YORK -> Color(0xFFF59E0B).copy(alpha = 0.07f)
                    KillzoneSession.ASIA -> Color(0xFF06B6D4).copy(alpha = 0.06f)
                }
                drawRect(
                    color = fillColor,
                    topLeft = Offset(idx * slotW, 0f),
                    size = Size(slotW + 0.5f, pricePaneH)
                )
            }
        }
    }

    fun drawBandOverlay(
        scope: DrawScope,
        visibleBands: List<BandPoint?>,
        slotW: Float,
        priceToY: (Double) -> Float,
        lineColor: Color,
        fillAlpha: Float,
        dashEffect: PathEffect
    ) {
        if (visibleBands.isEmpty()) return
        with(scope) {
            val upperPath = Path()
            val lowerPath = Path()
            val midPath = Path()
            val fillPath = Path()
            var firstIdx = -1
            var count = 0
            visibleBands.forEachIndexed { idx, band ->
                if (band != null) {
                    val x = (idx + 0.5f) * slotW
                    val uY = priceToY(band.upper)
                    val lY = priceToY(band.lower)
                    val mY = priceToY(band.middle)
                    if (firstIdx == -1) {
                        firstIdx = idx
                        upperPath.moveTo(x, uY)
                        lowerPath.moveTo(x, lY)
                        midPath.moveTo(x, mY)
                        fillPath.moveTo(x, uY)
                    } else {
                        upperPath.lineTo(x, uY)
                        lowerPath.lineTo(x, lY)
                        midPath.lineTo(x, mY)
                        fillPath.lineTo(x, uY)
                    }
                    count++
                }
            }
            if (count >= 2) {
                if (fillAlpha > 0f) {
                    for (idx in visibleBands.lastIndex downTo firstIdx) {
                        val band = visibleBands[idx] ?: continue
                        val x = (idx + 0.5f) * slotW
                        fillPath.lineTo(x, priceToY(band.lower))
                    }
                    fillPath.close()
                    drawPath(path = fillPath, color = lineColor.copy(alpha = fillAlpha))
                }
                drawPath(path = upperPath, color = lineColor.copy(alpha = 0.85f), style = Stroke(width = 1.4f))
                drawPath(path = lowerPath, color = lineColor.copy(alpha = 0.85f), style = Stroke(width = 1.4f))
                drawPath(
                    path = midPath,
                    color = lineColor.copy(alpha = 0.7f),
                    style = Stroke(width = 1.2f, pathEffect = dashEffect)
                )
            }
        }
    }

    fun drawIchimokuOverlay(
        scope: DrawScope,
        ichimoku: IchimokuResult,
        startIndex: Int,
        visibleCount: Int,
        slotW: Float,
        priceToY: (Double) -> Float,
        dashEffect: PathEffect
    ) {
        if (visibleCount <= 0) return
        with(scope) {
            for (idx in 1 until visibleCount) {
                val gPrev = startIndex + idx - 1
                val gCur = startIndex + idx
                val a0 = ichimoku.senkouA.getOrNull(gPrev)
                val b0 = ichimoku.senkouB.getOrNull(gPrev)
                val a1 = ichimoku.senkouA.getOrNull(gCur)
                val b1 = ichimoku.senkouB.getOrNull(gCur)
                if (a0 != null && b0 != null && a1 != null && b1 != null) {
                    val x0 = (idx - 0.5f) * slotW
                    val x1 = (idx + 0.5f) * slotW
                    val cloudPath = Path().apply {
                        moveTo(x0, priceToY(a0))
                        lineTo(x1, priceToY(a1))
                        lineTo(x1, priceToY(b1))
                        lineTo(x0, priceToY(b0))
                        close()
                    }
                    val fillColor = if (a1 >= b1) Color(0xFF26A69A).copy(alpha = 0.14f)
                    else Color(0xFFEF5350).copy(alpha = 0.14f)
                    drawPath(path = cloudPath, color = fillColor)
                }
            }

            fun drawSub(series: List<Double?>, color: Color, width: Float, dashed: Boolean = false) {
                val p = Path()
                var started = false
                for (idx in 0 until visibleCount) {
                    val v = series.getOrNull(startIndex + idx) ?: continue
                    val x = (idx + 0.5f) * slotW
                    val y = priceToY(v)
                    if (!started) {
                        p.moveTo(x, y)
                        started = true
                    } else {
                        p.lineTo(x, y)
                    }
                }
                if (started) {
                    drawPath(
                        path = p,
                        color = color,
                        style = Stroke(width = width, pathEffect = if (dashed) dashEffect else null)
                    )
                }
            }

            drawSub(ichimoku.tenkan, Color(0xFF2962FF), 1.4f)
            drawSub(ichimoku.kijun, Color(0xFFEF5350), 1.5f)
            drawSub(ichimoku.senkouA, Color(0xFF26A69A).copy(alpha = 0.85f), 1.2f)
            drawSub(ichimoku.senkouB, Color(0xFFEF5350).copy(alpha = 0.85f), 1.2f)
            drawSub(ichimoku.chikou, Color(0xFF14B8A6).copy(alpha = 0.78f), 1.2f, dashed = true)
        }
    }

    fun drawPsarDots(
        scope: DrawScope,
        visiblePsar: List<PsarPoint?>,
        slotW: Float,
        priceToY: (Double) -> Float
    ) {
        with(scope) {
            val dotR = (slotW * 0.22f).coerceIn(2.0f, 4.2f)
            visiblePsar.forEachIndexed { idx, pt ->
                if (pt != null) {
                    drawCircle(
                        color = if (pt.isUp) Color(0xFF26A69A) else Color(0xFFEF5350),
                        radius = dotR,
                        center = Offset((idx + 0.5f) * slotW, priceToY(pt.sar))
                    )
                }
            }
        }
    }

    fun drawPhase2OscillatorPanes(
        scope: DrawScope,
        tab: ChartTabState,
        startSubPaneTop: Float,
        oscPaneH: Float,
        canvasW: Float,
        slotW: Float,
        bodyW: Float,
        borderColor: Color,
        gridColor: Color,
        dashEffect: PathEffect,
        bullColor: Color,
        bearColor: Color,
        visibleAdx: List<AdxDmiPoint?>,
        visibleStoch: List<StochPoint?>,
        visibleCci: List<Double?>,
        visibleWillR: List<Double?>,
        visibleObv: List<Double>,
        visibleCmf: List<Double?>,
        visibleRoc: List<Double?>
    ) {
        if (oscPaneH <= 8f) return
        var curTop = startSubPaneTop

        fun drawBorder(top: Float) {
            scope.drawLine(
                color = borderColor,
                start = Offset(0f, top),
                end = Offset(canvasW, top),
                strokeWidth = 1.2f
            )
        }

        fun drawSimpleLine(series: List<Double?>, color: Color, yMapper: (Double) -> Float, width: Float = 1.7f) {
            val path = Path()
            var started = false
            series.forEachIndexed { idx, v ->
                if (v != null) {
                    val x = (idx + 0.5f) * slotW
                    val y = yMapper(v)
                    if (!started) {
                        path.moveTo(x, y)
                        started = true
                    } else {
                        path.lineTo(x, y)
                    }
                }
            }
            if (started) {
                scope.drawPath(path = path, color = color, style = Stroke(width = width))
            }
        }

        fun drawAutoScaledLine(series: List<Double?>, color: Color, top: Float) {
            val valid = series.filterNotNull()
            if (valid.isEmpty()) return
            val minV = valid.minOrNull() ?: 0.0
            val maxV = valid.maxOrNull() ?: 1.0
            val span = (maxV - minV).coerceAtLeast(1e-6)
            drawSimpleLine(series, color, { v ->
                val norm = ((v - minV) / span).toFloat().coerceIn(0f, 1f)
                top + oscPaneH - 3f - norm * (oscPaneH - 6f).coerceAtLeast(2f)
            })
        }

        // 1. ADX / DMI (14)
        if (tab.showAdx14) {
            val pTop = curTop
            curTop += oscPaneH
            drawBorder(pTop)
            fun toY(v: Double): Float {
                val c = v.coerceIn(0.0, 100.0).toFloat()
                return pTop + 3f + (1f - c / 100f) * (oscPaneH - 6f).coerceAtLeast(2f)
            }
            val y25 = toY(25.0)
            scope.drawLine(gridColor, Offset(0f, y25), Offset(canvasW, y25), strokeWidth = 1f, pathEffect = dashEffect)
            drawSimpleLine(visibleAdx.map { it?.plusDi }, Color(0xFF26A69A), ::toY, 1.3f)
            drawSimpleLine(visibleAdx.map { it?.minusDi }, Color(0xFFEF5350), ::toY, 1.3f)
            drawSimpleLine(visibleAdx.map { it?.adx }, Color(0xFFF59E0B), ::toY, 1.9f)
        }

        // 2. Stochastic (14, 3, 3)
        if (tab.showStoch14) {
            val pTop = curTop
            curTop += oscPaneH
            drawBorder(pTop)
            fun toY(v: Double): Float {
                val c = v.coerceIn(0.0, 100.0).toFloat()
                return pTop + 3f + (1f - c / 100f) * (oscPaneH - 6f).coerceAtLeast(2f)
            }
            val y80 = toY(80.0)
            val y20 = toY(20.0)
            scope.drawLine(gridColor, Offset(0f, y80), Offset(canvasW, y80), strokeWidth = 1f, pathEffect = dashEffect)
            scope.drawLine(gridColor, Offset(0f, y20), Offset(canvasW, y20), strokeWidth = 1f, pathEffect = dashEffect)
            drawSimpleLine(visibleStoch.map { it?.k }, Color(0xFF06B6D4), ::toY, 1.7f)
            drawSimpleLine(visibleStoch.map { it?.d }, Color(0xFFF59E0B), ::toY, 1.4f)
        }

        // 3. CCI (20)
        if (tab.showCci20) {
            val pTop = curTop
            curTop += oscPaneH
            drawBorder(pTop)
            val maxAbs = max(150.0, visibleCci.filterNotNull().maxOfOrNull { abs(it) } ?: 150.0)
            fun toY(v: Double): Float {
                val norm = (0.5 - v.coerceIn(-maxAbs, maxAbs) / (2.0 * maxAbs)).toFloat()
                return pTop + 3f + norm * (oscPaneH - 6f).coerceAtLeast(2f)
            }
            val y100 = toY(100.0)
            val yN100 = toY(-100.0)
            scope.drawLine(gridColor, Offset(0f, y100), Offset(canvasW, y100), strokeWidth = 1f, pathEffect = dashEffect)
            scope.drawLine(gridColor, Offset(0f, yN100), Offset(canvasW, yN100), strokeWidth = 1f, pathEffect = dashEffect)
            drawSimpleLine(visibleCci, Color(0xFF10B981), ::toY, 1.7f)
        }

        // 4. Williams %R (14)
        if (tab.showWillR14) {
            val pTop = curTop
            curTop += oscPaneH
            drawBorder(pTop)
            fun toY(v: Double): Float {
                val c = (-v).coerceIn(0.0, 100.0).toFloat() / 100f
                return pTop + 3f + c * (oscPaneH - 6f).coerceAtLeast(2f)
            }
            val y20 = toY(-20.0)
            val y80 = toY(-80.0)
            scope.drawLine(gridColor, Offset(0f, y20), Offset(canvasW, y20), strokeWidth = 1f, pathEffect = dashEffect)
            scope.drawLine(gridColor, Offset(0f, y80), Offset(canvasW, y80), strokeWidth = 1f, pathEffect = dashEffect)
            drawSimpleLine(visibleWillR, Color(0xFFEC4899), ::toY, 1.7f)
        }

        // 5. OBV
        if (tab.showObv) {
            val pTop = curTop
            curTop += oscPaneH
            drawBorder(pTop)
            drawAutoScaledLine(visibleObv.map { it }, Color(0xFF3B82F6), pTop)
        }

        // 6. CMF (20)
        if (tab.showCmf20) {
            val pTop = curTop
            curTop += oscPaneH
            drawBorder(pTop)
            val maxAbs = 0.5
            fun toY(v: Double): Float {
                val norm = (0.5 - v.coerceIn(-maxAbs, maxAbs) / (2.0 * maxAbs)).toFloat()
                return pTop + 3f + norm * (oscPaneH - 6f).coerceAtLeast(2f)
            }
            val zeroY = toY(0.0)
            scope.drawLine(gridColor, Offset(0f, zeroY), Offset(canvasW, zeroY), strokeWidth = 1f, pathEffect = dashEffect)
            visibleCmf.forEachIndexed { idx, v ->
                if (v != null) {
                    val x = (idx + 0.5f) * slotW
                    val y = toY(v)
                    scope.drawRect(
                        color = if (v >= 0.0) bullColor.copy(alpha = 0.48f) else bearColor.copy(alpha = 0.48f),
                        topLeft = Offset(x - bodyW / 2f, min(zeroY, y)),
                        size = Size(bodyW, abs(y - zeroY).coerceAtLeast(1.5f))
                    )
                }
            }
            drawSimpleLine(visibleCmf, Color(0xFF22C55E), ::toY, 1.5f)
        }

        // 7. ROC (12)
        if (tab.showRoc12) {
            val pTop = curTop
            curTop += oscPaneH
            drawBorder(pTop)
            val maxAbs = max(1.0, visibleRoc.filterNotNull().maxOfOrNull { abs(it) } ?: 1.0)
            fun toY(v: Double): Float {
                val norm = (0.5 - v.coerceIn(-maxAbs, maxAbs) / (2.0 * maxAbs)).toFloat()
                return pTop + 3f + norm * (oscPaneH - 6f).coerceAtLeast(2f)
            }
            val zeroY = toY(0.0)
            scope.drawLine(gridColor, Offset(0f, zeroY), Offset(canvasW, zeroY), strokeWidth = 1f, pathEffect = dashEffect)
            drawSimpleLine(visibleRoc, Color(0xFFEAB308), ::toY, 1.7f)
        }
    }
}
