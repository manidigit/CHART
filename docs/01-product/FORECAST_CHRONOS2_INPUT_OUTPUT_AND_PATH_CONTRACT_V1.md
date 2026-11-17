# CHART Forecast — Chronos-2 Input/Output & Price-Path Contract
## قرارداد داده، اجرای مدل، تفسیر خروجی و ارزیابی مسیر قیمت

- **Version:** 1.0.0
- **Date:** 2026-11-17
- **Status:** Normative Phase 1 model-specific contract; runtime parameters marked TBD require controlled measurement before implementation freeze
- **Authority:** FORECAST_PRODUCT_FOUNDATION_V1.md v1.3.0; FORECAST_SYSTEM_SPEC_V1.md v1.0.2; FORECAST_ACCEPTANCE_TEST_PLAN_V1.md v1.0.1
- **Model scope:** `amazon/chronos-2` only for Phase 1
- **Evidence basis:** Upstream Chronos source reviewed at the file revisions listed in Section 12. Source review is not runtime or market-performance validation.

---

## 1. Purpose and non-goals

This contract defines the Phase 1 boundary between CHART market data, Chronos-2 inference, native model output, any derived interpretation, chart rendering and later evaluation.

The Phase 1 product target is a useful future price path that can expose trend continuation/change, impulse movement, pullbacks, swing highs/lows and likely correction/reversal areas. A line/path is acceptable. Complete OHLC candle generation is not required.

This document does not:
- claim that Chronos-2 has learned financial-market structure or can reliably predict turning points;
- define a trading signal, entry, exit, stop, target or order;
- authorize synthetic OHLC construction;
- authorize arbitrary interpolation or smoothing to make the forecast look natural;
- convert marginal quantiles into joint scenarios;
- fix context length, horizon, quantile levels or device values without checking the exact loaded model artifact and controlled tests.

## 2. Phase 1 model identity and reproducibility

The initial model identifier is `amazon/chronos-2`. A model name alone is insufficient for reproducibility.

Every run must preserve:
- repository/model identifier;
- immutable Hugging Face revision/commit and resolved weight artifact identity;
- Chronos package version and source revision;
- Python, PyTorch, Transformers and relevant dependency versions;
- device/runtime selection and precision settings;
- effective context length, prediction length and quantile levels;
- all non-default inference arguments;
- input dataset identity, exact origin and ordered input timestamps;
- preprocessing version and feature/target mapping;
- run seed only where the relevant operation is stochastic (do not imply determinism merely by storing a seed).

The exact Hugging Face model revision and the license attached to that exact weight revision must be re-verified before redistribution or commercial deployment. The upstream repository source license does not replace verification of model-weight terms.

## 3. Input data contract

### 3.1. Required canonical market context

The CHART adapter must resolve one exact market series and one timeframe. The input window must be ordered, timestamped and cut off at the forecast origin.

Required metadata:
- canonical instrument/series ID, including provider, venue/contract and quote currency where applicable;
- timeframe and timestamp convention;
- forecast origin and last eligible closed candle;
- ordered timestamps and data revision/source identity;
- requested horizon in bars and its corresponding time interval;
- OHLCV availability and provenance flags.

The default inference origin is the latest fully closed candle. Use of an open/in-progress candle is a separate explicit mode and must not be mixed with closed-candle backtests.

### 3.2. Phase 1 baseline target

The first controlled baseline is **Close-only univariate forecasting**:
- target series: chronological Close values from the selected, validated market series;
- no synthetic target values;
- no fabricated future covariates;
- no use of future OHLCV, future indicators or any field unavailable at the origin;
- preserve the original price scale and timestamp mapping for display/evaluation.

This baseline isolates the model's ability to forecast a price trajectory before introducing multivariate interactions or feature complexity. It is an experimental starting point, not a proven optimal input design.

### 3.3. Separate input experiments

The following are separate experiments and must not be silently combined into the baseline:

