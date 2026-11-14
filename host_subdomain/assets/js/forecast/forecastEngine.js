import {
  CONTRACT_VERSION,
  FORECAST_STATUS,
  SPEC_VERSION,
  advanceFutureTimestamps,
  canonicalJson,
  clampHorizonBars,
  enforceMonotonicQuantiles,
  normalizeRenderMode,
  sha256Hex,
  validateDataReadiness,
} from './forecastContract.js?v=1.42.0';
import { extractForecastFeatures } from './featureExtractor.js?v=1.42.0';
import { defaultForecastRegistry, ForecastModelRegistry } from './modelRegistry.js?v=1.42.0';
import { evaluateWalkForward } from './walkForwardEvaluator.js?v=1.42.0';
import {
  computeForecastStability,
  computeOodAndUncertainty,
  coordinateMultiTimeframe,
  detectKeyZonesAndEventTree,
  evaluateNoEdgeGate,
} from './forecastV130Analyzer.js?v=1.42.0';

/**
 * Decoupled Core Phase 4 Future Price Projection Engine (`forecast-contract/v1` / spec `1.3.0`).
 * Combines DataReadinessGate, log-return FeatureExtractor, Pluggable Model Registry,
 * Aleatoric/Epistemic + OOD decomposition, 5-leaf mutually exclusive Event Tree,
 * Key Zones, MTF Coordination, No-Edge Gate, and purged Walk-Forward evaluation.
 */
