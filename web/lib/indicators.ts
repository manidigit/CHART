export type VerifiedCandle = {
  openTimeUtcMs: number;
  closeTimeUtcMs: number;
  high: number;
  low: number;
  close: number;
  isComplete: boolean;
  qualityStatus: "VERIFIED" | "ESTIMATED" | "UNCERTAIN" | "REJECTED";
};

export type TechnicalSnapshot = {
  candleCount: number;
  asOfUtcMs: number;
  close: number;
  sma20: number;
  ema50: number;
  rsi14: number;
  atr14: number;
  trend: "BULLISH" | "BEARISH" | "NEUTRAL";
};

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ema(values: number[], period: number): number {
  const alpha = 2 / (period + 1);
  let result = mean(values.slice(0, period));
  for (const value of values.slice(period)) result = alpha * value + (1 - alpha) * result;
  return result;
}

function wilderRsi(values: number[], period: number): number {
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

function wilderAtr(candles: VerifiedCandle[], period: number): number {
  const ranges = candles.slice(1).map((candle, index) => {
    const previousClose = candles[index].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });
  let result = mean(ranges.slice(0, period));
  for (const range of ranges.slice(period)) result = (result * (period - 1) + range) / period;
  return result;
}

/**
 * Canonical indicator calculation for closed, verified M15 data.
 * The caller must supply a single instrument/provider series in ascending time order.
 */
export function computeTechnicalSnapshot(input: VerifiedCandle[]): TechnicalSnapshot | null {
  const candles = input
    .filter((candle) => candle.isComplete && candle.qualityStatus === "VERIFIED")
    .sort((a, b) => a.openTimeUtcMs - b.openTimeUtcMs);

  if (candles.length < 51) return null;
  const closes = candles.map((candle) => candle.close);
  if (closes.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  if (candles.some((candle) =>
    !Number.isFinite(candle.high) || !Number.isFinite(candle.low) ||
    candle.high < candle.low || candle.high < candle.close || candle.low > candle.close
  )) return null;

  for (let index = 1; index < candles.length; index++) {
    if (candles[index].openTimeUtcMs <= candles[index - 1].openTimeUtcMs) return null;
  }

  const latest = candles[candles.length - 1];
  const sma20 = mean(closes.slice(-20));
  const ema50 = ema(closes, 50);
  const rsi14 = wilderRsi(closes.slice(-15), 14);
  const atr14 = wilderAtr(candles.slice(-15), 14);
  const trend = latest.close > ema50 && latest.close > sma20 && rsi14 >= 55
    ? "BULLISH"
    : latest.close < ema50 && latest.close < sma20 && rsi14 <= 45
      ? "BEARISH"
      : "NEUTRAL";

  return {
    candleCount: candles.length,
    asOfUtcMs: latest.closeTimeUtcMs,
    close: latest.close,
    sma20,
    ema50,
    rsi14,
    atr14,
    trend,
  };
}
