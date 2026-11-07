# Implementation Plan: CHART — Software Architecture, Engineering Standards & Long-Term Maintainability

An engineering roadmap and architecture specification to transition CHART into a clean, modular, maintainable, and open-source-ready financial charting platform.

---

## 1. Audit Report & Execution Summary

- [x] **Web Modularization (`host_subdomain/assets/js/`):**
  - Successfully decomposed the 1,040-line `app.js` into clean, native ES6 modules under `core/`, `views/`, `controllers/`, and `services/`. Zero external bundler overhead.
- [x] **Android Coordinator Architecture (`app/src/main/java/es/manico/chartintelligence/`):**
  - Created `ChartDrawingCoordinator.kt`, `SymbolCatalogCoordinator.kt`, and `ChartPreferenceCoordinator.kt` under `ui/state/coordinators/`.
  - Refactored `MainViewModel.kt` to delegate domain mutations and state updates to these coordinators.
- [x] **Open-Source GitHub Documentation Standards:**
  - Created root repository standards: `ARCHITECTURE.md`, `CONTRIBUTING.md`, `AGENTS.md`, `SECURITY.md`, and `CHANGELOG.md`.
- [x] **Specification & Guide Synchronization:**
  - Synchronized `CHART_INTELLIGENCE_MASTER_SPEC.md` (v1.24, 2026-11-07), `docs/PROJECT_GUIDE.md`, `INFRASTRUCTURE_INVENTORY.md`, `TRADING_STRATEGY_SPEC.md`, and `README.md`.
- [x] **Automated Testing & Compilation:**
  - `compile_applet` passed cleanly.
  - `gradle :app:testDebugUnitTest` executed and passed 100% of unit/Robolectric test suites.

---

## 2. Target Architecture & Module Responsibility Map

```
CHART Architecture Layers
┌─────────────────────────────────────────────────────────────────┐
│                    Presentation Layer (UI)                      │
│   Android: Jetpack Compose Screens (Watchlist, Chart, Settings) │
│   Web: Native ES Views & Component Modules (Desktop & Mobile)   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│                   State & Coordination Layer                    │
│   Android: MainViewModel + Focused State Coordinators          │
│   Web: AppState Store + Action Dispatchers + Canvas Controller  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│                   Domain & Algorithms Layer                     │
│   Pure deterministic calculations (No UI / No DB dependencies)  │
│   - TimeframeAggregator (M15 ➔ H1/H4/D1)                        │
│   - DrawingGeometry (Market-coordinate anchoring, hit tests)    │
│   - PriceFormatter (Tabular formatting, step intervals)         │
│   - TechnicalAnalytics (ATR 14, Classic Floor Pivots, Sentiment)│
│   - CandleValidator (Monotonic UTC time, decimal scale)         │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│                   Data & Persistence Layer                      │
│   - Repository / Adapters (Twelve Data, Dukascopy, Yahoo, EIA)  │
│   - Storage Engine (SharedPreferences, LocalStorage, MariaDB)   │
└─────────────────────────────────────────────────────────────────┘
```

### Module Responsibilities:
1. **Core / State:** Manages immutable UI state flows and user actions. Never contains direct HTML/Canvas drawing logic.
2. **Algorithms:** Completely pure functions. Inputs: candles or coordinate parameters; Outputs: calculated numbers or transformed models. Unit-testable in isolation without mocking Android or browser APIs.
3. **Market Data Layer:** Abstract provider adapters converting third-party formats into unified `CandleBar` models.
4. **Presentation (UI):** Stateless UI components driven entirely by incoming state tokens and emitting callbacks.

---

## 3. Structural Status Map

### 3.1 Web Modular Structure (`host_subdomain/assets/js/`)

| File Path | Status | Responsibility |
|---|---|---|
| `core/store.js` | Complete | Central reactive application state (`state`), observer subscriptions, and `localStorage` persistence. |
| `services/apiService.js` | Complete | Network transport for `auth.php` and `candles_sync.php` with timeout and error mapping. |
| `controllers/chartInteractionController.js` | Complete | Pointer down/move/up, mouse wheel zoom, pinch-to-zoom, and drawing drag/translate handlers. |
| `views/headerView.js` | Complete | Top ticker bar, symbol pill, live price & percent, timeframe buttons, and quick actions. |
| `views/toolRailView.js` | Complete | Vertical left drawing toolbar (desktop) and horizontal touch chips (mobile). |
| `views/watchlistView.js` | Complete | Watchlist card grid, per-symbol provider chips, and sync actions. |
| `views/analysisView.js` | Complete | Market technical analysis panel (Period High/Low, ATR 14, Classic Pivot Points, Sentiment). |
| `views/settingsView.js` | Complete | Appearance selector, chart color pickers, custom symbol creation dialog, and sign out. |
| `views/navigationView.js` | Complete | Material 3 bottom navigation bar for mobile. |
| `app.js` | Complete | Application bootstrap: initializes i18n, loads symbols, binds global event delegations, renders layout. |

### 3.2 Android Architecture (`app/src/main/java/es/manico/chartintelligence/`)

| File Path | Status | Responsibility |
|---|---|---|
| `ui/state/coordinators/ChartDrawingCoordinator.kt` | Complete | Drawing placement, selection, coordinate translation, and hit testing. |
| `ui/state/coordinators/SymbolCatalogCoordinator.kt` | Complete | Dynamic custom symbol addition, deletion, and watchlist toggles. |
| `ui/state/coordinators/ChartPreferenceCoordinator.kt` | Complete | Dynamic color palette updates, algorithm parameter tuning, and persistence. |
| `ui/state/MainViewModel.kt` | Complete | Clean coordinator managing UI state flow, authentication, and delegating specific domain actions. |

---

## 4. Verification Results

- **`compile_applet`:** Succeeded without warnings or errors.
- **`gradle :app:testDebugUnitTest`:** All 30 tasks completed, 100% unit tests passed in 3s.
- **Spec Compliance:** All 4 master specification files updated in place without fragmentation.
