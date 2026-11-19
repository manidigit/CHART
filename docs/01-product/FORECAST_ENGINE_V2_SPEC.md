# CHART Forecast Engine V2 (Rev 2.1) — Technical Specification

> **مشخصات فنی جامع موتور پیش‌بینی نسل دوم (`forecast-contract/v2` / `2.1.0`)**  
> **وضعیت:** مشخصات قرارداد و الگوریتم‌های V2؛ وجود کد در چند پلتفرم به‌تنهایی اثبات اجرای Production یا پذیرش یکپارچه نیست. مسیر New Web در حال حاضر Native JavaScript است؛ Python Worker روی هاست اشتراکی غیرفعال است و وضعیت هر Runtime باید جداگانه ارزیابی شود.  
> **تاریخ به‌روزرسانی:** ۱۹ نوامبر ۲۰۲۶  
> **سند مرجع قبلی:** [`SMC_ANALOG_ENGINE_REFACTOR_SPEC.md`](./SMC_ANALOG_ENGINE_REFACTOR_SPEC.md) · [`CHART_FUTURE_PREDICTION_SPEC_v1.3.0.md`](./CHART_FUTURE_PREDICTION_SPEC_v1.3.0.md)

---

## ۱. خلاصه اجرایی و رفع خطاهای بحرانی P0 (Executive Summary)

در بازطراحی **CHART Forecast Engine V2 (Rev 2.1)** تمام الگوریتم‌های سنتتیک و ماشین‌های حالت انحرافی نسخه v1 حذف شدند و جای خود را به یک پایپ‌لاین کاملاً علیت‌محور (Strictly Causal)، بدون نشت آینده (Zero Leakage) و کالیبره‌شده با آزمون‌های آماری برون‌نمونه (Out-of-Sample) دادند:

| شماره ممیزی | ایراد بحرانی در نسخه v1 | راه‌حل قطعی در Rev 2.1 |
|---|---|---|
| **P0-1** | ساخت ۶ الگوی موجی مصنوعی با `sin`/`cos` هنگام کمبود داده | حذف کامل الگوهای مصنوعی؛ صدور وضعیت صریح `DATA_NOT_READY` یا `INSUFFICIENT_EVIDENCE` در کمبود داده و نمایش صادقانه `EmpiricalAnalogEngine` (حداقل ۶ آنالوگ واقعی). |
| **P0-2** | تزریق حجم جعلی `100` یا تولید `volume = 0.0` ساختگی و `rejectionWick` مصنوعی | ممنوعیت مطلق تولید حجم/فیتیله ساختگی در نقاط پیش‌بینی آینده؛ حفظ `NaN`/`null` در داده‌های فاقد حجم واقعی در ورودی و خروجی پاک (`volume = 0.0`، `rejectionWick = false` بدون فیک‌سازی). |
| **P0-3** | نشت اطلاعات آینده از طریق هم‌پوشانی پنجره‌های آنالوگ و Walk-Forward | سیاست Embargo یکپارچه $E = \max(5, \lceil 0.25 H \rceil)$ و جداسازی ۴بخشه‌ی گسسته با شکاف پاک‌سازی و امبارگو $(H + E)$ بین هر دو فاز. |
| **P0-4** | استفاده از چندک‌های تجمعی تک‌مسیره و فرمول ناقص CRPS | جایگزینی با **Weighted Interval Score 5-Quantile (WIS 5Q)** روی $\tau \in \{0.10, 0.25, 0.50, 0.75, 0.90\}$ و Conformal نرمال‌شده با نوسان EWMA. |
| **P0-5** | اندازه‌گیری حجم مؤثر نمونه به‌صورت صوری ($N_{\text{eff}} = N$) علی‌رغم هم‌بستگی بازه‌ای | محاسبه کرنل **Bartlett HAC** با برش غیرمنفی $\max(0, \rho_k)$ تا $k_{\max} = \min(H, \lfloor K/4 \rfloor)$ که تضمین می‌کند $N_{\text{eff}} \le K_{\text{outer}}$. |
| **P0-6** | احتمالات کالیبره‌نشده با کف ثابت `+1.5` برای سناریوهای صعودی/نزولی | رگرسیون لاجستیک چندجمله‌ای منظم‌شده با **L2 + Temperature Scaling** روی ۳ سناریو؛ وضعیت `NOT_ESTIMABLE` و `probability = null` برای سناریوهای با کمتر از ۳ نمونه محلی. |
| **P0-7** | اختلاف هش و گردکردن بین `Kotlin`، `JavaScript` و `Python` | هم‌ترازی با `canonicalJson` و گردکردن قطعی **۱۲ رقم بامعنای IEEE-754** (`roundToSignificant(v, 12)`) بدون `-0` و صفرهای اضافی برای `inputHash` و زنجیره SHA-256. |

