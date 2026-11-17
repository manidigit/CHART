#!/usr/bin/env python3
"""
Renders a high-resolution PNG verification image of the CHART Candlestick Canvas
with the real Chronos-2 (amazon/chronos-2 @ 29ec3766d36d6f73f0696f85560a422f50e8498c)
Q50 central forecast path and Q25-Q75 uncertainty band on real SPOTBRENT H1 & M15 data.
Uses ImageMagick MVG (Magick Vector Graphics) which is 100% native to `convert` with zero external delegates.
"""

import json
import subprocess
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
TV_DIR = ROOT / "host_subdomain" / "data" / "tvdatafeed"
CACHE_DIR = ROOT / "host_subdomain" / "data" / "chronos2" / "cache"
OUT_MVG = ROOT / "host_subdomain" / "data" / "chronos2" / "chronos2_spotbrent_chart_verification.mvg"
OUT_PNG = ROOT / "host_subdomain" / "data" / "chronos2" / "chronos2_spotbrent_chart_verification.png"
DOCS_PNG = ROOT / "docs" / "assets" / "chronos2_spotbrent_chart_verification.png"
ARTIFACT_PNG = ROOT / ".aistudio" / "artifacts" / "brain" / "935dc909-d84d-4535-8139-c8fa5efe9720" / "chronos2_spotbrent_chart_verification.png"
FONT_MONO = str(ROOT / "app" / "src" / "main" / "res" / "font" / "jetbrains_mono.ttf")


def load_panel_data(symbol: str, tf: str, cache_filename: str, visible_closed_bars: int = 72):
    raw_feed = json.loads((TV_DIR / f"{symbol}_{tf}.json").read_text(encoding="utf-8"))
    candles = raw_feed.get("candles", raw_feed if isinstance(raw_feed, list) else [])
    closed = [c for c in candles if c.get("is_closed", 1) in (1, True)]
    closed.sort(key=lambda c: int(c["open_time_utc_ms"]))
    tail_candles = closed[-visible_closed_bars:]
    forecast_payload = json.loads((CACHE_DIR / cache_filename).read_text(encoding="utf-8"))
    return tail_candles, forecast_payload


def fmt_ts(ms: int, tf: str) -> str:
    dt = datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
    if tf == "D1":
        return dt.strftime("%Y-%m-%d")
    return dt.strftime("%m-%d %H:%M")


def esc(text: str) -> str:
    return text.replace("'", "\\'")


