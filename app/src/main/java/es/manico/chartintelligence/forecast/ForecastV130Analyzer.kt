package es.manico.chartintelligence.forecast

import es.manico.chartintelligence.data.model.CandleBar
import java.util.Locale
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round
import kotlin.math.sqrt

object ForecastV130Analyzer {

    private fun roundTo(v: Double, decimals: Int): Double {
        var factor = 1.0
        repeat(decimals) { factor *= 10.0 }
        return round(v * factor) / factor
    }

    private fun normalCdf(z: Double): Double {
        val t = 1.0 / (1.0 + 0.2316419 * abs(z))
        val d = 0.3989422804014327 * exp((-z * z) / 2.0)
        val p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
        return if (z >= 0.0) 1.0 - p else p
    }

    fun resolveHigherTimeframe(timeframe: String): String {
        return when (timeframe.trim().uppercase(Locale.US)) {
            "M15" -> "H1"
            "M30" -> "H4"
            "H1" -> "H4"
            "H4" -> "D1"
            "D1" -> "W1"
            else -> ""
        }
    }

    fun computeOodAndUncertainty(
        features: ExtractedForecastFeatures,
        aleatoricCumVar: Double,
        epistemicDispVar: Double,
        effectiveSampleSize: Double?
    ): UncertaintyBreakdown {
        val rets = features.logReturns
        val lastRet = if (rets.isNotEmpty()) rets.last() else 0.0
        val uncondSig = max(1e-6, features.uncondSigma)
        val tailZ = abs(lastRet - features.meanReturn) / uncondSig
        val volRatioDelta = abs(features.realizedVolRatio - 1.0) * 2.1
        val driftZAbs = abs(features.driftZ)
        val atrShock = max(0.0, (features.atrPct / uncondSig) - 1.5)

        val oodDistance = sqrt(
            (tailZ * tailZ + volRatioDelta * volRatioDelta + driftZAbs * driftZAbs * 0.55 + atrShock * atrShock) / 2.55
        )

        val oodReasons = ArrayList<String>()
        if (tailZ >= 2.6) oodReasons.add("Tail return shock z=${String.format(Locale.US, "%.2f", tailZ)}")
        if (features.realizedVolRatio >= 1.45) {
            oodReasons.add("Short/long volatility spike (${String.format(Locale.US, "%.2f", features.realizedVolRatio)}x)")
        }
        if (driftZAbs >= 2.5) oodReasons.add("Extreme drift z=${String.format(Locale.US, "%.2f", driftZAbs)}")

        var oodStatus = OodStatus.IN_DISTRIBUTION
        var spreadMultiplier = 1.0
        var oodEpistemicFactor = 0.0
        if (oodDistance >= 3.6) {
            oodStatus = OodStatus.EXTREME
            spreadMultiplier = 1.42
            oodEpistemicFactor = 0.48
        } else if (oodDistance >= 2.2) {
            oodStatus = OodStatus.ELEVATED
            spreadMultiplier = 1.18
            oodEpistemicFactor = 0.20
        }

        val nEffSafe = max(6.0, effectiveSampleSize ?: max(6.0, features.barCount / 4.0))
        val finiteSampleVar = aleatoricCumVar * (1.0 / nEffSafe)
        val oodVar = aleatoricCumVar * oodEpistemicFactor
        val epistemicVar = max(1e-10, epistemicDispVar + finiteSampleVar + oodVar)
        val aleatoricVar = max(1e-10, aleatoricCumVar)
        val totalVar = aleatoricVar + epistemicVar

        return UncertaintyBreakdown(
            aleatoricPct = roundTo(sqrt(aleatoricVar) * 100.0, 4),
            epistemicPct = roundTo(sqrt(epistemicVar) * 100.0, 4),
            totalPct = roundTo(sqrt(totalVar) * 100.0, 4),
            aleatoricShare = roundTo(aleatoricVar / totalVar, 4),
            epistemicShare = roundTo(epistemicVar / totalVar, 4),
            oodStatus = oodStatus,
            oodDistance = roundTo(oodDistance, 4),
            oodReasons = oodReasons,
            spreadMultiplierApplied = spreadMultiplier,
            epistemicCumVar = epistemicVar
        )
    }

