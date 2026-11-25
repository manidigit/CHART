# Classical Signal Generators & Risk/Reward Intelligence Architecture (`signal-gen/1.0` + `strategy-sim/2.0`)

**Status:** Implemented & Verified on Web (`host_subdomain/`, `v1.47.41`)  
**Date:** 2026-11-25  
**Scope:** Strictly **Offline Signal Generation & Offline Research Backtesting** — zero broker/exchange APIs, zero CCXT, zero order execution, zero live position management, zero Cron jobs, zero Python / `PHP exec()`, zero changes to the Forecast Engine or Data Providers (`tvdatafeed` remains sole active market feed).

---

## 1. Architecture & Module Layout

All classical signal and Risk/Reward modules reside in a dedicated UI-independent subsystem under `host_subdomain/assets/js/strategy/` and consume indicators **exclusively** from **`ta-core/1.1`** (`TechnicalAnalysisCore` / `TechnicalIndicators`) — zero duplicate or parallel indicator libraries exist.

| Module | Contract / Responsibility |
|---|---|
| `host_subdomain/assets/js/strategy/riskRewardEngine.js` | **Hard Gate Risk/Reward Intelligence (`signal-gen/1.0`)**: immutable `MINIMUM_REQUIRED_RR = 2.0`, `OPTIMAL_RR_THRESHOLD = 3.0`, `enforceMinimumRequiredRR()`, causal swing/S&R structure indexing (`buildCausalStructureAtIndex`), nearest-barrier structural TP resolution (anti-fabrication), round-trip friction calculation (Spread + Commission + Slippage), `evaluateRiskRewardTradePlan()`, and transparent unit-approximation position sizing (`calculateInstrumentPositionSizing`). |
| `host_subdomain/assets/js/strategy/classicalGenerators.js` | **5 Pure Causal Signal Generators**: `trend_pullback_v1`, `rsi_reversion_v1` (RSI14 + Connors RSI(2)), `breakout_v1` (causal Donchian N-bar), `sma_crossover_v1` (20/50 & 50/200), and `rsi_dip_v1` (research comparison baseline). Propose structured candidates ONLY; cannot emit valid signals directly without passing `riskRewardEngine.js`. |
| `host_subdomain/assets/js/strategy/signalEngine.js` | **Signal Coordinator**: normalizes closed candles (`excludeOpenBars: true`), computes `ta-core/1.1` indicators (`SMA 5/20/50/200`, `EMA 50`, `RSI 2/14`, `ATR 14`) + causal S/R zones, runs the chosen generator, enforces the non-bypassable Hard Gate, applies duplicate cooldown suppression, and strictly separates `validSignals` from `rejections` (`NO_TRADE`) and `latestDecision`. |
| `host_subdomain/assets/js/strategy/signalBacktester.js` | **Event-Driven Backtest Engine (`strategy-sim/2.0`)**: next-bar-open causal fills, opening-gap invalidation guard, conservative `SL_BEFORE_TP` intrabar tie-breaker, dedicated strategy exit rules (e.g., Connors `Close > SMA(5)`), parallel Gross (0x) & Net (1x) runs, Cost Sensitivity (`0x/1x/1.5x/2x`), chronological 70/30 In-Sample/Out-of-Sample split, and `compareAllClassicalStrategies()`. |
| `host_subdomain/assets/js/algorithms/strategySimulator.js` | Preserves 100% backward compatibility with legacy `strategy-sim/1.0` presets while re-exporting `SignalEngine`, `SignalBacktester`, `CLASSICAL_STRATEGY_REGISTRY`, `MINIMUM_REQUIRED_RR`, and `enforceMinimumRequiredRR`. |
| `host_subdomain/assets/js/views/strategyLabView.js` | 4-tab bilingual Strategy Lab modal (`Signal & Backtest`, `Compare All (5)`, `Valid Signals`, `Diagnostics / NO TRADE`) with live `VALID` / `NO TRADE` banner, per-strategy parameter controls, locked `Min Net R:R ≥ 2.00` gate, Equity Curve SVG, IS/OOS split, Cost Sensitivity table, and one-click **Show on Chart** overlay controls. |
| `host_subdomain/assets/js/components/chartRenderer.js` | **Chart Overlay Adaptation**: Renders validated signals (`status === 'valid'` AND `net_rr >= 2.0`) directly on CHART Intelligence's existing HTML5 Canvas renderer (`Entry`, `SL`, `TP1`, optional `TP2`, translucent Risk/Reward shaded zones, signal anchor arrow, right-axis price badges, and summary pill) — **never** plots rejected / `NO TRADE` signals. |

