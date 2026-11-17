# CHART Forecast — Gemini Implementation Handoff
## سند اجرایی و تحویل کنترل‌شده پیاده‌سازی فاز اول

- **Version:** 1.0.0
- **Date:** 2026-11-17
- **Status:** Implementation handoff baseline; implementation parameters marked TBD are not authorized to be guessed
- **Target:** Gemini / engineering implementation agent
- **Branch target:** `main` (implementation work must use a separate feature branch and reviewable commits)
- **Model scope:** Chronos-2 only
- **Authority order:** Product Foundation → System Specification → Chronos-2 Input/Output & Path Contract → Acceptance Test Plan → this handoff for execution sequencing

---

## 1. Executive implementation directive

Implement the Phase 1 Chronos-2 forecasting path as a controlled, model-independent subsystem that consumes CHART's existing market series and displays a clearly distinguished forecast path on the existing chart.

The Phase 1 success target is **a time-ordered, useful price path**, not synthetic future candles. The first executable baseline is Close-only univariate Chronos-2 inference. The implementation must preserve native model output and expose the distinction between native values, derived interpretation and chart presentation.

This handoff authorizes engineering planning and implementation specification. It does not grant permission to change the CHART repository's executable code until the project owner explicitly authorizes code changes. Until then, only documentation changes are in scope.

A successful build, API response or visually smooth line is not evidence of forecasting quality. Runtime, data integrity, path structure, uncertainty and acceptance evidence must be reported separately.

## 2. Mandatory reading and precedence

Read these files completely before changing anything:

1. `docs/01-product/FORECAST_PRODUCT_FOUNDATION_V1.md`
2. `docs/01-product/FORECAST_SYSTEM_SPEC_V1.md`
3. `docs/01-product/FORECAST_CHRONOS2_INPUT_OUTPUT_AND_PATH_CONTRACT_V1.md`
4. `docs/02-architecture/FORECAST_ACCEPTANCE_TEST_PLAN_V1.md`
5. `docs/01-product/FORECAST_MODEL_INTAKE_AND_COMPARISON_V1.md`
6. `docs/02-architecture/FORECAST_CURRENT_STATE_AUDIT_V1.md`

If an older document or existing code conflicts with these authoritative decisions, do not silently choose one. Report the exact conflict (file, symbol/section, observed behavior) and request a decision. The current-state audit describes observed legacy behavior; it is not permission to preserve unsafe or invalid behavior.

## 3. Scope of Phase 1

### 3.1 In scope

- One active forecasting model: `amazon/chronos-2`.
- Close-only univariate baseline as the first experiment.
- Explicit market-series identity, timeframe, timestamp convention, forecast origin and requested horizon.
- Strict input validation and leakage-safe cutoff at the forecast origin.
- Native Chronos-2 quantile inference through the supported upstream API.
- Preservation of raw native output and model/run metadata.
- A pointwise median-derived line only when the native median quantile is available; label its semantics accurately.
- Forecast rendering as a distinct overlay on the existing CHART chart.
- Explicit loading, ready, unsupported, invalid-input and failed states.
- Walk-forward evaluation against predeclared simple baselines.
- Instrumentation for latency, memory, model revision, dependency versions and reproducibility.
- A model-independent adapter boundary so later models can be considered without activating them now.

### 3.2 Explicitly out of scope

- Any second forecasting model, ensemble or model voting.
- Full future OHLC candle production as a Phase 1 requirement.
- Synthetic Open/High/Low values derived from Close quantiles, arbitrary spreads or previous closes.
- Random jitter, sine waves, decorative oscillations, arbitrary interpolation or smoothing designed to make a path look realistic.
- Stitching independent marginal quantiles into purported coherent scenarios.
- Trading recommendations, Buy/Sell signals, entries, exits, stops, targets or order execution.
- Replacing CHART's existing market-data providers, historical data pipeline or primary chart renderer.
- Replacing the current chart with a new charting library or introducing a parallel chart product.
- Treating support/resistance or reversal areas as guaranteed outcomes.
- Hard-coding context length, prediction horizon, quantile grid, hardware or precision without artifact/runtime evidence.

## 4. Repository reconnaissance before implementation

Before proposing code edits, inspect the current `main` branch and record:

- exact commit SHA;
- current file paths and symbols involved in market-series retrieval, OHLCV normalization, timeframe mapping and chart rendering;
- all current forecast execution paths on Android, Web, PHP and Python;
- current request/response schemas, worker endpoints, persistence and snapshot flows;
- existing tests and CI coverage for each affected path;
- exact legacy forecast code that creates synthetic OHLC or changes the native output.

