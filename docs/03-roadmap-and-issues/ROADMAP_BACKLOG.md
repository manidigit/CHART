# CHART — وضعیت واقعی قابلیت‌ها و نقشه راه توسعه (`ROADMAP_BACKLOG`)

> **نسخه:** `1.38.1` · **تاریخ ممیزی واقعی در کد:** `2026-11-13`  
> این سند تفاوت بین **قابلیت‌های پیاده‌سازی‌شده و تأییدشده در کد فعلی** را از **بک‌لاگ باقی‌مانده فاز ۲** و **فازهای ۳ تا ۶** به‌طور دقیق و صادقانه جدا می‌کند (برگرفته از ممیزی مستقیم سورس‌کد در برابر `CHART_INTELLIGENCE_MASTER_SPEC.md` و `PHASE_2_ROADMAP_SPEC.md`).

---

## ۱. هسته پیاده‌سازی‌شده و تأییدشده در کد فعلی (`SHIPPED IN CODE`)

قابلیت‌های زیر در **بک‌اند PHP، کلاینت وب (`host_subdomain`) و اپلیکیشن اندروید (`app/`)** پیاده‌سازی شده‌اند:

- **احراز هویت، نشست و همگام‌سازی یکپارچه:**
  - ورود شخصی (`auth.php`) با هش امن SHA-256 همراه با Salt، گزینه `Remember Me`، ایمیل بازیابی و بازیابی رمز با کد ۶ رقمی OTP.
  - همگام‌سازی دوطرفه محیط کاری (`workspace_sync.php`) شامل `open_tabs`، ترسیمات، نمادهای سفارشی و تنظیمات ۵ تب (`Sync`, `Chart`, `Notifications`, `Theme`, `Account`) + دکمه `Reset All`.
  - جداسازی کامل کلیدهای شخصی `BYOK` (`Twelve Data`, `Stooq`, `Alpha Vantage`, `Finnhub`) با ارسال هدر `X-Provider-Api-Key`.
- **موتور داده و کاتالوگ ۲۲ نماد / ۷ منبع (`DB-First Delta Sync`):**
  - ۷ آداپتور مستقل (`tvdatafeed`, `biquote`, `twelve_data`, `dukascopy`, `yahoo_finance`, `stooq`, `eia_brent_spot`) با کلید یکتای `UNIQUE(chart_id, provider_id, timeframe, open_time_utc)` و ممنوعیت Fallback پنهان.
  - پشتیبانی از ۶ تایم‌فریم (`M15`, `M30`, `H1`, `H4`, `D1`, `W1`) و واکشی عمیق تاریخی (`Deep Backfill` در اسکرول به گذشته) تا ۵۰۰۰ کندل.
  - حفظ کندل‌های `D1` کریپتو در آخر هفته و فیلتر تیک‌های مصنوعی تعطیلات، نمایش وضعیت صادقانه بازار (`Live`, `Market Closed`, `Cached`, `Sync Error`, `API Key Required`).
- **میزکار چارت و تعامل TradingView Pro (Web & Android):**
  - نوار تب‌های چندگانه چارت (`ChartTabBar` / `.tv-open-tabs-strip`)، محور قیمت رند Heckbert با `[Auto] [Log]`، محور زمان هوشمند `UTC / Local` و ۱۱ بازه سریع (`1D..All`).
  - شمارنده معکوس بسته شدن کندل، خط بسته روز قبل، برچسب سقف/کف دید، دکمه‌های Fit (`⤢`) و Latest (`⏭`), دستگیره لمسی تغییر ارتفاع پنل‌ها (`Pane Splitter`) و تصویر واقعی Snapshot (اندروید).
  - ۶ ابزار ترسیم فعال (`HLINE`, `VLINE`, `TREND`, `FIB`, `LONG_POS`, `SHORT_POS`) با حالت آهنربا (`Magnet`), انتخاب، جابه‌جایی، رنگ و ضخامت `1px..4px`.
