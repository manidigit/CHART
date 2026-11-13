# INFRASTRUCTURE INVENTORY

**آخرین به‌روزرسانی:** 2026-11-12  
**وضعیت کلی سند:** بازبینی‌شده و همگام با زیرساخت واقعی cPanel، پایگاه داده MariaDB و اسرار مخزن گیت‌هاب.

---

## 1. هدف این سند

این سند فهرست دقیق منابع واقعی، مشخصات سرویس‌های مشاهده‌شده در cPanel مالک پروژه، وضعیت متغیرهای محرمانه در **GitHub Repository Secrets** و مواردی را که پیش از Production باید راستی‌آزمایی شوند، نگهداری می‌کند. برای مرزهای معماری و انتخاب سرویس میزبانی به [`ARCHITECTURE.md`](./ARCHITECTURE.md) و [`CHART_INTELLIGENCE_MASTER_SPEC.md`](../01-product/CHART_INTELLIGENCE_MASTER_SPEC.md) مراجعه کنید.

---

## 2. موجودی واقعی ثبت‌شده از محیط هاست (Observed in Owner cPanel)

اطلاعات زیر از تصاویر و پنل cPanel مالک پروژه ثبت شده‌اند:

- **بستر فعلی:** Shared Hosting با **cPanel**
- **دامنه اصلی و ساب‌دامین پروژه:** `https://chart.manico.es` (ساب‌دامین اختصاصی متصل به `CPANEL_DOCROOT`)
- **Database Engine:** **MariaDB `10.6.28`** (در دسترس با نام دیتابیس `DB_NAME` و کاربر `DB_USER` روی `localhost`)
- **Web Server / PHP:** Apache `2.4.69` و سرویس `php-fpm` فعال (`up`)
- **مدیریت بک‌اند:** PHP REST API مستقر در مسیر `/api/v1/` (ارتباط استاندارد HTTPS بین اپلیکیشن اندروید، فرانت‌اند وب و پایگاه داده MariaDB)
- **ساختار جدول‌ها (`001_phase1_init.sql`):** جداول هسته فاز ۱، `candles` (با ظرفیت ۵۰۰۰+ کندل، کلید یکتای `(chart_id, provider_id, timeframe, open_time_utc)`، پشتیبانی از ۷ منبع داده و ۲۲ نماد) و `user_workspace` با اجرای غیرمخرب (`CREATE TABLE IF NOT EXISTS`)
- **پیشنهاد/برنامه‌های موجود در cPanel مالک:** Manage My Databases، phpMyAdmin، Remote Database Access، Cron Jobs، JetBackup 5، File Manager، Terminal، Track DNS، Backup Wizard، WordPress Toolkit (حساب cPanel حاوی سرویس‌های هم‌زمان دیگر نیز هست؛ هرگونه تغییر صرفاً محدود به `CPANEL_DOCROOT` و `DB_NAME` پروژه است).
- **وضعیت سرویس‌های سیستم طبق Service Status در cPanel:**
  - `apache_php_fpm`: `up`
  - `cpsrvd`: `up`
  - `crond`: `up`
  - `httpd`: `up`
  - `mariadb`: `up`
  - `sshd`: `up`
  - **`jetbackup5d`: `down` — ریسک باز P0 بکاپ تا زمان آزمون و تایید**
- **منابع نمایش‌داده‌شده در بخش Statistics cPanel:**
  - `Disk Usage`: از `5 GB` نمایش‌داده‌شده
  - `Physical Memory Usage`: از `2 GB` نمایش‌داده‌شده
  - `CPU Usage` و `IOPS` در لحظه اسکرین‌شات در بخش آمار قابل مشاهده بودند

---

## 3. مواردی که در زمان گزارش اولیه نامعلوم بودند (Initial Unknowns Kept Explicitly Separated)

موارد زیر یا نیازمند استعلام دوره‌ای در وضعیت Live هستند یا صرفاً در اسکرین‌شات اولیه مشخص نبودند:

- نسخه دقیق PHP و محدودیت‌های Runtime (به‌طور خودکار از طریق اندپوینت زنده `/api/v1/system/status.php` و `/api/v1/status.php` گزارش می‌شود؛ لازم است در cPanel نیز تایید شود)
- فعال‌بودن `cron` برای اکانت کاربری و حداقل بازه مجاز اجرای دستورات زمان‌بندی
- مجازبودن PHP CLI در Cron یا نیاز به فراخوانی URL محافظت‌شده
- فعال‌بودن SSH برای اکانت کاربری و محدودیت‌های دسترسی Remote Database
- امکان اجرای Python یا Background Worker روی همین هاست (فعلاً فرض عدم وجود Worker دائمی پایتون برقرار است؛ Python Worker در کانتینر مجزا بررسی می‌شود)
- جزئیات قوانین ModSecurity / Firewall هاست روی نرخ درخواست‌های API

---

## 4. فهرست استقرارهای واقعی و مسیرهای API