---

## 2. Risk/Reward Intelligence — Non-Negotiable Hard Gate

Every candidate trade setup proposed by any classical generator MUST pass `evaluateRiskRewardTradePlan()` before becoming a valid signal:

1. **Immutable Minimum Floor (`MINIMUM_REQUIRED_RR = 2.0`):**
   - Frozen constant in `riskRewardEngine.js` and enforced via `enforceMinimumRequiredRR()` in engine normalization, backtester config, and UI input handling (`min="2.0"` + toast rejection if lowered).
   - **Net R:R < 2.00:** Strictly rejected (`status: 'no_trade'`, `passed: false`).
   - **Net R:R 2.00 – 2.99:** Accepted conditionally (`tier: 'CONDITIONAL_ACCEPT'`) when all structural and strategy rules pass.
   - **Net R:R ≥ 3.00:** Preferred (`tier: 'OPTIMAL'`), still strictly constrained to realistic structural targets.
2. **Structural Stop Loss (No Artificial Tightening):**
   - Stop Loss is anchored to real market structure (pullback swing low/high, breakout range low/high, confirmation bar extreme, or nearest causal support/resistance) plus an ATR buffer.
   - Rejected if missing, wrong-sided (`NO_STRUCTURAL_STOP_LOSS`), narrower than `0.35 × ATR` (`STOP_TOO_TIGHT_NOISE`), or wider than `4.5 × ATR` (`STOP_TOO_WIDE_UNREALISTIC`).
3. **Structural Take Profit & Anti-Fabrication Rule:**
   - `TP1` is selected **strictly from the nearest valid causal opposing barrier** (confirmed `SR_RESISTANCE_ZONE` / `SWING_HIGH` for Long; `SR_SUPPORT_ZONE` / `SWING_LOW` for Short).
   - **Skipping a closer structural barrier just to manufacture 1:2 or 1:3 R:R is strictly forbidden.** If the nearest causal barrier sits at `1.45R` and a second barrier sits at `3.50R`, the engine MUST select `1.45R` as `TP1` and reject the setup (`GROSS_RR_BELOW_MINIMUM`).
   - Optional `TP2` is emitted only when a further real causal barrier exists beyond `TP1` within realistic volatility bounds.
4. **Net R:R After Real Trading Costs:**
   - Round-trip friction per unit = `entry × (spreadBps + 2 × commissionBps + 2 × slippageBps) / 10,000`.
   - `netReward = grossReward - friction`, `netRisk = grossRisk + friction`, `netRR = netReward / netRisk`.
   - If Gross R:R is `2.10` but trading costs reduce Net R:R to `1.95`, the signal is strictly rejected (`NET_RR_BELOW_MINIMUM`).
5. **Anti-Chase, Closed-Candle & Duplicate Suppression Guards:**
   - Open/forming candles (`is_closed === false`) are excluded during normalization and explicitly blocked (`OPEN_BAR_FORBIDDEN`).
   - Over-extended chased entries beyond `maxChaseAtr × ATR` are rejected (`CHASED_ENTRY_REJECTED`).
   - Duplicate same-side setups within the configurable cooldown window emit `DUPLICATE_SIGNAL_SUPPRESSED` in Diagnostics instead of spamming repeated signals.

---

## 3. Classical Signal Generators (`ta-core/1.1` Only)

