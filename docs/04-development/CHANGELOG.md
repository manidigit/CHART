# Changelog

All notable changes to the **CHART** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.41.0] - 2026-11-14

### Added & Completed (Remaining Phase 1–3 Deliverables)
- **Full 4-Variant Pivot Points (`IND-01` Complete across Web, Android, and Workspace Sync):**
  - Expanded `TechnicalIndicators.computePivotPoints` (`technicalIndicators.js`) and `Phase2IndicatorsAlgorithm.computePivotPoints` (`Phase2IndicatorsAlgorithm.kt`) to compute all 4 variants: **`STANDARD`**, **`FIBONACCI`**, **`CAMARILLA`**, and **`WOODIE`**, including extended **`R3 / R4 / S3 / S4`** levels.
  - Added variant selector (`pivotType`) to the Web Indicators menu (`headerView.js`, `app.js`), Android Indicators sheet (`ChartViewScreen.kt`, `MainViewModel.kt`), and bi-directional cloud workspace sync (`store.js`, `apiService.js`, `WorkspaceRepository.kt`).
- **Phase 3 Historical Data Import, Lineage & Audit Schema (`ROADMAP_BACKLOG §3` Item 2):**
  - **SQL Audit Schema (`host_subdomain/migrations/002_phase2_3_tables.sql`):** Registered `stooq` and `local_csv` in `data_providers` and added non-destructive audit tables `data_import_batches`, `data_corrections`, `backup_records`, and `audit_logs` alongside MariaDB persistence wiring in `backup.php` and `candles_sync.php`.
  - **PHP Backend (`LocalCsvAdapter.php`, `api/v1/import_candles.php`, `ProviderCatalog.php`):** Implemented server-side historical ingestion supporting `CSV/TSV` (full OHLCV and DataHub 2-column daily series), `EIA RBRTEd.xls` (pure PHP binary `BIFF8 OLE2` parser with FAT/DIFAT/MiniFAT + `SST`/`RK`/`NUMBER`, `SpreadsheetML XML`, `HTML` table, and `TSV`), `JSON`, and manual `OHLC` entries, plus `GET` batch lineage history. Enforces **Strict No-Image-Storage Policy** (`ERR_IMAGE_UPLOAD_FORBIDDEN`) and forces 2-column daily series strictly to `D1` without fabricating intraday bars.
  - **Web & Android Parity (`candleImport.js`, `settingsView.js`, `CandleImportAlgorithm.kt`, `Phase3ImportCard.kt`):** Implemented client-side parsers (including pure JS/Kotlin binary `BIFF8 OLE2` readers), Settings -> `Sync` Historical Import UI and Manual OHLC modal using zero-permission Android `SAF` (`ActivityResultContracts.OpenDocument()`), `LOCAL_CSV` provider registration, batch lineage viewer, EN/FA translations, and unified `?v=1.41.0` cache-busters across all ES modules.
- **Safe PHP Runtime Diagnostics (`OPEN_ISSUES §4.1`):**
  - Added safe `php_runtime` diagnostics (`php_version`, `memory_limit`, `max_execution_time`, `upload_max_filesize`, `post_max_size`, and extension flags) to `api/v1/system/status.php` and rendered them cleanly inside Settings diagnostics on Web and Android.
- **Verification & Tests:** Extended `tests/web_parity.test.mjs` and `Phase2AlgorithmsTest.kt` with 4-variant Pivot Point formula tests and Phase 3 import/BIFF8/forced-`D1`/no-image-upload tests.

---

## [1.39.0] - 2026-11-13