---

## ۲. گیت آمادگی داده و سیاست یکپارچه Embargo (`Data Readiness & Embargo Policy`)

پیش از اجرای هر مدل، ماتریس ورودی از **گیت دو مرحله‌ای آمادگی داده (`DataReadinessGate`)** عبور می‌کند. هیچ کندلی به‌صورت مصنوعی پر یا کلَمپ (Clamp) نمی‌شود (`Zero-Clamping`).

### ۲.۱. اعتبارسنجی سلامت OHLC و منع کندل باز (`Zero-Clamping Validation`)
سری ورودی با کوچک‌ترین تخطی بلافاصله با وضعیت `DATA_NOT_READY` رد می‌شود:
1. **`OHLC_CORRUPTED`**: مقادیر `NaN`/`Infinity`، `open/high/low/close <= 0`، یا نقض `high >= max(open, close)` و `low <= min(open, close)`.
2. **`NON_MONOTONIC_OR_DUPLICATE_TIMESTAMP`**: عدم صعودی بودن اکید زمان کندل‌ها (`openTimeUtcMs[i] <= openTimeUtcMs[i-1]`).
3. **`UNCLOSED_BAR_DETECTED`**: کندل آخر زمانی می‌تواند وارد محاسبه شود که بسته شده باشد: `nowUtcMs >= lastBarOpenTimeUtcMs + barDurationMs` (یا تایم‌استمپ بسته شدن گذشته باشد).

### ۲.۲. فرمول افق پیش‌بینی و حداقل تعداد کندل (`Horizon Requirements`)
افق پیش‌بینی به بازه `[10, 60]` کندل محدود است. سیاست **Embargo** به‌صورت یکپارچه برابر است با:
$$E = \max(5, \lceil 0.25 H \rceil), \quad G_{\text{total}} = H + E$$
طول پنجره آموزش پایه $L_{\text{train}}$ و گام‌های Nested Walk-Forward بر این اساس محاسبه می‌شوند:
- برای $H \le 30$: $L_{\text{train}} = 60 + 2H$
- برای $H > 30$: $L_{\text{train}} = 120 + \text{round}\big(\frac{(H - 30)\times 40}{30}\big)$
- گام‌ها: $s_{\text{val}} = \max(1, \text{round}(H/5))$، $s_{\text{cal}} = \max(1, \text{round}(H/10))$، $s_{\text{outer}} = H$ (کاملاً بدون هم‌پوشانی).

جدول مقادیر دقیق برای ۴ افق استاندارد:

| افق ($H$) | Purge ($H$) | Embargo ($E$) | مجموع شکاف ($G_{\text{total}}$) | آموزش پایه ($L_{\text{train}}$) | کف عملیاتی (`nOpMin`) | کف کامل آماری (`nStatMin`) | وضعیت مجاز در حالت `nOpMin <= N < nStatMin` |
|---|---|---|---|---|---|---|---|
| **10** | 10 | 5 | 15 | 80 | **155** | **465** | `PROVISIONAL` / `INSUFFICIENT_EVIDENCE` |
| **20** | 20 | 5 | 25 | 100 | **232** | **852** | `PROVISIONAL` / `INSUFFICIENT_EVIDENCE` |
| **30** | 30 | 8 | 38 | 120 | **318** | **1248** | `PROVISIONAL` / `INSUFFICIENT_EVIDENCE` |
| **60** | 60 | 15 | 75 | 160 | **550** | **2410** | `PROVISIONAL` / `INSUFFICIENT_EVIDENCE` |

*اگر $N < n_{\text{opMin}}$ باشد، خروجی `ForecastStatus.DATA_NOT_READY` صادر شده و هیچ مدل آماری اجرا نمی‌شود.*

---

## ۳. معماری Nested Walk-Forward با ۷ سگمنت کاملاً مجزا

برای جلوگیری از Overfitting هنگام انتخاب مدل و تنظیم Conformal Quantiles، ارزیابی برون‌نمونه به ۴ فاز مجزا با ۳ شکاف پاک‌سازی تقسیم شده است:

```text
[ Train (L_train) ] ──( Gap: H+E )──> [ Validation (K_val) ] ──( Gap: H+E )──> [ Calibration (M_cal) ] ──( Gap: H+E )──> [ Outer OOS (K_outer, stride=H) ]
```

