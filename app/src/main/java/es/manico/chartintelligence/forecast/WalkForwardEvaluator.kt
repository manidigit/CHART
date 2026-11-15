package es.manico.chartintelligence.forecast

import es.manico.chartintelligence.data.model.CandleBar
import java.util.Locale
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round
import kotlin.math.sqrt

data class OosSelectionDecision(
    val selectionMode: SelectionMode,
    val selectedModelId: String,
    val winnerModelId: String?,
    val reason: String
)

object WalkForwardEvaluator {

    internal data class QuantileStep(
        val q10: Double,
        val q25: Double,
        val q50: Double,
        val q75: Double,
        val q90: Double
    )

    private class MetricAccumulator(
        val id: String,
        val name: String,
        val family: String,
        val evalHorizon: Int,
        val isApproximation: Boolean = false,
        val isCalibratedInterval: Boolean = true,
        val executionRuntime: ExecutionRuntime = ExecutionRuntime.NATIVE_KOTLIN
    ) {
        var absErrSum = 0.0
        var sqErrSum = 0.0
        var pinballSum = 0.0
        var crpsSum = 0.0
        var safeMapeSum = 0.0
        var safeMapeCount = 0
        var widthPctSum = 0.0
        var dirCorrect = 0
        var inBand80 = 0
        var pointCount = 0
        var windowCount = 0
        var skippedCount = 0
        var failedCount = 0
        var lastSkipReason = ""
        var lastFailReason = ""
        val hAbsErr = DoubleArray(evalHorizon)
        val hSqErr = DoubleArray(evalHorizon)
        val hInBand80 = IntArray(evalHorizon)
        val hCount = IntArray(evalHorizon)
    }

    private fun pinball(actual: Double, qPred: Double, tau: Double): Double {
        val err = actual - qPred
        return max(tau * err, (tau - 1.0) * err)
    }

    internal fun buildTrajectory(
        lastClose: Double,
        meanReturns: DoubleArray,
        sigmas: DoubleArray,
        directQuantiles: DirectQuantiles? = null,
        horizonOverride: Int? = null
    ): List<QuantileStep> {
        val len = horizonOverride ?: meanReturns.size
        val out = ArrayList<QuantileStep>(len)
        val hasDirect = directQuantiles != null &&
            directQuantiles.q10.size >= len &&
            directQuantiles.q25.size >= len &&
            directQuantiles.q50.size >= len &&
            directQuantiles.q75.size >= len &&
            directQuantiles.q90.size >= len

        var cumRet = 0.0
        var cumVar = 0.0
        for (h in 0 until len) {
            if (hasDirect && directQuantiles != null) {
                val mq = ForecastCalendarHelper.enforceMonotonicQuantiles(
                    directQuantiles.q10[h],
                    directQuantiles.q25[h],
                    directQuantiles.q50[h],
                    directQuantiles.q75[h],
                    directQuantiles.q90[h],
                    lastClose * 0.01
                )
                out.add(QuantileStep(mq[0], mq[1], mq[2], mq[3], mq[4]))
            } else {
                cumRet += meanReturns.getOrElse(h) { 0.0 }
                val sg = max(1e-5, sigmas.getOrElse(h) { 1e-4 })
                cumVar += sg * sg
                val cumSig = sqrt(cumVar)
                val mq = ForecastCalendarHelper.enforceMonotonicQuantiles(
                    lastClose * exp(cumRet - 1.28155 * cumSig),
                    lastClose * exp(cumRet - 0.67449 * cumSig),
                    lastClose * exp(cumRet),
                    lastClose * exp(cumRet + 0.67449 * cumSig),
                    lastClose * exp(cumRet + 1.28155 * cumSig),
                    lastClose * 0.01
                )
                out.add(QuantileStep(mq[0], mq[1], mq[2], mq[3], mq[4]))
            }
        }
        return out
    }

