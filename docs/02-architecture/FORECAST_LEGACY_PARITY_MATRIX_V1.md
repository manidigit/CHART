# CHART Forecast — Legacy to New Native Parity Matrix

- **Version:** 1.0.0
- **Date:** 2026-11-19
- **Branch under validation:** `forecast-completion-native-only`
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
