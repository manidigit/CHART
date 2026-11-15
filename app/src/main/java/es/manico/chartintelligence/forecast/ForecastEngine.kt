package es.manico.chartintelligence.forecast

import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm
import es.manico.chartintelligence.data.model.CandleBar
import java.math.BigDecimal
import java.util.Locale
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.round
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * CHART INTELLIGENCE — Scenario-Based Future Candle Projection Engine (Android Parity)
 * Replaces flat Quantile/MAE averaging with:
 * 1. Multi-Timeframe State & SMC Feature Extraction (`extractMultiTimeframeFeatures`)
 * 2. Historical Analog Search (`findHistoricalAnalogs` via k-NN Pattern Matching)
 * 3. K-Medoids Clustering (`generateScenarios` preserving realistic OHLCV waves & wicks)
 * 4. SMC Liquidity Magnet Warping (FVG / POC / VAH / VAL / EQH / EQL)
 * 5. Live 15m Bayesian Probability & Re-Anchoring Engine (`evaluateAndUpdateLive`)
 */

const val CANONICAL_SMC_HORIZON = 60

data class LowerTimeframeInfo(val timeframe: String, val ratio: Int)

fun resolveLowerTimeframeInfo(timeframe: String): LowerTimeframeInfo? {
    return when (timeframe.trim().uppercase(Locale.US)) {
        "M30" -> LowerTimeframeInfo("M15", 2)
        "H1" -> LowerTimeframeInfo("M15", 4)
        "H4" -> LowerTimeframeInfo("H1", 4)
        "D1" -> LowerTimeframeInfo("H4", 6)
        else -> null
    }
}

