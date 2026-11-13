# CHART INTELLIGENCE — سند مرجع اصلی پروژه و مشخصات محصول

**شناسه سند:** `CHART_INTELLIGENCE_MASTER_SPEC`  
**نسخه:** `1.38.1`  
**تاریخ آخرین بازبینی:** `2026-11-13`  
**وضعیت:** سند مرجع محصول و قراردادهای فنی پروژه — هسته فاز ۱ و بخش هسته‌ای فاز ۲ در کد مستقر شده است؛ وضعیت دقیق کد، نواقص باز و بک‌لاگ باقی‌مانده در [`OPEN_ISSUES.md`](../03-roadmap-and-issues/OPEN_ISSUES.md) و [`ROADMAP_BACKLOG.md`](../03-roadmap-and-issues/ROADMAP_BACKLOG.md) نگهداری می‌شوند.  
**زبان سند:** فارسی؛ نام فنی اجزا و شناسه‌ها به انگلیسی

---

# ۰. هدف و حاکمیت این سند

این فایل تنها مرجع اصلی تصمیم‌ها، الزامات محصول، مدل داده، فرمول‌های مرجع و قراردادهای پیش‌بینی پروژه **Chart Intelligence** است.

## ۰.۱ قانون به‌روزرسانی خودکار و درجا (`In-Place Update`)
1. **تطبیق واقعی با کد (`Truth Over Checkboxes`):** هیچ قابلیت برنامه‌ریزی‌شده یا نیمه‌کاره‌ای نباید به‌عنوان قابلیت پیاده‌شده یا `100% VERIFIED` ثبت شود.
2. **ویرایش مستقیم در جایگاه اصلی (بدون وصله‌پینه در انتهای فایل):** هر تصمیم جدید جایگزین متن قبلی در همان بخش می‌شود و ارجاعات وابسته در کل پوشه `docs/` هم‌زمان اصلاح می‌گردند.
3. **قالب وضعیت تصمیم‌ها:** `DECIDED` (تصمیم قطعی)، `PROPOSED` (پیشنهاد)، `TO VERIFY` (نیازمند آزمایش عملی)، `OPEN` (نیازمند تصمیم)، `SUPERSEDED` (منسوخ). فقط موارد `DECIDED` الزام قطعی طراحی هستند.

---

# ۱. تعریف محصول و هدف اصلی

## ۱.۱ چشم‌انداز
Chart Intelligence یک **موتور مستقل تحلیل و پیش‌بینی نمودارهای مالی** است. ارزش اصلی محصول، یادگیری رفتار تاریخی هر نمودار و پیش‌بینی قابل‌اندازه‌گیری حرکت آینده همان نمودار است.

**هسته عملیاتی چرخه پیش‌بینی (قطعی — برای هر `chart_id` مستقل):**
1. تثبیت و ثبت منبع داده مجاز برای همان نمودار.
2. دریافت کندل‌های بسته‌شده جدید و پرکردن Gap از همان منبع ثبت‌شده (`DB-First Delta Sync`).
3. تحلیل وضعیت فعلی و صدور پیش‌بینی تغییرناپذیر (`Immutable`) برای افق‌های تعریف‌شده.
4. پس از پایان افق پیش‌بینی: مقایسه خروجی با داده واقعی، محاسبه خطا و ثبت `Outcome`.
5. به‌روزرسانی کنترل‌شده مدل/قواعد همان نمودار (`Champion/Challenger` + `Walk-Forward`) برای بهبود تدریجی پیش‌بینی‌های بعدی.

## ۱.۲ مدل توسعه ۶ فازی (`Build-Test-Approve Gate` — `DECIDED`)
توسعه به **۶ فاز مستقل، قابل بیلد و قابل تست عملی** تقسیم شده است (جزئیات تحویل‌شده و باقی‌مانده در [`ROADMAP_BACKLOG.md`](../03-roadmap-and-issues/ROADMAP_BACKLOG.md)):
1. **فاز ۱ — اسکلت دوزبانه (`fa`/`en`)، ورود شخصی، واچ‌لیست ۲۲ نماد / ۷ منبع و `Chart View` چندتب:** بیلدشده روی وب و اندروید.
2. **فاز ۲ — اندیکاتورها، ساختار بازار `SMC/VRVP` و ابزارهای هندسی/فاندامنتال:** تایم‌فریم `M30` و ۱۲ اندیکاتور/ساختار اصلی پیاده شده‌اند؛ ابزارهای ترسیم پیشرفته (`Harmonic`, `Gann`, `Pitchfork`, `Cycle`, `AVWAP/FRVP`)، ۱۰ اندیکاتور تکمیلی و فیدهای زنده بنیادی هنوز در بک‌لاگ فاز ۲ هستند.
3. **فاز ۳ — تشخیص هوشمند Gap، ورود فایل‌های تاریخی (`EIA 1987` / `CSV`) و `Backup/Restore` رمزنگاری‌شده.**
4. **فاز ۴ — موتور تحلیل ساختار و پیش‌بینی نسخه اول (`Prediction Engine v1`: `Kronos` + `SMC Fib-FVG-BOS` با `forecast-contract/v1` و `SHA-256 Hash Chain`).**
5. **فاز ۵ — حلقه بازخورد زنده (`Live Feedback Loop`), `Outcome & Learning Evaluator`, `Walk-Forward` و `Champion/Challenger + Rollback`.**
6. **فاز ۶ — شبیه‌ساز مستقل استراتژی معاملاتی ([`TRADING_STRATEGY_SPEC.md`](./TRADING_STRATEGY_SPEC.md)) و پنل مدیریت چندکاربره.**

## ۱.۳ نمودار، واحد اصلی محصول و استقلال کامل سری‌ها (`DECIDED`)
واحد بنیادی سیستم **Chart / Chart Series** است، نه نام کالا یا بازار به‌تنهایی. هر نمودار یک موجودیت مستقل با شناسه پایدار `chart_id` است (`SPOTBRENT` از Pepperstone، `Brent CFD` از Dukascopy، `Brent Futures BZ=F`، `EIA RBRTEd Spot FOB`، `XAUUSD` و هر نماد سفارشی دیگر).
- دو منبع متفاوت از یک دارایی دو نمودار مستقل با قیمت‌های متفاوت‌اند و ادغام خاموش داده بین آن‌ها ممنوع است.
- هر نمودار تاریخچه، کندل، تقویم، تحلیل، Feature، مدل/وزن، پیش‌بینی، Outcome و Evaluation مستقل دارد.
- کد، الگوریتم‌ها و Pipeline مشترک‌اند؛ داده و وزن‌های آموزش‌دیده هر نمودار جدا می‌مانند.

## ۱.۴ تفکیک پیش‌بینی از معامله‌گری و قید دسترسی (`DECIDED`)
**Prediction Engine** فقط جهت و محدوده احتمالی آینده نمودار را تحلیل می‌کند و در نسخه اول هیچ دستور معامله (`Buy/Sell`, `Entry`, `Stop Loss`, `Take Profit`, `Position Size`, `Trade/No Trade`) تولید نمی‌کند.
- **قید دسترسی (قطعی):** هیچ Broker Account Connector، دریافت موجودی/سفارش کاربر یا Trading API در معماری محصول مجاز نیست.
- شبیه‌سازی استراتژی صرفاً آفلاین و با سرمایه فرضی متعلق به فاز ۶ ([`TRADING_STRATEGY_SPEC.md`](./TRADING_STRATEGY_SPEC.md)) است.

## ۱.۵ اصل عدم بازسازی غیرضروری
ابتدا کتابخانه‌ها و استانداردهای معتبر متن‌باز بررسی می‌شوند (`TradingView Lightweight Charts`, `TA-Lib`, ...) و فقط لایه اتصال، کنترل کیفیت و منطق اختصاصی پروژه پیاده می‌شود؛ ورود کد بدون بررسی مجوز و امنیت ممنوع است.

