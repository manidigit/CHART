/**
 * Classical Technical Signal Generators (`signal-gen/1.0`)
 *
 * Five independent, pure, UI-free, strictly causal strategy modules consuming ONLY `ta-core/1.1`
 * normalized closed candles, indicators, and causally confirmed swings/S/R zones:
 *  1. `trend_pullback_v1`  — Trend Pullback (High Priority)
 *  2. `rsi_reversion_v1`   — RSI(14) Mean Reversion & Connors RSI(2) Variant (High Priority)
 *  3. `breakout_v1`        — Causal Donchian N-Bar Breakout (Zero current-bar look-ahead)
 *  4. `sma_crossover_v1`   — SMA Crossover (20/50 & 50/200 + optional trend/close filters)
 *  5. `rsi_dip_v1`         — RSI Dip (Research / Comparison Benchmark Only — weaker baseline)
 *
 * Notice: Generators ONLY propose structured trade candidates (side, entry, structural stop,
 * structural rationale, optional exit rule). Every candidate MUST pass through
 * `evaluateRiskRewardTradePlan()` in `riskRewardEngine.js` (Hard Gate Net R:R >= 2.0) before
 * becoming a valid signal.
 */

export const CLASSICAL_STRATEGY_REGISTRY = Object.freeze([
  {
    id: 'trend_pullback_v1',
    priority: 'HIGH',
    isResearchBenchmarkOnly: false,
    nameEn: 'Trend Pullback (SMA 20/50/200)',
    nameFa: 'پولبک در روند (SMA 20/50/200)',
    descEn:
      'Identifies established SMA50/SMA200 trend, verifies structural pullback into the SMA20–SMA50 value zone without trend breakdown, and requires bullish/bearish confirmation close beyond SMA20 + prior bar break.',
    descFa:
      'روند پایدار SMA50/SMA200 را تشخیص می‌دهد، پولبک ساختاری به ناحیه SMA20 تا SMA50 را بدون تخریب روند بررسی می‌کند و با کندل تأیید قدرتمند و شکست کندل قبلی، نقطه ورود و حد ضرر زیر سوئینگ اصلاحی پیشنهاد می‌دهد.',
    defaultParams: {
      pullbackLookback: 6,
      atrStopBuffer: 0.5,
      requirePriorBarBreak: true,
      maxChaseAtr: 2.0,
    },
  },
  {
    id: 'rsi_reversion_v1',
    priority: 'HIGH',
    isResearchBenchmarkOnly: false,
    nameEn: 'RSI Mean Reversion (RSI 14 / Connors RSI 2)',
    nameFa: 'بازگشت به میانگین RSI (واریانت ۱۴ و Connors 2)',
    descEn:
      'Macro trend filtered by SMA(200). Supports RSI(14) oversold/overbought hook-up (30/35/40) with momentum reversal confirmation, plus Connors RSI(2) < 10 with separate Close > SMA(5) exit rule.',
    descFa:
      'با فیلتر روند کلان SMA(200)، در حالت RSI(14) ورود به اشباع (آستانه قابل تنظیم ۳۰/۳۵/۴۰) و چرخش صعودی همراه با تأیید کندل را می‌سنجد؛ همچنین واریانت Connors RSI(2) < 10 را با قاعده خروج مجزای Close > SMA(5) پشتیبانی می‌کند.',
    defaultParams: {
      variant: 'RSI14', // 'RSI14' | 'CONNORS_RSI2'
      rsiThreshold: 30, // 30 | 35 | 40
      connorsRsi2Threshold: 10,
      atrStopBuffer: 0.6,
      maxChaseAtr: 2.2,
    },
  },
  {
    id: 'breakout_v1',
    priority: 'MEDIUM',
    isResearchBenchmarkOnly: false,
    nameEn: 'Donchian Channel Breakout (Causal N-Bar)',
    nameFa: 'شکست کانال دونچیان (علّی N کندل قبلی)',
    descEn:
      'Breaks strictly prior N-bar Highest High / Lowest Low (excluding current bar), filters fakeouts via close-location strength, optional volume surge, and optional ATR/trend filter.',
    descFa:
      'شکست سقف یا کف N کندل قبلی (بدون لحاظ کندل جاری) را با فیلتر ضد شکست جعلی (بسته‌شدن قوی کندل)، فیلتر اختیاری حجم و فیلتر اختیاری نوسان/روند ارزیابی می‌کند.',
    defaultParams: {
      breakoutPeriod: 20,
      useVolumeFilter: false,
      useAtrTrendFilter: true,
      atrStopBuffer: 0.5,
      maxChaseAtr: 2.2,
    },
  },
  {
    id: 'sma_crossover_v1',
    priority: 'MEDIUM',
    isResearchBenchmarkOnly: false,
    nameEn: 'SMA Crossover (20/50 & 50/200)',
    nameFa: 'تقاطع میانگین متحرک ساده (SMA 20/50 و 50/200)',
    descEn:
      'Classical Golden/Death cross supporting 20/50 and 50/200 presets with optional Close-above-MAs, macro SMA200 trend, and slope strength filters.',
    descFa:
      'تقاطع کلاسیک میانگین‌های ساده با دو حالت پیش‌فرض 20/50 و 50/200 و فیلترهای اختیاری موقعیت کلوز نسبت به میانگین‌ها و قدرت روند.',
    defaultParams: {
      smaPair: '20_50', // '20_50' | '50_200'
      requireCloseAlignment: true,
      useTrendStrengthFilter: true,
      atrStopBuffer: 0.6,
      maxChaseAtr: 2.2,
    },
  },
  {
    id: 'rsi_dip_v1',
    priority: 'RESEARCH_BENCHMARK',
    isResearchBenchmarkOnly: true,
    nameEn: 'RSI Dip (Research Comparison Baseline)',
    nameFa: 'افت RSI (صرفاً مبنای مقایسه پژوهشی)',
    descEn:
      'Intentionally weaker baseline variant (simple RSI dip without macro/momentum confirmation) included strictly for honest side-by-side comparison — losing results are never hidden.',
    descFa:
      'نسخه پایه و ضعیف‌تر RSI Reversion بدون تأییدهای روند و مومنتوم؛ صرفاً برای مقایسه شفاف در کنار استراتژی‌های اصلی (نتایج ضعیف یا زیانده بدون پنهان‌کاری گزارش می‌شوند).',
    defaultParams: {
      rsiThreshold: 35,
      atrStopBuffer: 0.6,
      maxChaseAtr: 2.5,
    },
  },
]);

