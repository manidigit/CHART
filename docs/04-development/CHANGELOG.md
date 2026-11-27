# Changelog

All notable changes to the **CHART** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.47.41] - 2026-11-27

### Added (`LEDGER-CLICK-TO-CHART-REPLAY-01`: Interactive Ledger-Click-to-Chart Historical Replay & Realized Candle Comparison)
- **Ledger Snapshot Click-to-Chart Replay (`host_subdomain/assets/js/core/store.js`, `components/chartRenderer.js`, `views/forecastView.js`, `app.js`):**
  - Added `resolveForecastOriginCandleIndex()` and `buildChartForecastPayloadFromLedgerEntry(entry, options)` in `store.js` to reconstruct the exact `N`-bar (`horizonBars`) quantile forecast trajectory (`q10, q25, q50, q75, q90`) anchored at `entry.anchorOpenTimeUtcMs` without fabricating any extra forecast points beyond `entry.horizonBars`, while computing the optimal `scrollOffset` so the chart viewport opens directly on `[originIdx - leadBars .. originIdx + horizonBars .. subsequentRealBars]`.
  - Updated `evaluateOnChartForecastProgress()` and `isStructuralForecastMatchingTab()` in `store.js` to support `isLedgerSnapshotReplay: true` snapshots across any model/horizon, evaluating strictly the `N` predicted candles (`evaluatedBars = Math.min(elapsedBars, horizonBars)`) against the `N` realized candles that formed after `originIdx` and leaving any subsequent real candles (`originIdx + N + 1 .. latestClosedIdx`) untouched as pure realized candles.
  - Updated `chartRenderer.js` to expand Y-axis `rawMin`/`rawMax` whenever the active forecast window `[activeGlobalOriginIdx, activeGlobalOriginIdx + activeHorizonCount]` overlaps the visible candle window `[startIdx, endIdx]` (even when scrolled back in time with `offset > 0`), draw a dashed vertical end boundary at `originIdx + horizonBars` when `elapsedBars > horizonBars`, and label the on-chart badge with `Snapshot #seq` and `Realized +Xb · inBand/evaluated in-band`.
  - Made every row and explicit **«نمایش روی چارت / View on Chart»** button in `renderLedgerPanel()` (`forecastView.js`) clickable via `data-action="view-ledger-entry-on-chart"`, wired in `app.js` to switch to the `Chart` view for that entry's symbol and timeframe, jump the chart viewport to the forecast window, and preserve the replayed snapshot across background candle syncs in `recomputeActiveTabForecast()`.
- **Verification:**
  - Added `LEDGER-CLICK-TO-CHART-REPLAY-01` in `tests/web_parity.test.mjs`; verified `node --check` across all modified JS files and **70/70** passing tests.

### Added (`FCST-LEDGER-03-CLOUD-SYNC-01`: Forecast Ledger Bidirectional Cloud Sync — MariaDB + Offline JSON Fallback & Multi-Device SHA-256 Chain Verification)
- **MariaDB Schema & PHP REST Endpoint (`host_subdomain/migrations/005_phase4_forecast_ledger_sync.sql`, `host_subdomain/api/v1/forecast_ledger_sync.php`):**
  - Added `005_phase4_forecast_ledger_sync.sql` defining `prediction_ledger_entries` (keyed by `(username, forecast_hash)` with `entry_json` preserving multi-model `batchId`, `stepPoints`, `keyZones`, `pathEvents`, `behaviorScenarios`, and `scenarios`) and `prediction_ledger_lifecycle` (keyed by `(username, event_hash)` with `event_json` preserving 5D + 7D `evaluationDetails`), alongside mirroring lifecycle events into `prediction_lifecycle_events`.
  - Created `api/v1/forecast_ledger_sync.php` (`GET` & `POST`) with session-token/owner authentication matching `workspace_sync.php`, automatic table creation, server-side deduplication by `forecastHash` / `eventHash`, chronological sorting (`recordedAtUtcMs`, `seq`), cap enforcement (`120` entries / `240` lifecycle events), and `config/forecast_ledger.local.json` file fallback when MariaDB is offline.
- **Bidirectional Client Sync & Multi-Device SHA-256 Hash Chain Integrity (`host_subdomain/assets/js/forecast/forecastLedger.js`, `services/apiService.js`, `views/forecastView.js`, `app.js`):**
  - Added `ForecastLedger.mergeCloudSnapshot(remoteEntries, remoteEvents)` verifying the cryptographic SHA-256 hash of every incoming cloud record before merging, deduplicating by `forecastHash` / `eventHash`, preserving `evaluationDetails` and `batchId`, and updating `verifyChain()` / `verifyLifecycleChain()` to validate multi-device merged chains whose `prevForecastHash` / `prevEventHash` links to `GENESIS_HASH`, a known entry in the ledger, or the trim anchor.
  - Added `uploadForecastLedgerSync()`, `downloadForecastLedgerSync()`, and `syncForecastLedgerCloud()` in `apiService.js`, wired into `bootstrap()` in `app.js` and automatically triggered after `record-forecast-snapshot`, `record-selected-forecast-models`, `evaluate-forecast-outcomes`, and the **Cloud Sync** (`refresh-forecast-ledger`) button in `renderLedgerPanel()`.
- **Verification:**
  - Added `FCST-LEDGER-03-CLOUD-SYNC-01` in `tests/web_parity.test.mjs`; verified `node --check` across all modified JS files and **69/69** passing tests.

### Added (`FORECAST-MASTER-PLAN-DELTA-01`: Coordinate-Bound Trajectory Behavioral Events, 3-Part Behavior Scenario Contract, OOS Regime Breakdown & Final Holdout, and Strict `AUTO Relative` Path Quality Guard)
- **Coordinate-Bound Trajectory Behavioral Events & 3-Part Behavior Scenario Contract (`host_subdomain/assets/js/forecast/marketContextEngine.js`, `forecastEngine.js`, `forecastLedger.js`, `views/forecastView.js`):**
  - Added `TRAJECTORY_EVENT_TYPES` (`TREND_CONTINUATION`, `PULLBACK`, `RESISTANCE_TEST`, `SUPPORT_REACTION`, `BREAKOUT`, `RETEST`, `RANGE_FORMATION`, `REVERSAL`) and `TRAJECTORY_EVENT_SOURCE` (`MODEL_NATIVE` vs `SYSTEM_DERIVED`), plus `extractTrajectoryBehavioralEvents()` binding every event to exact trajectory step/timestamp/price coordinates (`stepStart`, `stepEnd`, `timestampStart`, `timestampEnd`, `priceLevel`, `priceRange`, `triggerCondition`, `invalidationLevel`, `invalidationCondition`).
  - Added `buildBehaviorScenarioContract()` (`contractVersion: 'behavior-scenario/1.0.0'`) producing `{ basePath, alternativePath, invalidationZone }` connected to the active trajectory, causal `marketContext` S/R zones, and calibrated scenario probabilities (strictly `null` when uncalibrated/not estimable — zero synthetic probabilities).
  - Extended `evaluatePathQualityVector()` with explicit `falsePositiveEventRate` and `missedEventRate`.
  - Wired `pathEvents` and `behaviorScenarios` into `ForecastEngine.project()`, `buildForecastForTab()` (`BASE_RESELECT` cache fast-path), `ForecastLedger.appendFromForecast()`, and `renderOverviewPanel()` (`Simple` and `Research` modes).
- **Walk-Forward OOS Regime Breakdown, Worst Subgroup & Final Untouched Holdout (`host_subdomain/assets/js/forecast/walkForwardEvaluator.js`, `views/forecastView.js`):**
  - Extended `evaluateWalkForward()` to record per-window causal regime tags, `falsePositiveEventRate`, and `missedEventRate`, and report per-model and summary `regimeBreakdown`, `worstRegimeSubgroup`, and `finalHoldoutSummary` (last 20% untouched outer OOS windows), rendered in `renderBacktestPanel()` (`fc-regime-holdout-card`).
- **Strict `pathQualityScore` Guard in `AUTO Relative` (`host_subdomain/assets/js/forecast/decisionLayer.js`):**
  - Enforced Master Plan §6.5 / `D-06`: `resolveRelativeCandidate()` rejects any `AUTO_RELATIVE_PROVISIONAL` candidate whose primary `pathQualityScore` is materially worse than `naive_persistence`'s `naivePathQualityScore` (`pathQualityScore + 1.0 < naivePathQualityScore`).
- **Documentation & Verification (`docs/01-product/TRADING_STRATEGY_SPEC.md`, `FORECAST_SYSTEM_SPEC_V1.md`, `SIGNAL_GENERATOR_AND_RR_INTELLIGENCE_V1.md`, `FORECAST_AND_STRATEGY_IMPROVEMENT_MASTER_PLAN.md`, `FORECAST_AND_STRATEGY_ISSUES_REPORT.md`):**
  - Resolved the §3.5 documentation contradiction in `TRADING_STRATEGY_SPEC.md` Section 12 and synchronized all upstream Forecast/Strategy specs.
  - Added `FORECAST-MASTER-PLAN-DELTA-01` in `tests/web_parity.test.mjs`; verified `node --check` across all modified JS files and **68/68** passing tests.

### Added (`FORECAST-P3-STRATEGY-BRIDGE-PURGED-WF-01`: Phase P3 Controlled Forecast → Strategy Bridge, Purged Walk-Forward + Final Untouched Holdout, Regime Breakdown & Portfolio Risk Controls)
- **Controlled One-Way Forecast → Strategy Bridge (`host_subdomain/assets/js/strategy/forecastStrategyBridge.js`, `algorithms/strategySimulator.js`, `views/strategyLabView.js`, `app.js`):**
  - Created `forecastStrategyBridge.js` (`FORECAST_STRATEGY_BRIDGE_VERSION = 'forecast-strategy-bridge/1.0.0'`, `evaluateForecastStrategyBridge()`) enforcing all 8 mandatory passage gates (§10.2 & `S-01..S-06`):
    1. Blocks `DATA_NOT_READY`, `INSUFFICIENT_EVIDENCE`, `PROVISIONAL` (`S-04`), and `NO_EDGE` forecasts with explicit `status: 'no_trade'` and specific `BRIDGE_REJECTION_CODE`.
    2. Requires `decisionSummary.status === 'VALID'`, `edgeStatus === 'PROVEN'`, and `allowStrategy === true`.
    3. Blocks `experimentalOnly` / `EXPERIMENTAL_APPROX` models (`FORECAST_EXPERIMENTAL_MODEL_BLOCKED`).
    4. Verifies exact `symbolCode`/`timeframe` context match and non-baseline provenance (`inputHash`, `modelId`, trajectory points).
    5. Verifies causal origin freshness (`anchorOpenTimeUtcMs` matching latest closed bar within `maxStaleBars`).
    6. Derives directional displacement (`>= minProjectedAtrMult * ATR14`) and anchors Stop Loss to real causal market structure (`buildCausalStructureAtIndex` confirmed swing lows/highs and S/R zones).
    7. Evaluates the bridge candidate through the independent `evaluateRiskRewardTradePlan()` Hard Gate (`S-01` closed-bar decision / `NEXT_BAR_OPEN_ONLY` execution, `S-03` nearest causal structural TP1 without skipping closer barriers, round-trip Spread + Commission + Slippage costs, and `S-02`/`S-05` immutable `Net R:R >= 2.00`).
    8. Supports opt-in Research preview (`allowResearchPreview: true`) returning a non-actionable `researchPreview` (`isPreviewOnly: true`, `actionable: false`, `status: 'no_trade'`) when Forecast edge is not proven, and attaches full `forecastProvenance` to validated bridge signals.
  - Updated `open-strategy-from-forecast` in `app.js` to open the Strategy Lab modal (`state.activeModal = 'strategy-lab'`) directly when `decisionSummary.allowStrategy === true`, and added the **Controlled Forecast → Strategy Bridge** card + one-click chart plotting to `strategyLabView.js`.
- **Strategy Purged Walk-Forward + Embargo + Final Untouched Holdout, Regime Breakdown & Portfolio Risk Policy (`host_subdomain/assets/js/strategy/signalBacktester.js`, `views/strategyLabView.js`):**
  - Preserved 100% independence of all 5 classical strategies (`S-06`) and existing 70/30 `inSampleOutOfSample` split.
  - Added `purgedWalkForward` (`PURGED_WALK_FORWARD_WITH_UNTOUCHED_HOLDOUT_V1`) reserving the final 20% of closed bars as an `untouchedHoldout` separated by `purgeBars + embargoBars`, and evaluating 3 chronological OOS folds separated by `purgeBars + embargoBars` across the pre-holdout window.
  - Added causal `regimeBreakdown` classifying each trade at its decision bar into `TREND_UP`, `TREND_DOWN`, `RANGE`, `EXPANSION`, or `COMPRESSION`.
  - Added `portfolioRiskPolicy` (`scope: 'SINGLE_INSTRUMENT_BACKTEST'`, `multiSymbolCorrelationSupported: false`, `sizingMode: 'UNIT_APPROXIMATION'`, `maxConcurrentPositions: 1`) and optional `maxDrawdownHaltPct` circuit-breaker support in `executeSignalsPass()`.
- **Verification:**
  - Added `FORECAST-P3-STRATEGY-BRIDGE-PURGED-WF-01` in `tests/web_parity.test.mjs`; verified `node --check` across all modified/created JS files and **67/67** passing tests.

### Added (`FORECAST-P1-PATH-QUALITY-MARKET-CONTEXT-01`: Phase P1 Causal Market Context Engine, 7-Dimensional Path Quality Vector & Ledger/Evaluation Alignment)
- **Shared Causal Market Context & Structure Engine (`host_subdomain/assets/js/forecast/marketContextEngine.js`, `forecastEngine.js`):**
  - Created `marketContextEngine.js` (`MARKET_CONTEXT_ENGINE_VERSION = 'market-context/1.0.0'`, `buildCausalMarketContext()`) providing a unified, model-independent causal structure layer with explicit `occurredAt` and `confirmedAt` timestamps (`confirmIndex = index + swingLen`) across Swings (`ACTIVE` vs `UNCONFIRMED`), `BOS` / `CHoCH` breaks, `SUPPORT_ZONE` / `RESISTANCE_ZONE` lifecycle (`ACTIVE` / `INVALIDATED`), Liquidity (`EQH/EQL`, `FVG`, and `Volume Profile` returning `UNAVAILABLE` when real volume is absent), and Regime/Volatility classification (`TREND_UP`, `TREND_DOWN`, `RANGE`, `EXPANSION`, `COMPRESSION`, `UNKNOWN`).
  - Integrated `marketContext` into `ForecastEngine.project()` output.
- **7-Dimensional Path Quality & Market Behavior Evaluator (`marketContextEngine.js`, `walkForwardEvaluator.js`):**
  - Implemented `evaluatePathQualityVector()`, `extractSeriesTurningPoints()`, and `computePullbackAndRangeMetrics()` measuring 7 independent trajectory dimensions on identical origins and horizons: (1) Stepwise & Terminal Price Error (`stepMae`, `stepRmse`, `volAdjustedMaeAtr`), (2) Turning Point Agreement & Timing/Price Error (`turningPointAgreementPct`, `turningTimingErrorBars`, `turningPriceErrorAtr`, `falseTurns`, `missedTurns`), (3) 3-Segment Wave Direction Similarity (`segmentDirectionSimilarityPct`), (4) Pullback Depth Error (`pullbackDepthErrorAtr`), (5) Pullback/Range Duration Error (`pullbackDurationErrorBars`), (6) Amplitude & Volatility Span Ratio (`amplitudeRatio`, `amplitudeErrorAtr`), and (7) Behavioral Pattern Match & Composite Score (`actualBehavior`, `predictedBehavior`, `behaviorMatch`, `pathQualityScore` 0–100).
  - Integrated 7D Path Quality into `evaluateWalkForward()` across all models and `naive_persistence`, plus `walkForward.pathQualitySummary`.
- **Ledger & Evaluation Panel Alignment (`forecastLedger.js`, `views/forecastView.js`):**
  - Extended `ForecastLedger._computeMultiDimensionalEvaluation()` and `buildModelScorecards()` with 7D `pathQuality`, `pathQualityScore`, `meanPathQualityScore`, `meanTurningAgreementPct`, and `meanSegmentSimilarityPct` without mutating original immutable snapshot hashes, plus `getStorageStatus()` local-only/quota telemetry.
  - Updated `renderBacktestPanel()` and `renderLedgerPanel()` in `forecastView.js` with the 7D Path Quality Summary Card (`fc-path-quality-7d-card`), Causal Market Context Card (`fc-market-context-card`), benchmark table columns (`Path Q`, `Turn %`, `Wave Sim`, `PB Err`), and explicit local browser ledger capacity disclosure.
- **Verification:**
  - Added `FORECAST-P1-PATH-QUALITY-MARKET-CONTEXT-01` in `tests/web_parity.test.mjs`; verified `node --check` across all modified/created JS files and **66/66** passing tests.

### Added (`FORECAST-P0-DECISION-SIMPLE-RESEARCH-01`: Phase P0 Data Readiness Contract, Model Governance, Centralized 4-Step Decision Layer & Simple vs Research Forecast UX)
- **5-State Data Readiness Contract & TradingView Provider Alignment (`host_subdomain/assets/js/forecast/forecastContract.js`, `forecastEngine.js`):**
  - Added explicit `DATA_READINESS_STATE` (`READY`, `INSUFFICIENT_HISTORY`, `STALE_DATA`, `DATA_GAP`, `DATA_NOT_READY`), `missingBarsCount`, and session-aware stale telemetry (`staleTelemetry: { isStale, ageMs, thresholdMs }`, with opt-in `enforceStaleData: true`) to `validateDataReadiness()`.
  - Updated default `providerId` fallback in `forecastContract.js` and `ForecastEngine.project()` from `'twelvedata'` to `'tvdatafeed'`.
- **Model Governance Tiers & Path Semantics (`forecastContract.js`, `modelRegistry.js`, `models/advancedNativeModels.js`, `forecastEngine.js`):**
  - Added `MODEL_GOVERNANCE_TIER` (`BASELINE`, `PRIMARY_STRUCTURAL`, `STATISTICAL`, `ENSEMBLE`, `EXPERIMENTAL_APPROX`, `EXTERNAL_SHELVED`), `MODEL_LIFECYCLE_STATE`, `PATH_SEMANTICS` (`MARGINAL_MEDIAN` vs `JOINT_TRAJECTORY`), and `resolveModelGovernance()`.
  - Explicitly tagged approximate models (`native_prophet_decomp`, `native_seq_recurrent_approx`, `native_quantile_attention_approx`) with `experimentalOnly: true`, `governanceTier: 'EXPERIMENTAL_APPROX'`, and `lifecycleState: 'EXPERIMENTAL'`, keeping them strictly excluded from `AUTO`, `Ensemble`, and Strategy eligibility.
- **Centralized 4-Step Forecast Decision Layer (`host_subdomain/assets/js/forecast/decisionLayer.js`, `walkForwardEvaluator.js`, `forecastEngine.js`, `views/forecastView.js`):**
  - Created `decisionLayer.js` (`buildDecisionSummary()`, `resolveRelativeCandidate()`, `resolvePathSemantics()`) as the single source of truth for Forecast status (`DATA_NOT_READY` → `INSUFFICIENT_EVIDENCE` → `VALID` strict 6-gate winner → `PROVISIONAL` relative candidate or caution → `NO_EDGE` + Baseline), `edgeStatus` (`PROVEN`, `NOT_PROVEN`, `UNKNOWN`), `confidence`, `pathSemantics`, and `allowStrategy` (strictly `true` **only** when `status === VALID && edgeStatus === PROVEN`).
  - Extended `selectOosChartWinner()` with `SELECTION_MODE.AUTO_RELATIVE_PROVISIONAL` when no strict 6-gate winner exists but an eligible non-experimental candidate beats `Naive` on `WIS` and `rMAE < 1.0` without calibration collapse (`winnerModelId: null`, `status: PROVISIONAL`, `edgeStatus: NOT_PROVEN`, `allowStrategy: false`).
  - Enforced that manual model selection (`MANUAL_OVERRIDE`) displays the user-requested model when technically valid, but never upgrades scientific validity or Strategy eligibility.
- **Simple vs Research Forecast UX (`host_subdomain/assets/js/views/forecastView.js`, `app.js`, `assets/css/theme.css`):**
  - Added unified `renderDecisionCard()` fed strictly by `fc.decisionSummary` and a top `Simple / Research` mode toggle (`set-forecast-ux-mode`, defaulting to `Simple`).
  - **Simple Mode (default):** Displays the Decision Card, a single clean primary path + calibrated 80% range on `#forecast-studio-canvas` (zero multi-model comparison overlays), and a 3-button action bar (`Compare Models / Research`, `History & Ledger`, and `Generate Strategy Signal?` disabled with inline explanation unless `decisionSummary.allowStrategy === true`).
  - **Research Mode (opt-in):** Displays the scientific evaluation disclaimer banner (`برای ارزیابی علمی، نه تصمیم روزمره`), full model/horizon/compare Controls Drawer with `Research-only / Experimental` badges, all 4 sub-tabs, and diagnostic accordions.
- **Verification:**
  - Added `FORECAST-P0-DECISION-SIMPLE-RESEARCH-01` in `tests/web_parity.test.mjs`; verified `node --check` across all modified/created JS files and **65/65** passing tests.

### Added (`LIVE-FORECAST-COMPARE-REFRESH-01`: Live On-Chart Forecast Persistence, Candle-by-Candle Realized Comparison & Refresh Keep Previous)
- **On-Chart Forecast Persistence & Live Progress Evaluation (`host_subdomain/assets/js/core/store.js`, `services/structuralForecastService.js`):**
  - Updated `isStructuralForecastMatchingTab(tab, payload, { requireLatestOrigin, allowAnyModel, allowAnyHorizon })` so an active forecast anchored on a closed origin candle **remains plotted on the main chart** as newer candles form and close (e.g., via 15m live background sync), while preserving strict origin-candle close integrity checks and `requireLatestOrigin: true` for fresh computation/cache hits in `structuralForecastService.js`.
  - Added `evaluateOnChartForecastProgress()` to compute live candle-by-candle comparison metrics (`elapsedBars`, `evaluatedBars`, `inBandCount`, `hitRatePct`, `meanErrPct`, `latestDirMatch`, per-bar `items`) plus `pinCurrentForecastAsPrevious()` (deduplicated, capped at 3), `isPinnedPreviousForecastMatchingTab()`, and `clearTabPinnedForecasts()`.
