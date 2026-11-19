# CHART — برنامه مهاجرت قابلیت‌ها و ممیزی مرحله اول مدل‌های پیش‌بینی

- **نسخه:** 1.2.0
- **تاریخ ثبت/بازنگری:** 2026-11-19
- **وضعیت:** قابلیت‌های انتخاب/اجرای مدل‌های Native، Ensemble، Replay و مستندات parity در `main` تجمیع شده‌اند (commit `05933ac39ca440dc1338385b9cf3d6159e20c377`). CI نسخه پیش از تجمیع ۳۳/۳۳ تست و Syntax checks را پاس کرده است. ادغام در Git به‌معنی تأیید Production یا Browser E2E نیست؛ Browser E2E، پذیرش OOS و تصمیم Runtime Chronos-2 همچنان بازند. Legacy حفظ شده است.
- **مخزن/شاخه مرجع:** `manidigit/CHART` / `main` (مرجع یگانه توسعه و انتشار)
- **مرجع محصول:** `FORECAST_PRODUCT_FOUNDATION_V1.md` و `FORECAST_SYSTEM_SPEC_V1.md`
- **هدف:** انتقال تدریجی قابلیت‌های سیستم قدیمی به معماری جدید، با امکان انتخاب مستقل قابلیت‌های منتقل‌شده و خاموش‌کردن کنترل‌شده نسخه قدیمی پس از پذیرش.

---

## 1. تصمیم اجرایی مهاجرت

مهاجرت در پنج حوزه مدیریت می‌شود:

1. **مدل‌های پیش‌بینی:** موتور اجرا، رجیستری، قرارداد خروجی، انتخاب مدل، تنظیمات، مسیرهای پیش‌بینی و اتصال به Renderer جدید.
2. **پلاگین‌ها و منابع داده:** اتصال منابع، دریافت/نرمال‌سازی/اعتبارسنجی داده، تقویم بازار، تایم‌فریم و مدیریت خطا.
3. **مقایسه و ارزیابی:** مقایسه مدل‌ها، ثبت اجراها، بک‌تست، Walk-forward، Replay و سنجش در برابر داده واقعی.
4. **ابزارهای تحلیل و بازنگری:** ساختار بازار، روند، نوسان، نقاط چرخش، ابزارهای تحلیل و گزارش.
5. **تنظیمات و خدمات جانبی:** پروفایل‌ها، تنظیمات، ذخیره/بازیابی، تاریخچه، خروجی‌ها و پاک‌سازی وابستگی‌ها.

ترتیب فوق، ترتیب حوزه‌های کاری است؛ به معنی حذف یا بازنویسی یک‌باره زیرساخت‌های مشترک نیست.

## 2. چرخه اجباری انتقال هر قابلیت

برای هر قابلیت قدیمی:

1. شناسایی دقیق رفتار فعلی، ورودی/خروجی، فایل‌ها، توابع، تنظیمات، ذخیره‌سازی و تمام مصرف‌کنندگان.
2. تعیین مقصد در معماری جدید و تعریف قرارداد سازگاری.
3. انتقال بدون تغییر غیرضروری منطق کسب‌وکار/الگوریتم.
4. آزمون عملکرد، خروجی، تنظیمات، خطاها، کارایی و رفتار رابط کاربری.
5. آزمون عدم اجرای هم‌زمان یا دوباره‌نمایی ناخواسته نسخه قدیمی و جدید.
6. خاموش‌کردن نسخه قدیمی همان قابلیت با Feature Flag یا کنترل برگشت‌پذیر.
7. ثبت شواهد، نسخه، فایل‌ها، تست‌ها و وضعیت استقرار در همین سند و اسناد مرتبط.

**قاعده توقف:** تا وقتی جایگزین جدید از آزمون پذیرش عبور نکرده، قابلیت قدیمی حذف یا غیرفعال نمی‌شود. ابتدا خاموش‌سازی کنترل‌شده و قابل Rollback؛ حذف کد فقط در پاک‌سازی نهایی و پس از اثبات نبود وابستگی.

## 3. اصول غیرقابل‌مذاکره

- سیستم جدید مرجع توسعه قابلیت‌های منتقل‌شده خواهد بود؛ توسعه قابلیت جدید در سیستم قدیمی ممنوع است، مگر رفع وابستگی موقت و مستند.
- هر مدل باید در رابط کاربری به‌صورت مستقل قابل انتخاب باشد. انتخاب یک مدل نباید به‌طور ناخواسته مسیر مدل دیگر را نیز روی نمودار رسم کند.
- مدل انتخاب‌نشده نباید به‌صورت Overlay پنهان/ناخواسته نمایش داده شود؛ مگر کاربر صریحاً حالت مقایسه را فعال کند.
- شناسه مدل، نسخه، پارامترها، وضعیت اجرا، منشأ داده و افق باید قابل ردیابی باشند.
- Renderer فقط نمایش را تعیین می‌کند؛ نباید داده یا مسیر پیش‌بینی را به‌صورت مصنوعی بسازد.
- کیفیت رسم/نمایش و کیفیت آماری پیش‌بینی دو معیار پذیرش مستقل‌اند.
- نبود شواهد کافی باید به وضعیت صریحی مانند `INSUFFICIENT_EVIDENCE` منجر شود؛ نه مسیر ساختگی یا fallback گمراه‌کننده.
- مسیرهای Illustrative مانند medoidهای Historical Analogs نباید به‌عنوان احتمال کالیبره‌شده یا پیش‌بینی قطعی معرفی شوند.
- اجرای خودکار زمان‌بندی‌شده/Cron برای این مهاجرت اضافه نمی‌شود؛ اجرای دستی مطابق تصمیم محصول باقی می‌ماند.

## 4. خط مبنای مخزن در شروع مهاجرت

بررسی ایستای درخت `main` در 2026-11-18 نشان می‌دهد Forecast در یک فایل یا یک Runtime واحد خلاصه نشده است:

| بخش | مسیرهای مشاهده‌شده | وضعیت اولیه |
|---|---|---|
| موتور Forecast وب | `host_subdomain/assets/js/forecast/forecastEngine.js` | موجود؛ شامل Empirical Analog Engine و مسیر مدل‌های رجیستری |
| رجیستری مدل وب | `host_subdomain/assets/js/forecast/modelRegistry.js` | موجود؛ 10 پلاگین Native ثبت‌شده |
| پیاده‌سازی مدل‌های وب | `host_subdomain/assets/js/forecast/models/{baselineModels,statisticalModels,advancedNativeModels}.js` | موجود؛ نیازمند آزمون و تعیین جایگاه نهایی هر مدل |
| قرارداد/ویژگی/ارزیابی وب | `forecastContract.js`, `featureExtractor.js`, `statisticalTests.js`, `walkForwardEvaluator.js`, `forecastV130Analyzer.js` | موجود؛ باید به‌عنوان اجزای مستقل ممیزی شوند |
| مسیر Structural JS | `host_subdomain/assets/js/algorithms/structuralForecastEngine.js` | موتور مجزا با شناسه `structural_wave_js`؛ Historical Analogs را نیز فراخوانی می‌کند |
| اتصال به نمودار وب | `host_subdomain/assets/js/components/chartRenderer.js`, `host_subdomain/assets/js/views/forecastView.js` | هر دو دارای منطق نمایش Forecast هستند؛ خطر هم‌پوشانی/مسیرهای چندگانه باید بررسی شود |
| سرویس/Worker وب | `host_subdomain/assets/js/services/structuralForecastService.js`, `host_subdomain/assets/js/workers/structuralForecastWorker.js`, `forecastWorkerClient.js` | موجود؛ مسیر فراخوانی و نقش عملیاتی باید ردیابی شود |
| سرویس Chronos-2 | `host_subdomain/api/v1/chronos2_forecast.php`, `host_subdomain/scripts/chronos2_worker.py`, `host_subdomain/api/v1/core/Chronos2QueueManager.php` | کد موجود؛ فعال‌بودن و مسیر واقعی مصرف آن هنوز از این ممیزی ایستا اثبات نشده است |
| مدل‌های Python | `python_worker/models/{arima_model,lstm_model,prophet_model,tft_model}.py` | در درخت اصلی موجود؛ اتصال به درخواست زنده/تولید باید اثبات شود |
| نسخه‌های قدیمی آرشیوشده | `archive/app/.../forecast/`, `archive/host_subdomain/.../forecast/`, `archive/python_worker/` | آرشیو؛ نباید با مسیر اجرایی فعلی اشتباه گرفته شوند |
| اسناد مرجع | `docs/01-product/FORECAST_*`, `docs/02-architecture/FORECAST_*` | مرجع نیازمندی/قرارداد؛ ادعاهای اجرایی باید با کد و تست تطبیق داده شوند |

این جدول فقط وجود فایل و ساختار را تأیید می‌کند، نه اجرای زنده، صحت مدل، کیفیت پیش‌بینی یا استقرار Production.

## 5. مرحله اول — مهاجرت مدل‌های پیش‌بینی

### 5.1. فهرست اولیه مدل‌های رجیستری وب

رجیستری `host_subdomain/assets/js/forecast/modelRegistry.js` در خط مبنا این 10 شناسه را ثبت می‌کند:

| شناسه | خانواده/نقش اولیه | تصمیم ممیزی |
|---|---|---|
| `naive_persistence` | Baseline / persistence | مرجع baseline؛ حفظ برای مقایسه، نه لزوماً مدل اصلی |
| `historical_drift` | Baseline / drift | بررسی ارزش افزوده نسبت به baseline |
| `kalman_momentum` | Statistical | بررسی فرمول، فرض‌ها و رفتار در رژیم‌های مختلف |
| `garch_volatility` | Statistical / volatility | بررسی اینکه خروجی آن مسیر قیمت است یا صرفاً اطلاعات نوسان |
| `arima_ets` | Statistical | مقایسه با پیاده‌سازی Native ARIMA |
| `gaussian_process` | Statistical | بررسی هزینه محاسباتی، محدودیت داده و پایداری |
| `native_arima_diff` | Native approximation | ممیزی الگوریتم و تمایز آن از `arima_ets` |
| `native_prophet_decomp` | Native approximation | ممیزی decomposition و ادعای هم‌ارزی با Prophet |
| `native_seq_recurrent_approx` | Approximation / recurrent-like | آزمایشی؛ نباید معادل LSTM واقعی معرفی شود |
| `native_quantile_attention_approx` | Approximation / attention-like | آزمایشی؛ نباید معادل TFT/Transformer واقعی معرفی شود |

این فهرست، فهرست رجیستری وب است؛ به معنی تأیید علمی یا آماده‌بودن همه مدل‌ها نیست. برچسب Approximation باید در UI و مستندات حفظ شود.

### 5.2. Historical Analogs و Structural JS

- `EmpiricalAnalogEngine` در `forecastEngine.js` وجود دارد و مسیرهای کمی/نماینده را از نمونه‌های تاریخی علّی استخراج می‌کند.
- این موتور در فهرست ده پلاگین بالا به‌عنوان یک عضو عادی ثبت نشده است؛ همچنین `structuralForecastEngine.js` آن را برای تولید/افزودن مسیرهای Historical Analog فراخوانی می‌کند.
- شناسه موتور ساختاری `structural_wave_js` است؛ شناسه مسیر مدل Analog برابر `empirical_analogs` است.
- باید رابطه این دو مسیر روشن شود: آیا Structural JS یک مدل مستقل است، یک تحلیل‌گر/مولد ساختار است، یا ظرفی برای چند مسیر خروجی؟ این تصمیم نباید صرفاً از نام فایل استنباط شود.
- هرگونه نمایش مسیر Analog باید با انتخاب کاربر و برچسب Illustrative Only سازگار باشد.

### 5.3. مدل‌ها و Runtimeهای خارج از رجیستری وب

موارد زیر باید جداگانه ردیابی شوند و فعلاً نباید با مدل‌های Native رجیستری یکی فرض شوند:

- Chronos-2 از مسیر API/Queue/Worker پایتون.
- مدل‌های Python موجود در `python_worker/models/`: ARIMA، LSTM، Prophet و TFT.
- مدل‌های Kotlin و PHP موجود در پوشه `archive/`؛ آرشیو بودن مسیر به معنی اجرای Production نیست.
- هر مدل/مسیری که در UI، تنظیمات، API یا اسناد نام برده شده اما در رجیستری فعلی فعال نیست.

### 5.4. ترتیب ممیزی فنی مدل‌ها

1. استخراج کامل فهرست مدل‌ها از کد، UI، تنظیمات، API، Worker و اسناد؛ تطبیق شناسه‌ها و نام‌های نمایشی.
2. تعیین مسیر فراخوانی هر مدل از ورودی کاربر تا خروجی و Renderer.
3. تعیین نوع خروجی ذاتی هر مدل: Close path، quantiles، OHLC واقعی پیش‌بینی‌شده، سناریو یا صرفاً volatility/features.
4. بررسی حداقل داده، تایم‌فریم/افق پشتیبانی‌شده، مدیریت missing data، leakage، هزینه اجرا و وضعیت خطا.
5. بررسی استقلال انتخاب مدل و اطمینان از نمایش فقط مدل منتخب خارج از حالت Compare.
6. اجرای آزمون‌های پذیرش ساختاری و بصری روی دیتاست ثابت و چند رژیم بازار.
7. اجرای Walk-forward/Out-of-sample برای سنجش کیفیت پیش‌بینی؛ بدون استفاده از داده آینده در ورودی.
8. تصمیم برای هر مدل: `KEEP`, `ADAPT`, `REPLACE`, `RETIRE`, یا `INVESTIGATE`.
9. پس از پذیرش جایگزین، خاموش‌سازی برگشت‌پذیر نسخه قدیمی و ثبت شواهد.

### 5.5. معیار پذیرش مدل در سیستم جدید

