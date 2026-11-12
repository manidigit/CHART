# معماری هسته مرکزی، ذخیره‌سازی افزایشی تاریخچه و قراردادهای همگام‌سازی (Central Core, DB-First Delta Sync & Sync Protocols)

> **نسخه سند:** `1.35.0` · **وضعیت:** `DECIDED & IMPLEMENTED` · **تاریخ آخرین بازبینی:** `2026-11-12`  
> این سند، مرجع فنی هسته مرکزی واحد (**Unified Central Core Engine**)، موتور ذخیره‌سازی افزایشی تاریخچه کندل‌ها (**DB-First Incremental Historical Engine**)، کاتالوگ مستقل ۷ روش جمع‌آوری داده (**Isolated Provider Methods Catalog** با افزودن `stooq` و پنل `BYOK`)، کاتالوگ استاندارد ۲۲ نماد واچ‌لیست به همراه اولویت منابع بر اساس طبقه دارایی و قراردادهای رسمی همگام‌سازی (**Sync Protocols**) بین نسخه **اندروید (Kotlin / Jetpack Compose)**، نسخه **وب (`chart.manico.es`)** و **دیتابیس مرکزی MariaDB** است.

---

## ۱. نمای کلی معماری سه لایه و هسته مرکزی واحد (Central Core Engine)

پلتفرم **CHART (Chart Intelligence)** بر پایه معماری **Server-Authoritative Central Core + DB-First Historical Persistence + Offline-First Local Cache** طراحی شده است تا داده‌های تاریخی، روش‌های جمع‌آوری داده و وضعیت محیط کاری کاربر در هر دو کلاینت وب و اندروید به‌طور کامل یکسان و هماهنگ باشند:

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                         لایه کلاینت‌ها (Presentation & Interactive UI)                 │
│                                                                                       │
│   ┌─────────────────────────────────────┐     ┌───────────────────────────────────┐   │
│   │  اپلیکیشن اندروید (Kotlin/Compose)  │     │  اپلیکیشن وب (ES6 Modules / SPA)  │   │
│   │  - MainViewModel + 3 Coordinators   │     │  - store.js (Central Reactive)    │   │
│   │  - 22-Symbol Catalog + 6 Providers  │     │  - 22-Symbol Catalog + 6 Providers│   │
│   │  - SharedPreferences Delta Cache    │     │  - localStorage Delta Cache       │   │
│   └──────────────────┬──────────────────┘     └─────────────────┬─────────────────┘   │
└──────────────────────┼──────────────────────────────────────────┼─────────────────────┘
                       │  REST JSON API (`https://chart.manico.es/api/v1/`)
                       │  + DB-First Delta Candle Sync (`since_ms`) + Workspace Sync
                       ▼                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                    لایه سرور و هسته مرکزی (`host_subdomain/api/v1/`)                   │
│                                                                                       │
│  • `auth.php`              — احراز هویت مالک، توکن نشست، بازیابی رمز ۶ رقمی ایمیلی    │
│  • `workspace_sync.php`    — قرارداد واحد همگام‌سازی دوطرفه (تب‌ها، خطوط، واچ‌لیست)   │
│  • `candles_sync.php`      — موتور DB-First (خوانش تاریخچه از DB + دریافت فقط Delta) │
│  • `providers_catalog.php` — کاتالوگ مستقل ۶ روش، فرمول‌ها، ۲۲ نماد و آمار کندل‌های DB│
│  • `system/status.php`     — پایش سلامت سرور، نسخه MariaDB، شمارش کندل‌ها و زمان UTC  │
└──────────────────────────────────────────┬────────────────────────────────────────────┘
                                           │ PDO Prepared Statements (`DECIMAL(18,8)`)
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                         دیتابیس مرکزی MariaDB (`manicoes_chart`)                       │
│                                                                                       │
│  • `candles`        — آرشیو ماندگار کندل‌های بسته‌شده با کلید یکتای ۴گانه:            │
│                       `UNIQUE(chart_id, provider_id, timeframe, open_time_utc)`       │
│  • `user_workspace` — تک‌ردیف مرجع (`id = 1`) حاوی JSON کامل محیط کاری (`LONGTEXT`)   │
│  • `user_sessions`  — نشست‌های معتبر وب و اندروید + هش Argon2id/Bcrypt حساب مالک      │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ۲. معماری ذخیره‌سازی افزایشی تاریخچه کندل‌ها (DB-First Incremental Historical Persistence)

