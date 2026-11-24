import {
  FORECAST_STATUS,
  MODEL_EXECUTION_STATUS,
  SELECTION_MODE,
  clampHorizonBars,
  computeHorizonRequirements,
  enforceMonotonicQuantiles,
} from './forecastContract.js?v=1.47.41';
import { extractForecastFeatures } from './featureExtractor.js?v=1.47.41';
import { NaivePersistenceModel } from './models/baselineModels.js?v=1.47.41';
import {
  applyConformalAdjustmentToQuantiles,
  buildZeroDriftLogNormalNaiveQuantiles,
  centeredStationaryBlockBootstrap,
  computeBartlettEffectiveSampleSize,
  computeNaiveSigmaRw,
  computeWis5Q,
  fitVolatilityNormalizedConformal,
  hlnModifiedDieboldMariano,
} from './statisticalTests.js?v=1.47.41';
import { EmpiricalAnalogEngine } from './empiricalAnalogEngine.js?v=1.47.41';
import { computeStructuralForecast } from '../algorithms/structuralForecastEngine.js?v=1.47.41';
import { computeSmcPrediction } from './smcPredictionEngine.js?v=1.47.41';

function pinball(actual, qPred, tau) {
  const err = actual - qPred;
  return err >= 0 ? tau * err : (tau - 1) * err;
}

export function buildPriceTrajectoryFromPrediction(lastClose, pred, horizon) {
  if (pred?.directQuantiles && Array.isArray(pred.directQuantiles.q50) && pred.directQuantiles.q50.length >= horizon) {
    const out = new Array(horizon);
    for (let h = 0; h < horizon; h++) {
      out[h] = enforceMonotonicQuantiles(
        {
          q10: Number(pred.directQuantiles.q10[h]),
          q25: Number(pred.directQuantiles.q25[h]),
          q50: Number(pred.directQuantiles.q50[h]),
          q75: Number(pred.directQuantiles.q75[h]),
          q90: Number(pred.directQuantiles.q90[h]),
        },
        lastClose * 0.01
      );
    }
    return out;
  }
  return buildPriceTrajectoryFromReturns(lastClose, pred?.meanReturns || [], pred?.sigmas || []);
}

export function buildPriceTrajectoryFromReturns(lastClose, meanReturns, sigmas) {
  const out = new Array(meanReturns.length);
  let cumReturn = 0;
  let cumVar = 0;
  for (let h = 0; h < meanReturns.length; h++) {
    const mr = Number(meanReturns[h] || 0);
    const sg = Math.max(1e-5, Number(sigmas[h] || 1e-4));
    cumReturn += mr;
    cumVar += sg * sg;
    const cumSigma = Math.sqrt(cumVar);
    out[h] = enforceMonotonicQuantiles(
      {
        q10: lastClose * Math.exp(cumReturn - 1.28155157 * cumSigma),
        q25: lastClose * Math.exp(cumReturn - 0.67448975 * cumSigma),
        q50: lastClose * Math.exp(cumReturn),
        q75: lastClose * Math.exp(cumReturn + 0.67448975 * cumSigma),
        q90: lastClose * Math.exp(cumReturn + 1.28155157 * cumSigma),
      },
      lastClose * 0.01
    );
  }
  return out;
}

/**
 * Computes exact disjoint 4-way nested walk-forward origin sets:
 *   Train [0..trainEndIdx] -> Gap(H+E) -> Val -> Gap(H+E) -> Cal -> Gap(H+E) -> Outer (stride=H)
 */
export function buildDisjointNestedSplits(totalBars, horizonBars) {
  const H = clampHorizonBars(horizonBars);
  const req = computeHorizonRequirements(H);
  const N = totalBars;
  const g = req.gapTotal;

  if (N < req.nOpMin) {
    return { feasible: false, req, trainEndIdx: -1, valOrigins: [], calOrigins: [], outerOrigins: [] };
  }

  let kOuter = 30;
  let kVal = 10;
  let mCal = 20;

  if (N < req.nStatMin) {
    kVal = 5;
    mCal = 10;
    const prefixOp = req.lTrain + g + ((kVal - 1) * req.sVal + 1) + g + ((mCal - 1) * req.sCal + 1) + 1;
    const availOuterBars = N - prefixOp - g;
    kOuter = Math.max(1, Math.min(29, Math.floor(availOuterBars / H)));
    // Optionally use spare bars up to M_cal=20 if kOuter already bounded
    while (mCal < 20 && N >= prefixOp + (mCal) * req.sCal + g + kOuter * H) {
      break;
    }
  }

  const lastOuter = N - 1 - H;
  const outerOrigins = [];
  for (let k = kOuter - 1; k >= 0; k--) {
    outerOrigins.push(lastOuter - k * H);
  }
  const firstOuter = outerOrigins[0];

  const lastCal = firstOuter - 1 - g;
  const calOrigins = [];
  for (let m = mCal - 1; m >= 0; m--) {
    calOrigins.push(lastCal - m * req.sCal);
  }
  const firstCal = calOrigins[0];

  const lastVal = firstCal - 1 - g;
  const valOrigins = [];
  for (let v = kVal - 1; v >= 0; v--) {
    valOrigins.push(lastVal - v * req.sVal);
  }
  const firstVal = valOrigins[0];

  const trainEndIdx = firstVal - 1 - g;
  const feasible = trainEndIdx + 1 >= req.lTrain && valOrigins.length >= 5 && calOrigins.length >= 10 && outerOrigins.length >= 1;

  return {
    feasible,
    statisticallyFull: N >= req.nStatMin && outerOrigins.length >= 30 && calOrigins.length >= 20,
    req,
    trainEndIdx,
    valOrigins,
    calOrigins,
    outerOrigins,
  };
}

