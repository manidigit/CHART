package es.manico.chartintelligence.ui.components

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import es.manico.chartintelligence.algorithms.DrawingGeometryAlgorithm
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.algorithms.VolumeType
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartDrawing
import es.manico.chartintelligence.data.model.DrawingAnchor
import es.manico.chartintelligence.data.model.DrawingTool
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Modular Compose Canvas renderer for all 12 Phase 2 Multi-Anchor Drawing Tool Families (§2.1)
 * plus live pending-anchor placement previews.
 */
object Phase2DrawingRenderer {

    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.MONOSPACE
        textSize = 24f
        isFakeBoldText = true
    }

    private fun parseColor(hex: String?, fallback: Color): Color {
        if (hex.isNullOrBlank()) return fallback
        return runCatching {
            val clean = hex.trim().removePrefix("#")
            val argb = if (clean.length == 6) "FF$clean" else clean
            Color(argb.toLong(16))
        }.getOrDefault(fallback)
    }

    private fun DrawScope.drawMonoLabel(
        text: String,
        x: Float,
        y: Float,
        color: Color,
        textSizePx: Float = 24f
    ) {
        labelPaint.color = color.toArgb()
        labelPaint.textSize = textSizePx
        drawContext.canvas.nativeCanvas.drawText(text, x, y, labelPaint)
    }

    fun drawMultiAnchorDrawing(
        scope: DrawScope,
        drawing: ChartDrawing.MultiAnchor,
        isSelected: Boolean,
        candles: List<CandleBar>,
        instrumentVolumeType: VolumeType,
        stepMillis: Long,
        canvasW: Float,
        pricePaneH: Float,
        baseStrokeWidth: Float,
        fallbackColor: Color,
        selectedDashEffect: PathEffect,
        timeToX: (Long) -> Float,
        priceToY: (Double) -> Float
    ) {
        val anchors = drawing.anchors
        if (anchors.isEmpty()) return
        val baseColor = parseColor(drawing.colorHex, fallbackColor)
        val lineColor = if (isSelected) Color.White else baseColor
        val strokeW = if (isSelected) baseStrokeWidth + 1.2f else baseStrokeWidth
        val goldColor = Color(0xFFF59E0B)

        with(scope) {
            when (drawing.toolType) {
                DrawingTool.AVWAP -> {
                    val pts = DrawingGeometryAlgorithm.computeAnchoredVwap(
                        candles = candles,
                        anchorTimeUtcMillis = anchors[0].timeUtcMillis
                    )
                    if (pts.isNotEmpty()) {
                        val path = Path()
                        pts.forEachIndexed { idx, (tMs, vwapPrice) ->
                            val x = timeToX(tMs)
                            val y = priceToY(vwapPrice)
                            if (idx == 0) path.moveTo(x, y) else path.lineTo(x, y)
                        }
                        drawPath(path = path, color = lineColor, style = Stroke(width = strokeW + 0.4f))
                        val firstPt = pts.first()
                        drawMonoLabel(
                            text = "AVWAP",
                            x = timeToX(firstPt.first) + 6f,
                            y = (priceToY(firstPt.second) - 8f).coerceAtLeast(24f),
                            color = lineColor
                        )
                    }
                }

                DrawingTool.REGRESSION_CHANNEL -> {
                    if (anchors.size >= 2) {
                        val reg = DrawingGeometryAlgorithm.computeRegressionChannel(
                            candles = candles,
                            t1Ms = anchors[0].timeUtcMillis,
                            t2Ms = anchors[1].timeUtcMillis,
                            fallbackP1 = anchors[0].price.toDouble(),
                            fallbackP2 = anchors[1].price.toDouble()
                        )
                        val x1 = timeToX(reg.startTimeMs)
                        val x2 = timeToX(reg.endTimeMs)
                        val yMid1 = priceToY(reg.midStart)
                        val yMid2 = priceToY(reg.midEnd)
                        val yUp1 = priceToY(reg.midStart + 2.0 * reg.stdDev)
                        val yUp2 = priceToY(reg.midEnd + 2.0 * reg.stdDev)
                        val yDn1 = priceToY(reg.midStart - 2.0 * reg.stdDev)
                        val yDn2 = priceToY(reg.midEnd - 2.0 * reg.stdDev)

                        val fillPath = Path().apply {
                            moveTo(x1, yUp1)
                            lineTo(x2, yUp2)
                            lineTo(x2, yDn2)
                            lineTo(x1, yDn1)
                            close()
                        }
                        drawPath(path = fillPath, color = baseColor.copy(alpha = 0.14f))
                        drawLine(lineColor, Offset(x1, yUp1), Offset(x2, yUp2), strokeWidth = strokeW)
                        drawLine(lineColor, Offset(x1, yDn1), Offset(x2, yDn2), strokeWidth = strokeW)
                        drawLine(
                            color = goldColor,
                            start = Offset(x1, yMid1),
                            end = Offset(x2, yMid2),
                            strokeWidth = strokeW,
                            pathEffect = selectedDashEffect
                        )
                    }
                }

                DrawingTool.FRVP -> {
                    if (anchors.size >= 2) {
                        val loT = min(anchors[0].timeUtcMillis, anchors[1].timeUtcMillis)
                        val hiT = max(anchors[0].timeUtcMillis, anchors[1].timeUtcMillis)
                        val rangeCandles = candles.filter { it.openTimeUtcMillis in loT..hiT }
                        val x1 = timeToX(loT)
                        val x2 = max(x1 + 40f, timeToX(hiT))
                        drawRect(
                            color = baseColor.copy(alpha = 0.07f),
                            topLeft = Offset(x1, 0f),
                            size = Size(x2 - x1, pricePaneH)
                        )
                        drawRect(
                            color = lineColor.copy(alpha = 0.7f),
                            topLeft = Offset(x1, 0f),
                            size = Size(x2 - x1, pricePaneH),
                            style = Stroke(width = 1.4f)
                        )
                        val vp = PriceFormatterAlgorithm.computeVolumeProfile(
                            candles = rangeCandles,
                            numBins = 24,
                            valueAreaRatio = 0.70,
                            volumeType = instrumentVolumeType
                        )
                        if (vp != null) {
                            val maxBarW = max(24f, (x2 - x1) * 0.58f)
                            for (b in vp.bins) {
                                val yT = priceToY(b.high)
                                val yB = priceToY(b.low)
                                val bh = max(1.8f, abs(yB - yT) - 0.8f)
                                val bw = max(2f, b.normWidth * maxBarW)
                                val binCol = when {
                                    b.isPoc -> goldColor.copy(alpha = 0.80f)
                                    b.inValueArea -> Color(0xFF38BDF8).copy(alpha = 0.45f)
                                    else -> Color(0xFF94A3B8).copy(alpha = 0.25f)
                                }
                                drawRect(
                                    color = binCol,
                                    topLeft = Offset(x1, min(yT, yB)),
                                    size = Size(bw, bh)
                                )
                            }
                            val pocY = priceToY(vp.pocPrice)
                            drawLine(
                                color = goldColor,
                                start = Offset(x1, pocY),
                                end = Offset(x2, pocY),
                                strokeWidth = 2.0f
                            )
                            drawMonoLabel("FRVP POC", x1 + 6f, (pocY - 6f).coerceAtLeast(24f), goldColor)
                        }
                    }
                }

                DrawingTool.GANN_FAN -> {
                    if (anchors.size >= 2) {
                        val x1 = timeToX(anchors[0].timeUtcMillis)
                        val y1 = priceToY(anchors[0].price.toDouble())
                        val x2 = timeToX(anchors[1].timeUtcMillis)
                        val y2 = priceToY(anchors[1].price.toDouble())
                        val dx = if (abs(x2 - x1) < 2f) 40f else x2 - x1
                        val dy = y2 - y1
                        val targetEdgeX = if (dx >= 0f) canvasW + 40f else -40f
                        val scaleT = (targetEdgeX - x1) / dx
                        for ((lbl, mult) in DrawingGeometryAlgorithm.gannAngleSpecs()) {
                            val endY = y1 + mult.toFloat() * dy * scaleT
                            val isPrimary = lbl == "1x1"
                            val rayCol = if (isPrimary) goldColor else lineColor
                            drawLine(
                                color = rayCol,
                                start = Offset(x1, y1),
                                end = Offset(targetEdgeX, endY),
                                strokeWidth = if (isPrimary) strokeW + 0.6f else max(1.2f, strokeW - 0.4f)
                            )
                            val lblX = (x1 + (x2 - x1) * 0.9f).coerceIn(8f, max(12f, canvasW - 44f))
                            val lblY = (y1 + mult.toFloat() * dy * 0.9f).coerceIn(22f, max(26f, pricePaneH - 8f))
                            drawMonoLabel(lbl, lblX, lblY, rayCol, 20f)
                        }
                    }
                }

                DrawingTool.GANN_BOX -> {
                    if (anchors.size >= 2) {
                        val x1 = timeToX(anchors[0].timeUtcMillis)
                        val y1 = priceToY(anchors[0].price.toDouble())
                        val x2 = timeToX(anchors[1].timeUtcMillis)
                        val y2 = priceToY(anchors[1].price.toDouble())
                        val minX = min(x1, x2)
                        val maxX = max(x1, x2)
                        val minY = min(y1, y2)
                        val maxY = max(y1, y2)
                        val wBox = maxX - minX
                        val hBox = maxY - minY
                        drawRect(
                            color = Color(0xFFA855F7).copy(alpha = 0.08f),
                            topLeft = Offset(minX, minY),
                            size = Size(wBox, hBox)
                        )
                        val ratios = listOf(0f, 0.25f, 0.382f, 0.5f, 0.618f, 0.75f, 1.0f)
                        for (r in ratios) {
                            val isEdgeOrMid = r == 0f || r == 0.5f || r == 1f
                            val gridCol = if (r == 0.5f) goldColor else lineColor
                            val lw = if (isEdgeOrMid) strokeW else max(1.0f, strokeW * 0.6f)
                            val gy = minY + r * hBox
                            val gx = minX + r * wBox
                            drawLine(gridCol, Offset(minX, gy), Offset(maxX, gy), strokeWidth = lw)
                            drawLine(gridCol, Offset(gx, minY), Offset(gx, maxY), strokeWidth = lw)
                        }
                        drawLine(lineColor, Offset(minX, minY), Offset(maxX, maxY), strokeWidth = 1.5f, pathEffect = selectedDashEffect)
                        drawLine(lineColor, Offset(minX, maxY), Offset(maxX, minY), strokeWidth = 1.5f, pathEffect = selectedDashEffect)
                    }
                }

                DrawingTool.PITCHFORK -> {
                    val pf = DrawingGeometryAlgorithm.computePitchforkGeometry(anchors, drawing.variant)
                    if (pf != null) {
                        val hx = timeToX(pf.handle.timeUtcMillis)
                        val hy = priceToY(pf.handle.price)
                        val tx = timeToX(pf.target.timeUtcMillis)
                        val ty = priceToY(pf.target.price)
                        val bx = timeToX(pf.b.timeUtcMillis)
                        val by = priceToY(pf.b.price)
                        val cx = timeToX(pf.c.timeUtcMillis)
                        val cy = priceToY(pf.c.price)
                        val dx = if (abs(tx - hx) < 1f) 1f else tx - hx
                        val dy = ty - hy
                        val extFactor = max(1.8f, (canvasW - hx) / dx)

                        val chPath = Path().apply {
                            moveTo(bx, by)
                            lineTo(bx + dx * extFactor, by + dy * extFactor)
                            lineTo(cx + dx * extFactor, cy + dy * extFactor)
                            lineTo(cx, cy)
                            close()
                        }
                        drawPath(path = chPath, color = baseColor.copy(alpha = 0.11f))

                        drawLine(lineColor, Offset(hx, hy), Offset(hx + dx * extFactor, hy + dy * extFactor), strokeWidth = strokeW)
                        drawLine(lineColor, Offset(bx, by), Offset(bx + dx * extFactor, by + dy * extFactor), strokeWidth = strokeW)
                        drawLine(lineColor, Offset(cx, cy), Offset(cx + dx * extFactor, cy + dy * extFactor), strokeWidth = strokeW)
                        drawLine(lineColor, Offset(bx, by), Offset(cx, cy), strokeWidth = strokeW)
                        drawMonoLabel("PF (${pf.variant})", hx + 6f, (hy - 8f).coerceAtLeast(24f), lineColor, 22f)
                    }
                }

                DrawingTool.FIB_TIME_ZONE -> {
                    if (anchors.size >= 2) {
                        val zones = DrawingGeometryAlgorithm.computeFibTimeZones(
                            t1Ms = anchors[0].timeUtcMillis,
                            t2Ms = anchors[1].timeUtcMillis,
                            stepMs = stepMillis
                        )
                        for ((fib, tMs) in zones) {
                            val x = timeToX(tMs)
                            if (x in 0f..canvasW) {
                                val zCol = if (fib == 1 || fib == 8) goldColor else lineColor
                                drawLine(zCol, Offset(x, 0f), Offset(x, pricePaneH), strokeWidth = strokeW)
                                drawMonoLabel(fib.toString(), x + 5f, 26f, goldColor, 22f)
                            }
                        }
                    }
                }

                DrawingTool.CYCLIC_LINES -> {
                    if (anchors.size >= 2) {
                        val t0 = anchors[0].timeUtcMillis
                        val dt = max(stepMillis, abs(anchors[1].timeUtcMillis - t0))
                        for (k in -20..40) {
                            val x = timeToX(t0 + k.toLong() * dt)
                            if (x in 0f..canvasW) {
                                drawLine(lineColor, Offset(x, 0f), Offset(x, pricePaneH), strokeWidth = strokeW)
                            }
                        }
                    }
                }

                DrawingTool.FIB_SPEED_FAN -> {
                    if (anchors.size >= 2) {
                        val x1 = timeToX(anchors[0].timeUtcMillis)
                        val y1 = priceToY(anchors[0].price.toDouble())
                        val x2 = timeToX(anchors[1].timeUtcMillis)
                        val y2 = priceToY(anchors[1].price.toDouble())
                        val dx = x2 - x1
                        val dy = y2 - y1
                        val ext = max(1.8f, if (abs(dx) > 4f) (canvasW - x1) / dx else 2f)
                        drawRect(
                            color = Color(0xFF94A3B8).copy(alpha = 0.5f),
                            topLeft = Offset(min(x1, x2), min(y1, y2)),
                            size = Size(abs(dx), abs(dy)),
                            style = Stroke(width = 1.5f, pathEffect = selectedDashEffect)
                        )
                        val ratios = listOf(0.236f, 0.382f, 0.5f, 0.618f, 0.786f, 1.0f)
                        for (r in ratios) {
                            val isGold = r == 0.5f || r == 0.618f
                            val rayCol = if (isGold) goldColor else lineColor
                            val lw = if (isGold) strokeW + 0.4f else max(1.2f, strokeW - 0.3f)
                            val ryY = y1 + r * dy
                            drawLine(rayCol, Offset(x1, y1), Offset(x1 + dx * ext, y1 + (ryY - y1) * ext), strokeWidth = lw)
                            if (r < 1.0f) {
                                val rxX = x1 + r * dx
                                drawLine(rayCol, Offset(x1, y1), Offset(x1 + (rxX - x1) * ext, y1 + dy * ext), strokeWidth = lw)
                            }
                        }
                    }
                }

                DrawingTool.ABCD_PATTERN,
                DrawingTool.XABCD_PATTERN -> {
                    val isAbcd = drawing.toolType == DrawingTool.ABCD_PATTERN
                    val needed = if (isAbcd) 4 else 5
                    if (anchors.size >= needed) {
                        val pts = anchors.take(needed).map { Offset(timeToX(it.timeUtcMillis), priceToY(it.price.toDouble())) }
                        val labels = if (isAbcd) listOf("A", "B", "C", "D") else listOf("X", "A", "B", "C", "D")
                        val fillAlpha = baseColor.copy(alpha = 0.16f)
                        if (isAbcd) {
                            val p1 = Path().apply {
                                moveTo(pts[0].x, pts[0].y)
                                lineTo(pts[1].x, pts[1].y)
                                lineTo(pts[2].x, pts[2].y)
                                close()
                            }
                            val p2 = Path().apply {
                                moveTo(pts[1].x, pts[1].y)
                                lineTo(pts[2].x, pts[2].y)
                                lineTo(pts[3].x, pts[3].y)
                                close()
                            }
                            drawPath(p1, fillAlpha)
                            drawPath(p2, fillAlpha)
                        } else {
                            val p1 = Path().apply {
                                moveTo(pts[0].x, pts[0].y)
                                lineTo(pts[1].x, pts[1].y)
                                lineTo(pts[2].x, pts[2].y)
                                close()
                            }
                            val p2 = Path().apply {
                                moveTo(pts[2].x, pts[2].y)
                                lineTo(pts[3].x, pts[3].y)
                                lineTo(pts[4].x, pts[4].y)
                                close()
                            }
                            drawPath(p1, fillAlpha)
                            drawPath(p2, fillAlpha)
                        }

                        val linePath = Path().apply {
                            pts.forEachIndexed { idx, p ->
                                if (idx == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y)
                            }
                        }
                        drawPath(linePath, lineColor, style = Stroke(width = strokeW))

                        pts.forEachIndexed { idx, p ->
                            drawMonoLabel(labels[idx], p.x - 6f, (p.y - 10f).coerceAtLeast(24f), Color.White, 22f)
                        }
                        val ratios = DrawingGeometryAlgorithm.computeHarmonicRatios(anchors.take(needed))
                        if (ratios.bcAb > 0.0) {
                            val mx = (pts[0].x + pts[2].x) / 2f
                            val my = (pts[0].y + pts[2].y) / 2f
                            drawMonoLabel(String.format(Locale.US, "%.3f", ratios.bcAb), mx, my, goldColor, 20f)
                        }
                        if (ratios.cdBc > 0.0) {
                            val pEnd = pts.last()
                            val pPrev2 = pts[pts.lastIndex - 2]
                            drawMonoLabel(
                                String.format(Locale.US, "%.3f", ratios.cdBc),
                                (pEnd.x + pPrev2.x) / 2f,
                                (pEnd.y + pPrev2.y) / 2f,
                                goldColor,
                                20f
                            )
                        }
                    }
                }

                DrawingTool.HEAD_SHOULDERS -> {
                    if (anchors.size >= 5) {
                        val pts = anchors.take(5).map { Offset(timeToX(it.timeUtcMillis), priceToY(it.price.toDouble())) }
                        val labels = listOf("LS", "NL", "H", "NR", "RS")
                        val fillPath = Path().apply {
                            pts.forEachIndexed { idx, p ->
                                if (idx == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y)
                            }
                            close()
                        }
                        drawPath(fillPath, goldColor.copy(alpha = 0.14f))

                        val outlinePath = Path().apply {
                            pts.forEachIndexed { idx, p ->
                                if (idx == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y)
                            }
                        }
                        drawPath(outlinePath, lineColor, style = Stroke(width = strokeW))

                        val nx1 = pts[1].x
                        val ny1 = pts[1].y
                        val nx2 = pts[3].x
                        val ny2 = pts[3].y
                        val ndx = if (abs(nx2 - nx1) < 1f) 1f else nx2 - nx1
                        val ndy = ny2 - ny1
                        drawLine(
                            color = Color(0xFFEF5350),
                            start = Offset(nx1 - ndx * 0.4f, ny1 - ndy * 0.4f),
                            end = Offset(nx2 + ndx * 0.8f, ny2 + ndy * 0.8f),
                            strokeWidth = strokeW + 0.5f
                        )

                        val tFrac = (pts[2].x - nx1) / ndx
                        val neckAtHeadY = ny1 + tFrac * ndy
                        drawLine(
                            color = goldColor,
                            start = pts[2],
                            end = Offset(pts[2].x, neckAtHeadY),
                            strokeWidth = 1.6f,
                            pathEffect = selectedDashEffect
                        )

                        pts.forEachIndexed { idx, p ->
                            drawMonoLabel(labels[idx], p.x - 10f, (p.y - 10f).coerceAtLeast(24f), Color.White, 22f)
                        }
                    }
                }

                else -> Unit
            }

            // Anchor handle dots
            val handleR = if (isSelected) 6.5f else 4.2f
            for (anchor in anchors) {
                val ax = timeToX(anchor.timeUtcMillis)
                val ay = priceToY(anchor.price.toDouble())
                drawCircle(color = lineColor, radius = handleR, center = Offset(ax, ay))
            }
        }
    }

    fun drawPendingAnchorsPreview(
        scope: DrawScope,
        pendingAnchors: List<DrawingAnchor>,
        color: Color,
        timeToX: (Long) -> Float,
        priceToY: (Double) -> Float
    ) {
        if (pendingAnchors.isEmpty()) return
        with(scope) {
            val pts = pendingAnchors.map { Offset(timeToX(it.timeUtcMillis), priceToY(it.price.toDouble())) }
            if (pts.size >= 2) {
                val poly = Path().apply {
                    pts.forEachIndexed { idx, p ->
                        if (idx == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y)
                    }
                }
                drawPath(poly, color, style = Stroke(width = 2.2f))
            }
            pts.forEachIndexed { idx, p ->
                drawCircle(color = color, radius = 6.5f, center = p)
                drawMonoLabel((idx + 1).toString(), p.x + 8f, (p.y - 6f).coerceAtLeast(22f), Color.White, 22f)
            }
        }
    }
}
