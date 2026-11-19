# CHART — فهرست مسائل باز، نواقص راستی‌آزمایی‌شده و وضعیت ممیزی (`OPEN_ISSUES`)

> **نسخه:** `1.45.1` · **تاریخ ممیزی و تکمیل:** `2026-11-17`  
> این فایل وضعیت واقعی مسائل باز (`INF-01` تا `SEC-01` و یافته‌های ممیزی `AUTH-01` / `INF-03` / `ENG-01b` / `PAR-01` / `ENG-03b` / `QA-01` / `UI-02` / `IND-01` و وضعیت آرشیوشده بخش پیش‌بینی) را روی **PHP + MariaDB (`host_subdomain`)**، **کلاینت وب**، **اپلیکیشن اندروید (Kotlin/Compose)** و **CI/CD (`build-apk.yml`)** ثبت می‌کند.

---

## خلاصه وضعیت مسائل ممیزی (`v1.42.0`)

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
  - **`PRED-CORE-ARCHIVED` (آرشیو کامل کدهای پیش‌بینی پیشین برای بازطراحی از صفر — `v1.45.1`):** تمام کدهای اجرایی، ویوها، اندپوینت‌ها، اسکریپت‌ها و تست‌های مربوط به پیش‌بینی (`forecast/`, `ForecastLabScreen.kt`, `PredictionScreen.kt`, `forecastView.js`, `analysisView.js`, `api/v1/forecast*`, `python_worker/`, `scripts/backtest.js`, `tests/forecast_v2*`, `tests/phase4_forecast*`) به پوشه **`/archive/`** منتقل شدند؛ تمامی مستندات (`/docs/` از جمله `FORECAST_PRODUCT_FOUNDATION_V1.md`) و مایگریشن‌های SQL (`003_*` و `004_*`) بدون حذف دست‌نخورده باقی مانده‌اند و تب **`Forecast`** به همراه دکمه‌های ورود مرتبط در اندروید و وب در حالت **غیرفعال (`disabled`)** قرار گرفتند.
  - **`TIMEFRAME-SYNC-WEB` (رفع گیرکردن تعویض تایم‌فریم در وب — `v1.45.1`):** افزودن لغو خودکار درخواست‌های قدیمی با `AbortController` به‌ازای هر نماد در `apiService.js`، تایم‌اوت `10s / 4s` برای بک‌اند و WebSocket، نگاشت کامل ۷۹ نماد به بورس صحیح در `resolveTradingViewWsSpec`، محدودکردن هم‌زمانی سینک پس‌زمینه واچ‌لیست (`BATCH_SIZE = 2`) و بهینه‌سازی تایم‌اوت/فچ ثانویه `H4 -> H1` در `TvDatafeedAdapter.php`.
