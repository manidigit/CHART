# CHART — مشخصات طراحی و ساختار میزکار نمودار (DESIGN_WORKSPACE_SPEC)

> **شناسه سند:** `DESIGN_WORKSPACE_SPEC` · **نسخه:** `1.38.1` · **تاریخ بازبینی:** `2026-11-13`  
> **وضعیت:** `DECIDED` — مرجع استانداردهای طراحی بصری، چیدمان دسکتاپ و موبایل، لایه‌های رندر، اولویت لمسی و توکن‌های رنگی در هر دو پلتفرم Web و Android.

---

## ۱. فلسفه طراحی و مثلث تمایز محصول (Product Identity Triangle)

میزکار نمودار (**Chart Workspace**) قلب پلتفرم **CHART** است و بر سه اصل بنا شده است:

1. **TradingView در ظاهر (Visual Standard):** چیدمان مهندسی‌شده، پالت تیره مالی استاندارد (`#131722`)، خطوط شبکه ظریف (`#2A2E39`)، تایپوگرافی اعداد یکنواخت (`JetBrains Mono` LTR) و حذف شلوغی‌های بصری.
2. **TradingView در تعامل (Interaction Ergonomics):** کراس‌هیر مغناطیسی دقیق (و کراس‌هیر پیوسته با نگه‌داشتن طولانی انگشت + ویبره در موبایل)، زوم و پیمایش ۶۰ فریم بر ثانیه، نوارهای ابزار فشرده، دسترسی سریع به تایم‌فریم‌ها و چرخه حیات کامل اشیای ترسیمی (انتخاب، جابه‌جایی، تغییر رنگ/ضخامت و حذف).
3. **CHART در هوشمندی (Core Competitive Advantage):** لایه‌های تشخیص ساختار بازار (`BOS/CHoCH`, `EQH/EQL`, `FVG`), پروفایل حجم (`Session VRVP`) و در فازهای ۴ و ۵ نمایش بازه‌های پیش‌بینی تغییرناپذیر (`Immutable Forecast Zones`) و سنجش زنده خطا.

---

## ۲. معماری کلان و طرح ساختاری محیط نمودار (Structural Layout)

محیط نمودار بدون اسکرول عمودی یا افقی در سطح صفحه (`100vh` در دسکتاپ / `100dvh` و `Modifier.fillMaxSize()` در موبایل) طراحی می‌شود تا **۸۵٪ تا ۹۰٪ مساحت صفحه** منحصراً در اختیار بوم کندل‌ها باشد.

### ۲.۱. طرح ساختاری دسکتاپ و صفحات عریض (Web Expanded Layout)

```text
+------------------------------------------------------------------------------------------------------------------+
| [1] UNIFIED TOP HEADER BAR & OPEN TABS STRIP:                                                                    |
|     [CI] | [Tab1: SPOTBRENT 15m ✕] [Tab2: XAUUSD 15m ✕] [+] | [15m 30m 1h 4h 1D 1W] | [🕯 📈] | [fx اندیکاتورها] | [● زنده] |
+------+---------------------------------------------------------------+-----------+------------------------+------+
| [2]  | [3] CHART CANVAS - MAIN PANE (position: absolute; inset: 0)   | [4] RIGHT | [5] RIGHT SPLIT PANEL  | [6]  |
| LEFT |   +-------------------------------------------------------+   | NICE-NUM  | (Resizable 185..520px) | DOCK |
| DRAW |   | [3.1] LIVE OHLCV + ACTIVE INDICATOR PILLS OVERLAY     |   | PRICE     | [5.1] WATCHLIST PANE   | RAIL |
| RAIL |   +-------------------------------------------------------+   | AXIS      |  [Filter▾] [Search][+] |      |
| 38px |                                                               | (64px)    |  🪙 XAUUSD    4134.03  | [📋] |
|      |                     Candlesticks + SMA/EMA/BB/ST/VWAP/SMC     |   94.00   |  🛢️ SPOTBRENT  93.485  | [📊] |
| [+]  |                     + Interactive Drawings                    |   93.50   |                        | [🎯] |
| [/]  |                                                               | [93.485]  | === ROW RESIZER ===    | [⚙]  |
| [-]  +---------------------------------------------------------------+   93.00   |                        |      |
| [|]  | [3.2] LOWER SYNCHRONIZED PANES (Volume / RSI / MACD / ATR)    |   92.50   | [5.2] SYMBOL DETAILS   | [FA] |
| [🎨] +---------------------------------------------------------------+-----------+  Single-line Header +  | [☀]  |
| [🔍] | [3.3] SMART SPAN-AWARE TIME AXIS (Hours / Days / Months / Years)          |  Key Stats & Tech/Pivot| [↪]  |
| [🗑] +---------------------------------------------------------------------------+                        |      |
|      | [7] BOTTOM CHART BAR (28px): [1D..All] | [⤢] [⏭] | UTC/Local Clock | [log] [auto]                 |      |
+------+---------------------------------------------------------------------------+------------------------+------+
```

