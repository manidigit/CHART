# CHART — مشخصات فنی بازطراحی و ممیزی جامع موتور پیش‌بینی
## ممیزی ۷ آسیب‌پذیری زنجیره پیش‌بینی و نقشه راه جایگزینی ماشین حالت مصنوعی با بازطرح‌ریزی مسیرهای تاریخی واقعی (`SMC & Statistical Forecast Pipeline Audit & Refactoring Spec`)

> **نسخه سند:** `1.1.0` · **تاریخ تدوین و ممیزی کد:** ۱۵ نوامبر ۲۰۲۶  
> **مرجع اصلی:** [`CHART_FUTURE_PREDICTION_SPEC_v1.3.0.md`](./CHART_FUTURE_PREDICTION_SPEC_v1.3.0.md) و [`CHART_INTELLIGENCE_MASTER_SPEC.md`](./CHART_INTELLIGENCE_MASTER_SPEC.md) §10  
> **فایل‌های تحت ممیزی مستقیم:**  
> - کلاینت وب: `host_subdomain/assets/js/forecast/forecastEngine.js` و `featureExtractor.js` و `walkForwardEvaluator.js`  
> - اپلیکیشن اندروید: `app/src/main/java/es/manico/chartintelligence/forecast/ForecastEngine.kt`  
> - بک‌اند PHP: `host_subdomain/api/v1/forecast/ForecastEnginePhp.php` و `NativeModelsPhp.php`  

---

## ۱. خلاصه مدیریتی و صورت‌مسئله (Executive Summary)

مشکل مشاهده‌شده در پیش‌بینی‌های تایم‌فریم‌های مختلف (به‌ویژه ۱۵ دقیقه‌ای) صرفاً یک ایراد ظاهری در رسم نمودار نیست. اگر موتور پیش‌بینی با دریافت کندل‌های تمیز، مکرراً مسیرهای غیرواقعی مثل صعود یک‌طرفه، نزول یک‌طرفه، نوسان مصنوعی یا پیش‌بینی‌های متناقض تولید می‌کند، کل زنجیره تولید پیش‌بینی دچار آسیب‌پذیری‌های بنیادین است: از اعتبارسنجی داده ورودی تا استخراج ویژگی، منطق ترکیب مدل‌ها، و نحوه تبدیل خروجی آماری به کندل‌های آینده.

این سند بر مبنای **ممیزی مستقیم خط‌به‌خط کدهای اجرایی در مخزن (`v1.44.0`)** تنظیم شده و ۷ منشأ قطعی تولید خروجی‌های ساختگی را مستند و اولویت‌بندی می‌کند.

---

## ۲. هفت یافته بحرانی از ممیزی کدهای اجرایی (7 Core Code Audit Findings)

### مورد اول: جایگزینی حجم مصنوعی به جای حجم واقعی (`Synthetic Volume Substitution`)
در فایل `forecastEngine.js` و همچنین بک‌اند PHP (`ForecastEnginePhp.php`):
```javascript
Math.max(1, Number(candles[i].volume || 100))
```
- **شرح ایراد:** هر زمان که حجم واقعی در فید داده صفر یا ناموجود باشد، مقدار ساختگی ۱۰۰ به جای آن تزریق می‌شود.
- **ریسک و پیامد:** این تزریق مصنوعی برای محاسباتی که مستقیماً به **پروفایل حجم (`Volume Profile`)**، حجم نسبی ۵ به ۲۰ کندل، و رفتار نقدینگی وابسته‌اند خطرناک است و ظاهری از «تأیید ساختاری بازار» ایجاد می‌کند که در واقعیت بازار وجود ندارد.
- **الزام اصلاح:** سیستم باید به‌صورت صریح میان حجم واقعی (`Real Volume`)، حجم تیک (`Tick Volume`) و داده ناموجود تمایز قائل شود؛ در صورت نبود حجم واقعی، نباید عدد ساختگی در محاسبات توزیع نقدینگی تزریق گردد.

---

### مورد دوم: سوگیری جهت‌دار در استخراج وضعیت بازار (`Directional Trend Bias Over-Reliance`)
در موتور SMC، امتیاز روند جهت‌دار از ترکیب میانگین‌های متحرک نمایی (EMA) و آخرین شکست‌های ساختار (BOS/CHoCH) ساخته می‌شود:
- ۴۰٪ وضعیت روند پایه
- ۳۵٪ وضعیت روند میان‌مدت
- ۲۵٪ وضعیت روند کلان
- **شرح ایراد و ریسک:** این امتیاز به صورت قطعی در هدایت سناریوها مصرف می‌شود. اگر این امتیازها بیش از حد در ساخت مسیر آینده اثر بگذارند، مدل نسبت به روند گذشته اینرسی نامتعارف پیدا کرده و توانایی تشخیص به‌موقع اصلاح‌های ارگانیک بازار یا نقاط چرخش نقدینگی را از دست می‌دهد.

---

### مورد سوم: مغایرت‌های محاسباتی میان کلاینت وب و اندروید (`Web vs. Android Parity Divergences`)
در بررسی فایل‌های متناظر `forecastEngine.js` و `ForecastEngine.kt`، چند مغایرت مهم در فرمول‌ها مشاهده شد:
1. **نحوه محدودسازی POC:** قیدها و فیلترهای اعمال‌شده روی سطوح POC در نسخه وب با متناظر اندرویدی دقیقاً یکسان نبوده است.
2. **نسبت حجم پنجره‌های کوتاه به بلند:** در وب نسبت حجم ۵ کندل به ۲۰ کندل محاسبه و در ویژگی‌ها لحاظ می‌شود، در حالی که در نسخه اندروید این ویژگی به همان شکل یا با تلورانس متفاوت محاسبه می‌شد.
3. **محدودسازی ATR و کرانه‌های Volume Profile:** تلورانس‌های Clamping در دو پلتفرم یکپارچه نبوده است.
- **پیامد:** یک نماد، یک تایم‌فریم و یک مجموعه کندل یکسان ممکن است ورودی‌های متفاوتی به موتور پیش‌بینی دو پلتفرم بدهند که قابلیت بازتولید و اتکای سیستم را مخدوش می‌کند.

---

### مورد چهارم (بسیار بحرانی): ساخت موج‌های برنامه‌ریزی‌شده و ۶ الگوی ساختگی (`Synthetic Wave State Machine & Template Fallback`)
در `SMCPredictionEngine.buildRealisticCandles` و تابع `findHistoricalAnalogs`:
1. **ماشین حالت مصنوعی:** تولید کندل‌های آینده از فازهای صلب و مکانیکی `PULLBACK → IMPULSE → CORRECTION → CONSOLIDATION` پیروی می‌کند و نوسان کندل‌ها با توابع ریاضی `sin` و `cos` و ضرایب ATR ثابت ساخته می‌شود.
2. **تولید ۶ الگوی مصنوعی در کمبود نمونه:**
   - هرگاه تعداد نمونه‌های تاریخی مشابه **کمتر از ۹ عدد** باشد، سیستم به جای اعلام صادقانه کمبود داده، **شش الگوی کاملاً مصنوعی** (۲ صعودی، ۲ نزولی، ۲ خنثی) می‌سازد!
