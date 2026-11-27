# TRADING STRATEGY SPEC

**وضعیت:** **پیاده‌سازی نسخه ۲ روی وب (`signal-gen/1.0` + `strategy-sim/2.0` + `forecast-strategy-bridge/1.0.0` در `v1.47.41` شامل ۵ استراتژی کلاسیک مستقل، Hard Gate نسبت `Net R:R ≥ 2.0`، اعتبارسنجی `Purged Walk-Forward + Final Untouched Holdout`، تفکیک رژیم بازار و پل یک‌طرفه کنترل‌شده `Forecast → Strategy`) و نسخه ۱ (`strategy-sim/1.0`) روی اندروید** — فاز ۶ (Trading Strategy & Offline Simulation).  
**آخرین بازبینی:** 2026-11-26  
**وابسته به:** [`CHART_INTELLIGENCE_MASTER_SPEC.md`](./CHART_INTELLIGENCE_MASTER_SPEC.md) · **معماری و ممیزی فنی:** [`SIGNAL_GENERATOR_AND_RR_INTELLIGENCE_V1.md`](../02-architecture/SIGNAL_GENERATOR_AND_RR_INTELLIGENCE_V1.md) · **برنامه جامع بهبود:** [`FORECAST_AND_STRATEGY_IMPROVEMENT_MASTER_PLAN.md`](../03-roadmap-and-issues/FORECAST_AND_STRATEGY_IMPROVEMENT_MASTER_PLAN.md)  
**واحد شبیه‌سازی:** هر `chart_id` مستقل؛ این سند به فهرست بسته‌ای از Instrumentها وابسته نیست.  
**مرجع داده و پیش‌بینی:** قرارداد Forecast، هویت سری، Data Readiness و Model Governance در [`CHART_INTELLIGENCE_MASTER_SPEC.md`](./CHART_INTELLIGENCE_MASTER_SPEC.md) و [`FORECAST_SYSTEM_SPEC_V1.md`](./FORECAST_SYSTEM_SPEC_V1.md) تعریف می‌شوند؛ ۵ استراتژی کلاسیک (`signal-gen/1.0` / `strategy-sim/2.0`) به‌صورت ۱۰۰٪ مستقل از موتور Forecast و انحصاراً بر پایه هسته قطعی `TechnicalAnalysisCore` (`ta-core/1.1`) اجرا می‌شوند و پل اختیاری یک‌طرفه `Forecast → Strategy` (`forecastStrategyBridge.js`) صرفاً زمانی فعال می‌شود که وضعیت Forecast برابر با `VALID` با لبه اثبات‌شده (`edgeStatus === 'PROVEN'`) باشد.

------------------------------------------------------------------------

# 12. Trading Strategy و Portfolio Simulation — مشخصات پیاده‌سازی‌شده (`strategy-sim/2.0`)

## 12.1 جایگاه این ماژول و استقلال استراتژی‌های کلاسیک از Forecast

۱. **استراتژی‌های کلاسیک مستقل (`S-06`):** هر ۵ استراتژی کلاسیک (`trend_pullback_v1`، `rsi_reversion_v1`، `breakout_v1`، `sma_crossover_v1` و `rsi_dip_v1`) مستقیماً روی کندل‌های بسته‌شده و خروجی‌های علّی `ta-core/1.1` اجرا می‌شوند و حتی در صورت نبود یا نامعتبر بودن Forecast نیز بدون هیچ وابستگی کار می‌کنند.
۲. **پل یک‌طرفه کنترل‌شده `Forecast → Strategy` (`forecast-strategy-bridge/1.0.0`):** مصرف خروجی پیش‌بینی در لایه استراتژی صرفاً از طریق `evaluateForecastStrategyBridge()` در `host_subdomain/assets/js/strategy/forecastStrategyBridge.js` مجاز است و مستلزم عبور هم‌زمان از هر ۸ گیت عبوری است: وضعیت `VALID` + `edgeStatus === 'PROVEN'` + `allowStrategy === true`، غیرتقریبی بودن مدل (`!experimentalOnly`)، تطبیق نماد/تایم‌فریم/کندل مبدأ، و عبور کامل از Hard Gate مستقل استراتژی (`Net R:R ≥ 2.00` پس از کسر هزینه‌ها، نزدیک‌ترین مانع ساختاری علّی به عنوان `TP1` بدون پرش از موانع نزدیک‌تر، و اجرای علّی روی `open` کندل بعدی). پیش‌بینی‌های `PROVISIONAL`، `NO_EDGE`، `INSUFFICIENT_EVIDENCE` و `DATA_NOT_READY` هرگز اجازه تولید سیگنال عملیاتی ندارند.
۳. **نمایش بصری روی بوم نمودار:** سیگنال‌های تأییدشده (`Entry`, `SL`, `TP1`, `TP2` و نواحی ریسک/ریوارد) در نسخه وب (`v1.47.41`) با **تصمیم معماری تأییدشده مالک** مستقیماً روی بوم HTML5 Canvas اختصاصی پروژه (`host_subdomain/assets/js/components/chartRenderer.js`) رسم می‌شوند. سیگنال‌های ردشده (`NO TRADE`) و پیش‌نمایش‌های پژوهشی (`isPreviewOnly: true`) هرگز به‌عنوان فلش خرید/فروش روی نمودار رسم نمی‌شوند.