### ۲.۱. قانون طلایی عدم دریافت مجدد تاریخچه (Immutability of Closed Historical Candles)
کندل‌های بسته‌شده تاریخی (`is_closed = 1`) پس از عبور زمان بسته شدن به وقت استاندارد `00:00:00 UTC`، **تغییرناپذیر (Immutable)** هستند. بنابراین:
1. **ممنوعیت واکشی تکراری تاریخچه:** هرگاه تاریخچه یک نماد از یک منبع مشخص (`provider_id`) و در یک تایم‌فریم مشخص (`timeframe`) قبلاً دریافت و در جدول `candles` دیتابیس مرکزی ذخیره شده باشد، سیستم **هرگز** نباید در دفعات بعدی کل تاریخچه قبلی را مجدداً از API یا اسکریپت منبع استخراج کند.
2. **استعلام اول از دیتابیس مرکزی (`Database-First Lookup`):** در ابتدای هر درخواست به `candles_sync.php`، موتور مرکزی ابتدا وضعیت موجود در جدول `candles` را برای کلید `(chart_id, provider_id, timeframe)` بررسی می‌کند:
   - `stored_count`: تعداد کل کندل‌های بسته‌شده موجود در دیتابیس برای این ترکیب.
   - `min_open_time_utc`: قدیمی‌ترین کندل موجود در دیتابیس.
   - `max_open_time_utc`: جدیدترین کندل بسته‌شده موجود در دیتابیس.
   - `expected_last_closed_open_ms`: زمان باز شدن آخرین کندلی که طبق تقویم بازار و ساعت فعلی `UTC` باید بسته شده باشد.

### ۲.۲. ماشین وضعیت ۳گانه دریافت افزایشی (3-State Incremental Sync Engine)

| وضعیت (`sync_mode`) | شرط فعال‌سازی در هسته مرکزی | رفتار موتور مرکزی (`candles_sync.php`) | تعداد کندل درخواستی از منبع خارجی |
|---|---|---|---|
| **`DB_CACHE_HIT`** | `stored_count >= min_bars` **و** `max_open_time_utc >= expected_last_closed_open_ms` (و عدم درخواست `force_backfill`) | بازگشت فوری کندل‌ها مستقیماً از جدول `candles` دیتابیس MariaDB بدون هیچ‌گونه اتصال شبکه به API یا سوکت خارجی | **`0` کندل (فراخوانی خارجی صفر)** |
| **`DELTA_SYNC`** | `stored_count > 0` **و** `max_open_time_utc < expected_last_closed_open_ms` | محاسبه دقیق فاصله زمانی جاافتاده: `missing_bars = ceil((expected_last_closed_open_ms - max_open_time_utc) / step_ms) + 4`؛ دریافت **فقط کندل‌های جدیدتر از `max_open_time_utc`** از منبع، ذخیره در دیتابیس و بازگشت کل سری یکپارچه از دیتابیس | **فقط تعداد کندل‌های جاافتاده جدید (`deltaBars`)** |
| **`INITIAL_BACKFILL`** | `stored_count == 0` (اولین بار برای این نماد/منبع/تایم‌فریم) یا درخواست صریح کاربر برای تکمیل عقب‌گرد تاریخچه (`backfill=1`) | دریافت تاریخچه کامل اولیه (تا سقف `limit` تا ۵۰۰۰ کندل) از آداپتور منبع، ذخیره دسته‌ای (`Batch Transaction`) در جدول `candles` و بازگشت سری کامل | **سقف درخواستی (`limit` تا ۵۰۰۰ کندل)** |

