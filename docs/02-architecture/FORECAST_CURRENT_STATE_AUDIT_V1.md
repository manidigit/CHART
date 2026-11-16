# Forecast Current-State Audit

**Version:** 0.3.0  
**Status:** Execution-path and worker-contract audit in progress; architecture decisions are intentionally open  
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


---

## 9. Execution-path trace — client chart rendering

### 9.1. Android main chart

Verified path in `CandlestickCanvas.kt`:

1. The canvas receives the active tab's `candles`, symbol, timeframe and forecast preferences.
2. It resolves optional higher/lower timeframe candle sets through supplied providers.
3. Inside a Compose `remember` calculation, if future projection is enabled, the chart is at the latest scroll position and at least 24 candles exist, it constructs a `ForecastModelRegistry`.
4. It directly calls `ForecastEngine.project(...)`.
5. It passes `futureProjectionResult.points` to the canvas rendering path.

Important observations:

- The main chart calls the Kotlin engine directly. This call does not invoke `ForecastWorkerClient.infer(...)`.
- Passing `workerUrl` to `ForecastEngine.project` only supplies worker configuration/status in the inspected engine path; the separate worker client is used in Forecast Lab.
- The calculation is part of a Compose `remember` expression, not an explicitly asynchronous inference use case. The actual cost and UI impact require runtime profiling.
- The calculation can be repeated when any key dependency changes (candles, timeframe, symbol, horizon, model configuration, render mode or worker URL).

### 9.2. Android Forecast Lab

Verified path in `ForecastLabScreen.kt`:

1. Reads the active tab's candles and obtains higher/lower timeframe candles.
2. Calculates a local result using `ForecastEngine.project(...)`.
3. In `LaunchedEffect`, calculates again on the configured inputs, on `Dispatchers.Default`.
4. If a worker URL is configured and the local result is not `DATA_NOT_READY`, it calls `ForecastWorkerClient.infer(...)`.
5. It merges worker trajectories through `ForecastEngine.applyRemoteWorkerResponse(...)`.

**Risk:** The screen contains both an initial remembered calculation and a subsequent effect-driven calculation. This is a potential duplicate computation path. It needs profiling and state-flow review before deciding whether it is an actual user-visible performance defect.

### 9.3. Web main chart

Verified path in `chartRenderer.js`:

1. The chart renderer's indicator/cache layer resolves symbol, provider and timeframe.
2. It reads forecast preferences and obtains lower/higher timeframe candles through `getCachedOrAggregatedCandles`.
3. It calls `ForecastEngine.project(candles, options)` synchronously when the forecast cache key changes.
4. It returns forecast points to the chart renderer.
5. The chart draws quantile fan bands and, for Ghost Candles/Hybrid modes, draws candle-like bars from point OHLC values when present, otherwise from quantile fallbacks.

The inspected main chart renderer does not itself call `ForecastWorkerClient.infer`.

### 9.4. Web Forecast Studio

Verified path in `forecastView.js`:

1. Builds a local forecast using `ForecastEngine.project(...)`.
2. If a worker URL exists, it starts an asynchronous `ForecastWorkerClient.infer(...)` request unless a cached/pending request exists for the input hash.
3. On response, it stores the worker result in an in-memory state cache, invalidates the memo and dispatches `ci-forecast-worker-updated`.
4. The next build merges the cached response using `ForecastEngine.applyRemoteWorkerResponse(...)`.

**Risk:** The main chart and Forecast Studio have separate worker behavior. A worker-backed result available in Forecast Studio is not proven to be the same result used by the main chart.

## 10. Server inference path

The PHP API endpoint `host_subdomain/api/v1/forecast.php` supports distinct operations:

- GET / ledger retrieval: reads prediction runs and lifecycle events from database when possible, with local JSON fallback when the corresponding database result is empty.
- `infer`: invokes `ForecastEnginePhp::project(...)` and returns an inferred forecast without following the normal append path.
- `append_client_forecast`: accepts a client-generated forecast payload and records that payload rather than recomputing it in the PHP engine.
- Other POST recording flow: computes through PHP engine and persists a run.

The PHP engine itself can call the configured Python worker through `probeRemoteWorker`, merge returned model trajectories and reselect the chart winner.

This creates at least three distinct worker arrangements in the repository:

1. Android Forecast Lab → Android `ForecastWorkerClient` → Python worker.
2. Web Forecast Studio → JavaScript `ForecastWorkerClient` → Python worker.
3. PHP Forecast engine → PHP cURL request → Python worker.

The Android main chart and Web main chart do not show the same direct worker invocation in the inspected paths.

**Architectural implication:** The configured worker URL does not imply that every Forecast surface is using the worker. A user can see local inference on one surface and worker-enriched inference on another, depending on the path and cache state.

## 11. Snapshot and lifecycle path — Android