- **اندیکاتورها و ساختار بازار پیاده‌سازی‌شده (`Phase 2 Core Subset`):**
  - **روی چارت (`Overlays`):** `SMA (20, 50, 200)` (با گارد اکید ۲۰۰ کندل)، `EMA (20, 50)`, `Bollinger Bands` (با دوره و StdDev قابل تنظیم), `Supertrend (10, 3)`, `Session VWAP` (با ریست یکپارچه سشن/۲۴ ساعته), `MACD Classic (Overlay)`.
  - **پنل‌های پایینی همگام (`Lower Panes`):** `Volume Histogram` (۱۶٪/۲۲٪/۳۰٪), `RSI (14)`, `MACD (12, 26, 9)`, `ATR (14)`.
  - **ساختار بازار و نقدینگی (`SMC & Volume Profile`):** تشخیص خودکار `BOS / CHoCH`, `EQH / EQL`, گپ‌های `FVG / Imbalance` و `Session Volume Profile (VRVP: POC / VAH / VAL)` با برچسب شفاف `Estimated`.
- **واچ‌لیست، جزئیات نماد و صفحه آماده‌سازی پیش‌بینی:**
  - واچ‌لیست تراز‌شده ۲۲ نماد با آیکون‌های برداری اختصاصی، کمبوباکس دسته‌بندی، جستجوی یکپارچه در هدر، محاسبه روزانه بر اساس `sessionPrevClose`، سوایپ حذف و رفرش لمسی در اندروید.
  - شیت خلاصه نماد (`Symbol Overview`) با مینی‌چارت، `Key data points`، تب‌های مجزای `Overview | News | Minds | Ideas` متناسب با طبقه دارایی و تولید فرمول `=GOOGLEFINANCE(...)`.
  - صفحه `Prediction` به‌عنوان قالب رابط کاربری شامل نردبان پیوت (`S2..R2`) و دکمه «ترسیم سطوح سناریو روی چارت» بر مبنای پیوت/ATR محلی (هنوز متصل به موتور ML `Kronos`/فاز ۴ نیست).

---

## ۲. بک‌لاگ باقی‌مانده فاز ۲ (`NOT YET BUILT IN CODE`)

موارد زیر در سند مصوب فاز ۲ (`PHASE_2_ROADMAP_SPEC v2.0.0`) تعریف شده‌اند اما **هنوز در کدهای وب، اندروید و PHP پیاده‌سازی نشده‌اند** و نباید تکمیل‌شده فرض شوند:

### ۲.۱. ابزارهای ترسیم هندسی، چرخه‌ای و حجمی باقی‌مانده (`Phase 2 Drawing Tools`)
- **الگوهای هارمونیک (`Harmonic Patterns`):**
  1. `XABCD Pattern`: انتخاب ۵ پیوت $(X, A, B, C, D)$، محاسبه خودکار نسبت‌های فیبوناچی ($AB/XA$, $BC/AB$, $CD/BC$, $AD/XA$)، رسم دو مثلث $XAB$ و $BCD$ و علامت‌گذاری `PRZ` در نقطه $D$.
  2. `ABCD Pattern`: ۴ نقطه $A, B, C, D$ با پروجکشن طول موج $AB$ روی $CD$.
  3. `Head and Shoulders`: شانه چپ، سر، شانه راست، خط گردن (`Neckline`) و محاسبه تارگت شکست.
- **ابزارهای هندسی گن (`W.D. Gann Tools`):**
  1. `Gann Fan`: خط تعادل $1\times 1$ ($45^\circ$) و زوایای $1\times 2, 1\times 4, 1\times 8$ و $2\times 1, 4\times 1, 8\times 1$.
  2. `Gann Box`: شبکه ماتریسی زمان-قیمت با ترازهای $0.25, 0.382, 0.5, 0.618, 0.75, 1.0$.
- **چنگال اندروز (`Andrews' Pitchfork`):** `Original Pitchfork` ($M = \frac{P_2+P_3}{2}$)، `Schiff Pitchfork`، `Modified Schiff Pitchfork` و `Inside Pitchfork`.
- **ابزارهای زمانی و چرخه‌ای (`Time & Cycle Tools`):** `Fib Time Zone` ($1,2,3,5,8,13,21,34,55\dots$)، `Cyclic Lines` ($\Delta t$ برابر) و `Fib Speed Resistance Fan`.
- **ابزارهای نقطه ثابت حجم و رگرسیون (`Volume & Regression`):**
  1. `Anchored VWAP (AVWAP)`:
     $$\text{AVWAP}_t = \frac{\sum_{i=t_0}^{t} P_i \cdot V_i}{\sum_{i=t_0}^{t} V_i}, \quad P_i = \frac{\text{High}_i + \text{Low}_i + \text{Close}_i}{3}$$
     از کندل انتخابی $t_0$ همراه با باندهای انحراف معیار اختیاری.
  2. `Fixed Range Volume Profile (FRVP)`: رسم کادر مستطیلی دلخواه روی بازه و محاسبه `POC` و سطوح حجم درون کادر.
  3. `Trend Regression`: رگرسیون حداقل مربعات ($y = ax + b$) با باندهای $\pm 1\sigma, \pm 2\sigma$.
