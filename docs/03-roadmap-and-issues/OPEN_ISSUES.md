# CHART — فهرست مسائل باز، نواقص راستی‌آزمایی‌شده و وضعیت ممیزی (`OPEN_ISSUES`)

> **نسخه:** `1.40.0` · **تاریخ ممیزی و تکمیل:** `2026-11-13`  
> این فایل وضعیت واقعی مسائل باز (`INF-01` تا `SEC-01` و یافته‌های ممیزی جدید `AUTH-01` / `INF-03` / `ENG-01b` / `PAR-01` / `ENG-03b` / `QA-01` / `UI-02` / `IND-01`) را روی **PHP + MariaDB (`host_subdomain`)**، **کلاینت وب**، **اپلیکیشن اندروید (Kotlin/Compose)** و **CI/CD (`build-apk.yml`)** ثبت می‌کند.

---

## خلاصه وضعیت مسائل ممیزی (`v1.40.0`)

- **پیاده‌سازی‌شده و بسته‌شده در کد (`Code Complete`):**
  - **`ENG-01` (بخش پایه)**: هم‌ترازی سشن‌های معاملاتی و DST (`CRYPTO_24_7`, `US_EQUITIES` `09:30–16:00 America/New_York`, `OTC_FX_METALS` `17:00 America/New_York`) — *شکاف‌های ظریف پاریتی بین کلاینت‌ها در `ENG-01b` ثبت شد*.
  - **`ENG-02`**: تفکیک کامل Quote زنده / Forming Bar (`api/v1/quote.php`) از ذخیره قطعی کندل‌های بسته‌شده (`is_closed = 1`) با ایزوله‌سازی سخت‌گیرانه پرووایدر.
  - **`ENG-03`**: موتور تشخیص هوشمند Gap (`GapDetector` + `api/v1/gap_report.php` + جدول `data_quality_reports` در `002_phase2_3_tables.sql`) بدون خطای کاذب تعطیلات آخر هفته.
  - **`UI-01`**: اتصال زنده `Symbol Intel` (`api/v1/symbol_intel.php` شامل کش MariaDB، `Yahoo Finance RSS`، `U.S. EIA RSS`، و `SEC EDGAR 10-K/10-Q/8-K` منحصراً برای سهام آمریکا) همراه با برچسب شفاف تفکیک داده خارجی vs محاسبات محلی.
  - **`SEC-01`**: اعمال `sanitizeSymbolCode()` سخت‌گیرانه (`[A-Z0-9._:-]` حداکثر ۲۰ کاراکتر) و پوشش کامل `escapeHtml()` در تمام DOM و `data-*`های وب.
  - **بهداشت امنیتی Auth/CORS (راستی‌آزمایی‌شده در کد فعلی):** حذف کامل ذخیره plaintext رمز عبور (`ci_saved_password` فقط `removeItem` می‌شود)، fallback آفلاین مبتنی بر **Salted SHA-256** (`ci_offline_pw_salt` + `ci_offline_pw_hash` و `PasswordHashAlgorithm.kt`)، حداقل طول رمز **۸ کاراکتر** در `auth.php`، و حذف `CORS *` به نفع whitelist + هدرهای امنیتی در `ApiEnvelope.php`.
  - **`INF-01` (بخش نرم‌افزاری)**: خروجی/بازیابی پشتیبان رمزنگاری‌شده (`PBKDF2-HMAC-SHA256` + `AES-256-GCM`) با حذف خودکار کلیدهای `BYOK` در `backup.php`، کلاینت وب، و `BackupExportHelper.kt` (با `SAF` بدون نیاز به مجوز Storage + `FileProvider` برای اشتراک امن فایل).
  - **`INF-02` (بخش اسکریپت استقرار)**: اسنپ‌شات خودکار `_ci_backups/snapshot_*` (حفظ ۳ نسخه آخر)، انتقال اتمیک فایل‌ها در `build-apk.yml`، و اندپوینت احراز هویت‌شده `rollback_release.php`.
  - **کنترل‌های تاییدشده دیگر در کد فعلی:** حذف کندل/قیمت ساختگی صفحه اولیه (Skeleton واقعی)، شرط حداقل ۲۰۰ کندل برای `SMA200`، تازه‌سازی دوره‌ای خودکار نزدیک بسته شدن کندل هم در وب و هم در `MainViewModel.kt` اندروید، تفکیک کلیدهای `BYOK` از Workspace و ارسال از طریق Header (`X-Provider-Api-Key`)، ذخیره تب‌ها/تب فعال در اندروید، مخفی‌شدن نوار ناوبری در صفحه Chart، و پوشش ۱۴ مورد از ۱۵ اندیکاتور ۳ سطحی TradingView (`Moving Average`, `RSI`, `MACD`, `Bollinger Bands`, `Volume/VRVP`, `Stochastic`, `ATR`, `VWAP`, `Supertrend`, `Ichimoku`, `ADX`, `Parabolic SAR`, `Fibonacci`, `OBV`).
