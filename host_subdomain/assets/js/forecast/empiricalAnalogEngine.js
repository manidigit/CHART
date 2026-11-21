import {
  MODEL_EXECUTION_STATUS,
  clampHorizonBars,
  enforceMonotonicQuantiles,
  roundToSignificant,
} from './forecastContract.js?v=1.47.41';

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

/**
 * Rev 2.2 Strictly Causal Empirical Analog Engine.
 * Zero synthetic wave templates, zero fabricated volumes, zero artificial rejection wicks.
 * Strictly respects j_max = T - L_curr - L_analog - H - G_embargo so no analog future overlaps current window or embargo gap.
 *
 * Package 2 upgrades:
 *  - Multi-feature similarity (normalized close path, body ratio, relative range, volatility-regime ratio, trend slope & up-fraction)
 *  - Non-maximum suppression (de-clustering) to prevent overlapping shifted duplicates of one historical episode
 *  - Volatility-scaled future returns matched to current ATR% regime
 *  - Distance-kernel weighted quantiles instead of flat unweighted percentiles
 *  - True path-wise weighted medoid selection for representative curves
 */
export class EmpiricalAnalogEngine {
  constructor(windowSize = 24, horizon = 20, timeframe = 'M15') {
    this.windowSize = Math.max(12, Math.min(48, Number(windowSize || 24)));
    this.horizon = clampHorizonBars(horizon);
    this.timeframe = String(timeframe || 'M15').trim().toUpperCase();
    this.topKAnalogs = 25;
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
   * O(T) precomputation of rolling 14-bar ATR, 60-bar baseline ATR, and ATR% for fast, leakage-free lookups.
   */
  _precomputeRollingAtr(candles) {
    const n = candles.length;
    const tr = new Float64Array(n);
    const atr14 = new Float64Array(n);
    const atr60 = new Float64Array(n);
    const atrPct = new Float64Array(n);
    const volRatio = new Float64Array(n);

    let sum14 = 0;
    let sum60 = 0;
    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const hi = Number(c.high);
      const lo = Number(c.low);
      const cl = Math.max(1e-8, Number(c.close));
      const prevCl = i > 0 ? Number(candles[i - 1].close) : cl;
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
    }
    return { atr14, atr60, atrPct, volRatio };
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
   * Strictly Causal Analog Search:
   *   j_max = T - L_curr - L_analog - H - G_embargo
   * Returns honest INSUFFICIENT_EVIDENCE when history < j_max threshold or empirical matches < 6.
   */
  findCausalAnalogs(candles, horizonBars, currentAtr) {
    const T = Array.isArray(candles) ? candles.length : 0;
    const H = Math.max(10, Math.round(horizonBars || this.horizon));
    const effL = Math.min(this.windowSize, Math.max(12, Math.floor(T * 0.15)));
    const embargo = Math.max(5, Math.ceil(0.25 * H));
    const jMax = T - effL - effL - H - embargo;

    if (jMax < 15) {
      return {
        status: 'INSUFFICIENT_EVIDENCE',
        reason: `Insufficient non-overlapping history for causal analog search (jMax=${jMax} < 15 at H=${H}, embargo=${embargo})`,
        analogs: [],
        jMax,
        embargoGap: embargo,
        windowLength: effL,
        minSeparationBars: 0,
        declusteredCount: 0,
      };
    }

    const rolling = this._precomputeRollingAtr(candles);
    const currEndIdx = T - 1;
    const currStartIdx = T - effL;
    const effCurrentAtr = Math.max(1e-8, Number(currentAtr || rolling.atr14[currEndIdx] || 1e-4));
    const currClose = Math.max(1e-8, Number(candles[currEndIdx]?.close || 1));
    const currentAtrPct = effCurrentAtr / currClose;
    const currentVolRatio = rolling.volRatio[currEndIdx] || 1.0;

    const currentWindow = candles.slice(currStartIdx);
    const currentVec = this.extractNormalizedShape(currentWindow, effCurrentAtr);
    const currDesc = this._extractWindowDescriptor(candles, currStartIdx, effL, effCurrentAtr);

    // Recency weights per bar step (3 features per bar)
    const featureWeights = new Float64Array(currentVec.length);
    let totalFeatureWeight = 0;
    for (let i = 0; i < effL; i++) {
      const tNorm = i / Math.max(1, effL - 1);
      const recency = 0.75 + 0.90 * tNorm * tNorm;
      const base = i * 3;
      featureWeights[base] = recency * 1.15;     // close path
      featureWeights[base + 1] = recency * 0.55; // candle body ratio
      featureWeights[base + 2] = recency * 0.45; // bar range expansion
      totalFeatureWeight += featureWeights[base] + featureWeights[base + 1] + featureWeights[base + 2];
    }

    const matches = [];
    const stride = jMax > 350 ? Math.max(1, Math.floor(jMax / 300)) : 1;

    for (let j = 14; j <= jMax; j += stride) {
      const originIndex = j + effL - 1;
      const futureStart = j + effL;
      const futureEnd = futureStart + H;
      // Double-check strict causality: candidate future ends BEFORE current window starts minus embargo
      if (futureEnd > T - effL - embargo) continue;

      const pastAtr = Math.max(1e-8, rolling.atr14[originIndex]);
      const pastAtrPct = Math.max(1e-6, rolling.atrPct[originIndex]);
      const pastVolRatio = rolling.volRatio[originIndex] || 1.0;

      const candidateWin = candles.slice(j, j + effL);
      const candVec = this.extractNormalizedShape(candidateWin, pastAtr);
      const candDesc = this._extractWindowDescriptor(candles, j, effL, pastAtr);

      let distSq = 0;
      for (let k = 0; k < currentVec.length; k++) {
        const d = currentVec[k] - (candVec[k] || 0);
        distSq += featureWeights[k] * d * d;
      }
      const shapeDist = Math.sqrt(distSq / Math.max(1e-9, totalFeatureWeight));
      const volRegimeDist = Math.abs(Math.log(clamp(currentVolRatio / pastVolRatio, 0.25, 4.0)));
      const slopeDist = Math.abs(currDesc.slopeNorm - candDesc.slopeNorm);
      const upFracDist = Math.abs(currDesc.upFrac - candDesc.upFrac);

      const distance = shapeDist + 0.55 * volRegimeDist + 0.40 * slopeDist + 0.25 * upFracDist;
      const volScale = clamp(currentAtrPct / pastAtrPct, 0.55, 1.85);

      const originClose = Math.max(1e-8, Number(candidateWin[candidateWin.length - 1].close));
      const rawFutureLogReturns = new Array(H);
      const futureLogReturns = new Array(H);
      for (let h = 0; h < H; h++) {
        const fc = Math.max(1e-8, Number(candles[futureStart + h].close));
        const rawR = Math.log(fc / originClose);
        rawFutureLogReturns[h] = rawR;
        futureLogReturns[h] = rawR * volScale;
      }
      matches.push({
        originIndex,
        futureEndIndex: futureEnd - 1,
        distance,
        shapeDist,
        volRegimeDist,
        pastAtr,
        pastAtrPct,
        volScale,
        rawFutureLogReturns,
        futureLogReturns,
      });
    }

    matches.sort((a, b) => a.distance - b.distance);

    // Non-Maximum Suppression (de-clustering): prevent shifted duplicates of a single historical event from dominating topK
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
        embargoGap: embargo,
        windowLength: effL,
        minSeparationBars: usedMinSep,
        declusteredCount: topAnalogs.length,
      };
    }

