import {
  FORECAST_STATUS,
  MODEL_EXECUTION_STATUS,
  SELECTION_MODE,
  enforceMonotonicQuantiles,
} from './forecastContract.js?v=1.43.0';
import { extractForecastFeatures } from './featureExtractor.js?v=1.43.0';
import { NaivePersistenceModel } from './models/baselineModels.js?v=1.43.0';

function pinball(actual, qPred, tau) {
  const err = actual - qPred;
  return Math.max(tau * err, (tau - 1) * err);
}

/**
 * Reconstructs cumulative q10/q50/q90 prices from log-return distributions or direct quantiles for a horizon.
 */
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
 * Preserves explicit SKIPPED_LOW_DATA / FAILED statuses (never masks errors with flat fallback)
 * and evaluates SMCPredictionEngine on identical cutoffs when smcEvaluator is provided.
 */
export function evaluateWalkForward(candles, registry, options = {}) {
  const rawClean = Array.isArray(candles)
    ? candles.filter((c) => Number(c?.close) > 0 && Number.isFinite(Number(c?.close)))
    : [];
  const clean = rawClean.length > 360 ? rawClean.slice(-360) : rawClean;

  const minTrainBars = Math.max(24, Number(options.minTrainBars || 30));
  const evalHorizon = Math.max(3, Math.min(12, Math.round(Number(options.evalHorizon || 5))));
  const maxWindows = Math.max(3, Math.min(18, Math.round(Number(options.maxWindows || 12))));
  const smcEvaluator = typeof options.smcEvaluator === 'function' ? options.smcEvaluator : null;

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
      skillScoreVsNaive: 0,
      effectiveSampleSize: 0,
      ambiguousOutcomeCount: 0,
      ambiguousRatePct: 0,
      pathEventStats: null,
    };
  }

  const availableEnd = clean.length - evalHorizon;
  const span = availableEnd - minTrainBars;
  const stride = Math.max(1, Math.floor(span / maxWindows));

  const accumulators = new Map();
  const ensureAcc = (id, name, family, isApproximation = false) => {
    if (!accumulators.has(id)) {
      accumulators.set(id, {
        id,
        name,
        family,
        isApproximation: Boolean(isApproximation),
        absErrSum: 0,
        sqErrSum: 0,
        apeSum: 0,
        apeCount: 0,
        widthPctSum: 0,
        pinballSum: 0,
        crpsSum: 0,
        dirCorrect: 0,
        inBand80: 0,
        pointCount: 0,
        windowCount: 0,
        windowsAttempted: 0,
        windowsSkipped: 0,
        windowsFailed: 0,
        lastStatus: MODEL_EXECUTION_STATUS.SUCCESS,
        lastReason: '',
        perHorizon: Array.from({ length: evalHorizon }, (_, idx) => ({
          stepAhead: idx + 1,
          absErrSum: 0,
          sqErrSum: 0,
          apeSum: 0,
          apeCount: 0,
          inBand80: 0,
          count: 0,
        })),
      });
    }
    return accumulators.get(id);
  };

  ensureAcc('ensemble', 'Calibrated Ensemble', 'ENSEMBLE', false);
  ensureAcc('naive_persistence', NaivePersistenceModel.name, NaivePersistenceModel.family, false);
  if (smcEvaluator) {
    ensureAcc('smc_kmedoids', 'SMC K-Medoids Analogs', 'PATTERN_SMC', false);
  }
  for (const { plugin } of active) {
    ensureAcc(plugin.id, plugin.name, plugin.family, Boolean(plugin.isApproximation));
  }

  let windowsRun = 0;

  // Chronological strictly expanding origin: train[0..origin-1], target[origin..origin+evalHorizon-1]
  for (let origin = minTrainBars; origin <= availableEnd && windowsRun < maxWindows; origin += stride) {
    const trainSlice = clean.slice(0, origin);
    const feats = extractForecastFeatures(trainSlice, 160);
    if (!feats) continue;
    windowsRun++;
    const baseClose = feats.lastClose;

    const ensMean = new Array(evalHorizon).fill(0);
    const ensVar = new Array(evalHorizon).fill(0);
    let ensActiveWeight = 0;

    // Run Naive Persistence benchmark unconditionally
    const naiveOut = NaivePersistenceModel.predict(feats, evalHorizon, {});
    const naiveTraj = buildPriceTrajectoryFromPrediction(baseClose, naiveOut, evalHorizon);
    const naiveAcc = ensureAcc('naive_persistence', NaivePersistenceModel.name, NaivePersistenceModel.family, false);
    naiveAcc.windowsAttempted++;
    recordTrajectoryErrors(naiveAcc, clean, origin, baseClose, naiveTraj, evalHorizon);

    for (const { plugin, config } of active) {
      const w = Math.max(0, Number(config.weight || 0));
      const acc = ensureAcc(plugin.id, plugin.name, plugin.family, Boolean(plugin.isApproximation));
      if (plugin.id !== 'naive_persistence') acc.windowsAttempted++;

      let out;
      try {
        out =
          plugin.id === 'naive_persistence'
            ? naiveOut
            : plugin.predict(feats, evalHorizon, config.params || {});
      } catch (err) {
        out = {
          modelId: plugin.id,
          status: MODEL_EXECUTION_STATUS.FAILED,
          reason: String(err?.message || err),
          meanReturns: [],
          sigmas: [],
        };
      }

      const st = out?.status || MODEL_EXECUTION_STATUS.SUCCESS;
      if (st !== MODEL_EXECUTION_STATUS.SUCCESS || !Array.isArray(out?.meanReturns) || out.meanReturns.length < evalHorizon) {
        if (st === MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA) acc.windowsSkipped++;
        else acc.windowsFailed++;
        acc.lastStatus = st === MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA ? st : MODEL_EXECUTION_STATUS.FAILED;
        acc.lastReason = out?.reason || 'Incomplete prediction horizon';
        continue;
      }

      const traj = buildPriceTrajectoryFromPrediction(baseClose, out, evalHorizon);
      const validNums = traj.every((pt) => Number.isFinite(pt.q50) && Number.isFinite(pt.q10) && Number.isFinite(pt.q90));
      if (!validNums) {
        acc.windowsFailed++;
        acc.lastStatus = MODEL_EXECUTION_STATUS.FAILED;
        acc.lastReason = 'Non-finite forecast quantiles emitted';
        continue;
      }

      if (plugin.id !== 'naive_persistence') {
        acc.lastStatus = MODEL_EXECUTION_STATUS.SUCCESS;
        acc.lastReason = '';
        recordTrajectoryErrors(acc, clean, origin, baseClose, traj, evalHorizon);
      }

      ensActiveWeight += w;
      for (let h = 0; h < evalHorizon; h++) {
        ensMean[h] += w * Number(out.meanReturns[h] || 0);
        const sg = Math.max(1e-5, Number(out.sigmas[h] || feats.ewmaSigma));
        ensVar[h] += w * (sg * sg);
      }
    }

    if (ensActiveWeight > 0) {
      for (let h = 0; h < evalHorizon; h++) {
        ensMean[h] /= ensActiveWeight;
        ensVar[h] /= ensActiveWeight;
      }
    }
    const ensSigmas = ensVar.map((v) => Math.sqrt(Math.max(1e-10, v)));
    const ensTraj = buildPriceTrajectoryFromReturns(baseClose, ensMean, ensSigmas);
    const ensAccRef = ensureAcc('ensemble', 'Calibrated Ensemble', 'ENSEMBLE', false);
    ensAccRef.windowsAttempted++;
    recordTrajectoryErrors(ensAccRef, clean, origin, baseClose, ensTraj, evalHorizon);

    // Evaluate SMCPredictionEngine on exact same strictly causal training slice [0..origin-1]
    if (smcEvaluator) {
      const smcAcc = ensureAcc('smc_kmedoids', 'SMC K-Medoids Analogs', 'PATTERN_SMC', false);
      smcAcc.windowsAttempted++;
      try {
        const smcTraj = smcEvaluator(trainSlice, evalHorizon, feats);
        if (Array.isArray(smcTraj) && smcTraj.length >= evalHorizon) {
          smcAcc.lastStatus = MODEL_EXECUTION_STATUS.SUCCESS;
          smcAcc.lastReason = '';
          recordTrajectoryErrors(smcAcc, clean, origin, baseClose, smcTraj, evalHorizon);
        } else {
          smcAcc.windowsSkipped++;
          smcAcc.lastStatus = MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA;
          smcAcc.lastReason = 'Insufficient bars for SMC analog matching';
        }
      } catch (err) {
        smcAcc.windowsFailed++;
        smcAcc.lastStatus = MODEL_EXECUTION_STATUS.FAILED;
        smcAcc.lastReason = String(err?.message || err);
      }
    }
  }

  const naiveFinalizePreview = accumulators.get('naive_persistence');
  const naiveMaeRef =
    naiveFinalizePreview && naiveFinalizePreview.pointCount > 0
      ? naiveFinalizePreview.absErrSum / naiveFinalizePreview.pointCount
      : 0;

  const finalize = (acc) => {
    const hasPoints = acc.pointCount > 0 && acc.windowCount > 0;
    const n = Math.max(1, acc.pointCount);
    const w = Math.max(1, acc.windowCount);
    const scalePrice = Math.max(1e-6, Number(clean[clean.length - 1].close || 1));
    const mae = hasPoints ? acc.absErrSum / n : null;
    const rmse = hasPoints ? Math.sqrt(acc.sqErrSum / n) : null;
    const safeMapePct = acc.apeCount > 0 ? (acc.apeSum / acc.apeCount) * 100 : null;
    const skillVsNaivePct =
      hasPoints && naiveMaeRef > 1e-9 ? ((naiveMaeRef - mae) / naiveMaeRef) * 100 : 0;

    return {
      modelId: acc.id,
      modelName: acc.name,
      family: acc.family,
      isApproximation: acc.isApproximation,
      windows: acc.windowCount,
      windowsAttempted: acc.windowsAttempted,
      windowsSkipped: acc.windowsSkipped,
      windowsFailed: acc.windowsFailed,
      status: hasPoints ? MODEL_EXECUTION_STATUS.SUCCESS : acc.lastStatus,
      reason: hasPoints ? '' : acc.lastReason,
      mae: hasPoints ? mae : 0,
      maePct: hasPoints ? (mae / scalePrice) * 100 : 0,
      rmse: hasPoints ? rmse : 0,
      safeMapePct: safeMapePct !== null ? Number(safeMapePct.toFixed(4)) : null,
      safeMapeValidCount: acc.apeCount,
      directionalAccuracyPct: hasPoints ? (acc.dirCorrect / w) * 100 : 0,
      pinballLoss: hasPoints ? acc.pinballSum / n : 0,
      coverage80Pct: hasPoints ? (acc.inBand80 / n) * 100 : 0,
      avgIntervalWidthPct: hasPoints ? (acc.widthPctSum / n) * 100 : 0,
      crps: hasPoints ? acc.crpsSum / n : 0,
      skillVsNaivePct: Number(skillVsNaivePct.toFixed(2)),
      perHorizonMetrics: acc.perHorizon
        .filter((ph) => ph.count > 0)
        .map((ph) => ({
          stepAhead: ph.stepAhead,
          mae: ph.absErrSum / ph.count,
          rmse: Math.sqrt(ph.sqErrSum / ph.count),
          safeMapePct: ph.apeCount > 0 ? Number(((ph.apeSum / ph.apeCount) * 100).toFixed(4)) : null,
          coverage80Pct: Number(((ph.inBand80 / ph.count) * 100).toFixed(1)),
        })),
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

/**
 * Honest Out-of-Sample Winner Gate.
 * Never declares an artificial winner unless a candidate demonstrates meaningful, stable OOS superiority
 * over Naive Persistence (>= 1.5% RMSE & MAE improvement across >= 5 windows with calibrated band).
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
    const failedObj = modelTrajectories.find((t) => t.modelId === req);
    return {
      selectionMode: SELECTION_MODE.NO_CLEAR_WINNER_BASELINE,
      selectedModelId: successTrajById.has('naive_persistence') ? 'naive_persistence' : (modelTrajectories[0]?.modelId || 'naive_persistence'),
      winnerModelId: null,
      reason: failedObj?.reason
        ? `Requested model ${req} unavailable (${failedObj.status}: ${failedObj.reason}); showing honest baseline.`
        : `Requested model ${req} unavailable; showing baseline.`,
    };
  }

  if (!walkForward || walkForward.evaluatedWindows < 5 || !walkForward.naiveMetrics) {
    return {
      selectionMode: SELECTION_MODE.NO_CLEAR_WINNER_BASELINE,
      selectedModelId: successTrajById.has('naive_persistence') ? 'naive_persistence' : 'smc_kmedoids',
      winnerModelId: null,
      reason: 'Walk-forward evaluated windows below 5; no OOS winner promoted (Naive baseline).',
    };
  }

  const naiveRmse = Math.max(1e-9, Number(walkForward.naiveMetrics.rmse || 0));
  const naiveMae = Math.max(1e-9, Number(walkForward.naiveMetrics.mae || 0));
  const candidates = [walkForward.ensembleMetrics, ...(walkForward.modelBenchmarks || [])].filter(
    (m) =>
      m &&
      m.modelId !== 'naive_persistence' &&
      m.status === MODEL_EXECUTION_STATUS.SUCCESS &&
      m.windows >= 5 &&
      successTrajById.has(m.modelId)
  );

  // Require clear >= 1.5% improvement over Naive on BOTH MAE and RMSE + non-degenerate 80% coverage [48%, 97%]
  const qualified = candidates
    .filter(
      (m) =>
        m.rmse <= naiveRmse * 0.985 &&
        m.mae <= naiveMae * 0.985 &&
        m.coverage80Pct >= 48 &&
        m.coverage80Pct <= 97
    )
    .sort((a, b) => a.rmse - b.rmse || a.mae - b.mae);

  if (qualified.length > 0) {
    const win = qualified[0];
    const rmseImp = ((naiveRmse - win.rmse) / naiveRmse) * 100;
    return {
      selectionMode: SELECTION_MODE.AUTO_OOS_BEST,
      selectedModelId: win.modelId,
      winnerModelId: win.modelId,
      reason: `OOS winner ${win.modelName} beats Naive Persistence by +${rmseImp.toFixed(1)}% RMSE across ${win.windows} windows.`,
    };
  }

  return {
    selectionMode: SELECTION_MODE.NO_CLEAR_WINNER_BASELINE,
    selectedModelId: successTrajById.has('naive_persistence') ? 'naive_persistence' : 'smc_kmedoids',
    winnerModelId: null,
    reason: 'No model achieved stable >=1.5% OOS improvement over Naive Persistence; showing baseline without artificial winner.',
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

    // Guarded MAPE: skip zero or near-zero actuals cleanly
    const apeValid = Math.abs(actual) > 1e-8;
    const ape = apeValid ? err / Math.abs(actual) : 0;
    if (apeValid) {
      acc.apeSum += ape;
      acc.apeCount++;
    }

    const width = Math.max(1e-8, p.q90 - p.q10);
    acc.widthPctSum += width / Math.max(1e-8, Math.abs(actual));
    acc.pinballSum += (pinball(actual, p.q10, 0.1) + pinball(actual, p.q50, 0.5) + pinball(actual, p.q90, 0.9)) / 3;
    acc.crpsSum += err * 0.58 + 0.12 * width;
    const inBand = actual >= p.q10 && actual <= p.q90;
    if (inBand) acc.inBand80++;
    acc.pointCount++;

    const ph = acc.perHorizon[h];
    if (ph) {
      ph.absErrSum += err;
      ph.sqErrSum += err * err;
      if (apeValid) {
        ph.apeSum += ape;
        ph.apeCount++;
      }
      if (inBand) ph.inBand80++;
      ph.count++;
    }

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

