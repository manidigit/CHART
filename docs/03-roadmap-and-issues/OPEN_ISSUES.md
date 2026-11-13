# CHART — فهرست مسائل باز، نواقص جزئی راستی‌آزمایی‌شده و موارد نیازمند بررسی (`OPEN_ISSUES`)

> **نسخه:** `1.38.1` · **تاریخ ممیزی واقعی روی کد:** `2026-11-13`  
> این فایل پس از تطبیق خط‌به‌خط سورس‌کد واقعی (`app/src/main/java/`, `host_subdomain/`, `.github/`) با اسناد قدیمی (`GPT_CODE_REVIEW_RECOMMENDATIONS.md`, `USER_FEEDBACK_FIX_LIST.md`, `PHASE_2_ROADMAP_SPEC.md`, `INFRASTRUCTURE_INVENTORY.md`, `CHART_INTELLIGENCE_MASTER_SPEC.md`) ایجاد شده است.  
> **تمام باگ‌هایی که ۱۰۰٪ در کد حل شده‌اند از این فهرست حذف شده‌اند** تا هنگام کدنویسی بعدی فقط روی مسائل واقعی، بخش‌های نیمه‌کاره و پرسش‌های باز زیرساختی تمرکز شود.

---

## خلاصه وضعیت باگ‌های قبلی (حل‌شده vs باز)

- **بسته‌شده / حل‌شده در کد فعلی:** پاک‌سازی داده ساختگی از `index.html`، قرارداد واحد `chartId` (`${SYMBOL}_${TF}`)، فیلتر آخر هفته بر اساس تقویم دارایی (`24/7` کریپتو)، `InstrumentSpec` صریح، شرط سخت ۲۰۰ کندل برای `SMA200`، یکسان‌سازی الگوریتم `VWAP`، همسان‌سازی `Volume Profile` با برچسب `Estimated`، محاسبه روزانه واچ‌لیست بر اساس `sessionPrevClose`، تفکیک وضعیت‌های `Live / Market Closed / Cached / Sync Error / API Key Required`، جداسازی `BYOK` از `workspace_sync.php` با هدر `X-Provider-Api-Key`، لمس موبایل وب و `BottomSheet`، پنهان‌سازی نوار ناوبری در صفحه چارت اندروید، PNG واقعی Snapshot، پایداری `openTabs`، و موارد بصری `USER_FEEDBACK_FIX_LIST #1..#10` و `#12-1..#12-6`.
- **باقی‌مانده یا نیازمند تکمیل:** موارد جدول‌بندی‌شده در بخش‌های ۱ تا ۴ زیر.

---

## ۱. اولویت بحرانی — زیرساخت و بکاپ (`P0 — Infrastructure & Operations`)

| شناسه | موضوع | شرح واقعی در کد/سرور | اقدام موردنیاز | مرجع |
|---|---|---|---|---|
| **`INF-01`** | **عدم اطمینان از بکاپ هاست (`jetbackup5d: down`) و نبود Backup/Restore درون‌برنامه‌ای** | در تصویر cPanel ثبت‌شده در [`INFRASTRUCTURE_INVENTORY.md`](../02-architecture/INFRASTRUCTURE_INVENTORY.md)، سرویس `jetbackup5d` در وضعیت `down` است و هنوز Backup/Restore رمزنگاری‌شده در کد بک‌اند وجود ندارد. | بررسی وضعیت بکاپ در cPanel + پیاده‌سازی خروجی پشتیبان رمزنگاری‌شده از MariaDB (در فاز ۳) با انتقال به محل مستقل خارج از هاست و ثبت آزمون Restore. | `INFRASTRUCTURE_INVENTORY.md`, `Master Spec §6.10` |
| **`INF-02`** | **آزمون عملی Rollback استقرار (`build-apk.yml`) و پاک‌سازی فایل موقت** | گردش کار `build-apk.yml` پکیج وب و مایگریشن `001_phase1_init.sql` را مستقیم روی هاست مستقر می‌کند، اما سازوکار اتوماتیک حفظ نسخه قبلی و Rollback فوری یک‌کلیکی روی cPanel هنوز تست مستند نشده است. | افزودن اسنپ‌شات نسخه قبلی پیش از overwrite یا اسکریپت Rollback مستند و ثبت نتیجه تست بازیابی. | `INFRASTRUCTURE_INVENTORY.md`, `Master Spec §3.1` |

---

## ۲. اولویت بالا — هسته داده، تایم‌فریم و تازگی قیمت (`P1 — Data Engine & Connectivity`)

