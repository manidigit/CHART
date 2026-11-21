# CHART — برنامه اجرایی تثبیت هسته تحلیل و ترسیم نمودار

**نسخه:** 1.2  
**تاریخ:** 2026-11-21  
**وضعیت:** VERIFIED — تمامی فازهای A تا F (`ta-core/1.1`) در وب و اندروید پیاده‌سازی، هم‌تراز و با تست مرجع مشترک تأیید شدند  
**دامنه:** هسته مشترک تحلیل و ترسیم؛ مستقل از مدل‌های هوش مصنوعی

## 1. تصمیم اجرایی

توسعه از این نقطه به بعد با ترتیب «داده معتبر ← محاسبه و تشخیص ← هندسه ترسیم ← نمایش و اعتبارسنجی ← اتصال مدل» انجام می‌شود. افزودن مدل‌های متعدد، آموزش مدل یا بهینه‌سازی پیش‌بینی قیمت تا زمان تثبیت هسته، اولویت توسعه نیست.

هدف این مرحله تولید نموداری است که بتوان به تک‌تک اجزای آن اعتماد کرد: هر کندل از داده معتبر، هر خط از محاسبه مشخص، هر سطح از شواهد کندلی و هر شکل از مختصات زمانی/قیمتی قابل ردیابی ساخته شود.

## 2. معماری هدف

```text
Market Data
    │
    ▼
Candle Validation & Normalization
    │
    ▼
Deterministic Analysis Core
    ├── Indicators & Statistics
    ├── Trend / Swings / Market Structure
    ├── Support & Resistance Zones
    ├── Candlestick / Chart Patterns
    └── Evidence + Confidence + Source Candle IDs
    │
    ▼
Canonical Analysis Result (versioned schema)
    │
    ├── Chart Renderer (candles, bands, lines, zones, pattern geometry)
    ├── Analysis UI / Explanations
    └── AI Adapter (optional, replaceable; no authority over raw calculations)
```

اندروید و وب می‌توانند Renderer بومی خود را داشته باشند، اما تعریف داده، فرمول‌ها، پارامترها، زمان‌بندی کندل و معنای خروجی تحلیلی باید قرارداد یکسان و تست‌های مرجع مشترک داشته باشند.

## 3. ممیزی اولیه کد موجود در main

این فهرست صرفاً وجود پیاده‌سازی را ثبت می‌کند؛ وجود تابع به معنی صحت کامل، تطبیق بین وب و اندروید یا تأیید بصری نیست.

| حوزه | کد شناسایی‌شده | وضعیت اولیه |
|---|---|---|
| اعتبارسنجی کندل | `CandleValidatorAlgorithm.kt` | موجود؛ دامنه تست و رفتار داده ناقص باید ممیزی شود |
| میانگین‌ها و اندیکاتورهای پایه | `PriceFormatterAlgorithm.kt` | SMA، EMA، Bollinger، VWAP، ATR، Supertrend، RSI و MACD موجود |
| اندیکاتورهای تکمیلی | `Phase2IndicatorsAlgorithm.kt` | PSAR، Ichimoku، Keltner، Donchian، ADX/DMI، Stochastic، CCI و Williams %R موجود |
| ساختار/هندسه ترسیم | `DrawingGeometryAlgorithm.kt` | ابزارهای هندسی و محاسباتی متعدد موجود |
| ترسیم اندروید | `CandlestickCanvas.kt` و Rendererهای مرتبط | Canvas و لایه‌های ترسیمی موجود |
| تحلیل ساختار بازار | `PriceFormatterAlgorithm.kt` و `GapDetectorAlgorithm.kt` | بخشی از SMC/FVG موجود؛ صحت و قرارداد خروجی نیازمند تست |
| وب | `host_subdomain/assets/js/algorithms/` و `components/chartRenderer.js` | پیاده‌سازی موازی وجود دارد؛ parity با اندروید باید سنجیده شود |

### یافته‌های مهم از بررسی اولیه

