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
const { TechnicalIndicators } = await import('../host_subdomain/assets/js/algorithms/technicalIndicators.js');

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

test('PRED-09: SMCPredictionEngine Historical Analogs, K-Medoids 3-Scenario Clustering, ATR Wave Geometry & Bayesian Live Re-Anchoring', () => {
  const candles = buildSyntheticCandles(150, 'M15');
  const res = ForecastEngine.project(candles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    horizonBars: 20,
  });

  assert.equal(res.smcScenarios.length, 3, 'Must produce 3 clustered K-Medoids scenarios (SCENARIO_A, B, C)');
  const probSum = res.smcScenarios.reduce((s, sc) => s + sc.probability, 0);
  assert.ok(Math.abs(probSum - 1.0) <= 0.03, `Scenario probabilities must sum to ~1.0, got ${probSum}`);
  assert.ok(res.bayesianLiveReport, 'Bayesian live verification report must be present');
  assert.ok(res.bayesianLiveReport.accuracyScoreLastStep >= 0 && res.bayesianLiveReport.accuracyScoreLastStep <= 100);

  // Verify non-flatlining ATR-calibrated candle bodies and non-linear wave structure
  let maxConsecutiveSameColor = 0;
  let curRun = 0;
  let lastSign = 0;
  for (let i = 0; i < res.points.length; i++) {
    const p = res.points[i];
    const body = Math.abs(p.close - p.open);
    assert.ok(body >= res.featuresSummary.atr14 * 0.14, `Future candle ${i + 1} body must not flatline`);
    assert.ok(p.volume > 0, 'Dynamic volume must be projected');
    const sign = p.close >= p.open ? 1 : -1;
    curRun = sign === lastSign ? curRun + 1 : 1;
    lastSign = sign;
    if (curRun > maxConsecutiveSameColor) maxConsecutiveSameColor = curRun;
  }
  assert.ok(maxConsecutiveSameColor <= 5, 'Wave generator must never produce 10 straight-line candles');
});