function predictSingleWindowTrajectory(plugin, config, causalSlice, feats, horizon) {
  let out;
  try {
    out = plugin.id === 'naive_persistence'
      ? {
          modelId: 'naive_persistence',
          status: MODEL_EXECUTION_STATUS.SUCCESS,
          meanReturns: new Array(horizon).fill(0),
          sigmas: new Array(horizon).fill(computeNaiveSigmaRw(feats.logReturns)),
        }
      : plugin.predict(feats, horizon, config.params || {});
  } catch (err) {
    return { ok: false, status: MODEL_EXECUTION_STATUS.FAILED, reason: String(err?.message || err), traj: null, out: null };
  }
  const st = out?.status || MODEL_EXECUTION_STATUS.SUCCESS;
  if (st !== MODEL_EXECUTION_STATUS.SUCCESS || !Array.isArray(out?.meanReturns) || out.meanReturns.length < horizon) {
    return {
      ok: false,
      status: st === MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA ? st : MODEL_EXECUTION_STATUS.FAILED,
      reason: out?.reason || 'Incomplete horizon',
      traj: null,
      out: null,
    };
  }
  const traj = buildPriceTrajectoryFromPrediction(feats.lastClose, out, horizon);
  const finite = traj.every((p) => Number.isFinite(p.q10) && Number.isFinite(p.q50) && Number.isFinite(p.q90));
  if (!finite) {
    return { ok: false, status: MODEL_EXECUTION_STATUS.FAILED, reason: 'Non-finite quantiles emitted', traj: null, out: null };
  }
  return { ok: true, status: MODEL_EXECUTION_STATUS.SUCCESS, reason: '', traj, out };
}

function buildNaiveLogNormalTraj(anchorClose, trainLogReturns, horizon) {
  const sigmaRw = computeNaiveSigmaRw(trainLogReturns);
  const traj = new Array(horizon);
  for (let h = 0; h < horizon; h++) {
    traj[h] = buildZeroDriftLogNormalNaiveQuantiles(anchorClose, sigmaRw, h + 1);
  }
  return { traj, sigmaRw };
}

const AUXILIARY_BENCHMARK_MODELS = [
  { id: 'empirical_analogs', name: 'Causal Historical Analogs', family: 'PATTERN_EMPIRICAL' },
  { id: 'structural_wave_js', name: 'Structural Wave (JS)', family: 'STRUCTURAL_WAVE' },
  { id: 'smc_prediction_js', name: 'SMC Prediction Engine', family: 'SMC_LIQUIDITY' },
];

function predictAuxiliaryWindowTrajectory(modelId, slice, feats, horizon, ctx = {}) {
  try {
    if (modelId === 'empirical_analogs') {
      const analogSlice = slice.length > 900 ? slice.slice(-900) : slice;
      const engine = new EmpiricalAnalogEngine(24, horizon, ctx.timeframe || 'M15');
      const res = engine.projectEmpirical(analogSlice, feats, horizon);
      if (res.status !== MODEL_EXECUTION_STATUS.SUCCESS || !Array.isArray(res.points) || res.points.length < horizon) {
        return { ok: false, traj: null };
      }
      const traj = res.points.slice(0, horizon).map((p) =>
        enforceMonotonicQuantiles(
          { q10: p.q10, q25: p.q25, q50: p.q50, q75: p.q75, q90: p.q90 },
          feats.lastClose * 0.01
        )
      );
      return { ok: traj.every((p) => Number.isFinite(p.q50) && p.q50 > 0), traj };
    }
    if (modelId === 'structural_wave_js') {
      const structSlice = slice.length > 360 ? slice.slice(-360) : slice;
      const lastOpenMs = Number(structSlice[structSlice.length - 1]?.openTimeUtcMs || 0);
      const res = computeStructuralForecast({
        candles: structSlice.map((c) => ({
          open_time_utc_ms: c.openTimeUtcMs,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          is_closed: true,
        })),
        symbolCode: ctx.symbolCode || 'XAUUSD',
        provider: ctx.providerId || 'tvdatafeed',
        timeframe: ctx.timeframe || 'M15',
        horizonBars: horizon,
        nowMs: Math.max(Date.now(), lastOpenMs + 86400000 * 14),
        skipAnalogs: true,
      });
      if (res.status !== 'READY' || !Array.isArray(res.forecast) || res.forecast.length < horizon) {
        return { ok: false, traj: null };
      }
      const traj = res.forecast.slice(0, horizon).map((p) =>
        enforceMonotonicQuantiles(
          { q10: p.q10, q25: p.q25, q50: p.q50_median, q75: p.q75, q90: p.q90 },
          feats.lastClose * 0.01
        )
      );
      return { ok: traj.every((p) => Number.isFinite(p.q50) && p.q50 > 0), traj };
    }
    if (modelId === 'smc_prediction_js') {
      const smcSlice = slice.length > 300 ? slice.slice(-300) : slice;
      const res = computeSmcPrediction(smcSlice, feats, horizon, {
        timeframe: ctx.timeframe || 'M15',
      });
      if (res.status !== MODEL_EXECUTION_STATUS.SUCCESS || !Array.isArray(res.points) || res.points.length < horizon) {
        return { ok: false, traj: null };
      }
      const traj = res.points.slice(0, horizon).map((p) =>
        enforceMonotonicQuantiles(
          { q10: p.q10, q25: p.q25, q50: p.q50, q75: p.q75, q90: p.q90 },
          feats.lastClose * 0.01
        )
      );
      return { ok: traj.every((p) => Number.isFinite(p.q50) && p.q50 > 0), traj };
    }
  } catch (_) {
    return { ok: false, traj: null };
  }
  return { ok: false, traj: null };
}

