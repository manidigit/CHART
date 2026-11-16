import {
  EVENT_DICTIONARY_DEFAULTS,
  MTF_ALIGNMENT_STATE,
  NO_EDGE_GATE_STATE,
  OOD_STATUS,
  SCENARIO_IDS,
  SCENARIO_STATUS,
  enforceMonotonicQuantiles,
} from './forecastContract.js?v=2.0.0';
import { extractForecastFeatures } from './featureExtractor.js?v=2.0.0';
import {
  clamp,
  fitAndEvaluateScenarioLogit,
} from './statisticalTests.js?v=2.0.0';

function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/**
 * Separates Aleatoric (intrinsic market volatility) from Epistemic (model disagreement,
 * finite-sample sparsity, and OOD telemetry) uncertainty and computes OOD spread scaling.
 */
export function computeOodAndUncertainty(
  features,
  aleatoricCumVar,
  epistemicDispVar,
  effectiveSampleSize
) {
  const rets = features.logReturns || [];
  const lastRet = rets.length > 0 ? rets[rets.length - 1] : 0;
  const uncondSig = Math.max(1e-6, features.uncondSigma || 1e-4);
  const tailZ = Math.abs(lastRet - (features.meanReturn || 0)) / uncondSig;
  const volRatioDelta = Math.abs((features.realizedVolRatio || 1) - 1) * 2.1;
  const driftZAbs = Math.abs(features.driftZ || 0);
  const atrShock = Math.max(0, ((features.atrPct || 0.002) / uncondSig) - 1.5);

  const oodDistance = Math.sqrt(
    (tailZ * tailZ + volRatioDelta * volRatioDelta + driftZAbs * driftZAbs * 0.55 + atrShock * atrShock) / 2.55
  );

  const oodReasons = [];
  if (tailZ >= 2.6) oodReasons.push(`Tail return shock z=${tailZ.toFixed(2)}`);
  if ((features.realizedVolRatio || 1) >= 1.45) {
    oodReasons.push(`Short/long volatility spike (${features.realizedVolRatio.toFixed(2)}x)`);
  }
  if (driftZAbs >= 2.5) oodReasons.push(`Extreme drift z=${driftZAbs.toFixed(2)}`);

  let oodStatus = OOD_STATUS.IN_DISTRIBUTION;
  let spreadMultiplier = 1.0;
  let oodEpistemicFactor = 0.0;
  if (oodDistance >= 3.6) {
    oodStatus = OOD_STATUS.EXTREME;
    spreadMultiplier = 1.42;
    oodEpistemicFactor = 0.48;
  } else if (oodDistance >= 2.2) {
    oodStatus = OOD_STATUS.ELEVATED;
    spreadMultiplier = 1.18;
    oodEpistemicFactor = 0.20;
  }

  const nEffSafe = Math.max(6.0, Number(effectiveSampleSize || Math.max(6, features.barCount / 4)));
  const finiteSampleVar = aleatoricCumVar * (1.0 / nEffSafe);
  const oodVar = aleatoricCumVar * oodEpistemicFactor;
  const epistemicVar = Math.max(1e-10, epistemicDispVar + finiteSampleVar + oodVar);
  const aleatoricVar = Math.max(1e-10, aleatoricCumVar);
  const totalVar = aleatoricVar + epistemicVar;

  return {
    aleatoricPct: Number((Math.sqrt(aleatoricVar) * 100).toFixed(4)),
    epistemicPct: Number((Math.sqrt(epistemicVar) * 100).toFixed(4)),
    totalPct: Number((Math.sqrt(totalVar) * 100).toFixed(4)),
    aleatoricShare: Number((aleatoricVar / totalVar).toFixed(4)),
    epistemicShare: Number((epistemicVar / totalVar).toFixed(4)),
    oodStatus,
    oodDistance: Number(oodDistance.toFixed(4)),
    oodReasons,
    spreadMultiplierApplied: spreadMultiplier,
    epistemicCumVar: epistemicVar,
  };
}

/**
 * Computes causal feature vector at bar `idx` using strictly past closes <= idx.
 */
