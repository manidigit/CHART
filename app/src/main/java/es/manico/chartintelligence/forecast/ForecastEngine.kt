package es.manico.chartintelligence.forecast

import es.manico.chartintelligence.data.model.CandleBar
import java.util.Collections
import java.util.Locale
import kotlin.math.max
import kotlin.math.sqrt

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

object ForecastEngine {

    private val WALK_FORWARD_CACHE: MutableMap<String, WalkForwardReport> = Collections.synchronizedMap(
        object : LinkedHashMap<String, WalkForwardReport>(48, 0.75f, true) {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, WalkForwardReport>?): Boolean = size > 48
        }
    )

    private fun buildCanonicalCandlesHash(candles: List<CleanOhlcBar>): String {
        val tail = if (candles.size > 2500) candles.subList(candles.size - 2500, candles.size) else candles
        val rows = tail.map { c ->
            listOf(c.openTimeUtcMs, c.open, c.high, c.low, c.close, c.volume)
        }
        return ForecastSha256.sha256Hex(ForecastSha256.canonicalJson(rows))
    }

    private fun buildForecastPointsFromQuantileTrajectory(
        trajSteps: List<WalkForwardEvaluator.QuantileStep>,
        canonicalTimestamps: LongArray,
        features: ExtractedForecastFeatures,
        horizonBars: Int,
        conformalCalibration: ForecastStatisticalTests.ConformalCalibrationState?
    ): List<ForecastPoint> {
        val out = ArrayList<ForecastPoint>(horizonBars)
        var prevClose = features.lastClose
        for (h in 0 until horizonBars) {
            val raw = trajSteps[h]
            val adj = if (conformalCalibration != null) {
                val qt = ForecastStatisticalTests.QuantileTuple(raw.q10, raw.q25, raw.q50, raw.q75, raw.q90)
                val c = ForecastStatisticalTests.applyConformalAdjustmentToQuantiles(
                    qt, features.lastClose, features.ewmaSigma, h + 1, conformalCalibration, features.lastClose * 0.01
                )
                doubleArrayOf(c.q10, c.q25, c.q50, c.q75, c.q90)
            } else {
                ForecastCalendarHelper.enforceMonotonicQuantiles(raw.q10, raw.q25, raw.q50, raw.q75, raw.q90, features.lastClose * 0.01)
            }
            val mq = ForecastCalendarHelper.enforceMonotonicQuantiles(adj[0], adj[1], adj[2], adj[3], adj[4], features.lastClose * 0.01)
            val cOpen = prevClose
            val cClose = mq[2]
            val cHigh = max(mq[3], max(cOpen, cClose))
            val cLow = kotlin.math.min(mq[1], kotlin.math.min(cOpen, cClose))
            prevClose = cClose

            out.add(
                ForecastPoint(
                    stepAhead = h + 1,
                    openTimeUtcMs = canonicalTimestamps.getOrElse(h) { 0L },
                    open = cOpen,
                    high = cHigh,
                    low = cLow,
                    close = cClose,
                    q10 = mq[0],
                    q25 = mq[1],
                    q50 = mq[2],
                    q75 = mq[3],
                    q90 = mq[4],
                    pctChangeFromLast = ((mq[2] - features.lastClose) / features.lastClose) * 100.0,
                    volume = 0.0,
                    rejectionWick = false,
                    wavePhase = "IMPULSE",
                    upperBand = mq[4],
                    lowerBand = mq[0]
                )
            )
        }
        return out
    }

    fun resolveRemoteWorkerStatus(workerUrl: String): RemoteWorkerSummary {
        val clean = workerUrl.trim()
        return if (clean.isEmpty()) {
            RemoteWorkerSummary(RemoteWorkerStatus.LOCAL_STATISTICAL_ONLY, false, "")
        } else {
            RemoteWorkerSummary(RemoteWorkerStatus.UNCONFIGURED, true, clean)
        }
    }

    fun project(
        candles: List<CandleBar>,
        symbolCode: String,
        timeframe: String,
        horizonBars: Int = 30,
        renderMode: ForecastRenderMode = ForecastRenderMode.FAN_CHART,
        registry: ForecastModelRegistry = ForecastModelRegistry(),
        workerUrl: String = "",
        skipWalkForward: Boolean = false,
        minBars: Int? = null,
        higherTimeframe: String = "",
        higherTimeframeCandles: List<CandleBar> = emptyList(),
        previousForecast: ForecastResult? = null,
        selectedScenarioId: String = ScenarioIds.RANGE_CONTAINMENT,
        lowerTimeframe: String = "",
        lowerTimeframeCandles: List<CandleBar> = emptyList(),
        disableLowerTfAnchor: Boolean = false,
        selectedModelId: String = "AUTO",
        bypassWalkForwardCache: Boolean = false,
        providerId: String = "twelvedata",
        calendarSpec: ForecastCalendarRegistry.CalendarSpec? = null,
        priceBasis: String = "MID_OHLC",
        anchorNowMs: Long = System.currentTimeMillis(),
        checkClosedBar: Boolean = true,
        enforceCalendarGaps: Boolean = false,
        excludeExperimental: Boolean = true,
        allowExperimentalInEnsemble: Boolean = false,
        skipBootstrap: Boolean = false,
        bootstrapB: Int = 1000
    ): ForecastResult {
        val cleanSymbol = symbolCode.trim().uppercase(Locale.US)
        val cleanProvider = providerId.trim().lowercase(Locale.US)
        val cleanTf = timeframe.trim().uppercase(Locale.US)
        val horizon = ForecastCalendarHelper.clampHorizonBars(horizonBars)
        val nowMs = anchorNowMs
        val spec = calendarSpec ?: ForecastCalendarRegistry.resolveCalendarSpec(cleanSymbol, cleanProvider)
        val req = ForecastCalendarHelper.computeHorizonRequirements(horizon)
        val requestedModelId = selectedModelId.trim().ifBlank { "AUTO" }
        val remoteSummary = resolveRemoteWorkerStatus(workerUrl)

        val readiness = ForecastFeatureExtractor.validateReadiness(
            candles = candles,
            horizonBars = horizon,
            minBars = minBars,
            timeframe = cleanTf,
            symbolCode = cleanSymbol,
            providerId = cleanProvider,
            calendarSpec = spec,
            anchorNowMs = anchorNowMs,
            checkClosedBar = checkClosedBar,
            enforceCalendarGaps = enforceCalendarGaps
        )

        if (!readiness.ready) {
            val errInputHash = ForecastSha256.sha256Hex(
                "${ForecastSha256.CONTRACT_VERSION}|$cleanSymbol|$cleanTf|DATA_NOT_READY|${readiness.errorCodes.joinToString(",")}"
            )
            return ForecastResult(
                contractVersion = ForecastSha256.CONTRACT_VERSION,
                specVersion = ForecastSha256.SPEC_VERSION,
                engineVersion = ForecastSha256.ENGINE_VERSION,
                status = ForecastStatus.DATA_NOT_READY,
                symbolCode = cleanSymbol,
                timeframe = cleanTf,
                horizonBars = horizon,
                renderMode = renderMode,
                generatedAtUtcMs = nowMs,
                calendarSpec = CalendarSpecSummary(spec.calendarId, spec.calendarVersion, spec.ianaTimezone),
                readiness = readiness,
                remoteWorker = remoteSummary,
                selectedChartModelId = "naive_persistence",
                selectionMode = SelectionMode.NO_CLEAR_WINNER_BASELINE,
                selectionReason = readiness.issues.firstOrNull() ?: "Data readiness check failed",
                walkForward = WalkForwardReport(
                    evaluatedWindows = 0,
                    evalHorizon = horizon,
                    outerStrideBars = horizon,
                    acceptancePassed = false,
                    forecastStatus = ForecastStatus.DATA_NOT_READY,
                    acceptanceReason = readiness.issues.firstOrNull() ?: "Data readiness check failed",
                    ensembleMetrics = null,
                    naiveMetrics = null,
                    modelBenchmarks = emptyList()
                ),
                inputHash = errInputHash
            )
        }

        val cleanCandles = readiness.cleanCandles
        val features = ForecastFeatureExtractor.extractClean(if (cleanCandles.size > 2500) cleanCandles.takeLast(2500) else cleanCandles)
            ?: return project(
                candles = emptyList(),
                symbolCode = cleanSymbol,
                timeframe = cleanTf,
                horizonBars = horizon,
                renderMode = renderMode,
                minBars = readiness.nOpMin
            )

        val candlesSha256 = buildCanonicalCandlesHash(cleanCandles)
        val htfClean = higherTimeframeCandles.mapNotNull { c ->
            val cl = c.close.toDouble()
            if (cl.isFinite() && cl > 0.0) {
                CleanOhlcBar(c.open.toDouble(), c.high.toDouble(), c.low.toDouble(), cl, max(0.0, c.volume.toDouble()), c.openTimeUtcMillis)
            } else null
        }
        val htfCandlesSha256: String? = if (htfClean.isNotEmpty()) buildCanonicalCandlesHash(htfClean) else null

        val inputHashPayload = linkedMapOf<String, Any?>(
            "contractVersion" to ForecastSha256.CONTRACT_VERSION,
            "engineVersion" to ForecastSha256.ENGINE_VERSION,
            "symbolCode" to cleanSymbol,
            "timeframe" to cleanTf,
            "horizonBars" to horizon,
            "dataProvenance" to linkedMapOf(
                "providerId" to cleanProvider,
                "priceBasis" to priceBasis,
                "hasRealVolume" to features.hasRealVolume
            ),
            "calendarSpec" to linkedMapOf(
                "calendarId" to spec.calendarId,
                "calendarVersion" to spec.calendarVersion,
                "ianaTimezone" to spec.ianaTimezone
            ),
            "featureConfig" to linkedMapOf(
                "featurePipelineVersion" to ForecastSha256.FEATURE_PIPELINE_VERSION,
                "lookbackWindow" to kotlin.math.min(cleanCandles.size, 2500),
                "scaling" to "LOG_RETURN_Z"
            ),
            "modelRegistry" to registry.serializeConfigForHash(),
            "calibrationConfig" to linkedMapOf(
                "conformalAlpha" to 0.20,
                "decayLambda" to 0.92
            ),
            "candlesSha256" to candlesSha256,
            "htfCandlesSha256" to htfCandlesSha256
        )
        val inputHash = ForecastSha256.sha256Hex(ForecastSha256.canonicalJson(inputHashPayload))

        val split = WalkForwardEvaluator.buildDisjointNestedSplits(cleanCandles.size, horizon)
        val activePlugins = registry.getEnabled()
        val effectivePlugins = if (activePlugins.isNotEmpty()) activePlugins else {
            listOfNotNull(registry.getPlugin("naive_persistence")?.let { Triple(it, 1.0, emptyMap<String, Double>()) })
        }

        val walkForward: WalkForwardReport? = if (!skipWalkForward) {
            val wfKey = ForecastSha256.canonicalJson(
                linkedMapOf(
                    "inputHash" to inputHash,
                    "horizonBars" to horizon,
                    "excludeExperimental" to excludeExperimental,
                    "skipBootstrap" to skipBootstrap,
                    "bootstrapB" to bootstrapB
                )
            )
            val cached = if (!bypassWalkForwardCache) WALK_FORWARD_CACHE[wfKey] else null
            if (cached != null) cached else {
                val computed = WalkForwardEvaluator.evaluateClean(
                    clean = cleanCandles,
                    registry = registry,
                    horizonBars = horizon,
                    excludeExperimental = excludeExperimental,
                    allowExperimentalInEnsemble = allowExperimentalInEnsemble,
                    skipBootstrap = skipBootstrap,
                    bootstrapB = bootstrapB
                )
                WALK_FORWARD_CACHE[wfKey] = computed
                computed
            }
        } else null

        val canonicalTimestamps = ForecastCalendarRegistry.advanceFutureTimestampsWithCalendar(
            features.lastOpenMs, cleanTf, horizon, cleanSymbol, cleanProvider, spec
        )
        val featuresWithTs = features.copy(futureTimestamps = canonicalTimestamps)

        val modelTrajectories = ArrayList<ModelTrajectory>()
        val modelContributions = ArrayList<ModelContribution>()
        val modelOutputs = ArrayList<Pair<Triple<ForecastModelPlugin, Double, Map<String, Double>>, Pair<Double, PluginPrediction>>>()

        val ensMeanReturns = DoubleArray(horizon)
        val aleatoricVarSteps = DoubleArray(horizon)
        val trainStartMs = features.candles.first().openTimeUtcMs
        val trainEndMs = features.lastOpenMs
        val frozenWeights = walkForward?.frozenWeights.orEmpty()
        val hasFrozenWeights = frozenWeights.isNotEmpty()
        val naiveSigmaRw = ForecastStatisticalTests.computeNaiveSigmaRw(features.logReturns)

        val rawWeights = effectivePlugins.map { (plugin, weight, _) ->
            when {
                plugin.id == "naive_persistence" -> 0.0
                hasFrozenWeights -> frozenWeights[plugin.id] ?: 0.0
                (plugin.experimentalOnly || plugin.isApproximation) && !allowExperimentalInEnsemble -> 0.0
                else -> max(0.01, weight)
            }
        }

        var totalSuccessWeight = 0.0
        val rawPreds = effectivePlugins.mapIndexed { idx, entry ->
            val (plugin, _, params) = entry
            val pred = try {
                if (plugin.id == "naive_persistence") {
                    PluginPrediction(
                        modelId = "naive_persistence",
                        meanReturns = DoubleArray(horizon),
                        sigmas = DoubleArray(horizon) { naiveSigmaRw },
                        modelVersion = plugin.modelVersion
                    )
                } else {
                    plugin.predict(featuresWithTs, horizon, params)
                }
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
            val valid = pred.status == ModelExecutionStatus.SUCCESS && pred.meanReturns.size >= horizon
            val rawW = rawWeights[idx]
            if (valid && rawW > 0.0) totalSuccessWeight += rawW
            Triple(entry, Pair(valid, rawW), pred)
        }

        val conformalCal = walkForward?.conformalCalibration
        val safeWeightSum = if (totalSuccessWeight > 0.0) totalSuccessWeight else 1.0
        val isCalNorm = conformalCal?.calibrationStatus == "CALIBRATED_NORMALIZED"

        for ((entry, validPair, pred) in rawPreds) {
            val (plugin, _, _) = entry
            val (valid, rawW) = validPair
            val normW = if (valid && rawW > 0.0) rawW / safeWeightSum else 0.0

            if (!valid) {
                modelTrajectories.add(
                    ModelTrajectory(
                        modelId = plugin.id,
                        modelName = plugin.name,
                        family = plugin.family,
                        modelVersion = pred.modelVersion,
                        executionRuntime = ExecutionRuntime.NATIVE_KOTLIN,
                        isApproximation = pred.isApproximation || plugin.isApproximation,
                        isCalibratedInterval = false,
                        status = if (pred.status == ModelExecutionStatus.SKIPPED_LOW_DATA) ModelExecutionStatus.SKIPPED_LOW_DATA else ModelExecutionStatus.FAILED,
                        reason = pred.reason.ifBlank { "Model unavailable on current input window" },
                        trainingStartUtcMs = trainStartMs,
                        trainingEndUtcMs = trainEndMs,
                        trainingSampleCount = features.barCount
                    )
                )
                continue
            }

            if (normW > 0.0) {
                modelOutputs.add(Pair(entry, Pair(normW, pred)))
                for (h in 0 until horizon) {
                    val mr = pred.meanReturns[h]
                    val sg = max(1e-5, pred.sigmas.getOrElse(h) { features.ewmaSigma })
                    ensMeanReturns[h] += normW * mr
                    aleatoricVarSteps[h] += normW * sg * sg
                }
            }

            val rawTraj = if (plugin.id == "naive_persistence") {
                List(horizon) { h ->
                    val q = ForecastStatisticalTests.buildZeroDriftLogNormalNaiveQuantiles(features.lastClose, naiveSigmaRw, h + 1)
                    WalkForwardEvaluator.QuantileStep(q.q10, q.q25, q.q50, q.q75, q.q90)
                }
            } else {
                WalkForwardEvaluator.buildTrajectory(features.lastClose, pred.meanReturns, pred.sigmas, pred.directQuantiles, horizon)
            }
            val pts = buildForecastPointsFromQuantileTrajectory(
                rawTraj, canonicalTimestamps, features, horizon, if (plugin.id == "naive_persistence") null else conformalCal
            )

            modelTrajectories.add(
                ModelTrajectory(
                    modelId = plugin.id,
                    modelName = plugin.name,
                    family = plugin.family,
                    modelVersion = pred.modelVersion,
                    executionRuntime = ExecutionRuntime.NATIVE_KOTLIN,
                    isApproximation = pred.isApproximation || plugin.isApproximation,
                    isCalibratedInterval = plugin.id == "naive_persistence" || isCalNorm,
                    status = ModelExecutionStatus.SUCCESS,
                    trainingStartUtcMs = trainStartMs,
                    trainingEndUtcMs = trainEndMs,
                    trainingSampleCount = features.barCount,
                    points = pts,
                    meta = pred.meta
                )
            )
            val term = pts.last()
            modelContributions.add(
                ModelContribution(
                    modelId = plugin.id,
                    modelName = plugin.name,
                    family = plugin.family,
                    weight = Math.round(normW * 10000.0) / 10000.0,
                    terminalPrice = term.q50,
                    terminalPctChange = term.pctChangeFromLast,
                    meta = pred.meta
                )
            )
        }

        if (totalSuccessWeight <= 0.0) {
            for (h in 0 until horizon) aleatoricVarSteps[h] = naiveSigmaRw * naiveSigmaRw
        }

        var totalAleatoricCumVar = 0.0
        var totalEpistemicDispVar = 0.0
        val epistemicDispSteps = DoubleArray(horizon)
        for (h in 0 until horizon) {
            var disp = 0.0
            for ((_, wp) in modelOutputs) {
                val (nw, pr) = wp
                val diff = pr.meanReturns.getOrElse(h) { 0.0 } - ensMeanReturns[h]
                disp += nw * diff * diff
            }
            epistemicDispSteps[h] = disp
            totalAleatoricCumVar += aleatoricVarSteps[h]
            totalEpistemicDispVar += disp
        }

        val uncertainty = ForecastV130Analyzer.computeOodAndUncertainty(
            features, totalAleatoricCumVar, totalEpistemicDispVar, walkForward?.effectiveSampleSize
        )
        val nEffBase = max(6.0, walkForward?.effectiveSampleSize ?: (features.barCount / 4.0))
        val oodFactor = when (uncertainty.oodStatus) {
            OodStatus.EXTREME -> 0.48
            OodStatus.ELEVATED -> 0.20
            OodStatus.IN_DISTRIBUTION -> 0.0
        }
        val epiFactorPerStep = (1.0 / nEffBase) + oodFactor
        val ensSigmas = DoubleArray(horizon) { idx ->
            sqrt(max(1e-10, aleatoricVarSteps[idx] * (1.0 + 0.35 * epiFactorPerStep) + epistemicDispSteps[idx])) * uncertainty.spreadMultiplierApplied
        }
        val ensRawTraj = WalkForwardEvaluator.buildTrajectory(features.lastClose, ensMeanReturns, ensSigmas, null, horizon)
        val ensPoints = buildForecastPointsFromQuantileTrajectory(ensRawTraj, canonicalTimestamps, features, horizon, conformalCal)

        modelTrajectories.add(
            ModelTrajectory(
                modelId = "ensemble",
                modelName = "Calibrated Ensemble (V2)",
                family = "ENSEMBLE",
                modelVersion = "2.0.0",
                executionRuntime = ExecutionRuntime.NATIVE_KOTLIN,
                isApproximation = false,
                isCalibratedInterval = isCalNorm,
                status = ModelExecutionStatus.SUCCESS,
                trainingStartUtcMs = trainStartMs,
                trainingEndUtcMs = trainEndMs,
                trainingSampleCount = features.barCount,
                points = ensPoints
            )
        )

        // Strictly causal empirical analogs diagnostic trajectory (zero synthetic profiles)
        val analogEngine = EmpiricalAnalogEngine(24, horizon, cleanTf)
        val analogRes = analogEngine.projectEmpirical(cleanCandles, features, horizon, canonicalTimestamps.toList())
        if (analogRes.status == ModelExecutionStatus.SUCCESS) {
            val rawAnalogSteps = analogRes.points.map { WalkForwardEvaluator.QuantileStep(it.q10, it.q25, it.q50, it.q75, it.q90) }
            modelTrajectories.add(
                ModelTrajectory(
                    modelId = "empirical_analogs",
                    modelName = "Causal Historical Analogs",
                    family = "PATTERN_EMPIRICAL",
                    modelVersion = "2.0.0",
                    executionRuntime = ExecutionRuntime.NATIVE_KOTLIN,
                    isApproximation = false,
                    isCalibratedInterval = isCalNorm,
                    status = ModelExecutionStatus.SUCCESS,
                    reason = analogRes.reason,
                    trainingStartUtcMs = trainStartMs,
                    trainingEndUtcMs = trainEndMs,
                    trainingSampleCount = features.barCount,
                    points = buildForecastPointsFromQuantileTrajectory(rawAnalogSteps, canonicalTimestamps, features, horizon, conformalCal)
                )
            )
        } else {
            modelTrajectories.add(
                ModelTrajectory(
                    modelId = "empirical_analogs",
                    modelName = "Causal Historical Analogs",
                    family = "PATTERN_EMPIRICAL",
                    modelVersion = "2.0.0",
                    executionRuntime = ExecutionRuntime.NATIVE_KOTLIN,
                    isApproximation = false,
                    isCalibratedInterval = false,
                    status = ModelExecutionStatus.SKIPPED_LOW_DATA,
                    reason = analogRes.reason,
                    trainingStartUtcMs = trainStartMs,
                    trainingEndUtcMs = trainEndMs,
                    trainingSampleCount = features.barCount
                )
            )
        }

        val selection = WalkForwardEvaluator.selectOosChartWinner(walkForward, modelTrajectories, requestedModelId)
        val chosenTraj = modelTrajectories.firstOrNull {
            it.modelId == selection.selectedModelId && it.status == ModelExecutionStatus.SUCCESS && it.points.size == horizon
        } ?: modelTrajectories.firstOrNull { it.modelId == "naive_persistence" }
        val points = chosenTraj?.points ?: ensPoints

        val zonesAndEvents = ForecastV130Analyzer.detectKeyZonesAndEventTree(features, points, horizon, split)
        val enrichedWalkForward = walkForward?.copy(pathEventStats = zonesAndEvents.pathEventStats)
        val mtfCoordination = ForecastV130Analyzer.coordinateMultiTimeframe(
            points, zonesAndEvents.scenarios, features.lastClose, cleanTf, higherTimeframe, higherTimeframeCandles
        )
        val noEdgeGate = ForecastV130Analyzer.evaluateNoEdgeGate(enrichedWalkForward, uncertainty)

        val hasSufficientStatEvidence = enrichedWalkForward != null &&
            cleanCandles.size >= req.nStatMin &&
            enrichedWalkForward.evaluatedWindows >= 30 &&
            enrichedWalkForward.effectiveSampleSize >= 25.0 &&
            enrichedWalkForward.conformalCalibration?.calibrationStatus == "CALIBRATED_NORMALIZED"

        val status = when {
            !hasSufficientStatEvidence -> ForecastStatus.INSUFFICIENT_EVIDENCE
            !noEdgeGate.hasEdge || uncertainty.oodStatus == OodStatus.EXTREME -> ForecastStatus.NO_EDGE
            uncertainty.oodStatus == OodStatus.ELEVATED ||
                !zonesAndEvents.scenarioCalibration.calibrationPassed ||
                mtfCoordination.alignmentState == MtfAlignmentState.STRUCTURAL_CONFLICT -> ForecastStatus.PROVISIONAL
            else -> ForecastStatus.VALID
        }

        val lastPt = points.last()
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
            engineVersion = ForecastSha256.ENGINE_VERSION,
            status = status,
            symbolCode = cleanSymbol,
            timeframe = cleanTf,
            horizonBars = horizon,
            renderMode = renderMode,
            generatedAtUtcMs = nowMs,
            anchorOpenTimeUtcMs = features.lastOpenMs,
            anchorClose = features.lastClose,
            regime = features.regime,
            calendarSpec = CalendarSpecSummary(spec.calendarId, spec.calendarVersion, spec.ianaTimezone),
            dataProvenance = DataProvenance(cleanProvider, priceBasis, features.hasRealVolume),
            featuresSummary = ForecastFeaturesSummary(
                atr14 = features.atr14,
                atrPct = features.atrPct * 100.0,
                ewmaSigmaPct = features.ewmaSigma * 100.0,
                rsi14 = features.rsi14,
                realizedVolRatio = features.realizedVolRatio,
                driftZ = features.driftZ,
                hasRealVolume = features.hasRealVolume
            ),
            readiness = readiness,
            remoteWorker = remoteSummary,
            uncertainty = uncertainty,
            conformalCalibration = conformalCal,
            scenarioCalibration = zonesAndEvents.scenarioCalibration,
            noEdgeGate = noEdgeGate,
            keyZones = zonesAndEvents.keyZones,
            eventDictionary = zonesAndEvents.eventDictionary,
            mtfCoordination = mtfCoordination,
            stability = stability,
            points = points,
            scenarios = zonesAndEvents.scenarios,
            representativePaths = analogRes.representativePaths,
            analogDiagnostics = AnalogDiagnostics(
                status = analogRes.status.name,
                reason = analogRes.reason,
                jMax = analogRes.jMax,
                embargoGap = analogRes.embargoGap,
                matchedCount = analogRes.matchedCount
            ),
            modelContributions = modelContributions,
            modelTrajectories = modelTrajectories,
            selectedChartModelId = selection.selectedModelId,
            selectionMode = selection.selectionMode,
            selectionReason = selection.reason,
            walkForward = enrichedWalkForward,
            summary = summary,
            inputHash = inputHash
        )
    }

    fun applyRemoteWorkerResponse(
        baseResult: ForecastResult,
        workerWrap: RemoteWorkerResponseWrap,
        requestedModelId: String = "AUTO"
    ): ForecastResult {
        if (workerWrap.inputHash.isNotEmpty() && baseResult.inputHash.isNotEmpty() && workerWrap.inputHash != baseResult.inputHash) {
            return baseResult.copy(
                remoteWorker = RemoteWorkerSummary(
                    status = RemoteWorkerStatus.ERROR,
                    configured = true,
                    url = workerWrap.url,
                    error = "WORKER_INPUT_HASH_MISMATCH: expected ${baseResult.inputHash.take(12)}, got ${workerWrap.inputHash.take(12)}"
                ),
                remoteWorkerStatus = RemoteWorkerStatus.ERROR,
                remoteWorkerError = "WORKER_INPUT_HASH_MISMATCH"
            )
        }
        val nextRemote = RemoteWorkerSummary(workerWrap.status, workerWrap.url.isNotEmpty(), workerWrap.url, workerWrap.error)
        if (workerWrap.trajectories.isEmpty()) {
            return baseResult.copy(remoteWorker = nextRemote, remoteWorkerStatus = workerWrap.status, remoteWorkerUrl = workerWrap.url, remoteWorkerError = workerWrap.error)
        }

        val mergedTrajs = baseResult.modelTrajectories.toMutableList()
        for (wt in workerWrap.trajectories) {
            var sanitized = wt
            if (wt.status == ModelExecutionStatus.SUCCESS) {
                val okPts = wt.points.size == baseResult.horizonBars && wt.points.all { p ->
                    p.q10.isFinite() && p.q25.isFinite() && p.q50.isFinite() && p.q75.isFinite() && p.q90.isFinite() &&
                        p.q10 > 0.0 && p.q10 <= p.q25 && p.q25 <= p.q50 && p.q50 <= p.q75 && p.q75 <= p.q90
                }
                if (!okPts) {
                    sanitized = wt.copy(
                        status = ModelExecutionStatus.FAILED,
                        reason = "Worker emitted non-finite or non-monotonic quantiles",
                        points = emptyList()
                    )
                }
            }
            val idx = mergedTrajs.indexOfFirst { it.modelId == sanitized.modelId }
            if (idx >= 0) mergedTrajs[idx] = sanitized else mergedTrajs.add(sanitized)
        }

        val mergedWf = baseResult.walkForward?.let { wf ->
            val benches = wf.modelBenchmarks.toMutableList()
            for (wb in workerWrap.benchmarks) {
                val idx = benches.indexOfFirst { it.modelId == wb.modelId }
                if (idx >= 0) benches[idx] = wb else benches.add(wb)
            }
            wf.copy(modelBenchmarks = benches)
        }

        val selection = WalkForwardEvaluator.selectOosChartWinner(mergedWf, mergedTrajs, requestedModelId)
        val chosen = mergedTrajs.firstOrNull {
            it.modelId == selection.selectedModelId && it.status == ModelExecutionStatus.SUCCESS && it.points.size == baseResult.horizonBars
        }
        val nextPoints = chosen?.points ?: baseResult.points
        val lastPt = nextPoints.lastOrNull()
        val nextSummary = if (lastPt != null && baseResult.summary != null && baseResult.anchorClose > 0.0) {
            baseResult.summary.copy(
                terminalQ10 = lastPt.q10,
                terminalQ25 = lastPt.q25,
                terminalQ50 = lastPt.q50,
                terminalQ75 = lastPt.q75,
                terminalQ90 = lastPt.q90,
                medianPctChange = lastPt.pctChangeFromLast,
                corridorWidthPct = ((lastPt.q90 - lastPt.q10) / baseResult.anchorClose) * 100.0
            )
        } else baseResult.summary

        return baseResult.copy(
            remoteWorker = nextRemote,
            remoteWorkerStatus = workerWrap.status,
            remoteWorkerUrl = workerWrap.url,
            remoteWorkerError = workerWrap.error,
            modelTrajectories = mergedTrajs,
            walkForward = mergedWf,
            selectedChartModelId = selection.selectedModelId,
            selectionMode = selection.selectionMode,
            selectionReason = selection.reason,
            points = nextPoints,
            summary = nextSummary
        )
    }
}
