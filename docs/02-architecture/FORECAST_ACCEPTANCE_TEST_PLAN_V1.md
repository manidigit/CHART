# CHART Forecast — Model-Independent Acceptance Test Plan
## برنامه آزمون پذیرش سیستم، مستقل از مدل و الگوریتم

- **Version:** 1.0.2
- **Date:** 2026-11-17
- **Status:** Normative acceptance scenarios for system design and future implementation
- **Authority:** FORECAST_PRODUCT_FOUNDATION_V1.md v1.3.0 and FORECAST_SYSTEM_SPEC_V1.md v1.0.3
- **Scope:** Observable system behavior; no specific model or algorithm is assumed.

---

## 1. Purpose

This document defines how to determine whether the Forecast system behaves correctly before judging whether any forecasting model is accurate. It separates system correctness from predictive performance.

A passing test means that the system handles the request, result, display, persistence or evaluation correctly. It does not mean that the forecast predicts the market well.

## 2. Test principles

1. Every test must use an identified input dataset and explicit origin.
2. Tests must distinguish actual market data from forecast output.
3. A structurally valid result is not automatically an accurate result.
4. Model-specific requirements must be tested against that model's declared capabilities.
5. A failed model must not invalidate successful independent runs.
6. No test may use future data in the inference input.
7. Tests must be repeatable, with inputs, configuration and expected behavior recorded.
8. A visual test must also verify the underlying structured result where relevant.
9. Unknown or ambiguous outcomes must remain unknown, not be converted into success.
10. Platform-specific presentation may differ, but forecast semantics and run identity must remain consistent.

## 3. Test fixtures

The test suite should include controlled fixtures for:

- valid ordered OHLC history with complete fields;
- invalid OHLC geometry;
- duplicate and out-of-order timestamps;
- missing, zero, estimated and observed volume;
- open versus closed final candle;
- calendar/session gaps;
- insufficient history for one model but sufficient history for another;
- different instrument series sharing a similar symbol label;
- multiple timeframes with correctly aligned boundaries;
- a model returning valid full OHLC;
- a model returning a non-OHLC representation;
- a model returning partial output;
- a model returning malformed or non-finite output;
- a model timing out or failing;
- actual future data with full, partial and ambiguous coverage.

Fixtures must be synthetic or controlled test data unless a test explicitly documents the source and permitted use of real market data.

## 4. Acceptance scenarios

### A. Request and input readiness

| ID | Scenario | Expected result |
|---|---|---|
| A-01 | Valid request with supported instrument, timeframe and horizon | Request is accepted and its context is recorded |
| A-02 | Invalid OHLC geometry | Input is rejected or explicitly classified as degraded according to a defined policy; invalid values are not silently repaired |
| A-03 | Duplicate or out-of-order timestamps | Readiness failure is explicit; rows are not silently reordered and treated as original |
| A-04 | Missing volume | Missingness/provenance is preserved; no positive observed volume is fabricated |
| A-05 | Final candle is open | Origin policy is applied explicitly; closed-candle default is respected where required |
| A-06 | One model requires more history than another | Readiness is evaluated per model; eligible model can still run |
| A-07 | Similar symbol labels refer to different market series | Series identity prevents accidental mixing |
| A-08 | Unsupported horizon/timeframe | Specific unsupported status is returned; horizon is not silently changed |

### B. Multi-model execution

| ID | Scenario | Expected result |
|---|---|---|
| B-01 | One model is selected | One independently identifiable run is created |
| B-02 | Several models are selected | Each model receives an independent run identity |
| B-03 | One model succeeds and another fails | Successful run remains available; batch is marked partial |
| B-04 | Models complete at different times | Each run's status and completion time are tracked independently |
| B-05 | Same model is rerun | New run is created; prior run is not overwritten |
| B-06 | Model configuration changes | Effective configuration is captured and the run remains distinguishable |
| B-07 | Model version changes | New runs identify the new version; old runs retain old identity |
| B-08 | Model times out or is cancelled | Explicit terminal status; no synthetic forecast is substituted |

### C. Output validation and representation

| ID | Scenario | Expected result |
|---|---|---|
| C-01 | Valid complete OHLC output | Structural checks pass and output can be rendered as forecast candles |
| C-02 | Invalid OHLC output | Result is rejected or marked invalid; invalid candle is not displayed as valid |
| C-03 | Non-OHLC output | System preserves the native output and uses only an explicitly supported representation |
| C-04 | Partial path | Partial status and covered horizon are visible |
| C-05 | Non-finite or missing required values | Output fails validation; values are not invented |
| C-06 | Response belongs to another request/input | Identity mismatch is rejected before display or persistence as a valid result |
| C-07 | Display transformation is applied | Raw output remains traceable; derived values are not described as directly predicted |
| C-08 | Model supplies no probability | UI does not invent a confidence percentage |

### D. Chart and user interaction

