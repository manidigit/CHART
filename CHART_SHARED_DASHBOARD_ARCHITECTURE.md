# CHART Shared Dashboard Architecture

Status: foundation implemented on `feature/shared-web-android-dashboard`.

## Product decision

CHART has one authoritative market-data and analysis service consumed by:
- the existing Android application (Kotlin / Jetpack Compose);
- a responsive web dashboard (Next.js).

The clients must not independently ingest provider data or implement competing versions of official indicators and forecasts. The shared service is authoritative for market candles, data quality, technical analysis, forecast records and refresh metadata.

## Phase-1 scope

- Instruments: TradingView identities `XAUUSD` and `SPOTBRENT` only.
- Base timeframe: M15.
- Refresh target: every 60 minutes.
- Each refresh ingests all newly available **closed** M15 candles since the last accepted timestamp. Four candles per hour is typical during an open session, not a guarantee; sessions, holidays and provider timestamps determine the actual count.
- Never synthesize missing candles, forward-fill prices, or publish incomplete candles as closed.
- Higher chart timeframes may be aggregated from verified M15 candles only when session boundaries and provider calendars permit.
- Forecast horizons: 15 minutes, 1 hour, 4 hours and one trading day.

## Shared service API

The initial Next.js service lives in `/web`. Route handlers run server-side and are the only intended location for provider credentials.

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/health` | Service and market-data readiness |
| `GET /api/v1/instruments` | Canonical instrument identities and policy |
| `GET /api/v1/market/summary` | Latest quote, freshness and session status |
| `GET /api/v1/candles?instrumentId=XAUUSD_SPOT&timeframe=M15&limit=500` | Verified OHLC candles |
| `GET /api/v1/analysis/latest?instrumentId=XAUUSD_SPOT&timeframe=M15` | Canonical indicator and trend output |
| `GET /api/v1/forecasts/latest?instrumentId=XAUUSD_SPOT` | Official forecast records and timestamps |

The first four endpoints have initial route handlers. Until a verified provider is configured, market summary and candle endpoints deliberately return unavailable responses. The UI must show unavailable state rather than fabricated or demo prices.

## Android integration

`SharedMarketApiClient.kt` is the Android read-only API adapter. Configure its base URL at build time using Gradle property `CHART_API_BASE_URL`. Provider credentials must never be stored in Android resources, BuildConfig or client code; credentials remain server-side.

The Android app retains its current local forecast/validation screens. Migration of the official chart and forecast screens to server-authoritative data is a subsequent integration step, after the shared service has a verified provider and deployed URL. Until then, locally generated demonstration candles must not be represented as live provider data.

## Provider selection gates

No provider is selected merely because an API exists or offers a free tier. Verify each instrument independently:
1. exact instrument identity and market type;
2. M15 history depth and paging;
3. closed-candle timestamps, timezone and session calendar;
4. OHLC validity, duplicate/out-of-order timestamps and unexplained gaps;
5. hourly quota, retention, licensing and production terms;
6. consistency between historical and ongoing updates.

Never merge XAUUSD or SPOTBRENT series from different providers without an overlap study, price-basis alignment and explicit instrument identity. Dukascopy `BRENT.CMD/USD` remains a separate CFD and is not a substitute for Pepperstone `SPOTBRENT`.

## Security and product boundary

- Market-data access only.
- No broker account connector, trading API, account balance, positions, orders or transaction history.
- No order placement, modification, cancellation or trade execution.
- Provider secrets are server-only and must never be returned by API responses or written to logs.
- The service exposes analysis and forecasts, not trade execution.

## Delivery sequence

1. Dashboard and API foundation: responsive web UI, explicit unavailable states, API route skeletons and Android API adapter.
2. Provider selection and ingestion: prove one suitable data source per instrument, then persist verified closed M15 candles.
3. Shared analysis: indicators, market regime and forecast endpoints computed once on the service.
4. Android cutover: Android chart and forecast screens consume the same service contract as web.
5. Operational hardening: hourly scheduled refresh, idempotency, monitoring, data-quality alarms and backups.

## Current implementation limits

This branch is a foundation, not a production-ready live market terminal. No provider is configured in the web service, no live market values are returned, no database persistence or hourly scheduler is active, and the web service has not been deployed. These are explicit gates, not features to silently simulate.