## 12.2 پارامترهای پایه شبیه‌سازی و سیاست ریسک تک‌نمادی (`portfolioRiskPolicy`)

پارامترهای پیاده‌سازی‌شده در مرحله شبیه‌سازی (`strategy-sim/1.0` و `strategy-sim/2.0`):
- سرمایه اولیه: `Initial Equity = EUR 1,000` (مستقل برای هر `chart_id`)
- ریسک هر معامله: `1% of current equity` (`Risk Budget = Current Equity × 0.01`)
- حداکثر پوزیشن هم‌زمان در هر نمودار: `maxConcurrentPositions = 1`
- سقف اهرم محافظه‌کارانه: `maxLeverage = 5x` و حالت محاسبه حجم `sizingMode = 'UNIT_APPROXIMATION'` (در نبود متادیتای دقیق Tick/Contract کارگزار، با اعلان شفاف در UI)
- کلید قطع خودکار افت سرمایه (اختیاری): `maxDrawdownHaltPct` برای توقف پذیرش معاملات جدید در صورت عبور Drawdown از سقف تعیین‌شده
- محدودیت دامنه پرتفوی: همبستگی چندنمادی (`multiSymbolCorrelationSupported: false`) خارج از دامنه شبیه‌ساز تک‌نمادی فعلی است و صراحتاً در `portfolioRiskPolicy` گزارش می‌شود.

## 12.3 قواعد پیاده‌سازی‌شده استراتژی و Hard Gate ریسک به ریوارد

موارد زیر در `host_subdomain/assets/js/strategy/` پیاده‌سازی و با تست‌های خودکار تأیید شده‌اند:
- **تصمیم در کندل بسته‌شده و اجرا در کندل بعدی (`S-01`):** سیگنال در پایان کندل بسته‌شده `t` تصمیم‌گیری شده و ورود فرضی صرفاً در `open` کندل `t+1` (`NEXT_BAR_OPEN_ONLY`) انجام می‌شود.
- **Stop Loss و Take Profit ساختاری علّی (`S-03`):** حد ضرر به سوئینگ/ناحیه علّی واقعی بعلاوه بافر ATR مقید است و `TP1` منحصراً به نزدیک‌ترین مانع ساختاری مخالف (`SR_RESISTANCE_ZONE`/`SWING_HIGH` در خرید و برعکس در فروش) متصل می‌شود؛ پرش از مانع نزدیک‌تر برای ساخت مصنوعی `R:R ≥ 2.0` اکیداً ممنوع است.
- **قفل غیرقابل‌کاهش `Net R:R ≥ 2.00` (`S-02`):** نسبت خالص ریسک به ریوارد پس از کسر هزینه‌های رفت‌وبرگشت (`Spread + Commission + Slippage`) باید حداقل `2.00` باشد؛ در غیر این صورت کاندید با کد رد صریح (`GROSS_RR_BELOW_MINIMUM` یا `NET_RR_BELOW_MINIMUM`) به `NO TRADE` تبدیل می‌شود.

## 12.4 هزینه‌ها و حاشیه اطمینان

هزینه‌های معامله در Prediction Engine دخالت داده نمی‌شوند، اما در مرحله Trading Strategy (`riskRewardEngine.js` و `signalBacktester.js`) تمام هزینه‌های واقعی لحاظ می‌شوند:
- Bid/Ask Spread (`spreadBps`)
- Commission (`commissionBps` در ورود و خروج)
- Slippage (`slippageBps` در ورود و خروج)
- Swap / Overnight Financing (`swapBpsPerDay`)
- تحلیل حساسیت خودکار در ۴ سطح هزینه: **`0.0x` (Gross)**، **`1.0x` (Base)**، **`1.5x`** و **`2.0x`**

