# Changelog

All notable changes to the **CHART** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.28.0] - 2026-11-08

### Added
- **Integration of Grok's Professional TradingView Design Recommendations (`UI_UX_MOBILE_REDESIGN_SPEC.md`):**
  - Incorporated official TradingView financial dark theme tokens into the specification: canvas background `#131722`, panel background `#1E222D`, grid lines `#2A2E39`, primary text `#D1D4DC`, muted text `#787B86`, bullish candlestick `#26A69A`, bearish candlestick `#EF5350`, and dotted crosshair `#758696`.
  - Added concrete Web `LightweightCharts.createChart` configuration parameters (scale margins, right price scale border `#2A2E39`, time scale visibility).
  - Specified interactive Multi-Pane synchronization with synchronized time scale scrolling and drag resize handles.
  - Formulated comprehensive Priority Matrix (P0 to P3) spanning Insets, Dark Palette, Flat Candle Filtering, Compact Watchlist, Live Legend, and Ergonomic Touch/Double-tap interactions across Android and Web.
- **Integration of GPT Architectural & UX Specifications (`UI_UX_MOBILE_REDESIGN_SPEC.md`):**
  - Added product differentiation triangle: TradingView in appearance + TradingView in interaction + CHART in intelligence (market structure & prediction engine).
  - Defined 5 semantic market states (`Live`, `Market Closed`, `Delayed`, `Cached`, `Error`) to replace simplistic green dot indicator.
  - Specified interactive drawing object lifecycle (Hit-testing, translation/drag handles, quick floating toolbar for color/width, and coordinate anchoring to UTC time and price).
  - Formulated desktop vs. mobile ergonomic parity (vertical left drawing toolbar on desktop, floating pencil action button + BottomSheets on mobile).
- **Root Cause Diagnosis of XAUUSD M15 Weekend Anomaly:**
  - Diagnosed flat-candle comb/barcode artifact on 15m Gold chart caused by Twelve Data weekend bid/ask spread ticks with static open price (`4065.98607000`) and 0 volume triggering canvas auto-scale over-zoom.
  - Outlined solution: integrating real TradingView (`OANDA:XAUUSD`) / Yahoo Finance feeds and adding zero-range weekend anomaly filtering in `CandleValidator`.

---

## [1.27.0] - 2026-11-07

### Added
- **TradingView (`PEPPERSTONE:SPOTBRENT`) Extraction Pipeline (`tvdatafeed`) & Host Database Persistence:**
  - Added Python extraction script (`host_subdomain/scripts/sync_tvdatafeed.py`) using `tvdatafeed` (`from tvDatafeed import TvDatafeed, Interval`) to fetch up to **5,000 historical and daily closed candles** for `PEPPERSTONE:SPOTBRENT` across `15m` (`M15`), `1h` (`H1`), `4h` (`H4`), and `daily` (`D1`), exporting both CSV files (`SPOTBRENT_15m.csv`, `SPOTBRENT_1h.csv`, `SPOTBRENT_4h.csv`, `SPOTBRENT_1d.csv`) and normalized JSON datasets.
  - Added `TvDatafeedAdapter.php`, `cron_sync_tvdatafeed.php`, and automated MariaDB batch seeding in `.github/workflows/build-apk.yml` (`_deploy_phase1.php`) so both the Web app (`chart.manico.es`) and Android app (`APK`) read exact `PEPPERSTONE:SPOTBRENT` prices (`3` decimals, e.g. `101.198`) directly from the cPanel host database (`candles` table).
  - Set `tvdatafeed` (`TradingView (PEPPERSTONE:SPOTBRENT)`) as the default active provider exclusively for `SPOTBRENT` while keeping `XAUUSD` and other symbols on their existing defaults.
- **5,000-Candle Capacity Across Database, Cache & Settings Slider:**
  - Expanded `candles_sync.php`, `AppConfig.MAX_VISIBLE_CANDLES`, `ChartPreferences`, Web `store.js`, and the **Max History Fetch Limit (`حداکثر کندل‌های دریافتی`)** slider in Settings on both Web and Android to support up to **5,000 candles** (`40..5000`).
