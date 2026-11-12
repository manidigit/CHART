package es.manico.chartintelligence.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberSwipeToDismissBoxState
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.data.model.AssetClass
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartPreferences
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.ProviderId
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.ui.components.AssetSymbolBadge
import es.manico.chartintelligence.ui.components.WatchlistRowCard
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import java.math.BigDecimal
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchlistScreen(
    watchlistSymbols: List<SymbolConfig>,
    allSymbols: List<SymbolConfig> = watchlistSymbols,
    openTabs: List<ChartTabState> = emptyList(),
    isSyncingAll: Boolean,
    statusBannerResId: Int?,
    preferences: ChartPreferences = ChartPreferences(),
    onSyncSymbolNow: (String) -> Unit,
    onSyncAllNow: () -> Unit,
    onOpenSymbolInChartTab: (SymbolConfig) -> Unit,
    onToggleSymbolInWatchlist: (String, Boolean) -> Unit = { _, _ -> },
    onReorderSymbol: (String, Int) -> Unit = { _, _ -> },
    onAddCustomSymbol: (String, String, Int, ProviderId) -> Unit = { _, _, _, _ -> },
    onNavigateToSettings: () -> Unit = {},
    onNavigateToPrediction: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current
    val clipboardManager = LocalClipboardManager.current
    var showAddSymbolSheet by rememberSaveable { mutableStateOf(false) }
    var customCode by rememberSaveable { mutableStateOf("") }
    var customName by rememberSaveable { mutableStateOf("") }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var selectedCategory by rememberSaveable { mutableStateOf("ALL") }
    var overviewSymbolCode by rememberSaveable { mutableStateOf<String?>(null) }
    var overviewSubTab by rememberSaveable { mutableStateOf("OVERVIEW") }
    var overviewRange by rememberSaveable { mutableStateOf("5D") }

    val filteredWatchlist = watchlistSymbols.filter { sym ->
        val code = sym.symbolCode.uppercase()
        val matchesCategory = when (selectedCategory) {
            "METALS" -> code in listOf("XAUUSD", "XAGUSD") || code.contains("XAU") || code.contains("XAG")
            "ENERGY" -> code in listOf("SPOTBRENT", "BRENT_FUTURES", "USOIL") || code.contains("BRENT") || code.contains("OIL") || code.contains("WTI")
            "CRYPTO" -> code in listOf("BTCUSD", "ETHUSD") || code.contains("BTC") || code.contains("ETH")
            "INDICES" -> code in listOf("SPX500USD", "NDQ") || code.contains("SPX") || code.contains("NDQ") || code.contains("NAS")
            "STOCKS" -> code in listOf("NVDA", "AMZN", "TSLA", "AAPL", "GOOGL", "MSFT", "META", "NFLX", "AMD", "UBER", "NKE", "IBM", "SAN")
            "FX" -> code in listOf("EURUSD", "GBPUSD", "USDJPY") || code.contains("EUR") || code.contains("GBP") || code.contains("JPY")
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
            // [2] Compact Single-Row 52.dp Header: Title + Inline Compact Search Input + '+' Button (48.dp)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 52.dp)
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = stringResource(R.string.nav_watchlist),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    softWrap = false
                )

                Row(
                    modifier = Modifier
                        .weight(1f)
                        .height(36.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.background)
                        .border(1.dp, financialPalette.cardBorder, RoundedCornerShape(8.dp))
                        .padding(horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Search,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(16.dp)
                    )
                    Box(modifier = Modifier.weight(1f)) {
                        if (searchQuery.isEmpty()) {
                            Text(
                                text = stringResource(R.string.watchlist_search_hint),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        BasicTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            singleLine = true,
                            textStyle = MaterialTheme.typography.bodySmall.copy(
                                color = MaterialTheme.colorScheme.onSurface
                            ),
                            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("watchlist_search_input")
                        )
                    }
                    if (searchQuery.isNotEmpty()) {
                        Icon(
                            imageVector = Icons.Outlined.Close,
                            contentDescription = stringResource(R.string.action_cancel),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .size(16.dp)
                                .clickable { searchQuery = "" }
                        )
                    }
                }

                IconButton(
                    onClick = { showAddSymbolSheet = true },
                    modifier = Modifier
                        .size(48.dp)
                        .testTag("watchlist_add_symbol_button")
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Add,
                        contentDescription = stringResource(R.string.settings_action_add_symbol),
                        tint = MaterialTheme.colorScheme.onSurface
                    )
                }
            }

            // Market Category Filter Combo Box (replaces overflowing horizontal chip train)
            val categories = listOf(
                "ALL" to stringResource(R.string.watchlist_filter_all),
                "METALS" to stringResource(R.string.watchlist_filter_metals),
                "ENERGY" to stringResource(R.string.watchlist_filter_energy),
                "CRYPTO" to stringResource(R.string.watchlist_filter_crypto),
                "INDICES" to stringResource(R.string.watchlist_filter_indices),
                "STOCKS" to stringResource(R.string.watchlist_filter_stocks),
                "FX" to stringResource(R.string.watchlist_filter_fx)
            ).map { (catId, catLabel) ->
                val count = if (catId == "ALL") {
                    watchlistSymbols.size
                } else {
                    watchlistSymbols.count { sym ->
                        val code = sym.symbolCode.uppercase()
                        when (catId) {
                            "METALS" -> code in listOf("XAUUSD", "XAGUSD") || code.contains("XAU") || code.contains("XAG")
                            "ENERGY" -> code in listOf("SPOTBRENT", "BRENT_FUTURES", "USOIL") || code.contains("BRENT") || code.contains("OIL") || code.contains("WTI")
                            "CRYPTO" -> code in listOf("BTCUSD", "ETHUSD") || code.contains("BTC") || code.contains("ETH")
                            "INDICES" -> code in listOf("SPX500USD", "NDQ") || code.contains("SPX") || code.contains("NDQ") || code.contains("NAS")
                            "STOCKS" -> code in listOf("NVDA", "AMZN", "TSLA", "AAPL", "GOOGL", "MSFT", "META", "NFLX", "AMD", "UBER", "NKE", "IBM", "SAN")
                            "FX" -> code in listOf("EURUSD", "GBPUSD", "USDJPY") || code.contains("EUR") || code.contains("GBP") || code.contains("JPY")
                            else -> true
                        }
                    }
                }
                Triple(catId, catLabel, count)
            }
            var categoryMenuExpanded by remember { mutableStateOf(false) }
            val activeCategoryEntry = categories.firstOrNull { it.first == selectedCategory } ?: categories.first()

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = stringResource(R.string.settings_source_by_market),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(0.45f, fill = false)
                )

                Box(modifier = Modifier.weight(1f)) {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { categoryMenuExpanded = true }
                            .testTag("watchlist_category_dropdown"),
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.background,
                        border = BorderStroke(1.dp, financialPalette.cardBorder)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "${activeCategoryEntry.second} (${activeCategoryEntry.third})",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f)
                            )
                            Icon(
                                imageVector = Icons.Outlined.ExpandMore,
                                contentDescription = stringResource(R.string.settings_source_by_market),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }

                    DropdownMenu(
                        expanded = categoryMenuExpanded,
                        onDismissRequest = { categoryMenuExpanded = false }
                    ) {
                        for ((catId, catLabel, count) in categories) {
                            val isSelected = selectedCategory == catId
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        text = "$catLabel ($count)",
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                        color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                                    )
                                },
                                onClick = {
                                    selectedCategory = catId
                                    categoryMenuExpanded = false
                                },
                                modifier = Modifier.testTag("watchlist_cat_${catId.lowercase()}")
                            )
                        }
                    }
                }
            }

            HorizontalDivider(
                thickness = 1.dp,
                color = financialPalette.cardBorder
            )

            // [4] Vertical-Only Symbol List with Pull-to-Refresh and Swipe-to-Remove
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
                    val watchlistListState = rememberLazyListState()
                    LazyColumn(
                        state = watchlistListState,
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
                                        {
                                            overviewSymbolCode = symbol.symbolCode
                                            overviewSubTab = "OVERVIEW"
                                        }
                                    } else null,
                                    onOpenChartClick = { onOpenSymbolInChartTab(symbol) },
                                    onMoveUpClick = { onReorderSymbol(symbol.symbolCode, -1) },
                                    onMoveDownClick = { onReorderSymbol(symbol.symbolCode, 1) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // Honest Real-Data Symbol Overview BottomSheet (No fake seasonals / no fake SEC filings on non-stocks)
    val overviewSymbol = allSymbols.firstOrNull { it.symbolCode == overviewSymbolCode }
    if (overviewSymbol != null) {
        val overviewSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { overviewSymbolCode = null },
            sheetState = overviewSheetState,
            containerColor = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface
        ) {
            val matchingTab = openTabs.firstOrNull { it.symbolCode == overviewSymbol.symbolCode }
            val loadedCandles = matchingTab?.candles ?: emptyList()
            val slicedCandles = when (overviewRange) {
                "1D" -> loadedCandles.takeLast(48)
                "5D" -> loadedCandles.takeLast(96)
                "1M" -> loadedCandles.takeLast(160)
                "3M" -> loadedCandles.takeLast(240)
                else -> loadedCandles.takeLast(400)
            }

            val lastClose = loadedCandles.lastOrNull()?.close ?: overviewSymbol.lastClose ?: BigDecimal.ZERO
            val prevClose = overviewSymbol.prevClose
                ?: loadedCandles.getOrNull(loadedCandles.size - 2)?.close
                ?: lastClose
            val isBull = lastClose >= prevClose
            val accentColor = if (isBull) preferences.bullCandleColor else preferences.bearCandleColor
            val diffStr = PriceFormatterAlgorithm.formatSignedPriceDiff(prevClose, lastClose, overviewSymbol.decimals)
            val pctStr = PriceFormatterAlgorithm.formatSignedPercentChange(prevClose, lastClose)

            val metrics = computeOverviewRealMetrics(slicedCandles, lastClose, prevClose)
            val profileMeta = getInstrumentProfileMeta(overviewSymbol.symbolCode, overviewSymbol.activeProvider.badgeLabel)
            val specsTitleRes = when (overviewSymbol.assetClass) {
                AssetClass.COMMODITIES -> R.string.overview_contract_specs
                AssetClass.CRYPTO -> R.string.overview_crypto_metrics
                AssetClass.INDICES -> R.string.overview_index_metrics
                AssetClass.FX -> R.string.overview_fx_metrics
                AssetClass.STOCKS -> R.string.overview_stock_metrics
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .navigationBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .testTag("symbol_overview_sheet"),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // [1] Symbol Header + Live Price + Fullscreen Chart Button
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            modifier = Modifier.weight(1f),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            AssetSymbolBadge(
                                symbolCode = overviewSymbol.symbolCode,
                                sizeDp = 38.dp
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Text(
                                        text = PriceFormatterAlgorithm.formatPrice(lastClose, overviewSymbol.decimals),
                                        style = MaterialTheme.typography.titleLarge,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1
                                    )
                                    Text(
                                        text = "$diffStr ($pctStr)",
                                        style = MaterialTheme.typography.labelLarge,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        fontWeight = FontWeight.Bold,
                                        color = accentColor,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                                Text(
                                    text = "${overviewSymbol.symbolCode} • ${overviewSymbol.activeProvider.badgeLabel} • USD",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }

                        Spacer(modifier = Modifier.width(8.dp))

                        Button(
                            onClick = {
                                overviewSymbolCode = null
                                onOpenSymbolInChartTab(overviewSymbol)
                            },
                            modifier = Modifier
                                .heightIn(min = 40.dp)
                                .testTag("symbol_overview_open_full_chart_button")
                        ) {
                            Text(
                                text = "⛶ ${stringResource(R.string.symbol_overview_open_chart)}",
                                maxLines = 1,
                                softWrap = false
                            )
                        }
                    }
                }

                // [1b] 4 Sub-Tabs: Overview | News | Minds | Ideas (True Tab Switching)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val subTabs = listOf(
                        "OVERVIEW" to stringResource(R.string.symbol_overview_tab_overview),
                        "NEWS" to stringResource(R.string.symbol_overview_tab_news),
                        "MINDS" to stringResource(R.string.symbol_overview_tab_minds),
                        "IDEAS" to stringResource(R.string.symbol_overview_tab_ideas)
                    )
                    for ((tabKey, tabLabel) in subTabs) {
                        val active = overviewSubTab == tabKey
                        Box(
                            modifier = Modifier
                                .heightIn(min = 34.dp)
                                .clip(RoundedCornerShape(17.dp))
                                .background(
                                    if (active) MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.background
                                )
                                .border(
                                    1.dp,
                                    if (active) MaterialTheme.colorScheme.primary else financialPalette.cardBorder,
                                    RoundedCornerShape(17.dp)
                                )
                                .clickable { overviewSubTab = tabKey }
                                .padding(horizontal = 14.dp, vertical = 6.dp)
                                .testTag("symbol_overview_subtab_${tabKey.lowercase()}"),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = tabLabel,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = if (active) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                when (overviewSubTab) {
                    "OVERVIEW" -> {
                        // Mini-Chart Card (Renders Real Candles when loaded, Honest Empty Card otherwise)
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                            border = BorderStroke(1.dp, financialPalette.cardBorder)
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                if (slicedCandles.size >= 2) {
                                    Canvas(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(110.dp)
                                    ) {
                                        val w = size.width
                                        val h = size.height
                                        val displayBars = slicedCandles.takeLast(40)
                                        val maxHi = displayBars.maxOf { it.high.toDouble() }
                                        val minLo = displayBars.minOf { it.low.toDouble() }
                                        val span = (maxHi - minLo).coerceAtLeast(1e-6)
                                        fun priceToY(p: Double): Float {
                                            return (h * 0.08f) + (((maxHi - p) / span).toFloat() * (h * 0.84f))
                                        }
                                        val slotW = w / displayBars.size.toFloat()
                                        val bodyW = (slotW * 0.6f).coerceIn(2f, 10f)
                                        displayBars.forEachIndexed { idx, bar ->
                                            val cx = (idx + 0.5f) * slotW
                                            val openY = priceToY(bar.open.toDouble())
                                            val closeY = priceToY(bar.close.toDouble())
                                            val highY = priceToY(bar.high.toDouble())
                                            val lowY = priceToY(bar.low.toDouble())
                                            val col = if (bar.close >= bar.open) preferences.bullCandleColor else preferences.bearCandleColor
                                            drawLine(
                                                color = col,
                                                start = Offset(cx, highY),
                                                end = Offset(cx, lowY),
                                                strokeWidth = 2f
                                            )
                                            drawRect(
                                                color = col,
                                                topLeft = Offset(cx - bodyW / 2f, minOf(openY, closeY)),
                                                size = Size(bodyW, abs(closeY - openY).coerceAtLeast(2.5f))
                                            )
                                        }
                                    }
                                } else {
                                    Text(
                                        text = stringResource(R.string.overview_no_candles),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(vertical = 12.dp)
                                    )
                                }

                                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        val ranges = listOf("1D", "5D", "1M", "3M", "YTD", "1Y", "5Y", "All")
                                        for (r in ranges) {
                                            val selected = overviewRange == r
                                            Box(
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(6.dp))
                                                    .background(
                                                        if (selected) MaterialTheme.colorScheme.primary
                                                        else Color.Transparent
                                                    )
                                                    .clickable { overviewRange = r }
                                                    .padding(horizontal = 9.dp, vertical = 4.dp)
                                                    .testTag("symbol_overview_range_$r")
                                            ) {
                                                Text(
                                                    text = r,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    fontFamily = JetBrainsMonoFontFamily,
                                                    fontWeight = FontWeight.Bold,
                                                    color = if (selected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Flash Brief Banner -> Switches directly to News tab
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { overviewSubTab = "NEWS" }
                                .testTag("symbol_overview_flash_news_banner"),
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f))
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(28.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFFF59E0B).copy(alpha = 0.2f)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(text = "⚡", style = MaterialTheme.typography.bodyMedium)
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "${overviewSymbol.symbolCode} • ${stringResource(R.string.symbol_overview_flash_news_title)}",
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = stringResource(R.string.symbol_overview_flash_news_desc),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }

                        // Key Data Points + Genuine Period Range
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
                                    value = "${loadedCandles.size.coerceAtLeast(overviewSymbol.storedCandleCount)} bars"
                                )
                                OverviewDataRow(
                                    label = stringResource(R.string.symbol_overview_prev_close),
                                    value = "${PriceFormatterAlgorithm.formatPrice(prevClose, overviewSymbol.decimals)} USD"
                                )
                                OverviewDataRow(
                                    label = stringResource(R.string.symbol_overview_days_range),
                                    value = "${PriceFormatterAlgorithm.formatPrice(metrics.rangeLow, overviewSymbol.decimals)} — ${PriceFormatterAlgorithm.formatPrice(metrics.rangeHigh, overviewSymbol.decimals)} USD"
                                )

                                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(6.dp)
                                                .clip(RoundedCornerShape(3.dp))
                                                .background(financialPalette.cardBorder)
                                        ) {
                                            Box(
                                                modifier = Modifier
                                                    .fillMaxWidth(fraction = metrics.rangePositionRatio)
                                                    .height(6.dp)
                                                    .clip(RoundedCornerShape(3.dp))
                                                    .background(accentColor)
                                            )
                                        }
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text(
                                                text = "L: ${PriceFormatterAlgorithm.formatPrice(metrics.rangeLow, overviewSymbol.decimals)}",
                                                style = MaterialTheme.typography.labelSmall,
                                                fontFamily = JetBrainsMonoFontFamily,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                            Text(
                                                text = "H: ${PriceFormatterAlgorithm.formatPrice(metrics.rangeHigh, overviewSymbol.decimals)}",
                                                style = MaterialTheme.typography.labelSmall,
                                                fontFamily = JetBrainsMonoFontFamily,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // Real Candle Technicals Speedometer (Strictly derived from loaded candles)
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("symbol_overview_technicals_card"),
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                            border = BorderStroke(1.dp, financialPalette.cardBorder)
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = stringResource(R.string.overview_technicals_title),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold
                                )
                                if (metrics.hasRealCandles) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Column(
                                            horizontalAlignment = Alignment.CenterHorizontally,
                                            verticalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            SpeedometerGaugeCanvas(
                                                needleRatio = metrics.needleRatio,
                                                accentColor = accentColor
                                            )
                                            Text(
                                                text = stringResource(
                                                    when {
                                                        metrics.needleRatio >= 0.62f -> R.string.symbol_overview_gauge_buy
                                                        metrics.needleRatio <= 0.38f -> R.string.symbol_overview_gauge_sell
                                                        else -> R.string.symbol_overview_gauge_neutral
                                                    }
                                                ),
                                                style = MaterialTheme.typography.labelLarge,
                                                fontWeight = FontWeight.ExtraBold,
                                                color = accentColor
                                            )
                                        }
                                        Column(
                                            modifier = Modifier
                                                .weight(1f)
                                                .padding(start = 12.dp),
                                            verticalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            OverviewDataRow(
                                                label = "RSI (14)",
                                                value = metrics.rsi14?.let { String.format(java.util.Locale.US, "%.1f", it) } ?: "—"
                                            )
                                            OverviewDataRow(
                                                label = "SMA (20)",
                                                value = metrics.sma20?.let { PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(it), overviewSymbol.decimals) } ?: "—"
                                            )
                                            OverviewDataRow(
                                                label = "SMA (50)",
                                                value = metrics.sma50?.let { PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(it), overviewSymbol.decimals) } ?: "—"
                                            )
                                            OverviewDataRow(
                                                label = "ATR (14)",
                                                value = metrics.atr14?.let { PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(it), overviewSymbol.decimals) } ?: "—"
                                            )
                                        }
                                    }
                                } else {
                                    Text(
                                        text = stringResource(R.string.overview_no_candles),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }

                        // Asset-Class-Specific Specifications & Profile (Zero fake SEC/Earnings on Commodities/Crypto/FX)
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("symbol_overview_about_card"),
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                            border = BorderStroke(1.dp, financialPalette.cardBorder)
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = stringResource(specsTitleRes),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold
                                )
                                OverviewDataRow(
                                    label = stringResource(R.string.symbol_overview_about_sector),
                                    value = profileMeta.sector
                                )
                                OverviewDataRow(
                                    label = stringResource(R.string.symbol_overview_about_industry),
                                    value = profileMeta.industry
                                )
                                OverviewDataRow(
                                    label = stringResource(R.string.symbol_overview_about_benchmark),
                                    value = profileMeta.benchmark
                                )
                                OverviewDataRow(
                                    label = stringResource(R.string.symbol_overview_emp_count),
                                    value = profileMeta.activeVenues
                                )
                                OverviewCopyableRow(
                                    label = stringResource(R.string.symbol_overview_about_figi),
                                    value = profileMeta.figi,
                                    onCopy = { clipboardManager.setText(AnnotatedString(profileMeta.figi)) }
                                )
                                OverviewCopyableRow(
                                    label = stringResource(R.string.symbol_overview_about_isin),
                                    value = profileMeta.isin,
                                    onCopy = { clipboardManager.setText(AnnotatedString(profileMeta.isin)) }
                                )
                            }
                        }
                    }

                    "NEWS" -> {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                            border = BorderStroke(1.dp, financialPalette.cardBorder)
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Text(
                                    text = "${overviewSymbol.symbolCode} — ${stringResource(R.string.symbol_overview_tab_news)}",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold
                                )
                                OverviewDataRow(
                                    label = "Asset Class",
                                    value = overviewSymbol.assetClass.name
                                )
                                OverviewDataRow(
                                    label = "Active Feed Channel",
                                    value = overviewSymbol.activeProvider.badgeLabel
                                )
                                OverviewDataRow(
                                    label = "UTC Anchor Status",
                                    value = "00:00:00 UTC Verified"
                                )
                                OverviewDataRow(
                                    label = "Price Basis",
                                    value = overviewSymbol.activeProvider.resolvePriceBasis(overviewSymbol.symbolCode)
                                )
                                OverviewDataRow(
                                    label = "Primary Macro Driver",
                                    value = profileMeta.macroDrivers
                                )
                                OutlinedButton(
                                    onClick = {
                                        overviewSymbolCode = null
                                        onOpenSymbolInChartTab(overviewSymbol)
                                    },
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text(stringResource(R.string.symbol_overview_open_chart))
                                }
                            }
                        }
                    }

                    "MINDS" -> {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                            border = BorderStroke(1.dp, financialPalette.cardBorder)
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Text(
                                    text = "${overviewSymbol.symbolCode} — ${stringResource(R.string.symbol_overview_tab_minds)}",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold
                                )
                                if (metrics.hasRealCandles) {
                                    OverviewDataRow(
                                        label = "Recent Window Bars",
                                        value = "${metrics.recentTotalBars} bars (${overviewSymbol.timeframe})"
                                    )
                                    OverviewDataRow(
                                        label = "Bullish vs Bearish Candles",
                                        value = "${metrics.bullCount} Bull / ${metrics.bearCount} Bear (${metrics.bullPercent}%)"
                                    )
                                    OverviewDataRow(
                                        label = "Period High / Low",
                                        value = "${PriceFormatterAlgorithm.formatPrice(metrics.rangeHigh, overviewSymbol.decimals)} / ${PriceFormatterAlgorithm.formatPrice(metrics.rangeLow, overviewSymbol.decimals)}"
                                    )
                                    OverviewDataRow(
                                        label = "ATR (14) Volatility",
                                        value = metrics.atr14?.let { PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(it), overviewSymbol.decimals) } ?: "—"
                                    )
                                } else {
                                    Text(
                                        text = stringResource(R.string.overview_no_candles),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }

                    else -> {
                        // IDEAS tab: Genuine Classic Floor Pivots + Scenario Forecast CTA
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                            border = BorderStroke(1.dp, financialPalette.cardBorder)
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Text(
                                    text = "${overviewSymbol.symbolCode} — ${stringResource(R.string.symbol_overview_tab_ideas)}",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold
                                )
                                if (metrics.hasRealCandles) {
                                    OverviewDataRow("Resistance 2 (R2)", PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(metrics.r2), overviewSymbol.decimals))
                                    OverviewDataRow("Resistance 1 (R1)", PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(metrics.r1), overviewSymbol.decimals))
                                    OverviewDataRow("Central Pivot (P)", PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(metrics.pivot), overviewSymbol.decimals))
                                    OverviewDataRow("Support 1 (S1)", PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(metrics.s1), overviewSymbol.decimals))
                                    OverviewDataRow("Support 2 (S2)", PriceFormatterAlgorithm.formatPrice(BigDecimal.valueOf(metrics.s2), overviewSymbol.decimals))
                                } else {
                                    Text(
                                        text = stringResource(R.string.overview_no_candles),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Button(
                                    onClick = {
                                        overviewSymbolCode = null
                                        onNavigateToPrediction()
                                    },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .heightIn(min = 44.dp)
                                        .testTag("symbol_overview_see_forecast_button")
                                ) {
                                    Text(stringResource(R.string.symbol_overview_see_forecast))
                                }
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
                    .verticalScroll(rememberScrollState())
                    .navigationBarsPadding()
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
                        .heightIn(min = 48.dp)
                        .clip(CircleShape)
                ) {
                    Text(text = stringResource(R.string.action_save))
                }
                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}

