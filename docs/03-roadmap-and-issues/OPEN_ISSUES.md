# CHART — فهرست مسائل باز، نواقص راستی‌آزمایی‌شده و وضعیت ممیزی (`OPEN_ISSUES`)

> **نسخه:** `1.47.41` · **تاریخ ممیزی و تکمیل:** `2026-11-24`  
> **منبع حقیقت زنده برای هوش مصنوعی‌ها:** در نسخه `v1.47.41` وب (`host_subdomain/` → `https://chart.manico.es`) با **Unified Browser-Native Forecast Studio** فعال است، رابط Legacy در `v1.47.38` به‌طور دائمی حذف شده، باگ‌های قفل شدن واچ‌لیست و تایم‌فریم در `v1.47.39` (`ARCH-02`) و `v1.47.40` (`STORAGE-QUOTA-01`) بسته شده‌اند، بسته‌های `FORECAST-PKG1..3`، مدل مستقل **`SMCPredictionEngine` (`smc_prediction_js`)**، ارتقای یکپارچه **`Rev 2.3`** روی هر سه مدل ترجیحی (**`Causal Historical Analogs`، `Structural JS` و `SMC Prediction Engine`** با ثبات افق دقیق `0.0000` روی `H_ref=60` + `Hybrid Two-Cluster MTF`)، و بازطراحی UX و ارزیابی ۵بعدی دفتر کل (`FORECAST-UX-EVAL-CHECKLIST-01` شامل کارت وضعیت بالا، آکاردئون‌های تشخیصی، ثبت گروهی چندمدله، مقایسه کنارهم با انتخاب برنده، کارت امتیازی غلتان ۲۰تایی، فیلترهای تاریخچه، شاخص‌های `×ATR`/`vs Naive`/`Early Invalidation` و هم‌پوشانی بصری روی چارت) تکمیل شده و چهار باگ UI/همگام‌سازی/تایم‌فریم (`BUGFIX-V14741-UI-SYNC-TF-SMC`) با ارتقای یکپارچه به `?v=1.47.41` برطرف شده‌اند. همچنین هسته یکپارچه تحلیل تکنیکال (`TechnicalAnalysisCore` فازهای A تا F شامل `Swings/Trend`، نواحی `S/R Zones` و ۷ الگوی کندل‌استیک)، **درخت اشیاء پیشرفته (`UI-02` Object Tree)**، **شبیه‌ساز آفلاین استراتژی معاملاتی (`Phase 6` — `strategy-sim/1.0`)** و **پنل مدیریت چندکاربره (`Multi-User Admin UI` با RBAC سمت سرور)** روی هر دو پلتفرم وب و اندروید پیاده‌سازی و راستی‌آزمایی شده‌اند. بخش `Python / Chronos-2` تا زمان تهیه سرور مستقل Python به‌صورت متوقف (`Shelved`) باقی می‌ماند. تست‌های وب: **۵۹/۵۹ پاس** · تست‌های واحد اندروید: **۳۵/۳۵ پاس**.

---

## خلاصه وضعیت مسائل ممیزی (`v1.47.41`)

- **پیاده‌سازی‌شده و بسته‌شده در کد (`Code Complete`):**
  - **`ENG-01` (بخش پایه)**: هم‌ترازی سشن‌های معاملاتی و DST (`CRYPTO_24_7`, `US_EQUITIES` `09:30–16:00 America/New_York`, `OTC_FX_METALS` `17:00 America/New_York`) — *شکاف‌های ظریف پاریتی بین کلاینت‌ها در `ENG-01b` بسته شد*.
  - **`ENG-02`**: تفکیک کامل Quote زنده / Forming Bar (`api/v1/quote.php`) از ذخیره قطعی کندل‌های بسته‌شده (`is_closed = 1`) با ایزوله‌سازی سخت‌گیرانه پرووایدر.
  - **`ENG-03`**: موتور تشخیص هوشمند Gap (`GapDetector` + `api/v1/gap_report.php` + جدول `data_quality_reports` در `002_phase2_3_tables.sql`) بدون خطای کاذب تعطیلات آخر هفته.
  - **`PHASE3-IMPORT`**: موتور ورود آرشیو تاریخی (`LocalCsvAdapter.php`، `api/v1/import_candles.php`، کلاینت وب `candleImport.js` و اندروید `CandleImportAlgorithm.kt` + `Phase3ImportCard.kt` با `SAF`) و جداول نسب/ممیزی (`data_import_batches`, `data_corrections`, `backup_records`, `audit_logs`) با اجبار `D1` برای سری‌های دو‌ستونی روزانه و رد قطعی فایل‌های تصویری (`ERR_IMAGE_UPLOAD_FORBIDDEN`).
  - **`UI-01`**: اتصال زنده `Symbol Intel` (`api/v1/symbol_intel.php` شامل کش MariaDB، `Yahoo Finance RSS`، `U.S. EIA RSS`، و `SEC EDGAR 10-K/10-Q/8-K` منحصراً برای سهام آمریکا) همراه با برچسب شفاف تفکیک داده خارجی vs محاسبات محلی.
  - **`SEC-01`**: اعمال `sanitizeSymbolCode()` سخت‌گیرانه (`[A-Z0-9._:-]` حداکثر ۲۰ کاراکتر) و پوشش کامل `escapeHtml()` در تمام DOM و `data-*`های وب.
  - **بهداشت امنیتی Auth/CORS (راستی‌آزمایی‌شده در کد فعلی):** حذف کامل ذخیره plaintext رمز عبور (`ci_saved_password` فقط `removeItem` می‌شود)، fallback آفلاین مبتنی بر **Salted SHA-256** (`ci_offline_pw_salt` + `ci_offline_pw_hash` و `PasswordHashAlgorithm.kt`)، حداقل طول رمز **۸ کاراکتر** در `auth.php`، و حذف `CORS *` به نفع whitelist + هدرهای امنیتی در `ApiEnvelope.php`.
  - **`INF-01` (بخش نرم‌افزاری)**: خروجی/بازیابی پشتیبان رمزنگاری‌شده (`PBKDF2-HMAC-SHA256` + `AES-256-GCM`) با حذف خودکار کلیدهای `BYOK` در `backup.php`، کلاینت وب، و `BackupExportHelper.kt` (با `SAF` بدون نیاز به مجوز Storage + `FileProvider` برای اشتراک امن فایل).
  - **`INF-02` (بخش اسکریپت استقرار)**: اسنپ‌شات خودکار `_ci_backups/snapshot_*` (حفظ ۳ نسخه آخر)، انتقال اتمیک فایل‌ها در `build-apk.yml`، و اندپوینت احراز هویت‌شده `rollback_release.php`.
  - **`TIMEFRAME-SYNC-WEB` (`v1.45.1`) + `CHART-STALL-01` (`ARCH-02` در `v1.47.39` و `STORAGE-QUOTA-01` در `v1.47.40`):** رفع قطعی قفل شدن تعویض نماد از واچ‌لیست و تعویض تایم‌فریم با یکسان‌سازی کامل `?v=1.47.40` در هر ۲۶ ماژول JS، محافظ Singleton سراسری `globalThis.__CI_STORE_SINGLETON_V1__`، پاک‌سازی `.tv-ohlc-overlay`، `safeLocalStorageSet()` با تخلیه خودکار کش کندل و سقف `250` کندل در `localStorage` (با حفظ `5000` کندل در RAM و MariaDB) و `needsFullBackfill` در کلیک واچ‌لیست.
  - **`FCST-LEGACY-CLEANUP-01` (`v1.47.35–v1.47.38`):** انتقال کامل ۱۲ پنل Unified Forecast Studio به سیستم بومی مرورگری و حذف دائمی رابط قدیمی `Legacy Forecast Studio` (`renderForecastStudioView`، سوییچر `Legacy/New`، `legacyForecastPoints`).
  - **`FORECAST-PKG1` (`v1.47.40`):** رفع کامل بسته اول باگ‌های زیرساختی، تقویمی (`calendarRegistry.js` برای `D1`/`W1`/`US_EQUITIES_RTH`، هم‌ترازی Timestamp در `forecastContract.js` و `structuralForecastEngine.js`)، ریاضی (`histAtrPct` در `OOD`، حذف سقف `12` و رفع کپی-پیست `KZ_LOWER_REACTION` در `forecastV130Analyzer.js`، مقیاس‌دهی `tfRatio` در MTF)، دفتر کل (`safeLocalStorageSet`، لنگر SHA-256 پس از trim، ثبت `modelId`/`providerId` و ارزیابی گام‌به‌گام `checkpointQuantiles`)، مدل‌های بومی (`ARIMA d=0`، نوآوری تک‌قدمه `Prophet`، prefix-invariance در `GRU`) و UI استودیو (پیش‌نمایش `Structural JS` در `#forecast-studio-canvas`، حفظ مدل بومی در تغییر Horizon و پرووایدر واقعی در Replay)؛ تست‌های رگرسیون `FORECAST-PKG1-CALENDAR-01..04` (**۴۳/۴۳ پاس**).
  - **`FORECAST-PKG2` (`v1.47.40`):** ارتقای عمیق دو مدل اصلی مرورگر — جداسازی و ارتقای `EmpiricalAnalogEngine` (`forecast/empiricalAnalogEngine.js`) با تطبیق چندویژگی + رژیم نوسان، NMS `de-clustering`، مقیاس‌دهی نوسان (`volScale`)، کوانتایل‌های وزن‌دار کرنلی و Medoid کل مسیر؛ ارتقای غیرمکانیکی `Structural JS` (`structuralForecastEngine.js`) با خوشه‌بندی `structural_zones` (S/R Magnets)، مدولاسیون چارکی تجربی، باندهای عدم قطعیت نامتقارن و شاخص `analog_agreement_score`؛ و ورود هر دو مدل به‌عنوان شهروند درجه اول به `Walk-Forward` (`walkForwardEvaluator.js`)، `Compare` (`forecastView.js`) و `Historical Replay` بدون بازگشت بی‌صدا به `naive_persistence`؛ تست‌های رگرسیون `FORECAST-PKG2-ANALOGS-01`، `FORECAST-PKG2-STRUCTURAL-02` و `FORECAST-PKG2-WF-REPLAY-03` (**۴۶/۴۶ پاس**).
  - **`FORECAST-PKG3` (`v1.47.40`):** بهینه‌سازی سرعت، تجربه کاربری تعاملی و احیای علمی هسته مدل SMC — جایگزینی کش تک‌اسلاتی با کش‌های محدود LRU (`_forecastBaseCache` ۱۶تایی و `_forecastViewCache` ۲۴تایی) + تفکیک بازانتخاب آنی مدل/حالت نمایش (`BASE_RESELECT` بدون بازاجرای Walk-Forward) و `skipBootstrap` هوشمند در پیش‌نمایش `Overview`؛ افزودن کراس‌هیر تعاملی و HUD شناور (ماوس/تاچ با `rAF` و خط مرجع `POC`) روی بوم‌های `#forecast-studio-canvas` و `#forecast-replay-canvas` (مقایسه زنده `Pred q50` vs `Actual` و پوشش باند ۸۰٪)؛ و یکپارچه‌سازی علّی `SMC Liquidity Magnets` (`VP POC/VAH/VAL` بدون حجم جعلی `100`، `FVG`های پرنشده و `EQH/EQL`) درون `structuralForecastEngine.js` و بنر `app.js`؛ تست‌های رگرسیون `FORECAST-PKG3-SMC-01`، `FORECAST-PKG3-CACHE-02` و `FORECAST-PKG3-HOVER-03` (**۴۹/۴۹ پاس**).
  - **`FORECAST-SMC-ENGINE-01` (`v1.47.40`):** فعال‌سازی مجدد **`SMCPredictionEngine` (`smc_prediction_js`)** به‌صورت یک مدل مستقل، علّی و علمی (`forecast/smcPredictionEngine.js`) بدون `Math.random`/`sin`/`cos`، بدون حجم جعلی `100` و بدون OHLC ساختگی؛ افزودن دکمه اختصاصی **`موتور نقدینگی SMC` / `SMC Prediction Engine`** در Forecast Studio و اتصال کامل به `Walk-Forward`، `AUTO OOS`، `Compare` (`#06B6D4` + نقاط عطف الماسی و خط `POC`)، چارت اصلی و `Historical Replay`؛ تست رگرسیون `FORECAST-SMC-ENGINE-01` (**۵۰/۵۰ پاس**).
  - **`BUGFIX-V14741-UI-SYNC-TF-SMC` (`v1.47.41`):** رفع ۴ باگ گزارش‌شده محیط زنده: (۱) پین کردن `.tv-topbar-right` و اسکرول/انقباض داخلی `.tv-topbar-left` و `.tv-open-tabs-strip` در `theme.css?v=1.47.41` برای جلوگیری از بیرون‌زدگی دکمه‌های سمت راست در صفحه چارت؛ (۲) افزودن ردیابی `serverHydratedCandleKeys` در `store.js` و `apiService.js` تا کش ۲۵۰ کندلی `localStorage` مانع بارگذاری تاریخچه کامل MariaDB نشود + همگام‌سازی خودکار هنگام ورود به Forecast Studio و نمایش بوم پیش‌نمایش زنده `Structural JS`/`SMC` کنار اخطار `DATA_NOT_READY`؛ (۳) افزودن `smc_prediction_js` به allowlist انتخاب مدل، قرار دادن دکمه آن در ردیف اول کنار `Structural JS` و `AUTO` و ارتقای یکپارچه کل فایل‌ها و `index.html` به `?v=1.47.41`؛ (۴) حفظ تنظیمات و بازمحاسبه خودکار پیش‌بینی فعال در تعویض تایم‌فریم (`set-timeframe` و `set-date-range`)؛ تست رگرسیون `BUGFIX-V14741-UI-SYNC-TF-SMC` (**۵۱/۵۱ پاس**).
  - **`FORECAST-ANALOG-REV23-CONSISTENCY-01` (`v1.47.41` — `2026-11-23`):** ارتقای کامل **`Causal Historical Analogs`** به نسخه **`Rev 2.3` (`2.3.0`)** شامل ثبات افق دقیق **`0.0000` (`Prefix-Invariance`)** روی `H = 15/30/60` با `H_CANONICAL_MAX = 60` و اسکن کامل `stride = 1` روی بافرهای `Float64Array` (~۴۷ میلی‌ثانیه/اجرا)، معماری **`Hybrid Two-Cluster MTF`** (`INTRADAY_M15_H1_H4` و `SWING_H4_D1_W1` با انطباق دقیق **`0.0000`** در تمام ۱۵ مرز ۴ساعته `H1×60` در برابر `H4×15` و حفظ نوسان طبیعی میانی + `BLOCK_RECONCILED` برای `M15↔H1`)، غنی‌سازی علّی ویژگی‌های شباهت (`EMA 20/50`، سوئینگ S/R، سشن نرم، زمینه کلان)، هم‌ترازی امتیازدهی `Walk-Forward` (پوشش ۸۰٪ = `81.33%`، `rMAE = 0.7329`، `WIS = 1.2640`) و نمایش بج‌های `H_ref=60` / `Hybrid MTF` در `forecastView.js`؛ تست رگرسیون `FORECAST-ANALOG-REV23-CONSISTENCY-01` (**۵۷/۵۷ پاس**).
  - **`FORECAST-STRUCT-SMC-REV23-CONSISTENCY-01` (`v1.47.41` — `2026-11-24`):** تعمیم کامل استاندارد **`Rev 2.3` (`2.3.0`)** به دو مدل ترجیحی دیگر — **`Structural JS`** (`structuralForecastEngine.js`) و **`SMC Prediction Engine`** (`smcPredictionEngine.js`) — شامل قفل افق مرجع `H_ref = 60` و ثبات پیشوند دقیق **`0.0000`** روی `H = 15/30/60` (هر ۵ کوانتایل و فیکسچر واقعی `SPOTBRENT M15`)، معماری **`Hybrid Two-Cluster MTF`** (`LOWER_TF_AGGREGATED` با انطباق **`0.0000`** در تمام ۱۵ مرز `H1×60` vs `H4×15`، `BLOCK_RECONCILED` یکنواخت برای `M15↔H1` و `ANCHOR_MACRO_AWARE` روی `H1/D1`)، اتصال کامل در `forecastEngine.js`، `walkForwardEvaluator.js`، `structuralForecastService.js`، `forecastView.js` و `app.js` (همراه با رفع `smcPoc: meta.pocPrice` و نمایش بج‌های `H_ref=60`/MTF)؛ تست رگرسیون `FORECAST-STRUCT-SMC-REV23-CONSISTENCY-01` (**۵۸/۵۸ پاس**).
  - **`FORECAST-UX-EVAL-CHECKLIST-01` (`v1.47.41` — `2026-11-24`):** بازطراحی کامل UX و گزارش‌دهی دفتر کل Forecast در وب (`forecastLedger.js`, `forecastView.js`, `app.js`, `theme.css`) شامل: کارت خلاصه وضعیت و هم‌گرایی چندمدله در بالا، جمع‌شدن جزئیات فنی/SHA-256/جدول‌های خام داخل آکاردئون‌های بازشو (`.ci-fc-accordion`)، جدول یکپارچه اسنپ‌شات ↔ نتیجه با زمان دقیق UTC ثبت و سررسید، ارزیابی ۵بعدی (جهت، نرخ اصابت کندل‌به‌کندل + `MAE%`، واکنش `S/R`، پوشش بازه، امتیاز `0–100`) به همراه ۴ تحلیل تکمیلی (`×ATR`، برتری نسبت به `Naive`، `Early Invalidation`، برچسب وضعیت بازار)، ثبت گروهی هم‌زمان چند مدل (`Record Selected Models` با `batchId` واحد)، مقایسه کنارهم با تاج `Best Performer`، کارت امتیازی غلتان ۲۰ پیش‌بینی آخر، فیلترهای تاریخچه و بوم بازپخش بصری چندمسیره (`#forecast-ledger-overlay-canvas`)؛ تست رگرسیون `FORECAST-UX-EVAL-CHECKLIST-01` (**۵۹/۵۹ پاس**).
