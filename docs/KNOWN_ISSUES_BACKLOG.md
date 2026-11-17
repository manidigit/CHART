# گزارش و لیست مشکلات فنی شناسایی‌شده (Known Issues Backlog)

**تاریخ ثبت اولیه:** ۱۵ نوامبر ۲۰۲۶ | **آخرین به‌روزرسانی:** ۱۷ نوامبر ۲۰۲۶  
**وضعیت:** موارد ۱ تا ۴ حل‌شده و تست‌شده در کدهای اجرایی؛ مورد ۵ باز و در دست اقدام (Open / P0)

---

## ۱. تناقض جهت پیش‌بینی در بازه زمانی هم‌پوشان بین تایم‌فریم‌ها (`Multi-Timeframe Forecast Direction Conflict`) — ✅ حل شد

- **اولویت:** بحرانی (Critical)
- **شواهد تصویری:** مقایسه اسکرین‌شات‌های `SPOTBRENT · 1h` و `SPOTBRENT · 4h` در قیمت یکسان `98.548` و زمان `21:56`
- **شرح مشکل:**
  - در تایم‌فریم **۱ ساعته (`1h`)**، سناریوی اول (`Primary`) برای ۳۰ کندل آینده (۳۰ ساعت آینده) مسیر صعودی ترسیم می‌کرد، در حالی که در تایم‌فریم **۴ ساعته (`4h`)** از همان کندل‌های ابتدایی (`+1` تا `+8` معادل ۴ تا ۳۲ ساعت آینده) مسیر نزولی ترسیم می‌شد و مقدار `POC` در بنر SMC نیز به کندل‌های قدیمی (`114.810`) اشاره داشت.
- **اصلاح انجام‌شده در کد:**
  1. در `SMCPredictionEngine.extractMultiTimeframeFeatures` (`forecastEngine.js` و `ForecastEngine.kt`)، محاسبه `Volume Profile (POC / VAH / VAL)` به پنجره ساختار اخیر بازار متناسب با هر تایم‌فریم (`M15: 80`, `M30: 64`, `H1: 54`, `H4: 38`, `D1: 30`) و محدوده `lastClose ± 3.5 × ATR` مقید شد تا `POC` همیشه سطح فعال پیرامون قیمت جاری را بازتاب دهد.
  2. در `ForecastEngine.project` (`forecastEngine.js` و `ForecastEngine.kt`) و `chartRenderer.js`، ترتیب سناریوهای `SCENARIO_A / SCENARIO_B / SCENARIO_C` و وزن احتمالات بین تایم‌فریم پایین‌تر و بالاتر هم‌راستا شد و بازه `Sub-Bar Rollup Consistency` از ۳ کندل به ۱۰ کندل کامل هم‌پوشان (`overlapBars = 10` معادل ۴۰ ساعت در `H4` و ۱۰ ساعت در `H1`) افزایش یافت تا جهت و قیمت کندل‌های هم‌پوشان در تمام تایم‌فریم‌ها کاملاً منطبق باشد.

---

## ۲. نمایش گپ‌های کاذب در تایم‌فریم‌های ساعتی (`⚠️ Gaps: 1` در `1h` و `⚠️ Gaps: 3` در `4h`) — ✅ حل شد

- **اولویت:** بالا (High)
- **شواهد تصویری:** نمایش برچسب نارنجی `⚠️ Gaps: 1` روی چارت `SPOTBRENT · 1h` و `⚠️ Gaps: 3` روی چارت `SPOTBRENT · 4h`
- **شرح مشکل:**
  - در تایم‌فریم `1h` بسته شدن زودهنگام بازار در تعطیلی رسمی (Labor Day در ۷ سپتامبر ۲۰۲۶) و در تایم‌فریم `4h` روزهای تعطیل رسمی بازار (کریسمس، سال نو و جمعه نیک) به عنوان گپ داده شمارش شده بودند.
- **اصلاح انجام‌شده در کد:**
  - در `gapDetector.js`، `GapDetector.php` و `GapDetectorAlgorithm.kt`، تلورانس بسته شدن زودهنگام روزهای تعطیل قبل از استراحت روزانه در `H1`، تعطیلات تک‌روزه/شیفت فاز سشن در `H4` و تعطیلات بانکی در `D1`/`W1` برای نمادهای غیرکریپتو اعمال شد و تعداد گپ‌های کاذب `SPOTBRENT` در تمام تایم‌فریم‌های `M15`، `H1`، `H4` و `D1` به `0` (`CLEAN`) رسید.

