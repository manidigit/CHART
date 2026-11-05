# Chart Intelligence (Responsive Web + Android)

Independent financial chart analysis, multi-horizon forecast engine, walk-forward validation suite, and market data provider POC workbench implementing `CHART_INTELLIGENCE_MASTER_SPEC.md` (v1.9).

## Core Modules

1. **Multi-Horizon Forecast Terminal**:
   - Strictly isolated instrument series (`XAUUSD`, `SPOTBRENT`, `BRENT.CMD/USD`, `BTCUSDT`, `REV:BRENT_CFD`, `BZ=F`).
   - Session-aware closed-candle timeframes (`M15`, `M30`, `H1`, `H4`, `D1`) and forecast horizons (`+15m`, `+1h`, `+4h`, `+1d`).
   - Interactive candlestick & `Q10–Q90` quantile forecast cone chart with volatility-adjusted neutral trend threshold (`|ΔP| < k × ATR(period)`).
   - Cryptographic SHA-256 hash-chained immutable prediction ledger.
2. **Historical Walk-Forward Forecast Validation**:
   - Out-of-sample Purged + Embargoed walk-forward evaluation (`Frozen Model` vs `Adaptive Model`).
   - Compares directional accuracy against the 3 mandatory baselines (`Persistence`, `Previous Direction`, `SMA`).
   - Reports `DECIMAL` `MAE`, `RMSE`, multi-class `Brier Score`, `Pinball Quantile Loss`, `Q10–Q90` interval coverage, and Effective Sample Size (`N_eff`).
3. **Market Data Provider POC Lab**:
   - **Twelve Data Smoke Test**: Read-only `15min` verification for `XAU/USD` and `XBR/USD` (`PLAN_RESTRICTED` handling) via `BuildConfig.TWELVE_DATA_API_KEY`.
   - **Dukascopy 6-Probe Historical Audit**: `Bid` and `Ask` inspection for `xauusd` and `brentcmdusd` with trading-session calendar gap classification.
   - **Binance Spot Live API**: Public `/api/v3/klines` closed M15 candle ingestion for `BTCUSDT`.
4. **Manual OHLC & Zero-Storage Ephemeral Chart OCR**:
   - Supports `Brent CFD – Revolut` and API-restricted instruments via manual `DECIMAL` entry and on-device ephemeral image extraction (images are immediately purged in compliance with Section 5.3).


## Shared Web + Android Platform (in progress)

The approved product has only two clients: a responsive Next.js/TypeScript Web dashboard (desktop and Android mobile browsers) and the existing Kotlin/Jetpack Compose Android app. There is no Windows or separate desktop application. Both clients use the PHP 8.3 REST API + MariaDB + separate Python Worker.

- Architecture: `docs/SHARED_PLATFORM_ARCHITECTURE.md`
- API contract: `docs/API_SPECIFICATION.md`
- Database schema: `docs/DATABASE_SCHEMA.md`
- MariaDB migration: `backend/database/migrations/001_shared_platform.sql`
- PHP API: `backend/public/index.php`
- Python Worker: `worker/`
- Web dashboard: `web/`

This is an implementation scaffold, not a production deployment. No SPOTBRENT/XAUUSD provider adapter is enabled yet; provider mappings remain TO VERIFY. The migration seeds instrument identities only and intentionally inserts no synthetic market candles. Do not expose the API until a production authentication/session strategy, rate limiting, and hosting compatibility have been verified.