1. **Close level:** raw Close series.
2. **Return/difference target:** only after a documented transformation, inverse transformation and leakage-safe evaluation are specified.
3. **Multivariate OHLC targets:** Open, High, Low and Close supplied as related variates in one Chronos-2 multivariate task, if the selected public interface and data preparation support the intended alignment.
4. **Volume/covariates:** only when semantics are known (exchange volume, tick volume, estimated or unavailable are distinct); past-only and known-future covariates must be classified correctly.
5. **Technical features:** only with a written definition, causal calculation, provenance and ablation test.

Each experiment must have its own configuration and result identity. A better score on a different target transformation is not a like-for-like comparison unless results are mapped back to the same price-space target and evaluation horizon.

### 3.4. Data quality gates

Reject or explicitly classify:
- invalid OHLC geometry;
- duplicate or out-of-order timestamps;
- unexplained gaps or mixed sessions;
- mixed instruments/providers/contracts;
- stale or revised input without recorded revision;
- missing volume silently converted to zero or positive volume;
- partial final candle treated as closed;
- non-finite values or undocumented imputation.

Do not repair source data invisibly. Any allowed preprocessing must be deterministic, versioned and recorded.

## 4. Chronos-2 inference contract

### 4.1. Supported native interface facts

The reviewed upstream `Chronos2Pipeline.predict()` accepts univariate and multivariate arrays/tensors, lists of series, or structured inputs containing target and optional past/future covariates. Its documented return is a list of tensors, each shaped as:

`(n_variates, n_quantiles, prediction_length)`

The pipeline exposes model-specific properties including context length, output patch size, model prediction length, maximum output patches and quantile levels. These values must be read from the loaded artifact/runtime, not hard-coded from a generic example.

### 4.2. Initial inference behavior

For the Phase 1 baseline:
- use the supported upstream Chronos-2 inference API;
- explicitly pass the requested prediction length and effective context length;
- capture the exact quantile levels returned/selected;
- preserve the raw output tensor before any chart transformation;
- validate tensor dimensions, finite values, quantile ordering and returned horizon length;
- fail explicitly on unsupported input or horizon; do not silently shorten or extend the requested horizon.

The upstream code warns that prediction lengths beyond the model's configured prediction length may degrade quality and uses an autoregressive long-horizon procedure. Therefore the Phase 1 horizon must be bounded by an experiment matrix. Longer horizons must be separately identified and evaluated, not assumed equivalent.

### 4.3. Context length and quantiles

No universal numeric value is frozen by this document. At model load:
- read the model's actual context capacity and configured quantile levels;
- record the effective context length passed to inference;
- test shorter context windows against the available maximum;
- do not exceed the model context capacity by assuming a larger value is accepted;
- use only quantile levels supported by the loaded model;
- do not describe a quantile level as a calibrated event probability without calibration evidence.

The first experiment should retain the model's native quantile grid or a documented subset that includes the median if available. Any subset is a configuration change and must be recorded.

## 5. Native output semantics and integrity

### 5.1. Quantiles are not a single realized path

Chronos-2 returns quantile forecasts at each future step. A sequence of per-step median values is a **pointwise median path**. It is useful as a central display line, but it is not automatically a jointly sampled future trajectory and does not prove that the model predicts the exact temporal sequence of market swings.

Similarly, lower and upper quantile sequences are marginal time-step summaries. They must not be relabeled as coherent lower/upper scenarios unless temporal joint coherence is independently established.

### 5.2. Prohibited transformations

Do not:
- generate Open from the prior Close plus an arbitrary offset;
- generate High/Low from quantile spread or fixed multipliers;
- add sine waves, random jitter or decorative oscillations;
- smooth away meaningful pivots or introduce pivots absent from source output;
- connect independently selected quantiles into a path and call it a model scenario;
- extrapolate, repeat or fill missing forecast points and label them model output;
- hide raw outputs after transformation.

A transformation may be investigated only as a separately versioned, explicitly labelled derived view. It must be compared against the raw output and independently evaluated. It cannot be accepted merely because it looks more like a trading chart.

### 5.3. Phase 1 central path

If a central line is displayed, it must be derived transparently from the native median quantile at each horizon step (or another explicitly documented native point statistic). The chart metadata must label it as a pointwise quantile-derived path, not a sampled or guaranteed trajectory.

If the median path is too smooth or structurally empty, that is a model/output limitation to measure—not permission to inject artificial oscillations. The system may show that the model did not provide a structurally useful path.

