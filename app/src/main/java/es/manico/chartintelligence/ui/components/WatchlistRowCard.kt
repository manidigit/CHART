package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import java.math.BigDecimal

/**
 * TradingView Standard Compact Watchlist Row (56–64dp height):
 * - Left: Circular Asset Icon Badge (Au, OIL, Ag, FX)
 * - Middle Column:
 *   - Line 1: Symbol Code (e.g. XAUUSD) — Bold & Prominent
 *   - Line 2: Full Asset Name (e.g. Gold Spot / U.S. Dollar) — Smaller & Muted
 * - Right Column (Right-Aligned):
 *   - Line 1: Live Price (Tabular Monospace)
 *   - Line 2: Signed Change + Signed % (Green #26A69A for >=0, Red #EF5350 for <0)
 * - Clicking the entire row opens the Chart screen for that symbol.
 * - Zero extra buttons or data source labels inside the row.
 */
@Composable
fun WatchlistRowCard(
    symbol: SymbolConfig,
    onOpenChartClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current
    val (badgeLabel, badgeTint) = resolveAssetBadge(symbol.symbolCode)

    val displayName = symbol.customTitle
        ?: symbol.titleResId?.let { stringResource(it) }
        ?: symbol.symbolCode

    val lastClose = symbol.lastClose
    val refPrev = symbol.prevClose ?: lastClose ?: BigDecimal.ZERO
    val isBull = lastClose == null || lastClose >= refPrev
    val changeColor = if (isBull) financialPalette.bullCandle else financialPalette.bearCandle
    val changeLine = if (lastClose != null) {
        val diff = PriceFormatterAlgorithm.formatSignedPriceDiff(refPrev, lastClose, symbol.decimals)
        val pct = PriceFormatterAlgorithm.formatSignedPercentChange(refPrev, lastClose)
        "$diff ($pct)"
    } else {
        "+0.00 (+0.00%)"
    }

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Column(
            modifier = modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.background)
                .clickable(onClick = onOpenChartClick)
                .testTag("watchlist_card_${symbol.symbolCode.lowercase()}")
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 60.dp)
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Left: Circular Icon + Middle Column (Symbol Code + Full Name)
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(badgeTint.copy(alpha = 0.16f))
                            .border(1.dp, badgeTint.copy(alpha = 0.45f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = badgeLabel,
                            style = MaterialTheme.typography.labelMedium,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = badgeTint
                        )
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = symbol.symbolCode,
                            style = MaterialTheme.typography.titleMedium,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onBackground,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = displayName,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                // Right Column (Strictly Right-Aligned): Price (Line 1) + Change & % (Line 2)
                Column(
                    horizontalAlignment = Alignment.End
                ) {
                    Text(
                        text = PriceFormatterAlgorithm.formatPrice(lastClose, symbol.decimals),
                        style = MaterialTheme.typography.titleMedium,
                        fontFamily = JetBrainsMonoFontFamily,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground,
                        textAlign = TextAlign.End
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = changeLine,
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        fontWeight = FontWeight.SemiBold,
                        color = changeColor,
                        textAlign = TextAlign.End
                    )
                }
            }

            HorizontalDivider(
                thickness = 1.dp,
                color = financialPalette.cardBorder
            )
        }
    }
}

fun resolveAssetBadge(symbolCode: String): Pair<String, Color> {
    return when (symbolCode.uppercase()) {
        "XAUUSD" -> "Au" to Color(0xFFF59E0B)
        "SPOTBRENT", "BRENT_FUTURES" -> "OIL" to Color(0xFF2962FF)
        "XAGUSD" -> "Ag" to Color(0xFF94A3B8)
        "EURUSD" -> "FX" to Color(0xFF26A69A)
        else -> symbolCode.take(3).uppercase() to Color(0xFF2962FF)
    }
}