---

## ۳. دیده نشدن چراغ چشمک‌زن وضعیت بازار در نوار ابزار بالا (`Missing Topbar Blinking Status Dot`) — ✅ حل شد

- **اولویت:** متوسط (Medium)
- **شواهد تصویری:** فضای خالی سمت چپ دکمه `CSV` در نوار بالای صفحه هنگام کش شدن فایل CSS قدیمی
- **اصلاح انجام‌شده در کد:**
  - در `headerView.js` ابعاد، رنگ پس‌زمینه و درخشش پایه (`width: 9px; height: 9px; border-radius: 50%; display: inline-block; background: ...; box-shadow: ...`) به‌صورت استایل درون‌خطی (`inline style`) روی `.ci-status-dot` اضافه شد و نسخه کش فایل‌های استایل و اسکریپت در `host_subdomain/index.html` به `v=1.44.0` ارتقا یافت.

---

## ۴. ممیزی جامع و الگوی نوسانی کارتونی در موتور پیش‌بینی (`Forecasting Pipeline Audit & Synthetic Wave Distortion`) — ✅ حل‌شده و تست‌شده (Rev 2.1)

- **اولویت:** بسیار بالا (P0 / P1) — معماری و صداقت الگوریتمی
- **اسناد فنی مرجع:** [`docs/01-product/FORECAST_ENGINE_V2_SPEC.md`](./01-product/FORECAST_ENGINE_V2_SPEC.md) · [`docs/01-product/SMC_ANALOG_ENGINE_REFACTOR_SPEC.md`](./01-product/SMC_ANALOG_ENGINE_REFACTOR_SPEC.md)
- **۷ یافته بحرانی از ممیزی مستقیم کدهای اجرایی (تماماً برطرف‌شده در Rev 2.1):**
  1. **حجم مصنوعی:** حذف جایگزینی حجم ناموجود با ۱۰۰ و ممنوعیت تزریق حجم مصنوعی در `ForecastPoint` و محاسبات نقدینگی.
  2. **سوگیری جهت‌دار شدید:** جایگزینی با انتخاب برون‌نمونه ۴فازه‌ی Nested Walk-Forward و رگرسیون لاجستیک ۳-سناریویی کالیبره‌شده (با وضعیت `NOT_ESTIMABLE` برای نمونه کمتر از ۳).
  3. **مغایرت وب و اندروید:** یکسان‌سازی کامل محاسبات در Kotlin و JS و تطابق 12 رقم بامعنای IEEE-754 در `canonicalJson` و `inputHash` با تایید بردارهای طلایی (`golden_vectors_v2.json`).
  4. **تولید ۶ الگوی مصنوعی در صورت کمبود داده:** حذف کامل الگوهای موجی مصنوعی و جایگزینی با `DataReadinessGate` (`nOpMin`: 155/232/318/550 و `nStatMin`: 465/852/1248/2410) و صدور صریح `DATA_NOT_READY` / `INSUFFICIENT_EVIDENCE`.
  5. **ماشین حالت صلب:** حذف کامل ماشین حالت و توابع `sin/cos`؛ استفاده مستقیم از `EmpiricalAnalogEngine` با مرز دقیق علیت ($j_{\max} = T - 2L - H - G_{\text{embargo}}$ و حداقل ۶ آنالوگ واقعی).
  6. **احتمالات کالیبره‌نشده:** جایگزینی با L2 Multinomial Logit + Temperature Scaling و Brier Score برون‌نمونه و گیت‌های ۶گانه `NoEdgeGate` (rMAE < 1، WIS 5Q < Naive، پوشش [72%, 88%]، HLN-DM p ≤ 0.05، Bootstrap p ≤ 0.10).
  7. **کندل‌های OHLC مصنوعی:** جداسازی کامل پیش‌بینی ۵-چندکی (`q10, q25, q50, q75, q90`) با کالیبراسیون Conformal نرمال‌شده با نوسان و حذف کامل `rejectionWick` ساختگی.