1. **فاز ۱ (`Train`)**: فیت کردن پارامترهای پایه مدل‌ها و برآورد انحراف معیار پایه بازده لگاریتمی `Naive` ($\sigma_{\text{rw}}$).
2. **فاز ۲ (`Validation`)**: ارزیابی کاندیداها روی $K_{\text{val}} = 10$ (حالت آماری کامل) یا $5$ (حالت عملیاتی) و محاسبه وزن‌های منجمد (`frozenWeights`) بدون دیدن داده‌های کالیبراسیون یا آزمون بیرونی.
3. **فاز ۳ (`Calibration`)**: محاسبه باقیمانده‌های عدم‌انطباق نرمال‌شده با نوسان EWMA ($\alpha = 0.20, \lambda_{\text{cal}} = 0.92$) بر روی $M_{\text{cal}} = 20$ یا $10$ پنجره برای پوشش هدف ۸۰٪:
   $$\gamma = \frac{\lceil (M_{\text{cal}} + 1)(1 - \alpha) \rceil}{M_{\text{cal}}}$$
   اگر $M_{\text{cal}} < 10$ یا $\gamma > 1.0$ باشد، وضعیت Conformal برابر `UNDER_SAMPLED` خواهد بود؛ در غیر این صورت ضریب نرمال `normalizedScaleQ80` (`CALIBRATED_NORMALIZED`) روی باندهای پیش‌بینی اعمال می‌شود.
4. **فاز ۴ (`Outer OOS`)**: ارزیابی نهایی با گام **غی هم‌پوشان $s_{\text{outer}} = H$** (حداقل $K_{\text{outer}} = 30$ پنجره برای تایید کامل آماری).

---

## ۴. معیارهای امتیازدهی و ۶ گیت قبولی آماری (`6-Gate V2.1 OOS Acceptance`)

### ۴.۱. امتیاز بازه وزنی ۵-چندکی (`WIS 5Q`)
برای چندک‌های $\tau \in \{0.10, 0.25, 0.50, 0.75, 0.90\}$ و تابع زیان پین‌بال $\rho_\tau(y, q) = (y - q)(\tau - \mathbb{1}_{y < q})$:
$$\text{WIS}_{5Q}(y, \mathbf{q}) = 0.4 \sum_{k=1}^{5} \rho_{\tau_k}(y, q_{\tau_k})$$

### ۴.۲. اندازه نمونه مؤثر بارتلت (`Bartlett Kernel Effective Sample Size`)
برای سری اختلاف/خطای برون‌نمونه با طول $K_{\text{outer}}$ و سقف هم‌بستگی $k_{\max} = \min(\max(1, H), \lfloor K_{\text{outer}} / 4 \rfloor)$:
$$N_{\text{eff}} = \text{clamp}\left(\frac{K_{\text{outer}}}{1 + 2\sum_{k=1}^{k_{\max}} \left(1 - \frac{k}{k_{\max}+1}\right)\max(0, \rho_k)}, \; 0.1, \; K_{\text{outer}}\right)$$

### ۴.۳. ۶ گیت اجباری برتری بر مبنای `Zero-Drift Log-Normal Naive`
هیچ مدلی نمی‌تواند به‌صورت خودکار به‌عنوان برنده چارت (`AUTO_OOS_BEST`) معرفی شود مگر اینکه در `Outer OOS` هم‌زمان **هر ۶ گیت** زیر را پاس کند (در غیر این صورت وضعیت به `NO_EDGE` یا `INSUFFICIENT_EVIDENCE` رفته و خط مبنای `naive_persistence` انتخاب می‌شود):
1. **حجم نمونه کافی:** $K_{\text{outer}} \ge 30$ و $N_{\text{eff}} \ge 25.0$ و Conformal در وضعیت `CALIBRATED_NORMALIZED`.
2. **دقت نقطه‌ای (`rMAE`):** $\text{rMAE} = \frac{\text{MAE}_{\text{model}}}{\text{MAE}_{\text{naive}}} < 1.0$.
3. **دقت توزیعی (`WIS 5Q`):** $\text{WIS}_{\text{model}} < \text{WIS}_{\text{naive-lognormal}}$.
4. **پوشش واقعی باند ۸۰٪:** $\text{Coverage}_{80\%} \in [72.0\%, 88.0\%]$.
5. **آزمون HLN-Modified Diebold-Mariano (یک‌طرفه با HAC Newey-West و توزیع $t_{K-1}$):** $p_{\text{DM}} \le 0.05$.
6. **آزمون بوت‌استرپ ایستا (`Centered Stationary Block Bootstrap`, $B=1000$, میانگین طول بلوک $4$, Mulberry32 seed `133742`):** $p_{\text{boot}} \le 0.10$.

