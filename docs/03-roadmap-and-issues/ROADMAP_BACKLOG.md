# CHART — وضعیت واقعی قابلیت‌ها و نقشه راه توسعه (`ROADMAP_BACKLOG`)

> **نسخه:** `1.40.0` · **تاریخ ممیزی واقعی در کد:** `2026-11-13`  
> این سند تفاوت بین **قابلیت‌های پیاده‌سازی‌شده و تأییدشده در کد فعلی** را از **بک‌لاگ باقی‌مانده (از جمله `Pivot Points` روی چارت و فازهای ۳.۲ و ۴ تا ۶)** به‌طور دقیق و صادقانه جدا می‌کند.

---

## ۱. هسته پیاده‌سازی‌شده و تأییدشده در کد فعلی (`SHIPPED IN CODE`)

قابلیت‌های زیر در **بک‌اند PHP، کلاینت وب (`host_subdomain`) و اپلیکیشن اندروید (`app/`)** پیاده‌سازی شده‌اند:

- **احراز هویت، نشست و همگام‌سازی یکپارچه:**
  - `[x]` ورود شخصی (`auth.php`) با هش امن SHA-256 همراه با Salt، گزینه `Remember Me`، ایمیل بازیابی و بازیابی رمز با کد ۶ رقمی OTP.
  - `[x]` همگام‌سازی دوطرفه محیط کاری (`workspace_sync.php`) شامل `open_tabs`، ترسیمات، نمادهای سفارشی و تنظیمات ۵ تب (`Sync`, `Chart`, `Notifications`, `Theme`, `Account`) + دکمه `Reset All`.
  - `[x]` جداسازی کامل کلیدهای شخصی `BYOK` (`Twelve Data`, `Stooq`, `Alpha Vantage`, `Finnhub`) با ارسال هدر `X-Provider-Api-Key` (هرگز در فضای ابری یا فایل بکاپ ذخیره نمی‌شوند).
- **موتور داده، سشن، تشخیص Gap و خروجی (`DB-First Delta Sync`):**
  - `[x]` ۷ آداپتور مستقل (`tvdatafeed`, `biquote`, `twelve_data`, `dukascopy`, `yahoo_finance`, `stooq`, `eia_brent_spot`) با کلید یکتای `UNIQUE(chart_id, provider_id, timeframe, open_time_utc)` و ممنوعیت Fallback پنهان.
  - `[x]` پشتیبانی از ۶ تایم‌فریم (`M15`, `M30`, `H1`, `H4`, `D1`, `W1`) و واکشی عمیق تاریخی تا ۵۰۰۰ کندل با هم‌ترازی سشن‌ها و DST (`ENG-01`).
  - `[x]` Quote زنده فقط-خواندنی (`quote.php` — `ENG-02`) جدا از ذخیره کندل‌های بسته‌شده (`is_closed = 1`).
  - `[x]` موتور تشخیص هوشمند Gap (`GapDetector` + `gap_report.php` + جدول `data_quality_reports` — `ENG-03`).
  - `[x]` خروجی استاندارد **CSV (RFC 4180) و JSON کندل‌ها** در وب (`Blob`) و اندروید (`SAF` بدون نیاز به مجوز Storage).
- **میزکار چارت و تعامل TradingView Pro (Web & Android):**
  - `[x]` نوار تب‌های چندگانه چارت، محور قیمت رند Heckbert با `[Auto] [Log]`، محور زمان هوشمند `UTC / Local`، ۱۱ بازه سریع (`1D..All`)، و تغییر ارتفاع لمسی پنل‌ها.
  - `[x]` ابزارهای پایه (`HLINE`, `VLINE`, `TREND`, `FIB`, `LONG_POS`, `SHORT_POS`) با `Magnet Mode`، انتخاب، جابه‌جایی، رنگ و ضخامت `1px..4px`.

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

بر اساس بررسی مستقیم کد در **کلاینت وب (`technicalIndicators.js`, `chartRenderer.js`)** و **اپلیکیشن اندروید (`PriceFormatterAlgorithm.kt`, `Phase2IndicatorsAlgorithm.kt`, `ChartViewScreen.kt`)**، از ۱۵ ابزار/اندیکاتور اصلی پرکاربرد در TradingView، **۱۴ مورد پیاده‌سازی شده‌اند** و صرفاً **`Pivot Points` (ردیف ۱۴)** به‌عنوان اندیکاتور هم‌پوشان روی بوم چارت هنوز باز است (`IND-01`):

