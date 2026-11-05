"use client";

import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, createChart, type UTCTimestamp } from "lightweight-charts";

type Candle = {
  time: string;
  open_price: string;
  high_price: string;
  low_price: string;
  close_price: string;
};

export function CandleChart({ instrumentId }: { instrumentId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("Loading verified candles…");

  useEffect(() => {
    if (!host.current || !instrumentId) return;
    let alive = true;
    const element = host.current;
    const chart = createChart(element, {
      width: element.clientWidth,
      height: 430,
      layout: { background: { type: ColorType.Solid, color: "#111a24" }, textColor: "#aab8c8" },
      grid: { vertLines: { color: "#1d2936" }, horzLines: { color: "#1d2936" } },
      rightPriceScale: { borderColor: "#263342" },
      timeScale: { borderColor: "#263342", timeVisible: true, secondsVisible: false },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a", downColor: "#ef5350",
      borderUpColor: "#26a69a", borderDownColor: "#ef5350",
      wickUpColor: "#26a69a", wickDownColor: "#ef5350",
    });
    const resize = new ResizeObserver(() => chart.applyOptions({ width: element.clientWidth }));
    resize.observe(element);

    fetch(`/api/chart/instruments/${encodeURIComponent(instrumentId)}/candles?timeframe=M15&limit=500`, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error(response.status === 404 ? "No verified candle history yet." : "Market data API unavailable."); return response.json(); })
      .then((payload: { data: Candle[] }) => {
        if (!alive) return;
        const rows = (payload.data ?? []).map((c) => ({
          time: (Date.parse(c.time) / 1000) as UTCTimestamp,
          open: Number(c.open_price), high: Number(c.high_price),
          low: Number(c.low_price), close: Number(c.close_price),
        }));
        if (rows.length) {
          series.setData(rows);
          chart.timeScale().fitContent();
          setMessage("");
        } else setMessage("No verified closed M15 candles are available for this instrument.");
      })
      .catch((error: Error) => { if (alive) setMessage(error.message); });

    return () => { alive = false; resize.disconnect(); chart.remove(); };
  }, [instrumentId]);

  return <div style={{ minWidth: 0 }}>
    {message && <div className="chart-placeholder" style={{ minHeight: 430 }}>{message}</div>}
    <div ref={host} style={{ display: message ? "none" : "block", minHeight: 430 }} />
  </div>;
}