## 12.5 معیارهای عملکرد و پروتکل اعتبارسنجی استراتژی (`Purged Walk-Forward + Final Holdout`)

در `signalBacktester.js` و مودال `Strategy Lab` شاخص‌های زیر به‌صورت استاندارد محاسبه و مستقل از دقت Forecast گزارش می‌شوند:
- `Net Return %`، `Gross Return %`، `CAGR %` (فقط برای بازه ≥ ۳۰ روز)، `Final Equity`
- `Win Rate`، `Profit Factor`، `Expectancy`، `Average R`، `Avg Holding Period`
- `Maximum Drawdown (% & €)`، `Sharpe Ratio`، `Sortino Ratio`، `Max Consecutive Wins/Losses`
- `Exposure`، `Total Costs`، `RR-Rejected Count` و میانگین `Net R:R` پذیرفته‌شده
- **تفکیک زمانی 70/30 (`inSampleOutOfSample`)** و پروتکل **`Purged Walk-Forward + Embargo + Final Untouched Holdout`** (`PURGED_WALK_FORWARD_WITH_UNTOUCHED_HOLDOUT_V1`: رزرو ۲۰٪ پایانی کندل‌ها به عنوان Holdout دست‌نخورده و ارزیابی ۳ فولد زمانی مجزا با فاصله `purgeBars + embargoBars`)
- **تفکیک عملکرد بر اساس رژیم علّی بازار (`regimeBreakdown`):** گزارش جداگانه معاملات در ۵ رژیم `TREND_UP`، `TREND_DOWN`، `RANGE`، `EXPANSION` و `COMPRESSION`

## 12.6 قرارداد اجرای شبیه‌سازی (`strategy-sim/2.0`)

قواعد قطعی اجرا در موتور بک‌تست عبارت‌اند از:
- زمان تصمیم در کلوز کندل `t` (`is_closed === true`) و زمان اجرای فرضی در اوپن کندل `t+1`.
- ابطال سفارش در صورت گپ بازگشایی که پیش از ورود از سطح SL یا TP1 عبور کرده باشد.
- قاعده محافظه‌کارانه **`SL_BEFORE_TP`** در صورت لمس هم‌زمان حد ضرر و حد سود در یک کندل.
- ثبت کامل نسخه استراتژی، پارامترها، کدهای رد کاندیدها (`Diagnostics / NO TRADE`) و `forecastProvenance` (در صورت استفاده از پل Forecast).

## 12.7 ابزارهای تحقیق و منابع GitHub

### 12.7.1 محیط اجرای ابزارهای پژوهشی و شبیه‌سازی

VectorBT و Skfolio کتابخانه‌های Python هستند، نه سرویس میزبانی یا API آنلاین آماده. اجرای آن‌ها باید در محیط پژوهشی جداگانه مانند Notebook یا Container انجام شود؛ خروجی آزمایش‌ها و گزارش‌ها پس از اعتبارسنجی به سند/مخزن نتایج منتقل می‌شوند. وابستگی Prediction Engine آنلاین به Session Notebook یا ماشین آزمایشگاهی ممنوع است. برای اجرای موقت می‌توان Container/Notebook مدیریت‌شده را بررسی کرد؛ برای Jobهای تکرارشونده باید Worker یا Scheduled Job پایدار در نظر گرفته شود.

### VectorBT — ابزار پژوهش و مقایسه فرضیه‌ها (TO VERIFY)

مخزن: `https://github.com/polakowo/vectorbt`

فایل‌های مرجع:
- `README.md`: `https://github.com/polakowo/vectorbt/blob/master/README.md` — API پژوهش داده، Indicator/Signal، آزمایش برداری، مقایسه پارامترها و تحلیل نتایج.
- `LICENSE.md`: `https://github.com/polakowo/vectorbt/blob/master/LICENSE.md` — شرایط Fair-Code که پیش از هر استفاده یا توزیع باید بررسی حقوقی شود.
- مستندات ویژگی‌ها: `https://vectorbt.dev/getting-started/features/` — قابلیت‌های نسخه Community و تفاوت آن با PRO.