*(تمامی ابزارهای چندنقطه‌ای باید از `Magnet Mode` پشتیبانی کنند و ساختار JSON یکسان داشته باشند.)*

### ۲.۲. اندیکاتورها و اسیلاتورهای باقی‌مانده (`Phase 2 Indicators`)
- **روند:** `Parabolic SAR`، `Ichimoku Kinko Hyo` (`Tenkan 9`, `Kijun 26`, `Senkou A/B` 26 کندل جلوتر، `Chikou 26` عقب‌تر)، `ADX (14)`.
- **مومنتوم و اسیلاتور:** `Stochastic Oscillator (14, 3, 3)` (`%K`, `%D`)، `CCI (20)`، `Williams %R (14)`.
- **نوسان‌پذیری:** `Keltner Channels` (مبتنی بر EMA + ضریب ATR)، `Donchian Channels (20)`.
- **حجم و جریان نقدینگی:** `OBV (On-Balance Volume)`، `Chaikin Money Flow (CMF - 20)`.
- **چندتایم‌فریمه:** `Multi-Timeframe EMA` (نمایش EMA تایم‌فریم بالاتر مثل 4H/1D روی چارت 15m) + تطبیق عددی با `TA-Lib` با تلورانس $< 1e-6$.

### ۲.۳. رکن‌های تحلیل کلان، بین‌بازاری و فیدهای زنده بنیادی (`Live External Feeds & Analytics`)
1. **سشن‌های معاملاتی و کیل‌زون روی بوم (`Killzones`):** علامت‌گذاری بصری Asian Range (`00:00–09:00 UTC`), London (`07:00–16:00 UTC` / `Judas Swing`), New York (`13:00–22:00 UTC`) و London/NY Overlap (`13:00–16:00 UTC`).
2. **تقویم اقتصادی و اخبار کلان (`Macro Context`):** فید واقعی رویدادهای `CPI`, `FOMC`, `NFP`, `PMI` + گزارش‌های هفتگی `EIA/API`, `OPEC+` و `Baker Hughes` + هشدار اسپرد پیش از خبر.
3. **تحلیل بین‌بازاری زنده (`Intermarket & Correlations`):** همبستگی زنده با `DXY`، بازده `US 10Y / 2Y Yields` و مقایسه `SPOTBRENT` vs `USOIL` vs `XLE`.
4. **شیت تحلیل بنیادی متصل به API واقعی (برای `STOCKS` و اخبار):**
   - فید زنده `SEC EDGAR (10-K/10-Q/8-K RSS/API)`، اخبار واقعی `Yahoo Finance / EIA / Fed / Finnhub Free RSS/API`، صورت سود و زیان واقعی (`Annual/Quarterly`)، `Dividends & Payout`، `Analyst Rating & 1Y Target`، `Employees Productivity`، `Seasonals Multi-Year` مبتنی بر کندل‌های چندساله واقعی دیتابیس، کاروسل `Peer Comparison`، `Top Gainers / Losers / Most Active`، تقویم سوددهی (`Yesterday / Today / Tomorrow` + `Surprise %`)، خروجی استاندارد **CSV/JSON تاریخچه کندل‌ها**، و کادر پرس‌وجوی هوشمند AI (`"Why is asset moving today?"`).

---

## ۳. نقشه راه فازهای ۳ تا ۶ (`PLANNED ROADMAP`)

> **قاعده دروازه فازها (`Build → Install → Test → Owner Approval Gate`):** هر فاز پس از تایید عملی فاز قبل آغاز می‌شود.

