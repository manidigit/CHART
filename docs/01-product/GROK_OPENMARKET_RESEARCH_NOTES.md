# GROK_OPENMARKET_RESEARCH_NOTES

**Author:** Grok (xAI)  
**Date:** 2026-11-10 (Updated: 2026-11-12)  
**Purpose:** Research notes on OpenMarket architecture patterns, Free/Freemium market data providers, and Open-Source AI/ML models (`Kronos`, `SMC`) relevant to Chart Intelligence.

**Implementation Status Snapshot:**  
- **Already Implemented in Codebase:** `biquote` adapter (`BiquoteAdapter.php` / `BiquoteAdapter.kt`), `stooq` EOD adapter (`StooqAdapter.php` / `StooqAdapter.kt`), 22-symbol asset-class priority chains, BYOK keys isolation (`X-Provider-Api-Key`), core `SMC` (`BOS/CHoCH`, `EQH/EQL`, `FVG`) and estimated `Session Volume Profile (VRVP)`.  
- **Future Phases / Open Backlog:** Real tick/orderbook WebSocket feed, true trade-derived Footprint/CVD/Heatmap, Python worker + `Kronos` Foundation Model (`Phase 4`), and AI Agent / MCP interface.

**Primary sources (official):**
- https://openmarket.xyz/
- https://openmarket.xyz/docs/introduction (Data API)
- https://openmarket.xyz/docs/quickstart
- https://openmarket.xyz/docs/ws/overview (WebSocket)
- https://openmarket.xyz/learn/order-flow
- https://openmarket.xyz/learn/indicators
- https://openmarket.xyz/wrun/getting-started/introduction (wrun language)
- https://openmarket.xyz/learn/faq/api-agents/connect-an-ai-agent (MCP / AI agents)
- https://openmarket.xyz/learn/faq/data-symbols/where-does-the-data-come-from.md
- https://openmarket.xyz/learn/getting-started/plans-and-limits.md
- https://mcp.openmarket.xyz/

---

## 1. Data Access (Highest Priority for Chart Intelligence)

### How OpenMarket does it

OpenMarket records **tick-by-tick** trades from exchanges (the finest granularity) and aggregates order flow + liquidity across 20+ venues itself.

- **Unified REST API**: All historical / point-in-time queries go through a single endpoint:
  - `GET https://api.openmarket.xyz/v1/points`
  - Authentication: header `X-OpenMarket-Key: <API_KEY>`
  - The `type` parameter selects the data kind.

**Important data types (`type` parameter):**

| Data Type                  | `type` parameter                      | Notes / Weight |
|---------------------------|-------------------------------------|----------------|
| OHLCV Candles (combined)  | `TRADE_SIDE_AGNOSTIC_AGG`           | 1x, most common |
| Candles (buy/sell separate)| `TRADE_AGG`                         | 1x             |
| Open Interest             | `OPEN_INTEREST_AGG`                 | 1x             |
| Funding Rate              | `FUNDING_RATE_AGG`                  | 1x             |
| Liquidations              | `LIQUIDATION_AGG`                   | 1x             |
| Volume Profile            | `VOLUME_PROFILE_AGG`                | 2x             |
| TPO / Market Profile      | `TPO_AGG`                           | 5x             |
| Orderbook Heatmap         | `BLOCK_BOOK_SNAPSHOT_AGG`           | 10x            |
| Liquidation Heatmap       | `HYPERLIQUID_LIQUIDATION_AGG`       | Advanced+      |
| TP/SL Trigger Heatmap     | `HYPERLIQUID_TRIGGER_LIQUIDITY_AGG` | Advanced+      |

**Common query parameters:**
- `exchange` (repeatable for multi-venue)
- `rawSymbol` or `coin`
- `interval` (`MINUTE`, `HOUR`, `DAY`, etc. — also supports seconds in newer versions)
- `from` (Unix seconds) + `period` (duration in seconds) — both required for time-range queries
- Transform options: `transform.groupBy.type=GROUP_BY_TYPE_SUM`, `transform.normalize.quote=USD`

**Response shape (always the same):**
```json
{
  "series": [
    {
      "id": { "type": "...", "exchange": "...", "rawSymbol": "...", "normalizedSymbol": "...", "interval": "...", "coin": "..." },
      "points": [ { "Point": { ... } } ]
    }
  ]
}
```
Timestamps use `{ "s": <unix_seconds>, "ns": <nanoseconds> }`.

**WebSocket (live):**
- Separate endpoints for book vs non-book data.
- Channels: `TRADE`, `TRADE_AGG`, `BLOCK_BOOK_SNAPSHOT`, `LIQUIDATION`, `FUNDING_RATE`, `OPEN_INTEREST`, `VOLUME_PROFILE_AGG`.
- Auth via `public/authenticate` then `public/subscribe`.
- Supports compression (brotli).

**Data origin statement (official FAQ):**
> OpenMarket records market data tick by tick: every trade as it prints, the finest granularity there is. Its market data engine aggregates real-time order flow and liquidity across more than 20 venues. CME futures carry official CME Group data.

### Recommendations for Chart Intelligence

