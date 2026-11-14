# CHART — وضعیت واقعی قابلیت‌ها و نقشه راه توسعه (`ROADMAP_BACKLOG`)

> **نسخه:** `1.42.0` · **تاریخ ممیزی واقعی در کد:** `2026-11-14`  
> این سند تفاوت بین **قابلیت‌های پیاده‌سازی‌شده و تأییدشده در کد فعلی** را از **بک‌لاگ باقی‌مانده (Worker خارجی یادگیری عمیق، فازهای ۵ و ۶ و آزمون‌های عملیاتی cPanel زنده)** به‌طور دقیق و صادقانه جدا می‌کند.

---

## ۱. هسته پیاده‌سازی‌شده و تأییدشده در کد فعلی (`SHIPPED IN CODE`)

قابلیت‌های زیر در **بک‌اند PHP، کلاینت وب (`host_subdomain`) و اپلیکیشن اندروید (`app/`)** پیاده‌سازی شده‌اند:

- **احراز هویت، نشست و همگام‌سازی یکپارچه:**
  - `[x]` ورود شخصی (`auth.php`) با هش امن SHA-256 همراه با Salt، گزینه `Remember Me`، ایمیل بازیابی و بازیابی رمز با کد ۶ رقمی OTP.
  - `[x]` همگام‌سازی دوطرفه محیط کاری (`workspace_sync.php`) شامل `open_tabs`، ترسیمات، نمادهای سفارشی و تنظیمات ۵ تب (`Sync`, `Chart`, `Notifications`, `Theme`, `Account`) — *باگ‌های بحرانی پاریتی، عدم ذخیره ابری تغییرات اندیکاتور/ساعت، و پرش نسبت ارتفاع حجم در `SYNC-01` پیگیری می‌شود*.

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

بر اساس بررسی مستقیم کد در **کلاینت وب (`technicalIndicators.js`, `chartRenderer.js`)** و **اپلیکیشن اندروید (`PriceFormatterAlgorithm.kt`, `Phase2IndicatorsAlgorithm.kt`, `ChartViewScreen.kt`)**، **تمامی ۱۵ مورد (۱۵ از ۱۵)** اندیکاتور/ابزار اصلی ۳ سطحی TradingView در کد پیاده‌سازی شده‌اند (`IND-01` نیز با هر ۴ واریانت کامل شد):

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
| `14` | **Pivot Points** | `[x]` **کامل در `v1.41.0` (`IND-01`)** | هر ۴ واریانت **Standard / Fibonacci / Camarilla / Woodie** شامل سطوح **`R3/R4` و `S3/S4`** به‌صورت Overlay تعاملی روی بوم وب و اندروید، با انتخاب واریانت در Indicators و همگام‌سازی کامل Workspace. |
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

### فاز ۳ — کیفیت داده، ورود آرشیو تاریخی و Backup/Restore (تکمیل‌شده در کد تا `v1.41.0`)
1. `[x]` **تشخیص هوشمند Gap (`Smart Gap Detection`):** در `v1.39.0` پیاده‌سازی شد (`ENG-03`).
2. `[x]` **ورود فایل‌های تاریخی (`Historical Import` & `LocalCsvAdapter` — `v1.41.0`):** `LocalCsvAdapter.php` + `api/v1/import_candles.php` + جداول نسب و ممیزی `data_import_batches`، `data_corrections`، `backup_records`، `audit_logs` در `002_phase2_3_tables.sql` + کلاینت وب (`candleImport.js`, `settingsView.js`) و اندروید (`CandleImportAlgorithm.kt`, `Phase3ImportCard.kt` با `SAF` بدون نیاز به مجوز Storage)؛ پشتیبانی کامل از `EIA RBRTEd.xls` (باینری `BIFF8 OLE2`، `SpreadsheetML XML`، `HTML`، `TSV`)، `DataHub brent-daily.csv` (اجبار خودکار به `D1` بدون جعل اینترادی)، `CSV` استاندارد، `JSON`، ورود دستی `OHLC` و اعمال سخت‌گیرانه **سیاست ممنوعیت ذخیره تصویر (`ERR_IMAGE_UPLOAD_FORBIDDEN`)**. *(استقرار/اجرای زنده روی `chart.manico.es` پس از دیپلوی بعدی تأیید می‌شود.)*
3. `[x]` **Backup & Restore رمزنگاری‌شده در سطح برنامه (`PBKDF2 + AES-256-GCM`):** در `v1.39.0` در PHP/Web/Android پیاده‌سازی شد (`INF-01`؛ تست نهایی بازیابی روی cPanel زنده باقی مانده است).