- **UI/UX Mobile Redesign Specification (`UI_UX_MOBILE_REDESIGN_SPEC.md`):**
  - Documented complete comparative audit against TradingView Mobile, identified the 4 root flaws (Status Bar Insets cutoff, oversized watchlist cards, cluttered chart drawing buttons, and unorganized settings), and established the 4-step implementation roadmap as a mandatory pre-condition before starting Phase 2.

### Fixed
- **Deterministic APK Signing (`CANONICAL_B64` Yadin Pattern) & Seamless In-Place Android Updates:**
  - Replaced random `keytool -genkeypair` fallback in `.github/workflows/build-apk.yml` and `app/build.gradle.kts` with the fixed `CANONICAL_B64` keystore payload (identical to `manidigit/Yadin`, `SHA1: 38:C6:57:E4:12:4A:90:85:94:BA:0C:B3:C2:A3:A9:F8:F5:3B:E1:6B`) so every GitHub Actions build shares the exact same cryptographic signature and installs as an in-place update without uninstalling the previous version.
  - Upgraded `versionCode` in `app/build.gradle.kts` from static `1` to automatic monotonic CI versioning (`100 + GITHUB_RUN_NUMBER` on GitHub Actions, fallback `27` locally) and `versionName` to `"1.27.${ciRunNumber}"`.
- **Web App Blank Screen & Deployment Database Seeding Crash Fixes:**
  - Fixed `TypeError: i18n.getCurrentLanguage is not a function` in `settingsView.js` / `loginView.js` by defining `getCurrentLanguage()` and `getLanguage()` in `I18nManager` (`host_subdomain/assets/js/core/i18n.js`), preventing DOM render failure and resolving the blank web screen.
  - Fixed `PDOException: SQLSTATE[42S22]: Column not found: 1054 Unknown column 'open_time_utc_ms'` in `.github/workflows/build-apk.yml` by aligning the batch seed statement with the actual MariaDB schema (`open_time_utc`) and wrapping database seeding in a guarded try-catch block so web file extraction never fails.

### Removed
- **Complete Removal of Firebase & Google Services Dependencies:**
  - Removed all Firebase libraries (`firebase-bom`, `firebase-firestore`, `firebase-auth`), `com.google.gms.google-services` Gradle plugin, `CredentialManager`/`googleid` dependencies, `app/google-services.json`, `firebase.json`, `firestore.rules`, `firebase-blueprint.json`, `UserAccount.kt`, `UserAccountRepository.kt`, and Firestore emulator test files; authentication and password recovery operate purely through the self-hosted `api/v1/auth.php` backend and local `WorkspaceRepository`.

---

## [1.26.0] - 2026-11-07

### Added
- **Multi-Pane Layered Chart Workspace Redesign (Web & Android Native):**
  - Expanded the Chart Workspace to occupy 80%–85% of the viewport height with zero outer page scrolling (`100vh`/`100dvh` on Web, `Modifier.weight(1f).fillMaxSize()` on Android).
  - **Unified Single-Row Top Subbar:** Combined Timeframe selector (`15m`, `1h`, `4h`, `1D` mapped to `M15`, `H1`, `H4`, `D1`), dynamic Historical Date Range Presets (`1D`, `5D`, `1M`, `3M`, `YTD`, `1Y`, `All`), Chart Type (`Candles` / `Line`), Volume Pane toggle & height resizer (`16% / 22% / 30%`), and `SMA 20` overlay toggle into a single top row, keeping the bottom of the chart dedicated to the UTC Time Axis.
  - **Dedicated Separate Volume Panel:** Separated volume bars out of the price canvas into an independent lower pane (`~22%` height) with a horizontal divider, right-side volume axis labels (`maxVol`, `0.5 * maxVol`), and honest `"No volume data provided by source"` feedback when a feed (e.g., `EIA D1`) reports zero volume.
  - **Current Price Line & Axis Callout Pills:** Added a horizontal dashed current-price line with a colored right-axis pill tag, plus interactive Crosshair callout pills on both the right Y-axis (price) and bottom X-axis (UTC timestamp).
  - **Per-Drawing Color & Line Thickness + Collapsible Mobile Drawing Dock:** Added custom `colorHex` and `strokeWidth` (`1px..4px`) support to Horizontal, Vertical, and Trend lines, persisted in local storage, with a collapsible floating bottom dock on Mobile/Android that auto-expands the style row when a tool or line is selected.

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
