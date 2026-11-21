package es.manico.chartintelligence.algorithms

import es.manico.chartintelligence.data.model.CandleBar
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round
import kotlin.math.sqrt

/**
 * Phase 6 — Offline Trading Strategy Simulator (Android Kotlin)
 * Strictly aligned with docs/01-product/TRADING_STRATEGY_SPEC.md and Web `strategySimulator.js`:
 * - Offline research/simulation only (zero broker or live order APIs)
 * - Independent per chart_id with default Initial Equity = EUR 1,000 and 1% risk per trade
 * - Causal signal evaluation on bar close -> next-bar open execution (zero look-ahead)
 * - Conservative intrabar tie-breaker: Stop-Loss executes before Take-Profit (SL_BEFORE_TP)
 * - Explicit friction model: Spread, Commission, Slippage, Swap + 1.0x / 1.5x / 2.0x Cost Sensitivity
 */
object StrategySimulatorAlgorithm {

    const val SCHEMA_VERSION = "strategy-sim/1.0"

    enum class StrategyPreset(val id: String) {
        EMA_TREND_PULLBACK("EMA_TREND_PULLBACK"),
        SR_ZONE_PATTERN_BOUNCE("SR_ZONE_PATTERN_BOUNCE"),
        SUPERTREND_MOMENTUM("SUPERTREND_MOMENTUM"),
        BOLLINGER_MEAN_REVERSION("BOLLINGER_MEAN_REVERSION");

        companion object {
            fun fromId(raw: String?): StrategyPreset =
                entries.firstOrNull { it.id.equals(raw, ignoreCase = true) } ?: EMA_TREND_PULLBACK
        }
    }

    enum class TradeDirection(val id: String) {
        BOTH("BOTH"),
        LONG_ONLY("LONG_ONLY"),
        SHORT_ONLY("SHORT_ONLY");

        companion object {
            fun fromId(raw: String?): TradeDirection =
                entries.firstOrNull { it.id.equals(raw, ignoreCase = true) } ?: BOTH
        }
    }

    data class StrategyConfig(
        val preset: StrategyPreset = StrategyPreset.EMA_TREND_PULLBACK,
        val direction: TradeDirection = TradeDirection.BOTH,
        val initialEquity: Double = 1000.0,
        val riskPerTradePct: Double = 1.0,
        val rrRatio: Double = 2.0,
        val atrStopMult: Double = 1.5,
        val maxHoldBars: Int = 48,
        val spreadBps: Double = 4.0,
        val commissionBps: Double = 5.0,
        val slippageBps: Double = 2.0,
        val swapPerBarBps: Double = 0.15,
        val maxLeverage: Double = 5.0,
        val intrabarPolicy: String = "SL_BEFORE_TP"
    ) {
        fun normalized(): StrategyConfig = copy(
            initialEquity = initialEquity.coerceIn(100.0, 10_000_000.0),
            riskPerTradePct = riskPerTradePct.coerceIn(0.1, 10.0),
            rrRatio = rrRatio.coerceIn(0.5, 10.0),
            atrStopMult = atrStopMult.coerceIn(0.5, 6.0),
            maxHoldBars = maxHoldBars.coerceIn(4, 500),
            spreadBps = spreadBps.coerceIn(0.0, 200.0),
            commissionBps = commissionBps.coerceIn(0.0, 200.0),
            slippageBps = slippageBps.coerceIn(0.0, 200.0),
            swapPerBarBps = swapPerBarBps.coerceIn(0.0, 50.0),
            maxLeverage = maxLeverage.coerceIn(1.0, 20.0),
            intrabarPolicy = "SL_BEFORE_TP"
        )
    }

    data class EquityPoint(
        val index: Int,
        val timeMs: Long,
        val equity: Double,
        val drawdownPct: Double
    )

