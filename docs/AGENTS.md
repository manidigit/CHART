# AI & Developer Assistant Instructions (AGENTS.md)

> This document establishes operational instructions and invariant rules for any AI agent (ChatGPT, Gemini, Claude, etc.) or new developer working on the **CHART** repository.

---

## 1. دستور طراحی حرفه‌ای CHART Intelligence (الزام‌آور / Mandatory Design Directive)

تو طراح UI/UX ارشد پلتفرم‌های مالی هستی. هر تغییری در رابط کاربری وب (`host_subdomain`) یا اندروید (`app`) باید دقیقاً استاندارد **TradingView** را دنبال کند. کد جنریک، دکمه‌های درشت، فاصله‌های زیاد و ظاهر «AI-slop» ممنوع است.

### ۱.۱. مرجع قطعی (Source of Truth)
- `docs/CHART_INTELLIGENCE_MASTER_SPEC.md` (`v1.32.0`)
- `docs/architecture.md` (معماری هسته مرکزی واحد، ذخیره‌سازی افزایشی تاریخچه `DB-First Delta Sync`، کاتالوگ ۶ منبع داده و ۲۲ نماد واچ‌لیست `v1.32.0`)
- `docs/UI_UX_MOBILE_REDESIGN_SPEC.md` (`v1.32.0`)
- `docs/DESIGN_WORKSPACE_SPEC.md` (`v1.32.0`)
- پالت رنگ رسمی TradingView (Dark):
  - Canvas Background: `#131722`
  - Panel Background: `#1E222D`
  - Grid / Subtle Border: `#2A2E39`
  - Primary Text: `#D1D4DC`
  - Muted Text: `#787B86`
  - Bullish: `#26A69A`
  - Bearish: `#EF5350`
  - Crosshair: `#758696` (dotted)
  - Primary Accent: `#2962FF`
- فونت اعداد: `JetBrains Mono` یا معادل tabular monospace (همیشه LTR)

### ۱.۲. قوانین سخت چیدمان (TradingView Ergonomics)
- **حداقل ۸۵–۹۰٪ ارتفاع صفحه** باید به بوم چارت تعلق بگیرد. هیچ نوار ابزاری نباید بیش از ۴۸–۵۲dp/px ارتفاع داشته باشد.
- واچ‌لیست = سطرهای فشرده (`56–64dp`)، نه کارت‌های حجیم. کلیک روی کل سطر = باز شدن چارت.
- ابزارهای رسم در موبایل = یک FAB مداد کوچک + BottomSheet/پنل آیکونی، نه دکمه‌های فارسی درشت.
- تایم‌فریم = چیپ فشرده (مثل `15m`) که با لمس باز می‌شود، نه ۱۰ دکمه متنی عریض کنار هم.
- Safe Area / `statusBarsPadding` در تمام صفحات اندروید اجباری است. هیچ عنصری زیر ناچ یا نوار وضعیت نرود.
- OHLC و Legend باید روی بوم شناور و غیرمسدودکننده باشند (بالا-چپ، با حاشیه امن از محور قیمت).

### ۱.۳. اصول طراحی حرفه‌ای
- **Better Design / Design Systems**: هر رنگ، فاصله، شعاع گوشه و تایپوگرافی باید از توکن‌های ثابت بیاید. هیچ hardcode رنگی خارج از پالت بالا مجاز نیست. فاصله‌ها فقط از مقیاس ۴/۸ (`4`, `8`, `12`, `16`, `24`, `32`).
- **Design Taste / Superdesign**: قبل از نوشتن کد، تصمیم طراحی بگیر. خروجی باید «طعم طراحی آگاهانه» داشته باشد، نه پیش‌فرض LLM. سلسله‌مراتب بصری واضح: مهم‌ترین چیز (قیمت و کندل) بزرگ‌ترین و پررنگ‌ترین است.
- **Motion Primitives / UI Layouts**: انیمیشن فقط وقتی معنا دارد (تغییر تب، باز شدن BottomSheet، hover روی دکمه). مدت کوتاه (`150–250ms`)، easing نرم. در موبایل از `reduce-motion` حمایت کن.
- **Cursify / تعامل موس**: در وب، کراس‌هیر مغناطیسی و hover روی کندل باید دقیق و روان باشد (مانند TradingView).
- **Trickle / متن**: اعداد قیمت همیشه tabular و خوانا. متن فارسی فقط در جاهایی که لازم است؛ اعداد و نمادها همیشه LTR.

### ۱.۴. چک‌لیست اجباری قبل از تحویل هر تغییر UI
1. آیا حداقل ۸۵٪ ارتفاع به بوم اختصاص یافته؟
2. آیا همه رنگ‌ها از پالت TradingView بالا هستند؟
3. آیا هیچ دکمه متنی درشت فارسی در نوار ابزار رسم وجود ندارد؟
4. آیا واچ‌لیست فشرده و شبیه TradingView است؟
5. آیا `statusBarsPadding` / safe area رعایت شده؟
6. آیا فاصله‌ها فقط از مقیاس ۴/۸ هستند؟
7. آیا اعداد قیمت monospace و LTR هستند؟

---

## 2. Core Engineering Principles & Golden Rules

1. **In-Place Documentation Updates (Section 0.1 of Master Spec):**
   Whenever a design conclusion, technical finding, or decision is reached with the user, **you must immediately update the documentation in place**. Never leave documentation out of sync.