### Added & Resolved (`OPEN_ISSUES` + `ROADMAP_BACKLOG §2.1–§2.3`)
- **Session & DST Alignment (`ENG-01`):** Unified `SessionCalendar` (`CRYPTO_24_7`, `US_EQUITIES` `09:30–16:00 America/New_York`, `OTC_FX_METALS` `17:00 America/New_York` rollover) across PHP (`UtcTimeAnchor.php`, `TimeframeAggregator.php`), Web (`priceFormatter.js`, `timeframeAggregator.js`), and Android (`UtcTimeAnchorAlgorithm.kt`, `TimeframeAggregatorAlgorithm.kt`).
- **Live Forming Quote Separation (`ENG-02`):** Added strictly read-only `api/v1/quote.php` (never mutates closed `candles` rows) and polling UI badges across Web & Android with strict `provider_id` isolation.
- **Smart Gap Detection (`ENG-03`):** Added session-aware `GapDetector` (`GapDetector.php`, `api/v1/gap_report.php`, `data_quality_reports` table in `002_phase2_3_tables.sql`, Web `gapDetector.js`, Android `GapDetectorAlgorithm.kt` & Audit Card).
- **Encrypted Backup, Restore & Rollback (`INF-01`, `INF-02`):** Added `PBKDF2-HMAC-SHA256` + `AES-256-GCM` workspace backup/restore (`api/v1/backup.php`, Web Settings, Android `BackupExportHelper.kt` via zero-permission SAF) stripping BYOK keys before sealing, plus pre-overwrite snapshots (`_ci_backups/`) and authenticated `api/v1/rollback_release.php` in `build-apk.yml`.
- **Security Hardening & Live Symbol Intel (`SEC-01`, `UI-01`):** Enforced strict `sanitizeSymbolCode()` (`[A-Z0-9._:-]`) and full `escapeHtml()` coverage; added `api/v1/symbol_intel.php` (15m MariaDB cache, Yahoo Finance RSS, EIA Energy RSS, SEC EDGAR `10-K/10-Q/8-K` for US Equities, Macro Calendar, and Intermarket correlations) with explicit local-vs-external source labels.
- **Phase 2 Multi-Anchor Drawing Tools (`§2.1`):** Implemented all 12 tool families (`AVWAP`, `Regression Channel`, `FRVP`, `Gann Fan`, `Gann Box`, `Pitchfork` with `Original / Schiff / Mod Schiff / Inside` variants, `Fib Time Zone`, `Cyclic Lines`, `Fib Speed Resistance Fan`, `ABCD`, `XABCD`, `Head & Shoulders`) with Magnet Mode, coordinate dragging, and cross-platform JSON sync.
- **Phase 2 Indicators, Killzones, Seasonals & Data Export (`§2.2`, `§2.3`):** Implemented `Parabolic SAR`, `Ichimoku`, `Keltner Channels`, `Donchian Channels`, non-lookahead `MTF EMA`, `ADX/DMI`, `Stochastic`, `CCI`, `Williams %R`, `OBV`, `CMF`, `ROC`, and `Killzones` (`Asia / London / New York / Overlap`); added honest `>= 12`-month gated `Multi-Year Seasonals` and RFC-4180 CSV / Canonical JSON candle export; unified Web cache-busting to `?v=1.39.0` and updated EN/FA localization.
- **Tests:** Added `Phase2AlgorithmsTest.kt` (Robolectric + JVM) covering `ENG-01`, `ENG-03`, `SEC-01`, `§2.1`, `§2.2`, and `§2.3`; all 24 unit/Robolectric tests in `Phase1AlgorithmsTest` and `Phase2AlgorithmsTest` pass cleanly.

---

## [1.38.1] - 2026-11-12

### Changed & Refined
- **Dual-Combo-Box Architecture in Settings Data Sources (Web & Android):**
  - Replaced the horizontal chip/pill train in Settings -> Data Sources & Symbols with two responsive combo boxes (dropdown menus) side-by-side:
    1. **Market Category Combo Box:** Allows selecting the market segment (`All (22)`, `Metals`, `Energy`, `Crypto`, `Indices`, `Stocks`, `Forex`) with dynamic item count badges.
    2. **Data Source / Provider Combo Box:** Allows selecting the collection provider (`TradingView Wick`, `biquote Feed`, `Twelve Data API`, `Dukascopy`, `Yahoo Finance`, `EIA FOB`) with real-time filtered symbol counts.
- **Watchlist Market Filter Dropdown (Web & Android):**
  - Replaced overflowing horizontal filter pills with a compact TradingView-standard dropdown combo box showing active category counts (`All (22)`, `Metals`, `Energy`, `Crypto`, `Indices`, `Stocks`, `Forex`).
- **Clean Bottom-Right Symbol Details Header (Web):**
  - Fixed duplicate symbol name repetition. Streamlined layout into a single clean header displaying `[Icon] SYMBOL · Clean Name` alongside a concise market category badge pill (e.g. `Energy`, `Metals`), removing redundant subtitle repetitions.
- **Documentation & Research Notes Added:**
  - Added `docs/GPT_CODE_REVIEW_RECOMMENDATIONS.md` containing GPT's technical review, data engine analysis, and prioritized 12-item bug fix backlog.

---

## [1.38.0] - 2026-11-12

### Security & Hardening
- **Zero Plain-Text Credentials:**
  - Completely purged plain-text password storage from `localStorage` in `apiService.js` and Android `SharedPreferences`. Replaced with secure SHA-256 password hashing with server-issued salt, token-based session persistence, and secure auto-authentication.
- **Hardened Database-First Architecture:**
  - Enforced strict MariaDB schema types, idempotent candle upserts, and sanitized API endpoints (`ApiEnvelope.php`, `auth.php`, `workspace_sync.php`, `candles_sync.php`, `system/status.php`).
- **BYOK (Bring Your Own Key) Isolation:**
  - Ensured custom API keys for Twelve Data, Stooq, Alpha Vantage, and Finnhub are isolated and never leak plain-text credentials into public error responses.

---

## [1.35.0] - 2026-11-12

### Added
- **Multi-Tab Chart Strip (`Multi-Tab Chart Bar`) (Web & Android):**
  - **Web (`headerView.js`, `theme.css`):** Replaced the single symbol button with a horizontal multi-tab strip (`.tv-open-tabs-strip`). Displays all open tabs with asset icons, symbol tickers, timeframes, active indicators, and individual close (`✕`) buttons. Includes a quick new tab (`+`) button opening the watchlist symbol picker.
  - **Android (`ChartViewScreen.kt`, `ChartTabBar.kt`):** Embedded `ChartTabBar` directly below the top compact 48.dp header bar, allowing 1-click tab switching across open charts with close buttons and smooth horizontal scrolling.