- **باقی‌مانده و نیازمند اقدام:** ثبت گزارش ارزیابی OOS زنده روی کل نمادها و تایم‌فریم‌ها (`FCST-MODEL-QA-01`)، آزمون E2E مرورگر Production (`FCST-PROD-01`)، انتقال آینده مدل‌های Python (`Chronos-2` و بازبینی مدل‌های پایتونی) پس از تهیه سرور مستقل (`FCST-RT-01`)، بررسی عملی cPanel پس از استقرار (`INF-01`/`INF-02` و بخش ۴.۱)، همگام‌سازی ابری Ledger و provenance (`FCST-LEDGER-03`)، و فاز ۵ (`Outcome Evaluator` و `Champion/Challenger Rollback`).

> **یادداشت تاریخی (`PRED-CORE-ARCHIVED` در `v1.45.1` و پاک‌سازی `2026-11-21`):** در حال حاضر وب با موتور بومی مرورگر (`v1.47.41` شامل هر ۳ مدل ترجیحی با استاندارد **`Rev 2.3`**: `Causal Historical Analogs`، `Structural JS` و `SMC Prediction Engine`، بعلاوه ۱۰ مدل رجیستری و `Ensemble`) زنده است و مسیر `Chronos-2` تا تهیه سرور مستقل Python به صورت `Shelved` حفظ شده است. پوشه `/archive/` و ۱۱ سند منسوخ/تکراری با تأیید مالک در `2026-11-21` پاک‌سازی شدند (بک‌آپ کامل نزد مالک محفوظ است). مشخصات و نتایج راستی‌آزمایی `Rev 2.3` در [`FORECAST_CONSISTENCY_AND_ANALOG_ANALYSIS_V1.md`](../02-architecture/FORECAST_CONSISTENCY_AND_ANALOG_ANALYSIS_V1.md) ثبت شده است.

---

## ۱. اولویت بحرانی — زیرساخت و عملیات cPanel (`P0 — Operations Pending Live Verification`)

| شناسه | موضوع | وضعیت در کد فعلی | بخش نیازمند تأیید عملی روی cPanel | مرجع |
|---|---|---|---|---|
| **`INF-01`** | **بکاپ هاست (`jetbackup5d: down`) و Backup/Restore رمزنگاری‌شده** | `[x]` **در کد پیاده شد:** `backup.php` + کلاینت وب + `BackupExportHelper.kt` (`PBKDF2` + `AES-256-GCM`، حذف کامل کلیدهای `BYOK`). | `[ ]` بررسی وضعیت `jetbackup5d` در پنل cPanel و ثبت گزارش یک آزمون عملی Download/Restore روی محیط زنده. | `INFRASTRUCTURE_INVENTORY.md`, `Master Spec §6.10` |
| **`INF-02`** | **Rollback استقرار (`build-apk.yml`)** | `[x]` **در کد پیاده شد:** اسنپ‌شات خودکار پیش از overwrite در `_ci_backups/` + نوشتن با فایل موقت + `rollback_release.php`. | `[ ]` اجرای آزمایشی یک نوبت `rollback_release.php` روی هاست زنده `chart.manico.es` پس از استقرار CI. | `INFRASTRUCTURE_INVENTORY.md`, `Master Spec §3.1` |

---

## ۲. اولویت بالا — هسته داده، تایم‌فریم و تازگی قیمت (`P1 — Closed in Code`)

