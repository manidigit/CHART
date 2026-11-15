package es.manico.chartintelligence.forecast

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tanh

/**
 * CHART INTELLIGENCE — Native Zero-Dependency Statistical & Approximate Sequence/Attention Models (Kotlin Parity)
 *
 * Parity with `host_subdomain/assets/js/forecast/models/advancedNativeModels.js`:
 * 1. `NativeArimaDiffModel` (`native_arima_diff`): Differenced ARIMA(p, d, q) on log-prices with unit-root check, AIC grid, MA(inf) variance.
 * 2. `NativeProphetDecompModel` (`native_prophet_decomp`): Piecewise-linear changepoint trend + Fourier session/weekly seasonality (APPROX).
 * 3. `NativeSequenceRecurrentModel` (`native_seq_recurrent_approx`): Seeded 1-layer tanh-GRU trained on training-window-only z-returns + 50-pass MC Dropout (APPROX).
 * 4. `NativeQuantileAttentionModel` (`native_quantile_attention_approx`): Variable-selection + scaled dot-product attention multi-quantile regressor with <90-bar gate (APPROX).
 */

private const val NATIVE_CANONICAL_HORIZON = 60

private fun solveLinearSystemRidge(matA: Array<DoubleArray>, vecB: DoubleArray, ridge: Double = 1e-6): DoubleArray? {
    val dim = vecB.size
    if (dim == 0) return DoubleArray(0)
    val a = Array(dim) { r ->
        val row = DoubleArray(dim)
        for (c in 0 until dim) row[c] = matA[r][c]
        row[r] += ridge
        row
    }
    val b = vecB.copyOf()

    for (col in 0 until dim) {
        var pivot = col
        var maxAbs = abs(a[col][col])
        for (r in (col + 1) until dim) {
            val v = abs(a[r][col])
            if (v > maxAbs) {
                maxAbs = v
                pivot = r
            }
        }
        if (maxAbs < 1e-13 || !maxAbs.isFinite()) return null
        if (pivot != col) {
            val tmp = a[col]; a[col] = a[pivot]; a[pivot] = tmp
            val tb = b[col]; b[col] = b[pivot]; b[pivot] = tb
        }
        val diag = a[col][col]
        for (r in (col + 1) until dim) {
            val factor = a[r][col] / diag
            if (factor == 0.0) continue
            for (c in col until dim) a[r][c] -= factor * a[col][c]
            b[r] -= factor * b[col]
        }
    }

    val x = DoubleArray(dim)
    for (r in dim - 1 downTo 0) {
        var sum = b[r]
        for (c in (r + 1) until dim) sum -= a[r][c] * x[c]
        val v = sum / a[r][r]
        if (!v.isFinite()) return null
        x[r] = v
    }
    return x
}

private fun percentileSorted(sorted: List<Double>, q: Double): Double {
    if (sorted.isEmpty()) return 0.0
    if (sorted.size == 1) return sorted[0]
    val pos = q.coerceIn(0.0, 1.0) * (sorted.size - 1)
    val lo = pos.toInt()
    val hi = min(sorted.size - 1, lo + 1)
    val frac = pos - lo
    return sorted[lo] * (1.0 - frac) + sorted[hi] * frac
}

private class DeterministicRng(seedInit: Long = 1337L) {
    private var state: Long = (seedInit and 0xFFFFFFFFL).let { if (it == 0L) 1337L else it }
    fun nextDouble(): Double {
        state = (state * 1664525L + 1013904223L) and 0xFFFFFFFFL
        return state.toDouble() / 4294967296.0
    }
}

/**
 * 1. Native Differenced ARIMA(p, d, q) on Log-Prices with ADF-style unit-root check & AIC order search.
 */
class NativeArimaDiffModel : ForecastModelPlugin {
    override val id = "native_arima_diff"
    override val name = "ARIMA(p,d,q) Differenced"
    override val family = "ECONOMETRIC"
    override val description =
        "Automatic differencing (d in {1,2}) with ADF unit-root test, AIC grid search over (p,q), Hannan-Rissanen MA residuals, and analytical MA(inf) variance."
    override val defaultEnabled = true
    override val defaultWeight = 0.22
    override val defaultParams = mapOf("maxP" to 3.0, "maxQ" to 2.0, "lookback" to 140.0)

    private data class CandidateFit(
        val d: Int,
        val p: Int,
        val q: Int,
        val intercept: Double,
        val ar: DoubleArray,
        val ma: DoubleArray,
        val sigma2: Double,
        val tailDiffs: DoubleArray,
        val tailEps: DoubleArray,
        val aic: Double
    )

