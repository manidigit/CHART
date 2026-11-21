# CHART Documentation Hub

> **Unified Index & Single Source of Truth (`docs/`)**  
> کل مستندات پروژه به‌صورت موضوعی در ۴ پوشه استاندارد دسته‌بندی شده‌اند تا پیگیری نیازمندی‌ها، معماری، خطاهای باز و نقشه راه توسعه بدون تکرار یا ابهام انجام شود.

> **Product direction:** The primary CHART product mission is governed by [CHART_INTELLIGENCE_MASTER_SPEC.md](./01-product/CHART_INTELLIGENCE_MASTER_SPEC.md): reliable technical analysis and chart rendering first; forecasting/AI models are optional, replaceable consumers of the deterministic analysis core. The implementation sequence is defined in [TECHNICAL_ANALYSIS_CORE_IMPLEMENTATION_PLAN_V1.md](./02-architecture/TECHNICAL_ANALYSIS_CORE_IMPLEMENTATION_PLAN_V1.md). Forecast-specific documents remain scoped to the optional forecasting subsystem and do not override the primary product mission.

> **Live State Snapshot (Authoritative for AI & Developers — `v1.47.41`, 2026-11-21):**
> - **Live Web Production Runtime (`host_subdomain/` → `https://chart.manico.es`):** 100% browser-native JavaScript **Unified Forecast Studio** (12 panels, `AUTO (OOS Best)`, **`Causal Historical Analogs`**, **`Structural JS`**, **`SMC Prediction Engine` (`smc_prediction_js`)**, 10 native JS registry models, `Calibrated Ensemble`, `Quantile Fan / Hybrid / Quantile Bars`, `Coordinated MTF`, `Compare Overlays`, `Replay`, local SHA-256 `Ledger`). Legacy Forecast Studio UI was **permanently removed** in `v1.47.38`.
> - **Owner-Confirmed Preferred Browser Models:** `Causal Historical Analogs` (`empiricalAnalogEngine.js`), `Structural JS` (`structuralForecastEngine.js`), and `SMC Prediction Engine` (`smcPredictionEngine.js`).
> - **Shelved / Inactive (`Python` & `Chronos-2`):** Shared cPanel hosting blocks `PHP exec()` and Python execution. `host_subdomain/api/v1/chronos2_forecast.php`, `host_subdomain/scripts/chronos2_worker.py`, and `.github/workflows/chronos2-manual-forecast.yml` are **NOT wired to the live UI** and are preserved (`Shelved`) until a dedicated Python server is provisioned.
> - **Repository Hygiene (`2026-11-21`):** Obsolete `/archive/`, unused `public/assets/aistudio/`, and 11 superseded/duplicate docs were permanently removed (full external owner backup taken).
> - **Mandatory Invariants:** Unified `?v=1.47.41` across all 27 JS modules + `index.html` (`ARCH-02`), zero bare `localStorage.setItem` calls (`STORAGE-QUOTA-01` → use `safeLocalStorageSet()`), `npm test` = **51/51 passing**.

---

## Directory Structure (`docs/`)