- **چک‌لیست اجرایی و تایید خودکار (Rev 2.1):**
  - [x] ایجاد و استقرار اسکریپت شبیه‌ساز داده M15 واقع‌گرایانه (`scripts/makeSampleData.js`) با تولید ۹۶۰ کندل نمونه پیوسته در `data/sample_M15.json`.
  - [x] پیاده‌سازی کامل ابزار آزمون پیش‌رونده (`scripts/backtest.js`) و پایپ‌لاین CI (`.github/workflows/backtest.yml`).
  - [x] حذف کامل `generateSyntheticProfiles`، توابع `sin/cos` و الزام کف `nOpMin` / آنالوگ‌های علیت‌محور در Android (`ForecastEngine.kt`, `EmpiricalAnalogEngine.kt`) و Web (`forecastEngine.js`).
  - [x] پیاده‌سازی Nested Walk-Forward هفت‌سگمنتی، WIS 5Q، Bartlett $N_{\text{eff}}$، Conformal نرمال‌شده، HLN-DM و Stationary Block Bootstrap در `WalkForwardEvaluator.kt`, `ForecastStatisticalTests.kt`, `walkForwardEvaluator.js`, `statisticalTests.js`.
  - [x] تضمین Prefix Invariance across H∈{10,20,60} برای تمام ۱۰ مدل رجیستری و افشای صریح خطای پلاگین با `ModelExecutionStatus.FAILED`.
  - [x] **نتیجه اجرای تست‌ها:** تمام **۵۲/۵۲** تست واحد اندروید (`gradle :app:testDebugUnitTest`: `Phase4ForecastTest`, `ForecastV2Test`, `Phase1AlgorithmsTest`, `Phase2AlgorithmsTest`) و **۴۶/۴۶** تست Node.js (`node --test tests/*.test.mjs`) با موفقیت کامل (Zero Failures) پاس شدند.

---

## ۵. عدم به‌روزرسانی و فریز چارت هنگام تغییر نماد از واچ‌لیست و سوئیچ تایم‌فریم (`Watchlist Symbol Switch & Timeframe Change Chart Stall`) — ⏳ باز / در دست اقدام (Open / P0)

- **اولویت:** بحرانی (Critical / P0)
- **تاریخ گزارش:** ۱۷ نوامبر ۲۰۲۶
- **شواهد و گزارش:**
  - با کلیک روی نمادهای مختلف در واچ‌لیست (Watchlist)، چارت فعال به‌روزرسانی نشده و روی نماد قبلی ثابت می‌ماند.
  - با کلیک روی گزینه‌های تایم‌فریم در نوار ابزار بالای چارت (M15، H1، H4، D1)، نمودار واکنش نشان نداده و کندل‌های تایم‌فریم جدید ترسیم نمی‌شوند.
- **ریشه‌یابی فنی (Root Cause Analysis):**
  1. **عدم فراخوانی همگام‌سازی اجباری در سوئیچ تب (`openOrFocusSymbolTab`):**
     در `host_subdomain/assets/js/app.js`، با کلیک روی ردیف واچ‌لیست رویداد `action === 'open-chart'` فراخوانی شده و کنترل را به `openOrFocusSymbolTab(code)` می‌سپارد. اگر تب نماد از قبل باز شده باشد یا کش آن ناقص/خالی باشد، تابع `syncSymbolNow` برای بارگیری کندل‌های تازه صدا زده نمی‌شود؛ در نتیجه `tab.candles` خالی می‌ماند و چارت تغییری نشان نمی‌دهد.
  2. **مسابقه زمانی ابعاد بوم پس از رندر DOM (`DOM Layout Race Condition in redrawActiveCanvas`):**
     در متد `renderApp()`، با تغییر `root.innerHTML` ساختار DOM به طور کامل بازنویسی شده و المان `#main-chart-canvas` مجدداً ایجاد می‌گردد. فراخوانی بلادرنگ و هم‌گام `redrawActiveCanvas()` قبل از آن انجام می‌شود که مرورگر فرصت محاسبه ابعاد نهایی (`canvas.getBoundingClientRect()`) را پیدا کند. در نتیجه شرط `if (rect.width <= 0 || rect.height <= 0) return;` در `renderCandlestickCanvas` برقرار شده و تابع بدون ترسیم هیچ کندلی خارج می‌شود.
  3. **تداخل توالی در تعویض تایم‌فریم (`Timeframe Sequence Guard & Abort Drift`):**
     هنگام کلیک روی تایم‌فریم جدید (`action === 'set-timeframe'`)، شناسه `chartId` و مقدار `timeframe` تغییر می‌کند، اما چنانچه کندل‌های تجمیعی در کش آماده نباشند، مقدار `activeTab.candles` موقتاً خالی شده و پاسخ نامتقارن وب‌سوکت یا فچ سرور به علت چک‌های توالی یا لغو ناخواسته `AbortController` روی بوم منعکس نمی‌شود.
  4. **محدودیت داده‌های اولیه استاتیک tvdatafeed:**
     پوشه `host_subdomain/data/tvdatafeed/` تنها حاوی داده‌های استاتیک نماد `SPOTBRENT` بوده و برای سایر نمادها (`XAUUSD`, `BTCUSD` و...) در صورت عدم رسیدن داده‌های آنلاین بک‌اند، هیچ داده جایگزین یا اسکلتون لودینگی مانع از فریز دیداری نمی‌شود.