---

# ۲. هویت باز نمودارها و کاتالوگ

## ۲.۱ کاتالوگ باز نمودارها و متادیتای `Chart Registry`
کاتالوگ محصول باز است؛ کاتالوگ پیش‌فرض شامل ۲۲ نماد استاندارد در ۶ دسته (`ENERGY`, `METALS`, `FX`, `CRYPTO`, `INDICES`, `STOCKS`) است (جدول کامل در [`ARCHITECTURE.md`](../02-architecture/ARCHITECTURE.md) بخش ۳.۳) و کاربر از `Settings` می‌تواند نماد سفارشی اضافه کند.

هر نمودار در Chart Registry حداقل شامل این metadata است:
- `chart_id` یکتا و پایدار، نام نمایشی و کد نماد
- کلاس دارایی و نوع ابزار (`Spot`, `CFD`, `Futures`, `Equity`, `Crypto`, `Index`)
- `Provider`، `provider_symbol`، مبنای قیمت (`Bid / Ask / Mid / Last / Spot_FOB / Unknown`)
- ارز مظنه، `precision`، `timezone`، تقویم معاملاتی / سشن و تایم‌فریم‌های پشتیبانی‌شده

## ۲.۲ نقطه شروع و جریان کاربری (`Watchlist-First UX`)
1. برنامه پس از احراز هویت شخصی (`Remember Me`) وارد **Watchlist** می‌شود (رسم خودکار بدون انتخاب کاربر انجام نمی‌شود).
2. در **Settings** (منحصراً آنجا)، کاربر زبان (`fa`/`en`)، تم (`Dark`/`Light`)، کلیدهای `BYOK` و منبع دریافت داده هر نماد را تعیین می‌کند.
3. در **Chart View** تب‌های باز موازی (`Multi-Tab Workspace`) با نوار کنترل فشرده باز می‌شوند و نام منبع داده به‌صورت Read-Only در هدر کنار نام نماد نمایش داده می‌شود.

---

# ۳. پلتفرم، معماری کلان و ۱۴ استاندارد مهندسی

## ۳.۱ پلتفرم‌های هدف و سیاست استقرار (`DECIDED`)
- **اندروید (APK نیتیو با Kotlin / Jetpack Compose):** امضای ثابت `CANONICAL_B64` (اثر انگشت `SHA1: 38:C6:57:E4:12:4A:90:85:94:BA:0C:B3:C2:A3:A9:F8:F5:3B:E1:6B`) و افزایش خودکار `versionCode` در `.github/workflows/build-apk.yml` تا آپدیت بدون حذف نسخه قبل نصب شود.
- **وب ریسپانسیو (`https://chart.manico.es`):** Native ES6 Modules بدون باندلر و PHP REST API روی Shared Hosting (cPanel).
- **حذف نسخه دسکتاپ/ویندوز:** کاملاً خارج از دامنه محصول.
- **سیاست استقرار کنترل‌شده:** اجرای تست‌ها پیش از استقرار، مایگریشن‌های غیرمخرب روی MariaDB و حفظ مسیر **Rollback** (نیازمند تست عملی: ردیف `INF-02` در `OPEN_ISSUES.md`).

## ۳.۲ فناوری‌های کلان (`Modular Monolith`)

| لایه | فناوری | وضعیت |
|---|---|---|
| اپلیکیشن موبایل | Android (Kotlin / Jetpack Compose + Coordinators) | `DECIDED / IN CODE` |
| رابط کاربری وب | Modular Vanilla JS (ES6+) + Canvas / Lightweight Charts patterns | `DECIDED / IN CODE` |
| Backend API | PHP REST API روی `chart.manico.es/api/v1/` | `DECIDED / VERIFIED` |
| دیتابیس عملیاتی | MariaDB `10.6.28` روی هاست cPanel | `DECIDED / VERIFIED` |
| آموزش و تحلیل سنگین آینده | Python Worker مستقل + `TA-Lib` (`DuckDB` / `MotherDuck` / `ONNX` صرفاً پس از POC) | `TO VERIFY` |

## ۳.۳ ۱۴ اصل پایه مهندسی نرم‌افزار (`DECIDED`)
1. **دوزبانه کامل (`fa`/`en`) بدون Hardcode:** کلیدهای معنایی در `values/strings.xml`, `values-fa/strings.xml`, `i18n/en.json`, `i18n/fa.json`؛ تغییر آنی زبان/جهت (`RTL`/`LTR`)؛ ارقام مالی و ساعت همیشه `JetBrains Mono` و `LTR`.
2. **توکن‌های متمرکز تم (`Theme.kt` و `theme.css`):** ممنوعیت هگزادسیمال پراکنده در کامپوننت‌ها؛ پالت استاندارد TradingView (`#131722` / `#26A69A` / `#EF5350`).
3. **پیکربندی متمرکز (`AppConfig` / `store.js`)**: آدرس پایه API، تایم‌فریم‌ها و مقادیر پیش‌فرض در محل واحد.
4. **معماری مویرگی (`File-Per-Component / File-Per-Algorithm`):** تفکیک صفحات، آداپتورهای `providers/`، الگوریتم‌های خالص `algorithms/` و هماهنگ‌کننده‌های `ui/state/coordinators/`.
5. **قرارداد یکپارچه پاسخ و خطای API:** ساختار JSON استاندارد (`ApiEnvelope.php`) شامل `{ "ok", "data", "error_code", "message_key", "meta": { "server_time_utc" } }` با پیام بومی‌سازی‌شده در کلاینت.
6. **زمان `UTC` و دقت `DECIMAL(18,8)`:** ذخیره و مبادله به `UTC`؛ استفاده از `FLOAT`/`DOUBLE` برای قیمت در دیتابیس ممنوع است.
7. **وضعیت‌های صریح UI و بازار:** مدیریت تمیز `Loading`, `Empty`, `Success`, `Error+Retry`, `Offline` و برچسب صادقانه `Live / Market Closed / Cached / Sync Error / API Key Required`.
8. **پایداری تنظیمات کاربر + `Reset to Defaults`:** نگهداری تغییرات رنگ، ضخامت خط، اندیکاتورها و تب‌های باز در کش محلی + کلود (`workspace_sync.php`) تا زمانی که دکمه صریح بازنشانی فشرده شود.
9. **تست‌پذیری و دسترس‌پذیری:** `Modifier.testTag` با الگوی `snake_case`، حداقل لمس `48×48dp` و `contentDescription` دوزبانه.
10. **مهاجرت دیتابیس غیرمخرب (`IF NOT EXISTS`):** هرگز داده‌های تاریخی موجود کندل‌ها حذف یا بازنویسی مخرب نشوند.
11. **معماری سه‌لایه عدم هاردکد (`Zero Hardcoding`):** پارامترهای الگوریتم (تا ۵۰۰۰ کندل، گام زوم، تلرانس لمس)، پالت رنگ و کاتالوگ نمادها همگی قابل تنظیم در `Settings`.
12. **ارگونومی TradingView Pro و تفکیک فرم‌فکتور:** ۸۵–۹۰٪ فضای چارت، رعایت `statusBarsPadding` و `prefers-reduced-motion`، ثبات اسکرول لیست‌ها و تفکیک کلاس دارایی در جزئیات نماد.
13. **الگوریتم‌های خالص و محورهای ریاضی:** محور قیمت اعداد رند `Heckbert`، محور افقی هوشمند زمان، و محاسبات مستقیم بدون داده ساختگی.
14. **ساختار مستندات استاندارد (`docs/`):** فقط `README.md` در ریشه مخزن و کل مستندات دسته‌بندی‌شده در `docs/01..04/`.

