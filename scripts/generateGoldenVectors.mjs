#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(
      'export async function resolve(specifier, context, nextResolve) { return nextResolve(specifier.replace(/\\?v=[0-9.]+$/, ""), context); }'
    )
);

const { ForecastEngine } = await import('../host_subdomain/assets/js/forecast/forecastEngine.js');
const { CALENDAR_PROFILES, advanceFutureTimestampsWithCalendar } = await import(
  '../host_subdomain/assets/js/forecast/calendarRegistry.js'
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makePrng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function normalSample(rng) {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

function buildTrendSeries(count, startMs, startPrice, driftPerBar, volPerBar, seed) {
  const rng = makePrng(seed);
  const bars = [];
  let prevClose = startPrice;
  let prevCentered = 0;
  for (let i = 0; i < count; i++) {
    const z = normalSample(rng);
    const centered = 0.22 * prevCentered + volPerBar * z;
    const ret = driftPerBar + centered;
    const open = prevClose;
    const close = Number((open * Math.exp(ret)).toFixed(4));
    const wick = Math.max(open * 0.0007, Math.abs(close - open) * 0.55);
    const high = Number((Math.max(open, close) + wick).toFixed(4));
    const low = Number((Math.min(open, close) - wick * 0.9).toFixed(4));
    bars.push({
      openTimeUtcMs: startMs + i * 900_000,
      open,
      high,
      low,
      close,
      volume: 120 + (i % 25) * 15,
    });
    prevClose = close;
    prevCentered = centered;
  }
  return bars;
}

function buildCalendarGoldSeries(count, startMs, startPrice, seed) {
  const rng = makePrng(seed);
  const spec = CALENDAR_PROFILES.OTC_SPOT_XAU_TWELVEDATA;
  // Walk using calendar registry timestamps starting Sunday 18:00 ET (22:00 UTC in EDT)
  const openTimes = advanceFutureTimestampsWithCalendar(startMs - 900_000, 'M15', count, 'XAUUSD', 'twelvedata', spec);
  const bars = [];
  let prevClose = startPrice;
  let prevCentered = 0;
  for (let i = 0; i < count; i++) {
    const centered = 0.20 * prevCentered + 0.0012 * normalSample(rng);
    const ret = 0.00025 + centered;
    const open = prevClose;
    const close = Number((open * Math.exp(ret)).toFixed(4));
    const wick = Math.max(open * 0.0006, Math.abs(close - open) * 0.5);
    const high = Number((Math.max(open, close) + wick).toFixed(4));
    const low = Number((Math.min(open, close) - wick).toFixed(4));
    bars.push({
      openTimeUtcMs: openTimes[i],
      open,
      high,
      low,
      close,
      volume: 0,
    });
    prevClose = close;
    prevCentered = centered;
  }
  return bars;
}

const baseAnchorMs = Date.parse('2026-08-10T00:00:00Z');

const v1Candles = buildTrendSeries(650, baseAnchorMs, 2400.0, 0.00045, 0.0011, 512);
const v2Candles = buildTrendSeries(650, baseAnchorMs, 2650.0, -0.00045, 0.0011, 1101);
const v3Candles = buildTrendSeries(500, baseAnchorMs, 2500.0, 0.0, 0.0025, 3003);
const v4Candles = buildTrendSeries(600, baseAnchorMs, 2480.0, 0.0004, 0.0010, 4004);
// Inject extreme vol/tail shock at final bar of VECTOR-04 to trigger ELEVATED / EXTREME OOD
{
  const last = v4Candles[v4Candles.length - 1];
  const open = last.open;
  const close = Number((open * 1.038).toFixed(4));
  v4Candles[v4Candles.length - 1] = {
    ...last,
    high: Number((close * 1.005).toFixed(4)),
    low: Number((open * 0.996).toFixed(4)),
    close,
  };
}

// VECTOR-05 crosses Friday 17:00 ET close -> Sunday 18:00 ET open and DST boundary in November 2026
const v5StartMs = Date.parse('2026-10-28T00:00:00Z');
const v5Candles = buildCalendarGoldSeries(650, v5StartMs, 2550.0, 5007);

// VECTOR-06 short series (360 bars @ H=30 => >= N_op_min(318) & < N_stat_min(1248) => INSUFFICIENT_EVIDENCE)
const v6Candles = buildTrendSeries(360, baseAnchorMs, 1950.0, 0.0004, 0.0015, 6006);

const specs = [
  {
    id: 'VECTOR-01',
    name: 'Trending Bull 650b H10',
    symbolCode: 'XAUUSD',
    providerId: 'internal',
    timeframe: 'M15',
    horizonBars: 10,
    candles: v1Candles,
    enforceCalendarGaps: false,
    expectedStatusOptions: ['VALID', 'PROVISIONAL', 'NO_EDGE'],
  },
  {
    id: 'VECTOR-02',
    name: 'Trending Bear 650b H10',
    symbolCode: 'XAUUSD',
    providerId: 'internal',
    timeframe: 'M15',
    horizonBars: 10,
    candles: v2Candles,
    enforceCalendarGaps: false,
    expectedStatusOptions: ['VALID', 'PROVISIONAL', 'NO_EDGE'],
  },
  {
    id: 'VECTOR-03',
    name: 'Random Walk Zero Drift 500b H10',
    symbolCode: 'RANDOMWALK',
    providerId: 'internal',
    timeframe: 'M15',
    horizonBars: 10,
    candles: v3Candles,
    enforceCalendarGaps: false,
    expectedStatusOptions: ['NO_EDGE'],
  },
  {
    id: 'VECTOR-04',
    name: 'Volatility Shock Tail Event 600b H10',
    symbolCode: 'XAUUSD',
    providerId: 'internal',
    timeframe: 'M15',
    horizonBars: 10,
    candles: v4Candles,
    enforceCalendarGaps: false,
    expectedStatusOptions: ['NO_EDGE', 'PROVISIONAL'],
  },
  {
    id: 'VECTOR-05',
    name: 'DST & Weekend Calendar OTC Gold 650b H10',
    symbolCode: 'XAUUSD',
    providerId: 'twelvedata',
    timeframe: 'M15',
    horizonBars: 10,
    candles: v5Candles,
    enforceCalendarGaps: true,
    expectedStatusOptions: ['VALID', 'PROVISIONAL', 'NO_EDGE'],
  },
  {
    id: 'VECTOR-06',
    name: 'Short Operational Window 360b H30 -> INSUFFICIENT_EVIDENCE',
    symbolCode: 'XAUUSD',
    providerId: 'internal',
    timeframe: 'M15',
    horizonBars: 30,
    candles: v6Candles,
    enforceCalendarGaps: false,
    expectedStatusOptions: ['INSUFFICIENT_EVIDENCE'],
  },
];

const vectors = specs.map((sp) => {
  const lastCloseMs = sp.candles[sp.candles.length - 1].openTimeUtcMs + 900_000;
  const res = ForecastEngine.project(sp.candles, {
    symbolCode: sp.symbolCode,
    providerId: sp.providerId,
    timeframe: sp.timeframe,
    horizonBars: sp.horizonBars,
    anchorNowMs: lastCloseMs + 60_000,
    checkClosedBar: true,
    enforceCalendarGaps: sp.enforceCalendarGaps,
  });
  const lastPt = res.points[res.points.length - 1];
  return {
    id: sp.id,
    name: sp.name,
    symbolCode: sp.symbolCode,
    providerId: sp.providerId,
    timeframe: sp.timeframe,
    horizonBars: sp.horizonBars,
    anchorNowMs: lastCloseMs + 60_000,
    enforceCalendarGaps: sp.enforceCalendarGaps,
    expectedStatusOptions: sp.expectedStatusOptions,
    expectedJsResult: {
      status: res.status,
      inputHash: res.inputHash,
      selectedChartModelId: res.selectedChartModelId,
      evaluatedWindows: res.walkForward?.evaluatedWindows || 0,
      effectiveSampleSize: res.walkForward?.effectiveSampleSize || 0,
      relativeMaeVsNaive: res.walkForward?.relativeMaeVsNaive ?? null,
      wisModel: res.walkForward?.wisModel ?? null,
      wisNaiveDistributional: res.walkForward?.wisNaiveDistributional ?? null,
      terminalQuantiles: lastPt
        ? {
            q10: lastPt.q10,
            q25: lastPt.q25,
            q50: lastPt.q50,
            q75: lastPt.q75,
            q90: lastPt.q90,
          }
        : null,
    },
    candles: sp.candles,
  };
});

const outPath = path.join(__dirname, '../tests/golden_vectors_v2.json');
fs.writeFileSync(
  outPath,
  JSON.stringify({
    specVersion: '2.1.0',
    generatedAtUtcIso: new Date().toISOString(),
    vectors,
  })
);
console.log(`Generated ${vectors.length} golden vectors -> ${outPath}`);
for (const v of vectors) {
  console.log(
    `${v.id} (${v.candles.length} bars H=${v.horizonBars}): status=${v.expectedJsResult.status}, hash=${v.expectedJsResult.inputHash.slice(0, 16)}..., q50=${v.expectedJsResult.terminalQuantiles?.q50?.toFixed(4)}`
  );
}