### ۲.۲. طرح ساختاری نسخه موبایل و اندروید (Mobile / Compact 5-Layer Layout)

در موبایل، صفحه چارت دقیقاً از **۵ لایه عمودی** تشکیل شده است و رعایت `statusBarsPadding()` و حداقل ابعاد لمسی **`48dp × 48dp`** الزامی است:

```text
+---------------------------------------------------+
| [1] SYSTEM STATUS BAR SAFE INSET (Camera/Battery) |  <-- Mandatory statusBarsPadding()
+---------------------------------------------------+
| [2] COMPACT SYMBOL HEADER (48dp) + CHART TAB BAR: |
|     [SPOTBRENT 15m ✕] [XAUUSD 15m ✕] [+] | [Live] |
|     *(Source badge is read-only; set in Settings)*|
+---------------------------------------+-----------+
| [3] LIVE OHLC LEGEND (Compact)        |           |
|     O 4068.1  H 4071.5  L 4067.0      | PRICE     |
|                                       | AXIS      |
|                                       | (60dp)    |
|           MAIN CHART CANVAS           |           |
|        (85%+ of Viewport Height)      | 4072.00   |
|                                       | [4069.63] |
|                                       | 4065.00   |
+---------------------------------------+-----------+
| === DRAGGABLE PANE SPLITTER (16dp hit zone) ===   |
+---------------------------------------+-----------+
|     VOLUME / OSCILLATOR SUB-PANE      | Osc Axis  |
+---------------------------------------+-----------+
|     TIME AXIS (24dp): 15:00   18:00   21:00       |
+---------------------------------------------------+
| [4] BOTTOM CHART CONTROL BAR (46dp):              |
|     [XAUUSD ▾] | [15m] | [✏ Draw] | [fx] | [⋯]   |
+---------------------------------------------------+
*(Note: Main 4-Tab Bottom Navigation Bar is hidden inside Chart View on Android so the chart maximizes viewport height; Back navigates back to Watchlist/previous tab.)*
```

### ۲.۳. قواعد اجباری چیدمان موبایل و واچ‌لیست (TradingView Mobile Rules)
- **واچ‌لیست فشرده (`56–64dp`):** سطر تک‌خطی شامل آیکون دایره‌ای نماد (`AssetIcon`)، نام نماد و توضیح کوتاه در چپ، قیمت `JetBrains Mono` LTR و درصد تغییر سبز/قرمز در راست. لمس کل سطر به چارت (یا در صورت فعال‌بودن `Show symbol screen` به شیت جزئیات) می‌رود؛ پشتیبانی از `Swipe-to-Delete` و `Pull-to-Refresh`.
- **تنظیمات ۵ بخشی (`Settings`):** گروه‌بندی تمیز در ۵ زبانه (`همگام‌سازی | چارت | نوتیفیکیشن | تم | حساب` / `Sync | Chart | Notifications | Theme | Account`) با دو کمبوباکس کناری (`Market Category` و `Data Source`) و کارت‌های تمام‌عرض ریسپانسیو در موبایل.
- **حداقل ابعاد لمسی و دسترسی‌پذیری:** تمام دکمه‌ها، سواتچ‌ها و آیکون‌های نوار ابزار رسم و منوی `⋯` حداقل `48×48dp`؛ پشتیبانی از `prefers-reduced-motion: reduce` و افزودن پدینگ انتهای لیست (`bottom = 32.dp`) در شیت‌ها.

