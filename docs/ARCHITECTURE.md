# CHART — Architecture & System Design

> **Document Status:** Official Architectural Specification  
> **Target Version:** 1.28+  
> **Master Reference:** [CHART_INTELLIGENCE_MASTER_SPEC.md](./CHART_INTELLIGENCE_MASTER_SPEC.md)

---

## 1. Architectural Philosophy

CHART is engineered as a modular, extensible, multi-horizon financial charting and analytics platform for both **Android Native (Kotlin/Compose)** and **Responsive Web (ES6+ / PHP / MariaDB)**.

The software architecture is governed by five core principles:
1. **Separation of Concerns:** Strict isolation between presentation (UI), coordination/state, business domain algorithms, and data persistence.
2. **Modularity & High Cohesion:** Each algorithmic calculation, provider adapter, and UI component lives in its own dedicated, focused file.
3. **Loose Coupling:** Components interact via typed models, unambiguous interfaces, and contract definitions, never through direct internal state mutation.
4. **Zero Hardcoding:** Colors, algorithm parameters (zoom step, history limits, touch tolerance), and symbol definitions are decoupled into configuration defaults and runtime user customization.
5. **Simplicity over Overengineering:** No unnecessary bundlers or complex microservices. Web uses native ES modules; Android uses standard Jetpack Compose MVVM.

---

## 2. Layered Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Presentation Layer (UI)                         │
│  • 4-Tab TradingView Architecture (Watchlist, Chart, Prediction, Set.) │
│  • 5-Layer Chart Workspace (48dp Header + 85% Canvas + 46dp Bottom Bar)│
│  • Android: Jetpack Compose full-viewport canvas & modal BottomSheets  │
│  • Web: Desktop terminal layout & mobile touch-locked workspace        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Events & Actions
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       State & Coordination Layer                       │
│  • Android: MainViewModel + Focused State Coordinators                 │
│  • Web: Reactive Store (AppState) + Event Controllers                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Pure Data Calls
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       Domain & Algorithms Layer                        │
│  Deterministic, pure business calculations (No UI / No DB dependencies)│
│  • TimeframeAggregator: Exact OHLCV aggregation (M15 ➔ H1/H4/D1)       │
│  • DrawingGeometry: Market-coordinate anchoring, color/width & hit test│
│  • TechnicalAnalytics: SMA (20), ATR (14), Classic Pivots, Sentiment   │
│  • PriceFormatter: Signed diff/pct, compact volume & date range bounds │
│  • CandleValidator: Strict timestamp alignment & decimal sanitization  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Data Queries & Sync
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Data & Persistence Layer                        │
│  • Provider Adapters: TvDatafeed, Twelve Data, Dukascopy, Yahoo, EIA   │
│  • Identity & Recovery: Unified PHP `auth.php` + Owner Credentials     │
│  • Local Storage: SharedPreferences (Android) / LocalStorage (Web)    │
│  • Remote Backend: PHP REST API (`/api/v1/`) + MariaDB Database       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Directory Structure & Responsibilities

### 3.1 Android Codebase (`app/src/main/java/es/manico/chartintelligence/`)
```
├── algorithms/                 # Pure mathematical & financial algorithms
│   ├── CandleValidatorAlgorithm.kt
│   ├── DrawingGeometryAlgorithm.kt
│   ├── PasswordHashAlgorithm.kt
│   ├── PriceFormatterAlgorithm.kt
│   ├── TimeframeAggregatorAlgorithm.kt
│   └── UtcTimeAnchorAlgorithm.kt
├── config/                     # Central application configuration & keys
│   └── AppConfig.kt
├── data/
│   ├── model/                  # Data classes (CandleBar, SymbolConfig, ChartPreferences)
│   └── repository/             # WorkspaceRepository (Local + Server sync)
├── providers/                  # External data provider adapters
│   ├── CandleProviderAdapter.kt
│   ├── DukascopyAdapter.kt
│   ├── EiaBenchmarkAdapter.kt
│   ├── TvDatafeedAdapter.kt
│   ├── TwelveDataAdapter.kt
│   └── YahooFinanceAdapter.kt
└── ui/
    ├── components/             # Reusable composables (CandlestickCanvas, ThemeSelector)
    ├── screens/                # Top-level screen views (Watchlist, ChartView, Prediction, Settings, Login)
    ├── state/                  # MainViewModel and Reactive UI State
    │   └── coordinators/       # Focused UI mutation coordinators
    │       ├── ChartDrawingCoordinator.kt
    │       ├── ChartPreferenceCoordinator.kt
    │       └── SymbolCatalogCoordinator.kt
    └── theme/                  # Material 3 tokens, financial palette, typography
```

