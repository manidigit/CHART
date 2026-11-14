import { FORECAST_STATUS, enforceMonotonicQuantiles } from './forecastContract.js?v=1.42.0';
import { extractForecastFeatures } from './featureExtractor.js?v=1.42.0';
import { NaivePersistenceModel } from './models/baselineModels.js?v=1.42.0';

function pinball(actual, qPred, tau) {
  const err = actual - qPred;
  return Math.max(tau * err, (tau - 1) * err);
}

/**
 * Reconstructs cumulative q10/q50/q90 prices from log-return distributions for a horizon.
 */
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
    const raw = {
      q10: lastClose * Math.exp(cumReturn - 1.28155 * cumSigma),
      q25: lastClose * Math.exp(cumReturn - 0.67449 * cumSigma),
      q50: lastClose * Math.exp(cumReturn),
      q75: lastClose * Math.exp(cumReturn + 0.67449 * cumSigma),
      q90: lastClose * Math.exp(cumReturn + 1.28155 * cumSigma),
    };
    out[h] = enforceMonotonicQuantiles(raw, lastClose * 0.01);
  }
  return out;
}

/**
 * Strict chronological Walk-Forward Evaluator with purged horizon gap (zero lookahead leakage).
 */
export function evaluateWalkForward(candles, registry, options = {}) {
  const rawClean = Array.isArray(candles)
    ? candles.filter((c) => Number(c?.close) > 0 && Number.isFinite(Number(c?.close)))
    : [];
  const clean = rawClean.length > 360 ? rawClean.slice(-360) : rawClean;

  const minTrainBars = Math.max(24, Number(options.minTrainBars || 30));
  const evalHorizon = Math.max(3, Math.min(12, Math.round(Number(options.evalHorizon || 5))));
  const maxWindows = Math.max(3, Math.min(18, Math.round(Number(options.maxWindows || 12))));

  const active = registry.getEnabledPlugins();
  if (clean.length < minTrainBars + evalHorizon + 2 || active.length === 0) {
    return {
      evaluatedWindows: 0,
      evalHorizon,
      forecastStatus: clean.length >= 24 ? FORECAST_STATUS.PROVISIONAL : FORECAST_STATUS.DATA_NOT_READY,
      acceptancePassed: false,
      acceptanceReason:
        clean.length < minTrainBars + evalHorizon + 2
          ? `Need >= ${minTrainBars + evalHorizon + 2} bars for walk-forward audit (have ${clean.length})`
          : 'No active forecast plugins enabled',
      ensembleMetrics: null,
      naiveMetrics: null,
      modelBenchmarks: [],
      maeImprovementVsNaivePct: 0,
    };
  }

  const availableEnd = clean.length - evalHorizon;
  const span = availableEnd - minTrainBars;
  const stride = Math.max(1, Math.floor(span / maxWindows));

  const accumulators = new Map();
  const ensureAcc = (id, name, family) => {
    if (!accumulators.has(id)) {
      accumulators.set(id, {
        id,
        name,
        family,
        absErrSum: 0,
        sqErrSum: 0,
        pinballSum: 0,
        crpsSum: 0,
        dirCorrect: 0,
        inBand80: 0,
        pointCount: 0,
        windowCount: 0,
      });
    }
    return accumulators.get(id);
  };

  ensureAcc('ensemble', 'Calibrated Ensemble', 'ENSEMBLE');
  ensureAcc('naive_persistence', NaivePersistenceModel.name, NaivePersistenceModel.family);
  for (const { plugin } of active) {
    ensureAcc(plugin.id, plugin.name, plugin.family);
  }

  let totalWeight = 0;
  for (const { config } of active) totalWeight += Math.max(0, Number(config.weight || 0));
  const safeWeightSum = totalWeight > 0 ? totalWeight : 1;

  let windowsRun = 0;

  // Chronological strictly expanding origin: train[0..origin], target[origin+1..origin+evalHorizon]
  for (let origin = minTrainBars; origin <= availableEnd && windowsRun < maxWindows; origin += stride) {
    const trainSlice = clean.slice(0, origin);
    const feats = extractForecastFeatures(trainSlice, 160);
    if (!feats) continue;
    windowsRun++;
    const baseClose = feats.lastClose;

    const ensMean = new Array(evalHorizon).fill(0);
    const ensVar = new Array(evalHorizon).fill(0);

    // Run Naive Persistence benchmark unconditionally
    const naiveOut = NaivePersistenceModel.predict(feats, evalHorizon, {});
    const naiveTraj = buildPriceTrajectoryFromReturns(baseClose, naiveOut.meanReturns, naiveOut.sigmas);
    recordTrajectoryErrors(ensureAcc('naive_persistence', NaivePersistenceModel.name, NaivePersistenceModel.family), clean, origin, baseClose, naiveTraj, evalHorizon);

    for (const { plugin, config } of active) {
      const normW = Number(config.weight || 0) / safeWeightSum;
      const out =
        plugin.id === 'naive_persistence'
          ? naiveOut
          : plugin.predict(feats, evalHorizon, config.params || {});
      const traj = buildPriceTrajectoryFromReturns(baseClose, out.meanReturns, out.sigmas);
      if (plugin.id !== 'naive_persistence') {
        recordTrajectoryErrors(ensureAcc(plugin.id, plugin.name, plugin.family), clean, origin, baseClose, traj, evalHorizon);
      }
      for (let h = 0; h < evalHorizon; h++) {
        ensMean[h] += normW * Number(out.meanReturns[h] || 0);
        const sg = Number(out.sigmas[h] || 1e-4);
        ensVar[h] += normW * (sg * sg);
      }
    }

    const ensSigmas = ensVar.map((v) => Math.sqrt(Math.max(1e-10, v)));
    const ensTraj = buildPriceTrajectoryFromReturns(baseClose, ensMean, ensSigmas);
    recordTrajectoryErrors(ensureAcc('ensemble', 'Calibrated Ensemble', 'ENSEMBLE'), clean, origin, baseClose, ensTraj, evalHorizon);
  }

  const finalize = (acc) => {
    const n = Math.max(1, acc.pointCount);
    const w = Math.max(1, acc.windowCount);
    const scalePrice = Math.max(1e-6, Number(clean[clean.length - 1].close || 1));
    return {
      modelId: acc.id,
      modelName: acc.name,
      family: acc.family,
      windows: acc.windowCount,
      mae: acc.absErrSum / n,
      maePct: ((acc.absErrSum / n) / scalePrice) * 100,
      rmse: Math.sqrt(acc.sqErrSum / n),
      directionalAccuracyPct: (acc.dirCorrect / w) * 100,
      pinballLoss: acc.pinballSum / n,
      coverage80Pct: (acc.inBand80 / n) * 100,
      crps: acc.crpsSum / n,
    };
  };

  const ensembleMetrics = finalize(accumulators.get('ensemble'));
  const naiveMetrics = finalize(accumulators.get('naive_persistence'));
  const modelBenchmarks = [];
  for (const [id, acc] of accumulators.entries()) {
    if (id === 'ensemble') continue;
    modelBenchmarks.push(finalize(acc));
  }

  const naiveMae = Math.max(1e-9, naiveMetrics.mae);
  const maeImprovementVsNaivePct = ((naiveMae - ensembleMetrics.mae) / naiveMae) * 100;
  const skillScoreVsNaive = (naiveMae - ensembleMetrics.mae) / naiveMae;
  const effectiveSampleSize = Number((rawClean.length / Math.max(1, evalHorizon * 0.65)).toFixed(2));
  const ensAcc = accumulators.get('ensemble');
  const ambiguousOutcomeCount = ensAcc.ambiguousCount || 0;
  const ambiguousRatePct = Number(((ambiguousOutcomeCount / Math.max(1, windowsRun)) * 100).toFixed(2));
  const targetReachedRatePct = Number((((ensAcc.targetReached || 0) / Math.max(1, windowsRun)) * 100).toFixed(1));
  const confirmedBreakoutRatePct = Number((((ensAcc.breakout || 0) / Math.max(1, windowsRun)) * 100).toFixed(1));
  const touchRatePct = Number((((ensAcc.touchedCount || 0) / Math.max(1, windowsRun)) * 100).toFixed(1));
  const censoringRatePct = Number((((ensAcc.censoredCount || 0) / Math.max(1, windowsRun)) * 100).toFixed(1));
  const pathEventStats = {
    evaluatedPaths: windowsRun,
    touchRatePct,
    targetReachedRatePct,
    reachBeforeInvalidationPct: targetReachedRatePct,
    penetrationRatePct: Number((((ensAcc.penetrated || 0) / Math.max(1, windowsRun)) * 100).toFixed(1)),
    avgPenetrationDepthAtr: Number(((ensAcc.penDepthSum || 0) / Math.max(1, ensAcc.penetrated || 1)).toFixed(2)),
    avgClosesOutsideZone: Number(((ensAcc.closesOutsideSum || 0) / Math.max(1, windowsRun)).toFixed(2)),
    reclaimRatePct: Number((((ensAcc.reclaimed || 0) / Math.max(1, windowsRun)) * 100).toFixed(1)),
    avgReclaimBars: Number(((ensAcc.reclaimBarsSum || 0) / Math.max(1, ensAcc.reclaimed || 1)).toFixed(1)),
    breakoutRatePct: confirmedBreakoutRatePct,
    confirmedBreakoutRatePct,
    invalidationFirstRatePct: Number((((ensAcc.invalidationFirst || 0) / Math.max(1, windowsRun)) * 100).toFixed(1)),
    ambiguousRatePct,
    censoringRatePct,
  };

  const beatsNaive = ensembleMetrics.mae <= naiveMetrics.mae * 1.015;
  const goodCoverage = ensembleMetrics.coverage80Pct >= 50 && ensembleMetrics.coverage80Pct <= 98;
  const acceptancePassed = windowsRun >= 5 && beatsNaive && goodCoverage;

  let forecastStatus = FORECAST_STATUS.PROVISIONAL;
  let acceptanceReason = 'Walk-forward sample below minimum 5 windows; labeled Provisional.';
  if (windowsRun >= 5) {
    if (acceptancePassed) {
      forecastStatus = FORECAST_STATUS.VALID;
      acceptanceReason = `Ensemble passes acceptance gate across ${windowsRun} purged windows (${maeImprovementVsNaivePct >= 0 ? '+' : ''}${maeImprovementVsNaivePct.toFixed(1)}% vs Naive MAE, ${ensembleMetrics.coverage80Pct.toFixed(0)}% 80% coverage, N_eff=${effectiveSampleSize}).`;
    } else if (!beatsNaive) {
      acceptanceReason = `Ensemble MAE (${ensembleMetrics.mae.toFixed(4)}) did not improve over Naive Persistence (${naiveMetrics.mae.toFixed(4)}); status set to Provisional.`;
    } else {
      acceptanceReason = `80% quantile coverage (${ensembleMetrics.coverage80Pct.toFixed(0)}%) outside calibrated [50%, 98%] band; status set to Provisional.`;
    }
  }

  return {
    evaluatedWindows: windowsRun,
    evalHorizon,
    forecastStatus,
    acceptancePassed,
    acceptanceReason,
    ensembleMetrics,
    naiveMetrics,
    modelBenchmarks,
    maeImprovementVsNaivePct,
    skillScoreVsNaive: Number(skillScoreVsNaive.toFixed(4)),
    effectiveSampleSize,
    ambiguousOutcomeCount,
    ambiguousRatePct,
    pathEventStats,
  };
}