- **پیامد بحرانی:** این مهم‌ترین منشأ رفتارهای کارتونی گزارش‌شده است؛ سیستم در شرایط فقر شواهد تاریخی، به جای گزارش عدم قطعیت، یک موج از پیش برنامه‌ریزی‌شده نقاشی می‌کند.

---

### مورد پنجم: احتمالات کالیبره‌نشده با وزن‌های کف ثابت (`Uncalibrated Scenario Probabilities`)
در متد `generateScenarios`:
```javascript
Math.max(1.2, bullishGroup.length + 1.5)
```
- **شرح ایراد:** حتی اگر نمونه‌های صعودی کافی در تاریخچه پیدا نشوند، با ضریب ثابت `+1.5` برای آن حداقل وزن تضمین می‌شود (و بالعکس برای نزولی و خنثی). سپس این اعداد پس از گرد شدن، به عنوان احتمال سناریو (مثلاً ۶۰٪) به کاربر نشان داده می‌شوند.
- **پیامد:** درصد احتمال نمایش‌داده‌شده نشان‌دهنده یک احتمال کالیبره‌شده آماری (Out-of-Sample Empirical Probability) نیست و اعتبارسنجی ریاضی ندارد.

---

### مورد ششم: عدم پیش‌بینی مستقل اجزای OHLC کندل‌ها (`Synthetic OHLC Geometry`)
در پایپ‌لاین مدل‌های آماری (`buildPriceTrajectoryFromReturns`):
$$P_h = P_0 \times \exp\left(\sum_{i=1}^h r_i\right)$$
- قیمت میانه آینده فقط برای Close محاسبه می‌شود.
- سپس برای ساخت کندل، Open از Close قبلی گرفته شده و سقف و کف (High و Low) با فواصل محاسباتی هندسی از باندهای احتمالاتی مونتاژ می‌شوند.
- **پیامد:** این یک پیش‌بینی مستقل چهارگانه برای رفتار قیمت نیست، بلکه صرفاً خط رانش قیمت پایانی است که به شکل کندل شمعی درآمده است.

---

### مورد هفتم: نمونه محدود و ناکافی در اعتبارسنجی Walk-Forward (`Undersampled Validation Window`)
- در `walkForwardEvaluator.js`، حداکثر پنجره‌های پیش‌فرض برابر ۸ و افق ارزیابی ۵ کندل است.
- در تایم‌فریم ۱۵ دقیقه‌ای، ۳۶۰ کندل اخیر معادل تنها **۳٫۷۵ روز کاری** است.
- این بازه به هیچ وجه برای اثبات برتری معنادار آماری یک مدل در رژیم‌های متنوع بازار (روند صعودی، رنج فرسایشی، شوک‌های خبری و شکست‌های پرنوسان) کافی نیست.

---

## ۳. ماتریس اولویت‌بندی ریسک‌ها (Priority & Impact Matrix)

| اولویت | مسئله فنی شناسایی‌شده | موقعیت در کد | پیامد عملیاتی | اقدام الزامی |
|:---:|---|---|---|---|
| **P0** | تولید ۶ الگوی مصنوعی در صورت کمتر از ۹ آنالوگ | `findHistoricalAnalogs` | تولید امواج ساختگی در کمبود داده | حذف سنتز مصنوعی؛ صدور وضعیت صریح `INSUFFICIENT_EVIDENCE` |
| **P0** | ماشین حالت صلب با فازهای تحمیلی و sin/cos | `buildRealisticCandles` | چرخش و اصلاح‌های تکراری و کارتونی | حذف کامل State Machine؛ استفاده مستقیم از مسیر واقعی آنالوگ‌ها |
| **P0** | احتمالات کالیبره‌نشده با کف وزن ثابت | `generateScenarios` | درصد احتمال غیرقابل اتکا | کالیبراسیون تجربی با Brier Score / Out-of-Sample Frequency |
| **P0** | ساخت هندسی غیرواقعی کندل‌های OHLC | `buildPriceTrajectoryFromReturns` | تفاوت کندل واقعی با خط رانش | تفکیک شفاف پیش‌بینی بازده پایانی از مدل‌سازی دامنه نوسان High/Low |
| **P1** | جایگزینی حجم ناموجود با عدد ۱۰۰ | `forecastEngine.js` / PHP | محاسبه غلط در Volume Profile | حفظ مقدار صفر یا تفکیک فیدهای بدون حجم با برچسب شفاف |
| **P1** | اختلاف محاسباتی پلتفرم‌های وب و اندروید | `forecastEngine.js` vs `kt` | خروجی نامنطبق بین دو پلتفرم | هم‌تراز کردن ۱۰۰٪ فرمول‌های POC، محدودسازها و نسبت‌های حجم |
| **P1** | پنجره ارزیابی بسیار کوتاه Walk-Forward | `walkForwardEvaluator.js` | انتخاب مدل برنده غیرپایدار | گسترش پنجره ارزیابی به حداقل ۶۰ روز تاریخی و چند رژیم بازار |

---

## ۴. اصل حیاتی قبل از شروع اصلاحات: عدم پنهان‌سازی ضعف مدل‌ها

> **اصل جداسازی شفاف (Separation & Transparency Principle):**  
> موتور SMC و موتورهای آماری نباید به شکلی ترکیب شوند که ضعف یکی، کاستی‌های دیگری را بپوشاند.
> کاربر و سیستم ارزیابی باید بتوانند به صورت کاملاً تفکیک‌شده مشاهده کنند:
> ۱. مدل آماری خالص چه مسیری پیش‌بینی کرده است؟
> ۲. سناریوهای آنالوگ تاریخی بازار چه رفتاری را پیشنهاد می‌دهند؟
> ۳. وضعیت شواهد داده‌ای آیا برای یک پیش‌بینی معتبر کافی است یا خیر؟
> **در صورت نبود شواهد کافی، سیستم باید با شجاعت اعلام کند که پیش‌بینی قابل اتکایی ندارد، نه اینکه نقاشی بکشد.**

---

## ۵. نقشه راه ۷ مرحله‌ای اصلاح معماری (`7-Step Remediation Plan`)

