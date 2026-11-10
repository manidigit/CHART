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

    val gradientColors = when {
        isGold -> listOf(Color(0xFFFDE047), Color(0xFFF59E0B), Color(0xFFB45309))
        isOil -> listOf(Color(0xFF38BDF8), Color(0xFF0284C7), Color(0xFF1E3A8A))
        isSilver -> listOf(Color(0xFFF1F5F9), Color(0xFF94A3B8), Color(0xFF475569))
        isEuro -> listOf(Color(0xFF60A5FA), Color(0xFF2563EB), Color(0xFF1D4ED8))
        else -> listOf(Color(0xFF818CF8), Color(0xFF4F46E5), Color(0xFF312E81))
    }

    val borderTint = when {
        isGold -> Color(0xFFF59E0B).copy(alpha = 0.65f)
        isOil -> Color(0xFF38BDF8).copy(alpha = 0.65f)
        isSilver -> Color(0xFFCBD5E1).copy(alpha = 0.65f)
        isEuro -> Color(0xFF60A5FA).copy(alpha = 0.65f)
        else -> Color(0xFF818CF8).copy(alpha = 0.55f)
    }

    Box(
        modifier = modifier
            .size(sizeDp)
            .clip(CircleShape)
            .background(Brush.linearGradient(gradientColors))
            .border(1.dp, borderTint, CircleShape),
        contentAlignment = Alignment.Center
    ) {
        if (isGold || isOil || isSilver || isEuro) {
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
                }
            }
        } else {
            Text(
                text = upper.take(3),
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
        "SPOTBRENT", "BRENT_FUTURES" -> "OIL" to Color(0xFF2962FF)
        "XAGUSD" -> "Ag" to Color(0xFF94A3B8)
        "EURUSD" -> "FX" to Color(0xFF26A69A)
        else -> symbolCode.take(3).uppercase() to Color(0xFF2962FF)
    }
}
