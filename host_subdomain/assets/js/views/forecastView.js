import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.47.41';
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
} from '../forecast/forecastContract.js?v=1.47.41';
import { defaultForecastRegistry } from '../forecast/modelRegistry.js?v=1.47.41';
import { defaultForecastLedger } from '../forecast/forecastLedger.js?v=1.47.41';
import { ForecastEngine, resolveLowerTimeframeInfo } from '../forecast/forecastEngine.js?v=1.47.41';
import { selectOosChartWinner } from '../forecast/walkForwardEvaluator.js?v=1.47.41';
import { computeSmcPrediction } from '../forecast/smcPredictionEngine.js?v=1.47.41';
import { computeStructuralForecast } from '../algorithms/structuralForecastEngine.js?v=1.47.41';

import { state, escapeHtml, getCachedOrAggregatedCandles, safeLocalStorageSet } from '../core/store.js?v=1.47.41';

const MODEL_OVERLAY_COLORS = {
  structural_wave_js: '#8B5CF6',
  smc_prediction_js: '#06B6D4',
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

const FORECAST_BASE_CACHE_LIMIT = 16;
const FORECAST_VIEW_CACHE_LIMIT = 24;

function lruCacheGet(map, key) {
  if (!(map instanceof Map) || !map.has(key)) return null;
  const val = map.get(key);
  map.delete(key);
  map.set(key, val);
  return val;
}

function lruCacheSet(map, key, value, limit) {
  if (!(map instanceof Map)) return;
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > limit) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
  }
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
  if (!(state._forecastBaseCache instanceof Map)) state._forecastBaseCache = new Map();
  if (!(state._forecastViewCache instanceof Map)) state._forecastViewCache = new Map();
  const cacheKey = `${activeTab.symbolCode}_${activeTab.timeframe}_${horizonBars}`;
  const lastStored = state._prevForecastByKey[cacheKey] || null;

  const selectedScenarioId = activeTab.selectedScenarioId || prefs.selectedScenarioId || 'SCENARIO_A';
  const selectedModelId = String(overrides.selectedModelId || activeTab.selectedForecastModelId || prefs.selectedForecastModelId || 'AUTO');
  const skipBootstrap = Boolean(overrides.skipBootstrap);
  const lastBar = candles.length > 0 ? candles[candles.length - 1] : null;
  const firstBar = candles.length > 0 ? candles[0] : null;
  const lastHigherBar = higherCandles.length > 0 ? higherCandles[higherCandles.length - 1] : null;
  const lastLowerBar = lowerCandles.length > 0 ? lowerCandles[lowerCandles.length - 1] : null;
  const seriesCoreKey = [
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
    workerUrl,
    JSON.stringify(prefs.forecastPluginConfig || null),
  ].join('|');
  const bootTag = skipBootstrap ? 'NOBOOT' : 'BOOT';
  const baseKey = `${seriesCoreKey}|${bootTag}`;
  const bootBaseKey = `${seriesCoreKey}|BOOT`;
  const viewKey = `${baseKey}|${renderMode}|${selectedScenarioId}|${selectedModelId}`;
  const bootViewKey = `${bootBaseKey}|${renderMode}|${selectedScenarioId}|${selectedModelId}`;

  if (!state._workerForecastByKey) state._workerForecastByKey = {};
  if (!state._workerPendingKeys) state._workerPendingKeys = {};

  // 1) Exact view hit (if skipBootstrap is requested and full BOOT view is already cached, reuse it immediately)
  const exactHit =
    lruCacheGet(state._forecastViewCache, viewKey) ||
    (skipBootstrap ? lruCacheGet(state._forecastViewCache, bootViewKey) : null);
  if (exactHit) {
    return { candles: exactHit.candles, result: exactHit.result, cacheHit: 'EXACT' };
  }

  // 2) Base forecast hit: re-select model/renderMode in <1ms without re-running Walk-Forward or model inference
  const baseHit =
    lruCacheGet(state._forecastBaseCache, baseKey) ||
    (skipBootstrap ? lruCacheGet(state._forecastBaseCache, bootBaseKey) : null);
  if (baseHit && baseHit.result && baseHit.result.status !== FORECAST_STATUS.DATA_NOT_READY) {
    const baseRes = baseHit.result;
    const trajs = Array.isArray(baseRes.modelTrajectories) ? baseRes.modelTrajectories : [];
    const selection = selectOosChartWinner(baseRes.walkForward, trajs, selectedModelId);
    const chosen =
      trajs.find(
        (t) =>
          t.modelId === selection.selectedModelId &&
          t.status === MODEL_EXECUTION_STATUS.SUCCESS &&
          Array.isArray(t.points) &&
          t.points.length === baseRes.horizonBars
      ) ||
      trajs.find((t) => t.modelId === 'naive_persistence' && Array.isArray(t.points) && t.points.length > 0);
    const nextPoints = chosen ? chosen.points : baseRes.points;
    const lastPt = nextPoints && nextPoints.length > 0 ? nextPoints[nextPoints.length - 1] : null;
    const anchorClose = Number(baseRes.anchorClose || 0);
    const nextSummary =
      lastPt && anchorClose > 0
        ? {
            ...(baseRes.summary || {}),
            terminalStep: lastPt.stepAhead,
            terminalQ10: lastPt.q10,
            terminalQ25: lastPt.q25,
            terminalQ50: lastPt.q50,
            terminalQ75: lastPt.q75,
            terminalQ90: lastPt.q90,
            medianPctChange: lastPt.pctChangeFromLast,
            corridorWidthPct: ((lastPt.q90 - lastPt.q10) / anchorClose) * 100,
          }
        : baseRes.summary;
    const reselectedResult = {
      ...baseRes,
      renderMode,
      selectedChartModelId: selection.selectedModelId,
      selectionMode: selection.selectionMode,
      selectionReason: selection.reason,
      turningPoints: Array.isArray(chosen?.meta?.turningPoints) ? chosen.meta.turningPoints : [],
      smcPoc: Number.isFinite(Number(chosen?.meta?.pocPrice)) ? Number(chosen.meta.pocPrice) : null,
      points: nextPoints,
      summary: nextSummary,
    };
    const builtReselected = {
      candles: baseHit.candles,
      result: reselectedResult,
      cacheHit: 'BASE_RESELECT',
    };
    lruCacheSet(state._forecastViewCache, viewKey, builtReselected, FORECAST_VIEW_CACHE_LIMIT);
    return builtReselected;
  }

  let result = ForecastEngine.project(candles, {
    symbolCode: activeTab.symbolCode,
    providerId: activeTab.provider || 'tvdatafeed',
    timeframe: activeTab.timeframe,
    horizonBars,
    renderMode,
    selectedScenarioId,
    selectedModelId,
    skipBootstrap,
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
    cacheHit: 'MISS',
  };
  lruCacheSet(state._forecastBaseCache, baseKey, built, FORECAST_BASE_CACHE_LIMIT);
  lruCacheSet(state._forecastViewCache, viewKey, built, FORECAST_VIEW_CACHE_LIMIT);
  return built;
}

