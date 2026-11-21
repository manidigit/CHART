import { TechnicalIndicators } from '../algorithms/technicalIndicators.js?v=1.47.40';
import {
  MODEL_EXECUTION_STATUS,
  clampHorizonBars,
  enforceMonotonicQuantiles,
} from './forecastContract.js?v=1.47.40';

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

function normalizeClosedCandles(candles = []) {
  if (!Array.isArray(candles)) return [];
  const out = [];
  for (const c of candles) {
    if (!c || c.is_closed === false) continue;
    const openMs = Number(c.openTimeUtcMs ?? c.open_time_utc_ms ?? c.time ?? 0);
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
function extractCausalSmcMap(candles, atrNow, timeframe) {
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

  // Orderflow bias from recency-weighted BOS/CHoCH events + EMA20/EMA50 alignment
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

  const combinedBiasScore = clamp(structScore * 0.62 + emaBias * 0.28 + pocBias * 0.20, -1, 1);
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
      timeframe: options.timeframe || this.timeframe,
      canonicalTimestamps: options.canonicalTimestamps,
    });
  }
}

/**
 * Computes a complete deterministic, strictly causal SMC Liquidity trajectory.
 */
export function computeSmcPrediction(candles = [], features = null, horizonBars = 30, options = {}) {
  const H = clampHorizonBars(horizonBars);
  const timeframe = String(options.timeframe || 'M15').trim().toUpperCase();
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
      meta: {},
    };
  }

  const atrSeries = TechnicalIndicators.computeAtr(clean, 14);
  const disp = computeEmpiricalDispersion(clean, atrSeries, H);
  if (!(disp.atrNow > 0) || !Number.isFinite(disp.atrNow)) {
    return {
      modelId: SMC_PREDICTION_MODEL_ID,
      modelVersion: SMC_PREDICTION_MODEL_VERSION,
      status: MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA,
      reason: 'Zero measurable ATR/volatility for SMC liquidity analysis.',
      points: [],
      turningPoints: [],
      smcZones: [],
      meta: {},
    };
  }

  const lastClose = Number(features?.lastClose || clean[clean.length - 1].close);
  const smcMap = extractCausalSmcMap(clean, disp.atrNow, timeframe);

  if (smcMap.allZones.length === 0 && smcMap.bosChochCount === 0) {
    return {
      modelId: SMC_PREDICTION_MODEL_ID,
      modelVersion: SMC_PREDICTION_MODEL_VERSION,
      status: MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA,
      reason: 'Insufficient SMC market structure (BOS/CHoCH, FVG, EQH/EQL, or Volume Profile) detected.',
      points: [],
      turningPoints: [],
      smcZones: [],
      meta: {},
    };
  }

  // Build causal multi-phase SMC liquidity path:
  // Internal Liquidity Rebalance (FVG/POC) -> External Liquidity Draw (EQH/EQL/VAH/VAL) -> Post-Sweep Equilibrium Reaction
  const nodes = [];
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
    if (cursorStep >= H) return;
    const nextStep = Math.min(H, cursorStep + Math.max(2, durBars));
    const frac = (nextStep - cursorStep) / Math.max(1, durBars);
    const clampedTarget = clamp(
      cursorPrice + (targetPrice - cursorPrice) * frac,
      Math.max(1e-6, lastClose - disp.maxHorizonReach * 1.15),
      lastClose + disp.maxHorizonReach * 1.15
    );
    nodes.push({
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

    if (rebalanceTarget && H >= 10) {
      const dur1 = estimateLegDuration(cursorPrice, rebalanceTarget.level, Math.round(H * 0.38), 3);
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
    if (cursorStep < H) {
      const rem = H - cursorStep;
      const extTarget =
        pickLiquidityTarget(smcMap.allZones, cursorPrice, dir, minTravel, maxSingleLeg, ['EXTERNAL', 'INTERNAL']) ||
        pickLiquidityTarget(smcMap.allZones, cursorPrice, dir, minTravel, maxSingleLeg, null);

      const targetPx = extTarget
        ? extTarget.level
        : cursorPrice + dir * Math.min(maxSingleLeg * 0.72, disp.atrNow * (1.2 + 0.8 * Math.abs(smcMap.biasScore)));
      const dur2 = extTarget
        ? estimateLegDuration(cursorPrice, targetPx, Math.max(4, Math.round(rem * 0.72)), 4)
        : Math.max(4, Math.round(rem * 0.68));
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
    if (cursorStep < H) {
      const rem = H - cursorStep;
      const pullTarget =
        (smcMap.pocPrice !== null && (smcMap.pocPrice - cursorPrice) * (-dir) >= minTravel * 0.8
          ? { level: 0.45 * smcMap.pocPrice + 0.55 * cursorPrice, label: 'VP POC equilibrium', source: 'SMC_VP_POC' }
          : null) ||
        pickLiquidityTarget(smcMap.allZones, cursorPrice, -dir, minTravel * 0.8, maxSingleLeg * 0.5, ['INTERNAL', 'EQUILIBRIUM']);

      const reactPx = pullTarget
        ? pullTarget.level
        : cursorPrice - dir * Math.min(disp.atrNow * 0.65, Math.abs(cursorPrice - lastClose) * 0.35);
      pushNode(
        reactPx,
        rem,
        -dir,
        false,
        'SMC_POST_SWEEP_REACTION',
        pullTarget ? `Post-sweep reaction toward ${pullTarget.label}` : 'Post-liquidity-sweep equilibrium pullback',
        pullTarget ? pullTarget.source : 'SMC_EQUILIBRIUM'
      );
    }
  } else {
    // Balanced equilibrium: rotate causally between real VP POC / VAH / VAL / FVG / EQH / EQL
    const initialDir =
      smcMap.pocPrice !== null && Math.abs(smcMap.pocPrice - cursorPrice) >= minTravel
        ? Math.sign(smcMap.pocPrice - cursorPrice)
        : (smcMap.biasScore >= 0 ? 1 : -1);
    let rotDir = initialDir;
    let cycle = 0;
    while (cursorStep < H && cycle < 4) {
      const rem = H - cursorStep;
      const zone = pickLiquidityTarget(smcMap.allZones, cursorPrice, rotDir, minTravel, maxSingleLeg * 0.85, null);
      const targetPx = zone
        ? zone.level
        : smcMap.pocPrice !== null && Math.abs(smcMap.pocPrice - cursorPrice) >= minTravel * 0.6
          ? smcMap.pocPrice
          : cursorPrice + rotDir * disp.atrNow * 0.85;
      const dur = cycle === 3 ? rem : estimateLegDuration(cursorPrice, targetPx, Math.max(4, Math.round(rem * 0.55)), 4);
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

  // Fallback safeguard if horizon not fully covered
  if (nodes.length === 0) {
    pushNode(lastClose, H, 0, false, 'SMC_EQUILIBRIUM_HOLD', 'Balanced liquidity equilibrium', 'SMC_EQUILIBRIUM');
  } else if (cursorStep < H) {
    const lastNode = nodes[nodes.length - 1];
    pushNode(lastNode.price, H - cursorStep, 0, false, 'SMC_EQUILIBRIUM_CONSOLIDATION', 'Post-target liquidity consolidation', 'SMC_EQUILIBRIUM');
  }

  // Interpolate bar-by-bar central q50 & empirical asymmetric uncertainty corridor
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

  const canonicalTimestamps = Array.isArray(options.canonicalTimestamps) ? options.canonicalTimestamps : [];
  const points = new Array(H);

  for (let step = 1; step <= H; step++) {
    const seg = nodes.find((nd) => step >= nd.start_step && step <= nd.step) || nodes[nodes.length - 1];
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

    points[step - 1] = {
      stepAhead: step,
      openTimeUtcMs: Number(canonicalTimestamps[step - 1] || 0),
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
      turningPoints: nodes,
      smcZones: smcMap.allZones,
    },
  };
}