---

## ۳. جدول مسئولیت‌های کامپوننت‌های میزکار (Component Map in Actual Code)

| بخش اصلی | مسئولیت‌های کلیدی | پیاده‌سازی وب (`host_subdomain/assets/`) | پیاده‌سازی اندروید (`app/src/main/java/...`) |
|---|---|---|---|
| **۱. نوار بالایی و تب‌ها** | نوار تب‌های باز چارت (`✕` و `+`), تایم‌فریم‌ها (`M15..W1`), سبک نمودار (`Candles`/`Line`), دکمه اندیکاتورها و نشانگر ۵گانه وضعیت بازار (`Live`, `Market Closed`, `Cached`, `Sync Error`, `API Key Required`) | `js/views/headerView.js`, `js/app.js` | `ui/components/ChartTabBar.kt`, `ui/screens/ChartViewScreen.kt` |
| **۲. ابزارهای رسم و چرخه اشیا** | نوار عمودی ۴۲px در دسکتاپ / گرید ۴ ستونه داخل BottomSheet در موبایل + Hit-testing، دستگیره‌های لنگر، جابه‌جایی، تغییر رنگ/ضخامت و حذف | `js/views/toolRailView.js`, `js/algorithms/drawingGeometry.js`, `js/app.js` | `ui/components/DrawingToolbar.kt`, `algorithms/DrawingGeometryAlgorithm.kt`, `ui/state/coordinators/ChartDrawingCoordinator.kt` |
| **۳. بوم مرکزی نمودار و پنل‌ها** | رندر کندل‌ها، حجم، اسیلاتورها (`RSI 14`, `MACD`, `ATR 14`), اندیکاتورهای هم‌پوشان (`SMA`, `EMA`, `BB`, `Supertrend`, `VWAP`, `MACD Classic Overlay`), ساختار بازار (`BOS/CHoCH`, `EQH/EQL`, `FVG`, `VRVP`), محور قیمت Heckbert (`Auto`/`Log`/Countdown), محور زمان UTC/Local، لژاند OHLC و Splitter بین پنل‌ها | `js/components/chartRenderer.js`, `js/algorithms/technicalIndicators.js`, `js/algorithms/priceFormatter.js`, `js/app.js` | `ui/components/CandlestickCanvas.kt`, `algorithms/PriceFormatterAlgorithm.kt`, `algorithms/UtcTimeAnchorAlgorithm.kt` |
| **۴. نوار وضعیت و بازه‌های پایینی** | چیپ‌های بازه تاریخی (`1D..All`) با سوئیچ خودکار رزولوشن، دکمه‌های Fit (`⤢`) و Latest (`⏭`), ساعت زنده `UTC / Local`، دکمه‌های `[log]` و `[auto]` | `js/views/headerView.js`, `js/app.js` | `ui/screens/ChartViewScreen.kt`, `ui/components/CandlestickCanvas.kt` |
| **۵. واچ‌لیست، پیش‌بینی و تنظیمات** | جدول تراز‌شده ۲۲ نماد با جستجو و کمبوباکس دسته‌بندی، شیت جزئیات نماد متناسب با کلاس دارایی (`Overview | News | Minds | Ideas`), صفحه `Prediction` با نردبان پیوت و دکمه ترسیم روی چارت، تنظیمات ۵ تب و مدیریت `BYOK` | `js/views/watchlistView.js`, `js/views/analysisView.js`, `js/views/settingsView.js`, `js/views/navigationView.js` | `ui/screens/WatchlistScreen.kt`, `ui/components/WatchlistRowCard.kt`, `ui/screens/PredictionScreen.kt`, `ui/screens/SettingsScreen.kt`, `ui/components/LanguageThemeSelector.kt` |

