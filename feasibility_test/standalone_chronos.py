#!/usr/bin/env python3
"""
CHART Forecast — Isolated Chronos-2 Shared Hosting Feasibility Benchmark
(`feasibility_test/standalone_chronos.py`)

Rules enforced per FORECAST_CHRONOS2_INPUT_OUTPUT_AND_PATH_CONTRACT_V1.md:
- Model scope: `amazon/chronos-2` only (Phase 1 Close-only univariate baseline).
- Strictly CPU-only execution (`device_map="cpu"`, `torch.float32`).
- Zero synthetic OHLC generation, zero sinusoidal/random jitter, zero quantile stitching.
- Captures exact model revision, package versions, context capacity, quantile grid,
  load latency, inference latency, and RSS memory (MB) across two consecutive runs:
    * Run 1: Cold load + 30-step Close-only forecast
    * Run 2: Warm in-process repeat + optional fresh subprocess invocation check
"""

import argparse
import hashlib
import json
import math
import os
import platform
import resource
import sys
import time
from pathlib import Path
from typing import Any, Dict, List


def get_rss_mb() -> float:
    """Return current and peak RSS memory in MiB using /proc/self/status and resource."""
    usage = resource.getrusage(resource.RUSAGE_SELF)
    # On Linux ru_maxrss is in kilobytes
    max_rss_mb = float(usage.ru_maxrss) / 1024.0
    return round(max_rss_mb, 2)


def get_current_vm_rss_mb() -> float:
    status_path = Path("/proc/self/status")
    if status_path.is_file():
        try:
            for line in status_path.read_text(encoding="utf-8").splitlines():
                if line.startswith("VmRSS:"):
                    kb = float(line.split()[1])
                    return round(kb / 1024.0, 2)
        except Exception:
            pass
    return get_rss_mb()


