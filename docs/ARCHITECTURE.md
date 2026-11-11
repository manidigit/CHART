# معماری هسته مرکزی و قراردادهای همگام‌سازی (Central Core & Sync Protocols)

> **نسخه سند:** `1.30.0` · **وضعیت:** `DECIDED & IMPLEMENTED` · **تاریخ آخرین بازبینی:** `2026-11-11`  
> این سند، مرجع فنی هسته مرکزی واحد (**Unified Central Core Engine**) و قراردادهای رسمی همگام‌سازی (**Sync Protocols**) بین نسخه **اندروید (Kotlin / Jetpack Compose)**، نسخه **وب (`chart.manico.es`)** و **دیتابیس مرکزی MariaDB** است.

---

## ۱. نمای کلی معماری سه لایه و هسته مرکزی واحد (Central Core Engine)

پلتفرم **CHART (Chart Intelligence)** بر پایه معماری **Server-Authoritative Central Core + Offline-First Local Cache** طراحی شده است تا وضعیت محیط کاری کاربر در هر دو کلاینت وب و اندروید به‌طور کامل یکسان باشد:

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                         لایه کلاینت‌ها (Presentation & Interactive UI)                 │
│                                                                                       │
│   ┌─────────────────────────────────────┐     ┌───────────────────────────────────┐   │
│   │  اپلیکیشن اندروید (Kotlin/Compose)  │     │  اپلیکیشن وب (ES6 Modules / SPA)  │   │
│   │  - MainViewModel + 3 Coordinators   │     │  - store.js (Central Reactive)    │   │
│   │  - CandlestickCanvas (Canvas 2D)    │     │  - chartRenderer.js (Canvas 2D)   │   │
│   │  - SharedPreferences Offline Cache  │     │  - localStorage Offline Cache     │   │
│   └──────────────────┬──────────────────┘     └─────────────────┬─────────────────┘   │
└──────────────────────┼──────────────────────────────────────────┼─────────────────────┘
                       │  REST JSON API (`https://chart.manico.es/api/v1/`)
                       │  + Debounced Bi-Directional Workspace Sync (800ms)
                       ▼                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                    لایه سرور و هسته مرکزی (`host_subdomain/api/v1/`)                   │
│                                                                                       │
│  • `auth.php`           — احراز هویت مالک، توکن نشست، بازیابی رمز ۶ رقمی ایمیلی       │
│  • `workspace_sync.php` — قرارداد واحد همگام‌سازی دوطرفه (تب‌ها، خطوط، واچ‌لیست، تم)  │
│  • `candles.php`        — دریافت، نرمال‌سازی UTC 00:00 و ذخیره کندل‌های بسته‌شده       │
│  • `system_status.php`  — پایش سلامت سرور، نسخه MariaDB، شمارش کندل‌ها و زمان UTC     │
└──────────────────────────────────────────┬────────────────────────────────────────────┘
                                           │ PDO Prepared Statements (`DECIMAL(18,8)`)
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                         دیتابیس مرکزی MariaDB (`manicoes_chart`)                       │
│                                                                                       │
│  • `user_workspace` — تک‌ردیف مرجع (`id = 1`) حاوی JSON کامل محیط کاری (`LONGTEXT`)   │
│  • `market_candles` — آرشیو کندل‌های بسته‌شده با کلید یکتا `(symbol, tf, open_time)`   │
│  • `user_sessions`  — نشست‌های معتبر وب و اندروید + هش Argon2id/Bcrypt حساب مالک      │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ۲. ساختار دیتابیس مرکزی برای همگام‌سازی (`user_workspace`)

در دیتابیس MariaDB هاست، جدول `user_workspace` به‌عنوان **تک‌منبع حقیقت (Single Source of Truth)** وضعیت محیط کاری کاربر عمل می‌کند:

