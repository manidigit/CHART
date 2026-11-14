package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.forecast.EventDictionarySpec
import es.manico.chartintelligence.forecast.ForecastEvaluationOutcome
import es.manico.chartintelligence.forecast.ForecastLifecycleEvent
import es.manico.chartintelligence.forecast.ForecastLifecycleStatus
import es.manico.chartintelligence.forecast.ForecastResult
import es.manico.chartintelligence.forecast.ForecastStabilityReport
import es.manico.chartintelligence.forecast.KeyPriceZone
import es.manico.chartintelligence.forecast.LifecycleVerifyResult
import es.manico.chartintelligence.forecast.MtfAlignmentState
import es.manico.chartintelligence.forecast.MtfCoordinationReport
import es.manico.chartintelligence.forecast.NoEdgeGateReport
import es.manico.chartintelligence.forecast.NoEdgeGateState
import es.manico.chartintelligence.forecast.OodStatus
import es.manico.chartintelligence.forecast.UncertaintyBreakdown
import es.manico.chartintelligence.forecast.WalkForwardReport
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import java.math.BigDecimal
import java.util.Locale
import kotlin.math.roundToInt

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NoEdgeAndOodHeaderBadges(
    result: ForecastResult,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current
    val noEdge = result.noEdgeGate
    val unc = result.uncertainty

    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        if (noEdge != null) {
            val edgeColor = if (noEdge.gateState == NoEdgeGateState.EDGE_SUPPORTED) palette.bullCandle else Color(0xFFF59E0B)
            Surface(
                color = edgeColor.copy(alpha = 0.16f),
                shape = RoundedCornerShape(4.dp),
                modifier = Modifier.testTag("forecast_no_edge_badge")
            ) {
                Text(
                    text = noEdge.gateState.name,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                    style = MaterialTheme.typography.labelSmall,
                    fontSize = 10.sp,
                    fontFamily = JetBrainsMonoFontFamily,
                    fontWeight = FontWeight.Bold,
                    color = edgeColor
                )
            }
        }
        if (unc != null) {
            val oodColor = when (unc.oodStatus) {
                OodStatus.IN_DISTRIBUTION -> palette.bullCandle
                OodStatus.ELEVATED -> Color(0xFFF59E0B)
                OodStatus.EXTREME -> palette.bearCandle
            }
            Surface(
                color = oodColor.copy(alpha = 0.16f),
                shape = RoundedCornerShape(4.dp),
                modifier = Modifier.testTag("forecast_ood_badge")
            ) {
                Text(
                    text = "OOD: ${unc.oodStatus.name}",
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                    style = MaterialTheme.typography.labelSmall,
                    fontSize = 10.sp,
                    fontFamily = JetBrainsMonoFontFamily,
                    fontWeight = FontWeight.Bold,
                    color = oodColor
                )
            }
        }
    }
}

