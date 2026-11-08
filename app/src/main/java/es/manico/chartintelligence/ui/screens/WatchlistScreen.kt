package es.manico.chartintelligence.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.data.model.ProviderId
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.ui.components.WatchlistRowCard
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette

/**
 * Mandatory Watchlist Screen Structure:
 * [1] Safe Area / Status Bar Inset (handled by parent Scaffold)
 * [2] Compact Header (48.dp): Left = Watchlist Title, Right = '+' Button to add symbols to Watchlist
 * [3] Symbol List: Vertical-only LazyColumn with Pull-to-Refresh and Swipe-to-Remove
 * [4] Bottom Navigation Tabs (Watchlist active)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchlistScreen(
    watchlistSymbols: List<SymbolConfig>,
    allSymbols: List<SymbolConfig> = watchlistSymbols,
    isSyncingAll: Boolean,
    statusBannerResId: Int?,
    onSyncSymbolNow: (String) -> Unit,
    onSyncAllNow: () -> Unit,
    onOpenSymbolInChartTab: (SymbolConfig) -> Unit,
    onToggleSymbolInWatchlist: (String, Boolean) -> Unit = { _, _ -> },
    onAddCustomSymbol: (String, String, Int, ProviderId) -> Unit = { _, _, _, _ -> },
    onNavigateToSettings: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current
    var showAddSymbolSheet by rememberSaveable { mutableStateOf(false) }
    var customCode by rememberSaveable { mutableStateOf("") }
    var customName by rememberSaveable { mutableStateOf("") }

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
            // [2] Compact 48.dp Header: Left = Watchlist Title, Right = '+' Button
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.nav_watchlist),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    IconButton(
                        onClick = { showAddSymbolSheet = true },
                        modifier = Modifier
                            .size(40.dp)
                            .testTag("watchlist_add_symbol_button")
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Add,
                            contentDescription = stringResource(R.string.settings_action_add_symbol),
                            tint = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }

            HorizontalDivider(
                thickness = 1.dp,
                color = financialPalette.cardBorder
            )

            // [3] Vertical-Only Symbol List with Pull-to-Refresh and Swipe-to-Remove
            PullToRefreshBox(
                isRefreshing = isSyncingAll,
                onRefresh = onSyncAllNow,
                modifier = Modifier.fillMaxSize()
            ) {
                if (watchlistSymbols.isEmpty()) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            text = stringResource(R.string.watchlist_empty_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Spacer(modifier = Modifier.height(8.dp))
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
                        contentPadding = PaddingValues(bottom = 16.dp)
                    ) {
                        items(
                            items = watchlistSymbols,
                            key = { it.symbolCode }
                        ) { symbol ->
                            val dismissState = rememberSwipeToDismissBoxState(
                                confirmValueChange = { value ->
                                    if (value == SwipeToDismissBoxValue.EndToStart) {
                                        onToggleSymbolInWatchlist(symbol.symbolCode, false)
                                        true
                                    } else {
                                        false
                                    }
                                }
                            )
                            SwipeToDismissBox(
                                state = dismissState,
                                enableDismissFromStartToEnd = false,
                                backgroundContent = {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .background(financialPalette.bearCandle.copy(alpha = 0.24f))
                                            .padding(horizontal = 16.dp),
                                        contentAlignment = Alignment.CenterEnd
                                    ) {
                                        Icon(
                                            imageVector = Icons.Outlined.DeleteOutline,
                                            contentDescription = stringResource(R.string.action_delete_symbol),
                                            tint = financialPalette.bearCandle
                                        )
                                    }
                                }
                            ) {
                                WatchlistRowCard(
                                    symbol = symbol,
                                    onOpenChartClick = { onOpenSymbolInChartTab(symbol) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // '+' BottomSheet to Toggle Catalog Symbols or Add New Symbol to Watchlist
    if (showAddSymbolSheet) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { showAddSymbolSheet = false },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = stringResource(R.string.settings_action_add_symbol),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )

                // Existing catalog symbols toggle list
                for (sym in allSymbols) {
                    val displayName = sym.customTitle
                        ?: sym.titleResId?.let { stringResource(it) }
                        ?: sym.symbolCode
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onToggleSymbolInWatchlist(sym.symbolCode, !sym.inWatchlist) }
                            .padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = sym.symbolCode,
                                style = MaterialTheme.typography.bodyLarge,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = displayName,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Switch(
                            checked = sym.inWatchlist,
                            onCheckedChange = { enabled ->
                                onToggleSymbolInWatchlist(sym.symbolCode, enabled)
                            }
                        )
                    }
                    HorizontalDivider(thickness = 1.dp, color = financialPalette.cardBorder)
                }

                // Quick Custom Symbol Form
                OutlinedTextField(
                    value = customCode,
                    onValueChange = { customCode = it.uppercase() },
                    label = { Text(stringResource(R.string.settings_dialog_symbol_code)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = customName,
                    onValueChange = { customName = it },
                    label = { Text(stringResource(R.string.settings_dialog_symbol_name)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedButton(
                    onClick = {
                        if (customCode.isNotBlank()) {
                            onAddCustomSymbol(customCode.trim(), customName.trim(), 2, ProviderId.TVDATAFEED)
                            customCode = ""
                            customName = ""
                            showAddSymbolSheet = false
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(CircleShape)
                ) {
                    Text(text = stringResource(R.string.action_save))
                }
                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}
