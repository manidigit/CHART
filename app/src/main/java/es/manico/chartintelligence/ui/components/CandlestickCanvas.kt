package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.algorithms.DrawingGeometryAlgorithm
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm
import es.manico.chartintelligence.data.model.ChartDrawing
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

@Composable
fun CandlestickCanvas(
    tab: ChartTabState,
    preferences: es.manico.chartintelligence.data.model.ChartPreferences = es.manico.chartintelligence.data.model.ChartPreferences(),
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
    val bullColor = preferences.bullCandleColor
    val bearColor = preferences.bearCandleColor
    val trendColor = preferences.trendLineColor
    val hlineColor = preferences.horizontalLineColor
    val vlineColor = preferences.verticalLineColor
    val gridColor = preferences.chartGridColor
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

    val inspectedCandle = remember(tab.selectedCandleIndex, visibleSlice) {
        val idx = tab.selectedCandleIndex
        if (idx != null && idx in candles.indices) {
            candles[idx]
        } else {
            visibleSlice.lastOrNull()
        }
    }

    var panCarryPx by remember(tab.tabId, tab.timeframe) { mutableFloatStateOf(0f) }

    Column(modifier = modifier.fillMaxWidth()) {
        // OHLCV + UTC Timestamp Inspection Bar (Strictly LTR Latin digits)
        if (inspectedCandle != null) {
            val changePct = PriceFormatterAlgorithm.formatSignedPercentChange(
                open = inspectedCandle.open,
                close = inspectedCandle.close
            )
            val isBull = inspectedCandle.isBullish
            val accentColor = if (isBull) financialPalette.bullCandle else financialPalette.bearCandle

            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.surface)
                        .border(1.dp, financialPalette.cardBorder, RoundedCornerShape(10.dp))
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                        .testTag("chart_ohlcv_header")
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "${tab.symbolCode} · ${tab.provider.badgeLabel} · ${tab.timeframe}",
                            style = MaterialTheme.typography.labelLarge,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = inspectedCandle.openTimeUtcIso,
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "O: ${PriceFormatterAlgorithm.formatPrice(inspectedCandle.open, tab.decimals)}",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "H: ${PriceFormatterAlgorithm.formatPrice(inspectedCandle.high, tab.decimals)}",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = financialPalette.bullCandle
                        )
                        Text(
                            text = "L: ${PriceFormatterAlgorithm.formatPrice(inspectedCandle.low, tab.decimals)}",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = financialPalette.bearCandle
                        )
                        Text(
                            text = "C: ${PriceFormatterAlgorithm.formatPrice(inspectedCandle.close, tab.decimals)} ($changePct)",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = accentColor
                        )
                        if (inspectedCandle.volume > BigDecimal.ZERO) {
                            Text(
                                text = "V: ${inspectedCandle.volume.toLong()}",
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

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
        val maxVolume = visibleSlice.maxOfOrNull { it.volume.toDouble() }?.coerceAtLeast(1.0) ?: 1.0

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(340.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, financialPalette.cardBorder, RoundedCornerShape(12.dp))
                .testTag("candlestick_canvas_${tab.tabId.lowercase()}")
        ) {
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
                // Interactive Trading Canvas
                Canvas(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(start = 8.dp, end = 66.dp, top = 12.dp, bottom = 26.dp)
                        .pointerInput(
                            visibleSlice,
                            startIndex,
                            tab.activeDrawingTool,
                            tab.drawings,
                            tab.selectedDrawingId,
                            paddedMin,
                            paddedMax
                        ) {
                            detectTapGestures { tapOffset ->
                                if (visibleSlice.isEmpty() || size.width <= 0 || size.height <= 0) return@detectTapGestures
                                val w = size.width.toFloat()
                                val h = size.height.toFloat()

                                fun priceToY(p: Double): Float {
                                    val ratio = ((paddedMax - p) / paddedSpan).toFloat()
                                    return (ratio * h).coerceIn(0f, h)
                                }

                                fun yToPrice(y: Float): BigDecimal {
                                    val clampedRatio = (y / h).coerceIn(0f, 1f).toDouble()
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
                                val tappedPrice = yToPrice(tapOffset.y)

                                if (tab.activeDrawingTool != DrawingTool.CURSOR) {
                                    onPlaceDrawingAt(tappedTimeUtc, tappedPrice)
                                } else {
                                    // First check if user tapped an existing drawing to select it
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
                            stepMillis
                        ) {
                            detectTransformGestures { _, pan, zoom, _ ->
                                val w = size.width.toFloat()
                                val h = size.height.toFloat()
                                if (visibleSlice.isEmpty() || w <= 0f || h <= 0f) return@detectTransformGestures

                                // Two-finger Pinch-to-Zoom
                                if (abs(zoom - 1f) > 0.015f) {
                                    onPinchZoom(zoom)
                                }

                                val slotW = (w / visibleSlice.size.toFloat()).coerceAtLeast(3f)

                                // If a drawing is selected in CURSOR mode and single finger drags it, move the drawing
                                if (tab.activeDrawingTool == DrawingTool.CURSOR && tab.selectedDrawingId != null && abs(zoom - 1f) <= 0.015f) {
                                    val deltaSlots = (pan.x / slotW).roundToLong()
                                    val deltaTimeMillis = deltaSlots * stepMillis
                                    val pricePerPx = paddedSpan / h.toDouble()
                                    val deltaPriceDouble = -pan.y.toDouble() * pricePerPx
                                    if (deltaTimeMillis != 0L || abs(deltaPriceDouble) > 1e-8) {
                                        onTranslateSelectedDrawing(
                                            deltaTimeMillis,
                                            BigDecimal.valueOf(deltaPriceDouble)
                                        )
                                    }
                                } else if (abs(pan.x) > 0.5f) {
                                    // Smooth horizontal pan across historical candles
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

                    val dashEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f), 0f)
                    val selectedDashEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 5f), 0f)

                    // Horizontal price grid lines (5 levels)
                    for (g in 0..4) {
                        val y = canvasH * (g / 4f)
                        drawLine(
                            color = financialPalette.chartGrid,
                            start = Offset(0f, y),
                            end = Offset(canvasW, y),
                            strokeWidth = 1f,
                            pathEffect = dashEffect
                        )
                    }

                    // Dynamic non-overlapping vertical time grid lines
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

                    val slotW = canvasW / visibleSlice.size.toFloat()
                    val bodyW = (slotW * 0.68f).coerceIn(2.5f, 18f)

                    fun priceToY(p: Double): Float {
                        val ratio = ((paddedMax - p) / paddedSpan).toFloat()
                        return (ratio * canvasH).coerceIn(0f, canvasH)
                    }

                    fun timeToX(timeMs: Long): Float {
                        return DrawingGeometryAlgorithm.timeUtcToCanvasX(
                            timeUtcMillis = timeMs,
                            visibleTimestamps = visibleTimestamps,
                            timeframeStepMillis = stepMillis,
                            canvasWidth = canvasW
                        )
                    }

                    // Subtle Volume Histogram in bottom 14% of canvas
                    val maxVolHeight = canvasH * 0.14f
                    visibleSlice.forEachIndexed { idx, candle ->
                        val volRatio = (candle.volume.toDouble() / maxVolume).toFloat().coerceIn(0f, 1f)
                        if (volRatio > 0f) {
                            val centerX = (idx + 0.5f) * slotW
                            val barH = maxVolHeight * volRatio
                            val volColor = if (candle.isBullish) {
                                financialPalette.bullCandle.copy(alpha = 0.18f)
                            } else {
                                financialPalette.bearCandle.copy(alpha = 0.18f)
                            }
                            drawRect(
                                color = volColor,
                                topLeft = Offset(centerX - bodyW / 2f, canvasH - barH),
                                size = Size(bodyW, barH)
                            )
                        }
                    }

                    if (tab.chartType == ChartType.CANDLESTICK) {
                        // Candlestick Mode (Green Bullish / Red Bearish)
                        visibleSlice.forEachIndexed { idx, candle ->
                            val centerX = (idx + 0.5f) * slotW
                            val highY = priceToY(candle.high.toDouble())
                            val lowY = priceToY(candle.low.toDouble())
                            val openY = priceToY(candle.open.toDouble())
                            val closeY = priceToY(candle.close.toDouble())

                            val color = if (candle.isBullish) {
                                bullColor
                            } else {
                                bearColor
                            }

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
                        // Line Chart Mode (Smooth Close Line + Subtle Translucent Area Fill)
                        val linePath = Path()
                        val areaPath = Path()
                        visibleSlice.forEachIndexed { idx, candle ->
                            val x = (idx + 0.5f) * slotW
                            val y = priceToY(candle.close.toDouble())
                            if (idx == 0) {
                                linePath.moveTo(x, y)
                                areaPath.moveTo(x, canvasH)
                                areaPath.lineTo(x, y)
                            } else {
                                linePath.lineTo(x, y)
                                areaPath.lineTo(x, y)
                            }
                            if (idx == visibleSlice.lastIndex) {
                                areaPath.lineTo(x, canvasH)
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
                                endY = canvasH
                            )
                        )
                        drawPath(
                            path = linePath,
                            color = lineColor,
                            style = Stroke(width = 2.6f)
                        )
                    }

                    // Render Market-Coordinate-Anchored Drawings (H-Line, V-Line, Trend Line)
                    for (drawing in tab.drawings) {
                        val isSelected = drawing.id == tab.selectedDrawingId
                        val strokeW = if (isSelected) 3.4f else 2.2f
                        when (drawing) {
                            is ChartDrawing.HorizontalLine -> {
                                val y = priceToY(drawing.price.toDouble())
                                val color = if (isSelected) hlineColor.copy(alpha = 0.85f) else hlineColor
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
                                    val color = if (isSelected) vlineColor.copy(alpha = 0.85f) else vlineColor
                                    drawLine(
                                        color = color,
                                        start = Offset(x, 0f),
                                        end = Offset(x, canvasH),
                                        strokeWidth = strokeW,
                                        pathEffect = if (isSelected) selectedDashEffect else null
                                    )
                                    if (isSelected) {
                                        drawCircle(
                                            color = color,
                                            radius = 5.5f,
                                            center = Offset(x, canvasH * 0.5f)
                                        )
                                    }
                                }
                            }
                            is ChartDrawing.TrendLine -> {
                                val x1 = timeToX(drawing.startTimeUtcMillis)
                                val y1 = priceToY(drawing.startPrice.toDouble())
                                val x2 = timeToX(drawing.endTimeUtcMillis)
                                val y2 = priceToY(drawing.endPrice.toDouble())
                                val color = if (isSelected) trendColor.copy(alpha = 0.85f) else trendColor
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
                            color = Color(0xFFA855F7),
                            radius = 6.5f,
                            center = Offset(px, py)
                        )
                    }

                    // Render Crosshair if a candle is selected
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

                // Right-side Price Y-Axis Labels + Vertical Drag Scaling Strip (Strictly LTR)
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Column(
                        modifier = Modifier
                            .align(Alignment.CenterEnd)
                            .width(66.dp)
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
                            .padding(end = 6.dp, top = 10.dp, bottom = 26.dp)
                            .testTag("chart_y_axis_scale_strip"),
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
                                fontFamily = JetBrainsMonoFontFamily,
                                color = if (tab.isAutoScaleY) {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                } else {
                                    MaterialTheme.colorScheme.primary
                                }
                            )
                        }
                    }

                    // Bottom X-Axis UTC Time Labels (Dynamic Anti-Overlap)
                    val firstCandle = visibleSlice.first()
                    val midCandle = visibleSlice[visibleSlice.size / 2]
                    val lastCandle = visibleSlice.last()
                    Row(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .fillMaxWidth()
                            .padding(start = 10.dp, end = 68.dp, bottom = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = PriceFormatterAlgorithm.formatAxisTimestamp(firstCandle.openTimeUtcMillis, tab.timeframe),
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        if (visibleSlice.size >= 4) {
                            Text(
                                text = PriceFormatterAlgorithm.formatAxisTimestamp(midCandle.openTimeUtcMillis, tab.timeframe),
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Text(
                            text = PriceFormatterAlgorithm.formatAxisTimestamp(lastCandle.openTimeUtcMillis, tab.timeframe),
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
