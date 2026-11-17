import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  CONTRACT_VERSION,
  SPEC_VERSION,
  ENGINE_VERSION,
  FORECAST_STATUS,
  SCENARIO_STATUS,
  SCENARIO_IDS,
  MODEL_EXECUTION_STATUS,
  EVALUATION_OUTCOME,
  LIFECYCLE_STATUS,
  SELECTION_MODE,
  canonicalJson,
  computeHorizonRequirements,
  roundToSignificant,
  sha256Hex,
} = await import('../host_subdomain/assets/js/forecast/forecastContract.js');
const {
  CALENDAR_PROFILES,
  advanceFutureTimestampsWithCalendar,
  inspectCalendarGaps,
} = await import('../host_subdomain/assets/js/forecast/calendarRegistry.js');
const {
  computeBartlettEffectiveSampleSize,
  computeWis5Q,
  fitVolatilityNormalizedConformal,
  hlnModifiedDieboldMariano,
} = await import('../host_subdomain/assets/js/forecast/statisticalTests.js');
const {
  evaluateNoEdgeGate,
} = await import('../host_subdomain/assets/js/forecast/forecastV130Analyzer.js');
const {
  selectOosChartWinner,
} = await import('../host_subdomain/assets/js/forecast/walkForwardEvaluator.js');
const { ForecastModelRegistry } = await import('../host_subdomain/assets/js/forecast/modelRegistry.js');
const { ForecastLedger } = await import('../host_subdomain/assets/js/forecast/forecastLedger.js');
const { EmpiricalAnalogEngine, ForecastEngine } = await import('../host_subdomain/assets/js/forecast/forecastEngine.js');
const { TechnicalIndicators } = await import('../host_subdomain/assets/js/algorithms/technicalIndicators.js');

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function normalRand(rng) {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

function buildRandomWalkBars(count, sigma = 0.0025, seed = 101, startPrice = 2400.0) {
  const rng = makeRng(seed);
  const start = Date.parse('2026-07-01T00:00:00Z');
  const bars = [];
  let prev = startPrice;
  for (let i = 0; i < count; i++) {
    const r = sigma * normalRand(rng);
    const open = prev;
    const close = Number((open * Math.exp(r)).toFixed(4));
    const spread = Math.max(open * 0.0005, Math.abs(close - open) * 0.5);
    bars.push({
      openTimeUtcMs: start + i * 900_000,
      open,
      high: Number((Math.max(open, close) + spread).toFixed(4)),
      low: Number((Math.min(open, close) - spread).toFixed(4)),
      close,
      volume: 0,
    });
    prev = close;
  }
  return bars;
}

function buildTrendingBars(count, driftPerBar = 0.0009, sigma = 0.0010, seed = 777, startPrice = 2400.0) {
  const rng = makeRng(seed);
  const start = Date.parse('2026-07-01T00:00:00Z');
  const bars = [];
  let prev = startPrice;
  for (let i = 0; i < count; i++) {
    const r = driftPerBar + sigma * normalRand(rng);
    const open = prev;
    const close = Number((open * Math.exp(r)).toFixed(4));
    const spread = Math.max(open * 0.0004, Math.abs(close - open) * 0.4);
    bars.push({
      openTimeUtcMs: start + i * 900_000,
      open,
      high: Number((Math.max(open, close) + spread).toFixed(4)),
      low: Number((Math.min(open, close) - spread).toFixed(4)),
      close,
      volume: 100 + (i % 10) * 5,
    });
    prev = close;
  }
  return bars;
}

function buildPredictableAr1Bars(count, driftPerBar = 0.00035, phi = 0.52, sigma = 0.0012, seed = 909, startPrice = 2400.0) {
  const rng = makeRng(seed);
  const start = Date.parse('2026-07-01T00:00:00Z');
  const bars = [];
  let prev = startPrice;
  let prevCentered = 0;
  for (let i = 0; i < count; i++) {
    const centered = phi * prevCentered + sigma * normalRand(rng);
    const r = driftPerBar + centered;
    const open = prev;
    const close = Number((open * Math.exp(r)).toFixed(4));
    const spread = Math.max(open * 0.0004, Math.abs(close - open) * 0.4);
    bars.push({
      openTimeUtcMs: start + i * 900_000,
      open,
      high: Number((Math.max(open, close) + spread).toFixed(4)),
      low: Number((Math.min(open, close) - spread).toFixed(4)),
      close,
      volume: 0,
    });
    prev = close;
    prevCentered = centered;
  }
  return bars;
}

function buildStrictlyMonotonicUpBars(count, stepRet = 0.0018, seed = 333) {
  const rng = makeRng(seed);
  const start = Date.parse('2026-07-01T00:00:00Z');
  const bars = [];
  let prev = 2000.0;
  for (let i = 0; i < count; i++) {
    const r = stepRet + 0.0004 * rng();
    const open = prev;
    const close = Number((open * Math.exp(r)).toFixed(4));
    bars.push({
      openTimeUtcMs: start + i * 900_000,
      open,
      high: Number((close * 1.0005).toFixed(4)),
      low: Number((open * 0.9998).toFixed(4)),
      close,
      volume: 0,
    });
    prev = close;
  }
  return bars;
}

function buildGarchSeries(count, seed = 888, startPrice = 2500.0) {
  const rng = makeRng(seed);
  const start = Date.parse('2026-07-01T00:00:00Z');
  const omega = 1.5e-7;
  const alpha = 0.14;
  const beta = 0.80;
  let sigmaSq = omega / (1 - alpha - beta);
  let prev = startPrice;
  const bars = [];
  for (let i = 0; i < count; i++) {
    const z = normalRand(rng);
    const eps = Math.sqrt(sigmaSq) * z;
    const r = 0.0001 + eps;
    const open = prev;
    const close = Number((open * Math.exp(r)).toFixed(4));
    const spread = Math.max(open * 0.0004, Math.abs(close - open) * 0.5);
    bars.push({
      openTimeUtcMs: start + i * 900_000,
      open,
      high: Number((Math.max(open, close) + spread).toFixed(4)),
      low: Number((Math.min(open, close) - spread).toFixed(4)),
      close,
      volume: 0,
    });
    prev = close;
    sigmaSq = omega + alpha * eps * eps + beta * sigmaSq;
  }
  return bars;
}

test('T01: Zero synthetic analogs on <6 real analogs; emits INSUFFICIENT_EVIDENCE honestly', () => {
  const shortAnalogsInput = buildRandomWalkBars(40, 0.002, 11);
  const eng = new EmpiricalAnalogEngine(24, 10, 'M15');
  const analogSearch = eng.findCausalAnalogs(shortAnalogsInput, 10, 5.0);
  assert.equal(analogSearch.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(analogSearch.analogs.length, 0);

  const subStatBars = buildTrendingBars(220, 0.0008, 0.001, 12);
  const res = ForecastEngine.project(subStatBars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: subStatBars[subStatBars.length - 1].openTimeUtcMs + 900_000,
  });
  assert.equal(res.status, FORECAST_STATUS.INSUFFICIENT_EVIDENCE);
  assert.equal(res.syntheticProfiles, undefined);
  assert.equal('syntheticProfiles' in res, false);
});

test('T02: Zero forced 3-candle PULLBACK wave machine on steady upward series', () => {
  const upBars = buildStrictlyMonotonicUpBars(520, 0.0016, 22);
  const res = ForecastEngine.project(upBars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: upBars[upBars.length - 1].openTimeUtcMs + 900_000,
    selectedModelId: 'native_arima_diff',
    skipWalkForward: true,
  });
  assert.equal(res.points.length, 10);
  // Causal ARIMA/trend median rises smoothly without any hardcoded pullback phase-reversal on steps 1..3
  for (let i = 0; i < 3; i++) {
    assert.ok(res.points[i].q50 >= upBars[upBars.length - 1].close * 0.999);
    assert.equal(res.points[i].rejectionWick, undefined);
    assert.equal(res.points[i].wavePhase, undefined);
  }
});

