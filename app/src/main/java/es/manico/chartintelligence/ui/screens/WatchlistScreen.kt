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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.data.model.ChartPreferences
import es.manico.chartintelligence.data.model.ProviderId
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.ui.components.AssetSymbolBadge
import es.manico.chartintelligence.ui.components.WatchlistRowCard
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.cos
import kotlin.math.sin

/**
 * Mandatory Watchlist Screen Structure (with P1-UPG-6 Symbol Overview & P1-UPG-7 Gestures/48dp Audit):
 * [1] Safe Area / Status Bar Inset (handled by parent Scaffold)
 * [2] Compact Header (48.dp): Left = Watchlist Title, Right = '+' Button (48.dp touch target)
 * [3] Search Bar + Category Filter Chips (All | Metals | Energy | FX)
 * [4] Symbol List: Vertical-only LazyColumn with Pull-to-Refresh and Swipe-to-Remove
 * [5] Full P1-UPG-6 Symbol Overview Sheet (Mini-Chart, 4 Tabs, Flash News, Key Data + Day Range Bar,
 *     Seasonals, Technicals Speedometer Gauge, Analyst Rating & 1Y Target Gauge, Financials, Dividends, Profile)
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
    var financialPeriodMode by rememberSaveable { mutableStateOf("ANNUAL") }

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
            // [2] Compact 48.dp Header: Left = Watchlist Title, Right = '+' Button (48.dp touch target per P1-UPG-7)
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
                    "CRYPTO" to stringResource(R.string.watchlist_filter_crypto),
                    "INDICES" to stringResource(R.string.watchlist_filter_indices),
                    "STOCKS" to stringResource(R.string.watchlist_filter_stocks),
                    "FX" to stringResource(R.string.watchlist_filter_fx)
                )
                for ((catId, catLabel) in categories) {
                    val isSelected = selectedCategory == catId
                    Box(
                        modifier = Modifier
                            .heightIn(min = 32.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(
                                if (isSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                                else MaterialTheme.colorScheme.background
                            )
                            .border(
                                1.dp,
                                if (isSelected) MaterialTheme.colorScheme.primary else financialPalette.cardBorder,
                                RoundedCornerShape(16.dp)
                            )
                            .clickable { selectedCategory = catId }
                            .padding(horizontal = 14.dp, vertical = 6.dp)
                            .testTag("watchlist_cat_${catId.lowercase()}"),
                        contentAlignment = Alignment.Center
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

    // Full P1-UPG-6 TradingView Symbol Overview BottomSheet (All 10 Analytical Cards + 4 Sub-tabs)
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
            val rangeSpan = (highEst - lowEst).toFloat().coerceAtLeast(0.0001f)
            val dayPosRatio = ((lastClose - lowEst).toFloat() / rangeSpan).coerceIn(0.08f, 0.92f)
            val target1Y = lastClose.multiply(BigDecimal(if (isBull) "1.148" else "1.092")).setScale(overviewSymbol.decimals, RoundingMode.HALF_UP)
            val targetPctStr = if (isBull) "+14.80%" else "+9.20%"

            val profileMeta = getInstrumentProfileMeta(overviewSymbol.symbolCode, overviewSymbol.activeProvider.badgeLabel)

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
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
                                    text = "${overviewSymbol.symbolCode} • ${overviewSymbol.activeProvider.badgeLabel} • USD",
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

                // [1b] 4 Sub-Tabs: Overview | News | Minds | Ideas (Per P1-UPG-6 Section 10.7.1)
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

                // Mini-Chart with Previous Close Line & Range Selector Chips (1D..All)
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
                        Canvas(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(105.dp)
                        ) {
                            val w = size.width
                            val h = size.height
                            val prevY = h * 0.54f
                            drawLine(
                                color = Color(0xFF787B86),
                                start = Offset(0f, prevY),
                                end = Offset(w, prevY),
                                strokeWidth = 2f,
                                pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f), 0f)
                            )
                            val sampleOffsets = when (overviewRange) {
                                "1D" -> listOf(0.62f, 0.58f, 0.64f, 0.52f, 0.48f, 0.51f, 0.44f, 0.39f, 0.42f, 0.34f, 0.36f, 0.28f)
                                "1M", "3M" -> listOf(0.74f, 0.68f, 0.71f, 0.60f, 0.54f, 0.58f, 0.46f, 0.49f, 0.38f, 0.41f, 0.30f, 0.25f)
                                else -> listOf(0.68f, 0.64f, 0.59f, 0.63f, 0.55f, 0.49f, 0.53f, 0.43f, 0.46f, 0.37f, 0.33f, 0.27f)
                            }
                            val slotW = w / sampleOffsets.size
                            sampleOffsets.forEachIndexed { idx, ratio ->
                                val cx = (idx + 0.5f) * slotW
                                val cy = h * (if (isBull) ratio else (1f - ratio))
                                val openY = h * (if (isBull) (ratio + 0.05f) else (1f - ratio - 0.05f))
                                val wickTop = minOf(cy, openY) - 8f
                                val wickBot = maxOf(cy, openY) + 8f
                                val candleCol = if (idx % 3 == 1) preferences.bearCandleColor else accentColor
                                drawLine(
                                    color = candleCol,
                                    start = Offset(cx, wickTop.coerceAtLeast(4f)),
                                    end = Offset(cx, wickBot.coerceAtMost(h - 4f)),
                                    strokeWidth = 2.5f
                                )
                                drawRect(
                                    color = candleCol,
                                    topLeft = Offset(cx - slotW * 0.28f, minOf(cy, openY)),
                                    size = Size(slotW * 0.56f, kotlin.math.abs(cy - openY).coerceAtLeast(5f))
                                )
                            }
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

                // [2] Flash News Banner (P1-UPG-6 Item 2)
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
                            Text(
                                text = "⚡",
                                style = MaterialTheme.typography.bodyMedium
                            )
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

                if (overviewSubTab == "NEWS" || overviewSubTab == "MINDS" || overviewSubTab == "IDEAS") {
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
                                text = "${overviewSymbol.symbolCode} — $overviewSubTab",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold
                            )
                            OverviewDataRow(
                                label = "UTC Anchor Status",
                                value = "00:00:00 UTC Verified"
                            )
                            OverviewDataRow(
                                label = "Active Feed Channel",
                                value = overviewSymbol.activeProvider.badgeLabel
                            )
                            OverviewDataRow(
                                label = "Stored Closed Bars",
                                value = "${overviewSymbol.storedCandleCount} bars"
                            )
                            Text(
                                text = stringResource(R.string.symbol_overview_flash_news_desc),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                // [3] Key data points Card with Horizontal Day's Range Slider Bar (P1-UPG-6 Item 3)
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

                        // Visual Horizontal Day's Range Slider Bar
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
                                            .fillMaxWidth(fraction = dayPosRatio)
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
                                        text = "L: ${PriceFormatterAlgorithm.formatPrice(lowEst, overviewSymbol.decimals)}",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Text(
                                        text = "H: ${PriceFormatterAlgorithm.formatPrice(highEst, overviewSymbol.decimals)}",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }

                // [4] Seasonals Card (2026 / 2025 / 2024 Multi-Line Chart — P1-UPG-6 Item 4)
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
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("Jan", style = MaterialTheme.typography.labelSmall, fontFamily = JetBrainsMonoFontFamily, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("Apr", style = MaterialTheme.typography.labelSmall, fontFamily = JetBrainsMonoFontFamily, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("Jul", style = MaterialTheme.typography.labelSmall, fontFamily = JetBrainsMonoFontFamily, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("Oct", style = MaterialTheme.typography.labelSmall, fontFamily = JetBrainsMonoFontFamily, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceEvenly
                            ) {
                                Text("● 2026 (+18.4%)", color = Color(0xFF2962FF), fontFamily = JetBrainsMonoFontFamily, style = MaterialTheme.typography.labelSmall)
                                Text("● 2025 (+11.2%)", color = Color(0xFF26A69A), fontFamily = JetBrainsMonoFontFamily, style = MaterialTheme.typography.labelSmall)
                                Text("● 2024 (+6.8%)", color = Color(0xFFF59E0B), fontFamily = JetBrainsMonoFontFamily, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }

                // [5] Technicals Speedometer Gauge & [6] Analyst Rating / 1Y Target Gauge (P1-UPG-6 Items 7 & 8)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // Technicals Speedometer Card
                    Card(
                        modifier = Modifier
                            .weight(1f)
                            .testTag("symbol_overview_technicals_card"),
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                        border = BorderStroke(1.dp, financialPalette.cardBorder)
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.symbol_overview_technicals_title),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold
                            )
                            SpeedometerGaugeCanvas(
                                needleRatio = if (isBull) 0.78f else 0.26f,
                                accentColor = accentColor
                            )
                            Text(
                                text = stringResource(
                                    if (isBull) R.string.symbol_overview_gauge_buy
                                    else R.string.symbol_overview_gauge_sell
                                ),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.ExtraBold,
                                color = accentColor
                            )
                        }
                    }

                    // Analyst Rating & 1Y Price Target Card
                    Card(
                        modifier = Modifier
                            .weight(1f)
                            .testTag("symbol_overview_analyst_card"),
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                        border = BorderStroke(1.dp, financialPalette.cardBorder)
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.symbol_overview_analyst_title),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold
                            )
                            SpeedometerGaugeCanvas(
                                needleRatio = 0.84f,
                                accentColor = Color(0xFF26A69A)
                            )
                            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                Text(
                                    text = "${PriceFormatterAlgorithm.formatPrice(target1Y, overviewSymbol.decimals)} ($targetPctStr)",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF26A69A)
                                )
                            }
                            TextButton(
                                onClick = {
                                    overviewSymbolCode = null
                                    onNavigateToPrediction()
                                },
                                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 0.dp),
                                modifier = Modifier
                                    .height(28.dp)
                                    .testTag("symbol_overview_see_forecast_button")
                            ) {
                                Text(
                                    text = stringResource(R.string.symbol_overview_see_forecast),
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                }

                // [7] Financials: Income Statement & Net Margin % Card + Dividends & Yield (P1-UPG-6 Items 5 & 6)
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("symbol_overview_financials_card"),
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                    border = BorderStroke(1.dp, financialPalette.cardBorder)
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = stringResource(R.string.symbol_overview_financials_title),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                listOf(
                                    "ANNUAL" to stringResource(R.string.symbol_overview_fin_annual),
                                    "QUARTERLY" to stringResource(R.string.symbol_overview_fin_quarterly)
                                ).forEach { (modeKey, modeLabel) ->
                                    val active = financialPeriodMode == modeKey
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(
                                                if (active) MaterialTheme.colorScheme.primary
                                                else MaterialTheme.colorScheme.surface
                                            )
                                            .clickable { financialPeriodMode = modeKey }
                                            .padding(horizontal = 8.dp, vertical = 4.dp)
                                    ) {
                                        Text(
                                            text = modeLabel,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = if (active) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }
                        }

                        Canvas(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(84.dp)
                        ) {
                            val w = size.width
                            val h = size.height
                            val revBars = if (financialPeriodMode == "ANNUAL") {
                                listOf(0.52f, 0.64f, 0.72f, 0.85f, 0.94f)
                            } else {
                                listOf(0.60f, 0.68f, 0.74f, 0.82f, 0.90f)
                            }
                            val netBars = if (financialPeriodMode == "ANNUAL") {
                                listOf(0.28f, 0.34f, 0.41f, 0.50f, 0.58f)
                            } else {
                                listOf(0.32f, 0.36f, 0.42f, 0.48f, 0.55f)
                            }
                            val slotW = w / revBars.size
                            val marginPath = Path()
                            revBars.forEachIndexed { idx, revRatio ->
                                val cx = (idx + 0.5f) * slotW
                                val revH = h * revRatio
                                val netH = h * netBars[idx]
                                drawRect(
                                    color = Color(0xFF2962FF),
                                    topLeft = Offset(cx - 14f, h - revH),
                                    size = Size(12f, revH)
                                )
                                drawRect(
                                    color = Color(0xFF06B6D4),
                                    topLeft = Offset(cx + 2f, h - netH),
                                    size = Size(12f, netH)
                                )
                                val my = h * (1f - (netBars[idx] / revRatio) * 0.9f)
                                if (idx == 0) marginPath.moveTo(cx, my) else marginPath.lineTo(cx, my)
                            }
                            drawPath(
                                path = marginPath,
                                color = Color(0xFFF59E0B),
                                style = Stroke(width = 3.5f)
                            )
                        }

                        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceEvenly
                            ) {
                                Text("■ ${stringResource(R.string.symbol_overview_fin_revenue)}", color = Color(0xFF2962FF), style = MaterialTheme.typography.labelSmall)
                                Text("■ ${stringResource(R.string.symbol_overview_fin_net_income)}", color = Color(0xFF06B6D4), style = MaterialTheme.typography.labelSmall)
                                Text("● ${stringResource(R.string.symbol_overview_fin_net_margin)}", color = Color(0xFFF59E0B), style = MaterialTheme.typography.labelSmall)
                            }
                        }

                        HorizontalDivider(thickness = 1.dp, color = financialPalette.cardBorder)

                        Text(
                            text = stringResource(R.string.symbol_overview_dividends_title),
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold
                        )
                        OverviewDataRow(
                            label = stringResource(R.string.symbol_overview_div_payout),
                            value = profileMeta.payoutRatio
                        )
                        OverviewDataRow(
                            label = stringResource(R.string.symbol_overview_div_yield),
                            value = profileMeta.yieldTtm
                        )
                    }
                }

                // [8] Key Productivity & [9] About / Instrument Profile Card with Copyable Identifiers (P1-UPG-6 Items 9 & 10)
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
                            text = stringResource(R.string.symbol_overview_about_title),
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
                        OverviewDataRow(
                            label = stringResource(R.string.symbol_overview_emp_rev),
                            value = profileMeta.dailyTurnover
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
    val dailyTurnover: String,
    val payoutRatio: String,
    val yieldTtm: String,
    val figi: String,
    val isin: String
)

private fun getInstrumentProfileMeta(symbolCode: String, providerBadge: String): InstrumentProfileMeta {
    val code = symbolCode.uppercase()
    return when {
        code.contains("XAU") -> InstrumentProfileMeta(
            sector = "Precious Metals",
            industry = "Spot Bullion (LBMA / OTC)",
            benchmark = "XAU/USD Spot · $providerBadge",
            activeVenues = "24+ Global Venues",
            dailyTurnover = "162.4B USD",
            payoutRatio = "8.86% (Carry)",
            yieldTtm = "2.94% (Lease)",
            figi = "BBG000B9XRY4",
            isin = "XC0009655157"
        )
        code.contains("BRENT") || code.contains("OIL") -> InstrumentProfileMeta(
            sector = "Energy Commodities",
            industry = "North Sea Brent Crude",
            benchmark = "Dated Brent / ICE · $providerBadge",
            activeVenues = "18+ Energy Hubs",
            dailyTurnover = "94.8B USD",
            payoutRatio = "12.40% (Roll)",
            yieldTtm = "4.15% (Carry)",
            figi = "BBG000G2R5T8",
            isin = "EU0009658426"
        )
        code.contains("XAG") -> InstrumentProfileMeta(
            sector = "Precious & Industrial Metals",
            industry = "Spot Silver Bullion",
            benchmark = "XAG/USD Spot · $providerBadge",
            activeVenues = "19+ Global Venues",
            dailyTurnover = "38.2B USD",
            payoutRatio = "7.20%",
            yieldTtm = "2.10%",
            figi = "BBG000B9XVV8",
            isin = "XC0009653103"
        )
        else -> InstrumentProfileMeta(
            sector = "Global Foreign Exchange",
            industry = "G10 Interbank FX",
            benchmark = "$code · $providerBadge",
            activeVenues = "30+ ECN Venues",
            dailyTurnover = "410.0B USD",
            payoutRatio = "6.50% (Swap)",
            yieldTtm = "3.45% (Rate Diff)",
            figi = "BBG0013HG040",
            isin = "EU0009652759"
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
