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
import es.manico.chartintelligence.ui.components.AssetSymbolBadge
import es.manico.chartintelligence.ui.components.WatchlistRowCard
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.data.model.ChartPreferences
import java.math.BigDecimal

/**
 * Mandatory Watchlist Screen Structure:
 * [1] Safe Area / Status Bar Inset (handled by parent Scaffold)
 * [2] Compact Header (48.dp): Left = Watchlist Title, Right = '+' Button to add symbols to Watchlist
 * [3] Search Bar + Category Filter Chips (All | Metals | Energy | FX)
 * [4] Symbol List: Vertical-only LazyColumn with Pull-to-Refresh and Swipe-to-Remove
 * [5] Bottom Navigation Tabs (Watchlist active)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchlistScreen(
    watchlistSymbols: List<SymbolConfig>,
    allSymbols: List<SymbolConfig> = watchlistSymbols,
    isSyncingAll: Boolean,
    statusBannerResId: Int?,
    preferences: ChartPreferences = ChartPreferences(),
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
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var selectedCategory by rememberSaveable { mutableStateOf("ALL") }
    var overviewSymbolCode by rememberSaveable { mutableStateOf<String?>(null) }

    val filteredWatchlist = watchlistSymbols.filter { sym ->
        val matchesCategory = when (selectedCategory) {
            "METALS" -> sym.symbolCode in listOf("XAUUSD", "XAGUSD") || sym.symbolCode.contains("XAU") || sym.symbolCode.contains("XAG")
            "ENERGY" -> sym.symbolCode in listOf("SPOTBRENT", "BRENT_FUTURES") || sym.symbolCode.contains("BRENT") || sym.symbolCode.contains("OIL")
            "FX" -> sym.symbolCode in listOf("EURUSD") || sym.symbolCode.contains("EUR") || sym.symbolCode.contains("GBP")
            else -> true
        }
        val q = searchQuery.trim().lowercase()
        val matchesQuery = q.isEmpty() ||
            sym.symbolCode.lowercase().contains(q) ||
            (sym.customTitle?.lowercase()?.contains(q) == true)
        matchesCategory && matchesQuery
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

            // Watchlist Search Input Bar (100% Parity with Web Watchlist Search)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(horizontal = 16.dp, vertical = 4.dp)
            ) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = {
                        Text(
                            text = stringResource(R.string.watchlist_search_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("watchlist_search_input")
                )
            }

            // Category Filter Chips Row (All | Metals | Energy | FX)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val categories = listOf(
                    "ALL" to stringResource(R.string.watchlist_filter_all),
                    "METALS" to stringResource(R.string.watchlist_filter_metals),
                    "ENERGY" to stringResource(R.string.watchlist_filter_energy),
                    "FX" to stringResource(R.string.watchlist_filter_fx)
                )
                for ((catId, catLabel) in categories) {
                    val isSelected = selectedCategory == catId
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(14.dp))
                            .background(
                                if (isSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                                else MaterialTheme.colorScheme.background
                            )
                            .border(
                                1.dp,
                                if (isSelected) MaterialTheme.colorScheme.primary else financialPalette.cardBorder,
                                RoundedCornerShape(14.dp)
                            )
                            .clickable { selectedCategory = catId }
                            .padding(horizontal = 12.dp, vertical = 4.dp)
                            .testTag("watchlist_cat_${catId.lowercase()}")
                    ) {
                        Text(
                            text = catLabel,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                            color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
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
                if (filteredWatchlist.isEmpty()) {
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
                            items = filteredWatchlist,
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
                                    hideLogos = preferences.hideWatchlistLogos,
                                    onOpenOverviewClick = if (preferences.showSymbolScreen) {
                                        { overviewSymbolCode = symbol.symbolCode }
                                    } else null,
                                    onOpenChartClick = { onOpenSymbolInChartTab(symbol) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // TradingView Symbol Overview BottomSheet (Screenshot 3: Key data points + Seasonals + [⛶])
    val overviewSymbol = allSymbols.firstOrNull { it.symbolCode == overviewSymbolCode }
    if (overviewSymbol != null) {
        val overviewSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { overviewSymbolCode = null },
            sheetState = overviewSheetState,
            containerColor = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface
        ) {
            val lastClose = overviewSymbol.lastClose ?: BigDecimal("100.00")
            val prevClose = overviewSymbol.prevClose ?: lastClose
            val isBull = lastClose >= prevClose
            val accentColor = if (isBull) preferences.bullCandleColor else preferences.bearCandleColor
            val diffStr = PriceFormatterAlgorithm.formatSignedPriceDiff(prevClose, lastClose, overviewSymbol.decimals)
            val pctStr = PriceFormatterAlgorithm.formatSignedPercentChange(prevClose, lastClose)
            val lowEst = lastClose.multiply(BigDecimal("0.992"))
            val highEst = lastClose.multiply(BigDecimal("1.008"))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .testTag("symbol_overview_sheet"),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            AssetSymbolBadge(
                                symbolCode = overviewSymbol.symbolCode,
                                sizeDp = 38.dp
                            )
                            Column {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Text(
                                        text = PriceFormatterAlgorithm.formatPrice(lastClose, overviewSymbol.decimals),
                                        style = MaterialTheme.typography.headlineSmall,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        text = "$diffStr ($pctStr)",
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        fontWeight = FontWeight.Bold,
                                        color = accentColor
                                    )
                                }
                                Text(
                                    text = "${overviewSymbol.symbolCode} • ${overviewSymbol.activeProvider.badgeLabel}",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }

                        Button(
                            onClick = {
                                overviewSymbolCode = null
                                onOpenSymbolInChartTab(overviewSymbol)
                            },
                            modifier = Modifier.testTag("symbol_overview_open_full_chart_button")
                        ) {
                            Text("⛶ ${stringResource(R.string.symbol_overview_open_chart)}")
                        }
                    }
                }

                // Key data points Card (TradingView Screenshot 3)
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                    border = BorderStroke(1.dp, financialPalette.cardBorder)
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.symbol_overview_key_data),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold
                        )
                        OverviewDataRow(
                            label = stringResource(R.string.symbol_overview_volume),
                            value = "${overviewSymbol.storedCandleCount} bars"
                        )
                        OverviewDataRow(
                            label = stringResource(R.string.symbol_overview_prev_close),
                            value = "${PriceFormatterAlgorithm.formatPrice(prevClose, overviewSymbol.decimals)} USD"
                        )
                        OverviewDataRow(
                            label = stringResource(R.string.symbol_overview_open),
                            value = "${PriceFormatterAlgorithm.formatPrice(prevClose, overviewSymbol.decimals)} USD"
                        )
                        OverviewDataRow(
                            label = stringResource(R.string.symbol_overview_days_range),
                            value = "${PriceFormatterAlgorithm.formatPrice(lowEst, overviewSymbol.decimals)} — ${PriceFormatterAlgorithm.formatPrice(highEst, overviewSymbol.decimals)} USD"
                        )
                    }
                }

                // Seasonals Card (2026 / 2025 / 2024 Multi-Line Chart — Screenshot 3)
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                    border = BorderStroke(1.dp, financialPalette.cardBorder)
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.symbol_overview_seasonals),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Canvas(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(100.dp)
                        ) {
                            val w = size.width
                            val h = size.height
                            val pts2026 = listOf(0.75f, 0.68f, 0.35f, 0.58f, 0.25f, 0.48f, 0.22f, 0.38f)
                            val pts2025 = listOf(0.82f, 0.78f, 0.72f, 0.80f, 0.68f, 0.74f, 0.64f, 0.60f)
                            val pts2024 = listOf(0.88f, 0.84f, 0.79f, 0.85f, 0.80f, 0.86f, 0.77f, 0.81f)

                            fun drawSeasonalLine(pts: List<Float>, color: Color, strokeW: Float) {
                                val path = Path()
                                pts.forEachIndexed { idx, r ->
                                    val x = w * (idx.toFloat() / (pts.size - 1).toFloat())
                                    val y = h * r
                                    if (idx == 0) path.moveTo(x, y) else path.lineTo(x, y)
                                }
                                drawPath(path = path, color = color, style = Stroke(width = strokeW))
                            }
                            drawSeasonalLine(pts2024, Color(0xFFF59E0B), 3f)
                            drawSeasonalLine(pts2025, Color(0xFF26A69A), 3f)
                            drawSeasonalLine(pts2026, Color(0xFF2962FF), 5f)
                            drawCircle(
                                color = Color(0xFF2962FF),
                                radius = 7f,
                                center = Offset(w, h * pts2026.last())
                            )
                        }
                        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceEvenly
                            ) {
                                Text("● 2026", color = Color(0xFF2962FF), fontFamily = JetBrainsMonoFontFamily, style = MaterialTheme.typography.labelSmall)
                                Text("● 2025", color = Color(0xFF26A69A), fontFamily = JetBrainsMonoFontFamily, style = MaterialTheme.typography.labelSmall)
                                Text("● 2024", color = Color(0xFFF59E0B), fontFamily = JetBrainsMonoFontFamily, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
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

                // Existing catalog symbols toggle list with AssetSymbolBadge icons
                for (sym in allSymbols) {
                    val displayName = sym.customTitle
                        ?: sym.titleResId?.let { stringResource(it) }
                        ?: sym.symbolCode
                    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onToggleSymbolInWatchlist(sym.symbolCode, !sym.inWatchlist) }
                                .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                modifier = Modifier.weight(1f),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                AssetSymbolBadge(
                                    symbolCode = sym.symbolCode,
                                    sizeDp = 32.dp
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "${sym.symbolCode} · ${sym.activeProvider.badgeLabel}",
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
                            }
                            Switch(
                                checked = sym.inWatchlist,
                                onCheckedChange = { enabled ->
                                    onToggleSymbolInWatchlist(sym.symbolCode, enabled)
                                }
                            )
                        }
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

@Composable
private fun OverviewDataRow(label: String, value: String) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(
            modifier = Modifier.fillMaxWidth(),
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
                style = MaterialTheme.typography.bodySmall,
                fontFamily = JetBrainsMonoFontFamily,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}
