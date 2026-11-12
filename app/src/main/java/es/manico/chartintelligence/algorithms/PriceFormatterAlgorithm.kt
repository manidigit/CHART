package es.manico.chartintelligence.algorithms

import es.manico.chartintelligence.data.model.CandleBar
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Independent Algorithm Library Module:
 * Formats all market prices, OHLC numbers, and timestamps strictly in Latin digits (Locale.US)
 * so financial figures remain LTR-aligned even when the UI is in Persian (RTL).
 */
object PriceFormatterAlgorithm {

    private val shortAxisTimeFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("MM-dd HH:mm", Locale.US)

    private val dailyAxisTimeFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.US)

    fun resolveZoneId(timezoneMode: String): ZoneId {
        return if (timezoneMode.equals("LOCAL", ignoreCase = true)) {
            ZoneId.systemDefault()
        } else {
            ZoneOffset.UTC
        }
    }

    fun formatLiveClock(
        timezoneMode: String = "UTC",
        nowMillis: Long = System.currentTimeMillis()
    ): String {
        val isLocal = timezoneMode.equals("LOCAL", ignoreCase = true)
        val zone = resolveZoneId(timezoneMode)
        val zdt = Instant.ofEpochMilli(nowMillis).atZone(zone)
        val hms = DateTimeFormatter.ofPattern("HH:mm:ss", Locale.US).format(zdt)
        if (!isLocal) return "$hms UTC"
        val offsetId = zdt.offset.id.let { if (it == "Z") "+00:00" else it }
        return "$hms ($offsetId)"
    }

    fun formatPrice(value: BigDecimal?, decimals: Int): String {
        if (value == null) return "—"
        val scaled = value.setScale(decimals, RoundingMode.HALF_UP)
        return String.format(Locale.US, "%.${decimals}f", scaled)
    }

    fun formatSignedPercentChange(open: BigDecimal, close: BigDecimal): String {
        if (open.compareTo(BigDecimal.ZERO) == 0) return "0.00%"
        val pct = close.subtract(open)
            .divide(open, 6, RoundingMode.HALF_UP)
            .multiply(BigDecimal(100))
            .setScale(2, RoundingMode.HALF_UP)
        val sign = if (pct > BigDecimal.ZERO) "+" else ""
        return String.format(Locale.US, "%s%.2f%%", sign, pct)
    }

    fun formatSignedPriceDiff(open: BigDecimal, close: BigDecimal, decimals: Int): String {
        val diff = close.subtract(open).setScale(decimals, RoundingMode.HALF_UP)
        val sign = if (diff > BigDecimal.ZERO) "+" else ""
        return String.format(Locale.US, "%s%.${decimals}f", sign, diff)
    }

    fun formatCompactVolume(volume: BigDecimal?): String {
        if (volume == null) return "0"
        val v = volume.toDouble()
        if (v <= 0.0) return "0"
        return when {
            v >= 1_000_000_000.0 -> String.format(Locale.US, "%.2fB", v / 1_000_000_000.0)
            v >= 1_000_000.0 -> String.format(Locale.US, "%.2fM", v / 1_000_000.0)
            v >= 1_000.0 -> String.format(Locale.US, "%.1fK", v / 1_000.0)
            else -> String.format(Locale.US, "%.0f", v)
        }
    }

    fun displayTimeframeLabel(tf: String): String {
        return when (tf.uppercase(Locale.US)) {
            "M15" -> "15m"
            "M30" -> "30m"
            "H1" -> "1h"
            "H4" -> "4h"
            "D1" -> "1D"
            "W1" -> "1W"
            else -> tf
        }
    }

    fun computeSmaValues(closes: List<Double>, period: Int = 20): List<Double?> {
        if (closes.isEmpty() || period <= 1) return closes.map { it }
        val result = ArrayList<Double?>(closes.size)
        var rollingSum = 0.0
        for (i in closes.indices) {
            rollingSum += closes[i]
            if (i >= period) {
                rollingSum -= closes[i - period]
            }
            if (i >= period - 1) {
                result.add(rollingSum / period.toDouble())
            } else {
                result.add(null)
            }
        }
        return result
    }

    fun computeEmaValues(closes: List<Double>, period: Int = 50): List<Double?> {
        if (closes.isEmpty() || period <= 1) return closes.map { it }
        val result = ArrayList<Double?>(closes.size)
        val k = 2.0 / (period.toDouble() + 1.0)
        var ema: Double? = null
        var sum = 0.0
        for (i in closes.indices) {
            val c = closes[i]
            if (i < period - 1) {
                sum += c
                result.add(null)
            } else if (i == period - 1) {
                sum += c
                ema = sum / period.toDouble()
                result.add(ema)
            } else {
                val prev = ema ?: c
                ema = (c - prev) * k + prev
                result.add(ema)
            }
        }
        return result
    }

    data class BollingerPoint(
        val middle: Double,
        val upper: Double,
        val lower: Double
    )

    fun computeBollingerBands(
        closes: List<Double>,
        period: Int = 20,
        mult: Double = 2.0
    ): List<BollingerPoint?> {
        if (closes.isEmpty() || period <= 1) return closes.map { null }
        val result = ArrayList<BollingerPoint?>(closes.size)
        for (i in closes.indices) {
            if (i < period - 1) {
                result.add(null)
            } else {
                var sum = 0.0
                for (j in (i - period + 1)..i) {
                    sum += closes[j]
                }
                val mean = sum / period.toDouble()
                var sqSum = 0.0
                for (j in (i - period + 1)..i) {
                    val d = closes[j] - mean
                    sqSum += d * d
                }
                val std = kotlin.math.sqrt(sqSum / period.toDouble())
                result.add(
                    BollingerPoint(
                        middle = mean,
                        upper = mean + mult * std,
                        lower = mean - mult * std
                    )
                )
            }
        }
        return result
    }

    /**
     * Session-anchored VWAP (resets at UTC day rollover for intraday timeframes, or rolling 20-bar on D1/W1).
     */
    fun computeVwapValues(candles: List<CandleBar>): List<Double?> {
        if (candles.isEmpty()) return emptyList()
        val result = ArrayList<Double?>(candles.size)
        var cumPV = 0.0
        var cumV = 0.0
        var prevDayBucket = Long.MIN_VALUE
        for (c in candles) {
            val dayBucket = c.openTimeUtcMillis / 86_400_000L
            if (dayBucket != prevDayBucket) {
                cumPV = 0.0
                cumV = 0.0
                prevDayBucket = dayBucket
            }
            val typical = (c.high.toDouble() + c.low.toDouble() + c.close.toDouble()) / 3.0
            val vol = c.volume.toDouble().let { if (it > 0.0) it else 1.0 }
            cumPV += typical * vol
            cumV += vol
            result.add(if (cumV > 0.0) cumPV / cumV else typical)
        }
        return result
    }

    /**
     * Wilder's Average True Range (ATR 14).
     */
    fun computeAtrValues(candles: List<CandleBar>, period: Int = 14): List<Double?> {
        if (candles.isEmpty() || period < 1) return emptyList()
        val trs = DoubleArray(candles.size)
        for (i in candles.indices) {
            val h = candles[i].high.toDouble()
            val l = candles[i].low.toDouble()
            if (i == 0) {
                trs[i] = max(0.0, h - l)
            } else {
                val pc = candles[i - 1].close.toDouble()
                trs[i] = max(h - l, max(abs(h - pc), abs(l - pc)))
            }
        }
        val result = ArrayList<Double?>(candles.size)
        var sum = 0.0
        var atr = 0.0
        for (i in candles.indices) {
            if (i < period - 1) {
                sum += trs[i]
                result.add(null)
            } else if (i == period - 1) {
                sum += trs[i]
                atr = sum / period.toDouble()
                result.add(atr)
            } else {
                atr = (atr * (period - 1) + trs[i]) / period.toDouble()
                result.add(atr)
            }
        }
        return result
    }

    data class SupertrendPoint(
        val value: Double,
        val direction: Int // +1 Bullish, -1 Bearish
    )

    /**
     * Supertrend (Period = 10, Multiplier = 3.0).
     */
    fun computeSupertrendValues(
        candles: List<CandleBar>,
        period: Int = 10,
        mult: Double = 3.0
    ): List<SupertrendPoint?> {
        if (candles.isEmpty()) return emptyList()
        val atrList = computeAtrValues(candles, period)
        val result = ArrayList<SupertrendPoint?>(candles.size)
        var prevFinalUpper = 0.0
        var prevFinalLower = 0.0
        var prevDir = 1
        var initialized = false

        for (i in candles.indices) {
            val atr = atrList[i]
            if (atr == null) {
                result.add(null)
                continue
            }
            val h = candles[i].high.toDouble()
            val l = candles[i].low.toDouble()
            val c = candles[i].close.toDouble()
            val hl2 = (h + l) * 0.5
            val basicUpper = hl2 + mult * atr
            val basicLower = hl2 - mult * atr

            if (!initialized) {
                prevFinalUpper = basicUpper
                prevFinalLower = basicLower
                prevDir = if (c >= hl2) 1 else -1
                initialized = true
                result.add(SupertrendPoint(if (prevDir == 1) prevFinalLower else prevFinalUpper, prevDir))
                continue
            }

            val prevClose = candles[i - 1].close.toDouble()
            val finalUpper = if (basicUpper < prevFinalUpper || prevClose > prevFinalUpper) basicUpper else prevFinalUpper
            val finalLower = if (basicLower > prevFinalLower || prevClose < prevFinalLower) basicLower else prevFinalLower

            val dir = when {
                prevDir == -1 && c > finalUpper -> 1
                prevDir == 1 && c < finalLower -> -1
                else -> prevDir
            }
            val stVal = if (dir == 1) finalLower else finalUpper
            prevFinalUpper = finalUpper
            prevFinalLower = finalLower
            prevDir = dir
            result.add(SupertrendPoint(stVal, dir))
        }
        return result
    }

    /**
     * Wilder's Relative Strength Index (RSI 14).
     */
    fun computeRsiValues(closes: List<Double>, period: Int = 14): List<Double?> {
        if (closes.size <= period || period < 1) return closes.map { null }
        val result = ArrayList<Double?>(closes.size)
        result.add(null)
        var gainSum = 0.0
        var lossSum = 0.0
        var avgGain = 0.0
        var avgLoss = 0.0

        for (i in 1 until closes.size) {
            val diff = closes[i] - closes[i - 1]
            val gain = if (diff > 0.0) diff else 0.0
            val loss = if (diff < 0.0) -diff else 0.0

            if (i < period) {
                gainSum += gain
                lossSum += loss
                result.add(null)
            } else if (i == period) {
                gainSum += gain
                lossSum += loss
                avgGain = gainSum / period.toDouble()
                avgLoss = lossSum / period.toDouble()
                val rs = if (avgLoss == 0.0) 100.0 else avgGain / avgLoss
                val rsi = if (avgLoss == 0.0) 100.0 else 100.0 - (100.0 / (1.0 + rs))
                result.add(rsi.coerceIn(0.0, 100.0))
            } else {
                avgGain = (avgGain * (period - 1) + gain) / period.toDouble()
                avgLoss = (avgLoss * (period - 1) + loss) / period.toDouble()
                val rs = if (avgLoss == 0.0) 100.0 else avgGain / avgLoss
                val rsi = if (avgLoss == 0.0) 100.0 else 100.0 - (100.0 / (1.0 + rs))
                result.add(rsi.coerceIn(0.0, 100.0))
            }
        }
        return result
    }

    data class MacdPoint(
        val macd: Double,
        val signal: Double?,
        val histogram: Double?
    )

    /**
     * MACD (12, 26, 9) Oscillator.
     */
    fun computeMacdValues(
        closes: List<Double>,
        fastPeriod: Int = 12,
        slowPeriod: Int = 26,
        signalPeriod: Int = 9
    ): List<MacdPoint?> {
        if (closes.isEmpty()) return emptyList()
        val fastEma = computeEmaValues(closes, fastPeriod)
        val slowEma = computeEmaValues(closes, slowPeriod)
        val macdRaw = ArrayList<Double?>(closes.size)
        val validMacdValues = ArrayList<Double>()
        val validIndices = ArrayList<Int>()

        for (i in closes.indices) {
            val f = fastEma[i]
            val s = slowEma[i]
            if (f != null && s != null) {
                val m = f - s
                macdRaw.add(m)
                validMacdValues.add(m)
                validIndices.add(i)
            } else {
                macdRaw.add(null)
            }
        }

        val signalSeries = computeEmaValues(validMacdValues, signalPeriod)
        val signalByIndex = HashMap<Int, Double?>()
        for (k in validIndices.indices) {
            signalByIndex[validIndices[k]] = signalSeries.getOrNull(k)
        }

        val result = ArrayList<MacdPoint?>(closes.size)
        for (i in closes.indices) {
            val m = macdRaw[i]
            if (m == null) {
                result.add(null)
            } else {
                val sig = signalByIndex[i]
                val hist = if (sig != null) m - sig else null
                result.add(MacdPoint(macd = m, signal = sig, histogram = hist))
            }
        }
        return result
    }

    data class SmcStructureBreak(
        val type: String, // "BOS" or "CHoCH"
        val direction: Int, // +1 Bullish, -1 Bearish
        val startIndex: Int,
        val breakIndex: Int,
        val price: Double
    )

    data class SmcEqualLevel(
        val type: String, // "EQH" or "EQL"
        val direction: Int, // -1 EQH resistance, +1 EQL support
        val startIndex: Int,
        val endIndex: Int,
        val price: Double
    )

    data class SmcFvgZone(
        val direction: Int, // +1 Bullish FVG, -1 Bearish FVG
        val startIndex: Int,
        val endIndex: Int,
        val top: Double,
        val bottom: Double
    )

    data class SmcAnalysisResult(
        val structures: List<SmcStructureBreak>,
        val equalLevels: List<SmcEqualLevel>,
        val fvgs: List<SmcFvgZone>
    )

    /**
     * Package 3 Smart Money Concepts (SMC) & Market Structure Detector:
     * Detects BOS / CHoCH, Equal Highs / Equal Lows (EQH / EQL), and 3-Candle Fair Value Gaps (FVG).
     */
    fun detectSmcMarketStructures(
        candles: List<CandleBar>,
        swingLen: Int = 3
    ): SmcAnalysisResult {
        if (candles.size < swingLen * 2 + 3) {
            return SmcAnalysisResult(emptyList(), emptyList(), emptyList())
        }

        val structures = ArrayList<SmcStructureBreak>()
        val equalLevels = ArrayList<SmcEqualLevel>()
        val fvgs = ArrayList<SmcFvgZone>()

        // 1. Detect 3-Candle Fair Value Gaps (FVG / Imbalance)
        for (i in 2 until candles.size) {
            val c0 = candles[i - 2]
            val c1 = candles[i - 1]
            val c2 = candles[i]
            val h0 = c0.high.toDouble()
            val l0 = c0.low.toDouble()
            val h2 = c2.high.toDouble()
            val l2 = c2.low.toDouble()
            val body1 = abs(c1.close.toDouble() - c1.open.toDouble())
            val minThreshold = max(1e-6, c1.close.toDouble() * 0.00025)

            // Bullish FVG: candle[i].low > candle[i-2].high
            if (l2 > h0 && (l2 - h0) >= minThreshold && body1 > (l2 - h0) * 0.35) {
                var endIdx = min(candles.lastIndex, i + 18)
                for (k in (i + 1) until min(candles.size, i + 30)) {
                    if (candles[k].low.toDouble() <= h0) {
                        endIdx = k
                        break
                    }
                }
                fvgs.add(SmcFvgZone(direction = 1, startIndex = i - 2, endIndex = endIdx, top = l2, bottom = h0))
            }
            // Bearish FVG: candle[i].high < candle[i-2].low
            else if (h2 < l0 && (l0 - h2) >= minThreshold && body1 > (l0 - h2) * 0.35) {
                var endIdx = min(candles.lastIndex, i + 18)
                for (k in (i + 1) until min(candles.size, i + 30)) {
                    if (candles[k].high.toDouble() >= l0) {
                        endIdx = k
                        break
                    }
                }
                fvgs.add(SmcFvgZone(direction = -1, startIndex = i - 2, endIndex = endIdx, top = l0, bottom = h2))
            }
        }

        // 2. Detect Swing Highs & Swing Lows
        data class SwingPoint(val index: Int, val price: Double)
        val swingHighs = ArrayList<SwingPoint>()
        val swingLows = ArrayList<SwingPoint>()

        for (i in swingLen until (candles.size - swingLen)) {
            val hi = candles[i].high.toDouble()
            val lo = candles[i].low.toDouble()
            var isHigh = true
            var isLow = true
            for (k in (i - swingLen)..(i + swingLen)) {
                if (k == i) continue
                if (candles[k].high.toDouble() >= hi) isHigh = false
                if (candles[k].low.toDouble() <= lo) isLow = false
            }
            if (isHigh) swingHighs.add(SwingPoint(i, hi))
            if (isLow) swingLows.add(SwingPoint(i, lo))
        }

        // 3. Equal Highs (EQH) & Equal Lows (EQL)
        for (idx in 1 until swingHighs.size) {
            val prev = swingHighs[idx - 1]
            val cur = swingHighs[idx]
            val tol = max(1e-5, prev.price * 0.0012)
            if (abs(cur.price - prev.price) <= tol && (cur.index - prev.index) in 3..45) {
                equalLevels.add(
                    SmcEqualLevel(
                        type = "EQH",
                        direction = -1,
                        startIndex = prev.index,
                        endIndex = cur.index,
                        price = (prev.price + cur.price) * 0.5
                    )
                )
            }
        }
        for (idx in 1 until swingLows.size) {
            val prev = swingLows[idx - 1]
            val cur = swingLows[idx]
            val tol = max(1e-5, prev.price * 0.0012)
            if (abs(cur.price - prev.price) <= tol && (cur.index - prev.index) in 3..45) {
                equalLevels.add(
                    SmcEqualLevel(
                        type = "EQL",
                        direction = 1,
                        startIndex = prev.index,
                        endIndex = cur.index,
                        price = (prev.price + cur.price) * 0.5
                    )
                )
            }
        }

        // 4. BOS & CHoCH Breaks
        var lastSwingHigh: SwingPoint? = null
        var lastSwingLow: SwingPoint? = null
        var brokenHighIdx = -1
        var brokenLowIdx = -1
        var trendBias = 0 // +1 Bullish, -1 Bearish

        val highByConfirmIdx = swingHighs.associateBy { it.index + swingLen }
        val lowByConfirmIdx = swingLows.associateBy { it.index + swingLen }

        for (i in swingLen until candles.size) {
            highByConfirmIdx[i]?.let { lastSwingHigh = it }
            lowByConfirmIdx[i]?.let { lastSwingLow = it }

            val close = candles[i].close.toDouble()
            val sh = lastSwingHigh
            if (sh != null && brokenHighIdx != sh.index && close > sh.price && (i - sh.index) <= 60) {
                val label = if (trendBias == -1) "CHoCH" else "BOS"
                structures.add(
                    SmcStructureBreak(
                        type = label,
                        direction = 1,
                        startIndex = sh.index,
                        breakIndex = i,
                        price = sh.price
                    )
                )
                brokenHighIdx = sh.index
                trendBias = 1
            }

            val sl = lastSwingLow
            if (sl != null && brokenLowIdx != sl.index && close < sl.price && (i - sl.index) <= 60) {
                val label = if (trendBias == 1) "CHoCH" else "BOS"
                structures.add(
                    SmcStructureBreak(
                        type = label,
                        direction = -1,
                        startIndex = sl.index,
                        breakIndex = i,
                        price = sl.price
                    )
                )
                brokenLowIdx = sl.index
                trendBias = -1
            }
        }

        return SmcAnalysisResult(
            structures = structures.takeLast(14),
            equalLevels = equalLevels.takeLast(8),
            fvgs = fvgs.takeLast(10)
        )
    }

    data class VolumeProfileBin(
        val low: Double,
        val high: Double,
        val mid: Double,
        val bullVol: Double,
        val bearVol: Double,
        val totalVol: Double,
        val normWidth: Float,
        val inValueArea: Boolean,
        val isPoc: Boolean
    )

    data class VolumeProfileResult(
        val bins: List<VolumeProfileBin>,
        val pocPrice: Double,
        val vahPrice: Double,
        val valPrice: Double
    )

    /**
     * Package 3 Session / Visible Range Volume Profile (VRVP):
     * Computes 24 horizontal price bins, Point of Control (POC), Value Area High (VAH), and Value Area Low (VAL — 70%).
     */
    fun computeVolumeProfile(
        candles: List<CandleBar>,
        numBins: Int = 24,
        valueAreaRatio: Double = 0.70
    ): VolumeProfileResult? {
        if (candles.size < 2 || numBins < 4) return null
        val minLow = candles.minOfOrNull { it.low.toDouble() } ?: return null
        val maxHigh = candles.maxOfOrNull { it.high.toDouble() } ?: return null
        val span = maxHigh - minLow
        if (!span.isFinite() || span <= 0.0) return null

        val binStep = span / numBins.toDouble()
        val bullArr = DoubleArray(numBins)
        val bearArr = DoubleArray(numBins)
        val totalArr = DoubleArray(numBins)

        for (c in candles) {
            val typical = (c.high.toDouble() + c.low.toDouble() + c.close.toDouble()) / 3.0
            val rawVol = c.volume.toDouble().let { if (it > 0.0) it else 1.0 }
            val idx = ((typical - minLow) / binStep).toInt().coerceIn(0, numBins - 1)
            if (c.isBullish) {
                bullArr[idx] += rawVol
            } else {
                bearArr[idx] += rawVol
            }
            totalArr[idx] += rawVol
        }

        var pocIdx = 0
        var maxBinVol = 0.0
        var totalSumVol = 0.0
        for (i in 0 until numBins) {
            totalSumVol += totalArr[i]
            if (totalArr[i] > maxBinVol) {
                maxBinVol = totalArr[i]
                pocIdx = i
            }
        }
        if (maxBinVol <= 0.0 || totalSumVol <= 0.0) return null

        val targetVaVol = totalSumVol * valueAreaRatio
        var accumVol = totalArr[pocIdx]
        var vaLowIdx = pocIdx
        var vaHighIdx = pocIdx

        while (accumVol < targetVaVol && (vaLowIdx > 0 || vaHighIdx < numBins - 1)) {
            val nextUpVol = if (vaHighIdx < numBins - 1) totalArr[vaHighIdx + 1] else -1.0
            val nextDownVol = if (vaLowIdx > 0) totalArr[vaLowIdx - 1] else -1.0
            if (nextUpVol >= nextDownVol) {
                vaHighIdx++
                accumVol += totalArr[vaHighIdx]
            } else {
                vaLowIdx--
                accumVol += totalArr[vaLowIdx]
            }
        }

        val bins = (0 until numBins).map { i ->
            val bLow = minLow + i * binStep
            val bHigh = bLow + binStep
            VolumeProfileBin(
                low = bLow,
                high = bHigh,
                mid = (bLow + bHigh) * 0.5,
                bullVol = bullArr[i],
                bearVol = bearArr[i],
                totalVol = totalArr[i],
                normWidth = (totalArr[i] / maxBinVol).toFloat().coerceIn(0f, 1f),
                inValueArea = i in vaLowIdx..vaHighIdx,
                isPoc = i == pocIdx
            )
        }

        return VolumeProfileResult(
            bins = bins,
            pocPrice = bins[pocIdx].mid,
            vahPrice = bins[vaHighIdx].high,
            valPrice = bins[vaLowIdx].low
        )
    }

    private val m15H1AxisTimeFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("dd MMM HH:mm", Locale.US)

    private val h4AxisTimeFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("dd MMM HH:00", Locale.US)

    private val d1W1AxisTimeFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.US)

    private val hourOnlyFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("HH:mm", Locale.US)

    private val dayMonthFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("dd MMM", Locale.US)

    private val monthOnlyFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("MMM", Locale.US)

    private val monthYearFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("MMM yyyy", Locale.US)

    private val yearOnlyFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy", Locale.US)

    fun computeNiceAxisBounds(rawLow: Double, rawHigh: Double, intervals: Int = 4): Pair<Double, Double> {
        if (!rawLow.isFinite() || !rawHigh.isFinite() || rawHigh <= rawLow) {
            return Pair(rawLow, rawLow + 1.0)
        }
        val span = (rawHigh - rawLow).coerceAtLeast(1e-5)
        val roughStep = span / intervals.coerceAtLeast(2).toDouble()
        val mag = kotlin.math.floor(kotlin.math.log10(roughStep))
        val magPow = Math.pow(10.0, mag)
        val residual = roughStep / magPow
        val niceFraction = when {
            residual <= 1.2 -> 1.0
            residual <= 2.2 -> 2.0
            residual <= 3.0 -> 2.5
            residual <= 6.0 -> 5.0
            else -> 10.0
        }
        val niceStep = niceFraction * magPow
        val niceMin = kotlin.math.floor(rawLow / niceStep) * niceStep
        val niceMax = kotlin.math.ceil(rawHigh / niceStep) * niceStep
        return if (niceMax > niceMin) Pair(niceMin, niceMax) else Pair(rawLow, rawHigh)
    }

    /**
     * Generates institutional round price ticks (Heckbert nice numbers: 1, 2, 2.5, 5, 10 × 10^k)
     * strictly inside [minPrice..maxPrice] so the right Y-axis never shows awkward fractional numbers.
     */
    fun computeNicePriceTicks(minPrice: Double, maxPrice: Double, targetTicks: Int = 5): List<Double> {
        val span = maxPrice - minPrice
        if (!span.isFinite() || span <= 0.0) return listOf(minPrice)
        val rawStep = span / (targetTicks - 1).coerceAtLeast(2).toDouble()
        val mag = Math.pow(10.0, kotlin.math.floor(kotlin.math.log10(rawStep)))
        val norm = rawStep / mag
        val niceNorm = when {
            norm < 1.3 -> 1.0
            norm < 2.2 -> 2.0
            norm < 3.5 -> 2.5
            norm < 7.0 -> 5.0
            else -> 10.0
        }
        val step = niceNorm * mag
        val firstTick = kotlin.math.ceil(minPrice / step) * step
        val ticks = ArrayList<Double>()
        var v = firstTick
        var guard = 0
        while (v <= maxPrice + step * 0.001 && guard < 20) {
            if (v >= minPrice - step * 0.001 && v <= maxPrice + step * 0.001) {
                ticks.add(v)
            }
            v += step
            guard++
        }
        return if (ticks.size >= 2) ticks else listOf(minPrice, (minPrice + maxPrice) * 0.5, maxPrice)
    }

    data class SmartTimeTick(
        val index: Int,
        val label: String,
        val isMajor: Boolean
    )

    /**
     * Computes TradingView-standard span-aware X-axis labels:
     * - Visible span <= 2.2 days & intraday timeframe: shows HH:mm (or dd MMM on day rollover)
     * - Visible span <= 45 days: shows dd MMM (or MMM on month rollover)
     * - Visible span <= 540 days: shows dd MMM / MMM / yyyy on year rollover
     * - Multi-year span (> 540 days): shows MMM yyyy / yyyy
     */
    fun computeSmartTimeAxisTicks(
        timestampsMillis: List<Long>,
        timeframe: String,
        maxTicks: Int = 4,
        timezoneMode: String = "UTC"
    ): List<SmartTimeTick> {
        val n = timestampsMillis.size
        if (n == 0) return emptyList()
        val firstTs = timestampsMillis.first()
        val lastTs = timestampsMillis.last()
        val spanDays = kotlin.math.max(0.0, (lastTs - firstTs).toDouble() / 86_400_000.0)
        val tfUpper = timeframe.uppercase(Locale.US)
        val isDailyOrHigher = tfUpper == "D1" || tfUpper == "W1"
        val zone = resolveZoneId(timezoneMode)

        val step = kotlin.math.max(1, kotlin.math.floor(n.toDouble() / maxTicks.coerceAtLeast(2).toDouble()).toInt())
        val result = ArrayList<SmartTimeTick>()
        var prevYear = -1
        var prevMonth = -1
        var prevDay = -1

        var i = 0
        while (i < n) {
            val ts = timestampsMillis[i]
            val zdt = Instant.ofEpochMilli(ts).atZone(zone)
            val yr = zdt.year
            val mo = zdt.monthValue
            val dy = zdt.dayOfMonth

            val label: String
            val isMajor: Boolean

            if (!isDailyOrHigher && spanDays <= 2.2) {
                if (dy != prevDay) {
                    label = dayMonthFormatter.format(zdt)
                    isMajor = true
                } else {
                    label = hourOnlyFormatter.format(zdt)
                    isMajor = false
                }
            } else if (!isDailyOrHigher && spanDays <= 16.0) {
                if (dy != prevDay) {
                    label = dayMonthFormatter.format(zdt)
                    isMajor = true
                } else {
                    label = hourOnlyFormatter.format(zdt)
                    isMajor = false
                }
            } else if (spanDays <= 180.0) {
                if (yr != prevYear && prevYear != -1) {
                    label = yearOnlyFormatter.format(zdt)
                    isMajor = true
                } else if (mo != prevMonth) {
                    label = if (spanDays > 75.0) monthOnlyFormatter.format(zdt) else dayMonthFormatter.format(zdt)
                    isMajor = true
                } else {
                    label = dayMonthFormatter.format(zdt)
                    isMajor = false
                }
            } else if (spanDays <= 730.0) {
                if (yr != prevYear) {
                    label = yearOnlyFormatter.format(zdt)
                    isMajor = true
                } else if (mo != prevMonth) {
                    label = monthOnlyFormatter.format(zdt)
                    isMajor = true
                } else {
                    label = dayMonthFormatter.format(zdt)
                    isMajor = false
                }
            } else {
                if (yr != prevYear) {
                    label = yearOnlyFormatter.format(zdt)
                    isMajor = true
                } else {
                    label = monthYearFormatter.format(zdt)
                    isMajor = false
                }
            }

            prevYear = yr
            prevMonth = mo
            prevDay = dy
            result.add(SmartTimeTick(index = i, label = label, isMajor = isMajor))
            i += step
        }
        return result
    }

    fun formatAxisTimestamp(
        epochMillis: Long,
        timeframe: String,
        timezoneMode: String = "UTC"
    ): String {
        val zdt = Instant.ofEpochMilli(epochMillis).atZone(resolveZoneId(timezoneMode))
        return when (timeframe.uppercase(Locale.US)) {
            "D1", "W1" -> d1W1AxisTimeFormatter.format(zdt)
            "H4" -> h4AxisTimeFormatter.format(zdt)
            else -> m15H1AxisTimeFormatter.format(zdt)
        }
    }
}
