# CHART — معماری هسته مرکزی، ذخیره‌سازی افزایشی تاریخچه و قراردادهای همگام‌سازی

> **نسخه سند:** `1.38.1` · **وضعیت:** `DECIDED & IMPLEMENTED (Core Layer)` · **تاریخ آخرین بازبینی:** `2026-11-13`  
> این سند نسخه یکپارچه‌شده `ARCHITECTURE.md` و `architecture.md` است و مرجع فنی هسته مرکزی واحد (**Unified Central Core Engine**)، موتور ذخیره‌سازی افزایشی تاریخچه کندل‌ها (**DB-First Incremental Historical Engine**)، کاتالوگ مستقل **۷ روش جمع‌آوری داده** (**Isolated Provider Methods Catalog**)، کاتالوگ استاندارد **۲۲ نماد واچ‌لیست**، و قراردادهای رسمی همگام‌سازی (**Sync Protocols**) بین کلاینت **اندروید (Kotlin / Jetpack Compose)**، کلاینت **وب (`chart.manico.es`)** و **دیتابیس مرکزی MariaDB** است.

---

## ۱. نمای کلی معماری سه لایه و هسته مرکزی واحد (Central Core Engine)

پلتفرم **CHART (Chart Intelligence)** بر پایه معماری **Server-Authoritative Central Core + DB-First Historical Persistence + Offline-First Local Cache** طراحی شده است تا داده‌های تاریخی، روش‌های جمع‌آوری داده و وضعیت محیط کاری کاربر در هر دو کلاینت وب و اندروید به‌طور کامل یکسان و هماهنگ باشند:

```text
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                         لایه کلاینت‌ها (Presentation & Interactive UI)                 │
│                                                                                       │
│   ┌─────────────────────────────────────┐     ┌───────────────────────────────────┐   │
│   │  اپلیکیشن اندروید (Kotlin/Compose)  │     │  اپلیکیشن وب (ES6 Modules / SPA)  │   │
│   │  - MainViewModel + 3 Coordinators   │     │  - store.js (Central Reactive)    │   │
│   │  - 22-Symbol Catalog + 7 Providers  │     │  - 22-Symbol Catalog + 7 Providers│   │
│   │  - SharedPreferences Delta Cache    │     │  - localStorage Delta Cache       │   │
│   └──────────────────┬──────────────────┘     └─────────────────┬─────────────────┘   │
└──────────────────────┼──────────────────────────────────────────┼─────────────────────┘
                       │  REST JSON API (`https://chart.manico.es/api/v1/`)
                       │  + DB-First Delta Candle Sync (`since_ms`) + Workspace Sync
                       │  + Header `X-Provider-Api-Key` (BYOK — خارج از Workspace JSON)
                       ▼                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                    لایه سرور و هسته مرکزی (`host_subdomain/api/v1/`)                   │
│                                                                                       │
│  • `auth.php`           — احراز هویت مالک (Salted SHA-256 / Hash)، نشست، کد ۶ رقمی OTP│
│  • `workspace_sync.php` — قرارداد واحد همگام‌سازی دوطرفه (تب‌ها، خطوط، واچ‌لیست)     │
│  • `candles_sync.php`   — موتور DB-First (خوانش تاریخچه از DB + دریافت فقط Delta)     │
│  • `status.php`         — نقطه وضعیت سلامت ریشه `/api/v1/status.php`                   │
│  • `system/status.php`  — پایش سلامت سرور، نسخه MariaDB، شمارش کندل‌ها و زمان UTC     │
└──────────────────────────────────────────┬────────────────────────────────────────────┘
                                           │ PDO Prepared Statements (`DECIMAL(18,8)`)
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                         دیتابیس مرکزی MariaDB (`manicoes_chart`)                       │
│                                                                                       │
│  • `candles`        — آرشیو ماندگار کندل‌های بسته‌شده با کلید یکتای ۴گانه:            │
│                       `UNIQUE(chart_id, provider_id, timeframe, open_time_utc)`       │
│  • `user_workspace` — تک‌ردیف مرجع (`id = 1`) حاوی JSON کامل محیط کاری (`LONGTEXT`)   │
│  • `user_sessions`  — نشست‌های معتبر وب و اندروید + هش رمز حساب مالک                 │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### ساختار واقعی ماژول‌های مخزن