### گام اول: توقف تولید آینده ساختگی و صدور `INSUFFICIENT_EVIDENCE`
اگر در پنجره تاریخی، تعداد نمونه‌های آنالوگ با ضریب همبستگی و فاصله مجاز کمتر از آستانه اطمینان باشد، سیستم باید وضعیت صریح `INSUFFICIENT_EVIDENCE` یا `NO_CLEAR_EDGE` صادر کند و از هرگونه تولید الگوی پیش‌ساخته، توابع سینوسی و قالب‌های مصنوعی خودداری نماید.

### گام دوم: بازطراحی موتور تولید مسیر با بازطرح‌ریزی مسیرهای واقعی (`projectAnalogPath`)
به جای ساخت کندل از صفر با ماشین حالت:
۱. خود مسیر آینده آنالوگ‌های برتر از تاریخچه استخراج می‌شود.
۲. با نسبت نوسان فعلی به گذشته مقیاس‌گذاری می‌شود:
   $$\text{Scale} = \frac{\text{ATR}_{\text{current}}}{\max(\text{ATR}_{\text{past}}, 10^{-8})}$$
۳. به قیمت پایانی فعلی لنگر انداخته می‌شود (`Re-Anchoring` به آخرین Close).

### گام سوم: تفکیک پیش‌بینی قیمت پایانی از هندسه کندل OHLC
قرارداد خروجی باید به وضوح مشخص کند که کدام بخش از مدل رانش بازده لگاریتمی ($\hat{r}_t$) آمده است و کدام بخش مربوط به توزیع نوسان و سایه کندل‌هاست. نباید باندهای هندسی به عنوان پیش‌بینی واقعی مستقل سقف و کف معرفی شوند.

### گام چهارم: محاسبه تجربی کوانتایل‌ها از توزیع آنالوگ‌ها
به جای انتخاب تک‌نماینده از وسط لیست (`group.size / 2`)، کوانتایل‌های پنج‌گانه (`q10`, `q25`, `q50`, `q75`, `q90`) مستقیماً از روی توزیع تجمعی ۱۲ مسیر آنالوگ برتر در هر گام افق محاسبه می‌شوند.

### گام پنجم: اصلاح و کالیبراسیون احتمالات سناریوها
حذف ضرایب کف مصنوعی (`+1.5`)؛ احتمال هر سناریو باید مستقیماً متناسب با فراوانی تجربی وقوع، معکوس فاصله اقلیدسی آنالوگ‌ها و سازگاری با رژیم نوسان بازار محاسبه و نرمال شود ($\sum P_i = 1.000$).

### گام ششم: یکپارچه‌سازی و هم‌ترازی کامل وب، اندروید و PHP
انطباق دقیق تمام تعاریف و توابع استخراج ویژگی، محاسبات Volume Profile، نحوه محدودسازی POC و پارامترهای ATR در هر سه پلتفرم تا ورودی یکسان، خروجی‌های اعشاری کاملاً یکسان تولید کند.

### گام هفتم: ارزیابی عمیق Walk-Forward و آزمون پذیرش سخت‌گیرانه
افزایش عمق ارزیابی به تاریخچه‌های بلندمدت و اعمال آزمون پذیرش (`Acceptance Gate`) به نحوی که هیچ مدلی بدون برتری آماری معنادار نسبت به خط مبنای ساده (`Naive Persistence`) به عنوان مدل فعال انتخاب نشود.

---

## ۶. اصول ۳ گانه تکمیلی برای مهار تولید کندل‌های مصنوعی (Core Stabilizing Directives)

مشکل اصلی از تولید کندل‌های مصنوعی بر اساس الگوهای تاریخی نامناسب و پارامترهای مقیاس‌بندی‌نشده ناشی می‌شود. در اجرای بازطراحی، رعایت ۳ اصل زیر الزامی است:

1. **بازنویسی `buildRealisticCandles` بر پایه مدل‌های آماری استوار:**
   - به جای تقلید کورکورانه از الگوهای تاریخی و ماشین حالت، از مدل‌های آماری ساده‌تر و شفاف استفاده شود:
     - مدل بازگشت به میانگین (`Mean Reversion` / فرآیند `Ornstein-Uhlenbeck`) پیرامون سطوح کلیدی تعادل.
     - یا حرکت براونی هندسی (`Geometric Brownian Motion - GBM`) با نوسان پویای مقید به دامنه ATR جاری:
       $$dS_t = \mu S_t dt + \sigma_{\text{ATR}} S_t dW_t$$

2. **سخت‌گیرانه‌تر کردن شرایط حداقل تاریخچه و فال‌بک به `Naive Persistence`:**
   - آستانه پذیرش آنالوگ‌های تاریخی از نظر ضریب همبستگی و عمق داده سخت‌گیرانه‌تر شود.
   - در صورت کمبود داده یا عدم احراز شرایط آنالوگ معتبر، سیستم باید به جای تولید هرگونه الگوی مصنوعی یا قالب‌های پیش‌ساخته، پیش‌بینی را بر اساس پایداری قیمت فعلی (**`Naive Persistence`**) به همراه مخروط نوسان آماری ATR انجام دهد تا صداقت پیش‌بینی حفظ شود.

3. **بازبینی مکانیزم هماهنگ‌سازی چند تایم‌فریمی (`Flexible MTF Coordination`):**
   - مکانیزم هماهنگ‌سازی چند تایم‌فریمی بازبینی شود تا از تحمیل اجباری و مکانیکی یک جهت خاص به همه تایم‌فریم‌ها جلوگیری گردد.
   - هر تایم‌فریم باید پویایی ساختاری و محلی خود را حفظ کند و هماهنگ‌سازی صرفاً به عنوان یک قید نرم ساختاری (`Soft Structural Prior`) در بازه‌های هم‌پوشان عمل کند، نه تحمیل روند تک‌بعدی.

---

## ۷. راهنمای گام‌به‌گام پیاده‌سازی و بازنویسی فایل‌به‌فایل (File-by-File Implementation Guide)

