package es.manico.chartintelligence.forecast

import kotlin.math.abs
import kotlin.math.cbrt
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * CHART Forecast Engine V2 (Rev 2.1) — Statistical Tests, WIS, Conformal Calibration & Scenario Logit
 * Pure deterministic IEEE-754 routines mirrored 1:1 with host_subdomain/assets/js/forecast/statisticalTests.js.
 */
object ForecastStatisticalTests {

    val QUANTILE_TAUS_5 = doubleArrayOf(0.10, 0.25, 0.50, 0.75, 0.90)

    data class QuantileTuple(
        val q10: Double,
        val q25: Double,
        val q50: Double,
        val q75: Double,
        val q90: Double
    )

    data class DieboldMarianoResult(
        val stat: Double,
        val pValue: Double,
        val hacVar: Double,
        val lNw: Int,
        val meanDiff: Double
    )

    data class BootstrapResult(
        val pValue: Double,
        val iterationsB: Int,
        val meanBlockLen: Int
    )

    data class ConformalCalibrationState(
        val calibrationWindows: Int,
        val gammaLevel: Double,
        val calibrationStatus: String,
        val decayLambda: Double,
        val normalizedScaleQ80: Double,
        val assumptions: String
    )

    data class ScenarioLogitSample(
        val x: DoubleArray,
        val label: Int
    )

    data class ScenarioLogitReport(
        val counts: IntArray,
        val totalLocal: Int,
        val estimable: BooleanArray,
        val rawEmpiricalFrequency: DoubleArray,
        val conditionalProbabilities: DoubleArray,
        val temperature: Double,
        val oosEvaluatedCount: Int,
        val oosBrierModel: Double,
        val oosBrierClimatology: Double,
        val calibrationPassed: Boolean
    )

    fun clamp(v: Double, lo: Double, hi: Double): Double = max(lo, min(hi, v))