def render_panel_mvg(x0: float, y0: float, w: float, h: float, title: str, candles: list, fc_payload: dict) -> list:
    cmds = []
    # Panel box
    cmds.append(f"fill '#0B0F17' stroke '#1E293B' stroke-width 1.5 roundrectangle {x0},{y0} {x0+w},{y0+h} 8,8")
    # Header bar
    cmds.append(f"fill '#111827' stroke '#1E293B' stroke-width 1 roundrectangle {x0},{y0} {x0+w},{y0+44} 8,8")

    series = fc_payload["series"]
    model = fc_payload["model"]
    runtime = fc_payload["runtime"]
    steps = fc_payload["forecast"]
    last_close = float(series["last_closed_price"])
    step1_q50 = float(steps[0]["q50_median"])
    step30_q50 = float(steps[-1]["q50_median"])
    step30_q25 = float(steps[-1]["q25"])
    step30_q75 = float(steps[-1]["q75"])

    cmds.append(f"font '{FONT_MONO}' font-size 13 fill '#F8FAFC' stroke 'none' text {x0+16},{y0+27} '{esc(title)} | Origin: {series['origin_open_time_utc_iso']} | Last Close: {last_close:.2f}'")

    # Top-right active pills
    pill_x = x0 + w - 475
    cmds.append(f"fill '#2E1065' stroke '#A855F7' stroke-width 1.2 roundrectangle {pill_x},{y0+9} {pill_x+215},{y0+35} 5,5")
    cmds.append(f"font '{FONT_MONO}' font-size 11.5 fill '#E9D5FF' stroke 'none' text {pill_x+10},{y0+26} 'Chronos-2 Q50 (+{len(steps)} Bars): ON'")

    band_x = pill_x + 225
    cmds.append(f"fill '#1E1B4B' stroke '#8B5CF6' stroke-width 1.0 roundrectangle {band_x},{y0+9} {band_x+235},{y0+35} 5,5")
    cmds.append(f"font '{FONT_MONO}' font-size 11.5 fill '#C4B5FD' stroke 'none' text {band_x+10},{y0+26} 'Band Q25-Q75: ON (21 Quantiles)'")

    pad_left = 18.0
    pad_right = 98.0
    pad_top = 56.0
    pad_bottom = 34.0
    pw = w - pad_left - pad_right
    ph = h - pad_top - pad_bottom
    px0 = x0 + pad_left
    py0 = y0 + pad_top

    n_hist = len(candles)
    n_fut = len(steps)
    total_slots = n_hist + n_fut + 2
    slot_w = pw / total_slots

    min_p = min(float(c["low"]) for c in candles)
    max_p = max(float(c["high"]) for c in candles)
    for st in steps:
        min_p = min(min_p, float(st["q25"]), float(st["q50_median"]))
        max_p = max(max_p, float(st["q75"]), float(st["q50_median"]))

    span = max(max_p - min_p, 1e-4)
    min_p -= span * 0.08
    max_p += span * 0.08
    span = max_p - min_p

    def price_to_y(p: float) -> float:
        return py0 + ph - ((p - min_p) / span) * ph

    def slot_to_x(idx: int) -> float:
        return px0 + (idx + 0.5) * slot_w

    # Horizontal grid + right Y-axis labels
    grid_rows = 6
    for i in range(grid_rows + 1):
        p_val = min_p + (span * (grid_rows - i) / grid_rows)
        gy = py0 + (ph * i / grid_rows)
        cmds.append(f"stroke '#1E293B' stroke-width 1 fill 'none' line {px0},{gy:.1f} {px0+pw},{gy:.1f}")
        cmds.append(f"font '{FONT_MONO}' font-size 11 fill '#94A3B8' stroke 'none' text {px0+pw+8},{gy+4:.1f} '{p_val:.2f}'")

    # Vertical grid & X-axis time ticks
    tf = series["timeframe"]
    step_ms = int(series["step_ms"])
    origin_ms = int(series["origin_open_time_utc_ms"])
    tick_indices = [0, n_hist // 3, (2 * n_hist) // 3, n_hist - 1, n_hist - 1 + n_fut // 2, n_hist - 1 + n_fut]
    for tidx in tick_indices:
        tx = slot_to_x(tidx)
        if tidx < n_hist:
            ts_ms = int(candles[tidx]["open_time_utc_ms"])
            col = "#64748B"
        else:
            f_step = tidx - (n_hist - 1)
            ts_ms = origin_ms + f_step * step_ms
            col = "#C4B5FD"
        cmds.append(f"stroke '#1E293B' stroke-width 1 fill 'none' line {tx:.1f},{py0} {tx:.1f},{py0+ph}")
        lbl = fmt_ts(ts_ms, tf)
        cmds.append(f"font '{FONT_MONO}' font-size 10.5 fill '{col}' stroke 'none' text {tx-34:.1f},{py0+ph+20} '{lbl}'")

    # Closed historical candlesticks
    body_w = max(2.8, slot_w * 0.64)
    for idx, c in enumerate(candles):
        cx = slot_to_x(idx)
        o = float(c["open"])
        hi = float(c["high"])
        lo = float(c["low"])
        cl = float(c["close"])
        bull = cl >= o
        color = "#10B981" if bull else "#EF4444"
        y_hi = price_to_y(hi)
        y_lo = price_to_y(lo)
        y_top = price_to_y(max(o, cl))
        y_bot = price_to_y(min(o, cl))
        if y_bot - y_top < 1.5:
            y_bot = y_top + 1.5
        cmds.append(f"stroke '{color}' stroke-width 1.3 fill 'none' line {cx:.1f},{y_hi:.1f} {cx:.1f},{y_lo:.1f}")
        cmds.append(f"fill '{color}' stroke 'none' rectangle {cx-body_w/2:.1f},{y_top:.1f} {cx+body_w/2:.1f},{y_bot:.1f}")

    # Origin vertical line at last closed candle
    origin_slot = n_hist - 1
    origin_x = slot_to_x(origin_slot)
    origin_y = price_to_y(last_close)
    cmds.append(f"stroke '#A855F7' stroke-width 1.4 fill 'none' line {origin_x:.1f},{py0} {origin_x:.1f},{py0+ph}")
    cmds.append(f"fill '#2E1065' stroke '#A855F7' stroke-width 1 roundrectangle {origin_x-70:.1f},{py0+5} {origin_x+70:.1f},{py0+23} 4,4")
    cmds.append(f"font '{FONT_MONO}' font-size 10 fill '#E9D5FF' stroke 'none' text {origin_x-60:.1f},{py0+18} 'Chronos-2 Origin ({tf})'")

    # Build Q25..Q75 shaded uncertainty polygon anchored at last closed candle
    upper_pts = [(origin_x, origin_y)]
    lower_pts = [(origin_x, origin_y)]
    q50_pts = [(origin_x, origin_y)]
    for s_idx, st in enumerate(steps):
        sx = slot_to_x(origin_slot + 1 + s_idx)
        upper_pts.append((sx, price_to_y(float(st["q75"]))))
        lower_pts.append((sx, price_to_y(float(st["q25"]))))
        q50_pts.append((sx, price_to_y(float(st["q50_median"]))))

    poly_coords = upper_pts + list(reversed(lower_pts))
    poly_str = " ".join(f"{px:.1f},{py:.1f}" for px, py in poly_coords)
    cmds.append(f"fill 'rgba(168, 85, 247, 0.24)' stroke 'none' polygon {poly_str}")

    # Q75 and Q25 boundary polylines
    u_str = " ".join(f"{px:.1f},{py:.1f}" for px, py in upper_pts)
    l_str = " ".join(f"{px:.1f},{py:.1f}" for px, py in lower_pts)
    cmds.append(f"fill 'none' stroke '#C084FC' stroke-width 1.3 polyline {u_str}")
    cmds.append(f"fill 'none' stroke '#C084FC' stroke-width 1.3 polyline {l_str}")

    # Q50 central forecast path (halo + crisp line + step markers)
    q50_str = " ".join(f"{px:.1f},{py:.1f}" for px, py in q50_pts)
    cmds.append(f"fill 'none' stroke 'rgba(168, 85, 247, 0.32)' stroke-width 6.0 polyline {q50_str}")
    cmds.append(f"fill 'none' stroke '#E9D5FF' stroke-width 2.5 polyline {q50_str}")

    for i_pt, (px, py) in enumerate(q50_pts):
        if i_pt == 0 or i_pt == len(q50_pts) - 1 or i_pt % 5 == 0:
            r = 4.0 if i_pt in (0, len(q50_pts) - 1) else 2.6
            cmds.append(f"fill '#F3E8FF' stroke '#7E22CE' stroke-width 1.3 circle {px:.1f},{py:.1f} {px+r:.1f},{py:.1f}")

    # Right-axis price badges for Q75, Q50, Q25 at step +30
    end_q75_y = upper_pts[-1][1]
    end_q50_y = q50_pts[-1][1]
    end_q25_y = lower_pts[-1][1]

    cmds.append(f"fill '#3B0764' stroke '#A855F7' stroke-width 0.9 roundrectangle {px0+pw+2},{end_q75_y-9:.1f} {px0+pw+92},{end_q75_y+9:.1f} 3,3")
    cmds.append(f"font '{FONT_MONO}' font-size 10 fill '#E9D5FF' stroke 'none' text {px0+pw+6},{end_q75_y+4:.1f} 'Q75 {step30_q75:.2f}'")

    cmds.append(f"fill '#3B0764' stroke '#A855F7' stroke-width 0.9 roundrectangle {px0+pw+2},{end_q25_y-9:.1f} {px0+pw+92},{end_q25_y+9:.1f} 3,3")
    cmds.append(f"font '{FONT_MONO}' font-size 10 fill '#E9D5FF' stroke 'none' text {px0+pw+6},{end_q25_y+4:.1f} 'Q25 {step30_q25:.2f}'")

    cmds.append(f"fill '#9333EA' stroke '#F3E8FF' stroke-width 1.1 roundrectangle {px0+pw+2},{end_q50_y-10:.1f} {px0+pw+92},{end_q50_y+10:.1f} 4,4")
    cmds.append(f"font '{FONT_MONO}' font-size 10.5 fill '#FFFFFF' stroke 'none' text {px0+pw+6},{end_q50_y+4:.1f} 'Q50 {step30_q50:.2f}'")

    # Top-left HUD overlay inside canvas
    info_x = px0 + 12
    info_y = py0 + 10
    cmds.append(f"fill 'rgba(15, 23, 42, 0.90)' stroke '#334155' stroke-width 1 roundrectangle {info_x},{info_y} {info_x+520},{info_y+52} 6,6")
    cmds.append(f"font '{FONT_MONO}' font-size 11 fill '#E2E8F0' stroke 'none' text {info_x+10},{info_y+20} 'Model: {model['model_id']} @ {model['hf_revision_sha'][:12]}... (Close-Only, 0 Synthetic OHLC)'")
    cmds.append(f"font '{FONT_MONO}' font-size 11 fill '#C4B5FD' stroke 'none' text {info_x+10},{info_y+40} 'Step +1 Q50: {step1_q50:.2f} | Step +30 Q50: {step30_q50:.2f} [Q25: {step30_q25:.2f}, Q75: {step30_q75:.2f}] | {runtime['inference_sec']:.3f}s'")

    return cmds


def main():
    W, H = 1440, 920
    h1_candles, h1_fc = load_panel_data("SPOTBRENT", "H1", "SPOTBRENT_tvdatafeed_H1_1794207600000_H30.json", 72)
    m15_candles, m15_fc = load_panel_data("SPOTBRENT", "M15", "SPOTBRENT_tvdatafeed_M15_1794213000000_H30.json", 72)

    mvg_lines = [
        f"viewbox 0 0 {W} {H}",
        f"fill '#06090F' stroke 'none' rectangle 0,0 {W},{H}",
        f"font '{FONT_MONO}' font-size 16 fill '#F8FAFC' stroke 'none' text 24,32 'CHART - Real Chronos-2 Forecast Verification (amazon/chronos-2 @ 29ec3766d36d6f73f0696f85560a422f50e8498c)'",
        f"font '{FONT_MONO}' font-size 11.5 fill '#94A3B8' stroke 'none' text 24,54 'Closed Candles Only | Horizon: 30 Future Steps | Central Path: Q50 Median | Optional Band: Q25-Q75 | 21 Native Quantiles Preserved'",
    ]
    mvg_lines.extend(render_panel_mvg(20, 70, 1400, 405, "SPOTBRENT - tvdatafeed - H1 (1-Hour)", h1_candles, h1_fc))
    mvg_lines.extend(render_panel_mvg(20, 495, 1400, 405, "SPOTBRENT - tvdatafeed - M15 (15-Minute)", m15_candles, m15_fc))

    OUT_MVG.write_text("\n".join(mvg_lines), encoding="utf-8")
    subprocess.run(["convert", "-size", f"{W}x{H}", f"mvg:{OUT_MVG}", str(OUT_PNG)], check=True)
    OUT_MVG.unlink(missing_ok=True)
    svg_temp = ROOT / "host_subdomain" / "data" / "chronos2" / "chronos2_spotbrent_chart_verification.svg"
    svg_temp.unlink(missing_ok=True)
    DOCS_PNG.parent.mkdir(parents=True, exist_ok=True)
    DOCS_PNG.write_bytes(OUT_PNG.read_bytes())
    ARTIFACT_PNG.parent.mkdir(parents=True, exist_ok=True)
    ARTIFACT_PNG.write_bytes(OUT_PNG.read_bytes())
    print(f"Generated {OUT_PNG} ({OUT_PNG.stat().st_size} bytes), {DOCS_PNG}, and {ARTIFACT_PNG}")


if __name__ == "__main__":
    main()
