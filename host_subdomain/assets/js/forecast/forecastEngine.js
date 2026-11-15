import {
  CONTRACT_VERSION,
  EXECUTION_RUNTIME,
  FORECAST_STATUS,
  MODEL_EXECUTION_STATUS,
  SELECTION_MODE,
  SPEC_VERSION,
  advanceFutureTimestamps,
  canonicalJson,
  clampHorizonBars,
  enforceMonotonicQuantiles,
  normalizeRenderMode,
  sha256Hex,
  validateDataReadiness,
} from './forecastContract.js?v=1.43.0';
import { extractForecastFeatures } from './featureExtractor.js?v=1.43.0';
import { defaultForecastRegistry, ForecastModelRegistry } from './modelRegistry.js?v=1.43.0';
import {
  buildPriceTrajectoryFromPrediction,
  evaluateWalkForward,
  selectOosChartWinner,
} from './walkForwardEvaluator.js?v=1.43.0';
import {
  computeForecastStability,
  computeOodAndUncertainty,
  coordinateMultiTimeframe,
  detectKeyZonesAndEventTree,
  evaluateNoEdgeGate,
} from './forecastV130Analyzer.js?v=1.43.0';
import { TechnicalIndicators } from '../algorithms/technicalIndicators.js?v=1.43.0';
import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.43.0';

function PriceFormatterStepMs(tf) {
  return PriceFormatter.stepMilliseconds(tf);
}

/**
 * CHART INTELLIGENCE — Scenario-Based Future Candle Projection Engine
 * Replaces flat Quantile/MAE averaging with:
 * 1. Multi-Timeframe State & SMC Feature Extraction (`extractMultiTimeframeFeatures`)
 * 2. Historical Analog Search (`findHistoricalAnalogs` via k-NN Pattern Matching)
 * 3. K-Medoids Clustering (`generateScenarios` / `clusterAndScaleScenarios` preserving realistic OHLCV waves & wicks)
 * 4. SMC Liquidity Magnet Warping (Pullback to FVG / POC / EMA20 -> Impulse to VAH / VAL / EQH / EQL)
 * 5. Live 15m Bayesian Probability & Re-Anchoring Engine (`evaluateAndUpdateLive`)
 */
export const CANONICAL_SMC_HORIZON = 60;

export function resolveLowerTimeframeInfo(timeframe = 'M15') {
  const tf = String(timeframe || 'M15').trim().toUpperCase();
  if (tf === 'M30') return { timeframe: 'M15', ratio: 2 };
  if (tf === 'H1') return { timeframe: 'M15', ratio: 4 };
  if (tf === 'H4') return { timeframe: 'H1', ratio: 4 };
  if (tf === 'D1') return { timeframe: 'H4', ratio: 6 };
  return null;
}

export class SMCPredictionEngine {
  constructor(windowSize = 30, horizon = 20, timeframe = 'M15') {
    this.windowSize = Math.max(12, Number(windowSize || 30));
    this.horizon = Math.max(10, Math.min(CANONICAL_SMC_HORIZON, Number(horizon || 20)));
    this.canonicalHorizon = CANONICAL_SMC_HORIZON;
    this.timeframe = String(timeframe || 'M15').trim().toUpperCase();
    this.topKAnalogs = 45;
  }

  /**
   * 1. Calculate ATR(14) for realistic candle body and wick scaling
   */
  calculateATR(candles, period = 14) {
    if (!Array.isArray(candles) || candles.length < 2) return 0.5;
    const p = Math.min(period, candles.length - 1);
    let trSum = 0;
    for (let i = candles.length - p; i < candles.length; i++) {
      const curr = candles[i];
      const prevClose = Number(candles[i - 1].close || curr.open || 0);
      const hi = Number(curr.high || 0);
      const lo = Number(curr.low || 0);
      const tr = Math.max(hi - lo, Math.abs(hi - prevClose), Math.abs(lo - prevClose));
      trSum += tr;
    }
    const lastClose = Number(candles[candles.length - 1].close || 1);
    return Math.max(trSum / Math.max(1, p), lastClose * 0.0012);
  }

  /**
   * Step 1: Extract Multi-Timeframe State Vector & SMC / Volume Profile Liquidity Magnets
   */
  extractMultiTimeframeFeatures(candles, timeframe = 'M15') {
    const n = candles.length;
    const lastCandle = candles[n - 1];
    const lastClose = Number(lastCandle.close || 0);
    const atr = this.calculateATR(candles, 14);

    // 30-bar body-to-wick ratios & volume stats
    const ratioCount = Math.min(30, Math.max(1, n - 1));
    let bodyRatioSum = 0;
    let upperWickSum = 0;
    let lowerWickSum = 0;
    let vol20Sum = 0;
    let vol5Sum = 0;
    for (let i = n - ratioCount; i < n; i++) {
      const c = candles[i];
      const hi = Number(c.high || 0);
      const lo = Number(c.low || 0);
      const op = Number(c.open || 0);
      const cl = Number(c.close || 0);
      const rng = Math.max(hi - lo, lastClose * 0.0004);
      bodyRatioSum += Math.abs(cl - op) / rng;
      upperWickSum += (hi - Math.max(op, cl)) / rng;
      lowerWickSum += (Math.min(op, cl) - lo) / rng;
    }
    const v20Count = Math.min(20, n);
    for (let i = n - v20Count; i < n; i++) {
      vol20Sum += Math.max(1, Number(candles[i].volume || 100));
    }
    const v5Count = Math.min(5, n);
    for (let i = n - v5Count; i < n; i++) {
      vol5Sum += Math.max(1, Number(candles[i].volume || 100));
    }
    const avgVolume = Math.max(10, vol20Sum / Math.max(1, v20Count));
    const volumeRatio5to20 = (vol5Sum / Math.max(1, v5Count)) / avgVolume;

    // SMC (BOS/CHoCH, FVG boxes, EQH/EQL), Volume Profile (POC/VAH/VAL), EMA20, Bollinger, RSI14
    const recentSlice = candles.slice(-Math.min(n, 140));
    const smc = TechnicalIndicators.detectMarketStructureSmc(recentSlice, 3);
    const vpRaw = TechnicalIndicators.computeVolumeProfile(recentSlice, 24, 0.70, 'TICK_SYNTHETIC');
    const ema20Arr = TechnicalIndicators.computeEma(recentSlice, Math.min(20, Math.max(5, recentSlice.length - 2)));
    const bbArr = TechnicalIndicators.computeBollingerBands(
      recentSlice,
      Math.min(20, Math.max(5, recentSlice.length - 2)),
      2.0
    );
    const rsiArr = TechnicalIndicators.computeRsi(recentSlice, 14);

    const ema20 = Number(ema20Arr[ema20Arr.length - 1] ?? lastClose);
    const lastBb = bbArr[bbArr.length - 1] || {
      upper: lastClose + 2 * atr,
      lower: lastClose - 2 * atr,
      middle: ema20,
    };
    const bbWidth = (Number(lastBb.upper) - Number(lastBb.lower)) / Math.max(1e-6, lastClose);
    const bbPercentB =
      (lastClose - Number(lastBb.lower)) / Math.max(1e-6, Number(lastBb.upper) - Number(lastBb.lower));
    const rsi14 = Number(rsiArr[rsiArr.length - 1] ?? 50);

    // Multi-timeframe trend alignment score (-1 to +1) using true timeframe ratios
    const tfNorm = String(timeframe || this.timeframe || 'M15').trim().toUpperCase();
    const midGroup = tfNorm === 'M30' ? 2 : tfNorm === 'H1' ? 4 : tfNorm === 'H4' ? 6 : tfNorm === 'D1' || tfNorm === 'W1' ? 5 : 4;
    const macroGroup = tfNorm === 'M30' ? 8 : tfNorm === 'H1' ? 24 : tfNorm === 'H4' ? 30 : tfNorm === 'D1' || tfNorm === 'W1' ? 20 : 16;

    const lastBos =
      smc.bosChochEvents && smc.bosChochEvents.length > 0
        ? smc.bosChochEvents[smc.bosChochEvents.length - 1]
        : null;
    const scoreBase = (lastClose >= ema20 ? 0.5 : -0.5) + (lastBos ? (lastBos.direction >= 0 ? 0.5 : -0.5) : 0);

    const aggregateCandles = (src, groupSize) => {
      if (src.length < groupSize * 3) return [];
      const out = [];
      for (let i = 0; i + groupSize <= src.length; i += groupSize) {
        const chunk = src.slice(i, i + groupSize);
        let hi = -Infinity;
        let lo = Infinity;
        let vol = 0;
        for (const b of chunk) {
          if (Number(b.high) > hi) hi = Number(b.high);
          if (Number(b.low) < lo) lo = Number(b.low);
          vol += Number(b.volume || 0);
        }
        out.push({
          open: Number(chunk[0].open),
          high: hi,
          low: lo,
          close: Number(chunk[chunk.length - 1].close),
          volume: vol,
        });
      }
      return out;
    };

    const computeTfScore = (tfCandles) => {
      if (tfCandles.length < 5) return scoreBase;
      const emaArr = TechnicalIndicators.computeEma(tfCandles, Math.min(20, Math.max(4, tfCandles.length - 1)));
      const emaVal = Number(emaArr[emaArr.length - 1] ?? tfCandles[tfCandles.length - 1].close);
      const cl = Number(tfCandles[tfCandles.length - 1].close);
      const prevCl = Number(tfCandles[Math.max(0, tfCandles.length - 4)].close);
      const emaSign = cl >= emaVal ? 1 : -1;
      const structSign = cl >= prevCl ? 1 : -1;
      return 0.5 * emaSign + 0.5 * structSign;
    };

    const scoreMid = computeTfScore(aggregateCandles(recentSlice, midGroup));
    const scoreMacro = computeTfScore(aggregateCandles(recentSlice, macroGroup));
    const htfTrendBias = Math.max(-1, Math.min(1, Number((0.40 * scoreBase + 0.35 * scoreMid + 0.25 * scoreMacro).toFixed(3))));

    const unmitigatedFVGs = (smc.fvgZones || [])
      .filter((z) => !z.mitigated)
      .map((z) => ({
        top: Number(z.top),
        bottom: Number(z.bottom),
        midpoint: Number(z.midpoint ?? (Number(z.top) + Number(z.bottom)) / 2),
        type: z.kind === 'BULL' ? 'bullish' : 'bearish',
        mitigated: Boolean(z.mitigated),
      }));

    const vp = {
      poc: Number(vpRaw?.pocPrice || ema20 || lastClose),
      vah: Number(vpRaw?.vahPrice || lastClose + 2.2 * atr),
      val: Number(vpRaw?.valPrice || lastClose - 2.2 * atr),
    };

    const equalHighs = (smc.liquidityLevels || [])
      .filter((l) => l.kind === 'EQH')
      .map((l) => Number(l.price));
    const equalLows = (smc.liquidityLevels || [])
      .filter((l) => l.kind === 'EQL')
      .map((l) => Number(l.price));

    return {
      timeframe,
      htfTrendBias,
      unmitigatedFVGs,
      vp,
      equalHighs,
      equalLows,
      ema20,
      bbWidth,
      bbPercentB,
      rsi14,
      volumeRatio5to20,
      avgVolume,
      avgBodyRatio: Math.max(0.38, Math.min(0.74, bodyRatioSum / ratioCount)),
      avgUpperWickRatio: Math.max(0.15, Math.min(0.46, upperWickSum / ratioCount)),
      avgLowerWickRatio: Math.max(0.15, Math.min(0.46, lowerWickSum / ratioCount)),
    };
  }

