# GROK_OPENMARKET_RESEARCH_NOTES.md

**Author:** Grok (xAI)  
**Date:** 2026-11-10  
**Purpose:** Detailed research notes on how OpenMarket implements key capabilities that are relevant to Chart Intelligence. These notes are written so that another agent (e.g. Gemini) can understand the patterns, sources, and recommended adaptations for our project.

**Status:** Research / Inspiration only. Not a requirement to copy OpenMarket. Use as reference for design decisions in Data Access, Feature Engineering, Indicators, Web UI, and future Agent layer.

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

**Important data types (type parameter):**

| Data Type                  | type parameter                      | Notes / Weight |
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
- `interval` (MINUTE, HOUR, DAY, etc. — also supports seconds in newer versions)
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

1. Design a **single Adapter interface** that normalizes any provider into a common schema (OHLCV + optional order-flow fields + metadata).
2. Prefer tick-level or high-resolution sources when possible, then build our own candles / profiles so we control gap-filling and quality.
3. Store source metadata per `chart_id` (venue, symbol, price basis, quality flags, last successful fetch).
4. Support both REST historical + WebSocket (or polling) live updates.
5. Allow multiple channels per chart_id and never silently merge different sources.
6. API keys / BYOK should be supported from day one for paid providers.

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

**Footprint** shows bid/ask volume at every price level inside the candle, delta, imbalances, and POC.

**Heatmap** loads many price levels of the book (HD / 4K). Free plan has reduced depth; Plus has full depth.

Everything is calculated from actual trades and book snapshots, **not** guessed from candle color.

### Recommendations for Chart Intelligence

- Treat Footprint / Volume-at-Price / CVD / Delta as **high-value features** for the Prediction Engine (structure + pressure).
- Start with a lightweight version:
  - Volume Profile (simple)
  - Cumulative Volume Delta (CVD)
  - Basic imbalance detection
- Later add full Footprint if needed.
- Do **not** make the core prediction depend on heavy 4K heatmaps; keep them as optional enrichment.
- Store these features alongside candles for each chart_id so the Adaptive loop can learn from them.

**Key sources:**
- https://openmarket.xyz/learn/order-flow
- https://openmarket.xyz/learn/order-flow/footprint (and playbook)
- https://openmarket.xyz/learn/order-flow/tpo

---

## 3. Indicators

### How OpenMarket does it

Two categories:

1. **Classic indicators** (RSI, MACD, MA, Bollinger, etc.)
   - Unlimited on free plan.
   - Implemented as open-source wrun scripts.

2. **Data indicators** (Funding, OI, Liquidations, Footprint, Heatmap, community scripts)
   - Consume “slots”.
   - Free: 3 slots shared across the whole layout.
   - Plus: 10 slots per chart.

**wrun language (core innovation):**
- Syntax is TypeScript-like (actually AssemblyScript dialect).
- Compiled to **WebAssembly** and runs in the browser sandbox.
- Lifecycle:
  - `onStart()` — once, before first bar
  - `onBar()` — once per bar (oldest → newest)
  - State variables persist between bars
  - Live updates re-run only the forming bar from the last closed state
- Has access to order book, tape, liquidations, options, and a built-in TA kit (~78 functions).
- Can declare `param()`, `output()`, alerts, and even strategies (simulated only).
- Publish modes: open-source, compiled (code hidden), protected (runs on their servers).

**Kata** (built-in AI) can write / fix / port indicators from natural language.

### Recommendations for Chart Intelligence

- We do **not** need a full wrun clone in v1.
- Useful patterns:
  - Client-side or pure-Python/Numba feature calculation that is fast and deterministic.
  - Clear separation between “classic technical features” and “order-flow features”.
  - Ability to version and freeze feature definitions (important for immutable predictions).
- Later: consider a simple scriptable feature layer if power users appear.
- Study their open classic indicators as reference implementations of RSI, MACD, etc.

**Key sources:**
- https://openmarket.xyz/learn/indicators
- https://openmarket.xyz/wrun/getting-started/introduction
- https://openmarket.xyz/wrun (full docs + cookbook)

---

## 4. Full Web Version / Terminal Architecture

### How OpenMarket does it

