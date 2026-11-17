#!/usr/bin/env python3
"""Validate site-aligned inputs, run pinned Chronos-2, and validate its JSON."""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.metadata
import json
import math
import subprocess
import sys
from pathlib import Path
from typing import Any

MODEL_ID = "amazon/chronos-2"
MODEL_REVISION = "29ec3766d36d6f73f0696f85560a422f50e8498c"
ALLOWED_SYMBOLS = {"SPOTBRENT", "XAUUSD"}
ALLOWED_TIMEFRAMES = {"M15", "H1", "H4", "D1", "W1"}
ALLOWED_HORIZONS = {15, 30, 45, 60}
STEP_MS = {"M15": 900_000, "H1": 3_600_000, "H4": 14_400_000, "D1": 86_400_000, "W1": 604_800_000}


def fail(message: str) -> None:
    raise SystemExit(f"[chronos2] ERROR: {message}")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"Cannot read valid JSON from {path}: {exc}")
    if not isinstance(payload, dict):
        fail(f"{path} must contain a JSON object.")
    return payload


def closed_candles(payload: dict[str, Any], timeframe: str, label: str) -> list[dict[str, Any]]:
    rows = payload.get("candles")
    if not isinstance(rows, list):
        fail(f"{label}: expected a top-level candles array.")
    now_ms = int(dt.datetime.now(dt.timezone.utc).timestamp() * 1000)
    step = STEP_MS[timeframe]
    result: dict[int, dict[str, Any]] = {}
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            fail(f"{label}: candle #{index} is not an object.")
        try:
            open_ms = int(row.get("open_time_utc_ms") or 0)
            close = float(row.get("close"))
        except (TypeError, ValueError):
            fail(f"{label}: invalid timestamp/close at candle #{index}.")
        if open_ms <= 0 or not math.isfinite(close) or close <= 0:
            fail(f"{label}: invalid timestamp/close at candle #{index}.")
        if row.get("is_closed") in (False, 0, "0", "false"):
            continue
        if open_ms + step > now_ms:
            continue
        result[open_ms] = row
    return [result[key] for key in sorted(result)]