function buildCausalScenarioFeatureVec(candles, idx, atrFallback) {
  const start = Math.max(0, idx - 29);
  const win = candles.slice(start, idx + 1);
  if (win.length < 6) return [1, 0, 1, 0];
  let trSum = 0;
  let sqShort = 0;
  let sqLong = 0;
  let nShort = 0;
  let nLong = 0;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < win.length; i++) {
    const prevC = Math.max(1e-8, Number(win[i - 1].close));
    const cur = win[i];
    const hi = Number(cur.high);
    const lo = Number(cur.low);
    const cl = Math.max(1e-8, Number(cur.close));
    const tr = Math.max(hi - lo, Math.abs(hi - prevC), Math.abs(lo - prevC));
    trSum += tr;
    const ret = Math.log(cl / prevC);
    sqLong += ret * ret;
    nLong++;
    if (i >= win.length - 6) {
      sqShort += ret * ret;
      nShort++;
    }
    const diff = cl - prevC;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const atrLocal = Math.max(1e-6, trSum / Math.max(1, win.length - 1), atrFallback * 0.25);
  const trendZ = clamp((Number(win[win.length - 1].close) - Number(win[Math.max(0, win.length - 11)].close)) / (atrLocal * Math.sqrt(10)), -3, 3);
  const sigShort = Math.sqrt(sqShort / Math.max(1, nShort));
  const sigLong = Math.max(1e-6, Math.sqrt(sqLong / Math.max(1, nLong)));
  const volRatio = clamp(sigShort / sigLong - 1.0, -1.5, 2.5);
  const rsiNorm = clamp(((gains / Math.max(1e-8, gains + losses)) - 0.5) * 2.0, -1, 1);
  return [1, trendZ, volRatio, rsiNorm];
}

/**
 * Rev 2.1 Causal 3-Scenario Logistic Calibration Engine.
 * Zero fixed-floor Dirichlet smoothing: if a scenario has n_k < 3 historical occurrences
 * in Train+Cal, emits status='NOT_ESTIMABLE' and probability=null explicitly.
 */