test('T03: Zero artificial 4-same-color reversal rule across sustained momentum streaks', () => {
  const upBars = buildStrictlyMonotonicUpBars(520, 0.0020, 33);
  const tiProj = TechnicalIndicators.computeFutureCandlestickProjection(upBars, 'M15', 10);
  assert.equal(tiProj.length, 10);
  let bullSteps = 0;
  for (let i = 0; i < tiProj.length; i++) {
    if (tiProj[i].close >= tiProj[i].open) bullSteps++;
  }
  assert.ok(bullSteps > 6, `No artificial 4-bar alternating wave limit may interrupt pure monotonic trend (bullSteps=${bullSteps})`);
});

test('T04: Reject non-monotonic or duplicate timestamps immediately with DATA_NOT_READY', () => {
  const bars = buildTrendingBars(500, 0.0005, 0.001, 44);
  const anchor = bars[bars.length - 1].openTimeUtcMs + 900_000;
  // Swap two timestamps to violate monotonic ascending order
  const swapped = bars.map((b) => ({ ...b }));
  swapped[250].openTimeUtcMs = swapped[249].openTimeUtcMs;
  const res = ForecastEngine.project(swapped, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: anchor,
  });
  assert.equal(res.status, FORECAST_STATUS.DATA_NOT_READY);
  assert.ok(res.readiness.errorCodes.includes('NON_MONOTONIC_OR_DUPLICATE_TIMESTAMP'));
  assert.equal(res.points.length, 0);
});

