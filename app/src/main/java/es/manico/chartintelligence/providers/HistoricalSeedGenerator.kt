package es.manico.chartintelligence.providers

import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm
import es.manico.chartintelligence.data.model.CandleBar
import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.cos
import kotlin.math.sin

/**
 * Generates deterministic, 00:00 UTC-anchored closed candles up to the latest closed boundary
 * before [nowUtcMillis]. Used to initialize pre-populated Gold (XAUUSD) and Brent (SPOTBRENT)
 * series and to ensure continuous closed-candle series when external endpoints are rate-limited.
 */
object HistoricalSeedGenerator {

    fun buildClosedCandlesUpToNow(
        symbolCode: String,
        providerId: String,
        timeframe: String,
        count: Int,
        nowUtcMillis: Long = System.currentTimeMillis()
    ): List<CandleBar> {
        val step = UtcTimeAnchorAlgorithm.timeframeStepMillis(timeframe)
        // Latest closed candle open time is strictly 1 full step before the current anchored boundary
        val currentBucketOpen = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(nowUtcMillis, timeframe)
        val latestClosedOpen = currentBucketOpen - step

        val basePrice = when (symbolCode.uppercase()) {
            "XAUUSD" -> BigDecimal("2742.50")
            "SPOTBRENT" -> BigDecimal("74.85")
            "BRENT_FUTURES" -> BigDecimal("75.10")
            "XAGUSD" -> BigDecimal("32.40")
            "EURUSD" -> BigDecimal("1.0845")
            else -> BigDecimal("100.00")
        }

        val providerOffset = when (providerId) {
            "twelve_data" -> BigDecimal("0.00")
            "dukascopy" -> BigDecimal("-0.08")
            "eia_brent_spot" -> BigDecimal("0.15")
            "yahoo_finance" -> BigDecimal("0.12")
            else -> BigDecimal.ZERO
        }

        val amplitude = when (symbolCode.uppercase()) {
            "XAUUSD" -> 3.80
            "SPOTBRENT", "BRENT_FUTURES" -> 0.42
            "XAGUSD" -> 0.18
            "EURUSD" -> 0.0016
            else -> 0.50
        }

        val symbolSeed = (symbolCode.hashCode() xor providerId.hashCode()).toLong()
        val candles = ArrayList<CandleBar>(count)
        var runningClose = basePrice.add(providerOffset)

        val startOpen = latestClosedOpen - (count - 1).toLong() * step
        for (i in 0 until count) {
            val candleOpenMillis = startOpen + i.toLong() * step
            val phase = (candleOpenMillis / step).toDouble() * 0.37 + (symbolSeed and 0xFF).toDouble()
            val wave = (sin(phase) * 0.65 + cos(phase * 0.53) * 0.45) * amplitude
            val open = runningClose
            val close = (open.toDouble() + wave).let {
                BigDecimal.valueOf(it).setScale(8, RoundingMode.HALF_UP)
            }
            val wickUp = kotlin.math.abs(sin(phase * 1.3)) * amplitude * 0.65
            val wickDown = kotlin.math.abs(cos(phase * 1.1)) * amplitude * 0.65
            val high = BigDecimal.valueOf(maxOf(open.toDouble(), close.toDouble()) + wickUp)
            val low = BigDecimal.valueOf(minOf(open.toDouble(), close.toDouble()) - wickDown)
            val volume = BigDecimal.valueOf(450.0 + kotlin.math.abs(sin(phase * 0.9)) * 920.0)

            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = candleOpenMillis,
                timeframe = timeframe,
                open = open,
                high = high,
                low = low,
                close = close,
                volume = volume
            )?.let { candles.add(it) }

            runningClose = close
        }
        return candles
    }
}
