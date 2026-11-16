import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(
      'export async function resolve(specifier, context, nextResolve) { return nextResolve(specifier.replace(/\\?v=[0-9.]+$/, ""), context); }'
    )
);

const memStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => memStore.set(k, String(v)),
  removeItem: (k) => memStore.delete(k),
  clear: () => memStore.clear(),
};

const {
  CONTRACT_VERSION,
  SPEC_VERSION,
  FORECAST_STATUS,
  SCENARIO_STATUS,
  SCENARIO_IDS,
  MODEL_EXECUTION_STATUS,
  REMOTE_WORKER_STATUS,
  RENDER_MODES,
  OOD_STATUS,
  NO_EDGE_GATE_STATE,
  MTF_ALIGNMENT_STATE,
  LIFECYCLE_STATUS,
  EVALUATION_OUTCOME,
  SELECTION_MODE,
  computeHorizonRequirements,
  containsForbiddenTradingTerms,
  sha256Hex,
} = await import('../host_subdomain/assets/js/forecast/forecastContract.js');
const { ForecastModelRegistry, REMOTE_DL_WORKER_SPEC } = await import(
  '../host_subdomain/assets/js/forecast/modelRegistry.js'
);
const { ForecastLedger } = await import('../host_subdomain/assets/js/forecast/forecastLedger.js');
const { ForecastEngine } = await import('../host_subdomain/assets/js/forecast/forecastEngine.js');
const { TechnicalIndicators } = await import('../host_subdomain/assets/js/algorithms/technicalIndicators.js');

function buildSyntheticCandles(count = 500, timeframe = 'M15', drift = 0.0008) {
  const stepMs = timeframe === 'D1' ? 86_400_000 : timeframe === 'H1' ? 3_600_000 : 900_000;
  const start = Date.parse('2025-01-06T00:00:00Z');
  const bars = [];
  let prevClose = 92.5;
  for (let i = 0; i < count; i++) {
    const ret = drift + 0.0012 * Math.sin(i * 0.23) + 0.0006 * Math.cos(i * 0.61);
    const open = prevClose;
    const close = Number((open * Math.exp(ret)).toFixed(4));
    const spread = Math.max(0.08, Math.abs(close - open) * 0.65);
    const high = Number((Math.max(open, close) + spread * 0.45).toFixed(4));
    const low = Number((Math.min(open, close) - spread * 0.4).toFixed(4));
    bars.push({
      open_time_utc_ms: start + i * stepMs,
      open,
      high,
      low,
      close,
      volume: 650 + (i % 17) * 35,
    });
    prevClose = close;
  }
  return bars;
}

test('PRED-01: V2.1 Quantile monotonicity, h>=10 horizon, and calendar advancement across M15/H1/D1', () => {
  for (const tf of ['M15', 'H1', 'D1']) {
    const req = computeHorizonRequirements(30);
    const candles = buildSyntheticCandles(req.nOpMin + 40, tf);
    const anchor = candles[candles.length - 1].open_time_utc_ms + (tf === 'D1' ? 86_400_000 : tf === 'H1' ? 3_600_000 : 900_000) + 60_000;
    const res = ForecastEngine.project(candles, {
      symbolCode: 'SPOTBRENT',
      timeframe: tf,
      horizonBars: 30,
      renderMode: RENDER_MODES.FAN_CHART,
      anchorNowMs: anchor,
    });
    assert.equal(res.contractVersion, CONTRACT_VERSION);
    assert.equal(res.specVersion, SPEC_VERSION);
    assert.equal(res.points.length, 30);
    assert.ok([
      FORECAST_STATUS.VALID,
      FORECAST_STATUS.PROVISIONAL,
      FORECAST_STATUS.NO_EDGE,
      FORECAST_STATUS.INSUFFICIENT_EVIDENCE,
    ].includes(res.status));

    let prevTs = candles[candles.length - 1].open_time_utc_ms;
    for (let i = 0; i < res.points.length; i++) {
      const p = res.points[i];
      assert.equal(p.stepAhead, i + 1);
      assert.ok(p.openTimeUtcMs > prevTs, 'Timestamps must strictly advance');
      assert.ok(p.q10 > 0 && p.q10 <= p.q25 && p.q25 <= p.q50 && p.q50 <= p.q75 && p.q75 <= p.q90);
      assert.equal(p.volume, undefined, 'No fabricated projected volume');
      prevTs = p.openTimeUtcMs;
    }

    const estimable = res.scenarios.filter((s) => s.status === SCENARIO_STATUS.ESTIMABLE);
    if (estimable.length > 0) {
      const probSum = estimable.reduce((acc, s) => acc + s.probability, 0);
      assert.ok(Math.abs(probSum - 1.0) <= 0.005, `Estimable scenario probabilities must sum to 1.0 (got ${probSum})`);
    }
    assert.equal(containsForbiddenTradingTerms(res.scenarios), false);
  }
});

