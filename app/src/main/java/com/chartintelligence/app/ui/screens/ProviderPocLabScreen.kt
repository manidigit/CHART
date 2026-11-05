package com.chartintelligence.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Science
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chartintelligence.app.model.PriceBasis
import com.chartintelligence.app.model.ProviderPocProbeResult
import com.chartintelligence.app.ui.ChartIntelligenceUiState
import com.chartintelligence.app.ui.theme.BearishCrimson
import com.chartintelligence.app.ui.theme.BullishEmerald
import com.chartintelligence.app.ui.theme.DeepSlateSurface
import com.chartintelligence.app.ui.theme.ElevatedCardSurface
import com.chartintelligence.app.ui.theme.ForecastCyan
import com.chartintelligence.app.ui.theme.NeutralAmber
import com.chartintelligence.app.ui.theme.SubtleBorderSlate
import com.chartintelligence.app.ui.theme.TextMuted
import com.chartintelligence.app.ui.theme.TextPrimary
import com.chartintelligence.app.ui.theme.TextSecondary

@Composable
fun ProviderPocLabScreen(
    uiState: ChartIntelligenceUiState,
    onRunTwelveDataPoc: () -> Unit,
    onRunDukascopyAudit: (PriceBasis) -> Unit,
    onFetchLiveBinance: () -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Spacer(modifier = Modifier.height(4.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(DeepSlateSurface)
                    .border(1.dp, SubtleBorderSlate, RoundedCornerShape(16.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Science,
                            contentDescription = "Provider POC Lab",
                            tint = ForecastCyan,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "MARKET DATA PROVIDER POC LAB (SEC 6 & 6.11)",
                            style = MaterialTheme.typography.titleSmall,
                            color = TextPrimary
                        )
                    }
                    if (uiState.isRunningNetworkPoc) {
                        CircularProgressIndicator(
                            color = BullishEmerald,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }

                Text(
                    text = "Executes the read-only market data smoke tests from scripts/provider_poc/ (Twelve Data XAU/USD & XBR/USD, Dukascopy 6-probe historical audit, and Binance Spot BTCUSDT /api/v3/klines). Priority Order (Sec 15): Verify Pepperstone (cTrader Open API) depth first; full Dukascopy download remains paused until comparison.",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary
                )

                // Action Buttons Row 1: Twelve Data + Binance Live
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = onRunTwelveDataPoc,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = ForecastCyan,
                            contentColor = Color(0xFF001B33)
                        ),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .weight(1f)
                            .testTag("run_twelve_data_poc_button")
                    ) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = "Run Twelve Data Smoke Test",
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Twelve Data POC",
                            style = MaterialTheme.typography.labelLarge
                        )
                    }

                    Button(
                        onClick = onFetchLiveBinance,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = BullishEmerald,
                            contentColor = Color(0xFF002418)
                        ),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .weight(1f)
                            .testTag("fetch_binance_live_button")
                    ) {
                        Icon(
                            imageVector = Icons.Default.CloudDownload,
                            contentDescription = "Fetch Binance BTCUSDT M15",
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Binance M15 Live",
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                }

                // Action Row 2: Dukascopy 6-Probe Bid vs Ask Inspection (Sec 6.11 & 15)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Dukascopy 6-Probe Audit:",
                        style = MaterialTheme.typography.labelMedium,
                        color = TextSecondary
                    )
                    listOf(PriceBasis.BID, PriceBasis.ASK).forEach { basis ->
                        val selected = uiState.dukascopyPriceBasis == basis
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (selected) NeutralAmber.copy(alpha = 0.2f) else ElevatedCardSurface)
                                .border(
                                    1.dp,
                                    if (selected) NeutralAmber else SubtleBorderSlate,
                                    RoundedCornerShape(8.dp)
                                )
                                .clickable { onRunDukascopyAudit(basis) }
                                .padding(horizontal = 12.dp, vertical = 7.dp)
                                .testTag("dukascopy_basis_${basis.code}")
                        ) {
                            Text(
                                text = "Verify ${basis.code.uppercase()} Basis",
                                style = MaterialTheme.typography.labelMedium,
                                color = if (selected) NeutralAmber else TextSecondary,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }

        // Pepperstone cTrader vs Dukascopy Governance Card (Section 6.3, 6.4, 17.1)
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(ElevatedCardSurface)
                    .border(1.dp, SubtleBorderSlate, RoundedCornerShape(14.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = "PROVIDER IDENTITY & TRADING CALENDAR GAP RULES (SEC 6.11)",
                    style = MaterialTheme.typography.labelLarge,
                    color = NeutralAmber
                )
                Text(
                    text = "• SPOTBRENT (TradingView) vs BRENT.CMD/USD (Dukascopy): Dukascopy's instrument is a 100-barrel no-expiry CFD. Spot-like trading does NOT make it Spot. Stored under distinct instrument_id.",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary
                )
                Text(
                    text = "• Gap vs Defect Separation: 30-day Dukascopy Gold (2,448 bars, 4 weekend gaps) and Brent (1,855 bars, 22 daily+weekend session breaks) have 0 OHLC violations and 0 duplicate timestamps.",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary
                )
            }
        }

        item {
            Text(
                text = "POC SMOKE TEST & QUALITY AUDIT RESULTS (${uiState.pocResults.size})",
                style = MaterialTheme.typography.labelLarge,
                color = TextPrimary
            )
        }

        items(uiState.pocResults, key = { it.id }) { probe ->
            PocProbeResultCard(probe = probe)
        }

        item {
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun PocProbeResultCard(probe: ProviderPocProbeResult) {
    val isRestricted = probe.status.contains("RESTRICTED", ignoreCase = true) ||
        probe.status.contains("ERROR", ignoreCase = true)
    val badgeColor = if (isRestricted) NeutralAmber else BullishEmerald

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(DeepSlateSurface)
            .border(1.dp, SubtleBorderSlate, RoundedCornerShape(14.dp))
            .padding(13.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "${probe.provider} · ${probe.providerSymbol}",
                    style = MaterialTheme.typography.titleSmall,
                    color = TextPrimary
                )
                Text(
                    text = "${probe.instrumentName} · Probe: ${probe.probeLabel}",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary
                )
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(badgeColor.copy(alpha = 0.16f))
                    .border(1.dp, badgeColor, RoundedCornerShape(8.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                Text(
                    text = probe.status,
                    style = MaterialTheme.typography.labelSmall,
                    color = badgeColor,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        if (probe.candleCount > 0) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                MetricMiniBox(
                    title = "Candles (${probe.priceBasis.code.uppercase()})",
                    value = probe.candleCount.toString(),
                    accent = ForecastCyan,
                    modifier = Modifier.weight(1f)
                )
                MetricMiniBox(
                    title = "15m Exact Steps",
                    value = probe.exact15mTransitions.toString(),
                    accent = BullishEmerald,
                    modifier = Modifier.weight(1f)
                )
                MetricMiniBox(
                    title = "Session/Data Gaps",
                    value = "${probe.sessionExpectedGaps} / ${probe.unexpectedDataGaps}",
                    accent = if (probe.unexpectedDataGaps == 0) BullishEmerald else BearishCrimson,
                    modifier = Modifier.weight(1f)
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Verified,
                        contentDescription = "Quality Check",
                        tint = BullishEmerald,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "Invalid OHLC: ${probe.invalidOhlcCount} · Duplicates: ${probe.duplicateTimestamps} · Non-Positive: ${probe.nonPositivePrices}",
                        style = MaterialTheme.typography.labelSmall,
                        color = TextSecondary
                    )
                }
            }
            Text(
                text = "Range: ${probe.firstCandleUtc} → ${probe.lastCandleUtc}",
                style = MaterialTheme.typography.labelSmall,
                color = TextMuted
            )
        }

        Text(
            text = probe.notes,
            style = MaterialTheme.typography.bodySmall,
            color = TextPrimary
        )
    }
}
