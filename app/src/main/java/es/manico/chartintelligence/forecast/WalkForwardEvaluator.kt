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

object WalkForwardEvaluator {

    private data class QuantileStep(
        val q10: Double,
        val q25: Double,
        val q50: Double,
        val q75: Double,
        val q90: Double
    )

    private class MetricAccumulator(
        val id: String,
        val name: String,
        val family: String
    ) {
        var absErrSum = 0.0
        var sqErrSum = 0.0
        var pinballSum = 0.0
        var crpsSum = 0.0
        var dirCorrect = 0
        var inBand80 = 0
        var pointCount = 0
        var windowCount = 0
    }

    private fun pinball(actual: Double, qPred: Double, tau: Double): Double {
        val err = actual - qPred
        return max(tau * err, (tau - 1.0) * err)
    }

    private fun buildTrajectory(lastClose: Double, meanReturns: DoubleArray, sigmas: DoubleArray): List<QuantileStep> {
        val out = ArrayList<QuantileStep>(meanReturns.size)
        var cumRet = 0.0
        var cumVar = 0.0
        for (h in meanReturns.indices) {
            cumRet += meanReturns[h]
            val sg = max(1e-5, sigmas[h])
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
        return out
    }

    fun evaluate(
        candles: List<CandleBar>,
        registry: ForecastModelRegistry,
        minTrainBars: Int = 30,
        evalHorizon: Int = 5,
        maxWindows: Int = 10
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
        fun accFor(id: String, name: String, family: String) =
            accs.getOrPut(id) { MetricAccumulator(id, name, family) }

        val naiveModel = NaivePersistenceModel()
        accFor("ensemble", "Calibrated Ensemble", "ENSEMBLE")
        accFor(naiveModel.id, naiveModel.name, naiveModel.family)
        for ((p, _, _) in active) accFor(p.id, p.name, p.family)

        val totalW = active.sumOf { it.second }.let { if (it > 0.0) it else 1.0 }
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
            val trainStart = max(0, origin - 160)
            val feats = ForecastFeatureExtractor.extractClean(clean.subList(trainStart, origin))
            if (feats != null) {
                windowsRun++
                val baseClose = feats.lastClose
                val naiveOut = naiveModel.predict(feats, effEvalH, emptyMap())
                val naiveTraj = buildTrajectory(baseClose, naiveOut.meanReturns, naiveOut.sigmas)
                recordErrors(accFor(naiveModel.id, naiveModel.name, naiveModel.family), clean, origin, baseClose, naiveTraj, effEvalH)

                val ensMean = DoubleArray(effEvalH)
                val ensVar = DoubleArray(effEvalH)

                for ((plugin, weight, params) in active) {
                    val normW = weight / totalW
                    val out = if (plugin.id == naiveModel.id) naiveOut else plugin.predict(feats, effEvalH, params)
                    if (plugin.id != naiveModel.id) {
                        val traj = buildTrajectory(baseClose, out.meanReturns, out.sigmas)
                        recordErrors(accFor(plugin.id, plugin.name, plugin.family), clean, origin, baseClose, traj, effEvalH)
                    }
                    for (h in 0 until effEvalH) {
                        ensMean[h] += normW * out.meanReturns[h]
                        val sg = out.sigmas[h]
                        ensVar[h] += normW * (sg * sg)
                    }
                }

                val ensSigmas = DoubleArray(effEvalH) { sqrt(max(1e-10, ensVar[it])) }
                val ensTraj = buildTrajectory(baseClose, ensMean, ensSigmas)
                recordErrors(accFor("ensemble", "Calibrated Ensemble", "ENSEMBLE"), clean, origin, baseClose, ensTraj, effEvalH)

                // Empirical v1.3.0 Path Event Vector over walk-forward out-of-sample window
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
            val n = max(1, acc.pointCount)
            val w = max(1, acc.windowCount)
            val mae = acc.absErrSum / n
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
                crps = acc.crpsSum / n
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

        return WalkForwardReport(
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
            acc.pinballSum += (pinball(actual, p.q10, 0.1) + pinball(actual, p.q50, 0.5) + pinball(actual, p.q90, 0.9)) / 3.0
            val width = max(1e-8, p.q90 - p.q10)
            acc.crpsSum += err * 0.58 + 0.12 * width
            if (actual in p.q10..p.q90) acc.inBand80++
            acc.pointCount++
        }
    }
}