- Primary experience is **browser-based** (no install required).
- Modular workspace with grid layouts up to **16 charts** side-by-side (free).
- Sync options: Crosshair, Symbol, Interval, Time, Drawings.
- Dockable widgets (Orderbook, Tape, Stats, etc.).
- Heavy drawing toolkit (99 tools) with auto-save and multi-chart sync.
- Desktop app (beta, macOS/Linux) and mobile apps share the same core.
- Workspaces are saved (limits: 10 free / 50 Plus).

### Recommendations for Chart Intelligence

- Web-first UI is correct for v1.
- Start with **single chart_id focus** + clear status panel (current trend, active predictions, accuracy history, source health).
- Multi-chart can come later for monitoring several independent series.
- Workspace / settings persistence per chart_id is important from the beginning (source config, feature toggles, prediction horizons).
- Keep the UI lightweight; the value is in the prediction loop, not in competing with TradingView-style charting.

---

## 5. AI Agent Support (Natural Language Chart Control)

### How OpenMarket does it

They expose an **MCP server**:
- URL: `https://mcp.openmarket.xyz/`
- Works with Claude, ChatGPT, Cursor, Codex, Claude Code (free for users).

**Permission levels (chosen at connect time):**
- Read only
- Read + Control charts (change symbol, timeframe, add indicators, draw)
- Read + Control + Trade (limited)
- Alerts & Watchlists

Agent can also read market data (candles etc.) except CME (license restriction).

Additionally they have an internal assistant called **Kata** inside the script editor that writes wrun code from descriptions.

### Recommendations for Chart Intelligence

- Excellent pattern for the future “explain / control” layer.
- In early versions we can expose:
  - Natural-language explanation of current state + active predictions + confidence.
  - Ability to ask “why did the model say this?” or “show me the last 10 outcomes”.
- Later: MCP-compatible or similar agent interface so users can drive the system from Claude / Cursor etc.
- Design permission scopes early (read-only vs can change sources / horizons / feature sets).

**Key sources:**
- https://openmarket.xyz/learn/faq/api-agents/connect-an-ai-agent
- https://mcp.openmarket.xyz/

---

## Summary Table for Gemini / Implementers

| Area              | OpenMarket Pattern                          | Priority for Chart Intelligence | Suggested Action |
|-------------------|---------------------------------------------|---------------------------------|------------------|
| Data Access       | Tick → aggregate, unified `/v1/points` API  | Critical                        | Design Adapter + common schema + source metadata per chart_id |
| Order Flow        | Footprint, CVD, Heatmap from real trades    | High (features)                 | Start with CVD + simple Volume Profile as model features |
| Indicators        | Classic unlimited + slot-based data indicators + wrun/WASM | Medium                          | Lightweight deterministic feature layer; study their classic implementations |
| Web Terminal      | Browser-first, multi-chart modular          | Medium (UI)                     | Single-chart focused UI first + status panels |
| AI Agents         | MCP server + permission levels              | Future                          | Plan for explainability + optional control later |

---

## Notes & Caveats

- OpenMarket is a charting + order-flow terminal, **not** a prediction engine. Their strength is data + visualization + custom scripts. Our core value (immutable forecasts + outcome loop + adaptive per chart_id) is different.
- Free plan has meaningful limits (indicator slots, heatmap depth, history lookback, single device). Design our free/paid boundaries independently.
- CME data has special licensing; agents and API cannot export it in their system.
- Always prefer official docs over third-party reviews when implementing.

**Last updated by Grok & Gemini:** 2026-11-11  
**For questions or deeper dive on any section, continue the conversation.**

---

## 6. Free & Freemium Market Data APIs Evaluation & Fallback Matrix

**تاریخ ارزیابی:** 2026-11-11  
**هدف:** ارزیابی و اولویت‌بندی منابع دیتای رایگان/فریمیوم جهت پشتیبانی از کندل‌های تاریخی `OHLC` (به‌ویژه تایم‌فریم‌های `M15`, `H1`, `H4`, `D1`) برای طلا (`XAUUSD`)، نفت برنت (`SPOTBRENT`)، WTI، کریپتو، شاخص‌ها و جفت‌ارزها.

### ارزیابی منابع دیتای پایه (اولویت‌بندی رتبه‌بندی شده):