test('PRED-02: DataReadinessGate blocks insufficient history (< N_op_min)', () => {
  const shortBars = buildSyntheticCandles(48, 'M15');
  const res = ForecastEngine.project(shortBars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 30,
    anchorNowMs: shortBars[shortBars.length - 1].open_time_utc_ms + 900_000,
  });
  assert.equal(res.status, FORECAST_STATUS.DATA_NOT_READY);
  assert.equal(res.points.length, 0);
  assert.equal(res.readiness.ready, false);
});

test('PRED-03: Nested Walk-Forward computes WIS/rMAE/MASE metrics vs Log-Normal Naive & honest DL worker state', () => {
  const candles = buildSyntheticCandles(880, 'H1');
  const anchor = candles[candles.length - 1].open_time_utc_ms + 3_600_000;
  const res = ForecastEngine.project(candles, {
    symbolCode: 'XAUUSD',
    timeframe: 'H1',
    horizonBars: 20,
    anchorNowMs: anchor,
  });
  assert.ok(res.walkForward);
  assert.ok(res.walkForward.evaluatedWindows >= 30);
  assert.ok(res.walkForward.wisNaiveDistributional > 0);
  assert.ok(res.walkForward.mase > 0);
  assert.ok(res.walkForward.modelBenchmarks.length >= 4);
  assert.ok(res.walkForward.effectiveSampleSize > 0);
  assert.equal(res.remoteWorker.status, REMOTE_WORKER_STATUS.LOCAL_STATISTICAL_ONLY);
  assert.equal(REMOTE_DL_WORKER_SPEC.supportedModels.some((m) => /TimesFM 3\.0/i.test(m)), false);
  assert.ok(REMOTE_DL_WORKER_SPEC.supportedModels.some((m) => /Chronos-2/i.test(m)));

  const unconfiguredRes = ForecastEngine.project(candles, {
    symbolCode: 'XAUUSD',
    timeframe: 'H1',
    horizonBars: 20,
    anchorNowMs: anchor,
    workerUrl: 'https://worker.invalid/infer',
  });
  assert.equal(unconfiguredRes.remoteWorker.status, REMOTE_WORKER_STATUS.UNCONFIGURED);
});