- **اندروید (`app/src/main/java/es/manico/chartintelligence/`):**
  - `MainActivity.kt`, `config/AppConfig.kt`, `i18n/AppLanguage.kt`
  - `algorithms/`: `CandleValidatorAlgorithm.kt`, `DrawingGeometryAlgorithm.kt`, `PasswordHashAlgorithm.kt`, `PriceFormatterAlgorithm.kt`, `TimeframeAggregatorAlgorithm.kt`, `UtcTimeAnchorAlgorithm.kt`
  - `data/model/`: `CandleBar.kt`, `ChartDrawingModels.kt`, `ChartPreferences.kt`, `ChartTabState.kt`, `ProviderId.kt`, `SymbolConfig.kt`
  - `data/repository/WorkspaceRepository.kt`
  - `providers/`: `CandleProviderAdapter.kt`, `TvDatafeedAdapter.kt`, `BiquoteAdapter.kt`, `TwelveDataAdapter.kt`, `DukascopyAdapter.kt`, `YahooFinanceAdapter.kt`, `StooqAdapter.kt`, `EiaBenchmarkAdapter.kt`
  - `ui/screens/`: `LoginScreen.kt`, `WatchlistScreen.kt`, `ChartViewScreen.kt`, `PredictionScreen.kt`, `SettingsScreen.kt`
  - `ui/components/`: `CandlestickCanvas.kt`, `ChartTabBar.kt`, `DrawingToolbar.kt`, `LanguageThemeSelector.kt`, `WatchlistRowCard.kt`
  - `ui/state/`: `MainViewModel.kt` + `coordinators/` (`ChartDrawingCoordinator.kt`, `ChartPreferenceCoordinator.kt`, `SymbolCatalogCoordinator.kt`)
  - `ui/theme/`: `Color.kt`, `Theme.kt`, `Type.kt`
- **وب (`host_subdomain/`):**
  - `index.html`, `i18n/fa.json`, `i18n/en.json`, `assets/css/theme.css`, `migrations/001_phase1_init.sql`
  - `assets/js/`:
    - `app.js` (نقطه ورود، رویدادهای بوم و اکشن‌ها)
    - `core/store.js`, `core/i18n.js`
    - `services/apiService.js`
    - `components/chartRenderer.js`
    - `algorithms/`: `drawingGeometry.js`, `priceFormatter.js`, `technicalIndicators.js`, `timeframeAggregator.js`
    - `views/`: `headerView.js`, `navigationView.js`, `toolRailView.js`, `watchlistView.js`, `analysisView.js`, `settingsView.js`, `loginView.js`
- **سرور PHP و اسکریپت‌ها (`host_subdomain/`):**
  - `api/v1/`: `auth.php`, `candles_sync.php`, `workspace_sync.php`, `status.php`, `system/status.php`
  - `api/v1/core/`: `ApiEnvelope.php`, `Database.php`
  - `api/v1/algorithms/`: `CandleValidator.php`, `TimeframeAggregator.php`, `UtcTimeAnchor.php`
  - `api/v1/providers/`: `ProviderCatalog.php`, `TvDatafeedAdapter.php`, `BiquoteAdapter.php`, `TwelveDataAdapter.php`, `DukascopyAdapter.php`, `YahooFinanceAdapter.php`, `StooqAdapter.php`, `EiaBenchmarkAdapter.php`
  - `scripts/`: `sync_tvdatafeed.py`, `cron_sync_tvdatafeed.php`

---

## ۲. معماری ذخیره‌سازی افزایشی تاریخچه کندل‌ها (DB-First Incremental Historical Persistence)