class SMCPredictionEngine(
    private val windowSize: Int = 30,
    private val horizon: Int = 20,
    private val engineTimeframe: String = "M15"
) {
    private val canonicalHorizon: Int = CANONICAL_SMC_HORIZON
    private val topKAnalogs: Int = 45

    data class FvgBox(
        val top: Double,
        val bottom: Double,
        val midpoint: Double,
        val type: String,
        val mitigated: Boolean
    )

    data class FullSmcState(
        val context: SmcMarketContext,
        val unmitigatedFVGs: List<FvgBox>,
        val equalHighs: List<Double>,
        val equalLows: List<Double>,
        val avgVolume: Double,
        val avgBodyRatio: Double,
        val avgUpperWickRatio: Double,
        val avgLowerWickRatio: Double,
        val timeframe: String = "M15"
    )

    data class AnalogItem(
        val futureWindow: List<CandleBar>,
        val pastAtr: Double,
        val distance: Double,
        val coreEvalLen: Int = 14
    )

    fun calculateATR(candles: List<CandleBar>, period: Int = 14): Double {
        if (candles.size < 2) return 0.5
        val p = min(period, candles.size - 1)
        var trSum = 0.0
        for (i in (candles.size - p) until candles.size) {
            val curr = candles[i]
            val prevClose = candles[i - 1].close.toDouble()
            val hi = curr.high.toDouble()
            val lo = curr.low.toDouble()
            val tr = max(hi - lo, max(abs(hi - prevClose), abs(lo - prevClose)))
            trSum += tr
        }
        val lastClose = candles.last().close.toDouble().coerceAtLeast(1e-4)
        return max(trSum / max(1, p).toDouble(), lastClose * 0.0012)
    }

    fun extractMultiTimeframeFeatures(candles: List<CandleBar>, timeframe: String = "M15"): FullSmcState {
        val n = candles.size
        val lastCandle = candles.last()
        val lastClose = lastCandle.close.toDouble()
        val atr = calculateATR(candles, 14)

        val ratioCount = min(30, max(1, n - 1))
        var bodyRatioSum = 0.0
        var upperWickSum = 0.0
        var lowerWickSum = 0.0
        for (i in (n - ratioCount) until n) {
            val c = candles[i]
            val hi = c.high.toDouble()
            val lo = c.low.toDouble()
            val op = c.open.toDouble()
            val cl = c.close.toDouble()
            val rng = max(hi - lo, lastClose * 0.0004)
            bodyRatioSum += abs(cl - op) / rng
            upperWickSum += (hi - max(op, cl)) / rng
            lowerWickSum += (min(op, cl) - lo) / rng
        }

        val v20Count = min(20, n)
        var vol20Sum = 0.0
        for (i in (n - v20Count) until n) {
            vol20Sum += max(1.0, candles[i].volume.toDouble())
        }
        val avgVolume = max(10.0, vol20Sum / max(1, v20Count).toDouble())

        val recentSlice = candles.takeLast(min(n, 140))
        val smc = PriceFormatterAlgorithm.detectSmcMarketStructures(recentSlice, 3)
        val vpRaw = PriceFormatterAlgorithm.computeVolumeProfile(
            recentSlice,
            24,
            0.70
        )
        val ema20List = PriceFormatterAlgorithm.computeEmaValues(
            recentSlice.map { it.close.toDouble() },
            min(20, max(5, recentSlice.size - 2))
        )
        val ema20 = ema20List.lastOrNull() ?: lastClose

        val tfNorm = timeframe.ifBlank { engineTimeframe }.trim().uppercase(Locale.US)
        val midGroup = when (tfNorm) {
            "M30" -> 2
            "H1" -> 4
            "H4" -> 6
            "D1", "W1" -> 5
            else -> 4
        }
        val macroGroup = when (tfNorm) {
            "M30" -> 8
            "H1" -> 24
            "H4" -> 30
            "D1", "W1" -> 20
            else -> 16
        }

        val lastBos = smc.structures.lastOrNull()
        val scoreBase = (if (lastClose >= ema20) 0.5 else -0.5) +
            (if (lastBos != null) (if (lastBos.direction >= 0) 0.5 else -0.5) else 0.0)

        fun aggregateCandles(src: List<CandleBar>, groupSize: Int): List<CandleBar> {
            if (src.size < groupSize * 3) return emptyList()
            val out = ArrayList<CandleBar>(src.size / groupSize)
            var i = 0
            while (i + groupSize <= src.size) {
                val chunk = src.subList(i, i + groupSize)
                val hi = chunk.maxOf { it.high }
                val lo = chunk.minOf { it.low }
                val vol = chunk.fold(BigDecimal.ZERO) { acc, b -> acc.add(b.volume) }
                out.add(
                    CandleBar(
                        openTimeUtcMillis = chunk.first().openTimeUtcMillis,
                        openTimeUtcIso = chunk.first().openTimeUtcIso,
                        open = chunk.first().open,
                        high = hi,
                        low = lo,
                        close = chunk.last().close,
                        volume = vol
                    )
                )
                i += groupSize
            }
            return out
        }

        fun computeTfScore(tfCandles: List<CandleBar>): Double {
            if (tfCandles.size < 5) return scoreBase
            val eArr = PriceFormatterAlgorithm.computeEmaValues(
                tfCandles.map { it.close.toDouble() },
                min(20, max(4, tfCandles.size - 1))
            )
            val eVal = eArr.lastOrNull() ?: tfCandles.last().close.toDouble()
            val cl = tfCandles.last().close.toDouble()
            val prevCl = tfCandles[max(0, tfCandles.size - 4)].close.toDouble()
            val emaSign = if (cl >= eVal) 1.0 else -1.0
            val structSign = if (cl >= prevCl) 1.0 else -1.0
            return 0.5 * emaSign + 0.5 * structSign
        }

        val scoreMid = computeTfScore(aggregateCandles(recentSlice, midGroup))
        val scoreMacro = computeTfScore(aggregateCandles(recentSlice, macroGroup))
        val htfTrendBias = ((0.40 * scoreBase + 0.35 * scoreMid + 0.25 * scoreMacro) * 1000.0).roundToInt() / 1000.0

        val unmitigatedFVGs = smc.fvgs.map { f ->
            FvgBox(
                top = f.top,
                bottom = f.bottom,
                midpoint = (f.top + f.bottom) * 0.5,
                type = if (f.direction >= 0) "bullish" else "bearish",
                mitigated = false
            )
        }

        val poc = vpRaw?.pocPrice ?: ema20
        val vah = vpRaw?.vahPrice ?: (lastClose + 2.2 * atr)
        val valPrice = vpRaw?.valPrice ?: (lastClose - 2.2 * atr)

        val eqHighs = smc.equalLevels.filter { it.type == "EQH" }.map { it.price }
        val eqLows = smc.equalLevels.filter { it.type == "EQL" }.map { it.price }

        return FullSmcState(
            context = SmcMarketContext(
                htfTrendBias = htfTrendBias.coerceIn(-1.0, 1.0),
                poc = poc,
                vah = vah,
                valPrice = valPrice,
                ema20 = ema20,
                unmitigatedFvgCount = unmitigatedFVGs.size,
                eqHighCount = eqHighs.size,
                eqLowCount = eqLows.size
            ),
            unmitigatedFVGs = unmitigatedFVGs,
            equalHighs = eqHighs,
            equalLows = eqLows,
            avgVolume = avgVolume,
            avgBodyRatio = (bodyRatioSum / ratioCount).coerceIn(0.38, 0.74),
            avgUpperWickRatio = (upperWickSum / ratioCount).coerceIn(0.15, 0.46),
            avgLowerWickRatio = (lowerWickSum / ratioCount).coerceIn(0.15, 0.46),
            timeframe = tfNorm
        )
    }

    private fun extractNormalizedShape(window: List<CandleBar>, atr: Double): DoubleArray {
        val baseClose = window.firstOrNull()?.close?.toDouble() ?: 1.0
        val safeAtr = max(atr, 0.0001)
        val out = DoubleArray(window.size * 2)
        for (i in window.indices) {
            val c = window[i]
            val cl = c.close.toDouble()
            val op = c.open.toDouble()
            val hi = c.high.toDouble()
            val lo = c.low.toDouble()
            out[i * 2] = (cl - baseClose) / safeAtr
            val range = max(hi - lo, 0.0001)
            out[i * 2 + 1] = (cl - op) / range
        }
        return out
    }

    fun findHistoricalAnalogs(allHistory: List<CandleBar>, currentAtr: Double): List<AnalogItem> {
        val effWindow = min(windowSize, max(10, (allHistory.size * 0.35).toInt()))
        val coreAnalogLen = min(20, max(10, (allHistory.size * 0.22).toInt()))
        val currentWindow = allHistory.takeLast(effWindow)
        val currentVec = extractNormalizedShape(currentWindow, currentAtr)
        val analogs = ArrayList<AnalogItem>()

        val maxSearchIdx = allHistory.size - effWindow - coreAnalogLen - 2
        val step = if (maxSearchIdx > 180) 2 else 1

        var i = 15
        while (i <= maxSearchIdx) {
            val candidateWindow = allHistory.subList(i, i + effWindow)
            val pastAtr = calculateATR(allHistory.subList(max(0, i - 14), i + effWindow), 14)
            val candidateVec = extractNormalizedShape(candidateWindow, pastAtr)

            var dist = 0.0
            for (j in currentVec.indices) {
                val weight = if (j > currentVec.size * 0.6) 2.0 else 1.0
                val diff = currentVec[j] - candidateVec.getOrElse(j) { 0.0 }
                dist += weight * diff.pow(2.0)
            }
            dist = sqrt(dist)

            val futureEnd = min(allHistory.size, i + effWindow + canonicalHorizon)
            val futureWindow = allHistory.subList(i + effWindow, futureEnd)
            if (futureWindow.size >= coreAnalogLen) {
                analogs.add(
                    AnalogItem(
                        futureWindow = futureWindow,
                        pastAtr = pastAtr,
                        distance = dist,
                        coreEvalLen = min(14, coreAnalogLen)
                    )
                )
            }
            i += step
        }

        if (analogs.size < 9) {
            val lastCandle = allHistory.last()
            val baseP = lastCandle.close.toDouble()
            val baseVol = max(50.0, lastCandle.volume.toDouble())
            val syntheticProfiles = listOf(
                Triple(1, -0.42, 0.45),
                Triple(1, -0.28, 0.55),
                Triple(-1, 0.42, 0.52),
                Triple(-1, 0.28, 0.62),
                Triple(0, -0.24, 0.58),
                Triple(0, 0.24, 0.64)
            )
            syntheticProfiles.forEachIndexed { sIdx, (dir, pull, baseDist) ->
                val fw = ArrayList<CandleBar>(canonicalHorizon)
                var p = baseP
                for (h in 0 until canonicalHorizon) {
                    val cyclePos = if (h >= 3) (h - 3) % 14 else -1
                    val isPull = h < 3
                    val isCorrWave = cyclePos in 8..12
                    val isMicroDip = cyclePos == 3 || cyclePos == 6
                    val stepDelta = when {
                        isPull -> pull * currentAtr * 0.42
                        dir == 0 -> sin((h + sIdx) * 0.85) * currentAtr * 0.42
                        isCorrWave -> -dir * currentAtr * (0.28 + 0.16 * abs(sin(h * 0.9)))
                        isMicroDip -> -dir * currentAtr * 0.30
                        else -> {
                            val damp = 1.0 / (1.0 + h * 0.025)
                            dir * currentAtr * (0.38 + 0.18 * abs(cos(h * 0.8))) * damp
                        }
                    }
                    val op = p
                    val cl = max(baseP * 0.1, op + stepDelta)
                    val hi = max(op, cl) + currentAtr * (0.22 + 0.14 * abs(cos((h + sIdx).toDouble())))
                    val lo = max(baseP * 0.05, min(op, cl) - currentAtr * (0.22 + 0.14 * abs(sin((h + sIdx).toDouble()))))
                    val vol = (baseVol * (if (isCorrWave || isMicroDip) 0.68 else 1.28)).roundToInt()
                    fw.add(
                        CandleBar(
                            openTimeUtcMillis = lastCandle.openTimeUtcMillis + (h + 1) * 900_000L,
                            openTimeUtcIso = "",
                            open = BigDecimal.valueOf(op),
                            high = BigDecimal.valueOf(hi),
                            low = BigDecimal.valueOf(lo),
                            close = BigDecimal.valueOf(cl),
                            volume = BigDecimal.valueOf(vol.toLong())
                        )
                    )
                    p = cl
                }
                analogs.add(AnalogItem(futureWindow = fw, pastAtr = currentAtr, distance = baseDist + sIdx * 0.05, coreEvalLen = 14))
            }
        }

        return analogs.sortedBy { it.distance }.take(topKAnalogs)
    }

    fun generateScenarios(
        history: List<CandleBar>,
        smcState: FullSmcState,
        futureTimestamps: LongArray
    ): List<SmcProjectedScenario> {
        val currentAtr = calculateATR(history, 14)
        val lastCandle = history.last()
        val lastCloseVal = lastCandle.close.toDouble()
        val analogs = findHistoricalAnalogs(history, currentAtr)

        val bullishGroup = ArrayList<AnalogItem>()
        val bearishGroup = ArrayList<AnalogItem>()
        val rangingGroup = ArrayList<AnalogItem>()

        for (item in analogs) {
            val evalIdx = min(item.coreEvalLen - 1, item.futureWindow.lastIndex)
            val startP = item.futureWindow.first().open.toDouble()
            val endP = item.futureWindow[evalIdx].close.toDouble()
            val netMoveInAtr = (endP - startP) / max(item.pastAtr, 0.0001)
            when {
                netMoveInAtr > 0.65 -> bullishGroup.add(item)
                netMoveInAtr < -0.65 -> bearishGroup.add(item)
                else -> rangingGroup.add(item)
            }
        }

        val bias = smcState.context.htfTrendBias
        data class ClusterBucket(val type: String, val group: List<AnalogItem>, val weight: Double)

        val rawCounts = listOf(
            ClusterBucket("BULL", bullishGroup, max(1.2, bullishGroup.size + 1.5) * (1.0 + 0.38 * bias)),
            ClusterBucket("BEAR", bearishGroup, max(1.0, bearishGroup.size + 1.2) * (1.0 - 0.38 * bias)),
            ClusterBucket("RANGE", rangingGroup, max(0.9, rangingGroup.size + 1.0) * (1.0 - 0.15 * abs(bias)))
        ).sortedByDescending { it.weight }

        val totalWeight = rawCounts.sumOf { max(it.weight, 0.2) }
        val p0 = ((max(rawCounts[0].weight, 0.2) / totalWeight) * 100.0).roundToInt() / 100.0
        val p1 = ((max(rawCounts[1].weight, 0.2) / totalWeight) * 100.0).roundToInt() / 100.0
        val p2 = (max(0.01, 1.0 - p0 - p1) * 100.0).roundToInt() / 100.0
        val normProbs = listOf(p0, p1, p2)
        val scenarioIds = listOf("SCENARIO_A", "SCENARIO_B", "SCENARIO_C")
        val targetOutHorizon = min(horizon, if (futureTimestamps.isNotEmpty()) futureTimestamps.size else horizon)

        return rawCounts.mapIndexed { idx, cluster ->
            val representative = if (cluster.group.isNotEmpty()) {
                cluster.group[cluster.group.size / 2]
            } else {
                analogs[min(idx, analogs.lastIndex)]
            }

            val pullbackPrice = findNearestPullbackLevel(lastCloseVal, currentAtr, smcState, cluster.type)
            val primaryTarget = findPrimaryTargetLevel(lastCloseVal, currentAtr, smcState, cluster.type)
            val canonicalCandles = buildRealisticCandles(
                templateCandles = representative.futureWindow,
                templateAtr = representative.pastAtr,
                anchorCandle = lastCandle,
                currentAtr = currentAtr,
                smc = smcState,
                direction = cluster.type,
                futureTimestamps = futureTimestamps,
                totalBars = canonicalHorizon
            )
            val projectedCandles = canonicalCandles.take(targetOutHorizon)
            val finalClose = projectedCandles.last().close

            SmcProjectedScenario(
                id = scenarioIds[idx],
                clusterType = cluster.type,
                bias = when (cluster.type) {
                    "BULL" -> "bull"
                    "BEAR" -> "bear"
                    else -> "neutral"
                },
                name = when (cluster.type) {
                    "BULL" -> "سناریوی صعودی (اصلاح به FVG/POC و حرکت به سمت VAH/EQH)"
                    "BEAR" -> "سناریوی نزولی (اصلاح به FVG و ریزش به سمت نقدینگی VAL/EQL)"
                    else -> "سناریوی نوسانی (تراکم و جذب سفارش حول محور POC)"
                },
                nameEn = when (cluster.type) {
                    "BULL" -> "Bullish SMC Wave (FVG/POC Pullback → VAH/EQH Impulse)"
                    "BEAR" -> "Bearish SMC Wave (Upper FVG Mitigation → VAL/EQL Sweep)"
                    else -> "Value Area Equilibrium (Range Consolidation around POC)"
                },
                probability = normProbs[idx],
                candles = projectedCandles,
                pullbackPrice = pullbackPrice,
                primaryMagnetPrice = primaryTarget,
                targetPrice = finalClose,
                invalidationPrice = when (cluster.type) {
                    "BULL" -> lastCloseVal - 1.8 * currentAtr
                    "BEAR" -> lastCloseVal + 1.8 * currentAtr
                    else -> lastCloseVal - 1.5 * currentAtr
                },
                stepIndex = 0
            )
        }
    }

    private fun buildRealisticCandles(
        templateCandles: List<CandleBar>,
        templateAtr: Double,
        anchorCandle: CandleBar,
        currentAtr: Double,
        smc: FullSmcState,
        direction: String,
        futureTimestamps: LongArray,
        totalBars: Int = canonicalHorizon
    ): List<ForecastPoint> {
        val result = ArrayList<ForecastPoint>(totalBars)
        val scale = currentAtr / max(templateAtr, 0.0001)
        val anchorClose = anchorCandle.close.toDouble()
        val tfNorm = smc.timeframe.ifBlank { engineTimeframe }.uppercase(Locale.US)
        val stepMsFallback = UtcTimeAnchorAlgorithm.timeframeStepMillis(tfNorm)
        val avgVol = smc.avgVolume
        val avgBodyRatio = smc.avgBodyRatio
        val avgUpperWickRatio = smc.avgUpperWickRatio
        val avgLowerWickRatio = smc.avgLowerWickRatio

        val rawPullbackMagnet = findNearestPullbackLevel(anchorClose, currentAtr, smc, direction)
        val rawTargetMagnet = findPrimaryTargetLevel(anchorClose, currentAtr, smc, direction)
        val pullbackSteps = when (tfNorm) {
            "M15" -> 3
            "M30" -> 2
            else -> 1
        }

        val maxPullAtr = if (pullbackSteps == 1) 0.62 else 1.35
        val pullbackMagnet = rawPullbackMagnet.coerceIn(anchorClose - maxPullAtr * currentAtr, anchorClose + maxPullAtr * currentAtr)
        val targetMagnet = when (direction) {
            "BULL" -> rawTargetMagnet.coerceIn(anchorClose + 1.6 * currentAtr, anchorClose + 5.2 * currentAtr)
            "BEAR" -> rawTargetMagnet.coerceIn(anchorClose - 5.2 * currentAtr, anchorClose - 1.6 * currentAtr)
            else -> smc.context.poc
        }

        val poc = smc.context.poc
        val vah = smc.context.vah
        val valPrice = smc.context.valPrice
        val pocAnchor = poc.coerceIn(anchorClose - 1.5 * currentAtr, anchorClose + 1.5 * currentAtr)

        var prevClose = anchorClose
        var consecutiveSameDir = 0
        var lastDirSign = 0
        var waveMode = if (direction == "RANGE") "RANGE" else "PULLBACK"
        var legBars = 0
        var legStart = anchorClose
        var sweepCount = 0
        var corrLen = 4
        var corrTarget = anchorClose
        var consLen = 3
        var consMid = anchorClose

        val tplLen = max(1, templateCandles.size)
        val mainDir = when (direction) {
            "BULL" -> 1.0
            "BEAR" -> -1.0
            else -> 0.0
        }

        for (i in 0 until totalBars) {
            val tplIdx = if (i < tplLen) i else (i - tplLen) % tplLen
            val mirrorSign = if (i < tplLen) 1.0 else if ((i / tplLen) % 2 == 1) -0.65 else 0.75
            val tpl = templateCandles[tplIdx]
            val tplBody = (tpl.close.toDouble() - tpl.open.toDouble()) * scale * mirrorSign
            val tplUpperWick = (tpl.high.toDouble() - max(tpl.open.toDouble(), tpl.close.toDouble())) * scale
            val tplLowerWick = (min(tpl.open.toDouble(), tpl.close.toDouble()) - tpl.low.toDouble()) * scale

            val open = prevClose
            val maxEnvAtr = 1.10 * sqrt((i + 6).toDouble())
            val totalExcursionAtr = if (mainDir != 0.0) ((prevClose - anchorClose) * mainDir) / max(currentAtr, 1e-6) else 0.0
            val excursionDamp = (1.0 - max(0.0, totalExcursionAtr) / (maxEnvAtr * 1.04)).coerceIn(0.18, 1.0)

            if (waveMode == "PULLBACK" && i >= pullbackSteps) {
                waveMode = "IMPULSE"
                legBars = 0
                legStart = prevClose
            } else if (waveMode == "IMPULSE") {
                val legGainAtr = ((prevClose - legStart) * mainDir) / max(currentAtr, 1e-6)
                val legTarget = if (sweepCount == 0) {
                    targetMagnet
                } else {
                    anchorClose + mainDir * currentAtr * min(maxEnvAtr * 0.90, 3.0 + sweepCount * 1.55)
                }
                val hitTarget = (prevClose - legTarget) * mainDir >= -0.25 * currentAtr && legBars >= 4
                val overextended = legGainAtr >= 2.15 + 0.35 * (sweepCount % 2) ||
                    legBars >= 8 ||
                    totalExcursionAtr >= maxEnvAtr * 0.80

                if (hitTarget || overextended) {
                    waveMode = "CORRECTION"
                    corrLen = 4 + ((i + sweepCount) % 3)
                    val retraceFrac = 0.42 + 0.10 * (sweepCount % 2)
                    corrTarget = prevClose - (prevClose - legStart) * retraceFrac
                    legBars = 0
                    sweepCount += 1
                }
            } else if (waveMode == "CORRECTION") {
                val reachedCorr = (prevClose - corrTarget) * (-mainDir) >= -0.15 * currentAtr && legBars >= 2
                if (legBars >= corrLen || reachedCorr) {
                    if (i >= 14 && sweepCount % 2 == 1) {
                        waveMode = "CONSOLIDATION"
                        consLen = 3 + (sweepCount % 2)
                        consMid = prevClose
                        legBars = 0
                    } else {
                        waveMode = "IMPULSE"
                        legStart = prevClose
                        legBars = 0
                    }
                }
            } else if (waveMode == "CONSOLIDATION") {
                if (legBars >= consLen) {
                    if (i < 48 && totalExcursionAtr < maxEnvAtr * 0.78) {
                        waveMode = "IMPULSE"
                        legStart = prevClose
                        legBars = 0
                    } else {
                        consMid = prevClose
                        legBars = 0
                    }
                }
            }

            val rawBodyDelta: Double
            val candleCategory: String

            when {
                direction == "RANGE" || waveMode == "RANGE" -> {
                    val pullToPoc = (pocAnchor - prevClose) * 0.24
                    val cycle = sin((i + 1) * 0.92 + 0.4) * currentAtr * 0.44
                    val blended = pullToPoc + cycle * 0.72 + tplBody * 0.28
                    var dirSign = if (blended >= 0.0) 1 else -1
                    if (consecutiveSameDir >= 3 && dirSign == lastDirSign) {
                        dirSign = -lastDirSign
                    }
                    val exc = (prevClose - pocAnchor) / max(currentAtr, 1e-6)
                    if (abs(exc) > 1.55) {
                        dirSign = if (exc > 0.0) -1 else 1
                    }
                    val mag = (abs(blended) + currentAtr * 0.14).coerceIn(currentAtr * 0.20, currentAtr * 0.68)
                    rawBodyDelta = dirSign * mag
                    candleCategory = "CONSOLIDATION"
                }
                waveMode == "PULLBACK" -> {
                    val remPull = max(1, pullbackSteps - i)
                    val gapToPull = (pullbackMagnet - prevClose) / remPull.toDouble()
                    rawBodyDelta = if (pullbackSteps == 1) {
                        val biasAdj = if (smc.context.htfTrendBias * mainDir >= 0.1) 0.18 else -0.26
                        val d = mainDir * currentAtr * biasAdj + tplBody * 0.25
                        if (abs(d) < currentAtr * 0.20) {
                            mainDir * (if (biasAdj >= 0.0) 1.0 else -1.0) * currentAtr * 0.24
                        } else d
                    } else if (i == pullbackSteps - 1) {
                        mainDir * currentAtr * (0.24 + 0.12 * abs(cos(i.toDouble())))
                    } else {
                        val pullDir = if (pullbackMagnet <= prevClose) -1.0 else 1.0
                        val bodyMag = (abs(gapToPull) * 0.85 + abs(tplBody) * 0.25 + currentAtr * 0.12)
                            .coerceIn(currentAtr * 0.24, currentAtr * 0.58)
                        pullDir * bodyMag
                    }
                    candleCategory = "MITIGATION_PULLBACK"
                }
                waveMode == "IMPULSE" -> {
                    val legTarget = if (sweepCount == 0) {
                        targetMagnet
                    } else {
                        anchorClose + mainDir * currentAtr * min(maxEnvAtr * 0.90, 3.0 + sweepCount * 1.55)
                    }
                    val magnetPull = (legTarget - prevClose) * 0.14
                    val isMicroCounter = (consecutiveSameDir >= 3 && lastDirSign == mainDir.toInt()) ||
                        (legBars > 1 && tplBody * mainDir < -0.32 * currentAtr && consecutiveSameDir >= 2 && lastDirSign == mainDir.toInt())
                    if (isMicroCounter) {
                        val counterMag = currentAtr * (0.24 + 0.18 * abs(sin((i + 1) * 1.25)))
                        rawBodyDelta = -mainDir * counterMag
                        candleCategory = "CONSOLIDATION"
                    } else {
                        val tplAlign = max(-0.15 * currentAtr, tplBody * mainDir * 0.42)
                        val baseImp = currentAtr * (0.34 + 0.30 * avgBodyRatio + 0.22 * abs(cos(i * 0.85)))
                        val impulseMag = ((baseImp + tplAlign + max(0.0, magnetPull * mainDir)) * excursionDamp)
                            .coerceIn(currentAtr * 0.24, currentAtr * 1.15)
                        rawBodyDelta = mainDir * impulseMag
                        candleCategory = "IMPULSE"
                    }
                }
                waveMode == "CORRECTION" -> {
                    val remCorr = max(1, corrLen - legBars)
                    val pullStep = (corrTarget - prevClose) / remCorr.toDouble()
                    rawBodyDelta = if (consecutiveSameDir >= 3 && lastDirSign == (-mainDir).toInt()) {
                        mainDir * currentAtr * (0.20 + 0.14 * abs(cos(i * 1.1)))
                    } else {
                        val corrMag = (abs(pullStep) * 0.75 + abs(tplBody) * 0.25 + currentAtr * 0.14)
                            .coerceIn(currentAtr * 0.22, currentAtr * 0.72)
                        -mainDir * corrMag
                    }
                    candleCategory = "CONSOLIDATION"
                }
                else -> {
                    val pullToMid = (consMid - prevClose) * 0.32
                    val boxOsc = (if (legBars % 2 == 0) -mainDir else mainDir) * currentAtr *
                        (0.26 + 0.14 * abs(sin(i * 1.3)))
                    val combined = pullToMid + boxOsc * 0.78 + tplBody * 0.22
                    var sgn = if (combined >= 0.0) 1 else -1
                    if (consecutiveSameDir >= 3 && sgn == lastDirSign) sgn = -lastDirSign
                    rawBodyDelta = sgn * abs(combined).coerceIn(currentAtr * 0.20, currentAtr * 0.48)
                    candleCategory = "CONSOLIDATION"
                }
            }

            var close = max(anchorClose * 0.05, open + rawBodyDelta)
            if (abs(close - open) < currentAtr * 0.18) {
                close = open + (if (close >= open) 1.0 else -1.0) * currentAtr * 0.20
            }

            val nextExcAtr = if (mainDir != 0.0) ((close - anchorClose) * mainDir) / max(currentAtr, 1e-6) else 0.0
            if (mainDir != 0.0 && nextExcAtr > maxEnvAtr) {
                val cappedTarget = anchorClose + mainDir * maxEnvAtr * currentAtr
                close = max(anchorClose * 0.05, open - mainDir * currentAtr * 0.26)
                if (close > cappedTarget && mainDir > 0.0) close = min(open - currentAtr * 0.20, cappedTarget)
            }

            if (consecutiveSameDir >= 4 && (if (close >= open) 1 else -1) == lastDirSign) {
                close = max(
                    anchorClose * 0.05,
                    open - lastDirSign * currentAtr * (0.24 + 0.14 * abs(cos((i + 1) * 1.15)))
                )
            }

            val curSign = if (close >= open) 1 else -1
            if (curSign == lastDirSign) {
                consecutiveSameDir += 1
            } else {
                consecutiveSameDir = 1
                lastDirSign = curSign
            }

            val bodyAbs = abs(close - open)
            val baseUpperWick = max(
                max(tplUpperWick * 0.58, currentAtr * 0.14),
                bodyAbs * (avgUpperWickRatio / avgBodyRatio) * (0.85 + 0.28 * abs(cos((i + 1) * 0.85)))
            )
            val baseLowerWick = max(
                max(tplLowerWick * 0.58, currentAtr * 0.14),
                bodyAbs * (avgLowerWickRatio / avgBodyRatio) * (0.85 + 0.28 * abs(sin((i + 1) * 1.05)))
            )

            var high = max(open, close) + min(currentAtr * 0.78, baseUpperWick)
            var low = max(anchorClose * 0.02, min(open, close) - min(currentAtr * 0.78, baseLowerWick))

            var rejectionWick = false
            if (waveMode == "PULLBACK" && pullbackSteps == 1 && direction == "BULL") {
                val testLow = max(anchorClose * 0.02, min(low, pullbackMagnet - currentAtr * 0.12))
                if (testLow < low && open - testLow <= currentAtr * 0.78) {
                    low = testLow
                    rejectionWick = true
                }
            } else if (waveMode == "PULLBACK" && pullbackSteps == 1 && direction == "BEAR") {
                val testHigh = max(high, pullbackMagnet + currentAtr * 0.12)
                if (testHigh > high && testHigh - open <= currentAtr * 0.78) {
                    high = testHigh
                    rejectionWick = true
                }
            }

            if (abs(low - poc) < currentAtr * 0.30 ||
                abs(low - pullbackMagnet) < currentAtr * 0.30 ||
                abs(low - valPrice) < currentAtr * 0.30
            ) {
                low = max(anchorClose * 0.02, low - currentAtr * 0.26)
                rejectionWick = true
            }
            if (abs(high - vah) < currentAtr * 0.30 ||
                abs(high - targetMagnet) < currentAtr * 0.30
            ) {
                high += currentAtr * 0.26
                rejectionWick = true
            }

            val isImpulseCandle = candleCategory == "IMPULSE"
            val volMultiplier = if (isImpulseCandle) {
                1.22 + 0.48 * abs(sin((i + 1) * 0.9 + 0.7))
            } else {
                0.54 + 0.26 * abs(cos((i + 1) * 1.1 + 0.4))
            }
            val openTimeMs = futureTimestamps.getOrElse(i) {
                anchorCandle.openTimeUtcMillis + (i + 1) * stepMsFallback
            }
            val bandHalf = currentAtr * 0.85 * sqrt((i + 1).toDouble())
            val q = ForecastCalendarHelper.enforceMonotonicQuantiles(
                close - bandHalf,
                close - bandHalf * 0.52,
                close,
                close + bandHalf * 0.52,
                close + bandHalf,
                anchorClose * 0.02
            )

            result.add(
                ForecastPoint(
                    stepAhead = i + 1,
                    openTimeUtcMs = openTimeMs,
                    open = open,
                    high = high,
                    low = low,
                    close = close,
                    q10 = q[0],
                    q25 = q[1],
                    q50 = q[2],
                    q75 = q[3],
                    q90 = q[4],
                    pctChangeFromLast = ((close - anchorClose) / anchorClose) * 100.0,
                    volume = round(avgVol * volMultiplier),
                    rejectionWick = rejectionWick,
                    wavePhase = candleCategory,
                    pullbackPrice = pullbackMagnet,
                    primaryMagnetPrice = targetMagnet
                )
            )
            prevClose = close
            legBars += 1
        }

        return result
    }

    fun findNearestPullbackLevel(price: Double, atr: Double, smc: FullSmcState, dir: String): Double {
        val poc = smc.context.poc
        val ema20 = smc.context.ema20
        if (dir == "BULL") {
            val lowerFvg = smc.unmitigatedFVGs
                .filter { it.top < price && (price - it.midpoint) <= 3.5 * atr }
                .maxByOrNull { it.top }
            if (lowerFvg != null) return lowerFvg.midpoint
            if (poc < price && (price - poc) <= 2.5 * atr) return poc
            if (ema20 < price && (price - ema20) <= 2.5 * atr) return ema20
            return price - 0.65 * atr
        }
        if (dir == "BEAR") {
            val upperFvg = smc.unmitigatedFVGs
                .filter { it.bottom > price && (it.midpoint - price) <= 3.5 * atr }
                .minByOrNull { it.bottom }
            if (upperFvg != null) return upperFvg.midpoint
            if (poc > price && (poc - price) <= 2.5 * atr) return poc
            if (ema20 > price && (ema20 - price) <= 2.5 * atr) return ema20
            return price + 0.65 * atr
        }
        return poc
    }

    fun findPrimaryTargetLevel(price: Double, atr: Double, smc: FullSmcState, dir: String): Double {
        val poc = smc.context.poc
        val vah = smc.context.vah
        val valPrice = smc.context.valPrice
        if (dir == "BULL") {
            val nextEqh = smc.equalHighs.filter { it > price + 0.9 * atr && it <= price + 5.5 * atr }.minOrNull()
            if (nextEqh != null) return nextEqh
            return if (vah > price + 0.8 * atr) vah else price + 3.4 * atr
        }
        if (dir == "BEAR") {
            val nextEql = smc.equalLows.filter { it < price - 0.9 * atr && it >= price - 5.5 * atr }.maxOrNull()
            if (nextEql != null) return nextEql
            return if (valPrice < price - 0.8 * atr) valPrice else price - 3.4 * atr
        }
        return poc
    }

    fun evaluateAndUpdateLive(
        scenarios: List<SmcProjectedScenario>,
        newActualCandle: CandleBar,
        currentAtr: Double
    ): BayesianLiveUpdateReport {
        if (scenarios.isEmpty()) {
            return BayesianLiveUpdateReport(
                updatedScenarios = emptyList(),
                accuracyScoreLastStep = 0,
                dominantScenarioId = "SCENARIO_A",
                statusMessageFa = "در انتظار بسته شدن کندل جدید...",
                statusMessageEn = "Waiting for next closed candle..."
            )
        }

        val safeAtr = max(currentAtr, 0.0001)
        val lambda = 1.35
        var totalPosterior = 0.0
        var bestStepAccuracy = 0

        val actualClose = newActualCandle.close.toDouble()
        val actualOpen = newActualCandle.open.toDouble()
        val actualHigh = newActualCandle.high.toDouble()
        val actualLow = newActualCandle.low.toDouble()

        val unnormList = scenarios.map { sc ->
            val idx = sc.stepIndex.coerceIn(0, max(0, sc.candles.lastIndex))
            val predictedCandle = sc.candles.getOrNull(idx) ?: return@map sc
            val closeError = abs(actualClose - predictedCandle.close) / safeAtr
            val highError = abs(actualHigh - predictedCandle.high) / safeAtr
            val lowError = abs(actualLow - predictedCandle.low) / safeAtr

            val sameDirection = (actualClose >= actualOpen) == (predictedCandle.close >= predictedCandle.open)
            val directionPenalty = if (sameDirection) 0.0 else 0.45

            val combinedError = 0.6 * closeError + 0.2 * highError + 0.2 * lowError + directionPenalty
            val stepAccuracy = ((1.0 - combinedError / 2.5) * 100.0).roundToInt().coerceIn(0, 100)
            if (stepAccuracy > bestStepAccuracy) bestStepAccuracy = stepAccuracy

            val likelihood = exp(-lambda * combinedError)
            val unnormProb = sc.probability * likelihood
            totalPosterior += unnormProb

            val priceShift = actualClose - predictedCandle.close
            val decaySpan = max(canonicalHorizon, sc.candles.size).toDouble()
            val reAnchoredCandles = sc.candles.mapIndexed { cIdx, c ->
                if (cIdx <= idx) c
                else {
                    val decay = max(0.05, 1.0 - (cIdx - idx).toDouble() / decaySpan)
                    val shift = priceShift * decay
                    val op = if (cIdx == idx + 1) actualClose else c.open + shift
                    val cl = c.close + shift
                    val hi = max(max(op, cl), c.high + shift)
                    val lo = min(min(op, cl), c.low + shift)
                    c.copy(open = op, high = hi, low = lo, close = cl, q50 = cl)
                }
            }

            sc.copy(
                probability = unnormProb,
                candles = reAnchoredCandles,
                stepIndex = idx + 1
            )
        }

        val normalized = unnormList.map { sc ->
            val p = ((sc.probability / max(totalPosterior, 0.0001)) * 100.0).roundToInt() / 100.0
            sc.copy(probability = p)
        }.sortedByDescending { it.probability }

        val dom = normalized.first()
        val domPct = (dom.probability * 100.0).roundToInt()

        return BayesianLiveUpdateReport(
            updatedScenarios = normalized,
            accuracyScoreLastStep = bestStepAccuracy,
            dominantScenarioId = dom.id,
            statusMessageFa = "کندل ${dom.stepIndex} بررسی شد — دقت تطبیق: $bestStepAccuracy٪ | وزن سناریوی غالب (${dom.id}): $domPct٪ (Re-Anchored)",
            statusMessageEn = "Step ${dom.stepIndex} Verified — Match Accuracy: $bestStepAccuracy% | Dominant ${dom.id} Posterior: $domPct% (Re-Anchored)"
        )
    }
}

