import {
  CALENDAR_REGISTRY_VERSION,
  CONTRACT_VERSION,
  ENGINE_VERSION,
  EXECUTION_RUNTIME,
  FEATURE_PIPELINE_VERSION,
  FORECAST_STATUS,
  MODEL_EXECUTION_STATUS,
  OOD_STATUS,
  MTF_ALIGNMENT_STATE,
  RENDER_MODES,
  SELECTION_MODE,
  SPEC_VERSION,
  advanceFutureTimestamps,
  canonicalJson,
  clampHorizonBars,
  computeHorizonRequirements,
  enforceMonotonicQuantiles,
  normalizeRenderMode,
  resolveCalendarSpec,
  roundToSignificant,
  sha256Hex,
  validateDataReadiness,
} from './forecastContract.js?v=1.47.40';
import { extractForecastFeatures } from './featureExtractor.js?v=1.47.40';
import { defaultForecastRegistry, ForecastModelRegistry } from './modelRegistry.js?v=1.47.40';
import {
  applyConformalAdjustmentToQuantiles,
  buildZeroDriftLogNormalNaiveQuantiles,
  computeNaiveSigmaRw,
} from './statisticalTests.js?v=1.47.40';
import {
  buildDisjointNestedSplits,
  buildPriceTrajectoryFromPrediction,
  evaluateWalkForward,
  selectOosChartWinner,
} from './walkForwardEvaluator.js?v=1.47.40';
import {
  computeForecastStability,
  computeOodAndUncertainty,
  coordinateMultiTimeframe,
  detectKeyZonesAndEventTree,
  evaluateNoEdgeGate,
} from './forecastV130Analyzer.js?v=1.47.40';
import { EmpiricalAnalogEngine } from './empiricalAnalogEngine.js?v=1.47.40';
import { SMCPredictionEngine, computeSmcPrediction } from './smcPredictionEngine.js?v=1.47.40';
import { computeStructuralForecast } from '../algorithms/structuralForecastEngine.js?v=1.47.40';

export { EmpiricalAnalogEngine, SMCPredictionEngine };

export const CANONICAL_SMC_HORIZON = 60;
const WALK_FORWARD_CACHE = new Map();

export function resolveLowerTimeframeInfo(timeframe = 'M15') {
  const tf = String(timeframe || 'M15').trim().toUpperCase();
  if (tf === 'M30') return { timeframe: 'M15', ratio: 2 };
  if (tf === 'H1') return { timeframe: 'M15', ratio: 4 };
  if (tf === 'H4') return { timeframe: 'H1', ratio: 4 };
  if (tf === 'D1') return { timeframe: 'H4', ratio: 6 };
  return null;
}

function buildForecastPointsFromQuantileTrajectory(trajSteps, canonicalTimestamps, features, horizonBars, conformalCalibration = null) {
  const out = new Array(horizonBars);
  for (let h = 0; h < horizonBars; h++) {
    const rawStep = trajSteps[h];
    const adj = conformalCalibration
      ? applyConformalAdjustmentToQuantiles(
          rawStep,
          features.lastClose,
          features.ewmaSigma,
          h + 1,
          conformalCalibration,
          features.lastClose * 0.01
        )
      : rawStep;
    const mq = enforceMonotonicQuantiles(adj, features.lastClose * 0.01);
    out[h] = {
      stepAhead: h + 1,
      openTimeUtcMs: canonicalTimestamps[h],
      q10: mq.q10,
      q25: mq.q25,
      q50: mq.q50,
      q75: mq.q75,
      q90: mq.q90,
      upperBand: mq.q90,
      lowerBand: mq.q10,
      pctChangeFromLast: ((mq.q50 - features.lastClose) / features.lastClose) * 100,
    };
  }
  return out;
}

function buildCanonicalCandlesHash(candles) {
  const trimmed = candles.slice(-2500).map((c) => [
    Number(c.openTimeUtcMs ?? c.open_time_utc_ms ?? c.time),
    Number(c.open),
    Number(c.high),
    Number(c.low),
    Number(c.close),
    Number(c.volume || 0),
  ]);
  return sha256Hex(canonicalJson(trimmed));
}

