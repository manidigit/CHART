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

import androidx.compose.foundation.clickable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import kotlinx.coroutines.delay
import kotlin.math.exp
import kotlin.math.ln

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
    onToggleLogScale: () -> Unit = {},
    onResetToLatest: () -> Unit = {},
    onSelectCandle: (Int?) -> Unit,
    onPlaceDrawingAt: (Long, BigDecimal) -> Unit,
    onSelectDrawing: (String?) -> Unit,
    onTranslateSelectedDrawing: (Long, BigDecimal) -> Unit,
    onRetrySync: () -> Unit,
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current
    val density = LocalDensity.current
    val haptic = LocalHapticFeedback.current
    val useLogScale = tab.isLogScale || (tab.activeDateRange == "All" && preferences.logarithmicScaleDefault)

    var nowEpochMillis by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(preferences.showCountdownToBarClose) {
        if (preferences.showCountdownToBarClose) {
            while (true) {
                nowEpochMillis = System.currentTimeMillis()
                delay(1000L)
            }
        }
    }
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

    // Compute Price Y-Axis Bounds with Minimum Price Range Floor (prevents micro-spread barcode distortion)
    val rawMinPrice = visibleSlice.minOfOrNull { it.low.toDouble() } ?: 0.0
    val rawMaxPrice = visibleSlice.maxOfOrNull { it.high.toDouble() } ?: 1.0
    val midPrice = (rawMinPrice + rawMaxPrice) / 2.0
    val rawHalfSpan = (rawMaxPrice - rawMinPrice) / 2.0
    val minHalfSpanFloor = max(1e-4, abs(midPrice) * 0.0008) // Minimum 0.16% full span floor
    val baseHalfSpan = max(rawHalfSpan, minHalfSpanFloor) * 1.16
    val scaleFactor = if (tab.isAutoScaleY) 1.0 else tab.yPriceScaleFactor.coerceIn(0.25f, 4.0f).toDouble()
    val effectiveHalfSpan = baseHalfSpan * scaleFactor
    val paddedMin = midPrice - effectiveHalfSpan
    val paddedMax = midPrice + effectiveHalfSpan
    val paddedSpan = (paddedMax - paddedMin).coerceAtLeast(1e-6)
    val safeLogMin = ln(max(paddedMin, 1e-6))
    val safeLogMax = ln(max(paddedMax, 1e-5))
    val safeLogSpan = (safeLogMax - safeLogMin).coerceAtLeast(1e-6)

    fun mapPriceToNormRatio(price: Double): Float {
        return if (useLogScale && paddedMin > 0.0) {
            val lp = ln(max(price, 1e-6))
            ((safeLogMax - lp) / safeLogSpan).toFloat().coerceIn(0f, 1f)
        } else {
            ((paddedMax - price) / paddedSpan).toFloat().coerceIn(0f, 1f)
        }
    }

    fun mapNormRatioToPrice(ratio: Double): Double {
        val r = ratio.coerceIn(0.0, 1.0)
        return if (useLogScale && paddedMin > 0.0) {
            exp(safeLogMax - r * safeLogSpan)
        } else {
            paddedMax - r * paddedSpan
        }
    }

    val maxRawVolume = visibleSlice.maxOfOrNull { it.volume.toDouble() } ?: 0.0
    val hasRealVolume = maxRawVolume > 0.0
    val maxVolume = maxRawVolume.coerceAtLeast(1.0)
    val volRatio = if (tab.showVolume) tab.volumePaneRatio.coerceIn(0.15f, 0.32f) else 0f
    val priceRatio = 1f - volRatio

    val volumeUnavailableLabel = stringResource(R.string.chart_volume_unavailable)
    val loadingStateLabel = stringResource(R.string.chart_state_loading)
    val errorStateLabel = stringResource(R.string.chart_state_error)
    val emptyStateLabel = stringResource(R.string.chart_state_empty)
    val retryActionLabel = stringResource(R.string.chart_action_retry)

    // Enforce strict LTR layout direction for the entire Chart Canvas so Price Y-Axis is always
    // on the Right and OHLC Legend is always on the Top-Left without RTL/LTR overlap.
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        BoxWithConstraints(
            modifier = modifier
                .fillMaxWidth()
                .heightIn(min = 260.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.background)
                .border(1.dp, financialPalette.cardBorder, RoundedCornerShape(8.dp))
                .testTag("candlestick_canvas_${tab.tabId.lowercase()}")
        ) {
            val containerHeightDp = maxHeight
            val plotTopPadDp = 30.dp // Leaves dedicated top lane for floating OHLC legend
            val plotBottomPadDp = 22.dp
            val plotRightPadDp = 68.dp
            val plotLeftPadDp = 6.dp
            val plotHeightDp = (containerHeightDp - plotTopPadDp - plotBottomPadDp).coerceAtLeast(160.dp)
            val pricePaneHeightDp = plotHeightDp * priceRatio

            if (visibleSlice.isEmpty()) {
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
                            text = loadingStateLabel,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center
                        )
                    } else {
                        Text(
                            text = if (tab.hasError) errorStateLabel else emptyStateLabel,
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
                            Text(text = retryActionLabel)
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
                                    return (mapPriceToNormRatio(p) * pricePaneH).coerceIn(0f, pricePaneH)
                                }

                                fun yToPrice(y: Float): BigDecimal {
                                    val clampedRatio = (y / pricePaneH).coerceIn(0f, 1f).toDouble()
                                    val raw = mapNormRatioToPrice(clampedRatio)
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
                                        if (preferences.chartVibrations) {
                                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                        }
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

                    val dashEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f), 0f)
                    val currentPriceDashEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 4f), 0f)
                    val selectedDashEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 5f), 0f)

                    // 1. Horizontal price grid lines in Main Price Pane (5 levels, subtle TradingView #2A2E39)
                    for (g in 0..4) {
                        val y = pricePaneH * (g / 4f)
                        drawLine(
                            color = financialPalette.chartGrid,
                            start = Offset(0f, y),
                            end = Offset(canvasW, y),
                            strokeWidth = 1f
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
                            strokeWidth = 1f
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
                        return (mapPriceToNormRatio(p) * pricePaneH).coerceIn(0f, pricePaneH)
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
                                    strokeWidth = 1.4f
                                )

                                val topY = min(openY, closeY)
                                val bottomY = max(openY, closeY)
                                val bodyHeight = (bottomY - topY).coerceAtLeast(2.0f)
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
                            val lineColor = Color(0xFF2962FF)
                            drawPath(
                                path = areaPath,
                                brush = Brush.verticalGradient(
                                    colors = listOf(
                                        lineColor.copy(alpha = 0.28f),
                                        lineColor.copy(alpha = 0.0f)
                                    ),
                                    startY = 0f,
                                    endY = pricePaneH
                                )
                            )
                            drawPath(
                                path = linePath,
                                color = lineColor,
                                style = Stroke(width = 2.4f)
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
                                    style = Stroke(width = 2.0f)
                                )
                            }
                        }

                        // 6a. Previous Close Horizontal Dashed Line across Main Price Pane
                        if (preferences.showPrevCloseLine && candles.size >= 2) {
                            val prevCloseCandle = candles[candles.size - 2]
                            val prevY = priceToY(prevCloseCandle.close.toDouble())
                            drawLine(
                                color = Color(0xFF787B86).copy(alpha = 0.65f),
                                start = Offset(0f, prevY),
                                end = Offset(canvasW, prevY),
                                strokeWidth = 1.0f,
                                pathEffect = dashEffect
                            )
                        }

                        // 6b. Current Price Horizontal Dashed Line across Main Price Pane
                        val latestCandle = candles.lastOrNull()
                        if (latestCandle != null) {
                            val curY = priceToY(latestCandle.close.toDouble())
                            val curColor = if (latestCandle.isBullish) bullColor else bearColor
                            drawLine(
                                color = curColor.copy(alpha = 0.85f),
                                start = Offset(0f, curY),
                                end = Offset(canvasW, curY),
                                strokeWidth = 1.2f,
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
                                color = parseDrawingColor(tab.activeDrawingColorHex, Color(0xFF2962FF)),
                                radius = 6.5f,
                                center = Offset(px, py)
                            )
                        }
                    }

                    // 8. Separate Dedicated Volume Sub-Pane below Price Pane
                    if (tab.showVolume && volPaneH > 4f) {
                        drawLine(
                            color = financialPalette.cardBorder,
                            start = Offset(0f, volPaneTop),
                            end = Offset(canvasW, volPaneTop),
                            strokeWidth = 1.2f
                        )
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
                            strokeWidth = 1.2f,
                            pathEffect = dashEffect
                        )
                        drawLine(
                            color = financialPalette.crosshair,
                            start = Offset(0f, closeY),
                            end = Offset(canvasW, closeY),
                            strokeWidth = 1.2f,
                            pathEffect = dashEffect
                        )
                    }
                }

                // Floating 1-Line Translucent OHLCV + SMA20 Legend inside dedicated top lane (Top-Left, never overlapping Y-Axis)
                if (inspectedCandle != null) {
                    val changePct = PriceFormatterAlgorithm.formatSignedPercentChange(
                        open = inspectedCandle.open,
                        close = inspectedCandle.close
                    )
                    val isBull = inspectedCandle.isBullish
                    val accentColor = if (isBull) bullColor else bearColor

                    Row(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(start = 6.dp, top = 4.dp, end = plotRightPadDp + 4.dp)
                            .clip(RoundedCornerShape(5.dp))
                            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.90f))
                            .border(1.dp, financialPalette.cardBorder.copy(alpha = 0.8f), RoundedCornerShape(5.dp))
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

                // Honest Volume Sub-Pane Header / No-Volume Notice
                if (tab.showVolume) {
                    val volHeaderText = if (hasRealVolume && inspectedCandle != null) {
                        "Vol ${PriceFormatterAlgorithm.formatCompactVolume(inspectedCandle.volume)}"
                    } else {
                        volumeUnavailableLabel
                    }
                    Text(
                        text = volHeaderText,
                        style = MaterialTheme.typography.labelSmall,
                        fontSize = 9.sp,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .offset(y = plotTopPadDp + pricePaneHeightDp + 3.dp, x = 8.dp)
                            .testTag("chart_volume_pane_label")
                    )
                }

                // Right-side Price & Volume Y-Axis Strip + Current Price Pill + Crosshair Price Pill
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
                            val levelPrice = mapNormRatioToPrice(g / 4.0)
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

                    // Current Price Pill Badge + Live UTC Countdown on Right Y-Axis
                    val latestCandle = candles.lastOrNull()
                    if (latestCandle != null) {
                        val curPriceDouble = latestCandle.close.toDouble()
                        val curRatio = mapPriceToNormRatio(curPriceDouble)
                        val curOffsetPx = with(density) { (pricePaneHeightDp * curRatio - 9.dp).roundToPx() }
                        val curBg = if (latestCandle.isBullish) bullColor else bearColor
                        val remSec = max(0L, ((stepMillis - (nowEpochMillis % stepMillis)) % stepMillis) / 1000L)
                        val countdownText = remember(remSec, stepMillis) {
                            val hrs = remSec / 3600L
                            val mins = (remSec % 3600L) / 60L
                            val secs = remSec % 60L
                            if (hrs > 0L) String.format(java.util.Locale.US, "%02d:%02d:%02d", hrs, mins, secs)
                            else String.format(java.util.Locale.US, "%02d:%02d", mins, secs)
                        }
                        Column(
                            horizontalAlignment = Alignment.End,
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
                                color = Color.White
                            )
                            if (preferences.showCountdownToBarClose) {
                                Text(
                                    text = countdownText,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontSize = 8.sp,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    color = Color.White.copy(alpha = 0.9f)
                                )
                            }
                        }
                    }

                    // Crosshair Price Callout Pill on Right Y-Axis when a candle is selected
                    val selIdx = tab.selectedCandleIndex
                    if (selIdx != null && selIdx in startIndex until endIndexExclusive) {
                        val selCandle = visibleSlice[selIdx - startIndex]
                        val selRatio = mapPriceToNormRatio(selCandle.close.toDouble())
                        val selOffsetPx = with(density) { (pricePaneHeightDp * selRatio - 9.dp).roundToPx() }
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .offset { IntOffset(0, selOffsetPx) }
                                .clip(RoundedCornerShape(4.dp))
                                .background(Color(0xFF2A2E39))
                                .border(1.dp, Color(0xFF2962FF), RoundedCornerShape(4.dp))
                                .padding(horizontal = 4.dp, vertical = 1.dp)
                                .testTag("chart_crosshair_price_pill")
                        ) {
                            Text(
                                text = PriceFormatterAlgorithm.formatPrice(selCandle.close, tab.decimals),
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 9.5.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFD1D4DC)
                            )
                        }
                    }

                    // Bottom Right Axis [Auto] & [Log] TradingView Mini-Badges
                    Row(
                        modifier = Modifier.align(Alignment.BottomEnd),
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(3.dp))
                                .background(
                                    if (tab.isAutoScaleY) MaterialTheme.colorScheme.primary.copy(alpha = 0.22f)
                                    else MaterialTheme.colorScheme.surface
                                )
                                .border(
                                    1.dp,
                                    if (tab.isAutoScaleY) MaterialTheme.colorScheme.primary else financialPalette.cardBorder,
                                    RoundedCornerShape(3.dp)
                                )
                                .clickable(onClick = onResetAutoScaleY)
                                .padding(horizontal = 4.dp, vertical = 1.dp)
                                .testTag("chart_auto_axis_badge")
                        ) {
                            Text(
                                text = stringResource(R.string.chart_axis_auto),
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 8.5.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = if (tab.isAutoScaleY) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(3.dp))
                                .background(
                                    if (useLogScale) MaterialTheme.colorScheme.primary.copy(alpha = 0.22f)
                                    else MaterialTheme.colorScheme.surface
                                )
                                .border(
                                    1.dp,
                                    if (useLogScale) MaterialTheme.colorScheme.primary else financialPalette.cardBorder,
                                    RoundedCornerShape(3.dp)
                                )
                                .clickable(onClick = onToggleLogScale)
                                .padding(horizontal = 4.dp, vertical = 1.dp)
                                .testTag("chart_log_axis_badge")
                        ) {
                            Text(
                                text = stringResource(R.string.chart_axis_log),
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 8.5.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = if (useLogScale) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                // Visible High / Low Callout Labels in Main Price Pane
                if (preferences.showHighLowLabels && visibleSlice.size >= 3) {
                    val highestBar = remember(visibleSlice) { visibleSlice.maxByOrNull { it.high } }
                    val lowestBar = remember(visibleSlice) { visibleSlice.minByOrNull { it.low } }
                    if (highestBar != null && lowestBar != null) {
                        val highRatio = mapPriceToNormRatio(highestBar.high.toDouble())
                        val lowRatio = mapPriceToNormRatio(lowestBar.low.toDouble())
                        val highOffsetY = plotTopPadDp + (pricePaneHeightDp * highRatio).coerceIn(4.dp, pricePaneHeightDp - 16.dp)
                        val lowOffsetY = plotTopPadDp + (pricePaneHeightDp * lowRatio).coerceIn(4.dp, pricePaneHeightDp - 16.dp)
                        Text(
                            text = "High ${PriceFormatterAlgorithm.formatPrice(highestBar.high, tab.decimals)}",
                            style = MaterialTheme.typography.labelSmall,
                            fontSize = 8.5.sp,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = bullColor.copy(alpha = 0.9f),
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(end = plotRightPadDp + 6.dp)
                                .offset(y = highOffsetY)
                                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.78f), RoundedCornerShape(3.dp))
                                .padding(horizontal = 4.dp, vertical = 1.dp)
                        )
                        Text(
                            text = "Low ${PriceFormatterAlgorithm.formatPrice(lowestBar.low, tab.decimals)}",
                            style = MaterialTheme.typography.labelSmall,
                            fontSize = 8.5.sp,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = bearColor.copy(alpha = 0.9f),
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(end = plotRightPadDp + 6.dp)
                                .offset(y = lowOffsetY)
                                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.78f), RoundedCornerShape(3.dp))
                                .padding(horizontal = 4.dp, vertical = 1.dp)
                        )
                    }
                }

                // Floating Scroll-to-Latest («⏭») Pill Button when scrolled back in history
                if (tab.scrollOffsetFromRight > 0) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(end = plotRightPadDp + 10.dp, bottom = plotBottomPadDp + 10.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.92f))
                            .border(1.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(16.dp))
                            .clickable(onClick = onResetToLatest)
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                            .testTag("chart_scroll_to_latest_fab"),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "⏭",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
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
                                .background(Color(0xFF2A2E39))
                                .border(1.dp, Color(0xFF2962FF), RoundedCornerShape(4.dp))
                                .padding(horizontal = 6.dp, vertical = 1.dp)
                                .testTag("chart_crosshair_time_pill")
                        ) {
                            Text(
                                text = PriceFormatterAlgorithm.formatAxisTimestamp(selCandle.openTimeUtcMillis, tab.timeframe),
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 9.5.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFD1D4DC)
                            )
                        }
                    }
                }
            }
        }
    }
}
