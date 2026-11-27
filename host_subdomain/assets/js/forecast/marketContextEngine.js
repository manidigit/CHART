import { TechnicalIndicators } from '../algorithms/technicalIndicators.js?v=1.47.41';
import { TechnicalAnalysisCore } from '../algorithms/technicalAnalysisCore.js?v=1.47.41';

/**
 * Shared Market Context & Structure Engine (Master Plan §4) &
 * 7-Dimensional Path Quality Evaluator (Master Plan §5.2).
 *
 * Strictly causal, pure, and deterministic:
 * - Every structural observation carries explicit `occurredAt` and `confirmedAt` timestamps
 *   and indices (`confirmIndex = index + swingLen`).
 * - At any evaluation bar `asOfIndex`, observations with `confirmIndex > asOfIndex` are
 *   either omitted or tagged `status: 'UNCONFIRMED'` so future look-ahead is impossible.
 * - Provides 7 path quality & behavioral metrics for comparing a predicted trajectory
 *   against realized future closes on the exact same origin and horizon.
 */

export const MARKET_CONTEXT_ENGINE_VERSION = 'market-context/1.0.0';
export const PATH_QUALITY_SCHEMA_VERSION = 'path-quality/1.0.0';

export const OBSERVATION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  INVALIDATED: 'INVALIDATED',
  UNCONFIRMED: 'UNCONFIRMED',
  UNAVAILABLE: 'UNAVAILABLE',
});

export const MARKET_REGIME_CLASS = Object.freeze({
  TREND_UP: 'TREND_UP',
  TREND_DOWN: 'TREND_DOWN',
  RANGE: 'RANGE',
  EXPANSION: 'EXPANSION',
  COMPRESSION: 'COMPRESSION',
  UNKNOWN: 'UNKNOWN',
});

function round4(v) {
  return Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null;
}