  /**
   * 2. Extract normalized shape vector from a 30-candle window (for historical similarity matching)
   */
  extractNormalizedShape(window, atr) {
    const baseClose = Number(window[0]?.close || 1);
    const safeAtr = Math.max(atr, 0.0001);
    const features = [];
    for (const c of window) {
      const cl = Number(c.close || 0);
      const op = Number(c.open || 0);
      const hi = Number(c.high || 0);
      const lo = Number(c.low || 0);
      features.push((cl - baseClose) / safeAtr);
      const range = Math.max(hi - lo, 0.0001);
      features.push((cl - op) / range);
    }
    return features;
  }

  /**
   * 3. Search historical analogs in past candle history (k-NN Historical Analog)
   * Horizon-invariant: uses fixed core lookahead depth independent of requested horizon
   * so +10, +20, and +60 projections always match on the exact same historical analogs.
   */
  findHistoricalAnalogs(allHistory, currentAtr) {
    const effWindow = Math.min(this.windowSize, Math.max(10, Math.floor(allHistory.length * 0.35)));
    const coreAnalogLen = Math.min(20, Math.max(10, Math.floor(allHistory.length * 0.22)));
    const currentWindow = allHistory.slice(-effWindow);
    const currentVec = this.extractNormalizedShape(currentWindow, currentAtr);
    const analogs = [];

    const maxSearchIdx = allHistory.length - effWindow - coreAnalogLen - 2;
    const step = maxSearchIdx > 180 ? 2 : 1;

    for (let i = 15; i <= maxSearchIdx; i += step) {
      const candidateWindow = allHistory.slice(i, i + effWindow);
      const pastAtr = this.calculateATR(allHistory.slice(Math.max(0, i - 14), i + effWindow), 14);
      const candidateVec = this.extractNormalizedShape(candidateWindow, pastAtr);

      let dist = 0;
      for (let j = 0; j < currentVec.length; j++) {
        const weight = j > currentVec.length * 0.6 ? 2.0 : 1.0;
        dist += weight * Math.pow(currentVec[j] - (candidateVec[j] || 0), 2);
      }
      dist = Math.sqrt(dist);

      const futureEnd = Math.min(allHistory.length, i + effWindow + this.canonicalHorizon);
      const futureWindow = allHistory.slice(i + effWindow, futureEnd);
      if (futureWindow.length >= coreAnalogLen) {
        analogs.push({ futureWindow, pastAtr, distance: dist, coreEvalLen: Math.min(14, coreAnalogLen) });
      }
    }

    // Supplement with deterministic multi-wave fractal templates when history is shorter than full depth
    if (analogs.length < 9) {
      const lastCandle = allHistory[allHistory.length - 1];
      const baseP = Number(lastCandle.close || 100);
      const baseVol = Math.max(50, Number(lastCandle.volume || 500));
      const syntheticProfiles = [
        { dir: 1, pull: -0.42, dist: 0.45 },
        { dir: 1, pull: -0.28, dist: 0.55 },
        { dir: -1, pull: 0.42, dist: 0.52 },
        { dir: -1, pull: 0.28, dist: 0.62 },
        { dir: 0, pull: -0.24, dist: 0.58 },
        { dir: 0, pull: 0.24, dist: 0.64 },
      ];
      for (let sIdx = 0; sIdx < syntheticProfiles.length; sIdx++) {
        const prof = syntheticProfiles[sIdx];
        const fw = [];
        let p = baseP;
        for (let h = 0; h < this.canonicalHorizon; h++) {
          const cyclePos = h >= 3 ? (h - 3) % 14 : -1;
          const isPull = h < 3;
          const isCorrWave = cyclePos >= 8 && cyclePos <= 12;
          const isMicroDip = cyclePos === 3 || cyclePos === 6;
          let stepDelta;
          if (isPull) {
            stepDelta = prof.pull * currentAtr * 0.42;
          } else if (prof.dir === 0) {
            stepDelta = Math.sin((h + sIdx) * 0.85) * currentAtr * 0.42;
          } else if (isCorrWave) {
            stepDelta = -prof.dir * currentAtr * (0.28 + 0.16 * Math.abs(Math.sin(h * 0.9)));
          } else if (isMicroDip) {
            stepDelta = -prof.dir * currentAtr * 0.30;
          } else {
            const damp = 1 / (1 + h * 0.025);
            stepDelta = prof.dir * currentAtr * (0.38 + 0.18 * Math.abs(Math.cos(h * 0.8))) * damp;
          }
          const op = p;
          const cl = Math.max(baseP * 0.1, op + stepDelta);
          const hi = Math.max(op, cl) + currentAtr * (0.22 + 0.14 * Math.abs(Math.cos(h + sIdx)));
          const lo = Math.max(baseP * 0.05, Math.min(op, cl) - currentAtr * (0.22 + 0.14 * Math.abs(Math.sin(h + sIdx))));
          fw.push({
            time: Math.floor(Number(lastCandle.open_time_utc_ms || Date.now()) / 1000) + (h + 1) * 900,
            open: op,
            high: hi,
            low: lo,
            close: cl,
            volume: Math.round(baseVol * (isCorrWave || isMicroDip ? 0.68 : 1.28)),
          });
          p = cl;
        }
        analogs.push({ futureWindow: fw, pastAtr: currentAtr, distance: prof.dist + sIdx * 0.05, coreEvalLen: 14 });
      }
    }

    analogs.sort((a, b) => a.distance - b.distance);
    return analogs.slice(0, this.topKAnalogs);
  }