---

## ۵. موتور آنالوگ تجربی علیت‌محور (`EmpiricalAnalogEngine`)

- **جستجوی بدون نشت:** برای سری به طول $T$، پنجره الگو $L$ و افق $H$، آخرین شاخص مجاز منشأ آنالوگ به‌صورت اکید محدود می‌شود به:
  $$j_{\max} = T - 2L - H - G_{\text{embargo}}$$
  بنابراین مسیر آینده هیچ آنالوگی با پنجره جاری یا شکاف امبارگو تداخل زمانی ندارد.
- **گیت حداقل شواهد:** نیاز به حداقل `6` تطبیق تاریخی دارد؛ در صورت کمتر بودن، وضعیت `INSUFFICIENT_EVIDENCE` صادر می‌شود (بدون ساخت الگوهای موجی).
- **مسیرهای نمونه نمایشی (`RepresentativePath`):** تا ۳ مدوئید تجربی (صعودی، میانه، نزولی) صرفاً با برچسب `isIllustrativeOnly = true` از روی بازده‌های تاریخی واقعی با اسکیل ATR استخراج می‌شوند.

---

## ۶. مدل‌سازی ۳ سناریوی مشروط و رگرسیون لاجستیک (`Scenario Calibration`)

سناریوهای سه‌گانه پیش‌بینی ساختار بازار عبارت‌اند از:
1. `BULLISH_EXPANSION`
2. `RANGE_CONTAINMENT`
3. `BEARISH_CONTRACTION`

- **آموزش و کالیبراسیون:** یک طبقه‌بند **L2 Multinomial Logit** (`lr = 0.12`, `l2 = 0.05`, `80 epochs`) روی نمونه‌های تاریخی `Train` آموزش داده می‌شود و دمای بهینه (`Temperature Scaling`, $T \in [0.5, 3.0]$) روی `Cal` کمینه‌کننده NLL انتخاب می‌گردد. سپس روی `Outer OOS` امتیاز **Brier Score** مدل با Climatology مقایسه می‌شود (`calibrationPassed = oosBrierModel <= oosBrierClimatology`).
- **قاعده شفافیت فقر داده (`NOT_ESTIMABLE`):** اگر تعداد نمونه‌های تاریخیِ هر کلاس در مجموعه `Train + Cal` کمتر از **۳ مورد** (`count < 3`) باشد، آن سناریو با `status = ScenarioStatus.NOT_ESTIMABLE`، `probability = null` و `lowSampleWarning = true` برگردانده می‌شود تا هرگز احتمال توهمی نمایش داده نشود.

---

## ۷. رجیستری مدل‌ها، Prefix Invariance و جداسازی شکست‌ها

تمام ۱۰ مدل بومی ثبت‌شده در `ForecastModelRegistry` باید **قانون عدم تغییر پیشوند (`Horizon Prefix Invariance`)** را رعایت کنند: اجرای یکسان روی داده یکسان برای افق‌های $H=10, 20, 60$ باید در گام‌های مشترک $1..10$ دقیقاً مقادیر `q10/q25/q50/q75/q90` یکسانی تولید کند (از جمله مدل بازگشتی با کشیدن حلقه MC به اندازه `max(horizon, 60)`).

مدل‌های پیش‌فرض رجیستری:
1. `naive_persistence` (`NaivePersistenceModel` — خط مبنای Log-Normal Zero-Drift)
2. `historical_drift` (`HistoricalDriftModel`)
3. `kalman_momentum` (`KalmanMomentumModel`)
4. `garch_volatility` (`GarchVolatilityModel`)
5. `arima_ets` (`ArimaEtsModel`)
6. `gaussian_process` (`GaussianProcessModel`)
7. `native_arima_diff` (`NativeArimaDiffModel`)
8. `native_prophet_decomp` (`NativeProphetDecompModel`)
9. `native_seq_recurrent_approx` (`NativeSequenceRecurrentModel`)
10. `native_quantile_attention_approx` (`NativeQuantileAttentionModel` — دارای گیت حداقل ۹۰ کندل `SKIPPED_LOW_DATA`)

