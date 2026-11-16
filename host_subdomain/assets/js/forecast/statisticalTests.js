/**
 * CHART Forecast Engine V2 (Rev 2.1) — Statistical Tests, WIS, Conformal Calibration & Scenario Logit
 * Pure deterministic IEEE-754 routines mirrored 1:1 in Kotlin.
 */

export const QUANTILE_TAUS_5 = Object.freeze([0.10, 0.25, 0.50, 0.75, 0.90]);

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Acklam's rational approximation to the standard normal inverse CDF Phi^-1(p).
 * Relative error < 1.15e-9 across (0, 1).
 */
export function normalInv(p) {
  if (p <= 0) return -8.0;
  if (p >= 1) return 8.0;
  if (p === 0.5) return 0.0;

  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00,
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01,
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00,
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

function logGamma(z) {
  const cof = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.001208650973866179,
    -0.000005395239384953,
  ];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a, b, x) {
  const maxIter = 200;
  const eps = 3e-12;
  const fpMin = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpMin) d = fpMin;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/**
 * Exact lower-tail CDF P(T_df <= t) for Student's t distribution.
 */
export function studentTCdf(t, df) {
  if (!Number.isFinite(t)) return t < 0 ? 0 : 1;
  if (df <= 0) return t < 0 ? 0 : 1;
  if (t === 0) return 0.5;
  const x = df / (df + t * t);
  const ib = regularizedBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

export function pinballLoss(y, qPred, tau) {
  const diff = y - qPred;
  return diff >= 0 ? tau * diff : (tau - 1) * diff;
}

/**
 * Bracher et al. (2021) Weighted Interval Score over exact 5-quantile grid [0.10, 0.25, 0.50, 0.75, 0.90].
 * Equivalent to (2/5) * sum_{k=1..5} L_{tau_k}(y, q_{tau_k}).
 * Strictly Proper Scoring Rule in PRICE units.
 */
export function computeWis5Q(actualY, quantiles) {
  const qs = [
    quantiles.q10,
    quantiles.q25,
    quantiles.q50,
    quantiles.q75,
    quantiles.q90,
  ];
  let sum = 0;
  for (let k = 0; k < 5; k++) {
    sum += pinballLoss(actualY, qs[k], QUANTILE_TAUS_5[k]);
  }
  return 0.4 * sum;
}

/**
 * Dimensionally sound Zero-Drift Log-Normal Naive Baseline quantiles in PRICE units:
 *   q_{tau, h}^{naive} = P_0 * exp(sigma_hat_RW * sqrt(h) * Phi^-1(tau))
 */
export function computeNaiveSigmaRw(trainLogReturns = []) {
  if (!Array.isArray(trainLogReturns) || trainLogReturns.length < 2) return 1e-4;
  const n = trainLogReturns.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += trainLogReturns[i];
  mean /= n;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const d = trainLogReturns[i] - mean;
    sumSq += d * d;
  }
  return Math.max(1e-6, Math.sqrt(sumSq / Math.max(1, n - 1)));
}

export function buildZeroDriftLogNormalNaiveQuantiles(anchorClose, sigmaRw, stepH) {
  const p0 = Math.max(1e-8, Number(anchorClose));
  const scale = Math.max(1e-6, Number(sigmaRw)) * Math.sqrt(Math.max(1, stepH));
  return {
    q10: p0 * Math.exp(scale * normalInv(0.10)),
    q25: p0 * Math.exp(scale * normalInv(0.25)),
    q50: p0,
    q75: p0 * Math.exp(scale * normalInv(0.75)),
    q90: p0 * Math.exp(scale * normalInv(0.90)),
  };
}

/**
 * Conservative Bartlett Effective Sample Size:
 *   N_eff = K / (1 + 2 * sum_{k=1..Kmax} (1 - k/(Kmax+1)) * max(0, rho_k))
 *   Kmax = min(H, floor(K / 4))
 * Guarantees 0 < N_eff <= K.
 */
