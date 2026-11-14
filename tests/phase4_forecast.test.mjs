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
  REMOTE_WORKER_STATUS,
  RENDER_MODES,
  OOD_STATUS,
  NO_EDGE_GATE_STATE,
  MTF_ALIGNMENT_STATE,
  LIFECYCLE_STATUS,
  EVALUATION_OUTCOME,
  containsForbiddenTradingTerms,
  sha256Hex,
} = await import('../host_subdomain/assets/js/forecast/forecastContract.js');
const { ForecastModelRegistry, REMOTE_DL_WORKER_SPEC } = await import(
  '../host_subdomain/assets/js/forecast/modelRegistry.js'
);
const { ForecastLedger } = await import('../host_subdomain/assets/js/forecast/forecastLedger.js');
const { ForecastEngine } = await import('../host_subdomain/assets/js/forecast/forecastEngine.js');

function buildSyntheticCandles(count = 110, timeframe = 'M15') {
  const stepMs = timeframe === 'D1' ? 86_400_000 : timeframe === 'H1' ? 3_600_000 : 900_000;
  const start = Date.parse('2026-07-06T00:00:00Z');
  const bars = [];
  let prevClose = 92.5;
  for (let i = 0; i < count; i++) {
    const drift = 0.0014 + 0.0042 * Math.sin(i * 0.23) + 0.0018 * Math.cos(i * 0.61);
    const open = prevClose;
    const close = Number((open * Math.exp(drift)).toFixed(4));
    const spread = Math.max(0.18, Math.abs(close - open) * 1.45);
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

test('PRED-01: Quantile monotonicity, h>=10 horizon, and calendar advancement across M15/H1/D1', () => {
  for (const tf of ['M15', 'H1', 'D1']) {
    const candles = buildSyntheticCandles(96, tf);
    const res = ForecastEngine.project(candles, {
      symbolCode: 'SPOTBRENT',
      timeframe: tf,
      horizonBars: 30,
      renderMode: RENDER_MODES.HYBRID,
    });
    assert.equal(res.contractVersion, CONTRACT_VERSION);
    assert.equal(res.specVersion, SPEC_VERSION);
    assert.equal(res.points.length, 30);
    assert.ok(res.points.length >= 10);
    assert.ok([FORECAST_STATUS.VALID, FORECAST_STATUS.PROVISIONAL].includes(res.status));

    let prevTs = candles[candles.length - 1].open_time_utc_ms;
    for (let i = 0; i < res.points.length; i++) {
      const p = res.points[i];
      assert.equal(p.stepAhead, i + 1);
      assert.ok(p.openTimeUtcMs > prevTs, 'Timestamps must strictly advance');
      assert.ok(p.q10 > 0 && p.q10 <= p.q25 && p.q25 <= p.q50 && p.q50 <= p.q75 && p.q75 <= p.q90);
      assert.ok(p.low <= p.open && p.low <= p.close && p.high >= p.open && p.high >= p.close);
      prevTs = p.openTimeUtcMs;
    }

    const probSum = res.scenarios.reduce((acc, s) => acc + s.probability, 0);
    assert.ok(Math.abs(probSum - 1.0) <= 0.005, `Scenario probabilities must sum to 1.0 (got ${probSum})`);
    assert.equal(containsForbiddenTradingTerms(res.scenarios), false);
  }
});

test('PRED-02: DataReadinessGate blocks insufficient history (<24 bars)', () => {
  const shortBars = buildSyntheticCandles(15, 'M15');
  const res = ForecastEngine.project(shortBars, { symbolCode: 'XAUUSD', timeframe: 'M15', horizonBars: 30 });
  assert.equal(res.status, FORECAST_STATUS.DATA_NOT_READY);
  assert.equal(res.points.length, 0);
  assert.equal(res.readiness.ready, false);
});

test('PRED-03: Walk-Forward benchmark computes non-empty metrics vs NaivePersistence and honest DL worker state', () => {
  const candles = buildSyntheticCandles(120, 'H1');
  const res = ForecastEngine.project(candles, {
    symbolCode: 'XAUUSD',
    timeframe: 'H1',
    horizonBars: 20,
  });
  assert.ok(res.walkForward);
  assert.ok(res.walkForward.evaluatedWindows >= 4);
  assert.ok(res.walkForward.ensembleMetrics.maePct > 0);
  assert.ok(res.walkForward.naiveMetrics.maePct > 0);
  assert.ok(res.walkForward.modelBenchmarks.length >= 6);
  assert.ok(res.walkForward.effectiveSampleSize > 0);
  assert.equal(res.remoteWorker.status, REMOTE_WORKER_STATUS.LOCAL_STATISTICAL_ONLY);
  assert.equal(REMOTE_DL_WORKER_SPEC.supportedModels.some((m) => /TimesFM 3\.0/i.test(m)), false);
  assert.ok(REMOTE_DL_WORKER_SPEC.supportedModels.some((m) => /Chronos-2/i.test(m)));

  const unconfiguredRes = ForecastEngine.project(candles, {
    symbolCode: 'XAUUSD',
    timeframe: 'H1',
    horizonBars: 20,
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

  const candles = buildSyntheticCandles(80, 'M15');
  const res = ForecastEngine.project(candles, {
    symbolCode: 'NVDA',
    timeframe: 'M15',
    horizonBars: 15,
    registry: rehydrated,
    skipWalkForward: true,
  });
  assert.ok(res.modelContributions.some((c) => c.modelId === 'custom_mean_reversion_test'));

  memStore.clear();
  const ledger = new ForecastLedger('test_ledger_v1');
  const e1 = ledger.appendFromForecast(res);
  const e2 = ledger.appendFromForecast(res);
  assert.ok(e1 && e2);
  assert.equal(e2.prevForecastHash, e1.forecastHash);
  assert.equal(sha256Hex('abc').length, 64);

  const okVerify = ledger.verifyChain();
  assert.equal(okVerify.valid, true);
  assert.equal(okVerify.totalEntries, 2);

  // Tamper terminalMedian and assert tamper detection fires
  const tampered = ledger.loadEntries();
  tampered[0].terminalMedian += 1.25;
  const badVerify = ledger.verifyChain(tampered);
  assert.equal(badVerify.valid, false);
  assert.equal(badVerify.brokenIndex, 0);
});

test('PRED-05: v1.3.0 Aleatoric vs Epistemic uncertainty decomposition and OOD extreme spike multiplier', () => {
  const normalCandles = buildSyntheticCandles(90, 'H1');
  const normalRes = ForecastEngine.project(normalCandles, { symbolCode: 'XAUUSD', timeframe: 'H1', horizonBars: 20 });
  assert.ok(normalRes.uncertainty);
  assert.ok(Math.abs(normalRes.uncertainty.aleatoricShare + normalRes.uncertainty.epistemicShare - 1.0) <= 0.002);
  assert.equal(normalRes.uncertainty.oodStatus, OOD_STATUS.IN_DISTRIBUTION);

  // Inject an extreme 12% tail shock candle at end
  const shockCandles = buildSyntheticCandles(90, 'H1');
  const last = shockCandles[shockCandles.length - 1];
  shockCandles[shockCandles.length - 1] = {
    ...last,
    high: Number((last.open * 1.15).toFixed(4)),
    close: Number((last.open * 1.12).toFixed(4)),
  };
  const oodRes = ForecastEngine.project(shockCandles, { symbolCode: 'XAUUSD', timeframe: 'H1', horizonBars: 20 });
  assert.equal(oodRes.uncertainty.oodStatus, OOD_STATUS.EXTREME);
  assert.ok(oodRes.uncertainty.spreadMultiplierApplied > 1.2);
  assert.equal(oodRes.noEdgeGate.hasEdge, false);
  assert.equal(oodRes.noEdgeGate.gateState, NO_EDGE_GATE_STATE.NO_EDGE_DETECTED);
});

test('PRED-06: v1.3.0 5-leaf Event Tree exact sum=1.000, Key Zones, Sensitivity Grid & No-Edge separation', () => {
  const candles = buildSyntheticCandles(110, 'H1');
  const res = ForecastEngine.project(candles, { symbolCode: 'SPOTBRENT', timeframe: 'H1', horizonBars: 24 });
  assert.equal(res.scenarios.length, 5);
  const expectedIds = [
    'NO_ZONE_TOUCH_RANGE',
    'ZONE_REACTION_REJECTION',
    'PENETRATE_AND_RECLAIM',
    'CONFIRMED_BREAKOUT_BULL',
    'CONFIRMED_BREAKOUT_BEAR',
  ];
  assert.deepEqual(
    res.scenarios.map((s) => s.leafId),
    expectedIds
  );
  const sum = res.scenarios.reduce((acc, s) => acc + s.probability, 0);
  assert.ok(Math.abs(sum - 1.0) <= 0.002);
  assert.equal(res.keyZones.length, 2);
  assert.ok(res.keyZones[0].expectedBarsToReachCensored > 0);
  assert.ok(res.eventDictionary.sensitivityGrid.length === 9);
  assert.ok(res.noEdgeGate);
  assert.equal(res.scenarios.some((s) => s.leafId === 'NO_EDGE_DETECTED'), false);
});

test('PRED-07: v1.3.0 MTF Coordination preserves independent forecast and detects conflict separately', () => {
  const ltf = buildSyntheticCandles(96, 'H1');
  const htf = buildSyntheticCandles(60, 'D1').map((b, idx, arr) => {
    if (idx >= arr.length - 10) {
      return { ...b, close: Number((b.close * 0.85).toFixed(4)), low: Number((b.low * 0.82).toFixed(4)) };
    }
    return b;
  });

  const withoutHtf = ForecastEngine.project(ltf, { symbolCode: 'BTCUSD', timeframe: 'H1', horizonBars: 20 });
  const withHtf = ForecastEngine.project(ltf, {
    symbolCode: 'BTCUSD',
    timeframe: 'H1',
    horizonBars: 20,
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

test('PRED-08: v1.3.0 Append-only lifecycle log evaluates matured forecasts & preserves AMBIGUOUS inside-bar hits', () => {
  memStore.clear();
  const ledger = new ForecastLedger('test_ledger_lc');
  const candles = buildSyntheticCandles(80, 'M15');
  const baseRes = ForecastEngine.project(candles.slice(0, 60), {
    symbolCode: 'EURUSD',
    timeframe: 'M15',
    horizonBars: 10,
  });
  const entry = ledger.appendFromForecast(baseRes);
  assert.ok(entry);

  // Build subsequent bars hitting BOTH terminalQ10 and terminalQ90 inside a single bar => AMBIGUOUS
  const futureCandles = candles.slice(0, 60).concat(
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

