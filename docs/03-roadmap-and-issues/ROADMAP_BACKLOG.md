# CHART — وضعیت واقعی قابلیت‌ها و نقشه راه توسعه (`ROADMAP_BACKLOG`)

> **نسخه:** `1.47.41` · **تاریخ ممیزی واقعی در کد:** `2026-11-23`  
> این سند تفاوت بین **قابلیت‌های پیاده‌سازی‌شده و تأییدشده در کد فعلی (`v1.47.41`)** (شامل هسته تحلیل تکنیکال `ta-core/1.1`، درخت اشیاء `UI-02`، شبیه‌ساز آفلاین استراتژی `strategy-sim/1.0`، پنل مدیریت چندکاربره `Admin RBAC` در وب و اندروید، و ارتقای **`Causal Historical Analogs Rev 2.3`** با ثبات افق `0.0000` و سازگاری چندتایم‌فریمی `Hybrid Two-Cluster MTF`) را از **بک‌لاگ باقی‌مانده (گزارش ارزیابی آماری OOS زنده تمام نمادها، اتصال آینده سرور مستقل Python/Chronos-2، فاز ۵ حاکمیت مدل و آزمون‌های عملیاتی cPanel زنده)** به‌طور دقیق و صادقانه جدا می‌کند.

---

## ۱. هسته پیاده‌سازی‌شده و تأییدشده در کد فعلی (`SHIPPED IN CODE`)

قابلیت‌های زیر در **بک‌اند PHP، کلاینت وب (`host_subdomain`) و اپلیکیشن اندروید (`app/`)** پیاده‌سازی شده‌اند:

- **احراز هویت، نشست و همگام‌سازی یکپارچه:**
  - `[x]` ورود شخصی (`auth.php`) با هش امن SHA-256 همراه با Salt، گزینه `Remember Me`، ایمیل بازیابی و بازیابی رمز با کد ۶ رقمی OTP.
  - `[x]` همگام‌سازی دوطرفه محیط کاری (`workspace_sync.php`) شامل `open_tabs`، ترسیمات، نمادهای سفارشی و تنظیمات ۵ تب (`Sync`, `Chart`, `Notifications`, `Theme`, `Account`) — *بسته و تأییدشده در `SYNC-01` (`v1.40.0`)*.

  - `[x]` جداسازی کامل کلیدهای شخصی `BYOK` (`Twelve Data`, `Stooq`, `Alpha Vantage`, `Finnhub`) با ارسال هدر `X-Provider-Api-Key` (هرگز در فضای ابری یا فایل بکاپ ذخیره نمی‌شوند).
- **موتور داده، سشن، تشخیص Gap و خروجی (`DB-First Delta Sync`):**
  - `[x]` کاتالوگ استاندارد **۷۹ نماد** (۲۲ نماد پیش‌فرض واچ‌لیست + ۵۷ سهام و شرکت بزرگ بین‌المللی در Settings و دیتابیس `chart_series` با `inWatchlist = false` پیش‌فرض) با منبع فعال انحصاری **`tvdatafeed`** در هر سه لایه (`005_expand_global_stocks_catalog.sql`).
  - `[x]` پشتیبانی از ۶ تایم‌فریم (`M15`, `M30`, `H1`, `H4`, `D1`, `W1`) و واکشی عمیق تاریخی تا ۵۰۰۰ کندل با هم‌ترازی سشن‌ها و DST (`ENG-01`)، به همراه رفع کامل گیرکردن تعویض تایم‌فریم در وب (`AbortController` و تایم‌اوت ۴.۵ ثانیه‌ای سوکت `TvDatafeedAdapter.php`).
  - `[x]` Quote زنده فقط-خواندنی (`quote.php` — `ENG-02`) جدا از ذخیره کندل‌های بسته‌شده (`is_closed = 1`).
  - `[x]` موتور تشخیص هوشمند Gap آگاه از سشن، تسویه روزانه (`21:00–23:59 UTC`) و تعطیلات رسمی بورس‌ها (`GapDetector` + `gap_report.php` + جدول `data_quality_reports` — `ENG-03`، ارتقایافته در `v1.44.0` با حذف کامل گپ‌های کاذب روی `SPOTBRENT`).
  - `[x]` خروجی استاندارد **CSV (RFC 4180)** در نوار بالای وب (`Blob`) و اندروید (`SAF` بدون نیاز به مجوز Storage؛ دکمه اضافی `JSON` طبق درخواست محصول از UI حذف شد).