    data class SimulatedTrade(
        val id: Int,
        val side: String, // "LONG" | "SHORT"
        val entryIndex: Int,
        val exitIndex: Int,
        val entryTimeMs: Long,
        val exitTimeMs: Long,
        val rawEntryOpen: Double,
        val entryPrice: Double,
        val exitPrice: Double,
        val stopLoss: Double,
        val takeProfit: Double,
        val quantity: Double,
        val barsHeld: Int,
        val grossPnlEur: Double,
        val costsEur: Double,
        val netPnlEur: Double,
        val rMultiple: Double,
        val equityAfterEur: Double,
        val exitReason: String,
        val signalReason: String
    )

    data class StrategyMetrics(
        val initialEquity: Double,
        val finalEquity: Double,
        val netProfitEur: Double,
        val netReturnPct: Double,
        val totalTrades: Int,
        val winCount: Int,
        val lossCount: Int,
        val breakevenCount: Int,
        val winRatePct: Double,
        val grossProfitEur: Double,
        val grossLossEur: Double,
        val profitFactor: Double,
        val expectancyEur: Double,
        val averageR: Double,
        val maxDrawdownPct: Double,
        val maxDrawdownEur: Double,
        val sharpeRatio: Double,
        val sortinoRatio: Double,
        val maxConsecutiveWins: Int,
        val maxConsecutiveLosses: Int,
        val totalFeesEur: Double
    )

    data class CostSensitivityScenario(
        val label: String,
        val multiplier: Double,
        val netReturnPct: Double,
        val netProfitEur: Double,
        val profitFactor: Double,
        val maxDrawdownPct: Double,
        val totalFeesEur: Double
    )

    data class StrategySimulationResult(
        val schemaVersion: String = SCHEMA_VERSION,
        val status: String, // "READY" | "INSUFFICIENT_DATA"
        val chartId: String,
        val symbolCode: String,
        val timeframe: String,
        val candleCount: Int,
        val config: StrategyConfig,
        val metrics: StrategyMetrics,
        val equityCurve: List<EquityPoint>,
        val trades: List<SimulatedTrade>,
        val costSensitivity: List<CostSensitivityScenario>
    )

    private data class OpenPosition(
        val side: String,
        val entryIndex: Int,
        val entryTimeMs: Long,
        val rawEntryOpen: Double,
        val effectiveEntry: Double,
        val stopLoss: Double,
        val takeProfit: Double,
        val quantity: Double,
        val riskBudgetEur: Double,
        val signalReason: String
    )

    private data class PendingSignal(
        val side: String,
        val atr: Double,
        val reason: String
    )

    private data class CoreRunOutput(
        val metrics: StrategyMetrics,
        val equityCurve: List<EquityPoint>,
        val trades: List<SimulatedTrade>
    )

    private fun round2(v: Double): Double = if (v.isFinite()) round(v * 100.0) / 100.0 else 0.0
    private fun round4(v: Double): Double = if (v.isFinite()) round(v * 10000.0) / 10000.0 else 0.0

