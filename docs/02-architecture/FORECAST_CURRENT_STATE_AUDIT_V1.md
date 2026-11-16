# Forecast Current-State Audit

**Version:** 0.1.0  
**Status:** Initial source-code audit; architecture decisions are intentionally open  
**Audit date:** 16 November 2026  
**Repository:** `manidigit/CHART`  
**Inspected ref:** `main` — tree SHA `6dd0d272f67bb2b97a3721e3812f71b57572fc41`  
**Product authority:** [FORECAST_PRODUCT_FOUNDATION_V1.md](../01-product/FORECAST_PRODUCT_FOUNDATION_V1.md) v1.2.0

---

## 1. Purpose and limits

This document records what is verifiably present in the repository before designing the replacement Forecast architecture. It is an implementation audit, not an endorsement of the existing design.

The product direction is governed by `FORECAST_PRODUCT_FOUNDATION_V1.md`. Existing code, tests, database structures and historical specifications are evidence to inspect; they do not override that product foundation.

This initial pass is a static source inspection. It does **not** claim that the project was built, deployed, or that automated tests were executed during this audit. Runtime behavior, production database contents, server configuration, deployment topology and performance remain unverified unless explicitly stated.

No algorithm, model family, execution host or migration strategy is selected by this document.

## 2. Repository-level observations

The current repository contains Forecast-related implementation in at least three execution environments:

1. **Android / Kotlin** — native Forecast engine, model plugins, feature extraction, evaluation, ledger storage and chart rendering.
2. **Web / JavaScript** — a separate Forecast engine, model registry, feature extraction, worker client, ledger, evaluation and chart rendering.
3. **Server / PHP** — a PHP Forecast engine and API endpoint, with database and local-file persistence paths.

The repository also contains Python worker-related assets and a separate forecasting dashboard directory. Their current participation in the production Forecast request path has not yet been established.

This is a material architectural fact: Forecast is not currently represented by one visibly centralized implementation. The exact authority and invocation paths of each runtime must be traced before any component is retained or retired.

## 3. Verified implementation inventory

| Area | Current source locations | Verified presence |
|---|---|---|
| Android engine and contracts | `app/src/main/java/es/manico/chartintelligence/forecast/` | Engine, contract/types, model plugins and registry, feature extraction, calendar handling, statistical tests, walk-forward evaluation, ledger and worker client |
| Android chart integration | `ui/components/CandlestickCanvas.kt`, `ui/screens/ForecastLabScreen.kt`, `ui/screens/PredictionScreen.kt`, `ui/state/MainViewModel.kt` | Forecast calculation/rendering and separate Forecast-related screens/state |
| Web engine and contracts | `host_subdomain/assets/js/forecast/` | Engine, contract, feature extractor, model registry, statistical tests, evaluator, ledger, worker client and model implementations |
| Web chart integration | `host_subdomain/assets/js/components/chartRenderer.js`, `host_subdomain/assets/js/views/forecastView.js` | Forecast calculation is imported by chart rendering; a separate Forecast view also exists |
| PHP API and engine | `host_subdomain/api/v1/forecast.php`, `host_subdomain/api/v1/forecast/ForecastEnginePhp.php`, `NativeModelsPhp.php` | Server-side inference and persistence code |
| Database | `host_subdomain/migrations/003_phase4_forecast_tables.sql` | Model, run, forecast-point, scenario and evaluation-related tables |
| Tests | `tests/phase4_forecast.test.mjs`, `tests/forecast_v2.test.mjs`, Android Forecast tests | Automated test source files exist; execution and coverage are not established by this audit |

## 4. Important findings and risks

### 4.1. The current OHLC candle construction is not equivalent across runtimes

**Android:** `ForecastEngine.kt`, function `buildForecastPointsFromQuantileTrajectory`, constructs synthetic OHLC values from quantiles. In the inspected implementation:

- The close is derived from the median quantile plus a sinusoidal perturbation (`sin((h + 1) * 2.1 + 0.7)`).
- The open is derived from the previous close plus another sinusoidal offset (`sin((h + 1) * 1.7 + 0.3)`).
- High and low are then constructed using quantile bounds and a fixed fraction of the quantile range.
- Volume is set to `0.0`; the generated point also sets `rejectionWick = false` and `wavePhase = "IMPULSE"`.

This is a deterministic shape-generation layer applied after quantile trajectory estimation. It does not establish that the generated intrabar OHLC behavior was independently forecast by the model. It is a concrete design risk against the product requirement that candle bodies and wicks arise from a meaningful forecast path rather than cosmetic perturbation.

**Web:** `host_subdomain/assets/js/forecast/forecastEngine.js` builds forecast points containing quantiles and bands in the inspected function. It does not construct OHLC in that function. The web chart renderer draws optional ghost candles by deriving open/close/high/low from available forecast fields or quantile fallbacks. Thus the web presentation path is not the same OHLC-generation path as Android.

**Consequence:** The same model/result concept can produce different candle representations across platforms. A visual comparison between Android and Web cannot be assumed to compare identical forecast data.

### 4.2. PHP is a separate legacy contract path

The PHP engine declares `forecast-contract/v1`, while the inspected Android and JavaScript contracts declare `forecast-contract/v2` and spec version `2.1.0`.

The PHP endpoint calls `ForecastEnginePhp::project(...)` for its own `infer`/recording path unless a client forecast payload is explicitly supplied for the client-forecast append action. It also contains server-side ledger/database persistence.

**Risk:** There are at least two contract generations in active source code, and three runtime implementations. Compatibility, parity, and which output is authoritative are not proven by the existence of shared-looking field names.

### 4.3. Forecast computation is coupled to chart/UI code in more than one client

The Android chart canvas imports and invokes `ForecastEngine` and `ForecastModelRegistry`, then renders forecast bands and ghost candles. The web chart renderer imports and invokes its Forecast engine and registry, then renders quantile bands and optional ghost candles.

The Android repository also contains a separate Forecast Lab screen and Prediction screen; the web repository contains a separate `forecastView.js`.

**Risk:** Product behavior, calculation triggers, state/configuration, caching and visualization may be duplicated between chart and dedicated Forecast surfaces. The full call graph and ownership of state still need tracing.

### 4.4. Ledger and persistence are distributed

The repository includes Android local ledger storage, PHP API persistence to MariaDB when available, and local JSON fallback files on the server. The web side also contains a Forecast ledger implementation.

The Android ledger uses local preferences and has server synchronization methods in the view model/repository path. The PHP endpoint reads/writes database records and has local-file fallback paths.

**Risk:** The repository contains multiple persistence mechanisms and lifecycle paths. This audit has not yet established whether they store identical records, how conflicts are resolved, or which copy is canonical.

### 4.5. Existing tests do not, by their presence alone, prove forecast realism

Forecast test files exist. The inspected JavaScript Phase 4 test includes a synthetic candle generator with deterministic drift and sinusoidal return components.

That is useful for repeatable functional tests, but it does not establish that models generate realistic paths on real market regimes, that OHLC behavior is causally justified, or that cross-runtime parity holds. Test execution, fixture diversity, leakage checks and acceptance criteria require a separate review.

## 5. Preliminary classification — not final migration decisions

| Component | Preliminary treatment | Reason / required verification |
|---|---|---|
| Existing chart renderer and chart data model | **Protect; inspect integration seam** | Product requirement is to retain the existing chart. Forecast overlay integration should be separated from the forecasting method. |
| Existing candle/history acquisition and provider adapters | **Do not replace by default** | The current product foundation assumes real CHART market data is available. Verify data contracts and quality gates before reuse. |
| Calendar/timeframe utilities and OHLC validators | **Candidate for reuse after tests** | They may provide useful infrastructure, but correctness and cross-platform consistency must be demonstrated. |
| Current Forecast engines and model implementations | **Do not assume reusable** | Their product fit and output behavior are not established; Android OHLC synthesis is a specific concern. |
| Existing Forecast contracts | **Audit and redesign if necessary** | Kotlin/JS v2 and PHP v1 coexist. Define one product-neutral contract only after runtime responsibilities are decided. |
| Existing ledger and database tables | **Preserve data; reassess schema and ownership** | Historical records may have value. Do not delete or migrate them without compatibility and retention planning. |
| Existing Forecast UI screens and settings | **Inventory before redesign** | Reuse only controls and workflows that satisfy the new product foundation. |
| Python worker/dashboard assets | **Unclassified** | Their live deployment and actual invocation path have not been verified. |