function getLatestCausalSwing(swings = [], maxBarIndex, maxAgeBars = 60) {
  let best = null;
  for (let k = swings.length - 1; k >= 0; k--) {
    const sw = swings[k];
    if (sw.confirmIndex <= maxBarIndex && maxBarIndex - sw.index <= maxAgeBars) {
      best = sw;
      break;
    }
  }
  return best;
}

function getRecentExtreme(candles, endIdx, lookback, mode = 'low') {
  const start = Math.max(0, endIdx - lookback + 1);
  let val = mode === 'low' ? Infinity : -Infinity;
  for (let j = start; j <= endIdx; j++) {
    const p = mode === 'low' ? candles[j].low : candles[j].high;
    if (mode === 'low' ? p < val : p > val) val = p;
  }
  return Number.isFinite(val) ? val : null;
}

function getIndicatorSnapshot(ctx, i) {
  const ind = ctx.indicators;
  const r2 = (v) => (v != null && Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null);
  return {
    sma5: r2(ind.sma5?.[i]),
    sma20: r2(ind.sma20?.[i]),
    sma50: r2(ind.sma50?.[i]),
    sma200: r2(ind.sma200?.[i]),
    rsi14: r2(ind.rsi14?.[i]),
    rsi2: r2(ind.rsi2?.[i]),
    atr14: r2(ind.atr14?.[i]),
  };
}

/**
 * 1. Trend Pullback Generator (`trend_pullback_v1`)
 */
