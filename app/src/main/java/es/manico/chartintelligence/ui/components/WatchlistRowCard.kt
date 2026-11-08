package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CandlestickChart
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette

@Composable
fun WatchlistRowCard(
    symbol: SymbolConfig,
    onSyncNowClick: () -> Unit,
    onOpenChartClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current
    val (badgeLabel, badgeTint) = resolveAssetBadge(symbol.symbolCode)

    Card(
        onClick = onOpenChartClick,
        modifier = modifier
            .fillMaxWidth()
            .testTag("watchlist_card_${symbol.symbolCode.lowercase()}"),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        border = BorderStroke(1.dp, financialPalette.cardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left / Start: Asset Badge + Ticker & Subtitle
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .background(badgeTint.copy(alpha = 0.16f))
                        .border(1.dp, badgeTint.copy(alpha = 0.45f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                        Text(
                            text = badgeLabel,
                            style = MaterialTheme.typography.labelMedium,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = badgeTint
                        )
                    }
                }

                Spacer(modifier = Modifier.width(10.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                            Text(
                                text = symbol.symbolCode,
                                style = MaterialTheme.typography.titleSmall,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                        SourceBadgeChip(
                            provider = symbol.activeProvider,
                            timeframe = symbol.timeframe
                        )
                    }

                    Spacer(modifier = Modifier.height(2.dp))

                    val displayName = symbol.customTitle
                        ?: symbol.titleResId?.let { stringResource(it) }
                        ?: symbol.symbolCode
                    Text(
                        text = displayName,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    Spacer(modifier = Modifier.height(2.dp))

                    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                        val utcText = symbol.lastCandleUtc ?: stringResource(R.string.status_never_synced)
                        Text(
                            text = "$utcText · ${symbol.storedCandleCount} bars",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                            fontFamily = JetBrainsMonoFontFamily,
                            color = if (symbol.lastCandleUtc != null) {
                                financialPalette.bullCandle
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Right / End: Tabular Price + Compact Sync & Chart Action Buttons
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = PriceFormatterAlgorithm.formatPrice(symbol.lastClose, symbol.decimals),
                            style = MaterialTheme.typography.titleMedium,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = PriceFormatterAlgorithm.displayTimeframeLabel(symbol.timeframe),
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }

                IconButton(
                    onClick = onSyncNowClick,
                    enabled = !symbol.isSyncing,
                    modifier = Modifier
                        .size(40.dp)
                        .testTag("sync_now_button_${symbol.symbolCode.lowercase()}")
                ) {
                    if (symbol.isSyncing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.primary
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Outlined.Sync,
                            contentDescription = stringResource(R.string.action_sync_now),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }

                FilledTonalIconButton(
                    onClick = onOpenChartClick,
                    colors = IconButtonDefaults.filledTonalIconButtonColors(
                        containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                        contentColor = MaterialTheme.colorScheme.primary
                    ),
                    modifier = Modifier
                        .size(40.dp)
                        .testTag("open_chart_button_${symbol.symbolCode.lowercase()}")
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CandlestickChart,
                        contentDescription = stringResource(R.string.action_open_chart_view),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}

private fun resolveAssetBadge(symbolCode: String): Pair<String, Color> {
    return when (symbolCode.uppercase()) {
        "XAUUSD" -> "Au" to Color(0xFFF59E0B)
        "SPOTBRENT", "BRENT_FUTURES" -> "OIL" to Color(0xFF38BDF8)
        "XAGUSD" -> "Ag" to Color(0xFF94A3B8)
        "EURUSD" -> "FX" to Color(0xFF2962FF)
        else -> symbolCode.take(3).uppercase() to Color(0xFF26A69A)
    }
}