- **Grok's `Stooq` Free Historical EOD Data Provider (`stooq`) (Backend, Web & Android):**
  - **Backend (`StooqAdapter.php`, `ProviderCatalog.php`, `candles_sync.php`):** Implemented `StooqAdapter` resolving ticker symbols across Commodities (`cb.f`, `cl.f`), Metals (`xauusd`, `xagusd`), Currencies (`eurusd`, `gbpusd`, `usdjpy`), Crypto (`btcusd`, `ethusd`), Indices (`^spx`, `^ndq`), and US Equities (`nvda.us`, etc.). Parses multi-year Daily (`D1`) and Weekly (`W1`) closed candles with UTC midnight timestamping and filters out unclosed today bars.
  - **Web (`store.js`, `apiService.js`):** Integrated `stooq` into `PROVIDER_METHODS_CATALOG` and default symbol `allowedProviders`.
  - **Android (`StooqAdapter.kt`, `ProviderId.kt`, `WorkspaceRepository.kt`):** Implemented `StooqAdapter` satisfying `CandleProviderAdapter.fetchClosedCandlesUpToNow`, added `ProviderId.STOOQ` to method catalog and symbol allowed providers, and wired fallback resolution.
- **Personal API Keys Management (BYOK - Bring Your Own Key) (Backend, Web & Android):**
  - Added personal API key configuration for Twelve Data, Stooq, Alpha Vantage, and Finnhub in the `sync` settings tab (`settingsView.js` and `SettingsScreen.kt`). Keys persist locally and sync across devices via `workspace_sync.php`.
- **Transparent Price Basis & Sync Mode Metadata Badge (Web & Android):**
  - Displays explicit price basis (`Official FOB Spot`, `Interbank Spot`, `CFD / MT5 Feed`, `EOD Historical`, `Official Exchange`, `Spot REST`, `Futures Ref`) and sync mode (`DB_CACHE_HIT`, `DELTA_SYNC`, `INITIAL_BACKFILL`) metadata badges on the chart header status bar.
- **Package 2 & Package 3 Comprehensive Indicators, SMC & Volume Profile Engine:**
  - Added `M30` (`30m`) timeframe aggregation and selection across Web (`store.js`, `timeframeAggregator.js`) and Android (`TimeframeAggregatorAlgorithm.kt`, `AppConfig.kt`).
  - Added full overlay indicators (`SMA 20/50/200`, `EMA 20/50`, `Supertrend 10,3`, `Session VWAP`, `Bollinger Bands 20,2`) and lower sync panes (`Volume`, `RSI 14`, `MACD 12,26,9`, `ATR 14`).
  - Added automated Smart Market Structure (SMC) detection: `BOS / CHoCH`, `Equal Highs / Equal Lows (EQH / EQL)`, `Fair Value Gaps (FVG / Imbalance)`, and `Session Volume Profile VRVP` (`POC / VAH / VAL`).
- **Strict User Settings & Last State Retention Specification (`Settings Persistence`):**
  - Enforced mandatory persistence across local cache (`localStorage` / `SharedPreferences`) and MariaDB cloud sync (`workspace_sync.php`) for all user customizations—including custom candlestick colors, drawing line stroke widths (e.g. `2px` to `1px`), tool selections, timeframes, chart type, log/auto scales, and watchlist preferences—so they remain in their last configured state upon reopening, unless the explicit **"Reset to Defaults (`بازنشانی به تنظیمات اولیه`)"** action button is clicked.
- **Overlay Classic MACD Indicator Option (`Overlay Classic MACD`):**
  - Specified support for drawing Classic MACD line, signal curve, and histogram directly on the main chart canvas overlay (without opening a separate lower pane) alongside the standard lower pane oscillator mode.
- **Customizable Bollinger Bands Parameters (`Bollinger Bands Settings`):**
  - Added dedicated configuration inputs in the Settings / Indicators panel allowing users to adjust both the Period / Length (`default: 20`) and Standard Deviation Multiplier (`default: 2.0`) with real-time canvas recalculation and persistent storage.
- **Full Viewport Auto-Fit & Range Zoom Fix Specification (`Chart Range Zoom Fix`):**
  - Specified exact candle index bounds calculations, dynamic scale margin fitting, and auto-scale viewport adjustments when switching between timeframes (`1D`, `1W`) or selecting historical date ranges (`1D`..`6M`..`All`) to ensure 100% of visible candles render smoothly without truncation, clipping, or empty half-canvas gaps.

---

## [1.34.0] - 2026-11-11

### Added
- **TradingView-Style Chart Snapshot & Clipboard Copy (Web & Android):**
  - **Web:** Added a dedicated Camera icon button (`action_take_snapshot`) to the top header bar. Clicking it captures the live chart canvas (`#main-chart-canvas`), stamps a subtle branded watermark (`CHART INTELLIGENCE • SYMBOL • TF • UTC`), and directly copies high-resolution PNG image bytes to the system clipboard via `navigator.clipboard.write([new ClipboardItem(...)])`. Falls back gracefully to direct PNG image file download and displays a sleek floating toast notification (`snapshot_copied_success`).
  - **Android:** Added a Camera Snapshot action button (`Icons.Outlined.PhotoCamera`) in the top compact chart header bar (`ChartViewScreen.kt`), copying symbol, timeframe, price, and timestamp details to the clipboard and showing an instant confirmation toast.
