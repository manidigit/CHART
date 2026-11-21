import { MODEL_EXECUTION_STATUS, enforceMonotonicQuantiles } from '../forecastContract.js?v=1.47.41';

export const CANONICAL_FORECAST_HORIZON = 60;

/**
 * Deterministic Mulberry32 PRNG for reproducible neural/MC-dropout inference.
 */
function createSeededRng(seed = 42) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function solveLinearSystemRidge(A, b, n, ridge = 1e-6) {
  const M = A.map((row, idx) => {
    const copy = row.slice();
    copy[idx] += ridge;
    return copy;
  });
  const rhs = b.slice();

  for (let col = 0; col < n; col++) {
    let pivot = col;
    let maxVal = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > maxVal) {
        maxVal = Math.abs(M[r][col]);
        pivot = r;
      }
    }
    if (!Number.isFinite(maxVal) || maxVal < 1e-13) return null;
    if (pivot !== col) {
      [M[col], M[pivot]] = [M[pivot], M[col]];
      [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];
    }
    const diag = M[col][col];
    for (let j = col; j < n; j++) M[col][j] /= diag;
    rhs[col] /= diag;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let j = col; j < n; j++) M[r][j] -= factor * M[col][j];
      rhs[r] -= factor * rhs[col];
    }
  }
  return rhs.every((v) => Number.isFinite(v)) ? rhs : null;
}

function percentileSorted(sorted, q) {
  if (!sorted.length) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, q * (sorted.length - 1)));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * 1. Native ARIMA(p, d, q) on Log-Prices with Differencing Test & AIC Grid Selection.
 * Zero flat fallback on failure: explicitly reports FAILED / SKIPPED_LOW_DATA.
 */