### 3.2 Web Codebase (`host_subdomain/`)
```
├── api/v1/                     # PHP REST API backend
│   ├── algorithms/             # Shared server-side candle aggregation & validation
│   ├── core/                   # MariaDB connection & JSON response helpers
│   ├── providers/              # Server-side provider adapters (TvDatafeed, TwelveData, Dukascopy, EIA, Yahoo)
│   ├── auth.php                # Unified owner registration, login, Google sync & email password recovery
│   └── candles_sync.php        # Synchronizes up to 5,000 closed candles per timeframe to MariaDB
├── scripts/                    # Python & PHP CLI data extraction workers
│   ├── sync_tvdatafeed.py      # Extracts up to 5,000 PEPPERSTONE:SPOTBRENT candles (15m, 1h, 4h, 1d) via tvdatafeed
│   └── cron_sync_tvdatafeed.php# Cron helper that runs sync_tvdatafeed.py and batch-upserts into MariaDB
├── assets/
│   ├── css/
│   │   └── theme.css           # Design tokens, desktop layout, and mobile touch styles
│   └── js/
│       ├── algorithms/         # Pure ES6 calculation modules (Drawing, Timeframe, Price)
│       ├── components/         # Canvas rendering engine (chartRenderer.js)
│       ├── controllers/        # Chart interaction & touch/pinch controllers
│       ├── core/               # Reactive store and i18n manager
│       ├── services/           # HTTP API client services
│       ├── views/              # View components (Header, ToolRail, Watchlist, Settings, Analysis)
│       └── app.js              # Application entry point and event delegation
├── i18n/                       # Translation dictionaries (fa.json, en.json)
└── index.html                  # Lightweight HTML shell
```

---

## 4. Extension Guides (How-To)

### 4.1 How to Add a New Algorithm
1. Create a dedicated module in `algorithms/` (e.g., `RsiAlgorithm.kt` in Android and `rsiAlgorithm.js` in Web).
2. The algorithm function must be **pure**: taking input series (candles, prices) and returning calculated numeric values.
3. It must not reference UI frameworks (`Compose`, `DOM`, `Canvas`) or database APIs.
4. Add corresponding unit tests in `Phase1AlgorithmsTest.kt` (Android) and `tests/` (Web).

### 4.2 How to Add a New Data Provider
1. Define the provider ID in `ProviderId` enum (`ProviderId.kt` / `providers.js`).
2. Implement the provider adapter implementing the standard fetch contract (`CandleProviderAdapter`).
3. Handle rate limits and error mapping cleanly without throwing unhandled exceptions.
4. Add the provider to the allowed providers list in `SymbolConfig`.

### 4.3 How to Add a New Market Symbol
- Users can define custom symbols dynamically in the **Settings** screen at runtime.
- For bundled symbols, declare the entry in `AppConfig` and register localized display titles in `strings.xml` and `fa.json`/`en.json`.

---

## 5. Security & Sensitive Credentials
- **No secrets in code:** API keys, database credentials, and tokens must never be committed to Git.
- Android retrieves secrets via `BuildConfig` (injected at build time via Secrets environment variables).
- Web backend stores credentials in environment variables or protected configuration outside the web document root.
