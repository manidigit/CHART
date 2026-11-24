import { TechnicalIndicators } from '../algorithms/technicalIndicators.js?v=1.47.41';
import {
  MODEL_EXECUTION_STATUS,
  clampHorizonBars,
  enforceMonotonicQuantiles,
} from './forecastContract.js?v=1.47.41';

/**
 * Independent Causal SMC Prediction Engine (`smc_prediction_js`)
 * ==============================================================
 * Pure, deterministic Smart Money Concepts liquidity trajectory engine.
 * Strictly causal on closed candles:
 *  - Market Structure (`BOS` / `CHoCH`) + EMA equilibrium for orderflow bias
 *  - Active unmitigated Fair Value Gaps (`FVG`) for internal liquidity rebalance
 *  - Equal Highs / Equal Lows (`EQH` / `EQL`) for external resting liquidity sweeps
 *  - Active Volume Profile (`POC`, `VAH`, `VAL`) using real-or-unit weighting (zero synthetic volume = 100)
 *
 * Strictly prohibited and absent:
 *  - Zero Math.random()
 *  - Zero Math.sin() / Math.cos()
 *  - Zero fabricated volume = 100
 *  - Zero synthetic OHLC candles or fake template fallbacks
 */

export const SMC_PREDICTION_MODEL_ID = 'smc_prediction_js';
export const SMC_PREDICTION_MODEL_VERSION = '2.3.0';
export const CANONICAL_SMC_HORIZON = 60;
export const SMC_MIN_CLOSED_BARS = 40;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function quantile(values, q) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const pos = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Smooth asymmetric monotonic easing between liquidity nodes (zero trigonometric waves, zero noise).
 */
function smoothLiquidityEase(t, exp = 1.0) {
  const u = clamp(t, 0, 1);
  const shaped = exp !== 1.0 ? Math.pow(u, exp) : u;
  return shaped * shaped * (3 - 2 * shaped);
}

function resolveVolumeProfileLookback(timeframe = 'M15') {
  const tf = String(timeframe || 'M15').trim().toUpperCase();
  if (tf === 'M15') return 120;
  if (tf === 'M30') return 100;
  if (tf === 'H1') return 96;
  if (tf === 'H4') return 72;
  if (tf === 'D1') return 60;
  if (tf === 'W1') return 48;
  return 100;
}

function stepMsForSmcTf(tf = 'M15') {
  const norm = String(tf || 'M15').trim().toUpperCase();
  if (norm === 'M15') return 900000;
  if (norm === 'M30') return 1800000;
  if (norm === 'H1') return 3600000;
  if (norm === 'H4') return 14400000;
  if (norm === 'D1') return 86400000;
  if (norm === 'W1') return 7 * 86400000;
  return 900000;
}

function resolveSmcMtfCluster(timeframe = 'M15') {
  const tf = String(timeframe || 'M15').trim().toUpperCase();
  if (tf === 'M15' || tf === 'M30' || tf === 'H1' || tf === 'H4') {
    return { clusterId: 'INTRADAY_M15_H1_H4', anchorTimeframe: 'H1' };
  }
  return { clusterId: 'SWING_H4_D1_W1', anchorTimeframe: 'D1' };
}

function resolveSmcBlockRatio(lowerTf, higherTf) {
  const lo = String(lowerTf || '').trim().toUpperCase();
  const hi = String(higherTf || '').trim().toUpperCase();
  if (lo === 'M15' && hi === 'H1') return 4;
  if (lo === 'M30' && hi === 'H1') return 2;
  if (lo === 'H1' && hi === 'H4') return 4;
  if (lo === 'H4' && hi === 'D1') return 6;
  if (lo === 'D1' && hi === 'W1') return 5;
  return 0;
}

function extractOpenMsSafe(c) {
  if (!c) return 0;
  const raw = c.openTimeUtcMs ?? c.open_time_utc_ms ?? c.time;
  if (raw !== undefined && raw !== null) {
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      return num < 1e12 && !c.open_time_utc_ms && !c.openTimeUtcMs ? num * 1000 : num;
    }
  }
  const sec = Number(c.openTimeSec);
  return Number.isFinite(sec) && sec > 0 ? sec * 1000 : 0;
}

function sliceCoDatedLowerSmcCandles(lowerCandles, targetAnchorCloseMs, lowerTf) {
  if (!Array.isArray(lowerCandles) || lowerCandles.length === 0 || !targetAnchorCloseMs) return [];
  const stepMs = stepMsForSmcTf(lowerTf || 'H1');
  let cut = lowerCandles.length;
  while (cut > 0) {
    const ms = extractOpenMsSafe(lowerCandles[cut - 1]);
    if (ms > 0 && ms + stepMs <= targetAnchorCloseMs + 1000) break;
    cut--;
  }
  return cut > 0 ? lowerCandles.slice(0, cut) : [];
}

function normalizeClosedCandles(candles = []) {
  if (!Array.isArray(candles)) return [];
  const out = [];
  for (const c of candles) {
    if (!c || c.is_closed === false) continue;
    const openMs = extractOpenMsSafe(c);
    const o = Number(c.open);
    const h = Number(c.high);
    const l = Number(c.low);
    const cl = Number(c.close);
    if (
      Number.isFinite(o) &&
      Number.isFinite(h) &&
      Number.isFinite(l) &&
      Number.isFinite(cl) &&
      o > 0 &&
      h > 0 &&
      l > 0 &&
      cl > 0
    ) {
      out.push({
        open_time_utc_ms: openMs,
        openTimeUtcMs: openMs,
        open: o,
        high: Math.max(h, o, cl),
        low: Math.min(l, o, cl),
        close: cl,
        volume: Math.max(0, Number(c.volume || 0)),
      });
    }
  }
  return out.slice(-300);
}