- **Canvas Live Comparison & Pinned Previous Forecast Overlays (`host_subdomain/assets/js/components/chartRenderer.js`):**
  - Fixed `forecastHorizonSlots`, X-axis `timeAxisItems`, and crosshair future step indexing to align cleanly when `elapsedBars > 0` (eliminating empty right-edge drift as real candles progress through the forecast horizon).
  - Rendered live deviation stems and green/red in-band hit/miss markers on realized closed candles, live accuracy stats in the in-chart forecast badge, floating `Pred vs Real` crosshair tooltips on realized candles, and dashed pinned previous forecast paths (`Prev #1..#3`) with origin markers and accuracy labels.
- **On-Chart Refresh (Keep Previous) Controls (`host_subdomain/assets/js/app.js`, `assets/css/theme.css`):**
  - Upgraded the active Forecast overlay pill in `renderOhlcvOverlay()` with live realized progress (`+N کندل · X/Y در بازه` / `+N bars · X/Y in-band`), an inline **`↻ رفرش (حفظ قبلی)` / `↻ Refresh (Keep Prev)`** action (`refresh-forecast-keep-previous`) that syncs the latest closed candle, pins the previous forecast on chart, and plots the updated/self-corrected forecast from the latest candle, plus a removable **`پیش‌بینی قبلی (N) ✕` / `Prev Forecast (N) ✕`** pill (`clear-pinned-forecasts`).
  - Triggered immediate UI refresh after background candle sync completes so live comparison badges update automatically as candles close.
- **Verification:**
  - Added `LIVE-FORECAST-COMPARE-REFRESH-01` regression test in `tests/web_parity.test.mjs`; verified `node --check` on all modified JS files and **64/64** passing tests.

### Fixed (`LIVE-FORECAST-COMPARE-REFRESH-01` Hotfix)
- **Chart Forecast Overlay `ReferenceError: pills is not defined` (`host_subdomain/assets/js/app.js`):**
  - Replaced two mistaken `pills.push(...)` calls inside `renderOhlcvOverlay()` (for `.tv-ind-pill-forecast` and `.tv-ind-pill-prev`) with the declared `indPills.push(...)` array, and added a static regression guard in `tests/web_parity.test.mjs`.

### Changed (`FORECAST-UX-SIMPLIFY-03`: Everyday Forecast UX Simplification, Duplicate Guard, Clean History Table & Explicit Model Comparison)
- **Duplicate Snapshot Prevention (`host_subdomain/assets/js/forecast/forecastLedger.js`, `app.js`):**
  - Added `findRecentDuplicateEntry()` matching same symbol + timeframe + horizon + model on the same closed anchor candle or within a 5-minute window, with opt-in `options.preventDuplicate` in `appendFromForecast()` and `appendBatchFromForecast()` (enabled on UI snapshot/batch clicks with clear FA/EN duplicate notifications while preserving append-only SHA-256 chain integrity and backward compatibility for programmatic callers).
  - Annotated historical duplicates in Ledger display with a `Hide Duplicates (N)` toggle (`toggle-ledger-hide-duplicates`, enabled by default) and `تکراری (#X)` / `Duplicate (#X)` badge when visible.
- **Simplified History Table & Explicit Multi-Model Comparison (`host_subdomain/assets/js/views/forecastView.js`, `app.js`):**
  - Streamlined the Ledger history table to 7 readable columns: Select, Model, Recorded → Due, Target & Range, Actual Price, Successful Candles (`X/Y` + `%` + `Err %`, with `Legacy` fallback), and plain-language Result (`موفق` / `ناموفق` / `در انتظار` or `Success` / `Failed` / `Pending`).
  - Added a prominent **«مقایسه مدل‌های انتخاب‌شده» / «Compare Selected Models»** toolbar button (`compare-selected-ledger-entries`) supporting both manually checked rows (2–4 rows) and recorded multi-model batches inside `#ci-fc-compare-card`, displaying outcome, hit candles, error `%`, target vs. actual, and crowning **«★ مدل برتر این بازه» / «★ Best Performer»**.
- **Decluttered Main Forecast View (`forecastView.js`, `app.js`):**
  - Replaced heavy technical badges (`INSUFFICIENT_EVIDENCE`, `NO_EDGE_DETECTED`, `OOD: IN_DISTRIBUTION`, `EWMA σ`, `spec v2.1.0`) in the primary Forecast header with clean plain-language status and market condition pills (keeping full technical context in tooltips and drawers).
  - Moved heavy technical diagnostics (OOS Selection Gate, full model grid, 3-Scenario Conditional Logit/Brier/Dirichlet, Key Zones, Conformal/Aleatoric/Epistemic/MTF/Analogs, Rolling Model Scorecards, and SHA-256 audit log) into collapsed `<details class="ci-fc-accordion">` drawers.
- **Verification:**
  - Added `FORECAST-UX-SIMPLIFY-03` regression tests in `tests/web_parity.test.mjs`; verified `node --check` on all modified JS files and **63/63** passing tests.

### Changed (`TOPBAR-RIGHT-NAV-DOCK-01`: Right-Docked Topbar Workspace Navigation & Expanded Chart Tab Strip)
- **Right-Docked Workspace Navigation (`host_subdomain/assets/js/views/headerView.js`, `assets/css/theme.css`):**
  - Moved the workspace navigation group (`.tv-top-nav-group`: `Chart`, `Forecast`, `Strategy`, `Performance`, `Watchlist`, `Settings`) from `.tv-topbar-left` to the leading edge of `.tv-topbar-right` directly adjacent to the status dot, `CSV`, snapshot, sync, and fullscreen buttons (separated by `.tv-divider`) across both Chart and Forecast views, eliminating the unused middle-right gap in the header.
  - Expanded `.tv-open-tabs-strip` from the tight `flex: 0 1 280px; max-width: 340px` (`245px` under `1400px`) cap to `flex: 0 1 auto; max-width: min(680px, 100%)` (`min(520px, 100%)` under `1400px`) so multiple open chart tabs render comfortably in the newly freed left space, with automatic icon-only nav compaction at `@media (max-width: 1080px)` and `flex-shrink: 0` on primary topbar buttons.
- **Verification:**
  - Extended `TOPBAR-DROPDOWNS-STRATEGY-01` in `tests/web_parity.test.mjs` to verify `.tv-top-nav-group` placement inside `.tv-topbar-right` in both Chart and Forecast views plus the flexible `.tv-open-tabs-strip` CSS rules; verified `node --check` and **62/62** passing tests.

### Added (`SIGNAL-GEN-RR-GATE-01`: Classical Signal Generators, Immutable Net R:R ≥ 2.0 Hard Gate & `strategy-sim/2.0`)
- **Non-Negotiable Risk/Reward Intelligence Hard Gate (`host_subdomain/assets/js/strategy/riskRewardEngine.js`):**
  - Enforced immutable `MINIMUM_REQUIRED_RR = 2.0` (`enforceMinimumRequiredRR()`) across engine, backtester, and UI controls; trades with `Net R:R < 2.0` after `Spread + Commission + Slippage` are strictly rejected (`status: 'no_trade'`).
  - Anchored Stop Loss and Take Profit (`TP1` + optional `TP2`) exclusively to real causal swings & S/R zones (`buildCausalStructureAtIndex`) with an explicit anti-TP-fabrication rule (never skipping a closer structural barrier to manufacture `2R`/`3R`), anti-chase guard, and closed-candle enforcement (`OPEN_BAR_FORBIDDEN`).
- **5 Independent Pure Causal Classical Signal Generators on `ta-core/1.1` (`classicalGenerators.js`, `signalEngine.js`):**
  - Implemented `trend_pullback_v1`, `rsi_reversion_v1` (supporting both `RSI(14)` `30/35/40` and `Connors RSI(2) < 10` with dedicated `Close > SMA(5)` exit rule), `breakout_v1` (strictly causal prior `[i-N..i-1]` Donchian breakout + fakeout/volume/ATR filters), `sma_crossover_v1` (`20/50` & `50/200`), and `rsi_dip_v1` (transparently tagged **Research Comparison Baseline**).
- **Event-Driven Backtester & Multi-Strategy Comparison (`signalBacktester.js`, `strategySimulator.js`):**
  - Added `strategy-sim/2.0` with next-bar-open causal fills, opening-gap invalidation guard, `SL_BEFORE_TP` tie-breaker, parallel `Gross (0x)` & `Net (1x)` + `1.5x / 2.0x` Cost Sensitivity, `CAGR` (gated to ≥ 30-day span), chronological `70/30 In-Sample / Out-of-Sample` split, `RR-Rejected Count`, `Avg Accepted Net RR`, and side-by-side `compareAllClassicalStrategies()` while preserving full backward compatibility with `strategy-sim/1.0`.
- **Upgraded 4-Tab Strategy Lab UI & HTML5 Canvas Signal Overlay (`strategyLabView.js`, `chartRenderer.js`, `store.js`, `app.js`, `theme.css`):**
  - Upgraded Strategy Lab to 4 tabs (`Signal & Backtest`, `Compare All (5)`, `Valid Signals`, `Diagnostics / NO TRADE`) with live `VALID` / `NO TRADE` status banner, per-strategy parameter controls, locked `Min Net R:R ≥ 2.00` gate, and one-click **Show on Chart** overlay.
  - Added validated-only Signal Overlay rendering (`Entry`, `SL`, `TP1`, `TP2`, Risk/Reward shaded zones, anchor arrow, right-axis price badges, and removable status pill) directly in `chartRenderer.js` — rejected / `NO TRADE` candidates are never plotted as buy/sell arrows.
- **Documentation & Verification:**
  - Created [`docs/02-architecture/SIGNAL_GENERATOR_AND_RR_INTELLIGENCE_V1.md`](../02-architecture/SIGNAL_GENERATOR_AND_RR_INTELLIGENCE_V1.md) (including external MIT source audit and honest disclosure that the `@sopersone` X post / `GrokBot Strategy Library` dashboard was not publicly verifiable) and updated `TRADING_STRATEGY_SPEC.md`, `OPEN_ISSUES.md`, `docs/README.md`, `AGENTS.md`, and `README.md`.
  - Verified `node --check` on all 9 new/modified JS modules and **62/62** passing tests in `tests/web_parity.test.mjs` (added `SIGNAL-GEN-RR-GATE-01`).

### Changed (`TOPBAR-DROPDOWNS-STRATEGY-01`: TradingView-Style Topbar Dropdowns & Top-Nav Strategy Lab)
- **Compact TradingView-Style Timeframe & Chart Style Dropdowns (`host_subdomain/assets/js/views/headerView.js`, `app.js`, `assets/css/theme.css`):**
  - Replaced the flat 6-button timeframe strip (`15m..1W`) and the 2-button chart-type group (`Candles / Line`) in `renderTopHeaderBar()` with compact TradingView-style dropdown triggers (`data-action="toggle-top-dropdown"`, `timeframe` and `chart-type`) displaying the active selection + chevron caret.
  - Rendered popover menus (`.tv-topbar-dropdown-menu`) with `position: fixed` and dynamic viewport-clamped anchor positioning (`positionActiveTopDropdown()`) so menus never clip under `.tv-topbar { overflow: hidden; }` or `.tv-topbar-left { overflow-x: auto; }`, dismissing cleanly on option click, outside click, or `Escape`.
- **Strategy Lab Promoted to Top Workspace Nav (`headerView.js`, `toolRailView.js`, `app.js`):**
  - Moved the **Strategy (`استراتژی`)** trigger (`data-modal="strategy-lab"`) out of the desktop left drawing tool rail (`renderLeftToolRail()`) and into `.tv-top-nav-group` right next to **Forecast (`پیش‌بینی`)**, and enabled `renderStrategyLabModal(activeTab, i18n)` across both Chart and Forecast workspaces (keeping the mobile tools sheet shortcut intact).
- **Verification:**
  - Verified `node --check` on all modified JS modules and **61/61** passing tests in `tests/web_parity.test.mjs` (added `TOPBAR-DROPDOWNS-STRATEGY-01`).

### Added & Changed (`FORECAST-UX-EVAL-CHECKLIST-01`: Forecast Studio UX Overhaul, 5D Evaluation, Multi-Model Batch Comparison & Visual Replay)
- **Top Summary Status Card & Collapsible Diagnostic Accordions (`host_subdomain/assets/js/views/forecastView.js`, `assets/css/theme.css`):**
  - Added `renderForecastSummaryHeaderCard()` at the top of `Overview` and `Ledger` displaying symbol, timeframe, current anchor price, Pending vs. Matured counts, Market Condition tag, plain-language directional/confidence status, and `computeMultiModelZoneConvergence(fc)` multi-model target/band agreement.
  - Wrapped heavy technical diagnostics (`Conformal Calibration`, `Edge Gate`, `Aleatoric/Epistemic Uncertainty`, `MTF check`, `Empirical Analog Medoids`) in `renderOverviewPanel()`, raw `Walk-Forward` benchmark & sensitivity tables in `renderBacktestPanel()`, and raw `SHA-256` hash-chain / lifecycle logs in `renderLedgerPanel()` inside collapsible `<details class="ci-fc-card ci-fc-accordion">` panels so primary screens stay focused on recording and comparing forecasts.
- **5-Dimensional Forecast Evaluation & 4 Analytical Intelligence Enhancements (`host_subdomain/assets/js/forecast/forecastLedger.js`):**
  - Enriched `appendFromForecast()` with explicit `batchId`, `batchSize`, `modelId`, `modelName`, `recordedAtUtcMs`, `maturesAtUtcMs`, `atrAtAnchor`, `baselineTerminalQ50`, `driftBaselineTerminalQ50`, `marketConditionTag` (`TRENDING_EDGE`, `TRENDING_NO_EDGE`, `RANGING_EDGE`, `RANGING_NO_EDGE`), `stepPoints`, and `keyZones`.
  - Upgraded `evaluateMaturedForecasts()` with `_computeMultiDimensionalEvaluation()` calculating **5 evaluation dimensions**: (1) Trend/Direction accuracy, (2) Candle-by-Candle `[q10..q90]` band hit rate & `Q50 MAE%`, (3) Support/Resistance zone reaction (`TOUCHED`, `BOUNCE_HELD`, `BROKEN`, `UNTESTED`, `NO_ZONES`), (4) Terminal interval containment, and (5) `0–100` `overallScore` — alongside **4 analytical enhancements**: volatility-adjusted error (`×ATR`), Naive Persistence baseline comparison (`vs Naive`), early invalidation detection (`earlyInvalidatedAtStep`), and market-condition tagging.
- **Simultaneous Multi-Model Batch Snapshotting, Rolling Scorecards, History Filters & Visual Replay Overlay (`forecastLedger.js`, `forecastView.js`, `app.js`):**
  - Added `appendBatchFromForecast()` and `Record Selected Models` (`data-action="record-selected-forecast-models"`) to snapshot multiple checked models simultaneously under a shared `batchId` and anchor candle.
  - Replaced disconnected `SEQ` tables in `renderLedgerPanel()` with a **Unified Snapshot ↔ 5D Outcome Table** (exact UTC `Recorded At`, `Horizon & Matures At`, `Observed Close & Evaluated At`, color-coded status badges), a **Rolling 20-Forecast Model Scorecard** (`buildModelScorecards(20, activeSymbol)`), **History Filters** (`Model`, `TF & Horizon`, `Status`, `Market Condition`), a transposed **Side-by-Side Batch Comparison** table crowning `Best Performer ★`, and an interactive **`#forecast-ledger-overlay-canvas` Visual Replay Overlay** (`buildLedgerOverlayPayload`) plotting up to 4 recorded trajectories directly over realized market candlesticks.
  - Wired automatic idempotent ledger maturity checks during Forecast Studio rendering and verified **59/59** passing Web parity tests (`FORECAST-UX-EVAL-CHECKLIST-01`) + clean Android `compile_applet`.

### Fixed (`FORECAST-LEDGER-UX-BUGFIX-02`: Forecast Studio Ledger Bugs, Duplicate Controls, Column Clipping & Visual Replay Alignment)
- **Active-Model Snapshot Recording & Batch Collision Prevention (`host_subdomain/assets/js/forecast/forecastLedger.js`, `host_subdomain/assets/js/app.js`):**
  - Removed the `nativeTab === 'overview'` preview gate on `Structural JS` and `SMC Prediction Engine` in `app.js` so `state._forecastCanvasPayload` always reflects the currently selected model on `Ledger`, `Models`, and `Backtest` subtabs (eliminating silent fallback to `RBF Gaussian Process`).
  - Fixed `appendFromForecast()` to prioritize `options.points` over cached `forecastResult.summary` for `terminalMedian`/`terminalQ10`/`terminalQ90`/`horizonBars` and separated wall-clock `recordedAtUtcMs` from hashable `generatedAtUtcMs` so consecutive snapshots produce unique `SNAP-...` IDs without breaking SHA-256 hash chains.
  - Hardened `appendBatchFromForecast()` with `options.requireMultiple` (requiring at least 2 distinct models for a multi-model batch, otherwise showing an explicit toast), wall-clock `batchTimestampMs` + `nextSeq` suffixing to prevent cached `Batch ID` collisions across clicks, and per-`modelId` deduplication in `renderLedgerPanel()` / `#forecast-ledger-overlay-canvas`.
- **Ledger Outcome Integrity, Legacy Matured Entries & Overflow Fix (`host_subdomain/assets/js/views/forecastView.js`, `host_subdomain/assets/css/theme.css`):**
  - Restricted `obsClose` strictly to matured terminal evaluations (`item.isFullMatured && item.termEv?.observedClose != null`), eliminating false `SUPERSEDED` anchor closes (`+0.00%`) leaking into the `Actual` column of pending rows.
  - Added legacy matured evaluation fallback (`Trend ✓/✗`, `Band IN/OUT`, `Err %`, `Naive %`, `75/100` or `30/100`, `Legacy`) and inferred `maturesAtUtcMs` for older pre-5D matured records so they no longer falsely display `Awaiting maturity candle` or `Due —`.
  - Replaced clipped wide `nowrap` table cells with compact `MM-DD HH:MM` UTC timestamps and wrapping `.ci-fc-ledger-table` / `.ci-fc-wrap-cell` / `.ci-fc-eval5d-cell` rules so `5D Evaluation` and `Status` columns remain fully visible without horizontal clipping.
- **UI Deduplication & Visual Replay Palette Parity (`app.js`, `forecastView.js`, `theme.css`):**
  - Removed duplicate `Record Selected Models` (top bar) and `Record Current Snapshot` (Ledger header) buttons, collapsed the heavy model/compare controls into a 1-line summary `<details class="ci-fc-controls-drawer">` on non-Overview subtabs, tucked the `Legacy capabilities` notice into a compact collapsed `<details class="ci-fc-legacy-disclosure">`, and excluded `structural_wave_js` from `Compare Overlays` when `Structural JS` is active.
  - Unified `LEDGER_OVERLAY_PALETTE` colors between the Visual Replay Overlay legend and `#forecast-ledger-overlay-canvas` lines and keyed trajectories by `snap_${entry.seq}_${entry.modelId}` so multiple snapshots of the same model render distinctly.
- **Verification:**
  - Verified `node --check` on all modified JS files and **60/60** passing tests in `tests/web_parity.test.mjs` (added `FORECAST-LEDGER-UX-BUGFIX-02`).

### Documentation & Repository Hygiene (`REPO-CLEANUP-2026-11-21`)
- **Removed Dead Directories & Superseded Docs (Owner-Approved with External Backup):**
  - Permanently deleted obsolete `/archive/` directory, unused `public/assets/aistudio/` assets, and stale `.kotlin/errors/` log folder while preserving all `Chronos-2` (`Shelved`) files and CI hooks per owner direction.
  - Deleted 11 superseded/duplicate documentation files (`FORECAST_STUDIO_PRODUCT_DIRECTION_V2.md`, `FUTURE_PRICE_PROJECTION_ENGINE_SPEC.md`, `CHART_FUTURE_PREDICTION_SPEC_v1.3.0.md`, `FORECAST_ENGINE_V2_SPEC.md`, `SMC_ANALOG_ENGINE_REFACTOR_SPEC.md`, `FORECAST_GEMINI_IMPLEMENTATION_HANDOFF_V1.md`, `FORECAST_CURRENT_STATE_AUDIT_V1.md`, `FORECAST_LEGACY_PARITY_MATRIX_V1.md`, `FORECAST_MIGRATION_PLAN_V1.md`, `AUDIT_CHECKLIST_v1.40.1.md`, and `docs/KNOWN_ISSUES_BACKLOG.md`).
  - Added [`docs/02-architecture/FORECAST_CONSISTENCY_AND_ANALOG_ANALYSIS_V1.md`](../02-architecture/FORECAST_CONSISTENCY_AND_ANALOG_ANALYSIS_V1.md) documenting the cross-timeframe (`H1×60` vs `H4×15`) and horizon prefix-invariance root-cause analysis for ongoing discussion.
  - Reconciled all surviving entry-point documents (`README.md`, `docs/README.md`, `CHART_INTELLIGENCE_MASTER_SPEC.md`, `FORECAST_SYSTEM_SPEC_V1.md`, `FORECAST_MODEL_INTAKE_AND_COMPARISON_V1.md`, `FORECAST_ACCEPTANCE_TEST_PLAN_V1.md`, `OPEN_ISSUES.md`, `ROADMAP_BACKLOG.md`, `AGENTS.md`, and `PROJECT_GUIDE.md`) to `v1.47.41` (`51/51` passing web tests) with zero broken links.
- **MariaDB-Only Candle Storage & Host File Cleanup (`MARIADB-ONLY-CLEANUP-2026-11-21`):**
  - Permanently deleted `host_subdomain/data/tvdatafeed/` (all 10 static `SPOTBRENT` CSV & JSON files, ~5.4 MB) so MariaDB (`candles` table) is the single source of truth for candle history while preserving `host_subdomain/data/chronos2/cache/` (`Shelved`).
  - Extracted a compact 260-bar unit-test fixture (`tests/fixtures/spotbrent_m15_sample.json`, ~57 KB, never deployed to host) and updated `tests/web_parity.test.mjs`.
  - Removed all disk CSV/JSON reading, writing (`persistNormalizedJson`, `readFromNormalizedJson`, `readFromCsvFile`), and Python `exec()` fallback from `TvDatafeedAdapter.php`; removed `STATIC_SEED` file fallback from `apiService.js` and `tvdatafeed_cache` fallback from `status.php`.
  - Refactored `host_subdomain/scripts/cron_sync_tvdatafeed.php` into a pure-PHP incremental TradingView WebSocket → MariaDB upserter using canonical `candles` schema columns (`open_time_utc`, `is_closed`) with zero disk files.
  - Moved `sync_tvdatafeed.py` out of `host_subdomain/scripts/` to `scripts/sync_tvdatafeed.py` (CI-only for the shelved `chronos2-manual-forecast.yml` `$RUNNER_TEMP` step), removed static extraction/JSON seeding from `.github/workflows/build-apk.yml`, and added automatic removal of stale host `data/tvdatafeed/` files on deploy.
