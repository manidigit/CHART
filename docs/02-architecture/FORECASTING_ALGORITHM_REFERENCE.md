# Forecasting Algorithm Reference & Upstream Experiment Review

**Document status:** Research reference; not an implementation specification or production approval  
**Prepared:** 2026-11-15  
**Target project:** CHART  
**Upstream repository:** https://github.com/SWARNIM-TIWARI/time-series-forecasting-dashboard  
**Upstream branch reviewed:** `main`  
**Local reference snapshot:** [`time-series-forecasting-dashboard/`](../../time-series-forecasting-dashboard/)

---

## 1. Purpose and authority

This document consolidates the reusable forecasting concepts found in the upstream dashboard and its `experiments/` directory. It is intended to give CHART engineers and AI coding assistants one curated reference rather than requiring them to inspect multiple evolving prototype files.

This document has **lower authority** than CHART's product, architecture, data-provider, and forecast-contract specifications. If a recommendation here conflicts with an approved CHART specification, the CHART specification wins. Nothing in this document authorizes changes to the live application, database schema, API contract, provider selection, or deployment architecture.

The upstream project is an educational/research prototype. Its code and reported metrics are not evidence that any model is accurate, profitable, calibrated, or suitable for live trading.

## 2. Source inventory and selection

The upstream `experiments/` directory was inspected on branch `main`. The observed Python files were:

`33.py`, `run_dashboard.py`, `run_dashboard1.py`, `run_dashboard2.py`, `run_dashboard3.py`, `run_dashboard4.py`, `run_dashboard5.py`, `run_dashboard6.py`, `run_dashboard7.py`, `run_dashboard9.py`, `run_dashboard10.py`, `x1.py`, `x2.py`, and `x3.py`.

There was no `run_dashboard8.py` in the observed directory listing. The files are successive/experimental variants, not 14 independent validated algorithms.

### 2.1 Highest-value reference variants

| Upstream file | Why it is useful | Important caveat |
|---|---|---|
| `experiments/run_dashboard9.py` | Strongest consolidated reference for adaptive TFT setup, minimum-data checks, model status handling, and the later evaluation flow | Evaluation is still not a clean, common out-of-sample comparison for all models |
| `experiments/run_dashboard10.py` | Useful companion for the later backtest/metrics and model-comparison flow | LSTM/TFT predictions are not consistently retrained from the same training-only window as classical models |
| `experiments/run_dashboard7.py` | Useful intermediate TFT implementation showing adaptive encoder/prediction sizing and quantile output configuration | Prototype code; requires independent validation and shape/horizon checks |
| `experiments/run_dashboard6.py` | Shows an earlier TFT configuration and the evolution toward multi-quantile output | Earlier `output_size=1` with `QuantileLoss()` is not the preferred reference configuration |
| `experiments/run_dashboard5.py`, `run_dashboard1.py`, `run_dashboard2.py`, `33.py`, `x1.py`, `x2.py`, `x3.py` | Useful for tracing alternative parameter and control-flow experiments | Mostly incremental or overlapping variants; do not treat each as a separate model recommendation |

The checked-in `time-series-forecasting-dashboard/app.py` is retained as a source snapshot. It provides the basic ARIMA, Prophet, LSTM, Monte Carlo Dropout, TFT, metric, and chart examples. It is not a CHART runtime component.

## 3. Model families found in the source

### 3.1 ARIMA

The prototype uses `statsmodels.tsa.arima.model.ARIMA`, with a representative default order of:

```python
ARIMA(series, order=(5, 1, 0))
```

ARIMA models a univariate series using autoregressive, differencing, and moving-average terms. The order is a prototype default, not a universally suitable configuration. It must be selected using training-only data and a time-series validation procedure.

**Potential CHART use:** a lightweight statistical baseline for a single numeric target, provided that stationarity/differencing, parameter selection, residual diagnostics, and failure states are handled explicitly.

**Do not copy:** the prototype's behavior of returning a flat last-observation forecast after an exception. A failed model must remain failed and expose a machine-readable status and reason.