    private fun buildCausalScenarioFeatureVec(candles: List<CleanOhlcBar>, idx: Int, atrFallback: Double): DoubleArray {
        val start = max(0, idx - 29)
        val win = candles.subList(start, idx + 1)
        if (win.size < 6) return doubleArrayOf(1.0, 0.0, 1.0, 0.0)
        var trSum = 0.0
        var sqShort = 0.0
        var sqLong = 0.0
        var nShort = 0
        var nLong = 0
        var gains = 0.0
        var losses = 0.0
        for (i in 1 until win.size) {
            val prevC = max(1e-8, win[i - 1].close)
            val cur = win[i]
            val cl = max(1e-8, cur.close)
            trSum += max(cur.high - cur.low, max(abs(cur.high - prevC), abs(cur.low - prevC)))
            val ret = ln(cl / prevC)
            sqLong += ret * ret
            nLong++
            if (i >= win.size - 6) {
                sqShort += ret * ret
                nShort++
            }
            val diff = cl - prevC
            if (diff >= 0.0) gains += diff else losses -= diff
        }
        val atrLocal = max(1e-6, max(trSum / max(1, win.size - 1).toDouble(), atrFallback * 0.25))
        val trendZ = ForecastStatisticalTests.clamp(
            (win.last().close - win[max(0, win.size - 11)].close) / (atrLocal * sqrt(10.0)),
            -3.0,
            3.0
        )
        val sigShort = sqrt(sqShort / max(1, nShort).toDouble())
        val sigLong = max(1e-6, sqrt(sqLong / max(1, nLong).toDouble()))
        val volRatio = ForecastStatisticalTests.clamp(sigShort / sigLong - 1.0, -1.5, 2.5)
        val rsiNorm = ForecastStatisticalTests.clamp(((gains / max(1e-8, gains + losses)) - 0.5) * 2.0, -1.0, 1.0)
        return doubleArrayOf(1.0, trendZ, volRatio, rsiNorm)
    }