These are risk-based preliminary labels, not final instructions to delete or retain code.

## 6. Decisions that must remain open

The following decisions must not be inferred from the current implementation:

- Which runtime owns authoritative Forecast computation.
- Whether Android, Web and PHP should all calculate forecasts or whether some should become clients of a single service.
- Whether inference is local, server-side, worker-based, or a controlled combination.
- Which existing algorithms or model families, if any, survive experimentation.
- Whether the current database schema is retained, extended, versioned or replaced.
- How snapshots and ledger records are stored, synchronized, versioned and expired.
- Whether a shared cross-platform implementation is practical and worth its operational cost.

Each decision needs evidence, trade-off analysis and alignment with the product foundation.

## 7. Next audit work

The next pass should complete these tasks in order:

1. **Trace execution paths:** identify every entry point that triggers Forecast calculation in Android, Web and PHP, including chart refresh, Forecast screens, API calls and worker calls.
2. **Trace data flow:** identify the exact candle source, normalization, timeframe aggregation, feature extraction and last-closed-candle boundary used by each runtime.
3. **Compare contracts:** map input/output fields, timestamps, status semantics, quantiles, OHLC, scenarios, model metadata and errors across Kotlin, JavaScript and PHP.
4. **Inspect rendering boundary:** document how forecast points are passed into the existing chart and which chart APIs can accept a new forecast series without changing historical candles.
5. **Inspect persistence and lifecycle:** map local storage, server database, JSON fallback, snapshot payloads, synchronization, evaluation and duplicate/conflict behavior.
6. **Review tests:** identify what is tested, what is only asserted synthetically, missing negative cases, cross-platform parity gaps and whether tests are runnable in CI.
7. **Produce the migration matrix:** classify every relevant file/module as preserve, adapt, replace, retire or investigate, with evidence and dependency impact.

Only after these steps should the architecture document define runtime boundaries and the canonical Forecast interface.

## 8. Audit evidence and reproducibility

Key files inspected in this pass:

- `app/src/main/java/es/manico/chartintelligence/forecast/ForecastEngine.kt`
- `app/src/main/java/es/manico/chartintelligence/forecast/ForecastContract.kt`
- `app/src/main/java/es/manico/chartintelligence/forecast/ForecastModelPlugin.kt`
- `app/src/main/java/es/manico/chartintelligence/forecast/ForecastLedgerStore.kt`
- `app/src/main/java/es/manico/chartintelligence/ui/components/CandlestickCanvas.kt`
- `app/src/main/java/es/manico/chartintelligence/ui/screens/ForecastLabScreen.kt`
- `app/src/main/java/es/manico/chartintelligence/ui/state/MainViewModel.kt`
- `host_subdomain/assets/js/forecast/forecastEngine.js`
- `host_subdomain/assets/js/forecast/forecastContract.js`
- `host_subdomain/assets/js/components/chartRenderer.js`
- `host_subdomain/assets/js/views/forecastView.js`
- `host_subdomain/api/v1/forecast.php`
- `host_subdomain/api/v1/forecast/ForecastEnginePhp.php`
- `host_subdomain/migrations/003_phase4_forecast_tables.sql`
- `tests/phase4_forecast.test.mjs`

This document should be updated as the call graph, runtime behavior and tests are verified. It must not be treated as a complete code audit yet.