function extractCausalHtfSmcBias(higherCandles = []) {
  const cleanHtf = normalizeClosedCandles(higherCandles);
  if (cleanHtf.length < 20) return null;
  const slice = cleanHtf.slice(-180);
  const atrArr = TechnicalIndicators.computeAtr(slice, 14);
  const validAtr = atrArr.filter((v) => v !== null && Number.isFinite(v) && v > 0);
  const atrNow = validAtr.length > 0 ? validAtr[validAtr.length - 1] : slice[slice.length - 1].close * 0.005;
  let smc = TechnicalIndicators.detectMarketStructureSmc(slice, 3) || {};
  if (!Array.isArray(smc.structures) || smc.structures.length === 0) {
    smc = TechnicalIndicators.detectMarketStructureSmc(slice, 2) || {};
  }
  const recentStructs = (Array.isArray(smc.structures) ? smc.structures : []).slice(-4);
  let wSum = 0;
  let dirSum = 0;
  recentStructs.forEach((ev, idx) => {
    const w = Math.pow(1.4, idx) * (String(ev?.type || '').toUpperCase() === 'CHOCH' ? 1.3 : 1.0);
    dirSum += (Number(ev?.direction) >= 0 ? 1 : -1) * w;
    wSum += w;
  });
  const structScore = wSum > 0 ? dirSum / wSum : 0;
  const ema20 = TechnicalIndicators.computeEma(slice, 20);
  const ema50 = TechnicalIndicators.computeEma(slice, 50);
  const n = slice.length;
  const e20 = Number(ema20[n - 1] || slice[n - 1].close);
  const e50 = Number(ema50[n - 1] || slice[n - 1].close);
  const emaBias = clamp((e20 - e50) / Math.max(1e-9, atrNow * 1.4), -1, 1);
  const score = clamp(structScore * 0.60 + emaBias * 0.40, -1, 1);
  return {
    score: Number(score.toFixed(4)),
    direction: score >= 0.20 ? 1 : score <= -0.20 ? -1 : 0,
  };
}

function applyBlockReconciliationToSmcPoints(refPoints, anchorPoints, blockSize, lastClose, alpha = 0.72) {
  if (!Array.isArray(refPoints) || refPoints.length === 0) return refPoints;
  if (!Array.isArray(anchorPoints) || anchorPoints.length === 0 || blockSize < 2) return refPoints;
  const total = refPoints.length;
  const maxBlocks = Math.min(anchorPoints.length, Math.floor(total / blockSize));
  if (maxBlocks <= 0) return refPoints;

  const out = refPoints.map((pt) => ({ ...pt }));
  let cumulativeShift = 0;

  const scalePoint = (pt, mult) => {
    const mq = enforceMonotonicQuantiles(
      {
        q10: Math.max(1e-6, pt.q10 * mult),
        q25: Math.max(1e-6, pt.q25 * mult),
        q50: Math.max(1e-6, pt.q50 * mult),
        q75: Math.max(1e-6, pt.q75 * mult),
        q90: Math.max(1e-6, pt.q90 * mult),
      },
      lastClose * 0.01
    );
    pt.q10 = Number(mq.q10.toFixed(6));
    pt.q25 = Number(mq.q25.toFixed(6));
    pt.q50 = Number(mq.q50.toFixed(6));
    pt.q75 = Number(mq.q75.toFixed(6));
    pt.q90 = Number(mq.q90.toFixed(6));
    pt.upperBand = pt.q90;
    pt.lowerBand = pt.q10;
    pt.pctChangeFromLast = lastClose > 0 ? ((pt.q50 - lastClose) / lastClose) * 100 : 0;
  };

  for (let b = 0; b < maxBlocks; b++) {
    const startIdx = b * blockSize;
    const endIdx = startIdx + blockSize - 1;
    const localEndQ50 = Math.max(1e-6, out[endIdx].q50 * Math.exp(cumulativeShift));
    const anchorEndQ50 = Math.max(1e-6, Number(anchorPoints[b].q50));
    if (!Number.isFinite(anchorEndQ50) || anchorEndQ50 <= 0) continue;

    const blockLogDelta = Math.log(anchorEndQ50 / localEndQ50) * alpha;
    for (let j = 0; j < blockSize; j++) {
      const idx = startIdx + j;
      const ramp = (j + 1) / blockSize;
      scalePoint(out[idx], Math.exp(cumulativeShift + blockLogDelta * ramp));
    }
    cumulativeShift += blockLogDelta;
  }

  const tailStart = maxBlocks * blockSize;
  if (tailStart < total && Math.abs(cumulativeShift) > 1e-9) {
    const mult = Math.exp(cumulativeShift);
    for (let idx = tailStart; idx < total; idx++) {
      scalePoint(out[idx], mult);
    }
  }
  return out;
}