- Bollinger Bands در اندروید از SMA و انحراف معیار جمعیت (تقسیم بر طول پنجره) استفاده می‌کند؛ پارامترهای فعلی در Canvas از Preferences گرفته می‌شوند و در آن نقطه به بازه‌های 5..200 و 0.5..5 محدود شده‌اند. این رفتار باید با مرجع محاسباتی و تنظیمات UI تطبیق داده شود.
- محاسبه برخی اندیکاتورها در Renderer انجام می‌شود. در مسیر هدف، محاسبه باید از ترسیم جدا شود تا داده تحلیلی مستقل از UI قابل تست و مصرف باشد.
- کد اندروید و وب دو مسیر پیاده‌سازی دارند؛ تغییر فرمول در یک کلاینت بدون تست تطبیق، خطر واگرایی خروجی دارد.
- الگو یا سطحی که فقط به شکل بصری ترسیم شده اما شناسه کندل‌های مؤثر و قیمت/زمان لنگرهای آن مشخص نیست، خروجی قابل قبول موتور تحلیل نیست.

## 4. فازهای اجرایی و ترتیب تحویل

### فاز A — تثبیت داده و قرارداد کندل (`VERIFIED — 2026-11-21`)
- `[x]` یکسان‌سازی ترتیب زمانی صعودی، یکتایی timestamp، OHLC معتبر، مدیریت gap و کندل ناقص در `TechnicalAnalysisCore.normalizeCandles` (وب و اندروید).
- `[x]` تفکیک کندل بسته‌شده از کندل در حال تشکیل (`excludeOpenBars`) بدون تغییر دقت `BigDecimal` و بدون ساخت کندل مصنوعی.
- `[x]` گزارش شفاف کیفیت داده (`CandleQualityReport`: `validCount`، `droppedInvalidCount`، `deduplicatedCount`، `droppedOpenCount`، `wasUnsorted`، `gapCount`، `integrityRatio`).
- `[x]` قرارداد مشترک نماد، منبع، تایم‌فریم، منطقه زمانی و session calendar همراه با تست مرجع (`tests/fixtures/ta_core_golden_fixture.json`).

### فاز B — موتور محاسبات قطعی (`VERIFIED — 2026-11-21`)
- `[x]` انتقال محاسبات ۲۶ اندیکاتور/لایه از داخل `CandlestickCanvas.kt` به لایه مستقل `TechnicalAnalysisCore.computeChartBundle` (اندروید) و همتای وب (`host_subdomain/assets/js/algorithms/technicalAnalysisCore.js`).
- `[x]` اصلاح فرمول واریانس `computeBollingerBands` در وب به روش پایدار دوگذره (`Σ(c - mean)² / n`) هم‌تراز با اندروید برای جلوگیری از خطای اعشاری در قیمت‌های بالا (`BTCUSD`).
- `[x]` هم‌ترازی عددی ۱۰۰٪ (خطا `< 1e-6`) برای SMA، EMA، Bollinger Bands، ATR، RSI، MACD، VWAP و Supertrend روی Fixture مشترک (`TA-CORE-AB-01` در وب و `taCore_phaseAB_goldenFixtureParityAndRendererDecoupling` در اندروید) با حفظ کامل مقدار `null` در بازه warm-up.

### فاز C — ساختار قیمت و سطوح (`VERIFIED — 2026-11-21`)
- `[x]` Swing High/Low علّی (`detectSwingsAndTrend` با `confirmIndex = index + swingLen`)؛ بدون استفاده از داده آینده (تضمین‌شده با تست prefix truncation در وب و اندروید).
- `[x]` طبقه‌بندی قطعی روند (`UPTREND`، `DOWNTREND`، `RANGE`، `INSUFFICIENT_DATA`) صرفاً بر پایه توالی سقف/کف‌های تأییدشده (`HH/HL`, `LH/LL`) همراه با `trendReason` شفاف.
- `[x]` نواحی حمایت و مقاومت مبتنی بر شواهد (`detectSupportResistanceZones`) با قفل سخت حداقل ۲ برخورد تأییدشده (`touchCount >= 2`)، ذخیره `lowPrice`/`highPrice`/`centerPrice`، شناسه و زمان کندل‌های شواهد، شمارش `wickRejectionCount` و `distancePct`.
- `[x]` تفکیک وضعیت چرخه عمر ناحیه (`ACTIVE` / `BROKEN` / `RETESTED`) با ثبت `breakIndex`، `breakTimeUtcMs`، `retestIndex` و `invalidationReason`؛ جلوگیری کامل از ساخت سطوح تک‌برخوردی بی‌پشتوانه.