Verified in `MainViewModel.recordAndSyncForecastSnapshot()`:

1. Reads the active tab and Forecast preferences.
2. Resolves higher/lower timeframe candles from the repository.
3. Calls `ForecastEngine.project(...)` again for the snapshot action.
4. Appends the result to `ForecastLedgerStore` locally.
5. Calls `WorkspaceRepository.syncForecastSnapshotToServer(...)`.
6. The repository serializes forecast points, scenarios, zones, diagnostics and metadata into a client forecast payload.
7. The PHP endpoint's `append_client_forecast` path can store that supplied result.
8. The ViewModel refreshes local/server ledger state and verifies local chains.

Matured-outcome evaluation is a separate path: `evaluateMaturedForecastOutcomes()` evaluates local ledger entries against the active tab candles and synchronizes lifecycle events.

Important distinctions:

- The chart's currently displayed forecast and the snapshot action are separate calls to `ForecastEngine.project`; identity/equivalence is not guaranteed unless their inputs and timing match.
- The inspected snapshot path recalculates locally. It does not first fetch and snapshot the exact currently displayed worker-enriched Forecast Lab result.
- Server sync requires a session token and a non-null summary; otherwise the method returns false.
- The PHP ledger endpoint can use database persistence and local JSON fallback, while Android maintains its own local ledger.

These are concrete consistency questions for the replacement design. Existing ledger records should be preserved during migration planning.

## 12. Current execution map

| Surface | Local engine | Remote worker in inspected path | Rendering / storage |
|---|---|---|---|
| Android main chart | Kotlin | No direct worker call observed | Existing native chart canvas |
| Android Forecast Lab | Kotlin | Yes, asynchronous client call | Forecast Lab UI; local result state |
| Android snapshot action | Kotlin recomputation | No direct worker call observed | Local ledger, then PHP API client-forecast append |
| Web main chart | JavaScript | No direct worker call observed | Existing chart renderer |
| Web Forecast Studio | JavaScript | Yes, asynchronous client call | Studio view and in-memory worker cache |
| PHP API inference | PHP | Yes, PHP cURL worker probe | API response |
| PHP ledger | Receives client forecast or records PHP inference | Depends on request path | Database with local JSON fallback |

## 13. Newly confirmed risks

1. **Different forecast paths by UI surface:** main chart, Forecast Lab/Studio, snapshot action and PHP API can produce or consume different forecast results.
2. **Worker configuration is not global execution policy:** some paths use the worker, some do not.
3. **Snapshot identity risk:** snapshot generation recalculates instead of clearly persisting the exact rendered result and its full provenance.
4. **Cross-runtime divergence:** Kotlin, JavaScript and PHP have different engine/contract paths and worker integration.
5. **Potential duplicate local work:** Android Forecast Lab performs a remembered calculation and an effect-driven calculation; this requires runtime profiling.
6. **Ledger authority is unclear:** local Android, web-side ledger and PHP database/file fallback coexist. Canonical ownership, merge rules and conflict behavior are not established.

## 14. Remaining verification before migration design

1. Trace all call sites of Android snapshot, evaluation and ledger synchronization, including lifecycle triggers.
2. Trace Web ledger writes and whether the browser ever syncs forecasts to the PHP API or only stores locally.
3. Inspect Python worker routes, request schema, model execution, and deployment configuration to establish the actual worker contract.
4. Inspect chart renderer inputs and scaling/time-axis logic to specify the exact overlay extension seam.
5. Compare Kotlin/JavaScript/PHP candle validation, closed-bar handling, timestamp construction and timeframe alignment.
6. Inspect CI workflows and execute relevant tests if a supported environment is available; report execution results separately from source-level test review.
7. Complete the file-level migration matrix only after the above paths are traced.


---

## 15. Python worker implementation and candle construction

### 15.1. Worker endpoint and model families

Verified in `python_worker/app.py`:

- FastAPI exposes `GET /health` and `POST /forecast/infer`.
- The registered model list includes native Python ARIMA, Prophet, LSTM and TFT predictors.
- Each model is called independently; exceptions are returned as per-model `FAILED` trajectories.
- The worker runs `evaluate_models_walk_forward` over the cleaned candle input and returns trajectories and benchmarks.
- The worker request schema defaults to `forecast-contract/v1`.

This establishes that the Python worker is an optional inference service, not the sole Forecast engine. Its actual production availability/deployment remains unverified.

### 15.2. Python worker also synthesizes candle OHLC mechanically

Verified in `python_worker/models/common.py`, function `build_points_from_quantiles`:

- `open` is assigned the previous step's `close`.
- `close` is assigned `q50`.
- A symmetric wick distance is calculated as `(q75 - q25) * 0.28`.
- `high` and `low` are then constructed around the open/close interval using that wick distance.
- `volume` is set to `0.0`.
- `rejectionWick` is always false.
- `wavePhase` is assigned mechanically from whether close is above or below open.