function computeEmpiricalDispersion(candles, atrSeries, horizonBars) {
  const n = candles.length;
  const logReturns = [];
  for (let i = 1; i < n; i++) {
    const p0 = candles[i - 1].close;
    const p1 = candles[i].close;
    if (p0 > 0 && p1 > 0) logReturns.push(Math.log(p1 / p0));
  }
  const calcStd = (arr) => {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    let ss = 0;
    for (const x of arr) ss += (x - mean) * (x - mean);
    return Math.sqrt(ss / (arr.length - 1));
  };

  const volShort = calcStd(logReturns.slice(-14));
  const volLong = Math.max(1e-7, calcStd(logReturns.slice(-96)));
  const validAtrs = atrSeries.filter((x) => x !== null && Number.isFinite(x) && x > 0);
  const atrNow = validAtrs.length > 0 ? validAtrs[validAtrs.length - 1] : 0;
  const atrBase = validAtrs.length > 0 ? median(validAtrs.slice(-80)) : atrNow;
  const volRatio = 0.55 * (volShort / volLong) + 0.45 * (atrBase > 0 ? atrNow / atrBase : 1.0);

  const probeHorizons = [1, 3, 6, 12, 20, 30, 45].filter((h) => h < n - 6);
  const absSpread = [];
  const upSpread = [];
  const downSpread = [];
  for (const h of probeHorizons) {
    const absD = [];
    const upD = [];
    const dnD = [];
    for (let i = 0; i < n - h; i++) {
      const diff = candles[i + h].close - candles[i].close;
      absD.push(Math.abs(diff));
      if (diff > 0) upD.push(diff);
      else if (diff < 0) dnD.push(-diff);
    }
    const sqrtH = Math.sqrt(h);
    if (absD.length >= 10) absSpread.push(quantile(absD, 0.68) / sqrtH);
    if (upD.length >= 5) upSpread.push(quantile(upD, 0.68) / sqrtH);
    if (dnD.length >= 5) downSpread.push(quantile(dnD, 0.68) / sqrtH);
  }

  const lastClose = candles[n - 1].close;
  const fallbackSigma = Math.max(atrNow * 0.65, lastClose * volShort);
  const baseStepSigma =
    absSpread.length > 0
      ? Math.max(fallbackSigma * 0.65, median(absSpread) * clamp(volRatio, 0.72, 1.55))
      : fallbackSigma * clamp(volRatio, 0.72, 1.55);

  const upMed = upSpread.length > 0 ? median(upSpread) : baseStepSigma;
  const downMed = downSpread.length > 0 ? median(downSpread) : baseStepSigma;
  const asym = downMed > 1e-9 ? upMed / downMed : 1.0;

  return {
    atrNow,
    volRatio: Number(volRatio.toFixed(4)),
    baseStepSigma: Math.max(1e-8, baseStepSigma),
    upAsym: clamp(Math.sqrt(asym), 0.78, 1.28),
    downAsym: clamp(1 / Math.sqrt(Math.max(0.25, asym)), 0.78, 1.28),
    typicalBarMove: Math.max(atrNow * 0.42, baseStepSigma * 0.68),
    maxHorizonReach: Math.max(atrNow * 1.4, baseStepSigma * Math.sqrt(horizonBars) * 1.65),
  };
}

/**
 * Extracts causal SMC market structure (BOS/CHoCH), unmitigated FVGs, EQH/EQL liquidity pools,
 * and active Volume Profile (POC/VAH/VAL) without any synthetic volume or lookahead.
 */
function extractCausalSmcMap(candles, atrNow, timeframe, htfBias = null) {
  const n = candles.length;
  const lastClose = candles[n - 1].close;
  const maxDist = atrNow * 4.0;

  let smc = TechnicalIndicators.detectMarketStructureSmc(candles.slice(-180), 3) || {};
  let smcSlice = candles.slice(-180);
  if (
    (!Array.isArray(smc.structures) || smc.structures.length === 0) &&
    (!Array.isArray(smc.fvgs) || smc.fvgs.length === 0)
  ) {
    smc = TechnicalIndicators.detectMarketStructureSmc(smcSlice, 2) || {};
  }

  const vpLookback = Math.min(n, resolveVolumeProfileLookback(timeframe));
  const vpSlice = candles.slice(-vpLookback);
  const vp = TechnicalIndicators.computeVolumeProfile(vpSlice, 24, 0.7);

  const pocPrice = vp && Number.isFinite(vp.pocPrice) && vp.pocPrice > 0 ? Number(vp.pocPrice) : null;
  const vahPrice = vp && Number.isFinite(vp.vahPrice) && vp.vahPrice > 0 ? Number(vp.vahPrice) : null;
  const valPrice = vp && Number.isFinite(vp.valPrice) && vp.valPrice > 0 ? Number(vp.valPrice) : null;
  const hasRealVolume = Boolean(vp?.hasRealVolume);

  // Orderflow bias from recency-weighted BOS/CHoCH events + EMA20/EMA50 alignment + optional causal HTF bias
  const structures = Array.isArray(smc.structures) ? smc.structures : [];
  const recentStructures = structures.slice(-6);
  let structWeightSum = 0;
  let structDirSum = 0;
  recentStructures.forEach((ev, idx) => {
    const recencyW = Math.pow(1.45, idx);
    const typeW = String(ev?.type || '').toUpperCase() === 'CHOCH' ? 1.35 : 1.0;
    const w = recencyW * typeW;
    structDirSum += (Number(ev?.direction) >= 0 ? 1 : -1) * w;
    structWeightSum += w;
  });
  const structScore = structWeightSum > 0 ? structDirSum / structWeightSum : 0;

  const ema20Arr = TechnicalIndicators.computeEma(candles, 20);
  const ema50Arr = TechnicalIndicators.computeEma(candles, 50);
  const e20 = Number(ema20Arr[ema20Arr.length - 1] || lastClose);
  const e50 = Number(ema50Arr[ema50Arr.length - 1] || lastClose);
  const emaBias = clamp((e20 - e50) / Math.max(1e-9, atrNow * 1.4), -1, 1);
  const pocBias = pocPrice !== null ? clamp((lastClose - pocPrice) / Math.max(1e-9, atrNow * 2.0), -0.5, 0.5) : 0;

  const localBiasScore = clamp(structScore * 0.62 + emaBias * 0.28 + pocBias * 0.20, -1, 1);
  const combinedBiasScore = htfBias
    ? clamp(localBiasScore * 0.78 + htfBias.score * 0.22, -1, 1)
    : localBiasScore;
  let biasDir = 0;
  let orderflowBias = 'BALANCED_EQUILIBRIUM';
  if (combinedBiasScore >= 0.22) {
    biasDir = 1;
    orderflowBias = 'BULLISH_ORDERFLOW';
  } else if (combinedBiasScore <= -0.22) {
    biasDir = -1;
    orderflowBias = 'BEARISH_ORDERFLOW';
  }

  // Strictly unmitigated FVGs (internal liquidity magnets)
  const rawFvgs = Array.isArray(smc.fvgs) ? smc.fvgs : [];
  const activeFvgs = [];
  for (let i = rawFvgs.length - 1; i >= 0; i--) {
    const fvg = rawFvgs[i];
    const top = Number(fvg?.top);
    const bottom = Number(fvg?.bottom);
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || top <= bottom) continue;
    const mid = (top + bottom) / 2;
    if (Math.abs(mid - lastClose) > maxDist) continue;
    const startCheck = Math.max(0, Number(fvg.startIndex || 0) + 3);
    let mitigated = false;
    for (let m = startCheck; m < smcSlice.length; m++) {
      if (fvg.direction === 1 && smcSlice[m].low <= bottom) {
        mitigated = true;
        break;
      }
      if (fvg.direction === -1 && smcSlice[m].high >= top) {
        mitigated = true;
        break;
      }
    }
    if (mitigated) continue;
    activeFvgs.push({
      level: Number(mid.toFixed(6)),
      top: Number(top.toFixed(6)),
      bottom: Number(bottom.toFixed(6)),
      direction: fvg.direction === 1 ? 1 : -1,
      polarity: fvg.direction === 1 ? 'SUPPORT' : 'RESISTANCE',
      source: 'SMC_FVG',
      tier: 'INTERNAL',
      label: fvg.direction === 1 ? 'Bullish FVG' : 'Bearish FVG',
      strength: 1.32,
    });
    if (activeFvgs.length >= 5) break;
  }

  // Resting EQH / EQL external liquidity pools
  const rawEq = Array.isArray(smc.equalLevels) ? smc.equalLevels : [];
  const eqPools = [];
  for (let i = rawEq.length - 1; i >= 0; i--) {
    const eq = rawEq[i];
    const lvl = Number(eq?.price);
    if (!Number.isFinite(lvl) || lvl <= 0 || Math.abs(lvl - lastClose) > maxDist) continue;
    const isHigh = String(eq.type || '').toUpperCase() === 'EQH';
    eqPools.push({
      level: Number(lvl.toFixed(6)),
      polarity: isHigh ? 'RESISTANCE' : 'SUPPORT',
      source: 'SMC_EQ',
      tier: 'EXTERNAL',
      label: isHigh ? 'EQH Liquidity Pool' : 'EQL Liquidity Pool',
      strength: 1.40,
    });
    if (eqPools.length >= 4) break;
  }

  // Volume Profile liquidity structure
  const vpZones = [];
  if (pocPrice !== null && Math.abs(pocPrice - lastClose) <= maxDist) {
    vpZones.push({
      level: Number(pocPrice.toFixed(6)),
      polarity: 'FLIP',
      source: 'SMC_VP_POC',
      tier: 'EQUILIBRIUM',
      label: 'Volume Profile POC',
      strength: 1.48,
    });
  }
  if (vahPrice !== null && Math.abs(vahPrice - lastClose) <= maxDist) {
    vpZones.push({
      level: Number(vahPrice.toFixed(6)),
      polarity: 'RESISTANCE',
      source: 'SMC_VP_VAH',
      tier: 'EXTERNAL',
      label: 'Value Area High (VAH)',
      strength: 1.15,
    });
  }
  if (valPrice !== null && Math.abs(valPrice - lastClose) <= maxDist) {
    vpZones.push({
      level: Number(valPrice.toFixed(6)),
      polarity: 'SUPPORT',
      source: 'SMC_VP_VAL',
      tier: 'EXTERNAL',
      label: 'Value Area Low (VAL)',
      strength: 1.15,
    });
  }

  const allZones = [...vpZones, ...eqPools, ...activeFvgs].sort((a, b) => b.strength - a.strength);
  const lastStruct = structures.length > 0 ? structures[structures.length - 1] : null;

  return {
    biasDir,
    orderflowBias,
    biasScore: Number(combinedBiasScore.toFixed(4)),
    pocPrice,
    vahPrice,
    valPrice,
    hasRealVolume,
    activeFvgs,
    eqPools,
    vpZones,
    allZones,
    bosChochCount: structures.length,
    lastStructureEvent: lastStruct
      ? `${lastStruct.direction === 1 ? 'BULL_' : 'BEAR_'}${String(lastStruct.type || 'BOS').toUpperCase()}`
      : '',
  };
}