## 6. Multivariate OHLC experiment and candle geometry

A multivariate OHLC experiment may be run after the Close-only baseline. Chronos-2's ability to forecast multiple variates jointly does not by itself guarantee valid candle geometry or a joint probabilistic candle distribution.

For every future step and every quantile level, validate the values if interpreting them as OHLC:
- `High >= max(Open, Close)`;
- `Low <= min(Open, Close)`;
- `High >= Low`;
- values are finite and timestamps aligned.

Do not independently reorder or clamp invalid OHLC outputs and then report the corrected values as native model forecasts. Record invalid geometry as an observed failure. A separately labelled post-processing experiment requires its own methodology and evaluation.

OHLC forecasting is not a Phase 1 acceptance prerequisite.

## 7. Path interpretation and structural event analysis

The initial native output may contain only price quantiles. Trend, swing, correction and reversal labels therefore require a separate interpretation layer unless Chronos-2 itself exposes such events (the reviewed public inference contract does not establish native event labels).

Any system-derived interpretation must:
- identify itself as derived, not model-native;
- cite the forecast-path segment and historical evidence used;
- state the method/version and thresholds;
- preserve uncertainty or ambiguity when an event is not identifiable;
- avoid presenting support/resistance or reversal areas as guaranteed outcomes.

Candidate event definitions (to be fixed and tested before scoring):
- **Direction/regime:** sign and persistence of path movement over a defined rolling segment, with a neutral/uncertain state where evidence is weak.
- **Swing high/low:** a local extremum defined using a causal/forecast-aware rule; report its forecast time, price and prominence.
- **Correction:** counter-move relative to the preceding impulse, measured by depth, duration and recovery/continuation.
- **Reversal area:** a time/price region where the path changes direction under the declared event rule; not a single guaranteed turning tick.
- **Support/resistance:** a system-derived zone only when linked to identified historical pivots/structure and forecast-path interaction. Store provenance and contributing evidence.

No threshold or event detector is approved merely by appearing in this list. Thresholds must be calibrated on training/validation periods and frozen before final holdout evaluation.

## 8. Uncertainty display

Phase 1 uncertainty display is optional until the selected representation passes validation.

Rules:
- central path must remain visible;
- native marginal quantile bands may be shown as time-indexed uncertainty bounds, clearly labelled as marginal quantiles;
- broad bands that obscure the central path fail product acceptance;
- report empirical coverage and average/median width together;
- assess coverage by horizon step and market regime where sample size permits;
- do not call a nominal quantile calibrated unless empirical calibration supports that claim;
- do not render multiple quantile sequences as coherent alternative paths without joint-path evidence.

If no useful uncertainty view can be supported, omit it rather than manufacture a cone or scenario.

## 9. Evaluation protocol

### 9.1. Forecast-origin discipline

Use rolling/walk-forward origins. For every origin:
1. freeze the eligible input at that timestamp;
2. run inference using only information available then;
3. store raw output, model revision, config and input identity;
4. wait for actual market observations;
5. align forecast steps to actual timestamps and evaluate only eligible coverage.

Overlapping forecast windows are allowed only when the statistical analysis accounts for dependence. The number of forecast points must not be misrepresented as the number of independent experiments.

### 9.2. Baselines

At minimum compare against:
- last-value / random-walk persistence;
- a drift baseline where its assumptions are suitable;
- a simple causal trend baseline selected before final holdout testing.

Chronos-2 must be evaluated on the same origins, target, horizon, market series and actuals as each baseline.

### 9.3. Required metric families

No single endpoint error is sufficient. Record, where applicable:
- point accuracy: MAE and scaled error in price space; MASE or another scale-aware metric with denominator definition;
- directional accuracy by horizon segment;
- path-shape/distance metric with exact formula and scaling;
- turning-point detection precision/recall and timing/price error;
- swing-high/low detection and prominence error;
- correction depth and duration error;
- regime/direction transition agreement;
- quantile loss/pinball loss by quantile;
- empirical coverage and interval width/sharpness by horizon;
- valid-output rate and invalid OHLC geometry rate for OHLC experiments.