- **برنامه اصلاح مهندسی (Fix Strategy):**
  1. **اصلاح رویداد واچ‌لیست در `app.js`:** تضمین فراخوانی فوری `syncSymbolNow` همراه با فورس سوئیچ به نمای چارت (`state.activeWorkspaceView = 'chart'`) و بررسی دسترسی به کش.
  2. **استفاده از `requestAnimationFrame` در بازترسیم بوم:** بهینه‌سازی `redrawActiveCanvas` به نحوی که اگر عرض یا ارتفاع کانواس هنوز صفر بود، ترسیم به فریم بعدی رندر موکول شود تا مطمئن شویم بوم به طور قطعی ترسیم می‌گردد.
  3. **مدیریت پایدار تغییر تایم‌فریم:** اصلاح توالی تعویض تایم‌فریم به شکلی که کندل‌های پیشین تا زمان بارگیری تایم‌فریم جدید به عنوان اسکلتون موقت حفظ شده و وضعیت لودینگ به کاربر نمایش داده شود.
  4. **تست‌های خودکار:** افزودن تست شبیه‌سازی سوئیچ نماد و تایم‌فریم در `tests/web_parity.test.mjs` جهت جلوگیری از هرگونه رگرسیون بعدی.

---

## ۶. رفع خطای وابستگی‌های اندپوینت PHP موتور Chronos-2 و یکپارچه‌سازی Cache-Busting جاوااسکریپت (`v1.45.2`) — ✅ حل شد

- **اولویت:** بحرانی (Critical / P0)
- **تاریخ ثبت و اصلاح:** ۱۷ نوامبر ۲۰۲۶
- **شرح ایرادات شناسایی‌شده:**
  1. در `host_subdomain/api/v1/chronos2_forecast.php` و `host_subdomain/scripts/cron_process_chronos2_queue.php`، فایل‌های ناموجود `core/Config.php` و `core/Response.php` فراخوانی شده بودند.
  2. در `host_subdomain/api/v1/core/Chronos2QueueManager.php`، متد ناموجود `Database::getConnection()` و کوئری روی جدول ناموجود `symbols` فراخوانی شده بود، در حالی که کلاس `Database.php` متد `Database::getPdo()` را ارائه می‌دهد و جدول `candles` بر پایه `chart_id` (از طریق `ProviderCatalog::resolveChartId`) و ستون `open_time_utc` ساختار یافته است.
  3. نسخه‌های cache-busting در importهای ماژول‌های جاوااسکریپت (`host_subdomain/assets/js/**/*.js`) روی `?v=1.43.0` باقی مانده بود و در `store.js` نیز تابع `isChronosForecastMatchingTab` به جای آخرین کندل بسته‌شده، آخرین عنصر آرایه (شامل کندل باز/در حال شکل‌گیری) را بررسی می‌کرد.
- **اصلاح انجام‌شده در کد:**
  1. جایگزینی کامل `Config.php` و `Response.php` با کلاس استاندارد موجود `ChartIntelligence\Core\ApiEnvelope` (`core/ApiEnvelope.php`) و `ProviderCatalog.php` در `chronos2_forecast.php` و `cron_process_chronos2_queue.php`.
  2. اصلاح `Database::getConnection()` به `Database::getPdo()` و تطبیق کامل کوئری جدول `candles` با ستون‌های واقعی (`chart_id`, `provider_id`, `timeframe`, `open_time_utc`, `is_closed = 1`) در `Chronos2QueueManager.php`.
  3. ارتقای یکپارچه تمام پارامترهای cache-busting در فایل‌های JS، `index.html`، `status.php` و `package.json` به `v=1.45.2` و اصلاح `isChronosForecastMatchingTab` در `store.js` برای تطابق با آخرین کندل بسته‌شده (`PriceFormatter.isCandleClosed`).

---

## ۷. استانداردسازی جامع سیستم آیکون‌ها، نشان‌ها (Badges) و پالت رنگ برند برای تمام ۷۹ نماد کاتالوگ (Web و Android) — ✅ حل شد