- **میزکار چارت و تعامل TradingView Pro (Web `v1.47.41` & Android Core):**
  - `[x]` یکپارچه‌سازی منوی ناوبری (`Chart`, `Forecast [فعال در وب / غیرفعال در اندروید]`, `Performance`, `Watchlist`, `Settings`) در نوار بالای وب (حذف کامل نوار عمودی سمت راست و دکمه‌های تکراری خروج/تم/زبان + پین کردن `.tv-topbar-right` در `v1.47.41`)، چراغ چشمک‌زن وضعیت بازار (`Live` سبز / `Closed` قرمز بدون متن شلوغ)، نوار تب‌های چندگانه چارت، محور قیمت رند Heckbert با `[Auto] [Log]`، محور زمان هوشمند `UTC / Local`، ۱۱ بازه سریع (`1D..All`)، و تغییر ارتفاع لمسی پنل‌ها.
  - `[x]` پایدارسازی کامل تعویض سهم از واچ‌لیست و تعویض تایم‌فریم در وب (`ARCH-02` یکسان‌سازی کامل `?v=1.47.41` در ۲۷ ماژول JS + محافظ `globalThis.__CI_STORE_SINGLETON_V1__`، `STORAGE-QUOTA-01` با `safeLocalStorageSet()` و ردیابی `serverHydratedCandleKeys` در `v1.47.41`).
  - `[x]` ابزارهای پایه (`HLINE`, `VLINE`, `TREND`, `FIB`, `LONG_POS`, `SHORT_POS`) با `Magnet Mode`، انتخاب، جابه‌جایی، رنگ و ضخامت `1px..4px`.
  - `[x]` **درخت اشیاء پیشرفته (`Object Tree` — `UI-02`) روی وب و اندروید:** پنل/شیت یکپارچه برای مدیریت ترسیم‌های چارت و اندیکاتورهای فعال (از جمله `S/R Zones` و `Candlestick Patterns`) با قابلیت انتخاب، مخفی/نمایش (`visible`)، قفل/بازکردن (`locked` با جلوگیری از جابه‌جایی ناخواسته روی بوم)، حذف تکی، مخفی/نمایش همگانی، «پاک‌کردن بازها» و همگام‌سازی ابری کامل.

---

## ۲. قابلیت‌های فاز ۲ پیاده‌سازی‌شده در کد (`PHASE 2 — SHIPPED IN v1.39.0`)

### ۲.۱. ابزارهای ترسیم هندسی، چرخه‌ای و حجمی (`12 Multi-Anchor Tool Families`)
- `[x]` **الگوهای هارمونیک و ساختاری:** `XABCD Pattern` (۵ لنگر + نسبت‌های فیبوناچی و `PRZ`), `ABCD Pattern` (۴ لنگر + نسبت‌های `BC/AB, CD/BC`), و `Head and Shoulders` (۵ لنگر + خط گردن و تارگت اندازه‌گیری‌شده).
- `[x]` **ابزارهای هندسی گن (`W.D. Gann Tools`):** `Gann Fan` (۹ پرتو استاندارد `8x1`..`1x8`) و `Gann Box` (شبکه ماتریسی زمان-قیمت `0, 0.25, 0.382, 0.5, 0.618, 0.75, 1.0`).
- `[x]` **چنگال اندروز (`Andrews' Pitchfork`):** پشتیبانی کامل از هر ۴ واریانت `Original`, `Schiff`, `Modified Schiff`, و `Inside Pitchfork` در وب و اندروید.
- `[x]` **ابزارهای زمانی و چرخه‌ای:** `Fib Time Zone` ($0,1,2,3,5,8,13,21,34,55$), `Cyclic Lines` ($\Delta t$ تکرارشونده)، و `Fib Speed Resistance Fan`.
- `[x]` **ابزارهای نقطه ثابت حجم و رگرسیون:** `Anchored VWAP (AVWAP)`, `Fixed Range Volume Profile (FRVP)` (شامل `POC`), و `Linear Regression Channel` ($y = ax + b \pm 1\sigma, 2\sigma$).
*(تمام ۱۲ خانواده از `Magnet Mode`، جابه‌جایی مختصاتی، انتخاب، حذف و همگام‌سازی JSON بین وب و اندروید پشتیبانی می‌کنند.)*