/**
 * Picks the highest-scoring real liquidity target in a given direction from `fromPrice`.
 */
function pickLiquidityTarget(zones, fromPrice, dir, minTravel, maxTravel, preferredTiers = null) {
  let best = null;
  let bestScore = -Infinity;
  for (const z of zones) {
    const signed = (z.level - fromPrice) * dir;
    if (signed < minTravel || signed > maxTravel) continue;
    if (Array.isArray(preferredTiers) && !preferredTiers.includes(z.tier)) continue;
    const distRatio = signed / Math.max(1e-9, maxTravel);
    // Prefer nearer, high-strength liquidity pools without collapsing to zero movement
    const distScore = 1 - Math.abs(distRatio - 0.45);
    const polarityBonus =
      (dir > 0 && (z.polarity === 'RESISTANCE' || z.polarity === 'FLIP')) ||
      (dir < 0 && (z.polarity === 'SUPPORT' || z.polarity === 'FLIP'))
        ? 0.25
        : 0.08;
    const score = z.strength * 0.72 + distScore * 0.65 + polarityBonus;
    if (score > bestScore) {
      bestScore = score;
      best = z;
    }
  }
  return best;
}

export class SMCPredictionEngine {
  constructor(options = {}) {
    this.timeframe = String(options.timeframe || 'M15').trim().toUpperCase();
  }

  project(candles = [], features = null, horizonBars = 30, options = {}) {
    return computeSmcPrediction(candles, features, horizonBars, {
      ...options,
      timeframe: options.timeframe || this.timeframe,
      canonicalTimestamps: options.canonicalTimestamps,
    });
  }
}

/**
 * Computes a complete deterministic, strictly causal SMC Liquidity trajectory.
 * Rev 2.3: Guarantees exact 0.0000 Horizon Prefix-Invariance (CANONICAL_SMC_HORIZON = 60)
 * and Hybrid Two-Cluster MTF consistency (`INTRADAY_M15_H1_H4` & `SWING_H4_D1_W1`).
 */
