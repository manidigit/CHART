import { PriceFormatter } from '../algorithms/priceFormatter.js';
import { DrawingGeometry } from '../algorithms/drawingGeometry.js';
import { state } from '../core/store.js';

export function computeChartGeometry(canvas, tab) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(300, rect.width || canvas.clientWidth || 720);
  const height = Math.max(280, rect.height || canvas.clientHeight || 520);
  const padRight = width < 520 ? 64 : 74;
  const padBottom = 26;
  const padTop = 30;
  const padLeft = 8;
  const plotW = Math.max(120, width - padLeft - padRight);
  const totalPlotH = Math.max(160, height - padTop - padBottom);

  const showVolume = tab.showVolume !== false;
  const volRatio = showVolume ? Math.max(0.15, Math.min(0.32, Number(tab.volumePaneRatio || 0.22))) : 0;
  const paneGap = showVolume ? 8 : 0;
  const pricePlotH = Math.max(110, Math.round(totalPlotH * (1 - volRatio)) - paneGap);
  const volTop = padTop + pricePlotH + paneGap;
  const volPlotH = showVolume ? Math.max(38, totalPlotH - pricePlotH - paneGap) : 0;

  const total = (tab.candles || []).length;
  const minVis = 8;
  const maxVis = Math.max(minVis, total);
  const visibleCount = Math.min(Math.max(minVis, tab.visibleCount || 56), maxVis);
  const endIdx = Math.max(1, total - (tab.scrollOffset || 0));
  const startIdx = Math.max(0, endIdx - visibleCount);
  const slice = (tab.candles || []).slice(startIdx, endIdx);
  const visibleTimestamps = slice.map((c) => Number(c.open_time_utc_ms));
  const stepMs = PriceFormatter.stepMilliseconds(tab.timeframe);

  let rawMin = Infinity;
  let rawMax = -Infinity;
  let maxVol = 0;
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
  const minHalfFloor = Math.max(1e-4, Math.abs(mid) * 0.0008);
  const baseHalf = Math.max((rawMax - rawMin) / 2, minHalfFloor) * 1.16;
  const scaleFactor =
    tab.isAutoScaleY === false ? Math.max(0.2, Math.min(4.5, tab.yPriceScaleFactor || 1.0)) : 1.0;
  const halfSpan = baseHalf * scaleFactor;
  const minP = mid - halfSpan;
  const maxP = mid + halfSpan;
  const fullSpan = Math.max(1e-6, maxP - minP);

  const priceToY = (p) => padTop + ((maxP - Number(p)) / fullSpan) * pricePlotH;
  const yToPrice = (y) => {
    const ratio = Math.max(0, Math.min(1, (y - padTop) / Math.max(1, pricePlotH)));
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
    totalPlotH,
    pricePlotH,
    showVolume,
    volTop,
    volPlotH,
    startIdx,
    endIdx,
    slice,
    visibleTimestamps,
    stepMs,
    minP,
    maxP,
    fullSpan,
    maxVol,
    hasRealVolume: maxVol > 0,
    priceToY,
    yToPrice,
    timeToX,
    xToTime,
  };
}