### ۲.۲. کاتالوگ کامل اندیکاتورها و اسیلاتورها (دسته‌بندی ۳ سطحی محبوبیت TradingView)

بر اساس بررسی مستقیم کد در **کلاینت وب (`technicalIndicators.js`, `chartRenderer.js`)** و **اپلیکیشن اندروید (`PriceFormatterAlgorithm.kt`, `Phase2IndicatorsAlgorithm.kt`, `ChartViewScreen.kt`)**، **تمامی ۱۵ مورد (۱۵ از ۱۵)** اندیکاتور/ابزار اصلی ۳ سطحی TradingView در کد پیاده‌سازی شده‌اند (`IND-01` نیز با هر ۴ واریانت کامل شد):

#### سطح اول — ضروری‌ترین و پرکاربردترین‌ها (۵ ابزار هسته)
| رتبه | اندیکاتور | وضعیت در کد (Web + Android) | پوشش فعلی و یادداشت فنی |
|---|---|---|---|
| `1` | **Moving Average (`EMA` / `SMA`)** | `[x]` **کامل** | `EMA 20 / 50 / 200`، `SMA 20 / 50 / 200` (با گارد حداقل ۲۰۰ کندل) + `MTF EMA 20` بدون نشت آینده |
| `2` | **RSI** | `[x]` **کامل** | `RSI (14)` در پنل مجزا با سطوح اشباع `30 / 70` |
| `3a` | **MACD (`12, 26, 9` — پنل مجزا)** | `[x]` **کامل** | خطوط مکدی، سیگنال و هیستوگرام مومنتوم در **پنل جداگانه پایین چارت** (`showMacd`) |
| `3b` | **MACD Classic (`Overlay` — روی بوم اصلی)** | `[x]` **کامل** | همان مکدی (`12, 26, 9`) **مستقیماً روی ۳۰٪ پایینی خود چارت قیمت** بدون ایجاد پنل جداگانه (`showOverlayMacd`) |
| `4` | **Bollinger Bands** | `[x]` **کامل** | `Bollinger Bands (20, 2σ)` با تنظیم قابل‌سفارشی‌سازی `Period` و `StdDev` |
| `5` | **Volume / Volume Profile** | `[x]` **کامل (`ENG-03b`)** | `Volume Histogram` + `Session Volume Profile (VRVP)` + ابزار `FRVP` (`POC/VAH/VAL`) — *توزیع همپوشانی بین‌سطلی بین وب و اندروید یکسان‌سازی و تأیید شده است* |

#### سطح دوم — خیلی کاربردی و محبوب (حرفه‌ای / روزانه)
| رتبه | اندیکاتور | وضعیت در کد (Web + Android) | پوشش فعلی و یادداشت فنی |
|---|---|---|---|
| `6` | **Stochastic Oscillator** | `[x]` **کامل** | `Stochastic (14, 3, 3)` (`%K / %D` با سطوح `20 / 80`) |
| `7` | **ATR** | `[x]` **کامل** | `Wilder ATR (14)` برای اندازه‌گیری نوسان و تنظیم حد ضرر |
| `8` | **VWAP** | `[x]` **کامل (`ENG-03b`)** | `Session VWAP` (ریست بر پایه سشن + Rolling 20 روی `D1/W1`) و `Anchored VWAP (AVWAP)` — *وزن‌دهی `vol=0` بین وب و اندروید یکسان‌سازی و تأیید شده است* |
| `9` | **Supertrend** | `[x]` **کامل** | `Supertrend (10, 3.0)` مبتنی بر `ATR` با نوار روند صعودی/نزولی |
| `10` | **Ichimoku Cloud** | `[x]` **کامل** | `Tenkan (9)`, `Kijun (26)`, `Senkou A/B (+26)` و `Chikou (-26)` + ابر کومو |

