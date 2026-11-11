import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.30.0';
import { TechnicalIndicators } from '../algorithms/technicalIndicators.js?v=1.30.0';
import { DrawingGeometry } from '../algorithms/drawingGeometry.js?v=1.30.0';
import { state } from '../core/store.js?v=1.30.0';

function getTimeframeDurationSeconds(tf) {
  if (tf === 'M15') return 15 * 60;
  if (tf === 'H1') return 60 * 60;
  if (tf === 'H4') return 4 * 3600;
  if (tf === 'D1') return 24 * 3600;
  if (tf === 'W1') return 7 * 24 * 3600;
  return 15 * 60;
}

function computeCandleCountdownLabel(lastOpenEpochSec, tf) {
  if (!lastOpenEpochSec) return '';
  const normTf = String(tf || 'M15').toUpperCase();
  // On Daily (D1) and Weekly (W1) timeframes, do not show intraday HH:MM:SS clock under the price pill
  if (normTf === 'D1' || normTf === 'W1') {
    return '';
  }
  const tfSec = getTimeframeDurationSeconds(normTf);
  const nowSec = Math.floor(Date.now() / 1000);
  const currentBucketStart = Math.floor(nowSec / tfSec) * tfSec;
  const nextCloseSec = currentBucketStart + tfSec;
  const remain = Math.max(0, nextCloseSec - nowSec);
  const ageSec = nowSec - Number(lastOpenEpochSec);
  if (ageSec > tfSec * 8) {
    return 'Closed';
  }
  const hrs = Math.floor(remain / 3600);
  const mins = Math.floor((remain % 3600) / 60);
  const secs = remain % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export function renderCandlestickCanvas(canvas, tab, i18n) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.scale(dpr, dpr);

  // Force Canvas 2D context text direction and alignment to LTR
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const w = rect.width;
  const h = rect.height;
  const isDark = state.isDarkTheme;
  const prefs = state.chartPreferences;
  const isLog = Boolean(tab.isLogScale ?? prefs.isLogScale);

  const bgColor = isDark ? '#131722' : '#FFFFFF';
  const gridColor = isDark ? 'rgba(42, 46, 57, 0.55)' : 'rgba(224, 227, 235, 0.9)';
  const axisBgColor = isDark ? '#1E222D' : '#F8FAFC';
  const textColor = isDark ? '#9598A1' : '#475569';
  const majorTickColor = isDark ? '#D1D4DC' : '#0F172A';
  const bullColor = prefs.bullColor || '#26A69A';
  const bearColor = prefs.bearColor || '#EF5350';

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);

  const candles = tab.candles || [];
  if (candles.length === 0) return;

  const rightAxisW = 78;
  const bottomAxisH = 26;
  const topPad = 16;
  const totalChartH = Math.max(100, h - topPad - bottomAxisH);
  const showVol = tab.showVolume !== false;
  const volRatio = Math.max(0.12, Math.min(0.35, Number(tab.volumePaneRatio || 0.22)));
  const volPaneH = showVol ? totalChartH * volRatio : 0;
  const pricePaneH = totalChartH - volPaneH;
  const chartW = Math.max(120, w - rightAxisW);
  const chartH = pricePaneH;
  const volTopY = topPad + pricePaneH;

  const visibleCount = Math.max(12, Math.min(600, Math.round(tab.visibleCount || 48)));
  const maxOffset = Math.max(0, candles.length - 5);
  const offset = Math.max(0, Math.min(maxOffset, Math.round(tab.scrollOffset || 0)));

  const endIdx = Math.max(1, candles.length - offset);
  const startIdx = Math.max(0, endIdx - visibleCount);
  const visible = candles.slice(startIdx, endIdx);
  if (visible.length === 0) return;

  let rawMin = Infinity;
  let rawMax = -Infinity;
  let highCandleIdx = 0;
  let lowCandleIdx = 0;

  for (let i = 0; i < visible.length; i++) {
    const c = visible[i];
    const lo = Number(c.low);
    const hi = Number(c.high);
    if (lo < rawMin) {
      rawMin = lo;
      lowCandleIdx = i;
    }
    if (hi > rawMax) {
      rawMax = hi;
      highCandleIdx = i;
    }
  }
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) return;

  const scaleFactor = Math.max(0.25, Math.min(4.0, Number(tab.priceScaleFactor || 1.0)));
  const baseRange = Math.max(rawMax - rawMin, 0.0001);
  const midPrice = (rawMax + rawMin) / 2.0 + Number(tab.verticalPriceOffset || 0.0);
  const halfRange = (baseRange * scaleFactor) / 2.0;
  const pad = halfRange * 0.16;
  const minP = Math.max(isLog ? 0.000001 : -Infinity, midPrice - halfRange - pad);
  const maxP = midPrice + halfRange + pad;

  const toScaleVal = (p) => (isLog ? Math.log(Math.max(Number(p), 0.000001)) : Number(p));
  const fromScaleVal = (s) => (isLog ? Math.exp(s) : s);

  const minS = toScaleVal(minP);
  const maxS = toScaleVal(maxP);
  const scaleSpan = Math.max(maxS - minS, 1e-9);

  const priceToY = (p) => topPad + chartH * (1 - (toScaleVal(p) - minS) / scaleSpan);
  const yToPrice = (y) => {
    const ratio = 1 - (y - topPad) / Math.max(1, chartH);
    return fromScaleVal(minS + ratio * scaleSpan);
  };

  // Axis panel backgrounds
  ctx.fillStyle = axisBgColor;
  ctx.fillRect(chartW, 0, rightAxisW, h);
  ctx.fillRect(0, topPad + totalChartH, w, bottomAxisH);

  // Right & Bottom Axis borders
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(chartW, 0);
  ctx.lineTo(chartW, h);
  ctx.moveTo(0, topPad + totalChartH);
  ctx.lineTo(w, topPad + totalChartH);
  ctx.stroke();

  // Horizontal Price Grid + Institutional Round Y-Axis Price Labels (Heckbert Nice Numbers)
  const targetTicks = Math.max(4, Math.min(8, Math.floor(chartH / 48)));
  const { ticks: niceTicks, step: niceStep } = PriceFormatter.computeNicePriceTicks(
    minP,
    maxP,
    targetTicks
  );
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';

  for (const priceVal of niceTicks) {
    const y = priceToY(priceVal);
    if (y < topPad + 6 || y > topPad + chartH - 6) continue;

    ctx.strokeStyle = gridColor;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(chartW, y);
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.fillText(
      PriceFormatter.formatAxisRoundPrice(priceVal, tab.decimals, niceStep),
      chartW + 6,
      y + 4
    );
  }

  const slotW = chartW / visible.length;
  const bodyW = Math.max(1.2, Math.min(20, slotW * 0.68));
  const idxToX = (idx) => (idx + 0.5) * slotW;

  // Vertical Time Grid + Smart Calendar-Aligned X-Axis Labels (Year, Month, Day, or Hour by Span & Timeframe)
  const smartTicks = PriceFormatter.computeSmartTimeAxisTicks(visible, chartW, tab.timeframe);
  for (const tick of smartTicks) {
    const x = idxToX(tick.index);
    ctx.strokeStyle = gridColor;
    ctx.beginPath();
    ctx.moveTo(x, topPad);
    ctx.lineTo(x, topPad + totalChartH);
    ctx.stroke();

    ctx.font = tick.isMajor
      ? 'bold 11px "JetBrains Mono", monospace'
      : '11px "JetBrains Mono", monospace';
    const lblW = ctx.measureText(tick.text).width;
    const lblX = Math.max(6, Math.min(chartW - lblW - 6, x - lblW / 2));
    ctx.fillStyle = tick.isMajor ? majorTickColor : textColor;
    ctx.fillText(tick.text, lblX, topPad + totalChartH + 17);
  }

  // Data Boundary Marker when scrolled to beginning of loaded history
  if (startIdx === 0 && visible.length > 0) {
    const firstX = idxToX(0);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#F59E0B';
    ctx.beginPath();
    ctx.moveTo(firstX, topPad);
    ctx.lineTo(firstX, topPad + totalChartH);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#F59E0B';
    ctx.font = '600 10px "JetBrains Mono", sans-serif';
    ctx.fillText(
      i18n ? i18n.t('chart_data_boundary') : 'Start of history',
      Math.max(8, firstX + 6),
      topPad + 14
    );
  }

  // Dashed Previous Close Reference Line (TradingView Standard)
  if (prefs.showPrevCloseLine !== false && candles.length >= 2) {
    const prevClose = Number(candles[candles.length - 2].close);
    const prevY = priceToY(prevClose);
    if (prevY >= topPad && prevY <= topPad + chartH) {
      ctx.save();
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = isDark ? 'rgba(149, 152, 161, 0.45)' : 'rgba(100, 116, 139, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, prevY);
      ctx.lineTo(chartW, prevY);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Bollinger Bands (20, 2) Overlay (if enabled in Indicators Modal)
  if (tab.showBollinger && candles.length >= 20) {
    const bbArr = TechnicalIndicators.computeBollingerBands(candles, 20, 2.0);
    ctx.save();
    const upperPts = [];
    const lowerPts = [];
    visible.forEach((c, idx) => {
      const bb = bbArr[startIdx + idx];
      if (bb) {
        const x = idxToX(idx);
        upperPts.push({ x, y: priceToY(bb.upper) });
        lowerPts.push({ x, y: priceToY(bb.lower) });
      }
    });

    if (upperPts.length > 1) {
      ctx.fillStyle = 'rgba(168, 85, 247, 0.08)';
      ctx.beginPath();
      upperPts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      for (let i = lowerPts.length - 1; i >= 0; i--) {
        ctx.lineTo(lowerPts[i].x, lowerPts[i].y);
      }
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(168, 85, 247, 0.65)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      upperPts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.stroke();

      ctx.beginPath();
      lowerPts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Candles or Line Plot
  if (tab.chartType === 'line') {
    ctx.strokeStyle = '#2962FF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    visible.forEach((c, idx) => {
      const x = idxToX(idx);
      const y = priceToY(Number(c.close));
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  } else {
    visible.forEach((c, idx) => {
      const x = idxToX(idx);
      const o = Number(c.open);
      const hi = Number(c.high);
      const lo = Number(c.low);
      const cl = Number(c.close);
      const isBull = cl >= o;
      const color = isBull ? bullColor : bearColor;

      const highY = priceToY(hi);
      const lowY = priceToY(lo);
      const openY = priceToY(o);
      const closeY = priceToY(cl);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      const topY = Math.min(openY, closeY);
      const bodyH = Math.max(2, Math.abs(closeY - openY));
      ctx.fillStyle = color;
      ctx.fillRect(x - bodyW / 2, topY, bodyW, bodyH);
    });
  }

  // Visible High / Low Callout Labels on Highest & Lowest Visible Wicks
  if (prefs.showHighLowLabels !== false && visible.length >= 4) {
    ctx.save();
    ctx.font = '600 10px "JetBrains Mono", monospace';
    const hiX = idxToX(highCandleIdx);
    const hiY = Math.max(topPad + 10, priceToY(rawMax));
    const hiText = PriceFormatter.formatPrice(rawMax, tab.decimals);
    const hiTw = ctx.measureText(hiText).width;
    ctx.strokeStyle = isDark ? '#9598A1' : '#475569';
    ctx.fillStyle = isDark ? '#D1D4DC' : '#131722';
    if (hiX > chartW * 0.65) {
      ctx.beginPath();
      ctx.moveTo(hiX - 2, hiY);
      ctx.lineTo(hiX - 10, hiY);
      ctx.stroke();
      ctx.fillText(hiText, Math.max(4, hiX - 13 - hiTw), hiY + 3);
    } else {
      ctx.beginPath();
      ctx.moveTo(hiX + 2, hiY);
      ctx.lineTo(hiX + 10, hiY);
      ctx.stroke();
      ctx.fillText(hiText, Math.min(chartW - hiTw - 4, hiX + 13), hiY + 3);
    }

    const loX = idxToX(lowCandleIdx);
    const loY = Math.min(topPad + chartH - 6, priceToY(rawMin));
    const loText = PriceFormatter.formatPrice(rawMin, tab.decimals);
    const loTw = ctx.measureText(loText).width;
    if (loX > chartW * 0.65) {
      ctx.beginPath();
      ctx.moveTo(loX - 2, loY);
      ctx.lineTo(loX - 10, loY);
      ctx.stroke();
      ctx.fillText(loText, Math.max(4, loX - 13 - loTw), loY + 3);
    } else {
      ctx.beginPath();
      ctx.moveTo(loX + 2, loY);
      ctx.lineTo(loX + 10, loY);
      ctx.stroke();
      ctx.fillText(loText, Math.min(chartW - loTw - 4, loX + 13), loY + 3);
    }
    ctx.restore();
  }

  // SMA 20 Overlay
  if (tab.showSma20 && candles.length >= 20) {
    const smaArr = TechnicalIndicators.computeSma(candles, 20);
    ctx.save();
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    let started = false;
    visible.forEach((c, idx) => {
      const val = smaArr[startIdx + idx];
      if (val !== null && Number.isFinite(val)) {
        const x = idxToX(idx);
        const y = priceToY(val);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();
    ctx.restore();
  }

  // EMA 50 Overlay
  if (tab.showEma50 && candles.length >= 50) {
    const emaArr = TechnicalIndicators.computeEma(candles, 50);
    ctx.save();
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    let started = false;
    visible.forEach((c, idx) => {
      const val = emaArr[startIdx + idx];
      if (val !== null && Number.isFinite(val)) {
        const x = idxToX(idx);
        const y = priceToY(val);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();
    ctx.restore();
  }

  // Separate Volume Sub-Pane
  if (showVol && volPaneH > 16) {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, volTopY);
    ctx.lineTo(w, volTopY);
    ctx.stroke();

    let maxVol = 0;
    for (const c of visible) {
      maxVol = Math.max(maxVol, Number(c.volume || 0));
    }
    const hasVol = TechnicalIndicators.hasNonZeroVolume(visible);
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';

    if (!hasVol || maxVol <= 0) {
      ctx.fillStyle = textColor;
      ctx.fillText(
        i18n ? i18n.t('chart_volume_unavailable') : 'No volume data provided by source',
        10,
        volTopY + 15
      );
    } else {
      const volAvailH = Math.max(10, volPaneH - 18);
      visible.forEach((c, idx) => {
        const v = Number(c.volume || 0);
        if (v <= 0) return;
        const barH = Math.max(2, (v / maxVol) * volAvailH);
        const x = idxToX(idx);
        const isBull = Number(c.close) >= Number(c.open);
        ctx.fillStyle = isBull ? bullColor + '77' : bearColor + '77';
        ctx.fillRect(x - bodyW / 2, volTopY + volPaneH - barH, bodyW, barH);
      });

      ctx.fillStyle = textColor;
      ctx.fillText(PriceFormatter.formatVolume(maxVol), chartW + 6, volTopY + 12);
      ctx.fillText(PriceFormatter.formatVolume(maxVol / 2), chartW + 6, volTopY + volPaneH / 2 + 4);

      const refVolCandle =
        tab.hoverIndex !== null && visible[tab.hoverIndex]
          ? visible[tab.hoverIndex]
          : visible[visible.length - 1];
      ctx.fillStyle = isDark ? '#D1D4DC' : '#131722';
      ctx.fillText(
        `Vol: ${PriceFormatter.formatVolume(refVolCandle.volume)}`,
        10,
        volTopY + 13
      );
    }
  }

  // Last Closed Price Dashed Line + Right-Axis Current Price Pill + Live UTC Countdown Pill
  const lastCandle = candles[candles.length - 1];
  const lastClose = Number(lastCandle.close);
  const lastY = priceToY(lastClose);
  const isLastBull = lastClose >= Number(lastCandle.open);
  const pillBg = isLastBull ? bullColor : bearColor;

  if (lastY >= topPad && lastY <= topPad + chartH) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = pillBg;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, lastY);
    ctx.lineTo(chartW, lastY);
    ctx.stroke();
    ctx.restore();

    const countdownStr =
      prefs.showCountdownToBarClose !== false
        ? computeCandleCountdownLabel(lastCandle.openTimeSec, tab.timeframe)
        : '';
    const pillH = countdownStr ? 30 : 20;
    const pillTop = Math.max(topPad, Math.min(topPad + chartH - pillH, lastY - 10));

    ctx.fillStyle = pillBg;
    ctx.fillRect(chartW, pillTop, rightAxisW, pillH);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(PriceFormatter.formatPrice(lastClose, tab.decimals), chartW + 6, pillTop + 13);

    if (countdownStr) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = '600 9.5px "JetBrains Mono", monospace';
      ctx.fillText(countdownStr, chartW + 6, pillTop + 25);
    }
  }

  // User Drawings
  const drawings = tab.drawings || [];
  const visibleTimestamps = visible.map((c) =>
    Number(c.open_time_utc_ms || (c.openTimeSec ? c.openTimeSec * 1000 : 0))
  );
  const stepMs = PriceFormatter.stepMilliseconds(tab.timeframe);
  const timeToX = (tMs) => {
    const numMs = Number(tMs);
    const idx = visibleTimestamps.findIndex((vt) => vt >= numMs);
    if (idx !== -1) return idxToX(idx);
    if (visibleTimestamps.length > 0 && numMs < visibleTimestamps[0]) return 0;
    return chartW;
  };
  const xToTime = (xPx) => {
    if (!visibleTimestamps.length) return 0;
    const i = Math.max(
      0,
      Math.min(visibleTimestamps.length - 1, Math.floor(xPx / Math.max(1, slotW)))
    );
    return visibleTimestamps[i];
  };

  drawings.forEach((d) => {
    const isSel = tab.selectedDrawingId === d.id;
    const isHLine = d.type === 'hline' || d.type === 'horizontal_line';
    const isVLine = d.type === 'vline' || d.type === 'vertical_line';
    const isTrend = d.type === 'trend' || d.type === 'trend_line';
    const strokeCol =
      d.colorHex ||
      (isHLine
        ? prefs.hLineColor || '#F59E0B'
        : isVLine
          ? prefs.vLineColor || '#A855F7'
          : prefs.trendColor || '#2962FF');
    const baseW = Number(d.lineWidthPx || d.strokeWidthPx || 2);
    ctx.strokeStyle = isSel ? '#FFFFFF' : strokeCol;
    ctx.lineWidth = isSel ? baseW + 1.2 : baseW;

    if (isHLine) {
      const pVal = Number(d.price1 !== undefined ? d.price1 : d.price);
      const y = priceToY(pVal);
      if (y >= topPad && y <= topPad + chartH) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(chartW, y);
        ctx.stroke();
        if (d.label) {
          ctx.fillStyle = strokeCol;
          ctx.font = '600 10px "JetBrains Mono", monospace';
          ctx.fillText(d.label, 12, Math.max(topPad + 12, y - 4));
        }
      }
    } else if (isVLine) {
      const tMs = Number(d.timeUtcMillis || (d.time1EpochSec ? d.time1EpochSec * 1000 : 0));
      const x = timeToX(tMs);
      if (x >= 0 && x <= chartW) {
        ctx.beginPath();
        ctx.moveTo(x, topPad);
        ctx.lineTo(x, topPad + totalChartH);
        ctx.stroke();
      }
    } else if (isTrend) {
      const t1Ms = Number(d.startTimeUtcMillis || (d.time1EpochSec ? d.time1EpochSec * 1000 : 0));
      const t2Ms = Number(d.endTimeUtcMillis || (d.time2EpochSec ? d.time2EpochSec * 1000 : 0));
      const p1 = Number(d.startPrice !== undefined ? d.startPrice : d.price1);
      const p2 = Number(d.endPrice !== undefined ? d.endPrice : d.price2);
      const x1 = timeToX(t1Ms);
      const x2 = timeToX(t2Ms);
      const y1 = priceToY(p1);
      const y2 = priceToY(p2);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (d.type === 'fib' || d.type === 'fib_retracement') {
      const t1Ms = Number(d.startTimeUtcMillis || (d.time1EpochSec ? d.time1EpochSec * 1000 : 0));
      const t2Ms = Number(d.endTimeUtcMillis || (d.time2EpochSec ? d.time2EpochSec * 1000 : 0));
      const p1 = Number(d.startPrice !== undefined ? d.startPrice : d.price1);
      const p2 = Number(d.endPrice !== undefined ? d.endPrice : d.price2);
      const x1 = timeToX(t1Ms);
      const x2 = timeToX(t2Ms);
      const y1 = priceToY(p1);
      const y2 = priceToY(p2);
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2, minX + 50);

      const levels = DrawingGeometry.computeFibLevels(p1, p2);

      // Golden Pocket (0.5 to 0.618)
      const p05 = levels.find((l) => l.ratio === 0.5)?.price || p1;
      const p0618 = levels.find((l) => l.ratio === 0.618)?.price || p2;
      const y05 = priceToY(p05);
      const y0618 = priceToY(p0618);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.20)';
      ctx.fillRect(minX, Math.min(y05, y0618), maxX - minX, Math.max(2, Math.abs(y0618 - y05)));

      // 0.382 - 0.500 zone
      const p0382 = levels.find((l) => l.ratio === 0.382)?.price;
      if (p0382 !== undefined) {
        const y0382 = priceToY(p0382);
        ctx.fillStyle = 'rgba(38, 166, 154, 0.10)';
        ctx.fillRect(minX, Math.min(y0382, y05), maxX - minX, Math.max(2, Math.abs(y05 - y0382)));
      }

      // Diagonal anchor line (dashed)
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();

      // Levels
      levels.forEach((lvl) => {
        const ly = priceToY(lvl.price);
        const isGolden = lvl.ratio === 0.5 || lvl.ratio === 0.618;
        ctx.strokeStyle = isGolden ? '#F59E0B' : isSel ? '#FFFFFF' : strokeCol;
        ctx.lineWidth = isGolden ? baseW + 0.4 : baseW;
        ctx.beginPath();
        ctx.moveTo(minX, ly);
        ctx.lineTo(maxX, ly);
        ctx.stroke();

        ctx.fillStyle = isGolden ? '#F59E0B' : '#758696';
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.fillText(lvl.label, minX + 4, ly - 3);
      });
    } else if (d.type === 'long_position') {
      const x1 = timeToX(d.startTimeUtcMillis);
      const x2 = timeToX(d.endTimeUtcMillis);
      const leftX = Math.min(x1, x2);
      const rightX = Math.max(x1, x2, leftX + 50);
      const boxW = rightX - leftX;
      const yEntry = priceToY(d.entryPrice);
      const yTarget = priceToY(d.targetPrice);
      const yStop = priceToY(d.stopPrice);

      // Target (Green)
      const targetTop = Math.min(yTarget, yEntry);
      const targetH = Math.max(2, Math.abs(yEntry - yTarget));
      ctx.fillStyle = 'rgba(38, 166, 154, 0.22)';
      ctx.fillRect(leftX, targetTop, boxW, targetH);
      ctx.strokeStyle = '#26A69A';
      ctx.lineWidth = baseW + 0.5;
      ctx.beginPath();
      ctx.moveTo(leftX, yTarget);
      ctx.lineTo(rightX, yTarget);
      ctx.stroke();

      // Stop (Red)
      const stopTop = Math.min(yEntry, yStop);
      const stopH = Math.max(2, Math.abs(yStop - yEntry));
      ctx.fillStyle = 'rgba(239, 83, 80, 0.22)';
      ctx.fillRect(leftX, stopTop, boxW, stopH);
      ctx.strokeStyle = '#EF5350';
      ctx.lineWidth = baseW + 0.5;
      ctx.beginPath();
      ctx.moveTo(leftX, yStop);
      ctx.lineTo(rightX, yStop);
      ctx.stroke();

      // Entry (White)
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = baseW;
      ctx.beginPath();
      ctx.moveTo(leftX, yEntry);
      ctx.lineTo(rightX, yEntry);
      ctx.stroke();

      // R/R badge
      const risk = Math.abs(d.entryPrice - d.stopPrice);
      const reward = Math.abs(d.targetPrice - d.entryPrice);
      const rr = risk > 1e-8 ? (reward / risk).toFixed(2) : '1.00';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.fillText(`Long · R/R: ${rr}`, leftX + 4, yEntry - 4);
    } else if (d.type === 'short_position') {
      const x1 = timeToX(d.startTimeUtcMillis);
      const x2 = timeToX(d.endTimeUtcMillis);
      const leftX = Math.min(x1, x2);
      const rightX = Math.max(x1, x2, leftX + 50);
      const boxW = rightX - leftX;
      const yEntry = priceToY(d.entryPrice);
      const yTarget = priceToY(d.targetPrice);
      const yStop = priceToY(d.stopPrice);

      // Target (Green - below entry)
      const targetTop = Math.min(yEntry, yTarget);
      const targetH = Math.max(2, Math.abs(yTarget - yEntry));
      ctx.fillStyle = 'rgba(38, 166, 154, 0.22)';
      ctx.fillRect(leftX, targetTop, boxW, targetH);
      ctx.strokeStyle = '#26A69A';
      ctx.lineWidth = baseW + 0.5;
      ctx.beginPath();
      ctx.moveTo(leftX, yTarget);
      ctx.lineTo(rightX, yTarget);
      ctx.stroke();

      // Stop (Red - above entry)
      const stopTop = Math.min(yStop, yEntry);
      const stopH = Math.max(2, Math.abs(yEntry - yStop));
      ctx.fillStyle = 'rgba(239, 83, 80, 0.22)';
      ctx.fillRect(leftX, stopTop, boxW, stopH);
      ctx.strokeStyle = '#EF5350';
      ctx.lineWidth = baseW + 0.5;
      ctx.beginPath();
      ctx.moveTo(leftX, yStop);
      ctx.lineTo(rightX, yStop);
      ctx.stroke();

      // Entry (White)
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = baseW;
      ctx.beginPath();
      ctx.moveTo(leftX, yEntry);
      ctx.lineTo(rightX, yEntry);
      ctx.stroke();

      // R/R badge
      const risk = Math.abs(d.stopPrice - d.entryPrice);
      const reward = Math.abs(d.entryPrice - d.targetPrice);
      const rr = risk > 1e-8 ? (reward / risk).toFixed(2) : '1.00';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.fillText(`Short · R/R: ${rr}`, leftX + 4, yEntry - 4);
    }
  });

  // Crosshair (Vertical + Horizontal + Price Pill + Adaptive UTC Time Pill)
  const hoverIdx =
    tab.hoverIndex !== null && tab.hoverIndex !== undefined
      ? tab.hoverIndex
      : tab.crosshairX !== null && tab.crosshairX !== undefined
        ? Math.max(0, Math.min(visible.length - 1, Math.floor(tab.crosshairX / Math.max(1, slotW))))
        : null;
  const hoverYVal =
    tab.hoverY !== null && tab.hoverY !== undefined ? tab.hoverY : tab.crosshairY;

  if (hoverIdx !== null && hoverIdx >= 0 && hoverIdx < visible.length) {
    const hc = visible[hoverIdx];
    const hx = idxToX(hoverIdx);
    const hy =
      hoverYVal !== null &&
      hoverYVal !== undefined &&
      hoverYVal >= topPad &&
      hoverYVal <= topPad + chartH
        ? hoverYVal
        : priceToY(Number(hc.close));
    const hoverPrice = yToPrice(hy);

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = isDark ? 'rgba(209, 212, 220, 0.55)' : 'rgba(71, 85, 105, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx, topPad);
    ctx.lineTo(hx, topPad + totalChartH);
    ctx.moveTo(0, hy);
    ctx.lineTo(chartW, hy);
    ctx.stroke();
    ctx.restore();

    // Right-axis Crosshair Price Pill
    const pillBgCross = isDark ? '#2A2E39' : '#1E293B';
    ctx.fillStyle = pillBgCross;
    ctx.fillRect(chartW, hy - 10, rightAxisW, 20);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(PriceFormatter.formatPrice(hoverPrice, tab.decimals), chartW + 6, hy + 4);

    // Bottom-axis Crosshair UTC Timestamp Pill
    const timeText = PriceFormatter.formatCandleUtc(
      hc.open_time_utc_ms || hc.openTimeUtc || hc.open_time_utc_iso,
      tab.timeframe
    );
    ctx.font = 'bold 10.5px "JetBrains Mono", monospace';
    const tw = ctx.measureText(timeText).width + 14;
    const tx = Math.max(2, Math.min(chartW - tw - 2, hx - tw / 2));
    ctx.fillStyle = pillBgCross;
    ctx.fillRect(tx, topPad + totalChartH + 2, tw, 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(timeText, tx + 7, topPad + totalChartH + 16);
  }

  canvas._chartMeta = {
    chartW,
    chartH,
    topPad,
    totalChartH,
    visible,
    slotW,
    minP,
    maxP,
    yToPrice,
    priceToY,
  };

  canvas._chartLayout = {
    padLeft: 0,
    padTop: topPad,
    plotW: chartW,
    plotH: chartH,
    visible,
    visibleTimestamps,
    stepMs,
    minP,
    maxP,
    spanP: Math.max(maxP - minP, 0.0001),
    priceToY,
    yToPrice,
    timeToX,
    xToTime,
  };
}

export function computeChartGeometry(canvas, tab) {
  if (canvas && canvas._chartLayout) {
    return canvas._chartLayout;
  }
  if (!canvas || !tab || !Array.isArray(tab.candles) || tab.candles.length === 0) {
    return null;
  }
  renderCandlestickCanvas(canvas, tab, null);
  return canvas._chartLayout || null;
}