export function evaluateTrendPullbackAtBar(ctx, i, params = {}, direction = 'BOTH') {
  if (i < 201) return null;
  const bar = ctx.candles[i];
  const prev = ctx.candles[i - 1];
  const { sma20, sma50, sma200, atr14, rsi14 } = ctx.indicators;
  const s20 = sma20[i];
  const s50 = sma50[i];
  const s200 = sma200[i];
  const atr = atr14[i];
  if (s20 == null || s50 == null || s200 == null || atr == null || atr <= 0) return null;

  const allowLong = direction === 'BOTH' || direction === 'LONG_ONLY';
  const allowShort = direction === 'BOTH' || direction === 'SHORT_ONLY';
  const lookback = Math.max(3, Math.min(12, Math.trunc(Number(params.pullbackLookback ?? 6))));
  const atrBuf = Math.max(0.2, Math.min(2.0, Number(params.atrStopBuffer ?? 0.5)));
  const requirePriorBreak = params.requirePriorBarBreak !== false;
  const maxChaseAtr = Number(params.maxChaseAtr ?? 2.0);
  const barRange = Math.max(1e-9, bar.high - bar.low);
  const body = Math.abs(bar.close - bar.open);
  const bodyRatio = body / barRange;

  // Bullish Trend Pullback
  if (allowLong && bar.close > s200 && s50 > s200 && s20 >= s50 * 0.995) {
    // Check recent pullback into [SMA50..SMA20] value zone without breaking SMA200
    let dippedIntoZone = false;
    let pullbackLow = bar.low;
    let brokeMacro = false;
    for (let k = Math.max(1, i - lookback); k <= i; k++) {
      const c = ctx.candles[k];
      const kS20 = sma20[k];
      const kS50 = sma50[k];
      const kS200 = sma200[k];
      if (kS20 == null || kS50 == null || kS200 == null) continue;
      if (c.low < pullbackLow) pullbackLow = c.low;
      if (c.close < kS200) brokeMacro = true;
      if (c.low <= kS20 * 1.002 && c.low >= kS50 - atr * 0.85) {
        dippedIntoZone = true;
      }
    }

    // Must not have invalidated prior causal swing low structure
    const latestSwingLow = getLatestCausalSwing(ctx.structure.swingLows, i, 45);
    const structureIntact = !latestSwingLow || pullbackLow >= latestSwingLow.price - atr * 0.35;

    // Confirmation: bullish candle body closing above SMA20 + prior high break (not mere touch!)
    const bullishBody = bar.close > bar.open && bodyRatio >= 0.35;
    const confirmedBreak = !requirePriorBreak || bar.close > prev.high || (bar.close > prev.close && bar.high > prev.high);

    if (dippedIntoZone && !brokeMacro && structureIntact && bar.close > s20 && bullishBody && confirmedBreak) {
      const stopLossPrice = pullbackLow - atr * atrBuf;
      const chaseAtrDistance = Math.max(0, (bar.close - s20) / atr);
      const strength = Math.min(0.95, 0.62 + Math.min(0.2, bodyRatio * 0.25) + (rsi14[i] != null && rsi14[i] > 48 && rsi14[i] < 68 ? 0.1 : 0));
      return {
        side: 'long',
        entryPrice: bar.close,
        stopLossPrice,
        stopSource: 'PULLBACK_SWING_LOW_ATR',
        chaseAtrDistance,
        maxChaseAtr,
        reason: 'Trend Pullback Long: SMA50>SMA200, pullback into SMA20–SMA50 with intact structure & bullish confirmation close above SMA20.',
        strength: Math.round(strength * 100) / 100,
        indicatorsSnapshot: getIndicatorSnapshot(ctx, i),
      };
    }
  }

  // Bearish Trend Pullback
  if (allowShort && bar.close < s200 && s50 < s200 && s20 <= s50 * 1.005) {
    let ralliedIntoZone = false;
    let pullbackHigh = bar.high;
    let brokeMacro = false;
    for (let k = Math.max(1, i - lookback); k <= i; k++) {
      const c = ctx.candles[k];
      const kS20 = sma20[k];
      const kS50 = sma50[k];
      const kS200 = sma200[k];
      if (kS20 == null || kS50 == null || kS200 == null) continue;
      if (c.high > pullbackHigh) pullbackHigh = c.high;
      if (c.close > kS200) brokeMacro = true;
      if (c.high >= kS20 * 0.998 && c.high <= kS50 + atr * 0.85) {
        ralliedIntoZone = true;
      }
    }

    const latestSwingHigh = getLatestCausalSwing(ctx.structure.swingHighs, i, 45);
    const structureIntact = !latestSwingHigh || pullbackHigh <= latestSwingHigh.price + atr * 0.35;

    const bearishBody = bar.close < bar.open && bodyRatio >= 0.35;
    const confirmedBreak = !requirePriorBreak || bar.close < prev.low || (bar.close < prev.close && bar.low < prev.low);

    if (ralliedIntoZone && !brokeMacro && structureIntact && bar.close < s20 && bearishBody && confirmedBreak) {
      const stopLossPrice = pullbackHigh + atr * atrBuf;
      const chaseAtrDistance = Math.max(0, (s20 - bar.close) / atr);
      const strength = Math.min(0.95, 0.62 + Math.min(0.2, bodyRatio * 0.25) + (rsi14[i] != null && rsi14[i] < 52 && rsi14[i] > 32 ? 0.1 : 0));
      return {
        side: 'short',
        entryPrice: bar.close,
        stopLossPrice,
        stopSource: 'PULLBACK_SWING_HIGH_ATR',
        chaseAtrDistance,
        maxChaseAtr,
        reason: 'Trend Pullback Short: SMA50<SMA200, rally into SMA20–SMA50 with intact structure & bearish confirmation close below SMA20.',
        strength: Math.round(strength * 100) / 100,
        indicatorsSnapshot: getIndicatorSnapshot(ctx, i),
      };
    }
  }

  return null;
}