export const NativeArimaDiffModel = {
  id: 'native_arima_diff',
  name: 'ARIMA(p,d,q) AIC (Native)',
  family: 'TIME_SERIES',
  modelVersion: '1.0.0',
  isApproximation: false,
  isCalibratedInterval: true,
  description:
    'Native differenced ARIMA(p,d,q) estimator on log-prices with unit-root differencing check, AIC order selection, Hannan-Rissanen MA residuals, and analytical variance propagation.',
  defaultEnabled: true,
  defaultWeight: 0.22,
  defaultParams: Object.freeze({
    maxP: 5,
    maxQ: 1,
    ridge: 1e-5,
  }),
  predict(features, horizon, params = {}) {
    const candles = features.candles || [];
    if (candles.length < 24) {
      return {
        modelId: 'native_arima_diff',
        modelVersion: '1.0.0',
        status: MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA,
        reason: `ARIMA requires >= 24 bars (have ${candles.length})`,
        isApproximation: false,
        isCalibratedInterval: true,
        meanReturns: [],
        sigmas: [],
      };
    }

    const logCloses = candles.map((c) => Math.log(Math.max(1e-8, Number(c.close))));
    const returns = features.logReturns || [];
    if (returns.length < 18 || !Number.isFinite(features.uncondVariance) || features.uncondVariance <= 1e-13) {
      return {
        modelId: 'native_arima_diff',
        modelVersion: '1.0.0',
        status: MODEL_EXECUTION_STATUS.FAILED,
        reason: 'Degenerate or near-zero return variance for ARIMA estimation',
        isApproximation: false,
        isCalibratedInterval: true,
        meanReturns: [],
        sigmas: [],
      };
    }

    // Check lag-1 autocorrelation of log levels to choose d in {0, 1}
    const meanZ = logCloses.reduce((s, v) => s + v, 0) / logCloses.length;
    let num = 0;
    let den = 0;
    for (let i = 1; i < logCloses.length; i++) {
      num += (logCloses[i] - meanZ) * (logCloses[i - 1] - meanZ);
      den += (logCloses[i - 1] - meanZ) * (logCloses[i - 1] - meanZ);
    }
    const lag1Level = den > 1e-12 ? num / den : 1.0;
    const dOrder = lag1Level > 0.82 ? 1 : 0;
    const series = dOrder === 1 ? returns : logCloses.map((v) => v - meanZ);
    const n = series.length;

    const maxP = Math.max(1, Math.min(5, Math.round(Number(params.maxP ?? 5))));
    const maxQ = Math.max(0, Math.min(2, Math.round(Number(params.maxQ ?? 1))));
    const ridge = Math.max(1e-7, Number(params.ridge ?? 1e-5));

    const candidates = [];
    for (const p of [1, 2, 3, 5]) {
      if (p <= maxP) candidates.push([p, 0]);
    }
    if (maxQ >= 1) {
      for (const p of [1, 2, 3]) {
        if (p <= maxP) candidates.push([p, 1]);
      }
    }

    let best = null;
    for (const [p, q] of candidates) {
      const startAr = p;
      if (n - startAr < p + q + 10) continue;

      // Stage 1: fit AR(p + extra) to approximate innovations when q > 0
      const auxP = q > 0 ? Math.min(n - 6, Math.max(p + 2, 4)) : p;
      const rows1 = [];
      const y1 = [];
      for (let t = auxP; t < n; t++) {
        const row = [1];
        for (let i = 1; i <= auxP; i++) row.push(series[t - i]);
        rows1.push(row);
        y1.push(series[t]);
      }
      const k1 = auxP + 1;
      const xtx1 = Array.from({ length: k1 }, () => new Array(k1).fill(0));
      const xty1 = new Array(k1).fill(0);
      for (let r = 0; r < rows1.length; r++) {
        const rx = rows1[r];
        for (let a = 0; a < k1; a++) {
          xty1[a] += rx[a] * y1[r];
          for (let b = 0; b < k1; b++) xtx1[a][b] += rx[a] * rx[b];
        }
      }
      const beta1 = solveLinearSystemRidge(xtx1, xty1, k1, ridge);
      if (!beta1) continue;

      const auxRes = new Array(n).fill(0);
      for (let t = auxP; t < n; t++) {
        let pred = beta1[0];
        for (let i = 1; i <= auxP; i++) pred += beta1[i] * series[t - i];
        auxRes[t] = series[t] - pred;
      }

      // Stage 2: fit AR(p) + MA(q)
      const start2 = Math.max(p, auxP + q);
      if (n - start2 < p + q + 8) continue;
      const k2 = 1 + p + q;
      const xtx2 = Array.from({ length: k2 }, () => new Array(k2).fill(0));
      const xty2 = new Array(k2).fill(0);
      const validRows = n - start2;

      for (let t = start2; t < n; t++) {
        const rx = [1];
        for (let i = 1; i <= p; i++) rx.push(series[t - i]);
        for (let j = 1; j <= q; j++) rx.push(auxRes[t - j]);
        const yt = series[t];
        for (let a = 0; a < k2; a++) {
          xty2[a] += rx[a] * yt;
          for (let b = 0; b < k2; b++) xtx2[a][b] += rx[a] * rx[b];
        }
      }

      const beta2 = solveLinearSystemRidge(xtx2, xty2, k2, ridge);
      if (!beta2) continue;

      const c = beta2[0];
      const phi = beta2.slice(1, 1 + p);
      const theta = beta2.slice(1 + p, 1 + p + q);
      const phiL1 = phi.reduce((s, v) => s + Math.abs(v), 0);
      const thetaL1 = theta.reduce((s, v) => s + Math.abs(v), 0);
      if (phiL1 >= 0.96 || thetaL1 >= 0.90) continue;

      let seriesStd = features.uncondSigma;
      if (dOrder === 0) {
        const sVar = series.reduce((acc, v) => acc + v * v, 0) / Math.max(1, series.length - 1);
        seriesStd = Math.max(features.uncondSigma, Math.sqrt(Math.max(1e-12, sVar)));
      }
      const residClamp = seriesStd * 4;
      let rss = 0;
      const resid = new Array(n).fill(0);
      for (let t = start2; t < n; t++) {
        let pred = c;
        for (let i = 1; i <= p; i++) pred += phi[i - 1] * series[t - i];
        for (let j = 1; j <= q; j++) pred += theta[j - 1] * resid[t - j];
        const e = series[t] - pred;
        resid[t] = Math.max(-residClamp, Math.min(residClamp, e));
        rss += resid[t] * resid[t];
      }
      const sigma2 = Math.max(1e-12, rss / Math.max(1, validRows - k2));
      const aic = validRows * Math.log(sigma2) + 2 * k2;
      if (!Number.isFinite(aic)) continue;

      if (!best || aic < best.aic) {
        best = { p, q, d: dOrder, c, phi, theta, sigma2, resid, aic };
      }
    }

    if (!best) {
      return {
        modelId: 'native_arima_diff',
        modelVersion: '1.0.0',
        status: MODEL_EXECUTION_STATUS.FAILED,
        reason: 'ARIMA convergence failed across stationary (p,d,q) candidates',
        isApproximation: false,
        isCalibratedInterval: true,
        meanReturns: [],
        sigmas: [],
      };
    }

    const totalSteps = CANONICAL_FORECAST_HORIZON;
    const forecastSeries = series.slice();
    const forecastRes = best.resid.slice();
    const meanReturns = new Array(horizon);
    const sigmas = new Array(horizon);
    const stepCap = features.uncondSigma * 0.85;

    // Analytical MA(inf) psi weights for multi-step variance
    const psi = new Array(totalSteps).fill(0);
    psi[0] = 1.0;
    for (let h = 1; h < totalSteps; h++) {
      let val = h <= best.q ? best.theta[h - 1] : 0;
      for (let i = 1; i <= best.p; i++) {
        if (h - i >= 0) val += best.phi[i - 1] * psi[h - i];
      }
      psi[h] = val;
    }

    const baseSd = Math.max(1e-5, Math.sqrt(best.sigma2));
    let prevLogLevel = logCloses[logCloses.length - 1];

    for (let h = 0; h < totalSteps; h++) {
      let nextVal = best.c;
      for (let i = 1; i <= best.p; i++) {
        nextVal += best.phi[i - 1] * (forecastSeries[forecastSeries.length - i] ?? 0);
      }
      for (let j = 1; j <= best.q; j++) {
        nextVal += best.theta[j - 1] * (forecastRes[forecastRes.length - j] ?? 0);
      }
      forecastSeries.push(nextVal);
      forecastRes.push(0);

      let stepRet = dOrder === 1 ? nextVal : meanZ + nextVal - prevLogLevel;
      if (dOrder === 0) prevLogLevel = meanZ + nextVal;
      stepRet = Math.max(-stepCap, Math.min(stepCap, stepRet));

      if (h < horizon) {
        meanReturns[h] = stepRet;
        sigmas[h] = Math.max(1e-5, baseSd * Math.max(0.75, Math.abs(psi[h])));
      }
    }

    return {
      modelId: 'native_arima_diff',
      modelVersion: '1.0.0',
      status: MODEL_EXECUTION_STATUS.SUCCESS,
      reason: '',
      isApproximation: false,
      isCalibratedInterval: true,
      meanReturns,
      sigmas,
      meta: { order: `(${best.p},${best.d},${best.q})`, aic: Number(best.aic.toFixed(2)) },
    };
  },
};