### فاز ۳ — کیفیت داده، ورود آرشیو تاریخی و Backup/Restore
1. **تشخیص هوشمند Gap (`Smart Gap Detection & Backfill`):** محاسبه کندل‌های جاافتاده بر اساس `expected_delta` و تقویم معاملاتی هر `chart_id`؛ بازیابی کسری فقط از همان `provider_id`.
2. **ورود فایل‌های تاریخی (`Historical Import` & `LocalCsvAdapter`):** آپلود مستقیم آرشیو `EIA Europe Brent Spot FOB` (`RBRTEd.xls` از ۱۹۸۷ تا امروز)، فایل‌های CSV/XLS/JSON و پشتیبان `DataHub (brent-daily.csv)`؛ پشتیبانی از ورود دستی/استخراج عددی بدون ذخیره هیچ تصویر نمودار (`Strict No-Image-Storage Policy`).
3. **Backup & Restore رمزنگاری‌شده در سطح برنامه:** تهیه نسخه پشتیبان رمزنگاری‌شده از جداول MariaDB و نگهداری نسخه مستقل خارج از هاست (با توجه به خاموش بودن `jetbackup5d`).

### فاز ۴ — موتور تحلیل ساختار و پیش‌بینی نسخه اول (`Prediction Engine v1`)
1. **مدل پایه‌ای و پایپ‌لاین ۳ مرحله‌ای مستقل برای هر `chart_id`:**
   - **گام ۱ (موازی):** `DataReadinessMonitor` (بسته‌بودن Gap، تازگی و `Data Readiness Gate`) + `TechnicalStructureAnalyzer` (ترکیب ساختار SMC و اندیکاتورها).
   - **گام ۲ (`Uncertainty & Volatility Specialist`):** سنجش ریسک و بازه عدم‌قطعیت (`q10` تا `q90`) بر مبنای `ATR 14` و خروجی مدل پایه‌ای (`Kronos` — Mini/Small/Base با توکنایزر K-Line دو لایه و فاین‌تیون مستقل به ازای هر `chart_id` یا مدل‌های Baseline/LightGBM بعد از POC).
   - **گام ۳ (`Immutable Prediction Generator`):** صدور پیش‌بینی صرفاً تحلیلی منطبق بر **`forecast-contract/v1`** برای افق‌های `15m`, `1h`, `4h`, `1d` با احتمال‌های `p_bullish + p_bearish + p_neutral = 1.0` و **بدون هرگونه فیلد معامله‌گری (`Buy/Sell/Entry/SL/TP`)**.
2. **قفل سروری و زنجیره هش (`SHA-256 Hash Chain`):** ثبت فقط از مسیر سروری با مهلتی پیش از پایان افق (`append-only`)، ذخیره `previous_hash` و لنگرگذاری دوره‌ای digest خارج از دیتابیس هاست.

### فاز ۵ — حلقه بازخورد زنده، Walk-Forward و حاکمیت مدل
1. **ارزیابی خودکار Outcome و یادگیری شناختی (`Outcome & Learning Evaluator`):** محاسبه `Directional Accuracy`, `Precision/Recall`, `MAE/RMSE`, `Brier Score`, `Quantile Loss`, `Interval Coverage`, `Calibration` و مقایسه در رژیم‌های روندی vs رنج در برابر Baselineها (`Persistence`, `Previous Direction`, `SMA`).
2. **ارزیابی تاریخی (`Purged + Embargoed Walk-Forward`):** جداسازی گزارش `Frozen Model` و `Adaptive Model` بدون نشت آینده.
3. **مدیریت `Champion / Challenger & Rollback`:** ارتقا فقط با عبور از `Promotion Gate`، رعایت `Change Budget`، توقف خودکار هنگام `GAP_OPEN` یا `SOURCE_DEGRADED` (`Freeze Conditions`) و امکان `Rollback` فوری.

### فاز ۶ — شبیه‌ساز مستقل استراتژی و پنل چندکاربره
1. **شبیه‌ساز استراتژی معاملاتی ([`TRADING_STRATEGY_SPEC.md`](../01-product/TRADING_STRATEGY_SPEC.md)):** تبدیل سناریوهای پیش‌بینی به شبیه‌سازی کاملاً آفلاین (`EUR 1,000` سرمایه اولیه، ریسک `1%`، محاسبه کامل `Spread`, `Commission`, `Slippage`, `Swap`، گزارش `Equity Curve`, `Win Rate`, `Profit Factor`, `Max Drawdown`) — **بدون اتصال کارگزاری یا سفارش واقعی**.
2. **مدیریت چندکاربره (`Multi-User Admin UI`):** ساخت و مدیریت حساب کاربران مستقل با واچ‌لیست و فضای کاری جداگانه.