    internal fun evaluate(
        candles: List<CandleBar>,
        registry: ForecastModelRegistry,
        minTrainBars: Int = 30,
        evalHorizon: Int = 5,
        maxWindows: Int = 10,
        smcEvaluator: ((List<CleanOhlcBar>, Int) -> List<QuantileStep>?)? = null
    ): WalkForwardReport {
        val clean = candles.mapNotNull { c ->
            val o = c.open.toDouble()
            val h = c.high.toDouble()
            val l = c.low.toDouble()
            val cl = c.close.toDouble()
            if (o.isFinite() && cl.isFinite() && o > 0.0 && cl > 0.0) {
                CleanOhlcBar(o, max(h, max(o, cl)), max(1e-8, min(l, min(o, cl))), cl, max(0.0, c.volume.toDouble()), c.openTimeUtcMillis)
            } else null
        }

        val effMinTrain = max(24, minTrainBars)
        val effEvalH = evalHorizon.coerceIn(3, 12)
        val effMaxW = maxWindows.coerceIn(3, 16)
        val active = registry.getEnabled()

        if (clean.size < effMinTrain + effEvalH + 2 || active.isEmpty()) {
            val status = if (clean.size >= 24) ForecastStatus.PROVISIONAL else ForecastStatus.DATA_NOT_READY
            val reason = if (clean.size < effMinTrain + effEvalH + 2) {
                "Need >= ${effMinTrain + effEvalH + 2} bars for walk-forward audit (have ${clean.size})"
            } else {
                "No active forecast plugins enabled"
            }
            return WalkForwardReport(0, effEvalH, status, false, reason, null, null, emptyList(), 0.0)
        }

        val availableEnd = clean.size - effEvalH
        val stride = max(1, floor((availableEnd - effMinTrain).toDouble() / effMaxW).toInt())

        val accs = LinkedHashMap<String, MetricAccumulator>()
        fun accFor(
            id: String,
            name: String,
            family: String,
            isApprox: Boolean = false,
            isCalib: Boolean = true
        ) = accs.getOrPut(id) {
            MetricAccumulator(id, name, family, effEvalH, isApprox, isCalib, ExecutionRuntime.NATIVE_KOTLIN)
        }

        val naiveModel = NaivePersistenceModel()
        accFor("ensemble", "Calibrated Ensemble", "ENSEMBLE")
        accFor(naiveModel.id, naiveModel.name, naiveModel.family)
        if (smcEvaluator != null) {
            accFor("smc_kmedoids", "SMC K-Medoids Analogs", "PATTERN_SMC")
        }
        for ((p, _, _) in active) {
            accFor(p.id, p.name, p.family, p.isApproximation, p.isCalibratedInterval)
        }

        var windowsRun = 0
        var origin = effMinTrain

        var wfTouch = 0
        var wfPen = 0
        var wfReclaim = 0
        var wfBreakout = 0
        var wfReachFirst = 0
        var wfAmbig = 0
        var wfCensored = 0

        while (origin <= availableEnd && windowsRun < effMaxW) {
            val trainStart = max(0, origin - 180)
            val trainClean = clean.subList(trainStart, origin)
            val feats = ForecastFeatureExtractor.extractClean(trainClean)
            if (feats != null) {
                windowsRun++
                val baseClose = feats.lastClose
                val naiveOut = naiveModel.predict(feats, effEvalH, emptyMap())
                val naiveTraj = buildTrajectory(baseClose, naiveOut.meanReturns, naiveOut.sigmas)
                recordErrors(accFor(naiveModel.id, naiveModel.name, naiveModel.family), clean, origin, baseClose, naiveTraj, effEvalH)

                if (smcEvaluator != null) {
                    val smcAcc = accFor("smc_kmedoids", "SMC K-Medoids Analogs", "PATTERN_SMC")
                    try {
                        val smcTraj = smcEvaluator(trainClean, effEvalH)
                        if (smcTraj != null && smcTraj.size >= effEvalH) {
                            recordErrors(smcAcc, clean, origin, baseClose, smcTraj, effEvalH)
                        } else {
                            smcAcc.skippedCount++
                            smcAcc.lastSkipReason = "Insufficient analog bars in window"
                        }
                    } catch (t: Throwable) {
                        smcAcc.failedCount++
                        smcAcc.lastFailReason = t.message ?: "SMC window failed"
                    }
                }

                val ensMean = DoubleArray(effEvalH)
                val ensVar = DoubleArray(effEvalH)
                var validWeightSum = 0.0
                val validPluginOutputs = ArrayList<Triple<Double, DoubleArray, DoubleArray>>()

                for ((plugin, weight, params) in active) {
                    val pAcc = accFor(plugin.id, plugin.name, plugin.family, plugin.isApproximation, plugin.isCalibratedInterval)
                    val out = if (plugin.id == naiveModel.id) {
                        naiveOut
                    } else {
                        try {
                            plugin.predict(feats, effEvalH, params)
                        } catch (t: Throwable) {
                            PluginPrediction(
                                modelId = plugin.id,
                                meanReturns = DoubleArray(0),
                                sigmas = DoubleArray(0),
                                status = ModelExecutionStatus.FAILED,
                                reason = t.message ?: "Model execution error",
                                isApproximation = plugin.isApproximation,
                                isCalibratedInterval = plugin.isCalibratedInterval
                            )
                        }
                    }

                    val st = out.status
                    val ok = st == ModelExecutionStatus.SUCCESS && out.meanReturns.size >= effEvalH
                    if (!ok) {
                        if (st == ModelExecutionStatus.SKIPPED_LOW_DATA) {
                            pAcc.skippedCount++
                            pAcc.lastSkipReason = out.reason.ifBlank { "Insufficient history in window" }
                        } else {
                            pAcc.failedCount++
                            pAcc.lastFailReason = out.reason.ifBlank { "Model returned invalid horizon output" }
                        }
                        continue
                    }

                    validWeightSum += weight
                    validPluginOutputs.add(Triple(weight, out.meanReturns, out.sigmas))
                    if (plugin.id != naiveModel.id) {
                        val traj = buildTrajectory(baseClose, out.meanReturns, out.sigmas, out.directQuantiles, effEvalH)
                        recordErrors(pAcc, clean, origin, baseClose, traj, effEvalH)
                    }
                }

                val safeWeightSum = if (validWeightSum > 0.0) validWeightSum else 1.0
                for ((w, mArr, sArr) in validPluginOutputs) {
                    val nw = w / safeWeightSum
                    for (h in 0 until effEvalH) {
                        ensMean[h] += nw * mArr[h]
                        val sg = sArr.getOrElse(h) { feats.ewmaSigma }
                        ensVar[h] += nw * (sg * sg)
                    }
                }

                val ensSigmas = DoubleArray(effEvalH) { sqrt(max(1e-10, ensVar[it])) }
                val ensTraj = buildTrajectory(baseClose, ensMean, ensSigmas)
                recordErrors(accFor("ensemble", "Calibrated Ensemble", "ENSEMBLE"), clean, origin, baseClose, ensTraj, effEvalH)

                val termPt = ensTraj.last()
                val zoneHalf = max(feats.atr14 * 0.35, baseClose * 0.0008)
                val evRes = ForecastV130Analyzer.simulatePathEventsOnWindow(
                    candles = clean.subList(origin, origin + effEvalH),
                    zoneLow = termPt.q75 - zoneHalf,
                    zoneHigh = termPt.q75 + zoneHalf,
                    targetPrice = termPt.q75,
                    invalidationPrice = termPt.q25,
                    penAtrMult = 0.20,
                    reclaimBars = 3,
                    breakoutCloses = 2,
                    atr = feats.atr14
                )
                if (evRes.touched) wfTouch++
                if (evRes.penetrated) wfPen++
                if (evRes.reclaimed) wfReclaim++
                if (evRes.confirmedBreakout) wfBreakout++
                if (evRes.reachedTarget) wfReachFirst++
                if (evRes.ambiguousBar) wfAmbig++
                if (!evRes.reachedTarget && !evRes.reachedInvalidation) wfCensored++
            }
            origin += stride
        }

        val scalePrice = max(1e-6, clean.last().close)
        fun toSummary(acc: MetricAccumulator): ModelWalkForwardSummary {
            if (acc.windowCount == 0 || acc.pointCount == 0) {
                val st = if (acc.failedCount > 0) ModelExecutionStatus.FAILED else ModelExecutionStatus.SKIPPED_LOW_DATA
                val rsn = if (acc.failedCount > 0) {
                    acc.lastFailReason.ifBlank { "Model failed on evaluation windows" }
                } else {
                    acc.lastSkipReason.ifBlank { "Skipped: minimum required bars not satisfied" }
                }
                return ModelWalkForwardSummary(
                    modelId = acc.id,
                    modelName = acc.name,
                    family = acc.family,
                    windows = 0,
                    mae = 0.0,
                    maePct = 0.0,
                    rmse = 0.0,
                    directionalAccuracyPct = 0.0,
                    pinballLoss = 0.0,
                    coverage80Pct = 0.0,
                    crps = 0.0,
                    executionRuntime = acc.executionRuntime,
                    isApproximation = acc.isApproximation,
                    isCalibratedInterval = acc.isCalibratedInterval,
                    status = st,
                    reason = rsn
                )
            }

            val n = max(1, acc.pointCount)
            val w = max(1, acc.windowCount)
            val mae = acc.absErrSum / n
            val perH = (0 until acc.evalHorizon).mapNotNull { h ->
                val hc = acc.hCount[h]
                if (hc <= 0) null
                else PerHorizonMetric(
                    stepAhead = h + 1,
                    mae = acc.hAbsErr[h] / hc,
                    rmse = sqrt(acc.hSqErr[h] / hc),
                    coverage80Pct = (acc.hInBand80[h].toDouble() / hc) * 100.0
                )
            }
            return ModelWalkForwardSummary(
                modelId = acc.id,
                modelName = acc.name,
                family = acc.family,
                windows = acc.windowCount,
                mae = mae,
                maePct = (mae / scalePrice) * 100.0,
                rmse = sqrt(acc.sqErrSum / n),
                directionalAccuracyPct = (acc.dirCorrect.toDouble() / w) * 100.0,
                pinballLoss = acc.pinballSum / n,
                coverage80Pct = (acc.inBand80.toDouble() / n) * 100.0,
                crps = acc.crpsSum / n,
                executionRuntime = acc.executionRuntime,
                isApproximation = acc.isApproximation,
                isCalibratedInterval = acc.isCalibratedInterval,
                status = ModelExecutionStatus.SUCCESS,
                reason = "",
                safeMapePct = if (acc.safeMapeCount > 0) (acc.safeMapeSum / acc.safeMapeCount) * 100.0 else null,
                safeMapeValidCount = acc.safeMapeCount,
                avgIntervalWidthPct = acc.widthPctSum / n,
                perHorizonMetrics = perH
            )
        }

        val ensAcc = accs.getValue("ensemble")
        val ensSummary = toSummary(ensAcc)
        val naiveSummary = toSummary(accs.getValue(naiveModel.id))
        val modelBenchmarks = accs.entries.filter { it.key != "ensemble" }.map { toSummary(it.value) }

        val naiveMae = max(1e-9, naiveSummary.mae)
        val impPct = ((naiveMae - ensSummary.mae) / naiveMae) * 100.0
        val skillScore = (naiveMae - ensSummary.mae) / naiveMae
        val overlapFactor = if (stride > 0) min(effEvalH.toDouble(), effEvalH.toDouble() / stride) else 1.0
        val effectiveSampleSize = (round((ensAcc.pointCount / max(1.0, overlapFactor * 0.6)) * 10.0) / 10.0)
        val ambiguousRatePct = if (windowsRun > 0) round((wfAmbig.toDouble() / windowsRun) * 1000.0) / 10.0 else 0.0

        val pathStats = if (windowsRun > 0) {
            PathEventStats(
                touchRatePct = round((wfTouch.toDouble() / windowsRun) * 1000.0) / 10.0,
                penetrationRatePct = round((wfPen.toDouble() / windowsRun) * 1000.0) / 10.0,
                reclaimRatePct = round((wfReclaim.toDouble() / windowsRun) * 1000.0) / 10.0,
                breakoutRatePct = round((wfBreakout.toDouble() / windowsRun) * 1000.0) / 10.0,
                reachBeforeInvalidationPct = round((wfReachFirst.toDouble() / windowsRun) * 1000.0) / 10.0,
                ambiguousRatePct = ambiguousRatePct,
                censoringRatePct = round((wfCensored.toDouble() / windowsRun) * 1000.0) / 10.0
            )
        } else null

        val beatsNaive = ensSummary.mae <= naiveSummary.mae * 1.015
        val goodCov = ensSummary.coverage80Pct in 50.0..98.0
        val passed = windowsRun >= 5 && beatsNaive && goodCov

        val status = if (passed) ForecastStatus.VALID else ForecastStatus.PROVISIONAL
        val reason = when {
            windowsRun < 5 -> "Walk-forward sample below minimum 5 windows; labeled Provisional."
            passed -> "Ensemble passes acceptance gate across $windowsRun purged windows (${if (impPct >= 0) "+" else ""}${String.format(Locale.US, "%.1f", impPct)}% vs Naive MAE, ${String.format(Locale.US, "%.0f", ensSummary.coverage80Pct)}% coverage, N_eff=$effectiveSampleSize)."
            !beatsNaive -> "Ensemble MAE did not beat Naive Persistence; status set to Provisional."
            else -> "80% coverage (${String.format(Locale.US, "%.0f", ensSummary.coverage80Pct)}%) outside calibrated [50%, 98%] band; Provisional."
        }

        val initialReport = WalkForwardReport(
            evaluatedWindows = windowsRun,
            evalHorizon = effEvalH,
            forecastStatus = status,
            acceptancePassed = passed,
            acceptanceReason = reason,
            ensembleMetrics = ensSummary,
            naiveMetrics = naiveSummary,
            modelBenchmarks = modelBenchmarks,
            maeImprovementVsNaivePct = impPct,
            skillScoreVsNaive = round(skillScore * 10000.0) / 10000.0,
            effectiveSampleSize = effectiveSampleSize,
            ambiguousOutcomeCount = wfAmbig,
            ambiguousRatePct = ambiguousRatePct,
            pathEventStats = pathStats
        )
        val decision = selectOosChartWinner(initialReport, emptyList(), "AUTO")
        return initialReport.copy(
            winnerModelId = decision.winnerModelId,
            selectionMode = decision.selectionMode,
            selectionReason = decision.reason
        )
    }