@Composable
fun NoEdgeWarningBanner(
    noEdgeGate: NoEdgeGateReport,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current
    val isSupported = noEdgeGate.hasEdge
    val accent = if (isSupported) palette.bullCandle else Color(0xFFF59E0B)
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("forecast_no_edge_banner"),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, accent.copy(alpha = 0.65f))
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.forecast_no_edge_warning_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = accent
                )
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Text(
                        text = "N_eff=${String.format(Locale.US, "%.1f", noEdgeGate.effectiveSampleSize)} · Skill=${String.format(Locale.US, "%.1f", noEdgeGate.skillScoreVsBaseline * 100.0)}%",
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        fontWeight = FontWeight.Bold,
                        color = accent
                    )
                }
            }
            for (r in noEdgeGate.reasons) {
                Text(
                    text = "• $r",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
fun UncertaintyBreakdownCard(
    uncertainty: UncertaintyBreakdown,
    stability: ForecastStabilityReport?,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current
    val oodColor = when (uncertainty.oodStatus) {
        OodStatus.IN_DISTRIBUTION -> palette.bullCandle
        OodStatus.ELEVATED -> Color(0xFFF59E0B)
        OodStatus.EXTREME -> palette.bearCandle
    }
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("forecast_uncertainty_card"),
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
                    text = stringResource(R.string.forecast_uncertainty_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Surface(color = oodColor.copy(alpha = 0.16f), shape = RoundedCornerShape(4.dp)) {
                        Text(
                            text = "${uncertainty.oodStatus.name} (d=${String.format(Locale.US, "%.2f", uncertainty.oodDistance)})",
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = oodColor
                        )
                    }
                }
            }

            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                val aleaFrac = uncertainty.aleatoricShare.toFloat().coerceIn(0.05f, 0.95f)
                val epiFrac = (1f - aleaFrac).coerceIn(0.05f, 0.95f)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(10.dp)
                        .clip(RoundedCornerShape(5.dp))
                        .background(MaterialTheme.colorScheme.background)
                ) {
                    Box(
                        modifier = Modifier
                            .weight(aleaFrac)
                            .fillMaxHeight()
                            .background(Color(0xFF38BDF8))
                    )
                    Box(
                        modifier = Modifier
                            .weight(epiFrac)
                            .fillMaxHeight()
                            .background(oodColor)
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Aleatoric ${(uncertainty.aleatoricShare * 100.0).roundToInt()}% (${String.format(Locale.US, "%.2f", uncertainty.aleatoricPct)}%)",
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = Color(0xFF38BDF8)
                    )
                    Text(
                        text = "Epistemic ${(uncertainty.epistemicShare * 100.0).roundToInt()}% (${String.format(Locale.US, "%.2f", uncertainty.epistemicPct)}%)",
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = oodColor
                    )
                }
                Text(
                    text = "Total Spread σ: ${String.format(Locale.US, "%.2f", uncertainty.totalPct)}% · OOD Multiplier: ${String.format(Locale.US, "%.2f", uncertainty.spreadMultiplierApplied)}x",
                    style = MaterialTheme.typography.labelSmall,
                    fontFamily = JetBrainsMonoFontFamily,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (uncertainty.oodReasons.isNotEmpty()) {
                for (reason in uncertainty.oodReasons) {
                    Text(
                        text = "• $reason",
                        style = MaterialTheme.typography.bodySmall,
                        color = oodColor
                    )
                }
            }

            if (stability != null && stability.previousForecastHash != null) {
                HorizontalDivider(color = palette.cardBorder.copy(alpha = 0.6f))
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Text(
                        text = "${stringResource(R.string.forecast_stability_title)}: Drift ${String.format(Locale.US, "%.2f", stability.medianDriftPct)}% · WidthShift ${String.format(Locale.US, "%.2f", stability.corridorShiftPct)}% · ${if (stability.stable) "STABLE" else "SHIFTED"}",
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = if (stability.stable) palette.bullCandle else Color(0xFFF59E0B),
                        modifier = Modifier.testTag("forecast_stability_row")
                    )
                }
            }
        }
    }
}

