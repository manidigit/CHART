package com.chartintelligence.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chartintelligence.app.engine.PredictionAndValidationEngine
import com.chartintelligence.app.model.ModelEvaluationMode
import com.chartintelligence.app.model.ModelHealthStatus
import com.chartintelligence.app.model.WalkForwardStepResult
import com.chartintelligence.app.ui.ChartIntelligenceUiState
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

@Composable
fun WalkForwardValidationScreen(
    uiState: ChartIntelligenceUiState,
    onSelectEvaluationMode: (ModelEvaluationMode) -> Unit,
    modifier: Modifier = Modifier
) {
    val summary = uiState.walkForwardSummary
    val spec = uiState.selectedInstrument

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Spacer(modifier = Modifier.height(4.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(DeepSlateSurface)
                    .border(1.dp, SubtleBorderSlate, RoundedCornerShape(16.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "HISTORICAL WALK-FORWARD VALIDATION (SEC 11)",
                            style = MaterialTheme.typography.titleSmall,
                            color = TextPrimary
                        )
                        Text(
                            text = "${spec.displayName} · ${uiState.selectedTimeframe.id} → ${uiState.selectedHorizon.label}",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSecondary
                        )
                    }
                    if (summary != null) {
                        val healthColor = when (summary.modelHealthStatus) {
                            ModelHealthStatus.ACTIVE -> BullishEmerald
                            ModelHealthStatus.SUSPENDED -> NeutralAmber
                            ModelHealthStatus.INVALID -> BearishCrimson
                        }
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(healthColor.copy(alpha = 0.16f))
                                .border(1.dp, healthColor, RoundedCornerShape(8.dp))
                                .padding(horizontal = 10.dp, vertical = 5.dp)
                        ) {
                            Text(
                                text = summary.modelHealthStatus.label,
                                style = MaterialTheme.typography.labelMedium,
                                color = healthColor,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                // Frozen vs Adaptive Model Toggle (Section 11.4)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    ModelEvaluationMode.entries.forEach { mode ->
                        val selected = mode == uiState.evaluationMode
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (selected) ForecastCyan.copy(alpha = 0.2f) else ElevatedCardSurface)
                                .border(
                                    1.dp,
                                    if (selected) ForecastCyan else SubtleBorderSlate,
                                    RoundedCornerShape(10.dp)
                                )
                                .clickable { onSelectEvaluationMode(mode) }
                                .padding(vertical = 10.dp)
                                .testTag("eval_mode_${mode.name.lowercase(Locale.US)}"),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = mode.label,
                                style = MaterialTheme.typography.labelLarge,
                                color = if (selected) ForecastCyan else TextSecondary,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                if (summary != null) {
                    Text(
                        text = "Purged Split: ${summary.purgeWindowCandles} bars · Embargo: ${summary.embargoCandles} bars · Raw Forecasts: ${summary.rawPredictionsCount} · Effective Independent Sample Size (N_eff): ${summary.effectiveSampleSize}",
                        style = MaterialTheme.typography.labelSmall,
                        color = TextSecondary
                    )
                }
            }
        }

        if (summary != null) {
            // Directional Accuracy vs 3 Mandatory Baselines (Section 10.4 & 10.6)
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
                        text = "DIRECTIONAL ACCURACY VS MANDATORY BASELINES (SEC 10.6)",
                        style = MaterialTheme.typography.titleSmall,
                        color = TextPrimary
                    )
                    AccuracyComparisonBar(
                        label = "Prediction Engine (${summary.evaluationMode.label})",
                        pct = summary.directionalAccuracyPct,
                        color = BullishEmerald
                    )
                    AccuracyComparisonBar(
                        label = "Baseline 1: Persistence (No-Change)",
                        pct = summary.persistenceBaselineAccPct,
                        color = NeutralAmber
                    )
                    AccuracyComparisonBar(
                        label = "Baseline 2: Previous Closed Candle Direction",
                        pct = summary.prevDirectionBaselineAccPct,
                        color = ForecastCyan
                    )
                    AccuracyComparisonBar(
                        label = "Baseline 3: SMA(10/20) Fixed Rule",
                        pct = summary.smaBaselineAccPct,
                        color = BaselineViolet
                    )
                }
            }

            // Statistical Calibration & Error Metrics (Section 11.6)
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
                        text = "ERROR, CALIBRATION & INTERVAL COVERAGE (SEC 11.6)",
                        style = MaterialTheme.typography.titleSmall,
                        color = TextPrimary
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        MetricMiniBox(
                            title = "MAE (Decimal)",
                            value = summary.mae.toPlainString(),
                            accent = ForecastCyan,
                            modifier = Modifier.weight(1f)
                        )
                        MetricMiniBox(
                            title = "RMSE (Decimal)",
                            value = summary.rmse.toPlainString(),
                            accent = ForecastCyan,
                            modifier = Modifier.weight(1f)
                        )
                        MetricMiniBox(
                            title = "Q10–Q90 Coverage",
                            value = "${"%.1f".format(Locale.US, summary.intervalCoveragePct)}%",
                            accent = BullishEmerald,
                            modifier = Modifier.weight(1f)
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        MetricMiniBox(
                            title = "Brier Score (Prob)",
                            value = "%.4f".format(Locale.US, summary.brierScore),
                            accent = NeutralAmber,
                            modifier = Modifier.weight(1f)
                        )
                        MetricMiniBox(
                            title = "Pinball Quantile Loss",
                            value = "%.4f".format(Locale.US, summary.quantileLoss),
                            accent = BaselineViolet,
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Text(
                        text = "REGIME-SPECIFIC DIRECTIONAL ACCURACY",
                        style = MaterialTheme.typography.labelSmall,
                        color = TextMuted
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        MetricMiniBox(
                            title = "Bullish Regime",
                            value = "${"%.1f".format(Locale.US, summary.bullishRegimeAccuracyPct)}%",
                            accent = BullishEmerald,
                            modifier = Modifier.weight(1f)
                        )
                        MetricMiniBox(
                            title = "Neutral Regime",
                            value = "${"%.1f".format(Locale.US, summary.neutralRegimeAccuracyPct)}%",
                            accent = NeutralAmber,
                            modifier = Modifier.weight(1f)
                        )
                        MetricMiniBox(
                            title = "Bearish Regime",
                            value = "${"%.1f".format(Locale.US, summary.bearishRegimeAccuracyPct)}%",
                            accent = BearishCrimson,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }

            item {
                Text(
                    text = "OUT-OF-SAMPLE WALK-FORWARD OUTCOME LOG (LATEST 12 STEPS)",
                    style = MaterialTheme.typography.labelLarge,
                    color = TextPrimary
                )
            }

            items(summary.steps.takeLast(12).reversed(), key = { it.stepIndex }) { step ->
                WalkForwardStepRow(step = step)
            }
        }

        item {
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun AccuracyComparisonBar(
    label: String,
    pct: Double,
    color: Color
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = TextSecondary
            )
            Text(
                text = "${"%.1f".format(Locale.US, pct)}%",
                style = MaterialTheme.typography.labelLarge,
                color = color,
                fontWeight = FontWeight.Bold
            )
        }
        LinearProgressIndicator(
            progress = { (pct / 100.0).toFloat().coerceIn(0f, 1f) },
            color = color,
            trackColor = ElevatedCardSurface,
            modifier = Modifier
                .fillMaxWidth()
                .height(7.dp)
                .clip(RoundedCornerShape(4.dp))
        )
    }
}

@Composable
private fun WalkForwardStepRow(step: WalkForwardStepResult) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(DeepSlateSurface)
            .border(1.dp, SubtleBorderSlate, RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 9.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                text = "Step #${step.stepIndex} · ${PredictionAndValidationEngine.formatShortUtc(step.candleCloseTimeUtcMs)} UTC",
                style = MaterialTheme.typography.labelMedium,
                color = TextPrimary
            )
            Text(
                text = "Pred: ${step.predictedTarget.toPlainString()} (${step.predictedDirection.label}) → Actual: ${step.actualOutcome.toPlainString()} (${step.actualDirection.label})",
                style = MaterialTheme.typography.labelSmall,
                color = TextSecondary
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = if (step.modelCorrect) "HIT" else "MISS",
                style = MaterialTheme.typography.labelMedium,
                color = if (step.modelCorrect) BullishEmerald else BearishCrimson,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = if (step.intervalCovered) "In Q10–Q90" else "Outside Band",
                style = MaterialTheme.typography.labelSmall,
                color = if (step.intervalCovered) ForecastCyan else NeutralAmber
            )
        }
    }
}
