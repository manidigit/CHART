# CHART Forecast — System Specification
## سند جامع تعریف سیستم پیش‌بینی، چرخه عمر اجرا و رفتارهای قابل مشاهده

- **Version:** 1.0.5
- **Date:** 2026-11-19
- **Status:** Model-agnostic system specification. Current New Web implementation uses the Native JavaScript registry, Structural JS, causal Historical Analogs, model configuration, Walk-Forward, local Ledger and a limited leakage-safe Replay. Full migration and production acceptance remain open.
- **Authority:** Complements FORECAST_PRODUCT_FOUNDATION_V1.md v1.3.0
- **Scope:** Product/system behavior, lifecycle, user workflows, model independence, comparison, persistence semantics, evaluation boundaries and acceptance gates
- **Current Web model scope:** 10 registered Native JavaScript models plus Structural JS, causal Historical Analogs and calibrated Ensemble are selectable. Chronos-2/Python Worker are not part of the New shared-hosting runtime.
- **Runtime and data constraints:** TradingView is the only active market-data source. New Web forecast inference runs in Native JavaScript; no Python runtime or Cron is required on the shared host. Model availability does not establish predictive performance or production approval.

---

## 1. Purpose and document hierarchy

This document defines how the CHART Forecast system must behave as a complete product. The Product Foundation defines why Forecast exists and what kind of forecast output is valuable. This document translates those product requirements into system responsibilities, user-visible workflows, lifecycle rules and acceptance conditions.

The hierarchy is:

1. FORECAST_PRODUCT_FOUNDATION_V1.md — authoritative product mission and output requirements.
2. FORECAST_SYSTEM_SPEC_V1.md — authoritative system behavior and lifecycle requirements.
3. FORECAST_ACCEPTANCE_TEST_PLAN_V1.md — model-independent verification scenarios and release gates.
4. FORECAST_MODEL_INTAKE_AND_COMPARISON_V1.md — process for reviewing and admitting candidate models.
5. FORECAST_CURRENT_STATE_AUDIT_V1.md — evidence about the existing implementation; not a design authority.
6. Historical technical documents and existing code — research/evidence only unless explicitly adopted by a later decision.

If two documents conflict, the higher-level authority governs. A conflict must be recorded and resolved; implementation must not silently choose whichever statement is easiest to code.

## 2. System mission

CHART Forecast is a model-independent environment that allows one or more forecasting models to produce future market paths, displays those paths on the existing CHART chart, preserves each execution as an independently identifiable result, enables controlled comparison under equivalent conditions, and evaluates predictions against subsequently observed market data.

The system is not itself a forecasting model. It must not assume that every model uses the same method, produces the same output shape, supports the same horizon, or has the same uncertainty representation.

The system's value comes from:
- making different forecasting approaches usable within one coherent product;
- preserving the identity and original output of each execution;
- making differences between model forecasts visible rather than hiding them;
- enabling repeatable comparisons;
- measuring forecasts against actual future observations;
- allowing the model collection to grow without redesigning the product around each new model.

## 3. System boundaries

### 3.1. Included responsibilities

The system is responsible for:
- accepting a defined forecast request and its market-data context;
- determining whether the request has sufficient and valid input data;
- selecting and invoking the requested model or model set;
- tracking each model execution independently;
- validating output structure and declared capabilities;
- preserving raw model output separately from normalized/display-ready representations;
- rendering supported forecast paths on the existing chart;
- allowing users to inspect, select, hide, compare and capture results;
- recording forecast runs and their lifecycle events;
- tracking when forecast horizons become evaluable;
- comparing predictions with actual market observations;
- exposing evaluation limitations and incomplete evidence;
- preserving enough metadata to reproduce or explain an execution.

### 3.2. Explicitly outside the system boundary

Forecast does not, by itself:
- issue a buy, sell, long or short instruction;
- determine entry price, stop loss, take profit or position size;
- place, route or manage trades;
- guarantee profitability or a fixed prediction accuracy;
- turn a model's confidence score into a calibrated probability without evidence;
- silently replace a failed model output with a synthetic forecast;
- treat a visually attractive chart as proof of predictive quality;
- force all models into one shared algorithm or one identical output format.

