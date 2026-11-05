package com.chartintelligence.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingFlat
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chartintelligence.app.model.ChartTimeframe
import com.chartintelligence.app.model.ForecastHorizon
import com.chartintelligence.app.model.HorizonForecastOutput
import com.chartintelligence.app.model.PredictionRecord
import com.chartintelligence.app.model.TrendRegime
import com.chartintelligence.app.ui.ChartIntelligenceUiState
import com.chartintelligence.app.ui.components.FinancialCandlestickChart
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

import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

@Composable
fun ForecastTerminalScreen(
    uiState: ChartIntelligenceUiState,
    onSelectInstrument: (String) -> Unit,
    onLoadCustomSymbol: (String) -> Unit,
    onSelectTimeframe: (ChartTimeframe) -> Unit,
    onSelectHorizon: (ForecastHorizon) -> Unit,
    onUpdateNeutralParams: (Int, Double) -> Unit,
    onLockImmutableForecast: () -> Unit,
    modifier: Modifier = Modifier
) {
    val spec = uiState.selectedInstrument
    val forecast = uiState.activeForecast
    var symbolSearchText by remember { mutableStateOf("") }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Prominent Direct Symbol Input & Search Box
        item {
            Spacer(modifier = Modifier.height(4.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(DeepSlateSurface)
                    .border(1.5.dp, BullishEmerald.copy(alpha = 0.65f), RoundedCornerShape(14.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "۱. چه نموداری را می‌خواهید تحلیل و پیش‌بینی کنید؟",
                    style = MaterialTheme.typography.titleSmall,
                    color = BullishEmerald,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "نام نماد را بنویسید (مثل XAUUSD، SPOTBRENT، BTCUSDT، EURUSD، AAPL) یا از دکمه‌های آماده زیر انتخاب کنید:",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = symbolSearchText,
                        onValueChange = { symbolSearchText = it },
                        placeholder = {
                            Text(
                                text = "مثال: XAUUSD یا SPOTBRENT یا BTCUSDT",
                                style = MaterialTheme.typography.bodySmall,
                                color = TextMuted
                            )
                        },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = BullishEmerald,
                            unfocusedBorderColor = SubtleBorderSlate,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .testTag("custom_symbol_input")
                    )
                    Button(
                        onClick = {
                            if (symbolSearchText.isNotBlank()) {
                                onLoadCustomSymbol(symbolSearchText)
                                symbolSearchText = ""
                            }
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = BullishEmerald,
                            contentColor = Color(0xFF002418)
                        ),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.testTag("load_custom_symbol_button")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = "نمایش نمودار",
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "نمایش نمودار",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                // Quick-select Instrument Chips
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    uiState.instruments.forEach { inst ->
                        val selected = inst.instrumentId == spec.instrumentId
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (selected) BullishEmerald.copy(alpha = 0.20f) else ElevatedCardSurface)
                                .border(
                                    width = if (selected) 1.5.dp else 1.dp,
                                    color = if (selected) BullishEmerald else SubtleBorderSlate,
                                    shape = RoundedCornerShape(12.dp)
                                )
                                .clickable { onSelectInstrument(inst.instrumentId) }
                                .padding(horizontal = 12.dp, vertical = 8.dp)
                                .testTag("instrument_chip_${inst.instrumentId}")
                        ) {
                            Column {
                                Text(
                                    text = inst.persianName,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (selected) BullishEmerald else TextPrimary,
                                    fontWeight = FontWeight.Bold
                                )
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = inst.tradingViewSymbol,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = if (selected) BullishEmerald else ForecastCyan
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = inst.marketType.label,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = TextSecondary
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Timeframe & Forecast Horizon Selector Bar (Section 4.1 & 10.2)
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "۲. تایم‌فریم کندل‌ها (≥ M15)",
                        style = MaterialTheme.typography.labelSmall,
                        color = TextPrimary
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        ChartTimeframe.entries.forEach { tf ->
                            val selected = tf == uiState.selectedTimeframe
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(if (selected) ForecastCyan.copy(alpha = 0.2f) else DeepSlateSurface)
                                    .border(
                                        1.dp,
                                        if (selected) ForecastCyan else SubtleBorderSlate,
                                        RoundedCornerShape(8.dp)
                                    )
                                    .clickable { onSelectTimeframe(tf) }
                                    .padding(horizontal = 8.dp, vertical = 6.dp)
                                    .testTag("timeframe_chip_${tf.id}")
                            ) {
                                Text(
                                    text = tf.id,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (selected) ForecastCyan else TextSecondary,
                                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal
                                )
                            }
                        }
                    }
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "۳. افق پیش‌بینی آینده",
                        style = MaterialTheme.typography.labelSmall,
                        color = TextPrimary
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        ForecastHorizon.entries.forEach { hz ->
                            val selected = hz == uiState.selectedHorizon
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(if (selected) BullishEmerald.copy(alpha = 0.2f) else DeepSlateSurface)
                                    .border(
                                        1.dp,
                                        if (selected) BullishEmerald else SubtleBorderSlate,
                                        RoundedCornerShape(8.dp)
                                    )
                                    .clickable { onSelectHorizon(hz) }
                                    .padding(horizontal = 8.dp, vertical = 6.dp)
                                    .testTag("horizon_chip_${hz.id}")
                            ) {
                                Text(
                                    text = hz.id.uppercase(Locale.US),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (selected) BullishEmerald else TextSecondary,
                                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal
                                )
                            }
                        }
                    }
                }
            }
        }

        // Interactive Candlestick & Forecast Cone Chart
        item {
            FinancialCandlestickChart(
                candles = uiState.activeCandles,
                forecast = forecast,
                decimals = spec.decimals
            )
        }

        // Active Forecast Summary & Scenario Probabilities (Section 10.3)
        if (forecast != null) {
            item {
                ActiveForecastDetailCard(
                    forecast = forecast,
                    instrumentSymbol = spec.tradingViewSymbol,
                    neutralK = uiState.neutralMultiplierK,
                    atrPeriod = uiState.atrPeriod,
                    onUpdateNeutralParams = onUpdateNeutralParams,
                    onLockImmutableForecast = onLockImmutableForecast
                )
            }
        }

        // Multi-Horizon Matrix (All 4 Forecast Horizons for this Instrument)
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(DeepSlateSurface)
                    .border(1.dp, SubtleBorderSlate, RoundedCornerShape(16.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "MULTI-HORIZON FORECAST MATRIX · ${spec.tradingViewSymbol}",
                    style = MaterialTheme.typography.titleSmall,
                    color = TextPrimary
                )
                uiState.allHorizonForecasts.forEach { hzOut ->
                    val dirColor = regimeColor(hzOut.predictedDirection)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(ElevatedCardSurface)
                            .clickable { onSelectHorizon(hzOut.horizon) }
                            .padding(horizontal = 12.dp, vertical = 9.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = hzOut.horizon.label,
                                style = MaterialTheme.typography.titleSmall,
                                color = TextPrimary
                            )
                            Text(
                                text = "Q10..Q90: [${hzOut.intervalLowerQ10.toPlainString()} – ${hzOut.intervalUpperQ90.toPlainString()}]",
                                style = MaterialTheme.typography.labelSmall,
                                color = TextSecondary
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = "${hzOut.pointTargetPrice.toPlainString()} ${spec.quoteCurrency}",
                                style = MaterialTheme.typography.titleSmall,
                                color = dirColor
                            )
                            Text(
                                text = "${hzOut.predictedDirection.label} (${hzOut.predictedDirection.persianLabel}) · ${"%.0f".format(Locale.US, hzOut.confidenceScore)}%",
                                style = MaterialTheme.typography.labelSmall,
                                color = dirColor
                            )
                        }
                    }
                }
            }
        }

        // Immutable SHA-256 Hash-Chained Prediction Ledger (Section 8.3 & 11.5)
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "IMMUTABLE HASH-CHAINED PREDICTION LEDGER (SEC 11.5)",
                    style = MaterialTheme.typography.labelLarge,
                    color = TextPrimary
                )
                Text(
                    text = "${uiState.predictionLedger.size} locked records",
                    style = MaterialTheme.typography.labelSmall,
                    color = BullishEmerald
                )
            }
        }

        items(uiState.predictionLedger, key = { it.recordId }) { record ->
            ImmutablePredictionLedgerCard(record = record)
        }

        item {
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun ActiveForecastDetailCard(
    forecast: HorizonForecastOutput,
    instrumentSymbol: String,
    neutralK: Double,
    atrPeriod: Int,
    onUpdateNeutralParams: (Int, Double) -> Unit,
    onLockImmutableForecast: () -> Unit
) {
    val predColor = regimeColor(forecast.predictedDirection)
    val trendColor = regimeColor(forecast.currentTrend)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(DeepSlateSurface)
            .border(1.dp, SubtleBorderSlate, RoundedCornerShape(16.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "$instrumentSymbol · ${forecast.timeframe.id} → ${forecast.horizon.label}",
                    style = MaterialTheme.typography.labelMedium,
                    color = TextSecondary
                )
                Text(
                    text = "Point Forecast: ${forecast.pointTargetPrice.toPlainString()}",
                    style = MaterialTheme.typography.headlineMedium,
                    color = predColor
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = when (forecast.predictedDirection) {
                            TrendRegime.BULLISH -> Icons.Default.TrendingUp
                            TrendRegime.BEARISH -> Icons.Default.TrendingDown
                            TrendRegime.NEUTRAL -> Icons.Default.TrendingFlat
                        },
                        contentDescription = forecast.predictedDirection.label,
                        tint = predColor,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "${forecast.predictedDirection.label} (${forecast.predictedDirection.persianLabel})",
                        style = MaterialTheme.typography.titleSmall,
                        color = predColor
                    )
                }
                Text(
                    text = "Current Trend: ${forecast.currentTrend.label} (${forecast.currentTrend.persianLabel})",
                    style = MaterialTheme.typography.labelSmall,
                    color = trendColor
                )
            }
        }

        // Quantile Bounds & Expected High/Low Grid
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            MetricMiniBox(
                title = "Lower Bound (Q10)",
                value = forecast.intervalLowerQ10.toPlainString(),
                accent = ForecastCyan,
                modifier = Modifier.weight(1f)
            )
            MetricMiniBox(
                title = "Upper Bound (Q90)",
                value = forecast.intervalUpperQ90.toPlainString(),
                accent = ForecastCyan,
                modifier = Modifier.weight(1f)
            )
            MetricMiniBox(
                title = "Expected L..H",
                value = "${forecast.expectedLow.toPlainString()}..${forecast.expectedHigh.toPlainString()}",
                accent = TextPrimary,
                modifier = Modifier.weight(1.3f)
            )
        }

        // Scenario Probabilities (Bullish / Bearish / Neutral)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Bullish ${"%.1f".format(Locale.US, forecast.bullishProbability * 100)}%",
                    style = MaterialTheme.typography.labelSmall,
                    color = BullishEmerald
                )
                Text(
                    text = "Neutral ${"%.1f".format(Locale.US, forecast.neutralProbability * 100)}%",
                    style = MaterialTheme.typography.labelSmall,
                    color = NeutralAmber
                )
                Text(
                    text = "Bearish ${"%.1f".format(Locale.US, forecast.bearishProbability * 100)}%",
                    style = MaterialTheme.typography.labelSmall,
                    color = BearishCrimson
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp))
            ) {
                Box(
                    modifier = Modifier
                        .weight(forecast.bullishProbability.toFloat().coerceAtLeast(0.05f))
                        .fillMaxSize()
                        .background(BullishEmerald)
                )
                Box(
                    modifier = Modifier
                        .weight(forecast.neutralProbability.toFloat().coerceAtLeast(0.05f))
                        .fillMaxSize()
                        .background(NeutralAmber)
                )
                Box(
                    modifier = Modifier
                        .weight(forecast.bearishProbability.toFloat().coerceAtLeast(0.05f))
                        .fillMaxSize()
                        .background(BearishCrimson)
                )
            }
        }

        // Mandatory Baselines Comparison (Section 10.6)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(ElevatedCardSurface)
                .padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = "MANDATORY BASELINE REFERENCES (SEC 10.6)",
                style = MaterialTheme.typography.labelSmall,
                color = TextMuted
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Persistence: ${forecast.persistenceBaselineTarget.toPlainString()}",
                    style = MaterialTheme.typography.labelSmall,
                    color = NeutralAmber
                )
                Text(
                    text = "Prev Dir: ${forecast.previousDirectionBaseline.label}",
                    style = MaterialTheme.typography.labelSmall,
                    color = TextSecondary
                )
                Text(
                    text = "SMA Rule: ${forecast.smaBaselineTarget.toPlainString()}",
                    style = MaterialTheme.typography.labelSmall,
                    color = BaselineViolet
                )
            }
        }

        // Volatility-Based Neutral Trend Threshold Control (Section 10.7)
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Neutral Threshold |ΔP| < ${"%.2f".format(Locale.US, neutralK)} × ATR($atrPeriod)",
                    style = MaterialTheme.typography.labelSmall,
                    color = TextSecondary
                )
                Text(
                    text = "±${forecast.neutralThresholdValue.toPlainString()}",
                    style = MaterialTheme.typography.labelSmall,
                    color = NeutralAmber
                )
            }
            Slider(
                value = neutralK.toFloat(),
                onValueChange = { onUpdateNeutralParams(atrPeriod, it.toDouble()) },
                valueRange = 0.15f..0.85f,
                colors = SliderDefaults.colors(
                    thumbColor = NeutralAmber,
                    activeTrackColor = NeutralAmber
                ),
                modifier = Modifier.testTag("neutral_threshold_slider")
            )
        }

        Button(
            onClick = onLockImmutableForecast,
            colors = ButtonDefaults.buttonColors(
                containerColor = BullishEmerald,
                contentColor = Color(0xFF002417)
            ),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier
                .fillMaxWidth()
                .testTag("lock_immutable_forecast_button")
        ) {
            Icon(
                imageVector = Icons.Default.Lock,
                contentDescription = "Lock Immutable Forecast",
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Lock Immutable Forecast to Hash Chain",
                style = MaterialTheme.typography.titleSmall
            )
        }
    }
}

