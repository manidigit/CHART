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
    val avgLowerWickRatio: Double,
    val hasRealVolume: Boolean = false,
    val futureTimestamps: LongArray? = null
)

object ForecastFeatureExtractor {

    /**
     * Rev 2.1 Zero-Clamping Data Readiness Gate.
     * Rejects corrupted OHLC, non-monotonic/duplicate timestamps, unclosed bars, disallowed gaps, or insufficient bars.
     */
    fun validateReadiness(
        candles: List<CandleBar>,
        horizonBars: Int = 30,
        minBars: Int? = null,
        timeframe: String = "M15",
        symbolCode: String = "XAUUSD",
        providerId: String = "twelvedata",
        calendarSpec: ForecastCalendarRegistry.CalendarSpec? = null,
        anchorNowMs: Long = System.currentTimeMillis(),
        checkClosedBar: Boolean = true,
        enforceCalendarGaps: Boolean = false
    ): DataReadinessReport {
        val h = ForecastCalendarHelper.clampHorizonBars(horizonBars)
        val req = ForecastCalendarHelper.computeHorizonRequirements(h)
        val nOpMin = minBars ?: req.nOpMin
        val spec = calendarSpec ?: ForecastCalendarRegistry.resolveCalendarSpec(symbolCode, providerId)
        val cleanTimeframe = timeframe.trim().uppercase()

        val issues = ArrayList<String>()
        val errorCodes = ArrayList<String>()

        if (candles.isEmpty()) {
            return DataReadinessReport(
                ready = false,
                statisticallySufficient = false,
                barCount = 0,
                validBarCount = 0,
                nOpMin = nOpMin,
                nStatMin = req.nStatMin,
                minBars = nOpMin,
                errorCodes = listOf("EMPTY_OR_MISSING"),
                issues = listOf("No historical candles available"),
                calendarId = spec.calendarId,
                calendarVersion = spec.calendarVersion,
                disallowedGapCount = 0,
                cleanCandles = emptyList()
            )
        }

        var corruptedOhlc = 0
        var nonMonotonic = 0
        var prevMs = Long.MIN_VALUE
        val cleanCandles = ArrayList<CleanOhlcBar>(candles.size)

        for (c in candles) {
            val o = c.open.toDouble()
            val hi = c.high.toDouble()
            val lo = c.low.toDouble()
            val cl = c.close.toDouble()
            val vol = c.volume.toDouble()
            val ms = c.openTimeUtcMillis

            if (!o.isFinite() || !hi.isFinite() || !lo.isFinite() || !cl.isFinite() ||
                o <= 0.0 || hi <= 0.0 || lo <= 0.0 || cl <= 0.0 ||
                !vol.isFinite() || vol < 0.0 ||
                hi < lo || hi < max(o, cl) || lo > min(o, cl) ||
                ms <= 0L
            ) {
                corruptedOhlc++
                continue
            }

            if (ms <= prevMs) {
                nonMonotonic++
            }
            prevMs = ms
            cleanCandles.add(
                CleanOhlcBar(
                    open = o,
                    high = hi,
                    low = lo,
                    close = cl,
                    volume = vol,
                    openTimeUtcMs = ms
                )
            )
        }

        if (corruptedOhlc > 0) {
            errorCodes.add("OHLC_CORRUPTED")
            issues.add("OHLC_CORRUPTED: Detected $corruptedOhlc bars with invalid/non-finite/inverted OHLC (zero silent clamping)")
        }
        if (nonMonotonic > 0) {
            errorCodes.add("NON_MONOTONIC_OR_DUPLICATE_TIMESTAMP")
            issues.add("NON_MONOTONIC_OR_DUPLICATE_TIMESTAMP: Detected $nonMonotonic out-of-order or duplicate timestamps")
        }

        if (cleanCandles.isNotEmpty() && checkClosedBar) {
            val lastMs = cleanCandles.last().openTimeUtcMs
            val closeMs = ForecastCalendarRegistry.getCandleCloseMsForCalendar(lastMs, cleanTimeframe, spec)
            if (closeMs > anchorNowMs) {
                errorCodes.add("UNCLOSED_BAR_DETECTED")
                issues.add("UNCLOSED_BAR_DETECTED: Last bar closes at $closeMs > anchorNowMs $anchorNowMs")
            }
        }

        var gapReport = ForecastCalendarRegistry.CalendarGapReport(0, 0, emptyList())
        if (cleanCandles.size >= 2 && nonMonotonic == 0) {
            gapReport = ForecastCalendarRegistry.inspectCalendarGaps(
                cleanCandles.map { it.openTimeUtcMs },
                cleanTimeframe,
                spec
            )
            if (enforceCalendarGaps && gapReport.gapCount > 0) {
                errorCodes.add("DISALLOWED_MARKET_GAP")
                issues.add("DISALLOWED_MARKET_GAP: ${gapReport.gapCount} unexpected gaps (${gapReport.totalMissingBars} bars) during open session")
            }
        }

        if (cleanCandles.size < nOpMin) {
            errorCodes.add("BELOW_OPERATIONAL_MIN_BARS")
            issues.add("Need at least $nOpMin clean closed bars for H=$h (found ${cleanCandles.size})")
        }

        val ready = errorCodes.isEmpty()
        val statisticallySufficient = ready && cleanCandles.size >= req.nStatMin

        return DataReadinessReport(
            ready = ready,
            statisticallySufficient = statisticallySufficient,
            barCount = candles.size,
            validBarCount = cleanCandles.size,
            nOpMin = nOpMin,
            nStatMin = req.nStatMin,
            minBars = nOpMin,
            errorCodes = errorCodes,
            issues = issues,
            calendarId = spec.calendarId,
            calendarVersion = spec.calendarVersion,
            disallowedGapCount = gapReport.gapCount,
            disallowedMissingBars = gapReport.totalMissingBars,
            cleanCandles = cleanCandles
        )
    }