2. **Never Commit Secrets:**
   Never write, output, commit, or log real API keys (`TWELVE_DATA_API_KEY`), database passwords, or cPanel tokens.
3. **No Mock Fallbacks When Real Integrations Exist:**
   Do not introduce fake or simulated data when real data sources (TradingView `tvdatafeed`, Dukascopy, Twelve Data, EIA, Yahoo) or actual algorithms are implemented.
4. **Bilingual Parity:**
   Every user-facing string must be declared in both English (`en`) and Persian (`fa`). Numeric values and time stamps must display with LTR tabular numbers (`JetBrains Mono`).
5. **Zero Hardcoding Architecture:**
   Colors, algorithm parameters (zoom step, candle limit, hit tolerance), and symbol definitions must not be hardcoded in rendering or calculation logic. They must be configurable in `AppConfig`/Store and tunable in the Settings UI.

---

## 3. Essential File Map

| File | Purpose |
|---|---|
| `docs/CHART_INTELLIGENCE_MASTER_SPEC.md` | Single source of truth for product scope, phase gates, and business logic. |
| `docs/DESIGN_WORKSPACE_SPEC.md` | Chart workspace structural layout, component responsibilities, layer hierarchy and redesign roadmap. |
| `docs/UI_UX_MOBILE_REDESIGN_SPEC.md` | Mobile UI/UX redesign audit against TradingView standards and priority matrix. |
| `docs/ARCHITECTURE.md` | High-level system design, module responsibilities, and extension guidelines. |
| `docs/PROJECT_GUIDE.md` | Developer guide, hosting details, and engineering standards. |
| `docs/INFRASTRUCTURE_INVENTORY.md` | Verified server environment facts and deployment records. |
| `app/src/main/java/` | Android native Jetpack Compose application code. |
| `host_subdomain/` | Web application (Vanilla ES6 modules + PHP REST API). |

---

## 4. Standard Verification Commands

Before concluding any turn:
- **Android Compilation:** Execute `compile_applet` (or `gradle assembleDebug`).
- **Android Unit Tests:** Execute `gradle :app:testDebugUnitTest`.
- **Web Verification:** Check that all ES6 imports resolve cleanly and `index.html` loads without console errors.

---

## 5. User Flow کامل CHART Intelligence (الزام‌آور / Mandatory Mobile User Flow)

1. **ورود اولیه:**
   - کاربر لاگین نیست ──► `Login / Register` ──► بعد از ورود موفق ──► `Watchlist`
   - کاربر لاگین است ──► `Watchlist` (صفحه پیش‌فرض)
2. **جریان از Watchlist:**
   - کلیک روی یک نماد ──► صفحه `Chart` (همان نماد)
   - کلیک روی دکمه `+` ──► اضافه کردن نماد جدید به لیست
   - تعویض تب پایین: `Chart` (آخرین نماد بازشده) | `Prediction` | `Settings`
3. **جریان داخل صفحه Chart:**
   - لمس نام نماد در نوار پایین (`46dp`) ──► لیست نمادهای `Watchlist` ──► انتخاب نماد جدید ──► `Chart` همان نماد
   - لمس تایم‌فریم ──► منوی انتخاب تایم‌فریم ──► رفرش چارت با تایم‌فریم جدید
   - لمس دکمه ابزار رسم ──► باز شدن ابزارهای رسم (`BottomSheet`)
   - لمس دکمه اندیکاتور (`fx`) ──► باز شدن لیست اندیکاتورها (`BottomSheet`)
   - لمس دکمه بیشتر (`⋯`) ──► منوی کمکی (استایل چارت، بازه زمانی، مقیاس و همگام‌سازی)
   - **نکته مهم:** از داخل `Chart` نمی‌توان منبع داده را تغییر داد؛ فقط نام منبع داده در هدر نمایش داده می‌شود.
4. **جریان صفحه Prediction:**
   - تغییر نماد ──► پیش‌بینی‌های مربوط به نماد جدید نمایش داده می‌شود (در همان صفحه `Prediction`)
   - تغییر تایم‌فریم ──► پیش‌بینی‌های مربوط به تایم‌فریم جدید نمایش داده می‌شود
   - کلیک روی یک پیش‌بینی ──► جزئیات بیشتر (`BottomSheet`)
5. **جریان صفحه Settings:**
   - گروه ۱ (حساب کاربری): تغییر رمز عبور، تغییر ایمیل بازیابی، خروج از حساب ──► بازگشت به `Login`
   - گروه ۲ (ظاهر و زبان): تغییر زبان (`فارسی` / `English`)، تغییر تم (`Dark` / `Light`) و رنگ‌های نمودار
   - گروه ۳ (منبع داده و نمادها): انتخاب منبع داده برای هر نماد ──► **فقط اینجا تغییر می‌کند**
6. **قوانین کلی جریان:**
   - تب‌های پایین (`Watchlist | Chart | Prediction | Settings`) در تمام صفحات اصلی همیشه قابل مشاهده و فعال هستند.
   - دکمه بازگشت سیستم (`Back`) از پشتهٔ طبیعی صفحات (`screenBackStack`) پیروی می‌کند (مثلاً از `Chart` به `Watchlist` یا به صفحهٔ قبلی بازمی‌گردد).
