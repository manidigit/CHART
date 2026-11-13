# AI & Developer Assistant Instructions (AGENTS.md)

> Operational rules, UI/UX directives, and invariant standards for any AI agent or developer working on **CHART (Chart Intelligence)**.

---

## ۱. دستور طراحی حرفه‌ای CHART Intelligence (Mandatory UI/UX Directive)

هر تغییری در رابط کاربری وب (`host_subdomain`) یا اندروید (`app`) باید استاندارد **TradingView** را دنبال کند. کد جنریک، دکمه‌های درشت، فاصله‌های زیاد و ظاهر «AI-slop» ممنوع است.

### ۱.۱. مراجع قطعی طراحی و معماری (`docs/`)
- [`../01-product/CHART_INTELLIGENCE_MASTER_SPEC.md`](../01-product/CHART_INTELLIGENCE_MASTER_SPEC.md) — محصول، فازبندی و قواعد Prediction
- [`../02-architecture/ARCHITECTURE.md`](../02-architecture/ARCHITECTURE.md) — هسته مرکزی واحد، DB-First Delta Sync، ۷ منبع داده و قراردادهای JSON
- [`../02-architecture/DESIGN_WORKSPACE_SPEC.md`](../02-architecture/DESIGN_WORKSPACE_SPEC.md) — ساختار ۵ لایه موبایل/دسکتاپ، Z-Index و اولویت لمسی
- [`../03-roadmap-and-issues/OPEN_ISSUES.md`](../03-roadmap-and-issues/OPEN_ISSUES.md) — باگ‌ها و محدودیت‌های باز راستی‌آزمایی‌شده در کد
- [`../03-roadmap-and-issues/ROADMAP_BACKLOG.md`](../03-roadmap-and-issues/ROADMAP_BACKLOG.md) — مرز قابلیت‌های پیاده‌شده و باقی‌مانده فاز ۲ تا ۶

**پالت رنگ رسمی TradingView (Dark Default):**
- Canvas Background: `#131722`
- Panel Background: `#1E222D`
- Grid / Subtle Border: `#2A2E39`
- Primary Text: `#D1D4DC`
- Muted Text: `#787B86`
- Bullish: `#26A69A`
- Bearish: `#EF5350`
- Crosshair: `#758696` (dotted)
- Primary Accent: `#2962FF`
- فونت اعداد: `JetBrains Mono` (همیشه `LTR` و tabular؛ در فارسی فقط برچسب‌های متنی RTL هستند)

### ۱.۲. قوانین سخت چیدمان و ارگونومی (TradingView Ergonomics)
- **حداقل ۸۵–۹۰٪ ارتفاع صفحه** در نمای چارت باید به بوم اختصاص یابد؛ نوارهای ابزار حداکثر `46–48dp/px`.
- **واچ‌لیست:** سطرهای فشرده (`56–64dp`) بدون کارت‌های حجیم؛ لمس کل سطر به چارت (یا شیت جزئیات نماد) می‌رود.
- **ابزارهای رسم در موبایل:** گرید متقارن ۴ ستونه داخل BottomSheet (بدون بریده شدن متن یا دکمه‌های غول‌پیکر روی بوم).
- **Safe Area:** اعمال `statusBarsPadding()` در تمام صفحات اندروید اجباری است.
- **حداقل لمس:** تمام کنترل‌های تعاملی در موبایل و وب باید حداقل ابعاد لمسی `48dp × 48dp` و پشتیبانی از `prefers-reduced-motion: reduce` را داشته باشند.
- **لژاند و محورهای LTR روی RTL:** در `Canvas` مرورگر (`ctx.direction = 'ltr'`, `ctx.textAlign = 'left'`) و در اندروید (`LayoutDirection.Ltr`) تا متن OHLC و اعداد قیمت با محور Y تداخل نکنند.
- **تفکیک کلاس دارایی در Symbol Overview:** نمایش صورت‌های مالی یا `SEC EDGAR` فقط برای سهام (`STOCKS`) مجاز است؛ برای انرژی، فلزات، فارکس و کریپتو مشخصات همان طبقه دارایی نمایش داده شود.

### ۱.۳. چک‌لیست قبل از تحویل تغییر UI
1. آیا حداقل ۸۵٪ ارتفاع در صفحه چارت به بوم اختصاص یافته؟
2. آیا همه رنگ‌ها از توکن‌های `Theme.kt` / `theme.css` می‌آیند؟
3. آیا متن دوزبانه در `strings.xml` + `values-fa/strings.xml` و `en.json` + `fa.json` ثبت شده؟
4. آیا `statusBarsPadding` رعایت شده و فاصله‌ها بر مبنای شبکه ۴/۸ dp هستند؟
5. آیا اعداد قیمت و ساعت `JetBrains Mono` و `LTR` هستند؟
6. آیا تغییر دادن گزینه‌ها در لیست‌ها اسکرول فعلی را حفظ می‌کند؟

---

## ۲. قوانین ناوردا مهندسی (Core Engineering Invariants)