Trading strategy, portfolio construction and execution remain separate product domains.

## 4. Core concepts and terminology

The following entities must not be conflated.

| Concept | Meaning | Important distinction |
|---|---|---|
| Model | A forecasting implementation or service with a defined identity and capabilities | A model is not an execution |
| Model Version | An immutable or explicitly identifiable revision of a model | Same model name does not imply same behavior |
| Model Configuration | Parameters and options supplied for a particular run | Must be captured when they affect output |
| Forecast Request | User/system instruction defining market context, origin, horizon and requested model(s) | It is the request, not the result |
| Model Execution | One attempt to run one model for one request | A request with five models creates five independent executions |
| Forecast Result | The output returned by one execution, after structural validation | Must retain a link to the original execution |
| Forecast Path | Time-ordered future values/candles or other supported predictive representation | Different models may provide different representations |
| Scenario | A distinct possible future path or conditional outcome supplied by a model | Not every model must support scenarios |
| Forecast Run | The persisted system-level record for one model execution | A comparison batch may contain multiple runs |
| Comparison Set | A collection of runs intended to be inspected together | Membership does not prove experimental equivalence |
| Snapshot | A captured visual state of the chart and selected forecast result(s) | Not a substitute for structured forecast data |
| Actuals | Market observations that occur after the forecast origin | Must be selected without future leakage |
| Evaluation | A measurement of one forecast against eligible actual observations | It is separate from inference |
| Evaluation Revision | A versioned evaluation result produced under a specified evaluation definition | Re-evaluation must not overwrite the prior result |
| Model Profile | Descriptive identity, capabilities, limitations and lifecycle state of a model | Not a performance ranking |

A single user request may contain multiple model executions. Each execution must remain independently addressable, even when the executions share the same origin and input dataset.

## 5. The system lifecycle

The standard lifecycle is:

1. Define the forecast context.
2. Check input readiness.
3. Select one or more models.
4. Create an execution record for each selected model.
5. Execute each model independently.
6. validate and classify each returned result.
7. Display eligible results on the existing chart.
8. Allow inspection, comparison and snapshot capture.
9. Preserve the execution and its lifecycle events.
10. Wait for the relevant future market observations.
11. Determine whether the forecast horizon is evaluable.
12. Evaluate the forecast using applicable metrics.
13. Preserve the evaluation and make it available for historical comparison.

A failure at one stage must not silently create the appearance that later stages succeeded.

### 5.1. Request definition

A forecast request must identify, at minimum:
- exact market instrument/series identity;
- timeframe;
- forecast origin and the last eligible input candle;
- forecast horizon, expressed in a time-aware manner;
- selected model or model set;
- model configuration where relevant;
- input-data identity or sufficient provenance to identify the exact input;
- whether the request is a live forecast or a historical replay.

Optional request settings may include scenario preferences, supported output views and user display preferences. Optional settings must not be confused with required model inputs.

### 5.2. Input readiness

Before execution, the system must establish whether the input is usable for the requested model and horizon.

Readiness is not a universal fixed candle-count rule. A model may declare minimum history, required fields, supported timeframes, missing-data tolerance and other constraints. The system must distinguish:
- globally invalid market input;
- valid input that does not meet a particular model's requirements;
- valid but degraded input;
- input that is sufficient for one model but insufficient for another.

One model's inability to run must not automatically block other eligible models in the same comparison request.

The system must preserve the original input semantics. Missing volume is not observed zero or positive volume. Estimated volume, tick volume, exchange volume and unavailable volume must not be silently conflated. Invalid OHLC must not be silently repaired and then presented as original market data.

### 5.3. Independent model execution

Every model execution must have an independent identity and outcome.

The system must support:
- one model in one request;
- multiple models in one comparison request;
- models that complete at different times;
- partial success when some models fail and others succeed;
- model-specific unsupported or insufficient-input outcomes;
- cancellation or timeout where supported;
- later reruns without overwriting prior runs.