### فاز D — تشخیص الگوها (`VERIFIED — 2026-11-21`)
- `[x]` موتور قطعی تشخیص ۷ الگوی کندلی پرکاربرد (`detectCandlestickPatterns`): `DOJI`، `HAMMER`، `SHOOTING_STAR`، `BULLISH_PIN_BAR`، `BEARISH_PIN_BAR`، `BULLISH_ENGULFING` و `BEARISH_ENGULFING`.
- `[x]` ثبت کامل metadata و شواهد عددی برای هر الگو: `patternId`، `type`، `shortLabel`، `direction`، `anchorIndex`، `anchorTimeUtcMs`، `candleIndices`، `candleTimesUtcMs`، `priceLow`/`priceHigh`/`markerPrice` و `evidence` (`bodyRatio`, `upperWickRatio`, `lowerWickRatio`, `rangeAtrRatio`).
- `[x]` فیلتر نوسان بر پایه ATR محلی (`rangeAtrRatio >= 0.25`) برای جلوگیری از تشخیص کاذب روی کندل‌های مرده/نویزی؛ مستقل از مدل‌های AI.

### فاز E — قرارداد هندسه و ترسیم (`VERIFIED — 2026-11-21`)
- `[x]` مدل ۱۰۰٪ مستقل از پیکسل در خروجی `TechnicalAnalysisCore`: تمام نواحی S/R و الگوهای کندلی بر حسب اندیس، `openTimeUtcMs` و قیمت واقعی ذخیره می‌شوند و Renderer بومی وب (`chartRenderer.js`) و اندروید (`CandlestickCanvas.kt`) آن‌ها را در زمان رسم (با احترام کامل به `zoom`، `pan` و `log scale`) به مختصات صفحه نگاشت می‌کنند.
- `[x]` افزودن سوییچ‌های اختیاری و همگام‌سازی‌شده در هر دو کلاینت (`showSrZones` و `showCandlePatterns`) در `ChartTabState`/`ChartPreferences`/`WorkspaceRepository`/`MainViewModel`/`ChartViewScreen` (اندروید) و `store.js`/`apiService.js`/`headerView.js`/`toolRailView.js`/`app.js`/`chartRenderer.js` (وب).
- `[x]` رسم نواحی S/R به‌صورت باکس نیمه‌شفاف با خط میانی، خط‌چین برای نواحی `RETESTED`/`BROKEN` و برچسب راست‌چین ضدتداخل (`SUP ×N`, `RES ×N`, `SUP*`, `BRK-S`)؛ رسم الگوهای کندلی با نشانگرهای متصل به `low`/`high` واقعی (`▲`/`▼`/`◆`) و نشانگر کوتاه (`HAM`/`STR`/`ENG`/`PIN`/`DOJ`).

### فاز F — تطبیق وب/اندروید و پذیرش (`VERIFIED — 2026-11-21`)
- `[x]` قرارداد خروجی Canonical نسخه‌دار `ta-core/1.1` (`buildCanonicalAnalysis`) شامل `quality`، `timestamps`، `indicators`، `structures` و `patterns` با تطبیق ساختاری و عددی بین وب و اندروید.
- `[x]` آزمون مرجع مشترک فازهای A–F روی دو Fixture استاندارد (`tests/fixtures/ta_core_golden_fixture.json` و `tests/fixtures/ta_core_cf_golden_fixture.json`) به همراه کندل‌های واقعی ۲۶۰تایی `tests/fixtures/spotbrent_m15_sample.json` در هر دو مجموعه تست (`TA-CORE-AB-01` + `TA-CORE-CF-01` در وب و `taCore_phaseAB_*` + `taCore_phaseCF_*` در اندروید).
- `[x]` پوشش کامل سناریوهای داده کم، قیمت ثابت، حجم صفر، داده نامرتب/تکراری/باز، روند صعودی/نزولی/رنج، شکست و ریتست S/R و هر ۷ الگوی کندلی.

