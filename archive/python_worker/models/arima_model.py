"""Genuine statsmodels ARIMA(p,d,q) with ADF check, AIC grid search, and analytical confidence intervals."""

from __future__ import annotations

import math
import warnings
from typing import Any, Dict, Sequence

from .common import CANONICAL_HORIZON, build_future_timestamps, build_points_from_quantiles

MODEL_ID = "py_arima_statsmodels"
MODEL_NAME = "statsmodels ARIMA(p,d,q)"


def predict_arima(candles: Sequence[Dict[str, float]], timeframe: str, horizon: int) -> Dict[str, Any]:
    if len(candles) < 28:
        return {
            "modelId": MODEL_ID,
            "modelName": MODEL_NAME,
            "family": "ECONOMETRIC",
            "modelVersion": "1.0.0",
            "executionRuntime": "PYTHON_WORKER",
            "isApproximation": False,
            "isCalibratedInterval": True,
            "status": "SKIPPED_LOW_DATA",
            "reason": f"At least 28 bars required for statsmodels ARIMA (got {len(candles)}).",
            "points": [],
        }

    try:
        import numpy as np
        from statsmodels.tsa.arima.model import ARIMA
        from statsmodels.tsa.stattools import adfuller
    except Exception as exc:
        return {
            "modelId": MODEL_ID,
            "modelName": MODEL_NAME,
            "family": "ECONOMETRIC",
            "modelVersion": "1.0.0",
            "executionRuntime": "PYTHON_WORKER",
            "isApproximation": False,
            "isCalibratedInterval": True,
            "status": "FAILED",
            "reason": f"statsmodels/numpy unavailable: {exc}",
            "points": [],
        }

    try:
        closes = np.array([float(c["close"]) for c in candles], dtype=float)
        log_prices = np.log(np.maximum(1e-8, closes))
        log_rets = np.diff(log_prices)

        d_cands = [1]
        try:
            pval = float(adfuller(log_rets, maxlag=min(4, max(1, len(log_rets) // 8)))[1])
            if pval > 0.05:
                d_cands = [1, 2]
        except Exception:
            d_cands = [1, 2]

        best_fit = None
        best_aic = float("inf")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            for d_val in d_cands:
                for p in (0, 1, 2, 3):
                    for q in (0, 1, 2):
                        if p == 0 and q == 0:
                            continue
                        try:
                            fit = ARIMA(log_prices, order=(p, d_val, q)).fit()
                            if math.isfinite(fit.aic) and fit.aic < best_aic:
                                best_aic = float(fit.aic)
                                best_fit = fit
                        except Exception:
                            continue

        if best_fit is None:
            return {
                "modelId": MODEL_ID,
                "modelName": MODEL_NAME,
                "family": "ECONOMETRIC",
                "modelVersion": "1.0.0",
                "executionRuntime": "PYTHON_WORKER",
                "isApproximation": False,
                "isCalibratedInterval": True,
                "status": "FAILED",
                "reason": "ARIMA grid search could not converge on any (p,d,q) order.",
                "points": [],
            }

        roll_h = max(horizon, CANONICAL_HORIZON)
        fc = best_fit.get_forecast(steps=roll_h)
        mean_log = np.asarray(fc.predicted_mean, dtype=float)
        ci80 = np.asarray(fc.conf_int(alpha=0.20), dtype=float)
        ci50 = np.asarray(fc.conf_int(alpha=0.50), dtype=float)

        # Anchor first forecast step smoothly relative to observed last close
        last_log = float(log_prices[-1])
        q10 = np.exp(ci80[:horizon, 0]).tolist()
        q25 = np.exp(ci50[:horizon, 0]).tolist()
        q50 = np.exp(np.clip(mean_log[:horizon], last_log - 0.5, last_log + 0.5)).tolist()
        q75 = np.exp(ci50[:horizon, 1]).tolist()
        q90 = np.exp(ci80[:horizon, 1]).tolist()

        last_ms = int(candles[-1]["open_time_utc_ms"])
        ts = build_future_timestamps(last_ms, timeframe, horizon)
        pts = build_points_from_quantiles(float(closes[-1]), ts, q10, q25, q50, q75, q90, horizon)
        return {
            "modelId": MODEL_ID,
            "modelName": MODEL_NAME,
            "family": "ECONOMETRIC",
            "modelVersion": "1.0.0",
            "executionRuntime": "PYTHON_WORKER",
            "isApproximation": False,
            "isCalibratedInterval": True,
            "status": "SUCCESS",
            "reason": "",
            "trainingStartUtcMs": int(candles[0]["open_time_utc_ms"]),
            "trainingEndUtcMs": last_ms,
            "trainingSampleCount": len(candles),
            "points": pts,
        }
    except Exception as exc:
        return {
            "modelId": MODEL_ID,
            "modelName": MODEL_NAME,
            "family": "ECONOMETRIC",
            "modelVersion": "1.0.0",
            "executionRuntime": "PYTHON_WORKER",
            "isApproximation": False,
            "isCalibratedInterval": True,
            "status": "FAILED",
            "reason": f"ARIMA execution failed: {exc}",
            "points": [],
        }