export function renderCandlestickCanvas(canvas, tab, isDarkTheme, i18n = null) {
  if (!canvas || !tab || !tab.candles || tab.candles.length === 0) return;
  const dpr = window.devicePixelRatio || 1;
  const geom = computeChartGeometry(canvas, tab);
  const {
    width,
    height,
    padLeft,
    padRight,
    padTop,
    plotW,
    pricePlotH,
    showVolume,
    volTop,
    volPlotH,
    startIdx,
    slice,
    minP,
    maxP,
    fullSpan,
    maxVol,
    hasRealVolume,
    priceToY,
    yToPrice,
    timeToX,
  } = geom;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const prefs = state.chartPreferences || {};
  const bg = isDarkTheme ? '#131722' : '#FFFFFF';
  const axisBg = isDarkTheme ? '#1E222D' : '#F8FAFC';
  const grid = isDarkTheme ? '#2A2E39' : '#E0E3EB';
  const dividerCol = isDarkTheme ? '#2A2E39' : '#CBD5E1';
  const textCol = isDarkTheme ? '#787B86' : '#475569';
  const primaryCol = '#2962FF';
  const bull = prefs.bullColor || (isDarkTheme ? '#26A69A' : '#089981');
  const bear = prefs.bearColor || (isDarkTheme ? '#EF5350' : '#F23645');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  if (slice.length === 0) return;

  // Right Axis & Bottom Axis Background Strips
  ctx.fillStyle = axisBg;
  ctx.fillRect(padLeft + plotW, 0, padRight, height);
  ctx.fillRect(0, height - geom.padBottom, width, geom.padBottom);

  // Subtle Vertical & Horizontal Grid Lines in Main Price Pane
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillStyle = tab.isAutoScaleY === false ? primaryCol : textCol;

  const priceTicks = height < 380 ? 4 : 5;
  for (let g = 0; g <= priceTicks; g++) {
    const y = padTop + (pricePlotH * g) / priceTicks;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();

    const priceVal = maxP - (fullSpan * g) / priceTicks;
    ctx.fillText(PriceFormatter.formatPrice(priceVal, tab.decimals), padLeft + plotW + 6, y + 4);
  }

  // Dynamic Non-Overlapping X-Axis Time Grid & Labels
  const maxTimeTicks = Math.max(2, Math.min(6, Math.floor(plotW / 135)));
  ctx.fillStyle = textCol;
  for (let t = 0; t < maxTimeTicks; t++) {
    const ratio = maxTimeTicks === 1 ? 0.5 : t / (maxTimeTicks - 1);
    const barIdx = Math.min(slice.length - 1, Math.round(ratio * (slice.length - 1)));
    const x = padLeft + ((barIdx + 0.5) / slice.length) * plotW;

    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, showVolume ? volTop + volPlotH : padTop + pricePlotH);
    ctx.stroke();

    const label = PriceFormatter.formatAxisTimestamp(slice[barIdx].open_time_utc_ms, tab.timeframe);
    const alignX = Math.max(padLeft + 2, Math.min(padLeft + plotW - 76, x - 34));
    ctx.fillText(label, alignX, height - 8);
  }

  // Right Axis & Bottom Axis Border Lines
  ctx.strokeStyle = dividerCol;
  ctx.beginPath();
  ctx.moveTo(padLeft + plotW, 0);
  ctx.lineTo(padLeft + plotW, height);
  ctx.moveTo(0, height - geom.padBottom);
  ctx.lineTo(width, height - geom.padBottom);
  ctx.stroke();

  const slotW = plotW / slice.length;
  const bodyW = Math.min(18, Math.max(2.5, slotW * 0.68));

  // Clip Main Price Pane so candles & drawings never bleed into Volume Panel
  ctx.save();
  ctx.beginPath();
  ctx.rect(padLeft, padTop, plotW, pricePlotH);
  ctx.clip();

  if (tab.chartType === 'line') {
    ctx.beginPath();
    slice.forEach((c, idx) => {
      const cx = padLeft + (idx + 0.5) * slotW;
      const cy = priceToY(c.close);
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.strokeStyle = primaryCol;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + pricePlotH);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
    ctx.lineTo(padLeft + (slice.length - 0.5) * slotW, padTop + pricePlotH);
    ctx.lineTo(padLeft + 0.5 * slotW, padTop + pricePlotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  } else {
    slice.forEach((c, idx) => {
      const cx = padLeft + (idx + 0.5) * slotW;
      const oY = priceToY(c.open);
      const cY = priceToY(c.close);
      const hY = priceToY(c.high);
      const lY = priceToY(c.low);
      const isBull = Number(c.close) >= Number(c.open);
      ctx.strokeStyle = isBull ? bull : bear;
      ctx.fillStyle = isBull ? bull : bear;
      ctx.lineWidth = 1.4;

      ctx.beginPath();
      ctx.moveTo(cx, hY);
      ctx.lineTo(cx, lY);
      ctx.stroke();

      const top = Math.min(oY, cY);
      const bh = Math.max(2.0, Math.abs(cY - oY));
      ctx.fillRect(cx - bodyW / 2, top, bodyW, bh);
    });
  }

  // Optional SMA 20 Overlay Indicator (Phase 1 Indicator Architecture Readiness)
  if (tab.showSma20) {
    const fullSma = PriceFormatter.computeSmaSeries(tab.candles, 20);
    ctx.beginPath();
    let started = false;
    slice.forEach((_, idx) => {
      const smaVal = fullSma[startIdx + idx];
      if (smaVal !== null && smaVal !== undefined) {
        const cx = padLeft + (idx + 0.5) * slotW;
        const cy = priceToY(smaVal);
        if (!started) {
          ctx.moveTo(cx, cy);
          started = true;
        } else {
          ctx.lineTo(cx, cy);
        }
      }
    });
    if (started) {
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
  }

  // Current / Last Price Horizontal Dashed Line across Main Price Pane
  const latestCandle = tab.candles[tab.candles.length - 1];
  if (latestCandle && latestCandle.close !== undefined) {
    const lastPrice = Number(latestCandle.close);
    const lastIsBull = Number(latestCandle.close) >= Number(latestCandle.open);
    const curY = priceToY(lastPrice);
    if (curY >= padTop && curY <= padTop + pricePlotH) {
      ctx.strokeStyle = lastIsBull ? bull : bear;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padLeft, curY);
      ctx.lineTo(padLeft + plotW, curY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Render Market-Coordinate-Anchored Drawings with Custom Color & StrokeWidth
  const drawings = tab.drawings || [];
  for (const d of drawings) {
    const isSel = d.id === tab.selectedDrawingId;
    const baseW = Math.max(1, Math.min(5, Number(d.strokeWidth || 2)));
    ctx.lineWidth = isSel ? baseW + 1.0 : baseW;
    ctx.setLineDash(isSel ? [7, 4] : []);
    if (d.type === 'horizontal_line') {
      const y = priceToY(d.price);
      const col = d.color || prefs.hlineColor || '#38BDF8';
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();
      if (isSel) {
        ctx.setLineDash([]);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(padLeft + plotW * 0.5, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (d.type === 'vertical_line') {
      const x = timeToX(d.timeUtcMillis);
      if (x >= padLeft && x <= padLeft + plotW) {
        const col = d.color || prefs.vlineColor || '#F59E0B';
        ctx.strokeStyle = col;
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, padTop + pricePlotH);
        ctx.stroke();
      }
    } else if (d.type === 'trend_line') {
      const x1 = timeToX(d.startTimeUtcMillis);
      const y1 = priceToY(d.startPrice);
      const x2 = timeToX(d.endTimeUtcMillis);
      const y2 = priceToY(d.endPrice);
      const col = d.color || prefs.trendColor || '#A855F7';
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
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
    ctx.fillStyle = tab.activeDrawingColor || '#A855F7';
    ctx.beginPath();
    ctx.arc(px, py, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Right Y-Axis Current Price Pill Tag
  if (latestCandle && latestCandle.close !== undefined) {
    const lastPrice = Number(latestCandle.close);
    const lastIsBull = Number(latestCandle.close) >= Number(latestCandle.open);
    const curY = Math.max(padTop + 9, Math.min(padTop + pricePlotH - 9, priceToY(lastPrice)));
    const pillCol = lastIsBull ? bull : bear;
    ctx.fillStyle = pillCol;
    ctx.fillRect(padLeft + plotW + 1, curY - 9, padRight - 2, 18);
    ctx.fillStyle = '#070A0F';
    ctx.font = 'bold 10.5px "JetBrains Mono", monospace';
    ctx.fillText(PriceFormatter.formatPrice(lastPrice, tab.decimals), padLeft + plotW + 5, curY + 4);
  }

  // Separate Dedicated Volume Sub-Pane below Main Price Pane
  if (showVolume && volPlotH > 0) {
    ctx.strokeStyle = dividerCol;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, volTop - 4);
    ctx.lineTo(width, volTop - 4);
    ctx.stroke();

    if (hasRealVolume) {
      slice.forEach((c, idx) => {
        const vol = Number(c.volume || 0);
        const volRatio = Math.max(0, Math.min(1, vol / Math.max(1, maxVol)));
        if (volRatio > 0) {
          const cx = padLeft + (idx + 0.5) * slotW;
          const bh = Math.max(2, (volPlotH - 14) * volRatio);
          const isBull = Number(c.close) >= Number(c.open);
          ctx.fillStyle = isBull ? 'rgba(38, 166, 154, 0.44)' : 'rgba(239, 83, 80, 0.44)';
          ctx.fillRect(cx - bodyW / 2, volTop + volPlotH - bh, bodyW, bh);
        }
      });

      // Independent Volume Right Y-Axis Scale Labels
      ctx.fillStyle = textCol;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(PriceFormatter.formatCompactVolume(maxVol), padLeft + plotW + 6, volTop + 12);
      ctx.fillText(PriceFormatter.formatCompactVolume(maxVol * 0.5), padLeft + plotW + 6, volTop + volPlotH * 0.55);

      const inspectedBar =
        tab.selectedCandleIndex !== null &&
        tab.selectedCandleIndex !== undefined &&
        tab.candles[tab.selectedCandleIndex]
          ? tab.candles[tab.selectedCandleIndex]
          : slice[slice.length - 1];
      ctx.fillStyle = textCol;
      ctx.font = '600 10.5px "JetBrains Mono", monospace';
      ctx.fillText(
        `Vol: ${PriceFormatter.formatCompactVolume(inspectedBar ? inspectedBar.volume : 0)}`,
        padLeft + 8,
        volTop + 13
      );
    } else {
      // Genuine No-Volume State (e.g. EIA Daily Benchmark) — Never fabricate volume
      ctx.fillStyle = textCol;
      ctx.font = '11px "Vazirmatn", sans-serif';
      const noVolMsg = i18n ? i18n.t('chart_volume_unavailable') : 'No volume data provided by source';
      ctx.fillText(noVolMsg, padLeft + 10, volTop + volPlotH * 0.55);
    }
  }

  // Interactive Crosshair (Hover or Selected Candle) + Price & Time Callout Badges on Axes
  let crossX = null;
  let crossY = null;
  let crossPrice = null;
  let crossTimeMs = null;

  if (tab.crosshair && tab.crosshair.active) {
    const localIdx = Math.max(0, Math.min(slice.length - 1, Math.floor((tab.crosshair.x - padLeft) / slotW)));
    const snappedBar = slice[localIdx];
    crossX = padLeft + (localIdx + 0.5) * slotW;
    crossY = Math.max(padTop, Math.min(padTop + pricePlotH, tab.crosshair.y));
    crossPrice = yToPrice(crossY);
    crossTimeMs = snappedBar ? Number(snappedBar.open_time_utc_ms) : null;
  } else if (
    tab.selectedCandleIndex !== null &&
    tab.selectedCandleIndex !== undefined &&
    tab.selectedCandleIndex >= startIdx &&
    tab.selectedCandleIndex < startIdx + slice.length
  ) {
    const localIdx = tab.selectedCandleIndex - startIdx;
    const c = slice[localIdx];
    crossX = padLeft + (localIdx + 0.5) * slotW;
    crossY = priceToY(c.close);
    crossPrice = Number(c.close);
    crossTimeMs = Number(c.open_time_utc_ms);
  }

  if (crossX !== null && crossY !== null) {
    ctx.strokeStyle = '#758696';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(crossX, padTop);
    ctx.lineTo(crossX, showVolume ? volTop + volPlotH : padTop + pricePlotH);
    ctx.moveTo(padLeft, crossY);
    ctx.lineTo(padLeft + plotW, crossY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Right Y-Axis Crosshair Price Callout Pill
    if (crossPrice !== null) {
      const py = Math.max(padTop + 9, Math.min(padTop + pricePlotH - 9, crossY));
      ctx.fillStyle = isDarkTheme ? '#2A2E39' : '#131722';
      ctx.fillRect(padLeft + plotW + 1, py - 9, padRight - 2, 18);
      ctx.strokeStyle = '#758696';
      ctx.strokeRect(padLeft + plotW + 1, py - 9, padRight - 2, 18);
      ctx.fillStyle = '#D1D4DC';
      ctx.font = 'bold 10.5px "JetBrains Mono", monospace';
      ctx.fillText(PriceFormatter.formatPrice(crossPrice, tab.decimals), padLeft + plotW + 5, py + 4);
    }

    // Bottom X-Axis Crosshair UTC Timestamp Callout Pill
    if (crossTimeMs !== null) {
      const timeStr = PriceFormatter.formatAxisTimestamp(crossTimeMs, tab.timeframe) + ' UTC';
      const pillW = Math.min(plotW, Math.max(88, timeStr.length * 6.8 + 12));
      const px = Math.max(padLeft, Math.min(padLeft + plotW - pillW, crossX - pillW / 2));
      const py = height - geom.padBottom + 2;
      ctx.fillStyle = isDarkTheme ? '#2A2E39' : '#131722';
      ctx.fillRect(px, py, pillW, geom.padBottom - 4);
      ctx.strokeStyle = '#758696';
      ctx.strokeRect(px, py, pillW, geom.padBottom - 4);
      ctx.fillStyle = '#D1D4DC';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText(timeStr, px + 6, py + 14);
    }
  }
}