1. **`biquote.io` (رتبه ۱ — پیاده‌سازی شده در v1.32.0):**
   - **وضعیت در پروژه:** `METHOD_BIQUOTE_FEED` / `BiquoteAdapter` (منبع فعال رایگان برای طلا، کریپتو و فارکس در نسخه `1.32.0`).
   - **مزایا:** کاملاً رایگان، بدون نیاز به API Key یا ثبت‌نام، نرخ درخواست بسیار بالا (~۱۵,۰۰۰ درخواست در دقیقه per IP)، پشتیبانی مستقیم از `XAUUSD`, `BTCUSD`, `ETHUSD`, `EURUSD` و `SPOTBRENT` در قالب دیتای MetaTrader CFD.
   - **تایم‌فریم‌ها:** کندل‌های ۱ دقیقه‌ای تا ۱ روزه (شامل `15m`, `1h`, `4h`) تا ۱۰۰۰ کندل در هر درخواست + پشتیبانی از WebSocket/SignalR.

2. **`Stooq` (رتبه ۲ — نامزد رزرو تاریخچه بلندمدت و بکاپ):**
   - **وضعیت در پروژه:** نامزد دریافت تاریخچه روزانه عمیق و دانلود دسته‌ای فایل‌های CSV در فاز ۳.
   - **مزایا:** رایگان (با کلید عمومی)، پوشش کامل فارکس، طلا (Gold)، نفت و کامودیتی‌ها، خروجی استاندارد CSV جهت ذخیره مستقیم در MariaDB.
   - **محدودیت:** اینترادی محدود به ۹ ماه ساعتی و ۱ ماه ۵ دقیقه‌ای.

3. **`Alpha Vantage` (رتبه ۳ — Fallback سبک بر پایه API Key):**
   - **مزایا:** فریمیوم کلاسیک، ۲۵ درخواست رایگان در روز.
   - **نقش در سیستم:** پشتیبانی لایه آخر برای استعلام نرخ‌های پایانی یا پشتیبانی رزرو سبک.

4. **`Finnhub` (رتبه ۴ — داده زنده سهام آمریکا و فاندامنتال):**
   - **مزایا:** ۶۰ فراخوانی در دقیقه رایگان.
   - **نقش در سیستم:** مناسب برای Quoteهای زنده و اخبار سهام آمریکا (`NVDA`, `AAPL`, `TSLA`). کندل‌های تاریخی فارکس/کالاها در پلن رایگان قفل است.

5. **سایر منابع بررسی شده (Polygon.io, FMP, EODHD, AlgoSpecial):**
   - **`AlgoSpecial`:** ۶۰ درخواست/دقیقه و ۱۰۰۰/روز رایگان برای `XAUUSD` و FX.
   - **`Polygon.io` / `FMP` / `EODHD`:** محدودیت ۵ درخواست/دقیقه، بیشتر متمرکز بر سهام دسکتاپ.

---

### جدول ماتریس اولویت‌بندی منابع داده بر اساس طبقه دارایی:

| طبقه دارایی | منبع اول (`Primary`) | منبع دوم (`Secondary`) | منبع سوم (`Tertiary / Backup`) |
|---|---|---|---|
| **طلا (`XAUUSD`)** | Twelve Data (`twelve_data`) | biquote (`biquote`) | Dukascopy / Stooq / Yahoo Finance |
| **نقره (`XAGUSD`)** | biquote (`biquote`) | Twelve Data (`twelve_data`) | Yahoo Finance / Dukascopy |
| **نفت برنت (`SPOTBRENT`)** | TradingView (`tvdatafeed`) | Dukascopy (`dukascopy`) | biquote / EIA Spot / Yahoo Finance |
| **نفت WTI (`USOIL`)** | TradingView (`tvdatafeed`) | Yahoo Finance (`yahoo_finance`) | biquote / Twelve Data |
| **کریپتو (`BTCUSD`, `ETHUSD`)** | biquote (`biquote`) | Yahoo Finance (`yahoo_finance`) | Twelve Data |
| **شاخص‌ها (`SPX500USD`, `NDQ`)** | Yahoo Finance (`yahoo_finance`) | TradingView (`tvdatafeed`) | Twelve Data |
| **سهام آمریکا (`NVDA`..`SAN`)** | Yahoo Finance (`yahoo_finance`) | Twelve Data (`twelve_data`) | Finnhub / TradingView |

