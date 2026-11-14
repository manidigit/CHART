package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.forecast.ForecastLedgerEntry
import es.manico.chartintelligence.forecast.ForecastPluginState
import es.manico.chartintelligence.forecast.ForecastRenderMode
import es.manico.chartintelligence.forecast.ForecastResult
import es.manico.chartintelligence.forecast.ForecastScenario
import es.manico.chartintelligence.forecast.ModelContribution
import es.manico.chartintelligence.forecast.WalkForwardReport
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import java.math.BigDecimal
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

@Composable
fun ForecastMiniFanCanvas(
    candles: List<CandleBar>,
    result: ForecastResult?,
    decimals: Int,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current
    val hist = remember(candles) { candles.takeLast(44) }
    val pts = result?.points.orEmpty()
    val renderMode = result?.renderMode ?: ForecastRenderMode.HYBRID

    val (minPrice, maxPrice) = remember(hist, pts) {
        if (hist.isEmpty()) 0.0 to 1.0
        else {
            var lo = hist.minOf { it.low.toDouble() }
            var hi = hist.maxOf { it.high.toDouble() }
            for (p in pts) {
                lo = min(lo, min(p.low, p.q10))
                hi = max(hi, max(p.high, p.q90))
            }
            val pad = max(1e-6, (hi - lo) * 0.09)
            (lo - pad) to (hi + pad)
        }
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("forecast_mini_fan_card"),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, palette.cardBorder)
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.forecast_fan_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                if (result?.summary != null) {
                    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                        val sign = if (result.summary.medianPctChange >= 0.0) "+" else ""
                        Text(
                            text = "q50 ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(result.summary.terminalQ50), decimals)} ($sign${String.format(Locale.US, "%.2f", result.summary.medianPctChange)}%)",
                            style = MaterialTheme.typography.labelMedium,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFC4B5FD)
                        )
                    }
                }
            }

            if (hist.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(R.string.chart_state_empty),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(220.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF0F172A))
                            .border(1.dp, palette.cardBorder, RoundedCornerShape(8.dp))
                            .padding(8.dp)
                    ) {
                        Canvas(modifier = Modifier.weight(1f).fillMaxSize()) {
                            val totalSlots = max(1, hist.size + pts.size)
                            val slotW = size.width / totalSlots.toFloat()
                            val bodyW = (slotW * 0.62f).coerceIn(2f, 11f)
                            val span = max(1e-8, maxPrice - minPrice)

                            fun xOf(idx: Int): Float = (idx + 0.5f) * slotW
                            fun yOf(p: Double): Float = (((maxPrice - p) / span) * size.height).toFloat().coerceIn(0f, size.height)

                            val gridCol = Color.White.copy(alpha = 0.07f)
                            for (g in 0..4) {
                                val gy = size.height * (g / 4f)
                                drawLine(gridCol, Offset(0f, gy), Offset(size.width, gy), strokeWidth = 1f)
                            }

                            hist.forEachIndexed { idx, c ->
                                val x = xOf(idx)
                                val isBull = c.close >= c.open
                                val col = if (isBull) palette.bullCandle else palette.bearCandle
                                drawLine(col, Offset(x, yOf(c.high.toDouble())), Offset(x, yOf(c.low.toDouble())), strokeWidth = 1.2f)
                                val oY = yOf(c.open.toDouble())
                                val cY = yOf(c.close.toDouble())
                                drawRect(
                                    color = col,
                                    topLeft = Offset(x - bodyW / 2f, min(oY, cY)),
                                    size = Size(bodyW, max(1.5f, abs(cY - oY)))
                                )
                            }

                            if (pts.isNotEmpty()) {
                                val divX = hist.size * slotW
                                val dash = PathEffect.dashPathEffect(floatArrayOf(7f, 5f), 0f)
                                drawRect(
                                    color = Color(0xFF7A6CA2).copy(alpha = 0.09f),
                                    topLeft = Offset(divX, 0f),
                                    size = Size(max(0f, size.width - divX), size.height)
                                )
                                drawLine(Color(0xFFF8FAFC).copy(alpha = 0.85f), Offset(divX, 0f), Offset(divX, size.height), strokeWidth = 1.4f, pathEffect = dash)

                                val anchorX = xOf(hist.lastIndex)
                                val anchorY = yOf(hist.last().close.toDouble())

                                if (renderMode == ForecastRenderMode.FAN_CHART || renderMode == ForecastRenderMode.HYBRID) {
                                    val outerPath = Path().apply {
                                        moveTo(anchorX, anchorY)
                                        pts.forEachIndexed { i, p -> lineTo(xOf(hist.size + i), yOf(p.q90)) }
                                        for (i in pts.indices.reversed()) lineTo(xOf(hist.size + i), yOf(pts[i].q10))
                                        close()
                                    }
                                    drawPath(outerPath, Color(0xFF38BDF8).copy(alpha = 0.16f))

                                    val innerPath = Path().apply {
                                        moveTo(anchorX, anchorY)
                                        pts.forEachIndexed { i, p -> lineTo(xOf(hist.size + i), yOf(p.q75)) }
                                        for (i in pts.indices.reversed()) lineTo(xOf(hist.size + i), yOf(pts[i].q25))
                                        close()
                                    }
                                    drawPath(innerPath, Color(0xFFF59E0B).copy(alpha = 0.24f))
                                }

                                if (renderMode == ForecastRenderMode.GHOST_CANDLES || renderMode == ForecastRenderMode.HYBRID) {
                                    val alpha = if (renderMode == ForecastRenderMode.HYBRID) 0.55f else 0.78f
                                    pts.forEachIndexed { i, fc ->
                                        val cx = xOf(hist.size + i)
                                        val isB = fc.close >= fc.open
                                        val col = if (isB) Color(0xFFA796D4).copy(alpha = alpha) else Color(0xFF726498).copy(alpha = alpha)
                                        drawLine(col, Offset(cx, yOf(fc.high)), Offset(cx, yOf(fc.low)), strokeWidth = 1.1f)
                                        val oY = yOf(fc.open)
                                        val cY = yOf(fc.close)
                                        drawRect(col, Offset(cx - bodyW / 2f, min(oY, cY)), Size(bodyW, max(1.8f, abs(cY - oY))))
                                    }
                                }

                                val medPath = Path().apply {
                                    moveTo(anchorX, anchorY)
                                    pts.forEachIndexed { i, p -> lineTo(xOf(hist.size + i), yOf(p.q50)) }
                                }
                                drawPath(medPath, Color(0xFFC4B5FD), style = Stroke(width = 2.0f, pathEffect = dash))
                            }
                        }

                        Column(
                            modifier = Modifier
                                .padding(start = 6.dp)
                                .width(66.dp)
                                .fillMaxSize(),
                            verticalArrangement = Arrangement.SpaceBetween,
                            horizontalAlignment = Alignment.End
                        ) {
                            for (g in 0..4) {
                                val v = maxPrice - (maxPrice - minPrice) * (g / 4.0)
                                Text(
                                    text = PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(v), decimals),
                                    style = MaterialTheme.typography.labelSmall,
                                    fontSize = 9.5.sp,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    color = Color(0xFF94A3B8)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ForecastScenarioCard(
    scenario: ForecastScenario,
    decimals: Int,
    onPlotScenario: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current
    val accent = when (scenario.bias) {
        "bull" -> palette.bullCandle
        "bear" -> palette.bearCandle
        else -> MaterialTheme.colorScheme.primary
    }
    val pctProb = (scenario.probability * 100.0).roundToInt()
    val sign = if (scenario.pctChange >= 0.0) "+" else ""

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("forecast_scenario_${scenario.id.lowercase()}"),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, accent.copy(alpha = 0.45f))
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = scenario.label,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = accent
                )
                Surface(
                    color = accent.copy(alpha = 0.16f),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        text = "$pctProb% · $sign${String.format(Locale.US, "%.2f", scenario.pctChange)}%",
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        fontWeight = FontWeight.Bold,
                        color = accent
                    )
                }
            }

            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        text = "Variance Ref: ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(scenario.targetPrice), decimals)}",
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Quantile Bound: ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(scenario.extremePrice), decimals)}",
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    text = "Structural Pivot Ref: ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(scenario.invalidationReference), decimals)}",
                    style = MaterialTheme.typography.labelSmall,
                    fontFamily = JetBrainsMonoFontFamily,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            OutlinedButton(
                onClick = onPlotScenario,
                modifier = Modifier
                    .fillMaxWidth()
                    .minimumInteractiveComponentSize()
                    .testTag("forecast_plot_scenario_${scenario.id.lowercase()}"),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text(
                    text = stringResource(R.string.forecast_plot_reference_btn),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ForecastModelPluginCard(
    plugin: ForecastPluginState,
    contribution: ModelContribution?,
    onToggle: (Boolean) -> Unit,
    onWeightChange: (Double) -> Unit,
    onParamChange: (String, Double) -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("forecast_model_card_${plugin.id}"),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, if (plugin.enabled) MaterialTheme.colorScheme.primary.copy(alpha = 0.45f) else palette.cardBorder)
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = plugin.name,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Surface(
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                            shape = RoundedCornerShape(4.dp)
                        ) {
                            Text(
                                text = plugin.family,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                    Text(
                        text = plugin.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Switch(
                    checked = plugin.enabled,
                    onCheckedChange = onToggle,
                    modifier = Modifier.testTag("forecast_model_toggle_${plugin.id}")
                )
            }

            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Plugin Weight: ${String.format(Locale.US, "%.2f", plugin.weight)}",
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    if (contribution != null) {
                        val sign = if (contribution.terminalPctChange >= 0.0) "+" else ""
                        Text(
                            text = "Eff ${(contribution.weight * 100.0).roundToInt()}% · $sign${String.format(Locale.US, "%.2f", contribution.terminalPctChange)}%",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = if (contribution.terminalPctChange >= 0.0) palette.bullCandle else palette.bearCandle
                        )
                    }
                }
            }

            Slider(
                value = plugin.weight.toFloat().coerceIn(0f, 1f),
                onValueChange = { onWeightChange(it.toDouble()) },
                valueRange = 0f..1f,
                enabled = plugin.enabled,
                modifier = Modifier.testTag("forecast_model_weight_${plugin.id}")
            )

            if (plugin.params.isNotEmpty()) {
                HorizontalDivider(color = palette.cardBorder.copy(alpha = 0.6f))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    plugin.params.forEach { (pk, pv) ->
                        val step = if (abs(pv) >= 2.0) 1.0 else 0.05
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.background,
                            border = BorderStroke(1.dp, palette.cardBorder)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(
                                    text = "$pk: ${if (step >= 1.0) pv.roundToInt().toString() else String.format(Locale.US, "%.2f", pv)}",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily
                                )
                                Text(
                                    text = "−",
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .clickable(enabled = plugin.enabled) {
                                            onParamChange(pk, max(0.01, pv - step))
                                        }
                                        .padding(horizontal = 8.dp, vertical = 4.dp),
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "+",
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .clickable(enabled = plugin.enabled) {
                                            onParamChange(pk, pv + step)
                                        }
                                        .padding(horizontal = 8.dp, vertical = 4.dp),
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun WalkForwardBenchmarkTable(
    report: WalkForwardReport?,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("forecast_walkforward_card"),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, palette.cardBorder)
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.forecast_wf_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                if (report != null) {
                    val gateColor = if (report.acceptancePassed) palette.bullCandle else Color(0xFFF59E0B)
                    Surface(color = gateColor.copy(alpha = 0.16f), shape = RoundedCornerShape(6.dp)) {
                        Text(
                            text = if (report.acceptancePassed) "GATE PASS (${report.evaluatedWindows}w)" else "PROVISIONAL (${report.evaluatedWindows}w)",
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = gateColor
                        )
                    }
                }
            }

            if (report == null) {
                Text(
                    text = stringResource(R.string.forecast_wf_unavailable),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                Text(
                    text = report.acceptanceReason,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                HorizontalDivider(color = palette.cardBorder)
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Model", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1.4f))
                        Text("MAE%", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(0.7f))
                        Text("Dir%", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(0.7f))
                        Text("Cov80", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(0.7f))
                        Text("CRPS", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(0.8f))
                    }
                    report.ensembleMetrics?.let { ens ->
                        HorizontalDivider(color = palette.cardBorder.copy(alpha = 0.5f))
                        BenchmarkMetricRow(ens, highlight = true)
                    }
                    for (m in report.modelBenchmarks) {
                        HorizontalDivider(color = palette.cardBorder.copy(alpha = 0.4f))
                        BenchmarkMetricRow(m, highlight = false)
                    }
                }
            }
        }
    }
}

@Composable
private fun BenchmarkMetricRow(
    summary: es.manico.chartintelligence.forecast.ModelWalkForwardSummary,
    highlight: Boolean
) {
    val color = if (highlight) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
    val weight = if (highlight) FontWeight.Bold else FontWeight.Normal
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = summary.modelName,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = weight,
            color = color,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1.4f)
        )
        Text(
            text = String.format(Locale.US, "%.2f", summary.maePct),
            style = MaterialTheme.typography.labelSmall,
            fontFamily = JetBrainsMonoFontFamily,
            fontWeight = weight,
            color = color,
            modifier = Modifier.weight(0.7f)
        )
        Text(
            text = String.format(Locale.US, "%.0f%%", summary.directionalAccuracyPct),
            style = MaterialTheme.typography.labelSmall,
            fontFamily = JetBrainsMonoFontFamily,
            fontWeight = weight,
            color = color,
            modifier = Modifier.weight(0.7f)
        )
        Text(
            text = String.format(Locale.US, "%.0f%%", summary.coverage80Pct),
            style = MaterialTheme.typography.labelSmall,
            fontFamily = JetBrainsMonoFontFamily,
            fontWeight = weight,
            color = color,
            modifier = Modifier.weight(0.7f)
        )
        Text(
            text = String.format(Locale.US, "%.3f", summary.crps),
            style = MaterialTheme.typography.labelSmall,
            fontFamily = JetBrainsMonoFontFamily,
            fontWeight = weight,
            color = color,
            modifier = Modifier.weight(0.8f)
        )
    }
}

