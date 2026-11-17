# CHART Forecast — Model Intake and Comparison Framework
## چارچوب بررسی، پذیرش و مقایسه مدل‌های پیشنهادی

- **Version:** 1.0.3
- **Date:** 2026-11-17
- **Status:** Reusable intake protocol; Chronos-2 is the sole Phase 1 active-model candidate, subject to implementation and acceptance gates
- **Authority:** FORECAST_PRODUCT_FOUNDATION_V1.md v1.3.0 and FORECAST_SYSTEM_SPEC_V1.md v1.0.2
- **Purpose:** Evaluate candidate GitHub repositories and other model implementations consistently before deciding whether to research, prototype, test or integrate them.

---

## 1. Purpose

This framework is used when a candidate model, GitHub repository, paper implementation or forecasting service is proposed for CHART.

The purpose is not to reward popularity, novelty or README claims. The purpose is to establish, from repository evidence and controlled experiments, what the candidate actually does, what it requires, what it returns, how it behaves and whether it can contribute to the CHART Forecast product.

Each candidate is reviewed independently. A candidate may be valuable even if it is unsuitable for direct production integration; it may be retained as research, a benchmark or an experimental model.

## 2. Required evidence standard

Every finding must be classified as one of:

- **Verified in source:** directly established by inspected code/configuration.
- **Verified by execution:** reproduced through a documented test.
- **Claimed by project:** stated in README/docs but not independently verified.
- **Unknown:** evidence is missing or inconclusive.
- **Not applicable:** genuinely irrelevant, with reason.

Do not convert a project claim into a verified capability. Do not infer performance from architecture names, sample images or benchmark claims without examining the benchmark protocol and reproducing a suitable test.

## 3. Repository intake record

For every candidate, record:

| Field | Required information |
|---|---|
| Candidate ID | Stable internal identifier |
| Repository | Exact GitHub URL and owner/repository |
| Reviewed ref | Branch, tag or commit SHA |
| Review date | Date of inspection |
| Project status | Active, maintained, archived, unknown |
| License | Exact license and obligations; unknown if absent/ambiguous |
| Main language/runtime | Verified language and runtime requirements |
| Purpose | What the repository actually implements |
| Primary references | README, documentation, papers and relevant source paths |
| Evidence level | Source verified / execution verified / claimed / unknown |
| Initial disposition | Reject / Research / Prototype / Experiment / Integration candidate |

A moving default branch is not a reproducible reference. Record a commit SHA or release tag for any candidate that proceeds beyond initial screening.

## 4. Technical capability review

### 4.1. Forecast target and output

Determine exactly what the candidate predicts:
- close price;
- returns;
- direction/class;
- full OHLC;
- range/volatility;
- quantiles or prediction intervals;
- probability distribution;
- one or more future paths;
- conditional scenarios;
- another explicitly defined target.

Record whether the output is native to the model or created by a post-processing step. If the repository converts close/quantile output into OHLC, document the conversion and do not describe the result as native joint OHLC forecasting.

### 4.2. Temporal capability

Record:
- supported input timeframes;
- supported prediction horizons;
- whether horizon is step-based or time-based;
- required sampling regularity;
- handling of market closures and gaps;
- whether multi-timeframe input is supported;
- whether autoregressive rollout is used;
- whether the model predicts each step jointly or recursively;
- whether long-horizon behavior degrades or changes materially.

### 4.3. Input requirements

Record:
- required columns and feature definitions;
- required history length;
- volume requirements and semantics;
- external data dependencies;
- normalization/scaling requirements;
- missing-value behavior;
- training data assumptions;
- instrument/market assumptions;
- data licensing constraints.

### 4.4. Output semantics and uncertainty

Record:
- output schema and units;
- timestamp semantics;
- whether values are absolute prices, normalized values, returns or other quantities;
- whether output is deterministic or stochastic;
- whether a seed is supported;
- whether uncertainty is provided;
- whether probability/interval claims are calibrated and tested;
- whether the output is complete or may be partial;
- how failures and out-of-distribution inputs are handled.

