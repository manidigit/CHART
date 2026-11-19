# CHART Forecast — Legacy to New Native Parity Matrix

- **Version:** 1.1.0
- **Date:** 2026-11-19
- **Canonical branch:** `main` (consolidated commit `05933ac39ca440dc1338385b9cf3d6159e20c377`)
- **Purpose:** Record one-to-one feature parity and explicitly distinguish migrated features from runtime-blocked features.
- **Authority:** `FORECAST_PRODUCT_FOUNDATION_V1.md`, `FORECAST_SYSTEM_SPEC_V1.md`, `FORECAST_MIGRATION_PLAN_V1.md`.

## 1. Feature parity

| Legacy capability | New Native implementation | Status / qualification |
|---|---|---|
| Engine selection / rollback | New Native is first-use default; Legacy remains selectable | Implemented; rollback retained |
| Model selection | Dynamic selector from all 10 entries in `defaultForecastRegistry` | Implemented |
| Structural JS forecast | Native Browser Structural Wave engine | Implemented; honest insufficient-evidence states retained |
| Historical Analogs | Causal empirical analog model | Implemented; no future leakage by design |
| Calibrated Ensemble | Explicit `ensemble` selection in New | Implemented; still subject to OOS acceptance gates |
| Model enable/disable | Registry toggles | Implemented |
| Model weights | Per-model weight controls | Implemented |
| Model parameters | Per-model parameter inputs | Implemented |
| Reset model settings | Default weight reset | Implemented |
| Forecast horizon | Per-tab horizon control | Implemented |
| Forecast rendering | Quantile Fan, Hybrid and Ghost/quantile bars | Implemented; not a claim of full OHLC future candles |
| Multi-timeframe context | Higher/lower TradingView candles passed to Native engine | Implemented; production alignment still needs E2E verification |
| Model comparison | Independent persistent comparison visibility and main-chart overlays | Implemented; chart acceptance tests remain open |
| Main chart integration | Selected Native trajectory adapted to the existing chart renderer | Implemented; live browser verification remains open |
| Walk-Forward / OOS | Existing V2.1 evaluation and model benchmark panel reused in New | Implemented; acceptance depends on sufficient history and statistical gates |
| Forecast snapshot ledger | Hash-linked local forecast snapshots | Implemented |
| Lifecycle ledger | Append-only active/superseded/matured/cancelled events | Implemented |
| Historical Replay | UTC date range, 3/5/10 windows, pre-anchor training, future-only scoring | Implemented |
| Replay metrics | MAE, interval coverage and terminal direction accuracy | Implemented; not a substitute for full OOS acceptance |
| Replay chart | Selectable window with forecast q50 vs realized close path | Implemented |
| Replay playback | Browser-only Play/Pause through selected windows | Implemented; no server Cron |
| Replay history | Latest 20 runs persisted locally and compared in a summary table | Implemented |
| Market data | TradingView only; other providers disabled/normalized | Implemented in New path; verify live deployment |
| Automatic scheduling | No cPanel Cron; replay/forecast runs only on explicit user action | Deliberate product decision |

## 2. Explicitly not migrated into New

| Legacy capability | Current state | Reason / required decision |
|---|---|---|
| Chronos-2 direct PHP-to-Python execution | Disabled in shared-hosting UI path | cPanel does not provide a usable Python/exec runtime; API returns a real runtime error instead of simulating output |
| Chronos-2 GitHub Actions runner | Manual workflow exists, not connected to New UI | Requires a secure server-side GitHub Actions dispatch credential with `actions:write`; no such configured path is available to this implementation |
| True Python LSTM/TFT/Prophet/ARIMA worker models | Not selectable in New | Python Worker is not run on cPanel. Native JavaScript models/approximations exist, but approximations are not equivalent to the Python models and are labelled accordingly |
| Full OHLC future-candle generation | Not a Phase 1 requirement | Product Foundation prioritizes a meaningful quantile price path; full OHLC output requires a separate acceptance decision and constraints |