A batch is not atomic from the user's perspective unless a future product decision explicitly defines it that way. A successful model result remains available if another model in the same batch fails.

### 5.4. Result validation and classification

A returned result must be checked against the model's declared output capabilities and the applicable system-level structural rules.

Validation must answer:
- Is the response attributable to the intended model and execution?
- Does it correspond to the intended request and input context?
- Is the output time-ordered?
- Are all required numeric values finite?
- If OHLC candles are supplied, is their geometry valid?
- Are timestamps and horizon boundaries valid?
- Are declared scenarios and uncertainty fields internally interpretable?
- Is the result complete, partial, provisional or unusable?
- Does the output exceed the model's declared capabilities?

Structural validity is not predictive validity. A well-formed forecast can still be inaccurate.

The system must never manufacture missing model output and label it as a valid model prediction. A display adapter may transform a supported representation for visualization, but it must preserve traceability to the raw result and must not imply that derived values were directly predicted by the model.

### 5.5. Display on the existing chart

Forecast paths must be rendered on the existing CHART chart. Replacing the current chart engine or creating a separate chart product is not part of this system definition.

The chart must make the boundary between historical actual candles and future forecast values unmistakable.

The primary product output remains a meaningful future path expressed as complete OHLC candles, as defined by the Product Foundation. However, the system must not force every candidate model into that representation. A model that natively returns close-only values, quantiles, a distribution or another representation may be retained and displayed through an explicitly identified native/derived view when useful for research or comparison. It must not be converted into fabricated OHLC candles and presented as if the model predicted those candles. Such a candidate does not satisfy the full-OHLC output requirement merely because a display adapter can draw candle-like shapes from its output. Whether a scientifically justified transformation can be accepted for a particular model remains an evidence-based decision for a later model-specific review.

For each displayed result, the user must be able to determine:
- which model and model version produced it;
- when the forecast was created;
- the forecast origin;
- timeframe and horizon;
- whether the result is complete, partial or provisional;
- whether the visible representation is raw model output or a derived visualization;
- whether the displayed uncertainty/scenario information is available and what it means.

The system must support selecting and hiding individual model paths. A model's path must not disappear merely because another model was executed later. The user must be able to inspect a single result without deleting the others.

Where simultaneous overlay is supported, visual differentiation must remain clear. If overlay would make the chart unreadable, the system may offer focused comparison views, but it must not silently omit runs from the comparison.

### 5.6. Snapshot and review

A Snapshot captures the visual state at a particular moment. It must be linked to the corresponding structured Forecast Run records and should preserve:
- instrument/series and timeframe;
- origin and horizon;
- model identities and versions;
- selected/visible runs;
- capture timestamp;
- chart viewport and relevant display settings where available.

The structured forecast data remains authoritative for numerical analysis. An image is evidence of what the user saw, not the sole record of what the model predicted.

Snapshot failure must not delete or invalidate an otherwise successfully stored forecast result. Forecast persistence must not depend on image persistence.

### 5.7. Evaluation

Evaluation begins only when actual market observations covering the relevant target period are available and eligible.

Evaluation must:
- use the same market-series identity or explicitly document a justified mapping;
- align forecast and actual timestamps correctly;
- respect the forecast's original origin and horizon;
- distinguish complete from partial horizon coverage;
- avoid using information unavailable at the original forecast origin;
- use metrics compatible with the model's output type;
- preserve the metric definition and evaluation revision;
- report insufficient or ambiguous evidence instead of inventing a score.

Evaluation is not part of the original inference result. It is a later lifecycle event associated with that result.

## 6. Multi-model operating model

### 6.1. No fixed model-count ceiling in product definition

The product must not be designed around a predetermined maximum such as 3, 5 or 10 models. Practical runtime limits may later be necessary, but they must be explicit operational constraints rather than conceptual limits embedded into the product.

### 6.2. Model independence