    fun buildCalibratedScenariosV2(
        candles: List<CleanOhlcBar>,
        features: ExtractedForecastFeatures,
        horizonBars: Int,
        points: List<ForecastPoint>,
        split: DisjointNestedSplits? = null
    ): Pair<List<ForecastScenario>, ScenarioCalibrationReport> {
        val atr = max(1e-6, features.atr14)
        val lastClose = features.lastClose
        val lastPt = points.lastOrNull()
        val pQ10 = lastPt?.q10 ?: (lastClose - atr * 1.5)
        val pQ25 = lastPt?.q25 ?: (lastClose - atr * 0.8)
        val pQ50 = lastPt?.q50 ?: lastClose
        val pQ75 = lastPt?.q75 ?: (lastClose + atr * 0.8)
        val pQ90 = lastPt?.q90 ?: (lastClose + atr * 1.5)

        val trainSamples = ArrayList<ForecastStatisticalTests.ScenarioLogitSample>()
        val calSamples = ArrayList<ForecastStatisticalTests.ScenarioLogitSample>()
        val outerSamples = ArrayList<ForecastStatisticalTests.ScenarioLogitSample>()

        fun classifyOrigin(originIdx: Int): ForecastStatisticalTests.ScenarioLogitSample {
            val oClose = candles[originIdx].close
            val fClose = candles[originIdx + horizonBars].close
            var trS = 0.0
            val pStart = max(1, originIdx - 13)
            for (j in pStart..originIdx) {
                val pc = candles[j - 1].close
                val cur = candles[j]
                trS += max(cur.high - cur.low, max(abs(cur.high - pc), abs(cur.low - pc)))
            }
            val atrO = max(1e-6, trS / max(1, originIdx - pStart + 1).toDouble())
            val normMove = (fClose - oClose) / atrO
            val label = when {
                normMove > 1.0 -> 0
                normMove < -1.0 -> 2
                else -> 1
            }
            return ForecastStatisticalTests.ScenarioLogitSample(buildCausalScenarioFeatureVec(candles, originIdx, atrO), label)
        }

        if (split != null && split.feasible && split.trainEndIdx >= 30) {
            val trainOriginEnd = max(20, split.trainEndIdx - horizonBars)
            val step = max(1, (trainOriginEnd - 20) / 45)
            var o = 20
            while (o <= trainOriginEnd) {
                trainSamples.add(classifyOrigin(o))
                o += step
            }
            for (co in split.calOrigins) {
                if (co + horizonBars < candles.size) calSamples.add(classifyOrigin(co))
            }
            for (oo in split.outerOrigins) {
                if (oo + horizonBars < candles.size) outerSamples.add(classifyOrigin(oo))
            }
        } else if (candles.size >= 24 + horizonBars) {
            val maxO = candles.size - 1 - horizonBars
            val splitBoundary = max(18, floor((maxO - 14) * 0.7).toInt() + 14)
            val step = max(1, (maxO - 14) / 36)
            var o = 14
            while (o <= maxO) {
                val s = classifyOrigin(o)
                if (o <= splitBoundary) trainSamples.add(s) else calSamples.add(s)
                o += step
            }
        }

        val currentX = buildCausalScenarioFeatureVec(candles, candles.size - 1, atr)
        val logitFit = ForecastStatisticalTests.fitAndEvaluateScenarioLogit(trainSamples, calSamples, outerSamples, currentX)

        val estimableIndices = (0..2).filter { logitFit.estimable[it] }
        val estimableMass = estimableIndices.sumOf { logitFit.conditionalProbabilities[it] }
        val normProbs = arrayOfNulls<Double>(3)
        for (idx in 0..2) {
            normProbs[idx] = if (!logitFit.estimable[idx] || estimableMass <= 0.0) null
            else roundTo(logitFit.conditionalProbabilities[idx] / estimableMass, 4)
        }
        if (estimableIndices.isNotEmpty() && estimableMass > 0.0) {
            val sumRest = estimableIndices.dropLast(1).sumOf { normProbs[it] ?: 0.0 }
            val lastIdx = estimableIndices.last()
            normProbs[lastIdx] = roundTo(max(0.0, 1.0 - sumRest), 4)
        }

        val specs = listOf(
            Triple(ScenarioIds.BULLISH_EXPANSION, "Bullish Expansion (> +1.0 ATR)", "bull"),
            Triple(ScenarioIds.RANGE_CONTAINMENT, "Range Containment (|dP| <= 1.0 ATR)", "neutral"),
            Triple(ScenarioIds.BEARISH_CONTRACTION, "Bearish Contraction (< -1.0 ATR)", "bear")
        )
        val targets = listOf(
            Triple(pQ75, pQ90, pQ25),
            Triple(pQ50, pQ75, pQ25),
            Triple(pQ25, pQ10, pQ75)
        )
        val texts = listOf(
            Triple(
                "Terminal move > +1.0 ATR14 (+${String.format(Locale.US, "%.2f", atr)}) above ${String.format(Locale.US, "%.2f", lastClose)}",
                "Causal breakout persistence over upper quartile envelope",
                "Close falls below lower quartile pivot ${String.format(Locale.US, "%.2f", pQ25)}"
            ),
            Triple(
                "Terminal excursion bounded within ±1.0 ATR14 (±${String.format(Locale.US, "%.2f", atr)})",
                "Mean-reverting oscillation around conditional median q50",
                "Sustained close beyond ±1.0 ATR expansion band"
            ),
            Triple(
                "Terminal move < -1.0 ATR14 (-${String.format(Locale.US, "%.2f", atr)}) below ${String.format(Locale.US, "%.2f", lastClose)}",
                "Downside momentum extension into lower quartile envelope",
                "Close reclaims above upper quartile pivot ${String.format(Locale.US, "%.2f", pQ75)}"
            )
        )

        val scenarios = (0..2).map { i ->
            val isEst = logitFit.estimable[i]
            val targetP = targets[i].first
            ForecastScenario(
                id = specs[i].first,
                label = specs[i].second,
                bias = specs[i].third,
                status = if (isEst) ScenarioStatus.ESTIMABLE else ScenarioStatus.NOT_ESTIMABLE,
                probability = normProbs[i],
                rawEmpiricalFrequency = roundTo(logitFit.rawEmpiricalFrequency[i], 4),
                sampleCount = logitFit.counts[i],
                targetPrice = targetP,
                extremePrice = targets[i].second,
                invalidationReference = targets[i].third,
                pctChange = if (lastClose > 0.0) ((targetP - lastClose) / lastClose) * 100.0 else 0.0,
                leafId = specs[i].first,
                parentBranch = if (isEst) "ESTIMABLE" else "NOT_ESTIMABLE",
                entryCondition = texts[i].first,
                intermediateEvent = texts[i].second,
                invalidationCondition = texts[i].third,
                lowSampleWarning = !isEst
            )
        }

        val report = ScenarioCalibrationReport(
            totalTrainAndCalSamples = logitFit.totalLocal,
            oosEvaluatedCount = logitFit.oosEvaluatedCount,
            temperature = logitFit.temperature,
            oosBrierModel = logitFit.oosBrierModel,
            oosBrierClimatology = logitFit.oosBrierClimatology,
            calibrationPassed = logitFit.calibrationPassed,
            notEstimableCount = (0..2).count { !logitFit.estimable[it] }
        )
        return Pair(scenarios, report)
    }