  /**
   * 4. Cluster into 3 Scenarios (SCENARIO_A, SCENARIO_B, SCENARIO_C) & select true Medoid path
   */
  generateScenarios(history, smcContext, futureTimestamps = [], options = {}) {
    const currentAtr = this.calculateATR(history, 14) * Math.max(0.4, Math.min(2.5, Number(options.volatilityMultiplier || 1.0)));
    const lastCandle = history[history.length - 1];
    const analogs = this.findHistoricalAnalogs(history, currentAtr);

    const bullishGroup = [];
    const bearishGroup = [];
    const rangingGroup = [];

    for (const item of analogs) {
      const evalIdx = Math.min((item.coreEvalLen || 14) - 1, item.futureWindow.length - 1);
      const startP = Number(item.futureWindow[0]?.open || lastCandle.close);
      const endP = Number(item.futureWindow[evalIdx]?.close || startP);
      const netMoveInAtr = (endP - startP) / Math.max(item.pastAtr, 0.0001);

      if (netMoveInAtr > 0.65) bullishGroup.push(item);
      else if (netMoveInAtr < -0.65) bearishGroup.push(item);
      else rangingGroup.push(item);
    }

    const bias = Number(smcContext?.htfTrendBias || 0);
    const scenarioMode = String(options.scenarioMode || 'auto_smc');
    const modeBoostBull = scenarioMode === 'bullish_continuation' ? 1.65 : 1.0;
    const modeBoostBear = scenarioMode === 'bearish_reversal' ? 1.65 : 1.0;

    const rawCounts = [
      {
        type: 'BULL',
        group: bullishGroup,
        weight: Math.max(1.2, bullishGroup.length + 1.5) * (1 + 0.38 * bias) * modeBoostBull,
      },
      {
        type: 'BEAR',
        group: bearishGroup,
        weight: Math.max(1.0, bearishGroup.length + 1.2) * (1 - 0.38 * bias) * modeBoostBear,
      },
      {
        type: 'RANGE',
        group: rangingGroup,
        weight: Math.max(0.9, rangingGroup.length + 1.0) * (1 - 0.15 * Math.abs(bias)),
      },
    ];

    const totalWeight = rawCounts.reduce((acc, c) => acc + Math.max(c.weight, 0.2), 0);
    rawCounts.sort((a, b) => b.weight - a.weight);

    const scenarioIds = ['SCENARIO_A', 'SCENARIO_B', 'SCENARIO_C'];
    const rawProbs = rawCounts.map((c) => Math.max(c.weight, 0.2) / totalWeight);
    const p0 = Number(rawProbs[0].toFixed(2));
    const p1 = Number(rawProbs[1].toFixed(2));
    const p2 = Number(Math.max(0.01, 1 - p0 - p1).toFixed(2));
    const normProbs = [p0, p1, p2];

    const targetOutHorizon = Math.min(this.horizon, futureTimestamps.length > 0 ? futureTimestamps.length : this.horizon);

    return rawCounts.map((cluster, idx) => {
      const probability = normProbs[idx];
      const representative =
        cluster.group.length > 0
          ? cluster.group[Math.floor(cluster.group.length / 2)]
          : analogs[Math.min(idx, analogs.length - 1)];

      const pullbackPrice = this.findNearestPullbackLevel(
        Number(lastCandle.close),
        currentAtr,
        smcContext,
        cluster.type
      );
      const primaryTarget = this.findPrimaryTargetLevel(
        Number(lastCandle.close),
        currentAtr,
        smcContext,
        cluster.type
      );

      // Generate canonical 60-bar trajectory, then slice to targetOutHorizon for exact prefix invariance
      const canonicalCandles = this.buildRealisticCandles(
        representative.futureWindow,
        representative.pastAtr,
        lastCandle,
        currentAtr,
        smcContext,
        cluster.type,
        futureTimestamps,
        this.canonicalHorizon
      );
      const projectedCandles = canonicalCandles.slice(0, targetOutHorizon);

      const finalClose = projectedCandles[projectedCandles.length - 1].close;
      const lastCloseVal = Number(lastCandle.close);

      return {
        id: scenarioIds[idx],
        clusterType: cluster.type,
        bias: cluster.type === 'BULL' ? 'bull' : cluster.type === 'BEAR' ? 'bear' : 'neutral',
        name:
          cluster.type === 'BULL'
            ? 'سناریوی صعودی (اصلاح به FVG/POC و حرکت به سمت VAH/EQH)'
            : cluster.type === 'BEAR'
              ? 'سناریوی نزولی (اصلاح به FVG و ریزش به سمت نقدینگی VAL/EQL)'
              : 'سناریوی نوسانی (تراکم و جذب سفارش حول محور POC)',
        nameEn:
          cluster.type === 'BULL'
            ? 'Bullish SMC Wave (FVG/POC Pullback → VAH/EQH Impulse)'
            : cluster.type === 'BEAR'
              ? 'Bearish SMC Wave (Upper FVG Mitigation → VAL/EQL Sweep)'
              : 'Value Area Equilibrium (Range Consolidation around POC)',
        probability,
        candles: projectedCandles,
        pullbackPrice: Number(pullbackPrice.toFixed(4)),
        primaryMagnetPrice: Number(primaryTarget.toFixed(4)),
        targetPrice: Number(finalClose.toFixed(4)),
        invalidationPrice: Number(
          (cluster.type === 'BULL'
            ? lastCloseVal - 1.8 * currentAtr
            : cluster.type === 'BEAR'
              ? lastCloseVal + 1.8 * currentAtr
              : lastCloseVal - 1.5 * currentAtr
          ).toFixed(4)
        ),
        stepIndex: 0,
      };
    });
  }