/**
 * 2. RSI Mean Reversion Generator (`rsi_reversion_v1`, supports RSI(14) & Connors RSI(2))
 */
export function evaluateRsiReversionAtBar(ctx, i, params = {}, direction = 'BOTH') {
  if (i < 201) return null;
  const bar = ctx.candles[i];
  const prev = ctx.candles[i - 1];
  const { sma200, sma5, rsi14, rsi2, atr14 } = ctx.indicators;
  const s200 = sma200[i];
  const atr = atr14[i];
  if (s200 == null || atr == null || atr <= 0) return null;

  const allowLong = direction === 'BOTH' || direction === 'LONG_ONLY';
  const allowShort = direction === 'BOTH' || direction === 'SHORT_ONLY';
  const variant = String(params.variant || 'RSI14').toUpperCase();
  const atrBuf = Math.max(0.2, Math.min(2.0, Number(params.atrStopBuffer ?? 0.6)));
  const maxChaseAtr = Number(params.maxChaseAtr ?? 2.2);

  if (variant === 'CONNORS_RSI2') {
    const r2Now = rsi2[i];
    const r2Threshold = Math.max(2, Math.min(25, Number(params.connorsRsi2Threshold ?? 10)));
    if (r2Now == null) return null;

    if (allowLong && bar.close > s200 && r2Now < r2Threshold) {
      const localLow = getRecentExtreme(ctx.candles, i, 5, 'low');
      const stopLossPrice = (localLow != null ? localLow : bar.low) - atr * atrBuf;
      return {
        side: 'long',
        entryPrice: bar.close,
        stopLossPrice,
        stopSource: 'CONNORS_SWING_LOW_ATR',
        chaseAtrDistance: 0,
        maxChaseAtr,
        exitRule: {
          type: 'CLOSE_ABOVE_SMA',
          period: 5,
          label: 'Exit when Close > SMA(5)',
        },
        reason: `Connors RSI(2) Long: Close > SMA(200) & RSI(2)=${r2Now.toFixed(1)} < ${r2Threshold} (separate exit: Close > SMA5).`,
        strength: Math.round(Math.min(0.92, 0.65 + (r2Threshold - r2Now) / 40) * 100) / 100,
        indicatorsSnapshot: getIndicatorSnapshot(ctx, i),
      };
    }

    const r2Overbought = 100 - r2Threshold;
    if (allowShort && bar.close < s200 && r2Now > r2Overbought) {
      const localHigh = getRecentExtreme(ctx.candles, i, 5, 'high');
      const stopLossPrice = (localHigh != null ? localHigh : bar.high) + atr * atrBuf;
      return {
        side: 'short',
        entryPrice: bar.close,
        stopLossPrice,
        stopSource: 'CONNORS_SWING_HIGH_ATR',
        chaseAtrDistance: 0,
        maxChaseAtr,
        exitRule: {
          type: 'CLOSE_BELOW_SMA',
          period: 5,
          label: 'Exit when Close < SMA(5)',
        },
        reason: `Connors RSI(2) Short: Close < SMA(200) & RSI(2)=${r2Now.toFixed(1)} > ${r2Overbought} (separate exit: Close < SMA5).`,
        strength: Math.round(Math.min(0.92, 0.65 + (r2Now - r2Overbought) / 40) * 100) / 100,
        indicatorsSnapshot: getIndicatorSnapshot(ctx, i),
      };
    }
    return null;
  }

  // Standard RSI(14) Mean Reversion
  const rNow = rsi14[i];
  const rPrev = rsi14[i - 1];
  if (rNow == null || rPrev == null) return null;
  const allowedThresholds = [30, 35, 40];
  const rawTh = Number(params.rsiThreshold ?? 30);
  const oversoldTh = allowedThresholds.includes(rawTh) ? rawTh : Math.max(20, Math.min(45, rawTh));
  const overboughtTh = 100 - oversoldTh;

  // Long: Close > SMA(200), RSI(14) entered oversold & hooks upward, plus price reversal confirmation
  if (allowLong && bar.close > s200 && rPrev <= oversoldTh && rNow > rPrev) {
    const reversalConfirmed = bar.close > bar.open || bar.close > prev.close;
    if (reversalConfirmed) {
      const recentLow = getRecentExtreme(ctx.candles, i, 5, 'low');
      const stopLossPrice = (recentLow != null ? recentLow : bar.low) - atr * atrBuf;
      const chaseAtrDistance = sma5[i] != null ? Math.max(0, (bar.close - sma5[i]) / atr) : 0;
      return {
        side: 'long',
        entryPrice: bar.close,
        stopLossPrice,
        stopSource: 'REVERSAL_LOW_ATR',
        chaseAtrDistance,
        maxChaseAtr,
        reason: `RSI Reversion Long: Close > SMA(200), RSI(14) hooked up from ${rPrev.toFixed(1)} to ${rNow.toFixed(1)} (threshold ${oversoldTh}) with price confirmation.`,
        strength: Math.round(Math.min(0.92, 0.64 + Math.max(0, oversoldTh - rPrev) / 40) * 100) / 100,
        indicatorsSnapshot: getIndicatorSnapshot(ctx, i),
      };
    }
  }

  // Short: Close < SMA(200), RSI(14) entered overbought & hooks downward, plus bearish confirmation
  if (allowShort && bar.close < s200 && rPrev >= overboughtTh && rNow < rPrev) {
    const reversalConfirmed = bar.close < bar.open || bar.close < prev.close;
    if (reversalConfirmed) {
      const recentHigh = getRecentExtreme(ctx.candles, i, 5, 'high');
      const stopLossPrice = (recentHigh != null ? recentHigh : bar.high) + atr * atrBuf;
      const chaseAtrDistance = sma5[i] != null ? Math.max(0, (sma5[i] - bar.close) / atr) : 0;
      return {
        side: 'short',
        entryPrice: bar.close,
        stopLossPrice,
        stopSource: 'REVERSAL_HIGH_ATR',
        chaseAtrDistance,
        maxChaseAtr,
        reason: `RSI Reversion Short: Close < SMA(200), RSI(14) hooked down from ${rPrev.toFixed(1)} to ${rNow.toFixed(1)} (threshold ${overboughtTh}) with price confirmation.`,
        strength: Math.round(Math.min(0.92, 0.64 + Math.max(0, rPrev - overboughtTh) / 40) * 100) / 100,
        indicatorsSnapshot: getIndicatorSnapshot(ctx, i),
      };
    }
  }

  return null;
}

