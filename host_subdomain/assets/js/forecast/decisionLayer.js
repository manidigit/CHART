import {
  DATA_READINESS_STATE,
  DECISION_CONFIDENCE,
  EDGE_STATUS,
  FORECAST_STATUS,
  MODEL_EXECUTION_STATUS,
  MTF_ALIGNMENT_STATE,
  OOD_STATUS,
  PATH_SEMANTICS,
  PREFERRED_STRUCTURAL_MODELS,
  SELECTION_MODE,
} from './forecastContract.js?v=1.47.41';
import { resolveModelGovernance } from './modelRegistry.js?v=1.47.41';

/**
 * Centralized Forecast Decision & Evidence Layer (Master Plan §6).
 *
 * Single source of truth for UI Simple/Research rendering and Strategy Bridge eligibility.
 * Enforces the strict 4-step decision hierarchy:
 *   1. Input Readiness -> DATA_NOT_READY
 *   2. Statistical OOS Evidence Sufficiency -> INSUFFICIENT_EVIDENCE (+ baseline display)
 *   3. Strict 6-Gate OOS Winner -> VALID (+ strict winner) or PROVISIONAL (if OOD/MTF caution)
 *   4. Eligible Relative Candidate beating Baseline without calibration collapse -> PROVISIONAL (NOT_PROVEN)
 *      Otherwise -> NO_EDGE (+ baseline display)
 *
 * Manual user selection displays the requested model when technically valid, but NEVER upgrades
 * its scientific status, edgeStatus, or Strategy eligibility.
 */

export const DECISION_POLICY_VERSION = 'decision-policy/1.0';

export const DECISION_GATE_THRESHOLDS = Object.freeze({
  minOuterWindows: 30,
  minEffectiveSampleSize: 25.0,
  minCoverage80Pct: 72.0,
  maxCoverage80Pct: 88.0,
  maxDmPValue: 0.05,
  maxBootstrapPValue: 0.10,
  relativeMinCoverage80Pct: 50.0,
  relativeMaxCoverage80Pct: 98.0,
});

function finiteOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function resolvePathSemantics(modelId, trajectory = null) {
  if (trajectory?.pathSemantics) return trajectory.pathSemantics;
  if (modelId === 'structural_wave_js' || modelId === 'smc_prediction_js') {
    return PATH_SEMANTICS.JOINT_TRAJECTORY;
  }
  return PATH_SEMANTICS.MARGINAL_MEDIAN;
}

function findOosMetricForModel(walkForward, modelId) {
  if (!walkForward || !modelId) return null;
  if (modelId === 'naive_persistence') return walkForward.naiveMetrics || null;
  if (modelId === 'ensemble') return walkForward.ensembleMetrics || null;
  const benches = Array.isArray(walkForward.modelBenchmarks) ? walkForward.modelBenchmarks : [];
  return benches.find((b) => b && b.modelId === modelId) || null;
}

function modelPassesStrictGates(metric, walkForward) {
  if (!metric || !walkForward) return false;
  if (metric.modelId === 'naive_persistence' || metric.experimentalOnly) return false;
  if (metric.status !== MODEL_EXECUTION_STATUS.SUCCESS) return false;
  const naiveWis = Math.max(1e-9, Number(walkForward.wisNaiveDistributional || 0));
  if (!(naiveWis > 0)) return false;
  const calStatus = String(walkForward.conformalCalibration?.calibrationStatus || '');
  if (calStatus !== 'CALIBRATED_NORMALIZED') return false;
  return (
    Number(metric.windows || metric.evaluatedWindows || 0) >= DECISION_GATE_THRESHOLDS.minOuterWindows &&
    Number(metric.nEff || 0) >= DECISION_GATE_THRESHOLDS.minEffectiveSampleSize &&
    Number(metric.rMae) < 1.0 &&
    Number(metric.wis) < naiveWis &&
    Number(metric.coverage80Pct) >= DECISION_GATE_THRESHOLDS.minCoverage80Pct &&
    Number(metric.coverage80Pct) <= DECISION_GATE_THRESHOLDS.maxCoverage80Pct &&
    Number(metric.dmPValue) <= DECISION_GATE_THRESHOLDS.maxDmPValue &&
    Number(metric.bootPValue) <= DECISION_GATE_THRESHOLDS.maxBootstrapPValue
  );
}

