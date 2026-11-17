import {
  state,
  isStructuralForecastMatchingTab,
  clearTabStructuralForecast,
} from '../core/store.js?v=1.47.0';
import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.47.0';
import {
  computeStructuralForecast,
  computeClosedCandlesDigest,
  STRUCTURAL_FORECAST_ENGINE_ID,
} from '../algorithms/structuralForecastEngine.js?v=1.47.0';

const _structuralForecastMemoryCache = new Map();
let _workerInstance = null;
let _workerSeq = 0;

export function buildStructuralForecastCacheKey(
  symbolCode,
  provider,
  timeframe,
  originOpenMs,
  horizonBars = 30,
  seriesDigest = ''
) {
  const sym = String(symbolCode || '').trim().toUpperCase();
  const prov = String(provider || 'tvdatafeed').trim().toLowerCase();
  const tf = String(timeframe || 'M15').trim().toUpperCase();
  const h = Math.max(1, Math.min(120, Math.round(Number(horizonBars) || 30)));
  return `${sym}|${prov}|${tf}|${Number(originOpenMs)}|H${h}|${STRUCTURAL_FORECAST_ENGINE_ID}|${seriesDigest}`;
}

export function clearStructuralForecastCache() {
  _structuralForecastMemoryCache.clear();
}

function runInBrowserWorkerOrInline(params) {
  if (typeof Worker !== 'function' || typeof window === 'undefined') {
    return Promise.resolve(computeStructuralForecast(params));
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };

    try {
      if (!_workerInstance) {
        _workerInstance = new Worker(
          new URL('../workers/structuralForecastWorker.js?v=1.47.0', import.meta.url),
          { type: 'module' }
        );
      }
      const reqId = ++_workerSeq;
      const timer = setTimeout(() => {
        // Fallback to deterministic inline calculation if worker stalls
        finish(computeStructuralForecast(params));
      }, 2500);

      const handleMsg = (ev) => {
        const msg = ev.data || {};
        if (msg.requestId !== reqId) return;
        clearTimeout(timer);
        _workerInstance?.removeEventListener('message', handleMsg);
        _workerInstance?.removeEventListener('error', handleErr);
        if (msg.ok && msg.result) {
          finish(msg.result);
        } else {
          finish(computeStructuralForecast(params));
        }
      };

      const handleErr = () => {
        clearTimeout(timer);
        _workerInstance?.removeEventListener('message', handleMsg);
        _workerInstance?.removeEventListener('error', handleErr);
        _workerInstance = null;
        finish(computeStructuralForecast(params));
      };

      _workerInstance.addEventListener('message', handleMsg);
      _workerInstance.addEventListener('error', handleErr);
      _workerInstance.postMessage({ requestId: reqId, params });
    } catch {
      _workerInstance = null;
      finish(computeStructuralForecast(params));
    }
  });
}

/**
 * Executes the Native Browser Structural Forecast strictly on explicit user request.
 * - Zero PHP exec(), zero Python, zero Cron, zero remote server calls.
 * - Checks in-memory deterministic cache keyed by closed candle series digest.
 * - Offloads computation to Web Worker when available in browser.
 */
