"""Shared trajectory helpers, monotonic quantile enforcement, and Naive baseline for python_worker."""

from __future__ import annotations

import math
from typing import Any, Dict, List, Sequence, Tuple

CANONICAL_HORIZON = 60

TIMEFRAME_STEP_MS: Dict[str, int] = {
    "M1": 60_000,
    "M5": 5 * 60_000,
    "M15": 15 * 60_000,
    "M30": 30 * 60_000,
    "H1": 60 * 60_000,
    "H4": 4 * 60 * 60_000,
    "D1": 24 * 60 * 60_000,
    "W1": 7 * 24 * 60 * 60_000,
}

TIMEFRAME_PANDAS_FREQ: Dict[str, str] = {
    "M1": "1min",
    "M5": "5min",
    "M15": "15min",
    "M30": "30min",
    "H1": "1h",
    "H4": "4h",
    "D1": "1D",
    "W1": "1W",
}


def step_milliseconds(timeframe: str) -> int:
    return TIMEFRAME_STEP_MS.get(str(timeframe or "M15").strip().upper(), 15 * 60_000)


def pandas_freq(timeframe: str) -> str:
    return TIMEFRAME_PANDAS_FREQ.get(str(timeframe or "M15").strip().upper(), "15min")


def sanitize_candles(raw_candles: Sequence[Dict[str, Any]]) -> List[Dict[str, float]]:
    clean: List[Dict[str, float]] = []
    for c in raw_candles:
        try:
            o = float(c.get("open", 0.0))
            h = float(c.get("high", 0.0))
            l = float(c.get("low", 0.0))
            cl = float(c.get("close", 0.0))
            ms = int(c.get("open_time_utc_ms", c.get("openTimeUtcMs", 0)) or 0)
            vol = max(1.0, float(c.get("volume", 100.0) or 100.0))
        except (TypeError, ValueError):
            continue
        if o > 0.0 and cl > 0.0 and math.isfinite(cl) and math.isfinite(o):
            clean.append(
                {
                    "open_time_utc_ms": ms,
                    "open": o,
                    "high": max(h, o, cl),
                    "low": max(1e-8, min(l, o, cl) if l > 0 else min(o, cl)),
                    "close": cl,
                    "volume": vol,
                }
            )
    return clean


def build_future_timestamps(last_open_ms: int, timeframe: str, horizon: int) -> List[int]:
    step = step_milliseconds(timeframe)
    base = int(last_open_ms) if last_open_ms > 0 else 0
    return [base + (h + 1) * step for h in range(horizon)]


def enforce_monotonic(
    q10: float, q25: float, q50: float, q75: float, q90: float, floor_price: float
) -> Tuple[float, float, float, float, float]:
    f = max(1e-8, floor_price)
    v10 = max(f, float(q10))
    v25 = max(v10, float(q25))
    v50 = max(v25, float(q50))
    v75 = max(v50, float(q75))
    v90 = max(v75, float(q90))
    return v10, v25, v50, v75, v90


def build_points_from_quantiles(
    last_close: float,
    timestamps: Sequence[int],
    q10_arr: Sequence[float],
    q25_arr: Sequence[float],
    q50_arr: Sequence[float],
    q75_arr: Sequence[float],
    q90_arr: Sequence[float],
    horizon: int,
) -> List[Dict[str, Any]]:
    pts: List[Dict[str, Any]] = []
    prev_close = float(last_close)
    floor_p = max(1e-8, float(last_close) * 0.02)
    for i in range(horizon):
        v10, v25, v50, v75, v90 = enforce_monotonic(
            q10_arr[i], q25_arr[i], q50_arr[i], q75_arr[i], q90_arr[i], floor_p
        )
        open_p = prev_close
        close_p = v50
        wick = max(1e-6, (v75 - v25) * 0.28)
        high_p = max(open_p, close_p) + wick
        low_p = max(floor_p, min(open_p, close_p) - wick)
        prev_close = close_p
        pts.append(
            {
                "stepAhead": i + 1,
                "openTimeUtcMs": int(timestamps[i]) if i < len(timestamps) else 0,
                "open": open_p,
                "high": high_p,
                "low": low_p,
                "close": close_p,
                "q10": v10,
                "q25": v25,
                "q50": v50,
                "q75": v75,
                "q90": v90,
                "pctChangeFromLast": ((v50 - last_close) / last_close) * 100.0 if last_close > 0 else 0.0,
                "volume": 0.0,
                "rejectionWick": False,
                "wavePhase": "IMPULSE" if close_p >= open_p else "PULLBACK",
            }
        )
    return pts


def build_points_from_mean_sigma(
    last_close: float,
    timestamps: Sequence[int],
    mean_returns: Sequence[float],
    sigmas: Sequence[float],
    horizon: int,
) -> List[Dict[str, Any]]:
    cum_r = 0.0
    cum_var = 0.0
    q10, q25, q50, q75, q90 = [], [], [], [], []
    for i in range(horizon):
        r = max(-0.06, min(0.06, float(mean_returns[i])))
        s = max(1e-5, float(sigmas[i]))
        cum_r += r
        cum_var += s * s
        cs = math.sqrt(max(1e-9, cum_var))
        q10.append(last_close * math.exp(cum_r - 1.28155 * cs))
        q25.append(last_close * math.exp(cum_r - 0.67449 * cs))
        q50.append(last_close * math.exp(cum_r))
        q75.append(last_close * math.exp(cum_r + 0.67449 * cs))
        q90.append(last_close * math.exp(cum_r + 1.28155 * cs))
    return build_points_from_quantiles(last_close, timestamps, q10, q25, q50, q75, q90, horizon)


def naive_persistence_predict(
    candles: Sequence[Dict[str, float]], timeframe: str, horizon: int
) -> Dict[str, Any]:
    closes = [float(c["close"]) for c in candles]
    last_close = closes[-1]
    last_ms = int(candles[-1]["open_time_utc_ms"])
    rets = [math.log(closes[i] / max(1e-8, closes[i - 1])) for i in range(1, len(closes))]
    if len(rets) > 1:
        mean_r = sum(rets) / len(rets)
        sigma = max(1e-5, math.sqrt(sum((r - mean_r) ** 2 for r in rets) / (len(rets) - 1)))
    else:
        sigma = 0.004
    ts = build_future_timestamps(last_ms, timeframe, horizon)
    pts = build_points_from_mean_sigma(last_close, ts, [0.0] * horizon, [sigma] * horizon, horizon)
    return {
        "modelId": "naive_persistence",
        "modelName": "Naive Random-Walk Baseline",
        "family": "BASELINE",
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