def verify_identity(payload: dict[str, Any], symbol: str, timeframe: str, label: str) -> None:
    if str(payload.get("symbol", "")).upper() != symbol:
        fail(f"{label}: symbol metadata does not equal {symbol}.")
    if str(payload.get("provider", "")).lower() != "tvdatafeed":
        fail(f"{label}: provider metadata must be tvdatafeed.")
    if str(payload.get("timeframe", "")).upper() != timeframe:
        fail(f"{label}: timeframe metadata does not equal {timeframe}.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", required=True, choices=sorted(ALLOWED_SYMBOLS))
    parser.add_argument("--timeframe", required=True, choices=sorted(ALLOWED_TIMEFRAMES))
    parser.add_argument("--horizon", required=True, type=int, choices=sorted(ALLOWED_HORIZONS))
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--reference", required=True, type=Path)
    parser.add_argument("--worker", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()

    symbol, timeframe, horizon = args.symbol, args.timeframe, args.horizon
    fresh_payload = load_json(args.input)
    site_payload = load_json(args.reference)
    verify_identity(fresh_payload, symbol, timeframe, "fresh TradingView input")
    verify_identity(site_payload, symbol, timeframe, "published site reference")

    fresh_rows = closed_candles(fresh_payload, timeframe, "fresh TradingView input")
    site_rows = closed_candles(site_payload, timeframe, "published site reference")
    if len(fresh_rows) < 32:
        fail(f"Fresh input has only {len(fresh_rows)} closed candles; minimum is 32.")
    if not site_rows:
        fail("Published site reference contains no valid closed candle.")

    fresh_times = [int(row["open_time_utc_ms"]) for row in fresh_rows]
    site_origin = int(site_rows[-1]["open_time_utc_ms"])
    fresh_origin = fresh_times[-1]
    if site_origin not in fresh_times:
        fail(f"Site reference origin is absent from fresh input (site={site_origin}, fresh={fresh_origin}); refusing timestamp inference.")

    observed_lag = len(fresh_times) - 1 - fresh_times.index(site_origin)
    print(f"[chronos2] origin comparison: site_reference={site_origin}, fresh_input={fresh_origin}, observed_market_bars_between={observed_lag}")
    if observed_lag > 2:
        fail(f"Published site reference is {observed_lag} observed market bars behind fresh input; maximum permitted is 2.")
    if observed_lag != 0:
        fail("Fresh input origin differs from published site origin. The website's strict tab-origin gate would reject it; no JSON will be published.")

    site_close = float(site_rows[-1]["close"])
    fresh_close = float(fresh_rows[-1]["close"])
    if not math.isclose(site_close, fresh_close, rel_tol=0.0, abs_tol=1e-8):
        fail(f"Last closed candle prices differ (site={site_close}, fresh={fresh_close}).")

    expected_versions = {"torch": "2.15.0+cpu", "transformers": "5.23.0", "chronos-forecasting": "2.3.2"}
    for package, wanted in expected_versions.items():
        try:
            actual = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            fail(f"Required package {package} is not installed.")
        if actual != wanted:
            fail(f"Dependency mismatch: {package}={actual}; required exactly {wanted}.")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    output_path = args.output_dir / f"{symbol}_tvdatafeed_{timeframe}_{fresh_origin}_H{horizon}.json"
    cache_key = f"{symbol}|tvdatafeed|{timeframe}|{fresh_origin}|H{horizon}|{MODEL_ID}@{MODEL_REVISION}"
    command = [
        sys.executable, str(args.worker),
        "--input", str(args.input), "--output", str(output_path),
        "--symbol", symbol, "--provider", "tvdatafeed",
        "--timeframe", timeframe, "--horizon", str(horizon),
        "--context-bars", "256", "--cache-key", cache_key,
    ]
    print("[chronos2] Running pinned worker:", " ".join(command))
    completed = subprocess.run(command, check=False)
    if completed.returncode != 0:
        fail(f"Chronos-2 worker exited with code {completed.returncode}; output is not publishable.")

    result = load_json(output_path)
    if result.get("status") != "READY" or result.get("schema") != "chart_chronos2_forecast_v1":
        fail("Worker output is not a READY chart_chronos2_forecast_v1 document.")
    model = result.get("model") or {}
    series = result.get("series") or {}
    forecast = result.get("forecast")
    expected = {
        "model_id": (model.get("model_id"), MODEL_ID),
        "hf_revision_sha": (model.get("hf_revision_sha"), MODEL_REVISION),
        "horizon_bars": (model.get("horizon_bars"), horizon),
        "symbol": (series.get("symbol"), symbol),
        "provider": (series.get("provider"), "tvdatafeed"),
        "timeframe": (series.get("timeframe"), timeframe),
        "origin_open_time_utc_ms": (series.get("origin_open_time_utc_ms"), fresh_origin),
    }
    for field, (actual, wanted) in expected.items():
        if actual != wanted:
            fail(f"Worker contract mismatch at {field}: actual={actual!r}, expected={wanted!r}.")
    if not isinstance(forecast, list) or len(forecast) != horizon:
        fail(f"Worker returned an invalid forecast length; expected exactly {horizon}.")
    if not math.isclose(float(series.get("last_closed_price")), fresh_close, rel_tol=0.0, abs_tol=1e-8):
        fail("Worker last_closed_price does not match the validated source candle.")
    levels = model.get("native_quantile_levels")
    if not isinstance(levels, list) or not levels:
        fail("Worker did not preserve native quantile levels.")
    for index, point in enumerate(forecast, start=1):
        if not isinstance(point, dict) or int(point.get("step", 0)) != index:
            fail(f"Forecast point #{index} has an invalid step index.")
        for key in ("q10", "q25", "q50_median", "q75", "q90"):
            value = point.get(key)
            if not isinstance(value, (int, float)) or not math.isfinite(float(value)):
                fail(f"Forecast point #{index} has a non-finite {key}.")
        if not (float(point["q10"]) <= float(point["q25"]) <= float(point["q50_median"]) <= float(point["q75"]) <= float(point["q90"])):
            fail(f"Forecast point #{index} quantiles are not monotonically ordered.")
        if not isinstance(point.get("native_quantiles"), dict):
            fail(f"Forecast point #{index} is missing native_quantiles.")

    print(f"[chronos2] VALIDATED: {output_path.name}")
    print(f"[chronos2] origin_open_time_utc_ms={fresh_origin}; horizon={horizon}; points={len(forecast)}")
    print(f"CHRONOS2_OUTPUT_FILE={output_path}")
    print(f"CHRONOS2_OUTPUT_NAME={output_path.name}")


if __name__ == "__main__":
    main()
