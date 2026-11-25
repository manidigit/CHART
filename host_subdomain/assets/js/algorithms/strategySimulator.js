import { TechnicalAnalysisCore } from './technicalAnalysisCore.js?v=1.47.41';
import { TechnicalIndicators } from './technicalIndicators.js?v=1.47.41';
import {
  MINIMUM_REQUIRED_RR,
  enforceMinimumRequiredRR,
  evaluateRiskRewardTradePlan,
  calculateInstrumentPositionSizing,
} from '../strategy/riskRewardEngine.js?v=1.47.41';
import { CLASSICAL_STRATEGY_REGISTRY } from '../strategy/classicalGenerators.js?v=1.47.41';
import { SignalEngine } from '../strategy/signalEngine.js?v=1.47.41';
import {
  SignalBacktester,
  runClassicalStrategyBacktest,
  compareAllClassicalStrategies,
} from '../strategy/signalBacktester.js?v=1.47.41';

/**
 * Phase 6 — Offline Trading Strategy Simulator (Web ES Module)
 * Strictly aligned with docs/01-product/TRADING_STRATEGY_SPEC.md:
 * - Offline research/simulation only (zero broker or live order APIs)
 * - Independent per chart_id with default Initial Equity = EUR 1,000 and 1% risk per trade
 * - Causal signal evaluation on bar close -> next-bar open execution (zero look-ahead)
 * - Conservative intrabar tie-breaker: Stop-Loss executes before Take-Profit (SL_BEFORE_TP)
 * - Explicit friction model: Spread, Commission, Slippage, Swap + 1.0x / 1.5x / 2.0x Cost Sensitivity
 * - Integrated with `signal-gen/1.0` Classical Signal Generators & Hard Gate `Net R:R >= 2.0`
 * - Parity counterpart: StrategySimulatorAlgorithm.kt on Android
 */

export const STRATEGY_SIM_SCHEMA_VERSION = 'strategy-sim/1.0';
export {
  MINIMUM_REQUIRED_RR,
  CLASSICAL_STRATEGY_REGISTRY,
  SignalEngine,
  SignalBacktester,
  enforceMinimumRequiredRR,
  evaluateRiskRewardTradePlan,
  calculateInstrumentPositionSizing,
  runClassicalStrategyBacktest,
  compareAllClassicalStrategies,
};

export const STRATEGY_PRESETS = Object.freeze([
  {
    id: 'EMA_TREND_PULLBACK',
    nameEn: 'EMA Trend + RSI Pullback',
    nameFa: 'روند EMA + پولبک RSI',
    descEn: 'Follows EMA20/EMA50 trend bias and enters on causal RSI(14) pullback recovery with ATR stop.',
    descFa: 'هم‌جهت با روند EMA20/EMA50 وارد می‌شود و روی بازگشت پولبک RSI(14) با حد ضرر ATR معامله می‌گیرد.',
  },
  {
    id: 'SR_ZONE_PATTERN_BOUNCE',
    nameEn: 'S/R Zone + Candlestick Reversal',
    nameFa: 'واکنش ناحیه S/R + الگوی کندل‌استیک',
    descEn: 'Detects causal pivot support/resistance reactions confirmed by Hammer, Pin Bar, or Engulfing patterns.',
    descFa: 'واکنش قیمت به نواحی حمایت/مقاومت علّی را با تأیید الگوهای چکش، پین‌بار یا انگلفینگ شبیه‌سازی می‌کند.',
  },
  {
    id: 'SUPERTREND_MOMENTUM',
    nameEn: 'Supertrend Flip + MACD',
    nameFa: 'تغییر جهت سوپرترند + مکدی',
    descEn: 'Enters on Supertrend direction flips confirmed by MACD histogram polarity with ATR risk sizing.',
    descFa: 'در لحظه تغییر فاز سوپرترند با تأیید هیستوگرام مکدی و مدیریت ریسک مبتنی بر ATR وارد می‌شود.',
  },
  {
    id: 'BOLLINGER_MEAN_REVERSION',
    nameEn: 'Bollinger Band Re-Entry',
    nameFa: 'بازگشت به داخل باند بولینگر',
    descEn: 'Mean-reversion re-entry inside outer Bollinger(20, 2σ) bands filtered by RSI exhaustion.',
    descFa: 'بازگشت قیمت از خارج باندهای بولینگر (20, 2σ) به داخل باند را با فیلتر اشباع RSI آزمایش می‌کند.',
  },
]);

