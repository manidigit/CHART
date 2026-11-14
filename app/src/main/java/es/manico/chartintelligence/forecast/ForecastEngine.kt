package es.manico.chartintelligence.forecast

import es.manico.chartintelligence.data.model.CandleBar
import java.util.Locale
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round
import kotlin.math.sin
import kotlin.math.sqrt

object ForecastEngine {

    private fun normalCdf(z: Double): Double {
        val t = 1.0 / (1.0 + 0.2316419 * abs(z))
        val d = 0.3989422804014327 * exp((-z * z) / 2.0)
        val p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
        return if (z >= 0.0) 1.0 - p else p
    }

    fun project(
        candles: List<CandleBar>,
        symbolCode: String,
        timeframe: String,
        horizonBars: Int = 30,
        renderMode: ForecastRenderMode = ForecastRenderMode.HYBRID,
        registry: ForecastModelRegistry = ForecastModelRegistry(),
        workerUrl: String = "",
        skipWalkForward: Boolean = false,
        minBars: Int = 24
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
            ?: return project(emptyList(), cleanSymbol, cleanTf, horizon, renderMode, registry, workerUrl, skipWalkForward, minBars)

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
        val ensVarReturns = DoubleArray(horizon)

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
                ensVarReturns[h] += normW * (sg * sg)
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

        // Epistemic inter-model dispersion variance
        for (h in 0 until horizon) {
            var dispVar = 0.0
            for ((_, normW, pred) in predictions) {
                val diff = pred.meanReturns[h] - ensMeanReturns[h]
                dispVar += normW * diff * diff
            }
            ensVarReturns[h] += dispVar
        }

        val timestamps = ForecastCalendarHelper.advanceFutureTimestamps(features.lastOpenMs, cleanTf, horizon, cleanSymbol)
        val points = ArrayList<ForecastPoint>(horizon)
        var cumLogRet = 0.0
        var cumVar = 0.0
        var prevSynthClose = features.lastClose

        for (h in 0 until horizon) {
            cumLogRet += ensMeanReturns[h]
            cumVar += ensVarReturns[h]
            val cumSigma = sqrt(cumVar) * (1.0 + 0.008 * h)

            val q = ForecastCalendarHelper.enforceMonotonicQuantiles(
                features.lastClose * exp(cumLogRet - 1.28155 * cumSigma),
                features.lastClose * exp(cumLogRet - 0.67449 * cumSigma),
                features.lastClose * exp(cumLogRet),
                features.lastClose * exp(cumLogRet + 0.67449 * cumSigma),
                features.lastClose * exp(cumLogRet + 1.28155 * cumSigma),
                features.lastClose * 0.02
            )

            val stepSigma = sqrt(ensVarReturns[h])
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
        val totalSig = max(1e-5, sqrt(cumVar))
        val zDrift = ln(lastPt.q50 / features.lastClose) / totalSig
        val pUp = normalCdf(zDrift - 0.35)
        val pDown = normalCdf(-zDrift - 0.35)
        val pBase = max(0.12, 1.0 - pUp - pDown)
        val rawSum = pUp + pDown + pBase

        val probBull = (round((pUp / rawSum) * 1000.0) / 1000.0)
        val probBear = (round((pDown / rawSum) * 1000.0) / 1000.0)
        val probBase = (round((1.0 - probBull - probBear) * 1000.0) / 1000.0)

        val scenarios = listOf(
            ForecastScenario(
                id = "BULL_EXPANSION",
                label = "Bullish Expansion Scenario",
                bias = "bull",
                probability = probBull,
                targetPrice = lastPt.q75,
                extremePrice = lastPt.q90,
                invalidationReference = lastPt.q25,
                pctChange = ((lastPt.q75 - features.lastClose) / features.lastClose) * 100.0
            ),
            ForecastScenario(
                id = "BASE_RANGE",
                label = "Base Range Scenario",
                bias = "neutral",
                probability = probBase,
                targetPrice = lastPt.q50,
                extremePrice = lastPt.q75,
                invalidationReference = lastPt.q25,
                pctChange = ((lastPt.q50 - features.lastClose) / features.lastClose) * 100.0
            ),
            ForecastScenario(
                id = "BEAR_CONTRACTION",
                label = "Bearish Contraction Scenario",
                bias = "bear",
                probability = probBear,
                targetPrice = lastPt.q25,
                extremePrice = lastPt.q10,
                invalidationReference = lastPt.q75,
                pctChange = ((lastPt.q25 - features.lastClose) / features.lastClose) * 100.0
            )
        )

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

        return ForecastResult(
            contractVersion = ForecastSha256.CONTRACT_VERSION,
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
            summary = ForecastSummary(
                terminalStep = lastPt.stepAhead,
                terminalQ10 = lastPt.q10,
                terminalQ25 = lastPt.q25,
                terminalQ50 = lastPt.q50,
                terminalQ75 = lastPt.q75,
                terminalQ90 = lastPt.q90,
                medianPctChange = lastPt.pctChangeFromLast,
                corridorWidthPct = ((lastPt.q90 - lastPt.q10) / features.lastClose) * 100.0
            ),
            inputHash = inputHash
        )
    }
}