### فایل ۱: `forecastEngine.js` — بخش آنالوگ‌های تاریخی
- **مسئله:** تولید `syntheticProfiles` هنگام کمبود تاریخچه و پذیرش آنالوگ بدون هم‌ترازی نوسان.
- **اصلاح الزامی:**
```javascript
const MIN_HISTORY_FOR_ANALOGS = 120; // حداقل ۱۲۰ کندل (۸ ساعت در M15 یا ۲۰ روز در H4)

function findHistoricalAnalogs(candles, lookback = 16) {
  // ۱. اگر تاریخچه کافی نیست، به جای الگوی مصنوعی → Naive Persistence
  if (!candles || candles.length < MIN_HISTORY_FOR_ANALOGS) {
    return {
      profiles: [],
      isSynthetic: false,
      fallback: 'naive_persistence',   // ✅ پرچم صریح فال‌بک
      confidence: 0.15,
    };
  }

  // ۲. فیلتر هم‌ترازی نوسان: آنالوگ‌ها فقط از بازه‌های با نوسان مشابه انتخاب شوند
  const currentAtr = calcAtr(candles, 14) || 1.0;
  const candidates = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const window = candles.slice(i - lookback, i);
    const windowAtr = calcAtr(window, 14) || currentAtr;
    // انحراف ATR بیش از ۴۰٪ مردود است
    if (Math.abs(windowAtr - currentAtr) / currentAtr > 0.40) continue;
    candidates.push({
      windowIndex: i,
      atr: windowAtr,
      shape: extractNormalizedShape(window),
      outcome: candles[i + lookback] ? candles[i + lookback].close - candles[i].close : 0,
    });
  }

  // ۳. اگر نمونه مشابه کافی نبود، فال‌بک امن
  if (candidates.length < 5) {
    return { profiles: [], fallback: 'naive_persistence', confidence: 0.20 };
  }

  // ۴. مرتب‌سازی بر اساس شباهت شکل موج
  const currentShape = extractNormalizedShape(candles.slice(-lookback));
  candidates.sort((a, b) => shapeDistance(a.shape, currentShape) - shapeDistance(b.shape, currentShape));

  return {
    profiles: candidates.slice(0, 10),
    fallback: null,
    confidence: Math.min(0.40 + candidates.length * 0.02, 0.75),
  };
}
```

---

### فایل ۲: `forecastEngine.js` — بازنویسی `buildRealisticCandles` (مدل ۳ لایه استوار)
- **مسئله:** فازهای مکانیکی `waveMode` با `pullbackSteps`، `mirrorSign` و `sin/cos` نوسانات کارتونی تولید می‌کنند.
- **مدل ۳ لایه جایگزین:**
```javascript
/**
 * تولید کندل‌های آینده با مدل ۳ لایه آماری (رانش + نوسان براونی + بازگشت به میانگین)
 */
function buildRealisticCandles({ lastCandle, atr, htfBias, count, timeframe, seed }) {
  const rng = mulberry32(hashSeed(seed || Date.now()));
  const candles = [];
  let price = lastCandle.close;

  // لایه ۱: شیب رانش جهت‌دار ضعیف و مقید (حداکثر 0.15 × ATR در هر کندل)
  const driftPerCandle = (clamp(htfBias, -0.6, 0.6) || 0) * atr * 0.15;

  // لایه ۲: ضریب نوسان متناسب با مقیاس زمانی
  const atrMultiplier = { M15: 1.0, M30: 1.1, H1: 1.25, H4: 1.45, D1: 1.65, W1: 1.85 }[timeframe] || 1.0;

  // لایه ۳: بازگشت به میانگین ۲ درصدی به قیمت لنگر
  const anchor = lastCandle.close;
  const meanReversion = 0.02;

  const tfMs = timeframeMs(timeframe);

  for (let i = 0; i < count; i++) {
    // گام تصادفی توزیع نرمال استاندارد Box-Muller
    const gauss = boxMuller(rng);
    const noise = gauss * atr * 0.35 * atrMultiplier;

    // کشش ارگانیک به قیمت لنگر + رانش ملایم
    const pull = (anchor - price) * meanReversion;
    const step = driftPerCandle + pull + noise;

    const open = price;
    const close = price + step;

    // بدنه و سایه‌های واقعی متناسب با ATR
    const bodySize = Math.abs(close - open);
    const wick = Math.max(atr * 0.15, bodySize * (0.30 + rng() * 0.60));

    const high = Math.max(open, close) + wick * rng();
    const low  = Math.min(open, close) - wick * rng();

    candles.push({
      time: lastCandle.time + (i + 1) * tfMs,
      open, high, low, close,
      volume: Math.max(1, (lastCandle.volume || 1) * (0.80 + rng() * 0.40)),
    });

    price = close;
  }

  return candles;
}

function boxMuller(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashSeed(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = Math.imul(31, h) + String(s).charCodeAt(i) | 0;
  return h;
}

function timeframeMs(tf) {
  return { M15: 900e3, M30: 1800e3, H1: 3600e3, H4: 14400e3, D1: 86400e3, W1: 604800e3 }[tf] || 900e3;
}
```

---

### فایل ۳: `forecastV130Analyzer.js` — رفع تناقض تایم‌فریمی و تضمین تنوع سناریوها
- **مسئله:** بایاس تایم‌فریم بالا به طور صددرصد جهت را به تایم‌فریم جاری تحمیل می‌کند و سناریوها متنوع نیستند.
- **اصلاح:**
```javascript
/**
 * محاسبه بایاس نهایی با ترکیب وزنی ۶۰٪ به ۴۰٪، خنثی‌سازی تضاد و سقف اطمینان ۰.۶
 */
function computeFinalBias({ ltfTrend, htfTrend, volatilityRatio }) {
  const ltfBias = clamp(ltfTrend, -1, 1);
  const htfBias = clamp(htfTrend, -1, 1);

  // ۱. اگر تضاد شدید باشد (اختلاف > 1.0) → به حالت خنثی تغییر وضعیت بده
  if (Math.abs(ltfBias - htfBias) > 1.0) {
    return { bias: 0, reason: 'conflict_neutralized' };
  }

  // ۲. در نوسان‌های بسیار شدید، جهت‌گیری را میرایی کن
  const volDamp = volatilityRatio > 1.5 ? 0.50 : 1.0;

  // ۳. ترکیب وزنی ۶۰٪ تایم‌فریم جاری و ۴۰٪ تایم‌فریم بالا
  const bias = (ltfBias * 0.60 + htfBias * 0.40) * volDamp;

  return {
    bias: clamp(bias, -0.60, 0.60), // سقف ۰.۶ — هیچ‌گاه صددرصد جهت‌دار و صلب نباشد
    reason: 'weighted_combo',
  };
}

function generateScenarios(bias, atr, count) {
  const baseWeight = 1.0 / 3.0;
  return [
    {
      name: 'bullish',
      weight: baseWeight + bias * 0.30,
      candles: buildRealisticCandles({ htfBias:  1.0, atr, count }),
    },
    {
      name: 'bearish',
      weight: baseWeight - bias * 0.30,
      candles: buildRealisticCandles({ htfBias: -1.0, atr, count }),
    },
    {
      name: 'range',
      weight: Math.max(0.15, 1.0 - Math.abs(bias) * 0.50), // همیشه حداقل ۱۵٪ سهم تعادل
      candles: buildRealisticCandles({ htfBias:  0.0, atr, count }),
    },
  ].map(s => ({ ...s, weight: Math.max(0.05, s.weight) }))
   .map((s, _, arr) => ({ ...s, weight: s.weight / arr.reduce((a, x) => a + x.weight, 0) }));
}
```

---