**الف — صحت اتصال و رفتار**
- مدل از انتخاب‌گر قابل انتخاب باشد و شناسه پایدار داشته باشد.
- پارامترها و تنظیمات مؤثر در نتیجه ثبت شوند.
- وضعیت‌های SUCCESS، INSUFFICIENT، UNSUPPORTED، FAILED و TIMEOUT (در صورت پشتیبانی) شفاف باشند.
- انتخاب/تعویض مدل باعث Overlay ناخواسته، اجرای تکراری یا باقی‌ماندن مسیر قبلی نشود.

**ب — صحت داده و خروجی**
- فقط داده ورودی مجاز تا زمان مبدأ پیش‌بینی استفاده شود.
- زمان‌ها، تایم‌فریم، نماد و آخرین کندل بسته‌شده معتبر باشند.
- خروجی خام مدل از داده مشتق‌شده برای نمایش قابل تفکیک باشد.
- OHLC فقط وقتی کندل پیش‌بینی‌شده تلقی شود که مدل واقعاً آن را تولید کرده و قرارداد/اعتبارسنجی تأیید کند؛ در غیر این صورت Close path یا quantile band نمایش داده شود.
- خروجی نامعتبر یا ناکافی به مسیر مصنوعی تبدیل نشود.

**ج — کیفیت پیش‌بینی**
- ارزیابی Walk-forward و OOS با معیارهای از پیش تعیین‌شده.
- baselineهای ساده برای مقایسه.
- نتایج تفکیک‌شده برحسب نماد، تایم‌فریم، افق و رژیم بازار.
- گزارش عدم‌قطعیت و محدودیت نمونه؛ عدم استفاده از یک امتیاز کلی گمراه‌کننده.
- نمایش زیبا یا عبور تست رندر به‌تنهایی معیار کیفیت پیش‌بینی نیست.

### 5.6. وضعیت کار در زمان ثبت این نسخه

| کار | وضعیت |
|---|---|
| شناسایی مسیرهای اصلی Forecast در درخت مخزن | انجام‌شده، ایستا |
| استخراج 10 شناسه رجیستری وب | انجام‌شده |
| شناسایی Structural JS و اتصال داخلی Historical Analogs | انجام‌شده، ایستا |
| شناسایی Chronos-2 و Python worker files | انجام‌شده، وجود فایل |
| اثبات مسیر اجرایی زنده هر مدل | باز |
| ممیزی جزئیات همه الگوریتم‌ها و پارامترها | باز |
| ممیزی انتخاب‌گر مدل و تنظیمات UI | باز |
| ماتریس وابستگی مدل‌های قدیمی/جدید | باز |
| آزمون‌های پذیرش و Walk-forward مدل‌به‌مدل | باز |
| غیرفعال‌سازی هر مسیر قدیمی | انجام نشده؛ تا عبور از Gate ممنوع |

## 6. Gateهای مهاجرت

- **M1 — Inventory Complete:** تمام مدل‌ها، شناسه‌ها، نسخه‌ها، مسیرهای فراخوانی و مصرف‌کنندگان شناسایی شده‌اند.
- **M2 — Contract & Data:** قرارداد و داده ورودی/خروجی هر مدل مستند و اعتبارسنجی شده‌اند.
- **M3 — UI & Renderer:** انتخاب مستقل، نمایش صحیح و نبود Overlay ناخواسته تست شده است.
- **M4 — Predictive Evaluation:** ارزیابی OOS/Walk-forward و baselineها انجام شده و محدودیت‌ها گزارش شده‌اند.
- **M5 — Legacy Disable:** نسخه قدیمی فقط پس از عبور از M1 تا M4 و با امکان Rollback خاموش می‌شود.
- **M6 — Cleanup:** حذف کد قدیمی فقط پس از دوره اطمینان، جست‌وجوی وابستگی و تأیید عدم مصرف.

هیچ مدل یا قابلیت بدون شواهد Gate مربوطه «مهاجرت‌شده» اعلام نمی‌شود.

## 7. وضعیت حوزه‌های مهاجرت پس از اجرای New Native — 2026-11-19

- **مرحله 2 — پلاگین‌ها و منابع داده (PARTIAL / POLICY_FIXED):** مرز Forecast در Store، تب‌های قدیمی و API به TradingView (tvdatafeed) محدود شده است؛ سایر Providerهای قیمت/کندل غیرفعال می‌مانند. منبع دیگری برای Forecast اضافه نمی‌شود. تست Provider guard و Hydration در CI پاس است؛ HTTP integration در محیط مقصد همچنان در FCST-API-01 باز است.
- **مرحله 3 — مقایسه و ارزیابی (PARTIAL / NEW_NATIVE_CONNECTED):** ۱۰ مدل Native، Adapter، OOS per-model، پنل Walk-Forward و Ledger محلی به New متصل‌اند. تنظیمات فعال‌سازی/وزن/پارامتر مدل‌ها نیز در New قابل استفاده است. مقایسه بصری صریح چندمدلی، Historical Replay، پذیرش OOS واقعی به‌ازای نماد/تایم‌فریم و Ledger server sync هنوز منتقل/تأیید نشده‌اند.
- **مرحله 4 — تحلیل و بازنگری (PARTIAL / STRUCTURAL_JS):** Structural JS و Historical Analogs در New قابل انتخاب و اجرای on-demand هستند و Renderer خروجی ساختاری/مسیر را جدا از مدل‌های Native نگه می‌دارد. ابزارهای مشترک چارت/اندیکاتورها در Workspace اصلی reuse می‌شوند؛ مقایسه سناریوها و Replay مستقل باز است.
- **مرحله 5 — تنظیمات و خدمات جانبی (PARTIAL / SHARED_PREFERENCES):** انتخاب مدل در سطح تب و پیکربندی پلاگین‌ها از Preferences ذخیره می‌شود؛ پنل تنظیمات مدل‌ها به New Native منتقل شده است. تنظیم URL Worker Python عمداً در New عرضه نمی‌شود؛ همگام‌سازی ابری Ledger و provenance کامل Snapshot باز هستند.

این وضعیت عمداً «مهاجرت کامل محصول» نامیده نمی‌شود؛ موارد باز و Gateهای توقف در OPEN_ISSUES.md بخش ۵ نگهداری می‌شوند.

## 8. راهنمای ادامه کار برای AIها و توسعه‌دهندگان

پیش از هر تغییر کد:
1. این سند را بخوانید.
2. `FORECAST_PRODUCT_FOUNDATION_V1.md`، `FORECAST_SYSTEM_SPEC_V1.md` و `FORECAST_ACCEPTANCE_TEST_PLAN_V1.md` را بخوانید.
3. وضعیت واقعی فایل‌ها را در شاخه `main` بررسی کنید؛ به گزارش‌های قدیمی یا نام فایل به‌تنهایی اعتماد نکنید.
4. فرق `archive/` با مسیرهای اجرایی خارج از آرشیو را رعایت کنید.
5. وضعیت CI، تست، deploy و اجرای Production را جداگانه گزارش کنید.
6. بدون شواهد آزمون، هیچ مدل را migrated، accurate، production-ready یا legacy-disabled اعلام نکنید.

---

## 9. ثبت تغییرات

### 2026-11-18 — v1.0.0
- برنامه مهاجرت پنج‌حوزه‌ای ثبت شد.
- چرخه اجباری انتقال، Feature Flag و Rollback تعریف شد.
- خط مبنای اولیه Forecast در مخزن استخراج شد.
- ده شناسه رجیستری Native وب، مسیر Structural JS، Historical Analogs، Chronos-2، Python worker و کدهای آرشیوشده فهرست شدند.
- هیچ منطق اجرایی یا مدل قدیمی در این ثبت تغییر یا غیرفعال نشد.


## 10. ممیزی تکمیلی اتصال UI و Renderer — 2026-11-18

بررسی مستقیم بخش‌های اجرایی `app.js`، `forecastView.js`، `chartRenderer.js` و `structuralForecastService.js` چند نکته تعیین‌کننده را روشن کرد:

### 10.1. دو تجربه Forecast هنوز کنار هم فعال‌اند

- `renderForecastWorkspaceContent()` در `app.js` بین دو حالت `legacy` و `structural` سوییچ می‌کند.
- حالت Legacy، `renderForecastStudioView()` را اجرا می‌کند؛ این View به `ForecastEngine.project()`، رجیستری ده‌مدلی، تنظیمات پلاگین‌ها، Walk-forward، Ledger و Worker اختیاری متصل است.
- حالت Structural، موتور `requestStructuralForecastForTab()` را روی درخواست صریح کاربر اجرا می‌کند و نتیجه را روی چارت اصلی نمایش می‌دهد.
- بنابراین در وضعیت فعلی، «سیستم جدید» هنوز تمام قابلیت‌های Forecast Studio را جذب نکرده است؛ وجود ده مدل در رجیستری Legacy به معنی قابل‌انتخاب‌بودن آن‌ها در رابط Structural نیست.

### 10.2. انتخاب‌گر Structural فعلی فقط دو گزینه دارد

در UI فعلی Structural، گزینه‌های قابل انتخاب عبارت‌اند از:
- `structural_wave_js`
- `empirical_analogs`

در مقابل، Legacy Forecast Studio انتخاب‌گر مستقل دیگری دارد که شامل مدل‌های Native منتخب، Auto/OOS، Ensemble و مسیرهای Python در صورت دریافت خروجی Worker است. این دو انتخاب‌گر و دو قرارداد خروجی هنوز یکپارچه نشده‌اند.

### 10.3. Renderer مسیرهای جداگانه را تشخیص می‌دهد

در `chartRenderer.js` دست‌کم سه مسیر مستقل دیده می‌شود:
- `structuralForecast` با انتخاب بین Structural JS و Historical Analogs؛
- `chronosForecast` با شرطی که در صورت فعال‌بودن Structural، نمایش Chronos را کنار می‌گذارد؛
- `legacyForecast` با شرط‌های جداگانه برای `showFutureProjection` و تطبیق نماد/منبع/تایم‌فریم/آخرین کندل.

در نتیجه، خاموش‌سازی Legacy صرفاً تغییر یک دکمه نیست؛ باید تمام مسیرهای state، render، cache، snapshot، evaluation و کنترل‌های UI بررسی شوند تا قابلیت جانبی از دست نرود.

### 10.4. Structural JS و Historical Analogs هم‌ارز مفهومی نیستند

- `structural_wave_js` مسیر اصلی تحلیل ساختاری است و خروجی آن شامل مسیر مرکزی، نقاط چرخش و اطلاعات ساختار/نوسان است.
- `empirical_analogs` مسیر Close-based برگرفته از نمونه‌های تاریخی است و در خروجی فعلی فقط یک مسیر representative از نوع Illustrative Only به `model_paths` اضافه می‌کند.
- این دو را نباید بدون Adapter و قرارداد مشترک، صرفاً به‌عنوان دو پلاگین هم‌شکل فرض کرد.

### 10.5. نتیجه و تصمیم مرحله اول

**اولویت فنی مرحله اول، ساخت یک Model Selection/Execution/Render seam واحد است؛ نه کپی‌کردن همه الگوریتم‌ها در Structural JS.**

مسیر پیشنهادی:
1. قرارداد مشترک مدل و capabilityها را از شکل خروجی ذاتی هر مدل جدا کنیم.
2. Adapter برای خروجی‌های Legacy بسازیم تا هر مدل، مسیر خام خود را حفظ کند و فقط به نمایش قابل‌پشتیبانی تبدیل شود.
3. Renderer جدید باید بر اساس شناسه مدل منتخب، فقط همان مسیر را نمایش دهد؛ حالت Compare باید انتخابی و صریح باشد.
4. ابتدا یک مدل ساده و قابل‌مقایسه به‌عنوان پایلوت منتقل شود؛ پیشنهاد اولیه `naive_persistence` برای baseline اتصال است، نه به‌عنوان مدل نهایی یا پیش‌بینی باکیفیت.
5. پس از اثبات مسیر انتخاب/اجرا/رسم و تست، مدل بعدی منتقل شود. الگوریتم‌ها در این مرحله بازنویسی یا با هم ادغام نشوند.
6. Historical Analogs و Structural JS به‌عنوان دو نوع خروجی متفاوت، در قرارداد capability-aware باقی بمانند.

**ریسک باز:** کاربر در تجربه جدید حداقل چهار مدل قابل رسم را مشاهده کرده است، اما وضعیت کد فعلی که در این ممیزی خوانده شد فقط دو گزینه Structural را در انتخاب‌گر Structural نشان می‌دهد. باید تفاوت نسخه مستقر با شاخه فعلی و مسیر دقیق آن چهار مدل پیش از هر تغییر کد تطبیق داده شود؛ این سند ادعای برابری وضعیت سایت Production با فایل‌های فعلی `main` را نمی‌کند.

### 10.6. مواردی که هنوز قبل از کدنویسی پایلوت باید بسته شوند

- تعیین منبع حقیقت state برای مدل منتخب: per-tab یا global preference، و قواعد اولویت آن.
- تعیین اینکه Legacy Forecast Studio تا پایان انتقال صرفاً قابل دسترس باقی بماند یا از مسیر عادی UI پنهان شود؛ تا پیش از انتقال کامل نباید حذف شود.
- تعیین قرارداد خروجی مشترک شامل Close path، quantiles، OHLC واقعی، scenarios و metadata.
- تعیین دقیق مدل‌های چهارگانه‌ای که کاربر در نسخه جدید دیده است و تطبیق آن‌ها با شناسه‌های موجود.
- افزودن تست رگرسیون برای عدم نمایش هم‌زمان Legacy/Structural/Chronos مگر در حالت Compare صریح.


## 11. ممیزی مسیر انتخاب و رسم مدل‌ها — 2026-11-18 (بازبینی دوم)

این بخش نتیجه ردیابی توابع واقعی از UI تا چارت است و جایگزین فرض‌های اولیه درباره «انتقال چهار مدل» می‌شود.

### 11.1. مسیر واقعی Legacy Forecast تا چارت

