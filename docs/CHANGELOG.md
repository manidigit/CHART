# Changelog

All notable changes to the **CHART** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.28.1] - 2026-11-08

### Added
- **Phase 1 Pro Upgrade Pack (`P1-UPG-1` through `P1-UPG-5`) Across Android & Web:**
  - **`P1-UPG-1` (Long-Press Crosshair Scrubbing, Magnifier & Haptics):** Implemented `detectDragGesturesAfterLongPress` in `CandlestickCanvas.kt` with candle-by-candle haptic feedback (`HapticFeedbackType.TextHandleMove`), floating scroll magnifier pill (`showScrollMagnifier`), and picker haptic feedback (`pickerVibrates`).
  - **`P1-UPG-2` (Situational Awareness Overlays & Logarithmic Scale):** Added Logarithmic price scale (`ln(price)` / `exp(s)`), dashed `Previous close` line, live UTC `Candle Countdown Timer` (`mm:ss` / `hh:mm:ss` / `Closed`) under the current price pill, automatic `Visible High / Low` wick callout labels, draggable volume splitter handle, floating `Scroll-to-Latest («⏭»)` button when scrolled back `> 5` bars, and `[Auto] [Log]` quick axis badges.
  - **`P1-UPG-3` (TradingView Symbol Overview Sheet, Key Data Points & Seasonals):** Added the Symbol Overview BottomSheet (`WatchlistScreen.kt` & `watchlistView.js`) featuring the `SYMBOL • PROVIDER` header, interactive mini-candlestick chart with dashed previous close line, `1D..All` range chips + `[⛶]` Open Full Chart button, `Key data points` card (`Volume`, `Previous close`, `Open`, `Day's range`), and `Seasonals` (`2026 / 2025 / 2024`) multi-year performance chart, plus Watchlist search filter, Day's range bar, and `Hide logos` switch.
  - **`P1-UPG-4` (Prediction Visual Pivot Ladder & Direct Chart Level Projection):** Added the visual `S2 — S1 — P — R1 — R2` price position ladder and the **"Project Scenario Levels onto Chart"** action button inside `PredictionScreen.kt` and `analysisView.js` to draw labeled Pivot/Target/Invalidation horizontal lines directly on the symbol's chart.
  - **`P1-UPG-5` (TradingView Behavior Switches, Live 3-Candle Color Preview & Sync Diagnostics):** Added all 8 TradingView switches (`Hide logos`, `Show symbol screen`, `Chart vibrations`, `Logarithmic scale`, `Remember the last opened chart on this device`, `Hide the tab bar in landscape`, `Picker vibrates`, `Show picker scroll magnifiers`), a live 3-candle color preview canvas, and cached bar count + UTC timestamp diagnostics in `SettingsScreen.kt` and `settingsView.js`.

### Fixed
- **Web Terminal Chrome & Firefox Overhaul (`P1-UPG-WEB`):**
  - Fixed RTL `<canvas>` text-alignment corruption in Chrome and Firefox by enforcing `ctx.direction = 'ltr'; ctx.textAlign = 'left';` in `chartRenderer.js` and `dir="ltr"` on `.tv-main-area` and `.chart-workspace`, keeping right-axis price numbers inside the axis column, centering text inside current-price and crosshair pills, and preventing `Vol:` label clipping.
  - Fixed black-on-black text contrast in `.floating-ohlc-bar`, locked TradingView Dark (`#131722`) as the default theme (`ci_theme_v2`), loaded `Vazirmatn` and `JetBrains Mono` Google Fonts in `host_subdomain/index.html` with `?v=1.28.1` cache-busting, replaced primitive emojis with crisp inline `SVG` icons, and removed the duplicate Watchlist drawer header.

---

## [1.28.0] - 2026-11-08