function round6(v) {
  return Number.isFinite(v) ? Math.round(v * 1000000) / 1000000 : null;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function extractOpenTimeMs(c) {
  if (!c) return 0;
  const raw = c.open_time_utc_ms ?? c.openTimeUtcMs ?? c.time ?? 0;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? Math.trunc(num) : 0;
}

/**
 * Extracts strictly causal Market Context & Structural Observations as of `asOfIndex`.
 * Complies with Master Plan §§4.1–4.3.
 */
export function buildCausalMarketContext(rawCandles = [], options = {}) {
  const timeframe = String(options.timeframe || 'M15').toUpperCase();
  const symbolCode = String(options.symbolCode || 'SPOTBRENT').toUpperCase();
  const swingLen = Math.max(1, Math.min(10, Math.trunc(Number(options.swingLen ?? 3))));
  const includeUnconfirmed = options.includeUnconfirmed === true;

  const { candles, quality } = TechnicalAnalysisCore.normalizeCandles(rawCandles, {
    timeframe,
    symbolCode,
    excludeOpenBars: options.excludeOpenBars !== false,
  });

  const totalBars = candles.length;
  const asOfIndex =
    options.asOfIndex !== undefined && options.asOfIndex !== null
      ? clamp(Math.trunc(Number(options.asOfIndex)), 0, Math.max(0, totalBars - 1))
      : Math.max(0, totalBars - 1);

  const visibleCandles = totalBars > 0 ? candles.slice(0, asOfIndex + 1) : [];
  const n = visibleCandles.length;

  if (n < swingLen * 2 + 2) {
    return {
      schemaVersion: MARKET_CONTEXT_ENGINE_VERSION,
      symbolCode,
      timeframe,
      asOfIndex,
      asOfTimestamp: n > 0 ? extractOpenTimeMs(visibleCandles[n - 1]) : null,
      quality,
      regime: {
        state: MARKET_REGIME_CLASS.UNKNOWN,
        direction: 'NEUTRAL',
        volatilityState: 'UNKNOWN',
        atrNow: null,
        atrRatio: null,
        evidence: ['INSUFFICIENT_BARS'],
      },
      swings: [],
      unconfirmedSwings: [],
      structureEvents: [],
      srZones: [],
      liquidity: {
        status: OBSERVATION_STATUS.UNAVAILABLE,
        equalLevels: [],
        fvgs: [],
        volumeProfile: null,
      },
      observations: [],
    };
  }

  const atrSeries = TechnicalIndicators.computeAtr(visibleCandles, 14);
  const ema20Series = TechnicalIndicators.computeEma(visibleCandles, 20);
  const ema50Series = TechnicalIndicators.computeEma(visibleCandles, 50);

  let atrNow = null;
  const validAtrs = [];
  for (let i = 0; i < atrSeries.length; i++) {
    if (atrSeries[i] !== null && Number.isFinite(atrSeries[i]) && atrSeries[i] > 0) {
      validAtrs.push(atrSeries[i]);
      atrNow = atrSeries[i];
    }
  }
  if (!atrNow || atrNow <= 0) {
    const sumRange = visibleCandles.reduce((acc, c) => acc + Math.max(0, Number(c.high) - Number(c.low)), 0);
    atrNow = Math.max(sumRange / Math.max(1, n), Number(visibleCandles[n - 1].close) * 1e-4);
  }
  const meanAtr =
    validAtrs.length > 0 ? validAtrs.reduce((acc, v) => acc + v, 0) / validAtrs.length : atrNow;
  const atrRatio = meanAtr > 0 ? atrNow / meanAtr : 1.0;

  // 1. Causal Swings with separate occurredAt and confirmedAt (Master Plan §§3.1, 4.2, 4.3)
  const swingResult = TechnicalAnalysisCore.detectSwingsAndTrend(visibleCandles, swingLen);
  const confirmedSwings = swingResult.swings.map((sw) => ({
    type: sw.type,
    direction: sw.type === 'SWING_HIGH' ? 'BEARISH' : 'BULLISH',
    priceLevel: round6(sw.price),
    priceRange: [round6(sw.price), round6(sw.price)],
    index: sw.index,
    confirmIndex: sw.confirmIndex,
    occurredAt: sw.openTimeUtcMs,
    confirmedAt: sw.confirmTimeUtcMs,
    sourceTimeframe: timeframe,
    methodId: 'causal-swing-pivot',
    methodVersion: '1.0.0',
    evidence: [`leftBars=${swingLen}`, `rightConfirmBars=${swingLen}`],
    confidence: null,
    status: OBSERVATION_STATUS.ACTIVE,
  }));

  // Candidate pivots in the right-hand tail (index > n - 1 - swingLen) that are NOT yet confirmed
  const unconfirmedSwings = [];
  if (includeUnconfirmed) {
    for (let i = Math.max(swingLen, n - swingLen); i < n; i++) {
      const hi = Number(visibleCandles[i].high);
      const lo = Number(visibleCandles[i].low);
      let leftHigh = true;
      let leftLow = true;
      for (let k = 1; k <= swingLen; k++) {
        if (hi <= Number(visibleCandles[i - k].high)) leftHigh = false;
        if (lo >= Number(visibleCandles[i - k].low)) leftLow = false;
      }
      for (let r = i + 1; r < n; r++) {
        if (hi < Number(visibleCandles[r].high)) leftHigh = false;
        if (lo > Number(visibleCandles[r].low)) leftLow = false;
      }
      const occurredAt = extractOpenTimeMs(visibleCandles[i]);
      if (leftHigh) {
        unconfirmedSwings.push({
          type: 'SWING_HIGH',
          direction: 'BEARISH',
          priceLevel: round6(hi),
          priceRange: [round6(hi), round6(hi)],
          index: i,
          confirmIndex: i + swingLen,
          occurredAt,
          confirmedAt: null,
          sourceTimeframe: timeframe,
          methodId: 'causal-swing-pivot',
          methodVersion: '1.0.0',
          evidence: [`unconfirmedRightBars=${n - 1 - i}/${swingLen}`],
          confidence: null,
          status: OBSERVATION_STATUS.UNCONFIRMED,
        });
      }
      if (leftLow) {
        unconfirmedSwings.push({
          type: 'SWING_LOW',
          direction: 'BULLISH',
          priceLevel: round6(lo),
          priceRange: [round6(lo), round6(lo)],
          index: i,
          confirmIndex: i + swingLen,
          occurredAt,
          confirmedAt: null,
          sourceTimeframe: timeframe,
          methodId: 'causal-swing-pivot',
          methodVersion: '1.0.0',
          evidence: [`unconfirmedRightBars=${n - 1 - i}/${swingLen}`],
          confidence: null,
          status: OBSERVATION_STATUS.UNCONFIRMED,
        });
      }
    }
  }

  // 2. Causal BOS / CHoCH Structure Events (break only against already-confirmed swings!)
  const smcRaw = TechnicalIndicators.detectMarketStructureSmc(visibleCandles, swingLen);
  const structureEvents = (smcRaw.structures || []).map((st) => {
    const pivotBar = visibleCandles[st.startIndex];
    const breakBar = visibleCandles[st.breakIndex];
    const isBull = Number(st.direction) >= 0;
    return {
      type: String(st.type || 'BOS').toUpperCase(),
      direction: isBull ? 'BULLISH' : 'BEARISH',
      priceLevel: round6(st.price),
      priceRange: [round6(st.price), round6(st.price)],
      pivotIndex: st.startIndex,
      pivotConfirmIndex: st.startIndex + swingLen,
      breakIndex: st.breakIndex,
      occurredAt: extractOpenTimeMs(pivotBar),
      confirmedAt: extractOpenTimeMs(breakBar),
      sourceTimeframe: timeframe,
      methodId: 'smc-structure-break',
      methodVersion: '1.0.0',
      evidence: [
        `pivotIndex=${st.startIndex}`,
        `pivotConfirmIndex=${st.startIndex + swingLen}`,
        `breakIndex=${st.breakIndex}`,
      ],
      confidence: null,
      status: OBSERVATION_STATUS.ACTIVE,
    };
  });

  // 3. Support / Resistance Zones with causal confirmation & invalidation lifecycle
  const rawZones = TechnicalAnalysisCore.detectSupportResistanceZones(visibleCandles, swingLen, 14);
  const srZones = rawZones.map((z) => {
    const isBroken = z.status === 'BROKEN';
    const confirmIdx = Math.min(n - 1, Number(z.lastTouchIndex ?? z.startIndex ?? 0) + swingLen);
    return {
      type: z.role === 'RESISTANCE' ? 'RESISTANCE_ZONE' : 'SUPPORT_ZONE',
      role: z.role,
      direction: z.role === 'RESISTANCE' ? 'BEARISH' : 'BULLISH',
      priceLevel: round6(z.centerPrice),
      priceRange: [round6(z.lowPrice), round6(z.highPrice)],
      lowPrice: round6(z.lowPrice),
      highPrice: round6(z.highPrice),
      centerPrice: round6(z.centerPrice),
      touchCount: z.touchCount,
      wickRejectionCount: z.wickRejectionCount,
      startIndex: z.startIndex,
      lastTouchIndex: z.lastTouchIndex,
      causalConfirmIndex: confirmIdx,
      breakIndex: z.breakIndex,
      retestIndex: z.retestIndex,
      occurredAt: z.startTimeUtcMs,
      confirmedAt: extractOpenTimeMs(visibleCandles[confirmIdx]),
      sourceTimeframe: timeframe,
      methodId: 'causal-sr-cluster',
      methodVersion: '1.0.0',
      evidence: [
        `touches=${z.touchCount}`,
        `wickRejections=${z.wickRejectionCount}`,
        `lifecycle=${z.status}`,
      ],
      invalidationReason: z.invalidationReason || null,
      confidence: null,
      status: isBroken ? OBSERVATION_STATUS.INVALIDATED : OBSERVATION_STATUS.ACTIVE,
      lifecycleState: z.status,
    };
  });

  // 4. Liquidity (EQH/EQL, FVG, Volume Profile without synthetic volume)
  const equalLevels = (smcRaw.equalLevels || []).map((eq) => {
    const confirmIdx = Math.min(n - 1, Number(eq.endIndex || 0) + swingLen);
    return {
      type: eq.type,
      direction: Number(eq.direction) >= 0 ? 'BULLISH' : 'BEARISH',
      priceLevel: round6(eq.price),
      priceRange: [round6(eq.price), round6(eq.price)],
      startIndex: eq.startIndex,
      endIndex: eq.endIndex,
      confirmIndex: confirmIdx,
      occurredAt: extractOpenTimeMs(visibleCandles[eq.startIndex]),
      confirmedAt: extractOpenTimeMs(visibleCandles[confirmIdx]),
      sourceTimeframe: timeframe,
      methodId: 'smc-equal-liquidity',
      methodVersion: '1.0.0',
      evidence: [`firstPivot=${eq.startIndex}`, `secondPivot=${eq.endIndex}`],
      confidence: null,
      status: OBSERVATION_STATUS.ACTIVE,
    };
  });

  const fvgs = (smcRaw.fvgs || []).map((g) => {
    const formedIdx = Math.min(n - 1, Number(g.startIndex || 0) + 2);
    const mitigated = Number(g.endIndex) < n - 1;
    return {
      type: Number(g.direction) >= 0 ? 'BULLISH_FVG' : 'BEARISH_FVG',
      direction: Number(g.direction) >= 0 ? 'BULLISH' : 'BEARISH',
      priceLevel: round6((Number(g.top) + Number(g.bottom)) / 2),
      priceRange: [round6(g.bottom), round6(g.top)],
      startIndex: g.startIndex,
      formedIndex: formedIdx,
      endIndex: g.endIndex,
      occurredAt: extractOpenTimeMs(visibleCandles[g.startIndex]),
      confirmedAt: extractOpenTimeMs(visibleCandles[formedIdx]),
      sourceTimeframe: timeframe,
      methodId: 'smc-3bar-fvg',
      methodVersion: '1.0.0',
      evidence: [`gap=[${round4(g.bottom)}, ${round4(g.top)}]`, mitigated ? 'mitigated' : 'unmitigated'],
      confidence: null,
      status: mitigated ? OBSERVATION_STATUS.INVALIDATED : OBSERVATION_STATUS.ACTIVE,
    };
  });

  const hasRealVolume = TechnicalIndicators.hasNonZeroVolume(visibleCandles);
  const vpRaw = hasRealVolume
    ? TechnicalIndicators.computeVolumeProfile(visibleCandles.slice(-120), 24, 0.7, 'REAL_EXCHANGE')
    : null;
  const volumeProfile = vpRaw
    ? {
        status: OBSERVATION_STATUS.ACTIVE,
        poc: round6(vpRaw.poc),
        vah: round6(vpRaw.vah),
        val: round6(vpRaw.val),
        hasRealVolume: true,
      }
    : {
        status: OBSERVATION_STATUS.UNAVAILABLE,
        reason: 'NO_REAL_VOLUME_DATA',
        poc: null,
        vah: null,
        val: null,
        hasRealVolume: false,
      };

  // 5. Regime & Volatility Classification (Master Plan §4.1)
  const lastClose = Number(visibleCandles[n - 1].close);
  const e20 = ema20Series[n - 1] ?? lastClose;
  const e50 = ema50Series[n - 1] ?? lastClose;
  const emaSlopeAtr = atrNow > 0 ? (e20 - e50) / atrNow : 0;

  let regimeState = MARKET_REGIME_CLASS.UNKNOWN;
  let regimeDir = 'NEUTRAL';
  let volatilityState = 'NORMAL';
  if (atrRatio >= 1.35) volatilityState = 'EXPANSION';
  else if (atrRatio <= 0.72) volatilityState = 'COMPRESSION';

  if (swingResult.trend === 'UPTREND' || (emaSlopeAtr >= 0.75 && structureEvents.slice(-1)[0]?.direction === 'BULLISH')) {
    regimeState = volatilityState === 'EXPANSION' ? MARKET_REGIME_CLASS.EXPANSION : MARKET_REGIME_CLASS.TREND_UP;
    regimeDir = 'BULLISH';
  } else if (
    swingResult.trend === 'DOWNTREND' ||
    (emaSlopeAtr <= -0.75 && structureEvents.slice(-1)[0]?.direction === 'BEARISH')
  ) {
    regimeState = volatilityState === 'EXPANSION' ? MARKET_REGIME_CLASS.EXPANSION : MARKET_REGIME_CLASS.TREND_DOWN;
    regimeDir = 'BEARISH';
  } else if (volatilityState === 'COMPRESSION') {
    regimeState = MARKET_REGIME_CLASS.COMPRESSION;
    regimeDir = 'NEUTRAL';
  } else if (swingResult.trend === 'RANGE') {
    regimeState = MARKET_REGIME_CLASS.RANGE;
    regimeDir = 'NEUTRAL';
  }

  const observations = [
    ...confirmedSwings,
    ...(includeUnconfirmed ? unconfirmedSwings : []),
    ...structureEvents,
    ...srZones,
    ...equalLevels,
    ...fvgs,
  ].sort((a, b) => Number(a.confirmedAt ?? a.occurredAt ?? 0) - Number(b.confirmedAt ?? b.occurredAt ?? 0));

  return {
    schemaVersion: MARKET_CONTEXT_ENGINE_VERSION,
    symbolCode,
    timeframe,
    asOfIndex,
    asOfTimestamp: extractOpenTimeMs(visibleCandles[n - 1]),
    anchorClose: round6(lastClose),
    quality,
    regime: {
      state: regimeState,
      swingTrend: swingResult.trend,
      trendReason: swingResult.trendReason,
      direction: regimeDir,
      volatilityState,
      atrNow: round6(atrNow),
      atrRatio: round4(atrRatio),
      emaSlopeAtr: round4(emaSlopeAtr),
      evidence: [
        `swingTrend=${swingResult.trend}`,
        `atrRatio=${round4(atrRatio)}`,
        `emaSlopeAtr=${round4(emaSlopeAtr)}`,
      ],
    },
    swings: confirmedSwings,
    unconfirmedSwings,
    structureEvents,
    srZones,
    liquidity: {
      status: equalLevels.length > 0 || fvgs.length > 0 || volumeProfile.hasRealVolume
        ? OBSERVATION_STATUS.ACTIVE
        : OBSERVATION_STATUS.UNAVAILABLE,
      equalLevels,
      fvgs,
      volumeProfile,
    },
    observations,
  };
}

/**
 * Extracts local turning points (peaks & troughs) from a 1D price series `[anchorClose, p_1, ..., p_H]`.
 * Uses prominence filtering (`minProminence`) so micro-jitter does not count as a structural wave turn.
 */
export function extractSeriesTurningPoints(series = [], minProminence = 0) {
  if (!Array.isArray(series) || series.length < 3) return [];
  const tol = Math.max(1e-9, Number(minProminence) || 0);
  const turns = [];

  for (let i = 1; i < series.length - 1; i++) {
    const prev = Number(series[i - 1]);
    const curr = Number(series[i]);
    const next = Number(series[i + 1]);
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || !Number.isFinite(next)) continue;

    const isPeak = curr > prev && curr >= next;
    const isTrough = curr < prev && curr <= next;
    if (!isPeak && !isTrough) continue;

    const type = isPeak ? 'PEAK' : 'TROUGH';
    const prom = Math.max(Math.abs(curr - prev), Math.abs(curr - next));
    if (prom < tol) continue;

    const last = turns[turns.length - 1];
    if (last && last.type === type) {
      if ((type === 'PEAK' && curr >= last.price) || (type === 'TROUGH' && curr <= last.price)) {
        turns[turns.length - 1] = { step: i, type, price: curr, prominence: prom };
      }
    } else {
      turns.push({ step: i, type, price: curr, prominence: prom });
    }
  }
  return turns;
}