@Composable
private fun ImmutablePredictionLedgerCard(record: PredictionRecord) {
    val dirColor = regimeColor(record.predictedDirection)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(DeepSlateSurface)
            .border(1.dp, SubtleBorderSlate, RoundedCornerShape(14.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.Lock,
                    contentDescription = "Immutable Record",
                    tint = ForecastCyan,
                    modifier = Modifier.size(15.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "${record.recordId} · ${record.instrumentId} (${record.timeframe.id} → ${record.horizon.id})",
                    style = MaterialTheme.typography.titleSmall,
                    color = TextPrimary
                )
            }
            Text(
                text = record.predictedDirection.label,
                style = MaterialTheme.typography.labelMedium,
                color = dirColor,
                fontWeight = FontWeight.Bold
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "Target: ${record.pointTargetPrice.toPlainString()} [${record.intervalLowerQ10.toPlainString()}..${record.intervalUpperQ90.toPlainString()}]",
                style = MaterialTheme.typography.labelMedium,
                color = TextSecondary
            )
            Text(
                text = record.modelVersion,
                style = MaterialTheme.typography.labelSmall,
                color = TextMuted
            )
        }

        if (record.actualOutcomeClose != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(ElevatedCardSurface)
                    .padding(horizontal = 8.dp, vertical = 5.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = "Outcome Resolved",
                        tint = if (record.directionalHit == true) BullishEmerald else NeutralAmber,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(5.dp))
                    Text(
                        text = "Outcome: ${record.actualOutcomeClose.toPlainString()} (${record.actualOutcomeDirection?.label ?: ""})",
                        style = MaterialTheme.typography.labelSmall,
                        color = TextPrimary
                    )
                }
                Text(
                    text = "|Err|: ${record.absoluteError?.toPlainString() ?: "0"} · Q10-90: ${if (record.intervalCovered == true) "IN" else "OUT"}",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (record.intervalCovered == true) BullishEmerald else BearishCrimson
                )
            }
        }

        Text(
            text = "SHA-256: ${record.recordHash.take(24)}…  ←  Prev: ${record.prevRecordHash.take(14)}…",
            style = MaterialTheme.typography.labelSmall,
            color = TextMuted
        )
        Text(
            text = "Server Accepted: ${record.serverReceivedAtUtc} · Horizon End: ${record.horizonEndUtc}",
            style = MaterialTheme.typography.labelSmall,
            color = TextMuted
        )
    }
}

@Composable
fun MetricMiniBox(
    title: String,
    value: String,
    accent: Color,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(ElevatedCardSurface)
            .padding(horizontal = 9.dp, vertical = 7.dp)
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelSmall,
            color = TextMuted
        )
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.labelLarge,
            color = accent,
            fontWeight = FontWeight.Bold
        )
    }
}

fun regimeColor(regime: TrendRegime): Color = when (regime) {
    TrendRegime.BULLISH -> BullishEmerald
    TrendRegime.BEARISH -> BearishCrimson
    TrendRegime.NEUTRAL -> NeutralAmber
}
