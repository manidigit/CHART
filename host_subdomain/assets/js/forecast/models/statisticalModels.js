/**
 * Statistical & State-Space Pluggable Forecast Models operating exclusively on log returns.
 */

export const KalmanMomentumModel = {
  id: 'kalman_momentum',
  name: 'Kalman State-Space Filter',
  family: 'STATE_SPACE',
  description: '2-state linear Kalman filter tracking latent log-return level and momentum velocity.',
  defaultEnabled: true,
  defaultWeight: 0.24,
  defaultParams: Object.freeze({
    processNoise: 0.08,
    obsNoise: 1.0,
    velocityDecay: 0.86,
  }),
  predict(features, horizon, params = {}) {
    const returns = features.logReturns;
    const obsVar = Math.max(1e-10, features.uncondVariance * Number(params.obsNoise ?? 1.0));
    const qLevel = Math.max(1e-11, obsVar * Number(params.processNoise ?? 0.08));
    const qVel = qLevel * 0.35;
    const decay = Math.max(0.6, Math.min(0.96, Number(params.velocityDecay ?? 0.86)));

    // State [level, velocity]
    let x0 = returns[0] || 0;
    let x1 = 0;
    let p00 = obsVar;
    let p01 = 0;
    let p10 = 0;
    let p11 = obsVar * 0.5;

    for (let i = 1; i < returns.length; i++) {
      // Predict step
      const px0 = 0.82 * x0 + x1;
      const px1 = decay * x1;
      const np00 = 0.82 * 0.82 * p00 + 0.82 * (p01 + p10) + p11 + qLevel;
      const np01 = 0.82 * decay * p01 + decay * p11;
      const np10 = 0.82 * decay * p10 + decay * p11;
      const np11 = decay * decay * p11 + qVel;

      // Update step (H = [1, 0])
      const y = returns[i] - px0;
      const s = np00 + obsVar;
      const k0 = np00 / s;
      const k1 = np10 / s;

      x0 = px0 + k0 * y;
      x1 = px1 + k1 * y;
      p00 = (1 - k0) * np00;
      p01 = (1 - k0) * np01;
      p10 = np10 - k1 * np00;
      p11 = np11 - k1 * np01;
    }

    const meanReturns = new Array(horizon);
    const sigmas = new Array(horizon);
    let curLevel = Math.max(-features.uncondSigma * 0.65, Math.min(features.uncondSigma * 0.65, x0));
    let curVel = Math.max(-features.uncondSigma * 0.35, Math.min(features.uncondSigma * 0.35, x1));
    let stepVar = p00;

    for (let h = 0; h < horizon; h++) {
      curLevel = 0.82 * curLevel + curVel;
      curVel *= decay;
      stepVar = Math.min(features.uncondVariance * 2.2, 0.82 * 0.82 * stepVar + qLevel + obsVar * 0.92);
      meanReturns[h] = curLevel;
      sigmas[h] = Math.max(features.ewmaSigma * 0.65, Math.sqrt(stepVar));
    }

    return {
      modelId: 'kalman_momentum',
      meanReturns,
      sigmas,
      meta: { finalLevel: x0, finalVelocity: x1 },
    };
  },
};