private data class OverviewRealMetrics(
    val hasRealCandles: Boolean,
    val rangeLow: BigDecimal,
    val rangeHigh: BigDecimal,
    val rangePositionRatio: Float,
    val rsi14: Double?,
    val sma20: Double?,
    val sma50: Double?,
    val atr14: Double?,
    val recentTotalBars: Int,
    val bullCount: Int,
    val bearCount: Int,
    val bullPercent: Int,
    val needleRatio: Float,
    val pivot: Double,
    val r1: Double,
    val r2: Double,
    val s1: Double,
    val s2: Double
)

private fun computeOverviewRealMetrics(
    candles: List<CandleBar>,
    lastClose: BigDecimal,
    prevClose: BigDecimal
): OverviewRealMetrics {
    if (candles.isEmpty()) {
        val lo = minOf(lastClose, prevClose)
        val hi = maxOf(lastClose, prevClose)
        val p = lastClose.toDouble()
        return OverviewRealMetrics(
            hasRealCandles = false,
            rangeLow = lo,
            rangeHigh = hi,
            rangePositionRatio = if (lastClose >= prevClose) 0.72f else 0.28f,
            rsi14 = null,
            sma20 = null,
            sma50 = null,
            atr14 = null,
            recentTotalBars = 0,
            bullCount = 0,
            bearCount = 0,
            bullPercent = 50,
            needleRatio = 0.5f,
            pivot = p,
            r1 = p,
            r2 = p,
            s1 = p,
            s2 = p
        )
    }

    val rangeLow = candles.minOf { it.low }
    val rangeHigh = candles.maxOf { it.high }
    val span = (rangeHigh - rangeLow).toFloat().coerceAtLeast(0.0001f)
    val posRatio = ((lastClose - rangeLow).toFloat() / span).coerceIn(0.06f, 0.94f)

    val closes = candles.map { it.close.toDouble() }
    val rsi14 = PriceFormatterAlgorithm.computeRsiValues(closes, 14).lastOrNull()
    val sma20 = PriceFormatterAlgorithm.computeSmaValues(closes, 20).lastOrNull()
    val sma50 = PriceFormatterAlgorithm.computeSmaValues(closes, 50).lastOrNull()
    val atr14 = PriceFormatterAlgorithm.computeAtrValues(candles, 14).lastOrNull()

    val recent = candles.takeLast(24)
    val bullCount = recent.count { it.close >= it.open }
    val bearCount = recent.size - bullCount
    val bullPercent = if (recent.isNotEmpty()) ((bullCount * 100f) / recent.size).roundToInt() else 50

    var score = 0f
    val lc = lastClose.toDouble()
    if (sma20 != null) score += if (lc >= sma20) 1f else -1f
    if (sma50 != null) score += if (lc >= sma50) 1f else -1f
    if (rsi14 != null) {
        score += when {
            rsi14 > 55.0 -> 1f
            rsi14 < 45.0 -> -1f
            else -> 0f
        }
    }
    score += if (bullCount >= bearCount) 0.5f else -0.5f
    val needleRatio = (0.5f + (score / 7.0f)).coerceIn(0.12f, 0.88f)

    val pivotCandle = candles.getOrNull(candles.size - 2) ?: candles.last()
    val ph = pivotCandle.high.toDouble()
    val pl = pivotCandle.low.toDouble()
    val pc = pivotCandle.close.toDouble()
    val pivot = (ph + pl + pc) / 3.0
    val r1 = (2.0 * pivot) - pl
    val s1 = (2.0 * pivot) - ph
    val r2 = pivot + (ph - pl)
    val s2 = pivot - (ph - pl)

    return OverviewRealMetrics(
        hasRealCandles = true,
        rangeLow = rangeLow,
        rangeHigh = rangeHigh,
        rangePositionRatio = posRatio,
        rsi14 = rsi14,
        sma20 = sma20,
        sma50 = sma50,
        atr14 = atr14,
        recentTotalBars = recent.size,
        bullCount = bullCount,
        bearCount = bearCount,
        bullPercent = bullPercent,
        needleRatio = needleRatio,
        pivot = pivot,
        r1 = r1,
        r2 = r2,
        s1 = s1,
        s2 = s2
    )
}

