# Upstream Source Review

Reviewed repository: https://github.com/SWARNIM-TIWARI/time-series-forecasting-dashboard  
Branch: `main`  
Reviewed files: `app.py`, `requirements.txt`, `LICENSE`

## What is reusable as a reference

- ARIMA model setup and forecast call using statsmodels.
- Prophet time-series mapping (`date/value` to `ds/y`) and future prediction flow.
- LSTM sequence dataset, recurrent model structure, recursive multi-step inference, and dropout sampling pattern.
- TFT construction through PyTorch Forecasting, quantile-loss configuration, and adaptive minimum-data checks.
- RMSE and MAPE formula examples.
- Plotly approach for overlaying historical data, model forecasts, and interval bands.

## What must not be copied as-is into CHART

- The Streamlit UI, CSV upload/selection workflow, and stock-specific data handling.
- The current LSTM/TFT evaluation path: it leaks the held-out tail into training.
- Silent ARIMA fallback forecasts.
- The daily-date generation and fixed 30-step assumptions without mapping them to CHART candle intervals.
- The current TFT prediction extraction/padding without shape, quantile, and horizon validation.
- Unpinned Python dependencies as a production dependency specification.

## Required corrections before any algorithm is considered production-worthy

1. Define one explicit forecast origin and one identical hold-out/walk-forward split for all models.
2. Fit all scalers and preprocessing only on each training window.
3. Train each model only on the training segment; evaluate against untouched future candles.
4. Report per-model status, training window, forecast horizon, metrics, and failure reason.
5. Compare against at least a naive/last-value baseline; reject or flag models that do not beat the baseline under the selected metric.
6. Test interval coverage and width on repeated historical forecast origins; do not call dropout quantiles calibrated until measured.
7. Map outputs to CHART's canonical candle timestamps and preserve the OHLCV/provider/timeframe context.
8. Record deterministic seeds, package versions, model configuration, and data provenance for reproducibility.

This review is an engineering assessment of the checked-in upstream implementation, not a claim that the upstream author intended it for production use.