Models may differ in:
- underlying approach;
- required input fields;
- minimum history;
- supported instruments and timeframes;
- forecast horizon;
- output representation;
- whether they produce full OHLC, close-only, quantiles, distributions, paths or scenarios;
- whether they provide calibrated probabilities;
- execution time and resource requirements;
- deterministic or stochastic behavior;
- known limitations and intended use.

The system must not assume these capabilities are identical. Each model must declare its supported behavior, and the system must expose incompatibilities rather than conceal them.

### 6.3. Model lifecycle states

At the product level, a model may be:
- **Registered:** identity and description are known.
- **Under Review:** technical, licensing, data and integration assessment is in progress.
- **Eligible for Testing:** minimum admission checks have passed.
- **Experimental:** available for controlled experiments but not represented as production-qualified.
- **Active:** available for normal user-requested execution.
- **Disabled:** temporarily unavailable for new runs.
- **Retired:** no longer offered for new runs; historical results remain accessible.

Changing a model's state must not rewrite or invalidate historical runs.

### 6.4. Model identity and version

A model's display name is not a sufficient identity. Each run must retain the exact model identifier and version/revision used. Where configuration affects output, the effective configuration must also be recorded.

A model update creates a distinguishable version. Old runs must remain attributable to the old version and must not be relabeled as outputs of the new version.

## 7. Comparison system

### 7.1. Comparison is a first-class workflow

The user must be able to:
- select one market context;
- select multiple eligible models;
- run them under a shared request context;
- inspect each output independently;
- overlay or switch between paths;
- capture snapshots;
- revisit the comparison later;
- evaluate each run when actuals become available.

### 7.2. Comparison equivalence

The system must distinguish three conditions:

1. **Controlled comparison:** same instrument/series, timeframe, origin, eligible input data, horizon and relevant request conditions.
2. **Partially aligned comparison:** some conditions match, but one or more material conditions differ and are disclosed.
3. **Non-equivalent comparison:** differences are large enough that direct performance conclusions are not justified.

The UI and stored comparison metadata must not label non-equivalent runs as a fair head-to-head test.

If models have different native horizons or output types, the system may compare only the common eligible portion or use output-appropriate comparisons. It must disclose the chosen comparison scope. It must not fabricate values to force identical output shapes.

### 7.3. Different forecasts are expected

Different models are allowed to disagree. The system must not average, merge, vote or select a consensus path by default.

A future ensemble or consensus feature may be introduced as a separately named model/product capability. It must preserve the original individual forecasts and disclose how the combined result was produced.

### 7.4. Performance comparison

No single metric is assumed to describe all model types. Performance reporting must retain the underlying metric values and evaluation coverage, not only a composite score.

Any future ranking must disclose:
- metric definitions and direction of preference;
- evaluated sample count and effective sample limitations;
- instrument/timeframe/horizon scope;
- evaluation period;
- model version;
- missing or incomplete evaluations;
- whether results are live, historical or mixed;
- uncertainty or statistical limitations.

A model must not be declared superior solely because it has a higher score on a small, selected or non-equivalent sample.

## 8. Live forecast workflow

The live workflow begins from the current eligible market state.

Required behavior:
1. User selects instrument, timeframe, origin policy and horizon.
2. System resolves the eligible latest market data.
3. User selects one or more models.
4. System checks readiness separately for each model.
5. Each eligible model is executed and tracked independently.
6. Results are validated and shown with their status.
7. User can inspect, hide, compare and snapshot results.
8. The system preserves the exact origin and input context.
9. Later actual candles are associated with the forecast for evaluation.
10. Evaluation status changes as more of the horizon becomes observable.

A new live forecast must not overwrite an older forecast. A refresh, rerun or changed model configuration creates a new run.

## 9. Historical replay and backtesting workflow

Historical replay must simulate what could have been known at a selected past origin.

For a replay at time T:
- only data available at or before T may be supplied as input;
- all derived features must be computed without using later observations;
- model selection and configuration must be recorded;
- the forecast must be stored before exposing the actual future segment to the inference process;
- the actual future segment is used only by the evaluation stage;
- the replay must identify the historical data revision/source used.

