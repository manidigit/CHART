# Time-Series Forecasting Dashboard — Reference Source

This directory contains selected source files copied from the public repository:

- Upstream: https://github.com/SWARNIM-TIWARI/time-series-forecasting-dashboard
- Upstream branch inspected: `main`
- Upstream license: MIT (the original LICENSE file is retained)
- Purpose in CHART: research/reference material for evaluating multi-model time-series forecasting. This is **not** an integrated or production-ready CHART module.

## Included files

- `app.py`: original Streamlit implementation containing ARIMA, Prophet, LSTM with Monte Carlo Dropout, TFT, forecast visualizations, and evaluation code.
- `requirements.txt`: original Python dependency list.
- `LICENSE`: original MIT license and copyright notice.

The sample stock CSVs, generated processed data, and Streamlit-only presentation layer are intentionally not copied. The separate `merge_stocks.py` is also omitted because preprocessing is already included in `app.py` and the standalone script is less robust (it assumes a lowercase `date` column and uses an older fillna pattern).

## Important technical review — read before reusing

The upstream implementation is useful as an algorithm/reference prototype, but its displayed model comparison must not be treated as a valid benchmark without correction:

1. **Data leakage in LSTM/TFT metrics:** the code trains LSTM and TFT using the full series, then compares their forecasts against the last-30-point test segment. Those metrics are not a valid out-of-sample hold-out evaluation.
2. **Unequal evaluation procedure:** ARIMA and Prophet are retrained on `df[:-30]`, but LSTM/TFT are not retrained and evaluated on the same isolated training window.
3. **ARIMA errors are hidden:** on failure, `train_arima` returns a flat last-value forecast. This can make a failed model look like a functioning baseline unless failure status is surfaced separately.
4. **LSTM uncertainty is approximate:** 50 stochastic dropout passes produce empirical 5th/95th percentiles, not a calibrated or guaranteed 90% prediction interval.
5. **TFT uncertainty and horizon handling need verification:** the code extracts selected quantiles from a single prediction output and pads short outputs by repeating the edge. This must not be represented as a validated 30-step forecast without checking the model output and date alignment.
6. **Input scope is narrow:** the dashboard standardizes a date/value (close-price) series. It does not implement CHART's full OHLCV candle contract, multi-source reconciliation, per-symbol/provider configuration, or multi-timeframe semantics.
7. **Dependency reproducibility:** `requirements.txt` does not pin package versions. It is not a reproducible deployment lockfile.
8. **Forecast calendar:** the dashboard creates daily future dates. That is not equivalent to trading-session/candle indexing and must not be copied as CHART's candle-calendar logic.

## CHART integration constraints

- Treat this directory as a **reference snapshot only**. Do not import or deploy the Streamlit app as part of the CHART web or Android runtime.
- Preserve CHART's existing forecast contract, data-provider abstraction, OHLCV candle model, and architecture decisions.
- If these model families are adopted, implement a common, leakage-free walk-forward/hold-out evaluation protocol so every model is evaluated on identical timestamps and training cutoffs.
- A model failure or insufficient-data condition must be explicit in the result (status/reason); never silently replace a failed forecast with a plausible-looking line.
- Distinguish point forecasts, prediction intervals, and confidence/calibration evidence in the output.
- Any Python service or JS/Kotlin port is a separate engineering decision. This source folder alone does not provide a deployable API or a mobile/browser implementation.

## Provenance

The three upstream files above are preserved as source material under the upstream MIT license. Keep this attribution and license if the files are copied, modified, or redistributed.