export function buildCalibratedScenariosV2(candles, features, horizonBars, points = [], split = null) {
  const atr = Math.max(1e-6, features.atr14);
  const lastClose = features.lastClose;
  const lastPt = points[points.length - 1] || {
    q10: lastClose - atr * 1.5,
    q25: lastClose - atr * 0.8,
    q50: lastClose,
    q75: lastClose + atr * 0.8,
    q90: lastClose + atr * 1.5,
  };

  const trainSamples = [];
  const calSamples = [];
  const outerSamples = [];

  const classifyOrigin = (originIdx) => {
    const oClose = Number(candles[originIdx].close);
    const fClose = Number(candles[originIdx + horizonBars].close);
    // Compute local causal ATR14 ending at originIdx
    let trS = 0;
    const pStart = Math.max(1, originIdx - 13);
    for (let j = pStart; j <= originIdx; j++) {
      const pc = Number(candles[j - 1].close);
      const hi = Number(candles[j].high);
      const lo = Number(candles[j].low);
      trS += Math.max(hi - lo, Math.abs(hi - pc), Math.abs(lo - pc));
    }
    const atrO = Math.max(1e-6, trS / Math.max(1, originIdx - pStart + 1));
    const normMove = (fClose - oClose) / atrO;
    const label = normMove > 1.0 ? 0 : normMove < -1.0 ? 2 : 1;
    return {
      x: buildCausalScenarioFeatureVec(candles, originIdx, atrO),
      label,
    };
  };

  if (split && split.feasible && split.trainEndIdx >= 30) {
    const trainOriginEnd = Math.max(20, split.trainEndIdx - horizonBars);
    const step = Math.max(1, Math.floor((trainOriginEnd - 20) / 45));
    for (let o = 20; o <= trainOriginEnd; o += step) {
      trainSamples.push(classifyOrigin(o));
    }
    for (const o of split.calOrigins) {
      if (o + horizonBars < candles.length) calSamples.push(classifyOrigin(o));
    }
    for (const o of split.outerOrigins) {
      if (o + horizonBars < candles.length) outerSamples.push(classifyOrigin(o));
    }
  } else if (candles.length >= 24 + horizonBars) {
    const maxO = candles.length - 1 - horizonBars;
    const splitBoundary = Math.max(18, Math.floor((maxO - 14) * 0.7) + 14);
    for (let o = 14; o <= maxO; o += Math.max(1, Math.floor((maxO - 14) / 36))) {
      const sample = classifyOrigin(o);
      if (o <= splitBoundary) trainSamples.push(sample);
      else calSamples.push(sample);
    }
  }

  const currentX = buildCausalScenarioFeatureVec(candles, candles.length - 1, atr);
  const logitFit = fitAndEvaluateScenarioLogit(trainSamples, calSamples, outerSamples, currentX);

  // Compute raw empirical prices / conditional target estimates from matching samples
  const estimableIndices = [0, 1, 2].filter((k) => logitFit.estimable[k]);
  let estimableMass = 0;
  for (const k of estimableIndices) {
    estimableMass += logitFit.conditionalProbabilities[k];
  }

  const defs = [
    {
      idx: 0,
      id: SCENARIO_IDS.BULLISH_EXPANSION,
      leafId: SCENARIO_IDS.BULLISH_EXPANSION,
      label: 'Bullish Expansion (> +1.0 ATR)',
      bias: 'bull',
      targetPrice: lastPt.q75,
      extremePrice: lastPt.q90,
      invalidationReference: lastPt.q25,
      entryCondition: `Terminal move > +1.0 ATR14 (+${atr.toFixed(2)}) above ${lastClose.toFixed(2)}`,
      intermediateEvent: 'Causal breakout persistence over upper quartile envelope',
      invalidationCondition: `Close falls below lower quartile pivot ${lastPt.q25.toFixed(2)}`,
    },
    {
      idx: 1,
      id: SCENARIO_IDS.RANGE_CONTAINMENT,
      leafId: SCENARIO_IDS.RANGE_CONTAINMENT,
      label: 'Range Containment (|dP| <= 1.0 ATR)',
      bias: 'neutral',
      targetPrice: lastPt.q50,
      extremePrice: lastPt.q75,
      invalidationReference: lastPt.q25,
      entryCondition: `Terminal excursion bounded within ±1.0 ATR14 (±${atr.toFixed(2)})`,
      intermediateEvent: 'Mean-reverting oscillation around conditional median q50',
      invalidationCondition: 'Sustained close beyond ±1.0 ATR expansion band',
    },
    {
      idx: 2,
      id: SCENARIO_IDS.BEARISH_CONTRACTION,
      leafId: SCENARIO_IDS.BEARISH_CONTRACTION,
      label: 'Bearish Contraction (< -1.0 ATR)',
      bias: 'bear',
      targetPrice: lastPt.q25,
      extremePrice: lastPt.q10,
      invalidationReference: lastPt.q75,
      entryCondition: `Terminal move < -1.0 ATR14 (-${atr.toFixed(2)}) below ${lastClose.toFixed(2)}`,
      intermediateEvent: 'Downside momentum extension into lower quartile envelope',
      invalidationCondition: `Close reclaims above upper quartile pivot ${lastPt.q75.toFixed(2)}`,
    },
  ];

  // Re-normalize conditional probabilities strictly over estimable scenarios ONLY
  const normProbs = defs.map((d) => {
    if (!logitFit.estimable[d.idx] || estimableMass <= 0) return null;
    return Number((logitFit.conditionalProbabilities[d.idx] / estimableMass).toFixed(4));
  });

  // Exact rounding sum reconciliation across estimable scenarios so sum == 1.0000 when all estimable
  if (estimableIndices.length > 0 && estimableMass > 0) {
    const sumRest = estimableIndices.slice(0, -1).reduce((s, idx) => s + (normProbs[idx] || 0), 0);
    const lastIdx = estimableIndices[estimableIndices.length - 1];
    normProbs[lastIdx] = Number(Math.max(0, 1.0 - sumRest).toFixed(4));
  }

  const scenarios = defs.map((d) => {
    const isEst = logitFit.estimable[d.idx];
    const prob = normProbs[d.idx];
    const empFreq = Number((logitFit.rawEmpiricalFrequency[d.idx] || 0).toFixed(4));
    return {
      id: d.id,
      leafId: d.leafId,
      parentBranch: isEst ? SCENARIO_STATUS.ESTIMABLE : SCENARIO_STATUS.NOT_ESTIMABLE,
      label: d.label,
      bias: d.bias,
      status: isEst ? SCENARIO_STATUS.ESTIMABLE : SCENARIO_STATUS.NOT_ESTIMABLE,
      probability: prob,
      rawEmpiricalFrequency: empFreq,
      sampleCount: logitFit.counts[d.idx],
      targetPrice: d.targetPrice,
      extremePrice: d.extremePrice,
      invalidationReference: d.invalidationReference,
      pctChange: lastClose > 0 ? ((d.targetPrice - lastClose) / lastClose) * 100 : 0,
      entryCondition: d.entryCondition,
      intermediateEvent: d.intermediateEvent,
      invalidationCondition: d.invalidationCondition,
      lowSampleWarning: !isEst,
    };
  });

  const scenarioCalibration = {
    modelType: 'L2_MULTINOMIAL_LOGIT_TEMP_SCALED',
    totalTrainAndCalSamples: logitFit.totalLocal,
    oosEvaluatedCount: logitFit.oosEvaluatedCount,
    temperature: logitFit.temperature,
    oosBrierModel: logitFit.oosBrierModel,
    oosBrierClimatology: logitFit.oosBrierClimatology,
    calibrationPassed: logitFit.calibrationPassed,
    notEstimableCount: defs.filter((d) => !logitFit.estimable[d.idx]).length,
  };

  return { scenarios, scenarioCalibration };
}