| Category | File | Purpose & Scope |
|---|---|---|
| **01 — Product & Research** | [CHART_INTELLIGENCE_MASTER_SPEC.md](./01-product/CHART_INTELLIGENCE_MASTER_SPEC.md) | Primary CHART-wide product and engineering reference. For Forecast product direction, the independent `FORECAST_PRODUCT_FOUNDATION_V1.md` takes precedence. |
| | [FORECAST_PRODUCT_FOUNDATION_V1.md](./01-product/FORECAST_PRODUCT_FOUNDATION_V1.md) | **Product Foundation (v1.3.0)**: Authoritative Forecast mission, structured path/OHLC requirements, multi-timeframe consistency (§6), model comparison, snapshots and evaluation direction |
| | [FORECAST_SYSTEM_SPEC_V1.md](./01-product/FORECAST_SYSTEM_SPEC_V1.md) | **System Specification (v1.0.5)**: Model-independent system responsibilities, lifecycle, chart display, comparison, live/replay workflows, provenance & gates |
| | [FORECAST_MODEL_INTAKE_AND_COMPARISON_V1.md](./01-product/FORECAST_MODEL_INTAKE_AND_COMPARISON_V1.md) | **Model Intake Framework (v1.0.5)**: Evidence-based screening protocol; live Web runtime uses 10 native JS registry models + `Structural JS` + `SMC Prediction Engine` + `Causal Historical Analogs` + `Ensemble`; `Chronos-2`/Python shelved until dedicated server |
| | [FORECAST_CHRONOS2_INPUT_OUTPUT_AND_PATH_CONTRACT_V1.md](./01-product/FORECAST_CHRONOS2_INPUT_OUTPUT_AND_PATH_CONTRACT_V1.md) | **Chronos-2 Contract (`Shelved` until dedicated Python server)**: Close-only baseline, native quantile integrity, path interpretation, uncertainty and walk-forward evaluation |
| | [GROK_OPENMARKET_RESEARCH_NOTES.md](./01-product/GROK_OPENMARKET_RESEARCH_NOTES.md) | Research benchmarks: OpenMarket tick/order-flow patterns, Free/Freemium market APIs (`biquote`, `Stooq`, `Alpha Vantage`, `Finnhub`), and `Kronos` / `SMC` ML evaluation |
| | [TRADING_STRATEGY_SPEC.md](./01-product/TRADING_STRATEGY_SPEC.md) | **Phase 6 Scope**: Offline strategy simulation (`Initial Equity EUR 1,000`, `1%` risk, real trading costs, execution contract, open questions) — strictly separate from Prediction Engine v1 |
| **02 — Architecture & Design** | [ARCHITECTURE.md](./02-architecture/ARCHITECTURE.md) | Single unified system architecture: Android (Kotlin/Compose) + Web (Vanilla ES6) + PHP REST API + MariaDB, data providers (`tvdatafeed` active), 79 canonical symbols (22 default watchlist + 57 global equities), Workspace JSON sync contract, DB-First Delta Sync, BYOK isolation |
| | [TECHNICAL_ANALYSIS_CORE_IMPLEMENTATION_PLAN_V1.md](./02-architecture/TECHNICAL_ANALYSIS_CORE_IMPLEMENTATION_PLAN_V1.md) | **Active Plan (`DECIDED`)**: Deterministic analysis core separation from renderers, canonical schema, candlestick pattern detection and Web/Android numerical parity |
| | [DESIGN_WORKSPACE_SPEC.md](./02-architecture/DESIGN_WORKSPACE_SPEC.md) | TradingView Pro desktop & mobile workspace layout, 5-layer chart hierarchy, Z-index stacking, gesture precedence, responsive tokens (`#131722` / `#26A69A` / `#EF5350`), and chart attribution policy |
| | [FORECAST_CONSISTENCY_AND_ANALOG_ANALYSIS_V1.md](./02-architecture/FORECAST_CONSISTENCY_AND_ANALOG_ANALYSIS_V1.md) | **Draft Analysis (`Under Discussion`)**: Root-cause audit of horizon prefix-invariance and cross-timeframe (`H1×60` vs `H4×15`) contradictions in `Causal Historical Analogs`, engineering options, and open design questions (no code changes yet) |
| | [FORECAST_ACCEPTANCE_TEST_PLAN_V1.md](./02-architecture/FORECAST_ACCEPTANCE_TEST_PLAN_V1.md) | **Acceptance Test Plan (v1.0.3)**: Model-independent test scenarios for readiness, execution, output validation, chart behavior, persistence, evaluation, historical replay, security and cross-platform integrity |
| | [FORECASTING_ALGORITHM_REFERENCE.md](./02-architecture/FORECASTING_ALGORITHM_REFERENCE.md) | Curated review of upstream ARIMA, Prophet, LSTM, Monte Carlo Dropout, and TFT experiments; evaluation leakage, interval-calibration requirements, and CHART integration boundaries |
| | [CHRONOS2_MANUAL_GITHUB_ACTIONS_RUNBOOK_V1.md](./02-architecture/CHRONOS2_MANUAL_GITHUB_ACTIONS_RUNBOOK_V1.md) | **Chronos-2 Manual Runbook (`Shelved`)**: On-demand GitHub Actions runner and FTP publication workflow for future Python/Chronos-2 execution |
| | [INFRASTRUCTURE_INVENTORY.md](./02-architecture/INFRASTRUCTURE_INVENTORY.md) | Verified cPanel shared hosting inventory (`chart.manico.es`, `MariaDB 10.6.28`, `Apache 2.4.69`), 8 GitHub Secrets registry, backup risk (`jetbackup5d: down`), and Section 5 verification gates |
| | [SECURITY.md](./02-architecture/SECURITY.md) | Security policy, secret isolation, prepared PDO statements, personal authentication, and responsible disclosure |
| **03 — Roadmap & Issues** | [OPEN_ISSUES.md](./03-roadmap-and-issues/OPEN_ISSUES.md) | **Active Backlog & Verification Tracker**: Verified open bugs, Forecast blockers (`FCST-*`), unverified server checks and open design questions |
| | [ROADMAP_BACKLOG.md](./03-roadmap-and-issues/ROADMAP_BACKLOG.md) | **Truthful Feature Status**: Verified Shipped Core (Phases 1–3 + Phase 4 Web Browser-Native Studio) vs Remaining Backlog & Phases 5–6 |
| **04 — Development & Ops** | [PROJECT_GUIDE.md](./04-development/PROJECT_GUIDE.md) | Comprehensive developer guide, truthful Code-vs-Spec verification matrix, file layout, secrets mapping, and CI/CD pipeline (`build-apk.yml`) |
| | [AGENTS.md](./04-development/AGENTS.md) | Mandatory UI/UX design directives, operational invariants, user flows, and build/test verification commands for AI assistants & developers |
| | [CONTRIBUTING.md](./04-development/CONTRIBUTING.md) | Local development setup (Android Gradle, ES6 Web, PHP/MariaDB), code standards, PR workflow, and documentation policy |
| | [CHANGELOG.md](./04-development/CHANGELOG.md) | Chronological release history (`Keep a Changelog` / SemVer) |