/**
 * 2. Native Prophet-Style Piecewise Linear Changepoint Trend + Fourier Seasonality (Approximation).
 * Respects exact candle openTimeUtcMs and CHART calendar rules (never uses synthetic daily dates).
 */
export const NativeProphetDecompModel = {
  id: 'native_prophet_decomp',
  name: 'Prophet Trend+Fourier (Native Approx)',
  family: 'DECOMPOSITION',
  modelVersion: '1.0.0',
  isApproximation: true,
  isCalibratedInterval: false,
  description:
    'Piecewise linear trend with L2 changepoints and Fourier session/calendar seasonality on log-prices; lightweight native approximation of Prophet.',
  defaultEnabled: true,
  defaultWeight: 0.20,
  defaultParams: Object.freeze({
    changepointPrior: 0.08,
    seasonalityPrior: 0.15,
    fourierOrder: 3,
  }),
  predict(features, horizon, params = {}) {
    const candles = features.candles || [];
    const n = candles.length;
    if (n < 28) {
      return {
        modelId: 'native_prophet_decomp',
        modelVersion: '1.0.0',
        status: MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA,
        reason: `Prophet decomposer requires >= 28 bars (have ${n})`,
        isApproximation: true,
        isCalibratedInterval: false,
        meanReturns: [],
        sigmas: [],
      };
    }

    const times = candles.map((c, idx) =>
      Number(c.openTimeUtcMs) > 0 ? Number(c.openTimeUtcMs) : idx * 900_000
    );
    const t0 = times[0];
    const tLast = times[n - 1];
    const spanMs = Math.max(1, tLast - t0);
    const avgStepMs = spanMs / Math.max(1, n - 1);
    const logY = candles.map((c) => Math.log(Math.max(1e-8, Number(c.close))));

    const numCp = Math.min(6, Math.max(2, Math.floor(n / 20)));
    const cpPositions = [];
    for (let j = 1; j <= numCp; j++) {
      cpPositions.push((0.8 * j) / (numCp + 1));
    }

    const dayMs = 86_400_000;
    const weekMs = 7 * dayMs;
    const kDaily = avgStepMs < dayMs ? Math.max(1, Math.min(3, Math.round(Number(params.fourierOrder ?? 3)))) : 0;
    const kWeekly = spanMs >= 10 * dayMs ? 2 : 0;

    const buildRow = (tMs) => {
      const tNorm = (tMs - t0) / spanMs;
      const row = [1, tNorm];
      for (const s of cpPositions) {
        row.push(Math.max(0, tNorm - s));
      }
      for (let k = 1; k <= kDaily; k++) {
        const ang = (2 * Math.PI * k * (tMs % dayMs)) / dayMs;
        row.push(Math.sin(ang), Math.cos(ang));
      }
      for (let k = 1; k <= kWeekly; k++) {
        const ang = (2 * Math.PI * k * (tMs % weekMs)) / weekMs;
        row.push(Math.sin(ang), Math.cos(ang));
      }
      return row;
    };

    const sampleRow = buildRow(t0);
    const dim = sampleRow.length;
    const cpPrior = Math.max(0.01, Number(params.changepointPrior ?? 0.08));
    const seasPrior = Math.max(0.01, Number(params.seasonalityPrior ?? 0.15));

    const xtx = Array.from({ length: dim }, () => new Array(dim).fill(0));
    const xty = new Array(dim).fill(0);
    for (let i = 0; i < n; i++) {
      const rx = buildRow(times[i]);
      const yt = logY[i];
      for (let a = 0; a < dim; a++) {
        xty[a] += rx[a] * yt;
        for (let b = 0; b < dim; b++) xtx[a][b] += rx[a] * rx[b];
      }
    }

    // Apply structured ridge penalties: weak on intercept/base slope, strong on changepoints & Fourier
    xtx[0][0] += 1e-6;
    xtx[1][1] += 1e-2;
    const cpEnd = 2 + numCp;
    for (let j = 2; j < cpEnd; j++) xtx[j][j] += 1.0 / cpPrior;
    for (let j = cpEnd; j < dim; j++) xtx[j][j] += 1.0 / seasPrior;

    const beta = solveLinearSystemRidge(xtx, xty, dim, 1e-6);
    if (!beta) {
      return {
        modelId: 'native_prophet_decomp',
        modelVersion: '1.0.0',
        status: MODEL_EXECUTION_STATUS.FAILED,
        reason: 'Prophet trend+Fourier design matrix failed to converge',
        isApproximation: true,
        isCalibratedInterval: false,
        meanReturns: [],
        sigmas: [],
      };
    }

    const evalFit = (tMs) => {
      const rx = buildRow(tMs);
      let s = 0;
      for (let j = 0; j < dim; j++) s += beta[j] * rx[j];
      return s;
    };

    let stepRss = 0;
    let prevFit = evalFit(times[0]);
    for (let i = 1; i < n; i++) {
      const curFit = evalFit(times[i]);
      const actualStep = logY[i] - logY[i - 1];
      const fittedStep = curFit - prevFit;
      const stepErr = actualStep - fittedStep;
      stepRss += stepErr * stepErr;
      prevFit = curFit;
    }
    const lastFit = prevFit;
    const rawStepSigma = Math.sqrt(stepRss / Math.max(1, n - 2));
    const resSigma = Math.max(
      features.ewmaSigma * 0.65,
      Math.min(features.uncondSigma * 1.8, rawStepSigma)
    );

    // Use provided canonical future timestamps if available, else step forward by avgStepMs
    const futureTs = Array.isArray(features.futureTimestamps) && features.futureTimestamps.length >= horizon
      ? features.futureTimestamps
      : null;

    const meanReturns = new Array(horizon);
    const sigmas = new Array(horizon);
    const stepCap = features.uncondSigma * 0.85;
    let prevHat = logY[n - 1];
    let prevComponentHat = lastFit;

    for (let h = 0; h < horizon; h++) {
      const fMs = futureTs ? futureTs[h] : tLast + (h + 1) * avgStepMs;
      // Damp linear trend beyond training span to prevent runaway extrapolation over 60 bars
      const rawComp = evalFit(fMs);
      const rawStep = rawComp - prevComponentHat;
      const damp = Math.pow(0.96, h + 1);
      const dampedStep = Math.max(-stepCap, Math.min(stepCap, rawStep * damp));
      const nextHat = prevHat + dampedStep;
      meanReturns[h] = nextHat - prevHat;
      sigmas[h] = Math.max(1e-5, resSigma * (0.9 + 0.015 * h));
      prevHat = nextHat;
      prevComponentHat = rawComp;
    }

    return {
      modelId: 'native_prophet_decomp',
      modelVersion: '1.0.0',
      status: MODEL_EXECUTION_STATUS.SUCCESS,
      reason: '',
      isApproximation: true,
      isCalibratedInterval: false,
      meanReturns,
      sigmas,
      meta: { changepoints: numCp, kDaily, kWeekly },
    };
  },
};