---

## ۴. سلسله‌مراتب لایه‌های رندر و اولویت تعاملات لمسی (Hierarchy & Interaction Precedence)

### ۴.۱. لایه‌های رندر بوم از عمق به سطح (Render Pass Hierarchy: Back to Front)

```text
[Layer 12] مودال‌ها و منوهای کشویی تمام‌صفحه (Indicator BottomSheet / More Sheet / Settings)
   ▲
[Layer 11] کنترل‌های شناور بوم (Scroll-to-Latest «⏭» + Pane Splitter Drag Handle)
   ▲
[Layer 10] نوار ابزار شناور شیء انتخاب‌شده (رنگ، ضخامت خط، حذف)
   ▲
[Layer 9]  لژاند متنی زنده OHLC و مقادیر اندیکاتورها (بالا-چپ با حاشیه امن و LTR اجباری)
   ▲
[Layer 8]  خط قیمت زنده بازار (Last Price Dashed Line) + خط بسته قبلی + بج شمارش معکوس روی محور راست
   ▲
[Layer 7]  خطوط نقطه‌چین کراس‌هیر (`#758696`) + برچسب‌های هایلایت‌شده قیمت و زمان + ذره‌بین لمسی
   ▲
[Layer 6]  دستگیره‌های لنگر شیء فعال (`Anchor Handles` `#2962FF`) و برچسب سقف/کف دید (`Visible High/Low`)
   ▲
[Layer 5]  ترسیمات کاربر (`HLINE`, `VLINE`, `TREND`, `FIB`, `LONG_POS`, `SHORT_POS`)
   ▲
[Layer 4]  لایه‌های هوشمند ساختار بازار (`BOS/CHoCH`, `EQH/EQL`, `FVG`, `VRVP POC/VAH/VAL`)
   ▲
[Layer 3]  اندیکاتورهای هم‌پوشان بوم اصلی (`SMA 20/50/200`, `EMA 20/50`, `BB`, `Supertrend`, `VWAP`, `MACD Overlay`)
   ▲
[Layer 2]  کندل‌های شمعی قیمت (`#26A69A` / `#EF5350`) و پنل‌های پایینی (`Volume`, `RSI`, `MACD`, `ATR`)
   ▲
[Layer 1]  خطوط شبکه مختصات قیمت و زمان (`#2A2E39` ملایم و محو)
   ▲