@Composable
fun HashLedgerEntryCard(
    entry: ForecastLedgerEntry,
    decimals: Int,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("forecast_ledger_entry_${entry.seq}"),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, palette.cardBorder)
    ) {
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "#${entry.seq} · ${entry.symbolCode} · ${entry.timeframe} · +${entry.horizonBars}b",
                        style = MaterialTheme.typography.labelMedium,
                        fontFamily = JetBrainsMonoFontFamily,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Surface(
                        color = if (entry.syncedToCloud) palette.bullCandle.copy(alpha = 0.16f) else MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text(
                            text = if (entry.syncedToCloud) "MariaDB Synced" else "Local Chain",
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            fontSize = 10.sp,
                            color = if (entry.syncedToCloud) palette.bullCandle else MaterialTheme.colorScheme.primary
                        )
                    }
                }
                Text(
                    text = "${entry.forecastStatus} · ${entry.regime} · Anchor ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(entry.anchorClose), decimals)} → q50 ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(entry.terminalMedian), decimals)} [q10 ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(entry.terminalQ10), decimals)} .. q90 ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(entry.terminalQ90), decimals)}]",
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = JetBrainsMonoFontFamily,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = "prev:${entry.prevForecastHash.take(10)}… → hash:${entry.forecastHash.take(14)}…",
                    style = MaterialTheme.typography.labelSmall,
                    fontFamily = JetBrainsMonoFontFamily,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}