/**
 * Computes maximum pullback depth and pullback duration (in bars) against the primary move direction.
 */
export function computePullbackAndRangeMetrics(anchorClose, closes = [], atrUnit = 1) {
  const n = Array.isArray(closes) ? closes.length : 0;
  if (n === 0 || !Number.isFinite(anchorClose) || anchorClose <= 0) {
    return {
      direction: 0,
      netMove: 0,
      totalSpan: 0,
      maxPullbackDepth: 0,
      maxPullbackDepthAtr: 0,
      pullbackDurationBars: 0,
      rangeTightnessAtr: 0,
    };
  }
  const safeAtr = Math.max(1e-8, Number(atrUnit) || anchorClose * 0.005);
  const series = [anchorClose, ...closes.map(Number)];
  const terminal = series[series.length - 1];
  const netMove = terminal - anchorClose;
  const dir = netMove >= 0 ? 1 : -1;

  let minP = anchorClose;
  let maxP = anchorClose;
  let runningExtreme = anchorClose;
  let maxPullbackDepth = 0;
  let pullbackDurationBars = 0;
  let currentPullbackBars = 0;

  for (let i = 1; i < series.length; i++) {
    const p = series[i];
    const prevP = series[i - 1];
    if (p < minP) minP = p;
    if (p > maxP) maxP = p;

    if (dir >= 0) {
      if (p >= runningExtreme) {
        runningExtreme = p;
        currentPullbackBars = 0;
      } else {
        const dd = runningExtreme - p;
        if (p <= prevP) {
          currentPullbackBars++;
        }
        if (dd > maxPullbackDepth) maxPullbackDepth = dd;
        if (currentPullbackBars > pullbackDurationBars) pullbackDurationBars = currentPullbackBars;
      }
    } else {
      if (p <= runningExtreme) {
        runningExtreme = p;
        currentPullbackBars = 0;
      } else {
        const dd = p - runningExtreme;
        if (p >= prevP) {
          currentPullbackBars++;
        }
        if (dd > maxPullbackDepth) maxPullbackDepth = dd;
        if (currentPullbackBars > pullbackDurationBars) pullbackDurationBars = currentPullbackBars;
      }
    }
  }

  const totalSpan = Math.max(0, maxP - minP);
  return {
    direction: dir,
    netMove,
    totalSpan,
    maxPullbackDepth,
    maxPullbackDepthAtr: maxPullbackDepth / safeAtr,
    pullbackDurationBars,
    rangeTightnessAtr: totalSpan / safeAtr,
  };
}

/**
 * Evaluates the 7-Dimensional Path Quality & Market Behavior Vector (Master Plan §5.2)
 * comparing a predicted trajectory (`trajPoints` with `q10`, `q50`, `q90`) against
 * realized future closes (`actualCloses` or `actualCandles`) on the exact same origin and horizon.
 *
 * 7 Dimensions:
 * 1. Stepwise & Terminal Price Accuracy (`stepMae`, `stepRmse`, `terminalAbsErr`)
 * 2. Turning Point Timing & Price Error (`turningPointAgreementPct`, `turningTimingErrorBars`, `turningPriceErrorAtr`, `falseTurns`, `missedTurns`)
 * 3. Segment Direction & Wave Sequence Similarity (`segmentDirectionSimilarityPct`, `firstHalfDirAgree`, `secondHalfDirAgree`)
 * 4. Pullback Depth Error (`pullbackDepthErrorAtr`, `actualPullbackAtr`, `predPullbackAtr`)
 * 5. Pullback / Range Duration Error (`pullbackDurationErrorBars`, `actualPullbackBars`, `predPullbackBars`)
 * 6. Amplitude & Volatility Span Ratio (`amplitudeRatio`, `amplitudeErrorAtr`)
 * 7. Uncertainty Coverage + Sharpness Efficiency (`coverage80Pct`, `intervalWidthPct`, `sharpnessScore`)
 */
