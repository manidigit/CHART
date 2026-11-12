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
import androidx.compose.runtime.rememberUpdatedState
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

    val bullColor = preferences.bullCandleColor
    val bearColor = preferences.bearCandleColor
    val trendColor = preferences.trendLineColor
    val hlineColor = preferences.horizontalLineColor
    val vlineColor = preferences.verticalLineColor
    val candles = tab.candles
    val totalCount = candles.size
    val visibleCount = tab.visibleCandleCount.coerceIn(12, max(12, totalCount))
    val maxScrollOffset = (totalCount - visibleCount).coerceAtLeast(0)
    val effectiveScrollOffset = tab.scrollOffsetFromRight.coerceIn(0, maxScrollOffset)
    val endIndexExclusive = (totalCount - effectiveScrollOffset).coerceIn(1, max(1, totalCount))
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

    // Compute full-series overlays & oscillators once per candle list and slice O(1) to visible window
    val fullCloses = remember(candles) { candles.map { it.close.toDouble() } }
    val fullSma20 = remember(fullCloses, tab.showSma20) {
        if (!tab.showSma20 || fullCloses.isEmpty()) emptyList()
        else PriceFormatterAlgorithm.computeSmaValues(fullCloses, 20)
    }
    val visibleSma20 = remember(fullSma20, startIndex, endIndexExclusive) {
        if (fullSma20.isEmpty()) emptyList()
        else fullSma20.subList(startIndex, endIndexExclusive.coerceAtMost(fullSma20.size))
    }

    val fullSma50 = remember(fullCloses, tab.showSma50) {
        if (!tab.showSma50 || fullCloses.isEmpty()) emptyList()
        else PriceFormatterAlgorithm.computeSmaValues(fullCloses, 50)
    }
    val visibleSma50 = remember(fullSma50, startIndex, endIndexExclusive) {
        if (fullSma50.isEmpty()) emptyList()
        else fullSma50.subList(startIndex, endIndexExclusive.coerceAtMost(fullSma50.size))
    }

    val fullSma200 = remember(fullCloses, tab.showSma200) {
        if (!tab.showSma200 || fullCloses.isEmpty()) emptyList()
        else PriceFormatterAlgorithm.computeSmaValues(fullCloses, 200)
    }
    val visibleSma200 = remember(fullSma200, startIndex, endIndexExclusive) {
        if (fullSma200.isEmpty()) emptyList()
        else fullSma200.subList(startIndex, endIndexExclusive.coerceAtMost(fullSma200.size))
    }

    val fullEma20 = remember(fullCloses, tab.showEma20) {
        if (!tab.showEma20 || fullCloses.isEmpty()) emptyList()
        else PriceFormatterAlgorithm.computeEmaValues(fullCloses, 20)
    }
    val visibleEma20 = remember(fullEma20, startIndex, endIndexExclusive) {
        if (fullEma20.isEmpty()) emptyList()
        else fullEma20.subList(startIndex, endIndexExclusive.coerceAtMost(fullEma20.size))
    }

    val fullEma50 = remember(fullCloses, tab.showEma50) {
        if (!tab.showEma50 || fullCloses.isEmpty()) emptyList()
        else PriceFormatterAlgorithm.computeEmaValues(fullCloses, 50)
    }
    val visibleEma50 = remember(fullEma50, startIndex, endIndexExclusive) {
        if (fullEma50.isEmpty()) emptyList()
        else fullEma50.subList(startIndex, endIndexExclusive.coerceAtMost(fullEma50.size))
    }

    val bbPeriod = preferences.bollingerPeriod.coerceIn(5, 200)
    val bbStdDev = preferences.bollingerStdDev.coerceIn(0.5f, 5.0f).toDouble()
    val fullBollinger = remember(fullCloses, tab.showBollinger, bbPeriod, bbStdDev) {
        if (!tab.showBollinger || fullCloses.isEmpty()) emptyList()
        else PriceFormatterAlgorithm.computeBollingerBands(fullCloses, bbPeriod, bbStdDev)
    }
    val visibleBollinger = remember(fullBollinger, startIndex, endIndexExclusive) {
        if (fullBollinger.isEmpty()) emptyList()
        else fullBollinger.subList(startIndex, endIndexExclusive.coerceAtMost(fullBollinger.size))
    }

    val fullSupertrend = remember(candles, tab.showSupertrend) {
        if (!tab.showSupertrend || candles.isEmpty()) emptyList()
        else PriceFormatterAlgorithm.computeSupertrendValues(candles, 10, 3.0)
    }
    val visibleSupertrend = remember(fullSupertrend, startIndex, endIndexExclusive) {
        if (fullSupertrend.isEmpty()) emptyList()
        else fullSupertrend.subList(startIndex, endIndexExclusive.coerceAtMost(fullSupertrend.size))
    }

    val fullVwap = remember(candles, tab.showVwap) {
        if (!tab.showVwap || candles.isEmpty()) emptyList()
        else PriceFormatterAlgorithm.computeVwapValues(candles)
    }
    val visibleVwap = remember(fullVwap, startIndex, endIndexExclusive) {
        if (fullVwap.isEmpty()) emptyList()
        else fullVwap.subList(startIndex, endIndexExclusive.coerceAtMost(fullVwap.size))
    }

    val fullRsi14 = remember(fullCloses, tab.showRsi14) {
        if (!tab.showRsi14 || fullCloses.isEmpty()) emptyList()
        else PriceFormatterAlgorithm.computeRsiValues(fullCloses, 14)
    }
    val visibleRsi14 = remember(fullRsi14, startIndex, endIndexExclusive) {
        if (fullRsi14.isEmpty()) emptyList()
        else fullRsi14.subList(startIndex, endIndexExclusive.coerceAtMost(fullRsi14.size))
    }

    val fullMacd = remember(fullCloses, tab.showMacd, tab.showOverlayMacd) {
        if ((!tab.showMacd && !tab.showOverlayMacd) || fullCloses.isEmpty()) emptyList()
        else PriceFormatterAlgorithm.computeMacdValues(fullCloses, 12, 26, 9)
    }
    val visibleMacd = remember(fullMacd, startIndex, endIndexExclusive) {
        if (fullMacd.isEmpty()) emptyList()
        else fullMacd.subList(startIndex, endIndexExclusive.coerceAtMost(fullMacd.size))
    }

    val fullAtr14 = remember(candles, tab.showAtr14) {
        if (!tab.showAtr14 || candles.isEmpty()) emptyList()
        else PriceFormatterAlgorithm.computeAtrValues(candles, 14)
    }
    val visibleAtr14 = remember(fullAtr14, startIndex, endIndexExclusive) {
        if (fullAtr14.isEmpty()) emptyList()
        else fullAtr14.subList(startIndex, endIndexExclusive.coerceAtMost(fullAtr14.size))
    }

    val fullSmcResult = remember(candles, tab.showSmcStructure, tab.showFvg) {
        if ((!tab.showSmcStructure && !tab.showFvg) || candles.isEmpty()) null
        else PriceFormatterAlgorithm.detectSmcMarketStructures(candles, 3)
    }

    val visibleVolumeProfile = remember(visibleSlice, tab.showVolumeProfile) {
        if (!tab.showVolumeProfile || visibleSlice.isEmpty()) null
        else PriceFormatterAlgorithm.computeVolumeProfile(visibleSlice, 24, 0.70)
    }

    val inspectedIdx = tab.selectedCandleIndex ?: (endIndexExclusive - 1)
    val inspectedCandle = remember(tab.selectedCandleIndex, visibleSlice) {
        val idx = tab.selectedCandleIndex
        if (idx != null && idx in candles.indices) {
            candles[idx]
        } else {
            visibleSlice.lastOrNull()
        }
    }
    val inspectedSma20 = fullSma20.getOrNull(inspectedIdx)
    val inspectedSma50 = fullSma50.getOrNull(inspectedIdx)
    val inspectedSma200 = fullSma200.getOrNull(inspectedIdx)
    val inspectedEma20 = fullEma20.getOrNull(inspectedIdx)
    val inspectedEma50 = fullEma50.getOrNull(inspectedIdx)
    val inspectedBollinger = fullBollinger.getOrNull(inspectedIdx)
    val inspectedSupertrend = fullSupertrend.getOrNull(inspectedIdx)
    val inspectedVwap = fullVwap.getOrNull(inspectedIdx)
    val inspectedRsi14 = fullRsi14.getOrNull(inspectedIdx)
    val inspectedMacd = fullMacd.getOrNull(inspectedIdx)
    val inspectedAtr14 = fullAtr14.getOrNull(inspectedIdx)

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
    val rawPaddedMin = midPrice - effectiveHalfSpan
    val rawPaddedMax = midPrice + effectiveHalfSpan
    val (paddedMin, paddedMax) = PriceFormatterAlgorithm.computeNiceAxisBounds(rawPaddedMin, rawPaddedMax, 4)
    val paddedSpan = (paddedMax - paddedMin).coerceAtLeast(1e-6)
    val safeLogMin = ln(max(paddedMin, 1e-6))
    val safeLogMax = ln(max(paddedMax, 1e-5))
    val safeLogSpan = (safeLogMax - safeLogMin).coerceAtLeast(1e-6)

    val nicePriceTicks = remember(paddedMin, paddedMax) {
        PriceFormatterAlgorithm.computeNicePriceTicks(paddedMin, paddedMax, 5).sortedDescending()
    }
    val smartTimeTicks = remember(visibleTimestamps, tab.timeframe) {
        PriceFormatterAlgorithm.computeSmartTimeAxisTicks(visibleTimestamps, tab.timeframe, 4)
    }

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
    val activeOscCount = (if (tab.showRsi14) 1 else 0) + (if (tab.showMacd) 1 else 0) + (if (tab.showAtr14) 1 else 0)
    val eachOscRatio = when {
        activeOscCount == 0 -> 0f
        activeOscCount == 1 -> 0.14f
        activeOscCount == 2 -> 0.12f
        else -> 0.10f
    }
    val totalOscRatio = eachOscRatio * activeOscCount
    val baseVolRatio = if (tab.showVolume) tab.volumePaneRatio.coerceIn(0.14f, 0.30f) else 0f
    val volRatio = if (baseVolRatio + totalOscRatio > 0.48f) {
        (0.48f - totalOscRatio).coerceAtLeast(0.10f)
    } else {
        baseVolRatio
    }
    val priceRatio = (1f - volRatio - totalOscRatio).coerceAtLeast(0.48f)

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
                val currentTab by rememberUpdatedState(tab)
                val currentPreferences by rememberUpdatedState(preferences)
                val currentVisibleSlice by rememberUpdatedState(visibleSlice)
                val currentVisibleTimestamps by rememberUpdatedState(visibleTimestamps)
                val currentStartIndex by rememberUpdatedState(startIndex)
                val currentPaddedMin by rememberUpdatedState(paddedMin)
                val currentPaddedMax by rememberUpdatedState(paddedMax)
                val currentPaddedSpan by rememberUpdatedState(paddedSpan)
                val currentSafeLogMin by rememberUpdatedState(safeLogMin)
                val currentSafeLogMax by rememberUpdatedState(safeLogMax)
                val currentSafeLogSpan by rememberUpdatedState(safeLogSpan)
                val currentUseLogScale by rememberUpdatedState(useLogScale)
                val currentPriceRatio by rememberUpdatedState(priceRatio)
                val reusablePath1 = remember { Path() }
                val reusablePath2 = remember { Path() }
                val reusablePath3 = remember { Path() }

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
                        .pointerInput(tab.tabId, tab.timeframe) {
                            detectTapGestures { tapOffset ->
                                val slice = currentVisibleSlice
                                val timestamps = currentVisibleTimestamps
                                val curTab = currentTab
                                val curPrefs = currentPreferences
                                if (slice.isEmpty() || size.width <= 0 || size.height <= 0) return@detectTapGestures
                                val w = size.width.toFloat()
                                val h = size.height.toFloat()
                                val pricePaneH = (h * currentPriceRatio).coerceAtLeast(1f)

                                fun priceToYTap(p: Double): Float {
                                    val ratio = if (currentUseLogScale && currentPaddedMin > 0.0) {
                                        val lp = ln(max(p, 1e-6))
                                        ((currentSafeLogMax - lp) / currentSafeLogSpan).toFloat().coerceIn(0f, 1f)
                                    } else {
                                        ((currentPaddedMax - p) / currentPaddedSpan).toFloat().coerceIn(0f, 1f)
                                    }
                                    return (ratio * pricePaneH).coerceIn(0f, pricePaneH)
                                }

                                fun yToPriceTap(y: Float): BigDecimal {
                                    val clampedRatio = (y / pricePaneH).coerceIn(0f, 1f).toDouble()
                                    val raw = if (currentUseLogScale && currentPaddedMin > 0.0) {
                                        exp(currentSafeLogMax - clampedRatio * currentSafeLogSpan)
                                    } else {
                                        currentPaddedMax - clampedRatio * currentPaddedSpan
                                    }
                                    return CandleValidatorAlgorithm.normalizeDecimal(BigDecimal.valueOf(raw))
                                }

                                fun timeToXTap(timeMs: Long): Float {
                                    return DrawingGeometryAlgorithm.timeUtcToCanvasX(
                                        timeUtcMillis = timeMs,
                                        visibleTimestamps = timestamps,
                                        timeframeStepMillis = stepMillis,
                                        canvasWidth = w
                                    )
                                }

                                val rawTappedTimeUtc = DrawingGeometryAlgorithm.canvasXToTimeUtc(
                                    x = tapOffset.x,
                                    visibleTimestamps = timestamps,
                                    timeframeStepMillis = stepMillis,
                                    canvasWidth = w
                                )
                                val rawTappedPrice = yToPriceTap(tapOffset.y.coerceAtMost(pricePaneH))

                                val slotW = (w / slice.size.toFloat()).coerceAtLeast(1f)
                                val localCandleIdx = (tapOffset.x / slotW).toInt().coerceIn(0, slice.lastIndex)
                                val nearestCandle = slice.getOrNull(localCandleIdx)

                                val (tappedTimeUtc, tappedPrice) = if (curTab.isMagnetMode && nearestCandle != null) {
                                    val snappedP = DrawingGeometryAlgorithm.snapToCandleOhlc(
                                        open = nearestCandle.open,
                                        high = nearestCandle.high,
                                        low = nearestCandle.low,
                                        close = nearestCandle.close,
                                        rawPrice = rawTappedPrice
                                    )
                                    if (curPrefs.chartVibrations) {
                                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                    }
                                    Pair(nearestCandle.openTimeUtcMillis, snappedP)
                                } else {
                                    Pair(rawTappedTimeUtc, rawTappedPrice)
                                }

                                if (curTab.activeDrawingTool != DrawingTool.CURSOR) {
                                    onPlaceDrawingAt(tappedTimeUtc, tappedPrice)
                                } else {
                                    val hitDrawing = DrawingGeometryAlgorithm.hitTestDrawing(
                                        drawings = curTab.drawings,
                                        tapX = tapOffset.x,
                                        tapY = tapOffset.y,
                                        timeToX = ::timeToXTap,
                                        priceToY = ::priceToYTap,
                                        hitTolerancePx = curPrefs.drawingHitTolerancePx
                                    )
                                    if (hitDrawing != null) {
                                        onSelectDrawing(hitDrawing.id)
                                    } else {
                                        onSelectDrawing(null)
                                        val localIdx = (tapOffset.x / slotW).toInt()
                                            .coerceIn(0, slice.lastIndex)
                                        if (curPrefs.chartVibrations) {
                                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                        }
                                        onSelectCandle(currentStartIndex + localIdx)
                                    }
                                }
                            }
                        }
                        .pointerInput(tab.tabId, tab.timeframe) {
                            detectTransformGestures { _, pan, zoom, _ ->
                                val slice = currentVisibleSlice
                                val curTab = currentTab
                                val w = size.width.toFloat()
                                val h = size.height.toFloat()
                                val pricePaneH = (h * currentPriceRatio).coerceAtLeast(1f)
                                if (slice.isEmpty() || w <= 0f || h <= 0f) return@detectTransformGestures

                                if (abs(zoom - 1f) > 0.015f) {
                                    onPinchZoom(zoom)
                                }

                                val slotW = (w / slice.size.toFloat()).coerceAtLeast(2f)

                                if (curTab.activeDrawingTool == DrawingTool.CURSOR && curTab.selectedDrawingId != null && abs(zoom - 1f) <= 0.015f) {
                                    val deltaSlots = (pan.x / slotW).roundToLong()
                                    val deltaTimeMillis = deltaSlots * stepMillis
                                    val pricePerPx = currentPaddedSpan / pricePaneH.toDouble()
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

                    fun priceToY(p: Double): Float {
                        return (mapPriceToNormRatio(p) * pricePaneH).coerceIn(0f, pricePaneH)
                    }

                    // 1. Horizontal price grid lines in Main Price Pane aligned with nice round price ticks
                    for (tickPrice in nicePriceTicks) {
                        val y = priceToY(tickPrice)
                        drawLine(
                            color = financialPalette.chartGrid,
                            start = Offset(0f, y),
                            end = Offset(canvasW, y),
                            strokeWidth = 1f
                        )
                    }

                    // 2. Vertical time grid lines across both panes aligned with smart time ticks
                    val slotW = canvasW / visibleSlice.size.toFloat()
                    for (tick in smartTimeTicks) {
                        val x = (tick.index + 0.5f) * slotW
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

                    val bodyW = (slotW * 0.68f).coerceIn(2.5f, 18f)

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
                        // 4.0a Package 3: Session / Visible Range Volume Profile (VRVP — POC / VAH / VAL)
                        if (tab.showVolumeProfile && visibleVolumeProfile != null) {
                            val maxBarW = canvasW * 0.24f
                            for (bin in visibleVolumeProfile.bins) {
                                val yTop = priceToY(bin.high)
                                val yBot = priceToY(bin.low)
                                val barH = max(1.5f, abs(yBot - yTop) - 0.8f)
                                val totalW = bin.normWidth * maxBarW
                                if (totalW > 0.5f) {
                                    val bullRatio = if (bin.totalVol > 0.0) (bin.bullVol / bin.totalVol).toFloat() else 0.5f
                                    val bullW = totalW * bullRatio
                                    val bearW = totalW - bullW
                                    val alpha = if (bin.isPoc) 0.52f else if (bin.inValueArea) 0.30f else 0.14f
                                    val xRight = canvasW - 2f
                                    drawRect(
                                        color = bullColor.copy(alpha = alpha),
                                        topLeft = Offset(xRight - totalW, min(yTop, yBot)),
                                        size = Size(bullW, barH)
                                    )
                                    drawRect(
                                        color = bearColor.copy(alpha = alpha),
                                        topLeft = Offset(xRight - bearW, min(yTop, yBot)),
                                        size = Size(bearW, barH)
                                    )
                                }
                            }
                            val pocY = priceToY(visibleVolumeProfile.pocPrice)
                            drawLine(
                                color = Color(0xFFF97316).copy(alpha = 0.88f),
                                start = Offset(canvasW * 0.40f, pocY),
                                end = Offset(canvasW, pocY),
                                strokeWidth = 1.6f
                            )
                            val vahY = priceToY(visibleVolumeProfile.vahPrice)
                            val valY = priceToY(visibleVolumeProfile.valPrice)
                            drawLine(
                                color = Color(0xFF38BDF8).copy(alpha = 0.65f),
                                start = Offset(canvasW * 0.55f, vahY),
                                end = Offset(canvasW, vahY),
                                strokeWidth = 1.1f,
                                pathEffect = dashEffect
                            )
                            drawLine(
                                color = Color(0xFF38BDF8).copy(alpha = 0.65f),
                                start = Offset(canvasW * 0.55f, valY),
                                end = Offset(canvasW, valY),
                                strokeWidth = 1.1f,
                                pathEffect = dashEffect
                            )
                        }

                        // 4.0b Package 3: Fair Value Gaps (FVG / Imbalance Shaded Boxes) mapped from fullSmcResult
                        if (tab.showFvg && fullSmcResult != null) {
                            for (fvg in fullSmcResult.fvgs) {
                                if (fvg.endIndex < startIndex || fvg.startIndex >= endIndexExclusive) continue
                                val localStart = (fvg.startIndex - startIndex).coerceAtLeast(0)
                                val localEnd = (fvg.endIndex - startIndex).coerceAtMost(visibleSlice.lastIndex)
                                val x1 = (localStart + 0.5f) * slotW
                                val x2 = min(canvasW, (localEnd + 0.8f) * slotW)
                                val yTop = priceToY(fvg.top)
                                val yBot = priceToY(fvg.bottom)
                                val boxTop = min(yTop, yBot)
                                val boxH = max(2f, abs(yBot - yTop))
                                val boxW = max(6f, x2 - x1)
                                val fvgColor = if (fvg.direction == 1) bullColor else bearColor
                                drawRect(
                                    color = fvgColor.copy(alpha = 0.16f),
                                    topLeft = Offset(x1, boxTop),
                                    size = Size(boxW, boxH)
                                )
                                drawRect(
                                    color = fvgColor.copy(alpha = 0.50f),
                                    topLeft = Offset(x1, boxTop),
                                    size = Size(boxW, boxH),
                                    style = Stroke(width = 1.0f)
                                )
                            }
                        }

                        // 4a. Optional Bollinger Bands (Period, StdDev) Shaded Channel + Upper/Lower/Basis Lines
                        if (tab.showBollinger && visibleBollinger.isNotEmpty()) {
                            reusablePath1.reset()
                            reusablePath2.reset()
                            reusablePath3.reset()
                            var firstValidIdx = -1
                            var validCount = 0
                            visibleBollinger.forEachIndexed { idx, bb ->
                                if (bb != null) {
                                    val x = (idx + 0.5f) * slotW
                                    val uY = priceToY(bb.upper)
                                    val lY = priceToY(bb.lower)
                                    if (firstValidIdx == -1) {
                                        firstValidIdx = idx
                                        reusablePath1.moveTo(x, uY)
                                        reusablePath2.moveTo(x, lY)
                                        reusablePath3.moveTo(x, uY)
                                    } else {
                                        reusablePath1.lineTo(x, uY)
                                        reusablePath2.lineTo(x, lY)
                                        reusablePath3.lineTo(x, uY)
                                    }
                                    validCount++
                                }
                            }
                            if (validCount >= 2) {
                                for (idx in visibleBollinger.lastIndex downTo firstValidIdx) {
                                    val bb = visibleBollinger[idx] ?: continue
                                    val x = (idx + 0.5f) * slotW
                                    reusablePath3.lineTo(x, priceToY(bb.lower))
                                }
                                reusablePath3.close()
                                val bbColor = Color(0xFFA855F7)
                                drawPath(
                                    path = reusablePath3,
                                    color = bbColor.copy(alpha = 0.09f)
                                )
                                drawPath(
                                    path = reusablePath1,
                                    color = bbColor.copy(alpha = 0.80f),
                                    style = Stroke(width = 1.5f)
                                )
                                drawPath(
                                    path = reusablePath2,
                                    color = bbColor.copy(alpha = 0.80f),
                                    style = Stroke(width = 1.5f)
                                )
                            }
                        }

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
                            reusablePath1.reset()
                            reusablePath2.reset()
                            visibleSlice.forEachIndexed { idx, candle ->
                                val x = (idx + 0.5f) * slotW
                                val y = priceToY(candle.close.toDouble())
                                if (idx == 0) {
                                    reusablePath1.moveTo(x, y)
                                    reusablePath2.moveTo(x, pricePaneH)
                                    reusablePath2.lineTo(x, y)
                                } else {
                                    reusablePath1.lineTo(x, y)
                                    reusablePath2.lineTo(x, y)
                                }
                                if (idx == visibleSlice.lastIndex) {
                                    reusablePath2.lineTo(x, pricePaneH)
                                    reusablePath2.close()
                                }
                            }
                            val lineColor = Color(0xFF2962FF)
                            drawPath(
                                path = reusablePath2,
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
                                path = reusablePath1,
                                color = lineColor,
                                style = Stroke(width = 2.4f)
                            )
                        }

                        fun drawSeriesLine(series: List<Double?>, color: Color, strokeWidth: Float = 2.0f, dashed: Boolean = false) {
                            if (series.isEmpty()) return
                            reusablePath1.reset()
                            var started = false
                            series.forEachIndexed { idx, v ->
                                if (v != null) {
                                    val x = (idx + 0.5f) * slotW
                                    val y = priceToY(v)
                                    if (!started) {
                                        reusablePath1.moveTo(x, y)
                                        started = true
                                    } else {
                                        reusablePath1.lineTo(x, y)
                                    }
                                }
                            }
                            if (started) {
                                drawPath(
                                    path = reusablePath1,
                                    color = color,
                                    style = Stroke(
                                        width = strokeWidth,
                                        pathEffect = if (dashed) dashEffect else null
                                    )
                                )
                            }
                        }

                        // 5a. SMA 20 / 50 / 200 & EMA 20 / 50 & Session VWAP
                        if (tab.showSma20) drawSeriesLine(visibleSma20, Color(0xFFF59E0B), 2.0f)
                        if (tab.showSma50) drawSeriesLine(visibleSma50, Color(0xFF10B981), 2.0f)
                        if (tab.showSma200) drawSeriesLine(visibleSma200, Color(0xFFF43F5E), 2.3f)
                        if (tab.showEma20) drawSeriesLine(visibleEma20, Color(0xFF38BDF8), 1.9f)
                        if (tab.showEma50) drawSeriesLine(visibleEma50, Color(0xFF06B6D4), 2.0f)
                        if (tab.showVwap) drawSeriesLine(visibleVwap, Color(0xFFEAB308), 1.9f, dashed = true)

                        // 5b. Supertrend (10, 3) Directional Segments
                        if (tab.showSupertrend && visibleSupertrend.isNotEmpty()) {
                            for (i in 1 until visibleSupertrend.size) {
                                val prev = visibleSupertrend[i - 1] ?: continue
                                val cur = visibleSupertrend[i] ?: continue
                                val x1 = (i - 0.5f) * slotW
                                val y1 = priceToY(prev.value)
                                val x2 = (i + 0.5f) * slotW
                                val y2 = priceToY(cur.value)
                                val stColor = if (cur.direction == 1) Color(0xFF22C55E) else Color(0xFFEF4444)
                                drawLine(
                                    color = stColor,
                                    start = Offset(x1, y1),
                                    end = Offset(x2, y2),
                                    strokeWidth = 2.3f
                                )
                            }
                        }

                        // 5c. Package 3: Smart Money Concepts (BOS / CHoCH & EQH / EQL) mapped from fullSmcResult
                        if (tab.showSmcStructure && fullSmcResult != null) {
                            for (st in fullSmcResult.structures) {
                                if (st.breakIndex < startIndex || st.startIndex >= endIndexExclusive) continue
                                val localStart = (st.startIndex - startIndex).coerceIn(0, visibleSlice.lastIndex)
                                val localBreak = (st.breakIndex - startIndex).coerceIn(0, visibleSlice.lastIndex)
                                val x1 = (localStart + 0.5f) * slotW
                                val x2 = (localBreak + 0.5f) * slotW
                                val y = priceToY(st.price)
                                val stColor = if (st.direction == 1) Color(0xFF22C55E) else Color(0xFFEF4444)
                                drawLine(
                                    color = stColor,
                                    start = Offset(x1, y),
                                    end = Offset(x2, y),
                                    strokeWidth = if (st.type == "CHoCH") 2.1f else 1.6f,
                                    pathEffect = if (st.type == "CHoCH") null else dashEffect
                                )
                                drawCircle(
                                    color = stColor,
                                    radius = 3.5f,
                                    center = Offset(x2, y)
                                )
                            }
                            for (eq in fullSmcResult.equalLevels) {
                                if (eq.endIndex < startIndex || eq.startIndex >= endIndexExclusive) continue
                                val localStart = (eq.startIndex - startIndex).coerceIn(0, visibleSlice.lastIndex)
                                val localEnd = (eq.endIndex - startIndex).coerceIn(0, visibleSlice.lastIndex)
                                val x1 = (localStart + 0.5f) * slotW
                                val x2 = (localEnd + 0.5f) * slotW
                                val y = priceToY(eq.price)
                                val eqColor = if (eq.type == "EQH") Color(0xFFF59E0B) else Color(0xFF38BDF8)
                                drawLine(
                                    color = eqColor,
                                    start = Offset(x1, y),
                                    end = Offset(x2, y),
                                    strokeWidth = 1.5f,
                                    pathEffect = dashEffect
                                )
                                drawCircle(color = eqColor, radius = 3.0f, center = Offset(x1, y))
                                drawCircle(color = eqColor, radius = 3.0f, center = Offset(x2, y))
                            }
                        }

                        // 5d. Overlay Classic MACD directly on Main Price Canvas (without separate bottom pane)
                        if (tab.showOverlayMacd && visibleMacd.isNotEmpty()) {
                            var maxAbs = 1e-6
                            for (pt in visibleMacd) {
                                if (pt != null) {
                                    maxAbs = max(maxAbs, abs(pt.macd))
                                    pt.signal?.let { maxAbs = max(maxAbs, abs(it)) }
                                    pt.histogram?.let { maxAbs = max(maxAbs, abs(it)) }
                                }
                            }
                            val overlayTop = pricePaneH * 0.70f
                            val overlayBot = pricePaneH * 0.98f
                            val overlayMidY = (overlayTop + overlayBot) / 2f
                            val overlayHalfH = ((overlayBot - overlayTop) / 2f - 4f).coerceAtLeast(4f)
                            drawLine(
                                color = Color(0xFF94A3B8).copy(alpha = 0.35f),
                                start = Offset(0f, overlayMidY),
                                end = Offset(canvasW, overlayMidY),
                                strokeWidth = 1.0f,
                                pathEffect = dashEffect
                            )
                            reusablePath1.reset()
                            reusablePath2.reset()
                            var mStarted = false
                            var sStarted = false
                            val histBarW = (slotW * 0.54f).coerceIn(2f, 12f)
                            visibleMacd.forEachIndexed { idx, pt ->
                                if (pt != null) {
                                    val x = (idx + 0.5f) * slotW
                                    pt.histogram?.let { histVal ->
                                        val histY = overlayMidY - ((histVal / maxAbs).toFloat() * overlayHalfH)
                                        val hTop = min(overlayMidY, histY)
                                        val hHeight = max(1.5f, abs(histY - overlayMidY))
                                        val hColor = if (histVal >= 0.0) bullColor.copy(alpha = 0.48f) else bearColor.copy(alpha = 0.48f)
                                        drawRect(
                                            color = hColor,
                                            topLeft = Offset(x - histBarW / 2f, hTop),
                                            size = Size(histBarW, hHeight)
                                        )
                                    }
                                    val mY = overlayMidY - ((pt.macd / maxAbs).toFloat() * overlayHalfH)
                                    if (!mStarted) {
                                        reusablePath1.moveTo(x, mY)
                                        mStarted = true
                                    } else {
                                        reusablePath1.lineTo(x, mY)
                                    }
                                    pt.signal?.let { sigVal ->
                                        val sY = overlayMidY - ((sigVal / maxAbs).toFloat() * overlayHalfH)
                                        if (!sStarted) {
                                            reusablePath2.moveTo(x, sY)
                                            sStarted = true
                                        } else {
                                            reusablePath2.lineTo(x, sY)
                                        }
                                    }
                                }
                            }
                            if (mStarted) {
                                drawPath(path = reusablePath1, color = Color(0xFF2962FF), style = Stroke(width = 2.0f))
                            }
                            if (sStarted) {
                                drawPath(path = reusablePath2, color = Color(0xFFFF6D00), style = Stroke(width = 1.8f))
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
                                is ChartDrawing.FibRetracement -> {
                                    val levels = drawing.computeLevels()
                                    val x1 = timeToX(drawing.startTimeUtcMillis)
                                    val y1 = priceToY(drawing.startPrice.toDouble())
                                    val x2 = timeToX(drawing.endTimeUtcMillis)
                                    val y2 = priceToY(drawing.endPrice.toDouble())
                                    val minX = min(x1, x2)
                                    val maxX = max(x1, x2).coerceAtLeast(minX + 32f)
                                    val baseColor = parseDrawingColor(drawing.colorHex, Color(0xFF2962FF))
                                    val color = if (isSelected) baseColor.copy(alpha = 0.95f) else baseColor

                                    // Golden pocket shading (0.5 to 0.618)
                                    val p05 = levels.firstOrNull { it.ratio == 0.5 }?.price ?: drawing.startPrice
                                    val p0618 = levels.firstOrNull { it.ratio == 0.618 }?.price ?: drawing.endPrice
                                    val y05 = priceToY(p05.toDouble())
                                    val y0618 = priceToY(p0618.toDouble())
                                    drawRect(
                                        color = Color(0xFFF59E0B).copy(alpha = 0.20f),
                                        topLeft = Offset(minX, min(y05, y0618)),
                                        size = Size(maxX - minX, abs(y0618 - y05).coerceAtLeast(1f))
                                    )

                                    // Subtle 0.382-0.5 shading
                                    val p0382 = levels.firstOrNull { it.ratio == 0.382 }?.price
                                    if (p0382 != null) {
                                        val y0382 = priceToY(p0382.toDouble())
                                        drawRect(
                                            color = Color(0xFF26A69A).copy(alpha = 0.10f),
                                            topLeft = Offset(minX, min(y0382, y05)),
                                            size = Size(maxX - minX, abs(y05 - y0382).coerceAtLeast(1f))
                                        )
                                    }

                                    // Anchor trend dashed line
                                    drawLine(
                                        color = color.copy(alpha = 0.6f),
                                        start = Offset(x1, y1),
                                        end = Offset(x2, y2),
                                        strokeWidth = 1.2f,
                                        pathEffect = selectedDashEffect
                                    )

                                    // Retracement level lines
                                    for (spec in levels) {
                                        val ly = priceToY(spec.price.toDouble())
                                        val isGolden = spec.ratio == 0.5 || spec.ratio == 0.618
                                        val lvlColor = if (isGolden) Color(0xFFF59E0B) else color.copy(alpha = 0.85f)
                                        drawLine(
                                            color = lvlColor,
                                            start = Offset(minX, ly),
                                            end = Offset(maxX, ly),
                                            strokeWidth = if (isGolden) strokeW + 0.4f else strokeW
                                        )
                                        drawCircle(
                                            color = lvlColor,
                                            radius = if (isSelected) 4.5f else 3f,
                                            center = Offset(minX, ly)
                                        )
                                    }

                                    // Anchor handles
                                    drawCircle(color = color, radius = if (isSelected) 6.5f else 4.5f, center = Offset(x1, y1))
                                    drawCircle(color = color, radius = if (isSelected) 6.5f else 4.5f, center = Offset(x2, y2))
                                }
                                is ChartDrawing.LongPosition -> {
                                    val entryY = priceToY(drawing.entryPrice.toDouble())
                                    val targetY = priceToY(drawing.targetPrice.toDouble())
                                    val stopY = priceToY(drawing.stopPrice.toDouble())
                                    val startX = timeToX(drawing.startTimeUtcMillis)
                                    val endX = timeToX(drawing.endTimeUtcMillis)
                                    val leftX = min(startX, endX)
                                    val rightX = max(startX, endX).coerceAtLeast(leftX + 45f)
                                    val boxW = rightX - leftX

                                    // Target box (Green / Bullish)
                                    val targetTop = min(targetY, entryY)
                                    val targetH = abs(entryY - targetY).coerceAtLeast(2f)
                                    drawRect(
                                        color = Color(0xFF26A69A).copy(alpha = 0.22f),
                                        topLeft = Offset(leftX, targetTop),
                                        size = Size(boxW, targetH)
                                    )
                                    drawLine(
                                        color = Color(0xFF26A69A),
                                        start = Offset(leftX, targetY),
                                        end = Offset(rightX, targetY),
                                        strokeWidth = strokeW + 0.5f
                                    )

                                    // Stop box (Red / Bearish)
                                    val stopTop = min(entryY, stopY)
                                    val stopH = abs(stopY - entryY).coerceAtLeast(2f)
                                    drawRect(
                                        color = Color(0xFFEF5350).copy(alpha = 0.22f),
                                        topLeft = Offset(leftX, stopTop),
                                        size = Size(boxW, stopH)
                                    )
                                    drawLine(
                                        color = Color(0xFFEF5350),
                                        start = Offset(leftX, stopY),
                                        end = Offset(rightX, stopY),
                                        strokeWidth = strokeW + 0.5f
                                    )

                                    // Entry Line (White / Neutral)
                                    drawLine(
                                        color = Color.White.copy(alpha = 0.90f),
                                        start = Offset(leftX, entryY),
                                        end = Offset(rightX, entryY),
                                        strokeWidth = strokeW
                                    )

                                    if (isSelected) {
                                        drawCircle(color = Color.White, radius = 5.5f, center = Offset(leftX, entryY))
                                        drawCircle(color = Color(0xFF26A69A), radius = 5.5f, center = Offset(rightX, targetY))
                                        drawCircle(color = Color(0xFFEF5350), radius = 5.5f, center = Offset(rightX, stopY))
                                    }
                                }
                                is ChartDrawing.ShortPosition -> {
                                    val entryY = priceToY(drawing.entryPrice.toDouble())
                                    val targetY = priceToY(drawing.targetPrice.toDouble())
                                    val stopY = priceToY(drawing.stopPrice.toDouble())
                                    val startX = timeToX(drawing.startTimeUtcMillis)
                                    val endX = timeToX(drawing.endTimeUtcMillis)
                                    val leftX = min(startX, endX)
                                    val rightX = max(startX, endX).coerceAtLeast(leftX + 45f)
                                    val boxW = rightX - leftX

                                    // Target box (Green / Bullish profit below entry)
                                    val targetTop = min(entryY, targetY)
                                    val targetH = abs(targetY - entryY).coerceAtLeast(2f)
                                    drawRect(
                                        color = Color(0xFF26A69A).copy(alpha = 0.22f),
                                        topLeft = Offset(leftX, targetTop),
                                        size = Size(boxW, targetH)
                                    )
                                    drawLine(
                                        color = Color(0xFF26A69A),
                                        start = Offset(leftX, targetY),
                                        end = Offset(rightX, targetY),
                                        strokeWidth = strokeW + 0.5f
                                    )

                                    // Stop box (Red / Bearish loss above entry)
                                    val stopTop = min(stopY, entryY)
                                    val stopH = abs(entryY - stopY).coerceAtLeast(2f)
                                    drawRect(
                                        color = Color(0xFFEF5350).copy(alpha = 0.22f),
                                        topLeft = Offset(leftX, stopTop),
                                        size = Size(boxW, stopH)
                                    )
                                    drawLine(
                                        color = Color(0xFFEF5350),
                                        start = Offset(leftX, stopY),
                                        end = Offset(rightX, stopY),
                                        strokeWidth = strokeW + 0.5f
                                    )

                                    // Entry Line (White / Neutral)
                                    drawLine(
                                        color = Color.White.copy(alpha = 0.90f),
                                        start = Offset(leftX, entryY),
                                        end = Offset(rightX, entryY),
                                        strokeWidth = strokeW
                                    )

                                    if (isSelected) {
                                        drawCircle(color = Color.White, radius = 5.5f, center = Offset(leftX, entryY))
                                        drawCircle(color = Color(0xFF26A69A), radius = 5.5f, center = Offset(rightX, targetY))
                                        drawCircle(color = Color(0xFFEF5350), radius = 5.5f, center = Offset(rightX, stopY))
                                    }
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

                    // 8. Separate Dedicated Volume Sub-Pane & Multi-Pane Oscillators (RSI 14, MACD, ATR 14)
                    val actualVolH = if (tab.showVolume) canvasH * volRatio else 0f
                    var nextSubPaneTop = pricePaneH
                    if (tab.showVolume && actualVolH > 4f) {
                        val vTop = nextSubPaneTop
                        val vBot = vTop + actualVolH
                        nextSubPaneTop = vBot
                        drawLine(
                            color = financialPalette.cardBorder,
                            start = Offset(0f, vTop),
                            end = Offset(canvasW, vTop),
                            strokeWidth = 1.2f
                        )
                        val midVolY = vTop + actualVolH * 0.5f
                        drawLine(
                            color = financialPalette.chartGrid.copy(alpha = 0.6f),
                            start = Offset(0f, midVolY),
                            end = Offset(canvasW, midVolY),
                            strokeWidth = 1f,
                            pathEffect = dashEffect
                        )

                        if (hasRealVolume) {
                            val usableVolH = (actualVolH - 6f).coerceAtLeast(2f)
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
                                        topLeft = Offset(centerX - bodyW / 2f, vBot - barH),
                                        size = Size(bodyW, barH)
                                    )
                                }
                            }
                        }
                    }

                    val oscPaneH = canvasH * eachOscRatio
                    // 8b. RSI (14) Synchronized Sub-Pane
                    if (tab.showRsi14 && oscPaneH > 8f) {
                        val rTop = nextSubPaneTop
                        val rBot = rTop + oscPaneH
                        nextSubPaneTop = rBot
                        drawLine(
                            color = financialPalette.cardBorder,
                            start = Offset(0f, rTop),
                            end = Offset(canvasW, rTop),
                            strokeWidth = 1.2f
                        )
                        fun rsiToY(v: Double): Float {
                            val clamped = v.coerceIn(0.0, 100.0).toFloat()
                            return rTop + 3f + (1f - clamped / 100f) * (oscPaneH - 6f).coerceAtLeast(2f)
                        }
                        val y70 = rsiToY(70.0)
                        val y30 = rsiToY(30.0)
                        drawRect(
                            color = Color(0xFFEC4899).copy(alpha = 0.07f),
                            topLeft = Offset(0f, min(y70, y30)),
                            size = Size(canvasW, abs(y30 - y70).coerceAtLeast(1f))
                        )
                        drawLine(color = financialPalette.chartGrid, start = Offset(0f, y70), end = Offset(canvasW, y70), strokeWidth = 1f, pathEffect = dashEffect)
                        drawLine(color = financialPalette.chartGrid, start = Offset(0f, y30), end = Offset(canvasW, y30), strokeWidth = 1f, pathEffect = dashEffect)

                        reusablePath1.reset()
                        var started = false
                        visibleRsi14.forEachIndexed { idx, rv ->
                            if (rv != null) {
                                val x = (idx + 0.5f) * slotW
                                val y = rsiToY(rv)
                                if (!started) {
                                    reusablePath1.moveTo(x, y)
                                    started = true
                                } else {
                                    reusablePath1.lineTo(x, y)
                                }
                            }
                        }
                        if (started) {
                            drawPath(path = reusablePath1, color = Color(0xFFEC4899), style = Stroke(width = 1.8f))
                        }
                    }

                    // 8c. MACD (12, 26, 9) Synchronized Sub-Pane
                    if (tab.showMacd && oscPaneH > 8f) {
                        val mTop = nextSubPaneTop
                        val mBot = mTop + oscPaneH
                        nextSubPaneTop = mBot
                        drawLine(
                            color = financialPalette.cardBorder,
                            start = Offset(0f, mTop),
                            end = Offset(canvasW, mTop),
                            strokeWidth = 1.2f
                        )
                        var maxAbs = 1e-6
                        for (pt in visibleMacd) {
                            if (pt != null) {
                                maxAbs = max(maxAbs, abs(pt.macd))
                                if (pt.signal != null) maxAbs = max(maxAbs, abs(pt.signal))
                                if (pt.histogram != null) maxAbs = max(maxAbs, abs(pt.histogram))
                            }
                        }
                        val zeroY = mTop + oscPaneH * 0.5f
                        val halfH = (oscPaneH * 0.42f).coerceAtLeast(2f)
                        drawLine(color = financialPalette.chartGrid, start = Offset(0f, zeroY), end = Offset(canvasW, zeroY), strokeWidth = 1f, pathEffect = dashEffect)

                        reusablePath1.reset()
                        reusablePath2.reset()
                        var mStarted = false
                        var sStarted = false

                        visibleMacd.forEachIndexed { idx, pt ->
                            if (pt != null) {
                                val x = (idx + 0.5f) * slotW
                                if (pt.histogram != null) {
                                    val hY = zeroY - (pt.histogram / maxAbs).toFloat() * halfH
                                    val barTop = min(zeroY, hY)
                                    val barH = abs(hY - zeroY).coerceAtLeast(1.2f)
                                    val hColor = if (pt.histogram >= 0.0) bullColor.copy(alpha = 0.55f) else bearColor.copy(alpha = 0.55f)
                                    drawRect(
                                        color = hColor,
                                        topLeft = Offset(x - bodyW / 2f, barTop),
                                        size = Size(bodyW, barH)
                                    )
                                }
                                val my = zeroY - (pt.macd / maxAbs).toFloat() * halfH
                                if (!mStarted) {
                                    reusablePath1.moveTo(x, my)
                                    mStarted = true
                                } else {
                                    reusablePath1.lineTo(x, my)
                                }
                                if (pt.signal != null) {
                                    val sy = zeroY - (pt.signal / maxAbs).toFloat() * halfH
                                    if (!sStarted) {
                                        reusablePath2.moveTo(x, sy)
                                        sStarted = true
                                    } else {
                                        reusablePath2.lineTo(x, sy)
                                    }
                                }
                            }
                        }
                        if (mStarted) drawPath(path = reusablePath1, color = Color(0xFF3B82F6), style = Stroke(width = 1.7f))
                        if (sStarted) drawPath(path = reusablePath2, color = Color(0xFFF59E0B), style = Stroke(width = 1.5f))
                    }

                    // 8d. ATR (14) Synchronized Sub-Pane
                    if (tab.showAtr14 && oscPaneH > 8f) {
                        val aTop = nextSubPaneTop
                        val aBot = aTop + oscPaneH
                        nextSubPaneTop = aBot
                        drawLine(
                            color = financialPalette.cardBorder,
                            start = Offset(0f, aTop),
                            end = Offset(canvasW, aTop),
                            strokeWidth = 1.2f
                        )
                        val validAtrs = visibleAtr14.filterNotNull()
                        if (validAtrs.isNotEmpty()) {
                            val minAtr = validAtrs.minOrNull() ?: 0.0
                            val maxAtr = validAtrs.maxOrNull() ?: 1.0
                            val spanAtr = (maxAtr - minAtr).coerceAtLeast(1e-6)
                            reusablePath1.reset()
                            var started = false
                            visibleAtr14.forEachIndexed { idx, av ->
                                if (av != null) {
                                    val x = (idx + 0.5f) * slotW
                                    val norm = ((av - minAtr) / spanAtr).toFloat().coerceIn(0f, 1f)
                                    val y = aBot - 3f - norm * (oscPaneH - 6f).coerceAtLeast(2f)
                                    if (!started) {
                                        reusablePath1.moveTo(x, y)
                                        started = true
                                    } else {
                                        reusablePath1.lineTo(x, y)
                                    }
                                }
                            }
                            if (started) {
                                drawPath(path = reusablePath1, color = Color(0xFFF97316), style = Stroke(width = 1.8f))
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

                // Floating 1-Line Translucent OHLCV + SMA20 / EMA50 / BB20 Legend inside dedicated top lane
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
                        if (tab.showSma50 && inspectedSma50 != null) {
                            Text(
                                text = "SMA50 ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(inspectedSma50), tab.decimals)}",
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF10B981)
                            )
                        }
                        if (tab.showSma200 && inspectedSma200 != null) {
                            Text(
                                text = "SMA200 ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(inspectedSma200), tab.decimals)}",
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFF43F5E)
                            )
                        }
                        if (tab.showEma20 && inspectedEma20 != null) {
                            Text(
                                text = "EMA20 ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(inspectedEma20), tab.decimals)}",
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF38BDF8)
                            )
                        }
                        if (tab.showEma50 && inspectedEma50 != null) {
                            Text(
                                text = "EMA50 ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(inspectedEma50), tab.decimals)}",
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF06B6D4)
                            )
                        }
                        if (tab.showSupertrend && inspectedSupertrend != null) {
                            val stDir = if (inspectedSupertrend.direction == 1) "▲" else "▼"
                            Text(
                                text = "ST $stDir ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(inspectedSupertrend.value), tab.decimals)}",
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = if (inspectedSupertrend.direction == 1) Color(0xFF22C55E) else Color(0xFFEF4444)
                            )
                        }
                        if (tab.showVwap && inspectedVwap != null) {
                            Text(
                                text = "VWAP ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(inspectedVwap), tab.decimals)}",
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFEAB308)
                            )
                        }
                        if (tab.showBollinger && inspectedBollinger != null) {
                            Text(
                                text = "BB($bbPeriod,${String.format(java.util.Locale.US, "%.1f", bbStdDev)}) ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(inspectedBollinger.lower), tab.decimals)}–${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(inspectedBollinger.upper), tab.decimals)}",
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFA855F7)
                            )
                        }
                        if (tab.showRsi14 && inspectedRsi14 != null) {
                            Text(
                                text = "RSI14 ${String.format(java.util.Locale.US, "%.1f", inspectedRsi14)}",
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFEC4899)
                            )
                        }
                        if ((tab.showMacd || tab.showOverlayMacd) && inspectedMacd != null) {
                            val macdTag = if (tab.showOverlayMacd) "MACD(Ovr)" else "MACD"
                            Text(
                                text = "$macdTag ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(inspectedMacd.macd), tab.decimals)}",
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF3B82F6)
                            )
                        }
                        if (tab.showAtr14 && inspectedAtr14 != null) {
                            Text(
                                text = "ATR14 ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(inspectedAtr14), tab.decimals)}",
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFF97316)
                            )
                        }
                        if (tab.showVolumeProfile && visibleVolumeProfile != null) {
                            Text(
                                text = "POC ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(visibleVolumeProfile.pocPrice), tab.decimals)}",
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFF97316)
                            )
                        }
                        if (tab.showSmcStructure && fullSmcResult != null) {
                            val latestBrk = fullSmcResult.structures.lastOrNull { it.breakIndex < endIndexExclusive }
                            Text(
                                text = if (latestBrk != null) "SMC ${latestBrk.type}" else "SMC ON",
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF14B8A6)
                            )
                        }
                        if (tab.showFvg && fullSmcResult != null) {
                            val visFvgCount = fullSmcResult.fvgs.count { it.endIndex >= startIndex && it.startIndex < endIndexExclusive }
                            Text(
                                text = "FVG ($visFvgCount)",
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF6366F1)
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
                    // Price Pane Y-Axis Labels positioned at exact Heckbert nice round price ticks
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(pricePaneHeightDp)
                    ) {
                        for (tickPrice in nicePriceTicks) {
                            val ratio = mapPriceToNormRatio(tickPrice)
                            val yOffsetDp = (pricePaneHeightDp * ratio - 7.dp).coerceIn(0.dp, (pricePaneHeightDp - 14.dp).coerceAtLeast(0.dp))
                            Text(
                                text = PriceFormatterAlgorithm.formatPrice(
                                    BigDecimal.valueOf(tickPrice),
                                    tab.decimals
                                ),
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = if (tab.isAutoScaleY) {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                } else {
                                    MaterialTheme.colorScheme.primary
                                },
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .offset(y = yOffsetDp)
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

                    // Current Price Pill Badge + Live UTC Countdown on Right Y-Axis (Intraday timeframes only)
                    val latestCandle = candles.lastOrNull()
                    if (latestCandle != null) {
                        val curPriceDouble = latestCandle.close.toDouble()
                        val curRatio = mapPriceToNormRatio(curPriceDouble)
                        val curOffsetPx = with(density) { (pricePaneHeightDp * curRatio - 9.dp).roundToPx() }
                        val curBg = if (latestCandle.isBullish) bullColor else bearColor
                        val isIntradayTf = tab.timeframe.uppercase() !in listOf("D1", "W1")
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
                            if (preferences.showCountdownToBarClose && isIntradayTf) {
                                BarCloseCountdownText(stepMillis = stepMillis)
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

                // Bottom X-Axis Smart Span-Aware UTC Time Labels + Crosshair Time Callout Pill
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
                        for (tick in smartTimeTicks) {
                            Text(
                                text = tick.label,
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = if (tick.isMajor) FontWeight.Bold else FontWeight.Normal,
                                color = if (tick.isMajor) {
                                    MaterialTheme.colorScheme.onSurface
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                }
                            )
                        }
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

@Composable
private fun BarCloseCountdownText(stepMillis: Long) {
    var nowEpochMillis by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(stepMillis) {
        while (true) {
            nowEpochMillis = System.currentTimeMillis()
            delay(1000L)
        }
    }
    val remSec = max(0L, ((stepMillis - (nowEpochMillis % stepMillis)) % stepMillis) / 1000L)
    val countdownText = remember(remSec, stepMillis) {
        val hrs = remSec / 3600L
        val mins = (remSec % 3600L) / 60L
        val secs = remSec % 60L
        if (hrs > 0L) String.format(java.util.Locale.US, "%02d:%02d:%02d", hrs, mins, secs)
        else String.format(java.util.Locale.US, "%02d:%02d", mins, secs)
    }
    Text(
        text = countdownText,
        style = MaterialTheme.typography.labelSmall,
        fontSize = 8.sp,
        fontFamily = JetBrainsMonoFontFamily,
        color = Color.White.copy(alpha = 0.9f)
    )
}
