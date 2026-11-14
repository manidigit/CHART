import {
  EVENT_DICTIONARY_DEFAULTS,
  MTF_ALIGNMENT_STATE,
  NO_EDGE_GATE_STATE,
  OOD_STATUS,
  enforceMonotonicQuantiles,
} from './forecastContract.js?v=1.42.0';
import { extractForecastFeatures } from './featureExtractor.js?v=1.42.0';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

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
  let breakoutDir = 0; // +1 bull, -1 bear
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

    if (hi >= zoneLow && lo <= zoneHigh) {
      touched = true;
    }

    const upperPen = hi - zoneHigh;
    const lowerPen = zoneLow - lo;
    const penDist = Math.max(upperPen, lowerPen);
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

  let leafId = 'NO_ZONE_TOUCH_RANGE';
  if (breakoutDir > 0) {
    leafId = 'CONFIRMED_BREAKOUT_BULL';
  } else if (breakoutDir < 0) {
    leafId = 'CONFIRMED_BREAKOUT_BEAR';
  } else if (reclaimed) {
    leafId = 'PENETRATE_AND_RECLAIM';
  } else if (penetrated) {
    leafId = closesOutside >= 1 ? (zoneHigh >= invalidationPrice ? 'CONFIRMED_BREAKOUT_BULL' : 'CONFIRMED_BREAKOUT_BEAR') : 'ZONE_REACTION_REJECTION';
  } else if (touched) {
    leafId = 'ZONE_REACTION_REJECTION';
  }

  return {
    leafId,
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
 * Detects structural Key Price Zones, constructs the mutually exclusive 5-leaf Event Tree
 * (exact sum = 1.000), evaluates competing target vs. invalidation probabilities,
 * and computes the Event Dictionary Sensitivity Grid.
 */
export function detectKeyZonesAndEventTree(features, points, horizonBars) {
  const lastPt = points[points.length - 1];
  const lastClose = features.lastClose;
  const atr = Math.max(1e-6, features.atr14);
  const candles = features.candles || [];

  // Structural swing high / low from lookback window
  const lookback = candles.slice(-Math.min(60, candles.length));
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  for (const c of lookback) {
    swingHigh = Math.max(swingHigh, Number(c.high));
    swingLow = Math.min(swingLow, Number(c.low));
  }
  if (!Number.isFinite(swingHigh)) swingHigh = lastPt.q75;
  if (!Number.isFinite(swingLow)) swingLow = lastPt.q25;

  const upperCenter = (lastPt.q75 * 0.65 + swingHigh * 0.35);
  const lowerCenter = (lastPt.q25 * 0.65 + swingLow * 0.35);
  const zoneHalf = Math.max(atr * 0.35, lastClose * 0.0008);

  const upperLow = Math.max(lastClose * 0.02, upperCenter - zoneHalf);
  const upperHigh = upperCenter + zoneHalf;
  const lowerLow = Math.max(lastClose * 0.02, lowerCenter - zoneHalf);
  const lowerHigh = lowerCenter + zoneHalf;

  // Empirical historical event-tree frequencies + sensitivity grid
  const evalLen = Math.min(horizonBars, 12);
  const histStep = Math.max(1, Math.floor(Math.max(1, candles.length - evalLen - 16) / 14));
  const counts = {
    NO_ZONE_TOUCH_RANGE: 0,
    ZONE_REACTION_REJECTION: 0,
    PENETRATE_AND_RECLAIM: 0,
    CONFIRMED_BREAKOUT_BULL: 0,
    CONFIRMED_BREAKOUT_BEAR: 0,
  };

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

      // Combine into mutually exclusive leaf assignment
      if (uEv.leafId === 'CONFIRMED_BREAKOUT_BULL') counts.CONFIRMED_BREAKOUT_BULL++;
      else if (lEv.leafId === 'CONFIRMED_BREAKOUT_BEAR') counts.CONFIRMED_BREAKOUT_BEAR++;
      else if (uEv.leafId === 'PENETRATE_AND_RECLAIM' || lEv.leafId === 'PENETRATE_AND_RECLAIM') counts.PENETRATE_AND_RECLAIM++;
      else if (uEv.touched || lEv.touched) counts.ZONE_REACTION_REJECTION++;
      else counts.NO_ZONE_TOUCH_RANGE++;
    }
  }

  // Sensitivity grid over Event Dictionary parameters (§8.4)
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

  // Blend analytical quantile distribution with historical empirical event tree (exact sum = 1.000)
  const totalSpread = Math.max(1e-6, lastPt.q90 - lastPt.q10);
  const driftNorm = (lastPt.q50 - lastClose) / (totalSpread / 2.5631);
  const bullBias = normalCdf(driftNorm);

  const empNoTouch = totalPaths > 0 ? counts.NO_ZONE_TOUCH_RANGE / totalPaths : 0.22;
  const empReact = totalPaths > 0 ? counts.ZONE_REACTION_REJECTION / totalPaths : 0.24;
  const empReclaim = totalPaths > 0 ? counts.PENETRATE_AND_RECLAIM / totalPaths : 0.18;
  const empBull = totalPaths > 0 ? counts.CONFIRMED_BREAKOUT_BULL / totalPaths : 0.18 * bullBias * 2;
  const empBear = totalPaths > 0 ? counts.CONFIRMED_BREAKOUT_BEAR / totalPaths : 0.18 * (1 - bullBias) * 2;

  const anaTouch = clamp(0.62 + 0.14 * Math.min(2.0, Math.abs(driftNorm)), 0.42, 0.88);
  const rawNoTouch = 0.5 * (1 - anaTouch) + 0.5 * empNoTouch;
  const rawReact = 0.5 * (anaTouch * 0.30) + 0.5 * empReact;
  const rawReclaim = 0.5 * (anaTouch * 0.22) + 0.5 * empReclaim;
  const rawBreakPool = Math.max(0.08, 1 - rawNoTouch - rawReact - rawReclaim);
  const rawBull = 0.55 * (rawBreakPool * bullBias) + 0.45 * empBull;
  const rawBear = 0.55 * (rawBreakPool * (1 - bullBias)) + 0.45 * empBear;
  const sumRaw = rawNoTouch + rawReact + rawReclaim + rawBull + rawBear;

  const pNoTouch = Number((rawNoTouch / sumRaw).toFixed(3));
  const pReact = Number((rawReact / sumRaw).toFixed(3));
  const pReclaim = Number((rawReclaim / sumRaw).toFixed(3));
  const pBull = Number((rawBull / sumRaw).toFixed(3));
  const pBear = Number(Math.max(0, 1.0 - pNoTouch - pReact - pReclaim - pBull).toFixed(3));

  const scenarios = [
    {
      id: 'NO_ZONE_TOUCH_RANGE',
      leafId: 'NO_ZONE_TOUCH_RANGE',
      parentBranch: 'NO_TOUCH',
      label: 'No Key Zone Touch (Range Containment)',
      bias: 'neutral',
      probability: pNoTouch,
      targetPrice: lastPt.q50,
      extremePrice: lastPt.q75,
      invalidationReference: lowerCenter,
      pctChange: ((lastPt.q50 - lastClose) / lastClose) * 100,
      entryCondition: `Price stays between ${lowerHigh.toFixed(2)} and ${upperLow.toFixed(2)}`,
      intermediateEvent: 'Neither primary zone is touched over horizon',
      invalidationCondition: 'High/Low touches upper or lower key zone',
      lowSampleWarning: totalPaths > 0 && counts.NO_ZONE_TOUCH_RANGE < 2,
    },
    {
      id: 'ZONE_REACTION_REJECTION',
      leafId: 'ZONE_REACTION_REJECTION',
      parentBranch: 'TOUCH_OBSERVED',
      label: 'Key Zone Touch & Reaction Rejection',
      bias: 'neutral',
      probability: pReact,
      targetPrice: lastPt.q50,
      extremePrice: upperLow,
      invalidationReference: lowerLow,
      pctChange: ((lastPt.q50 - lastClose) / lastClose) * 100,
      entryCondition: 'High/Low enters key zone boundary',
      intermediateEvent: 'Penetration remains < 0.2x ATR with mean reversion',
      invalidationCondition: 'Penetration >= 0.2x ATR outside zone',
      lowSampleWarning: totalPaths > 0 && counts.ZONE_REACTION_REJECTION < 2,
    },
    {
      id: 'PENETRATE_AND_RECLAIM',
      leafId: 'PENETRATE_AND_RECLAIM',
      parentBranch: 'TOUCH_OBSERVED',
      label: 'Zone Penetration & <=3-Bar Reclaim',
      bias: 'neutral',
      probability: pReclaim,
      targetPrice: lastPt.q50,
      extremePrice: upperHigh,
      invalidationReference: lowerHigh,
      pctChange: ((lastPt.q50 - lastClose) / lastClose) * 100,
      entryCondition: 'Penetration >= 0.2x ATR beyond key zone',
      intermediateEvent: 'Close reclaims inside zone within <= 3 bars',
      invalidationCondition: '2 consecutive closes outside zone boundary',
      lowSampleWarning: totalPaths > 0 && counts.PENETRATE_AND_RECLAIM < 2,
    },
    {
      id: 'CONFIRMED_BREAKOUT_BULL',
      leafId: 'CONFIRMED_BREAKOUT_BULL',
      parentBranch: 'TOUCH_OBSERVED',
      label: 'Confirmed Bullish Zone Expansion',
      bias: 'bull',
      probability: pBull,
      targetPrice: lastPt.q75,
      extremePrice: lastPt.q90,
      invalidationReference: lowerCenter,
      pctChange: ((lastPt.q75 - lastClose) / lastClose) * 100,
      entryCondition: `Upper zone penetration >= 0.2x ATR above ${upperHigh.toFixed(2)}`,
      intermediateEvent: '2 consecutive closes confirmed above upper zone',
      invalidationCondition: `Close back below structural pivot ${lowerCenter.toFixed(2)}`,
      lowSampleWarning: totalPaths > 0 && counts.CONFIRMED_BREAKOUT_BULL < 2,
    },
    {
      id: 'CONFIRMED_BREAKOUT_BEAR',
      leafId: 'CONFIRMED_BREAKOUT_BEAR',
      parentBranch: 'TOUCH_OBSERVED',
      label: 'Confirmed Bearish Zone Contraction',
      bias: 'bear',
      probability: pBear,
      targetPrice: lastPt.q25,
      extremePrice: lastPt.q10,
      invalidationReference: upperCenter,
      pctChange: ((lastPt.q25 - lastClose) / lastClose) * 100,
      entryCondition: `Lower zone penetration >= 0.2x ATR below ${lowerLow.toFixed(2)}`,
      intermediateEvent: '2 consecutive closes confirmed below lower zone',
      invalidationCondition: `Close back above structural pivot ${upperCenter.toFixed(2)}`,
      lowSampleWarning: totalPaths > 0 && counts.CONFIRMED_BREAKOUT_BEAR < 2,
    },
  ];

  const reachUpRate = totalPaths > 0 ? reachUpperBeforeInv / totalPaths : bullBias * 0.65;
  const reachDnRate = totalPaths > 0 ? reachLowerBeforeInv / totalPaths : (1 - bullBias) * 0.65;
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
      touchProbability: Number((totalPaths > 0 ? upperTouchCount / totalPaths : bullBias * 0.72).toFixed(3)),
      penetrationProbability: Number((totalPaths > 0 ? upperPenCount / totalPaths : bullBias * 0.45).toFixed(3)),
      reclaimProbability: Number((totalPaths > 0 ? upperReclaimCount / totalPaths : pReclaim * 0.5).toFixed(3)),
      confirmedBreakoutProbability: pBull,
      reachBeforeInvalidationProb: Number(clamp(reachUpRate, 0, 1 - ambigRate).toFixed(3)),
      invalidationBeforeReachProb: Number(clamp(reachDnRate, 0, 1 - ambigRate).toFixed(3)),
      expectedBarsToReachCensored: Number((totalPaths > 0 ? upperCensoredTimeSum / totalPaths : horizonBars * 0.56).toFixed(1)),
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
      touchProbability: Number(clamp((1 - bullBias) * 0.74, 0.05, 0.95).toFixed(3)),
      penetrationProbability: Number(clamp((1 - bullBias) * 0.46, 0.03, 0.85).toFixed(3)),
      reclaimProbability: Number((pReclaim * 0.5).toFixed(3)),
      confirmedBreakoutProbability: pBear,
      reachBeforeInvalidationProb: Number(clamp(reachDnRate, 0, 1 - ambigRate).toFixed(3)),
      invalidationBeforeReachProb: Number(clamp(reachUpRate, 0, 1 - ambigRate).toFixed(3)),
      expectedBarsToReachCensored: Number((totalPaths > 0 ? lowerCensoredTimeSum / totalPaths : horizonBars * 0.6).toFixed(1)),
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

  return { scenarios, keyZones, eventDictionary };
}

