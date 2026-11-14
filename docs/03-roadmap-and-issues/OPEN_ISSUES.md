# CHART — فهرست مسائل باز، نواقص راستی‌آزمایی‌شده و وضعیت ممیزی (`OPEN_ISSUES`)

> **نسخه:** `1.42.0` · **تاریخ ممیزی و تکمیل:** `2026-11-14`  
> این فایل وضعیت واقعی مسائل باز (`INF-01` تا `SEC-01` و یافته‌های ممیزی `AUTH-01` / `INF-03` / `ENG-01b` / `PAR-01` / `ENG-03b` / `QA-01` / `UI-02` / `IND-01` و هسته مستقل پیش‌بینی فاز ۴ `PRED-01..08`) را روی **PHP + MariaDB (`host_subdomain`)**، **کلاینت وب**، **اپلیکیشن اندروید (Kotlin/Compose)** و **CI/CD (`build-apk.yml`)** ثبت می‌کند.

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
  - **`PRED-CORE-V1` (هسته مستقل پیش‌بینی فاز ۴)**: پیاده‌سازی پکیج‌های مجزا و ماژولار `forecast/` روی وب، اندروید و PHP (`ForecastEngine`, `ForecastModelRegistry`, `WalkForwardEvaluator`, `ForecastLedgerStore` با SHA-256، مایگریشن `003_phase4_forecast_tables.sql`، تب `Forecast Studio` در وب و `ForecastLabScreen` در اندروید، و رندر `Fan Chart / Ghost Candles / Hybrid` برای افق `10..60` کندل روی تمام ۶ تایم‌فریم).
  - **کنترل‌های تاییدشده دیگر در کد فعلی:** حذف کندل/قیمت ساختگی صفحه اولیه (Skeleton واقعی)، شرط حداقل ۲۰۰ کندل برای `SMA200`، تازه‌سازی دوره‌ای خودکار نزدیک بسته شدن کندل هم در وب و هم در `MainViewModel.kt` اندروید، تفکیک کلیدهای `BYOK` از Workspace و ارسال از طریق Header (`X-Provider-Api-Key`)، ذخیره تب‌ها/تب فعال در اندروید، مخفی‌شدن نوار ناوبری در صفحه Chart، و پوشش کامل **۱۵ از ۱۵** اندیکاتور ۳ سطحی TradingView شامل هر ۴ واریانت `Pivot Points` (`Standard / Fibonacci / Camarilla / Woodie` با `R3/R4/S3/S4`).