    fun runSimulation(
        rawCandles: List<CandleBar>,
        symbolCode: String = "SPOTBRENT",
        timeframe: String = "M15",
        chartId: String = "${symbolCode.uppercase()}_${timeframe.uppercase()}",
        config: StrategyConfig = StrategyConfig(),
        excludeOpenBars: Boolean = true,
        includeSensitivity: Boolean = true
    ): StrategySimulationResult {
        val normSym = symbolCode.uppercase()
        val normTf = timeframe.uppercase()
        val cfg = config.normalized()
        val normalized = TechnicalAnalysisCore.normalizeCandles(
            rawCandles = rawCandles,
            timeframe = normTf,
            symbolCode = normSym,
            excludeOpenBars = excludeOpenBars
        )
        val candles = normalized.candles

        if (candles.size < 30) {
            return StrategySimulationResult(
                status = "INSUFFICIENT_DATA",
                chartId = chartId,
                symbolCode = normSym,
                timeframe = normTf,
                candleCount = candles.size,
                config = cfg,
                metrics = emptyMetrics(cfg.initialEquity),
                equityCurve = emptyList(),
                trades = emptyList(),
                costSensitivity = emptyList()
            )
        }

        val core = TechnicalAnalysisCore.computeCoreIndicators(
            rawCandles = candles,
            timeframe = normTf,
            symbolCode = normSym,
            bollingerPeriod = 20,
            bollingerStdDev = 2.0,
            excludeOpenBars = false
        )
        val closes = candles.map { it.close.toDouble() }
        val ema50 = PriceFormatterAlgorithm.computeEmaValues(closes, 50)
        val swingLen = 3
        val swingResult = TechnicalAnalysisCore.detectSwingsAndTrend(candles, swingLen)
        val patterns = TechnicalAnalysisCore.detectCandlestickPatterns(candles, 14)
        val patternsByIndex = patterns.groupBy { it.anchorIndex }

        val baseRun = executeCore(
            candles = candles,
            ema20 = core.ema20,
            ema50 = ema50,
            rsi14 = core.rsi14,
            atr14 = core.atr14,
            macd = core.macd,
            supertrend = core.supertrend,
            bollinger = core.bollinger,
            patternsByIndex = patternsByIndex,
            swings = swingResult.swings,
            swingLen = swingLen,
            cfg = cfg,
            frictionMult = 1.0
        )

        val sensitivity = if (includeSensitivity) {
            buildList {
                add(
                    CostSensitivityScenario(
                        label = "1.0x (Base)",
                        multiplier = 1.0,
                        netReturnPct = baseRun.metrics.netReturnPct,
                        netProfitEur = baseRun.metrics.netProfitEur,
                        profitFactor = baseRun.metrics.profitFactor,
                        maxDrawdownPct = baseRun.metrics.maxDrawdownPct,
                        totalFeesEur = baseRun.metrics.totalFeesEur
                    )
                )
                for (mult in listOf(1.5, 2.0)) {
                    val sRun = executeCore(
                        candles = candles,
                        ema20 = core.ema20,
                        ema50 = ema50,
                        rsi14 = core.rsi14,
                        atr14 = core.atr14,
                        macd = core.macd,
                        supertrend = core.supertrend,
                        bollinger = core.bollinger,
                        patternsByIndex = patternsByIndex,
                        swings = swingResult.swings,
                        swingLen = swingLen,
                        cfg = cfg,
                        frictionMult = mult
                    )
                    add(
                        CostSensitivityScenario(
                            label = String.format(java.util.Locale.US, "%.1fx", mult),
                            multiplier = mult,
                            netReturnPct = sRun.metrics.netReturnPct,
                            netProfitEur = sRun.metrics.netProfitEur,
                            profitFactor = sRun.metrics.profitFactor,
                            maxDrawdownPct = sRun.metrics.maxDrawdownPct,
                            totalFeesEur = sRun.metrics.totalFeesEur
                        )
                    )
                }
            }
        } else {
            emptyList()
        }

        return StrategySimulationResult(
            status = "READY",
            chartId = chartId,
            symbolCode = normSym,
            timeframe = normTf,
            candleCount = candles.size,
            config = cfg,
            metrics = baseRun.metrics,
            equityCurve = baseRun.equityCurve,
            trades = baseRun.trades,
            costSensitivity = sensitivity
        )
    }

    private fun emptyMetrics(initialEquity: Double): StrategyMetrics = StrategyMetrics(
        initialEquity = round2(initialEquity),
        finalEquity = round2(initialEquity),
        netProfitEur = 0.0,
        netReturnPct = 0.0,
        totalTrades = 0,
        winCount = 0,
        lossCount = 0,
        breakevenCount = 0,
        winRatePct = 0.0,
        grossProfitEur = 0.0,
        grossLossEur = 0.0,
        profitFactor = 0.0,
        expectancyEur = 0.0,
        averageR = 0.0,
        maxDrawdownPct = 0.0,
        maxDrawdownEur = 0.0,
        sharpeRatio = 0.0,
        sortinoRatio = 0.0,
        maxConsecutiveWins = 0,
        maxConsecutiveLosses = 0,
        totalFeesEur = 0.0
    )