1. Design a **single Adapter interface** that normalizes any provider into a common schema (OHLCV + optional order-flow fields + metadata). *(Implemented)*
2. Prefer tick-level or high-resolution sources when possible, then build our own candles / profiles so we control gap-filling and quality.
3. Store source metadata per `chart_id` (venue, symbol, price basis, quality flags, last successful fetch). *(Implemented via `InstrumentSpec`)*
4. Support both REST historical + WebSocket (or polling) live updates. *(REST polling implemented; live WebSocket tick stream remains in [`OPEN_ISSUES.md`](../03-roadmap-and-issues/OPEN_ISSUES.md))*
5. Allow multiple channels per `chart_id` and never silently merge different sources. *(Implemented)*
6. API keys / BYOK should be supported from day one for paid providers. *(Implemented)*

**Key files / endpoints to study further:**
- https://openmarket.xyz/docs/introduction
- https://openmarket.xyz/docs/rest/candles
- https://openmarket.xyz/docs/ws/overview
- https://openmarket.xyz/docs/ws/trades

---

## 2. Structure Analysis & Order Flow Tools

### How OpenMarket does it

They treat order flow as first-class data derived from the same tick stream:

| Goal                                      | Tool                          | Location                  |
|-------------------------------------------|-------------------------------|---------------------------|
| Who controlled each candle                | Footprint                     | Indicator or chart type   |
| Value acceptance / rejection over time    | TPO / Market Profile          | Indicator                 |
| Resting liquidity right now               | Orderbook Heatmap             | Top-bar Heatmap button    |
| Live book order-by-order                  | Orderbook panel + DOM         | Right sidebar / widgets   |
| Aggressive market orders                  | Tape (Time & Sales)           | Workspace widgets         |
| Net buying vs selling pressure            | CVD + Delta                   | Indicators                |

Everything is calculated from actual trades and book snapshots, **not** guessed from candle color.

### Recommendations for Chart Intelligence

- Treat Footprint / Volume-at-Price / CVD / Delta as **high-value features** for the Prediction Engine (structure + pressure).
- Start with a lightweight version:
  - Volume Profile (simple OHLC-estimated VRVP already shipped; label remains `"Estimated"`)
  - Cumulative Volume Delta (CVD) *(Future)*
  - Basic imbalance detection (`FVG / BOS` shipped)
- Later add full Footprint if needed.
- Do **not** make the core prediction depend on heavy 4K heatmaps; keep them as optional enrichment.
- Store these features alongside candles for each `chart_id` so the Adaptive loop can learn from them.

**Key sources:**
- https://openmarket.xyz/learn/order-flow
- https://openmarket.xyz/learn/order-flow/footprint
- https://openmarket.xyz/learn/order-flow/tpo

---

## 3. Indicators

### How OpenMarket does it

Two categories:
1. **Classic indicators** (RSI, MACD, MA, Bollinger, etc.) — unlimited, open-source `wrun` scripts.
2. **Data indicators** (Funding, OI, Liquidations, Footprint, Heatmap, community scripts) — slot-limited.

**`wrun` language (core innovation):**
- TypeScript-like syntax (AssemblyScript dialect), compiled to WebAssembly in browser sandbox.
- Lifecycle: `onStart()` once before first bar, `onBar()` once per bar, persistent state between bars, live updates re-run forming bar.
- Access to order book, tape, liquidations, ~78 built-in TA functions.
- **Kata** (built-in AI) writes/fixes/ports indicators from natural language.

### Recommendations for Chart Intelligence

- Do **not** build a full `wrun` clone in v1.
- Focus on deterministic client/server feature calculation, clear separation of classic TA vs order-flow features, and frozen/versioned feature definitions for immutable predictions.

**Key sources:**
- https://openmarket.xyz/learn/indicators
- https://openmarket.xyz/wrun/getting-started/introduction
- https://openmarket.xyz/wrun

---

## 4. Full Web Version / Terminal Architecture

- Browser-first modular workspace (OpenMarket supports up to 16 charts, workspace persistence, sync toggles).
- For Chart Intelligence: focus on clean `chart_id` workspace, honest status panels, and lightweight execution rather than bloated widget bloat.

---

## 5. AI Agent Support (Natural Language Chart Control)

- OpenMarket exposes `https://mcp.openmarket.xyz/` with tiered permission levels (read-only, read + chart control, trade limited, alerts).
- Future Chart Intelligence direction: natural-language explanation (`"why did the model say this?"`, `"show last 10 outcomes"`) and optional read-only/config MCP scopes in later phases.

---

## Summary Table for Implementers

| Area              | OpenMarket Pattern                          | Priority for Chart Intelligence | Current Codebase Status / Action |
|---|---|---|---|
| Data Access       | Tick → aggregate, unified `/v1/points` API  | Critical                        | Multi-provider adapter & `InstrumentSpec` shipped; live tick WS open |
| Order Flow        | Footprint, CVD, Heatmap from real trades    | High (features)                 | Estimated VRVP & FVG shipped; true CVD/Footprint future |
| Indicators        | Classic vs data slots + wrun/WASM           | Medium                          | Pure deterministic TS/Kotlin TA modules active (`TA-Lib` remaining in backlog) |
| Web Terminal      | Browser-first, multi-chart modular          | Medium (UI)                     | Multi-tab workspace & TradingView theme shipped |
| AI Agents         | MCP server + permission levels              | Future                          | Deferred to Phase 4+ |

