package es.manico.chartintelligence.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.ui.components.WatchlistRowCard
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette

@Composable
fun WatchlistScreen(
    watchlistSymbols: List<SymbolConfig>,
    isSyncingAll: Boolean,
    statusBannerResId: Int?,
    onSyncSymbolNow: (String) -> Unit,
    onSyncAllNow: () -> Unit,
    onOpenSymbolInChartTab: (SymbolConfig) -> Unit,
    onNavigateToSettings: () -> Unit,
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .widthIn(max = 640.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.watchlist_title),
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        text = stringResource(R.string.watchlist_subtitle),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = onSyncAllNow,
                    enabled = !isSyncingAll && watchlistSymbols.isNotEmpty(),
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp)
                        .testTag("sync_all_watchlist_button")
                ) {
                    if (isSyncingAll) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(text = stringResource(R.string.action_syncing))
                    } else {
                        Icon(
                            imageVector = Icons.Outlined.Sync,
                            contentDescription = stringResource(R.string.action_sync_all),
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(text = stringResource(R.string.action_sync_all))
                    }
                }

                OutlinedButton(
                    onClick = onNavigateToSettings,
                    modifier = Modifier
                        .heightIn(min = 48.dp)
                        .testTag("watchlist_to_settings_button")
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Settings,
                        contentDescription = stringResource(R.string.nav_settings),
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = stringResource(R.string.nav_settings))
                }
            }

            if (statusBannerResId != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = stringResource(statusBannerResId),
                    style = MaterialTheme.typography.labelLarge,
                    color = financialPalette.bullCandle,
                    modifier = Modifier.testTag("watchlist_status_banner")
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (watchlistSymbols.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 48.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = stringResource(R.string.watchlist_empty_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = stringResource(R.string.watchlist_empty_hint),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .testTag("watchlist_lazy_column"),
                    contentPadding = PaddingValues(bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(
                        items = watchlistSymbols,
                        key = { it.symbolCode }
                    ) { symbol ->
                        WatchlistRowCard(
                            symbol = symbol,
                            onSyncNowClick = { onSyncSymbolNow(symbol.symbolCode) },
                            onOpenChartClick = { onOpenSymbolInChartTab(symbol) }
                        )
                    }
                }
            }
        }
    }
}
