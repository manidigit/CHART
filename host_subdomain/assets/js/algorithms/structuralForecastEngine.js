import { PriceFormatter } from './priceFormatter.js?v=1.47.1';
import { TechnicalIndicators } from './technicalIndicators.js?v=1.47.1';
import { GapDetector } from './gapDetector.js?v=1.47.1';
import { EmpiricalAnalogEngine } from '../forecast/forecastEngine.js?v=2.0.0';

/**
 * Native Browser Structural Wave Forecast Engine (JS)
 * ====================================================
 * Pure JavaScript time-series structure analyzer & horizon projector.
 * Zero PHP exec(), zero Python/PyTorch, zero Cron, zero external ML server.
 * Strictly consumes real closed OHLC candles on explicit user request.
 *
 * Prohibited by specification:
 *  - No sine/cosine waves or decorative noise
 *  - No Math.random() / stochastic perturbations
 *  - No synthetic OHLC candles
 *  - No naive single straight-line extrapolation
 *  - Never identifies itself as Chronos-2
 */

export const STRUCTURAL_FORECAST_ENGINE_ID = 'structural_wave_js';
export const STRUCTURAL_FORECAST_SCHEMA = 'chart_structural_forecast_v1';
export const STRUCTURAL_FORECAST_MIN_CLOSED_BARS = 40;

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function quantile(values, q) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const pos = Math.max(0, Math.min(1, q)) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function computeClosedCandlesDigest(closedCandles = []) {
  if (!Array.isArray(closedCandles) || closedCandles.length === 0) return 'empty';
  const tail = closedCandles.slice(-256);
  let h1 = 2166136261 >>> 0;
  let h2 = 2166136261 >>> 0;
  for (let i = 0; i < tail.length; i++) {
    const c = tail[i];
    const token = `${Number(c.open_time_utc_ms || 0)}:${Number(c.close || 0).toFixed(8)}`;
    for (let j = 0; j < token.length; j++) {
      const ch = token.charCodeAt(j);
      h1 ^= ch;
      h1 = Math.imul(h1, 16777619) >>> 0;
      h2 ^= ch + ((i + 1) & 0xff);
      h2 = Math.imul(h2, 16777619) >>> 0;
    }
  }
  return `${tail.length}_${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function advanceForecastTimestampMs(prevOpenMs, timeframe, symbolCode = 'XAUUSD') {
  const stepMs = PriceFormatter.stepMilliseconds(timeframe || 'M15');
  const tf = String(timeframe || 'M15').toUpperCase();
  const cal = PriceFormatter.getSessionCalendar(symbolCode);
  let candidate = Number(prevOpenMs) + stepMs;

  if (cal === 'CRYPTO_24_7' || tf === 'W1') {
    return candidate;
  }

  for (let guard = 0; guard < 240; guard++) {
    const d = new Date(candidate);
    const dow = d.getUTCDay();
    if (cal === 'OTC_FX_METALS') {
      if (tf === 'D1') {
        if (dow !== 0 && dow !== 6) return candidate;
      } else {
        const parts = PriceFormatter.getDateParts(candidate, 'UTC');
        // OTC weekend market closure approx Friday 22:00 UTC to Sunday 22:00 UTC
        const minuteOfDay = parts.hr * 60 + parts.mn;
        const isClosed =
          dow === 6 ||
          (dow === 5 && minuteOfDay >= 22 * 60) ||
          (dow === 0 && minuteOfDay < 22 * 60);
        if (!isClosed) return candidate;
      }
    } else {
      // Equities / regular sessions skip Sat/Sun
      if (dow !== 0 && dow !== 6) return candidate;
    }
    candidate += stepMs;
  }
  return Number(prevOpenMs) + stepMs;
}

/**
 * Step 1: Causal pivot extraction + strict High/Low alternation + ATR noise pruning.
 */
function extractAlternatingSwings(candles, atrSeries, swingLen = 3, minProminenceAtr = 0.45) {
  const n = candles.length;
  const raw = [];
  for (let i = swingLen; i < n - swingLen; i++) {
    const hi = Number(candles[i].high);
    const lo = Number(candles[i].low);
    let isHigh = true;
    let isLow = true;
    for (let j = i - swingLen; j <= i + swingLen; j++) {
      if (j === i) continue;
      if (Number(candles[j].high) > hi) isHigh = false;
      if (Number(candles[j].low) < lo) isLow = false;
    }
    if (isHigh) {
      raw.push({
        type: 'HIGH',
        index: i,
        open_time_utc_ms: Number(candles[i].open_time_utc_ms),
        price: hi,
        atrAtSwing: Number(atrSeries[i] || atrSeries[n - 1] || 0),
      });
    }
    if (isLow) {
      raw.push({
        type: 'LOW',
        index: i,
        open_time_utc_ms: Number(candles[i].open_time_utc_ms),
        price: lo,
        atrAtSwing: Number(atrSeries[i] || atrSeries[n - 1] || 0),
      });
    }
  }

  if (raw.length === 0) return [];
  raw.sort((a, b) => a.index - b.index);

  // Enforce strict alternation: merge consecutive same-polarity swings keeping extremes
  const alternating = [];
  for (const sw of raw) {
    const prev = alternating[alternating.length - 1];
    if (!prev) {
      alternating.push({ ...sw });
      continue;
    }
    if (prev.type === sw.type) {
      if ((sw.type === 'HIGH' && sw.price >= prev.price) || (sw.type === 'LOW' && sw.price <= prev.price)) {
        alternating[alternating.length - 1] = { ...sw };
      }
    } else {
      alternating.push({ ...sw });
    }
  }

  // Prune micro-swings smaller than minProminenceAtr * localAtr, preserving strict alternation
  const pruned = [];
  for (const sw of alternating) {
    if (pruned.length === 0) {
      pruned.push(sw);
      continue;
    }
    const prev = pruned[pruned.length - 1];
    const atrRef = Math.max(1e-9, sw.atrAtSwing || prev.atrAtSwing || 1e-9);
    if (Math.abs(sw.price - prev.price) >= minProminenceAtr * atrRef) {
      pruned.push(sw);
    } else if (pruned.length >= 2) {
      const prev2 = pruned[pruned.length - 2];
      // Replace prev2 if new extreme surpasses it in same direction
      if (
        prev2.type === sw.type &&
        ((sw.type === 'HIGH' && sw.price > prev2.price) || (sw.type === 'LOW' && sw.price < prev2.price))
      ) {
        pruned.pop();
        pruned[pruned.length - 1] = sw;
      }
    }
  }

  return pruned;
}

/**
 * Step 4: Volatility & empirical horizon return dispersion (non-parametric quantile scaling).
 */
function analyzeVolatilityAndEmpiricalSpread(candles, atrSeries, horizonBars) {
  const n = candles.length;
  const logReturns = [];
  for (let i = 1; i < n; i++) {
    const p0 = Number(candles[i - 1].close);
    const p1 = Number(candles[i].close);
    if (p0 > 0 && p1 > 0) {
      logReturns.push(Math.log(p1 / p0));
    }
  }

  const calcStd = (arr) => {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    let ss = 0;
    for (const x of arr) ss += (x - mean) * (x - mean);
    return Math.sqrt(ss / (arr.length - 1));
  };

  const recentReturns = logReturns.slice(-14);
  const longReturns = logReturns.slice(-96);
  const volShort = calcStd(recentReturns);
  const volLong = Math.max(1e-7, calcStd(longReturns));

  const validAtrs = atrSeries.filter((x) => x !== null && Number.isFinite(x) && x > 0);
  const atrNow = validAtrs.length > 0 ? validAtrs[validAtrs.length - 1] : 0;
  const atrBaselineSlice = validAtrs.slice(-80);
  const atrBaseline = atrBaselineSlice.length > 0 ? median(atrBaselineSlice) : atrNow;
  const atrRatio = atrBaseline > 0 ? atrNow / atrBaseline : 1.0;
  const volRatio = 0.55 * (volShort / volLong) + 0.45 * atrRatio;

  let regime = 'NORMAL';
  if (volRatio > 1.28) regime = 'EXPANDING';
  else if (volRatio < 0.78) regime = 'COMPRESSING';

  // Empirical multi-horizon absolute price change quantiles from historical closed bars
  const probeHorizons = [1, 3, 6, 12, 20, 30, 45, 60].filter((h) => h < n - 8);
  const perSqrtStepSpread = [];
  for (const h of probeHorizons) {
    const absChanges = [];
    for (let i = 0; i < n - h; i++) {
      absChanges.push(Math.abs(Number(candles[i + h].close) - Number(candles[i].close)));
    }
    if (absChanges.length >= 12) {
      perSqrtStepSpread.push(quantile(absChanges, 0.68) / Math.sqrt(h));
    }
  }

  const lastClose = Number(candles[n - 1].close);
  const fallbackSigma = Math.max(atrNow * 0.68, lastClose * volShort);
  const baseStepSigma =
    perSqrtStepSpread.length > 0
      ? Math.max(fallbackSigma * 0.65, median(perSqrtStepSpread) * clamp(volRatio, 0.72, 1.55))
      : fallbackSigma * clamp(volRatio, 0.72, 1.55);

  return {
    atrNow,
    atrBaseline,
    volShort,
    volLong,
    volRatio: Number(volRatio.toFixed(4)),
    regime,
    baseStepSigma: Math.max(1e-8, baseStepSigma),
    horizonScaledMaxMove: Math.max(atrNow * 1.5, baseStepSigma * Math.sqrt(horizonBars) * 2.2),
  };
}

/**
 * Smooth asymmetric monotonic easing between two turning points (zero sin/cos, zero randomness).
 */
function smoothSegmentInterpolate(t, asymmetryExp = 1.0) {
  const u = clamp(t, 0, 1);
  const shaped = asymmetryExp !== 1.0 ? Math.pow(u, asymmetryExp) : u;
  return shaped * shaped * (3 - 2 * shaped);
}

/**
 * Computes a complete deterministic Native JS Structural Forecast from closed candles.
 */
export function computeStructuralForecast({
  candles = [],
  symbolCode = 'SPOTBRENT',
  provider = 'tvdatafeed',
  timeframe = 'M15',
  horizonBars = 30,
  nowMs = Date.now(),
} = {}) {
  const cleanSym = String(symbolCode || 'SPOTBRENT').trim().toUpperCase();
  const cleanProv = String(provider || 'tvdatafeed').trim().toLowerCase();
  const cleanTf = String(timeframe || 'M15').trim().toUpperCase();
  const horizon = Math.max(1, Math.min(120, Math.round(Number(horizonBars) || 30)));

  // Normalize & strictly retain closed candles only
  const closedMap = new Map();
  if (Array.isArray(candles)) {
    for (const c of candles) {
      if (!c) continue;
      const openMs = Number(c.open_time_utc_ms || (c.openTimeSec ? c.openTimeSec * 1000 : 0));
      const o = Number(c.open);
      const h = Number(c.high);
      const l = Number(c.low);
      const cl = Number(c.close);
      if (
        openMs > 0 &&
        Number.isFinite(o) &&
        Number.isFinite(h) &&
        Number.isFinite(l) &&
        Number.isFinite(cl) &&
        o > 0 &&
        h > 0 &&
        l > 0 &&
        cl > 0 &&
        c.is_closed !== false &&
        PriceFormatter.isCandleClosed(openMs, cleanTf, nowMs, cleanSym)
      ) {
        closedMap.set(openMs, {
          open_time_utc_ms: openMs,
          open_time_utc_iso: c.open_time_utc_iso || new Date(openMs).toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
          open: o,
          high: Math.max(h, o, cl),
          low: Math.min(l, o, cl),
          close: cl,
          volume: Math.max(0, Number(c.volume || 0)),
          is_closed: true,
        });
      }
    }
  }

  const closedCandles = Array.from(closedMap.values())
    .sort((a, b) => a.open_time_utc_ms - b.open_time_utc_ms)
    .slice(-360);

  const gapReport =
    closedCandles.length >= 2
      ? GapDetector.detectGaps(closedCandles.slice(-240), cleanTf, cleanSym)
      : { gaps_found: 0 };
  const gapCount = Number(gapReport?.gaps_found ?? gapReport?.gap_count ?? 0);

  const buildInsufficientResult = (limitations, extraQuality = {}) => ({
    schema: STRUCTURAL_FORECAST_SCHEMA,
    status: 'INSUFFICIENT_EVIDENCE',
    engine: {
      engine_id: STRUCTURAL_FORECAST_ENGINE_ID,
      engine_name: 'Native Structural Wave Forecast (JS)',
      is_chronos2: false,
      execution_mode: 'browser_on_demand',
      params: {
        horizon_bars: horizon,
        context_bars_used: closedCandles.length,
      },
    },
    series: {
      symbol: cleanSym,
      provider: cleanProv,
      timeframe: cleanTf,
      origin_open_time_utc_ms: closedCandles.length > 0 ? closedCandles[closedCandles.length - 1].open_time_utc_ms : 0,
      last_closed_price: closedCandles.length > 0 ? closedCandles[closedCandles.length - 1].close : 0,
      context_close_sha256: computeClosedCandlesDigest(closedCandles),
      generated_at_utc_ms: nowMs,
    },
    data_quality: {
      closed_bars_available: closedCandles.length,
      min_required_bars: STRUCTURAL_FORECAST_MIN_CLOSED_BARS,
      swings_detected: extraQuality.swings_detected || 0,
      legs_analyzed: extraQuality.legs_analyzed || 0,
      has_gaps: gapCount > 0,
      gap_count: gapCount,
      confidence_grade: 'INSUFFICIENT',
      limitations,
    },
    swings: extraQuality.swings || [],
    turning_points: [],
    forecast: [],
    model_paths: [],
    model_diagnostics: { empirical_analogs: { status: 'NOT_RUN', matched_count: 0, reason: 'Structural evidence unavailable.' } },
    served_from_cache: false,
    error: limitations[0] || 'Insufficient structural evidence for forecast.',
  });

  if (closedCandles.length < STRUCTURAL_FORECAST_MIN_CLOSED_BARS) {
    return buildInsufficientResult([
      `Insufficient closed candles (${closedCandles.length}/${STRUCTURAL_FORECAST_MIN_CLOSED_BARS} required).`,
    ]);
  }

  const atrSeries = TechnicalIndicators.computeAtr(closedCandles, 14);
  const volInfo = analyzeVolatilityAndEmpiricalSpread(closedCandles, atrSeries, horizon);
  if (volInfo.atrNow <= 0 || !Number.isFinite(volInfo.atrNow)) {
    return buildInsufficientResult(['Price series has zero measurable volatility / flat range.']);
  }

  // Step 1: Extract confirmed alternating swings (try swingLen=3, fallback to 2 only if sparse)
  let pivotLen = 3;
  let swings = extractAlternatingSwings(closedCandles, atrSeries, 3, 0.45);
  if (swings.length < 4) {
    pivotLen = 2;
    swings = extractAlternatingSwings(closedCandles, atrSeries, 2, 0.35);
  }
  if (swings.length < 4) {
    return buildInsufficientResult(
      ['Insufficient alternating swing highs/lows detected to identify impulse/corrective structure.'],
      { swings_detected: swings.length, swings }
    );
  }

  // Step 2 & 3: Build structural legs & compute impulse vs correction metrics
  const recentSwings = swings.slice(-14);
  const legs = [];
  for (let i = 1; i < recentSwings.length; i++) {
    const a = recentSwings[i - 1];
    const b = recentSwings[i];
    const delta = b.price - a.price;
    const dur = Math.max(1, b.index - a.index);
    legs.push({
      direction: delta >= 0 ? 1 : -1,
      from: a,
      to: b,
      deltaPrice: delta,
      absMove: Math.abs(delta),
      durationBars: dur,
    });
  }

  if (legs.length < 2) {
    return buildInsufficientResult(['Insufficient structural wave legs for calibration.'], {
      swings_detected: recentSwings.length,
      legs_analyzed: legs.length,
      swings: recentSwings,
    });
  }

  const lastCandle = closedCandles[closedCandles.length - 1];
  const lastClose = Number(lastCandle.close);
  const originOpenMs = Number(lastCandle.open_time_utc_ms);

  const ema20 = TechnicalIndicators.computeEma(closedCandles, 20);
  const ema50 = TechnicalIndicators.computeEma(closedCandles, 50);
  const e20 = Number(ema20[ema20.length - 1] || lastClose);
  const e50 = Number(ema50[ema50.length - 1] || lastClose);

  // Structural trend classification from HH/HL vs LH/LL + EMA alignment + leg directional efficiency
  const highs = recentSwings.filter((s) => s.type === 'HIGH');
  const lows = recentSwings.filter((s) => s.type === 'LOW');
  let hhScore = 0;
  if (highs.length >= 2) {
    hhScore += highs[highs.length - 1].price > highs[highs.length - 2].price ? 1 : -1;
  }
  if (lows.length >= 2) {
    hhScore += lows[lows.length - 1].price > lows[lows.length - 2].price ? 1 : -1;
  }

  const netSwingMove = recentSwings[recentSwings.length - 1].price - recentSwings[0].price;
  const totalLegPath = legs.reduce((acc, lg) => acc + lg.absMove, 0) || 1e-9;
  const netEfficiency = Math.abs(netSwingMove) / totalLegPath;
  const emaSpreadBias = (e20 - e50) / Math.max(1e-9, volInfo.atrNow);

  let biasDir = 0;
  let structureBias = 'ROTATIONAL_RANGE';
  if (netEfficiency >= 0.20 || Math.abs(hhScore) >= 2 || Math.abs(emaSpreadBias) >= 0.65) {
    const rawScore = hhScore * 0.45 + Math.sign(netSwingMove) * 0.30 + clamp(emaSpreadBias, -1, 1) * 0.25;
    if (rawScore >= 0.22) {
      biasDir = 1;
      structureBias = 'BULLISH_STRUCTURE';
    } else if (rawScore <= -0.22) {
      biasDir = -1;
      structureBias = 'BEARISH_STRUCTURE';
    }
  }

  const upLegs = legs.filter((l) => l.direction === 1);
  const downLegs = legs.filter((l) => l.direction === -1);
  const impulseLegs = biasDir === 1 ? upLegs : biasDir === -1 ? downLegs : legs;
  const corrLegs = biasDir === 1 ? downLegs : biasDir === -1 ? upLegs : legs;

  const rawImpAmp = impulseLegs.length > 0 ? median(impulseLegs.map((l) => l.absMove)) : median(legs.map((l) => l.absMove));
  const rawImpDur = impulseLegs.length > 0 ? median(impulseLegs.map((l) => l.durationBars)) : median(legs.map((l) => l.durationBars));
  const rawCorrDur = corrLegs.length > 0 ? median(corrLegs.map((l) => l.durationBars)) : Math.max(3, rawImpDur * 0.7);

  // Empirical retracement ratios on consecutive opposite legs
  const retraceRatios = [];
  for (let i = 1; i < legs.length; i++) {
    const prev = legs[i - 1];
    const curr = legs[i];
    if (biasDir === 0 || (prev.direction === biasDir && curr.direction !== biasDir)) {
      if (prev.absMove > 1e-9) {
        retraceRatios.push(curr.absMove / prev.absMove);
      }
    }
  }

  const impulseAmpMedian = clamp(rawImpAmp, volInfo.atrNow * 0.8, volInfo.horizonScaledMaxMove);
  const impulseDurMedian = clamp(Math.round(rawImpDur), 4, Math.max(6, Math.round(horizon * 0.75)));
  const corrRetraceMedian =
    biasDir === 0
      ? clamp(retraceRatios.length > 0 ? median(retraceRatios) : 0.85, 0.65, 1.05)
      : clamp(retraceRatios.length > 0 ? median(retraceRatios) : 0.45, 0.26, 0.78);
  const corrDurMedian = clamp(Math.round(rawCorrDur), 3, Math.max(5, Math.round(horizon * 0.6)));

  const structureClarity = clamp(
    0.45 * Math.min(1, recentSwings.length / 8) + 0.35 * Math.min(1, netEfficiency / 0.45) + 0.20 * (gapCount === 0 ? 1 : 0.65),
    0.15,
    0.92
  );

  // Recent support / resistance bounds from trailing swings
  const recentHighBound = Math.max(...recentSwings.slice(-6).map((s) => s.price));
  const recentLowBound = Math.min(...recentSwings.slice(-6).map((s) => s.price));

  // Step 5: Inspect active ongoing leg since last confirmed swing & build probable turning points
  const lastSwing = recentSwings[recentSwings.length - 1];
  const lastIndex = closedCandles.length - 1;
  const elapsedSinceSwing = Math.max(1, lastIndex - lastSwing.index);
  // Active unfinished move direction since last confirmed pivot
  const activeLegDir = lastSwing.type === 'LOW' ? 1 : -1;
  const currentLegProgressAmt = Math.abs(lastClose - lastSwing.price);
  const expectedActiveTargetAmp =
    biasDir === 0
      ? impulseAmpMedian
      : activeLegDir === biasDir
        ? impulseAmpMedian
        : impulseAmpMedian * corrRetraceMedian;
  const expectedActiveDur =
    biasDir === 0 || activeLegDir === biasDir ? impulseDurMedian : corrDurMedian;
  const activeProgressRatio = expectedActiveTargetAmp > 0 ? currentLegProgressAmt / expectedActiveTargetAmp : 0.5;

  const turningPoints = [];
  let cursorStep = 0;
  let cursorPrice = lastClose;
  let nextDir = activeLegDir;

  // If the current leg from lastSwing is already >= 82% complete or has lasted longer than typical duration,
  // allow brief residual overshoot only if aligned cleanly, otherwise pivot into the counter-leg (reversal zone)
  if (activeProgressRatio >= 0.82 || elapsedSinceSwing >= Math.round(expectedActiveDur * 1.1)) {
    nextDir = -activeLegDir;
  }

  let waveCycle = 0;
  while (cursorStep < horizon && waveCycle < 10) {
    const isImpulse = biasDir === 0 ? true : nextDir === biasDir;
    const rawStepDur = isImpulse ? impulseDurMedian : corrDurMedian;
    let legDur = Math.max(3, Math.round(rawStepDur));

    // For first leg, adjust remaining duration if continuing current active leg
    if (waveCycle === 0 && nextDir === activeLegDir) {
      legDur = Math.max(3, Math.round(expectedActiveDur * clamp(1 - activeProgressRatio * 0.7, 0.3, 0.9)));
    }

    const damping = Math.pow(0.84, Math.floor(waveCycle / 2));
    let legAmp = isImpulse
      ? impulseAmpMedian * damping
      : impulseAmpMedian * corrRetraceMedian * damping;

    if (waveCycle === 0 && nextDir === activeLegDir) {
      legAmp = Math.max(volInfo.atrNow * 0.45, expectedActiveTargetAmp * clamp(1 - activeProgressRatio * 0.75, 0.25, 0.85));
    }

    // Clamp range-bound oscillation within widened historical support/resistance corridor when biasDir === 0
    let targetPrice = cursorPrice + nextDir * legAmp;
    if (biasDir === 0) {
      const rangeSpan = Math.max(volInfo.atrNow * 2, recentHighBound - recentLowBound);
      const midRange = (recentHighBound + recentLowBound) / 2;
      const maxDev = rangeSpan * 0.56;
      targetPrice = clamp(targetPrice, Math.max(1e-6, midRange - maxDev), midRange + maxDev);
    } else {
      targetPrice = Math.max(1e-6, targetPrice);
    }

    const nextStep = Math.min(horizon, cursorStep + legDur);
    const stepFraction = (nextStep - cursorStep) / Math.max(1, legDur);
    const actualTargetPrice = Math.max(1e-6, cursorPrice + (targetPrice - cursorPrice) * stepFraction);

    let role = 'REGIME_TARGET';
    let rationale = '';
    if (biasDir === 0) {
      role = nextDir > 0 ? 'RANGE_RESISTANCE' : 'RANGE_SUPPORT';
      rationale = nextDir > 0 ? 'Upper range rotation zone' : 'Lower range rotation zone';
    } else if (isImpulse) {
      role = nextDir > 0 ? 'CONTINUATION_PEAK' : 'CONTINUATION_TROUGH';
      rationale = nextDir > 0 ? 'Bullish impulse leg target' : 'Bearish impulse leg target';
    } else {
      role = nextDir > 0 ? 'CORRECTION_BOUNCE' : 'CORRECTION_TROUGH';
      rationale = `${Math.round(corrRetraceMedian * 100)}% structural pullback zone`;
    }

    turningPoints.push({
      step: nextStep,
      price: Number(actualTargetPrice.toFixed(6)),
      direction: nextDir,
      is_impulse: isImpulse,
      role,
      rationale,
      start_step: cursorStep,
      start_price: cursorPrice,
    });

    cursorStep = nextStep;
    cursorPrice = actualTargetPrice;
    nextDir = -nextDir;
    waveCycle++;
  }

  // Step 6 & 7: Build bar-by-bar central path & calibrated uncertainty bands + timestamps
  const forecast = [];
  let prevOpenMs = originOpenMs;
  const ambiguityPenalty = 1 + (1 - structureClarity) * 0.45 + (volInfo.regime === 'EXPANDING' ? 0.22 : 0);

  for (let step = 1; step <= horizon; step++) {
    prevOpenMs = advanceForecastTimestampMs(prevOpenMs, cleanTf, cleanSym);
    const seg = turningPoints.find((tp) => step >= tp.start_step && step <= tp.step) || turningPoints[turningPoints.length - 1];
    const spanSteps = Math.max(1, seg.step - seg.start_step);
    const localT = clamp((step - seg.start_step) / spanSteps, 0, 1);
    // Impulsive waves accelerate out cleanly (0.90), corrective legs decelerate gradually (1.12)
    const asymExp = seg.is_impulse ? 0.90 : 1.12;
    const eased = smoothSegmentInterpolate(localT, asymExp);
    const central = Math.max(1e-6, seg.start_price + (seg.price - seg.start_price) * eased);

    // Horizon uncertainty half-width calibrated from empirical residual dispersion + regime + clarity
    const innerHalf = volInfo.baseStepSigma * Math.sqrt(step) * 0.72 * ambiguityPenalty;
    const outerHalf = innerHalf * 1.82;

    const q50 = Number(central.toFixed(6));
    const q25 = Number(Math.max(1e-6, central - innerHalf).toFixed(6));
    const q75 = Number((central + innerHalf).toFixed(6));
    const q10 = Number(Math.max(1e-6, central - outerHalf).toFixed(6));
    const q90 = Number((central + outerHalf).toFixed(6));

    forecast.push({
      step,
      open_time_utc_ms: prevOpenMs,
      open_time_utc_iso: new Date(prevOpenMs).toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
      q10,
      q25,
      q50_median: q50,
      q75,
      q90,
    });
  }

  // Attach real projected timestamps onto turningPoints
  for (const tp of turningPoints) {
    const pt = forecast[tp.step - 1];
    tp.open_time_utc_ms = pt ? pt.open_time_utc_ms : originOpenMs;
    tp.open_time_utc_iso = pt ? pt.open_time_utc_iso : '';
  }

  const limitations = [];
  if (closedCandles.length < 100) {
    limitations.push(`Limited history (${closedCandles.length} closed bars); wider uncertainty bands applied.`);
  }
  if (gapCount > 0) {
    limitations.push(`${gapCount} historical bar gap(s) detected in closed feed.`);
  }
  if (structureBias === 'ROTATIONAL_RANGE') {
    limitations.push('No dominant directional trend detected; rotational range structure modeled.');
  }
  if (volInfo.regime === 'EXPANDING') {
    limitations.push('Volatility is currently expanding; reversal zones carry elevated dispersion.');
  }
  limitations.push('Structural projection reflects historical wave & volatility behavior, not certainty.');

  // First legacy-model integration: Causal Historical Analogs.
  // This produces a real historical analog close-path, rebased to the current close.
  // It is intentionally an illustrative path, not a calibrated probability or synthetic OHLC.
  let empiricalAnalogResult = {
    status: 'INSUFFICIENT_EVIDENCE',
    reason: horizon < 10 ? 'Causal Historical Analogs requires a minimum 10-bar horizon.' : 'Historical analog search was not completed.',
    matchedCount: 0,
    representativePaths: [],
  };
  if (horizon >= 10) {
    const analogEngine = new EmpiricalAnalogEngine(24, horizon, cleanTf);
    empiricalAnalogResult = analogEngine.projectEmpirical(
      closedCandles,
      { lastClose, atr14: volInfo.atrNow },
      horizon,
      forecast.map((point) => point.open_time_utc_ms)
    );
  }
  const chosenAnalogPath =
    (empiricalAnalogResult.representativePaths || []).find((path) => path.id === 'ANALOG_CENTER') ||
    (empiricalAnalogResult.representativePaths || [])[0] ||
    null;
  const empiricalModelPaths = chosenAnalogPath && Array.isArray(chosenAnalogPath.closes)
    ? [{
        model_id: 'empirical_analogs',
        path_id: chosenAnalogPath.id,
        label: chosenAnalogPath.label,
        illustrative_only: true,
        matched_count: Number(empiricalAnalogResult.matchedCount || 0),
        distance: Number(chosenAnalogPath.distance || 0),
        points: chosenAnalogPath.closes.slice(0, horizon).map((price, index) => ({
          step: index + 1,
          price: Number(price),
          open_time_utc_ms: forecast[index]?.open_time_utc_ms || 0,
        })).filter((point) => Number.isFinite(point.price) && point.price > 0),
      }]
    : [];

  const confidenceGrade = structureClarity >= 0.56 && closedCandles.length >= 90 && gapCount <= 1 ? 'MODERATE' : 'LOW';

  return {
    schema: STRUCTURAL_FORECAST_SCHEMA,
    status: 'READY',
    engine: {
      engine_id: STRUCTURAL_FORECAST_ENGINE_ID,
      engine_name: 'Native Structural Wave Forecast (JS)',
      is_chronos2: false,
      execution_mode: 'browser_on_demand',
      params: {
        horizon_bars: horizon,
        context_bars_used: closedCandles.length,
        swing_pivot_len: pivotLen,
        atr_period: 14,
        atr_current: Number(volInfo.atrNow.toFixed(6)),
        volatility_ratio: volInfo.volRatio,
        volatility_regime: volInfo.regime,
        structure_bias: structureBias,
        structure_clarity: Number(structureClarity.toFixed(3)),
        impulse_amp_median: Number(impulseAmpMedian.toFixed(6)),
        impulse_dur_median: impulseDurMedian,
        correction_retrace_median: Number(corrRetraceMedian.toFixed(3)),
        correction_dur_median: corrDurMedian,
      },
    },
    series: {
      symbol: cleanSym,
      provider: cleanProv,
      timeframe: cleanTf,
      origin_open_time_utc_ms: originOpenMs,
      last_closed_price: Number(lastClose.toFixed(6)),
      context_close_sha256: computeClosedCandlesDigest(closedCandles),
      generated_at_utc_ms: nowMs,
    },
    data_quality: {
      closed_bars_available: closedCandles.length,
      min_required_bars: STRUCTURAL_FORECAST_MIN_CLOSED_BARS,
      swings_detected: recentSwings.length,
      legs_analyzed: legs.length,
      has_gaps: gapCount > 0,
      gap_count: gapCount,
      confidence_grade: confidenceGrade,
      limitations,
    },
    swings: recentSwings.map((s) => ({
      type: s.type,
      index: s.index,
      open_time_utc_ms: s.open_time_utc_ms,
      price: Number(s.price.toFixed(6)),
    })),
    turning_points: turningPoints,
    forecast,
    model_paths: empiricalModelPaths,
    model_diagnostics: {
      empirical_analogs: {
        status: empiricalAnalogResult.status || 'INSUFFICIENT_EVIDENCE',
        matched_count: Number(empiricalAnalogResult.matchedCount || 0),
        reason: String(empiricalAnalogResult.reason || ''),
        path_id: chosenAnalogPath?.id || '',
        illustrative_only: true,
      },
    },
    served_from_cache: false,
    error: '',
  };
}