### ۲.۱. قانون طلایی عدم دریافت مجدد تاریخچه (Immutability of Closed Historical Candles)
کندل‌های بسته‌شده تاریخی (`is_closed = 1`) پس از عبور زمان بسته شدن به وقت استاندارد `UTC`، **تغییرناپذیر (Immutable)** هستند:
1. **ممنوعیت واکشی تکراری تاریخچه:** هرگاه تاریخچه یک نماد از یک منبع مشخص (`provider_id`) و در یک تایم‌فریم مشخص (`timeframe`) قبلاً دریافت و در جدول `candles` دیتابیس مرکزی ذخیره شده باشد، سیستم در دفعات بعدی کل تاریخچه قبلی را مجدداً از API یا اسکریپت منبع استخراج نمی‌کند.
2. **استعلام اول از دیتابیس مرکزی (`Database-First Lookup`):** در ابتدای هر درخواست به `candles_sync.php`، موتور مرکزی ابتدا وضعیت موجود در جدول `candles` را برای کلید `(chart_id, provider_id, timeframe)` بررسی می‌کند:
   - `stored_count`: تعداد کل کندل‌های بسته‌شده موجود در دیتابیس برای این ترکیب.
   - `min_open_time_utc`: قدیمی‌ترین کندل موجود در دیتابیس.
   - `max_open_time_utc`: جدیدترین کندل بسته‌شده موجود در دیتابیس.
   - `expected_last_closed_open_ms`: زمان باز شدن آخرین کندلی که طبق تقویم بازار و ساعت فعلی `UTC` باید بسته شده باشد.

### ۲.۲. ماشین وضعیت ۳گانه دریافت افزایشی (3-State Incremental Sync Engine)

| وضعیت (`sync_mode`) | شرط فعال‌سازی در هسته مرکزی | رفتار موتور مرکزی (`candles_sync.php`) | تعداد کندل درخواستی از منبع خارجی |
|---|---|---|---|
| **`DB_CACHE_HIT`** | `stored_count >= min_bars` **و** `max_open_time_utc >= expected_last_closed_open_ms` (و عدم درخواست `force_backfill`) | بازگشت فوری کندل‌ها مستقیماً از جدول `candles` دیتابیس MariaDB بدون هیچ‌گونه اتصال شبکه به API یا سوکت خارجی | **`0` کندل (فراخوانی خارجی صفر)** |
| **`DELTA_SYNC`** | `stored_count > 0` **و** `max_open_time_utc < expected_last_closed_open_ms` | محاسبه فاصله زمانی جاافتاده و دریافت **فقط کندل‌های جدیدتر از `max_open_time_utc`** از منبع، ذخیره در دیتابیس و بازگشت کل سری یکپارچه | **فقط تعداد کندل‌های جاافتاده جدید (`deltaBars`)** |
| **`INITIAL_BACKFILL`** | `stored_count == 0` (اولین بار برای این نماد/منبع/تایم‌فریم) یا درخواست صریح تکمیل عقب‌گرد (`backfill=1`) | دریافت تاریخچه کامل اولیه (تا سقف `limit` تا ۵۰۰۰ کندل) از آداپتور منبع، ذخیره دسته‌ای (`Batch Transaction`) در جدول `candles` و بازگشت سری کامل | **سقف درخواستی (`limit` تا ۵۰۰۰ کندل)** |

### ۲.۳. پشتیبانی از پارامتر `since_ms` و پاسخ استاندارد `sync_meta`
- کلاینت‌های وب و اندروید هنگام همگام‌سازی می‌توانند آخرین زمان کندل محلی (`since_ms`) را ارسال کنند و به‌صورت Idempotent با کش محلی ادغام کنند.
- پاسخ سرور در `candles_sync.php` همیشه شامل شیء استاندارد `sync_meta` است:
  ```json
  {
    "sync_mode": "DB_CACHE_HIT | DELTA_SYNC | INITIAL_BACKFILL",
    "stored_total_bars": 5000,
    "fetched_new_bars": 0,
    "min_open_time_utc_ms": 1756000000000,
    "max_open_time_utc_ms": 1762850700000,
    "expected_last_closed_open_ms": 1762850700000,
    "provider_status": "READY"
  }
  ```

