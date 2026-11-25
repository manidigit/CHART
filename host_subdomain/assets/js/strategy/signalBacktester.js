import {
  MINIMUM_REQUIRED_RR,
  enforceMinimumRequiredRR,
  calculateInstrumentPositionSizing,
} from './riskRewardEngine.js?v=1.47.41';
import { CLASSICAL_STRATEGY_REGISTRY } from './classicalGenerators.js?v=1.47.41';
import { prepareTaCoreContext, generateStrategySignals } from './signalEngine.js?v=1.47.41';

/**
 * Event-Driven Causal Backtest & Multi-Strategy Comparison Engine (`strategy-sim/2.0`)
 *
 * Adapted architectural principles (documented in External Sources):
 * - Bar-by-bar event-driven execution inspired by `backtestkit` (MIT) without external dependencies.
 * - Strict closed-bar signal generation -> next-bar open execution (zero look-ahead bias).
 * - Conservative intrabar tie-breaker: `SL_BEFORE_TP` whenever both SL and TP1 are touched inside the same bar.
 * - Parallel Gross (zero-cost) & Net (Spread + Commission + Slippage + Swap) evaluation.
 * - Full metric suite: Net Return, Gross Return, CAGR, Win Rate, Profit Factor, Max DD, Sharpe, Sortino,
 *   Avg R, Expectancy, Consecutive Wins/Losses, Avg Holding Period, Total Costs, RR-Rejected Count,
 *   Avg Accepted Net RR, Exposure, Cost Sensitivity (1.0x/1.5x/2.0x), and chronological 70/30 IS/OOS split.
 */

export const SIGNAL_BACKTEST_VERSION = 'strategy-sim/2.0';