This is a second verified implementation of the same fundamental design pattern found in Android: a quantile path is converted into candle-shaped OHLC by a deterministic post-processing rule.

**Important consequence:** Replacing or improving the underlying model alone cannot remove this limitation while the candle-construction layer remains unchanged. The product's future OHLC path must be explicitly defined as model output or as a separately justified probabilistic construction, not a cosmetic renderer fallback.

### 15.3. Worker contract version and input-hash integrity gap

The inspected contracts and worker behavior show a concrete compatibility/integrity concern:

- Kotlin and JavaScript main Forecast contracts declare `forecast-contract/v2`.
- Their worker clients send a request containing `inputHash`.
- The Python worker's Pydantic request accepts `inputHash`, but `infer_payload` returns `forecast-contract/v1` and does not include `inputHash` in its response.
- The JavaScript response validator rejects a mismatch only when the worker response actually contains an `inputHash`; absence is accepted.
- The Android worker client likewise rejects a mismatch only when the response hash is non-empty; absence is accepted.
- PHP sends its own input hash to the worker but the inspected merge path does not validate the response hash before merging returned trajectories.

**Risk:** The intended input-hash binding is not enforced end-to-end. A worker response computed from a different or altered input can pass the current clients' missing-hash path, subject to the other response validations. The worker's v1 response is also accepted into v2 client merge paths without an explicit version compatibility check in the inspected functions.

This should be treated as a high-priority contract defect for the existing system. It is documented for migration and test planning; no code has been changed in this audit.

### 15.4. Worker output still does not establish OHLC realism

The worker's model trajectories are quantile-based and its common helper constructs OHLC mechanically. Existing response validation focuses on trajectory length, finite values and monotonic quantiles. Those checks do not establish realistic open-to-close transitions, plausible high/low excursion distributions, intrabar path consistency, volume validity or realistic multi-candle structure.

The current worker contract is therefore a quantile-trajectory contract with derived candle fields, not evidence of a validated future OHLC forecasting contract.

## 16. Web ledger persistence and limits

Verified in `host_subdomain/assets/js/forecast/forecastLedger.js`:

- The web ledger stores forecast entries in browser `localStorage`.
- It retains at most 120 forecast entries and 240 lifecycle events in the local store.
- It creates forecast and lifecycle hash chains locally.
- It evaluates matured forecasts against candles passed to `evaluateMaturedForecasts`.
- The inspected module itself contains no network persistence implementation.

The web Forecast Studio imports this local ledger. A separate web-to-PHP ledger synchronization path has not been established by the inspected code.

**Risk:** Browser-local history is device/browser scoped and subject to browser storage availability, user clearing, quota and profile changes. It is not automatically the same record set as Android local storage or the PHP server ledger. A unified Forecast Ledger requires explicit canonical ownership, identity, sync and conflict policies.

## 17. Updated highest-priority technical risks

| Priority | Finding | Evidence | Migration implication |
|---|---|---|---|
| Critical | OHLC is mechanically derived from quantiles in Android and Python worker | Kotlin `ForecastEngine.kt`; Python `models/common.py` | Redesign forecast output semantics before choosing models |
| Critical | Worker input-hash response binding is optional in clients and absent from Python responses | Kotlin/JS worker clients; Python `app.py` | Require strict request/response identity and reject missing or mismatched hashes |
| High | Worker contract v1 is merged into v2 client paths without explicit version gate | Python `app.py`; Kotlin/JS merge functions | Define explicit version negotiation/compatibility policy |
| High | Different surfaces use different inference paths and worker usage | Android canvas/Lab; Web renderer/Studio; PHP engine | Define one authoritative inference orchestration policy |
| High | Snapshot recomputes instead of clearly persisting exact rendered result | Android ViewModel/repository | Snapshot must capture immutable displayed result and full provenance |
| High | Web ledger is browser-local while Android and PHP have separate stores | JS ledger, Android store, PHP API | Define canonical ledger and synchronization semantics |
| Medium | Python worker sanitization and OHLC helper default missing volume to synthetic positive values | Python `models/common.py` | Preserve volume provenance; never silently represent fabricated volume as observed volume |

## 18. Next verification pass

1. Inspect the complete model implementations and determine whether each model predicts only close/quantiles or a genuine joint OHLC distribution.
2. Inspect the PHP native OHLC construction path and compare it with Kotlin, JavaScript and Python.
3. Verify web ledger write call sites and whether any hidden API synchronization exists outside the ledger module.
4. Inspect CI workflow commands and, where feasible, execute the Python and JavaScript Forecast tests.
5. Document the exact chart rendering API and how future points affect price/time scaling, scrolling and visible candle geometry.
6. Build the final file-level migration matrix with evidence for each classification.