1. `renderForecastStudioView()` در `forecastView.js` تابع `buildForecastForTab(activeTab)` را فراخوانی می‌کند.
2. `buildForecastForTab()` از `ForecastEngine.project()` استفاده می‌کند و `selectedForecastModelId` را از state تب/تنظیمات می‌خواند.
3. `ForecastEngine.project()` برای مدل‌های فعال `modelTrajectories[]` می‌سازد؛ هر trajectory شامل `modelId`، وضعیت، metadata و نقاط کوانتایلی q10..q90 است.
4. `selectOosChartWinner()` مدل منتخب را با توجه به درخواست کاربر و وضعیت ارزیابی OOS تعیین می‌کند؛ `selectedChartModelId` و `points` نهایی در نتیجه ثبت می‌شوند.
5. `renderForecastStudioView()` نتیجه را در `activeTab.legacyForecast` و مشخصات نماد/منبع/تایم‌فریم/آخرین کندل را در `legacyForecastMeta` قرار می‌دهد.
6. دکمه `apply-forecast-to-chart` فقط نمایش همان نتیجه را فعال می‌کند و مسیرهای Structural و Chronos را خاموش می‌کند.
7. `chartRenderer.js` مسیر `legacyForecast` را فقط در صورت تطبیق metadata و وضعیت `VALID` یا `PROVISIONAL` می‌پذیرد و q10/q50/q90 را برای مقیاس و رسم به کار می‌برد.

پس Legacy Forecast صرفاً یک صفحه قدیمی نیست؛ از طریق `chartRenderer.js` همین نمودار اصلی را تغذیه می‌کند. مهاجرت درست باید این pipeline را به مدل/Renderer مقصد منتقل کند، نه اینکه تنها UI را جابه‌جا کند.

### 11.2. آنچه واقعاً در انتخاب‌گر مدل قابل انتخاب است

انتخاب‌گر دستی فعلی در `forecastView.js` این شناسه‌ها را دارد:
- `AUTO`
- `native_arima_diff`
- `native_prophet_decomp`
- `native_seq_recurrent_approx`
- `native_quantile_attention_approx`
- `empirical_analogs`
- `naive_persistence`
- `ensemble`
- به‌علاوه مدل‌های `py_*` که واقعاً در خروجی Worker دریافت شوند.

بنابراین وجود ده پلاگین در رجیستری به معنی وجود ده انتخاب دستی در UI نیست. شناسه‌های `historical_drift`، `kalman_momentum`، `garch_volatility`، `arima_ets` و `gaussian_process` در فهرست انتخاب دستی فعلی دیده نمی‌شوند؛ ممکن است در محاسبه/مقایسه/وزن‌دهی حضور داشته باشند، اما مسیر انتخاب مستقیم آن‌ها باید جداگانه تصمیم‌گیری شود.

### 11.3. تفاوت مهم وضعیت پیش‌بینی و قابلیت رسم

- Forecast Engine می‌تواند `INSUFFICIENT_EVIDENCE` برگرداند، در حالی که داده‌های مدل/trajectory ممکن است وجود داشته باشند.
- Renderer مسیر Legacy در حال حاضر فقط `VALID` و `PROVISIONAL` را برای رسم می‌پذیرد.
- این رفتار باید در طراحی قرارداد جدید آگاهانه حفظ یا بازتعریف شود؛ نباید صرف وجود نقاط، وضعیت ناکافی را به پیش‌بینی معتبر تبدیل کنیم.
- در Structural JS نیز `model_paths` و `forecast` دو سطح خروجی متفاوت‌اند. مسیر Historical Analogs فقط در حالت انتخاب آن مدل رسم می‌شود و به OHLC ساختگی تبدیل نمی‌شود.

### 11.4. تصمیم اجرایی پایلوت — پیش از گسترش به همه مدل‌ها

**پایلوت انتقال باید ابتدا روی مسیر `naive_persistence` انجام شود، اما الگوریتم آن بازنویسی نشود.**

دامنه پایلوت:
1. استفاده از خروجی واقعی `modelTrajectories.find(modelId === 'naive_persistence')` در Forecast Engine موجود.
2. ساخت Adapter مستقل که metadata سری، زمان‌های آینده، نقاط q10/q25/q50/q75/q90، وضعیت اجرا، شناسه و نسخه مدل را به قرارداد مقصد نگاشت کند.
3. اتصال Adapter به انتخاب‌گر سیستم جدید به‌صورت گزینه مستقل و ذخیره انتخاب در سطح تب؛ بدون تغییر انتخاب‌گر Legacy.
4. نمایش فقط مدل منتخب؛ خاموش‌بودن مدل‌های دیگر به‌صورت پیش‌فرض و Compare فقط با اقدام صریح کاربر.
5. عدم ساخت OHLC مصنوعی؛ خروجی پایلوت به‌صورت مسیر میانی و باند کوانتایلی نمایش داده شود.
6. حفظ کنترل تطبیق نماد، منبع داده، تایم‌فریم، آخرین کندل بسته و invalidation؛ خروجی stale نباید رسم شود.
7. تست‌های واحد برای Adapter، تست integration برای تغییر مدل/تب/سری، و تست Canvas برای عدم overlay ناخواسته.
8. اجرای Walk-forward/OOS موجود برای بررسی کیفیت مدل؛ تست رندر فقط کیفیت نمایش را پوشش می‌دهد.

### 11.5. Gate قبل از پیاده‌سازی پایلوت

- باید قرارداد schema فعلی Structural و تابع `isStructuralForecastMatchingTab()` به‌طور کامل بررسی شوند.
- باید روشن شود آیا مقصد درست، توسعه قرارداد Structural است یا یک قرارداد عمومی `forecastModelResult` که Structural، Chronos و Native Statistical را به‌عنوان capabilityهای متفاوت پشتیبانی کند.
- مسیر state تب و ذخیره‌سازی آن باید با `saveOpenTabs()` و `chartPreferences` سازگار باشد.
- تست موجود `tests/web_parity.test.mjs` باید توسعه یابد تا انتخاب مدل، سری/تب و عدم نمایش هم‌زمان را پوشش دهد.
- تا پیش از عبور این Gate، هیچ کد Legacy حذف/غیرفعال نشود.

### 11.6. وضعیت ممیزی دوم

| مورد | نتیجه |
|---|---|
| زنجیره Forecast Studio → ForecastEngine → modelTrajectories → legacyForecast → chartRenderer | ردیابی شد |
| مسیر ذخیره metadata برای تطبیق سری | ردیابی شد |
| رفتار دکمه Apply روی چارت | ردیابی شد |
| شناسه‌های قابل انتخاب دستی در UI | استخراج شد |
| تفاوت status پیش‌بینی با مجازبودن رسم | شناسایی شد |
| مقصد دقیق Adapter و قرارداد نهایی | نیازمند بررسی schema و تست |
| پیاده‌سازی پایلوت | هنوز انجام نشده |
| خاموش‌سازی مدل/مسیر قدیمی | انجام نشده |



## 12. اجرای پایلوت Native Model Adapter — 2026-11-18

### 12.1. دامنه پیاده‌سازی‌شده

پایلوت naive_persistence بدون بازنویسی الگوریتم موجود به مسیر انتخاب و رسم موتور جدید متصل شد:

- تابع adaptNativeModelTrajectory() در forecastContract.js فقط trajectory موفق و کامل را می‌پذیرد؛ تعداد نقاط باید دقیقاً برابر افق باشد و کوانتایل‌ها باید finite، مثبت و مرتب باشند.
- Adapter خروجی واقعی ForecastEngine.modelTrajectories را به envelope صریح native_model_adapter نگاشت می‌کند؛ q10/q25/q50/q75/q90 و metadata مدل حفظ می‌شوند.
- وضعیت ارزیابی اصلی در provenance.status و model.forecast_status حفظ می‌شود. READY در envelope فقط به معنی قابل‌رسم‌بودن payload است، نه تأیید کیفیت پیش‌بینی.
- انتخاب‌گر موتور Structural اکنون Structural JS، Historical Analogs، Ensemble و هر 10 مدل رجیستری وب را نمایش می‌دهد. مدل‌های غیرفعال/با وزن صفر غیرقابل انتخاب‌اند و مدل‌های Approximation با برچسب جدا مشخص می‌شوند. همه مدل‌های رجیستری از همان ForecastEngine موجود و Adapter مشترک اجرا می‌شوند.
- تغییر افق در حالت پایلوت از Adapter عبور می‌کند و افق‌های بالاتر از 60 برای این مدل نمایش داده نمی‌شوند؛ سقف ForecastEngine رعایت می‌شود.
- فقط مسیر مدل منتخب روی نمودار رسم می‌شود؛ مسیرهای Legacy و Chronos هم‌زمان فعال نمی‌شوند.
- رسم فقط مسیر میانی و باند q25–q75 است؛ هیچ OHLC مصنوعی تولید نمی‌شود.
- انتخاب مدل Structural و مدل Forecast Studio در ذخیره‌سازی تب نگهداری می‌شوند.
- اعتبارسنجی payload، تطبیق نماد/منبع/تایم‌فریم/آخرین کندل بسته/افق/شناسه مدل را بررسی می‌کند؛ خروجی stale پذیرفته نمی‌شود.
- برچسب نمودار، مسیر Native را به‌عنوان render only و وضعیت واقعی ارزیابی Forecast Engine را نمایش می‌دهد.

### 12.2. فایل‌های تغییرکرده

- host_subdomain/assets/js/forecast/forecastContract.js
- host_subdomain/assets/js/core/store.js
- host_subdomain/assets/js/views/forecastView.js
- host_subdomain/assets/js/components/chartRenderer.js
- host_subdomain/assets/js/app.js
- tests/web_parity.test.mjs

### 12.3. شواهد آزمون و انتشار

- Web Parity / Architecture Tests: 16 از 16 موفق در اجرای GitHub Actions مربوط به Commit 486a53206b4d958087e2f13eb61dfab6e798d8c4.
- PHP syntax checks مربوط به Chronos-2: موفق.
- Web package artifact: ساخته و بارگذاری شد.
- Android Debug APK artifact: ساخته و بارگذاری شد؛ Build و Unit/Robolectric Tests موفق.
- cPanel deployment: پاسخ ok=true؛ تعداد 123 فایل منتشر شد؛ snapshot با شناسه snapshot_20261118_230019 ثبت شد.
- Seed داده‌های tvdatafeed در همان اجرای deploy: تعداد 42,294 کندل.
- Build و Android Unit/Robolectric Tests نیز در Workflow `44416660390` موفق شدند و APK artifact بارگذاری شد.
- Deploy فوق مربوط به نسخه‌ای است که پایلوت Native را در UI موتور Structural در دسترس قرار می‌دهد؛ تأیید اجرای واقعی روی مرورگر کاربر همچنان نیازمند بازکردن سایت و آزمون دستی انتخاب/اجرا/تغییر افق/تعویض تب است.

### 12.4. محدودیت و مرز پذیرش

این پایلوت، اثبات مسیر انتخاب → اجرای مدل موجود → Adapter → Renderer است؛ مهاجرت کامل تمام مدل‌های رجیستری محسوب نمی‌شود. قرارداد native_model_adapter در این مرحله از envelope سازگار با Structural renderer استفاده می‌کند و هنوز قرارداد عمومی نهایی برای تمام capabilityهای مدل‌ها نیست.

Legacy Forecast Studio، موتور Structural JS و Historical Analogs حذف یا خاموش نشده‌اند. هیچ ادعایی درباره افزایش دقت پیش‌بینی مطرح نیست. پذیرش کیفیت مدل همچنان باید با Walk-forward/OOS مستقل انجام شود.

### 12.5. وضعیت پایلوت

| Gate | وضعیت |
|---|---|
| Adapter عمومی برای trajectory مدل‌های رجیستری Native | انجام شد؛ Naive Persistence پایلوت اولیه بود |
| انتخاب‌گر مستقل 10 مدل رجیستری + Ensemble + Structural JS + Historical Analogs | انجام شد |
| اجرای دستی و تغییر افق | پیاده‌سازی شد |
| جلوگیری از overlay موازی | حفظ شد |
| تطبیق سری و invalidation | پیاده‌سازی شد |
| ذخیره انتخاب مدل در سطح تب | انجام شد |
| تست وب | 16/16 موفق |
| انتشار Web روی cPanel | تأیید شد |
| Build و Android Unit/Robolectric Tests | موفق در Workflow 44416660390 |
| تست دستی روی مرورگر Production | نیازمند تأیید کاربر |
| OOS per-model diagnostics | متصل به Adapter؛ status هر مدل مستقل نمایش داده می‌شود |

## 12.6. گسترش انتخاب‌گر به کل رجیستری و اتصال OOS per-model — 2026-11-18

پس از موفقیت پایلوت، مسیر انتخاب/اجرا به تمام 10 مدل رجیستری Native وب گسترش یافت:

- naive_persistence
- historical_drift
- kalman_momentum
- garch_volatility
- arima_ets
- gaussian_process
- native_arima_diff
- native_prophet_decomp
- native_seq_recurrent_approx
- native_quantile_attention_approx

به‌علاوه Ensemble، Structural JS و Historical Analogs در همان انتخاب‌گر قابل انتخاب‌اند. مدل‌های Native با وضعیت enabled=false یا weight=0 در UI غیرفعال نمایش داده می‌شوند. برچسب Approximation برای مدل‌های تقریبی حفظ شده است.

### 12.6.1. اتصال تشخیصی OOS برای هر مدل

Adapter اکنون از walkForward همان اجرای ForecastEngine، معیارهای مستقل مدل منتخب را استخراج و در model.oos نگهداری می‌کند:

- eval_horizon، windows، n_eff
- r_mae، WIS مدل و WIS baseline
- coverage_80_pct
- DM p-value و bootstrap p-value
- conformal calibration status

وضعیت OOS هر مدل مستقل از status کلی Forecast Engine محاسبه می‌شود:

