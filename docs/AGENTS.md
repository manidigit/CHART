# AI & Developer Assistant Instructions (AGENTS.md)

> This document establishes operational instructions and invariant rules for any AI agent (ChatGPT, Gemini, Claude, etc.) or new developer working on the **CHART** repository.

---

## 1. Core Principles & Golden Rules

1. **In-Place Documentation Updates (Section 0.1 of Master Spec):**
   Whenever a design conclusion, technical finding, or decision is reached with the user, **you must immediately update the documentation in place**. Never leave documentation out of sync.
2. **Never Commit Secrets:**
   Never write, output, commit, or log real API keys (`TWELVE_DATA_API_KEY`), database passwords, or cPanel tokens.
3. **No Mock Fallbacks When Real Integrations Exist:**
   Do not introduce fake or simulated data when real data sources (Dukascopy, Twelve Data, EIA, Yahoo) or actual algorithms are implemented.
4. **Bilingual Parity:**
   Every user-facing string must be declared in both English (`en`) and Persian (`fa`). Numeric values and time stamps must display with LTR tabular numbers (`JetBrains Mono`).
5. **Zero Hardcoding Architecture:**
   Colors, algorithm parameters (zoom step, candle limit, hit tolerance), and symbol definitions must not be hardcoded in rendering or calculation logic. They must be configurable in `AppConfig`/Store and tunable in the Settings UI.

---

## 2. Essential File Map

Before modifying code, understand the primary files:

| File | Purpose |
|---|---|
| `docs/CHART_INTELLIGENCE_MASTER_SPEC.md` | Single source of truth for product scope, phase gates, and business logic. |
| `docs/DESIGN_WORKSPACE_SPEC.md` | Chart workspace structural layout, component responsibilities, layer hierarchy and redesign roadmap. |
| `docs/UI_UX_MOBILE_REDESIGN_SPEC.md` | Mobile UI/UX redesign audit against TradingView standards and priority matrix. |
| `docs/ARCHITECTURE.md` | High-level system design, module responsibilities, and extension guidelines. |
| `docs/PROJECT_GUIDE.md` | Developer guide, hosting details, and engineering standards. |
| `docs/INFRASTRUCTURE_INVENTORY.md` | Verified server environment facts and deployment records. |
| `app/src/main/java/` | Android native Jetpack Compose application code. |
| `host_subdomain/` | Web application (Vanilla ES6 modules + PHP REST API). |

---

## 3. Standard Verification Commands

Before concluding any turn:
- **Android Compilation:** Execute `compile_applet` (or `gradle assembleDebug`).
- **Android Unit Tests:** Execute `gradle :app:testDebugUnitTest`.
- **Web Verification:** Check that all ES6 imports resolve cleanly and `index.html` loads without console errors.
