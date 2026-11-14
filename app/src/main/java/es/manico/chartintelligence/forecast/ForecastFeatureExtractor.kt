package es.manico.chartintelligence.forecast

import es.manico.chartintelligence.data.model.CandleBar
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

data class CleanOhlcBar(
    val open: Double,
    val high: Double,
    val low: Double,
    val close: Double,
    val volume: Double,
    val openTimeUtcMs: Long
)

data class ExtractedForecastFeatures(
    val candles: List<CleanOhlcBar>,
    val barCount: Int,
    val lastClose: Double,
    val lastOpenMs: Long,
    val logReturns: DoubleArray,
    val meanReturn: Double,
    val recentMeanReturn: Double,
    val uncondVariance: Double,
    val uncondSigma: Double,
    val ewmaSigma: Double,
    val shortVol: Double,
    val longVol: Double,
    val realizedVolRatio: Double,
    val atr14: Double,
    val atrPct: Double,
    val rsi14: Double,
    val driftZ: Double,
    val regime: MarketRegime,
    val avgBodyRatio: Double,
    val avgUpperWickRatio: Double,
    val avgLowerWickRatio: Double
)

object ForecastFeatureExtractor {

    fun validateReadiness(candles: List<CandleBar>, minBars: Int = 24): DataReadinessReport {
        val issues = ArrayList<String>()
        if (candles.isEmpty()) {
            return DataReadinessReport(false, 0, 0, minBars, listOf("No historical candles available"))
        }
        var validCount = 0
        var nonPositive = 0
        var nonMonotonic = 0
        var prevMs = Long.MIN_VALUE

        for (c in candles) {
            val o = c.open.toDouble()
            val cl = c.close.toDouble()
            if (!o.isFinite() || !cl.isFinite() || o <= 0.0 || cl <= 0.0) {
                nonPositive++
                continue
            }
            if (c.openTimeUtcMillis < prevMs) {
                nonMonotonic++
            }
            prevMs = c.openTimeUtcMillis
            validCount++
        }

        if (validCount < minBars) {
            issues.add("Need at least $minBars valid bars (found $validCount)")
        }
        val badLimit = max(2.0, candles.size * 0.1)
        if (nonPositive > badLimit) {
            issues.add("Detected $nonPositive non-positive OHLC bars")
        }
        if (nonMonotonic > 0) {
            issues.add("Detected $nonMonotonic out-of-order timestamps")
        }

        return DataReadinessReport(
            ready = validCount >= minBars && nonPositive <= badLimit,
            barCount = candles.size,
            validBarCount = validCount,
            minBars = minBars,
            issues = issues
        )
    }

    fun extract(candles: List<CandleBar>, maxLookback: Int = 180): ExtractedForecastFeatures? {
        val clean = ArrayList<CleanOhlcBar>(candles.size)
        for (c in candles) {
            val o = c.open.toDouble()
            val h = c.high.toDouble()
            val l = c.low.toDouble()
            val cl = c.close.toDouble()
            if (o.isFinite() && h.isFinite() && l.isFinite() && cl.isFinite() && o > 0.0 && cl > 0.0) {
                clean.add(
                    CleanOhlcBar(
                        open = o,
                        high = max(h, max(o, cl)),
                        low = max(1e-8, min(l, min(o, cl))),
                        close = cl,
                        volume = max(0.0, c.volume.toDouble()),
                        openTimeUtcMs = c.openTimeUtcMillis
                    )
                )
            }
        }
        return extractClean(if (clean.size > maxLookback) clean.subList(clean.size - maxLookback, clean.size) else clean)
    }