### ۲.۳. پشتیبانی از پارامتر `since_ms` بین کلاینت‌ها و سرور
- کلاینت‌های وب و اندروید هنگام درخواست همگام‌سازی یک نماد، اگر کندل‌های قبلی را در کش محلی خود (`localStorage` یا `SharedPreferences`) داشته باشند، می‌توانند آخرین زمان کندل محلی (`since_ms`) را ارسال کنند یا سری کامل را از دیتابیس سرور تحویل بگیرند و به‌صورت Idempotent با کش محلی ادغام کنند.
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

## ۳. کاتالوگ مستقل ۶ روش جمع‌آوری داده (`ProviderCatalog`) و ۲۲ نماد استاندارد واچ‌لیست

### ۳.۱. اصل تفکیک ۱۰۰٪ منابع و ممنوعیت جایگزینی پنهان (Strict Provider Isolation)
1. **کلید ذخیره‌سازی مستقل در دیتابیس:** در جدول `candles`، کلید یکتا به‌صورت `UNIQUE KEY uq_candle_identity (chart_id, provider_id, timeframe, open_time_utc)` تعریف شده است. بنابراین کندل‌های نماد `SPOTBRENT` از روش `tvdatafeed` کاملاً جدا از کندل‌های `SPOTBRENT` از روش `biquote`، `twelve_data` یا `yahoo_finance` ذخیره می‌شوند.
2. **حذف کامل Fallback پنهان بین منابع:** هیچ آداپتوری مجاز نیست در صورت نبود کلید API یا خطای شبکه، به‌طور پنهانی کندل‌های یک منبع دیگر را دریافت و به نام منبع فعلی در دیتابیس ثبت کند.

### ۳.۲. شناسنامه فنی ۶ روش مستقل جمع‌آوری داده در هسته مرکزی

