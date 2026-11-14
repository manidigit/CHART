# CHART — Project & Development Guide

> راهنمای عملیاتی و فنی توسعه، تطبیق وضعیت واقعی کد با مشخصات، پیکربندی محرمانه و پایپ‌لاین CI/CD. مرجع تصمیمات محصول همچنان [`CHART_INTELLIGENCE_MASTER_SPEC.md`](../01-product/CHART_INTELLIGENCE_MASTER_SPEC.md) است.

**آخرین بازبینی:** `2026-11-14` · **نسخه کد و مستندات:** `1.42.0` · **وب‌اپلیکیشن:** https://chart.manico.es

---

## ۱. ترتیب مطالعه و دسته‌بندی اسناد (`docs/`)

| دسته | سند کلیدی | کاربرد |
|---|---|---|
| **۰۱ — محصول و تحقیق** | [`CHART_INTELLIGENCE_MASTER_SPEC.md`](../01-product/CHART_INTELLIGENCE_MASTER_SPEC.md) | مرجع اصلی محصول، قراردادهای داده/پیش‌بینی، قوانین مهندسی و فرمول‌های TA-Lib |
| | [`CHART_FUTURE_PREDICTION_SPEC_v1.3.0.md`](../01-product/CHART_FUTURE_PREDICTION_SPEC_v1.3.0.md) | مشخصات فنی پیش‌بینی آینده نمودار، ارزیابی احتمالاتی، سناریوها و ممیزی |
| | [`GROK_OPENMARKET_RESEARCH_NOTES.md`](../01-product/GROK_OPENMARKET_RESEARCH_NOTES.md) | پژوهش منابع رایگان/تیک (`biquote`, `Stooq`) و مدل‌های ML |
| | [`TRADING_STRATEGY_SPEC.md`](../01-product/TRADING_STRATEGY_SPEC.md) | مشخصات ماژول شبیه‌ساز استراتژی (فاز ۶) |
| **۰۲ — معماری و زیرساخت** | [`ARCHITECTURE.md`](../02-architecture/ARCHITECTURE.md) | معماری ۳ لایه، موتور `DB-First Delta Sync`، کاتالوگ ۷ منبع / ۲۲ نماد و قرارداد JSON |
| | [`DESIGN_WORKSPACE_SPEC.md`](../02-architecture/DESIGN_WORKSPACE_SPEC.md) | چیدمان ۵ لایه، Z-index بوم، اولویت تعاملات لمسی و توکن‌های بصری |
| | [`INFRASTRUCTURE_INVENTORY.md`](../02-architecture/INFRASTRUCTURE_INVENTORY.md) | وضعیت cPanel، MariaDB `10.6.28`، محدودیت‌ها و چک‌لیست هاست |
| | [`SECURITY.md`](../02-architecture/SECURITY.md) | ایزوله‌سازی اسرار، BYOK و سیاست گزارش آسیب‌پذیری |
| **۰۳ — نقشه راه و مسائل** | [`OPEN_ISSUES.md`](../03-roadmap-and-issues/OPEN_ISSUES.md) | مسائل باز واقعی، باگ‌های جزئی باقی‌مانده و پرسش‌های تاییدنشده |
| | [`ROADMAP_BACKLOG.md`](../03-roadmap-and-issues/ROADMAP_BACKLOG.md) | مرز قابلیت‌های تحویل‌شده vs بک‌لاگ فاز ۲ و فازهای ۳ تا ۶ |
| **۰۴ — توسعه و استقرار** | [`AGENTS.md`](./AGENTS.md) و [`CONTRIBUTING.md`](./CONTRIBUTING.md) و [`CHANGELOG.md`](./CHANGELOG.md) | قوانین هوش مصنوعی، دستورالعمل بیلد/تست و تاریخچه تغییرات |

---

## ۱.۱. گزارش ممیزی واقعی کد در برابر مشخصات (`Code vs. Spec Audit`)

بررسی خط‌به‌خط فایل‌های اندروید (`app/src/main/java/`)، وب (`host_subdomain/assets/js/`) و بک‌اند PHP (`host_subdomain/api/v1/`):