- **Full Watchlist Symbol Reordering (Web & Android):**
  - **Web:** Enabled complete drag-and-drop symbol reordering via HTML5 draggable rows with a dedicated grip handle (`⠿`), drag preview styling, and drop indicator lines (`.tv-wl-drag-over-top` / `.tv-wl-drag-over-bottom`). Also included 1-click Move Up (`▲`) and Move Down (`▼`) buttons on each row for precise mobile & mouse control. Symbol order persists to `localStorage` and syncs with server user preferences.
  - **Android:** Added `reorderSymbol(symbolCode, direction)` in `MainViewModel.kt` updating the catalog order, saving via `repository.saveSymbolCatalog`, and debouncing cloud sync. Wired Move Up (`▲`) and Move Down (`▼`) touch buttons on each `WatchlistRowCard.kt` in `WatchlistScreen.kt`.

### Fixed & Resolved
- **Instant Timeframe Switch Responsiveness (`M15`, `H1`, `H4`, `D1`, `W1`):**
  - Resolved the issue where clicking timeframe buttons (`15m`, `1h`, etc.) would not immediately refresh the chart canvas until a subsequent button was clicked.
  - Enhanced `getCachedOrAggregatedCandles` in Web (`store.js`) and Android (`WorkspaceRepository.kt`) to support fallback candle aggregation across all timeframes (`M15` → `H1` → `H4` → `D1` → `W1`), and removed restrictive array length checks in `app.js` so `activeTab.candles` is ALWAYS updated immediately upon timeframe selection and explicitly redraws the canvas.
- **Scroll Position Preservation across State Updates (Web & Android):**
  - Resolved the issue where clicking a symbol in the watchlist or toggling settings caused the list to jump/reset to the top.
  - In Web `renderApp()`, captured and restored `scrollTop` and `scrollLeft` for `.tv-wl-list`, `.tv-symbol-details-pane`, `.tv-settings-body`, `.modal-body`, and `#tv-watchlist-top-pane`.
  - In Android `WatchlistScreen.kt`, bound `rememberLazyListState()` to `LazyColumn` to retain scroll index across recompositions.

---

## [1.33.0] - 2026-11-11

### Changed & Refined
- **Complete Vector Iconography for all 22 Instruments (Web & Android):**
  - Added brand-accurate vector iconography, gradients, and border tints for all US & global equities (`NVDA`, `AMZN`, `TSLA`, `AAPL`, `GOOGL`, `MSFT`, `META`, `NFLX`, `AMD`, `UBER`, `NKE`, `IBM`, `SAN`), Cryptos (`BTCUSD`, `ETHUSD`), and Indices (`SPX500USD`, `NDQ`) in Web `watchlistView.js` (`getAssetBadge`) and Android `WatchlistRowCard.kt` (`AssetSymbolBadge`). Every symbol in the watchlist now has a distinct, beautiful vector badge mark.
- **Elimination of Redundant Buttons in Right Details Panel:**
  - Removed the oversized duplicate button (`symbol_overview_seasonals & symbol_overview_key_data`) from below the symbol stats card in Web `watchlistView.js`. All stats (Volume, Prev Close, Open, Range Spread, Day High/Low) fit cleanly and harmoniously without redundant action buttons.
- **Left Tool Rail Color & Stroke Width Popups (Web & Android):**
  - Replaced the cluttered consecutive list of 6 color dots and 4 width buttons (`1px`..`4px`) with single compact trigger buttons opening clean popups:
    - **Web:** Interactive Color preview circle and Stroke Width button in `toolRailView.js` trigger floating `.rail-flyout-menu` popups with outside-click dismissal.
    - **Android:** Compact `COLOR` and stroke width trigger chips in `DrawingToolbar.kt` open Material 3 `DropdownMenu` popups with stroke previews.

---

## [1.32.0] - 2026-11-11

### Added
- **Canonical 22-Symbol Watchlist Catalog (`SPOTBRENT` to `SAN`) Across Server, Web, and Android:**
  - Expanded the pre-populated Watchlist and symbol catalog to all 22 canonical instruments in exact order:
    1. `SPOTBRENT` (Brent Crude Spot), 2. `ETHUSD` (Ethereum), 3. `BTCUSD` (Bitcoin), 4. `XAGUSD` (Silver), 5. `XAUUSD` (Gold Spot), 6. `SPX500USD` (US SPX 500), 7. `NDQ` (US 100 Nasdaq Index), 8. `EURUSD` (Euro / US Dollar), 9. `USOIL` (WTI Crude Oil CFD), 10. `NVDA` (NVIDIA), 11. `AMZN` (Amazon), 12. `TSLA` (Tesla), 13. `AAPL` (Apple), 14. `GOOGL` (Alphabet Class A), 15. `MSFT` (Microsoft), 16. `META` (Meta Platforms), 17. `NFLX` (Netflix), 18. `AMD` (Advanced Micro Devices), 19. `UBER` (Uber Technologies), 20. `NKE` (Nike), 21. `IBM` (IBM), 22. `SAN` (Banco Santander).
- **`biquote` Multi-Asset Data Provider (`METHOD_BIQUOTE_FEED` / `BiquoteAdapter`):**
  - Added `biquote` as the 6th independent data collection method in `ProviderCatalog.php`, `BiquoteAdapter.php`, `candles_sync.php`, Web `store.js`, and Android `ProviderId.kt` / `BiquoteAdapter.kt`, supporting incremental `DELTA_SYNC` (`since_ms`) for `BTCUSD`, `ETHUSD`, `XAGUSD`, `XAUUSD`, `SPOTBRENT`, `USOIL`, and `EURUSD`.