| OOS status | معنا |
|---|---|
| BASELINE | مدل Naive Persistence؛ مرجع مقایسه، نه برنده |
| PASSED | تمام گیت‌های OOS مدل شامل حداقل نمونه، n_eff، rMAE، WIS، coverage، DM و bootstrap پاس شده‌اند |
| NO_EDGE | داده OOS کافی است، اما یک یا چند معیار پذیرش مدل رد شده است |
| INSUFFICIENT_EVIDENCE | تعداد پنجره/نمونه مؤثر یا conformal calibration کافی نیست |
| EXPERIMENTAL_NOT_ELIGIBLE | مدل Approximation/Experimental؛ از پذیرش مدل‌های production خارج است |

Chart badge وضعیت OOS مدل را جدا از وضعیت کلی Forecast Engine نشان می‌دهد. نمایش مسیر یا READY بودن envelope به‌هیچ‌وجه معادل PASSED بودن OOS نیست.

### 12.6.2. نسخه‌های cache-busting

- app entry: 1.47.16
- shared store singleton: 1.47.12 در تمام 9 ماژول مصرف‌کننده
- chartRenderer: 1.47.10
- forecastContract adapter: 2.0.3

تست ARCH-01 برای همسانی نسخه store به 1.47.12 به‌روزرسانی شد تا نسخه‌های قدیمی cache باعث چند singleton مستقل نشوند.

Chronos-2 و مدل‌های Python/FastAPI خارج از رجیستری Native وب، در این گام وارد انتخاب‌گر Native نشده‌اند؛ مسیرهای موجودشان حفظ شده و باید در ممیزی Runtimeهای خارجی جداگانه بررسی شوند. بنابراین پذیرش این بخش به معنی حذف یا مهاجرت کامل همه Runtimeهای Forecast نیست.


## 13. کنترل پذیرش سراسری و شفافیت قابلیت‌ها — تصمیم 2026-11-19

### 13.1. تصمیم محصول

تا پایان مهاجرت همه حوزه‌ها، New نباید تصویری ناقص اما ظاهراً کامل از محصول ارائه کند. کاربر نباید از نبود یک گزینه نتیجه بگیرد که قابلیت حذف شده، یا از وجود یک دکمه نتیجه بگیرد که قابلیت واقعاً منتقل و عملیاتی است.

از این تاریخ، هر قابلیت باید در Inventory واحد مهاجرت دارای شناسه، منبع Legacy، مقصد New، وضعیت انتقال، وابستگی‌ها، تست پذیرش و وضعیت انتشار باشد. وضعیت‌های مجاز:

- **MIGRATED_VERIFIED** — انتقال کامل، تست‌های لازم موفق و در New قابل استفاده است.
- **MIGRATED_UNVERIFIED** — کد مقصد وجود دارد، اما یک یا چند gate آزمون/انتشار/رفتار واقعی باز است.
- **IN_PROGRESS** — انتقال شروع شده اما هنوز کامل نیست.
- **NOT_MIGRATED** — در New پیاده‌سازی نشده؛ در New باید به‌صورت Disabled با توضیح «هنوز منتقل نشده» دیده شود.
- **NOT_APPLICABLE** — با دلیل مستند، خارج از محصول/دامنه جدید است.
- **RETIRED_APPROVED** — فقط با تصمیم صریح محصول و پس از ثبت جایگزین/مهاجرت داده؛ حذف خودکار ممنوع.

Disabled کردن یک قابلیت در New به معنی خاموش‌کردن Legacy نیست. Legacy تا عبور همه gateهای مهاجرت و پذیرش نهایی حفظ می‌شود. هیچ قابلیت Legacy صرفاً برای ساده‌کردن مقایسه حذف یا غیرفعال نمی‌شود.

### 13.2. قاعده نمایش در رابط کاربری

1. New فقط قابلیت‌های `MIGRATED_VERIFIED` را به‌عنوان گزینه عملیاتی فعال عرضه می‌کند.
2. قابلیت‌های `MIGRATED_UNVERIFIED` و `IN_PROGRESS` با برچسب وضعیت و بدون ادعای آماده‌بودن نمایش داده می‌شوند؛ فعال‌بودن آن‌ها فقط برای آزمایش کنترل‌شده مجاز است.
3. قابلیت‌های `NOT_MIGRATED` در فهرست قابلیت‌ها به‌صورت Disabled و با نام مقصد/وضعیت نمایش داده می‌شوند؛ دکمه‌ای که به مسیر اجرایی ناقص وصل است نباید فعال بماند.
4. گزینه‌های مقایسه فقط مدل‌ها/ابزارهایی را اجرا می‌کنند که قرارداد ورودی/خروجی و رفتار رسم آن‌ها تأیید شده است. Compare نباید overlay ناخواسته یا ادغام معنایی خروجی‌های متفاوت ایجاد کند.
5. رابط باید همواره امکان بازگشت به Legacy را حفظ کند تا پایان مهاجرت.
6. هر صفحه New باید خلاصه تعداد قابلیت‌های منتقل‌شده، در حال انتقال و منتقل‌نشده را از Inventory همان نسخه نشان دهد؛ شمارنده‌ها نباید hardcode شوند.

### 13.3. وضعیت اولیه بر اساس شواهد کد موجود

| حوزه | آنچه فعلاً در کد/سند قابل اثبات است | وضعیت مهاجرت |
|---|---|---|
| Forecast Native Web Registry | Adapter و انتخاب‌گر برای 10 شناسه رجیستری Native در Structural اضافه شده؛ وجود در UI به‌تنهایی اثبات کیفیت مدل نیست | `MIGRATED_UNVERIFIED` تا تکمیل gateهای رفتاری/Production |
| Structural JS | موتور مستقل و مسیر رسم Structural موجود است | `MIGRATED_UNVERIFIED`؛ پذیرش نهایی renderer و lifecycle لازم است |
| Empirical Analogs | موتور در Structural engine اجرا می‌شود و مسیر `empirical_analogs` تولید می‌کند؛ UI New دکمه Historical Analogs دارد؛ مسیر illustrative-only است | `MIGRATED_UNVERIFIED`؛ باید visibility در Production، انتخاب، اجرا، matched-count و رسم مستقل تأیید شود |
| Ensemble | دکمه Calibrated Ensemble در UI وجود دارد؛ وجود دکمه، اثبات اجرای ensemble کالیبره‌شده نیست | `IN_PROGRESS` تا اثبات الگوریتم، calibration و مسیر اجرا |
| Chronos-2 | مسیر مستقل PHP/Python و UI/Renderer Legacy موجود است؛ در فهرست Native Structural registry نیست | `NOT_MIGRATED` به New؛ Legacy حفظ شود |
| Python/FastAPI models (ARIMA/Prophet/LSTM/TFT و غیره) | Worker و خروجی‌های Python در مسیر Legacy وجود دارند؛ حضور trajectoryهای remote در UI Legacy به دریافت خروجی وابسته است | `NOT_MIGRATED` به New تا ساخت adapter و آزمون مستقل |
| Forecast Studio: Backtest, Walk-forward, Ledger, snapshots, coordination | بخش‌هایی از UI و منطق در Legacy موجودند؛ انتقال کامل آن‌ها به New در این گام اثبات نشده | `NOT_MIGRATED` به New؛ هر بخش باید جداگانه inventory شود |
| سایر چهار حوزه مهاجرت (منابع داده/پلاگین‌ها، مقایسه و replay، ابزارهای تحلیل، تنظیمات و خدمات) | ممیزی کامل end-to-end و ماتریس قابلیت به قابلیت هنوز ثبت نشده | `NOT_MIGRATED` تا انجام inventory؛ هیچ ادعای انتقال مجاز نیست |

این جدول baseline اولیه است، نه ادعای تکمیل ممیزی همه فایل‌ها. در گام بعدی باید هر ردیف به قابلیت‌های اتمی شکسته شود و ارجاع فایل/تابع/تست برای هر وضعیت ثبت شود.

### 13.4. مورد خاص Empirical Analogs و علت اختلاف مشاهده

در شاخه `main`، `app.js` دکمه `Historical Analogs` را در صفحه New Structural تعریف می‌کند. `structuralForecastEngine.js` نیز `EmpiricalAnalogEngine` را فراخوانی و مسیر representative را در `model_paths` برمی‌گرداند؛ `chartRenderer.js` مسیر انتخاب‌شده را جداگانه رسم می‌کند. در عین حال، انتخاب‌گر Legacy Forecast Studio و انتخاب‌گر New Structural دو رابط مستقل‌اند و صفحه Forecast بر اساس `forecastEngineMode` فقط یکی را نشان می‌دهد. بنابراین:
- دیده‌نشدن گزینه در صفحه Legacy به معنی نبود آن در New نیست.
- دیده‌نشدن آن در New Production با وجود کد در `main` یک اختلاف نسخه/انتشار یا رفتار UI است که باید با build و deploy commit دقیق تطبیق داده شود.
- تا وقتی این اختلاف روی نسخه Production رفع و آزمون نشود، Historical Analogs نباید `MIGRATED_VERIFIED` اعلام شود.
- مسیر آن illustrative-only است و نباید به‌عنوان احتمال یا پیش‌بینی کالیبره‌شده معرفی شود.

### 13.5. Gate نهایی برای اعلام «مهاجرت کامل»

اعلام تکمیل فقط وقتی مجاز است که:
- Inventory پنج حوزه کامل و بدون قابلیت Legacy بی‌صاحب باشد.
- تمام قابلیت‌های باقی‌مانده در New یا منتقل و تأیید شده باشند یا Disabled/Not Applicable با دلیل روشن داشته باشند.
- انتخاب، اجرا، ذخیره‌سازی، تغییر تب/نماد/تایم‌فریم، invalidation، خطا، refresh و بازگشت به Legacy برای هر قابلیت مرتبط تست شود.
- عدم هم‌پوشانی Renderer و سازگاری داده/قرارداد بین Web، Android، PHP و Python بررسی شود.
- CI، build، deploy و آزمون مرورگر Production جداگانه ثبت شوند.
- مقایسه کاربر فقط پس از انتشار نسخه‌ای با Inventory قابل مشاهده و کامل درخواست شود.

تا قبل از عبور از این gate، وضعیت کل مهاجرت **IN_PROGRESS** باقی می‌ماند و هیچ بخش ناقصی به‌عنوان «تمام‌شده» گزارش نمی‌شود.


## 14. شروع ممیزی حوزه دوم: منابع داده و Providerها — 2026-11-19

### 14.1. یافته قطعی از Web Store

در `host_subdomain/assets/js/core/store.js`، کاتالوگ `PROVIDER_METHODS_CATALOG` هفت شناسه دارد:

| Provider ID | وضعیت کاتالوگ | وضعیت پذیرش در `isProviderEnabled()` | مقصد New |
|---|---:|---:|---|
| `tvdatafeed` | enabled=true | فعال | باید به‌عنوان منبع فعلی New حفظ شود؛ هنوز قرارداد Provider مستقل در New اثبات نشده |
| `biquote` | enabled=false | غیرفعال | منتقل‌نشده/غیرفعال |
| `twelve_data` | enabled=false | غیرفعال | منتقل‌نشده/غیرفعال |
| `dukascopy` | enabled=false | غیرفعال | منتقل‌نشده/غیرفعال |
| `yahoo_finance` | enabled=false | غیرفعال | منتقل‌نشده/غیرفعال |
| `eia_brent_spot` | enabled=false | غیرفعال | منتقل‌نشده/غیرفعال |
| `local_csv` | enabled=false | غیرفعال | منتقل‌نشده/غیرفعال |

تابع فعلی `isProviderEnabled(providerId)` فقط `tvdatafeed` را true می‌کند؛ صرف وجود سایر Providerها در Catalog به معنی قابلیت استفاده آن‌ها نیست. بنابراین New نباید شش Provider غیرفعال را به‌عنوان قابلیت عملیاتی نشان دهد.

### 14.2. BYOK و Provider references

`getLocalByokKeys()` و `saveLocalByokKeys()` در Store کلیدهای Twelve Data، Stooq، Alpha Vantage و Finnhub را نگهداری می‌کنند. این موضوع با Provider Catalog هفت‌تایی یکسان نیست؛ کلید ذخیره‌شده به معنی وجود Adapter فعال، مسیر fetch، مدیریت rate limit یا تست end-to-end نیست.

در `apiService.js` مسیرهای فعلی fetch/sync و ارجاع به providerها وجود دارد؛ برای مهاجرت باید زنجیره کامل هر Provider از تنظیمات/کلید تا درخواست شبکه، نرمال‌سازی کندل، cache، aggregation، خطا و رندر استخراج شود. شمارش رشته‌های نام Provider یا ذخیره کلید API، شواهد مهاجرت محسوب نمی‌شود.

### 14.3. تصمیم فنی حوزه دوم

- `tvdatafeed` منبع فعال فعلی است و نباید در این مرحله بازنویسی شود.
- مقصد New باید ابتدا یک قرارداد Provider مستقل و قابل تعویض داشته باشد، اما مصرف‌کننده فعلی New می‌تواند موقتاً از candle store مشترک استفاده کند؛ این حالت باید با برچسب `shared legacy data pipeline` ثبت شود، نه «Provider migrated».
- هر Provider دیگر تا زمان انتقال کامل Adapter و عبور از تست‌های نماد، تایم‌فریم، UTC/open-time، OHLCV، gaps، duplicate merge، cache invalidation، rate-limit و خطا در New غیرفعال می‌ماند.
- هیچ API key نباید از local storage به سرور یا log منتقل شود و BYOK باید per-provider و بدون cross-provider leakage باقی بماند.
- انتقال Providerها هم‌زمان و دسته‌جمعی انجام نمی‌شود؛ ابتدا قرارداد و آزمون مشترک، سپس یک Provider کم‌ریسک و دارای دسترسی/مجوز روشن به‌عنوان پایلوت انتخاب می‌شود.

### 14.4. وضعیت حوزه دوم

`IN_PROGRESS` — Inventory اولیه کاتالوگ و گیت فعال‌بودن ثبت شد. هنوز ممیزی end-to-end هر مسیر fetch در `apiService.js`، API PHP، دیتابیس و Android تکمیل نشده؛ بنابراین هیچ Provider جدیدی به New منتقل‌شده اعلام نمی‌شود.


