package es.manico.chartintelligence.forecast

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt

data class PluginPrediction(
    val modelId: String,
    val meanReturns: DoubleArray,
    val sigmas: DoubleArray
)

interface ForecastModelPlugin {
    val id: String
    val name: String
    val family: String
    val description: String
    val defaultEnabled: Boolean
    val defaultWeight: Double
    val defaultParams: Map<String, Double>

    fun predict(
        features: ExtractedForecastFeatures,
        horizon: Int,
        params: Map<String, Double>
    ): PluginPrediction
}

class NaivePersistenceModel : ForecastModelPlugin {
    override val id = "naive_persistence"
    override val name = "Naive Persistence (Random Walk)"
    override val family = "BASELINE"
    override val description = "Zero-drift log-return benchmark with constant EWMA volatility; acceptance gate floor."
    override val defaultEnabled = true
    override val defaultWeight = 0.10
    override val defaultParams = mapOf("volFloor" to 0.0005)

    override fun predict(features: ExtractedForecastFeatures, horizon: Int, params: Map<String, Double>): PluginPrediction {
        val floor = params["volFloor"] ?: 0.0005
        val sigma = max(floor, features.ewmaSigma)
        return PluginPrediction(id, DoubleArray(horizon), DoubleArray(horizon) { sigma })
    }
}

class HistoricalDriftModel : ForecastModelPlugin {
    override val id = "historical_drift"
    override val name = "Damped Historical Drift"
    override val family = "BASELINE"
    override val description = "Recent log-return drift decaying exponentially toward zero with volatility scaling."
    override val defaultEnabled = true
    override val defaultWeight = 0.16
    override val defaultParams = mapOf("damping" to 0.90, "lookback" to 24.0)

    override fun predict(features: ExtractedForecastFeatures, horizon: Int, params: Map<String, Double>): PluginPrediction {
        val damping = (params["damping"] ?: 0.90).coerceIn(0.5, 0.99)
        val lookback = (params["lookback"] ?: 24.0).toInt().coerceIn(6, max(6, features.logReturns.size))
        val tail = features.logReturns.takeLast(min(lookback, features.logReturns.size))
        val avg = tail.average()
        val cap = features.uncondSigma * 0.45
        val cappedDrift = avg.coerceIn(-cap, cap)
        val baseSigma = max(1e-5, features.ewmaSigma)

        val means = DoubleArray(horizon)
        val sigmas = DoubleArray(horizon)
        var phi = 1.0
        for (h in 0 until horizon) {
            phi *= damping
            means[h] = cappedDrift * phi
            sigmas[h] = baseSigma * (1.0 + 0.015 * h)
        }
        return PluginPrediction(id, means, sigmas)
    }
}

class KalmanMomentumModel : ForecastModelPlugin {
    override val id = "kalman_momentum"
    override val name = "Kalman State-Space Filter"
    override val family = "STATE_SPACE"
    override val description = "2-state linear Kalman filter tracking latent log-return level and momentum velocity."
    override val defaultEnabled = true
    override val defaultWeight = 0.24
    override val defaultParams = mapOf("processNoise" to 0.08, "obsNoise" to 1.0, "velocityDecay" to 0.86)

    override fun predict(features: ExtractedForecastFeatures, horizon: Int, params: Map<String, Double>): PluginPrediction {
        val returns = features.logReturns
        val obsVar = max(1e-10, features.uncondVariance * (params["obsNoise"] ?: 1.0))
        val qLevel = max(1e-11, obsVar * (params["processNoise"] ?: 0.08))
        val qVel = qLevel * 0.35
        val decay = (params["velocityDecay"] ?: 0.86).coerceIn(0.6, 0.96)

        var x0 = returns.firstOrNull() ?: 0.0
        var x1 = 0.0
        var p00 = obsVar
        var p01 = 0.0
        var p10 = 0.0
        var p11 = obsVar * 0.5

        for (i in 1 until returns.size) {
            val px0 = 0.82 * x0 + x1
            val px1 = decay * x1
            val np00 = 0.82 * 0.82 * p00 + 0.82 * (p01 + p10) + p11 + qLevel
            val np01 = 0.82 * decay * p01 + decay * p11
            val np10 = 0.82 * decay * p10 + decay * p11
            val np11 = decay * decay * p11 + qVel

            val y = returns[i] - px0
            val s = np00 + obsVar
            val k0 = np00 / s
            val k1 = np10 / s

            x0 = px0 + k0 * y
            x1 = px1 + k1 * y
            p00 = (1.0 - k0) * np00
            p01 = (1.0 - k0) * np01
            p10 = np10 - k1 * np00
            p11 = np11 - k1 * np01
        }

        val means = DoubleArray(horizon)
        val sigmas = DoubleArray(horizon)
        var curLevel = x0.coerceIn(-features.uncondSigma * 0.65, features.uncondSigma * 0.65)
        var curVel = x1.coerceIn(-features.uncondSigma * 0.35, features.uncondSigma * 0.35)
        var stepVar = p00

        for (h in 0 until horizon) {
            curLevel = 0.82 * curLevel + curVel
            curVel *= decay
            stepVar = min(features.uncondVariance * 2.2, 0.82 * 0.82 * stepVar + qLevel + obsVar * 0.92)
            means[h] = curLevel
            sigmas[h] = max(features.ewmaSigma * 0.65, sqrt(stepVar))
        }
        return PluginPrediction(id, means, sigmas)
    }
}