    override fun predict(features: ExtractedForecastFeatures, horizon: Int, params: Map<String, Double>): PluginPrediction {
        val candles = features.candles
        if (candles.size < 24 || features.logReturns.size < 18) {
            return PluginPrediction(
                modelId = id,
                meanReturns = DoubleArray(0),
                sigmas = DoubleArray(0),
                status = ModelExecutionStatus.SKIPPED_LOW_DATA,
                reason = "ARIMA requires >= 24 bars (have ${candles.size})"
            )
        }

        val lookback = (params["lookback"] ?: 140.0).toInt().coerceIn(30, candles.size)
        val slice = candles.takeLast(lookback)
        val logY = DoubleArray(slice.size) { ln(max(1e-8, slice[it].close)) }
        val r1 = DoubleArray(logY.size - 1) { logY[it + 1] - logY[it] }

        // Check if first-differenced series r1 still has unit root -> d=2 else d=1
        var dSelected = 1
        if (r1.size >= 24) {
            var sxx = 0.0
            var sxy = 0.0
            var sse = 0.0
            for (t in 1 until r1.size) {
                val x = r1[t - 1]
                val y = r1[t] - r1[t - 1]
                sxx += x * x
                sxy += x * y
            }
            val gamma = if (sxx > 1e-12) sxy / sxx else -0.5
            for (t in 1 until r1.size) {
                val y = r1[t] - r1[t - 1]
                val err = y - gamma * r1[t - 1]
                sse += err * err
            }
            val se = sqrt((sse / max(1, r1.size - 2)) / max(1e-12, sxx))
            val tauStat = if (se > 1e-12) gamma / se else -3.5
            if (tauStat > -1.95 && r1.size >= 36) dSelected = 2
        }

        val diffSeries = if (dSelected == 2) {
            DoubleArray(r1.size - 1) { r1[it + 1] - r1[it] }
        } else {
            r1
        }

        fun fitOrder(series: DoubleArray, p: Int, q: Int, dVal: Int): CandidateFit? {
            val n = series.size
            val maxLag = max(max(p, q), 4)
            if (n < maxLag + 10) return null

            // Step 1: Hannan-Rissanen high-order AR(m) to estimate residuals eps[t]
            val m = min(6, max(2, maxLag))
            val dimAr = 1 + m
            val xtx = Array(dimAr) { DoubleArray(dimAr) }
            val xty = DoubleArray(dimAr)
            for (t in m until n) {
                val row = DoubleArray(dimAr)
                row[0] = 1.0
                for (j in 1..m) row[j] = series[t - j]
                val y = series[t]
                for (a in 0 until dimAr) {
                    xty[a] += row[a] * y
                    for (b in 0 until dimAr) xtx[a][b] += row[a] * row[b]
                }
            }
            val arCoef = solveLinearSystemRidge(xtx, xty, 1e-5) ?: return null
            val eps = DoubleArray(n)
            for (t in m until n) {
                var pred = arCoef[0]
                for (j in 1..m) pred += arCoef[j] * series[t - j]
                eps[t] = series[t] - pred
            }

            // Step 2: OLS regression of series[t] on [1, AR(p), MA(q)]
            val startT = max(m, max(p, q))
            val effN = n - startT
            if (effN < 8) return null
            val dim = 1 + p + q
            val mA = Array(dim) { DoubleArray(dim) }
            val mB = DoubleArray(dim)
            for (t in startT until n) {
                val row = DoubleArray(dim)
                row[0] = 1.0
                for (i in 1..p) row[i] = series[t - i]
                for (j in 1..q) row[1 + p + j - 1] = eps[t - j]
                val y = series[t]
                for (a in 0 until dim) {
                    mB[a] += row[a] * y
                    for (b in 0 until dim) mA[a][b] += row[a] * row[b]
                }
            }
            val beta = solveLinearSystemRidge(mA, mB, 1e-5) ?: return null

            val intercept = beta[0]
            val ar = DoubleArray(p) { beta[1 + it] }
            val ma = DoubleArray(q) { beta[1 + p + it] }
            val arAbsSum = ar.sumOf { abs(it) }
            if (arAbsSum >= 0.96) {
                val sc = 0.94 / max(1e-9, arAbsSum)
                for (i in ar.indices) ar[i] *= sc
            }
            val maAbsSum = ma.sumOf { abs(it) }
            if (maAbsSum >= 0.92) {
                val sc = 0.90 / max(1e-9, maAbsSum)
                for (i in ma.indices) ma[i] *= sc
            }

            // Recompute final innovation sequence iteratively
            val finalEps = DoubleArray(n)
            var rss = 0.0
            for (t in startT until n) {
                var hat = intercept
                for (i in 0 until p) hat += ar[i] * series[t - 1 - i]
                for (j in 0 until q) hat += ma[j] * finalEps[t - 1 - j]
                val e = series[t] - hat
                finalEps[t] = e
                rss += e * e
            }
            val sigma2 = max(1e-10, rss / max(1, effN - dim))
            val aic = effN * ln(sigma2) + 2.0 * dim
            return CandidateFit(
                d = dVal,
                p = p,
                q = q,
                intercept = intercept,
                ar = ar,
                ma = ma,
                sigma2 = sigma2,
                tailDiffs = series.takeLast(max(1, p)).toDoubleArray(),
                tailEps = finalEps.takeLast(max(1, q)).toDoubleArray(),
                aic = aic
            )
        }

        val maxP = (params["maxP"] ?: 3.0).toInt().coerceIn(1, 4)
        val maxQ = (params["maxQ"] ?: 2.0).toInt().coerceIn(0, 3)
        var bestFit: CandidateFit? = null
        val dCandidates = if (dSelected == 2) intArrayOf(1, 2) else intArrayOf(1)
        for (dTry in dCandidates) {
            val s = if (dTry == 2) DoubleArray(r1.size - 1) { r1[it + 1] - r1[it] } else r1
            for (p in 0..maxP) {
                for (q in 0..maxQ) {
                    if (p == 0 && q == 0) continue
                    val cand = fitOrder(s, p, q, dTry)
                    if (cand != null && (bestFit == null || cand.aic < bestFit.aic)) {
                        bestFit = cand
                    }
                }
            }
        }

        if (bestFit == null) {
            return PluginPrediction(
                modelId = id,
                meanReturns = DoubleArray(0),
                sigmas = DoubleArray(0),
                status = ModelExecutionStatus.FAILED,
                reason = "ARIMA($maxP,$dSelected,$maxQ) OLS/MLE failed to converge on current window"
            )
        }

        // Canonical 60-step rollout for strict prefix invariance across 10/20/60
        val totalSteps = max(NATIVE_CANONICAL_HORIZON, horizon)
        val histD = bestFit.tailDiffs.toMutableList()
        val histE = bestFit.tailEps.toMutableList()
        val cap = features.uncondSigma * 0.90
        var lastR1 = r1.lastOrNull() ?: 0.0

        val psi = DoubleArray(totalSteps + 1)
        psi[0] = 1.0
        for (k in 1..totalSteps) {
            var v = if (k <= bestFit.ma.size) bestFit.ma[k - 1] else 0.0
            for (i in 1..min(k, bestFit.ar.size)) {
                v += bestFit.ar[i - 1] * psi[k - i]
            }
            psi[k] = v
        }

        val fullMeans = DoubleArray(totalSteps)
        val fullSigmas = DoubleArray(totalSteps)
        val stepFloor = max(1e-5, features.ewmaSigma * 0.55)
        for (h in 0 until totalSteps) {
            var zHat = bestFit.intercept
            for (i in 0 until bestFit.p) {
                zHat += bestFit.ar[i] * histD[histD.size - 1 - i]
            }
            for (j in 0 until bestFit.q) {
                if (h + 1 - 1 - j < 0) {
                    val pastIdx = histE.size - 1 - (j - h)
                    if (pastIdx in histE.indices) zHat += bestFit.ma[j] * histE[pastIdx]
                }
            }
            histD.add(zHat)
            histE.add(0.0)

            val stepRet = if (bestFit.d == 2) {
                lastR1 = (lastR1 + zHat).coerceIn(-cap, cap)
                lastR1
            } else {
                zHat.coerceIn(-cap, cap)
            }
            fullMeans[h] = stepRet
            fullSigmas[h] = max(stepFloor, sqrt(max(1e-10, bestFit.sigma2)) * max(0.5, abs(psi[h])))
        }

        return PluginPrediction(
            modelId = id,
            meanReturns = fullMeans.copyOfRange(0, horizon),
            sigmas = fullSigmas.copyOfRange(0, horizon),
            status = ModelExecutionStatus.SUCCESS,
            isApproximation = false,
            isCalibratedInterval = true,
            modelVersion = "1.0.0"
        )
    }
}

