#!/usr/bin/env python3
"""Twelve Data read-only market-data smoke test for Chart Intelligence.

The API key is read only from TWELVE_DATA_API_KEY. It is never printed.
This first POC tests the provider's documented gold symbol and a Brent
symbol candidate independently, so one plan restriction cannot hide the
result of the other request.
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

# XAU/USD is explicitly listed as the Commodity trial symbol by Twelve Data.
# XBR is listed by Twelve Data as its Brent Spot instrument; XBR/USD is tested
# as the candidate API ticker and will be confirmed or rejected by the API.
INSTRUMENTS = [
    {"name": "Gold Spot / US Dollar", "symbol": "XAU/USD"},
    {"name": "Brent Spot", "symbol": "XBR/USD"},
]


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

    expected = timedelta(minutes=15)
    deltas = [right - left for left, right in zip(stamps, stamps[1:])]
    return {
        "instrument_name": display_name,
        "provider_symbol_tested": symbol,
        "provider": "Twelve Data",
        "interval": INTERVAL,
        "timezone": "UTC",
        "status": "passed",
        "candle_count": len(parsed),
        "first_candle_utc": stamps[0].isoformat(),
        "last_candle_utc": stamps[-1].isoformat(),
        "exact_15m_transitions": sum(delta == expected for delta in deltas),
        "gaps_over_15m": sum(delta > expected for delta in deltas),
        "ohlc_valid": True,
        "duplicate_timestamps": duplicate_count,
        "latest_candle_may_be_open": True,
    }


def main():
    results = []
    for instrument in INSTRUMENTS:
        try:
            results.append(inspect_series(instrument["name"], instrument["symbol"]))
        except ProviderError as exc:
            results.append({
                "instrument_name": instrument["name"],
                "provider_symbol_tested": instrument["symbol"],
                "provider": "Twelve Data",
                "interval": INTERVAL,
                "status": "failed",
                "error": str(exc),
            })

    passed = sum(item["status"] == "passed" for item in results)
    report = {
        "test": "twelve_data_market_data_smoke_test",
        "status": "passed" if passed == len(INSTRUMENTS) else "partial" if passed else "failed",
        "provider": "Twelve Data",
        "scope": "market data only; no brokerage account or trading endpoints",
        "requested_interval": INTERVAL,
        "instruments": results,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if passed != len(INSTRUMENTS):
        sys.exit(1)


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
