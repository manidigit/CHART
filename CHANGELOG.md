# Changelog

All notable changes to the **CHART** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.25.0] - 2026-11-07

### Added
- **Unified Web & Android Authentication (`auth.php` + Firebase Auth):**
  - Synchronized personal owner credentials (`username`, `email`, `password`) across Android (`WorkspaceRepository`) and Web (`apiService.js` + `auth.php`) so registering or updating credentials on either platform works on both.
  - Integrated Firebase Authentication with Google Sign-In via Jetpack `CredentialManager` (`GetSignInWithGoogleOption`) on Android and cloud profile persistence in Firestore (`users/{userId}`) with zero-trust security rules (`firestore.rules`).
- **2-Step Email Password Recovery (`فراموشی رمز عبور`):**
  - Added recovery email field during owner setup and in Settings (`update_profile`).
  - Added `request_password_reset` (generates a 15-minute 6-digit recovery code sent via host email) and `confirm_password_reset` (verifies the 6-digit code and sets a new password) on both Android and Web.
- **Always-Accessible Top Header User Badge & Sign-Out:**
  - Added active user badge and direct **Sign Out (`خروج`)** button in the top header bar of both the Web Terminal (`headerView.js`) and Android app (`MainActivity.kt`).

### Fixed
- **GitHub Actions CI/CD Pipeline (`.github/workflows/build-apk.yml`):**
  - Fixed `Package and Deploy Subdomain Web Files` job failing with `OSError: [Errno 7] Argument list too long: 'curl'` when `/tmp/_deploy_phase1.php` exceeded Linux's 128 KB `MAX_ARG_STRLEN` limit by streaming file content from disk via `--data-urlencode content@{local_file}`.
  - Fixed `Build Android APK` job failing on `:app:processDebugGoogleServices` when AI Studio's GitHub export omits `app/google-services.json` by automatically generating a valid CI `app/google-services.json` before Gradle build.

---

## [1.24.0] - 2026-11-07

### Added
- **TradingView-Style Trading Chart Overhaul:**
  - 4 core timeframes supported: `M15`, `H1`, `H4`, `D1` with instant cached aggregation from closed candles and background sync.
  - Candlestick and Line chart display modes.
  - Interactive drawing tools: Horizontal Line, Vertical Line, Trend Line (2-point anchor), and Crosshair.
  - Hit testing and dragging of drawings in market coordinates.
  - Dynamic Y-axis drag scaling and double-click reset to Auto Scale.
  - Floating OHLC and volume badge.
- **Three-Layer Zero-Hardcoding Architecture:**
  - Algorithm calculation parameters tunable via Settings sliders (candle fetch limit, zoom step, touch tolerance).
  - Central color tokens with dynamic live customizer in Settings for bullish, bearish, and drawing line colors.
  - Open symbol catalog allowing runtime creation and deletion of custom market symbols.
- **Complete UI/UX Redesign:**
  - Desktop Trading Terminal: >75% chart space, slim top header bar (<48px), left vertical drawing rail, collapsible side panel.
  - Android Mobile Web Experience: Sticky compact top bar, viewport gesture lock (`touch-action: none`), 4-tab Material 3 bottom navigation.
  - Real-time Technical Analysis module (ATR 14, Classic Floor Pivots, Period High-Low spread, Sentiment ratio).
- **Open-Source GitHub Standards:**
  - Added `ARCHITECTURE.md`, `CONTRIBUTING.md`, `AGENTS.md`, `SECURITY.md`, and `CHANGELOG.md`.

---

## [1.23.0] - 2026-11-06

### Added
- Initial Phase 1 foundation: bilingual (`fa`/`en`) support, owner login authentication, pre-populated Gold (`XAUUSD`) and Brent (`SPOTBRENT`) watchlist, and multi-tab chart view.
- Dukascopy, Twelve Data, Yahoo Finance, and EIA Spot provider adapters.
- Robolectric unit testing suite for financial algorithms.
