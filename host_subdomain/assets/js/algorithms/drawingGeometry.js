/**
 * Independent Web Algorithm Module:
 * Geometric hit-testing and coordinate conversion for market-anchored chart drawings.
 */
export const DrawingGeometry = {
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

  xToTimeUtc(x, visibleTimestamps, stepMs, padLeft, plotW) {
    if (!visibleTimestamps.length || plotW <= 0) return 0;
    const slotW = Math.max(1, plotW / visibleTimestamps.length);
    const idx = Math.max(
      0,
      Math.min(visibleTimestamps.length - 1, Math.floor((x - padLeft) / slotW))
    );
    const raw = visibleTimestamps[idx];
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
    if (drawing.type === 'trend_line') {
      return {
        ...drawing,
        startTimeUtcMillis: Math.max(0, Number(drawing.startTimeUtcMillis) + deltaTimeMs),
        startPrice: Math.max(0.00000001, Number(drawing.startPrice) + deltaPrice),
        endTimeUtcMillis: Math.max(0, Number(drawing.endTimeUtcMillis) + deltaTimeMs),
        endPrice: Math.max(0.00000001, Number(drawing.endPrice) + deltaPrice),
      };
    }
    return drawing;
  },
};