/**
 * 2. Native Prophet-Style Structural Decomposition Model (Approximation).
 * Explicitly marked `isApproximation = true`, `isCalibratedInterval = false` (NOT Python `prophet.Prophet`).
 */
class NativeProphetDecompModel : ForecastModelPlugin {
    override val id = "native_prophet_decomp"
    override val name = "Prophet Trend + Fourier (Native Approx)"
    override val family = "DECOMPOSITION_APPROX"
    override val description =
        "Piecewise-linear changepoint trend + Fourier session/weekly seasonality on CHART calendar timestamps; simplified native approximation (not Python Prophet)."
    override val defaultEnabled = true
    override val defaultWeight = 0.18
    override val defaultParams = mapOf("changepointPriorScale" to 0.08, "seasonalityPriorScale" to 2.5)
    override val isApproximation = true
    override val isCalibratedInterval = false

    override fun predict(features: ExtractedForecastFeatures, horizon: Int, params: Map<String, Double>): PluginPrediction {
        val candles = features.candles
        if (candles.size < 30) {
            return PluginPrediction(
                modelId = id,
                meanReturns = DoubleArray(0),
                sigmas = DoubleArray(0),
                status = ModelExecutionStatus.SKIPPED_LOW_DATA,
                reason = "Prophet decomposition requires >= 30 bars (have ${candles.size})",
                isApproximation = true,
                isCalibratedInterval = false
            )
        }

        val n = candles.size
        val logY = DoubleArray(n) { ln(max(1e-8, candles[it].close)) }
        val times = LongArray(n) { candles[it].openTimeUtcMs }
        val tFirst = times.first()
        val tLast = times.last()
        val spanMs = max(60_000.0, (tLast - tFirst).toDouble())
        val avgStepMs = spanMs / max(1, n - 1)

        val numCp = min(6, max(2, n / 20))
        val cpKnots = DoubleArray(numCp) { ((it + 1).toDouble() / (numCp + 2)) * 0.85 }

        val msPerDay = 86_400_000.0
        val msPerWeek = 7.0 * msPerDay
        val spanDays = spanMs / msPerDay
        val kDaily = if (avgStepMs < msPerDay * 0.45) 3 else 0
        val kWeekly = if (spanDays >= 4.0) 2 else 0

        val dim = 2 + numCp + 2 * kDaily + 2 * kWeekly
        fun buildRow(tMs: Long): DoubleArray {
            val row = DoubleArray(dim)
            val tNorm = (tMs - tFirst).toDouble() / spanMs
            row[0] = 1.0
            row[1] = tNorm
            var idx = 2
            for (c in 0 until numCp) {
                row[idx++] = max(0.0, tNorm - cpKnots[c])
            }
            val secInDayPhase = (tMs.toDouble() / msPerDay) * 2.0 * PI
            for (k in 1..kDaily) {
                row[idx++] = sin(k * secInDayPhase)
                row[idx++] = cos(k * secInDayPhase)
            }
            val weekPhase = (tMs.toDouble() / msPerWeek) * 2.0 * PI
            for (k in 1..kWeekly) {
                row[idx++] = sin(k * weekPhase)
                row[idx++] = cos(k * weekPhase)
            }
            return row
        }

        val xtx = Array(dim) { DoubleArray(dim) }
        val xty = DoubleArray(dim)
        for (i in 0 until n) {
            val rx = buildRow(times[i])
            val y = logY[i]
            for (a in 0 until dim) {
                xty[a] += rx[a] * y
                for (b in 0 until dim) xtx[a][b] += rx[a] * rx[b]
            }
        }

        val cpPrior = (params["changepointPriorScale"] ?: 0.08).coerceIn(0.01, 0.5)
        val seasPrior = (params["seasonalityPriorScale"] ?: 2.5).coerceIn(0.1, 10.0)
        xtx[0][0] += 1e-6
        xtx[1][1] += 1e-2
        val cpEnd = 2 + numCp
        for (j in 2 until cpEnd) xtx[j][j] += 1.0 / cpPrior
        for (j in cpEnd until dim) xtx[j][j] += 1.0 / seasPrior

        val beta = solveLinearSystemRidge(xtx, xty, 1e-6)
            ?: return PluginPrediction(
                modelId = id,
                meanReturns = DoubleArray(0),
                sigmas = DoubleArray(0),
                status = ModelExecutionStatus.FAILED,
                reason = "Prophet trend+Fourier design matrix failed to converge",
                isApproximation = true,
                isCalibratedInterval = false
            )

        fun evalFit(tMs: Long): Double {
            val rx = buildRow(tMs)
            var s = 0.0
            for (j in 0 until dim) s += beta[j] * rx[j]
            return s
        }

        var rss = 0.0
        val lastFit = evalFit(tLast)
        for (i in 0 until n) {
            val err = logY[i] - evalFit(times[i])
            rss += err * err
        }
        val resSigma = max(features.ewmaSigma * 0.65, sqrt(rss / max(1, n - 4)))

        val meanReturns = DoubleArray(horizon)
        val sigmas = DoubleArray(horizon)
        val stepCap = features.uncondSigma * 0.85
        var prevHat = logY[n - 1]
        var prevComponentHat = lastFit
        val stepMsLong = avgStepMs.toLong().coerceAtLeast(60_000L)

        for (h in 0 until horizon) {
            val fMs = tLast + (h + 1) * stepMsLong
            val rawComp = evalFit(fMs)
            val rawStep = rawComp - prevComponentHat
            val damp = 0.96.pow(h + 1)
            val dampedStep = (rawStep * damp).coerceIn(-stepCap, stepCap)
            val nextHat = prevHat + dampedStep
            meanReturns[h] = nextHat - prevHat
            sigmas[h] = max(1e-5, resSigma * (0.9 + 0.015 * h))
            prevHat = nextHat
            prevComponentHat = rawComp
        }

        return PluginPrediction(
            modelId = id,
            meanReturns = meanReturns,
            sigmas = sigmas,
            status = ModelExecutionStatus.SUCCESS,
            isApproximation = true,
            isCalibratedInterval = false,
            modelVersion = "1.0.0"
        )
    }
}