کاربرد محدود در این سند: اجرای آزمایش‌های آفلاین برای مقایسه فرضیه‌های استراتژی، بررسی حساسیت پارامترها و تحلیل آماری نتایج شبیه‌سازی، پس از تکمیل Forecast Validation. این ابزار وارد Runtime محصول، Prediction Engine یا رابط آنلاین نمی‌شود. هیچ قابلیت Order Execution، اتصال حساب یا Bot از آن وارد پروژه نمی‌شود. استفاده مستقیم از کتابخانه تا تعیین تکلیف License قطعی نیست.

### Skfolio — مرجع ایده‌های سنجش ریسک و اعتبارسنجی (TO VERIFY؛ بدون وابستگی)

مخزن: `https://github.com/skfolio/skfolio`

منبع بررسی: فایل `README.md` مخزن و مستندات رسمی Skfolio؛ نسخه، License و API باید پیش از هر آزمایش مجدداً بررسی شوند.

ایده‌های قابل بررسی در مرحله Strategy Simulation عبارت‌اند از سنجش Drawdown و ریسک، اعتبارسنجی زمانی و پایداری نتایج در دوره‌های متفاوت. چون تمرکز اصلی کتابخانه بهینه‌سازی پرتفوی است و محصول چند نمودار مستقل دارد، خود کتابخانه وارد هسته نمی‌شود و استفاده از روش‌های آن نیز نیازمند تعریف و آزمون مستقل است.

### TA-Lib — محاسبه Indicator (ارجاع به سند اصلی)

در صورت تأیید POC، Indicatorهای مورد استفاده در Strategy Simulation باید از همان تعریف، پارامتر و نسخه ثبت‌شده در Feature Pipeline سند [`CHART_INTELLIGENCE_MASTER_SPEC.md`](./CHART_INTELLIGENCE_MASTER_SPEC.md) استفاده کنند. منبع: `https://github.com/TA-Lib/ta-lib-python/blob/master/README.md`. محاسبه مجدد با پارامتر یا Warm-up متفاوت در ماژول Strategy مجاز نیست؛ برابری Featureها باید حفظ شود.

## 12.8 مرز قطعی این سند با اجرای معامله

این سند فقط مشخصات پژوهش و شبیه‌سازی آفلاین است. در محصول فعلی هیچ Order API، Broker Account Connector، ثبت/اصلاح/لغو سفارش، اجرای معامله واقعی، مدیریت پوزیشن واقعی یا اتصال به موجودی حساب پیاده‌سازی نمی‌شود. اصطلاحات Entry، SL و TP فقط پارامترهای فرضی شبیه‌سازی و Overlayهای تاریخی هستند.

Freqtrade صراحتاً خارج از دامنه است: مخزن `https://github.com/freqtrade/freqtrade`، فایل `README.md`، یک ربات معامله‌گر رمزارز است؛ هیچ کد یا قابلیت اجرای معامله آن در این پروژه استفاده نمی‌شود.

------------------------------------------------------------------------

# 13. OPEN QUESTIONS و تصمیم‌های لازم برای مرحله Strategy

این بخش فقط ابهام‌های اختصاصی Strategy Simulation را نگه می‌دارد. پرسش‌های معماری داده، Forecast، امنیت، Inference و Model Governance در [`CHART_INTELLIGENCE_MASTER_SPEC.md`](./CHART_INTELLIGENCE_MASTER_SPEC.md) و [`OPEN_ISSUES.md`](../03-roadmap-and-issues/OPEN_ISSUES.md) مرجع دارند و اینجا تکرار نمی‌شوند.

## 13.1 وضعیت پیاده‌سازی Equity و دامنه پرتفوی (`strategy-sim/1.0`)

- **تصمیم پیاده‌سازی‌شده (`v1.47.41`):** سرمایه اولیه پیش‌فرض **`Initial Equity = EUR 1,000`** به‌صورت کاملاً مستقل برای هر `chart_id` اجرا می‌شود (`strategySimulator.js` روی وب و `StrategySimulatorAlgorithm.kt` روی اندروید) و خروجی چند نمودار هرگز به‌عنوان پرتفوی مشترک ادغام نمی‌شود.
- *(موضوع باز آینده)*: تخصیص سرمایه مشترک بین چند نمودار و کنترل هم‌زمانی ریسک پرتفوی همچنان خارج از نسخه `1.0` باقی می‌ماند.