/**
 * 3. Donchian Breakout Generator (`breakout_v1`)
 * Strictly causal: Highest High / Lowest Low computed over [i - N .. i - 1], NEVER including bar `i`.
 */
export function evaluateBreakoutAtBar(ctx, i, params = {}, direction = 'BOTH') {
  const N = Math.max(5, Math.min(100, Math.trunc(Number(params.breakoutPeriod ?? 20))));
  if (i < N + 1) return null;

  const bar = ctx.candles[i];
  const { atr14, sma50 } = ctx.indicators;
  const atr = atr14[i];
  if (atr == null || atr <= 0) return null;

  // Compute strictly prior N-bar channel [i - N .. i - 1]
  let priorHighestHigh = -Infinity;
  let priorLowestLow = Infinity;
  let volSum = 0;
  let realVolBars = 0;
  for (let k = i - N; k < i; k++) {
    const c = ctx.candles[k];
    if (c.high > priorHighestHigh) priorHighestHigh = c.high;
    if (c.low < priorLowestLow) priorLowestLow = c.low;
    if (Number.isFinite(c.volume) && c.volume > 0) {
      volSum += c.volume;
      realVolBars++;
    }
  }

  const allowLong = direction === 'BOTH' || direction === 'LONG_ONLY';
  const allowShort = direction === 'BOTH' || direction === 'SHORT_ONLY';
  const useVolumeFilter = Boolean(params.useVolumeFilter);
  const useAtrTrendFilter = params.useAtrTrendFilter !== false;
  const atrBuf = Math.max(0.2, Math.min(2.0, Number(params.atrStopBuffer ?? 0.5)));
  const maxChaseAtr = Number(params.maxChaseAtr ?? 2.2);

  if (useVolumeFilter && realVolBars >= Math.floor(N / 2)) {
    const avgVol = volSum / realVolBars;
    if (!Number.isFinite(bar.volume) || bar.volume < avgVol * 1.15) {
      return null;
    }
  }

  const range = Math.max(1e-9, bar.high - bar.low);
  const closePosInRange = (bar.close - bar.low) / range; // 1 = closed at high, 0 = closed at low
  const channelWidth = priorHighestHigh - priorLowestLow;

  // Fake-breakout guard: reject ultra-narrow noise breaks or weak wick rejections
  if (useAtrTrendFilter && channelWidth < atr * 1.2) return null;

  // Bullish Breakout above prior N-bar high
  if (allowLong && bar.close > priorHighestHigh && closePosInRange >= 0.6) {
    if (useAtrTrendFilter && sma50[i] != null && bar.close < sma50[i]) return null;
    const recentLow = getRecentExtreme(ctx.candles, i, Math.min(5, N), 'low');
    const structuralStop = Math.min(bar.low, priorHighestHigh - atr * 0.5, recentLow != null ? recentLow : bar.low);
    const stopLossPrice = structuralStop - atr * atrBuf;
    const chaseAtrDistance = Math.max(0, (bar.close - priorHighestHigh) / atr);

    return {
      side: 'long',
      entryPrice: bar.close,
      stopLossPrice,
      stopSource: 'BREAKOUT_RANGE_LOW_ATR',
      chaseAtrDistance,
      maxChaseAtr,
      reason: `Donchian(${N}) Breakout Long: Closed above prior ${N}-bar high (${priorHighestHigh.toFixed(4)}) with strong close (${Math.round(closePosInRange * 100)}% of bar).`,
      strength: Math.round(Math.min(0.92, 0.62 + closePosInRange * 0.22) * 100) / 100,
      indicatorsSnapshot: {
        ...getIndicatorSnapshot(ctx, i),
        priorHighestHigh: Math.round(priorHighestHigh * 10000) / 10000,
        priorLowestLow: Math.round(priorLowestLow * 10000) / 10000,
      },
    };
  }

  // Bearish Breakout below prior N-bar low
  if (allowShort && bar.close < priorLowestLow && closePosInRange <= 0.4) {
    if (useAtrTrendFilter && sma50[i] != null && bar.close > sma50[i]) return null;
    const recentHigh = getRecentExtreme(ctx.candles, i, Math.min(5, N), 'high');
    const structuralStop = Math.max(bar.high, priorLowestLow + atr * 0.5, recentHigh != null ? recentHigh : bar.high);
    const stopLossPrice = structuralStop + atr * atrBuf;
    const chaseAtrDistance = Math.max(0, (priorLowestLow - bar.close) / atr);

    return {
      side: 'short',
      entryPrice: bar.close,
      stopLossPrice,
      stopSource: 'BREAKOUT_RANGE_HIGH_ATR',
      chaseAtrDistance,
      maxChaseAtr,
      reason: `Donchian(${N}) Breakout Short: Closed below prior ${N}-bar low (${priorLowestLow.toFixed(4)}) with strong bearish close.`,
      strength: Math.round(Math.min(0.92, 0.62 + (1 - closePosInRange) * 0.22) * 100) / 100,
      indicatorsSnapshot: {
        ...getIndicatorSnapshot(ctx, i),
        priorHighestHigh: Math.round(priorHighestHigh * 10000) / 10000,
        priorLowestLow: Math.round(priorLowestLow * 10000) / 10000,
      },
    };
  }

  return null;
}