- **Technical Analysis Core — Phases A & B (`TA-CORE-AB-01` — Web & Android Parity + Renderer Decoupling):**
  - Created UI-independent deterministic analysis core layers on both platforms: `app/.../algorithms/TechnicalAnalysisCore.kt` (Android) and `host_subdomain/assets/js/algorithms/technicalAnalysisCore.js` (Web), enforcing Phase A candle normalization (`normalizeCandles` + `CandleQualityReport`) and Phase B canonical indicator computation (`ta-core/1.0`).
  - Upgraded `TechnicalIndicators.computeBollingerBands()` in Web (`technicalIndicators.js`) from single-pass `sqSum/n - mean²` to numerically stable two-pass variance `Σ(c - mean)² / n` matching Kotlin `PriceFormatterAlgorithm.computeBollingerBands()` (eliminating floating-point cancellation on high-price assets like `BTCUSD`), and unified `period <= 1` and EMA recurrence formulas.
  - Decoupled all 26 full-series indicator computations out of Compose `CandlestickCanvas.kt` into `TechnicalAnalysisCore.computeChartBundle(tab, preferences)`.
  - Added shared cross-platform Golden Fixture (`tests/fixtures/ta_core_golden_fixture.json`) verified within `1e-6` tolerance by both Web (`TA-CORE-AB-01`, **52/52** passing) and Android (`taCore_phaseAB_goldenFixtureParityAndRendererDecoupling`).
- **Technical Analysis Core — Phases C–F (`TA-CORE-CF-01` — `ta-core/1.1` Swings, Evidence-Backed S/R Zones, 7 Candlestick Patterns & Chart Overlays):**
  - Upgraded `TechnicalAnalysisCore` (`host_subdomain/assets/js/algorithms/technicalAnalysisCore.js` and `app/.../algorithms/TechnicalAnalysisCore.kt`) to **`ta-core/1.1`** with deterministic, strictly causal `detectSwingsAndTrend()` (`confirmIndex = index + swingLen`, zero future lookahead, explicit `UPTREND`/`DOWNTREND`/`RANGE`/`INSUFFICIENT_DATA` rules), `detectSupportResistanceZones()` (strict `>= 2` confirmed swing touch gate, ATR clustering, wick rejection count, `ACTIVE`/`BROKEN`/`RETESTED` lifecycle with `invalidationReason`), `detectCandlestickPatterns()` (7 evidence-backed patterns: `DOJI`, `HAMMER`, `SHOOTING_STAR`, `BULLISH_PIN_BAR`, `BEARISH_PIN_BAR`, `BULLISH_ENGULFING`, `BEARISH_ENGULFING`), and `buildCanonicalAnalysis()`.
  - Wired `showSrZones` and `showCandlePatterns` across both Web (`store.js`, `apiService.js`, `headerView.js`, `toolRailView.js`, `app.js`, `chartRenderer.js`) and Android (`ChartTabState.kt`, `ChartPreferences.kt`, `WorkspaceRepository.kt`, `MainViewModel.kt`, `MainActivity.kt`, `ChartViewScreen.kt`, `CandlestickCanvas.kt`, `strings.xml`, `values-fa/strings.xml`) with translucent S/R zone bands, right-edge non-overlapping status badges (`SUP ×N`/`RES ×N`/`SUP*`/`BRK`), and anchored candlestick pattern markers (`▲`/`▼`/`◆`) respecting linear and logarithmic scales.
  - Added shared Golden Fixture `tests/fixtures/ta_core_cf_golden_fixture.json` plus real 260-bar `spotbrent_m15_sample.json` verification in both Web (`TA-CORE-CF-01`, **53/53** passing) and Android (`taCore_phaseCF_swingsSrZonesPatternsAndCanonicalParity`).
- **Advanced Object Tree (`UI-02` — Web & Android Parity):**
  - Added backward-compatible `visible` (default `true`) and `locked` (default `false`) flags to all drawing primitives across Android (`ChartDrawingModels.kt`, `WorkspaceRepository.kt` JSON + cloud sync) and Web (`store.js` `normalizeDrawingObject`, `apiService.js` cloud sync).
  - Enforced visibility and locking in both renderers and interaction engines: hidden drawings are skipped in rendering (`CandlestickCanvas.kt`, `chartRenderer.js`) and hit-testing (`DrawingGeometryAlgorithm.kt`, `drawingGeometry.js`), and locked drawings are protected from translation (`ChartDrawingCoordinator.kt`, `CandlestickCanvas.kt`, `drawingGeometry.js`, `app.js` touch drag) so gestures naturally pan the chart instead.
  - Built dedicated modular bilingual Object Tree UIs: Android M3 `ObjectTreeSheet.kt` (accessible Layers trigger with count badge in `ChartViewScreen.kt` bottom bar) and Web `host_subdomain/assets/js/views/objectTreeView.js?v=1.47.41` (accessible from desktop left tool rail, mobile tools sheet, and mobile topbar without adding desktop topbar width) supporting per-item Select, Show/Hide, Lock/Unlock, Delete, bulk Show/Hide All, Clear Unlocked (preserving locked objects), and one-tap disable for all active indicators & overlays (`S/R Zones`, `Candlestick Patterns`, MAs, Oscillators, SMC, Volume).
  - Added regression coverage on both platforms: `UI-02-OBJECT-TREE-01` in `tests/web_parity.test.mjs` (**54/54** passing) and `ui02_objectTree_drawingVisibilityLockingAndGuardBehavior` in `Phase2AlgorithmsTest.kt` (**34/34** passing).
- **Phase 6 Offline Trading Strategy Simulator (`PHASE6-SIM-01` — `strategy-sim/1.0`, Web & Android Parity):**
  - Implemented strictly offline, per-`chart_id` research simulation engines (`host_subdomain/assets/js/algorithms/strategySimulator.js?v=1.47.41` and `app/.../algorithms/StrategySimulatorAlgorithm.kt`) with zero broker/order APIs and zero dependency on the deferred Forecast engine.
  - Built 4 deterministic causal presets powered by `TechnicalAnalysisCore` (`EMA_TREND_PULLBACK`, `SR_ZONE_PATTERN_BOUNCE`, `SUPERTREND_MOMENTUM`, `BOLLINGER_MEAN_REVERSION`) with bar-close evaluation → next-bar-open execution, default `Initial Equity = EUR 1,000` and `1%` equity risk sizing, conservative `SL_BEFORE_TP` intrabar tie-breaker, explicit `Spread`/`Commission`/`Slippage`/`Swap` friction modeling, automatic `1.0x / 1.5x / 2.0x` Cost Sensitivity stress table, and full KPI suite (`Net Return`, `Win Rate`, `Profit Factor`, `Expectancy`, `Avg R`, `Max Drawdown`, `Sharpe`, `Sortino`, `Max Consecutive Losses`, `Total Costs`, Equity Curve, and Trade Ledger).
  - Built bilingual Strategy Lab UIs on both platforms: Web modal (`host_subdomain/assets/js/views/strategyLabView.js?v=1.47.41`, accessible from desktop left tool rail and mobile tools sheet without adding topbar clutter) with inline SVG Equity Curve, and Android M3 bottom sheet (`StrategyLabSheet.kt`, accessible from `ChartViewScreen.kt` control bar) with native Compose Canvas Equity Curve.
- **Multi-User Admin UI & Server-Side RBAC (`ADMIN-RBAC-01` — PHP + Web + Android):**
  - Upgraded `host_subdomain/api/v1/auth.php` to enforce `is_active = 1` (`ACCOUNT_DISABLED` 403) on login and session validation, return `user_role`, and scope profile/password updates and session revocation to the authenticated user while preserving backward-compatible owner fallback.
  - Added role-gated `host_subdomain/api/v1/admin_users.php` (`list`, `create`, `update`, `reset_password`, `revoke_sessions`, `delete`) with parameterized PDO queries, strict server-side `owner`/`admin` checks, owner/self-lockout protection (`CANNOT_MODIFY_OWNER`, `CANNOT_MODIFY_SELF`, `FORBIDDEN_ROLE_ASSIGNMENT`), `Argon2id`/`Bcrypt` password hashing, session revocation, audit logging, and zero password-hash exposure.
  - Added bilingual Multi-User Admin management cards inside Settings → Account tab on both Web (`host_subdomain/assets/js/views/adminUsersView.js?v=1.47.41` with full `escapeHtml` & numeric ID encoding) and Android (`AdminUsersSection.kt`, `SettingsScreen.kt`, `MainViewModel.kt`, `WorkspaceRepository.kt`), visible exclusively to authenticated `owner`/`admin` roles.
  - Verified **56/56** Web parity tests (`PHASE6-STRATEGY-SIM-01`, `ADMIN-USERS-RBAC-01`), **35/35** Android unit tests (`phase6_strategySimulator_causalExecutionSlBeforeTpAndCostSensitivity`), and clean Android APK compilation; updated `TRADING_STRATEGY_SPEC.md`, `OPEN_ISSUES.md`, `ROADMAP_BACKLOG.md`, and `CHANGELOG.md`.
- **`Causal Historical Analogs` Rev 2.3 — Horizon Prefix-Invariance, Hybrid Two-Cluster MTF & Causal Feature Enrichment (`FORECAST-ANALOG-REV23-CONSISTENCY-01` — Web, 2026-11-23):**
  - Upgraded `host_subdomain/assets/js/forecast/empiricalAnalogEngine.js` to **`2.3.0`** (`CANONICAL_ANALOG_HORIZON = 60`, `CANONICAL_ANALOG_EMBARGO = 15`, full `stride = 1` scan over typed `Float64Array` buffers with safe short-history `refH` fallback preserving `healthyMinJMax = 42`), guaranteeing **exact `0.0000` prefix-invariance** across `H = 15 / 30 / 60` for all 5 quantiles (`q10..q90`) in ~47 ms/run on 2400 bars.
  - Implemented **Hybrid Two-Cluster MTF** (`INTRADAY_M15_H1_H4` anchored on `H1` and `SWING_H4_D1_W1` anchored on `D1`): `H4 × 15` directly aggregates the exact selected `H1` analog blocks (`LOWER_TF_AGGREGATED`, **`0.0000` diff across all 15 shared 4h boundaries** while preserving natural intra-block H1 retracements), and `M15 ↔ H1` applies monotonic higher-anchor block reconciliation (`BLOCK_RECONCILED`).
  - Enriched similarity matching with strictly causal features (`EMA 20/50` trend context `trendDist`, confirmed swing S/R distance `srDist`, soft session distance `sessionDist`, and multi-scale macro context `macroDist`).
  - Wired `lowerTimeframeCandles` (including `W1 → D1` in `resolveLowerTimeframeInfo`), `modelMtfMeta` forwarding, and prefix-invariant trajectory handling in `forecastEngine.js`, aligned `walkForwardEvaluator.js` empirical quantile scoring (eliminating ensemble conformal double-padding; 30-window multi-regime OOS `rMAE = 0.7329`, `WIS = 1.2640` vs Naive `2.0437`, `Coverage 80% = 81.33%`), extended `coordinateMultiTimeframe` in `forecastV130Analyzer.js`, and surfaced `H_ref=60` / `stride=1` / Hybrid MTF badges in `forecastView.js`.
  - Added regression test `FORECAST-ANALOG-REV23-CONSISTENCY-01` (**57/57** Web parity tests passing), verified clean Android compilation, and promoted `FORECAST_CONSISTENCY_AND_ANALOG_ANALYSIS_V1.md` to `v2.0.0`.
- **`Structural JS` & `SMC Prediction Engine` Rev 2.3 — Unified Prefix-Invariance & Hybrid Two-Cluster MTF (`FORECAST-STRUCT-SMC-REV23-CONSISTENCY-01` — Web, 2026-11-24):**
  - Upgraded `host_subdomain/assets/js/algorithms/structuralForecastEngine.js` (`STRUCTURAL_FORECAST_VERSION = '2.3.0'`, `STRUCTURAL_CANONICAL_HORIZON = 60`) and `host_subdomain/assets/js/forecast/smcPredictionEngine.js` (`SMC_PREDICTION_MODEL_VERSION = '2.3.0'`, `CANONICAL_SMC_HORIZON = 60`) to the exact Rev 2.3 consistency standard: **exact `0.0000` Horizon Prefix-Invariance** across `H = 15 / 30 / 60` for all 5 quantiles (`q10..q90`), **Hybrid Two-Cluster MTF** (`LOWER_TF_AGGREGATED` for `H4←H1` and `W1←D1` with exact `0.0000` alignment across all 15 shared 4h boundaries, monotonic `BLOCK_RECONCILED` for `M15/M30↔H1` and `H4↔D1`, and causal `ANCHOR_MACRO_AWARE` HTF bias on `H1/D1`), strictly preserving zero `Math.random`/`Math.sin`/`Math.cos`, zero fabricated `volume = 100`, and `skipAnalogs` invariance.
  - Wired MTF candle forwarding, prefix-invariant quantile pass-through (removing ensemble conformal double-padding), and active-model `mtfMeta` coordination across `forecastEngine.js`, `walkForwardEvaluator.js`, `forecastView.js`, `structuralForecastService.js`, and `app.js` (also fixing `smcPoc` lookup to `meta.pocPrice` and surfacing `H_ref=60` / MTF mode badges in Studio UI).
  - Added regression test `FORECAST-STRUCT-SMC-REV23-CONSISTENCY-01` (**58/58** Web parity tests passing), verified clean Android compilation, and promoted `FORECAST_CONSISTENCY_AND_ANALOG_ANALYSIS_V1.md` to `v2.1.0`.

### Fixed (`BUGFIX-V14741-UI-SYNC-TF-SMC`: Topbar Overflow, Full MariaDB Hydration Past 250-Bar Mirror, `SMCPredictionEngine` Selection & Cache-Busting, Timeframe-Switch Forecast Persistence)
- **Top Header Bar Right-Edge Clipping on Chart View (`assets/css/theme.css?v=1.47.41`, `index.html`):**
  - Updated `.tv-topbar` to `overflow: hidden`, made `.tv-topbar-left` flex-shrinkable (`flex: 1 1 auto; min-width: 0; overflow-x: auto`) with a bounded flexible `.tv-open-tabs-strip` (`flex: 0 1 280px; min-width: 112px; max-width: 340px`), and pinned `.tv-topbar-right` (`flex-shrink: 0` with subtle left border) plus tightened `@media (max-width: 1400px)` spacing so right-side controls (status dot, `CSV`, snapshot, refresh, fullscreen) never overflow off-screen on desktop Chart view.
  - Bumped `theme.css` cache-buster in `index.html` from `?v=1.47.1` to `?v=1.47.41`.
- **False `DATA_NOT_READY (found 250)` After Reload & Hidden Preview Canvas (`core/store.js?v=1.47.41`, `services/apiService.js?v=1.47.41`, `app.js?v=1.47.41`):**
  - Preserved the 250-bar `localStorage` quota cap (`STORAGE-QUOTA-01`) while adding session RAM server-hydration tracking (`markCandleKeyHydratedFromServer` / `isCandleKeyHydratedFromServer` in `store.js`).
  - Updated `fetchFromBackend()` in `apiService.js` so `since_ms` delta-only fetches are only used after full MariaDB history has been hydrated into RAM (preventing 250-bar `localStorage` mirrors from trapping symbols in delta-only sync), and triggered automatic full-history sync when opening Forecast Studio (`set-workspace-view: forecast`) if the active tab is not yet server-hydrated or has `< 360` bars.
  - Updated `renderForecastWorkspaceContent()` in `app.js` to render `#forecast-studio-canvas` cleanly above the `DATA_NOT_READY` notice whenever `Structural JS` or `SMCPredictionEngine` has a ready direct preview (`>= 40` closed bars).
- **`SMCPredictionEngine` Visibility, Selection Allowlist & Direct Fallback (`app.js?v=1.47.41` + Unified `?v=1.47.41` Bump Across All 27 JS Modules & `index.html`):**
  - Added `'smc_prediction_js'` to the `set-structural-forecast-model` allowlist (previously falling back to `structural_wave_js` on click), promoted `SMC Prediction Engine` (`موتور نقدینگی SMC`) to the front row right beside `Structural JS` and `Auto (OOS Best)`, and added direct `computeSmcPrediction()` fallback in `applyNativeModelForecastToTab()` and Studio preview for `< 318`-bar series.
  - Bumped cache-busting uniformly from `?v=1.47.40` to **`?v=1.47.41`** across `index.html` and all 27 ES modules so browsers immediately load the updated `SMCPredictionEngine` bundle and CSS fixes.
- **Timeframe-Switch Forecast Persistence & Auto-Recompute (`app.js?v=1.47.41`):**
  - Added `recomputeActiveTabForecast()` and updated `set-timeframe` and `set-date-range` handlers to preserve active forecast state (`showStructuralForecast`, selected model, horizon, render mode, band toggle), clear stale old-timeframe points immediately (`status = 'COMPUTING'`), and automatically recompute and plot the active model on the new timeframe once candles are ready (guarding against early `isSyncing === true` callbacks).
- **Verification:**
  - Verified `node --check` on all modified JS files and **51/51** passing tests in `tests/web_parity.test.mjs` (added `BUGFIX-V14741-UI-SYNC-TF-SMC` and verified `ARCH-01` / `ARCH-02` unified `?v=1.47.41`).

---

## [1.47.40] - 2026-11-20

### Added (`FORECAST-SMC-ENGINE-01`: Independent Causal `SMCPredictionEngine` (`smc_prediction_js`))
- **Standalone Scientific SMC Engine (`forecast/smcPredictionEngine.js?v=1.47.40`, re-exported from `forecast/forecastEngine.js?v=1.47.40`):**
  - Implemented `SMCPredictionEngine` / `computeSmcPrediction()` as an independent, strictly causal Smart Money Concepts liquidity model without `Math.random`, `Math.sin`/`Math.cos`, fabricated `volume = 100`, or synthetic OHLC candles.
  - Builds structured multi-phase liquidity trajectories (Internal FVG/POC rebalance → External `EQH`/`EQL`/`VAH`/`VAL` draw in the recency-weighted `BOS/CHoCH` orderflow direction → Post-sweep equilibrium reaction) with asymmetric empirical dispersion corridors (`q10..q90`) and honest `SKIPPED_LOW_DATA` gating when closed history or SMC structure is insufficient.
- **First-Class Forecast Studio, Walk-Forward, Compare & Replay Integration (`walkForwardEvaluator.js?v=1.47.40`, `forecastEngine.js?v=1.47.40`, `views/forecastView.js?v=1.47.40`, `app.js?v=1.47.40`):**
  - Added a dedicated **`SMC Prediction Engine` (`موتور نقدینگی SMC`)** button in Forecast Studio alongside `Structural JS`, `Causal Historical Analogs`, and `Ensemble`, routing cleanly to the main chart via `adaptNativeModelTrajectory()`.
  - Added `smc_prediction_js` to causal `Walk-Forward` benchmarking (`AUTO OOS` eligible), Studio `Compare Overlays` (cyan `#06B6D4` with diamond `turningPoints` and `POC` reference line + hover HUD rationale), LRU `BASE_RESELECT`, and direct `Historical Replay` scoring.
- **Verification:**
  - Verified `node --check` on all 5 created/modified JS modules and **50/50** passing tests in `tests/web_parity.test.mjs` (added `FORECAST-SMC-ENGINE-01`).

### Changed (`FORECAST-PKG3`: Zero-Lag LRU Caching, Interactive Studio/Replay Crosshair HUD & Causal SMC Liquidity Magnets)
- **Zero-Lag Forecast Caching & Instant Model/Mode Switching (`views/forecastView.js?v=1.47.40`, `app.js?v=1.47.40`):**
  - Replaced the single-slot `state._forecastBuildMemo` in `buildForecastForTab()` with bounded multi-entry LRU caches (`state._forecastBaseCache` max 16 entries, `state._forecastViewCache` max 24 entries) so switching between symbols/tabs retains prior calculations without full recomputation (`cacheHit: 'EXACT'`).
  - Separated heavy `ForecastEngine.project()` / `Walk-Forward` execution from lightweight trajectory re-selection (`selectOosChartWinner()` + summary refresh, `cacheHit: 'BASE_RESELECT'`), eliminating UI lag when switching between `AUTO`, `Structural JS`, `Causal Historical Analogs`, `Ensemble`, `ARIMA`, `Prophet`, or `Fan / Hybrid / Quantile Bars`.
  - Enabled `skipBootstrap: true` in `app.js` when previewing `Structural JS` on `Overview` (reusing any cached full `BOOT` forecast if already computed), while preserving full 1000-iteration bootstrap on `Backtest` / `AUTO` / `Ensemble`.
- **Interactive Crosshair & Floating HUD on Studio & Replay Canvases (`views/forecastView.js?v=1.47.40`, `app.js?v=1.47.40`):**
  - Upgraded `renderForecastStudioFanCanvas()` with an optional dashed SMC Volume Profile `POC` reference line and `hoverSlotIdx` vertical crosshair + floating auto-positioned HUD tooltip showing historical OHLC bars, future step `+h` + UTC timestamp + `q50` + `% change` + `q10–q90` corridor + nearby turning-point rationale, and in Replay mode live `Pred q50` vs `Actual Close`, `% error`, and `80% Band IN/OUT`.
  - Added idempotent `requestAnimationFrame`-throttled `bindForecastCanvasHover()` (mouse & touch) and wired it onto `#forecast-studio-canvas` and `#forecast-replay-canvas` in `app.js`.
- **Clean Scientific Revival of Earliest Model — Causal SMC Liquidity Magnets (`algorithms/structuralForecastEngine.js?v=1.47.40`, `app.js?v=1.47.40`):**
  - Added `extractSmcLiquidityZones()` using real, causal `TechnicalIndicators.computeVolumeProfile()` (`POC`, `VAH`, `VAL` without synthetic `volume = 100`) and `TechnicalIndicators.detectMarketStructureSmc()` (unmitigated recent `FVG`s, `EQH`/`EQL` liquidity pools, `BOS`/`CHoCH` counts).
  - Integrated `smc_liquidity_zones` into `findMagnetZone()` with S/R confluence boosting and gentle secondary magnet attraction, exposed `smc_poc`, `smc_vah`, `smc_val`, `active_fvg_count`, `smc_magnet_hits`, and `model_diagnostics.smc_liquidity`, and surfaced `POC` and active `FVG` count in the Structural Studio banner — strictly preserving zero `Math.random`/`Math.sin`/`Math.cos`, zero synthetic OHLC, and `skipAnalogs` trajectory invariance.
- **Verification:**
  - Verified `node --check` on all 3 modified JS modules and **49/49** passing tests in `tests/web_parity.test.mjs` (added `FORECAST-PKG3-SMC-01`, `FORECAST-PKG3-CACHE-02`, and `FORECAST-PKG3-HOVER-03`).