export const DEFAULT_STRATEGY_CONFIG = Object.freeze({
  presetId: 'EMA_TREND_PULLBACK',
  direction: 'BOTH', // 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY'
  initialEquity: 1000.0, // EUR
  riskPerTradePct: 1.0, // 1% of current equity
  rrRatio: 2.0,
  atrStopMult: 1.5,
  maxHoldBars: 48,
  spreadBps: 4.0,
  commissionBps: 5.0,
  slippageBps: 2.0,
  swapPerBarBps: 0.15,
  maxLeverage: 5.0,
  intrabarPolicy: 'SL_BEFORE_TP',
});

function clampNum(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function round4(v) {
  return Math.round((Number(v) || 0) * 10000) / 10000;
}

export function normalizeStrategyConfig(raw = {}) {
  const validPresetIds = new Set(STRATEGY_PRESETS.map((p) => p.id));
  const presetId = validPresetIds.has(raw.presetId) ? raw.presetId : DEFAULT_STRATEGY_CONFIG.presetId;
  const dirRaw = String(raw.direction || DEFAULT_STRATEGY_CONFIG.direction).toUpperCase();
  const direction = dirRaw === 'LONG_ONLY' || dirRaw === 'SHORT_ONLY' ? dirRaw : 'BOTH';

  return {
    presetId,
    direction,
    initialEquity: clampNum(raw.initialEquity, 100, 10_000_000, DEFAULT_STRATEGY_CONFIG.initialEquity),
    riskPerTradePct: clampNum(raw.riskPerTradePct, 0.1, 10.0, DEFAULT_STRATEGY_CONFIG.riskPerTradePct),
    rrRatio: clampNum(raw.rrRatio, 0.5, 10.0, DEFAULT_STRATEGY_CONFIG.rrRatio),
    atrStopMult: clampNum(raw.atrStopMult, 0.5, 6.0, DEFAULT_STRATEGY_CONFIG.atrStopMult),
    maxHoldBars: Math.trunc(clampNum(raw.maxHoldBars, 4, 500, DEFAULT_STRATEGY_CONFIG.maxHoldBars)),
    spreadBps: clampNum(raw.spreadBps, 0, 200, DEFAULT_STRATEGY_CONFIG.spreadBps),
    commissionBps: clampNum(raw.commissionBps, 0, 200, DEFAULT_STRATEGY_CONFIG.commissionBps),
    slippageBps: clampNum(raw.slippageBps, 0, 200, DEFAULT_STRATEGY_CONFIG.slippageBps),
    swapPerBarBps: clampNum(raw.swapPerBarBps, 0, 50, DEFAULT_STRATEGY_CONFIG.swapPerBarBps),
    maxLeverage: clampNum(raw.maxLeverage, 1.0, 20.0, DEFAULT_STRATEGY_CONFIG.maxLeverage),
    intrabarPolicy: 'SL_BEFORE_TP',
  };
}

function executeCoreSimulation(candles, indicators, patternsByIndex, swings, swingLen, cfg, frictionMult = 1.0) {
  const n = candles.length;
  const initialEquity = cfg.initialEquity;
  const spreadBps = cfg.spreadBps * frictionMult;
  const commissionBps = cfg.commissionBps * frictionMult;
  const slippageBps = cfg.slippageBps * frictionMult;
  const swapPerBarBps = cfg.swapPerBarBps * frictionMult;

  const ema20 = indicators.ema20 || [];
  const ema50 = indicators.ema50 || [];
  const rsi14 = indicators.rsi14 || [];
  const atr14 = indicators.atr14 || [];
  const macdArr = Array.isArray(indicators.macd) ? indicators.macd : [];
  const stArr = Array.isArray(indicators.supertrend) ? indicators.supertrend : [];
  const bbArr = Array.isArray(indicators.bollinger) ? indicators.bollinger : [];

  // Map swings by their causal confirmation bar (pivotIndex + swingLen) to guarantee zero look-ahead
  const swingsByConfirmIdx = new Map();
  for (const sw of swings) {
    const confirmIdx = sw.index + swingLen;
    if (confirmIdx < n) {
      if (!swingsByConfirmIdx.has(confirmIdx)) swingsByConfirmIdx.set(confirmIdx, []);
      swingsByConfirmIdx.get(confirmIdx).push(sw);
    }
  }
  const confirmedSwingHighs = [];
  const confirmedSwingLows = [];

  let equity = initialEquity;
  let peakEquity = initialEquity;
  let maxDrawdownEur = 0;
  let maxDrawdownPct = 0;

  let openPosition = null;
  let pendingSignal = null;

  const trades = [];
  const tradeReturns = [];
  const equityCurve = [];

  const allowLong = cfg.direction === 'BOTH' || cfg.direction === 'LONG_ONLY';
  const allowShort = cfg.direction === 'BOTH' || cfg.direction === 'SHORT_ONLY';

  const entrySlipFactor = (spreadBps * 0.5 + slippageBps) / 10000.0;
  const exitSlipFactor = (spreadBps * 0.5 + slippageBps) / 10000.0;

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

  for (let i = 0; i < n; i++) {
    const bar = candles[i];

    // 1. Add causally confirmed swings available as of bar i
    const newlyConfirmed = swingsByConfirmIdx.get(i);
    if (newlyConfirmed) {
      for (const sw of newlyConfirmed) {
        if (sw.type === 'SWING_HIGH') {
          confirmedSwingHighs.push(sw.price);
          if (confirmedSwingHighs.length > 12) confirmedSwingHighs.shift();
        } else if (sw.type === 'SWING_LOW') {
          confirmedSwingLows.push(sw.price);
          if (confirmedSwingLows.length > 12) confirmedSwingLows.shift();
        }
      }
    }

    // 2. Fill pending next-bar open signal if no position is open and equity > 0
    if (pendingSignal && !openPosition && equity > 1.0) {
      const openPrice = bar.open;
      const isLong = pendingSignal.side === 'LONG';
      const effectiveEntry = isLong
        ? openPrice * (1.0 + entrySlipFactor)
        : openPrice * (1.0 - entrySlipFactor);

      const stopDist = Math.max(pendingSignal.atr * cfg.atrStopMult, openPrice * 0.001);
      const stopLoss = isLong ? effectiveEntry - stopDist : effectiveEntry + stopDist;
      const takeProfit = isLong
        ? effectiveEntry + stopDist * cfg.rrRatio
        : effectiveEntry - stopDist * cfg.rrRatio;

      const riskBudgetEur = equity * (cfg.riskPerTradePct / 100.0);
      const maxQtyByLeverage = effectiveEntry > 0 ? (equity * cfg.maxLeverage) / effectiveEntry : 0;
      const rawQty = stopDist > 0 ? riskBudgetEur / stopDist : 0;
      const quantity = Math.min(rawQty, maxQtyByLeverage);

      if (quantity > 0 && Number.isFinite(quantity)) {
        openPosition = {
          side: pendingSignal.side,
          entryIndex: i,
          entryTimeMs: bar.open_time_utc_ms,
          rawEntryOpen: openPrice,
          effectiveEntry,
          stopLoss,
          takeProfit,
          quantity,
          riskBudgetEur: quantity * stopDist,
          signalReason: pendingSignal.reason,
        };
      }
      pendingSignal = null;
    }

    // 3. Evaluate exits on bar i with conservative SL-before-TP intrabar ordering
    if (openPosition) {
      const isLong = openPosition.side === 'LONG';
      const slHit = isLong ? bar.low <= openPosition.stopLoss : bar.high >= openPosition.stopLoss;
      const tpHit = isLong ? bar.high >= openPosition.takeProfit : bar.low <= openPosition.takeProfit;
      const barsHeld = i - openPosition.entryIndex + 1;

      if (slHit) {
        // Conservative policy: if both SL and TP occur in the same bar, SL wins
        closePositionOnBar(openPosition, i, openPosition.stopLoss, 'SL_HIT');
        openPosition = null;
      } else if (tpHit) {
        closePositionOnBar(openPosition, i, openPosition.takeProfit, 'TP_HIT');
        openPosition = null;
      } else if (barsHeld >= cfg.maxHoldBars) {
        closePositionOnBar(openPosition, i, bar.close, 'TIME_STOP');
        openPosition = null;
      } else if (i === n - 1) {
        closePositionOnBar(openPosition, i, bar.close, 'END_OF_DATA');
        openPosition = null;
      }
    }

    // Record bar equity curve point
    const ddPctBar = peakEquity > 0 ? Math.max(0, ((peakEquity - equity) / peakEquity) * 100.0) : 0;
    equityCurve.push({
      index: i,
      timeMs: bar.open_time_utc_ms,
      equity: round2(equity),
      drawdownPct: round2(ddPctBar),
    });

    // 4. Evaluate causal entry signal at bar i close for execution at bar i+1 open
    if (!openPosition && !pendingSignal && i >= 1 && i < n - 1 && equity > 1.0) {
      const atrNow = atr14[i];
      if (atrNow == null || !Number.isFinite(atrNow) || atrNow <= 0) continue;

      let signalSide = null;
      let signalReason = '';

      if (cfg.presetId === 'EMA_TREND_PULLBACK') {
        const e20 = ema20[i];
        const e50 = ema50[i];
        const rPrev = rsi14[i - 1];
        const rNow = rsi14[i];
        if (e20 != null && e50 != null && rPrev != null && rNow != null) {
          if (allowLong && e20 > e50 && bar.close > e50 && rPrev <= 45.0 && rNow > 45.0) {
            signalSide = 'LONG';
            signalReason = 'EMA20>EMA50 + RSI14>45 pullback';
          } else if (allowShort && e20 < e50 && bar.close < e50 && rPrev >= 55.0 && rNow < 55.0) {
            signalSide = 'SHORT';
            signalReason = 'EMA20<EMA50 + RSI14<55 pullback';
          }
        }
      } else if (cfg.presetId === 'SR_ZONE_PATTERN_BOUNCE') {
        const barPatterns = patternsByIndex.get(i) || [];
        const bullPat = barPatterns.find((p) => p.direction === 1);
        const bearPat = barPatterns.find((p) => p.direction === -1);
        const tol = atrNow * 1.25;
        if (allowLong && bullPat && confirmedSwingLows.some((lvl) => Math.abs(bar.low - lvl) <= tol)) {
          signalSide = 'LONG';
          signalReason = `Support bounce + ${bullPat.type}`;
        } else if (allowShort && bearPat && confirmedSwingHighs.some((lvl) => Math.abs(bar.high - lvl) <= tol)) {
          signalSide = 'SHORT';
          signalReason = `Resistance reject + ${bearPat.type}`;
        }
      } else if (cfg.presetId === 'SUPERTREND_MOMENTUM') {
        const dNow = stArr[i] ? stArr[i].direction : null;
        const dPrev = stArr[i - 1] ? stArr[i - 1].direction : null;
        const mh = macdArr[i] ? macdArr[i].histogram : null;
        if (dNow != null && dPrev != null) {
          if (allowLong && dNow === 1 && dPrev === -1 && (mh == null || mh >= 0)) {
            signalSide = 'LONG';
            signalReason = 'Supertrend bullish flip + MACD';
          } else if (allowShort && dNow === -1 && dPrev === 1 && (mh == null || mh <= 0)) {
            signalSide = 'SHORT';
            signalReason = 'Supertrend bearish flip + MACD';
          }
        }
      } else if (cfg.presetId === 'BOLLINGER_MEAN_REVERSION') {
        const prevBar = candles[i - 1];
        const lowPrev = bbArr[i - 1] ? bbArr[i - 1].lower : null;
        const lowNow = bbArr[i] ? bbArr[i].lower : null;
        const upPrev = bbArr[i - 1] ? bbArr[i - 1].upper : null;
        const upNow = bbArr[i] ? bbArr[i].upper : null;
        const rNow = rsi14[i];
        if (lowPrev != null && lowNow != null && upPrev != null && upNow != null) {
          if (allowLong && prevBar.close < lowPrev && bar.close >= lowNow && (rNow == null || rNow <= 42.0)) {
            signalSide = 'LONG';
            signalReason = 'Bollinger lower band re-entry';
          } else if (allowShort && prevBar.close > upPrev && bar.close <= upNow && (rNow == null || rNow >= 58.0)) {
            signalSide = 'SHORT';
            signalReason = 'Bollinger upper band re-entry';
          }
        }
      }

      if (signalSide) {
        pendingSignal = { side: signalSide, atr: atrNow, reason: signalReason };
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
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let curWins = 0;
  let curLosses = 0;

  for (const t of trades) {
    totalFeesEur += t.costsEur;
    sumR += t.rMultiple;
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
  const netProfit = equity - initialEquity;
  const netReturnPct = initialEquity > 0 ? (netProfit / initialEquity) * 100.0 : 0;
  const winRatePct = totalTrades > 0 ? (winCount / totalTrades) * 100.0 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99.99 : 0);
  const expectancyEur = totalTrades > 0 ? netProfit / totalTrades : 0;
  const averageR = totalTrades > 0 ? sumR / totalTrades : 0;

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
    metrics: {
      initialEquity: round2(initialEquity),
      finalEquity: round2(equity),
      netProfitEur: round2(netProfit),
      netReturnPct: round2(netReturnPct),
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
      maxDrawdownPct: round2(maxDrawdownPct),
      maxDrawdownEur: round2(maxDrawdownEur),
      sharpeRatio: round2(sharpeRatio),
      sortinoRatio: round2(Math.min(9.99, sortinoRatio)),
      maxConsecutiveWins,
      maxConsecutiveLosses,
      totalFeesEur: round2(totalFeesEur),
    },
    equityCurve,
    trades,
  };
}

export const StrategySimulator = {
  PRESETS: STRATEGY_PRESETS,
  CLASSICAL_STRATEGIES: CLASSICAL_STRATEGY_REGISTRY,
  MINIMUM_REQUIRED_RR,
  DEFAULTS: DEFAULT_STRATEGY_CONFIG,
  normalizeConfig: normalizeStrategyConfig,
  runClassicalBacktest: runClassicalStrategyBacktest,
  compareAllClassicalStrategies,
  evaluateRiskReward: evaluateRiskRewardTradePlan,

  /**
   * Runs a strictly offline, causal, deterministic strategy backtest on real candles.
   */
  runSimulation(rawCandles = [], options = {}) {
    const symbolCode = String(options.symbolCode || 'SPOTBRENT').toUpperCase();
    const timeframe = String(options.timeframe || 'M15').toUpperCase();
    const chartId = String(options.chartId || `${symbolCode}_${timeframe}`);
    const cfg = normalizeStrategyConfig(options);
    const includeSensitivity = options.includeSensitivity !== false;

    const { candles, quality } = TechnicalAnalysisCore.normalizeCandles(rawCandles, {
      symbolCode,
      timeframe,
      excludeOpenBars: options.excludeOpenBars !== false,
    });

    if (candles.length < 30) {
      return {
        schemaVersion: STRATEGY_SIM_SCHEMA_VERSION,
        status: 'INSUFFICIENT_DATA',
        chartId,
        symbolCode,
        timeframe,
        candleCount: candles.length,
        quality,
        config: cfg,
        metrics: {
          initialEquity: round2(cfg.initialEquity),
          finalEquity: round2(cfg.initialEquity),
          netProfitEur: 0,
          netReturnPct: 0,
          totalTrades: 0,
          winCount: 0,
          lossCount: 0,
          breakevenCount: 0,
          winRatePct: 0,
          grossProfitEur: 0,
          grossLossEur: 0,
          profitFactor: 0,
          expectancyEur: 0,
          averageR: 0,
          maxDrawdownPct: 0,
          maxDrawdownEur: 0,
          sharpeRatio: 0,
          sortinoRatio: 0,
          maxConsecutiveWins: 0,
          maxConsecutiveLosses: 0,
          totalFeesEur: 0,
        },
        equityCurve: [],
        trades: [],
        costSensitivity: [],
      };
    }

    const core = TechnicalAnalysisCore.computeCoreIndicators(candles, {
      symbolCode,
      timeframe,
      bollingerPeriod: 20,
      bollingerStdDev: 2.0,
    });
    const simIndicators = {
      ...core.indicators,
      ema50: TechnicalIndicators.computeEma(candles, 50),
    };
    const swingLen = 3;
    const swingResult = TechnicalAnalysisCore.detectSwingsAndTrend(candles, swingLen);
    const patterns = TechnicalAnalysisCore.detectCandlestickPatterns(candles, 14);
    const patternsByIndex = new Map();
    for (const p of patterns) {
      if (!patternsByIndex.has(p.anchorIndex)) patternsByIndex.set(p.anchorIndex, []);
      patternsByIndex.get(p.anchorIndex).push(p);
    }

    const baseRun = executeCoreSimulation(
      candles,
      simIndicators,
      patternsByIndex,
      swingResult.swings,
      swingLen,
      cfg,
      1.0
    );

    const costSensitivity = [];
    if (includeSensitivity) {
      costSensitivity.push({
        label: '1.0x (Base)',
        multiplier: 1.0,
        netReturnPct: baseRun.metrics.netReturnPct,
        netProfitEur: baseRun.metrics.netProfitEur,
        profitFactor: baseRun.metrics.profitFactor,
        maxDrawdownPct: baseRun.metrics.maxDrawdownPct,
        totalFeesEur: baseRun.metrics.totalFeesEur,
      });
      for (const mult of [1.5, 2.0]) {
        const sRun = executeCoreSimulation(
          candles,
          simIndicators,
          patternsByIndex,
          swingResult.swings,
          swingLen,
          cfg,
          mult
        );
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

    return {
      schemaVersion: STRATEGY_SIM_SCHEMA_VERSION,
      status: 'READY',
      chartId,
      symbolCode,
      timeframe,
      candleCount: candles.length,
      quality,
      config: cfg,
      metrics: baseRun.metrics,
      equityCurve: baseRun.equityCurve,
      trades: baseRun.trades,
      costSensitivity,
    };
  },
};