/**
 * 4. SMA Crossover Generator (`sma_crossover_v1`)
 */
export function evaluateSmaCrossoverAtBar(ctx, i, params = {}, direction = 'BOTH') {
  const pair = String(params.smaPair || '20_50');
  const isSlowPair = pair === '50_200';
  const fastArr = isSlowPair ? ctx.indicators.sma50 : ctx.indicators.sma20;
  const slowArr = isSlowPair ? ctx.indicators.sma200 : ctx.indicators.sma50;
  const pairLabel = isSlowPair ? 'SMA(50)/SMA(200)' : 'SMA(20)/SMA(50)';

  if (i < (isSlowPair ? 201 : 51)) return null;
  const bar = ctx.candles[i];
  const fNow = fastArr[i];
  const fPrev = fastArr[i - 1];
  const sNow = slowArr[i];
  const sPrev = slowArr[i - 1];
  const atr = ctx.indicators.atr14[i];
  if (fNow == null || fPrev == null || sNow == null || sPrev == null || atr == null || atr <= 0) return null;

  const allowLong = direction === 'BOTH' || direction === 'LONG_ONLY';
  const allowShort = direction === 'BOTH' || direction === 'SHORT_ONLY';
  const requireCloseAlign = params.requireCloseAlignment !== false;
  const useStrengthFilter = params.useTrendStrengthFilter !== false;
  const atrBuf = Math.max(0.2, Math.min(2.0, Number(params.atrStopBuffer ?? 0.6)));
  const maxChaseAtr = Number(params.maxChaseAtr ?? 2.2);

  const bullCross = fPrev <= sPrev && fNow > sNow;
  const bearCross = fPrev >= sPrev && fNow < sNow;

  if (allowLong && bullCross) {
    if (requireCloseAlign && (bar.close <= fNow || bar.close <= sNow)) return null;
    if (useStrengthFilter && fastArr[i - 3] != null && fNow <= fastArr[i - 3]) return null;
    const latestSwingLow = getLatestCausalSwing(ctx.structure.swingLows, i, 30);
    const recentLow = getRecentExtreme(ctx.candles, i, 8, 'low');
    const anchorLow =
      latestSwingLow && latestSwingLow.price < bar.close
        ? Math.max(latestSwingLow.price, bar.close - atr * 3.8)
        : recentLow != null
          ? recentLow
          : bar.low;
    const stopLossPrice = Math.min(anchorLow, sNow) - atr * atrBuf;
    const chaseAtrDistance = Math.max(0, (bar.close - fNow) / atr);

    return {
      side: 'long',
      entryPrice: bar.close,
      stopLossPrice,
      stopSource: 'CROSSOVER_SWING_LOW_ATR',
      chaseAtrDistance,
      maxChaseAtr,
      reason: `${pairLabel} Bullish Crossover confirmed with Close above both MAs.`,
      strength: 0.72,
      indicatorsSnapshot: getIndicatorSnapshot(ctx, i),
    };
  }

  if (allowShort && bearCross) {
    if (requireCloseAlign && (bar.close >= fNow || bar.close >= sNow)) return null;
    if (useStrengthFilter && fastArr[i - 3] != null && fNow >= fastArr[i - 3]) return null;
    const latestSwingHigh = getLatestCausalSwing(ctx.structure.swingHighs, i, 30);
    const recentHigh = getRecentExtreme(ctx.candles, i, 8, 'high');
    const anchorHigh =
      latestSwingHigh && latestSwingHigh.price > bar.close
        ? Math.min(latestSwingHigh.price, bar.close + atr * 3.8)
        : recentHigh != null
          ? recentHigh
          : bar.high;
    const stopLossPrice = Math.max(anchorHigh, sNow) + atr * atrBuf;
    const chaseAtrDistance = Math.max(0, (fNow - bar.close) / atr);

    return {
      side: 'short',
      entryPrice: bar.close,
      stopLossPrice,
      stopSource: 'CROSSOVER_SWING_HIGH_ATR',
      chaseAtrDistance,
      maxChaseAtr,
      reason: `${pairLabel} Bearish Crossover confirmed with Close below both MAs.`,
      strength: 0.72,
      indicatorsSnapshot: getIndicatorSnapshot(ctx, i),
    };
  }

  return null;
}

