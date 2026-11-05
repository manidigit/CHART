"use client";

import { useEffect, useMemo, useState } from "react";
import { CandleChart } from "./components/CandleChart";

type Instrument = {
  id: string;
  display_name: string;
  tradingview_symbol: string;
  market_type: string;
  status: string;
};

const API_BASE = "/api/chart";

const marketTypes = [
  ["ALL", "All markets"],
  ["SPOT", "Spot"],
  ["FUTURES", "Futures"],
  ["CFD", "CFD"],
  ["FOREX", "Forex"],
  ["CRYPTO", "Crypto"],
  ["EQUITY", "Equities"],
  ["INDEX", "Indices"],
];

export default function DashboardPage() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [marketType, setMarketType] = useState("ALL");
  const [apiState, setApiState] = useState<"loading" | "connected" | "unavailable">("loading");

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/instruments?limit=500`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        return response.json();
      })
      .then((payload: { data: Instrument[] }) => {
        if (!active) return;
        const catalog = payload.data ?? [];
        setInstruments(catalog);
        const defaultInstrument = catalog.find((item) => item.id === "SPOTBRENT")
          ?? catalog.find((item) => item.tradingview_symbol === "SPOTBRENT")
          ?? catalog[0];
        setSelected(defaultInstrument?.id ?? "");
        setApiState("connected");
      })
      .catch(() => { if (active) setApiState("unavailable"); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return instruments.filter((item) => {
      const matchesType = marketType === "ALL" || item.market_type.toUpperCase() === marketType;
      const matchesSearch = !term || [item.id, item.display_name, item.tradingview_symbol]
        .some((value) => value.toLowerCase().includes(term));
      return matchesType && matchesSearch;
    });
  }, [instruments, marketType, search]);

  const current = instruments.find((item) => item.id === selected);

  return (
    <main>
      <header>
        <div>
          <h1>CHART INTELLIGENCE</h1>
          <div className="sub">Independent market charts · Responsive Web + Android · Read-only</div>
        </div>
        <div className="toolbar">
          <input
            aria-label="Search instruments"
            placeholder="Search symbol or market…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select aria-label="Market category" value={marketType} onChange={(event) => setMarketType(event.target.value)}>
            {marketTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Instrument" value={selected} onChange={(event) => setSelected(event.target.value)}>
            {filtered.map((item) => (
              <option key={item.id} value={item.id}>
                {item.tradingview_symbol} · {item.market_type}
              </option>
            ))}
          </select>
          <select aria-label="Timeframe" defaultValue="M15"><option>M15</option></select>
        </div>
      </header>
      <div className="sub" style={{ marginBottom: 14 }}>
        {filtered.length} instruments in catalog · Brent Spot (SPOTBRENT) is the initial chart
      </div>
      <div className="grid">
        <section className="panel">
          <h2>{current?.display_name ?? "Market chart"} · M15</h2>
          {apiState === "loading" && <div className="chart-placeholder">Connecting to shared market API…</div>}
          {apiState === "unavailable" && <div className="chart-placeholder">Market API unavailable. No sample prices are shown as live data.</div>}
          {apiState === "connected" && !selected && <div className="chart-placeholder">No instrument matches this search. Clear the search or choose another market category.</div>}
          {apiState === "connected" && selected && <CandleChart instrumentId={selected} />}
        </section>
        <aside className="panel">
          <h2>Selected instrument</h2>
          <div className="metric"><small>Symbol</small>{current?.tradingview_symbol ?? "—"}</div>
          <div className="metric"><small>Market type</small>{current?.market_type ?? "—"}</div>
          <div className="metric"><small>Catalog status</small><span className="status">{current?.status ?? "Not loaded"}</span></div>
          <div className="metric"><small>Data policy</small>Each instrument has its own provider mapping and price history.</div>
          <div className="metric"><small>Forecast</small>Shown only when verified data and model output exist.</div>
        </aside>
      </div>
      <footer>CHART is an analysis product. No broker account connection or order execution.</footer>
    </main>
  );
}