- **Asset-Class Data Source Priority Chains:**
  - Configured default active providers and ordered fallback/selection chains per asset class:
    - **Commodities & Metals:** `XAUUSD` (`twelve_data` → `biquote` → `dukascopy` → `yahoo_finance` → `tvdatafeed`), `XAGUSD` (`biquote` → `twelve_data` → `yahoo_finance` → `dukascopy` → `tvdatafeed`), `SPOTBRENT` (`tvdatafeed` → `dukascopy` → `biquote` → `yahoo_finance` → `twelve_data` → `eia_brent_spot`), `USOIL` (`tvdatafeed` → `yahoo_finance` → `biquote` → `twelve_data`).
    - **Forex:** `EURUSD` (`tvdatafeed` → `twelve_data` → `biquote` → `dukascopy` → `yahoo_finance`).
    - **Crypto:** `BTCUSD` & `ETHUSD` (`biquote` → `yahoo_finance` → `twelve_data` → `tvdatafeed`).
    - **Indices:** `SPX500USD` & `NDQ` (`yahoo_finance` → `tvdatafeed` → `twelve_data`).
    - **US & Global Equities (`NVDA`..`SAN`):** `yahoo_finance` (primary) → `twelve_data` → `tvdatafeed`.
- **Expanded Watchlist Asset-Class Filter Chips & Custom Vector Badges (Web & Android):**
  - Added `CRYPTO`, `INDICES`, and `STOCKS` category filter chips alongside `ALL`, `METALS`, `ENERGY`, and `FX` in both `watchlistView.js` and `WatchlistScreen.kt`, plus custom circular asset badges in `WatchlistRowCard.kt` and `watchlistView.js`.

---

## [1.31.0] - 2026-11-11

### Added
- **DB-First Incremental Historical Candle Persistence Engine (`candles_sync.php` & Adapters):**
  - Refactored the central server candle pipeline so MariaDB `candles` is queried **first** (`stored_count`, `min_open_time_utc`, `max_open_time_utc`).
  - Implemented 3-state incremental sync machine:
    1. `DB_CACHE_HIT`: Returns stored historical candles directly from MariaDB with **0 external API/socket calls** when `max_open_time_utc >= expected_last_closed_open_ms`.
    2. `DELTA_SYNC`: Computes the exact missing candle count (`missingBars`) since `max_open_time_utc` and fetches **only newly closed candles** from the selected provider adapter, appending them idempotently to MariaDB.
    3. `INITIAL_BACKFILL`: Fetches full initial history (up to 5,000 bars) only when the database has no stored history for `(chart_id, provider_id, timeframe)` or when `backfill=1` is explicitly requested.
  - Added `sync_meta` envelope (`sync_mode`, `stored_total_bars`, `fetched_new_bars`, `min_open_time_utc_ms`, `max_open_time_utc_ms`, `provider_status`) to `candles_sync.php` responses.
- **Isolated Provider Methods Catalog & Registry (`/api/v1/providers/ProviderCatalog.php` & `/api/v1/providers_catalog.php`):**
  - Created a centralized, structured catalog of all 5 independent collection methods (`tvdatafeed` TradingView Wick & WebSocket Engine, `twelve_data` Twelve Data REST Time-Series API, `dukascopy` Dukascopy Swiss Bank Feed, `yahoo_finance` Yahoo Finance v8 Chart Engine, and `eia_brent_spot` U.S. EIA Official Daily FOB Benchmark) with their algorithm formulas, exchange/ticker mappings, supported timeframes, and live MariaDB candle counts.
  - Enforced strict provider isolation (`UNIQUE(chart_id, provider_id, timeframe, open_time_utc)`) and removed silent cross-provider fallback from `TwelveDataAdapter`, `TvDatafeedAdapter`, and `DukascopyAdapter` across Server and Android so one provider's dataset never contaminates another's.
- **Dual-Mode Data Source & Symbol Watchlist Explorer in Settings (Web & Android):**
  - Upgraded the **همگام‌سازی (`sync`)** tab in Web (`settingsView.js` + `app.js`) and Android (`SettingsScreen.kt` + `ProviderCatalog.kt`) to support both workflows simultaneously:
    - **By Source Method (`انتخاب بر اساس منبع داده`):** Select a collection method (`TradingView Wick`, `Twelve Data API`, `Dukascopy`, `Yahoo Finance`, `EIA Spot`) to inspect its algorithm specification and add/activate any of its supported symbols in the Watchlist.
    - **By Symbol (`انتخاب و جستجو بر اساس نماد`):** Search or pick a symbol to see all compatible collection methods, compare stored candle counts, and switch its active provider.

---

## [1.30.0] - 2026-11-10

### Added
- **Fib Retracement Tool (اصلاح فیبوناچی) Across Web & Android:**
  - Implemented 2-point market-coordinate Fibonacci Retracement drawing tool computing all 7 standard levels (`0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0`).
  - Added dedicated Golden Pocket highlight (`0.500 - 0.618`) shaded in translucent amber (`#F59E0B`), secondary zone shading (`0.382 - 0.500`), dashed anchor trend line, and level pills with exact market prices.
  - Full persistence across database, local cache, and cloud workspace sync (`fib_retracement`).
