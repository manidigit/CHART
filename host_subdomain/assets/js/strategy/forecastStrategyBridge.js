import { buildDecisionSummary } from '../forecast/decisionLayer.js?v=1.47.41';
import {
  DATA_READINESS_STATE,
  EDGE_STATUS,
  FORECAST_STATUS,
  MODEL_EXECUTION_STATUS,
} from '../forecast/forecastContract.js?v=1.47.41';
import { resolveModelGovernance } from '../forecast/modelRegistry.js?v=1.47.41';
import {
  MINIMUM_REQUIRED_RR,
  buildCausalStructureAtIndex,
  enforceMinimumRequiredRR,
  evaluateRiskRewardTradePlan,
} from './riskRewardEngine.js?v=1.47.41';
import { prepareTaCoreContext } from './signalEngine.js?v=1.47.41';

/**
 * Controlled One-Way Forecast -> Strategy Bridge (`forecast-strategy-bridge/1.0.0`)
 *
 * Strictly implements Master Plan §10 & §13 (S-01..S-06):
 *   1. Strictly one-way (Forecast -> Strategy). Never imports or mutates Forecast state from Strategy.
 *   2. Classical Strategies remain 100% independent of Forecast (S-06).
 *   3. Enforces all 8 mandatory passage gates (§10.2):
 *      - Gate 1: Forecast Decision Status === 'VALID' (PROVISIONAL, NO_EDGE, INSUFFICIENT_EVIDENCE, DATA_NOT_READY blocked)
 *      - Gate 2: edgeStatus === 'PROVEN' and allowStrategy === true
 *      - Gate 3: Selected model is NOT experimentalOnly / EXPERIMENTAL_APPROX
 *      - Gate 4: Provenance & Context alignment (symbolCode, timeframe, inputHash, modelId)
 *      - Gate 5: Origin Timestamp freshness (forecast anchorOpenTimeUtcMs matches latest closed candle within maxStaleBars)
 *      - Gate 6: Causal market structure ready via prepareTaCoreContext (excludeOpenBars: true)
 *      - Gate 7: Meaningful directional displacement (>= minMoveAtrMult * ATR14) with structural Stop Loss
 *      - Gate 8: Independent Strategy Hard Gates via evaluateRiskRewardTradePlan:
 *                closed-bar decision, next-bar open execution (S-01), nearest causal structural TP1 without
 *                skipping closer barriers (S-03), round-trip Spread+Commission+Slippage, and immutable Net R:R >= 2.0 (S-02, S-05).
 *   4. Research Preview Option (`allowResearchPreview: true`):
 *      - When blocked by Forecast status (e.g. PROVISIONAL), computes a non-actionable preview object
 *        explicitly tagged `isPreviewOnly: true`, `actionable: false`, `status: 'no_trade'` (S-04).
 */

export const FORECAST_STRATEGY_BRIDGE_VERSION = 'forecast-strategy-bridge/1.0.0';

export const BRIDGE_REJECTION_CODE = Object.freeze({
  FORECAST_MISSING: 'FORECAST_MISSING',
  FORECAST_DATA_NOT_READY_BLOCKED: 'FORECAST_DATA_NOT_READY_BLOCKED',
  FORECAST_INSUFFICIENT_EVIDENCE_BLOCKED: 'FORECAST_INSUFFICIENT_EVIDENCE_BLOCKED',
  FORECAST_PROVISIONAL_BLOCKED: 'FORECAST_PROVISIONAL_BLOCKED',
  FORECAST_NO_EDGE_BLOCKED: 'FORECAST_NO_EDGE_BLOCKED',
  FORECAST_EDGE_NOT_PROVEN: 'FORECAST_EDGE_NOT_PROVEN',
  FORECAST_EXPERIMENTAL_MODEL_BLOCKED: 'FORECAST_EXPERIMENTAL_MODEL_BLOCKED',
  FORECAST_CONTEXT_MISMATCH: 'FORECAST_CONTEXT_MISMATCH',
  FORECAST_PROVENANCE_INCOMPLETE: 'FORECAST_PROVENANCE_INCOMPLETE',
  FORECAST_STALE_ORIGIN: 'FORECAST_STALE_ORIGIN',
  TA_CONTEXT_NOT_READY: 'TA_CONTEXT_NOT_READY',
  FORECAST_NEUTRAL_DISPLACEMENT: 'FORECAST_NEUTRAL_DISPLACEMENT',
  NO_STRUCTURAL_STOP_CANDIDATE: 'NO_STRUCTURAL_STOP_CANDIDATE',
});