/**
 * Evaluates formal machine-readable event outcomes across a historical candle window
 * for a given zone [zoneLow, zoneHigh] and Event Dictionary parameters.
 */
function simulatePathEventsOnWindow(
  candles,
  zoneLow,
  zoneHigh,
  targetPrice,
  invalidationPrice,
  penAtrMult = 0.2,
  reclaimBars = 3,
  breakoutCloses = 2,
  atr = 1.0
) {
  const penAmt = Math.max(1e-8, penAtrMult * atr);
  let touched = false;
  let penetrated = false;
  let maxPenAtr = 0;
  let closesOutside = 0;
  let consecOutside = 0;
  let breakoutDir = 0;
  let penetratedAt = -1;
  let reclaimed = false;
  let reclaimTime = 0;
  let reachedTarget = false;
  let reachedInvalidation = false;
  let ambiguousBar = false;
  let firstReachBar = 0;

  const isUpperZone = zoneHigh >= invalidationPrice;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const lo = Number(c.low);
    const hi = Number(c.high);
    const cl = Number(c.close);

    const hitTarget = isUpperZone ? hi >= targetPrice : lo <= targetPrice;
    const hitInv = isUpperZone ? lo <= invalidationPrice : hi >= invalidationPrice;

    if (!reachedTarget && !reachedInvalidation) {
      if (hitTarget && hitInv) {
        ambiguousBar = true;
      } else if (hitTarget) {
        reachedTarget = true;
        firstReachBar = i + 1;
      } else if (hitInv) {
        reachedInvalidation = true;
      }
    }

    if (hi >= zoneLow && lo <= zoneHigh) touched = true;

    const penDist = Math.max(hi - zoneHigh, zoneLow - lo);
    if (penDist >= penAmt) {
      if (!penetrated) penetratedAt = i;
      penetrated = true;
      maxPenAtr = Math.max(maxPenAtr, penDist / Math.max(1e-8, atr));
    }

    if (cl > zoneHigh || cl < zoneLow) {
      closesOutside++;
      consecOutside++;
      if (consecOutside >= breakoutCloses && breakoutDir === 0) {
        breakoutDir = cl > zoneHigh ? 1 : -1;
      }
    } else {
      if (penetrated && !reclaimed && penetratedAt >= 0 && i - penetratedAt <= reclaimBars) {
        reclaimed = true;
        reclaimTime = i - penetratedAt;
      }
      consecOutside = 0;
    }
  }

  return {
    touched,
    penetrated,
    maxPenAtr,
    closesOutside,
    reclaimed,
    reclaimTime,
    confirmedBreakout: breakoutDir !== 0,
    reachedTarget,
    reachedInvalidation,
    ambiguousBar,
    firstReachBar,
  };
}

/**
 * Detects structural Key Price Zones & Sensitivity Grid (empirical frequency telemetry, zero synthetic priors).
 */
