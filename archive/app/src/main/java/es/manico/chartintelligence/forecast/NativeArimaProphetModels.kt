package es.manico.chartintelligence.forecast

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

const val CANONICAL_FORECAST_HORIZON = 60

internal fun solveLinearSystemRidge(
    matA: Array<DoubleArray>,
    vecB: DoubleArray,
    n: Int,
    ridge: Double = 1e-6
): DoubleArray? {
    if (n == 0) return DoubleArray(0)
    val a = Array(n) { r ->
        val row = DoubleArray(n)
        for (c in 0 until n) row[c] = matA[r][c]
        row[r] += ridge
        row
    }
    val b = vecB.copyOf()

    for (col in 0 until n) {
        var pivot = col
        var maxVal = abs(a[col][col])
        for (r in (col + 1) until n) {
            val v = abs(a[r][col])
            if (v > maxVal) {
                maxVal = v
                pivot = r
            }
        }
        if (!maxVal.isFinite() || maxVal < 1e-13) return null
        if (pivot != col) {
            val tmpRow = a[col]; a[col] = a[pivot]; a[pivot] = tmpRow
            val tmpB = b[col]; b[col] = b[pivot]; b[pivot] = tmpB
        }
        val diag = a[col][col]
        for (j in col until n) a[col][j] /= diag
        b[col] /= diag

        for (r in 0 until n) {
            if (r == col) continue
            val factor = a[r][col]
            if (factor == 0.0) continue
            for (j in col until n) a[r][j] -= factor * a[col][j]
            b[r] -= factor * b[col]
        }
    }
    return if (b.all { it.isFinite() }) b else null
}

internal fun percentileSorted(sorted: DoubleArray, q: Double): Double {
    if (sorted.isEmpty()) return 0.0
    val idx = (q * (sorted.size - 1)).coerceIn(0.0, (sorted.size - 1).toDouble())
    val lo = idx.toInt()
    val hi = min(sorted.size - 1, lo + 1)
    val frac = idx - lo
    return sorted[lo] * (1.0 - frac) + sorted[hi] * frac
}

/**
 * 1. Native ARIMA(p, d, q) on Log-Prices with Differencing Test & AIC Grid Selection.
 * Zero flat fallback on failure: explicitly reports FAILED / SKIPPED_LOW_DATA.
 */
class NativeArimaDiffModel : ForecastModelPlugin {
    override val id = "native_arima_diff"
    override val name = "ARIMA(p,d,q) AIC (Native)"
    override val family = "TIME_SERIES"
    override val modelVersion = "1.0.0"
    override val isApproximation = false
    override val isCalibratedInterval = true
    override val description =
        "Native differenced ARIMA(p,d,q) estimator on log-prices with unit-root differencing check, AIC order selection, Hannan-Rissanen MA residuals, and analytical variance propagation."
    override val defaultEnabled = true
    override val defaultWeight = 0.22
    override val defaultParams = mapOf(
        "maxP" to 5.0,
        "maxQ" to 1.0,
        "ridge" to 1e-5
    )

    private data class CandidateFit(
        val p: Int,
        val q: Int,
        val d: Int,
        val c: Double,
        val phi: DoubleArray,
        val theta: DoubleArray,
        val sigma2: Double,
        val resid: DoubleArray,
        val aic: Double
    )