test('T05: Reject High < Low OHLC corruption immediately with OHLC_CORRUPTED (zero silent clamping)', () => {
  const bars = buildTrendingBars(500, 0.0005, 0.001, 55);
  bars[120] = {
    ...bars[120],
    high: bars[120].low - 5.0,
  };
  const res = ForecastEngine.project(bars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: bars[bars.length - 1].openTimeUtcMs + 900_000,
  });
  assert.equal(res.status, FORECAST_STATUS.DATA_NOT_READY);
  assert.ok(res.readiness.errorCodes.includes('OHLC_CORRUPTED'));
  assert.equal(res.points.length, 0);
});

test('T06: Reject unclosed last candle (openTime + tfMs > anchorNowMs) with UNCLOSED_BAR_DETECTED', () => {
  const bars = buildTrendingBars(500, 0.0005, 0.001, 66);
  const lastOpen = bars[bars.length - 1].openTimeUtcMs;
  const res = ForecastEngine.project(bars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: lastOpen + 450_000, // Halfway through closing M15 bar
    checkClosedBar: true,
  });
  assert.equal(res.status, FORECAST_STATUS.DATA_NOT_READY);
  assert.ok(res.readiness.errorCodes.includes('UNCLOSED_BAR_DETECTED'));
  assert.equal(res.points.length, 0);
});

test('T07: Zero-sample scenario emits NOT_ESTIMABLE, rawEmpiricalFrequency=0.0, probability=null (zero Dirichlet smoothing)', () => {
  const monoUp = buildStrictlyMonotonicUpBars(500, 0.0022, 77);
  const res = ForecastEngine.project(monoUp, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: monoUp[monoUp.length - 1].openTimeUtcMs + 900_000,
  });
  const bear = res.scenarios.find((s) => s.id === SCENARIO_IDS.BEARISH_CONTRACTION);
  assert.ok(bear, 'BEARISH_CONTRACTION scenario card must still be reported honestly');
  assert.equal(bear.status, SCENARIO_STATUS.NOT_ESTIMABLE);
  assert.equal(bear.probability, null);
  assert.equal(bear.rawEmpiricalFrequency, 0.0);
  assert.equal(bear.lowSampleWarning, true);
});