---

## Reading Order by Role

1. **Starting a New Coding Task / Fixing Bugs:**  
   Read [`OPEN_ISSUES.md`](./03-roadmap-and-issues/OPEN_ISSUES.md) and [`ROADMAP_BACKLOG.md`](./03-roadmap-and-issues/ROADMAP_BACKLOG.md) first, then follow [`AGENTS.md`](./04-development/AGENTS.md) and [`ARCHITECTURE.md`](./02-architecture/ARCHITECTURE.md).
2. **Starting or Redesigning Forecast Product Work:**  
   Read [`FORECAST_PRODUCT_FOUNDATION_V1.md`](./01-product/FORECAST_PRODUCT_FOUNDATION_V1.md) and [`FORECAST_CONSISTENCY_AND_ANALOG_ANALYSIS_V1.md`](./02-architecture/FORECAST_CONSISTENCY_AND_ANALOG_ANALYSIS_V1.md) first, then inspect [`FORECAST_SYSTEM_SPEC_V1.md`](./01-product/FORECAST_SYSTEM_SPEC_V1.md) and actual implementation code.
3. **Checking Existing Product Rules, Formulas, or Technical Contracts:**  
   Read [`CHART_INTELLIGENCE_MASTER_SPEC.md`](./01-product/CHART_INTELLIGENCE_MASTER_SPEC.md) and [`TECHNICAL_ANALYSIS_CORE_IMPLEMENTATION_PLAN_V1.md`](./02-architecture/TECHNICAL_ANALYSIS_CORE_IMPLEMENTATION_PLAN_V1.md).
4. **Working on UI Layout or Mobile/Web Ergonomics:**  
   Read [`DESIGN_WORKSPACE_SPEC.md`](./02-architecture/DESIGN_WORKSPACE_SPEC.md) + Section 1 of [`AGENTS.md`](./04-development/AGENTS.md).
5. **Deploying, Debugging cPanel, or Touching Workflows:**  
   Read [`INFRASTRUCTURE_INVENTORY.md`](./02-architecture/INFRASTRUCTURE_INVENTORY.md) + [`SECURITY.md`](./02-architecture/SECURITY.md) + [`PROJECT_GUIDE.md`](./04-development/PROJECT_GUIDE.md).

---

## Documentation Governance Rules

- **Truth Over Checkboxes:** Never mark an item `VERIFIED` or `100%` unless the implementation actually exists and is verified in code across target platforms.
- **In-Place Updates:** When an issue in `OPEN_ISSUES.md` or a backlog item in `ROADMAP_BACKLOG.md` is completed and verified in code, update/move its status immediately rather than appending contradicting notes.
- **No Case-Duplicate Filenames:** Keep filenames uppercase/consistent so Windows, macOS, and Linux checkouts never collide.