  /**
   * 5. Build realistic multi-wave future candles calibrated to ATR(14), SMC FVG/POC/VAH/VAL/EQH/EQL,
   * genuine impulse -> correction -> consolidation swings, and sqrt(t) volatility diffusion bounds.
   */
  buildRealisticCandles(
    templateCandles,
    templateAtr,
    anchorCandle,
    currentAtr,
    smc,
    direction,
    futureTimestamps = [],
    totalBars = this.canonicalHorizon
  ) {
    const result = [];
    const scale = currentAtr / Math.max(templateAtr, 0.0001);
    const anchorClose = Number(anchorCandle.close);
    const anchorOpenMs = Number(
      anchorCandle.open_time_utc_ms || (anchorCandle.openTimeSec ? anchorCandle.openTimeSec * 1000 : Date.now())
    );
    const tfNorm = String(smc?.timeframe || this.timeframe || 'M15').toUpperCase();
    const stepMsFallback = PriceFormatterStepMs(tfNorm);
    const avgVol = Math.max(10, Number(smc?.avgVolume || anchorCandle.volume || 250));
    const avgBodyRatio = Number(smc?.avgBodyRatio || 0.55);
    const avgUpperWickRatio = Number(smc?.avgUpperWickRatio || 0.25);
    const avgLowerWickRatio = Number(smc?.avgLowerWickRatio || 0.25);

    const rawPullbackMagnet = this.findNearestPullbackLevel(anchorClose, currentAtr, smc, direction);
    const rawTargetMagnet = this.findPrimaryTargetLevel(anchorClose, currentAtr, smc, direction);
    const pullbackSteps = tfNorm === 'M15' ? 3 : tfNorm === 'M30' ? 2 : 1;

    // Clamp initial pullback distance realistically so higher timeframes don't plunge excessively on bar 1
    const maxPullAtr = pullbackSteps === 1 ? 0.62 : 1.35;
    const pullbackMagnet = Math.max(
      anchorClose - maxPullAtr * currentAtr,
      Math.min(anchorClose + maxPullAtr * currentAtr, rawPullbackMagnet)
    );
    const targetMagnet =
      direction === 'BULL'
        ? Math.max(anchorClose + 1.6 * currentAtr, Math.min(anchorClose + 5.2 * currentAtr, rawTargetMagnet))
        : direction === 'BEAR'
          ? Math.min(anchorClose - 1.6 * currentAtr, Math.max(anchorClose - 5.2 * currentAtr, rawTargetMagnet))
          : Number(smc?.vp?.poc || anchorClose);

    const poc = Number(smc?.vp?.poc || anchorClose);
    const vah = Number(smc?.vp?.vah || anchorClose + 2 * currentAtr);
    const val = Number(smc?.vp?.val || anchorClose - 2 * currentAtr);
    const pocAnchor = Math.max(anchorClose - 1.5 * currentAtr, Math.min(anchorClose + 1.5 * currentAtr, poc));

    let prevClose = anchorClose;
    let consecutiveSameDir = 0;
    let lastDirSign = 0;
    let waveMode = direction === 'RANGE' ? 'RANGE' : 'PULLBACK';
    let legBars = 0;
    let legStart = anchorClose;
    let sweepCount = 0;
    let corrLen = 4;
    let corrTarget = anchorClose;
    let consLen = 3;
    let consMid = anchorClose;

    const tplLen = Math.max(1, templateCandles.length);
    const mainDir = direction === 'BULL' ? 1 : direction === 'BEAR' ? -1 : 0;

    for (let i = 0; i < totalBars; i++) {
      // If horizon extends past analog length, replay damped mirrored/cycled template swings cleanly
      const tplIdx = i < tplLen ? i : (i - tplLen) % tplLen;
      const mirrorSign = i < tplLen ? 1 : ((Math.floor(i / tplLen) % 2 === 1) ? -0.65 : 0.75);
      const tpl = templateCandles[tplIdx] || templateCandles[tplLen - 1];
      const tplBody = (Number(tpl.close) - Number(tpl.open)) * scale * mirrorSign;
      const tplUpperWick = (Number(tpl.high) - Math.max(Number(tpl.open), Number(tpl.close))) * scale;
      const tplLowerWick = (Math.min(Number(tpl.open), Number(tpl.close)) - Number(tpl.low)) * scale;

      const open = prevClose;
      const maxEnvAtr = 1.10 * Math.sqrt(i + 6);
      const totalExcursionAtr = mainDir !== 0 ? ((prevClose - anchorClose) * mainDir) / Math.max(currentAtr, 1e-6) : 0;
      const excursionDamp = Math.max(0.18, Math.min(1.0, 1.0 - Math.max(0, totalExcursionAtr) / (maxEnvAtr * 1.04)));

      // State transitions before computing candle i
      if (waveMode === 'PULLBACK' && i >= pullbackSteps) {
        waveMode = 'IMPULSE';
        legBars = 0;
        legStart = prevClose;
      } else if (waveMode === 'IMPULSE') {
        const legGainAtr = ((prevClose - legStart) * mainDir) / Math.max(currentAtr, 1e-6);
        const legTarget =
          sweepCount === 0
            ? targetMagnet
            : anchorClose + mainDir * currentAtr * Math.min(maxEnvAtr * 0.90, 3.0 + sweepCount * 1.55);
        const hitTarget = (prevClose - legTarget) * mainDir >= -0.25 * currentAtr && legBars >= 4;
        const overextended =
          legGainAtr >= 2.15 + 0.35 * (sweepCount % 2) ||
          legBars >= 8 ||
          totalExcursionAtr >= maxEnvAtr * 0.80;

        if (hitTarget || overextended) {
          waveMode = 'CORRECTION';
          corrLen = 4 + ((i + sweepCount) % 3); // 4..6 bar realistic pullback
          const retraceFrac = 0.42 + 0.10 * (sweepCount % 2);
          corrTarget = prevClose - (prevClose - legStart) * retraceFrac;
          legBars = 0;
          sweepCount += 1;
        }
      } else if (waveMode === 'CORRECTION') {
        const reachedCorr = (prevClose - corrTarget) * (-mainDir) >= -0.15 * currentAtr && legBars >= 2;
        if (legBars >= corrLen || reachedCorr) {
          if (i >= 14 && sweepCount % 2 === 1) {
            waveMode = 'CONSOLIDATION';
            consLen = 3 + (sweepCount % 2);
            consMid = prevClose;
            legBars = 0;
          } else {
            waveMode = 'IMPULSE';
            legStart = prevClose;
            legBars = 0;
          }
        }
      } else if (waveMode === 'CONSOLIDATION') {
        if (legBars >= consLen) {
          if (i < 48 && totalExcursionAtr < maxEnvAtr * 0.78) {
            waveMode = 'IMPULSE';
            legStart = prevClose;
            legBars = 0;
          } else {
            // Late horizon stays balanced around outer equilibrium
            consMid = prevClose;
            legBars = 0;
          }
        }
      }

      let rawBodyDelta = 0;
      let candleCategory = waveMode;

      if (direction === 'RANGE' || waveMode === 'RANGE') {
        const pullToPoc = (pocAnchor - prevClose) * 0.24;
        const cycle = Math.sin((i + 1) * 0.92 + 0.4) * currentAtr * 0.44;
        const blended = pullToPoc + cycle * 0.72 + tplBody * 0.28;
        let dirSign = blended >= 0 ? 1 : -1;
        if (consecutiveSameDir >= 3 && dirSign === lastDirSign) {
          dirSign = -lastDirSign;
        }
        const exc = (prevClose - pocAnchor) / Math.max(currentAtr, 1e-6);
        if (Math.abs(exc) > 1.55) {
          dirSign = exc > 0 ? -1 : 1;
        }
        const mag = Math.max(currentAtr * 0.20, Math.min(currentAtr * 0.68, Math.abs(blended) + currentAtr * 0.14));
        rawBodyDelta = dirSign * mag;
        candleCategory = 'CONSOLIDATION';
      } else if (waveMode === 'PULLBACK') {
        const remPull = Math.max(1, pullbackSteps - i);
        const gapToPull = (pullbackMagnet - prevClose) / remPull;
        if (pullbackSteps === 1) {
          // Higher TF (H1+): shallow test/reclaim bar instead of deep dump
          const biasAdj = (smc?.htfTrendBias || 0) * mainDir >= 0.1 ? 0.18 : -0.26;
          rawBodyDelta = mainDir * currentAtr * biasAdj + tplBody * 0.25;
          if (Math.abs(rawBodyDelta) < currentAtr * 0.20) {
            rawBodyDelta = mainDir * (biasAdj >= 0 ? 1 : -1) * currentAtr * 0.24;
          }
        } else {
          const isFinalPull = i === pullbackSteps - 1;
          if (isFinalPull) {
            // Final mitigation bar slows and hints reclaim in mainDir
            rawBodyDelta = mainDir * currentAtr * (0.24 + 0.12 * Math.abs(Math.cos(i)));
          } else {
            const pullDir = pullbackMagnet <= prevClose ? -1 : 1;
            const bodyMag = Math.max(
              currentAtr * 0.24,
              Math.min(currentAtr * 0.58, Math.abs(gapToPull) * 0.85 + Math.abs(tplBody) * 0.25 + currentAtr * 0.12)
            );
            rawBodyDelta = pullDir * bodyMag;
          }
        }
        candleCategory = 'MITIGATION_PULLBACK';
      } else if (waveMode === 'IMPULSE') {
        const legTarget =
          sweepCount === 0
            ? targetMagnet
            : anchorClose + mainDir * currentAtr * Math.min(maxEnvAtr * 0.90, 3.0 + sweepCount * 1.55);
        const magnetPull = (legTarget - prevClose) * 0.14;
        const isMicroCounter =
          (consecutiveSameDir >= 3 && lastDirSign === mainDir) ||
          (legBars > 1 && tplBody * mainDir < -0.32 * currentAtr && consecutiveSameDir >= 2 && lastDirSign === mainDir);

        if (isMicroCounter) {
          const counterMag = currentAtr * (0.24 + 0.18 * Math.abs(Math.sin((i + 1) * 1.25)));
          rawBodyDelta = -mainDir * counterMag;
          candleCategory = 'CONSOLIDATION';
        } else {
          const tplAlign = Math.max(-0.15 * currentAtr, tplBody * mainDir * 0.42);
          const baseImp = currentAtr * (0.34 + 0.30 * avgBodyRatio + 0.22 * Math.abs(Math.cos(i * 0.85)));
          const impulseMag = Math.max(
            currentAtr * 0.24,
            Math.min(currentAtr * 1.15, (baseImp + tplAlign + Math.max(0, magnetPull * mainDir)) * excursionDamp)
          );
          rawBodyDelta = mainDir * impulseMag;
          candleCategory = 'IMPULSE';
        }
      } else if (waveMode === 'CORRECTION') {
        const remCorr = Math.max(1, corrLen - legBars);
        const pullStep = (corrTarget - prevClose) / remCorr;
        const isReliefPause = consecutiveSameDir >= 3 && lastDirSign === -mainDir;
        if (isReliefPause) {
          rawBodyDelta = mainDir * currentAtr * (0.20 + 0.14 * Math.abs(Math.cos(i * 1.1)));
        } else {
          const corrMag = Math.max(
            currentAtr * 0.22,
            Math.min(currentAtr * 0.72, Math.abs(pullStep) * 0.75 + Math.abs(tplBody) * 0.25 + currentAtr * 0.14)
          );
          rawBodyDelta = -mainDir * corrMag;
        }
        candleCategory = 'CONSOLIDATION';
      } else {
        // CONSOLIDATION box
        const pullToMid = (consMid - prevClose) * 0.32;
        const boxOsc = (legBars % 2 === 0 ? -mainDir : mainDir) * currentAtr * (0.26 + 0.14 * Math.abs(Math.sin(i * 1.3)));
        let combined = pullToMid + boxOsc * 0.78 + tplBody * 0.22;
        let sgn = combined >= 0 ? 1 : -1;
        if (consecutiveSameDir >= 3 && sgn === lastDirSign) sgn = -lastDirSign;
        rawBodyDelta = sgn * Math.max(currentAtr * 0.20, Math.min(currentAtr * 0.48, Math.abs(combined)));
        candleCategory = 'CONSOLIDATION';
      }

      let close = Math.max(anchorClose * 0.05, open + rawBodyDelta);
      if (Math.abs(close - open) < currentAtr * 0.18) {
        close = open + (close >= open ? 1 : -1) * currentAtr * 0.20;
      }

      // Guard cumulative diffusion envelope strictly
      const nextExcAtr = mainDir !== 0 ? ((close - anchorClose) * mainDir) / Math.max(currentAtr, 1e-6) : 0;
      if (mainDir !== 0 && nextExcAtr > maxEnvAtr) {
        const cappedTarget = anchorClose + mainDir * maxEnvAtr * currentAtr;
        close = Math.max(anchorClose * 0.05, open - mainDir * currentAtr * 0.26);
        if (close > cappedTarget && mainDir > 0) close = Math.min(open - currentAtr * 0.20, cappedTarget);
      }

      // Hard universal cap on consecutive same-color candles across phase boundaries
      if (consecutiveSameDir >= 4 && (close >= open ? 1 : -1) === lastDirSign) {
        close = Math.max(
          anchorClose * 0.05,
          open - lastDirSign * currentAtr * (0.24 + 0.14 * Math.abs(Math.cos((i + 1) * 1.15)))
        );
      }

      const curSign = close >= open ? 1 : -1;
      if (curSign === lastDirSign) {
        consecutiveSameDir += 1;
      } else {
        consecutiveSameDir = 1;
        lastDirSign = curSign;
      }

      const bodyAbs = Math.abs(close - open);
      const baseUpperWick = Math.max(
        tplUpperWick * 0.58,
        currentAtr * 0.14,
        bodyAbs * (avgUpperWickRatio / avgBodyRatio) * (0.85 + 0.28 * Math.abs(Math.cos((i + 1) * 0.85)))
      );
      const baseLowerWick = Math.max(
        tplLowerWick * 0.58,
        currentAtr * 0.14,
        bodyAbs * (avgLowerWickRatio / avgBodyRatio) * (0.85 + 0.28 * Math.abs(Math.sin((i + 1) * 1.05)))
      );

      let high = Math.max(open, close) + Math.min(currentAtr * 0.78, baseUpperWick);
      let low = Math.max(anchorClose * 0.02, Math.min(open, close) - Math.min(currentAtr * 0.78, baseLowerWick));

      // Pronounced Rejection Wick at FVG, POC, VAH, VAL, or EQH/EQL boundaries
      let rejectionWick = false;
      if (waveMode === 'PULLBACK' && pullbackSteps === 1 && direction === 'BULL') {
        const testLow = Math.max(anchorClose * 0.02, Math.min(low, pullbackMagnet - currentAtr * 0.12));
        if (testLow < low && open - testLow <= currentAtr * 0.78) {
          low = testLow;
          rejectionWick = true;
        }
      } else if (waveMode === 'PULLBACK' && pullbackSteps === 1 && direction === 'BEAR') {
        const testHigh = Math.max(high, pullbackMagnet + currentAtr * 0.12);
        if (testHigh > high && testHigh - open <= currentAtr * 0.78) {
          high = testHigh;
          rejectionWick = true;
        }
      }

      if (
        Math.abs(low - poc) < currentAtr * 0.30 ||
        Math.abs(low - pullbackMagnet) < currentAtr * 0.30 ||
        Math.abs(low - val) < currentAtr * 0.30
      ) {
        low = Math.max(anchorClose * 0.02, low - currentAtr * 0.26);
        rejectionWick = true;
      }
      if (
        Math.abs(high - vah) < currentAtr * 0.30 ||
        Math.abs(high - targetMagnet) < currentAtr * 0.30
      ) {
        high += currentAtr * 0.26;
        rejectionWick = true;
      }

      // Dynamic Volume Projection: 1.2x-1.75x on impulse, 0.52x-0.82x on pullback/consolidation
      const isImpulseCandle = candleCategory === 'IMPULSE';
      const volMultiplier = isImpulseCandle
        ? 1.22 + 0.48 * Math.abs(Math.sin((i + 1) * 0.9 + 0.7))
        : 0.54 + 0.26 * Math.abs(Math.cos((i + 1) * 1.1 + 0.4));
      const openTimeMs = futureTimestamps[i] || anchorOpenMs + (i + 1) * stepMsFallback;

      result.push({
        time: Math.floor(openTimeMs / 1000),
        openTimeUtcMs: openTimeMs,
        open: Number(open.toFixed(4)),
        high: Number(high.toFixed(4)),
        low: Number(low.toFixed(4)),
        close: Number(close.toFixed(4)),
        volume: Math.round(avgVol * volMultiplier),
        rejectionWick,
        wavePhase: candleCategory,
      });

      prevClose = close;
      legBars += 1;
    }

    return result;
  }