test('PRED-04: Pluggable ModelRegistry extensibility & SHA-256 hash-chain ledger tamper detection', () => {
  const registry = new ForecastModelRegistry();
  registry.register({
    id: 'custom_mean_reversion_test',
    name: 'Custom Mean Reversion Plugin',
    family: 'ECONOMETRIC',
    description: 'Extensible external plugin verification',
    defaultEnabled: true,
    defaultWeight: 0.25,
    defaultParams: { decay: 0.85 },
    predict(features, horizon, params) {
      const dec = Number(params.decay || 0.85);
      return {
        modelId: 'custom_mean_reversion_test',
        meanReturns: Array.from({ length: horizon }, (_, h) => -features.recentMeanReturn * 0.1 * Math.pow(dec, h)),
        sigmas: Array.from({ length: horizon }, () => features.ewmaSigma),
      };
    },
  });

  const cfgJson = registry.serializeConfig();
  const rehydrated = new ForecastModelRegistry();
  rehydrated.register(registry.getPlugin('custom_mean_reversion_test'));
  rehydrated.applyConfig(cfgJson);
  assert.ok(rehydrated.getPlugin('custom_mean_reversion_test'));

  const candles = buildSyntheticCandles(200, 'M15');
  const res = ForecastEngine.project(candles, {
    symbolCode: 'NVDA',
    timeframe: 'M15',
    horizonBars: 15,
    registry: rehydrated,
    skipWalkForward: true,
    anchorNowMs: candles[candles.length - 1].open_time_utc_ms + 900_000,
  });
  assert.ok(res.modelContributions.some((c) => c.modelId === 'custom_mean_reversion_test'));

  memStore.clear();
  const ledger = new ForecastLedger('test_ledger_v2');
  const e1 = ledger.appendFromForecast(res);
  const e2 = ledger.appendFromForecast(res);
  assert.ok(e1 && e2);
  assert.equal(e2.prevForecastHash, e1.forecastHash);
  assert.equal(sha256Hex('abc').length, 64);

  const okVerify = ledger.verifyChain();
  assert.equal(okVerify.valid, true);
  assert.equal(okVerify.totalEntries, 2);

  const tampered = ledger.loadEntries();
  tampered[0].terminalMedian += 1.25;
  const badVerify = ledger.verifyChain(tampered);
  assert.equal(badVerify.valid, false);
  assert.equal(badVerify.brokenIndex, 0);
  assert.ok(badVerify.error.includes('SHA-256 Hash Chain Integrity Mismatch'));
});

test('PRED-05: Aleatoric vs Epistemic uncertainty decomposition and OOD extreme spike multiplier', () => {
  const normalCandles = buildSyntheticCandles(260, 'H1');
  const anchor = normalCandles[normalCandles.length - 1].open_time_utc_ms + 3_600_000;
  const normalRes = ForecastEngine.project(normalCandles, { symbolCode: 'XAUUSD', timeframe: 'H1', horizonBars: 20, anchorNowMs: anchor });
  assert.ok(normalRes.uncertainty);
  assert.ok(Math.abs(normalRes.uncertainty.aleatoricShare + normalRes.uncertainty.epistemicShare - 1.0) <= 0.002);
  assert.equal(normalRes.uncertainty.oodStatus, OOD_STATUS.IN_DISTRIBUTION);

  const shockCandles = buildSyntheticCandles(260, 'H1');
  const last = shockCandles[shockCandles.length - 1];
  shockCandles[shockCandles.length - 1] = {
    ...last,
    high: Number((last.open * 1.15).toFixed(4)),
    close: Number((last.open * 1.12).toFixed(4)),
  };
  const oodRes = ForecastEngine.project(shockCandles, { symbolCode: 'XAUUSD', timeframe: 'H1', horizonBars: 20, anchorNowMs: anchor });
  assert.equal(oodRes.uncertainty.oodStatus, OOD_STATUS.EXTREME);
  assert.ok(oodRes.uncertainty.spreadMultiplierApplied > 1.2);
  assert.equal(oodRes.noEdgeGate.hasEdge, false);
  assert.equal(oodRes.noEdgeGate.gateState, NO_EDGE_GATE_STATE.NO_EDGE_DETECTED);
});

test('PRED-06: V2.1 3-Scenario Logistic Calibration (NOT_ESTIMABLE safe), Key Zones, & Sensitivity Grid', () => {
  const candles = buildSyntheticCandles(500, 'H1', 0.0002);
  const res = ForecastEngine.project(candles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'H1',
    horizonBars: 20,
    anchorNowMs: candles[candles.length - 1].open_time_utc_ms + 3_600_000,
  });
  assert.equal(res.scenarios.length, 3);
  assert.deepEqual(
    res.scenarios.map((s) => s.id),
    [SCENARIO_IDS.BULLISH_EXPANSION, SCENARIO_IDS.RANGE_CONTAINMENT, SCENARIO_IDS.BEARISH_CONTRACTION]
  );
  for (const s of res.scenarios) {
    assert.ok([SCENARIO_STATUS.ESTIMABLE, SCENARIO_STATUS.NOT_ESTIMABLE].includes(s.status));
    if (s.status === SCENARIO_STATUS.NOT_ESTIMABLE) {
      assert.equal(s.probability, null);
    } else {
      assert.ok(s.probability >= 0 && s.probability <= 1);
    }
  }
  assert.equal(res.keyZones.length, 2);
  assert.ok(res.keyZones[0].expectedBarsToReachCensored > 0);
  assert.equal(res.eventDictionary.sensitivityGrid.length, 9);
  assert.ok(res.noEdgeGate);
});