- **Long Position & Short Position Tools (موقعیت خرید و فروش) Across Web & Android:**
  - Implemented trade planning and simulation tools with Take Profit (`#26A69A` green zone), Stop Loss (`#EF5350` red zone), Entry divider (neutral white), and dynamic Risk/Reward ($R/R$) ratio badges.
  - Automatically calculates Risk/Reward ratio, Target %, and Stop % in real time based on candle prices.
  - Full persistence across database, local cache, and cloud workspace sync (`long_position`, `short_position`).
- **Magnet Mode (حالت آهنربا - آیکون آهنربا 🧲) Across Web & Android:**
  - Added cursor and touch magnet snapping in `DrawingGeometryAlgorithm.kt` and `drawingGeometry.js` (`snapToCandleOhlc`).
  - When active, taps and cursor placements snap with zero jitter to the closest candle Open, High, Low, or Close (OHLC) level on the nearest candle bar.
  - Added haptic pulse on Android when magnet snaps to a wick or candle body.
  - Added dedicated 🧲 button in Android floating toolbar & bottom sheet (`DrawingToolbar.kt`) and Web left rail (`toolRailView.js`).
- **Central Core Engine & Bi-Directional Auto-Sync (`P0-CORE-SYNC`, `P1-UPG-10`, `docs/architecture.md`):**
  - Unified Web (`store.js` + `apiService.js`) and Android (`WorkspaceRepository.kt` + `MainViewModel.kt`) under a single server-authoritative JSON Workspace Contract (`workspace_sync.php`) with 800ms debounced bi-directional auto-sync, canonical drawing keys (`${symbolCode}_${timeframe}`), and 6-char hex color normalization.
  - Authored comprehensive Sync Protocols specification in `docs/architecture.md` (and `docs/ARCHITECTURE.md`) detailing the canonical JSON schemas for `open_tabs`, `drawings`, `symbols`, and `preferences`.
  - Resolved `SyntaxError: export declarations may only appear at top level of a module` in `host_subdomain/assets/js/core/store.js`, exported `computeChartGeometry` in `chartRenderer.js`, and unified all ES6 module import URLs across `host_subdomain/assets/js/` to `?v=1.30.0` so `window.__CI_APP_MOUNTED__` activates reliably with a single reactive `state` singleton.
- **Categorized 5-Group Settings Architecture (`P1-UPG-9` — Sync, Chart, Notifications, Theme, Account):**
  - Structured `ChartPreferences.kt` (`SettingsCategoryGroup`, `ChartSettingsGroup`, `NotificationSettingsGroup`, `ThemeSettingsGroup`), `strings.xml` / `values-fa/strings.xml`, Android `SettingsScreen.kt`, and Web `settingsView.js` into 5 distinct groups: **همگام‌سازی (`sync`)**, **چارت (`chart`)**, **نوتیفیکیشن (`notifications`)**, **تم (`theme`)**, and **حساب (`account`)**.
- **Full Symbol Overview Analytical Suite (`P1-UPG-6`) & Watchlist Ergonomics (`P1-UPG-7` & `P1-UPG-8`):**
  - Implemented all 10 analytical cards and 4 sub-tabs (`Overview | News | Minds | Ideas`) in the Symbol Overview sheet/modal across Android (`WatchlistScreen.kt`) and Web (`watchlistView.js`), including `Flash News` banner, `Key data points` with visual `Day's range` bar, `Seasonals`, `Technicals Speedometer Gauge`, `Analyst Rating & 1Y Target Gauge` with `See forecast >` action, `Income Statement` (`Annual/Quarterly`), `Dividends & Yield`, and copyable `FIGI`/`ISIN` identifiers.
  - Enforced strict 48dp touch targets, `prefers-reduced-motion: reduce` support, and Watchlist quick refresh/remove actions across Web and Android.
- **Algorithm Unit Tests (`Phase1AlgorithmsTest.kt`):**
  - Added comprehensive test cases for `drawingGeometry_magnetSnap_snapsToNearestOhlc` and `chartDrawing_fibRetracementAndPositions_computeExactFormulas` (12/12 passing).

---

## [1.29.1] - 2026-11-10

### Added
- **Live Host MariaDB & Server Health Diagnostics (`/api/v1/system/status.php` & `/api/v1/status.php`):**
  - Added system health endpoint providing real-time MariaDB connection status, engine version (`MariaDB 10.6.28`), total candles stored in database, per-symbol/timeframe candle statistics, server UTC clock, and registered owner status.
  - Added live Diagnostic Health Card in Settings on both Web (`settingsView.js`) and Android (`SettingsScreen.kt`) with live connection indicators, DB candle count badges, server UTC timestamps, and one-tap cloud sync.
- **Cross-Device Cloud Workspace Synchronization (`/api/v1/workspace_sync.php`):**
  - Created idempotent cloud sync endpoint backed by MariaDB `user_workspace` table (`001_phase1_init.sql`) with session token authentication and local fallback (`config/workspace.local.json`).
  - Implemented bidirectional workspace upload and download on Web (`apiService.uploadWorkspaceSync` / `downloadWorkspaceSync`) and Android (`WorkspaceRepository.syncWorkspaceToCloud` / `loadWorkspaceFromCloud`) for drawings, watchlist, and preferences.
