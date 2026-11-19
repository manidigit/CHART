import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.47.1';
import {
  RENDER_MODES,
  FORECAST_STATUS,
  SCENARIO_STATUS,
  MODEL_EXECUTION_STATUS,
  NO_EDGE_GATE_STATE,
  OOD_STATUS,
  LIFECYCLE_STATUS,
  EVALUATION_OUTCOME,
  SELECTION_MODE,
  normalizeRenderMode,
  clampHorizonBars,
} from '../forecast/forecastContract.js?v=2.0.3';
import { defaultForecastRegistry } from '../forecast/modelRegistry.js?v=2.0.1';
import { defaultForecastLedger } from '../forecast/forecastLedger.js?v=2.0.1';
import { ForecastEngine, resolveLowerTimeframeInfo } from '../forecast/forecastEngine.js?v=2.0.0';

import { state, escapeHtml, getCachedOrAggregatedCandles } from '../core/store.js?v=1.47.12';
import { renderSymbolBadge } from './watchlistView.js?v=1.47.2';

const MODEL_OVERLAY_COLORS = {
  empirical_analogs: '#F59E0B',
  naive_persistence: '#94A3B8',
  native_arima_diff: '#38BDF8',
  native_prophet_decomp: '#22C55E',
  native_seq_recurrent_approx: '#EC4899',
  native_quantile_attention_approx: '#A855F7',
  ensemble: '#14B8A6',
  py_arima_statsmodels: '#0EA5E9',
  py_arima: '#0EA5E9',
  py_prophet: '#10B981',
  py_lstm_torch: '#F43F5E',
  py_lstm_mc: '#F43F5E',
  py_tft_torch: '#8B5CF6',
  py_tft: '#8B5CF6',
};

export function resolveHigherTimeframe(tf = 'M15') {
  const norm = String(tf || 'M15').toUpperCase();
  if (norm === 'M15') return 'H1';
  if (norm === 'M30') return 'H4';
  if (norm === 'H1') return 'H4';
  if (norm === 'H4') return 'D1';
  if (norm === 'D1') return 'W1';
  return '';
}

export function buildForecastForTab(activeTab, overrides = {}) {
  if (!activeTab) return null;
  const candles =
    Array.isArray(activeTab.candles) && activeTab.candles.length > 0
      ? activeTab.candles
      : getCachedOrAggregatedCandles(activeTab.symbolCode, activeTab.provider, activeTab.timeframe);

  const prefs = state.chartPreferences || {};
  if (prefs.forecastPluginConfig) {
    defaultForecastRegistry.applyConfig(prefs.forecastPluginConfig);
  }
  const horizonBars = clampHorizonBars(overrides.horizonBars || activeTab.forecastHorizonBars || prefs.forecastHorizonBars || 30);
  const renderMode = normalizeRenderMode(overrides.renderMode || activeTab.forecastRenderMode || prefs.forecastRenderMode || RENDER_MODES.FAN_CHART);
  // Shared-hosting production policy: inference is native JavaScript only. No Python worker URL is read or invoked.
  const workerUrl = '';

  const higherTf = resolveHigherTimeframe(activeTab.timeframe);
  const higherCandles = higherTf
    ? getCachedOrAggregatedCandles(activeTab.symbolCode, activeTab.provider, higherTf)
    : [];
  const lowerInfo = resolveLowerTimeframeInfo(activeTab.timeframe);
  const lowerTf = lowerInfo ? lowerInfo.timeframe : '';
  const lowerCandles = lowerTf
    ? getCachedOrAggregatedCandles(activeTab.symbolCode, activeTab.provider, lowerTf)
    : [];

  if (!state._prevForecastByKey) state._prevForecastByKey = {};
  const cacheKey = `${activeTab.symbolCode}_${activeTab.timeframe}_${horizonBars}`;
  const lastStored = state._prevForecastByKey[cacheKey] || null;

  const selectedScenarioId = activeTab.selectedScenarioId || prefs.selectedScenarioId || 'SCENARIO_A';
  const selectedModelId = String(overrides.selectedModelId || activeTab.selectedForecastModelId || prefs.selectedForecastModelId || 'AUTO');
  const lastBar = candles.length > 0 ? candles[candles.length - 1] : null;
  const firstBar = candles.length > 0 ? candles[0] : null;
  const lastHigherBar = higherCandles.length > 0 ? higherCandles[higherCandles.length - 1] : null;
  const lastLowerBar = lowerCandles.length > 0 ? lowerCandles[lowerCandles.length - 1] : null;
  const memoKey = [
    activeTab.symbolCode,
    activeTab.provider,
    activeTab.timeframe,
    candles.length,
    firstBar?.open_time_utc_ms || 0,
    lastBar?.open_time_utc_ms || 0,
    lastBar?.close || 0,
    higherTf,
    higherCandles.length,
    lastHigherBar?.open_time_utc_ms || 0,
    lowerTf,
    lowerCandles.length,
    lastLowerBar?.open_time_utc_ms || 0,
    horizonBars,
    renderMode,
    selectedScenarioId,
    selectedModelId,
    workerUrl,
    JSON.stringify(prefs.forecastPluginConfig || null),
  ].join('|');

  if (!state._workerForecastByKey) state._workerForecastByKey = {};
  if (!state._workerPendingKeys) state._workerPendingKeys = {};

  if (state._forecastBuildMemo && state._forecastBuildMemo.key === memoKey) {
    return state._forecastBuildMemo.value;
  }

  let result = ForecastEngine.project(candles, {
    symbolCode: activeTab.symbolCode,
    providerId: activeTab.provider || 'tvdatafeed',
    timeframe: activeTab.timeframe,
    horizonBars,
    renderMode,
    selectedScenarioId,
    selectedModelId,
    registry: defaultForecastRegistry,
    workerUrl,
    higherTimeframe: higherTf,
    higherTimeframeCandles: higherCandles,
    lowerTimeframe: lowerTf,
    lowerTimeframeCandles: lowerCandles,
    previousForecast:
      lastStored && lastStored.inputHash !== undefined
        ? lastStored
        : null,
  });



  if (result && result.status !== FORECAST_STATUS.DATA_NOT_READY) {
    if (!lastStored || lastStored.inputHash !== result.inputHash) {
      state._prevForecastByKey[cacheKey] = result;
    }
  }

  const built = {
    candles,
    result,
  };
  state._forecastBuildMemo = {
    key: memoKey,
    value: built,
  };
  return built;
}