### فایل ۴: `featureExtractor.js` — محافظت کامل در برابر NaN و صفر در ATR
```javascript
function calcAtr(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period) return null;

  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1], cur = candles[i];
    if (!cur || !prev) continue;
    trs.push(Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low  - prev.close)
    ));
  }
  const recent = trs.slice(-period).filter(v => Number.isFinite(v) && v > 0);
  if (recent.length < Math.floor(period / 2)) return null;

  const atr = recent.reduce((a, b) => a + b, 0) / recent.length;
  return Math.max(atr, 1e-4);
}
```

---

## ۸. چک‌لیست ترتیب اجرای اصلاحات و معیار سنجش موفقیت

| گام | فایل هدف | عملیات اصلاحی |
|:---:|---|---|
| **۱** | `forecastEngine.js` / `ForecastEngine.kt` | حذف `generateSyntheticProfiles` و جایگزینی فال‌بک امن به `naive_persistence` هنگام تاریخچه کمتر از ۱۲۰ کندل |
| **۲** | `forecastEngine.js` / `ForecastEngine.kt` | بازنویسی کامل `buildRealisticCandles` بر اساس مدل رانش + نوسان براونی + بازگشت به میانگین (حذف قطعی `waveMode` و `sin/cos`) |
| **۳** | `forecastV130Analyzer.js` / Android | اصلاح `computeFinalBias` (ترکیب وزنی ۶۰/۴۰، سقف ۰.۶) و تضمین سناریوی رنج $\ge 15\%$ |
| **۴** | `featureExtractor.js` / Android | مقاوم‌سازی `calcAtr` در برابر داده‌های ناقص، صفر و مقادیر نامعتبر |
| **۵** | تست اعتبارسنجی با تاریخچه واقعی | اجرای ارزیابی مقایسه‌ای خطای پیش‌بینی در برابر خط مبنا |

### معیار کلیدی سنجش موفقیت در Backtest:
$$\text{MAE}_{\text{Forecast}} < 0.90 \times \text{MAE}_{\text{Naive}}$$
اگر خطای مدل در آزمون تاریخی ۱۰ کندل آینده کمتر از ۹۰٪ خطای پایداری قیمت فعلی نباشد، مدل نباید خروجی مدعی قطعیت صادر کند و باید با صراحت وضعیت `NO_CLEAR_EDGE` یا `Naive Persistence` را اعلام کند.

---

## ۹. اسکریپت کامل Backtest، شبیه‌ساز داده M15 و پایپ‌لاین CI/CD

این بخش دربرگیرنده تمامی کدهای اجرایی کامل، بدون خلاصه‌سازی و ابزارهای آزمون پیش‌رونده (`Walk-Forward`) جهت اعتبارسنجی تجربی موتور پیش‌بینی قیمت در برابر خط مبنای پایداری قیمت (`Naive Persistence Baseline`) است.

### ۹.۱. اسکریپت کامل آزمون پیش‌رونده: `scripts/backtest.js`