function round2(v) {
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

function round4(v) {
  return Number.isFinite(v) ? Math.round(v * 10000) / 10000 : 0;
}

function executeSignalsPass(taContext, validSignals, cfg, frictionMult = 1.0, startIdx = 0, endIdx = null) {
  const candles = taContext.candles;
  const n = endIdx == null ? candles.length : Math.min(candles.length, endIdx);
  const initialEquity = cfg.initialEquity;
  const spreadBps = cfg.spreadBps * frictionMult;
  const commissionBps = cfg.commissionBps * frictionMult;
  const slippageBps = cfg.slippageBps * frictionMult;
  const swapPerBarBps = cfg.swapPerBarBps * frictionMult;

  const entrySlipFactor = (spreadBps * 0.5 + slippageBps) / 10000.0;
  const exitSlipFactor = (spreadBps * 0.5 + slippageBps) / 10000.0;

  // Map valid signals strictly by their decision bar index (within [startIdx, n - 2])
  const signalsByBar = new Map();
  for (const sig of validSignals) {
    if (sig.bar_index >= startIdx && sig.bar_index < n - 1 && !signalsByBar.has(sig.bar_index)) {
      signalsByBar.set(sig.bar_index, sig);
    }
  }

  let equity = initialEquity;
  let peakEquity = initialEquity;
  let maxDrawdownEur = 0;
  let maxDrawdownPct = 0;
  let maxExposurePct = 0;
  let sizingLimitationNote = null;

  let openPosition = null;
  let pendingSignal = null;

  const trades = [];
  const tradeReturns = [];
  const equityCurve = [];

  const sma5 = taContext.indicators?.sma5 || [];

  const closePositionOnBar = (pos, barIdx, rawExitPrice, exitReason) => {
    const isLong = pos.side === 'LONG';
    const effectiveExit = isLong
      ? rawExitPrice * (1.0 - exitSlipFactor)
      : rawExitPrice * (1.0 + exitSlipFactor);

    const barsHeld = Math.max(1, barIdx - pos.entryIndex + 1);
    const entryNotional = pos.effectiveEntry * pos.quantity;
    const exitNotional = effectiveExit * pos.quantity;

    const grossPnlEur = isLong
      ? (rawExitPrice - pos.rawEntryOpen) * pos.quantity
      : (pos.rawEntryOpen - rawExitPrice) * pos.quantity;

    const spreadSlipEur = isLong
      ? ((pos.effectiveEntry - pos.rawEntryOpen) + (rawExitPrice - effectiveExit)) * pos.quantity
      : ((pos.rawEntryOpen - pos.effectiveEntry) + (effectiveExit - rawExitPrice)) * pos.quantity;

    const commissionEur = (entryNotional + exitNotional) * (commissionBps / 10000.0);
    const swapEur = entryNotional * (swapPerBarBps / 10000.0) * barsHeld;
    const costsEur = Math.max(0, spreadSlipEur + commissionEur + swapEur);
    const netPnlEur = grossPnlEur - costsEur;
    const rMultiple = pos.riskBudgetEur > 0 ? netPnlEur / pos.riskBudgetEur : 0;

    const equityBefore = equity;
    equity = Math.max(0, equity + netPnlEur);
    if (equity > peakEquity) peakEquity = equity;
    const ddEur = Math.max(0, peakEquity - equity);
    const ddPct = peakEquity > 0 ? (ddEur / peakEquity) * 100.0 : 0;
    if (ddEur > maxDrawdownEur) maxDrawdownEur = ddEur;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

    if (equityBefore > 0) {
      tradeReturns.push(netPnlEur / equityBefore);
    }

    trades.push({
      id: trades.length + 1,
      signalId: pos.signalId,
      strategyId: pos.strategyId,
      side: pos.side,
      entryIndex: pos.entryIndex,
      exitIndex: barIdx,
      entryTimeMs: pos.entryTimeMs,
      exitTimeMs: candles[barIdx].open_time_utc_ms,
      rawEntryOpen: round4(pos.rawEntryOpen),
      entryPrice: round4(pos.effectiveEntry),
      exitPrice: round4(effectiveExit),
      stopLoss: round4(pos.stopLoss),
      takeProfit: round4(pos.takeProfit),
      takeProfit2: pos.takeProfit2 != null ? round4(pos.takeProfit2) : null,
      plannedNetRR: pos.plannedNetRR,
      quantity: round4(pos.quantity),
      barsHeld,
      grossPnlEur: round2(grossPnlEur),
      costsEur: round2(costsEur),
      netPnlEur: round2(netPnlEur),
      rMultiple: round2(rMultiple),
      equityAfterEur: round2(equity),
      exitReason,
      signalReason: pos.signalReason,
    });
  };

  for (let i = startIdx; i < n; i++) {
    const bar = candles[i];

    // 1. Fill pending signal on next-bar open (zero look-ahead)
    if (pendingSignal && !openPosition && equity > 1.0) {
      const openPrice = bar.open;
      const isLong = pendingSignal.side === 'long';
      const sl = pendingSignal.stop_loss_suggested;
      const tp1 = pendingSignal.take_profit_suggested[0];
      const tp2 = pendingSignal.take_profit_suggested[1] ?? null;

      // Guard against overnight/opening gap invalidating SL or TP1 before fill
      const gapInvalidated = isLong
        ? openPrice <= sl || openPrice >= tp1
        : openPrice >= sl || openPrice <= tp1;

      if (!gapInvalidated) {
        const effectiveEntry = isLong
          ? openPrice * (1.0 + entrySlipFactor)
          : openPrice * (1.0 - entrySlipFactor);

        const sizing = calculateInstrumentPositionSizing({
          equity,
          riskPerTradePct: cfg.riskPerTradePct,
          entryPrice: effectiveEntry,
          stopLossPrice: sl,
          maxLeverage: cfg.maxLeverage,
          instrumentSpec: cfg.instrumentSpec || null,
        });

        if (sizing.limitationNote && !sizingLimitationNote) {
          sizingLimitationNote = sizing.limitationNote;
        }

        if (sizing.valid && sizing.quantity > 0) {
          const exposurePct = equity > 0 ? (sizing.exposureNotionalEur / equity) * 100.0 : 0;
          if (exposurePct > maxExposurePct) maxExposurePct = exposurePct;

          openPosition = {
            signalId: pendingSignal.signal_id,
            strategyId: pendingSignal.strategy_id,
            side: isLong ? 'LONG' : 'SHORT',
            entryIndex: i,
            entryTimeMs: bar.open_time_utc_ms,
            rawEntryOpen: openPrice,
            effectiveEntry,
            stopLoss: sl,
            takeProfit: tp1,
            takeProfit2: tp2,
            plannedNetRR: pendingSignal.risk_reward?.net_rr ?? 0,
            exitRule: pendingSignal.exit_rule || null,
            quantity: sizing.quantity,
            riskBudgetEur: Math.max(1e-6, Math.abs(effectiveEntry - sl) * sizing.quantity),
            signalReason: pendingSignal.reason,
          };
        }
      }
      pendingSignal = null;
    }

    // 2. Exit evaluation with strict conservative SL_BEFORE_TP ordering
    if (openPosition) {
      const isLong = openPosition.side === 'LONG';
      const slHit = isLong ? bar.low <= openPosition.stopLoss : bar.high >= openPosition.stopLoss;
      const tpHit = isLong ? bar.high >= openPosition.takeProfit : bar.low <= openPosition.takeProfit;
      const barsHeld = i - openPosition.entryIndex + 1;

      // Strategy-specific exit rule (e.g. Connors RSI(2): exit on Close > SMA(5))
      let strategyExitHit = false;
      if (openPosition.exitRule && sma5[i] != null) {
        if (openPosition.exitRule.type === 'CLOSE_ABOVE_SMA' && isLong && bar.close > sma5[i]) {
          strategyExitHit = true;
        } else if (openPosition.exitRule.type === 'CLOSE_BELOW_SMA' && !isLong && bar.close < sma5[i]) {
          strategyExitHit = true;
        }
      }

      if (slHit) {
        closePositionOnBar(openPosition, i, openPosition.stopLoss, 'SL_HIT');
        openPosition = null;
      } else if (tpHit) {
        closePositionOnBar(openPosition, i, openPosition.takeProfit, 'TP1_HIT');
        openPosition = null;
      } else if (strategyExitHit) {
        closePositionOnBar(openPosition, i, bar.close, 'STRATEGY_EXIT');
        openPosition = null;
      } else if (barsHeld >= cfg.maxHoldBars) {
        closePositionOnBar(openPosition, i, bar.close, 'TIME_STOP');
        openPosition = null;
      } else if (i === n - 1) {
        closePositionOnBar(openPosition, i, bar.close, 'END_OF_DATA');
        openPosition = null;
      }
    }

    const ddPctBar = peakEquity > 0 ? Math.max(0, ((peakEquity - equity) / peakEquity) * 100.0) : 0;
    equityCurve.push({
      index: i,
      timeMs: bar.open_time_utc_ms,
      equity: round2(equity),
      drawdownPct: round2(ddPctBar),
    });

    // 3. Queue next-bar open entry only if no active position (prevents overlapping exposure)
    if (!openPosition && !pendingSignal && i < n - 1 && equity > 1.0) {
      const sig = signalsByBar.get(i);
      if (sig) {
        pendingSignal = sig;
      }
    }
  }

  let winCount = 0;
  let lossCount = 0;
  let breakevenCount = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalFeesEur = 0;
  let sumR = 0;
  let totalBarsHeld = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let curWins = 0;
  let curLosses = 0;

  for (const t of trades) {
    totalFeesEur += t.costsEur;
    sumR += t.rMultiple;
    totalBarsHeld += t.barsHeld;
    if (t.netPnlEur > 0.005) {
      winCount++;
      grossProfit += t.netPnlEur;
      curWins++;
      curLosses = 0;
      if (curWins > maxConsecutiveWins) maxConsecutiveWins = curWins;
    } else if (t.netPnlEur < -0.005) {
      lossCount++;
      grossLoss += Math.abs(t.netPnlEur);
      curLosses++;
      curWins = 0;
      if (curLosses > maxConsecutiveLosses) maxConsecutiveLosses = curLosses;
    } else {
      breakevenCount++;
      curWins = 0;
      curLosses = 0;
    }
  }

  const totalTrades = trades.length;
  const netProfitEur = equity - initialEquity;
  const netReturnPct = initialEquity > 0 ? (netProfitEur / initialEquity) * 100.0 : 0;
  const winRatePct = totalTrades > 0 ? (winCount / totalTrades) * 100.0 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.99 : 0;
  const expectancyEur = totalTrades > 0 ? netProfitEur / totalTrades : 0;
  const averageR = totalTrades > 0 ? sumR / totalTrades : 0;
  const avgHoldingBars = totalTrades > 0 ? totalBarsHeld / totalTrades : 0;

  // Annualized Return (CAGR) — only calculated when sample span >= 30 days to avoid explosive short-window numbers
  let cagrPct = null;
  if (n - startIdx >= 2 && initialEquity > 0 && equity > 0) {
    const spanMs = candles[n - 1].open_time_utc_ms - candles[startIdx].open_time_utc_ms;
    const years = spanMs / (365.25 * 24 * 3600 * 1000);
    if (years >= 30 / 365.25) {
      const ratio = equity / initialEquity;
      cagrPct = round2((Math.pow(ratio, 1 / years) - 1) * 100.0);
    }
  }

  let sharpeRatio = 0;
  let sortinoRatio = 0;
  if (tradeReturns.length >= 2) {
    const mean = tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length;
    const variance =
      tradeReturns.reduce((acc, r) => acc + (r - mean) * (r - mean), 0) / (tradeReturns.length - 1);
    const std = Math.sqrt(variance);
    if (std > 1e-9) {
      sharpeRatio = (mean / std) * Math.sqrt(tradeReturns.length);
    }
    const downsideSq = tradeReturns.reduce((acc, r) => acc + (r < 0 ? r * r : 0), 0) / tradeReturns.length;
    const downsideStd = Math.sqrt(downsideSq);
    if (downsideStd > 1e-9) {
      sortinoRatio = (mean / downsideStd) * Math.sqrt(tradeReturns.length);
    } else if (mean > 0) {
      sortinoRatio = 9.99;
    }
  }

  return {
    frictionMultiplier: frictionMult,
    sizingLimitationNote,
    metrics: {
      initialEquity: round2(initialEquity),
      finalEquity: round2(equity),
      netProfitEur: round2(netProfitEur),
      netReturnPct: round2(netReturnPct),
      cagrPct,
      totalTrades,
      winCount,
      lossCount,
      breakevenCount,
      winRatePct: round2(winRatePct),
      grossProfitEur: round2(grossProfit),
      grossLossEur: round2(grossLoss),
      profitFactor: round2(Math.min(99.99, profitFactor)),
      expectancyEur: round2(expectancyEur),
      averageR: round2(averageR),
      avgHoldingBars: round2(avgHoldingBars),
      maxDrawdownPct: round2(maxDrawdownPct),
      maxDrawdownEur: round2(maxDrawdownEur),
      maxExposurePct: round2(maxExposurePct),
      sharpeRatio: round2(sharpeRatio),
      sortinoRatio: round2(Math.min(99.99, sortinoRatio)),
      maxConsecutiveWins,
      maxConsecutiveLosses,
      totalFeesEur: round2(totalFeesEur),
    },
    equityCurve,
    trades,
  };
}

export function normalizeClassicalBacktestConfig(raw = {}) {
  const validIds = new Set(CLASSICAL_STRATEGY_REGISTRY.map((s) => s.id));
  const strategyId = validIds.has(raw.strategyId) ? raw.strategyId : 'trend_pullback_v1';
  const dirRaw = String(raw.direction || 'BOTH').toUpperCase();
  const direction = dirRaw === 'LONG_ONLY' || dirRaw === 'SHORT_ONLY' ? dirRaw : 'BOTH';

  const clamp = (v, lo, hi, fb) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fb;
  };

  return {
    strategyId,
    direction,
    initialEquity: clamp(raw.initialEquity, 100, 10_000_000, 1000.0),
    riskPerTradePct: clamp(raw.riskPerTradePct, 0.1, 10.0, 1.0),
    // HARD GATE: Cannot be lowered below 2.00 under any circumstances
    minRequiredRR: enforceMinimumRequiredRR(raw.minRequiredRR ?? MINIMUM_REQUIRED_RR),
    maxHoldBars: Math.trunc(clamp(raw.maxHoldBars, 4, 500, 64)),
    spreadBps: clamp(raw.spreadBps, 0, 200, 4.0),
    commissionBps: clamp(raw.commissionBps, 0, 200, 5.0),
    slippageBps: clamp(raw.slippageBps, 0, 200, 2.0),
    swapPerBarBps: clamp(raw.swapPerBarBps, 0, 50, 0.15),
    maxLeverage: clamp(raw.maxLeverage, 1.0, 20.0, 5.0),
    duplicateCooldownBars: Math.trunc(clamp(raw.duplicateCooldownBars, 1, 30, 4)),
    strategyParams: raw.strategyParams || {},
    instrumentSpec: raw.instrumentSpec || null,
    intrabarPolicy: 'SL_BEFORE_TP',
  };
}

