package es.manico.chartintelligence.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
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
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

private enum class PredictionDetailType {
    BULL_SCENARIO,
    BEAR_SCENARIO,
    MARKET_STRUCTURE,
    PIVOT_LEVELS
}

/**
 * Dedicated Prediction Screen (3rd Bottom Navigation Tab):
 * User Flow:
 * - Change Symbol -> displays predictions for the new symbol
 * - Change Timeframe -> displays predictions for the new timeframe
 * - Click on any Prediction -> opens BottomSheet with full scenario details
 * - Switch Bottom Tab -> Watchlist | Chart (last active symbol) | Settings
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PredictionScreen(
    activeTab: ChartTabState?,
    watchlistSymbols: List<SymbolConfig>,
    onSelectSymbol: (SymbolConfig) -> Unit,
    onSelectTimeframe: (String) -> Unit = {},
    onBackToWatchlist: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    BackHandler(onBack = onBackToWatchlist)

    val palette = LocalFinancialPalette.current
    var showSymbolSheet by rememberSaveable { mutableStateOf(false) }
    var showTimeframeSheet by rememberSaveable { mutableStateOf(false) }
    var selectedDetailType by rememberSaveable { mutableStateOf<PredictionDetailType?>(null) }

    val candles = activeTab?.candles.orEmpty()
    val decimals = activeTab?.decimals ?: 2

    val metrics = remember(candles, decimals) {
        if (candles.isEmpty()) null else computePredictionMetrics(candles, decimals)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .widthIn(max = 640.dp)
        ) {
            // [2] Compact 48.dp Header: Title on Left, Symbol + Timeframe Selectors on Right
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(horizontal = 14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.prediction_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    if (activeTab != null) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Symbol Selector Chip
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(MaterialTheme.colorScheme.background)
                                    .border(1.dp, palette.cardBorder, RoundedCornerShape(6.dp))
                                    .clickable { showSymbolSheet = true }
                                    .padding(horizontal = 10.dp, vertical = 6.dp)
                                    .testTag("prediction_symbol_selector")
                            ) {
                                Text(
                                    text = "${activeTab.symbolCode} ▾",
                                    style = MaterialTheme.typography.labelLarge,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }

                            // Timeframe Selector Chip
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(MaterialTheme.colorScheme.background)
                                    .border(1.dp, palette.cardBorder, RoundedCornerShape(6.dp))
                                    .clickable { showTimeframeSheet = true }
                                    .padding(horizontal = 10.dp, vertical = 6.dp)
                                    .testTag("prediction_timeframe_selector")
                            ) {
                                Text(
                                    text = "${PriceFormatterAlgorithm.displayTimeframeLabel(activeTab.timeframe)} ▾",
                                    style = MaterialTheme.typography.labelLarge,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                }
            }

            HorizontalDivider(thickness = 1.dp, color = palette.cardBorder)

            // [3] Prediction & Market Structure Content
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (activeTab == null || metrics == null) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, palette.cardBorder)
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.prediction_engine_title),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = stringResource(R.string.chart_state_empty),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                } else {
                    val isBullBias = metrics.bullPct >= 50
                    val biasColor = if (isBullBias) palette.bullCandle else palette.bearCandle

                    // Prediction Card 1: Market Structure Bias & Sentiment (Tap for details)
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { selectedDetailType = PredictionDetailType.MARKET_STRUCTURE }
                            .testTag("prediction_card_structure"),
                        shape = RoundedCornerShape(8.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, palette.cardBorder)
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = if (isBullBias) {
                                        stringResource(R.string.prediction_bias_bullish)
                                    } else {
                                        stringResource(R.string.prediction_bias_bearish)
                                    },
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = biasColor
                                )
                                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                    Text(
                                        text = "${metrics.bullPct}% Bull / ${100 - metrics.bullPct}% Bear",
                                        style = MaterialTheme.typography.labelLarge,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        fontWeight = FontWeight.Bold,
                                        color = biasColor
                                    )
                                }
                            }
                            Text(
                                text = stringResource(R.string.prediction_engine_desc),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    // Prediction Card 2: Bullish Breakout Scenario (Tap for details)
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { selectedDetailType = PredictionDetailType.BULL_SCENARIO }
                            .testTag("prediction_card_bull"),
                        shape = RoundedCornerShape(8.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, palette.cardBorder)
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = stringResource(R.string.prediction_bull_breakout),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = palette.bullCandle
                                )
                                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                    Text(
                                        text = "${metrics.r1} → ${metrics.r2}",
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        fontWeight = FontWeight.Bold,
                                        color = palette.bullCandle
                                    )
                                }
                            }
                            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                LevelRow("Entry Above (Pivot P)", metrics.pivot, MaterialTheme.colorScheme.onSurface)
                                LevelRow("Target 1 (R1)", metrics.r1, palette.bullCandle)
                                LevelRow("Target 2 (R2)", metrics.r2, palette.bullCandle)
                            }
                        }
                    }

                    // Prediction Card 3: Bearish Breakdown Scenario (Tap for details)
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { selectedDetailType = PredictionDetailType.BEAR_SCENARIO }
                            .testTag("prediction_card_bear"),
                        shape = RoundedCornerShape(8.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, palette.cardBorder)
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = stringResource(R.string.prediction_bear_breakout),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = palette.bearCandle
                                )
                                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                    Text(
                                        text = "${metrics.s1} → ${metrics.s2}",
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        fontWeight = FontWeight.Bold,
                                        color = palette.bearCandle
                                    )
                                }
                            }
                            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                LevelRow("Breakdown Below (Pivot P)", metrics.pivot, MaterialTheme.colorScheme.onSurface)
                                LevelRow("Target 1 (S1)", metrics.s1, palette.bearCandle)
                                LevelRow("Target 2 (S2)", metrics.s2, palette.bearCandle)
                            }
                        }
                    }

                    // Prediction Card 4: Key Levels & Classic Floor Pivots + ATR (Tap for details)
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { selectedDetailType = PredictionDetailType.PIVOT_LEVELS }
                            .testTag("prediction_card_pivots"),
                        shape = RoundedCornerShape(8.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, palette.cardBorder)
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.prediction_pivots_title),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold
                            )
                            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                LevelRow("R2 (Resistance 2)", metrics.r2, palette.bearCandle)
                                LevelRow("R1 (Resistance 1)", metrics.r1, palette.bearCandle)
                                LevelRow("Pivot (P)", metrics.pivot, MaterialTheme.colorScheme.primary)
                                LevelRow("S1 (Support 1)", metrics.s1, palette.bullCandle)
                                LevelRow("S2 (Support 2)", metrics.s2, palette.bullCandle)
                                HorizontalDivider(
                                    modifier = Modifier.padding(vertical = 4.dp),
                                    thickness = 1.dp,
                                    color = palette.cardBorder
                                )
                                LevelRow("ATR (14)", metrics.atr14, MaterialTheme.colorScheme.onSurface)
                                LevelRow("Period High", metrics.periodHigh, palette.bullCandle)
                                LevelRow("Period Low", metrics.periodLow, palette.bearCandle)
                            }
                        }
                    }
                }
            }
        }
    }

    // BottomSheet 1: Symbol Selector inside Prediction Screen
    if (showSymbolSheet && activeTab != null) {
        ModalBottomSheet(
            onDismissRequest = { showSymbolSheet = false },
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = stringResource(R.string.nav_watchlist),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                for (sym in watchlistSymbols) {
                    val isSelected = sym.symbolCode == activeTab.symbolCode
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .clickable {
                                showSymbolSheet = false
                                onSelectSymbol(sym)
                            }
                            .padding(vertical = 8.dp, horizontal = 6.dp)
                            .testTag("prediction_symbol_option_${sym.symbolCode.lowercase()}"),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = isSelected,
                            onClick = {
                                showSymbolSheet = false
                                onSelectSymbol(sym)
                            }
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = sym.symbolCode,
                                style = MaterialTheme.typography.bodyMedium,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }

    // BottomSheet 2: Timeframe Selector inside Prediction Screen
    if (showTimeframeSheet && activeTab != null) {
        ModalBottomSheet(
            onDismissRequest = { showTimeframeSheet = false },
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = stringResource(R.string.label_timeframe),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                for (tf in activeTab.allowedTimeframes) {
                    val isSelected = activeTab.timeframe.equals(tf, ignoreCase = true)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .clickable {
                                showTimeframeSheet = false
                                onSelectTimeframe(tf)
                            }
                            .padding(vertical = 8.dp, horizontal = 6.dp)
                            .testTag("prediction_tf_option_${tf.lowercase()}"),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = isSelected,
                            onClick = {
                                showTimeframeSheet = false
                                onSelectTimeframe(tf)
                            }
                        )
                        Text(
                            text = PriceFormatterAlgorithm.displayTimeframeLabel(tf),
                            style = MaterialTheme.typography.bodyMedium,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }

    // BottomSheet 3: Prediction Scenario Detail Sheet (when user taps any prediction card)
    if (selectedDetailType != null && activeTab != null && metrics != null) {
        ModalBottomSheet(
            onDismissRequest = { selectedDetailType = null },
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .testTag("prediction_detail_sheet"),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                val sheetTitle = when (selectedDetailType!!) {
                    PredictionDetailType.BULL_SCENARIO -> stringResource(R.string.prediction_bull_breakout)
                    PredictionDetailType.BEAR_SCENARIO -> stringResource(R.string.prediction_bear_breakout)
                    PredictionDetailType.MARKET_STRUCTURE -> stringResource(R.string.prediction_engine_title)
                    PredictionDetailType.PIVOT_LEVELS -> stringResource(R.string.prediction_pivots_title)
                }

                Text(
                    text = "${activeTab.symbolCode} (${PriceFormatterAlgorithm.displayTimeframeLabel(activeTab.timeframe)}) · $sheetTitle",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                HorizontalDivider(thickness = 1.dp, color = palette.cardBorder)

                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    LevelRow("Last Close", metrics.lastClose, MaterialTheme.colorScheme.onSurface)
                    LevelRow("Classic Pivot (P)", metrics.pivot, MaterialTheme.colorScheme.primary)
                    when (selectedDetailType!!) {
                        PredictionDetailType.BULL_SCENARIO -> {
                            LevelRow("Breakout Trigger (R1)", metrics.r1, palette.bullCandle)
                            LevelRow("Extended Target (R2)", metrics.r2, palette.bullCandle)
                            LevelRow("Invalidation Below (S1)", metrics.s1, palette.bearCandle)
                            LevelRow("ATR (14) Volatility", metrics.atr14, MaterialTheme.colorScheme.onSurface)
                        }

                        PredictionDetailType.BEAR_SCENARIO -> {
                            LevelRow("Breakdown Trigger (S1)", metrics.s1, palette.bearCandle)
                            LevelRow("Extended Target (S2)", metrics.s2, palette.bearCandle)
                            LevelRow("Invalidation Above (R1)", metrics.r1, palette.bullCandle)
                            LevelRow("ATR (14) Volatility", metrics.atr14, MaterialTheme.colorScheme.onSurface)
                        }

                        PredictionDetailType.MARKET_STRUCTURE,
                        PredictionDetailType.PIVOT_LEVELS -> {
                            LevelRow("Bullish Candle Ratio", "${metrics.bullPct}%", palette.bullCandle)
                            LevelRow("Bearish Candle Ratio", "${100 - metrics.bullPct}%", palette.bearCandle)
                            LevelRow("Resistance R1 / R2", "${metrics.r1} / ${metrics.r2}", palette.bearCandle)
                            LevelRow("Support S1 / S2", "${metrics.s1} / ${metrics.s2}", palette.bullCandle)
                            LevelRow("Period Range (Low - High)", "${metrics.periodLow} – ${metrics.periodHigh}", MaterialTheme.colorScheme.onSurface)
                            LevelRow("ATR (14)", metrics.atr14, MaterialTheme.colorScheme.primary)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}

@Composable
private fun LevelRow(
    label: String,
    value: String,
    valueColor: Color
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontFamily = JetBrainsMonoFontFamily,
            fontWeight = FontWeight.Bold,
            color = valueColor
        )
    }
}

private data class PredictionMetrics(
    val lastClose: String,
    val bullPct: Int,
    val pivot: String,
    val r1: String,
    val r2: String,
    val s1: String,
    val s2: String,
    val atr14: String,
    val periodHigh: String,
    val periodLow: String
)

private fun computePredictionMetrics(
    candles: List<CandleBar>,
    decimals: Int
): PredictionMetrics {
    val window = candles.takeLast(60)
    val bulls = window.count { it.close >= it.open }
    val bullPct = ((bulls.toDouble() / max(1, window.size)) * 100.0).roundToInt()

    val latestBar = candles.last()
    val refBar = if (candles.size >= 2) candles[candles.size - 2] else latestBar
    val h = refBar.high.toDouble()
    val l = refBar.low.toDouble()
    val c = refBar.close.toDouble()
    val p = (h + l + c) / 3.0
    val r1 = 2.0 * p - l
    val s1 = 2.0 * p - h
    val r2 = p + (h - l)
    val s2 = p - (h - l)

    val atrSlice = candles.takeLast(15)
    var trSum = 0.0
    var trCount = 0
    for (i in 1 until atrSlice.size) {
        val cur = atrSlice[i]
        val prev = atrSlice[i - 1]
        val tr = max(
            cur.high.toDouble() - cur.low.toDouble(),
            max(
                abs(cur.high.toDouble() - prev.close.toDouble()),
                abs(cur.low.toDouble() - prev.close.toDouble())
            )
        )
        trSum += tr
        trCount++
    }
    val atr = if (trCount > 0) trSum / trCount else (h - l)

    val maxHigh = window.maxOf { it.high }
    val minLow = window.minOf { it.low }

    fun fmt(v: Double): String = PriceFormatterAlgorithm.formatPrice(
        BigDecimal.valueOf(v).setScale(decimals, RoundingMode.HALF_UP),
        decimals
    )

    return PredictionMetrics(
        lastClose = PriceFormatterAlgorithm.formatPrice(latestBar.close, decimals),
        bullPct = bullPct,
        pivot = fmt(p),
        r1 = fmt(r1),
        r2 = fmt(r2),
        s1 = fmt(s1),
        s2 = fmt(s2),
        atr14 = fmt(atr),
        periodHigh = PriceFormatterAlgorithm.formatPrice(maxHigh, decimals),
        periodLow = PriceFormatterAlgorithm.formatPrice(minLow, decimals)
    )
}
