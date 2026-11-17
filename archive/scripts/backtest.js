#!/usr/bin/env node
/**
 * CHART Forecast Engine V2.1 — Nested Walk-Forward & Backtest Harness
 *
 * Evaluates:
 *   1) Full Rev 2.1 Disjoint 4-Way Nested Walk-Forward (Train -> Val -> Cal -> Outer, 6-Gate Check)
 *   2) Rolling Causal Non-Overlapping Quantile Rollout (WIS, rMAE, MASE, 80% Coverage, HLN-DM)
 *
 * Usage:
 *   node scripts/backtest.js --file data/sample_M15.json --tf M15 --steps 10
 *   node scripts/backtest.js --file data/sample_M15.json --tf M15 --steps 10 --stride 10 --csv backtest_results.csv
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ForecastEngine, forecast } from '../src/forecastEngine.js';
import { calcAtr } from '../src/featureExtractor.js';
import { computeHorizonRequirements } from '../host_subdomain/assets/js/forecast/forecastContract.js';
import {
  buildZeroDriftLogNormalNaiveQuantiles,
  computeNaiveSigmaRw,
  computeWis5Q,
  hlnModifiedDieboldMariano,
} from '../host_subdomain/assets/js/forecast/statisticalTests.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = parseArgs(process.argv.slice(2));
const TF = String(args.tf || 'M15').toUpperCase();
const STEPS = Math.max(10, Math.min(60, parseInt(args.steps || '10', 10)));
const req = computeHorizonRequirements(STEPS);
const FILE = args.file || path.join(__dirname, '../data/sample_M15.json');
const MIN_HIST = parseInt(args.minHistory || String(req.nOpMin), 10);
const STRIDE = Math.max(1, parseInt(args.stride || String(STEPS), 10));
const CSV_FILE = args.csv || null;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  return out;
}

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const mae = (a, b) => mean(a.map((v, i) => Math.abs(v - b[i])));
const rmse = (a, b) => Math.sqrt(mean(a.map((v, i) => (v - b[i]) ** 2)));

const direction = (from, to, threshold) => {
  const d = to - from;
  if (Math.abs(d) < threshold) return 0;
  return d > 0 ? 1 : -1;
};

function loadData(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: Data file not found: ${filePath}`);
    console.error(`Run 'node scripts/makeSampleData.js' to generate synthetic sample data.`);
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`Error parsing JSON from ${filePath}:`, err.message);
    process.exit(1);
  }

  const rawCandles = Array.isArray(data) ? data : (data.candles || data.bars || []);
  if (!Array.isArray(rawCandles) || rawCandles.length < MIN_HIST + STEPS) {
    console.error(
      `Insufficient candles: got ${rawCandles.length}, need at least ${MIN_HIST + STEPS} (N_op_min=${req.nOpMin} + H=${STEPS}).`
    );
    process.exit(1);
  }

  return rawCandles.map((c) => ({
    time: Number(c.time || c.open_time_utc_ms || c.openTimeUtcMs || c.t || 0),
    open_time_utc_ms: Number(c.open_time_utc_ms || c.openTimeUtcMs || c.time || c.t || 0),
    open: Number(c.open ?? c.o ?? 0),
    high: Number(c.high ?? c.h ?? 0),
    low: Number(c.low ?? c.l ?? 0),
    close: Number(c.close ?? c.c ?? 0),
    volume: Number(c.volume ?? c.v ?? 0),
  }));
}

function runBacktest() {
  const candles = loadData(FILE);
  const total = candles.length;
  const isSyntheticSample =
    /sample_/i.test(path.basename(FILE)) ||
    candles[0]?.open_time_utc_ms === 1780272000000;

  console.log('='.repeat(72));
  console.log('CHART Forecast Engine V2.1 — Nested Walk-Forward & WIS Backtest');
  console.log('='.repeat(72));
  if (isSyntheticSample) {
    console.log(
      '[DATASET_NOTICE] Synthetic generated sample dataset (makeSampleData.js).'
    );
    console.log(
      'Metrics below verify software pipeline mechanics only — NOT real market edge.'
    );
  }
  console.log(`• File:             ${FILE}`);
  console.log(`• Timeframe / H:    ${TF} / +${STEPS} bars`);
  console.log(`• Bars Available:   ${total} (N_op_min=${req.nOpMin}, N_stat_min=${req.nStatMin})`);
  console.log(`• Rolling Origin:   minHistory=${MIN_HIST}, stride=${STRIDE}`);
  console.log('-'.repeat(72));

  // Part 1: Full Disjoint 4-Way Nested Walk-Forward V2.1 Audit
  const lastMs = candles[candles.length - 1].open_time_utc_ms;
  const nestedRes = ForecastEngine.project(candles, {
    symbolCode: 'XAUUSD',
    providerId: 'twelvedata',
    timeframe: TF,
    horizonBars: STEPS,
    anchorNowMs: lastMs + 86_400_000,
    enforceCalendarGaps: false,
  });

  const wf = nestedRes.walkForward;
  console.log('[1] Disjoint 4-Way Nested Walk-Forward (V2.1 Spec §6 & §8.2):');
  console.log(`  • Engine Status:        ${nestedRes.status}`);
  console.log(`  • Selection:            ${nestedRes.selectedChartModelId} (${nestedRes.selectionMode})`);
  console.log(`  • Outer Windows / N_eff:${wf.evaluatedWindows} (S=${wf.outerStrideBars}) / ${wf.effectiveSampleSize}`);
  console.log(`  • Conformal Cal:        ${nestedRes.conformalCalibration?.calibrationStatus || 'NONE'} (M=${nestedRes.conformalCalibration?.calibrationWindows || 0}, gamma=${nestedRes.conformalCalibration?.gammaLevel ?? 'N/A'})`);
  console.log(`  • rMAE / MASE:          ${wf.relativeMaeVsNaive} / ${wf.mase}`);
  console.log(`  • WIS (Model vs Naive): ${wf.wisModel} vs ${wf.wisNaiveDistributional}`);
  console.log(`  • 80% / 50% Coverage:   ${wf.coverage80Pct}% / ${wf.coverage50Pct}%`);
  console.log(`  • HLN-DM p / Boot p:    ${wf.dieboldMarianoPValue} / ${wf.sensitivityBootstrapPValue}`);
  console.log(`  • No-Edge Gate:         ${nestedRes.noEdgeGate?.gateState} (${(nestedRes.noEdgeGate?.reasons || []).join('; ')})`);
  console.log('-'.repeat(72));

  // Part 2: Rolling Causal Sliding Window Audit
  const records = [];
  const startIdx = MIN_HIST;
  const endIdx = total - STEPS;
  let evaluated = 0;

  for (let i = startIdx; i <= endIdx; i += STRIDE) {
    const history = candles.slice(0, i);
    const future = candles.slice(i, i + STEPS);
    const actualCloses = future.map((c) => c.close);
    const anchor = history[history.length - 1];
    const currentClose = anchor.close;
    const currentAtr = calcAtr(history, 14) || Math.max(1e-4, currentClose * 0.002);
    const dirThreshold = currentAtr * 0.25;

    const logRets = [];
    for (let k = Math.max(1, history.length - 250); k < history.length; k++) {
      if (history[k].close > 0 && history[k - 1].close > 0) {
        logRets.push(Math.log(history[k].close / history[k - 1].close));
      }
    }
    const sigmaRw = computeNaiveSigmaRw(logRets);
    const naiveQuantiles = Array.from({ length: STEPS }, (_, h) =>
      buildZeroDriftLogNormalNaiveQuantiles(currentClose, sigmaRw, h + 1)
    );
    const naiveCloses = naiveQuantiles.map((q) => q.q50);

    let predPoints = naiveQuantiles;
    try {
      const res = forecast(history, {
        timeframe: TF,
        steps: STEPS,
        horizonBars: STEPS,
        skipWalkForward: true,
        checkClosedBar: false,
      });
      if (Array.isArray(res.points) && res.points.length >= STEPS) {
        predPoints = res.points.slice(0, STEPS);
      }
    } catch (_) {
      predPoints = naiveQuantiles;
    }

    const predCloses = predPoints.map((p) => p.q50);
    const fMae = mae(predCloses, actualCloses);
    const nMae = mae(naiveCloses, actualCloses);
    const fRmse = rmse(predCloses, actualCloses);
    const nRmse = rmse(naiveCloses, actualCloses);

    let fWisSum = 0;
    let nWisSum = 0;
    let in80Count = 0;
    for (let h = 0; h < STEPS; h++) {
      const act = actualCloses[h];
      fWisSum += computeWis5Q(act, predPoints[h]);
      nWisSum += computeWis5Q(act, naiveQuantiles[h]);
      if (act >= predPoints[h].q10 && act <= predPoints[h].q90) in80Count++;
    }

    const actualDir = direction(currentClose, actualCloses[STEPS - 1], dirThreshold);
    const predDir = direction(currentClose, predCloses[STEPS - 1], dirThreshold);
    const isDirectionCorrect = actualDir === predDir;

    records.push({
      windowIndex: evaluated,
      timestamp: anchor.open_time_utc_ms,
      currentClose,
      forecastMae: fMae,
      naiveMae: nMae,
      forecastRmse: fRmse,
      naiveRmse: nRmse,
      forecastWis: fWisSum / STEPS,
      naiveWis: nWisSum / STEPS,
      cov80Frac: in80Count / STEPS,
      actualDir,
      predDir,
      isDirectionCorrect,
    });
    evaluated++;
  }

  const avgF_Mae = mean(records.map((r) => r.forecastMae));
  const avgN_Mae = mean(records.map((r) => r.naiveMae));
  const avgF_Wis = mean(records.map((r) => r.forecastWis));
  const avgN_Wis = mean(records.map((r) => r.naiveWis));
  const rMaeRoll = avgF_Mae / Math.max(1e-9, avgN_Mae);
  const cov80Roll = mean(records.map((r) => r.cov80Frac)) * 100;
  const dirAcc = (records.filter((r) => r.isDirectionCorrect).length / Math.max(1, records.length)) * 100;
  const dmRoll = records.length >= 5
    ? hlnModifiedDieboldMariano(records.map((r) => r.forecastWis - r.naiveWis), 1)
    : { stat: 0, pValue: 1 };

  console.log(`[2] Rolling Causal Window Summary (${records.length} windows, stride=${STRIDE}):`);
  console.log(`  • rMAE (Forecast / Naive): ${rMaeRoll.toFixed(4)} (MAE ${avgF_Mae.toFixed(4)} vs ${avgN_Mae.toFixed(4)})`);
  console.log(`  • WIS (Forecast / Naive):  ${avgF_Wis.toFixed(4)} vs ${avgN_Wis.toFixed(4)}`);
  console.log(`  • Empirical 80% Cov:       ${cov80Roll.toFixed(2)}%`);
  console.log(`  • Directional Accuracy:    ${dirAcc.toFixed(2)}%`);
  console.log(`  • HLN-DM Stat / p-value:   ${dmRoll.stat.toFixed(4)} / ${dmRoll.pValue.toFixed(5)}`);
  console.log('='.repeat(72));

  if (CSV_FILE) {
    const csvHeader =
      'windowIndex,timestamp,currentClose,forecastMae,naiveMae,forecastRmse,naiveRmse,forecastWis,naiveWis,cov80Frac,actualDir,predDir,isCorrect\n';
    const csvRows = records
      .map(
        (r) =>
          `${r.windowIndex},${r.timestamp},${r.currentClose},${r.forecastMae.toFixed(4)},${r.naiveMae.toFixed(4)},${r.forecastRmse.toFixed(4)},${r.naiveRmse.toFixed(4)},${r.forecastWis.toFixed(4)},${r.naiveWis.toFixed(4)},${r.cov80Frac.toFixed(4)},${r.actualDir},${r.predDir},${r.isDirectionCorrect ? 1 : 0}`
      )
      .join('\n');
    fs.writeFileSync(CSV_FILE, csvHeader + csvRows, 'utf-8');
    console.log(`Saved per-window V2.1 CSV report to: ${CSV_FILE}`);
  }
}

runBacktest();