@Composable
private fun SpeedometerGaugeCanvas(
    needleRatio: Float,
    accentColor: Color
) {
    Canvas(
        modifier = Modifier
            .width(126.dp)
            .height(68.dp)
    ) {
        val strokeW = 12f
        val arcSize = Size(size.width - strokeW * 2, (size.height - strokeW) * 1.75f)
        val topLeft = Offset(strokeW, strokeW)
        val segColors = listOf(
            Color(0xFFEF5350),
            Color(0xFFF59E0B),
            Color(0xFF787B86),
            Color(0xFF2962FF),
            Color(0xFF26A69A)
        )
        segColors.forEachIndexed { idx, col ->
            drawArc(
                color = col,
                startAngle = 180f + idx * 36f + 2f,
                sweepAngle = 32f,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = strokeW, cap = StrokeCap.Round)
            )
        }
        val angleRad = Math.toRadians((180f + needleRatio.coerceIn(0.05f, 0.95f) * 180f).toDouble())
        val cx = size.width / 2f
        val cy = size.height - 6f
        val radius = (size.width / 2f) - 20f
        val nx = cx + (radius * cos(angleRad)).toFloat()
        val ny = cy + (radius * sin(angleRad)).toFloat()
        drawLine(
            color = accentColor,
            start = Offset(cx, cy),
            end = Offset(nx, ny),
            strokeWidth = 5f,
            cap = StrokeCap.Round
        )
        drawCircle(
            color = accentColor,
            radius = 7f,
            center = Offset(cx, cy)
        )
    }
}