---

## ۳. کاتالوگ مستقل ۷ روش جمع‌آوری داده (`ProviderCatalog`) و ۲۲ نماد استاندارد واچ‌لیست

### ۳.۱. اصل تفکیک ۱۰۰٪ منابع و ممنوعیت جایگزینی پنهان (Strict Provider Isolation)
1. **کلید ذخیره‌سازی مستقل در دیتابیس:** در جدول `candles`، کلید یکتا به‌صورت `UNIQUE KEY uq_candle_identity (chart_id, provider_id, timeframe, open_time_utc)` تعریف شده است. کندل‌های `SPOTBRENT` از `tvdatafeed` کاملاً جدا از `biquote`، `twelve_data`، `stooq` یا `yahoo_finance` ذخیره می‌شوند.
2. **ممنوعیت Fallback پنهان بین منابع:** هیچ آداپتوری مجاز نیست در صورت نبود کلید API یا خطای شبکه، به‌طور پنهانی کندل‌های یک منبع دیگر را دریافت و به نام منبع فعلی در دیتابیس ثبت کند.
3. **شفافیت `InstrumentSpec` و پایه قیمت (`Price Basis`):** هر منبع با پایه قیمت صریح (`CFD / MT5 Feed`, `Interbank Spot`, `Spot REST`, `Futures Ref`, `EOD Historical`, `Official FOB Spot`, `Official Exchange`) و محدودیت‌های سشن خود نمایش داده می‌شود.

### ۳.۲. شناسنامه فنی ۷ روش مستقل جمع‌آوری داده در هسته مرکزی

| شناسه روش (`provider_id`) | نام روش و کلاس‌های پیاده‌سازی | مکانیزم فنی و فرمول استخراج | پوشش نمادها (`exchange:ticker`) | تایم‌فریم‌ها |
|---|---|---|---|---|
| **`tvdatafeed`** | **TradingView Wick & WebSocket Engine** (`TvDatafeedAdapter`) | خوانش آرشیو پایه شدودار (`host_subdomain/data/tvdatafeed/`) + استخراج سوکت TradingView (`sync_tvdatafeed.py`) و تراز `D1` به نیمه‌شب روز معاملاتی بعد | تمام ۲۲ نماد کاتالوگ (`PEPPERSTONE:SPOTBRENT`, `OANDA:XAUUSD`, `OANDA:XAGUSD`, `OANDA:EURUSD`, `TVC:USOIL`, `BITSTAMP:BTCUSD`, `BITSTAMP:ETHUSD`, `OANDA:SPX500USD`, `NASDAQ:NDX`, و ۱۳ سهام آمریکا) | `M15`, `M30`, `H1`, `H4`, `D1`, `W1` |
| **`biquote`** | **biquote Multi-Asset Feed** (`BiquoteAdapter`) | فید رایگان چنددارایی بدون نیاز به کلید API با پشتیبانی از `DELTA_SYNC` | `BTCUSD`, `ETHUSD`, `XAGUSD`, `XAUUSD`, `SPOTBRENT` (`UKOIL`), `USOIL`, `EURUSD` | `M15`, `M30`, `H1`, `H4`, `D1`, `W1` |
| **`twelve_data`** | **Twelve Data REST API** (`TwelveDataAdapter`) | فراخوانی `https://api.twelvedata.com/time_series` با کلید سرور یا کلید شخصی (`X-Provider-Api-Key`) و `outputsize` محدود به کندل‌های جدید | تمام ۲۲ نماد واچ‌لیست | `M15`, `M30`, `H1`, `H4`, `D1`, `W1` |
| **`dukascopy`** | **Dukascopy Swiss Bank Historical Feed** (`DukascopyAdapter`) | استخراج کندل‌های بین‌بانکی سوئیس با فیلتر تیک‌های مصنوعی آخر هفته (`volume = 0` و دامنه میکرونی) | `SPOTBRENT` (`BRENT.CMD/USD`), `XAUUSD` (`XAU/USD`), `XAGUSD` (`XAG/USD`), `EURUSD` (`EUR/USD`) | `M15`, `M30`, `H1`, `H4`, `D1`, `W1` |
| **`yahoo_finance`** | **Yahoo Finance v8 Chart Engine** (`YahooFinanceAdapter`) | فراخوانی `query1.finance.yahoo.com/v8/finance/chart/{ticker}` با واکشی عمیق تاریخی (`M15`/`M30` تا ۶۰ روز، `H1`/`H4` تا ۷۳۰ روز، `D1`/`W1` تا ۱۰ سال) | مرجع اول ۱۳ سهام آمریکا و شاخص‌ها (`^GSPC`, `^NDX`) + کریپتو/فیوچرز/فارکس (`BZ=F`, `CL=F`, `GC=F`, `SI=F`, `EURUSD=X`, `BTC-USD`, `ETH-USD`) | `M15`, `M30`, `H1`, `H4`, `D1`, `W1` |
| **`stooq`** | **Stooq Free EOD Historical Feed** (`StooqAdapter`) | دانلود رایگان سری تاریخی روزانه و هفتگی CSV بدون نیاز به کلید API برای بک‌تست بلندمدت و مرجع EOD | کالاها (`cb.f`, `cl.f`), فلزات (`xauusd`, `xagusd`), فارکس (`eurusd`), کریپتو (`btcusd`, `ethusd`), شاخص‌ها (`^spx`, `^ndq`), سهام (`nvda.us`...) | `D1`, `W1` |
| **`eia_brent_spot`** | **U.S. EIA Official Daily FOB Benchmark** (`EiaBenchmarkAdapter`) | دریافت سری رسمی روزانه نفت برنت دریای شمال (Europe Brent Spot Price FOB) | `SPOTBRENT` (`EIA:RBRTE`) | `D1` |