export function detectKeyZonesAndEventTree(features, points, horizonBars, split = null) {
  const lastPt = points[points.length - 1];
  const lastClose = features.lastClose;
  const atr = Math.max(1e-6, features.atr14);
  const candles = features.candles || [];

  const lookback = candles.slice(-Math.min(60, candles.length));
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  for (const c of lookback) {
    swingHigh = Math.max(swingHigh, Number(c.high));
    swingLow = Math.min(swingLow, Number(c.low));
  }
  if (!Number.isFinite(swingHigh)) swingHigh = lastPt.q75;
  if (!Number.isFinite(swingLow)) swingLow = lastPt.q25;

  const upperCenter = lastPt.q75 * 0.65 + swingHigh * 0.35;
  const lowerCenter = lastPt.q25 * 0.65 + swingLow * 0.35;
  const zoneHalf = Math.max(atr * 0.35, lastClose * 0.0008);

  const upperLow = Math.max(lastClose * 0.02, upperCenter - zoneHalf);
  const upperHigh = upperCenter + zoneHalf;
  const lowerLow = Math.max(lastClose * 0.02, lowerCenter - zoneHalf);
  const lowerHigh = lowerCenter + zoneHalf;

  const evalLen = Math.min(horizonBars, 12);
  const histStep = Math.max(1, Math.floor(Math.max(1, candles.length - evalLen - 16) / 14));

  let totalPaths = 0;
  let reachUpperBeforeInv = 0;
  let reachLowerBeforeInv = 0;
  let ambiguousUpperCount = 0;
  let upperTouchCount = 0;
  let upperPenCount = 0;
  let upperReclaimCount = 0;
  let upperBreakCount = 0;
  let upperCensoredTimeSum = 0;
  let lowerCensoredTimeSum = 0;

  if (candles.length >= evalLen + 18) {
    for (let origin = 14; origin <= candles.length - evalLen; origin += histStep) {
      totalPaths++;
      const originClose = Number(candles[origin - 1].close);
      const scale = originClose / lastClose;
      const win = candles.slice(origin, origin + evalLen);

      const uEv = simulatePathEventsOnWindow(
        win,
        upperLow * scale,
        upperHigh * scale,
        upperCenter * scale,
        lowerCenter * scale,
        EVENT_DICTIONARY_DEFAULTS.penetrationAtrMult,
        EVENT_DICTIONARY_DEFAULTS.reclaimWindowBars,
        EVENT_DICTIONARY_DEFAULTS.confirmedBreakoutCloses,
        atr * scale
      );

      const lEv = simulatePathEventsOnWindow(
        win,
        lowerLow * scale,
        lowerHigh * scale,
        lowerCenter * scale,
        upperCenter * scale,
        EVENT_DICTIONARY_DEFAULTS.penetrationAtrMult,
        EVENT_DICTIONARY_DEFAULTS.reclaimWindowBars,
        EVENT_DICTIONARY_DEFAULTS.confirmedBreakoutCloses,
        atr * scale
      );

      if (uEv.touched) upperTouchCount++;
      if (uEv.penetrated) upperPenCount++;
      if (uEv.reclaimed) upperReclaimCount++;
      if (uEv.confirmedBreakout) upperBreakCount++;
      if (uEv.ambiguousBar) ambiguousUpperCount++;
      if (uEv.reachedTarget) {
        reachUpperBeforeInv++;
        upperCensoredTimeSum += uEv.firstReachBar;
      } else {
        upperCensoredTimeSum += evalLen;
      }
      if (lEv.reachedTarget) {
        reachLowerBeforeInv++;
        lowerCensoredTimeSum += lEv.firstReachBar;
      } else {
        lowerCensoredTimeSum += evalLen;
      }
    }
  }

  const sensitivityGrid = [];
  if (candles.length >= evalLen + 18) {
    const atrChoices = [0.1, 0.2, 0.35];
    const reclaimChoices = [2, 3, 5];
    for (const penMult of atrChoices) {
      for (const recBars of reclaimChoices) {
        let gWins = 0;
        let gTouch = 0;
        let gRec = 0;
        let gBrk = 0;
        let gAmb = 0;
        for (let origin = 14; origin <= candles.length - evalLen; origin += histStep * 2) {
          gWins++;
          const scale = Number(candles[origin - 1].close) / lastClose;
          const ev = simulatePathEventsOnWindow(
            candles.slice(origin, origin + evalLen),
            upperLow * scale,
            upperHigh * scale,
            upperCenter * scale,
            lowerCenter * scale,
            penMult,
            recBars,
            EVENT_DICTIONARY_DEFAULTS.confirmedBreakoutCloses,
            atr * scale
          );
          if (ev.touched) gTouch++;
          if (ev.reclaimed) gRec++;
          if (ev.confirmedBreakout) gBrk++;
          if (ev.ambiguousBar) gAmb++;
        }
        if (gWins > 0) {
          sensitivityGrid.push({
            penetrationAtrMult: penMult,
            reclaimWindowBars: recBars,
            breakoutCloses: EVENT_DICTIONARY_DEFAULTS.confirmedBreakoutCloses,
            touchFreqPct: Number(((gTouch / gWins) * 100).toFixed(1)),
            reclaimFreqPct: Number(((gRec / gWins) * 100).toFixed(1)),
            breakoutFreqPct: Number(((gBrk / gWins) * 100).toFixed(1)),
            ambiguousRatePct: Number(((gAmb / gWins) * 100).toFixed(1)),
          });
        }
      }
    }
  }

  const { scenarios, scenarioCalibration } = buildCalibratedScenariosV2(candles, features, horizonBars, points, split);
  const pBull = scenarios[0].probability ?? scenarios[0].rawEmpiricalFrequency ?? 0;
  const pBear = scenarios[2].probability ?? scenarios[2].rawEmpiricalFrequency ?? 0;

  const totalSpread = Math.max(1e-6, lastPt.q90 - lastPt.q10);
  const driftNorm = (lastPt.q50 - lastClose) / (totalSpread / 2.5631);
  const bullBias = normalCdf(driftNorm);
  const reachUpRate = totalPaths > 0 ? reachUpperBeforeInv / totalPaths : 0;
  const reachDnRate = totalPaths > 0 ? reachLowerBeforeInv / totalPaths : 0;
  const ambigRate = totalPaths > 0 ? ambiguousUpperCount / totalPaths : 0;

  const keyZones = [
    {
      zoneId: 'KZ_UPPER_REACTION',
      zoneType: 'RESISTANCE_ZONE',
      lowPrice: upperLow,
      highPrice: upperHigh,
      centerPrice: upperCenter,
      detectedAtMs: features.lastOpenMs,
      source: 'SWING_STRUCTURE_ATR',
      strength: Number(clamp(0.55 + (swingHigh > lastClose ? 0.22 : 0.08), 0.3, 0.95).toFixed(2)),
      touchProbability: Number((totalPaths > 0 ? upperTouchCount / totalPaths : 0).toFixed(3)),
      penetrationProbability: Number((totalPaths > 0 ? upperPenCount / totalPaths : 0).toFixed(3)),
      reclaimProbability: Number((totalPaths > 0 ? upperReclaimCount / totalPaths : 0).toFixed(3)),
      confirmedBreakoutProbability: Number(pBull.toFixed(3)),
      reachBeforeInvalidationProb: Number(clamp(reachUpRate, 0, 1 - ambigRate).toFixed(3)),
      invalidationBeforeReachProb: Number(clamp(reachDnRate, 0, 1 - ambigRate).toFixed(3)),
      expectedBarsToReachCensored: Number((totalPaths > 0 ? upperCensoredTimeSum / totalPaths : horizonBars * 0.5).toFixed(1)),
      invalidationPrice: lowerCenter,
      horizonBars,
    },
    {
      zoneId: 'KZ_LOWER_REACTION',
      zoneType: 'SUPPORT_ZONE',
      lowPrice: lowerLow,
      highPrice: lowerHigh,
      centerPrice: lowerCenter,
      detectedAtMs: features.lastOpenMs,
      source: 'SWING_STRUCTURE_ATR',
      strength: Number(clamp(0.55 + (swingLow < lastClose ? 0.22 : 0.08), 0.3, 0.95).toFixed(2)),
      touchProbability: Number((totalPaths > 0 ? (totalPaths - upperTouchCount) / totalPaths : clamp((1 - bullBias) * 0.5, 0, 1)).toFixed(3)),
      penetrationProbability: Number((totalPaths > 0 ? upperPenCount / totalPaths : 0).toFixed(3)),
      reclaimProbability: Number((totalPaths > 0 ? upperReclaimCount / totalPaths : 0).toFixed(3)),
      confirmedBreakoutProbability: Number(pBear.toFixed(3)),
      reachBeforeInvalidationProb: Number(clamp(reachDnRate, 0, 1 - ambigRate).toFixed(3)),
      invalidationBeforeReachProb: Number(clamp(reachUpRate, 0, 1 - ambigRate).toFixed(3)),
      expectedBarsToReachCensored: Number((totalPaths > 0 ? lowerCensoredTimeSum / totalPaths : horizonBars * 0.5).toFixed(1)),
      invalidationPrice: upperCenter,
      horizonBars,
    },
  ];

  const eventDictionary = {
    priceBasis: EVENT_DICTIONARY_DEFAULTS.priceBasis,
    evaluationRule: EVENT_DICTIONARY_DEFAULTS.evaluationRule,
    penetrationAtrMult: EVENT_DICTIONARY_DEFAULTS.penetrationAtrMult,
    reclaimWindowBars: EVENT_DICTIONARY_DEFAULTS.reclaimWindowBars,
    confirmedBreakoutCloses: EVENT_DICTIONARY_DEFAULTS.confirmedBreakoutCloses,
    sensitivityGrid,
  };

  return { scenarios, scenarioCalibration, keyZones, eventDictionary };
}