| شناسه روش (`provider_id`) | نام روش و الگوریتم | مکانیزم فنی و فرمول استخراج | نمادهای رسمی تعریف‌شده در کاتالوگ (`exchange:ticker`) | تایم‌فریم‌ها |
|---|---|---|---|---|
| **`tvdatafeed`** | **TradingView Wick & WebSocket Engine (`METHOD_TVDATAFEED_WICK`)** | ۱. خوانش آرشیو پایه شدودار (`data/tvdatafeed/{SYMBOL}_{TF}.json` / `.csv`) در اولین راه‌اندازی (`INITIAL_BACKFILL`).<br>۲. اتصال مستقیم سوکت امن `wss://data.tradingview.com/socket.io/websocket` با پروتکل فریم‌بندی `~m~{len}~m~{json}` برای دریافت کندل‌های جدید بسته‌شده (`DELTA_SYNC`).<br>۳. تراز کردن کندل‌های `D1` بازشده در `22:00/23:00 UTC` به نیمه‌شب روز معاملاتی بعد و ساخت دقیق `H4` و `W1`. | • کالا و انرژی: `SPOTBRENT` (`PEPPERSTONE:SPOTBRENT`)، `USOIL` (`TVC:USOIL`)، `XAUUSD` (`OANDA:XAUUSD`)، `XAGUSD` (`OANDA:XAGUSD`)<br>• فارکس و کریپتو: `EURUSD` (`OANDA:EURUSD`)، `BTCUSD` (`BITSTAMP:BTCUSD`)، `ETHUSD` (`BITSTAMP:ETHUSD`)<br>• شاخص‌ها: `SPX500USD` (`OANDA:SPX500USD`)، `NDQ` (`NASDAQ:NDX`)<br>• سهام آمریکا: `NVDA`, `AMZN`, `TSLA`, `AAPL`, `GOOGL`, `MSFT`, `META`, `NFLX`, `AMD`, `UBER`, `NKE`, `IBM`, `SAN` | `M15`, `H1`, `H4`, `D1`, `W1` |
| **`biquote`** | **biquote Multi-Asset Feed (`METHOD_BIQUOTE_FEED`)** | فید سریع و رایگان چنددارایی (کریپتو، فلزات گران‌بها، انرژی و فارکس) بدون نیاز به کلید API پولی؛ استخراج کندل‌های بسته‌شده `UTC` با دقت اعشاری استاندارد هر نماد و پشتیبانی کامل از `DELTA_SYNC` بر اساس `since_ms`. | • کریپتو: `BTCUSD` (`BTCUSD`)، `ETHUSD` (`ETHUSD`)<br>• فلزات: `XAGUSD` (`XAGUSD`)، `XAUUSD` (`XAUUSD`)<br>• انرژی: `SPOTBRENT` (`UKOIL`)، `USOIL` (`USOIL`)<br>• فارکس: `EURUSD` (`EURUSD`) | `M15`, `H1`, `H4`, `D1`, `W1` |
| **`twelve_data`** | **Twelve Data REST Time-Series API (`METHOD_TWELVE_DATA_REST`)** | فراخوانی مستقیم اندپوینت رسمی `https://api.twelvedata.com/time_series` با منطقه زمانی `UTC` و کلید `TWELVE_DATA_API_KEY`. در حالت `DELTA_SYNC`، پارامتر `outputsize` صرفاً به تعداد کندل‌های جاافتاده جدید تنظیم می‌شود. | • تمام ۲۲ نماد واچ‌لیست شامل `XAUUSD` (`XAU/USD`)، `XAGUSD` (`XAG/USD`)، `SPOTBRENT` (`XBR/USD`)، `USOIL` (`WTI/USD`)، `EURUSD` (`EUR/USD`)، `BTCUSD` (`BTC/USD`)، `ETHUSD` (`ETH/USD`)، `SPX500USD` (`SPX`)، `NDQ` (`NDX`) و ۱۳ نماد سهام (`NVDA` تا `SAN`) | `M15`, `H1`, `H4`, `D1`, `W1` |
| **`dukascopy`** | **Dukascopy Swiss Bank Historical Feed (`METHOD_DUKASCOPY_SWISS_BANK`)** | استخراج کندل‌های استاندارد بانکی و بین‌بانکی سوئیس با فیلتر کامل تیک‌های مصنوعی آخر هفته (`volume = 0` و اسپردهای میکرونی تعطیلات شنبه/یکشنبه) و تجمیع استاندارد به `H4` و `W1`. | • `SPOTBRENT` (`BRENT.CMD/USD`)<br>• `XAUUSD` (`XAU/USD`)<br>• `XAGUSD` (`XAG/USD`)<br>• `EURUSD` (`EUR/USD`) | `M15`, `H1`, `H4`, `D1`, `W1` |
| **`yahoo_finance`** | **Yahoo Finance v8 Chart Engine (`METHOD_YAHOO_FINANCE_V8`)** | فراخوانی اندپوینت عمومی `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}` بدون نیاز به کلید API؛ مرجع اول و پایدار برای **سهام آمریکا** و **شاخص‌های جهانی** (`SPX500USD`, `NDQ`). در حالت `DELTA_SYNC` از بازه کوتاه (`1d` یا `5d`) استفاده می‌کند تا فقط کندل‌های جدید دریافت شوند. | • سهام آمریکا (اولویت اول): `NVDA`, `AMZN`, `TSLA`, `AAPL`, `GOOGL`, `MSFT`, `META`, `NFLX`, `AMD`, `UBER`, `NKE`, `IBM`, `SAN`<br>• شاخص‌ها (اولویت اول): `SPX500USD` (`^GSPC`)، `NDQ` (`^NDX`)<br>• کریپتو، کالا و فارکس: `BTCUSD` (`BTC-USD`)، `ETHUSD` (`ETH-USD`)، `SPOTBRENT` (`BZ=F`)، `USOIL` (`CL=F`)، `XAUUSD` (`GC=F`)، `XAGUSD` (`SI=F`)، `EURUSD` (`EURUSD=X`) | `M15`, `H1`, `H4`, `D1`, `W1` |
| **`eia_brent_spot`** | **U.S. EIA Official Daily FOB Benchmark (`METHOD_EIA_SPOT_DAILY`)** | دریافت سری زمانی رسمی روزانه نفت برنت دریای شمال (Europe Brent Spot Price FOB) از مرجع داده‌های انرژی آمریکا (EIA / DataHub)؛ مختص تایم‌فریم روزانه (`D1`). | • `SPOTBRENT` (`EIA:RBRTE`) | `D1` |

