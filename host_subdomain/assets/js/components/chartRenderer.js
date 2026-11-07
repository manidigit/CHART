import { PriceFormatter } from '../algorithms/priceFormatter.js';
import { DrawingGeometry } from '../algorithms/drawingGeometry.js';

export function computeChartGeometry(canvas, tab) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(300, rect.width || canvas.clientWidth || 680);
  const height = Math.max(260, rect.height || canvas.clientHeight || 480);
  const padRight = 72;
  const padBottom = 28;
  const padTop = 14;
  const padLeft = 10;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const total = (tab.candles || []).length;
  const visibleCount = Math.min(Math.max(12, tab.visibleCount || 48), Math.max(12, total));
  const endIdx = Math.max(1, total - (tab.scrollOffset || 0));
  const startIdx = Math.max(0, endIdx - visibleCount);
  const slice = (tab.candles || []).slice(startIdx, endIdx);
  const visibleTimestamps = slice.map((c) => Number(c.open_time_utc_ms));
  const stepMs = PriceFormatter.stepMilliseconds(tab.timeframe);

  let rawMin = Infinity;
  let rawMax = -Infinity;
  let maxVol = 1;
  for (const c of slice) {
    rawMin = Math.min(rawMin, Number(c.low));
    rawMax = Math.max(rawMax, Number(c.high));
    maxVol = Math.max(maxVol, Number(c.volume || 0));
  }
  if (!isFinite(rawMin) || !isFinite(rawMax)) {
    rawMin = 0;
    rawMax = 1;
  }

  const mid = (rawMin + rawMax) / 2;
  const baseHalf = Math.max(1e-6, (rawMax - rawMin) / 2) * 1.12;
  const scaleFactor = tab.isAutoScaleY === false ? Math.max(0.25, Math.min(4.0, tab.yPriceScaleFactor || 1.0)) : 1.0;
  const halfSpan = baseHalf * scaleFactor;
  const minP = mid - halfSpan;
  const maxP = mid + halfSpan;
  const fullSpan = Math.max(1e-6, maxP - minP);

  const priceToY = (p) => padTop + ((maxP - Number(p)) / fullSpan) * plotH;
  const yToPrice = (y) => {
    const ratio = Math.max(0, Math.min(1, (y - padTop) / plotH));
    return maxP - ratio * fullSpan;
  };
  const timeToX = (ms) => DrawingGeometry.timeUtcToX(ms, visibleTimestamps, stepMs, padLeft, plotW);
  const xToTime = (x) => DrawingGeometry.xToTimeUtc(x, visibleTimestamps, stepMs, padLeft, plotW);

  return {
    width,
    height,
    padLeft,
    padRight,
    padTop,
    padBottom,
    plotW,
    plotH,
    startIdx,
    endIdx,
    slice,
    visibleTimestamps,
    stepMs,
    minP,
    maxP,
    fullSpan,
    maxVol,
    priceToY,
    yToPrice,
    timeToX,
    xToTime,
  };
}