export const GarchVolatilityModel = {
  id: 'garch_volatility',
  name: 'GARCH(1,1) Conditional Volatility',
  family: 'VOLATILITY',
  description: 'Models time-varying volatility clustering with mean-reverting conditional variance.',
  defaultEnabled: true,
  defaultWeight: 0.24,
  defaultParams: Object.freeze({
    alpha: 0.09,
    beta: 0.87,
    meanRevertPull: 0.84,
  }),
  predict(features, horizon, params = {}) {
    const returns = features.logReturns;
    const alpha = Math.max(0.02, Math.min(0.25, Number(params.alpha ?? 0.09)));
    const beta = Math.max(0.5, Math.min(0.95 - alpha, Number(params.beta ?? 0.87)));
    const persistence = alpha + beta;
    const uncondVar = Math.max(1e-10, features.uncondVariance);
    const omega = uncondVar * Math.max(0.01, 1 - persistence);

    let hVar = uncondVar;
    const mu = features.meanReturn;
    for (let i = 0; i < returns.length; i++) {
      const eps = returns[i] - mu;
      hVar = omega + alpha * (eps * eps) + beta * hVar;
    }

    const driftAnchor = Math.max(
      -features.uncondSigma * 0.4,
      Math.min(features.uncondSigma * 0.4, features.recentMeanReturn * 0.65 + mu * 0.35)
    );
    const pull = Math.max(0.65, Math.min(0.97, Number(params.meanRevertPull ?? 0.84)));

    const meanReturns = new Array(horizon);
    const sigmas = new Array(horizon);
    let curVar = hVar;
    let drift = driftAnchor;

    for (let h = 0; h < horizon; h++) {
      curVar = omega + persistence * curVar;
      drift *= pull;
      meanReturns[h] = drift;
      sigmas[h] = Math.max(1e-5, Math.sqrt(curVar));
    }

    return {
      modelId: 'garch_volatility',
      meanReturns,
      sigmas,
      meta: { alpha, beta, persistence, initialSigma: Math.sqrt(hVar) },
    };
  },
};

export const ArimaEtsModel = {
  id: 'arima_ets',
  name: 'Damped AR(2) + ETS',
  family: 'TIME_SERIES',
  description: 'Combines second-order autoregressive return dynamics with damped Holt exponential smoothing.',
  defaultEnabled: true,
  defaultWeight: 0.22,
  defaultParams: Object.freeze({
    damping: 0.88,
    alphaEts: 0.32,
  }),
  predict(features, horizon, params = {}) {
    const returns = features.logReturns;
    const n = returns.length;
    const damping = Math.max(0.6, Math.min(0.97, Number(params.damping ?? 0.88)));
    const alphaEts = Math.max(0.1, Math.min(0.6, Number(params.alphaEts ?? 0.32)));

    // Simple ridge-stabilized AR(2) regression on recent returns
    let s11 = 1e-6;
    let s12 = 0;
    let s22 = 1e-6;
    let y1 = 0;
    let y2 = 0;
    const start = Math.max(2, n - 96);
    for (let i = start; i < n; i++) {
      const x1 = returns[i - 1];
      const x2 = returns[i - 2];
      const y = returns[i];
      s11 += x1 * x1;
      s12 += x1 * x2;
      s22 += x2 * x2;
      y1 += x1 * y;
      y2 += x2 * y;
    }
    const det = s11 * s22 - s12 * s12;
    let phi1 = 0.15;
    let phi2 = -0.05;
    if (Math.abs(det) > 1e-14) {
      phi1 = (y1 * s22 - y2 * s12) / det;
      phi2 = (s11 * y2 - s12 * y1) / det;
    }
    // Enforce stationarity triangle bounds
    const norm = Math.abs(phi1) + Math.abs(phi2);
    if (norm > 0.85) {
      phi1 *= 0.85 / norm;
      phi2 *= 0.85 / norm;
    }

    // Damped ETS level on returns
    let etsLevel = returns[0] || 0;
    for (let i = 1; i < n; i++) {
      etsLevel = alphaEts * returns[i] + (1 - alphaEts) * etsLevel;
    }

    let rPrev1 = returns[n - 1] || 0;
    let rPrev2 = returns[n - 2] || 0;
    const meanReturns = new Array(horizon);
    const sigmas = new Array(horizon);

    for (let h = 0; h < horizon; h++) {
      const arPart = phi1 * rPrev1 + phi2 * rPrev2;
      const etsPart = etsLevel * Math.pow(damping, h + 1);
      const rawStep = 0.58 * arPart + 0.42 * etsPart;
      const stepReturn = Math.max(-features.uncondSigma * 0.75, Math.min(features.uncondSigma * 0.75, rawStep));
      meanReturns[h] = stepReturn;
      sigmas[h] = Math.max(1e-5, features.ewmaSigma * (0.95 + 0.018 * h));
      rPrev2 = rPrev1;
      rPrev1 = stepReturn;
    }

    return {
      modelId: 'arima_ets',
      meanReturns,
      sigmas,
      meta: { phi1, phi2, etsLevel },
    };
  },
};