### ۳.۳. کاتالوگ استاندارد ۲۲ نماد واچ‌لیست و زنجیره اولویت منابع داده (22-Symbol Watchlist & Asset-Class Priority Rules)

بر اساس نوع دارایی (کالاها و فلزات، فارکس، کریپتو، شاخص‌ها و سهام آمریکایی)، ترتیب و اولویت منابع داده برای هر یک از ۲۲ نماد استاندارد پروژه به‌صورت زیر تثبیت شده است:

| ردیف | نماد (`symbolCode`) | توضیح انگلیسی (`nameEn`) | توضیح فارسی (`nameFa`) | طبقه (`category`) | اعشار | منبع پیش‌فرض (اولویت ۱) | زنجیره کامل منابع مجاز به ترتیب اولویت (`allowedProviders`) |
|---|---|---|---|---|---|---|---|
| 1 | **`SPOTBRENT`** | Brent Crude (Spot) | نفت برنت اسپات | `ENERGY` | 3 | **`tvdatafeed`** | `1. tvdatafeed` → `2. dukascopy` → `3. biquote` → `4. yahoo_finance` → `5. twelve_data` → `6. eia_brent_spot` |
| 2 | **`ETHUSD`** | Ethereum / U.S. Dollar | اتریوم / دلار آمریکا | `CRYPTO` | 2 | **`biquote`** | `1. biquote` → `2. yahoo_finance` → `3. twelve_data` → `4. tvdatafeed` |
| 3 | **`BTCUSD`** | Bitcoin / U.S. Dollar | بیت‌کوین / دلار آمریکا | `CRYPTO` | 2 | **`biquote`** | `1. biquote` → `2. yahoo_finance` → `3. twelve_data` → `4. tvdatafeed` |
| 4 | **`XAGUSD`** | Silver / U.S. Dollar | نقره جهانی / دلار آمریکا | `METALS` | 3 | **`biquote`** | `1. biquote` → `2. twelve_data` → `3. yahoo_finance` → `4. dukascopy` → `5. tvdatafeed` |
| 5 | **`XAUUSD`** | Gold Spot / U.S. Dollar | طلای جهانی اسپات / دلار | `METALS` | 2 | **`twelve_data`** | `1. twelve_data` → `2. biquote` → `3. dukascopy` → `4. yahoo_finance` → `5. tvdatafeed` |
| 6 | **`SPX500USD`** | US SPX 500 | شاخص S&P 500 آمریکا | `INDICES` | 2 | **`yahoo_finance`** | `1. yahoo_finance` → `2. tvdatafeed` → `3. twelve_data` |
| 7 | **`NDQ`** | US 100 Index (Nasdaq 100) | شاخص نزدک ۱۰۰ آمریکا | `INDICES` | 2 | **`yahoo_finance`** | `1. yahoo_finance` → `2. tvdatafeed` → `3. twelve_data` |
| 8 | **`EURUSD`** | Euro / U.S. Dollar | یورو / دلار آمریکا | `FX` | 4 | **`tvdatafeed`** | `1. tvdatafeed` → `2. twelve_data` → `3. biquote` → `4. dukascopy` → `5. yahoo_finance` |
| 9 | **`USOIL`** | CFDs on WTI Crude Oil | نفت خام سبک تگزاس (WTI) | `ENERGY` | 2 | **`tvdatafeed`** | `1. tvdatafeed` → `2. yahoo_finance` → `3. biquote` → `4. twelve_data` |
| 10 | **`NVDA`** | NVIDIA Corporation | سهام انویدیا (NVIDIA) | `STOCKS` | 2 | **`yahoo_finance`** | `1. yahoo_finance` → `2. twelve_data` → `3. tvdatafeed` |
| 11 | **`AMZN`** | Amazon.com, Inc. | سهام آمازون (Amazon) | `STOCKS` | 2 | **`yahoo_finance`** | `1. yahoo_finance` → `2. twelve_data` → `3. tvdatafeed` |
| 12 | **`TSLA`** | Tesla, Inc. | سهام تسلا (Tesla) | `STOCKS` | 2 | **`yahoo_finance`** | `1. yahoo_finance` → `2. twelve_data` → `3. tvdatafeed` |
| 13 | **`AAPL`** | Apple Inc. | سهام اپل (Apple) | `STOCKS` | 2 | **`yahoo_finance`** | `1. yahoo_finance` → `2. twelve_data` → `3. tvdatafeed` |
| 14 | **`GOOGL`** | Alphabet Inc (Google) Class A | سهام آلفابت / گوگل (Google) | `STOCKS` | 2 | **`yahoo_finance`** | `1. yahoo_finance` → `2. twelve_data` → `3. tvdatafeed` |
| 15 | **`MSFT`** | Microsoft Corp. | سهام مایکروسافت (Microsoft) | `STOCKS` | 2 | **`yahoo_finance`** | `1. yahoo_finance` → `2. twelve_data` → `3. tvdatafeed` |
| 16 | **`META`** | Meta Platforms, Inc. | سهام متا / فیسبوک (Meta) | `STOCKS` | 2 | **`yahoo_finance`** | `1. yahoo_finance` → `2. twelve_data` → `3. tvdatafeed` |
| 17 | **`NFLX`** | Netflix, Inc. | سهام نتفلیکس (Netflix) | `STOCKS` | 2 | **`yahoo_finance`** | `1. yahoo_finance` → `2. twelve_data` → `3. tvdatafeed` |
| 18 | **`AMD`** | Advanced Micro Devices Inc | سهام ای‌ام‌دی (AMD) | `STOCKS` | 2 | **`yahoo_finance`** | `1. yahoo_finance` → `2. twelve_data` → `3. tvdatafeed` |
| 19 | **`UBER`** | Uber Technologies, Inc. | سهام اوبر (Uber) | `STOCKS` | 2 | **`yahoo_finance`** | `1. yahoo_finance` → `2. twelve_data` → `3. tvdatafeed` |
| 20 | **`NKE`** | Nike, Inc. | سهام نایکی (Nike) | `STOCKS` | 2 | **`yahoo_finance`** | `1. yahoo_finance` → `2. twelve_data` → `3. tvdatafeed` |
| 21 | **`IBM`** | International Business Machines | سهام آی‌بی‌ام (IBM) | `STOCKS` | 2 | **`yahoo_finance`** | `1. yahoo_finance` → `2. twelve_data` → `3. tvdatafeed` |
| 22 | **`SAN`** | Banco Santander, S.A. | سهام بانک سانتاندر (Santander) | `STOCKS` | 2 | **`yahoo_finance`** | `1. yahoo_finance` → `2. twelve_data` → `3. tvdatafeed` |

