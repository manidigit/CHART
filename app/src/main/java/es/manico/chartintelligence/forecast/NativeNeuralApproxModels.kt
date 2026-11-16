package es.manico.chartintelligence.forecast

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.cos
import kotlin.math.sqrt
import kotlin.math.tanh

private fun createSeededRng(seed: Int = 42): () -> Double {
    var a = seed
    return {
        a += 0x6d2b79f5
        var t = (a xor (a ushr 15)) * (1 or a)
        t = (t + ((t xor (t ushr 7)) * (61 or t))) xor t
        ((t xor (t ushr 14)).toLong() and 0xFFFFFFFFL).toDouble() / 4294967296.0
    }
}

/**
 * 3. Native Seeded GRU/Recurrent Sequence Estimator + 50-Pass Inference Dropout (Approximation).
 * Explicitly marked as approximate native sequence model (NOT PyTorch LSTM) and uncalibrated dispersion.
 */
class NativeSequenceRecurrentModel : ForecastModelPlugin {
    override val id = "native_seq_recurrent_approx"
    override val name = "Recurrent Seq + MC Dropout (Native Approx)"
    override val family = "SEQUENCE_APPROX"
    override val modelVersion = "1.0.0"
    override val isApproximation = true
    override val isCalibratedInterval = false
    override val description =
        "Deterministic seeded 1-layer tanh-GRU sequence model trained on training-window-only standardized returns with 50-pass inference dropout; native approximation (not PyTorch LSTM)."
    override val defaultEnabled = true
    override val defaultWeight = 0.16
    override val defaultParams = mapOf(
        "seqLength" to 16.0,
        "mcSamples" to 50.0,
        "dropoutRate" to 0.20,
        "epochs" to 16.0
    )