```javascript
#!/usr/bin/env node
/**
 * Backtest walk-forward برای موتور پیش‌بینی
 * مقایسه: forecast vs Naive Persistence
 *
 * اجرا:
 *   node scripts/backtest.js --file data/sample_M15.json --tf M15 --steps 10
 *   node scripts/backtest.js --file data/sample_M15.json --tf M15 --steps 10 --stride 5 --csv out.csv
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { forecast } from '../src/forecastEngine.js';
import { calcAtr } from '../src/featureExtractor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────── CLI Arguments ───────────────
const args = parseArgs(process.argv.slice(2));
const FILE     = args.file     || path.join(__dirname, '../data/sample_M15.json');
const TF       = args.tf       || 'M15';
const STEPS    = parseInt(args.steps || '10', 10);       // افق پیش‌بینی
const MIN_HIST = parseInt(args.minHistory || '120', 10); // حداقل تاریخچه
const STRIDE   = parseInt(args.stride || '1', 10);       // هر چند کندل یک تست
const CSV_FILE = args.csv      || null;                  // خروجی اختیاری CSV

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      out[key] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
    }
  }
  return out;
}

// ─────────────── ابزار آماری ───────────────
const mean  = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const mae   = (a, b) => mean(a.map((v, i) => Math.abs(v - b[i])));
const rmse  = (a, b) => Math.sqrt(mean(a.map((v, i) => (v - b[i]) ** 2)));
const mape  = (a, b) => mean(a.map((v, i) => Math.abs((v - b[i]) / (b[i] || 1)))) * 100;

// جهت: +1 صعودی، -1 نزولی، 0 خنثی
const direction = (from, to, threshold) => {
  const d = to - from;
  if (Math.abs(d) < threshold) return 0;
  return d > 0 ? 1 : -1;
};

// ─────────────── بارگذاری داده ───────────────
function loadData(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ خطا: فایل داده یافت نشد: ${filePath}`);
    console.error(`   می‌توانید با دستور 'node scripts/makeSampleData.js' داده نمونه بسازید.`);
    process.exit(1);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ خطا در خواندن ساختار JSON از فایل ${filePath}:`, err.message);
    process.exit(1);
  }

  const rawCandles = Array.isArray(data) ? data : (data.candles || data.bars || []);
  if (!Array.isArray(rawCandles) || rawCandles.length < MIN_HIST + STEPS) {
    console.error(`❌ تعداد کندل‌ها کافی نیست: ${rawCandles.length} کندل خوانده شد. حداقل نیاز: ${MIN_HIST + STEPS}`);
    process.exit(1);
  }

  return rawCandles.map((c) => ({
    time: Number(c.time || c.open_time_utc_ms || c.t || 0),
    open_time_utc_ms: Number(c.open_time_utc_ms || c.time || c.t || 0),
    open: Number(c.open ?? c.o ?? 0),
    high: Number(c.high ?? c.h ?? 0),
    low: Number(c.low ?? c.l ?? 0),
    close: Number(c.close ?? c.c ?? 0),
    volume: Number(c.volume ?? c.v ?? 0),
  }));
}

// ─────────────── اجرای آزمون Walk-Forward ───────────────
function runBacktest() {
  const candles = loadData(FILE);
  const total = candles.length;
  console.log('═'.repeat(65));
  console.log('📊 چارچوب ارزیابی پیش‌بیننده قیمت (Walk-Forward Backtest Harness)');
  console.log('═'.repeat(65));
  console.log(`• منبع داده:           ${FILE}`);
  console.log(`• تایم‌فریم:             ${TF}`);
  console.log(`• افق پیش‌بینی (Steps):  ${STEPS} کندل`);
  console.log(`• حداقل تاریخچه پنجره: ${MIN_HIST} کندل`);
  console.log(`• گام ارزیابی (Stride): هر ${STRIDE} کندل`);
  console.log(`• کل کندل‌های موجود:   ${total}`);
  console.log('─'.repeat(65));

  const records = [];
  const startIdx = MIN_HIST;
  const endIdx = total - STEPS;
  let evaluated = 0;

  for (let i = startIdx; i <= endIdx; i += STRIDE) {
    const history = candles.slice(0, i);
    const future = candles.slice(i, i + STEPS);
    const actualCloses = future.map((c) => c.close);
    const anchor = history[history.length - 1];
    const currentClose = anchor.close;

    const currentAtr = calcAtr(history, 14) || Math.max(1e-4, currentClose * 0.002);
    const dirThreshold = currentAtr * 0.25;

    // اجرای پیش‌بینی مدل
    let predCloses = [];
    try {
      const res = forecast(history, { timeframe: TF, steps: STEPS, horizonBars: STEPS });
      if (Array.isArray(res.closes) && res.closes.length >= STEPS) {
        predCloses = res.closes.slice(0, STEPS);
      } else if (Array.isArray(res.candles) && res.candles.length >= STEPS) {
        predCloses = res.candles.slice(0, STEPS).map((c) => c.close);
      } else if (Array.isArray(res.points) && res.points.length >= STEPS) {
        predCloses = res.points.slice(0, STEPS).map((p) => (Number.isFinite(p.q50) ? p.q50 : p.close));
      }
    } catch (err) {
      // فال‌بک استوار به Naive
      predCloses = Array(STEPS).fill(currentClose);
    }

    if (!predCloses || predCloses.length < STEPS) {
      predCloses = Array(STEPS).fill(currentClose);
    }

    // مدل مبنای مقایسه: Naive Persistence (پایداری قیمت لنگر)
    const naiveCloses = Array(STEPS).fill(currentClose);

    const fMae = mae(predCloses, actualCloses);
    const nMae = mae(naiveCloses, actualCloses);
    const fRmse = rmse(predCloses, actualCloses);
    const nRmse = rmse(naiveCloses, actualCloses);
    const fMape = mape(predCloses, actualCloses);
    const nMape = mape(naiveCloses, actualCloses);

    const actualFinal = actualCloses[STEPS - 1];
    const predFinal = predCloses[STEPS - 1];
    const actualDir = direction(currentClose, actualFinal, dirThreshold);
    const predDir = direction(currentClose, predFinal, dirThreshold);

    const isDirectionCorrect = actualDir === predDir;

    records.push({
      windowIndex: evaluated,
      timestamp: anchor.time,
      currentClose,
      forecastMae: fMae,
      naiveMae: nMae,
      forecastRmse: fRmse,
      naiveRmse: nRmse,
      forecastMape: fMape,
      naiveMape: nMape,
      actualDir,
      predDir,
      isDirectionCorrect,
    });

    evaluated++;
    if (evaluated % 50 === 0 || i + STRIDE > endIdx) {
      process.stdout.write(`\r[Walk-Forward Progress] ارزیابی شد: ${evaluated} پنجره (${((i / endIdx) * 100).toFixed(0)}%)`);
    }
  }

  process.stdout.write('\n');
  console.log('─'.repeat(65));

  // ─────────────── تحلیل و محاسبه سنجه‌های نهایی ───────────────
  const avgForecastMae = mean(records.map((r) => r.forecastMae));
  const avgNaiveMae = mean(records.map((r) => r.naiveMae));
  const avgForecastRmse = mean(records.map((r) => r.forecastRmse));
  const avgNaiveRmse = mean(records.map((r) => r.naiveRmse));
  const avgForecastMape = mean(records.map((r) => r.forecastMape));
  const avgNaiveMape = mean(records.map((r) => r.naiveMape));

  const dirAccuracy = (records.filter((r) => r.isDirectionCorrect).length / Math.max(1, records.length)) * 100;
  const bullPreds = (records.filter((r) => r.predDir === 1).length / Math.max(1, records.length)) * 100;
  const bearPreds = (records.filter((r) => r.predDir === -1).length / Math.max(1, records.length)) * 100;
  const neutralPreds = (records.filter((r) => r.predDir === 0).length / Math.max(1, records.length)) * 100;

  const maeImprovement = ((avgNaiveMae - avgForecastMae) / Math.max(1e-8, avgNaiveMae)) * 100;
  const rmseImprovement = ((avgNaiveRmse - avgForecastRmse) / Math.max(1e-8, avgNaiveRmse)) * 100;

  console.log('📈 کارنامه نهایی مقایسه‌ای:');
  console.log(`• تعداد پنجره‌های آزمون (Evaluated Windows):  ${records.length}`);
  console.log(`• میانگین خطای مطلق (MAE):`);
  console.log(`  - مدل پیش‌بینی (Forecast):                  ${avgForecastMae.toFixed(4)}`);
  console.log(`  - خط مبنای پایداری (Naive Baseline):        ${avgNaiveMae.toFixed(4)}`);
  console.log(`  - درصد بهبود MAE مدل نسبت به مبنا:          ${maeImprovement >= 0 ? '+' : ''}${maeImprovement.toFixed(2)}%`);
  console.log(`• ریشه میانگین مربعات خطا (RMSE):`);
  console.log(`  - مدل پیش‌بینی:                             ${avgForecastRmse.toFixed(4)}`);
  console.log(`  - خط مبنا:                                  ${avgNaiveRmse.toFixed(4)}`);
  console.log(`  - درصد بهبود RMSE:                          ${rmseImprovement >= 0 ? '+' : ''}${rmseImprovement.toFixed(2)}%`);
  console.log(`• میانگین خطای درصدی (MAPE):`);
  console.log(`  - مدل پیش‌بینی:                             ${avgForecastMape.toFixed(3)}%`);
  console.log(`  - خط مبنا:                                  ${avgNaiveMape.toFixed(3)}%`);
  console.log(`• صحت جهت‌یابی (Directional Accuracy):         ${dirAccuracy.toFixed(2)}%`);
  console.log(`• توزیع جهت‌های پیش‌بینی‌شده:`);
  console.log(`  - صعودی (Bullish):                          ${bullPreds.toFixed(1)}%`);
  console.log(`  - نزولی (Bearish):                          ${bearPreds.toFixed(1)}%`);
  console.log(`  - خنثی / بدون جهت (Neutral):                ${neutralPreds.toFixed(1)}%`);
  console.log('═'.repeat(65));

  // ارزیابی بر اساس مشخصات مصوب §8 و §9
  const passedCriteria = avgForecastMae <= avgNaiveMae * 0.90;
  console.log('🔍 بررسی شرایط پذیرش سند مشخصات (Acceptance Criteria):');
  console.log(`  شرط ۱: MAE_Forecast < 0.90 * MAE_Naive (${(avgNaiveMae * 0.90).toFixed(4)})`);
  console.log(`  نتیجه: ${passedCriteria ? '✅ احراز شد (Passed)' : '⚠️ احراز نشد (Failed - نیازمند کالیبراسیون بیشتر)'}`);

  const passedDir = dirAccuracy >= 52.0;
  console.log(`  شرط ۲: صحت جهت‌یابی >= 52% (نتیجه: ${dirAccuracy.toFixed(1)}%) -> ${passedDir ? '✅ احراز شد' : '⚠️ زیر آستانه'}`);

  // خروجی CSV اختیاری
  if (CSV_FILE) {
    const csvHeader = 'windowIndex,timestamp,currentClose,forecastMae,naiveMae,forecastRmse,naiveRmse,forecastMape,naiveMape,actualDir,predDir,isCorrect\n';
    const csvRows = records
      .map(
        (r) =>
          `${r.windowIndex},${r.timestamp},${r.currentClose},${r.forecastMae.toFixed(4)},${r.naiveMae.toFixed(4)},${r.forecastRmse.toFixed(4)},${r.naiveRmse.toFixed(4)},${r.forecastMape.toFixed(3)},${r.naiveMape.toFixed(3)},${r.actualDir},${r.predDir},${r.isDirectionCorrect ? 1 : 0}`
      )
      .join('\n');
    fs.writeFileSync(CSV_FILE, csvHeader + csvRows, 'utf-8');
    console.log(`📁 نتایج کامل به تفکیک پنجره در فایل CSV ذخیره شد: ${CSV_FILE}`);
  }

  console.log('═'.repeat(65));
}

runBacktest();
```

