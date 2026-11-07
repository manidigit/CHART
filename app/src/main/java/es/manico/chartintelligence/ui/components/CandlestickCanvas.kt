package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.algorithms.DrawingGeometryAlgorithm
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm
import es.manico.chartintelligence.data.model.ChartDrawing
import es.manico.chartintelligence.data.model.ChartPreferences
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.ChartType
import es.manico.chartintelligence.data.model.DrawingTool
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import java.math.BigDecimal
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.roundToLong

private fun parseDrawingColor(hex: String?, fallback: Color): Color {
    if (hex.isNullOrBlank()) return fallback
    return runCatching {
        val clean = hex.trim().removePrefix("#")
        val argb = if (clean.length == 6) "FF$clean" else clean
        Color(argb.toLong(16))
    }.getOrDefault(fallback)
}

@Composable
fun CandlestickCanvas(
    tab: ChartTabState,
    preferences: ChartPreferences = ChartPreferences(),
    onPinchZoom: (Float) -> Unit,
    onPanCandles: (Int) -> Unit,
    onScaleYAxisByDrag: (Float) -> Unit,
    onResetAutoScaleY: () -> Unit,
    onSelectCandle: (Int?) -> Unit,
    onPlaceDrawingAt: (Long, BigDecimal) -> Unit,
    onSelectDrawing: (String?) -> Unit,
    onTranslateSelectedDrawing: (Long, BigDecimal) -> Unit,
    onRetrySync: () -> Unit,
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current
    val density = LocalDensity.current
    val bullColor = preferences.bullCandleColor
    val bearColor = preferences.bearCandleColor
    val trendColor = preferences.trendLineColor
    val hlineColor = preferences.horizontalLineColor
    val vlineColor = preferences.verticalLineColor
    val candles = tab.candles
    val totalCount = candles.size
    val visibleCount = tab.visibleCandleCount.coerceIn(12, max(12, totalCount))
    val endIndexExclusive = (totalCount - tab.scrollOffsetFromRight).coerceIn(1, max(1, totalCount))
    val startIndex = (endIndexExclusive - visibleCount).coerceAtLeast(0)
    val visibleSlice = remember(candles, startIndex, endIndexExclusive) {
        if (candles.isEmpty()) emptyList() else candles.subList(startIndex, endIndexExclusive)
    }
    val visibleTimestamps = remember(visibleSlice) {
        visibleSlice.map { it.openTimeUtcMillis }
    }
    val stepMillis = remember(tab.timeframe) {
        UtcTimeAnchorAlgorithm.timeframeStepMillis(tab.timeframe)
    }

    // Compute full-series SMA 20 and slice to visible window
    val fullSma20 = remember(candles, tab.showSma20) {
        if (!tab.showSma20 || candles.isEmpty()) emptyList()
        else PriceFormatterAlgorithm.computeSmaValues(candles.map { it.close.toDouble() }, 20)
    }
    val visibleSma20 = remember(fullSma20, startIndex, endIndexExclusive) {
        if (fullSma20.isEmpty()) emptyList()
        else fullSma20.subList(startIndex, endIndexExclusive.coerceAtMost(fullSma20.size))
    }

    val inspectedCandle = remember(tab.selectedCandleIndex, visibleSlice) {
        val idx = tab.selectedCandleIndex
        if (idx != null && idx in candles.indices) {
            candles[idx]
        } else {
            visibleSlice.lastOrNull()
        }
    }
    val inspectedSma20 = remember(tab.selectedCandleIndex, fullSma20, startIndex, endIndexExclusive) {
        if (fullSma20.isEmpty()) null
        else {
            val idx = tab.selectedCandleIndex ?: (endIndexExclusive - 1)
            fullSma20.getOrNull(idx)
        }
    }

    var panCarryPx by remember(tab.tabId, tab.timeframe) { mutableFloatStateOf(0f) }

    // Compute Price Y-Axis Bounds (Auto Scale vs Manual Scale Factor)
    val rawMinPrice = visibleSlice.minOfOrNull { it.low.toDouble() } ?: 0.0
    val rawMaxPrice = visibleSlice.maxOfOrNull { it.high.toDouble() } ?: 1.0
    val midPrice = (rawMinPrice + rawMaxPrice) / 2.0
    val baseHalfSpan = max(1e-6, (rawMaxPrice - rawMinPrice) / 2.0) * 1.12
    val scaleFactor = if (tab.isAutoScaleY) 1.0 else tab.yPriceScaleFactor.coerceIn(0.25f, 4.0f).toDouble()
    val effectiveHalfSpan = baseHalfSpan * scaleFactor
    val paddedMin = midPrice - effectiveHalfSpan
    val paddedMax = midPrice + effectiveHalfSpan
    val paddedSpan = (paddedMax - paddedMin).coerceAtLeast(1e-6)

    val maxRawVolume = visibleSlice.maxOfOrNull { it.volume.toDouble() } ?: 0.0
    val hasRealVolume = maxRawVolume > 0.0
    val maxVolume = maxRawVolume.coerceAtLeast(1.0)
    val volRatio = if (tab.showVolume) tab.volumePaneRatio.coerceIn(0.15f, 0.32f) else 0f
    val priceRatio = 1f - volRatio

    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 260.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, financialPalette.cardBorder, RoundedCornerShape(10.dp))
            .testTag("candlestick_canvas_${tab.tabId.lowercase()}")
    ) {
        val containerHeightDp = maxHeight
        val plotTopPadDp = 8.dp
        val plotBottomPadDp = 24.dp
        val plotRightPadDp = 68.dp
        val plotLeftPadDp = 6.dp
        val plotHeightDp = (containerHeightDp - plotTopPadDp - plotBottomPadDp).coerceAtLeast(180.dp)
        val pricePaneHeightDp = plotHeightDp * priceRatio

        if (visibleSlice.isEmpty()) {
            // Genuine Loading / No Data / Error State (Zero Fake Data)
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                if (tab.isLoading) {
                    CircularProgressIndicator(
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = stringResource(R.string.chart_state_loading),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                } else {
                    Text(
                        text = if (tab.hasError) {
                            stringResource(R.string.chart_state_error)
                        } else {
                            stringResource(R.string.chart_state_empty)
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (tab.hasError) financialPalette.bearCandle else MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                    Button(
                        onClick = onRetrySync,
                        modifier = Modifier
                            .heightIn(min = 48.dp)
                            .testTag("chart_retry_sync_button")
                    ) {
                        Text(text = stringResource(R.string.chart_action_retry))
                    }
                }
            }
        } else {
            // Multi-Pane Layered Financial Canvas (Main Price Pane + Separate Volume Sub-Pane)
            Canvas(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(
                        start = plotLeftPadDp,
                        end = plotRightPadDp,
                        top = plotTopPadDp,
                        bottom = plotBottomPadDp
                    )
                    .pointerInput(
                        visibleSlice,
                        startIndex,
                        tab.activeDrawingTool,
                        tab.drawings,
                        tab.selectedDrawingId,
                        paddedMin,
                        paddedMax,
                        priceRatio
                    ) {
                        detectTapGestures { tapOffset ->
                            if (visibleSlice.isEmpty() || size.width <= 0 || size.height <= 0) return@detectTapGestures
                            val w = size.width.toFloat()
                            val h = size.height.toFloat()
                            val pricePaneH = (h * priceRatio).coerceAtLeast(1f)

                            fun priceToY(p: Double): Float {
                                val ratio = ((paddedMax - p) / paddedSpan).toFloat()
                                return (ratio * pricePaneH).coerceIn(0f, pricePaneH)
                            }

                            fun yToPrice(y: Float): BigDecimal {
                                val clampedRatio = (y / pricePaneH).coerceIn(0f, 1f).toDouble()
                                val raw = paddedMax - clampedRatio * paddedSpan
                                return CandleValidatorAlgorithm.normalizeDecimal(BigDecimal.valueOf(raw))
                            }

                            fun timeToX(timeMs: Long): Float {
                                return DrawingGeometryAlgorithm.timeUtcToCanvasX(
                                    timeUtcMillis = timeMs,
                                    visibleTimestamps = visibleTimestamps,
                                    timeframeStepMillis = stepMillis,
                                    canvasWidth = w
                                )
                            }

                            val tappedTimeUtc = DrawingGeometryAlgorithm.canvasXToTimeUtc(
                                x = tapOffset.x,
                                visibleTimestamps = visibleTimestamps,
                                timeframeStepMillis = stepMillis,
                                canvasWidth = w
                            )
                            val tappedPrice = yToPrice(tapOffset.y.coerceAtMost(pricePaneH))

                            if (tab.activeDrawingTool != DrawingTool.CURSOR) {
                                onPlaceDrawingAt(tappedTimeUtc, tappedPrice)
                            } else {
                                val hitDrawing = DrawingGeometryAlgorithm.hitTestDrawing(
                                    drawings = tab.drawings,
                                    tapX = tapOffset.x,
                                    tapY = tapOffset.y,
                                    timeToX = ::timeToX,
                                    priceToY = ::priceToY,
                                    hitTolerancePx = preferences.drawingHitTolerancePx
                                )
                                if (hitDrawing != null) {
                                    onSelectDrawing(hitDrawing.id)
                                } else {
                                    onSelectDrawing(null)
                                    val slotW = w / visibleSlice.size.toFloat()
                                    val localIdx = (tapOffset.x / slotW).toInt()
                                        .coerceIn(0, visibleSlice.lastIndex)
                                    onSelectCandle(startIndex + localIdx)
                                }
                            }
                        }
                    }
                    .pointerInput(
                        visibleSlice,
                        tab.selectedDrawingId,
                        tab.activeDrawingTool,
                        paddedSpan,
                        stepMillis,
                        priceRatio
                    ) {
                        detectTransformGestures { _, pan, zoom, _ ->
                            val w = size.width.toFloat()
                            val h = size.height.toFloat()
                            val pricePaneH = (h * priceRatio).coerceAtLeast(1f)
                            if (visibleSlice.isEmpty() || w <= 0f || h <= 0f) return@detectTransformGestures

                            if (abs(zoom - 1f) > 0.015f) {
                                onPinchZoom(zoom)
                            }

                            val slotW = (w / visibleSlice.size.toFloat()).coerceAtLeast(3f)

                            if (tab.activeDrawingTool == DrawingTool.CURSOR && tab.selectedDrawingId != null && abs(zoom - 1f) <= 0.015f) {
                                val deltaSlots = (pan.x / slotW).roundToLong()
                                val deltaTimeMillis = deltaSlots * stepMillis
                                val pricePerPx = paddedSpan / pricePaneH.toDouble()
                                val deltaPriceDouble = -pan.y.toDouble() * pricePerPx
                                if (deltaTimeMillis != 0L || abs(deltaPriceDouble) > 1e-8) {
                                    onTranslateSelectedDrawing(
                                        deltaTimeMillis,
                                        BigDecimal.valueOf(deltaPriceDouble)
                                    )
                                }
                            } else if (abs(pan.x) > 0.5f) {
                                panCarryPx += pan.x
                                val deltaBars = (panCarryPx / slotW).roundToInt()
                                if (deltaBars != 0) {
                                    panCarryPx -= deltaBars * slotW
                                    onPanCandles(deltaBars)
                                }
                            }
                        }
                    }
            ) {
                val canvasW = size.width
                val canvasH = size.height
                if (visibleSlice.isEmpty() || canvasW <= 0f || canvasH <= 0f) return@Canvas

                val pricePaneH = (canvasH * priceRatio).coerceAtLeast(1f)
                val volPaneTop = pricePaneH
                val volPaneH = (canvasH - pricePaneH).coerceAtLeast(0f)

                val dashEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f), 0f)
                val currentPriceDashEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 5f), 0f)
                val selectedDashEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 5f), 0f)

                // 1. Horizontal price grid lines in Main Price Pane (5 levels)
                for (g in 0..4) {
                    val y = pricePaneH * (g / 4f)
                    drawLine(
                        color = financialPalette.chartGrid,
                        start = Offset(0f, y),
                        end = Offset(canvasW, y),
                        strokeWidth = 1f,
                        pathEffect = dashEffect
                    )
                }

                // 2. Vertical time grid lines across both panes
                val maxTicks = max(2, min(5, (canvasW / 180f).toInt()))
                for (tIdx in 0 until maxTicks) {
                    val ratio = if (maxTicks == 1) 0.5f else tIdx.toFloat() / (maxTicks - 1).toFloat()
                    val x = canvasW * ratio
                    drawLine(
                        color = financialPalette.chartGrid,
                        start = Offset(x, 0f),
                        end = Offset(x, canvasH),
                        strokeWidth = 1f,
                        pathEffect = dashEffect
                    )
                }

                // 3. Right Y-axis border line & Bottom X-axis border line
                drawLine(
                    color = financialPalette.cardBorder,
                    start = Offset(canvasW, 0f),
                    end = Offset(canvasW, canvasH),
                    strokeWidth = 1.2f
                )
                drawLine(
                    color = financialPalette.cardBorder,
                    start = Offset(0f, canvasH),
                    end = Offset(canvasW, canvasH),
                    strokeWidth = 1.2f
                )

                val slotW = canvasW / visibleSlice.size.toFloat()
                val bodyW = (slotW * 0.68f).coerceIn(2.5f, 18f)

                fun priceToY(p: Double): Float {
                    val ratio = ((paddedMax - p) / paddedSpan).toFloat()
                    return (ratio * pricePaneH).coerceIn(0f, pricePaneH)
                }

                fun timeToX(timeMs: Long): Float {
                    return DrawingGeometryAlgorithm.timeUtcToCanvasX(
                        timeUtcMillis = timeMs,
                        visibleTimestamps = visibleTimestamps,
                        timeframeStepMillis = stepMillis,
                        canvasWidth = canvasW
                    )
                }

                // 4. Main Price Pane Rendering (Clipped strictly to Main Price Pane)
                clipRect(left = 0f, top = 0f, right = canvasW, bottom = pricePaneH) {
                    if (tab.chartType == ChartType.CANDLESTICK) {
                        visibleSlice.forEachIndexed { idx, candle ->
                            val centerX = (idx + 0.5f) * slotW
                            val highY = priceToY(candle.high.toDouble())
                            val lowY = priceToY(candle.low.toDouble())
                            val openY = priceToY(candle.open.toDouble())
                            val closeY = priceToY(candle.close.toDouble())

                            val color = if (candle.isBullish) bullColor else bearColor

                            drawLine(
                                color = color,
                                start = Offset(centerX, highY),
                                end = Offset(centerX, lowY),
                                strokeWidth = 1.6f
                            )

                            val topY = min(openY, closeY)
                            val bottomY = max(openY, closeY)
                            val bodyHeight = (bottomY - topY).coerceAtLeast(2.2f)
                            drawRect(
                                color = color,
                                topLeft = Offset(centerX - bodyW / 2f, topY),
                                size = Size(bodyW, bodyHeight)
                            )
                        }
                    } else {
                        val linePath = Path()
                        val areaPath = Path()
                        visibleSlice.forEachIndexed { idx, candle ->
                            val x = (idx + 0.5f) * slotW
                            val y = priceToY(candle.close.toDouble())
                            if (idx == 0) {
                                linePath.moveTo(x, y)
                                areaPath.moveTo(x, pricePaneH)
                                areaPath.lineTo(x, y)
                            } else {
                                linePath.lineTo(x, y)
                                areaPath.lineTo(x, y)
                            }
                            if (idx == visibleSlice.lastIndex) {
                                areaPath.lineTo(x, pricePaneH)
                                areaPath.close()
                            }
                        }
                        val lineColor = Color(0xFF38BDF8)
                        drawPath(
                            path = areaPath,
                            brush = Brush.verticalGradient(
                                colors = listOf(
                                    lineColor.copy(alpha = 0.24f),
                                    lineColor.copy(alpha = 0.0f)
                                ),
                                startY = 0f,
                                endY = pricePaneH
                            )
                        )
                        drawPath(
                            path = linePath,
                            color = lineColor,
                            style = Stroke(width = 2.6f)
                        )
                    }

                    // 5. Optional SMA 20 Overlay Line
                    if (tab.showSma20 && visibleSma20.isNotEmpty()) {
                        val smaPath = Path()
                        var started = false
                        visibleSma20.forEachIndexed { idx, smaVal ->
                            if (smaVal != null) {
                                val x = (idx + 0.5f) * slotW
                                val y = priceToY(smaVal)
                                if (!started) {
                                    smaPath.moveTo(x, y)
                                    started = true
                                } else {
                                    smaPath.lineTo(x, y)
                                }
                            }
                        }
                        if (started) {
                            drawPath(
                                path = smaPath,
                                color = Color(0xFFF59E0B),
                                style = Stroke(width = 2.2f)
                            )
                        }
                    }

                    // 6. Current Price Horizontal Dashed Line across Main Price Pane
                    val latestCandle = candles.lastOrNull()
                    if (latestCandle != null) {
                        val curY = priceToY(latestCandle.close.toDouble())
                        val curColor = if (latestCandle.isBullish) bullColor else bearColor
                        drawLine(
                            color = curColor.copy(alpha = 0.85f),
                            start = Offset(0f, curY),
                            end = Offset(canvasW, curY),
                            strokeWidth = 1.4f,
                            pathEffect = currentPriceDashEffect
                        )
                    }

                    // 7. Market-Coordinate-Anchored Drawings (with custom colorHex & strokeWidthDp)
                    for (drawing in tab.drawings) {
                        val isSelected = drawing.id == tab.selectedDrawingId
                        val baseWidthPx = with(density) { drawing.strokeWidthDp.dp.toPx() }
                        val strokeW = if (isSelected) baseWidthPx + 1.4f else baseWidthPx
                        when (drawing) {
                            is ChartDrawing.HorizontalLine -> {
                                val y = priceToY(drawing.price.toDouble())
                                val baseColor = parseDrawingColor(drawing.colorHex, hlineColor)
                                val color = if (isSelected) baseColor.copy(alpha = 0.92f) else baseColor
                                drawLine(
                                    color = color,
                                    start = Offset(0f, y),
                                    end = Offset(canvasW, y),
                                    strokeWidth = strokeW,
                                    pathEffect = if (isSelected) selectedDashEffect else null
                                )
                                if (isSelected) {
                                    drawCircle(
                                        color = color,
                                        radius = 5.5f,
                                        center = Offset(canvasW * 0.5f, y)
                                    )
                                }
                            }
                            is ChartDrawing.VerticalLine -> {
                                val x = timeToX(drawing.timeUtcMillis)
                                if (x in -20f..(canvasW + 20f)) {
                                    val baseColor = parseDrawingColor(drawing.colorHex, vlineColor)
                                    val color = if (isSelected) baseColor.copy(alpha = 0.92f) else baseColor
                                    drawLine(
                                        color = color,
                                        start = Offset(x, 0f),
                                        end = Offset(x, pricePaneH),
                                        strokeWidth = strokeW,
                                        pathEffect = if (isSelected) selectedDashEffect else null
                                    )
                                    if (isSelected) {
                                        drawCircle(
                                            color = color,
                                            radius = 5.5f,
                                            center = Offset(x, pricePaneH * 0.5f)
                                        )
                                    }
                                }
                            }
                            is ChartDrawing.TrendLine -> {
                                val x1 = timeToX(drawing.startTimeUtcMillis)
                                val y1 = priceToY(drawing.startPrice.toDouble())
                                val x2 = timeToX(drawing.endTimeUtcMillis)
                                val y2 = priceToY(drawing.endPrice.toDouble())
                                val baseColor = parseDrawingColor(drawing.colorHex, trendColor)
                                val color = if (isSelected) baseColor.copy(alpha = 0.92f) else baseColor
                                drawLine(
                                    color = color,
                                    start = Offset(x1, y1),
                                    end = Offset(x2, y2),
                                    strokeWidth = strokeW
                                )
                                drawCircle(
                                    color = color,
                                    radius = if (isSelected) 6.5f else 4.5f,
                                    center = Offset(x1, y1)
                                )
                                drawCircle(
                                    color = color,
                                    radius = if (isSelected) 6.5f else 4.5f,
                                    center = Offset(x2, y2)
                                )
                            }
                        }
                    }

                    // Render Pending 1st Anchor Point for Trend Line
                    tab.pendingTrendPoint?.let { pt ->
                        val px = timeToX(pt.timeUtcMillis)
                        val py = priceToY(pt.price.toDouble())
                        drawCircle(
                            color = parseDrawingColor(tab.activeDrawingColorHex, Color(0xFFA855F7)),
                            radius = 6.5f,
                            center = Offset(px, py)
                        )
                    }
                }

                // 8. Separate Dedicated Volume Sub-Pane below Price Pane
                if (tab.showVolume && volPaneH > 4f) {
                    // Horizontal divider between Price Pane and Volume Sub-Pane
                    drawLine(
                        color = financialPalette.cardBorder,
                        start = Offset(0f, volPaneTop),
                        end = Offset(canvasW, volPaneTop),
                        strokeWidth = 1.5f
                    )
                    // Mid-volume reference dashed line
                    val midVolY = volPaneTop + volPaneH * 0.5f
                    drawLine(
                        color = financialPalette.chartGrid.copy(alpha = 0.6f),
                        start = Offset(0f, midVolY),
                        end = Offset(canvasW, midVolY),
                        strokeWidth = 1f,
                        pathEffect = dashEffect
                    )

                    if (hasRealVolume) {
                        val usableVolH = (volPaneH - 8f).coerceAtLeast(2f)
                        visibleSlice.forEachIndexed { idx, candle ->
                            val volFrac = (candle.volume.toDouble() / maxVolume).toFloat().coerceIn(0f, 1f)
                            if (volFrac > 0f) {
                                val centerX = (idx + 0.5f) * slotW
                                val barH = (usableVolH * volFrac).coerceAtLeast(1.5f)
                                val volColor = if (candle.isBullish) {
                                    bullColor.copy(alpha = 0.44f)
                                } else {
                                    bearColor.copy(alpha = 0.44f)
                                }
                                drawRect(
                                    color = volColor,
                                    topLeft = Offset(centerX - bodyW / 2f, canvasH - barH),
                                    size = Size(bodyW, barH)
                                )
                            }
                        }
                    }
                }

                // 9. Crosshair Lines across Price & Volume Panes when a candle is selected
                val selIdx = tab.selectedCandleIndex
                if (selIdx != null && selIdx in startIndex until endIndexExclusive) {
                    val localIdx = selIdx - startIndex
                    val candle = visibleSlice[localIdx]
                    val centerX = (localIdx + 0.5f) * slotW
                    val closeY = priceToY(candle.close.toDouble())
                    drawLine(
                        color = financialPalette.crosshair,
                        start = Offset(centerX, 0f),
                        end = Offset(centerX, canvasH),
                        strokeWidth = 1.4f,
                        pathEffect = dashEffect
                    )
                    drawLine(
                        color = financialPalette.crosshair,
                        start = Offset(0f, closeY),
                        end = Offset(canvasW, closeY),
                        strokeWidth = 1.4f,
                        pathEffect = dashEffect
                    )
                }
            }

            // Floating 1-Line Translucent OHLCV + SMA20 Legend inside top-start of Main Price Pane
            if (inspectedCandle != null) {
                val changePct = PriceFormatterAlgorithm.formatSignedPercentChange(
                    open = inspectedCandle.open,
                    close = inspectedCandle.close
                )
                val isBull = inspectedCandle.isBullish
                val accentColor = if (isBull) bullColor else bearColor

                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Row(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(start = 8.dp, top = 6.dp, end = 72.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.86f))
                            .border(1.dp, financialPalette.cardBorder.copy(alpha = 0.7f), RoundedCornerShape(6.dp))
                            .horizontalScroll(rememberScrollState())
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                            .testTag("chart_ohlcv_header"),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "O ${PriceFormatterAlgorithm.formatPrice(inspectedCandle.open, tab.decimals)}",
                            style = MaterialTheme.typography.labelSmall,
                            fontSize = 10.sp,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "H ${PriceFormatterAlgorithm.formatPrice(inspectedCandle.high, tab.decimals)}",
                            style = MaterialTheme.typography.labelSmall,
                            fontSize = 10.sp,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = bullColor
                        )
                        Text(
                            text = "L ${PriceFormatterAlgorithm.formatPrice(inspectedCandle.low, tab.decimals)}",
                            style = MaterialTheme.typography.labelSmall,
                            fontSize = 10.sp,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = bearColor
                        )
                        Text(
                            text = "C ${PriceFormatterAlgorithm.formatPrice(inspectedCandle.close, tab.decimals)} ($changePct)",
                            style = MaterialTheme.typography.labelSmall,
                            fontSize = 10.sp,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = accentColor
                        )
                        if (inspectedCandle.volume > BigDecimal.ZERO) {
                            Text(
                                text = "Vol ${PriceFormatterAlgorithm.formatCompactVolume(inspectedCandle.volume)}",
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        if (tab.showSma20 && inspectedSma20 != null) {
                            Text(
                                text = "SMA20 ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(inspectedSma20), tab.decimals)}",
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFF59E0B)
                            )
                        }
                    }
                }
            }

            // Honest Volume Sub-Pane Header / No-Volume Notice
            if (tab.showVolume) {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    val volHeaderText = if (hasRealVolume && inspectedCandle != null) {
                        "Vol: ${PriceFormatterAlgorithm.formatCompactVolume(inspectedCandle.volume)}"
                    } else {
                        stringResource(R.string.chart_volume_unavailable)
                    }
                    Text(
                        text = volHeaderText,
                        style = MaterialTheme.typography.labelSmall,
                        fontSize = 9.sp,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .offset(y = plotTopPadDp + pricePaneHeightDp + 3.dp, x = 10.dp)
                            .testTag("chart_volume_pane_label")
                    )
                }
            }

            // Right-side Price & Volume Y-Axis Strip + Current Price Pill + Crosshair Price Pill
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .width(plotRightPadDp)
                        .fillMaxHeight()
                        .pointerInput(Unit) {
                            detectTapGestures(
                                onDoubleTap = { onResetAutoScaleY() }
                            )
                        }
                        .pointerInput(Unit) {
                            detectVerticalDragGestures { change, dragAmount ->
                                change.consume()
                                onScaleYAxisByDrag(dragAmount)
                            }
                        }
                        .padding(top = plotTopPadDp, bottom = plotBottomPadDp, end = 4.dp)
                        .testTag("chart_y_axis_scale_strip")
                ) {
                    // Price Pane Y-Axis Labels
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(pricePaneHeightDp),
                        verticalArrangement = Arrangement.SpaceBetween,
                        horizontalAlignment = Alignment.End
                    ) {
                        for (g in 0..4) {
                            val levelPrice = paddedMax - (paddedSpan * (g / 4.0))
                            Text(
                                text = PriceFormatterAlgorithm.formatPrice(
                                    BigDecimal.valueOf(levelPrice),
                                    tab.decimals
                                ),
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = if (tab.isAutoScaleY) {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                } else {
                                    MaterialTheme.colorScheme.primary
                                }
                            )
                        }
                    }

                    // Volume Pane Y-Axis Labels
                    if (tab.showVolume && hasRealVolume) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .offset(y = pricePaneHeightDp + 2.dp)
                                .height((plotHeightDp - pricePaneHeightDp).coerceAtLeast(24.dp)),
                            verticalArrangement = Arrangement.SpaceBetween,
                            horizontalAlignment = Alignment.End
                        ) {
                            Text(
                                text = PriceFormatterAlgorithm.formatCompactVolume(BigDecimal.valueOf(maxRawVolume)),
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 9.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f)
                            )
                            Text(
                                text = PriceFormatterAlgorithm.formatCompactVolume(BigDecimal.valueOf(maxRawVolume * 0.5)),
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 9.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                            )
                        }
                    }

                    // Current Price Pill Badge on Right Y-Axis
                    val latestCandle = candles.lastOrNull()
                    if (latestCandle != null) {
                        val curPriceDouble = latestCandle.close.toDouble()
                        val curRatio = ((paddedMax - curPriceDouble) / paddedSpan).toFloat().coerceIn(0f, 1f)
                        val curOffsetPx = with(density) { (pricePaneHeightDp * curRatio - 9.dp).roundToPx() }
                        val curBg = if (latestCandle.isBullish) bullColor else bearColor
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .offset { IntOffset(0, curOffsetPx) }
                                .clip(RoundedCornerShape(4.dp))
                                .background(curBg)
                                .padding(horizontal = 4.dp, vertical = 1.dp)
                                .testTag("chart_current_price_axis_pill")
                        ) {
                            Text(
                                text = PriceFormatterAlgorithm.formatPrice(latestCandle.close, tab.decimals),
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 9.5.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF06101E)
                            )
                        }
                    }

                    // Crosshair Price Callout Pill on Right Y-Axis when a candle is selected
                    val selIdx = tab.selectedCandleIndex
                    if (selIdx != null && selIdx in startIndex until endIndexExclusive) {
                        val selCandle = visibleSlice[selIdx - startIndex]
                        val selRatio = ((paddedMax - selCandle.close.toDouble()) / paddedSpan).toFloat().coerceIn(0f, 1f)
                        val selOffsetPx = with(density) { (pricePaneHeightDp * selRatio - 9.dp).roundToPx() }
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .offset { IntOffset(0, selOffsetPx) }
                                .clip(RoundedCornerShape(4.dp))
                                .background(Color(0xFF1E293B))
                                .border(1.dp, Color(0xFF38BDF8), RoundedCornerShape(4.dp))
                                .padding(horizontal = 4.dp, vertical = 1.dp)
                                .testTag("chart_crosshair_price_pill")
                        ) {
                            Text(
                                text = PriceFormatterAlgorithm.formatPrice(selCandle.close, tab.decimals),
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 9.5.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFF8FAFC)
                            )
                        }
                    }
                }

                // Bottom X-Axis UTC Time Labels + Crosshair Time Callout Pill
                val firstCandle = visibleSlice.first()
                val midCandle = visibleSlice[visibleSlice.size / 2]
                val lastCandle = visibleSlice.last()
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .padding(start = 8.dp, end = plotRightPadDp, bottom = 3.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = PriceFormatterAlgorithm.formatAxisTimestamp(firstCandle.openTimeUtcMillis, tab.timeframe),
                            style = MaterialTheme.typography.labelSmall,
                            fontSize = 10.sp,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        if (visibleSlice.size >= 4) {
                            Text(
                                text = PriceFormatterAlgorithm.formatAxisTimestamp(midCandle.openTimeUtcMillis, tab.timeframe),
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Text(
                            text = PriceFormatterAlgorithm.formatAxisTimestamp(lastCandle.openTimeUtcMillis, tab.timeframe),
                            style = MaterialTheme.typography.labelSmall,
                            fontSize = 10.sp,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    val selIdx = tab.selectedCandleIndex
                    if (selIdx != null && selIdx in startIndex until endIndexExclusive) {
                        val selCandle = visibleSlice[selIdx - startIndex]
                        Box(
                            modifier = Modifier
                                .align(Alignment.Center)
                                .clip(RoundedCornerShape(4.dp))
                                .background(Color(0xFF1E293B))
                                .border(1.dp, Color(0xFF38BDF8), RoundedCornerShape(4.dp))
                                .padding(horizontal = 6.dp, vertical = 1.dp)
                                .testTag("chart_crosshair_time_pill")
                        ) {
                            Text(
                                text = PriceFormatterAlgorithm.formatAxisTimestamp(selCandle.openTimeUtcMillis, tab.timeframe),
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 9.5.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFF8FAFC)
                            )
                        }
                    }
                }
            }
        }
    }
}
