"""Contract & guardrail tests for python_worker (runnable via unittest or pytest)."""

from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from python_worker.app import check_dependency_health, infer_payload
from python_worker.models.common import (
    build_points_from_quantiles,
    naive_persistence_predict,
)
from python_worker.models.tft_model import TFT_QUANTILES, predict_tft, resolve_quantile_indices
from python_worker.walk_forward import evaluate_models_walk_forward


def make_synthetic_candles(count: int = 120, start_price: float = 98.5) -> List[Dict[str, float]]:
    base_ms = 1_730_000_000_000
    step_ms = 15 * 60_000
    price = start_price
    out: List[Dict[str, float]] = []
    for i in range(count):
        wave = 0.0022 * math.sin(i * 0.27) + 0.0005 * math.cos(i * 0.11)
        nxt = max(1.0, price * math.exp(wave))
        hi = max(price, nxt) * 1.0018
        lo = min(price, nxt) * 0.9982
        out.append(
            {
                "open_time_utc_ms": base_ms + i * step_ms,
                "open": round(price, 6),
                "high": round(hi, 6),
                "low": round(lo, 6),
                "close": round(nxt, 6),
                "volume": 500.0 + (i % 15) * 25.0,
            }
        )
        price = nxt
    return out


class PythonWorkerContractTest(unittest.TestCase):
    def test_tft_enforces_strict_90_bar_gate_without_flat_fallback(self) -> None:
        short_candles = make_synthetic_candles(65)
        res = predict_tft(short_candles, "M15", 20)
        self.assertEqual(res["modelId"], "py_tft_torch")
        self.assertEqual(res["status"], "SKIPPED_LOW_DATA")
        self.assertEqual(res["points"], [])
        self.assertIn("90", res["reason"])

    def test_tft_quantile_index_lookup_never_hardcodes_median(self) -> None:
        idx_map = resolve_quantile_indices([0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98])
        self.assertEqual(idx_map[0.5], 3)
        self.assertEqual(idx_map[0.1], 1)
        self.assertEqual(idx_map[0.9], 5)
        self.assertEqual(len(TFT_QUANTILES), 5)

    def test_monotonic_quantiles_enforced_strictly(self) -> None:
        pts = build_points_from_quantiles(
            last_close=100.0,
            timestamps=[1_000_000, 2_000_000],
            q10_arr=[102.0, 95.0],
            q25_arr=[100.0, 96.0],
            q50_arr=[99.0, 98.0],
            q75_arr=[98.0, 97.0],
            q90_arr=[97.0, 101.0],
            horizon=2,
        )
        for pt in pts:
            self.assertLessEqual(pt["q10"], pt["q25"])
            self.assertLessEqual(pt["q25"], pt["q50"])
            self.assertLessEqual(pt["q50"], pt["q75"])
            self.assertLessEqual(pt["q75"], pt["q90"])

    def test_walk_forward_anti_leakage_and_explicit_status_without_masking(self) -> None:
        candles = make_synthetic_candles(110)

        def failing_plugin(_slice, _tf, _h):
            return {
                "modelId": "py_mock_fail",
                "modelName": "Mock Fail",
                "family": "TEST",
                "executionRuntime": "PYTHON_WORKER",
                "isApproximation": False,
                "isCalibratedInterval": True,
                "status": "FAILED",
                "reason": "Simulated dependency error",
                "points": [],
            }

        seen_cutoff_ends: List[int] = []

        def causal_plugin(train_slice, tf, h):
            seen_cutoff_ends.append(int(train_slice[-1]["open_time_utc_ms"]))
            res = naive_persistence_predict(train_slice, tf, h)
            res["modelId"] = "py_causal_probe"
            return res

        specs = [
            {"modelId": "py_mock_fail", "modelName": "Mock Fail", "family": "TEST", "fn": failing_plugin},
            {"modelId": "py_causal_probe", "modelName": "Causal Probe", "family": "TEST", "fn": causal_plugin},
        ]
        trajs = [failing_plugin(candles, "M15", 10), causal_plugin(candles, "M15", 10)]
        seen_cutoff_ends.clear()

        benchmarks = evaluate_models_walk_forward(candles, "M15", specs, trajs, eval_horizon=5, max_windows=6)
        by_id = {b["modelId"]: b for b in benchmarks}
        self.assertEqual(by_id["py_mock_fail"]["status"], "FAILED")
        self.assertEqual(by_id["py_mock_fail"]["windows"], 0)
        self.assertIn("Simulated", by_id["py_mock_fail"]["reason"])
        self.assertEqual(by_id["py_causal_probe"]["status"], "SUCCESS")
        self.assertGreaterEqual(by_id["py_causal_probe"]["windows"], 5)
        # Strict causal invariant: every origin cutoff ends strictly before target window
        self.assertEqual(seen_cutoff_ends, sorted(seen_cutoff_ends))
        self.assertLess(seen_cutoff_ends[-1], int(candles[-5]["open_time_utc_ms"]))

    def test_infer_payload_handles_low_data_and_missing_deps_gracefully(self) -> None:
        too_short = infer_payload({"symbolCode": "SPOTBRENT", "timeframe": "M15", "horizonBars": 20, "candles": make_synthetic_candles(12)})
        self.assertEqual(too_short["status"], "DATA_NOT_READY")

        valid_req = infer_payload({"symbolCode": "SPOTBRENT", "timeframe": "M15", "horizonBars": 20, "candles": make_synthetic_candles(80)})
        self.assertEqual(valid_req["status"], "OK")
        ids = {t["modelId"]: t for t in valid_req["modelTrajectories"]}
        self.assertIn("py_arima_statsmodels", ids)
        self.assertIn("py_prophet", ids)
        self.assertIn("py_lstm_torch", ids)
        self.assertIn("py_tft_torch", ids)
        # TFT with 80 bars must explicitly report SKIPPED_LOW_DATA
        self.assertEqual(ids["py_tft_torch"]["status"], "SKIPPED_LOW_DATA")

        deps = check_dependency_health()
        self.assertIsInstance(deps, dict)
        self.assertIn("statsmodels", deps)


if __name__ == "__main__":
    unittest.main()
