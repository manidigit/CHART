import {
  MODEL_EXECUTION_STATUS,
  clampHorizonBars,
  enforceMonotonicQuantiles,
  roundToSignificant,
} from './forecastContract.js?v=1.47.41';

export const CANONICAL_ANALOG_HORIZON = 60;
export const CANONICAL_ANALOG_EMBARGO = Math.max(5, Math.ceil(0.25 * CANONICAL_ANALOG_HORIZON)); // 15 bars
export const ANALOG_ENGINE_VERSION = '2.3.0';

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

function weightedQuantile(pairs, p) {
  if (!Array.isArray(pairs) || pairs.length === 0) return 0;
  const sorted = pairs.slice().sort((a, b) => a.value - b.value);
  let totalW = 0;
  for (const item of sorted) totalW += Math.max(0, item.weight);
  if (totalW <= 0) {
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1))));
    return sorted[idx].value;
  }
  const target = clamp(p, 0, 1) * totalW;
  let acc = 0;
  for (let i = 0; i < sorted.length; i++) {
    const w = Math.max(0, sorted[i].weight);
    const prevAcc = acc;
    acc += w;
    if (acc >= target) {
      if (i === 0 || w <= 0) return sorted[i].value;
      const prevVal = sorted[i - 1].value;
      const frac = clamp((target - prevAcc) / w, 0, 1);
      return prevVal + (sorted[i].value - prevVal) * frac;
    }
  }
  return sorted[sorted.length - 1].value;
}