/**
 * 5. RSI Dip Generator (`rsi_dip_v1` — Research / Comparison Benchmark Only)
 * Weaker baseline: triggers on simple RSI dip without macro SMA(200) or momentum-turn confirmation.
 * Still strictly gated by Risk/Reward Intelligence (Net R:R >= 2.0) and reported honestly even when unprofitable.
 */
export function evaluateRsiDipAtBar(ctx, i, params = {}, direction = 'BOTH') {
  if (i < 20) return null;
  const bar = ctx.candles[i];
  const { rsi14, atr14 } = ctx.indicators;
  const rNow = rsi14[i];
  const rPrev = rsi14[i - 1];
  const atr = atr14[i];
  if (rNow == null || rPrev == null || atr == null || atr <= 0) return null;

  const allowLong = direction === 'BOTH' || direction === 'LONG_ONLY';
  const allowShort = direction === 'BOTH' || direction === 'SHORT_ONLY';
  const oversoldTh = Math.max(20, Math.min(45, Number(params.rsiThreshold ?? 35)));
  const overboughtTh = 100 - oversoldTh;
  const atrBuf = Math.max(0.2, Math.min(2.0, Number(params.atrStopBuffer ?? 0.6)));
  const maxChaseAtr = Number(params.maxChaseAtr ?? 2.5);

  if (allowLong && rPrev > oversoldTh && rNow <= oversoldTh) {
    const recentLow = getRecentExtreme(ctx.candles, i, 4, 'low');
    return {
      side: 'long',
      entryPrice: bar.close,
      stopLossPrice: (recentLow != null ? recentLow : bar.low) - atr * atrBuf,
      stopSource: 'DIP_LOCAL_LOW_ATR',
      chaseAtrDistance: 0,
      maxChaseAtr,
      reason: `RSI Dip (Research Baseline) Long: RSI(14) crossed below ${oversoldTh} (${rNow.toFixed(1)}) without macro filter.`,
      strength: 0.45,
      indicatorsSnapshot: getIndicatorSnapshot(ctx, i),
    };
  }

  if (allowShort && rPrev < overboughtTh && rNow >= overboughtTh) {
    const recentHigh = getRecentExtreme(ctx.candles, i, 4, 'high');
    return {
      side: 'short',
      entryPrice: bar.close,
      stopLossPrice: (recentHigh != null ? recentHigh : bar.high) + atr * atrBuf,
      stopSource: 'DIP_LOCAL_HIGH_ATR',
      chaseAtrDistance: 0,
      maxChaseAtr,
      reason: `RSI Dip (Research Baseline) Short: RSI(14) crossed above ${overboughtTh} (${rNow.toFixed(1)}) without macro filter.`,
      strength: 0.45,
      indicatorsSnapshot: getIndicatorSnapshot(ctx, i),
    };
  }

  return null;
}

export const GENERATOR_EVALUATORS = Object.freeze({
  trend_pullback_v1: evaluateTrendPullbackAtBar,
  rsi_reversion_v1: evaluateRsiReversionAtBar,
  breakout_v1: evaluateBreakoutAtBar,
  sma_crossover_v1: evaluateSmaCrossoverAtBar,
  rsi_dip_v1: evaluateRsiDipAtBar,
});
