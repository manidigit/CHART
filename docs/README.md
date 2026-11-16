# CHART Documentation Hub

> **Unified Index & Single Source of Truth (`docs/`)**  
> کل مستندات پروژه به‌صورت موضوعی در ۴ پوشه استاندارد دسته‌بندی شده‌اند تا پیگیری نیازمندی‌ها، معماری، خطاهای باز و نقشه راه توسعه بدون تکرار یا ابهام انجام شود.

> **Forecast product authority:** For any new design or redesign of Forecast, start with [FORECAST_PRODUCT_FOUNDATION_V1.md](./01-product/FORECAST_PRODUCT_FOUNDATION_V1.md). This is an independent product-level foundation. Older forecast specifications and existing code are reference material only and must not override this document where their assumptions or decisions conflict. Their implementation status must be verified separately.

---

## Directory Structure (`docs/`)

| Category | File | Purpose & Scope |
|---|---|---|
| | [FORECAST_PRODUCT_FOUNDATION_V1.md](./01-product/FORECAST_PRODUCT_FOUNDATION_V1.md) | **Independent Forecast Product Foundation (v1.2.0)**: Product mission, realistic multi-candle OHLC paths, multi-model chart comparison, snapshots, forecast records, live and historical evaluation, and future model ranking |
| | [FORECAST_CURRENT_STATE_AUDIT_V1.md](./02-architecture/FORECAST_CURRENT_STATE_AUDIT_V1.md) | **Forecast implementation, execution-path, data-readiness, ledger-integrity and CI audit (v0.5.0)**: Android/Web/PHP/Python inventory, mechanical OHLC synthesis, worker contract gaps, input sanitation, local/server ledger sync, hash-chain retention defect, chart integration seam and CI coverage |
| **01 — Product & Research** | [CHART_INTELLIGENCE_MASTER_SPEC.md](./01-product/CHART_INTELLIGENCE_MASTER_SPEC.md) | Existing CHART-wide product and engineering reference. For Forecast product direction, the independent `FORECAST_PRODUCT_FOUNDATION_V1.md` takes precedence. |
| | [FORECAST_ENGINE_V2_SPEC.md](./01-product/FORECAST_ENGINE_V2_SPEC.md) | Historical technical specification and implementation-status report. Its claims and algorithms are not accepted as current or binding without independent code and test verification. |
| | [FORECAST_STUDIO_PRODUCT_DIRECTION_V2.md](./01-product/FORECAST_STUDIO_PRODUCT_DIRECTION_V2.md) | Superseded product-direction draft. Useful historical source; the consolidated `FORECAST_PRODUCT_FOUNDATION_V1.md` is authoritative for product requirements. |
| | [CHART_FUTURE_PREDICTION_SPEC_v1.3.0.md](./01-product/CHART_FUTURE_PREDICTION_SPEC_v1.3.0.md) | Historical technical research reference; useful event definitions, path evaluation, statistical comparison and uncertainty concepts are consolidated into the product foundation where applicable. |
| | [SMC_ANALOG_ENGINE_REFACTOR_SPEC.md](./01-product/SMC_ANALOG_ENGINE_REFACTOR_SPEC.md) | Historical code-audit and refactoring reference. Its documented failure patterns remain useful as risks to avoid; its proposed algorithm is not mandated. |
| | [GROK_OPENMARKET_RESEARCH_NOTES.md](./01-product/GROK_OPENMARKET_RESEARCH_NOTES.md) | Research benchmarks: OpenMarket tick/order-flow patterns, Free/Freemium market APIs (`biquote`, `Stooq`, `Alpha Vantage`, `Finnhub`), and `Kronos` / `SMC` ML evaluation |
| | [TRADING_STRATEGY_SPEC.md](./01-product/TRADING_STRATEGY_SPEC.md) | **Phase 6 Scope**: Offline strategy simulation (`Initial Equity EUR 1,000`, `1%` risk, real trading costs, execution contract, open questions) — strictly separate from Prediction Engine v1 |
| **02 — Architecture & Design** | [ARCHITECTURE.md](./02-architecture/ARCHITECTURE.md) | Single unified system architecture: Android (Kotlin/Compose) + Web (Vanilla ES6) + PHP REST API + MariaDB, 7 data providers, 22 canonical symbols, Workspace JSON sync contract, DB-First Delta Sync, BYOK isolation |
| | [DESIGN_WORKSPACE_SPEC.md](./02-architecture/DESIGN_WORKSPACE_SPEC.md) | TradingView Pro desktop & mobile workspace layout, 5-layer chart hierarchy, Z-index stacking, gesture precedence, responsive tokens (`#131722` / `#26A69A` / `#EF5350`), and chart attribution policy |
| | [INFRASTRUCTURE_INVENTORY.md](./02-architecture/INFRASTRUCTURE_INVENTORY.md) | Verified cPanel shared hosting inventory (`chart.manico.es`, `MariaDB 10.6.28`, `Apache 2.4.69`), 8 GitHub Secrets registry, backup risk (`jetbackup5d: down`), and Section 5 verification gates |
| | [SECURITY.md](./02-architecture/SECURITY.md) | Security policy, secret isolation, prepared PDO statements, personal authentication, and responsible disclosure |\n| | [FORECASTING_ALGORITHM_REFERENCE.md](./02-architecture/FORECASTING_ALGORITHM_REFERENCE.md) | Curated review of upstream ARIMA, Prophet, LSTM, Monte Carlo Dropout, and TFT experiments; evaluation leakage, interval-calibration requirements, and CHART integration boundaries |
| **03 — Roadmap & Issues** | [OPEN_ISSUES.md](./03-roadmap-and-issues/OPEN_ISSUES.md) | **Active Backlog & Verification Tracker**: Only genuinely unresolved bugs/partial implementations verified in code, unverified server checks, and pre-Phase 4 open design questions |
| | [ROADMAP_BACKLOG.md](./03-roadmap-and-issues/ROADMAP_BACKLOG.md) | **Truthful Feature Status**: Verified Shipped Core (Phase 1 + Phase 2 Core) vs Remaining Phase 2 Backlog (drawing tools, indicators, live external feeds) vs Phases 3–6 |
| **04 — Development & Ops** | [PROJECT_GUIDE.md](./04-development/PROJECT_GUIDE.md) | Comprehensive developer guide, truthful Code-vs-Spec verification matrix, file layout, secrets mapping, and CI/CD pipeline (`build-apk.yml`) |
| | [AGENTS.md](./04-development/AGENTS.md) | Mandatory UI/UX design directives, operational invariants, user flows, and build/test verification commands for AI assistants & developers |
| | [CONTRIBUTING.md](./04-development/CONTRIBUTING.md) | Local development setup (Android Gradle, ES6 Web, PHP/MariaDB), code standards, PR workflow, and documentation policy |
| | [CHANGELOG.md](./04-development/CHANGELOG.md) | Chronological release history (`Keep a Changelog` / SemVer) |

