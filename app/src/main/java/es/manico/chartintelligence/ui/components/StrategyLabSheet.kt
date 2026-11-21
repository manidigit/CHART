package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.ShowChart
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.StrategySimulatorAlgorithm
import es.manico.chartintelligence.algorithms.StrategySimulatorAlgorithm.StrategyConfig
import es.manico.chartintelligence.algorithms.StrategySimulatorAlgorithm.StrategyPreset
import es.manico.chartintelligence.algorithms.StrategySimulatorAlgorithm.TradeDirection
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Phase 6 — Offline Trading Strategy Simulator BottomSheet UI (Material 3).
 * Research-only, strictly offline per-chart simulation with zero broker/order APIs.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StrategyLabSheetContent(
    symbolCode: String,
    timeframe: String,
    chartId: String,
    candles: List<CandleBar>,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current

    var selectedPresetId by rememberSaveable { mutableStateOf(StrategyPreset.EMA_TREND_PULLBACK.id) }
    var selectedDirectionId by rememberSaveable { mutableStateOf(TradeDirection.BOTH.id) }
    var riskPct by rememberSaveable { mutableFloatStateOf(1.0f) }
    var rrRatio by rememberSaveable { mutableFloatStateOf(2.0f) }
    var atrStopMult by rememberSaveable { mutableFloatStateOf(1.5f) }
    var spreadBps by rememberSaveable { mutableFloatStateOf(4.0f) }
    var commissionBps by rememberSaveable { mutableFloatStateOf(5.0f) }

    val config = remember(selectedPresetId, selectedDirectionId, riskPct, rrRatio, atrStopMult, spreadBps, commissionBps) {
        StrategyConfig(
            preset = StrategyPreset.fromId(selectedPresetId),
            direction = TradeDirection.fromId(selectedDirectionId),
            initialEquity = 1000.0,
            riskPerTradePct = riskPct.toDouble(),
            rrRatio = rrRatio.toDouble(),
            atrStopMult = atrStopMult.toDouble(),
            spreadBps = spreadBps.toDouble(),
            commissionBps = commissionBps.toDouble()
        )
    }

    val result = remember(candles, symbolCode, timeframe, chartId, config) {
        StrategySimulatorAlgorithm.runSimulation(
            rawCandles = candles,
            symbolCode = symbolCode,
            timeframe = timeframe,
            chartId = chartId,
            config = config,
            includeSensitivity = true
        )
    }
    val m = result.metrics
    val bullColor = palette.bullCandle
    val bearColor = palette.bearCandle

    Column(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(max = 620.dp)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .testTag("strategy_lab_sheet_root"),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.weight(1f)
            ) {
                Icon(
                    imageVector = Icons.Outlined.ShowChart,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
                Column {
                    Text(
                        text = stringResource(R.string.strategy_lab_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = "$symbolCode · $timeframe · ${result.candleCount} bars",
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .minimumInteractiveComponentSize()
                    .testTag("strategy_lab_close_button")
            ) {
                Icon(
                    imageVector = Icons.Outlined.Close,
                    contentDescription = stringResource(R.string.action_cancel)
                )
            }
        }

        // Offline research notice banner
        Surface(
            shape = RoundedCornerShape(10.dp),
            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = stringResource(R.string.strategy_lab_offline_notice),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(10.dp)
            )
        }

        // Strategy Presets
        Text(
            text = stringResource(R.string.strategy_lab_preset_label),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            val presets = listOf(
                StrategyPreset.EMA_TREND_PULLBACK to stringResource(R.string.strategy_preset_ema_pullback),
                StrategyPreset.SR_ZONE_PATTERN_BOUNCE to stringResource(R.string.strategy_preset_sr_pattern),
                StrategyPreset.SUPERTREND_MOMENTUM to stringResource(R.string.strategy_preset_supertrend),
                StrategyPreset.BOLLINGER_MEAN_REVERSION to stringResource(R.string.strategy_preset_bollinger)
            )
            presets.forEach { (preset, label) ->
                FilterChip(
                    selected = selectedPresetId == preset.id,
                    onClick = { selectedPresetId = preset.id },
                    label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                    modifier = Modifier.testTag("strategy_preset_${preset.id.lowercase()}")
                )
            }
        }

        // Direction Selector + Reset
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.horizontalScroll(rememberScrollState())
            ) {
                listOf(
                    TradeDirection.BOTH to stringResource(R.string.strategy_dir_both),
                    TradeDirection.LONG_ONLY to stringResource(R.string.strategy_dir_long),
                    TradeDirection.SHORT_ONLY to stringResource(R.string.strategy_dir_short)
                ).forEach { (dir, label) ->
                    FilterChip(
                        selected = selectedDirectionId == dir.id,
                        onClick = { selectedDirectionId = dir.id },
                        label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                        modifier = Modifier.testTag("strategy_dir_${dir.id.lowercase()}")
                    )
                }
            }
            TextButton(
                onClick = {
                    selectedPresetId = StrategyPreset.EMA_TREND_PULLBACK.id
                    selectedDirectionId = TradeDirection.BOTH.id
                    riskPct = 1.0f
                    rrRatio = 2.0f
                    atrStopMult = 1.5f
                    spreadBps = 4.0f
                    commissionBps = 5.0f
                },
                modifier = Modifier
                    .minimumInteractiveComponentSize()
                    .testTag("strategy_lab_reset_button")
            ) {
                Icon(Icons.Outlined.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.size(4.dp))
                Text(stringResource(R.string.forecast_reset_models_btn), style = MaterialTheme.typography.labelSmall)
            }
        }

        // Compact Parameter Sliders
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceContainerLow,
            border = BorderStroke(1.dp, palette.cardBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                StrategyParamSliderRow(
                    label = stringResource(R.string.strategy_param_risk_pct),
                    valueText = String.format(Locale.US, "%.2f%% (€1,000)", riskPct),
                    value = riskPct,
                    valueRange = 0.25f..5.0f,
                    onValueChange = { riskPct = (it * 4f).roundToInt() / 4f }
                )
                StrategyParamSliderRow(
                    label = stringResource(R.string.strategy_param_rr),
                    valueText = String.format(Locale.US, "1 : %.2f", rrRatio),
                    value = rrRatio,
                    valueRange = 1.0f..5.0f,
                    onValueChange = { rrRatio = (it * 4f).roundToInt() / 4f }
                )
                StrategyParamSliderRow(
                    label = stringResource(R.string.strategy_param_friction),
                    valueText = String.format(Locale.US, "Spr %.0f / Com %.0f bps", spreadBps, commissionBps),
                    value = spreadBps,
                    valueRange = 0f..30f,
                    onValueChange = {
                        val v = it.roundToInt().toFloat()
                        spreadBps = v
                        commissionBps = max(0f, v)
                    }
                )
            }
        }

        // KPI Metrics Grid (2x3)
        val netColor = if (m.netProfitEur >= 0.0) bullColor else bearColor
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StrategyKpiTile(
                    title = stringResource(R.string.strategy_kpi_net_return),
                    value = String.format(Locale.US, "%+.2f€ (%+.1f%%)", m.netProfitEur, m.netReturnPct),
                    valueColor = netColor,
                    modifier = Modifier.weight(1f)
                )
                StrategyKpiTile(
                    title = stringResource(R.string.strategy_kpi_win_rate),
                    value = String.format(Locale.US, "%.1f%% (%d/%d)", m.winRatePct, m.winCount, m.totalTrades),
                    valueColor = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f)
                )
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StrategyKpiTile(
                    title = stringResource(R.string.strategy_kpi_profit_factor),
                    value = String.format(Locale.US, "%.2f · %+.2fR", m.profitFactor, m.averageR),
                    valueColor = if (m.profitFactor >= 1.2) bullColor else if (m.profitFactor >= 1.0) MaterialTheme.colorScheme.primary else bearColor,
                    modifier = Modifier.weight(1f)
                )
                StrategyKpiTile(
                    title = stringResource(R.string.strategy_kpi_max_dd),
                    value = String.format(Locale.US, "-%.2f%% (-€%.2f)", m.maxDrawdownPct, m.maxDrawdownEur),
                    valueColor = bearColor,
                    modifier = Modifier.weight(1f)
                )
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StrategyKpiTile(
                    title = stringResource(R.string.strategy_kpi_sharpe_sortino),
                    value = String.format(Locale.US, "%.2f / %.2f", m.sharpeRatio, m.sortinoRatio),
                    valueColor = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.weight(1f)
                )
                StrategyKpiTile(
                    title = stringResource(R.string.strategy_kpi_costs_streak),
                    value = String.format(Locale.US, "€%.2f · %dL", m.totalFeesEur, m.maxConsecutiveLosses),
                    valueColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // Equity Curve Canvas
        if (result.equityCurve.size >= 2) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceContainerLow,
                border = BorderStroke(1.dp, palette.cardBorder),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("strategy_lab_equity_curve")
            ) {
                Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = stringResource(R.string.strategy_lab_equity_curve),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    val curve = result.equityCurve
                    val initEq = config.initialEquity
                    val lineColor = if (m.finalEquity >= initEq) bullColor else bearColor
                    val guideColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f)
                    Canvas(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(128.dp)
                            .clip(RoundedCornerShape(8.dp))
                    ) {
                        val w = size.width
                        val h = size.height
                        if (w <= 0f || h <= 0f || curve.size < 2) return@Canvas
                        var minEq = initEq
                        var maxEq = initEq
                        for (pt in curve) {
                            if (pt.equity < minEq) minEq = pt.equity
                            if (pt.equity > maxEq) maxEq = pt.equity
                        }
                        val span = max(1e-6, maxEq - minEq)
                        val padY = 8f
                        fun yFor(eq: Double): Float =
                            (h - padY - ((eq - minEq) / span).toFloat() * (h - padY * 2f)).coerceIn(padY, h - padY)

                        val baseY = yFor(initEq)
                        drawLine(
                            color = guideColor,
                            start = Offset(0f, baseY),
                            end = Offset(w, baseY),
                            strokeWidth = 2f,
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f), 0f)
                        )

                        val path = Path()
                        val fillPath = Path()
                        val step = max(1, curve.size / 140)
                        var first = true
                        var lastX = 0f
                        for (idx in curve.indices step step) {
                            val x = (idx.toFloat() / (curve.size - 1).coerceAtLeast(1)) * w
                            val y = yFor(curve[idx].equity)
                            if (first) {
                                path.moveTo(x, y)
                                fillPath.moveTo(x, h)
                                fillPath.lineTo(x, y)
                                first = false
                            } else {
                                path.lineTo(x, y)
                                fillPath.lineTo(x, y)
                            }
                            lastX = x
                        }
                        val lastIdx = curve.lastIndex
                        if (lastIdx % step != 0) {
                            val y = yFor(curve[lastIdx].equity)
                            path.lineTo(w, y)
                            fillPath.lineTo(w, y)
                            lastX = w
                        }
                        fillPath.lineTo(lastX, h)
                        fillPath.close()

                        drawPath(
                            path = fillPath,
                            brush = Brush.verticalGradient(
                                colors = listOf(lineColor.copy(alpha = 0.25f), Color.Transparent)
                            )
                        )
                        drawPath(
                            path = path,
                            color = lineColor,
                            style = Stroke(width = 3.5f, cap = StrokeCap.Round, join = StrokeJoin.Round)
                        )
                    }
                }
            }
        }

        // Cost Sensitivity Table
        if (result.costSensitivity.isNotEmpty()) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceContainerLow,
                border = BorderStroke(1.dp, palette.cardBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = stringResource(R.string.strategy_lab_cost_sensitivity),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    result.costSensitivity.forEach { sc ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = sc.label,
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = String.format(Locale.US, "%+.2f%% (€%.1f)", sc.netReturnPct, sc.netProfitEur),
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = if (sc.netProfitEur >= 0.0) bullColor else bearColor
                            )
                            Text(
                                text = String.format(Locale.US, "PF %.2f · Fee €%.1f", sc.profitFactor, sc.totalFeesEur),
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }

        // Recent Trade Ledger
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceContainerLow,
            border = BorderStroke(1.dp, palette.cardBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = stringResource(R.string.strategy_lab_trade_ledger, result.trades.size),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold
                )
                if (result.trades.isEmpty()) {
                    Text(
                        text = stringResource(
                            if (result.status == "INSUFFICIENT_DATA") R.string.strategy_lab_insufficient_data
                            else R.string.strategy_lab_no_trades
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 6.dp)
                    )
                } else {
                    result.trades.takeLast(15).reversed().forEachIndexed { idx, trade ->
                        if (idx > 0) HorizontalDivider(color = palette.cardBorder.copy(alpha = 0.5f))
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "#${trade.id} ${trade.side} · ${trade.exitReason}",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = if (trade.side == "LONG") bullColor else bearColor
                                )
                                Text(
                                    text = trade.signalReason,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(
                                    text = String.format(Locale.US, "%+.2f€", trade.netPnlEur),
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = if (trade.netPnlEur >= 0.0) bullColor else bearColor
                                )
                                Text(
                                    text = String.format(Locale.US, "%+.2fR", trade.rMultiple),
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
    }
}

@Composable
private fun StrategyParamSliderRow(
    label: String,
    valueText: String,
    value: Float,
    valueRange: ClosedFloatingPointRange<Float>,
    onValueChange: (Float) -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(text = label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                text = valueText,
                style = MaterialTheme.typography.labelSmall,
                fontFamily = JetBrainsMonoFontFamily,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
        }
        Slider(
            value = value,
            onValueChange = onValueChange,
            valueRange = valueRange,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun StrategyKpiTile(
    title: String,
    value: String,
    valueColor: Color,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(1.dp, palette.cardBorder),
        modifier = modifier
    ) {
        Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = value,
                style = MaterialTheme.typography.labelMedium,
                fontFamily = JetBrainsMonoFontFamily,
                fontWeight = FontWeight.Bold,
                color = valueColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