export function renderCandlestickCanvas(canvas, tab, isDarkTheme) {
  if (!canvas || !tab || !tab.candles || tab.candles.length === 0) return;
  const dpr = window.devicePixelRatio || 1;
  const geom = computeChartGeometry(canvas, tab);
  const {
    width,
    height,
    padLeft,
    padTop,
    plotW,
    plotH,
    startIdx,
    slice,
    minP,
    maxP,
    fullSpan,
    maxVol,
    priceToY,
    timeToX,
  } = geom;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const bg = isDarkTheme ? '#131A26' : '#FFFFFF';
  const grid = isDarkTheme ? '#1E293B' : '#E2E8F0';
  const textCol = isDarkTheme ? '#94A3B8' : '#475569';
  const primaryCol = isDarkTheme ? '#38BDF8' : '#0284C7';
  const bull = isDarkTheme ? '#10B981' : '#059669';
  const bear = isDarkTheme ? '#F43F5E' : '#E11D48';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  if (slice.length === 0) return;

  // Grid & Y-Axis Price Labels
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillStyle = tab.isAutoScaleY === false ? primaryCol : textCol;

  for (let g = 0; g <= 4; g++) {
    const y = padTop + (plotH * g) / 4;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();

    const priceVal = maxP - (fullSpan * g) / 4;
    ctx.fillText(PriceFormatter.formatPrice(priceVal, tab.decimals), padLeft + plotW + 6, y + 4);
  }

  // Dynamic Non-Overlapping X-Axis Time Labels
  const maxTimeTicks = Math.max(2, Math.min(5, Math.floor(plotW / 150)));
  ctx.fillStyle = textCol;
  for (let t = 0; t < maxTimeTicks; t++) {
    const ratio = maxTimeTicks === 1 ? 0.5 : t / (maxTimeTicks - 1);
    const barIdx = Math.min(slice.length - 1, Math.round(ratio * (slice.length - 1)));
    const x = padLeft + ((barIdx + 0.5) / slice.length) * plotW;

    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, padTop + plotH);
    ctx.stroke();

    const label = PriceFormatter.formatAxisTimestamp(slice[barIdx].open_time_utc_ms, tab.timeframe);
    const alignX = Math.max(padLeft, Math.min(padLeft + plotW - 72, x - 34));
    ctx.fillText(label, alignX, height - 8);
  }
  ctx.setLineDash([]);

  const slotW = plotW / slice.length;
  const bodyW = Math.min(18, Math.max(2.5, slotW * 0.68));

  // Subtle Volume Histogram
  const maxVolH = plotH * 0.14;
  slice.forEach((c, idx) => {
    const volRatio = Math.max(0, Math.min(1, Number(c.volume || 0) / maxVol));
    if (volRatio > 0) {
      const cx = padLeft + (idx + 0.5) * slotW;
      const bh = maxVolH * volRatio;
      const isBull = Number(c.close) >= Number(c.open);
      ctx.fillStyle = isBull ? 'rgba(16, 185, 129, 0.18)' : 'rgba(244, 63, 94, 0.18)';
      ctx.fillRect(cx - bodyW / 2, padTop + plotH - bh, bodyW, bh);
    }
  });

  if (tab.chartType === 'line') {
    // Line Chart Mode
    ctx.beginPath();
    slice.forEach((c, idx) => {
      const cx = padLeft + (idx + 0.5) * slotW;
      const cy = priceToY(c.close);
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.strokeStyle = primaryCol;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.24)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
    ctx.lineTo(padLeft + (slice.length - 0.5) * slotW, padTop + plotH);
    ctx.lineTo(padLeft + 0.5 * slotW, padTop + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  } else {
    // Candlestick Mode
    slice.forEach((c, idx) => {
      const cx = padLeft + (idx + 0.5) * slotW;
      const oY = priceToY(c.open);
      const cY = priceToY(c.close);
      const hY = priceToY(c.high);
      const lY = priceToY(c.low);
      const isBull = Number(c.close) >= Number(c.open);
      ctx.strokeStyle = isBull ? bull : bear;
      ctx.fillStyle = isBull ? bull : bear;
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(cx, hY);
      ctx.lineTo(cx, lY);
      ctx.stroke();

      const top = Math.min(oY, cY);
      const bh = Math.max(2.2, Math.abs(cY - oY));
      ctx.fillRect(cx - bodyW / 2, top, bodyW, bh);
    });
  }

  // Render Market-Coordinate-Anchored Drawings
  const drawings = tab.drawings || [];
  for (const d of drawings) {
    const isSel = d.id === tab.selectedDrawingId;
    ctx.lineWidth = isSel ? 2.8 : 1.9;
    ctx.setLineDash(isSel ? [8, 4] : []);
    if (d.type === 'horizontal_line') {
      const y = priceToY(d.price);
      ctx.strokeStyle = isSel ? '#22D3EE' : '#38BDF8';
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();
    } else if (d.type === 'vertical_line') {
      const x = timeToX(d.timeUtcMillis);
      if (x >= padLeft && x <= padLeft + plotW) {
        ctx.strokeStyle = isSel ? '#FBBF24' : '#F59E0B';
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, padTop + plotH);
        ctx.stroke();
      }
    } else if (d.type === 'trend_line') {
      const x1 = timeToX(d.startTimeUtcMillis);
      const y1 = priceToY(d.startPrice);
      const x2 = timeToX(d.endTimeUtcMillis);
      const y2 = priceToY(d.endPrice);
      ctx.strokeStyle = isSel ? '#C084FC' : '#A855F7';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x1, y1, isSel ? 5 : 3.5, 0, Math.PI * 2);
      ctx.arc(x2, y2, isSel ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.setLineDash([]);

  // Pending 1st point of Trend Line
  if (tab.pendingTrendPoint) {
    const px = timeToX(tab.pendingTrendPoint.timeUtcMillis);
    const py = priceToY(tab.pendingTrendPoint.price);
    ctx.fillStyle = '#A855F7';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crosshair if a candle is selected
  if (
    tab.selectedCandleIndex !== null &&
    tab.selectedCandleIndex !== undefined &&
    tab.selectedCandleIndex >= startIdx &&
    tab.selectedCandleIndex < startIdx + slice.length
  ) {
    const localIdx = tab.selectedCandleIndex - startIdx;
    const c = slice[localIdx];
    const cx = padLeft + (localIdx + 0.5) * slotW;
    const cy = priceToY(c.close);
    ctx.strokeStyle = textCol;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(cx, padTop);
    ctx.lineTo(cx, padTop + plotH);
    ctx.moveTo(padLeft, cy);
    ctx.lineTo(padLeft + plotW, cy);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