export function computeSmcPrediction(candles = [], features = null, horizonBars = 30, options = {}) {
  const H = clampHorizonBars(horizonBars);
  const refH = Math.max(CANONICAL_SMC_HORIZON, H);
  const timeframe = String(options.timeframe || 'M15').trim().toUpperCase();
  const higherTimeframe = String(options.higherTimeframe || '').trim().toUpperCase();
  const higherCandles = Array.isArray(options.higherCandles) ? options.higherCandles : [];
  const lowerTimeframe = String(options.lowerTimeframe || '').trim().toUpperCase();
  const lowerCandles = Array.isArray(options.lowerCandles) ? options.lowerCandles : [];
  const isMtfInternal = Boolean(options._mtfInternal);
  const clusterInfo = resolveSmcMtfCluster(timeframe);
  const canonicalTimestamps = Array.isArray(options.canonicalTimestamps) ? options.canonicalTimestamps : [];

  const clean = normalizeClosedCandles(candles);

  if (clean.length < SMC_MIN_CLOSED_BARS) {
    return {
      modelId: SMC_PREDICTION_MODEL_ID,
      modelVersion: SMC_PREDICTION_MODEL_VERSION,
      status: MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA,
      reason: `SMC Prediction Engine requires at least ${SMC_MIN_CLOSED_BARS} closed candles (got ${clean.length}).`,
      points: [],
      turningPoints: [],
      smcZones: [],
      referenceHorizon: refH,
      mtfMeta: null,
      meta: {},
    };
  }

  const atrSeries = TechnicalIndicators.computeAtr(clean, 14);
  const disp = computeEmpiricalDispersion(clean, atrSeries, refH);
  if (!(disp.atrNow > 0) || !Number.isFinite(disp.atrNow)) {
    return {
      modelId: SMC_PREDICTION_MODEL_ID,
      modelVersion: SMC_PREDICTION_MODEL_VERSION,
      status: MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA,
      reason: 'Zero measurable ATR/volatility for SMC liquidity analysis.',
      points: [],
      turningPoints: [],
      smcZones: [],
      referenceHorizon: refH,
      mtfMeta: null,
      meta: {},
    };
  }

  const lastClose = Number(features?.lastClose || clean[clean.length - 1].close);
  const originOpenMs = clean[clean.length - 1].open_time_utc_ms;
  const htfBias = extractCausalHtfSmcBias(higherCandles);
  const smcMap = extractCausalSmcMap(clean, disp.atrNow, timeframe, htfBias);

  // Hybrid Two-Cluster MTF (`LOWER_TF_AGGREGATED`):
  // H4 aggregates exact 4-bar boundaries from anchor H1 (and W1 from D1) -> exact 0.0000 boundary alignment
  if (!isMtfInternal) {
    const inferredLowerTf = lowerTimeframe || (timeframe === 'H4' ? 'H1' : timeframe === 'W1' ? 'D1' : '');
    const lowerBlockRatio = resolveSmcBlockRatio(inferredLowerTf, timeframe);
    const canLowerAggregate =
      ((timeframe === 'H4' && inferredLowerTf === 'H1') || (timeframe === 'W1' && inferredLowerTf === 'D1')) &&
      lowerBlockRatio >= 2 &&
      lowerCandles.length >= SMC_MIN_CLOSED_BARS &&
      H * lowerBlockRatio <= 120;

    if (canLowerAggregate) {
      const targetAnchorCloseMs = originOpenMs + stepMsForSmcTf(timeframe);
      const coDatedLower = sliceCoDatedLowerSmcCandles(lowerCandles, targetAnchorCloseMs, inferredLowerTf);
      if (coDatedLower.length >= SMC_MIN_CLOSED_BARS) {
        const lowerRes = computeSmcPrediction(coDatedLower, null, H * lowerBlockRatio, {
          timeframe: inferredLowerTf,
          higherTimeframe: timeframe,
          higherCandles: clean,
          _mtfInternal: true,
        });
        if (lowerRes?.status === MODEL_EXECUTION_STATUS.SUCCESS && Array.isArray(lowerRes.points) && lowerRes.points.length >= H * lowerBlockRatio) {
          const aggPoints = new Array(H);
          for (let k = 0; k < H; k++) {
            const src = lowerRes.points[k * lowerBlockRatio + (lowerBlockRatio - 1)];
            aggPoints[k] = {
              stepAhead: k + 1,
              openTimeUtcMs: Number(canonicalTimestamps[k] || 0),
              q10: src.q10,
              q25: src.q25,
              q50: src.q50,
              q75: src.q75,
              q90: src.q90,
              upperBand: src.q90,
              lowerBand: src.q10,
              pctChangeFromLast: lastClose > 0 ? ((src.q50 - lastClose) / lastClose) * 100 : 0,
            };
          }
          const mappedNodes = [];
          let prevStep = 0;
          let prevPx = lastClose;
          for (const nd of lowerRes.turningPoints || []) {
            const mStep = clamp(Math.ceil(nd.step / lowerBlockRatio), 1, H);
            if (mStep <= prevStep) continue;
            const mPx = aggPoints[mStep - 1].q50;
            mappedNodes.push({
              ...nd,
              start_step: prevStep,
              start_price: prevPx,
              step: mStep,
              price: mPx,
            });
            prevStep = mStep;
            prevPx = mPx;
          }
          const mtfMeta = {
            clusterId: clusterInfo.clusterId,
            anchorTimeframe: inferredLowerTf,
            mode: 'LOWER_TF_AGGREGATED',
            reconciled: true,
            blockSizeBars: lowerBlockRatio,
            referenceHorizon: Math.max(CANONICAL_SMC_HORIZON, H * lowerBlockRatio),
          };
          const mergedZones = smcMap.allZones.length > 0 ? smcMap.allZones : (lowerRes.smcZones || []);
          const liquidityTargetsHit = mappedNodes.filter((nd) =>
            ['SMC_FVG', 'SMC_EQ', 'SMC_VP_POC', 'SMC_VP_VAH', 'SMC_VP_VAL'].includes(nd.zone_source)
          ).length;
          return {
            modelId: SMC_PREDICTION_MODEL_ID,
            modelVersion: SMC_PREDICTION_MODEL_VERSION,
            status: MODEL_EXECUTION_STATUS.SUCCESS,
            reason: '',
            points: aggPoints,
            turningPoints: mappedNodes,
            smcZones: mergedZones,
            referenceHorizon: mtfMeta.referenceHorizon,
            mtfMeta,
            meta: {
              orderflowBias: lowerRes.meta?.orderflowBias || smcMap.orderflowBias,
              biasScore: lowerRes.meta?.biasScore ?? smcMap.biasScore,
              pocPrice: smcMap.pocPrice !== null ? Number(smcMap.pocPrice.toFixed(6)) : (lowerRes.meta?.pocPrice ?? null),
              vahPrice: smcMap.vahPrice !== null ? Number(smcMap.vahPrice.toFixed(6)) : (lowerRes.meta?.vahPrice ?? null),
              valPrice: smcMap.valPrice !== null ? Number(smcMap.valPrice.toFixed(6)) : (lowerRes.meta?.valPrice ?? null),
              hasRealVolume: smcMap.hasRealVolume || Boolean(lowerRes.meta?.hasRealVolume),
              activeFvgCount: smcMap.activeFvgs.length || Number(lowerRes.meta?.activeFvgCount || 0),
              eqPoolCount: smcMap.eqPools.length || Number(lowerRes.meta?.eqPoolCount || 0),
              bosChochCount: smcMap.bosChochCount || Number(lowerRes.meta?.bosChochCount || 0),
              lastStructureEvent: smcMap.lastStructureEvent || lowerRes.meta?.lastStructureEvent || '',
              liquidityTargetsHit,
              referenceHorizon: mtfMeta.referenceHorizon,
              mtfMeta,
              turningPoints: mappedNodes,
              smcZones: mergedZones,
            },
          };
        }
      }
    }
  }

  if (smcMap.allZones.length === 0 && smcMap.bosChochCount === 0) {
    return {
      modelId: SMC_PREDICTION_MODEL_ID,
      modelVersion: SMC_PREDICTION_MODEL_VERSION,
      status: MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA,
      reason: 'Insufficient SMC market structure (BOS/CHoCH, FVG, EQH/EQL, or Volume Profile) detected.',
      points: [],
      turningPoints: [],
      smcZones: [],
      referenceHorizon: refH,
      mtfMeta: null,
      meta: {},
    };
  }

  // Build causal multi-phase SMC liquidity path over canonical refH (= 60) for exact 0.0000 Prefix-Invariance:
  // Internal Liquidity Rebalance (FVG/POC) -> External Liquidity Draw (EQH/EQL/VAH/VAL) -> Post-Sweep Equilibrium Reaction -> Continuation/Rotation
  const refNodes = [];
  let cursorStep = 0;
  let cursorPrice = lastClose;
  const minTravel = disp.atrNow * 0.28;
  const maxSingleLeg = disp.maxHorizonReach;

  const estimateLegDuration = (fromPx, toPx, maxAllowed, minAllowed = 3) => {
    const dist = Math.abs(toPx - fromPx);
    const est = Math.round(dist / Math.max(1e-8, disp.typicalBarMove * 0.85));
    return clamp(est, minAllowed, Math.max(minAllowed, maxAllowed));
  };

  const pushNode = (targetPrice, durBars, direction, isImpulse, role, rationale, zoneSource) => {
    if (cursorStep >= refH) return;
    const nextStep = Math.min(refH, cursorStep + Math.max(2, durBars));
    const frac = (nextStep - cursorStep) / Math.max(1, durBars);
    const clampedTarget = clamp(
      cursorPrice + (targetPrice - cursorPrice) * frac,
      Math.max(1e-6, lastClose - disp.maxHorizonReach * 1.15),
      lastClose + disp.maxHorizonReach * 1.15
    );
    refNodes.push({
      start_step: cursorStep,
      start_price: cursorPrice,
      step: nextStep,
      price: Number(clampedTarget.toFixed(6)),
      direction,
      is_impulse: isImpulse,
      role,
      rationale,
      zone_source: zoneSource || null,
    });
    cursorStep = nextStep;
    cursorPrice = clampedTarget;
  };

  if (smcMap.biasDir !== 0) {
    const dir = smcMap.biasDir;
    // Phase 1: Check for an unmitigated internal FVG or POC rebalance behind price before expansion
    const rebalanceTarget = pickLiquidityTarget(
      smcMap.allZones,
      cursorPrice,
      -dir,
      minTravel,
      Math.min(maxSingleLeg * 0.55, disp.atrNow * 2.1),
      ['INTERNAL', 'EQUILIBRIUM']
    );

    if (rebalanceTarget) {
      const dur1 = estimateLegDuration(cursorPrice, rebalanceTarget.level, Math.round(refH * 0.25), 3);
      pushNode(
        rebalanceTarget.level,
        dur1,
        -dir,
        false,
        rebalanceTarget.source === 'SMC_FVG' ? 'SMC_FVG_REBALANCE' : 'SMC_POC_RETEST',
        `${rebalanceTarget.label} internal liquidity rebalance`,
        rebalanceTarget.source
      );
    }

    // Phase 2: Primary external liquidity draw in the BOS/CHoCH orderflow direction
    if (cursorStep < refH) {
      const rem = refH - cursorStep;
      const extTarget =
        pickLiquidityTarget(smcMap.allZones, cursorPrice, dir, minTravel, maxSingleLeg, ['EXTERNAL', 'INTERNAL']) ||
        pickLiquidityTarget(smcMap.allZones, cursorPrice, dir, minTravel, maxSingleLeg, null);

      const targetPx = extTarget
        ? extTarget.level
        : cursorPrice + dir * Math.min(maxSingleLeg * 0.58, disp.atrNow * (1.2 + 0.8 * Math.abs(smcMap.biasScore)));
      const dur2 = extTarget
        ? estimateLegDuration(cursorPrice, targetPx, Math.max(6, Math.round(rem * 0.48)), 4)
        : Math.max(6, Math.round(rem * 0.42));
      pushNode(
        targetPx,
        dur2,
        dir,
        true,
        extTarget ? 'SMC_LIQUIDITY_DRAW' : 'SMC_ORDERFLOW_EXPANSION',
        extTarget
          ? `${extTarget.label} sweep (${smcMap.orderflowBias.replace('_', ' ')})`
          : `BOS/CHoCH ${dir > 0 ? 'bullish' : 'bearish'} orderflow continuation`,
        extTarget ? extTarget.source : 'SMC_STRUCTURE'
      );
    }

    // Phase 3: Post-sweep reaction / equilibrium pause toward POC or partial mean-reversion
    if (cursorStep < refH) {
      const rem = refH - cursorStep;
      const pullTarget =
        (smcMap.pocPrice !== null && (smcMap.pocPrice - cursorPrice) * (-dir) >= minTravel * 0.8
          ? { level: 0.45 * smcMap.pocPrice + 0.55 * cursorPrice, label: 'VP POC equilibrium', source: 'SMC_VP_POC' }
          : null) ||
        pickLiquidityTarget(smcMap.allZones, cursorPrice, -dir, minTravel * 0.8, maxSingleLeg * 0.5, ['INTERNAL', 'EQUILIBRIUM']);

      const reactPx = pullTarget
        ? pullTarget.level
        : cursorPrice - dir * Math.min(disp.atrNow * 0.65, Math.abs(cursorPrice - lastClose) * 0.35);
      const dur3 = estimateLegDuration(cursorPrice, reactPx, Math.max(5, Math.round(rem * 0.50)), 4);
      pushNode(
        reactPx,
        dur3,
        -dir,
        false,
        'SMC_POST_SWEEP_REACTION',
        pullTarget ? `Post-sweep reaction toward ${pullTarget.label}` : 'Post-liquidity-sweep equilibrium pullback',
        pullTarget ? pullTarget.source : 'SMC_EQUILIBRIUM'
      );
    }

    // Phase 4: Secondary continuation / liquidity equilibrium through canonical refH
    if (cursorStep < refH) {
      const rem = refH - cursorStep;
      const nextTarget = pickLiquidityTarget(smcMap.allZones, cursorPrice, dir, minTravel, maxSingleLeg * 0.65, ['EXTERNAL', 'INTERNAL']);
      const contPx = nextTarget
        ? nextTarget.level
        : cursorPrice + dir * Math.min(disp.atrNow * 0.85, maxSingleLeg * 0.32);
      pushNode(
        contPx,
        rem,
        dir,
        true,
        nextTarget ? 'SMC_SECONDARY_DRAW' : 'SMC_ORDERFLOW_CONTINUATION',
        nextTarget ? `Secondary draw toward ${nextTarget.label}` : 'Post-rebalance orderflow continuation',
        nextTarget ? nextTarget.source : 'SMC_STRUCTURE'
      );
    }
  } else {
    // Balanced equilibrium: rotate causally between real VP POC / VAH / VAL / FVG / EQH / EQL over refH
    const initialDir =
      smcMap.pocPrice !== null && Math.abs(smcMap.pocPrice - cursorPrice) >= minTravel
        ? Math.sign(smcMap.pocPrice - cursorPrice)
        : (smcMap.biasScore >= 0 ? 1 : -1);
    let rotDir = initialDir;
    let cycle = 0;
    while (cursorStep < refH && cycle < 6) {
      const rem = refH - cursorStep;
      const zone = pickLiquidityTarget(smcMap.allZones, cursorPrice, rotDir, minTravel, maxSingleLeg * 0.85, null);
      const targetPx = zone
        ? zone.level
        : smcMap.pocPrice !== null && Math.abs(smcMap.pocPrice - cursorPrice) >= minTravel * 0.6
          ? smcMap.pocPrice
          : cursorPrice + rotDir * disp.atrNow * 0.85;
      const dur = cycle === 5 ? rem : estimateLegDuration(cursorPrice, targetPx, Math.max(5, Math.round(rem * 0.42)), 4);
      pushNode(
        targetPx,
        dur,
        rotDir,
        false,
        zone ? 'SMC_RANGE_LIQUIDITY' : 'SMC_EQUILIBRIUM_ROTATION',
        zone ? `${zone.label} range liquidity rotation` : 'Balanced VP equilibrium rotation',
        zone ? zone.source : 'SMC_VP_POC'
      );
      rotDir = -rotDir;
      cycle++;
    }
  }

  // Fallback safeguard if refH not fully covered
  if (refNodes.length === 0) {
    pushNode(lastClose, refH, 0, false, 'SMC_EQUILIBRIUM_HOLD', 'Balanced liquidity equilibrium', 'SMC_EQUILIBRIUM');
  } else if (cursorStep < refH) {
    const lastNode = refNodes[refNodes.length - 1];
    pushNode(lastNode.price, refH - cursorStep, 0, false, 'SMC_EQUILIBRIUM_CONSOLIDATION', 'Post-target liquidity consolidation', 'SMC_EQUILIBRIUM');
  }

  // Interpolate full canonical refH bar-by-bar central q50 & empirical asymmetric uncertainty corridor
  const clarityScore = clamp(
    0.35 +
      Math.min(0.25, smcMap.allZones.length * 0.05) +
      Math.min(0.20, smcMap.bosChochCount * 0.04) +
      Math.abs(smcMap.biasScore) * 0.20,
    0.25,
    0.92
  );
  const ambiguityMult = 1 + (1 - clarityScore) * 0.40 + (disp.volRatio > 1.25 ? 0.18 : 0);
  const upMult = clamp(disp.upAsym * (smcMap.biasDir > 0 ? 1.05 : smcMap.biasDir < 0 ? 0.95 : 1.0), 0.76, 1.32);
  const downMult = clamp(disp.downAsym * (smcMap.biasDir < 0 ? 1.05 : smcMap.biasDir > 0 ? 0.95 : 1.0), 0.76, 1.32);

  let refPoints = new Array(refH);

  for (let step = 1; step <= refH; step++) {
    const seg = refNodes.find((nd) => step >= nd.start_step && step <= nd.step) || refNodes[refNodes.length - 1];
    const span = Math.max(1, seg.step - seg.start_step);
    const localT = clamp((step - seg.start_step) / span, 0, 1);
    const eased = smoothLiquidityEase(localT, seg.is_impulse ? 0.90 : 1.12);
    const central = Math.max(1e-6, seg.start_price + (seg.price - seg.start_price) * eased);

    const baseInner = disp.baseStepSigma * Math.sqrt(step) * 0.70 * ambiguityMult;
    const innerUp = baseInner * upMult;
    const innerDown = baseInner * downMult;
    const outerUp = innerUp * 1.82;
    const outerDown = innerDown * 1.82;

    const mq = enforceMonotonicQuantiles(
      {
        q10: central - outerDown,
        q25: central - innerDown,
        q50: central,
        q75: central + innerUp,
        q90: central + outerUp,
      },
      lastClose * 0.01
    );

    refPoints[step - 1] = {
      stepAhead: step,
      openTimeUtcMs: 0,
      q10: Number(mq.q10.toFixed(6)),
      q25: Number(mq.q25.toFixed(6)),
      q50: Number(mq.q50.toFixed(6)),
      q75: Number(mq.q75.toFixed(6)),
      q90: Number(mq.q90.toFixed(6)),
      upperBand: Number(mq.q90.toFixed(6)),
      lowerBand: Number(mq.q10.toFixed(6)),
      pctChangeFromLast: lastClose > 0 ? ((mq.q50 - lastClose) / lastClose) * 100 : 0,
    };
  }

  let mtfMeta = {
    clusterId: clusterInfo.clusterId,
    anchorTimeframe: clusterInfo.anchorTimeframe,
    mode: htfBias ? 'ANCHOR_MACRO_AWARE' : 'STANDALONE',
    reconciled: Boolean(htfBias),
    blockSizeBars: timeframe === 'H1' || timeframe === 'M15' ? 4 : timeframe === 'D1' || timeframe === 'W1' ? 5 : 2,
    referenceHorizon: refH,
  };

  // Higher-Anchor Block Reconciliation (`BLOCK_RECONCILED`) applied over full refH BEFORE slicing to H
  if (!isMtfInternal) {
    const inferredHigherTf = higherTimeframe || (timeframe === 'M15' || timeframe === 'M30' ? 'H1' : timeframe === 'H4' ? 'D1' : '');
    const higherBlockRatio = resolveSmcBlockRatio(timeframe, inferredHigherTf);
    const canHigherReconcile =
      ((timeframe === 'M15' && inferredHigherTf === 'H1') ||
        (timeframe === 'M30' && inferredHigherTf === 'H1') ||
        (timeframe === 'H4' && inferredHigherTf === 'D1')) &&
      higherBlockRatio >= 2 &&
      higherCandles.length >= SMC_MIN_CLOSED_BARS;

    if (canHigherReconcile) {
      const anchorH = Math.max(1, Math.ceil(refH / higherBlockRatio));
      const higherRes = computeSmcPrediction(higherCandles, null, anchorH, {
        timeframe: inferredHigherTf,
        _mtfInternal: true,
      });
      if (higherRes?.status === MODEL_EXECUTION_STATUS.SUCCESS && Array.isArray(higherRes.points) && higherRes.points.length >= anchorH) {
        refPoints = applyBlockReconciliationToSmcPoints(refPoints, higherRes.points, higherBlockRatio, lastClose, 0.72);
        mtfMeta = {
          clusterId: clusterInfo.clusterId,
          anchorTimeframe: inferredHigherTf,
          mode: 'BLOCK_RECONCILED',
          reconciled: true,
          blockSizeBars: higherBlockRatio,
          referenceHorizon: refH,
        };
      }
    }
  }

  // Exact prefix slice to requested H + clipped turning points
  const points = refPoints.slice(0, H).map((pt, idx) => ({
    ...pt,
    stepAhead: idx + 1,
    openTimeUtcMs: Number(canonicalTimestamps[idx] || 0),
  }));

  const nodes = [];
  for (const nd of refNodes) {
    if (nd.start_step >= H) break;
    const clippedStep = Math.min(H, nd.step);
    const startPx = nd.start_step === 0 ? lastClose : points[nd.start_step - 1]?.q50 ?? nd.start_price;
    const endPx = points[clippedStep - 1]?.q50 ?? nd.price;
    nodes.push({
      ...nd,
      start_price: startPx,
      step: clippedStep,
      price: endPx,
    });
  }

  const liquidityTargetsHit = nodes.filter((nd) =>
    ['SMC_FVG', 'SMC_EQ', 'SMC_VP_POC', 'SMC_VP_VAH', 'SMC_VP_VAL'].includes(nd.zone_source)
  ).length;

  return {
    modelId: SMC_PREDICTION_MODEL_ID,
    modelVersion: SMC_PREDICTION_MODEL_VERSION,
    status: MODEL_EXECUTION_STATUS.SUCCESS,
    reason: '',
    points,
    turningPoints: nodes,
    smcZones: smcMap.allZones,
    referenceHorizon: refH,
    mtfMeta,
    meta: {
      orderflowBias: smcMap.orderflowBias,
      biasScore: smcMap.biasScore,
      pocPrice: smcMap.pocPrice !== null ? Number(smcMap.pocPrice.toFixed(6)) : null,
      vahPrice: smcMap.vahPrice !== null ? Number(smcMap.vahPrice.toFixed(6)) : null,
      valPrice: smcMap.valPrice !== null ? Number(smcMap.valPrice.toFixed(6)) : null,
      hasRealVolume: smcMap.hasRealVolume,
      activeFvgCount: smcMap.activeFvgs.length,
      eqPoolCount: smcMap.eqPools.length,
      bosChochCount: smcMap.bosChochCount,
      lastStructureEvent: smcMap.lastStructureEvent,
      liquidityTargetsHit,
      referenceHorizon: refH,
      mtfMeta,
      turningPoints: nodes,
      smcZones: smcMap.allZones,
    },
  };
}
