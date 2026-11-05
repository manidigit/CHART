# CHART API Specification — v1

Status: implementation baseline. PHP 8.3 + MariaDB. All timestamps are UTC ISO-8601 with milliseconds where available. All prices are decimal strings to avoid binary floating-point loss.

## Common envelope
- Success: { "api_version": "v1", "data": ... }
- Error: { "error": "stable_machine_code" }
- Clients must not infer missing provider identity, price basis, quality, or freshness.

## Instrument catalog

GET /api/v1/instruments?q=&market_type=&limit=

- q searches instrument ID, display name and TradingView symbol.
- market_type filters by SPOT, FUTURES, CFD, FOREX, CRYPTO, EQUITY or INDEX.
- limit defaults to 200; maximum 500.
- Results are ordered with the primary/default instrument first, then display name.
- SPOTBRENT is the default initial selection. The API catalog itself is extensible; it is not restricted to seeded rows.
- Catalog entries without verified market-data mappings may be discoverable, but must report status and must not be presented as live data.

## Read endpoints
- GET /api/v1/health
- GET /api/v1/instruments
- GET /api/v1/instruments/{instrumentId}/candles?timeframe=M15&limit=500
- GET /api/v1/instruments/{instrumentId}/snapshot
- GET /api/v1/instruments/{instrumentId}/forecasts
- GET /api/v1/jobs/market-data-status

## Instrument identity

Each distinct market instrument has its own instrument ID and market_type. Brent Spot, Brent Futures, WTI Futures, CFDs, XAUUSD Spot, Gold Futures, crypto pairs and equities are separate catalog entries and separate time series. Similar underlying assets are not interchangeable. Multiple provider mappings may belong to one instrument only after equivalence of instrument definition, price basis and session calendar is verified.

## Candle contract

Each candle includes open/close UTC, OHLC decimal values, volume and volume_type, quality_status, is_closed, provider_code, provider_symbol, and price_basis. Only closed candles are returned by the initial endpoint. The unique identity is instrument + source + timeframe + candle-open timestamp.

## Governance
- No client connects directly to MariaDB.
- No provider credentials are returned.
- No write, order, broker-account, balance, position, or transaction endpoints are part of this API.
- Synthetic preview data must never be persisted as market candles or returned as verified market data.
- API DTO changes require a versioned contract update and parity tests for Web and Android.