### Added
- **Consolidation of All Markdown Documentation into `docs/` Folder:**
  - Relocated all markdown specification and architectural documents (`CHART_INTELLIGENCE_MASTER_SPEC.md`, `DESIGN_WORKSPACE_SPEC.md`, `UI_UX_MOBILE_REDESIGN_SPEC.md`, `ARCHITECTURE.md`, `INFRASTRUCTURE_INVENTORY.md`, `AGENTS.md`, `CHANGELOG.md`, `TRADING_STRATEGY_SPEC.md`, `CONTRIBUTING.md`, `SECURITY.md`) into the `docs/` directory to prevent clutter, reduce human error, and keep all specifications unified in one dedicated place, leaving exclusively `README.md` in the workspace root.
  - Updated cross-document relative links in `README.md`, `docs/PROJECT_GUIDE.md`, and `docs/AGENTS.md`.
- **Integration of Grok's Professional TradingView Design Recommendations (`UI_UX_MOBILE_REDESIGN_SPEC.md`):**
  - Incorporated official TradingView financial dark theme tokens into the specification: canvas background `#131722`, panel background `#1E222D`, grid lines `#2A2E39`, primary text `#D1D4DC`, muted text `#787B86`, bullish candlestick `#26A69A`, bearish candlestick `#EF5350`, and dotted crosshair `#758696`.
  - Added concrete Web `LightweightCharts.createChart` configuration parameters (scale margins, right price scale border `#2A2E39`, time scale visibility).
  - Specified interactive Multi-Pane synchronization with synchronized time scale scrolling and drag resize handles.
  - Formulated comprehensive Priority Matrix (P0 to P3) spanning Insets, Dark Palette, Flat Candle Filtering, Compact Watchlist, Live Legend, and Ergonomic Touch/Double-tap interactions across Android and Web.
- **Chart Workspace Structural & Interactive Specification (`DESIGN_WORKSPACE_SPEC.md`):**
  - Created comprehensive execution blueprint covering Desktop and Mobile structural layouts (ASCII wireframes), exact bar/panel dimensions, interactive behaviors for Top Header, Semantic Market Statuses, Unified Top Subbar, Live OHLC Legend, Drawing Toolbar & Object Lifecycle, Price/Time Scales, Multi-Pane Time-Scale Sync, Design Tokens, and P0–P3 implementation phases.
- **Integration of GPT Architectural & UX Specifications (`UI_UX_MOBILE_REDESIGN_SPEC.md`):**
  - Added product differentiation triangle: TradingView in appearance + TradingView in interaction + CHART in intelligence (market structure & prediction engine).
  - Defined 5 semantic market states (`Live`, `Market Closed`, `Delayed`, `Cached`, `Error`) to replace simplistic green dot indicator.
  - Specified interactive drawing object lifecycle (Hit-testing, translation/drag handles, quick floating toolbar for color/width, and coordinate anchoring to UTC time and price).
  - Formulated desktop vs. mobile ergonomic parity (vertical left drawing toolbar on desktop, floating pencil action button + BottomSheets on mobile).
- **Root Cause Diagnosis & Full Resolution of XAUUSD M15 Weekend Anomaly:**
  - Diagnosed flat-candle comb/barcode artifact on 15m Gold chart caused by Twelve Data weekend bid/ask spread ticks with static open price (`4065.98607000`) and 0 volume triggering canvas auto-scale over-zoom.
  - Implemented `filterSyntheticWeekendAndCombCandles` across Android (`CandleValidatorAlgorithm.kt`), PHP Backend (`CandleValidator.php`), and Web (`store.js`), plus automatic SQL purge of zero-volume micro-spread weekend bars in `candles_sync.php` and `.github/workflows/build-apk.yml`.
  - Added automatic fallback from Twelve Data to real market candles (`OANDA:XAUUSD` via `TvDatafeedAdapter` and `GC=F` via `YahooFinanceAdapter`) whenever weekend filtering leaves `< 5` valid bars, and enforced a minimum price span floor (`0.16%` of mid-price) in both Android (`CandlestickCanvas.kt`) and Web (`chartRenderer.js`).
