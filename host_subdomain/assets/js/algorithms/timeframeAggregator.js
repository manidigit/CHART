import { PriceFormatter } from './priceFormatter.js?v=1.40.1';

/**
 * Independent Web Algorithm Module:
 * Deterministic 00:00:00 UTC OHLCV candle aggregation across M15, H1, H4, and D1.
 */
export const TimeframeAggregator = {
  aggregate(sourceCandles, targetTimeframe, nowMs = Date.now(), symbolCode = 'XAUUSD', sourceTimeframe = null) {
    return this.aggregateCandles(sourceCandles, targetTimeframe, nowMs, symbolCode, sourceTimeframe);
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

  minExpectedChildren(sourceStepMs, targetStepMs, targetTf, symbolCode, sourceTf = null) {
    const dst = String(targetTf || 'M15').toUpperCase();
    const cal = PriceFormatter.getSessionCalendar(symbolCode);
    const isUsEq = cal === 'US_EQUITIES';
    const isCrypto = cal === 'CRYPTO_24_7';

    let src = sourceTf ? String(sourceTf).toUpperCase() : null;
    if (!src) {
      if (sourceStepMs === 900000) src = 'M15';
      else if (sourceStepMs === 1800000) src = 'M30';
      else if (sourceStepMs === 3600000) src = 'H1';
      else if (sourceStepMs === 14400000) src = 'H4';
      else if (sourceStepMs === 86400000) src = 'D1';
    }

    if (src) {
      switch (`${src}->${dst}`) {
        case 'M15->M30': return 2;
        case 'M15->H1': return isUsEq ? 2 : 3;
        case 'M15->H4': return isUsEq ? 6 : 8;
        case 'M30->H1': return 2;
        case 'M30->H4': return isUsEq ? 3 : 4;
        case 'H1->H4': return 2;
        case 'H1->D1': return isUsEq ? 5 : 12;
        case 'H4->D1': return isUsEq ? 2 : 3;
        case 'D1->W1': return isCrypto ? 5 : 3;
        default: return 1;
      }
    }

    if (sourceStepMs <= 0 || sourceStepMs >= targetStepMs) return 1;
    if (dst === 'W1' && sourceStepMs >= 86400000) {
      return isCrypto ? 5 : 3;
    }
    const ratio = Math.floor(targetStepMs / sourceStepMs);
    if (dst === 'D1' && sourceStepMs < 86400000) {
      return isUsEq
        ? Math.max(1, Math.floor(ratio * 0.2))
        : Math.max(2, Math.floor(ratio * 0.5));
    }
    return isUsEq
      ? Math.max(1, Math.floor(ratio * 0.25))
      : Math.max(2, Math.ceil(ratio * 0.5));
  },

  hasContiguousChildren(bars, sourceStepMs, targetTf, symbolCode) {
    if (!Array.isArray(bars) || bars.length <= 1 || sourceStepMs <= 0) return true;
    const cal = PriceFormatter.getSessionCalendar(symbolCode);
    const maxOpenGapSteps = targetTf === 'D1' || targetTf === 'W1' ? 4 : 2;
    for (let i = 1; i < bars.length; i++) {
      const prevMs = Number(
        bars[i - 1].open_time_utc_ms || (bars[i - 1].openTimeSec ? bars[i - 1].openTimeSec * 1000 : 0)
      );
      const curMs = Number(
        bars[i].open_time_utc_ms || (bars[i].openTimeSec ? bars[i].openTimeSec * 1000 : 0)
      );
      const diffMs = curMs - prevMs;
      if (diffMs <= sourceStepMs * maxOpenGapSteps) continue;
      if (cal === 'CRYPTO_24_7') return false;
      let openMissingSteps = 0;
      let probeMs = prevMs + sourceStepMs;
      let guard = 0;
      while (probeMs < curMs && guard < 96) {
        if (PriceFormatter.isMarketOpen(probeMs, symbolCode)) {
          openMissingSteps++;
          if (openMissingSteps >= maxOpenGapSteps) return false;
        }
        probeMs += sourceStepMs;
        guard++;
      }
    }
    return true;
  },

  aggregateCandles(sourceCandles, targetTimeframe, nowMs = Date.now(), symbolCode = 'XAUUSD', sourceTimeframe = null) {
    if (!Array.isArray(sourceCandles) || sourceCandles.length === 0) return [];
    const normTf = String(targetTimeframe || 'M15').toUpperCase();
    const targetStep = PriceFormatter.stepMilliseconds(normTf);
    const sorted = [...sourceCandles].sort(
      (a, b) =>
        Number(a.open_time_utc_ms || a.openTimeSec * 1000 || 0) -
        Number(b.open_time_utc_ms || b.openTimeSec * 1000 || 0)
    );

    const sourceStepMs = sourceTimeframe
      ? PriceFormatter.stepMilliseconds(sourceTimeframe)
      : this.inferSourceStepMs(sorted);
    const minChildren = this.minExpectedChildren(sourceStepMs, targetStep, normTf, symbolCode, sourceTimeframe);

    const buckets = new Map();
    for (const bar of sorted) {
      const openMs = Number(bar.open_time_utc_ms || (bar.openTimeSec ? bar.openTimeSec * 1000 : 0));
      if (!openMs) continue;
      const bounds = PriceFormatter.getSessionBucketBounds(openMs, normTf, symbolCode);
      const bucketOpen = bounds.openMs;
      const bucketClose = bounds.closeMs;
      if (bucketClose > nowMs) continue;
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
    const result = [];

    for (let idx = 0; idx < bucketKeys.length; idx++) {
      const bucketOpen = bucketKeys[idx];
      const bars = buckets.get(bucketOpen);
      if (!bars || bars.length === 0) continue;
      // Reject ANY bucket with fewer than minChildren bars to prevent emitting incomplete candles
      if (bars.length < minChildren) {
        continue;
      }
      if (!this.hasContiguousChildren(bars, sourceStepMs, normTf, symbolCode)) {
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