[Layer 0]  پس‌زمینه اصلی بوم (`#131722`) با جهت ایزوله‌شده `LTR` برای متون Canvas
```

### ۴.۲. اولویت‌بندی رویدادهای ورودی و لمسی (۵ سطح)
1. **Modal Consumer:** اگر شیت یا مودال باز باشد، کل ورودی‌ها صرف آن می‌شوند.
2. **Component Handles:** دستگیره تغییر ارتفاع پنل‌ها (`PaneSplitterHandle`) یا لنگرهای شیء انتخاب‌شده.
3. **Drawing Hit-Testing:** لمس در شعاع مجاز خط (`drawingHitTolerancePx`) شیء را انتخاب می‌کند و مانع Pan ناخواسته می‌شود.
4. **Scale Interaction:** درگ عمودی روی ستون قیمت مقیاس Y را دستی می‌کند؛ دابل‌تپ/دابل‌کلیک روی ستون قیمت بلافاصله `Auto-Scale Reset` انجام می‌دهد.
5. **Canvas Default:** لمس طولانی (`Long-Press & Drag`) کراس‌هیر پیوسته را فعال می‌کند؛ درگ افقی زمان را پیمایش می‌کند (`Pan`) و پینچ/اسکرول چرخ‌ماوس زوم می‌کند (با تریگر خودکار Deep Backfill در رسیدن به لبه چپ تاریخچه).

---

## ۵. توکن‌های بصری و پالت رنگی استاندارد (Design Tokens)

هیچ رنگی در کامپوننت‌ها به‌صورت محلی هاردکد نمی‌شود و از `Theme.kt` / `Color.kt` (اندروید) و متغیرهای `:root` در `theme.css` (وب) خوانده می‌شود:

| نام توکن | Dark Default | Light Default | کاربرد در میزکار نمودار |
| :--- | :---: | :---: | :--- |
| `canvasBg` | `#131722` | `#FFFFFF` | پس‌زمینه اصلی بوم نمودار |
| `panelBg` | `#1E222D` | `#F8FAFC` | پس‌زمینه هدر، نوارهای ابزار، تب‌ها و BottomSheet |
| `borderSubtle` | `#2A2E39` | `#E2E8F0` | خطوط جداکننده پنل‌ها و مرز محور قیمت و زمان |
| `gridLine` | `#1F2430` / `#2A2E39` | `#F1F5F9` | خطوط شبکه افقی و عمودی داخل بوم |
| `textPrimary` | `#D1D4DC` | `#0F172A` | اعداد محور قیمت/زمان، قیمت اصلی و عنوان نماد |
| `textSecondary` | `#787B86` | `#64748B` | برچسب‌های راهنما، نام کامل نماد و زمان‌های فرعی |
| `bullCandle` | `#26A69A` | `#089981` | بدنه، فتیله و حجم کندل‌های صعودی |
| `bearCandle` | `#EF5350` | `#F23645` | بدنه، فتیله و حجم کندل‌های نزولی |
| `crosshairLine` | `#758696` | `#64748B` | خطوط نقطه‌چین افقی و عمودی کراس‌هیر |
| `crosshairBadge`| `#2A2E39` | `#1E293B` | پس‌زمینه لیبل قیمت و زمان فعال روی کراس‌هیر |
| `accentPrimary` | `#2962FF` | `#2563EB` | تب فعال، تایم‌فریم انتخاب‌شده و نقاط دستگیره خطوط |

### الزام مجوز و Attribution
طبق مجوز کتابخانه **TradingView Lightweight Charts** (مرجع طراحی بخش وب)، در صورت استفاده یا انتشار عمومی صفحات وب مرتبط، Attribution و لینک TradingView باید در محل قابل دسترس کاربر حفظ شود و پیش از انتشار عمومی بررسی حقوقی مجدد انجام گیرد.

---

## ۶. معیارهای پذیرش کیفی میزکار (Definition of Done)

1. **Zero Text Collisions:** هیچ متنی (اعداد قیمت، لژاند OHLC، ساعت محور زمان) همپوشانی یا بریدگی در حالت `RTL` فارسی نداشته باشد (`ctx.direction = 'ltr'`, `ctx.textAlign = 'left'`).
2. **True Inset Compliance:** در هیچ صفحه‌ای از اندروید المان‌ها زیر ناچ دوربین یا نوار باتری نروند.
3. **85%+ Canvas Real Estate:** فضای بوم کندل‌ها در صفحه چارت مسلط باشد.
4. **Market-Coordinate Integrity:** اشیای ترسیمی بر مبنای زمان `UTC` و قیمت اعشاری قفل باشند و با زوم/اسکرول جابه‌جا نشوند.
5. **No Synthetic Anomaly on Closed Markets:** در تعطیلات، کندل ساختگی رسم نشود و وضعیت هدر صراحتاً `Market Closed` نشان دهد.
