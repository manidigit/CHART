import {
  state,
  getCachedOrAggregatedCandles,
  isStructuralForecastMatchingTab,
  clearTabStructuralForecast,
} from '../core/store.js?v=1.47.41';
import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.47.41';
import { resolveLowerTimeframeInfo } from '../forecast/forecastEngine.js?v=1.47.41';
import {
  computeStructuralForecast,
  computeClosedCandlesDigest,
  STRUCTURAL_FORECAST_ENGINE_ID,
} from '../algorithms/structuralForecastEngine.js?v=1.47.41';

function resolveHigherTimeframeForStructural(tf = 'M15') {
  const norm = String(tf || 'M15').trim().toUpperCase();
  if (norm === 'M15' || norm === 'M30') return 'H1';
  if (norm === 'H1') return 'H4';
  if (norm === 'H4') return 'D1';
  if (norm === 'D1') return 'W1';
  return '';
}

const _structuralForecastMemoryCache = new Map();
let _workerInstance = null;
let _workerSeq = 0;

export function buildStructuralForecastCacheKey(
  symbolCode,
  provider,
  timeframe,
  originOpenMs,
  horizonBars = 30,
  seriesDigest = '',
  mtfSuffix = ''
) {
  const sym = String(symbolCode || '').trim().toUpperCase();
  const prov = String(provider || 'tvdatafeed').trim().toLowerCase();
  const tf = String(timeframe || 'M15').trim().toUpperCase();
  const h = Math.max(1, Math.min(120, Math.round(Number(horizonBars) || 30)));
  const base = `${sym}|${prov}|${tf}|${Number(originOpenMs)}|H${h}|${STRUCTURAL_FORECAST_ENGINE_ID}|${seriesDigest}`;
  return mtfSuffix ? `${base}|${mtfSuffix}` : base;
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
          new URL('../workers/structuralForecastWorker.js?v=1.47.41', import.meta.url),
          { type: 'module' }
        );
      }
      const reqId = ++_workerSeq;
      const timer = setTimeout(() => {
        // Fallback to deterministic inline calculation if worker stalls
        try {
          finish(computeStructuralForecast(params));
        } catch (fallbackErr) {
          finish({
            status: 'ERROR',
            error: fallbackErr && fallbackErr.message ? fallbackErr.message : 'Structural forecast calculation failed',
          });
        }
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
          try {
            finish(computeStructuralForecast(params));
          } catch (fallbackErr) {
            finish({
              status: 'ERROR',
              error: (msg && msg.error) || (fallbackErr && fallbackErr.message) || 'Structural forecast worker error',
            });
          }
        }
      };

      const handleErr = () => {
        clearTimeout(timer);
        _workerInstance?.removeEventListener('message', handleMsg);
        _workerInstance?.removeEventListener('error', handleErr);
        _workerInstance = null;
        try {
          finish(computeStructuralForecast(params));
        } catch (fallbackErr) {
          finish({
            status: 'ERROR',
            error: fallbackErr && fallbackErr.message ? fallbackErr.message : 'Structural forecast error',
          });
        }
      };

      _workerInstance.addEventListener('message', handleMsg);
      _workerInstance.addEventListener('error', handleErr);
      _workerInstance.postMessage({ requestId: reqId, params });
    } catch {
      _workerInstance = null;
      try {
        finish(computeStructuralForecast(params));
      } catch (fallbackErr) {
        finish({
          status: 'ERROR',
          error: fallbackErr && fallbackErr.message ? fallbackErr.message : 'Structural forecast error',
        });
      }
    }
  });
}

/**
 * Executes the Native Browser Structural Forecast strictly on explicit user request.
 * - Zero PHP exec(), zero Python, zero Cron, zero remote server calls.
 * - Checks in-memory deterministic cache keyed by closed candle series digest.
 * - Offloads computation to Web Worker when available in browser.
 */