- **اولویت:** بالا (High / P1)
- **تاریخ ثبت و اصلاح:** ۱۷ نوامبر ۲۰۲۶
- **شرح ایراد گزارش‌شده:**
  - نمادها و سهام‌های اضافه‌شده به کاتالوگ گسترش‌یافته ۷۹ نمادی، در واچ‌لیست و سایر بخش‌های برنامه فاقد آیکون اختصاصی بودند یا به صورت دایره‌های خالی/بی‌تصویر نمایش داده می‌شدند. کاربر بر ضرورت وجود یک استاندارد جامع و یکدست برای تمام نمادها تأکید کرد.
- **ریشه‌یابی فنی (Root Cause Analysis):**
  1. **عدم پوشش کامل نمادها در ماژول وب (`watchlistView.js`):**
     در وب تنها ۲۲ نماد اولیه دارای آیکون SVG و استایل اختصاصی در نگاشت نشان‌ها بودند و ۵۷ نماد جدید به فال‌بک عمومی با علامت بعلاوه/دایره ساده منتقل می‌شدند. همچنین نمادهای `SPX500USD` و `NDQ` فاقد SVG کامل بودند (`svgIcon: ''`).
  2. **دایره‌های خالی و سفید در اندروید (`WatchlistRowCard.kt`):**
     در کامپوننت `AssetSymbolBadge`، شرط `val hasCustomVectorArt = isGold || isOil || ... || isStock` به دلیل تعریف `ProviderId.isStock(upper)` برای تمام ۷۰ سهم فعال می‌شد و بخش `Canvas` را فعال می‌کرد؛ اما در داخل ساختار `when`، تنها ۱۳ سهم کد رسم برداری داشتند. در نتیجه برای ۵۷ سهم دیگر هیچ کدی در `Canvas` اجرا نمی‌شد و چون `hasCustomVectorArt` معادل `true` بود، بلوک `else` (که متن مونوگرام را نشان می‌داد) هرگز اجرا نمی‌شد و دایره‌ها به طور کامل خالی و محو رندر می‌شدند.
- **اصلاحات انجام‌شده:**
  1. **وب (`host_subdomain/assets/js/views/watchlistView.js`):**
     - ایجاد رجیستری جامع `SYMBOL_CATALOG_BADGES` برای ۱۰۰٪ نمادهای کاتالوگ (۷۹ نماد) شامل:
       - آیکون‌های وکتور اختصاصی SVG متناسب با هویت برند
       - گرادیان پس‌زمینه خطی متناسب با سکتور و هویت بصری کمپانی
       - کد رنگ دقیق برندینگ و برچسب مونوگرام ۲ الی ۳ حرفی
       - متادیتای دسته‌بندی سکتوری و تگ ارائه‌دهنده سرویس
     - بازنویسی `getAssetBadge(symbolCode)` با پشتیبانی از جستجوی مستقیم و تطبیق تمیز نام نماد.
  2. **اندروید (`app/src/main/java/es/manico/chartintelligence/ui/components/WatchlistRowCard.kt`):**
     - ایجاد تابع `resolveBadgeMonogram(symbolCode)` برای نگاشت استاندارد برچسب‌های مونوگرام نمادها.
     - اصلاح ساختار `hasCustomVectorArt` با تعریف مجموعه صریح `customVectorSymbols`؛ در صورتی که نمادی ترسیم برداری اختصاصی در بوم نداشته باشد، به بلوک `else` هدایت شده و یک مونوگرام مونو‌اسپیس با کنتراست بالا و زیبا بر روی گرادیان برند خود دریافت می‌کند (ریشه‌کن شدن کامل دایره‌های خالی).
     - پیاده‌سازی رسم برداری بوم برای دارایی‌های شاخص از جمله `PLTR`, `V`, `MA`, `BRK.B`, `2222.SR`, `DIS`, `MCD`, `WMT`, `XOM`, `CVX`, `TSM`, `COIN` و...
     - به‌روزرسانی کامل `resolveAssetBadge` و پالت رنگ‌ها و حاشیه‌ها (`gradientColors` و `borderTint`) برای پوشش تمام ۷۹ نماد.
  3. **تست خودکار و سنجش کیفیت (`tests/web_parity.test.mjs`):**
     - افزودن تست جامع `SYMBOL-STANDARDS-79` که تک‌تک ۷۹ نماد کاتالوگ را بررسی کرده و عدم خالی بودن SVG، معتبر بودن گرادیان، کد هگز رنگی و دسته‌بندی را اعتبارسنجی می‌کند.
     - اجرای موفق تست‌های ۱۱/۱۱ در محیط نود و بیلد موفق پروژه اندروید (`compile_applet`).