class GarchVolatilityModel : ForecastModelPlugin {
    override val id = "garch_volatility"
    override val name = "GARCH(1,1) Conditional Volatility"
    override val family = "VOLATILITY"
    override val description = "Models time-varying volatility clustering with mean-reverting conditional variance."
    override val defaultEnabled = true
    override val defaultWeight = 0.24
    override val defaultParams = mapOf("alpha" to 0.09, "beta" to 0.87, "meanRevertPull" to 0.84)

    override fun predict(features: ExtractedForecastFeatures, horizon: Int, params: Map<String, Double>): PluginPrediction {
        val alpha = (params["alpha"] ?: 0.09).coerceIn(0.02, 0.25)
        val beta = (params["beta"] ?: 0.87).coerceIn(0.50, 0.95 - alpha)
        val persistence = alpha + beta
        val uncondVar = max(1e-10, features.uncondVariance)
        val omega = uncondVar * max(0.01, 1.0 - persistence)

        var hVar = uncondVar
        val mu = features.meanReturn
        for (r in features.logReturns) {
            val eps = r - mu
            hVar = omega + alpha * (eps * eps) + beta * hVar
        }

        val cap = features.uncondSigma * 0.40
        var drift = (features.recentMeanReturn * 0.65 + mu * 0.35).coerceIn(-cap, cap)
        val pull = (params["meanRevertPull"] ?: 0.84).coerceIn(0.65, 0.97)

        val means = DoubleArray(horizon)
        val sigmas = DoubleArray(horizon)
        var curVar = hVar
        for (h in 0 until horizon) {
            curVar = omega + persistence * curVar
            drift *= pull
            means[h] = drift
            sigmas[h] = max(1e-5, sqrt(curVar))
        }
        return PluginPrediction(id, means, sigmas)
    }
}

class ArimaEtsModel : ForecastModelPlugin {
    override val id = "arima_ets"
    override val name = "Damped AR(2) + ETS"
    override val family = "TIME_SERIES"
    override val description = "Combines second-order autoregressive return dynamics with damped exponential smoothing."
    override val defaultEnabled = true
    override val defaultWeight = 0.22
    override val defaultParams = mapOf("damping" to 0.88, "alphaEts" to 0.32)

    override fun predict(features: ExtractedForecastFeatures, horizon: Int, params: Map<String, Double>): PluginPrediction {
        val returns = features.logReturns
        val n = returns.size
        val damping = (params["damping"] ?: 0.88).coerceIn(0.60, 0.97)
        val alphaEts = (params["alphaEts"] ?: 0.32).coerceIn(0.10, 0.60)

        var s11 = 1e-6
        var s12 = 0.0
        var s22 = 1e-6
        var y1 = 0.0
        var y2 = 0.0
        val start = max(2, n - 96)
        for (i in start until n) {
            val x1 = returns[i - 1]
            val x2 = returns[i - 2]
            val y = returns[i]
            s11 += x1 * x1
            s12 += x1 * x2
            s22 += x2 * x2
            y1 += x1 * y
            y2 += x2 * y
        }
        val det = s11 * s22 - s12 * s12
        var phi1 = 0.15
        var phi2 = -0.05
        if (abs(det) > 1e-14) {
            phi1 = (y1 * s22 - y2 * s12) / det
            phi2 = (s11 * y2 - s12 * y1) / det
        }
        val norm = abs(phi1) + abs(phi2)
        if (norm > 0.85) {
            phi1 *= 0.85 / norm
            phi2 *= 0.85 / norm
        }

        var etsLevel = returns.firstOrNull() ?: 0.0
        for (i in 1 until n) {
            etsLevel = alphaEts * returns[i] + (1.0 - alphaEts) * etsLevel
        }

        var rPrev1 = if (n >= 1) returns[n - 1] else 0.0
        var rPrev2 = if (n >= 2) returns[n - 2] else 0.0
        val means = DoubleArray(horizon)
        val sigmas = DoubleArray(horizon)
        val cap = features.uncondSigma * 0.75

        for (h in 0 until horizon) {
            val arPart = phi1 * rPrev1 + phi2 * rPrev2
            val etsPart = etsLevel * damping.pow(h + 1)
            val stepReturn = (0.58 * arPart + 0.42 * etsPart).coerceIn(-cap, cap)
            means[h] = stepReturn
            sigmas[h] = max(1e-5, features.ewmaSigma * (0.95 + 0.018 * h))
            rPrev2 = rPrev1
            rPrev1 = stepReturn
        }
        return PluginPrediction(id, means, sigmas)
    }
}

