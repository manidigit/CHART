#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CHART System — Production Chronos-2 Forecast Worker
===================================================
Executes real zero-shot univariate Close forecasting using the official
`amazon/chronos-2` model pinned at revision `29ec3766d36d6f73f0696f85560a422f50e8498c`.

Normative Guarantees:
  1. Model & Revision: `amazon/chronos-2` @ `29ec3766d36d6f73f0696f85560a422f50e8498c`
  2. Input: Strictly closed candles (`Close` series only, chronological, finite > 0)
  3. Output: Full 21 native quantile levels (0.01 .. 0.99) per horizon step
  4. Central Path: Pointwise median `Q50` (`q50_median`)
  5. Uncertainty Band: `Q25` to `Q75` (`q25`, `q75`) + `Q10`/`Q90`
  6. Zero synthetic OHLC generation, zero decorative noise, zero trading signals.
"""

import argparse
import csv
import datetime
import hashlib
import json
import math
import os
import platform
import resource
import sys
import time
from typing import Any, Dict, List, Tuple

PINNED_MODEL_ID = "amazon/chronos-2"
PINNED_REVISION_SHA = "29ec3766d36d6f73f0696f85560a422f50e8498c"

TIMEFRAME_STEP_MS = {
    "M15": 15 * 60 * 1000,
    "M30": 30 * 60 * 1000,
    "H1": 60 * 60 * 1000,
    "H4": 4 * 60 * 60 * 1000,
    "D1": 24 * 60 * 60 * 1000,
    "W1": 7 * 24 * 60 * 60 * 1000,
}


def get_peak_rss_mb() -> float:
    usage = resource.getrusage(resource.RUSAGE_SELF)
    rss_kb = usage.ru_maxrss
    if platform.system() == "Darwin":
        return round(rss_kb / (1024.0 * 1024.0), 2)
    return round(rss_kb / 1024.0, 2)


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def load_closed_candles(
    input_path: str,
    timeframe: str,
    context_bars: int,
    now_utc_ms: int,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], str]:
    """
    Loads and validates strictly closed historical candles from JSON or CSV.
    """
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    file_hash = sha256_file(input_path)
    step_ms = TIMEFRAME_STEP_MS.get(timeframe.upper(), 3600000)
    raw_rows: List[Dict[str, Any]] = []

    if input_path.lower().endswith(".json"):
        with open(input_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        candles_list = payload.get("candles", payload) if isinstance(payload, dict) else payload
        if not isinstance(candles_list, list):
            raise ValueError("Invalid JSON candle format: expected list of candles.")

        for idx, item in enumerate(candles_list):
            if not isinstance(item, dict):
                continue
            open_ms = int(item.get("open_time_utc_ms") or 0)
            if open_ms <= 0 and item.get("open_time_utc_iso"):
                dt = datetime.datetime.fromisoformat(
                    str(item["open_time_utc_iso"]).replace("Z", "+00:00")
                )
                open_ms = int(dt.timestamp() * 1000)
            if open_ms <= 0:
                continue

            # Reject any unclosed candle
            is_closed_flag = item.get("is_closed", 1)
            if is_closed_flag in (0, False, "0", "false"):
                continue
            if open_ms + step_ms > now_utc_ms:
                continue

            close_val = float(item.get("close", math.nan))
            if not math.isfinite(close_val) or close_val <= 0.0:
                raise ValueError(f"Invalid Close value at index {idx}: {close_val}")

            open_iso = item.get("open_time_utc_iso") or datetime.datetime.fromtimestamp(
                open_ms / 1000.0, tz=datetime.timezone.utc
            ).strftime("%Y-%m-%dT%H:%M:%SZ")

            raw_rows.append(
                {
                    "open_time_utc_ms": open_ms,
                    "open_time_utc_iso": open_iso,
                    "close": close_val,
                }
            )
    else:
        with open(input_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for idx, row in enumerate(reader):
                dt_str = (row.get("datetime") or row.get("open_time_utc_iso") or "").strip()
                open_ms_raw = row.get("open_time_utc_ms")
                if open_ms_raw:
                    open_ms = int(float(open_ms_raw))
                elif dt_str:
                    dt = datetime.datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S").replace(
                        tzinfo=datetime.timezone.utc
                    )
                    open_ms = int(dt.timestamp() * 1000)
                else:
                    continue

                if open_ms + step_ms > now_utc_ms:
                    continue

                close_val = float(row.get("close", math.nan))
                if not math.isfinite(close_val) or close_val <= 0.0:
                    raise ValueError(f"Invalid Close value at CSV row {idx}: {close_val}")

                open_iso = datetime.datetime.fromtimestamp(
                    open_ms / 1000.0, tz=datetime.timezone.utc
                ).strftime("%Y-%m-%dT%H:%M:%SZ")
                raw_rows.append(
                    {
                        "open_time_utc_ms": open_ms,
                        "open_time_utc_iso": open_iso,
                        "close": close_val,
                    }
                )

    # Deduplicate by open_time_utc_ms and enforce strict ascending order
    dedup_map: Dict[int, Dict[str, Any]] = {}
    for r in raw_rows:
        dedup_map[r["open_time_utc_ms"]] = r

    sorted_rows = [dedup_map[k] for k in sorted(dedup_map.keys())]
    if len(sorted_rows) < 32:
        raise ValueError(
            f"Insufficient closed candles for Chronos-2 inference: found {len(sorted_rows)}, minimum required is 32."
        )

    for i in range(1, len(sorted_rows)):
        if sorted_rows[i]["open_time_utc_ms"] <= sorted_rows[i - 1]["open_time_utc_ms"]:
            raise ValueError(f"Non-monotonic timestamp at index {i}")

    context_slice = sorted_rows[-context_bars:] if len(sorted_rows) > context_bars else sorted_rows
    return sorted_rows, context_slice, file_hash


def find_quantile_index(levels: List[float], target: float) -> int:
    best_idx = 0
    best_diff = abs(levels[0] - target)
    for idx, val in enumerate(levels):
        diff = abs(val - target)
        if diff < best_diff:
            best_diff = diff
            best_idx = idx
    if best_diff > 1e-4:
        raise ValueError(f"Required quantile {target} not found in native levels: {levels}")
    return best_idx


def main() -> int:
    parser = argparse.ArgumentParser(description="CHART Chronos-2 Production Worker")
    parser.add_argument("--input", required=True, help="Path to input closed candles JSON/CSV")
    parser.add_argument("--output", required=True, help="Path to output forecast JSON")
    parser.add_argument("--symbol", required=True, help="Symbol code, e.g. SPOTBRENT")
    parser.add_argument("--provider", default="tvdatafeed", help="Data provider ID")
    parser.add_argument("--timeframe", required=True, help="Timeframe code, e.g. M15, H1, H4, D1")
    parser.add_argument("--horizon", type=int, default=30, help="Prediction horizon in bars (default: 30)")
    parser.add_argument("--context-bars", type=int, default=256, help="Historical closed context bars")
    parser.add_argument("--cache-key", default="", help="Deterministic cache key")
    args = parser.parse_args()

    t_total_start = time.perf_counter()
    now_utc_ms = int(time.time() * 1000)
    horizon = max(1, min(120, int(args.horizon)))
    context_bars = max(32, min(2048, int(args.context_bars)))
    timeframe = args.timeframe.upper().strip()
    step_ms = TIMEFRAME_STEP_MS.get(timeframe, 3600000)

    try:
        import torch
        import transformers
        import chronos
        from chronos import BaseChronosPipeline

        torch.set_num_threads(min(4, max(1, os.cpu_count() or 2)))

        all_rows, context_rows, input_sha256 = load_closed_candles(
            args.input,
            timeframe=timeframe,
            context_bars=context_bars,
            now_utc_ms=now_utc_ms,
        )

        close_values = [r["close"] for r in context_rows]
        context_sha256 = hashlib.sha256(
            json.dumps(close_values, separators=(",", ":")).encode("utf-8")
        ).hexdigest()

        rss_before_load = get_peak_rss_mb()
        t_load_start = time.perf_counter()

        pipeline = BaseChronosPipeline.from_pretrained(
            PINNED_MODEL_ID,
            revision=PINNED_REVISION_SHA,
            device_map="cpu",
            torch_dtype=torch.float32,
        )
        t_load_sec = time.perf_counter() - t_load_start
        rss_after_load = get_peak_rss_mb()

        native_quantiles: List[float] = [float(q) for q in getattr(pipeline, "quantiles", [])]
        if not native_quantiles:
            raise RuntimeError("Chronos-2 pipeline did not expose native quantile levels.")

        idx_q10 = find_quantile_index(native_quantiles, 0.10)
        idx_q25 = find_quantile_index(native_quantiles, 0.25)
        idx_q50 = find_quantile_index(native_quantiles, 0.50)
        idx_q75 = find_quantile_index(native_quantiles, 0.75)
        idx_q90 = find_quantile_index(native_quantiles, 0.90)

        # Chronos2Pipeline expects 3D tensor: (n_series=1, n_variates=1, history_length)
        context_tensor = torch.tensor(close_values, dtype=torch.float32).unsqueeze(0).unsqueeze(0)

        t_infer_start = time.perf_counter()
        with torch.inference_mode():
            pred_list = pipeline.predict(
                context_tensor,
                prediction_length=horizon,
            )
        t_infer_sec = time.perf_counter() - t_infer_start
        rss_peak = get_peak_rss_mb()

        pred_tensor = pred_list[0]  # shape: (1, n_quantiles, horizon) or (n_quantiles, horizon)
        if pred_tensor.ndim == 3:
            q_matrix = pred_tensor[0].detach().cpu().tolist()
        elif pred_tensor.ndim == 2:
            q_matrix = pred_tensor.detach().cpu().tolist()
        else:
            raise RuntimeError(f"Unexpected prediction tensor shape: {list(pred_tensor.shape)}")

        origin_bar = context_rows[-1]
        origin_open_ms = int(origin_bar["open_time_utc_ms"])
        origin_close_price = float(origin_bar["close"])

        forecast_points: List[Dict[str, Any]] = []
        for h in range(horizon):
            step_num = h + 1
            target_open_ms = origin_open_ms + (step_num * step_ms)
            target_open_iso = datetime.datetime.fromtimestamp(
                target_open_ms / 1000.0, tz=datetime.timezone.utc
            ).strftime("%Y-%m-%dT%H:%M:%SZ")

            step_native_map: Dict[str, float] = {}
            for q_idx, q_lvl in enumerate(native_quantiles):
                q_key = f"{q_lvl:.2f}".rstrip("0").rstrip(".") if q_lvl not in (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9) else f"{q_lvl:.2f}"
                val = float(q_matrix[q_idx][h])
                if not math.isfinite(val):
                    raise ValueError(f"Non-finite forecast quantile value at step {step_num}, q={q_lvl}")
                step_native_map[q_key] = round(val, 6)

            q10_val = round(float(q_matrix[idx_q10][h]), 6)
            q25_val = round(float(q_matrix[idx_q25][h]), 6)
            q50_val = round(float(q_matrix[idx_q50][h]), 6)
            q75_val = round(float(q_matrix[idx_q75][h]), 6)
            q90_val = round(float(q_matrix[idx_q90][h]), 6)

            forecast_points.append(
                {
                    "step": step_num,
                    "target_open_time_utc_ms": target_open_ms,
                    "target_open_time_utc_iso": target_open_iso,
                    "q10": q10_val,
                    "q25": q25_val,
                    "q50_median": q50_val,
                    "q75": q75_val,
                    "q90": q90_val,
                    "native_quantiles": step_native_map,
                }
            )

        t_total_sec = time.perf_counter() - t_total_start

        result_payload = {
            "status": "READY",
            "schema": "chart_chronos2_forecast_v1",
            "generated_at_utc": datetime.datetime.now(datetime.timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            ),
            "cache_key": args.cache_key,
            "series": {
                "symbol": args.symbol.upper().strip(),
                "provider": args.provider.lower().strip(),
                "timeframe": timeframe,
                "step_ms": step_ms,
                "total_closed_bars_available": len(all_rows),
                "context_bars_used": len(context_rows),
                "context_first_open_time_utc_ms": context_rows[0]["open_time_utc_ms"],
                "context_first_open_time_utc_iso": context_rows[0]["open_time_utc_iso"],
                "origin_open_time_utc_ms": origin_open_ms,
                "origin_open_time_utc_iso": origin_bar["open_time_utc_iso"],
                "last_closed_price": origin_close_price,
                "input_file_sha256": input_sha256,
                "context_close_sha256": context_sha256,
            },
            "model": {
                "model_id": PINNED_MODEL_ID,
                "hf_revision_sha": PINNED_REVISION_SHA,
                "pipeline_class": type(pipeline).__name__,
                "device": "cpu",
                "torch_dtype": "float32",
                "target_semantics": "Close-only univariate closed-candle forecast (Zero synthetic OHLC)",
                "central_path_rule": "Q50 pointwise median (q50_median)",
                "uncertainty_band_rule": "Marginal quantile band Q25..Q75 (q25, q75)",
                "horizon_bars": horizon,
                "native_quantile_count": len(native_quantiles),
                "native_quantile_levels": native_quantiles,
            },
            "runtime": {
                "python_version": platform.python_version(),
                "torch_version": torch.__version__,
                "transformers_version": transformers.__version__,
                "chronos_version": getattr(chronos, "__version__", "unknown"),
                "cold_load_sec": round(t_load_sec, 4),
                "inference_sec": round(t_infer_sec, 4),
                "total_worker_sec": round(t_total_sec, 4),
                "rss_before_load_mb": rss_before_load,
                "rss_after_load_mb": rss_after_load,
                "rss_peak_mb": rss_peak,
            },
            "forecast": forecast_points,
        }

        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        tmp_out = f"{args.output}.tmp.{os.getpid()}"
        with open(tmp_out, "w", encoding="utf-8") as f:
            json.dump(result_payload, f, indent=2)
        os.replace(tmp_out, args.output)

        # Also write deterministic direct-lookup alias in the same directory
        out_dir = os.path.dirname(os.path.abspath(args.output))
        direct_alias = os.path.join(
            out_dir,
            f"{args.symbol.upper().strip()}_{args.provider.lower().strip()}_{timeframe}_{origin_open_ms}_H{horizon}.json",
        )
        if os.path.abspath(direct_alias) != os.path.abspath(args.output):
            tmp_alias = f"{direct_alias}.tmp.{os.getpid()}"
            with open(tmp_alias, "w", encoding="utf-8") as f:
                json.dump(result_payload, f, indent=2)
            os.replace(tmp_alias, direct_alias)
        return 0

    except Exception as exc:
        err_payload = {
            "status": "FAILED",
            "schema": "chart_chronos2_forecast_v1",
            "generated_at_utc": datetime.datetime.now(datetime.timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            ),
            "cache_key": args.cache_key,
            "error": str(exc),
            "error_type": type(exc).__name__,
        }
        try:
            os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(err_payload, f, indent=2)
        except Exception:
            pass
        sys.stderr.write(f"[Chronos2Worker Error] {type(exc).__name__}: {exc}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