### فاز ۴ — موتور تحلیل ساختار و پیش‌بینی آینده قیمت (`Future Price Projection Engine v1` — هسته مستقل آماری در `v1.42.0`)

> **مستندات مرجع تفصیلی:** کلیه جزئیات فنی، فرمول‌ها، پایپ‌لاین و ماتریس تصمیم‌گیری در سند اختصاصی [**`FUTURE_PRICE_PROJECTION_ENGINE_SPEC.md`**](../01-product/FUTURE_PRICE_PROJECTION_ENGINE_SPEC.md) و بخش ۱۰ سند [**`CHART_INTELLIGENCE_MASTER_SPEC.md`**](../01-product/CHART_INTELLIGENCE_MASTER_SPEC.md) تدوین شده است.

- `[x]` **تمایز بنیادین معماری، هسته مستقل و پلاگین‌محور (`Decoupled Pluggable Core`):**
  - ایزوله‌سازی کامل موتور پیش‌بینی در پکیج‌های مستقل (`host_subdomain/assets/js/forecast/*`، `app/.../forecast/*` و `host_subdomain/api/v1/forecast/*`) کاملاً جدا از رندرر چارت و Providerهای داده، با رجیستری پلاگین (`ForecastModelRegistry` / `modelRegistry.js`) برای افزودن، فعال/غیرفعال‌کردن و تنظیم وزن/پارامتر مدل‌ها در آینده.
  - جداسازی کامل زبان آماری (`q10..q90`، احتمال جمع‌شونده به `1.000`، سناریوهای `Bullish Expansion / Base Range / Bearish Contraction` و `Structural Pivot Reference`) بدون هیچ‌گونه سیگنال خرید/فروش یا توصیه معاملاتی.

- `[x]` **فرمول‌بندی ورودی، بازده لگاریتمی و بازسازی قیمت آینده (`v1.42.0`):**
  - استخراج ویژگی روی بازده‌های لگاریتمی مانا $r_t = \ln(C_t / C_{t-1})$، برش‌های نوسان، رژیم بازار و `DataReadinessGate` (`>= 30` کندل بسته).
  - بازسازی قیمت آینده از آخرین کندل بسته قطعی: $\hat{C}_{t+h} = C_t \times \exp(\sum_{i=1}^h \hat{r}_{t+i})$ همراه با تولید OHLC شبحی و تقویم سشن معاملاتی با پرش از تعطیلات آخر هفته.

- `[x]` **خانواده متدهای ریاضی، آماری و فیلترهای حالت (پلاگین‌های پیش‌فرض MVP):**
  - **Persistence Baseline (`NaivePersistence`)** و **ATR Volatility Cone** به‌عنوان خط مبنای مقایسه‌ای.
  - **Kalman Filter:** تخمین سطح قیمت و سرعت/تکانه با میرایی گام‌به‌گام.
  - **GARCH (1,1):** مدل‌سازی نوسان شرطی و گسترش چندمرحله‌ای عدم‌قطعیت.
  - **AR(2) / ETS Drift:** خط مبنای اقتصادسنجی اتورگرسیو.
  - **Gaussian Process Trend (`GP`):** برآورد احتمالاتی پیوسته روی پنجره کوتاه‌مدت در کلاینت وب و اندروید.

