#!/usr/bin/env python3
"""
Extracts historical & daily closed candles for PEPPERSTONE:SPOTBRENT from TradingView
using the `tvdatafeed` library (or its built-in zero-dependency TradingView WebSocket
client when `pip` / `tvDatafeed` is not installed on the host) — up to 5,000 bars per
timeframe: 15m (M15), 1h (H1), 4h (H4), and 1D (D1).

Usage:
  pip install --upgrade --no-cache-dir git+https://github.com/rongardF/tvdatafeed.git
  python3 host_subdomain/scripts/sync_tvdatafeed.py --output-dir host_subdomain/data/tvdatafeed --bars 5000
"""

import argparse
import base64
import csv
import datetime
import json
import os
import random
import re
import socket
import ssl
import string
import struct
import sys
import time
from typing import Dict, List, Optional, Tuple

try:
    from tvDatafeed import TvDatafeed, Interval
    import pandas as pd
    HAS_TVDATAFEED_PKG = True
except ImportError:
    HAS_TVDATAFEED_PKG = False


TIMEFRAME_SPECS = [
    ("M15", "15m", "15", 15 * 60 * 1000),
    ("H1", "1h", "60", 60 * 60 * 1000),
    ("H4", "4h", "240", 4 * 60 * 60 * 1000),
    ("D1", "1d", "1D", 24 * 60 * 60 * 1000),
]