    // Kernel distance weights: closer matches receive smoothly higher influence than distant ones
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

    const effectiveSampleWeight = wSqSum > 0 ? 1 / wSqSum : topAnalogs.length;
    const avgVolScale = topAnalogs.reduce((acc, a) => acc + a.weight * a.volScale, 0);

    return {
      status: 'READY',
      reason: `Matched ${topAnalogs.length} declustered causal analogs (minSep=${usedMinSep}, effN=${effectiveSampleWeight.toFixed(1)}, volScale=${avgVolScale.toFixed(2)}, jMax=${jMax}, embargo=${embargo})`,
      analogs: topAnalogs,
      jMax,
      embargoGap: embargo,
      windowLength: effL,
      minSeparationBars: usedMinSep,
      declusteredCount: topAnalogs.length,
      effectiveSampleWeight: Number(effectiveSampleWeight.toFixed(2)),
      avgVolScale: Number(avgVolScale.toFixed(3)),
      medianDistance: Number(medDist.toFixed(4)),
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
      // Small tie-breaker favoring closer similarity distance
      loss += 0.02 * Number(a.distance || 0) * 1e-4;
      if (loss < bestLoss) {
        bestLoss = loss;
        best = a;
      }
    }
    return best;
  }

  /**
   * Produces kernel-weighted empirical quantile trajectory + path-wise medoid representative closes from matched real analogs.
   */
  projectEmpirical(candles, features, horizonBars, futureTimestamps = []) {
    const H = clampHorizonBars(horizonBars);
    const lastClose = features.lastClose;
    const search = this.findCausalAnalogs(candles, H, features.atr14);

    if (search.status !== 'READY') {
      return {
        status: MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA,
        reason: search.reason,
        jMax: search.jMax,
        embargoGap: search.embargoGap,
        matchedCount: search.analogs.length,
        declusteredCount: search.declusteredCount || 0,
        minSeparationBars: search.minSeparationBars || 0,
        points: [],
        representativePaths: [],
      };
    }

    const analogs = search.analogs;
    const points = new Array(H);

    for (let h = 0; h < H; h++) {
      const pairs = analogs.map((a) => ({
        value: lastClose * Math.exp(a.futureLogReturns[h] || 0),
        weight: a.weight,
      }));
      const mq = enforceMonotonicQuantiles(
        {
          q10: weightedQuantile(pairs, 0.10),
          q25: weightedQuantile(pairs, 0.25),
          q50: weightedQuantile(pairs, 0.50),
          q75: weightedQuantile(pairs, 0.75),
          q90: weightedQuantile(pairs, 0.90),
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

    // Extract 3 empirical path-wise medoid representative close curves strictly tagged illustrative (zero synthetic OHLC wicks/volume)
    const bullAn = analogs.filter((a) => a.futureLogReturns[H - 1] > 0);
    const bearAn = analogs.filter((a) => a.futureLogReturns[H - 1] < 0);

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
        closes: medoid.futureLogReturns.map((r) => roundToSignificant(lastClose * Math.exp(r), 10)),
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
      matchedCount: analogs.length,
      declusteredCount: search.declusteredCount,
      minSeparationBars: search.minSeparationBars,
      effectiveSampleWeight: search.effectiveSampleWeight,
      avgVolScale: search.avgVolScale,
      medianDistance: search.medianDistance,
      points,
      representativePaths,
    };
  }
}

export const SMCPredictionEngine = EmpiricalAnalogEngine;