export class ForecastEngine {
  static project(candles = [], options = {}) {
    const symbolCode = String(options.symbolCode || 'UNKNOWN').toUpperCase();
    const timeframe = String(options.timeframe || 'M15').toUpperCase();
    const horizonBars = clampHorizonBars(options.horizonBars ?? options.horizon ?? 30);
    const renderMode = normalizeRenderMode(options.renderMode);
    const registry = options.registry instanceof ForecastModelRegistry ? options.registry : defaultForecastRegistry;
    const workerUrl = String(options.workerUrl || '');
    const generatedAtUtcMs = Number(options.generatedAtUtcMs || Date.now());
    const minBars = Math.max(10, Number(options.minBars || 24));
    const higherTimeframe = String(options.higherTimeframe || '');
    const higherTimeframeCandles = Array.isArray(options.higherTimeframeCandles) ? options.higherTimeframeCandles : [];
    const previousForecast = options.previousForecast || null;

    const readiness = validateDataReadiness(candles, minBars);
    if (!readiness.ready) {
      return {
        contractVersion: CONTRACT_VERSION,
        specVersion: SPEC_VERSION,
        status: FORECAST_STATUS.DATA_NOT_READY,
        symbolCode,
        timeframe,
        horizonBars,
        renderMode,
        generatedAtUtcMs,
        readiness,
        remoteWorker: ForecastModelRegistry.resolveRemoteWorkerStatus(workerUrl),
        uncertainty: null,
        noEdgeGate: null,
        keyZones: [],
        eventDictionary: null,
        mtfCoordination: null,
        stability: null,
        points: [],
        scenarios: [],
        modelContributions: [],
        walkForward: {
          evaluatedWindows: 0,
          evalHorizon: 5,
          forecastStatus: FORECAST_STATUS.DATA_NOT_READY,
          acceptancePassed: false,
          acceptanceReason: readiness.issues[0] || 'Insufficient valid candles',
          ensembleMetrics: null,
          naiveMetrics: null,
          modelBenchmarks: [],
          maeImprovementVsNaivePct: 0,
          effectiveSampleSize: 0,
          ambiguousOutcomeCount: 0,
          ambiguousRatePct: 0,
        },
        summary: null,
        inputHash: sha256Hex(`${symbolCode}|${timeframe}|EMPTY`),
      };
    }

    const features = extractForecastFeatures(candles, 180);
    if (!features) {
      return this.project([], { ...options, minBars });
    }

    const activePlugins = registry.getEnabledPlugins();
    const effectivePlugins =
      activePlugins.length > 0
        ? activePlugins
        : [{ plugin: registry.getPlugin('naive_persistence'), config: { weight: 1, params: {} } }].filter(
            (x) => Boolean(x.plugin)
          );

    const walkForward =
      options.skipWalkForward === true
        ? null
        : evaluateWalkForward(candles, registry, {
            minTrainBars: Math.max(24, Math.min(36, Math.floor(candles.length * 0.55))),
            evalHorizon: Math.min(8, Math.max(3, Math.floor(horizonBars / 5))),
            maxWindows: Number(options.maxWalkForwardWindows || 10),
          });

    const benchById = new Map();
    if (walkForward?.modelBenchmarks) {
      for (const b of walkForward.modelBenchmarks) benchById.set(b.modelId, b);
    }

    const rawWeights = effectivePlugins.map(({ plugin, config }) => {
      const baseW = Math.max(0.01, Number(config.weight || 0.1));
      const b = benchById.get(plugin.id);
      if (b && Number.isFinite(b.mae) && b.mae > 0 && walkForward?.naiveMetrics?.mae > 0) {
        const skillFactor = Math.max(0.55, Math.min(1.45, walkForward.naiveMetrics.mae / b.mae));
        return baseW * (0.7 + 0.3 * skillFactor);
      }
      return baseW;
    });
    const wSum = rawWeights.reduce((a, b) => a + b, 0) || 1;

    const modelOutputs = [];
    const modelContributions = [];
    const ensMeanReturns = new Array(horizonBars).fill(0);
    const aleatoricVarSteps = new Array(horizonBars).fill(0);
    const epistemicDispSteps = new Array(horizonBars).fill(0);

    for (let idx = 0; idx < effectivePlugins.length; idx++) {
      const { plugin, config } = effectivePlugins[idx];
      const normW = rawWeights[idx] / wSum;
      const pred = plugin.predict(features, horizonBars, config.params || {});
      modelOutputs.push({ plugin, normW, pred });

      let cumMean = 0;
      for (let h = 0; h < horizonBars; h++) {
        const mr = Number(pred.meanReturns[h] || 0);
        const sg = Math.max(1e-5, Number(pred.sigmas[h] || features.ewmaSigma));
        cumMean += mr;
        ensMeanReturns[h] += normW * mr;
        aleatoricVarSteps[h] += normW * (sg * sg);
      }

      const terminalPrice = features.lastClose * Math.exp(cumMean);
      modelContributions.push({
        modelId: plugin.id,
        modelName: plugin.name,
        family: plugin.family,
        weight: Number(normW.toFixed(4)),
        terminalPrice,
        terminalPctChange: ((terminalPrice - features.lastClose) / features.lastClose) * 100,
        meta: pred.meta || {},
      });
    }

    let totalAleatoricCumVar = 0;
    let totalEpistemicDispVar = 0;
    for (let h = 0; h < horizonBars; h++) {
      let modelDisagreementVar = 0;
      for (const m of modelOutputs) {
        const diff = Number(m.pred.meanReturns[h] || 0) - ensMeanReturns[h];
        modelDisagreementVar += m.normW * diff * diff;
      }
      epistemicDispSteps[h] = modelDisagreementVar;
      totalAleatoricCumVar += aleatoricVarSteps[h];
      totalEpistemicDispVar += modelDisagreementVar;
    }

    const uncertainty = computeOodAndUncertainty(
      features,
      totalAleatoricCumVar,
      totalEpistemicDispVar,
      walkForward?.effectiveSampleSize
    );

    const futureTimestamps = advanceFutureTimestamps(features.lastOpenMs, timeframe, horizonBars, symbolCode);
    const points = [];
    let cumLogRet = 0;
    let cumVar = 0;
    let prevSynthClose = features.lastClose;
    const epiPerStep = uncertainty.epistemicCumVar / Math.max(1, horizonBars);

    for (let h = 0; h < horizonBars; h++) {
      cumLogRet += ensMeanReturns[h];
      cumVar += aleatoricVarSteps[h] + epistemicDispSteps[h] + epiPerStep * 0.35;
      const cumSigma = Math.sqrt(cumVar) * (1 + 0.008 * h) * uncertainty.spreadMultiplierApplied;

      const q = enforceMonotonicQuantiles(
        {
          q10: features.lastClose * Math.exp(cumLogRet - 1.28155 * cumSigma),
          q25: features.lastClose * Math.exp(cumLogRet - 0.67449 * cumSigma),
          q50: features.lastClose * Math.exp(cumLogRet),
          q75: features.lastClose * Math.exp(cumLogRet + 0.67449 * cumSigma),
          q90: features.lastClose * Math.exp(cumLogRet + 1.28155 * cumSigma),
        },
        features.lastClose * 0.02
      );

      const stepSigma = Math.sqrt(aleatoricVarSteps[h] + epistemicDispSteps[h]);
      const microCycle = Math.sin((h + 1) * 0.92 + (features.barCount % 5)) * stepSigma * features.lastClose * 0.35;
      const openP = prevSynthClose;
      const targetClose = Math.max(q.q25, Math.min(q.q75, q.q50 + microCycle));
      const minBody = Math.max(features.atr14 * 0.16, features.lastClose * stepSigma * 0.25);
      const rawBody = Math.abs(targetClose - openP);
      const closeP = rawBody < minBody ? (targetClose >= openP ? openP + minBody : openP - minBody) : targetClose;
      const effRange = Math.max(Math.abs(closeP - openP) / features.avgBodyRatio, features.atr14 * 0.58);
      const upWick = effRange * features.avgUpperWickRatio * (0.85 + 0.25 * Math.abs(Math.cos((h + 1) * 0.8)));
      const dnWick = effRange * features.avgLowerWickRatio * (0.85 + 0.25 * Math.abs(Math.sin((h + 1) * 1.1)));
      const highP = Math.max(openP, closeP) + upWick;
      const lowP = Math.max(features.lastClose * 0.02, Math.min(openP, closeP) - dnWick);
      prevSynthClose = closeP;

      points.push({
        stepAhead: h + 1,
        openTimeUtcMs: futureTimestamps[h],
        open: openP,
        high: highP,
        low: lowP,
        close: closeP,
        q10: q.q10,
        q25: q.q25,
        q50: q.q50,
        q75: q.q75,
        q90: q.q90,
        upperBand: q.q90,
        lowerBand: q.q10,
        pctChangeFromLast: ((q.q50 - features.lastClose) / features.lastClose) * 100,
      });
    }

    const lastPt = points[points.length - 1];
    const { scenarios, keyZones, eventDictionary } = detectKeyZonesAndEventTree(features, points, horizonBars);
    const mtfCoordination = coordinateMultiTimeframe(
      points,
      scenarios,
      features.lastClose,
      timeframe,
      higherTimeframe,
      higherTimeframeCandles
    );
    const noEdgeGate = evaluateNoEdgeGate(walkForward, uncertainty);

    const status = walkForward ? walkForward.forecastStatus : FORECAST_STATUS.PROVISIONAL;
    const recentClosesSignature = features.candles.slice(-20).map((c) => Number(c.close.toFixed(6)));
    const inputHash = sha256Hex(
      canonicalJson({
        symbolCode,
        timeframe,
        horizonBars,
        lastOpenMs: features.lastOpenMs,
        recentClosesSignature,
        plugins: registry.serializeConfig(),
      })
    );

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
      status,
      symbolCode,
      timeframe,
      horizonBars,
      renderMode,
      generatedAtUtcMs,
      anchorOpenTimeUtcMs: features.lastOpenMs,
      anchorClose: features.lastClose,
      regime: features.regime,
      featuresSummary: {
        atr14: features.atr14,
        atrPct: features.atrPct * 100,
        ewmaSigmaPct: features.ewmaSigma * 100,
        rsi14: features.rsi14,
        realizedVolRatio: features.realizedVolRatio,
        driftZ: features.driftZ,
      },
      readiness,
      remoteWorker: ForecastModelRegistry.resolveRemoteWorkerStatus(workerUrl),
      uncertainty,
      noEdgeGate,
      keyZones,
      eventDictionary,
      mtfCoordination,
      stability,
      points,
      scenarios,
      modelContributions,
      walkForward,
      summary,
      inputHash,
    };
  }
}