- **باقی‌مانده و نیازمند اقدام:** موارد جدید **`ENG-01b`، `ENG-03b`، `PAR-01`، `AUTH-01`، `INF-03`، `QA-01`، `UI-02`، `IND-01`** (بخش ۳.۱)، بررسی مستقیم سرور زنده cPanel (بخش ۱ و ۴.۱)، و تصمیمات معماری پیش از فاز ۴ (بخش ۴.۲).

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

## ۳.۱. یافته‌های ممیزی جدید و نواقص باز راستی‌آزمایی‌شده (`Open Action Items — v1.40.0`)

> موارد زیر پس از بررسی خط‌به‌خط کد فعلی (پست-کامیت `time-anchoring`) به‌عنوان **نواقص واقعیِ هنوز باز** تأیید و ثبت شدند:

| شناسه | اولویت | موضوع و وضعیت واقعی در کد | اقدام اصلاحی لازم | فایل‌های هدف |
|---|---|---|---|---|
| **`ENG-01b`** | `P0` | **تکمیل `Session-Aware Aggregation` و اعتبارسنجی پیوستگی کندل‌های فرزند بین Web / PHP / Android:**<br>۱) **عدم بررسی پیوستگی فرزندان (`Contiguity`):** `TimeframeAggregator` در هر سه پلتفرم صرفاً *تعداد* کندل‌های فرزند (`minExpectedChildren`) را چک می‌کند (و در PHP/Web فقط برای باکت اول و آخر)؛ در نتیجه باکت‌های میانی دارای گپ یا کندل‌های ناپیوسته همچنان تجمیع می‌شوند.<br>۲) **بازنویسی Timestamp در اندروید:** `TimeframeAggregatorAlgorithm.kt` خروجی `getSessionBucketBounds()` را به `sanitizeAndValidate()` می‌سپارد که با `snapToCandleOpenUtc()` در `D1` فارکس/طلا (`17:00 NY` روز قبل) یک روز کامل به عقب (`00:00 UTC` روز قبل) اسنپ می‌شود و `H4` سهام آمریکا (`09:30`/`13:30 ET`) را به `12:00`/`16:00 UTC` برمی‌گرداند.<br>۳) **`H1`/`H4` سشن-محور:** `UtcTimeAnchorAlgorithm.kt` در اندروید `H1` سهام آمریکا را لنگر نمی‌زند (`:00 UTC` به‌جای `:30 ET` در PHP/Web) و `H1`/`H4` بازار `OTC_FX_METALS` در هر سه پلتفرم همچنان روی `00:00 UTC` می‌چرخد.<br>۴) **ناهمگونی تقویم و آستانه `W1`:** تشخیص نمادهای سفارشی در `getSessionCalendar` بین Android (`BTC*`/`SOL*`/`*US100*`) و PHP/Web (لیست ثابت) متفاوت است؛ آستانه `D1->W1` غیرکریپتو در Android `4` و در PHP/Web `3` است.<br>۵) **DST آخر هفته OTC و بسته شدن `D1`:** بازه آخر هفته OTC روی `22:00 UTC` ثابت شده (به‌جای `17:00 NY` که در EDT برابر `21:00 UTC` است) و بسته شدن `D1` در `store.js`/`isCandleClosed` هنوز بر پایه `open + 24h` است نه `16:00 ET` / `17:00 NY`. | ۱) افزودن بررسی پیوستگی زمانی (`gap` بین فرزندان متوالی نسبت به سشن معاملاتی) در `TimeframeAggregator` در کنار کنترل تعداد.<br>۲) حفظ `bucketOpenMillis` در `TimeframeAggregatorAlgorithm` برای تایم‌فریم‌های سشن-محور (یا هم‌ترازی دقیق `D1` به `00:00 UTC` `tradeDate` مشابه PHP/Web) و افزودن `H1` به `US_EQUITIES` در اندروید.<br>۳) تصمیم و یکسان‌سازی مرزبندی `H4` برای `OTC_FX_METALS`، قواعد `getSessionCalendar`، آستانه `D1->W1`، و چک DST-aware `America/New_York` برای آخر هفته و بسته شدن `D1`. | `UtcTimeAnchorAlgorithm.kt`, `TimeframeAggregatorAlgorithm.kt`, `CandleValidatorAlgorithm.kt`, `UtcTimeAnchor.php`, `TimeframeAggregator.php`, `priceFormatter.js`, `timeframeAggregator.js`, `store.js` |
| **`ENG-03b`** | `P0` | **یکسان‌سازی ریاضی `Volume Profile (VRVP)`، `VWAP` و فیلتر `Comb/Weekend` بین Web و Android:**<br>۱) **`Volume Profile`:** با اینکه هر دو پلتفرم `hasRealVolume` و `isEstimated` را دارند، کلاینت وب (`technicalIndicators.js`) حجم هر کندل را به‌صورت *یکسان* بین تمام Binهای لمس‌شده تقسیم می‌کند (`vol / spanBins`) و برای کندل‌های `volume=0` عدد `Math.max(1, volume)` می‌گذارد؛ در حالی که اندروید (`PriceFormatterAlgorithm.kt`) توزیع حجم را *متناسب با همپوشانی دقیق قیمت* (`overlap / weightSum`) محاسبه می‌کند و با وجود حجم واقعی در سری، کندل‌های بی‌حجم را صفر در نظر می‌گیرد. این تفاوت می‌تواند مقادیر `POC`، `VAH` و `VAL` را جابه‌جا کند.<br>۲) **`VWAP`:** وب همیشه `Math.max(1, volume)` اعمال می‌کند ولی اندروید تنها زمانی fallback بدون‌وزن می‌زند که کل حجم سشن صفر باشد.<br>۳) **فیلتر `Comb/Weekend`:** `store.js` وب فاقد فیلتر `filterSyntheticWeekendAndCombCandles` در مسیر مستقیم کلاینت است و `CandleValidatorAlgorithm.kt` برخلاف PHP مرحله ۲ فیلتر `Comb` را روی کریپتو ۲۴/۷ هم اجرا می‌کند. | پیاده‌سازی توزیع مبتنی بر همپوشانی دقیق `[low, high]` و سیاست یکسان وزن حجم صفر در `technicalIndicators.js` (یا هم‌سنگ‌سازی دقیق با `PriceFormatterAlgorithm.kt`)، همسان‌سازی رفتار `VWAP`، و مستثنا کردن یکپارچه `CRYPTO_24_7` از حذف `Comb`. | `technicalIndicators.js`, `store.js`, `PriceFormatterAlgorithm.kt`, `CandleValidator.php`, `CandleValidatorAlgorithm.kt` |
| **`PAR-01`** | `P0` | **ناسازگاری برچسب `Price Basis` برای `SPOTBRENT` (`tvdatafeed`):** در کلاینت وب (`store.js` تابع `resolvePriceBasis` خط ۴۸۸) برای `tvdatafeed` + `SPOTBRENT` هنوز مقدار **`Futures Ref`** برگردانده می‌شود؛ در حالی که `ProviderCatalog.php`، `ProviderId.kt` و `UtcTimeAnchorAlgorithm.kt` همگی **`CFD Feed`** برمی‌گردانند. | اصلاح `resolvePriceBasis` در `host_subdomain/assets/js/core/store.js` برای برگرداندن `'CFD Feed'` روی `tvdatafeed` + `SPOTBRENT` (و هم‌ترازی کامل جدول `Price Basis` بین Web/PHP/Android). | `host_subdomain/assets/js/core/store.js`, `ProviderCatalog.php`, `ProviderId.kt`, `UtcTimeAnchorAlgorithm.kt` |
| **`AUTH-01`** | `P1` | **ارسال ایمیل بازیابی رمز با `@mail()` ناپایدار روی cPanel:** تابع `sendRecoveryEmailMessage()` هنوز به `@mail()` متکی است و پاسخ HTTP حتی در صورت `mail_dispatched = false` مقدار `reset_code_sent = true` برمی‌گرداند. | جایگزینی `@mail()` با **SMTP احراز هویت‌شده** (`PHPMailer`/سوکت TLS روی پورت `465/587` هاست با تنظیمات در `env.local.php`/Secrets) یا **API تراکنشی HTTPS** (`Resend` / `Brevo` / `Mailgun`) + نمایش وضعیت/خطای شفاف در کلاینت در صورت شکست ارسال. | `host_subdomain/api/v1/auth.php`, `Secrets` / `env.local.php` |
| **`INF-03`** | `P1` | **Purge سراسری قدیمی در استقرار CI/CD:** با اینکه `candles_sync.php` پاک‌سازی را به آخر هفته OTC و نمادهای Intraday محدود کرده است، خط ۲۴۰ در `.github/workflows/build-apk.yml` هنگام هر Deploy هنوز `DELETE FROM candles WHERE timeframe != 'D1' AND volume = 0 AND (high_price - low_price) < (open_price * 0.00018)` را بدون فیلتر نماد/زمان اجرا می‌کند و کندل‌های کم‌نوسان weekday، `W1` و کریپتوهای `volume=0` را پاک می‌کند. | هم‌تراز کردن کوئری استقرار با منطق جدید (`timeframe NOT IN ('D1','W1')` + محدودسازی به نمادهای غیرکریپتو و بازه `Fri 22:00 – Sun 21:59 UTC`) یا حذف کامل Purge تهاجمی در استقرار. | `.github/workflows/build-apk.yml`, `host_subdomain/api/v1/candles_sync.php` |
| **`QA-01`** | `P1` | **تست Parity مشترک Web/PHP/Android و تست سناریوهای عملی (`Runtime Reliability`):** اکنون فقط تست‌های واحد JVM در اندروید وجود دارد (`Phase1AlgorithmsTest`, `Phase2AlgorithmsTest`) و هیچ مجموعه تست Golden Input/Output مشترکی بین Web، PHP و Android و تست عملی مرورگر/Emulator برای سناریوهای خطا اجرا نشده است. | ۱) ساخت فایل Golden Fixtures مشترک (JSON) و اجرای تست Parity هم‌زمان (`node --test` + PHP CLI + JUnit) روی `UtcTimeAnchor`، `TimeframeAggregator`، `VWAP` و `Volume Profile`.<br>۲) آزمون عملی وضعیت Provider در قطع اینترنت/API Key نامعتبر/Rate Limit، بازیابی Workspace پس از Restart و بررسی دوره `Auto-Sync` اندروید در چرخه حیات واقعی اپ. | `app/src/test/...`, `tests/` (Web & PHP parity runner) |
| **`UI-02`** | `P2` | **تکمیل `Drawing Manager` در Web دسکتاپ و هم‌ترازی تجربه موبایل/رسم:** وب اکنون انتخاب روی بوم، تغییر رنگ/ضخامت، حذف مورد انتخاب‌شده و پاک‌سازی همه رسم‌ها را دارد، اما پنل فهرست اشیاء (`Object Tree / Drawing Manager` با کنترل تک‌تک رسم‌ها و قفل/مخفی‌سازی) و هم‌ترازی کامل رفتار رسم و پنل‌های موبایل با استاندارد TradingView و اندروید هنوز کامل نیست. | افزودن پنل مدیریت فهرستی رسم‌ها (`Drawing Manager / Object Tree`) در وب دسکتاپ و یکسان‌سازی رفتار تعاملی ابزارهای رسم و مدیریت پنل‌های موبایل بین Web و Android. | `host_subdomain/assets/js/app.js`, `host_subdomain/assets/js/components/chartRenderer.js`, `ChartViewScreen.kt` |
| **`IND-01`** | `P2` | **فقدان اندیکاتور `Pivot Points` روی بوم چارت (ردیف ۱۴ کاتالوگ ۳ سطحی):** از میان ۱۵ اندیکاتور/ابزار اصلی محبوب TradingView، ۱۴ مورد در وب و اندروید پیاده‌سازی شده‌اند؛ اما `Pivot Points` اکنون فقط به‌صورت عددی ایستا در کارت Overview/Prediction دیده می‌شود و به‌عنوان Overlay روی چارت وجود ندارد. | افزودن اندیکاتور هم‌پوشان `Pivot Points` (حداقل حالت‌های `Standard / Traditional` و `Fibonacci` با لنگر جلسه روزانه/هفتگی `sessionDayKey`) روی بوم چارت در وب و اندروید همراه با ذخیره وضعیت در تب و `workspace_sync.php`. | `technicalIndicators.js`, `chartRenderer.js`, `PriceFormatterAlgorithm.kt`, `CandlestickCanvas.kt`, `ChartTabState.kt`, `ChartViewScreen.kt` |

---

## ۴. موارد نیازمند راستی‌آزمایی هاست و تصمیمات باز پیش از فاز ۴ (`TO VERIFY / OPEN`)

### ۴.۱. موارد زیرساختی تاییدنشده روی cPanel (`Section 5 of INFRASTRUCTURE_INVENTORY.md`)
- [ ] نسخه دقیق PHP فعال زیر `chart.manico.es` (از خروجی زنده `/api/v1/system/status.php`), `memory_limit`, `max_execution_time`, `upload_max_filesize`, `post_max_size`.
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