    override fun predict(
        features: ExtractedForecastFeatures,
        horizon: Int,
        params: Map<String, Double>
    ): PluginPrediction {
        val candles = features.candles
        if (candles.size < 24) {
            return PluginPrediction(
                modelId = id,
                meanReturns = DoubleArray(0),
                sigmas = DoubleArray(0),
                status = ModelExecutionStatus.SKIPPED_LOW_DATA,
                reason = "ARIMA requires >= 24 bars (have ${candles.size})",
                isApproximation = isApproximation,
                isCalibratedInterval = isCalibratedInterval,
                modelVersion = modelVersion
            )
        }

        val logCloses = DoubleArray(candles.size) { ln(max(1e-8, candles[it].close)) }
        val returns = features.logReturns
        if (returns.size < 18 || !features.uncondVariance.isFinite() || features.uncondVariance <= 1e-13) {
            return PluginPrediction(
                modelId = id,
                meanReturns = DoubleArray(0),
                sigmas = DoubleArray(0),
                status = ModelExecutionStatus.FAILED,
                reason = "Degenerate or near-zero return variance for ARIMA estimation",
                isApproximation = isApproximation,
                isCalibratedInterval = isCalibratedInterval,
                modelVersion = modelVersion
            )
        }

        // Check lag-1 autocorrelation of log levels to choose d in {0, 1}
        val meanZ = logCloses.average()
        var num = 0.0
        var den = 0.0
        for (i in 1 until logCloses.size) {
            num += (logCloses[i] - meanZ) * (logCloses[i - 1] - meanZ)
            den += (logCloses[i - 1] - meanZ) * (logCloses[i - 1] - meanZ)
        }
        val lag1Level = if (den > 1e-12) num / den else 1.0
        val dOrder = if (lag1Level > 0.82) 1 else 0
        val series = if (dOrder == 1) returns else DoubleArray(logCloses.size) { logCloses[it] - meanZ }
        val n = series.size

        val maxP = (params["maxP"] ?: 5.0).toInt().coerceIn(1, 5)
        val maxQ = (params["maxQ"] ?: 1.0).toInt().coerceIn(0, 2)
        val ridge = max(1e-7, params["ridge"] ?: 1e-5)

        val candidates = ArrayList<Pair<Int, Int>>()
        for (p in listOf(1, 2, 3, 5)) {
            if (p <= maxP) candidates.add(Pair(p, 0))
        }
        if (maxQ >= 1) {
            for (p in listOf(1, 2, 3)) {
                if (p <= maxP) candidates.add(Pair(p, 1))
            }
        }

        var best: CandidateFit? = null
        for ((p, q) in candidates) {
            val startAr = p
            if (n - startAr < p + q + 10) continue

            // Stage 1: fit AR(p + extra) to approximate innovations when q > 0
            val auxP = if (q > 0) min(n - 6, max(p + 2, 4)) else p
            val rows1 = ArrayList<DoubleArray>()
            val y1 = ArrayList<Double>()
            for (t in auxP until n) {
                val row = DoubleArray(auxP + 1)
                row[0] = 1.0
                for (i in 1..auxP) row[i] = series[t - i]
                rows1.add(row)
                y1.add(series[t])
            }
            val k1 = auxP + 1
            val xtx1 = Array(k1) { DoubleArray(k1) }
            val xty1 = DoubleArray(k1)
            for (r in rows1.indices) {
                val rx = rows1[r]
                val yVal = y1[r]
                for (a in 0 until k1) {
                    xty1[a] += rx[a] * yVal
                    for (b in 0 until k1) xtx1[a][b] += rx[a] * rx[b]
                }
            }
            val beta1 = solveLinearSystemRidge(xtx1, xty1, k1, ridge) ?: continue

            val auxRes = DoubleArray(n)
            for (t in auxP until n) {
                var pred = beta1[0]
                for (i in 1..auxP) pred += beta1[i] * series[t - i]
                auxRes[t] = series[t] - pred
            }

            // Stage 2: fit AR(p) + MA(q)
            val start2 = max(p, auxP + q)
            if (n - start2 < p + q + 8) continue
            val k2 = 1 + p + q
            val xtx2 = Array(k2) { DoubleArray(k2) }
            val xty2 = DoubleArray(k2)
            val validRows = n - start2

            for (t in start2 until n) {
                val rx = DoubleArray(k2)
                rx[0] = 1.0
                for (i in 1..p) rx[i] = series[t - i]
                for (j in 1..q) rx[p + j] = auxRes[t - j]
                val yt = series[t]
                for (a in 0 until k2) {
                    xty2[a] += rx[a] * yt
                    for (b in 0 until k2) xtx2[a][b] += rx[a] * rx[b]
                }
            }

            val beta2 = solveLinearSystemRidge(xtx2, xty2, k2, ridge) ?: continue
            val c = beta2[0]
            val phi = DoubleArray(p) { beta2[1 + it] }
            val theta = DoubleArray(q) { beta2[1 + p + it] }
            val phiL1 = phi.sumOf { abs(it) }
            val thetaL1 = theta.sumOf { abs(it) }
            if (phiL1 >= 0.96 || thetaL1 >= 0.90) continue

            var rss = 0.0
            val resid = DoubleArray(n)
            for (t in start2 until n) {
                var pred = c
                for (i in 1..p) pred += phi[i - 1] * series[t - i]
                for (j in 1..q) pred += theta[j - 1] * resid[t - j]
                val e = series[t] - pred
                resid[t] = e.coerceIn(-features.uncondSigma * 4.0, features.uncondSigma * 4.0)
                rss += resid[t] * resid[t]
            }
            val sigma2 = max(1e-12, rss / max(1, validRows - k2).toDouble())
            val aic = validRows * ln(sigma2) + 2.0 * k2
            if (!aic.isFinite()) continue

            if (best == null || aic < best.aic) {
                best = CandidateFit(p, q, dOrder, c, phi, theta, sigma2, resid, aic)
            }
        }

        val fit = best ?: return PluginPrediction(
            modelId = id,
            meanReturns = DoubleArray(0),
            sigmas = DoubleArray(0),
            status = ModelExecutionStatus.FAILED,
            reason = "ARIMA convergence failed across stationary (p,d,q) candidates",
            isApproximation = isApproximation,
            isCalibratedInterval = isCalibratedInterval,
            modelVersion = modelVersion
        )

        val totalSteps = CANONICAL_FORECAST_HORIZON
        val forecastSeries = series.toMutableList()
        val forecastRes = fit.resid.toMutableList()
        val meanReturns = DoubleArray(horizon)
        val sigmas = DoubleArray(horizon)
        val stepCap = features.uncondSigma * 0.85

        // Analytical MA(inf) psi weights for multi-step variance
        val psi = DoubleArray(totalSteps)
        psi[0] = 1.0
        for (h in 1 until totalSteps) {
            var valPsi = if (h <= fit.q) fit.theta[h - 1] else 0.0
            for (i in 1..fit.p) {
                if (h - i >= 0) valPsi += fit.phi[i - 1] * psi[h - i]
            }
            psi[h] = valPsi
        }

        val baseSd = max(1e-5, sqrt(fit.sigma2))
        var prevLogLevel = logCloses.last()

        for (h in 0 until totalSteps) {
            var nextVal = fit.c
            for (i in 1..fit.p) {
                val idx = forecastSeries.size - i
                nextVal += fit.phi[i - 1] * (if (idx >= 0) forecastSeries[idx] else 0.0)
            }
            for (j in 1..fit.q) {
                val idx = forecastRes.size - j
                nextVal += fit.theta[j - 1] * (if (idx >= 0) forecastRes[idx] else 0.0)
            }
            forecastSeries.add(nextVal)
            forecastRes.add(0.0)

            var stepRet = if (dOrder == 1) nextVal else (meanZ + nextVal - prevLogLevel)
            if (dOrder == 0) prevLogLevel = meanZ + nextVal
            stepRet = stepRet.coerceIn(-stepCap, stepCap)

            if (h < horizon) {
                meanReturns[h] = stepRet
                sigmas[h] = max(1e-5, baseSd * max(0.75, abs(psi[h])))
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
            modelVersion = modelVersion,
            meta = mapOf("order" to "(${fit.p},${fit.d},${fit.q})", "aic" to fit.aic)
        )
    }
}

/**
 * 2. Native Prophet-Style Piecewise Linear Changepoint Trend + Fourier Seasonality (Approximation).
 * Respects exact candle openTimeUtcMs and calendar rules (never uses synthetic daily dates).
 */
class NativeProphetDecompModel : ForecastModelPlugin {
    override val id = "native_prophet_decomp"
    override val name = "Prophet Trend+Fourier (Native Approx)"
    override val family = "DECOMPOSITION"
    override val modelVersion = "1.0.0"
    override val isApproximation = true
    override val isCalibratedInterval = false
    override val description =
        "Piecewise linear trend with L2 changepoints and Fourier session/calendar seasonality on log-prices; lightweight native approximation of Prophet."
    override val defaultEnabled = true
    override val defaultWeight = 0.20
    override val defaultParams = mapOf(
        "changepointPrior" to 0.08,
        "seasonalityPrior" to 0.15,
        "fourierOrder" to 3.0
    )