export function computeBartlettEffectiveSampleSize(series, horizonBars) {
  const kOuter = Array.isArray(series) ? series.length : 0;
  if (kOuter <= 0) return 0;
  if (kOuter < 4) return kOuter;

  const kMax = Math.min(Math.max(1, Math.round(horizonBars || 10)), Math.floor(kOuter / 4));
  let mean = 0;
  for (let i = 0; i < kOuter; i++) mean += series[i];
  mean /= kOuter;

  let gamma0 = 0;
  for (let i = 0; i < kOuter; i++) {
    const d = series[i] - mean;
    gamma0 += d * d;
  }
  gamma0 /= kOuter;
  if (gamma0 <= 1e-18) return kOuter;

  let acfWeightedSum = 0;
  for (let lag = 1; lag <= kMax; lag++) {
    let gammaK = 0;
    for (let t = lag; t < kOuter; t++) {
      gammaK += (series[t] - mean) * (series[t - lag] - mean);
    }
    gammaK /= kOuter;
    const rhoK = Math.max(0, gammaK / gamma0);
    const weight = 1 - lag / (kMax + 1);
    acfWeightedSum += weight * rhoK;
  }

  return clamp(kOuter / (1 + 2 * acfWeightedSum), 0.1, kOuter);
}

/**
 * Harvey-Leybourne-Newbold (1997) Modified Diebold-Mariano Test with Newey-West HAC variance.
 * Loss differential d_t = WIS_model(t) - WIS_naive(t).
 * H0: E[d_t] >= 0 vs H1: E[d_t] < 0 (one-sided).
 */
export function hlnModifiedDieboldMariano(dSeries, effectiveHorizonH = 1) {
  const K = Array.isArray(dSeries) ? dSeries.length : 0;
  if (K < 5) {
    return { stat: 0, pValue: 1, hacVar: 0, lNw: 0, meanDiff: 0 };
  }

  let meanD = 0;
  for (let i = 0; i < K; i++) meanD += dSeries[i];
  meanD /= K;

  const lNw = Math.max(0, Math.floor(Math.cbrt(K)));
  let gamma0 = 0;
  for (let i = 0; i < K; i++) {
    const c = dSeries[i] - meanD;
    gamma0 += c * c;
  }
  gamma0 /= K;

  let hacVar = gamma0;
  for (let lag = 1; lag <= lNw; lag++) {
    let gk = 0;
    for (let t = lag; t < K; t++) {
      gk += (dSeries[t] - meanD) * (dSeries[t - lag] - meanD);
    }
    gk /= K;
    hacVar += 2 * (1 - lag / (lNw + 1)) * gk;
  }
  if (hacVar <= 1e-18) {
    hacVar = Math.max(1e-12, gamma0);
  }

  const h = Math.max(1, Math.round(effectiveHorizonH || 1));
  const hlnFactor = Math.sqrt(Math.max(1e-9, (K + 1 - 2 * h + (h * (h - 1)) / K) / K));
  const se = Math.sqrt(Math.max(1e-18, hacVar) / K);
  const stat = (meanD / se) * hlnFactor;
  const pValue = studentTCdf(stat, K - 1);

  return {
    stat: Number.isFinite(stat) ? stat : 0,
    pValue: Number.isFinite(pValue) ? pValue : 1,
    hacVar,
    lNw,
    meanDiff: meanD,
  };
}

/**
 * Deterministic Politis-Romano Stationary Block Bootstrap under centered H0 (d_tilde = d_t - mean(d)).
 */
export function centeredStationaryBlockBootstrap(dSeries, B = 1000, meanBlockLen = 4, seed = 133742) {
  const K = Array.isArray(dSeries) ? dSeries.length : 0;
  if (K < 5) return { pValue: 1, B, meanBlockLen };

  let meanD = 0;
  for (let i = 0; i < K; i++) meanD += dSeries[i];
  meanD /= K;

  let allZero = true;
  const centered = new Float64Array(K);
  for (let i = 0; i < K; i++) {
    centered[i] = dSeries[i] - meanD;
    if (Math.abs(centered[i]) > 1e-14) allZero = false;
  }
  if (allZero && meanD >= 0) {
    return { pValue: 1, B, meanBlockLen };
  }

  // Deterministic Mulberry32 PRNG
  let a = seed >>> 0;
  const nextRand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const pJump = 1 / Math.max(1, meanBlockLen);
  let extremeCount = 0;

  for (let b = 0; b < B; b++) {
    let idx = Math.floor(nextRand() * K);
    let sum = centered[idx];
    for (let step = 1; step < K; step++) {
      if (nextRand() < pJump) {
        idx = Math.floor(nextRand() * K);
      } else {
        idx = (idx + 1) % K;
      }
      sum += centered[idx];
    }
    const bootMean = sum / K;
    if (bootMean <= meanD) extremeCount++;
  }

  return {
    pValue: (1 + extremeCount) / (B + 1),
    B,
    meanBlockLen,
  };
}

