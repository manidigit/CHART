import { REMOTE_WORKER_STATUS } from './forecastContract.js?v=1.43.0';

const workerResponseCache = new Map();

/**
 * Non-blocking optional HTTP client for self-hosted Python/FastAPI inference worker.
 * Never throws or disrupts native JS forecasting if worker is offline, slow, or unconfigured.
 */
export const ForecastWorkerClient = {
  normalizeBaseUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  },

  async checkHealth(workerUrl, timeoutMs = 3500) {
    const base = this.normalizeBaseUrl(workerUrl);
    if (!base) {
      return { ok: false, status: REMOTE_WORKER_STATUS.LOCAL_STATISTICAL_ONLY, detail: 'No worker URL configured' };
    }
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      const res = await fetch(`${base}/health`, {
        method: 'GET',
        signal: ctrl?.signal,
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) {
        return { ok: false, status: REMOTE_WORKER_STATUS.ERROR, detail: `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, status: REMOTE_WORKER_STATUS.CONNECTED, detail: data };
    } catch (err) {
      return { ok: false, status: REMOTE_WORKER_STATUS.ERROR, detail: String(err?.message || err) };
    }
  },

  async infer(workerUrl, requestPayload, timeoutMs = 8000) {
    const base = this.normalizeBaseUrl(workerUrl);
    if (!base) {
      return { status: REMOTE_WORKER_STATUS.LOCAL_STATISTICAL_ONLY, configured: false, url: '', data: null };
    }
    const cacheKey = `${base}|${requestPayload?.inputHash || ''}|${requestPayload?.horizonBars || 30}`;
    if (requestPayload?.inputHash && workerResponseCache.has(cacheKey)) {
      return workerResponseCache.get(cacheKey);
    }

    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      const res = await fetch(`${base}/forecast/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal: ctrl?.signal,
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) {
        return {
          status: REMOTE_WORKER_STATUS.ERROR,
          configured: true,
          url: base,
          error: `Worker returned HTTP ${res.status}`,
          data: null,
        };
      }
      const data = await res.json();
      const wrapped = {
        status: REMOTE_WORKER_STATUS.CONNECTED,
        configured: true,
        url: base,
        data,
      };
      if (requestPayload?.inputHash) {
        workerResponseCache.set(cacheKey, wrapped);
      }
      return wrapped;
    } catch (err) {
      return {
        status: REMOTE_WORKER_STATUS.ERROR,
        configured: true,
        url: base,
        error: String(err?.message || err),
        data: null,
      };
    }
  },
};