test('T08: Monte Carlo Type-I error rate control on N_MC=300 pure Log-Normal Random Walks (500 bars, H=10)', () => {
  const nMc = 300;
  let falsePositives = 0;
  for (let m = 0; m < nMc; m++) {
    const rw = buildRandomWalkBars(500, 0.0025, 10_000 + m * 17, 2000.0);
    const res = ForecastEngine.project(rw, {
      symbolCode: 'RANDOMWALK',
      providerId: 'internal',
      timeframe: 'M15',
      horizonBars: 10,
      anchorNowMs: rw[rw.length - 1].openTimeUtcMs + 900_000,
      enforceCalendarGaps: false,
      bootstrapB: 250,
    });
    if (res.status === FORECAST_STATUS.VALID) {
      falsePositives++;
    }
  }
  const pHat = falsePositives / nMc;
  const z = 1.96;
  const denom = 1 + (z * z) / nMc;
  const center = (pHat + (z * z) / (2 * nMc)) / denom;
  const margin = (z * Math.sqrt((pHat * (1 - pHat) + (z * z) / (4 * nMc)) / nMc)) / denom;
  const wilsonUpper = center + margin;

  assert.ok(falsePositives <= 15, `Monte Carlo Type-I false VALID rate exceeded 5%: ${falsePositives}/${nMc}`);
  assert.ok(wilsonUpper < 0.085, `Wilson 95% CI upper bound must stay < 0.085 (got ${wilsonUpper.toFixed(4)})`);
});

test('T09: 6-Gate VALID completeness + single-gate failure control (Coverage or HLN-DM fail -> NO_EDGE)', () => {
  // Part A: Stationary predictable AR(1) + mild-drift 650-bar series passing all 6 gates cleanly
  const trendBars = buildPredictableAr1Bars(650, 0.00050, 0.22, 0.0011, 42, 2400.0);
  const validRes = ForecastEngine.project(trendBars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: trendBars[trendBars.length - 1].openTimeUtcMs + 900_000,
  });
  assert.equal(validRes.status, FORECAST_STATUS.VALID, `Expected VALID on persistent AR(1) series, got ${validRes.status}: ${validRes.walkForward?.acceptanceReason}`);
  assert.equal(validRes.walkForward.acceptancePassed, true);
  assert.ok(validRes.walkForward.relativeMaeVsNaive < 1.0);
  assert.ok(validRes.walkForward.wisModel < validRes.walkForward.wisNaiveDistributional);
  assert.ok(validRes.walkForward.coverage80Pct >= 72.0 && validRes.walkForward.coverage80Pct <= 88.0);
  assert.ok(validRes.walkForward.dieboldMarianoPValue <= 0.05);
  assert.ok(validRes.walkForward.sensitivityBootstrapPValue <= 0.10);

  // Part B: Failing ONLY coverage80Pct despite rMAE < 0.90 forces NO_EDGE and blocks AUTO_OOS_BEST
  const fakeWfBadCov = {
    ...validRes.walkForward,
    acceptancePassed: false,
    coverage80Pct: 62.0,
    ensembleMetrics: { ...validRes.walkForward.ensembleMetrics, rMae: 0.85, coverage80Pct: 62.0 },
    modelBenchmarks: validRes.walkForward.modelBenchmarks.map((b) => ({ ...b, rMae: 0.85, coverage80Pct: 62.0 })),
  };
  const covFailGate = evaluateNoEdgeGate(fakeWfBadCov, validRes.uncertainty);
  assert.equal(covFailGate.hasEdge, false);
  const selCovFail = selectOosChartWinner(fakeWfBadCov, validRes.modelTrajectories, 'AUTO');
  assert.equal(selCovFail.selectionMode, SELECTION_MODE.NO_CLEAR_WINNER_BASELINE);
  assert.equal(selCovFail.selectedModelId, 'naive_persistence');

  // Part C: Failing ONLY dieboldMarianoPValue despite rMAE < 0.90 & valid coverage forces NO_EDGE
  const fakeWfBadDm = {
    ...validRes.walkForward,
    acceptancePassed: false,
    dieboldMarianoPValue: 0.08,
    ensembleMetrics: { ...validRes.walkForward.ensembleMetrics, rMae: 0.85, dmPValue: 0.08 },
    modelBenchmarks: validRes.walkForward.modelBenchmarks.map((b) => ({ ...b, rMae: 0.85, dmPValue: 0.08 })),
  };
  const dmFailGate = evaluateNoEdgeGate(fakeWfBadDm, validRes.uncertainty);
  assert.equal(dmFailGate.hasEdge, false);
  const selDmFail = selectOosChartWinner(fakeWfBadDm, validRes.modelTrajectories, 'AUTO');
  assert.equal(selDmFail.selectionMode, SELECTION_MODE.NO_CLEAR_WINNER_BASELINE);
});

