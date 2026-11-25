import { TechnicalAnalysisCore } from '../algorithms/technicalAnalysisCore.js?v=1.47.41';
import { TechnicalIndicators } from '../algorithms/technicalIndicators.js?v=1.47.41';
import {
  SIGNAL_CONTRACT_VERSION,
  MINIMUM_REQUIRED_RR,
  enforceMinimumRequiredRR,
  buildCausalStructureAtIndex,
  evaluateRiskRewardTradePlan,
} from './riskRewardEngine.js?v=1.47.41';
import {
  CLASSICAL_STRATEGY_REGISTRY,
  GENERATOR_EVALUATORS,
} from './classicalGenerators.js?v=1.47.41';

/**
 * Signal Engine Coordinator (`signal-gen/1.0`)
 *
 * Orchestrates:
 * 1. Strict closed-candle normalization & indicator calculation via `ta-core/1.1` (zero parallel indicator copies).
 * 2. Strictly causal swing & S/R zone indexing (bar `i` never sees swings/zones confirmed after `i`).
 * 3. Execution of independent Classical Signal Generators (`trend_pullback_v1`, `rsi_reversion_v1`,
 *    `breakout_v1`, `sma_crossover_v1`, `rsi_dip_v1`).
 * 4. Mandatory non-bypassable Risk/Reward Intelligence Hard Gate (`Net R:R >= 2.0`).
 * 5. Duplicate signal suppression (cooldown bars) and strict separation of `validSignals` vs `rejections` (`NO_TRADE`).
 */

function computeCausalSrZonesByBar(swings, atr14, swingLen = 3) {
  // Pre-build conservative causal S/R zones using confirmed swings up to each swing confirmation point.
  // For O(S) efficiency, attach `causalConfirmIndex` to zones built by TechnicalAnalysisCore and
  // also retain individual confirmed swings so `buildCausalStructureAtIndex` has zero future look-ahead.
  const zones = [];
  const confirmedHighs = [];
  const confirmedLows = [];

  for (const sw of swings) {
    const confirmIdx = Number.isFinite(sw.confirmIndex) ? sw.confirmIndex : sw.index + swingLen;
    const atr = Number(atr14[confirmIdx] ?? atr14[sw.index] ?? 0);
    const tol = Math.max(atr * 0.65, sw.price * 0.0015);
    const bucket = sw.type === 'SWING_HIGH' ? confirmedHighs : confirmedLows;
    const role = sw.type === 'SWING_HIGH' ? 'RESISTANCE' : 'SUPPORT';

    // Check if this swing clusters with an existing earlier confirmed swing of the same type
    let matched = null;
    for (let k = bucket.length - 1; k >= 0; k--) {
      const z = bucket[k];
      if (Math.abs(sw.price - z.centerPrice) <= tol) {
        matched = z;
        break;
      }
    }

    if (matched) {
      matched.touchCount += 1;
      matched.lowPrice = Math.min(matched.lowPrice, sw.price);
      matched.highPrice = Math.max(matched.highPrice, sw.price);
      matched.centerPrice = (matched.lowPrice + matched.highPrice) * 0.5;
      matched.lastTouchIndex = sw.index;
      if (matched.touchCount === 2) {
        // Causally confirmed as a >=2-touch S/R zone ONLY starting at this second swing's confirmation bar!
        matched.causalConfirmIndex = confirmIdx;
        zones.push({ ...matched });
      } else if (matched.touchCount > 2) {
        // Emit an updated snapshot valid from this later confirmation bar without mutating past bars
        zones.push({ ...matched, causalConfirmIndex: confirmIdx });
      }
    } else {
      bucket.push({
        role,
        touchCount: 1,
        startIndex: sw.index,
        lastTouchIndex: sw.index,
        lowPrice: sw.price,
        highPrice: sw.price,
        centerPrice: sw.price,
        causalConfirmIndex: Infinity,
      });
    }
  }

  return zones;
}