#### سطح اول — ضروری‌ترین و پرکاربردترین‌ها (۵ ابزار هسته)
| رتبه | اندیکاتور | وضعیت در کد (Web + Android) | پوشش فعلی و یادداشت فنی |
|---|---|---|---|
| `1` | **Moving Average (`EMA` / `SMA`)** | `[x]` **کامل** | `EMA 20 / 50 / 200`، `SMA 20 / 50 / 200` (با گارد حداقل ۲۰۰ کندل) + `MTF EMA 20` بدون نشت آینده |
| `2` | **RSI** | `[x]` **کامل** | `RSI (14)` در پنل مجزا با سطوح اشباع `30 / 70` |
| `3a` | **MACD (`12, 26, 9` — پنل مجزا)** | `[x]` **کامل** | خطوط مکدی، سیگنال و هیستوگرام مومنتوم در **پنل جداگانه پایین چارت** (`showMacd`) |
| `3b` | **MACD Classic (`Overlay` — روی بوم اصلی)** | `[x]` **کامل** | همان مکدی (`12, 26, 9`) **مستقیماً روی ۳۰٪ پایینی خود چارت قیمت** بدون ایجاد پنل جداگانه (`showOverlayMacd`) |
| `4` | **Bollinger Bands** | `[x]` **کامل** | `Bollinger Bands (20, 2σ)` با تنظیم قابل‌سفارشی‌سازی `Period` و `StdDev` |
| `5` | **Volume / Volume Profile** | `[x]` **پیاده‌سازی‌شده (`ENG-03b`)** | `Volume Histogram` + `Session Volume Profile (VRVP)` + ابزار `FRVP` (`POC/VAH/VAL`) — *همسان‌سازی توزیع بین‌سطلی در `ENG-03b` پیگیری می‌شود* |

#### سطح دوم — خیلی کاربردی و محبوب (حرفه‌ای / روزانه)
| رتبه | اندیکاتور | وضعیت در کد (Web + Android) | پوشش فعلی و یادداشت فنی |
|---|---|---|---|
| `6` | **Stochastic Oscillator** | `[x]` **کامل** | `Stochastic (14, 3, 3)` (`%K / %D` با سطوح `20 / 80`) |
| `7` | **ATR** | `[x]` **کامل** | `Wilder ATR (14)` برای اندازه‌گیری نوسان و تنظیم حد ضرر |
| `8` | **VWAP** | `[x]` **پیاده‌سازی‌شده (`ENG-03b`)** | `Session VWAP` (ریست بر پایه سشن + Rolling 20 روی `D1/W1`) و `Anchored VWAP (AVWAP)` — *یکسانی وزن `vol=0` در `ENG-03b`* |
| `9` | **Supertrend** | `[x]` **کامل** | `Supertrend (10, 3.0)` مبتنی بر `ATR` با نوار روند صعودی/نزولی |
| `10` | **Ichimoku Cloud** | `[x]` **کامل** | `Tenkan (9)`, `Kijun (26)`, `Senkou A/B (+26)` و `Chikou (-26)` + ابر کومو |

#### سطح سوم — معروف و مفید
| رتبه | اندیکاتور | وضعیت در کد (Web + Android) | پوشش فعلی و یادداشت فنی |
|---|---|---|---|
| `11` | **ADX** | `[x]` **کامل** | `ADX / +DI / -DI (14)` با خط مرجع `25` |
| `12` | **Parabolic SAR** | `[x]` **کامل** | `Parabolic SAR (0.02, 0.20)` با نقاط توقف/چرخش روند |
| `13` | **Fibonacci Retracement** | `[x]` **کامل** | ابزار ترسیمی `FIB` با `Magnet Mode` و همگام‌سازی مختصاتی |
| `14` | **Pivot Points** | `[ ]` **ناقص — نیازمند افزودن روی چارت (`IND-01`)** | اکنون فقط به‌صورت عددی ایستا (`Classic P/R1/R2/S1/S2`) در کارت Overview/Prediction دیده می‌شود و هنوز به‌عنوان **Overlay Indicator قابل فعال‌سازی روی بوم چارت (`Standard / Fibonacci / Camarilla / Woodie`)** ساخته نشده است. |
| `15` | **OBV (On Balance Volume)** | `[x]` **کامل** | `OBV` تجمعی در پنل اسیلاتورها |

- **اندیکاتورهای تکمیلی دیگر که هم‌اکنون در کد فعال هستند:** `Keltner Channels (20, 10, 2×ATR)`، `Donchian Channels (20)`، `CCI (20)`، `Williams %R (14)`، `ROC (12)`، `Chaikin Money Flow (CMF 20)` و ساختار بازار `SMC (BOS / CHoCH / EQH / EQL / FVG)`.

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