```sql
CREATE TABLE IF NOT EXISTS user_workspace (
    id INT PRIMARY KEY DEFAULT 1,
    workspace_json LONGTEXT NOT NULL,
    updated_at_utc VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- **اندپوینت همگام‌سازی:** `/api/v1/workspace_sync.php`
  - **`GET /api/v1/workspace_sync.php`**: آخرین `workspace_json` ذخیره‌شده در ردیف `id = 1` را به همراه `updated_at_utc` و زمان سرور برمی‌گرداند.
  - **`POST /api/v1/workspace_sync.php`**: ساختار کامل فضای کاری (`symbols`, `preferences`, `drawings`, `open_tabs`, `last_opened_symbol`, `is_dark_theme`, `language`) را با دستور اتمیک `INSERT INTO user_workspace ... ON DUPLICATE KEY UPDATE` ذخیره می‌کند.

---

## ۳. قرارداد جامع JSON همگام‌سازی (Canonical Workspace Sync Schema)

بدنه JSON تبادل‌شده بین `workspace_sync.php`، کلاینت وب (`store.js` / `app.js`) و کلاینت اندروید (`WorkspaceSyncService.kt` / `WorkspaceRepository.kt`) دارای ساختار استاندارد زیر است:

```json
{
  "version": "1.30.0",
  "updated_at": 1762850000000,
  "is_dark_theme": true,
  "language": "fa",
  "last_opened_symbol": "XAUUSD",
  "open_tabs": [
    {
      "symbol_code": "XAUUSD",
      "timeframe": "M15",
      "chart_type": "CANDLES",
      "date_range": "1M",
      "is_log_scale": false,
      "is_auto_scale": true,
      "show_volume": true,
      "show_sma20": true,
      "show_ema50": false,
      "show_bollinger": false,
      "show_rsi14": false,
      "is_magnet_enabled": false,
      "is_active": true
    }
  ],
  "symbols": [
    {
      "symbolCode": "XAUUSD",
      "activeProvider": "twelve_data",
      "inWatchlist": true,
      "selectedTimeframe": "M15",
      "decimals": 2,
      "isCustom": false,
      "customTitle": null
    }
  ],
  "drawings": {
    "XAUUSD_M15": [
      {
        "id": "hl_1762849000",
        "type": "HLINE",
        "tool": "hline",
        "price": 4121.88,
        "p1Price": 4121.88,
        "colorHex": "FFF59E0B",
        "color": "#F59E0B",
        "strokeWidth": 1.8
      }
    ]
  },
  "preferences": {
    "bullColor": "#26A69A",
    "bearColor": "#EF5350",
    "trendColor": "#2962FF",
    "hLineColor": "#38BDF8",
    "vLineColor": "#F59E0B",
    "candleFetchLimit": 500,
    "zoomStepCandles": 8,
    "drawingHitTolerancePx": 28,
    "hideWatchlistLogos": false,
    "showSymbolScreen": true,
    "chartVibrations": true,
    "isLogScale": false,
    "rememberLastChart": true,
    "hideTabBarInLandscape": true,
    "pickerVibrates": true,
    "showScrollMagnifier": true,
    "showCountdownToBarClose": true,
    "showPrevCloseLine": true,
    "showHighLowLabels": true
  }
}
```

---

## ۴. پروتکل‌های تفصیلی همگام‌سازی به تفکیک دامنه (Domain Sync Protocols)

### ۴.۱. پروتکل همگام‌سازی وضعیت تب‌های باز (`open_tabs` & `last_opened_symbol`)

| ویژگی | نسخه اندروید (`ChartTabState.kt`) | نسخه وب (`store.js` -> `state.openTabs`) | کلید JSON در هسته مرکزی |
|---|---|---|---|
| کد نماد | `symbolCode: String` | `symbolCode: String` | `symbol_code` (و پشتیبانی از `symbolCode`) |
| تایم‌فریم تب | `timeframe: Timeframe` (`M15`, `H1`, `H4`, `D1`, `W1`) | `timeframe: String` | `timeframe` |
| نوع نمودار | `chartType: ChartDisplayType` (`CANDLES`, `LINE`) | `chartType: String` (`candles`, `line`) | `chart_type` |
| بازه تاریخی | `selectedDateRange: String` (`1D`..`All`) | `selectedDateRange: String` | `date_range` |
| مقیاس لگاریتمی | `isLogScale: Boolean` | `isLogScale: Boolean` | `is_log_scale` |
| مقیاس خودکار | `isAutoScale: Boolean` | `isAutoScale: Boolean` | `is_auto_scale` |
| نمایش پنل حجم | `showVolumePane: Boolean` | `showVolume: Boolean` | `show_volume` |
| اندیکاتورها | `showSma20`, `showEma50`, `showBollinger`, `showRsi14` | `showSma20`, `showEma50`, `showBollinger`, `showRsi14` | `show_sma20`, `show_ema50`, `show_bollinger`, `show_rsi14` |
| حالت آهنربا | `isMagnetEnabled: Boolean` | `isMagnetMode: Boolean` | `is_magnet_enabled` |
| تب فعال فعلی | `activeTabSymbolCode: String?` | `activeTabId: String` | `is_active: true` + `last_opened_symbol` |

**قواعد اجرایی تب‌ها:**
1. هر تغییر در تب‌های باز (باز کردن تب جدید، بستن تب، تغییر تایم‌فریم، تغییر نوع نمودار شمعی/خطی، روشن/خاموش کردن اندیکاتورها یا تغییر مقیاس `Log/Auto`) بلافاصله در کش محلی ذخیره شده و پس از `800ms` Debounce به `workspace_sync.php` ارسال می‌شود.
2. هنگام ورود یا بازخوانی از سرور، اگر `rememberLastChart` فعال باشد، تب منطبق با `last_opened_symbol` (یا تب دارای `is_active == true`) به‌عنوان تب فعال انتخاب می‌شود.

---

### ۴.۲. پروتکل همگام‌سازی ابزارهای ترسیم (`drawings`)

1. **فرمت کلید استاندارد (`Canonical Key`):**
   - تمامی خطوط ترسیمی با کلید ترکیبی `${symbolCode}_${timeframe}` (مانند `"XAUUSD_M15"` یا `"SPOTBRENT_H1"`) در دیکشنری `drawings` ذخیره می‌شوند.
   - برای سازگاری کامل عقب‌رو (Backward Compatibility)، در صورتی که کلید قدیمی بدون پسوند تایم‌فریم (مانند `"XAUUSD"`) در دیتابیس وجود داشته باشد، هر دو کلاینت به‌طور خودکار آن را به تایم‌فریم فعال نگاشت می‌کنند.
2. **انواع ۶گانه ابزارهای ترسیم مشترک وب و اندروید:**
   - `HLINE` (`hline`): خط افقی قیمت (`price` / `p1Price`).
   - `VLINE` (`vline`): خط عمودی زمان (`timeEpochSec` / `p1TimeMs` / `candleIndex`).
   - `TREND` (`trend`): خط روند دو نقطه‌ای (`startCandleIndex`/`startPrice` و `endCandleIndex`/`endPrice` به همراه زمان UTC).
   - `FIB` (`fib`): اصلاح فیبوناچی ۶ سطحی استاندارد (`0%`, `23.6%`, `38.2%`, `50%`, `61.8%`, `100%`) بین دو لنگر قیمتی.
   - `LONG_POS` (`long_pos`): ابزار نسبت ریسک به ریوارد خرید (`entryPrice`, `targetPrice`, `stopPrice`).
   - `SHORT_POS` (`short_pos`): ابزار نسبت ریسک به ریوارد فروش (`entryPrice`, `targetPrice`, `stopPrice`).
3. **نرمال‌سازی رنگ خطوط:**
   - اندروید رنگ‌ها را با فرمت ۸ کاراکتری ARGB (`"FF2962FF"`) و وب با فرمت ۶ کاراکتری CSS Hex (`"#2962FF"`) رندر می‌کند.
   - در هنگام سریال‌سازی به هسته مرکزی، هر دو فیلد `colorHex` (`"FFRRGGBB"`) و `color` (`"#RRGGBB"`) در شیء JSON قرار می‌گیرند تا هر دو کلاینت بدون خطای پارس، رنگ دقیق خط را نمایش دهند.

---

### ۴.۳. پروتکل همگام‌سازی واچ‌لیست و کاتالوگ نمادها (`symbols`)

هر آیتم در آرایه `symbols` وضعیت کامل نماد را در واچ‌لیست و منبع داده آن مشخص می‌کند:
- `symbolCode`: کد استاندارد نماد با حروف بزرگ انگلیسی (مانند `XAUUSD`, `SPOTBRENT`, `BRENT_FUTURES`, `XAGUSD`, `EURUSD` یا نمادهای سفارشی کاربر).
- `activeProvider`: شناسه منبع داده فعال نماد (`tvdatafeed`, `twelve_data`, `dukascopy`, `yahoo_finance`, `eia`).
- `inWatchlist`: وضعیت نمایش نماد در صفحه واچ‌لیست (`true` / `false`).
- `selectedTimeframe`: آخرین تایم‌فریم انتخاب‌شده برای نماد (`M15`, `H1`, `H4`, `D1`).
- `decimals`: تعداد اعشار مجاز قیمت (`0` تا `6`).
- `isCustom` و `customTitle`: مشخصات نمادهای سفارشی اضافه‌شده توسط کاربر در بخش تنظیمات.

---

### ۴.۴. پروتکل همگام‌سازی تنظیمات ۵گانه (`preferences`)

تنظیمات محیط کاری در اندروید (`ChartPreferences.kt` و `strings.xml`) و وب (`store.js` و `settingsView.js`) به **۵ گروه مجزا** دسته‌بندی شده‌اند و تمام ۱۹ کلید آن‌ها به‌طور دوطرفه همگام‌سازی می‌شوند:

| شماره گروه | کلید تب (`tabKey`) | عنوان فارسی | عنوان انگلیسی | کلیدهای همگام‌سازی‌شده در هسته مرکزی |
|---:|---|---|---|---|
| **۱** | `sync` | **همگام‌سازی** | **Sync** | وضعیت زنده دیتابیس MariaDB، دکمه همگام‌سازی ابری، کاتالوگ نمادها (`symbols`) و انتخاب Provider هر نماد |
| **۲** | `chart` | **چارت** | **Chart** | `candleFetchLimit` (تا ۵۰۰۰)، `zoomStepCandles`، `drawingHitTolerancePx`، `isLogScale`، `rememberLastChart`، `hideTabBarInLandscape`، `showCountdownToBarClose`، `showPrevCloseLine`، `showHighLowLabels` |
| **۳** | `notifications` | **نوتیفیکیشن** | **Notifications** | `chartVibrations`، `pickerVibrates`، `showScrollMagnifier`، `showSymbolScreen`، `hideWatchlistLogos` |
| **۴** | `theme` | **تم** | **Theme** | `is_dark_theme`، `language` (`fa`/`en`)، `bullColor`، `bearColor`، `trendColor`، `hLineColor`، `vLineColor` + پیش‌نمایش زنده کندل‌ها |
| **۵** | `account` | **حساب** | **Account** | نام کاربری مالک، ایمیل بازیابی (`recovery_email`)، تغییر رمز عبور و خروج از نشست |

---

## ۵. چرخه حیات همگام‌سازی، مدیریت خطا و حل تعارض (Sync Lifecycle & Conflict Resolution)

1. **بارگذاری اولیه (`Initial Pull on Boot / Login`):**
   - هر دو کلاینت ابتدا بلافاصله وضعیت ذخیره‌شده در کش محلی (`SharedPreferences` در اندروید / `localStorage` در وب) را بارگذاری می‌کنند تا رابط کاربری بدون هیچ تأخیری آماده کار شود (**Zero-Wait Boot**).
   - سپس به‌صورت غیرمسدودکننده (`Async`) درخواست `GET /api/v1/workspace_sync.php` ارسال می‌شود و وضعیت سرور با وضعیت محلی ادغام می‌گردد.
2. **ارسال خودکار با Debounce (`Auto-Push`):**
   - هرگونه تغییر در تب‌ها، خطوط ترسیمی، واچ‌لیست یا تنظیمات، یک تایمر Debounce به مدت `800ms` در کلاینت فعال می‌کند.
   - پس از پایان `800ms`، کل وضعیت محیط کاری در قالب یک درخواست `POST /api/v1/workspace_sync.php` به دیتابیس مرکزی ارسال می‌شود.
3. **تاب‌آوری آفلاین (`Offline Fallback`):**
   - در صورت قطع اینترنت، تمام تغییرات در کش محلی دستگاه حفظ می‌شوند و در اولین ارتباط مجدد یا زدن دکمه «همگام‌سازی ابری فضای کاری» در تب `همگام‌سازی` تنظیمات، به سرور منتقل می‌گردند.
4. **ایمنی بارگذاری ماژول‌های وب (`ES6 Module Singleton Integrity`):**
   - در نسخه وب (`host_subdomain/assets/js/`)، تمامی ماژول‌های ES6 با یک رشته نسخه واحد (`?v=1.30.0`) بارگذاری می‌شوند تا در مرورگر تنها یک نمونه Singleton از `store.js` ساخته شود و متغیر سراسری `window.__CI_APP_MOUNTED__ = true` بلافاصله پس از رندر اولیه فعال گردد.