test('T10: Volatility-Normalized Conformal Calibration coverage on GARCH(1,1) 500-bar series', () => {
  const garchBars = buildGarchSeries(500, 1010, 2500.0);
  const res = ForecastEngine.project(garchBars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: garchBars[garchBars.length - 1].openTimeUtcMs + 900_000,
  });
  assert.ok(res.conformalCalibration);
  assert.equal(res.conformalCalibration.calibrationWindows, 20);
  assert.equal(res.conformalCalibration.calibrationStatus, 'CALIBRATED_NORMALIZED');
  assert.ok(res.conformalCalibration.gammaLevel <= 1.0 && res.conformalCalibration.gammaLevel >= 0.80);
  assert.ok(
    res.walkForward.coverage80Pct >= 72.0 && res.walkForward.coverage80Pct <= 88.0,
    `Conformal coverage on GARCH series should be calibrated within [72%, 88%], got ${res.walkForward.coverage80Pct}%`
  );
});

test('T11: NY DST & OTC Gold Friday/Sunday maintenance break calendar verification', () => {
  const spec = CALENDAR_PROFILES.OTC_SPOT_XAU_TWELVEDATA;
  // Friday Nov 6, 2026 16:45 ET = 21:45 UTC (EST = UTC-5) -> next open bar jumps Sunday Nov 8, 2026 18:00 ET = 23:00 UTC
  const fri1645EtMs = Date.UTC(2026, 10, 6, 21, 45, 0);
  const futureFromFri = advanceFutureTimestampsWithCalendar(fri1645EtMs, 'M15', 4, 'XAUUSD', 'twelvedata', spec);
  assert.equal(futureFromFri[0], Date.UTC(2026, 10, 8, 23, 0, 0), 'Must skip weekend closure from Fri 16:45 ET directly to Sun 18:00 ET');
  assert.equal(futureFromFri[1], Date.UTC(2026, 10, 8, 23, 15, 0));

  // Verify calendar gap inspector reports 0 false gaps when closing over Fri->Sun weekend + daily 17:00-18:00 ET break
  const startSun = Date.UTC(2026, 10, 1, 23, 0, 0); // Sun Nov 1, 2026 18:00 EST
  const openTimes = [startSun, ...advanceFutureTimestampsWithCalendar(startSun, 'M15', 520, 'XAUUSD', 'twelvedata', spec)];
  const sessionBars = openTimes.map((t) => ({ openTimeUtcMs: t, open: 2500, high: 2502, low: 2498, close: 2501, volume: 0 }));
  const gapRep = inspectCalendarGaps(sessionBars, 'M15', spec);
  assert.equal(gapRep.gapCount, 0, `Expected 0 false gaps across weekend & daily maintenance break, found ${gapRep.gapCount}`);
});

test('T12: Strict quantile monotonicity q10 <= q25 <= q50 <= q75 <= q90 under extreme volatility shock', () => {
  const bars = buildGarchSeries(500, 1212, 2500.0);
  bars[bars.length - 1] = {
    ...bars[bars.length - 1],
    high: bars[bars.length - 1].open * 1.18,
    low: bars[bars.length - 1].open * 0.85,
    close: bars[bars.length - 1].open * 1.15,
  };
  const res = ForecastEngine.project(bars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: bars[bars.length - 1].openTimeUtcMs + 900_000,
  });
  assert.equal(res.points.length, 10);
  for (const pt of res.points) {
    assert.ok(Number.isFinite(pt.q10) && pt.q10 > 0);
    assert.ok(pt.q10 <= pt.q25 && pt.q25 <= pt.q50 && pt.q50 <= pt.q75 && pt.q75 <= pt.q90);
  }
});