function round4(v) {
  return Math.round((Number(v) || 0) * 10000) / 10000;
}

function deriveForecastBridgeCandidate(forecastResult, decisionSummary, taContext, lastIdx, options = {}) {
  const candles = taContext.candles;
  const bar = candles[lastIdx];
  const atrSeries = taContext.indicators?.atr14 || taContext.atr14 || [];
  const atrNow = Number(atrSeries[lastIdx] || 0);
  if (!bar || !(atrNow > 0)) {
    return {
      ok: false,
      rejectionCode: BRIDGE_REJECTION_CODE.TA_CONTEXT_NOT_READY,
      reason: 'NO TRADE: Causal ATR(14) or latest closed bar is not ready.',
    };
  }

  const pts = Array.isArray(forecastResult?.points) ? forecastResult.points : [];
  if (pts.length === 0) {
    return {
      ok: false,
      rejectionCode: BRIDGE_REJECTION_CODE.FORECAST_PROVENANCE_INCOMPLETE,
      reason: 'NO TRADE: Forecast trajectory contains no horizon points.',
    };
  }

  const terminalPt = pts[pts.length - 1];
  const terminalQ50 = Number(terminalPt?.q50 ?? terminalPt?.q50_median ?? NaN);
  const terminalQ10 = Number(terminalPt?.q10 ?? NaN);
  const terminalQ90 = Number(terminalPt?.q90 ?? NaN);
  const entryRef = Number(bar.close);
  if (!Number.isFinite(terminalQ50) || !(entryRef > 0)) {
    return {
      ok: false,
      rejectionCode: BRIDGE_REJECTION_CODE.FORECAST_PROVENANCE_INCOMPLETE,
      reason: 'NO TRADE: Forecast terminal median (Q50) is not finite.',
    };
  }

  const projectedMove = terminalQ50 - entryRef;
  const minMoveAtrMult = Number.isFinite(Number(options.minProjectedAtrMult))
    ? Math.max(0.25, Number(options.minProjectedAtrMult))
    : 0.5;

  if (Math.abs(projectedMove) < minMoveAtrMult * atrNow) {
    return {
      ok: false,
      rejectionCode: BRIDGE_REJECTION_CODE.FORECAST_NEUTRAL_DISPLACEMENT,
      reason: `NO TRADE: Forecast median displacement (${round4(projectedMove)}) is smaller than ${minMoveAtrMult}×ATR (${round4(minMoveAtrMult * atrNow)}).`,
    };
  }

  const side = projectedMove > 0 ? 'long' : 'short';
  const structure = buildCausalStructureAtIndex(
    candles,
    taContext.swings || taContext.causalSwings || [],
    taContext.causalSrZones || [],
    lastIdx
  );
  const atrStopBuffer = Number.isFinite(Number(options.atrStopBuffer))
    ? Math.max(0.2, Math.min(1.5, Number(options.atrStopBuffer)))
    : 0.5;

  let stopLoss = null;
  let stopBasis = '';

  const swingLows = structure.swingLows || structure.recentSwingLows || [];
  const swingHighs = structure.swingHighs || structure.recentSwingHighs || [];
  const supports = structure.supports || structure.supportZones || [];
  const resistances = structure.resistances || structure.resistanceZones || [];

  if (side === 'long') {
    const swingLow = [...swingLows].reverse().find((s) => s.price < entryRef);
    const supportZone = supports[supports.length - 1] || null;
    if (swingLow && supportZone) {
      const structFloor = Math.min(swingLow.price, supportZone.lowPrice ?? supportZone.price ?? swingLow.price);
      stopLoss = structFloor - atrStopBuffer * atrNow;
      stopBasis = `confirmed swing low (${round4(swingLow.price)}) & support zone`;
    } else if (swingLow) {
      stopLoss = swingLow.price - atrStopBuffer * atrNow;
      stopBasis = `confirmed swing low (${round4(swingLow.price)})`;
    } else if (supportZone) {
      const supFloor = Number(supportZone.lowPrice ?? supportZone.price);
      stopLoss = supFloor - atrStopBuffer * atrNow;
      stopBasis = `causal support zone (${round4(supFloor)})`;
    } else if (Number.isFinite(terminalQ10) && terminalQ10 < entryRef - 0.4 * atrNow) {
      stopLoss = Math.max(entryRef - 3.5 * atrNow, terminalQ10);
      stopBasis = `calibrated Q10 lower bound (${round4(terminalQ10)})`;
    }
  } else {
    const swingHigh = [...swingHighs].reverse().find((s) => s.price > entryRef);
    const resistanceZone = resistances[resistances.length - 1] || null;
    if (swingHigh && resistanceZone) {
      const structCeiling = Math.max(swingHigh.price, resistanceZone.highPrice ?? resistanceZone.price ?? swingHigh.price);
      stopLoss = structCeiling + atrStopBuffer * atrNow;
      stopBasis = `confirmed swing high (${round4(swingHigh.price)}) & resistance zone`;
    } else if (swingHigh) {
      stopLoss = swingHigh.price + atrStopBuffer * atrNow;
      stopBasis = `confirmed swing high (${round4(swingHigh.price)})`;
    } else if (resistanceZone) {
      const resCeil = Number(resistanceZone.highPrice ?? resistanceZone.price);
      stopLoss = resCeil + atrStopBuffer * atrNow;
      stopBasis = `causal resistance zone (${round4(resCeil)})`;
    } else if (Number.isFinite(terminalQ90) && terminalQ90 > entryRef + 0.4 * atrNow) {
      stopLoss = Math.min(entryRef + 3.5 * atrNow, terminalQ90);
      stopBasis = `calibrated Q90 upper bound (${round4(terminalQ90)})`;
    }
  }

  if (!Number.isFinite(stopLoss) || stopLoss <= 0) {
    return {
      ok: false,
      side,
      rejectionCode: BRIDGE_REJECTION_CODE.NO_STRUCTURAL_STOP_CANDIDATE,
      reason: 'NO TRADE: No causal swing or S/R structure available to anchor Stop Loss.',
    };
  }

  // NOTE (S-03): We never pass an artificial TP target or skip closer causal structural barriers.
  // `explicitTargets: null` forces `evaluateRiskRewardTradePlan` to sort all causal structural barriers
  // strictly by distance (`a.dist - b.dist`) and pick the nearest barrier as TP1.
  return {
    ok: true,
    side,
    entryRef,
    stopLoss,
    stopBasis,
    terminalQ50,
    terminalQ10: Number.isFinite(terminalQ10) ? terminalQ10 : null,
    terminalQ90: Number.isFinite(terminalQ90) ? terminalQ90 : null,
    projectedMove,
    structure,
    bar,
    atrNow,
  };
}