---

## ۸. اصلاح معماری اجرای Chronos-2 به حالت کاملاً درخواستی (`Strictly On-Demand PHP → Python Worker` بدون Cron و صف پس‌زمینه) — ✅ حل شد

- **اولویت:** بحرانی (Critical / P0) — تصمیم قطعی معماری
- **تاریخ ثبت و اصلاح:** ۱۷ نوامبر ۲۰۲۶
- **اهداف و الزامات معماری:**
  1. حذف کامل هرگونه Cron Job، صف پس‌زمینه (`.job.json`) و polling دوره‌ای مستقل.
  2. اجرای مستقیم `PHP → Python Worker` فقط با درخواست صریح کاربر (کلیک روی دکمه `Chronos-2`).
  3. ممنوعیت اجرای خودکار هنگام باز شدن سایت/بارگذاری تب، تغییر نماد، تغییر تایم‌فریم یا بسته شدن کندل جدید.
  4. محدودسازی پیگیری درخواست در حال اجرا (`PROCESSING`) به حداکثر ۳ تلاش محدود (`MAX_CHRONOS2_ATTEMPTS = 3`).
  5. کش کردن نتایج برای جلوگیری از اجرای مجدد مدل در درخواست‌های تکراری و ابطال خودکار کش هنگام تغییر داده‌های مبنا (کندل بسته جدید یا تغییر قیمت بسته شدن کندل‌های تاریخی) بدون اجرای مجدد خودکار.
  6. نمایش خطای واقعی و قابل مشاهده روی نمودار و نوار وضعیت در صورت بروز محدودیت اجرایی روی هاست (نظیر غیرفعال بودن `exec()` یا نبودن محیط پایتون) بدون گیر افتادن در صف.
- **تغییرات اعمال‌شده در فایل‌ها:**
  1. **`host_subdomain/api/v1/core/Chronos2QueueManager.php`:**
     - حذف کامل ایجاد فایل‌های صف `.job.json` و دایرکتوری `queue/`؛ تبدیل `requestOrRunForecast` به اجرای مستقیم همگام با قفل انحصاری `flock()` (`executeDirectJobUnderLock`) و بازگرداندن خطای صریح در صورت غیرفعال بودن `exec()` یا شکست پردازش پایتون.
     - اعتبارسنجی `expectedLastClose` و `expectedContextSha256` هنگام خواندن کش سرور (`readCachedForecast`) پیش و پس از قفل، به همراه بازنویسی اجباری فایل ورودی کندل‌ها در `cache miss` برای تشخیص تغییر داده‌های مبنا.
     - غیرفعال‌سازی کامل `processQueueBatch()` با وضعیت `DISABLED`.
  2. **`host_subdomain/api/v1/chronos2_forecast.php`:**
     - حذف کامل حالت `enqueue_only` و وضعیت‌های `QUEUED`؛ پشتیبانی انحصاری از حالت `sync_or_queue` (اجرای مستقیم یا بازگشت کش معتبر) و `cache_only` با بررسی هم‌زمان `last_closed_price` و `context_close_sha256`.
  3. **`host_subdomain/scripts/cron_process_chronos2_queue.php`:**
     - منسوخ و غیرفعال‌سازی کامل اسکریپت با خروجی `status: 'DISABLED'`.
  4. **`host_subdomain/assets/js/core/store.js`:**
     - حذف `'showChronosForecast'` از `INDICATOR_FLAG_KEYS` برای جلوگیری از همگام‌سازی ناخواسته بین نمادها/تب‌ها.
     - تنظیم `showChronosForecast: false` در بارگذاری و ذخیره `localStorage` تا هنگام باز شدن مجدد سایت هیچ پیش‌بینی به‌طور خودکار اجرا نشود.
     - تقویت `isChronosForecastMatchingTab` با تطبیق `series.last_closed_price` در کنار `origin_open_time_utc_ms` و افزودن `invalidateTabChronosIfStale(tab)` جهت پاک‌سازی کش نامعتبر و خاموش کردن خودکار دکمه.
  5. **`host_subdomain/assets/js/services/apiService.js`:**
     - اعمال `MAX_CHRONOS2_ATTEMPTS = 3` و `clearChronos2TimerForTab` برای پیگیری محدود صرفاً روی درخواست فعال و لغو فوری تایمر هنگام بستن یا تغییر نماد.
     - افزودن `computeClosedSeriesDigest(closedCandles)` و گنجاندن آن در کلید کش کلاینت (`buildClientChronos2CacheKey`)، به علاوه فراخوانی `invalidateTabChronosIfStale(tab)` پس از همگام‌سازی داده‌ها در `syncSymbolNow`.
     - انتقال پیام‌های خطای واقعی هاست/پایتون به وضعیت تب (`ERROR`).
  6. **`host_subdomain/assets/js/components/chartRenderer.js` و `host_subdomain/assets/js/app.js`:**
     - حذف اجرای خودکار `requestChronos2ForecastForTab` در `openOrFocusSymbolTab` و خاموش‌سازی `showChronosForecast` در تغییر تایم‌فریم/بازه.
     - حذف وضعیت `QUEUED` از رندر بوم و نوار وضعیت، و افزودن بنر خطای واضح (`Chronos-2 Error: ...`) مستقیماً روی بوم چارت و چیپ وضعیت.
  7. **`tests/web_parity.test.mjs`:**
     - افزودن تست‌های ابطال کش با تغییر قیمت مبنا (`computeClosedSeriesDigest` / `invalidateTabChronosIfStale`)، حذف `.job.json` و `enqueue_only` و `QUEUED`، غیرفعال بودن کرون، حذف همگام‌سازی `showChronosForecast` و محدودیت ۳ تلاش کلاینت (**۱۱/۱۱ تست پاس شد**).