---

## Notes & Caveats

- OpenMarket is a charting + order-flow terminal, **not** a prediction engine. Our core differentiator is immutable forecasts + outcome loop + adaptive learning per `chart_id`.
- CME data has special licensing constraints.

---

## 6. Free & Freemium Market Data APIs Evaluation & Fallback Matrix

**تاریخ ارزیابی:** 2026-11-11  
**هدف:** ارزیابی و اولویت‌بندی منابع دیتای رایگان/فریمیوم جهت پشتیبانی از کندل‌های تاریخی `OHLC` (به‌ویژه `M15`, `H1`, `H4`, `D1`).

1. **`biquote.io` (رتبه ۱ — پیاده‌سازی‌شده):** کاملاً رایگان بدون API Key، نرخ بالا، کندل‌های `1m..1D` تا ۱۰۰۰ کندل + WebSocket. در `BiquoteAdapter` فعال است.
2. **`Stooq` (رتبه ۲ — پیاده‌سازی‌شده برای `D1/W1`):** خروجی CSV رایگان برای فارکس، فلزات، انرژی و سهام. در `StooqAdapter` فعال است (تایم‌فریم درون‌روزی محدود و عمدتاً مناسب EOD است).
3. **`Alpha Vantage` (رتبه ۳ — کاندید Fallback با کلید BYOK):** ۲۵ درخواست رایگان در روز؛ ورودی کلید BYOK در Settings آماده است، آداپتور مستقل در بک‌لاگ.
4. **`Finnhub` (رتبه ۴ — Quote و اخبار زنده سهام آمریکا):** ۶۰ فراخوانی/دقیقه رایگان؛ ورودی کلید BYOK در Settings آماده است، آداپتور اخبار/Quote زنده در بک‌لاگ.
5. **سایر موارد بررسی‌شده:** `AlgoSpecial`, `Polygon.io`, `FMP`, `EODHD`.

### ماتریس اولویت‌بندی منابع داده بر اساس طبقه دارایی:

| طبقه دارایی | منبع اول (`Primary`) | منبع دوم (`Secondary`) | منبع سوم (`Tertiary / Backup`) |
|---|---|---|---|
| **طلا (`XAUUSD`)** | Twelve Data (`twelve_data`) | biquote (`biquote`) | Dukascopy / Stooq / Yahoo Finance |
| **نقره (`XAGUSD`)** | biquote (`biquote`) | Twelve Data (`twelve_data`) | Yahoo Finance / Dukascopy |
| **نفت برنت (`SPOTBRENT`)** | TradingView (`tvdatafeed`) | Dukascopy (`dukascopy`) | biquote / Stooq / EIA Spot / Yahoo Finance |
| **نفت WTI (`USOIL`)** | TradingView (`tvdatafeed`) | Yahoo Finance (`yahoo_finance`) | biquote / Twelve Data / Stooq |
| **کریپتو (`BTCUSD`, `ETHUSD`)** | biquote (`biquote`) | Yahoo Finance (`yahoo_finance`) | Twelve Data / Stooq |
| **شاخص‌ها (`SPX500USD`, `NDQ`)** | Yahoo Finance (`yahoo_finance`) | TradingView (`tvdatafeed`) | Twelve Data / Stooq |
| **سهام آمریکا (`NVDA`..`SAN`)** | Yahoo Finance (`yahoo_finance`) | Twelve Data (`twelve_data`) | Stooq / TradingView (و Finnhub در بک‌لاگ) |

---

## 7. Open-Source AI/ML Models & SMC Research Benchmarks Evaluation

1. **`Kronos` — مدل پایه باز پیش‌بینی کندل‌های K-Line (رتبه ۱ — بسیار بالا):** مقاله AAAI 2026 (`@yxl44`). پیش‌آموزش روی ۱۲B+ کندل از ۴۵ صرافی با Tokenizer دو لایه (Mini 4.1M, Small 24.7M, Base 102M). کاندید اصلی **فاز ۴ (`Prediction Engine v1`)**.
2. **استراتژی `Fibonacci + FVG + BOS` (رتبه ۲ — بالا):** ترکیب BOS + FVG + فیبوناچی ($0.618, 0.786$) و اکستنشن‌های ($1.272, 1.414, 1.618$). هسته `BOS/FVG` در فاز ۲ پیاده شده و اتصال کامل به `Prediction Engine` در فاز ۴ است.
3. **پرامپت‌های تحلیل تکنیکال و Backtest (رتبه ۳ — متوسط):** الگوی بک‌تست فاز ۶.
4. **سیستم ۶ بات تحقیقاتی Grok / پرامپت‌های فاندامنتال (رتبه ۴ و ۵ — رزرو لایه فاندامنتال آتی).**