    fun extract(candles: List<CandleBar>, maxLookback: Int = 2500): ExtractedForecastFeatures? {
        val clean = ArrayList<CleanOhlcBar>(candles.size)
        for (c in candles) {
            val o = c.open.toDouble()
            val h = c.high.toDouble()
            val l = c.low.toDouble()
            val cl = c.close.toDouble()
            val vol = c.volume.toDouble()
            val ms = c.openTimeUtcMillis
            if (o.isFinite() && h.isFinite() && l.isFinite() && cl.isFinite() &&
                o > 0.0 && cl > 0.0 && h >= l && h >= max(o, cl) && l <= min(o, cl) &&
                vol.isFinite() && vol >= 0.0
            ) {
                clean.add(
                    CleanOhlcBar(
                        open = o,
                        high = h,
                        low = l,
                        close = cl,
                        volume = vol,
                        openTimeUtcMs = ms
                    )
                )
            }
        }
        return extractClean(if (clean.size > maxLookback) clean.takeLast(maxLookback) else clean)
    }

    fun extractClean(slice: List<CleanOhlcBar>): ExtractedForecastFeatures? {
        val n = slice.size
        if (n < 2) return null

        val closes = DoubleArray(n) { slice[it].close }
        val logReturns = DoubleArray(n - 1)
        for (i in 1 until n) {
            val r = ln(closes[i] / closes[i - 1])
            logReturns[i - 1] = if (r.isFinite()) r else 0.0
        }

        val rCount = logReturns.size
        var meanReturn = 0.0
        for (r in logReturns) meanReturn += r
        meanReturn /= max(1, rCount).toDouble()

        var varSum = 0.0
        for (r in logReturns) {
            val diff = r - meanReturn
            varSum += diff * diff
        }
        val uncondVariance = max(1e-10, varSum / max(1, rCount - 1).toDouble())
        val uncondSigma = sqrt(uncondVariance)

        // RiskMetrics causal EWMA variance (lambda = 0.94)
        var ewmaVar = uncondVariance
        val lambda = 0.94
        for (r in logReturns) {
            ewmaVar = lambda * ewmaVar + (1.0 - lambda) * (r * r)
        }
        val ewmaSigma = max(1e-5, sqrt(ewmaVar))

        fun rms(arr: DoubleArray): Double {
            if (arr.isEmpty()) return 1e-6
            var sum = 0.0
            for (v in arr) sum += v * v
            return sqrt(sum / arr.size.toDouble())
        }

        val shortLen = min(8, rCount)
        val longLen = min(32, rCount)
        val shortWin = DoubleArray(shortLen) { logReturns[rCount - shortLen + it] }
        val longWin = DoubleArray(longLen) { logReturns[rCount - longLen + it] }
        val shortVol = max(1e-6, rms(shortWin))
        val longVol = max(1e-6, rms(longWin))
        val realizedVolRatio = shortVol / longVol

        val atrPeriod = min(14, n - 1)
        var trSum = 0.0
        var bodyRatioSum = 0.0
        var upperWickSum = 0.0
        var lowerWickSum = 0.0
        val lastClose = closes[n - 1]

        for (i in (n - atrPeriod) until n) {
            val cur = slice[i]
            val prevC = slice[i - 1].close
            val tr = max(cur.high - cur.low, max(abs(cur.high - prevC), abs(cur.low - prevC)))
            trSum += tr
            val rng = max(cur.high - cur.low, lastClose * 1e-6)
            bodyRatioSum += abs(cur.close - cur.open) / rng
            upperWickSum += (cur.high - max(cur.open, cur.close)) / rng
            lowerWickSum += (min(cur.open, cur.close) - cur.low) / rng
        }

        val atr14 = max(trSum / max(1, atrPeriod).toDouble(), lastClose * 1e-5)
        val atrPct = atr14 / lastClose

        var gains = 0.0
        var losses = 0.0
        val rsiStart = max(0, rCount - 14)
        val rsiLen = max(1, rCount - rsiStart).toDouble()
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

        val recentLen = min(20, rCount)
        var recentSum = 0.0
        for (i in (rCount - recentLen) until rCount) recentSum += logReturns[i]
        val recentMean = recentSum / max(1, recentLen).toDouble()
        val driftZ = recentMean / max(1e-6, ewmaSigma / sqrt(max(1, recentLen).toDouble()))

        val regime = when {
            realizedVolRatio > 1.38 || atrPct > uncondSigma * 2.15 -> MarketRegime.HIGH_VOLATILITY
            driftZ > 1.0 && rsi14 > 53.0 -> MarketRegime.TRENDING_BULL
            driftZ < -1.0 && rsi14 < 47.0 -> MarketRegime.TRENDING_BEAR
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
            avgBodyRatio = bodyRatioSum / max(1, atrPeriod).toDouble(),
            avgUpperWickRatio = upperWickSum / max(1, atrPeriod).toDouble(),
            avgLowerWickRatio = lowerWickSum / max(1, atrPeriod).toDouble(),
            hasRealVolume = slice.any { it.volume > 0.0 },
            futureTimestamps = null
        )
    }
}