---

## ۹. همگام‌سازی پایپ‌لاین GitHub Actions با ساختار تمیز `v1.46.x` و `Chronos-2` — ✅ حل شد در کد / نیازمند پاک‌سازی فایل‌های قدیمی روی شاخه `main` گیت‌هاب

- **اولویت:** بحرانی (Critical / P0)
- **تاریخ ثبت و اصلاح:** ۱۷ نوامبر ۲۰۲۶
- **ریشه خطای Commit `5e8f557` در GitHub Actions:**
  - در نسخه `v1.45.1` تمام فایل‌های موتور پیش‌بینی قبلی (`PredictionScreen.kt`، پکیج `forecast/`، `ForecastV2Test.kt`، `Phase4ForecastTest.kt`، `tests/forecast_v2.test.mjs`، `tests/phase4_forecast.test.mjs` و `.github/workflows/backtest.yml`) به پوشه `/archive/` منتقل و متد قدیمی `computeFutureCandlestickProjection` حذف شد؛ اما در Push روی شاخه `main` گیت‌هاب، فایل‌های قدیمی حذف نشده و در کنار نسخه جدید `Phase2IndicatorsAlgorithm.kt` و `technicalIndicators.js` باقی مانده بودند.
- **اصلاح انجام‌شده در `.github/workflows/build-apk.yml`:**
  1. افزودن گام **`Verify Clean v1.46.x Structure (No Stale Archived Files)`** در جاب `build-android-apk` برای شناسایی فوری فایل‌های آرشیوشده در صورت جا ماندن روی شاخه `main`.
  2. افزودن اجرای خودکار **`gradle :app:testDebugUnitTest --no-daemon --stacktrace`** (۲۸ تست واحد و Robolectric اندروید) در کنار `gradle assembleDebug`.
  3. افزودن اجرای خودکار **`node --test tests/web_parity.test.mjs`** (۱۱ تست پاریتی وب و `Chronos-2`)، بررسی سینتکس **`python3 -m py_compile host_subdomain/scripts/chronos2_worker.py`** و بررسی سینتکس **`php -l`** پیش از بسته‌بندی و استقرار وب در `package-web-subdomain`.
- **چک‌لیست پاک‌سازی روی شاخه `main` گیت‌هاب پیش از Push بعدی:**
  - اطمینان از حذف کامل مسیرهای زیر از ریشه شاخه `main` در گیت‌هاب (که هم‌اکنون در `/archive/` نگهداری می‌شوند):
    - `app/src/main/java/es/manico/chartintelligence/ui/screens/PredictionScreen.kt`
    - `app/src/main/java/es/manico/chartintelligence/ui/screens/ForecastLabScreen.kt`
    - `app/src/main/java/es/manico/chartintelligence/ui/components/ForecastLabComponents.kt`
    - `app/src/main/java/es/manico/chartintelligence/ui/components/ForecastV130Components.kt`
    - `app/src/main/java/es/manico/chartintelligence/forecast/`
    - `app/src/test/java/es/manico/chartintelligence/ForecastV2Test.kt`
    - `app/src/test/java/es/manico/chartintelligence/Phase4ForecastTest.kt`
    - `tests/forecast_v2.test.mjs` و `tests/phase4_forecast.test.mjs` و `tests/golden_vectors_v2.json`
    - `.github/workflows/backtest.yml`
    - `host_subdomain/assets/js/forecast/`, `host_subdomain/assets/js/views/forecastView.js`, `host_subdomain/assets/js/views/analysisView.js`, `host_subdomain/api/v1/forecast/`, `host_subdomain/api/v1/forecast.php`