### 3.2 Prophet

The prototype maps a date/value series to Prophet's `ds`/`y` columns and disables built-in daily, weekly, and yearly seasonality in its representative configuration.

Prophet can be evaluated as a trend/seasonality-oriented comparator when the data has a meaningful calendar structure. Disabling all seasonality is a configuration choice, not a general recommendation. Market sessions, weekends, holidays, and irregular trading calendars require explicit treatment.

**Potential CHART use:** an optional comparator for suitable instruments/timeframes, not a default assumption for every market series.

**Do not copy:** automatic generation of ordinary daily dates as a substitute for CHART's canonical candle timestamps.

### 3.3 LSTM

The prototype uses a PyTorch sequence-to-one LSTM and recursively feeds predictions back into the input window for multi-step inference.

Representative settings seen in the principal implementation:

| Parameter | Representative value |
|---|---:|
| Input features | 1 |
| Hidden size | 64 |
| Recurrent layers | 2 |
| Dropout | 0.2 |
| Sequence length | 30 |
| Optimizer | Adam |
| Learning rate | 0.001 |
| Loss | Mean Squared Error |
| Epochs | 10 in the principal snapshot; other experiments vary |
| Batch size | Up to 16 in later variants |

Some variants use a hidden size of 32, one recurrent layer, different epoch counts, or explicit small-data skip checks. These are experimental alternatives, not evidence that one setting is optimal.

**Potential CHART use:** a candidate nonlinear sequence model after a robust data pipeline, scaling, training-window discipline, deterministic/reproducible training, and walk-forward validation are implemented.

**Risks:** recursive error accumulation, sensitivity to scaling and regime changes, limited training samples, unstable results across random seeds, and the mismatch between a one-feature close-price model and a multi-feature OHLCV market model.

### 3.4 Monte Carlo Dropout

The LSTM prototype performs repeated stochastic forward passes with dropout enabled during inference (commonly 50 samples in the later reference implementation), then uses the empirical mean and 5th/95th percentiles.

This produces a measure of model stochasticity under that implementation. It does **not** by itself establish a calibrated 90% prediction interval, nor does it account for all sources of market uncertainty.

Before exposing an interval to users, CHART must measure empirical coverage and interval width over many untouched historical forecast origins. The UI/API must distinguish a point forecast, an uncalibrated dispersion band, and a statistically evaluated prediction interval.

### 3.5 Temporal Fusion Transformer (TFT)

The later experiment variants use PyTorch Forecasting's `TimeSeriesDataSet` and `TemporalFusionTransformer`, with a univariate target named `value`, synthetic integer `time_idx`, and a single `series_id`.

Representative later-variant configuration:

| Parameter | Representative value |
|---|---:|
| Minimum input length gate | 90 observations |
| Maximum encoder length | `min(30, n // 4)`, with adaptive reduction in some cases |
| Maximum prediction length | `min(30, n // 4)`, with adaptive reduction in some cases |
| Batch size | 16 |
| Learning rate | 0.03 |
| Hidden size | 16 |
| Attention heads | 1 |
| Dropout | 0.1 |
| Hidden continuous size | 8 |
| Output size | 7 |
| Loss | `QuantileLoss()` |
| Epochs | 5 |

The evolution from earlier `output_size=1` examples to `output_size=7` in later variants is important: the later configuration is intended to emit multiple quantiles. However, the exact quantile ordering, output tensor shape, and mapping from output indices to quantile levels must be verified against the installed PyTorch Forecasting version and model configuration. Do not assume index positions without checking the declared quantiles.

The experiment code creates a training dataset ending before the final prediction window and a prediction/validation dataset from the full series. That pattern is useful for understanding the library API, but it is not a complete rolling-origin benchmark. The training/validation boundary and every feature's availability at forecast time must be audited.

**Potential CHART use:** a later-stage research candidate when there is enough historical data and a justified multi-feature design. TFT should not be selected merely because it is more complex.