class GaussianProcessModel : ForecastModelPlugin {
    override val id = "gaussian_process"
    override val name = "RBF Gaussian Process"
    override val family = "NON_PARAMETRIC"
    override val description = "Kernel regression on recent return structure with analytic posterior uncertainty growth."
    override val defaultEnabled = true
    override val defaultWeight = 0.14
    override val defaultParams = mapOf("lengthScale" to 7.5, "noiseRatio" to 0.35)

    override fun predict(features: ExtractedForecastFeatures, horizon: Int, params: Map<String, Double>): PluginPrediction {
        val tail = features.logReturns.takeLast(min(28, features.logReturns.size))
        val m = tail.size
        val ls = (params["lengthScale"] ?: 7.5).coerceIn(2.5, 20.0)
        val signalVar = max(1e-10, features.uncondVariance)
        val noiseVar = signalVar * (params["noiseRatio"] ?: 0.35).coerceIn(0.08, 1.5)
        val ls2 = 2.0 * ls * ls

        val kMat = DoubleArray(m * m)
        for (i in 0 until m) {
            for (j in 0..i) {
                val d = (i - j).toDouble()
                var v = signalVar * exp(-(d * d) / ls2)
                if (i == j) v += noiseVar
                kMat[i * m + j] = v
                kMat[j * m + i] = v
            }
        }

        val lMat = DoubleArray(m * m)
        for (i in 0 until m) {
            for (j in 0..i) {
                var sum = kMat[i * m + j]
                for (k in 0 until j) sum -= lMat[i * m + k] * lMat[j * m + k]
                lMat[i * m + j] = if (i == j) sqrt(max(1e-14, sum)) else sum / max(1e-12, lMat[j * m + j])
            }
        }

        val z = DoubleArray(m)
        for (i in 0 until m) {
            var sum = tail[i]
            for (k in 0 until i) sum -= lMat[i * m + k] * z[k]
            z[i] = sum / max(1e-12, lMat[i * m + i])
        }
        val alphaVec = DoubleArray(m)
        for (i in m - 1 downTo 0) {
            var sum = z[i]
            for (k in i + 1 until m) sum -= lMat[k * m + i] * alphaVec[k]
            alphaVec[i] = sum / max(1e-12, lMat[i * m + i])
        }

        val means = DoubleArray(horizon)
        val sigmas = DoubleArray(horizon)
        val kStar = DoubleArray(m)
        val v = DoubleArray(m)
        val cap = features.uncondSigma * 0.70

        for (h in 0 until horizon) {
            val tStar = (m + h).toDouble()
            var predMean = 0.0
            for (i in 0 until m) {
                val d = tStar - i
                val kv = signalVar * exp(-(d * d) / ls2)
                kStar[i] = kv
                predMean += kv * alphaVec[i]
            }
            for (i in 0 until m) {
                var sum = kStar[i]
                for (k in 0 until i) sum -= lMat[i * m + k] * v[k]
                v[i] = sum / max(1e-12, lMat[i * m + i])
            }
            var vSq = 0.0
            for (i in 0 until m) vSq += v[i] * v[i]
            val postVar = max(features.ewmaSigma * features.ewmaSigma * 0.5, signalVar + noiseVar - vSq)
            means[h] = predMean.coerceIn(-cap, cap)
            sigmas[h] = max(1e-5, sqrt(postVar))
        }
        return PluginPrediction(id, means, sigmas)
    }
}