test('T13: Horizon continuity H=10 vs first 10 steps of H=30 without artificial state jumps', () => {
  const bars = buildTrendingBars(400, 0.0006, 0.0012, 1313);
  const anchor = bars[bars.length - 1].openTimeUtcMs + 900_000;
  const r10 = ForecastEngine.project(bars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: anchor,
    skipWalkForward: true,
    selectedModelId: 'native_arima_diff',
  });
  const r30 = ForecastEngine.project(bars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 30,
    anchorNowMs: anchor,
    skipWalkForward: true,
    selectedModelId: 'native_arima_diff',
  });
  assert.equal(r10.horizonBars, 10);
  assert.equal(r30.horizonBars, 30);
  for (let i = 0; i < 10; i++) {
    assert.ok(Math.abs(r10.points[i].q50 - r30.points[i].q50) < 1e-8);
    assert.ok(Math.abs(r10.points[i].q10 - r30.points[i].q10) < 1e-8);
    assert.ok(Math.abs(r10.points[i].q90 - r30.points[i].q90) < 1e-8);
  }
});

test('T14: Bit-exact Determinism across 10 consecutive runs', () => {
  const bars = buildTrendingBars(500, 0.0009, 0.0011, 1414);
  const anchor = bars[bars.length - 1].openTimeUtcMs + 900_000;
  const ref = ForecastEngine.project(bars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: anchor,
    bypassWalkForwardCache: true,
  });
  for (let k = 0; k < 10; k++) {
    const cur = ForecastEngine.project(bars, {
      symbolCode: 'XAUUSD',
      timeframe: 'M15',
      horizonBars: 10,
      anchorNowMs: anchor,
      bypassWalkForwardCache: true,
    });
    assert.equal(cur.inputHash, ref.inputHash);
    assert.equal(cur.status, ref.status);
    assert.deepEqual(cur.points, ref.points);
  }
});

test('T15: 6 Golden Vectors verification & canonical JSON 12-sig-fig parity', () => {
  const gvPath = path.join(__dirname, 'golden_vectors_v2.json');
  assert.ok(fs.existsSync(gvPath), 'tests/golden_vectors_v2.json must exist');
  const payload = JSON.parse(fs.readFileSync(gvPath, 'utf8'));
  assert.equal(payload.vectors.length, 6);

  for (const vec of payload.vectors) {
    const res = ForecastEngine.project(vec.candles, {
      symbolCode: vec.symbolCode,
      providerId: vec.providerId,
      timeframe: vec.timeframe,
      horizonBars: vec.horizonBars,
      anchorNowMs: vec.anchorNowMs,
      checkClosedBar: true,
      enforceCalendarGaps: Boolean(vec.enforceCalendarGaps),
    });
    assert.equal(res.inputHash, vec.expectedJsResult.inputHash, `${vec.id} inputHash mismatch`);
    assert.equal(res.status, vec.expectedJsResult.status, `${vec.id} status mismatch`);
    assert.ok(vec.expectedStatusOptions.includes(res.status), `${vec.id} unexpected status ${res.status}`);
    if (vec.expectedJsResult.terminalQuantiles && res.points.length > 0) {
      const last = res.points[res.points.length - 1];
      for (const qk of ['q10', 'q25', 'q50', 'q75', 'q90']) {
        assert.ok(Math.abs(last[qk] - vec.expectedJsResult.terminalQuantiles[qk]) < 1e-6);
      }
    }
  }

  // Canonical number formatting spot check (zero trailing zeroes, -0 normalized, null -> "NULL")
  assert.equal(roundToSignificant(-0, 12), 0);
  assert.equal(canonicalJson({ b: null, a: 2450.0 }), '{"a":2450,"b":"NULL"}');
});