> **نکته کلیدهای شخصی (`BYOK`):** کلیدهای شخصی کاربر برای `Twelve Data`, `Stooq`, `Alpha Vantage` و `Finnhub` فقط به‌صورت محلی در کلاینت نگهداری و در درخواست‌های مرتبط با هدر HTTP `X-Provider-Api-Key` به سرور ارسال می‌شوند و در JSON عمومی `workspace_sync.php` ذخیره نمی‌گردند.

### ۳.۳. کاتالوگ استاندارد ۲۲ نماد واچ‌لیست و زنجیره اولویت منابع داده

| ردیف | نماد (`symbolCode`) | توضیح انگلیسی (`nameEn`) | توضیح فارسی (`nameFa`) | طبقه (`category`) | اعشار | منبع پیش‌فرض | زنجیره اولویت منابع مجاز |
|---:|---|---|---|---|---:|---|---|
| 1 | **`SPOTBRENT`** | Brent Crude (Spot) | نفت برنت اسپات | `ENERGY` | 3 | **`tvdatafeed`** | `tvdatafeed` → `dukascopy` → `biquote` → `yahoo_finance` → `twelve_data` → `stooq` → `eia_brent_spot` |
| 2 | **`ETHUSD`** | Ethereum / U.S. Dollar | اتریوم / دلار آمریکا | `CRYPTO` | 2 | **`biquote`** | `biquote` → `yahoo_finance` → `twelve_data` → `tvdatafeed` → `stooq` |
| 3 | **`BTCUSD`** | Bitcoin / U.S. Dollar | بیت‌کوین / دلار آمریکا | `CRYPTO` | 2 | **`biquote`** | `biquote` → `yahoo_finance` → `twelve_data` → `tvdatafeed` → `stooq` |
| 4 | **`XAGUSD`** | Silver / U.S. Dollar | نقره جهانی / دلار آمریکا | `METALS` | 3 | **`biquote`** | `biquote` → `twelve_data` → `yahoo_finance` → `dukascopy` → `stooq` → `tvdatafeed` |
| 5 | **`XAUUSD`** | Gold Spot / U.S. Dollar | طلای جهانی اسپات / دلار | `METALS` | 2 | **`twelve_data`** | `twelve_data` → `biquote` → `dukascopy` → `yahoo_finance` → `stooq` → `tvdatafeed` |
| 6 | **`SPX500USD`** | US SPX 500 | شاخص S&P 500 آمریکا | `INDICES` | 2 | **`yahoo_finance`** | `yahoo_finance` → `tvdatafeed` → `twelve_data` → `stooq` |
| 7 | **`NDQ`** | US 100 Index (Nasdaq 100) | شاخص نزدک ۱۰۰ آمریکا | `INDICES` | 2 | **`yahoo_finance`** | `yahoo_finance` → `tvdatafeed` → `twelve_data` → `stooq` |
| 8 | **`EURUSD`** | Euro / U.S. Dollar | یورو / دلار آمریکا | `FX` | 4 | **`tvdatafeed`** | `tvdatafeed` → `twelve_data` → `biquote` → `dukascopy` → `yahoo_finance` → `stooq` |
| 9 | **`USOIL`** | CFDs on WTI Crude Oil | نفت خام سبک تگزاس (WTI) | `ENERGY` | 2 | **`tvdatafeed`** | `tvdatafeed` → `yahoo_finance` → `biquote` → `twelve_data` → `stooq` |
| 10–22 | **`NVDA, AMZN, TSLA, AAPL, GOOGL, MSFT, META, NFLX, AMD, UBER, NKE, IBM, SAN`** | سهام آمریکا و اروپا | سهام برتر بازار | `STOCKS` | 2 | **`yahoo_finance`** | `yahoo_finance` → `twelve_data` → `stooq` → `tvdatafeed` |

