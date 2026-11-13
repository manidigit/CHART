import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.38.0';
import { TechnicalIndicators } from '../algorithms/technicalIndicators.js?v=1.38.0';
import { DrawingGeometry } from '../algorithms/drawingGeometry.js?v=1.38.0';
import { state, getInstrumentSpec } from '../core/store.js?v=1.38.0';

function computeCandleCountdownLabel(lastOpenEpochSec, tf, symbolCode = 'XAUUSD') {
  if (!lastOpenEpochSec) return '';
  const nowMs = Date.now();
  if (!PriceFormatter.isMarketOpen(nowMs, symbolCode)) {
    return 'Closed';
  }
  const normTf = String(tf || 'M15').toUpperCase();
  const stepMs = PriceFormatter.stepMilliseconds(normTf);
  const currentBucketStartMs = PriceFormatter.snapToOpenUtcMs(nowMs, normTf);
  const nextCloseMs = currentBucketStartMs + stepMs;
  const remainSec = Math.max(0, Math.floor((nextCloseMs - nowMs) / 1000));
  const hrs = Math.floor(remainSec / 3600);
  const mins = Math.floor((remainSec % 3600) / 60);
  const secs = remainSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (hrs >= 24) {
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    return `${days}d ${pad(remHrs)}h`;
  }
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

function drawSeriesLine(ctx, series, startIdx, visibleLen, idxToX, priceToY, color, lineWidth = 1.6, dashed = false) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  if (dashed) ctx.setLineDash([4, 3]);
  ctx.beginPath();
  let started = false;
  for (let idx = 0; idx < visibleLen; idx++) {
    const val = series[startIdx + idx];
    if (val !== null && val !== undefined && Number.isFinite(val)) {
      const x = idxToX(idx);
      const y = priceToY(val);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
  }
  if (started) ctx.stroke();
  ctx.restore();
}

function getOrComputeIndicatorCache(tab, candles, bbPeriod, bbStdDev) {
  const n = candles.length;
  const firstBar = n > 0 ? candles[0] : null;
  const lastBar = n > 0 ? candles[n - 1] : null;
  const firstMs = firstBar ? Number(firstBar.open_time_utc_ms || firstBar.openTimeSec || 0) : 0;
  const lastMs = lastBar ? Number(lastBar.open_time_utc_ms || lastBar.openTimeSec || 0) : 0;
  const lastClose = lastBar ? Number(lastBar.close || 0) : 0;
  const tf = String(tab.timeframe || 'M15').toUpperCase();
  const symCode = String(tab.symbolCode || 'XAUUSD').toUpperCase();
  const prov = String(tab.provider || 'tvdatafeed');
  const cacheKey = `${n}_${firstMs}_${lastMs}_${lastClose}_${bbPeriod}_${bbStdDev}_${tf}_${symCode}_${prov}`;

  if (!tab._indCache || tab._indCache.key !== cacheKey) {
    tab._indCache = {
      key: cacheKey,
      sma20: null,
      sma50: null,
      sma200: null,
      ema20: null,
      ema50: null,
      bollinger: null,
      vwap: null,
      supertrend: null,
      macd: null,
      macdLine: null,
      sigLine: null,
      rsi14: null,
      atr14: null,
      smc: null,
      vpKey: null,
      vp: null,
    };
  }
  const cache = tab._indCache;
  return {
    getSma20: () => (cache.sma20 || (cache.sma20 = TechnicalIndicators.computeSma(candles, 20))),
    getSma50: () => (cache.sma50 || (cache.sma50 = TechnicalIndicators.computeSma(candles, 50))),
    getSma200: () => {
      if (!cache.sma200) {
        cache.sma200 = candles.length >= 200 ? TechnicalIndicators.computeSma(candles, 200) : [];
      }
      return cache.sma200;
    },
    getEma20: () => (cache.ema20 || (cache.ema20 = TechnicalIndicators.computeEma(candles, 20))),
    getEma50: () => (cache.ema50 || (cache.ema50 = TechnicalIndicators.computeEma(candles, 50))),
    getBollinger: () =>
      cache.bollinger ||
      (cache.bollinger = TechnicalIndicators.computeBollingerBands(candles, bbPeriod, bbStdDev)),
    getVwap: () =>
      cache.vwap ||
      (cache.vwap = TechnicalIndicators.computeVwap(candles, tf, symCode)),
    getSupertrend: () =>
      cache.supertrend || (cache.supertrend = TechnicalIndicators.computeSupertrend(candles, 10, 3.0)),
    getMacd: () => {
      if (!cache.macd) {
        cache.macd = TechnicalIndicators.computeMacd(candles, 12, 26, 9);
        cache.macdLine = cache.macd.map((x) => (x ? x.macd : null));
        cache.sigLine = cache.macd.map((x) => (x ? x.signal : null));
      }
      return cache;
    },
    getRsi14: () => (cache.rsi14 || (cache.rsi14 = TechnicalIndicators.computeRsi(candles, 14))),
    getAtr14: () => (cache.atr14 || (cache.atr14 = TechnicalIndicators.computeAtr(candles, 14))),
    getSmc: () =>
      cache.smc || (cache.smc = TechnicalIndicators.detectMarketStructureSmc(candles, 3)),
    getVolumeProfile: (visible, startIdx, endIdx) => {
      const spec = getInstrumentSpec(symCode, prov);
      const vKey = `${startIdx}_${endIdx}_${spec.volumeType}`;
      if (cache.vpKey !== vKey || !cache.vp) {
        cache.vpKey = vKey;
        cache.vp = TechnicalIndicators.computeVolumeProfile(visible, 24, 0.70, spec.volumeType);
      }
      return cache.vp;
    },
  };
}

export function renderCandlestickCanvas(canvas, tab, i18n) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.scale(dpr, dpr);

  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const w = rect.width;
  const h = rect.height;
  const isDark = state.isDarkTheme;
  const prefs = state.chartPreferences;
  const tzMode = prefs.timezoneMode === 'LOCAL' ? 'LOCAL' : 'UTC';
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
  if (candles.length === 0) {
    const sym = (state.symbols || []).find((s) => s.symbolCode === tab.symbolCode);
    const providerStatus = tab.providerStatus || (sym && sym.providerStatus) || '';
    let msgKey = 'chart_state_empty';
    let accentColor = textColor;
    if (sym && sym.isSyncing) {
      msgKey = 'chart_state_loading';
      accentColor = '#F59E0B';
    } else if (providerStatus === 'API_KEY_REQUIRED') {
      msgKey = 'chart_state_api_key_required';
      accentColor = '#F59E0B';
    } else if (sym && sym.syncError) {
      msgKey = 'chart_state_error';
      accentColor = bearColor;
    }
    const label = i18n && typeof i18n.t === 'function' ? i18n.t(msgKey) : msgKey;
    ctx.save();
    ctx.fillStyle = accentColor;
    ctx.font = '600 13px "Vazirmatn", "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, h / 2, Math.max(200, w - 48));
    ctx.restore();
    return;
  }

  const rightAxisW = 78;
  const bottomAxisH = 26;
  const topPad = 16;
  const totalChartH = Math.max(120, h - topPad - bottomAxisH);

  // Active sub-panes below main Price Pane
  const showVol = tab.showVolume !== false;
  const activeOscillators = [];
  if (tab.showRsi14) activeOscillators.push('RSI');
  if (tab.showMacd) activeOscillators.push('MACD');
  if (tab.showAtr14) activeOscillators.push('ATR');

  const oscCount = activeOscillators.length;
  const rawVolRatio = Math.max(0.10, Math.min(0.30, Number(tab.volumePaneRatio || 0.18)));
  const volRatio = showVol ? (oscCount > 0 ? Math.min(0.14, rawVolRatio) : rawVolRatio) : 0;
  const eachOscRatio = oscCount === 1 ? 0.18 : oscCount === 2 ? 0.15 : oscCount >= 3 ? 0.13 : 0;
  const totalOscH = totalChartH * (eachOscRatio * oscCount);
  const volPaneH = showVol ? totalChartH * volRatio : 0;
  const pricePaneH = Math.max(80, totalChartH - volPaneH - totalOscH);

  const chartW = Math.max(120, w - rightAxisW);
  const chartH = pricePaneH;
  const volTopY = topPad + pricePaneH;

  const visibleCount = Math.max(12, Math.min(5000, Math.round(tab.visibleCount || 48)));
  const maxOffset = Math.max(0, candles.length - Math.min(candles.length, visibleCount));
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

  const isAutoY = tab.isAutoScaleY !== false;
  const scaleFactor = isAutoY ? 1.0 : Math.max(0.25, Math.min(4.0, Number(tab.priceScaleFactor || 1.0)));
  const baseRange = Math.max(rawMax - rawMin, 0.0001);
  const midPrice = (rawMax + rawMin) / 2.0 + (isAutoY ? 0 : Number(tab.verticalPriceOffset || 0.0));
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

  const effectiveSlots = Math.max(
    visible.length,
    Math.min(visibleCount, candles.length + Math.min(12, Math.round(visible.length * 0.08)))
  );
  const slotW = chartW / Math.max(1, effectiveSlots);
  const bodyW = Math.max(1.0, Math.min(20, slotW * 0.68));
  const idxToX = (idx) => (idx + 0.5) * slotW;

  // Vertical Time Grid + Smart Calendar-Aligned X-Axis Labels
  const smartTicks = PriceFormatter.computeSmartTimeAxisTicks(visible, chartW, tab.timeframe, tzMode);
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

  // Data Boundary Marker when scrolled to beginning of loaded history (placed at bottom-left of price pane to avoid OHLC overlay collision)
  if (startIdx === 0 && visible.length > 0 && candles.length > 0) {
    const firstX = idxToX(0);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
    ctx.beginPath();
    ctx.moveTo(firstX, topPad);
    ctx.lineTo(firstX, topPad + totalChartH);
    ctx.stroke();
    ctx.restore();

    const boundaryText = `${i18n ? i18n.t('chart_data_boundary') : 'Start of loaded history'} (${tab.timeframe || 'M15'})`;
    ctx.font = '600 10px "JetBrains Mono", sans-serif';
    const bTextW = ctx.measureText(boundaryText).width + 14;
    const bx = Math.max(8, Math.min(chartW - bTextW - 8, firstX + 6));
    const by = topPad + chartH - 24;
    ctx.fillStyle = isDark ? 'rgba(245, 158, 11, 0.14)' : 'rgba(245, 158, 11, 0.18)';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bx, by, bTextW, 18, 4);
    } else {
      ctx.rect(bx, by, bTextW, 18);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#F59E0B';
    ctx.fillText(boundaryText, bx + 7, by + 12.5);
  }

  // Clip main Price Pane for price overlays & candles
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, topPad, chartW, chartH);
  ctx.clip();

  const bbPeriod = Math.max(5, Math.min(200, Number(prefs.bollingerPeriod || 20)));
  const bbStdDev = Math.max(0.5, Math.min(5.0, Number(prefs.bollingerStdDev || 2.0)));
  const indCache = getOrComputeIndicatorCache(tab, candles, bbPeriod, bbStdDev);

  // 1. Session / Visible Range Volume Profile (VRVP — POC / VAH / VAL)
  if (tab.showVolumeProfile && visible.length >= 5) {
    const vp = indCache.getVolumeProfile(visible, startIdx, endIdx);
    if (vp && Array.isArray(vp.bins)) {
      const maxProfileW = Math.min(150, chartW * 0.26);
      for (const bin of vp.bins) {
        const yTop = priceToY(bin.high);
        const yBot = priceToY(bin.low);
        const barH = Math.max(1.5, Math.abs(yBot - yTop) - 1);
        const totalW = bin.normWidth * maxProfileW;
        if (totalW < 1) continue;
        const bullRatio = bin.totalVol > 0 ? bin.bullVol / bin.totalVol : 0.5;
        const bullW = totalW * bullRatio;
        const bearW = totalW - bullW;
        const rightX = chartW - 2;

        ctx.fillStyle = bin.isPoc
          ? 'rgba(245, 158, 11, 0.50)'
          : bin.inValueArea
            ? 'rgba(38, 166, 154, 0.30)'
            : 'rgba(148, 163, 184, 0.16)';
        ctx.fillRect(rightX - totalW, Math.min(yTop, yBot), bullW, barH);

        ctx.fillStyle = bin.isPoc
          ? 'rgba(245, 158, 11, 0.65)'
          : bin.inValueArea
            ? 'rgba(239, 83, 80, 0.30)'
            : 'rgba(148, 163, 184, 0.22)';
        ctx.fillRect(rightX - bearW, Math.min(yTop, yBot), bearW, barH);
      }

      // VAH & VAL dashed lines
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = 1.1;
      const vahY = priceToY(vp.vahPrice);
      const valY = priceToY(vp.valPrice);
      ctx.beginPath();
      ctx.moveTo(chartW - maxProfileW - 36, vahY);
      ctx.lineTo(chartW, vahY);
      ctx.moveTo(chartW - maxProfileW - 36, valY);
      ctx.lineTo(chartW, valY);
      ctx.stroke();
      ctx.restore();

      ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
      ctx.fillStyle = '#38BDF8';
      ctx.fillText(`VAH ${PriceFormatter.formatPrice(vp.vahPrice, tab.decimals)}`, chartW - maxProfileW - 34, vahY - 3);
      ctx.fillText(`VAL ${PriceFormatter.formatPrice(vp.valPrice, tab.decimals)}`, chartW - maxProfileW - 34, valY + 10);

      // POC solid golden line
      const pocY = priceToY(vp.pocPrice);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, pocY);
      ctx.lineTo(chartW, pocY);
      ctx.stroke();
      ctx.fillStyle = '#F59E0B';
      ctx.fillText(`POC ${PriceFormatter.formatPrice(vp.pocPrice, tab.decimals)}`, chartW - maxProfileW - 34, pocY - 4);

      if (vp.isEstimated) {
        const estLabel =
          (i18n && typeof i18n.t === 'function' && i18n.t('chart_est_vol_profile')) ||
          'Est. Vol Profile';
        ctx.font = '600 9.5px "JetBrains Mono", sans-serif';
        const estW = ctx.measureText(estLabel).width + 12;
        const estX = Math.max(8, chartW - estW - 8);
        const estY = topPad + 6;
        ctx.fillStyle = isDark ? 'rgba(245, 158, 11, 0.16)' : 'rgba(245, 158, 11, 0.2)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(estX, estY, estW, 17, 4);
        else ctx.rect(estX, estY, estW, 17);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#F59E0B';
        ctx.fillText(estLabel, estX + 6, estY + 11.5);
      }
    }
  }

  // 2. Smart Money Concepts (SMC): Fair Value Gaps (FVG) & Market Structure (BOS / CHoCH / EQH / EQL)
  if ((tab.showFvg || tab.showSmcStructure) && candles.length >= 10) {
    const smc = indCache.getSmc();

    if (tab.showFvg && Array.isArray(smc.fvgs)) {
      for (const fvg of smc.fvgs) {
        if (fvg.endIndex < startIdx || fvg.startIndex >= endIdx) continue;
        const visStart = Math.max(0, fvg.startIndex - startIdx);
        const visEnd = Math.min(visible.length - 1, fvg.endIndex - startIdx);
        const x1 = idxToX(visStart);
        const x2 = Math.max(x1 + slotW, idxToX(visEnd));
        const yTop = priceToY(fvg.top);
        const yBot = priceToY(fvg.bottom);
        const topY = Math.min(yTop, yBot);
        const boxH = Math.max(3, Math.abs(yBot - yTop));

        ctx.fillStyle =
          fvg.direction === 1 ? 'rgba(38, 166, 154, 0.16)' : 'rgba(239, 83, 80, 0.16)';
        ctx.fillRect(x1, topY, x2 - x1, boxH);

        ctx.strokeStyle =
          fvg.direction === 1 ? 'rgba(38, 166, 154, 0.48)' : 'rgba(239, 83, 80, 0.48)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x1, topY, x2 - x1, boxH);

        if (x2 - x1 >= 26) {
          ctx.fillStyle = fvg.direction === 1 ? '#26A69A' : '#EF5350';
          ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
          ctx.fillText('FVG', x1 + 4, topY + Math.min(boxH - 2, 10));
        }
      }
    }

    if (tab.showSmcStructure) {
      // BOS & CHoCH structural breaks
      if (Array.isArray(smc.structures)) {
        for (const st of smc.structures) {
          if (st.breakIndex < startIdx || st.startIndex >= endIdx) continue;
          const visStart = Math.max(0, st.startIndex - startIdx);
          const visBreak = Math.min(visible.length - 1, st.breakIndex - startIdx);
          const x1 = idxToX(visStart);
          const x2 = idxToX(visBreak);
          const y = priceToY(st.price);
          const col = st.direction === 1 ? '#26A69A' : '#EF5350';

          ctx.save();
          ctx.strokeStyle = col;
          ctx.lineWidth = st.type === 'CHoCH' ? 1.5 : 1.2;
          ctx.setLineDash(st.type === 'CHoCH' ? [5, 3] : [2, 2]);
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
          ctx.stroke();
          ctx.restore();

          const midX = (x1 + x2) / 2;
          const label = st.type;
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = isDark ? 'rgba(19, 23, 34, 0.85)' : 'rgba(255, 255, 255, 0.88)';
          const badgeY = st.direction === 1 ? y - 13 : y + 3;
          ctx.fillRect(midX - tw / 2 - 3, badgeY, tw + 6, 11);
          ctx.fillStyle = col;
          ctx.fillText(label, midX - tw / 2, badgeY + 8.5);
        }
      }

      // Equal Highs (EQH) & Equal Lows (EQL)
      if (Array.isArray(smc.equalLevels)) {
        for (const eq of smc.equalLevels) {
          if (eq.endIndex < startIdx || eq.startIndex >= endIdx) continue;
          const visStart = Math.max(0, eq.startIndex - startIdx);
          const visEnd = Math.min(visible.length - 1, eq.endIndex - startIdx);
          const x1 = idxToX(visStart);
          const x2 = idxToX(visEnd);
          const y = priceToY(eq.price);
          const col = eq.type === 'EQH' ? '#F59E0B' : '#38BDF8';

          ctx.save();
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
          ctx.stroke();
          ctx.restore();

          ctx.fillStyle = col;
          ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
          ctx.fillText(eq.type, (x1 + x2) / 2 - 8, eq.type === 'EQH' ? y - 4 : y + 10);
        }
      }
    }
  }

  // Dashed Previous Session Close Reference Line
  if (prefs.showPrevCloseLine !== false && candles.length >= 2) {
    const latestMs = Number(
      candles[candles.length - 1].open_time_utc_ms ||
        (candles[candles.length - 1].openTimeSec ? candles[candles.length - 1].openTimeSec * 1000 : 0)
    );
    const latestDayKey = PriceFormatter.getSessionDayKey(latestMs, tab.symbolCode);
    let prevClose = null;
    for (let i = candles.length - 2; i >= 0; i--) {
      const ms = Number(candles[i].open_time_utc_ms || (candles[i].openTimeSec ? candles[i].openTimeSec * 1000 : 0));
      if (ms > 0 && PriceFormatter.getSessionDayKey(ms, tab.symbolCode) !== latestDayKey) {
        prevClose = Number(candles[i].close);
        break;
      }
    }
    if (prevClose === null) {
      const d1Key = `${tab.symbolCode}_${tab.provider || 'tvdatafeed'}_D1`;
      const d1 = (state.candleCache && state.candleCache[d1Key]) || [];
      if (d1.length >= 2) {
        for (let i = d1.length - 1; i >= 0; i--) {
          const ms = Number(d1[i].open_time_utc_ms || (d1[i].openTimeSec ? d1[i].openTimeSec * 1000 : 0));
          if (ms > 0 && PriceFormatter.getSessionDayKey(ms, tab.symbolCode) !== latestDayKey) {
            prevClose = Number(d1[i].close);
            break;
          }
        }
      }
    }
    if (prevClose !== null && Number.isFinite(prevClose)) {
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
  }

  // Bollinger Bands (Configurable Period & StdDev) Overlay
  if (tab.showBollinger && candles.length >= bbPeriod) {
    const bbArr = indCache.getBollinger();
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

  // Moving Averages & Main Overlays
  if (tab.showSma20 && candles.length >= 20) {
    drawSeriesLine(ctx, indCache.getSma20(), startIdx, visible.length, idxToX, priceToY, '#F59E0B', 1.6);
  }
  if (tab.showSma50 && candles.length >= 50) {
    drawSeriesLine(ctx, indCache.getSma50(), startIdx, visible.length, idxToX, priceToY, '#38BDF8', 1.6);
  }
  if (tab.showSma200) {
    if (candles.length >= 200) {
      drawSeriesLine(ctx, indCache.getSma200(), startIdx, visible.length, idxToX, priceToY, '#EC4899', 1.8);
    } else {
      const warnTpl =
        (i18n && typeof i18n.t === 'function' && i18n.t('chart_sma200_insufficient')) ||
        'SMA200: Insufficient Data ({n}/200)';
      const warnText = String(warnTpl).replace('{n}', String(candles.length));
      ctx.save();
      ctx.font = '600 10px "JetBrains Mono", sans-serif';
      const wBoxW = ctx.measureText(warnText).width + 14;
      const wBoxX = 8;
      const wBoxY = topPad + 36;
      ctx.fillStyle = isDark ? 'rgba(236, 72, 153, 0.14)' : 'rgba(236, 72, 153, 0.16)';
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(wBoxX, wBoxY, wBoxW, 18, 4);
      else ctx.rect(wBoxX, wBoxY, wBoxW, 18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#EC4899';
      ctx.fillText(warnText, wBoxX + 7, wBoxY + 12.5);
      ctx.restore();
    }
  }
  if (tab.showEma20 && candles.length >= 20) {
    drawSeriesLine(ctx, indCache.getEma20(), startIdx, visible.length, idxToX, priceToY, '#10B981', 1.5);
  }
  if (tab.showEma50 && candles.length >= 50) {
    drawSeriesLine(ctx, indCache.getEma50(), startIdx, visible.length, idxToX, priceToY, '#06B6D4', 1.6);
  }
  if (tab.showVwap && candles.length >= 2) {
    drawSeriesLine(ctx, indCache.getVwap(), startIdx, visible.length, idxToX, priceToY, '#EAB308', 1.6, true);
  }
  if (tab.showSupertrend && candles.length >= 10) {
    const stArr = indCache.getSupertrend();
    ctx.save();
    ctx.lineWidth = 2.0;
    for (let idx = 1; idx < visible.length; idx++) {
      const prevSt = stArr[startIdx + idx - 1];
      const curSt = stArr[startIdx + idx];
      if (!prevSt || !curSt) continue;
      ctx.strokeStyle = curSt.direction === 1 ? '#26A69A' : '#EF5350';
      ctx.beginPath();
      ctx.moveTo(idxToX(idx - 1), priceToY(prevSt.value));
      ctx.lineTo(idxToX(idx), priceToY(curSt.value));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Overlay Classic MACD (12, 26, 9) directly on Main Price Chart (Lower 28% band of Price Pane)
  if (tab.showOverlayMacd && candles.length >= 26) {
    const { macd: macdArr } = indCache.getMacd();
    const visMacd = macdArr.slice(startIdx, endIdx).filter(Boolean);
    if (visMacd.length > 0) {
      let maxAbs = 0.0001;
      for (const m of visMacd) {
        maxAbs = Math.max(
          maxAbs,
          Math.abs(Number(m.macd || 0)),
          Math.abs(Number(m.signal || 0)),
          Math.abs(Number(m.histogram || 0))
        );
      }
      const bandTopY = topPad + chartH * 0.70;
      const bandBottomY = topPad + chartH - 6;
      const zeroY = (bandTopY + bandBottomY) / 2;
      const halfBandH = Math.max(12, (bandBottomY - bandTopY) * 0.45);
      const macdToY = (v) => zeroY - (Number(v || 0) / maxAbs) * halfBandH;

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(chartW, zeroY);
      ctx.stroke();
      ctx.restore();

      // Histogram bars
      for (let idx = 0; idx < visible.length; idx++) {
        const pt = macdArr[startIdx + idx];
        if (!pt || !Number.isFinite(pt.histogram)) continue;
        const x = idxToX(idx);
        const hY = macdToY(pt.histogram);
        const topBarY = Math.min(zeroY, hY);
        const barH = Math.max(1.5, Math.abs(hY - zeroY));
        ctx.fillStyle = pt.histogram >= 0 ? 'rgba(38, 166, 154, 0.38)' : 'rgba(239, 83, 80, 0.38)';
        ctx.fillRect(x - bodyW * 0.42, topBarY, Math.max(1.5, bodyW * 0.84), barH);
      }

      // MACD Line (#2962FF)
      ctx.save();
      ctx.strokeStyle = '#2962FF';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let startedM = false;
      for (let idx = 0; idx < visible.length; idx++) {
        const pt = macdArr[startIdx + idx];
        if (!pt || !Number.isFinite(pt.macd)) continue;
        const x = idxToX(idx);
        const y = macdToY(pt.macd);
        if (!startedM) {
          ctx.moveTo(x, y);
          startedM = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      if (startedM) ctx.stroke();

      // Signal Line (#FF6D00)
      ctx.strokeStyle = '#FF6D00';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let startedS = false;
      for (let idx = 0; idx < visible.length; idx++) {
        const pt = macdArr[startIdx + idx];
        if (!pt || !Number.isFinite(pt.signal)) continue;
        const x = idxToX(idx);
        const y = macdToY(pt.signal);
        if (!startedS) {
          ctx.moveTo(x, y);
          startedS = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      if (startedS) ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore(); // End Price Pane clip

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

  // Synchronized Multi-Pane Oscillators (RSI 14, MACD 12,26,9, ATR 14)
  let currentSubTopY = volTopY + volPaneH;
  const eachOscH = oscCount > 0 ? totalOscH / oscCount : 0;
  const activeIdxGlobal =
    tab.hoverIndex !== null && tab.hoverIndex !== undefined && visible[tab.hoverIndex]
      ? startIdx + tab.hoverIndex
      : candles.length - 1;

  for (const oscType of activeOscillators) {
    const paneTop = currentSubTopY;
    const paneH = eachOscH;
    currentSubTopY += paneH;
    if (paneH < 24) continue;

    // Top border of oscillator pane
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, paneTop);
    ctx.lineTo(w, paneTop);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, paneTop, chartW, paneH);
    ctx.clip();

    if (oscType === 'RSI') {
      const rsiArr = indCache.getRsi14();
      const rsiToY = (val) => paneTop + 6 + (paneH - 12) * (1 - Math.max(0, Math.min(100, val)) / 100);
      const y70 = rsiToY(70);
      const y50 = rsiToY(50);
      const y30 = rsiToY(30);

      // 30..70 channel fill
      ctx.fillStyle = 'rgba(168, 85, 247, 0.07)';
      ctx.fillRect(0, y70, chartW, Math.max(2, y30 - y70));

      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
      ctx.beginPath();
      ctx.moveTo(0, y70);
      ctx.lineTo(chartW, y70);
      ctx.moveTo(0, y30);
      ctx.lineTo(chartW, y30);
      ctx.strokeStyle = gridColor;
      ctx.moveTo(0, y50);
      ctx.lineTo(chartW, y50);
      ctx.stroke();
      ctx.restore();

      drawSeriesLine(ctx, rsiArr, startIdx, visible.length, idxToX, rsiToY, '#A855F7', 1.6);

      const curRsi = rsiArr[activeIdxGlobal];
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#A855F7';
      ctx.fillText(
        `RSI (14): ${curRsi !== null && curRsi !== undefined ? curRsi.toFixed(2) : '—'}`,
        10,
        paneTop + 13
      );
      ctx.restore();

      ctx.font = '9.5px "JetBrains Mono", monospace';
      ctx.fillStyle = textColor;
      ctx.fillText('70', chartW + 6, y70 + 3);
      ctx.fillText('30', chartW + 6, y30 + 3);
    } else if (oscType === 'MACD') {
      const { macd: macdArr, macdLine, sigLine } = indCache.getMacd();
      let maxAbs = 0.0001;
      for (let idx = 0; idx < visible.length; idx++) {
        const item = macdArr[startIdx + idx];
        if (!item) continue;
        if (item.macd !== null) maxAbs = Math.max(maxAbs, Math.abs(item.macd));
        if (item.signal !== null) maxAbs = Math.max(maxAbs, Math.abs(item.signal));
        if (item.histogram !== null) maxAbs = Math.max(maxAbs, Math.abs(item.histogram));
      }
      const macdToY = (val) =>
        paneTop + 6 + (paneH - 12) * (0.5 - Math.max(-maxAbs, Math.min(maxAbs, val)) / (2 * maxAbs));
      const zeroY = macdToY(0);

      ctx.strokeStyle = gridColor;
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(chartW, zeroY);
      ctx.stroke();

      // Histogram bars
      for (let idx = 0; idx < visible.length; idx++) {
        const item = macdArr[startIdx + idx];
        if (!item || item.histogram === null) continue;
        const x = idxToX(idx);
        const hy = macdToY(item.histogram);
        const topBar = Math.min(zeroY, hy);
        const barH = Math.max(1.5, Math.abs(hy - zeroY));
        ctx.fillStyle = item.histogram >= 0 ? 'rgba(38, 166, 154, 0.55)' : 'rgba(239, 83, 80, 0.55)';
        ctx.fillRect(x - bodyW / 2, topBar, bodyW, barH);
      }

      drawSeriesLine(ctx, macdLine, startIdx, visible.length, idxToX, macdToY, '#2962FF', 1.5);
      drawSeriesLine(ctx, sigLine, startIdx, visible.length, idxToX, macdToY, '#F59E0B', 1.4);

      const curM = macdArr[activeIdxGlobal];
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#2962FF';
      const mStr = curM && curM.macd !== null ? curM.macd.toFixed(tab.decimals) : '—';
      const sStr = curM && curM.signal !== null ? curM.signal.toFixed(tab.decimals) : '—';
      const hStr = curM && curM.histogram !== null ? curM.histogram.toFixed(tab.decimals) : '—';
      ctx.fillText(`MACD (12,26,9): ${mStr}  Sig: ${sStr}  Hist: ${hStr}`, 10, paneTop + 13);
      ctx.restore();

      ctx.font = '9.5px "JetBrains Mono", monospace';
      ctx.fillStyle = textColor;
      ctx.fillText('0.00', chartW + 6, zeroY + 3);
    } else if (oscType === 'ATR') {
      const atrArr = indCache.getAtr14();
      let minA = Infinity;
      let maxA = -Infinity;
      for (let idx = 0; idx < visible.length; idx++) {
        const v = atrArr[startIdx + idx];
        if (v !== null && v !== undefined) {
          minA = Math.min(minA, v);
          maxA = Math.max(maxA, v);
        }
      }
      if (!isFinite(minA) || !isFinite(maxA) || maxA <= minA) {
        minA = 0;
        maxA = 1;
      }
      const spanA = Math.max(1e-8, maxA - minA);
      const atrToY = (val) => paneTop + 8 + (paneH - 16) * (1 - (val - minA) / spanA);

      drawSeriesLine(ctx, atrArr, startIdx, visible.length, idxToX, atrToY, '#F43F5E', 1.6);

      const curAtr = atrArr[activeIdxGlobal];
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#F43F5E';
      ctx.fillText(
        `ATR (14): ${curAtr !== null && curAtr !== undefined ? PriceFormatter.formatPrice(curAtr, tab.decimals) : '—'}`,
        10,
        paneTop + 13
      );
      ctx.restore();

      ctx.font = '9.5px "JetBrains Mono", monospace';
      ctx.fillStyle = textColor;
      ctx.fillText(PriceFormatter.formatPrice(maxA, tab.decimals), chartW + 6, paneTop + 12);
      ctx.fillText(PriceFormatter.formatPrice(minA, tab.decimals), chartW + 6, paneTop + paneH - 4);
    } else {
      ctx.restore();
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
        ? computeCandleCountdownLabel(lastCandle.openTimeSec, tab.timeframe, tab.symbolCode)
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

      const p0382 = levels.find((l) => l.ratio === 0.382)?.price;
      if (p0382 !== undefined) {
        const y0382 = priceToY(p0382);
        ctx.fillStyle = 'rgba(38, 166, 154, 0.10)';
        ctx.fillRect(minX, Math.min(y0382, y05), maxX - minX, Math.max(2, Math.abs(y05 - y0382)));
      }

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();

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

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = baseW;
      ctx.beginPath();
      ctx.moveTo(leftX, yEntry);
      ctx.lineTo(rightX, yEntry);
      ctx.stroke();

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

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = baseW;
      ctx.beginPath();
      ctx.moveTo(leftX, yEntry);
      ctx.lineTo(rightX, yEntry);
      ctx.stroke();

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

    const pillBgCross = isDark ? '#2A2E39' : '#1E293B';
    ctx.fillStyle = pillBgCross;
    ctx.fillRect(chartW, hy - 10, rightAxisW, 20);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(PriceFormatter.formatPrice(hoverPrice, tab.decimals), chartW + 6, hy + 4);

    const timeText = PriceFormatter.formatCandleUtc(
      hc.open_time_utc_ms || hc.openTimeUtc || hc.open_time_utc_iso,
      tab.timeframe,
      tzMode
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
