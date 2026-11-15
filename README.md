<!--
CHART Intelligence — project landing page
Detailed engineering and operational material: docs/04-development/PROJECT_GUIDE.md
-->

<p align="center">
  <img src="docs/assets/chart-hero.svg" alt="CHART Intelligence — Market analysis, multi-timeframe charts and forecast evaluation" width="100%">
</p>

<h1 align="center">CHART Intelligence</h1>

<p align="center">
  <strong>A modular financial chart analysis platform for web and Android.</strong><br>
  Multi-timeframe market data · Technical analysis foundation · Forecast evaluation roadmap
</p>

<p align="center">
  <a href="https://chart.manico.es"><img src="https://img.shields.io/badge/Web-chart.manico.es-172b3a?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Web application"></a>
  <a href="https://github.com/manidigit/CHART/actions/workflows/build-apk.yml"><img src="https://img.shields.io/badge/Android-APK%20workflow-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Android APK workflow"></a>
  <a href="https://github.com/manidigit/CHART"><img src="https://img.shields.io/badge/Platform-Web%20%7C%20Android-4C6FFF?style=for-the-badge" alt="Web and Android"></a>
  <a href="docs/01-product/CHART_INTELLIGENCE_MASTER_SPEC.md"><img src="https://img.shields.io/badge/Spec-v1.44.0-8B6CEF?style=for-the-badge" alt="Master Spec version 1.44.0"></a>
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#product">Product</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#roadmap">Roadmap</a> ·
  <a href="#data-sources">Data sources</a> ·
  <a href="#documentation">Documentation</a>
</p>

---

## Overview

**CHART Intelligence** is an independent platform for viewing, analyzing, and evaluating probabilistic multi-timeframe financial market charts (`M15`, `M30`, `H1`, `H4`, `D1`, `W1`). The project combines a native Android application (Kotlin / Jetpack Compose) with a modular web terminal (`https://chart.manico.es`), unified through a PHP REST API and MariaDB central core.

The engineering direction prioritizes explicit market-series identity, UTC candle boundaries, holiday-aware data integrity, pure independently testable algorithms, and a strict out-of-sample forecast validation pipeline (`forecast-contract/v1` / spec `v1.3.0`).

> **Project status (Verified `v1.44.0` — 2026-11-15):** **Phases 1, 2, 3, and the Phase 4 Statistical & SMC Forecast Core** are shipped and verified in code across **Web, Android, and PHP Backend**. External GPU Python DL worker deployment and Phases 5–6 remain on the roadmap — see [`OPEN_ISSUES.md`](docs/03-roadmap-and-issues/OPEN_ISSUES.md), [`KNOWN_ISSUES_BACKLOG.md`](docs/KNOWN_ISSUES_BACKLOG.md), and [`ROADMAP_BACKLOG.md`](docs/03-roadmap-and-issues/ROADMAP_BACKLOG.md).

## Product

### Shipped foundation (Web & Android — `v1.44.0`)

- **Cross-Platform Parity (TradingView Pro Standard):** Responsive desktop/mobile web workspace (`host_subdomain`) and native Android Jetpack Compose app sharing the TradingView palettes (`#131722` dark / `#FFFFFF` light), circular vector asset badges for all 22 instruments, and `JetBrains Mono` LTR tabular digits.
- **Unified Top-Bar Workspace (Zero Right-Rail Clutter):** All primary workspace sections—**`Chart`**, **`Forecast` (Forecast Studio / Lab)**, **`Performance`**, **`Watchlist`**, and **`Settings`**—are consolidated directly into the top header bar alongside the **Indicators** button, a clean **`CSV`** export button (redundant `JSON` export button removed), a **Snapshot** camera button, and a minimal **blinking green/red Market Status dot** (`Live` / `Market Closed` without verbose text banners). Theme, language, and account logout live cleanly inside **Settings** without cluttering the chart workspace.
- **Multi-Tab Chart & Complete Phase 2 Studies (`15/15` Indicators + `18` Drawing Tools):**
  - Parallel chart tabs (`${SYMBOL}_${TF}`), 6 timeframes (`15m`, `30m`, `1h`, `4h`, `1D`, `1W`), Heckbert nice-number price scaling (`[Auto] [Log]`), `UTC / Local` time axis, and 11 quick date ranges (`1D..All`).
  - **6 Base + 12 Multi-Anchor Drawing Families:** `HLINE`, `VLINE`, `TREND`, `FIB`, `LONG_POS`, `SHORT_POS`, `AVWAP`, `FRVP`, `Linear Regression Channel`, `Gann Fan`, `Gann Box`, 4-variant `Pitchfork` (`Original / Schiff / Mod Schiff / Inside`), `Fib Time Zone`, `Cyclic Lines`, `Fib Speed Resistance Fan`, `ABCD`, `XABCD`, and `Head & Shoulders` with `Magnet Mode`.
  - **All 15 Core Indicators & SMC Overlays:** `EMA 20/50/200`, `SMA 20/50/200`, `MTF EMA 20`, `Bollinger Bands`, `Supertrend`, `Session VWAP`, `Parabolic SAR`, `Ichimoku Cloud`, `Keltner Channels`, `Donchian Channels`, 4-variant `Pivot Points` (`Standard / Fibonacci / Camarilla / Woodie` with `R1..R4 / S1..S4`), `Killzones`, `BOS/CHoCH`, `EQH/EQL`, `FVG`, `Estimated Session VRVP`, and lower panes (`Volume`, `RSI 14`, `MACD`, `Stochastic`, `ATR 14`, `ADX 14`, `CCI 20`, `Williams %R`, `OBV`, `CMF 20`, `ROC 12`).