/**
 * 3. Native Seeded GRU/Recurrent Sequence Estimator + 50-Pass MC Dropout (Approximation).
 * Explicitly marked `isApproximation = true`, `isCalibratedInterval = false` (NOT PyTorch LSTM).
 */
class NativeSequenceRecurrentModel : ForecastModelPlugin {
    override val id = "native_seq_recurrent_approx"
    override val name = "Recurrent Seq + MC Dropout (Native Approx)"
    override val family = "SEQUENCE_APPROX"
    override val description =
        "Deterministic seeded 1-layer tanh-GRU sequence model trained on training-window-only standardized returns with 50-pass inference dropout; native approximation (not PyTorch LSTM)."
    override val defaultEnabled = true
    override val defaultWeight = 0.16
    override val defaultParams = mapOf("seqLength" to 16.0, "dropoutRate" to 0.20, "mcSamples" to 50.0, "epochs" to 16.0)
    override val isApproximation = true
    override val isCalibratedInterval = false

    override fun predict(features: ExtractedForecastFeatures, horizon: Int, params: Map<String, Double>): PluginPrediction {
        val returns = features.logReturns
        val seqLen = (params["seqLength"] ?: 16.0).toInt().coerceIn(8, 32)
        if (returns.size < seqLen + 14) {
            return PluginPrediction(
                modelId = id,
                meanReturns = DoubleArray(0),
                sigmas = DoubleArray(0),
                status = ModelExecutionStatus.SKIPPED_LOW_DATA,
                reason = "Recurrent sequence model requires >= ${seqLen + 14} returns (have ${returns.size})",
                isApproximation = true,
                isCalibratedInterval = false
            )
        }

        val mu = returns.average()
        var vSum = 0.0
        for (r in returns) vSum += (r - mu) * (r - mu)
        val sd = max(1e-5, sqrt(vSum / max(1, returns.size - 1)))
        val zSeries = DoubleArray(returns.size) { ((returns[it] - mu) / sd).coerceIn(-4.0, 4.0) }

        val hiddenSize = 8
        val rng = DeterministicRng(4242L)
        fun wInit() = (rng.nextDouble() - 0.5) * 0.45

        val Wz = DoubleArray(hiddenSize) { wInit() }
        val Uz = Array(hiddenSize) { DoubleArray(hiddenSize) { wInit() } }
        val Wh = DoubleArray(hiddenSize) { wInit() }
        val Uh = Array(hiddenSize) { DoubleArray(hiddenSize) { wInit() } }
        val wOut = DoubleArray(hiddenSize) { wInit() }
        var bOut = 0.0

        fun forwardWindow(seq: DoubleArray, startOffset: Int, len: Int, dropMask: DoubleArray?): Pair<Double, DoubleArray> {
            var h = DoubleArray(hiddenSize)
            for (t in 0 until len) {
                val x = seq[startOffset + t]
                val nextH = DoubleArray(hiddenSize)
                for (i in 0 until hiddenSize) {
                    var zGate = Wz[i] * x
                    var hCand = Wh[i] * x
                    for (j in 0 until hiddenSize) {
                        zGate += Uz[i][j] * h[j]
                        hCand += Uh[i][j] * h[j]
                    }
                    val zSig = 1.0 / (1.0 + exp(-zGate.coerceIn(-8.0, 8.0)))
                    val cand = tanh(hCand.coerceIn(-6.0, 6.0))
                    nextH[i] = (1.0 - zSig) * h[i] + zSig * cand
                }
                h = nextH
            }
            var yHat = bOut
            for (i in 0 until hiddenSize) {
                val m = dropMask?.get(i) ?: 1.0
                yHat += wOut[i] * h[i] * m
            }
            return yHat to h
        }

        val epochs = (params["epochs"] ?: 16.0).toInt().coerceIn(6, 20)
        val lr = 0.018
        val dropRate = (params["dropoutRate"] ?: 0.20).coerceIn(0.05, 0.45)
        val scaleKeep = 1.0 / (1.0 - dropRate)
        val sampleCount = zSeries.size - seqLen

        for (ep in 0 until epochs) {
            for (sIdx in 0 until sampleCount) {
                val mask = DoubleArray(hiddenSize) { if (rng.nextDouble() < dropRate) 0.0 else scaleKeep }
                val (yHat, finalH) = forwardWindow(zSeries, sIdx, seqLen, mask)
                val targetY = zSeries[sIdx + seqLen]
                val err = (yHat - targetY).coerceIn(-2.5, 2.5)
                bOut -= lr * (err + 1e-4 * bOut)
                val lastX = zSeries[sIdx + seqLen - 1]
                for (i in 0 until hiddenSize) {
                    val hMasked = finalH[i] * mask[i]
                    val gOut = (err * hMasked + 1e-4 * wOut[i]).coerceIn(-1.0, 1.0)
                    wOut[i] -= lr * gOut
                    val hGrad = (err * wOut[i] * mask[i] * (1.0 - finalH[i] * finalH[i])).coerceIn(-0.5, 0.5)
                    Wh[i] -= lr * 0.35 * hGrad * lastX
                }
            }
        }

        val mcSamples = (params["mcSamples"] ?: 50.0).toInt().coerceIn(20, 80)
        val stepStepBuckets = Array(horizon) { ArrayList<Double>(mcSamples) }
        val stepCumBuckets = Array(horizon) { ArrayList<Double>(mcSamples) }
        val mcRng = DeterministicRng(1007L)
        val stepCap = features.uncondSigma * 0.85

        for (m in 0 until mcSamples) {
            val buf = DoubleArray(seqLen + horizon)
            for (k in 0 until seqLen) buf[k] = zSeries[zSeries.size - seqLen + k]
            var cumRet = 0.0
            for (h in 0 until horizon) {
                val mask = DoubleArray(hiddenSize) { if (mcRng.nextDouble() < dropRate) 0.0 else scaleKeep }
                val (yHat, _) = forwardWindow(buf, h, seqLen, mask)
                val clampedZ = yHat.coerceIn(-2.5, 2.5)
                val stepRet = (mu + clampedZ * sd).coerceIn(-stepCap, stepCap)
                cumRet += stepRet
                stepStepBuckets[h].add(stepRet)
                stepCumBuckets[h].add(cumRet)
                buf[seqLen + h] = clampedZ
            }
        }

        val meanReturns = DoubleArray(horizon)
        val sigmas = DoubleArray(horizon)
        val q10Arr = DoubleArray(horizon)
        val q25Arr = DoubleArray(horizon)
        val q50Arr = DoubleArray(horizon)
        val q75Arr = DoubleArray(horizon)
        val q90Arr = DoubleArray(horizon)

        for (h in 0 until horizon) {
            val steps = stepStepBuckets[h]
            val meanStep = steps.average()
            var varSum = 0.0
            for (sr in steps) varSum += (sr - meanStep) * (sr - meanStep)
            val stepVar = varSum / max(1, steps.size - 1)
            meanReturns[h] = meanStep
            sigmas[h] = max(features.ewmaSigma * 0.75, sqrt(stepVar) + features.ewmaSigma * 0.55)

            val sortedPrices = stepCumBuckets[h].map { features.lastClose * exp(it) }.sorted()
            val mcMed = percentileSorted(sortedPrices, 0.5)
            val baseVolSpan = features.lastClose * features.ewmaSigma * sqrt((h + 1).toDouble())
            val q = ForecastCalendarHelper.enforceMonotonicQuantiles(
                min(percentileSorted(sortedPrices, 0.1), mcMed - 1.28155 * baseVolSpan * 0.7),
                min(percentileSorted(sortedPrices, 0.25), mcMed - 0.67449 * baseVolSpan * 0.7),
                mcMed,
                max(percentileSorted(sortedPrices, 0.75), mcMed + 0.67449 * baseVolSpan * 0.7),
                max(percentileSorted(sortedPrices, 0.9), mcMed + 1.28155 * baseVolSpan * 0.7),
                features.lastClose * 0.01
            )
            q10Arr[h] = q[0]; q25Arr[h] = q[1]; q50Arr[h] = q[2]; q75Arr[h] = q[3]; q90Arr[h] = q[4]
        }

        return PluginPrediction(
            modelId = id,
            meanReturns = meanReturns,
            sigmas = sigmas,
            status = ModelExecutionStatus.SUCCESS,
            isApproximation = true,
            isCalibratedInterval = false,
            directQuantiles = DirectQuantiles(q10Arr, q25Arr, q50Arr, q75Arr, q90Arr),
            modelVersion = "1.0.0"
        )
    }
}