export function evaluatePathQualityVector({
  anchorClose,
  trajPoints = [],
  actualCandles = [],
  atrAtAnchor = null,
}) {
  const H = Math.min(
    Array.isArray(trajPoints) ? trajPoints.length : 0,
    Array.isArray(actualCandles) ? actualCandles.length : 0
  );
  const base = Number(anchorClose);
  if (H === 0 || !Number.isFinite(base) || base <= 0) {
    return null;
  }

  const predQ50 = [];
  const predQ10 = [];
  const predQ90 = [];
  const actualCloses = [];

  for (let h = 0; h < H; h++) {
    const pt = trajPoints[h];
    const q50 = Number(pt?.q50 ?? pt?.q50_median ?? base);
    const q10 = Number(pt?.q10 ?? q50);
    const q90 = Number(pt?.q90 ?? q50);
    const actObj = actualCandles[h];
    const actClose = typeof actObj === 'number' ? actObj : Number(actObj?.close ?? base);

    predQ50.push(q50);
    predQ10.push(q10);
    predQ90.push(q90);
    actualCloses.push(actClose);
  }

  const avgBandWidth =
    predQ90.reduce((acc, hi, idx) => acc + Math.max(0, hi - predQ10[idx]), 0) / Math.max(1, H);
  const atrUnit = Math.max(
    1e-8,
    Number(atrAtAnchor) > 0 ? Number(atrAtAnchor) : avgBandWidth / 2.56 || base * 0.005
  );

  // Dimension 1 & 7: Stepwise MAE/RMSE & Coverage + Sharpness
  let maeSum = 0;
  let sqErrSum = 0;
  let in80Count = 0;
  let widthPctSum = 0;

  for (let h = 0; h < H; h++) {
    const act = actualCloses[h];
    const err = Math.abs(act - predQ50[h]);
    maeSum += err;
    sqErrSum += err * err;
    if (act >= predQ10[h] && act <= predQ90[h]) in80Count++;
    widthPctSum += Math.max(0, predQ90[h] - predQ10[h]) / Math.max(1e-8, act);
  }

  const stepMae = maeSum / H;
  const stepRmse = Math.sqrt(sqErrSum / H);
  const coverage80Pct = (in80Count / H) * 100;
  const intervalWidthPct = (widthPctSum / H) * 100;

  // Dimension 2: Turning Point Agreement, Timing Error, Price Error, False & Missed Turns
  const minTurnProminence = 0.12 * atrUnit;
  const actualTurns = extractSeriesTurningPoints([base, ...actualCloses], minTurnProminence);
  const predTurns = extractSeriesTurningPoints([base, ...predQ50], minTurnProminence);

  const matchedActualIdx = new Set();
  let timingErrSum = 0;
  let turnPriceErrSum = 0;
  let matchedTurns = 0;
  const maxStepSlack = Math.max(2, Math.ceil(H * 0.35));

  for (const pt of predTurns) {
    let bestIdx = -1;
    let bestStepDiff = Infinity;
    for (let aIdx = 0; aIdx < actualTurns.length; aIdx++) {
      if (matchedActualIdx.has(aIdx)) continue;
      const at = actualTurns[aIdx];
      if (at.type !== pt.type) continue;
      const stepDiff = Math.abs(at.step - pt.step);
      if (stepDiff <= maxStepSlack && stepDiff < bestStepDiff) {
        bestStepDiff = stepDiff;
        bestIdx = aIdx;
      }
    }
    if (bestIdx >= 0) {
      matchedActualIdx.add(bestIdx);
      matchedTurns++;
      timingErrSum += bestStepDiff;
      turnPriceErrSum += Math.abs(actualTurns[bestIdx].price - pt.price) / atrUnit;
    }
  }

  const falseTurns = Math.max(0, predTurns.length - matchedTurns);
  const missedTurns = Math.max(0, actualTurns.length - matchedTurns);
  const totalTurnDenom = Math.max(actualTurns.length, predTurns.length);
  const turningPointAgreementPct =
    totalTurnDenom === 0 ? 100 : (matchedTurns / totalTurnDenom) * 100;
  const turningTimingErrorBars =
    matchedTurns > 0 ? timingErrSum / matchedTurns : actualTurns.length === 0 && predTurns.length === 0 ? 0 : H * 0.5;
  const turningPriceErrorAtr =
    matchedTurns > 0 ? turnPriceErrSum / matchedTurns : stepMae / atrUnit;

  // Dimension 3: Segment Direction & Wave Sequence Similarity (3-segment trajectory shape)
  const segCount = H >= 6 ? 3 : H >= 2 ? 2 : 1;
  let segMatches = 0;
  const actFull = [base, ...actualCloses];
  const predFull = [base, ...predQ50];
  const deadband = 0.04 * atrUnit;

  for (let s = 0; s < segCount; s++) {
    const startIdx = Math.floor((s * H) / segCount);
    const endIdx = Math.max(startIdx + 1, Math.floor(((s + 1) * H) / segCount));
    const actDelta = actFull[endIdx] - actFull[startIdx];
    const predDelta = predFull[endIdx] - predFull[startIdx];
    const actSign = Math.abs(actDelta) <= deadband ? 0 : actDelta > 0 ? 1 : -1;
    const predSign = Math.abs(predDelta) <= deadband ? 0 : predDelta > 0 ? 1 : -1;
    if (actSign === predSign || actDelta * predDelta > 0) {
      segMatches++;
    }
  }
  const segmentDirectionSimilarityPct = (segMatches / segCount) * 100;

  // Dimension 4 & 5: Pullback Depth Error & Pullback/Range Duration Error
  const actPb = computePullbackAndRangeMetrics(base, actualCloses, atrUnit);
  const predPb = computePullbackAndRangeMetrics(base, predQ50, atrUnit);
  const pullbackDepthErrorAtr = Math.abs(actPb.maxPullbackDepthAtr - predPb.maxPullbackDepthAtr);
  const pullbackDurationErrorBars = Math.abs(actPb.pullbackDurationBars - predPb.pullbackDurationBars);

  // Dimension 6: Amplitude & Volatility Span Ratio
  const actSpan = Math.max(1e-8, actPb.totalSpan);
  const predSpan = Math.max(0, predPb.totalSpan);
  const amplitudeRatio = clamp(predSpan / actSpan, 0, 5);
  const amplitudeErrorAtr = Math.abs(predSpan - actSpan) / atrUnit;

  // Dimension 7: Behavioral Pattern Classification (Trend Continuation, Pullback, Reversal, Range)
  let actualBehavior = 'RANGE_FORMATION';
  if (Math.abs(actPb.netMove) >= 0.8 * atrUnit) {
    actualBehavior = actPb.maxPullbackDepthAtr >= 0.45 ? 'TREND_WITH_PULLBACK' : 'TREND_CONTINUATION';
  } else if (actualTurns.length >= 1 && actPb.totalSpan >= 0.9 * atrUnit) {
    actualBehavior = 'REVERSAL_SWING';
  }

  let predictedBehavior = 'RANGE_FORMATION';
  if (Math.abs(predPb.netMove) >= 0.8 * atrUnit) {
    predictedBehavior = predPb.maxPullbackDepthAtr >= 0.45 ? 'TREND_WITH_PULLBACK' : 'TREND_CONTINUATION';
  } else if (predTurns.length >= 1 && predPb.totalSpan >= 0.9 * atrUnit) {
    predictedBehavior = 'REVERSAL_SWING';
  }
  const behaviorMatch =
    actualBehavior === predictedBehavior ||
    (actualBehavior.startsWith('TREND') && predictedBehavior.startsWith('TREND'));

  // Composite Path Quality Score (0..100) combining all 7 dimensions
  const priceScore = clamp(25 * (1 - Math.min(1, stepMae / (2.2 * atrUnit))), 0, 25);
  const segScore = (segmentDirectionSimilarityPct / 100) * 20;
  const turnScore = (turningPointAgreementPct / 100) * 15;
  const pbDepthScore = clamp(15 * (1 - Math.min(1, pullbackDepthErrorAtr / 2.0)), 0, 15);
  const pbDurScore = clamp(10 * (1 - Math.min(1, pullbackDurationErrorBars / Math.max(1, H * 0.6))), 0, 10);
  const ampScore = clamp(15 * (1 - Math.min(1, Math.abs(1 - amplitudeRatio))), 0, 15);
  const pathQualityScore = Math.round(
    clamp(priceScore + segScore + turnScore + pbDepthScore + pbDurScore + ampScore, 0, 100)
  );

  const falsePositiveEventRate =
    predTurns.length > 0 ? round4(falseTurns / predTurns.length) : 0;
  const missedEventRate =
    actualTurns.length > 0 ? round4(missedTurns / actualTurns.length) : 0;

  return {
    schemaVersion: PATH_QUALITY_SCHEMA_VERSION,
    horizonBars: H,
    atrUnit: round6(atrUnit),
    stepMae: round6(stepMae),
    stepRmse: round6(stepRmse),
    volAdjustedMaeAtr: round4(stepMae / atrUnit),
    turningPointAgreementPct: round4(turningPointAgreementPct),
    turningTimingErrorBars: round4(turningTimingErrorBars),
    turningPriceErrorAtr: round4(turningPriceErrorAtr),
    actualTurnCount: actualTurns.length,
    predictedTurnCount: predTurns.length,
    matchedTurnCount: matchedTurns,
    falseTurns,
    missedTurns,
    falsePositiveEventRate,
    missedEventRate,
    segmentDirectionSimilarityPct: round4(segmentDirectionSimilarityPct),
    actualPullbackDepthAtr: round4(actPb.maxPullbackDepthAtr),
    predictedPullbackDepthAtr: round4(predPb.maxPullbackDepthAtr),
    pullbackDepthErrorAtr: round4(pullbackDepthErrorAtr),
    actualPullbackDurationBars: actPb.pullbackDurationBars,
    predictedPullbackDurationBars: predPb.pullbackDurationBars,
    pullbackDurationErrorBars,
    actualAmplitudeAtr: round4(actPb.rangeTightnessAtr),
    predictedAmplitudeAtr: round4(predPb.rangeTightnessAtr),
    amplitudeRatio: round4(amplitudeRatio),
    amplitudeErrorAtr: round4(amplitudeErrorAtr),
    coverage80Pct: round4(coverage80Pct),
    intervalWidthPct: round4(intervalWidthPct),
    actualBehavior,
    predictedBehavior,
    behaviorMatch,
    pathQualityScore,
  };
}