- **Phase 3 Data Quality, Holiday-Aware Gap Detection & Encrypted Backup:**
  - Session- and holiday-aware `GapDetector` (`GapDetector.php`, `gapDetector.js`, `GapDetectorAlgorithm.kt`) that distinguishes true feed outages from weekends, daily futures settlement breaks (`21:00–23:59 UTC`), early US holiday closes (e.g., Labor Day), and single-day exchange holidays (Christmas, New Year's Day, Good Friday).
  - Historical data import (`CSV/TSV`, binary `BIFF8 OLE2` `EIA RBRTEd.xls`, `JSON`, manual `OHLC` with strict `ERR_IMAGE_UPLOAD_FORBIDDEN`) and `PBKDF2 + AES-256-GCM` encrypted workspace backup/restore.
- **Phase 4 Forecast Studio / Lab (`forecast-contract/v1` · Spec `v1.3.0`):**
  - 12-model comparison & ensemble engine (`SMC K-Medoids Analogs`, `Naive Persistence`, `ATR Volatility Cone`, `Kalman Filter`, `GARCH(1,1)`, `AR(2)+ETS`, `Gaussian Process`, native `ARIMA(p,d,q)`, `Prophet Approx`, `Recurrent MC Approx`, `TFT Attention Approx`, and remote Python worker bridge).
  - **Multi-Timeframe (`1h` / `4h` / `15m`) Scenario & POC Synchronization:** Localized Volume Profile window per timeframe (`M15: 80 .. D1: 30` bars with ATR-bounded `POC`) and synchronized `SCENARIO_A / B / C` ranking + 10-bar (`40h` on `H4`) lower-timeframe sub-bar anchoring so `1h` and `4h` projections never contradict over shared horizons.
  - **Full-Page Document Scroll & True Toggle Controls:** Document-level scrolling in Forecast Studio for full-page browser screenshot extensions, a dedicated right-hand quantile badge gutter (`q90 / q50 / q10`) preventing candlestick overlap, and a two-state **`✓ / ☐ Apply & View on Chart`** toggle across Web and Android.
- **Bilingual (`fa` / `en`) & BYOK:** Persian (RTL default) and English (LTR), salted SHA-256 owner login with `Remember Me` and 6-digit email OTP recovery, DB-First Delta Sync up to 5,000 candles, and isolated personal API keys (`BYOK` via `X-Provider-Api-Key`).

## Roadmap

The roadmap follows a strict **Build → Install → Practical Test → Owner Approval** gate between phases:

| Phase | Focus | Current State | Details |
|---:|---|---|---|
| 1 | Product foundation, multi-tab charts & 7+1 isolated data providers | **Shipped in code (`v1.35+`)** | [ROADMAP_BACKLOG.md](docs/03-roadmap-and-issues/ROADMAP_BACKLOG.md) |
| 2 | All 15 core indicators (incl. 4-variant Pivots), 18 drawing tools (`Harmonic/Gann/Pitchfork/Cycle/AVWAP/FRVP`), `Symbol Intel` & `Seasonals` | **Shipped in code (`v1.39–v1.41`)** | [ROADMAP_BACKLOG.md](docs/03-roadmap-and-issues/ROADMAP_BACKLOG.md) |
| 3 | Holiday-aware Smart Gap detection, EIA/CSV/BIFF8 imports, `CSV` export & `AES-256-GCM` Backup/Restore | **Shipped in code (`v1.41–v1.44`)** | [ROADMAP_BACKLOG.md](docs/03-roadmap-and-issues/ROADMAP_BACKLOG.md) |
| 4 | Prediction Engine v1 (`SMC K-Medoids` + 11 statistical/approx plugins, MTF `1h/4h` sync, `forecast-contract/v1`, SHA-256 chain) | **Core Shipped in code (`v1.42–v1.44`) · External GPU Worker Optional** | [CHART_INTELLIGENCE_MASTER_SPEC.md](docs/01-product/CHART_INTELLIGENCE_MASTER_SPEC.md) |
| 5 | Live Feedback Loop, `Purged + Embargoed Walk-Forward` governance & `Champion/Challenger` promotion gate | **Core Lifecycle Shipped · Full Promotion Gate Planned** | [CHART_INTELLIGENCE_MASTER_SPEC.md](docs/01-product/CHART_INTELLIGENCE_MASTER_SPEC.md) |
| 6 | Offline Strategy Simulator & Multi-user admin | **Planned** | [TRADING_STRATEGY_SPEC.md](docs/01-product/TRADING_STRATEGY_SPEC.md) |

## Architecture

The repository separates the Android client, Web ES6 modules, PHP REST API, 8 data-provider adapters, and MariaDB migrations:

```mermaid
flowchart TB
    subgraph Clients
      A[Android App<br/>Kotlin · Jetpack Compose]
      W[Web Terminal<br/>Native ES6 Modules]
    end

    subgraph Backend
      API[PHP REST API<br/>DB-First Delta Sync & Forecast API]
      DB[(MariaDB 10.6.28)]
      MIG[SQL Migrations 001..003]
    end

    subgraph MarketData[8 Isolated Data Providers]
      TV[TradingView tvdatafeed]
      BQ[biquote Free Feed]
      TD[Twelve Data]
      DK[Dukascopy]
      YF[Yahoo Finance]
      SQ[Stooq EOD]
      EIA[EIA Brent Spot FOB]
      CSV[Local CSV / XLS Import]
    end

    A --> API
    W --> API
    API --> DB
    MIG --> DB
    API --> TV
    API --> BQ
    API --> TD
    API --> DK
    API --> YF
    API --> SQ
    API --> EIA
    API --> CSV
```

## Data sources

CHART keeps market-series identity explicit (`UNIQUE(chart_id, provider_id, timeframe, open_time_utc)`). Spot, CFD, EOD, and Futures series are strictly isolated and configured per symbol in **Settings**:

| Provider ID | Scope & Role | Default Symbols / Series |
|---|---|---|
| `tvdatafeed` | TradingView sockets & curated seeded archives (`M15..W1`) | `SPOTBRENT`, `USOIL`, `EURUSD` (primary) |
| `twelve_data` | REST API (server secret or `BYOK`) | `XAUUSD` (primary) |
| `biquote` | Keyless multi-asset intraday/daily feed | `XAGUSD`, `BTCUSD`, `ETHUSD` (primary) |
| `yahoo_finance` | US equities, global indices & futures | `SPX500USD`, `NDQ`, `NVDA..SAN` (primary); `BZ=F`, `GC=F` |
| `dukascopy` | Swiss interbank historical feed (`volume=0` weekend filter) | `SPOTBRENT`, `XAUUSD`, `XAGUSD`, `EURUSD` |
| `stooq` | Free multi-year EOD (`D1`/`W1`) CSV feed | Long-term daily/weekly validation & equities |
| `eia_brent_spot` | Official U.S. EIA daily benchmark (`RBRTEd`, 1987–present) | `SPOTBRENT` historical `D1` FOB benchmark |
| `local_csv` | Audited historical file import (`CSV`, `EIA BIFF8 XLS`, `JSON`, manual `OHLC`) | Custom / archival series (`data_import_batches`) |

## Repository layout

All markdown documentation (except this `README.md`) is organized under `docs/`:

```text
.
├── app/                                      # Native Android app (Kotlin, Compose, ForecastEngine, GapDetector, REST + local cache)
├── host_subdomain/
│   ├── api/v1/                               # PHP REST API (auth, candles_sync, workspace_sync, forecast, gap_report, 8 adapters)
│   ├── scripts/                              # Python/PHP tvdatafeed extraction & cron scripts
│   ├── assets/                               # Web Native ES6 modules, forecast engine, algorithms, views & CSS design tokens
│   ├── data/tvdatafeed/                      # Seeded SPOTBRENT candles (M15, H1, H4, D1)
│   ├── i18n/                                 # Web dictionaries (fa.json, en.json)
│   └── migrations/                           # Idempotent MariaDB migrations (001_phase1..003_phase4)
├── docs/
│   ├── README.md                             # Documentation Hub & Role-Based Reading Guide
│   ├── KNOWN_ISSUES_BACKLOG.md               # Tracked & resolved technical issues log (15 Nov 2026)
│   ├── assets/chart-hero.svg                 # Repository hero banner
│   ├── 01-product/
│   │   ├── CHART_INTELLIGENCE_MASTER_SPEC.md # Primary source of truth (product, contracts, formulas, phases)
│   │   ├── CHART_FUTURE_PREDICTION_SPEC_v1.3.0.md # Forecast Studio v1.3.0 specification
│   │   ├── GROK_OPENMARKET_RESEARCH_NOTES.md # Provider & ML architecture research notes
│   │   └── TRADING_STRATEGY_SPEC.md          # Phase 6 offline strategy simulation spec
│   ├── 02-architecture/
│   │   ├── ARCHITECTURE.md                   # Central Core, DB-First Delta Sync, 8 providers & 22 symbols
│   │   ├── DESIGN_WORKSPACE_SPEC.md          # TradingView Pro workspace layout, topbar navigation & tokens
│   │   ├── INFRASTRUCTURE_INVENTORY.md       # Verified cPanel / MariaDB host inventory & limits
│   │   └── SECURITY.md                       # Security policy, zero-secrets & BYOK isolation
│   ├── 03-roadmap-and-issues/
│   │   ├── OPEN_ISSUES.md                    # Verified open bugs, partial implementations & open questions
│   │   └── ROADMAP_BACKLOG.md                # Truthful Shipped Core vs Phase 5–6 backlog
│   └── 04-development/
│       ├── PROJECT_GUIDE.md                  # Code-vs-Spec audit table, secrets registry & CI/CD guide
│       ├── AGENTS.md                         # AI & developer invariants, UI directives & user flow
│       ├── CONTRIBUTING.md                   # Build, test & PR workflow
│       └── CHANGELOG.md                      # Chronological release history (up to v1.44.0)
├── tests/                                    # Node.js parity & Phase 4 forecast test suites
├── .github/workflows/
│   └── build-apk.yml                         # Android APK build + Web/DB cPanel deployment workflow
└── README.md                                 # Project landing page
```

## Documentation

Start at [`docs/README.md`](docs/README.md) for the full reading order by role, or jump directly to:
- **Truthful Current Status & Active Work:** [`KNOWN_ISSUES_BACKLOG.md`](docs/KNOWN_ISSUES_BACKLOG.md) · [`OPEN_ISSUES.md`](docs/03-roadmap-and-issues/OPEN_ISSUES.md) · [`ROADMAP_BACKLOG.md`](docs/03-roadmap-and-issues/ROADMAP_BACKLOG.md)
- **Specs & Architecture:** [`CHART_INTELLIGENCE_MASTER_SPEC.md`](docs/01-product/CHART_INTELLIGENCE_MASTER_SPEC.md) · [`CHART_FUTURE_PREDICTION_SPEC_v1.3.0.md`](docs/01-product/CHART_FUTURE_PREDICTION_SPEC_v1.3.0.md) · [`ARCHITECTURE.md`](docs/02-architecture/ARCHITECTURE.md) · [`DESIGN_WORKSPACE_SPEC.md`](docs/02-architecture/DESIGN_WORKSPACE_SPEC.md)
- **Developer & Ops:** [`PROJECT_GUIDE.md`](docs/04-development/PROJECT_GUIDE.md) · [`CHANGELOG.md`](docs/04-development/CHANGELOG.md) · [`AGENTS.md`](docs/04-development/AGENTS.md) · [`INFRASTRUCTURE_INVENTORY.md`](docs/02-architecture/INFRASTRUCTURE_INVENTORY.md) · [`SECURITY.md`](docs/02-architecture/SECURITY.md)

## Project principles

- **Evidence over assumptions:** Verify the actual repository code before marking any spec item complete.
- **Modularity:** Keep screens, components, providers, and pure math algorithms cleanly separated.
- **Data integrity:** Preserve instrument identity (`chart_id`), UTC timestamps, and `DECIMAL(18,8)` price precision.
- **Security by design:** Never commit secrets or send personal API keys inside shared workspace sync payloads.

---

<p align="center">
  <strong>CHART Intelligence</strong><br>
  <sub>Analyze clearly. Validate continuously. Improve with evidence.</sub>
</p>