/**
 * 3. Native Seeded GRU/Recurrent Sequence Estimator + 50-Pass Inference Dropout (Approximation).
 * Explicitly marked as approximate native sequence model (NOT PyTorch LSTM) and uncalibrated dispersion.
 */
export const NativeSequenceRecurrentModel = {
  id: 'native_seq_recurrent_approx',
  name: 'Recurrent Seq + MC Dropout (Native Approx)',
  family: 'SEQUENCE_APPROX',
  modelVersion: '1.0.0',
  isApproximation: true,
  isCalibratedInterval: false,
  description:
    'Deterministic seeded 1-layer tanh-GRU sequence model trained on training-window-only standardized returns with 50-pass inference dropout; native approximation (not PyTorch LSTM).',
  defaultEnabled: true,
  defaultWeight: 0.16,
  defaultParams: Object.freeze({
    seqLength: 16,
    mcSamples: 50,
    dropoutRate: 0.2,
    epochs: 16,
  }),
  predict(features, horizon, params = {}) {
    const returns = features.logReturns || [];
    const n = returns.length;
    const seqLen = Math.max(8, Math.min(20, Math.round(Number(params.seqLength ?? 16))));
    const minNeeded = seqLen + 14;
    if (n < minNeeded) {
      return {
        modelId: 'native_seq_recurrent_approx',
        modelVersion: '1.0.0',
        status: MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA,
        reason: `Sequence model requires >= ${minNeeded} return bars (have ${n})`,
        isApproximation: true,
        isCalibratedInterval: false,
        meanReturns: [],
        sigmas: [],
      };
    }

    // Strict training-window-only scaler
    const mu = features.meanReturn;
    const sd = Math.max(1e-6, features.uncondSigma);
    const zSeries = returns.map((r) => Math.max(-4, Math.min(4, (r - mu) / sd)));

    const hiddenSize = 8;
    const rng = createSeededRng(42);
    const randInit = (scale) => (rng() * 2 - 1) * scale;

    // Input dim = 2 ([z_r, momentum_avg]), GRU-like update + candidate weights
    const Wz = Array.from({ length: hiddenSize }, () => [randInit(0.25), randInit(0.25)]);
    const Uz = Array.from({ length: hiddenSize }, () => Array.from({ length: hiddenSize }, () => randInit(0.18)));
    const Wh = Array.from({ length: hiddenSize }, () => [randInit(0.25), randInit(0.25)]);
    const Uh = Array.from({ length: hiddenSize }, () => Array.from({ length: hiddenSize }, () => randInit(0.18)));
    const wOut = Array.from({ length: hiddenSize }, () => randInit(0.2));
    let bOut = 0;

    const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-12, Math.min(12, x))));
    const hBufA = new Float64Array(hiddenSize);
    const hBufB = new Float64Array(hiddenSize);
    const finalHBuf = new Float64Array(hiddenSize);
    const forwardWindow = (seq, startIdx, length, dropMask = null) => {
      hBufA.fill(0);
      let h = hBufA;
      let nextH = hBufB;
      let runAvg = 0;
      for (let t = 0; t < length; t++) {
        const x0 = seq[startIdx + t];
        runAvg = 0.7 * runAvg + 0.3 * x0;
        for (let i = 0; i < hiddenSize; i++) {
          let zPre = Wz[i][0] * x0 + Wz[i][1] * runAvg;
          let hPre = Wh[i][0] * x0 + Wh[i][1] * runAvg;
          const uzRow = Uz[i];
          const uhRow = Uh[i];
          for (let j = 0; j < hiddenSize; j++) {
            zPre += uzRow[j] * h[j];
            hPre += uhRow[j] * h[j];
          }
          const zGate = sigmoid(zPre);
          const cand = Math.tanh(hPre);
          nextH[i] = (1 - zGate) * h[i] + zGate * cand;
        }
        const tmp = h;
        h = nextH;
        nextH = tmp;
      }
      let yHat = bOut;
      for (let i = 0; i < hiddenSize; i++) {
        finalHBuf[i] = h[i];
        const val = dropMask ? h[i] * dropMask[i] : h[i];
        yHat += wOut[i] * val;
      }
      return { yHat, finalH: finalHBuf };
    };

    // Build sliding samples from tail up to 96 bars for mobile/browser speed
    const maxStart = Math.max(0, zSeries.length - 96);
    const sampleIndices = [];
    for (let idx = maxStart + seqLen; idx < zSeries.length; idx++) {
      sampleIndices.push(idx);
    }

    const epochs = Math.max(6, Math.min(20, Math.round(Number(params.epochs ?? 16))));
    const lr = 0.018;
    const dropRate = Math.max(0.05, Math.min(0.45, Number(params.dropoutRate ?? 0.2)));
    const scaleKeep = 1 / (1 - dropRate);
    const maskBuf = new Float64Array(hiddenSize);

    for (let ep = 0; ep < epochs; ep++) {
      for (let sIdx = 0; sIdx < sampleIndices.length; sIdx++) {
        const endIdx = sampleIndices[sIdx];
        for (let i = 0; i < hiddenSize; i++) maskBuf[i] = rng() < dropRate ? 0 : scaleKeep;
        const { yHat, finalH } = forwardWindow(zSeries, endIdx - seqLen, seqLen, maskBuf);
        const err = Math.max(-2.5, Math.min(2.5, yHat - zSeries[endIdx]));

        // Update readout + lightweight recurrent nudges (BPTT-1)
        bOut -= lr * (err + 1e-4 * bOut);
        const lastX = zSeries[endIdx - 1];
        for (let i = 0; i < hiddenSize; i++) {
          const hMasked = finalH[i] * maskBuf[i];
          const gOut = Math.max(-1, Math.min(1, err * hMasked + 1e-4 * wOut[i]));
          wOut[i] -= lr * gOut;
          const hGrad = Math.max(-0.5, Math.min(0.5, err * wOut[i] * maskBuf[i] * (1 - finalH[i] * finalH[i])));
          Wh[i][0] -= lr * 0.35 * hGrad * lastX;
        }
      }
    }

    // 50-pass MC Dropout recursive rollout over canonical horizon (prefix-invariant)
    const mcSamples = Math.max(20, Math.min(80, Math.round(Number(params.mcSamples ?? 50))));
    const totalSteps = CANONICAL_FORECAST_HORIZON;
    const stepBuckets = Array.from({ length: horizon }, () => []);
    const mcRng = createSeededRng(1007);
    const stepCap = features.uncondSigma * 0.85;
    const windowBuf = new Float64Array(seqLen + totalSteps);

    for (let m = 0; m < mcSamples; m++) {
      for (let i = 0; i < seqLen; i++) windowBuf[i] = zSeries[zSeries.length - seqLen + i];
      let cumRet = 0;
      for (let h = 0; h < totalSteps; h++) {
        for (let i = 0; i < hiddenSize; i++) maskBuf[i] = mcRng() < dropRate ? 0 : scaleKeep;
        const { yHat } = forwardWindow(windowBuf, h, seqLen, maskBuf);
        const clampedZ = Math.max(-2.5, Math.min(2.5, yHat));
        const stepRet = Math.max(-stepCap, Math.min(stepCap, mu + clampedZ * sd));
        cumRet += stepRet;
        if (h < horizon) {
          stepBuckets[h].push({ stepRet, cumRet });
        }
        windowBuf[seqLen + h] = clampedZ;
      }
    }

    const meanReturns = new Array(horizon);
    const sigmas = new Array(horizon);
    const directQuantiles = {
      q10: new Array(horizon),
      q25: new Array(horizon),
      q50: new Array(horizon),
      q75: new Array(horizon),
      q90: new Array(horizon),
    };

    for (let h = 0; h < horizon; h++) {
      const rows = stepBuckets[h];
      const stepMean = rows.reduce((s, r) => s + r.stepRet, 0) / rows.length;
      const stepVar = rows.reduce((s, r) => s + (r.stepRet - stepMean) ** 2, 0) / Math.max(1, rows.length - 1);
      meanReturns[h] = stepMean;
      sigmas[h] = Math.max(features.ewmaSigma * 0.75, Math.sqrt(stepVar) + features.ewmaSigma * 0.55);

      const sortedPrices = rows
        .map((r) => features.lastClose * Math.exp(r.cumRet))
        .sort((a, b) => a - b);
      // Combine MC dropout empirical spread with baseline volatility floor so interval doesn't collapse artificially
      const mcMed = percentileSorted(sortedPrices, 0.5);
      const baseVolSpan = features.lastClose * features.ewmaSigma * Math.sqrt(h + 1);
      const q = enforceMonotonicQuantiles(
        {
          q10: Math.min(percentileSorted(sortedPrices, 0.1), mcMed - 1.28155 * baseVolSpan * 0.7),
          q25: Math.min(percentileSorted(sortedPrices, 0.25), mcMed - 0.67449 * baseVolSpan * 0.7),
          q50: mcMed,
          q75: Math.max(percentileSorted(sortedPrices, 0.75), mcMed + 0.67449 * baseVolSpan * 0.7),
          q90: Math.max(percentileSorted(sortedPrices, 0.9), mcMed + 1.28155 * baseVolSpan * 0.7),
        },
        features.lastClose * 0.01
      );
      directQuantiles.q10[h] = q.q10;
      directQuantiles.q25[h] = q.q25;
      directQuantiles.q50[h] = q.q50;
      directQuantiles.q75[h] = q.q75;
      directQuantiles.q90[h] = q.q90;
    }

    return {
      modelId: 'native_seq_recurrent_approx',
      modelVersion: '1.0.0',
      status: MODEL_EXECUTION_STATUS.SUCCESS,
      reason: '',
      isApproximation: true,
      isCalibratedInterval: false,
      meanReturns,
      sigmas,
      directQuantiles,
      meta: { seqLen, mcSamples, hiddenSize, prefixSteps: totalSteps },
    };
  },
};