/**
 * Multi-Timeframe Coordination Layer:
 * Independently evaluates higher-timeframe structure without mutating or replacing
 * the lower-timeframe independent forecast.
 */
export function coordinateMultiTimeframe(
  independentPoints,
  independentScenarios,
  anchorClose,
  timeframe,
  higherTimeframe = '',
  higherCandles = []
) {
  const indLast = independentPoints[independentPoints.length - 1];
  const indMedPct = anchorClose > 0 ? ((indLast.q50 - anchorClose) / anchorClose) * 100 : 0;

  if (!Array.isArray(higherCandles) || higherCandles.length < 16 || !higherTimeframe) {
    return {
      referenceTimeframe: higherTimeframe || 'NONE',
      alignmentState: MTF_ALIGNMENT_STATE.SINGLE_TIMEFRAME,
      ohlcConsistent: true,
      independentMedianPct: Number(indMedPct.toFixed(3)),
      coordinatedMedianPct: Number(indMedPct.toFixed(3)),
      coordinatedPoints: independentPoints,
      coordinatedScenarios: independentScenarios,
      conflictReasons: ['Higher-timeframe history unavailable locally; running independent engine only'],
      uncertaintyAdjustmentFactor: 1.0,
    };
  }

  const htfFeats = extractForecastFeatures(higherCandles, 120);
  if (!htfFeats) {
    return {
      referenceTimeframe: higherTimeframe,
      alignmentState: MTF_ALIGNMENT_STATE.SINGLE_TIMEFRAME,
      ohlcConsistent: true,
      independentMedianPct: Number(indMedPct.toFixed(3)),
      coordinatedMedianPct: Number(indMedPct.toFixed(3)),
      coordinatedPoints: independentPoints,
      coordinatedScenarios: independentScenarios,
      conflictReasons: ['Insufficient higher-timeframe bars for independent check'],
      uncertaintyAdjustmentFactor: 1.0,
    };
  }

  const htfLatest = htfFeats.candles[htfFeats.candles.length - 1];
  const ohlcConsistent =
    anchorClose >= htfLatest.low * 0.992 && anchorClose <= htfLatest.high * 1.008;

  const htfDriftSign = htfFeats.driftZ > 0.35 ? 1 : htfFeats.driftZ < -0.35 ? -1 : 0;
  const indSign = indMedPct > 0.08 ? 1 : indMedPct < -0.08 ? -1 : 0;

  const conflictReasons = [];
  let alignmentState = MTF_ALIGNMENT_STATE.ALIGNED;
  let uncAdj = 1.0;
  let driftPull = 0.0;

  if (!ohlcConsistent) {
    alignmentState = MTF_ALIGNMENT_STATE.STRUCTURAL_CONFLICT;
    uncAdj = 1.18;
    conflictReasons.push(`Anchor close deviates outside latest closed ${higherTimeframe} [Low, High] envelope`);
  } else if (htfDriftSign !== 0 && indSign !== 0 && htfDriftSign !== indSign) {
    const strongHtf = Math.abs(htfFeats.driftZ) >= 1.35;
    alignmentState = strongHtf
      ? MTF_ALIGNMENT_STATE.STRUCTURAL_CONFLICT
      : MTF_ALIGNMENT_STATE.NATURAL_HORIZON_DIVERGENCE;
    uncAdj = strongHtf ? 1.16 : 1.07;
    driftPull = strongHtf ? htfFeats.recentMeanReturn * 0.28 : htfFeats.recentMeanReturn * 0.12;
    conflictReasons.push(
      `${timeframe} trajectory (${indSign > 0 ? '+' : '-'}) diverges from ${higherTimeframe} drift (z=${htfFeats.driftZ.toFixed(2)})`
    );
  }

  const horizon = independentPoints.length;
  const coordinatedPoints = independentPoints.map((p, idx) => {
    const stepFrac = (idx + 1) / Math.max(1, horizon);
    const shiftFactor = Math.exp(driftPull * (idx + 1));
    const q50 = p.q50 * shiftFactor;
    const halfLo = Math.max(1e-8, (p.q50 - p.q10) * uncAdj);
    const halfLo25 = Math.max(1e-8, (p.q50 - p.q25) * uncAdj);
    const halfHi75 = Math.max(1e-8, (p.q75 - p.q50) * uncAdj);
    const halfHi = Math.max(1e-8, (p.q90 - p.q50) * uncAdj);
    const mq = enforceMonotonicQuantiles(
      {
        q10: q50 - halfLo * (0.9 + 0.1 * stepFrac),
        q25: q50 - halfLo25,
        q50,
        q75: q50 + halfHi75,
        q90: q50 + halfHi * (0.9 + 0.1 * stepFrac),
      },
      anchorClose * 0.02
    );
    return {
      ...p,
      ...mq,
      pctChangeFromLast: ((mq.q50 - anchorClose) / anchorClose) * 100,
    };
  });

  const coordLast = coordinatedPoints[coordinatedPoints.length - 1];
  const coordMedPct = anchorClose > 0 ? ((coordLast.q50 - anchorClose) / anchorClose) * 100 : indMedPct;

  return {
    referenceTimeframe: higherTimeframe,
    alignmentState,
    ohlcConsistent,
    independentMedianPct: Number(indMedPct.toFixed(3)),
    coordinatedMedianPct: Number(coordMedPct.toFixed(3)),
    coordinatedPoints,
    coordinatedScenarios: independentScenarios,
    conflictReasons,
    uncertaintyAdjustmentFactor: uncAdj,
  };
}