## 15. اصلاح قطعی دامنه منابع داده — تصمیم نهایی مالک محصول، 2026-11-19

تصمیم مالک محصول صریح و غیرقابل تفسیر است: **تنها منبع داده مجاز و فعال TradingView از طریق `tvdatafeed` است.** هیچ Provider دیگری در برنامه مهاجرت منابع داده قرار ندارد.

- `tvdatafeed`: تنها Provider فعال و مجاز.
- `biquote`, `twelve_data`, `dukascopy`, `yahoo_finance`, `eia_brent_spot`, `local_csv` و هر منبع دیگری: غیرفعال و خارج از دامنه مهاجرت؛ نباید Adapter، مسیر فعال، گزینه قابل انتخاب یا برنامه پایلوت برای آن‌ها ساخته شود.
- کلیدهای BYOK مربوط به Twelve Data، Stooq، Alpha Vantage و Finnhub به معنی پشتیبانی مجاز نیستند و نباید به‌عنوان قابلیت فعال عرضه شوند. پاک‌سازی امن فیلدهای قدیمی/ذخیره‌شده می‌تواند در کار جداگانه انجام شود، اما نباید هیچ درخواست شبکه‌ای از آن‌ها صادر شود.
- وجود رکوردهای قدیمی در داده‌ها/کَش یا Catalog برای سازگاری تاریخی مجوز فعال‌سازی نیست.
- در UI، فقط TradingView باید قابل انتخاب باشد؛ سایر موارد اگر برای توضیح سازگاری قدیمی نمایش داده می‌شوند باید Disabled باشند و نباید امکان تغییر منبع فعال را فراهم کنند.

### وضعیت اصلاح‌شده حوزه منابع داده

حوزه «مهاجرت Providerهای دیگر» **NOT_APPLICABLE / خارج از محدوده** است. کار مجاز این حوزه محدود است به ممیزی و تضمین اینکه New و Legacy هر دو فقط از TradingView/tvdatafeed داده بگیرند و هیچ مسیر جایگزین ناخواسته‌ای فعال نشود. این تصمیم جایگزین هر عبارت قبلی در این سند است که انتقال Provider دیگر یا انتخاب پایلوت Provider دیگری را مطرح کرده باشد.


## 16. اجرای مرحله بعد: شفافیت وضعیت انتقال در New — 2026-11-19

### 16.1. تغییرات رابط کاربری

در `host_subdomain/assets/js/app.js`، صفحه New Structural اکنون یک بخش مستقل با عنوان «قابلیت‌های Legacy که هنوز به New منتقل و تأیید نشده‌اند» دارد. موارد زیر به‌صورت chip غیرفعال و غیرقابل انتخاب اعلام می‌شوند:
- Chronos-2
- مدل‌های Python Worker
- Ledger و ارزیابی چرخه عمر Legacy
- Backtest / Walk-forward
- Historical Replay

این برچسب‌ها ادعای عدم وجود کد در مخزن نیستند؛ بیانگر آن‌اند که این قابلیت‌ها هنوز به‌عنوان گردش‌کار کامل و تأییدشده در New عرضه نشده‌اند. Legacy Forecast Studio از طریق Engine Switcher حفظ شده است.

> **یادداشت وضعیت:** این بخش snapshot تاریخی قبل از اصلاحات 2026-11-19 است. در نسخه ادغام‌شده `main` گزینه Ensemble در New Native دوباره به مسیر `ForecastEngine.project()` متصل و انتخاب‌پذیر شده است؛ بنابراین نتیجه‌گیری «هنوز پیاده‌سازی نشده» در این بخش دیگر وضعیت جاری نیست. پذیرش آماری/OOS آن همچنان باز است.

### 16.2. Ensemble: اصلاح گزینه گمراه‌کننده

ممیزی مستقیم `host_subdomain/assets/js/algorithms/structuralForecastEngine.js` نشان داد که موتور Structural مسیر `model_paths` را برای `empirical_analogs` می‌سازد، اما هیچ مسیر اجرایی برای `ensemble` ندارد (جست‌وجوی مستقیم `ensemble` در فایل، نتیجه‌ای نداشت). در عین حال UI قبلاً دکمه فعال `Calibrated Ensemble` داشت که می‌توانست تصور اجرای Ensemble در موتور Structural را ایجاد کند.

اصلاح انجام‌شده:
- دکمه فعال Ensemble از انتخاب‌گر New حذف شد.
- جایگزین آن یک chip غیرفعال با برچسب `Calibrated Ensemble · Not migrated` و توضیح علت شد.
- این اصلاح صرفاً UI را صادق می‌کند؛ پیاده‌سازی Ensemble جدید هنوز انجام نشده است.
- Historical Analogs در New فعال باقی می‌ماند؛ مسیر موتور Structural برای آن وجود دارد و خروجی باید همچنان `illustrative_only` تلقی شود.

### 16.3. Cache bust و آزمون

- نسخه ورودی `host_subdomain/index.html` از `app.js?v=1.47.17` به `app.js?v=1.47.18` افزایش یافت تا مرورگر نسخه قدیمی UI را از cache نخواند.
- آزمون ایستا `FORECAST-MIGRATION-UI-01` به `tests/web_parity.test.mjs` اضافه شد تا وجود برچسب‌های مهاجرت، حفظ Legacy switcher و نبود action اجرایی برای Ensemble را بررسی کند.
- Commit تغییر UI: `788ba61792e994973233f102b88dd67c24bb060b`
- Commit غیرفعال‌سازی Ensemble: `8c234c7c903b92965245b6f16f15998572a88726`
- Commit آزمون: `d9a06e0c9d0334af0dce6239acc0ae5fbc431e81`
- Commit cache bust: `d5a6e388204352268a5e9adc733dd0e5d3cca0c7`

### 16.4. وضعیت انتشار و کار باقیمانده

در زمان ثبت این یادداشت، GitHub Actions برای commit `d5a6e388204352268a5e9adc733dd0e5d3cca0c7` یک اجرای push با شناسه `44488936275` ساخته و در وضعیت `pending` بوده است؛ هنوز نتیجه job، build یا deploy قابل اعلام نیست. تست محلی در این محیط اجرا نشده است.

گام بعدی حوزه Forecast، انتقال قابلیت‌به‌قابلیت مسیرهای Legacy به New است: ابتدا قرارداد و مسیر اجرایی Chronos-2 و مدل‌های Python، سپس Ledger/ارزیابی و Backtest/Replay. تا زمان انتقال و تست end-to-end، این موارد در New غیرفعال می‌مانند و Legacy حذف نمی‌شود.


## 17. ممیزی Runtime واقعی Chronos-2 و محدودیت هاست اشتراکی — 2026-11-19

### 17.1. یافته اجرایی قطعی

ممیزی مستقیم فایل‌های chronos2_forecast.php و Chronos2QueueManager.php نشان داد مسیر Legacy برای اجرای مدل، تابع PHP exec() را فراخوانی می‌کند و فایل scripts/chronos2_worker.py را به‌عنوان Worker اجرا می‌کند. خود QueueManager در صورت غیرفعال‌بودن exec() خطای صریح زیر را برمی‌گرداند:

- PHP exec() function is disabled on this server host environment.

بنابراین وجود Python worker، موفقیت py_compile در CI یا نصب وابستگی‌ها در GitHub Actions هیچ‌کدام اثبات نمی‌کنند که مدل روی هاست اشتراکی قابل اجراست. این مسیر روی محیط فعلی هاست قابل اتکا نیست و انتقال Chronos-2 به New با صرفاً ساخت Adapter جاوااسکریپت، مشکل Runtime را حل نمی‌کند.

### 17.2. تصمیم معماری اصلاح‌شده

- Chronos-2 در New تا زمان تأمین Runtime مستقل و قابل دسترس، NOT_MIGRATED / BLOCKED_BY_RUNTIME باقی می‌ماند و باید Disabled باشد.
- اجرای Python روی هاست اشتراکی، فعال‌کردن مجدد exec()، Cron، یا تبدیل صوری خروجی مدل به Structural JS به‌عنوان راه‌حل پذیرفته نیست.
- اگر در آینده Runtime مستقل فراهم شود، اجرای Chronos-2 باید on-demand از طریق API امن و احراز هویت‌شده انجام شود؛ نه Cron و نه polling بی‌وقفه. درخواست باید فقط کندل‌های بسته TradingView را بپذیرد و پاسخ باید quantileهای اصلی مدل، revision، timestamp مبنا، horizon و status را بدون جعل OHLC حفظ کند.
- انتخاب سرویس/زیرساخت خارجی و هزینه عملیاتی آن هنوز تصمیم‌گیری نشده است؛ تا آن زمان هیچ وابستگی جدید یا سرویس پولی ایجاد نمی‌شود.
- مدل‌های Python دیگر نیز همین محدودیت را دارند و نباید برای هاست اشتراکی به‌عنوان گزینه اجرایی New عرضه شوند.

### 17.3. اصلاح مرز Provider در API

در ممیزی chronos2_forecast.php مشخص شد پارامتر provider از GET/POST خوانده می‌شد و بدون allow-list مستقیماً به resolver کندل ارسال می‌شد. با توجه به تصمیم قطعی استفاده انحصاری از TradingView، API اکنون هر مقدار غیر از tvdatafeed را پیش از دسترسی به داده با ERR_PROVIDER_NOT_ALLOWED و HTTP 400 رد می‌کند. تست CHRONOS2-PROVIDER-GUARD-01 ترتیب این کنترل را نسبت به candle resolution بررسی می‌کند.

### 17.4. وضعیت CI و انتشار commit قبلی

برای commit 0369459908d2dfd2d977c978395d2619bb230566، GitHub Actions run 44488981036 در تاریخ 2026-11-19 با نتیجه موفق پایان یافت:

- Web parity: 17 تست موفق، صفر شکست.
- py_compile برای Chronos-2 worker موفق بود؛ این فقط بررسی syntax در runner لینوکس است، نه اجرای مدل روی هاست.
- PHP lint برای chronos2_forecast.php، Chronos2QueueManager.php و اسکریپت cron موفق بود.
- Android APK build و unit tests در job مربوطه موفق شدند.
- بسته وب 122 فایل داشت و به‌عنوان Artifact با شناسه 14512336383 آپلود شد.
- مرحله cPanel به دلیل در دسترس نبودن deployment secrets، remote upload را صریحاً skip کرد. بنابراین نتیجه Job موفق است، اما Deploy به هاست انجام نشده و Production browser test نیز انجام نشده است.

این بخش، وضعیت pending ثبت‌شده در بند 16.4 را با نتیجه نهایی همان run جایگزین می‌کند.

### 17.5. گام بعدی

ابتدا guard انحصاری TradingView و تست آن تثبیت می‌شود. سپس ممیزی قرارداد پاسخ Chronos-2 و lifecycle در Legacy تکمیل خواهد شد؛ اما اتصال فعال به New تا زمان حل Runtime مستقل متوقف می‌ماند. در این فاصله، کار مهاجرت روی قابلیت‌های Native JavaScript و حوزه‌های غیر وابسته به Python ادامه می‌یابد و Legacy بدون تغییر در دسترس می‌ماند.


## 18. دفتر متمرکز موانع و ادامه مهاجرت — 2026-11-19

از این تاریخ، تمام موانع و نواقص Forecast در فایل [`OPEN_ISSUES.md`](../03-roadmap-and-issues/OPEN_ISSUES.md) بخش ۵ با شناسه‌های پایدار `FCST-*` ثبت می‌شوند. این فایل برنامه مهاجرت، مرجع وضعیت قابلیت‌ها و تصمیم‌های معماری است؛ `OPEN_ISSUES.md` مرجع فهرست مشکلات و شواهد باز است. موارد اصلی فعلی عبارت‌اند از: Runtime پایتون روی هاست اشتراکی (`FCST-RT-01`)، عدم تأیید Deploy cPanel (`FCST-DEPLOY-01`)، نبود آزمون Production Browser (`FCST-PROD-01`)، ناکافی‌بودن تست Integration برای Provider guard (`FCST-API-01`)، مهاجرت‌نیافتن Ledger/Backtest/Replay (`FCST-EVAL-01`)، نبود Ensemble اجرایی (`FCST-ENS-01`) و تعارض اسناد تاریخی (`FCST-DOC-01`).

### 18.1. ترتیب ادامه کار

1. حفظ New/Legacy به‌صورت مستقل و برگشت‌پذیر؛ هیچ قابلیت Legacy پیش از پذیرش جایگزین خاموش نمی‌شود.
2. ادامه ممیزی و مهاجرت قابلیت‌های مستقل از Python در Native JavaScript؛ اجرای مدل‌های Python تا حل `FCST-RT-01` متوقف است.
3. انتقال Ledger و ارزیابی به‌صورت یک بسته کوچک و قابل آزمون، سپس Backtest/Walk-forward و Replay؛ هرکدام با قرارداد داده و آزمون چرخه عمر مستقل.
4. رفع موانع Deploy/Production verification به‌عنوان شرط پذیرش نهایی UI، نه فرض ضمنی موفقیت CI.
5. به‌روزرسانی همین سند و `OPEN_ISSUES.md` در هر batch؛ ثبت commit، تست، build، deploy و browser evidence به‌صورت جداگانه.

### 18.2. آخرین وضعیت آزمون

Workflow run `44496501529` برای commit `fbcb55082f20e50f82a57c3b6b9c3770f5fe1495` با نتیجه موفق پایان یافت: ۱۸ تست Web parity، PHP lint، ساخت Artifact وب و Build/Test اندروید موفق بودند. با این حال مرحله cPanel remote upload به دلیل در دسترس نبودن Secrets skip شد؛ بنابراین این Run **Deploy موفق به Production را ثابت نمی‌کند**. جزئیات و شناسه‌های مشکل در `OPEN_ISSUES.md §5` نگهداری می‌شوند.