| Strategy ID | Priority | Core Logic | Configurable Parameters |
|---|---|---|---|
| `trend_pullback_v1` | **HIGH** | Established `SMA 50` / `SMA 200` trend + pullback into `SMA 20–50` value zone without breaking structure + directional confirmation close beyond `SMA 20` & optional prior-bar break; SL below pullback swing + ATR buffer. | `pullbackLookback`, `atrStopBuffer`, `requirePriorBarBreak` |
| `rsi_reversion_v1` | **HIGH** | Macro trend filter (`Close > SMA 200` for Long, `<` for Short). Supports **(a) `RSI(14)`** oversold/overbought hook-up (`30 / 35 / 40`) + reversal confirmation, and **(b) `Connors RSI(2) < 10`** variant with dedicated **`Close > SMA(5)`** exit rule (for Long; `< SMA(5)` for Short). | `variant` (`RSI14` / `CONNORS_RSI2`), `rsiThreshold` (`30/35/40`), `connorsRsi2Threshold`, `atrStopBuffer` |
| `breakout_v1` | **MEDIUM** | Strictly causal Donchian N-bar breakout using prior window `[i-N .. i-1]` (excluding current bar `i`) + close-location fakeout filter + optional volume surge & ATR/trend filters. | `breakoutPeriod` (`N`, default `20`), `useVolumeFilter`, `useAtrTrendFilter` |
| `sma_crossover_v1` | **MEDIUM** | Classical Golden/Death cross supporting `20/50` and `50/200` pairs + optional Close alignment and trend-strength slope filters. | `smaPair` (`20_50` / `50_200`), `requireCloseAlignment`, `useTrendStrengthFilter` |
| `rsi_dip_v1` | **RESEARCH BENCHMARK** | Intentionally weaker baseline (simple RSI dip without macro/momentum confirmation), transparently tagged as **Research Comparison Baseline** so weak/losing benchmarks remain visible side-by-side without hiding poor results. | `rsiThreshold` (default `35`) |

---

## 4. Backtesting Engine & Reported Metrics (`strategy-sim/2.0`)

- **Causal Execution:** Signals decided on closed bar `i` fill on bar `i + 1` `open` (zero look-ahead). Opening gaps already past SL or TP1 skip fill safely.
- **Intrabar Tie-Breaker:** Conservative **`SL_BEFORE_TP`** whenever both SL and TP1 are breached inside the same candle.
- **Metrics Computed:**
  - `Net Return %` & `Net Profit (€)` (after Spread + Commission + Slippage + Swap)
  - `Gross Return %` & `Gross Profit (€)` (parallel zero-cost baseline)
  - `Annualized Return (CAGR %)` (reported **only** when closed-bar span ≥ 30 days; `null` / `N/A (<30d)` on shorter intraday windows to prevent misleading extrapolation)
  - `Win Rate %`, `Win/Loss/Breakeven Counts`, `Total Trades`, `Profit Factor`, `Expectancy (€)`, `Average R`
  - `Maximum Drawdown (% & €)`, `Sharpe Ratio`, `Sortino Ratio`, `Max Consecutive Wins / Losses`
  - `Avg Holding Period (bars)`, `Total Costs (€)`, `Max Exposure %`
  - `RR-Rejected Count`, `Total Rejected Count`, `Avg Accepted Net R:R`
  - `Cost Sensitivity Table` (`0.0x Gross`, `1.0x Base`, `1.5x`, `2.0x`)
  - `Chronological 70/30 In-Sample vs Out-of-Sample Split` (strictly zero leakage)
  - `Multi-Strategy Comparison Table` (all enabled classical strategies side-by-side)

---

## 5. UI Controls & Chart Overlay Adaptation

- **Strategy Lab Modal (`host_subdomain/assets/js/views/strategyLabView.js`):** Accessible from the top header bar directly beside `Forecast` on both Chart and Forecast workspaces. Features 4 tabs:
  1. **Signal & Backtest:** Live `VALID SIGNAL` / `NO TRADE` banner, strategy picker, strategy-specific parameter controls, locked `Min Net R:R ≥ 2.00` input, full KPI grid, Equity Curve SVG, 70/30 IS/OOS validation, Cost Sensitivity table, sizing disclosure, and Trade Ledger.
  2. **Compare All (5):** Per-strategy enable/disable checkboxes + transparent comparison table including `RSI Dip` research baseline and losing strategies.
  3. **Valid Signals:** Table of all Hard-Gate-approved `signal-gen/1.0` signals with one-click **Show on Chart** (`Plot`).
  4. **Diagnostics / NO TRADE:** Transparent audit log of rejected candidates with rejection codes, Gross R:R, Net R:R, and reasons — strictly decoupled from chart buy/sell markers.