---

### ۹.۲. اسکریپت شبیه‌ساز داده M15: `scripts/makeSampleData.js`

```javascript
#!/usr/bin/env node
/**
 * شبیه‌ساز داده تاریخی M15 برای ارزیابی Walk-Forward و Backtest
 * 
 * ویژگی‌ها:
 * - تولید ۶۰۰ تا ۱۲۰۰ کندل ۱۵ دقیقه‌ای واقع‌گرایانه
 * - شبیه‌سازی رژیم‌های روند (Bull/Bear)، رنج (Mean-Reverting) و شوک نوسانی
 * - حفظ ساختار زمانی UTC (گام ۹۰۰,۰۰۰ میلی‌ثانیه‌ای)
 * - رعایت هندسه OHLCV واقعی با نسبت‌های بدنه و سایه تصادفی بر پایه ATR
 * 
 * اجرا:
 *   node scripts/makeSampleData.js
 *   node scripts/makeSampleData.js --count 1000 --out data/sample_M15.json --basePrice 2450
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      out[key] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const COUNT = parseInt(args.count || '960', 10); // ۱۰ روز سشن پیوسته ۱۵ دقیقه‌ای
const OUT_FILE = args.out || path.join(__dirname, '../data/sample_M15.json');
const BASE_PRICE = parseFloat(args.basePrice || '2450.0'); // مبنای قیمت طلا (XAUUSD)
const STEP_MS = 15 * 60 * 1000; // ۱۵ دقیقه = ۹۰۰,۰۰۰ میلی‌ثانیه

// ژنراتور شبه‌تصادفی قطعی (Mulberry32)
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// توزیع نرمال استاندارد Box-Muller
function boxMuller(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function generateCandles(count = 960, basePrice = 2450.0) {
  const rng = mulberry32(42);
  const startTime = Date.parse('2026-06-01T00:00:00Z');
  const candles = [];

  let currentPrice = basePrice;
  let currentVol = 0.0018; // 0.18% نوسان پایه در هر کندل
  let regime = 'RANGING'; // RANGING, TREND_UP, TREND_DOWN, VOLATILE
  let regimeBarsLeft = 60;

  for (let i = 0; i < count; i++) {
    if (--regimeBarsLeft <= 0) {
      const pick = rng();
      if (pick < 0.40) {
        regime = 'RANGING';
        regimeBarsLeft = 40 + Math.floor(rng() * 40);
        currentVol = 0.0014 + rng() * 0.0006;
      } else if (pick < 0.70) {
        regime = 'TREND_UP';
        regimeBarsLeft = 30 + Math.floor(rng() * 30);
        currentVol = 0.0020 + rng() * 0.0008;
      } else if (pick < 0.90) {
        regime = 'TREND_DOWN';
        regimeBarsLeft = 25 + Math.floor(rng() * 25);
        currentVol = 0.0022 + rng() * 0.0010;
      } else {
        regime = 'VOLATILE';
        regimeBarsLeft = 15 + Math.floor(rng() * 15);
        currentVol = 0.0035 + rng() * 0.0015;
      }
    }

    // رانش متناسب با رژیم در فضای لگاریتمی
    let drift = 0;
    if (regime === 'TREND_UP') {
      drift = 0.00040 + rng() * 0.00030;
    } else if (regime === 'TREND_DOWN') {
      drift = -0.00045 - rng() * 0.00030;
    } else if (regime === 'RANGING') {
      // کشش بازگشت به میانگین در مقیاس درصدی
      const logDev = Math.log(basePrice / Math.max(1, currentPrice));
      drift = Math.max(-0.002, Math.min(0.002, logDev * 0.025));
    }

    const shock = boxMuller(rng) * currentVol;
    const returnStep = drift + shock;
    const open = currentPrice;
    const close = Number((open * Math.exp(returnStep)).toFixed(2));

    const atrEst = currentPrice * currentVol;
    const spread = Math.abs(close - open);
    const upperWick = Math.max(atrEst * 0.15, spread * (0.2 + rng() * 0.5) + atrEst * 0.25 * rng());
    const lowerWick = Math.max(atrEst * 0.15, spread * (0.2 + rng() * 0.5) + atrEst * 0.25 * rng());

    const high = Number((Math.max(open, close) + upperWick).toFixed(2));
    const low = Number(Math.max(1.0, Math.min(open, close) - lowerWick).toFixed(2));

    const baseVol = regime === 'VOLATILE' ? 2400 : 950;
    const volume = Math.floor(baseVol * (0.65 + rng() * 0.70) * (1 + Math.abs(returnStep) * 40));

    candles.push({
      time: startTime + i * STEP_MS,
      open_time_utc_ms: startTime + i * STEP_MS,
      open,
      high,
      low,
      close,
      volume,
    });

    currentPrice = close;
  }

  return candles;
}

console.log(`Generating ${COUNT} synthetic M15 candles...`);
const candles = generateCandles(COUNT, BASE_PRICE);

const outDir = path.dirname(OUT_FILE);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(OUT_FILE, JSON.stringify(candles, null, 2), 'utf-8');
const stats = fs.statSync(OUT_FILE);

console.log(`✅ Saved ${candles.length} candles to ${OUT_FILE} (${(stats.size / 1024).toFixed(1)} KB)`);
console.log(`   First candle: ${new Date(candles[0].time).toISOString()} @ Close ${candles[0].close}`);
console.log(`   Last candle:  ${new Date(candles[candles.length - 1].time).toISOString()} @ Close ${candles[candles.length - 1].close}`);
console.log(`   Price Range:  Min ${Math.min(...candles.map(c => c.low))} - Max ${Math.max(...candles.map(c => c.high))}`);
```