## 3. Chronos-2 manual runner constraints

The existing manual GitHub Actions workflow:
- runs Python on a GitHub-hosted runner, not on cPanel;
- fetches fresh candles through the existing TradingView sync script;
- publishes results over FTP;
- is restricted to `SPOTBRENT` and `XAUUSD`, selected timeframes and horizons;
- is not dispatched by the New web UI and has no authenticated request/result lifecycle in the New model selector.

Therefore, the workflow's existence is not evidence that Chronos-2 is integrated into New. Do not expose it as a normal selectable model until dispatch, authorization, result provenance, timeout/retry behavior and chart adaptation are implemented and tested.

## 4. Acceptance evidence and remaining gates

Current branch validation:
- 33/33 Node parity tests pass.
- Syntax checks pass for `app.js`, `forecastView.js`, `modelRegistry.js` and `forecastEngine.js`.

Still required before declaring the entire migration complete:
1. Secure Chronos-2 external-runner dispatch/result integration, or an explicit product decision to retire Chronos-2 from the active model catalog.
2. Full API/Web/Android Legacy feature inventory, including any controls not covered by the New workspace.
3. Browser E2E for model selection, forecast overlays, replay playback, tab/timeframe changes and snapshot lifecycle.
4. Production cPanel deployment verification using TradingView-only data and no Python/Cron dependency.
5. Replay performance testing on large candle histories and independent no-leakage fixtures.
6. Acceptance review of OOS results per symbol/timeframe; no model may be called successful solely because it renders a path.

**Release rule:** Do not close a feature because its UI exists. A feature is migrated only when its execution, data contract, failure states, persistence and acceptance evidence are all present.


## 5. Status refresh — 2026-11-19

This section supersedes any older status statement in this matrix that describes Replay or Ensemble as not implemented. Both now have an execution path in New Native; their statistical/operational acceptance remains open.

### 5.1. Clarifications

- **Historical Replay is implemented in New Native:** UTC From/To range; 3/5/10 replay windows; training data is sliced strictly before each anchor; future candles are used only as actuals for scoring; metrics include MAE percentage, 80% interval coverage and terminal direction accuracy; selected-window chart overlay; browser Play/Pause; last 20 runs stored locally and shown in a comparison table.
- **Replay is not fully accepted:** large-history performance, independent leakage fixtures, date-boundary edge cases and browser E2E remain unverified.
- **Ensemble is selectable and has an execution path:** this does not establish calibration quality, robustness or OOS superiority. It must not be presented as statistically accepted until those tests pass.
- **Compare is implemented across Forecast Studio preview and Main Chart:** model visibility is explicit and persisted in preferences. Browser E2E for model switching, symbol/timeframe changes, path alignment and stale-overlay cleanup remains open.
- **TradingView is the only permitted market-data source:** New Native forces the no-Python-worker path. Provider guards and static tests are evidence of code policy, not proof of live Production behavior.
- **No Cron is part of the workflow:** forecast/replay are initiated by the user; browser playback is local UI behavior, not server scheduling.
- **The current 33/33 Node test result and syntax checks are branch CI evidence only.** They do not replace browser E2E, live cPanel verification or forecast-quality evaluation.

### 5.2. Startup regression recorded after the branch validation

A duplicate `const horizon` declaration was found in `renderForecastWorkspaceContent()` on the default `main` branch and caused the workspace module to fail during initialization. The duplicate declaration was removed in commit `a6349d7`; the app cache key was bumped to `1.47.30` in commit `4bbcaed`. A subsequent GitHub fetch confirmed one remaining declaration in the function. Successful startup on the hosted site has not yet been independently verified.

### 5.3. Release status