The system must support repeated replay origins and multiple models. It must preserve the individual runs and their evaluation results.

Repeated experimentation on the same evaluation period can create selection bias. A final holdout period, or another explicitly justified protection against repeated test-set tuning, must be preserved for final model assessment. The precise statistical protocol belongs in the evaluation specification and must be fixed before model ranking.

Historical replay results must be clearly distinguished from forecasts produced live at the time. A backtest is a controlled reconstruction, not proof that the same result would have been available in a real-time production environment unless latency, data availability and operational conditions are also represented.

## 10. Forecast and evaluation lifecycle states

The system must distinguish execution state from evaluation state.

### 10.1. Execution/result lifecycle

The following conceptual states are required. Final enum names may be defined later in the technical contract.

| State | Meaning |
|---|---|
| Requested | A run has been requested but execution has not started |
| Checking Input | Model-specific and system-level readiness is being checked |
| Rejected Input | Input is invalid or insufficient for this model/request |
| Queued | Accepted and waiting to execute |
| Running | Model execution is in progress |
| Completed | Model returned a structurally valid complete result |
| Completed Partial | A usable but incomplete result was returned |
| Provisional | Result is available but has an explicit unresolved limitation |
| Failed | Execution failed |
| Invalid Output | Response failed contract or structural validation |
| Timed Out | Execution exceeded its permitted time |
| Cancelled | Execution was cancelled |
| Expired | Result is no longer eligible for the intended live use, but remains historical |

A failure in one run must not change the state of another run in the same batch.

### 10.2. Evaluation lifecycle

| State | Meaning |
|---|---|
| Not Due | The relevant future period has not yet occurred |
| Awaiting Actuals | The forecast period has begun or ended, but required actual data is not yet available |
| Partially Evaluated | Some, but not all, target observations are available |
| Evaluated | The defined evaluation scope has sufficient actual data |
| Inconclusive | Available data cannot determine a result reliably |
| Invalidated | The evaluation was found to use invalid alignment, data or methodology and must not be treated as valid |

Execution completion must never imply evaluation completion.

### 10.3. State transitions are append-only evidence

Lifecycle changes should be recorded as events with timestamps and reasons. Current status may be derived from the event history, but prior events must remain inspectable. Correcting a mistake should create a correction/revision record rather than silently erasing the historical event.

## 11. Reproducibility and provenance

The system must retain enough information to answer: "What exactly produced this forecast?"

At minimum, a run must be traceable to:
- run identifier;
- request identifier and comparison-set identifier, if applicable;
- model identifier and version;
- effective configuration;
- instrument/series identity;
- timeframe;
- forecast origin;
- last eligible input candle/time;
- horizon;
- input-data identity or reproducible input reference;
- input readiness result and warnings;
- execution start/end timestamps;
- execution outcome;
- raw output reference or preserved raw output;
- normalized/display representation version, if any;
- validation result;
- random seed or stochastic execution metadata when applicable and available;
- runtime/environment metadata when material to reproducibility.

The system must not claim bit-for-bit reproducibility if the model, data, runtime or stochastic process does not support it. In that case it must preserve the strongest available provenance and state the limitation.

## 12. Data identity and temporal integrity

Forecasts must be associated with the exact market series they describe. Symbol text alone may be insufficient where providers, venues, contract types or price definitions differ.

The system must preserve distinctions such as Spot, CFD, Futures and provider-specific series where applicable. A forecast generated from one series must not be evaluated against another series merely because both share a familiar symbol.

Time handling must be explicit:
- timestamps must have an unambiguous time basis;
- timeframe boundaries must be respected;
- market sessions and closures must not be treated as ordinary missing intervals without context;
- open and closed candles must be distinguishable;
- forecast target timestamps must be aligned to the intended market calendar;
- daylight-saving changes must not shift the meaning of a forecast horizon.