- **باقی‌مانده و نیازمند اقدام:** رفع فوری مشکل سوئیچ چارت از واچ‌لیست و تایم‌فریم (`CHART-STALL-01` / `KNOWN_ISSUES_BACKLOG.md §5`)، بررسی مستقیم سرور زنده cPanel پس از استقرار (`INF-01`/`INF-02` عملیاتی و بخش ۴.۱)، طراحی و پیاده‌سازی مجدد سیستم پیش‌بینی بر مبنای [`FORECAST_PRODUCT_FOUNDATION_V1.md`](../01-product/FORECAST_PRODUCT_FOUNDATION_V1.md)، و تکمیل فازهای ۵ و ۶.

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
| **`PRED-09`** | `P1` | `[ ]` **آرشیوشده برای بازطراحی (`v1.45.1`)** | کدهای پیشین Overlay کندل‌های آینده از رندررهای وب و اندروید جدا شده و پرچم `showFutureProjection` به‌صورت ثابت روی `false` قفل شده است. | `archive/...`, `CandlestickCanvas.kt`, `chartRenderer.js` |
| **`PRED-10`** | `P1` | `[ ]` **آرشیوشده برای بازطراحی (`v1.45.1`)** | بخش پیشین افق زمانی پیش‌بینی همراه با پکیج `forecast/` به `/archive/` منتقل شد تا در طراحی جدید بازنویسی شود. | `archive/...` |
| **`PRED-01..08`** | `P1` | `[ ]` **آرشیوشده برای بازطراحی (`v1.45.1`)** | تمامی کدهای موتور پیش‌بینی فاز ۴ در Android/Web/PHP/Worker/Tests به `/archive/` منتقل شدند؛ تب `Forecast` و دکمه‌های مربوطه در حالت غیرفعال (`disabled`) قرار دارند. مستندات `docs/` و مایگریشن‌های `003_*` / `004_*` دست‌نخورده حفظ شده‌اند. | `archive/...`, `003_phase4_forecast_tables.sql`, `004_phase4_forecast_v2_columns.sql` |
| **`PRED-DL-WORKER`** | `P2` | `[ ]` **معلق تا بازطراحی جدید (`Phase 4`)** | فایل‌های `python_worker/` به `/archive/python_worker/` منتقل شدند و پس از طراحی جدید پیش‌بینی بر اساس `FORECAST_PRODUCT_FOUNDATION_V1.md` بازبینی خواهند شد. | `archive/python_worker/` |
| **`UI-02`** | `P2` | `[ ]` **آیتم‌های تکمیلی دسکتاپ/فاز ۵–۶** | درخت اشیاء پیشرفته دسکتاپ و یکپارچه‌سازی با `Champion/Challenger Rollback` خودکار (فاز ۵). | `DESIGN_WORKSPACE_SPEC.md`, `ROADMAP_BACKLOG.md` |
| **`CHART-STALL-01`** | `P0` | `[ ]` **باز و در دست اقدام (`Open / P0`)** | رفع عدم به‌روزرسانی و فریز چارت هنگام تعویض نماد در واچ‌لیست و تغییر تایم‌فریم (حل ریس رندر DOM در `redrawActiveCanvas`، فراخوانی اجباری `syncSymbolNow` در تب‌های بدون کش و اصلاح توالی تایم‌فریم). | `app.js`, `watchlistView.js`, `apiService.js`, `MainViewModel.kt`, `docs/KNOWN_ISSUES_BACKLOG.md §5` |




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
3. ~~**قرارداد رسمی `forecast-contract/v1` و ارزیابی مدل (پیش از فاز ۴ و ۵):**~~ ✅ **نهایی‌سازی و پیاده‌سازی‌شده در `forecast-contract/v2` (Rev 2.1) — [`FORECAST_ENGINE_V2_SPEC.md`](../01-product/FORECAST_ENGINE_V2_SPEC.md):**
   - چندک‌های ۵گانه (`q10`, `q25`, `q50`, `q75`, `q90`) با WIS 5Q و Conformal نرمال‌شده با EWMA؛ تعریف خنثی و ۳ سناریو با L2 Multinomial Logit.
   - امبارگو یکپارچه $E = \max(5, \lceil 0.25 H \rceil)$، حجم مؤثر بارتلت ($N_{\text{eff}} \ge 25$)، تفکیک `DATA_NOT_READY` / `PROVISIONAL` / `INSUFFICIENT_EVIDENCE` / `NO_EDGE` / `VALID` و زنجیره SHA-256 با گردکردن ۱۲-رقمی (`inputHash`). موارد باقیمانده صرفاً مربوط به آستانه‌های `Promotion Gate` فاز ۵ (`Champion/Challenger Rollback`) و کلاستر دائمی Python Worker است.
4. **پارامترهای استراتژی معاملاتی (پیش از فاز ۶ — [`TRADING_STRATEGY_SPEC.md`](../01-product/TRADING_STRATEGY_SPEC.md)):** قوانین تبدیل سناریو به ورود، تخصیص چندتارگته `TP1/TP2/TP3`، جابه‌جایی `Stop Loss` به `Break-Even`، سقف ریسک هم‌زمان، `Max Drawdown Halt` و مدل دقیق `Swap / Spread / Slippage`.