## ۳.۴ مدل اجرا و گزینه‌های بررسی میزبانی پردازش (`TO VERIFY`)
- **اصل تفکیک محل اجرا:** PHP REST API و MariaDB روی Shared Hosting فعلی (`chart.manico.es`) باقی می‌مانند تا زمانی که محدودیتی اثبات شود؛ مرورگر و اپلیکیشن اندروید هرگز مستقیماً به MariaDB یا DuckDB متصل نمی‌شوند.
- **گزینه‌های Worker پایتون برای فازهای ۴/۵ (صرفاً Shortlist تحقیق؛ نیازمند مقایسه هزینه، CPU/RAM، Native `TA-Lib` و پایداری):**
  - `Railway` (کانتینر Persistent برای WS یا Cron کوتاه؛ هشدار هم‌پوشانی Cron).
  - `Render` (Background Worker / Private Service / Persistent Disk محدود به یک Instance).
  - `Fly.io` (Machineهای مستقل + Volume محلی).
  - `Cloudflare Pages/Workers` (مناسب لبه/Frontend؛ برای Python با `Pyodide` و وابستگی‌های C مثل `TA-Lib` و `DuckDB` مناسب پردازش سنگین نیست).
  - `MotherDuck` (گزینه مدیریت‌شده DuckDB در صورت اثبات نیاز در POC).

---

# ۴. تایم‌فریم‌ها، لنگر زمانی و زمان‌بندی داده

- **تایم‌فریم‌های مجاز:** `M15` (حداقل), `M30`, `H1`, `H4`, `D1`, `W1`. تحلیل زیر `M15` در دامنه محصول نیست.
- **لنگر استاندارد زمان (`00:00:00 UTC` — `DECIDED`):**
  - `M15`: دقیقه‌های `:00, :15, :30, :45 UTC` · `M30`: `:00, :30 UTC` · `H1`: ابتدای هر ساعت `UTC` · `H4`: بلوک‌های `00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC` · `D1`: روز معاملاتی `UTC` (یا تاریخ رسمی `YYYY-MM-DD` برای EIA) · `W1`: دوشنبه `UTC`.
  - *(موضوع باز `ENG-01`: تطبیق تجمیع `H4`/`D1` بازار سهام آمریکا با ساعت بازگشایی سشن `09:30 NY` و DST در `OPEN_ISSUES.md` ثبت شده است.)*
- **همگام‌سازی دوقطبی:** به‌روزرسانی دستی (`On-Demand Sync`) + زمان‌بند دوره‌ای (`cPanel Cron` یا پشتیبان `schedule` ۱۵ دقیقه‌ای) با اجرای Idempotent روی کلید یکتای دیتابیس. کندل باز (`is_closed = 0`) وارد آموزش یا ارزیابی قطعی نمی‌شود.

---

# ۵. ورودی داده و سیاست قطعی تصاویر نمودار (`DECIDED`)

- **روش‌های ورودی مجاز:** API، فایل‌های CSV/Excel/JSON، SQLite، ورود دستی OHLC، و استخراج عددی از تصویر نمودار (برای ابزارهایی فاقد API مانند Revolut CFD).
- **سیاست قطعی بدون ذخیره تصویر (`Strict No-Image-Storage Policy`):**
  - **هیچ تصویر نموداری در دیتابیس یا فایل‌سیستم سرور ذخیره نمی‌شود.**
  - تصویر فقط موقتاً سمت کلاینت/پردازش موقت برای استخراج اعداد استفاده و بلافاصله حذف می‌شود؛ فقط اعداد با برچسب کیفیت (`Verified`, `Estimated`, `Uncertain`, `Rejected`) و metadata منبع ذخیره می‌شوند.
  - داده `Estimated`/`Uncertain` بدون تأیید وارد آموزش یا ارزیابی رسمی مدل نمی‌شود و جعل OHLC از قیمت لحظه‌ای ممنوع است.

---

# ۶. منابع داده بازار، سیاست هزینه و `EIA 1987`

## ۶.۱ اصول انتخاب Provider و `BYOK` (`DECIDED`)
- محصول به هیچ اشتراک پولی TradingView یا API پولی مرکزی وابسته نیست.
- **ممنوعیت Fallback پنهان:** قطع یا محدودیت یک منبع فقط نمودارهای متصل به همان منبع را متأثر می‌کند و داده‌های منبع دیگر بی‌صدا جایگزین نمی‌شوند.
- **BYOK (Bring Your Own Key):** کاربر می‌تواند به‌صورت اختیاری کلید API شخصی خود را اضافه کند؛ کلیدهای شخصی از سایر کاربران و از خروجی عمومی `workspace_sync` کاملاً جدا نگه داشته می‌شوند و با هدر `X-Provider-Api-Key` ارسال می‌گردند.
- **۷ آداپتور مستقرشده در کد فعلی:** `tvdatafeed`, `biquote`, `twelve_data`, `dukascopy`, `yahoo_finance`, `stooq`, `eia_brent_spot` (جزئیات هر آداپتور و کاتالوگ ۲۲ نماد در [`ARCHITECTURE.md`](../02-architecture/ARCHITECTURE.md)).

## ۶.۲ مرجع رسمی تاریخی برنت اسپات: `EIA Europe Brent Spot Price FOB` (`DECIDED`)
- **کد سری:** `RBRTEd` · **بازه تاریخی:** ۲۰ مه `1987` تا امروز (`D1`, واحد: `USD per Barrel`، نوع: `Spot FOB`).
- **مسیر رسمی:** `https://www.eia.gov/dnav/pet/hist_xls/RBRTEd.xls` (و جایگزین آرشیو CSV: DataHub `brent-daily.csv`).
- **ممنوعیت جعل اینترادی:** ساخت کندل‌های مصنوعی ۱۵ دقیقه‌ای از داده روزانه `EIA` اکیداً ممنوع است؛ و اختلاف طبیعی میان `Spot FOB` (EIA)، `CFD` (Pepperstone/Dukascopy) و `Futures` (`BZ=F`) به‌عنوان ویژگی سری مستقل ثبت می‌شود.

## ۶.۳ مشاهدات پایه POC داده و سیاست پشتیبان‌گیری
- در POC ثبت‌شده: Dukascopy داده نوع Bid برمی‌گرداند؛ پیوستگی تاریخچه طولانی‌مدت در برابر تقویم رسمی هر صرافی/کارگزار هنوز نیازمند آزمون کامل Gap است (`ENG-03` / §17.4).
- **ریسک بکاپ هاست (`INF-01`):** به دلیل وضعیت `jetbackup5d: down` در هاست، طراحی Backup رمزنگاری‌شده سطح برنامه و نگهداری نسخه مستقل خارج از هاست (از جمله فضای شخصی یا Google Drive API با scope `drive.file`) در فاز ۳ الزامی است (`RPO/RTO` و نتیجه Restore هنوز باز هستند).

---

# ۷. خط لوله کیفیت داده (`Data Pipeline`)

فیلدهای استاندارد هر رکورد کندل شامل `chart_id`, `provider_id`, `provider_symbol`, `timeframe`, `open_time_utc`, `close_time_utc`, `OHLC`, `volume`, `volume_type` (`tick/real/none`), `is_closed`, `quality_status` (`VERIFIED/ESTIMATED/GAP_FILLED/SUSPECT`), `price_basis`, `source_timestamp`, `received_at`, `import_batch_id` است.

قواعد کنترل کیفیت: تشخیص کندل تکراری و گمشده، اعتبار رابطه OHLC، تراز `UTC`، تشخیص Outlier و تفکیک تعطیلی بازار از نقص واقعی. داده‌های اصلاح‌شده باید lineage خود را حفظ کنند تا رکوردی که قبلاً مبنای یک پیش‌بینی بوده بی‌ردپا بازنویسی نشود.