Produce a concise file-level impact map. Do not assume that similarly named Android, Web, PHP and Python implementations share the same contract. Do not rewrite or refactor unrelated modules.

The implementation plan must identify one canonical inference boundary and explain how platform clients consume its result. Avoid duplicating model execution independently across clients unless a documented deployment constraint makes that necessary.

## 5. Required logical architecture

Keep these responsibilities separate even if the first implementation places some of them in one module:

1. **Market Data Adapter** — resolves the existing CHART series, provenance, timestamps and closed-candle cutoff.
2. **Input Validator / Preprocessor** — validates and prepares the Close-only sequence without hidden repair or leakage.
3. **Model Adapter** — wraps the pinned Chronos-2 artifact and supported inference API.
4. **Native Output Record** — preserves raw quantile values, quantile levels, dimensions and model metadata.
5. **Derived Path Interpreter** — optionally exposes the pointwise median and separately versioned derived events; never mutates native output.
6. **Forecast Service Contract** — carries origin, horizon, status, provenance, configuration and output identity.
7. **Chart Overlay Adapter** — renders the forecast separately from actual candles using the existing chart.
8. **Evaluation / Experiment Recorder** — stores origin-aligned forecasts and later actuals for walk-forward scoring.

A model-independent interface is required, but only Chronos-2 is registered/active in Phase 1. Do not add empty or speculative implementations for deferred models.

## 6. Input contract and validation

The initial baseline input is the chronological Close series from one exact CHART market series.

Required run identity and metadata:

- canonical instrument/series ID;
- provider and venue/contract identity where available;
- quote currency where relevant;
- timeframe;
- timestamp convention and timezone;
- forecast origin;
- last fully closed candle timestamp;
- ordered input timestamps;
- requested horizon in bars and corresponding time interval;
- source/data revision or stable input hash;
- preprocessing version;
- model artifact revision and runtime configuration.

Validation must reject or explicitly classify:

- empty or insufficient history;
- non-finite Close values;
- duplicate or out-of-order timestamps;
- mixed instruments, providers, contracts or timeframes;
- stale or partial final candle when closed-candle mode is selected;
- unexplained gaps or invalid timeframe alignment;
- input data extending beyond the declared origin;
- silent imputation, invented values or undocumented resampling.

Do not silently convert missing volume into positive or zero volume for this Close-only baseline. Volume is not part of E1 input. Do not include indicators, returns, OHLC variates or covariates in E1.

The minimum history length is a runtime/configuration gate to be established from the loaded model and controlled tests; do not invent a fixed threshold.

## 7. Chronos-2 adapter requirements

- Pin an immutable model-weight revision; never rely on a floating `main` or `latest` reference for reproducible runs.
- Verify the exact weight license for the pinned revision before redistribution or commercial deployment.
- Pin package and dependency versions in a reproducible environment.
- Use the supported Chronos-2 pipeline API; do not fork or reimplement model internals without a documented reason.
- Read actual context capacity, prediction capacity and supported quantile levels from the loaded artifact/runtime.
- Record effective context length, requested prediction length, returned prediction length, quantile levels, device and precision.
- Preserve the raw returned tensor before any conversion or display mapping.
- Validate expected output dimensions `(n_variates, n_quantiles, prediction_length)`, finite values, quantile ordering and exact horizon length.
- Reject unsupported horizons explicitly. Never silently truncate, pad, repeat or extrapolate outputs.
- If long-horizon autoregressive unrolling is tested, label it as a distinct configuration and evaluate it separately.
- Record inference latency, peak memory where measurable, runtime errors and reproducibility observations.

The model identifier alone is not sufficient run provenance.

## 8. Native output, derived path and display rules

### 8.1 Native output

Store the native quantile tensor/values and quantile-level mapping without changing values. Keep a stable association between each variate, quantile and future timestamp.

### 8.2 Central display line

If a native median quantile is available, the first display candidate may be the sequence of median values at each future step. It must be labelled as a **pointwise median path**. It is not a sampled joint trajectory and must not be described as a guaranteed path.

If the median output is monotonic or too smooth and omits important market structure, show that result faithfully and record the limitation. Do not manufacture swings to satisfy visual expectations.

### 8.3 Uncertainty

Uncertainty display is optional in Phase 1 until evaluated. If shown:

- identify bands as marginal quantiles;
- keep the central path legible;
- report coverage and width/sharpness together;
- do not turn marginal quantile curves into named alternative scenarios;
- omit the band if it is so broad that it obscures the path or has no practical interpretability.

