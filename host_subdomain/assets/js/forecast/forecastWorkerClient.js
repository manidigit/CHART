import { REMOTE_WORKER_STATUS } from './forecastContract.js?v=1.47.41';

const workerResponseCache = new Map();

export function validateRemoteWorkerPayload(data, expectedInputHash = '', expectedHorizon = null) {
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: 'Empty or invalid JSON payload from worker' };
  }
  if (expectedInputHash && data.inputHash && data.inputHash !== expectedInputHash) {
    return {
      ok: false,
      reason: `WORKER_INPUT_HASH_MISMATCH: expected ${expectedInputHash.slice(0, 12)}, got ${String(data.inputHash).slice(0, 12)}`,
    };
  }
  if (Array.isArray(data.modelTrajectories)) {
    for (const tr of data.modelTrajectories) {
      if (!tr || typeof tr !== 'object') {
        return { ok: false, reason: 'Malformed trajectory entry from worker' };
      }
      if (tr.status === 'SUCCESS') {
        if (!Array.isArray(tr.points) || (expectedHorizon && tr.points.length !== expectedHorizon)) {
          return { ok: false, reason: `Trajectory length mismatch for ${tr.modelId}` };
        }
        for (const p of tr.points) {
          if (
            !p ||
            !Number.isFinite(p.q10) ||
            !Number.isFinite(p.q25) ||
            !Number.isFinite(p.q50) ||
            !Number.isFinite(p.q75) ||
            !Number.isFinite(p.q90) ||
            p.q10 <= 0 ||
            !(p.q10 <= p.q25 && p.q25 <= p.q50 && p.q50 <= p.q75 && p.q75 <= p.q90)
          ) {
            return { ok: false, reason: `Non-finite or non-monotonic quantiles emitted by worker for ${tr.modelId}` };
          }
        }
      }
    }
  }
  return { ok: true, reason: '' };
}

/**
 * Non-blocking optional HTTP client for self-hosted Python/FastAPI inference worker.
 * Strictly validates inputHash & finite monotonic quantiles; never uses hardcoded fallback stubs.
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
      const validation = validateRemoteWorkerPayload(
        data,
        requestPayload?.inputHash || '',
        requestPayload?.horizonBars || null
      );
      if (!validation.ok) {
        return {
          status: REMOTE_WORKER_STATUS.ERROR,
          configured: true,
          url: base,
          error: validation.reason,
          data: null,
        };
      }

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