- **باقی‌مانده و نیازمند اقدام:** بررسی مستقیم سرور زنده cPanel پس از استقرار (`INF-01`/`INF-02` عملیاتی و بخش ۴.۱)، استقرار سرور پایتونی خارجی مدل‌های پایه (`Chronos-2` / `TimesFM 2.5` / `N-HiTS` در بخش `PRED-DL-WORKER`) و تکمیل حلقه بازخورد خودکار فاز ۵ و شبیه‌ساز فاز ۶.

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
| **`PRED-09`** | `P1` | `[x]` **تکمیل شد (`Code Complete`)** | پیاده‌سازی کامل `AI-Generated Future Candlesticks Overlay (30 periods)` منطبق با تصویر مرجع در وب و اندروید شامل: خط‌چین عمودی `Present Bar Divider`، بنر `← PAST (Actual Data) ┆ Future Projection (30 periods) (AI-Generated) →`، ۳۰ کندل نیمه‌شفاف بنفش-خاکستری در سمت راست، و برچسب‌های `+5 (Future)`، `+10`، `+15`، `+20`، `+25`، `+30` همراه با درصد تغییر (`+X%`/`-X%`). | `technicalIndicators.js`, `chartRenderer.js`, `headerView.js`, `analysisView.js`, `Phase2IndicatorsAlgorithm.kt`, `CandlestickCanvas.kt`, `ChartViewScreen.kt`, `PredictionScreen.kt` |
| **`PRED-10`** | `P1` | `[x]` **تکمیل شد (`Code Complete`)** | تضمین افق پیش‌بینی حداقل ۱۰ کندل ($h = 30 \ge 10$) روی تمامی تایم‌فریم‌ها (`M15`, `M30`, `H1`, `H4`, `D1`, `W1`) با رعایت تقویم سشن معاملاتی، پرش خودکار از تعطیلات آخر هفته بازارهای OTC/Equities، و تنظیم خودکار مقیاس افقی/عمودی چارت. | `technicalIndicators.js`, `chartRenderer.js`, `Phase2IndicatorsAlgorithm.kt`, `CandlestickCanvas.kt`, `PredictionScreen.kt` |
| **`PRED-01..08`** | `P1` | `[x]` **هسته آماری مستقل در کد (`v1.42.0`)** | پیاده‌سازی موتور مستقل پلاگین‌محور (بازده لگاریتمی، `Persistence`, `ATR Cone`, `Kalman`, `GARCH(1,1)`, `AR(2)+ETS`, `Gaussian Process`)، قرارداد `forecast-contract/v1`، رندر ۳ حالته `Fan Chart / Ghost Candles / Hybrid` ($h = 10..60$)، Purged `WalkForwardEvaluator` با `AcceptanceGate`، تب مستقل وب/اندروید (`Forecast Studio / Lab`)، مایگریشن `003_phase4_forecast_tables.sql` و زنجیره دفترکل `SHA-256` (`api/v1/forecast.php`). | `host_subdomain/assets/js/forecast/*`, `app/.../forecast/*`, `api/v1/forecast/*`, `003_phase4_forecast_tables.sql`, `ForecastLabScreen.kt`, `forecastView.js` |
| **`PRED-DL-WORKER`** | `P2` | `[ ]` **استقرار Worker پایتونی خارجی (`Phase 4 DL Ops`)** | پل ارتباطی صادقانه `FORECAST_WORKER_URL` در کد پیاده شده است (`LOCAL_STATISTICAL_ONLY` / `UNCONFIGURED` در نبود Worker). استقرار سرویس خارجی `Chronos-2 (Apache 2.0)` / `TimesFM 2.5` / `N-HiTS` روی GPU/VPS همچنان باز است *(TimesFM 3.0 ممنوع)*. | `ForecastEnginePhp.php`, `ForecastLabScreen.kt`, `forecastView.js` |
| **`UI-02`** | `P2` | `[ ]` **آیتم‌های تکمیلی دسکتاپ/فاز ۵–۶** | درخت اشیاء پیشرفته دسکتاپ و یکپارچه‌سازی با `Champion/Challenger Rollback` خودکار (فاز ۵). | `DESIGN_WORKSPACE_SPEC.md`, `ROADMAP_BACKLOG.md` |




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
3. **قرارداد رسمی `forecast-contract/v1` و ارزیابی مدل (پیش از فاز ۴ و ۵):**
   - نهایی‌سازی JSON Schema اجرایی، Quantileهای هدف (مثلاً `q10`, `q50`, `q90`) و ضریب/دوره `ATR` برای تعریف روند «خنثی».
   - تعیین محل نهایی Inference (`Browser/ONNX` در برابر `Backend/Python Worker`) و سیاست اعتماد (`PROVISIONAL` vs `VALID`).
   - تعیین طول دقیق `Embargo`، روش محاسبه حجم نمونه مؤثر، حداقل نمونه برای خروج از `INCONCLUSIVE`، آستانه‌های `Promotion Gate` / `Change Budget` / `Rollback` در `Champion/Challenger` و محل مستقل `Anchor` کردن زنجیره `SHA-256`.
4. **پارامترهای استراتژی معاملاتی (پیش از فاز ۶ — [`TRADING_STRATEGY_SPEC.md`](../01-product/TRADING_STRATEGY_SPEC.md)):** قوانین تبدیل سناریو به ورود، تخصیص چندتارگته `TP1/TP2/TP3`، جابه‌جایی `Stop Loss` به `Break-Even`، سقف ریسک هم‌زمان، `Max Drawdown Halt` و مدل دقیق `Swap / Spread / Slippage`.
