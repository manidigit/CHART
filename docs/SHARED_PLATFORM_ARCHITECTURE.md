# CHART Shared Android + Web Platform Architecture

**Status:** APPROVED — implementation baseline  
**Scope:** Shared market-data and analysis platform for Android and Web  
**Product boundary:** Read-only market analysis and forecasting. No broker-account connections and no trade execution.

## 1. Executive decision

CHART will provide two client applications backed by one logical platform:

- **Web dashboard:** responsive browser application, inspired by OpenStock's information architecture.
- **Android application:** the existing Android client, consuming the same public application API.
- **Shared platform:** market-data ingestion, candle normalization, indicator calculation, forecasting, validation, persistence, and scheduled jobs. Clients render and interact with results; they do not independently decide market truth.

The initial instruments remain the independently identified TradingView instruments `XAUUSD` and `SPOTBRENT`, on M15. Provider symbols and instrument identity must be verified independently; TradingView symbols are identifiers, not data sources.

## 2. Logical architecture

```text
                 ┌──────────────────────┐
                 │     Web Dashboard    │
                 │ Next.js / TypeScript │
                 └──────────┬───────────┘
                            │ HTTPS / REST
                 ┌──────────▼───────────┐
                 │    Android Client    │
                 │ Existing Android app │
                 └──────────┬───────────┘
                            │ HTTPS / REST
                 ┌──────────▼───────────┐
                 │    Shared API Layer  │
                 │ Auth, read APIs, DTO │
                 └──────────┬───────────┘
                            │
             ┌──────────────┼─────────────────┐
             │              │                 │
     ┌───────▼──────┐ ┌─────▼────────┐ ┌──────▼─────────┐
     │ Market Data  │ │ Analysis &   │ │ Forecast and   │
     │ Provider     │ │ Indicators   │ │ Validation     │
     │ Adapters     │ │              │ │ Engine         │
     └───────┬──────┘ └─────┬────────┘ └──────┬─────────┘
             │              │                 │
             └──────────────┼─────────────────┘
                            │
                 ┌──────────▼───────────┐
                 │ Persistence Layer    │
                 │ MariaDB + DuckDB*    │
                 └──────────────────────┘

                 ┌──────────────────────┐
                 │ Scheduled Data Jobs  │
                 │ APScheduler (Python) │
                 └──────────────────────┘
```

`DuckDB*` is proposed for analytical scans/backtest datasets, not as the authoritative multi-client transactional store. MariaDB remains the operational system of record under the current master-spec decision.

## 3. Proposed technology mapping

| Layer | Candidate | Role | Status |
|---|---|---|---|
| Web | Next.js + TypeScript | Dashboard, responsive layouts, routing | PROPOSED |
| Web charts | TradingView Lightweight Charts | Candlesticks, volume, overlays, forecast series | PROPOSED |
| Android | Existing Android client | Native Android UI and chart presentation | Existing code; master spec conflict to reconcile |
| Public API | PHP 8.3 REST API | Shared HTTPS contract for both clients | APPROVED |
| Operational database | MariaDB | Instruments, candles, jobs, forecasts, alerts, audit metadata | Existing master-spec decision |
| Analytics worker | Python CLI Worker | Provider adapters, data quality, indicators, forecast/validation jobs | APPROVED; runtime hosting TO VERIFY |
| Indicators | TA-Lib | Standard technical indicator calculations | PROPOSED; parity tests required |
| Backtesting | vectorbt | Research and vectorized historical evaluation | PROPOSED; not a trading executor |
| Analytical store | DuckDB | Local/worker analytical queries and backtest datasets | PROPOSED; not authoritative transactional DB |
| Scheduler | MariaDB job queue + Cron-invoked bounded Python CLI | Hourly ingestion and downstream processing | APPROVED; cPanel compatibility TO VERIFY |
| Chart data acquisition | Provider adapters | Read-only market data only | Provider per instrument TO VERIFY |

This is a logical single platform. It may contain a PHP API and a Python worker internally; both clients still use one stable API contract. Do not expose provider credentials to either client.

## 4. Hourly M15 ingestion policy

The requested operating cadence is hourly, not tick-by-tick:

1. The scheduler starts one hourly ingestion cycle.
2. For each instrument, the adapter requests the most recent closed M15 candles, including an overlap window (at least the previous 8 candles).
3. The ingestion service validates timestamps, OHLC consistency, duplicates, ordering, price basis, instrument identity, and the provider's own session calendar.
4. Candles are upserted idempotently using a unique key based on instrument, provider/source identity, timeframe, and candle-open timestamp.
5. Missing intervals are classified against that instrument/provider's session calendar. Closed-market intervals are not treated as data loss.
6. Indicators and derived timeframes are recalculated only after candle validation.
7. Forecasts and validation records are generated and stored with model/version/data-cutoff metadata.
8. Both clients read the same latest snapshot and expose its last-update timestamp and data-quality status.

An hourly run must not assume that exactly four new candles always exist. Market closures, provider delays, failed jobs, and corrections can change the count. The overlap/reconciliation window prevents missed candles and makes retries safe.

## 5. Initial dashboard information architecture

### Global shell
- Instrument selector: XAUUSD / SPOTBRENT
- Timeframe selector: M15 initially
- Last successful update, provider/source label, and data-quality status
- Responsive navigation for desktop and mobile