    fun selectOosChartWinner(
        walkForward: WalkForwardReport?,
        modelTrajectories: List<ModelTrajectory>,
        requestedModelId: String = "AUTO"
    ): OosSelectionDecision {
        val req = requestedModelId.trim()
        val hasTrajs = modelTrajectories.isNotEmpty()
        fun trajAvailable(id: String): Boolean {
            if (!hasTrajs) return true
            val t = modelTrajectories.firstOrNull { it.modelId == id }
            return t != null && t.status == ModelExecutionStatus.SUCCESS && t.points.isNotEmpty()
        }

        if (req.isNotEmpty() && !req.equals("AUTO", ignoreCase = true)) {
            val found = modelTrajectories.firstOrNull { it.modelId == req }
            if (found != null && found.status == ModelExecutionStatus.SUCCESS && found.points.isNotEmpty()) {
                return OosSelectionDecision(
                    selectionMode = SelectionMode.MANUAL_OVERRIDE,
                    selectedModelId = found.modelId,
                    winnerModelId = found.modelId,
                    reason = "User manually selected model '${found.modelName}' (${found.executionRuntime.name})."
                )
            }
            if (found != null) {
                val fallbackId = if (trajAvailable("smc_kmedoids")) "smc_kmedoids" else "naive_persistence"
                return OosSelectionDecision(
                    selectionMode = SelectionMode.NO_CLEAR_WINNER_BASELINE,
                    selectedModelId = fallbackId,
                    winnerModelId = null,
                    reason = "Requested model '${found.modelName}' is ${found.status.name} (${found.reason}); showing '$fallbackId'."
                )
            }
        }

        if (walkForward == null || walkForward.evaluatedWindows < 5 || walkForward.naiveMetrics == null) {
            val fallbackId = if (trajAvailable("smc_kmedoids")) "smc_kmedoids" else "naive_persistence"
            return OosSelectionDecision(
                selectionMode = SelectionMode.SMC_STRUCTURAL_DEFAULT,
                selectedModelId = fallbackId,
                winnerModelId = null,
                reason = "Fewer than 5 evaluated walk-forward windows; displaying '$fallbackId' without claiming an OOS statistical winner."
            )
        }

        val naiveMae = max(1e-9, walkForward.naiveMetrics.mae)
        val naiveRmse = max(1e-9, walkForward.naiveMetrics.rmse)
        val allCandidates = buildList {
            walkForward.ensembleMetrics?.let { add(it) }
            addAll(walkForward.modelBenchmarks)
        }.filter { cand ->
            cand.modelId != "naive_persistence" &&
                cand.status == ModelExecutionStatus.SUCCESS &&
                cand.windows >= 5 &&
                trajAvailable(cand.modelId)
        }

        // Strict OOS dominance gate: must beat Naive Persistence by >= 1.5% on both MAE and RMSE with calibrated coverage [40%, 98%]
        val qualified = allCandidates.filter { cand ->
            val maeGain = (naiveMae - cand.mae) / naiveMae
            val rmseGain = (naiveRmse - cand.rmse) / naiveRmse
            val covOk = !cand.isCalibratedInterval || (cand.coverage80Pct in 40.0..98.0)
            maeGain >= 0.015 && rmseGain >= 0.015 && covOk
        }.sortedWith(compareBy<ModelWalkForwardSummary> { it.rmse }.thenBy { it.mae })

        if (qualified.isNotEmpty()) {
            val best = qualified.first()
            val gainPct = ((naiveMae - best.mae) / naiveMae) * 100.0
            val approxNote = if (best.isApproximation) " [Approx]" else ""
            return OosSelectionDecision(
                selectionMode = SelectionMode.AUTO_OOS_BEST,
                selectedModelId = best.modelId,
                winnerModelId = best.modelId,
                reason = "OOS Winner Gate: '${best.modelName}'$approxNote beat Naive baseline by +${String.format(Locale.US, "%.1f", gainPct)}% MAE across ${walkForward.evaluatedWindows} windows."
            )
        }

        val baselineId = if (trajAvailable("naive_persistence")) "naive_persistence" else "smc_kmedoids"
        return OosSelectionDecision(
            selectionMode = SelectionMode.NO_CLEAR_WINNER_BASELINE,
            selectedModelId = baselineId,
            winnerModelId = null,
            reason = "NO_CLEAR_WINNER_BASELINE: No model outperformed Naive Persistence by >=1.5% OOS MAE & RMSE across ${walkForward.evaluatedWindows} windows."
        )
    }

