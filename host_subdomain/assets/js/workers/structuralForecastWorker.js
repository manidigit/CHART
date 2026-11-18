import { computeStructuralForecast } from '../algorithms/structuralForecastEngine.js?v=1.47.2';

self.onmessage = (event) => {
  const { requestId, params } = event.data || {};
  try {
    const result = computeStructuralForecast(params || {});
    self.postMessage({ requestId, ok: true, result });
  } catch (err) {
    self.postMessage({
      requestId,
      ok: false,
      error: err && err.message ? err.message : 'Structural forecast worker error',
    });
  }
};