/**
 * Full single-strategy offline signal evaluation + Net/Gross backtest + Cost Sensitivity + IS/OOS Split.
 */
export function runClassicalStrategyBacktest(rawCandles = [], options = {}, precomputedContext = null) {
  const cfg = normalizeClassicalBacktestConfig(options);
  const taContext =
    precomputedContext ||
    prepareTaCoreContext(rawCandles, {
      symbolCode: options.symbolCode,
      timeframe: options.timeframe,
      chartId: options.chartId,
    });

  const signalReport = generateStrategySignals(taContext, cfg.strategyId, {
    direction: cfg.direction,
    spreadBps: cfg.spreadBps,
    commissionBps: cfg.commissionBps,
    slippageBps: cfg.slippageBps,
    minRequiredRR: cfg.minRequiredRR,
    duplicateCooldownBars: cfg.duplicateCooldownBars,
    strategyParams: cfg.strategyParams,
  });

  if (!taContext.ready) {
    return {
      schemaVersion: SIGNAL_BACKTEST_VERSION,
      status: 'INSUFFICIENT_DATA',
      chartId: taContext.chartId,
      symbolCode: taContext.symbolCode,
      timeframe: taContext.timeframe,
      candleCount: taContext.candles.length,
      quality: taContext.quality,
      config: cfg,
      signalReport,
      metrics: {
        initialEquity: cfg.initialEquity,
        finalEquity: cfg.initialEquity,
        netProfitEur: 0,
        netReturnPct: 0,
        grossReturnPct: 0,
        cagrPct: null,
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        breakevenCount: 0,
        winRatePct: 0,
        profitFactor: 0,
        expectancyEur: 0,
        averageR: 0,
        avgHoldingBars: 0,
        maxDrawdownPct: 0,
        maxDrawdownEur: 0,
        maxExposurePct: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        maxConsecutiveWins: 0,
        maxConsecutiveLosses: 0,
        totalFeesEur: 0,
        rejectedByRrCount: 0,
        totalRejectedCount: 0,
        avgAcceptedNetRR: 0,
      },
      grossMetrics: null,
      equityCurve: [],
      trades: [],
      costSensitivity: [],
      inSampleOutOfSample: null,
      sizingLimitationNote: null,
    };
  }

  const netRun = executeSignalsPass(taContext, signalReport.validSignals, cfg, 1.0);
  const grossRun = executeSignalsPass(taContext, signalReport.validSignals, cfg, 0.0);

  const metrics = {
    ...netRun.metrics,
    grossReturnPct: grossRun.metrics.netReturnPct,
    grossNetProfitEur: grossRun.metrics.netProfitEur,
    rejectedByRrCount: signalReport.summary.rejectedByRrCount,
    totalRejectedCount: signalReport.summary.rejectedCount,
    validSignalCount: signalReport.summary.validCount,
    avgAcceptedNetRR: signalReport.summary.avgAcceptedNetRR,
    minimumRequiredRR: cfg.minRequiredRR,
  };

  const includeSensitivity = options.includeSensitivity !== false;
  const costSensitivity = [];
  if (includeSensitivity) {
    costSensitivity.push({
      label: '0.0x (Gross / No Cost)',
      multiplier: 0.0,
      netReturnPct: grossRun.metrics.netReturnPct,
      netProfitEur: grossRun.metrics.netProfitEur,
      profitFactor: grossRun.metrics.profitFactor,
      maxDrawdownPct: grossRun.metrics.maxDrawdownPct,
      totalFeesEur: 0,
    });
    costSensitivity.push({
      label: '1.0x (Base Costs)',
      multiplier: 1.0,
      netReturnPct: netRun.metrics.netReturnPct,
      netProfitEur: netRun.metrics.netProfitEur,
      profitFactor: netRun.metrics.profitFactor,
      maxDrawdownPct: netRun.metrics.maxDrawdownPct,
      totalFeesEur: netRun.metrics.totalFeesEur,
    });
    for (const mult of [1.5, 2.0]) {
      const sRun = executeSignalsPass(taContext, signalReport.validSignals, cfg, mult);
      costSensitivity.push({
        label: `${mult.toFixed(1)}x`,
        multiplier: mult,
        netReturnPct: sRun.metrics.netReturnPct,
        netProfitEur: sRun.metrics.netProfitEur,
        profitFactor: sRun.metrics.profitFactor,
        maxDrawdownPct: sRun.metrics.maxDrawdownPct,
        totalFeesEur: sRun.metrics.totalFeesEur,
      });
    }
  }

  // Chronological 70/30 In-Sample vs Out-of-Sample validation (strictly zero leakage)
  let inSampleOutOfSample = null;
  if (options.includeSplit !== false && taContext.candles.length >= 60) {
    const splitIdx = Math.floor(taContext.candles.length * 0.7);
    const isRun = executeSignalsPass(taContext, signalReport.validSignals, cfg, 1.0, 0, splitIdx);
    const oosRun = executeSignalsPass(taContext, signalReport.validSignals, cfg, 1.0, splitIdx, taContext.candles.length);
    inSampleOutOfSample = {
      splitBarIndex: splitIdx,
      splitTimeUtc: new Date(taContext.candles[splitIdx].open_time_utc_ms).toISOString(),
      inSample: isRun.metrics,
      outOfSample: oosRun.metrics,
    };
  }

  return {
    schemaVersion: SIGNAL_BACKTEST_VERSION,
    status: 'READY',
    chartId: taContext.chartId,
    symbolCode: taContext.symbolCode,
    timeframe: taContext.timeframe,
    candleCount: taContext.candles.length,
    quality: taContext.quality,
    config: cfg,
    signalReport,
    metrics,
    grossMetrics: grossRun.metrics,
    equityCurve: netRun.equityCurve,
    trades: netRun.trades,
    costSensitivity,
    inSampleOutOfSample,
    sizingLimitationNote: netRun.sizingLimitationNote,
  };
}