| بخش / قابلیت | وضعیت واقعی در کد | فایل‌های مرتبط در کد منبع | وضعیت ممیزی | توضیحات عینی |
|---|---|---|---|---|
| **۱. احراز هویت و بازیابی رمز ۶ رقمی** | کامل در بک‌اند، وب و اندروید | `auth.php`, `WorkspaceRepository.kt`, `loginView.js` | `VERIFIED` | ورود با هش نمک‌دار SHA-256، نشست `Remember Me` و OTP ایمیلی پیاده شده است. |
| **۲. تب‌های چندگانه چارت (`Multi-Tab`)** | کامل در وب و اندروید | `ChartTabBar.kt`, `ChartViewScreen.kt`, `headerView.js` | `VERIFIED` | باز کردن، بستن (`✕`) و جابه‌جایی با کلید `${SYMBOL}_${TF}` و همگام‌سازی ابری فعال است. |
| **۳. کاتالوگ ۲۲ نماد و ۸ منبع داده + `BYOK`** | کامل در هر ۳ لایه | `ProviderCatalog.php`, `providers/`, `store.js`, `ProviderId.kt` | `VERIFIED` | ۸ آداپتور (`tvdatafeed`, `biquote`, `twelve_data`, `dukascopy`, `yahoo_finance`, `stooq`, `eia_brent_spot`, `local_csv`) با جداسازی کلیدهای BYOK در هدر `X-Provider-Api-Key`. |
| **۴. موتور `DB-First Delta Sync` و `ENG-01/02/03`** | کامل در وب، اندروید و PHP | `candles_sync.php`, `quote.php`, `gap_report.php`, `TimeframeAggregator.*`, `UtcTimeAnchor*` | `VERIFIED` | هم‌ترازی سشن (`09:30 NY`, `17:00 NY`, `00:00 UTC` + DST)، تفکیک Quote زنده از کندل بسته، و تشخیص Gap آگاه از تقویم. |
| **۵. ابزارهای ترسیم (`6 Base + 12 Multi-Anchor`)** | کامل در وب و اندروید | `CandlestickCanvas.kt`, `DrawingToolbar.kt`, `DrawingGeometryAlgorithm.kt`, `chartRenderer.js`, `drawingGeometry.js` | `VERIFIED` | `HLINE`, `VLINE`, `TREND`, `FIB`, `LONG_POS`, `SHORT_POS` + ۱۲ خانواده فاز ۲ (`XABCD`, `ABCD`, `H&S`, `Gann Fan/Box`, `4-Variant Pitchfork`, `Fib Time/Speed`, `Cyclic`, `AVWAP`, `FRVP`, `Regression`) با Magnet و سینک ابری. |
| **۶. اندیکاتورها (۱۵/۱۵ TradingView)، `SMC` و `VRVP`** | کامل در وب و اندروید | `Phase2IndicatorsAlgorithm.kt`, `CandlestickCanvas.kt`, `technicalIndicators.js`, `chartRenderer.js` | `VERIFIED` | کل ۱۵ اندیکاتور اصلی شامل `Pivot Points` با هر ۴ واریانت (`Standard/Fibonacci/Camarilla/Woodie` و `R3/R4/S3/S4`), `Ichimoku`, `Parabolic SAR`, `ADX`, `Stochastic`, `CCI`, `Williams %R`, `Keltner`, `Donchian`, `OBV`, `CMF`, `ROC`, `MTF EMA`, `Killzones`, `SMC` و `VRVP`. |
| **۷. بهینه‌سازی ۶۰fps و ثبات اسکرول لیست‌ها** | کامل در وب و اندروید | `CandlestickCanvas.kt`, `chartRenderer.js`, `app.js`, `watchlistView.js`, `settingsView.js` | `VERIFIED` | Memoization اندیکاتورها (`remember` / `tab._indCache`), جداسازی تایمر معکوس ۱ ثانیه‌ای و حفظ `scrollTop`/`LazyListState`. |
| **۸. شیت جزئیات نماد، `Symbol Intel` و `Seasonals`** | کامل در هر ۳ لایه | `symbol_intel.php`, `WatchlistScreen.kt`, `watchlistView.js` | `VERIFIED` | اتصال زنده به Yahoo/EIA RSS و SEC EDGAR (صرفاً سهام آمریکا)، شاخص‌های کلان و Seasonals قفل‌شده روی حداقل ۱۲ ماه واقعی. |
| **۹. تنظیمات ۵ تبه، `php_runtime` و `Reset All`** | کامل در وب، اندروید و PHP | `ChartPreferenceCoordinator.kt`, `WorkspaceRepository.kt`, `store.js`, `settingsView.js`, `system/status.php` | `VERIFIED` | تنظیمات رنگ/اندیکاتورها، کاوشگر دوحالته، گزارش تشخیصی `php_runtime`، و بازنشانی `Reset All` با سینک ابری. |
| **۱۰. فاز ۳ کامل در کد (`Gap`, `Import`, `Backup`)** | کامل در وب، اندروید و PHP | `import_candles.php`, `LocalCsvAdapter.php`, `backup.php`, `candleImport.js`, `CandleImportAlgorithm.kt`, `Phase3ImportCard.kt` | `VERIFIED (CODE)` | ورود فایل‌های `CSV / XLS (BIFF8, XML, HTML) / JSON / Manual OHLC` با `Strict No-Image-Storage Policy` و بکاپ رمزنگاری‌شده `AES-256-GCM` کامل در کد؛ تاییدهای زنده cPanel باقی مانده است. |
| **۱۱. فاز ۴ — موتور پیش‌بینی مستقل و پلاگین‌محور (`PRED-01..08`)** | هسته آماری و دفترکل در کد کامل؛ Worker خارجی DL باز | `host_subdomain/assets/js/forecast/*`, `app/.../forecast/*`, `ForecastEnginePhp.php`, `forecast.php`, `003_phase4_forecast_tables.sql`, `forecastView.js`, `ForecastLabScreen.kt` | `PHASE 4 CORE VERIFIED` | موتور ایزوله با بازده لگاریتمی، ۶ مدل پلاگین (`Persistence`, `ATR Cone`, `Kalman`, `GARCH(1,1)`, `AR(2)+ETS`, `GP`)، Purged Walk-Forward (`AcceptanceGate`), دفترکل `SHA-256`, تب مستقل `Forecast Studio / Lab` و رندر ۳ حالته `Fan / Ghost / Hybrid` ($h=10..60$). |