### Main market workspace
- Large candlestick chart
- Volume panel where valid volume exists
- Indicator overlays and sub-panels
- Forecast horizon selector: +15m, +1h, +4h, +1d, subject to current model readiness
- Forecast quantile cone and scenario probabilities, clearly separated from observed prices
- Instrument-specific session markers

### Analysis panels
- Trend state: bullish / bearish / neutral
- Volatility and ATR
- RSI, MACD, moving averages, Bollinger Bands
- Support/resistance as analytical estimates, not trade instructions
- Forecast history and out-of-sample performance
- Data gaps, provider health, and last ingestion result

### Alerts
- Price-level and analytical-condition alerts
- Notification delivery is separate from trade execution
- No order-entry controls, broker balances, positions, or account activity

A heatmap, social sentiment, and broad multi-exchange coverage are not phase-one requirements. They can be considered after reliable XAUUSD/SPOTBRENT data and forecast quality are established.

## 6. Data and API contracts

Initial read endpoints (names illustrative):

- `GET /api/v1/instruments`
- `GET /api/v1/instruments/{id}/candles?timeframe=M15&from=...&to=...`
- `GET /api/v1/instruments/{id}/snapshot`
- `GET /api/v1/instruments/{id}/indicators?timeframe=M15`
- `GET /api/v1/instruments/{id}/forecasts`
- `GET /api/v1/instruments/{id}/validation`
- `GET /api/v1/jobs/market-data-status`
- `GET /api/v1/alerts`

Every response must identify the instrument, provider/source, timeframe, price basis, timestamp convention, last update, and quality state where relevant. Candle and forecast DTOs must be versioned and shared by both clients.

## 7. Security and product boundary

- Market-data-only provider credentials stay server-side in environment secrets.
- No credentials, API keys, or provider secrets in Android or web bundles.
- No Broker Account Connector, trading API, brokerage OAuth, account balance, positions, orders, or transaction-history ingestion.
- No create/modify/cancel order endpoints.
- The system is an analysis and forecasting product; all trading decisions and execution remain outside CHART.

## 8. Repository and implementation sequence

1. Resolve the existing architecture inconsistencies before broad implementation.
2. Define and test the canonical instrument/candle/API contracts.
3. Implement the shared read API and market-data ingestion/reconciliation.
4. Build the web dashboard using Lightweight Charts.
5. Connect the existing Android app to the same API; do not fork calculation logic into the client.
6. Add shared indicator outputs and forecast visualizations.
7. Add automated tests for candle correctness, idempotency, session gaps, API contract parity, and Android/Web display parity.
8. Deploy only after provider access and hosting/runtime requirements are proven.

## 9. Governance conflicts requiring resolution

The current repository contains conflicting architecture declarations:

- The master specification lists Flutter/Dart and Windows in its platform section, while the repository's actual Android implementation is Kotlin + Jetpack Compose.
- The master specification selects PHP 8.3 REST API, MariaDB, shared hosting, and local-first sync. The proposed Python ecosystem (TA-Lib, vectorbt, APScheduler, DuckDB) requires a persistent Python runtime for scheduled processing; ordinary PHP shared hosting may not provide a suitable always-on worker.
- The user has approved **PHP 8.3 + MariaDB + Python Worker**, alongside Android + Web clients. The existing Kotlin/Compose Android implementation is retained.

Approved path: preserve Kotlin/Compose Android, add Next.js Web, use PHP/MariaDB as the shared operational API/store, and run Python as a separate bounded CLI worker. Cron enqueues one idempotent hourly M15 job per primary instrument. cPanel Python compatibility remains a deployment gate; if unsupported, move only the worker to a VPS/managed runtime.

## 10. External projects and license gates

- Lightweight Charts: Apache-2.0 (verify attribution and license obligations for the chosen distribution).
- TA-Lib Python wrapper: BSD-2-Clause.
- skfolio: BSD-3-Clause; not required for the initial two-instrument dashboard.
- CCXT: MIT; crypto exchange API focus, not the initial XAUUSD/SPOTBRENT provider.
- DuckDB: MIT.
- APScheduler: MIT.
- Freqtrade: GPL-3.0 and a trading-bot project; do not embed its execution engine. Its research/evaluation patterns may be studied separately.
- Cryptofeed and vectorbt: license must be confirmed from the exact repository license file and any edition/dependency terms before adoption.

No dependency is approved solely because it appears in the reference list. Review maintenance, license, security, compatibility, runtime, and provider coverage before adding it.

## 11. Acceptance criteria for the first usable release

- Android and Web display the same candle set and same server-generated indicator/forecast values for the same instrument and timeframe.
- A successful hourly cycle reconciles the latest closed M15 candles without duplicates or silent gaps.
- A delayed or failed cycle can be retried safely.
- Every displayed chart identifies its source, price basis, last update, and quality status.
- XAUUSD and SPOTBRENT remain separate series and are never silently merged across providers.
- No broker-account or order-execution capability exists in the product.


## 12. Implementation status

- Master specification updated to approve the hybrid PHP/MariaDB + Python Worker architecture.
- Initial MariaDB migration, read-only PHP API skeleton, bounded Python worker/job queue, and Next.js shell are committed on the feature branch.
- No production provider adapter is enabled; provider mappings remain TO VERIFY and no real candles are seeded.
- The web chart stays in an explicit unavailable state until verified provider candles exist.
- Deployment is blocked pending authentication/rate-limit hardening, MariaDB-version compatibility checks, cPanel Python/Cron proof, and provider-specific data validation.
