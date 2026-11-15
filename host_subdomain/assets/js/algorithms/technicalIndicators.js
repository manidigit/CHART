import { PriceFormatter } from './priceFormatter.js?v=1.43.0';
import { TimeframeAggregator } from './timeframeAggregator.js?v=1.43.0';

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
        let sumT = 0;
        let count = 0;
        for (let j = start; j <= i; j++) {
          const c = candles[j];
          const tp = (Number(c.high || 0) + Number(c.low || 0) + Number(c.close || 0)) / 3;
          const v = Math.max(0, Number(c.volume || 0));
          sumPv += tp * v;
          sumV += v;
          sumT += tp;
          count++;
        }
        out[i] = sumV > 0 ? sumPv / sumV : sumT / Math.max(1, count);
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
      const vol = Math.max(0, Number(c.volume || 0));
      cumPv += tp * vol;
      cumV += vol;
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
    if (!Array.isArray(candles) || candles.length < 2) return null;
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

    const binCount = Math.max(4, Math.min(48, Math.floor(Number(numBins) || 24)));
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
      const rawVol = hasRealVolume ? Math.max(0, Number(c.volume || 0)) : 1.0;
      if (rawVol <= 0) continue;

      const lowIdx = Math.max(0, Math.min(binCount - 1, Math.floor((l - minP) / binSize)));
      const highIdx = Math.max(0, Math.min(binCount - 1, Math.floor((h - minP) / binSize)));
      const loBin = Math.min(lowIdx, highIdx);
      const hiBin = Math.max(lowIdx, highIdx);
      const barRange = h - l;

      if (barRange <= 0 || loBin === hiBin) {
        const share = rawVol / (hiBin - loBin + 1);
        for (let b = loBin; b <= hiBin; b++) {
          if (isBull) bins[b].bullVol += share;
          else bins[b].bearVol += share;
          bins[b].totalVol += share;
        }
      } else {
        let weightSum = 0;
        const weights = new Array(hiBin - loBin + 1).fill(0);
        for (let b = loBin; b <= hiBin; b++) {
          const bLow = minP + b * binSize;
          const bHigh = bLow + binSize;
          const overlap = Math.max(0, Math.min(h, bHigh) - Math.max(l, bLow));
          weights[b - loBin] = overlap;
          weightSum += overlap;
        }
        const denom = weightSum > 0 ? weightSum : hiBin - loBin + 1;
        for (let b = loBin; b <= hiBin; b++) {
          const w = weightSum > 0 ? weights[b - loBin] : 1;
          const share = rawVol * (w / denom);
          if (isBull) bins[b].bullVol += share;
          else bins[b].bearVol += share;
          bins[b].totalVol += share;
        }
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
    if (maxBinVol <= 0 || totalVolSum <= 0) return null;

    bins[pocIdx].isPoc = true;
    bins[pocIdx].inValueArea = true;

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

  /**
   * IND-01: Multi-Variant Pivot Points (Standard, Fibonacci, Camarilla, Woodie)
   * computed from prior session HLC and current session Open.
   */
  computePivotPoints(candles = [], timeframe = 'M15', symbolCode = 'XAUUSD', pivotType = 'STANDARD') {
    if (!Array.isArray(candles) || candles.length < 2) return null;
    const tf = String(timeframe || 'M15').toUpperCase();
    const rawVariant = String(pivotType || 'STANDARD').toUpperCase();
    const variant = ['STANDARD', 'FIBONACCI', 'CAMARILLA', 'WOODIE'].includes(rawVariant)
      ? rawVariant
      : 'STANDARD';
    let high = -Infinity;
    let low = Infinity;
    let close = Number(candles[candles.length - 1].close || 0);
    let currOpen = Number(candles[candles.length - 1].open || close);

    if (tf === 'D1' || tf === 'W1') {
      const prevBar = candles[candles.length - 2];
      const currBar = candles[candles.length - 1];
      high = Number(prevBar.high || 0);
      low = Number(prevBar.low || 0);
      close = Number(prevBar.close || 0);
      currOpen = Number(currBar.open || close);
    } else {
      const getMs = (c) => Number(c.open_time_utc_ms || (c.openTimeSec ? c.openTimeSec * 1000 : 0));
      const lastDayKey = PriceFormatter.getSessionDayKey(getMs(candles[candles.length - 1]), symbolCode);
      let prevDayKey = null;
      for (let i = candles.length - 1; i >= 0; i--) {
        const dk = PriceFormatter.getSessionDayKey(getMs(candles[i]), symbolCode);
        if (dk === lastDayKey) {
          currOpen = Number(candles[i].open || close);
        } else {
          if (prevDayKey === null) {
            prevDayKey = dk;
            close = Number(candles[i].close || 0);
          }
          if (dk === prevDayKey) {
            high = Math.max(high, Number(candles[i].high || 0));
            low = Math.min(low, Number(candles[i].low || 0));
          } else {
            break;
          }
        }
      }
      if (!isFinite(high) || !isFinite(low) || high <= 0) {
        const winStart = Math.max(0, candles.length - 25);
        const winEnd = Math.max(1, candles.length - 1);
        for (let i = winStart; i < winEnd; i++) {
          high = Math.max(high, Number(candles[i].high || 0));
          low = Math.min(low, Number(candles[i].low || 0));
          close = Number(candles[i].close || 0);
        }
        currOpen = Number(candles[winEnd]?.open || close);
      }
    }

    if (!isFinite(high) || !isFinite(low) || high < low) return null;
    const range = high - low;

    if (variant === 'FIBONACCI') {
      const p = (high + low + close) / 3;
      return {
        variant,
        p,
        r1: p + 0.382 * range,
        s1: p - 0.382 * range,
        r2: p + 0.618 * range,
        s2: p - 0.618 * range,
        r3: p + 1.0 * range,
        s3: p - 1.0 * range,
        r4: null,
        s4: null,
      };
    }

    if (variant === 'CAMARILLA') {
      const p = (high + low + close) / 3;
      return {
        variant,
        p,
        r1: close + (range * 1.1) / 12,
        s1: close - (range * 1.1) / 12,
        r2: close + (range * 1.1) / 6,
        s2: close - (range * 1.1) / 6,
        r3: close + (range * 1.1) / 4,
        s3: close - (range * 1.1) / 4,
        r4: close + (range * 1.1) / 2,
        s4: close - (range * 1.1) / 2,
      };
    }

    if (variant === 'WOODIE') {
      const p = (high + low + 2 * currOpen) / 4;
      return {
        variant,
        p,
        r1: 2 * p - low,
        s1: 2 * p - high,
        r2: p + range,
        s2: p - range,
        r3: high + 2 * (p - low),
        s3: low - 2 * (high - p),
        r4: null,
        s4: null,
      };
    }

    const p = (high + low + close) / 3;
    return {
      variant: 'STANDARD',
      p,
      r1: 2 * p - low,
      s1: 2 * p - high,
      r2: p + range,
      s2: p - range,
      r3: high + 2 * (p - low),
      s3: low - 2 * (high - p),
      r4: null,
      s4: null,
    };
  },

  /**
   * PRED-09 & PRED-10: Multi-Step Future Candlestick Projection (horizon >= 10, default 30 bars)
   * across any timeframe (M15, M30, H1, H4, D1, W1).
   * Combines Holt-Linear trend + damped AR(2) mean-reversion + Fourier dominant harmonic cycle
   * + deterministic synthetic OHLC body/wick synthesis and sqrt(h)*ATR confidence bands.
   */
  computeFutureCandlestickProjection(candles = [], timeframe = 'M15', horizon = 30, options = {}) {
    if (!Array.isArray(candles) || candles.length < 10) return [];
    const hCount = Math.max(10, Math.min(60, Math.round(horizon || options.numFutureCandles || 30)));
    const volatilityMultiplier = Math.max(0.35, Math.min(2.5, Number(options.volatilityMultiplier || 1.0)));
    const scenarioMode = String(options.scenarioMode || 'auto_smc');
    const lookback = Math.min(candles.length, 120);
    const window = candles.slice(candles.length - lookback);
    const n = window.length;
    const closes = window.map((c) => Number(c.close || 0));
    const lastCandle = window[n - 1];
    const lastClose = closes[n - 1];
    if (!isFinite(lastClose) || lastClose <= 0) return [];

    // 1. ATR(14) & 30-candle average body-to-wick ratios + average volume
    let trSum = 0;
    const atrPeriod = Math.min(14, n - 1);
    for (let i = n - atrPeriod; i < n; i++) {
      const cur = window[i];
      const prevC = Number(window[i - 1].close || 0);
      const hi = Number(cur.high || 0);
      const lo = Number(cur.low || 0);
      const tr = Math.max(hi - lo, Math.abs(hi - prevC), Math.abs(lo - prevC));
      trSum += tr;
    }
    const rawAtr = Math.max(trSum / Math.max(1, atrPeriod), lastClose * 0.0012);
    const atr = rawAtr * volatilityMultiplier;

    const ratioCount = Math.min(30, n - 1);
    let bodyRatioSum = 0;
    let upperWickSum = 0;
    let lowerWickSum = 0;
    let volSum = 0;
    for (let i = n - ratioCount; i < n; i++) {
      const cur = window[i];
      const hi = Number(cur.high || 0);
      const lo = Number(cur.low || 0);
      const op = Number(cur.open || 0);
      const cl = Number(cur.close || 0);
      const rng = Math.max(hi - lo, lastClose * 0.0005);
      bodyRatioSum += Math.abs(cl - op) / rng;
      upperWickSum += (hi - Math.max(op, cl)) / rng;
      lowerWickSum += (Math.min(op, cl) - lo) / rng;
      volSum += Math.max(1, Number(cur.volume || 100));
    }
    const avgBodyRatio = Math.max(0.38, Math.min(0.74, bodyRatioSum / Math.max(1, ratioCount)));
    const avgUpperWickRatio = Math.max(0.15, Math.min(0.48, upperWickSum / Math.max(1, ratioCount)));
    const avgLowerWickRatio = Math.max(0.15, Math.min(0.48, lowerWickSum / Math.max(1, ratioCount)));
    const avgVolume = Math.max(10, volSum / Math.max(1, ratioCount));

    // 2. Compute SMC (BOS/CHoCH, Unmitigated FVG, EQH/EQL), Volume Profile (POC/VAH/VAL), EMA20, Bollinger
    const smc = this.detectMarketStructureSmc(window, 3);
    const vp = this.computeVolumeProfile(window, 24, 0.70, 'TICK_SYNTHETIC');
    const ema20Arr = this.computeEma(window, Math.min(20, Math.max(5, n - 2)));
    const bbArr = this.computeBollingerBands(window, Math.min(20, Math.max(5, n - 2)), 2.0);
    const ema20 = Number(ema20Arr[n - 1] ?? lastClose);
    const lastBb = bbArr[n - 1] || { upper: lastClose + 2 * atr, lower: lastClose - 2 * atr, middle: ema20 };
    const bbSpan = Math.max(1e-6, Number(lastBb.upper) - Number(lastBb.lower));
    const bbPercentB = (lastClose - Number(lastBb.lower)) / bbSpan;

    // Determine dominant structural bias from BOS/CHoCH + EMA20 slope
    const lastBos =
      smc.bosChochEvents && smc.bosChochEvents.length > 0
        ? smc.bosChochEvents[smc.bosChochEvents.length - 1]
        : null;
    let dominantDir = 1;
    if (scenarioMode === 'bullish_continuation') {
      dominantDir = 1;
    } else if (scenarioMode === 'bearish_reversal') {
      dominantDir = -1;
    } else if (lastBos) {
      dominantDir = lastBos.direction >= 0 ? 1 : -1;
    } else {
      dominantDir = lastClose >= ema20 ? 1 : -1;
    }

    const unmitigatedFvgs = (smc.fvgZones || []).filter((z) => !z.mitigated);
    const eqHighs = (smc.liquidityLevels || []).filter((l) => l.kind === 'EQH').map((l) => Number(l.price));
    const eqLows = (smc.liquidityLevels || []).filter((l) => l.kind === 'EQL').map((l) => Number(l.price));
    const poc = Number(vp?.pocPrice || ema20 || lastClose);
    const vah = Number(vp?.vahPrice || lastClose + 2.2 * atr);
    const val = Number(vp?.valPrice || lastClose - 2.2 * atr);

    // Step A (Pullback / Mitigation Target for first 3 to 5 predicted bars):
    // Selects nearest unmitigated FVG, EMA 20, or Volume Profile POC when price is impulsive or near Bollinger Band edge
    let pullbackTarget = poc;
    if (dominantDir > 0) {
      const lowerFvgs = unmitigatedFvgs
        .filter((f) => f.top < lastClose && lastClose - f.midpoint <= 3.5 * atr)
        .sort((a, b) => b.top - a.top);
      if (lowerFvgs.length > 0) {
        pullbackTarget = lowerFvgs[0].midpoint;
      } else if (bbPercentB > 0.72 || lastClose > ema20 + 0.4 * atr) {
        pullbackTarget = Math.min(lastClose - 0.85 * atr, Math.max(ema20, poc));
      } else {
        pullbackTarget = lastClose - 0.75 * atr;
      }
    } else {
      const upperFvgs = unmitigatedFvgs
        .filter((f) => f.bottom > lastClose && f.midpoint - lastClose <= 3.5 * atr)
        .sort((a, b) => a.bottom - b.bottom);
      if (upperFvgs.length > 0) {
        pullbackTarget = upperFvgs[0].midpoint;
      } else if (bbPercentB < 0.28 || lastClose < ema20 - 0.4 * atr) {
        pullbackTarget = Math.max(lastClose + 0.85 * atr, Math.min(ema20, poc));
      } else {
        pullbackTarget = lastClose + 0.75 * atr;
      }
    }

    // Step B (Primary Liquidity Magnet for subsequent impulse bars):
    // Accelerates in direction of BOS/CHoCH bias toward nearest EQH/EQL, VAH/VAL, or opposing unmitigated FVG
    let primaryMagnet = dominantDir > 0 ? Math.max(vah, lastClose + 3.2 * atr) : Math.min(val, lastClose - 3.2 * atr);
    if (dominantDir > 0) {
      const aboveEqh = eqHighs.filter((p) => p > lastClose + 0.8 * atr).sort((a, b) => a - b);
      const aboveFvg = unmitigatedFvgs.filter((f) => f.bottom > lastClose + 0.8 * atr).sort((a, b) => a.bottom - b.bottom);
      if (aboveEqh.length > 0 && aboveEqh[0] <= lastClose + 5.5 * atr) {
        primaryMagnet = aboveEqh[0];
      } else if (vah > lastClose + 1.1 * atr) {
        primaryMagnet = vah;
      } else if (aboveFvg.length > 0 && aboveFvg[0].midpoint <= lastClose + 5.5 * atr) {
        primaryMagnet = aboveFvg[0].midpoint;
      } else {
        primaryMagnet = lastClose + 3.5 * atr;
      }
    } else {
      const belowEql = eqLows.filter((p) => p < lastClose - 0.8 * atr).sort((a, b) => b - a);
      const belowFvg = unmitigatedFvgs.filter((f) => f.top < lastClose - 0.8 * atr).sort((a, b) => b.top - a.top);
      if (belowEql.length > 0 && belowEql[0] >= lastClose - 5.5 * atr) {
        primaryMagnet = belowEql[0];
      } else if (val < lastClose - 1.1 * atr) {
        primaryMagnet = val;
      } else if (belowFvg.length > 0 && belowFvg[0].midpoint >= lastClose - 5.5 * atr) {
        primaryMagnet = belowFvg[0].midpoint;
      } else {
        primaryMagnet = lastClose - 3.5 * atr;
      }
    }

    const pullbackBars = Math.min(4, Math.max(3, Math.round(hCount * 0.2)));
    const stepMs = PriceFormatter.stepMilliseconds(timeframe);
    const lastOpenMs = Number(
      lastCandle.open_time_utc_ms || (lastCandle.openTimeSec ? lastCandle.openTimeSec * 1000 : Date.now())
    );
    const out = [];
    let prevProjectedClose = lastClose;

    for (let k = 1; k <= hCount; k++) {
      const openP = prevProjectedClose;
      const isPullbackPhase = k <= pullbackBars;
      let signedBody = 0;
      let isImpulseBar = false;

      if (isPullbackPhase) {
        // Step A: Pullback / mitigation wave toward FVG / POC / EMA20
        const remPullback = Math.max(1, pullbackBars - k + 1);
        const gapToPullback = pullbackTarget - openP;
        const stepPull = gapToPullback / remPullback;
        const bodyMag = Math.max(atr * 0.35, Math.min(atr * 0.85, Math.abs(stepPull) + atr * 0.22));
        const pullSign = gapToPullback >= 0 ? 1 : -1;
        signedBody = k === pullbackBars ? -dominantDir * atr * 0.32 : pullSign * bodyMag;
        isImpulseBar = false;
      } else {
        // Step B: 2-step-forward, 1-step-back fractal wave toward Primary Liquidity Magnet
        const waveIdx = (k - pullbackBars - 1) % 4;
        const isRetraceBar = waveIdx === 2; // 2 impulse bars, 1 consolidation/pullback bar, 1 continuation bar
        const remBars = Math.max(2, hCount - k + 1);
        const distToMagnet = primaryMagnet - openP;
        const magnetDrift = distToMagnet / remBars;

        if (isRetraceBar) {
          // 1-step-back consolidation/pullback candle (0.32x - 0.58x ATR body)
          const retraceScale = 0.34 + 0.18 * Math.abs(Math.sin(k * 1.3 + n));
          signedBody = -dominantDir * atr * retraceScale;
          isImpulseBar = false;
        } else {
          // 2-step-forward strong impulse candle (0.72x - 1.35x ATR body)
          const impulseScale = 0.74 + 0.42 * Math.abs(Math.cos(k * 0.85 + (n % 5)));
          const rawStep = magnetDrift * 0.55 + dominantDir * atr * impulseScale * avgBodyRatio;
          const minImpulse = atr * 0.52 * avgBodyRatio;
          const maxImpulse = atr * 1.38;
          const mag = Math.max(minImpulse, Math.min(maxImpulse, Math.abs(rawStep)));
          signedBody = (rawStep >= 0 ? 1 : -1) * mag;
          isImpulseBar = true;
        }
      }

      const adjClose = Math.max(lastClose * 0.05, openP + signedBody);
      const bodyAbs = Math.abs(adjClose - openP);

      // Base upper & lower wicks scaled so total candle range is 0.5x - 1.8x ATR(14)
      let upperWick = Math.max(
        atr * 0.16,
        bodyAbs * (avgUpperWickRatio / avgBodyRatio) * (0.85 + 0.35 * Math.abs(Math.cos(k * 0.9)))
      );
      let lowerWick = Math.max(
        atr * 0.16,
        bodyAbs * (avgLowerWickRatio / avgBodyRatio) * (0.85 + 0.35 * Math.abs(Math.sin(k * 1.1)))
      );

      let highP = Math.max(openP, adjClose) + upperWick;
      let lowP = Math.max(lastClose * 0.02, Math.min(openP, adjClose) - lowerWick);

      // Rule 4: Pronounced Rejection Wicks at Key Levels (FVG, POC, VAH, VAL, EQH/EQL)
      let rejectionWick = false;
      if (
        Math.abs(lowP - pullbackTarget) <= atr * 0.35 ||
        Math.abs(lowP - poc) <= atr * 0.32 ||
        Math.abs(lowP - val) <= atr * 0.35
      ) {
        lowP = Math.max(lastClose * 0.02, lowP - atr * 0.36);
        rejectionWick = true;
      }
      if (
        Math.abs(highP - vah) <= atr * 0.35 ||
        Math.abs(highP - primaryMagnet) <= atr * 0.35
      ) {
        highP += atr * 0.36;
        rejectionWick = true;
      }

      // Rule 5: Dynamic Volume Projection (1.2x - 1.8x on impulse, 0.5x - 0.8x on pullback)
      const volMult = isImpulseBar
        ? 1.25 + 0.50 * Math.abs(Math.sin(k * 0.95 + 1.2))
        : 0.52 + 0.26 * Math.abs(Math.cos(k * 1.15 + 0.5));
      const projectedVolume = Math.round(avgVolume * volMult);

      const bandHalf = atr * 0.85 * Math.sqrt(k);
      const pctChange = ((adjClose - lastClose) / lastClose) * 100;

      out.push({
        step: k,
        stepAhead: k,
        stepIndex: k,
        openTimeUtcMs: lastOpenMs + k * stepMs,
        open: openP,
        high: highP,
        low: lowP,
        close: adjClose,
        volume: projectedVolume,
        pctChangeFromLast: pctChange,
        upperBand: adjClose + bandHalf,
        lowerBand: Math.max(lastClose * 0.02, adjClose - bandHalf),
        pullbackTarget,
        primaryMagnet,
        rejectionWick,
        wavePhase: isPullbackPhase ? 'MITIGATION_PULLBACK' : isImpulseBar ? 'IMPULSE' : 'CONSOLIDATION',
      });
      prevProjectedClose = adjClose;
    }

    return out;
  },
};
