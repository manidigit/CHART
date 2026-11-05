#!/usr/bin/env python3
"""Twelve Data read-only market-data smoke test for Chart Intelligence.

Reads TWELVE_DATA_API_KEY from the environment. Never prints the key or
full request URLs. It checks the provider catalogue and fetches a small
sample of 15-minute OHLC candles for Gold Spot and Brent Spot.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

BASE_URL = "https://api.twelvedata.com"
INTERVAL = "15min"
OUTPUT_SIZE = 100
TIMEOUT_SECONDS = 30


class ProviderError(RuntimeError):
    pass


def api_get(endpoint: str, params: dict[str, str] | None = None):
    api_key = os.environ.get("TWELVE_DATA_API_KEY", "").strip()
    if not api_key:
        raise ProviderError("Missing GitHub Actions secret: TWELVE_DATA_API_KEY")

    query = urllib.parse.urlencode(params or {})
    url = f"{BASE_URL}/{endpoint}" + (f"?{query}" if query else "")
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"apikey {api_key}",
            "Accept": "application/json",
            "User-Agent": "Chart-Intelligence-Data-POC/0.1",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        # Do not print request URL or request headers: the API key is secret.
        body = exc.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(body)
            message = data.get("message", "Provider returned an HTTP error")
            code = data.get("code", exc.code)
        except (json.JSONDecodeError, AttributeError):
            message, code = "Provider returned an HTTP error", exc.code
        raise ProviderError(f"Twelve Data HTTP/API error {code}: {message}") from None
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ProviderError(f"Network error contacting Twelve Data: {exc}") from None

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        raise ProviderError("Twelve Data returned a non-JSON response") from None

    if isinstance(data, dict) and data.get("status") == "error":
        raise ProviderError(
            f"Twelve Data API error {data.get('code', '')}: "
            f"{data.get('message', 'Unknown provider error')}"
        )
    return data


def records_from_catalog(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("data", "values", "commodities"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    raise ProviderError("Unexpected /commodities response structure")


def find_commodity(records, wanted: str):
    matches = []
    for item in records:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        symbol = str(item.get("symbol", "")).strip()
        normalized = name.casefold()
        if wanted == "gold" and ("gold spot" in normalized):
            matches.append((name, symbol))
        elif wanted == "brent" and ("brent spot" in normalized):
            matches.append((name, symbol))

    # Prefer the exact Spot instrument name, then deterministic symbol order.
    matches.sort(key=lambda pair: (pair[0].casefold() not in (f"{wanted} spot",), pair[1]))
    return matches[0] if matches else None


def as_decimal(value, field: str) -> Decimal:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ProviderError(f"Invalid or missing OHLC value in field '{field}'") from None
    if not result.is_finite():
        raise ProviderError(f"Non-finite OHLC value in field '{field}'")
    return result


def inspect_series(display_name: str, symbol: str):
    payload = api_get(
        "time_series",
        {
            "symbol": symbol,
            "interval": INTERVAL,
            "outputsize": str(OUTPUT_SIZE),
            "timezone": "UTC",
            "order": "asc",
        },
    )
    values = payload.get("values") if isinstance(payload, dict) else None
    if not isinstance(values, list) or not values:
        raise ProviderError(f"No {INTERVAL} candles returned for {display_name} ({symbol})")

    parsed = []
    for candle in values:
        if not isinstance(candle, dict):
            raise ProviderError(f"Malformed candle returned for {display_name}")
        try:
            stamp = datetime.strptime(candle["datetime"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except (KeyError, ValueError):
            raise ProviderError(f"Invalid candle datetime returned for {display_name}") from None
        o = as_decimal(candle.get("open"), "open")
        h = as_decimal(candle.get("high"), "high")
        low = as_decimal(candle.get("low"), "low")
        c = as_decimal(candle.get("close"), "close")
        if h < max(o, low, c) or low > min(o, h, c):
            raise ProviderError(f"OHLC consistency check failed for {display_name} at {stamp.isoformat()}")
        parsed.append((stamp, o, h, low, c))

    parsed.sort(key=lambda row: row[0])
    stamps = [row[0] for row in parsed]
    duplicate_count = len(stamps) - len(set(stamps))
    if duplicate_count:
        raise ProviderError(f"{display_name}: {duplicate_count} duplicate candle timestamps")

    deltas = [(right - left) for left, right in zip(stamps, stamps[1:])]
    expected = timedelta(minutes=15)
    exact_intervals = sum(delta == expected for delta in deltas)
    gaps_over_interval = sum(delta > expected for delta in deltas)

    return {
        "instrument_name": display_name,
        "provider_symbol": symbol,
        "provider": "Twelve Data",
        "interval": INTERVAL,
        "timezone": "UTC",
        "candle_count": len(parsed),
        "first_candle_utc": stamps[0].isoformat(),
        "last_candle_utc": stamps[-1].isoformat(),
        "exact_15m_transitions": exact_intervals,
        "gaps_over_15m": gaps_over_interval,
        "ohlc_valid": True,
        "duplicate_timestamps": duplicate_count,
        "latest_candle_may_be_open": True,
    }


def main():
    catalog = api_get("commodities")
    records = records_from_catalog(catalog)

    selected = {}
    for key in ("gold", "brent"):
        match = find_commodity(records, key)
        if not match:
            candidates = []
            for item in records:
                if isinstance(item, dict) and key in str(item.get("name", "")).casefold():
                    candidates.append({
                        "name": item.get("name"),
                        "symbol": item.get("symbol"),
                    })
            raise ProviderError(
                f"Could not identify a {key.title()} Spot symbol in the provider catalogue. "
                f"Related catalogue entries: {json.dumps(candidates[:10], ensure_ascii=False)}"
            )
        selected[key] = match

    results = []
    for key in ("gold", "brent"):
        name, symbol = selected[key]
        results.append(inspect_series(name, symbol))

    report = {
        "test": "twelve_data_market_data_smoke_test",
        "status": "passed",
        "provider": "Twelve Data",
        "scope": "market data only; no brokerage account or trading endpoints",
        "requested_interval": INTERVAL,
        "instruments": results,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except ProviderError as exc:
        print(json.dumps({
            "test": "twelve_data_market_data_smoke_test",
            "status": "failed",
            "error": str(exc),
        }, ensure_ascii=False, indent=2))
        sys.exit(1)