export class ForecastEngine {
  static project(candles = [], options = {}) {
    const symbolCode = String(options.symbolCode || 'XAUUSD').trim().toUpperCase();
    const providerId = String(options.providerId || 'twelvedata').trim().toLowerCase();
    const timeframe = String(options.timeframe || 'M15').trim().toUpperCase();
    const horizonBars = clampHorizonBars(options.horizonBars ?? options.horizon ?? 30);
    const renderMode = normalizeRenderMode(options.renderMode);
    const registry = options.registry instanceof ForecastModelRegistry ? options.registry : defaultForecastRegistry;
    const workerUrl = String(options.workerUrl || '');
    const generatedAtUtcMs = Number(options.generatedAtUtcMs || Date.now());
    const higherTimeframe = String(options.higherTimeframe || '').trim().toUpperCase();
    const higherTimeframeCandles = Array.isArray(options.higherTimeframeCandles) ? options.higherTimeframeCandles : [];
    const previousForecast = options.previousForecast || null;
    const requestedModelId = String(options.selectedModelId || 'AUTO');
    const calendarSpec = options.calendarSpec || resolveCalendarSpec(symbolCode, providerId);
    const priceBasis = String(options.priceBasis || 'MID_OHLC');
    const req = computeHorizonRequirements(horizonBars);

    const readiness = validateDataReadiness(candles, {
      horizonBars,
      minBars: options.minBars,
      timeframe,
      symbolCode,
      providerId,
      calendarSpec,
      anchorNowMs: options.anchorNowMs,
      checkClosedBar: options.checkClosedBar,
      enforceCalendarGaps: options.enforceCalendarGaps,
    });

    if (!readiness.ready) {
      return {
        contractVersion: CONTRACT_VERSION,
        specVersion: SPEC_VERSION,
        engineVersion: ENGINE_VERSION,
        status: FORECAST_STATUS.DATA_NOT_READY,
        symbolCode,
        timeframe,
        horizonBars,
        renderMode,
        generatedAtUtcMs,
        calendarSpec: {
          calendarId: calendarSpec.calendarId,
          calendarVersion: calendarSpec.calendarVersion || CALENDAR_REGISTRY_VERSION,
          ianaTimezone: calendarSpec.ianaTimezone,
        },
        readiness,
        remoteWorker: ForecastModelRegistry.resolveRemoteWorkerStatus(workerUrl),
        uncertainty: null,
        conformalCalibration: null,
        scenarioCalibration: null,
        noEdgeGate: null,
        keyZones: [],
        eventDictionary: null,
        mtfCoordination: null,
        stability: null,
        points: [],
        scenarios: [],
        representativePaths: [],
        modelContributions: [],
        modelTrajectories: [],
        selectedChartModelId: 'naive_persistence',
        selectionMode: SELECTION_MODE.NO_CLEAR_WINNER_BASELINE,
        selectionReason: readiness.issues[0] || 'Data readiness check failed',
        walkForward: {
          evaluatedWindows: 0,
          evalHorizon: horizonBars,
          outerStrideBars: horizonBars,
          forecastStatus: FORECAST_STATUS.DATA_NOT_READY,
          acceptancePassed: false,
          acceptanceReason: readiness.issues[0] || 'Data readiness check failed',
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
          dieboldMarianoPValue: 1.0,
          sensitivityBootstrapPValue: 1.0,
          effectiveSampleSize: 0,
        },
        summary: null,
        inputHash: sha256Hex(`${CONTRACT_VERSION}|${symbolCode}|${timeframe}|DATA_NOT_READY|${readiness.errorCodes.join(',')}`),
      };
    }

    const cleanCandles = readiness.cleanCandles;
    const features = extractForecastFeatures(cleanCandles, 2500);
    if (!features) {
      return this.project([], { ...options, minBars: readiness.nOpMin });
    }

    // Strictly validate finite OHLCV inputs for inputHash computation (§5.4)
    const candlesSha256 = buildCanonicalCandlesHash(cleanCandles);
    const htfCandlesSha256 = higherTimeframeCandles.length > 0
      ? buildCanonicalCandlesHash(
          higherTimeframeCandles.filter((c) => Number.isFinite(Number(c?.close)) && Number(c.close) > 0)
        )
      : null;

    const inputHashPayload = {
      contractVersion: CONTRACT_VERSION,
      engineVersion: ENGINE_VERSION,
      symbolCode,
      timeframe,
      horizonBars,
      dataProvenance: {
        providerId,
        priceBasis,
        hasRealVolume: Boolean(features.hasRealVolume),
      },
      calendarSpec: {
        calendarId: calendarSpec.calendarId,
        calendarVersion: calendarSpec.calendarVersion || CALENDAR_REGISTRY_VERSION,
        ianaTimezone: calendarSpec.ianaTimezone,
      },
      featureConfig: {
        featurePipelineVersion: FEATURE_PIPELINE_VERSION,
        lookbackWindow: Math.min(cleanCandles.length, 2500),
        scaling: 'LOG_RETURN_Z',
      },
      modelRegistry: registry.serializeConfigForHash(),
      calibrationConfig: {
        conformalAlpha: 0.20,
        decayLambda: 0.92,
      },
      candlesSha256,
      htfCandlesSha256,
    };
    const inputHash = sha256Hex(canonicalJson(inputHashPayload));

    const split = buildDisjointNestedSplits(cleanCandles.length, horizonBars);
    const activePlugins = registry.getEnabledPlugins();
    const effectivePlugins =
      activePlugins.length > 0
        ? activePlugins
        : [{ plugin: registry.getPlugin('naive_persistence'), config: { weight: 1, params: {} } }].filter((x) => Boolean(x.plugin));

    let walkForward = null;
    if (options.skipWalkForward !== true) {
      const excludeExperimental = options.excludeExperimental !== false;
      const wfKey = canonicalJson({
        inputHash,
        horizonBars,
        excludeExperimental,
        skipBootstrap: Boolean(options.skipBootstrap),
        bootstrapB: Number(options.bootstrapB || 1000),
      });
      if (options.bypassWalkForwardCache !== true && WALK_FORWARD_CACHE.has(wfKey)) {
        walkForward = WALK_FORWARD_CACHE.get(wfKey);
      } else {
        walkForward = evaluateWalkForward(cleanCandles, registry, {
          horizonBars,
          excludeExperimental,
          skipBootstrap: options.skipBootstrap,
          bootstrapB: options.bootstrapB || 1000,
          symbolCode,
          providerId,
          timeframe,
        });
        if (WALK_FORWARD_CACHE.size > 48) {
          WALK_FORWARD_CACHE.delete(WALK_FORWARD_CACHE.keys().next().value);
        }
        WALK_FORWARD_CACHE.set(wfKey, walkForward);
      }
    }

    const canonicalTimestamps = advanceFutureTimestamps(
      features.lastOpenMs,
      timeframe,
      horizonBars,
      symbolCode,
      providerId,
      calendarSpec
    );

    const modelOutputs = [];
    const modelContributions = [];
    const modelTrajectories = [];
    const ensMeanReturns = new Array(horizonBars).fill(0);
    const aleatoricVarSteps = new Array(horizonBars).fill(0);
    const trainStartMs = Number(features.candles[0]?.openTimeUtcMs || 0);
    const trainEndMs = features.lastOpenMs;

    const frozenWeights = walkForward?.frozenWeights || {};
    const hasFrozenWeights = Object.keys(frozenWeights).length > 0;
    const rawWeights = effectivePlugins.map(({ plugin, config }) => {
      if (plugin.id === 'naive_persistence') return 0;
      if (hasFrozenWeights) return Number(frozenWeights[plugin.id] || 0);
      if ((plugin.experimentalOnly || plugin.isApproximation) && options.allowExperimentalInEnsemble !== true) return 0;
      return Math.max(0.01, Number(config.weight || 0.1));
    });

    const naiveSigmaRw = computeNaiveSigmaRw(features.logReturns);
    let totalSuccessWeight = 0;
    const rawPreds = [];

    for (let idx = 0; idx < effectivePlugins.length; idx++) {
      const { plugin, config } = effectivePlugins[idx];
      let pred;
      try {
        pred =
          plugin.id === 'naive_persistence'
            ? {
                modelId: 'naive_persistence',
                modelVersion: plugin.modelVersion || '2.0.0',
                status: MODEL_EXECUTION_STATUS.SUCCESS,
                isApproximation: false,
                isCalibratedInterval: true,
                meanReturns: new Array(horizonBars).fill(0),
                sigmas: new Array(horizonBars).fill(naiveSigmaRw),
              }
            : plugin.predict({ ...features, futureTimestamps: canonicalTimestamps }, horizonBars, config.params || {});
      } catch (err) {
        pred = {
          modelId: plugin.id,
          status: MODEL_EXECUTION_STATUS.FAILED,
          reason: String(err?.message || err),
          meanReturns: [],
          sigmas: [],
        };
      }
      const st = pred?.status || MODEL_EXECUTION_STATUS.SUCCESS;
      const valid =
        st === MODEL_EXECUTION_STATUS.SUCCESS &&
        Array.isArray(pred?.meanReturns) &&
        pred.meanReturns.length >= horizonBars;
      const wVal = rawWeights[idx];
      if (valid && wVal > 0) totalSuccessWeight += wVal;
      rawPreds.push({ plugin, config, pred, st, valid, rawW: wVal });
    }

    const conformalCalibration = walkForward?.conformalCalibration || null;
    const safeWeightSum = totalSuccessWeight > 0 ? totalSuccessWeight : 1;

    for (const item of rawPreds) {
      const { plugin, pred, st, valid, rawW } = item;
      const normW = valid && rawW > 0 ? rawW / safeWeightSum : 0;

      if (!valid) {
        modelTrajectories.push({
          modelId: plugin.id,
          modelName: plugin.name,
          family: plugin.family,
          modelVersion: pred?.modelVersion || plugin.modelVersion || '2.0.0',
          executionRuntime: EXECUTION_RUNTIME.NATIVE_JS,
          isApproximation: Boolean(pred?.isApproximation ?? plugin.isApproximation),
          isCalibratedInterval: false,
          status: st === MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA ? st : MODEL_EXECUTION_STATUS.FAILED,
          reason: pred?.reason || 'Model unavailable on current input window',
          trainingStartUtcMs: trainStartMs,
          trainingEndUtcMs: trainEndMs,
          trainingSampleCount: features.barCount,
          points: [],
        });
        continue;
      }

      if (normW > 0) {
        modelOutputs.push({ plugin, normW, pred });
        for (let h = 0; h < horizonBars; h++) {
          const mr = Number(pred.meanReturns[h] || 0);
          const sg = Math.max(1e-5, Number(pred.sigmas[h] || features.ewmaSigma));
          ensMeanReturns[h] += normW * mr;
          aleatoricVarSteps[h] += normW * sg * sg;
        }
      }

      const rawTraj =
        plugin.id === 'naive_persistence'
          ? Array.from({ length: horizonBars }, (_, h) => buildZeroDriftLogNormalNaiveQuantiles(features.lastClose, naiveSigmaRw, h + 1))
          : buildPriceTrajectoryFromPrediction(features.lastClose, pred, horizonBars);
      const pts = buildForecastPointsFromQuantileTrajectory(
        rawTraj,
        canonicalTimestamps,
        features,
        horizonBars,
        plugin.id === 'naive_persistence' ? null : conformalCalibration
      );

      modelTrajectories.push({
        modelId: plugin.id,
        modelName: plugin.name,
        family: plugin.family,
        modelVersion: pred?.modelVersion || plugin.modelVersion || '2.0.0',
        executionRuntime: EXECUTION_RUNTIME.NATIVE_JS,
        isApproximation: Boolean(pred?.isApproximation ?? plugin.isApproximation),
        isCalibratedInterval: plugin.id === 'naive_persistence' || conformalCalibration?.calibrationStatus === 'CALIBRATED_NORMALIZED',
        status: MODEL_EXECUTION_STATUS.SUCCESS,
        reason: '',
        trainingStartUtcMs: trainStartMs,
        trainingEndUtcMs: trainEndMs,
        trainingSampleCount: features.barCount,
        points: pts,
        meta: pred.meta || {},
      });

      const terminalPt = pts[pts.length - 1];
      modelContributions.push({
        modelId: plugin.id,
        modelName: plugin.name,
        family: plugin.family,
        weight: Number(normW.toFixed(4)),
        terminalPrice: terminalPt.q50,
        terminalPctChange: terminalPt.pctChangeFromLast,
        meta: pred.meta || {},
      });
    }

    if (totalSuccessWeight <= 0) {
      for (let h = 0; h < horizonBars; h++) {
        aleatoricVarSteps[h] = naiveSigmaRw * naiveSigmaRw;
      }
    }

    let totalAleatoricCumVar = 0;
    let totalEpistemicDispVar = 0;
    const epistemicDispSteps = new Array(horizonBars).fill(0);
    for (let h = 0; h < horizonBars; h++) {
      let disp = 0;
      for (const m of modelOutputs) {
        const diff = Number(m.pred.meanReturns[h] || 0) - ensMeanReturns[h];
        disp += m.normW * diff * diff;
      }
      epistemicDispSteps[h] = disp;
      totalAleatoricCumVar += aleatoricVarSteps[h];
      totalEpistemicDispVar += disp;
    }

    const uncertainty = computeOodAndUncertainty(
      features,
      totalAleatoricCumVar,
      totalEpistemicDispVar,
      walkForward?.effectiveSampleSize
    );

    const epiFactorPerStep =
      1 / Math.max(6, Number(walkForward?.effectiveSampleSize || features.barCount / 4)) +
      (uncertainty.oodStatus === OOD_STATUS.EXTREME ? 0.48 : uncertainty.oodStatus === OOD_STATUS.ELEVATED ? 0.20 : 0);

    const ensSigmas = aleatoricVarSteps.map(
      (v, idx) => Math.sqrt(Math.max(1e-10, v * (1 + 0.35 * epiFactorPerStep) + epistemicDispSteps[idx])) * uncertainty.spreadMultiplierApplied
    );
    const ensRawTraj = buildPriceTrajectoryFromPrediction(
      features.lastClose,
      { meanReturns: ensMeanReturns, sigmas: ensSigmas },
      horizonBars
    );
    const ensPoints = buildForecastPointsFromQuantileTrajectory(
      ensRawTraj,
      canonicalTimestamps,
      features,
      horizonBars,
      conformalCalibration
    );

    modelTrajectories.push({
      modelId: 'ensemble',
      modelName: 'Calibrated Ensemble (V2)',
      family: 'ENSEMBLE',
      modelVersion: '2.0.0',
      executionRuntime: EXECUTION_RUNTIME.NATIVE_JS,
      isApproximation: false,
      isCalibratedInterval: conformalCalibration?.calibrationStatus === 'CALIBRATED_NORMALIZED',
      status: MODEL_EXECUTION_STATUS.SUCCESS,
      reason: '',
      trainingStartUtcMs: trainStartMs,
      trainingEndUtcMs: trainEndMs,
      trainingSampleCount: features.barCount,
      points: ensPoints,
    });

    // Strictly causal empirical analogs (upgraded Rev 2.2 — declustered, vol-scaled, kernel-weighted)
    const analogEngine = new EmpiricalAnalogEngine(24, horizonBars, timeframe);
    const analogRes = analogEngine.projectEmpirical(cleanCandles, features, horizonBars, canonicalTimestamps);
    const representativePaths = analogRes.representativePaths || [];
    if (analogRes.status === MODEL_EXECUTION_STATUS.SUCCESS) {
      modelTrajectories.push({
        modelId: 'empirical_analogs',
        modelName: 'Causal Historical Analogs',
        family: 'PATTERN_EMPIRICAL',
        modelVersion: '2.2.0',
        executionRuntime: EXECUTION_RUNTIME.NATIVE_JS,
        isApproximation: false,
        isCalibratedInterval: conformalCalibration?.calibrationStatus === 'CALIBRATED_NORMALIZED',
        status: MODEL_EXECUTION_STATUS.SUCCESS,
        reason: analogRes.reason,
        trainingStartUtcMs: trainStartMs,
        trainingEndUtcMs: trainEndMs,
        trainingSampleCount: features.barCount,
        points: buildForecastPointsFromQuantileTrajectory(analogRes.points, canonicalTimestamps, features, horizonBars, conformalCalibration),
        meta: {
          matchedCount: analogRes.matchedCount,
          declusteredCount: analogRes.declusteredCount,
          minSeparationBars: analogRes.minSeparationBars,
          effectiveSampleWeight: analogRes.effectiveSampleWeight,
          avgVolScale: analogRes.avgVolScale,
          medianDistance: analogRes.medianDistance,
        },
      });
    } else {
      modelTrajectories.push({
        modelId: 'empirical_analogs',
        modelName: 'Causal Historical Analogs',
        family: 'PATTERN_EMPIRICAL',
        modelVersion: '2.2.0',
        executionRuntime: EXECUTION_RUNTIME.NATIVE_JS,
        isApproximation: false,
        isCalibratedInterval: false,
        status: MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA,
        reason: analogRes.reason,
        trainingStartUtcMs: trainStartMs,
        trainingEndUtcMs: trainEndMs,
        trainingSampleCount: features.barCount,
        points: [],
      });
    }

    // First-class Structural Wave JS trajectory (enables Walk-Forward parity, Compare overlays, and Replay)
    let structRes = null;
    try {
      structRes = computeStructuralForecast({
        candles: cleanCandles.slice(-360).map((c) => ({
          open_time_utc_ms: Number(c.openTimeUtcMs ?? c.open_time_utc_ms ?? 0),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          is_closed: true,
        })),
        symbolCode,
        provider: providerId,
        timeframe,
        horizonBars,
        nowMs: Math.max(generatedAtUtcMs, features.lastOpenMs + 86400000 * 14),
        skipAnalogs: true,
      });
    } catch (_) {
      structRes = null;
    }
    if (structRes?.status === 'READY' && Array.isArray(structRes.forecast) && structRes.forecast.length >= horizonBars) {
      const structRawTraj = structRes.forecast.slice(0, horizonBars).map((pt) => ({
        q10: Number(pt.q10),
        q25: Number(pt.q25),
        q50: Number(pt.q50_median),
        q75: Number(pt.q75),
        q90: Number(pt.q90),
      }));
      modelTrajectories.push({
        modelId: 'structural_wave_js',
        modelName: 'Structural Wave (JS)',
        family: 'STRUCTURAL_WAVE',
        modelVersion: '2.2.0',
        executionRuntime: EXECUTION_RUNTIME.NATIVE_JS,
        isApproximation: false,
        isCalibratedInterval: conformalCalibration?.calibrationStatus === 'CALIBRATED_NORMALIZED',
        status: MODEL_EXECUTION_STATUS.SUCCESS,
        reason: '',
        trainingStartUtcMs: trainStartMs,
        trainingEndUtcMs: trainEndMs,
        trainingSampleCount: Math.min(cleanCandles.length, 360),
        points: buildForecastPointsFromQuantileTrajectory(structRawTraj, canonicalTimestamps, features, horizonBars, conformalCalibration),
        meta: {
          structureBias: structRes.engine?.params?.structure_bias || '',
          volatilityRegime: structRes.engine?.params?.volatility_regime || '',
          structuralZonesCount: Number(structRes.engine?.params?.structural_zones_count || 0),
          zoneMagnetHits: Number(structRes.engine?.params?.zone_magnet_hits || 0),
          turningPoints: structRes.turning_points || [],
        },
      });
    } else {
      modelTrajectories.push({
        modelId: 'structural_wave_js',
        modelName: 'Structural Wave (JS)',
        family: 'STRUCTURAL_WAVE',
        modelVersion: '2.2.0',
        executionRuntime: EXECUTION_RUNTIME.NATIVE_JS,
        isApproximation: false,
        isCalibratedInterval: false,
        status: MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA,
        reason: structRes?.error || 'Insufficient structural swings for Structural JS trajectory.',
        trainingStartUtcMs: trainStartMs,
        trainingEndUtcMs: trainEndMs,
        trainingSampleCount: Math.min(cleanCandles.length, 360),
        points: [],
      });
    }

    // First-class Independent Causal SMC Prediction Engine (`smc_prediction_js`)
    let smcRes = null;
    try {
      smcRes = computeSmcPrediction(cleanCandles, features, horizonBars, {
        timeframe,
        canonicalTimestamps,
      });
    } catch (_) {
      smcRes = null;
    }
    if (smcRes?.status === MODEL_EXECUTION_STATUS.SUCCESS && Array.isArray(smcRes.points) && smcRes.points.length >= horizonBars) {
      modelTrajectories.push({
        modelId: 'smc_prediction_js',
        modelName: 'SMC Prediction Engine',
        family: 'SMC_LIQUIDITY',
        modelVersion: smcRes.modelVersion || '2.3.0',
        executionRuntime: EXECUTION_RUNTIME.NATIVE_JS,
        isApproximation: false,
        isCalibratedInterval: conformalCalibration?.calibrationStatus === 'CALIBRATED_NORMALIZED',
        status: MODEL_EXECUTION_STATUS.SUCCESS,
        reason: '',
        trainingStartUtcMs: trainStartMs,
        trainingEndUtcMs: trainEndMs,
        trainingSampleCount: Math.min(cleanCandles.length, 300),
        points: buildForecastPointsFromQuantileTrajectory(smcRes.points, canonicalTimestamps, features, horizonBars, conformalCalibration),
        meta: smcRes.meta || {},
      });
    } else {
      modelTrajectories.push({
        modelId: 'smc_prediction_js',
        modelName: 'SMC Prediction Engine',
        family: 'SMC_LIQUIDITY',
        modelVersion: '2.3.0',
        executionRuntime: EXECUTION_RUNTIME.NATIVE_JS,
        isApproximation: false,
        isCalibratedInterval: false,
        status: MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA,
        reason: smcRes?.reason || 'Insufficient causal SMC market structure or liquidity zones.',
        trainingStartUtcMs: trainStartMs,
        trainingEndUtcMs: trainEndMs,
        trainingSampleCount: Math.min(cleanCandles.length, 300),
        points: [],
      });
    }

    const selection = selectOosChartWinner(walkForward, modelTrajectories, requestedModelId);
    const chosenTrajectory =
      modelTrajectories.find(
        (t) => t.modelId === selection.selectedModelId && t.status === MODEL_EXECUTION_STATUS.SUCCESS && t.points.length === horizonBars
      ) || modelTrajectories.find((t) => t.modelId === 'naive_persistence');
    const points = chosenTrajectory ? chosenTrajectory.points : ensPoints;

    const lastPt = points[points.length - 1];
    const { scenarios, scenarioCalibration, keyZones, eventDictionary } = detectKeyZonesAndEventTree(
      features,
      points,
      horizonBars,
      split
    );
    const mtfCoordination = coordinateMultiTimeframe(
      points,
      scenarios,
      features.lastClose,
      timeframe,
      higherTimeframe,
      higherTimeframeCandles
    );
    const noEdgeGate = evaluateNoEdgeGate(walkForward, uncertainty);

    // Rev 2.1 strict 5-state status hierarchy:
    // DATA_NOT_READY -> INSUFFICIENT_EVIDENCE -> NO_EDGE -> PROVISIONAL -> VALID
    let status = FORECAST_STATUS.INSUFFICIENT_EVIDENCE;
    const hasSufficientStatEvidence =
      walkForward &&
      cleanCandles.length >= req.nStatMin &&
      walkForward.evaluatedWindows >= 30 &&
      walkForward.effectiveSampleSize >= 25.0 &&
      walkForward.conformalCalibration?.calibrationStatus === 'CALIBRATED_NORMALIZED';

    if (!hasSufficientStatEvidence) {
      status = FORECAST_STATUS.INSUFFICIENT_EVIDENCE;
    } else if (!noEdgeGate.hasEdge || uncertainty.oodStatus === OOD_STATUS.EXTREME) {
      status = FORECAST_STATUS.NO_EDGE;
    } else if (
      uncertainty.oodStatus === OOD_STATUS.ELEVATED ||
      !scenarioCalibration.calibrationPassed ||
      mtfCoordination.alignmentState === MTF_ALIGNMENT_STATE.STRUCTURAL_CONFLICT
    ) {
      status = FORECAST_STATUS.PROVISIONAL;
    } else {
      status = FORECAST_STATUS.VALID;
    }

    const summary = {
      terminalStep: lastPt.stepAhead,
      terminalQ10: lastPt.q10,
      terminalQ25: lastPt.q25,
      terminalQ50: lastPt.q50,
      terminalQ75: lastPt.q75,
      terminalQ90: lastPt.q90,
      medianPctChange: lastPt.pctChangeFromLast,
      corridorWidthPct: ((lastPt.q90 - lastPt.q10) / features.lastClose) * 100,
    };
    const stability = computeForecastStability(summary, features.lastClose, previousForecast);

    return {
      contractVersion: CONTRACT_VERSION,
      specVersion: SPEC_VERSION,
      engineVersion: ENGINE_VERSION,
      status,
      symbolCode,
      timeframe,
      horizonBars,
      renderMode,
      generatedAtUtcMs,
      anchorOpenTimeUtcMs: features.lastOpenMs,
      anchorClose: features.lastClose,
      regime: features.regime,
      calendarSpec: {
        calendarId: calendarSpec.calendarId,
        calendarVersion: calendarSpec.calendarVersion || CALENDAR_REGISTRY_VERSION,
        ianaTimezone: calendarSpec.ianaTimezone,
      },
      dataProvenance: {
        providerId,
        priceBasis,
        hasRealVolume: Boolean(features.hasRealVolume),
      },
      featuresSummary: {
        atr14: features.atr14,
        atrPct: features.atrPct * 100,
        ewmaSigmaPct: features.ewmaSigma * 100,
        rsi14: features.rsi14,
        realizedVolRatio: features.realizedVolRatio,
        driftZ: features.driftZ,
        hasRealVolume: Boolean(features.hasRealVolume),
      },
      readiness,
      remoteWorker: ForecastModelRegistry.resolveRemoteWorkerStatus(workerUrl),
      uncertainty,
      conformalCalibration,
      scenarioCalibration,
      noEdgeGate,
      keyZones,
      eventDictionary,
      mtfCoordination,
      stability,
      points,
      scenarios,
      representativePaths,
      analogDiagnostics: {
        status: analogRes.status,
        reason: analogRes.reason,
        jMax: analogRes.jMax,
        embargoGap: analogRes.embargoGap,
        matchedCount: analogRes.matchedCount,
        declusteredCount: analogRes.declusteredCount || 0,
        minSeparationBars: analogRes.minSeparationBars || 0,
        effectiveSampleWeight: analogRes.effectiveSampleWeight || 0,
        avgVolScale: analogRes.avgVolScale || 1,
        medianDistance: analogRes.medianDistance || 0,
      },
      modelContributions,
      modelTrajectories,
      selectedChartModelId: selection.selectedModelId,
      selectionMode: selection.selectionMode,
      selectionReason: selection.reason,
      turningPoints: Array.isArray(chosenTrajectory?.meta?.turningPoints) ? chosenTrajectory.meta.turningPoints : [],
      smcPoc: Number.isFinite(Number(chosenTrajectory?.meta?.pocPrice)) ? Number(chosenTrajectory.meta.pocPrice) : null,
      walkForward,
      summary,
      inputHash,
    };
  }