---

## Reading Order by Role

1. **Starting a New Coding Task / Fixing Bugs:**  
   Read [`OPEN_ISSUES.md`](./03-roadmap-and-issues/OPEN_ISSUES.md) and [`ROADMAP_BACKLOG.md`](./03-roadmap-and-issues/ROADMAP_BACKLOG.md) first, then follow [`AGENTS.md`](./04-development/AGENTS.md) and [`ARCHITECTURE.md`](./02-architecture/ARCHITECTURE.md).
2. **Starting or Redesigning Forecast Product Work:**  
   Read [`FORECAST_PRODUCT_FOUNDATION_V1.md`](./01-product/FORECAST_PRODUCT_FOUNDATION_V1.md) first for the independent product mission and output requirements. Then inspect the relevant technical specifications and actual implementation; do not assume older forecast designs are binding.
3. **Checking Existing Product Rules, Formulas, or Technical Contracts:**  
   Read [`CHART_INTELLIGENCE_MASTER_SPEC.md`](./01-product/CHART_INTELLIGENCE_MASTER_SPEC.md) and the relevant technical specification.
4. **Working on UI Layout or Mobile/Web Ergonomics:**  
   Read [`DESIGN_WORKSPACE_SPEC.md`](./02-architecture/DESIGN_WORKSPACE_SPEC.md) + Section 1 of [`AGENTS.md`](./04-development/AGENTS.md).
5. **Deploying, Debugging cPanel, or Touching Workflows:**  
   Read [`INFRASTRUCTURE_INVENTORY.md`](./02-architecture/INFRASTRUCTURE_INVENTORY.md) + [`SECURITY.md`](./02-architecture/SECURITY.md) + [`PROJECT_GUIDE.md`](./04-development/PROJECT_GUIDE.md).

---

## Documentation Governance Rules

- **Truth Over Checkboxes:** Never mark an item `VERIFIED` or `100%` unless the implementation actually exists and is verified in code across target platforms.
- **In-Place Updates:** When an issue in `OPEN_ISSUES.md` or a backlog item in `ROADMAP_BACKLOG.md` is completed and verified in code, update/move its status immediately rather than appending contradicting notes.
- **No Case-Duplicate Filenames:** Keep filenames uppercase/consistent so Windows, macOS, and Linux checkouts never collide.