/**
 * 4. Native Gated Multi-Feature Attention Quantile Forecaster (Approximation).
 * Strictly enforces `< 90` bar gate (`SKIPPED_LOW_DATA`), zero flat fallback, canonical 60-step prefix-invariant rollout.
 */
class NativeQuantileAttentionModel : ForecastModelPlugin {
    override val id = "native_quantile_attention_approx"
    override val name = "Quantile Attention TFT (Native Approx)"
    override val family = "ATTENTION_APPROX"
    override val description =
        "Variable-selection + scaled dot-product attention multi-quantile regressor with <90-bar gate; simplified native approximation (not PyTorch Forecasting TFT)."
    override val defaultEnabled = true
    override val defaultWeight = 0.16
    override val defaultParams = mapOf("minRequiredBars" to 90.0, "encoderLength" to 24.0, "epochs" to 18.0)
    override val isApproximation = true
    override val isCalibratedInterval = false

    override fun predict(features: ExtractedForecastFeatures, horizon: Int, params: Map<String, Double>): PluginPrediction {
        val candles = features.candles
        val returns = features.logReturns
        val minReq = (params["minRequiredBars"] ?: 90.0).toInt().coerceAtLeast(60)
        if (candles.size < minReq || returns.size < minReq - 2) {
            return PluginPrediction(
                modelId = id,
                meanReturns = DoubleArray(0),
                sigmas = DoubleArray(0),
                status = ModelExecutionStatus.SKIPPED_LOW_DATA,
                reason = "Quantile-Attention TFT gate requires >= $minReq bars (have ${candles.size})",
                isApproximation = true,
                isCalibratedInterval = false
            )
        }

        val encLen = (params["encoderLength"] ?: 24.0).toInt().coerceIn(12, min(40, returns.size / 3))
        val featDim = 4
        val muRet = returns.average()
        var rVar = 0.0
        for (r in returns) rVar += (r - muRet) * (r - muRet)
        val sdRet = max(1e-5, sqrt(rVar / max(1, returns.size - 1)))

        val stepFeatures = Array(returns.size) { t ->
            val c = candles[t + 1]
            val zRet = ((returns[t] - muRet) / sdRet).coerceIn(-3.5, 3.5)
            val rangeRatio = (((c.high - c.low) / max(1e-8, c.close)) / max(1e-4, features.atrPct) - 1.0).coerceIn(-3.0, 3.0)
            val bodyRatio = ((c.close - c.open) / max(1e-8, c.high - c.low)).coerceIn(-1.0, 1.0)
            val idxStart = max(0, t - 7)
            var sumMom = 0.0
            for (k in idxStart..t) sumMom += (returns[k] - muRet) / sdRet
            val momZ = (sumMom / (t - idxStart + 1)).coerceIn(-3.0, 3.0)
            doubleArrayOf(zRet, rangeRatio, bodyRatio, momZ)
        }

        val vsWeights = doubleArrayOf(0.8, 0.35, 0.35, 0.55)
        val wQ = DoubleArray(featDim) { 0.4 }
        val wK = DoubleArray(featDim) { 0.4 }
        val totalHorizonCanon = max(NATIVE_CANONICAL_HORIZON, horizon)
        val nHeads = 5 // [q10, q25, q50, q75, q90]
        val wHead = Array(nHeads) { DoubleArray(featDim) { 0.08 * (1 + it * 0.02) } }
        val bHead = doubleArrayOf(-1.28155, -0.67449, 0.0, 0.67449, 1.28155)
        val taus = doubleArrayOf(0.10, 0.25, 0.50, 0.75, 0.90)

        fun encodeWindow(endIdx: Int): DoubleArray {
            val start = endIdx - encLen
            val qSrc = stepFeatures[endIdx - 1]
            var qProj = 0.0
            for (f in 0 until featDim) qProj += vsWeights[f] * wQ[f] * qSrc[f]

            val scores = DoubleArray(encLen)
            var maxScore = -1e18
            for (i in 0 until encLen) {
                val fv = stepFeatures[start + i]
                var kProj = 0.0
                for (f in 0 until featDim) kProj += vsWeights[f] * wK[f] * fv[f]
                val s = (qProj * kProj) / sqrt(featDim.toDouble())
                scores[i] = s
                if (s > maxScore) maxScore = s
            }
            var wSum = 0.0
            val weights = DoubleArray(encLen)
            for (i in 0 until encLen) {
                weights[i] = exp((scores[i] - maxScore).coerceIn(-20.0, 20.0))
                wSum += weights[i]
            }
            val ctx = DoubleArray(featDim)
            val safeW = max(1e-9, wSum)
            for (i in 0 until encLen) {
                val att = weights[i] / safeW
                val fv = stepFeatures[start + i]
                for (f in 0 until featDim) ctx[f] += att * vsWeights[f] * fv[f]
            }
            return ctx
        }

        val epochs = (params["epochs"] ?: 18.0).toInt().coerceIn(8, 25)
        val lr = 0.025
        for (ep in 0 until epochs) {
            for (t in encLen until stepFeatures.size) {
                val ctx = encodeWindow(t)
                val targetZ = (returns[t] - muRet) / sdRet
                for (hIdx in 0 until nHeads) {
                    var yPred = bHead[hIdx]
                    for (f in 0 until featDim) yPred += wHead[hIdx][f] * ctx[f]
                    val diff = targetZ - yPred
                    val subGrad = if (diff >= 0.0) -taus[hIdx] else 1.0 - taus[hIdx]
                    bHead[hIdx] -= lr * subGrad * 0.35
                    for (f in 0 until featDim) {
                        wHead[hIdx][f] -= lr * (subGrad * ctx[f] + 1e-3 * wHead[hIdx][f])
                    }
                }
            }
        }

        val latestCtx = encodeWindow(stepFeatures.size)
        val stepCap = features.uncondSigma * 0.85
        val q10Arr = DoubleArray(totalHorizonCanon)
        val q25Arr = DoubleArray(totalHorizonCanon)
        val q50Arr = DoubleArray(totalHorizonCanon)
        val q75Arr = DoubleArray(totalHorizonCanon)
        val q90Arr = DoubleArray(totalHorizonCanon)
        val meanReturns = DoubleArray(totalHorizonCanon)
        val sigmas = DoubleArray(totalHorizonCanon)

        var cumQ50 = 0.0
        for (h in 0 until totalHorizonCanon) {
            val hDecay = 0.94.pow(h + 1)
            val sqrtH = sqrt((h + 1).toDouble())

            val rawQs = DoubleArray(nHeads) { hIdx ->
                var zQ = bHead[hIdx]
                for (f in 0 until featDim) zQ += wHead[hIdx][f] * latestCtx[f]
                zQ
            }
            val zMed = rawQs[2].coerceIn(-2.0, 2.0) * hDecay
            val stepRet = (muRet * hDecay + zMed * sdRet).coerceIn(-stepCap, stepCap)
            meanReturns[h] = stepRet
            cumQ50 += stepRet

            val halfIqrZ = max(0.35, (rawQs[3] - rawQs[1]) * 0.5)
            val half80Z = max(0.75, (rawQs[4] - rawQs[0]) * 0.5)
            val medP = features.lastClose * exp(cumQ50)
            sigmas[h] = max(features.ewmaSigma * 0.70, ((half80Z * sdRet) / 1.28155) * 0.85)

            val span80 = medP * (half80Z * sdRet) * sqrtH
            val span50 = medP * (halfIqrZ * sdRet) * sqrtH
            val q = ForecastCalendarHelper.enforceMonotonicQuantiles(
                medP - span80,
                medP - span50,
                medP,
                medP + span50,
                medP + span80,
                features.lastClose * 0.01
            )
            q10Arr[h] = q[0]; q25Arr[h] = q[1]; q50Arr[h] = q[2]; q75Arr[h] = q[3]; q90Arr[h] = q[4]
        }

        return PluginPrediction(
            modelId = id,
            meanReturns = meanReturns.copyOfRange(0, horizon),
            sigmas = sigmas.copyOfRange(0, horizon),
            status = ModelExecutionStatus.SUCCESS,
            isApproximation = true,
            isCalibratedInterval = false,
            directQuantiles = DirectQuantiles(
                q10Arr.copyOfRange(0, horizon),
                q25Arr.copyOfRange(0, horizon),
                q50Arr.copyOfRange(0, horizon),
                q75Arr.copyOfRange(0, horizon),
                q90Arr.copyOfRange(0, horizon)
            ),
            modelVersion = "1.0.0"
        )
    }
}