test('PRED-10: Horizon Prefix Invariance (+10 vs +20 vs +60) and +60-bar Multi-Wave Realistic Envelope', () => {
  const candles = buildSyntheticCandles(160, 'M15');
  const res10 = ForecastEngine.project(candles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    horizonBars: 10,
    skipWalkForward: true,
  });
  const res20 = ForecastEngine.project(candles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    horizonBars: 20,
    skipWalkForward: true,
  });
  const res60 = ForecastEngine.project(candles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    horizonBars: 60,
    skipWalkForward: true,
  });

  // 1. Exact first-10-bar prefix invariance across points and all 3 SMC scenarios
  for (let sIdx = 0; sIdx < 3; sIdx++) {
    const s10 = res10.smcScenarios[sIdx];
    const s20 = res20.smcScenarios[sIdx];
    const s60 = res60.smcScenarios[sIdx];
    assert.equal(s10.id, s20.id);
    assert.equal(s10.id, s60.id);
    assert.equal(s10.clusterType, s20.clusterType);
    assert.equal(s10.clusterType, s60.clusterType);
    assert.equal(s10.probability, s20.probability);
    assert.equal(s10.probability, s60.probability);
    for (let i = 0; i < 10; i++) {
      assert.ok(Math.abs(s10.candles[i].open - s20.candles[i].open) < 1e-9);
      assert.ok(Math.abs(s10.candles[i].close - s20.candles[i].close) < 1e-9);
      assert.ok(Math.abs(s10.candles[i].high - s20.candles[i].high) < 1e-9);
      assert.ok(Math.abs(s10.candles[i].low - s20.candles[i].low) < 1e-9);
      assert.ok(Math.abs(s10.candles[i].open - s60.candles[i].open) < 1e-9);
      assert.ok(Math.abs(s10.candles[i].close - s60.candles[i].close) < 1e-9);
      assert.ok(Math.abs(s10.candles[i].high - s60.candles[i].high) < 1e-9);
      assert.ok(Math.abs(s10.candles[i].low - s60.candles[i].low) < 1e-9);
    }
  }
  for (let i = 0; i < 10; i++) {
    assert.ok(Math.abs(res10.points[i].q50 - res20.points[i].q50) < 1e-9);
    assert.ok(Math.abs(res10.points[i].q50 - res60.points[i].q50) < 1e-9);
    assert.ok(Math.abs(res10.points[i].q10 - res60.points[i].q10) < 1e-9);
    assert.ok(Math.abs(res10.points[i].q90 - res60.points[i].q90) < 1e-9);
  }
  for (let i = 0; i < 20; i++) {
    assert.ok(Math.abs(res20.points[i].q50 - res60.points[i].q50) < 1e-9);
  }

  // 2. +60-bar projection must have multi-bar waves (both bullish & bearish bars) and bounded ATR excursion
  let bullCount = 0;
  let bearCount = 0;
  let maxConsec = 0;
  let curRun = 0;
  let prevSign = 0;
  for (const p of res60.points) {
    const sign = p.close >= p.open ? 1 : -1;
    if (sign > 0) bullCount += 1;
    else bearCount += 1;
    curRun = sign === prevSign ? curRun + 1 : 1;
    prevSign = sign;
    if (curRun > maxConsec) maxConsec = curRun;
  }
  assert.ok(bullCount >= 12 && bearCount >= 12, `60-bar forecast must oscillate with real pullbacks (bull=${bullCount}, bear=${bearCount})`);
  assert.ok(maxConsec <= 5, `60-bar forecast must not march linearly (maxConsec=${maxConsec})`);
  const atr = res60.featuresSummary.atr14;
  for (const sc of res60.smcScenarios) {
    const netExc = Math.abs(sc.targetPrice - res60.anchorClose);
    assert.ok(netExc <= atr * 12.5, `Scenario ${sc.id} terminal excursion ${netExc} exceeded 12.5*ATR (${atr * 12.5})`);
  }

  // 3. TechnicalIndicators.computeFutureCandlestickProjection also preserves prefix invariance
  const ti10 = TechnicalIndicators.computeFutureCandlestickProjection(candles, 'M15', 10);
  const ti30 = TechnicalIndicators.computeFutureCandlestickProjection(candles, 'M15', 30);
  const ti60 = TechnicalIndicators.computeFutureCandlestickProjection(candles, 'M15', 60);
  assert.equal(ti10.length, 10);
  assert.equal(ti30.length, 30);
  assert.equal(ti60.length, 60);
  for (let i = 0; i < 10; i++) {
    assert.ok(Math.abs(ti10[i].open - ti60[i].open) < 1e-9);
    assert.ok(Math.abs(ti10[i].close - ti60[i].close) < 1e-9);
    assert.ok(Math.abs(ti10[i].high - ti60[i].high) < 1e-9);
    assert.ok(Math.abs(ti10[i].low - ti60[i].low) < 1e-9);
  }
});

test('PRED-11: Cross-Timeframe M15 <-> H1 Sub-Bar Rollup Consistency', () => {
  // Build 160 M15 bars (40 complete aligned 1H blocks)
  const m15Bars = buildSyntheticCandles(160, 'M15');
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

  const m15Res = ForecastEngine.project(m15Bars, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    horizonBars: 16,
    skipWalkForward: true,
  });
  const h1Res = ForecastEngine.project(h1Bars, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'H1',
    horizonBars: 10,
    skipWalkForward: true,
    lowerTimeframe: 'M15',
    lowerTimeframeCandles: m15Bars,
  });

  // Every H1 scenario's first candle must exactly equal the OHLC rollup of the first 4 M15 candles of the matching cluster
  for (const h1Sc of h1Res.smcScenarios) {
    const m15Sc = m15Res.smcScenarios.find((s) => s.clusterType === h1Sc.clusterType) || m15Res.smcScenarios[0];
    const first4 = m15Sc.candles.slice(0, 4);
    const rollupHigh = Math.max(...first4.map((c) => c.high));
    const rollupLow = Math.min(...first4.map((c) => c.low));
    const rollupClose = first4[3].close;
    const h1Bar0 = h1Sc.candles[0];

    assert.ok(Math.abs(h1Bar0.open - first4[0].open) < 1e-6, 'H1 bar 0 open must match M15 bar 0 open');
    assert.ok(Math.abs(h1Bar0.high - rollupHigh) < 1e-6, 'H1 bar 0 high must match max of M15 bars 0..3');
    assert.ok(Math.abs(h1Bar0.low - rollupLow) < 1e-6, 'H1 bar 0 low must match min of M15 bars 0..3');
    assert.ok(Math.abs(h1Bar0.close - rollupClose) < 1e-6, 'H1 bar 0 close must match M15 bar 3 close');
  }
});