@Composable
fun MtfCoordinationCard(
    mtf: MtfCoordinationReport,
    coordMode: String,
    onSelectCoordMode: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current
    val alignColor = when (mtf.alignmentState) {
        MtfAlignmentState.ALIGNED -> palette.bullCandle
        MtfAlignmentState.NATURAL_HORIZON_DIVERGENCE -> Color(0xFFF59E0B)
        MtfAlignmentState.STRUCTURAL_CONFLICT -> palette.bearCandle
        MtfAlignmentState.SINGLE_TIMEFRAME -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("forecast_mtf_card"),
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
                    text = stringResource(R.string.forecast_mtf_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Surface(color = alignColor.copy(alpha = 0.16f), shape = RoundedCornerShape(4.dp)) {
                        Text(
                            text = "${mtf.referenceTimeframe}: ${mtf.alignmentState.name}",
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = alignColor
                        )
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = coordMode != "coordinated",
                    onClick = { onSelectCoordMode("independent") },
                    label = { Text(stringResource(R.string.forecast_coord_independent), fontSize = 11.sp) },
                    modifier = Modifier.testTag("forecast_coord_independent_chip")
                )
                FilterChip(
                    selected = coordMode == "coordinated",
                    onClick = { onSelectCoordMode("coordinated") },
                    label = { Text(stringResource(R.string.forecast_coord_coordinated), fontSize = 11.sp) },
                    modifier = Modifier.testTag("forecast_coord_coordinated_chip")
                )
            }

            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Text(
                    text = "Independent q50: ${String.format(Locale.US, "%+.2f", mtf.independentMedianPct)}% · Coordinated q50: ${String.format(Locale.US, "%+.2f", mtf.coordinatedMedianPct)}% · OHLC Envelope Consistent: ${mtf.ohlcConsistent}",
                    style = MaterialTheme.typography.labelSmall,
                    fontFamily = JetBrainsMonoFontFamily,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            for (reason in mtf.conflictReasons) {
                Text(
                    text = "• $reason",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
fun KeyPriceZonesSection(
    zones: List<KeyPriceZone>,
    decimals: Int,
    modifier: Modifier = Modifier
) {
    if (zones.isEmpty()) return
    val palette = LocalFinancialPalette.current
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("forecast_key_zones_card"),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, palette.cardBorder)
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = stringResource(R.string.forecast_zones_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold
            )
            for (z in zones) {
                val accent = if (z.zoneType.contains("RESISTANCE")) palette.bearCandle else palette.bullCandle
                HorizontalDivider(color = palette.cardBorder.copy(alpha = 0.5f))
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "${z.zoneType} (${z.zoneId})",
                                style = MaterialTheme.typography.labelMedium,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = accent
                            )
                            Text(
                                text = "Strength ${(z.strength * 100.0).roundToInt()}%",
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Text(
                            text = "Zone: [${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(z.lowPrice), decimals)} .. ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(z.highPrice), decimals)}] · Center ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(z.centerPrice), decimals)}",
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = JetBrainsMonoFontFamily
                        )
                        Text(
                            text = "Touch ${(z.touchProbability * 100.0).roundToInt()}% · Pen ${(z.penetrationProbability * 100.0).roundToInt()}% · Reclaim ${(z.reclaimProbability * 100.0).roundToInt()}% · Break ${(z.confirmedBreakoutProbability * 100.0).roundToInt()}%",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = "Reach-Before-Invalidation: ${(z.reachBeforeInvalidationProb * 100.0).roundToInt()}% vs Inv-First ${(z.invalidationBeforeReachProb * 100.0).roundToInt()}% · E[T_cens]=${String.format(Locale.US, "%.1f", z.expectedBarsToReachCensored)}b",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun PathEventAndSensitivityCard(
    walkForward: WalkForwardReport?,
    eventDictionary: EventDictionarySpec?,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current
    val pathStats = walkForward?.pathEventStats
    val grid = eventDictionary?.sensitivityGrid.orEmpty()
    if (pathStats == null && grid.isEmpty()) return

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("forecast_path_sensitivity_card"),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, palette.cardBorder)
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (pathStats != null) {
                Text(
                    text = stringResource(R.string.forecast_path_stats_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    val row1 = listOf(
                        "Touch Rate" to "${String.format(Locale.US, "%.1f", pathStats.touchRatePct)}%",
                        "Penetration" to "${String.format(Locale.US, "%.1f", pathStats.penetrationRatePct)}%",
                        "Reclaim Rate" to "${String.format(Locale.US, "%.1f", pathStats.reclaimRatePct)}%"
                    )
                    val row2 = listOf(
                        "Breakout" to "${String.format(Locale.US, "%.1f", pathStats.breakoutRatePct)}%",
                        "Reach < Inv" to "${String.format(Locale.US, "%.1f", pathStats.reachBeforeInvalidationPct)}%",
                        "Amb / Cens" to "${String.format(Locale.US, "%.0f", pathStats.ambiguousRatePct)}% / ${String.format(Locale.US, "%.0f", pathStats.censoringRatePct)}%"
                    )
                    for (statRow in listOf(row1, row2)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            for ((label, value) in statRow) {
                                Surface(
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(8.dp),
                                    color = MaterialTheme.colorScheme.background,
                                    border = BorderStroke(1.dp, palette.cardBorder)
                                ) {
                                    Column(
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
                                        verticalArrangement = Arrangement.spacedBy(2.dp)
                                    ) {
                                        Text(
                                            text = label,
                                            style = MaterialTheme.typography.labelSmall,
                                            fontSize = 10.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        Text(
                                            text = value,
                                            style = MaterialTheme.typography.labelMedium,
                                            fontFamily = JetBrainsMonoFontFamily,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (grid.isNotEmpty()) {
                HorizontalDivider(color = palette.cardBorder)
                Text(
                    text = stringResource(R.string.forecast_sensitivity_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.background.copy(alpha = 0.35f))
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(MaterialTheme.colorScheme.background)
                                .padding(horizontal = 8.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("PenATR", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.9f))
                            Text("RecBar", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.8f))
                            Text("Touch%", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.8f))
                            Text("Rec%", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.8f))
                            Text("Brk%", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.8f))
                            Text("Amb%", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.8f))
                        }
                        grid.forEachIndexed { idx, row ->
                            HorizontalDivider(color = palette.cardBorder.copy(alpha = 0.4f))
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(
                                        if (idx % 2 == 1) MaterialTheme.colorScheme.background.copy(alpha = 0.5f)
                                        else Color.Transparent
                                    )
                                    .padding(horizontal = 8.dp, vertical = 5.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("${String.format(Locale.US, "%.2f", row.penetrationAtrMult)}x", style = MaterialTheme.typography.labelSmall, fontFamily = JetBrainsMonoFontFamily, modifier = Modifier.weight(0.9f))
                                Text("${row.reclaimWindowBars}b", style = MaterialTheme.typography.labelSmall, fontFamily = JetBrainsMonoFontFamily, modifier = Modifier.weight(0.8f))
                                Text("${String.format(Locale.US, "%.0f", row.touchFreqPct)}%", style = MaterialTheme.typography.labelSmall, fontFamily = JetBrainsMonoFontFamily, modifier = Modifier.weight(0.8f))
                                Text("${String.format(Locale.US, "%.0f", row.reclaimFreqPct)}%", style = MaterialTheme.typography.labelSmall, fontFamily = JetBrainsMonoFontFamily, modifier = Modifier.weight(0.8f))
                                Text("${String.format(Locale.US, "%.0f", row.breakoutFreqPct)}%", style = MaterialTheme.typography.labelSmall, fontFamily = JetBrainsMonoFontFamily, modifier = Modifier.weight(0.8f))
                                Text("${String.format(Locale.US, "%.0f", row.ambiguousRatePct)}%", style = MaterialTheme.typography.labelSmall, fontFamily = JetBrainsMonoFontFamily, color = Color(0xFFF59E0B), modifier = Modifier.weight(0.8f))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun LifecycleEventLogCard(
    events: List<ForecastLifecycleEvent>,
    verifyResult: LifecycleVerifyResult,
    decimals: Int,
    onEvaluateMatured: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalFinancialPalette.current
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("forecast_lifecycle_card"),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, if (verifyResult.valid) palette.cardBorder else palette.bearCandle)
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.forecast_lifecycle_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                Surface(
                    color = (if (verifyResult.valid) palette.bullCandle else palette.bearCandle).copy(alpha = 0.16f),
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text(
                        text = if (verifyResult.valid) "APPEND-ONLY (${verifyResult.totalEvents})" else "TAMPER",
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        fontWeight = FontWeight.Bold,
                        color = if (verifyResult.valid) palette.bullCandle else palette.bearCandle
                    )
                }
            }

            OutlinedButton(
                onClick = onEvaluateMatured,
                modifier = Modifier
                    .fillMaxWidth()
                    .minimumInteractiveComponentSize()
                    .testTag("forecast_lifecycle_evaluate_btn"),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text(
                    text = stringResource(R.string.forecast_eval_matured_btn),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold
                )
            }

            if (events.isEmpty()) {
                Text(
                    text = "No append-only lifecycle events yet.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    for (ev in events.asReversed().take(12)) {
                        val outcomeColor = when (ev.evaluationOutcome) {
                            ForecastEvaluationOutcome.SUCCESS -> palette.bullCandle
                            ForecastEvaluationOutcome.FAILED -> palette.bearCandle
                            ForecastEvaluationOutcome.AMBIGUOUS -> Color(0xFFF59E0B)
                            ForecastEvaluationOutcome.INCOMPLETE_DATA -> MaterialTheme.colorScheme.onSurfaceVariant
                            ForecastEvaluationOutcome.PENDING -> if (ev.lifecycleStatus == ForecastLifecycleStatus.SUPERSEDED) Color(0xFF94A3B8) else Color(0xFF38BDF8)
                        }
                        HorizontalDivider(color = palette.cardBorder.copy(alpha = 0.45f))
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "#${ev.seq} · ${ev.symbolCode} ${ev.timeframe} +${ev.horizonStep}b · ${ev.lifecycleStatus.name}",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = ev.evaluationOutcome.name,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = outcomeColor
                                )
                            }
                            if (ev.reason.isNotBlank()) {
                                Text(
                                    text = ev.reason,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            val obsStr = ev.observedClose?.let {
                                " · Obs ${PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(it), decimals)}"
                            } ?: ""
                            Text(
                                text = "hash:${ev.eventHash.take(12)}… (run:${ev.forecastHash.take(8)}…)$obsStr",
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
            }
        }
    }
}
