package es.manico.chartintelligence.forecast

import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
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
class SMCPredictionEngine(
    private val windowSize: Int = 30,
    private val horizon: Int = 20
) {
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
        val avgLowerWickRatio: Double
    )

    data class AnalogItem(
        val futureWindow: List<CandleBar>,
        val pastAtr: Double,
        val distance: Double
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

        val lastBos = smc.structures.lastOrNull()
        val score15m = (if (lastClose >= ema20) 0.5 else -0.5) +
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
            if (tfCandles.size < 6) return score15m
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

        val score1h = computeTfScore(aggregateCandles(recentSlice, 4))
        val score4h = computeTfScore(aggregateCandles(recentSlice, 16))
        val htfTrendBias = ((0.40 * score15m + 0.35 * score1h + 0.25 * score4h) * 1000.0).roundToInt() / 1000.0

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
            avgLowerWickRatio = (lowerWickSum / ratioCount).coerceIn(0.15, 0.46)
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
        val currentWindow = allHistory.takeLast(effWindow)
        val currentVec = extractNormalizedShape(currentWindow, currentAtr)
        val analogs = ArrayList<AnalogItem>()

        val maxSearchIdx = allHistory.size - effWindow - horizon - 2
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

            val futureWindow = allHistory.subList(i + effWindow, i + effWindow + horizon)
            if (futureWindow.size == horizon) {
                analogs.add(AnalogItem(futureWindow = futureWindow, pastAtr = pastAtr, distance = dist))
            }
            i += step
        }

        if (analogs.size < 9) {
            val lastCandle = allHistory.last()
            val baseP = lastCandle.close.toDouble()
            val baseVol = max(50.0, lastCandle.volume.toDouble())
            val syntheticProfiles = listOf(
                Triple(1, -0.45, 0.45),
                Triple(1, -0.30, 0.55),
                Triple(-1, 0.45, 0.52),
                Triple(-1, 0.30, 0.62),
                Triple(0, -0.25, 0.58),
                Triple(0, 0.25, 0.64)
            )
            syntheticProfiles.forEachIndexed { sIdx, (dir, pull, baseDist) ->
                val fw = ArrayList<CandleBar>(horizon)
                var p = baseP
                for (h in 0 until horizon) {
                    val isPull = h < 3
                    val waveMod = if ((h - 3) % 4 == 2) -0.42 else 0.78
                    val stepDelta = when {
                        isPull -> pull * currentAtr * 0.45
                        dir != 0 -> dir * currentAtr * waveMod * 0.55
                        else -> sin((h + sIdx) * 1.1) * currentAtr * 0.42
                    }
                    val op = p
                    val cl = op + stepDelta
                    val hi = max(op, cl) + currentAtr * (0.24 + 0.15 * abs(cos((h + sIdx).toDouble())))
                    val lo = min(op, cl) - currentAtr * (0.24 + 0.15 * abs(sin((h + sIdx).toDouble())))
                    val vol = (baseVol * (if (waveMod > 0) 1.35 else 0.68)).roundToInt()
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
                analogs.add(AnalogItem(futureWindow = fw, pastAtr = currentAtr, distance = baseDist + sIdx * 0.05))
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
            val startP = item.futureWindow.first().open.toDouble()
            val endP = item.futureWindow.last().close.toDouble()
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

        return rawCounts.mapIndexed { idx, cluster ->
            val representative = if (cluster.group.isNotEmpty()) {
                cluster.group[cluster.group.size / 2]
            } else {
                analogs[min(idx, analogs.lastIndex)]
            }

            val pullbackPrice = findNearestPullbackLevel(lastCloseVal, currentAtr, smcState, cluster.type)
            val primaryTarget = findPrimaryTargetLevel(lastCloseVal, currentAtr, smcState, cluster.type)
            val projectedCandles = buildRealisticCandles(
                templateCandles = representative.futureWindow,
                templateAtr = representative.pastAtr,
                anchorCandle = lastCandle,
                currentAtr = currentAtr,
                smc = smcState,
                direction = cluster.type,
                futureTimestamps = futureTimestamps
            )
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
        futureTimestamps: LongArray
    ): List<ForecastPoint> {
        val result = ArrayList<ForecastPoint>(templateCandles.size)
        val scale = currentAtr / max(templateAtr, 0.0001)
        val anchorClose = anchorCandle.close.toDouble()
        val avgVol = smc.avgVolume
        val avgBodyRatio = smc.avgBodyRatio
        val avgUpperWickRatio = smc.avgUpperWickRatio
        val avgLowerWickRatio = smc.avgLowerWickRatio

        val pullbackMagnet = findNearestPullbackLevel(anchorClose, currentAtr, smc, direction)
        val targetMagnet = findPrimaryTargetLevel(anchorClose, currentAtr, smc, direction)
        val pullbackSteps = min(4, max(3, (templateCandles.size * 0.2).roundToInt()))

        var prevClose = anchorClose
        var consecutiveSameDir = 0
        var lastDirSign = 0

        for (i in templateCandles.indices) {
            val tpl = templateCandles[i]
            val tplBody = (tpl.close.toDouble() - tpl.open.toDouble()) * scale
            val tplUpperWick = (tpl.high.toDouble() - max(tpl.open.toDouble(), tpl.close.toDouble())) * scale
            val tplLowerWick = (min(tpl.open.toDouble(), tpl.close.toDouble()) - tpl.low.toDouble()) * scale

            val isPullbackPhase = i < pullbackSteps && direction != "RANGE"
            val activeMagnet = if (isPullbackPhase) pullbackMagnet else targetMagnet
            val magnetWeight = when {
                isPullbackPhase -> 0.28
                direction == "RANGE" -> 0.22
                else -> 0.16
            }
            val magnetPull = (activeMagnet - prevClose) * magnetWeight

            val open = prevClose
            val wavePhaseIdx = (i - pullbackSteps) % 4
            val isFractalPullbackBar = !isPullbackPhase && direction != "RANGE" && wavePhaseIdx == 2

            var rawBodyDelta = tplBody * 0.58 + magnetPull

            if (isPullbackPhase) {
                val pullDir = if (pullbackMagnet <= prevClose) -1.0 else 1.0
                val bodyMag = (abs(rawBodyDelta) + currentAtr * 0.16).coerceIn(currentAtr * 0.28, currentAtr * 0.85)
                rawBodyDelta = pullDir * bodyMag
            } else if (isFractalPullbackBar || consecutiveSameDir >= 3) {
                val counterDir = when (direction) {
                    "BULL" -> -1.0
                    "BEAR" -> 1.0
                    else -> if (lastDirSign != 0) -lastDirSign.toDouble() else -1.0
                }
                val retraceMag = currentAtr * (0.32 + 0.20 * abs(sin((i + 1) * 1.3)))
                rawBodyDelta = counterDir * retraceMag
            } else if (direction == "BULL" || direction == "BEAR") {
                val mainDir = if (direction == "BULL") 1.0 else -1.0
                val impulseMag = (abs(rawBodyDelta) + currentAtr * (0.34 + 0.25 * abs(cos(i * 0.9))))
                    .coerceIn(currentAtr * 0.52 * avgBodyRatio, currentAtr * 1.35)
                rawBodyDelta = mainDir * impulseMag
            } else {
                val rangeWave = sin((i + 1) * 1.15) * currentAtr * 0.42 + magnetPull
                val mag = abs(rangeWave).coerceIn(currentAtr * 0.22, currentAtr * 0.78)
                rawBodyDelta = (if (rangeWave >= 0.0) 1.0 else -1.0) * mag
            }

            var close = max(anchorClose * 0.05, open + rawBodyDelta)
            if (abs(close - open) < currentAtr * 0.18) {
                close = open + (if (close >= open) 1.0 else -1.0) * currentAtr * 0.22
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
                max(tplUpperWick * 0.65, currentAtr * 0.16),
                bodyAbs * (avgUpperWickRatio / avgBodyRatio) * (0.85 + 0.3 * abs(cos((i + 1) * 0.85)))
            )
            val baseLowerWick = max(
                max(tplLowerWick * 0.65, currentAtr * 0.16),
                bodyAbs * (avgLowerWickRatio / avgBodyRatio) * (0.85 + 0.3 * abs(sin((i + 1) * 1.05)))
            )

            var high = max(open, close) + min(currentAtr * 0.85, baseUpperWick)
            var low = max(anchorClose * 0.02, min(open, close) - min(currentAtr * 0.85, baseLowerWick))

            var rejectionWick = false
            val poc = smc.context.poc
            val vah = smc.context.vah
            val valPrice = smc.context.valPrice

            if (abs(low - poc) < currentAtr * 0.35 ||
                abs(low - pullbackMagnet) < currentAtr * 0.35 ||
                abs(low - valPrice) < currentAtr * 0.35
            ) {
                low = max(anchorClose * 0.02, low - currentAtr * 0.35)
                rejectionWick = true
            }
            if (abs(high - vah) < currentAtr * 0.35 ||
                abs(high - targetMagnet) < currentAtr * 0.35
            ) {
                high += currentAtr * 0.35
                rejectionWick = true
            }

            val isImpulseCandle = !isPullbackPhase && !isFractalPullbackBar && direction != "RANGE"
            val volMultiplier = if (isImpulseCandle) {
                1.24 + 0.52 * abs(sin((i + 1) * 0.9 + 0.7))
            } else {
                0.52 + 0.26 * abs(cos((i + 1) * 1.1 + 0.4))
            }
            val openTimeMs = futureTimestamps.getOrElse(i) {
                anchorCandle.openTimeUtcMillis + (i + 1) * 900_000L
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
                    wavePhase = when {
                        isPullbackPhase -> "MITIGATION_PULLBACK"
                        isImpulseCandle -> "IMPULSE"
                        else -> "CONSOLIDATION"
                    },
                    pullbackPrice = pullbackMagnet,
                    primaryMagnetPrice = targetMagnet
                )
            )
            prevClose = close
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
            return price - 0.78 * atr
        }
        if (dir == "BEAR") {
            val upperFvg = smc.unmitigatedFVGs
                .filter { it.bottom > price && (it.midpoint - price) <= 3.5 * atr }
                .minByOrNull { it.bottom }
            if (upperFvg != null) return upperFvg.midpoint
            if (poc > price && (poc - price) <= 2.5 * atr) return poc
            if (ema20 > price && (ema20 - price) <= 2.5 * atr) return ema20
            return price + 0.78 * atr
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
            val reAnchoredCandles = sc.candles.mapIndexed { cIdx, c ->
                if (cIdx <= idx) c
                else {
                    val decay = 1.0 - (cIdx - idx).toDouble() / max(1, sc.candles.size).toDouble()
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
        selectedScenarioId: String = "SCENARIO_A"
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
                skipWalkForward, minBars, higherTimeframe, higherTimeframeCandles, previousForecast, selectedScenarioId
            )

        val enabled = registry.getEnabled().ifEmpty {
            listOf(Triple(NaivePersistenceModel(), 1.0, emptyMap()))
        }

        val wfReport = if (skipWalkForward) null else WalkForwardEvaluator.evaluate(
            candles = candles,
            registry = registry,
            minTrainBars = max(24, min(36, (candles.size * 0.55).toInt())),
            evalHorizon = min(8, max(3, horizon / 5)),
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

        val timestamps = ForecastCalendarHelper.advanceFutureTimestamps(features.lastOpenMs, cleanTf, horizon, cleanSymbol)

        // Run SMC Historical Analog + K-Medoids 3-Scenario Engine
        val cleanCandleBars = candles.takeLast(180)
        val smcEngine = SMCPredictionEngine(30, horizon)
        val smcState = smcEngine.extractMultiTimeframeFeatures(cleanCandleBars, cleanTf)
        val smcScenarios = smcEngine.generateScenarios(cleanCandleBars, smcState, timestamps)

        val bayesianLiveReport = if (cleanCandleBars.size >= 16) {
            val priorSlice = cleanCandleBars.dropLast(1)
            val priorState = smcEngine.extractMultiTimeframeFeatures(priorSlice, cleanTf)
            val priorScenarios = smcEngine.generateScenarios(priorSlice, priorState, timestamps)
            smcEngine.evaluateAndUpdateLive(priorScenarios, cleanCandleBars.last(), features.atr14)
        } else null

        val activeScenario = smcScenarios.firstOrNull { it.id == selectedScenarioId } ?: smcScenarios.first()
        val activeScenarioId = activeScenario.id

        val points = ArrayList<ForecastPoint>(horizon)
        var cumVar = 0.0
        val epiPerStep = uncertainty.epistemicCumVar / max(1, horizon)

        for (h in 0 until horizon) {
            cumVar += aleatoricVarSteps[h] + epistemicDispSteps[h] + epiPerStep * 0.35
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