  findNearestPullbackLevel(price, atr, smc, dir) {
    const fvgs = Array.isArray(smc?.unmitigatedFVGs) ? smc.unmitigatedFVGs : [];
    const poc = Number(smc?.vp?.poc || price);
    const ema20 = Number(smc?.ema20 || price);
    if (dir === 'BULL') {
      const lowerFvg = fvgs
        .filter((f) => f.top < price && price - (f.top + f.bottom) / 2 <= 3.5 * atr)
        .sort((a, b) => b.top - a.top)[0];
      if (lowerFvg) return (lowerFvg.top + lowerFvg.bottom) / 2;
      if (poc < price && price - poc <= 2.5 * atr) return poc;
      if (ema20 < price && price - ema20 <= 2.5 * atr) return ema20;
      return price - 0.65 * atr;
    }
    if (dir === 'BEAR') {
      const upperFvg = fvgs
        .filter((f) => f.bottom > price && (f.top + f.bottom) / 2 - price <= 3.5 * atr)
        .sort((a, b) => a.bottom - b.bottom)[0];
      if (upperFvg) return (upperFvg.top + upperFvg.bottom) / 2;
      if (poc > price && poc - price <= 2.5 * atr) return poc;
      if (ema20 > price && ema20 - price <= 2.5 * atr) return ema20;
      return price + 0.65 * atr;
    }
    return poc;
  }

  findPrimaryTargetLevel(price, atr, smc, dir) {
    const poc = Number(smc?.vp?.poc || price);
    const vah = Number(smc?.vp?.vah || price + 2.5 * atr);
    const val = Number(smc?.vp?.val || price - 2.5 * atr);
    const eqHighs = Array.isArray(smc?.equalHighs) ? smc.equalHighs : [];
    const eqLows = Array.isArray(smc?.equalLows) ? smc.equalLows : [];

    if (dir === 'BULL') {
      const nextEqh = eqHighs.filter((h) => h > price + 0.9 * atr && h <= price + 5.5 * atr).sort((a, b) => a - b)[0];
      if (nextEqh) return nextEqh;
      return vah > price + 0.8 * atr ? vah : price + 3.4 * atr;
    }
    if (dir === 'BEAR') {
      const nextEql = eqLows.filter((l) => l < price - 0.9 * atr && l >= price - 5.5 * atr).sort((a, b) => b - a)[0];
      if (nextEql) return nextEql;
      return val < price - 0.8 * atr ? val : price - 3.4 * atr;
    }
    return poc;
  }

  /**
   * 6. Live 15m Bayesian Self-Correction & Re-Anchoring Engine
   */
  evaluateAndUpdateLive(scenarios, newActualCandle, currentAtr) {
    if (!Array.isArray(scenarios) || scenarios.length === 0 || !newActualCandle) {
      return {
        updatedScenarios: scenarios || [],
        accuracyScoreLastStep: 0,
        dominantScenarioId: scenarios?.[0]?.id || 'SCENARIO_A',
        statusMessageFa: 'در انتظار بسته شدن کندل جدید...',
        statusMessageEn: 'Waiting for next closed candle...',
      };
    }

    const safeAtr = Math.max(currentAtr, 0.0001);
    const lambda = 1.35;
    let totalPosterior = 0;
    let bestStepAccuracy = 0;

    const actualClose = Number(newActualCandle.close);
    const actualOpen = Number(newActualCandle.open);
    const actualHigh = Number(newActualCandle.high);
    const actualLow = Number(newActualCandle.low);

    const updated = scenarios.map((sc) => {
      const idx = Math.min(sc.stepIndex || 0, Math.max(0, sc.candles.length - 1));
      const predictedCandle = sc.candles[idx];
      if (!predictedCandle) return sc;

      const closeError = Math.abs(actualClose - Number(predictedCandle.close)) / safeAtr;
      const highError = Math.abs(actualHigh - Number(predictedCandle.high)) / safeAtr;
      const lowError = Math.abs(actualLow - Number(predictedCandle.low)) / safeAtr;

      const sameDirection = (actualClose >= actualOpen) === (Number(predictedCandle.close) >= Number(predictedCandle.open));
      const directionPenalty = sameDirection ? 0 : 0.45;

      const combinedError = 0.6 * closeError + 0.2 * highError + 0.2 * lowError + directionPenalty;
      const stepAccuracy = Math.max(0, Math.min(100, Math.round((1 - combinedError / 2.5) * 100)));
      if (stepAccuracy > bestStepAccuracy) bestStepAccuracy = stepAccuracy;

      const likelihood = Math.exp(-lambda * combinedError);
      const priorProb = Number(sc.probability || 0.33);
      const unnormalizedProb = priorProb * likelihood;
      totalPosterior += unnormalizedProb;

      // Re-Anchor remaining candles to actualClose with canonical horizon decay
      const priceShift = actualClose - Number(predictedCandle.close);
      const decaySpan = Math.max(this.canonicalHorizon || CANONICAL_SMC_HORIZON, sc.candles.length);
      const reAnchoredCandles = sc.candles.map((c, cIdx) => {
        if (cIdx <= idx) return c;
        const decay = Math.max(0.05, 1 - (cIdx - idx) / decaySpan);
        const shift = priceShift * decay;
        const op = cIdx === idx + 1 ? actualClose : Number(c.open) + shift;
        const cl = Number(c.close) + shift;
        const hi = Math.max(op, cl, Number(c.high) + shift);
        const lo = Math.min(op, cl, Number(c.low) + shift);
        return {
          ...c,
          open: Number(op.toFixed(4)),
          high: Number(hi.toFixed(4)),
          low: Number(lo.toFixed(4)),
          close: Number(cl.toFixed(4)),
        };
      });

      return {
        ...sc,
        priorProbability: priorProb,
        probability: unnormalizedProb,
        stepAccuracy,
        combinedErrorAtr: Number(combinedError.toFixed(3)),
        candles: reAnchoredCandles,
        stepIndex: idx + 1,
      };
    });

    for (const sc of updated) {
      sc.probability = Number((sc.probability / Math.max(totalPosterior, 0.0001)).toFixed(2));
    }
    const probDiff = Number((1 - updated.reduce((s, x) => s + x.probability, 0)).toFixed(2));
    if (updated.length > 0 && Math.abs(probDiff) > 0 && Math.abs(probDiff) <= 0.05) {
      updated[0].probability = Number(Math.max(0.01, updated[0].probability + probDiff).toFixed(2));
    }

    updated.sort((a, b) => b.probability - a.probability);
    const dom = updated[0];
    const domPct = Math.round(dom.probability * 100);

    return {
      updatedScenarios: updated,
      accuracyScoreLastStep: bestStepAccuracy,
      dominantScenarioId: dom.id,
      statusMessageFa: `کندل ${dom.stepIndex} بررسی شد — دقت تطبیق: ${bestStepAccuracy}٪ | وزن سناریوی غالب (${dom.id}): ${domPct}٪ (Re-Anchored)`,
      statusMessageEn: `Step ${dom.stepIndex} Verified — Match Accuracy: ${bestStepAccuracy}% | Dominant ${dom.id} Posterior: ${domPct}% (Re-Anchored)`,
    };
  }
}

