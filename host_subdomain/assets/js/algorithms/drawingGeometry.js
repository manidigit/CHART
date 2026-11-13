/**
 * Independent Web Algorithm Module:
 * Geometric hit-testing, snapping, and coordinate conversion for market-anchored chart drawings.
 */
export const PHASE2_DRAWING_TOOLS = new Set([
  'avwap',
  'regression_channel',
  'frvp',
  'gann_fan',
  'gann_box',
  'pitchfork',
  'fib_time_zone',
  'cyclic_lines',
  'fib_speed_fan',
  'abcd_pattern',
  'xabcd_pattern',
  'head_shoulders',
]);

export const DrawingGeometry = {
  requiredAnchorsForTool(tool) {
    switch (String(tool || 'cursor')) {
      case 'horizontal_line':
      case 'hline':
      case 'vertical_line':
      case 'vline':
      case 'long_position':
      case 'short_position':
      case 'avwap':
        return 1;
      case 'trend_line':
      case 'trend':
      case 'fib_retracement':
      case 'fib':
      case 'regression_channel':
      case 'frvp':
      case 'gann_fan':
      case 'gann_box':
      case 'fib_time_zone':
      case 'cyclic_lines':
      case 'fib_speed_fan':
        return 2;
      case 'pitchfork':
        return 3;
      case 'abcd_pattern':
        return 4;
      case 'xabcd_pattern':
      case 'head_shoulders':
        return 5;
      default:
        return 0;
    }
  },

  extractAnchors(drawing) {
    if (!drawing || typeof drawing !== 'object') return [];
    if (Array.isArray(drawing.anchors) && drawing.anchors.length > 0) {
      return drawing.anchors.map((a) => ({
        timeUtcMillis: Number(a.timeUtcMillis || 0),
        price: Number(a.price || 0),
      }));
    }
    if (drawing.startTimeUtcMillis !== undefined || drawing.endTimeUtcMillis !== undefined) {
      return [
        {
          timeUtcMillis: Number(drawing.startTimeUtcMillis || 0),
          price: Number(drawing.startPrice !== undefined ? drawing.startPrice : drawing.price1 || 0),
        },
        {
          timeUtcMillis: Number(drawing.endTimeUtcMillis || 0),
          price: Number(drawing.endPrice !== undefined ? drawing.endPrice : drawing.price2 || 0),
        },
      ];
    }
    if (drawing.timeUtcMillis !== undefined || drawing.price !== undefined) {
      return [
        {
          timeUtcMillis: Number(drawing.timeUtcMillis || 0),
          price: Number(drawing.price !== undefined ? drawing.price : drawing.price1 || 0),
        },
      ];
    }
    return [];
  },

  snapToCandleOhlc(open, high, low, close, rawPrice) {
    const p = Number(rawPrice);
    const candidates = [Number(open), Number(high), Number(low), Number(close)];
    let best = candidates[0];
    let minDiff = Math.abs(p - best);
    for (let i = 1; i < candidates.length; i++) {
      const diff = Math.abs(p - candidates[i]);
      if (diff < minDiff) {
        minDiff = diff;
        best = candidates[i];
      }
    }
    return best;
  },

  computeFibLevels(startPrice, endPrice) {
    const s = Number(startPrice);
    const e = Number(endPrice);
    const diff = e - s;
    const ratios = [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
    return ratios.map((r) => ({
      ratio: r,
      price: s + r * diff,
      label: r === 0.5 ? '0.500 (Mid)' : r === 0.618 ? '0.618 (Golden)' : r.toFixed(3),
    }));
  },

  /**
   * 1. Anchored VWAP from tapped bar's UTC timestamp forward.
   */
  computeAnchoredVwap(candles, anchorTimeMs) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const hasRealVol = candles.some((c) => Number(c.volume || 0) > 0);
    const points = [];
    let cumPv = 0;
    let cumVol = 0;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const t = Number(c.open_time_utc_ms || (c.openTimeSec ? c.openTimeSec * 1000 : 0));
      if (t < Number(anchorTimeMs)) continue;
      const h = Number(c.high || 0);
      const l = Number(c.low || 0);
      const cl = Number(c.close || 0);
      const tp = (h + l + cl) / 3;
      const vol = hasRealVol ? Math.max(0, Number(c.volume || 0)) : 1.0;
      const effVol = vol > 0 ? vol : hasRealVol ? 0 : 1.0;
      cumPv += tp * effVol;
      cumVol += effVol;
      if (cumVol > 0) {
        points.push({ index: i, timeUtcMillis: t, price: cumPv / cumVol });
      }
    }
    return points;
  },

  /**
   * 2. Linear Regression Channel (OLS slope + ±2σ parallel bands).
   */
  computeRegressionChannel(candles, t1Ms, t2Ms, fallbackP1, fallbackP2) {
    const loT = Math.min(Number(t1Ms), Number(t2Ms));
    const hiT = Math.max(Number(t1Ms), Number(t2Ms));
    const sliced = [];
    if (Array.isArray(candles)) {
      for (const c of candles) {
        const t = Number(c.open_time_utc_ms || (c.openTimeSec ? c.openTimeSec * 1000 : 0));
        if (t >= loT && t <= hiT) sliced.push({ t, close: Number(c.close || 0) });
      }
    }
    if (sliced.length < 2) {
      return {
        startTimeMs: loT,
        endTimeMs: hiT,
        midStart: Number(t1Ms) <= Number(t2Ms) ? Number(fallbackP1) : Number(fallbackP2),
        midEnd: Number(t1Ms) <= Number(t2Ms) ? Number(fallbackP2) : Number(fallbackP1),
        stdDev: 0,
        slope: 0,
        barCount: sliced.length,
      };
    }
    const n = sliced.length;
    const meanX = (n - 1) / 2;
    let sumY = 0;
    for (let i = 0; i < n; i++) sumY += sliced[i].close;
    const meanY = sumY / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const dx = i - meanX;
      num += dx * (sliced[i].close - meanY);
      den += dx * dx;
    }
    const slope = den > 1e-12 ? num / den : 0;
    const intercept = meanY - slope * meanX;
    let sqErr = 0;
    for (let i = 0; i < n; i++) {
      const pred = slope * i + intercept;
      const err = sliced[i].close - pred;
      sqErr += err * err;
    }
    const stdDev = Math.sqrt(sqErr / n);
    return {
      startTimeMs: sliced[0].t,
      endTimeMs: sliced[n - 1].t,
      midStart: intercept,
      midEnd: slope * (n - 1) + intercept,
      stdDev,
      slope,
      barCount: n,
    };
  },

  /**
   * 4. Gann Fan standard angle ratios.
   */
  gannAngleSpecs() {
    return [
      { label: '8x1', mult: 8.0 },
      { label: '4x1', mult: 4.0 },
      { label: '3x1', mult: 3.0 },
      { label: '2x1', mult: 2.0 },
      { label: '1x1', mult: 1.0 },
      { label: '1x2', mult: 0.5 },
      { label: '1x3', mult: 1 / 3 },
      { label: '1x4', mult: 0.25 },
      { label: '1x8', mult: 0.125 },
    ];
  },

  /**
   * 6. Pitchfork Geometry across 4 variants: original, schiff, mod_schiff, inside.
   */
  computePitchforkGeometry(anchors, variant = 'original') {
    if (!Array.isArray(anchors) || anchors.length < 3) return null;
    const [a, b, c] = anchors;
    const midBc = {
      timeUtcMillis: Math.round((Number(b.timeUtcMillis) + Number(c.timeUtcMillis)) / 2),
      price: (Number(b.price) + Number(c.price)) / 2,
    };
    const v = String(variant || 'original').toLowerCase();
    let handle;
    if (v === 'schiff') {
      handle = {
        timeUtcMillis: Number(a.timeUtcMillis),
        price: (Number(a.price) + Number(b.price)) / 2,
      };
    } else if (v === 'mod_schiff' || v === 'modified_schiff') {
      handle = {
        timeUtcMillis: Math.round((Number(a.timeUtcMillis) + Number(b.timeUtcMillis)) / 2),
        price: (Number(a.price) + Number(b.price)) / 2,
      };
    } else if (v === 'inside') {
      handle = {
        timeUtcMillis: Math.round((Number(a.timeUtcMillis) + Number(b.timeUtcMillis) + Number(c.timeUtcMillis)) / 3),
        price: (Number(a.price) + Number(b.price) + Number(c.price)) / 3,
      };
    } else {
      handle = {
        timeUtcMillis: Number(a.timeUtcMillis),
        price: Number(a.price),
      };
    }
    return { handle, target: midBc, b, c, variant: v };
  },

  /**
   * 7. Fibonacci Time Zones multipliers.
   */
  computeFibTimeZones(t1Ms, t2Ms, stepMs) {
    const dtRaw = Number(t2Ms) - Number(t1Ms);
    const dt = Math.abs(dtRaw) >= Math.max(1, Number(stepMs)) ? dtRaw : Number(stepMs) || 60000;
    const fibs = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55];
    return fibs.map((f) => ({
      fib: f,
      timeUtcMillis: Number(t1Ms) + f * dt,
    }));
  },

  /**
   * 10 & 11. Harmonic ratio calculations for ABCD & XABCD.
   */
  computeHarmonicRatios(anchors) {
    if (!Array.isArray(anchors) || anchors.length < 4) return {};
    if (anchors.length === 4) {
      const [a, b, c, d] = anchors.map((p) => Number(p.price));
      const ab = Math.abs(b - a);
      const bc = Math.abs(c - b);
      const cd = Math.abs(d - c);
      return {
        bcAb: ab > 1e-9 ? bc / ab : 0,
        cdBc: bc > 1e-9 ? cd / bc : 0,
      };
    }
    const [x, a, b, c, d] = anchors.map((p) => Number(p.price));
    const xa = Math.abs(a - x);
    const ab = Math.abs(b - a);
    const bc = Math.abs(c - b);
    const cd = Math.abs(d - c);
    const ad = Math.abs(d - a);
    return {
      abXa: xa > 1e-9 ? ab / xa : 0,
      bcAb: ab > 1e-9 ? bc / ab : 0,
      cdBc: bc > 1e-9 ? cd / bc : 0,
      adXa: xa > 1e-9 ? ad / xa : 0,
    };
  },

  distanceToSegmentPx(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-4) {
      return Math.hypot(px - x1, py - y1);
    }
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  },

  timeUtcToX(timeMs, visibleTimestamps, stepMs, padLeft, plotW) {
    if (!visibleTimestamps.length || plotW <= 0) return padLeft;
    const count = visibleTimestamps.length;
    const slotW = plotW / count;
    const first = visibleTimestamps[0];
    const last = visibleTimestamps[count - 1];

    if (timeMs <= first) {
      const diffSlots = (timeMs - first) / Math.max(1, stepMs);
      return padLeft + (0.5 + diffSlots) * slotW;
    }
    if (timeMs >= last) {
      const diffSlots = (timeMs - last) / Math.max(1, stepMs);
      return padLeft + (count - 0.5 + diffSlots) * slotW;
    }

    for (let i = 0; i < count; i++) {
      if (visibleTimestamps[i] === timeMs) {
        return padLeft + (i + 0.5) * slotW;
      }
      if (i < count - 1 && visibleTimestamps[i] < timeMs && visibleTimestamps[i + 1] > timeMs) {
        const span = Math.max(1, visibleTimestamps[i + 1] - visibleTimestamps[i]);
        const frac = (timeMs - visibleTimestamps[i]) / span;
        return padLeft + (i + 0.5 + frac) * slotW;
      }
    }
    return padLeft;
  },

  xToTimeUtc(x, visibleTimestamps, stepMs, padLeft, plotW, timeframe = null) {
    if (!visibleTimestamps.length || plotW <= 0) return 0;
    const slotW = Math.max(1, plotW / visibleTimestamps.length);
    const idx = Math.max(
      0,
      Math.min(visibleTimestamps.length - 1, Math.floor((x - padLeft) / slotW))
    );
    const raw = visibleTimestamps[idx];
    const w1Step = 7 * 86400000;
    if (stepMs === w1Step || String(timeframe || '').toUpperCase() === 'W1') {
      const mondayOffsetMs = 259200000;
      return Math.floor((raw + mondayOffsetMs) / w1Step) * w1Step - mondayOffsetMs;
    }
    return Math.floor(raw / stepMs) * stepMs;
  },

  hitTestDrawing(drawings, px, py, timeToX, priceToY, tolerancePx = 16) {
    if (!Array.isArray(drawings)) return null;
    for (let i = drawings.length - 1; i >= 0; i--) {
      const d = drawings[i];
      let dist = Infinity;
      if (d.type === 'horizontal_line' || d.type === 'hline') {
        dist = Math.abs(py - priceToY(d.price !== undefined ? d.price : d.price1));
      } else if (d.type === 'vertical_line' || d.type === 'vline') {
        dist = Math.abs(px - timeToX(d.timeUtcMillis));
      } else if (d.type === 'trend_line' || d.type === 'trend') {
        dist = this.distanceToSegmentPx(
          px,
          py,
          timeToX(d.startTimeUtcMillis),
          priceToY(d.startPrice),
          timeToX(d.endTimeUtcMillis),
          priceToY(d.endPrice)
        );
      } else if (d.type === 'fib_retracement' || d.type === 'fib') {
        const x1 = timeToX(d.startTimeUtcMillis);
        const y1 = priceToY(d.startPrice);
        const x2 = timeToX(d.endTimeUtcMillis);
        const y2 = priceToY(d.endPrice);
        dist = this.distanceToSegmentPx(px, py, x1, y1, x2, y2);
        const minX = Math.min(x1, x2) - tolerancePx;
        const maxX = Math.max(x1, x2) + tolerancePx;
        if (px >= minX && px <= maxX) {
          const levels = this.computeFibLevels(d.startPrice, d.endPrice);
          for (const lvl of levels) {
            const ly = priceToY(lvl.price);
            const ldist = Math.abs(py - ly);
            if (ldist < dist) dist = ldist;
          }
        }
      } else if (d.type === 'long_position' || d.type === 'short_position') {
        const x1 = timeToX(d.startTimeUtcMillis);
        const x2 = timeToX(d.endTimeUtcMillis);
        const leftX = Math.min(x1, x2) - tolerancePx;
        const rightX = Math.max(x1, x2) + tolerancePx;
        const yEntry = priceToY(d.entryPrice);
        const yTarget = priceToY(d.targetPrice);
        const yStop = priceToY(d.stopPrice);
        const minY = Math.min(yEntry, yTarget, yStop) - tolerancePx;
        const maxY = Math.max(yEntry, yTarget, yStop) + tolerancePx;
        if (px >= leftX && px <= rightX && py >= minY && py <= maxY) {
          dist = 0;
        }
      } else if (PHASE2_DRAWING_TOOLS.has(d.type)) {
        const anchors = this.extractAnchors(d);
        if (anchors.length > 0) {
          for (let aIdx = 0; aIdx < anchors.length; aIdx++) {
            const ax = timeToX(anchors[aIdx].timeUtcMillis);
            const ay = priceToY(anchors[aIdx].price);
            dist = Math.min(dist, Math.hypot(px - ax, py - ay));
            if (aIdx > 0) {
              const bx = timeToX(anchors[aIdx - 1].timeUtcMillis);
              const by = priceToY(anchors[aIdx - 1].price);
              dist = Math.min(dist, this.distanceToSegmentPx(px, py, bx, by, ax, ay));
            }
          }
          if (
            (d.type === 'frvp' || d.type === 'gann_box' || d.type === 'regression_channel') &&
            anchors.length >= 2
          ) {
            const x1 = timeToX(anchors[0].timeUtcMillis);
            const x2 = timeToX(anchors[1].timeUtcMillis);
            if (d.type === 'frvp') {
              if (px >= Math.min(x1, x2) - tolerancePx && px <= Math.max(x1, x2) + tolerancePx) {
                dist = Math.min(dist, tolerancePx);
              }
            } else if (d.type === 'gann_box') {
              const y1 = priceToY(anchors[0].price);
              const y2 = priceToY(anchors[1].price);
              if (
                px >= Math.min(x1, x2) - tolerancePx &&
                px <= Math.max(x1, x2) + tolerancePx &&
                py >= Math.min(y1, y2) - tolerancePx &&
                py <= Math.max(y1, y2) + tolerancePx
              ) {
                dist = Math.min(
                  dist,
                  Math.abs(px - x1),
                  Math.abs(px - x2),
                  Math.abs(py - y1),
                  Math.abs(py - y2)
                );
              }
            }
          }
          if (d.type === 'avwap') {
            const ax = timeToX(anchors[0].timeUtcMillis);
            const ay = priceToY(anchors[0].price);
            dist = Math.min(dist, Math.hypot(px - ax, py - ay));
          }
        }
      }
      if (dist <= tolerancePx) return d;
    }
    return null;
  },

  translateDrawing(drawing, deltaTimeMs, deltaPrice) {
    if (drawing.type === 'horizontal_line' || drawing.type === 'hline') {
      const nextP = Math.max(0.00000001, Number(drawing.price !== undefined ? drawing.price : drawing.price1) + deltaPrice);
      return {
        ...drawing,
        price: nextP,
        price1: nextP,
      };
    }
    if (drawing.type === 'vertical_line' || drawing.type === 'vline') {
      return {
        ...drawing,
        timeUtcMillis: Math.max(0, Number(drawing.timeUtcMillis) + deltaTimeMs),
      };
    }
    if (
      drawing.type === 'trend_line' ||
      drawing.type === 'trend' ||
      drawing.type === 'fib_retracement' ||
      drawing.type === 'fib'
    ) {
      return {
        ...drawing,
        startTimeUtcMillis: Math.max(0, Number(drawing.startTimeUtcMillis) + deltaTimeMs),
        startPrice: Math.max(0.00000001, Number(drawing.startPrice) + deltaPrice),
        endTimeUtcMillis: Math.max(0, Number(drawing.endTimeUtcMillis) + deltaTimeMs),
        endPrice: Math.max(0.00000001, Number(drawing.endPrice) + deltaPrice),
      };
    }
    if (drawing.type === 'long_position' || drawing.type === 'short_position') {
      return {
        ...drawing,
        startTimeUtcMillis: Math.max(0, Number(drawing.startTimeUtcMillis) + deltaTimeMs),
        endTimeUtcMillis: Math.max(0, Number(drawing.endTimeUtcMillis) + deltaTimeMs),
        entryPrice: Math.max(0.00000001, Number(drawing.entryPrice) + deltaPrice),
        targetPrice: Math.max(0.00000001, Number(drawing.targetPrice) + deltaPrice),
        stopPrice: Math.max(0.00000001, Number(drawing.stopPrice) + deltaPrice),
      };
    }
    if (PHASE2_DRAWING_TOOLS.has(drawing.type)) {
      const nextAnchors = this.extractAnchors(drawing).map((a) => ({
        timeUtcMillis: Math.max(0, Number(a.timeUtcMillis) + deltaTimeMs),
        price: Math.max(0.00000001, Number(a.price) + deltaPrice),
      }));
      return {
        ...drawing,
        anchors: nextAnchors,
      };
    }
    return drawing;
  },
};
