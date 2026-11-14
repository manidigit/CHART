package es.manico.chartintelligence.forecast

import es.manico.chartintelligence.data.model.CandleBar
import java.util.Locale
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round
import kotlin.math.sin
import kotlin.math.sqrt

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
        previousForecast: ForecastResult? = null
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
                skipWalkForward, minBars, higherTimeframe, higherTimeframeCandles, previousForecast
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
        val points = ArrayList<ForecastPoint>(horizon)
        var cumLogRet = 0.0
        var cumVar = 0.0
        var prevSynthClose = features.lastClose
        val epiPerStep = uncertainty.epistemicCumVar / max(1, horizon)

        for (h in 0 until horizon) {
            cumLogRet += ensMeanReturns[h]
            cumVar += aleatoricVarSteps[h] + epistemicDispSteps[h] + epiPerStep * 0.35
            val cumSigma = sqrt(cumVar) * (1.0 + 0.008 * h) * uncertainty.spreadMultiplierApplied

            val q = ForecastCalendarHelper.enforceMonotonicQuantiles(
                features.lastClose * exp(cumLogRet - 1.28155 * cumSigma),
                features.lastClose * exp(cumLogRet - 0.67449 * cumSigma),
                features.lastClose * exp(cumLogRet),
                features.lastClose * exp(cumLogRet + 0.67449 * cumSigma),
                features.lastClose * exp(cumLogRet + 1.28155 * cumSigma),
                features.lastClose * 0.02
            )

            val stepSigma = sqrt(aleatoricVarSteps[h] + epistemicDispSteps[h])
            val microCycle = sin((h + 1) * 0.92 + (features.barCount % 5)) * stepSigma * features.lastClose * 0.35
            val openP = prevSynthClose
            val targetClose = (q[2] + microCycle).coerceIn(q[1], q[3])
            val minBody = max(features.atr14 * 0.16, features.lastClose * stepSigma * 0.25)
            val closeP = if (abs(targetClose - openP) < minBody) {
                if (targetClose >= openP) openP + minBody else openP - minBody
            } else {
                targetClose
            }
            val effRange = max(abs(closeP - openP) / features.avgBodyRatio, features.atr14 * 0.58)
            val upWick = effRange * features.avgUpperWickRatio * (0.85 + 0.25 * abs(cos((h + 1) * 0.8)))
            val dnWick = effRange * features.avgLowerWickRatio * (0.85 + 0.25 * abs(sin((h + 1) * 1.1)))
            val highP = max(openP, closeP) + upWick
            val lowP = max(features.lastClose * 0.02, min(openP, closeP) - dnWick)
            prevSynthClose = closeP

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
                    pctChangeFromLast = ((q[2] - features.lastClose) / features.lastClose) * 100.0
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
            stability = stability
        )
    }
}
