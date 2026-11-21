import { TechnicalIndicators } from './technicalIndicators.js?v=1.47.41';
import { GapDetector } from './gapDetector.js?v=1.47.41';

/**
 * TechnicalAnalysisCore (Web ES Module) — Phases A–F of TECHNICAL_ANALYSIS_CORE_IMPLEMENTATION_PLAN_V1.
 *
 * Pure, UI-independent deterministic analysis layer:
 * - Phase A: Strictly validates & normalizes candles (ascending unique timestamps, valid OHLC, closed separation)
 *   without fabricating missing bars or zero warm-up placeholders.
 * - Phase B: Computes canonical indicator series (SMA, EMA, Bollinger Bands, ATR, RSI, MACD, VWAP, Supertrend)
 *   with exact null warm-up semantics and numerical parity with Android Kotlin `TechnicalAnalysisCore`.
 * - Phase C: Causal Swing High/Low pivot detection, sequence-based trend classification, and evidence-backed
 *   Support/Resistance Zones with break/retest/invalidation lifecycle.
 * - Phase D: Deterministic candlestick pattern detection (Doji, Hammer, Shooting Star, Pin Bar, Engulfing)
 *   anchored strictly to real candles with quantitative evidence.
 * - Phases E & F: Versioned Canonical Analysis Result (`ta-core/1.1`) verified by shared cross-platform fixtures.
 */
export const TA_CORE_SCHEMA_VERSION = 'ta-core/1.1';