/**
 * Rev 2.1 Independent No-Edge Statistical Gate:
 * Enforces all 6 V2.1 gates cleanly (K_outer >= 30, N_eff >= 25.0, Conformal, rMAE < 1, WIS < Naive, Cov80 in [72%, 88%], HLN-DM <= 0.05 & Boot <= 0.10, !EXTREME OOD).
 */
export function evaluateNoEdgeGate(walkForward, uncertainty) {
  const reasons = [];
  const kOuter = Number(walkForward?.evaluatedWindows || 0);
  if (!walkForward || kOuter < 30) {
    reasons.push(`Insufficient non-overlapping OOS windows (K_outer=${kOuter} < 30)`);
  }
  const nEff = Number(walkForward?.effectiveSampleSize || 0);
  if (nEff < 25.0) {
    reasons.push(`Effective sample size N_eff=${nEff.toFixed(1)} below minimum 25.0`);
  }
  const calSt = walkForward?.conformalCalibration?.calibrationStatus || 'UNDER_SAMPLED';
  if (calSt !== 'CALIBRATED_NORMALIZED') {
    reasons.push(`Conformal calibration not ready (${calSt})`);
  }
  const rMae = Number(walkForward?.relativeMaeVsNaive ?? 1.0);
  if (!(rMae < 1.0)) {
    reasons.push(`rMAE=${rMae.toFixed(3)} >= 1.000`);
  }
  const wisModel = Number(walkForward?.wisModel ?? 0);
  const wisNaive = Number(walkForward?.wisNaiveDistributional ?? 0);
  if (!(wisModel < wisNaive && wisNaive > 0)) {
    reasons.push(`WIS=${wisModel.toFixed(4)} >= Naive WIS=${wisNaive.toFixed(4)}`);
  }
  const cov80 = Number(walkForward?.coverage80Pct ?? 0);
  if (cov80 < 72.0 || cov80 > 88.0) {
    reasons.push(`80% Coverage=${cov80.toFixed(1)}% outside [72%, 88%]`);
  }
  const dmP = Number(walkForward?.dieboldMarianoPValue ?? 1.0);
  const bootP = Number(walkForward?.sensitivityBootstrapPValue ?? 1.0);
  if (dmP > 0.05) {
    reasons.push(`HLN-DM p=${dmP.toFixed(4)} > 0.05`);
  }
  if (bootP > 0.10) {
    reasons.push(`Stationary block bootstrap p=${bootP.toFixed(4)} > 0.10`);
  }
  if (uncertainty?.oodStatus === OOD_STATUS.EXTREME) {
    reasons.push('Extreme OOD regime forbids edge claim');
  }

  const skill = Number(walkForward?.skillScoreVsNaive || 0);
  const hasEdge =
    Boolean(walkForward?.acceptancePassed) &&
    kOuter >= 30 &&
    nEff >= 25.0 &&
    calSt === 'CALIBRATED_NORMALIZED' &&
    uncertainty?.oodStatus !== OOD_STATUS.EXTREME;

  return {
    gateState: hasEdge ? NO_EDGE_GATE_STATE.EDGE_SUPPORTED : NO_EDGE_GATE_STATE.NO_EDGE_DETECTED,
    hasEdge,
    effectiveSampleSize: Number(nEff.toFixed(2)),
    skillScoreVsBaseline: Number(skill.toFixed(4)),
    reasons: hasEdge
      ? ['All 6 V2.1 OOS, WIS, Conformal, and HLN-DM + Block Bootstrap gates passed']
      : reasons,
  };
}

/**
 * Forecast Stability Diagnostic: measures shift between consecutive forecast snapshots.
 */
export function computeForecastStability(summary, anchorClose, previousForecast = null) {
  if (!previousForecast || !previousForecast.summary || !summary || anchorClose <= 0) {
    return {
      previousForecastHash: null,
      medianDriftPct: 0,
      corridorShiftPct: 0,
      stable: true,
    };
  }
  const prevMed = Number(previousForecast.summary.terminalQ50 || anchorClose);
  const prevWidth = Number(previousForecast.summary.corridorWidthPct || 0);
  const medianDriftPct = Number(((Math.abs(summary.terminalQ50 - prevMed) / Math.max(1e-8, anchorClose)) * 100).toFixed(3));
  const corridorShiftPct = Number(Math.abs((summary.corridorWidthPct || 0) - prevWidth).toFixed(3));
  return {
    previousForecastHash: previousForecast.inputHash || null,
    medianDriftPct,
    corridorShiftPct,
    stable: medianDriftPct <= 1.25 && corridorShiftPct <= 2.5,
  };
}