### Changed (`FORECAST-PKG2`: Deep Upgrade of `Causal Historical Analogs` & `Structural JS` + First-Class Walk-Forward, Compare & Replay Integration)
- **Standalone Rev 2.2 `Causal Historical Analogs` Engine (`forecast/empiricalAnalogEngine.js?v=1.47.40`, re-exported from `forecast/forecastEngine.js?v=1.47.40`):**
  - Extracted `EmpiricalAnalogEngine` into its own acyclic module (`?v=1.47.40`) with O(T) precomputed rolling ATR14/ATR60/ATR% arrays.
  - Upgraded matching to multi-feature similarity (normalized close path, candle body ratio, bar range expansion, volatility-regime ratio `|log(currVol/pastVol)|`, trend slope, and up-bar fraction) with recency weighting while strictly preserving causal `j_max = T - 2L - H - G_embargo`.
  - Added Non-Maximum Suppression (`de-clustering`, `minSep = max(3, floor(L/3))`) so overlapping shifted copies of a single historical episode cannot dominate `topK`.
  - Added volatility-scaled future log-returns (`clamp(currentAtrPct / pastAtrPct, 0.55, 1.85)`), distance-kernel weighted quantiles (`q10..q90`), and true path-wise weighted medoid selection for `ANALOG_CENTER` / `ANALOG_UPPER` / `ANALOG_LOWER`.
- **Non-Mechanical `Structural JS` v2 (`algorithms/structuralForecastEngine.js?v=1.47.40`):**
  - Added `extractStructuralZones()` to cluster confirmed swings into real Structural S/R zones (`touches`, `polarity`, `strength`) and apply soft magnet attraction (`zone_magnet`) to projected turning points.
  - Replaced rigid metronome leg repetition with deterministic empirical quartile modulation (`Q25`/`median`/`Q75` durations & retracements + soft EMA50 mean-reversion when overextended), preserving zero `Math.random`/`Math.sin`/`Math.cos` and zero synthetic OHLC.
  - Upgraded uncertainty bands to empirical asymmetric upside/downside dispersion (`band_asymmetry_up` / `band_asymmetry_down`), added `analog_agreement_score` & `corridor_overlap_pct` diagnostics, and added `skipAnalogs` fast mode for Walk-Forward windows.
- **First-Class Walk-Forward, Compare Overlay & Historical Replay Integration (`forecast/walkForwardEvaluator.js?v=1.47.40`, `forecast/forecastEngine.js?v=1.47.40`, `views/forecastView.js?v=1.47.40`, `app.js?v=1.47.40`):**
  - Benchmarked both `empirical_analogs` and `structural_wave_js` causally on every outer Walk-Forward window (`rMAE`, `WIS`, `80% Coverage`, `HLN-DM`, `Bootstrap`), making both visible in the Backtest table and eligible for `AUTO OOS` selection.
  - Emitted `structural_wave_js` inside `ForecastEngine.project().modelTrajectories`, added `structural_wave_js` to Studio canvas Compare overlays (allowing side-by-side overlay with `Causal Historical Analogs`), and displayed S/R Zone count & Analog Sync % in the Structural Studio banner.
  - Fixed Historical Replay (`runHistoricalForecastReplay` + `app.js` click handler) to pass and directly score the user's active model (`structural_wave_js` or `empirical_analogs`) without silently falling back to `naive_persistence`, and added a `Model` column to Replay window and Saved Run tables.
- **Verification:**
  - Verified `node --check` on all 6 created/modified JS modules and **46/46** passing tests in `tests/web_parity.test.mjs` (added `FORECAST-PKG2-ANALOGS-01`, `FORECAST-PKG2-STRUCTURAL-02`, and `FORECAST-PKG2-WF-REPLAY-03`).

### Fixed (`FORECAST-PKG1`: Browser-Native Forecast Infrastructure, Calendar, Math, Ledger & UI Bug Fixes)
- **Session-Aware Future Timestamps Across Calendar, Contract & Structural JS (`forecast/calendarRegistry.js?v=1.47.40`, `forecast/forecastContract.js?v=1.47.40`, `algorithms/structuralForecastEngine.js?v=1.47.40`):**
  - Added `isTradingDayForCalendar()` and fixed `advanceFutureTimestampsWithCalendar()` for `W1` (direct weekly step) and `D1` (trading-day advancement skipping Sat/Sun/US holidays using UTC dates for `00:00 UTC` candles so `NVDA` and winter `SPOTBRENT` never spin past the loop guard into future years), plus increased the intraday guard budget (`horizon * 48 + 960`) for `US_EQUITIES_RTH`.
  - Fixed `adaptNativeModelTrajectory()` in `forecastContract.js` to resolve timestamps from `openTimeUtcMs || open_time_utc_ms || timestampUtcMs || timestamp_utc_ms` with `advanceFutureTimestampsWithCalendar()` fallback and emit **both** `open_time_utc_ms` and `timestamp_utc_ms` on every adapted point (preventing weekend/closed-session X-axis timestamps on `chartRenderer.js`).
  - Delegated `structuralForecastEngine.js` future timestamp generation to `advanceFutureTimestampsWithCalendar()` (removing 24h overnight candles on US Equities while preserving zero `Math.random`/`sin`/`cos`).
- **Math, KeyZones, MTF Drift & OOD Volatility Fixes (`forecast/featureExtractor.js?v=1.47.40`, `forecast/forecastV130Analyzer.js?v=1.47.40`):**
  - Added full-window historical average TR/close baseline (`histAtrPct`) to `extractForecastFeatures()` and updated `computeOodAndUncertainty()` to compare `atrPct` against `histAtrPct` instead of close-to-close `uncondSigma`.
  - Removed the artificial `12`-bar cap in `detectKeyZonesAndEventTree()`, set `horizonBars` to the real evaluated length (`evalLen`), and fixed the copy-paste bug in `KZ_LOWER_REACTION` by tracking independent lower-zone touch, penetration, reclaim, break, and ambiguous counts from `lEv`.
  - Fixed `coordinateMultiTimeframe()` to scale `htfFeats.recentMeanReturn` by `tfRatio = stepMillisecondsForTimeframe(higherTimeframe) / stepMillisecondsForTimeframe(timeframe)` before applying per-bar drift pull.
- **Forecast Ledger Quota Safety, Trim-Safe SHA-256 Chain & Per-Step Checkpoints (`forecast/forecastLedger.js?v=1.47.40`, `views/forecastView.js?v=1.47.40`):**
  - Routed all writes in `forecastLedger.js` and Replay history in `forecastView.js` through `safeLocalStorageSet()` (zero bare `localStorage.setItem`; compact replay summaries without raw candle/point blobs).
  - Preserved SHA-256 hash-chain verification past the 120-entry / 240-lifecycle-event trim via persisted anchor metadata (`entriesAnchorKey` / `lifecycleAnchorKey`).
  - Stored `modelId`, `providerId`, and per-step `checkpointQuantiles` (`5`, `10`, `horizonBars`) on each snapshot, updated `evaluateMaturedForecasts()` to grade intermediate checkpoints against step-matched `[q10, q90]` bands (with legacy fallback), and displayed `e.modelId` badges in `renderLedgerPanel()`.
- **Native Model Stabilization (`forecast/models/advancedNativeModels.js?v=1.47.40`):**
  - Clamped `NativeArimaDiffModel` residuals when `dOrder === 0` against demeaned log-level std (`seriesStd * 4`) instead of return `uncondSigma * 4`.
  - Computed `NativeProphetDecompModel` `resSigma` from 1-step innovation residuals capped at `uncondSigma * 1.8`, eliminating level-residual cone explosion.
  - Updated `NativeSequenceRecurrentModel` MC-dropout rollout to step across `CANONICAL_FORECAST_HORIZON` (60 steps) for every sample, restoring 100% prefix invariance across horizons.
- **Forecast Studio Preview, Horizon Switching & Replay Provider (`app.js?v=1.47.40`, `views/forecastView.js?v=1.47.40`):**
  - Connected `Structural JS` preview to `#forecast-studio-canvas` (including `turningPoints` diamond markers, `representativePaths`, `overlayModels` scaling, and `structural_wave_js` color `#8B5CF6`), replaced O(n²) `pts.indexOf(p)` with index iteration, and guarded `fc.anchorClose > 0` in `renderOverviewPanel()`.
  - Fixed `set-forecast-horizon` to preserve and re-run active native models (`applyNativeModelForecastToTab`) instead of overwriting them with `Structural JS`, and updated `runHistoricalForecastReplay()` to use `activeTab.provider || 'tvdatafeed'`.
- **Verification:**
  - Verified `node --check` on all 9 modified JS modules and **43/43** passing tests in `tests/web_parity.test.mjs` (added `FORECAST-PKG1-CALENDAR-01`, `FORECAST-PKG1-ANALYZER-02`, `FORECAST-PKG1-LEDGER-03`, and `FORECAST-PKG1-MODELS-04`).

### Fixed (`STORAGE-QUOTA-01`: Watchlist Symbol Switch Freeze Caused by `localStorage` `QuotaExceededError`)
- **Root Cause Fix — Uncaught `QuotaExceededError` in `saveOpenTabsToStorage()` (`core/store.js?v=1.47.40`, `app.js?v=1.47.40`, `services/apiService.js?v=1.47.40`, `core/i18n.js?v=1.47.40`):**
  - Previously, `saveCandlesToCache()` mirrored up to `1,500` bars per `(symbol, provider, timeframe)` into `localStorage`, saturating the browser's 5 MB storage quota. Switching timeframes on the single initial tab (`SPOTBRENT`) kept `ci_open_tabs_v2` the same byte size and succeeded, but clicking ANY second symbol in the Watchlist expanded `ci_open_tabs_v2` and threw an uncaught `QuotaExceededError` inside `saveOpenTabsToStorage()`, aborting `openOrFocusSymbolTab()` before `syncSymbolNow()` and `renderApp()` could run (leaving the header/watchlist frozen on `SPOTBRENT 15m` while the 1s canvas timer rendered the newly pushed symbol underneath).
  - Added centralized `safeLocalStorageSet()` + `evictCandleCachesFromLocalStorage()` in `core/store.js` that automatically evicts legacy/largest `ci_candles_v*` blobs on quota failure and never throws even when storage is completely locked/full.
  - Capped the `localStorage` candle mirror in `saveCandlesToCache()` to `250` lightweight bars per series while retaining the full **5,000-bar** dataset in RAM (`state.candleCache`) and MariaDB.
  - Routed EVERY `localStorage.setItem` across `store.js`, `app.js`, and `apiService.js` through `safeLocalStorageSet()` and wrapped `i18n.setLanguage()` in `try/catch`.
- **Watchlist Full Backfill & Click Handler Safety (`app.js?v=1.47.40`):**
  - Updated `openOrFocusSymbolTab()` to pass `needsFullBackfill = !cached || cached.length < 30` to `syncSymbolNow()` so lower watchlist symbols with no local cache immediately fetch their full history from MariaDB.
  - Added a `try/catch` safety boundary around the async `document.addEventListener('click', ...)` dispatcher so UI actions never silently leave the DOM desynchronized.
- **Unified Cache-Busting, Tests & Docs:**
  - Bumped all 26 JS modules and `index.html` uniformly to `?v=1.47.40`.
  - Verified `node --check` on all 26 JS modules and **39/39** passing tests in `tests/web_parity.test.mjs` (added `STORAGE-QUOTA-01` simulating saturated/locked `localStorage` + static zero-bare-`localStorage.setItem` audit).
  - Updated `docs/04-development/CHANGELOG.md` and `docs/03-roadmap-and-issues/OPEN_ISSUES.md`.

### Documentation (`FCST-DOC-01`: Full Repository Documentation Reconciliation to `v1.47.40`)
- Reconciled all primary entry-point documents (`README.md`, `docs/README.md`, `docs/04-development/AGENTS.md`, `docs/03-roadmap-and-issues/OPEN_ISSUES.md`, `docs/03-roadmap-and-issues/ROADMAP_BACKLOG.md`, `docs/KNOWN_ISSUES_BACKLOG.md`, `docs/04-development/PROJECT_GUIDE.md`, and `docs/02-architecture/FORECAST_MIGRATION_PLAN_V1.md`) to eliminate stale `v1.45.1` / "Forecast archived & disabled" / "Legacy active" / "CHART-STALL-01 open" contradictions for incoming AI agents and developers.
- Documented the explicit live-vs-shelved-vs-archived boundary: `host_subdomain/` runs the 100% browser-native Unified Forecast Studio (with `Causal Historical Analogs` and `Structural JS` confirmed by owner testing, Legacy UI permanently removed in `v1.47.38`), `Python` / `Chronos-2` remain shelved until a dedicated Python server is provisioned, and `/archive/` is strictly read-only historical reference.
- Fixed a broken literal `\n` Markdown table row in `docs/README.md` and codified mandatory `ARCH-02` (unified `?v=` across all 26 JS modules) and `STORAGE-QUOTA-01` (`safeLocalStorageSet()`) invariants in `AGENTS.md`.

---

## [1.47.39] - 2026-11-19

### Fixed (Unified ES Module Cache-Busting, Global Store Singleton Guard, OHLC Overlay & Active-Tab Sync Protection)
- **Root Cause Fix — Split-Singleton `store.js` Under Browser Cache (All 25 JS Modules + `index.html`):**
  - Unified EVERY ES module import, worker URL, and script tag across the entire `host_subdomain/` graph (`index.html`, `app.js`, `core/store.js`, `services/*`, `components/*`, `views/*`, `workers/*`, `algorithms/*`, `forecast/*`) to a single canonical version (`?v=1.47.39`), eliminating stale browser-cached intermediate modules (`apiService.js?v=1.47.2`, `watchlistView.js?v=1.47.2` / `1.47.1`, `settingsView.js?v=1.47.2`, `loginView.js?v=1.47.2`, `structuralForecastService.js?v=1.47.6`) that previously loaded an older `store.js` instance separately from `app.js` / `headerView.js` / `chartRenderer.js`.
- **Canonical Global Singleton Guard (`core/store.js?v=1.47.39`):**
  - Backed `state`, `candleCache`, `_resolvedCandlesMemo`, `candleCacheRev`, `autoSyncCallback`, `autoSyncTimerId`, and `suspendFocusPullUntilMs` with `globalThis.__CI_STORE_SINGLETON_V1__` so split-singleton state desynchronization (empty chart canvas while watchlist shows live prices, or mismatched active symbol/timeframe) is structurally impossible even under partial CDN/browser cache.
- **OHLC Overlay Sync & Active-Tab Focus-Pull Protection (`app.js?v=1.47.39`, `core/store.js?v=1.47.39`, `services/apiService.js?v=1.47.39`):**
  - Fixed `redrawActiveCanvas()` in `app.js` to remove stale `.tv-ohlc-overlay` nodes when `activeTab` has no candles yet (`oldOverlay.remove()`) and insert the overlay (`box.prepend(nextOverlay)`) as soon as candles arrive.
  - Updated `saveOpenTabsToStorage()` in `store.js` to call `suspendFocusPull(15000)` and bump `preferencesUpdatedAtMs` on user-driven symbol/tab/timeframe switches, and guarded `downloadWorkspaceSync()` in `apiService.js` with `preserveLocalTabSelection = isLocalNewer || isFocusPullSuspended()` so in-flight background sync never snaps a freshly clicked symbol or timeframe back to an older server snapshot.
- **Verification & Documentation:**
  - Verified `node --check` across all 25 modified JS modules and **38/38** passing tests in `tests/web_parity.test.mjs`, including new `ARCH-02` verifying whole-graph `?v=` uniformity, runtime dual-import `store.js` singleton identity, overlay cleanup, and focus-pull tab protection.
  - Updated `docs/04-development/CHANGELOG.md` and `docs/03-roadmap-and-issues/OPEN_ISSUES.md`.

---

## [1.47.38] - 2026-11-19

### Removed & Cleaned Up (Phase 3 Migration: Permanent Removal of Legacy Forecast Studio UI, Handlers & Chart Overlay)
- **Legacy UI & Engine Switcher Removal (`forecastView.js?v=2.0.20`, `headerView.js?v=1.47.8`, `app.js?v=1.47.38`):**
  - Removed `renderForecastStudioView()`, temporary `LEGACY_MIGRATED_UI_DISABLED` flag, and unused `renderSymbolBadge` import from `forecastView.js` while keeping all shared Native Studio helpers (`buildForecastForTab`, `renderOverviewPanel`, `renderModelsPanel`, `renderBacktestPanel`, `renderLedgerPanel`, `renderForecastStudioFanCanvas`, `runHistoricalForecastReplay`) intact.
  - Removed the `Legacy · Forecast Studio / New · Structural` switcher bar and Legacy-only click handlers (`set-forecast-engine`, `set-forecast-model`, `apply-forecast-to-chart`, `toggle-legacy-forecast-chart`, and the Legacy branch in `set-forecast-horizon`) from `app.js` so the Forecast tab opens directly into the single unified 12-panel Forecast Studio.
  - Removed the deprecated `Legacy Forecast` button from `headerView.js`.
- **Unified Main-Chart Forecast Pipeline & Backward-Compatible Preference Normalization (`chartRenderer.js?v=1.47.23`, `store.js?v=1.47.15`, `index.html`):**
  - Removed the deprecated `legacyForecastPoints` / `hasValidLegacyForecast` scaling, time-axis branch, and canvas overlay drawing block from `chartRenderer.js`.
  - Normalized legacy persisted preferences (`forecastEngineMode: 'legacy'` → `'structural'`, `showFutureProjection` → `false`) inside `loadPreferences()` in `store.js` and bumped canonical `store.js?v=1.47.15` across all 9 importing modules plus `app.js?v=1.47.38` in `index.html`.
- **Verification & Documentation:**
  - Verified `node --check` across all 10 modified JS modules and **37/37** passing tests in `tests/web_parity.test.mjs` (replaced Phase 2 check with `FORECAST-PHASE3-LEGACY-CLEANUP-01`).
  - Updated `FORECAST_MIGRATION_PLAN_V1.md`, `FORECAST_LEGACY_PARITY_MATRIX_V1.md`, and `OPEN_ISSUES.md`; shelved Python/Chronos-2 files remain untouched.

---

## [1.47.37] - 2026-11-19

### Changed (Phase 2 Migration: Progressive Disabling of Migrated Controls in Legacy Without Deletion)
- **Reversible Phase 2 Flag & Migration Status Banner (`forecastView.js?v=2.0.19`):**
  - Exported `LEGACY_MIGRATED_UI_DISABLED = true` so migrated controls in `Legacy · Forecast Studio` are cleanly disabled with instant rollback preserved and zero code deletion.
  - Added a transparent Phase 2 Migration Status Banner (`data-legacy-migration-phase="2"`) inside Legacy displaying migrated capabilities vs. shelved shared-hosting items (`Chronos-2`, `External Python Worker Models`) with a direct `Open in New · Structural` button.
  - Marked all migrated Legacy studio buttons (model selector, horizon, render mode, MTF layer, `Record Local Snapshot`, `Show Selected Model on Chart`, and all 4 sub-tabs) `disabled aria-disabled="true"` with migrated tooltips and locked `.ci-fc-body` read-only (`data-legacy-migrated-locked="true"`), leaving shared panels used by `New · Structural` completely unaffected.
- **Chart Header & Action Handler Guards (`headerView.js?v=1.47.7`, `app.js?v=1.47.37`, `index.html`):**
  - Disabled the deprecated `Legacy Forecast` overlay toggle button in the main chart topbar and added `LEGACY_MIGRATED_UI_DISABLED` guards to Legacy-only action handlers (`set-forecast-model`, `set-forecast-horizon`, `apply-forecast-to-chart`, `toggle-legacy-forecast-chart`) plus a `Migrated Disabled` indicator in the engine switcher.
- **Verification & Documentation:**
  - Verified `node --check` on all modified JS modules and **37/37** passing tests in `tests/web_parity.test.mjs` (added `FORECAST-PHASE2-LEGACY-DISABLE-01`).
  - Updated `FORECAST_MIGRATION_PLAN_V1.md`, `FORECAST_LEGACY_PARITY_MATRIX_V1.md`, and `OPEN_ISSUES.md`; full Legacy deletion remains gated on Phase 3 approval.

---

## [1.47.36] - 2026-11-19

### Fixed & Improved (Full 12-Panel Forecast Studio Parity in New Workspace)
- **Full-Width `.ci-forecast-studio` Parity Layout (`app.js`):**
  - Replaced the sparse card wrapper in `renderForecastWorkspaceContent()` with the full-width `.ci-forecast-studio` header, status badges (`VALID / INSUFFICIENT_EVIDENCE`, `Edge Gate`, `OOD`, `Regime`), `Record Local Snapshot` and `Show Selected Model on Chart` buttons, compact `.ci-fc-controls-row`, `Uncertainty Band` toggle, inline `Compare Overlays`, and 4-tab bar.
- **Unconditional 12-Panel Live Rendering for All Models (`app.js`):**
  - Routed `empirical_analogs` (`Causal Historical Analogs`) through the full Native Studio & `applyNativeModelForecastToTab()` instead of falling back to an empty `IDLE` placeholder.
  - Evaluated `nativeEvaluation = buildForecastForTab(...)` unconditionally when `selected === 'structural'` so all 12 Studio panels (`Calibrated Quantile Fan`, `OOS Selection Gate`, `Conformal Calibration`, `12-Model Trajectory Comparison`, `11 Side-by-Side mini-charts`, `Analog Medoids`, `NO_EDGE` banner, `Aleatoric vs Epistemic`, `MTF Coordination Check`, `3-Scenario Event Tree`, `Key Zones`, and `Horizon Step Quantile Ladder`) render live even when `Causal Historical Analogs` or `Structural JS` is active.
  - Wired `Plot Reference Bands on Chart` (`project-scenario-levels`) to call `redrawActiveCanvas()` immediately and kept `Structural JS` status in a compact top banner without overwriting `state._lastForecastResult`.
- **Persistence & Cache Invalidation (`store.js`, `index.html`, all 9 ES module importers):**
  - Fixed `store.js` tab hydration regex from `/^[a-z0-9_]+$/` to `/^(AUTO|[a-z0-9_]+)$/` so uppercase `'AUTO'` persists across reloads.
  - Bumped cache keys to `app.js?v=1.47.36` and canonical `store.js?v=1.47.14` across all 9 importing modules.
- **Verification & Documentation:**
  - Verified `node --check` on all 11 modified JS modules and **36/36** passing tests in `tests/web_parity.test.mjs` (added `FORECAST-PHASE1-STUDIO-PARITY-03`).
  - Updated `FORECAST_MIGRATION_PLAN_V1.md`, `FORECAST_LEGACY_PARITY_MATRIX_V1.md`, and `OPEN_ISSUES.md`; Legacy remains untouched pending browser verification and Phase 2 approval.

---

## [1.47.35] - 2026-11-19