#### سطح سوم — معروف و مفید
| رتبه | اندیکاتور | وضعیت در کد (Web + Android) | پوشش فعلی و یادداشت فنی |
|---|---|---|---|
| `11` | **ADX** | `[x]` **کامل** | `ADX / +DI / -DI (14)` با خط مرجع `25` |
| `12` | **Parabolic SAR** | `[x]` **کامل** | `Parabolic SAR (0.02, 0.20)` با نقاط توقف/چرخش روند |
| `13` | **Fibonacci Retracement** | `[x]` **کامل** | ابزار ترسیمی `FIB` با `Magnet Mode` و همگام‌سازی مختصاتی |
| `14` | **Pivot Points** | `[x]` **کامل در `v1.41.0` (`IND-01`)** | هر ۴ واریانت **Standard / Fibonacci / Camarilla / Woodie** شامل سطوح **`R3/R4` و `S3/S4`** به‌صورت Overlay تعاملی روی بوم وب و اندروید، با انتخاب واریانت در Indicators و همگام‌سازی کامل Workspace. |
| `15` | **OBV (On Balance Volume)** | `[x]` **کامل** | `OBV` تجمعی در پنل اسیلاتورها |

- **اندیکاتورها و لایه‌های تحلیلی تکمیلی دیگر که هم‌اکنون در کد فعال هستند:** `Keltner Channels (20, 10, 2×ATR)`، `Donchian Channels (20)`، `CCI (20)`، `Williams %R (14)`، `ROC (12)`، `Chaikin Money Flow (CMF 20)`، ساختار بازار `SMC (BOS / CHoCH / EQH / EQL / FVG)` و هسته قطعی **`TechnicalAnalysisCore` (`ta-core/1.1`)** شامل **نواحی حمایت و مقاومت مبتنی بر شواهد (`S/R Zones` با `≥ 2` برخورد و وضعیت `ACTIVE/BROKEN/RETESTED`)** و **تشخیص خودکار ۷ الگوی کندلی قطعی (`Doji`, `Hammer`, `Shooting Star`, `Bullish/Bearish Pin Bar`, `Bullish/Bearish Engulfing`)** روی وب و اندروید (`showSrZones`, `showCandlePatterns`).

### ۲.۳. سشن‌ها، فیدهای زنده کلان و تحلیل بنیادی (`Live External Feeds & Seasonals`)
- `[x]` **کیل‌زون‌های معاملاتی روی بوم (`Killzones`):** `Asia (00–09 UTC)`, `London (07–16 UTC)`, `New York (13–22 UTC)`, و `London/NY Overlap (13–16 UTC)`.
- `[x]` **فید زنده `Symbol Intel` (`symbol_intel.php` با کش ۱۵ دقیقه‌ای MariaDB):**
  - `[x]` اخبار زنده `Yahoo Finance RSS` + `U.S. EIA Today in Energy RSS` (برای انرژی).
  - `[x]` فایلینگ‌های واقعی `SEC EDGAR (10-K / 10-Q / 8-K)` **منحصراً برای سهام آمریکا (`STOCKS`)** (بدون داده ساختگی روی طلا/نفت/فارکس/کریپتو).
  - `[x]` زمینه بین‌بازاری زنده (`DXY`, `US 10Y Yield`, `SPOTBRENT / WTI`) و تقویم رویدادهای کلان (`CPI`, `FOMC`, `NFP`, `EIA`).
  - `[x]` **عملکرد فصلی چندساله واقعی (`Seasonals`):** محاسبه ماتریس بازده ماهانه و نرخ برد تاریخی از کندل‌های `D1` واقعی با قفل صداقت (`>= 12` ماه تقویمی متمایز؛ در غیر این صورت نمایش وضعیت ناکافی بودن تاریخچه بدون عددسازی).
  - `[ ]` **کادر پرس‌وجوی متنی AI (`"Why is asset moving today?"`):** موکول به تصمیم فاز ۴ (در این نسخه بدون ویجت AI خودسرانه).

---

## ۳. نقشه راه فازهای ۳ تا ۶ (`REMAINING ROADMAP`)