- `[ ]` **استقرار سرویس خارجی مدل‌های یادگیری عمیق روی GPU/VPS (`External Python DL Worker`):**
  - `[x]` **قرارداد و پل اتصال صادقانه (`Remote Worker Bridge` در `v1.42.0`):** پشتیبانی از `FORECAST_WORKER_URL` در Backend PHP، وب و اندروید با نمایش وضعیت صریح `LOCAL_STATISTICAL_ONLY` یا `UNCONFIGURED` در نبود Worker (بدون جعل خروجی DL).
  - `[ ]` استقرار سرور پایتونی خارجی برای **Chronos-2 (Apache 2.0)**، **TimesFM 2.5 (Google Research)** و **N-HiTS (Nixtla)** *(تبصره دائمی: **TimesFM 3.0** به دلیل لایسنس غیرتجاری استفاده نمی‌شود)*.

- `[x]` **خروجی ۴ مؤلفه‌ای، تب اختصاصی و رندر ۳ حالته روی بوم چارت (`v1.42.0`):**
  - تب و صفحه مستقل **آزمایشگاه پیش‌بینی (`Forecast Studio` در وب / `ForecastLabScreen` در اندروید)** با ۴ زیرتب (`Projection`, `Plugin Models`, `Walk-Forward`, `SHA-256 Ledger`)، قابلیت تنظیم وزن و پارامتر هر مدل و اعمال مستقیم روی چارت.
  - رندر ۳ حالته روی بوم چارت در وب (`chartRenderer.js`) و اندروید (`CandlestickCanvas.kt`): **Fan Chart (`q10..q90` و `q25..q75`)**، **Ghost Candlesticks** و **Hybrid Overlay** با افق قابل تنظیم **`10..60` کندل** (`$h \ge 10$`, پیش‌فرض `30`) در تمامی ۶ تایم‌فریم (`M15..W1`).

- `[x]` **ارزیابی Walk-Forward محلی و زنجیره تغییرناپذیر `SHA-256` (`v1.42.0`):**
  - اجرای **Purged Walk-Forward** روی پنجره تاریخی با `AcceptanceGate` در برابر `Persistence Baseline` (`MAE`، `RMSE`، `Directional Accuracy`، `Pinball Loss`).
  - پیاده‌سازی مایگریشن `003_phase4_forecast_tables.sql` (`prediction_models`, `prediction_runs`, `prediction_forecasts`, `prediction_scenarios`, `prediction_walkforward_benchmarks`)، اندپوینت `api/v1/forecast.php` و دفترکل محلی/ابری زنجیره‌شده با **SHA-256** (`ForecastLedgerStore` / `forecastLedger.js`).


### فاز ۵ — حلقه بازخورد زنده، Walk-Forward و حاکمیت مدل
- [ ] **ارزیابی خودکار Outcome و یادگیری شناختی (`Outcome & Learning Evaluator`):** مقایسه بلادرنگ کندل‌های بسته‌شده جدید با خروجی ثبت‌شده تغییرناپذیر پیش‌بینی در پایگاه داده؛ محاسبه خطای جهت، MAE، RMSE، Quantile Loss، و امتیاز کالیبراسیون بر اساس `forecast-contract/v1`.
- [ ] **ارزیابی تاریخی (`Purged + Embargoed Walk-Forward`):** تقسیم زمانی بدون نشت آینده، Purge کردن افق‌های هم‌پوشان و اعمال دوره Embargo مطابق تقویم معاملاتی.
- [ ] **مدیریت `Champion / Challenger & Rollback` با `Promotion Gate`:** ارتقای مدل آزمایشی به پروداکشن صرفاً در صورت برتری معنادار آماری بر مدل جاری و خط مبنا، همراه با سقف بودجه تغییر (`Change Budget`) و قابلیت برگشت آنی (`Rollback`).

### فاز ۶ — شبیه‌ساز مستقل استراتژی و پنل چندکاربره
- [ ] **شبیه‌ساز استراتژی معاملاتی ([`TRADING_STRATEGY_SPEC.md`](../01-product/TRADING_STRATEGY_SPEC.md))** — آفلاین (`EUR 1,000`, `1%` ریسک، `Spread/Commission/Slippage/Swap`) بدون اتصال کارگزاری واقعی.
- [ ] **مدیریت چندکاربره (`Multi-User Admin UI`)**