    internal data class SimulatedPathEvent(
        val touched: Boolean,
        val penetrated: Boolean,
        val reclaimed: Boolean,
        val confirmedBreakout: Boolean,
        val reachedTarget: Boolean,
        val ambiguousBar: Boolean,
        val firstReachBar: Int
    )

    internal fun simulatePathEventsOnWindow(
        candles: List<CleanOhlcBar>,
        zoneLow: Double,
        zoneHigh: Double,
        targetPrice: Double,
        invalidationPrice: Double,
        penAtrMult: Double = 0.20,
        reclaimBars: Int = 3,
        breakoutCloses: Int = 2,
        atr: Double = 1.0
    ): SimulatedPathEvent {
        val penAmt = max(1e-8, penAtrMult * atr)
        var touched = false
        var penetrated = false
        var consecOutside = 0
        var breakoutDir = 0
        var penetratedAt = -1
        var reclaimed = false
        var reachedTarget = false
        var reachedInvalidation = false
        var ambiguousBar = false
        var firstReachBar = 0
        val isUpperZone = zoneHigh >= invalidationPrice

        for (i in candles.indices) {
            val c = candles[i]
            val hitTarget = if (isUpperZone) c.high >= targetPrice else c.low <= targetPrice
            val hitInv = if (isUpperZone) c.low <= invalidationPrice else c.high >= invalidationPrice
            if (!reachedTarget && !reachedInvalidation) {
                if (hitTarget && hitInv) ambiguousBar = true
                else if (hitTarget) {
                    reachedTarget = true
                    firstReachBar = i + 1
                } else if (hitInv) {
                    reachedInvalidation = true
                }
            }
            if (c.high >= zoneLow && c.low <= zoneHigh) touched = true
            val penDist = max(c.high - zoneHigh, zoneLow - c.low)
            if (penDist >= penAmt) {
                if (!penetrated) penetratedAt = i
                penetrated = true
            }
            if (c.close > zoneHigh || c.close < zoneLow) {
                consecOutside++
                if (consecOutside >= breakoutCloses && breakoutDir == 0) {
                    breakoutDir = if (c.close > zoneHigh) 1 else -1
                }
            } else {
                if (penetrated && !reclaimed && penetratedAt >= 0 && i - penetratedAt <= reclaimBars) {
                    reclaimed = true
                }
                consecOutside = 0
            }
        }
        return SimulatedPathEvent(touched, penetrated, reclaimed, breakoutDir != 0, reachedTarget, ambiguousBar, firstReachBar)
    }

    data class KeyZonesAndEventsBundle(
        val scenarios: List<ForecastScenario>,
        val scenarioCalibration: ScenarioCalibrationReport,
        val keyZones: List<KeyPriceZone>,
        val eventDictionary: EventDictionarySpec,
        val pathEventStats: PathEventStats
    )