## 5. Source and implementation quality

Inspect, where applicable:
- model definition and inference code;
- preprocessing and postprocessing;
- training pipeline;
- checkpoint/weight availability;
- configuration defaults;
- example notebooks and scripts;
- tests and test coverage;
- dependency versions;
- runtime and hardware requirements;
- data download and external service assumptions;
- error handling;
- security-sensitive code and network access;
- reproducibility instructions.

A repository that contains only a paper reproduction notebook or a trained checkpoint is different from a maintained inference library. Record the actual integration surface.

## 6. Licensing, provenance and operational risk

Before integration, establish:
- repository license;
- model weight license;
- dataset license and provenance;
- attribution requirements;
- commercial-use restrictions;
- redistribution restrictions;
- dependency licenses;
- whether weights can legally be bundled or downloaded;
- whether external services or paid APIs are required;
- known security or supply-chain risks.

If license or weight provenance is unclear, the candidate must not be treated as cleared for distribution or commercial deployment.

## 7. Experimental evaluation protocol

No candidate should be ranked using an uncontrolled sample or the repository's own headline metric alone.

A controlled experiment should define before execution:
- market series and source;
- timeframe;
- forecast origins;
- forecast horizons;
- eligible input history;
- feature availability at each origin;
- training/validation/test periods;
- benchmark/baseline methods;
- model configuration and version;
- evaluation metrics appropriate to output;
- treatment of missing/failed forecasts;
- compute budget and runtime;
- statistical uncertainty and sample dependence.

### 7.1. Temporal separation

Use chronological evaluation. Training, validation and test periods must respect time order. Rolling or walk-forward evaluation may be used where appropriate.

At every origin T, only information available at or before T may be used for inference and feature construction. Future actuals must remain isolated for evaluation.

Repeated tuning on the same test period must be tracked. A final untouched holdout or another defensible protocol must be reserved for final claims.

### 7.2. Baselines

A candidate must be compared with relevant simple baselines. Baselines are not assumed to be weak; if the candidate cannot demonstrate value beyond them, that is a valid finding.

### 7.3. Output-specific metrics

Metrics must match the predicted target. Potential metric families include:
- point forecast error;
- directional/path accuracy;
- OHLC and range error;
- quantile loss;
- distributional scoring;
- interval coverage and width;
- probability scoring and calibration;
- path/event sequence evaluation;
- operational reliability and latency.

Do not combine incompatible metrics into a single score without a documented normalization and rationale. Calibration and sharpness must remain distinguishable. Overlapping forecast origins are dependent samples and must not be treated as fully independent observations.

### 7.4. Candlestick realism is not a standalone score

A visually plausible candle sequence is not proof of predictive skill. Review separately:
1. structural validity of the output;
2. whether candle components are genuinely predicted or mechanically derived;
3. path consistency and market-context behavior;
4. measured performance against future actuals.

## 8. CHART integration fit

Assess:
- ability to run in a supported environment;
- inference-only deployment feasibility;
- model size and memory;
- cold-start and per-run latency;
- concurrent execution behavior;
- CPU/GPU needs;
- dependency conflicts;
- input/output adapter effort;
- ability to preserve raw output;
- deterministic/reproducible execution;
- licensing and distribution feasibility;
- security and data handling;
- maintenance burden.

Do not reject a strong research candidate solely because direct integration is difficult. Classify research value separately from production integration fit.

## 9. Candidate scorecard

Use qualitative evidence ratings first. Numerical weights should not be invented before candidate reviews establish meaningful criteria.