function buildForecastProvenance(forecastResult, decisionSummary) {
  return {
    bridgeVersion: FORECAST_STRATEGY_BRIDGE_VERSION,
    inputHash: String(forecastResult?.inputHash || ''),
    forecastHash: String(
      forecastResult?.forecastHash ||
        `${forecastResult?.symbolCode || 'UNK'}_${forecastResult?.timeframe || 'TF'}_${forecastResult?.anchorOpenTimeUtcMs || 0}_${decisionSummary?.modelId || 'model'}_${forecastResult?.inputHash || 'nohash'}`
    ),
    modelId: String(decisionSummary?.modelId || forecastResult?.selectedChartModelId || 'naive_persistence'),
    modelName: String(decisionSummary?.modelName || 'Naive Persistence'),
    modelVersion: String(decisionSummary?.modelVersion || forecastResult?.engineVersion || '2.0.0'),
    pathSemantics: String(decisionSummary?.pathSemantics || 'MARGINAL_MEDIAN'),
    selectionMode: String(decisionSummary?.selectionMode || forecastResult?.selectionMode || 'NO_CLEAR_WINNER_BASELINE'),
    selectionTier: String(decisionSummary?.selectionTier || 'BASELINE'),
    decisionStatus: String(decisionSummary?.status || FORECAST_STATUS.DATA_NOT_READY),
    edgeStatus: String(decisionSummary?.edgeStatus || EDGE_STATUS.UNKNOWN),
    decisionReasonCode: String(decisionSummary?.reasonCode || 'UNKNOWN'),
    anchorOpenTimeUtcMs: Number(forecastResult?.anchorOpenTimeUtcMs || 0),
    horizonBars: Number(forecastResult?.horizonBars || (forecastResult?.points?.length ?? 0)),
  };
}