  /**
   * Merges optional Python/FastAPI worker results strictly verifying matching `inputHash`,
   * finite non-NaN monotonic quantiles, and expected horizon length (`T16`).
   */
  static applyRemoteWorkerResponse(baseResult, workerWrap, requestedModelId = 'AUTO') {
    if (!baseResult || !workerWrap) return baseResult;
    const data = workerWrap.data;
    if (!data) {
      return {
        ...baseResult,
        remoteWorker: {
          status: workerWrap.status || baseResult.remoteWorker?.status,
          configured: Boolean(workerWrap.configured),
          url: String(workerWrap.url || baseResult.remoteWorker?.url || ''),
          error: workerWrap.error || '',
        },
      };
    }

    if (data.inputHash && baseResult.inputHash && data.inputHash !== baseResult.inputHash) {
      return {
        ...baseResult,
        remoteWorker: {
          status: 'ERROR',
          configured: Boolean(workerWrap.configured),
          url: String(workerWrap.url || baseResult.remoteWorker?.url || ''),
          error: `WORKER_INPUT_HASH_MISMATCH: expected ${baseResult.inputHash.slice(0, 12)}, got ${String(data.inputHash).slice(0, 12)}`,
        },
      };
    }

    if (!Array.isArray(data.modelTrajectories)) {
      return {
        ...baseResult,
        remoteWorker: {
          status: workerWrap.status || baseResult.remoteWorker?.status,
          configured: Boolean(workerWrap.configured),
          url: String(workerWrap.url || baseResult.remoteWorker?.url || ''),
          error: workerWrap.error || '',
        },
      };
    }

    const updatedRemote = {
      status: workerWrap.status || baseResult.remoteWorker?.status,
      configured: Boolean(workerWrap.configured),
      url: String(workerWrap.url || baseResult.remoteWorker?.url || ''),
      error: workerWrap.error || '',
    };

    const mergedTrajs = [...(baseResult.modelTrajectories || [])];
    for (const wt of data.modelTrajectories) {
      if (!wt || !wt.modelId) continue;
      let sanitized = wt;
      if (wt.status === MODEL_EXECUTION_STATUS.SUCCESS) {
        const pts = wt.points;
        const okPts =
          Array.isArray(pts) &&
          pts.length === baseResult.horizonBars &&
          pts.every(
            (p) =>
              p &&
              Number.isFinite(p.q10) &&
              Number.isFinite(p.q25) &&
              Number.isFinite(p.q50) &&
              Number.isFinite(p.q75) &&
              Number.isFinite(p.q90) &&
              p.q10 > 0 &&
              p.q10 <= p.q25 &&
              p.q25 <= p.q50 &&
              p.q50 <= p.q75 &&
              p.q75 <= p.q90
          );
        if (!okPts) {
          sanitized = {
            ...wt,
            status: MODEL_EXECUTION_STATUS.FAILED,
            reason: 'Worker emitted non-finite or non-monotonic quantiles',
            points: [],
          };
        }
      }
      const idx = mergedTrajs.findIndex((t) => t.modelId === sanitized.modelId);
      if (idx >= 0) mergedTrajs[idx] = sanitized;
      else mergedTrajs.push(sanitized);
    }

    const mergedWf = baseResult.walkForward
      ? {
          ...baseResult.walkForward,
          modelBenchmarks: [...(baseResult.walkForward.modelBenchmarks || [])],
        }
      : null;
    if (mergedWf && Array.isArray(data.modelBenchmarks)) {
      for (const wb of data.modelBenchmarks) {
        if (!wb || !wb.modelId) continue;
        const idx = mergedWf.modelBenchmarks.findIndex((b) => b.modelId === wb.modelId);
        if (idx >= 0) mergedWf.modelBenchmarks[idx] = wb;
        else mergedWf.modelBenchmarks.push(wb);
      }
    }

    const selection = selectOosChartWinner(mergedWf, mergedTrajs, requestedModelId);
    const chosen = mergedTrajs.find(
      (t) =>
        t.modelId === selection.selectedModelId &&
        t.status === MODEL_EXECUTION_STATUS.SUCCESS &&
        Array.isArray(t.points) &&
        t.points.length === baseResult.horizonBars
    );

    const nextPoints = chosen ? chosen.points : baseResult.points;
    const lastPt = nextPoints[nextPoints.length - 1];
    const nextSummary = lastPt
      ? {
          ...baseResult.summary,
          terminalQ10: lastPt.q10,
          terminalQ25: lastPt.q25,
          terminalQ50: lastPt.q50,
          terminalQ75: lastPt.q75,
          terminalQ90: lastPt.q90,
          medianPctChange: lastPt.pctChangeFromLast,
          corridorWidthPct: ((lastPt.q90 - lastPt.q10) / baseResult.anchorClose) * 100,
        }
      : baseResult.summary;

    return {
      ...baseResult,
      remoteWorker: updatedRemote,
      modelTrajectories: mergedTrajs,
      walkForward: mergedWf,
      selectedChartModelId: selection.selectedModelId,
      selectionMode: selection.selectionMode,
      selectionReason: selection.reason,
      points: nextPoints,
      summary: nextSummary,
    };
  }
}