| شناسه | موضوع | وضعیت فعلی در سورس‌کد واقعی | فایل‌های درگیر | معیار تکمیل (`Acceptance Criteria`) |
|---|---|---|---|---|
| **`ENG-01`** | **هم‌ترازی سشن‌های معاملاتی درون‌روزی در تجمیع تایم‌فریم (`Session Alignment`)** *(نیمه‌کاره — `PARTIAL`)* | تجمیع `W1` به درستی به دوشنبه لنگر شده (`EPOCH_MONDAY_OFFSET_MS`) و `minExpectedChildren` بر اساس تقویم دارایی تنظیم می‌شود؛ **اما** سطل‌های `H1`, `H4` و `D1` در هر سه پلتفرم هنوز با تقسیم ریاضی ثابت به `00:00:00 UTC` تراز می‌شوند، نه ساعت بازگشایی سشن اختصاصی بازارهایی مانند سهام آمریکا (`09:30 America/New_York` و DST). | `host_subdomain/api/v1/algorithms/TimeframeAggregator.php`, `host_subdomain/assets/js/algorithms/timeframeAggregator.js`, `app/.../algorithms/TimeframeAggregatorAlgorithm.kt` | تعریف `SessionCalendar` واقعی برای هر طبقه دارایی (ساعت بازگشایی سشن + DST)، ساخت کندل‌های `H4` و `D1` سهام/شاخص منطبق بر سشن رسمی و عدم ثبت کندل تجمیعی ناقص به‌عنوان کندل بسته کامل. |
| **`ENG-02`** | **تفکیک Quote زنده (Stream/Fast Tick) از Sync کندل‌های بسته‌شده** *(نیمه‌کاره — `PARTIAL`)* | در کلاینت وب (`app.js`) و اندروید (`MainViewModel.kt`) تایمر Polling دوره‌ای ۱۵ تا ۶۰ ثانیه‌ای نزدیک زمان بسته شدن کندل وجود دارد؛ **اما** فید استریم یا Tick Quote مستقل از واکشی تاریخی REST (`candles_sync.php`) هنوز پیاده نشده است و بسته به تنظیم پلان پرووایدر ممکن است بین بسته‌شدن کندل‌ها نوسان لحظه‌ای به‌روز نشود. | `host_subdomain/assets/js/app.js`, `host_subdomain/assets/js/services/apiService.js`, `app/.../ui/state/MainViewModel.kt`, `host_subdomain/api/v1/candles_sync.php` | تفکیک شفاف `Last Quote / Forming Bar` از تاریخچه قطعی `Closed Candles` (بر مبنای قابلیت هاست/پرووایدر) و حفظ وضعیت صادقانه تازگی داده در هدر چارت. |
| **`ENG-03`** | **موتور تشخیص هوشمند Gap و بازیابی کسری تاریخچه (`Smart Gap Detection`)** | فایل‌های تاریخچه موجود بارگذاری می‌شوند، اما الگوریتم سیستماتیک تشخیص شکاف‌های میانی با لحاظ تعطیلات بازار (`detect_gaps`) و ثبت `data_quality_reports` هنوز ساخته نشده است. | — *(برنامه‌ریزی‌شده برای فاز ۳)* | شناسایی شکاف‌های باز با `expected_delta` و پر کردن Idempotent فقط از همان `provider_id`. |

---

## ۳. اولویت متوسط — داده واقعی کارت‌های تحلیل بنیادی و بهداشت کد (`P2 — Content Fidelity & Hygiene`)

