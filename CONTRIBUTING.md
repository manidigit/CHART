# Contributing to CHART

Thank you for your interest in contributing to **CHART**! We welcome contributions from developers, researchers, and financial engineers worldwide.

---

## 1. Code of Conduct & Standards

To ensure quality and maintainability, all contributions must adhere to our standards:
- **Clean Architecture:** Respect the boundaries defined in [ARCHITECTURE.md](./ARCHITECTURE.md).
- **Pure Algorithms:** Financial and mathematical calculations must remain pure functions without UI or persistence dependencies.
- **Bilingual Support:** Any new user-facing string must be declared in both English (`strings.xml`, `en.json`) and Persian (`strings.xml` in `values-fa`, `fa.json`).
- **Zero Secrets:** Never commit API keys, database passwords, or personal credentials.
- **Automated Tests:** Any new feature, algorithm, or bugfix must be accompanied by unit tests.

---

## 2. Development Setup

### 2.1 Android Native (Kotlin & Jetpack Compose)
- **SDK Requirements:** Android SDK API 35 (`compileSdk 35`, `minSdk 26`).
- **Build Tool:** Gradle with Kotlin DSL.
- **Running Tests:**
  ```bash
  gradle :app:testDebugUnitTest
  ```
- **Building APK:**
  ```bash
  gradle :app:assembleDebug
  ```

### 2.2 Web Application (Modular Vanilla JS & PHP)
- **No Bundler Required:** The web frontend uses Native ES6 Modules (`type="module"` in `index.html`).
- **Local Dev Server:**
  You can run any local static file server from the root or `host_subdomain/` directory:
  ```bash
  npx serve host_subdomain/
  # or
  python3 -m http.server 8080 --directory host_subdomain/
  ```
- **Backend API:** Requires PHP 8.1+ and MariaDB 10.6+.

---

## 3. Contribution Workflow

1. **Fork the Repository:** Create a feature branch off `main` (e.g., `git checkout -b feature/awesome-indicator`).
2. **Implement Changes:**
   - Adhere to the established module boundaries.
   - Keep files concise (ideally under 300 lines).
   - Avoid introducing heavy external dependencies unless discussed in an Issue first.
3. **Verify Integrity:**
   - Run unit tests: `gradle :app:testDebugUnitTest`.
   - Verify layout responsiveness across desktop and mobile screens.
4. **Submit a Pull Request:**
   - Reference the relevant issue.
   - Describe what changed and include screenshots for UI improvements.
   - Confirm that all unit tests pass.

---

## 4. Documentation Policy

Whenever architectural or product decisions are made, update the corresponding documentation files in place:
1. [CHART_INTELLIGENCE_MASTER_SPEC.md](./CHART_INTELLIGENCE_MASTER_SPEC.md) — Product requirements & master spec.
2. [ARCHITECTURE.md](./ARCHITECTURE.md) — Architecture & directory layout.
3. [CHANGELOG.md](./CHANGELOG.md) — Version release notes.