    override fun predict(
        features: ExtractedForecastFeatures,
        horizon: Int,
        params: Map<String, Double>
    ): PluginPrediction {
        val returns = features.logReturns
        val n = returns.size
        val seqLen = (params["seqLength"] ?: 16.0).toInt().coerceIn(8, 20)
        val minNeeded = seqLen + 14
        if (n < minNeeded) {
            return PluginPrediction(
                modelId = id,
                meanReturns = DoubleArray(0),
                sigmas = DoubleArray(0),
                status = ModelExecutionStatus.SKIPPED_LOW_DATA,
                reason = "Sequence model requires >= $minNeeded return bars (have $n)",
                isApproximation = isApproximation,
                isCalibratedInterval = isCalibratedInterval,
                modelVersion = modelVersion
            )
        }

        val mu = features.meanReturn
        val sd = max(1e-6, features.uncondSigma)
        val zSeries = DoubleArray(n) { ((returns[it] - mu) / sd).coerceIn(-4.0, 4.0) }

        val hiddenSize = 8
        val rng = createSeededRng(42)
        fun randInit(scale: Double): Double = (rng() * 2.0 - 1.0) * scale

        val wz = Array(hiddenSize) { doubleArrayOf(randInit(0.25), randInit(0.25)) }
        val uz = Array(hiddenSize) { DoubleArray(hiddenSize) { randInit(0.18) } }
        val wh = Array(hiddenSize) { doubleArrayOf(randInit(0.25), randInit(0.25)) }
        val uh = Array(hiddenSize) { DoubleArray(hiddenSize) { randInit(0.18) } }
        val wOut = DoubleArray(hiddenSize) { randInit(0.20) }
        var bOut = 0.0

        fun sigmoid(x: Double): Double = 1.0 / (1.0 + exp(-x.coerceIn(-12.0, 12.0)))
        val hBufA = DoubleArray(hiddenSize)
        val hBufB = DoubleArray(hiddenSize)
        val finalHBuf = DoubleArray(hiddenSize)

        fun forwardWindow(
            seq: DoubleArray,
            startIdx: Int,
            length: Int,
            dropMask: DoubleArray? = null
        ): Pair<Double, DoubleArray> {
            hBufA.fill(0.0)
            var h = hBufA
            var nextH = hBufB
            var runAvg = 0.0
            for (t in 0 until length) {
                val x0 = seq[startIdx + t]
                runAvg = 0.7 * runAvg + 0.3 * x0
                for (i in 0 until hiddenSize) {
                    var zPre = wz[i][0] * x0 + wz[i][1] * runAvg
                    var hPre = wh[i][0] * x0 + wh[i][1] * runAvg
                    val uzRow = uz[i]
                    val uhRow = uh[i]
                    for (j in 0 until hiddenSize) {
                        zPre += uzRow[j] * h[j]
                        hPre += uhRow[j] * h[j]
                    }
                    val zGate = sigmoid(zPre)
                    val cand = tanh(hPre)
                    nextH[i] = (1.0 - zGate) * h[i] + zGate * cand
                }
                val tmp = h
                h = nextH
                nextH = tmp
            }
            var yHat = bOut
            for (i in 0 until hiddenSize) {
                finalHBuf[i] = h[i]
                val v = if (dropMask != null) h[i] * dropMask[i] else h[i]
                yHat += wOut[i] * v
            }
            return Pair(yHat, finalHBuf)
        }

        val maxStart = max(0, zSeries.size - 96)
        val sampleIndices = ArrayList<Int>()
        for (idx in (maxStart + seqLen) until zSeries.size) {
            sampleIndices.add(idx)
        }

        val epochs = (params["epochs"] ?: 16.0).toInt().coerceIn(6, 20)
        val lr = 0.018
        val dropRate = (params["dropoutRate"] ?: 0.20).coerceIn(0.05, 0.45)
        val scaleKeep = 1.0 / (1.0 - dropRate)
        val maskBuf = DoubleArray(hiddenSize)

        for (ep in 0 until epochs) {
            for (sIdx in sampleIndices.indices) {
                val endIdx = sampleIndices[sIdx]
                for (i in 0 until hiddenSize) maskBuf[i] = if (rng() < dropRate) 0.0 else scaleKeep
                val (yHat, finalH) = forwardWindow(zSeries, endIdx - seqLen, seqLen, maskBuf)
                val err = (yHat - zSeries[endIdx]).coerceIn(-2.5, 2.5)

                bOut -= lr * (err + 1e-4 * bOut)
                val lastX = zSeries[endIdx - 1]
                for (i in 0 until hiddenSize) {
                    val hMasked = finalH[i] * maskBuf[i]
                    val gOut = (err * hMasked + 1e-4 * wOut[i]).coerceIn(-1.0, 1.0)
                    wOut[i] -= lr * gOut
                    val hGrad = (err * wOut[i] * maskBuf[i] * (1.0 - finalH[i] * finalH[i])).coerceIn(-0.5, 0.5)
                    wh[i][0] -= lr * 0.35 * hGrad * lastX
                }
            }
        }

        val mcSamples = (params["mcSamples"] ?: 50.0).toInt().coerceIn(20, 80)
        val totalSteps = max(horizon, CANONICAL_FORECAST_HORIZON)
        data class SampleStep(val stepRet: Double, val cumRet: Double)
        val stepBuckets = Array(horizon) { ArrayList<SampleStep>(mcSamples) }
        val mcRng = createSeededRng(1007)
        val stepCap = features.uncondSigma * 0.85
        val windowBuf = DoubleArray(seqLen + totalSteps)

        for (m in 0 until mcSamples) {
            for (i in 0 until seqLen) windowBuf[i] = zSeries[zSeries.size - seqLen + i]
            var cumRet = 0.0
            for (h in 0 until totalSteps) {
                for (i in 0 until hiddenSize) maskBuf[i] = if (mcRng() < dropRate) 0.0 else scaleKeep
                val (yHat, _) = forwardWindow(windowBuf, h, seqLen, maskBuf)
                val clampedZ = yHat.coerceIn(-2.5, 2.5)
                val stepRet = (mu + clampedZ * sd).coerceIn(-stepCap, stepCap)
                cumRet += stepRet
                if (h < horizon) {
                    stepBuckets[h].add(SampleStep(stepRet, cumRet))
                }
                windowBuf[seqLen + h] = clampedZ
            }
        }

        val meanReturns = DoubleArray(horizon)
        val sigmas = DoubleArray(horizon)
        val directQ10 = DoubleArray(horizon)
        val directQ25 = DoubleArray(horizon)
        val directQ50 = DoubleArray(horizon)
        val directQ75 = DoubleArray(horizon)
        val directQ90 = DoubleArray(horizon)

        for (h in 0 until horizon) {
            val rows = stepBuckets[h]
            val stepMean = rows.sumOf { it.stepRet } / rows.size.toDouble()
            var stepVar = 0.0
            for (r in rows) {
                val d = r.stepRet - stepMean
                stepVar += d * d
            }
            stepVar /= max(1, rows.size - 1).toDouble()
            meanReturns[h] = stepMean
            sigmas[h] = max(features.ewmaSigma * 0.75, sqrt(stepVar) + features.ewmaSigma * 0.55)

            val sortedPrices = rows.map { features.lastClose * exp(it.cumRet) }.toDoubleArray()
            sortedPrices.sort()

            val mcMed = percentileSorted(sortedPrices, 0.50)
            val baseVolSpan = features.lastClose * features.ewmaSigma * sqrt((h + 1).toDouble())
            val raw10 = min(percentileSorted(sortedPrices, 0.10), mcMed - 1.28155 * baseVolSpan * 0.70)
            val raw25 = min(percentileSorted(sortedPrices, 0.25), mcMed - 0.67449 * baseVolSpan * 0.70)
            val raw75 = max(percentileSorted(sortedPrices, 0.75), mcMed + 0.67449 * baseVolSpan * 0.70)
            val raw90 = max(percentileSorted(sortedPrices, 0.90), mcMed + 1.28155 * baseVolSpan * 0.70)

            val q = ForecastCalendarHelper.enforceMonotonicQuantiles(
                raw10, raw25, mcMed, raw75, raw90, features.lastClose * 0.01
            )
            directQ10[h] = q[0]
            directQ25[h] = q[1]
            directQ50[h] = q[2]
            directQ75[h] = q[3]
            directQ90[h] = q[4]
        }

        return PluginPrediction(
            modelId = id,
            meanReturns = meanReturns,
            sigmas = sigmas,
            status = ModelExecutionStatus.SUCCESS,
            reason = "",
            isApproximation = isApproximation,
            isCalibratedInterval = isCalibratedInterval,
            directQuantiles = DirectQuantiles(directQ10, directQ25, directQ50, directQ75, directQ90),
            modelVersion = modelVersion,
            meta = mapOf("seqLen" to seqLen, "mcSamples" to mcSamples, "hiddenSize" to hiddenSize, "prefixSteps" to totalSteps)
        )
    }
}

