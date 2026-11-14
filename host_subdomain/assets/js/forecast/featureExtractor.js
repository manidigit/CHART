import { extractCandleClose, extractCandleOpenMs } from './forecastContract.js?v=1.42.0';

export const MARKET_REGIME = Object.freeze({
  TRENDING_UP: 'TRENDING_UP',
  TRENDING_DOWN: 'TRENDING_DOWN',
  RANGING: 'RANGING',
  HIGH_VOLATILITY: 'HIGH_VOLATILITY',
});

/**
 * Extracts stationary log returns, conditional EWMA volatility, ATR(14), RSI(14),
 * body/wick micro-structure ratios, and market regime classification.
 */
export function extractForecastFeatures(candles = [], maxLookback = 180) {
  const clean = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const open = Number(c?.open);
    const high = Number(c?.high);
    const low = Number(c?.low);
    const close = extractCandleClose(c);
    if (Number.isFinite(open) && Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(close) && open > 0 && close > 0) {
      clean.push({
        open,
        high: Math.max(high, open, close),
        low: Math.max(1e-8, Math.min(low, open, close)),
        close,
        volume: Math.max(0, Number(c?.volume || 0)),
        openTimeUtcMs: extractCandleOpenMs(c, 0),
      });
    }
  }

  const slice = clean.length > maxLookback ? clean.slice(clean.length - maxLookback) : clean;
  const n = slice.length;
  if (n < 2) {
    return null;
  }

  const closes = slice.map((c) => c.close);
  const logReturns = [];
  for (let i = 1; i < n; i++) {
    const r = Math.log(closes[i] / closes[i - 1]);
    logReturns.push(Number.isFinite(r) ? r : 0);
  }

  const rCount = logReturns.length;
  let meanReturn = 0;
  for (let i = 0; i < rCount; i++) meanReturn += logReturns[i];
  meanReturn /= Math.max(1, rCount);

  let varSum = 0;
  for (let i = 0; i < rCount; i++) {
    const diff = logReturns[i] - meanReturn;
    varSum += diff * diff;
  }
  const uncondVariance = Math.max(1e-10, varSum / Math.max(1, rCount - 1));
  const uncondSigma = Math.sqrt(uncondVariance);

  // EWMA conditional variance (RiskMetrics lambda = 0.94)
  let ewmaVar = uncondVariance;
  const lambda = 0.94;
  for (let i = 0; i < rCount; i++) {
    ewmaVar = lambda * ewmaVar + (1 - lambda) * (logReturns[i] * logReturns[i]);
  }
  const ewmaSigma = Math.max(1e-5, Math.sqrt(ewmaVar));

  // Realized vol ratio (short 8 vs long 32)
  const shortWin = logReturns.slice(-Math.min(8, rCount));
  const longWin = logReturns.slice(-Math.min(32, rCount));
  const rms = (arr) => Math.sqrt(arr.reduce((acc, v) => acc + v * v, 0) / Math.max(1, arr.length));
  const shortVol = Math.max(1e-6, rms(shortWin));
  const longVol = Math.max(1e-6, rms(longWin));
  const realizedVolRatio = shortVol / longVol;

  // ATR(14) & body/wick microstructure
  const atrPeriod = Math.min(14, n - 1);
  let trSum = 0;
  let bodyRatioSum = 0;
  let upperWickSum = 0;
  let lowerWickSum = 0;
  const lastClose = closes[n - 1];

  for (let i = n - atrPeriod; i < n; i++) {
    const cur = slice[i];
    const prevC = slice[i - 1].close;
    const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prevC), Math.abs(cur.low - prevC));
    trSum += tr;
    const rng = Math.max(cur.high - cur.low, lastClose * 0.0005);
    bodyRatioSum += Math.abs(cur.close - cur.open) / rng;
    upperWickSum += (cur.high - Math.max(cur.open, cur.close)) / rng;
    lowerWickSum += (Math.min(cur.open, cur.close) - cur.low) / rng;
  }

  const atr14 = Math.max(trSum / Math.max(1, atrPeriod), lastClose * 0.0008);
  const atrPct = atr14 / lastClose;
  const avgBodyRatio = Math.max(0.3, Math.min(0.72, bodyRatioSum / Math.max(1, atrPeriod)));
  const avgUpperWickRatio = Math.max(0.1, Math.min(0.42, upperWickSum / Math.max(1, atrPeriod)));
  const avgLowerWickRatio = Math.max(0.1, Math.min(0.42, lowerWickSum / Math.max(1, atrPeriod)));

  // RSI(14) on log returns
  let gains = 0;
  let losses = 0;
  const rsiStart = Math.max(0, rCount - 14);
  const rsiLen = Math.max(1, rCount - rsiStart);
  for (let i = rsiStart; i < rCount; i++) {
    const r = logReturns[i];
    if (r >= 0) gains += r;
    else losses += Math.abs(r);
  }
  const avgGain = gains / rsiLen;
  const avgLoss = losses / rsiLen;
  const rsi14 = avgLoss <= 1e-12 ? (avgGain > 0 ? 100 : 50) : 100 - 100 / (1 + avgGain / avgLoss);

  // Recent 20-bar drift z-score
  const recentWin = logReturns.slice(-Math.min(20, rCount));
  const recentMean = recentWin.reduce((a, b) => a + b, 0) / Math.max(1, recentWin.length);
  const driftZ = recentMean / Math.max(1e-6, ewmaSigma / Math.sqrt(Math.max(1, recentWin.length)));

  let regime = MARKET_REGIME.RANGING;
  if (realizedVolRatio > 1.38 || atrPct > uncondSigma * 2.15) {
    regime = MARKET_REGIME.HIGH_VOLATILITY;
  } else if (driftZ > 1.15 && rsi14 > 54) {
    regime = MARKET_REGIME.TRENDING_UP;
  } else if (driftZ < -1.15 && rsi14 < 46) {
    regime = MARKET_REGIME.TRENDING_DOWN;
  }

  return {
    candles: slice,
    barCount: n,
    lastCandle: slice[n - 1],
    lastClose,
    lastOpenMs: slice[n - 1].openTimeUtcMs,
    logReturns,
    meanReturn,
    recentMeanReturn: recentMean,
    uncondVariance,
    uncondSigma,
    ewmaSigma,
    shortVol,
    longVol,
    realizedVolRatio,
    atr14,
    atrPct,
    rsi14,
    driftZ,
    regime,
    avgBodyRatio,
    avgUpperWickRatio,
    avgLowerWickRatio,
  };
}
