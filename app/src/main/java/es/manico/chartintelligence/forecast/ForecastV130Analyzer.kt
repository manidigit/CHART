package es.manico.chartintelligence.forecast

import es.manico.chartintelligence.data.model.CandleBar
import java.util.Locale
import kotlin.math.abs
import kotlin.math.exp
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

        val (oodStatus, spreadMultiplier, oodEpistemicFactor) = when {
            oodDistance >= 3.6 -> Triple(OodStatus.EXTREME, 1.42, 0.48)
            oodDistance >= 2.2 -> Triple(OodStatus.ELEVATED, 1.18, 0.20)
            else -> Triple(OodStatus.IN_DISTRIBUTION, 1.0, 0.0)
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

    internal data class PathSimulationResult(
        val leafId: String,
        val touched: Boolean,
        val penetrated: Boolean,
        val maxPenAtr: Double,
        val closesOutside: Int,
        val reclaimed: Boolean,
        val reclaimTime: Int,
        val confirmedBreakout: Boolean,
        val reachedTarget: Boolean,
        val reachedInvalidation: Boolean,
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
    ): PathSimulationResult {
        val penAmt = max(1e-8, penAtrMult * atr)
        var touched = false
        var penetrated = false
        var maxPenAtr = 0.0
        var closesOutside = 0
        var consecOutside = 0
        var breakoutDir = 0
        var penetratedAt = -1
        var reclaimed = false
        var reclaimTime = 0
        var reachedTarget = false
        var reachedInvalidation = false
        var ambiguousBar = false
        var firstReachBar = 0

        val isUpperZone = zoneHigh >= invalidationPrice

        for (i in candles.indices) {
            val c = candles[i]
            val lo = c.low
            val hi = c.high
            val cl = c.close

            val hitTarget = if (isUpperZone) hi >= targetPrice else lo <= targetPrice
            val hitInv = if (isUpperZone) lo <= invalidationPrice else hi >= invalidationPrice

            if (!reachedTarget && !reachedInvalidation) {
                when {
                    hitTarget && hitInv -> ambiguousBar = true
                    hitTarget -> {
                        reachedTarget = true
                        firstReachBar = i + 1
                    }
                    hitInv -> reachedInvalidation = true
                }
            }

            if (hi >= zoneLow && lo <= zoneHigh) {
                touched = true
            }

            val penDist = max(hi - zoneHigh, zoneLow - lo)
            if (penDist >= penAmt) {
                if (!penetrated) penetratedAt = i
                penetrated = true
                maxPenAtr = max(maxPenAtr, penDist / max(1e-8, atr))
            }

            if (cl > zoneHigh || cl < zoneLow) {
                closesOutside++
                consecOutside++
                if (consecOutside >= breakoutCloses && breakoutDir == 0) {
                    breakoutDir = if (cl > zoneHigh) 1 else -1
                }
            } else {
                if (penetrated && !reclaimed && penetratedAt >= 0 && (i - penetratedAt) <= reclaimBars) {
                    reclaimed = true
                    reclaimTime = i - penetratedAt
                }
                consecOutside = 0
            }
        }

        val leafId = when {
            breakoutDir > 0 -> "CONFIRMED_BREAKOUT_BULL"
            breakoutDir < 0 -> "CONFIRMED_BREAKOUT_BEAR"
            reclaimed -> "PENETRATE_AND_RECLAIM"
            penetrated -> {
                if (closesOutside >= 1) {
                    if (zoneHigh >= invalidationPrice) "CONFIRMED_BREAKOUT_BULL" else "CONFIRMED_BREAKOUT_BEAR"
                } else {
                    "ZONE_REACTION_REJECTION"
                }
            }
            touched -> "ZONE_REACTION_REJECTION"
            else -> "NO_ZONE_TOUCH_RANGE"
        }

        return PathSimulationResult(
            leafId = leafId,
            touched = touched,
            penetrated = penetrated,
            maxPenAtr = maxPenAtr,
            closesOutside = closesOutside,
            reclaimed = reclaimed,
            reclaimTime = reclaimTime,
            confirmedBreakout = breakoutDir != 0,
            reachedTarget = reachedTarget,
            reachedInvalidation = reachedInvalidation,
            ambiguousBar = ambiguousBar,
            firstReachBar = firstReachBar
        )
    }

    fun detectKeyZonesAndEventTree(
        features: ExtractedForecastFeatures,
        points: List<ForecastPoint>,
        horizonBars: Int
    ): Triple<List<ForecastScenario>, List<KeyPriceZone>, EventDictionarySpec> {
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

        var cntNoTouch = 0
        var cntReact = 0
        var cntReclaim = 0
        var cntBull = 0
        var cntBear = 0

        var totalPaths = 0
        var reachUpperBeforeInv = 0
        var reachLowerBeforeInv = 0
        var ambiguousUpperCount = 0
        var upperTouchCount = 0
        var upperPenCount = 0
        var upperReclaimCount = 0
        var upperBreakCount = 0
        var upperCensoredTimeSum = 0.0
        var lowerCensoredTimeSum = 0.0

        if (candles.size >= evalLen + 18) {
            var origin = 14
            while (origin <= candles.size - evalLen) {
                totalPaths++
                val scale = candles[origin - 1].close / lastClose
                val win = candles.subList(origin, origin + evalLen)

                val uEv = simulatePathEventsOnWindow(
                    win, upperLow * scale, upperHigh * scale, upperCenter * scale, lowerCenter * scale,
                    0.20, 3, 2, atr * scale
                )
                val lEv = simulatePathEventsOnWindow(
                    win, lowerLow * scale, lowerHigh * scale, lowerCenter * scale, upperCenter * scale,
                    0.20, 3, 2, atr * scale
                )

                if (uEv.touched) upperTouchCount++
                if (uEv.penetrated) upperPenCount++
                if (uEv.reclaimed) upperReclaimCount++
                if (uEv.confirmedBreakout) upperBreakCount++
                if (uEv.ambiguousBar) ambiguousUpperCount++
                if (uEv.reachedTarget) {
                    reachUpperBeforeInv++
                    upperCensoredTimeSum += uEv.firstReachBar
                } else {
                    upperCensoredTimeSum += evalLen
                }
                if (lEv.reachedTarget) {
                    reachLowerBeforeInv++
                    lowerCensoredTimeSum += lEv.firstReachBar
                } else {
                    lowerCensoredTimeSum += evalLen
                }

                when {
                    uEv.leafId == "CONFIRMED_BREAKOUT_BULL" -> cntBull++
                    lEv.leafId == "CONFIRMED_BREAKOUT_BEAR" -> cntBear++
                    uEv.leafId == "PENETRATE_AND_RECLAIM" || lEv.leafId == "PENETRATE_AND_RECLAIM" -> cntReclaim++
                    uEv.touched || lEv.touched -> cntReact++
                    else -> cntNoTouch++
                }
                origin += histStep
            }
        }

        val sensitivityGrid = ArrayList<SensitivityGridPoint>()
        if (candles.size >= evalLen + 18) {
            val atrChoices = listOf(0.10, 0.20, 0.35)
            val reclaimChoices = listOf(2, 3, 5)
            for (penMult in atrChoices) {
                for (recBars in reclaimChoices) {
                    var gWins = 0
                    var gTouch = 0
                    var gRec = 0
                    var gBrk = 0
                    var gAmb = 0
                    var origin = 14
                    while (origin <= candles.size - evalLen) {
                        gWins++
                        val scale = candles[origin - 1].close / lastClose
                        val ev = simulatePathEventsOnWindow(
                            candles.subList(origin, origin + evalLen),
                            upperLow * scale, upperHigh * scale, upperCenter * scale, lowerCenter * scale,
                            penMult, recBars, 2, atr * scale
                        )
                        if (ev.touched) gTouch++
                        if (ev.reclaimed) gRec++
                        if (ev.confirmedBreakout) gBrk++
                        if (ev.ambiguousBar) gAmb++
                        origin += histStep * 2
                    }
                    if (gWins > 0) {
                        sensitivityGrid.add(
                            SensitivityGridPoint(
                                penetrationAtrMult = penMult,
                                reclaimWindowBars = recBars,
                                breakoutCloses = 2,
                                touchFreqPct = roundTo((gTouch.toDouble() / gWins) * 100.0, 1),
                                reclaimFreqPct = roundTo((gRec.toDouble() / gWins) * 100.0, 1),
                                breakoutFreqPct = roundTo((gBrk.toDouble() / gWins) * 100.0, 1),
                                ambiguousRatePct = roundTo((gAmb.toDouble() / gWins) * 100.0, 1)
                            )
                        )
                    }
                }
            }
        }

        val totalSpread = max(1e-6, lastPt.q90 - lastPt.q10)
        val driftNorm = (lastPt.q50 - lastClose) / (totalSpread / 2.5631)
        val bullBias = normalCdf(driftNorm)

        val empNoTouch = if (totalPaths > 0) cntNoTouch.toDouble() / totalPaths else 0.22
        val empReact = if (totalPaths > 0) cntReact.toDouble() / totalPaths else 0.24
        val empReclaim = if (totalPaths > 0) cntReclaim.toDouble() / totalPaths else 0.18
        val empBull = if (totalPaths > 0) cntBull.toDouble() / totalPaths else 0.18 * bullBias * 2.0
        val empBear = if (totalPaths > 0) cntBear.toDouble() / totalPaths else 0.18 * (1.0 - bullBias) * 2.0

        val anaTouch = (0.62 + 0.14 * min(2.0, abs(driftNorm))).coerceIn(0.42, 0.88)
        val rawNoTouch = 0.5 * (1.0 - anaTouch) + 0.5 * empNoTouch
        val rawReact = 0.5 * (anaTouch * 0.30) + 0.5 * empReact
        val rawReclaim = 0.5 * (anaTouch * 0.22) + 0.5 * empReclaim
        val rawBreakPool = max(0.08, 1.0 - rawNoTouch - rawReact - rawReclaim)
        val rawBull = 0.55 * (rawBreakPool * bullBias) + 0.45 * empBull
        val rawBear = 0.55 * (rawBreakPool * (1.0 - bullBias)) + 0.45 * empBear
        val sumRaw = rawNoTouch + rawReact + rawReclaim + rawBull + rawBear

        val pNoTouch = roundTo(rawNoTouch / sumRaw, 3)
        val pReact = roundTo(rawReact / sumRaw, 3)
        val pReclaim = roundTo(rawReclaim / sumRaw, 3)
        val pBull = roundTo(rawBull / sumRaw, 3)
        val pBear = roundTo(max(0.0, 1.0 - pNoTouch - pReact - pReclaim - pBull), 3)

        val scenarios = listOf(
            ForecastScenario(
                id = "NO_ZONE_TOUCH_RANGE",
                leafId = "NO_ZONE_TOUCH_RANGE",
                parentBranch = "NO_TOUCH",
                label = "No Key Zone Touch (Range Containment)",
                bias = "neutral",
                probability = pNoTouch,
                targetPrice = lastPt.q50,
                extremePrice = lastPt.q75,
                invalidationReference = lowerCenter,
                pctChange = ((lastPt.q50 - lastClose) / lastClose) * 100.0,
                entryCondition = "Price stays between ${String.format(Locale.US, "%.2f", lowerHigh)} and ${String.format(Locale.US, "%.2f", upperLow)}",
                intermediateEvent = "Neither primary zone is touched over horizon",
                invalidationCondition = "High/Low touches upper or lower key zone",
                lowSampleWarning = totalPaths > 0 && cntNoTouch < 2
            ),
            ForecastScenario(
                id = "ZONE_REACTION_REJECTION",
                leafId = "ZONE_REACTION_REJECTION",
                parentBranch = "TOUCH_OBSERVED",
                label = "Key Zone Touch & Reaction Rejection",
                bias = "neutral",
                probability = pReact,
                targetPrice = lastPt.q50,
                extremePrice = upperLow,
                invalidationReference = lowerLow,
                pctChange = ((lastPt.q50 - lastClose) / lastClose) * 100.0,
                entryCondition = "High/Low enters key zone boundary",
                intermediateEvent = "Penetration remains < 0.2x ATR with mean reversion",
                invalidationCondition = "Penetration >= 0.2x ATR outside zone",
                lowSampleWarning = totalPaths > 0 && cntReact < 2
            ),
            ForecastScenario(
                id = "PENETRATE_AND_RECLAIM",
                leafId = "PENETRATE_AND_RECLAIM",
                parentBranch = "TOUCH_OBSERVED",
                label = "Zone Penetration & <=3-Bar Reclaim",
                bias = "neutral",
                probability = pReclaim,
                targetPrice = lastPt.q50,
                extremePrice = upperHigh,
                invalidationReference = lowerHigh,
                pctChange = ((lastPt.q50 - lastClose) / lastClose) * 100.0,
                entryCondition = "Penetration >= 0.2x ATR beyond key zone",
                intermediateEvent = "Close reclaims inside zone within <= 3 bars",
                invalidationCondition = "2 consecutive closes outside zone boundary",
                lowSampleWarning = totalPaths > 0 && cntReclaim < 2
            ),
            ForecastScenario(
                id = "CONFIRMED_BREAKOUT_BULL",
                leafId = "CONFIRMED_BREAKOUT_BULL",
                parentBranch = "TOUCH_OBSERVED",
                label = "Confirmed Bullish Zone Expansion",
                bias = "bull",
                probability = pBull,
                targetPrice = lastPt.q75,
                extremePrice = lastPt.q90,
                invalidationReference = lowerCenter,
                pctChange = ((lastPt.q75 - lastClose) / lastClose) * 100.0,
                entryCondition = "Upper zone penetration >= 0.2x ATR above ${String.format(Locale.US, "%.2f", upperHigh)}",
                intermediateEvent = "2 consecutive closes confirmed above upper zone",
                invalidationCondition = "Close back below structural pivot ${String.format(Locale.US, "%.2f", lowerCenter)}",
                lowSampleWarning = totalPaths > 0 && cntBull < 2
            ),
            ForecastScenario(
                id = "CONFIRMED_BREAKOUT_BEAR",
                leafId = "CONFIRMED_BREAKOUT_BEAR",
                parentBranch = "TOUCH_OBSERVED",
                label = "Confirmed Bearish Zone Contraction",
                bias = "bear",
                probability = pBear,
                targetPrice = lastPt.q25,
                extremePrice = lastPt.q10,
                invalidationReference = upperCenter,
                pctChange = ((lastPt.q25 - lastClose) / lastClose) * 100.0,
                entryCondition = "Lower zone penetration >= 0.2x ATR below ${String.format(Locale.US, "%.2f", lowerLow)}",
                intermediateEvent = "2 consecutive closes confirmed below lower zone",
                invalidationCondition = "Close back above structural pivot ${String.format(Locale.US, "%.2f", upperCenter)}",
                lowSampleWarning = totalPaths > 0 && cntBear < 2
            )
        )

        val reachUpRate = if (totalPaths > 0) reachUpperBeforeInv.toDouble() / totalPaths else bullBias * 0.65
        val reachDnRate = if (totalPaths > 0) reachLowerBeforeInv.toDouble() / totalPaths else (1.0 - bullBias) * 0.65
        val ambigRate = if (totalPaths > 0) ambiguousUpperCount.toDouble() / totalPaths else 0.0

        val keyZones = listOf(
            KeyPriceZone(
                zoneId = "KZ_UPPER_REACTION",
                zoneType = "RESISTANCE_ZONE",
                lowPrice = upperLow,
                highPrice = upperHigh,
                centerPrice = upperCenter,
                detectedAtMs = features.lastOpenMs,
                source = "SWING_STRUCTURE_ATR",
                strength = roundTo((0.55 + (if (swingHigh > lastClose) 0.22 else 0.08)).coerceIn(0.3, 0.95), 2),
                touchProbability = roundTo(if (totalPaths > 0) upperTouchCount.toDouble() / totalPaths else bullBias * 0.72, 3),
                penetrationProbability = roundTo(if (totalPaths > 0) upperPenCount.toDouble() / totalPaths else bullBias * 0.45, 3),
                reclaimProbability = roundTo(if (totalPaths > 0) upperReclaimCount.toDouble() / totalPaths else pReclaim * 0.5, 3),
                confirmedBreakoutProbability = pBull,
                reachBeforeInvalidationProb = roundTo(reachUpRate.coerceIn(0.0, 1.0 - ambigRate), 3),
                invalidationBeforeReachProb = roundTo(reachDnRate.coerceIn(0.0, 1.0 - ambigRate), 3),
                expectedBarsToReachCensored = roundTo(if (totalPaths > 0) upperCensoredTimeSum / totalPaths else horizonBars * 0.56, 1),
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
                strength = roundTo((0.55 + (if (swingLow < lastClose) 0.22 else 0.08)).coerceIn(0.3, 0.95), 2),
                touchProbability = roundTo(((1.0 - bullBias) * 0.74).coerceIn(0.05, 0.95), 3),
                penetrationProbability = roundTo(((1.0 - bullBias) * 0.46).coerceIn(0.03, 0.85), 3),
                reclaimProbability = roundTo(pReclaim * 0.5, 3),
                confirmedBreakoutProbability = pBear,
                reachBeforeInvalidationProb = roundTo(reachDnRate.coerceIn(0.0, 1.0 - ambigRate), 3),
                invalidationBeforeReachProb = roundTo(reachUpRate.coerceIn(0.0, 1.0 - ambigRate), 3),
                expectedBarsToReachCensored = roundTo(if (totalPaths > 0) lowerCensoredTimeSum / totalPaths else horizonBars * 0.60, 1),
                invalidationPrice = upperCenter,
                horizonBars = horizonBars
            )
        )

        val dictSpec = EventDictionarySpec(
            sensitivityGrid = sensitivityGrid
        )
        return Triple(scenarios, keyZones, dictSpec)
    }

    fun coordinateMultiTimeframe(
        independentPoints: List<ForecastPoint>,
        independentScenarios: List<ForecastScenario>,
        anchorClose: Double,
        timeframe: String,
        higherTimeframe: String = "",
        higherCandles: List<CandleBar> = emptyList()
    ): MtfCoordinationReport {
        val indLast = independentPoints.last()
        val indMedPct = if (anchorClose > 0.0) ((indLast.q50 - anchorClose) / anchorClose) * 100.0 else 0.0

        val htfFeats = if (higherCandles.size >= 16 && higherTimeframe.isNotBlank()) {
            ForecastFeatureExtractor.extract(higherCandles, 120)
        } else null

        if (htfFeats == null) {
            return MtfCoordinationReport(
                referenceTimeframe = higherTimeframe.ifBlank { "NONE" },
                alignmentState = MtfAlignmentState.SINGLE_TIMEFRAME,
                ohlcConsistent = true,
                independentMedianPct = roundTo(indMedPct, 3),
                coordinatedMedianPct = roundTo(indMedPct, 3),
                coordinatedPoints = independentPoints,
                coordinatedScenarios = independentScenarios,
                conflictReasons = listOf("Higher-timeframe history unavailable locally; running independent engine only"),
                uncertaintyAdjustmentFactor = 1.0
            )
        }

        val htfLatest = htfFeats.candles.last()
        val ohlcConsistent = anchorClose >= htfLatest.low * 0.992 && anchorClose <= htfLatest.high * 1.008
        val htfDriftSign = when {
            htfFeats.driftZ > 0.35 -> 1
            htfFeats.driftZ < -0.35 -> -1
            else -> 0
        }
        val indSign = when {
            indMedPct > 0.08 -> 1
            indMedPct < -0.08 -> -1
            else -> 0
        }

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

        val horizon = independentPoints.size
        val coordinatedPoints = independentPoints.mapIndexed { idx, p ->
            val stepFrac = (idx + 1).toDouble() / max(1, horizon)
            val shiftFactor = exp(driftPull * (idx + 1))
            val q50 = p.q50 * shiftFactor
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
                q10 = mq[0],
                q25 = mq[1],
                q50 = mq[2],
                q75 = mq[3],
                q90 = mq[4],
                pctChangeFromLast = ((mq[2] - anchorClose) / anchorClose) * 100.0
            )
        }

        val coordLast = coordinatedPoints.last()
        val coordMedPct = if (anchorClose > 0.0) ((coordLast.q50 - anchorClose) / anchorClose) * 100.0 else indMedPct

        return MtfCoordinationReport(
            referenceTimeframe = higherTimeframe,
            alignmentState = alignmentState,
            ohlcConsistent = ohlcConsistent,
            independentMedianPct = roundTo(indMedPct, 3),
            coordinatedMedianPct = roundTo(coordMedPct, 3),
            coordinatedPoints = coordinatedPoints,
            coordinatedScenarios = independentScenarios,
            conflictReasons = conflictReasons,
            uncertaintyAdjustmentFactor = uncAdj
        )
    }

    fun evaluateNoEdgeGate(
        walkForward: WalkForwardReport?,
        uncertainty: UncertaintyBreakdown?
    ): NoEdgeGateReport {
        val reasons = ArrayList<String>()
        if (walkForward == null || walkForward.evaluatedWindows < 5) {
            reasons.add("Insufficient walk-forward windows (< 5)")
        }
        val nEff = walkForward?.effectiveSampleSize ?: 0.0
        if (nEff < 12.0) {
            reasons.add("Effective sample size N_eff=${String.format(Locale.US, "%.1f", nEff)} below minimum 12.0")
        }
        val skill = walkForward?.skillScoreVsNaive ?: 0.0
        if (skill <= 0.0) {
            reasons.add("Skill score vs Persistence (${String.format(Locale.US, "%.1f", skill * 100.0)}%) <= 0%")
        }
        if (walkForward?.acceptancePassed != true) {
            reasons.add(walkForward?.acceptanceReason ?: "Walk-forward acceptance gate not met")
        }
        if (uncertainty?.oodStatus == OodStatus.EXTREME) {
            reasons.add("Extreme OOD regime forbids high-confidence edge claim")
        }

        val hasEdge = walkForward?.acceptancePassed == true &&
            nEff >= 12.0 &&
            skill > 0.0 &&
            uncertainty?.oodStatus != OodStatus.EXTREME

        return NoEdgeGateReport(
            gateState = if (hasEdge) NoEdgeGateState.EDGE_SUPPORTED else NoEdgeGateState.NO_EDGE_DETECTED,
            hasEdge = hasEdge,
            effectiveSampleSize = roundTo(nEff, 2),
            skillScoreVsBaseline = roundTo(skill, 4),
            reasons = if (hasEdge) listOf("Out-of-sample skill and calibration pass v1.3.0 statistical gate") else reasons
        )
    }

    fun computeForecastStability(
        summary: ForecastSummary?,
        anchorClose: Double,
        previousForecast: ForecastResult?
    ): ForecastStabilityReport {
        val prevSum = previousForecast?.summary
        if (summary == null || prevSum == null || anchorClose <= 0.0) {
            return ForecastStabilityReport(
                previousForecastHash = previousForecast?.inputHash,
                medianDriftPct = 0.0,
                corridorShiftPct = 0.0,
                stable = true
            )
        }
        val medianDriftPct = roundTo((abs(summary.terminalQ50 - prevSum.terminalQ50) / anchorClose) * 100.0, 3)
        val corridorShiftPct = roundTo(abs(summary.corridorWidthPct - prevSum.corridorWidthPct), 3)
        return ForecastStabilityReport(
            previousForecastHash = previousForecast.inputHash,
            medianDriftPct = medianDriftPct,
            corridorShiftPct = corridorShiftPct,
            stable = medianDriftPct <= 1.25 && corridorShiftPct <= 2.5
        )
    }
}