    fun detectKeyZonesAndEventTree(
        features: ExtractedForecastFeatures,
        points: List<ForecastPoint>,
        horizonBars: Int,
        split: DisjointNestedSplits? = null
    ): KeyZonesAndEventsBundle {
        val lastPt = points.last()
        val lastClose = features.lastClose
        val atr = max(1e-6, features.atr14)
        val candles = features.candles
        val lookback = candles.takeLast(min(60, candles.size))
        val swingHigh = lookback.maxOfOrNull { it.high } ?: lastPt.q75
        val swingLow = lookback.minOfOrNull { it.low } ?: lastPt.q25

        val upperCenter = lastPt.q75 * 0.65 + swingHigh * 0.35
        val lowerCenter = lastPt.q25 * 0.65 + swingLow * 0.35
        val zoneHalf = max(atr * 0.35, lastClose * 0.0008)
        val upperLow = max(lastClose * 0.02, upperCenter - zoneHalf)
        val upperHigh = upperCenter + zoneHalf
        val lowerLow = max(lastClose * 0.02, lowerCenter - zoneHalf)
        val lowerHigh = lowerCenter + zoneHalf

        val evalLen = min(horizonBars, 12)
        val histStep = max(1, max(1, candles.size - evalLen - 16) / 14)

        var totalPaths = 0
        var reachUpper = 0
        var reachLower = 0
        var ambigUpper = 0
        var upperTouch = 0
        var upperPen = 0
        var upperReclaim = 0
        var upperBreakout = 0
        var upperCensSum = 0.0
        var lowerCensSum = 0.0

        if (candles.size >= evalLen + 18) {
            var origin = 14
            while (origin <= candles.size - evalLen) {
                totalPaths++
                val scale = candles[origin - 1].close / lastClose
                val win = candles.subList(origin, origin + evalLen)
                val uEv = simulatePathEventsOnWindow(win, upperLow * scale, upperHigh * scale, upperCenter * scale, lowerCenter * scale, 0.20, 3, 2, atr * scale)
                val lEv = simulatePathEventsOnWindow(win, lowerLow * scale, lowerHigh * scale, lowerCenter * scale, upperCenter * scale, 0.20, 3, 2, atr * scale)
                if (uEv.touched) upperTouch++
                if (uEv.penetrated) upperPen++
                if (uEv.reclaimed) upperReclaim++
                if (uEv.confirmedBreakout) upperBreakout++
                if (uEv.ambiguousBar) ambigUpper++
                if (uEv.reachedTarget) {
                    reachUpper++
                    upperCensSum += uEv.firstReachBar
                } else upperCensSum += evalLen
                if (lEv.reachedTarget) {
                    reachLower++
                    lowerCensSum += lEv.firstReachBar
                } else lowerCensSum += evalLen
                origin += histStep
            }
        }

        val grid = ArrayList<SensitivityGridPoint>()
        if (candles.size >= evalLen + 18) {
            for (penMult in doubleArrayOf(0.10, 0.20, 0.35)) {
                for (recBars in intArrayOf(2, 3, 5)) {
                    var gWins = 0
                    var gTouch = 0
                    var gRec = 0
                    var gBrk = 0
                    var gAmb = 0
                    var origin = 14
                    while (origin <= candles.size - evalLen) {
                        gWins++
                        val scale = candles[origin - 1].close / lastClose
                        val ev = simulatePathEventsOnWindow(candles.subList(origin, origin + evalLen), upperLow * scale, upperHigh * scale, upperCenter * scale, lowerCenter * scale, penMult, recBars, 2, atr * scale)
                        if (ev.touched) gTouch++
                        if (ev.reclaimed) gRec++
                        if (ev.confirmedBreakout) gBrk++
                        if (ev.ambiguousBar) gAmb++
                        origin += histStep * 2
                    }
                    if (gWins > 0) {
                        grid.add(SensitivityGridPoint(penMult, recBars, 2, roundTo((gTouch.toDouble() / gWins) * 100.0, 1), roundTo((gRec.toDouble() / gWins) * 100.0, 1), roundTo((gBrk.toDouble() / gWins) * 100.0, 1), roundTo((gAmb.toDouble() / gWins) * 100.0, 1)))
                    }
                }
            }
        }

        val (scenarios, scenarioCal) = buildCalibratedScenariosV2(candles, features, horizonBars, points, split)
        val pBull = scenarios[0].probability ?: scenarios[0].rawEmpiricalFrequency
        val pBear = scenarios[2].probability ?: scenarios[2].rawEmpiricalFrequency
        val totalSpread = max(1e-6, lastPt.q90 - lastPt.q10)
        val bullBias = normalCdf((lastPt.q50 - lastClose) / (totalSpread / 2.5631))
        val reachUpRate = if (totalPaths > 0) reachUpper.toDouble() / totalPaths else 0.0
        val reachDnRate = if (totalPaths > 0) reachLower.toDouble() / totalPaths else 0.0
        val ambigRate = if (totalPaths > 0) ambigUpper.toDouble() / totalPaths else 0.0

        val keyZones = listOf(
            KeyPriceZone(
                zoneId = "KZ_UPPER_REACTION",
                zoneType = "RESISTANCE_ZONE",
                lowPrice = upperLow,
                highPrice = upperHigh,
                centerPrice = upperCenter,
                detectedAtMs = features.lastOpenMs,
                source = "SWING_STRUCTURE_ATR",
                strength = roundTo(ForecastStatisticalTests.clamp(0.55 + if (swingHigh > lastClose) 0.22 else 0.08, 0.3, 0.95), 2),
                touchProbability = roundTo(if (totalPaths > 0) upperTouch.toDouble() / totalPaths else 0.0, 3),
                penetrationProbability = roundTo(if (totalPaths > 0) upperPen.toDouble() / totalPaths else 0.0, 3),
                reclaimProbability = roundTo(if (totalPaths > 0) upperReclaim.toDouble() / totalPaths else 0.0, 3),
                confirmedBreakoutProbability = roundTo(pBull, 3),
                reachBeforeInvalidationProb = roundTo(ForecastStatisticalTests.clamp(reachUpRate, 0.0, 1.0 - ambigRate), 3),
                invalidationBeforeReachProb = roundTo(ForecastStatisticalTests.clamp(reachDnRate, 0.0, 1.0 - ambigRate), 3),
                expectedBarsToReachCensored = roundTo(if (totalPaths > 0) upperCensSum / totalPaths else horizonBars * 0.5, 1),
                invalidationPrice = lowerCenter,
                horizonBars = horizonBars
            ),
            KeyPriceZone(
                zoneId = "KZ_LOWER_REACTION",
                zoneType = "SUPPORT_ZONE",
                lowPrice = lowerLow,
                highPrice = lowerHigh,
                centerPrice = lowerCenter,
                detectedAtMs = features.lastOpenMs,
                source = "SWING_STRUCTURE_ATR",
                strength = roundTo(ForecastStatisticalTests.clamp(0.55 + if (swingLow < lastClose) 0.22 else 0.08, 0.3, 0.95), 2),
                touchProbability = roundTo(if (totalPaths > 0) (totalPaths - upperTouch).toDouble() / totalPaths else ForecastStatisticalTests.clamp((1.0 - bullBias) * 0.5, 0.0, 1.0), 3),
                penetrationProbability = roundTo(if (totalPaths > 0) upperPen.toDouble() / totalPaths else 0.0, 3),
                reclaimProbability = roundTo(if (totalPaths > 0) upperReclaim.toDouble() / totalPaths else 0.0, 3),
                confirmedBreakoutProbability = roundTo(pBear, 3),
                reachBeforeInvalidationProb = roundTo(ForecastStatisticalTests.clamp(reachDnRate, 0.0, 1.0 - ambigRate), 3),
                invalidationBeforeReachProb = roundTo(ForecastStatisticalTests.clamp(reachUpRate, 0.0, 1.0 - ambigRate), 3),
                expectedBarsToReachCensored = roundTo(if (totalPaths > 0) lowerCensSum / totalPaths else horizonBars * 0.5, 1),
                invalidationPrice = upperCenter,
                horizonBars = horizonBars
            )
        )

        val pathEventStats = PathEventStats(
            touchRatePct = roundTo(if (totalPaths > 0) (upperTouch.toDouble() / totalPaths) * 100.0 else 0.0, 1),
            penetrationRatePct = roundTo(if (totalPaths > 0) (upperPen.toDouble() / totalPaths) * 100.0 else 0.0, 1),
            reclaimRatePct = roundTo(if (totalPaths > 0) (upperReclaim.toDouble() / totalPaths) * 100.0 else 0.0, 1),
            breakoutRatePct = roundTo(if (totalPaths > 0) (upperBreakout.toDouble() / totalPaths) * 100.0 else 0.0, 1),
            reachBeforeInvalidationPct = roundTo(reachUpRate * 100.0, 1),
            ambiguousRatePct = roundTo(ambigRate * 100.0, 1),
            censoringRatePct = roundTo(if (totalPaths > 0) ((totalPaths - reachUpper).toDouble() / totalPaths) * 100.0 else 100.0, 1)
        )

        return KeyZonesAndEventsBundle(
            scenarios = scenarios,
            scenarioCalibration = scenarioCal,
            keyZones = keyZones,
            eventDictionary = EventDictionarySpec(sensitivityGrid = grid),
            pathEventStats = pathEventStats
        )
    }