def snap_open_utc_ms(raw_ms: int, step_ms: int) -> int:
    if step_ms <= 0:
        return raw_ms
    return (raw_ms // step_ms) * step_ms


def format_utc_iso(open_ms: int) -> str:
    dt = datetime.datetime.fromtimestamp(open_ms / 1000.0, tz=datetime.timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def format_csv_datetime(open_ms: int) -> str:
    dt = datetime.datetime.fromtimestamp(open_ms / 1000.0, tz=datetime.timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _tv_pack_msg(func: str, param_list: list) -> str:
    payload = json.dumps({"m": func, "p": param_list}, separators=(",", ":"))
    return f"~m~{len(payload)}~m~{payload}"


def _ws_send_text(sock: ssl.SSLSocket, text: str) -> None:
    data = text.encode("utf-8")
    length = len(data)
    header = bytearray([0x81])
    mask_key = os.urandom(4)
    if length < 126:
        header.append(0x80 | length)
    elif length < 65536:
        header.append(0x80 | 126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack("!Q", length))
    header.extend(mask_key)
    masked = bytearray(length)
    for i in range(length):
        masked[i] = data[i] ^ mask_key[i % 4]
    sock.sendall(header + masked)


def _ws_recv_frame(sock: ssl.SSLSocket) -> Optional[str]:
    def read_exact(n: int) -> bytes:
        buf = bytearray()
        while len(buf) < n:
            chunk = sock.recv(n - len(buf))
            if not chunk:
                raise EOFError("WebSocket closed")
            buf.extend(chunk)
        return bytes(buf)

    first2 = read_exact(2)
    opcode = first2[0] & 0x0F
    masked = (first2[1] & 0x80) != 0
    length = first2[1] & 0x7F
    if length == 126:
        length = struct.unpack("!H", read_exact(2))[0]
    elif length == 127:
        length = struct.unpack("!Q", read_exact(8))[0]
    mask_key = read_exact(4) if masked else b""
    payload = read_exact(length)
    if masked:
        payload = bytes(payload[i] ^ mask_key[i % 4] for i in range(length))
    if opcode == 0x8:  # Close
        return None
    if opcode == 0x9:  # Ping -> Pong
        return ""
    return payload.decode("utf-8", errors="ignore")


def fetch_via_stdlib_tv_websocket(symbol: str, exchange: str, tv_interval_code: str, n_bars: int) -> List[Tuple[int, float, float, float, float, float]]:
    """
    Zero-dependency implementation of `tvDatafeed.get_hist()` using Python's built-in
    `ssl` + `socket` to query `wss://data.tradingview.com/socket.io/websocket`.
    Returns list of tuples: (epoch_sec, open, high, low, close, volume).
    """
    host = "data.tradingview.com"
    ctx = ssl.create_default_context()
    raw_sock = socket.create_connection((host, 443), timeout=15)
    sock = ctx.wrap_socket(raw_sock, server_hostname=host)
    try:
        ws_key = base64.b64encode(os.urandom(16)).decode("ascii")
        handshake = (
            "GET /socket.io/websocket?from=chart%2F HTTP/1.1\r\n"
            f"Host: {host}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Origin: https://www.tradingview.com\r\n"
            f"Sec-WebSocket-Key: {ws_key}\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "User-Agent: Mozilla/5.0\r\n\r\n"
        )
        sock.sendall(handshake.encode("ascii"))
        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = sock.recv(4096)
            if not chunk:
                break
            resp += chunk

        chart_session = "cs_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=12))
        sym_arg = json.dumps({"symbol": f"{exchange}:{symbol}", "adjustment": "splits", "session": "regular"})

        _ws_send_text(sock, _tv_pack_msg("set_auth_token", ["unauthorized_user_token"]))
        _ws_send_text(sock, _tv_pack_msg("chart_create_session", [chart_session, ""]))
        _ws_send_text(sock, _tv_pack_msg("switch_timezone", [chart_session, "Etc/UTC"]))
        _ws_send_text(sock, _tv_pack_msg("resolve_symbol", [chart_session, "symbol_1", f"={sym_arg}"]))
        _ws_send_text(sock, _tv_pack_msg("create_series", [chart_session, "s1", "s1", "symbol_1", tv_interval_code, n_bars]))

        raw_buffer = ""
        deadline = time.time() + 18.0
        while time.time() < deadline:
            frame = _ws_recv_frame(sock)
            if frame is None:
                break
            if frame.startswith("~m~") and "~h~" in frame:
                # Heartbeat echo
                _ws_send_text(sock, frame)
                continue
            raw_buffer += frame
            if '"timescale_update"' in frame and ('"series_completed"' in raw_buffer or '"s":[' in raw_buffer):
                # Keep reading until series_completed arrives
                if '"series_completed"' in raw_buffer:
                    break
            elif '"series_completed"' in frame or '"symbol_error"' in frame:
                break

        rows: List[Tuple[int, float, float, float, float, float]] = []
        for match in re.finditer(r'"s":\[(\{"i":.*?\})\]', raw_buffer):
            arr_str = "[" + match.group(1) + "]"
            try:
                items = json.loads(arr_str)
                for item in items:
                    v = item.get("v", [])
                    if len(v) >= 5:
                        ts = int(float(v[0]))
                        o_v = float(v[1])
                        h_v = float(v[2])
                        l_v = float(v[3])
                        c_v = float(v[4])
                        vol_v = float(v[5]) if len(v) > 5 else 0.0
                        rows.append((ts, o_v, h_v, l_v, c_v, vol_v))
            except Exception:
                pass
        return rows
    finally:
        try:
            sock.close()
        except Exception:
            pass


def fetch_bars_for_timeframe(symbol: str, exchange: str, tv_code: str, n_bars: int) -> List[Tuple[int, float, float, float, float, float]]:
    if HAS_TVDATAFEED_PKG:
        interval_map = {
            "15": Interval.in_15_minute,
            "60": Interval.in_1_hour,
            "240": Interval.in_4_hour,
            "1D": Interval.in_daily,
        }
        tv = TvDatafeed()
        df = tv.get_hist(
            symbol=symbol,
            exchange=exchange,
            interval=interval_map[tv_code],
            n_bars=n_bars,
        )
        if df is not None and not df.empty:
            out: List[Tuple[int, float, float, float, float, float]] = []
            for idx_ts, row in df.iterrows():
                if hasattr(idx_ts, "tzinfo"):
                    if idx_ts.tzinfo is None:
                        epoch_sec = int(idx_ts.replace(tzinfo=datetime.timezone.utc).timestamp())
                    else:
                        epoch_sec = int(idx_ts.astimezone(datetime.timezone.utc).timestamp())
                    out.append((
                        epoch_sec,
                        float(row.get("open", 0.0)),
                        float(row.get("high", 0.0)),
                        float(row.get("low", 0.0)),
                        float(row.get("close", 0.0)),
                        float(row.get("volume", 0.0)),
                    ))
            if out:
                return out

    return fetch_via_stdlib_tv_websocket(symbol, exchange, tv_code, n_bars)


def fetch_and_export(symbol: str, exchange: str, n_bars: int, output_dir: str) -> int:
    os.makedirs(output_dir, exist_ok=True)
    now_ms = int(time.time() * 1000)
    total_saved = 0

    for tf_code, csv_suffix, tv_code, step_ms in TIMEFRAME_SPECS:
        print(f"[sync_tvdatafeed] Fetching {exchange}:{symbol} timeframe={tf_code} (n_bars={n_bars})...")
        raw_rows: List[Tuple[int, float, float, float, float, float]] = []
        for attempt in range(1, 4):
            try:
                raw_rows = fetch_bars_for_timeframe(symbol, exchange, tv_code, n_bars)
                if raw_rows:
                    break
            except Exception as err:
                print(f"[sync_tvdatafeed] Attempt {attempt} failed for {tf_code}: {err}", file=sys.stderr)
                time.sleep(1.2 * attempt)

        if not raw_rows:
            print(f"[sync_tvdatafeed] WARNING: No data returned for {tf_code}", file=sys.stderr)
            continue

        # 1. Save exact CSV requested by user (SPOTBRENT_15m.csv, SPOTBRENT_1h.csv, SPOTBRENT_4h.csv, SPOTBRENT_1d.csv)
        csv_filename = os.path.join(output_dir, f"{symbol}_{csv_suffix}.csv")
        with open(csv_filename, "w", newline="", encoding="utf-8") as cf:
            writer = csv.writer(cf)
            writer.writerow(["datetime", "symbol", "open", "high", "low", "close", "volume"])
            for epoch_sec, o_val, h_val, l_val, c_val, v_val in raw_rows:
                writer.writerow([
                    format_csv_datetime(epoch_sec * 1000),
                    f"{exchange}:{symbol}",
                    o_val,
                    h_val,
                    l_val,
                    c_val,
                    v_val,
                ])

        # 2. Normalize closed candles for MariaDB & API ingestion
        candles_by_open_ms: Dict[int, dict] = {}
        for epoch_sec, o_val, h_val, l_val, c_val, v_val in raw_rows:
            open_ms = snap_open_utc_ms(epoch_sec * 1000, step_ms)
            if open_ms + step_ms > now_ms:
                continue
            if min(o_val, h_val, l_val, c_val) <= 0.0:
                continue

            high_fixed = max(o_val, h_val, l_val, c_val)
            low_fixed = min(o_val, h_val, l_val, c_val)
            vol_fixed = max(0.0, v_val)

            candles_by_open_ms[open_ms] = {
                "open_time_utc_ms": open_ms,
                "open_time_utc_iso": format_utc_iso(open_ms),
                "timeframe": tf_code,
                "open": f"{o_val:.8f}",
                "high": f"{high_fixed:.8f}",
                "low": f"{low_fixed:.8f}",
                "close": f"{c_val:.8f}",
                "volume": f"{vol_fixed:.8f}",
                "is_closed": True,
            }

        sorted_candles = [candles_by_open_ms[k] for k in sorted(candles_by_open_ms.keys())][-n_bars:]
        json_filename = os.path.join(output_dir, f"{symbol}_{tf_code}.json")
        with open(json_filename, "w", encoding="utf-8") as jf:
            json.dump(
                {
                    "symbol": symbol,
                    "exchange": exchange,
                    "provider": "tvdatafeed",
                    "timeframe": tf_code,
                    "synced_at_utc_ms": now_ms,
                    "count": len(sorted_candles),
                    "candles": sorted_candles,
                },
                jf,
                separators=(",", ":"),
            )
        last_close = sorted_candles[-1]["close"] if sorted_candles else "N/A"
        print(f"[sync_tvdatafeed] Saved {len(sorted_candles)} closed {tf_code} candles (last close={last_close}) -> {json_filename}")
        total_saved += len(sorted_candles)

    return total_saved


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync PEPPERSTONE:SPOTBRENT candles via tvdatafeed")
    parser.add_argument("--symbol", default="SPOTBRENT", help="TradingView symbol (default: SPOTBRENT)")
    parser.add_argument("--exchange", default="PEPPERSTONE", help="TradingView exchange (default: PEPPERSTONE)")
    parser.add_argument("--bars", type=int, default=5000, help="Max bars per timeframe (default: 5000)")
    parser.add_argument(
        "--output-dir",
        default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "tvdatafeed"),
        help="Directory to write CSV and normalized JSON files",
    )
    args = parser.parse_args()
    count = fetch_and_export(args.symbol.upper(), args.exchange.upper(), max(12, min(5000, args.bars)), args.output_dir)
    if count == 0:
        sys.exit(2)


if __name__ == "__main__":
    main()