- **Complete Execution of Phase 1 UI/UX Redesign (Android & Web Parity):**
  - Applied `.statusBarsPadding()` to the Android top header in `MainActivity.kt` with compact `44.dp` height and `#2A2E39` divider so the top bar never clips under the status bar or camera cutout.
  - Applied official TradingView Dark tokens (`#131722` canvas, `#1E222D` surface, `#2A2E39` grid/border, `#2962FF` accent, `#D1D4DC` primary text, `#787B86` secondary text, `#26A69A` bullish, `#EF5350` bearish) across Android (`Color.kt`, `Theme.kt`, `ChartPreferences.kt`) and Web (`theme.css`, `store.js`, `chartRenderer.js`).
  - Implemented 5 semantic market statuses (`Live`, `Market Closed`, `Delayed`, `Cached`, `Error`) in `UtcTimeAnchorAlgorithm.kt`, `ChartViewScreen.kt`, and `headerView.js`.
  - Fixed RTL/LTR OHLC Legend text collision (`04431687.22`) in `CandlestickCanvas.kt` by enforcing `LayoutDirection.Ltr` on the chart canvas container and reserving a `30.dp` top legend lane, and defaulted the mobile drawing dock to collapsed (`isDrawingDockCollapsed = true`) for a minimal floating pill.
  - Redesigned Watchlist rows (`WatchlistRowCard.kt`, `WatchlistScreen.kt`, `watchlistView.js`) into compact TradingView rows with circular asset badges (`Au`, `OIL`, `Ag`, `FX`) and full-row tap to open chart, and re-architected `SettingsScreen.kt` with a modal provider selector dialog.
- **Holistic 4-Tab TradingView Architecture & Mandatory Mobile User Flow (`Watchlist | Chart | Prediction | Settings`):**
  - Standardized bottom navigation across Android (`MainActivity.kt`) and Web (`navigationView.js`, `app.js`) into 4 coordinated tabs: `Watchlist` (default landing screen after login), `Chart`, `Prediction`, and `Settings`.
  - Implemented the 5-layer mobile `Chart` screen (`ChartViewScreen.kt`): `48.dp` symbol/price header with a non-clickable (read-only) source badge, `>= 85%` canvas, and a `46.dp` bottom chart control bar (`[Symbol ▾ | Timeframe | Draw | fx | ⋯]`) with modal sheets for quick symbol switching, timeframe selection, drawing tools, indicators, and historical date ranges.
  - Created the standalone `PredictionScreen.kt` (Android) and upgraded `analysisView.js` (Web) with Symbol and Timeframe selectors, interactive Bullish/Bearish/Range scenarios, and a clickable detail BottomSheet/modal showing target zones, invalidation levels, key S/R levels, and roadmap status.
  - Reorganized `SettingsScreen.kt` and `settingsView.js` into 5 fixed-order groups (1. User Account, 2. Symbol Data Sources — exclusive location for changing providers, 3. Appearance & Language, 4. Chart Preferences, 5. About App) and enforced natural system `Back` navigation via `screenBackStack`.
- **Integration of Filtered `crypto-claude-desk` Analytical Patterns into Roadmap (`CHART_INTELLIGENCE_MASTER_SPEC.md`):**
  - Added `detect_gaps` timestamp integrity check to Phase 3, the 3-stage sequential analytical pipeline (`MarketStructureModule -> ConfluenceMatrixModule -> ScenarioGeneratorModule`) to Phase 4 (`Prediction Engine v1`), and the `Learning Evaluator & Pattern Track Record` schema to Phase 5 (`Live Feedback Loop`), while explicitly rejecting `Claude Code`/`MCP` runtime dependencies and trade-execution signals.

### Fixed
- **Android `IllegalStateException: Could not load font` Crash Fix:**
  - Fixed corrupted ASCII 404 HTML bodies inside `app/src/main/res/font/vazirmatn.ttf` and `jetbrains_mono.ttf` by installing verified binary TrueType fonts via `font-util`, adding descriptive fallback logic in `Type.kt`, and adding an unconditional binary TTF/PNG asset restoration step in `.github/workflows/build-apk.yml`.

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