    private fun executeCore(
        candles: List<CandleBar>,
        ema20: List<Double?>,
        ema50: List<Double?>,
        rsi14: List<Double?>,
        atr14: List<Double?>,
        macd: List<PriceFormatterAlgorithm.MacdPoint?>,
        supertrend: List<PriceFormatterAlgorithm.SupertrendPoint?>,
        bollinger: List<PriceFormatterAlgorithm.BollingerPoint?>,
        patternsByIndex: Map<Int, List<TechnicalAnalysisCore.CandlestickPattern>>,
        swings: List<TechnicalAnalysisCore.SwingPivot>,
        swingLen: Int,
        cfg: StrategyConfig,
        frictionMult: Double
    ): CoreRunOutput {
        val n = candles.size
        val initialEquity = cfg.initialEquity
        val spreadBps = cfg.spreadBps * frictionMult
        val commissionBps = cfg.commissionBps * frictionMult
        val slippageBps = cfg.slippageBps * frictionMult
        val swapPerBarBps = cfg.swapPerBarBps * frictionMult

        val swingsByConfirm = mutableMapOf<Int, MutableList<TechnicalAnalysisCore.SwingPivot>>()
        for (sw in swings) {
            val confirmIdx = sw.index + swingLen
            if (confirmIdx < n) {
                swingsByConfirm.getOrPut(confirmIdx) { mutableListOf() }.add(sw)
            }
        }
        val confirmedHighs = ArrayDeque<Double>()
        val confirmedLows = ArrayDeque<Double>()

        var equity = initialEquity
        var peakEquity = initialEquity
        var maxDrawdownEur = 0.0
        var maxDrawdownPct = 0.0

        var openPosition: OpenPosition? = null
        var pendingSignal: PendingSignal? = null

        val trades = mutableListOf<SimulatedTrade>()
        val tradeReturns = mutableListOf<Double>()
        val equityCurve = ArrayList<EquityPoint>(n)

        val allowLong = cfg.direction == TradeDirection.BOTH || cfg.direction == TradeDirection.LONG_ONLY
        val allowShort = cfg.direction == TradeDirection.BOTH || cfg.direction == TradeDirection.SHORT_ONLY

        val entrySlipFactor = (spreadBps * 0.5 + slippageBps) / 10000.0
        val exitSlipFactor = (spreadBps * 0.5 + slippageBps) / 10000.0

        fun closePositionOnBar(pos: OpenPosition, barIdx: Int, rawExitPrice: Double, exitReason: String) {
            val isLong = pos.side == "LONG"
            val effectiveExit = if (isLong) {
                rawExitPrice * (1.0 - exitSlipFactor)
            } else {
                rawExitPrice * (1.0 + exitSlipFactor)
            }

            val barsHeld = max(1, barIdx - pos.entryIndex + 1)
            val entryNotional = pos.effectiveEntry * pos.quantity
            val exitNotional = effectiveExit * pos.quantity

            val grossPnlEur = if (isLong) {
                (rawExitPrice - pos.rawEntryOpen) * pos.quantity
            } else {
                (pos.rawEntryOpen - rawExitPrice) * pos.quantity
            }
            val spreadSlipEur = if (isLong) {
                ((pos.effectiveEntry - pos.rawEntryOpen) + (rawExitPrice - effectiveExit)) * pos.quantity
            } else {
                ((pos.rawEntryOpen - pos.effectiveEntry) + (effectiveExit - rawExitPrice)) * pos.quantity
            }
            val commissionEur = (entryNotional + exitNotional) * (commissionBps / 10000.0)
            val swapEur = entryNotional * (swapPerBarBps / 10000.0) * barsHeld
            val costsEur = max(0.0, spreadSlipEur + commissionEur + swapEur)
            val netPnlEur = grossPnlEur - costsEur
            val rMultiple = if (pos.riskBudgetEur > 0.0) netPnlEur / pos.riskBudgetEur else 0.0

            val equityBefore = equity
            equity = max(0.0, equity + netPnlEur)
            if (equity > peakEquity) peakEquity = equity
            val ddEur = max(0.0, peakEquity - equity)
            val ddPct = if (peakEquity > 0.0) (ddEur / peakEquity) * 100.0 else 0.0
            if (ddEur > maxDrawdownEur) maxDrawdownEur = ddEur
            if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct

            if (equityBefore > 0.0) {
                tradeReturns.add(netPnlEur / equityBefore)
            }

            trades.add(
                SimulatedTrade(
                    id = trades.size + 1,
                    side = pos.side,
                    entryIndex = pos.entryIndex,
                    exitIndex = barIdx,
                    entryTimeMs = pos.entryTimeMs,
                    exitTimeMs = candles[barIdx].openTimeUtcMillis,
                    rawEntryOpen = round4(pos.rawEntryOpen),
                    entryPrice = round4(pos.effectiveEntry),
                    exitPrice = round4(effectiveExit),
                    stopLoss = round4(pos.stopLoss),
                    takeProfit = round4(pos.takeProfit),
                    quantity = round4(pos.quantity),
                    barsHeld = barsHeld,
                    grossPnlEur = round2(grossPnlEur),
                    costsEur = round2(costsEur),
                    netPnlEur = round2(netPnlEur),
                    rMultiple = round2(rMultiple),
                    equityAfterEur = round2(equity),
                    exitReason = exitReason,
                    signalReason = pos.signalReason
                )
            )
        }

        for (i in 0 until n) {
            val bar = candles[i]
            val barOpen = bar.open.toDouble()
            val barHigh = bar.high.toDouble()
            val barLow = bar.low.toDouble()
            val barClose = bar.close.toDouble()

            swingsByConfirm[i]?.forEach { sw ->
                if (sw.type == "SWING_HIGH") {
                    confirmedHighs.addLast(sw.price)
                    if (confirmedHighs.size > 12) confirmedHighs.removeFirst()
                } else if (sw.type == "SWING_LOW") {
                    confirmedLows.addLast(sw.price)
                    if (confirmedLows.size > 12) confirmedLows.removeFirst()
                }
            }

            val pending = pendingSignal
            if (pending != null && openPosition == null && equity > 1.0) {
                val isLong = pending.side == "LONG"
                val effectiveEntry = if (isLong) {
                    barOpen * (1.0 + entrySlipFactor)
                } else {
                    barOpen * (1.0 - entrySlipFactor)
                }
                val stopDist = max(pending.atr * cfg.atrStopMult, barOpen * 0.001)
                val stopLoss = if (isLong) effectiveEntry - stopDist else effectiveEntry + stopDist
                val takeProfit = if (isLong) {
                    effectiveEntry + stopDist * cfg.rrRatio
                } else {
                    effectiveEntry - stopDist * cfg.rrRatio
                }
                val riskBudgetEur = equity * (cfg.riskPerTradePct / 100.0)
                val maxQty = if (effectiveEntry > 0.0) (equity * cfg.maxLeverage) / effectiveEntry else 0.0
                val rawQty = if (stopDist > 0.0) riskBudgetEur / stopDist else 0.0
                val qty = min(rawQty, maxQty)
                if (qty > 0.0 && qty.isFinite()) {
                    openPosition = OpenPosition(
                        side = pending.side,
                        entryIndex = i,
                        entryTimeMs = bar.openTimeUtcMillis,
                        rawEntryOpen = barOpen,
                        effectiveEntry = effectiveEntry,
                        stopLoss = stopLoss,
                        takeProfit = takeProfit,
                        quantity = qty,
                        riskBudgetEur = qty * stopDist,
                        signalReason = pending.reason
                    )
                }
                pendingSignal = null
            }

            val currentPos = openPosition
            if (currentPos != null) {
                val isLong = currentPos.side == "LONG"
                val slHit = if (isLong) barLow <= currentPos.stopLoss else barHigh >= currentPos.stopLoss
                val tpHit = if (isLong) barHigh >= currentPos.takeProfit else barLow <= currentPos.takeProfit
                val barsHeld = i - currentPos.entryIndex + 1

                when {
                    slHit -> {
                        closePositionOnBar(currentPos, i, currentPos.stopLoss, "SL_HIT")
                        openPosition = null
                    }
                    tpHit -> {
                        closePositionOnBar(currentPos, i, currentPos.takeProfit, "TP_HIT")
                        openPosition = null
                    }
                    barsHeld >= cfg.maxHoldBars -> {
                        closePositionOnBar(currentPos, i, barClose, "TIME_STOP")
                        openPosition = null
                    }
                    i == n - 1 -> {
                        closePositionOnBar(currentPos, i, barClose, "END_OF_DATA")
                        openPosition = null
                    }
                }
            }

            val ddPctBar = if (peakEquity > 0.0) max(0.0, ((peakEquity - equity) / peakEquity) * 100.0) else 0.0
            equityCurve.add(
                EquityPoint(
                    index = i,
                    timeMs = bar.openTimeUtcMillis,
                    equity = round2(equity),
                    drawdownPct = round2(ddPctBar)
                )
            )

            if (openPosition == null && pendingSignal == null && i in 1 until (n - 1) && equity > 1.0) {
                val atrNow = atr14.getOrNull(i)
                if (atrNow == null || !atrNow.isFinite() || atrNow <= 0.0) continue

                var signalSide: String? = null
                var signalReason = ""

                when (cfg.preset) {
                    StrategyPreset.EMA_TREND_PULLBACK -> {
                        val e20 = ema20.getOrNull(i)
                        val e50 = ema50.getOrNull(i)
                        val rPrev = rsi14.getOrNull(i - 1)
                        val rNow = rsi14.getOrNull(i)
                        if (e20 != null && e50 != null && rPrev != null && rNow != null) {
                            if (allowLong && e20 > e50 && barClose > e50 && rPrev <= 45.0 && rNow > 45.0) {
                                signalSide = "LONG"
                                signalReason = "EMA20>EMA50 + RSI14>45 pullback"
                            } else if (allowShort && e20 < e50 && barClose < e50 && rPrev >= 55.0 && rNow < 55.0) {
                                signalSide = "SHORT"
                                signalReason = "EMA20<EMA50 + RSI14<55 pullback"
                            }
                        }
                    }

                    StrategyPreset.SR_ZONE_PATTERN_BOUNCE -> {
                        val barPatterns = patternsByIndex[i].orEmpty()
                        val bullPat = barPatterns.firstOrNull { it.direction == 1 }
                        val bearPat = barPatterns.firstOrNull { it.direction == -1 }
                        val tol = atrNow * 1.25
                        if (allowLong && bullPat != null && confirmedLows.any { abs(barLow - it) <= tol }) {
                            signalSide = "LONG"
                            signalReason = "Support bounce + ${bullPat.type}"
                        } else if (allowShort && bearPat != null && confirmedHighs.any { abs(barHigh - it) <= tol }) {
                            signalSide = "SHORT"
                            signalReason = "Resistance reject + ${bearPat.type}"
                        }
                    }

                    StrategyPreset.SUPERTREND_MOMENTUM -> {
                        val dNow = supertrend.getOrNull(i)?.direction
                        val dPrev = supertrend.getOrNull(i - 1)?.direction
                        val mh = macd.getOrNull(i)?.histogram
                        if (dNow != null && dPrev != null) {
                            if (allowLong && dNow == 1 && dPrev == -1 && (mh == null || mh >= 0.0)) {
                                signalSide = "LONG"
                                signalReason = "Supertrend bullish flip + MACD"
                            } else if (allowShort && dNow == -1 && dPrev == 1 && (mh == null || mh <= 0.0)) {
                                signalSide = "SHORT"
                                signalReason = "Supertrend bearish flip + MACD"
                            }
                        }
                    }

                    StrategyPreset.BOLLINGER_MEAN_REVERSION -> {
                        val prevClose = candles[i - 1].close.toDouble()
                        val bbPrev = bollinger.getOrNull(i - 1)
                        val bbNow = bollinger.getOrNull(i)
                        val rNow = rsi14.getOrNull(i)
                        if (bbPrev != null && bbNow != null) {
                            if (allowLong && prevClose < bbPrev.lower && barClose >= bbNow.lower && (rNow == null || rNow <= 42.0)) {
                                signalSide = "LONG"
                                signalReason = "Bollinger lower band re-entry"
                            } else if (allowShort && prevClose > bbPrev.upper && barClose <= bbNow.upper && (rNow == null || rNow >= 58.0)) {
                                signalSide = "SHORT"
                                signalReason = "Bollinger upper band re-entry"
                            }
                        }
                    }
                }

                if (signalSide != null) {
                    pendingSignal = PendingSignal(signalSide, atrNow, signalReason)
                }
            }
        }

        var winCount = 0
        var lossCount = 0
        var breakevenCount = 0
        var grossProfit = 0.0
        var grossLoss = 0.0
        var totalFeesEur = 0.0
        var sumR = 0.0
        var maxConsecutiveWins = 0
        var maxConsecutiveLosses = 0
        var curWins = 0
        var curLosses = 0

        for (t in trades) {
            totalFeesEur += t.costsEur
            sumR += t.rMultiple
            when {
                t.netPnlEur > 0.005 -> {
                    winCount++
                    grossProfit += t.netPnlEur
                    curWins++
                    curLosses = 0
                    if (curWins > maxConsecutiveWins) maxConsecutiveWins = curWins
                }
                t.netPnlEur < -0.005 -> {
                    lossCount++
                    grossLoss += abs(t.netPnlEur)
                    curLosses++
                    curWins = 0
                    if (curLosses > maxConsecutiveLosses) maxConsecutiveLosses = curLosses
                }
                else -> {
                    breakevenCount++
                    curWins = 0
                    curLosses = 0
                }
            }
        }

        val totalTrades = trades.size
        val netProfit = equity - initialEquity
        val netReturnPct = if (initialEquity > 0.0) (netProfit / initialEquity) * 100.0 else 0.0
        val winRatePct = if (totalTrades > 0) (winCount.toDouble() / totalTrades.toDouble()) * 100.0 else 0.0
        val profitFactor = when {
            grossLoss > 0.0 -> grossProfit / grossLoss
            grossProfit > 0.0 -> 99.99
            else -> 0.0
        }
        val expectancyEur = if (totalTrades > 0) netProfit / totalTrades else 0.0
        val averageR = if (totalTrades > 0) sumR / totalTrades else 0.0

        var sharpeRatio = 0.0
        var sortinoRatio = 0.0
        if (tradeReturns.size >= 2) {
            val mean = tradeReturns.average()
            val variance = tradeReturns.sumOf { (it - mean) * (it - mean) } / (tradeReturns.size - 1)
            val std = sqrt(variance)
            if (std > 1e-9) {
                sharpeRatio = (mean / std) * sqrt(tradeReturns.size.toDouble())
            }
            val downsideSq = tradeReturns.sumOf { if (it < 0.0) it * it else 0.0 } / tradeReturns.size
            val downsideStd = sqrt(downsideSq)
            if (downsideStd > 1e-9) {
                sortinoRatio = (mean / downsideStd) * sqrt(tradeReturns.size.toDouble())
            } else if (mean > 0.0) {
                sortinoRatio = 9.99
            }
        }

        return CoreRunOutput(
            metrics = StrategyMetrics(
                initialEquity = round2(initialEquity),
                finalEquity = round2(equity),
                netProfitEur = round2(netProfit),
                netReturnPct = round2(netReturnPct),
                totalTrades = totalTrades,
                winCount = winCount,
                lossCount = lossCount,
                breakevenCount = breakevenCount,
                winRatePct = round2(winRatePct),
                grossProfitEur = round2(grossProfit),
                grossLossEur = round2(grossLoss),
                profitFactor = round2(min(99.99, profitFactor)),
                expectancyEur = round2(expectancyEur),
                averageR = round2(averageR),
                maxDrawdownPct = round2(maxDrawdownPct),
                maxDrawdownEur = round2(maxDrawdownEur),
                sharpeRatio = round2(sharpeRatio),
                sortinoRatio = round2(min(9.99, sortinoRatio)),
                maxConsecutiveWins = maxConsecutiveWins,
                maxConsecutiveLosses = maxConsecutiveLosses,
                totalFeesEur = round2(totalFeesEur)
            ),
            equityCurve = equityCurve,
            trades = trades
        )
    }
}
