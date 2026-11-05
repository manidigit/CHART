package com.chartintelligence.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chartintelligence.app.engine.PredictionAndValidationEngine
import com.chartintelligence.app.model.CandleRecord
import com.chartintelligence.app.model.HorizonForecastOutput
import com.chartintelligence.app.ui.theme.BaselineViolet
import com.chartintelligence.app.ui.theme.BearishCrimson
import com.chartintelligence.app.ui.theme.BullishEmerald
import com.chartintelligence.app.ui.theme.DeepSlateSurface
import com.chartintelligence.app.ui.theme.ElevatedCardSurface
import com.chartintelligence.app.ui.theme.ForecastCyan
import com.chartintelligence.app.ui.theme.NeutralAmber
import com.chartintelligence.app.ui.theme.SubtleBorderSlate
import com.chartintelligence.app.ui.theme.TextMuted
import com.chartintelligence.app.ui.theme.TextPrimary
import com.chartintelligence.app.ui.theme.TextSecondary
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

@Composable
fun FinancialCandlestickChart(
    candles: List<CandleRecord>,
    forecast: HorizonForecastOutput?,
    decimals: Int,
    modifier: Modifier = Modifier
) {
    val visibleCandles = remember(candles) { candles.takeLast(42) }
    var selectedCandleIndex by remember(visibleCandles) {
        mutableStateOf(visibleCandles.lastIndex.coerceAtLeast(0))
    }

    val inspectedCandle = visibleCandles.getOrNull(
        selectedCandleIndex.coerceIn(0, (visibleCandles.size - 1).coerceAtLeast(0))
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(DeepSlateSurface)
            .border(1.dp, SubtleBorderSlate, RoundedCornerShape(16.dp))
            .padding(12.dp)
    ) {
        // Top HUD bar showing inspected closed candle OHLC + quality status
        if (inspectedCandle != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(ElevatedCardSurface)
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "CLOSED BAR · ${PredictionAndValidationEngine.formatShortUtc(inspectedCandle.closeTimeUtcMs)} UTC",
                        style = MaterialTheme.typography.labelSmall,
                        color = TextSecondary
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OhlcStatChip("O", inspectedCandle.open.toPlainString(), TextPrimary)
                        OhlcStatChip("H", inspectedCandle.high.toPlainString(), BullishEmerald)
                        OhlcStatChip("L", inspectedCandle.low.toPlainString(), BearishCrimson)
                        OhlcStatChip(
                            "C",
                            inspectedCandle.close.toPlainString(),
                            if (inspectedCandle.close >= inspectedCandle.open) BullishEmerald else BearishCrimson
                        )
                    }
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "${inspectedCandle.qualityStatus.label.uppercase()} · ${inspectedCandle.priceBasis.code.uppercase()}",
                        style = MaterialTheme.typography.labelSmall,
                        color = BullishEmerald,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Vol: ${inspectedCandle.volume.toPlainString()}",
                        style = MaterialTheme.typography.labelSmall,
                        color = TextMuted
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Main Candlestick + Forecast Cone Canvas
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(235.dp)
                .testTag("candlestick_forecast_canvas")
        ) {
            if (visibleCandles.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = "No verified closed candles available for this instrument.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary
                    )
                }
            } else {
                val minCandleLow = visibleCandles.minOf { it.low.toDouble() }
                val maxCandleHigh = visibleCandles.maxOf { it.high.toDouble() }
                val minBound = if (forecast != null) {
                    min(minCandleLow, min(forecast.intervalLowerQ10.toDouble(), forecast.expectedLow.toDouble()))
                } else {
                    minCandleLow
                }
                val maxBound = if (forecast != null) {
                    max(maxCandleHigh, max(forecast.intervalUpperQ90.toDouble(), forecast.expectedHigh.toDouble()))
                } else {
                    maxCandleHigh
                }
                val priceSpan = max(maxBound - minBound, 1e-4)
                val paddedMin = minBound - priceSpan * 0.08
                val paddedMax = maxBound + priceSpan * 0.08
                val totalRange = max(paddedMax - paddedMin, 1e-4)

                Canvas(
                    modifier = Modifier
                        .fillMaxSize()
                        .pointerInput(visibleCandles) {
                            detectTapGestures { tapOffset ->
                                val chartHistoryFraction = 0.76f
                                val historyWidth = size.width * chartHistoryFraction
                                if (tapOffset.x <= historyWidth && visibleCandles.isNotEmpty()) {
                                    val slotW = historyWidth / visibleCandles.size.toFloat()
                                    val idx = (tapOffset.x / slotW).toInt()
                                        .coerceIn(0, visibleCandles.lastIndex)
                                    selectedCandleIndex = idx
                                }
                            }
                        }
                ) {
                    val w = size.width
                    val h = size.height
                    val historyWidth = w * 0.76f
                    val forecastZoneWidth = w - historyWidth

                    fun priceToY(price: Double): Float {
                        val norm = ((price - paddedMin) / totalRange).toFloat().coerceIn(0f, 1f)
                        return h - (norm * h)
                    }

                    // Horizontal price grid lines
                    val gridSteps = 4
                    for (g in 0..gridSteps) {
                        val y = h * (g.toFloat() / gridSteps.toFloat())
                        drawLine(
                            color = SubtleBorderSlate.copy(alpha = 0.45f),
                            start = Offset(0f, y),
                            end = Offset(w, y),
                            strokeWidth = 1f
                        )
                    }

                    // Divider line between Closed History and Future Forecast Horizon
                    drawLine(
                        color = ForecastCyan.copy(alpha = 0.55f),
                        start = Offset(historyWidth, 0f),
                        end = Offset(historyWidth, h),
                        strokeWidth = 1.5f,
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f), 0f)
                    )

                    val count = visibleCandles.size
                    val slotWidth = historyWidth / max(count, 1).toFloat()
                    val bodyWidth = (slotWidth * 0.64f).coerceAtLeast(3f)

                    // Selected candle vertical crosshair
                    val selIdx = selectedCandleIndex.coerceIn(0, visibleCandles.lastIndex)
                    val selX = (selIdx + 0.5f) * slotWidth
                    drawLine(
                        color = TextSecondary.copy(alpha = 0.35f),
                        start = Offset(selX, 0f),
                        end = Offset(selX, h),
                        strokeWidth = 1.2f,
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(5f, 5f), 0f)
                    )

                    // Draw running SMA-10 line overlay
                    val smaPath = Path()
                    for (i in visibleCandles.indices) {
                        val winStart = max(0, i - 9)
                        val avg = visibleCandles.subList(winStart, i + 1)
                            .map { it.close.toDouble() }
                            .average()
                        val x = (i + 0.5f) * slotWidth
                        val y = priceToY(avg)
                        if (i == 0) smaPath.moveTo(x, y) else smaPath.lineTo(x, y)
                    }
                    drawPath(
                        path = smaPath,
                        color = BaselineViolet.copy(alpha = 0.75f),
                        style = Stroke(width = 2.0f)
                    )

                    // Draw Closed OHLC Candlesticks
                    for (i in visibleCandles.indices) {
                        val c = visibleCandles[i]
                        val centerX = (i + 0.5f) * slotWidth
                        val highY = priceToY(c.high.toDouble())
                        val lowY = priceToY(c.low.toDouble())
                        val openY = priceToY(c.open.toDouble())
                        val closeY = priceToY(c.close.toDouble())

                        val isBull = c.close >= c.open
                        val candleColor = if (isBull) BullishEmerald else BearishCrimson

                        // Wick
                        drawLine(
                            color = candleColor,
                            start = Offset(centerX, highY),
                            end = Offset(centerX, lowY),
                            strokeWidth = 1.5f
                        )

                        // Body
                        val topY = min(openY, closeY)
                        val boxHeight = max(abs(closeY - openY), 2.2f)
                        drawRect(
                            color = candleColor,
                            topLeft = Offset(centerX - bodyWidth / 2f, topY),
                            size = Size(bodyWidth, boxHeight)
                        )
                    }

                    // Draw Future Forecast Cone (Q10..Q90, Expected High/Low, Point Target, Baselines)
                    if (forecast != null) {
                        val startX = (visibleCandles.lastIndex + 0.5f) * slotWidth
                        val endX = historyWidth + forecastZoneWidth * 0.86f

                        val lastCloseY = priceToY(forecast.lastClosePrice.toDouble())
                        val targetY = priceToY(forecast.pointTargetPrice.toDouble())
                        val q10Y = priceToY(forecast.intervalLowerQ10.toDouble())
                        val q90Y = priceToY(forecast.intervalUpperQ90.toDouble())
                        val expHighY = priceToY(forecast.expectedHigh.toDouble())
                        val expLowY = priceToY(forecast.expectedLow.toDouble())
                        val smaBaseY = priceToY(forecast.smaBaselineTarget.toDouble())

                        // Shaded Q10 - Q90 Confidence Cone
                        val conePath = Path().apply {
                            moveTo(startX, lastCloseY)
                            lineTo(endX, q90Y)
                            lineTo(endX, q10Y)
                            close()
                        }
                        drawPath(
                            path = conePath,
                            brush = Brush.horizontalGradient(
                                colors = listOf(
                                    ForecastCyan.copy(alpha = 0.10f),
                                    ForecastCyan.copy(alpha = 0.28f)
                                ),
                                startX = startX,
                                endX = endX
                            )
                        )

                        // Q90 and Q10 boundary edges
                        drawLine(
                            color = ForecastCyan.copy(alpha = 0.65f),
                            start = Offset(startX, lastCloseY),
                            end = Offset(endX, q90Y),
                            strokeWidth = 1.4f
                        )
                        drawLine(
                            color = ForecastCyan.copy(alpha = 0.65f),
                            start = Offset(startX, lastCloseY),
                            end = Offset(endX, q10Y),
                            strokeWidth = 1.4f
                        )

                        // Persistence Baseline horizontal dashed line
                        drawLine(
                            color = NeutralAmber.copy(alpha = 0.6f),
                            start = Offset(startX, lastCloseY),
                            end = Offset(endX, lastCloseY),
                            strokeWidth = 1.4f,
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f), 0f)
                        )

                        // SMA Baseline projection
                        drawLine(
                            color = BaselineViolet.copy(alpha = 0.75f),
                            start = Offset(startX, lastCloseY),
                            end = Offset(endX, smaBaseY),
                            strokeWidth = 1.5f,
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 4f), 0f)
                        )

                        // Expected High/Low range bar at horizon end
                        drawLine(
                            color = ForecastCyan,
                            start = Offset(endX, expHighY),
                            end = Offset(endX, expLowY),
                            strokeWidth = 3f
                        )

                        // Point Target Trajectory Line
                        val targetColor = when (forecast.predictedDirection.label) {
                            "BULLISH" -> BullishEmerald
                            "BEARISH" -> BearishCrimson
                            else -> NeutralAmber
                        }
                        drawLine(
                            color = targetColor,
                            start = Offset(startX, lastCloseY),
                            end = Offset(endX, targetY),
                            strokeWidth = 2.8f
                        )
                        drawCircle(
                            color = targetColor,
                            radius = 5.5f,
                            center = Offset(endX, targetY)
                        )
                    }
                }

                // Price axis labels overlay on right
                Column(
                    modifier = Modifier
                        .align(Alignment.CenterEnd)
                        .padding(end = 4.dp),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "%.${decimals}f".format(Locale.US, paddedMax),
                        style = MaterialTheme.typography.labelSmall,
                        color = TextSecondary
                    )
                    Spacer(modifier = Modifier.height(155.dp))
                    Text(
                        text = "%.${decimals}f".format(Locale.US, paddedMin),
                        style = MaterialTheme.typography.labelSmall,
                        color = TextSecondary
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Legend row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ChartLegendItem(color = BullishEmerald, label = "Point Forecast")
                ChartLegendItem(color = ForecastCyan, label = "Q10–Q90 Interval")
                ChartLegendItem(color = NeutralAmber, label = "Persistence")
                ChartLegendItem(color = BaselineViolet, label = "SMA Baseline")
            }
            if (forecast != null) {
                Text(
                    text = "ATR: ${forecast.atrValue.toPlainString()}",
                    style = MaterialTheme.typography.labelSmall,
                    color = TextSecondary
                )
            }
        }
    }
}

@Composable
private fun OhlcStatChip(prefix: String, value: String, valueColor: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = "$prefix:",
            style = MaterialTheme.typography.labelSmall,
            color = TextMuted
        )
        Spacer(modifier = Modifier.width(2.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.labelSmall,
            color = valueColor,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun ChartLegendItem(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(color)
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = TextSecondary
        )
    }
}
