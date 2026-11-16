package es.manico.chartintelligence.forecast

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * Rev 2.1 Strictly Causal Empirical Analog Engine.
 * Zero synthetic wave templates, zero fabricated volumes, zero artificial rejection wicks.
 * Strictly respects j_max = T - L_curr - L_analog - H - G_embargo so no analog future overlaps current window or embargo gap.
 */
class EmpiricalAnalogEngine(
    windowSize: Int = 24,
    horizon: Int = 20,
    val timeframe: String = "M15"
) {
    val windowSize: Int = max(12, min(48, windowSize))
    val horizon: Int = ForecastCalendarHelper.clampHorizonBars(horizon)
    val topKAnalogs: Int = 25

    data class AnalogMatch(
        val originIndex: Int,
        val futureEndIndex: Int,
        val distance: Double,
        val pastAtr: Double,
        val futureLogReturns: List<Double>
    )

    data class AnalogSearchResult(
        val status: String,
        val reason: String,
        val analogs: List<AnalogMatch>,
        val jMax: Int,
        val embargoGap: Int,
        val windowLength: Int
    )

    data class EmpiricalProjectionResult(
        val status: ModelExecutionStatus,
        val reason: String,
        val jMax: Int,
        val embargoGap: Int,
        val matchedCount: Int,
        val points: List<ForecastPoint>,
        val representativePaths: List<RepresentativePath>
    )

    fun calculateATR(candles: List<CleanOhlcBar>, period: Int = 14): Double {
        if (candles.size < 2) return 0.0
        val p = min(period, candles.size - 1)
        var trSum = 0.0
        for (i in (candles.size - p) until candles.size) {
            val curr = candles[i]
            val prevClose = candles[i - 1].close
            val hi = curr.high
            val lo = curr.low
            trSum += max(hi - lo, max(abs(hi - prevClose), abs(lo - prevClose)))
        }
        val lastClose = candles.last().close
        return max(trSum / max(1, p), lastClose * 1e-4)
    }

    fun extractNormalizedShape(window: List<CleanOhlcBar>, atr: Double): DoubleArray {
        val baseClose = max(1e-8, window.firstOrNull()?.close ?: 1.0)
        val safeAtr = max(1e-8, atr)
        val vec = DoubleArray(window.size * 2)
        var idx = 0
        for (c in window) {
            val retNorm = (c.close - baseClose) / safeAtr
            vec[idx++] = retNorm
            val range = max(1e-8, c.high - c.low)
            vec[idx++] = (c.close - c.open) / range
        }
        return vec
    }

    /**
     * Strictly Causal Analog Search:
     *   j_max = T - L_curr - L_analog - H - G_embargo
     * Returns honest INSUFFICIENT_EVIDENCE when history < j_max threshold or empirical matches < 6.
     */
    fun findCausalAnalogs(candles: List<CleanOhlcBar>, horizonBars: Int, currentAtr: Double): AnalogSearchResult {
        val t = candles.size
        val h = max(10, horizonBars)
        val effL = min(windowSize, max(12, (t * 0.15).toInt()))
        val embargo = max(5, ceil(0.25 * h).toInt())
        val jMax = t - effL - effL - h - embargo

        if (jMax < 15) {
            return AnalogSearchResult(
                status = "INSUFFICIENT_EVIDENCE",
                reason = "Insufficient non-overlapping history for causal analog search (jMax=$jMax < 15 at H=$h, embargo=$embargo)",
                analogs = emptyList(),
                jMax = jMax,
                embargoGap = embargo,
                windowLength = effL
            )
        }

        val currentWindow = candles.subList(t - effL, t)
        val currentVec = extractNormalizedShape(currentWindow, currentAtr)
        val matches = mutableListOf<AnalogMatch>()
        val stride = if (jMax > 300) max(1, jMax / 250) else 1

        var j = 14
        while (j <= jMax) {
            val candidateWin = candles.subList(j, j + effL)
            val pastAtr = calculateATR(candles.subList(max(0, j - 14), j + effL), 14)
            val candVec = extractNormalizedShape(candidateWin, pastAtr)
            var distSq = 0.0
            val len = currentVec.size
            for (k in 0 until len) {
                val w = if (k >= len * 0.6) 1.5 else 1.0
                val d = currentVec[k] - (if (k < candVec.size) candVec[k] else 0.0)
                distSq += w * d * d
            }
            val distance = sqrt(distSq / max(1, len))
            val futureStart = j + effL
            val futureEnd = futureStart + h

            // Double check strict causality: candidate future ends BEFORE current window starts minus embargo
            if (futureEnd <= t - effL - embargo) {
                val originClose = max(1e-8, candidateWin.last().close)
                val futureLogReturns = ArrayList<Double>(h)
                for (step in 0 until h) {
                    val fc = max(1e-8, candles[futureStart + step].close)
                    futureLogReturns.add(ln(fc / originClose))
                }
                matches.add(
                    AnalogMatch(
                        originIndex = j + effL - 1,
                        futureEndIndex = futureEnd - 1,
                        distance = distance,
                        pastAtr = pastAtr,
                        futureLogReturns = futureLogReturns
                    )
                )
            }
            j += stride
        }

        matches.sortBy { it.distance }
        val topAnalogs = matches.take(topKAnalogs)
        if (topAnalogs.size < 6) {
            return AnalogSearchResult(
                status = "INSUFFICIENT_EVIDENCE",
                reason = "Only ${topAnalogs.size} causal historical analogs found (minimum 6 required, no synthetic profiles permitted)",
                analogs = topAnalogs,
                jMax = jMax,
                embargoGap = embargo,
                windowLength = effL
            )
        }

        return AnalogSearchResult(
            status = "READY",
            reason = "Matched ${topAnalogs.size} strictly causal non-overlapping analogs (jMax=$jMax, embargo=$embargo)",
            analogs = topAnalogs,
            jMax = jMax,
            embargoGap = embargo,
            windowLength = effL
        )
    }

    /**
     * Produces empirical percentile quantile trajectory + illustrative representative closes from matched real analogs.
     */
    fun projectEmpirical(
        candles: List<CleanOhlcBar>,
        features: ExtractedForecastFeatures,
        horizonBars: Int,
        futureTimestamps: List<Long> = emptyList()
    ): EmpiricalProjectionResult {
        val h = ForecastCalendarHelper.clampHorizonBars(horizonBars)
        val lastClose = features.lastClose
        val search = findCausalAnalogs(candles, h, features.atr14)

        if (search.status != "READY") {
            return EmpiricalProjectionResult(
                status = ModelExecutionStatus.SKIPPED_LOW_DATA,
                reason = search.reason,
                jMax = search.jMax,
                embargoGap = search.embargoGap,
                matchedCount = search.analogs.size,
                points = emptyList(),
                representativePaths = emptyList()
            )
        }

        val analogs = search.analogs
        val points = ArrayList<ForecastPoint>(h)

        fun qAt(sorted: DoubleArray, p: Double): Double {
            val idx = max(0.0, min((sorted.size - 1).toDouble(), p * (sorted.size - 1)))
            val lo = floor(idx).toInt()
            val hi = ceil(idx).toInt()
            val frac = idx - lo
            return sorted[lo] * (1.0 - frac) + sorted[hi] * frac
        }

        var prevMedian = lastClose
        for (step in 0 until h) {
            val prices = DoubleArray(analogs.size) { i ->
                lastClose * exp(analogs[i].futureLogReturns.getOrElse(step) { 0.0 })
            }
            prices.sort()

            val mq = ForecastCalendarHelper.enforceMonotonicQuantiles(
                qAt(prices, 0.10),
                qAt(prices, 0.25),
                qAt(prices, 0.50),
                qAt(prices, 0.75),
                qAt(prices, 0.90),
                lastClose * 0.01
            )
            val openTime = futureTimestamps.getOrElse(step) { 0L }
            val pctChange = ((mq[2] - lastClose) / lastClose) * 100.0
            val cOpen = prevMedian
            val cClose = mq[2]
            val cHigh = max(mq[3], max(cOpen, cClose))
            val cLow = min(mq[1], min(cOpen, cClose))
            prevMedian = cClose

            points.add(
                ForecastPoint(
                    stepAhead = step + 1,
                    openTimeUtcMs = openTime,
                    open = cOpen,
                    high = cHigh,
                    low = cLow,
                    close = cClose,
                    q10 = mq[0],
                    q25 = mq[1],
                    q50 = mq[2],
                    q75 = mq[3],
                    q90 = mq[4],
                    pctChangeFromLast = pctChange,
                    volume = 0.0,
                    rejectionWick = false,
                    wavePhase = "IMPULSE",
                    upperBand = mq[4],
                    lowerBand = mq[0]
                )
            )
        }

        // Extract 3 empirical medoid representative close curves strictly tagged illustrative (zero synthetic OHLC wicks/volume)
        val bullAn = analogs.filter { it.futureLogReturns.getOrElse(h - 1) { 0.0 } > 0 }
        val bearAn = analogs.filter { it.futureLogReturns.getOrElse(h - 1) { 0.0 } < 0 }
        val neutralAn = analogs.sortedBy { abs(it.futureLogReturns.getOrElse(h - 1) { 0.0 }) }

        fun buildRep(id: String, label: String, arr: List<AnalogMatch>): RepresentativePath? {
            if (arr.isEmpty()) return null
            val medoid = arr[arr.size / 2]
            val closes = medoid.futureLogReturns.map { r ->
                ForecastSha256.roundToSignificant(lastClose * exp(r), 10).toDouble()
            }
            val distRounded = (medoid.distance * 10000.0).roundToInt() / 10000.0
            return RepresentativePath(
                id = id,
                label = label,
                isIllustrativeOnly = true,
                originIndex = medoid.originIndex,
                distance = distRounded,
                closes = closes
            )
        }

        val representativePaths = listOfNotNull(
            buildRep("ANALOG_UPPER", "Empirical Upper Analog Medoid (Illustrative Only)", bullAn),
            buildRep("ANALOG_CENTER", "Empirical Central Analog Medoid (Illustrative Only)", neutralAn),
            buildRep("ANALOG_LOWER", "Empirical Lower Analog Medoid (Illustrative Only)", bearAn)
        )

        return EmpiricalProjectionResult(
            status = ModelExecutionStatus.SUCCESS,
            reason = search.reason,
            jMax = search.jMax,
            embargoGap = search.embargoGap,
            matchedCount = analogs.size,
            points = points,
            representativePaths = representativePaths
        )
    }
}