## 4. Evaluation methods and metrics

### 4.1 Metrics in the prototype

The experiments include:

- **RMSE:** `sqrt(mean((actual - predicted)^2))`; penalizes large errors and remains in the target's units.
- **MAPE:** mean absolute percentage error over non-zero actual values, multiplied by 100.

MAPE is undefined or unstable when actual values are zero or near zero and is not a good universal metric for returns, spreads, or series that can cross zero. Metrics should be selected for the instrument and target definition. Consider MAE, RMSE, scaled errors, directional measures, and probabilistic metrics where appropriate. No single metric should be treated as proof of trading usefulness.

### 4.2 Critical evaluation defect: leakage and inconsistent splits

The later variants add a last-30-observation comparison and retrain ARIMA/Prophet using a truncated training series in parts of the evaluation flow. However, LSTM and TFT predictions are generated using models trained on the full data series in the main model flow and are then compared with the final 30 observations.

That means the held-out segment is not consistently unseen by all models. The resulting cross-model RMSE/MAPE ranking is invalid as a fair out-of-sample comparison. It must not be used to declare a best model or to tune production settings.

### 4.3 Required CHART evaluation protocol

Any candidate model must use the same evaluation origins, target timestamps, horizon, and information cutoff:

1. Define a forecast origin (t) and horizon (H) in CHART candle units.
2. For each origin, expose training data only through (t); keep the next (H) candles untouched.
3. Fit all preprocessing, imputation, feature selection, and scaling using only the training window.
4. Train each model using only that window. No model may use later candles or labels.
5. Forecast exactly the same future candle timestamps for every model.
6. Repeat over multiple rolling/walk-forward origins and relevant market regimes.
7. Compare against simple baselines (at minimum last-value/naive; add suitable drift or seasonal-naive baselines where justified).
8. Report metrics per horizon and instrument/timeframe, plus aggregate results with sample counts.
9. Preserve failed, skipped, and insufficient-data outcomes as explicit statuses; do not silently substitute forecasts.
10. Keep a final untouched evaluation period for model selection decisions where feasible.

A single final 30-row split is not enough to establish robustness across regimes.

## 5. Prediction intervals and probabilistic outputs

For any interval-producing model:

- Record the quantile levels and their exact mapping to output channels.
- Verify that lower quantiles do not exceed median quantiles and median quantiles do not exceed upper quantiles, except where an explicit correction policy is documented.
- Measure empirical coverage (e.g. nominal 80% or 90%) on repeated out-of-sample origins.
- Measure average interval width and a proper probabilistic score where appropriate.
- Evaluate calibration separately by instrument, timeframe, and forecast horizon when sample size permits.
- Do not label an interval as a confidence interval unless its statistical meaning is justified. A predictive interval is not the same thing as model confidence.
- Do not pad a short forecast by repeating its last value to make it appear to cover the requested horizon. Return a horizon mismatch/failure status instead.

## 6. Data contract and CHART integration boundaries

The upstream dashboard is based mainly on a date plus one numeric `value` (typically close price). CHART's forecasting engine must remain anchored to its own canonical market-data and forecast contracts.

Before any model integration, explicitly map and validate:

- Instrument/symbol identity and provider provenance.
- Canonical candle interval/timeframe and exact candle-open/close timestamp semantics.
- OHLCV fields, missing candles, duplicates, out-of-order records, and provider corrections.
- Market session, exchange timezone, daylight-saving transitions, and closed-market periods where applicable.
- Multi-source reconciliation and data-quality state, without blending incompatible price definitions.
- Forecast origin, horizon, output timestamps, target field, units, and model version.
- Per-symbol/provider/timeframe settings and the approved provider abstraction.
- The distinction between historical observed candles and future model-generated values.

The prototype's synthetic integer time index is a library-specific encoding, not a replacement for CHART's timestamps. Its daily future-date generation and fixed 30-step horizon must not be copied into intraday or trading-session forecasts.