1. **به‌روزرسانی درجا و صادقانه مستندات (`Truth Over Checkboxes`):** پس از رسیدن به تصمیم یا تکمیل/تغییر کد، بلافاصله بخش مرتبط در `docs/` را درجا به‌روزرسانی کنید. هیچ قابلیت نیمه‌کاره یا ساختگی را `VERIFIED 100%` علامت نزنید؛ وضعیت واقعی را در [`OPEN_ISSUES.md`](../03-roadmap-and-issues/OPEN_ISSUES.md) و [`ROADMAP_BACKLOG.md`](../03-roadmap-and-issues/ROADMAP_BACKLOG.md) ثبت کنید.
2. **Zero Secrets Policy:** هرگز کلید API (`TWELVE_DATA_API_KEY`)، رمز MariaDB یا توکن cPanel را جست‌وجو، چاپ، هاردکد یا Commit نکنید. کلیدهای BYOK کاربر نیز هرگز نباید در JSON عمومی `workspace_sync.php` ارسال شوند.
3. **Strict Provider & Instrument Identity:** هر ترکیب `(chart_id, provider_id, timeframe, open_time_utc)` هویت مستقل دارد. هیچ Fallback پنهان بین منابع یا ادغام خاموش Spot / CFD / Futures مجاز نیست.
4. **No Mock Fallbacks:** داده یا پیش‌بینی ساختگی تولید نکنید؛ نبود داده یا محدودیت منبع باید شفاف در UI نمایش داده شود (`Market Closed`, `Cached`, `Sync Error`, `API Key Required`).
5. **Zero Hardcoding & Dual-Platform Core Parity:** تغییرات الگوریتمی، مدل داده و تنظیمات باید به‌صورت متقارن در هسته PHP، وب (`host_subdomain/assets/js/`) و اندروید (`app/src/main/java/`) پیاده‌سازی شوند.
6. **Separation of Prediction & Trading:** موتور پیش‌بینی (فاز ۴/۵) هیچ فیلد معامله‌گری (`Buy/Sell`, `Entry`, `SL`, `TP`) صادر نمی‌کند؛ این موارد منحصراً در ماژول مستقل فاز ۶ ([`TRADING_STRATEGY_SPEC.md`](../01-product/TRADING_STRATEGY_SPEC.md)) هستند.

---

## ۳. نقشه فایل‌های کلیدی مخزن

| مسیر | مسئولیت |
|---|---|
| `docs/01-product/` | `CHART_INTELLIGENCE_MASTER_SPEC.md`, `GROK_OPENMARKET_RESEARCH_NOTES.md`, `TRADING_STRATEGY_SPEC.md` |
| `docs/02-architecture/` | `ARCHITECTURE.md`, `DESIGN_WORKSPACE_SPEC.md`, `INFRASTRUCTURE_INVENTORY.md`, `SECURITY.md` |
| `docs/03-roadmap-and-issues/` | `OPEN_ISSUES.md`, `ROADMAP_BACKLOG.md` |
| `docs/04-development/` | `PROJECT_GUIDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md` |
| `app/src/main/java/es/manico/chartintelligence/` | اپلیکیشن نیتیو اندروید (Kotlin / Jetpack Compose + Coordinators + Pure Algorithms + Providers) |
| `host_subdomain/assets/js/` | فرانت‌اند وب با Native ES6 Modules (بدون نیاز به باندلر) |
| `host_subdomain/api/v1/` | بک‌اند PHP REST API و آداپتورهای ۷ منبع داده + MariaDB |
| `.github/workflows/build-apk.yml` | پایپ‌لاین بیلد APK و بسته‌بندی/استقرار وب |

---

## ۴. دستورات استاندارد بررسی و بیلد

قبل از پایان هر نوبت کدنویسی، راستی‌آزمایی واقعی انجام دهید و خروجی واقعی را گزارش کنید:
- **بیلد اندروید:** ابزار `compile_applet` (یا `gradle assembleDebug`)
- **تست واحد اندروید:** `gradle :app:testDebugUnitTest`
- **بررسی سینتکس ES6 وب:** `node --check` روی فایل‌های تغییریافته در `host_subdomain/assets/js/`
- **بررسی سینتکس PHP:** `php -l` روی فایل‌های تغییریافته در `host_subdomain/api/`

---

## ۵. جریان کاربری اجباری موبایل (`User Flow`)

1. **ورود اولیه:** لاگین نیست ──► `LoginScreen` ──► ورود موفق (`Remember Me`) ──► `Watchlist`
2. **واچ‌لیست (`Watchlist`):** لمس ردیف نماد ──► `Chart` (یا در صورت فعال‌بودن `Show symbol screen` شیت جزئیات نماد و سپس `[⛶]`); دکمه `+` افزودن نماد; سوایپ چپ حذف سریع; کشیدن به پایین سینک کلی.
3. **چارت (`Chart`):**
   - نوار تب‌های باز بالا (`✕` بستن / `+` تب جدید) + هدر غیرقابل‌کلیک منبع داده.
   - نوار کنترل پایین (`46dp`): `[نماد ▾ | تایم‌فریم | ابزار رسم | fx | ⋯]`.
   - تغییر منبع داده **فقط در `Settings`** انجام می‌شود.
4. **پیش‌بینی (`Prediction`):** تغییر نماد و تایم‌فریم، نردبان پیوت (`S2..R2`)، کارت جزئیات و دکمه «ترسیم سطوح روی چارت».
5. **تنظیمات (`Settings`):** ۵ تب (`همگام‌سازی | چارت | نوتیفیکیشن | تم | حساب`) + `Reset to Defaults`.
6. **بازگشت (`Back`):** پشته طبیعی (`screenBackStack`) ابتدا شیت‌ها را می‌بندد، سپس از `Chart` به صفحه قبلی (`Watchlist`) بازمی‌گردد.