---

## ۱۰. رفع باگ پاک شدن وضعیت `PROCESSING`/`ERROR` و عدم نمایش پیش‌بینی یا خطای `Chronos-2` روی نمودار (`v1.46.1`) — ✅ حل شد

- **اولویت:** بحرانی (Critical / P0)
- **تاریخ ثبت و اصلاح:** ۱۷ نوامبر ۲۰۲۶
- **ریشه مشکل گزارش‌شده روی `SPOTBRENT 15m` (اسکرین‌شات کاربر):**
  1. در متد `renderApp()` فایل `host_subdomain/assets/js/app.js`، شرط قدیمی `!isChronosForecastMatchingTab(activeTab, activeTab.chronosForecast)` هنگامی که `chronosForecast === null` بود (یعنی دقیقاً هنگام `PROCESSING` یا `ERROR`) مقدار `activeTab.chronosStatus` را بلافاصله به `'IDLE'` بازنشانی می‌کرد. در نتیجه:
     - وضعیت `Running...` هیچ‌گاه نمایش داده نمی‌شد؛
     - پیام خطای واقعی سرور/پایتون (`chronosError`) بلافاصله ناپدید می‌شد و نوار بالا به‌اشتباه به متن پیش‌فرض `Chronos-2 Q50` برمی‌گشت در حالی که فضای آینده خالی می‌ماند.
  2. متد `requestChronos2ForecastForTab` در `apiService.js` ساختار خطاهای `ApiEnvelope::sendError` (`message_key` / `error_code`) یا پاسخ‌های متنی غیر-JSON سرور را خوانش نمی‌کرد و فقط `payload.error || payload.message` را چک می‌کرد.
  3. نسخه فایل‌های استاتیک و کش مرورگر هنوز روی `v=1.45.2` باقی مانده بود و در `status.php` عنوان قدیمی `Forecast Engine Archived` دیده می‌شد.
- **اصلاحات اعمال‌شده:**
  1. **`host_subdomain/assets/js/core/store.js` و `host_subdomain/assets/js/app.js`:**
     - افزودن تابع خالص `reconcileTabChronosStateOnRender(tab)` و استفاده از آن در `renderApp()` به‌گونه‌ای که صرفاً پیش‌بینی منقضی‌شده غیر-`null` ابطال شود و وضعیت‌های `PROCESSING` و `ERROR` (به‌همراه `chronosError`) هنگام رندر و باز-رندر کاملاً حفظ شوند؛ همچنین جلوگیری از ریست ناخواسته وضعیت تب فعال در `openOrFocusSymbolTab` هنگام کلیک مجدد روی همان نماد و تایم‌فریم.
  2. **`host_subdomain/assets/js/services/apiService.js`:**
     - افزودن `extractChronos2ErrorMessage(httpStatus, rawText, jsonPayload)` و خوانش امن `res.text()` + `JSON.parse` برای استخراج دقیق `error`، `message`، `message_key` (`ApiEnvelope::sendError`) و متن خطاهای غیر-HTML سرور جهت نمایش مستقیم روی بوم نمودار و چیپ وضعیت.
  3. **ارتقای نسخه کش‌باستینگ به `v=1.46.1`:**
     - به‌روزرسانی تمامی importهای ماژول‌های ES، `host_subdomain/index.html`، `host_subdomain/assets/js/core/i18n.js`، `package.json` و `host_subdomain/api/v1/system/status.php` (`version: 1.46.1` و `phase: Phase 1-3 Core Engine & On-Demand Chronos-2 Forecast (v1.46.1)`).
  4. **تست رگرسیون (`tests/web_parity.test.mjs`):**
     - افزودن تست‌های واحد برای `reconcileTabChronosStateOnRender` (حفظ `PROCESSING` و `ERROR` و ابطال کش منقضی‌شده)، `extractChronos2ErrorMessage` و کنترل یکپارچگی `v=1.46.1`.