| ID | Scenario | Expected result |
|---|---|---|
| D-01 | Forecast is displayed | Existing chart is used; actual and forecast regions are clearly distinct |
| D-02 | Two or more forecasts are displayed | Every path is attributable to its model, version and run |
| D-03 | User hides one model path | Only that path is hidden; stored result remains unchanged |
| D-04 | User switches selected model | Other runs are not deleted or overwritten |
| D-05 | One path is inspected alone | Full run identity and context remain available |
| D-06 | Forecast horizon differs from another run | Difference is disclosed; paths are not falsely aligned |
| D-07 | Forecast result is unavailable | No fallback line/candle is shown as if it were a model result |

### E. Snapshot and persistence

| ID | Scenario | Expected result |
|---|---|---|
| E-01 | Snapshot is captured | Snapshot links to the relevant structured run(s) and context |
| E-02 | Snapshot storage fails | Forecast data remains intact; snapshot failure is separately reported |
| E-03 | App is refreshed/reopened | Persisted runs are retrievable under the retention policy |
| E-04 | Model is updated or retired | Historical runs remain attributed to their original model version |
| E-05 | User requests private history | Access control returns only records authorized for that user |
| E-06 | Same logical request is retried | Duplicate behavior is controlled and visible; no silent duplicate ambiguity |

### F. Live evaluation

| ID | Scenario | Expected result |
|---|---|---|
| F-01 | Forecast horizon has not elapsed | Evaluation state remains Not Due |
| F-02 | Only part of the horizon has actual data | Partial evaluation is explicit |
| F-03 | Full eligible actual horizon exists | Evaluation can complete under the declared metric scope |
| F-04 | Actual data belongs to a different market series | Evaluation is blocked or explicitly marked non-equivalent |
| F-05 | Target timestamp alignment is ambiguous | Result is inconclusive; system does not guess |
| F-06 | Same candle touches both target and invalidation boundaries without lower-timeframe ordering evidence | Ambiguity is preserved; event order is not invented |
| F-07 | Evaluation definition changes | New evaluation revision is created; previous result remains inspectable |
| F-08 | Actual data is revised/corrected | Revision and impact are recorded; old evaluation is not silently overwritten |

### G. Historical replay and leakage control

| ID | Scenario | Expected result |
|---|---|---|
| G-01 | Replay at historical time T | Inference receives no data later than T |
| G-02 | Feature calculation uses rolling windows | Every feature is computed only from eligible data |
| G-03 | Future actual segment is present in the test environment | It is isolated from inference and used only by evaluation |
| G-04 | Replay is repeated with identical inputs/configuration | Run provenance permits meaningful repeatability checks |
| G-05 | Many models/configurations are tested | Test-set reuse and selection bias are tracked; final holdout is protected |
| G-06 | Historical data source/revision changes | Replay records the data revision and comparability limitation |

### H. Cross-platform and operational integrity

| ID | Scenario | Expected result |
|---|---|---|
| H-01 | Same stored run is opened on Android and Web | Core run identity, values, timestamps and status agree |
| H-02 | One runtime cannot represent an output type | Limitation is explicit; data is not silently altered |
| H-03 | Request exceeds configured resource limit | Clear rejection/limit status; no false complete result |
| H-04 | Remote execution endpoint is configured | Endpoint is controlled and authorized; user payload cannot direct arbitrary server requests |
| H-05 | User accesses another user's private run | Access is denied unless explicit sharing policy authorizes it |
| H-06 | Logging a failure | Secrets and unnecessary private data are not exposed |

## 5. Release gates

A release candidate must not proceed to model expansion unless the relevant gates pass:

- **Gate 1 — Contract integrity:** A-series and B-series critical cases pass.
- **Gate 2 — Honest output:** C-series and D-series critical cases pass.
- **Gate 3 — Persistence and identity:** E-series critical cases pass.
- **Gate 4 — Evaluation integrity:** F-series and G-series critical cases pass before performance claims or ranking.
- **Gate 5 — Cross-platform/security:** H-series critical cases pass before broad production exposure.

Critical failures include fabricated forecast values, identity mismatch accepted as valid, future-data leakage, cross-user private data exposure, invalid actual alignment, or a failed model being represented as a successful run.

## 6. Test evidence record

Each executed test should preserve:
- test ID and revision;
- date and environment;
- input fixture/data identity;
- model identity/version/configuration, if relevant;
- request and run identifiers;
- expected behavior;
- observed behavior;
- pass/fail/inconclusive status;
- logs or screenshots where useful;
- defect reference and retest outcome.

A test that was not executed must be marked Not Run, not Passed.

## 7. What this plan does not establish

Passing this plan does not establish:
- model accuracy;
- profitability;
- superiority over a benchmark;
- probability calibration;
- performance on unseen markets;
- acceptable production cost or latency.

Those require model-specific experiments and operational measurements.

## 8. Phase 1 path-quality acceptance scenarios

The Phase 1 forecast is evaluated primarily as a time-ordered price path. Complete OHLC candles are not required for Phase 1 acceptance. A line/path output is valid only if it preserves meaningful market structure.