/**
 * Evaluates whether a Forecast output is eligible to propose a candidate to the Strategy Engine,
 * and if so, runs it through all independent Strategy Risk/Reward Hard Gates (Net R:R >= 2.0,
 * nearest causal structural TP1, closed-bar decision, next-bar open execution).
 */
export function evaluateForecastStrategyBridge(forecastResult, rawCandles = [], options = {}) {
  const minRequiredRR = enforceMinimumRequiredRR(options.minRequiredRR ?? MINIMUM_REQUIRED_RR);
  const allowResearchPreview = Boolean(options.allowResearchPreview);
  const maxStaleBars = Number.isFinite(Number(options.maxStaleBars))
    ? Math.max(0, Math.trunc(Number(options.maxStaleBars)))
    : 0;

  if (!forecastResult || typeof forecastResult !== 'object') {
    return {
      bridgeVersion: FORECAST_STRATEGY_BRIDGE_VERSION,
      passed: false,
      status: 'no_trade',
      actionable: false,
      rejection_code: BRIDGE_REJECTION_CODE.FORECAST_MISSING,
      reason: 'NO TRADE: Forecast result is missing.',
      reasonFa: 'بدون معامله: خروجی پیش‌بینی موجود نیست.',
      minimum_required_rr: minRequiredRR,
      signal: null,
      researchPreview: null,
      forecastProvenance: null,
    };
  }

  const decisionSummary =
    forecastResult.decisionSummary && typeof forecastResult.decisionSummary === 'object'
      ? forecastResult.decisionSummary
      : buildDecisionSummary(forecastResult);
  const provenance = buildForecastProvenance(forecastResult, decisionSummary);

  const reqSymbol = options.symbolCode ? String(options.symbolCode).trim().toUpperCase() : null;
  const reqTf = options.timeframe ? String(options.timeframe).trim().toUpperCase() : null;
  const fcSymbol = String(forecastResult.symbolCode || '').trim().toUpperCase();
  const fcTf = String(forecastResult.timeframe || '').trim().toUpperCase();

  const taContext =
    options.taContext && options.taContext.ready
      ? options.taContext
      : prepareTaCoreContext(rawCandles, {
          symbolCode: reqSymbol || fcSymbol || 'UNKNOWN',
          timeframe: reqTf || fcTf || 'M15',
        });

  const buildBlockedResponse = (rejectionCode, reasonEn, reasonFa, canPreview = false) => {
    let researchPreview = null;
    if (allowResearchPreview && canPreview && taContext?.ready && taContext.candles.length > 0) {
      const lastIdx = taContext.candles.length - 1;
      const cand = deriveForecastBridgeCandidate(forecastResult, decisionSummary, taContext, lastIdx, options);
      if (cand.ok) {
        const rrEval = evaluateRiskRewardTradePlan(
          {
            side: cand.side,
            entryPrice: cand.entryRef,
            stopLossPrice: cand.stopLoss,
            explicitTargets: null,
          },
          {
            bar: cand.bar,
            barIndex: lastIdx,
            atr: cand.atrNow,
            indicators: taContext.indicators,
            structure: cand.structure,
          },
          {
            minRequiredRR,
            spreadBps: options.spreadBps ?? 4.0,
            commissionBps: options.commissionBps ?? 5.0,
            slippageBps: options.slippageBps ?? 2.0,
          }
        );
        researchPreview = {
          isPreviewOnly: true,
          actionable: false,
          status: 'no_trade',
          warning: 'RESEARCH PREVIEW ONLY — NOT A VALID SIGNAL (FORECAST EDGE NOT PROVEN)',
          warningFa: 'صرفاً پیش‌نمایش پژوهشی — سیگنال معاملاتی معتبر نیست (لبه آماری پیش‌بینی اثبات نشده است)',
          side: cand.side,
          entry_price_reference: round4(cand.entryRef),
          stop_loss_reference: round4(cand.stopLoss),
          take_profit_reference: Array.isArray(rrEval.take_profit_suggested) ? rrEval.take_profit_suggested : [],
          hypothetical_rr_passed: Boolean(rrEval.passed),
          hypothetical_net_rr: rrEval.risk_reward?.net_rr ?? 0,
          hypothetical_gross_rr: rrEval.risk_reward?.gross_rr ?? 0,
          hypothetical_rejection_code: rrEval.rejection_code || null,
        };
      }
    }

    return {
      bridgeVersion: FORECAST_STRATEGY_BRIDGE_VERSION,
      passed: false,
      status: 'no_trade',
      actionable: false,
      rejection_code: rejectionCode,
      reason: reasonEn,
      reasonFa,
      minimum_required_rr: minRequiredRR,
      signal: null,
      researchPreview,
      forecastProvenance: provenance,
    };
  };

  // Gate 1: Forecast Decision Status check (S-04)
  if (
    forecastResult.status === FORECAST_STATUS.DATA_NOT_READY ||
    decisionSummary.status === FORECAST_STATUS.DATA_NOT_READY ||
    decisionSummary.readinessState !== DATA_READINESS_STATE.READY
  ) {
    return buildBlockedResponse(
      BRIDGE_REJECTION_CODE.FORECAST_DATA_NOT_READY_BLOCKED,
      `NO TRADE: Forecast data is not ready (${decisionSummary.readinessState || 'DATA_NOT_READY'}).`,
      `بدون معامله: دادهٔ ورودی پیش‌بینی آماده نیست (${decisionSummary.readinessState || 'DATA_NOT_READY'}).`,
      false
    );
  }

  if (decisionSummary.status === FORECAST_STATUS.INSUFFICIENT_EVIDENCE) {
    return buildBlockedResponse(
      BRIDGE_REJECTION_CODE.FORECAST_INSUFFICIENT_EVIDENCE_BLOCKED,
      'NO TRADE: Forecast OOS statistical evidence is insufficient (< 30 windows or N_eff < 25).',
      'بدون معامله: شواهد آماری برون‌نمونه‌ای (OOS) پیش‌بینی کافی نیست.',
      true
    );
  }

  if (decisionSummary.status === FORECAST_STATUS.PROVISIONAL) {
    return buildBlockedResponse(
      BRIDGE_REJECTION_CODE.FORECAST_PROVISIONAL_BLOCKED,
      `NO TRADE: Forecast status is PROVISIONAL (${decisionSummary.reasonCode}); provisional forecasts cannot emit actionable signals.`,
      `بدون معامله: وضعیت پیش‌بینی موقت (PROVISIONAL - ${decisionSummary.reasonCode}) است و مجاز به تولید سیگنال عملیاتی نیست.`,
      true
    );
  }

  if (decisionSummary.status === FORECAST_STATUS.NO_EDGE) {
    return buildBlockedResponse(
      BRIDGE_REJECTION_CODE.FORECAST_NO_EDGE_BLOCKED,
      'NO TRADE: Forecast has NO_EDGE over the Naive random-walk baseline.',
      'بدون معامله: پیش‌بینی فاقد برتری آماری (NO_EDGE) نسبت به مدل مبنا است.',
      true
    );
  }

  // Gate 2: Strict VALID + PROVEN + allowStrategy check
  if (
    decisionSummary.status !== FORECAST_STATUS.VALID ||
    decisionSummary.edgeStatus !== EDGE_STATUS.PROVEN ||
    decisionSummary.allowStrategy !== true
  ) {
    return buildBlockedResponse(
      BRIDGE_REJECTION_CODE.FORECAST_EDGE_NOT_PROVEN,
      'NO TRADE: Forecast does not have VALID status with PROVEN OOS edge.',
      'بدون معامله: پیش‌بینی دارای وضعیت معتبر (VALID) و لبهٔ آماری اثبات‌شده نیست.',
      true
    );
  }

  // Gate 3: Model Governance Tier check (no experimental approximations)
  const gov = resolveModelGovernance(provenance.modelId, {
    experimentalOnly: decisionSummary.isExperimentalOnly,
  });
  if (decisionSummary.isExperimentalOnly || gov.experimentalOnly || !gov.decisionPoolEligible) {
    return buildBlockedResponse(
      BRIDGE_REJECTION_CODE.FORECAST_EXPERIMENTAL_MODEL_BLOCKED,
      `NO TRADE: Model ${provenance.modelId} is an experimental approximation and is forbidden in Strategy Bridge.`,
      `بدون معامله: مدل ${provenance.modelId} صرفاً پژوهشی/تقریبی است و مجاز به ورود به استراتژی نیست.`,
      false
    );
  }

  // Gate 4: Symbol, Timeframe & Provenance completeness check
  if ((reqSymbol && fcSymbol && reqSymbol !== fcSymbol) || (reqTf && fcTf && reqTf !== fcTf)) {
    return buildBlockedResponse(
      BRIDGE_REJECTION_CODE.FORECAST_CONTEXT_MISMATCH,
      `NO TRADE: Forecast context (${fcSymbol}/${fcTf}) does not match Strategy context (${reqSymbol}/${reqTf}).`,
      `بدون معامله: نماد یا تایم‌فریم پیش‌بینی (${fcSymbol}/${fcTf}) با استراتژی (${reqSymbol}/${reqTf}) هم‌خوانی ندارد.`,
      false
    );
  }

  if (
    !provenance.inputHash ||
    !provenance.modelId ||
    provenance.modelId === 'naive_persistence' ||
    !Array.isArray(forecastResult.points) ||
    forecastResult.points.length < 3
  ) {
    return buildBlockedResponse(
      BRIDGE_REJECTION_CODE.FORECAST_PROVENANCE_INCOMPLETE,
      'NO TRADE: Forecast provenance (inputHash / non-baseline modelId / trajectory points) is incomplete.',
      'بدون معامله: شناسنامهٔ فنی پیش‌بینی (inputHash یا مسیر مدل غیرمبنا) ناقص است.',
      false
    );
  }

  // Gate 5 & 6: Causal TA context readiness & origin timestamp alignment
  if (!taContext || !taContext.ready || !Array.isArray(taContext.candles) || taContext.candles.length === 0) {
    return buildBlockedResponse(
      BRIDGE_REJECTION_CODE.TA_CONTEXT_NOT_READY,
      'NO TRADE: TechnicalAnalysisCore context is not ready (insufficient closed bars).',
      'بدون معامله: موتور تحلیل تکنیکال علّی به دلیل کمبود کندل بسته آماده نیست.',
      false
    );
  }

  const candles = taContext.candles;
  const lastIdx = candles.length - 1;
  const lastClosedBar = candles[lastIdx];
  const anchorMs = Number(forecastResult.anchorOpenTimeUtcMs || 0);
  const matchingIdx = candles.findIndex((c) => Number(c.open_time_utc_ms) === anchorMs);

  if (matchingIdx === -1 || lastIdx - matchingIdx > maxStaleBars) {
    return buildBlockedResponse(
      BRIDGE_REJECTION_CODE.FORECAST_STALE_ORIGIN,
      `NO TRADE: Forecast origin (${anchorMs}) does not match latest closed bar (${lastClosedBar.open_time_utc_ms}).`,
      'بدون معامله: کندل مبدأ پیش‌بینی با آخرین کندل بسته‌شدهٔ بازار هم‌تراز نیست (پیش‌بینی قدیمی/Stale است).',
      false
    );
  }

  // Gate 7: Causal structural candidate derivation
  const cand = deriveForecastBridgeCandidate(forecastResult, decisionSummary, taContext, lastIdx, options);
  if (!cand.ok) {
    return buildBlockedResponse(
      cand.rejectionCode,
      cand.reason,
      'بدون معامله: جابه‌جایی میانهٔ پیش‌بینی یا ساختار حد ضرر علّی شرایط لازم را ندارد.',
      false
    );
  }

  // Gate 8: Independent Strategy Hard Gate evaluation (S-01, S-02, S-03, S-05)
  const rrEval = evaluateRiskRewardTradePlan(
    {
      side: cand.side,
      entryPrice: cand.entryRef,
      stopLossPrice: cand.stopLoss,
      explicitTargets: null, // Strictly nearest causal structural barrier (S-03)
    },
    {
      bar: cand.bar,
      barIndex: lastIdx,
      atr: cand.atrNow,
      indicators: taContext.indicators,
      structure: cand.structure,
    },
    {
      minRequiredRR,
      spreadBps: options.spreadBps ?? 4.0,
      commissionBps: options.commissionBps ?? 5.0,
      slippageBps: options.slippageBps ?? 2.0,
    }
  );

  if (!rrEval.passed) {
    return {
      bridgeVersion: FORECAST_STRATEGY_BRIDGE_VERSION,
      passed: false,
      status: 'no_trade',
      actionable: false,
      rejection_code: rrEval.rejection_code,
      reason: rrEval.reason,
      reasonFa: `بدون معامله در دروازهٔ ریسک به ریوارد استراتژی: ${rrEval.reason}`,
      minimum_required_rr: minRequiredRR,
      risk_reward: rrEval.risk_reward,
      signal: null,
      researchPreview: null,
      forecastProvenance: provenance,
    };
  }

  const takeProfits = Array.isArray(rrEval.take_profit_suggested) ? rrEval.take_profit_suggested : [];
  const tp1Source = rrEval.structural_context?.tp1_source || 'CAUSAL_STRUCTURE';

  const signal = {
    contract_version: 'signal-gen/1.0',
    bridge_version: FORECAST_STRATEGY_BRIDGE_VERSION,
    signal_id: `fc_bridge_${fcSymbol || 'SYM'}_${fcTf || 'TF'}_${cand.bar.open_time_utc_ms}_${cand.side}`,
    strategy_id: 'forecast_guided_bridge_v1',
    strategy_name: `Forecast-Guided Bridge (${provenance.modelName})`,
    symbol: fcSymbol || taContext.symbolCode,
    timeframe: fcTf || taContext.timeframe,
    bar_index: lastIdx,
    signal_time_utc_ms: cand.bar.open_time_utc_ms,
    is_closed_bar: true,
    side: cand.side,
    status: 'VALID',
    strength: round4(decisionSummary.confidence === 'HIGH' ? 0.86 : 0.74),
    confidence: decisionSummary.confidence === 'HIGH' ? 'high' : 'medium',
    entry_type: 'next_bar_open_market',
    entry_price_suggested: round4(rrEval.entry_price_suggested ?? cand.entryRef),
    stop_loss_suggested: round4(rrEval.stop_loss_suggested ?? cand.stopLoss),
    take_profit_suggested: takeProfits,
    risk_reward: rrEval.risk_reward,
    minimum_required_rr: minRequiredRR,
    executionPlan: {
      decisionBarIndex: lastIdx,
      decisionBarOpenTimeUtcMs: cand.bar.open_time_utc_ms,
      entryExecutionPolicy: 'NEXT_BAR_OPEN_ONLY',
      nextBarIndex: lastIdx + 1,
      intrabarTieBreaker: 'SL_BEFORE_TP',
    },
    forecastProvenance: provenance,
    reason: `VALIDATED (Net R:R 1:${rrEval.risk_reward.net_rr.toFixed(2)}): ${provenance.modelName} [VALID/PROVEN] projected ${cand.side.toUpperCase()} to Q50=${round4(cand.terminalQ50)}; SL anchored to ${cand.stopBasis}; TP1 at nearest causal ${tp1Source}.`,
  };

  return {
    bridgeVersion: FORECAST_STRATEGY_BRIDGE_VERSION,
    passed: true,
    status: 'VALID',
    actionable: true,
    rejection_code: null,
    reason: signal.reason,
    reasonFa: `تأیید شد (Net R:R 1:${rrEval.risk_reward.net_rr.toFixed(2)}): پیش‌بینی معتبر و اثبات‌شدهٔ ${provenance.modelName} از تمام گیت‌های علّی و ریسک به ریوارد استراتژی عبور کرد.`,
    minimum_required_rr: minRequiredRR,
    risk_reward: rrEval.risk_reward,
    signal,
    researchPreview: null,
    forecastProvenance: provenance,
  };
}
