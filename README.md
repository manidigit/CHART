<!--
CHART Intelligence — project landing page
Detailed engineering and operational material: docs/PROJECT_GUIDE.md
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
  <a href="https://github.com/manidigit/CHART/blob/main/CHART_INTELLIGENCE_MASTER_SPEC.md"><img src="https://img.shields.io/badge/Spec-v1.25-8B6CEF?style=for-the-badge" alt="Master Spec version 1.25"></a>
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

**CHART Intelligence** is being built as an independent platform for viewing and analyzing financial market charts across multiple timeframes. The project combines an Android application with a web application and a modular data-provider architecture.

The engineering direction prioritizes reliable market-series identity, consistent UTC candle boundaries, independently testable algorithms, and a feedback process for evaluating forecast quality.

> **Project status:** Phase 1 implementation is present in the repository. Phases 2–6 are roadmap items and must not be interpreted as shipped capabilities.

## Product

### Current foundation — Phase 1

- **Web + Android:** responsive web application and Android APK project.
- **Bilingual interface:** Persian (RTL) and English (LTR), with Persian as the initial language.
- **Watchlist:** initial Gold and Brent instruments with configurable data-source selection.
- **Multi-tab chart workspace:** open and retain multiple chart tabs.
- **Unified personal access & recovery:** cross-platform owner login synced across Web and Android (`auth.php`), recovery email registration, 2-step 6-digit email password reset, and top-bar quick sign-out.
- **Centralized presentation:** dark/light theme foundation and shared design conventions.
- **Market-data adapters:** provider integrations are organized as separate modules.

### Planned capabilities

| Phase | Focus | Planned outcome |
|---:|---|---|
| 1 | Product foundation | Modular Web/Android app, localization, login, watchlist and multi-tab charts |
| 2 | Technical indicators | M15/M30/H1/H4/D1 and SMA, EMA, Bollinger Bands, RSI, MACD and ATR |
| 3 | Data integrity | Gap detection, historical imports and encrypted backup/restore |
| 4 | Prediction Engine v1 | Market-structure analysis, support/resistance and immutable forecasts |
| 5 | Live feedback | Forecast scoring, Walk-Forward evaluation and controlled model governance |
| 6 | Strategy simulator | Independent strategy simulation and multi-user administration |

The roadmap is governed by a build → install → practical test → owner approval gate. Work on a later phase starts only after the current phase has been tested and approved.

## Architecture

The repository separates the Android client, web client, PHP API, data-provider adapters and database migrations.

```mermaid
flowchart TB
    subgraph Clients
      A[Android app<br/>Kotlin · Jetpack Compose]
      W[Web app<br/>Vanilla JS]
    end

    subgraph Backend
      API[PHP REST API]
      DB[(MariaDB)]
      MIG[Database migrations]
    end

    subgraph MarketData
      TD[Twelve Data]
      DK[Dukascopy]
      EIA[EIA historical benchmark]
      YF[Yahoo Finance]
    end

    A --> API
    W --> API
    API --> DB
    MIG --> DB
    API --> TD
    API --> DK
    API --> EIA
    API --> YF
```

This diagram shows the repository's application boundaries and provider direction; it is not a claim that every future workflow or production deployment automation is complete.

### Technology

| Layer | Technology |
|---|---|
| Android | Kotlin, Jetpack Compose |
| Web | Modular Vanilla JavaScript (ES6+) |
| Chart rendering | TradingView Lightweight Charts |
| Backend API | PHP |
| Database | MariaDB |
| Automation | GitHub Actions |
| Hosting target | cPanel — `chart.manico.es` |

## Data sources

CHART keeps market-series identity explicit. Spot, CFD and Futures prices are distinct instruments and must not be silently merged.

| Market series | Provider symbol | Intended role |
|---|---|---|
| Gold Spot | Twelve Data `XAU/USD` | Primary configured source |
| Gold | Dukascopy `xauusd` | Alternative source |
| Brent Oil CFD | Dukascopy `brentcmdusd` | Intraday source |
| Brent | Twelve Data `XBR/USD` | Optional provider route; plan limits must be handled |
| Brent Futures | Yahoo Finance `BZ=F` | Separate futures series |
| Europe Brent Spot Price FOB | EIA `RBRTEd` | Daily historical benchmark |