export async function requestStructuralForecastForTab(
  tab,
  onRenderUpdate,
  forceRefresh = false,
  _retriedBoundary = false
) {
  if (!tab || !tab.showStructuralForecast) {
    if (tab) clearTabStructuralForecast(tab);
    return null;
  }

  const reqSeq = (tab._structuralReqSeq = (tab._structuralReqSeq || 0) + 1);

  try {
    const symbolCode = String(tab.symbolCode || '').trim().toUpperCase();
    const provider = String(tab.provider || 'tvdatafeed').trim().toLowerCase();
    const timeframe = String(tab.timeframe || 'M15').trim().toUpperCase();
    const horizonBars = Math.max(
      1,
      Math.min(120, Math.round(Number(tab.structuralForecastHorizonBars || state.chartPreferences.structuralForecastHorizonBars || 30)))
    );

    const nowMs = Date.now();
    const allCandles = Array.isArray(tab.candles) ? tab.candles : [];
    const closedCandles = allCandles
      .filter((c) => {
        const openMs = Number(c?.open_time_utc_ms || 0);
        const closeVal = Number(c?.close);
        return (
          openMs > 0 &&
          Number.isFinite(closeVal) &&
          closeVal > 0 &&
          c?.is_closed !== false &&
          PriceFormatter.isCandleClosed(openMs, timeframe, nowMs, symbolCode)
        );
      })
      .sort((a, b) => Number(a.open_time_utc_ms) - Number(b.open_time_utc_ms));

    if (closedCandles.length === 0) {
      tab.structuralForecast = null;
      tab.structuralForecastStatus = 'INSUFFICIENT_EVIDENCE';
      tab.structuralForecastError = 'No closed candles available for structural analysis.';
      if (typeof onRenderUpdate === 'function') onRenderUpdate();
      return null;
    }

    if (!forceRefresh && isStructuralForecastMatchingTab(tab, tab.structuralForecast, { requireLatestOrigin: true })) {
      tab.structuralForecastStatus = 'READY';
      tab.structuralForecastError = '';
      if (typeof onRenderUpdate === 'function') onRenderUpdate();
      return tab.structuralForecast;
    }

    const higherTf = resolveHigherTimeframeForStructural(timeframe);
    const higherRaw = higherTf ? getCachedOrAggregatedCandles(symbolCode, provider, higherTf) : [];
    const higherClosed = Array.isArray(higherRaw)
      ? higherRaw
          .filter((c) => {
            const openMs = Number(c?.open_time_utc_ms || 0);
            const closeVal = Number(c?.close);
            return (
              openMs > 0 &&
              Number.isFinite(closeVal) &&
              closeVal > 0 &&
              c?.is_closed !== false &&
              PriceFormatter.isCandleClosed(openMs, higherTf, nowMs, symbolCode)
            );
          })
          .sort((a, b) => Number(a.open_time_utc_ms) - Number(b.open_time_utc_ms))
          .slice(-360)
      : [];
    const lowerInfo = resolveLowerTimeframeInfo(timeframe);
    const lowerTf = lowerInfo ? lowerInfo.timeframe : '';
    const lowerRaw = lowerTf ? getCachedOrAggregatedCandles(symbolCode, provider, lowerTf) : [];
    const lowerClosed = Array.isArray(lowerRaw)
      ? lowerRaw
          .filter((c) => {
            const openMs = Number(c?.open_time_utc_ms || 0);
            const closeVal = Number(c?.close);
            return (
              openMs > 0 &&
              Number.isFinite(closeVal) &&
              closeVal > 0 &&
              c?.is_closed !== false &&
              PriceFormatter.isCandleClosed(openMs, lowerTf, nowMs, symbolCode)
            );
          })
          .sort((a, b) => Number(a.open_time_utc_ms) - Number(b.open_time_utc_ms))
          .slice(-600)
      : [];
    const lastHigherMs = higherClosed.length > 0 ? Number(higherClosed[higherClosed.length - 1].open_time_utc_ms || 0) : 0;
    const lastLowerMs = lowerClosed.length > 0 ? Number(lowerClosed[lowerClosed.length - 1].open_time_utc_ms || 0) : 0;
    const mtfSuffix = `H:${higherTf}:${higherClosed.length}:${lastHigherMs}|L:${lowerTf}:${lowerClosed.length}:${lastLowerMs}`;

    const lastClosedCandle = closedCandles[closedCandles.length - 1];
    const originOpenMs = Number(lastClosedCandle.open_time_utc_ms);
    const digest = computeClosedCandlesDigest(closedCandles);
    const cacheKey = buildStructuralForecastCacheKey(
      symbolCode,
      provider,
      timeframe,
      originOpenMs,
      horizonBars,
      digest,
      mtfSuffix
    );

    if (!forceRefresh && _structuralForecastMemoryCache.has(cacheKey)) {
      const cached = _structuralForecastMemoryCache.get(cacheKey);
      if (cached && cached.status === 'READY' && isStructuralForecastMatchingTab(tab, cached, { requireLatestOrigin: true })) {
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

    const result = await runInBrowserWorkerOrInline({
      candles: closedCandles.slice(-360),
      symbolCode,
      provider,
      timeframe,
      horizonBars,
      nowMs,
      higherTimeframe: higherTf,
      higherCandles: higherClosed,
      lowerTimeframe: lowerTf,
      lowerCandles: lowerClosed,
    });

    // Verify tab and request sequence still match user's explicit request
    if (
      tab._structuralReqSeq !== reqSeq ||
      !tab.showStructuralForecast ||
      String(tab.symbolCode || '').toUpperCase() !== symbolCode ||
      String(tab.provider || 'tvdatafeed').toLowerCase() !== provider ||
      String(tab.timeframe || 'M15').toUpperCase() !== timeframe
    ) {
      return null;
    }

    if (result && result.status === 'READY' && Array.isArray(result.forecast) && result.forecast.length > 0) {
      if (isStructuralForecastMatchingTab(tab, result, { requireLatestOrigin: true })) {
        _structuralForecastMemoryCache.set(cacheKey, result);
        tab.structuralForecast = result;
        tab.structuralForecastStatus = 'READY';
        tab.structuralForecastError = '';
        if (typeof onRenderUpdate === 'function') onRenderUpdate();
        return result;
      }
      if (!_retriedBoundary) {
        return requestStructuralForecastForTab(tab, onRenderUpdate, true, true);
      }
      tab.structuralForecast = null;
      tab.structuralForecastStatus = 'ERROR';
      tab.structuralForecastError = 'Candle series updated during forecast calculation; click Forecast to retry.';
      if (typeof onRenderUpdate === 'function') onRenderUpdate();
      return null;
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
    if (tab._structuralReqSeq !== reqSeq) return null;
    tab.structuralForecast = null;
    tab.structuralForecastStatus = 'ERROR';
    tab.structuralForecastError = err && err.message ? err.message : 'Structural forecast error';
    if (typeof onRenderUpdate === 'function') onRenderUpdate();
    return null;
  }
}