### 18.3. اصلاح دامنه واقعی Ledger و Walk-forward

ممیزی تکمیلی نشان داد موتور `evaluateWalkForward()` در مسیر Native از طریق `buildForecastForTab()` اجرا می‌شود و خروجی OOS به Adapter مدل می‌رسد؛ بنابراین این موتور از نظر کد کاملاً غایب نیست. همچنین `ForecastLedger` در Forecast Studio وجود دارد، اما ذخیره‌سازی آن محلی (`localStorage`) و محدود به ۱۲۰ Snapshot/۲۴۰ رویداد Lifecycle است و Server Sync فعال نیست. آنچه هنوز برای New پذیرفته نشده، workflow یکپارچه UI/گزارش، persistence قابل اتکا و چنددستگاهی، تست lifecycle کامل و Historical Replay مستقل است. این اصلاح، برچسب‌های Pending در New را تغییر نمی‌دهد؛ آن برچسب‌ها وضعیت پذیرش قابلیت در New را نشان می‌دهند، نه نبود هرگونه کد در Legacy یا موتورهای مشترک.

### 18.4. ریسک ورودی ارزیابی Ledger

در ممیزی Ledger مشخص شد `evaluateMaturedForecasts()` صرفاً `close > 0` را برای پاک‌سازی کندل‌ها اعمال می‌کند و در مرز متد، بسته‌بودن کندل، یکتایی timestamp و ترتیب زمانی را enforce نمی‌کند. چون maturity نباید با کندل در حال تشکیل جلو بیفتد، این مورد با شناسه `FCST-LEDGER-02` در دفتر مشکلات ثبت شده است؛ رفع آن و آزمون forming-tail/duplicate/out-of-order پیش از پذیرش کامل Ledger الزامی است.

### 18.5. سخت‌سازی TradingView-only در Workspaceهای قدیمی

یک ریسک باقیمانده در Hydration کشف و اصلاح شد: `tab.provider` ذخیره‌شده از نسخه‌های قدیمی می‌توانست بدون بررسی allow-list وارد کلید کش شود. اکنون Hydration تب و مسیر تعویض نماد، Provider را با `isProviderEnabled()` اعتبارسنجی و هر مقدار غیر از `tvdatafeed` را به TradingView نرمال می‌کند. تست `FORECAST-DATA-SOURCE-GUARD-01` اضافه شد و نسخه ورودی وب به `1.47.19` افزایش یافت. این اصلاح مانع استفاده ناخواسته از cacheهای Provider قدیمی در تب‌های persisted می‌شود؛ نتیجه نهایی CI در گزارش بعدی ثبت خواهد شد.

### 18.6. شواهد تکمیل CI برای تست Ledger

Run `44507978469` برای commit `f321f06caed58a0a3b6f8f93dc5bd1cac88c2c18` با نتیجه کلی موفق پایان یافت: ۱۹ تست Web parity (شامل `FORECAST-LEDGER-01`) پاس، PHP lint موفق، بسته وب ۱۲۲ فایلی با Artifact ID `14519788283` تولید و Build/Unit/Robolectric اندروید موفق شد. مرحله cPanel remote upload به علت نبودن Deployment Secrets skip شد؛ پس این Run انتشار روی Production را ثابت نمی‌کند. اصلاح بعدی Provider تب‌های قدیمی در commit `f0387f4c96bf4f2695ff4fdbe809e9506e5e7dcf` و تست مربوطه در Run `44508388118` قرار دارند و نتیجه آن جداگانه ثبت خواهد شد.


## 19. انتقال مستقیم Walk-Forward و Ledger به Workspace جدید — 2026-11-19

### 19.1. روش انتقال

کد موجود بازنویسی نشد. دو پنل `renderBacktestPanel()` و `renderLedgerPanel()` از `forecastView.js` قابل استفاده مجدد شدند و در `renderForecastWorkspaceContent()` به Workspace جدید متصل شدند. این بخش فقط زمانی نمایش داده می‌شود که کاربر یک مدل Native را انتخاب کرده باشد؛ Structural JS و Historical Analogs ماهیت و مسیر ارزیابی متفاوت خود را حفظ می‌کنند.

### 19.2. مسیر اجرا

- Walk-Forward همان `buildForecastForTab()` و `evaluateWalkForward()` موجود را اجرا می‌کند؛ خروجی OOS، معیارها و دروازه پذیرش از همان محاسبه قبلی می‌آیند.
- ثبت Snapshot در New از `state._lastForecastResult` و `defaultForecastLedger.appendFromForecast()` استفاده می‌کند.
- ارزیابی سررسید از همان `evaluateMaturedForecasts()` استفاده می‌کند.
- هیچ مسیر داده جدیدی ایجاد نشده و Provider همچنان فقط `tvdatafeed` است.

### 19.3. سخت‌سازی ورودی Ledger

`evaluateMaturedForecasts()` اکنون کندل‌های باز را با `PriceFormatter.isCandleClosed()` کنار می‌گذارد، timestampهای تکراری را حذف می‌کند و ورودی را پیش از محاسبه maturity مرتب می‌سازد. تست `FORECAST-NEW-EVALUATION-01` اتصال UI و guardهای ورودی را پوشش می‌دهد.

### 19.4. محدودیت‌های باقیمانده

- Ledger همچنان فقط در `localStorage` است و سقف ۱۲۰ Snapshot و ۲۴۰ Lifecycle event دارد؛ Sync سرور/چنددستگاهی در این انتقال انجام نشده است.
- فیلد مستقل Provider و نسخه دقیق مدل در Snapshot provenance موجود نیست؛ `FCST-LEDGER-03` باز می‌ماند.
- Historical Replay مستقل در این batch منتقل نشده است.
- این تغییر به‌معنی Deploy روی cPanel نیست؛ انتشار Production تا دریافت شواهد remote upload و browser test تأیید نمی‌شود.

### 19.5. تست و وضعیت انتشار

تست `FORECAST-NEW-EVALUATION-01` به `tests/web_parity.test.mjs` اضافه شده است. نتیجه CI، build artifact، cPanel deploy و browser verification باید جداگانه پس از اجرای Workflow ثبت شوند.


## 20. بستن بسته مهاجرت قابل اجرا و Gateهای باقیمانده — 2026-11-19

### 20.1. آنچه در سیستم جدید منتقل و در CI تأیید شد

- انتخاب‌گر New شامل Structural JS، Historical Analogs و تمام ۱۰ مدل رجیستری Native است؛ مدل‌های تقریبی با برچسب Approximation مشخص می‌شوند.
- مسیر اجرا و Adapter مدل‌های Native از مسیر Structural جداست؛ انتخاب مدل و رندر فقط مدل انتخاب‌شده را روی چارت اصلی فعال می‌کند.
- کنترل منبع داده در Store، تب‌های قدیمی و مسیر API به TradingView محدود شده است؛ Providerهای دیگر نباید در Forecast فعال شوند.
- پنل‌های Walk-Forward و Ledger موجود بدون بازنویسی الگوریتم به New Native متصل شده‌اند.
- ورودی maturity دفترکل در برابر کندل باز، timestamp تکراری و ترتیب زمانی سخت‌سازی شده است.
- CI روی commit `2a9560000211eccc24d13b265b7d39480550a003`: ۲۱/۲۱ Web parity، PHP lint، استخراج ۴۲٬۲۹۱ کندل TradingView، Android build و Unit/Robolectric موفق.
- Deploy واقعی cPanel با پاسخ `deployed_files: 123` تأیید شد؛ Artifact وب ۱۲۲ فایل و APK نیز ساخته شدند.

### 20.2. مرز «انتقال کد» با «پذیرش عملیاتی»

موارد زیر عمداً به‌عنوان قابلیت تکمیل‌شده معرفی نمی‌شوند و در `OPEN_ISSUES.md §5` ثبت شده‌اند:

1. **Chronos-2 و Python Workerها:** به Runtime مستقل نیاز دارند؛ روی هاست فعلی Python/exec قابل اتکا نیست. غیرفعال باقی می‌مانند؛ نه Cron اضافه می‌شود و نه اجرای جعلی با JS.
2. **Historical Replay مستقل:** در کد موجود، workflow قابل انتقال و پذیرش‌شده‌ای برای Replay یافت نشد؛ ساخت آن یک قابلیت جدید است، نه انتقال ساده. تا طراحی و تست causal replay در New غیرفعال می‌ماند.
3. **Calibrated Ensemble:** مسیر اجرایی و کالیبراسیون معتبر در Structural JS وجود ندارد؛ گزینه در UI غیرفعال باقی می‌ماند.
4. **Ledger server/multidevice sync:** Ledger فعلی localStorage است و محدودیت ۱۲۰ Snapshot / ۲۴۰ رویداد دارد. مهاجرت ابری نیازمند تصمیم Schema، API، احراز هویت، conflict handling و migration امن Hash Chain است.
5. **Snapshot provenance:** provider و model version مستقل باید در نسخه بعدی قرارداد ذخیره شوند؛ بدون شکستن Hash Chain داده‌های قبلی.
6. **Production Browser E2E:** Deploy ثابت شده، اما تعامل واقعی UI روی مرورگر Production هنوز اثبات نشده است.
7. **Legacy retirement:** تا عبور New از Browser E2E و پذیرش کیفیت خروجی، Legacy حذف یا خاموش نشود.

### 20.3. تصمیم وضعیت

بسته مهاجرت Native/Browser-based قابل اجرا تا سطح CI و Deploy تکمیل شده است؛ «کل مهاجرت محصول» هنوز به‌دلیل موارد بند 20.2 بسته نیست. این تفکیک مانع ادعای تکمیل کاذب می‌شود. مسائل باقیمانده در دفتر متمرکز ثبت شده‌اند و نباید با فعال‌کردن placeholderها از UI پنهان شوند.


## 21. تنظیمات مدل‌ها در New، جلوگیری از خروجی stale و آخرین شواهد — 2026-11-19

### 21.1. انتقال تنظیمات

- `renderModelsPanel()` از Forecast Studio به‌صورت reusable export شد.
- New Native همان کنترل‌های موجود را برای فعال/غیرفعال‌سازی مدل، وزن و پارامترهای مدل ارائه می‌کند.
- بخش URL مربوط به Python Worker در New عمداً render نمی‌شود؛ چون Runtime مدل‌های Python در هاست فعلی قابل اتکا نیست و ارائه ورودی فعال، برداشت اشتباه از قابلیت اجرایی ایجاد می‌کرد.
- مدل انتخاب‌شده همچنان مستقل از مدل‌های دیگر است؛ تغییر تنظیمات مدل‌های غیرمنتخب نباید Forecast مدل فعلی را به‌اشتباه جایگزین کند.

### 21.2. رفع دو نقص کنترل تنظیمات

- کنترل Weight در HTML از `data-model-id` استفاده می‌کرد، اما handler فقط `data-model` می‌خواند؛ handler اکنون هر دو را با اولویت `data-model-id` می‌پذیرد.
- تغییر تنظیمات مدل مؤثر بر Forecast فعال، خروجی قبلی را invalidate می‌کند؛ بنابراین مسیر قبلی با وزن/پارامترهای منسوخ روی چارت باقی نمی‌ماند. اجرای مجدد همچنان on-demand است.
- بخش تنظیمات در New به‌صورت جمع‌شونده ارائه شده تا انتخاب‌گر مدل و اجرای تحلیل در UI شلوغ نشوند.

### 21.3. شواهد CI و Deploy

- Commit: `4c803143a719891e9d8840fbd94141b38772cdf5`.
- Workflow run: `44515867849` — نتیجه کلی `success`.
- Web parity: **۲۳/۲۳ پاس، صفر شکست**؛ شامل `FORECAST-NEW-MODEL-CONFIG-01` و `FORECAST-NEW-MODEL-CONFIG-02`.
- PHP lint و استخراج TradingView موفق.
- cPanel remote upload با `ok:true` و `deployed_files:123` تأیید شد.
- Android Debug APK build و Unit/Robolectric tests موفق شدند؛ Artifactها ساخته شدند.

### 21.4. Gateهای باقیمانده

پذیرش نهایی New هنوز به Browser E2E روی Production، OOS acceptance واقعی مدل‌ها، Compare صریح، Historical Replay، Runtime مستقل Python، Ensemble کالیبره و persistence/provenance کامل Ledger وابسته است. شناسه و اقدام هر مورد در `OPEN_ISSUES.md` بخش ۵ ثبت شده است.


## 22. تأیید همگام‌سازی نهایی مستندات و Deploy — 2026-11-19

- Commit مستندات: `a732918ebda6905844b3ad77b531d241c5e8697e`.
- Workflow run: `44516442724` با نتیجه کلی `success`.
- Web parity: ۲۳/۲۳ پاس، صفر شکست؛ PHP lint موفق.
- TradingView extraction موفق و cPanel remote upload با `deployed_files:123` تأیید شد.
- Android Debug APK و Unit/Robolectric tests موفق شدند.
- Artifact وب `14524589022` و APK `14526440962` ساخته شدند.
- انتشار و مستندات همگام‌اند؛ تنها Browser E2E و قابلیت‌های فهرست‌شده در OPEN_ISSUES.md به‌عنوان Gateهای باقیمانده باز هستند.


## 24. اصلاح انتقال ناقص UI در New — 2026-11-19

در بازبینی مجدد، مشخص شد رابط New Native به‌اشتباه فقط انتخاب موتور و چند کنترل پایه را نمایش می‌داد. قابلیت‌های قابل استفاده موجود از Forecast Studio اکنون reuse شده‌اند: Overview/Scenario/Event Tree، Fan canvas، Models/Configuration، Walk-Forward/Calibration، Ledger/Lifecycle، انتخاب مسیر مدل، ثبت Snapshot، Apply-to-chart، Render Mode و MTF coordination.

