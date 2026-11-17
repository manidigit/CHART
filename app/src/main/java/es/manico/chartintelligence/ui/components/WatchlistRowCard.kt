package es.manico.chartintelligence.ui.components

import es.manico.chartintelligence.data.model.ProviderId

import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import es.manico.chartintelligence.ui.theme.bentoBorderBrush
import es.manico.chartintelligence.ui.theme.bentoCardBrush
import es.manico.chartintelligence.ui.theme.bentoInteractive
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import java.math.BigDecimal

/**
 * TradingView Standard Compact Watchlist Row (56–64dp height):
 * - Left: Rich Vector Asset Icon Badge (Gold Bullion Bars, Crude Oil Droplet, Silver Bullion, Euro FX)
 * - Middle Column:
 *   - Line 1: Symbol Code (e.g. XAUUSD) — Bold & Prominent
 *   - Line 2: Full Asset Name (e.g. Gold Spot / U.S. Dollar) — Smaller & Muted
 * - Right Column (Right-Aligned):
 *   - Line 1: Live Price (Tabular Monospace)
 *   - Line 2: Signed Change + Signed % (Green #26A69A for >=0, Red #EF5350 for <0)
 * - Clicking the entire row opens the Chart screen for that symbol.
 */
@Composable
fun WatchlistRowCard(
    symbol: SymbolConfig,
    onOpenChartClick: () -> Unit,
    hideLogos: Boolean = false,
    onOpenOverviewClick: (() -> Unit)? = null,
    onMoveUpClick: (() -> Unit)? = null,
    onMoveDownClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current

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

    val isDark = MaterialTheme.colorScheme.background.red < 0.5f

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Box(
            modifier = modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 4.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(bentoCardBrush(isDark))
                .border(
                    width = 1.dp,
                    brush = bentoBorderBrush(isDark),
                    shape = RoundedCornerShape(10.dp)
                )
                .bentoInteractive(onClick = onOpenChartClick)
                .testTag("watchlist_card_${symbol.symbolCode.lowercase()}")
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 64.dp)
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Left: Circular Asset Icon Badge + Symbol Code & Display Name
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (!hideLogos) {
                        AssetSymbolBadge(
                            symbolCode = symbol.symbolCode,
                            sizeDp = 38.dp
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = symbol.symbolCode,
                                style = MaterialTheme.typography.titleMedium,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onBackground,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            if (onOpenOverviewClick != null) {
                                Box(
                                    modifier = Modifier
                                        .clip(androidx.compose.foundation.shape.RoundedCornerShape(6.dp))
                                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.14f))
                                        .clickable(onClick = onOpenOverviewClick)
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                        .testTag("watchlist_overview_${symbol.symbolCode.lowercase()}")
                                ) {
                                    Text(
                                        text = "Intel",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontSize = 10.sp,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                            }
                        }
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

                Spacer(modifier = Modifier.width(10.dp))

                // Right: Monospace Price & Styled Bento Pill for Change %
                Column(
                    modifier = Modifier.widthIn(min = 108.dp),
                    horizontalAlignment = Alignment.End,
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = PriceFormatterAlgorithm.formatPrice(lastClose, symbol.decimals),
                        style = MaterialTheme.typography.titleMedium,
                        fontFamily = JetBrainsMonoFontFamily,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground,
                        textAlign = TextAlign.End,
                        maxLines = 1,
                        softWrap = false
                    )
                    Box(
                        modifier = Modifier
                            .clip(androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
                            .background(changeColor.copy(alpha = 0.14f))
                            .padding(horizontal = 8.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = changeLine,
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = changeColor,
                            textAlign = TextAlign.End,
                            maxLines = 1,
                            softWrap = false,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                if (onMoveUpClick != null || onMoveDownClick != null) {
                    Spacer(modifier = Modifier.width(6.dp))
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        if (onMoveUpClick != null) {
                            Box(
                                modifier = Modifier
                                    .size(24.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
                                    .clickable(onClick = onMoveUpClick)
                                    .testTag("watchlist_move_up_${symbol.symbolCode.lowercase()}"),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "▲",
                                    fontSize = 9.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        if (onMoveDownClick != null) {
                            Box(
                                modifier = Modifier
                                    .size(24.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
                                    .clickable(onClick = onMoveDownClick)
                                    .testTag("watchlist_move_down_${symbol.symbolCode.lowercase()}"),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "▼",
                                    fontSize = 9.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * TradingView-Style Rich Vector Asset Icon Badge (100% Parity with Web `renderSymbolBadge`):
 * - Gold (`XAUUSD`): Warm gold gradient circle with 3 stacked bullion bars
 * - Crude Oil (`SPOTBRENT`, `BRENT_FUTURES`): Deep ocean-blue gradient circle with crude oil droplet + shine
 * - Silver (`XAGUSD`): Metallic silver-slate gradient circle with twin bullion bars
 * - Euro FX (`EURUSD`): Royal blue gradient circle with crisp Euro (€) vector symbol
 * - Other custom symbols: Gradient circle with bold monospace ticker initials
 */
fun resolveBadgeMonogram(symbolCode: String): String {
    return when (symbolCode.uppercase().trim()) {
        "AVGO" -> "AV"
        "MU" -> "MU"
        "INTC" -> "IN"
        "MRVL" -> "MRV"
        "AMAT" -> "AMT"
        "LRCX" -> "LRC"
        "QCOM" -> "QC"
        "SMCI" -> "SMC"
        "DELL" -> "DEL"
        "SNDK" -> "SDK"
        "ANET" -> "ANT"
        "ORCL" -> "ORC"
        "CRM" -> "CRM"
        "ADBE" -> "ADB"
        "CRWD" -> "CRW"
        "CSCO" -> "CSC"
        "APP" -> "APP"
        "NBIS" -> "NBI"
        "CRWV" -> "CWV"
        "SPCX" -> "SPX"
        "RKLB" -> "RKL"
        "GEV" -> "GEV"
        "BE" -> "BE"
        "IONQ" -> "ION"
        "RIVN" -> "RIV"
        "JPM" -> "JPM"
        "BAC" -> "BAC"
        "GS" -> "GS"
        "HOOD" -> "HD"
        "MSTR" -> "MST"
        "PYPL" -> "PY"
        "WMT" -> "WMT"
        "COST" -> "CST"
        "DIS" -> "DIS"
        "SBUX" -> "SBX"
        "MCD" -> "MCD"
        "KO" -> "KO"
        "LLY" -> "LLY"
        "UNH" -> "UNH"
        "PFE" -> "PFE"
        "ASML" -> "ASM"
        "SSNLF" -> "SSN"
        "SKHY" -> "SKH"
        "BABA" -> "BBA"
        "NVO" -> "NVO"
        "TM" -> "TM"
        "SAP" -> "SAP"
        "HSBC" -> "HSB"
        "2222.SR", "2222SR" -> "ARM"
        "BRK.B", "BRKB" -> "BRK"
        "USOIL" -> "WTI"
        "SPOTBRENT", "BRENT_FUTURES" -> "OIL"
        "XAUUSD" -> "Au"
        "XAGUSD" -> "Ag"
        "EURUSD" -> "FX"
        "BTCUSD" -> "BTC"
        "ETHUSD" -> "ETH"
        "SPX500USD" -> "500"
        "NDQ" -> "100"
        else -> symbolCode.take(3).uppercase()
    }
}

/**
 * Rich Vector Asset Icon Badge (100% Parity with Web `getAssetBadge` / `SYMBOL_CATALOG_BADGES`):
 * - Commodities, Energy, Metals, FX, Crypto, and Major Indices with vector paths
 * - Blue-chip Tech & Prominent Equities with custom SVG-equivalent vector paths
 * - Standardized sector-aware gradient backgrounds and border tints across all 79 catalog symbols
 * - Guaranteed non-empty rendering (fallback to high-contrast monogram badge if no vector canvas)
 */
@Composable
fun AssetSymbolBadge(
    symbolCode: String,
    sizeDp: Dp = 36.dp,
    modifier: Modifier = Modifier
) {
    val upper = symbolCode.uppercase().trim()
    val isGold = upper.contains("XAU") || upper.contains("GOLD")
    val isOil = upper.contains("BRENT") || upper.contains("OIL") || upper.contains("WTI")
    val isSilver = upper.contains("XAG") || upper.contains("SILVER")
    val isEuro = upper.contains("EUR")

    val gradientColors = when {
        isGold -> listOf(Color(0xFFFDE047), Color(0xFFF59E0B), Color(0xFFB45309))
        isOil -> listOf(Color(0xFF38BDF8), Color(0xFF0284C7), Color(0xFF1E3A8A))
        isSilver -> listOf(Color(0xFFF1F5F9), Color(0xFF94A3B8), Color(0xFF475569))
        isEuro -> listOf(Color(0xFF60A5FA), Color(0xFF2563EB), Color(0xFF1D4ED8))
        upper == "BTCUSD" -> listOf(Color(0xFFFBBF24), Color(0xFFF7931A), Color(0xFFB45309))
        upper == "ETHUSD" -> listOf(Color(0xFFA5B4FC), Color(0xFF6366F1), Color(0xFF3730A3))
        upper == "SPX500USD" -> listOf(Color(0xFFF87171), Color(0xFFDC2626), Color(0xFF991B1B))
        upper == "NDQ" -> listOf(Color(0xFF38BDF8), Color(0xFF0284C7), Color(0xFF0F766E))
        upper == "AAPL" -> listOf(Color(0xFFCBD5E1), Color(0xFF64748B), Color(0xFF334155))
        upper == "MSFT" -> listOf(Color(0xFF1E293B), Color(0xFF0F172A), Color(0xFF020617))
        upper == "GOOGL" -> listOf(Color(0xFF334155), Color(0xFF1E293B), Color(0xFF0F172A))
        upper == "AMZN" -> listOf(Color(0xFF334155), Color(0xFF1E293B), Color(0xFF0F172A))
        upper == "TSLA" -> listOf(Color(0xFFF87171), Color(0xFFE11D48), Color(0xFF881337))
        upper == "NVDA" -> listOf(Color(0xFF4ADE80), Color(0xFF16A34A), Color(0xFF14532D))
        upper == "META" -> listOf(Color(0xFF60A5FA), Color(0xFF2563EB), Color(0xFF1D4ED8))
        upper == "NFLX" -> listOf(Color(0xFF1E1E1E), Color(0xFF0A0A0A), Color(0xFF000000))
        upper == "AMD" -> listOf(Color(0xFF34D399), Color(0xFF059669), Color(0xFF064E3B))
        upper == "UBER" -> listOf(Color(0xFF475569), Color(0xFF1E293B), Color(0xFF0F172A))
        upper == "NKE" -> listOf(Color(0xFFFB923C), Color(0xFFEA580C), Color(0xFF9A3412))
        upper == "IBM" -> listOf(Color(0xFF60A5FA), Color(0xFF2563EB), Color(0xFF1E3A8A))
        upper == "SAN" -> listOf(Color(0xFFF87171), Color(0xFFDC2626), Color(0xFF991B1B))
        upper == "AVGO" -> listOf(Color(0xFFF43F5E), Color(0xFFCC092F), Color(0xFF881337))
        upper in listOf("MU", "INTC") -> listOf(Color(0xFF38BDF8), Color(0xFF0068B5), Color(0xFF003B6F))
        upper in listOf("MRVL", "AMAT", "LRCX", "QCOM") -> listOf(Color(0xFF60A5FA), Color(0xFF2563EB), Color(0xFF1E3A8A))
        upper in listOf("DELL", "SMCI", "SNDK", "ANET") -> listOf(Color(0xFF38BDF8), Color(0xFF0076CE), Color(0xFF0F172A))
        upper == "CSCO" -> listOf(Color(0xFF38BDF8), Color(0xFF049FD9), Color(0xFF005073))
        upper in listOf("APP", "NBIS", "CRWV") -> listOf(Color(0xFFA855F7), Color(0xFF6366F1), Color(0xFF312E81))
        upper in listOf("ORCL", "CRM", "ADBE", "CRWD") -> listOf(Color(0xFFF87171), Color(0xFFDC2626), Color(0xFF7F1D1D))
        upper == "SAP" -> listOf(Color(0xFF38BDF8), Color(0xFF008FD3), Color(0xFF004070))
        upper == "PLTR" -> listOf(Color(0xFF94A3B8), Color(0xFF334155), Color(0xFF0F172A))
        upper == "SPCX" -> listOf(Color(0xFF475569), Color(0xFF1E293B), Color(0xFF000000))
        upper == "RKLB" -> listOf(Color(0xFFF87171), Color(0xFFC62828), Color(0xFF7F0000))
        upper in listOf("GEV", "BE") -> listOf(Color(0xFF4ADE80), Color(0xFF16A34A), Color(0xFF064E3B))
        upper == "IONQ" -> listOf(Color(0xFFA78BFA), Color(0xFF7C3AED), Color(0xFF4C1D95))
        upper == "RIVN" -> listOf(Color(0xFFFBBF24), Color(0xFFD97706), Color(0xFF78350F))
        upper in listOf("JPM", "BAC", "GS", "HSBC") -> listOf(Color(0xFF60A5FA), Color(0xFF1E40AF), Color(0xFF0F172A))
        upper == "V" -> listOf(Color(0xFFFBBF24), Color(0xFF1A1F71), Color(0xFF0D1242))
        upper == "MA" -> listOf(Color(0xFFF87171), Color(0xFFEB001B), Color(0xFFF79E1B))
        upper in listOf("BRK.B", "BRKB") -> listOf(Color(0xFF475569), Color(0xFF002244), Color(0xFF001122))
        upper == "HOOD" -> listOf(Color(0xFF4ADE80), Color(0xFF00C805), Color(0xFF006603))
        upper == "MSTR" -> listOf(Color(0xFFF87171), Color(0xFFD32F2F), Color(0xFF7F0000))
        upper == "PYPL" -> listOf(Color(0xFF38BDF8), Color(0xFF003087), Color(0xFF001F5C))
        upper == "COIN" -> listOf(Color(0xFF60A5FA), Color(0xFF0052FF), Color(0xFF00298A))
        upper in listOf("WMT", "COST") -> listOf(Color(0xFF60A5FA), Color(0xFF0071CE), Color(0xFFFFC220))
        upper == "DIS" -> listOf(Color(0xFF60A5FA), Color(0xFF113CCF), Color(0xFF071B66))
        upper in listOf("SBUX", "KO") -> listOf(Color(0xFF4ADE80), Color(0xFF00704A), Color(0xFF003824))
        upper == "MCD" -> listOf(Color(0xFFF87171), Color(0xFFDA291C), Color(0xFFFFC72C))
        upper in listOf("LLY", "UNH", "PFE", "NVO") -> listOf(Color(0xFF60A5FA), Color(0xFF005596), Color(0xFF002B4D))
        upper in listOf("XOM", "CVX") -> listOf(Color(0xFFF87171), Color(0xFFED1B2D), Color(0xFF7F0000))
        upper in listOf("TSM", "ASML", "SSNLF", "SKHY") -> listOf(Color(0xFF38BDF8), Color(0xFF0072CE), Color(0xFF0F172A))
        upper in listOf("2222.SR", "2222SR") -> listOf(Color(0xFF4ADE80), Color(0xFF007A3D), Color(0xFF004D26))
        upper == "BABA" -> listOf(Color(0xFFFB923C), Color(0xFFFF6A00), Color(0xFFB34700))
        upper == "TM" -> listOf(Color(0xFFF87171), Color(0xFFEB0A1E), Color(0xFF7F0000))
        else -> listOf(Color(0xFF60A5FA), Color(0xFF2563EB), Color(0xFF1E3A8A))
    }

    val borderTint = when {
        isGold -> Color(0xFFF59E0B).copy(alpha = 0.65f)
        isOil -> Color(0xFF38BDF8).copy(alpha = 0.65f)
        isSilver -> Color(0xFFCBD5E1).copy(alpha = 0.65f)
        isEuro -> Color(0xFF60A5FA).copy(alpha = 0.65f)
        upper == "BTCUSD" -> Color(0xFFF7931A).copy(alpha = 0.65f)
        upper == "ETHUSD" -> Color(0xFF627EEA).copy(alpha = 0.65f)
        upper == "NVDA" -> Color(0xFF4ADE80).copy(alpha = 0.65f)
        upper == "TSLA" -> Color(0xFFF87171).copy(alpha = 0.65f)
        upper == "AAPL" -> Color(0xFFCBD5E1).copy(alpha = 0.65f)
        upper == "MSFT" -> Color(0xFF38BDF8).copy(alpha = 0.65f)
        upper == "AMZN" -> Color(0xFFFF9900).copy(alpha = 0.65f)
        upper == "NKE" -> Color(0xFFFB923C).copy(alpha = 0.65f)
        upper == "SAN" -> Color(0xFFF87171).copy(alpha = 0.65f)
        upper == "COIN" -> Color(0xFF0052FF).copy(alpha = 0.65f)
        upper in listOf("2222.SR", "2222SR") -> Color(0xFF007A3D).copy(alpha = 0.65f)
        upper == "V" -> Color(0xFF1A1F71).copy(alpha = 0.65f)
        upper == "MA" -> Color(0xFFEB001B).copy(alpha = 0.65f)
        upper == "MCD" -> Color(0xFFDA291C).copy(alpha = 0.65f)
        upper == "WMT" -> Color(0xFF0071CE).copy(alpha = 0.65f)
        upper == "XOM" -> Color(0xFFED1B2D).copy(alpha = 0.65f)
        upper == "CVX" -> Color(0xFF0054A6).copy(alpha = 0.65f)
        upper == "TSM" -> Color(0xFF0072CE).copy(alpha = 0.65f)
        upper == "DIS" -> Color(0xFF113CCF).copy(alpha = 0.65f)
        upper == "PLTR" -> Color(0xFF94A3B8).copy(alpha = 0.65f)
        else -> Color(0xFF818CF8).copy(alpha = 0.55f)
    }

    val customVectorSymbols = setOf(
        "BTCUSD", "ETHUSD", "SPX500USD", "NDQ",
        "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA",
        "NVDA", "META", "NFLX", "AMD", "UBER",
        "NKE", "IBM", "SAN", "PLTR", "V",
        "MA", "BRK.B", "BRKB", "2222.SR", "2222SR",
        "DIS", "MCD", "WMT", "XOM", "CVX", "TSM", "COIN"
    )

    val hasCustomVectorArt = isGold || isOil || isSilver || isEuro || (upper in customVectorSymbols)

    Box(
        modifier = modifier
            .size(sizeDp)
            .clip(CircleShape)
            .background(Brush.linearGradient(gradientColors))
            .border(1.dp, borderTint, CircleShape),
        contentAlignment = Alignment.Center
    ) {
        if (hasCustomVectorArt) {
            Canvas(modifier = Modifier.size(sizeDp * 0.62f)) {
                val w = size.width
                val h = size.height
                when {
                    isGold -> {
                        val barColor = Color(0xFF451A03)
                        val topBar = Path().apply {
                            moveTo(w * 0.34f, h * 0.20f)
                            lineTo(w * 0.66f, h * 0.20f)
                            lineTo(w * 0.74f, h * 0.42f)
                            lineTo(w * 0.26f, h * 0.42f)
                            close()
                        }
                        drawPath(topBar, color = barColor)
                        val leftBar = Path().apply {
                            moveTo(w * 0.14f, h * 0.50f)
                            lineTo(w * 0.46f, h * 0.50f)
                            lineTo(w * 0.52f, h * 0.76f)
                            lineTo(w * 0.08f, h * 0.76f)
                            close()
                        }
                        drawPath(leftBar, color = barColor)
                        val rightBar = Path().apply {
                            moveTo(w * 0.54f, h * 0.50f)
                            lineTo(w * 0.86f, h * 0.50f)
                            lineTo(w * 0.92f, h * 0.76f)
                            lineTo(w * 0.48f, h * 0.76f)
                            close()
                        }
                        drawPath(rightBar, color = barColor)
                    }
                    isOil -> {
                        val drop = Path().apply {
                            moveTo(w * 0.50f, h * 0.08f)
                            cubicTo(
                                w * 0.50f, h * 0.08f,
                                w * 0.84f, h * 0.46f,
                                w * 0.84f, h * 0.66f
                            )
                            cubicTo(
                                w * 0.84f, h * 0.86f,
                                w * 0.69f, h * 0.94f,
                                w * 0.50f, h * 0.94f
                            )
                            cubicTo(
                                w * 0.31f, h * 0.94f,
                                w * 0.16f, h * 0.86f,
                                w * 0.16f, h * 0.66f
                            )
                            cubicTo(
                                w * 0.16f, h * 0.46f,
                                w * 0.50f, h * 0.08f,
                                w * 0.50f, h * 0.08f
                            )
                            close()
                        }
                        drawPath(drop, color = Color.White)
                        drawCircle(
                            color = Color(0xFF0284C7),
                            radius = w * 0.10f,
                            center = Offset(w * 0.38f, h * 0.66f)
                        )
                    }
                    isSilver -> {
                        val barColor = Color(0xFF1E293B)
                        drawRoundRect(
                            color = barColor,
                            topLeft = Offset(w * 0.22f, h * 0.24f),
                            size = Size(w * 0.56f, h * 0.22f),
                            cornerRadius = CornerRadius(w * 0.06f, w * 0.06f)
                        )
                        drawRoundRect(
                            color = barColor,
                            topLeft = Offset(w * 0.14f, h * 0.54f),
                            size = Size(w * 0.72f, h * 0.24f),
                            cornerRadius = CornerRadius(w * 0.06f, w * 0.06f)
                        )
                    }
                    isEuro -> {
                        val strokeW = (w * 0.13f).coerceAtLeast(2f)
                        drawArc(
                            color = Color.White,
                            startAngle = 40f,
                            sweepAngle = 280f,
                            useCenter = false,
                            topLeft = Offset(w * 0.18f, h * 0.14f),
                            size = Size(w * 0.68f, h * 0.72f),
                            style = Stroke(width = strokeW, cap = StrokeCap.Round)
                        )
                        drawLine(
                            color = Color.White,
                            start = Offset(w * 0.10f, h * 0.42f),
                            end = Offset(w * 0.62f, h * 0.42f),
                            strokeWidth = strokeW * 0.85f,
                            cap = StrokeCap.Round
                        )
                        drawLine(
                            color = Color.White,
                            start = Offset(w * 0.10f, h * 0.58f),
                            end = Offset(w * 0.58f, h * 0.58f),
                            strokeWidth = strokeW * 0.85f,
                            cap = StrokeCap.Round
                        )
                    }
                    upper == "BTCUSD" -> {
                        val strokeW = (w * 0.12f).coerceAtLeast(1.8f)
                        drawLine(Color.White, Offset(w * 0.30f, h * 0.16f), Offset(w * 0.30f, h * 0.84f), strokeWidth = strokeW, cap = StrokeCap.Round)
                        drawLine(Color.White, Offset(w * 0.40f, h * 0.08f), Offset(w * 0.40f, h * 0.20f), strokeWidth = strokeW * 0.85f, cap = StrokeCap.Round)
                        drawLine(Color.White, Offset(w * 0.54f, h * 0.08f), Offset(w * 0.54f, h * 0.20f), strokeWidth = strokeW * 0.85f, cap = StrokeCap.Round)
                        drawLine(Color.White, Offset(w * 0.40f, h * 0.80f), Offset(w * 0.40f, h * 0.92f), strokeWidth = strokeW * 0.85f, cap = StrokeCap.Round)
                        drawLine(Color.White, Offset(w * 0.54f, h * 0.80f), Offset(w * 0.54f, h * 0.92f), strokeWidth = strokeW * 0.85f, cap = StrokeCap.Round)
                        drawArc(Color.White, -90f, 180f, false, topLeft = Offset(w * 0.24f, h * 0.18f), size = Size(w * 0.46f, h * 0.33f), style = Stroke(strokeW, cap = StrokeCap.Round))
                        drawArc(Color.White, -90f, 180f, false, topLeft = Offset(w * 0.24f, h * 0.49f), size = Size(w * 0.52f, h * 0.35f), style = Stroke(strokeW, cap = StrokeCap.Round))
                    }
                    upper == "ETHUSD" -> {
                        val ethColor = Color.White
                        val topPyramid = Path().apply {
                            moveTo(w * 0.50f, h * 0.08f)
                            lineTo(w * 0.82f, h * 0.52f)
                            lineTo(w * 0.50f, h * 0.66f)
                            lineTo(w * 0.18f, h * 0.52f)
                            close()
                        }
                        drawPath(topPyramid, color = ethColor.copy(alpha = 0.92f))
                        val botPyramid = Path().apply {
                            moveTo(w * 0.50f, h * 0.72f)
                            lineTo(w * 0.82f, h * 0.56f)
                            lineTo(w * 0.50f, h * 0.94f)
                            lineTo(w * 0.18f, h * 0.56f)
                            close()
                        }
                        drawPath(botPyramid, color = ethColor.copy(alpha = 0.75f))
                        drawLine(Color(0xFF3730A3), Offset(w * 0.50f, h * 0.08f), Offset(w * 0.50f, h * 0.66f), strokeWidth = 1.2f)
                    }
                    upper == "AAPL" -> {
                        val applePath = Path().apply {
                            moveTo(w * 0.50f, h * 0.32f)
                            cubicTo(w * 0.42f, h * 0.24f, w * 0.22f, h * 0.26f, w * 0.18f, h * 0.46f)
                            cubicTo(w * 0.14f, h * 0.68f, w * 0.30f, h * 0.92f, w * 0.44f, h * 0.92f)
                            cubicTo(w * 0.49f, h * 0.92f, w * 0.52f, h * 0.88f, w * 0.58f, h * 0.88f)
                            cubicTo(w * 0.64f, h * 0.88f, w * 0.67f, h * 0.92f, w * 0.72f, h * 0.92f)
                            cubicTo(w * 0.86f, h * 0.92f, w * 0.98f, h * 0.72f, w * 0.94f, h * 0.58f)
                            cubicTo(w * 0.84f, h * 0.56f, w * 0.80f, h * 0.44f, w * 0.86f, h * 0.36f)
                            cubicTo(w * 0.80f, h * 0.28f, w * 0.68f, h * 0.28f, w * 0.62f, h * 0.32f)
                            cubicTo(w * 0.57f, h * 0.36f, w * 0.53f, h * 0.36f, w * 0.50f, h * 0.32f)
                            close()
                        }
                        drawPath(applePath, color = Color.White)
                        val leafPath = Path().apply {
                            moveTo(w * 0.52f, h * 0.28f)
                            cubicTo(w * 0.52f, h * 0.16f, w * 0.62f, h * 0.08f, w * 0.66f, h * 0.08f)
                            cubicTo(w * 0.66f, h * 0.20f, w * 0.56f, h * 0.28f, w * 0.52f, h * 0.28f)
                            close()
                        }
                        drawPath(leafPath, color = Color.White)
                    }
                    upper == "MSFT" -> {
                        val pad = w * 0.12f
                        val s = w * 0.34f
                        drawRect(Color(0xFFF25022), Offset(pad, pad), Size(s, s))
                        drawRect(Color(0xFF7FBA00), Offset(w - pad - s, pad), Size(s, s))
                        drawRect(Color(0xFF00A4EF), Offset(pad, h - pad - s), Size(s, s))
                        drawRect(Color(0xFFFFB900), Offset(w - pad - s, h - pad - s), Size(s, s))
                    }
                    upper == "GOOGL" -> {
                        val strokeW = w * 0.16f
                        val arcRect = Offset(strokeW * 0.6f, strokeW * 0.6f)
                        val arcSize = Size(w - strokeW * 1.2f, h - strokeW * 1.2f)
                        drawArc(Color(0xFFEA4335), 225f, 90f, false, arcRect, arcSize, style = Stroke(strokeW, cap = StrokeCap.Round))
                        drawArc(Color(0xFF4285F4), 315f, 90f, false, arcRect, arcSize, style = Stroke(strokeW, cap = StrokeCap.Round))
                        drawArc(Color(0xFF34A853), 45f, 90f, false, arcRect, arcSize, style = Stroke(strokeW, cap = StrokeCap.Round))
                        drawArc(Color(0xFFFBBC05), 135f, 90f, false, arcRect, arcSize, style = Stroke(strokeW, cap = StrokeCap.Round))
                        drawLine(Color(0xFF4285F4), Offset(w * 0.48f, h * 0.50f), Offset(w * 0.88f, h * 0.50f), strokeWidth = strokeW, cap = StrokeCap.Round)
                    }
                    upper == "AMZN" -> {
                        val strokeW = (w * 0.12f).coerceAtLeast(1.8f)
                        val smile = Path().apply {
                            moveTo(w * 0.16f, h * 0.55f)
                            cubicTo(w * 0.32f, h * 0.82f, w * 0.68f, h * 0.82f, w * 0.84f, h * 0.55f)
                        }
                        drawPath(smile, color = Color(0xFFFF9900), style = Stroke(strokeW, cap = StrokeCap.Round))
                        val arrow = Path().apply {
                            moveTo(w * 0.72f, h * 0.52f)
                            lineTo(w * 0.88f, h * 0.55f)
                            lineTo(w * 0.82f, h * 0.70f)
                            close()
                        }
                        drawPath(arrow, color = Color(0xFFFF9900))
                    }
                    upper == "TSLA" -> {
                        val topArch = Path().apply {
                            moveTo(w * 0.16f, h * 0.24f)
                            cubicTo(w * 0.34f, h * 0.18f, w * 0.66f, h * 0.18f, w * 0.84f, h * 0.24f)
                            cubicTo(w * 0.68f, h * 0.28f, w * 0.32f, h * 0.28f, w * 0.16f, h * 0.24f)
                            close()
                        }
                        drawPath(topArch, color = Color.White)
                        val stem = Path().apply {
                            moveTo(w * 0.26f, h * 0.34f)
                            cubicTo(w * 0.42f, h * 0.30f, w * 0.58f, h * 0.30f, w * 0.74f, h * 0.34f)
                            lineTo(w * 0.56f, h * 0.44f)
                            lineTo(w * 0.56f, h * 0.84f)
                            lineTo(w * 0.44f, h * 0.84f)
                            lineTo(w * 0.44f, h * 0.44f)
                            close()
                        }
                        drawPath(stem, color = Color.White)
                    }
                    upper == "NVDA" -> {
                        val strokeW = (w * 0.12f).coerceAtLeast(1.8f)
                        drawArc(Color.White, 160f, 220f, false, Offset(w * 0.12f, h * 0.15f), Size(w * 0.76f, h * 0.70f), style = Stroke(strokeW, cap = StrokeCap.Round))
                        drawArc(Color(0xFF4ADE80), 160f, 220f, false, Offset(w * 0.26f, h * 0.28f), Size(w * 0.48f, h * 0.44f), style = Stroke(strokeW, cap = StrokeCap.Round))
                        drawCircle(Color.White, radius = w * 0.08f, center = Offset(w * 0.50f, h * 0.50f))
                    }
                    upper == "META" -> {
                        val strokeW = (w * 0.14f).coerceAtLeast(2.0f)
                        drawCircle(Color.White, radius = w * 0.22f, center = Offset(w * 0.32f, h * 0.50f), style = Stroke(strokeW))
                        drawCircle(Color.White, radius = w * 0.22f, center = Offset(w * 0.68f, h * 0.50f), style = Stroke(strokeW))
                    }
                    upper == "NFLX" -> {
                        val strokeW = (w * 0.18f).coerceAtLeast(2.4f)
                        drawLine(Color(0xFFDC2626), Offset(w * 0.22f, h * 0.14f), Offset(w * 0.22f, h * 0.86f), strokeWidth = strokeW, cap = StrokeCap.Round)
                        drawLine(Color(0xFFDC2626), Offset(w * 0.78f, h * 0.14f), Offset(w * 0.78f, h * 0.86f), strokeWidth = strokeW, cap = StrokeCap.Round)
                        drawLine(Color.White, Offset(w * 0.22f, h * 0.14f), Offset(w * 0.78f, h * 0.86f), strokeWidth = strokeW * 1.15f, cap = StrokeCap.Round)
                    }
                    upper == "AMD" -> {
                        val chevron = Path().apply {
                            moveTo(w * 0.18f, h * 0.18f)
                            lineTo(w * 0.82f, h * 0.18f)
                            lineTo(w * 0.82f, h * 0.82f)
                            lineTo(w * 0.56f, h * 0.82f)
                            lineTo(w * 0.56f, h * 0.44f)
                            lineTo(w * 0.18f, h * 0.44f)
                            close()
                        }
                        drawPath(chevron, color = Color.White)
                    }
                    upper == "UBER" -> {
                        val strokeW = (w * 0.12f).coerceAtLeast(1.8f)
                        drawCircle(Color.White, radius = w * 0.36f, center = Offset(w * 0.50f, h * 0.50f), style = Stroke(strokeW))
                        drawRect(Color.White, topLeft = Offset(w * 0.35f, h * 0.35f), size = Size(w * 0.30f, h * 0.30f))
                    }
                    upper == "NKE" -> {
                        val swoosh = Path().apply {
                            moveTo(w * 0.14f, h * 0.60f)
                            cubicTo(w * 0.36f, h * 0.84f, w * 0.72f, h * 0.74f, w * 0.88f, h * 0.26f)
                            cubicTo(w * 0.70f, h * 0.50f, w * 0.46f, h * 0.60f, w * 0.14f, h * 0.60f)
                            close()
                        }
                        drawPath(swoosh, color = Color.White)
                    }
                    upper == "IBM" -> {
                        val barH = h * 0.14f
                        drawRoundRect(Color.White, Offset(w * 0.12f, h * 0.22f), Size(w * 0.76f, barH), CornerRadius(1.5f, 1.5f))
                        drawRoundRect(Color.White, Offset(w * 0.12f, h * 0.43f), Size(w * 0.76f, barH), CornerRadius(1.5f, 1.5f))
                        drawRoundRect(Color.White, Offset(w * 0.12f, h * 0.64f), Size(w * 0.76f, barH), CornerRadius(1.5f, 1.5f))
                    }
                    upper == "SAN" -> {
                        val flame = Path().apply {
                            moveTo(w * 0.50f, h * 0.12f)
                            cubicTo(w * 0.72f, h * 0.35f, w * 0.84f, h * 0.58f, w * 0.78f, h * 0.76f)
                            cubicTo(w * 0.72f, h * 0.90f, w * 0.50f, h * 0.92f, w * 0.50f, h * 0.92f)
                            cubicTo(w * 0.50f, h * 0.92f, w * 0.28f, h * 0.90f, w * 0.22f, h * 0.76f)
                            cubicTo(w * 0.16f, h * 0.58f, w * 0.28f, h * 0.35f, w * 0.50f, h * 0.12f)
                            close()
                        }
                        drawPath(flame, color = Color.White)
                    }
                    upper == "SPX500USD" -> {
                        val bw = w * 0.18f
                        drawRect(Color.White.copy(alpha = 0.6f), Offset(w * 0.18f, h * 0.58f), Size(bw, h * 0.30f))
                        drawRect(Color.White.copy(alpha = 0.8f), Offset(w * 0.41f, h * 0.40f), Size(bw, h * 0.48f))
                        drawRect(Color.White, Offset(w * 0.64f, h * 0.22f), Size(bw, h * 0.66f))
                        drawLine(Color(0xFFFBBF24), Offset(w * 0.15f, h * 0.52f), Offset(w * 0.82f, h * 0.16f), strokeWidth = 2f, cap = StrokeCap.Round)
                    }
                    upper == "NDQ" -> {
                        val strokeW = (w * 0.14f).coerceAtLeast(2.0f)
                        drawCircle(Color.White, radius = w * 0.32f, center = Offset(w * 0.48f, h * 0.46f), style = Stroke(strokeW))
                        drawLine(Color(0xFF38BDF8), Offset(w * 0.50f, h * 0.50f), Offset(w * 0.82f, h * 0.84f), strokeWidth = strokeW * 1.2f, cap = StrokeCap.Round)
                    }
                    upper == "PLTR" -> {
                        val strokeW = (w * 0.12f).coerceAtLeast(1.8f)
                        drawCircle(Color.White, radius = w * 0.30f, center = Offset(w * 0.50f, h * 0.50f), style = Stroke(strokeW))
                        drawLine(Color(0xFF38BDF8), Offset(w * 0.50f, h * 0.20f), Offset(w * 0.50f, h * 0.80f), strokeWidth = strokeW)
                        drawLine(Color(0xFF38BDF8), Offset(w * 0.20f, h * 0.50f), Offset(w * 0.80f, h * 0.50f), strokeWidth = strokeW)
                    }
                    upper == "V" -> {
                        val strokeW = (w * 0.16f).coerceAtLeast(2.0f)
                        drawLine(Color(0xFFFBBF24), Offset(w * 0.18f, h * 0.26f), Offset(w * 0.48f, h * 0.74f), strokeWidth = strokeW, cap = StrokeCap.Round)
                        drawLine(Color.White, Offset(w * 0.48f, h * 0.74f), Offset(w * 0.82f, h * 0.26f), strokeWidth = strokeW, cap = StrokeCap.Round)
                    }
                    upper == "MA" -> {
                        drawCircle(Color(0xFFEB001B).copy(alpha = 0.85f), radius = w * 0.24f, center = Offset(w * 0.38f, h * 0.50f))
                        drawCircle(Color(0xFFF79E1B).copy(alpha = 0.85f), radius = w * 0.24f, center = Offset(w * 0.62f, h * 0.50f))
                    }
                    upper in listOf("BRK.B", "BRKB") -> {
                        val strokeW = (w * 0.12f).coerceAtLeast(1.8f)
                        val diamond = Path().apply {
                            moveTo(w * 0.50f, h * 0.16f)
                            lineTo(w * 0.84f, h * 0.50f)
                            lineTo(w * 0.50f, h * 0.84f)
                            lineTo(w * 0.16f, h * 0.50f)
                            close()
                        }
                        drawPath(diamond, color = Color.White, style = Stroke(strokeW))
                        drawLine(Color.White, Offset(w * 0.50f, h * 0.16f), Offset(w * 0.50f, h * 0.84f), strokeWidth = strokeW * 0.8f)
                    }
                    upper in listOf("2222.SR", "2222SR") -> {
                        val strokeW = (w * 0.12f).coerceAtLeast(1.8f)
                        drawLine(Color.White, Offset(w * 0.50f, h * 0.15f), Offset(w * 0.50f, h * 0.85f), strokeWidth = strokeW, cap = StrokeCap.Round)
                        drawLine(Color.White, Offset(w * 0.15f, h * 0.50f), Offset(w * 0.85f, h * 0.50f), strokeWidth = strokeW, cap = StrokeCap.Round)
                        drawLine(Color(0xFFFDE047), Offset(w * 0.25f, h * 0.25f), Offset(w * 0.75f, h * 0.75f), strokeWidth = strokeW * 0.8f, cap = StrokeCap.Round)
                        drawLine(Color(0xFFFDE047), Offset(w * 0.75f, h * 0.25f), Offset(w * 0.25f, h * 0.75f), strokeWidth = strokeW * 0.8f, cap = StrokeCap.Round)
                    }
                    upper == "DIS" -> {
                        val strokeW = (w * 0.12f).coerceAtLeast(1.8f)
                        drawArc(Color.White, 190f, 160f, false, Offset(w * 0.15f, h * 0.25f), Size(w * 0.70f, h * 0.60f), style = Stroke(strokeW, cap = StrokeCap.Round))
                        drawCircle(Color(0xFFFDE047), radius = w * 0.08f, center = Offset(w * 0.75f, h * 0.35f))
                    }
                    upper == "MCD" -> {
                        val strokeW = (w * 0.14f).coerceAtLeast(2.0f)
                        drawArc(Color(0xFFFFC72C), 180f, 180f, false, Offset(w * 0.14f, h * 0.32f), Size(w * 0.36f, h * 0.50f), style = Stroke(strokeW, cap = StrokeCap.Round))
                        drawArc(Color(0xFFFFC72C), 180f, 180f, false, Offset(w * 0.50f, h * 0.32f), Size(w * 0.36f, h * 0.50f), style = Stroke(strokeW, cap = StrokeCap.Round))
                    }
                    upper == "WMT" -> {
                        val strokeW = (w * 0.12f).coerceAtLeast(1.8f)
                        drawLine(Color(0xFFFFC220), Offset(w * 0.50f, h * 0.16f), Offset(w * 0.50f, h * 0.36f), strokeWidth = strokeW, cap = StrokeCap.Round)
                        drawLine(Color(0xFFFFC220), Offset(w * 0.50f, h * 0.64f), Offset(w * 0.50f, h * 0.84f), strokeWidth = strokeW, cap = StrokeCap.Round)
                        drawLine(Color(0xFFFFC220), Offset(w * 0.20f, h * 0.32f), Offset(w * 0.38f, h * 0.42f), strokeWidth = strokeW, cap = StrokeCap.Round)
                        drawLine(Color(0xFFFFC220), Offset(w * 0.62f, h * 0.58f), Offset(w * 0.80f, h * 0.68f), strokeWidth = strokeW, cap = StrokeCap.Round)
                        drawLine(Color(0xFFFFC220), Offset(w * 0.20f, h * 0.68f), Offset(w * 0.38f, h * 0.58f), strokeWidth = strokeW, cap = StrokeCap.Round)
                        drawLine(Color(0xFFFFC220), Offset(w * 0.62f, h * 0.42f), Offset(w * 0.80f, h * 0.32f), strokeWidth = strokeW, cap = StrokeCap.Round)
                    }
                    upper == "XOM" -> {
                        val strokeW = (w * 0.13f).coerceAtLeast(1.8f)
                        drawLine(Color.White, Offset(w * 0.18f, h * 0.26f), Offset(w * 0.46f, h * 0.74f), strokeWidth = strokeW, cap = StrokeCap.Round)
                        drawLine(Color.White, Offset(w * 0.46f, h * 0.26f), Offset(w * 0.18f, h * 0.74f), strokeWidth = strokeW, cap = StrokeCap.Round)
                        drawLine(Color.White, Offset(w * 0.54f, h * 0.26f), Offset(w * 0.82f, h * 0.74f), strokeWidth = strokeW, cap = StrokeCap.Round)
                        drawLine(Color.White, Offset(w * 0.82f, h * 0.26f), Offset(w * 0.54f, h * 0.74f), strokeWidth = strokeW, cap = StrokeCap.Round)
                    }
                    upper == "CVX" -> {
                        val strokeW = (w * 0.13f).coerceAtLeast(1.8f)
                        val chevron1 = Path().apply {
                            moveTo(w * 0.22f, h * 0.32f)
                            lineTo(w * 0.50f, h * 0.52f)
                            lineTo(w * 0.78f, h * 0.32f)
                        }
                        drawPath(chevron1, color = Color(0xFF38BDF8), style = Stroke(strokeW, cap = StrokeCap.Round))
                        val chevron2 = Path().apply {
                            moveTo(w * 0.22f, h * 0.54f)
                            lineTo(w * 0.50f, h * 0.74f)
                            lineTo(w * 0.78f, h * 0.54f)
                        }
                        drawPath(chevron2, color = Color(0xFFF87171), style = Stroke(strokeW, cap = StrokeCap.Round))
                    }
                    upper == "TSM" -> {
                        val strokeW = (w * 0.10f).coerceAtLeast(1.5f)
                        drawRoundRect(Color.White, Offset(w * 0.20f, h * 0.20f), Size(w * 0.60f, h * 0.60f), CornerRadius(3f, 3f), style = Stroke(strokeW))
                        drawLine(Color(0xFF38BDF8), Offset(w * 0.20f, h * 0.40f), Offset(w * 0.80f, h * 0.40f), strokeWidth = strokeW * 0.8f)
                        drawLine(Color(0xFF38BDF8), Offset(w * 0.20f, h * 0.60f), Offset(w * 0.80f, h * 0.60f), strokeWidth = strokeW * 0.8f)
                        drawLine(Color(0xFF38BDF8), Offset(w * 0.40f, h * 0.20f), Offset(w * 0.40f, h * 0.80f), strokeWidth = strokeW * 0.8f)
                        drawLine(Color(0xFF38BDF8), Offset(w * 0.60f, h * 0.20f), Offset(w * 0.60f, h * 0.80f), strokeWidth = strokeW * 0.8f)
                    }
                    upper == "COIN" -> {
                        val strokeW = (w * 0.14f).coerceAtLeast(2.0f)
                        drawArc(Color.White, 45f, 270f, false, Offset(w * 0.18f, h * 0.18f), Size(w * 0.64f, h * 0.64f), style = Stroke(strokeW, cap = StrokeCap.Round))
                    }
                }
            }
        } else {
            val monogram = resolveBadgeMonogram(upper)
            Text(
                text = monogram,
                style = MaterialTheme.typography.labelSmall,
                fontFamily = JetBrainsMonoFontFamily,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                fontSize = if (monogram.length > 3) 8.sp else 10.sp,
                maxLines = 1
            )
        }
    }
}

fun resolveAssetBadge(symbolCode: String): Pair<String, Color> {
    val upper = symbolCode.uppercase().trim()
    return when (upper) {
        "XAUUSD" -> "Au" to Color(0xFFF59E0B)
        "SPOTBRENT", "BRENT_FUTURES" -> "OIL" to Color(0xFF2962FF)
        "USOIL" -> "WTI" to Color(0xFF0EA5E9)
        "XAGUSD" -> "Ag" to Color(0xFF94A3B8)
        "EURUSD", "GBPUSD", "USDJPY" -> "FX" to Color(0xFF26A69A)
        "BTCUSD" -> "BTC" to Color(0xFFF7931A)
        "ETHUSD" -> "ETH" to Color(0xFF627EEA)
        "SPX500USD" -> "500" to Color(0xFFEF4444)
        "NDQ" -> "100" to Color(0xFF06B6D4)
        "NVDA" -> "NVDA" to Color(0xFF22C55E)
        "AMZN" -> "AMZN" to Color(0xFFF59E0B)
        "TSLA" -> "TSLA" to Color(0xFFEF4444)
        "AAPL" -> "AAPL" to Color(0xFF64748B)
        "GOOGL" -> "GOOG" to Color(0xFF3B82F6)
        "MSFT" -> "MSFT" to Color(0xFF0EA5E9)
        "META" -> "META" to Color(0xFF2563EB)
        "NFLX" -> "NFLX" to Color(0xFFDC2626)
        "AMD" -> "AMD" to Color(0xFF10B981)
        "UBER" -> "UBER" to Color(0xFF475569)
        "NKE" -> "NKE" to Color(0xFFF97316)
        "IBM" -> "IBM" to Color(0xFF3B82F6)
        "SAN" -> "SAN" to Color(0xFFEC1C24)
        "AVGO" -> "AVGO" to Color(0xFFCC092F)
        "MU" -> "MU" to Color(0xFF005A9C)
        "INTC" -> "INTC" to Color(0xFF0068B5)
        "MRVL" -> "MRVL" to Color(0xFF2563EB)
        "AMAT" -> "AMAT" to Color(0xFF0072CE)
        "LRCX" -> "LRCX" to Color(0xFF005A9C)
        "QCOM" -> "QCOM" to Color(0xFF002244)
        "SMCI" -> "SMCI" to Color(0xFF0076CE)
        "DELL" -> "DELL" to Color(0xFF0076CE)
        "SNDK" -> "SNDK" to Color(0xFFE2231A)
        "ANET" -> "ANET" to Color(0xFF002F6C)
        "PLTR" -> "PLTR" to Color(0xFF475569)
        "ORCL" -> "ORCL" to Color(0xFFC74634)
        "CRM" -> "CRM" to Color(0xFF00A1E0)
        "ADBE" -> "ADBE" to Color(0xFFFA0F00)
        "CRWD" -> "CRWD" to Color(0xFFE01E26)
        "CSCO" -> "CSCO" to Color(0xFF049FD9)
        "APP" -> "APP" to Color(0xFF8B5CF6)
        "NBIS" -> "NBIS" to Color(0xFF4F46E5)
        "CRWV" -> "CRWV" to Color(0xFF0D9488)
        "SPCX" -> "SPCX" to Color(0xFF262626)
        "RKLB" -> "RKLB" to Color(0xFFC62828)
        "GEV" -> "GEV" to Color(0xFF16A34A)
        "BE" -> "BE" to Color(0xFF10B981)
        "IONQ" -> "IONQ" to Color(0xFF7C3AED)
        "RIVN" -> "RIVN" to Color(0xFFD97706)
        "JPM" -> "JPM" to Color(0xFF117ACA)
        "BAC" -> "BAC" to Color(0xFFE31837)
        "GS" -> "GS" to Color(0xFF7399C6)
        "V" -> "VISA" to Color(0xFF1A1F71)
        "MA" -> "MA" to Color(0xFFEB001B)
        "BRK.B", "BRKB" -> "BRK" to Color(0xFF002244)
        "HOOD" -> "HOOD" to Color(0xFF00C805)
        "MSTR" -> "MSTR" to Color(0xFFD32F2F)
        "PYPL" -> "PYPL" to Color(0xFF003087)
        "COIN" -> "COIN" to Color(0xFF0052FF)
        "WMT" -> "WMT" to Color(0xFF0071CE)
        "COST" -> "COST" to Color(0xFFE31837)
        "DIS" -> "DIS" to Color(0xFF113CCF)
        "SBUX" -> "SBUX" to Color(0xFF00704A)
        "MCD" -> "MCD" to Color(0xFFDA291C)
        "KO" -> "KO" to Color(0xFFF40009)
        "LLY" -> "LLY" to Color(0xFFE31837)
        "UNH" -> "UNH" to Color(0xFF002677)
        "PFE" -> "PFE" to Color(0xFF000080)
        "XOM" -> "XOM" to Color(0xFFED1B2D)
        "CVX" -> "CVX" to Color(0xFF0054A6)
        "TSM" -> "TSM" to Color(0xFF0072CE)
        "ASML" -> "ASML" to Color(0xFF002244)
        "SSNLF" -> "SSN" to Color(0xFF034EA2)
        "SKHY" -> "SKH" to Color(0xFFE2231A)
        "BABA" -> "BABA" to Color(0xFFFF6A00)
        "NVO" -> "NVO" to Color(0xFF003087)
        "TM" -> "TM" to Color(0xFFEB0A1E)
        "SAP" -> "SAP" to Color(0xFF008FD3)
        "HSBC" -> "HSBC" to Color(0xFFDB0011)
        "2222.SR", "2222SR" -> "ARM" to Color(0xFF007A3D)
        else -> resolveBadgeMonogram(upper) to Color(0xFF2962FF)
    }
}