/**
 * Volatility-Normalized Split Conformal Calibration with Regime Decay (lambda = 0.92).
 * Explicitly documents local approximate exchangeability assumption on normalized scores:
 *   s_tilde_{i,h} = max(q10 - y, y - q90, 0) / (P_i * sigma_i * sqrt(h))
 * Strictly rejects M_cal < 10 or gamma > 1.0 as UNDER_SAMPLED.
 */
export function fitVolatilityNormalizedConformal(calOriginScores = [], alpha = 0.20, lambdaCal = 0.92) {
  const M = Array.isArray(calOriginScores) ? calOriginScores.length : 0;
  const gammaLevel = M > 0 ? Math.ceil((M + 1) * (1 - alpha)) / M : Infinity;

  if (M < 10 || !Number.isFinite(gammaLevel) || gammaLevel > 1.0) {
    return {
      calibrationWindows: M,
      gammaLevel: Number.isFinite(gammaLevel) ? Number(gammaLevel.toFixed(4)) : 1.0,
      calibrationStatus: 'UNDER_SAMPLED',
      decayLambda: lambdaCal,
      normalizedScaleQ80: 0,
      assumptions: 'Requires M_cal >= 10 and gamma <= 1.0 under local approximate exchangeability',
    };
  }

  // Weighted quantile across M calibration windows ordered chronologically (0 = oldest, M-1 = newest)
  const items = calOriginScores.map((score, i) => ({
    score: Math.max(0, Number(score) || 0),
    weight: Math.pow(lambdaCal, M - 1 - i),
  }));
  const wSum = items.reduce((acc, it) => acc + it.weight, 0) || 1;
  for (const it of items) it.weight /= wSum;
  items.sort((a, b) => a.score - b.score);

  let cumW = 0;
  let qGamma = items[items.length - 1].score;
  for (const it of items) {
    cumW += it.weight;
    if (cumW >= gammaLevel - 1e-12) {
      qGamma = it.score;
      break;
    }
  }

  return {
    calibrationWindows: M,
    gammaLevel: Number(gammaLevel.toFixed(4)),
    calibrationStatus: 'CALIBRATED_NORMALIZED',
    decayLambda: lambdaCal,
    normalizedScaleQ80: qGamma,
    assumptions: 'Local approximate exchangeability of volatility-normalized nonconformity residuals',
  };
}

export function applyConformalAdjustmentToQuantiles(qRaw, anchorClose, ewmaSigma, stepH, conformalState, floorPrice = 1e-6) {
  if (!conformalState || conformalState.calibrationStatus !== 'CALIBRATED_NORMALIZED' || conformalState.normalizedScaleQ80 <= 0) {
    return qRaw;
  }
  const margin80 = conformalState.normalizedScaleQ80 * Math.max(1e-8, anchorClose) * Math.max(1e-6, ewmaSigma) * Math.sqrt(Math.max(1, stepH));
  const margin50 = margin80 * (0.67448975 / 1.28155157);
  const q10 = Math.max(floorPrice, qRaw.q10 - margin80);
  const q25 = Math.max(q10, qRaw.q25 - margin50);
  const q50 = Math.max(q25, qRaw.q50);
  const q75 = Math.max(q50, qRaw.q75 + margin50);
  const q90 = Math.max(q75, qRaw.q90 + margin80);
  return { q10, q25, q50, q75, q90 };
}

/**
 * Causal L2 Multinomial Logistic Regression + Temperature Scaling on D_cal + Brier vs Climatology on D_outer.
 * Classes: 0=BULLISH_EXPANSION (> +1 ATR14), 1=RANGE_CONTAINMENT (|dP| <= 1 ATR14), 2=BEARISH_CONTRACTION (< -1 ATR14).
 */