/**
 * Canonical wrapper function for forecasting future price quantiles.
 */
export function forecast(candles, options = {}) {
  const steps = typeof options === 'number'
    ? options
    : Number(options?.steps || options?.count || options?.horizonBars || 10);
  const tf = typeof options === 'number'
    ? (arguments[2] || 'M15')
    : (options?.timeframe || options?.tf || 'M15');

  const opts = {
    horizonBars: Math.max(10, steps),
    timeframe: tf,
    renderMode: (typeof options === 'object' && options?.renderMode) || RENDER_MODES.FAN_CHART,
    symbolCode: (typeof options === 'object' && options?.symbolCode) || 'SAMPLE',
    providerId: (typeof options === 'object' && options?.providerId) || 'internal',
    workerUrl: (typeof options === 'object' && options?.workerUrl) || '',
    skipWalkForward: typeof options === 'object' ? options?.skipWalkForward : false,
    skipBootstrap: typeof options === 'object' ? options?.skipBootstrap : false,
    enforceCalendarGaps: typeof options === 'object' ? options?.enforceCalendarGaps : false,
    minBars: typeof options === 'object' ? options?.minBars : undefined,
  };

  const projectResult = ForecastEngine.project(candles, opts);
  const pts = Array.isArray(projectResult?.points) ? projectResult.points.slice(0, steps) : [];
  const closes = pts.map((p) => p.q50);

  return {
    ...projectResult,
    points: pts,
    closes,
  };
}
