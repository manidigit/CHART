# CHART Documentation Hub

> **Unified Index & Single Source of Truth (`docs/`)**  
> کل مستندات پروژه به‌صورت موضوعی در ۴ پوشه استاندارد دسته‌بندی شده‌اند تا پیگیری نیازمندی‌ها، معماری، خطاهای باز و نقشه راه توسعه بدون تکرار یا ابهام انجام شود.

---

## Directory Structure (`docs/`)

| Category | File | Purpose & Scope |
|---|---|---|
| **01 — Product & Research** | [CHART_INTELLIGENCE_MASTER_SPEC.md](./01-product/CHART_INTELLIGENCE_MASTER_SPEC.md) | **Primary Source of Truth**: Product vision, 14 engineering standards, data quality, 8 core MariaDB tables, API envelope, `forecast-contract/v1`, immutable hash chain, phases 1–6 gates, open-source audits & math formulas |
| | [GROK_OPENMARKET_RESEARCH_NOTES.md](./01-product/GROK_OPENMARKET_RESEARCH_NOTES.md) | Research benchmarks: OpenMarket tick/order-flow patterns, Free/Freemium market APIs (`biquote`, `Stooq`, `Alpha Vantage`, `Finnhub`), and `Kronos` / `SMC` ML evaluation |
| | [TRADING_STRATEGY_SPEC.md](./01-product/TRADING_STRATEGY_SPEC.md) | **Phase 6 Scope**: Offline strategy simulation (`Initial Equity EUR 1,000`, `1%` risk, real trading costs, execution contract, open questions) — strictly separate from Prediction Engine v1 |
| **02 — Architecture & Design** | [ARCHITECTURE.md](./02-architecture/ARCHITECTURE.md) | Single unified system architecture: Android (Kotlin/Compose) + Web (Vanilla ES6) + PHP REST API + MariaDB, 7 data providers, 22 canonical symbols, Workspace JSON sync contract, DB-First Delta Sync, BYOK isolation |
| | [DESIGN_WORKSPACE_SPEC.md](./02-architecture/DESIGN_WORKSPACE_SPEC.md) | TradingView Pro desktop & mobile workspace layout, 5-layer chart hierarchy, Z-index stacking, gesture precedence, responsive tokens (`#131722` / `#26A69A` / `#EF5350`), and chart attribution policy |
| | [INFRASTRUCTURE_INVENTORY.md](./02-architecture/INFRASTRUCTURE_INVENTORY.md) | Verified cPanel shared hosting inventory (`chart.manico.es`, `MariaDB 10.6.28`, `Apache 2.4.69`), 8 GitHub Secrets registry, backup risk (`jetbackup5d: down`), and Section 5 verification gates |
| | [SECURITY.md](./02-architecture/SECURITY.md) | Security policy, secret isolation, prepared PDO statements, personal authentication, and responsible disclosure |
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
2. **Checking Product Rules, Formulas, or Prediction Contracts:**  
   Read [`CHART_INTELLIGENCE_MASTER_SPEC.md`](./01-product/CHART_INTELLIGENCE_MASTER_SPEC.md).
3. **Working on UI Layout or Mobile/Web Ergonomics:**  
   Read [`DESIGN_WORKSPACE_SPEC.md`](./02-architecture/DESIGN_WORKSPACE_SPEC.md) + Section 1 of [`AGENTS.md`](./04-development/AGENTS.md).
4. **Deploying, Debugging cPanel, or Touching Workflows:**  
   Read [`INFRASTRUCTURE_INVENTORY.md`](./02-architecture/INFRASTRUCTURE_INVENTORY.md) + [`SECURITY.md`](./02-architecture/SECURITY.md) + [`PROJECT_GUIDE.md`](./04-development/PROJECT_GUIDE.md).

---

## Documentation Governance Rules

- **Truth Over Checkboxes:** Never mark an item `VERIFIED` or `100%` unless the implementation actually exists and is verified in code across target platforms.
- **In-Place Updates:** When an issue in `OPEN_ISSUES.md` or a backlog item in `ROADMAP_BACKLOG.md` is completed and verified in code, update/move its status immediately rather than appending contradicting notes.
- **No Case-Duplicate Filenames:** Keep filenames uppercase/consistent so Windows, macOS, and Linux checkouts never collide.
