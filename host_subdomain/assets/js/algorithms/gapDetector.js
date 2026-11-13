import { PriceFormatter } from './priceFormatter.js?v=1.39.0';

/**
 * ENG-03 · Web Client Gap Detector Engine matching GapDetector.php & GapDetectorAlgorithm.kt.
 */
export const GapDetector = {
  isTradingSlotExpected(openMs, timeframe = 'M15', symbolCode = 'XAUUSD') {
    const tf = String(timeframe || 'M15').toUpperCase();
    const cal = PriceFormatter.getSessionCalendar(symbolCode);
    if (cal === 'CRYPTO_24_7' || tf === 'W1') return true;
    if (tf === 'D1') {
      const dow = new Date(Number(openMs)).getUTCDay();
      return dow >= 1 && dow <= 5;
    }
    const stepMs = PriceFormatter.stepMilliseconds(tf);
    return PriceFormatter.isMarketOpen(Number(openMs) + Math.floor(stepMs / 2), symbolCode);
  },

  detectGaps(candles = [], timeframe = 'M15', symbolCode = 'XAUUSD', nowMs = Date.now()) {
    const tf = String(timeframe || 'M15').toUpperCase();
    const stepMs = Math.max(60000, PriceFormatter.stepMilliseconds(tf));
    const count = Array.isArray(candles) ? candles.length : 0;
    if (count < 2) {
      return {
        gaps_found: 0,
        missing_bars_total: 0,
        largest_gap_start_utc: null,
        largest_gap_end_utc: null,
        status: count === 0 ? 'NO_DATA' : 'CLEAN',
        checked_bars: count,
        checked_at_utc_ms: nowMs,
        windows: [],
      };
    }

    const slice = count > 1500 ? candles.slice(-1500) : candles;
    const windows = [];
    let missingTotal = 0;
    let largestCount = 0;
    let largestStart = null;
    let largestEnd = null;

    for (let i = 1; i < slice.length; i++) {
      const prevMs = Number(slice[i - 1].open_time_utc_ms || 0);
      const curMs = Number(slice[i].open_time_utc_ms || 0);
      if (prevMs <= 0 || curMs <= prevMs) continue;
      const diffMs = curMs - prevMs;
      if (diffMs <= stepMs + Math.floor(stepMs / 2)) continue;
      const rawSteps = Math.floor(diffMs / stepMs) - 1;
      if (rawSteps <= 0) continue;

      let expectedMissing = 0;
      if (rawSteps <= 2000) {
        for (let cursor = prevMs + stepMs; cursor < curMs - Math.floor(stepMs / 4); cursor += stepMs) {
          if (this.isTradingSlotExpected(cursor, tf, symbolCode)) {
            expectedMissing++;
          }
        }
      } else {
        const cal = PriceFormatter.getSessionCalendar(symbolCode);
        const ratio = cal === 'CRYPTO_24_7' ? 1 : cal === 'US_EQUITIES' ? (tf === 'D1' ? 5 / 7 : (5 / 7) * (6.5 / 24)) : 5 / 7;
        expectedMissing = Math.max(1, Math.round(rawSteps * ratio));
      }

      if (expectedMissing > 0) {
        missingTotal += expectedMissing;
        const gapStart = prevMs + stepMs;
        const gapEnd = curMs - stepMs;
        if (expectedMissing > largestCount) {
          largestCount = expectedMissing;
          largestStart = gapStart;
          largestEnd = gapEnd;
        }
        windows.push({
          start_utc_ms: gapStart,
          end_utc_ms: Math.max(gapStart, gapEnd),
          missing_bars: expectedMissing,
        });
      }
    }

    return {
      gaps_found: windows.length,
      missing_bars_total: missingTotal,
      largest_gap_start_utc: largestStart,
      largest_gap_end_utc: largestEnd,
      status: windows.length > 0 ? 'GAP_OPEN' : 'CLEAN',
      checked_bars: slice.length,
      checked_at_utc_ms: nowMs,
      windows: windows.slice(-25),
    };
  },
};