Historical EIA data: [Europe Brent Spot Price FOB — CSV/XLS source](https://www.eia.gov/dnav/pet/hist_xls/RBRTEd.xls).

Provider availability, plan restrictions, licensing and timeframe coverage must be validated for the selected account and instrument. A provider symbol is not interchangeable with another series merely because both refer to Brent or Gold.

## Repository layout

```text
.
├── ARCHITECTURE.md              # System architecture, layer boundaries and extension guide
├── CONTRIBUTING.md              # Contributor guidelines, workflow and PR standards
├── AGENTS.md                    # Core operational rules for AI and developer assistants
├── SECURITY.md                  # Security policies and zero-secrets management
├── CHANGELOG.md                 # Semantic versioning release history
├── app/                         # Android application (Kotlin, Compose, Coordinators)
├── host_subdomain/
│   ├── api/v1/                  # PHP REST API (auth.php, candles_sync.php)
│   ├── assets/                  # Web Native ES6 modules, styles, and renderer
│   ├── i18n/                    # Web translations (fa/en)
│   └── migrations/              # Database migrations
├── docs/
│   ├── assets/chart-hero.svg             # README artwork
│   ├── AGENTS.md                         # Operational rules and AI invariants
│   ├── ARCHITECTURE.md                   # System design & layer diagrams
│   ├── CHANGELOG.md                      # Release notes & version history
│   ├── CHART_INTELLIGENCE_MASTER_SPEC.md # Master specification (Source of Truth)
│   ├── CONTRIBUTING.md                   # Contribution guidelines
│   ├── DESIGN_WORKSPACE_SPEC.md          # Chart workspace UI/UX & layout spec
│   ├── INFRASTRUCTURE_INVENTORY.md       # Verified infrastructure & deployment inventory
│   ├── PROJECT_GUIDE.md                  # Project & developer guide
│   ├── SECURITY.md                       # Security policy
│   ├── TRADING_STRATEGY_SPEC.md          # Strategy simulation module specification
│   └── UI_UX_MOBILE_REDESIGN_SPEC.md     # Mobile UI/UX redesign roadmap (TradingView standard)
├── .github/workflows/
│   └── build-apk.yml                     # Manual Android APK build
└── README.md
```

## Build and delivery

- **Android APK:** run the [Build APK workflow](https://github.com/manidigit/CHART/actions/workflows/build-apk.yml) manually using GitHub Actions. The workflow produces a downloadable artifact.
- **Web application:** [chart.manico.es](https://chart.manico.es).
- **Deployment automation:** the current repository inventory records the APK build workflow; a cPanel deployment workflow is a separate pending operational task.

## Documentation

All project documentation is consolidated within the `docs/` folder:

| Document | Purpose |
|---|---|
| [Master Specification](docs/CHART_INTELLIGENCE_MASTER_SPEC.md) | Product requirements, architecture, algorithms and authoritative project decisions |
| [UI/UX Mobile Redesign Specification](docs/UI_UX_MOBILE_REDESIGN_SPEC.md) | TradingView mobile standard audit, requirements and priority matrix |
| [Design Workspace Specification](docs/DESIGN_WORKSPACE_SPEC.md) | Chart workspace structural layout, component responsibilities, layer hierarchy and redesign roadmap |
| [System Architecture](docs/ARCHITECTURE.md) | High-level system design, module responsibilities, layer diagrams and extension guides |
| [Project & Development Guide](docs/PROJECT_GUIDE.md) | Engineering standards, secure configuration, roadmap details, provider matrix and workflow notes |
| [Infrastructure Inventory](docs/INFRASTRUCTURE_INVENTORY.md) | Hosting environment, infrastructure evidence, limits and deployment records |
| [AI & Developer Instructions](docs/AGENTS.md) | Operational rules, core invariants, zero-hardcoding rules and verification requirements |
| [Changelog](docs/CHANGELOG.md) | Structured release notes and feature history across versions |
| [Trading Strategy Specification](docs/TRADING_STRATEGY_SPEC.md) | Independent strategy-simulation module specification |
| [Contributing Guide](docs/CONTRIBUTING.md) | Contribution standards, local environment setup, code style and PR checklist |
| [Security Policy](docs/SECURITY.md) | Security vulnerability disclosure, zero-secrets policy and credential management |

The Master Specification is the source of truth for product and architecture decisions. The Project Guide is a practical companion and must not override it.

## Project principles

- **Evidence over assumptions:** verify the current repository and documentation before proposing changes.
- **Modularity:** keep screens, components, providers and algorithms independently maintainable.
- **Data integrity:** preserve instrument identity, UTC timestamps and decimal price precision.
- **Security by design:** never commit secrets or place private credentials in public documentation.
- **Measured forecasting:** future predictions must be evaluated against subsequent market data; planned forecasts are not presented as proven performance.

---

<p align="center">
  <strong>CHART Intelligence</strong><br>
  <sub>Analyze clearly. Validate continuously. Improve with evidence.</sub>
</p>