| Dimension | Assessment |
|---|---|
| Forecast target relevance | Strong / Partial / Weak / Unknown |
| Native output richness | Full OHLC / Path / Distribution / Point / Other |
| Temporal support | Suitable / Limited / Unsuitable / Unknown |
| Input compatibility | High / Adaptation needed / Low / Unknown |
| Evidence of predictive value | Reproduced / External only / Project claim / None |
| Baseline comparison | Passed / Mixed / Failed / Not tested |
| Reproducibility | High / Partial / Low / Unknown |
| Runtime feasibility | Suitable / Constrained / Unsuitable / Unknown |
| License/provenance | Cleared / Conditional / Blocked / Unknown |
| Integration effort | Low / Medium / High / Unknown |
| Operational/security risk | Low / Medium / High / Unassessed |
| Research value | High / Medium / Low |
| Production fit | High / Medium / Low / Not assessed |

A candidate must not receive an overall "winner" label from this table alone. Evidence and experimental results determine its disposition.

## 10. Candidate disposition

Each candidate receives one of these outcomes:

- **Reject:** fundamental incompatibility, unacceptable license/security risk, or no meaningful value for the intended purpose.
- **Research Only:** useful concepts or evidence, but not ready for executable integration.
- **Prototype:** sufficient promise to test an adapter or inference path.
- **Controlled Experiment:** eligible for a defined and reproducible benchmark.
- **Integration Candidate:** experiment and operational review justify integration planning.
- **Active Model:** only after implementation, acceptance tests and operational requirements pass.
- **Retired:** previously admitted but no longer suitable; historical runs remain preserved.

The disposition must include reasons, evidence, unresolved questions and next action.

## 11. Comparison report template

For every reviewed candidate, produce a report with these headings:

1. Executive conclusion.
2. Exact repository and reviewed commit.
3. What the repository actually contains.
4. What it predicts and what it returns.
5. Native output versus derived output.
6. Input, timeframe and horizon requirements.
7. Dependencies, hardware and runtime.
8. Training data, checkpoints and provenance.
9. License and commercial-use status.
10. Source-level strengths and weaknesses.
11. Reproducibility and test quality.
12. Known or observed failure modes.
13. Controlled experiment design and results, if executed.
14. Comparison against baselines.
15. CHART integration fit and estimated effort.
16. Risks and unresolved questions.
17. Disposition and rationale.

Every factual claim should point to a source path, commit, test or experiment result.

## 12. Comparing multiple candidates

When multiple candidates are reviewed, maintain a common comparison matrix but preserve each model's native capabilities.

Compare only like-for-like results where possible. When targets, horizons, input data or output types differ, show the incompatibility and compare only a justified common subset.

Do not:
- rank by GitHub stars;
- rank by model size or novelty;
- accept paper metrics without protocol review;
- equate a project demo with reproducible performance;
- infer joint OHLC prediction from a close forecast plus synthetic wicks;
- average different model paths without an explicit ensemble design;
- discard a model solely because it disagrees with the current favorite.

The result may be several complementary models rather than one universal winner.

## 13. Required inputs when a candidate is submitted

For a GitHub candidate, the repository URL is sufficient to begin an independent source review. If the user has a specific branch, commit, paper or intended role in mind, that context should be supplied, but it is not mandatory for initial screening.

No need to pre-filter candidates by algorithm family. Candidate repositories may represent fundamentally different approaches.

## 14. Version history

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-11-17 | Initial repository intake, evidence classification, technical review, licensing, experiment protocol, integration fit and disposition framework |
| 1.0.1 | 2026-11-17 | Added source-level screening records for Chronos-2, PatchTST, Time-Series-Library and Moirai 2.0 |
| 1.0.2 | 2026-11-17 | Recorded the Phase 1 decision: Chronos-2 is the sole active-model candidate; other candidates are deferred pending evidence-based review; clarified that selection is not performance or OHLC approval |
| 1.0.3 | 2026-11-17 | Reframed Phase 1 model evaluation around structured price-path quality, swings, corrections and reversals; candle OHLC is deferred and broad uninformative uncertainty cones are rejected |


---

## 15. Initial candidate screening — 2026-11-17