- **Canvas Chart Overlay (`host_subdomain/assets/js/components/chartRenderer.js`):** Per owner-approved adaptation, validated signals render directly on CHART Intelligence's existing HTML5 Canvas chart (rather than replacing the chart with Lightweight Charts), showing `Entry`, `SL`, `TP1`, optional `TP2`, shaded Risk/Reward zones, right-axis price badges, and a removable top status pill (`▲ LONG / ▼ SHORT · 1:X.XXR`).

---

## 6. External Open-Source Sources & License Audit

| External Reference | License | Verified Findings & How Used | What Was NOT Used |
|---|---|---|---|
| **`eqdoc/indicato`** (`github.com/eqdoc/indicato`) | **MIT** | Reviewed indicator alignment with candle arrays, warm-up null padding, and look-ahead prevention for SMA/EMA/RSI/ATR. Confirmed our existing `ta-core/1.1` (`technicalAnalysisCore.js` + `technicalIndicators.js`) already enforces warm-up nulls and two-pass variance. | No npm dependency added; zero parallel indicator copy created. |
| **`Bitvested/ta.js`** (`github.com/Bitvested/ta.js`) | **MIT** | Reviewed modular function layout and statistical helper patterns (mean/variance/downside deviation). | No external library bundled; all indicators remain inside `ta-core/1.1`. |
| **`idrisimo/backtestkit`** (`github.com/idrisimo/backtestkit`) | **MIT** | Adapted bar-by-bar event-driven simulation loop concepts (order fill on next bar open, explicit fee/slippage accounting, equity tracking, Sharpe/drawdown calculation) cleanly into our standalone pure-JS `signalBacktester.js`. | No external runtime dependency, no live execution/broker connectors. |
| **`@sopersone` X Post (24 Nov 2026) & `GrokBot Strategy Library` Dashboard** | **Unverified / Not Publicly Accessible** | **Honest Disclosure:** Web search could not locate or verify the specific `@sopersone` X post dated 24 November 2026 or a publicly accessible `GrokBot Strategy Library` dashboard / 25-year backtest table. | **Zero unverified claims, 25-year return numbers, or fabricated rules were invented.** All 5 classical strategies, Hard Gate R:R rules, and backtest metrics in CHART Intelligence are documented transparently and verified solely against real local fixtures and tests. |

---

## 7. Known Limitations & Unresolved Constraints

1. **Instrument Contract/Tick Sizing Approximation:** When broker-specific contract size, tick size, or point-value metadata is absent for an arbitrary TradingView symbol, `calculateInstrumentPositionSizing()` falls back to `UNIT_APPROXIMATION` (exact fractional units = `riskBudgetEur / stopDistance`, capped by `maxLeverage`) and surfaces an explicit notice in the UI (`sizingLimitationNote`) rather than fabricating pip/lot specifications.
2. **Web-Only Implementation (`v1.47.41`):** The new `signal-gen/1.0` + `strategy-sim/2.0` subsystem is currently implemented and verified in the live Web runtime (`host_subdomain/`). Android parity (`StrategySimulatorAlgorithm.kt` / `StrategyLabSheet.kt`) currently remains on `strategy-sim/1.0` and can be mirrored in a dedicated Android parity pass.
3. **Single-Symbol Independent Backtests:** Backtests evaluate each `chart_id` independently (`Initial Equity = EUR 1,000`, `1%` risk, max 1 open position per chart). Cross-symbol portfolio correlation, shared margin pools, and multi-asset concurrent risk caps are out of scope for `strategy-sim/2.0`.
4. **CAGR Horizon Guard:** Intraday histories shorter than 30 calendar days report `CAGR = null` (`N/A (<30d)`) to avoid distorted annualized projections from short samples.
5. **No Live Execution / No Automated Cron Scanning:** By design, signals and backtests run strictly on demand in the browser when requested by the user.