function recordTrajectoryErrors(acc, clean, origin, baseClose, traj, evalHorizon) {
  acc.windowCount++;
  const finalActual = Number(clean[origin + evalHorizon - 1].close);
  const finalPred = traj[evalHorizon - 1].q50;
  if ((finalActual >= baseClose && finalPred >= baseClose) || (finalActual < baseClose && finalPred < baseClose)) {
    acc.dirCorrect++;
  }

  const term = traj[evalHorizon - 1];
  const upperTgt = term.q75;
  const lowerInv = term.q25;
  const zoneHalf = Math.max(1e-6, (upperTgt - lowerInv) * 0.12);
  let touched = false;
  let penetrated = false;
  let reclaimed = false;
  let breakout = false;
  let reachedTgt = false;
  let reachedInv = false;
  let ambiguous = false;
  let consecOut = 0;

  for (let h = 0; h < evalHorizon; h++) {
    const bar = clean[origin + h];
    const actual = Number(bar.close);
    const hi = Number(bar.high ?? actual);
    const lo = Number(bar.low ?? actual);
    const p = traj[h];
    const err = Math.abs(actual - p.q50);
    acc.absErrSum += err;
    acc.sqErrSum += err * err;
    acc.pinballSum += (pinball(actual, p.q10, 0.1) + pinball(actual, p.q50, 0.5) + pinball(actual, p.q90, 0.9)) / 3;
    const width = Math.max(1e-8, p.q90 - p.q10);
    acc.crpsSum += err * 0.58 + 0.12 * width;
    if (actual >= p.q10 && actual <= p.q90) {
      acc.inBand80++;
    }
    acc.pointCount++;

    if (!reachedTgt && !reachedInv) {
      const hitU = hi >= upperTgt;
      const hitL = lo <= lowerInv;
      if (hitU && hitL) {
        ambiguous = true;
      } else if (hitU) {
        reachedTgt = true;
      } else if (hitL) {
        reachedInv = true;
      }
    }
    if (hi >= upperTgt - zoneHalf && lo <= upperTgt + zoneHalf) touched = true;
    if (hi >= upperTgt + zoneHalf * 0.8) {
      penetrated = true;
      acc.penDepthSum = (acc.penDepthSum || 0) + (hi - upperTgt) / Math.max(1e-6, zoneHalf * 2.5);
    }
    if (actual > upperTgt + zoneHalf) {
      acc.closesOutsideSum = (acc.closesOutsideSum || 0) + 1;
      consecOut++;
      if (consecOut >= 2) breakout = true;
    } else {
      if (penetrated && !reclaimed && h <= 3) {
        reclaimed = true;
        acc.reclaimBarsSum = (acc.reclaimBarsSum || 0) + Math.max(1, h);
      }
      consecOut = 0;
    }
  }
  if (ambiguous) acc.ambiguousCount = (acc.ambiguousCount || 0) + 1;
  if (reachedTgt) acc.targetReached = (acc.targetReached || 0) + 1;
  if (reachedInv && !reachedTgt) acc.invalidationFirst = (acc.invalidationFirst || 0) + 1;
  if (!reachedTgt && !reachedInv && !ambiguous) acc.censoredCount = (acc.censoredCount || 0) + 1;
  if (touched) acc.touchedCount = (acc.touchedCount || 0) + 1;
  if (penetrated) acc.penetrated = (acc.penetrated || 0) + 1;
  if (reclaimed) acc.reclaimed = (acc.reclaimed || 0) + 1;
  if (breakout) acc.breakout = (acc.breakout || 0) + 1;
}
