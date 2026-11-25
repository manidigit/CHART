/**
 * Risk/Reward Intelligence & Hard Gate Engine (`signal-gen/1.0`)
 *
 * Non-negotiable system laws:
 * - Hard Gate minimum Net Risk/Reward = 2.00 (cannot be disabled or lowered by any config or UI).
 * - Stop Loss MUST be anchored to real causal market structure (Swing / S/R / confirmation candle + ATR buffer).
 * - Take Profit 1 (TP1) MUST be the nearest structurally valid causal barrier (Resistance/Swing High for Long;
 *   Support/Swing Low for Short). Fabricating a distant TP solely to satisfy 2R or 3R is strictly prohibited.
 * - Net R:R is evaluated AFTER explicit round-trip Spread, Commission, and Slippage costs.
 *   If Gross R:R >= 2.0 but Net R:R < 2.0, the setup is strictly rejected with status `no_trade`.
 * - Strictly offline research / signal generation only (zero broker or live order APIs).
 */

export const SIGNAL_CONTRACT_VERSION = 'signal-gen/1.0';
export const MINIMUM_REQUIRED_RR = Object.freeze(2.0);
export const OPTIMAL_RR_THRESHOLD = Object.freeze(3.0);

function round4(v) {
  return Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null;
}

function round2(v) {
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/**
 * Enforces the immutable Hard Gate floor: no caller or UI setting may ever lower minimum RR below 2.0.
 */
export function enforceMinimumRequiredRR(requestedMinRR) {
  const n = Number(requestedMinRR);
  if (!Number.isFinite(n) || n < MINIMUM_REQUIRED_RR) {
    return MINIMUM_REQUIRED_RR;
  }
  return Math.min(10.0, Math.round(n * 100) / 100);
}

/**
 * Computes round-trip per-unit trading friction (Spread + Commission + Slippage).
 * Uses half-spread + slippage + commission on entry and exit.
 */
export function computeRoundTripFrictionPerUnit(entry, exitPrice, costConfig = {}) {
  const spreadBps = Math.max(0, Number(costConfig.spreadBps ?? 4.0) || 0);
  const commissionBps = Math.max(0, Number(costConfig.commissionBps ?? 5.0) || 0);
  const slippageBps = Math.max(0, Number(costConfig.slippageBps ?? 2.0) || 0);

  const sideCostRate = (spreadBps * 0.5 + slippageBps + commissionBps) / 10000.0;
  const entryCost = Math.abs(entry) * sideCostRate;
  const exitCost = Math.abs(exitPrice) * sideCostRate;

  return {
    sideCostRate,
    entryCost,
    exitCost,
    totalCostPerUnit: entryCost + exitCost,
    spreadBps,
    commissionBps,
    slippageBps,
  };
}

/**
 * Collects strictly causal structural levels confirmed on or before `barIndex` (`confirmIndex <= barIndex`).
 * Zero future look-ahead: any swing or zone whose confirmation occurs after `barIndex` is excluded.
 */
export function buildCausalStructureAtIndex(candles, swings = [], srZones = [], barIndex = 0) {
  const causalSwingHighs = [];
  const causalSwingLows = [];

  for (const sw of swings) {
    const confirmIdx = Number.isFinite(sw.confirmIndex) ? sw.confirmIndex : Number(sw.index) + 3;
    if (confirmIdx <= barIndex && Number.isFinite(sw.price) && sw.price > 0) {
      if (sw.type === 'SWING_HIGH') {
        causalSwingHighs.push({
          price: sw.price,
          index: sw.index,
          confirmIndex: confirmIdx,
          source: 'SWING_HIGH',
          strength: 1,
        });
      } else if (sw.type === 'SWING_LOW') {
        causalSwingLows.push({
          price: sw.price,
          index: sw.index,
          confirmIndex: confirmIdx,
          source: 'SWING_LOW',
          strength: 1,
        });
      }
    }
  }

  // Causal S/R clusters formed strictly from confirmed swings available by barIndex
  const causalResistances = [];
  const causalSupports = [];

  for (const z of srZones) {
    // A zone is only causally known once at least 2 of its constituent touches are confirmed by barIndex
    const confirmIdx = Number.isFinite(z.causalConfirmIndex)
      ? z.causalConfirmIndex
      : Number(z.lastTouchIndex ?? z.startIndex ?? Infinity) + 3;
    if (confirmIdx <= barIndex) {
      if (z.role === 'RESISTANCE' && Number.isFinite(z.lowPrice)) {
        causalResistances.push({
          price: z.lowPrice, // Conservative nearest edge of resistance zone for Long TP1
          midPrice: z.centerPrice,
          highPrice: z.highPrice,
          index: z.lastTouchIndex ?? z.startIndex,
          confirmIndex: confirmIdx,
          source: 'SR_RESISTANCE_ZONE',
          strength: Number(z.touchCount || 2),
        });
      } else if (z.role === 'SUPPORT' && Number.isFinite(z.highPrice)) {
        causalSupports.push({
          price: z.highPrice, // Conservative nearest edge of support zone for Short TP1
          midPrice: z.centerPrice,
          lowPrice: z.lowPrice,
          index: z.lastTouchIndex ?? z.startIndex,
          confirmIndex: confirmIdx,
          source: 'SR_SUPPORT_ZONE',
          strength: Number(z.touchCount || 2),
        });
      }
    }
  }

  return {
    swingHighs: causalSwingHighs,
    swingLows: causalSwingLows,
    resistances: causalResistances,
    supports: causalSupports,
  };
}

/**
 * Selects structurally valid nearest TP1 (and optional TP2) from causal market barriers.
 * Strictly forbids skipping a closer real structural barrier just to inflate R:R.
 */
function resolveStructuralTargets(side, entry, atr, structure, explicitTargets = null, minBarrierAtr = 0.5) {
  const isLong = side === 'long';
  const minDistance = Math.max(atr * minBarrierAtr, entry * 0.0008);
  const maxRealisticDistance = Math.max(atr * 14.0, entry * 0.35);

  const candidates = [];

  if (Array.isArray(explicitTargets) && explicitTargets.length > 0) {
    for (const t of explicitTargets) {
      const price = typeof t === 'number' ? t : Number(t?.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      const dist = isLong ? price - entry : entry - price;
      if (dist >= minDistance) {
        candidates.push({
          price,
          dist,
          source: (typeof t === 'object' && t?.source) || 'EXPLICIT_STRUCTURE',
          strength: (typeof t === 'object' && Number(t?.strength)) || 2,
        });
      }
    }
  }

  const barrierList = isLong
    ? [...(structure.resistances || []), ...(structure.swingHighs || [])]
    : [...(structure.supports || []), ...(structure.swingLows || [])];

  for (const b of barrierList) {
    const price = Number(b.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const dist = isLong ? price - entry : entry - price;
    if (dist >= minDistance) {
      candidates.push({
        price,
        dist,
        source: b.source || 'CAUSAL_SWING',
        strength: Number(b.strength || 1),
      });
    }
  }

  if (candidates.length === 0) {
    return { valid: false, reasonCode: 'NO_STRUCTURAL_TARGET', tp1: null, tp2: null, barriers: [] };
  }

  // Sort strictly by proximity to entry — nearest valid barrier MUST be TP1 (never skipped!)
  candidates.sort((a, b) => a.dist - b.dist);

  // Deduplicate barriers within 0.35 * ATR of each other, preserving the nearer conservative price
  const clusterTol = Math.max(atr * 0.35, entry * 0.0005);
  const deduped = [];
  for (const c of candidates) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.abs(c.price - last.price) > clusterTol) {
      deduped.push(c);
    } else if (c.strength > last.strength) {
      // Keep the nearer price conservatively, upgrade source metadata
      last.source = c.source;
      last.strength = c.strength;
    }
  }

  const tp1 = deduped[0];
  if (!tp1 || tp1.dist > maxRealisticDistance) {
    return {
      valid: false,
      reasonCode: 'TARGET_UNREALISTIC_DISTANCE',
      tp1: null,
      tp2: null,
      barriers: deduped,
    };
  }

  const tp2 =
    deduped.length >= 2 && deduped[1].dist <= maxRealisticDistance * 1.4
      ? deduped[1]
      : null;

  return {
    valid: true,
    reasonCode: null,
    tp1,
    tp2,
    barriers: deduped.slice(0, 4),
  };
}

/**
 * Evaluates a candidate signal through the independent Risk/Reward Intelligence Hard Gate.
 *
 * @param {Object} candidate - Proposed setup from a Signal Generator:
 *   { side: 'long'|'short', entryPrice, stopLossPrice, stopSource, explicitTargets?, chaseAtrDistance?, maxChaseAtr?, reason, strength, exitRule?, indicatorsSnapshot? }
 * @param {Object} context - Causal market context at decision bar `i`:
 *   { bar, atr, structure, candles?, barIndex, chartId, timeframe, strategyId }
 * @param {Object} costConfig - { spreadBps, commissionBps, slippageBps, minRequiredRR? }
 */
export function evaluateRiskRewardTradePlan(candidate, context, costConfig = {}) {
  const minRequiredRR = enforceMinimumRequiredRR(costConfig.minRequiredRR);
  const side = String(candidate?.side || '').toLowerCase();
  const isLong = side === 'long';
  const isShort = side === 'short';

  const makeRejection = (rejectionCode, reason, extra = {}) => ({
    passed: false,
    status: 'no_trade',
    rejection_code: rejectionCode,
    reason,
    entry_price_suggested: round4(extra.entry ?? candidate?.entryPrice ?? null),
    stop_loss_suggested: round4(extra.stopLoss ?? candidate?.stopLossPrice ?? null),
    take_profit_suggested: extra.takeProfits || [],
    risk_reward: {
      gross_rr: extra.grossRR != null ? round2(extra.grossRR) : 0,
      net_rr: extra.netRR != null ? round2(extra.netRR) : 0,
      minimum_required_rr: minRequiredRR,
      tier: 'REJECTED',
      passed: false,
      round_trip_cost_per_unit: extra.roundTripCost != null ? round4(extra.roundTripCost) : 0,
    },
    structural_context: extra.structuralContext || {},
  });

  if (!isLong && !isShort) {
    return makeRejection('INVALID_SIDE', 'NO TRADE: Candidate signal side must be long or short.');
  }

  const bar = context?.bar;
  if (!bar || bar.is_closed === false) {
    return makeRejection('OPEN_BAR_FORBIDDEN', 'NO TRADE: Signals cannot be generated on an unclosed forming candle.');
  }

  const atr = Number(context?.atr);
  if (!Number.isFinite(atr) || atr <= 0) {
    return makeRejection('INSUFFICIENT_ATR_DATA', 'NO TRADE: Valid ATR(14) volatility baseline is unavailable.');
  }

  const entry = Number(candidate?.entryPrice);
  if (!Number.isFinite(entry) || entry <= 0) {
    return makeRejection('INVALID_ENTRY', 'NO TRADE: No valid entry price could be established.');
  }

  // Anti-chase guard: reject entries already over-extended away from trigger/structure
  const maxChaseAtr = Number(candidate?.maxChaseAtr ?? 2.2);
  const chaseAtr = Number(candidate?.chaseAtrDistance ?? 0);
  if (Number.isFinite(chaseAtr) && chaseAtr > maxChaseAtr) {
    return makeRejection(
      'ENTRY_OVEREXTENDED_CHASE',
      `NO TRADE: Price is overextended (${chaseAtr.toFixed(2)}×ATR from structure; max ${maxChaseAtr.toFixed(2)}×ATR). Avoid chasing.`,
      { entry }
    );
  }

  // Structural Stop Loss validation
  const stopLoss = Number(candidate?.stopLossPrice);
  if (!Number.isFinite(stopLoss) || stopLoss <= 0) {
    return makeRejection('NO_STRUCTURAL_STOP_LOSS', 'NO TRADE: No structurally valid stop-loss level.', { entry });
  }

  const grossRisk = isLong ? entry - stopLoss : stopLoss - entry;
  if (!Number.isFinite(grossRisk) || grossRisk <= 0) {
    return makeRejection(
      'INVALID_STOP_DIRECTION',
      'NO TRADE: Stop loss is on the wrong side of entry price.',
      { entry, stopLoss }
    );
  }

  const minStopDist = Math.max(atr * 0.35, entry * 0.0005);
  const maxStopDist = Math.max(atr * 5.0, entry * 0.12);
  if (grossRisk < minStopDist) {
    return makeRejection(
      'STOP_TOO_TIGHT_NOISE',
      `NO TRADE: Structural stop distance (${(grossRisk / atr).toFixed(2)}×ATR) is narrower than noise floor (0.35×ATR).`,
      { entry, stopLoss }
    );
  }
  if (grossRisk > maxStopDist) {
    return makeRejection(
      'STOP_TOO_WIDE_STRUCTURE',
      `NO TRADE: Structural stop distance (${(grossRisk / atr).toFixed(2)}×ATR) exceeds structural maximum (5.00×ATR).`,
      { entry, stopLoss }
    );
  }

  // Structural Take Profit resolution — strictly nearest valid causal barrier
  const targetResolution = resolveStructuralTargets(
    side,
    entry,
    atr,
    context?.structure || {},
    candidate?.explicitTargets || null
  );

  if (!targetResolution.valid || !targetResolution.tp1) {
    const code = targetResolution.reasonCode || 'NO_STRUCTURAL_TARGET';
    const msg =
      code === 'TARGET_UNREALISTIC_DISTANCE'
        ? 'NO TRADE: Nearest structural target exceeds realistic volatility reach (>14×ATR).'
        : 'NO TRADE: No structurally valid causal resistance/support target available.';
    return makeRejection(code, msg, { entry, stopLoss });
  }

  const tp1 = targetResolution.tp1.price;
  const tp2 = targetResolution.tp2 ? targetResolution.tp2.price : null;
  const takeProfits = tp2 != null ? [round4(tp1), round4(tp2)] : [round4(tp1)];

  const grossReward = isLong ? tp1 - entry : entry - tp1;
  const grossRR = grossRisk > 0 ? grossReward / grossRisk : 0;

  // Explicit cost impact on TP1 and SL outcomes
  const tpFriction = computeRoundTripFrictionPerUnit(entry, tp1, costConfig);
  const slFriction = computeRoundTripFrictionPerUnit(entry, stopLoss, costConfig);

  const netReward = grossReward - tpFriction.totalCostPerUnit;
  const netRisk = grossRisk + slFriction.totalCostPerUnit;
  const netRR = netRisk > 0 ? netReward / netRisk : 0;

  const structuralContext = {
    stop_source: candidate?.stopSource || 'CAUSAL_STRUCTURE',
    stop_atr_mult: round2(grossRisk / atr),
    tp1_source: targetResolution.tp1.source,
    tp1_atr_mult: round2(grossReward / atr),
    tp2_source: targetResolution.tp2 ? targetResolution.tp2.source : null,
    chase_atr: round2(chaseAtr),
  };

  if (grossRR < minRequiredRR) {
    return makeRejection(
      'GROSS_RR_BELOW_MINIMUM',
      `NO TRADE: Nearest valid ${isLong ? 'resistance' : 'support'} (${round4(tp1)}) limits reward to ${grossRR.toFixed(2)}R (Net ${netRR.toFixed(2)}R). Required minimum: ${minRequiredRR.toFixed(2)}R.`,
      {
        entry,
        stopLoss,
        takeProfits,
        grossRR,
        netRR,
        roundTripCost: tpFriction.totalCostPerUnit,
        structuralContext,
      }
    );
  }

  if (netRR < minRequiredRR || netReward <= 0) {
    return makeRejection(
      'NET_RR_BELOW_MINIMUM',
      `NO TRADE: Trading costs reduce R:R from Gross ${grossRR.toFixed(2)}R to Net ${netRR.toFixed(2)}R. Required minimum Net R:R: ${minRequiredRR.toFixed(2)}R.`,
      {
        entry,
        stopLoss,
        takeProfits,
        grossRR,
        netRR,
        roundTripCost: tpFriction.totalCostPerUnit,
        structuralContext,
      }
    );
  }

  const tier = netRR >= OPTIMAL_RR_THRESHOLD ? 'OPTIMAL' : 'CONDITIONAL_ACCEPT';

  return {
    passed: true,
    status: 'valid',
    rejection_code: null,
    reason: candidate?.reason || 'Validated structural setup',
    entry_price_suggested: round4(entry),
    stop_loss_suggested: round4(stopLoss),
    take_profit_suggested: takeProfits,
    risk_reward: {
      gross_rr: round2(grossRR),
      net_rr: round2(netRR),
      minimum_required_rr: minRequiredRR,
      tier,
      passed: true,
      round_trip_cost_per_unit: round4(tpFriction.totalCostPerUnit),
    },
    structural_context: structuralContext,
  };
}

/**
 * Offline position sizing calculator honoring instrument contract/tick specifications when available,
 * and transparently disclosing unit-approximation limitations when full broker specs are absent.
 */
export function calculateInstrumentPositionSizing({
  equity = 1000.0,
  riskPerTradePct = 1.0,
  entryPrice,
  stopLossPrice,
  maxLeverage = 5.0,
  instrumentSpec = null,
}) {
  const safeEquity = Math.max(0, Number(equity) || 0);
  const safeRiskPct = Math.max(0.1, Math.min(10.0, Number(riskPerTradePct) || 1.0));
  const allowedRiskEur = safeEquity * (safeRiskPct / 100.0);
  const riskPerPriceUnit = Math.abs((Number(entryPrice) || 0) - (Number(stopLossPrice) || 0));

  if (safeEquity <= 0 || riskPerPriceUnit <= 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) {
    return {
      valid: false,
      quantity: 0,
      allowedRiskEur: round2(allowedRiskEur),
      effectiveRiskEur: 0,
      exposureNotionalEur: 0,
      sizingMode: 'UNAVAILABLE',
      limitationNote: 'Invalid equity, entry, or stop-loss distance.',
    };
  }

  const hasFullSpec =
    instrumentSpec &&
    Number(instrumentSpec.contractSize) > 0 &&
    Number(instrumentSpec.tickSize) > 0 &&
    Number(instrumentSpec.tickValue) > 0;

  if (hasFullSpec) {
    const fxToEur = Number(instrumentSpec.fxRateToEur) > 0 ? Number(instrumentSpec.fxRateToEur) : 1.0;
    const ticksAtRisk = riskPerPriceUnit / Number(instrumentSpec.tickSize);
    const riskPerContractEur = ticksAtRisk * Number(instrumentSpec.tickValue) * fxToEur;
    const rawContracts = riskPerContractEur > 0 ? allowedRiskEur / riskPerContractEur : 0;
    const notionalPerContractEur = entryPrice * Number(instrumentSpec.contractSize) * fxToEur;
    const maxContractsByLev =
      notionalPerContractEur > 0 ? (safeEquity * maxLeverage) / notionalPerContractEur : rawContracts;
    const contracts = Math.max(0, Math.min(rawContracts, maxContractsByLev));

    return {
      valid: contracts > 0,
      quantity: round4(contracts * Number(instrumentSpec.contractSize)),
      contracts: round4(contracts),
      allowedRiskEur: round2(allowedRiskEur),
      effectiveRiskEur: round2(contracts * riskPerContractEur),
      exposureNotionalEur: round2(contracts * notionalPerContractEur),
      sizingMode: 'INSTRUMENT_SPEC_EXACT',
      limitationNote: null,
    };
  }

  // Transparent approximation when broker contract/tick metadata is not present in feed
  const rawUnits = allowedRiskEur / riskPerPriceUnit;
  const maxUnitsByLev = (safeEquity * maxLeverage) / entryPrice;
  const units = Math.max(0, Math.min(rawUnits, maxUnitsByLev));

  return {
    valid: units > 0,
    quantity: round4(units),
    contracts: null,
    allowedRiskEur: round2(allowedRiskEur),
    effectiveRiskEur: round2(units * riskPerPriceUnit),
    exposureNotionalEur: round2(units * entryPrice),
    sizingMode: 'UNIT_APPROXIMATION',
    limitationNote:
      'Broker contract size, tick value, and live FX conversion are not supplied by the chart feed; sizing uses 1:1 price-unit approximation capped by leverage.',
  };
}