    internal fun extractClean(slice: List<CleanOhlcBar>): ExtractedForecastFeatures? {
        val n = slice.size
        if (n < 2) return null

        val logReturns = DoubleArray(n - 1)
        for (i in 1 until n) {
            val r = ln(slice[i].close / slice[i - 1].close)
            logReturns[i - 1] = if (r.isFinite()) r else 0.0
        }

        val rCount = logReturns.size
        val meanReturn = logReturns.average()
        var varSum = 0.0
        for (r in logReturns) {
            val d = r - meanReturn
            varSum += d * d
        }
        val uncondVariance = max(1e-10, varSum / max(1, rCount - 1))
        val uncondSigma = sqrt(uncondVariance)

        var ewmaVar = uncondVariance
        val lambda = 0.94
        for (r in logReturns) {
            ewmaVar = lambda * ewmaVar + (1.0 - lambda) * (r * r)
        }
        val ewmaSigma = max(1e-5, sqrt(ewmaVar))

        val shortWin = logReturns.takeLast(min(8, rCount))
        val longWin = logReturns.takeLast(min(32, rCount))
        val shortVol = max(1e-6, sqrt(shortWin.sumOf { it * it } / max(1, shortWin.size)))
        val longVol = max(1e-6, sqrt(longWin.sumOf { it * it } / max(1, longWin.size)))
        val realizedVolRatio = shortVol / longVol

        val atrPeriod = min(14, n - 1)
        val lastClose = slice[n - 1].close
        var trSum = 0.0
        var bodySum = 0.0
        var upWickSum = 0.0
        var dnWickSum = 0.0
        for (i in (n - atrPeriod) until n) {
            val cur = slice[i]
            val prevC = slice[i - 1].close
            val tr = max(cur.high - cur.low, max(abs(cur.high - prevC), abs(cur.low - prevC)))
            trSum += tr
            val rng = max(cur.high - cur.low, lastClose * 0.0005)
            bodySum += abs(cur.close - cur.open) / rng
            upWickSum += (cur.high - max(cur.open, cur.close)) / rng
            dnWickSum += (min(cur.open, cur.close) - cur.low) / rng
        }

        val atr14 = max(trSum / max(1, atrPeriod), lastClose * 0.0008)
        val atrPct = atr14 / lastClose
        val avgBodyRatio = (bodySum / max(1, atrPeriod)).coerceIn(0.30, 0.72)
        val avgUpperWickRatio = (upWickSum / max(1, atrPeriod)).coerceIn(0.10, 0.42)
        val avgLowerWickRatio = (dnWickSum / max(1, atrPeriod)).coerceIn(0.10, 0.42)

        var gains = 0.0
        var losses = 0.0
        val rsiStart = max(0, rCount - 14)
        val rsiLen = max(1, rCount - rsiStart)
        for (i in rsiStart until rCount) {
            val r = logReturns[i]
            if (r >= 0.0) gains += r else losses += abs(r)
        }
        val avgGain = gains / rsiLen
        val avgLoss = losses / rsiLen
        val rsi14 = when {
            avgLoss <= 1e-12 -> if (avgGain > 0.0) 100.0 else 50.0
            else -> 100.0 - 100.0 / (1.0 + avgGain / avgLoss)
        }

        val recentWin = logReturns.takeLast(min(20, rCount))
        val recentMean = recentWin.average()
        val driftZ = recentMean / max(1e-6, ewmaSigma / sqrt(max(1, recentWin.size).toDouble()))

        val regime = when {
            realizedVolRatio > 1.38 || atrPct > uncondSigma * 2.15 -> MarketRegime.HIGH_VOLATILITY
            driftZ > 1.15 && rsi14 > 54.0 -> MarketRegime.TRENDING_UP
            driftZ < -1.15 && rsi14 < 46.0 -> MarketRegime.TRENDING_DOWN
            else -> MarketRegime.RANGING
        }

        return ExtractedForecastFeatures(
            candles = slice,
            barCount = n,
            lastClose = lastClose,
            lastOpenMs = slice[n - 1].openTimeUtcMs,
            logReturns = logReturns,
            meanReturn = meanReturn,
            recentMeanReturn = recentMean,
            uncondVariance = uncondVariance,
            uncondSigma = uncondSigma,
            ewmaSigma = ewmaSigma,
            shortVol = shortVol,
            longVol = longVol,
            realizedVolRatio = realizedVolRatio,
            atr14 = atr14,
            atrPct = atrPct,
            rsi14 = rsi14,
            driftZ = driftZ,
            regime = regime,
            avgBodyRatio = avgBodyRatio,
            avgUpperWickRatio = avgUpperWickRatio,
            avgLowerWickRatio = avgLowerWickRatio
        )
    }
}