export function renderForecastStudioFanCanvas(
  canvas,
  candles = [],
  forecast = null,
  decimals = 2,
  isDark = true,
  coordMode = 'independent'
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(320, Math.floor(rect.width || 680));
  const h = Math.max(220, Math.floor(rect.height || 300));
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bg = isDark ? '#131722' : '#FFFFFF';
  const gridCol = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.07)';
  const textCol = isDark ? '#94A3B8' : '#475569';
  const bullCol = '#26A69A';
  const bearCol = '#EF5350';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const hist = candles.slice(-48);
  const useCoord =
    coordMode === 'coordinated' &&
    forecast?.mtfCoordination &&
    Array.isArray(forecast.mtfCoordination.coordinatedPoints) &&
    forecast.mtfCoordination.coordinatedPoints.length > 0;
  const pts = useCoord
    ? forecast.mtfCoordination.coordinatedPoints
    : forecast && Array.isArray(forecast.points)
      ? forecast.points
      : [];

  if (hist.length === 0) {
    ctx.fillStyle = textCol;
    ctx.font = '600 13px "Vazirmatn", "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No candle history loaded for selected symbol / timeframe', w / 2, h / 2);
    return;
  }

  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of hist) {
    minP = Math.min(minP, Number(c.low));
    maxP = Math.max(maxP, Number(c.high));
  }
  for (const p of pts) {
    const lo = Number(p.q10 ?? p.low);
    const hi = Number(p.q90 ?? p.high);
    if (Number.isFinite(lo)) minP = Math.min(minP, lo);
    if (Number.isFinite(hi)) maxP = Math.max(maxP, hi);
  }
  const padPrice = Math.max(1e-6, (maxP - minP) * 0.08);
  minP -= padPrice;
  maxP += padPrice;

  const padL = 14;
  const padR = 112;
  const padT = 20;
  const padB = 26;
  const plotW = Math.max(100, w - padL - padR);
  const plotH = Math.max(80, h - padT - padB);
  const totalSlots = hist.length + pts.length;
  const slotW = plotW / Math.max(1, totalSlots);

  const xOf = (idx) => padL + (idx + 0.5) * slotW;
  const yOf = (price) => padT + ((maxP - price) / Math.max(1e-8, maxP - minP)) * plotH;

  const lastPtForAxis = pts.length > 0 ? pts[pts.length - 1] : null;
  let q90Y = lastPtForAxis ? Math.max(padT + 10, Math.min(padT + plotH - 34, yOf(lastPtForAxis.q90))) : null;
  let q50Y = lastPtForAxis ? Math.max(padT + 25, Math.min(padT + plotH - 19, yOf(lastPtForAxis.q50))) : null;
  let q10Y = lastPtForAxis ? Math.max(padT + 40, Math.min(padT + plotH - 4, yOf(lastPtForAxis.q10))) : null;
  if (lastPtForAxis) {
    if (q50Y - q90Y < 15) q50Y = Math.min(padT + plotH - 18, q90Y + 15);
    if (q10Y - q50Y < 15) q10Y = Math.min(padT + plotH - 3, q50Y + 15);
    if (q50Y - q90Y < 15) q90Y = Math.max(padT + 10, q50Y - 15);
  }

  // Right price axis separator line
  ctx.strokeStyle = gridCol;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w - padR, padT);
  ctx.lineTo(w - padR, padT + plotH);
  ctx.stroke();

  // Horizontal grid + Y labels (placed in right gutter, skipping any tick that would collide with q90/q50/q10 badges)
  ctx.font = '600 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  for (let g = 0; g <= 4; g++) {
    const frac = g / 4;
    const py = padT + frac * plotH;
    const pv = maxP - frac * (maxP - minP);
    ctx.beginPath();
    ctx.moveTo(padL, py);
    ctx.lineTo(w - padR, py);
    ctx.stroke();
    const collidesWithQuantile =
      lastPtForAxis &&
      (Math.abs(py - q90Y) < 13 || Math.abs(py - q50Y) < 13 || Math.abs(py - q10Y) < 13);
    if (!collidesWithQuantile) {
      ctx.fillStyle = textCol;
      ctx.fillText(PriceFormatter.formatPrice(pv, decimals), w - padR + 8, py + 3);
    }
  }

  // Key Price Zones horizontal shaded bands (v1.3.0)
  const zones = Array.isArray(forecast?.keyZones) ? forecast.keyZones : [];
  for (const z of zones) {
    const yTop = yOf(z.highPrice);
    const yBot = yOf(z.lowPrice);
    const isRes = z.zoneType === 'RESISTANCE_ZONE';
    ctx.fillStyle = isRes ? 'rgba(239, 83, 80, 0.08)' : 'rgba(38, 166, 154, 0.08)';
    ctx.fillRect(padL, Math.min(yTop, yBot), plotW, Math.max(2, Math.abs(yBot - yTop)));
  }

  // Historical candlesticks
  const bodyW = Math.max(2, Math.min(11, slotW * 0.64));
  hist.forEach((c, i) => {
    const x = xOf(i);
    const col = Number(c.close) >= Number(c.open) ? bullCol : bearCol;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, yOf(Number(c.high)));
    ctx.lineTo(x, yOf(Number(c.low)));
    ctx.stroke();
    const oY = yOf(Number(c.open));
    const cY = yOf(Number(c.close));
    ctx.fillStyle = col;
    ctx.fillRect(x - bodyW / 2, Math.min(oY, cY), bodyW, Math.max(1.5, Math.abs(cY - oY)));
  });

  if (pts.length > 0) {
    const mode = normalizeRenderMode(forecast.renderMode);
    const dividerX = padL + hist.length * slotW;

    // Fan clouds (FAN_CHART or HYBRID)
    if (mode === RENDER_MODES.FAN_CHART || mode === RENDER_MODES.HYBRID) {
      ctx.fillStyle = useCoord
        ? isDark
          ? 'rgba(168, 85, 247, 0.14)'
          : 'rgba(147, 51, 234, 0.12)'
        : isDark
          ? 'rgba(56, 189, 248, 0.13)'
          : 'rgba(41, 98, 255, 0.12)';
      ctx.beginPath();
      ctx.moveTo(xOf(hist.length - 1), yOf(Number(hist[hist.length - 1].close)));
      pts.forEach((p, idx) => ctx.lineTo(xOf(hist.length + idx), yOf(p.q90)));
      for (let idx = pts.length - 1; idx >= 0; idx--) {
        ctx.lineTo(xOf(hist.length + idx), yOf(pts[idx].q10));
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isDark ? 'rgba(245, 158, 11, 0.22)' : 'rgba(245, 158, 11, 0.2)';
      ctx.beginPath();
      ctx.moveTo(xOf(hist.length - 1), yOf(Number(hist[hist.length - 1].close)));
      pts.forEach((p, idx) => ctx.lineTo(xOf(hist.length + idx), yOf(p.q75)));
      for (let idx = pts.length - 1; idx >= 0; idx--) {
        ctx.lineTo(xOf(hist.length + idx), yOf(pts[idx].q25));
      }
      ctx.closePath();
      ctx.fill();
    }

    // Optional quantile envelope bars derived strictly from q25..q75 and q50 (no synthetic wicks/waves)
    if (mode === RENDER_MODES.GHOST_CANDLES || mode === RENDER_MODES.HYBRID) {
      let prevMed = Number(hist[hist.length - 1].close);
      pts.forEach((p) => {
        const idx = pts.indexOf(p);
        const x = xOf(hist.length + idx);
        const openP = Number.isFinite(Number(p.open)) ? Number(p.open) : prevMed;
        const closeP = Number.isFinite(Number(p.close)) ? Number(p.close) : Number(p.q50);
        const highP = Number.isFinite(Number(p.high)) ? Number(p.high) : Math.max(openP, closeP, Number(p.q75));
        const lowP = Number.isFinite(Number(p.low)) ? Number(p.low) : Math.min(openP, closeP, Number(p.q25));
        prevMed = closeP;
        const bull = closeP >= openP;
        const baseCol = bull ? 'rgba(38, 166, 154, 0.72)' : 'rgba(239, 83, 80, 0.72)';
        ctx.strokeStyle = bull ? 'rgba(38, 166, 154, 0.85)' : 'rgba(239, 83, 80, 0.85)';
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.moveTo(x, yOf(highP));
        ctx.lineTo(x, yOf(lowP));
        ctx.stroke();
        const oY = yOf(openP);
        const cY = yOf(closeP);
        ctx.fillStyle = baseCol;
        ctx.fillRect(x - bodyW / 2, Math.min(oY, cY), bodyW, Math.max(2, Math.abs(cY - oY)));
      });
    }

    // Optional Illustrative Empirical Analog Medoids (not calibrated probabilities)
    if (Array.isArray(forecast?.representativePaths) && forecast.representativePaths.length > 0) {
      const repCols = ['#38BDF8', '#94A3B8', '#A855F7'];
      forecast.representativePaths.forEach((rep, rIdx) => {
        if (!Array.isArray(rep.closes) || rep.closes.length === 0) return;
        const col = repCols[rIdx % repCols.length];
        ctx.save();
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.58;
        ctx.lineWidth = 1.3;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(xOf(hist.length - 1), yOf(Number(hist[hist.length - 1].close)));
        rep.closes.slice(0, pts.length).forEach((cv, idx) => {
          ctx.lineTo(xOf(hist.length + idx), yOf(Number(cv)));
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      });
    }

    // Overlay q50 comparison trajectories from all competing successful models
    const trajs = Array.isArray(forecast?.modelTrajectories) ? forecast.modelTrajectories : [];
    const overlayModels = trajs.filter(
      (t) =>
        t.status === MODEL_EXECUTION_STATUS.SUCCESS &&
        Array.isArray(t.points) &&
        t.points.length >= pts.length &&
        t.modelId !== forecast.selectedChartModelId &&
        (!Array.isArray(forecast.visibleComparisonModelIds) || forecast.visibleComparisonModelIds.includes(t.modelId)) &&
        ['empirical_analogs', 'native_arima_diff', 'native_prophet_decomp', 'native_seq_recurrent_approx', 'native_quantile_attention_approx', 'py_arima', 'py_arima_statsmodels', 'py_prophet', 'py_lstm_mc', 'py_lstm_torch', 'py_tft', 'py_tft_torch'].includes(t.modelId)
    );
    overlayModels.forEach((tr) => {
      const col = MODEL_OVERLAY_COLORS[tr.modelId] || '#64748B';
      ctx.save();
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 1.3;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(xOf(hist.length - 1), yOf(Number(hist[hist.length - 1].close)));
      for (let idx = 0; idx < pts.length; idx++) {
        ctx.lineTo(xOf(hist.length + idx), yOf(Number(tr.points[idx].q50)));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });

    // Active Median q50 line
    ctx.strokeStyle = useCoord ? '#A855F7' : (MODEL_OVERLAY_COLORS[forecast?.selectedChartModelId] || '#F59E0B');
    ctx.lineWidth = 2.2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(xOf(hist.length - 1), yOf(Number(hist[hist.length - 1].close)));
    pts.forEach((p, idx) => ctx.lineTo(xOf(hist.length + idx), yOf(p.q50)));
    ctx.stroke();
    ctx.setLineDash([]);

    // Present divider line
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.75)' : 'rgba(15,23,42,0.7)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(dividerX, padT);
    ctx.lineTo(dividerX, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Terminal quantile badges drawn cleanly in the right-hand gutter (outside candlestick area)
    const lastPt = pts[pts.length - 1];
    const gutterX = w - padR + 6;
    const drawGutterBadge = (labelTxt, yPos, fgCol, bgCol) => {
      ctx.save();
      ctx.font = '700 10px "JetBrains Mono", monospace';
      const tw = ctx.measureText(labelTxt).width;
      const bw = Math.min(padR - 10, tw + 10);
      const bh = 15;
      ctx.fillStyle = bgCol;
      ctx.fillRect(gutterX, yPos - 10, bw, bh);
      ctx.fillStyle = fgCol;
      ctx.textAlign = 'left';
      ctx.fillText(labelTxt, gutterX + 5, yPos + 1);
      ctx.restore();
    };
    drawGutterBadge(
      `q90 ${PriceFormatter.formatPrice(lastPt.q90, decimals)}`,
      q90Y,
      useCoord ? '#C084FC' : '#0284C7',
      isDark ? 'rgba(56, 189, 248, 0.14)' : 'rgba(2, 132, 199, 0.11)'
    );
    drawGutterBadge(
      `q50 ${PriceFormatter.formatPrice(lastPt.q50, decimals)}`,
      q50Y,
      useCoord ? '#9333EA' : '#D97706',
      isDark ? 'rgba(245, 158, 11, 0.18)' : 'rgba(245, 158, 11, 0.14)'
    );
    drawGutterBadge(
      `q10 ${PriceFormatter.formatPrice(lastPt.q10, decimals)}`,
      q10Y,
      useCoord ? '#C084FC' : '#0284C7',
      isDark ? 'rgba(56, 189, 248, 0.14)' : 'rgba(2, 132, 199, 0.11)'
    );
  }
}

export function renderForecastStudioView(activeTab, i18n) {
  const isFa = i18n.getCurrentLanguage() === 'fa';
  const watchlist = state.symbols.filter((s) => s.inWatchlist);
  const activeCode = activeTab ? activeTab.symbolCode : watchlist[0]?.symbolCode || 'SPOTBRENT';
  const decimals = activeTab ? Number(activeTab.decimals || 2) : 2;
  const subTab = state.forecastStudioTab || 'overview';
  const coordView = state.forecastCoordView === 'coordinated' ? 'coordinated' : 'independent';
  const horizonBars = clampHorizonBars(
    (activeTab && activeTab.forecastHorizonBars) || state.chartPreferences.forecastHorizonBars || 30
  );
  const renderMode = normalizeRenderMode(
    (activeTab && activeTab.forecastRenderMode) || state.chartPreferences.forecastRenderMode || RENDER_MODES.FAN_CHART
  );

  const built = buildForecastForTab(activeTab);
  const fc = built ? built.result : null;
  state._lastForecastResult = fc;
  if (activeTab) {
    activeTab.legacyForecast = fc;
    const last = Array.isArray(activeTab.candles) && activeTab.candles.length ? activeTab.candles[activeTab.candles.length - 1] : null;
    activeTab.legacyForecastMeta = {
      symbolCode: String(activeTab.symbolCode || '').toUpperCase(),
      provider: String(activeTab.provider || 'tvdatafeed').toLowerCase(),
      timeframe: String(activeTab.timeframe || 'M15').toUpperCase(),
      lastCandleOpenMs: Number(last?.open_time_utc_ms || 0),
      lastCandleClose: Number(last?.close || 0),
    };
  }
  const horizons = [10, 15, 20, 30, 45, 60];
  const horizonButtons = horizons
    .map(
      (h) =>
        `<button type="button" class="chip ltr-num ${horizonBars === h ? 'active' : ''}" data-action="set-forecast-horizon" data-horizon="${h}">+${h}</button>`
    )
    .join('');

  const modes = [
    { id: RENDER_MODES.FAN_CHART, label: isFa ? 'ابری کوانتایل (Fan)' : 'Quantile Fan' },
    { id: RENDER_MODES.HYBRID, label: isFa ? 'ترکیبی (Fan + Bars)' : 'Hybrid (Fan + Bars)' },
    { id: RENDER_MODES.GHOST_CANDLES, label: isFa ? 'میله‌های کوانتایل' : 'Quantile Bars' },
  ];
  const modeButtons = modes
    .map(
      (m) =>
        `<button type="button" class="chip ${renderMode === m.id ? 'active' : ''}" data-action="set-forecast-render-mode" data-mode="${m.id}">${m.label}</button>`
    )
    .join('');

  const fcStatus = fc?.status || FORECAST_STATUS.DATA_NOT_READY;
  const statusBadgeClass =
    fcStatus === FORECAST_STATUS.VALID
      ? 'ci-fc-badge-valid'
      : fcStatus === FORECAST_STATUS.PROVISIONAL
        ? 'ci-fc-badge-provisional'
        : 'ci-fc-badge-blocked';

  const statusLabelMap = {
    [FORECAST_STATUS.VALID]: isFa ? 'تأییدشده (VALID)' : 'VALID',
    [FORECAST_STATUS.PROVISIONAL]: isFa ? 'موقت / OOD (PROVISIONAL)' : 'PROVISIONAL',
    [FORECAST_STATUS.NO_EDGE]: isFa ? 'بدون برتری آماری (NO_EDGE)' : 'NO_EDGE',
    [FORECAST_STATUS.INSUFFICIENT_EVIDENCE]: isFa ? 'شواهد آماری ناکافی (INSUFFICIENT_EVIDENCE)' : 'INSUFFICIENT_EVIDENCE',
    [FORECAST_STATUS.DATA_NOT_READY]: isFa ? 'داده آماده نیست (DATA_NOT_READY)' : 'DATA_NOT_READY',
  };
  const statusLabel = statusLabelMap[fcStatus] || fcStatus;

  const edgeGate = fc?.noEdgeGate;
  const edgeBadge = edgeGate
    ? `<span class="ci-fc-status-badge ${edgeGate.hasEdge ? 'ci-fc-badge-edge' : 'ci-fc-badge-no-edge'} ltr-num">${escapeHtml(edgeGate.gateState)}</span>`
    : '';

  const unc = fc?.uncertainty;
  const oodBadge = unc
    ? `<span class="ci-fc-status-badge ${
        unc.oodStatus === OOD_STATUS.EXTREME
          ? 'ci-fc-badge-ood-extreme'
          : unc.oodStatus === OOD_STATUS.ELEVATED
            ? 'ci-fc-badge-provisional'
            : 'ci-fc-badge-valid'
      } ltr-num">OOD: ${escapeHtml(unc.oodStatus)}</span>`
    : '';

  const tabsNav = [
    { id: 'overview', label: isFa ? 'پیش‌بینی و سناریوها (V2.1)' : 'Projection & Event Tree' },
    { id: 'models', label: isFa ? 'مدل‌های پلاگینی' : 'Plugin Models' },
    { id: 'backtest', label: isFa ? 'Walk-Forward و کالیبراسیون' : 'Walk-Forward & Calibration' },
    { id: 'ledger', label: isFa ? 'دفتر کل SHA-256 و چرخه عمر' : 'SHA-256 Ledger & Lifecycle' },
  ]
    .map(
      (t) =>
        `<button type="button" class="ci-fc-subtab ${subTab === t.id ? 'active' : ''}" data-action="set-forecast-subtab" data-tab="${t.id}">${t.label}</button>`
    )
    .join('');

  let panelHtml = '';
  if (subTab === 'overview') {
    panelHtml = renderOverviewPanel(fc, activeTab, decimals, isFa, coordView);
  } else if (subTab === 'models') {
    panelHtml = renderModelsPanel(fc, decimals, isFa, { includeRemoteWorker: false });
  } else if (subTab === 'backtest') {
    panelHtml = renderBacktestPanel(fc, decimals, isFa);
  } else {
    panelHtml = renderLedgerPanel(decimals, isFa);
  }

  const requestedModelId = String(
    (activeTab && activeTab.selectedForecastModelId) || state.chartPreferences.selectedForecastModelId || 'AUTO'
  );
  const modelChoices = [
    { id: 'AUTO', label: isFa ? 'خودکار (بر اساس ارزیابی OOS)' : 'Auto (OOS evaluated)' },
    ...defaultForecastRegistry.list().map((model) => ({
      id: model.id,
      label: `${model.name}${model.experimentalOnly ? (isFa ? ' (تقریبی)' : ' (Approximation)') : ''}`,
    })),
  ];
  // Ensemble is an engine-level aggregation option, not a registry plugin.
  modelChoices.push({ id: 'empirical_analogs', label: isFa ? 'آنالوگ‌های تاریخی علّی' : 'Causal Historical Analogs' });
  modelChoices.push({ id: 'ensemble', label: 'Ensemble (V2)' });
  const modelButtons = modelChoices
    .map(
      (m) =>
        `<button type="button" class="chip ${requestedModelId === m.id ? 'active' : ''}" data-action="set-forecast-model" data-model-id="${escapeHtml(m.id)}">${escapeHtml(m.label)}</button>`
    )
    .join('');

  return `
    <section class="ci-forecast-studio">
      <div class="ci-fc-header">
        <div class="ci-fc-title-row">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;max-width:100%;">
            ${renderSymbolBadge(activeCode, 28)}
            <span class="ltr-num" style="font-weight:800;font-size:14px;color:var(--text-strong);">${escapeHtml(activeCode)}</span>
            <span class="ci-fc-status-badge ${statusBadgeClass} ltr-num">${statusLabel}</span>
            ${edgeBadge}
            ${oodBadge}
            ${fc && fc.regime ? `<span class="ci-fc-regime-badge ltr-num">${escapeHtml(fc.regime)}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;max-width:100%;">
            <button type="button" class="btn btn-sm" data-action="record-forecast-snapshot">
              ${isFa ? 'ثبت در دفتر محلی' : 'Record Local Snapshot'}
            </button>
            <button type="button" class="btn btn-sm ${activeTab?.showFutureProjection ? 'btn-primary' : ''}" data-action="apply-native-forecast-to-chart" ${!Array.isArray(fc?.points) || fc.points.length === 0 ? 'disabled' : ''}>
              ${activeTab?.showStructuralForecast && activeTab?.structuralForecast?.engine?.engine_id === 'native_model_adapter' ? (isFa ? '✓ مدل جدید روی چارت فعال است' : '✓ Native Model on Chart') : (isFa ? 'نمایش مدل انتخاب‌شده روی چارت' : 'Show Selected Model on Chart')}
            </button>
          </div>
        </div>

        <div class="ci-fc-controls-row">
          <div class="ci-fc-control-group ci-fc-control-group-full">
            <span class="ci-fc-ctrl-label">${isFa ? 'مدل پیش‌بینی چارت:' : 'Chart Model:'}</span>
            <div class="chip-group">${modelButtons}</div>
          </div>
          <div class="ci-fc-control-group">
            <span class="ci-fc-ctrl-label">${isFa ? 'افق پیش‌بینی (کندل):' : 'Horizon (bars):'}</span>
            <div class="chip-group">${horizonButtons}</div>
          </div>
          <div class="ci-fc-control-group">
            <span class="ci-fc-ctrl-label">${isFa ? 'حالت نمایش:' : 'Render Mode:'}</span>
            <div class="chip-group">${modeButtons}</div>
          </div>
          <div class="ci-fc-control-group">
            <span class="ci-fc-ctrl-label">${isFa ? 'لایه MTF:' : 'MTF Layer:'}</span>
            <div class="chip-group">
              <button type="button" class="chip ${coordView === 'independent' ? 'active' : ''}" data-action="set-forecast-coord-mode" data-coord="independent">${isFa ? 'مستقل (Independent)' : 'Independent'}</button>
              <button type="button" class="chip ${coordView === 'coordinated' ? 'active' : ''}" data-action="set-forecast-coord-mode" data-coord="coordinated">${isFa ? 'هماهنگ (Coordinated)' : 'Coordinated'}</button>
            </div>
          </div>
        </div>

        <div class="ci-fc-subtabs-bar">
          ${tabsNav}
        </div>
      </div>

      <div class="ci-fc-body">
        ${panelHtml}
      </div>
    </section>
  `;
}

export function renderOverviewPanel(fc, activeTab, decimals, isFa, coordView) {
  if (!fc || fc.status === FORECAST_STATUS.DATA_NOT_READY) {
    const reqBars = fc?.readiness?.nOpMin || 155;
    const reasons = (fc?.readiness?.issues || []).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
    return `
      <div class="ci-fc-card" style="text-align:center;padding:32px;">
        <h3 style="margin:0 0 8px 0;color:var(--bear);">${isFa ? 'دروازه آماده بودن داده: DATA_NOT_READY' : 'Data Readiness Gate: DATA_NOT_READY'}</h3>
        <p style="margin:0 0 12px 0;color:var(--text-muted);font-size:13px;">
          ${isFa ? `برای اجرای Nested Walk-Forward حداقل ${reqBars} کندل معتبر و تمیز لازم است.` : `At least ${reqBars} clean closed OHLC bars (and full statistical sample for VALID) are required without corruption or unclosed bars.`}
        </p>
        <ul style="list-style:none;padding:0;margin:0;color:var(--text-muted);font-size:12px;" class="ltr-num">${reasons}</ul>
      </div>
    `;
  }

  const mtf = fc.mtfCoordination;
  const activePts =
    coordView === 'coordinated' && mtf?.coordinatedPoints?.length
      ? mtf.coordinatedPoints
      : fc.points || [];
  const stepMarks = [5, 10, 15, 20, 25, 30, 45, 60].filter((m) => m <= fc.horizonBars);
  const ladderCards = stepMarks
    .map((step) => {
      const p = activePts[step - 1];
      if (!p) return '';
      const pct = Number(p.pctChangeFromLast || 0);
      const col = pct >= 0 ? 'var(--bull)' : 'var(--bear)';
      return `
        <div class="ci-fc-mini-stat ltr-num">
          <div style="font-size:10.5px;font-weight:700;color:var(--gold);">+${step}</div>
          <strong style="font-size:12.5px;">${PriceFormatter.formatPrice(p.q50, decimals)}</strong>
          <div style="font-size:10px;color:var(--text-muted);">[${PriceFormatter.formatPrice(p.q10, decimals)} .. ${PriceFormatter.formatPrice(p.q90, decimals)}]</div>
          <span style="font-size:10.5px;color:${col};font-weight:700;">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>
        </div>
      `;
    })
    .join('');

  const unc = fc.uncertainty;
  const uncertaintyCardHtml = unc
    ? `
      <div class="ci-fc-card" style="margin-bottom:12px;">
        <div class="row-between" style="flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          <strong style="font-size:13px;">${isFa ? 'تفکیک عدم‌قطعیت (Aleatoric در برابر Epistemic) و تشخیص OOD' : 'Uncertainty Decomposition (Aleatoric vs Epistemic) & OOD Gate'}</strong>
          <span class="ci-fc-family-tag ltr-num">OOD Distance ${unc.oodDistance} · Spread ×${unc.spreadMultiplierApplied}</span>
        </div>
        <div class="ci-fc-meter-track" title="Aleatoric ${(unc.aleatoricShare * 100).toFixed(1)}% vs Epistemic ${(unc.epistemicShare * 100).toFixed(1)}%">
          <div class="ci-fc-meter-aleatoric" style="width:${Math.round(unc.aleatoricShare * 100)}%;"></div>
          <div class="ci-fc-meter-epistemic" style="width:${Math.round(unc.epistemicShare * 100)}%;"></div>
        </div>
        <div class="row-between ltr-num" style="font-size:11.5px;margin-top:8px;flex-wrap:wrap;gap:8px;">
          <span>Aleatoric (Market σ): <strong>${unc.aleatoricPct.toFixed(2)}%</strong> (${(unc.aleatoricShare * 100).toFixed(1)}%)</span>
          <span>Epistemic (Model/Sparsity/OOD): <strong>${unc.epistemicPct.toFixed(2)}%</strong> (${(unc.epistemicShare * 100).toFixed(1)}%)</span>
          <span>Total Horizon σ: <strong>${unc.totalPct.toFixed(2)}%</strong></span>
        </div>
        ${
          unc.oodReasons?.length
            ? `<div style="margin-top:6px;font-size:11px;color:var(--gold);" class="ltr-num">${unc.oodReasons.map(escapeHtml).join(' · ')}</div>`
            : ''
        }
      </div>
    `
    : '';

  const mtfBannerHtml = mtf
    ? `
      <div class="ci-fc-card" style="margin-bottom:12px;">
        <div class="row-between" style="flex-wrap:wrap;gap:8px;">
          <div>
            <strong style="font-size:12.5px;">${isFa ? 'هماهنگ‌سازی چندتایم‌فریمی (Independent vs Coordinated)' : 'Multi-Timeframe Coordination Check'}</strong>
            <div style="font-size:11px;color:var(--text-muted);" class="ltr-num">
              Higher TF: ${escapeHtml(mtf.referenceTimeframe)} · OHLC Consistent: ${mtf.ohlcConsistent ? 'YES' : 'NO'} · Independent q50: ${mtf.independentMedianPct >= 0 ? '+' : ''}${mtf.independentMedianPct}% vs Coordinated q50: ${mtf.coordinatedMedianPct >= 0 ? '+' : ''}${mtf.coordinatedMedianPct}%
            </div>
          </div>
          <span class="ci-fc-status-badge ${mtf.alignmentState === 'ALIGNED' ? 'ci-fc-badge-valid' : mtf.alignmentState === 'STRUCTURAL_CONFLICT' ? 'ci-fc-badge-blocked' : 'ci-fc-badge-provisional'} ltr-num">
            ${escapeHtml(mtf.alignmentState)}
          </span>
        </div>
        ${
          mtf.conflictReasons?.length
            ? `<div style="margin-top:6px;font-size:11px;color:var(--text-muted);" class="ltr-num">${mtf.conflictReasons.map(escapeHtml).join(' · ')}</div>`
            : ''
        }
      </div>
    `
    : '';

  const edgeGate = fc.noEdgeGate;
  const edgeBannerHtml =
    edgeGate && !edgeGate.hasEdge
      ? `<div class="ci-fc-warning-banner ltr-num">⊘ NO_EDGE_DETECTED (${escapeHtml(edgeGate.gateState)}): ${edgeGate.reasons.map(escapeHtml).join(' | ')}</div>`
      : '';

  const conformalCal = fc.conformalCalibration;
  const conformalBannerHtml = conformalCal
    ? `
      <div class="ci-fc-card" style="margin-bottom:12px;">
        <div class="row-between" style="flex-wrap:wrap;gap:8px;margin-bottom:6px;">
          <strong style="font-size:13px;">${isFa ? 'کالیبراسیون هم‌دیس نرمال‌شده با نوسان (Split Conformal)' : 'Volatility-Normalized Conformal Calibration'}</strong>
          <span class="ci-fc-status-badge ${conformalCal.calibrationStatus === 'CALIBRATED_NORMALIZED' ? 'ci-fc-badge-valid' : 'ci-fc-badge-provisional'} ltr-num">
            ${escapeHtml(conformalCal.calibrationStatus)}
          </span>
        </div>
        <div class="ci-fc-ladder-grid ltr-num">
          <div class="ci-fc-mini-stat"><span>M_cal Windows</span><strong>${conformalCal.calibrationWindows ?? 0}</strong></div>
          <div class="ci-fc-mini-stat"><span>γ Level</span><strong>${conformalCal.gammaLevel != null ? Number(conformalCal.gammaLevel).toFixed(3) : '—'}</strong></div>
          <div class="ci-fc-mini-stat"><span>q80 Scale</span><strong>${Number(conformalCal.normalizedScaleQ80 ?? 0).toFixed(3)}</strong></div>
          <div class="ci-fc-mini-stat"><span>Decay λ</span><strong>${Number(conformalCal.decayLambda ?? 0.92).toFixed(2)}</strong></div>
        </div>
      </div>
    `
    : '';

  const repPaths = Array.isArray(fc.representativePaths) ? fc.representativePaths : [];
  const representativePathsHtml = repPaths.length > 0
    ? `
      <div class="ci-fc-card" style="margin-bottom:12px;">
        <div class="row-between" style="margin-bottom:8px;flex-wrap:wrap;gap:8px;">
          <strong style="font-size:13px;">${isFa ? 'مسیرهای نمونه آنالوگ تاریخی (فقط نمایشی — فاقد احتمال)' : 'Illustrative Empirical Analog Medoids (Not Probabilities)'}</strong>
          <span class="ci-fc-family-tag ltr-num">Causal Analogs: ${fc.analogDiagnostics?.matchedCount ?? 0} · Embargo +${fc.analogDiagnostics?.embargoGap ?? 0}b</span>
        </div>
        <div class="ci-fc-grid-3">
          ${repPaths
            .map((rp) => {
              const firstClose = rp.closes?.[0] ?? fc.anchorClose;
              const lastCloseRp = rp.closes?.[rp.closes.length - 1] ?? fc.anchorClose;
              const diffPct = firstClose > 0 ? ((lastCloseRp - fc.anchorClose) / fc.anchorClose) * 100 : 0;
              return `
                <div class="ci-fc-mini-stat ltr-num">
                  <div style="font-size:11px;font-weight:700;color:var(--text-strong);">${escapeHtml(rp.id)}</div>
                  <div style="font-size:10px;color:var(--text-muted);">${escapeHtml(rp.label)}</div>
                  <strong style="font-size:12.5px;">${PriceFormatter.formatPrice(lastCloseRp, decimals)}</strong>
                  <span style="font-size:10.5px;color:${diffPct >= 0 ? 'var(--bull)' : 'var(--bear)'};">${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}% (Illustrative Only)</span>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `
    : '';

  const scenariosHtml = (fc.scenarios || [])
    .map((sc) => {
      const isEstimable = sc.status === SCENARIO_STATUS.ESTIMABLE && sc.probability !== null && sc.probability !== undefined;
      const borderCol =
        sc.bias === 'bull'
          ? 'rgba(38,166,154,0.45)'
          : sc.bias === 'bear'
            ? 'rgba(239,83,80,0.45)'
            : 'rgba(245,158,11,0.45)';
      const accentCol = sc.bias === 'bull' ? 'var(--bull)' : sc.bias === 'bear' ? 'var(--bear)' : 'var(--gold)';
      const badgeHtml = isEstimable
        ? `<span class="ci-fc-prob-pill ltr-num">${(Number(sc.probability) * 100).toFixed(1)}%</span>`
        : `<span class="ci-fc-low-sample-tag ltr-num">NOT_ESTIMABLE</span>`;
      return `
        <div class="ci-fc-card ci-fc-scenario-card" style="border-color:${borderCol};">
          <div class="row-between" style="margin-bottom:6px;gap:8px;align-items:flex-start;">
            <strong style="color:${accentCol};font-size:12.5px;line-height:1.35;">${escapeHtml(sc.label)}</strong>
            ${badgeHtml}
          </div>
          <div style="margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap;" class="ltr-num">
            <span class="ci-fc-family-tag">Empirical: ${(Number(sc.rawEmpiricalFrequency ?? 0) * 100).toFixed(1)}% (n=${sc.sampleCount ?? 0})</span>
            ${!isEstimable ? `<span class="ci-fc-low-sample-tag">n &lt; 3 (No Dirichlet Floor)</span>` : ''}
          </div>
          <div class="ltr-num" style="font-size:11.5px;display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">
            <div class="row-between"><span style="color:var(--text-muted);">${isFa ? 'مرجع میانی (Target)' : 'Statistical Target'}</span><strong>${PriceFormatter.formatPrice(sc.targetPrice, decimals)}</strong></div>
            <div class="row-between"><span style="color:var(--text-muted);">${isFa ? 'مرز کوانتایل بیرونی' : 'Outer Quantile Bound'}</span><strong>${PriceFormatter.formatPrice(sc.extremePrice, decimals)}</strong></div>
            <div class="row-between"><span style="color:var(--text-muted);">${isFa ? 'مرجع تغییر ساختار' : 'Structure Pivot Ref'}</span><strong>${PriceFormatter.formatPrice(sc.invalidationReference, decimals)}</strong></div>
          </div>
          <div class="ci-fc-condition-box ltr-num" style="flex:1;margin-bottom:10px;">
            <div><span style="color:var(--text-muted);">Trigger:</span> ${escapeHtml(sc.entryCondition || '-')}</div>
            <div><span style="color:var(--text-muted);">Event:</span> ${escapeHtml(sc.intermediateEvent || '-')}</div>
            <div><span style="color:var(--text-muted);">Invalidation:</span> ${escapeHtml(sc.invalidationCondition || '-')}</div>
          </div>
          <button
            type="button"
            class="btn btn-sm"
            style="width:100%;margin-top:auto;"
            data-action="project-scenario-levels"
            data-bias="${escapeHtml(sc.bias)}"
            data-entry="${fc.anchorClose}"
            data-t1="${sc.targetPrice}"
            data-t2="${sc.extremePrice}"
            data-stop="${sc.invalidationReference}"
          >
            ${isFa ? 'رسم سطوح آماری روی چارت' : 'Plot Reference Bands on Chart'}
          </button>
        </div>
      `;
    })
    .join('');

  const keyZonesHtml = (fc.keyZones || [])
    .map(
      (z) => `
      <div class="ci-fc-card">
        <div class="row-between" style="margin-bottom:6px;">
          <strong style="font-size:12.5px;color:${z.zoneType === 'RESISTANCE_ZONE' ? 'var(--bear)' : 'var(--bull)'};">${escapeHtml(z.zoneType)} (${escapeHtml(z.zoneId)})</strong>
          <span class="ci-fc-family-tag ltr-num">Strength ${(z.strength * 100).toFixed(0)}%</span>
        </div>
        <div class="ltr-num" style="font-size:11.5px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;">
          <div>Bounds: <strong>[${PriceFormatter.formatPrice(z.lowPrice, decimals)} .. ${PriceFormatter.formatPrice(z.highPrice, decimals)}]</strong></div>
          <div>Pivot Ref: <strong>${PriceFormatter.formatPrice(z.invalidationPrice, decimals)}</strong></div>
          <div>Touch Prob: <strong>${(z.touchProbability * 100).toFixed(1)}%</strong></div>
          <div>Penetration Prob: <strong>${(z.penetrationProbability * 100).toFixed(1)}%</strong></div>
          <div>Reclaim Prob: <strong>${(z.reclaimProbability * 100).toFixed(1)}%</strong></div>
          <div>Breakout Prob: <strong>${(z.confirmedBreakoutProbability * 100).toFixed(1)}%</strong></div>
          <div style="color:var(--bull);">Reach Before Inv: <strong>${(z.reachBeforeInvalidationProb * 100).toFixed(1)}%</strong></div>
          <div style="color:var(--bear);">Invalidation First: <strong>${(z.invalidationBeforeReachProb * 100).toFixed(1)}%</strong></div>
          <div style="grid-column:span 2;color:var(--text-muted);">Censoring-Aware Expected Bars: <strong>+${z.expectedBarsToReachCensored}</strong> (horizon ${z.horizonBars})</div>
        </div>
      </div>
    `
    )
    .join('');

  const isNoWinner = fc.selectionMode === SELECTION_MODE.NO_CLEAR_WINNER_BASELINE;
  const winnerBannerHtml = `
    <div class="ci-fc-card" style="margin-bottom:12px;border-color:${isNoWinner ? 'rgba(245,158,11,0.55)' : 'rgba(56,189,248,0.45)'};">
      <div class="row-between" style="flex-wrap:wrap;gap:8px;">
        <div>
          <strong style="font-size:13px;">${isFa ? 'دروازه انتخاب مدل بر اساس ارزیابی Out-of-Sample (OOS Winner Gate)' : 'Out-of-Sample Model Selection Gate'}</strong>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:3px;" class="ltr-num">
            ${escapeHtml(fc.selectionReason || '')}
          </div>
        </div>
        <span class="ci-fc-status-badge ${isNoWinner ? 'ci-fc-badge-provisional' : 'ci-fc-badge-valid'} ltr-num">
          ${escapeHtml(fc.selectedChartModelId || 'naive_persistence')} · ${escapeHtml(fc.selectionMode || '')}
        </span>
      </div>
    </div>
  `;

  const comparisonChipsHtml = Array.isArray(fc.modelTrajectories) && fc.modelTrajectories.length > 0
    ? `
      <div class="ci-fc-card" style="margin-bottom:12px;">
        <div class="row-between" style="margin-bottom:8px;flex-wrap:wrap;gap:6px;">
          <strong style="font-size:12.5px;">${isFa ? 'مقایسه زنده مسیر مدل‌ها روی چارت (مستقل و بدون Fallback جعلی)' : 'Model Trajectory Comparison (Honest Status & Runtime Badge)'}</strong>
          <span class="ci-fc-family-tag ltr-num">${fc.modelTrajectories.filter((t) => t.status === MODEL_EXECUTION_STATUS.SUCCESS).length}/${fc.modelTrajectories.length} Active</span>
        </div>
        <div class="ci-fc-models-comparison-grid ltr-num">
          ${fc.modelTrajectories
            .map((t) => {
              const col = MODEL_OVERLAY_COLORS[t.modelId] || 'var(--accent)';
              const lastP = t.points?.[t.points.length - 1];
              const isSelected = t.modelId === fc.selectedChartModelId;
              const statusTxt =
                t.status === MODEL_EXECUTION_STATUS.SUCCESS && lastP
                  ? `${PriceFormatter.formatPrice(lastP.q50, decimals)} (${lastP.pctChangeFromLast >= 0 ? '+' : ''}${Number(lastP.pctChangeFromLast || 0).toFixed(2)}%)`
                  : `${t.status}: ${t.reason || ''}`;
              return `
                <div class="ci-fc-mini-stat ci-fc-model-card" style="border-color:${isSelected ? col : 'var(--border)'};${isSelected ? 'box-shadow:0 0 0 1px ' + col + ';' : ''}">
                  <div class="ci-fc-model-card-head">
                    <span class="ci-fc-model-card-title" style="color:${col};">${escapeHtml(t.modelName)}</span>
                    ${t.isApproximation ? '<span class="ci-fc-family-tag ci-fc-approx-tag">APPROX</span>' : ''}
                  </div>
                  <strong style="font-size:11.5px;color:${t.status === MODEL_EXECUTION_STATUS.SUCCESS ? 'var(--text-strong)' : 'var(--bear)'};">${escapeHtml(statusTxt)}</strong>
                  <div style="font-size:9.5px;color:var(--text-muted);">${escapeHtml(t.executionRuntime || 'NATIVE_JS')} · ${t.isCalibratedInterval ? 'Calibrated' : 'Uncalibrated'}</div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `
    : '';

  const visibleComparisonTrajectories = (fc.modelTrajectories || []).filter((trajectory) =>
    trajectory.status === MODEL_EXECUTION_STATUS.SUCCESS &&
    Array.isArray(trajectory.points) &&
    trajectory.points.length > 0 &&
    trajectory.modelId !== fc.selectedChartModelId &&
    (!Array.isArray(fc.visibleComparisonModelIds) || fc.visibleComparisonModelIds.includes(trajectory.modelId))
  );
  const comparisonCanvasesHtml = visibleComparisonTrajectories.length
    ? `
      <div class="ci-fc-card" style="margin-bottom:12px;">
        <div class="row-between" style="margin-bottom:8px;gap:8px;flex-wrap:wrap;">
          <strong style="font-size:13px;">${isFa ? 'مقایسه تصویری کنارهم مدل‌های انتخاب‌شده' : 'Side-by-side selected model paths'}</strong>
          <span class="ci-fc-family-tag ltr-num">${visibleComparisonTrajectories.length} ${isFa ? 'مسیر' : 'paths'}</span>
        </div>
        <div class="ci-fc-grid-2">
          ${visibleComparisonTrajectories.map((trajectory) => `
            <div class="ci-fc-mini-stat" style="min-width:0;padding:8px;">
              <div class="row-between" style="gap:6px;margin-bottom:6px;">
                <strong style="font-size:11px;">${escapeHtml(trajectory.modelName || trajectory.modelId)}</strong>
                <span class="ci-fc-family-tag ltr-num">${trajectory.isApproximation ? 'APPROX' : escapeHtml(trajectory.executionRuntime || 'NATIVE_JS')}</span>
              </div>
              <canvas class="ci-fc-preview-canvas" data-forecast-compare-model="${escapeHtml(trajectory.modelId)}" style="height:170px;width:100%;"></canvas>
            </div>
          `).join('')}
        </div>
      </div>
    `
    : '';

  return `
    <div class="ci-fc-canvas-wrap ci-fc-card">
      <div class="row-between" style="margin-bottom:8px;flex-wrap:wrap;gap:8px;">
        <div>
          <strong style="font-size:13.5px;">${isFa ? 'مخروط عدم‌قطعیت کالیبره‌شده (q10..q90) و مقایسه مدل‌ها' : 'Calibrated Quantile Fan (q10..q90), Key Zones & Multi-Model Overlay'}</strong>
          <div style="font-size:11px;color:var(--text-muted);" class="ltr-num">
            ${escapeHtml(fc.contractVersion)} · spec v${escapeHtml(fc.specVersion || '2.1.0')} · Active: ${escapeHtml(fc.selectedChartModelId || 'AUTO')} · Anchor ${PriceFormatter.formatPrice(fc.anchorClose, decimals)} · EWMA σ ${fc.featuresSummary.ewmaSigmaPct.toFixed(3)}% · Layer: ${coordView.toUpperCase()}
          </div>
        </div>
        <span style="font-size:11px;color:var(--text-muted);" class="ltr-num">
          ${isFa ? 'پهنای کریدور پایانی:' : 'Terminal Corridor:'} ${fc.summary.corridorWidthPct.toFixed(2)}%
        </span>
      </div>
      <canvas id="forecast-studio-canvas" class="ci-fc-preview-canvas"></canvas>
    </div>

    ${winnerBannerHtml}
    ${conformalBannerHtml}
    ${comparisonChipsHtml}
    ${comparisonCanvasesHtml}
    ${representativePathsHtml}
    ${edgeBannerHtml}
    ${uncertaintyCardHtml}
    ${mtfBannerHtml}

    <div class="ci-fc-card" style="margin-bottom:12px;">
      <div class="row-between" style="margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <strong style="font-size:13px;">${isFa ? 'سناریوهای شرطی کالیبره‌شده V2.1 (بدون کف ساختگی دیریکله)' : '3-Scenario Conditional Logit Event Tree (Zero Synthetic Priors)'}</strong>
        <span class="ci-fc-family-tag ltr-num">Brier OOS: ${fc.scenarioCalibration?.oosBrierModel ?? '—'} vs Clim ${fc.scenarioCalibration?.oosBrierClimatology ?? '—'}</span>
      </div>
      <div class="ci-fc-event-tree-grid">${scenariosHtml}</div>
    </div>

    ${keyZonesHtml ? `<div class="ci-fc-grid-2" style="margin-bottom:12px;">${keyZonesHtml}</div>` : ''}

    <div class="ci-fc-card">
      <div style="font-size:12.5px;font-weight:700;margin-bottom:8px;">${isFa ? 'نردبان افق پیش‌بینی (میانه q50 و بازه ۸۰٪)' : 'Horizon Step Quantile Ladder (Median q50 & 80% Corridor)'}</div>
      <div class="ci-fc-ladder-grid">${ladderCards}</div>
    </div>
  `;
}

export function renderModelsPanel(fc, decimals, isFa, options = {}) {
  const plugins = defaultForecastRegistry.list();
  const contribMap = new Map((fc?.modelContributions || []).map((c) => [c.modelId, c]));

  const cards = plugins
    .map((p) => {
      const c = contribMap.get(p.id);
      const paramRows = Object.entries(p.params || {})
        .map(
          ([k, v]) => `
            <label class="ci-fc-param-item ltr-num">
              <span>${escapeHtml(k)}</span>
              <input type="number" step="0.01" class="input-field ci-fc-param-input" data-action="set-forecast-model-param" data-model-id="${escapeHtml(p.id)}" data-param-key="${escapeHtml(k)}" value="${Number(v)}" />
            </label>
          `
        )
        .join('');

      return `
        <div class="ci-fc-card ${p.enabled ? '' : 'is-disabled'}">
          <div class="row-between" style="margin-bottom:6px;gap:8px;">
            <div>
              <strong style="font-size:13px;">${escapeHtml(p.name)}</strong>
              <span class="ci-fc-family-tag ltr-num">${escapeHtml(p.family)}</span>
            </div>
            <label class="ci-fc-toggle ltr-num">
              <input type="checkbox" data-action="toggle-forecast-model" data-model-id="${escapeHtml(p.id)}" ${p.enabled ? 'checked' : ''} />
              <span>${p.enabled ? (isFa ? 'فعال' : 'Enabled') : isFa ? 'خاموش' : 'Off'}</span>
            </label>
          </div>
          <p style="font-size:11.5px;color:var(--text-muted);margin:0 0 10px 0;">${escapeHtml(p.description)}</p>
          <div class="row-between ltr-num" style="font-size:11.5px;margin-bottom:6px;">
            <span>Weight: ${(p.weight * 100).toFixed(0)}%</span>
            ${
              c
                ? `<span style="color:${c.terminalPctChange >= 0 ? 'var(--bull)' : 'var(--bear)'};">→ ${PriceFormatter.formatPrice(c.terminalPrice, decimals)} (${c.terminalPctChange >= 0 ? '+' : ''}${c.terminalPctChange.toFixed(2)}%)</span>`
                : '<span style="color:var(--text-muted);">Inactive</span>'
            }
          </div>
          <input type="range" min="0" max="1" step="0.02" value="${p.weight}" data-action="set-forecast-model-weight" data-model-id="${escapeHtml(p.id)}" style="width:100%;margin-bottom:8px;" />
          <div class="ci-fc-params-grid">${paramRows}</div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="row-between" style="margin-bottom:10px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:12.5px;color:var(--text-muted);">
        ${isFa ? 'موتور پلاگینی مستقل بر پایه بازده لگاریتمی — قابل توسعه با مدل‌های جدید بدون تغییر در چارت یا UI.' : 'Modular log-return plugin architecture — tune weights/hyperparameters independently or reset defaults.'}
      </div>
      <button type="button" class="btn btn-sm" data-action="reset-forecast-models">${isFa ? 'بازگردانی وزن‌های پیش‌فرض' : 'Reset Default Weights'}</button>
    </div>

    <div class="ci-fc-grid-2">${cards}</div>


  `;
}

export function runHistoricalForecastReplay(activeTab, options = {}) {
  if (!activeTab) return { status: 'DATA_NOT_READY', reason: 'No active chart tab', windows: [] };
  const sourceCandles = Array.isArray(activeTab.candles) && activeTab.candles.length
    ? activeTab.candles
    : getCachedOrAggregatedCandles(activeTab.symbolCode, activeTab.provider, activeTab.timeframe);
  const candles = sourceCandles.filter((c) =>
    Number.isFinite(Number(c.open)) &&
    Number.isFinite(Number(c.high)) &&
    Number.isFinite(Number(c.low)) &&
    Number.isFinite(Number(c.close)) &&
    Number(c.close) > 0
  ).slice().sort((a, b) => Number(a.open_time_utc_ms || a.openTimeUtcMs || 0) - Number(b.open_time_utc_ms || b.openTimeUtcMs || 0));
  const horizonBars = clampHorizonBars(options.horizonBars || activeTab.forecastHorizonBars || state.chartPreferences.forecastHorizonBars || 30);
  const selectedModelId = String(options.selectedModelId || activeTab.selectedForecastModelId || state.chartPreferences.selectedForecastModelId || 'AUTO');
  const maxWindows = Math.max(2, Math.min(4, Number(options.maxWindows || 3)));
  const windows = [];
  const lastAnchor = candles.length - horizonBars - 1;
  const firstAnchor = lastAnchor - (maxWindows - 1) * horizonBars;
  if (firstAnchor < 154) {
    const result = {
      status: 'INSUFFICIENT_HISTORY',
      reason: `Historical Replay needs at least 155 training candles plus ${horizonBars * maxWindows} future candles; available: ${candles.length}.`,
      symbolCode: activeTab.symbolCode,
      timeframe: activeTab.timeframe,
      horizonBars,
      windows: [],
    };
    state._forecastReplayResult = result;
    return result;
  }

  defaultForecastRegistry.applyConfig(state.chartPreferences.forecastPluginConfig);
  for (let anchorIndex = firstAnchor; anchorIndex <= lastAnchor; anchorIndex += horizonBars) {
    const trainingCandles = candles.slice(0, anchorIndex + 1);
    const actualCandles = candles.slice(anchorIndex + 1, anchorIndex + 1 + horizonBars);
    if (actualCandles.length !== horizonBars) continue;

    const forecast = ForecastEngine.project(trainingCandles, {
      symbolCode: activeTab.symbolCode,
      providerId: 'tvdatafeed',
      timeframe: activeTab.timeframe,
      horizonBars,
      renderMode: normalizeRenderMode(activeTab.forecastRenderMode || state.chartPreferences.forecastRenderMode || RENDER_MODES.FAN_CHART),
      selectedScenarioId: activeTab.selectedScenarioId || state.chartPreferences.selectedScenarioId || 'SCENARIO_A',
      selectedModelId,
      registry: defaultForecastRegistry,
      workerUrl: '',
    });
    if (!forecast || forecast.status === FORECAST_STATUS.DATA_NOT_READY || !Array.isArray(forecast.points) || forecast.points.length !== horizonBars) {
      windows.push({
        status: forecast?.status || 'FAILED',
        reason: forecast?.readiness?.issues?.join('; ') || forecast?.selectionReason || 'Forecast did not produce a complete path',
        anchorTimeUtcMs: Number(trainingCandles[trainingCandles.length - 1]?.open_time_utc_ms || 0),
      });
      continue;
    }

    const errors = [];
    let covered = 0;
    let directionHits = 0;
    const anchorClose = Number(trainingCandles[trainingCandles.length - 1].close);
    const actualTerminal = Number(actualCandles[actualCandles.length - 1].close);
    const predictedTerminal = Number(forecast.points[horizonBars - 1].q50);
    for (let i = 0; i < horizonBars; i++) {
      const actual = Number(actualCandles[i].close);
      const predicted = Number(forecast.points[i].q50);
      const q10 = Number(forecast.points[i].q10);
      const q90 = Number(forecast.points[i].q90);
      errors.push(Math.abs(predicted - actual));
      if (actual >= q10 && actual <= q90) covered += 1;
    }
    directionHits = (predictedTerminal >= anchorClose) === (actualTerminal >= anchorClose) ? 1 : 0;
    const mae = errors.reduce((sum, value) => sum + value, 0) / errors.length;
    windows.push({
      status: forecast.status,
      modelId: forecast.selectedChartModelId || selectedModelId,
      anchorTimeUtcMs: Number(trainingCandles[trainingCandles.length - 1]?.open_time_utc_ms || 0),
      actualTerminal,
      predictedTerminal,
      mae,
      maePct: anchorClose > 0 ? (mae / anchorClose) * 100 : null,
      coverage80Pct: (covered / horizonBars) * 100,
      directionHit: directionHits === 1,
      inputHash: forecast.inputHash,
      trainingBars: trainingCandles.length,
      actualBars: actualCandles.length,
    });
  }

  const scored = windows.filter((w) => Number.isFinite(w.mae));
  const result = {
    status: scored.length === maxWindows ? 'COMPLETED' : scored.length > 0 ? 'PARTIAL' : 'FAILED',
    reason: scored.length === maxWindows
      ? 'All replay windows were forecast using data available strictly before each anchor.'
      : `${scored.length}/${maxWindows} replay windows produced scoreable forecasts.`,
    symbolCode: activeTab.symbolCode,
    timeframe: activeTab.timeframe,
    horizonBars,
    selectedModelId,
    windows,
    summary: scored.length ? {
      meanMae: scored.reduce((sum, w) => sum + w.mae, 0) / scored.length,
      meanMaePct: scored.reduce((sum, w) => sum + Number(w.maePct || 0), 0) / scored.length,
      meanCoverage80Pct: scored.reduce((sum, w) => sum + w.coverage80Pct, 0) / scored.length,
      directionAccuracyPct: (scored.filter((w) => w.directionHit).length / scored.length) * 100,
      scoredWindows: scored.length,
    } : null,
    leakagePolicy: 'TRAINING_SLICE_ENDS_AT_ANCHOR; FUTURE_CANDLES_USED_ONLY_FOR_SCORING',
    generatedAtUtcMs: Date.now(),
  };
  state._forecastReplayResult = result;
  return result;
}

function renderHistoricalReplaySection(isFa, decimals) {
  const replay = state._forecastReplayResult;
  const sameContext = replay && replay.symbolCode === (getActiveTabSymbolForReplay() || replay.symbolCode);
  const rows = sameContext && Array.isArray(replay.windows) ? replay.windows.map((w, index) => `
    <tr>
      <td class="ltr-num">${index + 1}</td>
      <td class="ltr-num">${w.anchorTimeUtcMs ? new Date(w.anchorTimeUtcMs).toISOString().replace('T', ' ').slice(0, 16) : '—'}</td>
      <td class="ltr-num">${escapeHtml(w.status || '—')}</td>
      <td class="ltr-num">${Number.isFinite(w.predictedTerminal) ? PriceFormatter.formatPrice(w.predictedTerminal, decimals) : '—'}</td>
      <td class="ltr-num">${Number.isFinite(w.actualTerminal) ? PriceFormatter.formatPrice(w.actualTerminal, decimals) : '—'}</td>
      <td class="ltr-num">${Number.isFinite(w.maePct) ? w.maePct.toFixed(3) + '%' : '—'}</td>
      <td class="ltr-num">${Number.isFinite(w.coverage80Pct) ? w.coverage80Pct.toFixed(1) + '%' : '—'}</td>
    </tr>`).join('') : '';
  const summary = sameContext && replay.summary ? `
    <div class="ci-fc-ladder-grid ltr-num">
      <div class="ci-fc-mini-stat"><span>Mean MAE</span><strong>${replay.summary.meanMaePct.toFixed(3)}%</strong></div>
      <div class="ci-fc-mini-stat"><span>80% Coverage</span><strong>${replay.summary.meanCoverage80Pct.toFixed(1)}%</strong></div>
      <div class="ci-fc-mini-stat"><span>Direction Accuracy</span><strong>${replay.summary.directionAccuracyPct.toFixed(1)}%</strong></div>
      <div class="ci-fc-mini-stat"><span>Scored Windows</span><strong>${replay.summary.scoredWindows}</strong></div>
    </div>` : '';
  return `
    <div class="ci-fc-card" style="margin-top:12px;">
      <div class="row-between" style="gap:8px;flex-wrap:wrap;margin-bottom:8px;">
        <div><strong>${isFa ? 'بازپخش تاریخی بدون نشت داده' : 'Historical Replay · Leakage-Safe'}</strong>
          <div style="font-size:11px;color:var(--text-muted);">${isFa ? 'سه مبدأ گذشته؛ آموزش فقط با کندل‌های قبل از مبدأ و آینده فقط برای امتیازدهی.' : 'Three historical anchors; training uses only candles before each anchor. Future bars are scoring-only.'}</div>
        </div>
        <button type="button" class="btn btn-sm btn-primary" data-action="run-forecast-replay">${isFa ? 'اجرای بازپخش تاریخی' : 'Run Historical Replay'}</button>
      </div>
      ${sameContext ? `<span class="ci-fc-status-badge ${replay.status === 'COMPLETED' ? 'ci-fc-badge-valid' : 'ci-fc-badge-provisional'} ltr-num">${escapeHtml(replay.status)}</span><p style="font-size:11px;color:var(--text-muted);">${escapeHtml(replay.reason)}</p>${summary}<div style="overflow-x:auto;margin-top:8px;"><table class="ci-fc-table"><thead><tr><th>#</th><th>Anchor UTC</th><th>Status</th><th>Predicted</th><th>Actual</th><th>MAE %</th><th>80% Cov.</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p style="font-size:11px;color:var(--text-muted);">${isFa ? 'برای نماد و تایم‌فریم فعلی هنوز بازپخش اجرا نشده است.' : 'No replay has been run for the current symbol/timeframe.'}</p>`}
    </div>
  `;
}

function getActiveTabSymbolForReplay() {
  const tab = state.openTabs?.find((item) => item.tabId === state.activeTabId) || state.openTabs?.[0];
  return tab ? tab.symbolCode : '';
}

export function renderBacktestPanel(fc, decimals, isFa) {
  const wf = fc?.walkForward;
  if (!wf || wf.evaluatedWindows === 0 || !wf.ensembleMetrics) {
    return `
      <div class="ci-fc-card" style="padding:24px;text-align:center;">
        <strong>${isFa ? 'ارزیابی Nested Walk-Forward نیاز به تاریخچه بیشتر دارد' : 'Nested Walk-Forward Backtest Unavailable'}</strong>
        <p style="color:var(--text-muted);font-size:12.5px;">${escapeHtml(wf?.acceptanceReason || 'Need >= N_op_min clean bars (155 for H=10, 1248+ for H=30 statistical gate) to execute disjoint 4-way purged walk-forward.')}</p>
      </div>
    `;
  }

  const rows = [wf.ensembleMetrics, ...(wf.modelBenchmarks || [])]
    .map((m) => {
      const isEns = m.modelId === 'ensemble';
      const isWinner = m.modelId === wf.winningModelId;
      const st = m.status || MODEL_EXECUTION_STATUS.SUCCESS;
      const isOk = st === MODEL_EXECUTION_STATUS.SUCCESS && m.evaluatedWindows > 0;
      const badgeTxt = m.isApproximation ? `${m.executionRuntime || 'NATIVE_JS'} · APPROX` : (m.executionRuntime || 'NATIVE_JS');
      const statusReason = isOk
        ? (isWinner ? 'WINNER ★' : 'OK')
        : `${st}${m.reason ? ': ' + m.reason : ''}`;
      return `
        <tr class="${isEns || isWinner ? 'ci-fc-row-highlight' : ''}">
          <td><strong>${escapeHtml(m.modelName)}</strong><div style="font-size:10px;color:var(--text-muted);" class="ltr-num">${escapeHtml(badgeTxt)}</div></td>
          <td class="ltr-num">${escapeHtml(m.family)}</td>
          <td class="ltr-num" style="color:${isOk ? (isWinner ? 'var(--bull)' : 'var(--text-main)') : 'var(--bear)'};font-size:11px;">${escapeHtml(statusReason)}</td>
          <td class="ltr-num">${isOk ? `${Number(m.mae ?? 0).toFixed(decimals >= 3 ? 4 : 3)} (${Number(m.maePct ?? 0).toFixed(2)}%)` : '—'}</td>
          <td class="ltr-num">${isOk && m.rMae != null ? Number(m.rMae).toFixed(3) : '—'}</td>
          <td class="ltr-num">${isOk && m.mase != null ? Number(m.mase).toFixed(3) : '—'}</td>
          <td class="ltr-num">${isOk ? `${Number(m.directionalAccuracyPct ?? 0).toFixed(1)}%` : '—'}</td>
          <td class="ltr-num">${isOk ? `${Number(m.coverage80Pct ?? 0).toFixed(1)}%` : '—'}</td>
          <td class="ltr-num">${isOk && m.wis != null ? Number(m.wis).toFixed(4) : '—'}</td>
          <td class="ltr-num">${isOk && m.dmPValue != null ? Number(m.dmPValue).toFixed(4) : '—'}</td>
          <td class="ltr-num">${isOk && m.bootPValue != null ? Number(m.bootPValue).toFixed(4) : '—'}</td>
        </tr>
      `;
    })
    .join('');

  const pv = wf.pathEventStats;
  const stab = fc.stability;
  const sensGrid = fc.eventDictionary?.sensitivityGrid || [];
  const sensRows = sensGrid
    .map(
      (s) => `
      <tr>
        <td class="ltr-num">${Number(s.penetrationAtrMult ?? 0).toFixed(2)}× ATR</td>
        <td class="ltr-num">${Number(s.reclaimWindowBars ?? 0)} bars</td>
        <td class="ltr-num">${Number(s.breakoutCloses ?? 0)} closes</td>
        <td class="ltr-num">${Number(s.touchFreqPct ?? 0).toFixed(1)}%</td>
        <td class="ltr-num">${Number(s.reclaimFreqPct ?? 0).toFixed(1)}%</td>
        <td class="ltr-num">${Number(s.breakoutFreqPct ?? 0).toFixed(1)}%</td>
        <td class="ltr-num">${Number(s.ambiguousRatePct ?? 0).toFixed(1)}%</td>
      </tr>
    `
    )
    .join('');

  const wfStatus = wf.forecastStatus || (wf.acceptancePassed ? 'VALID' : 'NO_EDGE');
  return `
    <div class="ci-fc-card" style="margin-bottom:12px;">
      <div class="row-between" style="flex-wrap:wrap;gap:8px;margin-bottom:8px;">
        <strong style="font-size:13.5px;">${isFa ? 'دروازه پذیرش Nested Walk-Forward ۶شرطی (بدون نشت داده آینده)' : 'Disjoint 4-Way Nested Walk-Forward Acceptance Gate (6-Condition)'}</strong>
        <span class="ci-fc-status-badge ${wf.acceptancePassed ? 'ci-fc-badge-valid' : wfStatus === 'INSUFFICIENT_EVIDENCE' ? 'ci-fc-badge-provisional' : 'ci-fc-badge-blocked'} ltr-num">
          ${escapeHtml(wfStatus)} · ${wf.evaluatedWindows}×(+${wf.evalHorizon}b, S=${wf.outerStrideBars || wf.evalHorizon})
        </span>
      </div>
      <p style="font-size:12px;margin:0 0 8px 0;color:var(--text-muted);" class="ltr-num">${escapeHtml(wf.acceptanceReason)}</p>
      <div class="ci-fc-ladder-grid ltr-num">
        <div class="ci-fc-mini-stat"><span>N_eff (Bartlett)</span><strong>${Number(wf.effectiveSampleSize || 0).toFixed(1)}</strong></div>
        <div class="ci-fc-mini-stat"><span>WIS Model vs Naive</span><strong>${Number(wf.wisModel ?? 0).toFixed(4)} / ${Number(wf.wisNaiveDistributional ?? 0).toFixed(4)}</strong></div>
        <div class="ci-fc-mini-stat"><span>rMAE / MASE</span><strong>${Number(wf.relativeMaeVsNaive ?? 1).toFixed(3)} / ${Number(wf.mase ?? 1).toFixed(3)}</strong></div>
        <div class="ci-fc-mini-stat"><span>HLN-DM / Boot p</span><strong>${Number(wf.dieboldMarianoPValue ?? 1).toFixed(4)} / ${Number(wf.sensitivityBootstrapPValue ?? 1).toFixed(4)}</strong></div>
        <div class="ci-fc-mini-stat"><span>80% Cov [72..88%]</span><strong>${Number(wf.coverage80Pct ?? 0).toFixed(1)}%</strong></div>
        ${
          stab
            ? `<div class="ci-fc-mini-stat"><span>Stability Drift</span><strong>${Number(stab.medianDriftPct ?? 0).toFixed(2)}% (${stab.stable ? 'STABLE' : 'SHIFT'})</strong></div>`
            : ''
        }
      </div>
    </div>

    ${
      pv
        ? `
      <div class="ci-fc-card" style="margin-bottom:12px;">
        <strong style="font-size:13px;display:block;margin-bottom:8px;">${isFa ? 'بردار رویدادهای مسیر مستقل (بدون ادغام مصنوعی در یک عدد)' : 'Independent Path Event Vector (Empirical Telemetry)'}</strong>
        <div class="ci-fc-ladder-grid ltr-num">
          <div class="ci-fc-mini-stat"><span>Touch Rate</span><strong>${Number(pv.touchRatePct ?? pv.targetReachedRatePct ?? 0).toFixed(1)}%</strong></div>
          <div class="ci-fc-mini-stat"><span>Reclaim Rate</span><strong>${Number(pv.reclaimRatePct ?? 0).toFixed(1)}%</strong></div>
          <div class="ci-fc-mini-stat"><span>Confirmed Breakout</span><strong>${Number(pv.breakoutRatePct ?? pv.confirmedBreakoutRatePct ?? 0).toFixed(1)}%</strong></div>
          <div class="ci-fc-mini-stat"><span>Reach Before Inv</span><strong>${Number(pv.reachBeforeInvalidationPct ?? pv.targetReachedRatePct ?? 0).toFixed(1)}%</strong></div>
          <div class="ci-fc-mini-stat"><span>Ambiguous Rate</span><strong>${Number(pv.ambiguousRatePct ?? 0).toFixed(1)}%</strong></div>
          <div class="ci-fc-mini-stat"><span>Censoring Rate</span><strong>${Number(pv.censoringRatePct ?? 0).toFixed(1)}%</strong></div>
        </div>
      </div>
    `
        : ''
    }

    <div class="ci-fc-card" style="overflow-x:auto;margin-bottom:12px;">
      <table class="ci-fc-table">
        <thead>
          <tr>
            <th>Model / Runtime</th>
            <th>Family</th>
            <th>Status</th>
            <th>MAE</th>
            <th>rMAE</th>
            <th>MASE</th>
            <th>Dir Acc</th>
            <th>80% Cov</th>
            <th>WIS (5Q)</th>
            <th>HLN-DM p</th>
            <th>Boot p</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    ${
      sensRows
        ? `
      <div class="ci-fc-card" style="overflow-x:auto;">
        <div style="font-size:12.5px;font-weight:700;margin-bottom:8px;">${isFa ? 'ماتریس حساسیت فرهنگ رویداد (ATR Penetration × Reclaim Window)' : 'Event Dictionary Sensitivity Grid (ATR Penetration × Reclaim Window)'}</div>
        <table class="ci-fc-table">
          <thead>
            <tr>
              <th>Penetration</th>
              <th>Reclaim Window</th>
              <th>Confirm Closes</th>
              <th>Touch %</th>
              <th>Reclaim %</th>
              <th>Breakout %</th>
              <th>Ambiguous %</th>
            </tr>
          </thead>
          <tbody>${sensRows}</tbody>
        </table>
      </div>
    `
        : ''
    }
  `;
}

export function renderLedgerPanel(decimals, isFa) {
  const entries = defaultForecastLedger.loadEntries().slice().reverse();
  const audit = defaultForecastLedger.verifyChain();
  const lifecycleEvents = defaultForecastLedger.loadLifecycleEvents().slice().reverse();
  const lcAudit = defaultForecastLedger.verifyLifecycleChain();
  const serverEntries = Array.isArray(state.forecastServerLedger) ? state.forecastServerLedger : [];
  const serverLifecycle = Array.isArray(state.forecastServerLifecycle) ? state.forecastServerLifecycle : [];

  const rowsHtml =
    entries.length === 0
      ? `<div style="padding:18px;text-align:center;color:var(--text-muted);font-size:12.5px;">${isFa ? 'هنوز هیچ پیش‌بینی‌ای در دفتر کل محلی ثبت نشده است.' : 'No immutable forecast snapshots recorded yet.'}</div>`
      : entries
          .map(
            (e) => `
          <tr>
            <td class="ltr-num">#${e.seq}</td>
            <td class="ltr-num"><strong>${escapeHtml(e.symbolCode)}</strong> · ${escapeHtml(e.timeframe)} (+${e.horizonBars})</td>
            <td class="ltr-num">${escapeHtml(e.forecastStatus)}</td>
            <td class="ltr-num">${escapeHtml(e.noEdgeGateState || 'PROVISIONAL')}</td>
            <td class="ltr-num">${PriceFormatter.formatPrice(e.terminalMedian, decimals)}</td>
            <td class="ltr-num">[${PriceFormatter.formatPrice(e.terminalQ10, decimals)} .. ${PriceFormatter.formatPrice(e.terminalQ90, decimals)}]</td>
            <td class="ltr-num" title="${escapeHtml(e.prevForecastHash)} → ${escapeHtml(e.forecastHash)}">${escapeHtml(String(e.prevForecastHash).slice(0, 8))}… → <strong>${escapeHtml(String(e.forecastHash).slice(0, 12))}…</strong></td>
            <td class="ltr-num">${e.syncedToCloud ? '✓ Synced' : 'Local'}</td>
          </tr>
        `
          )
          .join('');

  const lcRowsHtml =
    lifecycleEvents.length === 0
      ? `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">${isFa ? 'هنوز رویداد چرخه عمر ثبت نشده است.' : 'No append-only lifecycle events yet.'}</td></tr>`
      : lifecycleEvents
          .map((ev) => {
            const outCol =
              ev.evaluationOutcome === EVALUATION_OUTCOME.SUCCESS
                ? 'var(--bull)'
                : ev.evaluationOutcome === EVALUATION_OUTCOME.FAILED
                  ? 'var(--bear)'
                  : ev.evaluationOutcome === EVALUATION_OUTCOME.AMBIGUOUS
                    ? 'var(--gold)'
                    : 'var(--text-muted)';
            return `
              <tr>
                <td class="ltr-num">#${ev.seq}</td>
                <td class="ltr-num">${escapeHtml(ev.symbolCode)} ${escapeHtml(ev.timeframe)} (+${ev.horizonStep})</td>
                <td class="ltr-num"><strong>${escapeHtml(ev.lifecycleStatus)}</strong></td>
                <td class="ltr-num" style="color:${outCol};font-weight:700;">${escapeHtml(ev.evaluationOutcome)}</td>
                <td class="ltr-num">${ev.observedClose != null ? PriceFormatter.formatPrice(ev.observedClose, decimals) : '—'}</td>
                <td class="ltr-num">${escapeHtml(String(ev.eventHash || '').slice(0, 12))}…</td>
                <td style="font-size:11px;color:var(--text-muted);">${escapeHtml(ev.reason || '')}</td>
              </tr>
            `;
          })
          .join('');

  return `
    <div class="ci-fc-card" style="margin-bottom:12px;">
      <div class="row-between" style="flex-wrap:wrap;gap:8px;">
        <div>
          <strong style="font-size:13px;">${isFa ? 'دفتر کل زنجیره هش SHA-256 (مقاوم در برابر دستکاری)' : 'Append-Only SHA-256 Hash-Chained Ledger & Lifecycle Log'}</strong>
          <div style="font-size:11.5px;color:${audit.valid ? 'var(--bull)' : 'var(--bear)'};" class="ltr-num">Runs: ${escapeHtml(audit.reason)} · Lifecycle: ${escapeHtml(lcAudit.reason)}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-sm btn-primary" data-action="record-forecast-snapshot">${isFa ? 'ثبت اسنپ‌شات فعلی' : 'Record Current Snapshot'}</button>
          <button type="button" class="btn btn-sm" data-action="evaluate-forecast-outcomes">${isFa ? 'ارزیابی سررسید و Ambiguous' : 'Evaluate Matured Outcomes'}</button>
          <button type="button" class="btn btn-sm" data-action="refresh-forecast-ledger">${isFa ? 'به‌روزرسانی دفتر محلی' : 'Refresh Local Ledger'}</button>
        </div>
      </div>
    </div>

    <div class="ci-fc-card" style="overflow-x:auto;margin-bottom:12px;">
      <table class="ci-fc-table">
        <thead>
          <tr>
            <th>Seq</th>
            <th>Symbol / Horizon</th>
            <th>Status</th>
            <th>Edge Gate</th>
            <th>q50 Target</th>
            <th>80% Interval</th>
            <th>Hash Chain</th>
            <th>Sync</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${
        serverEntries.length > 0 || serverLifecycle.length > 0
          ? `<div style="margin-top:10px;font-size:11.5px;color:var(--text-muted);" class="ltr-num">Server MariaDB runs: ${serverEntries.length} · Server lifecycle events: ${serverLifecycle.length}</div>`
          : ''
      }
    </div>

    <div class="ci-fc-card" style="overflow-x:auto;">
      <div style="font-size:12.5px;font-weight:700;margin-bottom:8px;">${isFa ? 'گزارش فقط‌افزودنی چرخه عمر و نتایج سررسید (ACTIVE / MATURED / AMBIGUOUS)' : 'Append-Only Lifecycle & Per-Horizon Outcome Log (Never Mutates Runs)'}</div>
      <table class="ci-fc-table">
        <thead>
          <tr>
            <th>Seq</th>
            <th>Symbol / Step</th>
            <th>Lifecycle</th>
            <th>Outcome</th>
            <th>Observed Close</th>
            <th>Event Hash</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>${lcRowsHtml}</tbody>
      </table>
    </div>
  `;
}