    fun coordinateMultiTimeframe(
        independentPoints: List<ForecastPoint>,
        independentScenarios: List<ForecastScenario>,
        anchorClose: Double,
        timeframe: String,
        higherTimeframe: String,
        higherCandles: List<CandleBar>
    ): MtfCoordinationReport {
        val indLast = independentPoints.last()
        val indMedPct = if (anchorClose > 0.0) ((indLast.q50 - anchorClose) / anchorClose) * 100.0 else 0.0
        val htfClean = higherCandles.mapNotNull { c ->
            val o = c.open.toDouble(); val h = c.high.toDouble(); val l = c.low.toDouble(); val cl = c.close.toDouble()
            if (cl.isFinite() && cl > 0.0 && h >= l) CleanOhlcBar(o, h, l, cl, max(0.0, c.volume.toDouble()), c.openTimeUtcMillis) else null
        }

        if (htfClean.size < 16 || higherTimeframe.isBlank()) {
            return MtfCoordinationReport(higherTimeframe.ifBlank { "NONE" }, MtfAlignmentState.SINGLE_TIMEFRAME, true, roundTo(indMedPct, 3), roundTo(indMedPct, 3), independentPoints, independentScenarios, listOf("Higher-timeframe history unavailable locally; running independent engine only"), 1.0)
        }
        val htfFeats = ForecastFeatureExtractor.extractClean(if (htfClean.size > 120) htfClean.takeLast(120) else htfClean)
            ?: return MtfCoordinationReport(higherTimeframe, MtfAlignmentState.SINGLE_TIMEFRAME, true, roundTo(indMedPct, 3), roundTo(indMedPct, 3), independentPoints, independentScenarios, listOf("Insufficient higher-timeframe bars for independent check"), 1.0)

        val htfLatest = htfFeats.candles.last()
        val ohlcConsistent = anchorClose >= htfLatest.low * 0.992 && anchorClose <= htfLatest.high * 1.008
        val htfDriftSign = if (htfFeats.driftZ > 0.35) 1 else if (htfFeats.driftZ < -0.35) -1 else 0
        val indSign = if (indMedPct > 0.08) 1 else if (indMedPct < -0.08) -1 else 0

        val conflictReasons = ArrayList<String>()
        var alignmentState = MtfAlignmentState.ALIGNED
        var uncAdj = 1.0
        var driftPull = 0.0

        if (!ohlcConsistent) {
            alignmentState = MtfAlignmentState.STRUCTURAL_CONFLICT
            uncAdj = 1.18
            conflictReasons.add("Anchor close deviates outside latest closed $higherTimeframe [Low, High] envelope")
        } else if (htfDriftSign != 0 && indSign != 0 && htfDriftSign != indSign) {
            val strongHtf = abs(htfFeats.driftZ) >= 1.35
            alignmentState = if (strongHtf) MtfAlignmentState.STRUCTURAL_CONFLICT else MtfAlignmentState.NATURAL_HORIZON_DIVERGENCE
            uncAdj = if (strongHtf) 1.16 else 1.07
            driftPull = if (strongHtf) htfFeats.recentMeanReturn * 0.28 else htfFeats.recentMeanReturn * 0.12
            conflictReasons.add("$timeframe trajectory (${if (indSign > 0) "+" else "-"}) diverges from $higherTimeframe drift (z=${String.format(Locale.US, "%.2f", htfFeats.driftZ)})")
        }

        val horizon = max(1, independentPoints.size)
        val coordinatedPoints = independentPoints.mapIndexed { idx, p ->
            val stepFrac = (idx + 1).toDouble() / horizon.toDouble()
            val q50 = p.q50 * exp(driftPull * (idx + 1))
            val halfLo = max(1e-8, (p.q50 - p.q10) * uncAdj)
            val halfLo25 = max(1e-8, (p.q50 - p.q25) * uncAdj)
            val halfHi75 = max(1e-8, (p.q75 - p.q50) * uncAdj)
            val halfHi = max(1e-8, (p.q90 - p.q50) * uncAdj)
            val mq = ForecastCalendarHelper.enforceMonotonicQuantiles(
                q50 - halfLo * (0.9 + 0.1 * stepFrac),
                q50 - halfLo25,
                q50,
                q50 + halfHi75,
                q50 + halfHi * (0.9 + 0.1 * stepFrac),
                anchorClose * 0.02
            )
            p.copy(
                q10 = mq[0], q25 = mq[1], q50 = mq[2], q75 = mq[3], q90 = mq[4],
                open = if (idx == 0) anchorClose else mq[2], close = mq[2],
                high = max(mq[3], mq[2]), low = min(mq[1], mq[2]),
                upperBand = mq[4], lowerBand = mq[0],
                pctChangeFromLast = ((mq[2] - anchorClose) / anchorClose) * 100.0
            )
        }
        val coordLast = coordinatedPoints.last()
        val coordMedPct = if (anchorClose > 0.0) ((coordLast.q50 - anchorClose) / anchorClose) * 100.0 else indMedPct

        return MtfCoordinationReport(higherTimeframe, alignmentState, ohlcConsistent, roundTo(indMedPct, 3), roundTo(coordMedPct, 3), coordinatedPoints, independentScenarios, conflictReasons, uncAdj)
    }