/**
 * Multi-Timeframe Coordination Layer (§2.2, §2.3, §4.3):
 * Independently evaluates higher-timeframe structure without mutating or replacing
 * the lower-timeframe independent forecast, then outputs a separate Coordinated Forecast.
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
 * Independent No-Edge Gate (§26): strictly outside the 1.000 scenario tree sum.
 */
export function evaluateNoEdgeGate(walkForward, uncertainty) {
  const reasons = [];
  if (!walkForward || walkForward.evaluatedWindows < 5) {
    reasons.push('Insufficient walk-forward windows (< 5)');
  }
  const nEff = Number(walkForward?.effectiveSampleSize || 0);
  if (nEff < 12) {
    reasons.push(`Effective sample size N_eff=${nEff.toFixed(1)} below minimum 12.0`);
  }
  const skill = Number(walkForward?.skillScoreVsNaive || 0);
  if (skill <= 0) {
    reasons.push(`Skill score vs Persistence (${(skill * 100).toFixed(1)}%) <= 0%`);
  }
  if (!walkForward?.acceptancePassed) {
    reasons.push(walkForward?.acceptanceReason || 'Walk-forward acceptance gate not met');
  }
  if (uncertainty?.oodStatus === OOD_STATUS.EXTREME) {
    reasons.push('Extreme OOD regime forbids high-confidence edge claim');
  }

  const hasEdge =
    Boolean(walkForward?.acceptancePassed) &&
    nEff >= 12 &&
    skill > 0 &&
    uncertainty?.oodStatus !== OOD_STATUS.EXTREME;

  return {
    gateState: hasEdge ? NO_EDGE_GATE_STATE.EDGE_SUPPORTED : NO_EDGE_GATE_STATE.NO_EDGE_DETECTED,
    hasEdge,
    effectiveSampleSize: Number(nEff.toFixed(2)),
    skillScoreVsBaseline: Number(skill.toFixed(4)),
    reasons: hasEdge ? ['Out-of-sample skill and calibration pass v1.3.0 statistical gate'] : reasons,
  };
}

/**
 * Forecast Stability Diagnostic (§25): measures shift between consecutive forecast snapshots.
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
  const medianDriftPct = Number((Math.abs(summary.terminalQ50 - prevMed) / Math.max(1e-8, anchorClose) * 100).toFixed(3));
  const corridorShiftPct = Number(Math.abs((summary.corridorWidthPct || 0) - prevWidth).toFixed(3));
  return {
    previousForecastHash: previousForecast.inputHash || null,
    medianDriftPct,
    corridorShiftPct,
    stable: medianDriftPct <= 1.25 && corridorShiftPct <= 2.5,
  };
}