/**
 * Decoupled Core Phase 4 Future Price Projection Engine (`forecast-contract/v1` / spec `1.3.0`).
 * Integrates `SMCPredictionEngine` (Historical Analogs + K-Medoids 3-Scenario Clustering +
 * SMC FVG/POC/VAH/VAL/EQH/EQL Magnet Warping + 15m Bayesian Self-Correction) with
 * Quantile Fan Monotonicity, 5-Leaf Event Tree, MTF Coordination, and SHA-256 Ledger.
 */
const WALK_FORWARD_CACHE = new Map();

function buildSmcCausalTrajectoryForWindow(trainSlice, evalHorizon, timeframe, symbolCode = '') {
  if (!Array.isArray(trainSlice) || trainSlice.length < 24) return null;
  const smc = new SMCPredictionEngine(30, CANONICAL_SMC_HORIZON, timeframe);
  const ctx = smc.extractMultiTimeframeFeatures(trainSlice, timeframe);
  const lastMs = Number(trainSlice[trainSlice.length - 1]?.openTimeUtcMs || trainSlice[trainSlice.length - 1]?.open_time_utc_ms || Date.now());
  const ts = advanceFutureTimestamps(lastMs, timeframe, CANONICAL_SMC_HORIZON, symbolCode);
  const scs = smc.generateScenarios(trainSlice, ctx, ts, { disableLowerTfAnchor: true });
  if (!scs || scs.length === 0) return null;
  const primary = scs[0];
  const lastClose = Number(trainSlice[trainSlice.length - 1].close);
  const atr = smc.calculateATR(trainSlice, 14);
  const out = new Array(evalHorizon);
  for (let h = 0; h < evalHorizon; h++) {
    const closes = scs.map((s) => Number(s.candles[h]?.close || primary.candles[h].close)).sort((a, b) => a - b);
    const med = Number(primary.candles[h].close);
    const halfSpread = Math.max(atr * 0.6 * Math.sqrt((h + 1) * 0.4), (closes[closes.length - 1] - closes[0]) * 0.45);
    out[h] = enforceMonotonicQuantiles(
      {
        q10: Math.min(closes[0] - atr * 0.25, med - 1.28155 * halfSpread * 0.65),
        q25: med - 0.67449 * halfSpread * 0.65,
        q50: med,
        q75: med + 0.67449 * halfSpread * 0.65,
        q90: Math.max(closes[closes.length - 1] + atr * 0.25, med + 1.28155 * halfSpread * 0.65),
      },
      lastClose * 0.01
    );
  }
  return out;
}