---

## ۴. جریان دوحالته انتخاب منبع و نماد در تنظیمات و واچ‌لیست (Dual-Mode Source & Symbol Explorer)

در تب **«همگام‌سازی (`sync`)»** بخش تنظیمات (هم در نسخه وب و هم در نسخه اندروید)، مدیریت منابع داده و ساخت واچ‌لیست از هر دو جریان کاربری به‌طور هم‌زمان پشتیبانی می‌کند:

1. **حالت اول — مرور و فیلتر بر اساس منبع جمع‌آوری (`By Source Method -> Symbols`):**
   - کاربر یکی از ۶ روش جمع‌آوری داده (`TradingView Wick`, `biquote`, `Twelve Data API`, `Dukascopy`, `Yahoo Finance`, `EIA Spot`) را انتخاب می‌کند.
   - کارت شناسنامه آن روش (شامل توضیح الگوریتم، مکانیزم استخراج، تایم‌فریم‌های مجاز و کل کندل‌های ذخیره‌شده آن روش در دیتابیس) نمایش داده می‌شود.
   - در زیر آن، تمام نمادهای موجود در آن منبع فهرست می‌شوند؛ کاربر می‌تواند با یک کلیک، هر نماد را با همان منبع به واچ‌لیست اضافه کند یا منبع نماد فعلی را به این روش تغییر دهد.