export const TRAJECTORY_EVENT_TYPES = Object.freeze({
  TREND_CONTINUATION: 'TREND_CONTINUATION',
  PULLBACK: 'PULLBACK',
  RESISTANCE_TEST: 'RESISTANCE_TEST',
  SUPPORT_REACTION: 'SUPPORT_REACTION',
  BREAKOUT: 'BREAKOUT',
  RETEST: 'RETEST',
  RANGE_FORMATION: 'RANGE_FORMATION',
  REVERSAL: 'REVERSAL',
});

export const TRAJECTORY_EVENT_SOURCE = Object.freeze({
  MODEL_NATIVE: 'MODEL_NATIVE',
  SYSTEM_DERIVED: 'SYSTEM_DERIVED',
});

/**
 * Extracts structured, coordinate-bound behavioral events along the forecast trajectory
 * (Master Plan §5.5 & Issues Report §2.5), separating MODEL_NATIVE events (from the model's
 * own turningPoints / SMC liquidity magnets) from SYSTEM_DERIVED events (derived by intersecting
 * the numeric trajectory with causal MarketContext S/R zones and wave structure).
 */
export function extractTrajectoryBehavioralEvents({
  anchorClose,
  anchorOpenTimeUtcMs = 0,
  points = [],
  marketContext = null,
  chosenTrajectory = null,
  keyZones = [],
  atrAtAnchor = null,
}) {
  const pts = Array.isArray(points) ? points : [];
  const H = pts.length;
  const base = Number(anchorClose);
  if (H === 0 || !Number.isFinite(base) || base <= 0) {
    return [];
  }

  const q50Series = pts.map((p) => Number(p?.q50 ?? p?.q50_median ?? base));
  const q10Series = pts.map((p, idx) => Number(p?.q10 ?? q50Series[idx]));
  const q90Series = pts.map((p, idx) => Number(p?.q90 ?? q50Series[idx]));
  const tsSeries = pts.map((p) => Number(p?.openTimeUtcMs ?? p?.open_time_utc_ms ?? 0));

  const avgBand =
    q90Series.reduce((acc, hi, i) => acc + Math.max(0, hi - q10Series[i]), 0) / Math.max(1, H);
  const atrUnit = Math.max(
    1e-8,
    Number(atrAtAnchor) > 0
      ? Number(atrAtAnchor)
      : Number(marketContext?.regime?.atrNow) > 0
        ? Number(marketContext.regime.atrNow)
        : avgBand / 2.56 || base * 0.005
  );

  const modelId = String(chosenTrajectory?.modelId || 'forecast_path');
  const events = [];

  // 1. Model-Native Turning Points -> REVERSAL / PULLBACK events bound to exact step & timestamp
  const nativeTurns = Array.isArray(chosenTrajectory?.meta?.turningPoints)
    ? chosenTrajectory.meta.turningPoints
    : [];
  for (const nt of nativeTurns) {
    const step = clamp(Math.trunc(Number(nt?.step ?? nt?.barOffset ?? 1)), 1, H);
    const pt = pts[step - 1];
    const price = round6(Number(nt?.price ?? pt?.q50 ?? base));
    const isPeak = String(nt?.type || '').toUpperCase().includes('HIGH') || String(nt?.type || '').toUpperCase().includes('PEAK') || price >= base;
    const invPrice = round6(isPeak ? price + 0.65 * atrUnit : price - 0.65 * atrUnit);
    events.push({
      eventId: `evt_native_turn_${step}`,
      type: TRAJECTORY_EVENT_TYPES.REVERSAL,
      sourceType: TRAJECTORY_EVENT_SOURCE.MODEL_NATIVE,
      modelId,
      direction: isPeak ? 'BEARISH' : 'BULLISH',
      stepStart: step,
      stepEnd: Math.min(H, step + 2),
      timestampStart: tsSeries[step - 1] || anchorOpenTimeUtcMs,
      timestampEnd: tsSeries[Math.min(H - 1, step + 1)] || tsSeries[step - 1] || anchorOpenTimeUtcMs,
      priceLevel: price,
      priceRange: [round6(price - 0.25 * atrUnit), round6(price + 0.25 * atrUnit)],
      triggerCondition: isPeak
        ? `Trajectory reaches local peak around ${round4(price)} at step +${step} and decelerates`
        : `Trajectory reaches local trough around ${round4(price)} at step +${step} and rebounds`,
      invalidationLevel: invPrice,
      invalidationCondition: isPeak
        ? `Sustained close above ${round4(invPrice)} invalidates local peak reversal`
        : `Sustained close below ${round4(invPrice)} invalidates local trough reversal`,
      evidence: [`modelNativeTurn=${nt?.type || 'PIVOT'}`, `step=+${step}`],
    });
  }

  // 2. Causal S/R Zone Interactions -> RESISTANCE_TEST / SUPPORT_REACTION / BREAKOUT / RETEST
  const activeSrZones = [
    ...(Array.isArray(marketContext?.srZones) ? marketContext.srZones.filter((z) => z.status === OBSERVATION_STATUS.ACTIVE) : []),
    ...(Array.isArray(keyZones)
      ? keyZones.map((kz) => ({
          role: kz.zoneType === 'RESISTANCE_ZONE' ? 'RESISTANCE' : 'SUPPORT',
          lowPrice: Number(kz.lowPrice),
          highPrice: Number(kz.highPrice),
          centerPrice: Number(kz.centerPrice ?? (Number(kz.lowPrice) + Number(kz.highPrice)) / 2),
          touchCount: 2,
          methodId: kz.source || 'key-zone',
        }))
      : []),
  ];

  const seenRoles = new Set();
  for (const zone of activeSrZones) {
    const role = String(zone.role || (zone.type === 'RESISTANCE_ZONE' ? 'RESISTANCE' : 'SUPPORT')).toUpperCase();
    if (seenRoles.has(role)) continue;
    const zLow = Number(zone.lowPrice ?? zone.priceRange?.[0]);
    const zHigh = Number(zone.highPrice ?? zone.priceRange?.[1]);
    const zCenter = Number(zone.centerPrice ?? zone.priceLevel ?? (zLow + zHigh) / 2);
    if (!Number.isFinite(zLow) || !Number.isFinite(zHigh) || zHigh <= 0) continue;

    let firstTouchIdx = -1;
    let breakoutIdx = -1;
    let retestIdx = -1;
    const breakBuffer = 0.2 * atrUnit;

    for (let i = 0; i < H; i++) {
      const p = q50Series[i];
      const bandHi = q90Series[i];
      const bandLo = q10Series[i];
      const touchesMedian = p >= zLow - 0.15 * atrUnit && p <= zHigh + 0.15 * atrUnit;
      const touchesBand = role === 'RESISTANCE' ? bandHi >= zLow && p >= zLow - 0.45 * atrUnit : bandLo <= zHigh && p <= zHigh + 0.45 * atrUnit;

      if (firstTouchIdx === -1 && (touchesMedian || touchesBand)) {
        firstTouchIdx = i;
      }
      if (firstTouchIdx !== -1 && breakoutIdx === -1) {
        if (role === 'RESISTANCE' && p > zHigh + breakBuffer) {
          breakoutIdx = i;
        } else if (role === 'SUPPORT' && p < zLow - breakBuffer) {
          breakoutIdx = i;
        }
      } else if (breakoutIdx !== -1 && retestIdx === -1 && i > breakoutIdx) {
        if (role === 'RESISTANCE' && p <= zHigh + 0.25 * atrUnit && p >= zLow - 0.1 * atrUnit) {
          retestIdx = i;
        } else if (role === 'SUPPORT' && p >= zLow - 0.25 * atrUnit && p <= zHigh + 0.1 * atrUnit) {
          retestIdx = i;
        }
      }
    }

    if (firstTouchIdx !== -1) {
      seenRoles.add(role);
      const stepTouch = firstTouchIdx + 1;
      const isRes = role === 'RESISTANCE';
      const invPrice = round6(isRes ? zHigh + 0.55 * atrUnit : zLow - 0.55 * atrUnit);
      events.push({
        eventId: `evt_sr_test_${role.toLowerCase()}_${stepTouch}`,
        type: isRes ? TRAJECTORY_EVENT_TYPES.RESISTANCE_TEST : TRAJECTORY_EVENT_TYPES.SUPPORT_REACTION,
        sourceType: TRAJECTORY_EVENT_SOURCE.SYSTEM_DERIVED,
        modelId,
        direction: isRes ? 'BEARISH' : 'BULLISH',
        stepStart: stepTouch,
        stepEnd: Math.min(H, stepTouch + 3),
        timestampStart: tsSeries[firstTouchIdx] || anchorOpenTimeUtcMs,
        timestampEnd: tsSeries[Math.min(H - 1, firstTouchIdx + 2)] || tsSeries[firstTouchIdx] || anchorOpenTimeUtcMs,
        priceLevel: round6(zCenter),
        priceRange: [round6(zLow), round6(zHigh)],
        triggerCondition: isRes
          ? `Trajectory approaches causal resistance zone [${round4(zLow)}..${round4(zHigh)}] near step +${stepTouch}`
          : `Trajectory tests causal support zone [${round4(zLow)}..${round4(zHigh)}] near step +${stepTouch}`,
        invalidationLevel: invPrice,
        invalidationCondition: isRes
          ? `Confirmed close above ${round4(invPrice)} transitions Resistance Test into Breakout`
          : `Confirmed close below ${round4(invPrice)} invalidates Support Reaction`,
        evidence: [`zone=[${round4(zLow)}, ${round4(zHigh)}]`, `touches=${zone.touchCount || 2}`],
      });

      if (breakoutIdx !== -1) {
        const stepBrk = breakoutIdx + 1;
        const brkInv = round6(isRes ? zLow - 0.25 * atrUnit : zHigh + 0.25 * atrUnit);
        events.push({
          eventId: `evt_breakout_${role.toLowerCase()}_${stepBrk}`,
          type: TRAJECTORY_EVENT_TYPES.BREAKOUT,
          sourceType: TRAJECTORY_EVENT_SOURCE.SYSTEM_DERIVED,
          modelId,
          direction: isRes ? 'BULLISH' : 'BEARISH',
          stepStart: stepBrk,
          stepEnd: Math.min(H, stepBrk + 3),
          timestampStart: tsSeries[breakoutIdx] || anchorOpenTimeUtcMs,
          timestampEnd: tsSeries[Math.min(H - 1, breakoutIdx + 2)] || tsSeries[breakoutIdx] || anchorOpenTimeUtcMs,
          priceLevel: round6(isRes ? zHigh : zLow),
          priceRange: [round6(zLow), round6(zHigh)],
          triggerCondition: isRes
            ? `Projected median Q50 closes above resistance ${round4(zHigh)} by > 0.2×ATR at step +${stepBrk}`
            : `Projected median Q50 closes below support ${round4(zLow)} by > 0.2×ATR at step +${stepBrk}`,
          invalidationLevel: brkInv,
          invalidationCondition: isRes
            ? `Close back below ${round4(brkInv)} marks failed breakout`
            : `Close back above ${round4(brkInv)} marks failed breakdown`,
          evidence: [`breakStep=+${stepBrk}`, `barrier=${round4(isRes ? zHigh : zLow)}`],
        });
      }

      if (retestIdx !== -1) {
        const stepRet = retestIdx + 1;
        events.push({
          eventId: `evt_retest_${role.toLowerCase()}_${stepRet}`,
          type: TRAJECTORY_EVENT_TYPES.RETEST,
          sourceType: TRAJECTORY_EVENT_SOURCE.SYSTEM_DERIVED,
          modelId,
          direction: isRes ? 'BULLISH' : 'BEARISH',
          stepStart: stepRet,
          stepEnd: Math.min(H, stepRet + 2),
          timestampStart: tsSeries[retestIdx] || anchorOpenTimeUtcMs,
          timestampEnd: tsSeries[Math.min(H - 1, retestIdx + 1)] || tsSeries[retestIdx] || anchorOpenTimeUtcMs,
          priceLevel: round6(zCenter),
          priceRange: [round6(zLow), round6(zHigh)],
          triggerCondition: `Post-breakout pullback retests broken structure [${round4(zLow)}..${round4(zHigh)}] at step +${stepRet}`,
          invalidationLevel: round6(isRes ? zLow - 0.35 * atrUnit : zHigh + 0.35 * atrUnit),
          invalidationCondition: `Full acceptance back inside old range invalidates breakout-retest continuation`,
          evidence: [`retestStep=+${stepRet}`],
        });
      }
    }
  }

  // 3. Trajectory Wave / Pullback / Trend Continuation / Range Classification bound to path coordinates
  const pbMetrics = computePullbackAndRangeMetrics(base, q50Series, atrUnit);
  const sysTurns = extractSeriesTurningPoints([base, ...q50Series], 0.12 * atrUnit);
  const netMoveAtr = pbMetrics.netMove / atrUnit;

  if (pbMetrics.maxPullbackDepthAtr >= 0.35 && pbMetrics.pullbackDurationBars >= 1) {
    const firstTurn = sysTurns[0];
    const pbStartStep = firstTurn ? clamp(firstTurn.step, 1, H) : Math.max(1, Math.floor(H * 0.25));
    const pbEndStep = clamp(pbStartStep + pbMetrics.pullbackDurationBars, pbStartStep, H);
    const pbPrice = q50Series[pbEndStep - 1] ?? base;
    const isPrimaryBull = pbMetrics.direction >= 0;
    const pbInv = round6(isPrimaryBull ? base - 0.85 * atrUnit : base + 0.85 * atrUnit);
    events.push({
      eventId: `evt_pullback_${pbStartStep}_${pbEndStep}`,
      type: TRAJECTORY_EVENT_TYPES.PULLBACK,
      sourceType:
        nativeTurns.length > 0 ? TRAJECTORY_EVENT_SOURCE.MODEL_NATIVE : TRAJECTORY_EVENT_SOURCE.SYSTEM_DERIVED,
      modelId,
      direction: isPrimaryBull ? 'BEARISH' : 'BULLISH',
      stepStart: pbStartStep,
      stepEnd: pbEndStep,
      timestampStart: tsSeries[pbStartStep - 1] || anchorOpenTimeUtcMs,
      timestampEnd: tsSeries[pbEndStep - 1] || anchorOpenTimeUtcMs,
      priceLevel: round6(pbPrice),
      priceRange: [
        round6(Math.min(q50Series[pbStartStep - 1] ?? base, pbPrice)),
        round6(Math.max(q50Series[pbStartStep - 1] ?? base, pbPrice)),
      ],
      depthAtr: round4(pbMetrics.maxPullbackDepthAtr),
      durationBars: pbMetrics.pullbackDurationBars,
      triggerCondition: `Counter-trend retracement of ${round4(pbMetrics.maxPullbackDepthAtr)}×ATR over ${pbMetrics.pullbackDurationBars} bar(s) (steps +${pbStartStep}..+${pbEndStep})`,
      invalidationLevel: pbInv,
      invalidationCondition: isPrimaryBull
        ? `Drop below ${round4(pbInv)} converts pullback into structural trend reversal`
        : `Rally above ${round4(pbInv)} converts pullback into structural trend reversal`,
      evidence: [
        `depthAtr=${round4(pbMetrics.maxPullbackDepthAtr)}`,
        `durationBars=${pbMetrics.pullbackDurationBars}`,
      ],
    });
  }

  if (Math.abs(netMoveAtr) >= 0.65) {
    const isBull = netMoveAtr > 0;
    const terminalP = q50Series[H - 1];
    const invLevel = round6(isBull ? Math.min(base, q10Series[0]) - 0.5 * atrUnit : Math.max(base, q90Series[0]) + 0.5 * atrUnit);
    events.push({
      eventId: `evt_trend_cont_1_${H}`,
      type: TRAJECTORY_EVENT_TYPES.TREND_CONTINUATION,
      sourceType: TRAJECTORY_EVENT_SOURCE.SYSTEM_DERIVED,
      modelId,
      direction: isBull ? 'BULLISH' : 'BEARISH',
      stepStart: 1,
      stepEnd: H,
      timestampStart: tsSeries[0] || anchorOpenTimeUtcMs,
      timestampEnd: tsSeries[H - 1] || anchorOpenTimeUtcMs,
      priceLevel: round6(terminalP),
      priceRange: [round6(Math.min(base, terminalP)), round6(Math.max(base, terminalP))],
      triggerCondition: isBull
        ? `Sustained upward trajectory (+${round4(netMoveAtr)}×ATR) from ${round4(base)} toward ${round4(terminalP)}`
        : `Sustained downward trajectory (${round4(netMoveAtr)}×ATR) from ${round4(base)} toward ${round4(terminalP)}`,
      invalidationLevel: invLevel,
      invalidationCondition: isBull
        ? `Closed bar below ${round4(invLevel)} invalidates bullish continuation hypothesis`
        : `Closed bar above ${round4(invLevel)} invalidates bearish continuation hypothesis`,
      evidence: [`netMoveAtr=${round4(netMoveAtr)}`, `regime=${marketContext?.regime?.state || 'UNKNOWN'}`],
    });
  } else {
    const minQ50 = Math.min(...q50Series, base);
    const maxQ50 = Math.max(...q50Series, base);
    events.push({
      eventId: `evt_range_1_${H}`,
      type: TRAJECTORY_EVENT_TYPES.RANGE_FORMATION,
      sourceType: TRAJECTORY_EVENT_SOURCE.SYSTEM_DERIVED,
      modelId,
      direction: 'NEUTRAL',
      stepStart: 1,
      stepEnd: H,
      timestampStart: tsSeries[0] || anchorOpenTimeUtcMs,
      timestampEnd: tsSeries[H - 1] || anchorOpenTimeUtcMs,
      priceLevel: round6((minQ50 + maxQ50) / 2),
      priceRange: [round6(minQ50), round6(maxQ50)],
      durationBars: H,
      triggerCondition: `Trajectory remains bounded within [${round4(minQ50)}..${round4(maxQ50)}] (${round4(pbMetrics.rangeTightnessAtr)}×ATR span)`,
      invalidationLevel: round6(maxQ50 + 0.45 * atrUnit),
      invalidationCondition: `Confirmed close outside [${round4(minQ50 - 0.45 * atrUnit)}..${round4(maxQ50 + 0.45 * atrUnit)}] breaks range containment`,
      evidence: [`spanAtr=${round4(pbMetrics.rangeTightnessAtr)}`, `horizonBars=${H}`],
    });
  }

  return events.sort((a, b) => a.stepStart - b.stepStart);
}