export function fitAndEvaluateScenarioLogit(trainSamples = [], calSamples = [], outerSamples = [], currentFeatureVec = [1, 0, 0, 0]) {
  const K = 3;
  const D = currentFeatureVec.length;
  const counts = [0, 0, 0];
  for (const s of trainSamples) counts[s.label]++;
  for (const s of calSamples) counts[s.label]++;
  const totalLocal = counts[0] + counts[1] + counts[2];

  const estimable = counts.map((c) => c >= 3);
  const rawEmpiricalFrequency = counts.map((c) => (totalLocal > 0 ? c / totalLocal : 0));

  const softmax = (logits, temp = 1.0) => {
    const scaled = logits.map((v) => v / Math.max(0.1, temp));
    const maxL = Math.max(...scaled);
    const exps = scaled.map((v) => Math.exp(clamp(v - maxL, -40, 40)));
    const s = exps.reduce((a, b) => a + b, 0) || 1;
    return exps.map((v) => v / s);
  };

  // Initialize & optimize L2-regularized multinomial logistic regression weights ONLY on trainSamples
  const W = Array.from({ length: K }, () => new Array(D).fill(0));
  const lr = 0.12;
  const l2 = 0.05;
  if (trainSamples.length >= 6) {
    const trainCounts = [0, 0, 0];
    for (const s of trainSamples) trainCounts[s.label]++;
    for (let k = 0; k < K; k++) {
      W[k][0] = Math.log(Math.max(0.02, (trainCounts[k] + 0.5) / (trainSamples.length + 1.5)));
    }
    for (let epoch = 0; epoch < 80; epoch++) {
      const grad = Array.from({ length: K }, () => new Array(D).fill(0));
      for (const s of trainSamples) {
        const logits = W.map((wRow) => wRow.reduce((acc, w, j) => acc + w * s.x[j], 0));
        const probs = softmax(logits, 1.0);
        for (let k = 0; k < K; k++) {
          const err = probs[k] - (s.label === k ? 1 : 0);
          for (let j = 0; j < D; j++) {
            grad[k][j] += err * s.x[j];
          }
        }
      }
      for (let k = 0; k < K; k++) {
        for (let j = 0; j < D; j++) {
          const reg = j === 0 ? 0 : l2 * W[k][j];
          W[k][j] -= (lr * (grad[k][j] / trainSamples.length + reg));
        }
      }
    }
  }

  const predictLogits = (xVec) => W.map((wRow) => wRow.reduce((acc, w, j) => acc + w * (xVec[j] ?? 0), 0));

  // Temperature Scaling on calSamples (grid search T in [0.5 .. 3.0] for minimum NLL)
  let bestTemp = 1.0;
  if (calSamples.length >= 5) {
    let bestNll = Infinity;
    for (let t = 0.5; t <= 3.05; t += 0.1) {
      let nll = 0;
      for (const s of calSamples) {
        const p = softmax(predictLogits(s.x), t);
        nll -= Math.log(Math.max(1e-9, p[s.label]));
      }
      if (nll < bestNll) {
        bestNll = nll;
        bestTemp = Number(t.toFixed(2));
      }
    }
  }

  // Evaluate OOS Brier vs Climatology on frozen outerSamples
  const trainOnlyCounts = [0, 0, 0];
  for (const s of trainSamples) trainOnlyCounts[s.label]++;
  const nTr = Math.max(1, trainSamples.length);
  const climP = trainOnlyCounts.map((c) => c / nTr);

  let oosBrierModel = 0;
  let oosBrierClim = 0;
  if (outerSamples.length > 0) {
    for (const s of outerSamples) {
      const pMod = softmax(predictLogits(s.x), bestTemp);
      for (let k = 0; k < K; k++) {
        const yk = s.label === k ? 1 : 0;
        oosBrierModel += (pMod[k] - yk) * (pMod[k] - yk);
        oosBrierClim += (climP[k] - yk) * (climP[k] - yk);
      }
    }
    oosBrierModel /= outerSamples.length;
    oosBrierClim /= outerSamples.length;
  }

  const allEstimable = estimable[0] && estimable[1] && estimable[2];
  const calibrationPassed = outerSamples.length > 0 && allEstimable && oosBrierModel <= oosBrierClim + 1e-9;

  const currentLogits = predictLogits(currentFeatureVec);
  const condProbs = softmax(currentLogits, bestTemp);

  return {
    counts,
    totalLocal,
    estimable,
    rawEmpiricalFrequency,
    conditionalProbabilities: condProbs,
    temperature: bestTemp,
    oosEvaluatedCount: outerSamples.length,
    oosBrierModel: Number(oosBrierModel.toFixed(4)),
    oosBrierClimatology: Number(oosBrierClim.toFixed(4)),
    calibrationPassed,
  };
}