Avoid MAPE where prices can approach zero or where its behavior is unsuitable; document metric limitations. Visual inspection supplements metrics and does not replace them.

### 9.4. Market coverage

The evaluation matrix must include multiple instruments/series, timeframes, horizons and materially different regimes (trend, range, high volatility, low volatility and transition where available). Report each slice separately before any aggregate.

The dataset selection, split dates, origin generation, excluded periods, data provider and revisions must be recorded. Keep a final holdout untouched by feature, threshold or model selection.

### 9.5. Acceptance interpretation

A model does not pass merely because it beats one baseline on endpoint MAE. It must demonstrate useful path structure without unacceptable degradation in point accuracy, and uncertainty must not be both uncalibrated and uninformative.

A failed structural test is a real failure even if the terminal price is close. A visually plausible path is not success unless walk-forward evidence supports it.

## 10. Required experiment sequence

1. **E0 — Data and adapter validation:** deterministic input construction, timestamp alignment, provenance and no-leakage tests.
2. **E1 — Close-only baseline:** native pointwise quantiles; initial horizon/context matrix; compare with naive baselines.
3. **E2 — Path-structure assessment:** swing, correction, reversal and regime metrics; identify whether the median path is structurally useful.
4. **E3 — Uncertainty assessment:** quantile loss, coverage and width; determine whether any band is useful.
5. **E4 — Input ablation:** compare documented return/difference or covariate variants only after E1 is reproducible.
6. **E5 — Multivariate OHLC experiment:** separate run family; assess joint information benefit and candle-geometry failure rate; no synthetic repairs.
7. **E6 — Robustness:** instruments, timeframes, horizons, regimes, resource use, repeatability and model revision checks.

Do not skip E1 to begin with complex OHLC/features. Do not expand to another model before completing the diagnostic sequence in the Model Intake document.

## 11. Runtime parameters intentionally left open

The following must be measured or resolved from the exact model artifact before implementation values are frozen:
- effective context length;
- initial and maximum Phase 1 prediction horizons;
- quantile subset, if any;
- CPU/GPU target and precision;
- inference latency and memory envelope;
- batch sizing and concurrency;
- model revision pin and dependency lock;
- data history length beyond the model context window;
- event-detector thresholds and path metric definitions.

The implementation must not substitute arbitrary values for these unknowns. Record a proposed value, evidence, test result and approval in the experiment record.

## 12. Source review record and evidence boundary

Reviewed upstream source:
- Repository: https://github.com/amazon-science/chronos-forecasting
- Branch/ref reviewed: `main` at review time; this is not an immutable release pin.
- `README.md` blob: `1ec146a2e037a7725f53ae6bdfba22970804efb2`
- `src/chronos/chronos2/pipeline.py` blob: `d2b3f02e62fe663c0888414bad017f41d8ce57d3`
- `src/chronos/chronos2/model.py` blob: `8adfbfcfdbc3674b97c8a4836e725be16cfc7080`

Source-verified facts used here:
- Chronos-2 supports univariate and multivariate input paths and optional past/future covariates through the inspected pipeline API.
- `predict()` returns quantile predictions with dimensions documented in Section 4.
- Context capacity, quantile levels, output patch size and prediction capacity are exposed by the loaded pipeline/model configuration.
- The pipeline warns about horizons beyond its configured prediction length and uses a long-horizon unrolling heuristic.
- Quantile forecasts are the native output representation; this source review does not establish native OHLC constraints, explicit swing/reversal labels or a coherent joint candle-path distribution.

Not established by source review:
- CHART runtime compatibility;
- market prediction accuracy;
- usefulness of the median path for market structure;
- calibrated uncertainty on financial data;
- commercial rights for every future model-weight revision;
- acceptable production latency/cost.

## 13. Version history

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-11-17 | Initial Phase 1 Chronos-2 contract: data boundary, native quantile semantics, no fabricated OHLC, path interpretation, uncertainty, walk-forward evaluation and explicit unresolved runtime parameters |

---

**Implementation rule:** Preserve the model's native output, label every derived interpretation, and measure the path against future actuals. If the model does not produce the structure CHART needs, expose that limitation instead of drawing structure into the result.
