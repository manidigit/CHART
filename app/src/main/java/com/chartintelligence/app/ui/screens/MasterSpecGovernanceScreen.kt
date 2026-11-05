package com.chartintelligence.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chartintelligence.app.ui.theme.BaselineViolet
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
fun MasterSpecGovernanceScreen(
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
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "CHART_INTELLIGENCE_MASTER_SPEC · v1.7",
                            style = MaterialTheme.typography.titleMedium,
                            color = TextPrimary
                        )
                        Text(
                            text = "سند مرجع اصلی پروژه و مشخصات محصول · 2026-11-05",
                            style = MaterialTheme.typography.bodySmall,
                            color = BullishEmerald
                        )
                    }
                    SpecDecisionBadge("DECIDED", BullishEmerald)
                }

                Text(
                    text = "Core Mission (Sec 1.1–1.4): Chart Intelligence is a standalone financial chart analysis & multi-horizon prediction engine. Phase 1 strictly evaluates forecast accuracy using closed candles (≥ M15) and Walk-Forward validation. Order execution, Entry/SL/TP, and brokerage account connections are strictly prohibited.",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary
                )
            }
        }

        // Decided vs To Verify vs Open Matrix (Section 17)
        item {
            SpecSectionCard(
                title = "DECIDED ARCHITECTURAL MANDATES (بخش ۱۷.۱)",
                badge = "DECIDED",
                badgeColor = BullishEmerald,
                bullets = listOf(
                    "Initial Primary Instruments: XAUUSD (Gold Spot/USD) & SPOTBRENT (Brent Crude Spot) on M15 timeframe (Sec 2.3).",
                    "Complete Instrument Independence: Each series (Brent Spot, Dukascopy Brent CFD, Brent Futures BZ=F, Revolut Brent CFD, BTCUSDT Spot) has isolated history, features, models, and accuracy metrics.",
                    "Closed-Candle Minimum Timeframe: M15 minimum; M30, H1, H4, D1 built via session-aware aggregation.",
                    "Immutable Prediction Ledger: Every prediction records server_received_at, device_claimed_at, SHA-256 record_hash, and prev_record_hash before horizon expiry.",
                    "Mandatory Baselines: Persistence, Previous Closed Candle Direction, and fixed SMA rule.",
                    "Walk-Forward Validation: Purged Split + Embargo + Effective Sample Size (N_eff) + Brier Score + Pinball Quantile Loss.",
                    "Zero Chart Image Storage: Screenshots are processed ephemerally on-device for numeric extraction and immediately deleted."
                )
            )
        }

        item {
            SpecSectionCard(
                title = "TECHNICAL ITEMS UNDER POC / TO VERIFY (بخش ۱۷.۴)",
                badge = "TO VERIFY",
                badgeColor = NeutralAmber,
                bullets = listOf(
                    "Pepperstone (cTrader Open API) M15 History Depth: Must be tested first for XAUUSD and SPOTBRENT; full Dukascopy download is paused until comparison completes.",
                    "Dukascopy Bid vs Ask & Full 2011 Continuity: 6 sample probes succeeded (12/12); full continuity and spread offset vs Pepperstone under verification.",
                    "Twelve Data Plan Scope: XAU/USD 100-bar M15 smoke test passed; XBR/USD returned PLAN_RESTRICTED (Grow/Venture required).",
                    "On-Device Inference Runtime: Exported Tree Evaluator vs ONNX Runtime parity test between Python training and mobile inference.",
                    "Neutral Trend Threshold Parameters: |ΔP| < k × ATR(period) — multiplier k and ATR period tuned during POC."
                )
            )
        }

        item {
            SpecSectionCard(
                title = "DATABASE DOMAIN SCHEMA (MARIADB & LOCAL SQLITE · SEC 8.4)",
                badge = "29 TABLES",
                badgeColor = ForecastCyan,
                bullets = listOf(
                    "Market (9): instruments, asset_classes, market_sources, instrument_source_mappings, market_sessions, candles (DECIMAL prices, UTC), data_import_batches, data_quality_reports, data_corrections.",
                    "Analysis (6): indicator_definitions, indicator_values, market_features, market_structures, support_resistance_levels, detected_patterns.",
                    "Prediction & Models (9): prediction_runs, prediction_forecasts, prediction_scenarios, prediction_outcomes, prediction_evaluations, prediction_models, model_versions, model_evaluations, model_deployments.",
                    "Users, Sync & Security (10): users, devices, user_preferences, api_tokens, sync_events, sync_cursors, sync_conflicts, audit_logs, login_attempts, system_logs, backup_records."
                )
            )
        }

        item {
            SpecSectionCard(
                title = "TRADING_STRATEGY_SPEC.md · PHASE 2 SEPARATION (بخش ۱۲)",
                badge = "PHASE 2 ONLY",
                badgeColor = BaselineViolet,
                bullets = listOf(
                    "Strictly separated from Phase 1 Prediction Engine evaluation.",
                    "Reserved Simulation Parameters: Initial Equity = EUR 1,000; Risk per Trade = 1% of current equity (EUR 10 initial risk budget).",
                    "Realistic Friction Requirement: Bid/Ask Spread, Commission, Slippage, Overnight Swap, and Currency Conversion must be deducted in Phase 2 strategy backtests, but never mixed into Phase 1 Forecast Accuracy."
                )
            )
        }

        item {
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun SpecSectionCard(
    title: String,
    badge: String,
    badgeColor: Color,
    bullets: List<String>
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(DeepSlateSurface)
            .border(1.dp, SubtleBorderSlate, RoundedCornerShape(16.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = TextPrimary,
                modifier = Modifier.weight(1f)
            )
            SpecDecisionBadge(badge, badgeColor)
        }

        bullets.forEach { line ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(ElevatedCardSurface)
                    .padding(horizontal = 10.dp, vertical = 7.dp)
            ) {
                Text(
                    text = "• $line",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary
                )
            }
        }
    }
}

@Composable
private fun SpecDecisionBadge(text: String, color: Color) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(color.copy(alpha = 0.16f))
            .border(1.dp, color, RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = color,
            fontWeight = FontWeight.Bold
        )
    }
}