---

## 7. Open-Source AI/ML Models & SMC Research Benchmarks Evaluation

**تاریخ ارزیابی:** 2026-11-11  
**هدف:** ارزیابی ۵ روش جدید تحقیقاتی، مدل‌های پایه هوش مصنوعی و پرامپت‌های استراتژیک برای سیستم پیش‌بینی و تحلیل ساختار Chart Intelligence:

### ارزیابی تفصیلی روش‌ها:

1. **`Kronos` — مدل پایه باز پیش‌بینی کندل‌های K-Line (رتبه ۱ — بسیار بالا):**
   - **مرجع:** مقاله AAAI 2026 (`@yxl44`).
   - **نحوه کار:** اولین Foundation Model باز تخصصی سری زمانی OHLCV. پیش‌آموزش‌دیده روی بیش از ۱۲ میلیارد کندل از ۴۵ صرافی جهان با Tokenizer دو لایه (Coarse + Fine) در ۳ مدل Mini (4.1M)، Small (24.7M) و Base (102M).
   - **نقش در سیستم:** کاندید اصلی **موتور پیش‌بینی فاز ۴ (`Prediction Engine v1`)** جهت فاین‌تیون متمرکز per `chart_id` و تولید پیش‌بینی‌های Immutable اتورگرسیو.

2. **استراتژی `Fibonacci + FVG + BOS` (رتبه ۲ — بالا):**
   - **مرجع:** پست و ویدیوی آموزشی `@IamMavion`.
   - **نحوه کار:** ترکیبی قطعی از Break of Structure (BOS)، Fair Value Gap (FVG) و ترازهای فیبوناچی ($0.618, 0.786$) برای ورود و اکستنشن‌های ($1.272, 1.414, 1.618$) برای اهداف قیمتی.
   - **نقش در سیستم:** لایه تحلیل خودکار ساختار در فاز ۲ و فاز ۴ (`TechnicalStructureAnalyzer`).

3. **پرامپت‌های تحلیل تکنیکال و Backtest (رتبه ۳ — متوسط):**
   - **مرجع:** `@Theolevi_XAi`.
   - **نقش در سیستم:** الگوی طراحی منطق Backtest و ارزیابی استراتژی در فاز ۶.

4. **سیستم ۶ بات تحقیقاتی Grok / پرامپت‌های فاندامنتال Gemini/ChatGPT (رتبه ۴ و ۵ — پایین در فاز جاری):**
   - **مرجع:** `@JasonL_Capital`, `@IAGenMoney`, `@allen_lattimer`.
   - **نقش در سیستم:** اختصاصی به تحلیل بنیادی، صورت‌های مالی و Sentiment سهام؛ رزرو شده برای فازهای آتی جهت افزوده شدن به عنوان لایه مکمل فاندامنتال.

---

### جدول اولویت‌بندی مدل‌ها و روش‌های تحقیقاتی:

| رتبه | روش / مدل | میزان مفید بودن | نقش اجرایی در Chart Intelligence |
|------|------|------------------|----------------------------------|
| **۱** | **Kronos (AAAI 2026 Foundation Model)** | **بسیار بالا** | مدل اصلی پیش‌بینی اتورگرسیو کندل‌ها در فاز ۴ (`Prediction Engine`) |
| **۲** | **Fibonacci + FVG + BOS (SMC)** | **بالا** | الگوریتم خودکار تحلیل ساختار نقدینگی و پرایس‌اکشن در فاز ۲ و ۴ |
| **۳** | **پرامپت‌های تکنیکال و Backtest** | **متوسط** | الگوی مفهومی طراحی لایه بک‌تست و ارزیابی استراتژی در فاز ۶ |
| **۴** | **سیستم ۶ بات تحقیقاتی Grok** | **پایین (در فاز جاری)** | رزرو فازهای آتی به عنوان لایه مکمل Fundamental / Sentiment |
| **۵** | **پرامپت‌های بنیادی Gemini/ChatGPT** | **پایین (در فاز جاری)** | خارج از هسته چارت‌محور؛ رزرو لایه بنیادی |