/**
 * Compares all enabled classical strategies honestly (including losing strategies and RSI Dip baseline)
 * on the exact same `ta-core/1.1` context.
 */
export function compareAllClassicalStrategies(rawCandles = [], options = {}, precomputedContext = null) {
  const taContext =
    precomputedContext ||
    prepareTaCoreContext(rawCandles, {
      symbolCode: options.symbolCode,
      timeframe: options.timeframe,
      chartId: options.chartId,
    });

  const enabledMap = options.enabledStrategies || {};
  const paramsByStrategy = options.paramsByStrategy || {};

  const rows = [];
  for (const meta of CLASSICAL_STRATEGY_REGISTRY) {
    if (enabledMap[meta.id] === false) continue;
    const res = runClassicalStrategyBacktest(
      rawCandles,
      {
        ...options,
        strategyId: meta.id,
        strategyParams: {
          ...meta.defaultParams,
          ...(paramsByStrategy[meta.id] || {}),
        },
        includeSensitivity: false,
        includeSplit: false,
      },
      taContext
    );

    rows.push({
      strategyId: meta.id,
      nameEn: meta.nameEn,
      nameFa: meta.nameFa,
      priority: meta.priority,
      isResearchBenchmarkOnly: meta.isResearchBenchmarkOnly,
      status: res.status,
      latestDecision: res.signalReport.latestDecision,
      metrics: res.metrics,
      validSignalsCount: res.signalReport.validSignals.length,
      rejectedCount: res.signalReport.rejections.length,
      rejectedByRrCount: res.signalReport.summary.rejectedByRrCount,
    });
  }

  return {
    schemaVersion: SIGNAL_BACKTEST_VERSION,
    chartId: taContext.chartId,
    symbolCode: taContext.symbolCode,
    timeframe: taContext.timeframe,
    candleCount: taContext.candles.length,
    rows,
  };
}

export const SignalBacktester = {
  VERSION: SIGNAL_BACKTEST_VERSION,
  MINIMUM_REQUIRED_RR,
  STRATEGIES: CLASSICAL_STRATEGY_REGISTRY,
  normalizeConfig: normalizeClassicalBacktestConfig,
  runBacktest: runClassicalStrategyBacktest,
  compareAllStrategies: compareAllClassicalStrategies,
};