| شناسه | موضوع | وضعیت فعلی در سورس‌کد واقعی | فایل‌های درگیر | معیار تکمیل (`Acceptance Criteria`) |
|---|---|---|---|---|
| **`UI-01`** | **متصل نبودن تب‌های `News`, `Minds`, `Ideas` و `SEC EDGAR` به فید زنده خارجی** *(نیمه‌کاره — `PARTIAL`)* | ساختار ۴ تب شیت جزئیات نماد و تفکیک بر اساس کلاس دارایی (`Stocks` / `Energy` / `Metals` / `Crypto` / `Indices`) و حذف SVG ساختگی Seasonals **انجام شده است**؛ با این حال کارت‌های `News`, `Minds`, `Ideas` و برچسب‌های بنیادین (مثل `SEC EDGAR (10-K • 10-Q • 8-K)`) در حال حاضر از تحلیل محلی کندل‌ها و متادیتای ایستا (`profileMeta`) تولید می‌شوند، نه از فید زنده RSS/API خارجی (Yahoo RSS, EIA RSS, SEC EDGAR API). | `host_subdomain/assets/js/views/watchlistView.js`, `app/.../ui/screens/WatchlistScreen.kt` | اتصال واقعی تب `News` و بخش `SEC EDGAR / Earnings` سهام به اندپوینت‌های مجاز یا نمایش برچسب صریح منبع («خلاصه محلی کندل‌ها» vs «خبر زنده خارجی») در زمان آفلاین/نبود فید. |
| **`SEC-01`** | **ممیزی کامل تزریق HTML و `escapeHtml` در دکمه‌ها/مودال‌های وب** *(جزئی — `PARTIAL`)* | اکثریت رشته‌های متنی از `escapeHtml()` استفاده می‌کنند، اما مقدار `sym.symbolCode` در برخی ویژگی‌های `data-symbol="..."` و نام تب‌ها در Template Stringهای `app.js` / `watchlistView.js` به‌صورت مستقیم درج شده است. فرض امن این است که فقط حروف `[A-Z0-9._:-]` پذیرفته شوند. | `host_subdomain/assets/js/core/store.js`, `host_subdomain/assets/js/app.js`, `host_subdomain/assets/js/views/watchlistView.js` | اعمال نرمال‌سازی سخت‌گیرانه `sanitizeSymbolCode()` در ورودی نماد سفارشی + پوشش کامل `escapeHtml()` در تمام ویژگی‌ها و گره‌های HTML. |

---

## ۴. موارد نیازمند راستی‌آزمایی هاست و تصمیمات باز پیش از فاز ۴ (`TO VERIFY / OPEN`)

### ۴.۱. موارد زیرساختی تاییدنشده روی cPanel (`Section 5 of INFRASTRUCTURE_INVENTORY.md`)
1. نسخه دقیق PHP فعال زیر `chart.manico.es` (از خروجی زنده `/api/v1/system/status.php`), `memory_limit`, `max_execution_time`, `upload_max_filesize`, `post_max_size`.
2. فعال بودن `php` CLI، وضعیت و حداقل بازه مجاز `crond` در سطح اکانت برای همگام‌سازی ۱۵ دقیقه‌ای (`scripts/cron_sync_tvdatafeed.php`).
3. دسترسی خروجی HTTPS سرور هاست به دامنه‌های خارجی (`api.twelvedata.com`, `query1.finance.yahoo.com`, `stooq.com`, `data.eia.gov`) و وجود هرگونه محدودیت/Rate Limit روی IP اشتراکی.
4. وضعیت واقعی دسترسی `SSH` برای کاربر اکانت، امکان یا عدم امکان اجرای `Python` / `Worker` دائمی و سقف اتصالات هم‌زمان MariaDB.

### ۴.۲. پرسش‌های باز طراحی پیش از فازهای ۳ تا ۶ (`Master Spec §17.4`)
1. **پوشش و پیوستگی واقعی تاریخچه منابع:** تأیید عمق کامل تاریخچه و رفتار نرخ/مجوز Dukascopy، `biquote` و `Stooq` برای بازه‌های چندساله هر `chart_id`.
2. **امنیت مخزن کلیدهای `BYOK` چندکاربره:** طراحی نهایی ذخیره رمزنگاری‌شده کلید کاربر روی سرور در محیط چندکاربره و سیاست مالکیت/اشتراک‌گذاری نمودارها.
3. **قرارداد رسمی `forecast-contract/v1` و ارزیابی مدل (پیش از فاز ۴ و ۵):**
   - نهایی‌سازی JSON Schema اجرایی، Quantileهای هدف (مثلاً `q10`, `q50`, `q90`) و ضریب/دوره `ATR` برای تعریف روند «خنثی».
   - تعیین محل نهایی Inference (`Browser/ONNX` در برابر `Backend/Python Worker`) و سیاست اعتماد (`PROVISIONAL` vs `VALID`).
   - تعیین طول دقیق `Embargo`، روش محاسبه حجم نمونه مؤثر، حداقل نمونه برای خروج از `INCONCLUSIVE`، آستانه‌های `Promotion Gate` / `Change Budget` / `Rollback` در `Champion/Challenger` و محل مستقل `Anchor` کردن زنجیره `SHA-256`.
4. **پارامترهای استراتژی معاملاتی (پیش از فاز ۶ — [`TRADING_STRATEGY_SPEC.md`](../01-product/TRADING_STRATEGY_SPEC.md)):** قوانین تبدیل سناریو به ورود، تخصیص چندتارگته `TP1/TP2/TP3`، جابه‌جایی `Stop Loss` به `Break-Even`، سقف ریسک هم‌زمان، `Max Drawdown Halt` و مدل دقیق `Swap / Spread / Slippage`.