/**
 * Master Plan §6.5 AUTO Relative selector:
 * Only picks an eligible non-experimental candidate that genuinely beats Baseline on WIS and rMAE < 1.0
 * on identical OOS windows without material calibration failure.
 * Never claims VALID or PROVEN edge.
 */
export function resolveRelativeCandidate(walkForward, modelTrajectories = []) {
  if (!walkForward) return null;
  const naiveWis = Number(walkForward.wisNaiveDistributional || 0);
  if (!(naiveWis > 0)) return null;
  const naivePathQ = Number(
    walkForward.naiveMetrics?.pathQualityScore ??
      walkForward.pathQualitySummary?.naivePathQualityScore ??
      0
  );

  const successTrajIds = new Set(
    (Array.isArray(modelTrajectories) ? modelTrajectories : [])
      .filter((t) => t && t.status === MODEL_EXECUTION_STATUS.SUCCESS && Array.isArray(t.points) && t.points.length > 0)
      .map((t) => t.modelId)
  );

  const pool = [walkForward.ensembleMetrics, ...(walkForward.modelBenchmarks || [])].filter((m) => {
    if (!m || m.modelId === 'naive_persistence') return false;
    const gov = resolveModelGovernance(m.modelId, m);
    if (m.experimentalOnly || gov.experimentalOnly || !gov.decisionPoolEligible) return false;
    if (m.status !== MODEL_EXECUTION_STATUS.SUCCESS) return false;
    if (!successTrajIds.has(m.modelId)) return false;
    const winCount = Number(m.windows || m.evaluatedWindows || 0);
    if (winCount < 1) return false;
    if (!(Number(m.rMae) < 1.0)) return false;
    if (!(Number(m.wis) < naiveWis)) return false;
    // Master Plan §6.5: If candidate is worse than Baseline on primary Path Quality score, relative selection is forbidden
    if (
      naivePathQ > 0 &&
      Number.isFinite(Number(m.pathQualityScore)) &&
      Number(m.pathQualityScore) > 0 &&
      Number(m.pathQualityScore) + 1.0 < naivePathQ
    ) {
      return false;
    }
    const cov80 = Number(m.coverage80Pct);
    if (
      Number.isFinite(cov80) &&
      (cov80 < DECISION_GATE_THRESHOLDS.relativeMinCoverage80Pct ||
        cov80 > DECISION_GATE_THRESHOLDS.relativeMaxCoverage80Pct)
    ) {
      return false;
    }
    return true;
  });

  if (pool.length === 0) return null;

  // Prefer the 3 structured path candidates if they beat baseline cleanly; otherwise best eligible by WIS
  const preferredPool = pool
    .filter((m) => PREFERRED_STRUCTURAL_MODELS.includes(m.modelId))
    .sort((a, b) => a.wis - b.wis || a.rMae - b.rMae);
  if (preferredPool.length > 0) {
    return { candidate: preferredPool[0], isPreferredStructural: true };
  }

  pool.sort((a, b) => a.wis - b.wis || a.rMae - b.rMae);
  return { candidate: pool[0], isPreferredStructural: false };
}

function buildPrimaryPathSummary(points, anchorClose, horizonBars) {
  if (!Array.isArray(points) || points.length === 0 || !(Number(anchorClose) > 0)) {
    return null;
  }
  const last = points[points.length - 1];
  const q10 = finiteOrNull(last?.q10);
  const q25 = finiteOrNull(last?.q25);
  const q50 = finiteOrNull(last?.q50 ?? last?.q50_median);
  const q75 = finiteOrNull(last?.q75);
  const q90 = finiteOrNull(last?.q90);
  if (q50 === null) return null;
  const pct = ((q50 - anchorClose) / anchorClose) * 100;
  const widthPct = q10 !== null && q90 !== null ? ((q90 - q10) / anchorClose) * 100 : null;
  const direction = Math.abs(pct) <= 0.12 ? 'NEUTRAL' : pct > 0 ? 'BULLISH' : 'BEARISH';
  return {
    direction,
    anchorClose: Number(anchorClose),
    horizonBars: Number(horizonBars || points.length),
    terminalQ10: q10,
    terminalQ25: q25,
    terminalQ50: q50,
    terminalQ75: q75,
    terminalQ90: q90,
    medianPctChange: Number(pct.toFixed(3)),
    corridorWidthPct: widthPct !== null ? Number(widthPct.toFixed(3)) : null,
  };
}