### Added & Improved (Phase 1 New Forecast Parity: AUTO OOS, Main Chart Render Modes & Coordinated MTF)
- **AUTO (OOS-Evaluated) Model Selection in New Forecast (`app.js`, `forecastContract.js`, `store.js`):**
  - Added `AUTO (OOS Best)` directly to the New Forecast model selector and updated `applyNativeModelForecastToTab()` to resolve `built.result.selectedChartModelId` instead of falling back to `naive_persistence`, preserving `requested_model_id: 'AUTO'` across `isStructuralForecastMatchingTab()`.
- **Full Main Chart Render Modes & Coordinated MTF (`chartRenderer.js`, `forecastContract.js`, `app.js`):**
  - Extended Y-axis auto-scaling to include outer `Q10`/`Q90` quantiles so full uncertainty corridors never clip.
  - Added `Quantile Fan` (`Q10–Q90` outer fan + `Q25–Q75` inner band + right-axis price tags), `Hybrid`, and `Quantile Bars` (derived strictly from `q25..q75` and `q50`, zero synthetic OHLC) directly to the New main chart forecast overlay.
  - Wired `Independent` / `Coordinated` MTF points (`mtfCoordination.coordinatedPoints`) with monotonic quantile validation into `adaptNativeModelTrajectory()` and live main-chart redraws when toggling render mode, MTF coordination, or comparison checkboxes.
- **Unified New Forecast Header & Controls (`app.js`, `index.html`):**
  - Added symbol badge and `VALID/PROVISIONAL/NO_EDGE`, `Edge Gate`, `OOD`, and `Regime` status badges to the New Forecast header and removed the duplicate second horizon selector row.
  - Bumped cache-bust versions to `app.js?v=1.47.35`, `chartRenderer.js?v=1.47.22`, `forecastContract.js?v=2.0.4`, and canonical `store.js?v=1.47.13` across all 9 importing modules.
- **Verification & Documentation:**
  - Passed `node --check` on all modified JS files and **35/35** tests in `tests/web_parity.test.mjs` (including new `FORECAST-PHASE1-PARITY-01` and `FORECAST-PHASE1-PARITY-02`).
  - Updated `FORECAST_MIGRATION_PLAN_V1.md`, `FORECAST_LEGACY_PARITY_MATRIX_V1.md`, and `OPEN_ISSUES.md`; Legacy controls remain intentionally active until Phase 2 approval.

---

## [1.47.1] - 2026-11-17

### Fixed (Native Browser Structural Forecast Lifecycle, Rendering & Crosshair Reliability)
- **Root-Cause Fix for Empty Forecast Horizon Zone & Stranded `IDLE` State (`store.js`, `app.js`, `apiService.js`):**
  - Updated `reconcileTabStructuralForecastOnRender(tab)` so mismatched/stale `READY` or orphaned non-`COMPUTING`/`INSUFFICIENT_EVIDENCE`/`ERROR` states cleanly call `clearTabStructuralForecast(tab)` and reset `tab.showStructuralForecast = false` instead of stranding `showStructuralForecast: true` with blank future horizon slots.
  - Added `'showForecastBand'` to `INDICATOR_FLAG_KEYS` (keeping `'showStructuralForecast'` explicitly excluded so active forecast state never leaks across symbols) and preserved runtime forecast fields (`showStructuralForecast`, `showForecastBand`, `forecastHorizonBars`, `structuralForecast`, `structuralForecastStatus`, `structuralForecastError`) across `downloadWorkspaceSync()` tab rebuilds while persisting `showForecastBand` and `forecastHorizonBars` in `uploadWorkspaceSync()`.
  - Hydrated `activeTab.candles` before forecast launch in `toggle-structural-forecast` and `set-forecast-horizon`, set `structuralForecastStatus = 'COMPUTING'` synchronously before `renderApp()`, replaced silent `.catch(() => {})` handlers in `app.js` with explicit `ERROR` state rendering, and fixed the OHLC overlay pill trend-bias lookup to read `engine?.params?.structure_bias`.
- **Service Sequence Guard & Error Safety (`structuralForecastService.js`):**
  - Wrapped the full `requestStructuralForecastForTab` execution body in `try/catch`, sorted closed candles strictly in ascending chronological order, added monotonic `_structuralReqSeq` checks against stale async worker completions, and added bounded closed-candle boundary retry / explicit error reporting.
- **Canvas Slot Reservation, Global Origin Resolution & Future Crosshair (`chartRenderer.js`):**
  - Reserved future X-axis horizon slots only when a valid forecast (`hasAnyValidForecast`) actually contains forecast points; resolved `originOpenMs` across the full `candles` array (fixing panning/zooming disappearance); added fallback canvas guidance notice for orphaned state; and wired `structuralPoints` into future crosshair hover (`Structural JS (+step) · Path: ... · Band: [...]`).
- **Cache-Busting & Regression Verification:**
  - Unified cache-busting to `?v=1.47.1` across `index.html`, all ES modules under `host_subdomain/assets/js/`, `package.json`, and `host_subdomain/api/v1/system/status.php`.
  - Extended `STRUCTURAL-FORECAST-JS` in `tests/web_parity.test.mjs` with lifecycle reconciliation, canvas rendering, future crosshair hover, and silent-catch static regression checks (**12/12 passed** via `node --test tests/web_parity.test.mjs`).

### Removed (Dead / Temporary Files Cleanup)
- Removed obsolete/temporary unreferenced artifacts while preserving `/archive/` and inactive `Chronos-2` architecture files per prior decisions:
  - Deleted `/feasibility_test/` (`probe.php`, `runner.php`, `standalone_chronos.py`, `results/`).
  - Deleted dead stub `host_subdomain/assets/js/views/navigationView.js` and removed its unused `renderRightIconRail` import from `host_subdomain/assets/js/app.js`.
  - Deleted `host_subdomain/scripts/generate_chronos2_chart_preview.py` and the duplicate image `host_subdomain/data/chronos2/chronos2_spotbrent_chart_verification.png` (preserving the documentation copy in `docs/assets/`).

---

## [1.47.0] - 2026-11-17

### Added & Changed (Shared-Hosting Redesign: Native In-Browser Structural Wave Forecast `structural_wave_js`)
- **Pure Client-Side Structural Forecast Engine (`structuralForecastEngine.js`, `structuralForecastWorker.js`, `structuralForecastService.js`):**
  - Designed and shipped a zero-backend forecast engine running directly in the browser on real **closed OHLC candles** (`is_closed !== false`) strictly on explicit user click—requiring **no** PHP `exec()`, Python/PyTorch, Cron, or external API, and using zero `Math.random`/`Math.sin`/`Math.cos` or synthetic OHLC bars.
  - Preserved `chronos2` PHP/Python files intact and inactive on shared hosting while guaranteeing `engine.is_chronos2 === false` on all native browser forecast outputs.
  - Implements 7-stage structural analysis: ATR-filtered Swing High/Low extraction, trend/range regime classification (`BULLISH_STRUCTURE` / `BEARISH_STRUCTURE` / `ROTATIONAL_RANGE`), historical impulse/retracement leg ratios, volatility regime detection (`EXPANDING` / `COMPRESSING` / `NORMAL`), structured turning points, smooth central path (`q50_median`), and horizon-scaled quantile uncertainty bands (`q10`..`q90`) with honest `INSUFFICIENT_EVIDENCE` reporting.

---

## [1.46.0] - 2026-11-17

### Added (Phase 1 Real `amazon/chronos-2` Forecast Integration on CHART Canvas)
- **Official `amazon/chronos-2` Engine & Close-Only Univariate Contract (`chronos2_worker.py`):**
  - Connected official `amazon/chronos-2` at fixed Hugging Face revision `29ec3766d36d6f73f0696f85560a422f50e8498c` using the validated Python environment (`/tmp/chronos_venv/bin/python3`, `torch 2.15.0+cpu`, `transformers 5.23.0`, `chronos-forecasting 2.3.2`).
  - Strictly filters for closed candles only (`is_closed = 1` / `open_time_utc_ms + step_ms <= now_utc_ms`), extracts chronological `Close` prices (minimum 32 closed bars, default context 256 closed bars), and passes a 3D context tensor `(1, 1, history_length)` to `Chronos2Pipeline.predict()`.
  - Configurable prediction horizon (`15`, `30`, `45`, `60` future candles; default `30`).
  - Preserves all **21 native quantiles** (`0.01, 0.05, 0.10, ..., 0.50, ..., 0.99`) in `native_quantiles` per step, exposes `q50_median` (`Q50`) as the central forecast path and `q25`–`q75` for the optional uncertainty band, and generates **zero synthetic OHLC** and **zero Buy/Sell signals**.
- **PHP + Python + Cron Queue, Single-Instance Mutex & Deterministic Cache (`Chronos2QueueManager.php`, `chronos2_forecast.php`, `cron_process_chronos2_queue.php`):**
  - Implemented `Chronos2QueueManager` enforcing single-instance execution via non-blocking `flock(LOCK_EX | LOCK_NB)` on `host_subdomain/data/chronos2/chronos2_worker.lock` so only one Chronos-2 process ever runs at a time.
  - Deterministic cache key incorporates `symbol`, `provider`, `timeframe`, `origin_open_time_utc_ms` (last closed candle timestamp), `horizon`, and `model_revision` (`29ec3766d36d6f73f0696f85560a422f50e8498c`), with atomic cache writes to `host_subdomain/data/chronos2/cache/{SYMBOL}_{PROVIDER}_{TF}_{ORIGIN_MS}_H{HORIZON}.json`.
  - When the worker lock is busy, requests are queued into `host_subdomain/data/chronos2/queue/*.job.json` (`status: PROCESSING / QUEUED`) and drained sequentially by `host_subdomain/scripts/cron_process_chronos2_queue.php`.
- **Interactive CHART Canvas Rendering & Series-Switch Invalidation (`chartRenderer.js`, `store.js`, `apiService.js`, `headerView.js`, `app.js`):**
  - Added `Chronos-2` (`toggle-chronos-forecast`) and `Q25–Q75` (`toggle-chronos-band`) quick-toggle buttons to the CHART top header bar and full controls (including horizon selector `15 / 30 / 45 / 60` and custom color picker) inside the Indicators modal.
  - Extends the X-axis time scale to the right of the last closed candle when `offset === 0` and incorporates `Q50` and `Q25–Q75` into Y-axis auto-scaling.
  - Renders the origin vertical divider at the last closed candle, optional `Q25–Q75` shaded polygon band with dashed boundaries, distinct violet `Q50` central forecast line with step markers, right-axis price badges (`Q50`, `Q75`, `Q25`), processing status badge (`در حال پردازش...`), and crosshair step tooltip.
  - Enforced strict series-switch invalidation (`isChronosForecastMatchingTab` & `clearTabChronosForecast`) so changing symbol, provider, timeframe, or last closed candle timestamp immediately prevents stale forecasts from displaying.
- **End-to-End Verification (`SPOTBRENT` on `H1`, `M15`, `H4`, `D1`):**
  - Verified real closed-candle ingestion, model execution, caching, and chart rendering across `SPOTBRENT` (`tvdatafeed`) on `H1` (`origin: 2026-11-09T07:00:00Z`, `last_close: 99.848`, `step+1 Q50: 99.850`, `step+30 Q50: 100.422 [Q25: 97.523, Q75: 103.031]`, inference `0.1155s`, peak RSS `1003.18 MB`), `M15` (`origin: 2026-11-09T08:30:00Z`, `last_close: 99.546`, `step+1 Q50: 99.564`, `step+30 Q50: 99.568 [Q25: 98.509, Q75: 100.813]`, inference `0.1220s`), `H4`, and `D1`.
  - Saved visual chart verification artifact to `docs/assets/chronos2_spotbrent_chart_verification.png` and added `CHRONOS2-INTEGRATION` unit test in `tests/web_parity.test.mjs` (`10/10 passed`).

---

## [1.45.1] - 2026-11-17

### Changed & Fixed (Forecast Engine Archived for Ground-Up Redesign, Disabled Forecast Tabs & Web Timeframe-Switch Unblock)
- **Archived Legacy Forecast / Prediction Code into `/archive/` (Docs & SQL Migrations Preserved):**
  - Moved all Android, Web, PHP, Worker, Script, CI, and Test files belonging to the prior Forecast / Prediction implementation into `/archive/` preserving relative paths:
    - Android: `forecast/` package (14 files), `ForecastLabScreen.kt`, `PredictionScreen.kt`, `ForecastLabComponents.kt`, `ForecastV130Components.kt`, `ForecastV2Test.kt`, `Phase4ForecastTest.kt`.
    - Web & PHP: `host_subdomain/assets/js/forecast/`, `forecastView.js`, `analysisView.js`, `host_subdomain/api/v1/forecast/`, `host_subdomain/api/v1/forecast.php`.
    - Root tooling/tests/workers: `src/featureExtractor.js`, `src/forecastEngine.js`, `scripts/backtest.js`, `scripts/generateGoldenVectors.mjs`, `scripts/makeSampleData.js`, `data/sample_M15.json`, `tests/forecast_v2.test.mjs`, `tests/phase4_forecast.test.mjs`, `tests/golden_vectors_v2.json`, `.github/workflows/backtest.yml`, `python_worker/`, and `time-series-forecasting-dashboard/`.
  - Kept all specification and product-foundation documents in `/docs/` intact (including `docs/01-product/FORECAST_PRODUCT_FOUNDATION_V1.md`) and retained MariaDB migrations `host_subdomain/migrations/003_phase4_forecast_tables.sql` and `004_phase4_forecast_v2_columns.sql` untouched for the upcoming clean redesign.
- **Disabled Forecast / Prediction Entry Points Across Android & Web:**
  - Kept the **`Forecast`** navigation tab and Overview prediction CTA visible in place on both Android (`MainActivity.kt`, `MainViewModel.kt`, `WatchlistScreen.kt`) and Web (`headerView.js`, `watchlistView.js`, `theme.css`, `app.js`) in a **disabled (`disabled` / `aria-disabled="true"` / `.is-disabled`)** non-clickable state.
  - Decoupled and removed runtime forecast canvas overlays (`showFutureProjection = false`), forecast modals, and server forecast sync calls from `CandlestickCanvas.kt`, `ChartViewScreen.kt`, `ChartPreferenceCoordinator.kt`, `WorkspaceRepository.kt`, `chartRenderer.js`, `technicalIndicators.js`, `store.js`, and `apiService.js`; updated `host_subdomain/api/v1/system/status.php` phase label.
- **Fixed Web Timeframe-Switching Hang (`apiService.js` & `TvDatafeedAdapter.php`):**
  - Added per-symbol `AbortController` superseding (`inFlightSyncControllers` + `interactiveSyncSymbols`) and hard request timeouts (`fetchWithTimeout`: `10s` backend, `4s` static JSON, `4s` browser WebSocket) so rapid `M15 -> H1 -> H4 -> D1` switching cancels stale sync calls cleanly without stalling the UI.
  - Replaced the `PEPPERSTONE` default fallback in `resolveTradingViewWsSpec` with the complete 79-symbol exchange map and reduced background `syncAllWatchlistSymbols` batch concurrency to `2` while yielding whenever an interactive symbol sync is in flight.
  - Tightened `TvDatafeedAdapter.php` socket timeouts (`4.5s` connect, `4s` stream, `4.5s` deadline) and restricted secondary `H4 -> H1` socket fallback strictly to when primary `liveCandles` is empty or behind `expectedLastClosedOpenMs`.
- **Verified:**
  - Android build (`compile_applet`) succeeded cleanly after resolving a brace balance issue in `CandlestickCanvas.kt`.
  - Android unit & Robolectric tests (`gradle :app:testDebugUnitTest`): **28/28 passed** (`Phase1AlgorithmsTest`, `Phase2AlgorithmsTest`).
  - Web parity & timeframe-abort tests (`npm test` -> `node --test tests/web_parity.test.mjs`): **9/9 passed**. *(Note: `php` CLI is not installed in the build container, so PHP runtime changes were verified by code inspection.)*

## [1.45.0] - 2026-11-17

### Added & Changed (79-Symbol Global Equities Catalog Expansion & TradingView-Only Active Provider)
- **Expanded Canonical Catalog from 22 to 79 Symbols Across Android, Web, PHP & MariaDB:**
  - Added 57 global equities and AI/semiconductor/fintech/international leaders (`AVGO`, `MU`, `INTC`, `MRVL`, `AMAT`, `LRCX`, `QCOM`, `SMCI`, `DELL`, `SNDK`, `ANET`, `PLTR`, `ORCL`, `CRM`, `ADBE`, `CRWD`, `CSCO`, `APP`, `NBIS`, `CRWV`, `SPCX`, `RKLB`, `GEV`, `BE`, `IONQ`, `RIVN`, `JPM`, `BAC`, `GS`, `V`, `MA`, `BRK.B`, `HOOD`, `MSTR`, `PYPL`, `COIN`, `WMT`, `COST`, `DIS`, `SBUX`, `MCD`, `KO`, `LLY`, `UNH`, `PFE`, `XOM`, `CVX`, `TSM`, `ASML`, `SSNLF`, `SKHY`, `BABA`, `NVO`, `TM`, `SAP`, `HSBC`, `2222.SR`).
  - **Uncluttered Default Watchlist (`inWatchlist = false`):** All 57 newly added symbols appear in the **Settings** catalog, database (`chart_series`), and localized search (`strings.xml`, `values-fa/strings.xml`, `en.json`, `fa.json`) with `inWatchlist = false` by default so the initial 22-symbol watchlist remains uncluttered and users can selectively add symbols on demand.
  - **TradingView (`tvdatafeed`) Active Only:** Configured all 79 catalog entries with `activeProvider = tvdatafeed`, keeping other provider schemas disabled/locked in UI while preserving exchange mappings (`KRX:000660` for `SKHY`, `TADAWUL:2222` for `2222.SR`, `NYSE:BRK.B` for `BRK.B`, `AMEX:SPCX`, `OTC:SSNLF`) and chart ID normalization (`chart_brkb_stock`, `chart_2222sr_stock`).
  - **Database Migration:** Added `host_subdomain/migrations/005_expand_global_stocks_catalog.sql` (`INSERT IGNORE INTO chart_series`) and updated `ProviderCatalog.php`, `TvDatafeedAdapter.php`, `UtcTimeAnchor.php`, `ProviderId.kt`, `TvDatafeedAdapter.kt`, `StooqAdapter.kt`, `UtcTimeAnchorAlgorithm.kt`, `ForecastCalendarRegistry.kt`, `WorkspaceRepository.kt`, `SettingsScreen.kt`, `store.js`, `priceFormatter.js`, and `calendarRegistry.js`.
- **Verification:** Added 79-symbol catalog & TradingView-only assertions in `Phase1AlgorithmsTest.kt` and `tests/web_parity.test.mjs`.

## [1.44.0] - 2026-11-15

### Fixed & Enhanced (Forecast Studio UX, Full-Page Scroll & Multi-Timeframe Parity Across Web & Android)
- **Multi-Timeframe (`1h` / `4h` / `15m`) Forecast Direction Synchronization & Localized `POC` (`ForecastEngine` — Web & Android):**
  - **Localized Volume Profile (`POC / VAH / VAL`) Window:** Replaced the fixed 140-candle lookback in `extractMultiTimeframeFeatures` (`forecastEngine.js`, `ForecastEngine.kt`) with a timeframe-proportional window (`M15: 80, M30: 64, H1: 54, H4: 38, D1: 30` bars) and clamped `POC` within `lastClose ± 3.5 × ATR` so multi-month historical spikes (e.g., `114.810` on `SPOTBRENT 4h`) never pull near-term trajectories away from current price (`~98.548`).
  - **Synchronized `SCENARIO_A / B / C` Ranking & 10-Bar Sub-Bar Rollup:** Synchronized higher-timeframe (`4h`, `1h`) cluster ordering (`SCENARIO_A / SCENARIO_B / SCENARIO_C`) and blended posterior probabilities (`0.58 * ltfProb + 0.42 * htfProb`) with the lower timeframe during `Lower-TF Sub-Bar Anchoring`, and expanded `overlapBars` from `3` to `10` (`40 hours` on `H4`, `10 hours` on `H1`). Wired `higherTimeframe` and `higherTimeframeCandles` into both Web (`chartRenderer.js`) and Android (`CandlestickCanvas.kt`, `ChartViewScreen.kt`, `MainActivity.kt`) so chart overlays and Forecast Studio match 100%.