---

# ۸. دیتابیس MariaDB و جداول هسته (`001_phase1_init.sql`)

- **زیرساخت تاییدشده:** `Apache 2.4.69` + `MariaDB 10.6.28` روی Shared Hosting cPanel (موارد تاییدنشده PHP/Cron/SSH در [`INFRASTRUCTURE_INVENTORY.md`](../02-architecture/INFRASTRUCTURE_INVENTORY.md) بخش ۵ و [`OPEN_ISSUES.md`](../03-roadmap-and-issues/OPEN_ISSUES.md) بخش ۴.۱).
- **قواعد طراحی:** MariaDB منبع حقیقت عملیاتی (`Source of Truth`) است؛ `DuckDB` تا زمان اثبات POC صرفاً ابزار تحلیلی است. قیمت‌ها `DECIMAL(18,8)` و زمان‌ها `UTC` هستند.

### جداول هسته فاز ۱ (`IF NOT EXISTS`)
1. `schema_migrations` (`version`, `description`, `applied_at_utc`)
2. `users` (`id`, `username`, `password_hash`, `role: owner/user`, `preferred_lang`, `preferred_theme`, `is_active`, `created_at_utc`)
3. `api_tokens` (`id`, `user_id`, `token_hash`, `device_label`, `expires_at_utc`, `created_at_utc`)
4. `market_sources` (`source_id`, `display_name_en`, `display_name_fa`, `source_type`, `requires_api_key`, `supported_timeframes_json`, `status_code`)
5. `charts` (`chart_id`, `symbol_code`, `display_name_en`, `display_name_fa`, `asset_class`, `instrument_type`, `default_source_id`, `price_basis`, `quote_currency`, `price_precision`, `is_active`)
6. `chart_data_sources` (`chart_id`, `source_id`, `provider_symbol`, `price_basis`, `status_code`, `last_success_utc`, `last_error_code`)
7. `user_watchlist` (`user_id`, `chart_id`, `selected_source_id`, `default_timeframe`, `sort_order`, `last_sync_utc`)
8. `candles` (`id`, `chart_id`, `source_id/provider_id`, `timeframe`, `open_time_utc`, `close_time_utc`, `open/high/low/close DECIMAL(18,8)`, `volume`, `volume_type`, `is_closed`, `quality_status`, با کلید یکتای **`UNIQUE(chart_id, provider_id, timeframe, open_time_utc)`**)

*جداول برنامه‌ریزی‌شده فازهای ۲ تا ۶:* `user_workspace`, `user_sessions`, `data_import_batches`, `data_quality_reports`, `data_corrections`, `indicator_definitions`, `indicator_values`, `user_provider_credentials`, `prediction_runs`, `prediction_forecasts`, `prediction_scenarios`, `prediction_outcomes`, `prediction_evaluations`, `prediction_models`, `model_versions`, `model_evaluations`, `model_deployments`, `backup_records`, `audit_logs`, و جداول استراتژی فاز ۶ (`strategy_definitions`, `strategy_backtests`, `simulated_orders`, `simulated_trades`, `portfolio_snapshots`, `performance_metrics`).

---

# ۹. Backend، API و امنیت اسرار

- **مسیر پایه REST:** `https://chart.manico.es/api/v1/` با احراز هویت توکنی (`auth.php`)، همگام‌سازی محیط کاری (`workspace_sync.php`)، همگام‌سازی کندل‌ها (`candles_sync.php`) و وضعیت سلامت (`status.php`, `system/status.php`).
- **سیاست اسرار (`GitHub Repository Secrets`):** هر ۸ متغیر (`CPANEL_API_TOKEN`, `CPANEL_DOCROOT`, `CPANEL_HOST`, `CPANEL_USERNAME`, `DB_NAME`, `DB_PASSWORD`, `DB_USER`, `TWELVE_DATA_API_KEY`) در **GitHub Repository Secrets** نگهداری و در زمان استقرار به پیکربندی خارج از دسترس عمومی تزریق می‌شوند. هیچ مقدار واقعی نباید وارد مخزن، لاگ یا خروجی API شود (جزئیات بیشتر در [`SECURITY.md`](../02-architecture/SECURITY.md)).

---

# ۱۰. موتور پیش‌بینی (`Prediction Engine` — فاز ۴ و ۵)

## ۱۰.۱ مأموریت و تفکیک `Timeframe` از `Forecast Horizon`
- `Prediction Engine` برای هر `chart_id` مستقل اجرا می‌شود و شروع آن مشروط به عبور از `Data Readiness Gate` است (در نبود داده معتبر وضعیت `DATA_NOT_READY` صادر می‌شود).
- `Timeframe` (بازه تشکیل کندل: `M15`, `M30`, `H1`, `H4`, `D1`) از `Forecast Horizon` (افق پیش‌بینی آینده: `15m`, `1h`, `4h`, `1d`) مجزاست و افق‌ها از تقویم معاملاتی همان دارایی پیروی می‌کنند.

## ۱۰.۲ قرارداد خروجی پیش‌بینی (`forecast-contract/v1`)
نسخه اول قرارداد شامل این فیلدهای الزامی است و **فاقد هرگونه فیلد معامله‌گری (`Entry/SL/TP/Buy/Sell`)** است:
- شناسه‌ها: `contract_version` (`forecast-contract/v1`), `forecast_id`, `schema_created_at`, `chart_id`, `series_identity`, `timeframe`, `forecast_horizon`
- زمان‌بندی `UTC`: `issued_at_server`, `input_cutoff_at`, `last_closed_candle_at`, `target_end_at`
- نسب داده و مدل: `source_snapshot_id`, `data_quality_status`, `source_id`, `model_id`, `model_version`, `feature_schema_version`, `inference_runtime_version`
- خروجی آماری: `trend_state`, `direction` و احتمال‌های `[0,1]` با مجموع `1.0` (`p_bullish + p_bearish + p_neutral`)، `point_estimate`, بازه Quantile (`q10`..`q90`) و در صورت پشتیبانی `predicted_high` / `predicted_low`
- اعتبارسنجی: `uncertainty`, `calibration_reference` (یا `NOT_CALIBRATED`), `quality_flags`, `forecast_status` (`VALID`, `PROVISIONAL`, `REJECTED`, `EXPIRED`, `INVALID`).

## ۱۰.۳ پایپ‌لاین ۳ مرحله‌ای و `Kronos + SMC Fib-FVG-BOS`
1. **گام ۱ (موازی):** `DataReadinessMonitor` (سلامت داده، نبود Gap باز) + `TechnicalStructureAnalyzer` (روند، `BOS/CHoCH`, `FVG`, فیبوناچی اصلاحی `$0.618 / $0.786` و اکستنشن `$1.272 / $1.414 / $1.618`, اندیکاتورها).
2. **گام ۲ (`Uncertainty & Volatility Specialist`):** سنجش دامنه `ATR 14` و بازه عدم‌قطعیت (`q10..q90`) همراه با خروجی کاندیدای `Kronos Foundation Model` (فاین‌تیون مستقل برای هر `chart_id`) پس از POC.
3. **گام ۳ (`Immutable Prediction Generator`):** ترکیب گام ۱ و ۲ و ثبت سروری تغییرناپذیر طبق `forecast-contract/v1`.