    fun evaluateNoEdgeGate(walkForward: WalkForwardReport?, uncertainty: UncertaintyBreakdown?): NoEdgeGateReport {
        val reasons = ArrayList<String>()
        val kOuter = walkForward?.evaluatedWindows ?: 0
        if (walkForward == null || kOuter < 30) reasons.add("Insufficient non-overlapping OOS windows (K_outer=$kOuter < 30)")
        val nEff = walkForward?.effectiveSampleSize ?: 0.0
        if (nEff < 25.0) reasons.add("Effective sample size N_eff=${String.format(Locale.US, "%.1f", nEff)} below minimum 25.0")
        val calSt = walkForward?.conformalCalibration?.calibrationStatus ?: "UNDER_SAMPLED"
        if (calSt != "CALIBRATED_NORMALIZED") reasons.add("Conformal calibration not ready ($calSt)")
        val rMae = walkForward?.relativeMaeVsNaive ?: 1.0
        if (rMae >= 1.0) reasons.add("rMAE=${String.format(Locale.US, "%.3f", rMae)} >= 1.000")
        val wisM = walkForward?.wisModel ?: 0.0
        val wisN = walkForward?.wisNaiveDistributional ?: 0.0
        if (!(wisM < wisN && wisN > 0.0)) reasons.add("WIS=${String.format(Locale.US, "%.4f", wisM)} >= Naive WIS=${String.format(Locale.US, "%.4f", wisN)}")
        val cov80 = walkForward?.coverage80Pct ?: 0.0
        if (cov80 < 72.0 || cov80 > 88.0) reasons.add("80% Coverage=${String.format(Locale.US, "%.1f", cov80)}% outside [72%, 88%]")
        val dmP = walkForward?.dieboldMarianoPValue ?: 1.0
        if (dmP > 0.05) reasons.add("HLN-DM p=${String.format(Locale.US, "%.4f", dmP)} > 0.05")
        val bootP = walkForward?.sensitivityBootstrapPValue ?: 1.0
        if (bootP > 0.10) reasons.add("Stationary block bootstrap p=${String.format(Locale.US, "%.4f", bootP)} > 0.10")
        if (uncertainty?.oodStatus == OodStatus.EXTREME) reasons.add("Extreme OOD regime forbids edge claim")

        val hasEdge = walkForward?.acceptancePassed == true && kOuter >= 30 && nEff >= 25.0 &&
            calSt == "CALIBRATED_NORMALIZED" && uncertainty?.oodStatus != OodStatus.EXTREME
        return NoEdgeGateReport(
            gateState = if (hasEdge) NoEdgeGateState.EDGE_SUPPORTED else NoEdgeGateState.NO_EDGE_DETECTED,
            hasEdge = hasEdge,
            effectiveSampleSize = roundTo(nEff, 2),
            skillScoreVsBaseline = roundTo(walkForward?.skillScoreVsNaive ?: 0.0, 4),
            reasons = if (hasEdge) listOf("All 6 V2.1 OOS, WIS, Conformal, and HLN-DM + Block Bootstrap gates passed") else reasons
        )
    }

    fun computeForecastStability(summary: ForecastSummary?, anchorClose: Double, previousForecast: ForecastResult?): ForecastStabilityReport {
        val prevSummary = previousForecast?.summary
        if (prevSummary == null || summary == null || anchorClose <= 0.0) {
            return ForecastStabilityReport(null, 0.0, 0.0, true)
        }
        val medDrift = roundTo((abs(summary.terminalQ50 - prevSummary.terminalQ50) / max(1e-8, anchorClose)) * 100.0, 3)
        val corShift = roundTo(abs(summary.corridorWidthPct - prevSummary.corridorWidthPct), 3)
        return ForecastStabilityReport(previousForecast.inputHash.ifBlank { null }, medDrift, corShift, medDrift <= 1.25 && corShift <= 2.5)
    }
}