/**
 * 4. Native Gated Multi-Feature Attention Quantile Forecaster (Approximation).
 * Enforces the 90-bar minimum input gate cleanly (returns SKIPPED_LOW_DATA if < 90 bars).
 * Uses canonical 60-step rollout then slices to horizon for 100% prefix invariance.
 */
class NativeQuantileAttentionModel : ForecastModelPlugin {
    override val id = "native_quantile_attention_approx"
    override val name = "Quantile Attention TFT (Native Approx)"
    override val family = "ATTENTION_APPROX"
    override val modelVersion = "1.0.0"
    override val isApproximation = true
    override val isCalibratedInterval = false
    override val description =
        "Variable-selection + scaled dot-product attention multi-quantile regressor with <90-bar gate; simplified native approximation (not PyTorch Forecasting TFT)."
    override val defaultEnabled = true
    override val defaultWeight = 0.16
    override val defaultParams = mapOf(
        "minRequiredBars" to 90.0,
        "encoderLength" to 24.0,
        "epochs" to 18.0
    )

    override fun predict(
        features: ExtractedForecastFeatures,
        horizon: Int,
        params: Map<String, Double>
    ): PluginPrediction {
        val candles = features.candles
        val returns = features.logReturns
        val minRequired = (params["minRequiredBars"] ?: 90.0).toInt().coerceAtLeast(60)
        if (candles.size < minRequired || returns.size < minRequired - 2) {
            return PluginPrediction(
                modelId = id,
                meanReturns = DoubleArray(0),
                sigmas = DoubleArray(0),
                status = ModelExecutionStatus.SKIPPED_LOW_DATA,
                reason = "Quantile-Attention TFT gate requires >= $minRequired bars (have ${candles.size})",
                isApproximation = isApproximation,
                isCalibratedInterval = isCalibratedInterval,
                modelVersion = modelVersion
            )
        }

        val encLen = (params["encoderLength"] ?: 24.0).toInt().coerceIn(12, 30)
        val sd = max(1e-6, features.uncondSigma)
        val mu = features.meanReturn
        val nBars = candles.size
        val avgVol = candles.sumOf { max(1.0, it.volume) } / max(1, nBars).toDouble()

        val fDim = 6
        val featVecs = ArrayList<DoubleArray>(nBars)
        for (i in 1 until nBars) {
            val c = candles[i]
            val ret = returns.getOrElse(i - 1) { 0.0 }
            val retZ = ((ret - mu) / sd).coerceIn(-4.0, 4.0)
            val rangeRatio = (((c.high - c.low) / max(1e-8, features.atr14)) - 1.0).coerceIn(0.0, 4.0)
            val volZ = (((max(1.0, c.volume) - avgVol) / max(1.0, avgVol))).coerceIn(-2.0, 3.0)
            val bodySign = if (c.close >= c.open) 1.0 else -1.0
            val ms = c.openTimeUtcMs.toDouble()
            val dayPhase = ((ms % 86_400_000.0) / 86_400_000.0) * 2.0 * PI
            featVecs.add(doubleArrayOf(retZ, rangeRatio, volZ, bodySign, sin(dayPhase), cos(dayPhase)))
        }

        val varScores = DoubleArray(fDim)
        for (t in 1 until featVecs.size) {
            val yNext = featVecs[t][0]
            for (d in 0 until fDim) {
                varScores[d] += abs(featVecs[t - 1][d] * yNext)
            }
        }
        var maxScore = 1e-6
        for (v in varScores) if (v > maxScore) maxScore = v
        val expScores = DoubleArray(fDim) { exp(varScores[it] / maxScore) }
        val sumExp = expScores.sum().let { if (it > 0.0) it else 1.0 }
        val vWeights = DoubleArray(fDim) { expScores[it] / sumExp }

        fun summarizeContext(endIdx: Int): DoubleArray {
            val start = max(0, endIdx - encLen)
            val len = endIdx - start
            val query = featVecs[endIdx - 1]
            val attnWeights = DoubleArray(len)
            var maxLogit = Double.NEGATIVE_INFINITY
            for (i in 0 until len) {
                val key = featVecs[start + i]
                var dot = 0.0
                for (d in 0 until fDim) dot += vWeights[d] * query[d] * key[d]
                val logit = dot / sqrt(fDim.toDouble()) - 0.04 * (len - 1 - i)
                attnWeights[i] = logit
                if (logit > maxLogit) maxLogit = logit
            }
            var wSum = 0.0
            for (i in 0 until len) {
                attnWeights[i] = exp(attnWeights[i] - maxLogit)
                wSum += attnWeights[i]
            }
            val ctx = DoubleArray(fDim + 1)
            ctx[0] = 1.0 // bias
            val denom = if (wSum > 1e-9) wSum else 1.0
            for (i in 0 until len) {
                val w = attnWeights[i] / denom
                for (d in 0 until fDim) ctx[d + 1] += w * vWeights[d] * featVecs[start + i][d]
            }
            return ctx
        }

        val taus = doubleArrayOf(0.10, 0.25, 0.50, 0.75, 0.90)
        val heads = Array(taus.size) { DoubleArray(fDim + 1) }
        val epochs = (params["epochs"] ?: 18.0).toInt().coerceIn(8, 25)
        val lr = 0.025
        val trainEnd = featVecs.size - 1
        val trainStart = max(encLen, trainEnd - 90)
        val cachedContexts = arrayOfNulls<DoubleArray>(trainEnd)
        for (t in trainStart until trainEnd) {
            cachedContexts[t] = summarizeContext(t)
        }

        for (ep in 0 until epochs) {
            for (t in trainStart until trainEnd) {
                val ctx = cachedContexts[t] ?: continue
                val target = featVecs[t][0]
                for (qi in taus.indices) {
                    val tau = taus[qi]
                    val w = heads[qi]
                    var pred = 0.0
                    for (j in w.indices) pred += w[j] * ctx[j]
                    val err = target - pred
                    val gradScale = if (err >= 0.0) -tau else (1.0 - tau)
                    for (j in w.indices) {
                        w[j] -= lr * (gradScale * ctx[j] + 1e-3 * w[j])
                    }
                }
            }
        }

        val latestCtx = summarizeContext(featVecs.size)
        val predQuantileZ = DoubleArray(taus.size) { qi ->
            var s = 0.0
            for (j in latestCtx.indices) s += heads[qi][j] * latestCtx[j]
            s.coerceIn(-2.5, 2.5)
        }

        val qStepRet = DoubleArray(taus.size) { mu + predQuantileZ[it] * sd }
        val meanReturns = DoubleArray(horizon)
        val sigmas = DoubleArray(horizon)
        val directQ10 = DoubleArray(horizon)
        val directQ25 = DoubleArray(horizon)
        val directQ50 = DoubleArray(horizon)
        val directQ75 = DoubleArray(horizon)
        val directQ90 = DoubleArray(horizon)

        val stepCap = features.uncondSigma * 0.80
        var cumMed = 0.0

        for (h in 0 until CANONICAL_FORECAST_HORIZON) {
            val decay = 0.92.pow(h)
            val medStep = (qStepRet[2] * decay).coerceIn(-stepCap, stepCap)
            cumMed += medStep
            val spreadScale = sqrt((h + 1).toDouble())
            val low10Step = (qStepRet[0] - qStepRet[2]) * 0.80 - 1.28155 * features.ewmaSigma * 0.55
            val low25Step = (qStepRet[1] - qStepRet[2]) * 0.80 - 0.67449 * features.ewmaSigma * 0.55
            val hi75Step = (qStepRet[3] - qStepRet[2]) * 0.80 + 0.67449 * features.ewmaSigma * 0.55
            val hi90Step = (qStepRet[4] - qStepRet[2]) * 0.80 + 1.28155 * features.ewmaSigma * 0.55

            if (h < horizon) {
                meanReturns[h] = medStep
                val iqSigma = max(features.ewmaSigma * 0.75, abs(hi90Step - low10Step) / 2.5631)
                sigmas[h] = iqSigma

                val q = ForecastCalendarHelper.enforceMonotonicQuantiles(
                    features.lastClose * exp(cumMed + low10Step * spreadScale),
                    features.lastClose * exp(cumMed + low25Step * spreadScale),
                    features.lastClose * exp(cumMed),
                    features.lastClose * exp(cumMed + hi75Step * spreadScale),
                    features.lastClose * exp(cumMed + hi90Step * spreadScale),
                    features.lastClose * 0.01
                )
                directQ10[h] = q[0]
                directQ25[h] = q[1]
                directQ50[h] = q[2]
                directQ75[h] = q[3]
                directQ90[h] = q[4]
            }
        }

        return PluginPrediction(
            modelId = id,
            meanReturns = meanReturns,
            sigmas = sigmas,
            status = ModelExecutionStatus.SUCCESS,
            reason = "",
            isApproximation = isApproximation,
            isCalibratedInterval = isCalibratedInterval,
            directQuantiles = DirectQuantiles(directQ10, directQ25, directQ50, directQ75, directQ90),
            modelVersion = modelVersion,
            meta = mapOf("encoderLength" to encLen)
        )
    }
}