No confidence percentage may be invented from a quantile label.

### 8.4 Derived events and levels

Trend, impulse, correction, swing high/low, reversal area and support/resistance are not established as native Chronos-2 event outputs by the reviewed interface. Any such labels must be explicitly system-derived, versioned and traceable to the forecast segment and historical evidence. Event thresholds must be defined and calibrated on development/validation data, then frozen before holdout evaluation.

Do not present derived zones as model guarantees.

### 8.5 Chart integration

- Use the existing CHART chart and its current actual market data.
- Preserve the actual chart's symbol, timeframe, price scale, timezone and user interactions.
- Draw forecast data only in the future region after the forecast origin.
- Visually distinguish actual candles from forecast overlays.
- Do not mutate or replace actual OHLCV data.
- Do not let a snapshot silently rerun a different model/configuration or substitute local output for a previously stored worker result.
- Ensure the displayed forecast is traceable to the exact run ID and origin.
- If the forecast is invalid or unavailable, display an explicit state; do not fall back to synthetic candles or a fabricated line.

## 9. Service/API and persistence contract

Before coding, inspect the existing Worker/API contract and document the proposed exact request/response schema. Do not create a second incompatible contract.

At minimum, a forecast response must make these concepts explicit:

- schema/contract version;
- run ID and status;
- canonical series identity and timeframe;
- forecast origin and last actual candle timestamp;
- requested and returned horizon;
- model identifier and immutable artifact revision;
- preprocessing/configuration identity;
- native output representation and quantile levels;
- timestamped native values;
- derived display path, if any, with derivation type/version;
- uncertainty representation and semantics, if enabled;
- warnings/errors and reason codes;
- creation time and runtime metadata.

Persistence must retain enough provenance to reproduce or audit a run. Never overwrite a prior run when configuration or input changes. Do not store fabricated future OHLC as if it were native data. Apply existing authentication, authorization, rate limits, input bounds and safe error handling; do not expose arbitrary user-controlled worker URLs or model paths.

If the current architecture cannot meet these requirements without a larger migration, stop and submit the exact gap and a minimal migration proposal rather than making an unreviewed cross-platform rewrite.

## 10. Experiment and test sequence

Implementation must be delivered in small, reviewable steps. Required sequence:

### E0 — Data and adapter validation
- canonical series and timeframe resolution;
- timestamp ordering and closed-candle origin;
- invalid/missing/gap handling;
- deterministic preprocessing;
- no future-data leakage;
- stable input identity/hash.

### E1 — Close-only Chronos-2 baseline
- load pinned artifact;
- verify model/license/dependency provenance;
- execute supported inference;
- preserve native quantiles;
- validate output dimensions and exact horizon;
- compare on identical origins against last-value/random-walk persistence and a suitable drift baseline.

### E2 — Path-structure evaluation
- direction/regime transition agreement;
- swing-high/low detection precision/recall;
- pivot timing and price error;
- correction depth and duration error;
- reversal-area precision/recall under predeclared event rules;
- path-shape metric with published formula and scale normalization.

A smooth or monotonic path is not automatically a failure in every market segment, but repeated structural omission across relevant test cases is a product-quality failure. Event labels must not be retrofitted after seeing holdout results.

### E3 — Uncertainty evaluation
- pinball loss by quantile;
- empirical coverage by horizon step;
- interval width/sharpness by horizon step;
- regime-level coverage where sample size permits;
- explicit test that broad bands do not hide the central path.

### E4 — Optional input ablations
Only after E1 is reproducible, test returns/differences, multivariate inputs, volume or technical covariates as separately versioned experiments. Every transformed target must be inverse-mapped to the common price-space evaluation target. Each experiment needs provenance and ablation results.

### E5 — Optional multivariate OHLC experiment
This is not a Phase 1 acceptance prerequisite. If separately approved, test native variates and candle geometry. Record violations; do not independently clamp/reorder values and call them native forecasts.

### E6 — Robustness and operations
Test multiple instruments, timeframes, horizons and market regimes; report per-slice results, latency, memory, failures and repeatability. Keep a final holdout untouched by model, feature and threshold selection.

## 11. Acceptance gates

Do not mark Phase 1 complete unless all applicable gates have evidence:

- **G1 Data integrity:** exact series/origin, valid timestamps, no leakage, deterministic preprocessing.
- **G2 Model provenance:** immutable weight revision, license verification, dependency lock and runtime record.
- **G3 Native output integrity:** raw quantiles retained, correct dimensions/order, finite values, no synthetic OHLC.
- **G4 Chart integrity:** actual data unchanged; forecast begins after origin; clear visual distinction; run traceability.
- **G5 Path quality:** structural metrics and representative cases reported against baselines; no decorative or fabricated oscillation.
- **G6 Uncertainty:** if shown, coverage and width/sharpness measured; no broad uninformative fan.
- **G7 Operational safety:** access control, bounded inputs/horizon, safe errors, no arbitrary worker URL, resource/latency measurements.
- **G8 Cross-platform consistency:** any client consuming the service contract renders identical run semantics; no local/server result substitution.
- **G9 Regression:** existing chart, data, snapshot and non-Forecast workflows remain unchanged.

A passing unit test or successful inference call does not alone satisfy the product acceptance gates.

## 12. Forbidden implementation shortcuts

Gemini must not:

- replace the existing chart renderer or market-data source;
- rewrite all forecast engines/platforms in one change;
- introduce a second model to mask an uninvestigated Chronos-2 failure;
- fabricate OHLC from Close quantiles;
- add random/sinusoidal noise or arbitrary smoothing;
- convert marginal quantiles into coherent-looking scenarios;
- silently change origin, timeframe, horizon or input series;
- swallow inference errors and draw a fallback forecast;
- claim accuracy, profitability or calibration without walk-forward evidence;
- hard-code runtime values without artifact evidence;
- remove legacy behavior without documenting its callers and migration path;
- modify unrelated UI, indicators, trading strategy or order execution;
- mark untested platforms or workflows as verified.

## 13. Required delivery package from Gemini

Before implementation, return:

1. repository commit SHA and verified file inventory;
2. current-state impact map by file/platform;
3. proposed canonical inference boundary and data flow;
4. exact request/response schema proposal;
5. model runtime/dependency/license pin proposal;
6. unresolved parameter table with measurement plan;
7. stepwise implementation plan with files to add/change;
8. test matrix mapped to E0–E6 and G1–G9;
9. explicit list of files and behaviors that will remain untouched;
10. risks, migration requirements and any decisions requiring owner approval.

After implementation is authorized and completed, return:

- commit/PR references and changed-file list;
- test commands, environment and actual results;
- raw/native output examples and run metadata;
- representative forecast-vs-actual plots or snapshots;
- walk-forward metrics by instrument/timeframe/horizon/regime;
- baseline comparisons and uncertainty coverage/width;
- known failures and limitations;
- confirmation that no prohibited transformation or unrelated code change was introduced.

Do not report a gate as passed without attaching its evidence.

## 14. Open decisions — must not be guessed

| Decision | Current status | Required resolution |
|---|---|---|
| Immutable Chronos-2 weight revision | TBD | Select and verify exact artifact/revision and license |
| Python/package/dependency versions | TBD | Reproducible compatibility test and lock |
| CPU/GPU and precision | TBD | Benchmark target deployment environment |
| Effective context length | Runtime-derived | Read from loaded artifact and test |
| Initial/max prediction horizon | TBD | Controlled horizon matrix |
| Quantile subset | TBD | Use supported native levels; document subset |
| Minimum history and missing-data policy | TBD | Data audit plus model/runtime tests |
| Event detector and thresholds | TBD | Define on development/validation only |
| Path metric formula and normalization | TBD | Pre-register before holdout scoring |
| API schema and canonical execution location | Proposed, not frozen | Reconcile with current worker/platform contracts |
| Forecast overlay style | Existing chart integration required | Minimal design consistent with chart conventions; no renderer replacement |

## 15. Change control and implementation stop conditions

Stop and report before proceeding if:

- authoritative documents conflict;
- required input fields cannot be traced to an existing trusted CHART source;
- the exact model artifact or its license cannot be verified;
- the model returns unexpected dimensions or unsupported horizon behavior;
- the current service contract cannot preserve native output/provenance;
- a proposed fix requires broad cross-platform refactoring;
- the chart renderer cannot distinguish forecast from actual data without changing core chart behavior;
- a test requires inventing market data or using future information;
- any acceptance metric or threshold is being selected after holdout inspection.

All implementation changes require explicit owner authorization. Work on a feature branch, keep commits small, and do not merge to `main` without review.

## 16. Version history

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-11-17 | Initial Gemini implementation handoff: scope, boundaries, architecture, input/output integrity, chart integration, test sequence, acceptance gates, forbidden shortcuts and delivery package |

---

**Non-negotiable principle:** Implement the measured model output faithfully. If Chronos-2 cannot produce a structurally useful path, report that limitation. Do not make the chart look convincing by inventing a forecast.