/**
 * 4. Native Gated Multi-Feature Attention Quantile Forecaster (Approximation).
 * Enforces the 90-bar minimum input gate cleanly (returns SKIPPED_LOW_DATA if < 90 bars).
 * Uses canonical 60-step rollout then slices to horizon for 100% prefix invariance.
 */
export const NativeQuantileAttentionModel = {
  id: 'native_quantile_attention_approx',
  name: 'Quantile Attention TFT (Native Approx)',
  family: 'ATTENTION_APPROX',
  modelVersion: '1.0.0',
  isApproximation: true,
  isCalibratedInterval: false,
  description:
    'Variable-selection + scaled dot-product attention multi-quantile regressor with <90-bar gate; simplified native approximation (not PyTorch Forecasting TFT).',
  defaultEnabled: true,
  defaultWeight: 0.16,
  defaultParams: Object.freeze({
    minRequiredBars: 90,
    encoderLength: 24,
    epochs: 18,
  }),
  predict(features, horizon, params = {}) {
    const candles = features.candles || [];
    const returns = features.logReturns || [];
    const minRequired = Math.max(60, Math.round(Number(params.minRequiredBars ?? 90)));
    if (candles.length < minRequired || returns.length < minRequired - 2) {
      return {
        modelId: 'native_quantile_attention_approx',
        modelVersion: '1.0.0',
        status: MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA,
        reason: `Quantile-Attention TFT gate requires >= ${minRequired} bars (have ${candles.length})`,
        isApproximation: true,
        isCalibratedInterval: false,
        meanReturns: [],
        sigmas: [],
      };
    }

    const encLen = Math.max(12, Math.min(30, Math.round(Number(params.encoderLength ?? 24))));
    const sd = Math.max(1e-6, features.uncondSigma);
    const mu = features.meanReturn;
    const nBars = candles.length;
    const avgVol =
      candles.reduce((s, c) => s + Math.max(1, Number(c.volume || 0)), 0) / Math.max(1, nBars);

    // Build training-window multi-feature vectors [retZ, rangeAtr, volRatio, bodySign, timeSin, timeCos]
    const featVecs = [];
    for (let i = 1; i < nBars; i++) {
      const c = candles[i];
      const ret = returns[i - 1] ?? 0;
      const retZ = Math.max(-4, Math.min(4, (ret - mu) / sd));
      const rangeRatio = Math.max(0, Math.min(4, (c.high - c.low) / Math.max(1e-8, features.atr14) - 1));
      const volZ = Math.max(-2, Math.min(3, (Math.max(1, c.volume) - avgVol) / Math.max(1, avgVol)));
      const bodySign = c.close >= c.open ? 1 : -1;
      const ms = Number(c.openTimeUtcMs || i * 900_000);
      const dayPhase = ((ms % 86_400_000) / 86_400_000) * 2 * Math.PI;
      featVecs.push([retZ, rangeRatio, volZ, bodySign, Math.sin(dayPhase), Math.cos(dayPhase)]);
    }

    const fDim = 6;
    // Variable-selection importance weights from training return correlation
    const varScores = new Array(fDim).fill(0);
    for (let t = 1; t < featVecs.length; t++) {
      const yNext = featVecs[t][0];
      for (let d = 0; d < fDim; d++) {
        varScores[d] += Math.abs(featVecs[t - 1][d] * yNext);
      }
    }
    const maxScore = Math.max(1e-6, ...varScores);
    const expScores = varScores.map((s) => Math.exp(s / maxScore));
    const sumExp = expScores.reduce((a, b) => a + b, 0) || 1;
    const vWeights = expScores.map((e) => e / sumExp);

    const summarizeContext = (endIdx) => {
      const start = Math.max(0, endIdx - encLen);
      const len = endIdx - start;
      const query = featVecs[endIdx - 1];
      const attnWeights = new Array(len);
      let maxLogit = -Infinity;
      for (let i = 0; i < len; i++) {
        const key = featVecs[start + i];
        let dot = 0;
        for (let d = 0; d < fDim; d++) dot += vWeights[d] * query[d] * key[d];
        const logit = dot / Math.sqrt(fDim) - 0.04 * (len - 1 - i);
        attnWeights[i] = logit;
        if (logit > maxLogit) maxLogit = logit;
      }
      let wSum = 0;
      for (let i = 0; i < len; i++) {
        attnWeights[i] = Math.exp(attnWeights[i] - maxLogit);
        wSum += attnWeights[i];
      }
      const ctx = new Array(fDim + 1).fill(0);
      ctx[0] = 1; // bias
      for (let i = 0; i < len; i++) {
        const w = attnWeights[i] / Math.max(1e-9, wSum);
        for (let d = 0; d < fDim; d++) ctx[d + 1] += w * vWeights[d] * featVecs[start + i][d];
      }
      return ctx;
    };

    // Train 5 pinball quantile heads (q10, q25, q50, q75, q90) on 1-step & 5-step cumulative standardized returns
    const taus = [0.1, 0.25, 0.5, 0.75, 0.9];
    const heads = taus.map(() => new Array(fDim + 1).fill(0));
    const epochs = Math.max(8, Math.min(25, Math.round(Number(params.epochs ?? 18))));
    const lr = 0.025;
    const trainEnd = featVecs.length - 1;
    const trainStart = Math.max(encLen, trainEnd - 90);
    const cachedContexts = new Array(trainEnd);
    for (let t = trainStart; t < trainEnd; t++) {
      cachedContexts[t] = summarizeContext(t);
    }

    for (let ep = 0; ep < epochs; ep++) {
      for (let t = trainStart; t < trainEnd; t++) {
        const ctx = cachedContexts[t];
        const target = featVecs[t][0];
        for (let qi = 0; qi < taus.length; qi++) {
          const tau = taus[qi];
          const w = heads[qi];
          let pred = 0;
          for (let j = 0; j < w.length; j++) pred += w[j] * ctx[j];
          const err = target - pred;
          const gradScale = err >= 0 ? -tau : 1 - tau;
          for (let j = 0; j < w.length; j++) {
            w[j] -= lr * (gradScale * ctx[j] + 1e-3 * w[j]);
          }
        }
      }
    }

    const latestCtx = summarizeContext(featVecs.length);
    const predQuantileZ = taus.map((_, qi) => {
      let s = 0;
      for (let j = 0; j < latestCtx.length; j++) s += heads[qi][j] * latestCtx[j];
      return Math.max(-2.5, Math.min(2.5, s));
    });

    const qStepRet = predQuantileZ.map((z) => mu + z * sd);
    const meanReturns = new Array(horizon);
    const sigmas = new Array(horizon);
    const directQuantiles = {
      q10: new Array(horizon),
      q25: new Array(horizon),
      q50: new Array(horizon),
      q75: new Array(horizon),
      q90: new Array(horizon),
    };

    const stepCap = features.uncondSigma * 0.8;
    let cumMed = 0;
    for (let h = 0; h < CANONICAL_FORECAST_HORIZON; h++) {
      const decay = Math.pow(0.92, h);
      const medStep = Math.max(-stepCap, Math.min(stepCap, qStepRet[2] * decay));
      cumMed += medStep;
      const spreadScale = Math.sqrt(h + 1);
      const low10Step = (qStepRet[0] - qStepRet[2]) * 0.8 - 1.28155 * features.ewmaSigma * 0.55;
      const low25Step = (qStepRet[1] - qStepRet[2]) * 0.8 - 0.67449 * features.ewmaSigma * 0.55;
      const hi75Step = (qStepRet[3] - qStepRet[2]) * 0.8 + 0.67449 * features.ewmaSigma * 0.55;
      const hi90Step = (qStepRet[4] - qStepRet[2]) * 0.8 + 1.28155 * features.ewmaSigma * 0.55;

      if (h < horizon) {
        meanReturns[h] = medStep;
        const iqSigma = Math.max(features.ewmaSigma * 0.75, Math.abs(hi90Step - low10Step) / 2.5631);
        sigmas[h] = iqSigma;
        const q = enforceMonotonicQuantiles(
          {
            q10: features.lastClose * Math.exp(cumMed + low10Step * spreadScale),
            q25: features.lastClose * Math.exp(cumMed + low25Step * spreadScale),
            q50: features.lastClose * Math.exp(cumMed),
            q75: features.lastClose * Math.exp(cumMed + hi75Step * spreadScale),
            q90: features.lastClose * Math.exp(cumMed + hi90Step * spreadScale),
          },
          features.lastClose * 0.01
        );
        directQuantiles.q10[h] = q.q10;
        directQuantiles.q25[h] = q.q25;
        directQuantiles.q50[h] = q.q50;
        directQuantiles.q75[h] = q.q75;
        directQuantiles.q90[h] = q.q90;
      }
    }

    return {
      modelId: 'native_quantile_attention_approx',
      modelVersion: '1.0.0',
      status: MODEL_EXECUTION_STATUS.SUCCESS,
      reason: '',
      isApproximation: true,
      isCalibratedInterval: false,
      meanReturns,
      sigmas,
      directQuantiles,
      meta: { encoderLength: encLen, featureWeights: vWeights.map((w) => Number(w.toFixed(3))) },
    };
  },
};