The parity matrix is a code-transfer inventory, not a release sign-off. No Legacy feature should be retired until:
1. the corresponding New behavior has a reproducible test;
2. the real browser workflow is verified;
3. data source, timeframe and candle-close alignment are confirmed;
4. failure/empty-data behavior is correct;
5. the user-visible result is attributable to the selected model; and
6. rollback remains available until the acceptance window closes.


## 6. Phase 1 Parity Completion Update — 2026-11-19

Following explicit product direction to shelve Python/Chronos-2 on shared hosting for now and finish browser-native feature parity before progressively disabling Legacy controls (Phase 2):

- **AUTO (OOS-evaluated) model selection:** Now available directly in the New model picker and routed through `applyNativeModelForecastToTab()` to the real OOS-selected model (`selectedChartModelId`) with `requested_model_id: 'AUTO'` preserved in `isStructuralForecastMatchingTab()`.
- **Main chart render modes (`FAN_CHART`, `HYBRID`, `GHOST_CANDLES`):** Implemented in `chartRenderer.js` (`v1.47.22`) with `Q10–Q90` Y-axis scaling, outer `Q10–Q90` + inner `Q25–Q75` bands, and strict quantile envelope bars (no synthetic OHLC).
- **MTF Coordinated layer & live chart sync:** Switching `Independent / Coordinated`, render mode, or comparison overlays now updates and redraws the main chart immediately; `adaptNativeModelTrajectory()` validates monotonic `coordinatedPoints` before adoption.
- **Unified New header & controls:** Added symbol badge and `VALID/PROVISIONAL/NO_EDGE`, `Edge Gate`, `OOD`, and `Regime` badges to the New header and removed the duplicated horizon selector row.
- **Verification & Legacy state:** `node --check` passed on all modified JS modules and `tests/web_parity.test.mjs` passed **35/35** (cache keys bumped to `app.js?v=1.47.35`, `store.js?v=1.47.13`, `chartRenderer.js?v=1.47.22`, `forecastContract.js?v=2.0.4`). Legacy controls remain intentionally active until user live-browser verification approves Phase 2 progressive disabling.

### 6.1. Full 12-Panel Studio Layout Parity Update (`v1.47.36`) — 2026-11-19

- **Unconditional 12-Panel Forecast Studio in New:** Refactored `renderForecastWorkspaceContent()` to use the full-width `.ci-forecast-studio` layout with `.ci-fc-controls-row`, `.ci-fc-subtabs-bar`, `.ci-fc-body`, live header badges (`VALID/INSUFFICIENT_EVIDENCE`, `Edge Gate`, `OOD`, `Regime`), `Record Local Snapshot`, `Show Selected Model on Chart`, `Uncertainty Band`, and inline `Compare Overlays`.
- **No more empty `IDLE` placeholder for `empirical_analogs` or `structural_wave_js`:** `empirical_analogs` (`Causal Historical Analogs`) now routes directly through the full Native Studio & `applyNativeModelForecastToTab()`, and `nativeEvaluation` is evaluated unconditionally for `selected === 'structural'` so all 12 Studio panels (`Calibrated Quantile Fan`, `OOS Selection Gate`, `Conformal Calibration`, `12-Model Comparison`, `11 Side-by-Side mini-charts`, `Analog Medoids`, `NO_EDGE` banner, `Aleatoric vs Epistemic`, `MTF Coordination Check`, `3-Scenario Event Tree` with `Plot Reference Bands on Chart` wired to `redrawActiveCanvas()`, `Key Zones`, and `Horizon Step Quantile Ladder`) render live for every model choice.
- **`AUTO` persistence & cache invalidation:** Fixed `store.js` regex (`/^(AUTO|[a-z0-9_]+)$/`) so `'AUTO'` survives reloads, bumped `app.js?v=1.47.36` and canonical `store.js?v=1.47.14` across all 9 modules, and verified **36/36** tests passing in `tests/web_parity.test.mjs` (including `FORECAST-PHASE1-STUDIO-PARITY-03`).


