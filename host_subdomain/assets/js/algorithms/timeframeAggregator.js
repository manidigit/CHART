import { PriceFormatter } from './priceFormatter.js?v=1.28.6';

/**
 * Independent Web Algorithm Module:
 * Deterministic 00:00:00 UTC OHLCV candle aggregation across M15, H1, H4, and D1.
 */
export const TimeframeAggregator = {
  aggregate(sourceCandles, targetTimeframe, nowMs = Date.now()) {
    return this.aggregateCandles(sourceCandles, targetTimeframe, nowMs);
  },
  aggregateCandles(sourceCandles, targetTimeframe, nowMs = Date.now()) {
    if (!Array.isArray(sourceCandles) || sourceCandles.length === 0) return [];
    const targetStep = PriceFormatter.stepMilliseconds(targetTimeframe);
    const sorted = [...sourceCandles].sort(
      (a, b) =>
        Number(a.open_time_utc_ms || a.openTimeSec * 1000 || 0) -
        Number(b.open_time_utc_ms || b.openTimeSec * 1000 || 0)
    );

    const buckets = new Map();
    for (const bar of sorted) {
      const openMs = Number(bar.open_time_utc_ms || (bar.openTimeSec ? bar.openTimeSec * 1000 : 0));
      if (!openMs) continue;
      const bucketOpen = Math.floor(openMs / targetStep) * targetStep;
      if (bucketOpen + targetStep > nowMs) continue;
      if (!buckets.has(bucketOpen)) {
        buckets.set(bucketOpen, []);
      }
      const arr = buckets.get(bucketOpen);
      const lastOpen = arr.length
        ? Number(arr[arr.length - 1].open_time_utc_ms || arr[arr.length - 1].openTimeSec * 1000)
        : 0;
      if (arr.length === 0 || lastOpen !== openMs) {
        arr.push(bar);
      } else {
        arr[arr.length - 1] = bar;
      }
    }

    const result = [];
    for (const [bucketOpen, bars] of buckets.entries()) {
      if (bars.length === 0) continue;
      const open = Number(bars[0].open);
      const close = Number(bars[bars.length - 1].close);
      let high = Number(bars[0].high);
      let low = Number(bars[0].low);
      let volume = 0;
      for (const b of bars) {
        high = Math.max(high, Number(b.high));
        low = Math.min(low, Number(b.low));
        volume += Number(b.volume || 0);
      }
      const iso = new Date(bucketOpen).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
      result.push({
        open_time_utc_ms: bucketOpen,
        open_time_utc_iso: iso,
        openTimeSec: Math.floor(bucketOpen / 1000),
        openTimeUtc: iso,
        open,
        high,
        low,
        close,
        volume,
        is_closed: true,
      });
    }
    return result;
  },
};