The system must not silently substitute a different data source or revised history. Any substitution or correction must be recorded and its impact on comparability disclosed.

## 13. Cross-timeframe context

A forecast may use information from more than one timeframe, if supported by the selected model. The system must record which timeframes were actually used and the relevant cut-off times.

Different timeframes may legitimately show different directions or structures. The system must not force directional agreement. It must, however, prevent temporal leakage and identify structural inconsistencies where the product's defined checks can establish them.

When forecasts are compared across timeframes, comparisons must be aligned by elapsed time and target coverage, not by raw candle count alone.

## 14. Failure handling and user transparency

The system must fail visibly and specifically.

Examples:
- no eligible input data;
- insufficient history for a particular model;
- unsupported timeframe or horizon;
- model unavailable;
- execution timeout;
- invalid response;
- incomplete output;
- output cannot be represented in the selected chart view;
- actual data unavailable for evaluation;
- ambiguous actual outcome;
- snapshot could not be stored.

The system must not:
- draw a fallback line or synthetic candles and present them as a model forecast;
- hide a failed model while implying that all selected models completed;
- silently change the requested horizon;
- silently switch market series;
- turn missing data into plausible observed values;
- convert an unknown evaluation into a success or failure score.

A user should be able to distinguish "the model predicted this" from "the system derived this for display" and from "the system could not produce a result."

## 15. Security, privacy and resource governance

The system must treat model execution and forecast history as controlled product operations.

Requirements:
- user-visible forecast history must follow an explicit ownership and access policy;
- a user must not be able to read another user's private runs unless a deliberately shared workspace policy allows it;
- model execution endpoints must not accept arbitrary server destinations from untrusted request payloads;
- remote model execution must use controlled endpoint configuration and authenticated authorization where appropriate;
- request size, history length, horizon, concurrency and execution time must be bounded by explicit operational policy;
- resource limits must not silently truncate a forecast while presenting it as complete;
- stored raw inputs and outputs must follow data retention and deletion policies;
- credentials, provider secrets and private model configuration must not be exposed in snapshots or logs;
- audit events must avoid storing secrets or unnecessary sensitive payloads.

These are product-level security requirements. Concrete controls and threat models belong in the security/architecture design.

## 16. User control and workflow expectations

The user must retain control over:
- whether the Phase 1 Chronos-2 model is run for a request and whether its available result is displayed;
- whether an available result is displayed;
- which results are overlaid or inspected separately;
- which comparison set is reviewed;
- whether a snapshot is captured;
- whether a historical run is replayed;
- which eligible evaluation scope is inspected.

The system may provide defaults and recommendations later, but it must not silently choose a model, replace a model result, or hide disagreement in a way that changes the meaning of the evidence.

## 17. Operational quality attributes

The following quality attributes are mandatory design concerns, although their numerical service-level targets are intentionally not set in this product document:

- **Correctness:** outputs and statuses reflect what actually happened.
- **Traceability:** each visible path can be traced to its model execution and input context.
- **Isolation:** one model's failure does not corrupt other runs.
- **Comparability:** differences in conditions are visible and recorded.
- **Extensibility:** new models can be admitted without redesigning core workflows.
- **Responsiveness:** the user receives clear progress and completion/failure feedback.
- **Scalability:** increasing model count does not create hidden semantic changes.
- **Recoverability:** stored forecasts remain available after later model changes or failures.
- **Auditability:** important lifecycle and evaluation changes can be reconstructed.
- **Cross-platform consistency:** Android and Web represent the same stored forecast semantics, even if presentation differs.

Numerical latency, concurrency, retention, storage and cost targets require a later operational decision informed by candidate models and hosting constraints.

## 18. System acceptance gates

The system is not ready for model expansion merely because one model can draw something on the chart.

The following gates must be met in order:

### Gate A — Product contract
- Product Foundation and this System Specification are internally consistent.
- Core terms and boundaries are unambiguous.
- The existing chart remains the display surface.
- Current New Web model scope and runtime limits are governed by the versioned header and FORECAST_MIGRATION_PLAN_V1.md; the 2026-11-17 Chronos-2-only decision is historical and superseded.