    /**
     * Acklam's rational approximation to standard normal inverse CDF Phi^-1(p).
     */
    fun normalInv(p: Double): Double {
        if (p <= 0.0) return -8.0
        if (p >= 1.0) return 8.0
        if (p == 0.5) return 0.0

        val a = doubleArrayOf(
            -3.969683028665376e+01,
            2.209460984245205e+02,
            -2.759285104469687e+02,
            1.383577518672690e+02,
            -3.066479806614716e+01,
            2.506628277459239e+00
        )
        val b = doubleArrayOf(
            -5.447609879822406e+01,
            1.615858368580409e+02,
            -1.556989798598866e+02,
            6.680131188771972e+01,
            -1.328068155288572e+01
        )
        val c = doubleArrayOf(
            -7.784894002430293e-03,
            -3.223964580411365e-01,
            -2.400758277161838e+00,
            -2.549732539343734e+00,
            4.374664141464968e+00,
            2.938163982698783e+00
        )
        val d = doubleArrayOf(
            7.784695709041462e-03,
            3.224671290700398e-01,
            2.445134137142996e+00,
            3.754408661907416e+00
        )

        val pLow = 0.02425
        val pHigh = 1.0 - pLow
        if (p < pLow) {
            val q = sqrt(-2.0 * ln(p))
            return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
                ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0)
        }
        if (p <= pHigh) {
            val q = p - 0.5
            val r = q * q
            return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
                (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1.0)
        }
        val q = sqrt(-2.0 * ln(1.0 - p))
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0)
    }

    private fun logGamma(z: Double): Double {
        val cof = doubleArrayOf(
            76.18009172947146,
            -86.50532032941677,
            24.01409824083091,
            -1.231739572450155,
            0.001208650973866179,
            -0.000005395239384953
        )
        val x = z
        var y = z
        var tmp = x + 5.5
        tmp -= (x + 0.5) * ln(tmp)
        var ser = 1.000000000190015
        for (j in 0 until 6) {
            y += 1.0
            ser += cof[j] / y
        }
        return -tmp + ln((2.5066282746310005 * ser) / x)
    }

    private fun betacf(a: Double, b: Double, x: Double): Double {
        val maxIter = 200
        val eps = 3e-12
        val fpMin = 1e-30
        val qab = a + b
        val qap = a + 1.0
        val qam = a - 1.0
        var c = 1.0
        var d = 1.0 - (qab * x) / qap
        if (abs(d) < fpMin) d = fpMin
        d = 1.0 / d
        var h = d
        for (m in 1..maxIter) {
            val m2 = 2.0 * m
            var aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
            d = 1.0 + aa * d
            if (abs(d) < fpMin) d = fpMin
            c = 1.0 + aa / c
            if (abs(c) < fpMin) c = fpMin
            d = 1.0 / d
            h *= d * c
            aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
            d = 1.0 + aa * d
            if (abs(d) < fpMin) d = fpMin
            c = 1.0 + aa / c
            if (abs(c) < fpMin) c = fpMin
            d = 1.0 / d
            val del = d * c
            h *= del
            if (abs(del - 1.0) < eps) break
        }
        return h
    }

    private fun regularizedBeta(x: Double, a: Double, b: Double): Double {
        if (x <= 0.0) return 0.0
        if (x >= 1.0) return 1.0
        val bt = exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * ln(x) + b * ln(1.0 - x))
        return if (x < (a + 1.0) / (a + b + 2.0)) {
            (bt * betacf(a, b, x)) / a
        } else {
            1.0 - (bt * betacf(b, a, 1.0 - x)) / b
        }
    }

    fun studentTCdf(t: Double, df: Double): Double {
        if (!t.isFinite()) return if (t < 0) 0.0 else 1.0
        if (df <= 0.0) return if (t < 0) 0.0 else 1.0
        if (t == 0.0) return 0.5
        val x = df / (df + t * t)
        val ib = regularizedBeta(x, df / 2.0, 0.5)
        return if (t >= 0.0) 1.0 - 0.5 * ib else 0.5 * ib
    }

    fun pinballLoss(y: Double, qPred: Double, tau: Double): Double {
        val diff = y - qPred
        return if (diff >= 0.0) tau * diff else (tau - 1.0) * diff
    }

    fun computeWis5Q(actualY: Double, q: QuantileTuple): Double {
        val qs = doubleArrayOf(q.q10, q.q25, q.q50, q.q75, q.q90)
        var sum = 0.0
        for (k in 0 until 5) {
            sum += pinballLoss(actualY, qs[k], QUANTILE_TAUS_5[k])
        }
        return 0.4 * sum
    }

    fun computeNaiveSigmaRw(trainLogReturns: DoubleArray): Double {
        if (trainLogReturns.size < 2) return 1e-4
        val n = trainLogReturns.size
        var mean = 0.0
        for (r in trainLogReturns) mean += r
        mean /= n.toDouble()
        var sumSq = 0.0
        for (r in trainLogReturns) {
            val d = r - mean
            sumSq += d * d
        }
        return max(1e-6, sqrt(sumSq / max(1, n - 1).toDouble()))
    }

    fun buildZeroDriftLogNormalNaiveQuantiles(anchorClose: Double, sigmaRw: Double, stepH: Int): QuantileTuple {
        val p0 = max(1e-8, anchorClose)
        val scale = max(1e-6, sigmaRw) * sqrt(max(1, stepH).toDouble())
        return QuantileTuple(
            q10 = p0 * exp(scale * normalInv(0.10)),
            q25 = p0 * exp(scale * normalInv(0.25)),
            q50 = p0,
            q75 = p0 * exp(scale * normalInv(0.75)),
            q90 = p0 * exp(scale * normalInv(0.90))
        )
    }

    fun computeBartlettEffectiveSampleSize(series: DoubleArray, horizonBars: Int): Double {
        val kOuter = series.size
        if (kOuter <= 0) return 0.0
        if (kOuter < 4) return kOuter.toDouble()

        val kMax = min(max(1, horizonBars), kOuter / 4)
        var mean = 0.0
        for (v in series) mean += v
        mean /= kOuter.toDouble()

        var gamma0 = 0.0
        for (v in series) {
            val d = v - mean
            gamma0 += d * d
        }
        gamma0 /= kOuter.toDouble()
        if (gamma0 <= 1e-18) return kOuter.toDouble()

        var acfWeightedSum = 0.0
        for (lag in 1..kMax) {
            var gammaK = 0.0
            for (t in lag until kOuter) {
                gammaK += (series[t] - mean) * (series[t - lag] - mean)
            }
            gammaK /= kOuter.toDouble()
            val rhoK = max(0.0, gammaK / gamma0)
            val weight = 1.0 - lag.toDouble() / (kMax + 1).toDouble()
            acfWeightedSum += weight * rhoK
        }
        return clamp(kOuter.toDouble() / (1.0 + 2.0 * acfWeightedSum), 0.1, kOuter.toDouble())
    }

    fun hlnModifiedDieboldMariano(dSeries: DoubleArray, effectiveHorizonH: Int = 1): DieboldMarianoResult {
        val k = dSeries.size
        if (k < 5) {
            return DieboldMarianoResult(stat = 0.0, pValue = 1.0, hacVar = 0.0, lNw = 0, meanDiff = 0.0)
        }

        var meanD = 0.0
        for (d in dSeries) meanD += d
        meanD /= k.toDouble()

        val lNw = max(0, floor(cbrt(k.toDouble())).toInt())
        var gamma0 = 0.0
        for (d in dSeries) {
            val c = d - meanD
            gamma0 += c * c
        }
        gamma0 /= k.toDouble()

        var hacVar = gamma0
        for (lag in 1..lNw) {
            var gk = 0.0
            for (t in lag until k) {
                gk += (dSeries[t] - meanD) * (dSeries[t - lag] - meanD)
            }
            gk /= k.toDouble()
            hacVar += 2.0 * (1.0 - lag.toDouble() / (lNw + 1).toDouble()) * gk
        }
        if (hacVar <= 1e-18) {
            hacVar = max(1e-12, gamma0)
        }

        val h = max(1, effectiveHorizonH).toDouble()
        val kD = k.toDouble()
        val hlnFactor = sqrt(max(1e-9, (kD + 1.0 - 2.0 * h + (h * (h - 1.0)) / kD) / kD))
        val se = sqrt(max(1e-18, hacVar) / kD)
        val stat = (meanD / se) * hlnFactor
        val pValue = studentTCdf(stat, (k - 1).toDouble())

        return DieboldMarianoResult(
            stat = if (stat.isFinite()) stat else 0.0,
            pValue = if (pValue.isFinite()) pValue else 1.0,
            hacVar = hacVar,
            lNw = lNw,
            meanDiff = meanD
        )
    }

    fun centeredStationaryBlockBootstrap(
        dSeries: DoubleArray,
        iterationsB: Int = 1000,
        meanBlockLen: Int = 4,
        seed: Int = 133742
    ): BootstrapResult {
        val k = dSeries.size
        if (k < 5) return BootstrapResult(pValue = 1.0, iterationsB = iterationsB, meanBlockLen = meanBlockLen)

        var meanD = 0.0
        for (d in dSeries) meanD += d
        meanD /= k.toDouble()

        var allZero = true
        val centered = DoubleArray(k)
        for (i in 0 until k) {
            centered[i] = dSeries[i] - meanD
            if (abs(centered[i]) > 1e-14) allZero = false
        }
        if (allZero && meanD >= 0.0) {
            return BootstrapResult(pValue = 1.0, iterationsB = iterationsB, meanBlockLen = meanBlockLen)
        }

        // Exact 32-bit Mulberry32 matching JS integer semantics
        var a = seed
        fun nextRand(): Double {
            a += 0x6d2b79f5
            var t = (a xor (a ushr 15)) * (1 or a)
            t = (t + ((t xor (t ushr 7)) * (61 or t))) xor t
            return ((t xor (t ushr 14)).toLong() and 0xFFFFFFFFL).toDouble() / 4294967296.0
        }

        val pJump = 1.0 / max(1, meanBlockLen).toDouble()
        var extremeCount = 0

        for (b in 0 until iterationsB) {
            var idx = floor(nextRand() * k).toInt()
            var sum = centered[idx]
            for (step in 1 until k) {
                idx = if (nextRand() < pJump) {
                    floor(nextRand() * k).toInt()
                } else {
                    (idx + 1) % k
                }
                sum += centered[idx]
            }
            val bootMean = sum / k.toDouble()
            if (bootMean <= meanD) extremeCount++
        }

        return BootstrapResult(
            pValue = (1 + extremeCount).toDouble() / (iterationsB + 1).toDouble(),
            iterationsB = iterationsB,
            meanBlockLen = meanBlockLen
        )
    }

    fun fitVolatilityNormalizedConformal(
        calOriginScores: DoubleArray,
        alpha: Double = 0.20,
        lambdaCal: Double = 0.92
    ): ConformalCalibrationState {
        val m = calOriginScores.size
        val gammaLevel = if (m > 0) ceil((m + 1) * (1.0 - alpha)) / m.toDouble() else Double.POSITIVE_INFINITY
        val roundedGamma = if (gammaLevel.isFinite()) (gammaLevel * 10000.0).roundToInt() / 10000.0 else 1.0

        if (m < 10 || !gammaLevel.isFinite() || gammaLevel > 1.0) {
            return ConformalCalibrationState(
                calibrationWindows = m,
                gammaLevel = roundedGamma,
                calibrationStatus = "UNDER_SAMPLED",
                decayLambda = lambdaCal,
                normalizedScaleQ80 = 0.0,
                assumptions = "Requires M_cal >= 10 and gamma <= 1.0 under local approximate exchangeability"
            )
        }

        data class WeightedScore(val score: Double, var weight: Double)

        val items = ArrayList<WeightedScore>(m)
        var wSum = 0.0
        for (i in 0 until m) {
            val w = lambdaCal.pow((m - 1 - i).toDouble())
            wSum += w
            items.add(WeightedScore(score = max(0.0, calOriginScores[i]), weight = w))
        }
        val denom = if (wSum > 0.0) wSum else 1.0
        for (it in items) it.weight /= denom
        items.sortBy { it.score }

        var cumW = 0.0
        var qGamma = items.last().score
        for (it in items) {
            cumW += it.weight
            if (cumW >= gammaLevel - 1e-12) {
                qGamma = it.score
                break
            }
        }

        return ConformalCalibrationState(
            calibrationWindows = m,
            gammaLevel = roundedGamma,
            calibrationStatus = "CALIBRATED_NORMALIZED",
            decayLambda = lambdaCal,
            normalizedScaleQ80 = qGamma,
            assumptions = "Local approximate exchangeability of volatility-normalized nonconformity residuals"
        )
    }

    fun applyConformalAdjustmentToQuantiles(
        qRaw: QuantileTuple,
        anchorClose: Double,
        ewmaSigma: Double,
        stepH: Int,
        conformalState: ConformalCalibrationState?,
        floorPrice: Double = 1e-6
    ): QuantileTuple {
        if (conformalState == null ||
            conformalState.calibrationStatus != "CALIBRATED_NORMALIZED" ||
            conformalState.normalizedScaleQ80 <= 0.0
        ) {
            return qRaw
        }
        val margin80 = conformalState.normalizedScaleQ80 *
            max(1e-8, anchorClose) *
            max(1e-6, ewmaSigma) *
            sqrt(max(1, stepH).toDouble())
        val margin50 = margin80 * (0.67448975 / 1.28155157)
        val q10 = max(floorPrice, qRaw.q10 - margin80)
        val q25 = max(q10, qRaw.q25 - margin50)
        val q50 = max(q25, qRaw.q50)
        val q75 = max(q50, qRaw.q75 + margin50)
        val q90 = max(q75, qRaw.q90 + margin80)
        return QuantileTuple(q10, q25, q50, q75, q90)
    }

    fun fitAndEvaluateScenarioLogit(
        trainSamples: List<ScenarioLogitSample>,
        calSamples: List<ScenarioLogitSample>,
        outerSamples: List<ScenarioLogitSample>,
        currentFeatureVec: DoubleArray = doubleArrayOf(1.0, 0.0, 0.0, 0.0)
    ): ScenarioLogitReport {
        val kClasses = 3
        val d = currentFeatureVec.size
        val counts = intArrayOf(0, 0, 0)
        for (s in trainSamples) if (s.label in 0..2) counts[s.label]++
        for (s in calSamples) if (s.label in 0..2) counts[s.label]++
        val totalLocal = counts[0] + counts[1] + counts[2]
        val estimable = BooleanArray(kClasses) { counts[it] >= 3 }
        val rawFreq = DoubleArray(kClasses) {
            if (totalLocal > 0) counts[it].toDouble() / totalLocal.toDouble() else 0.0
        }

        fun softmax(logits: DoubleArray, temp: Double = 1.0): DoubleArray {
            val tDiv = max(0.1, temp)
            val scaled = DoubleArray(logits.size) { logits[it] / tDiv }
            var maxL = Double.NEGATIVE_INFINITY
            for (v in scaled) if (v > maxL) maxL = v
            val exps = DoubleArray(logits.size) { exp(clamp(scaled[it] - maxL, -40.0, 40.0)) }
            val sum = exps.sum().let { if (it > 0.0) it else 1.0 }
            return DoubleArray(logits.size) { exps[it] / sum }
        }

        val weights = Array(kClasses) { DoubleArray(d) }
        val lr = 0.12
        val l2 = 0.05
        if (trainSamples.size >= 6) {
            val trainCounts = intArrayOf(0, 0, 0)
            for (s in trainSamples) if (s.label in 0..2) trainCounts[s.label]++
            for (k in 0 until kClasses) {
                weights[k][0] = ln(max(0.02, (trainCounts[k] + 0.5) / (trainSamples.size + 1.5)))
            }
            for (epoch in 0 until 80) {
                val grad = Array(kClasses) { DoubleArray(d) }
                for (s in trainSamples) {
                    val logits = DoubleArray(kClasses) { k ->
                        var dot = 0.0
                        for (j in 0 until d) dot += weights[k][j] * (s.x.getOrNull(j) ?: 0.0)
                        dot
                    }
                    val probs = softmax(logits, 1.0)
                    for (k in 0 until kClasses) {
                        val err = probs[k] - (if (s.label == k) 1.0 else 0.0)
                        for (j in 0 until d) {
                            grad[k][j] += err * (s.x.getOrNull(j) ?: 0.0)
                        }
                    }
                }
                val nTrain = trainSamples.size.toDouble()
                for (k in 0 until kClasses) {
                    for (j in 0 until d) {
                        val reg = if (j == 0) 0.0 else l2 * weights[k][j]
                        weights[k][j] -= lr * (grad[k][j] / nTrain + reg)
                    }
                }
            }
        }

        fun predictLogits(xVec: DoubleArray): DoubleArray = DoubleArray(kClasses) { k ->
            var dot = 0.0
            for (j in 0 until d) dot += weights[k][j] * (xVec.getOrNull(j) ?: 0.0)
            dot
        }

        var bestTemp = 1.0
        if (calSamples.size >= 5) {
            var bestNll = Double.POSITIVE_INFINITY
            var t = 0.5
            while (t <= 3.05) {
                var nll = 0.0
                for (s in calSamples) {
                    val p = softmax(predictLogits(s.x), t)
                    nll -= ln(max(1e-9, p[s.label]))
                }
                if (nll < bestNll) {
                    bestNll = nll
                    bestTemp = (t * 100.0).roundToInt() / 100.0
                }
                t += 0.1
            }
        }

        val trainOnlyCounts = intArrayOf(0, 0, 0)
        for (s in trainSamples) if (s.label in 0..2) trainOnlyCounts[s.label]++
        val nTr = max(1, trainSamples.size).toDouble()
        val climP = DoubleArray(kClasses) { trainOnlyCounts[it].toDouble() / nTr }

        var oosBrierModel = 0.0
        var oosBrierClim = 0.0
        if (outerSamples.isNotEmpty()) {
            for (s in outerSamples) {
                val pMod = softmax(predictLogits(s.x), bestTemp)
                for (k in 0 until kClasses) {
                    val yk = if (s.label == k) 1.0 else 0.0
                    oosBrierModel += (pMod[k] - yk) * (pMod[k] - yk)
                    oosBrierClim += (climP[k] - yk) * (climP[k] - yk)
                }
            }
            oosBrierModel /= outerSamples.size.toDouble()
            oosBrierClim /= outerSamples.size.toDouble()
        }

        val allEstimable = estimable[0] && estimable[1] && estimable[2]
        val calibrationPassed = outerSamples.isNotEmpty() && allEstimable && oosBrierModel <= oosBrierClim + 1e-9
        val condProbs = softmax(predictLogits(currentFeatureVec), bestTemp)

        return ScenarioLogitReport(
            counts = counts,
            totalLocal = totalLocal,
            estimable = estimable,
            rawEmpiricalFrequency = rawFreq,
            conditionalProbabilities = condProbs,
            temperature = bestTemp,
            oosEvaluatedCount = outerSamples.size,
            oosBrierModel = (oosBrierModel * 10000.0).roundToInt() / 10000.0,
            oosBrierClimatology = (oosBrierClim * 10000.0).roundToInt() / 10000.0,
            calibrationPassed = calibrationPassed
        )
    }
}
