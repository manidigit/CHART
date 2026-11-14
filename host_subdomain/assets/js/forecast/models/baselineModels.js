/**
 * Baseline Benchmark Models for Phase 4 Acceptance Gate.
 * Every model outputs per-step log-return distributions: { meanReturns: number[], sigmas: number[] }
 */

export const NaivePersistenceModel = {
  id: 'naive_persistence',
  name: 'Naive Persistence (Random Walk)',
  family: 'BASELINE',
  description: 'Zero-drift log-return benchmark with constant EWMA volatility; acceptance gate floor.',
  defaultEnabled: true,
  defaultWeight: 0.1,
  defaultParams: Object.freeze({
    volFloor: 0.0005,
  }),
  predict(features, horizon, params = {}) {
    const sigma = Math.max(Number(params.volFloor ?? 0.0005), features.ewmaSigma || features.uncondSigma);
    const meanReturns = new Array(horizon).fill(0);
    const sigmas = new Array(horizon).fill(sigma);
    return {
      modelId: 'naive_persistence',
      meanReturns,
      sigmas,
      meta: { ewmaSigma: sigma },
    };
  },
};

export const HistoricalDriftModel = {
  id: 'historical_drift',
  name: 'Damped Historical Drift',
  family: 'BASELINE',
  description: 'Recent log-return drift decaying exponentially toward zero with volatility clustering.',
  defaultEnabled: true,
  defaultWeight: 0.16,
  defaultParams: Object.freeze({
    damping: 0.9,
    lookback: 24,
  }),
  predict(features, horizon, params = {}) {
    const damping = Math.max(0.5, Math.min(0.99, Number(params.damping ?? 0.9)));
    const lookback = Math.max(6, Math.min(features.logReturns.length, Math.round(Number(params.lookback ?? 24))));
    const tail = features.logReturns.slice(-lookback);
    const avg = tail.reduce((acc, v) => acc + v, 0) / Math.max(1, tail.length);
    // Guard extreme outlier drift by clamping against 0.45 * uncondSigma
    const cappedDrift = Math.max(-features.uncondSigma * 0.45, Math.min(features.uncondSigma * 0.45, avg));
    const baseSigma = Math.max(1e-5, features.ewmaSigma);

    const meanReturns = new Array(horizon);
    const sigmas = new Array(horizon);
    let phi = 1;
    for (let h = 0; h < horizon; h++) {
      phi *= damping;
      meanReturns[h] = cappedDrift * phi;
      sigmas[h] = baseSigma * (1 + 0.015 * h);
    }
    return {
      modelId: 'historical_drift',
      meanReturns,
      sigmas,
      meta: { cappedDrift, damping },
    };
  },
};