### Gate B — Execution and identity
- One request can create independently identifiable model runs.
- Input context and model version are preserved.
- Partial batch success and independent failures are represented correctly.
- Invalid output cannot masquerade as a valid forecast.

### Gate C — Display and review
- Valid forecast outputs can be displayed on the existing chart.
- Actual and forecast regions are unmistakably distinct.
- Each path is attributable to its model/version/run.
- Individual paths can be inspected without overwriting other results.
- Snapshot references the structured run.

### Gate D — Persistence and reproducibility
- Runs survive refresh/re-entry according to the defined retention policy.
- Historical results remain attributable after model updates.
- Execution and lifecycle history are inspectable.
- Data and user ownership boundaries are enforced.

### Gate E — Evaluation
- Forecast origin and target timestamps align correctly.
- Evaluation uses only eligible actual observations.
- Partial, complete and inconclusive outcomes are distinct.
- Metrics are appropriate to output type.
- Historical replay prevents future-data leakage.

### Gate F — Model expansion readiness
- Model admission template is usable.
- Model capabilities and constraints can be represented without forcing a shared output type.
- A model can be added, disabled or retired without corrupting prior results.
- Controlled comparison is possible for compatible runs.

Passing these gates does not prove that a model is accurate. It proves that the system can host, display, preserve and evaluate model outputs honestly.

## 19. Decisions deliberately left open

The 2026-11-17 Chronos-2-only model choice is superseded for the current New Web runtime by the Native JavaScript registry. The following decisions remain open:
- whether and when a later phase should admit additional models, subject to the formal expansion gate;
- how many models may run concurrently in a future multi-model phase;
- which programming language or execution environment should host a model;
- whether models run locally, remotely or in a hybrid arrangement;
- the internal software architecture, APIs or database schema;
- the exact output contract implementation;
- the exact visualization adapter for each output type;
- the final evaluation metric set and ranking formula;
- numerical service-level targets;
- storage retention periods and quotas;
- automatic model selection or ensemble behavior.

These decisions must be made using evidence from candidate model reviews, integration tests, product constraints and operational measurements.

## 20. Phase 1 model and required execution sequence

The current New Web runtime exposes 10 registered Native JavaScript models, Structural JS, causal Historical Analogs and calibrated Ensemble. Chronos-2 remains excluded from New until an external execution path can be dispatched securely and its result lifecycle is integrated. The immediate acceptance work is to validate the Native paths on real TradingView history, preserve the time-ordered price path, and avoid claims of accuracy before OOS evaluation. A line/path output remains acceptable; complete OHLC candles are deferred.

Chronos-2 has passed source-level screening only. It is not yet CHART-runtime-verified, performance-validated, product-accepted or production-approved. Passing system acceptance gates establishes that the system handles outputs honestly; it does not establish forecast accuracy.

If results are inadequate, first diagnose data identity/quality, preparation, model configuration and execution, horizon, output interpretation/display, and evaluation methodology. Do not add models as a substitute for this diagnosis.

Any additional model or external runtime must be independently assessed using FORECAST_MODEL_INTAKE_AND_COMPARISON_V1.md and pass its formal model-expansion gate. The current registry does not waive licensing, runtime, provenance or OOS acceptance requirements.

Phase 1 display and acceptance must not reward a smooth but structurally empty line. The forecast path must be assessed for intermediate movement, meaningful corrections, swing points and reversal timing/areas. If uncertainty is displayed, its width and empirical coverage must be evaluated together; a broad cone that hides the central path is not an acceptable substitute for a useful forecast. Native quantiles must not be arbitrarily linked into fabricated coherent paths.

## 21. Change control

Changes to system behavior require:
- a version increment;
- a concise rationale;
- affected requirements and acceptance gates;
- compatibility impact on stored Forecast Runs;
- migration or historical interpretation implications, where relevant.

A change to model-specific implementation must not silently redefine the system contract.