## 13.2 وضعیت پیاده‌سازی تعریف ریسک هر معامله (`strategy-sim/1.0`)

- **تصمیم پیاده‌سازی‌شده (`v1.47.41`):** بودجه ریسک هر معامله معادل **`1%` از Equity جاری** تا فاصله حد ضرر (`ATR(14) × atrStopMult`) با سقف اهرم محافظه‌کارانه (`maxLeverage = 5x`) و حداکثر یک پوزیشن باز در هر `chart_id` محاسبه می‌شود؛ هزینه‌های صریح معاملاتی (`Spread`, `Commission`, `Slippage`, `Swap`) به‌صورت جداگانه از سود ناخالص کسر و گزارش می‌شوند.

## 13.3 وضعیت پیاده‌سازی قواعد ورود، خروج و Hard Gate ریسک به ریوارد (`signal-gen/1.0` + `strategy-sim/2.0`)

- **قانون غیرقابل‌مذاکره (`Hard Gate` — `riskRewardEngine.js`):** حداقل نسبت خالص ریسک به ریوارد **`MINIMUM_REQUIRED_RR = 2.0`** در کد و UI قفل شده و غیرقابل کاهش است. حد ضرر (SL) و حد سود اول (`TP1` و `TP2` اختیاری) منحصراً از ساختار واقعی علّی نمودار (`Swings` و `S/R Zones` تأییدشده تا کندل `i`) استخراج می‌شوند؛ دورتر کردن مصنوعی TP صرفاً برای رسیدن به 1:2 یا 1:3 اکیداً ممنوع است. اگر نسبت Gross R:R مثلاً `2.10` باشد اما هزینه‌های معاملاتی (`Spread + Commission + Slippage`) نسبت خالص `Net R:R` را به زیر `2.00` (مثلاً `1.95`) کاهش دهند، سیگنال با خروجی صریح **`NO TRADE`** رد می‌شود.
- **۵ استراتژی کلاسیک مستقل روی وب (`host_subdomain/assets/js/strategy/classicalGenerators.js` — مبتنی بر `ta-core/1.1`):**
  1. `trend_pullback_v1` (اولویت بالا: روند `SMA 20/50/200` + پولبک به ناحیه `SMA 20–50` + کندل تأیید و شکست کندل قبلی)
  2. `rsi_reversion_v1` (اولویت بالا: فیلتر `SMA 200` + واریانت `RSI(14)` با آستانه `30/35/40` و واریانت `Connors RSI(2) < 10` با قاعده خروج مجزای `Close > SMA(5)`)
  3. `breakout_v1` (شکست کانال علّی `Donchian N` صرفاً روی `[i-N .. i-1]` بدون کندل جاری + فیلتر ضد شکست جعلی + فیلترهای اختیاری حجم و ATR/روند)
  4. `sma_crossover_v1` (تقاطع کلاسیک `20/50` و `50/200` با فیلترهای اختیاری موقعیت Close و قدرت روند)
  5. `rsi_dip_v1` (صرفاً **مبنای مقایسه پژوهشی** — نسخه پایه ضعیف‌تر برای مقایسه شفاف در کنار استراتژی‌های اصلی بدون پنهان‌کردن نتایج ضعیف)
- **پریست‌های Legacy (`strategy-sim/1.0`):** هر ۴ پریست نسخه ۱ (`EMA_TREND_PULLBACK`, `SR_ZONE_PATTERN_BOUNCE`, `SUPERTREND_MOMENTUM`, `BOLLINGER_MEAN_REVERSION`) برای سازگاری عقب‌رو در وب و اندروید حفظ شده‌اند.
- *(موضوع باز آینده)*: هم‌ترازی اندروید با `signal-gen/1.0` / `strategy-sim/2.0` و اتصال اختیاری به `forecast-contract/v2` پس از تکمیل ارزیابی OOS موتور پیش‌بینی انجام خواهد شد.

## 13.4 وضعیت پیاده‌سازی واقع‌گرایی اجرای شبیه‌سازی (`strategy-sim/2.0`)