test('PRED-07: MTF Coordination preserves independent forecast and detects conflict separately', () => {
  const ltf = buildSyntheticCandles(260, 'H1');
  const anchor = ltf[ltf.length - 1].open_time_utc_ms + 3_600_000;
  const htf = buildSyntheticCandles(60, 'D1').map((b, idx, arr) => {
    if (idx >= arr.length - 10) {
      return { ...b, close: Number((b.close * 0.85).toFixed(4)), low: Number((b.low * 0.82).toFixed(4)) };
    }
    return b;
  });

  const withoutHtf = ForecastEngine.project(ltf, { symbolCode: 'BTCUSD', timeframe: 'H1', horizonBars: 20, anchorNowMs: anchor });
  const withHtf = ForecastEngine.project(ltf, {
    symbolCode: 'BTCUSD',
    timeframe: 'H1',
    horizonBars: 20,
    anchorNowMs: anchor,
    higherTimeframe: 'D1',
    higherTimeframeCandles: htf,
  });

  assert.equal(withoutHtf.mtfCoordination.alignmentState, MTF_ALIGNMENT_STATE.SINGLE_TIMEFRAME);
  assert.equal(withHtf.summary.terminalQ50, withoutHtf.summary.terminalQ50, 'Independent forecast must remain untouched');
  assert.ok(
    [MTF_ALIGNMENT_STATE.STRUCTURAL_CONFLICT, MTF_ALIGNMENT_STATE.NATURAL_HORIZON_DIVERGENCE].includes(
      withHtf.mtfCoordination.alignmentState
    )
  );
  assert.equal(withHtf.mtfCoordination.coordinatedPoints.length, 20);
});

test('PRED-08: Append-only lifecycle log evaluates matured forecasts & preserves AMBIGUOUS inside-bar hits', () => {
  memStore.clear();
  const ledger = new ForecastLedger('test_ledger_lc');
  const candles = buildSyntheticCandles(200, 'M15');
  const slice = candles.slice(0, 170);
  const baseRes = ForecastEngine.project(slice, {
    symbolCode: 'EURUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: slice[slice.length - 1].open_time_utc_ms + 900_000,
  });
  const entry = ledger.appendFromForecast(baseRes);
  assert.ok(entry);

  const futureCandles = slice.concat(
    Array.from({ length: 12 }, (_, idx) => {
      const ts = baseRes.anchorOpenTimeUtcMs + (idx + 1) * 900_000;
      if (idx === 2) {
        return {
          open_time_utc_ms: ts,
          open: baseRes.anchorClose,
          high: Math.max(baseRes.summary.terminalQ90, baseRes.anchorClose) * 1.03,
          low: Math.min(baseRes.summary.terminalQ10, baseRes.anchorClose) * 0.97,
          close: baseRes.anchorClose,
        };
      }
      return {
        open_time_utc_ms: ts,
        open: baseRes.anchorClose,
        high: baseRes.anchorClose * 1.002,
        low: baseRes.anchorClose * 0.998,
        close: baseRes.anchorClose,
      };
    })
  );

  const appended = ledger.evaluateMaturedForecasts(futureCandles, 'EURUSD', 'M15');
  assert.ok(appended.length >= 2);
  assert.ok(appended.some((ev) => ev.lifecycleStatus === LIFECYCLE_STATUS.MATURED));
  assert.ok(appended.some((ev) => ev.evaluationOutcome === EVALUATION_OUTCOME.AMBIGUOUS));
  assert.equal(ledger.verifyLifecycleChain().valid, true);
  assert.equal(ledger.loadEntries().length, 1, 'Original run entry must never be mutated/deleted');
});