/**
 * Single authoritative Decision Layer summary consumed by Simple/Research UI and Strategy Bridge.
 */
export function buildDecisionSummary(forecastResult, options = {}) {
  const requestedModelId = String(
    options.requestedModelId || forecastResult?.requestedModelId || 'AUTO'
  ).trim();
  const isManualRequest = Boolean(requestedModelId && requestedModelId.toUpperCase() !== 'AUTO');
  const readiness = forecastResult?.readiness || null;
  const readinessState =
    readiness?.readinessState ||
    (forecastResult?.status === FORECAST_STATUS.DATA_NOT_READY
      ? DATA_READINESS_STATE.DATA_NOT_READY
      : DATA_READINESS_STATE.READY);

  // Step 1: Input Readiness Gate
  if (!forecastResult || forecastResult.status === FORECAST_STATUS.DATA_NOT_READY || readiness?.ready === false) {
    const missingBars = Number(readiness?.missingBarsCount || 0);
    const reasonEn =
      readinessState === DATA_READINESS_STATE.INSUFFICIENT_HISTORY && missingBars > 0
        ? `Insufficient history: ${missingBars} more closed bar(s) needed before running forecast.`
        : readinessState === DATA_READINESS_STATE.STALE_DATA
          ? 'Market data is stale relative to symbol session rules; refresh candles first.'
          : readinessState === DATA_READINESS_STATE.DATA_GAP
            ? `Disallowed market data gap detected (${readiness?.disallowedGapCount || 1} gap(s)).`
            : readiness?.issues?.[0] || 'Input candles failed data readiness validation.';
    const reasonFa =
      readinessState === DATA_READINESS_STATE.INSUFFICIENT_HISTORY && missingBars > 0
        ? `داده تاریخی ناکافی است: ${missingBars} کندل بسته‌شدهٔ دیگر برای اجرای پیش‌بینی لازم است.`
        : readinessState === DATA_READINESS_STATE.STALE_DATA
          ? 'آخرین کندل نسبت به سشن بازار قدیمی (Stale) است؛ ابتدا داده را همگام‌سازی کنید.'
          : readinessState === DATA_READINESS_STATE.DATA_GAP
            ? `شکاف زمانی غیرمجاز در تاریخچه بازار شناسایی شد (${readiness?.disallowedGapCount || 1} شکاف).`
            : 'ورودی کندل‌ها از دروازهٔ سلامت داده عبور نکرد.';
    return {
      policyVersion: DECISION_POLICY_VERSION,
      status: FORECAST_STATUS.DATA_NOT_READY,
      readinessState,
      edgeStatus: EDGE_STATUS.UNKNOWN,
      selectionMode: SELECTION_MODE.NO_CLEAR_WINNER_BASELINE,
      selectionTier: 'BASELINE',
      modelId: 'naive_persistence',
      modelName: 'Naive Persistence (Random Walk)',
      modelVersion: '2.0.0',
      isBaseline: true,
      isExperimentalOnly: false,
      governanceTier: 'BASELINE',
      pathSemantics: PATH_SEMANTICS.MARGINAL_MEDIAN,
      primaryPath: null,
      showUncertaintyBand: false,
      confidence: null,
      reasonCode: readinessState,
      reasonText: reasonEn,
      reasonTextFa: reasonFa,
      evidenceSummary: {
        evaluatedWindows: 0,
        requiredWindows: DECISION_GATE_THRESHOLDS.minOuterWindows,
        effectiveSampleSize: 0,
        requiredEffectiveSampleSize: DECISION_GATE_THRESHOLDS.minEffectiveSampleSize,
        rMae: null,
        wisModel: null,
        wisNaive: null,
        coverage80Pct: null,
        conformalStatus: 'UNAVAILABLE',
        missingBarsCount: missingBars,
      },
      allowStrategy: false,
      strategyBlockReason: 'DATA_NOT_READY',
      strategyBlockReasonText: 'Strategy evaluation blocked: market data is not ready.',
      strategyBlockReasonTextFa: 'ارسال به استراتژی غیرفعال است: داده‌های بازار هنوز آماده نیست.',
      warnings: Array.isArray(readiness?.issues) ? readiness.issues.slice(0, 4) : [],
    };
  }

  const wf = forecastResult.walkForward || null;
  const trajs = Array.isArray(forecastResult.modelTrajectories) ? forecastResult.modelTrajectories : [];
  const uncertainty = forecastResult.uncertainty || null;
  const mtf = forecastResult.mtfCoordination || null;
  const scenCal = forecastResult.scenarioCalibration || null;
  const noEdgeGate = forecastResult.noEdgeGate || null;

  const selectedModelId = String(forecastResult.selectedChartModelId || 'naive_persistence');
  const selectedTraj =
    trajs.find((t) => t && t.modelId === selectedModelId && t.status === MODEL_EXECUTION_STATUS.SUCCESS) ||
    trajs.find((t) => t && t.modelId === 'naive_persistence' && t.status === MODEL_EXECUTION_STATUS.SUCCESS) ||
    null;
  const resolvedModelId = selectedTraj?.modelId || selectedModelId || 'naive_persistence';
  const resolvedModelName =
    selectedTraj?.modelName ||
    (resolvedModelId === 'naive_persistence' ? 'Naive Persistence (Random Walk)' : resolvedModelId);
  const gov = resolveModelGovernance(resolvedModelId, selectedTraj);
  const isBaseline = resolvedModelId === 'naive_persistence';
  const isExperimentalOnly = Boolean(selectedTraj?.experimentalOnly || selectedTraj?.isApproximation || gov.experimentalOnly);
  const modelMetric = findOosMetricForModel(wf, resolvedModelId);
  const pathSemantics = resolvePathSemantics(resolvedModelId, selectedTraj);

  const kOuter = Number(wf?.evaluatedWindows || 0);
  const nEff = Number(wf?.effectiveSampleSize || 0);
  const conformalStatus = String(
    wf?.conformalCalibration?.calibrationStatus ||
      forecastResult.conformalCalibration?.calibrationStatus ||
      'UNDER_SAMPLED'
  );
  const hasSufficientStatEvidence =
    Boolean(wf) &&
    readiness?.statisticallySufficient !== false &&
    kOuter >= DECISION_GATE_THRESHOLDS.minOuterWindows &&
    nEff >= DECISION_GATE_THRESHOLDS.minEffectiveSampleSize &&
    conformalStatus === 'CALIBRATED_NORMALIZED';

  const isExtremeOod = uncertainty?.oodStatus === OOD_STATUS.EXTREME;
  const isElevatedOod = uncertainty?.oodStatus === OOD_STATUS.ELEVATED;
  const hasMtfConflict = mtf?.alignmentState === MTF_ALIGNMENT_STATE.STRUCTURAL_CONFLICT;
  const scenarioCalFailed = scenCal ? !scenCal.calibrationPassed : false;

  const selectionMode = String(forecastResult.selectionMode || SELECTION_MODE.NO_CLEAR_WINNER_BASELINE);
  const modelStrictPassed = hasSufficientStatEvidence && !isExtremeOod && modelPassesStrictGates(modelMetric, wf);
  const globalStrictPassed = hasSufficientStatEvidence && !isExtremeOod && Boolean(noEdgeGate?.hasEdge || wf?.acceptancePassed);

  let status = FORECAST_STATUS.INSUFFICIENT_EVIDENCE;
  let edgeStatus = EDGE_STATUS.UNKNOWN;
  let selectionTier = 'BASELINE';
  let confidence = DECISION_CONFIDENCE.LOW;
  let reasonCode = 'INSUFFICIENT_OOS_EVIDENCE';
  let reasonText = '';
  let reasonTextFa = '';
  let allowStrategy = false;
  let strategyBlockReason = 'NO_PROVEN_EDGE';
  let strategyBlockReasonText = 'Strategy generation from Forecast requires VALID status with proven OOS edge.';
  let strategyBlockReasonTextFa = 'تولید سیگنال از مسیر پیش‌بینی فقط با وضعیت معتبر (VALID) و لبهٔ آماری اثبات‌شده فعال می‌شود.';
  const warnings = [];

  if (isManualRequest) {
    selectionTier = 'MANUAL';
    if (isExperimentalOnly) {
      warnings.push('Selected model is a Research-only approximation and is excluded from AUTO/Strategy.');
    }
    if (!hasSufficientStatEvidence) {
      status = FORECAST_STATUS.INSUFFICIENT_EVIDENCE;
      edgeStatus = EDGE_STATUS.UNKNOWN;
      confidence = DECISION_CONFIDENCE.LOW;
      reasonCode = 'MANUAL_INSUFFICIENT_EVIDENCE';
      reasonText = `Manual view of ${resolvedModelName}: OOS evidence is insufficient (${kOuter}/${DECISION_GATE_THRESHOLDS.minOuterWindows} windows).`;
      reasonTextFa = `نمایش دستی ${resolvedModelName}: شواهد OOS هنوز کافی نیست (${kOuter} از ${DECISION_GATE_THRESHOLDS.minOuterWindows} پنجره).`;
      strategyBlockReason = 'INSUFFICIENT_EVIDENCE';
    } else if (isExperimentalOnly) {
      status = FORECAST_STATUS.PROVISIONAL;
      edgeStatus = EDGE_STATUS.NOT_PROVEN;
      confidence = DECISION_CONFIDENCE.LOW;
      reasonCode = 'MANUAL_EXPERIMENTAL_MODEL';
      reasonText = `Manual research view of experimental approximation ${resolvedModelName} (uncalibrated / not eligible for Strategy).`;
      reasonTextFa = `نمایش پژوهشی مدل تقریبی ${resolvedModelName} (کالیبره‌نشده و غیرمجاز برای استراتژی).`;
      strategyBlockReason = 'EXPERIMENTAL_MODEL_BLOCKED';
    } else if (modelStrictPassed && !isElevatedOod && !hasMtfConflict && !scenarioCalFailed) {
      status = FORECAST_STATUS.VALID;
      edgeStatus = EDGE_STATUS.PROVEN;
      confidence = DECISION_CONFIDENCE.HIGH;
      reasonCode = 'MANUAL_VALID_STRICT';
      reasonText = `Manual selection ${resolvedModelName} passed all strict OOS and calibration gates.`;
      reasonTextFa = `مدل انتخابی ${resolvedModelName} از تمام گیت‌های سخت‌گیرانهٔ OOS و کالیبراسیون عبور کرد.`;
      allowStrategy = true;
      strategyBlockReason = null;
      strategyBlockReasonText = null;
      strategyBlockReasonTextFa = null;
    } else if (modelStrictPassed) {
      status = FORECAST_STATUS.PROVISIONAL;
      edgeStatus = EDGE_STATUS.PROVEN;
      confidence = DECISION_CONFIDENCE.MEDIUM;
      reasonCode = 'MANUAL_PROVISIONAL_CAUTION';
      reasonText = `Manual selection ${resolvedModelName} beat Naive on OOS, but elevated OOD or MTF conflict requires caution.`;
      reasonTextFa = `مدل انتخابی ${resolvedModelName} در OOS برتری دارد، اما نوسان غیرعادی یا تضاد MTF نیازمند احتیاط است.`;
      strategyBlockReason = 'PROVISIONAL_CAUTION';
    } else {
      status = FORECAST_STATUS.NO_EDGE;
      edgeStatus = EDGE_STATUS.NOT_PROVEN;
      confidence = DECISION_CONFIDENCE.LOW;
      reasonCode = 'MANUAL_NO_PROVEN_EDGE';
      reasonText = `Manual selection ${resolvedModelName}: no proven statistical edge over Naive baseline on OOS.`;
      reasonTextFa = `مدل انتخابی ${resolvedModelName}: برتری آماری اثبات‌شده نسبت به مبنا (Naive) در OOS ندارد.`;
      strategyBlockReason = 'NO_STATISTICAL_EDGE';
    }
  } else if (!hasSufficientStatEvidence) {
    // Step 2: Insufficient Statistical OOS Evidence
    status = FORECAST_STATUS.INSUFFICIENT_EVIDENCE;
    edgeStatus = EDGE_STATUS.UNKNOWN;
    selectionTier = 'BASELINE';
    confidence = DECISION_CONFIDENCE.LOW;
    reasonCode = 'INSUFFICIENT_OOS_EVIDENCE';
    reasonText = `Insufficient OOS evidence (${kOuter}/${DECISION_GATE_THRESHOLDS.minOuterWindows} windows, N_eff=${nEff.toFixed(1)}/25); showing ${resolvedModelName}.`;
    reasonTextFa = `شواهد OOS ناکافی است (${kOuter} از ${DECISION_GATE_THRESHOLDS.minOuterWindows} پنجره، نمونهٔ مؤثر ${nEff.toFixed(1)})؛ مسیر مبنا نمایش داده می‌شود.`;
    strategyBlockReason = 'INSUFFICIENT_EVIDENCE';
    strategyBlockReasonText = `Blocked: requires >= ${DECISION_GATE_THRESHOLDS.minOuterWindows} non-overlapping OOS windows (have ${kOuter}).`;
    strategyBlockReasonTextFa = `غیرفعال: حداقل ${DECISION_GATE_THRESHOLDS.minOuterWindows} پنجرهٔ OOS مستقل لازم است (موجود: ${kOuter}).`;
  } else if (selectionMode === SELECTION_MODE.AUTO_OOS_BEST && (modelStrictPassed || globalStrictPassed)) {
    // Step 3: Strict OOS Winner
    selectionTier = 'AUTO_STRICT';
    edgeStatus = EDGE_STATUS.PROVEN;
    if (isElevatedOod || hasMtfConflict || scenarioCalFailed) {
      status = FORECAST_STATUS.PROVISIONAL;
      confidence = DECISION_CONFIDENCE.MEDIUM;
      reasonCode = 'STRICT_WINNER_WITH_CAUTION';
      reasonText = `${resolvedModelName} won strict OOS gates, downgraded to Provisional due to OOD/MTF caution.`;
      reasonTextFa = `مدل ${resolvedModelName} برندهٔ OOS شد، اما به دلیل هشدار OOD یا تضاد تایم‌فریم در وضعیت موقت قرار گرفت.`;
      allowStrategy = false;
      strategyBlockReason = 'PROVISIONAL_CAUTION';
      strategyBlockReasonText = 'Blocked: Forecast is Provisional due to elevated OOD or MTF structural conflict.';
      strategyBlockReasonTextFa = 'غیرفعال: وضعیت پیش‌بینی به دلیل هشدار OOD یا تضاد MTF موقت است.';
    } else {
      status = FORECAST_STATUS.VALID;
      const cov80 = Number(modelMetric?.coverage80Pct ?? wf?.coverage80Pct ?? 80);
      confidence = Math.abs(cov80 - 80) <= 5.0 ? DECISION_CONFIDENCE.HIGH : DECISION_CONFIDENCE.MEDIUM;
      reasonCode = 'STRICT_OOS_WINNER';
      reasonText = `${resolvedModelName} beat Naive baseline across all 6 strict OOS and conformal gates.`;
      reasonTextFa = `مدل ${resolvedModelName} در هر ۶ گیت سخت‌گیرانهٔ OOS و کالیبراسیون از مبنا (Naive) بهتر عمل کرد.`;
      allowStrategy = true;
      strategyBlockReason = null;
      strategyBlockReasonText = null;
      strategyBlockReasonTextFa = null;
    }
  } else if (selectionMode === SELECTION_MODE.AUTO_RELATIVE_PROVISIONAL && !isBaseline && !isExperimentalOnly && !isExtremeOod) {
    // Step 4a: AUTO Relative Candidate (beats baseline on WIS & rMAE < 1 without calibration collapse, but not strict 6-gate proven)
    status = FORECAST_STATUS.PROVISIONAL;
    edgeStatus = EDGE_STATUS.NOT_PROVEN;
    selectionTier = 'AUTO_RELATIVE';
    confidence = DECISION_CONFIDENCE.LOW;
    reasonCode = 'RELATIVE_CANDIDATE_UNPROVEN';
    reasonText = `Relative candidate ${resolvedModelName} improved over Naive on WIS/MAE, but statistical edge is NOT strictly proven.`;
    reasonTextFa = `گزینهٔ نسبی ${resolvedModelName} نسبت به مبنا بهتر بود، اما برتری آماری آن هنوز به‌طور سخت‌گیرانه اثبات نشده است.`;
    allowStrategy = false;
    strategyBlockReason = 'RELATIVE_PROVISIONAL_NOT_PROVEN';
    strategyBlockReasonText = 'Blocked: Provisional relative candidate has no strictly proven OOS edge.';
    strategyBlockReasonTextFa = 'غیرفعال: مسیر نسبی/موقت فاقد اثبات آماری سخت‌گیرانه است و مجاز به تولید سیگنال نیست.';
    warnings.push('Relative candidate only — NOT a statistically proven winner.');
  } else {
    // Step 4b: No Edge -> Transparent Baseline Fallback
    status = FORECAST_STATUS.NO_EDGE;
    edgeStatus = EDGE_STATUS.NOT_PROVEN;
    selectionTier = 'BASELINE';
    confidence = DECISION_CONFIDENCE.LOW;
    reasonCode = isExtremeOod ? 'EXTREME_OOD_NO_EDGE' : 'NO_STATISTICAL_EDGE';
    reasonText = isExtremeOod
      ? 'Extreme out-of-distribution regime detected; no edge claimed, displaying baseline.'
      : 'No eligible model outperformed the Naive baseline on OOS; displaying baseline.';
    reasonTextFa = isExtremeOod
      ? 'شرایط غیرعادی (Extreme OOD) تشخیص داده شد؛ بدون ادعای لبه، مسیر مبنا نمایش داده می‌شود.'
      : 'هیچ مدل واجد شرایطی از مبنا (Naive) بهتر نشد؛ مسیر مبنا نمایش داده می‌شود.';
    allowStrategy = false;
    strategyBlockReason = reasonCode;
    strategyBlockReasonText = 'Blocked: No statistically proven forecast edge over Naive baseline.';
    strategyBlockReasonTextFa = 'غیرفعال: هیچ لبهٔ آماری اثبات‌شده‌ای نسبت به مبنا وجود ندارد.';
  }

  if (isElevatedOod) warnings.push('Elevated OOD volatility/tail regime detected.');
  if (isExtremeOod) warnings.push('Extreme OOD regime forbids statistical edge claims.');
  if (hasMtfConflict) warnings.push('Higher-timeframe structure conflicts with lower-timeframe projection.');

  const pointsForPath =
    Array.isArray(forecastResult.points) && forecastResult.points.length > 0
      ? forecastResult.points
      : selectedTraj?.points || [];
  const primaryPath = buildPrimaryPathSummary(pointsForPath, forecastResult.anchorClose, forecastResult.horizonBars);
  const showUncertaintyBand = Boolean(
    primaryPath &&
      !isExperimentalOnly &&
      (isBaseline || selectedTraj?.isCalibratedInterval !== false || conformalStatus === 'CALIBRATED_NORMALIZED')
  );

  return {
    policyVersion: DECISION_POLICY_VERSION,
    status,
    readinessState,
    edgeStatus,
    selectionMode,
    selectionTier,
    modelId: resolvedModelId,
    modelName: resolvedModelName,
    modelVersion: String(selectedTraj?.modelVersion || forecastResult.engineVersion || '2.0.0'),
    isBaseline,
    isExperimentalOnly,
    governanceTier: gov.governanceTier,
    pathSemantics,
    primaryPath,
    showUncertaintyBand,
    confidence,
    reasonCode,
    reasonText,
    reasonTextFa,
    evidenceSummary: {
      evaluatedWindows: kOuter,
      requiredWindows: DECISION_GATE_THRESHOLDS.minOuterWindows,
      effectiveSampleSize: Number(nEff.toFixed(2)),
      requiredEffectiveSampleSize: DECISION_GATE_THRESHOLDS.minEffectiveSampleSize,
      rMae: finiteOrNull(modelMetric?.rMae ?? wf?.relativeMaeVsNaive),
      wisModel: finiteOrNull(modelMetric?.wis ?? wf?.wisModel),
      wisNaive: finiteOrNull(wf?.wisNaiveDistributional),
      coverage80Pct: finiteOrNull(modelMetric?.coverage80Pct ?? wf?.coverage80Pct),
      dmPValue: finiteOrNull(modelMetric?.dmPValue ?? wf?.dieboldMarianoPValue),
      bootPValue: finiteOrNull(modelMetric?.bootPValue ?? wf?.sensitivityBootstrapPValue),
      conformalStatus,
      missingBarsCount: Number(readiness?.missingBarsCount || 0),
    },
    allowStrategy,
    strategyBlockReason,
    strategyBlockReasonText,
    strategyBlockReasonTextFa,
    warnings,
  };
}
