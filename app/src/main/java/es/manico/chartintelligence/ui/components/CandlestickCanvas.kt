package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CenterFocusStrong
import androidx.compose.material.icons.outlined.ZoomIn
import androidx.compose.material.icons.outlined.ZoomOut
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

@Composable
fun CandlestickCanvas(
    tab: ChartTabState,
    onZoom: (Boolean) -> Unit,
    onPanCandles: (Int) -> Unit,
    onResetLatest: () -> Unit,
    onSelectCandle: (Int?) -> Unit,
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current
    val candles = tab.candles
    val totalCount = candles.size
    val visibleCount = tab.visibleCandleCount.coerceIn(10, max(10, totalCount))
    val endIndexExclusive = (totalCount - tab.scrollOffsetFromRight).coerceIn(1, max(1, totalCount))
    val startIndex = (endIndexExclusive - visibleCount).coerceAtLeast(0)
    val visibleSlice = remember(candles, startIndex, endIndexExclusive) {
        if (candles.isEmpty()) emptyList() else candles.subList(startIndex, endIndexExclusive)
    }

    val inspectedCandle = remember(tab.selectedCandleIndex, visibleSlice) {
        val idx = tab.selectedCandleIndex
        if (idx != null && idx in candles.indices) {
            candles[idx]
        } else {
            visibleSlice.lastOrNull()
        }
    }

    Column(modifier = modifier.fillMaxWidth()) {
        // OHLC + Timestamp Inspection Bar (Strictly LTR Latin digits)
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
                        horizontalArrangement = Arrangement.SpaceBetween
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
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Main Candlestick Chart Canvas + Right Price Scale Overlay
        val minPrice = visibleSlice.minOfOrNull { it.low.toDouble() } ?: 0.0
        val maxPrice = visibleSlice.maxOfOrNull { it.high.toDouble() } ?: 1.0
        val priceRange = (maxPrice - minPrice).coerceAtLeast(1e-6)
        val paddedMin = minPrice - priceRange * 0.06
        val paddedMax = maxPrice + priceRange * 0.06
        val paddedSpan = (paddedMax - paddedMin).coerceAtLeast(1e-6)

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(310.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, financialPalette.cardBorder, RoundedCornerShape(12.dp))
                .testTag("candlestick_canvas_${tab.tabId.lowercase()}")
        ) {
            Canvas(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(start = 8.dp, end = 64.dp, top = 12.dp, bottom = 24.dp)
                    .pointerInput(visibleSlice, startIndex) {
                        detectTapGestures { tapOffset ->
                            if (visibleSlice.isNotEmpty() && size.width > 0) {
                                val slotWidth = size.width.toFloat() / visibleSlice.size.toFloat()
                                val localIndex = (tapOffset.x / slotWidth).toInt()
                                    .coerceIn(0, visibleSlice.lastIndex)
                                onSelectCandle(startIndex + localIndex)
                            }
                        }
                    }
                    .pointerInput(visibleSlice) {
                        detectHorizontalDragGestures { change, dragAmount ->
                            change.consume()
                            if (visibleSlice.isNotEmpty() && size.width > 0) {
                                val slotWidth = (size.width.toFloat() / visibleSlice.size.toFloat()).coerceAtLeast(4f)
                                val deltaBars = (dragAmount / slotWidth).roundToInt()
                                if (deltaBars != 0) {
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
                // Horizontal price grid lines
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

                // Vertical time grid lines
                for (v in 1..3) {
                    val x = canvasW * (v / 4f)
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

                visibleSlice.forEachIndexed { idx, candle ->
                    val centerX = (idx + 0.5f) * slotW
                    val highY = priceToY(candle.high.toDouble())
                    val lowY = priceToY(candle.low.toDouble())
                    val openY = priceToY(candle.open.toDouble())
                    val closeY = priceToY(candle.close.toDouble())

                    val color = if (candle.isBullish) {
                        financialPalette.bullCandle
                    } else {
                        financialPalette.bearCandle
                    }

                    // High-Low Wick
                    drawLine(
                        color = color,
                        start = Offset(centerX, highY),
                        end = Offset(centerX, lowY),
                        strokeWidth = 1.6f
                    )

                    // Open-Close Body
                    val topY = min(openY, closeY)
                    val bottomY = max(openY, closeY)
                    val bodyHeight = (bottomY - topY).coerceAtLeast(2.2f)
                    drawRect(
                        color = color,
                        topLeft = Offset(centerX - bodyW / 2f, topY),
                        size = Size(bodyW, bodyHeight)
                    )

                    // Crosshair if selected
                    val globalIndex = startIndex + idx
                    if (tab.selectedCandleIndex == globalIndex) {
                        drawLine(
                            color = financialPalette.crosshair,
                            start = Offset(centerX, 0f),
                            end = Offset(centerX, canvasH),
                            strokeWidth = 1.5f,
                            pathEffect = dashEffect
                        )
                        drawLine(
                            color = financialPalette.crosshair,
                            start = Offset(0f, closeY),
                            end = Offset(canvasW, closeY),
                            strokeWidth = 1.5f,
                            pathEffect = dashEffect
                        )
                    }
                }
            }

            // Right-side Price Axis Labels (Strictly LTR)
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Column(
                    modifier = Modifier
                        .align(Alignment.CenterEnd)
                        .height(310.dp)
                        .padding(end = 6.dp, top = 10.dp, bottom = 24.dp),
                    verticalArrangement = Arrangement.SpaceBetween,
                    horizontalAlignment = Alignment.End
                ) {
                    for (g in 0..4) {
                        val levelPrice = paddedMax - (paddedSpan * (g / 4.0))
                        Text(
                            text = PriceFormatterAlgorithm.formatPrice(
                                java.math.BigDecimal.valueOf(levelPrice),
                                tab.decimals
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                // Bottom UTC Time Axis Labels
                if (visibleSlice.isNotEmpty()) {
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
                        Text(
                            text = PriceFormatterAlgorithm.formatAxisTimestamp(midCandle.openTimeUtcMillis, tab.timeframe),
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
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

        Spacer(modifier = Modifier.height(8.dp))

        // Zoom & Reset Controls Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = { onZoom(true) },
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("chart_zoom_in_button")
            ) {
                Icon(
                    imageVector = Icons.Outlined.ZoomIn,
                    contentDescription = stringResource(R.string.chart_zoom_in)
                )
                Text(
                    text = stringResource(R.string.chart_zoom_in),
                    modifier = Modifier.padding(start = 4.dp)
                )
            }
            OutlinedButton(
                onClick = { onZoom(false) },
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("chart_zoom_out_button")
            ) {
                Icon(
                    imageVector = Icons.Outlined.ZoomOut,
                    contentDescription = stringResource(R.string.chart_zoom_out)
                )
                Text(
                    text = stringResource(R.string.chart_zoom_out),
                    modifier = Modifier.padding(start = 4.dp)
                )
            }
            OutlinedButton(
                onClick = onResetLatest,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("chart_reset_latest_button")
            ) {
                Icon(
                    imageVector = Icons.Outlined.CenterFocusStrong,
                    contentDescription = stringResource(R.string.chart_reset_view)
                )
                Text(
                    text = stringResource(R.string.chart_reset_view),
                    modifier = Modifier.padding(start = 4.dp)
                )
            }
        }
    }
}