**Status:** Source-level screening only. No model has been executed on CHART market data; no predictive-performance claim is established. Reviewed repository references are the current `main` branch at inspection time. Blob SHAs are recorded below; this is not a substitute for pinning a repository commit before any reproducible experiment.

### 15.1. Primary candidate: Amazon Chronos-2

- Repository: https://github.com/amazon-science/chronos-forecasting
- Model weights: https://huggingface.co/amazon/chronos-2
- Reviewed source:
  - `README.md` — blob `1ec146a2e037a7725f53ae6bdfba22970804efb2`
  - `LICENSE` — blob `67db8588217f266eb561f75fae738656325deac9`
  - `src/chronos/chronos2/pipeline.py` — blob `d2b3f02e62fe663c0888414bad017f41d8ce57d3`
  - `src/chronos/chronos2/model.py` — blob `8adfbfcfdbc3674b97c8a4836e725be16cfc7080`
- Repository license: Apache-2.0. The Hugging Face model card also declares the Chronos-2 weights as Apache-2.0; verify the exact model revision and its license again before redistribution.
- Source-verified capabilities: zero-shot inference; univariate and multivariate forecasting; past and known-future covariates; multi-step quantile forecasts; DataFrame inference interface; CPU and GPU usage are documented by the project.
- Native output: quantile forecasts, not complete OHLC candles or a native joint candle-path object.
- CHART fit: strong research/prototype candidate for probabilistic multivariate forecasting. OHLC fields can be investigated as multiple related series/targets, but independently returned marginal quantiles do not guarantee coherent joint candle geometry (for example High >= Open/Close >= Low), nor do they prove that a realistic candle path has been learned.
- Important limitation: public benchmark leadership claimed by the project is not evidence of financial-market or OHLC predictive superiority. CHART-specific walk-forward testing against naive/random-walk and statistical baselines is mandatory.
- Initial disposition: **Prototype → Controlled Experiment candidate**, not production-approved.

### 15.2. Secondary comparator: official PatchTST

- Repository: https://github.com/yuqinie98/PatchTST
- Reviewed source:
  - `README.md` — blob `68ca7130debcca2887458da3948e5e79dae07e8c`
  - `LICENSE` — blob `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`
  - `PatchTST_supervised/models/PatchTST.py` — blob `5906049dbc663a154160c289b7a237899007ed5d`
- License: Apache-2.0.
- Source-verified capabilities: supervised forecasting; configurable context/prediction windows; multichannel input tensor; patch-based Transformer; optional self-supervised pretraining and downstream fine-tuning.
- Native output: point forecasts per channel. The inspected implementation does not provide native probabilistic quantiles or native OHLC candle constraints.
- CHART fit: useful supervised comparator and fine-tuning research candidate. Its channel-independence design means feeding O/H/L/C as four channels does not, by itself, enforce joint candle consistency.
- Initial disposition: **Controlled Experiment candidate**, secondary to Chronos-2.

### 15.3. Research infrastructure: THUML Time-Series-Library

- Repository: https://github.com/thuml/Time-Series-Library
- Reviewed source:
  - `README.md` — blob `not captured in this pass`
  - `LICENSE` — blob `278c2678a6167d7c110b4451c7fd1f2e51f4b532`
  - `requirements.txt` — blob `6a092bbbc105ce844996dee027ea838cc93667d1`
  - `models/PatchTST.py` — blob `085efd89de3af3024cd993a2ef139f2c5d4c3eaf`
  - `models/Chronos2.py` — blob `ce9e017a50a3ca2fd23db13d0c7c9db263234d7c`
- License: MIT.
- It is a research library/experiment harness, not a forecasting model and not a production-ready CHART adapter.
- The current README explicitly says maintainers will not actively add features and that many historical benchmarks may no longer be meaningful. Therefore it must not be treated as the authoritative up-to-date leaderboard or as proof of fair model comparison.
- The inspected Chronos2 wrapper hardcodes `device_map="cuda"`; this is a portability constraint in that wrapper, not a limitation of the upstream Chronos-2 package.
- Initial disposition: **Research reference only** for reusable implementations and experiment recipes; do not adopt it as CHART's canonical comparison environment without a separate reproducibility and leakage audit.