- **Weekly (`W1`) Timeframe in Python Background Sync & GitHub Actions Seeding (`sync_tvdatafeed.py` & `build-apk.yml`):**
  - Added `W1` specification (`7 * 24 * 60 * 60 * 1000 ms`), TradingView `1W` resolution mapping, weekly UTC boundary snapping, and `D1`-to-`W1` aggregation fallback to `sync_tvdatafeed.py`.
  - Added `W1` to the automated database seeding loop in `.github/workflows/build-apk.yml` (`['M15', 'H1', 'H4', 'D1', 'W1']`).
- **Multi-Tab Chart Viewport State Persistence (`ci_open_tabs_v2`):**
  - Added persistence for active tabs, timeframe, zoom (`visibleCount`), scroll offset, drawings, and indicators per symbol tab in Web `store.js` (`ci_open_tabs_v2`) and Android `ChartTabState`, ensuring switching between Gold and Oil never resets custom chart viewport settings.

---

## [1.29.0] - 2026-11-10

### Added
- **100% Web & Android Cross-Platform Feature & Visual Parity (`v1.29.0`):**
  - **Custom Vector Asset Icon Badges Everywhere (`AssetSymbolBadge` on Android & `renderAssetIcon` on Web):**
    - Replaced plain text circle badges (`Au`, `OIL`) across every screen on both platforms with custom gradient + vector emblems: **Gold Bullion Bars** (`XAUUSD`), **Crude Oil Droplet** (`SPOTBRENT`, `BRENT_FUTURES`), **Silver Bullion** (`XAGUSD`), and **Euro FX Emblem** (`EURUSD`).
    - Rendered consistently in Watchlist rows, Watchlist Symbol Details / Overview sheet, `+` Add/Manage Symbols modal/sheet, Top Chart Header & Symbol Picker, Prediction Header & Symbol Picker, and Settings Data Sources & Symbol cards.
  - **Unified 5-Section Settings Modal & TradingView Pill Switches on Web (`settingsView.js` & `theme.css`):**
    - Restyled the Web Settings modal with structured horizontal pill tabs (`.tv-modal-tab`), card rows (`.tv-settings-symbol-row`), and animated TradingView toggle switches (`.tv-toggle-switch`).
    - Added full parity with Android Settings: all **5 customizable chart colors** (`bullColor`, `bearColor`, `trendColor`, `hLineColor`, `vLineColor`) + Reset Colors button + **Live 3-Candle & Drawing Lines SVG Preview**, all **3 algorithm parameter sliders** (`candleFetchLimit` 100..5000, `zoomStepCandles` 5..50, `drawingHitTolerancePx` 10..48px) + Reset Params button, and all **11 TradingView behavior & overlay switches**.
  - **Android Timeframes (`15m..1W`), 11 Historical Date Ranges (`1D..All`), Smart X-Axis & Nice Round Y-Axis (`PriceFormatterAlgorithm.kt`, `CandlestickCanvas.kt`, `MainViewModel.kt`, `ChartTabState.kt`):**
    - Added Weekly (`W1` / `1W`) timeframe aggregation and top-bar selection to Android (`AppConfig.SUPPORTED_TIMEFRAMES`, `UtcTimeAnchorAlgorithm.kt`, `TimeframeAggregatorAlgorithm.kt`).
    - Upgraded Android bottom Date Range bar to all 11 presets (`1D`, `5D`, `1W`, `1M`, `3M`, `6M`, `9M`, `YTD`, `1Y`, `5Y`, `All`) with automatic TradingView candle resolution switching (`1D->M15`, `5D/1W->H1`, `1M->H4`, `3M..1Y->D1`, `5Y/All->W1`).
    - Ported `computeNicePriceTicks` (institutional round Y-axis steps `1, 2, 2.5, 5 × 10^n`) and `computeSmartTimeAxisTicks` (span-aware UTC Year/Month/Day/Hour X-axis labels with collision prevention) to Android `CandlestickCanvas.kt`, and suppressed intraday countdown on `D1`/`W1`.
  - **Unified 4 Technical Indicators Across Web & Android (`SMA 20`, `EMA 50`, `Bollinger Bands (20, 2)`, `Volume` with `16% / 22% / 30%` height):**
    - Added `EMA 50` (`#00BCD4`) and `Bollinger Bands (20, 2)` (`#AB47BC` upper/lower bands + translucent fill) to Android `PriceFormatterAlgorithm.kt`, `CandlestickCanvas.kt`, `ChartViewScreen.kt`, and `MainViewModel.kt`, matching Web `chartRenderer.js`.
  - **Watchlist Search Input + Category Filter Chips (`ALL | METALS | ENERGY | FX`) Across Both Platforms:**
    - Added live Watchlist search input (`watchlist_search_input`) alongside category filter chips (`ALL`, `METALS`, `ENERGY`, `FX`) and `+` Symbol Manager on both Web (`watchlistView.js`) and Android (`WatchlistScreen.kt`).

---

## [1.28.9] - 2026-11-10