export function prepareTaCoreContext(rawCandles = [], options = {}) {
  const symbolCode = String(options.symbolCode || 'SPOTBRENT').toUpperCase();
  const timeframe = String(options.timeframe || 'M15').toUpperCase();
  const chartId = String(options.chartId || `${symbolCode}_${timeframe}`);
  const swingLen = Math.max(2, Math.min(6, Math.trunc(Number(options.swingLen ?? 3))));

  // Strict closed-candle filtering — open/forming candles are NEVER allowed to emit signals
  const { candles, quality } = TechnicalAnalysisCore.normalizeCandles(rawCandles, {
    symbolCode,
    timeframe,
    excludeOpenBars: true,
  });

  if (candles.length < 30) {
    return {
      ready: false,
      status: 'INSUFFICIENT_DATA',
      chartId,
      symbolCode,
      timeframe,
      candles,
      quality,
      indicators: null,
      swings: [],
      causalSrZones: [],
      swingLen,
    };
  }

  const core = TechnicalAnalysisCore.computeCoreIndicators(candles, {
    symbolCode,
    timeframe,
    excludeOpenBars: true,
  });

  // All derived indicators strictly use TechnicalIndicators (the engine inside ta-core/1.1) — zero parallel rewrites
  const indicators = {
    ...core.indicators,
    sma5: TechnicalIndicators.computeSma(candles, 5),
    sma50: TechnicalIndicators.computeSma(candles, 50),
    sma200: TechnicalIndicators.computeSma(candles, 200),
    ema50: TechnicalIndicators.computeEma(candles, 50),
    rsi2: TechnicalIndicators.computeRsi(candles, 2),
  };

  const swingResult = TechnicalAnalysisCore.detectSwingsAndTrend(candles, swingLen);
  const causalSrZones = computeCausalSrZonesByBar(swingResult.swings, indicators.atr14, swingLen);

  return {
    ready: true,
    status: 'READY',
    chartId,
    symbolCode,
    timeframe,
    candles,
    quality,
    indicators,
    swings: swingResult.swings,
    trend: swingResult.trend,
    causalSrZones,
    swingLen,
  };
}