test('PRED-09: EmpiricalAnalogEngine causal analogs, illustrative medoids, and zero fabricated volume/wicks', () => {
  const candles = buildSyntheticCandles(360, 'M15', 0.0004);
  const res = ForecastEngine.project(candles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    horizonBars: 20,
    selectedModelId: 'empirical_analogs',
    anchorNowMs: candles[candles.length - 1].open_time_utc_ms + 900_000,
  });

  assert.equal(res.selectedChartModelId, 'empirical_analogs');
  assert.equal(res.smcScenarios, undefined);
  assert.equal(res.bayesianLiveReport, undefined);
  assert.ok(Array.isArray(res.representativePaths));
  for (const rp of res.representativePaths) {
    assert.equal(rp.isIllustrativeOnly, true);
  }
  for (const p of res.points) {
    assert.equal(p.volume, undefined);
    assert.equal(p.rejectionWick, undefined);
    assert.ok(p.q10 <= p.q25 && p.q25 <= p.q50 && p.q50 <= p.q75 && p.q75 <= p.q90);
  }
});

test('PRED-10: Horizon Prefix Invariance (+10 vs +20 vs +60) on Quantiles and TechnicalIndicators adapter', () => {
  const candles = buildSyntheticCandles(560, 'M15');
  const anchor = candles[candles.length - 1].open_time_utc_ms + 900_000;
  const res10 = ForecastEngine.project(candles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: anchor,
    skipWalkForward: true,
    selectedModelId: 'native_arima_diff',
  });
  const res20 = ForecastEngine.project(candles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    horizonBars: 20,
    anchorNowMs: anchor,
    skipWalkForward: true,
    selectedModelId: 'native_arima_diff',
  });
  const res60 = ForecastEngine.project(candles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    horizonBars: 60,
    anchorNowMs: anchor,
    skipWalkForward: true,
    selectedModelId: 'native_arima_diff',
  });

  for (let i = 0; i < 10; i++) {
    assert.ok(Math.abs(res10.points[i].q50 - res20.points[i].q50) < 1e-9);
    assert.ok(Math.abs(res10.points[i].q50 - res60.points[i].q50) < 1e-9);
    assert.ok(Math.abs(res10.points[i].q10 - res60.points[i].q10) < 1e-9);
    assert.ok(Math.abs(res10.points[i].q90 - res60.points[i].q90) < 1e-9);
  }
  for (let i = 0; i < 20; i++) {
    assert.ok(Math.abs(res20.points[i].q50 - res60.points[i].q50) < 1e-9);
  }

  const ti10 = TechnicalIndicators.computeFutureCandlestickProjection(candles, 'M15', 10);
  const ti30 = TechnicalIndicators.computeFutureCandlestickProjection(candles, 'M15', 30);
  const ti60 = TechnicalIndicators.computeFutureCandlestickProjection(candles, 'M15', 60);
  assert.equal(ti10.length, 10);
  assert.equal(ti30.length, 30);
  assert.equal(ti60.length, 60);
  for (let i = 0; i < 10; i++) {
    assert.ok(Math.abs(ti10[i].q50 - ti60[i].q50) < 1e-9);
    assert.ok(Math.abs(ti10[i].q10 - ti60[i].q10) < 1e-9);
    assert.ok(Math.abs(ti10[i].q90 - ti60[i].q90) < 1e-9);
  }
});