### 15.4. Moirai 2.0 — license gate

- Repository: https://github.com/SalesforceAIResearch/uni2ts
- Reviewed source: `README.md` blob `833c53a435a19b9b42c27e6f0a477b1963303ee0`; `src/uni2ts/model/moirai2/forecast.py` blob `bd1d5992dda586d04d44063d994b6e8fddf0573d`; `src/uni2ts/model/moirai2/module.py` blob `b4f80bf0631cab0e464f94c5714af6c13ecc7e8a`.
- The source code files declare Apache-2.0, but the official `Salesforce/moirai-2.0-R-small` model card declares the weights as **CC-BY-NC-4.0**. This non-commercial restriction is a material blocker for commercial CHART deployment unless separately licensed. Do not infer the weight license from the source-code license.
- Source-verified output design: quantile forecasts, with configurable multivariate target dimensions; not native OHLC candle output.
- Initial disposition: **Research only / commercial-use blocked pending written licensing clearance**.

### 15.5. Screening conclusion

Chronos-2 is the strongest candidate in this first source-level screen for a practical CHART experiment because it combines an accessible inference interface, zero-shot use, multivariate/covariate support, probabilistic output and an Apache-2.0 declared model license. This is a suitability judgment for experimentation, not a claim that it predicts financial markets accurately.

The immediate experiment should preserve the model's native quantile output and separately test:
1. four OHLC variables as targets versus a deliberately chosen target/feature arrangement;
2. marginal quantile coherence and invalid candle geometry;
3. close, return, range and OHLC-specific metrics without fabricating missing candle fields;
4. walk-forward results across multiple instruments, regimes and horizons;
5. naive/random-walk and suitable statistical baselines;
6. CPU/GPU inference, memory, latency and deterministic reproducibility.

Do not convert Chronos-2 quantiles into synthetic OHLC candles for the primary acceptance result. If a separate, explicitly labelled display transformation is later explored, retain raw outputs and evaluate the transformation independently.

### 15.6. Items not yet fully screened

TimesFM, OpenLTM, Large-Time-Series-Model, NeuralForecast implementations of N-BEATS/N-HiTS, TFT implementations, TimeXer, TimeMixer, iTransformer, TimesNet, ChanFormer and the financial benchmark repositories have not received a complete source/license/runtime review in this pass. No positive or negative disposition is implied for them.


---

## 16. Phase 1 model decision and expansion gate — 2026-11-17

### 16.1. Decision

**Chronos-2 is the sole model selected for the CHART Forecast Phase 1 implementation and controlled evaluation path.** No second forecasting model is in the Phase 1 operational scope.

This is a sequencing and scope decision based on the first source-level screening. It is not a finding that Chronos-2 is financially accurate, superior to all alternatives, production-approved, or capable of native complete OHLC candle generation.

The decision allows implementation and controlled experimentation to proceed without expanding the model surface prematurely.

### 16.2. Candidate status

- **Chronos-2:** sole Phase 1 model; proceed to implementation planning and controlled evaluation. Its native quantile output must be preserved. It remains subject to integration, output-contract, runtime, licensing-revision and acceptance checks.
- **PatchTST:** deferred candidate; not enabled or included in Phase 1.
- **THUML Time-Series-Library:** research reference only; not a Phase 1 model or canonical evaluation platform.
- **Moirai 2.0:** research-only candidate; commercial deployment remains blocked pending explicit licensing clearance for the weights.
- **Other screened or previously listed candidates:** deferred/unreviewed as stated in their individual records. Deferral is not rejection and does not imply a negative technical judgment.

### 16.3. Required diagnostic sequence before model expansion

