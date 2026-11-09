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

  hasNonZeroVolume(candles = []) {
    if (!Array.isArray(candles)) return false;
    return candles.some((c) => Number(c.volume || 0) > 0);
  },
};
