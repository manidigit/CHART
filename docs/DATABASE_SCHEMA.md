# CHART MariaDB Schema

The initial migration is `backend/database/migrations/001_shared_platform.sql`.

Core entities:
- `instruments`: canonical instrument identity, never inferred from ticker text.
- `market_data_sources`: provider symbol, provider instrument type, price basis and volume type; each mapping remains TO_VERIFY until tested.
- `candles`: immutable source-specific OHLC observations with a unique key by instrument/source/timeframe/open timestamp.
- `analysis_snapshots`: server-generated indicator and analysis payloads with candle cutoff and version.
- `forecasts`: immutable forecast payloads with model/version/cutoff metadata.
- `worker_jobs`: bounded queue with retry count, lease and failure reason.

Apply migration only after backing up an existing database. Seed data creates instrument identities only; it intentionally does not create source mappings or synthetic candles.
