import { PriceFormatter } from './priceFormatter.js?v=1.39.0';
import { TimeframeAggregator } from './timeframeAggregator.js?v=1.39.0';

export const TechnicalIndicators = {
  computeSma(candles = [], period = 20) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const out = new Array(candles.length).fill(null);
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
      sum += Number(candles[i].close || 0);
      if (i >= period) {
        sum -= Number(candles[i - period].close || 0);
      }
      if (i >= period - 1) {
        out[i] = sum / period;
      }
    }
    return out;
  },

  computeEma(candles = [], period = 50) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const out = new Array(candles.length).fill(null);
    const k = 2 / (period + 1);
    let ema = null;
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
      const c = Number(candles[i].close || 0);
      if (i < period) {
        sum += c;
        if (i === period - 1) {
          ema = sum / period;
          out[i] = ema;
        }
      } else if (ema !== null) {
        ema = c * k + ema * (1 - k);
        out[i] = ema;
      }
    }
    return out;
  },

  computeBollingerBands(candles = [], period = 20, stdMult = 2.0) {
    if (!Array.isArray(candles) || candles.length === 0 || period < 1) return [];
    const n = candles.length;
    const out = new Array(n).fill(null);
    let sum = 0;
    let sqSum = 0;
    for (let i = 0; i < n; i++) {
      const c = Number(candles[i].close || 0);
      sum += c;
      sqSum += c * c;
      if (i >= period) {
        const oldC = Number(candles[i - period].close || 0);
        sum -= oldC;
        sqSum -= oldC * oldC;
      }
      if (i >= period - 1) {
        const mean = sum / period;
        const variance = Math.max(0, sqSum / period - mean * mean);
        const std = Math.sqrt(variance);
        out[i] = {
          middle: mean,
          upper: mean + stdMult * std,
          lower: mean - stdMult * std,
        };
      }
    }
    return out;
  },

  /**
   * Session-Anchored / Rolling Volume-Weighted Average Price (VWAP).
   * Intraday resets strictly on instrument session-day change (PriceFormatter.getSessionDayKey);
   * D1/W1 uses a 20-bar rolling VWAP. Falls back to weight 1 when tick volume is zero.
   */
  computeVwap(candles = [], timeframe = 'M15', symbolCode = 'XAUUSD') {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n).fill(null);
    const tf = String(timeframe || 'M15').toUpperCase();

    if (tf === 'D1' || tf === 'W1') {
      const window = 20;
      for (let i = 0; i < n; i++) {
        const start = Math.max(0, i - window + 1);
        let sumPv = 0;
        let sumV = 0;
        for (let j = start; j <= i; j++) {
          const c = candles[j];
          const tp = (Number(c.high || 0) + Number(c.low || 0) + Number(c.close || 0)) / 3;
          const w = Math.max(1, Number(c.volume || 0));
          sumPv += tp * w;
          sumV += w;
        }
        const curr = candles[i];
        const fallbackTp = (Number(curr.high || 0) + Number(curr.low || 0) + Number(curr.close || 0)) / 3;
        out[i] = sumV > 0 ? sumPv / sumV : fallbackTp;
      }
      return out;
    }

    let cumPv = 0;
    let cumV = 0;
    let lastDayKey = null;

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const ms = Number(c.open_time_utc_ms || (c.openTimeSec ? c.openTimeSec * 1000 : 0));
      const dayKey = ms > 0 ? PriceFormatter.getSessionDayKey(ms, symbolCode) : `idx_${Math.floor(i / 24)}`;
      if (lastDayKey === null || dayKey !== lastDayKey) {
        cumPv = 0;
        cumV = 0;
        lastDayKey = dayKey;
      }
      const tp = (Number(c.high || 0) + Number(c.low || 0) + Number(c.close || 0)) / 3;
      const weight = Math.max(1, Number(c.volume || 0));
      cumPv += tp * weight;
      cumV += weight;
      out[i] = cumV > 0 ? cumPv / cumV : tp;
    }
    return out;
  },

  /**
   * Wilder's Average True Range (ATR 14).
   */
  computeAtr(candles = [], period = 14) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const tr = new Array(n).fill(0);
    const out = new Array(n).fill(null);

    for (let i = 0; i < n; i++) {
      const h = Number(candles[i].high || 0);
      const l = Number(candles[i].low || 0);
      if (i === 0) {
        tr[i] = Math.max(0, h - l);
      } else {
        const pc = Number(candles[i - 1].close || 0);
        tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
      }
    }

    let sum = 0;
    for (let i = 0; i < n; i++) {
      if (i < period) {
        sum += tr[i];
        if (i === period - 1) {
          out[i] = sum / period;
        }
      } else {
        const prevAtr = out[i - 1] !== null ? out[i - 1] : tr[i];
        out[i] = (prevAtr * (period - 1) + tr[i]) / period;
      }
    }
    return out;
  },

  /**
   * Supertrend (period = 10, multiplier = 3.0).
   * Returns array of { value, direction: 1 (bullish) | -1 (bearish), upperBand, lowerBand }
   */
  computeSupertrend(candles = [], period = 10, multiplier = 3.0) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const atr = this.computeAtr(candles, period);
    const out = new Array(n).fill(null);

    let prevFinalUpper = 0;
    let prevFinalLower = 0;
    let prevDir = 1;

    for (let i = 0; i < n; i++) {
      if (atr[i] === null) continue;
      const h = Number(candles[i].high || 0);
      const l = Number(candles[i].low || 0);
      const c = Number(candles[i].close || 0);
      const hl2 = (h + l) / 2;
      const basicUpper = hl2 + multiplier * atr[i];
      const basicLower = hl2 - multiplier * atr[i];

      let finalUpper = basicUpper;
      let finalLower = basicLower;
      let dir = prevDir;

      if (i > period - 1 && out[i - 1] !== null) {
        const prevC = Number(candles[i - 1].close || 0);
        finalUpper =
          basicUpper < prevFinalUpper || prevC > prevFinalUpper ? basicUpper : prevFinalUpper;
        finalLower =
          basicLower > prevFinalLower || prevC < prevFinalLower ? basicLower : prevFinalLower;

        if (prevDir === -1 && c > finalUpper) {
          dir = 1;
        } else if (prevDir === 1 && c < finalLower) {
          dir = -1;
        } else {
          dir = prevDir;
        }
      } else {
        dir = c >= hl2 ? 1 : -1;
      }

      prevFinalUpper = finalUpper;
      prevFinalLower = finalLower;
      prevDir = dir;

      out[i] = {
        value: dir === 1 ? finalLower : finalUpper,
        direction: dir,
        upperBand: finalUpper,
        lowerBand: finalLower,
      };
    }
    return out;
  },

  /**
   * Wilder's Relative Strength Index (RSI 14).
   */
  computeRsi(candles = [], period = 14) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n).fill(null);
    if (n <= period) return out;

    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const diff = Number(candles[i].close || 0) - Number(candles[i - 1].close || 0);
      if (diff >= 0) avgGain += diff;
      else avgLoss -= diff;
    }
    avgGain /= period;
    avgLoss /= period;

    out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = period + 1; i < n; i++) {
      const diff = Number(candles[i].close || 0) - Number(candles[i - 1].close || 0);
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return out;
  },

  /**
   * Moving Average Convergence Divergence — MACD (12, 26, 9).
   * Returns array of { macd, signal, histogram }
   */
  computeMacd(candles = [], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const fastEma = this.computeEma(candles, fastPeriod);
    const slowEma = this.computeEma(candles, slowPeriod);
    const macdLine = new Array(n).fill(null);

    for (let i = 0; i < n; i++) {
      if (fastEma[i] !== null && slowEma[i] !== null) {
        macdLine[i] = fastEma[i] - slowEma[i];
      }
    }

    const out = new Array(n).fill(null);
    const k = 2 / (signalPeriod + 1);
    let sigEma = null;
    let validCount = 0;
    let sum = 0;

    for (let i = 0; i < n; i++) {
      const m = macdLine[i];
      if (m === null) continue;
      validCount++;
      if (validCount < signalPeriod) {
        sum += m;
        out[i] = { macd: m, signal: null, histogram: null };
      } else if (validCount === signalPeriod) {
        sum += m;
        sigEma = sum / signalPeriod;
        out[i] = { macd: m, signal: sigEma, histogram: m - sigEma };
      } else {
        sigEma = m * k + sigEma * (1 - k);
        out[i] = { macd: m, signal: sigEma, histogram: m - sigEma };
      }
    }
    return out;
  },

  /**
   * Smart Money Concepts (SMC) & Market Structure Detector:
   * - Swing Highs / Swing Lows (pivot length = swingLen)
   * - BOS (Break of Structure) & CHoCH (Change of Character)
   * - Equal Highs (EQH) & Equal Lows (EQL) liquidity pools
   * - Fair Value Gaps (FVG / 3-bar Imbalance)
   */
  detectMarketStructureSmc(candles = [], swingLen = 3) {
    if (!Array.isArray(candles) || candles.length < swingLen * 2 + 2) {
      return { structures: [], equalLevels: [], fvgs: [] };
    }
    const n = candles.length;
    const atrSeries = this.computeAtr(candles, 14);
    const fallbackAtr =
      candles.reduce((acc, c) => acc + Math.max(0, Number(c.high || 0) - Number(c.low || 0)), 0) /
      Math.max(1, n);

    const swingHighs = [];
    const swingLows = [];

    for (let i = swingLen; i < n - swingLen; i++) {
      const hi = Number(candles[i].high || 0);
      const lo = Number(candles[i].low || 0);
      let isPivotHigh = true;
      let isPivotLow = true;

      for (let j = i - swingLen; j <= i + swingLen; j++) {
        if (j === i) continue;
        if (Number(candles[j].high || 0) >= hi) isPivotHigh = false;
        if (Number(candles[j].low || 0) <= lo) isPivotLow = false;
      }

      if (isPivotHigh) swingHighs.push({ index: i, price: hi, broken: false });
      if (isPivotLow) swingLows.push({ index: i, price: lo, broken: false });
    }

    // 1. Detect BOS & CHoCH across candles
    const structures = [];
    let trend = 0; // 1 = bullish, -1 = bearish
    let activeHigh = null;
    let activeLow = null;
    let shPtr = 0;
    let slPtr = 0;

    for (let i = 0; i < n; i++) {
      // Only activate pivots once their right wing (index + swingLen) is confirmed
      while (shPtr < swingHighs.length && swingHighs[shPtr].index + swingLen <= i) {
        activeHigh = { ...swingHighs[shPtr] };
        shPtr++;
      }
      while (slPtr < swingLows.length && swingLows[slPtr].index + swingLen <= i) {
        activeLow = { ...swingLows[slPtr] };
        slPtr++;
      }

      const close = Number(candles[i].close || 0);
      if (activeHigh && !activeHigh.broken && close > activeHigh.price) {
        const tag = trend === -1 ? 'CHoCH' : 'BOS';
        structures.push({
          type: tag,
          direction: 1, // Bullish break
          startIndex: activeHigh.index,
          breakIndex: i,
          price: activeHigh.price,
        });
        activeHigh.broken = true;
        trend = 1;
      }
      if (activeLow && !activeLow.broken && close < activeLow.price) {
        const tag = trend === 1 ? 'CHoCH' : 'BOS';
        structures.push({
          type: tag,
          direction: -1, // Bearish break
          startIndex: activeLow.index,
          breakIndex: i,
          price: activeLow.price,
        });
        activeLow.broken = true;
        trend = -1;
      }
    }

    // 2. Detect Equal Highs (EQH) & Equal Lows (EQL) within 0.22 * ATR tolerance
    const equalLevels = [];
    for (let k = 1; k < swingHighs.length; k++) {
      const prev = swingHighs[k - 1];
      const curr = swingHighs[k];
      if (curr.index - prev.index > 45) continue;
      const localAtr = atrSeries[curr.index] || fallbackAtr;
      if (Math.abs(curr.price - prev.price) <= localAtr * 0.22) {
        equalLevels.push({
          type: 'EQH',
          direction: 1,
          startIndex: prev.index,
          endIndex: curr.index,
          price: (prev.price + curr.price) / 2,
        });
      }
    }
    for (let k = 1; k < swingLows.length; k++) {
      const prev = swingLows[k - 1];
      const curr = swingLows[k];
      if (curr.index - prev.index > 45) continue;
      const localAtr = atrSeries[curr.index] || fallbackAtr;
      if (Math.abs(curr.price - prev.price) <= localAtr * 0.22) {
        equalLevels.push({
          type: 'EQL',
          direction: -1,
          startIndex: prev.index,
          endIndex: curr.index,
          price: (prev.price + curr.price) / 2,
        });
      }
    }

    // 3. Detect 3-Bar Fair Value Gaps (FVG / Imbalance)
    const fvgs = [];
    for (let i = 2; i < n; i++) {
      const c0 = candles[i - 2];
      const c2 = candles[i];
      const localAtr = atrSeries[i] || fallbackAtr;
      const minGap = localAtr * 0.12;

      const h0 = Number(c0.high || 0);
      const l0 = Number(c0.low || 0);
      const h2 = Number(c2.high || 0);
      const l2 = Number(c2.low || 0);

      // Bullish FVG: candle[i].low > candle[i-2].high
      if (l2 - h0 > minGap) {
        let endIdx = Math.min(n - 1, i + 18);
        for (let m = i + 1; m < n; m++) {
          if (Number(candles[m].low || 0) <= h0) {
            endIdx = m;
            break;
          }
        }
        fvgs.push({
          direction: 1, // Bullish FVG
          startIndex: i - 2,
          endIndex: endIdx,
          top: l2,
          bottom: h0,
        });
      }
      // Bearish FVG: candle[i].high < candle[i-2].low
      else if (l0 - h2 > minGap) {
        let endIdx = Math.min(n - 1, i + 18);
        for (let m = i + 1; m < n; m++) {
          if (Number(candles[m].high || 0) >= l0) {
            endIdx = m;
            break;
          }
        }
        fvgs.push({
          direction: -1, // Bearish FVG
          startIndex: i - 2,
          endIndex: endIdx,
          top: l0,
          bottom: h2,
        });
      }
    }

    return {
      structures: structures.slice(-14),
      equalLevels: equalLevels.slice(-8),
      fvgs: fvgs.slice(-14),
    };
  },

  /**
   * Session / Visible Range Volume Profile (VRVP) with POC, VAH, and VAL (70% Value Area).
   */
  computeVolumeProfile(candles = [], numBins = 24, valueAreaRatio = 0.7, volumeType = 'TICK_ESTIMATED') {
    if (!Array.isArray(candles) || candles.length === 0) return null;
    const hasRealVolume = this.hasNonZeroVolume(candles);
    const isEstimated = !hasRealVolume || String(volumeType || '').toUpperCase() !== 'REAL_EXCHANGE';
    let minP = Infinity;
    let maxP = -Infinity;
    for (const c of candles) {
      const l = Number(c.low || 0);
      const h = Number(c.high || 0);
      if (l < minP) minP = l;
      if (h > maxP) maxP = h;
    }
    if (!isFinite(minP) || !isFinite(maxP) || maxP <= minP) return null;

    const binCount = Math.max(8, Math.min(48, Math.floor(Number(numBins) || 24)));
    const binSize = (maxP - minP) / binCount;
    const bins = Array.from({ length: binCount }, (_, idx) => ({
      index: idx,
      low: minP + idx * binSize,
      high: minP + (idx + 1) * binSize,
      mid: minP + (idx + 0.5) * binSize,
      bullVol: 0,
      bearVol: 0,
      totalVol: 0,
      normWidth: 0,
      inValueArea: false,
      isPoc: false,
    }));

    for (const c of candles) {
      const o = Number(c.open || 0);
      const cl = Number(c.close || 0);
      const h = Number(c.high || 0);
      const l = Number(c.low || 0);
      const isBull = cl >= o;
      // If volume is 0 (e.g., some FX feeds), use candle range/activity weight
      const vol = Math.max(1, Number(c.volume || 0));

      const startBin = Math.max(0, Math.min(binCount - 1, Math.floor((l - minP) / binSize)));
      const endBin = Math.max(0, Math.min(binCount - 1, Math.floor((h - minP) / binSize)));
      const spanBins = Math.max(1, endBin - startBin + 1);
      const share = vol / spanBins;

      for (let b = startBin; b <= endBin; b++) {
        if (isBull) bins[b].bullVol += share;
        else bins[b].bearVol += share;
        bins[b].totalVol += share;
      }
    }

    let maxBinVol = 0;
    let totalVolSum = 0;
    let pocIdx = 0;
    for (let i = 0; i < binCount; i++) {
      totalVolSum += bins[i].totalVol;
      if (bins[i].totalVol > maxBinVol) {
        maxBinVol = bins[i].totalVol;
        pocIdx = i;
      }
    }
    if (maxBinVol <= 0) return null;

    bins[pocIdx].isPoc = true;
    bins[pocIdx].inValueArea = true;

    // Expand outward from POC until 70% of total volume is captured
    const targetVol = totalVolSum * valueAreaRatio;
    let accVol = bins[pocIdx].totalVol;
    let lowIdx = pocIdx;
    let highIdx = pocIdx;

    while (accVol < targetVol && (lowIdx > 0 || highIdx < binCount - 1)) {
      const nextDownVol = lowIdx > 0 ? bins[lowIdx - 1].totalVol : -1;
      const nextUpVol = highIdx < binCount - 1 ? bins[highIdx + 1].totalVol : -1;
      if (nextUpVol >= nextDownVol && highIdx < binCount - 1) {
        highIdx++;
        bins[highIdx].inValueArea = true;
        accVol += bins[highIdx].totalVol;
      } else if (lowIdx > 0) {
        lowIdx--;
        bins[lowIdx].inValueArea = true;
        accVol += bins[lowIdx].totalVol;
      } else {
        break;
      }
    }

    for (const b of bins) {
      b.normWidth = b.totalVol / maxBinVol;
    }

    return {
      bins,
      pocPrice: bins[pocIdx].mid,
      vahPrice: bins[highIdx].high,
      valPrice: bins[lowIdx].low,
      maxBinVol,
      hasRealVolume,
      isEstimated,
    };
  },

  hasNonZeroVolume(candles = []) {
    if (!Array.isArray(candles)) return false;
    return candles.some((c) => Number(c.volume || 0) > 0);
  },

  computeParabolicSar(candles = [], step = 0.02, maxAf = 0.20) {
    if (!Array.isArray(candles) || candles.length < 2) {
      return new Array(Array.isArray(candles) ? candles.length : 0).fill(null);
    }
    const n = candles.length;
    const out = new Array(n).fill(null);
    const h0 = Number(candles[0].high || 0);
    const l0 = Number(candles[0].low || 0);
    const h1 = Number(candles[1].high || 0);
    const l1 = Number(candles[1].low || 0);
    let isUp = Number(candles[1].close || 0) >= Number(candles[0].close || 0);
    let sar = isUp ? l0 : h0;
    let ep = isUp ? h1 : l1;
    let af = step;
    out[1] = { sar, isUp };

    for (let i = 2; i < n; i++) {
      const hi = Number(candles[i].high || 0);
      const lo = Number(candles[i].low || 0);
      const prevLo1 = Number(candles[i - 1].low || 0);
      const prevLo2 = Number(candles[i - 2].low || 0);
      const prevHi1 = Number(candles[i - 1].high || 0);
      const prevHi2 = Number(candles[i - 2].high || 0);

      let nextSar = sar + af * (ep - sar);
      if (isUp) {
        nextSar = Math.min(nextSar, prevLo1, prevLo2);
        if (lo < nextSar) {
          isUp = false;
          sar = ep;
          ep = lo;
          af = step;
        } else {
          sar = nextSar;
          if (hi > ep) {
            ep = hi;
            af = Math.min(maxAf, af + step);
          }
        }
      } else {
        nextSar = Math.max(nextSar, prevHi1, prevHi2);
        if (hi > nextSar) {
          isUp = true;
          sar = ep;
          ep = hi;
          af = step;
        } else {
          sar = nextSar;
          if (lo < ep) {
            ep = lo;
            af = Math.min(maxAf, af + step);
          }
        }
      }
      out[i] = { sar, isUp };
    }
    return out;
  },

  computeIchimoku(candles = [], tenkanPeriod = 9, kijunPeriod = 26, senkouBPeriod = 52, displacement = 26) {
    const n = Array.isArray(candles) ? candles.length : 0;
    if (n === 0) return { tenkan: [], kijun: [], senkouA: [], senkouB: [], chikou: [] };
    const midRange = (endIdx, len) => {
      if (endIdx < len - 1) return null;
      let hh = -Infinity;
      let ll = Infinity;
      for (let j = endIdx - len + 1; j <= endIdx; j++) {
        hh = Math.max(hh, Number(candles[j].high || 0));
        ll = Math.min(ll, Number(candles[j].low || 0));
      }
      return (hh + ll) / 2;
    };

    const tenkan = new Array(n).fill(null);
    const kijun = new Array(n).fill(null);
    const rawSpanA = new Array(n).fill(null);
    const rawSpanB = new Array(n).fill(null);
    const senkouA = new Array(n).fill(null);
    const senkouB = new Array(n).fill(null);
    const chikou = new Array(n).fill(null);

    for (let i = 0; i < n; i++) {
      tenkan[i] = midRange(i, tenkanPeriod);
      kijun[i] = midRange(i, kijunPeriod);
      if (tenkan[i] !== null && kijun[i] !== null) {
        rawSpanA[i] = (tenkan[i] + kijun[i]) / 2;
      }
      rawSpanB[i] = midRange(i, senkouBPeriod);
      const srcIdx = i - displacement;
      if (srcIdx >= 0) {
        senkouA[i] = rawSpanA[srcIdx];
        senkouB[i] = rawSpanB[srcIdx];
      }
      const fwdIdx = i + displacement;
      if (fwdIdx < n) {
        chikou[i] = Number(candles[fwdIdx].close || 0);
      }
    }
    return { tenkan, kijun, senkouA, senkouB, chikou };
  },

  computeKeltnerChannels(candles = [], emaPeriod = 20, atrPeriod = 10, mult = 2.0) {
    const n = Array.isArray(candles) ? candles.length : 0;
    if (n === 0) return [];
    const mid = this.computeEma(candles, emaPeriod);
    const atr = this.computeAtr(candles, atrPeriod);
    return candles.map((_, i) => {
      if (mid[i] === null || atr[i] === null) return null;
      return {
        middle: mid[i],
        upper: mid[i] + mult * atr[i],
        lower: mid[i] - mult * atr[i],
      };
    });
  },

  computeDonchianChannels(candles = [], period = 20) {
    const n = Array.isArray(candles) ? candles.length : 0;
    if (n === 0 || period <= 0) return [];
    const out = new Array(n).fill(null);
    for (let i = period - 1; i < n; i++) {
      let hh = -Infinity;
      let ll = Infinity;
      for (let j = i - period + 1; j <= i; j++) {
        hh = Math.max(hh, Number(candles[j].high || 0));
        ll = Math.min(ll, Number(candles[j].low || 0));
      }
      out[i] = { upper: hh, lower: ll, middle: (hh + ll) / 2 };
    }
    return out;
  },

  higherTimeframeFor(timeframe) {
    switch (String(timeframe || 'M15').toUpperCase()) {
      case 'M1':
      case 'M5':
        return 'M15';
      case 'M15':
        return 'H1';
      case 'M30':
      case 'H1':
        return 'H4';
      case 'H4':
        return 'D1';
      case 'D1':
      case 'W1':
      default:
        return 'W1';
    }
  },

  /**
   * Non-lookahead Multi-Timeframe EMA(20): assigns higher-TF EMA value only once
   * the higher-TF candle bucket has closed (bucket.closeMs <= baseBar.closeMs).
   */
  computeMtfEma(candles = [], currentTimeframe = 'M15', period = 20, symbolCode = 'XAUUSD') {
    const n = Array.isArray(candles) ? candles.length : 0;
    if (n === 0) return [];
    const curTf = String(currentTimeframe || 'M15').toUpperCase();
    const htf = this.higherTimeframeFor(curTf);
    if (htf === curTf) {
      return this.computeEma(candles, period);
    }

    const lastBarMs = Number(
      candles[n - 1].open_time_utc_ms || (candles[n - 1].openTimeSec ? candles[n - 1].openTimeSec * 1000 : 0)
    );
    const lastBounds = PriceFormatter.getSessionBucketBounds(lastBarMs, curTf, symbolCode);
    const htfCandles = TimeframeAggregator.aggregateCandles(candles, htf, lastBounds.closeMs, symbolCode);
    if (!htfCandles.length) return new Array(n).fill(null);

    const htfEma = this.computeEma(htfCandles, period);
    const htfCloseBounds = htfCandles.map((b) => {
      const ms = Number(b.open_time_utc_ms || (b.openTimeSec ? b.openTimeSec * 1000 : 0));
      return PriceFormatter.getSessionBucketBounds(ms, htf, symbolCode).closeMs;
    });

    const out = new Array(n).fill(null);
    let ptr = -1;
    for (let i = 0; i < n; i++) {
      const ms = Number(
        candles[i].open_time_utc_ms || (candles[i].openTimeSec ? candles[i].openTimeSec * 1000 : 0)
      );
      const barCloseMs = PriceFormatter.getSessionBucketBounds(ms, curTf, symbolCode).closeMs;
      while (ptr + 1 < htfCloseBounds.length && htfCloseBounds[ptr + 1] <= barCloseMs) {
        ptr++;
      }
      if (ptr >= 0 && htfEma[ptr] !== null) {
        out[i] = htfEma[ptr];
      }
    }
    return out;
  },

  classifyKillzoneUtcHour(utcHour) {
    const h = ((Number(utcHour) % 24) + 24) % 24;
    if (h >= 13 && h < 16) return 'OVERLAP';
    if (h >= 7 && h < 16) return 'LONDON';
    if (h >= 13 && h < 22) return 'NEW_YORK';
    if (h >= 0 && h < 9) return 'ASIA';
    return null;
  },

  computeAdxDmi(candles = [], period = 14) {
    const n = Array.isArray(candles) ? candles.length : 0;
    if (n < period * 2) return new Array(n).fill(null);
    const tr = new Array(n).fill(0);
    const plusDm = new Array(n).fill(0);
    const minusDm = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      const hi = Number(candles[i].high || 0);
      const lo = Number(candles[i].low || 0);
      const prevH = Number(candles[i - 1].high || 0);
      const prevL = Number(candles[i - 1].low || 0);
      const prevC = Number(candles[i - 1].close || 0);
      tr[i] = Math.max(hi - lo, Math.abs(hi - prevC), Math.abs(lo - prevC));
      const up = hi - prevH;
      const dn = prevL - lo;
      plusDm[i] = up > dn && up > 0 ? up : 0;
      minusDm[i] = dn > up && dn > 0 ? dn : 0;
    }

    let smTr = 0;
    let smPlus = 0;
    let smMinus = 0;
    for (let i = 1; i <= period; i++) {
      smTr += tr[i];
      smPlus += plusDm[i];
      smMinus += minusDm[i];
    }

    const out = new Array(n).fill(null);
    const dxList = [];
    for (let i = period; i < n; i++) {
      if (i > period) {
        smTr = smTr - smTr / period + tr[i];
        smPlus = smPlus - smPlus / period + plusDm[i];
        smMinus = smMinus - smMinus / period + minusDm[i];
      }
      const pDi = smTr > 0 ? (100 * smPlus) / smTr : 0;
      const mDi = smTr > 0 ? (100 * smMinus) / smTr : 0;
      const sumDi = pDi + mDi;
      const dx = sumDi > 0 ? (100 * Math.abs(pDi - mDi)) / sumDi : 0;
      dxList.push({ idx: i, plusDi: pDi, minusDi: mDi, dx });
    }
    if (dxList.length < period) return out;
    let adxSum = 0;
    for (let k = 0; k < period; k++) adxSum += dxList[k].dx;
    let prevAdx = adxSum / period;
    out[dxList[period - 1].idx] = {
      adx: prevAdx,
      plusDi: dxList[period - 1].plusDi,
      minusDi: dxList[period - 1].minusDi,
    };
    for (let k = period; k < dxList.length; k++) {
      prevAdx = (prevAdx * (period - 1) + dxList[k].dx) / period;
      out[dxList[k].idx] = {
        adx: prevAdx,
        plusDi: dxList[k].plusDi,
        minusDi: dxList[k].minusDi,
      };
    }
    return out;
  },

  computeStochastic(candles = [], kPeriod = 14, smoothK = 3, dPeriod = 3) {
    const n = Array.isArray(candles) ? candles.length : 0;
    if (n === 0) return [];
    const rawK = new Array(n).fill(null);
    for (let i = kPeriod - 1; i < n; i++) {
      let hh = -Infinity;
      let ll = Infinity;
      for (let j = i - kPeriod + 1; j <= i; j++) {
        hh = Math.max(hh, Number(candles[j].high || 0));
        ll = Math.min(ll, Number(candles[j].low || 0));
      }
      const span = hh - ll;
      rawK[i] = span > 1e-12 ? ((Number(candles[i].close || 0) - ll) / span) * 100 : 50;
    }

    const slowK = new Array(n).fill(null);
    for (let i = kPeriod - 1 + smoothK - 1; i < n; i++) {
      let s = 0;
      let ok = true;
      for (let j = i - smoothK + 1; j <= i; j++) {
        if (rawK[j] === null) {
          ok = false;
          break;
        }
        s += rawK[j];
      }
      if (ok) slowK[i] = s / smoothK;
    }

    const out = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (slowK[i] === null) continue;
      let dVal = null;
      if (i >= dPeriod - 1) {
        let s = 0;
        let ok = true;
        for (let j = i - dPeriod + 1; j <= i; j++) {
          if (slowK[j] === null) {
            ok = false;
            break;
          }
          s += slowK[j];
        }
        if (ok) dVal = s / dPeriod;
      }
      out[i] = { k: slowK[i], d: dVal };
    }
    return out;
  },

  computeCci(candles = [], period = 20) {
    const n = Array.isArray(candles) ? candles.length : 0;
    if (n < period) return new Array(n).fill(null);
    const tp = candles.map(
      (c) => (Number(c.high || 0) + Number(c.low || 0) + Number(c.close || 0)) / 3
    );
    const out = new Array(n).fill(null);
    for (let i = period - 1; i < n; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += tp[j];
      const sma = sum / period;
      let dev = 0;
      for (let j = i - period + 1; j <= i; j++) dev += Math.abs(tp[j] - sma);
      const meanDev = dev / period;
      out[i] = meanDev > 1e-12 ? (tp[i] - sma) / (0.015 * meanDev) : 0;
    }
    return out;
  },

  computeWilliamsR(candles = [], period = 14) {
    const n = Array.isArray(candles) ? candles.length : 0;
    if (n < period) return new Array(n).fill(null);
    const out = new Array(n).fill(null);
    for (let i = period - 1; i < n; i++) {
      let hh = -Infinity;
      let ll = Infinity;
      for (let j = i - period + 1; j <= i; j++) {
        hh = Math.max(hh, Number(candles[j].high || 0));
        ll = Math.min(ll, Number(candles[j].low || 0));
      }
      const span = hh - ll;
      out[i] = span > 1e-12 ? (-100 * (hh - Number(candles[i].close || 0))) / span : -50;
    }
    return out;
  },

  computeObv(candles = []) {
    const n = Array.isArray(candles) ? candles.length : 0;
    if (n === 0) return [];
    const out = new Array(n).fill(0);
    out[0] = Number(candles[0].volume || 0);
    for (let i = 1; i < n; i++) {
      const c = Number(candles[i].close || 0);
      const pc = Number(candles[i - 1].close || 0);
      const v = Number(candles[i].volume || 0);
      if (c > pc) out[i] = out[i - 1] + v;
      else if (c < pc) out[i] = out[i - 1] - v;
      else out[i] = out[i - 1];
    }
    return out;
  },

  computeCmf(candles = [], period = 20) {
    const n = Array.isArray(candles) ? candles.length : 0;
    if (n < period) return new Array(n).fill(null);
    const mfv = candles.map((c) => {
      const h = Number(c.high || 0);
      const l = Number(c.low || 0);
      const cl = Number(c.close || 0);
      const v = Number(c.volume || 0);
      const hl = h - l;
      const mult = hl > 1e-12 ? (cl - l - (h - cl)) / hl : 0;
      return mult * v;
    });
    const vols = candles.map((c) => Number(c.volume || 0));
    const out = new Array(n).fill(null);
    for (let i = period - 1; i < n; i++) {
      let sMfv = 0;
      let sVol = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sMfv += mfv[j];
        sVol += vols[j];
      }
      out[i] = sVol > 1e-12 ? sMfv / sVol : 0;
    }
    return out;
  },

  computeRoc(candles = [], period = 12) {
    const n = Array.isArray(candles) ? candles.length : 0;
    if (n <= period) return new Array(n).fill(null);
    const out = new Array(n).fill(null);
    for (let i = period; i < n; i++) {
      const cur = Number(candles[i].close || 0);
      const prev = Number(candles[i - period].close || 0);
      out[i] = Math.abs(prev) > 1e-12 ? ((cur - prev) / prev) * 100 : 0;
    }
    return out;
  },
};