> **قاعده دروازه فازها (`Build → Install → Test → Owner Approval Gate`):** هر فاز پس از تایید عملی فاز قبل آغاز می‌شود.

### فاز ۳ — کیفیت داده، ورود آرشیو تاریخی و Backup/Restore (تکمیل‌شده در کد تا `v1.41.0`)
1. `[x]` **تشخیص هوشمند Gap (`Smart Gap Detection`):** در `v1.39.0` پیاده‌سازی شد (`ENG-03`).
2. `[x]` **ورود فایل‌های تاریخی (`Historical Import` & `LocalCsvAdapter` — `v1.41.0`):** `LocalCsvAdapter.php` + `api/v1/import_candles.php` + جداول نسب و ممیزی `data_import_batches`، `data_corrections`، `backup_records`، `audit_logs` در `002_phase2_3_tables.sql` + کلاینت وب (`candleImport.js`, `settingsView.js`) و اندروید (`CandleImportAlgorithm.kt`, `Phase3ImportCard.kt` با `SAF` بدون نیاز به مجوز Storage)؛ پشتیبانی کامل از `EIA RBRTEd.xls` (باینری `BIFF8 OLE2`، `SpreadsheetML XML`، `HTML`، `TSV`)، `DataHub brent-daily.csv` (اجبار خودکار به `D1` بدون جعل اینترادی)، `CSV` استاندارد، `JSON`، ورود دستی `OHLC` و اعمال سخت‌گیرانه **سیاست ممنوعیت ذخیره تصویر (`ERR_IMAGE_UPLOAD_FORBIDDEN`)**. *(استقرار/اجرای زنده روی `chart.manico.es` پس از دیپلوی بعدی تأیید می‌شود.)*
3. `[x]` **Backup & Restore رمزنگاری‌شده در سطح برنامه (`PBKDF2 + AES-256-GCM`):** در `v1.39.0` در PHP/Web/Android پیاده‌سازی شد (`INF-01`؛ تست نهایی بازیابی روی cPanel زنده باقی مانده است).

### فاز ۴ — موتور پیش‌بینی قیمت (نسخه مرورگری وب فعال در `v1.47.41` · سرور Python موکول به تهیه سرور مستقل)

> **وضعیت فعلی در `v1.47.41`:** وب (`host_subdomain/`) اکنون با **Unified Browser-Native Forecast Studio** (۱۲ پنل کامل، `AUTO (OOS Best)`، **`Causal Historical Analogs`**، **`Structural JS`**، **`SMC Prediction Engine` (`smc_prediction_js`)**، ۱۰ مدل Native رجیستری، `Calibrated Ensemble`، ۳ حالت رندر بدون OHLC جعلی، `Coordinated MTF`، `Compare Overlays`، `Historical Replay`، کش LRU، کراس‌هیر تعاملی و `ForecastLedger` محلی SHA-256) فعال است و رابط قدیمی Legacy در `v1.47.38` به‌طور دائمی پاک‌سازی شده است. فایل‌های `Chronos-2` (`host_subdomain/api/v1/chronos2_forecast.php`, `host_subdomain/scripts/chronos2_worker.py`, `.github/workflows/chronos2-manual-forecast.yml`) روی هاست اشتراکی به‌صورت `Shelved` حفظ شده‌اند تا پس از تهیه سرور مستقل Python بازبینی و متصل شوند. تب `Forecast` اندروید تا پایان پایدارسازی غیرفعال باقی می‌ماند.

- [x] **Unified Browser-Native Forecast Studio روی وب (`v1.47.35–v1.47.41`):**
  - `[x]` اجرای ۱۰۰٪ در مرورگر روی کندل‌های بسته‌شده `tvdatafeed` بدون نیاز به `PHP exec()` یا Python، حذف دائمی Legacy UI، پیاده‌سازی `FORECAST-PKG1..3` + `SMCPredictionEngine` علّی + **`Causal Historical Analogs Rev 2.3`** (`Prefix-Invariance` دقیق `0.0000` با `H_ref=60`/`stride=1`، سازگاری چندتایم‌فریمی `Hybrid Two-Cluster MTF` با انطباق `0.0000` بین `H1×60` و `H4×15` و `BLOCK_RECONCILED` بین `M15↔H1`، و غنی‌سازی علّی ویژگی‌ها مطابق [`FORECAST_CONSISTENCY_AND_ANALOG_ANALYSIS_V1.md`](../02-architecture/FORECAST_CONSISTENCY_AND_ANALOG_ANALYSIS_V1.md))؛ پوشش تست پاریتی **۵۷/۵۷**.
