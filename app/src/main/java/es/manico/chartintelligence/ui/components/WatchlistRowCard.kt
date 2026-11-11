package es.manico.chartintelligence.ui.components

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
import androidx.compose.foundation.shape.CircleShape
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
                // Left: Circular Asset Icon Badge (unless hideLogos == true) + Middle Column (Symbol Code + Full Name)
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (!hideLogos) {
                        AssetSymbolBadge(
                            symbolCode = symbol.symbolCode,
                            sizeDp = 36.dp
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
                                        .clip(CircleShape)
                                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.14f))
                                        .clickable(onClick = onOpenOverviewClick)
                                        .padding(horizontal = 6.dp, vertical = 1.dp)
                                        .testTag("watchlist_overview_${symbol.symbolCode.lowercase()}")
                                ) {
                                    Text(
                                        text = "Overview",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontFamily = JetBrainsMonoFontFamily,
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

                if (onMoveUpClick != null || onMoveDownClick != null) {
                    Spacer(modifier = Modifier.width(6.dp))
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        if (onMoveUpClick != null) {
                            Box(
                                modifier = Modifier
                                    .size(22.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                                    .clickable(onClick = onMoveUpClick)
                                    .testTag("watchlist_move_up_${symbol.symbolCode.lowercase()}"),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "▲",
                                    fontSize = 8.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        if (onMoveDownClick != null) {
                            Box(
                                modifier = Modifier
                                    .size(22.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                                    .clickable(onClick = onMoveDownClick)
                                    .testTag("watchlist_move_down_${symbol.symbolCode.lowercase()}"),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "▼",
                                    fontSize = 8.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }

            HorizontalDivider(
                thickness = 1.dp,
                color = financialPalette.cardBorder
            )
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
@Composable
fun AssetSymbolBadge(
    symbolCode: String,
    sizeDp: Dp = 36.dp,
    modifier: Modifier = Modifier
) {
    val upper = symbolCode.uppercase()
    val isGold = upper.contains("XAU") || upper.contains("GOLD")
    val isOil = upper.contains("BRENT") || upper.contains("OIL") || upper.contains("WTI")
    val isSilver = upper.contains("XAG") || upper.contains("SILVER")
    val isEuro = upper.contains("EUR")

    val isStock = upper in listOf("NVDA", "AMZN", "TSLA", "AAPL", "GOOGL", "MSFT", "META", "NFLX", "AMD", "UBER", "NKE", "IBM", "SAN")
    val isCrypto = upper in listOf("BTCUSD", "ETHUSD")
    val isIndex = upper in listOf("SPX500USD", "NDQ")

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
        else -> Color(0xFF818CF8).copy(alpha = 0.55f)
    }

    val hasCustomVectorArt = isGold || isOil || isSilver || isEuro || isCrypto || isIndex || isStock

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
                }
            }
        } else {
            Text(
                text = upper.take(4),
                style = MaterialTheme.typography.labelSmall,
                fontFamily = JetBrainsMonoFontFamily,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
        }
    }
}

fun resolveAssetBadge(symbolCode: String): Pair<String, Color> {
    return when (symbolCode.uppercase()) {
        "XAUUSD" -> "Au" to Color(0xFFF59E0B)
        "SPOTBRENT", "BRENT_FUTURES", "USOIL" -> "OIL" to Color(0xFF2962FF)
        "XAGUSD" -> "Ag" to Color(0xFF94A3B8)
        "EURUSD", "GBPUSD", "USDJPY" -> "FX" to Color(0xFF26A69A)
        "BTCUSD" -> "BTC" to Color(0xFFF7931A)
        "ETHUSD" -> "ETH" to Color(0xFF627EEA)
        "SPX500USD" -> "500" to Color(0xFFEF4444)
        "NDQ" -> "100" to Color(0xFF0EA5E9)
        "NVDA" -> "NVDA" to Color(0xFF16A34A)
        "AMZN" -> "AMZN" to Color(0xFFD97706)
        "TSLA" -> "TSLA" to Color(0xFFE11D48)
        "AAPL" -> "AAPL" to Color(0xFF94A3B8)
        "GOOGL" -> "GOOG" to Color(0xFF3B82F6)
        "MSFT" -> "MSFT" to Color(0xFF0284C7)
        "META" -> "META" to Color(0xFF2563EB)
        "NFLX" -> "NFLX" to Color(0xFFDC2626)
        "AMD" -> "AMD" to Color(0xFF059669)
        "UBER" -> "UBER" to Color(0xFF475569)
        "NKE" -> "NKE" to Color(0xFFEA580C)
        "IBM" -> "IBM" to Color(0xFF2563EB)
        "SAN" -> "SAN" to Color(0xFFDC2626)
        else -> symbolCode.take(4).uppercase() to Color(0xFF2962FF)
    }
}