2. **حالت دوم — جستجو و انتخاب بر اساس نماد (`By Symbol -> Supported Sources`):**
   - کاربر نام یا کد نماد (از بین ۲۲ نماد کاتالوگ مانند `SPOTBRENT`، `XAUUSD`، `BTCUSD`، `NVDA` و ...) را جستجو یا انتخاب می‌کند.
   - سیستم لیست تمام روش‌های جمع‌آوری داده‌ای که آن نماد را پشتیبانی می‌کنند به همراه ترتیب اولویت پیشنهادی و تعداد کندل‌های آرشیوشده هر روش در دیتابیس نشان می‌دهد تا کاربر منبع دلخواهش را برای آن نماد فعال کند.

---

## ۵. ساختار دیتابیس مرکزی برای همگام‌سازی محیط کاری (`user_workspace`)

در دیتابیس MariaDB هاست، جدول `user_workspace` به‌عنوان **تک‌منبع حقیقت (Single Source of Truth)** وضعیت محیط کاری کاربر عمل می‌کند:

```sql
CREATE TABLE IF NOT EXISTS user_workspace (
    id INT PRIMARY KEY DEFAULT 1,
    workspace_json LONGTEXT NOT NULL,
    updated_at_utc VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- **اندپوینت همگام‌سازی محیط کاری:** `/api/v1/workspace_sync.php`
  - **`GET /api/v1/workspace_sync.php`**: آخرین `workspace_json` ذخیره‌شده در ردیف `id = 1` را به همراه `updated_at_utc` و زمان سرور برمی‌گرداند.
  - **`POST /api/v1/workspace_sync.php`**: ساختار کامل فضای کاری (`symbols`, `preferences`, `drawings`, `open_tabs`, `last_opened_symbol`, `is_dark_theme`, `language`) را با دستور اتمیک `INSERT INTO user_workspace ... ON DUPLICATE KEY UPDATE` ذخیره می‌کند.

---

## ۶. قرارداد جامع JSON همگام‌سازی محیط کاری (Canonical Workspace Sync Schema)

بدنه JSON تبادل‌شده بین `workspace_sync.php`، کلاینت وب (`store.js` / `app.js`) و کلاینت اندروید (`WorkspaceRepository.kt`) دارای ساختار استاندارد زیر است:

```json
{
  "version": "1.32.0",
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
    },
    {
      "symbolCode": "SPOTBRENT",
      "activeProvider": "tvdatafeed",
      "inWatchlist": true,
      "selectedTimeframe": "M15",
      "decimals": 3,
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

## ۷. پروتکل‌های تفصیلی همگام‌سازی به تفکیک دامنه (Domain Sync Protocols)

### ۷.۱. پروتکل همگام‌سازی وضعیت تب‌های باز (`open_tabs` & `last_opened_symbol`)

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

### ۷.۲. پروتکل همگام‌سازی ابزارهای ترسیم (`drawings`)
- تمامی خطوط ترسیمی با کلید ترکیبی `${symbolCode}_${timeframe}` در دیکشنری `drawings` ذخیره می‌شوند.
- انواع ۶گانه ابزارها: `HLINE` (`hline`)، `VLINE` (`vline`)، `TREND` (`trend`)، `FIB` (`fib`)، `LONG_POS` (`long_pos`) و `SHORT_POS` (`short_pos`).
- هر شیء دارای هر دو فیلد `colorHex` (`"FFRRGGBB"`) و `color` (`"#RRGGBB"`) برای سازگاری دوطرفه وب و اندروید است.

### ۷.۳. پروتکل همگام‌سازی تنظیمات ۵گانه (`preferences`)

| شماره گروه | کلید تب (`tabKey`) | عنوان فارسی | عنوان انگلیسی | کلیدهای همگام‌سازی‌شده در هسته مرکزی |
|---:|---|---|---|---|
| **۱** | `sync` | **همگام‌سازی** | **Sync** | وضعیت زنده دیتابیس MariaDB، کاتالوگ دوحالته روش‌های جمع‌آوری داده و نمادها (`By Source` / `By Symbol`)، آمار کندل‌های ذخیره‌شده هر منبع در DB و دکمه همگام‌سازی ابری |
| **۲** | `chart` | **چارت** | **Chart** | `candleFetchLimit` (تا ۵۰۰۰)، `zoomStepCandles`، `drawingHitTolerancePx`، `isLogScale`، `rememberLastChart`، `hideTabBarInLandscape`، `showCountdownToBarClose`، `showPrevCloseLine`، `showHighLowLabels` |
| **۳** | `notifications` | **نوتیفیکیشن** | **Notifications** | `chartVibrations`، `pickerVibrates`، `showScrollMagnifier`، `showSymbolScreen`، `hideWatchlistLogos` |
| **۴** | `theme` | **تم** | **Theme** | `is_dark_theme`، `language` (`fa`/`en`)، `bullColor`، `bearColor`، `trendColor`، `hLineColor`، `vLineColor` + پیش‌نمایش زنده کندل‌ها |
| **۵** | `account` | **حساب** | **Account** | نام کاربری مالک، ایمیل بازیابی (`recovery_email`)، تغییر رمز عبور و خروج از نشست |

---

## ۸. چرخه حیات همگام‌سازی و ایمنی ماژول‌ها (Sync Lifecycle & Module Integrity)

1. **بارگذاری اولیه (`Zero-Wait Boot + Async DB Sync`):** هر دو کلاینت بلافاصله تاریخچه کندل‌ها و وضعیت تب‌ها را از کش محلی بارگذاری می‌کنند و سپس به‌صورت غیرمسدودکننده (`Async`) فقط کندل‌های جدید جاافتاده (`DELTA_SYNC`) و آخرین وضعیت فضای کاری را از سرور دریافت می‌نمایند.
2. **ارسال خودکار با Debounce (`Auto-Push 800ms`):** هر تغییر در واچ‌لیست، منبع داده، خطوط ترسیمی یا تنظیمات، پس از `800ms` به `workspace_sync.php` ارسال می‌شود.
3. **نسخه‌بندی یکنواخت ماژول‌های ES6 (`?v=1.32.0`):** تمامی ماژول‌های جاوااسکریپت در `host_subdomain/assets/js/` با رشته نسخه واحد بارگذاری می‌شوند تا از تکرار نمونه `store.js` جلوگیری شده و `window.__CI_APP_MOUNTED__ = true` تضمین گردد.