export const TechnicalAnalysisCore = {
  /**
   * Phase A — Normalize candles deterministically and emit an explicit data quality summary.
   * Rejects non-finite OHLC, non-positive prices, inverted high/low envelopes, and duplicate timestamps.
   */
  normalizeCandles(rawCandles = [], options = {}) {
    const timeframe = String(options.timeframe || 'M15').toUpperCase();
    const symbolCode = String(options.symbolCode || 'SPOTBRENT').toUpperCase();
    const excludeOpenBars = options.excludeOpenBars === true;

    if (!Array.isArray(rawCandles) || rawCandles.length === 0) {
      return {
        candles: [],
        quality: {
          inputCount: 0,
          validCount: 0,
          droppedInvalidCount: 0,
          deduplicatedCount: 0,
          droppedOpenCount: 0,
          wasUnsorted: false,
          gapCount: 0,
          integrityRatio: 1.0,
          rangeStartMs: null,
          rangeEndMs: null,
        },
      };
    }

    let droppedInvalidCount = 0;
    let droppedOpenCount = 0;
    let deduplicatedCount = 0;
    let wasUnsorted = false;
    let prevRawMs = -Infinity;

    const byOpenMs = new Map();
    for (const raw of rawCandles) {
      if (!raw || typeof raw !== 'object') {
        droppedInvalidCount++;
        continue;
      }
      const openMs = Number(raw.open_time_utc_ms ?? (raw.openTimeSec ? raw.openTimeSec * 1000 : NaN));
      const o = Number(raw.open);
      const h = Number(raw.high);
      const l = Number(raw.low);
      const c = Number(raw.close);
      const v = Number(raw.volume ?? 0);
      const isClosed = raw.is_closed !== false;

      if (excludeOpenBars && !isClosed) {
        droppedOpenCount++;
        continue;
      }

      if (
        !Number.isFinite(openMs) ||
        openMs <= 0 ||
        !Number.isFinite(o) ||
        !Number.isFinite(h) ||
        !Number.isFinite(l) ||
        !Number.isFinite(c) ||
        o <= 0 ||
        h <= 0 ||
        l <= 0 ||
        c <= 0 ||
        h < l ||
        h < Math.max(o, c) ||
        l > Math.min(o, c)
      ) {
        droppedInvalidCount++;
        continue;
      }

      if (openMs < prevRawMs) {
        wasUnsorted = true;
      }
      prevRawMs = openMs;

      if (byOpenMs.has(openMs)) {
        deduplicatedCount++;
      }
      byOpenMs.set(openMs, {
        ...raw,
        open_time_utc_ms: Math.trunc(openMs),
        open: o,
        high: h,
        low: l,
        close: c,
        volume: Number.isFinite(v) && v >= 0 ? v : 0,
        is_closed: isClosed,
      });
    }

    const candles = Array.from(byOpenMs.values()).sort((a, b) => a.open_time_utc_ms - b.open_time_utc_ms);
    const gapReport = candles.length >= 2
      ? GapDetector.detectGaps(candles, timeframe, symbolCode)
      : { gapCount: 0, integrityRatio: 1.0 };

    return {
      candles,
      quality: {
        inputCount: rawCandles.length,
        validCount: candles.length,
        droppedInvalidCount,
        deduplicatedCount,
        droppedOpenCount,
        wasUnsorted,
        gapCount: Number(gapReport.gapCount || 0),
        integrityRatio: Number(gapReport.integrityRatio ?? 1.0),
        rangeStartMs: candles.length > 0 ? candles[0].open_time_utc_ms : null,
        rangeEndMs: candles.length > 0 ? candles[candles.length - 1].open_time_utc_ms : null,
      },
    };
  },

  /**
   * Phase B — Compute core deterministic indicator series aligned 1-to-1 with normalized candles.
   * Warm-up entries remain strictly `null`.
   */
  computeCoreIndicators(rawCandles = [], options = {}) {
    const timeframe = String(options.timeframe || 'M15').toUpperCase();
    const symbolCode = String(options.symbolCode || 'SPOTBRENT').toUpperCase();
    const bbPeriod = Math.max(2, Math.min(200, Math.trunc(Number(options.bollingerPeriod ?? 20))));
    const bbStdDev = Math.max(0.5, Math.min(5.0, Number(options.bollingerStdDev ?? 2.0)));

    const { candles, quality } = this.normalizeCandles(rawCandles, {
      timeframe,
      symbolCode,
      excludeOpenBars: options.excludeOpenBars === true,
    });

    return {
      schemaVersion: TA_CORE_SCHEMA_VERSION,
      symbolCode,
      timeframe,
      quality,
      timestamps: candles.map((c) => c.open_time_utc_ms),
      indicators: {
        sma20: TechnicalIndicators.computeSma(candles, 20),
        ema20: TechnicalIndicators.computeEma(candles, 20),
        bollinger: TechnicalIndicators.computeBollingerBands(candles, bbPeriod, bbStdDev),
        atr14: TechnicalIndicators.computeAtr(candles, 14),
        rsi14: TechnicalIndicators.computeRsi(candles, 14),
        macd: TechnicalIndicators.computeMacd(candles, 12, 26, 9),
        vwap: TechnicalIndicators.computeVwap(candles, timeframe, symbolCode),
        supertrend: TechnicalIndicators.computeSupertrend(candles, 10, 3.0),
      },
    };
  },

  /**
   * Phase C — Causal Swing High/Low pivots with explicit confirmation lag (`confirmIndex = index + swingLen`)
   * and deterministic trend classification from confirmed swing sequences.
   */
  detectSwingsAndTrend(candles = [], swingLen = 3) {
    const len = Math.max(1, Math.trunc(Number(swingLen) || 3));
    const n = Array.isArray(candles) ? candles.length : 0;
    if (n < len * 2 + 1) {
      return {
        swingLen: len,
        swings: [],
        trend: 'INSUFFICIENT_DATA',
        trendReason: 'Insufficient bars for causal swing confirmation',
      };
    }

    const swings = [];
    for (let i = len; i <= n - 1 - len; i++) {
      const hi = Number(candles[i].high);
      const lo = Number(candles[i].low);
      let isHigh = true;
      let strictLeftHigh = false;
      let strictRightHigh = false;
      let isLow = true;
      let strictLeftLow = false;
      let strictRightLow = false;

      for (let k = 1; k <= len; k++) {
        const lh = Number(candles[i - k].high);
        const rh = Number(candles[i + k].high);
        if (hi < lh || hi < rh) isHigh = false;
        if (hi > lh) strictLeftHigh = true;
        if (hi > rh) strictRightHigh = true;

        const ll = Number(candles[i - k].low);
        const rl = Number(candles[i + k].low);
        if (lo > ll || lo > rl) isLow = false;
        if (lo < ll) strictLeftLow = true;
        if (lo < rl) strictRightLow = true;
      }

      const confirmIdx = i + len;
      if (isHigh && strictLeftHigh && strictRightHigh) {
        swings.push({
          type: 'SWING_HIGH',
          index: i,
          confirmIndex: confirmIdx,
          openTimeUtcMs: Number(candles[i].open_time_utc_ms || 0),
          confirmTimeUtcMs: Number(candles[confirmIdx].open_time_utc_ms || 0),
          price: hi,
        });
      }
      if (isLow && strictLeftLow && strictRightLow) {
        swings.push({
          type: 'SWING_LOW',
          index: i,
          confirmIndex: confirmIdx,
          openTimeUtcMs: Number(candles[i].open_time_utc_ms || 0),
          confirmTimeUtcMs: Number(candles[confirmIdx].open_time_utc_ms || 0),
          price: lo,
        });
      }
    }

    const highs = swings.filter((s) => s.type === 'SWING_HIGH');
    const lows = swings.filter((s) => s.type === 'SWING_LOW');
    let trend = 'INSUFFICIENT_DATA';
    let trendReason = 'Need at least 2 confirmed swing highs and 2 confirmed swing lows';

    if (highs.length >= 2 && lows.length >= 2) {
      const prevH = highs[highs.length - 2].price;
      const lastH = highs[highs.length - 1].price;
      const prevL = lows[lows.length - 2].price;
      const lastL = lows[lows.length - 1].price;
      if (lastH > prevH && lastL > prevL) {
        trend = 'UPTREND';
        trendReason = 'Confirmed Higher Highs and Higher Lows';
      } else if (lastH < prevH && lastL < prevL) {
        trend = 'DOWNTREND';
        trendReason = 'Confirmed Lower Highs and Lower Lows';
      } else {
        trend = 'RANGE';
        trendReason = 'Mixed confirmed swing highs/lows (consolidation or transition)';
      }
    }

    return {
      swingLen: len,
      swings,
      trend,
      trendReason,
    };
  },

  /**
   * Phase C — Evidence-backed Support/Resistance Zones clustered from confirmed Swing pivots.
   * Requires >= 2 confirmed swing touches; tracks wick rejections, decisive breaks, retests, and invalidation.
   */
  detectSupportResistanceZones(candles = [], swingLen = 3, atrPeriod = 14) {
    const n = Array.isArray(candles) ? candles.length : 0;
    if (n < swingLen * 2 + 2) return [];

    const { swings } = this.detectSwingsAndTrend(candles, swingLen);
    if (swings.length < 2) return [];

    const atrSeries = TechnicalIndicators.computeAtr(candles, atrPeriod);
    let refAtr = 0;
    for (let i = atrSeries.length - 1; i >= 0; i--) {
      if (atrSeries[i] !== null && atrSeries[i] > 0) {
        refAtr = atrSeries[i];
        break;
      }
    }
    const lastClose = Number(candles[n - 1].close || 1);
    if (refAtr <= 0) {
      let meanRange = 0;
      for (let i = 0; i < n; i++) {
        meanRange += Math.max(0, Number(candles[i].high) - Number(candles[i].low));
      }
      refAtr = Math.max(meanRange / n, lastClose * 1e-4);
    }

    const clusterTol = 0.65 * refAtr;
    const minHalfThickness = 0.15 * refAtr;
    const breakBuffer = 0.15 * refAtr;

    const buildSideZones = (sideSwings, role) => {
      const clusters = [];
      for (const sw of sideSwings) {
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let cIdx = 0; cIdx < clusters.length; cIdx++) {
          const dist = Math.abs(sw.price - clusters[cIdx].centerPrice);
          if (dist <= clusterTol && dist < bestDist) {
            bestDist = dist;
            bestIdx = cIdx;
          }
        }
        if (bestIdx >= 0) {
          const cl = clusters[bestIdx];
          cl.touches.push(sw);
          cl.sumPrice += sw.price;
          cl.centerPrice = cl.sumPrice / cl.touches.length;
          cl.rawLow = Math.min(cl.rawLow, sw.price);
          cl.rawHigh = Math.max(cl.rawHigh, sw.price);
        } else {
          clusters.push({
            role,
            touches: [sw],
            sumPrice: sw.price,
            centerPrice: sw.price,
            rawLow: sw.price,
            rawHigh: sw.price,
          });
        }
      }

      const zones = [];
      for (const cl of clusters) {
        // Strict evidence gate: require >= 2 confirmed swing touches (no unsupported levels)
        if (cl.touches.length < 2) continue;
        const lowPrice = Math.min(cl.rawLow, cl.centerPrice - minHalfThickness);
        const highPrice = Math.max(cl.rawHigh, cl.centerPrice + minHalfThickness);
        const firstTouch = cl.touches[0];
        const lastTouch = cl.touches[cl.touches.length - 1];

        let status = 'ACTIVE';
        let wickRejectionCount = 0;
        let breakIndex = null;
        let breakTimeUtcMs = null;
        let retestIndex = null;
        let invalidationReason = null;

        for (let i = lastTouch.confirmIndex + 1; i < n; i++) {
          const h = Number(candles[i].high);
          const l = Number(candles[i].low);
          const c = Number(candles[i].close);

          if (role === 'RESISTANCE') {
            if (status === 'ACTIVE') {
              if (c > highPrice + breakBuffer) {
                status = 'BROKEN';
                breakIndex = i;
                breakTimeUtcMs = Number(candles[i].open_time_utc_ms || 0);
                invalidationReason = 'Decisive close above resistance upper bound';
              } else if (h >= lowPrice && c <= highPrice) {
                wickRejectionCount++;
              }
            } else if (status === 'BROKEN' && l <= highPrice + breakBuffer && c >= lowPrice) {
              status = 'RETESTED';
              retestIndex = i;
            }
          } else {
            if (status === 'ACTIVE') {
              if (c < lowPrice - breakBuffer) {
                status = 'BROKEN';
                breakIndex = i;
                breakTimeUtcMs = Number(candles[i].open_time_utc_ms || 0);
                invalidationReason = 'Decisive close below support lower bound';
              } else if (l <= highPrice && c >= lowPrice) {
                wickRejectionCount++;
              }
            } else if (status === 'BROKEN' && h >= lowPrice - breakBuffer && c <= highPrice) {
              status = 'RETESTED';
              retestIndex = i;
            }
          }
        }

        const distancePct = lastClose > 0 ? ((cl.centerPrice - lastClose) / lastClose) * 100.0 : 0;
        zones.push({
          zoneId: `${role}_${firstTouch.openTimeUtcMs}_${cl.touches.length}`,
          role,
          lowPrice,
          highPrice,
          centerPrice: cl.centerPrice,
          touchCount: cl.touches.length,
          wickRejectionCount,
          startIndex: firstTouch.index,
          lastTouchIndex: lastTouch.index,
          startTimeUtcMs: firstTouch.openTimeUtcMs,
          lastTouchTimeUtcMs: lastTouch.openTimeUtcMs,
          touchIndices: cl.touches.map((t) => t.index),
          touchTimesUtcMs: cl.touches.map((t) => t.openTimeUtcMs),
          status,
          breakIndex,
          breakTimeUtcMs,
          retestIndex,
          invalidationReason,
          distancePct,
        });
      }

      zones.sort((a, b) => {
        if (b.touchCount !== a.touchCount) return b.touchCount - a.touchCount;
        return b.lastTouchIndex - a.lastTouchIndex;
      });
      return zones.slice(0, 4);
    };

    const resistanceZones = buildSideZones(
      swings.filter((s) => s.type === 'SWING_HIGH'),
      'RESISTANCE'
    );
    const supportZones = buildSideZones(
      swings.filter((s) => s.type === 'SWING_LOW'),
      'SUPPORT'
    );

    return [...resistanceZones, ...supportZones].sort((a, b) => b.centerPrice - a.centerPrice);
  },

  /**
   * Phase D — Deterministic Candlestick Pattern Detector anchored to real candle coordinates
   * with explicit quantitative evidence (`bodyRatio`, `upperWickRatio`, `lowerWickRatio`, `rangeAtrRatio`).
   */
  detectCandlestickPatterns(candles = [], atrPeriod = 14) {
    const n = Array.isArray(candles) ? candles.length : 0;
    if (n === 0) return [];

    const atrSeries = TechnicalIndicators.computeAtr(candles, atrPeriod);
    const patterns = [];

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const o = Number(c.open);
      const h = Number(c.high);
      const l = Number(c.low);
      const cl = Number(c.close);
      const range = h - l;
      if (!Number.isFinite(range) || range <= 0) continue;

      let localAtr = atrSeries[i];
      if (localAtr === null || localAtr <= 0) {
        const start = Math.max(0, i - 4);
        let sumR = 0;
        for (let j = start; j <= i; j++) {
          sumR += Math.max(0, Number(candles[j].high) - Number(candles[j].low));
        }
        localAtr = sumR / (i - start + 1);
      }
      if (localAtr <= 0) continue;
      const rangeAtrRatio = range / localAtr;
      if (rangeAtrRatio < 0.25) continue;

      const body = Math.abs(cl - o);
      const upperWick = h - Math.max(o, cl);
      const lowerWick = Math.min(o, cl) - l;
      const bodyRatio = body / range;
      const upperWickRatio = upperWick / range;
      const lowerWickRatio = lowerWick / range;
      const openMs = Number(c.open_time_utc_ms || 0);

      let singleType = null;
      let singleDir = 0;
      let singleShort = '';
      if (bodyRatio <= 0.10 && upperWickRatio >= 0.25 && lowerWickRatio >= 0.25) {
        singleType = 'DOJI';
        singleDir = 0;
        singleShort = 'DOJ';
      } else if (bodyRatio <= 0.35 && lowerWick >= body * 2.0 && upperWickRatio <= 0.15 && cl >= l + 0.65 * range) {
        singleType = 'HAMMER';
        singleDir = 1;
        singleShort = 'HAM';
      } else if (bodyRatio <= 0.35 && upperWick >= body * 2.0 && lowerWickRatio <= 0.15 && cl <= h - 0.65 * range) {
        singleType = 'SHOOTING_STAR';
        singleDir = -1;
        singleShort = 'STR';
      } else if (lowerWickRatio >= 0.62 && bodyRatio <= 0.30 && upperWickRatio <= 0.20) {
        singleType = 'BULLISH_PIN_BAR';
        singleDir = 1;
        singleShort = 'PIN';
      } else if (upperWickRatio >= 0.62 && bodyRatio <= 0.30 && lowerWickRatio <= 0.20) {
        singleType = 'BEARISH_PIN_BAR';
        singleDir = -1;
        singleShort = 'PIN';
      }

      if (singleType !== null) {
        patterns.push({
          patternId: `${singleType}_${openMs}`,
          type: singleType,
          shortLabel: singleShort,
          direction: singleDir,
          anchorIndex: i,
          anchorTimeUtcMs: openMs,
          candleIndices: [i],
          candleTimesUtcMs: [openMs],
          priceLow: l,
          priceHigh: h,
          markerPrice: singleDir >= 0 ? l : h,
          evidence: {
            bodyRatio,
            upperWickRatio,
            lowerWickRatio,
            rangeAtrRatio,
          },
        });
      }

      if (i >= 1) {
        const prev = candles[i - 1];
        const po = Number(prev.open);
        const ph = Number(prev.high);
        const pl = Number(prev.low);
        const pcl = Number(prev.close);
        const prevRange = ph - pl;
        const prevBody = Math.abs(pcl - po);
        const prevOpenMs = Number(prev.open_time_utc_ms || 0);

        if (prevRange > 0 && prevBody >= 0.15 * prevRange && body >= prevBody * 1.05) {
          if (pcl < po && cl > o && o <= pcl && cl >= po) {
            patterns.push({
              patternId: `BULLISH_ENGULFING_${openMs}`,
              type: 'BULLISH_ENGULFING',
              shortLabel: 'ENG',
              direction: 1,
              anchorIndex: i,
              anchorTimeUtcMs: openMs,
              candleIndices: [i - 1, i],
              candleTimesUtcMs: [prevOpenMs, openMs],
              priceLow: Math.min(pl, l),
              priceHigh: Math.max(ph, h),
              markerPrice: l,
              evidence: {
                bodyRatio,
                upperWickRatio,
                lowerWickRatio,
                rangeAtrRatio,
              },
            });
          } else if (pcl > po && cl < o && o >= pcl && cl <= po) {
            patterns.push({
              patternId: `BEARISH_ENGULFING_${openMs}`,
              type: 'BEARISH_ENGULFING',
              shortLabel: 'ENG',
              direction: -1,
              anchorIndex: i,
              anchorTimeUtcMs: openMs,
              candleIndices: [i - 1, i],
              candleTimesUtcMs: [prevOpenMs, openMs],
              priceLow: Math.min(pl, l),
              priceHigh: Math.max(ph, h),
              markerPrice: h,
              evidence: {
                bodyRatio,
                upperWickRatio,
                lowerWickRatio,
                rangeAtrRatio,
              },
            });
          }
        }
      }
    }

    return patterns;
  },

  /**
   * Phases E & F — Canonical Analysis Result (`ta-core/1.1`) unifying quality, core indicators,
   * market structures (swings + trend + S/R zones), and candlestick patterns.
   */
  buildCanonicalAnalysis(rawCandles = [], options = {}) {
    const timeframe = String(options.timeframe || 'M15').toUpperCase();
    const symbolCode = String(options.symbolCode || 'SPOTBRENT').toUpperCase();
    const swingLen = Math.max(1, Math.trunc(Number(options.swingLen ?? 3)));
    const bbPeriod = Math.max(2, Math.min(200, Math.trunc(Number(options.bollingerPeriod ?? 20))));
    const bbStdDev = Math.max(0.5, Math.min(5.0, Number(options.bollingerStdDev ?? 2.0)));

    const { candles, quality } = this.normalizeCandles(rawCandles, {
      timeframe,
      symbolCode,
      excludeOpenBars: options.excludeOpenBars === true,
    });

    const core = this.computeCoreIndicators(candles, {
      timeframe,
      symbolCode,
      bollingerPeriod: bbPeriod,
      bollingerStdDev: bbStdDev,
    });
    const swingResult = this.detectSwingsAndTrend(candles, swingLen);
    const zones = this.detectSupportResistanceZones(candles, swingLen, 14);
    const patterns = this.detectCandlestickPatterns(candles, 14);

    return {
      schemaVersion: TA_CORE_SCHEMA_VERSION,
      symbolCode,
      timeframe,
      quality,
      timestamps: core.timestamps,
      indicators: core.indicators,
      structures: {
        swingLen: swingResult.swingLen,
        trend: swingResult.trend,
        trendReason: swingResult.trendReason,
        swings: swingResult.swings,
        zones,
      },
      patterns,
    };
  },
};