---

### ۹.۳. جدول دستورات اجرایی CLI و پارامترها

| دستور | کاربرد | زمان تقریبی اجرا |
|---|---|:---:|
| `node scripts/makeSampleData.js` | تولید فایل استاندارد ۹۶۰ کندلی `data/sample_M15.json` | $< 1$ ثانیه |
| `npm run backtest` | اجرای آزمون با تمام پنجره‌ها (`steps=10`, `stride=1`) | $\approx 25$ ثانیه |
| `npm run backtest:quick` | ارزیابی سریع و بهینه برای توسعه روزمره (`stride=5`) | $\approx 5$ ثانیه |
| `npm run backtest:long` | ارزیابی افق بلندتر ۲۰ کندلی (`steps=20`, `stride=2`) | $\approx 15$ ثانیه |
| `node scripts/backtest.js --file data/sample_M15.json --tf M15 --steps 10 --csv results.csv` | اجرای ارزیابی و استخراج کامل فایل نتایج پنجره‌ها در قالب CSV | $\approx 20$ ثانیه |

---

### ۹.۴. ماتریس کمّی معیارهای پذیرش (Quantitative Acceptance Criteria Matrix)

| سنجه آماری | آستانه حداقل برای احراز (`Threshold`) | وضعیت مطلوب (`Target`) | علت عدم پذیرش در صورت رد |
|---|:---:|:---:|---|
| **بهبود خطای MAE نسبت به Naive** | $\text{MAE}_{\text{Forecast}} < 0.90 \times \text{MAE}_{\text{Naive}}$ (حداقل ۱۰٪ بهبود) | $\ge 15\%$ بهبود | مدل عملکردی بدتر یا برابر با حدس ایستای قیمت دارد. |
| **صحت جهت‌یابی (`Directional Acc`)** | $\ge 52.0\%$ | $\ge 56.0\%$ | مدل در پیش‌بینی جهت تفاوتی با سکه تصادفی ندارد. |
| **سهم سناریوی خنثی / بدون جهت** | $\le 45\%$ | $20\% - 35\%$ | محافظه‌کاری مفرط و انفعال مدل در برابر امواج بازار. |
| **عدم تقارن صعودی/نزولی (`Bias Skew`)** | $|\% \text{Bull} - \% \text{Bear}| \le 40\%$ | $\le 20\%$ | وجود سوگیری ساختاری و توهم روند صعودی یا نزولی پیوسته. |

---

### ۹.۵. تنظیمات اسکریپت‌های `package.json`

```json
{
  "name": "chart-intelligence",
  "version": "1.44.0",
  "description": "Chart Intelligence & Financial Forecast Engine",
  "type": "module",
  "scripts": {
    "test": "node --test tests/phase4_forecast.test.mjs tests/web_parity.test.mjs",
    "backtest": "node scripts/backtest.js --file data/sample_M15.json --tf M15 --steps 10",
    "backtest:quick": "node scripts/backtest.js --file data/sample_M15.json --tf M15 --steps 10 --stride 5",
    "backtest:long": "node scripts/backtest.js --file data/sample_M15.json --tf M15 --steps 20 --stride 2",
    "make:data": "node scripts/makeSampleData.js"
  }
}
```

---

### ۹.۶. گردش کار اتوماسیون CI در گیت‌هاب: `.github/workflows/backtest.yml`

```yaml
name: Forecast Engine Backtest & Validation CI

on:
  push:
    branches: [ main ]
    paths:
      - 'host_subdomain/assets/js/forecast/**'
      - 'src/**'
      - 'scripts/**'
      - 'tests/**'
      - '.github/workflows/backtest.yml'
  pull_request:
    branches: [ main ]

jobs:
  walk-forward-backtest:
    name: Walk-Forward Backtest & Quantitative Parity
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js 20.x
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run Unit & Parity Tests
        run: |
          node --test tests/phase4_forecast.test.mjs tests/web_parity.test.mjs

      - name: Generate M15 Sample Dataset
        run: |
          node scripts/makeSampleData.js --count 960 --out data/sample_M15.json --basePrice 2450

      - name: Execute Walk-Forward Backtest Evaluation
        run: |
          node scripts/backtest.js --file data/sample_M15.json --tf M15 --steps 10 --stride 5 --csv backtest_results.csv

      - name: Upload Backtest Artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: backtest-report
          path: backtest_results.csv
```

---

### ۹.۷. پیاده‌سازی مرجع مدل آماری صادقانه (`Honest Forecast Baseline`)

در مواردی که عمق تاریخچه یا کیفیت آنالوگ‌ها کفایت نمی‌کند، موتور باید بر پایه مدل آماری صادقانه زیر اقدام به تولید کندل‌های آینده نماید:

```javascript
/**
 * مدل پیش‌بینی صادقانه (Honest Statistical Forecast)
 * عدم قطعیت را با مخروط ATR بازتاب داده و از ایجاد اطمینان کاذب پرهیز می‌کند.
 */
export function honestForecast(candles, steps = 10, tf = 'M15') {
  if (!candles || candles.length === 0) return null;
  const last = candles[candles.length - 1];
  const lastClose = Number(last.close);
  const atr = calcAtr(candles, 14) || (lastClose * 0.002);
  const tfMs = { M15: 900e3, H1: 3600e3, D1: 86400e3 }[tf] || 900e3;

  const points = [];
  for (let i = 1; i <= steps; i++) {
    // انبساط مخروط عدم‌قطعیت با جذر زمان sqrt(h)
    const coneRadius = atr * Math.sqrt(i) * 0.65;
    points.push({
      stepAhead: i,
      openTimeUtcMs: (last.open_time_utc_ms || last.time) + i * tfMs,
      open: lastClose,
      high: lastClose + coneRadius * 0.5,
      low: Math.max(1e-4, lastClose - coneRadius * 0.5),
      close: lastClose,
      q10: Math.max(1e-4, lastClose - coneRadius * 1.28),
      q25: Math.max(1e-4, lastClose - coneRadius * 0.67),
      q50: lastClose,
      q75: lastClose + coneRadius * 0.67,
      q90: lastClose + coneRadius * 1.28,
    });
  }

  return {
    status: 'HONEST_STATISTICAL_PERSISTENCE',
    anchorClose: lastClose,
    atr,
    points,
    closes: Array(steps).fill(lastClose),
  };
}
```