*مدیریت شفاف خطا:* در `WalkForwardEvaluator` شکست هر پلاگین (استثنا در اجرا) به‌جای پنهان‌شدن در `SKIPPED_LOW_DATA`، صراحتاً با وضعیت `ModelExecutionStatus.FAILED` و دلیل خطا در `modelBenchmarks` ثبت می‌شود بدون آنکه اجرای سایر مدل‌ها متوقف شود.

---

## ۸. انطباق چندپلتفرمی و نقشه ماژول‌ها (`Cross-Platform Module Map`)

| لایه / وظیفه | Android (Kotlin / Compose) | Web ES6 / Host Subdomain | Python Worker (`FastAPI / ML`) | PHP API (`cPanel`) |
|---|---|---|---|---|
| **قرارداد و هش SHA-256** | `app/.../forecast/ForecastContract.kt` | `host_subdomain/assets/js/forecast/forecastContract.js` | `python_worker/app.py` | `host_subdomain/api/v1/` |
| **استخراج ویژگی علیت‌محور** | `ForecastFeatureExtractor.kt` | `featureExtractor.js` & `src/featureExtractor.js` | `models/common.py` | — |
| **تست‌های آماری، WIS، DM، Bootstrap** | `ForecastStatisticalTests.kt` | `statisticalTests.js` | `walk_forward.py` | — |
| **موتور آنالوگ تجربی** | `EmpiricalAnalogEngine.kt` | `forecastEngine.js` & `src/forecastEngine.js` | — | — |
| **ارزیاب Nested Walk-Forward** | `WalkForwardEvaluator.kt` | `walkForwardEvaluator.js` | `walk_forward.py` | — |
| **ثبت و پیاده‌سازی ۱۰ مدل** | `ForecastModelRegistry.kt`, `ForecastModelPlugin.kt`, `NativeArimaProphetModels.kt`, `NativeNeuralApproxModels.kt` | `modelRegistry.js` & `models/*.js` | `models/arima_model.py`, `prophet_model.py`, `lstm_model.py`, `tft_model.py` | — |
| **مناطق کلیدی، درخت رویداد و MTF** | `ForecastV130Analyzer.kt` | `forecastV130Analyzer.js` | — | — |
| **دفتر کل زنجیره هش و کلاینت ورکر** | `ForecastLedgerStore.kt`, `ForecastWorkerClient.kt` | `forecastLedger.js`, `forecastWorkerClient.js` | `app.py` (`/v2/forecast`) | `forecast_ledger.php` / `candles.php` |
| **تقویم معاملاتی سشن‌ها** | `ForecastCalendarRegistry.kt` | `calendarRegistry.js` | — | `MarketCalendar.php` |

---

## ۹. کارنامه تایید و تست‌های خودکار (`Automated Verification Summary`)

- **Android JVM Unit Tests (`gradle :app:testDebugUnitTest`) — ✅ ۵۲ از ۵۲ تست موفق (Zero Failures / Zero Skips):**
  - `Phase4ForecastTest` (**14/14 PASSED**): پوشش تست‌های Prefix Invariance روی مدل‌های بومی و اندیکاتورها، گیت ضد-نشت آینده، شکست صریح مدل معیوب (`FAILED`)، انتخاب صادقانه مبنا روی گشت تصادفی (`NO_CLEAR_WINNER_BASELINE`), گیت ۹۰ کندلی TFT، زنجیره هش دفتر کل، رجیستری JSON و ۴ تب Compose UI (`forecast_uncertainty_card`, `forecast_mtf_card`, `forecast_zones_card`).
  - `ForecastV2Test` (**10/10 PASSED — T01 تا T10**): تایید قوانین `nOpMin`/`nStatMin` و امبارگو، `Zero-Clamping`, `WIS 5Q`, کرنل بارتلت (`N_eff`), Conformal, HLN-DM & Bootstrap، `inputHash` 12-sig-fig، جداسازی ۳ شکسته‌بندی و عدم وجود حجم/فیتیله ساختگی.
  - `Phase1AlgorithmsTest` (**18/18 PASSED**) و `Phase2AlgorithmsTest` (**10/10 PASSED**): تایید الگوریتم‌های کشف گپ، کندل‌های پاک و پروفایل حجم.
- **Web JS Tests (`node --test tests/*.test.mjs`) — ✅ ۴۶ از ۴۶ تست موفق:**
  - تایید تطابق دقیق بردارهای طلایی (`golden_vectors_v2.json`) با `12-sig-fig canonical JSON`، آزمون‌های `T15..T22`، `PRED-01..PRED-16` و تست‌های پاریتی `Web <-> Android`.
