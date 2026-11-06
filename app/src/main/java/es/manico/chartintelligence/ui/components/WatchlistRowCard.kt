package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CandlestickChart
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
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

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("watchlist_card_${symbol.symbolCode.lowercase()}"),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        border = BorderStroke(1.dp, financialPalette.cardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(symbol.titleResId),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                            Text(
                                text = symbol.symbolCode,
                                style = MaterialTheme.typography.labelLarge,
                                fontFamily = JetBrainsMonoFontFamily,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        SourceBadgeChip(
                            provider = symbol.activeProvider,
                            timeframe = symbol.timeframe
                        )
                    }
                }

                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = PriceFormatterAlgorithm.formatPrice(symbol.lastClose, symbol.decimals),
                            style = MaterialTheme.typography.titleLarge,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = "${symbol.storedCandleCount} bars",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.label_last_candle_utc),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Text(
                        text = symbol.lastCandleUtc ?: stringResource(R.string.status_never_synced),
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = financialPalette.bullCandle
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedButton(
                    onClick = onSyncNowClick,
                    enabled = !symbol.isSyncing,
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp)
                        .testTag("sync_now_button_${symbol.symbolCode.lowercase()}")
                ) {
                    if (symbol.isSyncing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(text = stringResource(R.string.action_syncing))
                    } else {
                        Icon(
                            imageVector = Icons.Outlined.Sync,
                            contentDescription = stringResource(R.string.action_sync_now),
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(text = stringResource(R.string.action_sync_now))
                    }
                }

                Button(
                    onClick = onOpenChartClick,
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp)
                        .testTag("open_chart_button_${symbol.symbolCode.lowercase()}")
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CandlestickChart,
                        contentDescription = stringResource(R.string.action_open_chart_view),
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = stringResource(R.string.action_open_chart_view))
                }
            }
        }
    }
}