test('T16: Reject invalid Python worker response (inputHash mismatch or NaN/non-monotonic quantiles)', () => {
  const bars = buildTrendingBars(500, 0.0009, 0.0011, 1616);
  const baseRes = ForecastEngine.project(bars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: bars[bars.length - 1].openTimeUtcMs + 900_000,
  });

  // Case A: inputHash mismatch (e.g. altered high without altering close)
  const mismatchResp = ForecastEngine.applyRemoteWorkerResponse(baseRes, {
    status: 'CONNECTED',
    configured: true,
    url: 'http://localhost:8000',
    data: {
      inputHash: 'deadbeef'.repeat(8),
      modelTrajectories: [
        {
          modelId: 'chronos2',
          status: MODEL_EXECUTION_STATUS.SUCCESS,
          points: baseRes.points,
        },
      ],
    },
  });
  assert.equal(mismatchResp.remoteWorker.status, 'ERROR');
  assert.ok(mismatchResp.remoteWorker.error.includes('WORKER_INPUT_HASH_MISMATCH'));
  assert.deepEqual(mismatchResp.points, baseRes.points);

  // Case B: NaN quantile inside worker response
  const badPts = baseRes.points.map((p, idx) => (idx === 4 ? { ...p, q50: Number.NaN } : p));
  const nanResp = ForecastEngine.applyRemoteWorkerResponse(baseRes, {
    status: 'CONNECTED',
    configured: true,
    url: 'http://localhost:8000',
    data: {
      inputHash: baseRes.inputHash,
      modelTrajectories: [
        {
          modelId: 'chronos2',
          status: MODEL_EXECUTION_STATUS.SUCCESS,
          points: badPts,
        },
      ],
    },
  });
  const chronosTraj = nanResp.modelTrajectories.find((t) => t.modelId === 'chronos2');
  assert.equal(chronosTraj.status, MODEL_EXECUTION_STATUS.FAILED);
  assert.equal(chronosTraj.points.length, 0);
  assert.deepEqual(nanResp.points, baseRes.points);
});

test('T17: SHA-256 Ledger Hash Chain integrity detects tampering at record index 2', () => {
  memStore.clear();
  const ledger = new ForecastLedger('test_v2_chain');
  const bars = buildTrendingBars(500, 0.0008, 0.001, 1717);
  const res = ForecastEngine.project(bars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: bars[bars.length - 1].openTimeUtcMs + 900_000,
    skipWalkForward: true,
  });

  for (let i = 0; i < 5; i++) {
    ledger.appendFromForecast({ ...res, anchorClose: res.anchorClose + i * 0.5 });
  }
  assert.equal(ledger.verifyChain().valid, true);

  const tampered = ledger.loadEntries();
  tampered[2].terminalMedian += 10.0;
  const check = ledger.verifyChain(tampered);
  assert.equal(check.valid, false);
  assert.equal(check.brokenIndex, 2);
  assert.ok(check.error.includes('SHA-256 Hash Chain Integrity Mismatch'));
});

test('T18: Matured Lifecycle outcome AMBIGUOUS when candle intersects both q10 and q90 without sub-bars', () => {
  memStore.clear();
  const ledger = new ForecastLedger('test_v2_ambig');
  const bars = buildTrendingBars(500, 0.0008, 0.001, 1818);
  const res = ForecastEngine.project(bars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: bars[bars.length - 1].openTimeUtcMs + 900_000,
    skipWalkForward: true,
  });
  ledger.appendFromForecast(res);

  const future = bars.concat(
    Array.from({ length: 12 }, (_, idx) => {
      const ts = res.anchorOpenTimeUtcMs + (idx + 1) * 900_000;
      if (idx === 1) {
        return {
          openTimeUtcMs: ts,
          open: res.anchorClose,
          high: res.summary.terminalQ90 * 1.05,
          low: res.summary.terminalQ10 * 0.95,
          close: res.anchorClose,
        };
      }
      return {
        openTimeUtcMs: ts,
        open: res.anchorClose,
        high: res.anchorClose * 1.001,
        low: res.anchorClose * 0.999,
        close: res.anchorClose,
      };
    })
  );
  const events = ledger.evaluateMaturedForecasts(future, 'XAUUSD', 'M15');
  assert.ok(events.some((e) => e.lifecycleStatus === LIFECYCLE_STATUS.MATURED));
  assert.ok(events.some((e) => e.evaluationOutcome === EVALUATION_OUTCOME.AMBIGUOUS));
  assert.equal(ledger.verifyLifecycleChain().valid, true);
});