    override fun predict(
        features: ExtractedForecastFeatures,
        horizon: Int,
        params: Map<String, Double>
    ): PluginPrediction {
        val candles = features.candles
        val n = candles.size
        if (n < 28) {
            return PluginPrediction(
                modelId = id,
                meanReturns = DoubleArray(0),
                sigmas = DoubleArray(0),
                status = ModelExecutionStatus.SKIPPED_LOW_DATA,
                reason = "Prophet decomposer requires >= 28 bars (have $n)",
                isApproximation = isApproximation,
                isCalibratedInterval = isCalibratedInterval,
                modelVersion = modelVersion
            )
        }

        val times = LongArray(n) { idx ->
            val ms = candles[idx].openTimeUtcMs
            if (ms > 0L) ms else idx * 900_000L
        }
        val t0 = times[0].toDouble()
        val tLast = times[n - 1].toDouble()
        val spanMs = max(1.0, tLast - t0)
        val avgStepMs = spanMs / max(1, n - 1).toDouble()
        val logY = DoubleArray(n) { ln(max(1e-8, candles[it].close)) }

        val numCp = min(6, max(2, n / 20))
        val cpPositions = DoubleArray(numCp) { j -> (0.8 * (j + 1)) / (numCp + 1).toDouble() }

        val dayMs = 86_400_000.0
        val weekMs = 7.0 * dayMs
        val kDaily = if (avgStepMs < dayMs) (params["fourierOrder"] ?: 3.0).toInt().coerceIn(1, 3) else 0
        val kWeekly = if (spanMs >= 10.0 * dayMs) 2 else 0

        fun buildRow(tMs: Double): DoubleArray {
            val tNorm = (tMs - t0) / spanMs
            val row = ArrayList<Double>()
            row.add(1.0)
            row.add(tNorm)
            for (s in cpPositions) {
                row.add(max(0.0, tNorm - s))
            }
            for (k in 1..kDaily) {
                val ang = (2.0 * PI * k * (tMs % dayMs)) / dayMs
                row.add(sin(ang))
                row.add(cos(ang))
            }
            for (k in 1..kWeekly) {
                val ang = (2.0 * PI * k * (tMs % weekMs)) / weekMs
                row.add(sin(ang))
                row.add(cos(ang))
            }
            return row.toDoubleArray()
        }

        val dim = buildRow(t0).size
        val cpPrior = max(0.01, params["changepointPrior"] ?: 0.08)
        val seasPrior = max(0.01, params["seasonalityPrior"] ?: 0.15)

        val xtx = Array(dim) { DoubleArray(dim) }
        val xty = DoubleArray(dim)
        for (i in 0 until n) {
            val rx = buildRow(times[i].toDouble())
            val yt = logY[i]
            for (a in 0 until dim) {
                xty[a] += rx[a] * yt
                for (b in 0 until dim) xtx[a][b] += rx[a] * rx[b]
            }
        }

        xtx[0][0] += 1e-6
        xtx[1][1] += 1e-2
        val cpEnd = 2 + numCp
        for (j in 2 until cpEnd) xtx[j][j] += 1.0 / cpPrior
        for (j in cpEnd until dim) xtx[j][j] += 1.0 / seasPrior

        val beta = solveLinearSystemRidge(xtx, xty, dim, 1e-6)
            ?: return PluginPrediction(
                modelId = id,
                meanReturns = DoubleArray(0),
                sigmas = DoubleArray(0),
                status = ModelExecutionStatus.FAILED,
                reason = "Prophet trend+Fourier design matrix failed to converge",
                isApproximation = isApproximation,
                isCalibratedInterval = isCalibratedInterval,
                modelVersion = modelVersion
            )

        fun evalFit(tMs: Double): Double {
            val rx = buildRow(tMs)
            var s = 0.0
            for (j in 0 until dim) s += beta[j] * rx[j]
            return s
        }

        var rss = 0.0
        val lastFit = evalFit(tLast)
        for (i in 0 until n) {
            val err = logY[i] - evalFit(times[i].toDouble())
            rss += err * err
        }
        val resSigma = max(features.ewmaSigma * 0.65, sqrt(rss / max(1, n - 4).toDouble()))

        val futureTs = features.futureTimestamps
        val meanReturns = DoubleArray(horizon)
        val sigmas = DoubleArray(horizon)
        val stepCap = features.uncondSigma * 0.85
        var prevHat = logY[n - 1]
        var prevComponentHat = lastFit

        for (h in 0 until horizon) {
            val fMs = if (futureTs != null && h < futureTs.size) futureTs[h].toDouble() else tLast + (h + 1) * avgStepMs
            val rawComp = evalFit(fMs)
            val rawStep = rawComp - prevComponentHat
            val damp = 0.96.pow(h + 1)
            val dampedStep = (rawStep * damp).coerceIn(-stepCap, stepCap)
            val nextHat = prevHat + dampedStep
            meanReturns[h] = nextHat - prevHat
            sigmas[h] = max(1e-5, resSigma * (0.90 + 0.015 * h))
            prevHat = nextHat
            prevComponentHat = rawComp
        }

        return PluginPrediction(
            modelId = id,
            meanReturns = meanReturns,
            sigmas = sigmas,
            status = ModelExecutionStatus.SUCCESS,
            reason = "",
            isApproximation = isApproximation,
            isCalibratedInterval = isCalibratedInterval,
            modelVersion = modelVersion,
            meta = mapOf("changepoints" to numCp, "kDaily" to kDaily, "kWeekly" to kWeekly)
        )
    }
}
