# CHART Shared Web + Android Architecture

**Status:** Approved implementation direction  
**Clients:** Responsive Web + Android only  
**Product boundary:** Independent market-chart analysis and forecasting; read-only market data; no broker-account connection or trade execution.

## 1. Product shape

CHART has two client experiences backed by one data and analysis platform:

- **Web:** the primary responsive interface; works in desktop and Android mobile browsers.
- **Android:** the existing Kotlin + Jetpack Compose application.
- **Windows/Desktop application:** removed from scope. There is no separate Windows client.

Both clients use the same PHP REST API and receive the same candles, indicators, forecasts, validation results, provider metadata and data-quality state.

## 2. Instrument discovery — not a two-symbol application

The product exposes a searchable, categorized instrument catalog. The catalog is extensible and is not hard-coded to the initial symbols.

Initial categories include:
- Spot commodities and metals
- Commodity futures
- CFDs
- Forex
- Crypto spot and (when explicitly supported) other crypto instrument types
- Equities and indices

Examples are distinct instruments, not aliases to be merged:
- Brent Spot (SPOTBRENT)
- Brent Futures (for example, a verified futures symbol/contract)
- WTI Futures
- XAUUSD Spot
- Gold Futures
- BTCUSDT Spot
- Individual equities

Selecting one item opens only that instrument's chart and its own historical series, provider mapping, indicators, forecasts and validation history. Similar names or the same underlying commodity do not make two instruments interchangeable.

**Initial default:** Brent Spot (SPOTBRENT) on M15. This is a settled user decision and must not be asked again. XAUUSD M15 remains another initial catalog item.

A symbol is shown as live/available only when a source mapping and data quality have been verified. If a chart is known but has no usable source, show it as unavailable or awaiting a data source; never silently substitute a related CFD, future, index or other provider's series.

## 3. Reuse before rebuilding

CHART should learn from existing charting terminals and libraries instead of rebuilding commodity functionality:

- Reuse a mature chart renderer (TradingView Lightweight Charts is the current web baseline; evaluate other suitable libraries only when they add a concrete capability).
- Treat chart rendering and market-data acquisition as separate concerns. A chart library is not itself a market-data entitlement or raw-data API.
- Build thin provider adapters around documented APIs and reusable community libraries where their coverage, license, reliability and terms are suitable.
- Use provider fallback only between sources verified for the same instrument definition. Fallback must be visible in chart metadata; never cross-fallback Spot to Futures or CFD.
- Use existing indicator, data-processing, scheduling and backtesting libraries when they pass compatibility and license review. Do not add every referenced repository as a dependency.

## 4. Logical architecture

```text
 Responsive Web (Next.js)       Android (Kotlin / Compose)
             \                    /
              \   HTTPS / REST   /
               Shared PHP 8.3 API
                       |
                    MariaDB
                       |
          Python Worker + Job Queue
                       |
       Instrument-specific Provider Adapters
                       |
    Official/documented market-data APIs and feeds
```

Responsibilities:
- **PHP API:** authentication, instrument catalog/search, read DTOs, access control, rate limiting and audit metadata.
- **MariaDB:** operational system of record for instrument definitions, provider mappings, candles, jobs, analysis snapshots, forecasts and validation.
- **Python Worker:** provider polling, normalization, data-quality checks, indicators, forecasting and validation.
- **Web and Android:** selection, visualization and user interaction. They do not connect to MariaDB or hold provider secrets.

The worker runs as a bounded CLI process from Cron, claims jobs from MariaDB and retries safely. cPanel Python/Cron support remains a deployment check; if inadequate, move only the worker to a separate runtime.

## 5. Provider and chart identity

Every instrument has its own stable internal ID and explicit metadata:
- Market type and instrument class
- Exchange/provider and provider symbol
- Contract/expiry/roll metadata for futures
- Quote currency, units and price basis (Bid/Ask/Mid/Last/unknown)
- Session calendar and timezone
- Supported timeframes and data freshness
- Data quality and provider status

Each source adapter is attached to one instrument mapping. Multiple providers may be listed for the same instrument only after equivalence is checked. A source for Brent CFD is not a fallback for Brent Spot; Brent Futures and WTI Futures remain independent.

Provider API keys remain server-side. Only read-only market-data endpoints are allowed. No broker OAuth, trading account, balances, positions, orders or transaction history.

## 6. Update cadence and data integrity

The requested baseline is hourly reconciliation of closed M15 candles:
1. Enqueue one due job for each enabled instrument/source mapping.
2. Fetch recent closed candles with an overlap window.
3. Validate OHLC, timestamps, duplicates, session gaps, price basis and instrument identity.
4. Upsert idempotently using instrument + source + timeframe + candle-open timestamp.
5. Recompute indicators/forecasts only after accepted data.
6. Publish one shared snapshot for Web and Android.

Do not assume each run always returns exactly four candles. Market closures, delayed providers and corrections require overlap and reconciliation. Synthetic preview data must never enter canonical candles or official forecasts.

## 7. Web and Android experience

- Instrument search and category filters are available from the chart workspace.
- Default selected instrument is SPOTBRENT M15.
- Timeframe selector is independent of instrument selection.
- Every chart displays provider/source, price basis, last successful update and data-quality state.
- Mobile browser layout is first-class: controls wrap, chart remains usable, side panels stack below the chart.
- Android displays the same server-side values and supports the same catalog.

## 8. API baseline

- GET /api/v1/instruments?q=&market_type=&limit=
- GET /api/v1/instruments/{id}/candles?timeframe=M15&limit=500
- GET /api/v1/instruments/{id}/snapshot
- GET /api/v1/instruments/{id}/forecasts
- GET /api/v1/jobs/market-data-status

Every candle response identifies the instrument, source, provider symbol, price basis, timestamp and quality state. API changes are versioned and contract-tested across both clients.

## 9. Delivery sequence

1. Establish instrument catalog and source mapping model.
2. Verify a real M15 data source for SPOTBRENT; it is the first chart to bring online.
3. Render real candles in the Web chart; expose source and quality metadata.
4. Add other instrument families independently as verified sources become available.
5. Connect Android to the same catalog and API.
6. Add analysis, forecasts and validation to the same chart workspace.

## 10. Acceptance criteria

- No Windows or separate desktop client remains in scope.
- Web works on desktop and Android mobile browsers.
- SPOTBRENT M15 is the default instrument; no repeat clarification is requested.
- Users can search and select distinct Spot, Futures, CFD, Forex, Crypto and Equity instruments.
- Instrument identity and data series are never silently substituted or merged.
- Web and Android render the same server-side candles and analysis for the same instrument/timeframe.
- Every chart exposes source, price basis, freshness and quality.
- No broker-account or trade-execution functionality exists.

## 11. Implementation status

The repository currently contains the PHP/MariaDB API scaffold, Python worker scaffold, initial instrument migration and Next.js shell. This is not yet a production deployment. Provider adapters for SPOTBRENT and XAUUSD remain unverified; the next data milestone is a real SPOTBRENT M15 feed, not additional infrastructure.