No Streamlit UI, CSV workflow, stock-specific assumptions, Python dependency list, or prototype training pipeline should be imported into CHART's Android, web, PHP, or database runtime as a shortcut.

## 7. Minimum model result and observability contract

A CHART model execution should, at minimum, be traceable with fields equivalent to:

- `model_id` and `model_version`
- `status`: success / skipped / failed
- `reason` when skipped or failed
- `symbol`, `provider_context`, `timeframe`
- `forecast_origin`, `horizon`, and exact output timestamps
- `training_start`, `training_end`, and training sample count
- `feature_set` and preprocessing/scaler version
- model hyperparameters and deterministic seed where applicable
- point forecast and optional quantiles/interval metadata
- evaluation protocol/version and out-of-sample metrics, when available
- source-data provenance or immutable data reference/hash, consistent with CHART's approved audit design
- execution duration and sanitized error details

These are conceptual requirements for traceability, not a directive to add database columns or change the existing API envelope. Map them to the currently approved CHART contracts before implementation.

## 8. Candidate adoption order

The upstream experiments do not justify deploying all four model families simultaneously. A defensible research sequence is:

1. **Naive baseline:** establish a transparent baseline first.
2. **ARIMA:** test as a statistical comparator on appropriate stationary/transformed targets.
3. **Prophet:** test only where calendar/trend structure makes it a reasonable candidate.
4. **LSTM:** evaluate only after leakage-free preprocessing and rolling-origin validation are in place.
5. **TFT:** evaluate later, only when data volume, feature availability, compute budget, and validation evidence justify its complexity.

This is an evaluation order, not a final product roadmap or a claim that these models will outperform CHART's existing forecast approach.

## 9. Explicit non-adoption list

The following prototype behaviors are rejected for direct reuse:

- Training on the full series and scoring on a tail that was already seen during training.
- Comparing models trained on different cutoffs or evaluated on different target timestamps.
- Replacing model exceptions with flat forecasts while reporting the model as successful.
- Treating Monte Carlo Dropout percentiles as calibrated prediction intervals.
- Assuming TFT output indices map to particular quantiles without reading the configured quantile list and validating tensor shape.
- Extending a shorter prediction by repeating the last forecast value.
- Using daily calendar dates for intraday or exchange-session forecasts.
- Treating a 90-row TFT threshold, a 30-row sequence, or any prototype hyperparameter as a universal statistical minimum.
- Using prototype RMSE/MAPE rankings as evidence of future market performance or profitability.
- Copying the Streamlit application into CHART production.

## 10. Reproducibility and engineering gates

Before accepting any experiment result:

- Pin and record Python and package versions in a reproducible environment.
- Record model parameters, random seeds, hardware/device, training duration, and data snapshot/version.
- Confirm no future data is used in features, scaling, imputation, labels, or model selection.
- Test multiple symbols, timeframes, sample sizes, missing-data cases, and market regimes.
- Verify output length, timestamp alignment, numeric finiteness, quantile ordering, and error-state behavior.
- Compare against baselines using identical rolling origins.
- Preserve experiment code and result artifacts separately from production code.
- Require an explicit architecture/product decision before implementation or deployment.

## 11. Source provenance and license

The upstream source repository is:

https://github.com/SWARNIM-TIWARI/time-series-forecasting-dashboard

The local snapshot under `time-series-forecasting-dashboard/` retains the upstream MIT license and attribution. The experiment variants were reviewed as upstream research material; they were **not copied wholesale** into CHART because they are overlapping prototypes and contain methodological limitations.

Primary files of interest:

- `app.py`
- `experiments/run_dashboard6.py`
- `experiments/run_dashboard7.py`
- `experiments/run_dashboard9.py`
- `experiments/run_dashboard10.py`
- Other observed variants listed in Section 2.

The source review is an engineering assessment of the inspected code, not an endorsement by the upstream author and not a claim of measured model performance.

---

**Final rule:** use this document to understand and evaluate candidate techniques. Use CHART's approved specifications to decide what to build. Never turn prototype code or contaminated benchmark scores into production behavior.
