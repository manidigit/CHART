"use client";

import { useEffect, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, CandlestickChart,
  CheckCircle2, ChevronDown, Clock3, Database, Gauge, Layers3, RefreshCw,
  ShieldCheck, Signal, SlidersHorizontal, Sparkles, Waves,
} from "lucide-react";
import type { MarketInstrument } from "@/lib/market";

type SummaryInstrument = MarketInstrument & {
  quote: null;
  lastClosedCandleAt: null;
  freshness: "unavailable";
  message: string;
};

type SummaryResponse = {
  generatedAt: string;
  refreshIntervalMinutes: number;
  status: string;
  instruments: SummaryInstrument[];
  notice: string;
};

const initialInstruments: MarketInstrument[] = [
  { id: "XAUUSD_SPOT", symbol: "XAUUSD", name: "Gold Spot / U.S. Dollar", assetClass: "SPOT", timeframe: "M15", providerStatus: "not_configured" },
  { id: "SPOTBRENT", symbol: "SPOTBRENT", name: "Brent Crude (Spot)", assetClass: "SPOT", timeframe: "M15", providerStatus: "not_configured" },
];

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

export default function DashboardPage() {
  const [selected, setSelected] = useState<MarketInstrument>(initialInstruments[0]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [apiState, setApiState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  async function refresh() {
    setApiState("loading");
    try {
      const response = await fetch("/api/v1/market/summary", { cache: "no-store" });
      const body = await response.json() as SummaryResponse;
      setSummary(body);
      setApiState(response.ok ? "ready" : "unavailable");
      setLastChecked(new Date().toISOString());
    } catch {
      setApiState("unavailable");
      setLastChecked(new Date().toISOString());
    }
  }

  useEffect(() => { void refresh(); }, []);

  const active = summary?.instruments.find((item) => item.id === selected.id);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><CandlestickChart size={21} /></div><div><b>CHART</b><span>INTELLIGENCE</span></div></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          <a className="nav-item active" href="#"><Activity size={17} /> Market overview</a>
          <a className="nav-item" href="#chart"><CandlestickChart size={17} /> Chart analysis</a>
          <a className="nav-item" href="#signals"><Signal size={17} /> Forecast center</a>
          <a className="nav-item" href="#watchlist"><Layers3 size={17} /> Watchlist</a>
          <a className="nav-item" href="#alerts"><Bell size={17} /> Price alerts <span className="nav-count">0</span></a>
        </nav>
        <div className="sidebar-bottom">
          <div className="read-only"><ShieldCheck size={16} /><span>READ-ONLY MARKET DATA</span></div>
          <p>No broker connections.<br />No order execution.</p>
          <div className="profile"><div className="avatar">CI</div><div><b>CHART Workspace</b><span>Independent analytics</span></div></div>
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> Market overview</div>
          <div className="top-actions"><span className="refresh-pill"><Clock3 size={14} /> 60-minute refresh</span><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh data"><RefreshCw size={17} /></button><div className="avatar small">CI</div></div>
        </header>

        <div className="page-heading">
          <div><div className="eyebrow">MARKET INTELLIGENCE TERMINAL</div><h1>Market overview</h1><p>Independent analysis for your selected instruments.</p></div>
          <div className="market-status"><span className={apiState === "ready" ? "status-dot good" : "status-dot warn"} />{apiState === "ready" ? "DATA CONNECTED" : "DATA PROVIDER NOT CONNECTED"}</div>
        </div>

        <section className="instrument-row" id="watchlist">
          {initialInstruments.map((item) => (
            <button key={item.id} className={selected.id === item.id ? "instrument-card selected" : "instrument-card"} onClick={() => setSelected(item)}>
              <div className="instrument-top"><span className="instrument-symbol">{item.symbol}</span><span className="tag">M15</span></div>
              <span className="instrument-name">{item.name}</span>
              <div className="instrument-price">— — —</div>
              <div className="instrument-foot"><span>Quote unavailable</span><span className="muted-dot" /></div>
            </button>
          ))}
          <div className="instrument-card add-card"><div className="add-icon"><SlidersHorizontal size={18} /></div><b>Instrument settings</b><span>Phase 1 · 2 instruments</span></div>
        </section>

        <section className="metrics-grid">
          <Metric label="LAST PRICE" value="—" detail="Waiting for verified feed" />
          <Metric label="24H CHANGE" value="—" detail="Not calculated" />
          <Metric label="MARKET TREND" value="UNAVAILABLE" detail="Requires closed M15 candles" />
          <Metric label="LAST UPDATE" value="—" detail={lastChecked ? new Date(lastChecked).toLocaleTimeString() : "Not checked"} />
        </section>

        <div className="content-grid">
          <section className="panel chart-panel" id="chart">
            <div className="panel-head"><div><div className="panel-kicker">PRICE ACTION</div><h2>{selected.symbol} <span className="subdued">· 15 minute</span></h2></div><button className="select-control">M15 <ChevronDown size={14} /></button></div>
            <div className="chart-placeholder">
              <div className="chart-grid"><span>—</span><span>—</span><span>—</span><span>—</span><span>—</span></div>
              <div className="chart-center"><div className="chart-icon"><CandlestickChart size={25} /></div><b>Waiting for verified market data</b><span>The chart will render after the provider passes symbol, history and M15 quality checks.</span></div>
              <div className="chart-time"><span>15:00</span><span>18:00</span><span>21:00</span><span>00:00</span><span>03:00</span></div>
            </div>
            <div className="chart-legend"><span><i className="legend-line emerald" /> EMA 20</span><span><i className="legend-line blue" /> SMA 50</span><span><i className="legend-line amber" /> VWAP</span><span className="legend-note">Indicators activate with verified candles</span></div>
          </section>

          <section className="panel signals-panel" id="signals">
            <div className="panel-head"><div><div className="panel-kicker">MODEL OUTPUT</div><h2>Forecast center</h2></div><Sparkles size={18} className="accent-icon" /></div>
            <div className="forecast-empty"><div className="forecast-symbol"><Gauge size={22} /></div><b>Forecasts are not yet available</b><p>Predictions remain disabled until verified historical and recent candles are connected.</p></div>
            <div className="horizon-list">{["15 minutes", "1 hour", "4 hours", "1 trading day"].map((h) => <div key={h}><span>{h}</span><b>—</b></div>)}</div>
          </section>
        </div>

        <div className="bottom-grid">
          <section className="panel" id="alerts">
            <div className="panel-head"><div><div className="panel-kicker">MONITORING</div><h2>Price alerts</h2></div><Bell size={17} className="subdued" /></div>
            <div className="empty-row"><Bell size={18} /><div><b>No active alerts</b><span>Alerts can be configured after a verified quote feed is connected.</span></div></div>
          </section>
          <section className="panel">
            <div className="panel-head"><div><div className="panel-kicker">DATA QUALITY</div><h2>Provider status</h2></div><Database size={17} className="subdued" /></div>
            <div className="provider-row"><div><b>{selected.symbol}</b><span>{active?.message ?? "Provider configuration pending."}</span></div><span className="provider-badge pending"><AlertTriangle size={12} /> Pending</span></div>
            <div className="provider-row"><div><b>Refresh policy</b><span>Hourly · closed M15 candles only</span></div><span className="provider-badge ok"><CheckCircle2 size={12} /> Defined</span></div>
            <div className="provider-row"><div><b>Trade execution</b><span>Disabled by architecture</span></div><span className="provider-badge ok"><ShieldCheck size={12} /> Blocked</span></div>
          </section>
        </div>

        <footer><span>CHART INTELLIGENCE · PHASE 1</span><span>Read-only market analytics <i /> {lastChecked ? "API checked" : "API not checked"}</span></footer>
      </section>
    </main>
  );
}
