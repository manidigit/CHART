"""Chronological strictly expanding-window OOS Walk-Forward auditor for python_worker."""

from __future__ import annotations

import math
from typing import Any, Callable, Dict, List, Optional, Sequence

try:
    from .models.common import naive_persistence_predict
except ImportError:
    from models.common import naive_persistence_predict

ModelCallable = Callable[[Sequence[Dict[str, float]], str, int], Dict[str, Any]]


def _pinball(actual: float, pred: float, tau: float) -> float:
    err = actual - pred
    return max(tau * err, (tau - 1.0) * err)


def evaluate_models_walk_forward(
    candles: Sequence[Dict[str, float]],
    timeframe: str,
    model_specs: Sequence[Dict[str, Any]],
    trajectories: Sequence[Dict[str, Any]],
    eval_horizon: int = 5,
    max_windows: int = 6,
) -> List[Dict[str, Any]]:
    n = len(candles)
    min_train = max(32, min(60, int(n * 0.55)))
    origins: List[int] = []
    if n >= min_train + eval_horizon + 2:
        stride = max(1, (n - eval_horizon - min_train) // max_windows)
        o = min_train
        while o <= n - eval_horizon and len(origins) < max_windows:
            origins.append(o)
            o += stride

    traj_by_id = {t["modelId"]: t for t in trajectories}
    naive_mae_ref: Optional[float] = None
    benchmarks: List[Dict[str, Any]] = []

    all_specs = [{"modelId": "naive_persistence", "modelName": "Naive Random-Walk Baseline", "family": "BASELINE", "fn": naive_persistence_predict}] + list(model_specs)

    for sp in all_specs:
        m_id = sp["modelId"]
        fn: ModelCallable = sp["fn"]
        cur = traj_by_id.get(m_id, {})
        is_approx = bool(cur.get("isApproximation", False))
        is_cal = bool(cur.get("isCalibratedInterval", True))
        m_name = str(cur.get("modelName", sp.get("modelName", m_id)))
        family = str(cur.get("family", sp.get("family", "PYTHON_ML")))

        if not origins:
            benchmarks.append(
                {
                    "modelId": m_id,
                    "modelName": m_name,
                    "family": family,
                    "windows": 0,
                    "evaluatedWindows": 0,
                    "mae": 0.0,
                    "maePct": 0.0,
                    "rmse": 0.0,
                    "safeMapePct": None,
                    "safeMapeValidCount": 0,
                    "directionalAccuracyPct": 0.0,
                    "pinballLoss": 0.0,
                    "coverage80Pct": 0.0,
                    "avgIntervalWidthPct": None,
                    "crps": 0.0,
                    "executionRuntime": "PYTHON_WORKER",
                    "isApproximation": is_approx,
                    "isCalibratedInterval": is_cal,
                    "status": cur.get("status", "SKIPPED_LOW_DATA"),
                    "reason": cur.get("reason", "Insufficient history for walk-forward evaluation."),
                }
            )
            continue

        abs_sum = 0.0
        pct_sum = 0.0
        sq_sum = 0.0
        mape_sum = 0.0
        mape_cnt = 0
        width_sum = 0.0
        pin_sum = 0.0
        crps_sum = 0.0
        dir_ok = 0
        cov_ok = 0
        pt_cnt = 0
        win_ok = 0
        all_skipped = True
        last_reason = ""

        for origin in origins:
            train_slice = candles[:origin]
            try:
                res = fn(train_slice, timeframe, eval_horizon)
            except Exception as exc:
                all_skipped = False
                last_reason = str(exc)
                continue

            status = str(res.get("status", "FAILED"))
            pts = res.get("points") or []
            if status != "SUCCESS" or len(pts) < eval_horizon:
                last_reason = str(res.get("reason", status))
                if status == "FAILED":
                    all_skipped = False
                continue

            all_skipped = False
            win_ok += 1
            base_close = float(candles[origin - 1]["close"])
            for h in range(eval_horizon):
                actual = float(candles[origin + h]["close"])
                pt = pts[h]
                pred = float(pt["q50"])
                q10 = float(pt["q10"])
                q25 = float(pt["q25"])
                q75 = float(pt["q75"])
                q90 = float(pt["q90"])
                err = abs(actual - pred)
                abs_sum += err
                pct_sum += (err / max(1e-8, base_close)) * 100.0
                sq_sum += (actual - pred) ** 2
                if abs(actual) > 1e-8:
                    mape_sum += (err / abs(actual)) * 100.0
                    mape_cnt += 1
                width_sum += ((q90 - q10) / max(1e-8, base_close)) * 100.0
                pin = (
                    _pinball(actual, q10, 0.10)
                    + _pinball(actual, q25, 0.25)
                    + _pinball(actual, pred, 0.50)
                    + _pinball(actual, q75, 0.75)
                    + _pinball(actual, q90, 0.90)
                ) / 5.0
                pin_sum += pin
                crps_sum += 2.0 * pin
                if (pred - base_close) * (actual - base_close) > 0.0 or abs(pred - base_close) < 1e-9:
                    dir_ok += 1
                if q10 <= actual <= q90:
                    cov_ok += 1
                pt_cnt += 1

        if win_ok == 0 or pt_cnt == 0:
            st_flag = cur.get("status") if cur.get("status", "SUCCESS") != "SUCCESS" else ("SKIPPED_LOW_DATA" if all_skipped else "FAILED")
            row = {
                "modelId": m_id,
                "modelName": m_name,
                "family": family,
                "windows": 0,
                "evaluatedWindows": 0,
                "mae": 0.0,
                "maePct": 0.0,
                "rmse": 0.0,
                "safeMapePct": None,
                "safeMapeValidCount": 0,
                "directionalAccuracyPct": 0.0,
                "pinballLoss": 0.0,
                "coverage80Pct": 0.0,
                "avgIntervalWidthPct": None,
                "crps": 0.0,
                "executionRuntime": "PYTHON_WORKER",
                "isApproximation": is_approx,
                "isCalibratedInterval": is_cal,
                "status": st_flag,
                "reason": last_reason or cur.get("reason", ""),
            }
        else:
            mae_val = abs_sum / pt_cnt
            if m_id == "naive_persistence":
                naive_mae_ref = mae_val
            row = {
                "modelId": m_id,
                "modelName": m_name,
                "family": family,
                "windows": win_ok,
                "evaluatedWindows": win_ok,
                "mae": round(mae_val, 6),
                "maePct": round(pct_sum / pt_cnt, 4),
                "rmse": round(math.sqrt(sq_sum / pt_cnt), 6),
                "safeMapePct": round(mape_sum / mape_cnt, 4) if mape_cnt > 0 else None,
                "safeMapeValidCount": mape_cnt,
                "directionalAccuracyPct": round((dir_ok / pt_cnt) * 100.0, 2),
                "pinballLoss": round(pin_sum / pt_cnt, 6),
                "coverage80Pct": round((cov_ok / pt_cnt) * 100.0, 2),
                "avgIntervalWidthPct": round(width_sum / pt_cnt, 4),
                "crps": round(crps_sum / pt_cnt, 6),
                "executionRuntime": "PYTHON_WORKER",
                "isApproximation": is_approx,
                "isCalibratedInterval": is_cal,
                "status": "SUCCESS",
                "reason": "",
            }
        if m_id != "naive_persistence":
            benchmarks.append(row)

    # Also attach naive_mae_ref context if needed; JS/Kotlin/PHP compare against their own causal naive_persistence
    _ = naive_mae_ref
    return benchmarks