- **Deployment Automation (`workflow_dispatch` در `.github/workflows/build-apk.yml`):**
  1. تست‌های واحد کاتلین و ساخت APK اندروید (`app-debug.apk` با امضای یکپارچه `CANONICAL_B64`).
  2. فشرده‌سازی پوشه `host_subdomain/` و انتقال خودکار روی هاست cPanel عبر Fileman UAPI (`CPANEL_HOST`, `CPANEL_USERNAME`, `CPANEL_API_TOKEN`, `CPANEL_DOCROOT`).
  3. اجرای اسکریپت خوداستخراج‌گر روی سرور، تزریق متغیرهای امن دیتابیس/Twelve Data به تنظیمات محافظت‌شده خارج از دسترس عمومی وب و اجرای Migration ایمن `001_phase1_init.sql` (بدون تخریب داده‌های موجود).

- **اندپوینت‌های زنده API (`https://chart.manico.es/api/v1/`):**
  - `auth.php` (احراز هویت مالک، نشست توکن و بازیابی ایمیلی رمز عبور)
  - `candles_sync.php` (موتور `DB-First Incremental Delta Sync` با پشتیبانی از ۷ منبع داده مستقل)
  - `workspace_sync.php` (همگام‌سازی دوطرفه تب‌های باز، خطوط رسم و تنظیمات بین وب و اندروید؛ ایزوله از کلیدهای BYOK)
  - `system/status.php` و `status.php` (وضعیت MariaDB، تعداد کل کندل‌های ذخیره‌شده و زمان UTC سرور)

---

## 5. موارد نیازمند راستی‌آزمایی پیش از Production (`OPEN Verification Gates`)

| ردیف | مورد راستی‌آزمایی | اولویت | وضعیت فعلی |
|---|---|---|---|
| ۱ | تایید نسخه دقیق PHP، Extensionهای فعال (`curl`, `pdo_mysql`, `json`, `mbstring`), Memory Limit و Execution Time | `P0` | نیازمند استعلام از هاست / مشاهده زنده `status.php` |
| ۲ | بررسی وضعیت سرویس **`jetbackup5d: down`** در cPanel و تایید برنامه زمان‌بندی، Retention و تست واقعی Restore + افزودن App-level Encrypted Backup Dump در فاز ۳ | `P0` | باز (`OPEN P0 Risk`) |
| ۳ | تست کامل Cron Job یا Webhook زمان‌بندی‌شده (هر ۱۵ دقیقه برای دریافت خودکار کندل‌ها بدون هم‌پوشانی/تکرار با `cron_sync_tvdatafeed.php`) | `P1` | باز (`OPEN`) |
| ۴ | اندازه‌گیری پایداری فضای دیسک و I/O مصرفی با ذخیره تاریخچه ۵۰۰۰+ کندل روی چندین نماد و ۷ منبع مجزا | `P1` | نیازمند پایش دوره‌ای |
| ۵ | مسیر استقرار کنترل‌شده و آزمون Rollback برای کل فایل‌های وب و اسکیمای دیتابیس | `P1` | نیازمند آزمون رسمی Rollback |

---

## 6. متغیرهای محرمانه ذخیره‌شده و تأییدشده در GitHub Repository Secrets

تمام اسرار زیر در مسیر **GitHub Repository → Settings → Secrets and variables → Actions (`Repository secrets`)** ثبت شده‌اند:

| نام Secret | کاربرد | وضعیت |
|---|---|---|
| `CPANEL_API_TOKEN` | توکن احراز هویت عمیق cPanel UAPI برای استقرار | `STORED & VERIFIED` |
| `CPANEL_DOCROOT` | مسیر روت وب‌اپلیکیشن ساب‌دامین `chart.manico.es` روی هاست | `STORED & VERIFIED` |
| `CPANEL_HOST` | دامنه سرور cPanel | `STORED & VERIFIED` |
| `CPANEL_USERNAME` | نام کاربری اکانت cPanel | `STORED & VERIFIED` |
| `DB_NAME` | نام دیتابیس MariaDB (`localhost` درون هاست) | `STORED & VERIFIED` |
| `DB_PASSWORD` | رمز عبور کاربر دیتابیس | `STORED & VERIFIED` |
| `DB_USER` | نام کاربری متصل به دیتابیس | `STORED & VERIFIED` |
| `TWELVE_DATA_API_KEY` | کلید سرویس Twelve Data | `STORED & VERIFIED` |

**قاعده اکید امنیتی برای هوش مصنوعی و توسعه‌دهندگان:**
- مقادیر واقعی این ۸ کلید را هرگز در کد منبع، `.env` یا خروجی‌های گیت لاگ نکنید و **مجدداً آن‌ها را از مالک پروژه درخواست ننمایید**؛ در وورک‌فلوها مستقیماً با `${{ secrets.<NAME> }}` استفاده شوند.
- کلیدهای شخصی کاربران (BYOK) از مخزن متغیرهای سروری جدا هستند و در مرورگر (`localStorage`) / اندروید (`SharedPreferences`) نگهداری شده و فقط از طریق هدر `X-Provider-Api-Key` به آداپتور مربوطه در API ارسال می‌شوند.