export async function requestStructuralForecastForTab(tab, onRenderUpdate, forceRefresh = false) {
  if (!tab || !tab.showStructuralForecast) {
    if (tab) clearTabStructuralForecast(tab);
    return null;
  }

  const symbolCode = String(tab.symbolCode || '').trim().toUpperCase();
  const provider = String(tab.provider || 'tvdatafeed').trim().toLowerCase();
  const timeframe = String(tab.timeframe || 'M15').trim().toUpperCase();
  const horizonBars = Math.max(
    1,
    Math.min(120, Math.round(Number(tab.forecastHorizonBars || state.chartPreferences.forecastHorizonBars || 30)))
  );

  const nowMs = Date.now();
  const allCandles = Array.isArray(tab.candles) ? tab.candles : [];
  const closedCandles = allCandles.filter((c) => {
    const openMs = Number(c?.open_time_utc_ms || 0);
    const closeVal = Number(c?.close);
    return (
      openMs > 0 &&
      Number.isFinite(closeVal) &&
      closeVal > 0 &&
      c?.is_closed !== false &&
      PriceFormatter.isCandleClosed(openMs, timeframe, nowMs, symbolCode)
    );
  });

  if (closedCandles.length === 0) {
    tab.structuralForecast = null;
    tab.structuralForecastStatus = 'INSUFFICIENT_EVIDENCE';
    tab.structuralForecastError = 'No closed candles available for structural analysis.';
    if (typeof onRenderUpdate === 'function') onRenderUpdate();
    return null;
  }

  if (!forceRefresh && isStructuralForecastMatchingTab(tab, tab.structuralForecast)) {
    tab.structuralForecastStatus = 'READY';
    tab.structuralForecastError = '';
    if (typeof onRenderUpdate === 'function') onRenderUpdate();
    return tab.structuralForecast;
  }

  const lastClosedCandle = closedCandles[closedCandles.length - 1];
  const originOpenMs = Number(lastClosedCandle.open_time_utc_ms);
  const digest = computeClosedCandlesDigest(closedCandles);
  const cacheKey = buildStructuralForecastCacheKey(
    symbolCode,
    provider,
    timeframe,
    originOpenMs,
    horizonBars,
    digest
  );

  if (!forceRefresh && _structuralForecastMemoryCache.has(cacheKey)) {
    const cached = _structuralForecastMemoryCache.get(cacheKey);
    if (cached && cached.status === 'READY' && isStructuralForecastMatchingTab(tab, cached)) {
      cached.served_from_cache = true;
      tab.structuralForecast = cached;
      tab.structuralForecastStatus = 'READY';
      tab.structuralForecastError = '';
      if (typeof onRenderUpdate === 'function') onRenderUpdate();
      return cached;
    }
  }

  tab.structuralForecastStatus = 'COMPUTING';
  tab.structuralForecastError = '';
  if (typeof onRenderUpdate === 'function') onRenderUpdate();

  try {
    const result = await runInBrowserWorkerOrInline({
      candles: closedCandles.slice(-360),
      symbolCode,
      provider,
      timeframe,
      horizonBars,
      nowMs,
    });

    // Verify tab still matches user's target while async worker ran
    if (
      !tab.showStructuralForecast ||
      String(tab.symbolCode || '').toUpperCase() !== symbolCode ||
      String(tab.provider || 'tvdatafeed').toLowerCase() !== provider ||
      String(tab.timeframe || 'M15').toUpperCase() !== timeframe
    ) {
      return null;
    }

    if (result && result.status === 'READY' && isStructuralForecastMatchingTab(tab, result)) {
      _structuralForecastMemoryCache.set(cacheKey, result);
      tab.structuralForecast = result;
      tab.structuralForecastStatus = 'READY';
      tab.structuralForecastError = '';
      if (typeof onRenderUpdate === 'function') onRenderUpdate();
      return result;
    }

    tab.structuralForecast = result || null;
    tab.structuralForecastStatus = result?.status === 'INSUFFICIENT_EVIDENCE' ? 'INSUFFICIENT_EVIDENCE' : 'ERROR';
    tab.structuralForecastError =
      result?.error ||
      (Array.isArray(result?.data_quality?.limitations) ? result.data_quality.limitations[0] : '') ||
      'Unable to derive reliable wave structure from closed candles.';
    if (typeof onRenderUpdate === 'function') onRenderUpdate();
    return result;
  } catch (err) {
    tab.structuralForecast = null;
    tab.structuralForecastStatus = 'ERROR';
    tab.structuralForecastError = err && err.message ? err.message : 'Structural forecast error';
    if (typeof onRenderUpdate === 'function') onRenderUpdate();
    return null;
  }
}