function buildSignalId(chartId, strategyId, barTimeMs, side) {
  return `sig_${chartId}_${strategyId}_${barTimeMs}_${side}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Evaluates a single classical generator across the entire closed-candle history, enforcing:
 * - Zero look-ahead (causal swings/S/R only at bar `i`)
 * - Mandatory non-bypassable Risk/Reward Intelligence Hard Gate (Net R:R >= 2.0)
 * - Duplicate signal cooldown suppression
 * - Strict separation between `validSignals` and `rejections` (diagnostics)
 */
export function generateStrategySignals(taContext, strategyId, options = {}) {
  const evaluator = GENERATOR_EVALUATORS[strategyId];
  const meta = CLASSICAL_STRATEGY_REGISTRY.find((s) => s.id === strategyId);
  const minRequiredRR = enforceMinimumRequiredRR(options.minRequiredRR);

  if (!evaluator || !meta) {
    return {
      status: 'UNKNOWN_STRATEGY',
      strategyId,
      validSignals: [],
      rejections: [],
      latestDecision: {
        status: 'NO_TRADE',
        rejection_code: 'UNKNOWN_STRATEGY',
        reason: `NO TRADE: Strategy "${strategyId}" is not registered.`,
        minimum_required_rr: minRequiredRR,
      },
      summary: {
        totalCandidates: 0,
        validCount: 0,
        rejectedCount: 0,
        rejectedByRrCount: 0,
        avgAcceptedNetRR: 0,
      },
    };
  }

  if (!taContext || !taContext.ready || !Array.isArray(taContext.candles) || taContext.candles.length < 30) {
    return {
      status: 'INSUFFICIENT_DATA',
      strategyId,
      validSignals: [],
      rejections: [],
      latestDecision: {
        status: 'NO_TRADE',
        rejection_code: 'INSUFFICIENT_DATA',
        reason: 'NO TRADE: Insufficient closed market candles to evaluate strategy safely.',
        minimum_required_rr: minRequiredRR,
      },
      summary: {
        totalCandidates: 0,
        validCount: 0,
        rejectedCount: 0,
        rejectedByRrCount: 0,
        avgAcceptedNetRR: 0,
      },
    };
  }

  const params = {
    ...meta.defaultParams,
    ...(options.strategyParams || {}),
  };
  const direction = String(options.direction || 'BOTH').toUpperCase();
  const duplicateCooldownBars = Math.max(1, Math.min(30, Math.trunc(Number(options.duplicateCooldownBars ?? 4))));
  const costConfig = {
    spreadBps: Number(options.spreadBps ?? 4.0),
    commissionBps: Number(options.commissionBps ?? 5.0),
    slippageBps: Number(options.slippageBps ?? 2.0),
    minRequiredRR,
  };

  const validSignals = [];
  const rejections = [];
  let rejectedByRrCount = 0;
  let lastValidBarIndex = -999;
  let lastValidSide = null;

  const n = taContext.candles.length;
  for (let i = 0; i < n; i++) {
    const bar = taContext.candles[i];
    if (!bar || bar.is_closed === false) continue;

    // Strictly causal structure confirmed on or before bar `i`
    const structure = buildCausalStructureAtIndex(
      taContext.candles,
      taContext.swings,
      taContext.causalSrZones,
      i
    );

    const barCtx = {
      candles: taContext.candles,
      indicators: taContext.indicators,
      structure,
      bar,
      atr: taContext.indicators.atr14[i],
      barIndex: i,
      chartId: taContext.chartId,
      timeframe: taContext.timeframe,
      strategyId,
    };

    const candidate = evaluator(barCtx, i, params, direction);
    if (!candidate) continue;

    const signalTimeIso = new Date(bar.open_time_utc_ms).toISOString();

    // Duplicate signal suppression for the same trade setup / direction within cooldown window
    if (candidate.side === lastValidSide && i - lastValidBarIndex <= duplicateCooldownBars) {
      rejections.push({
        signal_id: buildSignalId(taContext.chartId, strategyId, bar.open_time_utc_ms, candidate.side),
        chart_id: taContext.chartId,
        timeframe: taContext.timeframe,
        strategy_id: strategyId,
        side: candidate.side,
        status: 'no_trade',
        rejection_code: 'DUPLICATE_SIGNAL_SUPPRESSED',
        signal_time_utc: signalTimeIso,
        signal_time_utc_ms: bar.open_time_utc_ms,
        bar_index: i,
        entry_price_suggested: candidate.entryPrice,
        stop_loss_suggested: candidate.stopLossPrice,
        take_profit_suggested: [],
        risk_reward: {
          gross_rr: 0,
          net_rr: 0,
          minimum_required_rr: minRequiredRR,
          tier: 'REJECTED',
          passed: false,
        },
        reason: `NO TRADE: Duplicate ${candidate.side} setup suppressed within ${duplicateCooldownBars}-bar cooldown window.`,
        version: SIGNAL_CONTRACT_VERSION,
      });
      continue;
    }

    // NON-BYPASSABLE Risk/Reward Intelligence Hard Gate
    const verdict = evaluateRiskRewardTradePlan(candidate, barCtx, costConfig);

    if (!verdict.passed) {
      if (
        verdict.rejection_code === 'GROSS_RR_BELOW_MINIMUM' ||
        verdict.rejection_code === 'NET_RR_BELOW_MINIMUM'
      ) {
        rejectedByRrCount++;
      }
      rejections.push({
        signal_id: buildSignalId(taContext.chartId, strategyId, bar.open_time_utc_ms, candidate.side),
        chart_id: taContext.chartId,
        timeframe: taContext.timeframe,
        strategy_id: strategyId,
        side: candidate.side,
        status: 'no_trade',
        rejection_code: verdict.rejection_code,
        signal_time_utc: signalTimeIso,
        signal_time_utc_ms: bar.open_time_utc_ms,
        bar_index: i,
        entry_price_suggested: verdict.entry_price_suggested,
        stop_loss_suggested: verdict.stop_loss_suggested,
        take_profit_suggested: verdict.take_profit_suggested,
        risk_reward: verdict.risk_reward,
        reason: verdict.reason,
        indicators_snapshot: candidate.indicatorsSnapshot || {},
        structural_context: verdict.structural_context,
        version: SIGNAL_CONTRACT_VERSION,
      });
      continue;
    }

    // Validated signal strictly adhering to `signal-gen/1.0` contract
    lastValidBarIndex = i;
    lastValidSide = candidate.side;

    validSignals.push({
      signal_id: buildSignalId(taContext.chartId, strategyId, bar.open_time_utc_ms, candidate.side),
      chart_id: taContext.chartId,
      timeframe: taContext.timeframe,
      strategy_id: strategyId,
      strategy_name_en: meta.nameEn,
      strategy_name_fa: meta.nameFa,
      is_research_baseline: Boolean(meta.isResearchBenchmarkOnly),
      side: candidate.side,
      status: 'valid',
      signal_time_utc: signalTimeIso,
      signal_time_utc_ms: bar.open_time_utc_ms,
      bar_index: i,
      entry_price_suggested: verdict.entry_price_suggested,
      stop_loss_suggested: verdict.stop_loss_suggested,
      take_profit_suggested: verdict.take_profit_suggested,
      risk_reward: verdict.risk_reward,
      reason: verdict.reason,
      strength: Number(candidate.strength ?? 0.7),
      exit_rule: candidate.exitRule || null,
      indicators_snapshot: candidate.indicatorsSnapshot || {},
      structural_context: verdict.structural_context,
      version: SIGNAL_CONTRACT_VERSION,
    });
  }

  // Determine explicit latest-bar live assessment (`VALID` on latest/recent bar OR explicit `NO_TRADE`)
  const lastIdx = n - 1;
  const lastBar = taContext.candles[lastIdx];
  const lastValid = validSignals.length > 0 ? validSignals[validSignals.length - 1] : null;
  const lastRejection = rejections.length > 0 ? rejections[rejections.length - 1] : null;

  let latestDecision;
  if (lastValid && lastValid.bar_index === lastIdx) {
    latestDecision = {
      status: 'VALID',
      signal: lastValid,
      reason: lastValid.reason,
      minimum_required_rr: minRequiredRR,
      evaluated_bar_time_utc: lastValid.signal_time_utc,
    };
  } else if (lastRejection && lastRejection.bar_index === lastIdx) {
    latestDecision = {
      status: 'NO_TRADE',
      rejection_code: lastRejection.rejection_code,
      reason: lastRejection.reason,
      risk_reward: lastRejection.risk_reward,
      minimum_required_rr: minRequiredRR,
      evaluated_bar_time_utc: lastRejection.signal_time_utc,
      lastValidSignal: lastValid,
    };
  } else {
    const needBars = strategyId === 'rsi_dip_v1' ? 20 : strategyId === 'breakout_v1' ? Number(params.breakoutPeriod ?? 20) + 1 : 201;
    const isWarmupShort = n < needBars;
    latestDecision = {
      status: 'NO_TRADE',
      rejection_code: isWarmupShort ? 'INSUFFICIENT_WARMUP_BARS' : 'NO_SETUP_ON_LATEST_BAR',
      reason: isWarmupShort
        ? `NO TRADE: Need at least ${needBars} closed candles for ${meta.nameEn} (available: ${n}).`
        : `NO TRADE: No valid high-probability setup meeting minimum ${minRequiredRR.toFixed(2)}R Net R:R on the latest closed candle.`,
      minimum_required_rr: minRequiredRR,
      evaluated_bar_time_utc: lastBar ? new Date(lastBar.open_time_utc_ms).toISOString() : null,
      lastValidSignal: lastValid,
    };
  }

  const avgAcceptedNetRR =
    validSignals.length > 0
      ? Math.round(
          (validSignals.reduce((acc, s) => acc + Number(s.risk_reward?.net_rr || 0), 0) / validSignals.length) * 100
        ) / 100
      : 0;

  return {
    status: 'READY',
    version: SIGNAL_CONTRACT_VERSION,
    strategyId,
    validSignals,
    rejections,
    latestDecision,
    summary: {
      totalCandidates: validSignals.length + rejections.length,
      validCount: validSignals.length,
      rejectedCount: rejections.length,
      rejectedByRrCount,
      avgAcceptedNetRR,
      minimumRequiredRR: minRequiredRR,
    },
  };
}

export const SignalEngine = {
  VERSION: SIGNAL_CONTRACT_VERSION,
  MINIMUM_REQUIRED_RR,
  STRATEGIES: CLASSICAL_STRATEGY_REGISTRY,
  prepareTaCoreContext,
  generateStrategySignals,
  evaluateRiskRewardTradePlan,
};