همچنین رفع شد که New Native برای ساخت Forecast از horizon و model مستقل خود استفاده کند؛ پیش از این `buildForecastForTab()` ناخواسته تنظیمات Legacy را می‌خواند. تنظیمات دو موتور اکنون از طریق overrides جدا شده‌اند. Cache-busting وب به `app.js?v=1.47.22` و Forecast View به `v=2.0.8` افزایش یافت.

این تغییر هنوز به معنی تکمیل کل مهاجرت نیست: Chronos-2/Python Worker به Runtime مستقل وابسته است، Historical Replay و Calibrated Ensemble پیاده‌سازی اجرایی ندارند و Browser E2E باید انجام شود.

- ایزولاسیون Worker: New Native `workerUrl` را صریحاً خالی می‌فرستد و تنظیمات ذخیره‌شده Legacy باعث اجرای ناخواسته Worker خارجی نمی‌شود.

- تب‌های Forecast Studio در New به انتخاب Native محدود نیستند: Models/Walk-Forward/Ledger همواره قابل دسترسی‌اند؛ Overview برای Structural JS و Historical Analogs توضیح صریح می‌دهد که نمودار Fan/Scenario به خروجی Native وابسته است. ارزیابی Native به‌صورت lazy هنگام نیاز محاسبه می‌شود.

- Structural Preview: در New Overview، خروجی واقعی Structural (`forecast[]` با `q50_median`, `q10`, `q90`) به قرارداد نمایشی Canvas نگاشت می‌شود؛ مسیرهای Historical Analog فقط به‌صورت illustrative overlay هستند و به‌عنوان احتمال معرفی نمی‌شوند.

- Structural Overview status binding از متغیر local دیرتر تعریف‌شده مستقل شد تا خطای Temporal Dead Zone رخ ندهد.


## 25. آخرین شواهد انتشار پس از اصلاح شکاف‌های New — 2026-11-19

- Commit نهایی کد و مستندات: `2de2d880d5a98ded5cdd060b17fc3d06a412c510`.
- Workflow run `44530137222`: `success` در Web و Android.
- ۲۴/۲۴ تست وب پاس، PHP lint موفق، TradingView candle extraction موفق.
- cPanel upload با ۱۲۳ فایل و snapshot `snapshot_20261119_131045` تأیید شد؛ ۴۲٬۲۹۱ کندل TradingView seed شدند.
- Android APK و Unit/Robolectric tests موفق؛ artifact IDs: Web `14533451142`، APK `14533691355`.
- باقی‌مانده‌های پذیرش در `OPEN_ISSUES.md` ثبت‌اند؛ به‌خصوص Browser E2E، Runtime Python، Replay و Ensemble.


## 26. مستندات نهایی همگام با آخرین انتشار — 2026-11-19

- Commit کد: `2de2d880d5a98ded5cdd060b17fc3d06a412c510`؛ commit اسناد: `832f2828becb0da4faccf09fdba2c0d180b830d9`.
- Run `44531190348`: success؛ Web ۲۴/۲۴، Android build و tests موفق.
- Deploy با ۱۲۳ فایل، snapshot `snapshot_20261119_131340` و ۴۲٬۲۹۱ کندل TradingView تأیید شد.
- Artifactها: Web `14534022250`، APK `14533517048`.

- Compare وضعیت جزئی دارد: Overview مدل‌های موفق را با endpoint/status و مسیر q50 overlay می‌کند؛ main chart همچنان یک مدل منتخب دارد. Multi-select visibility/legend مستقل و Side-by-Side در backlog باقی است.


## 27. گسترش مقایسه چندمدلی و انتخاب پیش‌فرض New — 2026-11-19

- موتور New به‌عنوان مقدار پیش‌فرض Preferences جدید تنظیم شد؛ Legacy همچنان قابل انتخاب و rollback است.
- برای مسیرهای موفق مدل‌ها، checkbox مستقل نمایش/مخفی‌سازی به Forecast Studio Preview اضافه شد؛ انتخاب‌ها در Preferences ذخیره می‌شوند.
- Renderer فقط overlayهای انتخاب‌شده را رسم می‌کند. مسیر منتخب اصلی مستقل باقی می‌ماند.
- Side-by-Side مستقل و visibility چندمدلی روی Main Chart هنوز منتقل نشده و در OPEN_ISSUES.md باز می‌ماند.
- Cache bust: app.js?v=1.47.27.
- وضعیت: منتظر CI/Deploy.


## 28. مقایسه تصویری کنارهم در New Forecast Preview — 2026-11-19

- هر مسیر مقایسه‌ای موفق و انتخاب‌شده اکنون Canvas مستقل Side-by-Side در Overview دارد.
- ورودی هر Canvas مستقیماً trajectory همان مدل (`points`) است؛ quantileها حفظ می‌شوند و هیچ OHLC مصنوعی ساخته نمی‌شود.
- انتخاب overlayها مستقل و در Preferences ذخیره می‌شود.
- محدودیت باقی‌مانده: Main Chart همچنان یک مدل منتخب دارد؛ multi-select visibility/legend آن هنوز پیاده‌سازی نشده است.
- Cache bust: app.js?v=1.47.28.


## 29. انتقال Compare چندمدلی به Main Chart — 2026-11-19

- مسیرهای مدل‌های Native موفق هنگام Apply-to-chart همراه Forecast منتخب نگهداری می‌شوند؛ فقط مدل‌های دارای trajectory کامل و هم‌افق وارد مقایسه می‌شوند.
- Main Chart اکنون مسیر q50 مدل‌های انتخاب‌شده را به‌صورت خط‌چین مستقل و با برچسب مدل رسم می‌کند؛ مسیر اصلی همچنان واضح و مستقل است.
- مقیاس قیمت، مسیرهای مقایسه‌ای قابل‌نمایش را نیز در نظر می‌گیرد؛ OHLC یا باند عدم‌قطعیت مصنوعی برای مدل‌های مقایسه‌ای تولید نمی‌شود.
- انتخاب visibility از همان forecastCompareModelIds ذخیره‌شده استفاده می‌کند؛ مدل منتخب به‌عنوان overlay تکراری رسم نمی‌شود.
- Cache bust: app.js?v=1.47.29.
- این تغییر Compare روی Main Chart را از نظر کد به New اضافه می‌کند؛ پذیرش نهایی به CI و تست تعاملی Production وابسته است.


## 30. پذیرش CI و Deploy مقایسه چندمدلی Main Chart — 2026-11-19

- Commit کد: `27211f53c1fb7ea71f37c0e48e13f11047e2a6da`؛ اصلاح cache module: `49c07d16383131dd7af66bc81398280e31592d81`.
- Run `44534781037`: Web parity برابر ۲۷/۲۷، صفر شکست؛ PHP lint و TradingView extraction موفق.
- cPanel Deploy با `ok:true`, ۱۲۳ فایل و snapshot `snapshot_20261119_133610` تأیید شد.
- Android Debug APK و Unit/Robolectric tests موفق؛ artifact APK `14536815154` و Web package `14534949557`.
- Compare در Preview، Side-by-Side و Main Chart اکنون از نظر کد و CI منتقل شده است؛ Browser E2E Production همچنان Gate پذیرش است.



## 9. اصلاح وضعیت و تغییرات اجرایی — 2026-11-19

این بخش بر وضعیت واقعی نسخه ادغام‌شده در `main` افزوده شده و ادعاهای قبلی را به‌روزرسانی می‌کند:

- انتخاب‌گر Forecast Studio اکنون فهرست مدل‌ها را مستقیماً از `defaultForecastRegistry.list()` می‌سازد؛ بنابراین مدل‌های رجیستری مانند `historical_drift`، `kalman_momentum`، `garch_volatility`، `arima_ets` و `gaussian_process` از انتخاب‌گر جا نمی‌مانند. `empirical_analogs` و `ensemble` نیز گزینه‌های جداگانه دارند.
- اجرای Python Worker از مسیر Forecast New حذف شده است: URL ذخیره‌شده خوانده نمی‌شود، درخواست استنتاج خارجی ارسال نمی‌شود و کنترل ذخیره URL از UI/Action حذف شده است. این تصمیم با محدودیت هاست اشتراکی و سیاست اجرای Native JavaScript سازگار است.
- پنل مدل‌ها در هر دو نمای New/Legacy دیگر ورودی تنظیم Worker Python ارائه نمی‌کند.
- موتور New در اولین ورود، در صورت نبود Preference قبلی، پیش‌فرض فعال است؛ انتخاب Legacy همچنان دستی و برگشت‌پذیر باقی می‌ماند.

### 9.1. مواردی که هنوز Gate پذیرش را نگذرانده‌اند

این تغییرات به معنی تکمیل کل مهاجرت نیست. موارد زیر همچنان بازند و تا اجرای کد و آزمون واقعی نباید بسته اعلام شوند:

1. **Historical Replay پایه پیاده‌سازی شده است:** سه مبدأ تاریخی مستقل در New Native، آموزش فقط با کندل‌های قبل از مبدأ و استفاده از کندل‌های آینده صرفاً برای امتیازدهی. تعداد پنجره‌های ۳/۵/۱۰، بازه UTC دلخواه From/To و ذخیره ۲۰ اجرای اخیر به‌صورت محلی پیاده‌سازی شده‌اند؛ انتخاب هر پنجره و نمایش مسیر پیش‌بینی در برابر Closeهای واقعی همان پنجره روی Canvas پیاده‌سازی شده است؛ پخش خودکار پنجره‌ها با کنترل Play/Pause در مرورگر اضافه شده است؛ مقایسه اجراهای ذخیره‌شده در جدول مجزا اضافه شده است؛ آزمون عملکرد در تاریخچه بزرگ، ممیزی عدم نشت داده با fixtureهای مستقل و تأیید مرورگری همچنان باز است.
2. انتقال و تطبیق قابلیت‌های Chronos-2 بدون وابستگی به Python روی هاست اشتراکی؛ تا یافتن Runtime سازگار، این مدل باید صریحاً غیرفعال بماند و نباید شبیه‌سازی شود.
3. تکمیل مقایسه بصری چندمدلی و انتخاب/ذخیره مسیرهای مقایسه در سطح هر تب، همراه با آزمون عدم Overlay ناخواسته؛ انتخاب Ensemble در New اکنون به‌صورت مستقل فعال شده است.
4. ماتریس یک‌به‌یک Legacy→New در سند `FORECAST_LEGACY_PARITY_MATRIX_V1.md` ثبت شده است؛ ممیزی نهایی کنترل‌های باقیمانده در Android/API و تأیید اجرایی هر ردیف هنوز باز است.
5. تست‌های مرورگری end-to-end برای انتخاب مدل، اجرای مدل، تغییر افق، رسم روی چارت اصلی، تغییر نماد/تایم‌فریم، ذخیره Snapshot و ارزیابی نتیجه.
6. اثبات رفتار داده در Production و اطمینان از اینکه Forecast فقط از TradingView و کندل‌های بسته‌شده استفاده می‌کند.
7. تکمیل و تطبیق مستندات محصول، معماری، API، تست و فهرست نواقص پس از بسته‌شدن موارد بالا.

**معیار تحویل به کاربر:** هیچ مورد P0/P1 مرتبط با مهاجرت، انتخاب مدل، اجرای مدل، Renderer، Replay یا داده نباید باز باشد؛ CI سبز به‌تنهایی معیار تحویل نیست.


## 10. شواهد اعتبارسنجی نسخه ادغام‌شده — 2026-11-19

- **GitHub Actions:** اجرای `Forecast Native Validation` روی شاخه کاری پیش از تجمیع با نتیجه موفق؛ همان کد در commit `05933ac39ca440dc1338385b9cf3d6159e20c377` به `main` منتقل شد.
- **Node tests:** 33/33 موفق، 0 شکست.
- **Syntax:** `node --check` برای `app.js`، `forecastView.js`، `modelRegistry.js` و `forecastEngine.js` موفق.
- یک خطای واقعی تعریف دوباره `horizon` در `app.js` توسط Syntax check کشف و اصلاح شد؛ اجرای بعدی سبز است.
- این اعتبارسنجی، تست مرورگر تعاملی یا تأیید استقرار cPanel نیست. تا زمانی که پذیرش Chronos/runtime و ممیزی Legacy بسته نشده، این شاخه آماده اعلام پایان مهاجرت محصول نیست.


## 11. وضعیت تجمیعی و مرجع قطعی انتقال — بازنگری 2026-11-19

این بخش جدیدترین وضعیت قابل اتکا را جمع‌بندی می‌کند. در صورت تعارض با یادداشت‌های تاریخی بخش‌های قبل، وضعیت همین بخش و جدول Parity نسخه 1.1.0 ملاک است. یادداشت‌های قدیمی حذف نشده‌اند تا تاریخچه تصمیم‌ها و اصلاح مسیر قابل ردیابی بماند.

### 11.1. آنچه در `main` تجمیع شده است