test('T19: Scenario ID & ATR threshold semantic stability across volatility regimes', () => {
  const lowVol = buildTrendingBars(500, 0.0006, 0.0008, 1919);
  const highVol = buildTrendingBars(500, 0.0006, 0.0045, 1920);
  for (const ds of [lowVol, highVol]) {
    const res = ForecastEngine.project(ds, {
      symbolCode: 'XAUUSD',
      timeframe: 'M15',
      horizonBars: 10,
      anchorNowMs: ds[ds.length - 1].openTimeUtcMs + 900_000,
    });
    assert.deepEqual(
      res.scenarios.map((s) => s.id),
      [SCENARIO_IDS.BULLISH_EXPANSION, SCENARIO_IDS.RANGE_CONTAINMENT, SCENARIO_IDS.BEARISH_CONTRACTION]
    );
    assert.ok(res.scenarios[0].targetPrice >= res.scenarios[1].targetPrice);
    assert.ok(res.scenarios[1].targetPrice >= res.scenarios[2].targetPrice);
  }
});

test('T20: Zero temporal leakage in EmpiricalAnalogEngine across H in {10, 20, 30, 60}', () => {
  const longBars = buildRandomWalkBars(700, 0.002, 2020);
  const T = longBars.length;
  for (const H of [10, 20, 30, 60]) {
    const eng = new EmpiricalAnalogEngine(24, H, 'M15');
    const search = eng.findCausalAnalogs(longBars, H, 5.0);
    assert.equal(search.status, 'READY', `Expected READY analogs on 700b for H=${H}`);
    const currentWinStart = T - search.windowLength;
    for (const a of search.analogs) {
      assert.ok(
        a.futureEndIndex + search.embargoGap < currentWinStart,
        `Leakage at H=${H}: futureEnd=${a.futureEndIndex} + embargo=${search.embargoGap} >= currentWinStart=${currentWinStart}`
      );
    }
  }
});

test('T21: Bartlett Effective Sample Size (N_eff) formula accuracy on autocorrelated AR(1) errors (rho_1 ~ 0.6, K=30)', () => {
  const K = 30;
  const ar1 = new Array(K).fill(0);
  ar1[0] = 1.0;
  for (let i = 1; i < K; i++) {
    ar1[i] = 0.6 * ar1[i - 1] + (i % 2 === 0 ? 0.35 : -0.25);
  }
  const nEff = computeBartlettEffectiveSampleSize(ar1, 10);
  assert.ok(nEff > 0 && nEff < K, `Autocorrelated N_eff must be strictly between 0 and ${K}, got ${nEff}`);

  const iidAlt = Array.from({ length: K }, (_, i) => (i % 2 === 0 ? 1 : -1));
  const nEffAlt = computeBartlettEffectiveSampleSize(iidAlt, 1);
  assert.equal(nEffAlt, K, 'Alternating negative lag-1 autocorrelation locks rho_1 at 0 -> N_eff == K');
});

test('T22: Zero fabricated volume or artificial rejection wicks anywhere in output schema', () => {
  const bars = buildTrendingBars(550, 0.0008, 0.0012, 2222);
  const res = ForecastEngine.project(bars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: bars[bars.length - 1].openTimeUtcMs + 900_000,
  });
  for (const pt of res.points) {
    assert.equal(pt.volume, undefined, 'Future points must never contain fabricated volume');
    assert.equal(pt.rejectionWick, undefined, 'Future points must never contain synthetic rejectionWick');
    assert.equal(pt.wavePhase, undefined, 'Future points must never contain synthetic wavePhase');
    assert.equal(pt.open, undefined);
    assert.equal(pt.high, undefined);
    assert.equal(pt.low, undefined);
    assert.equal(pt.close, undefined);
  }
  for (const mt of res.modelTrajectories) {
    for (const pt of mt.points || []) {
      assert.equal(pt.volume, undefined);
      assert.equal(pt.rejectionWick, undefined);
    }
  }
  for (const rp of res.representativePaths || []) {
    assert.equal(rp.isIllustrativeOnly, true);
    assert.equal(rp.volume, undefined);
    assert.ok(Array.isArray(rp.closes) && rp.closes.length === 10);
  }
});