---

## ۲. امنیت و پیکربندی محرمانه

**مقادیر واقعی رمزها، توکن‌ها و کلیدهای API هرگز نباید در Git یا اسناد قرار گیرند.** هشت Secret زیر در **GitHub Repository Secrets** نگهداری و در پایپ‌لاین استقرار استفاده می‌شوند:

| Secret | کاربرد |
|---|---|
| `CPANEL_API_TOKEN` | توکن UAPI سی‌پنل برای استقرار کنترل‌شده |
| `CPANEL_DOCROOT` | مسیر Document Root ساب‌دامین `chart.manico.es` |
| `CPANEL_HOST` | آدرس سرور cPanel |
| `CPANEL_USERNAME` | نام کاربری اکانت cPanel |
| `DB_NAME` | نام دیتابیس MariaDB (`DB_HOST = localhost` در سرور) |
| `DB_PASSWORD` | رمز دیتابیس MariaDB |
| `DB_USER` | نام کاربری دیتابیس MariaDB |
| `TWELVE_DATA_API_KEY` | کلید API سرویس Twelve Data |

---

## ۳. خلاصه استانداردهای مهندسی پروژه

1. **بومی‌سازی کامل (`fa`/`en`):** کلیدهای معنایی در `app/src/main/res/values*/strings.xml` و `host_subdomain/i18n/{en,fa}.json` بدون متن Hardcode؛ اعداد مالی و ساعت `JetBrains Mono` با جهت `LTR`.
2. **توکن‌های متمرکز و عدم هاردکد:** رنگ‌ها و ابعاد از `Theme.kt` / `theme.css`؛ پارامترهای الگوریتم قابل تنظیم در `Settings`.
3. **معماری ماژولار و الگوریتم خالص:** تفکیک `algorithms/`, `providers/`, `coordinators/` (اندروید) و ماژول‌های `ES6` (وب)؛ یک مسئولیت در هر فایل.
4. **دقت مالی و زمانی:** نوع `DECIMAL(18,8)` در MariaDB؛ زمان ذخیره و مبادله `UTC`.
5. **قرارداد واحد API و وضعیت‌های صریح UI:** پاسخ JSON استاندارد (`ApiEnvelope.php`) با `message_key` دوزبانه و وضعیت‌های واضح `Live / Market Closed / Cached / Sync Error / API Key Required`.
6. **هویت صریح سری‌های بازار:** اولویت منابع بر اساس طبقه دارایی و بدون ادغام خاموش `Spot / CFD / Futures`:
   - `SPOTBRENT` / `USOIL` / `EURUSD` ← پیش‌فرض `tvdatafeed`
   - `XAUUSD` ← پیش‌فرض `twelve_data`
   - `XAGUSD` / `BTCUSD` / `ETHUSD` ← پیش‌فرض `biquote`
   - `SPX500USD`, `NDQ`, `NVDA..SAN` ← پیش‌فرض `yahoo_finance`
   - سری تاریخی مرجع روزانه برنت از ۱۹۸۷ ← `eia_brent_spot` (`RBRTEd`) و `stooq` (`D1/W1`).

---

## ۴. پایپ‌لاین GitHub Actions (`.github/workflows/build-apk.yml`)

فایل `.github/workflows/build-apk.yml` (اجرا با `push` به `main` یا `workflow_dispatch`) دارای دو Job اصلی است:
1. **`Build Android APK`:** بازسازی keystore ثابت (`CANONICAL_B64` مطابق اثر انگشت `SHA1: 38:C6:57:E4:12:4A:90:85:94:BA:0C:B3:C2:A3:A9:F8:F5:3B:E1:6B` تا آپدیت درجا بدون حذف نسخه قبلی نصب شود)، تزریق `.env` برای Secrets Plugin و بیلد `app-debug.apk`.
2. **`Package and Deploy Subdomain Web Files`:** اجرای `sync_tvdatafeed.py` برای `SPOTBRENT` و `XAUUSD`، تولید `config/env.local.php` از Secrets روی سرور، آپلود بسته `host_subdomain/` به cPanel و اجرای غیرمخرب `migrations/001_phase1_init.sql` و سید اولیه کندل‌ها در MariaDB.