| شناسه | موضوع | وضعیت پیاده‌سازی (`v1.39.0`) | فایل‌های کلیدی |
|---|---|---|---|
| **`ENG-01`** | **هم‌ترازی سشن‌های معاملاتی و DST (`Session Alignment`)** | `[x]` **تکمیل شد:** محاسبه سشن و بازه‌های `H4`/`D1` بر اساس `America/New_York` (`RTH 09:30–16:00` برای سهام/شاخص، `17:00 NY` برای فلزات/فارکس، `00:00 UTC` برای کریپتو). | `UtcTimeAnchor.php`, `TimeframeAggregator.php`, `priceFormatter.js`, `timeframeAggregator.js`, `UtcTimeAnchorAlgorithm.kt`, `TimeframeAggregatorAlgorithm.kt` |
| **`ENG-02`** | **تفکیک Quote زنده / Forming Bar از Sync کندل‌های بسته‌شده** | `[x]` **تکمیل شد:** اندپوینت فقط-خواندنی `quote.php` (Binance Kline، Twelve Data `/price`، Yahoo `1m`، یا آخرین کندل بسته همان پرووایدر)؛ کندل باز هرگز در جدول `candles` نوشته نمی‌شود. | `quote.php`, `apiService.js`, `app.js`, `WorkspaceRepository.kt`, `MainViewModel.kt` |
| **`ENG-03`** | **موتور تشخیص هوشمند Gap (`Smart Gap Detection`)** | `[x]` **تکمیل شد:** بررسی بازه‌های مفقود بر پایه تقویم سشن (بدون خطای تعطیلات آخر هفته)، ثبت در جدول `data_quality_reports` و نمایش کارت ممیزی در Settings وب و اندروید. | `GapDetector.php`, `gap_report.php`, `002_phase2_3_tables.sql`, `gapDetector.js`, `GapDetectorAlgorithm.kt`, `Phase2WorkspaceSheets.kt` |

---

## ۳. اولویت متوسط — فیدهای زنده بنیادی و بهداشت امنیتی (`P2 — Closed in Code`)

| شناسه | موضوع | وضعیت پیاده‌سازی (`v1.39.0`) | فایل‌های کلیدی |
|---|---|---|---|
| **`UI-01`** | **اتصال تب‌های `News`، `SEC EDGAR` و تحلیل کلان به فید زنده + برچسب شفاف منبع** | `[x]` **تکمیل شد:** `symbol_intel.php` خبرهای زنده Yahoo Finance RSS، EIA Energy RSS (برای انرژی) و SEC EDGAR API (`10-K/10-Q/8-K` منحصراً برای سهام آمریکا) به همراه تقویم کلان و شاخص‌های بین‌بازاری (`DXY`, `US10Y`, `Brent/WTI`) را با کش ۱۵ دقیقه‌ای ارائه می‌دهد؛ کارت‌های `Minds/Ideas` نیز صراحتاً به عنوان تحلیل محلی کندل برچسب‌گذاری شده‌اند. | `symbol_intel.php`, `apiService.js`, `watchlistView.js`, `WorkspaceRepository.kt`, `Phase2WorkspaceSheets.kt` |
| **`SEC-01`** | **سخت‌گیری ورودی نماد (`sanitizeSymbolCode`) و پوشش `escapeHtml()`** | `[x]` **تکمیل شد:** محدودسازی کد نماد به `[A-Z0-9._:-]` (۲ تا ۲۰ کاراکتر) در PHP/Web/Android + پوشش کامل `escapeHtml()` روی تمام ویژگی‌های HTML و Template Stringهای وب. | `store.js`, `app.js`, `watchlistView.js`, `SymbolCatalogCoordinator.kt` |

---

## ۳.۱. یافته‌های ممیزی جدید و وضعیت تکمیل در کد (`Resolved Action Items — v1.40.0`)

> تمامی موارد کدنویسی این بخش در نسخه `1.40.0` در هر سه لایه (**PHP Backend**، **Web ES Modules**، و **Android Kotlin/Compose**) پیاده‌سازی و با تست‌های پاریتی (`Phase2AlgorithmsTest.kt` و `tests/web_parity.test.mjs`) تأیید شدند:

| شناسه | اولویت | وضعیت پیاده‌سازی در کد (`v1.40.0`) | خلاصه تغییرات اعمال‌شده | فایل‌های به‌روزرسانی‌شده |
|---|---|---|---|---|
| **`SYNC-01`** | `P0` | `[x]` **تکمیل شد (`Code Complete`)** | ۱) افزودن ذخیره و سینک دوطرفه `volumePaneRatio` (۱۶٪ / ۲۲٪ / ۳۰٪)، `activeTabId`، `timezoneMode` (`UTC`/`LOCAL`)، `showPivotPoints`، `showFutureProjection` و تمام پرچم‌های اندیکاتور در `store.js`، `apiService.js`، `WorkspaceRepository.kt` و `MainViewModel.kt`.<br>۲) حذف شرط نادیده‌گرفتن تب‌ها و اندیکاتورهای دانلودشده از سرور در وب و اندروید (مرج هوشمند تب‌های سرور با حفظ کش کندل‌ها).<br>۳) فراخوانی خودکار `scheduleDebouncedWorkspaceSync()` / `scheduleDebouncedCloudSync()` پس از هر تغییر در اندیکاتورها، ارتفاع پنل حجم، تایم‌زون و تنظیمات چارت. | `store.js`, `apiService.js`, `app.js`, `WorkspaceRepository.kt`, `MainViewModel.kt`, `ChartTabState.kt` |
| **`ENG-01b`** | `P0` | `[x]` **تکمیل شد (`Code Complete`)** | ۱) افزودن بررسی پیوستگی کندل‌های فرزند (`areChildrenContiguous` با آگاهی از تعطیلات بازار) در `TimeframeAggregator` روی هر سه پلتفرم.<br>۲) حفظ `preserveRawOpenTime = sessionBounds.sessionAnchored` در `TimeframeAggregatorAlgorithm.kt` تا لنگر سشن توسط `snapToCandleOpenUtc` بازنویسی نشود.<br>۳) افزودن هم‌ترازی سشن `H1` (`:30 ET`) برای `US_EQUITIES` در اندروید، یکسان‌سازی کامل تشخیص نمادهای سفارشی در `getSessionCalendar`، هم‌ترازی آستانه `D1->W1` روی `3` کندل، و اعمال چک DST-aware `America/New_York` (`17:00 NY`) برای تعطیلات آخر هفته OTC در هر سه پلتفرم. | `UtcTimeAnchorAlgorithm.kt`, `TimeframeAggregatorAlgorithm.kt`, `CandleValidatorAlgorithm.kt`, `UtcTimeAnchor.php`, `TimeframeAggregator.php`, `priceFormatter.js`, `timeframeAggregator.js`, `store.js` |
| **`ENG-03b`** | `P0` | `[x]` **تکمیل شد (`Code Complete`)** | ۱) یکسان‌سازی توزیع حجم `Volume Profile (VRVP)` بر پایه همپوشانی دقیق قیمت (`overlap / totalOverlap`) و سیاست `hasRealVolume ? Math.max(0, vol) : 1.0` بین `technicalIndicators.js` و `PriceFormatterAlgorithm.kt`.<br>۲) یکسان‌سازی وزن‌دهی `VWAP` برای کندل‌های `volume = 0` در صورت وجود حجم واقعی در سشن.<br>۳) مستثنا کردن `CRYPTO_24_7` از حذف کندل‌های کم‌نوسان `Comb` در هر سه پلتفرم و افزودن `filterSyntheticWeekendAndCombCandles` به کلاینت وب. | `technicalIndicators.js`, `store.js`, `PriceFormatterAlgorithm.kt`, `CandleValidator.php`, `CandleValidatorAlgorithm.kt` |
| **`PAR-01`** | `P0` | `[x]` **تکمیل شد (`Code Complete`)** | اصلاح `resolvePriceBasis` در `host_subdomain/assets/js/core/store.js` برای برگرداندن `'CFD Feed'` روی `tvdatafeed` + `SPOTBRENT` و هم‌ترازی کامل جدول `Price Basis` بین Web، PHP و Android. | `store.js`, `ProviderCatalog.php`, `ProviderId.kt`, `UtcTimeAnchorAlgorithm.kt` |
| **`AUTH-01`** | `P1` | `[x]` **تکمیل شد (`Code Complete`)** | ارتقای `sendRecoveryEmailMessage()` در `auth.php` با پشتیبانی از ۱) API تراکنشی HTTPS (`RESEND_API_KEY`)، ۲) سوکت TLS/SSL SMTP احراز هویت‌شده (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` از `env.local.php`)، و ۳) fallback ایمیل محلی با Envelope Sender. | `host_subdomain/api/v1/auth.php` |
| **`INF-03`** | `P1` | `[x]` **تکمیل شد (`Code Complete`)** | محدودسازی کوئری `DELETE FROM candles` در `.github/workflows/build-apk.yml` (خط ۲۴۰) به `timeframe NOT IN ('D1', 'W1')`، نمادهای غیرکریپتو، و بازه تعطیلات آخر هفته OTC (`Fri 22:00 – Sun 21:59 UTC`) هم‌تراز با `candles_sync.php`. | `.github/workflows/build-apk.yml`, `host_subdomain/api/v1/candles_sync.php` |
| **`QA-01`** | `P1` | `[x]` **تکمیل شد (`Code Complete`)** | ایجاد و اجرای تست‌های واحد مشترک در اندروید (`Phase2AlgorithmsTest.kt`) و وب (`tests/web_parity.test.mjs` با `node --test`) برای راستی‌آزمایی `PAR-01`، `SYNC-01`، `ENG-01b`، `ENG-03b`، `IND-01` و `PRED-09`/`PRED-10`. | `app/src/test/java/es/manico/chartintelligence/Phase2AlgorithmsTest.kt`, `tests/web_parity.test.mjs` |
| **`IND-01`** | `P2` | `[x]` **تکمیل شد در `v1.41.0` (`Code Complete`)** | پیاده‌سازی کامل هر ۴ واریانت **`Pivot Points` (`STANDARD`, `FIBONACCI`, `CAMARILLA`, `WOODIE`)** شامل سطوح **`R3/R4` و `S3/S4`** روی بوم چارت وب (`chartRenderer.js`) و اندروید (`CandlestickCanvas.kt`) با لنگر جلسه معاملاتی قبلی، انتخابگر نوع پیوت در پنل Indicators و سینک کامل در Workspace. | `technicalIndicators.js`, `chartRenderer.js`, `headerView.js`, `Phase2IndicatorsAlgorithm.kt`, `CandlestickCanvas.kt`, `ChartTabState.kt`, `ChartViewScreen.kt` |
| **`PRED-09`** | `P1` | `[x]` **جایگزین‌شده در وب (`v1.47.35–v1.47.38`)** | مسیر Overlay کندل‌های جعلی قدیمی حذف شد و با ۳ حالت بدون OHLC جعلی (`Quantile Fan`, `Hybrid`, `Quantile Bars`) در وب جایگزین گردید (اندروید همچنان غیرفعال). | `chartRenderer.js`, `forecastContract.js` |
| **`PRED-10`** | `P1` | `[x]` **جایگزین‌شده در وب (`v1.47.35–v1.47.41`)** | موتور پیش‌بینی بومی مرورگر در وب فعال است (کدهای آرشیو قدیمی در پاک‌سازی `2026-11-21` حذف شدند). | `host_subdomain/assets/js/forecast/`, `structuralForecastEngine.js` |
| **`PRED-01..08`** | `P1` | `[x]` **فعال روی وب مرورگری (`v1.47.41`) · اندروید غیرفعال** | Unified Browser-Native Forecast Studio روی وب فعال است و مایگریشن‌های `003_*`/`004_*` حفظ شده‌اند. | `host_subdomain/assets/js/forecast/` |
| **`PRED-DL-WORKER`** | `P2` | `[ ]` **موکول به تهیه سرور مستقل Python (`FCST-RT-01`)** | فایل‌های `Shelved` مربوط به `Chronos-2` (`chronos2_worker.py` و `chronos2_forecast.php`) روی هاست اشتراکی اجرا نمی‌شوند و پس از تهیه سرور مستقل Python بازبینی و راه‌اندازی خواهند شد. | `host_subdomain/scripts/chronos2_worker.py`, `host_subdomain/api/v1/chronos2_forecast.php` |
| **`UI-02`** | `P2` | `[x]` **درخت اشیاء کامل شد (`Web + Android` در `v1.47.41`) · بخش فاز ۵ باقی‌مانده** | **درخت اشیاء پیشرفته (`Object Tree`)** در وب (`objectTreeView.js`, `toolRailView.js`, `headerView.js`, `app.js`, `chartRenderer.js`, `store.js`, `drawingGeometry.js`) و اندروید (`ObjectTreeSheet.kt`, `ChartViewScreen.kt`, `ChartDrawingModels.kt`, `ChartDrawingCoordinator.kt`, `CandlestickCanvas.kt`, `WorkspaceRepository.kt`) با پرچم‌های `visible`/`locked` سازگار با گذشته، همگام‌سازی ابری، نمایش/مخفی‌سازی، قفل/بازکردن، حذف و مدیریت لایه‌های فعال پیاده‌سازی و با تست `UI-02-OBJECT-TREE-01` تأیید شد. *(بخش `Champion/Challenger Rollback` همچنان در فاز ۵ باقی می‌ماند.)* | `objectTreeView.js`, `ObjectTreeSheet.kt`, `ROADMAP_BACKLOG.md` |
| **`CHART-STALL-01`** | `P0` | `[x]` **بسته‌شده در کد و تست (`v1.47.39–v1.47.40`)** | هر دو علت ریشه‌ای (`ARCH-02` Split-Singleton در `v1.47.39` و `STORAGE-QUOTA-01` خطای `QuotaExceededError` هنگام انتخاب سهم دوم واچ‌لیست در `v1.47.40`) برطرف و با تست‌های `ARCH-02` و `STORAGE-QUOTA-01` پوشش داده شدند. | `core/store.js`, `app.js`, `apiService.js`, `tests/web_parity.test.mjs` |
| **`PHASE6-SIM-01`** | `P2` | `[x]` **تکمیل شد (`Web + Android` در `v1.47.41`)** | **شبیه‌ساز آفلاین استراتژی معاملاتی (`strategy-sim/1.0`)** مستقل برای هر `chart_id` با سرمایه پایه `EUR 1,000`، ریسک `1%`، ۴ پریست مبتنی بر `TechnicalAnalysisCore` (مستقل از موتور Forecast)، اجرای علّی روی بازشدن کندل بعد، قاعده محافظه‌کارانه `SL_BEFORE_TP`، هزینه‌های صریح + تحلیل حساسیت `1.0x/1.5x/2.0x`، نمودار `Equity Curve` و دفتر کل معاملات در وب و اندروید بدون هیچ API کارگزاری؛ تأییدشده با تست‌های `PHASE6-STRATEGY-SIM-01` و `phase6_strategySimulator_causalExecutionSlBeforeTpAndCostSensitivity`. | `strategySimulator.js`, `strategyLabView.js`, `StrategySimulatorAlgorithm.kt`, `StrategyLabSheet.kt`, `TRADING_STRATEGY_SPEC.md` |
| **`ADMIN-RBAC-01`** | `P2` | `[x]` **تکمیل شد (`PHP + Web + Android` در `v1.47.41`)** | **مدیریت چندکاربره (`Multi-User Admin UI`)** با اندپوینت جدید `admin_users.php` و ارتقای `auth.php` (بررسی سخت‌گیرانه نقش `owner`/`admin` سمت سرور، مسدودسازی `is_active = 0`، محافظت از `owner` و حذف/قفل‌کردن خود، کوئری‌های پارامتریک PDO، هش `Argon2id/Bcrypt`، ابطال نشست‌ها و لاگ ممیزی) + رابط دوزبانه در تب `Account` تنظیمات وب (`adminUsersView.js`) و اندروید (`AdminUsersSection.kt`)؛ تأییدشده با تست `ADMIN-USERS-RBAC-01`. | `admin_users.php`, `auth.php`, `adminUsersView.js`, `AdminUsersSection.kt`, `SettingsScreen.kt` |




---

## ۴. موارد نیازمند راستی‌آزمایی هاست و تصمیمات باز پیش از فاز ۴ (`TO VERIFY / OPEN`)

### ۴.۱. موارد زیرساختی تاییدنشده روی cPanel (`Section 5 of INFRASTRUCTURE_INVENTORY.md`)
- [ ] تایید عملی نسخه و محدودیت‌های زنده PHP زیر `chart.manico.es` روی هاست cPanel (بخش گزارش تشخیصی ایمن `php_runtime` شامل `php_version`, `memory_limit`, `max_execution_time`, `upload_max_filesize`, `post_max_size`, `extensions` در `v1.41.0` به `api/v1/system/status.php` و صفحه Settings وب/اندروید اضافه شد؛ مشاهده مقادیر واقعی پس از استقرار روی سرور زنده باقی مانده است).
- [ ] فعال بودن `php` CLI، وضعیت و حداقل بازه مجاز `crond` در سطح اکانت برای همگام‌سازی ۱۵ دقیقه‌ای (`scripts/cron_sync_tvdatafeed.php`).
- [ ] دسترسی خروجی HTTPS سرور هاست به دامنه‌های خارجی (`api.twelvedata.com`, `query1.finance.yahoo.com`, `stooq.com`, `data.eia.gov`, `data.sec.gov`, `feeds.finance.yahoo.com`) و وجود هرگونه محدودیت/Rate Limit روی IP اشتراکی.
- [ ] وضعیت واقعی دسترسی `SSH` برای کاربر اکانت، امکان یا عدم امکان اجرای `Python` / `Worker` دائمی و سقف اتصالات هم‌زمان MariaDB.

### ۴.۲. پرسش‌های باز طراحی پیش از فازهای ۳.۲ و ۴ تا ۶ (`Master Spec §17.4`)
1. **پوشش و پیوستگی واقعی تاریخچه منابع:** تأیید عمق کامل تاریخچه و رفتار نرخ/مجوز Dukascopy، `biquote` و `Stooq` برای بازه‌های چندساله هر `chart_id`.
2. **امنیت مخزن کلیدهای `BYOK` چندکاربره:** طراحی نهایی ذخیره رمزنگاری‌شده کلید کاربر روی سرور در محیط چندکاربره و سیاست مالکیت/اشتراک‌گذاری نمودارها.
3. ~~**قرارداد رسمی `forecast-contract/v1` و ارزیابی مدل (پیش از فاز ۴ و ۵):**~~ ✅ **نهایی‌سازی و پیاده‌سازی‌شده در `forecast-contract/v2` (`Rev 2.1` در کد `forecastContract.js` و `FORECAST_SYSTEM_SPEC_V1.md`):**
   - چندک‌های ۵گانه (`q10`, `q25`, `q50`, `q75`, `q90`) با WIS 5Q و Conformal نرمال‌شده با EWMA؛ تعریف خنثی و ۳ سناریو با L2 Multinomial Logit.
   - امبارگو یکپارچه $E = \max(5, \lceil 0.25 H \rceil)$، حجم مؤثر بارتلت ($N_{\text{eff}} \ge 25$)، تفکیک `DATA_NOT_READY` / `PROVISIONAL` / `INSUFFICIENT_EVIDENCE` / `NO_EDGE` / `VALID` و زنجیره SHA-256 با گردکردن ۱۲-رقمی (`inputHash`). موارد باقیمانده صرفاً مربوط به آستانه‌های `Promotion Gate` فاز ۵ (`Champion/Challenger Rollback`) و کلاستر دائمی Python Worker است.
4. **پارامترهای استراتژی معاملاتی (پیش از فاز ۶ — [`TRADING_STRATEGY_SPEC.md`](../01-product/TRADING_STRATEGY_SPEC.md)):** قوانین تبدیل سناریو به ورود، تخصیص چندتارگته `TP1/TP2/TP3`، جابه‌جایی `Stop Loss` به `Break-Even`، سقف ریسک هم‌زمان، `Max Drawdown Halt` و مدل دقیق `Swap / Spread / Slippage`.


## ۵. پیش‌بینی — موانع و نواقص باز (Forecast Migration Blockers — 2026-11-19)

> این بخش دفتر متمرکز مشکلات Forecast است. موارد زیر عمداً در یک محل نگهداری می‌شوند تا بعداً به‌صورت یک بسته تصمیم‌گیری اولویت‌بندی شوند. ثبت در این فهرست به معنی شروع رفع یا تأیید راه‌حل نیست. وضعیت هر مورد فقط با شواهد کد، CI و آزمون محیط مقصد تغییر می‌کند. این بخش برای وضعیت فعلی New/Legacy بر توضیحات تاریخی آرشیو Forecast در بخش‌های قدیمی‌تر همین سند اولویت دارد.

| شناسه | اولویت | مسئله / ریسک | شواهد فعلی | تصمیم یا اقدام بعدی | وضعیت |
|---|---|---|---|---|---|
| `FCST-RT-01` | P0 | **نبود Runtime اجرایی Python روی هاست اشتراکی**؛ Chronos-2 و سایر Python Workerها به اجرای Python وابسته‌اند و QueueManager از PHP `exec()` استفاده می‌کند. | `Chronos2QueueManager.php` در صورت غیرفعال‌بودن `exec()` خطای صریح می‌دهد؛ در وب فعلی (`v1.47.40`) هیچ مسیر زنده‌ای Python را صدا نمی‌زند. | **تصمیم قطعی مالک (2026-11-19):** فعلاً ۱۰۰٪ روی موتور بومی مرورگر (`Causal Historical Analogs` و `Structural JS`) بمانیم و پس از تهیه سرور مستقل Python در روزهای آینده، معماری Python/Chronos-2 بازبینی و راه‌اندازی شود. | `DEFERRED / AWAITING_DEDICATED_PYTHON_SERVER` |
| `FCST-DEPLOY-01` | P0 | **ناپایداری دسترسی Deployment Secrets در Runهای قبلی**؛ وضعیت هر انتشار باید از خروجی انتقال فایل تأیید شود. | Runهای `44516442724`، `44516802833`، `44529239192`، `44529496676`، `44530093903`، `44530137222` و `44531190348` با خروجی صریح `ok:true`, `deployed_files:123` و `seeded_tvdatafeed_candles:42291` پایان یافتند؛ بین برخی Runها شکست تست یا لغو نیز رخ داد و نباید این موارد را زنجیره موفقیت پیوسته تلقی کرد. | نتیجه واقعی remote upload در هر Run کنترل شود؛ چندین انتشار اخیر تأیید شده‌اند، اما همه Runهای بین آن‌ها موفق نبوده‌اند. | `STABLE_RECENTLY / MULTIPLE_DEPLOYS_CONFIRMED` |
| `FCST-PROD-01` | P1 | **نبود آزمون مرورگر تعاملی خودکار روی نسخه Production** بعد از آخرین Deploy (`v1.47.40`). | تست‌های محلی Node روی `v1.47.40` برابر ۴۶/۴۶ پاس هستند (شامل `ARCH-02`، `STORAGE-QUOTA-01`، `FORECAST-PKG1-CALENDAR-01..04` و `FORECAST-PKG2-ANALOGS-01..03`)؛ ابزار مرورگر تعاملی در محیط CI در دسترس نیست. | بررسی دستی روی `chart.manico.es` پس از استقرار `v1.47.40` (تعویض سهم واچ‌لیست، تایم‌فریم، و Forecast Studio). | `OPEN / BROWSER_E2E_NOT_VERIFIED` |
| `FCST-API-01` | P1 | **تست Provider guard در حال حاضر ایستا است، نه آزمون HTTP واقعی.** | `CHRONOS2-PROVIDER-GUARD-01` ترتیب کد allow-list را بررسی می‌کند؛ endpoint در محیط cPanel اجرا نشده است. | بعداً هم‌زمان با راه‌اندازی سرور مستقل Python تست Integration اضافه شود. | `DEFERRED / STATIC_TEST_ONLY` |
| `FCST-EVAL-01` | P1 | **چرخه کامل ارزیابی و persistence ابری هنوز کامل نیست؛ UIهای اصلی ۱۲-پنلی و ارزیابی ۵بعدی محلی متصل شده‌اند.** | تمام ۱۲ پنل Overview/Scenario، Models، Walk-Forward/Calibration، Ledger یکپارچه ۵بعدی (با مقایسه گروهی چندمدله، کارت امتیازی غلتان ۲۰تایی، فیلتر و بوم هم‌پوشانی بصری)، Replay و Compare متصل هستند (`FORECAST-UX-EVAL-CHECKLIST-01`). Ledger همچنان محلی (`localStorage` با سقف ۱۲۰ Snapshot و ۲۴۰ رویداد Lifecycle) است و Server Sync ندارد. | پذیرش عملکرد تاریخچه بزرگ Replay و طراحی Server Sync چنددستگاهی در فاز بعدی. | `PARTIAL / UNIFIED_STUDIO_AND_5D_LEDGER_LIVE — LOCAL_ONLY` |
| `FCST-ENS-01` | P2 | **Calibrated Ensemble باید از نظر کیفیت OOS و وزن‌دهی پذیرفته شود.** | گزینه `ensemble` در Unified Studio انتخاب‌پذیر است و مسیر اجرا/نمایش دارد؛ اما وجود مسیر اجرایی اثبات برتری یا پذیرش آماری نیست. | Walk-Forward و OOS مستقل برای هر نماد/تایم‌فریم، ارزیابی وزن‌ها، baseline comparison و جلوگیری از leakage تکمیل شود. | `IMPLEMENTED_IN_CODE / OOS_ACCEPTANCE_PENDING` |
| `FCST-MODEL-CFG-01` | P1 | **تنظیمات فعال‌سازی/وزن/پارامتر مدل‌های Native در New در دسترس نبود.** | پنل موجود `renderModelsPanel()` منتقل شد؛ کنترل Worker خارجی عمداً حذف است. تست `FORECAST-NEW-MODEL-CONFIG-01/02` پاس است. | حفظ رگرسیون؛ تغییر وزن/پارامتر مدل باید Forecast قبلی را invalidate کند. | `CLOSED / NEW_UI_AND_CI_VERIFIED` |
| `FCST-COMPARE-01` | P2 | **Compare چندمدلی باید در Preview و Main Chart هم‌زمان و قابل‌کنترل باشد.** | Preview دارای انتخاب مستقل overlay (شامل `structural_wave_js` و `empirical_analogs` از `FORECAST-PKG2`) و Side-by-Side است؛ Main Chart نیز مسیر q50 مدل‌های Native موفق و انتخاب‌شده را با خط‌چین و برچسب مدل رسم می‌کند. | پایش خوانایی overlayها روی Production. | `IMPLEMENTED_IN_CODE / CI_VERIFIED` |
| `FCST-MODEL-QA-01` | P1 | **پذیرش کیفیت پیش‌بینی مدل‌ها با CI ساختاری اثبات نمی‌شود.** | در `FORECAST-ANALOG-REV23-CONSISTENCY-01` (`2026-11-23`) و `FORECAST-STRUCT-SMC-REV23-CONSISTENCY-01` (`2026-11-24`) هر ۳ مدل ترجیحی مرورگر (`Causal Historical Analogs`، `Structural JS` و `SMC Prediction Engine`) به استاندارد `Rev 2.3` (`0.0000` ثبات افق + `Hybrid Two-Cluster MTF`) ارتقا یافته و با تست **۵۸/۵۸** و بنچمارک Walk-Forward OOS (پوشش ۸۰٪ آنالوگ = `81.33%`، `WIS = 1.9972` و دقت جهت `73.33%` برای `SMC`) تأیید شدند؛ ثبت گزارش پذیرش OOS رسمی روی کل نمادها/تایم‌فریم‌های زنده پس از استقرار باقی مانده است. | اجرای بنچمارک OOS روی داده‌های زنده تمام نمادها/تایم‌فریم‌ها و پس از آن ارزیابی مدل‌های سرور Python. | `PARTIAL / ALL_3_PREFERRED_REV23_DONE — LIVE_OOS_PENDING` |
| `FCST-LEGACY-01` | P1 | **هم‌زیستی Legacy و New نیازمند کنترل overlay و مسیرهای مستقل بود.** | در گام ۳ (`v1.47.38`) رابط Legacy (`renderForecastStudioView`، سوییچر `Legacy/New` و `legacyForecastPoints`) با تأیید صریح مالک به طور کامل پاک‌سازی شد؛ تست `FORECAST-PHASE3-LEGACY-CLEANUP-01` پاس است. | بسته شد؛ فقط یک Unified Forecast Studio در وب وجود دارد. | `CLOSED / LEGACY_REMOVED_IN_V1.47.38` |
| `FCST-DATA-01` | P1 | **Provider ذخیره‌شده در تب‌های قدیمی می‌توانست cache key غیرمجاز بسازد.** | Hydration و تعویض نماد با `isProviderEnabled()` محدود به `tvdatafeed` شده‌اند؛ تست `FORECAST-DATA-SOURCE-GUARD-01` پاس است. | حفظ تست رگرسیون و کنترل هر مسیر جدید ورود داده. | `CLOSED / FIXED_AND_CI_VERIFIED` |
| `FCST-LEDGER-02` | P1 | **اعتبارسنجی ورودی ارزیابی Ledger در برابر کندل باز و ترتیب داده ناکافی بود.** | `evaluateMaturedForecasts()` کندل باز را حذف، timestamp تکراری را deduplicate و ورودی را صعودی مرتب می‌کند؛ تست `FORECAST-NEW-EVALUATION-01` پاس است. | حفظ تست رگرسیون. | `CLOSED_IN_CODE / CI_VERIFIED` |
| `FCST-LEDGER-03` | P2 | **همگام‌سازی ابری Ledger و Provenance چنددستگاهی (بخش محلی در `FORECAST-PKG1` بسته شد).** | در `FORECAST-PKG1` (`v1.47.40`) فیلدهای `modelId`، `providerId`، `checkpointQuantiles` گام‌به‌گام (`5`/`10`/`horizonBars`)، لنگر SHA-256 مقاوم به trim (`120`/`240`) و `safeLocalStorageSet` در دفتر کل محلی اضافه و با تست `FORECAST-PKG1-LEDGER-03` تأیید شدند؛ همگام‌سازی ابری سرور و provenance چنددستگاهی همچنان باز است. | اضافه کردن endpoint و sync ابری دفتر کل در فاز بعدی بدون شکستن سازگاری Hash Chain محلی. | `PARTIAL / LOCAL_PROVENANCE_AND_ANCHOR_FIXED` |
| `FCST-DOC-01` | P2 | **تعارض تاریخی در مستندات Forecast و انباشت فایل‌های منسوخ.** | در `2026-11-21` با تأیید مالک، `/archive/`، `public/assets/aistudio/` و ۱۱ سند منسوخ/تکراری حذف شدند و تمام مستندات زنده (`README.md`، `docs/README.md`، `AGENTS.md`، `OPEN_ISSUES.md`، `ROADMAP_BACKLOG.md`، `PROJECT_GUIDE.md` و `CHANGELOG.md`) روی `v1.47.41` (`51/51` تست) هم‌تراز شدند. | حفظ هم‌ترازی اسناد هم‌زمان با هر تغییر بعدی. | `CLOSED / CLEANED_AND_RECONCILED_TO_V1.47.41` |

### ۵.۱. شواهد CI آخرین اصلاح Chronos-2

- Commit مبنا: `fbcb55082f20e50f82a57c3b6b9c3770f5fe1495`.
- Workflow run: `44496501529` — نتیجه کلی `success`.
- Web parity: **۱۸ تست موفق، صفر شکست**؛ تست `CHRONOS2-PROVIDER-GUARD-01` نیز اجرا و پاس شد.
- PHP lint برای `chronos2_forecast.php` و `Chronos2QueueManager.php` موفق بود.
- بسته وب ۱۲۲ فایل و Artifact ID `14516140010` ساخته شد.
- **cPanel remote upload انجام نشد** چون Deployment Secrets در آن Run در دسترس نبودند؛ Browser test نیز انجام نشده است.
- Build اندروید و Unit/Robolectric tests موفق بودند.


### ۵.۲. اصلاح ممیزی: ارزیابی Native و Ledger محلی

ممیزی تکمیلی `forecastView.js`، `walkForwardEvaluator.js`، `forecastLedger.js` و `app.js` نشان داد که ثبت مسئله FCST-EVAL-01 نباید به معنی «نبود کامل کد» تفسیر شود:

- مسیر Native از `buildForecastForTab()` ارزیابی Nested Walk-Forward را اجرا می‌کند و وضعیت OOS را به Adapter مدل می‌دهد؛ این بخش، کد اجرایی موجود است.
- `ForecastLedger` در Forecast Studio قابلیت Snapshot و Lifecycle محلی، Hash Chain و ارزیابی سررسید دارد؛ ذخیره‌سازی آن `localStorage` است و سقف نگهداری فعلی ۱۲۰ Snapshot و ۲۴۰ رویداد Lifecycle است.
- handler به‌روزرسانی Ledger در UI صریحاً اعلام می‌کند Server Sync در این Web build فعال نیست. بنابراین این Ledger، دفترکل ابری/چنددستگاهی محسوب نمی‌شود.
- پنل Ledger و Backtest در New Native متصل است؛ Replay پایه نیز عرضه شده، اما Server Sync چنددستگاهی و پذیرش عملکرد/مرورگر آن باز است.
- تست `FORECAST-LEDGER-01` برای زنجیره Snapshot/Lifecycle و جلوگیری از ارزیابی تکراری اضافه شد. این تست، پذیرش persistence ابری یا Replay نیست.

### ۵.۳. نکته تکمیلی Ledger برای پیگیری بعدی

این بند با اصلاح ثبت‌شده در بخش ۵.۶ superseded شده است: متد اکنون کندل باز را حذف، timestamp تکراری را deduplicate و ورودی را مرتب می‌کند؛ CI برای تأیید این تغییر در انتظار اجراست.


### ۵.۴. کنترل منبع داده در تب‌های ذخیره‌شده

ممیزی تکمیلی نشان داد Store هنگام Hydration نمادها را به `tvdatafeed` محدود می‌کند، اما `ensureInitialTabs()` قبلاً مقدار `tab.provider` ذخیره‌شده در Workspace قدیمی را بدون allow-list می‌پذیرفت. در نتیجه یک تب قدیمی می‌توانست با Provider غیرفعال، cache key غیرمجاز را بخواند؛ حتی اگر مسیر sync نماد از TradingView استفاده کند. اصلاح در کد انجام شد: Provider تب‌های Hydrate‌شده و مسیر `openOrFocusSymbolTab()` اکنون از `isProviderEnabled()` عبور می‌کنند و مقدار غیرمجاز به `tvdatafeed` برمی‌گردد. تست `FORECAST-DATA-SOURCE-GUARD-01` این مرز را بررسی می‌کند. وضعیت نهایی پس از CI ثبت می‌شود.

### ۵.۵. شواهد CI برای Ledger و وضعیت اصلاح Provider ذخیره‌شده

- Run `44507978469` روی commit `f321f06caed58a0a3b6f8f93dc5bd1cac88c2c18`: Web parity **۱۹/۱۹ پاس** شامل `FORECAST-LEDGER-01`؛ PHP lint و استخراج ۵۰۰۰ کندل TradingView موفق؛ Android APK و Unit/Robolectric tests موفق.
- Artifact وب: ID `14519788283`، ۱۲۲ فایل.
- مرحله cPanel در همان Run، remote upload را به علت نبودن Deployment Secrets skip کرد؛ بنابراین Deploy Production انجام نشده است.
- اصلاح `FCST-DATA-01` و تست `FORECAST-DATA-SOURCE-GUARD-01` بعد از این Run commit شده‌اند و در Run `44508388118` در حال آزمون هستند؛ تا پایان آن Run وضعیت CI این اصلاح را Pending نگه می‌داریم.



### ۵.۶. اتصال Ledger و Walk-Forward به Workspace جدید — 2026-11-19

- پنل‌های موجود Walk-Forward و Ledger از `forecastView.js` export شدند و در Workspace جدید، فقط هنگام انتخاب یکی از مدل‌های Native (نه Structural JS/Historical Analogs) نمایش داده می‌شوند.
- ارزیابی با همان `buildForecastForTab()` و `evaluateWalkForward()` اجرا می‌شود؛ الگوریتم یا مدل از نو نوشته نشده است.
- دکمه ثبت Snapshot در New از همان `defaultForecastLedger` و همان handler قبلی استفاده می‌کند؛ دکمه ارزیابی سررسید نیز همان Lifecycle evaluator را صدا می‌زند.
- ورودی maturity اکنون فقط کندل‌های بسته TradingView را می‌پذیرد، timestamp تکراری را حذف و داده را صعودی مرتب می‌کند.
- Ledger همچنان محلی است: حداکثر ۱۲۰ Snapshot و ۲۴۰ رویداد Lifecycle؛ همگام‌سازی سرور/چنددستگاهی منتقل نشده است. Historical Replay پایه با تاریخ UTC، پنجره‌های قابل انتخاب، chart overlay و history محلی اکنون در New فعال است.
- نسخه ورودی وب به `app.js?v=1.47.21` افزایش یافت.
- تست ایستای `FORECAST-NEW-EVALUATION-01` برای اتصال پنل‌ها و guard کندل بسته اضافه شد؛ نتیجه CI پس از اجرای Workflow ثبت می‌شود.


### ۵.۷. نتیجه نهایی CI و Deploy — Run `44514401273` (2026-11-19)

- Commit: `2a9560000211eccc24d13b265b7d39480550a003`.
- Workflow: [Build Android APK and Package Web](https://github.com/manidigit/CHART/actions/runs/44514401273) — نتیجه کلی `success`.
- Web parity: **۲۱ تست پاس، صفر شکست**؛ شامل `FORECAST-NEW-EVALUATION-01`، `FORECAST-DATA-SOURCE-GUARD-01` و تست‌های Ledger.
- PHP lint برای سه فایل Chronos-2/Queue موفق؛ `py_compile` فقط syntax worker را در GitHub Runner تأیید می‌کند و Runtime روی هاست را اثبات نمی‌کند.
- استخراج داده از TradingView موفق؛ پاسخ Deploy مقدار `seeded_tvdatafeed_candles: 42291` را گزارش کرد.
- بسته وب: ۱۲۲ فایل، Artifact ID `14525630281`.
- **Deploy واقعی cPanel تأیید شد:** پاسخ اسکریپت استقرار `deployed_files: 123` را ثبت کرده است. این بار Secrets در دسترس بودند؛ برخلاف بعضی Runهای قبلی.
- Android: Debug APK build و Unit/Robolectric tests موفق؛ Artifact ID `14524956491`.
- هشدارهای غیرمسدودکننده: deprecation مربوط به Node.js 20 در Actions و غیر executable بودن `gradlew` که Action موقتاً اصلاح و ادامه داده است.
- آزمون مرورگر Production هنوز انجام نشده است؛ این مورد در `FCST-PROD-01` باز می‌ماند.


### ۵.۸. اتصال تنظیمات مدل‌ها به New و نتیجه CI/Deploy — Run `44515867849` (2026-11-19)

- Commit کد: `4c803143a719891e9d8840fbd94141b38772cdf5`.
- تست‌های Web parity: **۲۳/۲۳ پاس، صفر شکست**؛ تست‌های `FORECAST-NEW-MODEL-CONFIG-01` و `FORECAST-NEW-MODEL-CONFIG-02` اضافه و پاس شدند.
- پنل تنظیمات موجود مدل‌ها به New Native منتقل شد: فعال/غیرفعال‌سازی، وزن و پارامترها؛ بخش URL مربوط به Python Worker در New عمداً نمایش داده نمی‌شود.
- mismatch شناسه اسلایدر وزن اصلاح شد؛ اکنون `data-model-id` خوانده می‌شود.
- پس از تغییر پیکربندی، Forecast قبلیِ متأثر invalidate می‌شود تا نتیجه‌ای با تنظیمات قدیمی روی چارت باقی نماند.
- PHP lint و استخراج داده TradingView موفق؛ Deploy cPanel با پاسخ `ok:true`, `deployed_files:123`, `seeded_tvdatafeed_candles:42291` تأیید شد.
- Artifact وب و APK ساخته شدند؛ Android build و Unit/Robolectric tests نیز موفق بودند.
- موارد کیفیت OOS، مقایسه بصری، Browser E2E، Runtime Python، Replay، Ensemble و Ledger cloud sync همچنان باز هستند و نباید با موفقیت CI بسته تلقی شوند.


### ۵.۹. تأیید نهایی همگام‌سازی مستندات — Run `44516442724` (2026-11-19)

- Commit مستندات: `a732918ebda6905844b3ad77b531d241c5e8697e`.
- Web parity: ۲۳/۲۳ پاس؛ PHP lint و استخراج TradingView موفق.
- cPanel: `ok:true`, `deployed_files:123`, `seeded_tvdatafeed_candles:42291`.
- Android build و Unit/Robolectric tests موفق.
- Artifact وب: `14524589022`; APK: `14526440962`.
- این Run صرفاً مستندات و ثبت وضعیت را نیز به Production رساند؛ commit نهایی مستندات `fad43f80d9e8f6c712f9f6bb47a99f60aa875c13` نیز در Run `44516802833` با CI و Deploy موفق منتشر شد؛ Browser E2E همچنان Gate باز است.


### ۵.۱۱. انتقال مجدد قابلیت‌های جاافتاده Forecast Studio به New — 2026-11-19

- بازبینی کاربر درست بود: New Native قبلاً فاقد Overview/Scenario، تب‌های اصلی Studio، انتخاب مدل مستقل، Snapshot، Apply-to-chart، Render Mode و MTF بود.
- Commitهای `9f86505` و `e66cb2f` این مسیرها را با reuse توابع موجود به New متصل کردند.
- تست رگرسیون `FORECAST-NEW-STUDIO-01` اضافه شد. نتیجه پذیرش منوط به CI و Browser E2E است.
- Chronos-2/Python Worker به Runtime مستقل و مسیر dispatch امن نیاز دارد؛ Historical Replay و Calibrated Ensemble در New مسیر اجرایی دارند و اکنون باید از نظر عملکرد، OOS و پذیرش مرورگری ارزیابی شوند.

- تکمیل ایزولاسیون New: حتی اگر Legacy قبلاً Worker URL ذخیره کرده باشد، New Native آن را با `workerUrl: ''` نادیده می‌گیرد؛ اجرای Python Worker از مسیر New فعال نمی‌شود. Cache-busting به `app.js?v=1.47.23` و `forecastView.js?v=2.0.9` افزایش یافت.

- تب‌های Overview، Models، Walk-Forward و Ledger اکنون در New همیشه قابل مشاهده‌اند؛ در انتخاب Structural JS/Historical Analogs، Overview توضیح می‌دهد که Fan/Scenario مربوط به Native است، اما تب‌های مدل/ارزیابی/دفتر همچنان در دسترس‌اند. محاسبه Native فقط هنگام انتخاب مدل Native یا بازکردن تب‌های ارزیابی انجام می‌شود تا محاسبه غیرضروری در هر رندر ایجاد نشود.

- New Overview اکنون برای Structural JS و Historical Analogs نیز Preview تصویری مسیر را از خروجی واقعی `structuralForecast.forecast` نمایش می‌دهد؛ `q50_median` فقط به نام فیلد مورد انتظار Renderer نگاشت شده و q10/q90 اصلی حفظ می‌شوند. مسیرهای Historical Analog به‌صورت illustrative overlay نمایش داده می‌شوند، نه احتمال کالیبره‌شده.

- خطای احتمالی initialization در Structural Overview برطرف شد: وضعیت UI اکنون مستقیماً از `activeTab.structuralForecastStatus` خوانده می‌شود و به متغیر statusText با اعلان دیرتر وابسته نیست.


### ۵.۱۲. پذیرش CI و انتشار نسخه New Studio UI — 2026-11-19

- آخرین Commit کد: `2de2d880d5a98ded5cdd060b17fc3d06a412c510`؛ Commit مستندات: `832f2828becb0da4faccf09fdba2c0d180b830d9`.
- Workflow run `44530137222`: نتیجه کلی `success`؛ هر دو Job وب و Android موفق.
- Web parity: ۲۴/۲۴ پاس، صفر شکست؛ PHP lint موفق؛ استخراج داده TradingView موفق.
- cPanel remote upload: `ok:true`, `deployed_files:123`, `seeded_tvdatafeed_candles:42291`؛ snapshot `snapshot_20261119_131045`.
- Android Debug APK و Unit/Robolectric tests موفق؛ Artifact APK `14533691355` و Web package `14533451142`.
- این شواهد اجرای CI و Deploy را ثابت می‌کنند؛ Browser E2E تعاملی Production هنوز باز است و باید پیش از خاموش‌سازی Legacy انجام شود.


### ۵.۱۳. انتشار نهایی همگام‌سازی اسناد — 2026-11-19

- Commit مستندات: `832f2828becb0da4faccf09fdba2c0d180b830d9`.
- Run `44531190348` با نتیجه کلی `success`؛ Web parity برابر ۲۴/۲۴، PHP lint موفق، TradingView extraction موفق.
- Deploy cPanel: `ok:true`, ۱۲۳ فایل، ۴۲٬۲۹۱ کندل TradingView؛ snapshot `snapshot_20261119_131340`.
- Artifact وب `14534022250` و APK `14533517048`؛ Android build و Unit/Robolectric موفق.

- `FCST-COMPARE-01` پس از انتقال Overview به `PARTIAL / STUDIO_PREVIEW_OVERLAY_ONLY` تغییر کرد: overlay و مقایسه کارت‌ها در Preview وجود دارد؛ کنترل چندمدلی مستقل روی چارت اصلی و Side-by-Side هنوز باقی است.


### ۵.۱۴. تکمیل کنترل مقایسه چندمدلی در New — 2026-11-19

- New موتور Structural را به‌عنوان پیش‌فرض تنظیمات جدید انتخاب می‌کند؛ Legacy همچنان با انتخاب صریح در دسترس است.
- کنترل مستقل نمایش/مخفی‌سازی مسیر هر مدل موفق به Preview Forecast Studio اضافه شد؛ انتخاب‌ها در Preferences ذخیره می‌شوند و Renderer فقط مسیرهای انتخاب‌شده را overlay می‌کند.
- این قابلیت فقط در Preview فعال است؛ کنترل visibility چندمدلی روی Main Chart و نمای Side-by-Side مستقل همچنان باز است.
- تغییرات در انتظار CI و Deploy هستند.


### ۵.۱۵. مقایسه تصویری کنارهم مدل‌ها در New — 2026-11-19

- علاوه بر کنترل مستقل overlay، برای هر مدل موفق و انتخاب‌شده یک نمودار کوچک Side-by-Side در Overview ساخته می‌شود؛ هر نمودار از مسیر q10/q50/q90 واقعی همان مدل استفاده می‌کند.
- هیچ مسیر مصنوعی یا داده OHLC ساختگی برای مقایسه ساخته نمی‌شود؛ داده تاریخی مشترک و trajectory واقعی مدل نمایش داده می‌شود.
- کنترل multi-model روی Main Chart هنوز باقی است؛ وضعیت FCST-COMPARE-01 فقط به Preview محدود می‌ماند.
- Cache bust: app.js?v=1.47.28. در انتظار CI/Deploy.


### ۵.۱۶. انتقال مسیرهای مقایسه‌ای به Main Chart — 2026-11-19

- New اکنون در زمان Apply-to-chart، trajectory کامل مدل‌های Native موفق را همراه مدل منتخب نگه می‌دارد.
- Main Chart مسیر q50 مدل‌های انتخاب‌شده را با رنگ/خط مستقل و نام مدل رسم می‌کند؛ مسیر اصلی، باند اصلی و داده تاریخی بدون تغییر باقی می‌مانند.
- فقط trajectoryهای کامل و هم‌افق نمایش داده می‌شوند؛ مدل منتخب تکرار نمی‌شود؛ هیچ OHLC یا quantile band مصنوعی ساخته نمی‌شود.
- این قابلیت در انتظار CI/Deploy است و Browser E2E Production همچنان Gate پذیرش نهایی است.


### ۵.۱۷. پذیرش CI و Deploy مقایسه چندمدلی Main Chart — 2026-11-19

- Commit کد: `27211f53c1fb7ea71f37c0e48e13f11047e2a6da`؛ اصلاح cache: `49c07d16383131dd7af66bc81398280e31592d81`.
- Run `44534781037`: هر دو Job وب و Android با نتیجه success.
- Web parity: ۲۷/۲۷ پاس، صفر شکست؛ PHP lint و TradingView extraction موفق.
- cPanel Deploy: `ok:true`, `deployed_files:123`, snapshot `snapshot_20261119_133610`. مقدار seed جدید صفر بود؛ این Run داده جدیدی برای seed نداشت و به معنی خطای دریافت داده نیست.
- Android Debug APK و Unit/Robolectric tests موفق؛ artifact IDs: APK `14536815154` و Web `14534949557`.
- Main Chart comparison overlay اکنون در کد و CI تأیید شده است؛ Browser E2E Production همچنان باز است.


## ۶. وضعیت تجمیعی مهاجرت Forecast — بازنگری 2026-11-19

این بخش آخرین وضعیت اجرایی را ثبت می‌کند و بر یادداشت‌های قدیمی‌تر این فایل اولویت دارد. مواردی که در یادداشت‌های قبلی «پیاده‌سازی‌نشده» توصیف شده‌اند ممکن است در New پیاده‌سازی شده باشند؛ وضعیت نهایی را از این بخش و Parity Matrix نسخه 1.1.0 بخوانید.

### ۶.۱. انجام‌شده در کد شاخه New Native

- انتخاب New Native به‌عنوان پیش‌فرض اولین استفاده و حفظ انتخاب Legacy برای Rollback.
- انتخاب‌گر پویا برای ۱۰ مدل رجیستری، به‌علاوه Historical Analogs و Ensemble.
- انتقال پنل تنظیمات مدل‌ها: enable/disable، وزن، پارامترها و reset.
- ایزوله‌سازی Python Worker از New؛ URL Worker و اجرای خارجی در مسیر New استفاده نمی‌شود.
- اتصال تب‌های Overview، Models، Walk-Forward، Ledger و کنترل‌های افق/Render Mode/MTF.
- اتصال Structural JS و Historical Analogs با تفکیک خروجی واقعی مدل از مسیرهای illustrative.
- Compare در Preview، نمودارهای Side-by-Side و overlay مسیرهای منتخب روی Main Chart.
- Snapshot و Lifecycle Ledger محلی.
- Historical Replay با پنجره‌های ۳/۵/۱۰، بازه UTC، آموزش قبل از anchor، امتیازدهی با آینده، MAE/coverage/direction، نمودار مقایسه با actual، Play/Pause و تاریخچه محلی ۲۰ اجرا.
- حفظ سیاست TradingView-only و عدم افزودن Cron.
- تست‌های Node شاخه مهاجرت: ۳۳/۳۳ پاس؛ Syntax check فایل‌های اصلی نیز پاس شده است.

### ۶.۲. فهرست بازِ قابل اقدام

| شناسه | اولویت | مورد باز | شرط بسته‌شدن |
|---|---|---|---|
| FCST-STARTUP-01 | P0 | تأیید رفع خطای بارگذاری workspace در محیط هاست پس از duplicate horizon fix | مشاهده بارگذاری موفق و ثبت نسخه/commit واقعاً سرو‌شده |
| FCST-E2E-01 | P1 | Browser E2E کامل New Forecast | تست انتخاب مدل، تنظیمات، اجرا، Apply-to-chart، Compare، Replay، Snapshot و تغییر نماد/تایم‌فریم |
| FCST-CHRONOS-01 | P1 | Runtime و اتصال Chronos-2 | dispatch امن و authenticated، lifecycle/result integration و محدودیت‌ها؛ یا تصمیم رسمی بازنشستگی |
| FCST-LEGACY-AUDIT-01 | P1 | ممیزی کامل برابری Legacy در Web/API/Android | inventory یک‌به‌یک و تعیین Keep/Adapt/Replace/Retire همراه شواهد |
| FCST-REPLAY-PERF-01 | P1 | عملکرد Replay در تاریخچه بزرگ | اندازه‌گیری زمان/حافظه و آزمون تاریخچه‌های نماینده |
| FCST-REPLAY-LEAK-01 | P1 | اثبات عدم نشت داده در Replay | fixture مستقل و تست مرزهای زمانی که نشان دهد هیچ داده بعد از anchor وارد آموزش نمی‌شود |
| FCST-OOS-01 | P1 | پذیرش کیفیت پیش‌بینی مدل‌ها | پروتکل ثابت، baseline، holdout و گزارش به‌ازای نماد/تایم‌فریم/افق/رژیم |
| FCST-DATA-PROD-01 | P1 | تأیید TradingView-only در اجرای زنده | مشاهده Network/Runtime و اثبات عدم fallback به Provider دیگر و استفاده از کندل بسته |
| FCST-LEDGER-SYNC-01 | P2 | همگام‌سازی Ledger با سرور/چنددستگاهی | قرارداد مالکیت/امنیت، ذخیره و بازیابی آزموده‌شده |
| FCST-LEGACY-CLEANUP-01 | P2 | پاک‌سازی کد قدیمی | فقط پس از عبور جایگزین از پذیرش و بررسی نبود مصرف‌کننده |

### ۶.۳. رخداد خطای startup و اصلاح ثبت‌شده

- علت: دو اعلان `const horizon` در یک تابع در نسخه `main`؛ مرورگر پیش از بارگذاری Workspace کل ماژول را متوقف می‌کرد.
- اصلاح کد در `main`: commit `a6349d7`.
- Cache-busting در `host_subdomain/index.html`: commit `4bbcaed`، مقدار `app.js?v=1.47.30`.
- بازخوانی فایل از GitHub پس از اصلاح، تنها یک اعلان horizon را در تابع نشان داد.
- **وضعیت:** اصلاح منبع ثبت شده؛ تأیید اجرای موفق روی هاست هنوز انجام نشده و FCST-STARTUP-01 باز است.

### ۶.۴. موانع و تصمیم‌های صریح

1. هاست اشتراکی Python/exec قابل اتکا ندارد؛ نباید تلاش شود Python با ترفندهای PHP یا اجرای مستقیم روی cPanel فعال شود.
2. Workflow دستی Chronos-2 در GitHub Actions معادل اتصال محصول نیست؛ تا ایجاد مسیر امن dispatch و دریافت نتیجه، Chronos در New قابل ارائه نیست.
3. مدل‌های JavaScript با برچسب Approximation معادل LSTM/TFT/Prophet/ARIMA Python یا Chronos-2 نیستند.
4. تست سبز، ساخت APK یا Deploy به‌تنهایی کیفیت پیش‌بینی و پذیرش کاربر را ثابت نمی‌کند.
5. Legacy تا تکمیل E2E و تصمیم نهایی Chronos/مدل‌ها حذف یا غیرقابل‌بازگشت نمی‌شود.

**وضعیت کلی:** انتقال قابلیت‌های اصلی UI و Native execution در شاخه New انجام شده است؛ مهاجرت محصول و پذیرش نهایی همچنان باز است. اولویت بعدی، بستن خطای startup در محیط واقعی و سپس E2E کامل است.


### ۶.۵. تکمیل گام ۱ سیستم جدید و تصمیم کنار گذاشتن موقت Python/Chronos-2 — 2026-11-19

- **تصمیم صریح محصول (`FCST-CHRONOS-01`):** با توجه به محدودیت هاست اشتراکی، مدل‌های Python و Chronos-2 فعلاً کنار گذاشته شدند (Shelved) و تمرکز کامل روی برابری ۱۰۰٪ مدل‌ها و کنترل‌های مرورگری در سیستم جدید قرار گرفت.
- **تغییرات گام ۱ (`v1.47.35` و تکمیل داشبورد ۱۲-پنلی در `v1.47.36`):**
  - در `v1.47.35`: افزودن انتخاب `AUTO (OOS)` به سیستم جدید و تطبیق واقعی آن با `selectedChartModelId`، پیاده‌سازی کامل `Quantile Fan (Q10..Q90 + Q25..Q75)`، `Hybrid` و `Quantile Bars` در رندرر چارت اصلی (`chartRenderer.js?v=1.47.22`)، اتصال لایه `Coordinated MTF` و بازترسیم زنده چارت اصلی هنگام تغییر حالت نمایش/MTF/Compare.
  - در `v1.47.36`: هم‌ترازی ۱۰۰٪ چیدمان New با داشبورد تمام‌عرض `.ci-forecast-studio` و رندر بدون‌شرط هر ۱۲ پنل استودیو (شامل `Calibrated Quantile Fan`، `OOS Gate`، `Conformal Calibration`، `12-Model Comparison`، `11 Side-by-Side mini-charts`، `Analog Medoids`، `NO_EDGE`، `Aleatoric vs Epistemic`، `MTF Coordination`، `3-Scenario Event Tree` با `Plot Reference Bands on Chart` متصل به `redrawActiveCanvas()`، `Key Zones` و `Horizon Step Quantile Ladder`) برای همه مدل‌ها از جمله `Causal Historical Analogs` و `Structural JS`؛ همچنین رفع باگ ذخیره نشدن `AUTO` در `store.js?v=1.47.14` و ارتقای `app.js?v=1.47.36`.
- **راستی‌آزمایی محلی:** `node --check` روی تمامی ۱۱ ماژول JS تغییریافته و **۳۶/۳۶ تست `tests/web_parity.test.mjs`** (شامل `FORECAST-PHASE1-STUDIO-PARITY-03`) با موفقیت پاس شدند.
- **مرحله بعدی:** سیستم Legacy تا تأیید تست مرورگری گام ۱ دست‌نخورده و فعال مانده است؛ پس از تأیید کاربر، **گام ۲** (غیرفعال‌سازی شفاف بخش‌های منتقل‌شده در Legacy بدون حذف کد) اجرا می‌شود. `FCST-STARTUP-01` و `FCST-E2E-01` تا تأیید زنده روی هاست همچنان باز می‌مانند.

### ۶.۶. گام ۲: غیرفعال‌سازی بخش‌های منتقل‌شده در Legacy بدون حذف کد (`v1.47.37`) — 2026-11-19

- **اجرا با تأیید کاربر:** پرچم قابل بازگشت `LEGACY_MIGRATED_UI_DISABLED = true` در `forecastView.js?v=2.0.19` فعال شد و تمام کنترل‌های منتقل‌شده در `Legacy · Forecast Studio` (مدل‌ها، افق، Render Mode، MTF، Snapshot، رسم روی چارت و ۴ ساب‌تب) همراه با بنر تفکیک «منتقل‌شده به New» در برابر «کنار گذاشته‌شده روی هاست اشتراکی (`Chronos-2` / `Python Worker`)» و قفل فقط‌خواندنی بدنه Legacy غیرفعال شدند؛ همچنین دکمه overlay قدیمی در نوار بالای چارت (`headerView.js?v=1.47.7`) و handlerهای Legacy در `app.js?v=1.47.37` قفل شدند.
- **راستی‌آزمایی محلی:** `node --check` و **۳۷/۳۷ تست `tests/web_parity.test.mjs`** (شامل `FORECAST-PHASE2-LEGACY-DISABLE-01`) با موفقیت پاس شدند.
- **وضعیت پاک‌سازی (`FCST-LEGACY-CLEANUP-01`):** هیچ کد یا فایلی از Legacy حذف نشده است؛ حذف کامل کدهای قدیمی منوط به تست نهایی کاربر و تأیید صریح ورود به **گام ۳** است.

### ۶.۷. گام ۳: پاک‌سازی کامل Legacy Forecast Studio (`v1.47.38`) — 2026-11-19

- **تکمیل `FCST-LEGACY-CLEANUP-01` (در کد وب):** با تأیید صریح کاربر، تابع `renderForecastStudioView()` و پرچم موقت `LEGACY_MIGRATED_UI_DISABLED` (`forecastView.js?v=2.0.20`)، سوییچر `Legacy / New` و handlerهای اختصاصی Legacy (`app.js?v=1.47.38`)، دکمه منسوخ نوار بالای چارت (`headerView.js?v=1.47.8`) و بلوک رندر `legacyForecastPoints` روی بوم اصلی (`chartRenderer.js?v=1.47.23`) به طور کامل پاک‌سازی شدند. تنظیمات قدیمی ذخیره‌شده کاربران در `store.js?v=1.47.15` به‌صورت خودکار به `'structural'` نرمال‌سازی می‌شوند.
- **حفظ موتورهای مشترک و فایل‌های کنار گذاشته‌شده:** تمام پنل‌ها و موتورهای مشترک سیستم جدید (۱۲ پنل استودیو، ۱۰ مدل رجیستری، `AUTO`، `Causal Historical Analogs`، `Ensemble`، `Structural JS`، `Replay`، `Ledger`) دست‌نخورده و فعال‌اند؛ فایل‌های غیرفعال `Chronos-2 / Python` نیز دست‌نخورده حفظ شدند.
- **راستی‌آزمایی محلی:** `node --check` روی تمامی ماژول‌های تغییریافته و **۳۷/۳۷ تست `tests/web_parity.test.mjs`** (شامل `FORECAST-PHASE3-LEGACY-CLEANUP-01`) با موفقیت پاس شدند.

### ۶.۸. رفع باگ قفل شدن نماد/تایم‌فریم و لود نشدن کندل‌ها در مرورگر (`v1.47.39`) — 2026-11-19

- **علت ریشه‌ای (`ARCH-02` / Split-Singleton State):** پس از ارتقای تدریجی `store.js`، نسخه `?v=` ماژول‌های میانی (`apiService.js?v=1.47.2`، `watchlistView.js?v=1.47.2 / 1.47.1`، `settingsView.js?v=1.47.2`، `loginView.js?v=1.47.2`، `structuralForecastService.js?v=1.47.6`) ثابت مانده بود و مرورگر آن‌ها را از کش با یک نمونه قدیمی و جداگانه از `store.js` اجرا می‌کرد؛ در نتیجه کندل‌ها و قیمت‌های زنده در `state` قدیمی نوشته می‌شدند و بوم چارت و هدر روی `state` جدید خالی می‌ماندند. همچنین `redrawActiveCanvas()` نوار `.tv-ohlc-overlay` قبلی را هنگام خالی بودن کندل‌ها حذف نمی‌کرد و `downloadWorkspaceSync()` در حین تعویض نماد/تایم‌فریم می‌توانست تب فعال کاربر را به وضعیت قدیمی‌تر سرور برگرداند.
- **اصلاحات اعمال‌شده (`v1.47.39`):**
  1. یکسان‌سازی کامل تمام آدرس‌های `?v=1.47.39` در کل گراف ES Moduleها و Workerها (`index.html` و تمام ۲۵ فایل JS در `host_subdomain/assets/js/`).
  2. افزودن محافظ Singleton سراسری (`globalThis.__CI_STORE_SINGLETON_V1__`) در `core/store.js` برای `state`، `candleCache`، کش memo کندل‌ها، `autoSyncCallback` و `suspendFocusPullUntilMs`.
  3. اصلاح `redrawActiveCanvas()` در `app.js` برای حذف `.tv-ohlc-overlay` قدیمی در حالت خالی و درج خودکار آن هنگام لود شدن کندل‌ها.
  4. افزودن `suspendFocusPull(15000)` و به‌روزرسانی `preferencesUpdatedAtMs` در `saveOpenTabsToStorage()` و محافظ `preserveLocalTabSelection` در `downloadWorkspaceSync()` (`apiService.js`) جهت جلوگیری از بازنویسی تب و تایم‌فریم انتخابی کاربر توسط سینک پس‌زمینه.
- **راستی‌آزمایی محلی:** `node --check` روی هر ۲۵ ماژول JS و **۳۸/۳۸ تست `tests/web_parity.test.mjs`** (شامل تست جدید `ARCH-02` برای یکتایی نسخه کل گراف ماژول‌ها و آزمون Runtime دوپاره نشدن `store.js`) با موفقیت پاس شدند.

### ۶.۹. رفع قطعی قفل شدن واچ‌لیست و تایم‌فریم هنگام انتخاب سهم دوم (`STORAGE-QUOTA-01` — `v1.47.40`) — 2026-11-19

- **علت ریشه‌ای واقعی (`QuotaExceededError` در `saveOpenTabsToStorage`):** تابع `saveCandlesToCache()` تا ۱۵۰۰ کندل برای هر `(نماد × تایم‌فریم)` در `localStorage` ذخیره می‌کرد و سقف ۵ مگابایتی مرورگر را پر می‌کرد. تعویض تایم‌فریم روی تک‌تب اولیه (`SPOTBRENT`) اندازه `ci_open_tabs_v2` را تغییر نمی‌داد و کار می‌کرد، اما به محض کلیک روی هر سهم دیگر در واچ‌لیست (`NVDA`، `BTCUSD` و سهم‌های پایین جدول)، افزوده شدن تب دوم باعث `QuotaExceededError` بدون `try/catch` در `saveOpenTabsToStorage()` می‌شد و اجرای `openOrFocusSymbolTab()` را پیش از `syncSymbolNow()` و `renderApp()` متوقف می‌کرد (در نتیجه هدر و واچ‌لیست روی `SPOTBRENT 15m` یخ می‌زدند در حالی که تایمر ۱ ثانیه‌ای بوم چارت سهم جدید را رسم می‌کرد).
- **اصلاحات اعمال‌شده (`v1.47.40`):**
  1. ایجاد `safeLocalStorageSet()` و `evictCandleCachesFromLocalStorage()` در `core/store.js` برای پاک‌سازی خودکار کش‌های حجیم `ci_candles_v*` هنگام پر شدن حافظه و عدم پرتاب خطا در هیچ شرایطی؛ همچنین محدود کردن کپی `localStorage` کندل‌ها به ۲۵۰ کندل سبک (با حفظ کامل ۵۰۰۰ کندل در RAM و دیتابیس MariaDB).
  2. عبور تمام فراخوانی‌های `localStorage.setItem` در `store.js`، `app.js` و `apiService.js` از `safeLocalStorageSet()` و ایمن‌سازی `i18n.setLanguage()`.
  3. ارسال `needsFullBackfill = !cached || cached.length < 30` به `syncSymbolNow()` در `openOrFocusSymbolTab()` برای لود فوری کندل سهم‌های پایین واچ‌لیست و افزودن `try/catch` روی handler کلیک `app.js`.
  4. هم‌ترازی یکپارچه کل گراف ماژول‌ها و `index.html` روی `?v=1.47.40`.
- **راستی‌آزمایی محلی:** `node --check` روی هر ۲۶ ماژول JS و **۳۹/۳۹ تست `tests/web_parity.test.mjs`** (شامل تست جدید `STORAGE-QUOTA-01` با شبیه‌سازی پر شدن/قفل شدن `localStorage` و ممیزی نبود `localStorage.setItem` محافظت‌نشده) با موفقیت پاس شدند.