- [ ] **ارزیابی آماری OOS زنده روی کل نمادها (`FCST-MODEL-QA-01`):**
  - `[ ]` ثبت گزارش Walk-Forward OOS رسمی روی داده‌های زنده تمام نمادها و تایم‌فریم‌ها پس از استقرار روی `chart.manico.es`.
- [ ] **ورود فاز سرور مستقل Python (آینده — `FCST-RT-01`):**
  - `[ ]` استقرار سرویس مستقل Python/FastAPI برای `Chronos-2` (با نمونه‌برداری مسیر به جای اتصال نقطه‌ای `q50`) و بازبینی مدل‌های پایتونی بدون تولید OHLC ساختگی.
  - `[ ]` هم‌ترازی و فعال‌سازی مجدد تب `Forecast` در اپلیکیشن اندروید پس از تثبیت معماری نهایی.


### فاز ۵ — حلقه بازخورد زنده، Walk-Forward و حاکمیت مدل
- [ ] **ارزیابی خودکار Outcome و یادگیری شناختی (`Outcome & Learning Evaluator`):** مقایسه بلادرنگ کندل‌های بسته‌شده جدید با خروجی ثبت‌شده تغییرناپذیر پیش‌بینی در پایگاه داده؛ محاسبه خطای جهت، MAE، RMSE، Quantile Loss، و امتیاز کالیبراسیون بر اساس `forecast-contract/v1`.
- [ ] **ارزیابی تاریخی (`Purged + Embargoed Walk-Forward`):** تقسیم زمانی بدون نشت آینده، Purge کردن افق‌های هم‌پوشان و اعمال دوره Embargo مطابق تقویم معاملاتی.
- [ ] **مدیریت `Champion / Challenger & Rollback` با `Promotion Gate`:** ارتقای مدل آزمایشی به پروداکشن صرفاً در صورت برتری معنادار آماری بر مدل جاری و خط مبنا، همراه با سقف بودجه تغییر (`Change Budget`) و قابلیت برگشت آنی (`Rollback`).

### فاز ۶ — شبیه‌ساز مستقل استراتژی و پنل چندکاربره (`SHIPPED IN CODE — v1.47.41`)
- `[x]` **شبیه‌ساز آفلاین استراتژی معاملاتی ([`TRADING_STRATEGY_SPEC.md`](../01-product/TRADING_STRATEGY_SPEC.md) — `strategy-sim/1.0` در وب و اندروید):** مستقل برای هر `chart_id` با سرمایه پایه `EUR 1,000`، ریسک `1%`، ۴ پریست قطعی مبتنی بر `TechnicalAnalysisCore` (مستقل از موتور Forecast)، اجرای علّی روی بازشدن کندل بعد، قاعده محافظه‌کارانه `SL_BEFORE_TP`، هزینه‌های صریح (`Spread/Commission/Slippage/Swap`) + تحلیل حساسیت `1.0x/1.5x/2.0x`، نمودار `Equity Curve` و دفتر کل معاملات بدون اتصال کارگزاری واقعی (`PHASE6-STRATEGY-SIM-01`).
- `[x]` **مدیریت چندکاربره (`Multi-User Admin UI` با RBAC سمت سرور در PHP + وب + اندروید):** اندپوینت `api/v1/admin_users.php` و ارتقای `auth.php` (نقش‌های `owner`/`admin`/`viewer`، مسدودسازی `is_active = 0`، ایجاد کاربر، تغییر نقش، فعال/غیرفعال‌سازی، ابطال نشست‌ها، حذف کاربر با محافظت از `owner`/خود و لاگ ممیزی) + رابط دوزبانه در تب `Account` تنظیمات وب و اندروید (`ADMIN-USERS-RBAC-01`).