| ID | Scenario | Required result |
|---|---|---|
| P-01 | Model forecasts a persistent trend with intermediate pullbacks | The path preserves direction changes and material corrections; it is not reduced to a straight trend line |
| P-02 | Historical test segment contains material swing highs and lows | The forecast path is evaluated for swing timing, direction and price-area error; omitted or invented pivots are measurable |
| P-03 | Forecast includes a likely reversal or correction | The path represents the intermediate move and turning area rather than only the final destination |
| P-04 | Model output is smooth or monotonic despite a structurally volatile test set | The result is not accepted as structurally adequate solely because endpoint error is low |
| P-05 | Uncertainty is visualized | Bands/scenarios retain a readable central path and have measurable coverage and width; a broad cone that covers most upper/lower outcomes without useful path information fails |
| P-06 | Native quantiles are marginal and not joint temporal scenarios | The system does not arbitrarily connect quantile values into a fabricated coherent path; native output and any derived view remain distinguishable |
| P-07 | Forecast is rendered as a line rather than candles | This is accepted for Phase 1 if timestamps, path structure, provenance and evaluation are correct |
| P-08 | Future support/resistance or turning zones are displayed | Each zone is time/price-bounded, linked to evidence and identified as model-native or system-derived; it is not presented as a guaranteed reversal |
| P-09 | Forecast is rendered as OHLC candles | OHLC constraints and native-versus-derived provenance checks still apply; candle rendering is not a Phase 1 prerequisite |

Path-quality evaluation should include, where measurable: direction/regime transitions, swing-high/low detection, pivot timing and price error, correction depth/duration, reversal event precision/recall, path-shape similarity, and uncertainty coverage-versus-width. No single metric should substitute for visual inspection and walk-forward statistical evidence.

## 9. Version history

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-11-17 | Initial model-independent acceptance scenarios for readiness, execution, output, chart, persistence, evaluation, replay, security and cross-platform integrity |
| 1.0.1 | 2026-11-17 | Added Phase 1 path-structure acceptance cases; clarified that line output is valid and complete OHLC is deferred |
| 1.0.2 | 2026-11-17 | Added Chronos-2 native-output integrity, inference configuration, leakage, quantile calibration and walk-forward path-quality test cases |


## 10. Chronos-2 Phase 1 model-specific acceptance cases

These cases supplement—not replace—the model-independent tests above. The normative input/output details are in [FORECAST_CHRONOS2_INPUT_OUTPUT_AND_PATH_CONTRACT_V1.md](../01-product/FORECAST_CHRONOS2_INPUT_OUTPUT_AND_PATH_CONTRACT_V1.md).

| ID | Scenario | Required result |
|---|---|---|
| X-01 | Close-only baseline input is constructed | Only eligible historical Close values are supplied; exact series, timestamps, origin and preprocessing identity are recorded |
| X-02 | Model artifact is loaded | Exact immutable model revision, package/runtime versions and weight identity are recorded |
| X-03 | Context length is selected | Effective value is within the loaded model's supported capacity and is recorded; no unverified hard-coded capacity |
| X-04 | Prediction horizon exceeds configured model prediction length | Request is rejected or explicitly classified as an experimental long-horizon run; no silent shortening or hidden degradation |
| X-05 | Quantile levels are requested | Every requested level is supported by the loaded artifact; raw quantile output and dimensions are preserved |
| X-06 | Pointwise median is rendered | It is labelled as a pointwise quantile-derived path, not a sampled coherent trajectory |
| X-07 | Marginal quantiles are displayed | They are not labelled as joint scenarios; empirical coverage and width are both measured |
| X-08 | OHLC is tested as multivariate targets | All variates are aligned; invalid candle geometry is recorded, not silently clamped/reordered |
| X-09 | Adapter receives malformed/non-finite output | Run fails validation; no synthetic replacement path is rendered |
| X-10 | Inference is repeated with identical inputs/configuration | Differences, if any, are measured and recorded; deterministic behavior is not assumed |
| X-11 | Historical walk-forward origin is evaluated | No input or feature contains information later than the origin |
| X-12 | Path structure is scored | Swing, correction, reversal, regime and path-shape metrics are computed under frozen definitions; endpoint error alone is insufficient |
| X-13 | Model is compared with naive baselines | Same origins, instruments, target space, horizons and actuals are used |
| X-14 | Event labels or support/resistance zones are shown | Provenance identifies model-native versus system-derived output, with method/version and evidence |
| X-15 | Runtime parameter has not been measured | It remains explicitly TBD; implementation does not silently substitute an arbitrary value |

### 10.1. Phase 1 model acceptance interpretation

Chronos-2 source/API compatibility is not a model acceptance result. Passing X-01 through X-10 establishes adapter/output integrity only. Predictive path acceptance requires walk-forward evidence across instruments, timeframes, horizons and market regimes, including comparison with suitable naive baselines. A visually convincing line without this evidence remains unvalidated.

A failure in path structure must trigger the diagnostic sequence in the Model Intake document before any second model is proposed. No synthetic oscillation, fabricated OHLC or arbitrary quantile stitching may be used to turn a failed test into a pass.
