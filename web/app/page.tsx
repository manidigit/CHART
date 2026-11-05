"use client";

import { useEffect, useState } from "react";
import { CandleChart } from "./components/CandleChart";

type Instrument = {
  id: string;
  display_name: string;
  tradingview_symbol: string;
  market_type: string;
  status: string;
};

const API_BASE = "/api/chart";

export default function DashboardPage() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selected, setSelected] = useState("");
  const [apiState, setApiState] = useState<"loading" | "connected" | "unavailable">("loading");

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/api/v1/instruments`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        return response.json();
      })
      .then((payload: { data: Instrument[] }) => {
        if (!active) return;
        setInstruments(payload.data ?? []);
        setSelected(payload.data?.[0]?.id ?? "");
        setApiState("connected");
      })
      .catch(() => { if (active) setApiState("unavailable"); });
    return () => { active = false; };
  }, []);

  const current = instruments.find((item) => item.id === selected);

  return (
    <main>
      <header>
        <div>
          <h1>CHART INTELLIGENCE</h1>
          <div className="sub">Shared market-data and analysis workspace · Read-only</div>
        </div>
        <div className="toolbar">
          <select aria-label="Instrument" value={selected} onChange={(event) => setSelected(event.target.value)}>
            {instruments.map((item) => <option key={item.id} value={item.id}>{item.tradingview_symbol}</option>)}
          </select>
          <select aria-label="Timeframe" defaultValue="M15"><option>M15</option></select>
        </div>
      </header>
      <div className="grid">
        <section className="panel">
          <h2>{current?.display_name ?? "Market chart"} · M15</h2>
          {apiState === "loading" && <div className="chart-placeholder">Connecting to shared PHP API…</div>}
          {apiState === "unavailable" && <div className="chart-placeholder">API not connected. Configure server-side CHART_API_ORIGIN and CHART_API_READ_TOKEN.</div>}
          {apiState === "connected" && selected && <CandleChart instrumentId={selected} />}
        </section>
        <aside className="panel">
          <h2>Market status</h2>
          <div className="metric"><small>API</small>{apiState}</div>
          <div className="metric"><small>Instrument identity</small>{current?.status ?? "Not loaded"}</div>
          <div className="metric"><small>Provider data</small><span className="status">Not yet verified</span></div>
          <div className="metric"><small>Forecast</small>Withheld until verified data and model output exist</div>
        </aside>
      </div>
      <footer>CHART is an analysis product. No broker account connection or order execution.</footer>
    </main>
  );
}