test('PRED-11: MTF Consistency M15 <-> H1 with independent forecast preservation', () => {
  const m15Bars = buildSyntheticCandles(480, 'M15');
  const h1Bars = [];
  for (let i = 0; i < m15Bars.length; i += 4) {
    const chunk = m15Bars.slice(i, i + 4);
    h1Bars.push({
      open_time_utc_ms: chunk[0].open_time_utc_ms,
      open: chunk[0].open,
      high: Math.max(...chunk.map((b) => b.high)),
      low: Math.min(...chunk.map((b) => b.low)),
      close: chunk[3].close,
      volume: chunk.reduce((s, b) => s + b.volume, 0),
    });
  }
  const anchor = m15Bars[m15Bars.length - 1].open_time_utc_ms + 900_000;
  const m15Res = ForecastEngine.project(m15Bars, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    horizonBars: 16,
    anchorNowMs: anchor,
    skipWalkForward: true,
  });
  const h1Res = ForecastEngine.project(m15Bars.slice(-260), {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    horizonBars: 16,
    anchorNowMs: anchor,
    skipWalkForward: true,
    higherTimeframe: 'H1',
    higherTimeframeCandles: h1Bars,
  });
  assert.equal(m15Res.points.length, 16);
  assert.ok(h1Res.mtfCoordination.ohlcConsistent);
  assert.equal(h1Res.mtfCoordination.coordinatedPoints.length, 16);
});

test('PRED-12: Strict Causal Anti-Leakage — mutating future bars after cutoff cannot alter history-only predictions', () => {
  const full = buildSyntheticCandles(240, 'M15');
  const cutoff = 200;
  const prefixA = full.slice(0, cutoff);
  const fullMutated = full.map((c, idx) =>
    idx >= cutoff ? { ...c, high: c.high * 2.5, low: c.low * 0.4, close: c.close * 1.9 } : c
  );
  const prefixB = fullMutated.slice(0, cutoff);
  const anchor = prefixA[prefixA.length - 1].open_time_utc_ms + 900_000;

  const resA = ForecastEngine.project(prefixA, { symbolCode: 'XAUUSD', timeframe: 'M15', horizonBars: 10, anchorNowMs: anchor });
  const resB = ForecastEngine.project(prefixB, { symbolCode: 'XAUUSD', timeframe: 'M15', horizonBars: 10, anchorNowMs: anchor });

  assert.equal(resA.inputHash, resB.inputHash);
  assert.equal(resA.modelTrajectories.length, resB.modelTrajectories.length);
  for (let m = 0; m < resA.modelTrajectories.length; m++) {
    const tA = resA.modelTrajectories[m];
    const tB = resB.modelTrajectories[m];
    assert.equal(tA.modelId, tB.modelId);
    assert.equal(tA.status, tB.status);
    for (let i = 0; i < tA.points.length; i++) {
      assert.ok(Math.abs(tA.points[i].q50 - tB.points[i].q50) < 1e-9);
    }
  }
});

test('PRED-13: Quantile-Attention TFT <90-bar Gate enforces SKIPPED_LOW_DATA without flat fallback', () => {
  const shortCandles = buildSyntheticCandles(70, 'H1');
  const shortRes = ForecastEngine.project(shortCandles, {
    symbolCode: 'EURUSD',
    timeframe: 'H1',
    horizonBars: 20,
    minBars: 60,
    anchorNowMs: shortCandles[shortCandles.length - 1].open_time_utc_ms + 3_600_000,
    skipWalkForward: true,
  });
  const tftShort = shortRes.modelTrajectories.find((t) => t.modelId === 'native_quantile_attention_approx');
  assert.ok(tftShort, 'TFT native approx model must appear in modelTrajectories');
  assert.equal(tftShort.status, MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA);
  assert.equal(tftShort.points.length, 0);
  assert.equal(tftShort.isApproximation, true);

  const longCandles = buildSyntheticCandles(240, 'H1');
  const longRes = ForecastEngine.project(longCandles, {
    symbolCode: 'EURUSD',
    timeframe: 'H1',
    horizonBars: 20,
    anchorNowMs: longCandles[longCandles.length - 1].open_time_utc_ms + 3_600_000,
  });
  const tftLong = longRes.modelTrajectories.find((t) => t.modelId === 'native_quantile_attention_approx');
  assert.ok(tftLong);
  assert.equal(tftLong.status, MODEL_EXECUTION_STATUS.SUCCESS);
  assert.equal(tftLong.points.length, 20);
});