export const GaussianProcessModel = {
  id: 'gaussian_process',
  name: 'RBF Gaussian Process',
  family: 'NON_PARAMETRIC',
  description: 'Kernel regression on recent return structure with analytic posterior uncertainty growth.',
  defaultEnabled: true,
  defaultWeight: 0.14,
  defaultParams: Object.freeze({
    lengthScale: 7.5,
    noiseRatio: 0.35,
  }),
  predict(features, horizon, params = {}) {
    const tail = features.logReturns.slice(-Math.min(28, features.logReturns.length));
    const m = tail.length;
    const lengthScale = Math.max(2.5, Math.min(20, Number(params.lengthScale ?? 7.5)));
    const signalVar = Math.max(1e-10, features.uncondVariance);
    const noiseVar = signalVar * Math.max(0.08, Math.min(1.5, Number(params.noiseRatio ?? 0.35)));
    const ls2 = 2 * lengthScale * lengthScale;

    // Build K + noise*I and solve (K + s2*I) alpha = y via Cholesky
    const K = new Float64Array(m * m);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j <= i; j++) {
        const d = i - j;
        let val = signalVar * Math.exp(-(d * d) / ls2);
        if (i === j) val += noiseVar;
        K[i * m + j] = val;
        K[j * m + i] = val;
      }
    }

    const L = new Float64Array(m * m);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = K[i * m + j];
        for (let k = 0; k < j; k++) sum -= L[i * m + k] * L[j * m + k];
        L[i * m + j] = i === j ? Math.sqrt(Math.max(1e-14, sum)) : sum / Math.max(1e-12, L[j * m + j]);
      }
    }

    // Forward solve L z = y
    const z = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      let sum = tail[i];
      for (let k = 0; k < i; k++) sum -= L[i * m + k] * z[k];
      z[i] = sum / Math.max(1e-12, L[i * m + i]);
    }
    // Back solve L^T alpha = z
    const alphaVec = new Float64Array(m);
    for (let i = m - 1; i >= 0; i--) {
      let sum = z[i];
      for (let k = i + 1; k < m; k++) sum -= L[k * m + i] * alphaVec[k];
      alphaVec[i] = sum / Math.max(1e-12, L[i * m + i]);
    }

    const meanReturns = new Array(horizon);
    const sigmas = new Array(horizon);
    const kStar = new Float64Array(m);
    const v = new Float64Array(m);

    for (let h = 0; h < horizon; h++) {
      const tStar = m + h;
      let predMean = 0;
      for (let i = 0; i < m; i++) {
        const d = tStar - i;
        const kv = signalVar * Math.exp(-(d * d) / ls2);
        kStar[i] = kv;
        predMean += kv * alphaVec[i];
      }
      // Posterior variance: k(**) - v^T v + obs noise
      for (let i = 0; i < m; i++) {
        let sum = kStar[i];
        for (let k = 0; k < i; k++) sum -= L[i * m + k] * v[k];
        v[i] = sum / Math.max(1e-12, L[i * m + i]);
      }
      let vSq = 0;
      for (let i = 0; i < m; i++) vSq += v[i] * v[i];
      const postVar = Math.max(features.ewmaSigma * features.ewmaSigma * 0.5, signalVar + noiseVar - vSq);
      meanReturns[h] = Math.max(-features.uncondSigma * 0.7, Math.min(features.uncondSigma * 0.7, predMean));
      sigmas[h] = Math.max(1e-5, Math.sqrt(postVar));
    }

    return {
      modelId: 'gaussian_process',
      meanReturns,
      sigmas,
      meta: { lengthScale, trainingPoints: m },
    };
  },
};
