"""Genuine Prophet forecasting with exact UTC timestamps and dynamic timeframe frequency."""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, Sequence

from .common import (
    CANONICAL_HORIZON,
    build_future_timestamps,
    build_points_from_quantiles,
    pandas_freq,
)

MODEL_ID = "py_prophet"
MODEL_NAME = "Meta Prophet"


def predict_prophet(candles: Sequence[Dict[str, float]], timeframe: str, horizon: int) -> Dict[str, Any]:
    if len(candles) < 30:
        return {
            "modelId": MODEL_ID,
            "modelName": MODEL_NAME,
            "family": "DECOMPOSITION",
            "modelVersion": "1.0.0",
            "executionRuntime": "PYTHON_WORKER",
            "isApproximation": False,
            "isCalibratedInterval": True,
            "status": "SKIPPED_LOW_DATA",
            "reason": f"At least 30 bars required for Prophet (got {len(candles)}).",
            "points": [],
        }

    try:
        import numpy as np
        import pandas as pd
        from prophet import Prophet
    except Exception as exc:
        return {
            "modelId": MODEL_ID,
            "modelName": MODEL_NAME,
            "family": "DECOMPOSITION",
            "modelVersion": "1.0.0",
            "executionRuntime": "PYTHON_WORKER",
            "isApproximation": False,
            "isCalibratedInterval": True,
            "status": "FAILED",
            "reason": f"prophet/pandas unavailable: {exc}",
            "points": [],
        }

    try:
        logging.getLogger("cmdstanpy").setLevel(logging.WARNING)
        logging.getLogger("prophet").setLevel(logging.WARNING)

        tf_norm = str(timeframe or "M15").strip().upper()
        freq = pandas_freq(tf_norm)
        last_ms = int(candles[-1]["open_time_utc_ms"])
        ds_series = pd.to_datetime([int(c["open_time_utc_ms"]) for c in candles], unit="ms", utc=True).tz_localize(None)
        closes = np.array([float(c["close"]) for c in candles], dtype=float)
        df = pd.DataFrame({"ds": ds_series, "y": np.log(np.maximum(1e-8, closes))})

        daily_flag = tf_norm in ("M1", "M5", "M15", "M30", "H1", "H4")
        model = Prophet(
            interval_width=0.80,
            daily_seasonality=daily_flag,
            weekly_seasonality=len(candles) >= 60,
            yearly_seasonality=False,
            changepoint_prior_scale=0.05,
        )
        model.fit(df)

        roll_h = max(horizon, CANONICAL_HORIZON)
        future = model.make_future_dataframe(periods=roll_h, freq=freq, include_history=False)
        fc = model.predict(future)
        last_log = float(df["y"].iloc[-1])
        first_pred_log = float(fc["yhat"].iloc[0])
        # Anchor seamless continuity from last observed close
        anchor_shift = last_log - first_pred_log

        q10, q25, q50, q75, q90 = [], [], [], [], []
        ratio_50 = 0.67449 / 1.28155
        for i in range(horizon):
            row = fc.iloc[i]
            ym = float(row["yhat"]) + anchor_shift * math.exp(-0.04 * i)
            lo80 = float(row["yhat_lower"]) + anchor_shift * math.exp(-0.04 * i)
            hi80 = float(row["yhat_upper"]) + anchor_shift * math.exp(-0.04 * i)
            half_lo = max(1e-5, ym - lo80)
            half_hi = max(1e-5, hi80 - ym)
            q10.append(math.exp(ym - half_lo))
            q25.append(math.exp(ym - half_lo * ratio_50))
            q50.append(math.exp(ym))
            q75.append(math.exp(ym + half_hi * ratio_50))
            q90.append(math.exp(ym + half_hi))

        ts = build_future_timestamps(last_ms, tf_norm, horizon)
        pts = build_points_from_quantiles(float(closes[-1]), ts, q10, q25, q50, q75, q90, horizon)
        return {
            "modelId": MODEL_ID,
            "modelName": MODEL_NAME,
            "family": "DECOMPOSITION",
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
            "family": "DECOMPOSITION",
            "modelVersion": "1.0.0",
            "executionRuntime": "PYTHON_WORKER",
            "isApproximation": False,
            "isCalibratedInterval": True,
            "status": "FAILED",
            "reason": f"Prophet execution failed: {exc}",
            "points": [],
        }
