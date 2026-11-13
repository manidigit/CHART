# Contributing to CHART

Thank you for your interest in contributing to **CHART**! We welcome contributions from developers, researchers, and financial engineers worldwide.

---

## 1. Code of Conduct & Standards

To ensure quality and maintainability, all contributions must adhere to our standards:
- **Clean Architecture:** Respect the boundaries defined in [`ARCHITECTURE.md`](../02-architecture/ARCHITECTURE.md) and [`AGENTS.md`](./AGENTS.md).
- **Pure Algorithms:** Financial and mathematical calculations must remain pure functions without UI or persistence dependencies (`app/.../algorithms/`, `host_subdomain/assets/js/algorithms/`, `host_subdomain/api/v1/algorithms/`).
- **Bilingual Support:** Any new user-facing string must be declared in both English (`values/strings.xml`, `en.json`) and Persian (`values-fa/strings.xml`, `fa.json`).
- **Zero Secrets:** Never commit API keys, database passwords, or personal credentials (see [`SECURITY.md`](../02-architecture/SECURITY.md)).
- **Automated Tests & Syntax Checks:** Any new feature, algorithm, or bugfix must pass build and unit/syntax checks before submission.

---

## 2. Development Setup

### 2.1 Android Native (Kotlin & Jetpack Compose)
- **SDK Requirements:** Android SDK API 35 (`compileSdk 35`, `minSdk 26`).
- **Build Tool:** Gradle with Kotlin DSL.
- **Running Unit Tests:**
  ```bash
  gradle :app:testDebugUnitTest
  ```
- **Building Debug APK:**
  ```bash
  gradle assembleDebug
  ```

### 2.2 Web Application (Modular Vanilla ES6 JS & PHP)
- **No Bundler Required:** The web frontend uses Native ES6 Modules (`type="module"` in `host_subdomain/index.html`).
- **Local Dev Server:**
  ```bash
  npx serve host_subdomain/
  # or
  python3 -m http.server 8080 --directory host_subdomain/
  ```
- **JS Syntax Check:**
  ```bash
  find host_subdomain/assets/js -name "*.js" -exec node --check {} +
  ```
- **Backend API:** Requires PHP 8.1+ and MariaDB 10.6+.

---

## 3. Contribution Workflow

1. **Check Open Work First:** Review [`OPEN_ISSUES.md`](../03-roadmap-and-issues/OPEN_ISSUES.md) and [`ROADMAP_BACKLOG.md`](../03-roadmap-and-issues/ROADMAP_BACKLOG.md) to pick verified issues or approved phase tasks.
2. **Implement Changes:**
   - Adhere to modular file boundaries and UI tokens in [`DESIGN_WORKSPACE_SPEC.md`](../02-architecture/DESIGN_WORKSPACE_SPEC.md).
   - Keep files focused and modular (avoid monolithic view/god files).
   - Maintain Web/Android/Backend parity for core data and indicator math.
3. **Verify Integrity:**
   - Run `gradle :app:testDebugUnitTest` and `gradle assembleDebug`.
   - Verify layout responsiveness across desktop and mobile screens.
4. **Submit a Pull Request:**
   - Reference the relevant issue or roadmap item.
   - Describe what changed and report actual test results (no speculative claims).

---

## 4. Documentation Policy

Whenever architectural or product decisions are made, update the corresponding documentation files in place:
1. [`CHART_INTELLIGENCE_MASTER_SPEC.md`](../01-product/CHART_INTELLIGENCE_MASTER_SPEC.md) — Product requirements, prediction contracts & master spec.
2. [`ARCHITECTURE.md`](../02-architecture/ARCHITECTURE.md) — Central core, data providers & sync protocols.
3. [`OPEN_ISSUES.md`](../03-roadmap-and-issues/OPEN_ISSUES.md) & [`ROADMAP_BACKLOG.md`](../03-roadmap-and-issues/ROADMAP_BACKLOG.md) — Truthful issue & phase tracking.
4. [`CHANGELOG.md`](./CHANGELOG.md) — Version release notes.