## 22. Version history

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-11-17 | Initial model-independent system specification: responsibilities, lifecycle, multi-model execution, comparison, live/replay workflows, state semantics, provenance, governance and acceptance gates |
| 1.0.1 | 2026-11-17 | Recorded Chronos-2 as the sole Phase 1 model; retained model-independent extension points and added a formal evidence-based gate before future model expansion |
| 1.0.2 | 2026-11-17 | Aligned Phase 1 system behavior with structured price-path priority, line output acceptance, deferred OHLC candles and meaningful uncertainty visualization |
| 1.0.3 | 2026-11-17 | Added a binding Chronos-2 Phase 1 input/output contract, native quantile semantics, Close-only baseline, path interpretation and walk-forward evaluation reference |

---

**Final principle:** CHART Forecast is a system for making forecasts observable, attributable, comparable and testable. It must preserve model diversity and expose evidence honestly. The system must never manufacture certainty, conceal failure or confuse visualization with predictive performance.


## 23. Chronos-2 Phase 1 execution contract

The model-specific contract is maintained in [FORECAST_CHRONOS2_INPUT_OUTPUT_AND_PATH_CONTRACT_V1.md](./FORECAST_CHRONOS2_INPUT_OUTPUT_AND_PATH_CONTRACT_V1.md). It is subordinate to this System Specification and the Product Foundation, and normative for the Phase 1 Chronos-2 adapter and experiment design.

Implementation must follow these rules:

1. Begin with the documented Close-only univariate baseline. OHLC multivariate targets, returns, volume and technical covariates are separate ablation experiments, not implicit additions.
2. Pin and record the exact model-weight revision, package/runtime versions, input identity, preprocessing, context length, prediction length, quantile levels and effective inference arguments.
3. Preserve the raw Chronos-2 quantile tensor. The pointwise median may be rendered as a central line only when labelled accurately; it is not a sampled joint trajectory.
4. Do not create Open/High/Low values from Close quantiles, fixed spreads, sine offsets, random perturbations or arbitrary post-processing.
5. Do not connect marginal quantiles into coherent-looking alternative paths without evidence of temporal joint coherence.
6. Derive market-structure events only in a separately identified interpretation layer, with method/version/provenance and measurable event definitions. Do not attribute system-derived labels to Chronos-2.
7. Read context capacity, prediction capacity and supported quantiles from the loaded artifact. Numeric runtime choices not yet measured remain experiment parameters, not hidden constants.
8. Evaluate with rolling/walk-forward origins and identical baselines, instruments, horizons and actuals. Endpoint error alone cannot establish path quality.

A failure to produce meaningful swings, corrections or reversals must be reported as a model/output limitation after the data, adapter, configuration, horizon, display and evaluation checks. It must not be repaired by drawing artificial market structure into the forecast.



## 15. Gemini implementation handoff

The implementation-facing execution instructions are maintained in [FORECAST_GEMINI_IMPLEMENTATION_HANDOFF_V1.md](./FORECAST_GEMINI_IMPLEMENTATION_HANDOFF_V1.md) v1.0.0. Gemini and other implementation agents must read that handoff together with this specification, the Product Foundation, the Chronos-2 input/output contract, the Acceptance Test Plan, the Model Intake document and the current-state audit before proposing code changes.

The handoff does not override product/system requirements. It translates them into a bounded Phase 1 work sequence, explicit non-goals, required provenance, stop conditions and delivery evidence. Unresolved runtime values remain TBD until measured. No implementation agent may fabricate OHLC, add decorative oscillations, stitch marginal quantiles into scenarios, replace the existing chart/data source or claim predictive quality without walk-forward evidence.

The handoff is not evidence that any implementation has been completed. Code changes require explicit project-owner authorization and must be reviewed against the acceptance gates.

### 15.1. Version history

| Version | Date | Change |
|---|---|---|
| 1.0.4 | 2026-11-17 | Added authoritative link to the Gemini Phase 1 implementation handoff and clarified its precedence and authorization boundary |
