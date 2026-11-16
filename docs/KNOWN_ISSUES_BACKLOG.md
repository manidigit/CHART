# گزارش و لیست مشکلات فنی شناسایی‌شده (Known Issues Backlog)

**تاریخ ثبت:** ۱۵ نوامبر ۲۰۲۶  
**وضعیت:** ✅ حل‌شده و تست‌شده در کدهای اجرایی (Web JS، PHP و Android Kotlin)

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
