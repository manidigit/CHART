# CHART Forecast — Model Intake and Comparison Framework
## چارچوب بررسی، پذیرش و مقایسه مدل‌های پیشنهادی

- **Version:** 1.0.0
- **Date:** 2026-11-17
- **Status:** Reusable intake protocol; no candidate model is pre-approved
- **Authority:** FORECAST_PRODUCT_FOUNDATION_V1.md v1.2.0 and FORECAST_SYSTEM_SPEC_V1.md v1.0.0
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