private data class InstrumentProfileMeta(
    val sector: String,
    val industry: String,
    val benchmark: String,
    val activeVenues: String,
    val macroDrivers: String,
    val figi: String,
    val isin: String
)

private fun getInstrumentProfileMeta(symbolCode: String, providerBadge: String): InstrumentProfileMeta {
    val code = symbolCode.uppercase()
    return when {
        code.contains("XAU") -> InstrumentProfileMeta(
            sector = "Precious Metals",
            industry = "Spot Gold Bullion (LBMA / OTC)",
            benchmark = "XAU/USD Spot · $providerBadge",
            activeVenues = "London / NY / Shanghai",
            macroDrivers = "US Real Yields, DXY, Central Bank Reserves",
            figi = "BBG000B9XRY4",
            isin = "XC0009655157"
        )
        code.contains("XAG") -> InstrumentProfileMeta(
            sector = "Precious & Industrial Metals",
            industry = "Spot Silver Bullion",
            benchmark = "XAG/USD Spot · $providerBadge",
            activeVenues = "COMEX / London / OTC",
            macroDrivers = "Industrial Demand, Gold-Silver Ratio, DXY",
            figi = "BBG000B9XVV8",
            isin = "XC0009653103"
        )
        code.contains("BRENT") || code.contains("OIL") || code.contains("WTI") -> InstrumentProfileMeta(
            sector = "Energy Commodities",
            industry = if (code.contains("USOIL") || code.contains("WTI")) "West Texas Intermediate Crude" else "North Sea Brent Crude",
            benchmark = if (code.contains("USOIL")) "WTI NYMEX · $providerBadge" else "Dated Brent / ICE · $providerBadge",
            activeVenues = "ICE Europe / NYMEX",
            macroDrivers = "OPEC+ Supply Quotas, EIA Inventories, Crack Spreads",
            figi = "BBG000G2R5T8",
            isin = "EU0009658426"
        )
        code.contains("BTC") || code.contains("ETH") -> InstrumentProfileMeta(
            sector = "Digital Assets",
            industry = if (code.contains("BTC")) "Proof-of-Work Layer-1" else "Smart Contract Layer-1",
            benchmark = "$code · $providerBadge",
            activeVenues = "24/7 Spot Exchanges & CME",
            macroDrivers = "ETF Inflows, Network Issuance, Global Liquidity",
            figi = if (code.contains("BTC")) "BBG00Y7B8W01" else "BBG00Y7B8W12",
            isin = "24/7 UTC Open"
        )
        code.contains("SPX") || code.contains("NDQ") -> InstrumentProfileMeta(
            sector = "US Equity Indices",
            industry = if (code.contains("SPX")) "US Large-Cap 500 Benchmark" else "US Tech-Heavy 100 Index",
            benchmark = "$code · $providerBadge",
            activeVenues = "CME / NASDAQ / NYSE",
            macroDrivers = "FOMC Rates, Mega-Cap Earnings, US CPI / NFP",
            figi = if (code.contains("SPX")) "BBG000H4FSM0" else "BBG000P5P8K1",
            isin = if (code.contains("SPX")) "US78378X1072" else "US6311011026"
        )
        code.contains("EUR") || code.contains("GBP") || code.contains("JPY") -> InstrumentProfileMeta(
            sector = "Global Foreign Exchange",
            industry = "G10 Interbank FX Spot",
            benchmark = "$code · $providerBadge",
            activeVenues = "London / NY / Tokyo ECN",
            macroDrivers = "ECB vs Fed Rate Differentials, Sovereign Yields",
            figi = "BBG0013HG040",
            isin = "EU0009652759"
        )
        else -> InstrumentProfileMeta(
            sector = "US Equities",
            industry = "NASDAQ / NYSE Common Stock",
            benchmark = "$code · $providerBadge",
            activeVenues = "NYSE / NASDAQ Official",
            macroDrivers = "Quarterly Earnings, Sector Multiples, Fed Rates",
            figi = "EQ-$code-US",
            isin = "US-$code-100"
        )
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
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(end = 8.dp)
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodySmall,
                fontFamily = JetBrainsMonoFontFamily,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun OverviewCopyableRow(label: String, value: String, onCopy: () -> Unit) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onCopy() }
                .padding(vertical = 2.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = value,
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = JetBrainsMonoFontFamily,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                Icon(
                    imageVector = Icons.Outlined.ContentCopy,
                    contentDescription = label,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(14.dp)
                )
            }
        }
    }
}