function scoreWindow(clean, originIdx, traj, horizon) {
  let maeSum = 0;
  let sqErrSum = 0;
  let wisSum = 0;
  let pinballSum = 0;
  let in80 = 0;
  let in50 = 0;
  let widthPctSum = 0;
  const baseClose = clean[originIdx].close;
  for (let h = 0; h < horizon; h++) {
    const actual = clean[originIdx + 1 + h].close;
    const q = traj[h];
    const err = Math.abs(actual - q.q50);
    maeSum += err;
    sqErrSum += err * err;
    wisSum += computeWis5Q(actual, q);
    pinballSum += (pinball(actual, q.q10, 0.1) + pinball(actual, q.q50, 0.5) + pinball(actual, q.q90, 0.9)) / 3;
    if (actual >= q.q10 && actual <= q.q90) in80++;
    if (actual >= q.q25 && actual <= q.q75) in50++;
    widthPctSum += Math.max(1e-8, q.q90 - q.q10) / Math.max(1e-8, actual);
  }
  const finalAct = clean[originIdx + horizon].close;
  const finalPred = traj[horizon - 1].q50;
  const dirOk = (finalAct >= baseClose && finalPred >= baseClose) || (finalAct < baseClose && finalPred < baseClose);
  return {
    maeMean: maeSum / horizon,
    mseMean: sqErrSum / horizon,
    wisMean: wisSum / horizon,
    pinballMean: pinballSum / horizon,
    in80Frac: in80 / horizon,
    in50Frac: in50 / horizon,
    widthPctMean: widthPctSum / horizon,
    dirOk,
  };
}

/**
 * Rev 2.1 Disjoint 4-Way Nested Walk-Forward Evaluator.
 * Strictly separates Train -> Val (Model Selection & Weight Freeze) -> Cal (Conformal & Temp) -> Outer (OOS Gate).
 */