export function renderForecastStudioFanCanvas(
  canvas,
  candles = [],
  forecast = null,
  decimals = 2,
  isDark = true,
  coordMode = 'independent',
  hoverSlotIdx = null
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

  const trajsForCanvas = Array.isArray(forecast?.modelTrajectories) ? forecast.modelTrajectories : [];
  const overlayModels = trajsForCanvas.filter(
    (t) =>
      t.status === MODEL_EXECUTION_STATUS.SUCCESS &&
      Array.isArray(t.points) &&
      t.points.length >= pts.length &&
      t.modelId !== forecast.selectedChartModelId &&
      (!Array.isArray(forecast.visibleComparisonModelIds) || forecast.visibleComparisonModelIds.includes(t.modelId)) &&
      ['structural_wave_js', 'empirical_analogs', 'smc_prediction_js', 'native_arima_diff', 'native_prophet_decomp', 'native_seq_recurrent_approx', 'native_quantile_attention_approx', 'py_arima', 'py_arima_statsmodels', 'py_prophet', 'py_lstm_mc', 'py_lstm_torch', 'py_tft', 'py_tft_torch'].includes(t.modelId)
  );

  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of hist) {
    minP = Math.min(minP, Number(c.low));
    maxP = Math.max(maxP, Number(c.high));
  }
  for (const p of pts) {
    const lo = Number(p.q10 ?? p.low ?? p.q50);
    const hi = Number(p.q90 ?? p.high ?? p.q50);
    if (Number.isFinite(lo)) minP = Math.min(minP, lo);
    if (Number.isFinite(hi)) maxP = Math.max(maxP, hi);
  }
  for (const rep of Array.isArray(forecast?.representativePaths) ? forecast.representativePaths : []) {
    if (!Array.isArray(rep?.closes)) continue;
    for (const cv of rep.closes.slice(0, pts.length)) {
      const n = Number(cv);
      if (Number.isFinite(n) && n > 0) {
        minP = Math.min(minP, n);
        maxP = Math.max(maxP, n);
      }
    }
  }
  for (const tr of overlayModels) {
    for (let idx = 0; idx < pts.length; idx++) {
      const n = Number(tr.points[idx]?.q50);
      if (Number.isFinite(n) && n > 0) {
        minP = Math.min(minP, n);
        maxP = Math.max(maxP, n);
      }
    }
  }
  for (const actual of Array.isArray(forecast?.actualPoints) ? forecast.actualPoints : []) {
    const close = Number(actual.close ?? actual);
    if (Number.isFinite(close)) {
      minP = Math.min(minP, close);
      maxP = Math.max(maxP, close);
    }
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

  // Optional SMC Volume Profile POC reference line (causal liquidity magnet)
  const smcPocVal = Number(forecast?.smcPoc);
  if (Number.isFinite(smcPocVal) && smcPocVal >= minP && smcPocVal <= maxP) {
    const pocY = yOf(smcPocVal);
    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(192, 132, 252, 0.55)' : 'rgba(126, 34, 206, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, pocY);
    ctx.lineTo(w - padR, pocY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.fillStyle = isDark ? '#D8B4FE' : '#7E22CE';
    ctx.textAlign = 'left';
    ctx.fillText(`POC ${PriceFormatter.formatPrice(smcPocVal, decimals)}`, padL + 4, Math.max(padT + 10, pocY - 3));
    ctx.restore();
  }

  // Store layout geometry for interactive hover crosshair mapping
  canvas.__ciLayout = { w, h, padL, padR, padT, padB, plotW, plotH, slotW, histLen: hist.length, ptsLen: pts.length, totalSlots };

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
      pts.forEach((p, idx) => {
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
    overlayModels.forEach((tr) => {
      const col = tr.color || MODEL_OVERLAY_COLORS[tr.modelId] || '#64748B';
      const hasExplicitColor = Boolean(tr.color);
      ctx.save();
      ctx.strokeStyle = col;
      ctx.globalAlpha = hasExplicitColor ? 0.9 : 0.65;
      ctx.lineWidth = hasExplicitColor ? 1.85 : 1.3;
      ctx.setLineDash(hasExplicitColor ? [4, 3] : [2, 3]);
      ctx.beginPath();
      ctx.moveTo(xOf(hist.length - 1), yOf(Number(hist[hist.length - 1].close)));
      for (let idx = 0; idx < pts.length; idx++) {
        if (!tr.points[idx]) break;
        ctx.lineTo(xOf(hist.length + idx), yOf(Number(tr.points[idx].q50)));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });

    // Active Median q50 line
    const activeLineCol = useCoord ? '#A855F7' : (forecast?.primaryLineColor || MODEL_OVERLAY_COLORS[forecast?.selectedChartModelId] || '#F59E0B');
    ctx.strokeStyle = activeLineCol;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(xOf(hist.length - 1), yOf(Number(hist[hist.length - 1].close)));
    pts.forEach((p, idx) => ctx.lineTo(xOf(hist.length + idx), yOf(p.q50)));
    ctx.stroke();
    ctx.setLineDash([]);

    // Structural JS probable turning points (diamond nodes) when present
    if (Array.isArray(forecast?.turningPoints) && forecast.turningPoints.length > 0) {
      for (const tp of forecast.turningPoints) {
        const stepIdx = Number(tp?.step || 0) - 1;
        if (stepIdx < 0 || stepIdx >= pts.length) continue;
        const tx = xOf(hist.length + stepIdx);
        const ty = yOf(Number(pts[stepIdx].q50));
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = activeLineCol;
        ctx.lineWidth = 1.6;
        ctx.fillRect(-3, -3, 6, 6);
        ctx.strokeRect(-3, -3, 6, 6);
        ctx.restore();
      }
    }

    // Optional historical replay actual path; scoring data is displayed separately from the forecast q50.
    const actualReplayPoints = Array.isArray(forecast?.actualPoints) ? forecast.actualPoints : [];
    if (actualReplayPoints.length > 0) {
      ctx.save();
      ctx.strokeStyle = isDark ? '#CBD5E1' : '#475569';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(xOf(hist.length - 1), yOf(Number(hist[hist.length - 1].close)));
      actualReplayPoints.forEach((point, idx) => {
        ctx.lineTo(xOf(hist.length + idx), yOf(Number(point.close ?? point)));
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

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

  // Interactive Hover Crosshair + Floating HUD Tooltip (Studio & Replay)
  if (hoverSlotIdx !== null && Number.isInteger(hoverSlotIdx) && hoverSlotIdx >= 0 && hoverSlotIdx < totalSlots) {
    const hx = xOf(hoverSlotIdx);
    const anchorClose = Number(hist[hist.length - 1]?.close || 0);
    const actualReplayPoints = Array.isArray(forecast?.actualPoints) ? forecast.actualPoints : [];
    const formatUtcShort = (ms) => {
      const n = Number(ms || 0);
      if (!Number.isFinite(n) || n <= 0) return '';
      return new Date(n).toISOString().slice(5, 16).replace('T', ' ') + ' UTC';
    };

    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(226, 232, 240, 0.45)' : 'rgba(15, 23, 42, 0.38)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hx, padT);
    ctx.lineTo(hx, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    const hudLines = [];
    let focusY = padT + plotH * 0.35;

    if (hoverSlotIdx < hist.length) {
      const bar = hist[hoverSlotIdx];
      const barClose = Number(bar.close);
      focusY = yOf(barClose);
      ctx.fillStyle = barClose >= Number(bar.open) ? bullCol : bearCol;
      ctx.beginPath();
      ctx.arc(hx, focusY, 3.6, 0, Math.PI * 2);
      ctx.fill();
      const tsStr = formatUtcShort(bar.open_time_utc_ms ?? bar.openTimeUtcMs);
      hudLines.push(`Hist ${hoverSlotIdx - hist.length + 1}${tsStr ? ' · ' + tsStr : ''}`);
      hudLines.push(`O ${PriceFormatter.formatPrice(Number(bar.open), decimals)}  H ${PriceFormatter.formatPrice(Number(bar.high), decimals)}`);
      hudLines.push(`L ${PriceFormatter.formatPrice(Number(bar.low), decimals)}  C ${PriceFormatter.formatPrice(barClose, decimals)}`);
    } else {
      const stepIdx = hoverSlotIdx - hist.length;
      const pt = pts[stepIdx];
      if (pt) {
        const q50Val = Number(pt.q50);
        const q10Val = Number(pt.q10 ?? q50Val);
        const q90Val = Number(pt.q90 ?? q50Val);
        focusY = yOf(q50Val);
        const activeDotCol = useCoord ? '#A855F7' : (MODEL_OVERLAY_COLORS[forecast?.selectedChartModelId] || '#F59E0B');

        // Vertical corridor tick for hovered step
        ctx.strokeStyle = activeDotCol;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hx, yOf(q90Val));
        ctx.lineTo(hx, yOf(q10Val));
        ctx.stroke();

        ctx.fillStyle = activeDotCol;
        ctx.beginPath();
        ctx.arc(hx, focusY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        const tsStr = formatUtcShort(pt.openTimeUtcMs ?? pt.open_time_utc_ms);
        const actPt = actualReplayPoints[stepIdx];
        if (actPt !== undefined) {
          const actClose = Number(actPt.close ?? actPt);
          if (Number.isFinite(actClose)) {
            const actY = yOf(actClose);
            ctx.fillStyle = isDark ? '#E2E8F0' : '#0F172A';
            ctx.beginPath();
            ctx.arc(hx, actY, 3.8, 0, Math.PI * 2);
            ctx.fill();
            const errPct = actClose > 0 ? ((q50Val - actClose) / actClose) * 100 : 0;
            const inBand = actClose >= q10Val && actClose <= q90Val;
            hudLines.push(`Replay Step +${stepIdx + 1}${tsStr ? ' · ' + tsStr : ''}`);
            hudLines.push(`Pred q50 ${PriceFormatter.formatPrice(q50Val, decimals)} · Act ${PriceFormatter.formatPrice(actClose, decimals)}`);
            hudLines.push(`Err ${errPct >= 0 ? '+' : ''}${errPct.toFixed(2)}% · 80% Band: ${inBand ? 'IN ✓' : 'OUT ✗'}`);
            hudLines.push(`q10–q90 ${PriceFormatter.formatPrice(q10Val, decimals)} — ${PriceFormatter.formatPrice(q90Val, decimals)}`);
          }
        } else {
          const pct = anchorClose > 0 ? ((q50Val - anchorClose) / anchorClose) * 100 : 0;
          hudLines.push(`Step +${stepIdx + 1}${tsStr ? ' · ' + tsStr : ''}`);
          hudLines.push(`q50 ${PriceFormatter.formatPrice(q50Val, decimals)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`);
          hudLines.push(`q10–q90 ${PriceFormatter.formatPrice(q10Val, decimals)} — ${PriceFormatter.formatPrice(q90Val, decimals)}`);
          const nearTp = Array.isArray(forecast?.turningPoints)
            ? forecast.turningPoints.find((tp) => Math.abs(Number(tp?.step || 0) - (stepIdx + 1)) <= 1)
            : null;
          if (nearTp?.rationale) {
            hudLines.push(`Node: ${String(nearTp.rationale).slice(0, 38)}`);
          }
        }
      }
    }

    if (hudLines.length > 0) {
      ctx.font = '600 10.5px "JetBrains Mono", monospace';
      let maxTw = 0;
      for (const line of hudLines) {
        const tw = ctx.measureText(line).width;
        if (tw > maxTw) maxTw = tw;
      }
      const padX = 9;
      const padY = 7;
      const lineH = 14;
      const boxW = Math.min(plotW - 12, Math.ceil(maxTw + padX * 2));
      const boxH = hudLines.length * lineH + padY * 2 - 2;
      let boxX = hx + 10;
      if (boxX + boxW > w - padR - 4) {
        boxX = Math.max(padL + 4, hx - boxW - 10);
      }
      const boxY = Math.max(padT + 4, Math.min(padT + plotH - boxH - 4, focusY - boxH * 0.5));

      ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(15, 23, 42, 0.22)';
      ctx.lineWidth = 1;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 6);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeRect(boxX, boxY, boxW, boxH);
      }

      ctx.textAlign = 'left';
      hudLines.forEach((line, i) => {
        ctx.fillStyle = i === 0 ? (isDark ? '#F8FAFC' : '#0F172A') : (isDark ? '#CBD5E1' : '#334155');
        ctx.fillText(line, boxX + padX, boxY + padY + (i + 1) * lineH - 3);
      });
    }
    ctx.restore();
  }
}

export function bindForecastCanvasHover(
  canvas,
  candles = [],
  forecast = null,
  decimals = 2,
  isDark = true,
  coordMode = 'independent'
) {
  if (!canvas || typeof canvas.addEventListener !== 'function') return;
  canvas.__ciHoverState = {
    candles,
    forecast,
    decimals,
    isDark,
    coordMode,
    hoverSlotIdx: null,
    rafPending: false,
  };
  if (canvas.__ciHoverBound) return;
  canvas.__ciHoverBound = true;
  if (canvas.style) canvas.style.cursor = 'crosshair';

  const scheduleDraw = (nextSlotIdx) => {
    const st = canvas.__ciHoverState;
    if (!st) return;
    if (st.hoverSlotIdx === nextSlotIdx) return;
    st.hoverSlotIdx = nextSlotIdx;
    if (st.rafPending) return;
    st.rafPending = true;
    const run = () => {
      const cur = canvas.__ciHoverState;
      if (!cur) return;
      cur.rafPending = false;
      renderForecastStudioFanCanvas(
        canvas,
        cur.candles,
        cur.forecast,
        cur.decimals,
        cur.isDark,
        cur.coordMode,
        cur.hoverSlotIdx
      );
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run);
    } else {
      run();
    }
  };

  const resolveSlotFromClientX = (clientX) => {
    const layout = canvas.__ciLayout;
    if (!layout || !layout.totalSlots) return null;
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    if (localX < layout.padL || localX > layout.padL + layout.plotW) return null;
    const idx = Math.floor((localX - layout.padL) / Math.max(1e-6, layout.slotW));
    return Math.max(0, Math.min(layout.totalSlots - 1, idx));
  };

  canvas.addEventListener('mousemove', (ev) => {
    scheduleDraw(resolveSlotFromClientX(ev.clientX));
  });
  canvas.addEventListener('mouseleave', () => {
    scheduleDraw(null);
  });
  canvas.addEventListener(
    'touchmove',
    (ev) => {
      const touch = ev.touches && ev.touches[0];
      if (touch) scheduleDraw(resolveSlotFromClientX(touch.clientX));
    },
    { passive: true }
  );
  canvas.addEventListener('touchend', () => {
    scheduleDraw(null);
  });
}

// Legacy renderForecastStudioView removed in Phase 3 (v1.47.38); New Forecast Studio in app.js consumes shared panels below directly.

function formatUtcDateTimeShort(ms) {
  const n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  try {
    return new Date(n).toISOString().slice(0, 16).replace('T', ' ');
  } catch (_) {
    return '—';
  }
}

export function computeMultiModelZoneConvergence(fc) {
  if (!fc) return { hasConvergence: false, targetConsensus: null, overlappingZones: [] };
  const trajectories = Array.isArray(fc.modelTrajectories)
    ? fc.modelTrajectories.filter((t) => t.status === MODEL_EXECUTION_STATUS.SUCCESS && Array.isArray(t.points) && t.points.length > 0)
    : [];
  const anchorClose = Number(fc.anchorClose || 0);

  let bullCount = 0;
  let bearCount = 0;
  const terminalPrices = [];
  for (const t of trajectories) {
    const lastPt = t.points[t.points.length - 1];
    const q50 = Number(lastPt?.q50 ?? lastPt?.q50_median);
    if (!Number.isFinite(q50) || !(q50 > 0)) continue;
    terminalPrices.push({ modelId: t.modelId, modelName: t.modelName || t.modelId, q50 });
    if (anchorClose > 0) {
      if (q50 >= anchorClose) bullCount += 1;
      else bearCount += 1;
    }
  }

  let targetSpreadPct = null;
  let targetLevel = 'DIVERGENT';
  if (terminalPrices.length >= 2 && anchorClose > 0) {
    const minP = Math.min(...terminalPrices.map((p) => p.q50));
    const maxP = Math.max(...terminalPrices.map((p) => p.q50));
    targetSpreadPct = ((maxP - minP) / anchorClose) * 100;
    targetLevel = targetSpreadPct <= 0.65 ? 'TIGHT' : targetSpreadPct <= 1.5 ? 'MODERATE' : 'WIDE';
  }

  // Gather candidate zones across top-level keyZones and trajectory smcZones
  const rawZones = [];
  for (const z of Array.isArray(fc.keyZones) ? fc.keyZones : []) {
    rawZones.push({ source: 'Primary', type: String(z.zoneType || 'ZONE'), low: Number(z.lowPrice || 0), high: Number(z.highPrice || 0) });
  }
  for (const t of trajectories) {
    const tZones = Array.isArray(t.meta?.smcZones) ? t.meta.smcZones : [];
    for (const z of tZones) {
      rawZones.push({ source: t.modelName || t.modelId, type: String(z.zoneType || 'ZONE'), low: Number(z.lowPrice || 0), high: Number(z.highPrice || 0) });
    }
  }

  const overlappingZones = [];
  const tolPct = 0.0045;
  for (let i = 0; i < rawZones.length; i++) {
    const a = rawZones[i];
    if (!(a.high > 0)) continue;
    const aMid = (a.low + a.high) * 0.5;
    for (let j = i + 1; j < rawZones.length; j++) {
      const b = rawZones[j];
      if (!(b.high > 0) || a.source === b.source) continue;
      const bMid = (b.low + b.high) * 0.5;
      const overlap = a.low <= b.high * (1 + tolPct) && b.low <= a.high * (1 + tolPct);
      const nearMid = aMid > 0 && Math.abs(aMid - bMid) / aMid <= tolPct;
      if (overlap || nearMid) {
        overlappingZones.push({
          low: Math.min(a.low, b.low),
          high: Math.max(a.high, b.high),
          type: a.type,
          sources: [a.source, b.source],
        });
      }
    }
  }

  return {
    hasConvergence: targetLevel === 'TIGHT' || overlappingZones.length > 0,
    modelCount: terminalPrices.length,
    bullCount,
    bearCount,
    targetSpreadPct: targetSpreadPct !== null ? Number(targetSpreadPct.toFixed(2)) : null,
    targetLevel,
    overlappingZones: overlappingZones.slice(0, 3),
  };
}

const LEDGER_OVERLAY_PALETTE = ['#F59E0B', '#38BDF8', '#A855F7', '#26A69A'];

function formatUtcCompactShort(ms) {
  const n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  try {
    return new Date(n).toISOString().slice(5, 16).replace('T', ' ');
  } catch (_) {
    return '—';
  }
}

export function buildLedgerOverlayPayload(selectedEntries = [], candles = []) {
  const validEntries = (Array.isArray(selectedEntries) ? selectedEntries : []).filter(
    (e) => e && Number.isFinite(Number(e.anchorClose)) && Number(e.anchorOpenTimeUtcMs) > 0
  );
  if (validEntries.length === 0 || !Array.isArray(candles) || candles.length === 0) return null;

  const sortedCandles = candles
    .filter((c) => Number.isFinite(Number(c?.close)) && Number(c?.open_time_utc_ms ?? c?.openTimeUtcMs ?? 0) > 0)
    .slice()
    .sort((a, b) => Number(a.open_time_utc_ms ?? a.openTimeUtcMs) - Number(b.open_time_utc_ms ?? b.openTimeUtcMs));

  const primary = validEntries[0];
  const anchorMs = Number(primary.anchorOpenTimeUtcMs || 0);
  const maxHorizon = Math.max(...validEntries.map((e) => Number(e.horizonBars || e.stepPoints?.length || 15)));

  const histCandles = sortedCandles.filter((c) => Number(c.open_time_utc_ms ?? c.openTimeUtcMs) <= anchorMs).slice(-48);
  const futureCandles = sortedCandles.filter((c) => Number(c.open_time_utc_ms ?? c.openTimeUtcMs) > anchorMs).slice(0, maxHorizon);

  const buildEntryPoints = (entry) => {
    if (Array.isArray(entry.stepPoints) && entry.stepPoints.length > 0) {
      return entry.stepPoints.map((pt, idx) => ({
        stepAhead: Number(pt.step || idx + 1),
        openTimeUtcMs: Number(pt.openTimeUtcMs || 0),
        q10: Number(pt.q10),
        q25: Number(pt.q25 ?? pt.q50),
        q50: Number(pt.q50),
        q75: Number(pt.q75 ?? pt.q50),
        q90: Number(pt.q90),
      }));
    }
    const h = Math.max(1, Number(entry.horizonBars || 15));
    const anc = Number(entry.anchorClose || 0);
    const tQ10 = Number(entry.terminalQ10 || anc);
    const tQ50 = Number(entry.terminalMedian || anc);
    const tQ90 = Number(entry.terminalQ90 || anc);
    const pts = [];
    for (let i = 1; i <= h; i++) {
      const f = i / h;
      pts.push({
        stepAhead: i,
        q10: anc + (tQ10 - anc) * f,
        q25: anc + ((tQ10 + tQ50) * 0.5 - anc) * f,
        q50: anc + (tQ50 - anc) * f,
        q75: anc + ((tQ50 + tQ90) * 0.5 - anc) * f,
        q90: anc + (tQ90 - anc) * f,
      });
    }
    return pts;
  };

  const primaryPoints = buildEntryPoints(primary);
  const secondaryTrajectories = validEntries.slice(1).map((entry, idx) => ({
    modelId: `snap_${entry.seq}_${entry.modelId || idx + 2}`,
    modelName: `#${entry.seq} ${entry.modelName || entry.modelId || 'Model'}`,
    color: LEDGER_OVERLAY_PALETTE[(idx + 1) % LEDGER_OVERLAY_PALETTE.length],
    status: MODEL_EXECUTION_STATUS.SUCCESS,
    points: buildEntryPoints(entry),
  }));

  return {
    histCandles: histCandles.length > 0 ? histCandles : sortedCandles.slice(-48),
    payload: {
      points: primaryPoints,
      actualPoints: futureCandles.map((c) => ({ close: Number(c.close), openTimeUtcMs: Number(c.open_time_utc_ms ?? c.openTimeUtcMs) })),
      selectedChartModelId: primary.modelId || 'AUTO',
      primaryLineColor: LEDGER_OVERLAY_PALETTE[0],
      renderMode: RENDER_MODES.FAN_CHART,
      modelTrajectories: secondaryTrajectories,
      visibleComparisonModelIds: secondaryTrajectories.map((t) => t.modelId),
    },
  };
}

function getMarketConditionLabel(tag, isFa) {
  const norm = String(tag || '').toUpperCase();
  if (norm === 'TRENDING_EDGE') return isFa ? 'رونددار + برتری آماری (Trending + Edge)' : 'TRENDING + EDGE';
  if (norm === 'TRENDING_NO_EDGE') return isFa ? 'رونددار + بدون برتری آماری' : 'TRENDING + NO_EDGE';
  if (norm === 'RANGING_EDGE') return isFa ? 'رنج + برتری آماری (Ranging + Edge)' : 'RANGING + EDGE';
  return isFa ? 'رنج / نوسانی + بدون برتری آماری' : 'RANGING + NO_EDGE';
}

function renderForecastSummaryHeaderCard(fc, activeTab, decimals, isFa) {
  const symbolCode = fc?.symbolCode || activeTab?.symbolCode || 'SPOTBRENT';
  const timeframe = fc?.timeframe || activeTab?.timeframe || 'M15';
  const candles = Array.isArray(activeTab?.candles) ? activeTab.candles : [];
  const currentPrice = candles.length > 0 ? Number(candles[candles.length - 1]?.close || fc?.anchorClose || 0) : Number(fc?.anchorClose || 0);

  const allEntries = defaultForecastLedger.loadEntries().filter((e) => e.symbolCode === symbolCode);
  const allLifecycle = defaultForecastLedger.loadLifecycleEvents();
  const maturedSet = new Set(
    allLifecycle
      .filter((ev) => ev.lifecycleStatus === LIFECYCLE_STATUS.MATURED)
      .map((ev) => `${ev.forecastHash}:${ev.horizonStep}`)
  );
  let pendingCount = 0;
  let maturedCount = 0;
  for (const e of allEntries) {
    if (maturedSet.has(`${e.forecastHash}:${e.horizonBars}`)) maturedCount += 1;
    else pendingCount += 1;
  }

  const st = fc?.status || FORECAST_STATUS.DATA_NOT_READY;
  const plainStatusMap = {
    VALID: isFa ? 'معتبر (هم‌راستا با آزمون آماری)' : 'Statistically Validated',
    PROVISIONAL: isFa ? 'موقت (داده کم یا شرایط غیرعادی OOD)' : 'Provisional (Small Sample or OOD)',
    NO_EDGE: isFa ? 'احتیاط: برتری قطعی نسبت به مدل ساده ندارد' : 'No Proven Edge Over Baseline',
    INSUFFICIENT_EVIDENCE: isFa ? 'شواهد آماری ناکافی در این بازه' : 'Insufficient Historical Sample',
    DATA_NOT_READY: isFa ? 'داده هنوز آماده نیست' : 'Data Not Ready',
  };

  const convergence = computeMultiModelZoneConvergence(fc);
  const convLabel = convergence.modelCount >= 2
    ? isFa
      ? `اجماع ${Math.max(convergence.bullCount, convergence.bearCount)}/${convergence.modelCount} مدل (${convergence.bullCount >= convergence.bearCount ? 'صعودی' : 'نزولی'}) · فاصله هدف ${convergence.targetSpreadPct ?? '—'}% (${convergence.targetLevel === 'TIGHT' ? 'همگرایی بالا' : convergence.targetLevel === 'MODERATE' ? 'متوسط' : 'واگرا'})${convergence.overlappingZones.length > 0 ? ` · ${convergence.overlappingZones.length} زون S/R مشترک` : ''}`
      : `${Math.max(convergence.bullCount, convergence.bearCount)}/${convergence.modelCount} Consensus (${convergence.bullCount >= convergence.bearCount ? 'Bullish' : 'Bearish'}) · Spread ${convergence.targetSpreadPct ?? '—'}% (${convergence.targetLevel})${convergence.overlappingZones.length > 0 ? ` · ${convergence.overlappingZones.length} Overlapping S/R Zone(s)` : ''}`
    : isFa
      ? 'برای سنجش همگرایی، چند مدل فعال را مقایسه کنید'
      : 'Enable 2+ models to measure target & S/R convergence';

  const regimeStr = String(fc?.regime || 'RANGING').toUpperCase();
  const hasEdge = Boolean(fc?.noEdgeGate?.hasEdge) || st === FORECAST_STATUS.VALID;
  const condTag = (regimeStr.includes('TREND') || regimeStr.includes('BULL') || regimeStr.includes('BEAR'))
    ? (hasEdge ? 'TRENDING_EDGE' : 'TRENDING_NO_EDGE')
    : (hasEdge ? 'RANGING_EDGE' : 'RANGING_NO_EDGE');

  return `
    <div class="ci-fc-card" style="margin-bottom:12px;">
      <div class="ci-fc-summary-strip ltr-num">
        <div class="ci-fc-mini-stat">
          <span>${isFa ? 'نماد و تایم‌فریم' : 'Symbol & Timeframe'}</span>
          <strong>${escapeHtml(symbolCode)} · ${escapeHtml(timeframe)}</strong>
        </div>
        <div class="ci-fc-mini-stat">
          <span>${isFa ? 'قیمت فعلی' : 'Current Price'}</span>
          <strong>${currentPrice > 0 ? PriceFormatter.formatPrice(currentPrice, decimals) : '—'}</strong>
        </div>
        <div class="ci-fc-mini-stat">
          <span>${isFa ? 'پیش‌بینی‌های در انتظار' : 'Pending Snapshots'}</span>
          <strong style="color:var(--gold);">${pendingCount}</strong>
        </div>
        <div class="ci-fc-mini-stat">
          <span>${isFa ? 'پیش‌بینی‌های تکمیل‌شده' : 'Matured Outcomes'}</span>
          <strong style="color:var(--bull);">${maturedCount}</strong>
        </div>
        <div class="ci-fc-mini-stat">
          <span>${isFa ? 'شرایط بازار' : 'Market Condition'}</span>
          <strong style="font-size:11px;">${escapeHtml(getMarketConditionLabel(condTag, isFa))}</strong>
        </div>
      </div>
      <div class="row-between" style="margin-top:8px;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--text-muted);">
        <span><strong>${escapeHtml(st)}</strong> — ${escapeHtml(plainStatusMap[st] || st)}</span>
        <span class="ci-fc-family-tag">${escapeHtml(convLabel)}</span>
      </div>
    </div>
  `;
}

export function renderOverviewPanel(fc, activeTab, decimals, isFa, coordView) {
  if (!fc || fc.status === FORECAST_STATUS.DATA_NOT_READY) {
    const reqBars = fc?.readiness?.nOpMin || 155;
    const reasons = (fc?.readiness?.issues || []).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
    return `
      ${renderForecastSummaryHeaderCard(fc, activeTab, decimals, isFa)}
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

  const activeModelTraj = (fc.modelTrajectories || []).find((t) => t.modelId === fc.selectedChartModelId) || null;
  const mtfMeta = activeModelTraj?.meta?.mtfMeta || mtf?.modelMtfMeta || fc.analogDiagnostics?.mtfMeta || null;
  const mtfBannerHtml = mtf
    ? `
      <div class="ci-fc-card" style="margin-bottom:12px;">
        <div class="row-between" style="flex-wrap:wrap;gap:8px;">
          <div>
            <strong style="font-size:12.5px;">${isFa ? 'هماهنگ‌سازی چندتایم‌فریمی (Independent vs Coordinated)' : 'Multi-Timeframe Coordination Check'}</strong>
            <div style="font-size:11px;color:var(--text-muted);" class="ltr-num">
              Higher TF: ${escapeHtml(mtf.referenceTimeframe)} · OHLC Consistent: ${mtf.ohlcConsistent ? 'YES' : 'NO'} · Independent q50: ${mtf.independentMedianPct >= 0 ? '+' : ''}${mtf.independentMedianPct}% vs Coordinated q50: ${mtf.coordinatedMedianPct >= 0 ? '+' : ''}${mtf.coordinatedMedianPct}%${mtfMeta ? ` · Cluster: ${escapeHtml(mtfMeta.clusterId)} (${escapeHtml(mtfMeta.mode)}) · H_ref=${Number(mtfMeta.referenceHorizon || 60)}` : ''}
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
          <span class="ci-fc-family-tag ltr-num">Causal Analogs (Rev 2.3): ${fc.analogDiagnostics?.matchedCount ?? 0} · Embargo +${fc.analogDiagnostics?.embargoGap ?? 0}b · H_ref=${fc.analogDiagnostics?.referenceHorizon ?? 60} · stride=1</span>
        </div>
        <div class="ci-fc-grid-3">
          ${repPaths
            .map((rp) => {
              const lastCloseRp = rp.closes?.[rp.closes.length - 1] ?? fc.anchorClose;
              const diffPct = fc.anchorClose > 0 ? ((lastCloseRp - fc.anchorClose) / fc.anchorClose) * 100 : 0;
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

  const technicalDiagnosticsDrawerHtml = `
    <details class="ci-fc-card ci-fc-accordion" style="margin-bottom:12px;">
      <summary>
        <span>${isFa ? 'جزئیات فنی و آماری (Conformal Calibration، تفکیک Aleatoric/Epistemic، MTF و آنالوگ‌ها)' : 'Technical Calibration, Uncertainty Decomposition, MTF & Analogs (Click to expand)'}</span>
        <span class="ci-fc-family-tag ltr-num">${escapeHtml(conformalCal?.calibrationStatus || 'CALIBRATED')} · OOD ${escapeHtml(unc?.oodStatus || 'IN_DISTRIBUTION')}</span>
      </summary>
      <div class="ci-fc-accordion-body">
        ${conformalBannerHtml}
        ${edgeBannerHtml}
        ${uncertaintyCardHtml}
        ${mtfBannerHtml}
        ${representativePathsHtml}
      </div>
    </details>
  `;

  return `
    ${renderForecastSummaryHeaderCard(fc, activeTab, decimals, isFa)}
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
    ${comparisonChipsHtml}
    ${comparisonCanvasesHtml}

    <div class="ci-fc-card" style="margin-bottom:12px;">
      <div class="row-between" style="margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <strong style="font-size:13px;">${isFa ? 'سناریوهای شرطی کالیبره‌شده V2.1 (بدون کف ساختگی دیریکله)' : '3-Scenario Conditional Logit Event Tree (Zero Synthetic Priors)'}</strong>
        <span class="ci-fc-family-tag ltr-num">Brier OOS: ${fc.scenarioCalibration?.oosBrierModel ?? '—'} vs Clim ${fc.scenarioCalibration?.oosBrierClimatology ?? '—'}</span>
      </div>
      <div class="ci-fc-event-tree-grid">${scenariosHtml}</div>
    </div>

    ${keyZonesHtml ? `<div class="ci-fc-grid-2" style="margin-bottom:12px;">${keyZonesHtml}</div>` : ''}

    <div class="ci-fc-card" style="margin-bottom:12px;">
      <div style="font-size:12.5px;font-weight:700;margin-bottom:8px;">${isFa ? 'نردبان افق پیش‌بینی (میانه q50 و بازه ۸۰٪)' : 'Horizon Step Quantile Ladder (Median q50 & 80% Corridor)'}</div>
      <div class="ci-fc-ladder-grid">${ladderCards}</div>
    </div>

    ${technicalDiagnosticsDrawerHtml}
  `;
}

export function renderModelsPanel(fc, decimals, isFa) {
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

export async function runHistoricalForecastReplay(activeTab, options = {}) {
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
  const selectedModelId = String(
    options.selectedModelId ||
      activeTab.structuralForecastModel ||
      activeTab.selectedForecastModelId ||
      state.chartPreferences.selectedForecastModelId ||
      'AUTO'
  );
  const isStructuralReplay = selectedModelId === 'structural_wave_js';
  const isSmcReplay = selectedModelId === 'smc_prediction_js';
  const minTrainingAnchor = isStructuralReplay || isSmcReplay ? 80 : 154;
  const maxWindows = Math.max(2, Math.min(10, Math.round(Number(options.maxWindows || state.chartPreferences.forecastReplayWindowCount || 3))));
  const fromDate = String(options.fromDate ?? state.chartPreferences.forecastReplayFromDate ?? '').trim();
  const toDate = String(options.toDate ?? state.chartPreferences.forecastReplayToDate ?? '').trim();
  const fromMs = fromDate ? Date.parse(`${fromDate}T00:00:00.000Z`) : null;
  const toMs = toDate ? Date.parse(`${toDate}T23:59:59.999Z`) : null;
  const windows = [];
  const invalidRange = (fromDate && !Number.isFinite(fromMs)) || (toDate && !Number.isFinite(toMs)) || (fromMs != null && toMs != null && fromMs > toMs);
  if (invalidRange) {
    const result = { status: 'INVALID_DATE_RANGE', reason: 'Replay date range is invalid. Use UTC dates with From <= To.', symbolCode: activeTab.symbolCode, timeframe: activeTab.timeframe, horizonBars, selectedModelId, fromDate, toDate, windows: [] };
    state._forecastReplayResult = result;
    return result;
  }

  let firstAnchor = minTrainingAnchor;
  if (fromMs != null) {
    const firstInRange = candles.findIndex((c) => Number(c.open_time_utc_ms || c.openTimeUtcMs || 0) >= fromMs);
    if (firstInRange < 0) firstAnchor = candles.length;
    else firstAnchor = Math.max(firstAnchor, firstInRange);
  }
  let lastAnchor = candles.length - horizonBars - 1;
  if (toMs != null) {
    let lastInRange = -1;
    for (let i = 0; i < candles.length; i++) {
      if (Number(candles[i].open_time_utc_ms || candles[i].openTimeUtcMs || 0) <= toMs) lastInRange = i;
      else break;
    }
    lastAnchor = Math.min(lastAnchor, lastInRange - horizonBars);
  }
  if (firstAnchor > lastAnchor || firstAnchor < minTrainingAnchor) {
    const result = {
      status: 'INSUFFICIENT_HISTORY',
      reason: `The selected range needs ${minTrainingAnchor + 1} training candles and ${horizonBars} future candles after each anchor; available: ${candles.length}.`,
      symbolCode: activeTab.symbolCode,
      timeframe: activeTab.timeframe,
      horizonBars,
      selectedModelId,
      fromDate,
      toDate,
      windows: [],
    };
    state._forecastReplayResult = result;
    return result;
  }
  const anchorIndexes = Array.from({ length: maxWindows }, (_, i) =>
    Math.round(firstAnchor + ((lastAnchor - firstAnchor) * i) / Math.max(1, maxWindows - 1))
  ).filter((value, index, all) => all.indexOf(value) === index);

  defaultForecastRegistry.applyConfig(state.chartPreferences.forecastPluginConfig);
  const needsWalkForwardPerAnchor = selectedModelId === 'AUTO' || selectedModelId === 'ensemble';
  for (const anchorIndex of anchorIndexes) {
    const trainingCandles = candles.slice(0, anchorIndex + 1);
    const actualCandles = candles.slice(anchorIndex + 1, anchorIndex + 1 + horizonBars);
    if (actualCandles.length !== horizonBars) continue;
    // Yield between windows so the chart remains responsive during manual replay.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const anchorTimeUtcMs = Number(trainingCandles[trainingCandles.length - 1]?.open_time_utc_ms || trainingCandles[trainingCandles.length - 1]?.openTimeUtcMs || 0);
    let forecast = null;
    if (isStructuralReplay) {
      const sRes = computeStructuralForecast({
        candles: trainingCandles,
        symbolCode: activeTab.symbolCode,
        provider: activeTab.provider || 'tvdatafeed',
        timeframe: activeTab.timeframe,
        horizonBars,
        nowMs: Math.max(Date.now(), anchorTimeUtcMs + 86400000 * 14),
        skipAnalogs: true,
      });
      if (sRes?.status === 'READY' && Array.isArray(sRes.forecast) && sRes.forecast.length === horizonBars) {
        forecast = {
          status: 'READY',
          selectedChartModelId: 'structural_wave_js',
          inputHash: sRes.series?.context_close_sha256 || '',
          points: sRes.forecast.map((pt) => ({
            stepAhead: pt.step,
            openTimeUtcMs: pt.open_time_utc_ms,
            q10: Number(pt.q10),
            q25: Number(pt.q25),
            q50: Number(pt.q50_median),
            q75: Number(pt.q75),
            q90: Number(pt.q90),
          })),
        };
      } else {
        forecast = {
          status: sRes?.status || 'FAILED',
          selectionReason: sRes?.error || 'Structural JS did not produce a complete path',
          points: [],
        };
      }
    } else if (isSmcReplay) {
      const smcRes = computeSmcPrediction(trainingCandles, null, horizonBars, {
        timeframe: activeTab.timeframe,
        canonicalTimestamps: actualCandles.map((c) => Number(c.open_time_utc_ms || c.openTimeUtcMs || 0)),
      });
      if (smcRes?.status === MODEL_EXECUTION_STATUS.SUCCESS && Array.isArray(smcRes.points) && smcRes.points.length === horizonBars) {
        forecast = {
          status: 'READY',
          selectedChartModelId: 'smc_prediction_js',
          inputHash: '',
          points: smcRes.points,
        };
      } else {
        forecast = {
          status: smcRes?.status || 'FAILED',
          selectionReason: smcRes?.reason || 'SMC Prediction Engine did not produce a complete path',
          points: [],
        };
      }
    } else {
      forecast = ForecastEngine.project(trainingCandles, {
        symbolCode: activeTab.symbolCode,
        providerId: activeTab.provider || 'tvdatafeed',
        timeframe: activeTab.timeframe,
        horizonBars,
        renderMode: normalizeRenderMode(activeTab.forecastRenderMode || state.chartPreferences.forecastRenderMode || RENDER_MODES.FAN_CHART),
        selectedScenarioId: activeTab.selectedScenarioId || state.chartPreferences.selectedScenarioId || 'SCENARIO_A',
        selectedModelId,
        registry: defaultForecastRegistry,
        workerUrl: '',
        skipWalkForward: !needsWalkForwardPerAnchor,
      });
    }

    if (!forecast || forecast.status === FORECAST_STATUS.DATA_NOT_READY || !Array.isArray(forecast.points) || forecast.points.length !== horizonBars) {
      windows.push({
        status: forecast?.status || 'FAILED',
        modelId: forecast?.selectedChartModelId || selectedModelId,
        reason: forecast?.readiness?.issues?.join('; ') || forecast?.selectionReason || 'Forecast did not produce a complete path',
        anchorTimeUtcMs,
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
      anchorTimeUtcMs,
      actualTerminal,
      predictedTerminal,
      mae,
      maePct: anchorClose > 0 ? (mae / anchorClose) * 100 : null,
      coverage80Pct: (covered / horizonBars) * 100,
      directionHit: directionHits === 1,
      inputHash: forecast.inputHash,
      trainingBars: trainingCandles.length,
      actualBars: actualCandles.length,
      historyCandles: trainingCandles.slice(-48).map((c) => ({
        open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
        open_time_utc_ms: Number(c.open_time_utc_ms || c.openTimeUtcMs || 0),
      })),
      forecastPoints: forecast.points,
      actualPoints: actualCandles.map((c) => ({ close: Number(c.close) })),
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
    fromDate,
    toDate,
    maxWindows,
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
  if (scored.length > 0) {
    try {
      const storageKey = 'ci_forecast_replay_history_v1';
      const stored = JSON.parse(globalThis.localStorage?.getItem(storageKey) || '[]');
      const history = Array.isArray(stored) ? stored : [];
      const compactRecord = {
        status: result.status,
        symbolCode: result.symbolCode,
        timeframe: result.timeframe,
        horizonBars: result.horizonBars,
        selectedModelId: result.selectedModelId,
        fromDate: result.fromDate,
        toDate: result.toDate,
        maxWindows: result.maxWindows,
        summary: result.summary,
        generatedAtUtcMs: result.generatedAtUtcMs,
      };
      history.push(compactRecord);
      safeLocalStorageSet(storageKey, JSON.stringify(history.slice(-20)));
    } catch (_) {}
  }
  return result;
}

function renderHistoricalReplaySection(isFa, decimals) {
  const replay = state._forecastReplayResult;
  const activeTab = state.openTabs?.find((item) => item.tabId === state.activeTabId) || state.openTabs?.[0];
  const sameContext = replay && replay.symbolCode === activeTab?.symbolCode && replay.timeframe === activeTab?.timeframe;
  const windowCount = Number(state.chartPreferences.forecastReplayWindowCount || 3);
  const replayFromDate = String(state.chartPreferences.forecastReplayFromDate || '');
  const replayToDate = String(state.chartPreferences.forecastReplayToDate || '');
  const requestedReplayIndex = Math.max(0, Number(state.chartPreferences.forecastReplaySelectedWindow || 0));
  const selectedReplayIndex = sameContext && replay.windows?.length ? Math.min(requestedReplayIndex, replay.windows.length - 1) : 0;
  const selectedReplayWindow = sameContext ? replay.windows?.[selectedReplayIndex] : null;
  let replayHistory = [];
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem('ci_forecast_replay_history_v1') || '[]');
    replayHistory = Array.isArray(stored) ? stored.filter((item) => item.symbolCode === activeTab?.symbolCode && item.timeframe === activeTab?.timeframe).slice(-5).reverse() : [];
  } catch (_) {}
  const rows = sameContext && Array.isArray(replay.windows) ? replay.windows.map((w, index) => `
    <tr>
      <td class="ltr-num"><button type="button" class="chip ${selectedReplayIndex === index ? 'active' : ''}" data-action="set-forecast-replay-window" data-index="${index}">${index + 1}</button></td>
      <td class="ltr-num">${escapeHtml(w.modelId || replay.selectedModelId || '—')}</td>
      <td class="ltr-num">${w.anchorTimeUtcMs ? new Date(w.anchorTimeUtcMs).toISOString().replace('T', ' ').slice(0, 16) : '—'}</td>
      <td class="ltr-num">${escapeHtml(w.status || '—')}</td>
      <td class="ltr-num">${Number.isFinite(w.predictedTerminal) ? PriceFormatter.formatPrice(w.predictedTerminal, decimals) : '—'}</td>
      <td class="ltr-num">${Number.isFinite(w.actualTerminal) ? PriceFormatter.formatPrice(w.actualTerminal, decimals) : '—'}</td>
      <td class="ltr-num">${Number.isFinite(w.maePct) ? w.maePct.toFixed(3) + '%' : '—'}</td>
      <td class="ltr-num">${Number.isFinite(w.coverage80Pct) ? w.coverage80Pct.toFixed(1) + '%' : '—'}</td>
    </tr>`).join('') : '';
  const summary = sameContext && replay.summary ? `
    <div class="ci-fc-ladder-grid ltr-num">
      <div class="ci-fc-mini-stat"><span>Model</span><strong>${escapeHtml(replay.selectedModelId || 'AUTO')}</strong></div>
      <div class="ci-fc-mini-stat"><span>Mean MAE</span><strong>${replay.summary.meanMaePct.toFixed(3)}%</strong></div>
      <div class="ci-fc-mini-stat"><span>80% Coverage</span><strong>${replay.summary.meanCoverage80Pct.toFixed(1)}%</strong></div>
      <div class="ci-fc-mini-stat"><span>Direction Accuracy</span><strong>${replay.summary.directionAccuracyPct.toFixed(1)}%</strong></div>
      <div class="ci-fc-mini-stat"><span>Scored Windows</span><strong>${replay.summary.scoredWindows}</strong></div>
    </div>` : '';
  return `
    <div class="ci-fc-card" style="margin-top:12px;">
      <div class="row-between" style="gap:8px;flex-wrap:wrap;margin-bottom:8px;">
        <div><strong>${isFa ? 'بازپخش تاریخی بدون نشت داده' : 'Historical Replay · Leakage-Safe'}</strong>
          <div style="font-size:11px;color:var(--text-muted);">${isFa ? `${windowCount} مبدأ تاریخی؛ آموزش فقط با کندل‌های قبل از مبدأ و آینده فقط برای امتیازدهی.` : `${windowCount} historical anchors; training uses only candles before each anchor. Future bars are scoring-only.`}</div>
        </div>
        <div class="chip-group"><span class="ci-fc-ctrl-label">${isFa ? 'تعداد مبدأ:' : 'Windows:'}</span>${[3,5,10].map((count) => `<button type="button" class="chip ${windowCount === count ? 'active' : ''}" data-action="set-forecast-replay-windows" data-windows="${count}">${count}</button>`).join('')}</div>
        <button type="button" class="btn btn-sm btn-primary" data-action="run-forecast-replay" ${sameContext && replay.status === 'RUNNING' ? 'disabled' : ''}>${isFa ? 'اجرای بازپخش تاریخی' : 'Run Historical Replay'}</button>
        <button type="button" class="btn btn-sm" data-action="toggle-forecast-replay-playback" ${sameContext && replay.windows?.length > 1 ? '' : 'disabled'}>${state._forecastReplayPlaying ? (isFa ? 'توقف پخش' : 'Pause Playback') : (isFa ? 'پخش خودکار' : 'Play Replay')}</button>
      </div>
      <div class="row-between" style="gap:8px;flex-wrap:wrap;margin:8px 0;">
        <label class="ci-fc-param-item ltr-num"><span>${isFa ? 'از تاریخ UTC' : 'From UTC'}</span><input type="date" id="ci-forecast-replay-from" value="${escapeHtml(replayFromDate)}" /></label>
        <label class="ci-fc-param-item ltr-num"><span>${isFa ? 'تا تاریخ UTC' : 'To UTC'}</span><input type="date" id="ci-forecast-replay-to" value="${escapeHtml(replayToDate)}" /></label>
      </div>
      ${sameContext ? `<span class="ci-fc-status-badge ${replay.status === 'COMPLETED' ? 'ci-fc-badge-valid' : 'ci-fc-badge-provisional'} ltr-num">${escapeHtml(replay.status)}</span><p style="font-size:11px;color:var(--text-muted);">${escapeHtml(replay.reason)}</p>${summary}<div style="overflow-x:auto;margin-top:8px;"><table class="ci-fc-table"><thead><tr><th>#</th><th>Model</th><th>Anchor UTC</th><th>Status</th><th>Predicted</th><th>Actual</th><th>MAE %</th><th>80% Cov.</th></tr></thead><tbody>${rows}</tbody></table></div>${selectedReplayWindow?.forecastPoints?.length ? `<div class="row-between" style="margin-top:10px;gap:8px;flex-wrap:wrap;"><strong>${isFa ? 'مسیر پیش‌بینی در برابر مسیر واقعی' : 'Forecast vs Actual · Selected Replay Window'}</strong><span class="ltr-num">${selectedReplayIndex + 1}/${replay.windows.length}</span></div><canvas id="forecast-replay-canvas" class="ci-fc-preview-canvas" style="margin-top:8px;min-height:220px;"></canvas><div style="font-size:10px;color:var(--text-muted);">${isFa ? 'خط بنفش/نارنجی: میانه پیش‌بینی · خط خاکستری نقطه‌چین: قیمت واقعی بعد از مبدأ' : 'Dashed forecast median vs dotted realized closes after the historical anchor.'}</div>` : ''}` : `<p style="font-size:11px;color:var(--text-muted);">${isFa ? 'برای نماد و تایم‌فریم فعلی هنوز بازپخش اجرا نشده است.' : 'No replay has been run for the current symbol/timeframe.'}</p>`}
      ${replayHistory.length ? `<div style="overflow-x:auto;margin-top:12px;"><strong style="font-size:11.5px;">${isFa ? 'مقایسه اجراهای ذخیره‌شده' : 'Saved Replay Run Comparison'}</strong><table class="ci-fc-table"><thead><tr><th>${isFa ? 'زمان UTC' : 'Run UTC'}</th><th>Model</th><th>${isFa ? 'بازه' : 'Range'}</th><th>${isFa ? 'وضعیت' : 'Status'}</th><th>MAE %</th><th>80% Cov.</th><th>Dir. Acc.</th></tr></thead><tbody>${replayHistory.map((item) => `<tr><td class="ltr-num">${new Date(item.generatedAtUtcMs).toISOString().slice(0, 16).replace('T', ' ')}</td><td class="ltr-num">${escapeHtml(item.selectedModelId || 'AUTO')}</td><td class="ltr-num">${escapeHtml(item.fromDate || '—')} → ${escapeHtml(item.toDate || '—')}</td><td class="ltr-num">${escapeHtml(item.status)}</td><td class="ltr-num">${item.summary ? item.summary.meanMaePct.toFixed(3) + '%' : '—'}</td><td class="ltr-num">${item.summary ? item.summary.meanCoverage80Pct.toFixed(1) + '%' : '—'}</td><td class="ltr-num">${item.summary ? item.summary.directionAccuracyPct.toFixed(1) + '%' : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>
  `;
}

export function renderBacktestPanel(fc, decimals, isFa) {
  const wf = fc?.walkForward;
  if (!wf || wf.evaluatedWindows === 0 || !wf.ensembleMetrics) {
    return `
      <div class="ci-fc-card" style="padding:24px;text-align:center;">
        <strong>${isFa ? 'ارزیابی Nested Walk-Forward نیاز به تاریخچه بیشتر دارد' : 'Nested Walk-Forward Backtest Unavailable'}</strong>
        <p style="color:var(--text-muted);font-size:12.5px;">${escapeHtml(wf?.acceptanceReason || 'Need >= N_op_min clean bars (155 for H=10, 1248+ for H=30 statistical gate) to execute disjoint 4-way purged walk-forward.')}</p>
      </div>
      ${renderHistoricalReplaySection(isFa, decimals)}
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

    ${renderHistoricalReplaySection(isFa, decimals)}

    <details class="ci-fc-card ci-fc-accordion" style="margin-top:12px;">
      <summary>
        <span>${isFa ? 'جدول‌های خام بنچمارک Walk-Forward و ماتریس حساسیت (کلیک برای باز/بسته شدن)' : 'Raw Walk-Forward Model Benchmark Table & Sensitivity Grid (Click to expand)'}</span>
        <span class="ci-fc-family-tag ltr-num">${(wf.modelBenchmarks || []).length + 1} rows · ${sensRows ? sensGrid.length : 0} sensitivity cells</span>
      </summary>
      <div class="ci-fc-accordion-body">
        <div style="overflow-x:auto;margin-bottom:12px;">
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
          <div style="overflow-x:auto;">
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
      </div>
    </details>
  `;
}

export function renderLedgerPanel(decimals, isFa) {
  const rawEntries = defaultForecastLedger.loadEntries();
  const rawEvents = defaultForecastLedger.loadLifecycleEvents();
  const audit = defaultForecastLedger.verifyChain();
  const lcAudit = defaultForecastLedger.verifyLifecycleChain();
  const serverEntries = Array.isArray(state.forecastServerLedger) ? state.forecastServerLedger : [];
  const serverLifecycle = Array.isArray(state.forecastServerLifecycle) ? state.forecastServerLifecycle : [];

  const activeTab = state.openTabs?.find((item) => item.tabId === state.activeTabId) || state.openTabs?.[0] || null;
  const activeSymbol = activeTab?.symbolCode || '';

  // Map terminal/latest lifecycle event per forecastHash
  const lifecycleByHash = new Map();
  const terminalByHash = new Map();
  for (const ev of rawEvents) {
    lifecycleByHash.set(ev.forecastHash, ev);
    if (ev.lifecycleStatus === LIFECYCLE_STATUS.MATURED) {
      const prev = terminalByHash.get(ev.forecastHash);
      if (!prev || Number(ev.horizonStep) >= Number(prev.horizonStep)) {
        terminalByHash.set(ev.forecastHash, ev);
      }
    }
  }

  // Enrich each entry with resolved status, timestamps, and 5D evaluation
  const enrichedAll = rawEntries.map((e) => {
    const termEv = terminalByHash.get(e.forecastHash);
    const latestEv = lifecycleByHash.get(e.forecastHash);
    const isFullMatured = Boolean(termEv && Number(termEv.horizonStep) === Number(e.horizonBars));
    const evalDetails = termEv?.evaluationDetails || latestEv?.evaluationDetails || null;
    const isEarlyInvalidated = Boolean(evalDetails?.earlyInvalidated);
    const isAmbiguous = latestEv?.evaluationOutcome === EVALUATION_OUTCOME.AMBIGUOUS;
    const isSuperseded = !isFullMatured && latestEv?.lifecycleStatus === LIFECYCLE_STATUS.SUPERSEDED;

    let displayStatus = 'PENDING';
    if (isFullMatured && isAmbiguous) displayStatus = 'AMBIGUOUS';
    else if (isFullMatured && isEarlyInvalidated) displayStatus = 'INVALIDATED_EARLY';
    else if (isFullMatured) displayStatus = 'MATURED';
    else if (isSuperseded) displayStatus = 'SUPERSEDED';

    return {
      entry: e,
      termEv,
      latestEv,
      evalDetails,
      isFullMatured,
      displayStatus,
      tfHorizonKey: `${e.timeframe} | +${e.horizonBars}b`,
      modelKey: String(e.modelId || 'AUTO'),
      modelLabel: String(e.modelName || e.modelId || 'AUTO'),
      hasEdge: String(e.marketConditionTag || '').endsWith('_EDGE') && !String(e.marketConditionTag || '').endsWith('_NO_EDGE'),
    };
  });

  // Group multi-model batches (deduplicating repeated identical modelId entries per batch)
  const batchMap = new Map();
  for (const item of enrichedAll) {
    const bId = String(item.entry.batchId || '');
    if (!bId) continue;
    if (!batchMap.has(bId)) batchMap.set(bId, []);
    batchMap.get(bId).push(item);
  }
  const distinctBatchMap = new Map();
  for (const [bId, items] of batchMap.entries()) {
    const byModel = new Map();
    for (const it of items) {
      byModel.set(it.modelKey, it);
    }
    distinctBatchMap.set(bId, Array.from(byModel.values()));
  }
  const multiModelBatches = Array.from(distinctBatchMap.entries())
    .filter(([, items]) => items.length >= 2)
    .reverse();

  // Read filters from state
  const filters = state._forecastLedgerFilters || { model: 'ALL', tfHorizon: 'ALL', status: 'ALL', condition: 'ALL' };
  const modelOptions = [...new Set(enrichedAll.map((i) => i.modelKey))];
  const tfHorizonOptions = [...new Set(enrichedAll.map((i) => i.tfHorizonKey))];

  const filteredItems = enrichedAll
    .slice()
    .reverse()
    .filter((item) => {
      if (filters.model !== 'ALL' && item.modelKey !== filters.model) return false;
      if (filters.tfHorizon !== 'ALL' && item.tfHorizonKey !== filters.tfHorizon) return false;
      if (filters.condition === 'EDGE_ONLY' && !item.hasEdge) return false;
      if (filters.condition === 'NO_EDGE_ONLY' && item.hasEdge) return false;
      if (filters.status === 'PENDING' && item.isFullMatured) return false;
      if (filters.status === 'MATURED' && !item.isFullMatured) return false;
      if (filters.status === 'BATCH_ONLY') {
        const bItems = distinctBatchMap.get(String(item.entry.batchId || ''));
        if (!bItems || bItems.length < 2) return false;
      }
      return true;
    });

  const pendingTotal = enrichedAll.filter((i) => !i.isFullMatured).length;
  const maturedTotal = enrichedAll.filter((i) => i.isFullMatured).length;
  const currentOverlayHashes = Array.isArray(state._ledgerOverlayHashes) ? state._ledgerOverlayHashes : [];

  // Rolling Scorecards
  const scorecards = defaultForecastLedger.buildModelScorecards(20, activeSymbol);
  const scorecardsHtml = scorecards.length > 0
    ? `
      <div class="ci-fc-card" style="margin-bottom:12px;">
        <div class="row-between" style="margin-bottom:8px;gap:8px;flex-wrap:wrap;">
          <strong style="font-size:13px;">${isFa ? 'کارنامه تجمیعی مدل‌ها (آخرین ۲۰ پیش‌بینی تکمیل‌شده)' : 'Rolling Model Scorecards (Last 20 Matured Outcomes)'}</strong>
          <span class="ci-fc-family-tag ltr-num">${scorecards.length} ${isFa ? 'مدل' : 'models'} · ${activeSymbol || 'ALL'}</span>
        </div>
        <div class="ci-fc-scorecard-grid ltr-num">
          ${scorecards
            .map((sc) => {
              const scoreColor =
                sc.meanScore == null
                  ? 'var(--text-muted)'
                  : sc.meanScore >= 70
                    ? 'var(--bull)'
                    : sc.meanScore >= 45
                      ? 'var(--gold)'
                      : 'var(--bear)';
              return `
                <div class="ci-fc-mini-stat" style="text-align:left;padding:10px;gap:5px;">
                  <div class="row-between" style="gap:6px;">
                    <strong style="font-size:12px;color:var(--text-strong);">${escapeHtml(sc.modelName)}</strong>
                    <span class="ci-fc-status-badge ${sc.meanScore >= 70 ? 'ci-fc-badge-valid' : sc.meanScore >= 45 ? 'ci-fc-badge-provisional' : 'ci-fc-badge-blocked'}" style="color:${scoreColor};">
                      ${sc.meanScore != null ? `${sc.meanScore}/100` : 'Pending'}
                    </span>
                  </div>
                  <div style="font-size:11px;color:var(--text-muted);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;">
                    <span>Dir Acc: <strong>${sc.directionAccuracyPct != null ? sc.directionAccuracyPct + '%' : '—'}</strong></span>
                    <span>Band Hit: <strong>${sc.meanHitRatePct != null ? sc.meanHitRatePct + '%' : '—'}</strong></span>
                    <span>Contain: <strong>${sc.containmentRatePct != null ? sc.containmentRatePct + '%' : '—'}</strong></span>
                    <span>Err ATR: <strong>${sc.meanVolAdjErrorAtr != null ? sc.meanVolAdjErrorAtr + '×' : '—'}</strong></span>
                    <span>vs Naive: <strong>${sc.baselineBeatRatePct != null ? sc.baselineBeatRatePct + '%' : '—'}</strong></span>
                    <span>Best: <strong>${escapeHtml(sc.bestContext)}</strong></span>
                  </div>
                  <div style="font-size:10px;color:var(--text-muted);">
                    Matured: <strong>${sc.maturedCount}</strong> · Pending: <strong>${sc.pendingCount}</strong>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `
    : '';

  // History Filter Bar
  const filterBarHtml = `
    <div class="ci-fc-filter-bar ltr-num">
      <label class="ci-fc-param-item">
        <span>${isFa ? 'فیلتر مدل' : 'Model Filter'}</span>
        <select class="input-field" style="min-height:30px;font-size:11.5px;" data-action="set-forecast-ledger-filter" data-filter-key="model">
          <option value="ALL" ${filters.model === 'ALL' ? 'selected' : ''}>${isFa ? 'همه مدل‌ها' : 'All Models'}</option>
          ${modelOptions.map((m) => `<option value="${escapeHtml(m)}" ${filters.model === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
        </select>
      </label>
      <label class="ci-fc-param-item">
        <span>${isFa ? 'تایم‌فریم و افق' : 'TF & Horizon'}</span>
        <select class="input-field" style="min-height:30px;font-size:11.5px;" data-action="set-forecast-ledger-filter" data-filter-key="tfHorizon">
          <option value="ALL" ${filters.tfHorizon === 'ALL' ? 'selected' : ''}>${isFa ? 'همه افق‌ها' : 'All TF / Horizons'}</option>
          ${tfHorizonOptions.map((k) => `<option value="${escapeHtml(k)}" ${filters.tfHorizon === k ? 'selected' : ''}>${escapeHtml(k)}</option>`).join('')}
        </select>
      </label>
      <label class="ci-fc-param-item">
        <span>${isFa ? 'وضعیت' : 'Status'}</span>
        <select class="input-field" style="min-height:30px;font-size:11.5px;" data-action="set-forecast-ledger-filter" data-filter-key="status">
          <option value="ALL" ${filters.status === 'ALL' ? 'selected' : ''}>${isFa ? 'همه وضعیت‌ها' : 'All Statuses'}</option>
          <option value="PENDING" ${filters.status === 'PENDING' ? 'selected' : ''}>${isFa ? 'در انتظار سررسید (Pending)' : 'Pending Only'}</option>
          <option value="MATURED" ${filters.status === 'MATURED' ? 'selected' : ''}>${isFa ? 'تکمیل‌شده (Matured)' : 'Matured Only'}</option>
          <option value="BATCH_ONLY" ${filters.status === 'BATCH_ONLY' ? 'selected' : ''}>${isFa ? 'فقط گروهی چندمدله' : 'Multi-Model Batches Only'}</option>
        </select>
      </label>
      <label class="ci-fc-param-item">
        <span>${isFa ? 'شرایط بازار' : 'Market Condition'}</span>
        <select class="input-field" style="min-height:30px;font-size:11.5px;" data-action="set-forecast-ledger-filter" data-filter-key="condition">
          <option value="ALL" ${filters.condition === 'ALL' ? 'selected' : ''}>${isFa ? 'همه شرایط' : 'All Conditions'}</option>
          <option value="EDGE_ONLY" ${filters.condition === 'EDGE_ONLY' ? 'selected' : ''}>${isFa ? 'فقط با برتری آماری (EDGE)' : 'Edge Only'}</option>
          <option value="NO_EDGE_ONLY" ${filters.condition === 'NO_EDGE_ONLY' ? 'selected' : ''}>${isFa ? 'بدون برتری آماری (NO_EDGE)' : 'No-Edge Only'}</option>
        </select>
      </label>
    </div>
  `;

  // Unified Snapshot <-> 5D Outcome Table Rows
  const unifiedRowsHtml = filteredItems.length === 0
    ? `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:18px;">${isFa ? 'رکوردی مطابق فیلتر انتخاب‌شده یافت نشد.' : 'No recorded forecast snapshots match the active filters.'}</td></tr>`
    : filteredItems
        .map((item) => {
          const e = item.entry;
          const d = item.evalDetails;
          const bId = String(e.batchId || '');
          const isBatch = (distinctBatchMap.get(bId)?.length || 0) >= 2;
          const stepMs = Number(PriceFormatter.stepMilliseconds?.(e.timeframe || 'M15') || 900000);
          const inferredMaturesMs =
            Number(e.maturesAtUtcMs) > 0
              ? Number(e.maturesAtUtcMs)
              : Number(e.anchorOpenTimeUtcMs) > 0
                ? Number(e.anchorOpenTimeUtcMs) + Number(e.horizonBars || 15) * stepMs
                : 0;
          const recordedFull = formatUtcDateTimeShort(e.recordedAtUtcMs || e.generatedAtUtcMs);
          const recordedShort = formatUtcCompactShort(e.recordedAtUtcMs || e.generatedAtUtcMs);
          const maturesFull = formatUtcDateTimeShort(inferredMaturesMs);
          const maturesShort = formatUtcCompactShort(inferredMaturesMs);
          const evaluatedFull = item.isFullMatured && item.termEv ? formatUtcDateTimeShort(item.termEv.recordedAtUtcMs) : '—';
          const evaluatedShort = item.isFullMatured && item.termEv ? formatUtcCompactShort(item.termEv.recordedAtUtcMs) : '—';
          const predPct = e.anchorClose > 0 ? ((e.terminalMedian - e.anchorClose) / e.anchorClose) * 100 : 0;
          // Only display observed close from an actual MATURED event, never from SUPERSEDED anchor close!
          const obsClose = item.isFullMatured && item.termEv?.observedClose != null ? Number(item.termEv.observedClose) : null;
          const obsPct = obsClose != null && e.anchorClose > 0 ? ((obsClose - e.anchorClose) / e.anchorClose) * 100 : null;
          const partialStep = !item.isFullMatured && item.termEv ? Number(item.termEv.horizonStep || 0) : 0;
          const overlayChecked = currentOverlayHashes.includes(e.forecastHash);

          const legacyContained = obsClose != null ? obsClose >= Number(e.terminalQ10) && obsClose <= Number(e.terminalQ90) : false;
          const legacyDirHit =
            obsClose != null
              ? (Number(e.terminalMedian) >= Number(e.anchorClose)) === (obsClose >= Number(e.anchorClose))
              : false;
          const legacyErrPct =
            obsClose != null && Number(e.anchorClose) > 0
              ? (Math.abs(obsClose - Number(e.terminalMedian)) / Number(e.anchorClose)) * 100
              : null;
          const legacyNaiveErr = obsClose != null ? Math.abs(obsClose - Number(e.anchorClose)) : 0;
          const legacyModelErr = obsClose != null ? Math.abs(obsClose - Number(e.terminalMedian)) : 0;
          const legacyBeatsNaive = obsClose != null ? legacyModelErr <= legacyNaiveErr : false;
          const legacyEdgePct =
            legacyNaiveErr > 1e-8 ? ((legacyNaiveErr - legacyModelErr) / legacyNaiveErr) * 100 : 0;
          const legacyScore = legacyContained ? 75 : 30;

          let statusBadgeClass = 'ci-fc-badge-provisional';
          let statusBadgeText = isFa ? 'در انتظار' : 'Pending';
          if (item.displayStatus === 'MATURED') {
            const contained = d ? Boolean(d.terminalInsideBand) : legacyContained;
            statusBadgeClass = contained ? 'ci-fc-badge-valid' : 'ci-fc-badge-blocked';
            statusBadgeText = isFa ? 'تکمیل‌شده' : 'Matured';
          } else if (item.displayStatus === 'INVALIDATED_EARLY') {
            statusBadgeClass = 'ci-fc-badge-blocked';
            statusBadgeText = isFa ? `نقض (+${d?.earlyInvalidatedAtStep}b)` : `Invalid (+${d?.earlyInvalidatedAtStep}b)`;
          } else if (item.displayStatus === 'AMBIGUOUS') {
            statusBadgeClass = 'ci-fc-badge-provisional';
            statusBadgeText = isFa ? 'مبهم' : 'Ambiguous';
          } else if (item.displayStatus === 'SUPERSEDED') {
            statusBadgeClass = 'ci-fc-badge-provisional';
            statusBadgeText = isFa ? 'جایگزین‌شده' : 'Superseded';
          }

          let eval5dHtml = `<span style="color:var(--text-muted);font-size:10.5px;">${
            partialStep > 0
              ? (isFa ? `در جریان (+${partialStep}/${e.horizonBars}b)` : `In progress (+${partialStep}/${e.horizonBars}b)`)
              : (isFa ? 'منتظر سررسید' : 'Awaiting maturity')
          }</span>`;

          if (d) {
            eval5dHtml = `
              <div class="ci-fc-eval5d-cell">
                <div>
                  <span style="color:${d.directionHit ? 'var(--bull)' : 'var(--bear)'};font-weight:700;">${d.directionHit ? '✓ Trend' : '✗ Trend'}</span>
                  · Hit <strong>${d.insideCount}/${d.totalBars}</strong> (${d.hitRatePct}%)
                  · <strong style="color:${d.overallScore >= 70 ? 'var(--bull)' : d.overallScore >= 45 ? 'var(--gold)' : 'var(--bear)'};">${d.overallScore}/100</strong>
                </div>
                <div style="color:var(--text-muted);">
                  MAE ${d.q50MaePct}% (${d.volAdjustedMaeAtr}×ATR) · Naive <strong style="color:${d.beatsBaseline ? 'var(--bull)' : 'var(--bear)'};">${d.edgeVsNaivePct >= 0 ? '+' : ''}${d.edgeVsNaivePct}%</strong> · S/R ${escapeHtml(d.srSummaryStatus)}
                </div>
              </div>
            `;
          } else if (item.isFullMatured && obsClose != null) {
            eval5dHtml = `
              <div class="ci-fc-eval5d-cell">
                <div>
                  <span style="color:${legacyDirHit ? 'var(--bull)' : 'var(--bear)'};font-weight:700;">${legacyDirHit ? '✓ Trend' : '✗ Trend'}</span>
                  · Band <strong>${legacyContained ? 'IN' : 'OUT'}</strong>
                  · <strong style="color:${legacyScore >= 70 ? 'var(--bull)' : 'var(--bear)'};">${legacyScore}/100</strong>
                </div>
                <div style="color:var(--text-muted);">
                  Err ${legacyErrPct != null ? legacyErrPct.toFixed(2) + '%' : '—'} · Naive <strong style="color:${legacyBeatsNaive ? 'var(--bull)' : 'var(--bear)'};">${legacyEdgePct >= 0 ? '+' : ''}${legacyEdgePct.toFixed(1)}%</strong> · Legacy
                </div>
              </div>
            `;
          }

          return `
            <tr>
              <td class="ltr-num"><input type="checkbox" data-action="toggle-ledger-overlay-entry" data-hash="${escapeHtml(e.forecastHash)}" ${overlayChecked ? 'checked' : ''} aria-label="Overlay forecast #${e.seq}" /></td>
              <td class="ltr-num">
                <strong>#${e.seq}</strong>
                ${
                  isBatch
                    ? `<div><button type="button" class="chip ${state._selectedForecastBatchId === bId ? 'active' : ''}" style="font-size:9px;padding:1px 5px;min-height:17px;" data-action="select-forecast-batch" data-batch-id="${escapeHtml(bId)}" title="${escapeHtml(bId)}">BATCH</button></div>`
                    : `<div style="font-size:9px;color:var(--text-muted);" title="${escapeHtml(bId)}">SNAP</div>`
                }
              </td>
              <td class="ltr-num ci-fc-wrap-cell">
                <strong>${escapeHtml(item.modelLabel)}</strong>
                <div style="font-size:9.5px;color:var(--text-muted);">${escapeHtml(getMarketConditionLabel(e.marketConditionTag, false))}</div>
              </td>
              <td class="ltr-num" title="${escapeHtml(recordedFull)} UTC">
                <div>${escapeHtml(recordedShort)}</div>
                <div style="font-size:9.5px;color:var(--text-muted);">Anc ${PriceFormatter.formatPrice(e.anchorClose, decimals)}</div>
              </td>
              <td class="ltr-num" title="Due ${escapeHtml(maturesFull)} UTC">
                <div><strong>${escapeHtml(e.symbolCode)}</strong> ${escapeHtml(e.timeframe)} +${e.horizonBars}b</div>
                <div style="font-size:9.5px;color:var(--text-muted);">Due ${escapeHtml(maturesShort)}</div>
              </td>
              <td class="ltr-num">
                <div><strong>${PriceFormatter.formatPrice(e.terminalMedian, decimals)}</strong> <span style="color:${predPct >= 0 ? 'var(--bull)' : 'var(--bear)'};">(${predPct >= 0 ? '+' : ''}${predPct.toFixed(2)}%)</span></div>
                <div style="font-size:9.5px;color:var(--text-muted);">[${PriceFormatter.formatPrice(e.terminalQ10, decimals)}..${PriceFormatter.formatPrice(e.terminalQ90, decimals)}]</div>
              </td>
              <td class="ltr-num" title="${escapeHtml(evaluatedFull)}">
                <div>${obsClose != null ? `<strong>${PriceFormatter.formatPrice(obsClose, decimals)}</strong> <span style="color:${obsPct >= 0 ? 'var(--bull)' : 'var(--bear)'};">(${obsPct >= 0 ? '+' : ''}${obsPct.toFixed(2)}%)</span>` : '—'}</div>
                <div style="font-size:9.5px;color:var(--text-muted);">${escapeHtml(evaluatedShort)}</div>
              </td>
              <td class="ltr-num ci-fc-wrap-cell">${eval5dHtml}</td>
              <td class="ltr-num"><span class="ci-fc-status-badge ${statusBadgeClass}">${escapeHtml(statusBadgeText)}</span></td>
            </tr>
          `;
        })
        .join('');

  // Side-by-Side Batch Comparison Section (distinct models per batch only)
  const selectedBatchId =
    state._selectedForecastBatchId && (distinctBatchMap.get(state._selectedForecastBatchId)?.length || 0) >= 2
      ? state._selectedForecastBatchId
      : multiModelBatches[0]?.[0] || '';
  const selectedBatchItems = selectedBatchId ? (distinctBatchMap.get(selectedBatchId) || []) : [];

  let batchComparisonHtml = '';
  if (multiModelBatches.length > 0 && selectedBatchItems.length >= 2) {
    let bestItem = null;
    let bestScore = -1;
    for (const item of selectedBatchItems) {
      const sc = Number(item.evalDetails?.overallScore ?? -1);
      if (sc > bestScore) {
        bestScore = sc;
        bestItem = item;
      }
    }

    const batchSelectorPills = multiModelBatches
      .slice(0, 6)
      .map(([bId, items]) => {
        const sample = items[0].entry;
        const label = `${sample.symbolCode} ${sample.timeframe} +${sample.horizonBars}b (${items.length} models · ${formatUtcDateTimeShort(sample.recordedAtUtcMs)})`;
        return `<button type="button" class="chip ${selectedBatchId === bId ? 'active' : ''}" data-action="select-forecast-batch" data-batch-id="${escapeHtml(bId)}">${escapeHtml(label)}</button>`;
      })
      .join('');

    const colHeaders = selectedBatchItems
      .map((item) => {
        const isWinner = bestItem && bestItem.entry.forecastHash === item.entry.forecastHash && bestScore >= 0;
        return `
          <th>
            <div>${escapeHtml(item.modelLabel)}</div>
            ${isWinner ? `<span class="ci-fc-batch-winner-badge">★ ${isFa ? 'برنده گروه' : 'Best Performer'}</span>` : ''}
          </th>
        `;
      })
      .join('');

    const makeRow = (label, fn) => `<tr><td><strong>${escapeHtml(label)}</strong></td>${selectedBatchItems.map((it) => `<td class="ltr-num">${fn(it)}</td>`).join('')}</tr>`;

    batchComparisonHtml = `
      <div class="ci-fc-card" style="margin-bottom:12px;">
        <div class="row-between" style="margin-bottom:8px;gap:8px;flex-wrap:wrap;">
          <div>
            <strong style="font-size:13px;">${isFa ? 'مقایسه کنار هم چند مدل (Batch Comparison)' : 'Side-by-Side Multi-Model Batch Comparison'}</strong>
            <div style="font-size:11px;color:var(--text-muted);" class="ltr-num">Batch: ${escapeHtml(selectedBatchId)} · Recorded ${escapeHtml(formatUtcDateTimeShort(selectedBatchItems[0].entry.recordedAtUtcMs))} · Anchor ${PriceFormatter.formatPrice(selectedBatchItems[0].entry.anchorClose, decimals)}</div>
          </div>
          <div class="chip-group" style="flex-wrap:wrap;">${batchSelectorPills}</div>
        </div>
        <div style="overflow-x:auto;">
          <table class="ci-fc-table">
            <thead>
              <tr>
                <th>${isFa ? 'معیار ارزیابی' : 'Evaluation Metric'}</th>
                ${colHeaders}
              </tr>
            </thead>
            <tbody>
              ${makeRow(isFa ? 'هدف Q50 در برابر کلوز واقعی' : 'Q50 Target vs Actual Close', (it) => {
                const target = PriceFormatter.formatPrice(it.entry.terminalMedian, decimals);
                const actual = it.termEv?.observedClose != null ? PriceFormatter.formatPrice(it.termEv.observedClose, decimals) : 'Pending';
                return `${target} vs <strong>${actual}</strong>`;
              })}
              ${makeRow(isFa ? 'دقت جهت و روند' : 'Trend Accuracy', (it) => {
                if (!it.evalDetails) return 'Pending';
                const col = it.evalDetails.directionHit ? 'var(--bull)' : 'var(--bear)';
                return `<span style="color:${col};font-weight:700;">${it.evalDetails.directionHit ? '✓ Correct' : '✗ Wrong'}</span> (${it.evalDetails.actualPctChange >= 0 ? '+' : ''}${it.evalDetails.actualPctChange}% vs ${it.evalDetails.predPctChange >= 0 ? '+' : ''}${it.evalDetails.predPctChange}%)`;
              })}
              ${makeRow(isFa ? 'کندل‌های داخل بازه [q10..q90]' : 'Candles Inside Band', (it) =>
                it.evalDetails ? `<strong>${it.evalDetails.insideCount}/${it.evalDetails.totalBars}</strong> (${it.evalDetails.hitRatePct}%)` : 'Pending'
              )}
              ${makeRow(isFa ? 'خطای میانگین (MAE% & ×ATR)' : 'Price Error (MAE% & ×ATR)', (it) =>
                it.evalDetails ? `${it.evalDetails.q50MaePct}% · <strong>${it.evalDetails.volAdjustedMaeAtr}× ATR</strong>` : 'Pending'
              )}
              ${makeRow(isFa ? 'برتری نسبت به مدل پایه (Naive)' : 'vs Naive Baseline', (it) => {
                if (!it.evalDetails) return 'Pending';
                const col = it.evalDetails.beatsBaseline ? 'var(--bull)' : 'var(--bear)';
                return `<span style="color:${col};font-weight:700;">${it.evalDetails.edgeVsNaivePct >= 0 ? '+' : ''}${it.evalDetails.edgeVsNaivePct}%</span>`;
              })}
              ${makeRow(isFa ? 'واکنش سطوح S/R' : 'S/R Zone Reaction', (it) =>
                it.evalDetails ? escapeHtml(it.evalDetails.srSummaryStatus) : 'Pending'
              )}
              ${makeRow(isFa ? 'امتیاز کل پیش‌بینی (۰–۱۰۰)' : 'Overall Score (0–100)', (it) =>
                it.evalDetails ? `<strong>${it.evalDetails.overallScore}/100</strong>` : 'Pending'
              )}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // Visual Replay Overlay Selection (aligned 1-to-1 with app.js canvas colors & target filter)
  const rawOverlayCandidates = currentOverlayHashes.length > 0
    ? rawEntries.filter((e) => currentOverlayHashes.includes(e.forecastHash))
    : selectedBatchItems.length >= 2
      ? selectedBatchItems.map((i) => i.entry).slice(0, 4)
      : rawEntries.slice(-2);
  const firstOverlaySym = rawOverlayCandidates[0]?.symbolCode || activeSymbol;
  const firstOverlayTf = rawOverlayCandidates[0]?.timeframe || activeTab?.timeframe || 'M15';
  const overlayCandidates = rawOverlayCandidates
    .filter((e) => e.symbolCode === firstOverlaySym && e.timeframe === firstOverlayTf)
    .slice(0, 4);

  const visualOverlayLegend = overlayCandidates
    .map((e, idx) => {
      const col = LEDGER_OVERLAY_PALETTE[idx % LEDGER_OVERLAY_PALETTE.length];
      return `<span class="ci-fc-family-tag ltr-num" style="border-color:${col};color:${col};">#${e.seq} ${escapeHtml(e.modelName || e.modelId || 'AUTO')}</span>`;
    })
    .join('');

  const visualOverlayHtml = overlayCandidates.length > 0
    ? `
      <div class="ci-fc-card" style="margin-bottom:12px;">
        <div class="row-between" style="margin-bottom:8px;gap:8px;flex-wrap:wrap;">
          <div>
            <strong style="font-size:13px;">${isFa ? 'بازپخش بصری مسیر مدل‌های ثبت‌شده روی کندل‌های واقعی' : 'Visual Replay Overlay · Recorded Models vs Realized Candles'}</strong>
            <div style="font-size:11px;color:var(--text-muted);">${isFa ? 'با تیک زدن ستون چپ جدول، ۲ تا ۴ پیش‌بینی را هم‌زمان روی کندل‌های واقعی مقایسه کنید.' : 'Check 2–4 snapshots in the table above to overlay their predicted trajectories on realized price action.'}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">${visualOverlayLegend}</div>
        </div>
        <canvas id="forecast-ledger-overlay-canvas" class="ci-fc-preview-canvas" style="min-height:230px;"></canvas>
      </div>
    `
    : '';

  // Legacy SHA-256 Raw Audit Rows inside Collapsible Accordion
  const entriesReversed = rawEntries.slice().reverse();
  const rowsHtml =
    entriesReversed.length === 0
      ? `<tr><td colspan="8" style="padding:18px;text-align:center;color:var(--text-muted);font-size:12.5px;">${isFa ? 'هنوز هیچ پیش‌بینی‌ای در دفتر کل محلی ثبت نشده است.' : 'No immutable forecast snapshots recorded yet.'}</td></tr>`
      : entriesReversed
          .map(
            (e) => `
          <tr>
            <td class="ltr-num">#${e.seq}</td>
            <td class="ltr-num"><strong>${escapeHtml(e.symbolCode)}</strong> · ${escapeHtml(e.timeframe)} (+${e.horizonBars})${e.modelId ? ` <span class="ci-fc-family-tag">${escapeHtml(e.modelId)}</span>` : ''}</td>
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

  const lcEventsReversed = rawEvents.slice().reverse();
  const lcRowsHtml =
    lcEventsReversed.length === 0
      ? `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">${isFa ? 'هنوز رویداد چرخه عمر ثبت نشده است.' : 'No append-only lifecycle events yet.'}</td></tr>`
      : lcEventsReversed
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
          <strong style="font-size:13.5px;">${isFa ? 'گزارش جامع پیش‌بینی‌ها، ارزیابی ۵بعدی و مقایسه مدل‌ها' : 'Forecast Snapshot Tracker, 5D Evaluation & Multi-Model Comparison'}</strong>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;" class="ltr-num">
            ${isFa ? `کل: ${rawEntries.length} | در انتظار: ${pendingTotal} | تکمیل‌شده: ${maturedTotal} | دسته‌های چندمدله: ${multiModelBatches.length}` : `Total: ${rawEntries.length} · Pending: ${pendingTotal} · Matured: ${maturedTotal} · Multi-Model Batches: ${multiModelBatches.length}`}
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-sm btn-primary" data-action="record-selected-forecast-models">${isFa ? 'ثبت گروهی مدل‌های انتخاب‌شده' : 'Record Selected Models'}</button>
          <button type="button" class="btn btn-sm" data-action="evaluate-forecast-outcomes">${isFa ? 'ارزیابی سررسیدها' : 'Evaluate Matured Outcomes'}</button>
          <button type="button" class="btn btn-sm" data-action="refresh-forecast-ledger">${isFa ? 'به‌روزرسانی' : 'Refresh Local Ledger'}</button>
        </div>
      </div>
    </div>

    ${scorecardsHtml}

    <div class="ci-fc-card" style="margin-bottom:12px;">
      ${filterBarHtml}
      <div style="overflow-x:auto;">
        <table class="ci-fc-table ci-fc-ledger-table">
          <thead>
            <tr>
              <th>Plot</th>
              <th>Run</th>
              <th>Model & Condition</th>
              <th>Recorded</th>
              <th>Horizon & Due</th>
              <th>Q50 & 80% Band</th>
              <th>Actual</th>
              <th>5D Evaluation</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${unifiedRowsHtml}</tbody>
        </table>
      </div>
    </div>

    ${batchComparisonHtml}
    ${visualOverlayHtml}

    <details class="ci-fc-card ci-fc-accordion">
      <summary>
        <span>${isFa ? 'دفتر کل فنی زنجیره هش SHA-256 و لاگ چرخه عمر (کلیک برای مشاهده جزئیات ممیزی)' : 'Append-Only SHA-256 Hash-Chained Audit Ledger & Raw Lifecycle Log (Click to expand)'}</span>
        <span class="ltr-num" style="font-size:11px;color:${audit.valid && lcAudit.valid ? 'var(--bull)' : 'var(--bear)'};">Runs: ${escapeHtml(audit.reason)} · Lifecycle: ${escapeHtml(lcAudit.reason)}</span>
      </summary>
      <div class="ci-fc-accordion-body">
        <div style="overflow-x:auto;margin-bottom:12px;">
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
        <div style="overflow-x:auto;">
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
      </div>
    </details>
  `;
}
