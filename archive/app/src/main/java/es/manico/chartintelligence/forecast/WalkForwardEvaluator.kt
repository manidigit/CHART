package es.manico.chartintelligence.forecast

import es.manico.chartintelligence.data.model.CandleBar
import java.util.Locale
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

data class OosSelectionDecision(
    val selectionMode: SelectionMode,
    val selectedModelId: String,
    val winnerModelId: String?,
    val reason: String
)

data class DisjointNestedSplits(
    val feasible: Boolean,
    val statisticallyFull: Boolean,
    val req: HorizonRequirements,
    val trainEndIdx: Int,
    val valOrigins: List<Int>,
    val calOrigins: List<Int>,
    val outerOrigins: List<Int>
)

object WalkForwardEvaluator {

    internal data class QuantileStep(
        val q10: Double,
        val q25: Double,
        val q50: Double,
        val q75: Double,
        val q90: Double
    )

    private data class WindowScore(
        val maeMean: Double,
        val mseMean: Double,
        val wisMean: Double,
        val pinballMean: Double,
        val in80Frac: Double,
        val in50Frac: Double,
        val widthPctMean: Double,
        val dirOk: Boolean
    )

    private class MetricAccumulator(
        val id: String,
        val name: String,
        val family: String,
        val experimentalOnly: Boolean = false
    ) {
        var maeSum = 0.0
        var mseSum = 0.0
        var wisSum = 0.0
        var pinballSum = 0.0
        var in80Sum = 0.0
        var in50Sum = 0.0
        var widthPctSum = 0.0
        var dirCount = 0
        var windows = 0
        var failedCount = 0
        var lastFailReason = ""
        val wisSeries = ArrayList<Double>()
        val errSeries = ArrayList<Double>()
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
                    lastClose * exp(cumRet - 1.28155157 * cumSig),
                    lastClose * exp(cumRet - 0.67448975 * cumSig),
                    lastClose * exp(cumRet),
                    lastClose * exp(cumRet + 0.67448975 * cumSig),
                    lastClose * exp(cumRet + 1.28155157 * cumSig),
                    lastClose * 0.01
                )
                out.add(QuantileStep(mq[0], mq[1], mq[2], mq[3], mq[4]))
            }
        }
        return out
    }

    /**
     * Exact closed-form 4-way disjoint nested walk-forward splits:
     *   Train [0..trainEndIdx] -> Gap(H+E) -> Val -> Gap(H+E) -> Cal -> Gap(H+E) -> Outer (stride=H)
     */
    fun buildDisjointNestedSplits(totalBars: Int, horizonBars: Int): DisjointNestedSplits {
        val h = ForecastCalendarHelper.clampHorizonBars(horizonBars)
        val req = ForecastCalendarHelper.computeHorizonRequirements(h)
        val n = totalBars
        val g = req.gapTotal

        if (n < req.nOpMin) {
            return DisjointNestedSplits(false, false, req, -1, emptyList(), emptyList(), emptyList())
        }

        var kOuter = 30
        var kVal = 10
        var mCal = 20

        if (n < req.nStatMin) {
            kVal = 5
            mCal = 10
            val prefixOp = req.lTrain + g + ((kVal - 1) * req.sVal + 1) + g + ((mCal - 1) * req.sCal + 1) + 1
            val availOuterBars = n - prefixOp - g
            kOuter = max(1, min(29, floor(availOuterBars.toDouble() / h.toDouble()).toInt()))
        }

        val lastOuter = n - 1 - h
        val outerOrigins = ArrayList<Int>(kOuter)
        for (k in (kOuter - 1) downTo 0) {
            outerOrigins.add(lastOuter - k * h)
        }
        val firstOuter = outerOrigins.first()

        val lastCal = firstOuter - 1 - g
        val calOrigins = ArrayList<Int>(mCal)
        for (m in (mCal - 1) downTo 0) {
            calOrigins.add(lastCal - m * req.sCal)
        }
        val firstCal = calOrigins.first()

        val lastVal = firstCal - 1 - g
        val valOrigins = ArrayList<Int>(kVal)
        for (v in (kVal - 1) downTo 0) {
            valOrigins.add(lastVal - v * req.sVal)
        }
        val firstVal = valOrigins.first()

        val trainEndIdx = firstVal - 1 - g
        val feasible = trainEndIdx + 1 >= req.lTrain && valOrigins.size >= 5 && calOrigins.size >= 10 && outerOrigins.isNotEmpty()
        val statFull = n >= req.nStatMin && outerOrigins.size >= 30 && calOrigins.size >= 20

        return DisjointNestedSplits(
            feasible = feasible,
            statisticallyFull = statFull,
            req = req,
            trainEndIdx = trainEndIdx,
            valOrigins = valOrigins,
            calOrigins = calOrigins,
            outerOrigins = outerOrigins
        )
    }

    private fun buildNaiveLogNormalTraj(anchorClose: Double, trainLogReturns: DoubleArray, horizon: Int): List<QuantileStep> {
        val sigmaRw = ForecastStatisticalTests.computeNaiveSigmaRw(trainLogReturns)
        return List(horizon) { step ->
            val q = ForecastStatisticalTests.buildZeroDriftLogNormalNaiveQuantiles(anchorClose, sigmaRw, step + 1)
            QuantileStep(q.q10, q.q25, q.q50, q.q75, q.q90)
        }
    }

    private fun applyConformalToStep(
        q: QuantileStep,
        anchorClose: Double,
        ewmaSigma: Double,
        stepH: Int,
        conformal: ForecastStatisticalTests.ConformalCalibrationState?
    ): QuantileStep {
        val qt = ForecastStatisticalTests.QuantileTuple(q.q10, q.q25, q.q50, q.q75, q.q90)
        val adj = ForecastStatisticalTests.applyConformalAdjustmentToQuantiles(qt, anchorClose, ewmaSigma, stepH, conformal, anchorClose * 0.01)
        return QuantileStep(adj.q10, adj.q25, adj.q50, adj.q75, adj.q90)
    }

    private fun scoreWindow(clean: List<CleanOhlcBar>, originIdx: Int, traj: List<QuantileStep>, horizon: Int): WindowScore {
        var maeSum = 0.0
        var sqErrSum = 0.0
        var wisSum = 0.0
        var pinballSum = 0.0
        var in80 = 0
        var in50 = 0
        var widthPctSum = 0.0
        val baseClose = clean[originIdx].close
        for (h in 0 until horizon) {
            val actual = clean[originIdx + 1 + h].close
            val q = traj[h]
            val err = abs(actual - q.q50)
            maeSum += err
            sqErrSum += err * err
            val qt = ForecastStatisticalTests.QuantileTuple(q.q10, q.q25, q.q50, q.q75, q.q90)
            wisSum += ForecastStatisticalTests.computeWis5Q(actual, qt)
            val pb = (ForecastStatisticalTests.pinballLoss(actual, q.q10, 0.1) +
                ForecastStatisticalTests.pinballLoss(actual, q.q50, 0.5) +
                ForecastStatisticalTests.pinballLoss(actual, q.q90, 0.9)) / 3.0
            pinballSum += pb
            if (actual >= q.q10 && actual <= q.q90) in80++
            if (actual >= q.q25 && actual <= q.q75) in50++
            widthPctSum += max(1e-8, q.q90 - q.q10) / max(1e-8, actual)
        }
        val finalAct = clean[originIdx + horizon].close
        val finalPred = traj[horizon - 1].q50
        val dirOk = (finalAct >= baseClose && finalPred >= baseClose) || (finalAct < baseClose && finalPred < baseClose)
        val hD = horizon.toDouble()
        return WindowScore(
            maeMean = maeSum / hD,
            mseMean = sqErrSum / hD,
            wisMean = wisSum / hD,
            pinballMean = pinballSum / hD,
            in80Frac = in80.toDouble() / hD,
            in50Frac = in50.toDouble() / hD,
            widthPctMean = widthPctSum / hD,
            dirOk = dirOk
        )
    }

    internal fun evaluate(
        candles: List<CandleBar>,
        registry: ForecastModelRegistry,
        horizonBars: Int = 30,
        excludeExperimental: Boolean = true,
        allowExperimentalInEnsemble: Boolean = false,
        skipBootstrap: Boolean = false,
        bootstrapB: Int = 1000
    ): WalkForwardReport {
        val clean = candles.mapNotNull { c ->
            val o = c.open.toDouble()
            val h = c.high.toDouble()
            val l = c.low.toDouble()
            val cl = c.close.toDouble()
            if (o.isFinite() && h.isFinite() && l.isFinite() && cl.isFinite() && cl > 0.0 && h >= l) {
                CleanOhlcBar(o, h, l, cl, max(0.0, c.volume.toDouble()), c.openTimeUtcMillis)
            } else null
        }
        return evaluateClean(
            clean = clean,
            registry = registry,
            horizonBars = horizonBars,
            excludeExperimental = excludeExperimental,
            allowExperimentalInEnsemble = allowExperimentalInEnsemble,
            skipBootstrap = skipBootstrap,
            bootstrapB = bootstrapB
        )
    }

    internal fun evaluateClean(
        clean: List<CleanOhlcBar>,
        registry: ForecastModelRegistry,
        horizonBars: Int = 30,
        excludeExperimental: Boolean = true,
        allowExperimentalInEnsemble: Boolean = false,
        skipBootstrap: Boolean = false,
        bootstrapB: Int = 1000
    ): WalkForwardReport {
        val horizon = ForecastCalendarHelper.clampHorizonBars(horizonBars)
        val split = buildDisjointNestedSplits(clean.size, horizon)
        val active = registry.getEnabled()

        if (!split.feasible || active.isEmpty()) {
            val status = if (clean.size >= split.req.nOpMin) ForecastStatus.INSUFFICIENT_EVIDENCE else ForecastStatus.DATA_NOT_READY
            val reason = if (!split.feasible) {
                "Need >= ${split.req.nOpMin} bars for nested split at H=$horizon (stat min ${split.req.nStatMin}, have ${clean.size})"
            } else {
                "No active forecast plugins enabled"
            }
            return WalkForwardReport(
                evaluatedWindows = 0,
                evalHorizon = horizon,
                outerStrideBars = horizon,
                acceptancePassed = false,
                forecastStatus = status,
                acceptanceReason = reason,
                ensembleMetrics = null,
                naiveMetrics = null,
                modelBenchmarks = emptyList(),
                conformalCalibration = ForecastStatisticalTests.fitVolatilityNormalizedConformal(DoubleArray(0), 0.20, 0.92),
                splits = mapOf("trainBars" to 0, "valWindows" to 0, "calWindows" to 0, "outerWindows" to 0)
            )
        }

        // MASE denominator strictly from Train[0..trainEndIdx]
        var inSampleDiffSum = 0.0
        for (i in 1..split.trainEndIdx) {
            inSampleDiffSum += abs(clean[i].close - clean[i - 1].close)
        }
        val maseDenom = max(1e-9, inSampleDiffSum / max(1, split.trainEndIdx).toDouble())

        val valModels = active.filter { (p, _, _) ->
            !(excludeExperimental && (p.experimentalOnly || p.isApproximation))
        }

        // Stage 2: Validation only (model selection & weight freezing)
        val valWisSum = HashMap<String, Double>()
        val valCount = HashMap<String, Int>()
        var naiveValWisSum = 0.0

        for (origin in split.valOrigins) {
            val slice = clean.subList(0, origin + 1)
            val feats = ForecastFeatureExtractor.extractClean(if (slice.size > 260) slice.takeLast(260) else slice) ?: continue
            val naiveTraj = buildNaiveLogNormalTraj(feats.lastClose, feats.logReturns, horizon)
            val naiveWin = scoreWindow(clean, origin, naiveTraj, horizon)
            naiveValWisSum += naiveWin.wisMean

            for ((plugin, _, params) in valModels) {
                if (plugin.id == "naive_persistence") continue
                val pred = try {
                    plugin.predict(feats, horizon, params)
                } catch (_: Throwable) {
                    null
                }
                if (pred != null && pred.status == ModelExecutionStatus.SUCCESS && pred.meanReturns.size >= horizon) {
                    val traj = buildTrajectory(feats.lastClose, pred.meanReturns, pred.sigmas, pred.directQuantiles, horizon)
                    val finite = traj.all { it.q10.isFinite() && it.q50.isFinite() && it.q90.isFinite() }
                    if (finite) {
                        val w = scoreWindow(clean, origin, traj, horizon)
                        valWisSum[plugin.id] = (valWisSum[plugin.id] ?: 0.0) + w.wisMean
                        valCount[plugin.id] = (valCount[plugin.id] ?: 0) + 1
                    }
                }
            }
        }

        val eta = 2.5
        val avgNaiveValWis = max(1e-9, naiveValWisSum / max(1, split.valOrigins.size).toDouble())
        val frozenWeights = LinkedHashMap<String, Double>()
        var rawWeightSum = 0.0

        for ((plugin, weight, _) in valModels) {
            if (plugin.id == "naive_persistence") continue
            val cnt = valCount[plugin.id] ?: 0
            if (cnt == 0) continue
            if ((plugin.experimentalOnly || plugin.isApproximation) && !allowExperimentalInEnsemble) continue
            val avgWis = (valWisSum[plugin.id] ?: 0.0) / cnt.toDouble()
            val ratio = avgWis / avgNaiveValWis
            val w = if (ratio <= 1.05) exp(-eta * ratio) * max(0.05, weight) else 0.0
            if (w > 0.0) {
                frozenWeights[plugin.id] = w
                rawWeightSum += w
            }
        }
        if (rawWeightSum <= 0.0) {
            for ((plugin, weight, _) in valModels) {
                if (plugin.id == "naive_persistence") continue
                if ((plugin.experimentalOnly || plugin.isApproximation) && !allowExperimentalInEnsemble) continue
                val w = max(0.05, weight)
                frozenWeights[plugin.id] = w
                rawWeightSum += w
            }
        }
        val safeW = max(1e-9, rawWeightSum)
        frozenWeights.keys.forEach { id -> frozenWeights[id] = (frozenWeights[id] ?: 0.0) / safeW }

        fun runEnsembleAtOrigin(feats: ExtractedForecastFeatures, includeZeroWeight: Boolean): Pair<List<QuantileStep>, Map<String, Pair<PluginPrediction?, List<QuantileStep>?>>> {
            val ensMean = DoubleArray(horizon)
            val ensVar = DoubleArray(horizon)
            var wUsed = 0.0
            val outputs = LinkedHashMap<String, Pair<PluginPrediction?, List<QuantileStep>?>>()

            for ((plugin, _, params) in valModels) {
                if (plugin.id == "naive_persistence") continue
                val w = frozenWeights[plugin.id] ?: 0.0
                if (!includeZeroWeight && w <= 0.0) continue
                val pred = try {
                    plugin.predict(feats, horizon, params)
                } catch (t: Throwable) {
                    PluginPrediction(
                        modelId = plugin.id,
                        meanReturns = DoubleArray(0),
                        sigmas = DoubleArray(0),
                        status = ModelExecutionStatus.FAILED,
                        reason = t.message ?: "Model execution error",
                        isApproximation = plugin.isApproximation,
                        isCalibratedInterval = plugin.isCalibratedInterval,
                        modelVersion = plugin.modelVersion
                    )
                }
                if (pred != null && pred.status == ModelExecutionStatus.SUCCESS && pred.meanReturns.size >= horizon) {
                    val traj = buildTrajectory(feats.lastClose, pred.meanReturns, pred.sigmas, pred.directQuantiles, horizon)
                    if (traj.all { it.q10.isFinite() && it.q50.isFinite() && it.q90.isFinite() }) {
                        outputs[plugin.id] = Pair(pred, traj)
                        if (w > 0.0) {
                            wUsed += w
                            for (h in 0 until horizon) {
                                ensMean[h] += w * pred.meanReturns.getOrElse(h) { 0.0 }
                                val sg = max(1e-5, pred.sigmas.getOrElse(h) { feats.ewmaSigma })
                                ensVar[h] += w * sg * sg
                            }
                        }
                        continue
                    }
                }
                outputs[plugin.id] = Pair(pred, null)
            }
            if (wUsed > 0.0) {
                for (h in 0 until horizon) {
                    ensMean[h] /= wUsed
                    ensVar[h] /= wUsed
                }
            } else {
                val nSig = ForecastStatisticalTests.computeNaiveSigmaRw(feats.logReturns)
                for (h in 0 until horizon) ensVar[h] = nSig * nSig
            }
            val ensSigmas = DoubleArray(horizon) { sqrt(max(1e-10, ensVar[it])) }
            return Pair(buildTrajectory(feats.lastClose, ensMean, ensSigmas, null, horizon), outputs)
        }

        // Stage 3: Conformal Calibration Only
        val calScores = ArrayList<Double>(split.calOrigins.size)
        for (origin in split.calOrigins) {
            val slice = clean.subList(0, origin + 1)
            val feats = ForecastFeatureExtractor.extractClean(if (slice.size > 260) slice.takeLast(260) else slice) ?: continue
            val (ensTraj, _) = runEnsembleAtOrigin(feats, false)
            var normSum = 0.0
            for (h in 0 until horizon) {
                val actualY = clean[origin + 1 + h].close
                val q = ensTraj[h]
                val rawMiss = max(max(q.q10 - actualY, actualY - q.q90), 0.0)
                val denom = max(1e-8, feats.lastClose * feats.ewmaSigma * sqrt((h + 1).toDouble()))
                normSum += rawMiss / denom
            }
            calScores.add(normSum / horizon.toDouble())
        }
        val conformalCal = ForecastStatisticalTests.fitVolatilityNormalizedConformal(calScores.toDoubleArray(), 0.20, 0.92)

        // Stage 4: Frozen Outer Evaluation Only (stride = H)
        val accs = LinkedHashMap<String, MetricAccumulator>()
        fun accFor(id: String, name: String, family: String, expOnly: Boolean = false) =
            accs.getOrPut(id) { MetricAccumulator(id, name, family, expOnly) }

        val naivePlugin = NaivePersistenceModel()
        accFor("ensemble", "Calibrated Ensemble (V2)", "ENSEMBLE", false)
        accFor(naivePlugin.id, naivePlugin.name, naivePlugin.family, false)
        for ((p, _, _) in valModels) {
            accFor(p.id, p.name, p.family, p.experimentalOnly || p.isApproximation)
        }

        for (origin in split.outerOrigins) {
            val slice = clean.subList(0, origin + 1)
            val feats = ForecastFeatureExtractor.extractClean(if (slice.size > 260) slice.takeLast(260) else slice) ?: continue

            val naiveTraj = buildNaiveLogNormalTraj(feats.lastClose, feats.logReturns, horizon)
            val naiveWin = scoreWindow(clean, origin, naiveTraj, horizon)
            recordAcc(accFor(naivePlugin.id, naivePlugin.name, naivePlugin.family), naiveWin, clean[origin + horizon].close - naiveTraj.last().q50)

            val (ensTraj, outputs) = runEnsembleAtOrigin(feats, true)
            val calEnsTraj = ensTraj.mapIndexed { idx, q -> applyConformalToStep(q, feats.lastClose, feats.ewmaSigma, idx + 1, conformalCal) }
            val ensWin = scoreWindow(clean, origin, calEnsTraj, horizon)
            recordAcc(accFor("ensemble", "Calibrated Ensemble (V2)", "ENSEMBLE"), ensWin, clean[origin + horizon].close - calEnsTraj.last().q50)

            for ((p, _, _) in valModels) {
                if (p.id == "naive_persistence") continue
                val pair = outputs[p.id]
                val traj = pair?.second
                if (traj == null) {
                    val pred = pair?.first
                    if (pred != null && pred.status == ModelExecutionStatus.FAILED) {
                        val a = accFor(p.id, p.name, p.family)
                        a.failedCount++
                        if (pred.reason.isNotBlank()) a.lastFailReason = pred.reason
                    }
                    continue
                }
                val calTraj = traj.mapIndexed { idx, q -> applyConformalToStep(q, feats.lastClose, feats.ewmaSigma, idx + 1, conformalCal) }
                val w = scoreWindow(clean, origin, calTraj, horizon)
                recordAcc(accFor(p.id, p.name, p.family), w, clean[origin + horizon].close - calTraj.last().q50)
            }
        }

        val lastPrice = max(1e-6, clean.last().close)
        val naiveAcc = accs["naive_persistence"]!!
        val naiveMae = max(1e-9, naiveAcc.maeSum / max(1, naiveAcc.windows).toDouble())
        val naiveWis = max(1e-9, naiveAcc.wisSum / max(1, naiveAcc.windows).toDouble())

        fun finalizeAcc(acc: MetricAccumulator): ModelWalkForwardSummary {
            val k = acc.windows
            val ok = k > 0
            val mae = if (ok) acc.maeSum / k.toDouble() else 0.0
            val rmse = if (ok) sqrt(acc.mseSum / k.toDouble()) else 0.0
            val wis = if (ok) acc.wisSum / k.toDouble() else 0.0
            val cov80 = if (ok) (acc.in80Sum / k.toDouble()) * 100.0 else 0.0
            val cov50 = if (ok) (acc.in50Sum / k.toDouble()) * 100.0 else 0.0
            val dSeries = if (ok && acc.id != "naive_persistence" && naiveAcc.wisSeries.size == k) {
                DoubleArray(k) { i -> acc.wisSeries[i] - naiveAcc.wisSeries[i] }
            } else DoubleArray(0)
            val dm = if (dSeries.size >= 5) ForecastStatisticalTests.hlnModifiedDieboldMariano(dSeries, 1)
            else ForecastStatisticalTests.DieboldMarianoResult(0.0, 1.0, 0.0, 0, 0.0)
            val boot = if (dSeries.size >= 5 && !skipBootstrap) {
                ForecastStatisticalTests.centeredStationaryBlockBootstrap(dSeries, bootstrapB, 4, 133742)
            } else ForecastStatisticalTests.BootstrapResult(1.0, bootstrapB, 4)

            val nEff = ForecastStatisticalTests.computeBartlettEffectiveSampleSize(acc.errSeries.toDoubleArray(), horizon)
            return ModelWalkForwardSummary(
                modelId = acc.id,
                modelName = acc.name,
                family = acc.family,
                experimentalOnly = acc.experimentalOnly,
                windows = k,
                evaluatedWindows = k,
                status = when {
                    ok -> ModelExecutionStatus.SUCCESS
                    acc.failedCount > 0 -> ModelExecutionStatus.FAILED
                    else -> ModelExecutionStatus.SKIPPED_LOW_DATA
                },
                reason = when {
                    ok -> ""
                    acc.failedCount > 0 -> acc.lastFailReason.ifBlank { "Model execution failed during OOS walk-forward" }
                    else -> "No valid outer windows"
                },
                mae = mae,
                maePct = (mae / lastPrice) * 100.0,
                rmse = rmse,
                rMae = if (ok) mae / naiveMae else 1.0,
                mase = if (ok) mae / maseDenom else 1.0,
                wis = wis,
                pinballLoss = if (ok) acc.pinballSum / k.toDouble() else 0.0,
                coverage80Pct = cov80,
                coverage50Pct = cov50,
                avgIntervalWidthPct = if (ok) (acc.widthPctSum / k.toDouble()) * 100.0 else 0.0,
                directionalAccuracyPct = if (ok) (acc.dirCount.toDouble() / k.toDouble()) * 100.0 else 0.0,
                skillVsNaivePct = if (ok) ((naiveMae - mae) / naiveMae) * 100.0 else 0.0,
                dmStat = (dm.stat * 10000.0).roundToInt() / 10000.0,
                dmPValue = (dm.pValue * 100000.0).roundToInt() / 100000.0,
                bootPValue = (boot.pValue * 100000.0).roundToInt() / 100000.0,
                nEff = nEff
            )
        }

        val ensembleMetrics = finalizeAcc(accs["ensemble"]!!)
        val naiveMetrics = finalizeAcc(naiveAcc)
        val modelBenchmarks = accs.entries.filter { it.key != "ensemble" }.map { finalizeAcc(it.value) }

        val eligibleCandidates = (listOf(ensembleMetrics) + modelBenchmarks).filter { m ->
            m.modelId != "naive_persistence" && !m.experimentalOnly &&
                m.status == ModelExecutionStatus.SUCCESS && m.windows >= 30
        }
        val passingCandidates = if (conformalCal.calibrationStatus == "CALIBRATED_NORMALIZED") {
            eligibleCandidates.filter { m ->
                m.nEff >= 25.0 && m.rMae < 1.0 && m.wis < naiveWis &&
                    m.coverage80Pct in 72.0..88.0 && m.dmPValue <= 0.05 && m.bootPValue <= 0.10
            }
        } else emptyList()

        val pool = if (passingCandidates.isNotEmpty()) passingCandidates else eligibleCandidates
        val bestCandidate = pool.minWithOrNull(compareBy<ModelWalkForwardSummary> { it.wis }.thenBy { it.mae }) ?: ensembleMetrics
        val evalRef = if (passingCandidates.isNotEmpty()) bestCandidate
        else if (bestCandidate.wis < ensembleMetrics.wis) bestCandidate else ensembleMetrics

        val evaluatedWindows = evalRef.windows
        val effectiveSampleSize = (evalRef.nEff * 100.0).roundToInt() / 100.0
        val relativeMaeVsNaive = (evalRef.rMae * 10000.0).roundToInt() / 10000.0
        val mase = (evalRef.mase * 10000.0).roundToInt() / 10000.0
        val wisModel = (evalRef.wis * 1000000.0).roundToInt() / 1000000.0
        val wisNaiveDist = (naiveWis * 1000000.0).roundToInt() / 1000000.0
        val cov80Pct = (evalRef.coverage80Pct * 100.0).roundToInt() / 100.0
        val cov50Pct = (evalRef.coverage50Pct * 100.0).roundToInt() / 100.0
        val dmStat = evalRef.dmStat
        val dmPValue = evalRef.dmPValue
        val bootPValue = evalRef.bootPValue

        val enoughSamples = evaluatedWindows >= 30 && effectiveSampleSize >= 25.0 &&
            conformalCal.calibrationStatus == "CALIBRATED_NORMALIZED"
        val rMaePassed = relativeMaeVsNaive < 1.0
        val wisPassed = wisModel < wisNaiveDist
        val covPassed = cov80Pct in 72.0..88.0
        val dmPassed = dmPValue <= 0.05
        val bootPassed = bootPValue <= 0.10
        val acceptancePassed = enoughSamples && rMaePassed && wisPassed && covPassed && dmPassed && bootPassed

        val forecastStatus: ForecastStatus
        val acceptanceReason: String
        if (!enoughSamples) {
            forecastStatus = ForecastStatus.INSUFFICIENT_EVIDENCE
            acceptanceReason = "INSUFFICIENT_EVIDENCE: K_outer=$evaluatedWindows (need>=30), N_eff=$effectiveSampleSize (need>=25.0), Conformal=${conformalCal.calibrationStatus}"
        } else if (!acceptancePassed) {
            forecastStatus = ForecastStatus.NO_EDGE
            val fails = ArrayList<String>()
            if (!rMaePassed) fails.add("rMAE=${String.format(Locale.US, "%.4f", relativeMaeVsNaive)} >= 1.0")
            if (!wisPassed) fails.add("WIS=${String.format(Locale.US, "%.4f", wisModel)} >= Naive=${String.format(Locale.US, "%.4f", wisNaiveDist)}")
            if (!covPassed) fails.add("Cov80=${String.format(Locale.US, "%.1f", cov80Pct)}% outside [72%, 88%]")
            if (!dmPassed) fails.add("HLN-DM p=${String.format(Locale.US, "%.4f", dmPValue)} > 0.05")
            if (!bootPassed) fails.add("Bootstrap p=${String.format(Locale.US, "%.4f", bootPValue)} > 0.10")
            acceptanceReason = "NO_EDGE on Outer OOS ($evaluatedWindows windows): ${fails.joinToString("; ")}"
        } else {
            forecastStatus = ForecastStatus.VALID
            acceptanceReason = "All V2.1 outer OOS statistical, WIS, coverage ([72%,88%]), and HLN-DM + Bootstrap gates passed (model=${evalRef.modelId}, p_DM=$dmPValue, p_boot=$bootPValue)"
        }

        return WalkForwardReport(
            evaluatedWindows = evaluatedWindows,
            evalHorizon = horizon,
            outerStrideBars = horizon,
            effectiveSampleSize = effectiveSampleSize,
            relativeMaeVsNaive = relativeMaeVsNaive,
            mase = mase,
            wisModel = wisModel,
            wisNaiveDistributional = wisNaiveDist,
            coverage80Pct = cov80Pct,
            coverage50Pct = cov50Pct,
            dieboldMarianoStat = dmStat,
            dieboldMarianoPValue = dmPValue,
            sensitivityBootstrapPValue = bootPValue,
            acceptancePassed = acceptancePassed,
            forecastStatus = forecastStatus,
            acceptanceReason = acceptanceReason,
            winningModelId = if (acceptancePassed) evalRef.modelId else "naive_persistence",
            ensembleMetrics = ensembleMetrics,
            naiveMetrics = naiveMetrics,
            modelBenchmarks = modelBenchmarks,
            maeImprovementVsNaivePct = ((1.0 - relativeMaeVsNaive) * 10000.0).roundToInt() / 100.0,
            skillScoreVsNaive = ((1.0 - wisModel / max(1e-9, wisNaiveDist)) * 10000.0).roundToInt() / 10000.0,
            conformalCalibration = conformalCal,
            frozenWeights = frozenWeights,
            splits = mapOf(
                "trainBars" to (split.trainEndIdx + 1),
                "valWindows" to split.valOrigins.size,
                "calWindows" to split.calOrigins.size,
                "outerWindows" to split.outerOrigins.size
            )
        )
    }

    private fun recordAcc(acc: MetricAccumulator, w: WindowScore, err: Double) {
        acc.maeSum += w.maeMean
        acc.mseSum += w.mseMean
        acc.wisSum += w.wisMean
        acc.pinballSum += w.pinballMean
        acc.in80Sum += w.in80Frac
        acc.in50Sum += w.in50Frac
        acc.widthPctSum += w.widthPctMean
        if (w.dirOk) acc.dirCount++
        acc.windows++
        acc.wisSeries.add(w.wisMean)
        acc.errSeries.add(err)
    }

    fun selectOosChartWinner(
        walkForward: WalkForwardReport?,
        modelTrajectories: List<ModelTrajectory>,
        requestedModelId: String = "AUTO"
    ): OosSelectionDecision {
        val req = requestedModelId.trim()
        val successById = modelTrajectories.filter {
            it.status == ModelExecutionStatus.SUCCESS && it.points.isNotEmpty()
        }.associateBy { it.modelId }

        if (req.isNotEmpty() && !req.equals("AUTO", ignoreCase = true)) {
            val manual = successById[req]
            if (manual != null) {
                return OosSelectionDecision(
                    selectionMode = SelectionMode.MANUAL_OVERRIDE,
                    selectedModelId = manual.modelId,
                    winnerModelId = manual.modelId,
                    reason = "Manual chart model selection: ${manual.modelName}"
                )
            }
            return OosSelectionDecision(
                selectionMode = SelectionMode.NO_CLEAR_WINNER_BASELINE,
                selectedModelId = if (successById.containsKey("naive_persistence")) "naive_persistence" else (modelTrajectories.firstOrNull()?.modelId ?: "naive_persistence"),
                winnerModelId = null,
                reason = "Requested model $req unavailable; displaying zero-drift baseline."
            )
        }

        if (walkForward == null || walkForward.evaluatedWindows < 30 || walkForward.effectiveSampleSize < 25.0) {
            return OosSelectionDecision(
                selectionMode = SelectionMode.INSUFFICIENT_EVIDENCE_BASELINE,
                selectedModelId = if (successById.containsKey("naive_persistence")) "naive_persistence" else "ensemble",
                winnerModelId = null,
                reason = "Insufficient non-overlapping OOS evidence (K_outer=${walkForward?.evaluatedWindows ?: 0}/30, N_eff=${walkForward?.effectiveSampleSize ?: 0.0}/25); showing baseline."
            )
        }

        val naiveWis = max(1e-9, walkForward.wisNaiveDistributional)
        val candidates = (listOfNotNull(walkForward.ensembleMetrics) + walkForward.modelBenchmarks).filter { m ->
            m.modelId != "naive_persistence" && !m.experimentalOnly &&
                m.status == ModelExecutionStatus.SUCCESS && m.windows >= 30 &&
                m.nEff >= 25.0 && m.rMae < 1.0 && m.wis < naiveWis &&
                m.coverage80Pct in 72.0..88.0 && m.dmPValue <= 0.05 && m.bootPValue <= 0.10 &&
                successById.containsKey(m.modelId)
        }.sortedWith(compareBy<ModelWalkForwardSummary> { it.wis }.thenBy { it.mae })

        if (candidates.isNotEmpty()) {
            val win = candidates.first()
            return OosSelectionDecision(
                selectionMode = SelectionMode.AUTO_OOS_BEST,
                selectedModelId = win.modelId,
                winnerModelId = win.modelId,
                reason = "OOS winner ${win.modelName} passed 6-gate V2.1 check (rMAE=${String.format(Locale.US, "%.3f", win.rMae)}, WIS=${String.format(Locale.US, "%.4f", win.wis)} < ${String.format(Locale.US, "%.4f", naiveWis)}, p_DM=${win.dmPValue}, Cov80=${String.format(Locale.US, "%.1f", win.coverage80Pct)}%)."
            )
        }

        return OosSelectionDecision(
            selectionMode = SelectionMode.NO_CLEAR_WINNER_BASELINE,
            selectedModelId = if (successById.containsKey("naive_persistence")) "naive_persistence" else "ensemble",
            winnerModelId = null,
            reason = walkForward.acceptanceReason.ifBlank { "No candidate beat zero-drift log-normal Naive across all 6 V2.1 OOS gates." }
        )
    }
}