## 5. قرارداد خروجی canonical

هر تحلیل باید حداقل این metadata را داشته باشد:

- `schema_version`, `chart_id`, `provider`, `timeframe`, `calculated_at`
- `source_candle_range` و شناسه/زمان کندل‌های ورودی
- `indicators[]`: نام، پارامترها، timestamp/value، warm-up و واحد
- `structures[]`: نوع، جهت، anchorها، محدوده قیمت، زمان، شواهد، وضعیت و invalidation
- `patterns[]`: شناسه، نوع، کندل‌های سازنده، geometry، پارامتر و evidence
- `quality`: خطاهای داده، gapها، تعداد کندل معتبر و محدودیت‌های تحلیل

هیچ عدد یا ترسیمی بدون امکان ردیابی به ورودی و نسخه الگوریتم نباید به‌عنوان نتیجه قطعی منتشر شود.

## 6. معیارهای پذیرش

1. OHLC رسم‌شده با مقادیر کندل منبع یکسان باشد؛ هیچ کندل مصنوعی برای پرکردن فاصله داده ساخته نشود.
2. Bollinger Bands در fixtureهای مرجع از نظر middle/upper/lower با tolerance عددی مشخص برابر باشد.
3. اندیکاتورها برای warm-up مقدار null داشته باشند و در Renderer به خط صفر یا اتصال گمراه‌کننده تبدیل نشوند.
4. حمایت/مقاومت فقط با شواهد کندلی ثبت شود و تمام anchorها قابل مشاهده و بازبینی باشند.
5. الگوها دقیقاً به کندل‌های تشکیل‌دهنده متصل باشند؛ تشخیص بدون evidence مردود است.
6. نتایج عددی وب و اندروید برای fixture یکسان، در tolerance تعریف‌شده یکسان باشند.
7. zoom/pan/log scale صرفاً تبدیل مختصات نمایشی باشد و مقادیر تحلیلی را تغییر ندهد.
8. شکست پیش‌بینی قیمت، به‌تنهایی معیار رد هسته تحلیل نیست.

## 7. قواعد توسعه

- قبل از افزودن الگوریتم جدید، پیاده‌سازی موجود بررسی و در صورت امکان اصلاح شود؛ الگوریتم تکراری ساخته نشود.
- هیچ تغییر فرمول بدون تست مرجع و ثبت پارامترهای قبلی/جدید پذیرفته نیست.
- هیچ تغییر گسترده در نمودار یا Renderer بدون fixture تصویری/داده‌ای انجام نشود.
- مدل‌های AI، Forecast و Chronos خارج از مسیر بحرانی این فاز هستند.
- هر قابلیت فقط پس از تست کد و تطبیق خروجی با مرجع، `VERIFIED` اعلام می‌شود.

## 8. وضعیت اجرایی و گام بعدی

تمامی فازهای **A تا F** (`ta-core/1.1`) در تاریخ `2026-11-21` در هر دو پلتفرم وب و اندروید پیاده‌سازی، به لایه‌های ترسیم (`chartRenderer.js` و `CandlestickCanvas.kt`) و همگام‌سازی Workspace متصل و با تست‌های مرجع مشترک (`tests/fixtures/ta_core_golden_fixture.json`، `tests/fixtures/ta_core_cf_golden_fixture.json` و `tests/fixtures/spotbrent_m15_sample.json`) تأیید شدند (`VERIFIED`). این سند به‌عنوان هسته قطعی تثبیت‌شده (`ta-core/1.1`) بسته می‌شود و آماده تغذیه لایه‌های بعدی (از جمله Object Tree و اتصال اختیاری مدل‌های تحلیلی آینده) است.
