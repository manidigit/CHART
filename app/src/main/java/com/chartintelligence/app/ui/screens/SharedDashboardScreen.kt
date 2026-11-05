package com.chartintelligence.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chartintelligence.app.data.SharedInstrument
import com.chartintelligence.app.ui.ChartIntelligenceUiState
import com.chartintelligence.app.ui.theme.BullishEmerald
import com.chartintelligence.app.ui.theme.DeepSlateSurface
import com.chartintelligence.app.ui.theme.ElevatedCardSurface
import com.chartintelligence.app.ui.theme.NeutralAmber
import com.chartintelligence.app.ui.theme.SubtleBorderSlate
import com.chartintelligence.app.ui.theme.TextPrimary
import com.chartintelligence.app.ui.theme.TextSecondary

@Composable
fun SharedDashboardScreen(
    uiState: ChartIntelligenceUiState,
    onRefresh: () -> Unit,
    onSelectInstrument: (String) -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("MARKET INTELLIGENCE", style = MaterialTheme.typography.labelSmall, color = BullishEmerald)
                Text("Dashboard", style = MaterialTheme.typography.headlineMedium, color = TextPrimary)
                Text("Shared web + Android market service", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
            }
            OutlinedButton(onClick = onRefresh, enabled = !uiState.isCheckingSharedApi) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text(if (uiState.isCheckingSharedApi) "Checking" else "Refresh")
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                .background(ElevatedCardSurface).border(1.dp, SubtleBorderSlate, RoundedCornerShape(12.dp))
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = if (uiState.sharedApiInstruments.isEmpty()) Icons.Default.CloudOff else Icons.Default.Security,
                contentDescription = null,
                tint = if (uiState.sharedApiInstruments.isEmpty()) NeutralAmber else BullishEmerald
            )
            Spacer(Modifier.width(10.dp))
            Column {
                Text(
                    if (uiState.sharedApiInstruments.isEmpty()) "SHARED MARKET API NOT CONNECTED" else "SHARED MARKET API CONNECTED",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (uiState.sharedApiInstruments.isEmpty()) NeutralAmber else BullishEmerald,
                    fontWeight = FontWeight.Bold
                )
                Text(uiState.sharedApiStatus, style = MaterialTheme.typography.bodySmall, color = TextSecondary)
            }
        }

        Text("PHASE 1 INSTRUMENTS · M15", style = MaterialTheme.typography.labelSmall, color = TextSecondary)
        val instruments = uiState.sharedApiInstruments.ifEmpty {
            listOf(
                SharedInstrument("XAUUSD_SPOT", "XAUUSD", "Gold Spot / U.S. Dollar", "M15", "not_configured"),
                SharedInstrument("SPOTBRENT", "SPOTBRENT", "Brent Crude (Spot)", "M15", "not_configured")
            )
        }
        instruments.forEach { instrument ->
            InstrumentCard(instrument = instrument, onClick = { onSelectInstrument(instrument.id) })
        }

        Column(
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                .background(DeepSlateSurface).border(1.dp, SubtleBorderSlate, RoundedCornerShape(12.dp))
                .padding(14.dp)
        ) {
            Text("DATA POLICY", style = MaterialTheme.typography.labelSmall, color = BullishEmerald)
            Spacer(Modifier.height(8.dp))
            Text("Hourly refresh target · closed M15 candles only", color = TextPrimary, style = MaterialTheme.typography.bodyMedium)
            Text("No fabricated quotes · no broker account connection · no order execution", color = TextSecondary, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(4.dp))
        Text(
            "The shared service URL must be configured for this Android build. Market values remain hidden until a verified provider is connected.",
            style = MaterialTheme.typography.bodySmall,
            color = TextSecondary
        )
    }
}

@Composable
private fun InstrumentCard(instrument: SharedInstrument, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = TextPrimary)
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(instrument.symbol, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(instrument.timeframe, style = MaterialTheme.typography.labelSmall, color = BullishEmerald)
            }
            Text(instrument.name, style = MaterialTheme.typography.bodySmall, color = TextSecondary)
            Text("Quote unavailable · ${instrument.providerStatus}", style = MaterialTheme.typography.labelSmall, color = NeutralAmber)
        }
    }
}