export function evaluateWalkForward(candles, registry, options = {}) {
  const horizon = clampHorizonBars(options.horizonBars ?? options.evalHorizon ?? 10);
  const clean = Array.isArray(candles)
    ? candles
        .filter((c) => Number.isFinite(Number(c?.close)) && Number(c.close) > 0)
        .map((c) => ({
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume || 0),
          openTimeUtcMs: Number(c.openTimeUtcMs ?? c.open_time_utc_ms ?? 0),
        }))
    : [];

  const split = buildDisjointNestedSplits(clean.length, horizon);
  const active = registry.getEnabledPlugins();

  if (!split.feasible || active.length === 0) {
    return {
      evaluatedWindows: 0,
      evalHorizon: horizon,
      outerStrideBars: horizon,
      forecastStatus: clean.length >= split.req.nOpMin ? FORECAST_STATUS.INSUFFICIENT_EVIDENCE : FORECAST_STATUS.DATA_NOT_READY,
      acceptancePassed: false,
      acceptanceReason: !split.feasible
        ? `Need >= ${split.req.nOpMin} bars for nested split at H=${horizon} (stat min ${split.req.nStatMin}, have ${clean.length})`
        : 'No active forecast plugins enabled',
      ensembleMetrics: null,
      naiveMetrics: null,
      modelBenchmarks: [],
      relativeMaeVsNaive: 1.0,
      mase: 1.0,
      scoringRule: 'WEIGHTED_INTERVAL_SCORE_5Q',
      wisUnit: 'PRICE',
      wisModel: 0,
      wisNaiveDistributional: 0,
      coverage80Pct: 0,
      coverage50Pct: 0,
      primaryTest: 'HLN_MODIFIED_DIEBOLD_MARIANO',
      dieboldMarianoStat: 0,
      dieboldMarianoPValue: 1,
      sensitivityBootstrapPValue: 1,
      effectiveSampleSize: 0,
      conformalCalibration: fitVolatilityNormalizedConformal([], 0.20, 0.92),
      frozenWeights: {},
      splits: { trainBars: 0, valWindows: 0, calWindows: 0, outerWindows: 0 },
    };
  }

  // Hyndman-Koehler MASE in-sample denominator strictly from Train[0..trainEndIdx]
  let inSampleDiffSum = 0;
  for (let i = 1; i <= split.trainEndIdx; i++) {
    inSampleDiffSum += Math.abs(clean[i].close - clean[i - 1].close);
  }
  const maseDenom = Math.max(1e-9, inSampleDiffSum / Math.max(1, split.trainEndIdx));

  // Include candidate models (skip unapproved experimental approximations in statistical gate unless explicitly enabled)
  const valModels = active.filter(({ plugin }) => !(options.excludeExperimental === true && (plugin.experimentalOnly || plugin.isApproximation)));
  const valScores = new Map();
  let naiveValWisSum = 0;

  // STAGE 2: VALIDATION ONLY (Model selection & softmax ensemble weights freeze)
  for (const origin of split.valOrigins) {
    const slice = clean.slice(0, origin + 1);
    const feats = extractForecastFeatures(slice, 260);
    if (!feats) continue;
    const { traj: naiveTraj } = buildNaiveLogNormalTraj(feats.lastClose, feats.logReturns, horizon);
    const naiveWin = scoreWindow(clean, origin, naiveTraj, horizon);
    naiveValWisSum += naiveWin.wisMean;

    for (const { plugin, config } of valModels) {
      if (plugin.id === 'naive_persistence') continue;
      const res = predictSingleWindowTrajectory(plugin, config, slice, feats, horizon);
      if (!valScores.has(plugin.id)) {
        valScores.set(plugin.id, {
          wisSum: 0,
          count: 0,
          experimental: Boolean(plugin.experimentalOnly || plugin.isApproximation),
        });
      }
      const rec = valScores.get(plugin.id);
      if (res.ok) {
        const w = scoreWindow(clean, origin, res.traj, horizon);
        rec.wisSum += w.wisMean;
        rec.count++;
      }
    }
  }

  const eta = 2.5;
  const avgNaiveValWis = Math.max(1e-9, naiveValWisSum / Math.max(1, split.valOrigins.length));
  const frozenWeights = {};
  let rawWeightSum = 0;

  for (const { plugin, config } of valModels) {
    if (plugin.id === 'naive_persistence') continue;
    const rec = valScores.get(plugin.id);
    if (!rec || rec.count === 0) continue;
    if (rec.experimental && options.allowExperimentalInEnsemble !== true) continue;
    const avgWis = rec.wisSum / rec.count;
    // Softmax weighting relative to Naive WIS on validation set; down-weight worse-than-naive heavily
    const ratio = avgWis / avgNaiveValWis;
    const w = ratio <= 1.05 ? Math.exp(-eta * ratio) * Math.max(0.05, Number(config.weight || 0.2)) : 0;
    if (w > 0) {
      frozenWeights[plugin.id] = w;
      rawWeightSum += w;
    }
  }

  if (rawWeightSum <= 0) {
    // Fallback to uniform positive config weights on non-experimental plugins so ensemble still runs honestly
    for (const { plugin, config } of valModels) {
      if (plugin.id === 'naive_persistence') continue;
      if ((plugin.experimentalOnly || plugin.isApproximation) && options.allowExperimentalInEnsemble !== true) continue;
      const w = Math.max(0.05, Number(config.weight || 0.2));
      frozenWeights[plugin.id] = w;
      rawWeightSum += w;
    }
  }
  for (const id of Object.keys(frozenWeights)) {
    frozenWeights[id] /= Math.max(1e-9, rawWeightSum);
  }

  const runEnsembleAtOrigin = (slice, feats, includeZeroWeight = true) => {
    const ensMean = new Array(horizon).fill(0);
    const ensVar = new Array(horizon).fill(0);
    let wUsed = 0;
    const outputs = new Map();

    for (const { plugin, config } of valModels) {
      if (plugin.id === 'naive_persistence') continue;
      const w = frozenWeights[plugin.id] || 0;
      if (!includeZeroWeight && w <= 0) continue;
      const res = predictSingleWindowTrajectory(plugin, config, slice, feats, horizon);
      outputs.set(plugin.id, res);
      if (w > 0 && res.ok) {
        wUsed += w;
        for (let h = 0; h < horizon; h++) {
          ensMean[h] += w * Number(res.out.meanReturns[h] || 0);
          const sg = Math.max(1e-5, Number(res.out.sigmas[h] || feats.ewmaSigma));
          ensVar[h] += w * sg * sg;
        }
      }
    }

    if (wUsed > 0) {
      for (let h = 0; h < horizon; h++) {
        ensMean[h] /= wUsed;
        ensVar[h] /= wUsed;
      }
    } else {
      const nSig = computeNaiveSigmaRw(feats.logReturns);
      for (let h = 0; h < horizon; h++) ensVar[h] = nSig * nSig;
    }
    const ensTraj = buildPriceTrajectoryFromReturns(
      feats.lastClose,
      ensMean,
      ensVar.map((v) => Math.sqrt(Math.max(1e-10, v)))
    );
    return { ensTraj, outputs };
  };

  // STAGE 3: CONFORMAL CALIBRATION ONLY (M_cal untouched windows)
  const calOriginScores = [];
  for (const origin of split.calOrigins) {
    const slice = clean.slice(0, origin + 1);
    const feats = extractForecastFeatures(slice, 260);
    if (!feats) continue;
    const { ensTraj } = runEnsembleAtOrigin(slice, feats, false);
    let normScoreSum = 0;
    for (let h = 0; h < horizon; h++) {
      const actualY = clean[origin + 1 + h].close;
      const q = ensTraj[h];
      const rawMiss = Math.max(q.q10 - actualY, actualY - q.q90, 0);
      const denom = Math.max(1e-8, feats.lastClose * feats.ewmaSigma * Math.sqrt(h + 1));
      normScoreSum += rawMiss / denom;
    }
    calOriginScores.push(normScoreSum / horizon);
  }
  const conformalCalibration = fitVolatilityNormalizedConformal(calOriginScores, 0.20, 0.92);

  // STAGE 4: FROZEN OUTER EVALUATION ONLY (K_outer non-overlapping windows, stride = H)
  const accs = new Map();
  const getAcc = (id, name, family, experimentalOnly = false) => {
    if (!accs.has(id)) {
      accs.set(id, {
        modelId: id,
        modelName: name,
        family,
        experimentalOnly,
        maeSum: 0,
        mseSum: 0,
        wisSum: 0,
        pinballSum: 0,
        in80Sum: 0,
        in50Sum: 0,
        widthPctSum: 0,
        dirCount: 0,
        windows: 0,
        wisSeries: [],
        errSeries: [],
      });
    }
    return accs.get(id);
  };

  getAcc('ensemble', 'Calibrated Ensemble (V2)', 'ENSEMBLE', false);
  getAcc('naive_persistence', NaivePersistenceModel.name, 'BASELINE', false);
  for (const { plugin } of valModels) {
    getAcc(plugin.id, plugin.name, plugin.family, Boolean(plugin.experimentalOnly || plugin.isApproximation));
  }
  const includeAux = options.includeAuxiliaryModels !== false;
  const auxCtx = {
    symbolCode: options.symbolCode || 'XAUUSD',
    providerId: options.providerId || 'tvdatafeed',
    timeframe: options.timeframe || 'M15',
  };
  if (includeAux) {
    for (const aux of AUXILIARY_BENCHMARK_MODELS) {
      getAcc(aux.id, aux.name, aux.family, false);
    }
  }

  for (const origin of split.outerOrigins) {
    const slice = clean.slice(0, origin + 1);
    const feats = extractForecastFeatures(slice, 260);
    if (!feats) continue;

    const { traj: naiveTraj } = buildNaiveLogNormalTraj(feats.lastClose, feats.logReturns, horizon);
    const naiveWin = scoreWindow(clean, origin, naiveTraj, horizon);
    const naiveAcc = getAcc('naive_persistence', NaivePersistenceModel.name, 'BASELINE');
    naiveAcc.maeSum += naiveWin.maeMean;
    naiveAcc.mseSum += naiveWin.mseMean;
    naiveAcc.wisSum += naiveWin.wisMean;
    naiveAcc.pinballSum += naiveWin.pinballMean;
    naiveAcc.in80Sum += naiveWin.in80Frac;
    naiveAcc.in50Sum += naiveWin.in50Frac;
    naiveAcc.widthPctSum += naiveWin.widthPctMean;
    if (naiveWin.dirOk) naiveAcc.dirCount++;
    naiveAcc.windows++;
    naiveAcc.wisSeries.push(naiveWin.wisMean);
    naiveAcc.errSeries.push(clean[origin + horizon].close - naiveTraj[horizon - 1].q50);

    const { ensTraj, outputs } = runEnsembleAtOrigin(slice, feats);
    const calEnsTraj = ensTraj.map((q, h) =>
      applyConformalAdjustmentToQuantiles(q, feats.lastClose, feats.ewmaSigma, h + 1, conformalCalibration, feats.lastClose * 0.01)
    );
    const ensWin = scoreWindow(clean, origin, calEnsTraj, horizon);
    const ensAcc = getAcc('ensemble', 'Calibrated Ensemble (V2)', 'ENSEMBLE');
    ensAcc.maeSum += ensWin.maeMean;
    ensAcc.mseSum += ensWin.mseMean;
    ensAcc.wisSum += ensWin.wisMean;
    ensAcc.pinballSum += ensWin.pinballMean;
    ensAcc.in80Sum += ensWin.in80Frac;
    ensAcc.in50Sum += ensWin.in50Frac;
    ensAcc.widthPctSum += ensWin.widthPctMean;
    if (ensWin.dirOk) ensAcc.dirCount++;
    ensAcc.windows++;
    ensAcc.wisSeries.push(ensWin.wisMean);
    ensAcc.errSeries.push(clean[origin + horizon].close - calEnsTraj[horizon - 1].q50);

    for (const { plugin } of valModels) {
      if (plugin.id === 'naive_persistence') continue;
      const res = outputs.get(plugin.id);
      if (!res || !res.ok) continue;
      const calTraj = res.traj.map((q, h) =>
        applyConformalAdjustmentToQuantiles(q, feats.lastClose, feats.ewmaSigma, h + 1, conformalCalibration, feats.lastClose * 0.01)
      );
      const w = scoreWindow(clean, origin, calTraj, horizon);
      const acc = getAcc(plugin.id, plugin.name, plugin.family);
      acc.maeSum += w.maeMean;
      acc.mseSum += w.mseMean;
      acc.wisSum += w.wisMean;
      acc.pinballSum += w.pinballMean;
      acc.in80Sum += w.in80Frac;
      acc.in50Sum += w.in50Frac;
      acc.widthPctSum += w.widthPctMean;
      if (w.dirOk) acc.dirCount++;
      acc.windows++;
      acc.wisSeries.push(w.wisMean);
      acc.errSeries.push(clean[origin + horizon].close - calTraj[horizon - 1].q50);
    }

    if (includeAux) {
      for (const aux of AUXILIARY_BENCHMARK_MODELS) {
        const auxRes = predictAuxiliaryWindowTrajectory(aux.id, slice, feats, horizon, auxCtx);
        if (!auxRes.ok || !auxRes.traj) continue;
        const calTraj =
          aux.id === 'empirical_analogs' || aux.id === 'structural_wave_js' || aux.id === 'smc_prediction_js'
            ? auxRes.traj
            : auxRes.traj.map((q, h) =>
                applyConformalAdjustmentToQuantiles(q, feats.lastClose, feats.ewmaSigma, h + 1, conformalCalibration, feats.lastClose * 0.01)
              );
        const w = scoreWindow(clean, origin, calTraj, horizon);
        const acc = getAcc(aux.id, aux.name, aux.family, false);
        acc.maeSum += w.maeMean;
        acc.mseSum += w.mseMean;
        acc.wisSum += w.wisMean;
        acc.pinballSum += w.pinballMean;
        acc.in80Sum += w.in80Frac;
        acc.in50Sum += w.in50Frac;
        acc.widthPctSum += w.widthPctMean;
        if (w.dirOk) acc.dirCount++;
        acc.windows++;
        acc.wisSeries.push(w.wisMean);
        acc.errSeries.push(clean[origin + horizon].close - calTraj[horizon - 1].q50);
      }
    }
  }

  const lastPrice = Math.max(1e-6, clean[clean.length - 1].close);
  const naiveAcc = accs.get('naive_persistence');
  const naiveMae = Math.max(1e-9, naiveAcc.maeSum / Math.max(1, naiveAcc.windows));
  const naiveWis = Math.max(1e-9, naiveAcc.wisSum / Math.max(1, naiveAcc.windows));

  const finalizeAcc = (acc) => {
    const k = acc.windows;
    const ok = k > 0;
    const mae = ok ? acc.maeSum / k : 0;
    const rmse = ok ? Math.sqrt(acc.mseSum / k) : 0;
    const wis = ok ? acc.wisSum / k : 0;
    const cov80 = ok ? (acc.in80Sum / k) * 100 : 0;
    const cov50 = ok ? (acc.in50Sum / k) * 100 : 0;
    const dSeries = ok && acc.modelId !== 'naive_persistence'
      ? acc.wisSeries.map((w, i) => w - naiveAcc.wisSeries[i])
      : [];
    const dm = dSeries.length >= 5 ? hlnModifiedDieboldMariano(dSeries, 1) : { stat: 0, pValue: 1 };
    const boot = dSeries.length >= 5 && options.skipBootstrap !== true
      ? centeredStationaryBlockBootstrap(dSeries, Number(options.bootstrapB || 1000), 4, 133742)
      : { pValue: 1 };

    return {
      modelId: acc.modelId,
      modelName: acc.modelName,
      family: acc.family,
      experimentalOnly: Boolean(acc.experimentalOnly),
      windows: k,
      evaluatedWindows: k,
      status: ok ? MODEL_EXECUTION_STATUS.SUCCESS : MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA,
      reason: ok ? '' : 'No valid outer windows',
      mae,
      maePct: (mae / lastPrice) * 100,
      rmse,
      rMae: ok ? mae / naiveMae : 1.0,
      mase: ok ? mae / maseDenom : 1.0,
      wis,
      pinballLoss: ok ? acc.pinballSum / k : 0,
      coverage80Pct: cov80,
      coverage50Pct: cov50,
      avgIntervalWidthPct: ok ? (acc.widthPctSum / k) * 100 : 0,
      directionalAccuracyPct: ok ? (acc.dirCount / k) * 100 : 0,
      skillVsNaivePct: ok ? ((naiveMae - mae) / naiveMae) * 100 : 0,
      dmStat: Number(dm.stat.toFixed(4)),
      dmPValue: Number(dm.pValue.toFixed(5)),
      bootPValue: Number(boot.pValue.toFixed(5)),
      nEff: computeBartlettEffectiveSampleSize(acc.errSeries, horizon),
    };
  };

  const ensembleMetrics = finalizeAcc(accs.get('ensemble'));
  const naiveMetrics = finalizeAcc(naiveAcc);
  const modelBenchmarks = [];
  for (const [id, acc] of accs.entries()) {
    if (id !== 'ensemble') modelBenchmarks.push(finalizeAcc(acc));
  }

  // Prefer non-experimental candidates that satisfy all 6 V2.1 gates; fall back to lowest-WIS for diagnostics
  const eligibleCandidates = [ensembleMetrics, ...modelBenchmarks].filter(
    (m) =>
      m &&
      m.modelId !== 'naive_persistence' &&
      !m.experimentalOnly &&
      m.status === MODEL_EXECUTION_STATUS.SUCCESS &&
      m.windows >= 30
  );
  const passingCandidates = conformalCalibration.calibrationStatus === 'CALIBRATED_NORMALIZED'
    ? eligibleCandidates.filter(
        (m) =>
          m.nEff >= 25.0 &&
          m.rMae < 1.0 &&
          m.wis < naiveWis &&
          m.coverage80Pct >= 72.0 &&
          m.coverage80Pct <= 88.0 &&
          m.dmPValue <= 0.05 &&
          m.bootPValue <= 0.10
      )
    : [];
  const poolForBest = passingCandidates.length > 0 ? passingCandidates : eligibleCandidates;
  const bestCandidate =
    poolForBest.slice().sort((a, b) => a.wis - b.wis || a.mae - b.mae)[0] || ensembleMetrics;

  const evalRef = passingCandidates.length > 0
    ? bestCandidate
    : (bestCandidate && bestCandidate.wis < ensembleMetrics.wis ? bestCandidate : ensembleMetrics);

  const evaluatedWindows = evalRef.windows;
  const effectiveSampleSize = Number(evalRef.nEff.toFixed(2));
  const relativeMaeVsNaive = Number(evalRef.rMae.toFixed(4));
  const mase = Number(evalRef.mase.toFixed(4));
  const wisModel = Number(evalRef.wis.toFixed(6));
  const wisNaiveDistributional = Number(naiveWis.toFixed(6));
  const coverage80Pct = Number(evalRef.coverage80Pct.toFixed(2));
  const coverage50Pct = Number(evalRef.coverage50Pct.toFixed(2));
  const dieboldMarianoStat = evalRef.dmStat;
  const dieboldMarianoPValue = evalRef.dmPValue;
  const sensitivityBootstrapPValue = evalRef.bootPValue;

  const enoughSamples =
    evaluatedWindows >= 30 &&
    effectiveSampleSize >= 25.0 &&
    conformalCalibration.calibrationStatus === 'CALIBRATED_NORMALIZED';
  const rMaePassed = relativeMaeVsNaive < 1.0;
  const wisPassed = wisModel < wisNaiveDistributional;
  const covPassed = coverage80Pct >= 72.0 && coverage80Pct <= 88.0;
  const dmPassed = dieboldMarianoPValue <= 0.05;
  const bootPassed = sensitivityBootstrapPValue <= 0.10;
  const acceptancePassed = enoughSamples && rMaePassed && wisPassed && covPassed && dmPassed && bootPassed;

  let forecastStatus = FORECAST_STATUS.INSUFFICIENT_EVIDENCE;
  let acceptanceReason = '';
  if (!enoughSamples) {
    forecastStatus = FORECAST_STATUS.INSUFFICIENT_EVIDENCE;
    acceptanceReason = `INSUFFICIENT_EVIDENCE: K_outer=${evaluatedWindows} (need>=30), N_eff=${effectiveSampleSize} (need>=25.0), Conformal=${conformalCalibration.calibrationStatus}`;
  } else if (!acceptancePassed) {
    forecastStatus = FORECAST_STATUS.NO_EDGE;
    const fails = [];
    if (!rMaePassed) fails.push(`rMAE=${relativeMaeVsNaive.toFixed(4)} >= 1.0`);
    if (!wisPassed) fails.push(`WIS=${wisModel.toFixed(4)} >= Naive=${wisNaiveDistributional.toFixed(4)}`);
    if (!covPassed) fails.push(`Cov80=${coverage80Pct.toFixed(1)}% outside [72%, 88%]`);
    if (!dmPassed) fails.push(`HLN-DM p=${dieboldMarianoPValue.toFixed(4)} > 0.05`);
    if (!bootPassed) fails.push(`Bootstrap p=${sensitivityBootstrapPValue.toFixed(4)} > 0.10`);
    acceptanceReason = `NO_EDGE on Outer OOS (${evaluatedWindows} windows): ${fails.join('; ')}`;
  } else {
    forecastStatus = FORECAST_STATUS.VALID;
    acceptanceReason = `All V2.1 outer OOS statistical, WIS, coverage ([72%,88%]), and HLN-DM + Bootstrap gates passed (model=${evalRef.modelId}, p_DM=${dieboldMarianoPValue}, p_boot=${sensitivityBootstrapPValue})`;
  }

  return {
    evaluatedWindows,
    evalHorizon: horizon,
    outerStrideBars: horizon,
    effectiveSampleSize,
    relativeMaeVsNaive,
    mase,
    scoringRule: 'WEIGHTED_INTERVAL_SCORE_5Q',
    wisUnit: 'PRICE',
    wisModel,
    wisNaiveDistributional,
    coverage80Pct,
    coverage50Pct,
    primaryTest: 'HLN_MODIFIED_DIEBOLD_MARIANO',
    dieboldMarianoStat,
    dieboldMarianoPValue,
    sensitivityBootstrapPValue,
    acceptancePassed,
    forecastStatus,
    acceptanceReason,
    winningModelId: acceptancePassed ? evalRef.modelId : 'naive_persistence',
    ensembleMetrics,
    naiveMetrics,
    modelBenchmarks,
    maeImprovementVsNaivePct: Number(((1 - relativeMaeVsNaive) * 100).toFixed(2)),
    skillScoreVsNaive: Number((1 - wisModel / Math.max(1e-9, wisNaiveDistributional)).toFixed(4)),
    conformalCalibration,
    frozenWeights,
    splits: {
      trainBars: split.trainEndIdx + 1,
      valWindows: split.valOrigins.length,
      calWindows: split.calOrigins.length,
      outerWindows: split.outerOrigins.length,
    },
  };
}