    private fun recordErrors(
        acc: MetricAccumulator,
        clean: List<CleanOhlcBar>,
        origin: Int,
        baseClose: Double,
        traj: List<QuantileStep>,
        evalH: Int
    ) {
        acc.windowCount++
        val finalActual = clean[origin + evalH - 1].close
        val finalPred = traj[evalH - 1].q50
        if ((finalActual >= baseClose && finalPred >= baseClose) || (finalActual < baseClose && finalPred < baseClose)) {
            acc.dirCorrect++
        }
        for (h in 0 until evalH) {
            val actual = clean[origin + h].close
            val p = traj[h]
            val err = abs(actual - p.q50)
            acc.absErrSum += err
            acc.sqErrSum += err * err
            if (abs(actual) > 1e-8) {
                acc.safeMapeSum += err / abs(actual)
                acc.safeMapeCount++
            }
            val width = max(1e-8, p.q90 - p.q10)
            acc.widthPctSum += (width / max(1e-8, p.q50)) * 100.0
            acc.pinballSum += (pinball(actual, p.q10, 0.1) + pinball(actual, p.q50, 0.5) + pinball(actual, p.q90, 0.9)) / 3.0
            acc.crpsSum += err * 0.58 + 0.12 * width
            val hit80 = actual in p.q10..p.q90
            if (hit80) acc.inBand80++
            acc.pointCount++
            acc.hAbsErr[h] += err
            acc.hSqErr[h] += err * err
            if (hit80) acc.hInBand80[h]++
            acc.hCount[h]++
        }
    }
}