object ForecastEngine {

    fun project(
        candles: List<CandleBar>,
        symbolCode: String,
        timeframe: String,
        horizonBars: Int = 30,
        renderMode: ForecastRenderMode = ForecastRenderMode.HYBRID,
        registry: ForecastModelRegistry = ForecastModelRegistry(),
        workerUrl: String = "",
        skipWalkForward: Boolean = false,
        minBars: Int = 24,
        higherTimeframe: String = "",
        higherTimeframeCandles: List<CandleBar> = emptyList(),
        previousForecast: ForecastResult? = null,
        selectedScenarioId: String = "SCENARIO_A",
        lowerTimeframe: String = "",
        lowerTimeframeCandles: List<CandleBar> = emptyList(),
        disableLowerTfAnchor: Boolean = false
    ): ForecastResult {
        val cleanSymbol = symbolCode.trim().uppercase(Locale.US)
        val cleanTf = timeframe.trim().uppercase(Locale.US)
        val horizon = ForecastCalendarHelper.clampHorizonBars(horizonBars)
        val nowMs = System.currentTimeMillis()
        val workerStatus = if (workerUrl.trim().isEmpty()) {
            RemoteWorkerStatus.LOCAL_STATISTICAL_ONLY
        } else {
            RemoteWorkerStatus.UNCONFIGURED
        }

        val readiness = ForecastFeatureExtractor.validateReadiness(candles, minBars)
        if (!readiness.ready) {
            return ForecastResult(
                contractVersion = ForecastSha256.CONTRACT_VERSION,
                status = ForecastStatus.DATA_NOT_READY,
                symbolCode = cleanSymbol,
                timeframe = cleanTf,
                horizonBars = horizon,
                renderMode = renderMode,
                generatedAtUtcMs = nowMs,
                anchorOpenTimeUtcMs = 0L,
                anchorClose = 0.0,
                regime = MarketRegime.RANGING,
                remoteWorkerStatus = workerStatus,
                readiness = readiness,
                featuresSummary = null,
                points = emptyList(),
                scenarios = emptyList(),
                modelContributions = emptyList(),
                walkForward = WalkForwardReport(
                    0, 5, ForecastStatus.DATA_NOT_READY, false,
                    readiness.issues.firstOrNull() ?: "Insufficient candles",
                    null, null, emptyList(), 0.0
                ),
                summary = null,
                inputHash = ForecastSha256.sha256Hex("$cleanSymbol|$cleanTf|EMPTY")
            )
        }

        val features = ForecastFeatureExtractor.extract(candles, 180)
            ?: return project(
                emptyList(), cleanSymbol, cleanTf, horizon, renderMode, registry, workerUrl,
                skipWalkForward, minBars, higherTimeframe, higherTimeframeCandles, previousForecast,
                selectedScenarioId, lowerTimeframe, lowerTimeframeCandles, disableLowerTfAnchor
            )

        val enabled = registry.getEnabled().ifEmpty {
            listOf(Triple(NaivePersistenceModel(), 1.0, emptyMap()))
        }

        val wfReport = if (skipWalkForward) null else WalkForwardEvaluator.evaluate(
            candles = candles,
            registry = registry,
            minTrainBars = max(24, min(36, (candles.size * 0.55).toInt())),
            evalHorizon = 5,
            maxWindows = 10
        )

        val benchById = wfReport?.modelBenchmarks?.associateBy { it.modelId } ?: emptyMap()
        val rawWeights = enabled.map { (plugin, baseW, _) ->
            val b = benchById[plugin.id]
            val naiveMae = wfReport?.naiveMetrics?.mae ?: 0.0
            if (b != null && b.mae > 0.0 && naiveMae > 0.0) {
                val skill = (naiveMae / b.mae).coerceIn(0.55, 1.45)
                baseW * (0.7 + 0.3 * skill)
            } else {
                baseW
            }
        }
        val wSum = rawWeights.sum().let { if (it > 0.0) it else 1.0 }

        val predictions = ArrayList<Triple<ForecastModelPlugin, Double, PluginPrediction>>(enabled.size)
        val contributions = ArrayList<ModelContribution>(enabled.size)
        val ensMeanReturns = DoubleArray(horizon)
        val aleatoricVarSteps = DoubleArray(horizon)
        val epistemicDispSteps = DoubleArray(horizon)

        for (i in enabled.indices) {
            val (plugin, _, params) = enabled[i]
            val normW = rawWeights[i] / wSum
            val pred = plugin.predict(features, horizon, params)
            predictions.add(Triple(plugin, normW, pred))

            var cumMean = 0.0
            for (h in 0 until horizon) {
                val mr = pred.meanReturns[h]
                val sg = max(1e-5, pred.sigmas[h])
                cumMean += mr
                ensMeanReturns[h] += normW * mr
                aleatoricVarSteps[h] += normW * (sg * sg)
            }
            val terminalPrice = features.lastClose * exp(cumMean)
            contributions.add(
                ModelContribution(
                    modelId = plugin.id,
                    modelName = plugin.name,
                    family = plugin.family,
                    weight = (round(normW * 10_000.0) / 10_000.0),
                    terminalPrice = terminalPrice,
                    terminalPctChange = ((terminalPrice - features.lastClose) / features.lastClose) * 100.0
                )
            )
        }

        // Epistemic inter-model dispersion variance + Aleatoric decomposition + OOD detector
        var totalAleatoricCumVar = 0.0
        var totalEpistemicDispVar = 0.0
        for (h in 0 until horizon) {
            var dispVar = 0.0
            for ((_, normW, pred) in predictions) {
                val diff = pred.meanReturns[h] - ensMeanReturns[h]
                dispVar += normW * diff * diff
            }
            epistemicDispSteps[h] = dispVar
            totalAleatoricCumVar += aleatoricVarSteps[h]
            totalEpistemicDispVar += dispVar
        }

        val uncertainty = ForecastV130Analyzer.computeOodAndUncertainty(
            features = features,
            aleatoricCumVar = totalAleatoricCumVar,
            epistemicDispVar = totalEpistemicDispVar,
            effectiveSampleSize = wfReport?.effectiveSampleSize
        )

        val canonicalTimestamps = ForecastCalendarHelper.advanceFutureTimestamps(
            features.lastOpenMs,
            cleanTf,
            CANONICAL_SMC_HORIZON,
            cleanSymbol
        )
        val timestamps = canonicalTimestamps.take(horizon).toLongArray()

        // Run SMC Historical Analog + K-Medoids 3-Scenario Engine at canonical horizon (60) for prefix invariance
        val cleanCandleBars = candles.takeLast(180)
        val smcEngine = SMCPredictionEngine(30, CANONICAL_SMC_HORIZON, cleanTf)
        val smcState = smcEngine.extractMultiTimeframeFeatures(cleanCandleBars, cleanTf)
        var canonicalScenarios = smcEngine.generateScenarios(cleanCandleBars, smcState, canonicalTimestamps)

        // Cross-Timeframe Lower-TF Sub-Bar Anchoring (e.g. M15 bars 1..12 anchor H1 bars 1..3)
        val lowerInfo = resolveLowerTimeframeInfo(cleanTf)
        if (!disableLowerTfAnchor && lowerInfo != null && lowerTimeframeCandles.size >= 24) {
            val ltfFeatures = ForecastFeatureExtractor.extract(lowerTimeframeCandles, 180)
            val ltfBars = lowerTimeframeCandles.takeLast(180)
            if (ltfFeatures != null && ltfBars.size >= 24) {
                val closeDiff = abs(ltfFeatures.lastClose - features.lastClose)
                val stepMs = UtcTimeAnchorAlgorithm.timeframeStepMillis(cleanTf)
                val timeDiff = abs(features.lastOpenMs - ltfFeatures.lastOpenMs)
                if (closeDiff <= max(features.atr14 * 0.45, features.lastClose * 0.006) && timeDiff <= stepMs * 2L) {
                    val ltfTimestamps = ForecastCalendarHelper.advanceFutureTimestamps(
                        ltfFeatures.lastOpenMs,
                        lowerInfo.timeframe,
                        CANONICAL_SMC_HORIZON,
                        cleanSymbol
                    )
                    val ltfEngine = SMCPredictionEngine(30, CANONICAL_SMC_HORIZON, lowerInfo.timeframe)
                    val ltfState = ltfEngine.extractMultiTimeframeFeatures(ltfBars, lowerInfo.timeframe)
                    val ltfScenarios = ltfEngine.generateScenarios(ltfBars, ltfState, ltfTimestamps)
                    val overlapBars = min(3, CANONICAL_SMC_HORIZON / lowerInfo.ratio)
                    if (overlapBars >= 1) {
                        canonicalScenarios = canonicalScenarios.map { htfSc ->
                            val matchingLtf = ltfScenarios.firstOrNull { it.clusterType == htfSc.clusterType }
                                ?: ltfScenarios.first()
                            if (matchingLtf.candles.size < overlapBars * lowerInfo.ratio) {
                                htfSc
                            } else {
                                val updatedCandles = htfSc.candles.toMutableList()
                                for (ob in 0 until overlapBars) {
                                    val subSlice = matchingLtf.candles.subList(
                                        ob * lowerInfo.ratio,
                                        (ob + 1) * lowerInfo.ratio
                                    )
                                    val subOpen = if (ob == 0) features.lastClose else updatedCandles[ob - 1].close
                                    val shiftFromLtf = if (ob == 0) features.lastClose - subSlice.first().open else 0.0
                                    var hi = subOpen
                                    var lo = subOpen
                                    var volSum = 0.0
                                    var anyRej = false
                                    for (sc in subSlice) {
                                        hi = max(hi, sc.high + shiftFromLtf)
                                        lo = min(lo, sc.low + shiftFromLtf)
                                        volSum += sc.volume
                                        if (sc.rejectionWick) anyRej = true
                                    }
                                    val subClose = subSlice.last().close + shiftFromLtf
                                    val adjHigh = max(max(subOpen, subClose), hi)
                                    val adjLow = max(features.lastClose * 0.02, min(min(subOpen, subClose), lo))
                                    updatedCandles[ob] = updatedCandles[ob].copy(
                                        open = subOpen,
                                        high = adjHigh,
                                        low = adjLow,
                                        close = subClose,
                                        q50 = subClose,
                                        volume = round(volSum),
                                        rejectionWick = anyRej,
                                        wavePhase = subSlice.last().wavePhase
                                    )
                                }
                                val origAnchorClose = htfSc.candles[overlapBars - 1].close
                                val newAnchorClose = updatedCandles[overlapBars - 1].close
                                val rebaseDelta = newAnchorClose - origAnchorClose
                                for (k in overlapBars until updatedCandles.size) {
                                    val decay = max(0.15, 1.0 - (k - (overlapBars - 1)).toDouble() / 24.0)
                                    val sh = rebaseDelta * decay
                                    val origC = htfSc.candles[k]
                                    val op = if (k == overlapBars) newAnchorClose else origC.open + sh
                                    val cl = origC.close + sh
                                    val hi = max(max(op, cl), origC.high + sh)
                                    val lo = max(features.lastClose * 0.02, min(min(op, cl), origC.low + sh))
                                    updatedCandles[k] = origC.copy(
                                        open = op,
                                        high = hi,
                                        low = lo,
                                        close = cl,
                                        q50 = cl
                                    )
                                }
                                htfSc.copy(
                                    candles = updatedCandles,
                                    targetPrice = updatedCandles.last().close
                                )
                            }
                        }
                    }
                }
            }
        }

        val smcScenarios = canonicalScenarios.map { sc ->
            val sliced = sc.candles.take(horizon)
            sc.copy(
                candles = sliced,
                targetPrice = sliced.last().close
            )
        }

        val bayesianLiveReport = if (cleanCandleBars.size >= 16) {
            val priorSlice = cleanCandleBars.dropLast(1)
            val priorState = smcEngine.extractMultiTimeframeFeatures(priorSlice, cleanTf)
            val priorScenarios = smcEngine
                .generateScenarios(priorSlice, priorState, canonicalTimestamps)
                .map { it.copy(candles = it.candles.take(horizon)) }
            smcEngine.evaluateAndUpdateLive(priorScenarios, cleanCandleBars.last(), features.atr14)
        } else null

        val activeScenario = smcScenarios.firstOrNull { it.id == selectedScenarioId } ?: smcScenarios.first()
        val activeScenarioId = activeScenario.id

        val points = ArrayList<ForecastPoint>(horizon)
        var cumVar = 0.0
        val epiFactorPerStep =
            (1.0 / max(6.0, wfReport?.effectiveSampleSize ?: max(6.0, features.barCount / 4.0))) +
                when (uncertainty.oodStatus) {
                    OodStatus.EXTREME -> 0.48
                    OodStatus.ELEVATED -> 0.20
                    else -> 0.0
                }

        for (h in 0 until horizon) {
            cumVar += aleatoricVarSteps[h] * (1.0 + 0.35 * epiFactorPerStep) + epistemicDispSteps[h]
            val cumSigma = sqrt(cumVar) * (1.0 + 0.008 * h) * uncertainty.spreadMultiplierApplied

            val scCandle = activeScenario.candles[h]
            val allScenarioCloses = smcScenarios.map { it.candles.getOrNull(h)?.close ?: scCandle.close }.sorted()
            val minScPrice = allScenarioCloses.first()
            val maxScPrice = allScenarioCloses.last()

            val medPrice = scCandle.close
            val sigmaPriceHalf = max(
                features.atr14 * 0.55 * sqrt((h + 1) * 0.35),
                medPrice * cumSigma * 0.65
            )

            val q = ForecastCalendarHelper.enforceMonotonicQuantiles(
                min(minScPrice - features.atr14 * 0.45, medPrice - 1.28155 * sigmaPriceHalf),
                min(medPrice - features.atr14 * 0.22, medPrice - 0.67449 * sigmaPriceHalf),
                medPrice,
                max(medPrice + features.atr14 * 0.22, medPrice + 0.67449 * sigmaPriceHalf),
                max(maxScPrice + features.atr14 * 0.45, medPrice + 1.28155 * sigmaPriceHalf),
                features.lastClose * 0.02
            )

            val openP = scCandle.open
            val closeP = scCandle.close
            val highP = max(max(openP, closeP), scCandle.high)
            val lowP = max(features.lastClose * 0.02, min(min(openP, closeP), scCandle.low))

            points.add(
                ForecastPoint(
                    stepAhead = h + 1,
                    openTimeUtcMs = timestamps[h],
                    open = openP,
                    high = highP,
                    low = lowP,
                    close = closeP,
                    q10 = q[0],
                    q25 = q[1],
                    q50 = q[2],
                    q75 = q[3],
                    q90 = q[4],
                    pctChangeFromLast = ((q[2] - features.lastClose) / features.lastClose) * 100.0,
                    volume = scCandle.volume,
                    rejectionWick = scCandle.rejectionWick,
                    wavePhase = scCandle.wavePhase,
                    pullbackPrice = activeScenario.pullbackPrice,
                    primaryMagnetPrice = activeScenario.primaryMagnetPrice
                )
            )
        }

        val lastPt = points.last()
        val (scenarios, keyZones, eventDictionary) = ForecastV130Analyzer.detectKeyZonesAndEventTree(features, points, horizon)
        val mtfCoordination = ForecastV130Analyzer.coordinateMultiTimeframe(
            independentPoints = points,
            independentScenarios = scenarios,
            anchorClose = features.lastClose,
            timeframe = cleanTf,
            higherTimeframe = higherTimeframe,
            higherCandles = higherTimeframeCandles
        )
        val noEdgeGate = ForecastV130Analyzer.evaluateNoEdgeGate(wfReport, uncertainty)

        val status = wfReport?.forecastStatus ?: ForecastStatus.PROVISIONAL
        val inputHash = ForecastSha256.sha256Hex(
            ForecastSha256.canonicalJson(
                mapOf(
                    "symbolCode" to cleanSymbol,
                    "timeframe" to cleanTf,
                    "horizonBars" to horizon,
                    "lastOpenMs" to features.lastOpenMs,
                    "lastClose" to features.lastClose,
                    "registry" to registry.serializeToJson()
                )
            )
        )

        val summary = ForecastSummary(
            terminalStep = lastPt.stepAhead,
            terminalQ10 = lastPt.q10,
            terminalQ25 = lastPt.q25,
            terminalQ50 = lastPt.q50,
            terminalQ75 = lastPt.q75,
            terminalQ90 = lastPt.q90,
            medianPctChange = lastPt.pctChangeFromLast,
            corridorWidthPct = ((lastPt.q90 - lastPt.q10) / features.lastClose) * 100.0
        )
        val stability = ForecastV130Analyzer.computeForecastStability(summary, features.lastClose, previousForecast)

        return ForecastResult(
            contractVersion = ForecastSha256.CONTRACT_VERSION,
            specVersion = ForecastSha256.SPEC_VERSION,
            status = status,
            symbolCode = cleanSymbol,
            timeframe = cleanTf,
            horizonBars = horizon,
            renderMode = renderMode,
            generatedAtUtcMs = nowMs,
            anchorOpenTimeUtcMs = features.lastOpenMs,
            anchorClose = features.lastClose,
            regime = features.regime,
            remoteWorkerStatus = workerStatus,
            readiness = readiness,
            featuresSummary = ForecastFeaturesSummary(
                atr14 = features.atr14,
                atrPct = features.atrPct * 100.0,
                ewmaSigmaPct = features.ewmaSigma * 100.0,
                rsi14 = features.rsi14,
                realizedVolRatio = features.realizedVolRatio,
                driftZ = features.driftZ
            ),
            points = points,
            scenarios = scenarios,
            modelContributions = contributions,
            walkForward = wfReport,
            summary = summary,
            inputHash = inputHash,
            uncertainty = uncertainty,
            noEdgeGate = noEdgeGate,
            keyZones = keyZones,
            eventDictionary = eventDictionary,
            mtfCoordination = mtfCoordination,
            stability = stability,
            smcContext = smcState.context,
            smcScenarios = smcScenarios,
            activeScenarioId = activeScenarioId,
            bayesianLiveReport = bayesianLiveReport
        )
    }
}