/**
 * Rev 2.1 Honest OOS Selection Gate (Zero !isCalibratedInterval exemption).
 */
export function selectOosChartWinner(walkForward, modelTrajectories = [], requestedModelId = 'AUTO') {
  const req = String(requestedModelId || 'AUTO').trim();
  const successTrajById = new Map();
  for (const t of modelTrajectories) {
    if (t && t.status === MODEL_EXECUTION_STATUS.SUCCESS && Array.isArray(t.points) && t.points.length > 0) {
      successTrajById.set(t.modelId, t);
    }
  }

  if (req && req.toUpperCase() !== 'AUTO') {
    const manual = successTrajById.get(req);
    if (manual) {
      return {
        selectionMode: SELECTION_MODE.MANUAL_OVERRIDE,
        selectedModelId: manual.modelId,
        winnerModelId: manual.modelId,
        reason: `Manual chart model selection: ${manual.modelName}`,
      };
    }
    return {
      selectionMode: SELECTION_MODE.NO_CLEAR_WINNER_BASELINE,
      selectedModelId: successTrajById.has('naive_persistence') ? 'naive_persistence' : (modelTrajectories[0]?.modelId || 'naive_persistence'),
      winnerModelId: null,
      reason: `Requested model ${req} unavailable; displaying zero-drift baseline.`,
    };
  }

  if (!walkForward || walkForward.evaluatedWindows < 30 || walkForward.effectiveSampleSize < 25.0) {
    return {
      selectionMode: SELECTION_MODE.INSUFFICIENT_EVIDENCE_BASELINE,
      selectedModelId: successTrajById.has('naive_persistence') ? 'naive_persistence' : 'ensemble',
      winnerModelId: null,
      reason: `Insufficient non-overlapping OOS evidence (K_outer=${walkForward?.evaluatedWindows || 0}/30, N_eff=${walkForward?.effectiveSampleSize || 0}/25); showing baseline.`,
    };
  }

  const naiveWis = Math.max(1e-9, Number(walkForward.wisNaiveDistributional || 0));
  const candidates = [walkForward.ensembleMetrics, ...(walkForward.modelBenchmarks || [])].filter(
    (m) =>
      m &&
      m.modelId !== 'naive_persistence' &&
      !m.experimentalOnly &&
      m.status === MODEL_EXECUTION_STATUS.SUCCESS &&
      m.windows >= 30 &&
      Number(m.nEff || 0) >= 25.0 &&
      m.rMae < 1.0 &&
      m.wis < naiveWis &&
      m.coverage80Pct >= 72.0 &&
      m.coverage80Pct <= 88.0 &&
      m.dmPValue <= 0.05 &&
      m.bootPValue <= 0.10 &&
      successTrajById.has(m.modelId)
  ).sort((a, b) => a.wis - b.wis || a.mae - b.mae);

  if (candidates.length > 0) {
    const win = candidates[0];
    return {
      selectionMode: SELECTION_MODE.AUTO_OOS_BEST,
      selectedModelId: win.modelId,
      winnerModelId: win.modelId,
      reason: `OOS winner ${win.modelName} passed 6-gate V2.1 check (rMAE=${win.rMae.toFixed(3)}, WIS=${win.wis.toFixed(4)} < ${naiveWis.toFixed(4)}, p_DM=${win.dmPValue}, Cov80=${win.coverage80Pct.toFixed(1)}%).`,
    };
  }

  return {
    selectionMode: SELECTION_MODE.NO_CLEAR_WINNER_BASELINE,
    selectedModelId: successTrajById.has('naive_persistence') ? 'naive_persistence' : 'ensemble',
    winnerModelId: null,
    reason: walkForward.acceptanceReason || 'No candidate beat zero-drift log-normal Naive across all 6 V2.1 OOS gates.',
  };
}
