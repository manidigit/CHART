import { PriceFormatter } from './priceFormatter.js?v=1.38.0';

/**
 * Independent Web Algorithm Module:
 * Deterministic 00:00:00 UTC OHLCV candle aggregation across M15, H1, H4, and D1.
 */
export const TimeframeAggregator = {
  aggregate(sourceCandles, targetTimeframe, nowMs = Date.now(), symbolCode = 'XAUUSD') {
    return this.aggregateCandles(sourceCandles, targetTimeframe, nowMs, symbolCode);
  },

  inferSourceStepMs(sortedCandles) {
    let minDiff = Infinity;
    let prev = null;
    const limit = Math.min(40, sortedCandles.length);
    for (let i = 0; i < limit; i++) {
      const ms = Number(
        sortedCandles[i].open_time_utc_ms ||
          (sortedCandles[i].openTimeSec ? sortedCandles[i].openTimeSec * 1000 : 0)
      );
      if (prev !== null && ms > prev) {
        const diff = ms - prev;
        if (diff < minDiff) minDiff = diff;
      }
      prev = ms;
    }
    return Number.isFinite(minDiff) ? minDiff : PriceFormatter.stepMilliseconds('M15');
  },

  minExpectedChildren(sourceStepMs, targetStepMs, targetTf, symbolCode) {
    if (sourceStepMs <= 0 || sourceStepMs >= targetStepMs) return 1;
    const cal = PriceFormatter.getSessionCalendar(symbolCode);
    if (targetTf === 'W1' && sourceStepMs >= 86400000) {
      return cal === 'CRYPTO_24_7' ? 5 : 3;
    }
    const ratio = Math.floor(targetStepMs / sourceStepMs);
    if (targetTf === 'D1' && sourceStepMs < 86400000) {
      return cal === 'US_EQUITIES'
        ? Math.max(1, Math.floor(ratio * 0.2))
        : Math.max(2, Math.floor(ratio * 0.5));
    }
    return cal === 'US_EQUITIES'
      ? Math.max(1, Math.floor(ratio * 0.25))
      : Math.max(2, Math.ceil(ratio * 0.5));
  },

  aggregateCandles(sourceCandles, targetTimeframe, nowMs = Date.now(), symbolCode = 'XAUUSD') {
    if (!Array.isArray(sourceCandles) || sourceCandles.length === 0) return [];
    const normTf = String(targetTimeframe || 'M15').toUpperCase();
    const targetStep = PriceFormatter.stepMilliseconds(normTf);
    const sorted = [...sourceCandles].sort(
      (a, b) =>
        Number(a.open_time_utc_ms || a.openTimeSec * 1000 || 0) -
        Number(b.open_time_utc_ms || b.openTimeSec * 1000 || 0)
    );

    const sourceStepMs = this.inferSourceStepMs(sorted);
    const minChildren = this.minExpectedChildren(sourceStepMs, targetStep, normTf, symbolCode);

    const buckets = new Map();
    for (const bar of sorted) {
      const openMs = Number(bar.open_time_utc_ms || (bar.openTimeSec ? bar.openTimeSec * 1000 : 0));
      if (!openMs) continue;
      const bucketOpen = PriceFormatter.snapToOpenUtcMs(openMs, normTf);
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

    const bucketKeys = Array.from(buckets.keys()).sort((a, b) => a - b);
    const lastIdx = bucketKeys.length - 1;
    const result = [];

    for (let idx = 0; idx < bucketKeys.length; idx++) {
      const bucketOpen = bucketKeys[idx];
      const bars = buckets.get(bucketOpen);
      if (!bars || bars.length === 0) continue;
      if ((idx === 0 || idx === lastIdx) && bars.length < minChildren) {
        continue;
      }
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