## ۱۰.۴ Baselineها، روند خنثی، پایش افت و `Adaptive Governance`
- **Baselineهای اجباری مقایسه:** `Persistence` (قیمت پایان افق = آخرین Close)، `Previous Direction`، `SMA` با پارامتر از پیش ثبت‌شده.
- **روند خنثی:** حرکت کمتر از ضریبی از `ATR` (مقدار دقیق ضریب و دوره در POC مشخص می‌شود — `OPEN`).
- **حاکمیت مدل (`Champion / Challenger`):**
  - `Champion`: مدل جاری Production · `Challenger`: نسخه آزمایشی جدید.
  - `Promotion Gate`: عبور از مقایسه آماری با Champion و Baseline + Calibration پایدار در چند پنجره.
  - `Change Budget` و `Freeze Conditions`: توقف آموزش/ارتقا در وضعیت `GAP_OPEN` یا `SOURCE_DEGRADED`؛ امکان `Rollback` فوری به نسخه قبلی Champion؛ ثبت کامل `Audit Trail`.

## ۱۰.۵ تمایز بنیادین: ترسیم ادامه نمودار در برابر پیش‌بینی آینده واقعی و سنجش عدم‌قطعیت
یک تمایز بسیار حیاتی در مهندسی بازارهای مالی وجود دارد:
**ترسیم ادامه احتمالی نمودار با پیش‌بینی آینده واقعی نمودار یکسان نیست.**
- چیزی که برای پروژه **CHART** اهمیت دارد، صرفاً وصل‌کردن چند نقطه، محاسبه درون‌یابی و کشیدن یک منحنی نرم و زیبا نیست.
- هدف، ساخت سامانه‌ای علمی و داده‌محور است که با مشاهده رفتار گذشته قیمت و استخراج ساختار بازار، **مسیرهای احتمالی آینده را برآورد کند و عدم‌قطعیت آن‌ها (`Uncertainty Quantification`) را با بازه‌های احتمالاتی و چند سناریوی موازی نمایش دهد**.

## ۱۰.۶ دسته‌بندی روش‌های ریاضی، آماری و یادگیری عمیق پیشین

### الف) روش‌های ریاضی و آمار کلاسیک
| روش | کاری که انجام می‌دهد | کاربرد اصلی | ارزیابی در بازارهای مالی |
|---|---|---|---|
| **Polynomial Extrapolation** | ادامه‌دادن منحنی با تابع چندجمله‌ای درجه $n$ | تخمین مسیر آینده بر اساس هندسه نقاط اخیر | به‌شدت حساس به نویز؛ مستعد انفجار مقادیر در درجات بالا (`Runge's phenomenon`). صرفاً خط مبنای هندسی. |
| **Spline Interpolation** | ساخت منحنی فوق‌العاده نرم (Cubic/B-Spline) بین نقاط | بازسازی شکل نمودار و فیلتر بصری | **عمدتاً برای درون‌یابی و بازسازی بین نقاط است، نه پیش‌بینی آینده.** امتداد اسپلاین آینده اعتباری ندارد. |
| **Linear / Nonlinear Regression** | تخمین شیب و روند جاری و امتداد خطی یا درجه ۲ آن | پیش‌بینی روند کلی و کانال‌های رگرسیونی | پایدار و مقاوم در برابر بیش‌برازش؛ اما قادر به پیش‌بینی چرخش‌ها (`Reversals`) نیست. |
| **ARIMA / SARIMA / SARIMAX** | مدل‌های خودهمبسته و میانگین متحرک یکپارچه با مؤلفه فصلی | پیش‌بینی مقادیر آینده سری زمانی بر پایه ایستایی | استاندارد کلاسیک اقتصادسنجی؛ نیازمند ایستایی (`Stationarity`) و بازدهی نسبتاً ضعیف در تایم‌فریم‌های فرکانس بالا. |
| **State-Space & Kalman Filter** | تخمین وضعیت پنهان سیستم از مشاهدات دارای نویز به‌صورت بازگشتی | فیلتر نویز، دنبال‌کردن تکانه و برآورد گام بعدی | بسیار قوی برای فیلتر نویز آنی و ره‌گیری رژیم؛ در ترکیب با مدل‌های دیگر ارزش افزوده بالایی دارد. |
| **Gaussian Process Regression (GPR)** | مدل ناپارامتری با برآورد توزیع احتمالاتی توابع بر پایه کرنشل‌ها | پیش‌بینی منحنی همراه با بازه عدم‌قطعیت پیوسته | مدل‌سازی طبیعی عدم‌قطعیت؛ اما هزینه محاسباتی بالا $O(N^3)$ در سری‌های زمانی طولانی. |

> **نکته تحلیلی:** امتداد یک فرمول صرفاً ریاضی لزوماً به معنی کشف رفتار آینده بازار نیست؛ قیمت حاصل برهم‌کنش سفارش‌های بازیگران، نقدینگی و سشن‌های معاملاتی است نه یک تابع پیوسته فیزیکی.

### ب) روش‌های هوش مصنوعی، یادگیری عمیق و مدل‌های پایه (AI / Deep Learning)
1. **شبکه‌های عصبی تخصصی سری زمانی:**
   - **N-BEATS (Neural Basis Expansion Analysis for Interpretable Time Series):** ساختار عمیق بلوک‌های پیش‌خور با حلقه‌های Forward/Backward Residual و تجزیه تفسیرپذیر سیگنال به مؤلفه‌های روند (`Trend`) و چرخه‌ای/فصلی (`Seasonality`).
   - **N-HiTS (Neural Hierarchical Interpolation for Time Series):** تعمیم سلسله‌مراتبی چندمقیاسی N-BEATS با نرخ‌های نمونه‌برداری چندگانه که سرعت آموزش را تا چند برابر افزایش داده و برای افق‌های بلندمدت بسیار دقیق‌تر عمل می‌کند.
2. **شبکه‌های بازگشتی و ترنسفورمرها:**
   - **LSTM / GRU:** یادگیری حافظه کوتاه‌مدت و بلندمدت و وابستگی‌های زمانی متوالی در بازه‌های گذشته.
   - **ترنسفورمرهای سری زمانی (`PatchTST`, `Autoformer`, `Informer`):** یادگیری روابط سراسری پیچیده بین بخش‌های مختلف تاریخچه با مکانیزم توجه (`Attention`) و پچ‌بندی داده‌ها.
3. **مدل‌های پایه سری زمانی (`Time Series Foundation Models`):**
   مدل‌های عظیم ازپیش‌آموزش‌دیده بر روی صدها میلیارد نقطه داده زمانی که قابلیت پیش‌بینی **Zero-Shot** (بدون نیاز به آموزش اختصاصی مجدد روی هر نماد جدید) دارند:
   - **Google TimesFM (`Time Series Foundation Model`):** توسعه‌یافته توسط Google Research با ساختار Decoder-only ترنسفورمر برای استنباط بلادرنگ با طول ورودی و افق متغیر.
   - **Amazon Chronos (`Language Modeling Approaches to Time Series Forecasting`):** توسعه‌یافته توسط Amazon Science با توکنیزه‌کردن مقادیر عددی سری زمانی و استفاده از مدل‌های زبانی پایه برای پیش‌بینی توزیع احتمالاتی آینده.

---

## ۱۰.۷ پروژه‌ها و مخازن مرجع GitHub برای بررسی فنی و پیاده‌سازی

> **سند مشخصات تفصیلی:** جزئیات کامل معماری، فرمول‌ها، بازسازی قیمت و متدولوژی در سند اختصاصی [**`FUTURE_PRICE_PROJECTION_ENGINE_SPEC.md`**](./FUTURE_PRICE_PROJECTION_ENGINE_SPEC.md) تدوین و تصویب شده است.

مخازن متن‌باز برجسته برای ارزیابی معماری و الگوبرداری فنی در پایپ‌لاین CHART:

| # | پروژه و مخزن GitHub | سطح اولویت | تمرکز و ارزش فنی برای CHART |
|---|---|---|---|
| ۱ | **[amazon-science/chronos-forecasting](https://github.com/amazon-science/chronos-forecasting)** | **اولویت اول آزمایش (P1)** | مدل پایه احتمالاتی **Chronos-2** با مجوز آزاد **Apache 2.0**؛ کانتکست ۸۱۹۲ کندل و افق ۱۰۲۴ گام، پشتیبانی از متغیرهای کمکی و استنباط بدون محدودیت تجاری. |
| ۲ | **[google-research/timesfm](https://github.com/google-research/timesfm)** | **تحقیق و مقایسه (P1)** | مدل پایه سری زمانی گوگل (**نسخه ۲.۵ با ۲۰۰M پارامتر** و Quantile Head). *توجه: نسخه ۳.۰ گوگل دارای مجوز غیرتجاری است و ورود آن به پروداکشن تجاری ممنوع است.* |
| ۳ | **[Nixtla/neuralforecast](https://github.com/Nixtla/neuralforecast)** | **اولویت اول مدل اختصاصی (P1)** | مجموعه‌ای جامع از بیش از ۳۰ مدل پیش‌بینی عصبی از جمله **N-BEATS و N-HiTS** با پشتیبانی بومی از پیش‌بینی احتمالاتی و بازه‌های Quantile Loss. |
| ۴ | **[NolanCassidy/timesfm-stock-chart-forecasting](https://github.com/NolanCassidy/timesfm-stock-chart-forecasting)** | **کاربرد مستقیم چارت (P1)** | پیش‌بینی مستقیم نمودار سهام با TimesFM و رسم ادامه آینده به‌صورت کندل‌های OHLCV و اندیکاتورها روی چارت. |
| ۵ | **[thuml/Time-Series-Library](https://github.com/thuml/Time-Series-Library)** | **بنچمارک تحقیقاتی (P2)** | کتابخانه پیشرفته ترنسفورمرهای مدرن سری زمانی (**PatchTST, iTransformer, TimesNet**). |
| ۶ | **[sktime/sktime](https://github.com/sktime/sktime)** | **جعبه‌ابزار مرجع (P2)** | فریم‌ورک پایتون با ۱۰k+ ستاره شامل ARIMA، Prophet، Polynomial Trend Forecaster، Ensemble و ابزارهای Walk-forward. |
| ۷ | **[forge-veil/forecast-web](https://github.com/forge-veil/forecast-web)** | **معماری کلاینت (P2)** | اجرای مستقیم مدل‌های TimesFM و Chronos در مرورگر با **WebGPU و WASM** بدون نیاز به سرور گران‌قیمت GPU، همراه با ۹ محدوده احتمالاتی. |
| ۸ | **[puffinsoft/benchstreet](https://github.com/puffinsoft/benchstreet)** | **بنچمارک مالی (P2)** | فریم‌ورک مقایسه تجربی مدل‌های مالی مدرن (LSTM, GRU, N-BEATS, ARIMA, TimesFM, Chronos) با متدهای اعتبارسنجی بدون نشت آینده. |
| ۹ | **[facebook/prophet](https://github.com/facebook/prophet)** | **فصلی‌بودن (P3)** | مدل محبوب فیسبوک برای داده‌های دارای اثرات تقویمی، فصلی‌بودن و تعطیلات سشن. |

---

## ۱۰.۸ موتور ترسیم و بصری‌سازی آینده روی چارت (`Future Trajectory Overlay Engine`) — ارزش محوری CHART

ایده کلیدی CHART صرفاً گزارش درصدی در یک تب مجزا نیست؛ بلکه طراحی **موتور مستقل ترسیم آینده به‌صورت لایه گرافیکی مستقیم بر روی بوم چارت** است:

### خروجی‌های سه‌گانه ترسیمی از کندل فعلی رو به آینده:
1. **مسیر محتمل مرکزی (`Central Trajectory`):** خط روند پیش‌بینی‌شده برای امتداد حرکت کندل‌های آینده تا انتهای افق.
2. **محدوده اطمینان و ابر احتمالاتی (`Confidence Bands / Uncertainty Cloud / Fan Chart`):** نمایش طیف عدم‌قطعیت پیش‌بینی با Quantileهای پیوسته (مانند `q10`, `q25`, `q50`, `q75`, `q90`) که با دورتر شدن افق زمانی گشادتر می‌شود.
3. **سناریوهای چندگانه جایگزین (`Multi-Scenario Alternatives`):**
   - **سناریوی صعودی (`Bullish Scenario`):** مسیر احتمالی شکست به بالا در صورت حفظ حمایت و محرک خرید.
   - **سناریوی نزولی (`Bearish Scenario`):** مسیر اصلاحی در صورت از دست رفتن تقاضا.
   - **سناریوی پایه / خنثی (`Base / Mean-Reversion Scenario`):** نوسان درون دامنه فعلی.
   - همراه با برچسب درصد احتمال آماری و مختصات زمانی-قیمتی نقاط هدف احتمالی (`Projected Time-Price Coordinates`).
4. **رندر کندل‌های پیش‌بینی هوش مصنوعی آینده (`AI-Generated Future Candlesticks` — بر اساس اسکرین‌شات مرجع):**
   - ترسیم مستقیم کندل‌های OHLC آینده از مرز آخرین کندل واقعی رو به آینده.
   - **خط تفکیک عمودی زمان حال:** با سربرگ متمایز `PAST (Actual Data)` (با فلش آبی به چپ) در برابر `Future Projection (N periods) (AI-Generated)` (با فلش خط‌چین نارنجی به راست).
   - **استایل کندل‌های شبحی (`Ghost / Hologram Candlesticks`):** رندر با رنگ بنفش-خاکستری نیمه‌شفاف برای جلوگیری از اشتباه گرفتن با کندل‌های سبز/قرمز واقعی گذشته.
   - **محور افقی پیش‌بینی:** نمایش گام‌های زمانی آینده (`+5 (Future)`, `+10`, `+15`, `+20`, `+25`, `+30`) همراه با درصد تغییر انباشته نسبت به آخرین قیمت بسته شده (`+X%` / `-X%`).
   - **کف پیش‌بینی حداقل ۱۰ کندل در تمام تایم‌فریم‌ها ($h \ge 10$):** توانایی تولید و رسم حداقل ۱۰ کندل متوالی آینده بر روی تمامی تایم‌فریم‌های فعال (`M15` تا `W1`) با هماهنگی دقیق تقویم معاملاتی سشن.

---

## ۱۰.۹ هشدار نقادانه و یافته‌های پژوهش نوامبر ۲۰۲۶: چالش سودآوری در برابر پیش‌بینی ساده

> **پرسش بنیادین مهندسی:** آیا این مدل‌های پیچیده ریاضی و هوش مصنوعی واقعاً در بازار مالی کار می‌کنند؟

بر اساس ارزیابی تجربی منتشرشده در **۹ نوامبر ۲۰۲۶ (arXiv)** روی قراردادهای آتی شاخص‌های سهام بزرگ (**Nasdaq 100 و S&P 500**):
- در **۱۶۰ ترکیب مختلف** از مدل‌ها، افق‌های زمانی و انواع ویژگی‌های ورودی، **هیچ‌کدام از مدل‌های پیشرفته پیش‌بینی سری زمانی نتوانستند در آزمون بدون نشت آینده از خط مبنای فوق‌العاده ساده «بدون تغییر قیمت» (`Naive Persistence / Random Walk Baseline without drift`) عملکرد بهتری ثبت کنند!**

### اصول حاکم بر طراحی موتور پیش‌بینی در CHART:
1. **پیچیدگی بیشتر مدل $\neq$ سودآوری یا عملکرد بهتر:** یک مدل چند صد میلیون پارامتری می‌تواند نویز تصادفی بازار را حفظ کند و در دنیای واقعی فاجعه‌آفرین شود.
2. **تفاوت پیش‌بینی سطح قیمت (`Price Level`) با جهت حرکت (`Directional Movement`):** هدف CHART پیش‌بینی قیمت سنت به سنت نیست؛ بلکه شناسایی سوگیری جهتی، انقباض/انبساط نوسان و شکست سطوح کلیدی است.
3. **تفاوت بنیادین تایم‌فریم روزانه (`D1`) با تایم‌فریم‌های درون‌روزی (`M15`, `M5`):** الگوهای پایدار تاریخی در کندل‌های روزانه ناشی از ساختار کلان هستند، اما کندل‌های ۱۵ یا ۵ دقیقه‌ای به‌شدت تحت تأثیر نویز اسپرد، سفارشات الگوریتمی مقطعی و عدم تعادل موقت میکرواستراکچر قرار دارند.
4. **معیار پذیرش قطعی ورود به پروداکشن (`Strict Acceptance Gate`):**
   - هیچ مدلی (حتی TimesFM یا N-BEATS) اجازه خروج از وضعیت `PROVISIONAL` و ورود به خروجی رسمی سامانه را ندارد، مگر اینکه در آزمون اعتبارسنجی تاریخی `Walk-Forward` روی داده‌های کاملاً ندیده (`Out-of-Sample`)، **به‌طور معنادار آماری از Baseline ساده (`Persistence`) پیشی بگیرد**.

---

## ۱۰.۱۰ معماری ۳ لایه‌ای اختصاصی CHART برای پیش‌بینی و ترسیم آینده

برای اجتناب از تله‌های متداول مدل‌سازی صرفاً آکادمیک، معماری پیش‌بینی CHART به سه لایه مجزا و مکمل تفکیک می‌شود:

```
┌────────────────────────────────────────────────────────────────────────┐
│ لایه اول: استخراج رفتار و ساختار نمودار (Chart Behavior & Structure)    │
│ • دریافت OHLCV واقعی ۱۰۰٪ معتبر از Twelve Data                          │
│ • شناسایی روند (EMA/SMA)، نوسان پویا (ATR 14)، مومنتوم (RSI/MACD)        │
│ • ساختار اسمارت‌مانی: BOS / CHoCH / FVG / سطوح فیبوناچی / پروفایل حجم VRVP │
│ • هم‌ترازی با سشن معاملاتی جاری (آسیا، لندن، نیویورک)                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ لایه دوم: موتور پیش‌بینی ترکیبی و سنجش عدم‌قطعیت (Ensemble Engine)      │
│ • متدهای آماری پایه (Statistical / State-Space / Drift Baselines)       │
│ • شبکه‌های عصبی سری زمانی (N-BEATS / N-HiTS از طریق NeuralForecast)     │
│ • مدل‌های پایه چندمنظوره (Google TimesFM / Amazon Chronos)             │
│ • مدل اختصاصی آموزش‌دیده روی داده‌های مالی و ساختار K-Line (Kronos POC)    │
│ • محاسبه هم‌زمان Quantileها (q10..q90) و توزیع سناریوهای گاو/خرس        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ لایه سوم: ترسیم تعاملی آینده روی چارت (Future Trajectory Visualizer)   │
│ • رندر مستقیم روی Lightweight Charts (وب) و Jetpack Compose (اندروید)  │
│ • رسم مسیر مرکزی پیش‌بینی (امتداد خطی/منحنی)                             │
│ • ابر شفاف بازه اطمینان (Confidence Cloud q10..q90)                    │
│ • ترسیم مسیرهای سناریوی صعودی و نزولی جایگزین                           │
│ • برچسب‌گذاری اهداف زمانی-قیمتی و اعتبارسنجی زنده پس از تشکیل کندل‌ها    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ۱۰.۱۱ برنامه اجرایی ۶ مرحله‌ای پیاده‌سازی و آزمون تجربی (`Action Plan`)

| گام | اقدام اجرایی | وضعیت و خروجی مورد انتظار |
|---|---|---|
| **۱** | **بررسی فنی TimesFM و Chronos** | تست اولیه کتابخانه‌ها در پایتون و ارزیابی امکان‌سنجی ران‌تایم کلاینت (WASM/WebGPU مشابه پروژه `forecast-web` یا استقرار Worker). |
| **۲** | **آزمایش تجربی N-BEATS و N-HiTS** | پیاده‌سازی پایپ‌لاین آزمایشی با `NeuralForecast` روی داده‌های تاریخی واقعی نمادهای پایلوت (`XAUUSD`, `SPOTBRENT`). |
| **۳** | **مقایسه عملکرد با پیش‌بینی ساده (Baseline Testing)** | سنجش خطای مدل‌ها در برابر `Persistence Baseline` و محاسبه معیارهای `Directional Accuracy`، `MAE` و `Coverage`. |
| **۴** | **طراحی موتور ترکیب سناریوها (Scenario Fusion Engine)** | استخراج ۳ مسیر متمایز (صعودی، نزولی، پایه) از همگرایی خروجی ساختار تکنیکال و باندهای مدل. |
| **۵** | **نمایش آینده نمودار به‌صورت لایه Overlay روی چارت** | توسعه کامپوننت‌های رندر گرافیکی در وب و اندروید برای رسم خطوط آینده، مخروط عدم‌قطعیت و سناریوها. |
| **۶** | **ارزیابی زنده و ثبت مستمر خطای پیش‌بینی (`Outcome Tracking`)** | ثبت هش پیش‌بینی پیش از بسته شدن کندل، مقایسه با کندل‌های واقعی بسته‌شده و محاسبه امتیاز کالیبراسیون و شکست سناریو. |

---

## ۱۰.۱۲ تحلیل ۳ حالت طراحی عملکردی آینده (`Architectural Modes`)

برای نهایی‌سازی ساختار لایه بصری و نوع مدل‌سازی، سیستم قابلیت پشتیبانی از ۳ زاویه دید تخصصی را مد نظر قرار می‌دهد:

1. **حالت اول — پیش‌بینی ادامه نمودار (`Future Trajectory Forecasting`):**
   - نمودار تا لحظه فعلی واقعی است؛ موتور از آخرین کندل بسته‌شده، امتداد محتمل حرکت کندل‌های بعدی را در زمان آینده رسم می‌کند.
2. **حالت دوم — تشخیص الگو و تکمیل آن (`Pattern Detection & Completion`):**
   - سیستم تشکیل نیمه اول یک الگوی تکنیکال یا هارمونیک (مانند سر و شانه، پرچم، الگوی گارتلی یا باترفلای) را تشخیص داده و امتداد هندسی الگو، خط گردن و اهداف تئوریک را روی آینده چارت رسم می‌کند.
3. **حالت سوم — یادگیری شکل حرکت و بازسازی هندسی منحنی (`Manifold Learning & Fractal Projection`):**
   - سیستم روابط ریاضی و ساختار فرکتالی نوسان‌های گذشته نماد را فراگرفته و نزدیک‌ترین رفتارهای مشابه تاریخی را به‌عنوان پیش‌نمایش آینده روی چارت منطبق می‌کند.

- **افق‌های زمانی هدف (`Forecast Horizons`):**
  - **کوتاه‌مدت:** ۵ تا ۳۰ کندل آینده (برای اهداف سویینگ کوتاه‌مدت درون‌روزی).
  - **میان‌مدت و بلندمدت:** ده‌ها تا صدها کندل (بررسی روندهای کلان هفتگی/ماهانه).
  - سیستم در معماری نهایی به‌صورت **چندافقی (`Multi-Horizon`)** طراحی می‌شود تا تحلیل‌گر بتواند افق دلخواه را انتخاب نماید.

---

# ۱۱. اعتبارسنجی تاریخی (`Walk-Forward`)، ثبت تغییرناپذیر و Outcome

## ۱۱.۱ `Purged + Embargoed Walk-Forward`
- ارزیابی فقط روی تقسیم ترتیبی بدون نشت آینده انجام می‌شود (Shuffle تصادفی ممنوع).
- افق‌های هم‌پوشان **Purge** می‌شوند و بعد از مرز هر بخش **Embargo** متناسب با تقویم بازار اعمال می‌گردد.
- نتایج دو مدل `Frozen Model` و `Adaptive Model` به‌صورت جداگانه و با ذکر حجم نمونه مؤثر (`INCONCLUSIVE` در صورت ناکافی بودن نمونه) گزارش می‌شوند.

## ۱۱.۲ ثبت سروری تغییرناپذیر و زنجیره هش (`SHA-256 Hash Chain`)
- تنها سرور مرجع ثبت رسمی پیش‌بینی است (`PROVISIONAL` تا پیش از پذیرش سرور).
- سرور زمان دریافت (`server_received_at`) را پیش از مهلت بسته شدن افق قفل می‌کند و پیش‌بینی دیررس رد می‌شود.
- جدول Forecast به‌صورت `append-only` است (بدون `UPDATE`/`DELETE` از مسیر برنامه)؛ هر رکورد با Serialization کانونیکال هش `SHA-256` و ارجاع به `previous_hash` ثبت می‌شود و digest دوره‌ای برای جلوگیری از بازنویسی کامل باید خارج از دیتابیس هاست **Anchor** شود.

## ۱۱.۳ معیارهای Outcome (`Accuracy != Trading Profit`)
`Directional Accuracy`, `Precision / Recall`, `MAE / RMSE`, خطای `High/Low`, پوشش واقعی Prediction Interval (`Coverage`), `Brier Score`, `Quantile Loss`, `Probability Calibration`، به تفکیک رژیم صعودی/نزولی/خنثی و مقایسه با Baselineها.

---

# ۱۲. فرمول‌های مرجع ریاضی اندیکاتورها (هم‌تراز با `TA-Lib`) و ارزیابی ابزارهای متن‌باز

## ۱۲.۱ فرمول‌های قطعی ۶ اندیکاتور پایه (`DECIDED` — تلورانس هدف `< 1e-6`)
1. **`SMA(N)`:** میانگین حسابی `N` قیمت `Close` اخیر؛ تا `N - 1` کندل اول `null`. (برای `SMA 200` شرط سخت حداقل ۲۰۰ کندل اعمال می‌شود).
2. **`EMA(N)` (مثلاً `EMA 20`):** ضریب هموارسازی $k = \frac{2}{N + 1}$؛ **مقدار اولیه قطعی (`Seed`) در کندل `N`ام برابر `SMA(N)`** و از کندل بعد: $EMA_t = (Close_t - EMA_{t-1}) \times k + EMA_{t-1}$.
3. **`Bollinger Bands(N, k)` (پیش‌فرض `20, 2`):** خط میانی = `SMA(N)`؛ **انحراف معیار جمعیت (`Population StdDev`, تقسیم بر `N` یعنی `ddof = 0`)** برای تطابق ۱۰۰٪ با `TA-Lib` و TradingView؛ `Upper = Middle + k·σ` و `Lower = Middle - k·σ`.
4. **`RSI(14)`:** تغییرات کندل $\Delta = Close_t - Close_{t-1}$، $Gain = \max(\Delta, 0)$، $Loss = \max(-\Delta, 0)$. **Seed اولیه** = میانگین ساده ۱۴ مقدار اول؛ سپس **Wilder's Smoothing (`RMA` با `α = 1/14`)**: $Avg_t = \frac{Avg_{t-1} \times 13 + Val_t}{14}$ و در نهایت $RSI = 100 - \frac{100}{1 + AvgGain/AvgLoss}$ (در صورت $AvgLoss = 0 \implies 100$).
5. **`MACD(12, 26, 9)`:** `MACD Line = EMA(12, Close) - EMA(26, Close)` (از کندل ۲۶ام معتبر)؛ `Signal Line = EMA(9, MACD Line)` با Seed برابر `SMA(9)` از ۹ مقدار اول MACD (از کندل ۳۴ام معتبر)؛ `Histogram = MACD Line - Signal Line`.
6. **`ATR(14)`:** $TR_t = \max(H_t - L_t, |H_t - C_{t-1}|, |L_t - C_{t-1}|)$؛ **Seed** = `SMA(14)` از ۱۴ `TR` اول؛ سپس **Wilder's Smoothing**: $ATR_t = \frac{ATR_{t-1} \times 13 + TR_t}{14}$.

## ۱۲.۲ تصمیم ارزیابی ابزارها و مخازن متن‌باز (`DECIDED / TO VERIFY / REJECTED`)
- **استفاده مستقیم (`DECIDED`):** `TradingView Lightweight Charts` (فقط لایه نمایش، همراه با Attribution الزامی)، `TA-Lib Python` (مرجع عددی فاز تحقیق)، ساختار الهام `OpenCharts` / `streamlit-lightweight-charts-v5` (چندپنلی).
- **نامزدهای تحقیق و POC (`TO VERIFY` بدون ورود خودکار به Production):** `DuckDB` / `MotherDuck` (تحلیل تاریخی دسته‌ای)، `APScheduler` (صرفاً در Worker پایتون)، `Scikit-learn` (`TimeSeriesSplit`)، `LightGBM`، `Optuna`، `ONNX Runtime`، `yfinance` (فقط POC/آزمایش)، `Binance Spot API` (فقط در صورت فعال‌سازی سری اسپات رمزارز)، `pandas-ta` (مقایسه با TA-Lib)، `Skfolio` (تئوری Regimes و Purged CV)، `VectorBT` (شرایط Fair-Code — فقط پژوهش آفلاین، ورود به Runtime ممنوع).
- **اقتباس صرفاً الگوی معماری (بدون ورود کد):** `Cryptofeed` (AGPL — تفکیک Feed از Consumer و closed/open) و `CCXT` (فقط قرارداد Adapter بدون اتصال صرافی).
- **خارج از دامنه / ردشده (`OUT OF SCOPE / REJECTED`):** `Freqtrade` (ربات معاملاتی)، پلاگین‌های `Claude Code / MCP / Next.js` از `crypto-claude-desk` (تنها الگوی ۳ مرحله‌ای و Learning Evaluator آن اقتباس می‌شود).

---

# ۱۳. موارد باز، پرسش‌های تاییدنشده و ارجاعات

تمامی موارد باز فنی و پرسش‌های طراحی پیش از فازهای ۳ تا ۶ به‌صورت دسته‌بندی‌شده و اولویت‌بندی‌شده در اسناد زیر نگهداری می‌شوند:
- **مسائل باز کد و زیرساخت (`INF`, `ENG`, `UI`, `SEC`) + پرسش‌های باز §17.4:** [`OPEN_ISSUES.md`](../03-roadmap-and-issues/OPEN_ISSUES.md)
- **وضعیت واقعی کد و بک‌لاگ دقیق فازهای ۲ تا ۶:** [`ROADMAP_BACKLOG.md`](../03-roadmap-and-issues/ROADMAP_BACKLOG.md)
- **مشخصات تخصصی موتور پیش‌بینی و ترسیم آینده:** [`FUTURE_PRICE_PROJECTION_ENGINE_SPEC.md`](./FUTURE_PRICE_PROJECTION_ENGINE_SPEC.md)
- **مشخصات سرور و محدودیت‌های cPanel:** [`INFRASTRUCTURE_INVENTORY.md`](../02-architecture/INFRASTRUCTURE_INVENTORY.md)
- **مستندات استراتژی فاز ۶:** [`TRADING_STRATEGY_SPEC.md`](./TRADING_STRATEGY_SPEC.md)