/**
 * Builds the 3-part Behavior Scenario Contract (`basePath`, `alternativePath`, `invalidationZone`)
 * connected directly to the active trajectory, causal market structure, and calibrated scenario tree
 * without synthetic probabilities (Master Plan §5.5 & Issues Report §2.6).
 */
export function buildBehaviorScenarioContract({
  anchorClose,
  points = [],
  marketContext = null,
  scenarios = [],
  pathEvents = [],
  chosenTrajectory = null,
  atrAtAnchor = null,
}) {
  const pts = Array.isArray(points) ? points : [];
  const base = Number(anchorClose);
  if (pts.length === 0 || !Number.isFinite(base) || base <= 0) {
    return null;
  }
  const H = pts.length;
  const lastPt = pts[H - 1];
  const terminalQ50 = Number(lastPt?.q50 ?? lastPt?.q50_median ?? base);
  const terminalQ10 = Number(lastPt?.q10 ?? terminalQ50);
  const terminalQ25 = Number(lastPt?.q25 ?? terminalQ50);
  const terminalQ75 = Number(lastPt?.q75 ?? terminalQ50);
  const terminalQ90 = Number(lastPt?.q90 ?? terminalQ50);

  const atrUnit = Math.max(
    1e-8,
    Number(atrAtAnchor) > 0
      ? Number(atrAtAnchor)
      : Number(marketContext?.regime?.atrNow) > 0
        ? Number(marketContext.regime.atrNow)
        : Math.max(1e-6, Math.abs(terminalQ90 - terminalQ10) / 2.56)
  );

  const netDelta = terminalQ50 - base;
  const isBullBase = netDelta > 0.15 * atrUnit;
  const isBearBase = netDelta < -0.15 * atrUnit;
  const primaryDirection = isBullBase ? 'BULLISH' : isBearBase ? 'BEARISH' : 'NEUTRAL';

  // Nearest causal support and resistance from marketContext
  const activeSupports = (marketContext?.srZones || [])
    .filter((z) => z.status === OBSERVATION_STATUS.ACTIVE && z.role === 'SUPPORT' && z.highPrice <= base + 0.25 * atrUnit)
    .sort((a, b) => Math.abs(base - a.centerPrice) - Math.abs(base - b.centerPrice));
  const activeResistances = (marketContext?.srZones || [])
    .filter((z) => z.status === OBSERVATION_STATUS.ACTIVE && z.role === 'RESISTANCE' && z.lowPrice >= base - 0.25 * atrUnit)
    .sort((a, b) => Math.abs(a.centerPrice - base) - Math.abs(b.centerPrice - base));

  const nearestSupport = activeSupports[0] || null;
  const nearestResistance = activeResistances[0] || null;

  // Match calibrated scenario probability ONLY if calibrated & estimable (never fabricate probabilities)
  const findCalibratedProb = (biasKey) => {
    const sc = (Array.isArray(scenarios) ? scenarios : []).find((s) => s && s.bias === biasKey);
    if (sc && sc.status === 'ESTIMABLE' && Number.isFinite(Number(sc.probability))) {
      return Number(sc.probability);
    }
    return null;
  };

  const baseProb = isBullBase
    ? findCalibratedProb('bull')
    : isBearBase
      ? findCalibratedProb('bear')
      : findCalibratedProb('neutral');

  const altDirection = isBullBase ? 'BEARISH' : isBearBase ? 'BULLISH' : netDelta >= 0 ? 'BEARISH' : 'BULLISH';
  const altProb =
    altDirection === 'BULLISH'
      ? findCalibratedProb('bull')
      : altDirection === 'BEARISH'
        ? findCalibratedProb('bear')
        : null;

  // Invalidation Zone anchored to causal structure or calibrated Q25/Q75 pivot
  let invLow = null;
  let invHigh = null;
  let invBasis = '';
  if (isBullBase) {
    const structFloor = nearestSupport ? Number(nearestSupport.lowPrice) : terminalQ25;
    invHigh = round6(structFloor);
    invLow = round6(structFloor - 0.45 * atrUnit);
    invBasis = nearestSupport
      ? `Causal support zone floor [${round4(nearestSupport.lowPrice)}..${round4(nearestSupport.highPrice)}]`
      : `Calibrated lower quartile Q25 pivot (${round4(terminalQ25)})`;
  } else if (isBearBase) {
    const structCeil = nearestResistance ? Number(nearestResistance.highPrice) : terminalQ75;
    invLow = round6(structCeil);
    invHigh = round6(structCeil + 0.45 * atrUnit);
    invBasis = nearestResistance
      ? `Causal resistance zone ceiling [${round4(nearestResistance.lowPrice)}..${round4(nearestResistance.highPrice)}]`
      : `Calibrated upper quartile Q75 pivot (${round4(terminalQ75)})`;
  } else {
    invLow = round6(terminalQ10);
    invHigh = round6(terminalQ90);
    invBasis = `80% range containment bounds [${round4(terminalQ10)}..${round4(terminalQ90)}]`;
  }

  const baseEventLabels = (Array.isArray(pathEvents) ? pathEvents : [])
    .slice(0, 3)
    .map((e) => `${e.type} (+${e.stepStart}..+${e.stepEnd})`);

  return {
    contractVersion: 'behavior-scenario/1.0.0',
    basePath: {
      role: 'BASE_PATH',
      modelId: String(chosenTrajectory?.modelId || 'selected_model'),
      direction: primaryDirection,
      targetPrice: round6(terminalQ50),
      corridor80: [round6(terminalQ10), round6(terminalQ90)],
      calibratedProbability: baseProb,
      linkedEvents: baseEventLabels,
      summaryEn: isBullBase
        ? `Primary bullish trajectory toward ${round4(terminalQ50)}${nearestResistance ? ` testing resistance [${round4(nearestResistance.lowPrice)}..${round4(nearestResistance.highPrice)}]` : ''}.`
        : isBearBase
          ? `Primary bearish trajectory toward ${round4(terminalQ50)}${nearestSupport ? ` testing support [${round4(nearestSupport.lowPrice)}..${round4(nearestSupport.highPrice)}]` : ''}.`
          : `Primary range-bound trajectory centered near ${round4(terminalQ50)}.`,
      summaryFa: isBullBase
        ? `مسیر اصلی صعودی به سمت ${round4(terminalQ50)}${nearestResistance ? ` با آزمون مقاومت [${round4(nearestResistance.lowPrice)}..${round4(nearestResistance.highPrice)}]` : ''}.`
        : isBearBase
          ? `مسیر اصلی نزولی به سمت ${round4(terminalQ50)}${nearestSupport ? ` با آزمون حمایت [${round4(nearestSupport.lowPrice)}..${round4(nearestSupport.highPrice)}]` : ''}.`
          : `مسیر اصلی نوسانی/رنج حول ${round4(terminalQ50)}.`,
    },
    alternativePath: {
      role: 'ALTERNATIVE_PATH',
      source: 'QUANTILE_BOUND_AND_STRUCTURE_REACTION',
      direction: altDirection,
      targetPrice: round6(altDirection === 'BULLISH' ? terminalQ75 : terminalQ25),
      extremePrice: round6(altDirection === 'BULLISH' ? terminalQ90 : terminalQ10),
      calibratedProbability: altProb,
      triggerConditionEn:
        altDirection === 'BEARISH'
          ? `Triggered if price fails at ${nearestResistance ? `resistance ${round4(nearestResistance.lowPrice)}` : `median ${round4(terminalQ50)}`} and closes below ${round4(invHigh)}`
          : `Triggered if price holds ${nearestSupport ? `support ${round4(nearestSupport.highPrice)}` : `median ${round4(terminalQ50)}`} and closes above ${round4(invLow)}`,
      triggerConditionFa:
        altDirection === 'BEARISH'
          ? `در صورت رد شدن از مقاومت و بسته‌شدن کندل زیر ${round4(invHigh)} فعال می‌شود`
          : `در صورت حفظ حمایت و بسته‌شدن کندل بالای ${round4(invLow)} فعال می‌شود`,
    },
    invalidationZone: {
      role: 'INVALIDATION_ZONE',
      lowPrice: invLow,
      highPrice: invHigh,
      triggerLevel: isBullBase ? invHigh : isBearBase ? invLow : invHigh,
      basis: invBasis,
      conditionEn: isBullBase
        ? `Closed bar below ${round4(invHigh)} [${round4(invLow)}..${round4(invHigh)}] invalidates the primary bullish structure`
        : isBearBase
          ? `Closed bar above ${round4(invLow)} [${round4(invLow)}..${round4(invHigh)}] invalidates the primary bearish structure`
          : `Sustained breakout outside [${round4(invLow)}..${round4(invHigh)}] invalidates range containment`,
      conditionFa: isBullBase
        ? `بسته‌شدن کندل زیر ناحیه ابطال [${round4(invLow)}..${round4(invHigh)}] فرض ساختار صعودی را باطل می‌کند`
        : isBearBase
          ? `بسته‌شدن کندل بالای ناحیه ابطال [${round4(invLow)}..${round4(invHigh)}] فرض ساختار نزولی را باطل می‌کند`
          : `خروج معتبر از بازه [${round4(invLow)}..${round4(invHigh)}] فرض رنج را باطل می‌کند`,
    },
  };
}