### Added
- **Smart Span-Aware Horizontal Time Axis & Automatic Date-Range Timeframe Resolution (`priceFormatter.js`, `chartRenderer.js`, `app.js`):**
  - Implemented `PriceFormatter.computeSmartTimeAxisTicks(visible, chartW, timeframe)` which inspects both the active timeframe (`M15`, `H1`, `H4`, `D1`, `W1`) and the visible calendar span (`spanDays`) to snap vertical grid lines and X-axis labels onto exact UTC **Year** boundaries (`2025`, `2026`), **Month** starts (`Mar`, `May`, `Jul`, `Sep`, `Nov`), **Day** boundaries (`4 Nov`, `5 Nov`), or **Round Hours** (`02:00`, `04:00`) with collision prevention (`minPxGap = 82px`).
  - Clicking bottom Date Range presets (`1D`, `5D`, `1W`, `1M`, `3M`, `6M`, `9M`, `YTD`, `1Y`, `5Y`, `All`) now automatically switches to the appropriate candle resolution (`M15` for `1D`, `H1` for `5D`/`1W`, `H4` for `1M`, `D1` for `3M`/`6M`/`9M`/`YTD`/`1Y`, `W1` for `5Y`/`All`) and computes the exact `visibleCount` covering that historical cutoff (`up to 600 bars`).
  - Added `W1` (`1W` Weekly) candle aggregation across `TimeframeAggregator` (`timeframeAggregator.js` and `TimeframeAggregator.php`) and added `1W` to the top timeframe selector bar.
- **Heckbert Nice-Number Y-Axis Price Scaling (`priceFormatter.js` & `PriceFormatterAlgorithm.kt`):**
  - Implemented Heckbert's nice-number step algorithm (`1, 2, 2.5, 5 × 10^n`) on both Web (`computeNicePriceTicks`) and Android (`computeNiceAxisBounds`) so the right-hand vertical price axis always renders clean, human-readable round numbers (e.g., `120.00, 110.00, 100.00, 90.00, 80.00, 70.00` for Brent Crude and `4100.00, 4050.00` for Gold) instead of arbitrary fractional numbers.
- **Watchlist Circular Vector Asset Icons & Container-Query Responsive Sidebar (`watchlistView.js` & `theme.css`):**
  - Replaced plain text badges (`Au`, `OIL`) in the Watchlist and Symbol Details pane with custom circular gradient SVG icons: Gold Bullion (`XAUUSD`), Crude Oil Droplet (`SPOTBRENT`, `BRENT_FUTURES`), Silver Bullion (`XAGUSD`), and Forex Emblem (`EURUSD`).
  - Applied `container-type: inline-size; container-name: rightpanel;` and `@container rightpanel` rules on `.tv-right-panel` (`185px..520px`) so dragging the sidebar narrower automatically hides secondary columns (`Chg`), wraps localized instrument subtitles (`overflow-wrap: anywhere`), scales price typography with `clamp()`, and reflows the key stats grid (`repeat(auto-fit, minmax(84px, 1fr))`) with zero text overflow or clipping.
- **Consolidated TradingView Desktop Workspace, Zero Duplicate Controls & Interactive Drag Resizers:**
  - Unified all 4 core workspace navigation items (**Watchlist**, **Chart / Symbol Overview**, **Prediction**, **Settings**) exclusively inside the Right Dock Rail (`navigationView.js`), and eliminated all duplicate Symbol Overview buttons (`⊞` grid icon and `عملکرد فصلی و داده‌های کلیدی` button in `.tv-symbol-details-pane`), duplicate `+` Add Symbol button in the top bar, duplicate `↻` Sync / `›` Collapse buttons in the Watchlist header, and duplicate `TVDATAFEED` / live status labels.
  - Added a single unified **Indicators (`اندیکاتورها`)** button in the top bar opening the Indicators Modal (`SMA 20`, `EMA 50`, `Bollinger Bands (20, 2)`, and `Volume Histogram` with `16% / 22% / 30%` height presets).
  - Added interactive drag resizer handles for the Right Panel width (`.tv-col-resizer`, `185px..520px`) and the Watchlist / Symbol Details vertical split ratio (`.tv-row-resizer`, `22%..78%`), persisted in `localStorage`.
- **Session Persistence (`Remember Me`), Modern Auth Landing Dashboard & Startup Watchdog (`loginView.js`, `LoginScreen.kt`, `index.html`, `app.js`):**
  - Added persistent session & credential storage (`ذخیره نام کاربری و رمز عبور / ورود خودکار`) and password visibility toggle across Web (`localStorage` + `auth.php`) and Android (`WorkspaceRepository` + `LoginScreen.kt`).
  - Replaced the static startup screen in `host_subdomain/index.html` with a TradingView Pro landing shell featuring a live market preview card, startup watchdog timer, and fallback error boundary (`renderFallbackErrorBoundary`).

### Fixed
- **Backend PHP Fatal Error (`TimeframeAggregator::aggregate()`):**
  - Added the static `aggregate(array $candles, string $targetTf): array` method in `host_subdomain/api/v1/algorithms/TimeframeAggregator.php` and `host_subdomain/assets/js/algorithms/timeframeAggregator.js`, resolving the fatal error in `TvDatafeedAdapter.php` during `candles_sync.php`.
- **High-DPI Canvas Overflow & Bottom Bar Clipping (`theme.css`, `watchlistView.js`, `chartRenderer.js`):**
  - Positioned `#main-chart-canvas` with `position: absolute; inset: 0;` inside `.chart-canvas-box` (`flex: 1; min-height: 0; overflow: hidden;`) so high-DPI `<canvas>` scaling never pushes `.tv-bottom-bar` (`1D..All`, `UTC`, `log`, `auto`) below the viewport.
  - Suppressed the intraday `HH:MM:SS` countdown label on `1D` and `1W` timeframes so daily/weekly price pills display only the live price.

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
