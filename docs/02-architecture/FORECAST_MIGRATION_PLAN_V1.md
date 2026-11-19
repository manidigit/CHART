# CHART — برنامه مهاجرت قابلیت‌ها و ممیزی مرحله اول مدل‌های پیش‌بینی

- **نسخه:** 1.0.0
- **تاریخ ثبت:** 2026-11-18
- **وضعیت:** مسیر انتخاب/اجرا/رسم تمام 10 مدل رجیستری Native وب پیاده‌سازی و منتشر شده؛ وضعیت OOS per-model نیز به Adapter متصل است. پذیرش کیفیت هر مدل داده‌محور است؛ Chronos-2 و Python Workerهای خارج از رجیستری هنوز مسیر جداگانه دارند. هیچ مسیر Legacy حذف یا خاموش نشده است.
- **مخزن/شاخه مبنا:** `manidigit/CHART` / `main`
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

## 7. وضعیت حوزه‌های بعدی

- **مرحله 2 — پلاگین‌ها و منابع داده:** در صف؛ شروع پس از تثبیت قرارداد داده/مدل مرحله 1.
- **مرحله 3 — مقایسه و ارزیابی:** بخشی از معیار پذیرش مدل‌ها در مرحله 1 لازم است؛ انتقال کامل ابزارها و گردش‌کار مقایسه در این حوزه انجام می‌شود.
- **مرحله 4 — تحلیل و بازنگری:** در صف.
- **مرحله 5 — تنظیمات و خدمات جانبی:** در صف.

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