- **سیاست محافظه‌کارانه برخورد هم‌زمان SL/TP (`SL_BEFORE_TP`):** پیاده‌سازی و با تست‌های واحد تأیید شد که در صورت لمس هم‌زمان حد ضرر و حد سود در یک کندل، **حد ضرر پیش از حد سود (`SL_HIT`)** اعمال می‌شود؛ همچنین گپ بازگشایی که از SL یا TP1 عبور کرده باشد از پرشدن کاذب جلوگیری می‌کند.
- **حساسیت به هزینه (`Cost Sensitivity`) و تفکیک زمانی (`IS/OOS`):** هر اجرا به‌صورت خودکار سناریوهای **`0.0x` (Gross/بدون هزینه)**، **`1.0x` (پایه)**، **`1.5x`** و **`2.0x`** بعلاوه تفکیک زمانی **`70% In-Sample / 30% Out-of-Sample`** بدون نشت داده را محاسبه می‌کند.
- **شاخص‌های کامل گزارش‌شده:** `Net Return`، `Gross Return`، `CAGR` (فقط برای بازه ≥ ۳۰ روز)، `Final Equity`، `Win Rate`، `Profit Factor`، `Expectancy`، `Average R`، `Avg Holding Period`، `Maximum Drawdown`، `Sharpe Ratio`، `Sortino Ratio`، `Max Consecutive Wins/Losses`، `Total Costs`، تعداد سیگنال‌های ردشده توسط Hard Gate (`RR-Rejected Count`)، میانگین `Net R:R` پذیرفته‌شده، جدول مقایسه تمام استراتژی‌ها، تب `Diagnostics (NO TRADE)`، نمودار `Equity Curve` و دفتر کل معاملات شبیه‌سازی‌شده (`Trade Ledger`).

## 13.5 OPEN — معیار پذیرش Strategy

- حداقل تعداد معامله، حداقل طول دوره آزمون، مشخصات دقیق Tick/Contract هر کارگزار (در نبود آن از `UNIT_APPROXIMATION` با اعلان شفاف در UI استفاده می‌شود) و آستانه‌های پذیرش رسمی بین رژیم‌های مختلف بازار همچنان باز هستند؛ لذا تمام خروجی‌های `Strategy Lab` با برچسب شفاف **«پژوهشی و شبیه‌سازی آفلاین — بدون اتصال به کارگزاری»** نمایش داده می‌شوند. جزئیات کامل معماری، منابع اوپن‌سورس (MIT) و شفاف‌سازی عدم دسترسی عمومی به پست `@sopersone` / `GrokBot Strategy Library` در [`SIGNAL_GENERATOR_AND_RR_INTELLIGENCE_V1.md`](../02-architecture/SIGNAL_GENERATOR_AND_RR_INTELLIGENCE_V1.md) ثبت شده است.

## 13.6 قواعد اتصال به داده، واچ‌لیست و هزینه Provider

- هر شبیه‌سازی به یک `chart_id` و منبع داده انتخاب‌شده (`source_id`) در **واچ‌لیست (`Watchlist`)** کاربر متصل است؛ داده، قیمت و هزینه‌های همان نمودار و همان منبع (مانند `Twelve Data API` با کلید ذخیره‌شده در GitHub Secrets برای `M15` یا منبع رسمی **`EIA Europe Brent Spot Price FOB`** از سال ۱۹۸۷ برای بک‌تست‌های روزانه `D1` و بلندمدت برنت اسپات) مبنا قرار می‌گیرند.
- اختلاف قیمت یا هزینه بین نمودارهای مستقل (مثلاً بین `EIA Brent Spot FOB`، `Brent Futures BZ=F` و `Brent CFD`) نباید با یکدیگر ادغام شود و داده روزانه `EIA` هرگز برای ساخت مصنوعی کندل‌های `M15` استفاده نمی‌شود.
- محصول به اشتراک پولی TradingView یا API پولی مرکزی وابسته نیست.
- اگر کاربر API پولی خودش را به‌صورت BYOK متصل کرده باشد، هزینه و محدودیت آن Provider متعلق به همان کاربر است؛ Strategy Simulation نباید بدون اجازه کاربر هزینه یا مصرف API ایجاد کند.
- هیچ اتصال حساب معاملاتی، سفارش واقعی یا اجرای معامله از طریق API Provider مجاز نیست.
- **قانون به‌روزرسانی درجا برای هوش‌های مصنوعی:** هرگونه جمع‌بندی یا تغییر تصمیم در خصوص قواعد شبیه‌سازی استراتژی باید بلافاصله و بدون نیاز به یادآوری کاربر، درجا (In-Place) در بخش مربوطه همین سند اعمال شود و از افزودن وصله‌پینه به انتهای فایل خودداری گردد.