If Phase 1 results are weak, incomplete or visually unsatisfactory, do not immediately add another model. Diagnose the failure in this order and preserve evidence for each step:

1. **Market data:** confirm instrument identity, provider/venue/contract, OHLCV integrity, timestamps, gaps, sessions and source consistency.
2. **Data preparation:** verify history window, sampling, missing-value handling, normalization, feature construction and absence of temporal leakage.
3. **Chronos-2 execution:** verify exact model/weight revision, inference interface, context length, covariates, quantile levels, device/runtime configuration and reproducibility.
4. **Forecast horizon:** test whether the selected timeframe and requested horizon are supported and whether error or uncertainty changes with horizon.
5. **Output interpretation and display:** distinguish native model output from adapters or presentation transformations; verify that the chart does not distort, fabricate or mislabel the forecast.
6. **Evaluation protocol:** verify forecast-origin alignment, eligible actuals, baselines, metrics, sample coverage and regime/instrument diversity.

Only after these checks may the team conclude that the remaining limitation is intrinsic to Chronos-2 or that its native output is insufficient for a defined product requirement.

### 16.4. Formal gate for admitting another model

A new model may be proposed for a later phase only when a written review establishes all of the following:

- the failure or unmet requirement is reproducible;
- data, preparation, execution, horizon, display and evaluation causes have been investigated and ruled out or quantified;
- the limitation is attributable to Chronos-2 itself, or a clearly defined capability absent from its native output is required;
- the proposed candidate has completed the evidence, source, weight-license, runtime and security review in this framework;
- a controlled, like-for-like experiment and relevant baselines are defined before execution;
- the expected benefit justifies the added operational, maintenance and comparison complexity;
- the scope change is explicitly approved and recorded in the system/product documentation.

Until this gate is passed, Chronos-2 remains the only Phase 1 model. The architecture must retain model-independent extension points, but extensibility is not a reason to activate additional models prematurely.

### 16.5. Phase 1 target capability and output integrity

The Phase 1 target is not native OHLC candle generation. It is a time-ordered, structurally meaningful price path capable of representing trend continuation and change, impulse moves, pullbacks, swing highs/lows and likely correction/reversal areas. A line or path representation is acceptable and may be preferable if it preserves these structures faithfully.

Chronos-2 must be tested against this target explicitly. Its multivariate quantile capability does not by itself prove that it can identify market structure, forecast meaningful turning points or generate temporally coherent paths. Do not infer those capabilities from general forecasting benchmarks. If its native outputs are too smooth, omit material swings, or provide only broad uninformative uncertainty, record that as an observed limitation only after controlled testing.

Support/resistance and reversal zones must be distinguished by provenance: model-native output versus system-derived interpretation based on the forecast path and historical market structure. They must not be displayed as guaranteed levels or events.

Uncertainty visualization must preserve a readable central path. A very broad cone/fan that simply spans many higher and lower prices without clarifying the likely sequence is not useful and must not pass product acceptance. Bands must be evaluated for both empirical coverage and width/sharpness. Do not arbitrarily connect independent marginal quantiles into a coherent-looking scenario.

### 16.6. Output integrity remains mandatory

Chronos-2's native quantile forecasts are not complete native OHLC candles and do not constitute a joint candle-path distribution. Do not manufacture Open, High or Low values from Close quantiles, perturbations or arbitrary spreads and label them as model-predicted candles.

The Phase 1 experiment may inspect and visualize native quantile outputs in an explicitly identified experimental representation. The product requirement for meaningful future OHLC candles remains open until an output method satisfies structural validity and predictive evaluation. A display adapter must never conceal the distinction between model output and derived presentation.

### 16.7. Current evidence boundary

At the time of this decision, Chronos-2 has passed source-level screening only. It has **not** passed CHART-specific runtime evaluation, walk-forward performance testing, product acceptance or production approval. No accuracy, profitability or OHLC-quality claim is authorized by this Phase 1 selection.