test('PRED-14: Failing model returns explicit FAILED status with empty points and never breaks other models', () => {
  const registry = new ForecastModelRegistry();
  registry.register({
    id: 'broken_plugin_test',
    name: 'Broken Test Plugin',
    family: 'ECONOMETRIC',
    description: 'Throws intentionally to test non-masking',
    defaultEnabled: true,
    defaultWeight: 0.25,
    defaultParams: {},
    predict() {
      throw new Error('Intentional convergence failure');
    },
  });

  const candles = buildSyntheticCandles(200, 'H1');
  const res = ForecastEngine.project(candles, {
    symbolCode: 'NVDA',
    timeframe: 'H1',
    horizonBars: 15,
    registry,
    anchorNowMs: candles[candles.length - 1].open_time_utc_ms + 3_600_000,
  });
  const broken = res.modelTrajectories.find((t) => t.modelId === 'broken_plugin_test');
  assert.ok(broken);
  assert.equal(broken.status, MODEL_EXECUTION_STATUS.FAILED);
  assert.equal(broken.points.length, 0);
  assert.ok(broken.reason.includes('Intentional convergence failure'));
  assert.equal(res.points.length, 15);
});

test('PRED-15: Honest OOS Winner Gate emits NO_CLEAR_WINNER_BASELINE when random walk has no clear OOS winner', () => {
  const stepMs = 3_600_000;
  const start = Date.parse('2025-06-01T00:00:00Z');
  let seed = 42;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  const rwBars = [];
  let p = 100.0;
  for (let i = 0; i < 520; i++) {
    const ret = nextRand() * 0.008;
    const op = p;
    const cl = Number((op * Math.exp(ret)).toFixed(4));
    rwBars.push({
      open_time_utc_ms: start + i * stepMs,
      open: op,
      high: Number((Math.max(op, cl) * 1.002).toFixed(4)),
      low: Number((Math.min(op, cl) * 0.998).toFixed(4)),
      close: cl,
      volume: 500,
    });
    p = cl;
  }

  const res = ForecastEngine.project(rwBars, {
    symbolCode: 'RANDOMWALK',
    timeframe: 'H1',
    horizonBars: 10,
    selectedModelId: 'AUTO',
    anchorNowMs: rwBars[rwBars.length - 1].open_time_utc_ms + stepMs,
  });
  assert.equal(res.selectionMode, SELECTION_MODE.NO_CLEAR_WINNER_BASELINE);
  assert.equal(res.selectedChartModelId, 'naive_persistence');
});

test('PRED-16: All 4 new native models enforce prefix invariance across horizons 10 / 20 / 60', () => {
  const candles = buildSyntheticCandles(560, 'M15');
  const anchor = candles[candles.length - 1].open_time_utc_ms + 900_000;
  const modelIds = [
    'native_arima_diff',
    'native_prophet_decomp',
    'native_seq_recurrent_approx',
    'native_quantile_attention_approx',
  ];
  for (const modelId of modelIds) {
    const r10 = ForecastEngine.project(candles, {
      symbolCode: 'SPOTBRENT',
      timeframe: 'M15',
      horizonBars: 10,
      selectedModelId: modelId,
      skipWalkForward: true,
      anchorNowMs: anchor,
    });
    const r20 = ForecastEngine.project(candles, {
      symbolCode: 'SPOTBRENT',
      timeframe: 'M15',
      horizonBars: 20,
      selectedModelId: modelId,
      skipWalkForward: true,
      anchorNowMs: anchor,
    });
    const r60 = ForecastEngine.project(candles, {
      symbolCode: 'SPOTBRENT',
      timeframe: 'M15',
      horizonBars: 60,
      selectedModelId: modelId,
      skipWalkForward: true,
      anchorNowMs: anchor,
    });
    assert.equal(r10.selectedChartModelId, modelId);
    assert.equal(r10.points.length, 10);
    assert.equal(r20.points.length, 20);
    assert.equal(r60.points.length, 60);
    for (let i = 0; i < 10; i++) {
      assert.ok(Math.abs(r10.points[i].q50 - r60.points[i].q50) < 1e-8, `${modelId} bar ${i} q50 mismatch 10 vs 60`);
      assert.ok(Math.abs(r20.points[i].q50 - r60.points[i].q50) < 1e-8, `${modelId} bar ${i} q50 mismatch 20 vs 60`);
    }
  }
});