function extractOpenMs(c) {
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

function stepMsForTf(tf = 'M15') {
  const norm = String(tf || 'M15').trim().toUpperCase();
  if (norm === 'M15') return 900000;
  if (norm === 'M30') return 1800000;
  if (norm === 'H1') return 3600000;
  if (norm === 'H4') return 14400000;
  if (norm === 'D1') return 86400000;
  if (norm === 'W1') return 7 * 86400000;
  return 900000;
}

function resolveClusterInfo(timeframe = 'M15') {
  const tf = String(timeframe || 'M15').trim().toUpperCase();
  if (tf === 'M15' || tf === 'M30' || tf === 'H1') {
    return { clusterId: 'INTRADAY_M15_H1_H4', anchorTimeframe: 'H1' };
  }
  if (tf === 'H4') {
    return { clusterId: 'INTRADAY_M15_H1_H4', anchorTimeframe: 'H1' };
  }
  return { clusterId: 'SWING_H4_D1_W1', anchorTimeframe: 'D1' };
}

function defaultMacroBlockRatio(timeframe = 'M15') {
  const tf = String(timeframe || 'M15').trim().toUpperCase();
  if (tf === 'M15') return 4;
  if (tf === 'M30') return 4;
  if (tf === 'H1') return 4;
  if (tf === 'H4') return 6;
  if (tf === 'D1') return 5;
  return 4;
}

function inferSeriesStepMs(openMsArr) {
  const limit = Math.min(40, openMsArr.length);
  let minDiff = Infinity;
  let prev = 0;
  for (let i = 0; i < limit; i++) {
    const ms = openMsArr[i];
    if (prev > 0 && ms > prev) {
      const diff = ms - prev;
      if (diff < minDiff) minDiff = diff;
    }
    prev = ms;
  }
  return Number.isFinite(minDiff) && minDiff > 0 ? minDiff : 0;
}

function computeCausalEma(values, period) {
  const n = values.length;
  const out = new Float64Array(n);
  if (n === 0) return out;
  const alpha = 2 / (Math.max(1, period) + 1);
  out[0] = values[0];
  for (let i = 1; i < n; i++) {
    out[i] = alpha * values[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

function precomputeMacroContext(higherCandles, higherTimeframe, defaultRatio = 4) {
  if (!Array.isArray(higherCandles) || higherCandles.length < 16) return null;
  const m = higherCandles.length;
  const closes = new Float64Array(m);
  const openMs = new Float64Array(m);
  const tr = new Float64Array(m);
  const atr14 = new Float64Array(m);
  let sum14 = 0;
  for (let i = 0; i < m; i++) {
    const c = higherCandles[i];
    const hi = Number(c?.high);
    const lo = Number(c?.low);
    const cl = Number(c?.close);
    if (!Number.isFinite(cl) || cl <= 0) return null;
    closes[i] = cl;
    openMs[i] = extractOpenMs(c);
    const prevCl = i > 0 ? closes[i - 1] : cl;
    const curTr = i > 0 ? Math.max(hi - lo, Math.abs(hi - prevCl), Math.abs(lo - prevCl)) : Math.max(1e-8, hi - lo);
    tr[i] = Number.isFinite(curTr) ? curTr : cl * 1e-4;
    sum14 += tr[i];
    if (i >= 14) sum14 -= tr[i - 14];
    atr14[i] = Math.max(sum14 / Math.min(i + 1, 14), cl * 1e-4);
  }
  const ema20 = computeCausalEma(closes, 20);
  const emaDist = new Float64Array(m);
  const slope4 = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const a = atr14[i];
    emaDist[i] = clamp((closes[i] - ema20[i]) / a, -6, 6);
    const prevIdx = Math.max(0, i - 4);
    slope4[i] = clamp((ema20[i] - ema20[prevIdx]) / (a * Math.max(1, i - prevIdx) * 0.5), -4, 4);
  }
  const htfStepMs = higherTimeframe ? stepMsForTf(higherTimeframe) : (inferSeriesStepMs(openMs) || stepMsForTf('H1') * defaultRatio);
  return { count: m, openMs, htfStepMs, emaDist, slope4 };
}

function buildCoDatedLowerSlices(lowerCandles, targetAnchorCloseMs) {
  if (!Array.isArray(lowerCandles) || lowerCandles.length === 0 || !targetAnchorCloseMs) return [];
  const stepMs = inferSeriesStepMs(lowerCandles.map(extractOpenMs)) || 3600000;
  let cut = lowerCandles.length;
  while (cut > 0) {
    const open = extractOpenMs(lowerCandles[cut - 1]);
    if (open > 0 && open + stepMs <= targetAnchorCloseMs + 60000) break;
    cut--;
  }
  return cut > 0 ? lowerCandles.slice(0, cut) : [];
}

/**
 * Rev 2.3 Strictly Causal, Prefix-Invariant, Multi-Scale Empirical Analog Engine.
 *
 * Rev 2.3 upgrades over Rev 2.2:
 *  1. Horizon Prefix-Invariance: fixes search ceiling H_CANONICAL_MAX = 60 and canonical embargo = 15,
 *     and eliminates dynamic jMax-dependent stride (full scan stride = 1 using Float64Array feature buffers),
 *     guaranteeing exact 0.0000 diff across horizons 15 / 30 / 60 on shared prefix steps.
 *  2. Causal Feature Enrichment (zero look-ahead): EMA20/50 distances & slope, confirmed swing S/R proximity
 *     (pivots visible only after confirmIdx = pivotIdx + 5), soft circular UTC session matching for intraday TFs,
 *     and causal multi-scale macro context (from aligned closed HTF bars or rolling macro window).
 *  3. Hybrid Two-Cluster MTF Execution & Reconciliation:
 *     - Cluster A (M15 <-> H1 <-> H4, anchored on H1)
 *     - Cluster B (H4 <-> D1 <-> W1, anchored on D1)
 *     Preserves intra-block lower-TF retracements while keeping block endpoints & net direction consistent.
 */
export class EmpiricalAnalogEngine {
  constructor(windowSize = 24, horizon = 20, timeframe = 'M15') {
    this.windowSize = Math.max(12, Math.min(48, Number(windowSize || 24)));
    this.horizon = clampHorizonBars(horizon);
    this.timeframe = String(timeframe || 'M15').trim().toUpperCase();
    this.topKAnalogs = 25;
    this.canonicalMaxHorizon = CANONICAL_ANALOG_HORIZON;
  }

  calculateATR(candles, period = 14) {
    if (!Array.isArray(candles) || candles.length < 2) return 0;
    const p = Math.min(period, candles.length - 1);
    let trSum = 0;
    for (let i = candles.length - p; i < candles.length; i++) {
      const curr = candles[i];
      const prevClose = Number(candles[i - 1].close);
      const hi = Number(curr.high);
      const lo = Number(curr.low);
      trSum += Math.max(hi - lo, Math.abs(hi - prevClose), Math.abs(lo - prevClose));
    }
    const lastClose = Number(candles[candles.length - 1].close || 1);
    return Math.max(trSum / Math.max(1, p), lastClose * 1e-4);
  }

  /**
   * O(T) causal precomputation of typed feature arrays for zero-allocation stride=1 analog search.
   */
  _precomputeCausalSeries(candles, mtfContext = {}) {
    const n = candles.length;
    const opens = new Float64Array(n);
    const highs = new Float64Array(n);
    const lows = new Float64Array(n);
    const closes = new Float64Array(n);
    const openMs = new Float64Array(n);
    const tr = new Float64Array(n);
    const atr14 = new Float64Array(n);
    const atr60 = new Float64Array(n);
    const atrPct = new Float64Array(n);
    const volRatio = new Float64Array(n);
    const bodyRatio = new Float64Array(n);
    const barRange = new Float64Array(n);
    const sessionSin = new Float64Array(n);
    const sessionCos = new Float64Array(n);

    const isIntraday = this.timeframe === 'M15' || this.timeframe === 'M30' || this.timeframe === 'H1' || this.timeframe === 'H4';
    let sum14 = 0;
    let sum60 = 0;
    let validMsCount = 0;

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const op = Math.max(1e-8, Number(c.open));
      const hi = Math.max(1e-8, Number(c.high));
      const lo = Math.max(1e-8, Number(c.low));
      const cl = Math.max(1e-8, Number(c.close));
      const ms = extractOpenMs(c);

      opens[i] = op;
      highs[i] = hi;
      lows[i] = lo;
      closes[i] = cl;
      openMs[i] = ms;

      const prevCl = i > 0 ? closes[i - 1] : cl;
      const curTr = i > 0 ? Math.max(hi - lo, Math.abs(hi - prevCl), Math.abs(lo - prevCl)) : Math.max(1e-8, hi - lo);
      tr[i] = curTr;

      sum14 += curTr;
      if (i >= 14) sum14 -= tr[i - 14];
      const a14 = Math.max(sum14 / Math.min(i + 1, 14), cl * 1e-4);
      atr14[i] = a14;

      sum60 += curTr;
      if (i >= 60) sum60 -= tr[i - 60];
      const a60 = Math.max(sum60 / Math.min(i + 1, 60), cl * 1e-4);
      atr60[i] = a60;

      atrPct[i] = a14 / cl;
      volRatio[i] = clamp(a14 / a60, 0.35, 3.0);

      const rng = Math.max(1e-8, hi - lo);
      barRange[i] = rng;
      bodyRatio[i] = (cl - op) / rng;

      if (isIntraday && ms > 0) {
        validMsCount++;
        const dt = new Date(ms);
        const hrFrac = dt.getUTCHours() + dt.getUTCMinutes() / 60;
        const theta = (2 * Math.PI * hrFrac) / 24;
        sessionSin[i] = Math.sin(theta);
        sessionCos[i] = Math.cos(theta);
      }
    }

    // Causal EMAs (trend & multi-scale fallback)
    const ema20 = computeCausalEma(closes, 20);
    const ema50 = computeCausalEma(closes, 50);
    const macroRatio = defaultMacroBlockRatio(this.timeframe);
    const macroEmaPeriod = Math.min(192, Math.max(48, 20 * macroRatio));
    const emaMacro = computeCausalEma(closes, macroEmaPeriod);

    const ema20Dist = new Float64Array(n);
    const ema50Dist = new Float64Array(n);
    const emaSlope = new Float64Array(n);
    const macroEmaDist = new Float64Array(n);
    const macroSlope = new Float64Array(n);

    // Causal Confirmed Swing S/R proximity (swingLen = 5; visible strictly at confirmIdx = pivot + 5)
    const swingLen = 5;
    const confirmedRes = [];
    const confirmedSup = [];
    const resDistAtr = new Float64Array(n);
    const supDistAtr = new Float64Array(n);
    const srPos = new Float64Array(n);

    const pushZone = (list, level, a14) => {
      const tol = Math.max(1e-6, a14 * 0.55);
      for (let k = list.length - 1; k >= 0; k--) {
        if (Math.abs(list[k] - level) <= tol) {
          list[k] = list[k] * 0.55 + level * 0.45;
          return;
        }
      }
      list.push(level);
      if (list.length > 14) list.shift();
    };

    // Causal HTF alignment pointer if higherCandles provided
    const htfMacro = precomputeMacroContext(
      mtfContext.higherCandles,
      mtfContext.higherTimeframe,
      macroRatio
    );
    const ltfStepMs = inferSeriesStepMs(openMs) || stepMsForTf(this.timeframe);
    let htfPtr = -1;

    for (let i = 0; i < n; i++) {
      const cl = closes[i];
      const a14 = atr14[i];
      const a60 = atr60[i];

      ema20Dist[i] = clamp((cl - ema20[i]) / a14, -6, 6);
      ema50Dist[i] = clamp((cl - ema50[i]) / a14, -8, 8);
      const sLook = Math.max(0, i - 5);
      emaSlope[i] = clamp((ema20[i] - ema20[sLook]) / (a14 * Math.max(1, i - sLook) * 0.35), -4, 4);

      // Update confirmed swings up to i (confirmIdx = i => pivotIdx = i - swingLen)
      const pIdx = i - swingLen;
      if (pIdx >= swingLen) {
        const candH = highs[pIdx];
        const candL = lows[pIdx];
        let isSwingHi = true;
        let isSwingLo = true;
        for (let k = pIdx - swingLen; k < pIdx; k++) {
          if (highs[k] >= candH) { isSwingHi = false; break; }
        }
        if (isSwingHi) {
          for (let k = pIdx + 1; k <= i; k++) {
            if (highs[k] > candH) { isSwingHi = false; break; }
          }
        }
        if (isSwingHi) pushZone(confirmedRes, candH, a14);

        for (let k = pIdx - swingLen; k < pIdx; k++) {
          if (lows[k] <= candL) { isSwingLo = false; break; }
        }
        if (isSwingLo) {
          for (let k = pIdx + 1; k <= i; k++) {
            if (lows[k] < candL) { isSwingLo = false; break; }
          }
        }
        if (isSwingLo) pushZone(confirmedSup, candL, a14);
      }

      let bestResDist = 6.0;
      for (let k = 0; k < confirmedRes.length; k++) {
        const d = (confirmedRes[k] - cl) / a14;
        if (d >= -0.20 && d < bestResDist) bestResDist = d;
      }
      let bestSupDist = 6.0;
      for (let k = 0; k < confirmedSup.length; k++) {
        const d = (cl - confirmedSup[k]) / a14;
        if (d >= -0.20 && d < bestSupDist) bestSupDist = d;
      }
      resDistAtr[i] = clamp(bestResDist, -0.2, 6.0);
      supDistAtr[i] = clamp(bestSupDist, -0.2, 6.0);
      const span = Math.max(0.15, resDistAtr[i] + supDistAtr[i]);
      srPos[i] = clamp((supDistAtr[i] + 0.2) / span, 0, 1);

      // Causal higher-TF macro state strictly closed <= current candle close time
      let usedHtf = false;
      if (htfMacro && openMs[i] > 0) {
        const barCloseMs = openMs[i] + ltfStepMs;
        while (htfPtr + 1 < htfMacro.count && htfMacro.openMs[htfPtr + 1] > 0 && htfMacro.openMs[htfPtr + 1] + htfMacro.htfStepMs <= barCloseMs + 1000) {
          htfPtr++;
        }
        if (htfPtr >= 0) {
          macroEmaDist[i] = htfMacro.emaDist[htfPtr];
          macroSlope[i] = htfMacro.slope4[htfPtr];
          usedHtf = true;
        }
      }
      if (!usedHtf) {
        const mDenom = Math.max(a14 * Math.sqrt(macroRatio), a60 * 1.4);
        macroEmaDist[i] = clamp((cl - emaMacro[i]) / mDenom, -6, 6);
        const mPrev = Math.max(0, i - macroRatio * 4);
        macroSlope[i] = clamp((emaMacro[i] - emaMacro[mPrev]) / (mDenom * 1.25), -4, 4);
      }
    }

    return {
      n,
      opens,
      highs,
      lows,
      closes,
      openMs,
      atr14,
      atr60,
      atrPct,
      volRatio,
      bodyRatio,
      barRange,
      ema20Dist,
      ema50Dist,
      emaSlope,
      resDistAtr,
      supDistAtr,
      srPos,
      macroEmaDist,
      macroSlope,
      sessionSin,
      sessionCos,
      hasSessionTimestamps: isIntraday && validMsCount >= Math.floor(n * 0.5),
    };
  }

  extractNormalizedShape(window, atr) {
    const baseClose = Math.max(1e-8, Number(window[0]?.close || 1));
    const safeAtr = Math.max(1e-8, atr);
    const vec = [];
    for (let i = 0; i < window.length; i++) {
      const c = window[i];
      const hi = Number(c.high);
      const lo = Number(c.low);
      const op = Number(c.open);
      const cl = Number(c.close);
      const retNorm = (cl - baseClose) / safeAtr;
      const range = Math.max(1e-8, hi - lo);
      const bodyRatio = (cl - op) / range;
      const rangeNorm = clamp(range / safeAtr, 0, 4) * 0.45;
      vec.push(retNorm, bodyRatio, rangeNorm);
    }
    return vec;
  }

  _extractWindowDescriptor(candles, startIdx, length, atr) {
    const safeAtr = Math.max(1e-8, atr);
    const firstClose = Math.max(1e-8, Number(candles[startIdx]?.close || 1));
    const lastClose = Math.max(1e-8, Number(candles[startIdx + length - 1]?.close || firstClose));
    const slopeNorm = (lastClose - firstClose) / (safeAtr * Math.sqrt(Math.max(1, length)));
    let upCount = 0;
    for (let i = startIdx + 1; i < startIdx + length; i++) {
      if (Number(candles[i].close) >= Number(candles[i - 1].close)) upCount++;
    }
    const upFrac = upCount / Math.max(1, length - 1);
    return { slopeNorm, upFrac };
  }

  /**
   * Strictly Causal & Horizon-Prefix-Invariant Analog Search:
   *   - Locks reference search horizon to CANONICAL_ANALOG_HORIZON (60) whenever history permits (T >= 2*effL + 90)
   *     so jMax and embargo are independent of requested horizon H in [10..60].
   *   - Eliminates jMax-dependent dynamic stride (uses full stride = 1 over typed Float64Array buffers).
   */
  findCausalAnalogs(candles, horizonBars, currentAtr, mtfContext = {}) {
    const T = Array.isArray(candles) ? candles.length : 0;
    const H = Math.max(10, Math.round(horizonBars || this.horizon));
    const effL = Math.min(this.windowSize, Math.max(12, Math.floor(T * 0.15)));

    // Fixed canonical reference horizon for exact Prefix-Invariance across H = 10..60
    const healthyMinJMax = 42;
    let refH = CANONICAL_ANALOG_HORIZON;
    let refEmbargo = CANONICAL_ANALOG_EMBARGO;
    if (T - 2 * effL - refH - refEmbargo < healthyMinJMax) {
      const budget = T - 2 * effL - healthyMinJMax;
      let chosenH = H;
      for (let candH = CANONICAL_ANALOG_HORIZON; candH >= H; candH--) {
        const emb = Math.max(5, Math.ceil(0.25 * candH));
        if (candH + emb <= budget) {
          chosenH = candH;
          break;
        }
      }
      refH = chosenH;
      refEmbargo = Math.max(5, Math.ceil(0.25 * refH));
    }

    const jMax = T - effL - effL - refH - refEmbargo;

    if (jMax < 15) {
      return {
        status: 'INSUFFICIENT_EVIDENCE',
        reason: `Insufficient non-overlapping history for causal analog search (jMax=${jMax} < 15 at H=${H}, refH=${refH}, embargo=${refEmbargo})`,
        analogs: [],
        jMax,
        embargoGap: refEmbargo,
        referenceHorizon: refH,
        windowLength: effL,
        minSeparationBars: 0,
        declusteredCount: 0,
        stride: 1,
      };
    }

    const series = this._precomputeCausalSeries(candles, mtfContext);
    const currEndIdx = T - 1;
    const currStartIdx = T - effL;
    const effCurrentAtr = Math.max(1e-8, Number(currentAtr || series.atr14[currEndIdx] || 1e-4));
    const currClose = series.closes[currEndIdx];
    const currentAtrPct = effCurrentAtr / currClose;
    const currentVolRatio = series.volRatio[currEndIdx] || 1.0;

    // Precompute current window normalized descriptors
    const currRetNorm = new Float64Array(effL);
    const currBody = new Float64Array(effL);
    const currRangeNorm = new Float64Array(effL);
    const wClose = new Float64Array(effL);
    const wBody = new Float64Array(effL);
    const wRange = new Float64Array(effL);

    const currBaseClose = series.closes[currStartIdx];
    let currUpCount = 0;
    let totalFeatureWeight = 0;
    for (let i = 0; i < effL; i++) {
      const idx = currStartIdx + i;
      currRetNorm[i] = (series.closes[idx] - currBaseClose) / effCurrentAtr;
      currBody[i] = series.bodyRatio[idx];
      currRangeNorm[i] = clamp(series.barRange[idx] / effCurrentAtr, 0, 4) * 0.45;
      if (i > 0 && series.closes[idx] >= series.closes[idx - 1]) currUpCount++;

      const tNorm = i / Math.max(1, effL - 1);
      const recency = 0.75 + 0.90 * tNorm * tNorm;
      wClose[i] = recency * 1.15;
      wBody[i] = recency * 0.55;
      wRange[i] = recency * 0.45;
      totalFeatureWeight += wClose[i] + wBody[i] + wRange[i];
    }

    const sqrtLen = Math.sqrt(Math.max(1, effL));
    const currSlopeNorm = (currClose - currBaseClose) / (effCurrentAtr * sqrtLen);
    const currUpFrac = currUpCount / Math.max(1, effL - 1);

    // Current causal enriched features at origin
    const currEma20D = series.ema20Dist[currEndIdx];
    const currEma50D = series.ema50Dist[currEndIdx];
    const currEmaSl = series.emaSlope[currEndIdx];
    const currResD = series.resDistAtr[currEndIdx];
    const currSupD = series.supDistAtr[currEndIdx];
    const currSrPos = series.srPos[currEndIdx];
    const currMacroD = series.macroEmaDist[currEndIdx];
    const currMacroSl = series.macroSlope[currEndIdx];
    const currSessSin = series.sessionSin[currEndIdx];
    const currSessCos = series.sessionCos[currEndIdx];

    const sessionWeight = !series.hasSessionTimestamps
      ? 0
      : this.timeframe === 'H4'
        ? 0.08
        : (this.timeframe === 'M15' || this.timeframe === 'M30' || this.timeframe === 'H1')
          ? 0.15
          : 0;

    const invTotalWeight = 1 / Math.max(1e-9, totalFeatureWeight);
    const matches = [];
    const stride = 1;

    for (let j = 14; j <= jMax; j += stride) {
      const originIndex = j + effL - 1;
      const futureStart = j + effL;
      const futureEndRef = futureStart + refH;
      // Strict causality against canonical reference horizon
      if (futureEndRef > T - effL - refEmbargo) continue;

      const pastAtr = Math.max(1e-8, series.atr14[originIndex]);
      const invPastAtr = 1 / pastAtr;
      const pastAtrPct = Math.max(1e-6, series.atrPct[originIndex]);
      const pastVolRatio = series.volRatio[originIndex] || 1.0;
      const candBaseClose = series.closes[j];

      let distSq = 0;
      let upCount = 0;
      for (let i = 0; i < effL; i++) {
        const idx = j + i;
        const cClose = series.closes[idx];
        const retNorm = (cClose - candBaseClose) * invPastAtr;
        const bRatio = series.bodyRatio[idx];
        const rNorm = clamp(series.barRange[idx] * invPastAtr, 0, 4) * 0.45;
        if (i > 0 && cClose >= series.closes[idx - 1]) upCount++;

        const d0 = currRetNorm[i] - retNorm;
        const d1 = currBody[i] - bRatio;
        const d2 = currRangeNorm[i] - rNorm;
        distSq += wClose[i] * d0 * d0 + wBody[i] * d1 * d1 + wRange[i] * d2 * d2;
      }

      const shapeDist = Math.sqrt(distSq * invTotalWeight);
      const volRegimeDist = Math.abs(Math.log(clamp(currentVolRatio / pastVolRatio, 0.25, 4.0)));
      const candOriginClose = series.closes[originIndex];
      const candSlopeNorm = (candOriginClose - candBaseClose) / (pastAtr * sqrtLen);
      const candUpFrac = upCount / Math.max(1, effL - 1);
      const slopeDist = Math.abs(currSlopeNorm - candSlopeNorm);
      const upFracDist = Math.abs(currUpFrac - candUpFrac);

      // Causal enrichment distances (Decision 4 + Decision 2 Multi-Scale Macro)
      const trendDist =
        0.50 * Math.abs(currEma20D - series.ema20Dist[originIndex]) +
        0.30 * Math.abs(currEma50D - series.ema50Dist[originIndex]) +
        0.35 * Math.abs(currEmaSl - series.emaSlope[originIndex]);

      const srDist =
        0.45 * Math.abs(currResD - series.resDistAtr[originIndex]) +
        0.45 * Math.abs(currSupD - series.supDistAtr[originIndex]) +
        0.60 * Math.abs(currSrPos - series.srPos[originIndex]);

      const macroDist =
        0.50 * Math.abs(currMacroD - series.macroEmaDist[originIndex]) +
        0.50 * Math.abs(currMacroSl - series.macroSlope[originIndex]);

      const sessionDist =
        sessionWeight > 0
          ? Math.hypot(currSessSin - series.sessionSin[originIndex], currSessCos - series.sessionCos[originIndex])
          : 0;

      const distance =
        shapeDist +
        0.45 * volRegimeDist +
        0.35 * slopeDist +
        0.20 * upFracDist +
        0.28 * trendDist +
        0.22 * srDist +
        0.35 * macroDist +
        sessionWeight * sessionDist;

      const volScale = clamp(currentAtrPct / pastAtrPct, 0.55, 1.85);

      matches.push({
        originIndex,
        futureStart,
        futureEndIndex: futureStart + H - 1,
        futureEndRefIndex: futureEndRef - 1,
        distance,
        shapeDist,
        volRegimeDist,
        trendDist,
        srDist,
        macroDist,
        sessionDist,
        pastAtr,
        pastAtrPct,
        volScale,
      });
    }

    matches.sort((a, b) => a.distance - b.distance || a.originIndex - b.originIndex);

    // Non-Maximum Suppression (de-clustering)
    const targetMinSep = Math.max(3, Math.floor(effL / 3));
    const selectWithMinSep = (minSep) => {
      const selected = [];
      for (const cand of matches) {
        let tooClose = false;
        for (const chosen of selected) {
          if (Math.abs(cand.originIndex - chosen.originIndex) < minSep) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) {
          selected.push(cand);
          if (selected.length >= this.topKAnalogs) break;
        }
      }
      return selected;
    };

    let usedMinSep = targetMinSep;
    let topAnalogs = selectWithMinSep(targetMinSep);
    if (topAnalogs.length < 6 && matches.length >= 6) {
      for (const fallbackSep of [Math.max(2, Math.floor(targetMinSep / 2)), 2, 1]) {
        const retry = selectWithMinSep(fallbackSep);
        if (retry.length >= 6) {
          topAnalogs = retry;
          usedMinSep = fallbackSep;
          break;
        }
      }
    }

    if (topAnalogs.length < 6) {
      return {
        status: 'INSUFFICIENT_EVIDENCE',
        reason: `Only ${topAnalogs.length} causal historical analogs found (minimum 6 required, no synthetic profiles permitted)`,
        analogs: topAnalogs,
        jMax,
        embargoGap: refEmbargo,
        referenceHorizon: refH,
        windowLength: effL,
        minSeparationBars: usedMinSep,
        declusteredCount: topAnalogs.length,
        stride: 1,
      };
    }

    // Kernel distance weights
    const minDist = topAnalogs[0].distance;
    const medDist = median(topAnalogs.map((a) => a.distance));
    const tau = Math.max(0.15, (medDist - minDist) * 0.85 + medDist * 0.25);
    let wSum = 0;
    for (const a of topAnalogs) {
      const rawW = Math.exp(-Math.max(0, a.distance - minDist) / tau);
      a.weight = rawW;
      wSum += rawW;
    }
    let wSqSum = 0;
    for (const a of topAnalogs) {
      a.weight = wSum > 0 ? a.weight / wSum : 1 / topAnalogs.length;
      wSqSum += a.weight * a.weight;
    }

    // Materialize full refH future return curves ONLY for the <=25 selected declustered analogs
    const extractH = Math.max(H, refH);
    for (const a of topAnalogs) {
      const originClose = series.closes[a.originIndex];
      const rawArr = new Array(extractH);
      const scaledArr = new Array(extractH);
      const maxSteps = Math.min(extractH, T - a.futureStart);
      for (let h = 0; h < maxSteps; h++) {
        const fc = series.closes[a.futureStart + h];
        const rawR = Math.log(fc / originClose);
        rawArr[h] = rawR;
        scaledArr[h] = rawR * a.volScale;
      }
      a.rawFutureLogReturns = rawArr;
      a.futureLogReturns = scaledArr;
    }

    const effectiveSampleWeight = wSqSum > 0 ? 1 / wSqSum : topAnalogs.length;
    const avgVolScale = topAnalogs.reduce((acc, a) => acc + a.weight * a.volScale, 0);

    return {
      status: 'READY',
      reason: `Matched ${topAnalogs.length} declustered causal analogs (Rev 2.3 stride=1, minSep=${usedMinSep}, effN=${effectiveSampleWeight.toFixed(1)}, volScale=${avgVolScale.toFixed(2)}, jMax=${jMax}, refH=${refH}, embargo=${refEmbargo})`,
      analogs: topAnalogs,
      jMax,
      embargoGap: refEmbargo,
      referenceHorizon: refH,
      windowLength: effL,
      minSeparationBars: usedMinSep,
      declusteredCount: topAnalogs.length,
      effectiveSampleWeight: Number(effectiveSampleWeight.toFixed(2)),
      avgVolScale: Number(avgVolScale.toFixed(3)),
      medianDistance: Number(medDist.toFixed(4)),
      stride: 1,
    };
  }

  _selectPathWiseMedoid(subset, horizon) {
    if (!Array.isArray(subset) || subset.length === 0) return null;
    if (subset.length === 1) return subset[0];
    let best = subset[0];
    let bestLoss = Infinity;
    for (let i = 0; i < subset.length; i++) {
      const a = subset[i];
      let loss = 0;
      for (let j = 0; j < subset.length; j++) {
        if (i === j) continue;
        const b = subset[j];
        const w = Math.max(1e-6, Number(b.weight || 1 / subset.length));
        let pathDiffSq = 0;
        for (let h = 0; h < horizon; h++) {
          const d = (a.futureLogReturns[h] || 0) - (b.futureLogReturns[h] || 0);
          pathDiffSq += d * d;
        }
        loss += w * (pathDiffSq / Math.max(1, horizon));
      }
      loss += 0.02 * Number(a.distance || 0) * 1e-4;
      if (loss < bestLoss) {
        bestLoss = loss;
        best = a;
      }
    }
    return best;
  }

  _buildQuantilePointFromReturnSamples(analogs, returnExtractor, lastClose, effN) {
    const spreadPad = clamp(Math.sqrt((effN + 1) / Math.max(2, effN - 1)), 1.0, 1.15);
    const pairs = analogs.map((a) => ({
      value: Number(returnExtractor(a) || 0),
      weight: a.weight,
    }));
    const r50 = weightedQuantile(pairs, 0.50);
    const r10 = r50 + (weightedQuantile(pairs, 0.10) - r50) * spreadPad;
    const r25 = r50 + (weightedQuantile(pairs, 0.25) - r50) * spreadPad;
    const r75 = r50 + (weightedQuantile(pairs, 0.75) - r50) * spreadPad;
    const r90 = r50 + (weightedQuantile(pairs, 0.90) - r50) * spreadPad;
    return enforceMonotonicQuantiles(
      {
        q10: lastClose * Math.exp(r10),
        q25: lastClose * Math.exp(r25),
        q50: lastClose * Math.exp(r50),
        q75: lastClose * Math.exp(r75),
        q90: lastClose * Math.exp(r90),
      },
      lastClose * 0.01
    );
  }

  _reconcileWithHigherClusterAnchor(rawReturns5Q, lastClose, higherAnchorPoints, blockRatio, boundaryOffset = 0, blendAlpha = 0.85) {
    const refLen = rawReturns5Q.length;
    if (!Array.isArray(higherAnchorPoints) || higherAnchorPoints.length === 0 || blockRatio < 2) {
      return rawReturns5Q;
    }
    const out = new Array(refLen);
    // Track cumulative reconciled return at previous block end
    let prevTarget50 = 0;
    let prevRaw50 = 0;
    let prevBlockIdx = -1;

    for (let s = 0; s < refLen; s++) {
      // Which higher-TF block step does LTF index s belong to?
      const shiftedPos = s + boundaryOffset;
      const bIdx = Math.floor(shiftedPos / blockRatio);
      const posInBlock = (shiftedPos % blockRatio) + 1; // 1 .. blockRatio
      const blockEndIdx = (bIdx + 1) * blockRatio - 1 - boundaryOffset;

      if (bIdx !== prevBlockIdx) {
        prevTarget50 = s > 0 ? out[s - 1].r50 : 0;
        prevRaw50 = s > 0 ? rawReturns5Q[s - 1].r50 : 0;
        prevBlockIdx = bIdx;
      }

      const raw = rawReturns5Q[s];
      const anchorPt = higherAnchorPoints[bIdx];
      if (!anchorPt || !(anchorPt.q50 > 0) || blockEndIdx >= refLen) {
        // Beyond covered anchor horizon: preserve natural raw increments anchored smoothly to previous step
        const inc50 = raw.r50 - prevRaw50;
        const nextR50 = prevTarget50 + inc50;
        const shift = nextR50 - raw.r50;
        out[s] = {
          r10: raw.r10 + shift,
          r25: raw.r25 + shift,
          r50: nextR50,
          r75: raw.r75 + shift,
          r90: raw.r90 + shift,
        };
        continue;
      }

      const targetEnd50 = Math.log(anchorPt.q50 / lastClose);
      const rawEnd50 = rawReturns5Q[blockEndIdx].r50;
      const anchorDelta50 = targetEnd50 - prevTarget50;
      const rawDelta50 = rawEnd50 - prevRaw50;
      const gap50 = anchorDelta50 - rawDelta50;

      const rawIntraInc = raw.r50 - prevRaw50;
      const prog = clamp(posInBlock / blockRatio, 0, 1);
      const rec50 = prevTarget50 + rawIntraInc + blendAlpha * prog * gap50;
      const delta50 = rec50 - raw.r50;

      // Gently reconcile outer spread width at boundaries while preserving local quantile structure
      const rawHalfLo = Math.max(1e-6, raw.r50 - raw.r10);
      const rawHalfHi = Math.max(1e-6, raw.r90 - raw.r50);
      const anchorHalfLo = Math.max(1e-6, Math.log(anchorPt.q50 / Math.max(1e-8, anchorPt.q10)));
      const anchorHalfHi = Math.max(1e-6, Math.log(Math.max(1e-8, anchorPt.q90) / anchorPt.q50));
      const scaleLo = 1 + blendAlpha * 0.35 * prog * (clamp(anchorHalfLo / rawHalfLo, 0.7, 1.45) - 1);
      const scaleHi = 1 + blendAlpha * 0.35 * prog * (clamp(anchorHalfHi / rawHalfHi, 0.7, 1.45) - 1);

      out[s] = {
        r10: rec50 - (raw.r50 - raw.r10) * scaleLo,
        r25: rec50 - (raw.r50 - raw.r25) * scaleLo,
        r50: rec50,
        r75: rec50 + (raw.r75 - raw.r50) * scaleHi,
        r90: rec50 + (raw.r90 - raw.r50) * scaleHi,
      };
      void delta50;
    }
    return out;
  }

  /**
   * Produces kernel-weighted empirical quantile trajectory + path-wise medoid representative closes
   * with Rev 2.3 Hybrid Two-Cluster MTF Reconciliation & strict Horizon Prefix-Invariance.
   */
  projectEmpirical(candles, features, horizonBars, futureTimestamps = [], mtfOptions = {}) {
    const H = clampHorizonBars(horizonBars);
    const lastClose = Number(features?.lastClose || candles?.[candles.length - 1]?.close || 0);
    const cluster = resolveClusterInfo(this.timeframe);
    const ltf = String(mtfOptions.lowerTimeframe || '').trim().toUpperCase();
    const ltfCandles = Array.isArray(mtfOptions.lowerCandles) ? mtfOptions.lowerCandles : [];
    const htf = String(mtfOptions.higherTimeframe || '').trim().toUpperCase();
    const htfCandles = Array.isArray(mtfOptions.higherCandles) ? mtfOptions.higherCandles : [];

    // CLUSTER LOWER-ANCHOR AGGREGATION MODE:
    //   - H4 anchored by co-dated H1 (4:1 ratio -> up to 15 H4 bars = 60 H1 bars)
    //   - W1 anchored by co-dated D1 (5:1 ratio -> up to 12 W1 bars = 60 D1 bars)
    const lowerPairRatio =
      this.timeframe === 'H4' && ltf === 'H1'
        ? 4
        : this.timeframe === 'W1' && ltf === 'D1'
          ? 5
          : 0;

    if (lowerPairRatio > 0 && ltfCandles.length >= 138 && Array.isArray(candles) && candles.length >= 24) {
      const targetLastOpen = extractOpenMs(candles[candles.length - 1]);
      const targetStep = stepMsForTf(this.timeframe);
      const targetAnchorCloseMs = targetLastOpen > 0 ? targetLastOpen + targetStep : 0;
      const alignedLtf = targetAnchorCloseMs > 0 ? buildCoDatedLowerSlices(ltfCandles, targetAnchorCloseMs) : ltfCandles;
      const ltfLastClose = Number(alignedLtf[alignedLtf.length - 1]?.close || 0);
      const closeDiffPct = lastClose > 0 && ltfLastClose > 0 ? Math.abs(ltfLastClose - lastClose) / lastClose : 1;

      if (alignedLtf.length >= 138 && closeDiffPct <= 0.015) {
        const ltfEngine = new EmpiricalAnalogEngine(this.windowSize, CANONICAL_ANALOG_HORIZON, ltf);
        const ltfAtr = ltfEngine.calculateATR(alignedLtf, 14);
        const ltfSearch = ltfEngine.findCausalAnalogs(alignedLtf, CANONICAL_ANALOG_HORIZON, ltfAtr, {
          higherTimeframe: this.timeframe,
          higherCandles: candles,
        });

        const maxCoveredHtfBars = Math.floor(CANONICAL_ANALOG_HORIZON / lowerPairRatio); // 15 on H4, 12 on W1
        if (ltfSearch.status === 'READY' && ltfSearch.analogs.length >= 6) {
          const ltfAnalogs = ltfSearch.analogs;
          const coveredSteps = Math.min(H, maxCoveredHtfBars);
          const points = new Array(H);

          for (let k = 0; k < coveredSteps; k++) {
            const ltfStepIdx = (k + 1) * lowerPairRatio - 1;
            const mq = this._buildQuantilePointFromReturnSamples(
              ltfAnalogs,
              (a) => a.futureLogReturns[ltfStepIdx] || 0,
              lastClose,
              ltfSearch.effectiveSampleWeight
            );
            points[k] = {
              stepAhead: k + 1,
              openTimeUtcMs: futureTimestamps[k] || 0,
              ...mq,
              upperBand: mq.q90,
              lowerBand: mq.q10,
              pctChangeFromLast: ((mq.q50 - lastClose) / lastClose) * 100,
            };
          }

          // If user requests H > maxCoveredHtfBars (e.g. H4 x 30), seamlessly extend beyond step 15 via H4 engine
          let usedExtension = false;
          if (H > coveredSteps) {
            const ownSearch = this.findCausalAnalogs(candles, H, features?.atr14, {
              higherTimeframe: htf,
              higherCandles: htfCandles,
            });
            if (ownSearch.status !== 'READY') {
              // Fall back cleanly: extrapolate dispersion gently only if ownSearch has insufficient data
              const lastCov = points[coveredSteps - 1];
              const lastR50 = Math.log(lastCov.q50 / lastClose);
              const loSpread = Math.max(1e-4, Math.log(lastCov.q50 / lastCov.q10));
              const hiSpread = Math.max(1e-4, Math.log(lastCov.q90 / lastCov.q50));
              for (let k = coveredSteps; k < H; k++) {
                const ratio = Math.sqrt((k + 1) / coveredSteps);
                const mq = enforceMonotonicQuantiles(
                  {
                    q10: lastClose * Math.exp(lastR50 - loSpread * ratio),
                    q25: lastClose * Math.exp(lastR50 - loSpread * 0.526 * ratio),
                    q50: lastClose * Math.exp(lastR50),
                    q75: lastClose * Math.exp(lastR50 + hiSpread * 0.526 * ratio),
                    q90: lastClose * Math.exp(lastR50 + hiSpread * ratio),
                  },
                  lastClose * 0.01
                );
                points[k] = {
                  stepAhead: k + 1,
                  openTimeUtcMs: futureTimestamps[k] || 0,
                  ...mq,
                  upperBand: mq.q90,
                  lowerBand: mq.q10,
                  pctChangeFromLast: ((mq.q50 - lastClose) / lastClose) * 100,
                };
              }
            } else {
              usedExtension = true;
              const seamIdx = coveredSteps - 1;
              const targetSeam50 = Math.log(points[seamIdx].q50 / lastClose);
              const ownAtSeam = this._buildQuantilePointFromReturnSamples(
                ownSearch.analogs,
                (a) => a.futureLogReturns[seamIdx] || 0,
                lastClose,
                ownSearch.effectiveSampleWeight
              );
              const ownSeam50 = Math.log(ownAtSeam.q50 / lastClose);
              const seamOffset = targetSeam50 - ownSeam50;
              for (let k = coveredSteps; k < H; k++) {
                const rawMq = this._buildQuantilePointFromReturnSamples(
                  ownSearch.analogs,
                  (a) => a.futureLogReturns[k] || 0,
                  lastClose,
                  ownSearch.effectiveSampleWeight
                );
                const adjScale = Math.exp(seamOffset);
                const mq = enforceMonotonicQuantiles(
                  {
                    q10: rawMq.q10 * adjScale,
                    q25: rawMq.q25 * adjScale,
                    q50: rawMq.q50 * adjScale,
                    q75: rawMq.q75 * adjScale,
                    q90: rawMq.q90 * adjScale,
                  },
                  lastClose * 0.01
                );
                points[k] = {
                  stepAhead: k + 1,
                  openTimeUtcMs: futureTimestamps[k] || 0,
                  ...mq,
                  upperBand: mq.q90,
                  lowerBand: mq.q10,
                  pctChangeFromLast: ((mq.q50 - lastClose) / lastClose) * 100,
                };
              }
            }
          }

          // Representative curves built at corresponding block boundaries
          const aggAnalogs = ltfAnalogs.map((a) => ({
            ...a,
            futureLogReturns: Array.from({ length: coveredSteps }, (_, k) => a.futureLogReturns[(k + 1) * lowerPairRatio - 1] || 0),
          }));
          const bullAn = aggAnalogs.filter((a) => a.futureLogReturns[coveredSteps - 1] > 0);
          const bearAn = aggAnalogs.filter((a) => a.futureLogReturns[coveredSteps - 1] < 0);
          const buildAggRep = (id, label, subset) => {
            const medoid = this._selectPathWiseMedoid(subset, coveredSteps);
            if (!medoid) return null;
            const tailClose = lastClose * Math.exp(medoid.futureLogReturns[coveredSteps - 1] || 0);
            const closesOut = Array.from({ length: H }, (_, k) =>
              roundToSignificant(
                k < coveredSteps ? lastClose * Math.exp(medoid.futureLogReturns[k] || 0) : tailClose,
                10
              )
            );
            return {
              id,
              label,
              isIllustrativeOnly: true,
              originIndex: medoid.originIndex,
              distance: Number(medoid.distance.toFixed(4)),
              weight: Number((medoid.weight || 0).toFixed(4)),
              volScale: Number((medoid.volScale || 1).toFixed(3)),
              closes: closesOut,
            };
          };

          const representativePaths = [
            buildAggRep('ANALOG_UPPER', 'Empirical Upper Analog Medoid (Illustrative Only)', bullAn),
            buildAggRep('ANALOG_CENTER', 'Empirical Central Path-Wise Medoid (Illustrative Only)', aggAnalogs),
            buildAggRep('ANALOG_LOWER', 'Empirical Lower Analog Medoid (Illustrative Only)', bearAn),
          ].filter(Boolean);

          return {
            status: MODEL_EXECUTION_STATUS.SUCCESS,
            reason: `${ltf}->${this.timeframe} co-dated cluster aggregation (${ltfSearch.declusteredCount} ${ltf} analogs, ratio=${lowerPairRatio}:1, covered=${coveredSteps}/${H}${usedExtension ? '+ext' : ''})`,
            jMax: ltfSearch.jMax,
            embargoGap: ltfSearch.embargoGap,
            referenceHorizon: ltfSearch.referenceHorizon,
            matchedCount: ltfSearch.analogs.length,
            declusteredCount: ltfSearch.declusteredCount,
            minSeparationBars: ltfSearch.minSeparationBars,
            effectiveSampleWeight: ltfSearch.effectiveSampleWeight,
            avgVolScale: ltfSearch.avgVolScale,
            medianDistance: ltfSearch.medianDistance,
            mtfMeta: {
              clusterId: cluster.clusterId,
              anchorTimeframe: ltf,
              mode: 'LOWER_TF_AGGREGATED',
              reconciled: true,
              blockSizeBars: lowerPairRatio,
              anchorHorizonCoveredBars: coveredSteps,
              featureSet: 'REV23_CAUSAL_ENRICHED',
            },
            points,
            representativePaths,
          };
        }
      }
    }

    // STANDARD CAUSAL ENRICHED SEARCH (with optional Cluster Higher-Anchor Block Reconciliation)
    const search = this.findCausalAnalogs(candles, H, features?.atr14, {
      higherTimeframe: htf,
      higherCandles: htfCandles,
    });

    if (search.status !== 'READY') {
      return {
        status: MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA,
        reason: search.reason,
        jMax: search.jMax,
        embargoGap: search.embargoGap,
        referenceHorizon: search.referenceHorizon || CANONICAL_ANALOG_HORIZON,
        matchedCount: search.analogs.length,
        declusteredCount: search.declusteredCount || 0,
        minSeparationBars: search.minSeparationBars || 0,
        mtfMeta: {
          clusterId: cluster.clusterId,
          anchorTimeframe: this.timeframe,
          mode: 'INSUFFICIENT_EVIDENCE',
          reconciled: false,
          blockSizeBars: 1,
          anchorHorizonCoveredBars: 0,
          featureSet: 'REV23_CAUSAL_ENRICHED',
        },
        points: [],
        representativePaths: [],
      };
    }

    const analogs = search.analogs;
    const refComputeLen = Math.max(H, Math.min(CANONICAL_ANALOG_HORIZON, analogs[0]?.futureLogReturns?.length || H));
    const spreadPad = clamp(Math.sqrt((search.effectiveSampleWeight + 1) / Math.max(2, search.effectiveSampleWeight - 1)), 1.0, 1.15);

    const rawReturns5Q = new Array(refComputeLen);
    for (let h = 0; h < refComputeLen; h++) {
      const pairs = analogs.map((a) => ({
        value: a.futureLogReturns[h] || 0,
        weight: a.weight,
      }));
      const r50 = weightedQuantile(pairs, 0.50);
      rawReturns5Q[h] = {
        r10: r50 + (weightedQuantile(pairs, 0.10) - r50) * spreadPad,
        r25: r50 + (weightedQuantile(pairs, 0.25) - r50) * spreadPad,
        r50,
        r75: r50 + (weightedQuantile(pairs, 0.75) - r50) * spreadPad,
        r90: r50 + (weightedQuantile(pairs, 0.90) - r50) * spreadPad,
      };
    }

    // Optional Cluster Higher-Anchor Block Reconciliation (M15/M30 -> H1, D1 -> W1? No, D1 IS Cluster B anchor; H4 -> D1 when H1 missing)
    const reconcileRatio =
      this.timeframe === 'M15' && htf === 'H1'
        ? 4
        : this.timeframe === 'M30' && htf === 'H1'
          ? 2
          : this.timeframe === 'H4' && htf === 'D1'
            ? 6
            : 0;
    const blendAlpha = this.timeframe === 'H4' ? 0.55 : 0.85;

    let finalReturns5Q = rawReturns5Q;
    let mtfMode = htfCandles.length >= 16 ? 'ANCHOR_MULTISCALE' : 'STANDALONE_MULTISCALE';
    let reconciled = false;
    let anchorHorizonCoveredBars = 0;

    if (reconcileRatio > 0 && htfCandles.length >= 138 && mtfOptions.disableAnchorReconciliation !== true) {
      const ltfLastOpenMs = extractOpenMs(candles[candles.length - 1]);
      const htfLastOpenMs = extractOpenMs(htfCandles[htfCandles.length - 1]);
      const ltfStepMs = stepMsForTf(this.timeframe);
      const htfStepMs = stepMsForTf(htf);
      const ltfCloseMs = ltfLastOpenMs > 0 ? ltfLastOpenMs + ltfStepMs : 0;
      const htfCloseMs = htfLastOpenMs > 0 ? htfLastOpenMs + htfStepMs : 0;
      const htfLastClose = Number(htfCandles[htfCandles.length - 1]?.close || 0);
      const closeDiff = lastClose > 0 && htfLastClose > 0 ? Math.abs(htfLastClose - lastClose) / lastClose : 1;

      if (closeDiff <= 0.02 && (ltfCloseMs === 0 || htfCloseMs === 0 || Math.abs(ltfCloseMs - htfCloseMs) < htfStepMs)) {
        const htfTargetBars = Math.min(CANONICAL_ANALOG_HORIZON, Math.ceil(refComputeLen / reconcileRatio) + 1);
        const htfEngine = new EmpiricalAnalogEngine(this.windowSize, htfTargetBars, htf);
        const htfAtr = htfEngine.calculateATR(htfCandles, 14);
        const htfProj = htfEngine.projectEmpirical(
          htfCandles,
          { lastClose: htfLastClose || lastClose, atr14: htfAtr },
          Math.max(10, htfTargetBars),
          [],
          { disableAnchorReconciliation: true }
        );
        if (htfProj.status === MODEL_EXECUTION_STATUS.SUCCESS && htfProj.points.length > 0) {
          let boundaryOffset = 0;
          if (ltfCloseMs > 0 && htfCloseMs > 0 && ltfCloseMs > htfCloseMs) {
            boundaryOffset = clamp(Math.round((ltfCloseMs - htfCloseMs) / ltfStepMs), 0, reconcileRatio - 1);
          }
          finalReturns5Q = this._reconcileWithHigherClusterAnchor(
            rawReturns5Q,
            lastClose,
            htfProj.points,
            reconcileRatio,
            boundaryOffset,
            blendAlpha
          );
          mtfMode = 'BLOCK_RECONCILED';
          reconciled = true;
          anchorHorizonCoveredBars = Math.min(H, htfProj.points.length * reconcileRatio - boundaryOffset);
        }
      }
    }

    const points = new Array(H);
    for (let h = 0; h < H; h++) {
      const r = finalReturns5Q[h];
      const mq = enforceMonotonicQuantiles(
        {
          q10: lastClose * Math.exp(r.r10),
          q25: lastClose * Math.exp(r.r25),
          q50: lastClose * Math.exp(r.r50),
          q75: lastClose * Math.exp(r.r75),
          q90: lastClose * Math.exp(r.r90),
        },
        lastClose * 0.01
      );
      points[h] = {
        stepAhead: h + 1,
        openTimeUtcMs: futureTimestamps[h] || 0,
        ...mq,
        upperBand: mq.q90,
        lowerBand: mq.q10,
        pctChangeFromLast: ((mq.q50 - lastClose) / lastClose) * 100,
      };
    }

    const bullAn = analogs.filter((a) => (a.futureLogReturns[H - 1] || 0) > 0);
    const bearAn = analogs.filter((a) => (a.futureLogReturns[H - 1] || 0) < 0);

    const buildRep = (id, label, subset) => {
      const medoid = this._selectPathWiseMedoid(subset, H);
      if (!medoid) return null;
      return {
        id,
        label,
        isIllustrativeOnly: true,
        originIndex: medoid.originIndex,
        distance: Number(medoid.distance.toFixed(4)),
        weight: Number((medoid.weight || 0).toFixed(4)),
        volScale: Number((medoid.volScale || 1).toFixed(3)),
        closes: medoid.futureLogReturns.slice(0, H).map((r) => roundToSignificant(lastClose * Math.exp(r || 0), 10)),
      };
    };

    const representativePaths = [
      buildRep('ANALOG_UPPER', 'Empirical Upper Analog Medoid (Illustrative Only)', bullAn),
      buildRep('ANALOG_CENTER', 'Empirical Central Path-Wise Medoid (Illustrative Only)', analogs),
      buildRep('ANALOG_LOWER', 'Empirical Lower Analog Medoid (Illustrative Only)', bearAn),
    ].filter(Boolean);

    return {
      status: MODEL_EXECUTION_STATUS.SUCCESS,
      reason: search.reason,
      jMax: search.jMax,
      embargoGap: search.embargoGap,
      referenceHorizon: search.referenceHorizon,
      matchedCount: analogs.length,
      declusteredCount: search.declusteredCount,
      minSeparationBars: search.minSeparationBars,
      effectiveSampleWeight: search.effectiveSampleWeight,
      avgVolScale: search.avgVolScale,
      medianDistance: search.medianDistance,
      mtfMeta: {
        clusterId: cluster.clusterId,
        anchorTimeframe: reconciled ? htf : this.timeframe,
        mode: mtfMode,
        reconciled,
        blockSizeBars: reconciled ? reconcileRatio : 1,
        anchorHorizonCoveredBars,
        featureSet: 'REV23_CAUSAL_ENRICHED',
      },
      points,
      representativePaths,
    };
  }
}

export const SMCPredictionEngine = EmpiricalAnalogEngine;
