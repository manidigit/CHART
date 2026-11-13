package es.manico.chartintelligence.algorithms

import es.manico.chartintelligence.data.model.CandleBar
import kotlin.math.max

/**
 * ENG-03: Data Integrity & Gap Detection Engine (parity with GapDetector.php & gapDetector.js).
 * Audits a closed-candle time series against the instrument's SessionCalendar
 * (CRYPTO_24_7, US_EQUITIES 09:30–16:00 NY, OTC_FX_METALS Sun 22:00 UTC–Fri 22:00 UTC)
 * and surfaces missing market windows honestly without synthesizing artificial bars.
 */
data class GapWindow(
    val gapStartMs: Long,
    val gapEndMs: Long,
    val missingBars: Int
)

data class GapReport(
    val symbolCode: String,
    val timeframe: String,
    val checkedBars: Int,
    val gapCount: Int,
    val totalMissingBars: Int,
    val integrityRatio: Double,
    val status: String, // "CLEAN", "MINOR_GAPS", "DEGRADED", "EMPTY"
    val largestGaps: List<GapWindow>
)

object GapDetectorAlgorithm {

    fun isTradingSlotExpected(slotOpenMs: Long, timeframe: String, symbolCode: String = "XAUUSD"): Boolean {
        val tf = timeframe.trim().uppercase()
        val cal = UtcTimeAnchorAlgorithm.getSessionCalendar(symbolCode)
        if (cal == SessionCalendar.CRYPTO_24_7) return true
        val stepMs = UtcTimeAnchorAlgorithm.timeframeStepMillis(tf)
        val probeMs = if (tf in setOf("D1", "1D", "D", "W1", "1W", "W")) {
            slotOpenMs + stepMs / 2L
        } else {
            slotOpenMs + minOf(stepMs / 2L, 30L * 60L * 1000L)
        }
        if (cal == SessionCalendar.US_EQUITIES && tf in setOf("D1", "1D", "D")) {
            val nyZdt = java.time.ZonedDateTime.ofInstant(
                java.time.Instant.ofEpochMilli(slotOpenMs),
                java.time.ZoneId.of("America/New_York")
            )
            val dow = nyZdt.dayOfWeek
            return dow != java.time.DayOfWeek.SATURDAY && dow != java.time.DayOfWeek.SUNDAY
        }
        return UtcTimeAnchorAlgorithm.isMarketOpen(probeMs, symbolCode)
    }

    fun detectGaps(
        candles: List<CandleBar>,
        timeframe: String,
        symbolCode: String = "XAUUSD"
    ): GapReport {
        val normTf = timeframe.trim().uppercase().ifBlank { "M15" }
        val stepMs = UtcTimeAnchorAlgorithm.timeframeStepMillis(normTf)
        if (candles.size < 2) {
            return GapReport(
                symbolCode = symbolCode.uppercase(),
                timeframe = normTf,
                checkedBars = candles.size,
                gapCount = 0,
                totalMissingBars = 0,
                integrityRatio = if (candles.isEmpty()) 0.0 else 1.0,
                status = if (candles.isEmpty()) "EMPTY" else "CLEAN",
                largestGaps = emptyList()
            )
        }

        val sorted = candles.sortedBy { it.openTimeUtcMillis }
        val gaps = ArrayList<GapWindow>()
        var totalMissing = 0

        for (i in 1 until sorted.size) {
            val prevOpen = sorted[i - 1].openTimeUtcMillis
            val curOpen = sorted[i].openTimeUtcMillis
            val diff = curOpen - prevOpen
            if (diff <= stepMs) continue

            val stepsBetween = (diff / stepMs).toInt()
            if (stepsBetween <= 1 || stepsBetween > 5000) continue

            var missingInWindow = 0
            for (k in 1 until stepsBetween) {
                val probeOpen = prevOpen + k.toLong() * stepMs
                if (isTradingSlotExpected(probeOpen, normTf, symbolCode)) {
                    missingInWindow++
                }
            }

            // Allow single bank holiday tolerance on D1/W1 non-crypto feeds
            val threshold = if (normTf in setOf("D1", "W1") &&
                UtcTimeAnchorAlgorithm.getSessionCalendar(symbolCode) != SessionCalendar.CRYPTO_24_7
            ) 2 else 1

            if (missingInWindow >= threshold) {
                gaps.add(
                    GapWindow(
                        gapStartMs = prevOpen + stepMs,
                        gapEndMs = curOpen - stepMs,
                        missingBars = missingInWindow
                    )
                )
                totalMissing += missingInWindow
            }
        }

        val expectedTotal = sorted.size + totalMissing
        val integrity = if (expectedTotal > 0) sorted.size.toDouble() / expectedTotal.toDouble() else 1.0
        val status = when {
            gaps.isEmpty() -> "CLEAN"
            integrity >= 0.96 -> "MINOR_GAPS"
            else -> "DEGRADED"
        }

        val largest = gaps.sortedByDescending { it.missingBars }.take(8)
        return GapReport(
            symbolCode = symbolCode.uppercase(),
            timeframe = normTf,
            checkedBars = sorted.size,
            gapCount = gaps.size,
            totalMissingBars = totalMissing,
            integrityRatio = (Math.round(integrity * 10000.0) / 10000.0),
            status = status,
            largestGaps = largest
        )
    }
}