---

## ۴. ساختار دیتابیس مرکزی برای همگام‌سازی محیط کاری (`user_workspace`)

جدول `user_workspace` در MariaDB به‌عنوان تک‌منبع حقیقت وضعیت محیط کاری کاربر عمل می‌کند:

```sql
CREATE TABLE IF NOT EXISTS user_workspace (
    id INT PRIMARY KEY DEFAULT 1,
    workspace_json LONGTEXT NOT NULL,
    updated_at_utc VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- **`GET /api/v1/workspace_sync.php`**: آخرین `workspace_json` ذخیره‌شده در ردیف `id = 1` را به همراه `updated_at_utc` و زمان سرور برمی‌گرداند.
- **`POST /api/v1/workspace_sync.php`**: ساختار کامل فضای کاری (`symbols`, `preferences`, `drawings`, `open_tabs`, `last_opened_symbol`, `is_dark_theme`, `language`) را به‌صورت اتمیک ذخیره می‌کند. کلیدهای `BYOK` پیش از ارسال از پیکربندی حذف می‌شوند.

---

## ۵. قرارداد جامع JSON همگام‌سازی محیط کاری و دامنه‌ها

```json
{
  "version": "1.38.1",
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
      "show_sma50": false,
      "show_sma200": false,
      "show_ema20": false,
      "show_ema50": false,
      "show_bollinger": false,
      "show_supertrend": false,
      "show_vwap": false,
      "show_rsi14": false,
      "show_macd": false,
      "show_overlay_macd": false,
      "show_atr14": false,
      "show_smc_structure": false,
      "show_fvg": false,
      "show_volume_profile": false,
      "is_magnet_enabled": false,
      "is_active": true
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
  }
}
```

### ۵.۱. قرارداد دامنه‌های کلیدی
- **تب‌های باز (`open_tabs` & `chartId`):** شناسه متمرکز تب‌ها با فرمت استاندارد `${symbolCode}_${timeframe}` هماهنگ‌سازی می‌شود و تایم‌فریم‌های `M15, M30, H1, H4, D1, W1` در `ChartTabState.kt` (اندروید) و `store.js` (وب) پشتیبانی می‌شوند.
- **ابزارهای ترسیم (`drawings`):** با کلید `${symbolCode}_${timeframe}` ذخیره می‌شوند. ۶ ابزار فعلی: `HLINE` (`hline`), `VLINE` (`vline`), `TREND` (`trend`), `FIB` (`fib`), `LONG_POS` (`long_pos`), `SHORT_POS` (`short_pos`) همراه با هر دو فیلد `colorHex` (`"FFRRGGBB"`) و `color` (`"#RRGGBB"`).
- **تنظیمات ۵ گروهی (`preferences`):** تب‌های `sync` (وضعیت MariaDB، کاوشگر دوحالته `By Market` / `By Source` و مدیریت `BYOK`), `chart` (سقف تاریخچه تا ۵۰۰۰، گام زوم، تلرانس لمس، `timezoneMode: utc|local`، `isLogScale`، `rememberLastChart`، `hideTabBarInLandscape`، `showCountdownToBarClose`، `showPrevCloseLine`، `showHighLowLabels`، تنظیمات دوره و StdDev بولینگر), `notifications` (ویبره‌ها، ذره‌بین، `showSymbolScreen`، `hideWatchlistLogos`), `theme` (تم، زبان، ۵ رنگ کندل/خطوط + پیش‌نمایش زنده), `account` (مالک، ایمیل بازیابی، تغییر رمز و خروج).
- **واچ‌لیست (محاسبه آمار روزانه):** تغییر قیمت و سقف/کف روزانه در هر دو پلتفرم (`watchlistView.js` و `MainViewModel.kt`) بر مبنای کلید روز سشن (`sessionPrevClose` بر حسب `UTC` و کندل قبلی) محاسبه می‌شود و نه ۲۴ کندل خام ثابت.

---

## ۶. چرخه حیات همگام‌سازی و ایمنی ماژول‌ها

1. **بارگذاری اولیه (`Zero-Wait Boot + Async DB Sync`):** خوانش فوری از کش محلی + `DELTA_SYNC` غیرمسدودکننده برای کندل‌های جدید و آخرین وضعیت فضای کاری؛ حفظ دقیق تفکیک وضعیت‌های شبکه (`Live`, `Market Closed`, `Cached`, `Sync Error`, `API Key Required`).
2. **ارسال خودکار با Debounce (`Auto-Push 800ms`):** تغییرات واچ‌لیست، منبع داده، خطوط ترسیمی و تنظیمات پس از `800ms` به `workspace_sync.php` ارسال می‌شوند.
3. **ثبات اسکرول لیست‌ها:** در تمامی لیست‌های اندیکاتورها، تنظیمات و واچ‌لیست وب (`scrollTop` restore) و اندروید (`rememberScrollState` / `LazyListState`) تغییر گزینه‌ها باعث پرش به بالای لیست نمی‌شود.
4. **نسخه‌بندی یکپارچه ES6 Modules:** اسکریپت‌های وب در `host_subdomain/assets/js/` با query-string نسخه واحد بارگذاری می‌شوند و دارای `window.__CI_APP_MOUNTED__` Watchdog در `index.html` هستند.

---

## ۷. اسناد مرتبط

- **مستندات محصول و قرارداد پیش‌بینی:** [`../01-product/CHART_INTELLIGENCE_MASTER_SPEC.md`](../01-product/CHART_INTELLIGENCE_MASTER_SPEC.md)
- **طراحی میزکار و سلسله‌مراتب تعاملی:** [`./DESIGN_WORKSPACE_SPEC.md`](./DESIGN_WORKSPACE_SPEC.md)
- **فهرست خطاهای باز و بررسی‌های باقی‌مانده:** [`../03-roadmap-and-issues/OPEN_ISSUES.md`](../03-roadmap-and-issues/OPEN_ISSUES.md)
- **وضعیت واقعی کد و بک‌لاگ فازهای ۲ تا ۶:** [`../03-roadmap-and-issues/ROADMAP_BACKLOG.md`](../03-roadmap-and-issues/ROADMAP_BACKLOG.md)