### فاز ۳ — کیفیت داده، ورود آرشیو تاریخی و Backup/Restore
1. `[x]` **تشخیص هوشمند Gap (`Smart Gap Detection`):** در `v1.39.0` پیاده‌سازی شد (`ENG-03`).
2. `[ ]` **ورود فایل‌های تاریخی (`Historical Import` & `LocalCsvAdapter`):** آپلود مستقیم آرشیو `EIA Europe Brent Spot FOB` (`RBRTEd.xls` از ۱۹۸۷ تا امروز)، فایل‌های CSV/XLS/JSON و پشتیبان `DataHub (brent-daily.csv)`؛ پشتیبانی از ورود دستی/استخراج عددی بدون ذخیره هیچ تصویر نمودار (`Strict No-Image-Storage Policy`).
3. `[x]` **Backup & Restore رمزنگاری‌شده در سطح برنامه (`PBKDF2 + AES-256-GCM`):** در `v1.39.0` در PHP/Web/Android پیاده‌سازی شد (`INF-01`؛ تست نهایی بازیابی روی cPanel زنده باقی مانده است).

### فاز ۴ — موتور تحلیل ساختار و پیش‌بینی نسخه اول (`Prediction Engine v1`)
- [ ] **مدل پایه‌ای و پایپ‌لاین ۳ مرحله‌ای مستقل برای هر `chart_id`:**
  - `DataReadinessMonitor` + `TechnicalStructureAnalyzer`
  - `Uncertainty & Volatility Specialist` (`q10..q90` بر مبنای `ATR 14` و مدل `Kronos`/Baseline)
  - `Immutable Prediction Generator` منطبق بر `forecast-contract/v1` برای افق‌های `15m`, `1h`, `4h`, `1d` با زنجیره هش سروری `SHA-256` و **بدون هرگونه فیلد معامله‌گری (`Buy/Sell/Entry/SL/TP`)**.

- [ ] **روش‌شناسی ریاضی، برونیابی (Extrapolation) و مدل‌های پیش‌بینی سری زمانی:**
  - **برونیابی‌های ساده هندسی و رگرسیونی (`Extrapolations`):**
    - برونیابی خطی (`Linear Trendline Extrapolation`)
    - برازش چندجمله‌ای (`Polynomial Trend Forecaster` درجه ۲ و بالاتر)
    - مدل‌های نمایی و لگاریتمی (`Exponential / Logarithmic Curves`)
  - **مدل‌های آماری و اقتصادسنجی کلاسیک (`Classical Statistical Models`):**
    - سری‌های خودهمبسته و میانگین متحرک (`AR`, `MA`, `ARMA`, `ARIMA`, `SARIMA`)
    - هموارسازی نمایی (`Exponential Smoothing`: Holt-Winters و انواع `ETS`)
    - مدل‌های فضای حالت و فیلتر کالمن (`State-Space Models` & `Kalman Filter`)
    - برونیابی فوریه و تبدیل موج سینوسی (`Fourier Extrapolation` / `Sequential Regression Extrapolation - SRE`)
  - **ابزارها و کتابخانه‌های مرجع سری زمانی (Ecosystem & Repos):**
    - `sktime` (شامل `PolynomialTrendForecaster` و انواع برونیاب‌های رگرسیونی)
    - `statsmodels` (`ARIMA`, `SARIMAX`, `StateSpace`)
    - `Prophet` (متا — تفکیک روند، فصلی‌بودن و نقاط عطف)
    - `PyTorch Forecasting` و `GluonTS` (مدل‌های عمیق `LSTM`, `DeepAR`, `Temporal Fusion Transformer - TFT`)
    - مدل‌های پایه نوین ترنسفورمر (`Google TimesFM`, `Kronos K-Line Foundation Model`)
  - **تمایز هسته Chart Intelligence در پیش‌بینی:**
    - برونیابی در این پروژه صرفاً یک ترسیم ساده ریاضی نیست؛ تمایز اساسی در **تحلیل هم‌زمان ساختار بازار (`BOS / FVG / Fib / VRVP`)**، **ترکیب چند روش (Ensemble)**، **بازخورد قطعی از نتیجه واقعی (`Outcome Loop`)** و **آموزش/تنظیم مستقل برای هر `chart_id`** بدون دخالت انسانی و بدون صدور سیگنال معامله است.

### فاز ۵ — حلقه بازخورد زنده، Walk-Forward و حاکمیت مدل
- [ ] **ارزیابی خودکار Outcome و یادگیری شناختی (`Outcome & Learning Evaluator`)**
- [ ] **ارزیابی تاریخی (`Purged + Embargoed Walk-Forward`)**
- [ ] **مدیریت `Champion / Challenger & Rollback` با `Promotion Gate`**

### فاز ۶ — شبیه‌ساز مستقل استراتژی و پنل چندکاربره
- [ ] **شبیه‌ساز استراتژی معاملاتی ([`TRADING_STRATEGY_SPEC.md`](../01-product/TRADING_STRATEGY_SPEC.md))** — آفلاین (`EUR 1,000`, `1%` ریسک، `Spread/Commission/Slippage/Swap`) بدون اتصال کارگزاری واقعی.
- [ ] **مدیریت چندکاربره (`Multi-User Admin UI`)**