| حوزه | کار انجام‌شده | وضعیت واقعی |
|---|---|---|
| انتخاب موتور | New Native به‌عنوان پیش‌فرض اولین استفاده؛ Legacy برای Rollback باقی است | پیاده‌سازی‌شده؛ پذیرش مرورگری باز |
| انتخاب مدل | انتخاب‌گر پویا از رجیستری ۱۰ مدل؛ Historical Analogs و Ensemble نیز گزینه مستقل | پیاده‌سازی‌شده؛ کیفیت مدل‌ها جداگانه باید ارزیابی شود |
| تنظیمات مدل | فعال/غیرفعال، وزن، پارامترها و Reset | پیاده‌سازی‌شده |
| اجرای Native | اجرای JavaScript در مرورگر؛ بدون نیاز به Python یا exec روی cPanel | پیاده‌سازی‌شده؛ محدودیت Approximation برای برخی مدل‌ها پابرجاست |
| Structural JS | اجرای on-demand و نمایش Preview از خروجی واقعی ساختاری | پیاده‌سازی‌شده؛ پذیرش بصری Production باز |
| Historical Analogs | استخراج قیاس‌های علّی؛ مسیرها با برچسب illustrative | پیاده‌سازی‌شده؛ اعتبار آماری باید سنجیده شود |
| Ensemble | گزینه و مسیر اجرایی مستقل در New | پیاده‌سازی‌شده؛ کالیبراسیون و OOS acceptance باز |
| Forecast Studio | Overview، Models، Walk-Forward، Ledger، Render Mode، افق و MTF controls | به New متصل شده؛ E2E باز |
| Compare | overlayهای Preview، نماهای Side-by-Side و مسیرهای مقایسه روی Main Chart | پیاده‌سازی‌شده؛ تست تعاملی و صحت هم‌ترازی باز |
| Snapshot/Lifecycle | ثبت Snapshot و رویدادهای چرخه عمر با Ledger محلی | پیاده‌سازی‌شده؛ Cloud/server sync منتقل نشده |
| Historical Replay | بازه UTC، پنجره‌های ۳/۵/۱۰، آموزش قبل از anchor، امتیازدهی فقط با آینده، MAE/coverage/direction، نمودار، Play/Pause و تاریخچه محلی ۲۰ اجرا | پیاده‌سازی‌شده؛ تست کارایی تاریخچه بزرگ و fixture مستقل leakage باز |
| داده بازار | TradingView تنها منبع مجاز مسیر New؛ سایر Providerها غیرفعال | قاعده و guard پیاده‌سازی شده؛ تأیید زنده Production لازم |
| زمان‌بندی | عدم استفاده از Cron؛ اجرا فقط با اقدام صریح کاربر | تصمیم و سیاست ثابت |
| Python Worker | URL و اجرای Worker از مسیر New حذف/ایزوله شده | عمدی؛ مدل‌های واقعی Python هنوز در New موجود نیستند |
| تست خودکار | ۳۳ تست Node و Syntax check فایل‌های اصلی؛ کد اکنون در `main` است | موفق در CI پیش از تجمیع |
| مستندات | Migration Plan، Parity Matrix و Open Issues به‌روزرسانی شده‌اند | همین بازنگری |

### 11.2. آنچه انجام نشده یا پذیرش نهایی ندارد

1. **Chronos-2:** در New یک مدل قابل انتخاب/اجرا نیست. اجرای مستقیم Python روی هاست اشتراکی قابل اتکا نیست. Workflow دستی GitHub Actions محدود به نمادها/افق‌های مشخص است و از UI جدید dispatch نمی‌شود. راه امن dispatch، احراز هویت، دریافت نتیجه، timeout/retry و provenance هنوز طراحی/پیاده‌سازی نشده است.
2. **تصمیم محصول Chronos:** باید بین ساخت Runtime خارجی امن و بازنشستگی Chronos از کاتالوگ فعال تصمیم گرفته شود. Approximationهای JavaScript جایگزین هم‌ارز Chronos یا LSTM/TFT/Prophet/ARIMA Python نیستند.
3. **ممیزی کامل Legacy:** ماتریس فعلی Forecast را پوشش می‌دهد؛ تطبیق یک‌به‌یک تمام کنترل‌ها و رفتارهای Web/API/Android و مواردی که خارج از Workspace هستند هنوز sign-off نشده است.
4. **Browser E2E:** جریان کامل انتخاب مدل، تغییر پارامتر/افق، اجرا، رسم Main Chart، تغییر نماد/تایم‌فریم، Compare، Replay، Snapshot و Lifecycle روی مرورگر واقعی اجرا و ثبت نشده است.
5. **Production verification:** آخرین خطای بارگذاری workspace ناشی از اعلان تکراری `const horizon` در `main` بود. در 2026-11-19 اصلاح روی `main` با commit `a6349d7` ثبت و cache key در `index.html` با commit `4bbcaed` از `1.47.29` به `1.47.30` افزایش یافت. پس از اصلاح، فایل از GitHub دوباره خوانده شد و تنها یک اعلان `horizon` باقی بود؛ اما اجرای موفق روی هاست/مرورگر هنوز تأیید نشده است.
6. **کیفیت پیش‌بینی:** پذیرش OOS به‌ازای هر نماد، تایم‌فریم، افق و رژیم بازار؛ مقایسه با baseline؛ و حفظ holdout مستقل انجام نشده است. سبز بودن تست یا ترسیم مسیر به معنی دقت پیش‌بینی نیست.
7. **Replay:** کارایی روی تاریخچه‌های بزرگ، حافظه مصرفی، مرزبندی دقیق تاریخ/کندل و آزمون مستقل ضد-leakage تکمیل نشده است.
8. **Ledger:** ذخیره‌سازی محلی مرورگر است؛ همگام‌سازی سرور/چنددستگاهی و provenance کامل پایدار هنوز منتقل نشده است.
9. **Android/API parity:** موفقیت Build یا Unit tests به‌تنهایی اثبات برابری رفتار Forecast در Web، Android و API نیست.

### 11.3. ترتیب اولویت ادامه کار

| اولویت | اقدام | شرط بستن |
|---|---|---|
| P0 | تأیید رفع خطای startup در نسخه واقعاً منتشرشده و اجرای smoke test محیط کاری | بارگذاری بدون SyntaxError و ثبت شواهد نسخه/commit |
| P1 | Browser E2E کامل New Forecast | اجرای سناریوهای اصلی با شواهد و بدون regression |
| P1 | تعیین تکلیف Chronos-2 | Runtime امن عملیاتی و متصل، یا تصمیم صریح بازنشستگی |
| P1 | ممیزی کامل Legacy Web/API/Android | هر قابلیت دارای وضعیت، مقصد، شواهد و تصمیم Keep/Adapt/Retire |
| P1 | Replay performance و no-leakage | fixture مستقل، تاریخچه بزرگ و گزارش منابع/نتایج |
| P1 | OOS acceptance مدل‌ها | پروتکل ثابت، holdout و نتایج تفکیک‌شده |
| P2 | Ledger server sync و provenance | قرارداد مالکیت، ذخیره‌سازی و بازیابی آزموده‌شده |
| P2 | پاک‌سازی Legacy | فقط بعد از پذیرش New و تأیید نبود وابستگی؛ همراه Rollback plan |

### 11.4. معیار پایان مهاجرت

مهاجرت زمانی «کامل» اعلام می‌شود که تمام قابلیت‌های Legacy در ماتریس موجود باشند، هر مورد یا منتقل و آزموده شده یا با تصمیم صریح بازنشسته شده باشد؛ تمام Gateهای P0/P1 بسته شده باشند؛ تست‌های مرورگری و Production شواهد قابل بازبینی داشته باشند؛ منبع داده فقط TradingView باشد؛ Cron و اجرای Python روی هاست اشتراکی وارد مسیر نشوند؛ و اسناد، کد و وضعیت انتشار با یکدیگر هم‌نسخه باشند.

**وضعیت فعلی: مهاجرت قابلیت‌های اصلی New Native از نظر کد گسترده است، اما مهاجرت محصول هنوز کامل و قابل تحویل نهایی نیست.**


## 12. تکمیل گام ۱ سیستم جدید (AUTO OOS، حالت‌های رسم چارت اصلی و MTF) — 2026-11-19

بر اساس تصمیم صریح کاربر (کنار گذاشتن موقت Python/Chronos-2 روی هاست اشتراکی، تکمیل کامل امکانات مرورگری در سیستم جدید و اجرای مرحله‌به‌مرحله پیش از غیرفعال‌سازی/حذف Legacy):

1. **مدل `AUTO (بهترین OOS)` در سیستم جدید (`app.js`, `forecastContract.js`, `store.js`):**
   - گزینه `AUTO (خودکار · بهترین OOS)` به انتخاب‌گر سیستم جدید اضافه شد و `applyNativeModelForecastToTab` به‌جای fallback ثابت به `naive_persistence`، مدل منتخب واقعی `ForecastEngine` (`selectedChartModelId`) را تطبیق می‌دهد و شناسه درخواستی (`requested_model_id: 'AUTO'`) را برای تطابق پایدار در `isStructuralForecastMatchingTab` حفظ می‌کند.
2. **رسم کامل حالت‌های نمایش و لایه MTF روی چارت اصلی (`chartRenderer.js`, `forecastContract.js`, `app.js`):**
   - مقیاس محور عمودی (`rawMin`/`rawMax`) اکنون کوانتایل‌های بیرونی `q10` و `q90` را نیز پوشش می‌دهد تا مخروط کامل بریده نشود.
   - حالت‌های **Quantile Fan** (باند بیرونی `Q10–Q90` + باند داخلی `Q25–Q75` و برچسب‌های محور قیمت)، **Hybrid** و **Quantile Bars** (میله‌های کوانتایل مشتق‌شده صرفاً از `q25..q75` و `q50` بدون OHLC ساختگی) مستقیماً در رندرر چارت اصلی سیستم جدید پیاده‌سازی شدند.
   - لایه **Coordinated MTF** (`mtfCoordination.coordinatedPoints`) در صورت انتخاب کاربر با اعتبارسنجی یکنواختی کوانتایل‌ها به رندرر چارت اصلی منتقل می‌شود و تغییر حالت نمایش، MTF یا چک‌باکس‌های Compare بلافاصله چارت اصلی را بازترسیم می‌کند.
3. **یکپارچه‌سازی هدر و کنترل‌ها (`app.js`, `index.html`):**
   - نشانگرهای وضعیت (`VALID/PROVISIONAL/NO_EDGE`، `Edge Gate`، `OOD` و `Regime`) و نشان نماد به هدر سیستم جدید اضافه شدند و ردیف تکراری انتخاب افق حذف و یکپارچه شد.
   - کش مرورگر به `app.js?v=1.47.35`، `chartRenderer.js?v=1.47.22`، `forecastContract.js?v=2.0.4` و `store.js?v=1.47.13` (یکپارچه در تمام ۹ ماژول) ارتقا یافت.
4. **وضعیت Legacy و راستی‌آزمایی:**
   - سیستم Legacy در گام ۱ دست‌نخورده و فعال باقی ماند (غیرفعال‌سازی مرحله‌ای بخش‌های منتقل‌شده برای **گام ۲** و پس از تست کاربری گام ۱ برنامه‌ریزی شده است).
   - بررسی سینتکس `node --check` برای فایل‌های تغییریافته و تمامی **۳۵/۳۵ تست `tests/web_parity.test.mjs`** (شامل `FORECAST-PHASE1-PARITY-01` و `FORECAST-PHASE1-PARITY-02`) با موفقیت پاس شدند؛ تأیید مرورگری زنده در Production همچنان Gate بعدی پیش از گام ۲ است.

### 12.1. هم‌ترازی کامل داشبورد ۱۲-پنلی Forecast Studio در سیستم جدید (`v1.47.36`) — 2026-11-19

پس از مقایسه تصویری نسخه `v1.47.35` سیستم جدید با داشبورد کامل `Legacy · Forecast Studio`، شکاف ساختاری زیر شناسایی و رفع شد:

1. **علت ریشه‌ای نمایش ناقص در `v1.47.35`:** در `app.js` مدل `empirical_analogs` از `isNativeModelSelected` حذف شده بود و هنگام انتخاب `structural_wave_js` یا `empirical_analogs` در تب Overview، اجرای `buildForecastForTab()` و رندر `renderOverviewPanel()` انجام نمی‌شد؛ در نتیجه کاربر به‌جای ۱۲ پنل کامل استودیو فقط کارت خالی `Structural Model Overview · IDLE` می‌دید. همچنین در `store.js` عبارت باقاعده `/^[a-z0-9_]+$/` اجازه ذخیره مقدار حروف بزرگ `AUTO` را پس از reload نمی‌داد.
2. **اصلاحات اعمال‌شده در `v1.47.36` (`app.js`, `store.js`, `index.html`):**
   - چیدمان سیستم جدید دقیقاً به ساختار تمام‌عرض `.ci-forecast-studio` (هدر، نشانگرهای `VALID/INSUFFICIENT_EVIDENCE`، `Edge Gate`، `OOD`، `Regime`، دکمه‌های `Record Local Snapshot` و `Show Selected Model on Chart`، نوار فشرده `.ci-fc-controls-row`، کنترل باند عدم‌قطعیت، Compare Overlays و ساب‌تب‌های ۴گانه) هم‌تراز شد.
   - مدل `empirical_analogs` (`Causal Historical Analogs`) اکنون به‌طور کامل در مسیر Native Studio قرار دارد و برای **همه مدل‌ها** (از جمله `Structural JS`، `Causal Historical Analogs`، `AUTO`، ۱۰ مدل رجیستری و `Calibrated Ensemble`) تمامی ۱۲ پنل استودیو (`Calibrated Quantile Fan`، `OOS Selection Gate`، `Conformal Calibration`، `12-Model Trajectory Comparison`، `11 Side-by-Side mini-charts`، `Analog Medoids`، `NO_EDGE`، `Aleatoric vs Epistemic`، `MTF Coordination Check`، `3-Scenario Event Tree` با `Plot Reference Bands on Chart` متصل به `redrawActiveCanvas()`، `Key Zones` و `Horizon Step Quantile Ladder`) به‌صورت زنده رندر می‌شوند.
   - در حالت انتخاب `Structural JS`، یک نوار وضعیت فشرده `Structural Wave JS Engine` بالای پنل‌های ۱۲گانه قرار می‌گیرد بدون آنکه `state._lastForecastResult` را بازنویسی یا مینی‌چارت‌ها را خراب کند.
   - ذخیره‌سازی پایدار `AUTO` در `store.js` اصلاح و کلید کش به `app.js?v=1.47.36` و `store.js?v=1.47.14` (در تمامی ۹ ماژول) ارتقا یافت.
3. **راستی‌آزمایی محلی:** `node --check` روی تمامی ۱۱ ماژول JS تغییریافته و **۳۶/۳۶ تست `tests/web_parity.test.mjs`** (شامل تست جدید `FORECAST-PHASE1-STUDIO-PARITY-03`) بدون خطا پاس شدند. Legacy همچنان تا تأیید مرورگری کاربر برای ورود به گام ۲ فعال است.


