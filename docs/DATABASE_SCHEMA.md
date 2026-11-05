# CHART MariaDB Schema

The initial migration is backend/database/migrations/001_shared_platform.sql.

Core entities:
- instruments: extensible instrument catalog; each Spot, Futures, CFD, Forex, Crypto, Equity or Index series has its own stable identity and market_type.
- market_data_sources: provider symbol, provider instrument type, price basis and volume type; each mapping remains TO_VERIFY until tested. Multiple sources for one instrument require equivalence checks.
- candles: source-specific OHLC observations with a unique key by instrument/source/timeframe/open timestamp.
- analysis_snapshots: server-generated indicator and analysis payloads with candle cutoff and version.
- forecasts: immutable forecast payloads with model/version/cutoff metadata.
- worker_jobs: bounded queue with retry count, lease and failure reason.

The initial seed contains XAUUSD Spot and Brent Spot. Brent Spot (SPOTBRENT) is marked as the default initial instrument. Additional instruments are added as catalog records with their own provider mappings; related instruments are never merged.

Apply migration only after backing up an existing database. Seed data creates instrument identities only; it intentionally does not create source mappings or synthetic candles.