- **Holiday- & Early-Settlement-Aware Smart Gap Detector (`GapDetector` — Web, Android & PHP):**
  - Updated `host_subdomain/assets/js/algorithms/gapDetector.js`, `host_subdomain/api/v1/algorithms/GapDetector.php`, and `app/src/main/java/es/manico/chartintelligence/algorithms/GapDetectorAlgorithm.kt` to filter out US holiday early settlement closes (e.g., Labor Day 3-hour early close before `21:00 UTC` break) and single-day exchange holidays (Christmas, New Year's Day, Good Friday). Verified `0` false gaps (`CLEAN`) across `SPOTBRENT` `M15`, `H1`, `H4`, and `D1`.
- **Standard Document-Level Scrolling in Forecast Studio (Web):**
  - Enabled native `window`/`document` scrolling (`html.is-forecast-scroll`, `body.is-forecast-scroll`, `.tv-app-shell.is-forecast-view`) when viewing the `Forecast` workspace so Firefox and Chrome full-page screenshot extensions can scroll and capture the entire Forecast Studio page from top to bottom.
- **Two-State `Apply & View on Chart` Toggle (`✓` / `☐`) Across Web & Android:**
  - Updated `data-action="apply-forecast-to-chart"` (`app.js`, `forecastView.js`) and `applyForecastAndOpenChart` (`MainViewModel.kt`, `ForecastLabScreen.kt`) so clicking the button when already active (`✓`) unchecks it (`☐`) and disables `showFutureProjection` on the active chart tab; clicking when unchecked (`☐`) enables the overlay and opens the chart.
- **Forecast Studio Canvas Right Gutter & Card Grid Alignment (Web & Android):**
  - Added a dedicated right-hand price and quantile badge gutter (`padR = 112` on Web `#forecast-studio-canvas`; `92.dp` column on Android `ForecastMiniFanCanvas`) with vertical anti-collision spacing so `q90`, `q50`, and `q10` badges never overlap candlesticks or grid labels.
  - Fixed the 12-model comparison grid (`.ci-fc-models-comparison-grid`), prevented vertical character wrapping on the `APPROX` badge (`white-space: nowrap`), and equalized heights and bottom button alignment across the 3 SMC scenario cards and 5 Event Tree scenario cards.
- **Walk-Forward Backtest & Quantitative Evaluation Harness (`scripts/backtest.js`, `scripts/makeSampleData.js` & CI):**
  - Added standalone CLI Walk-Forward evaluation harness (`scripts/backtest.js`) comparing the forecast engine against the `Naive Persistence` baseline across MAE, RMSE, MAPE, Directional Accuracy, and Direction Distribution with optional CSV export.
  - Added realistic 960-bar continuous M15 sample data generator (`scripts/makeSampleData.js`) simulating trending, ranging, and volatility regimes.
  - Added root `package.json` scripts (`npm test`, `npm run backtest`, `npm run backtest:quick`, `npm run backtest:long`, `npm run make:data`) and GitHub Actions validation workflow (`.github/workflows/backtest.yml`).
  - Documented complete, unsummarized script source codes, acceptance criteria matrix, and honest statistical baseline in Section 9 of `docs/01-product/SMC_ANALOG_ENGINE_REFACTOR_SPEC.md` (superseded and removed in `v1.47.41` cleanup).

---

## [1.43.0] - 2026-11-15

### Changed & Streamlined (Top-Bar Workspace Consolidation, CSV-Only Export & Compact Status Dot)
- **Complete Removal of Web Right Navigation Rail & Consolidation into Top Header Bar:**
  - Removed the vertical right-hand dock rail (`.tv-right-rail`) from the web workspace (`navigationView.js`, `app.js`, `theme.css`).
  - Placed **`Chart`**, **`Forecast`**, **`Performance`**, **`Watchlist`**, and **`Settings`** navigation buttons directly in the top header bar next to the **Indicators** button (`headerView.js`).
  - Removed redundant quick-toggle buttons (Theme, Language, Logout) from the workspace bar since they are configured once inside **Settings**.
- **CSV-Only Data Export (Redundant `JSON` Export Button Removed Across Web & Android):**
  - Removed the `JSON` export button next to the screenshot camera in `headerView.js`, `watchlistView.js`, and Android `CandleExportButtonsRow` (`Phase2WorkspaceSheets.kt`), keeping a single clean **`CSV`** export button.
- **Minimal Blinking Market Status Indicator (`Live` / `Market Closed` Dot):**
  - Replaced verbose `"Market Closed"` / `"Live"` text pills in the top header bar (`headerView.js`) with a compact blinking green (`Live`) or pulsing red (`Market Closed`) status dot (`.ci-status-dot` with inline fallback styles) next to the `CSV` and camera buttons, matching Android's compact status dot (`ChartViewScreen.kt`).

---

## [1.42.0] - 2026-11-14

### Added (Phase 4: Independent, Modular Future Price Projection Engine v1)
- **Decoupled, Pluggable Core Forecast Architecture (`forecast-contract/v1`):**
  - Built an independent prediction core completely isolated from market data fetchers and chart UI/canvas renderers on **Web (`host_subdomain/assets/js/forecast/`)**, **Android (`app/src/main/java/es/manico/chartintelligence/forecast/`)**, and **PHP Backend (`host_subdomain/api/v1/forecast/`)**.
  - Enforced strictly statistical terminology across all contracts, UI, and tests (`q10..q90`, probabilities summing to `1.000`, `Bullish Expansion Scenario`, `Base Range Scenario`, `Bearish Contraction Scenario`, `Structural Pivot Reference`) with zero trading advice labels.
  - Added stationary log-return feature extraction ($r_t = \ln(C_t / C_{t-1})$), `DataReadinessGate`, pluggable `ForecastModelRegistry` / `modelRegistry.js` with live toggle/weight/parameter configuration (`NaivePersistence`, `ATR Volatility Cone`, `Kalman Filter`, `GARCH(1,1)`, `AR(2)+ETS`, `Gaussian Process Trend`), Purged Walk-Forward evaluation (`AcceptanceGate` vs `Persistence`), and session-aware calendar projection across all 6 timeframes (`M15..W1`, $h = 10..60$ bars).
- **Dedicated Forecast Studio / Forecast Lab Views & 3-Mode Chart Overlays:**
  - **Web (`views/forecastView.js`, `navigationView.js`, `chartRenderer.js`):** Added dedicated **Forecast Studio (`آزمایشگاه پیش‌بینی`)** tab and right-rail button with 4 sub-tabs (`Projection`, `Plugin Models`, `Walk-Forward`, `SHA-256 Ledger`), interactive SVG Fan Chart (`q10..q90` / `q25..q75` / `q50`), plugin weight & hyperparameter controls, and 3-mode canvas overlay (`Fan Chart`, `Ghost Candles`, `Hybrid`) synced via `store.js` and `apiService.js` (`?v=1.42.0`).
  - **Android (`ForecastLabScreen.kt`, `ForecastLabComponents.kt`, `CandlestickCanvas.kt`, `MainViewModel.kt`, `MainActivity.kt`):** Added dedicated **Forecast Lab** navigation destination with 4 Material 3 tabs, Jetpack Compose mini fan preview, plugin controls + honest `FORECAST_WORKER_URL` bridge, Walk-Forward benchmark table, SHA-256 ledger inspector, and 3-mode chart canvas projection overlay.
- **MariaDB Audit Schema, PHP API & Immutable SHA-256 Hash-Chained Ledger:**
  - Added `host_subdomain/migrations/003_phase4_forecast_tables.sql` (`prediction_models`, `prediction_runs`, `prediction_forecasts`, `prediction_scenarios`, `prediction_walkforward_benchmarks`) registered in `Database.php`.
  - Added `ForecastEnginePhp.php`, `api/v1/forecast.php`, honest remote worker probe (`LOCAL_STATISTICAL_ONLY` / `UNCONFIGURED` when unconfigured; never fabricates DL outputs or uses `TimesFM 3.0`), and version bump to `1.42.0` in `api/v1/system/status.php` and strings resources.
- **Verification:** Added `tests/phase4_forecast.test.mjs` (`PRED-01..04`) and `Phase4ForecastTest.kt` (Robolectric + Compose UI tests).

---

## [1.41.0] - 2026-11-14

### Added & Completed (Remaining Phase 1–3 Deliverables)
- **Full 4-Variant Pivot Points (`IND-01` Complete across Web, Android, and Workspace Sync):**
  - Expanded `TechnicalIndicators.computePivotPoints` (`technicalIndicators.js`) and `Phase2IndicatorsAlgorithm.computePivotPoints` (`Phase2IndicatorsAlgorithm.kt`) to compute all 4 variants: **`STANDARD`**, **`FIBONACCI`**, **`CAMARILLA`**, and **`WOODIE`**, including extended **`R3 / R4 / S3 / S4`** levels.
  - Added variant selector (`pivotType`) to the Web Indicators menu (`headerView.js`, `app.js`), Android Indicators sheet (`ChartViewScreen.kt`, `MainViewModel.kt`), and bi-directional cloud workspace sync (`store.js`, `apiService.js`, `WorkspaceRepository.kt`).
- **Phase 3 Historical Data Import, Lineage & Audit Schema (`ROADMAP_BACKLOG §3` Item 2):**
  - **SQL Audit Schema (`host_subdomain/migrations/002_phase2_3_tables.sql`):** Registered `stooq` and `local_csv` in `data_providers` and added non-destructive audit tables `data_import_batches`, `data_corrections`, `backup_records`, and `audit_logs` alongside MariaDB persistence wiring in `backup.php` and `candles_sync.php`.
  - **PHP Backend (`LocalCsvAdapter.php`, `api/v1/import_candles.php`, `ProviderCatalog.php`):** Implemented server-side historical ingestion supporting `CSV/TSV` (full OHLCV and DataHub 2-column daily series), `EIA RBRTEd.xls` (pure PHP binary `BIFF8 OLE2` parser with FAT/DIFAT/MiniFAT + `SST`/`RK`/`NUMBER`, `SpreadsheetML XML`, `HTML` table, and `TSV`), `JSON`, and manual `OHLC` entries, plus `GET` batch lineage history. Enforces **Strict No-Image-Storage Policy** (`ERR_IMAGE_UPLOAD_FORBIDDEN`) and forces 2-column daily series strictly to `D1` without fabricating intraday bars.
  - **Web & Android Parity (`candleImport.js`, `settingsView.js`, `CandleImportAlgorithm.kt`, `Phase3ImportCard.kt`):** Implemented client-side parsers (including pure JS/Kotlin binary `BIFF8 OLE2` readers), Settings -> `Sync` Historical Import UI and Manual OHLC modal using zero-permission Android `SAF` (`ActivityResultContracts.OpenDocument()`), `LOCAL_CSV` provider registration, batch lineage viewer, EN/FA translations, and unified `?v=1.41.0` cache-busters across all ES modules.
- **Safe PHP Runtime Diagnostics (`OPEN_ISSUES §4.1`):**
  - Added safe `php_runtime` diagnostics (`php_version`, `memory_limit`, `max_execution_time`, `upload_max_filesize`, `post_max_size`, and extension flags) to `api/v1/system/status.php` and rendered them cleanly inside Settings diagnostics on Web and Android.
- **Verification & Tests:** Extended `tests/web_parity.test.mjs` and `Phase2AlgorithmsTest.kt` with 4-variant Pivot Point formula tests and Phase 3 import/BIFF8/forced-`D1`/no-image-upload tests.

---

## [1.39.0] - 2026-11-13

### Added & Resolved (`OPEN_ISSUES` + `ROADMAP_BACKLOG §2.1–§2.3`)
- **Session & DST Alignment (`ENG-01`):** Unified `SessionCalendar` (`CRYPTO_24_7`, `US_EQUITIES` `09:30–16:00 America/New_York`, `OTC_FX_METALS` `17:00 America/New_York` rollover) across PHP (`UtcTimeAnchor.php`, `TimeframeAggregator.php`), Web (`priceFormatter.js`, `timeframeAggregator.js`), and Android (`UtcTimeAnchorAlgorithm.kt`, `TimeframeAggregatorAlgorithm.kt`).
- **Live Forming Quote Separation (`ENG-02`):** Added strictly read-only `api/v1/quote.php` (never mutates closed `candles` rows) and polling UI badges across Web & Android with strict `provider_id` isolation.
- **Smart Gap Detection (`ENG-03`):** Added session-aware `GapDetector` (`GapDetector.php`, `api/v1/gap_report.php`, `data_quality_reports` table in `002_phase2_3_tables.sql`, Web `gapDetector.js`, Android `GapDetectorAlgorithm.kt` & Audit Card).
- **Encrypted Backup, Restore & Rollback (`INF-01`, `INF-02`):** Added `PBKDF2-HMAC-SHA256` + `AES-256-GCM` workspace backup/restore (`api/v1/backup.php`, Web Settings, Android `BackupExportHelper.kt` via zero-permission SAF) stripping BYOK keys before sealing, plus pre-overwrite snapshots (`_ci_backups/`) and authenticated `api/v1/rollback_release.php` in `build-apk.yml`.
- **Security Hardening & Live Symbol Intel (`SEC-01`, `UI-01`):** Enforced strict `sanitizeSymbolCode()` (`[A-Z0-9._:-]`) and full `escapeHtml()` coverage; added `api/v1/symbol_intel.php` (15m MariaDB cache, Yahoo Finance RSS, EIA Energy RSS, SEC EDGAR `10-K/10-Q/8-K` for US Equities, Macro Calendar, and Intermarket correlations) with explicit local-vs-external source labels.
- **Phase 2 Multi-Anchor Drawing Tools (`§2.1`):** Implemented all 12 tool families (`AVWAP`, `Regression Channel`, `FRVP`, `Gann Fan`, `Gann Box`, `Pitchfork` with `Original / Schiff / Mod Schiff / Inside` variants, `Fib Time Zone`, `Cyclic Lines`, `Fib Speed Resistance Fan`, `ABCD`, `XABCD`, `Head & Shoulders`) with Magnet Mode, coordinate dragging, and cross-platform JSON sync.
- **Phase 2 Indicators, Killzones, Seasonals & Data Export (`§2.2`, `§2.3`):** Implemented `Parabolic SAR`, `Ichimoku`, `Keltner Channels`, `Donchian Channels`, non-lookahead `MTF EMA`, `ADX/DMI`, `Stochastic`, `CCI`, `Williams %R`, `OBV`, `CMF`, `ROC`, and `Killzones` (`Asia / London / New York / Overlap`); added honest `>= 12`-month gated `Multi-Year Seasonals` and RFC-4180 CSV / Canonical JSON candle export; unified Web cache-busting to `?v=1.39.0` and updated EN/FA localization.
- **Tests:** Added `Phase2AlgorithmsTest.kt` (Robolectric + JVM) covering `ENG-01`, `ENG-03`, `SEC-01`, `§2.1`, `§2.2`, and `§2.3`; all 24 unit/Robolectric tests in `Phase1AlgorithmsTest` and `Phase2AlgorithmsTest` pass cleanly.

---

## [1.38.1] - 2026-11-12

### Changed & Refined
- **Dual-Combo-Box Architecture in Settings Data Sources (Web & Android):**
  - Replaced the horizontal chip/pill train in Settings -> Data Sources & Symbols with two responsive combo boxes (dropdown menus) side-by-side:
    1. **Market Category Combo Box:** Allows selecting the market segment (`All (22)`, `Metals`, `Energy`, `Crypto`, `Indices`, `Stocks`, `Forex`) with dynamic item count badges.
    2. **Data Source / Provider Combo Box:** Allows selecting the collection provider (`TradingView Wick`, `biquote Feed`, `Twelve Data API`, `Dukascopy`, `Yahoo Finance`, `EIA FOB`) with real-time filtered symbol counts.
- **Watchlist Market Filter Dropdown (Web & Android):**
  - Replaced overflowing horizontal filter pills with a compact TradingView-standard dropdown combo box showing active category counts (`All (22)`, `Metals`, `Energy`, `Crypto`, `Indices`, `Stocks`, `Forex`).
- **Clean Bottom-Right Symbol Details Header (Web):**
  - Fixed duplicate symbol name repetition. Streamlined layout into a single clean header displaying `[Icon] SYMBOL · Clean Name` alongside a concise market category badge pill (e.g. `Energy`, `Metals`), removing redundant subtitle repetitions.
- **Documentation & Research Notes Added:**
  - Added `docs/GPT_CODE_REVIEW_RECOMMENDATIONS.md` containing GPT's technical review, data engine analysis, and prioritized 12-item bug fix backlog.

---

## [1.38.0] - 2026-11-12

### Security & Hardening
- **Zero Plain-Text Credentials:**
  - Completely purged plain-text password storage from `localStorage` in `apiService.js` and Android `SharedPreferences`. Replaced with secure SHA-256 password hashing with server-issued salt, token-based session persistence, and secure auto-authentication.
- **Hardened Database-First Architecture:**
  - Enforced strict MariaDB schema types, idempotent candle upserts, and sanitized API endpoints (`ApiEnvelope.php`, `auth.php`, `workspace_sync.php`, `candles_sync.php`, `system/status.php`).
- **BYOK (Bring Your Own Key) Isolation:**
  - Ensured custom API keys for Twelve Data, Stooq, Alpha Vantage, and Finnhub are isolated and never leak plain-text credentials into public error responses.

---

## [1.35.0] - 2026-11-12

### Added
- **Multi-Tab Chart Strip (`Multi-Tab Chart Bar`) (Web & Android):**
  - **Web (`headerView.js`, `theme.css`):** Replaced the single symbol button with a horizontal multi-tab strip (`.tv-open-tabs-strip`). Displays all open tabs with asset icons, symbol tickers, timeframes, active indicators, and individual close (`✕`) buttons. Includes a quick new tab (`+`) button opening the watchlist symbol picker.
  - **Android (`ChartViewScreen.kt`, `ChartTabBar.kt`):** Embedded `ChartTabBar` directly below the top compact 48.dp header bar, allowing 1-click tab switching across open charts with close buttons and smooth horizontal scrolling.
- **Grok's `Stooq` Free Historical EOD Data Provider (`stooq`) (Backend, Web & Android):**
  - **Backend (`StooqAdapter.php`, `ProviderCatalog.php`, `candles_sync.php`):** Implemented `StooqAdapter` resolving ticker symbols across Commodities (`cb.f`, `cl.f`), Metals (`xauusd`, `xagusd`), Currencies (`eurusd`, `gbpusd`, `usdjpy`), Crypto (`btcusd`, `ethusd`), Indices (`^spx`, `^ndq`), and US Equities (`nvda.us`, etc.). Parses multi-year Daily (`D1`) and Weekly (`W1`) closed candles with UTC midnight timestamping and filters out unclosed today bars.
  - **Web (`store.js`, `apiService.js`):** Integrated `stooq` into `PROVIDER_METHODS_CATALOG` and default symbol `allowedProviders`.
  - **Android (`StooqAdapter.kt`, `ProviderId.kt`, `WorkspaceRepository.kt`):** Implemented `StooqAdapter` satisfying `CandleProviderAdapter.fetchClosedCandlesUpToNow`, added `ProviderId.STOOQ` to method catalog and symbol allowed providers, and wired fallback resolution.
- **Personal API Keys Management (BYOK - Bring Your Own Key) (Backend, Web & Android):**
  - Added personal API key configuration for Twelve Data, Stooq, Alpha Vantage, and Finnhub in the `sync` settings tab (`settingsView.js` and `SettingsScreen.kt`). Keys persist locally and sync across devices via `workspace_sync.php`.
- **Transparent Price Basis & Sync Mode Metadata Badge (Web & Android):**
  - Displays explicit price basis (`Official FOB Spot`, `Interbank Spot`, `CFD / MT5 Feed`, `EOD Historical`, `Official Exchange`, `Spot REST`, `Futures Ref`) and sync mode (`DB_CACHE_HIT`, `DELTA_SYNC`, `INITIAL_BACKFILL`) metadata badges on the chart header status bar.
- **Package 2 & Package 3 Comprehensive Indicators, SMC & Volume Profile Engine:**
  - Added `M30` (`30m`) timeframe aggregation and selection across Web (`store.js`, `timeframeAggregator.js`) and Android (`TimeframeAggregatorAlgorithm.kt`, `AppConfig.kt`).
  - Added full overlay indicators (`SMA 20/50/200`, `EMA 20/50`, `Supertrend 10,3`, `Session VWAP`, `Bollinger Bands 20,2`) and lower sync panes (`Volume`, `RSI 14`, `MACD 12,26,9`, `ATR 14`).
  - Added automated Smart Market Structure (SMC) detection: `BOS / CHoCH`, `Equal Highs / Equal Lows (EQH / EQL)`, `Fair Value Gaps (FVG / Imbalance)`, and `Session Volume Profile VRVP` (`POC / VAH / VAL`).
- **Strict User Settings & Last State Retention Specification (`Settings Persistence`):**
  - Enforced mandatory persistence across local cache (`localStorage` / `SharedPreferences`) and MariaDB cloud sync (`workspace_sync.php`) for all user customizations—including custom candlestick colors, drawing line stroke widths (e.g. `2px` to `1px`), tool selections, timeframes, chart type, log/auto scales, and watchlist preferences—so they remain in their last configured state upon reopening, unless the explicit **"Reset to Defaults (`بازنشانی به تنظیمات اولیه`)"** action button is clicked.
- **Overlay Classic MACD Indicator Option (`Overlay Classic MACD`):**
  - Specified support for drawing Classic MACD line, signal curve, and histogram directly on the main chart canvas overlay (without opening a separate lower pane) alongside the standard lower pane oscillator mode.
- **Customizable Bollinger Bands Parameters (`Bollinger Bands Settings`):**
  - Added dedicated configuration inputs in the Settings / Indicators panel allowing users to adjust both the Period / Length (`default: 20`) and Standard Deviation Multiplier (`default: 2.0`) with real-time canvas recalculation and persistent storage.
- **Full Viewport Auto-Fit & Range Zoom Fix Specification (`Chart Range Zoom Fix`):**
  - Specified exact candle index bounds calculations, dynamic scale margin fitting, and auto-scale viewport adjustments when switching between timeframes (`1D`, `1W`) or selecting historical date ranges (`1D`..`6M`..`All`) to ensure 100% of visible candles render smoothly without truncation, clipping, or empty half-canvas gaps.

---

## [1.34.0] - 2026-11-11

### Added
- **TradingView-Style Chart Snapshot & Clipboard Copy (Web & Android):**
  - **Web:** Added a dedicated Camera icon button (`action_take_snapshot`) to the top header bar. Clicking it captures the live chart canvas (`#main-chart-canvas`), stamps a subtle branded watermark (`CHART INTELLIGENCE • SYMBOL • TF • UTC`), and directly copies high-resolution PNG image bytes to the system clipboard via `navigator.clipboard.write([new ClipboardItem(...)])`. Falls back gracefully to direct PNG image file download and displays a sleek floating toast notification (`snapshot_copied_success`).
  - **Android:** Added a Camera Snapshot action button (`Icons.Outlined.PhotoCamera`) in the top compact chart header bar (`ChartViewScreen.kt`), copying symbol, timeframe, price, and timestamp details to the clipboard and showing an instant confirmation toast.
- **Full Watchlist Symbol Reordering (Web & Android):**
  - **Web:** Enabled complete drag-and-drop symbol reordering via HTML5 draggable rows with a dedicated grip handle (`⠿`), drag preview styling, and drop indicator lines (`.tv-wl-drag-over-top` / `.tv-wl-drag-over-bottom`). Also included 1-click Move Up (`▲`) and Move Down (`▼`) buttons on each row for precise mobile & mouse control. Symbol order persists to `localStorage` and syncs with server user preferences.
  - **Android:** Added `reorderSymbol(symbolCode, direction)` in `MainViewModel.kt` updating the catalog order, saving via `repository.saveSymbolCatalog`, and debouncing cloud sync. Wired Move Up (`▲`) and Move Down (`▼`) touch buttons on each `WatchlistRowCard.kt` in `WatchlistScreen.kt`.

### Fixed & Resolved
- **Instant Timeframe Switch Responsiveness (`M15`, `H1`, `H4`, `D1`, `W1`):**
  - Resolved the issue where clicking timeframe buttons (`15m`, `1h`, etc.) would not immediately refresh the chart canvas until a subsequent button was clicked.
  - Enhanced `getCachedOrAggregatedCandles` in Web (`store.js`) and Android (`WorkspaceRepository.kt`) to support fallback candle aggregation across all timeframes (`M15` → `H1` → `H4` → `D1` → `W1`), and removed restrictive array length checks in `app.js` so `activeTab.candles` is ALWAYS updated immediately upon timeframe selection and explicitly redraws the canvas.
- **Scroll Position Preservation across State Updates (Web & Android):**
  - Resolved the issue where clicking a symbol in the watchlist or toggling settings caused the list to jump/reset to the top.
  - In Web `renderApp()`, captured and restored `scrollTop` and `scrollLeft` for `.tv-wl-list`, `.tv-symbol-details-pane`, `.tv-settings-body`, `.modal-body`, and `#tv-watchlist-top-pane`.
  - In Android `WatchlistScreen.kt`, bound `rememberLazyListState()` to `LazyColumn` to retain scroll index across recompositions.

---

## [1.33.0] - 2026-11-11

### Changed & Refined
- **Complete Vector Iconography for all 22 Instruments (Web & Android):**
  - Added brand-accurate vector iconography, gradients, and border tints for all US & global equities (`NVDA`, `AMZN`, `TSLA`, `AAPL`, `GOOGL`, `MSFT`, `META`, `NFLX`, `AMD`, `UBER`, `NKE`, `IBM`, `SAN`), Cryptos (`BTCUSD`, `ETHUSD`), and Indices (`SPX500USD`, `NDQ`) in Web `watchlistView.js` (`getAssetBadge`) and Android `WatchlistRowCard.kt` (`AssetSymbolBadge`). Every symbol in the watchlist now has a distinct, beautiful vector badge mark.
- **Elimination of Redundant Buttons in Right Details Panel:**
  - Removed the oversized duplicate button (`symbol_overview_seasonals & symbol_overview_key_data`) from below the symbol stats card in Web `watchlistView.js`. All stats (Volume, Prev Close, Open, Range Spread, Day High/Low) fit cleanly and harmoniously without redundant action buttons.
- **Left Tool Rail Color & Stroke Width Popups (Web & Android):**
  - Replaced the cluttered consecutive list of 6 color dots and 4 width buttons (`1px`..`4px`) with single compact trigger buttons opening clean popups:
    - **Web:** Interactive Color preview circle and Stroke Width button in `toolRailView.js` trigger floating `.rail-flyout-menu` popups with outside-click dismissal.
    - **Android:** Compact `COLOR` and stroke width trigger chips in `DrawingToolbar.kt` open Material 3 `DropdownMenu` popups with stroke previews.

---

## [1.32.0] - 2026-11-11

### Added
- **Canonical 22-Symbol Watchlist Catalog (`SPOTBRENT` to `SAN`) Across Server, Web, and Android:**
  - Expanded the pre-populated Watchlist and symbol catalog to all 22 canonical instruments in exact order:
    1. `SPOTBRENT` (Brent Crude Spot), 2. `ETHUSD` (Ethereum), 3. `BTCUSD` (Bitcoin), 4. `XAGUSD` (Silver), 5. `XAUUSD` (Gold Spot), 6. `SPX500USD` (US SPX 500), 7. `NDQ` (US 100 Nasdaq Index), 8. `EURUSD` (Euro / US Dollar), 9. `USOIL` (WTI Crude Oil CFD), 10. `NVDA` (NVIDIA), 11. `AMZN` (Amazon), 12. `TSLA` (Tesla), 13. `AAPL` (Apple), 14. `GOOGL` (Alphabet Class A), 15. `MSFT` (Microsoft), 16. `META` (Meta Platforms), 17. `NFLX` (Netflix), 18. `AMD` (Advanced Micro Devices), 19. `UBER` (Uber Technologies), 20. `NKE` (Nike), 21. `IBM` (IBM), 22. `SAN` (Banco Santander).
- **`biquote` Multi-Asset Data Provider (`METHOD_BIQUOTE_FEED` / `BiquoteAdapter`):**
  - Added `biquote` as the 6th independent data collection method in `ProviderCatalog.php`, `BiquoteAdapter.php`, `candles_sync.php`, Web `store.js`, and Android `ProviderId.kt` / `BiquoteAdapter.kt`, supporting incremental `DELTA_SYNC` (`since_ms`) for `BTCUSD`, `ETHUSD`, `XAGUSD`, `XAUUSD`, `SPOTBRENT`, `USOIL`, and `EURUSD`.
- **Asset-Class Data Source Priority Chains:**
  - Configured default active providers and ordered fallback/selection chains per asset class:
    - **Commodities & Metals:** `XAUUSD` (`twelve_data` → `biquote` → `dukascopy` → `yahoo_finance` → `tvdatafeed`), `XAGUSD` (`biquote` → `twelve_data` → `yahoo_finance` → `dukascopy` → `tvdatafeed`), `SPOTBRENT` (`tvdatafeed` → `dukascopy` → `biquote` → `yahoo_finance` → `twelve_data` → `eia_brent_spot`), `USOIL` (`tvdatafeed` → `yahoo_finance` → `biquote` → `twelve_data`).
    - **Forex:** `EURUSD` (`tvdatafeed` → `twelve_data` → `biquote` → `dukascopy` → `yahoo_finance`).
    - **Crypto:** `BTCUSD` & `ETHUSD` (`biquote` → `yahoo_finance` → `twelve_data` → `tvdatafeed`).
    - **Indices:** `SPX500USD` & `NDQ` (`yahoo_finance` → `tvdatafeed` → `twelve_data`).
    - **US & Global Equities (`NVDA`..`SAN`):** `yahoo_finance` (primary) → `twelve_data` → `tvdatafeed`.
- **Expanded Watchlist Asset-Class Filter Chips & Custom Vector Badges (Web & Android):**
  - Added `CRYPTO`, `INDICES`, and `STOCKS` category filter chips alongside `ALL`, `METALS`, `ENERGY`, and `FX` in both `watchlistView.js` and `WatchlistScreen.kt`, plus custom circular asset badges in `WatchlistRowCard.kt` and `watchlistView.js`.

---

## [1.31.0] - 2026-11-11

### Added
- **DB-First Incremental Historical Candle Persistence Engine (`candles_sync.php` & Adapters):**
  - Refactored the central server candle pipeline so MariaDB `candles` is queried **first** (`stored_count`, `min_open_time_utc`, `max_open_time_utc`).
  - Implemented 3-state incremental sync machine:
    1. `DB_CACHE_HIT`: Returns stored historical candles directly from MariaDB with **0 external API/socket calls** when `max_open_time_utc >= expected_last_closed_open_ms`.
    2. `DELTA_SYNC`: Computes the exact missing candle count (`missingBars`) since `max_open_time_utc` and fetches **only newly closed candles** from the selected provider adapter, appending them idempotently to MariaDB.
    3. `INITIAL_BACKFILL`: Fetches full initial history (up to 5,000 bars) only when the database has no stored history for `(chart_id, provider_id, timeframe)` or when `backfill=1` is explicitly requested.
  - Added `sync_meta` envelope (`sync_mode`, `stored_total_bars`, `fetched_new_bars`, `min_open_time_utc_ms`, `max_open_time_utc_ms`, `provider_status`) to `candles_sync.php` responses.
- **Isolated Provider Methods Catalog & Registry (`/api/v1/providers/ProviderCatalog.php` & `/api/v1/providers_catalog.php`):**
  - Created a centralized, structured catalog of all 5 independent collection methods (`tvdatafeed` TradingView Wick & WebSocket Engine, `twelve_data` Twelve Data REST Time-Series API, `dukascopy` Dukascopy Swiss Bank Feed, `yahoo_finance` Yahoo Finance v8 Chart Engine, and `eia_brent_spot` U.S. EIA Official Daily FOB Benchmark) with their algorithm formulas, exchange/ticker mappings, supported timeframes, and live MariaDB candle counts.
  - Enforced strict provider isolation (`UNIQUE(chart_id, provider_id, timeframe, open_time_utc)`) and removed silent cross-provider fallback from `TwelveDataAdapter`, `TvDatafeedAdapter`, and `DukascopyAdapter` across Server and Android so one provider's dataset never contaminates another's.
- **Dual-Mode Data Source & Symbol Watchlist Explorer in Settings (Web & Android):**
  - Upgraded the **همگام‌سازی (`sync`)** tab in Web (`settingsView.js` + `app.js`) and Android (`SettingsScreen.kt` + `ProviderCatalog.kt`) to support both workflows simultaneously:
    - **By Source Method (`انتخاب بر اساس منبع داده`):** Select a collection method (`TradingView Wick`, `Twelve Data API`, `Dukascopy`, `Yahoo Finance`, `EIA Spot`) to inspect its algorithm specification and add/activate any of its supported symbols in the Watchlist.
    - **By Symbol (`انتخاب و جستجو بر اساس نماد`):** Search or pick a symbol to see all compatible collection methods, compare stored candle counts, and switch its active provider.

---

## [1.30.0] - 2026-11-10

### Added
- **Fib Retracement Tool (اصلاح فیبوناچی) Across Web & Android:**
  - Implemented 2-point market-coordinate Fibonacci Retracement drawing tool computing all 7 standard levels (`0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0`).
  - Added dedicated Golden Pocket highlight (`0.500 - 0.618`) shaded in translucent amber (`#F59E0B`), secondary zone shading (`0.382 - 0.500`), dashed anchor trend line, and level pills with exact market prices.
  - Full persistence across database, local cache, and cloud workspace sync (`fib_retracement`).
- **Long Position & Short Position Tools (موقعیت خرید و فروش) Across Web & Android:**
  - Implemented trade planning and simulation tools with Take Profit (`#26A69A` green zone), Stop Loss (`#EF5350` red zone), Entry divider (neutral white), and dynamic Risk/Reward ($R/R$) ratio badges.
  - Automatically calculates Risk/Reward ratio, Target %, and Stop % in real time based on candle prices.
  - Full persistence across database, local cache, and cloud workspace sync (`long_position`, `short_position`).
- **Magnet Mode (حالت آهنربا - آیکون آهنربا 🧲) Across Web & Android:**
  - Added cursor and touch magnet snapping in `DrawingGeometryAlgorithm.kt` and `drawingGeometry.js` (`snapToCandleOhlc`).
  - When active, taps and cursor placements snap with zero jitter to the closest candle Open, High, Low, or Close (OHLC) level on the nearest candle bar.
  - Added haptic pulse on Android when magnet snaps to a wick or candle body.
  - Added dedicated 🧲 button in Android floating toolbar & bottom sheet (`DrawingToolbar.kt`) and Web left rail (`toolRailView.js`).
- **Central Core Engine & Bi-Directional Auto-Sync (`P0-CORE-SYNC`, `P1-UPG-10`, `docs/architecture.md`):**
  - Unified Web (`store.js` + `apiService.js`) and Android (`WorkspaceRepository.kt` + `MainViewModel.kt`) under a single server-authoritative JSON Workspace Contract (`workspace_sync.php`) with 800ms debounced bi-directional auto-sync, canonical drawing keys (`${symbolCode}_${timeframe}`), and 6-char hex color normalization.
  - Authored comprehensive Sync Protocols specification in `docs/architecture.md` (and `docs/ARCHITECTURE.md`) detailing the canonical JSON schemas for `open_tabs`, `drawings`, `symbols`, and `preferences`.
  - Resolved `SyntaxError: export declarations may only appear at top level of a module` in `host_subdomain/assets/js/core/store.js`, exported `computeChartGeometry` in `chartRenderer.js`, and unified all ES6 module import URLs across `host_subdomain/assets/js/` to `?v=1.30.0` so `window.__CI_APP_MOUNTED__` activates reliably with a single reactive `state` singleton.
- **Categorized 5-Group Settings Architecture (`P1-UPG-9` — Sync, Chart, Notifications, Theme, Account):**
  - Structured `ChartPreferences.kt` (`SettingsCategoryGroup`, `ChartSettingsGroup`, `NotificationSettingsGroup`, `ThemeSettingsGroup`), `strings.xml` / `values-fa/strings.xml`, Android `SettingsScreen.kt`, and Web `settingsView.js` into 5 distinct groups: **همگام‌سازی (`sync`)**, **چارت (`chart`)**, **نوتیفیکیشن (`notifications`)**, **تم (`theme`)**, and **حساب (`account`)**.
- **Full Symbol Overview Analytical Suite (`P1-UPG-6`) & Watchlist Ergonomics (`P1-UPG-7` & `P1-UPG-8`):**
  - Implemented all 10 analytical cards and 4 sub-tabs (`Overview | News | Minds | Ideas`) in the Symbol Overview sheet/modal across Android (`WatchlistScreen.kt`) and Web (`watchlistView.js`), including `Flash News` banner, `Key data points` with visual `Day's range` bar, `Seasonals`, `Technicals Speedometer Gauge`, `Analyst Rating & 1Y Target Gauge` with `See forecast >` action, `Income Statement` (`Annual/Quarterly`), `Dividends & Yield`, and copyable `FIGI`/`ISIN` identifiers.
  - Enforced strict 48dp touch targets, `prefers-reduced-motion: reduce` support, and Watchlist quick refresh/remove actions across Web and Android.
- **Algorithm Unit Tests (`Phase1AlgorithmsTest.kt`):**
  - Added comprehensive test cases for `drawingGeometry_magnetSnap_snapsToNearestOhlc` and `chartDrawing_fibRetracementAndPositions_computeExactFormulas` (12/12 passing).

---

## [1.29.1] - 2026-11-10

### Added
- **Live Host MariaDB & Server Health Diagnostics (`/api/v1/system/status.php` & `/api/v1/status.php`):**
  - Added system health endpoint providing real-time MariaDB connection status, engine version (`MariaDB 10.6.28`), total candles stored in database, per-symbol/timeframe candle statistics, server UTC clock, and registered owner status.
  - Added live Diagnostic Health Card in Settings on both Web (`settingsView.js`) and Android (`SettingsScreen.kt`) with live connection indicators, DB candle count badges, server UTC timestamps, and one-tap cloud sync.
- **Cross-Device Cloud Workspace Synchronization (`/api/v1/workspace_sync.php`):**
  - Created idempotent cloud sync endpoint backed by MariaDB `user_workspace` table (`001_phase1_init.sql`) with session token authentication and local fallback (`config/workspace.local.json`).
  - Implemented bidirectional workspace upload and download on Web (`apiService.uploadWorkspaceSync` / `downloadWorkspaceSync`) and Android (`WorkspaceRepository.syncWorkspaceToCloud` / `loadWorkspaceFromCloud`) for drawings, watchlist, and preferences.
- **Weekly (`W1`) Timeframe in Python Background Sync & GitHub Actions Seeding (`sync_tvdatafeed.py` & `build-apk.yml`):**
  - Added `W1` specification (`7 * 24 * 60 * 60 * 1000 ms`), TradingView `1W` resolution mapping, weekly UTC boundary snapping, and `D1`-to-`W1` aggregation fallback to `sync_tvdatafeed.py`.
  - Added `W1` to the automated database seeding loop in `.github/workflows/build-apk.yml` (`['M15', 'H1', 'H4', 'D1', 'W1']`).
- **Multi-Tab Chart Viewport State Persistence (`ci_open_tabs_v2`):**
  - Added persistence for active tabs, timeframe, zoom (`visibleCount`), scroll offset, drawings, and indicators per symbol tab in Web `store.js` (`ci_open_tabs_v2`) and Android `ChartTabState`, ensuring switching between Gold and Oil never resets custom chart viewport settings.

---

## [1.29.0] - 2026-11-10

### Added
- **100% Web & Android Cross-Platform Feature & Visual Parity (`v1.29.0`):**
  - **Custom Vector Asset Icon Badges Everywhere (`AssetSymbolBadge` on Android & `renderAssetIcon` on Web):**
    - Replaced plain text circle badges (`Au`, `OIL`) across every screen on both platforms with custom gradient + vector emblems: **Gold Bullion Bars** (`XAUUSD`), **Crude Oil Droplet** (`SPOTBRENT`, `BRENT_FUTURES`), **Silver Bullion** (`XAGUSD`), and **Euro FX Emblem** (`EURUSD`).
    - Rendered consistently in Watchlist rows, Watchlist Symbol Details / Overview sheet, `+` Add/Manage Symbols modal/sheet, Top Chart Header & Symbol Picker, Prediction Header & Symbol Picker, and Settings Data Sources & Symbol cards.
  - **Unified 5-Section Settings Modal & TradingView Pill Switches on Web (`settingsView.js` & `theme.css`):**
    - Restyled the Web Settings modal with structured horizontal pill tabs (`.tv-modal-tab`), card rows (`.tv-settings-symbol-row`), and animated TradingView toggle switches (`.tv-toggle-switch`).
    - Added full parity with Android Settings: all **5 customizable chart colors** (`bullColor`, `bearColor`, `trendColor`, `hLineColor`, `vLineColor`) + Reset Colors button + **Live 3-Candle & Drawing Lines SVG Preview**, all **3 algorithm parameter sliders** (`candleFetchLimit` 100..5000, `zoomStepCandles` 5..50, `drawingHitTolerancePx` 10..48px) + Reset Params button, and all **11 TradingView behavior & overlay switches**.
  - **Android Timeframes (`15m..1W`), 11 Historical Date Ranges (`1D..All`), Smart X-Axis & Nice Round Y-Axis (`PriceFormatterAlgorithm.kt`, `CandlestickCanvas.kt`, `MainViewModel.kt`, `ChartTabState.kt`):**
    - Added Weekly (`W1` / `1W`) timeframe aggregation and top-bar selection to Android (`AppConfig.SUPPORTED_TIMEFRAMES`, `UtcTimeAnchorAlgorithm.kt`, `TimeframeAggregatorAlgorithm.kt`).
    - Upgraded Android bottom Date Range bar to all 11 presets (`1D`, `5D`, `1W`, `1M`, `3M`, `6M`, `9M`, `YTD`, `1Y`, `5Y`, `All`) with automatic TradingView candle resolution switching (`1D->M15`, `5D/1W->H1`, `1M->H4`, `3M..1Y->D1`, `5Y/All->W1`).
    - Ported `computeNicePriceTicks` (institutional round Y-axis steps `1, 2, 2.5, 5 × 10^n`) and `computeSmartTimeAxisTicks` (span-aware UTC Year/Month/Day/Hour X-axis labels with collision prevention) to Android `CandlestickCanvas.kt`, and suppressed intraday countdown on `D1`/`W1`.
  - **Unified 4 Technical Indicators Across Web & Android (`SMA 20`, `EMA 50`, `Bollinger Bands (20, 2)`, `Volume` with `16% / 22% / 30%` height):**
    - Added `EMA 50` (`#00BCD4`) and `Bollinger Bands (20, 2)` (`#AB47BC` upper/lower bands + translucent fill) to Android `PriceFormatterAlgorithm.kt`, `CandlestickCanvas.kt`, `ChartViewScreen.kt`, and `MainViewModel.kt`, matching Web `chartRenderer.js`.
  - **Watchlist Search Input + Category Filter Chips (`ALL | METALS | ENERGY | FX`) Across Both Platforms:**
    - Added live Watchlist search input (`watchlist_search_input`) alongside category filter chips (`ALL`, `METALS`, `ENERGY`, `FX`) and `+` Symbol Manager on both Web (`watchlistView.js`) and Android (`WatchlistScreen.kt`).

---

## [1.28.9] - 2026-11-10

### Added
- **Smart Span-Aware Horizontal Time Axis & Automatic Date-Range Timeframe Resolution (`priceFormatter.js`, `chartRenderer.js`, `app.js`):**
  - Implemented `PriceFormatter.computeSmartTimeAxisTicks(visible, chartW, timeframe)` which inspects both the active timeframe (`M15`, `H1`, `H4`, `D1`, `W1`) and the visible calendar span (`spanDays`) to snap vertical grid lines and X-axis labels onto exact UTC **Year** boundaries (`2025`, `2026`), **Month** starts (`Mar`, `May`, `Jul`, `Sep`, `Nov`), **Day** boundaries (`4 Nov`, `5 Nov`), or **Round Hours** (`02:00`, `04:00`) with collision prevention (`minPxGap = 82px`).
  - Clicking bottom Date Range presets (`1D`, `5D`, `1W`, `1M`, `3M`, `6M`, `9M`, `YTD`, `1Y`, `5Y`, `All`) now automatically switches to the appropriate candle resolution (`M15` for `1D`, `H1` for `5D`/`1W`, `H4` for `1M`, `D1` for `3M`/`6M`/`9M`/`YTD`/`1Y`, `W1` for `5Y`/`All`) and computes the exact `visibleCount` covering that historical cutoff (`up to 600 bars`).
  - Added `W1` (`1W` Weekly) candle aggregation across `TimeframeAggregator` (`timeframeAggregator.js` and `TimeframeAggregator.php`) and added `1W` to the top timeframe selector bar.
- **Heckbert Nice-Number Y-Axis Price Scaling (`priceFormatter.js` & `PriceFormatterAlgorithm.kt`):**
  - Implemented Heckbert's nice-number step algorithm (`1, 2, 2.5, 5 × 10^n`) on both Web (`computeNicePriceTicks`) and Android (`computeNiceAxisBounds`) so the right-hand vertical price axis always renders clean, human-readable round numbers (e.g., `120.00, 110.00, 100.00, 90.00, 80.00, 70.00` for Brent Crude and `4100.00, 4050.00` for Gold) instead of arbitrary fractional numbers.
- **Watchlist Circular Vector Asset Icons & Container-Query Responsive Sidebar (`watchlistView.js` & `theme.css`):**
  - Replaced plain text badges (`Au`, `OIL`) in the Watchlist and Symbol Details pane with custom circular gradient SVG icons: Gold Bullion (`XAUUSD`), Crude Oil Droplet (`SPOTBRENT`, `BRENT_FUTURES`), Silver Bullion (`XAGUSD`), and Forex Emblem (`EURUSD`).
  - Applied `container-type: inline-size; container-name: rightpanel;` and `@container rightpanel` rules on `.tv-right-panel` (`185px..520px`) so dragging the sidebar narrower automatically hides secondary columns (`Chg`), wraps localized instrument subtitles (`overflow-wrap: anywhere`), scales price typography with `clamp()`, and reflows the key stats grid (`repeat(auto-fit, minmax(84px, 1fr))`) with zero text overflow or clipping.
- **Consolidated TradingView Desktop Workspace, Zero Duplicate Controls & Interactive Drag Resizers:**
  - Unified all 4 core workspace navigation items (**Watchlist**, **Chart / Symbol Overview**, **Prediction**, **Settings**) exclusively inside the Right Dock Rail (`navigationView.js`), and eliminated all duplicate Symbol Overview buttons (`⊞` grid icon and `عملکرد فصلی و داده‌های کلیدی` button in `.tv-symbol-details-pane`), duplicate `+` Add Symbol button in the top bar, duplicate `↻` Sync / `›` Collapse buttons in the Watchlist header, and duplicate `TVDATAFEED` / live status labels.
  - Added a single unified **Indicators (`اندیکاتورها`)** button in the top bar opening the Indicators Modal (`SMA 20`, `EMA 50`, `Bollinger Bands (20, 2)`, and `Volume Histogram` with `16% / 22% / 30%` height presets).
  - Added interactive drag resizer handles for the Right Panel width (`.tv-col-resizer`, `185px..520px`) and the Watchlist / Symbol Details vertical split ratio (`.tv-row-resizer`, `22%..78%`), persisted in `localStorage`.
- **Session Persistence (`Remember Me`), Modern Auth Landing Dashboard & Startup Watchdog (`loginView.js`, `LoginScreen.kt`, `index.html`, `app.js`):**
  - Added persistent session & credential storage (`ذخیره نام کاربری و رمز عبور / ورود خودکار`) and password visibility toggle across Web (`localStorage` + `auth.php`) and Android (`WorkspaceRepository` + `LoginScreen.kt`).
  - Replaced the static startup screen in `host_subdomain/index.html` with a TradingView Pro landing shell featuring a live market preview card, startup watchdog timer, and fallback error boundary (`renderFallbackErrorBoundary`).

### Fixed
- **Backend PHP Fatal Error (`TimeframeAggregator::aggregate()`):**
  - Added the static `aggregate(array $candles, string $targetTf): array` method in `host_subdomain/api/v1/algorithms/TimeframeAggregator.php` and `host_subdomain/assets/js/algorithms/timeframeAggregator.js`, resolving the fatal error in `TvDatafeedAdapter.php` during `candles_sync.php`.
- **High-DPI Canvas Overflow & Bottom Bar Clipping (`theme.css`, `watchlistView.js`, `chartRenderer.js`):**
  - Positioned `#main-chart-canvas` with `position: absolute; inset: 0;` inside `.chart-canvas-box` (`flex: 1; min-height: 0; overflow: hidden;`) so high-DPI `<canvas>` scaling never pushes `.tv-bottom-bar` (`1D..All`, `UTC`, `log`, `auto`) below the viewport.
  - Suppressed the intraday `HH:MM:SS` countdown label on `1D` and `1W` timeframes so daily/weekly price pills display only the live price.

---

## [1.28.1] - 2026-11-08

### Added
- **Phase 1 Pro Upgrade Pack (`P1-UPG-1` through `P1-UPG-5`) Across Android & Web:**
  - **`P1-UPG-1` (Long-Press Crosshair Scrubbing, Magnifier & Haptics):** Implemented `detectDragGesturesAfterLongPress` in `CandlestickCanvas.kt` with candle-by-candle haptic feedback (`HapticFeedbackType.TextHandleMove`), floating scroll magnifier pill (`showScrollMagnifier`), and picker haptic feedback (`pickerVibrates`).
  - **`P1-UPG-2` (Situational Awareness Overlays & Logarithmic Scale):** Added Logarithmic price scale (`ln(price)` / `exp(s)`), dashed `Previous close` line, live UTC `Candle Countdown Timer` (`mm:ss` / `hh:mm:ss` / `Closed`) under the current price pill, automatic `Visible High / Low` wick callout labels, draggable volume splitter handle, floating `Scroll-to-Latest («⏭»)` button when scrolled back `> 5` bars, and `[Auto] [Log]` quick axis badges.
  - **`P1-UPG-3` (TradingView Symbol Overview Sheet, Key Data Points & Seasonals):** Added the Symbol Overview BottomSheet (`WatchlistScreen.kt` & `watchlistView.js`) featuring the `SYMBOL • PROVIDER` header, interactive mini-candlestick chart with dashed previous close line, `1D..All` range chips + `[⛶]` Open Full Chart button, `Key data points` card (`Volume`, `Previous close`, `Open`, `Day's range`), and `Seasonals` (`2026 / 2025 / 2024`) multi-year performance chart, plus Watchlist search filter, Day's range bar, and `Hide logos` switch.
  - **`P1-UPG-4` (Prediction Visual Pivot Ladder & Direct Chart Level Projection):** Added the visual `S2 — S1 — P — R1 — R2` price position ladder and the **"Project Scenario Levels onto Chart"** action button inside `PredictionScreen.kt` and `analysisView.js` to draw labeled Pivot/Target/Invalidation horizontal lines directly on the symbol's chart.
  - **`P1-UPG-5` (TradingView Behavior Switches, Live 3-Candle Color Preview & Sync Diagnostics):** Added all 8 TradingView switches (`Hide logos`, `Show symbol screen`, `Chart vibrations`, `Logarithmic scale`, `Remember the last opened chart on this device`, `Hide the tab bar in landscape`, `Picker vibrates`, `Show picker scroll magnifiers`), a live 3-candle color preview canvas, and cached bar count + UTC timestamp diagnostics in `SettingsScreen.kt` and `settingsView.js`.

### Fixed
- **Web Terminal Chrome & Firefox Overhaul (`P1-UPG-WEB`):**
  - Fixed RTL `<canvas>` text-alignment corruption in Chrome and Firefox by enforcing `ctx.direction = 'ltr'; ctx.textAlign = 'left';` in `chartRenderer.js` and `dir="ltr"` on `.tv-main-area` and `.chart-workspace`, keeping right-axis price numbers inside the axis column, centering text inside current-price and crosshair pills, and preventing `Vol:` label clipping.
  - Fixed black-on-black text contrast in `.floating-ohlc-bar`, locked TradingView Dark (`#131722`) as the default theme (`ci_theme_v2`), loaded `Vazirmatn` and `JetBrains Mono` Google Fonts in `host_subdomain/index.html` with `?v=1.28.1` cache-busting, replaced primitive emojis with crisp inline `SVG` icons, and removed the duplicate Watchlist drawer header.

---

## [1.28.0] - 2026-11-08

### Added
- **Consolidation of All Markdown Documentation into `docs/` Folder:**
  - Relocated all markdown specification and architectural documents (`CHART_INTELLIGENCE_MASTER_SPEC.md`, `DESIGN_WORKSPACE_SPEC.md`, `UI_UX_MOBILE_REDESIGN_SPEC.md`, `ARCHITECTURE.md`, `INFRASTRUCTURE_INVENTORY.md`, `AGENTS.md`, `CHANGELOG.md`, `TRADING_STRATEGY_SPEC.md`, `CONTRIBUTING.md`, `SECURITY.md`) into the `docs/` directory to prevent clutter, reduce human error, and keep all specifications unified in one dedicated place, leaving exclusively `README.md` in the workspace root.
  - Updated cross-document relative links in `README.md`, `docs/PROJECT_GUIDE.md`, and `docs/AGENTS.md`.
- **Integration of Grok's Professional TradingView Design Recommendations (`UI_UX_MOBILE_REDESIGN_SPEC.md`):**
  - Incorporated official TradingView financial dark theme tokens into the specification: canvas background `#131722`, panel background `#1E222D`, grid lines `#2A2E39`, primary text `#D1D4DC`, muted text `#787B86`, bullish candlestick `#26A69A`, bearish candlestick `#EF5350`, and dotted crosshair `#758696`.
  - Added concrete Web `LightweightCharts.createChart` configuration parameters (scale margins, right price scale border `#2A2E39`, time scale visibility).
  - Specified interactive Multi-Pane synchronization with synchronized time scale scrolling and drag resize handles.
  - Formulated comprehensive Priority Matrix (P0 to P3) spanning Insets, Dark Palette, Flat Candle Filtering, Compact Watchlist, Live Legend, and Ergonomic Touch/Double-tap interactions across Android and Web.
- **Chart Workspace Structural & Interactive Specification (`DESIGN_WORKSPACE_SPEC.md`):**
  - Created comprehensive execution blueprint covering Desktop and Mobile structural layouts (ASCII wireframes), exact bar/panel dimensions, interactive behaviors for Top Header, Semantic Market Statuses, Unified Top Subbar, Live OHLC Legend, Drawing Toolbar & Object Lifecycle, Price/Time Scales, Multi-Pane Time-Scale Sync, Design Tokens, and P0–P3 implementation phases.
- **Integration of GPT Architectural & UX Specifications (`UI_UX_MOBILE_REDESIGN_SPEC.md`):**
  - Added product differentiation triangle: TradingView in appearance + TradingView in interaction + CHART in intelligence (market structure & prediction engine).
  - Defined 5 semantic market states (`Live`, `Market Closed`, `Delayed`, `Cached`, `Error`) to replace simplistic green dot indicator.
  - Specified interactive drawing object lifecycle (Hit-testing, translation/drag handles, quick floating toolbar for color/width, and coordinate anchoring to UTC time and price).
  - Formulated desktop vs. mobile ergonomic parity (vertical left drawing toolbar on desktop, floating pencil action button + BottomSheets on mobile).
- **Root Cause Diagnosis & Full Resolution of XAUUSD M15 Weekend Anomaly:**
  - Diagnosed flat-candle comb/barcode artifact on 15m Gold chart caused by Twelve Data weekend bid/ask spread ticks with static open price (`4065.98607000`) and 0 volume triggering canvas auto-scale over-zoom.
  - Implemented `filterSyntheticWeekendAndCombCandles` across Android (`CandleValidatorAlgorithm.kt`), PHP Backend (`CandleValidator.php`), and Web (`store.js`), plus automatic SQL purge of zero-volume micro-spread weekend bars in `candles_sync.php` and `.github/workflows/build-apk.yml`.
  - Added automatic fallback from Twelve Data to real market candles (`OANDA:XAUUSD` via `TvDatafeedAdapter` and `GC=F` via `YahooFinanceAdapter`) whenever weekend filtering leaves `< 5` valid bars, and enforced a minimum price span floor (`0.16%` of mid-price) in both Android (`CandlestickCanvas.kt`) and Web (`chartRenderer.js`).
- **Complete Execution of Phase 1 UI/UX Redesign (Android & Web Parity):**
  - Applied `.statusBarsPadding()` to the Android top header in `MainActivity.kt` with compact `44.dp` height and `#2A2E39` divider so the top bar never clips under the status bar or camera cutout.
  - Applied official TradingView Dark tokens (`#131722` canvas, `#1E222D` surface, `#2A2E39` grid/border, `#2962FF` accent, `#D1D4DC` primary text, `#787B86` secondary text, `#26A69A` bullish, `#EF5350` bearish) across Android (`Color.kt`, `Theme.kt`, `ChartPreferences.kt`) and Web (`theme.css`, `store.js`, `chartRenderer.js`).
  - Implemented 5 semantic market statuses (`Live`, `Market Closed`, `Delayed`, `Cached`, `Error`) in `UtcTimeAnchorAlgorithm.kt`, `ChartViewScreen.kt`, and `headerView.js`.
  - Fixed RTL/LTR OHLC Legend text collision (`04431687.22`) in `CandlestickCanvas.kt` by enforcing `LayoutDirection.Ltr` on the chart canvas container and reserving a `30.dp` top legend lane, and defaulted the mobile drawing dock to collapsed (`isDrawingDockCollapsed = true`) for a minimal floating pill.
  - Redesigned Watchlist rows (`WatchlistRowCard.kt`, `WatchlistScreen.kt`, `watchlistView.js`) into compact TradingView rows with circular asset badges (`Au`, `OIL`, `Ag`, `FX`) and full-row tap to open chart, and re-architected `SettingsScreen.kt` with a modal provider selector dialog.
- **Holistic 4-Tab TradingView Architecture & Mandatory Mobile User Flow (`Watchlist | Chart | Prediction | Settings`):**
  - Standardized bottom navigation across Android (`MainActivity.kt`) and Web (`navigationView.js`, `app.js`) into 4 coordinated tabs: `Watchlist` (default landing screen after login), `Chart`, `Prediction`, and `Settings`.
  - Implemented the 5-layer mobile `Chart` screen (`ChartViewScreen.kt`): `48.dp` symbol/price header with a non-clickable (read-only) source badge, `>= 85%` canvas, and a `46.dp` bottom chart control bar (`[Symbol ▾ | Timeframe | Draw | fx | ⋯]`) with modal sheets for quick symbol switching, timeframe selection, drawing tools, indicators, and historical date ranges.
  - Created the standalone `PredictionScreen.kt` (Android) and upgraded `analysisView.js` (Web) with Symbol and Timeframe selectors, interactive Bullish/Bearish/Range scenarios, and a clickable detail BottomSheet/modal showing target zones, invalidation levels, key S/R levels, and roadmap status.
  - Reorganized `SettingsScreen.kt` and `settingsView.js` into 5 fixed-order groups (1. User Account, 2. Symbol Data Sources — exclusive location for changing providers, 3. Appearance & Language, 4. Chart Preferences, 5. About App) and enforced natural system `Back` navigation via `screenBackStack`.
- **Integration of Filtered `crypto-claude-desk` Analytical Patterns into Roadmap (`CHART_INTELLIGENCE_MASTER_SPEC.md`):**
  - Added `detect_gaps` timestamp integrity check to Phase 3, the 3-stage sequential analytical pipeline (`MarketStructureModule -> ConfluenceMatrixModule -> ScenarioGeneratorModule`) to Phase 4 (`Prediction Engine v1`), and the `Learning Evaluator & Pattern Track Record` schema to Phase 5 (`Live Feedback Loop`), while explicitly rejecting `Claude Code`/`MCP` runtime dependencies and trade-execution signals.

### Fixed
- **Android `IllegalStateException: Could not load font` Crash Fix:**
  - Fixed corrupted ASCII 404 HTML bodies inside `app/src/main/res/font/vazirmatn.ttf` and `jetbrains_mono.ttf` by installing verified binary TrueType fonts via `font-util`, adding descriptive fallback logic in `Type.kt`, and adding an unconditional binary TTF/PNG asset restoration step in `.github/workflows/build-apk.yml`.

---

## [1.27.0] - 2026-11-07

### Added
- **TradingView (`PEPPERSTONE:SPOTBRENT`) Extraction Pipeline (`tvdatafeed`) & Host Database Persistence:**
  - Added Python extraction script (`host_subdomain/scripts/sync_tvdatafeed.py`) using `tvdatafeed` (`from tvDatafeed import TvDatafeed, Interval`) to fetch up to **5,000 historical and daily closed candles** for `PEPPERSTONE:SPOTBRENT` across `15m` (`M15`), `1h` (`H1`), `4h` (`H4`), and `daily` (`D1`), exporting both CSV files (`SPOTBRENT_15m.csv`, `SPOTBRENT_1h.csv`, `SPOTBRENT_4h.csv`, `SPOTBRENT_1d.csv`) and normalized JSON datasets.
  - Added `TvDatafeedAdapter.php`, `cron_sync_tvdatafeed.php`, and automated MariaDB batch seeding in `.github/workflows/build-apk.yml` (`_deploy_phase1.php`) so both the Web app (`chart.manico.es`) and Android app (`APK`) read exact `PEPPERSTONE:SPOTBRENT` prices (`3` decimals, e.g. `101.198`) directly from the cPanel host database (`candles` table).
  - Set `tvdatafeed` (`TradingView (PEPPERSTONE:SPOTBRENT)`) as the default active provider exclusively for `SPOTBRENT` while keeping `XAUUSD` and other symbols on their existing defaults.
- **5,000-Candle Capacity Across Database, Cache & Settings Slider:**
  - Expanded `candles_sync.php`, `AppConfig.MAX_VISIBLE_CANDLES`, `ChartPreferences`, Web `store.js`, and the **Max History Fetch Limit (`حداکثر کندل‌های دریافتی`)** slider in Settings on both Web and Android to support up to **5,000 candles** (`40..5000`).
- **UI/UX Mobile Redesign Specification (`UI_UX_MOBILE_REDESIGN_SPEC.md`):**
  - Documented complete comparative audit against TradingView Mobile, identified the 4 root flaws (Status Bar Insets cutoff, oversized watchlist cards, cluttered chart drawing buttons, and unorganized settings), and established the 4-step implementation roadmap as a mandatory pre-condition before starting Phase 2.

### Fixed
- **Deterministic APK Signing (`CANONICAL_B64` Yadin Pattern) & Seamless In-Place Android Updates:**
  - Replaced random `keytool -genkeypair` fallback in `.github/workflows/build-apk.yml` and `app/build.gradle.kts` with the fixed `CANONICAL_B64` keystore payload (identical to `manidigit/Yadin`, `SHA1: 38:C6:57:E4:12:4A:90:85:94:BA:0C:B3:C2:A3:A9:F8:F5:3B:E1:6B`) so every GitHub Actions build shares the exact same cryptographic signature and installs as an in-place update without uninstalling the previous version.
  - Upgraded `versionCode` in `app/build.gradle.kts` from static `1` to automatic monotonic CI versioning (`100 + GITHUB_RUN_NUMBER` on GitHub Actions, fallback `27` locally) and `versionName` to `"1.27.${ciRunNumber}"`.
- **Web App Blank Screen & Deployment Database Seeding Crash Fixes:**
  - Fixed `TypeError: i18n.getCurrentLanguage is not a function` in `settingsView.js` / `loginView.js` by defining `getCurrentLanguage()` and `getLanguage()` in `I18nManager` (`host_subdomain/assets/js/core/i18n.js`), preventing DOM render failure and resolving the blank web screen.
  - Fixed `PDOException: SQLSTATE[42S22]: Column not found: 1054 Unknown column 'open_time_utc_ms'` in `.github/workflows/build-apk.yml` by aligning the batch seed statement with the actual MariaDB schema (`open_time_utc`) and wrapping database seeding in a guarded try-catch block so web file extraction never fails.

### Removed
- **Complete Removal of Firebase & Google Services Dependencies:**
  - Removed all Firebase libraries (`firebase-bom`, `firebase-firestore`, `firebase-auth`), `com.google.gms.google-services` Gradle plugin, `CredentialManager`/`googleid` dependencies, `app/google-services.json`, `firebase.json`, `firestore.rules`, `firebase-blueprint.json`, `UserAccount.kt`, `UserAccountRepository.kt`, and Firestore emulator test files; authentication and password recovery operate purely through the self-hosted `api/v1/auth.php` backend and local `WorkspaceRepository`.

---

## [1.26.0] - 2026-11-07

### Added
- **Multi-Pane Layered Chart Workspace Redesign (Web & Android Native):**
  - Expanded the Chart Workspace to occupy 80%–85% of the viewport height with zero outer page scrolling (`100vh`/`100dvh` on Web, `Modifier.weight(1f).fillMaxSize()` on Android).
  - **Unified Single-Row Top Subbar:** Combined Timeframe selector (`15m`, `1h`, `4h`, `1D` mapped to `M15`, `H1`, `H4`, `D1`), dynamic Historical Date Range Presets (`1D`, `5D`, `1M`, `3M`, `YTD`, `1Y`, `All`), Chart Type (`Candles` / `Line`), Volume Pane toggle & height resizer (`16% / 22% / 30%`), and `SMA 20` overlay toggle into a single top row, keeping the bottom of the chart dedicated to the UTC Time Axis.
  - **Dedicated Separate Volume Panel:** Separated volume bars out of the price canvas into an independent lower pane (`~22%` height) with a horizontal divider, right-side volume axis labels (`maxVol`, `0.5 * maxVol`), and honest `"No volume data provided by source"` feedback when a feed (e.g., `EIA D1`) reports zero volume.
  - **Current Price Line & Axis Callout Pills:** Added a horizontal dashed current-price line with a colored right-axis pill tag, plus interactive Crosshair callout pills on both the right Y-axis (price) and bottom X-axis (UTC timestamp).
  - **Per-Drawing Color & Line Thickness + Collapsible Mobile Drawing Dock:** Added custom `colorHex` and `strokeWidth` (`1px..4px`) support to Horizontal, Vertical, and Trend lines, persisted in local storage, with a collapsible floating bottom dock on Mobile/Android that auto-expands the style row when a tool or line is selected.

---

## [1.25.0] - 2026-11-07

### Added
- **Unified Web & Android Authentication (`auth.php` + Firebase Auth):**
  - Synchronized personal owner credentials (`username`, `email`, `password`) across Android (`WorkspaceRepository`) and Web (`apiService.js` + `auth.php`) so registering or updating credentials on either platform works on both.
  - Integrated Firebase Authentication with Google Sign-In via Jetpack `CredentialManager` (`GetSignInWithGoogleOption`) on Android and cloud profile persistence in Firestore (`users/{userId}`) with zero-trust security rules (`firestore.rules`).
- **2-Step Email Password Recovery (`فراموشی رمز عبور`):**
  - Added recovery email field during owner setup and in Settings (`update_profile`).
  - Added `request_password_reset` (generates a 15-minute 6-digit recovery code sent via host email) and `confirm_password_reset` (verifies the 6-digit code and sets a new password) on both Android and Web.
- **Always-Accessible Top Header User Badge & Sign-Out:**
  - Added active user badge and direct **Sign Out (`خروج`)** button in the top header bar of both the Web Terminal (`headerView.js`) and Android app (`MainActivity.kt`).

### Fixed
- **GitHub Actions CI/CD Pipeline (`.github/workflows/build-apk.yml`):**
  - Fixed `Package and Deploy Subdomain Web Files` job failing with `OSError: [Errno 7] Argument list too long: 'curl'` when `/tmp/_deploy_phase1.php` exceeded Linux's 128 KB `MAX_ARG_STRLEN` limit by streaming file content from disk via `--data-urlencode content@{local_file}`.
  - Fixed `Build Android APK` job failing on `:app:processDebugGoogleServices` when AI Studio's GitHub export omits `app/google-services.json` by automatically generating a valid CI `app/google-services.json` before Gradle build.

---

## [1.24.0] - 2026-11-07

### Added
- **TradingView-Style Trading Chart Overhaul:**
  - 4 core timeframes supported: `M15`, `H1`, `H4`, `D1` with instant cached aggregation from closed candles and background sync.
  - Candlestick and Line chart display modes.
  - Interactive drawing tools: Horizontal Line, Vertical Line, Trend Line (2-point anchor), and Crosshair.
  - Hit testing and dragging of drawings in market coordinates.
  - Dynamic Y-axis drag scaling and double-click reset to Auto Scale.
  - Floating OHLC and volume badge.
- **Three-Layer Zero-Hardcoding Architecture:**
  - Algorithm calculation parameters tunable via Settings sliders (candle fetch limit, zoom step, touch tolerance).
  - Central color tokens with dynamic live customizer in Settings for bullish, bearish, and drawing line colors.
  - Open symbol catalog allowing runtime creation and deletion of custom market symbols.
- **Complete UI/UX Redesign:**
  - Desktop Trading Terminal: >75% chart space, slim top header bar (<48px), left vertical drawing rail, collapsible side panel.
  - Android Mobile Web Experience: Sticky compact top bar, viewport gesture lock (`touch-action: none`), 4-tab Material 3 bottom navigation.
  - Real-time Technical Analysis module (ATR 14, Classic Floor Pivots, Period High-Low spread, Sentiment ratio).
- **Open-Source GitHub Standards:**
  - Added `ARCHITECTURE.md`, `CONTRIBUTING.md`, `AGENTS.md`, `SECURITY.md`, and `CHANGELOG.md`.

---

## [1.23.0] - 2026-11-06

### Added
- Initial Phase 1 foundation: bilingual (`fa`/`en`) support, owner login authentication, pre-populated Gold (`XAUUSD`) and Brent (`SPOTBRENT`) watchlist, and multi-tab chart view.
- Dukascopy, Twelve Data, Yahoo Finance, and EIA Spot provider adapters.
- Robolectric unit testing suite for financial algorithms.