## ۵. پیش‌بینی — موانع و نواقص باز (Forecast Migration Blockers — 2026-11-19)

> این بخش دفتر متمرکز مشکلات Forecast است. موارد زیر عمداً در یک محل نگهداری می‌شوند تا بعداً به‌صورت یک بسته تصمیم‌گیری اولویت‌بندی شوند. ثبت در این فهرست به معنی شروع رفع یا تأیید راه‌حل نیست. وضعیت هر مورد فقط با شواهد کد، CI و آزمون محیط مقصد تغییر می‌کند. این بخش برای وضعیت فعلی New/Legacy بر توضیحات تاریخی آرشیو Forecast در بخش‌های قدیمی‌تر همین سند اولویت دارد.

| شناسه | اولویت | مسئله / ریسک | شواهد فعلی | تصمیم یا اقدام بعدی | وضعیت |
|---|---|---|---|---|---|
| `FCST-RT-01` | P0 | **نبود Runtime اجرایی Python روی هاست اشتراکی**؛ Chronos-2 و سایر Python Workerها به اجرای Python وابسته‌اند و QueueManager از PHP `exec()` استفاده می‌کند. | `Chronos2QueueManager.php` در صورت غیرفعال‌بودن `exec()` خطای صریح می‌دهد؛ محدودیت واقعی هاست گزارش شده است. CI فقط `py_compile` و نصب پکیج در Runner را ثابت می‌کند، نه اجرا روی cPanel. | در New غیرفعال بماند. بعداً گزینه‌های Runtime مستقل، امنیت، latency، هزینه و نگهداری مقایسه شوند؛ هیچ سرویس یا هزینه‌ای فعلاً ایجاد نشود. | `OPEN / BLOCKED_BY_RUNTIME` |
| `FCST-DEPLOY-01` | P0 | **عدم انتشار خودکار روی cPanel در برخی Runها**؛ موفقیت Job الزاماً به معنی Deploy نیست. | Run `44496501529` تست‌ها و بسته‌بندی را موفق کرد، اما log مرحله Deploy پیام `cPanel deployment secrets not available ... skipping remote upload` را ثبت کرد. | دسترسی/شرط GitHub Secrets و محیط اجرای Workflow بررسی شود؛ تا اثبات انتقال فایل به سرور، Deploy را موفق اعلام نکنیم. | `OPEN / DEPLOY_NOT_VERIFIED` |
| `FCST-PROD-01` | P1 | **نبود آزمون مرورگر روی نسخه Production** بعد از آخرین تغییرات. | تست‌های Node و Build در GitHub Actions هستند؛ مدرک Browser E2E یا بررسی دستی روی دامنه زنده موجود نیست. | پس از رفع مانع Deploy، smoke test واقعی New/Legacy، انتخاب مدل، رندر و خطاها انجام شود. | `OPEN / NOT_TESTED` |
| `FCST-API-01` | P1 | **تست Provider guard در حال حاضر ایستا است، نه آزمون HTTP واقعی.** | `CHRONOS2-PROVIDER-GUARD-01` ترتیب کد allow-list را بررسی می‌کند؛ endpoint در محیط cPanel اجرا نشده است. | بعداً تست Integration برای رد Provider غیر از `tvdatafeed` و مسیر مجاز TradingView اضافه شود؛ بدون نیاز به اجرای مدل سنگین. | `OPEN / STATIC_TEST_ONLY` |
| `FCST-EVAL-01` | P1 | **چرخه ارزیابی و Ledger هنوز در New به‌صورت یک قابلیت کامل و قابل اتکا عرضه نشده است؛ بخشی از موتور ارزیابی Native وجود دارد.** | مسیر Native با `buildForecastForTab()` از `evaluateWalkForward()` استفاده می‌کند و نتیجه OOS را به Adapter می‌دهد. در مقابل، `ForecastLedger` فعلی بر `localStorage` متکی است (حداکثر ۱۲۰ Snapshot و ۲۴۰ رویداد Lifecycle)، Sync سرور در UI صریحاً غیرفعال است و پنل Ledger/Backtest در Forecast Studio باقی مانده؛ Historical Replay مستقل نیز موجود نیست. | آزمون زنجیره Ledger و maturity اضافه شود؛ سپس قرارداد persistence و گزارش OOS در New طراحی شود. Replay جداگانه ممیزی شود. | `OPEN / PARTIAL — LOCAL_ONLY_AND_UI_GAP` |
| `FCST-ENS-01` | P2 | **Calibrated Ensemble مسیر اجرایی در Structural JS ندارد.** | مسیر `ensemble` در `structuralForecastEngine.js` وجود ندارد؛ گزینه New غیرفعال شده است. | تا زمانی که وزن‌دهی، آموزش/کالیبراسیون، ارزیابی OOS و تست مقایسه وجود ندارد، غیرفعال بماند. | `OPEN / NOT_IMPLEMENTED` |
| `FCST-LEGACY-01` | P1 | **هم‌زیستی Legacy و New نیازمند کنترل overlay و مسیرهای مستقل است.** | Legacy حفظ شده؛ New انتخاب‌گر و Renderer جدا دارد؛ خاموش‌سازی Legacy هنوز مجاز نیست. | هر قابلیت پس از پذیرش New، با Feature Flag و آزمون rollback جداگانه از Legacy خارج شود. | `OPEN / PARALLEL_SYSTEMS` |
| `FCST-LEDGER-02` | P1 | **اعتبارسنجی ورودی ارزیابی Ledger در برابر کندل باز و ترتیب داده کافی نیست.** | `evaluateMaturedForecasts()` در حال حاضر کندل‌ها را بر اساس `close > 0` فیلتر می‌کند و صراحتاً `is_closed !== false`، یکتایی timestamp یا ترتیب زمانی را کنترل نمی‌کند؛ مسیر فعلی UI معمولاً کندل‌های ذخیره‌شده را می‌دهد، اما قرارداد خود متد محافظ کافی ندارد. | پیش از اتکا به Ledger، ورودی را به کندل‌های بسته، مرتب و یکتا محدود و آزمون forming-tail / duplicate / out-of-order اضافه کنیم. | `OPEN / INPUT_VALIDATION_GAP` |\n| `FCST-DOC-01` | P2 | **تعارض تاریخی در مستندات Forecast پس از آرشیو قدیمی و پیاده‌سازی مجدد New.** | بعضی اسناد قدیمی Forecast را کاملاً Archived معرفی می‌کنند، در حالی که مسیر Native JS New دوباره پیاده‌سازی شده است. | سند Migration مرجع وضعیت جاری باشد؛ اسناد تاریخی با لینک به وضعیت جاری علامت‌گذاری شوند، نه بازنویسی بدون ممیزی. | `OPEN / DOC_RECONCILIATION` |

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
- پنل گزارش Ledger و Backtest در Forecast Studio قرار دارد و در New Structural به‌عنوان workflow کامل عرضه نشده؛ Historical Replay نیز هنوز مستقل و قابل پذیرش نیست.
- تست `FORECAST-LEDGER-01` برای زنجیره Snapshot/Lifecycle و جلوگیری از ارزیابی تکراری اضافه شد. این تست، پذیرش persistence ابری یا Replay نیست.

### ۵.۳. نکته تکمیلی Ledger برای پیگیری بعدی

متد `evaluateMaturedForecasts()` اکنون هر ورودی دارای `close > 0` را در سری ارزیابی می‌پذیرد؛ این شرط به‌تنهایی تضمین نمی‌کند کندل بسته باشد یا timestampها یکتا و مرتب باشند. مسیر فعلی از کندل‌های ذخیره‌شده استفاده می‌کند، اما این فرض در مرز متد enforce نشده است. مورد با شناسه `FCST-LEDGER-02` ثبت شد تا قبل از اتکای عملیاتی به Ledger، با تست forming-tail، duplicate و out-of-order بسته شود.