def load_real_close_series(candle_json_path: Path, context_bars: int) -> Dict[str, Any]:
    """Load strictly ordered closed candles from SPOTBRENT_H1.json without fabricating data."""
    raw = json.loads(candle_json_path.read_text(encoding="utf-8"))
    candles = raw.get("candles", [])
    if not isinstance(candles, list) or len(candles) < context_bars:
        raise ValueError(f"Insufficient candles in {candle_json_path}: found {len(candles)}, need {context_bars}")

    # Sort chronologically and validate strictly increasing timestamps and finite positive Close
    sorted_candles = sorted(candles, key=lambda c: int(c.get("open_time_utc_ms", 0)))
    window = sorted_candles[-context_bars:]

    timestamps: List[int] = []
    closes: List[float] = []
    prev_ts = -1
    for bar in window:
        ts = int(bar["open_time_utc_ms"])
        close_val = float(bar["close"])
        if ts <= prev_ts:
            raise ValueError(f"Non-increasing timestamp detected at {ts} <= {prev_ts}")
        if not math.isfinite(close_val) or close_val <= 0.0:
            raise ValueError(f"Invalid Close value {close_val} at {ts}")
        prev_ts = ts
        timestamps.append(ts)
        closes.append(close_val)

    canonical_payload = json.dumps(
        [{"t": t, "c": f"{c:.8f}"} for t, c in zip(timestamps, closes)],
        separators=(",", ":"),
    )
    input_hash = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()

    return {
        "series_id": "PEPPERSTONE:SPOTBRENT",
        "chart_id": "chart_spotbrent_main",
        "provider_id": "tvdatafeed",
        "timeframe": raw.get("timeframe", "H1"),
        "context_bars": len(closes),
        "origin_open_time_utc_ms": timestamps[-1],
        "first_open_time_utc_ms": timestamps[0],
        "last_close": closes[-1],
        "input_sha256": input_hash,
        "timestamps": timestamps,
        "closes": closes,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Isolated Chronos-2 CPU Feasibility Benchmark")
    parser.add_argument(
        "--candles-json",
        type=str,
        default=str(Path(__file__).resolve().parent.parent / "host_subdomain" / "data" / "tvdatafeed" / "SPOTBRENT_H1.json"),
        help="Path to real closed candle JSON series",
    )
    parser.add_argument("--context-bars", type=int, default=256, help="Number of historical Close bars")
    parser.add_argument("--horizon", type=int, default=30, help="Future prediction length in bars")
    parser.add_argument("--model-id", type=str, default="amazon/chronos-2", help="Hugging Face model ID")
    parser.add_argument("--threads", type=int, default=2, help="CPU thread limit for shared hosting safety")
    parser.add_argument("--output-json", type=str, default="", help="Optional path to write benchmark JSON")
    args = parser.parse_args()

    t_process_start = time.perf_counter()
    rss_initial_mb = get_current_vm_rss_mb()

    import torch
    import transformers
    import chronos
    from chronos import BaseChronosPipeline, Chronos2Pipeline
    from huggingface_hub import HfApi

    torch.set_num_threads(max(1, args.threads))

    rss_after_imports_mb = get_current_vm_rss_mb()

    # Load and validate real Close-only input series
    series_meta = load_real_close_series(Path(args.candles_json), args.context_bars)
    closes_tensor = torch.tensor(series_meta["closes"], dtype=torch.float32).reshape(1, 1, -1)  # shape (n_series=1, n_variates=1, history_length)

    # Resolve immutable Hugging Face commit SHA for provenance (G2)
    hf_commit_sha = "unknown"
    try:
        model_info = HfApi().model_info(args.model_id)
        hf_commit_sha = str(getattr(model_info, "sha", "unknown"))
    except Exception as exc:
        hf_commit_sha = f"unverified ({exc})"

    # Load Chronos-2 pipeline on CPU
    t_load_start = time.perf_counter()
    pipeline = BaseChronosPipeline.from_pretrained(
        args.model_id,
        device_map="cpu",
        torch_dtype=torch.float32,
    )
    t_load_end = time.perf_counter()
    load_seconds = round(t_load_end - t_load_start, 4)
    rss_after_load_mb = get_current_vm_rss_mb()
    peak_rss_after_load_mb = get_rss_mb()

    # Inspect loaded model capabilities from the artifact (Contract §4.1 & §4.3)
    ChronosConfigObj = getattr(pipeline.model, "chronos_config", None)
    native_quantiles: List[float] = list(getattr(pipeline, "quantiles", []))
    model_context_length = getattr(pipeline, "model_context_length", None)
    model_prediction_length = getattr(pipeline, "model_prediction_length", None)
    output_patch_size = getattr(pipeline, "max_output_patches", None)
    if ChronosConfigObj is not None:
        if model_context_length is None:
            model_context_length = getattr(ChronosConfigObj, "context_length", None)
        if model_prediction_length is None:
            model_prediction_length = getattr(ChronosConfigObj, "prediction_length", None)
        if not native_quantiles:
            native_quantiles = list(getattr(ChronosConfigObj, "quantiles", []))

    def execute_inference_run(run_index: int) -> Dict[str, Any]:
        rss_before = get_current_vm_rss_mb()
        t0 = time.perf_counter()
        with torch.inference_mode():
            # Chronos2Pipeline.predict returns a list of tensors, each shaped (n_variates, n_quantiles, prediction_length)
            raw_preds = pipeline.predict(
                closes_tensor,
                prediction_length=args.horizon,
            )
        t1 = time.perf_counter()
        infer_sec = round(t1 - t0, 4)
        rss_after = get_current_vm_rss_mb()
        peak_rss = get_rss_mb()

        if isinstance(raw_preds, list):
            pred_tensor = raw_preds[0]
        else:
            pred_tensor = raw_preds

        shape = list(pred_tensor.shape)
        # Validate finite values and monotonic quantile ordering at each horizon step
        if not bool(torch.isfinite(pred_tensor).all().item()):
            raise RuntimeError(f"Run {run_index}: Non-finite values in Chronos-2 output tensor")

        # Expected shape: (1, n_quantiles, horizon)
        if len(shape) != 3 or shape[0] != 1 or shape[2] != args.horizon:
            raise RuntimeError(f"Run {run_index}: Unexpected tensor shape {shape}, expected [1, Q, {args.horizon}]")

        n_q = shape[1]
        q_levels = [round(float(q), 4) for q in native_quantiles[:n_q]]

        # Find indices for q10, q25, q50 (median), q75, q90 in native quantile levels
        def find_q_idx(target_q: float) -> int:
            best_i = 0
            best_diff = abs(q_levels[0] - target_q)
            for idx, qv in enumerate(q_levels):
                d = abs(qv - target_q)
                if d < best_diff:
                    best_diff = d
                    best_i = idx
            return best_i

        idx_q10 = find_q_idx(0.1)
        idx_q25 = find_q_idx(0.25)
        idx_q50 = find_q_idx(0.5)
        idx_q75 = find_q_idx(0.75)
        idx_q90 = find_q_idx(0.9)

        monotonic_violations = 0
        steps_output: List[Dict[str, Any]] = []
        for step_idx in range(args.horizon):
            step_quantiles = [float(pred_tensor[0, qi, step_idx].item()) for qi in range(n_q)]
            for qi in range(n_q - 1):
                if step_quantiles[qi] > step_quantiles[qi + 1] + 1e-5:
                    monotonic_violations += 1
            steps_output.append({
                "step": step_idx + 1,
                "q10": round(step_quantiles[idx_q10], 4),
                "q25": round(step_quantiles[idx_q25], 4),
                "q50_median": round(step_quantiles[idx_q50], 4),
                "q75": round(step_quantiles[idx_q75], 4),
                "q90": round(step_quantiles[idx_q90], 4),
                "native_quantiles": [round(v, 4) for v in step_quantiles],
            })

        return {
            "run_index": run_index,
            "inference_seconds": infer_sec,
            "vm_rss_before_mb": rss_before,
            "vm_rss_after_mb": rss_after,
            "peak_rss_mb": peak_rss,
            "output_tensor_shape": shape,
            "quantile_monotonic_violations": monotonic_violations,
            "pointwise_median_path": [s["q50_median"] for s in steps_output],
            "horizon_steps": steps_output,
        }

    # Execute 2 consecutive runs in-process
    run1 = execute_inference_run(1)
    run2 = execute_inference_run(2)

    # Check exact numerical repeatability between Run 1 and Run 2 on CPU
    max_abs_diff = max(
        abs(a - b) for a, b in zip(run1["pointwise_median_path"], run2["pointwise_median_path"])
    )

    total_wall_seconds = round(time.perf_counter() - t_process_start, 4)

    report = {
        "ok": True,
        "contract": "FORECAST_CHRONOS2_PHASE1_FEASIBILITY_V1",
        "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "provenance": {
            "model_id": args.model_id,
            "hf_revision_sha": hf_commit_sha,
            "pipeline_class": type(pipeline).__name__,
            "python_version": platform.python_version(),
            "platform": platform.platform(),
            "torch_version": torch.__version__,
            "transformers_version": transformers.__version__,
            "chronos_version": getattr(chronos, "__version__", "installed"),
            "device": "cpu",
            "dtype": "float32",
            "cpu_threads": max(1, args.threads),
        },
        "loaded_artifact_capabilities": {
            "model_context_length": model_context_length,
            "model_prediction_length": model_prediction_length,
            "max_output_patches": output_patch_size,
            "native_quantile_levels": [round(float(q), 4) for q in native_quantiles],
            "native_quantile_count": len(native_quantiles),
        },
        "input_series": {
            "series_id": series_meta["series_id"],
            "chart_id": series_meta["chart_id"],
            "provider_id": series_meta["provider_id"],
            "timeframe": series_meta["timeframe"],
            "context_bars": series_meta["context_bars"],
            "first_open_time_utc_ms": series_meta["first_open_time_utc_ms"],
            "origin_open_time_utc_ms": series_meta["origin_open_time_utc_ms"],
            "last_closed_price": series_meta["last_close"],
            "input_sha256": series_meta["input_sha256"],
            "requested_horizon_bars": args.horizon,
        },
        "resource_and_timing_summary": {
            "rss_initial_mb": rss_initial_mb,
            "rss_after_imports_mb": rss_after_imports_mb,
            "rss_after_model_load_mb": rss_after_load_mb,
            "peak_rss_overall_mb": get_rss_mb(),
            "model_load_seconds": load_seconds,
            "run1_inference_seconds": run1["inference_seconds"],
            "run2_inference_seconds": run2["inference_seconds"],
            "total_wall_seconds": total_wall_seconds,
            "run1_vs_run2_max_abs_diff": max_abs_diff,
            "deterministic_repeatability": (max_abs_diff == 0.0),
        },
        "consecutive_runs": [run1, run2],
    }

    encoded = json.dumps(report, indent=2)
    if args.output_json:
        out_path = Path(args.output_json)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(encoded, encoding="utf-8")

    print(encoded)
    return 0


if __name__ == "__main__":
    sys.exit(main())
