/**
 * Independent Web Algorithm Module:
 * Geometric hit-testing, snapping, and coordinate conversion for market-anchored chart drawings.
 */
export const DrawingGeometry = {
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
      if (d.type === 'horizontal_line') {
        dist = Math.abs(py - priceToY(d.price));
      } else if (d.type === 'vertical_line') {
        dist = Math.abs(px - timeToX(d.timeUtcMillis));
      } else if (d.type === 'trend_line') {
        dist = this.distanceToSegmentPx(
          px,
          py,
          timeToX(d.startTimeUtcMillis),
          priceToY(d.startPrice),
          timeToX(d.endTimeUtcMillis),
          priceToY(d.endPrice)
        );
      } else if (d.type === 'fib_retracement') {
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
      }
      if (dist <= tolerancePx) return d;
    }
    return null;
  },

  translateDrawing(drawing, deltaTimeMs, deltaPrice) {
    if (drawing.type === 'horizontal_line') {
      return {
        ...drawing,
        price: Math.max(0.00000001, Number(drawing.price) + deltaPrice),
      };
    }
    if (drawing.type === 'vertical_line') {
      return {
        ...drawing,
        timeUtcMillis: Math.max(0, Number(drawing.timeUtcMillis) + deltaTimeMs),
      };
    }
    if (drawing.type === 'trend_line' || drawing.type === 'fib_retracement') {
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
    return drawing;
  },
};
