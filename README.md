# Chart Intelligence (Android · Kotlin & Jetpack Compose)

Independent financial chart analysis, multi-horizon forecast engine, walk-forward validation suite, and market data provider POC workbench implementing `CHART_INTELLIGENCE_MASTER_SPEC.md` (v1.7).

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


## Shared Web + Android Dashboard (in progress)

A responsive Next.js dashboard and shared read-only market API foundation are being added under `web/`. The Android API adapter is `SharedMarketApiClient.kt`.

- Architecture and delivery gates: [CHART_SHARED_DASHBOARD_ARCHITECTURE.md](CHART_SHARED_DASHBOARD_ARCHITECTURE.md)
- Web app: `cd web && npm install && npm run dev`
- Android service base URL: configure Gradle property `CHART_API_BASE_URL` after the shared API is deployed.
- Market-data routes intentionally report unavailable until a verified provider is connected. No demo prices are represented as live data.