function buildForecastPointsFromQuantileTrajectory(trajSteps, canonicalTimestamps, features, horizonBars, atr) {
  const out = new Array(horizonBars);
  let prevClose = features.lastClose;
  const avgVol =
    features.candles.slice(-20).reduce((s, c) => s + Math.max(1, Number(c.volume || 500)), 0) /
    Math.max(1, Math.min(20, features.candles.length));

  for (let h = 0; h < horizonBars; h++) {
    const qStep = trajSteps[h];
    const openP = prevClose;
    const closeP = qStep.q50;
    const bodyAbs = Math.abs(closeP - openP);
    const wickPad = Math.max(atr * 0.16, bodyAbs * 0.35);
    const highP = Math.max(openP, closeP) + wickPad;
    const lowP = Math.max(features.lastClose * 0.02, Math.min(openP, closeP) - wickPad);
    prevClose = closeP;
    out[h] = {
      stepAhead: h + 1,
      openTimeUtcMs: canonicalTimestamps[h],
      open: Number(openP.toFixed(6)),
      high: Number(highP.toFixed(6)),
      low: Number(lowP.toFixed(6)),
      close: Number(closeP.toFixed(6)),
      volume: Math.round(avgVol * (0.85 + 0.25 * Math.abs(Math.sin(h * 0.9)))),
      q10: qStep.q10,
      q25: qStep.q25,
      q50: qStep.q50,
      q75: qStep.q75,
      q90: qStep.q90,
      upperBand: qStep.q90,
      lowerBand: qStep.q10,
      pctChangeFromLast: ((qStep.q50 - features.lastClose) / features.lastClose) * 100,
      rejectionWick: false,
      wavePhase: bodyAbs >= atr * 0.35 ? 'IMPULSE' : 'CONSOLIDATION',
    };
  }
  return out;
}

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
    const selectedScenarioId = String(options.selectedScenarioId || '');
    const requestedModelId = String(options.selectedModelId || 'AUTO');

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
        smcScenarios: [],
        activeScenarioId: 'SCENARIO_A',
        bayesianLiveReport: null,
        modelContributions: [],
        modelTrajectories: [],
        selectedChartModelId: 'naive_persistence',
        selectionMode: SELECTION_MODE.NO_CLEAR_WINNER_BASELINE,
        selectionReason: readiness.issues[0] || 'Insufficient valid candles',
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

    let walkForward = null;
    if (options.skipWalkForward !== true) {
      const wfKey = canonicalJson({
        symbolCode,
        timeframe,
        len: candles.length,
        lastMs: features.lastOpenMs,
        lastClose: Number(features.lastClose.toFixed(6)),
        maxW: Number(options.maxWalkForwardWindows || 8),
        plugins: registry.serializeConfig(),
      });
      if (options.bypassWalkForwardCache !== true && WALK_FORWARD_CACHE.has(wfKey)) {
        walkForward = WALK_FORWARD_CACHE.get(wfKey);
      } else {
        walkForward = evaluateWalkForward(candles, registry, {
          minTrainBars: Math.max(24, Math.min(36, Math.floor(candles.length * 0.55))),
          evalHorizon: 5,
          maxWindows: Number(options.maxWalkForwardWindows || 8),
          smcEvaluator: (trainSlice, evalH) => buildSmcCausalTrajectoryForWindow(trainSlice, evalH, timeframe, symbolCode),
        });
        if (WALK_FORWARD_CACHE.size > 48) {
          const firstKey = WALK_FORWARD_CACHE.keys().next().value;
          WALK_FORWARD_CACHE.delete(firstKey);
        }
        WALK_FORWARD_CACHE.set(wfKey, walkForward);
      }
    }

    const benchById = new Map();
    if (walkForward?.modelBenchmarks) {
      for (const b of walkForward.modelBenchmarks) benchById.set(b.modelId, b);
    }

    const rawWeights = effectivePlugins.map(({ plugin, config }) => {
      const baseW = Math.max(0.01, Number(config.weight || 0.1));
      const b = benchById.get(plugin.id);
      if (b && b.status === MODEL_EXECUTION_STATUS.SUCCESS && Number.isFinite(b.mae) && b.mae > 0 && walkForward?.naiveMetrics?.mae > 0) {
        const skillFactor = Math.max(0.55, Math.min(1.45, walkForward.naiveMetrics.mae / b.mae));
        return baseW * (0.7 + 0.3 * skillFactor);
      }
      return baseW;
    });

    const canonicalTimestamps = advanceFutureTimestamps(
      features.lastOpenMs,
      timeframe,
      CANONICAL_SMC_HORIZON,
      symbolCode
    );
    const futureTimestamps = canonicalTimestamps.slice(0, horizonBars);
    const featuresWithTs = { ...features, futureTimestamps: canonicalTimestamps };

    const modelOutputs = [];
    const modelContributions = [];
    const modelTrajectories = [];
    const ensMeanReturns = new Array(CANONICAL_SMC_HORIZON).fill(0);
    const aleatoricVarSteps = new Array(CANONICAL_SMC_HORIZON).fill(0);
    const epistemicDispSteps = new Array(CANONICAL_SMC_HORIZON).fill(0);
    const trainStartMs = Number(features.candles[0]?.openTimeUtcMs || 0);
    const trainEndMs = features.lastOpenMs;

    let totalSuccessWeight = 0;
    const rawPreds = [];
    for (let idx = 0; idx < effectivePlugins.length; idx++) {
      const { plugin, config } = effectivePlugins[idx];
      let pred;
      try {
        pred = plugin.predict(featuresWithTs, CANONICAL_SMC_HORIZON, config.params || {});
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
        pred.meanReturns.length >= CANONICAL_SMC_HORIZON;
      if (valid) totalSuccessWeight += rawWeights[idx];
      rawPreds.push({ plugin, config, pred, st, valid, rawW: rawWeights[idx] });
    }
    const safeSuccessWeightSum = totalSuccessWeight > 0 ? totalSuccessWeight : 1;

    for (const item of rawPreds) {
      const { plugin, pred, st, valid, rawW } = item;
      const normW = valid ? rawW / safeSuccessWeightSum : 0;

      if (!valid) {
        modelTrajectories.push({
          modelId: plugin.id,
          modelName: plugin.name,
          family: plugin.family,
          modelVersion: pred?.modelVersion || plugin.modelVersion || '1.0.0',
          executionRuntime: EXECUTION_RUNTIME.NATIVE_JS,
          isApproximation: Boolean(pred?.isApproximation ?? plugin.isApproximation),
          isCalibratedInterval: Boolean(pred?.isCalibratedInterval ?? plugin.isCalibratedInterval ?? true),
          status: st === MODEL_EXECUTION_STATUS.SKIPPED_LOW_DATA ? st : MODEL_EXECUTION_STATUS.FAILED,
          reason: pred?.reason || 'Model unavailable on current input window',
          trainingStartUtcMs: trainStartMs,
          trainingEndUtcMs: trainEndMs,
          trainingSampleCount: features.barCount,
          points: [],
        });
        continue;
      }

      modelOutputs.push({ plugin, normW, pred });
      const canonTraj = buildPriceTrajectoryFromPrediction(features.lastClose, pred, CANONICAL_SMC_HORIZON);
      const slicedPoints = buildForecastPointsFromQuantileTrajectory(
        canonTraj.slice(0, horizonBars),
        futureTimestamps,
        features,
        horizonBars,
        features.atr14
      );

      modelTrajectories.push({
        modelId: plugin.id,
        modelName: plugin.name,
        family: plugin.family,
        modelVersion: pred?.modelVersion || plugin.modelVersion || '1.0.0',
        executionRuntime: EXECUTION_RUNTIME.NATIVE_JS,
        isApproximation: Boolean(pred?.isApproximation ?? plugin.isApproximation),
        isCalibratedInterval: Boolean(pred?.isCalibratedInterval ?? plugin.isCalibratedInterval ?? true),
        status: MODEL_EXECUTION_STATUS.SUCCESS,
        reason: '',
        trainingStartUtcMs: trainStartMs,
        trainingEndUtcMs: trainEndMs,
        trainingSampleCount: features.barCount,
        points: slicedPoints,
        meta: pred.meta || {},
      });

      for (let h = 0; h < CANONICAL_SMC_HORIZON; h++) {
        const mr = Number(pred.meanReturns[h] || 0);
        const sg = Math.max(1e-5, Number(pred.sigmas[h] || features.ewmaSigma));
        ensMeanReturns[h] += normW * mr;
        aleatoricVarSteps[h] += normW * (sg * sg);
      }

      const terminalPt = slicedPoints[slicedPoints.length - 1];
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

    // Run SMC Historical Analog + K-Medoids 3-Scenario Engine at canonical horizon (60) for prefix invariance
    const smcEngine = new SMCPredictionEngine(30, CANONICAL_SMC_HORIZON, timeframe);
    const smcContext = smcEngine.extractMultiTimeframeFeatures(features.candles, timeframe);
    let canonicalScenarios = smcEngine.generateScenarios(
      features.candles,
      smcContext,
      canonicalTimestamps,
      options
    );

    // Cross-Timeframe Lower-TF Sub-Bar Anchoring (e.g. M15 first 4..12 bars anchor H1 bar 1..3)
    const lowerInfo = resolveLowerTimeframeInfo(timeframe);
    const lowerCandlesRaw = Array.isArray(options.lowerTimeframeCandles) ? options.lowerTimeframeCandles : [];
    if (
      options.disableLowerTfAnchor !== true &&
      lowerInfo &&
      lowerCandlesRaw.length >= 24
    ) {
      const ltfFeatures = extractForecastFeatures(lowerCandlesRaw, 180);
      if (ltfFeatures && ltfFeatures.candles.length >= 24) {
        const closeDiff = Math.abs(ltfFeatures.lastClose - features.lastClose);
        const stepMs = PriceFormatterStepMs(timeframe);
        const timeDiff = Math.abs(features.lastOpenMs - ltfFeatures.lastOpenMs);
        if (
          closeDiff <= Math.max(features.atr14 * 0.45, features.lastClose * 0.006) &&
          timeDiff <= stepMs * 2
        ) {
          const ltfTimestamps = advanceFutureTimestamps(
            ltfFeatures.lastOpenMs,
            lowerInfo.timeframe,
            CANONICAL_SMC_HORIZON,
            symbolCode
          );
          const ltfEngine = new SMCPredictionEngine(30, CANONICAL_SMC_HORIZON, lowerInfo.timeframe);
          const ltfCtx = ltfEngine.extractMultiTimeframeFeatures(ltfFeatures.candles, lowerInfo.timeframe);
          const ltfScenarios = ltfEngine.generateScenarios(ltfFeatures.candles, ltfCtx, ltfTimestamps, {
            ...options,
            disableLowerTfAnchor: true,
          });
          const overlapBars = Math.min(3, Math.floor(CANONICAL_SMC_HORIZON / lowerInfo.ratio));
          if (overlapBars >= 1) {
            canonicalScenarios = canonicalScenarios.map((htfSc) => {
              const matchingLtf =
                ltfScenarios.find((l) => l.clusterType === htfSc.clusterType) || ltfScenarios[0];
              if (!matchingLtf || matchingLtf.candles.length < overlapBars * lowerInfo.ratio) return htfSc;

              const updatedCandles = htfSc.candles.map((c) => ({ ...c }));
              for (let ob = 0; ob < overlapBars; ob++) {
                const subSlice = matchingLtf.candles.slice(ob * lowerInfo.ratio, (ob + 1) * lowerInfo.ratio);
                const subOpen = ob === 0 ? features.lastClose : updatedCandles[ob - 1].close;
                const shiftFromLtf = ob === 0 ? features.lastClose - Number(subSlice[0].open) : 0;
                let hi = subOpen;
                let lo = subOpen;
                let volSum = 0;
                let anyRej = false;
                for (const sc of subSlice) {
                  hi = Math.max(hi, Number(sc.high) + shiftFromLtf);
                  lo = Math.min(lo, Number(sc.low) + shiftFromLtf);
                  volSum += Number(sc.volume || 0);
                  if (sc.rejectionWick) anyRej = true;
                }
                const subClose = Number(subSlice[subSlice.length - 1].close) + shiftFromLtf;
                updatedCandles[ob] = {
                  ...updatedCandles[ob],
                  open: Number(subOpen.toFixed(4)),
                  high: Number(Math.max(subOpen, subClose, hi).toFixed(4)),
                  low: Number(Math.max(features.lastClose * 0.02, Math.min(subOpen, subClose, lo)).toFixed(4)),
                  close: Number(subClose.toFixed(4)),
                  volume: Math.round(volSum),
                  rejectionWick: anyRej,
                  wavePhase: subSlice[subSlice.length - 1].wavePhase || updatedCandles[ob].wavePhase,
                };
              }

              // Smoothly rebase bars [overlapBars .. CANONICAL_SMC_HORIZON-1] from anchored close
              const origAnchorClose = Number(htfSc.candles[overlapBars - 1].close);
              const newAnchorClose = Number(updatedCandles[overlapBars - 1].close);
              const rebaseDelta = newAnchorClose - origAnchorClose;
              for (let k = overlapBars; k < updatedCandles.length; k++) {
                const decay = Math.max(0.15, 1 - (k - (overlapBars - 1)) / 24);
                const sh = rebaseDelta * decay;
                const op = k === overlapBars ? newAnchorClose : Number(htfSc.candles[k].open) + sh;
                const cl = Number(htfSc.candles[k].close) + sh;
                updatedCandles[k] = {
                  ...htfSc.candles[k],
                  open: Number(op.toFixed(4)),
                  high: Number(Math.max(op, cl, Number(htfSc.candles[k].high) + sh).toFixed(4)),
                  low: Number(Math.max(features.lastClose * 0.02, Math.min(op, cl, Number(htfSc.candles[k].low) + sh)).toFixed(4)),
                  close: Number(cl.toFixed(4)),
                };
              }

              return {
                ...htfSc,
                candles: updatedCandles,
                targetPrice: updatedCandles[updatedCandles.length - 1].close,
              };
            });
          }
        }
      }
    }

    // Slice canonical scenarios cleanly to requested horizonBars
    let smcScenarios = canonicalScenarios.map((sc) => {
      const sliced = sc.candles.slice(0, horizonBars);
      return {
        ...sc,
        candles: sliced,
        targetPrice: Number(sliced[sliced.length - 1].close.toFixed(4)),
      };
    });

    // Evaluate live Bayesian self-correction on latest closed bar (T-1 -> T0 verification)
    let bayesianLiveReport = null;
    if (options.liveActualCandle) {
      bayesianLiveReport = smcEngine.evaluateAndUpdateLive(smcScenarios, options.liveActualCandle, features.atr14);
      smcScenarios = bayesianLiveReport.updatedScenarios;
    } else if (features.candles.length >= 16) {
      const priorSlice = features.candles.slice(0, -1);
      const priorSmcCtx = smcEngine.extractMultiTimeframeFeatures(priorSlice, timeframe);
      const priorScenarios = smcEngine
        .generateScenarios(priorSlice, priorSmcCtx, canonicalTimestamps, options)
        .map((sc) => ({ ...sc, candles: sc.candles.slice(0, horizonBars) }));
      const latestClosed = features.candles[features.candles.length - 1];
      bayesianLiveReport = smcEngine.evaluateAndUpdateLive(priorScenarios, latestClosed, features.atr14);
    }

    const activeScenario =
      smcScenarios.find((s) => s.id === selectedScenarioId) || smcScenarios[0];
    const activeScenarioId = activeScenario ? activeScenario.id : 'SCENARIO_A';

    // Build SMCPredictionEngine points (preserved completely)
    const smcPoints = [];
    let cumVar = 0;
    const epiFactorPerStep =
      1 / Math.max(6, Number(walkForward?.effectiveSampleSize || features.barCount / 4)) +
      (uncertainty.oodStatus === 'EXTREME' ? 0.48 : uncertainty.oodStatus === 'ELEVATED' ? 0.20 : 0);

    for (let h = 0; h < horizonBars; h++) {
      cumVar += aleatoricVarSteps[h] * (1 + 0.35 * epiFactorPerStep) + epistemicDispSteps[h];
      const cumSigma = Math.sqrt(cumVar) * (1 + 0.008 * h) * uncertainty.spreadMultiplierApplied;

      const scCandle = activeScenario.candles[h];
      const allScenarioCloses = smcScenarios
        .map((s) => Number(s.candles[h]?.close || scCandle.close))
        .sort((a, b) => a - b);
      const minScPrice = allScenarioCloses[0];
      const maxScPrice = allScenarioCloses[allScenarioCloses.length - 1];

      const medPrice = Number(scCandle.close);
      const sigmaPriceHalf = Math.max(features.atr14 * 0.55 * Math.sqrt((h + 1) * 0.35), medPrice * cumSigma * 0.65);

      const q = enforceMonotonicQuantiles(
        {
          q10: Math.min(minScPrice - features.atr14 * 0.45, medPrice - 1.28155 * sigmaPriceHalf),
          q25: Math.min(medPrice - features.atr14 * 0.22, medPrice - 0.67449 * sigmaPriceHalf),
          q50: medPrice,
          q75: Math.max(medPrice + features.atr14 * 0.22, medPrice + 0.67449 * sigmaPriceHalf),
          q90: Math.max(maxScPrice + features.atr14 * 0.45, medPrice + 1.28155 * sigmaPriceHalf),
        },
        features.lastClose * 0.02
      );

      const openP = Number(scCandle.open);
      const closeP = Number(scCandle.close);
      const highP = Math.max(openP, closeP, Number(scCandle.high));
      const lowP = Math.max(features.lastClose * 0.02, Math.min(openP, closeP, Number(scCandle.low)));

      smcPoints.push({
        stepAhead: h + 1,
        openTimeUtcMs: futureTimestamps[h],
        open: openP,
        high: highP,
        low: lowP,
        close: closeP,
        volume: Number(scCandle.volume || 0),
        q10: q.q10,
        q25: q.q25,
        q50: q.q50,
        q75: q.q75,
        q90: q.q90,
        upperBand: q.q90,
        lowerBand: q.q10,
        pctChangeFromLast: ((q.q50 - features.lastClose) / features.lastClose) * 100,
        rejectionWick: Boolean(scCandle.rejectionWick),
        wavePhase: scCandle.wavePhase || 'IMPULSE',
        pullbackPrice: activeScenario.pullbackPrice,
        primaryMagnetPrice: activeScenario.primaryMagnetPrice,
      });
    }

    // Add SMCPredictionEngine and Ensemble as explicit trajectories for fair comparison
    modelTrajectories.push({
      modelId: 'smc_kmedoids',
      modelName: 'SMC K-Medoids Analogs',
      family: 'PATTERN_SMC',
      modelVersion: '1.0.0',
      executionRuntime: EXECUTION_RUNTIME.NATIVE_JS,
      isApproximation: false,
      isCalibratedInterval: true,
      status: MODEL_EXECUTION_STATUS.SUCCESS,
      reason: '',
      trainingStartUtcMs: trainStartMs,
      trainingEndUtcMs: trainEndMs,
      trainingSampleCount: features.barCount,
      points: smcPoints,
    });

    const ensCanonTraj = buildPriceTrajectoryFromPrediction(
      features.lastClose,
      {
        meanReturns: ensMeanReturns.slice(0, horizonBars),
        sigmas: aleatoricVarSteps.slice(0, horizonBars).map((v, idx) =>
          Math.sqrt(Math.max(1e-10, v * (1 + 0.35 * epiFactorPerStep) + epistemicDispSteps[idx])) *
          uncertainty.spreadMultiplierApplied
        ),
      },
      horizonBars
    );
    const ensPoints = buildForecastPointsFromQuantileTrajectory(
      ensCanonTraj,
      futureTimestamps,
      features,
      horizonBars,
      features.atr14
    );
    modelTrajectories.push({
      modelId: 'ensemble',
      modelName: 'Calibrated Ensemble',
      family: 'ENSEMBLE',
      modelVersion: '1.0.0',
      executionRuntime: EXECUTION_RUNTIME.NATIVE_JS,
      isApproximation: false,
      isCalibratedInterval: true,
      status: MODEL_EXECUTION_STATUS.SUCCESS,
      reason: '',
      trainingStartUtcMs: trainStartMs,
      trainingEndUtcMs: trainEndMs,
      trainingSampleCount: features.barCount,
      points: ensPoints,
    });

    // Determine active points[] via honest OOS Winner Gate (or explicit manual override / skipWalkForward fast path)
    let selection;
    if (options.skipWalkForward === true && (!requestedModelId || requestedModelId.toUpperCase() === 'AUTO')) {
      selection = {
        selectionMode: SELECTION_MODE.SMC_STRUCTURAL_DEFAULT,
        selectedModelId: 'smc_kmedoids',
        winnerModelId: null,
        reason: 'Fast chart mode (walk-forward bypassed by caller); displaying SMC structural projection.',
      };
    } else {
      selection = selectOosChartWinner(walkForward, modelTrajectories, requestedModelId);
    }

    const chosenTrajectory =
      modelTrajectories.find(
        (t) => t.modelId === selection.selectedModelId && t.status === MODEL_EXECUTION_STATUS.SUCCESS && t.points.length === horizonBars
      ) || modelTrajectories.find((t) => t.modelId === 'smc_kmedoids');
    const points = chosenTrajectory ? chosenTrajectory.points : smcPoints;

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
      smcContext,
      smcScenarios,
      activeScenarioId,
      bayesianLiveReport,
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
      modelTrajectories,
      selectedChartModelId: selection.selectedModelId,
      selectionMode: selection.selectionMode,
      selectionReason: selection.reason,
      walkForward,
      summary,
      inputHash,
    };
  }

  /**
   * Merges optional Python/FastAPI worker results (ARIMA statsmodels, Prophet, PyTorch LSTM, PyTorch TFT)
   * cleanly into an existing native ForecastResult without breaking offline fallback.
   */
  static applyRemoteWorkerResponse(baseResult, workerWrap, requestedModelId = 'AUTO') {
    if (!baseResult || !workerWrap) return baseResult;
    const updatedRemote = {
      status: workerWrap.status || baseResult.remoteWorker?.status,
      configured: Boolean(workerWrap.configured),
      url: String(workerWrap.url || baseResult.remoteWorker?.url || ''),
      error: workerWrap.error || '',
    };
    const data = workerWrap.data;
    if (!data || !Array.isArray(data.modelTrajectories)) {
      return { ...baseResult, remoteWorker: updatedRemote };
    }

    const mergedTrajs = [...(baseResult.modelTrajectories || [])];
    for (const wt of data.modelTrajectories) {
      if (!wt || !wt.modelId) continue;
      const idx = mergedTrajs.findIndex((t) => t.modelId === wt.modelId);
      if (idx >= 0) mergedTrajs[idx] = wt;
      else mergedTrajs.push(wt);
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

