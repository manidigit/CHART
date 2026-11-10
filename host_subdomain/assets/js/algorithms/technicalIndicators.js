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
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const out = new Array(candles.length).fill(null);
    for (let i = period - 1; i < candles.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += Number(candles[j].close || 0);
      }
      const mean = sum / period;
      let sqSum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const diff = Number(candles[j].close || 0) - mean;
        sqSum += diff * diff;
      }
      const std = Math.sqrt(sqSum / period);
      out[i] = {
        middle: mean,
        upper: mean + stdMult * std,
        lower: mean - stdMult * std,
      };
    }
    return out;
  },

  hasNonZeroVolume(candles = []) {
    if (!Array.isArray(candles)) return false;
    return candles.some((c) => Number(c.volume || 0) > 0);
  },
};
