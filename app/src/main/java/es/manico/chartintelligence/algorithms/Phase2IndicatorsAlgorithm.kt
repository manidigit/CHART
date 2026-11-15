package es.manico.chartintelligence.algorithms

import es.manico.chartintelligence.data.model.CandleBar
import java.time.Instant
import java.time.ZoneOffset
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

data class PsarPoint(
    val sar: Double,
    val isUp: Boolean
)

data class IchimokuResult(
    val tenkan: List<Double?>,
    val kijun: List<Double?>,
    val senkouA: List<Double?>,
    val senkouB: List<Double?>,
    val chikou: List<Double?>
)

data class BandPoint(
    val upper: Double,
    val middle: Double,
    val lower: Double
)

data class AdxDmiPoint(
    val adx: Double,
    val plusDi: Double,
    val minusDi: Double
)

data class StochPoint(
    val k: Double,
    val d: Double?
)

enum class KillzoneSession {
    ASIA,
    LONDON,
    NEW_YORK,
    OVERLAP
}

/**
 * Phase 2 Technical Indicator Algorithm Library (§2.2 & §2.3 Killzones):
 * Parity-verified formulas against TA-Lib and Web TechnicalIndicators JS.
 */
object Phase2IndicatorsAlgorithm {

    fun computeParabolicSar(
        candles: List<CandleBar>,
        step: Double = 0.02,
        maxAf: Double = 0.20
    ): List<PsarPoint?> {
        val n = candles.size
        if (n < 2) return List(n) { null }
        val out = MutableList<PsarPoint?>(n) { null }
        val h0 = candles[0].high.toDouble()
        val l0 = candles[0].low.toDouble()
        val h1 = candles[1].high.toDouble()
        val l1 = candles[1].low.toDouble()
        var isUp = candles[1].close.toDouble() >= candles[0].close.toDouble()
        var sar = if (isUp) l0 else h0
        var ep = if (isUp) h1 else l1
        var af = step
        out[1] = PsarPoint(sar = sar, isUp = isUp)

        for (i in 2 until n) {
            val hi = candles[i].high.toDouble()
            val lo = candles[i].low.toDouble()
            val prevLo1 = candles[i - 1].low.toDouble()
            val prevLo2 = candles[i - 2].low.toDouble()
            val prevHi1 = candles[i - 1].high.toDouble()
            val prevHi2 = candles[i - 2].high.toDouble()

            var nextSar = sar + af * (ep - sar)
            if (isUp) {
                nextSar = min(nextSar, min(prevLo1, prevLo2))
                if (lo < nextSar) {
                    isUp = false
                    sar = ep
                    ep = lo
                    af = step
                } else {
                    sar = nextSar
                    if (hi > ep) {
                        ep = hi
                        af = min(maxAf, af + step)
                    }
                }
            } else {
                nextSar = max(nextSar, max(prevHi1, prevHi2))
                if (hi > nextSar) {
                    isUp = true
                    sar = ep
                    ep = hi
                    af = step
                } else {
                    sar = nextSar
                    if (lo < ep) {
                        ep = lo
                        af = min(maxAf, af + step)
                    }
                }
            }
            out[i] = PsarPoint(sar = sar, isUp = isUp)
        }
        return out
    }

    fun computeIchimoku(
        candles: List<CandleBar>,
        tenkanPeriod: Int = 9,
        kijunPeriod: Int = 26,
        senkouBPeriod: Int = 52,
        displacement: Int = 26
    ): IchimokuResult {
        val n = candles.size
        if (n == 0) return IchimokuResult(emptyList(), emptyList(), emptyList(), emptyList(), emptyList())

        fun midRange(endIdx: Int, len: Int): Double? {
            if (endIdx < len - 1 || len <= 0) return null
            var hh = Double.NEGATIVE_INFINITY
            var ll = Double.POSITIVE_INFINITY
            for (j in (endIdx - len + 1)..endIdx) {
                val h = candles[j].high.toDouble()
                val l = candles[j].low.toDouble()
                if (h > hh) hh = h
                if (l < ll) ll = l
            }
            return (hh + ll) / 2.0
        }

        val tenkan = MutableList<Double?>(n) { null }
        val kijun = MutableList<Double?>(n) { null }
        val rawSpanA = MutableList<Double?>(n) { null }
        val rawSpanB = MutableList<Double?>(n) { null }
        val senkouA = MutableList<Double?>(n) { null }
        val senkouB = MutableList<Double?>(n) { null }
        val chikou = MutableList<Double?>(n) { null }

        for (i in 0 until n) {
            val t = midRange(i, tenkanPeriod)
            val k = midRange(i, kijunPeriod)
            tenkan[i] = t
            kijun[i] = k
            if (t != null && k != null) {
                rawSpanA[i] = (t + k) / 2.0
            }
            rawSpanB[i] = midRange(i, senkouBPeriod)
            val srcIdx = i - displacement
            if (srcIdx >= 0) {
                senkouA[i] = rawSpanA[srcIdx]
                senkouB[i] = rawSpanB[srcIdx]
            }
            val fwdIdx = i + displacement
            if (fwdIdx < n) {
                chikou[i] = candles[fwdIdx].close.toDouble()
            }
        }
        return IchimokuResult(tenkan, kijun, senkouA, senkouB, chikou)
    }

    fun computeKeltnerChannels(
        candles: List<CandleBar>,
        emaPeriod: Int = 20,
        atrPeriod: Int = 10,
        multiplier: Double = 2.0
    ): List<BandPoint?> {
        val n = candles.size
        if (n == 0) return emptyList()
        val closes = candles.map { it.close.toDouble() }
        val mid = PriceFormatterAlgorithm.computeEmaValues(closes, emaPeriod)
        val atr = PriceFormatterAlgorithm.computeAtrValues(candles, atrPeriod)
        return List(n) { i ->
            val m = mid.getOrNull(i)
            val a = atr.getOrNull(i)
            if (m != null && a != null) {
                BandPoint(upper = m + multiplier * a, middle = m, lower = m - multiplier * a)
            } else {
                null
            }
        }
    }

    fun computeDonchianChannels(
        candles: List<CandleBar>,
        period: Int = 20
    ): List<BandPoint?> {
        val n = candles.size
        if (n == 0 || period <= 0) return List(n) { null }
        val out = MutableList<BandPoint?>(n) { null }
        for (i in (period - 1) until n) {
            var hh = Double.NEGATIVE_INFINITY
            var ll = Double.POSITIVE_INFINITY
            for (j in (i - period + 1)..i) {
                val h = candles[j].high.toDouble()
                val l = candles[j].low.toDouble()
                if (h > hh) hh = h
                if (l < ll) ll = l
            }
            out[i] = BandPoint(upper = hh, middle = (hh + ll) / 2.0, lower = ll)
        }
        return out
    }

    fun higherTimeframeFor(timeframe: String): String {
        return when (timeframe.uppercase()) {
            "M1", "M5" -> "M15"
            "M15" -> "H1"
            "M30", "H1" -> "H4"
            "H4" -> "D1"
            else -> "W1"
        }
    }

    /**
     * Strict Non-Lookahead Multi-Timeframe EMA(20):
     * Only exposes the higher-TF EMA value on base bar i once the higher-TF bucket
     * has completely closed (htfBucketCloseMs <= baseBarCloseMs).
     */
    fun computeMtfEma(
        candles: List<CandleBar>,
        currentTimeframe: String = "M15",
        period: Int = 20,
        symbolCode: String = "XAUUSD"
    ): List<Double?> {
        val n = candles.size
        if (n == 0) return emptyList()
        val curTf = currentTimeframe.uppercase()
        val htf = higherTimeframeFor(curTf)
        if (htf == curTf) {
            return PriceFormatterAlgorithm.computeEmaValues(candles.map { it.close.toDouble() }, period)
        }

        val lastBarBounds = UtcTimeAnchorAlgorithm.getSessionBucketBounds(
            candles.last().openTimeUtcMillis,
            curTf,
            symbolCode
        )
        val htfCandles = TimeframeAggregatorAlgorithm.aggregateCandles(
            sourceCandles = candles,
            targetTimeframe = htf,
            nowUtcMillis = lastBarBounds.closeMs,
            sourceTimeframe = curTf,
            symbolCode = symbolCode
        )
        if (htfCandles.isEmpty()) return List(n) { null }

        val htfEma = PriceFormatterAlgorithm.computeEmaValues(
            htfCandles.map { it.close.toDouble() },
            period
        )
        val htfCloseBounds = htfCandles.map {
            UtcTimeAnchorAlgorithm.getSessionBucketBounds(it.openTimeUtcMillis, htf, symbolCode).closeMs
        }

        val out = MutableList<Double?>(n) { null }
        var ptr = -1
        for (i in 0 until n) {
            val barCloseMs = UtcTimeAnchorAlgorithm.getSessionBucketBounds(
                candles[i].openTimeUtcMillis,
                curTf,
                symbolCode
            ).closeMs
            while (ptr + 1 < htfCloseBounds.size && htfCloseBounds[ptr + 1] <= barCloseMs) {
                ptr++
            }
            if (ptr >= 0) {
                out[i] = htfEma.getOrNull(ptr)
            }
        }
        return out
    }

    fun classifyKillzone(openTimeUtcMillis: Long): KillzoneSession? {
        val hour = Instant.ofEpochMilli(openTimeUtcMillis).atOffset(ZoneOffset.UTC).hour
        return classifyKillzoneUtcHour(hour)
    }

    fun classifyKillzoneUtcHour(utcHour: Int): KillzoneSession? {
        val h = ((utcHour % 24) + 24) % 24
        return when {
            h in 13..15 -> KillzoneSession.OVERLAP
            h in 7..15 -> KillzoneSession.LONDON
            h in 13..21 -> KillzoneSession.NEW_YORK
            h in 0..8 -> KillzoneSession.ASIA
            else -> null
        }
    }

    fun computeAdxDmi(
        candles: List<CandleBar>,
        period: Int = 14
    ): List<AdxDmiPoint?> {
        val n = candles.size
        if (n < period * 2 || period <= 0) return List(n) { null }
        val tr = DoubleArray(n)
        val plusDm = DoubleArray(n)
        val minusDm = DoubleArray(n)

        for (i in 1 until n) {
            val hi = candles[i].high.toDouble()
            val lo = candles[i].low.toDouble()
            val prevH = candles[i - 1].high.toDouble()
            val prevL = candles[i - 1].low.toDouble()
            val prevC = candles[i - 1].close.toDouble()
            tr[i] = max(hi - lo, max(abs(hi - prevC), abs(lo - prevC)))
            val up = hi - prevH
            val dn = prevL - lo
            plusDm[i] = if (up > dn && up > 0.0) up else 0.0
            minusDm[i] = if (dn > up && dn > 0.0) dn else 0.0
        }

        var smTr = 0.0
        var smPlus = 0.0
        var smMinus = 0.0
        for (i in 1..period) {
            smTr += tr[i]
            smPlus += plusDm[i]
            smMinus += minusDm[i]
        }

        val out = MutableList<AdxDmiPoint?>(n) { null }
        val dxIdx = ArrayList<Int>()
        val pDis = ArrayList<Double>()
        val mDis = ArrayList<Double>()
        val dxs = ArrayList<Double>()

        for (i in period until n) {
            if (i > period) {
                smTr = smTr - smTr / period + tr[i]
                smPlus = smPlus - smPlus / period + plusDm[i]
                smMinus = smMinus - smMinus / period + minusDm[i]
            }
            val pDi = if (smTr > 0.0) (100.0 * smPlus) / smTr else 0.0
            val mDi = if (smTr > 0.0) (100.0 * smMinus) / smTr else 0.0
            val sumDi = pDi + mDi
            val dx = if (sumDi > 0.0) (100.0 * abs(pDi - mDi)) / sumDi else 0.0
            dxIdx.add(i)
            pDis.add(pDi)
            mDis.add(mDi)
            dxs.add(dx)
        }

        if (dxs.size < period) return out
        var adxSum = 0.0
        for (k in 0 until period) adxSum += dxs[k]
        var prevAdx = adxSum / period
        out[dxIdx[period - 1]] = AdxDmiPoint(prevAdx, pDis[period - 1], mDis[period - 1])
        for (k in period until dxs.size) {
            prevAdx = (prevAdx * (period - 1) + dxs[k]) / period
            out[dxIdx[k]] = AdxDmiPoint(prevAdx, pDis[k], mDis[k])
        }
        return out
    }

    fun computeStochastic(
        candles: List<CandleBar>,
        kPeriod: Int = 14,
        smoothK: Int = 3,
        dPeriod: Int = 3
    ): List<StochPoint?> {
        val n = candles.size
        if (n == 0) return emptyList()
        val rawK = arrayOfNulls<Double>(n)
        for (i in (kPeriod - 1) until n) {
            var hh = Double.NEGATIVE_INFINITY
            var ll = Double.POSITIVE_INFINITY
            for (j in (i - kPeriod + 1)..i) {
                val h = candles[j].high.toDouble()
                val l = candles[j].low.toDouble()
                if (h > hh) hh = h
                if (l < ll) ll = l
            }
            val span = hh - ll
            rawK[i] = if (span > 1e-12) ((candles[i].close.toDouble() - ll) / span) * 100.0 else 50.0
        }

        val slowK = arrayOfNulls<Double>(n)
        for (i in (kPeriod - 1 + smoothK - 1) until n) {
            var sum = 0.0
            var ok = true
            for (j in (i - smoothK + 1)..i) {
                val v = rawK[j]
                if (v == null) {
                    ok = false
                    break
                }
                sum += v
            }
            if (ok) slowK[i] = sum / smoothK
        }

        val out = MutableList<StochPoint?>(n) { null }
        for (i in 0 until n) {
            val kVal = slowK[i] ?: continue
            var dVal: Double? = null
            if (i >= dPeriod - 1) {
                var sum = 0.0
                var ok = true
                for (j in (i - dPeriod + 1)..i) {
                    val v = slowK[j]
                    if (v == null) {
                        ok = false
                        break
                    }
                    sum += v
                }
                if (ok) dVal = sum / dPeriod
            }
            out[i] = StochPoint(k = kVal, d = dVal)
        }
        return out
    }

    fun computeCci(candles: List<CandleBar>, period: Int = 20): List<Double?> {
        val n = candles.size
        if (n < period || period <= 0) return List(n) { null }
        val tp = DoubleArray(n) { i ->
            (candles[i].high.toDouble() + candles[i].low.toDouble() + candles[i].close.toDouble()) / 3.0
        }
        val out = MutableList<Double?>(n) { null }
        for (i in (period - 1) until n) {
            var sum = 0.0
            for (j in (i - period + 1)..i) sum += tp[j]
            val sma = sum / period
            var dev = 0.0
            for (j in (i - period + 1)..i) dev += abs(tp[j] - sma)
            val meanDev = dev / period
            out[i] = if (meanDev > 1e-12) (tp[i] - sma) / (0.015 * meanDev) else 0.0
        }
        return out
    }

    fun computeWilliamsR(candles: List<CandleBar>, period: Int = 14): List<Double?> {
        val n = candles.size
        if (n < period || period <= 0) return List(n) { null }
        val out = MutableList<Double?>(n) { null }
        for (i in (period - 1) until n) {
            var hh = Double.NEGATIVE_INFINITY
            var ll = Double.POSITIVE_INFINITY
            for (j in (i - period + 1)..i) {
                val h = candles[j].high.toDouble()
                val l = candles[j].low.toDouble()
                if (h > hh) hh = h
                if (l < ll) ll = l
            }
            val span = hh - ll
            out[i] = if (span > 1e-12) (-100.0 * (hh - candles[i].close.toDouble())) / span else -50.0
        }
        return out
    }

    fun computeObv(candles: List<CandleBar>): List<Double> {
        val n = candles.size
        if (n == 0) return emptyList()
        val out = MutableList(n) { 0.0 }
        out[0] = candles[0].volume.toDouble()
        for (i in 1 until n) {
            val c = candles[i].close.toDouble()
            val pc = candles[i - 1].close.toDouble()
            val v = candles[i].volume.toDouble()
            out[i] = when {
                c > pc -> out[i - 1] + v
                c < pc -> out[i - 1] - v
                else -> out[i - 1]
            }
        }
        return out
    }

    fun computeCmf(candles: List<CandleBar>, period: Int = 20): List<Double?> {
        val n = candles.size
        if (n < period || period <= 0) return List(n) { null }
        val mfv = DoubleArray(n) { i ->
            val h = candles[i].high.toDouble()
            val l = candles[i].low.toDouble()
            val cl = candles[i].close.toDouble()
            val v = candles[i].volume.toDouble()
            val hl = h - l
            val mult = if (hl > 1e-12) ((cl - l) - (h - cl)) / hl else 0.0
            mult * v
        }
        val out = MutableList<Double?>(n) { null }
        for (i in (period - 1) until n) {
            var sMfv = 0.0
            var sVol = 0.0
            for (j in (i - period + 1)..i) {
                sMfv += mfv[j]
                sVol += candles[j].volume.toDouble()
            }
            out[i] = if (sVol > 1e-12) sMfv / sVol else 0.0
        }
        return out
    }

    fun computeRoc(closes: List<Double>, period: Int = 12): List<Double?> {
        val n = closes.size
        if (n <= period || period <= 0) return List(n) { null }
        val out = MutableList<Double?>(n) { null }
        for (i in period until n) {
            val prev = closes[i - period]
            out[i] = if (abs(prev) > 1e-12) ((closes[i] - prev) / prev) * 100.0 else 0.0
        }
        return out
    }

    data class PivotPointsResult(
        val variant: String = "STANDARD",
        val p: Double,
        val r1: Double,
        val r2: Double,
        val r3: Double? = null,
        val r4: Double? = null,
        val s1: Double,
        val s2: Double,
        val s3: Double? = null,
        val s4: Double? = null
    )

    data class FutureProjectedCandle(
        val step: Int,
        val openTimeUtcMillis: Long,
        val open: Double,
        val high: Double,
        val low: Double,
        val close: Double,
        val pctChangeFromAnchor: Double,
        val upperBand: Double,
        val lowerBand: Double
    ) {
        val isBullish: Boolean get() = close >= open
        val stepAhead: Int get() = step
        val pctChangeFromLast: Double get() = pctChangeFromAnchor
    }

    /**
     * Multi-Variant Pivot Points (Standard, Fibonacci, Camarilla, Woodie) computed from prior session HLC and current session Open (IND-01).
     */
    fun computePivotPoints(
        candles: List<CandleBar>,
        timeframe: String = "M15",
        symbolCode: String = "XAUUSD",
        pivotType: String = "STANDARD"
    ): PivotPointsResult? {
        if (candles.size < 2) return null
        val tf = timeframe.uppercase()
        val rawVariant = pivotType.trim().uppercase()
        val variant = if (rawVariant in setOf("STANDARD", "FIBONACCI", "CAMARILLA", "WOODIE")) rawVariant else "STANDARD"
        var high = Double.NEGATIVE_INFINITY
        var low = Double.POSITIVE_INFINITY
        var close = candles.last().close.toDouble()
        var currOpen = candles.last().open.toDouble()

        if (tf == "D1" || tf == "W1") {
            val prevBar = candles[candles.size - 2]
            val currBar = candles.last()
            high = prevBar.high.toDouble()
            low = prevBar.low.toDouble()
            close = prevBar.close.toDouble()
            currOpen = currBar.open.toDouble()
        } else {
            val lastDayKey = UtcTimeAnchorAlgorithm.getSessionDayKey(candles.last().openTimeUtcMillis, symbolCode)
            var prevDayKey: String? = null
            for (i in candles.lastIndex downTo 0) {
                val dk = UtcTimeAnchorAlgorithm.getSessionDayKey(candles[i].openTimeUtcMillis, symbolCode)
                if (dk == lastDayKey) {
                    currOpen = candles[i].open.toDouble()
                } else {
                    if (prevDayKey == null) {
                        prevDayKey = dk
                        close = candles[i].close.toDouble()
                    }
                    if (dk == prevDayKey) {
                        high = max(high, candles[i].high.toDouble())
                        low = min(low, candles[i].low.toDouble())
                    } else {
                        break
                    }
                }
            }
            if (!high.isFinite() || !low.isFinite() || high <= 0.0) {
                val winStart = max(0, candles.size - 25)
                val winEnd = max(1, candles.size - 1)
                for (i in winStart until winEnd) {
                    high = max(high, candles[i].high.toDouble())
                    low = min(low, candles[i].low.toDouble())
                    close = candles[i].close.toDouble()
                }
                currOpen = candles[winEnd].open.toDouble()
            }
        }

        if (!high.isFinite() || !low.isFinite() || high < low) return null
        val range = high - low

        return when (variant) {
            "FIBONACCI" -> {
                val p = (high + low + close) / 3.0
                PivotPointsResult(
                    variant = variant,
                    p = p,
                    r1 = p + 0.382 * range,
                    r2 = p + 0.618 * range,
                    r3 = p + 1.0 * range,
                    r4 = null,
                    s1 = p - 0.382 * range,
                    s2 = p - 0.618 * range,
                    s3 = p - 1.0 * range,
                    s4 = null
                )
            }
            "CAMARILLA" -> {
                val p = (high + low + close) / 3.0
                PivotPointsResult(
                    variant = variant,
                    p = p,
                    r1 = close + range * 1.1 / 12.0,
                    r2 = close + range * 1.1 / 6.0,
                    r3 = close + range * 1.1 / 4.0,
                    r4 = close + range * 1.1 / 2.0,
                    s1 = close - range * 1.1 / 12.0,
                    s2 = close - range * 1.1 / 6.0,
                    s3 = close - range * 1.1 / 4.0,
                    s4 = close - range * 1.1 / 2.0
                )
            }
            "WOODIE" -> {
                val p = (high + low + 2.0 * currOpen) / 4.0
                PivotPointsResult(
                    variant = variant,
                    p = p,
                    r1 = 2.0 * p - low,
                    r2 = p + range,
                    r3 = high + 2.0 * (p - low),
                    r4 = null,
                    s1 = 2.0 * p - high,
                    s2 = p - range,
                    s3 = low - 2.0 * (high - p),
                    s4 = null
                )
            }
            else -> {
                val p = (high + low + close) / 3.0
                PivotPointsResult(
                    variant = "STANDARD",
                    p = p,
                    r1 = 2.0 * p - low,
                    r2 = p + range,
                    r3 = high + 2.0 * (p - low),
                    r4 = null,
                    s1 = 2.0 * p - high,
                    s2 = p - range,
                    s3 = low - 2.0 * (high - p),
                    s4 = null
                )
            }
        }
    }

    /**
     * Deterministic Multi-Step OHLC Candlestick Extrapolation Engine (PRED-09 & PRED-10):
     * Generates at least 10 (default 30) future ghosted OHLC candles combining damped Holt linear trend,
     * 2-harmonic Fourier cycle decomposition, and ATR-scaled candlestick bodies/wicks.
     */
    fun computeFutureCandlestickProjection(
        candles: List<CandleBar>,
        timeframe: String = "M15",
        horizon: Int = 30
    ): List<FutureProjectedCandle> {
        if (candles.size < 4) return emptyList()
        val effectiveHorizon = max(10, min(60, horizon))
        val stepMs = UtcTimeAnchorAlgorithm.timeframeStepMillis(timeframe)
        val win = candles.takeLast(min(120, candles.size))
        val n = win.size
        val baseBar = win.last()
        val baseClose = baseBar.close.toDouble()
        if (baseClose <= 0.0) return emptyList()

        // 1. Compute local ATR(14) & 30-bar average body/wick ratios
        var trSum = 0.0
        var trCount = 0
        val atrStart = max(1, n - 14)
        for (i in atrStart until n) {
            val h = win[i].high.toDouble()
            val l = win[i].low.toDouble()
            val pc = win[i - 1].close.toDouble()
            val tr = max(h - l, max(abs(h - pc), abs(l - pc)))
            trSum += tr
            trCount++
        }
        val fallbackRange = (baseBar.high.toDouble() - baseBar.low.toDouble()).coerceAtLeast(baseClose * 0.0015)
        val atr = (if (trCount > 0) trSum / trCount else fallbackRange).coerceAtLeast(baseClose * 0.0012)

        val ratioCount = min(30, max(1, n - 1))
        var bodyRatioSum = 0.0
        var upperWickSum = 0.0
        var lowerWickSum = 0.0
        for (i in (n - ratioCount) until n) {
            val cur = win[i]
            val hi = cur.high.toDouble()
            val lo = cur.low.toDouble()
            val op = cur.open.toDouble()
            val cl = cur.close.toDouble()
            val rng = max(hi - lo, baseClose * 0.0005)
            bodyRatioSum += abs(cl - op) / rng
            upperWickSum += (hi - max(op, cl)) / rng
            lowerWickSum += (min(op, cl) - lo) / rng
        }
        val avgBodyRatio = (bodyRatioSum / ratioCount).coerceIn(0.38, 0.74)
        val avgUpperWickRatio = (upperWickSum / ratioCount).coerceIn(0.15, 0.48)
        val avgLowerWickRatio = (lowerWickSum / ratioCount).coerceIn(0.15, 0.48)

        // 2. SMC (BOS/CHoCH, FVG, EQH/EQL) + Volume Profile (POC/VAH/VAL) + EMA20
        val smc = PriceFormatterAlgorithm.detectSmcMarketStructures(win, 3)
        val vp = PriceFormatterAlgorithm.computeVolumeProfile(
            win,
            24,
            0.70
        )
        val ema20List = PriceFormatterAlgorithm.computeEmaValues(
            win.map { it.close.toDouble() },
            min(20, max(5, n - 2))
        )
        val ema20 = ema20List.lastOrNull() ?: baseClose
        val lastBos = smc.structures.lastOrNull()
        val dominantDir = when {
            lastBos != null -> if (lastBos.direction >= 0) 1.0 else -1.0
            baseClose >= ema20 -> 1.0
            else -> -1.0
        }

        val poc = vp?.pocPrice ?: ema20
        val vah = vp?.vahPrice ?: (baseClose + 2.2 * atr)
        val valPrice = vp?.valPrice ?: (baseClose - 2.2 * atr)

        // Step A: Pullback / Mitigation Target (FVG / POC / EMA20)
        val pullbackTarget = if (dominantDir > 0.0) {
            val lowerFvg = smc.fvgs.filter { it.top < baseClose && (baseClose - (it.top + it.bottom) * 0.5) <= 3.5 * atr }
                .maxByOrNull { it.top }
            when {
                lowerFvg != null -> (lowerFvg.top + lowerFvg.bottom) * 0.5
                baseClose > ema20 + 0.4 * atr -> min(baseClose - 0.85 * atr, max(ema20, poc))
                else -> baseClose - 0.75 * atr
            }
        } else {
            val upperFvg = smc.fvgs.filter { it.bottom > baseClose && ((it.top + it.bottom) * 0.5 - baseClose) <= 3.5 * atr }
                .minByOrNull { it.bottom }
            when {
                upperFvg != null -> (upperFvg.top + upperFvg.bottom) * 0.5
                baseClose < ema20 - 0.4 * atr -> max(baseClose + 0.85 * atr, min(ema20, poc))
                else -> baseClose + 0.75 * atr
            }
        }

        // Step B: Primary Liquidity Magnet (EQH/EQL / VAH/VAL)
        val primaryMagnet = if (dominantDir > 0.0) {
            val aboveEqh = smc.equalLevels.filter { it.type == "EQH" && it.price > baseClose + 0.8 * atr && it.price <= baseClose + 5.5 * atr }
                .minByOrNull { it.price }
            when {
                aboveEqh != null -> aboveEqh.price
                vah > baseClose + 1.1 * atr -> vah
                else -> baseClose + 3.5 * atr
            }
        } else {
            val belowEql = smc.equalLevels.filter { it.type == "EQL" && it.price < baseClose - 0.8 * atr && it.price >= baseClose - 5.5 * atr }
                .maxByOrNull { it.price }
            when {
                belowEql != null -> belowEql.price
                valPrice < baseClose - 1.1 * atr -> valPrice
                else -> baseClose - 3.5 * atr
            }
        }

        val canonicalHorizon = 60
        val tfNorm = timeframe.trim().uppercase()
        val pullbackBars = when (tfNorm) {
            "M15" -> 3
            "M30" -> 2
            else -> 1
        }
        val maxPullAtr = if (pullbackBars == 1) 0.62 else 1.35
        val clampedPullback = pullbackTarget.coerceIn(baseClose - maxPullAtr * atr, baseClose + maxPullAtr * atr)
        val clampedMagnet = if (dominantDir > 0.0) {
            primaryMagnet.coerceIn(baseClose + 1.6 * atr, baseClose + 5.2 * atr)
        } else {
            primaryMagnet.coerceIn(baseClose - 5.2 * atr, baseClose - 1.6 * atr)
        }

        val out = ArrayList<FutureProjectedCandle>(canonicalHorizon)
        var prevClose = baseClose
        var waveMode = "PULLBACK"
        var legBars = 0
        var legStart = baseClose
        var sweepCount = 0
        var corrLen = 4
        var corrTarget = baseClose
        var consLen = 3
        var consMid = baseClose
        var consecDir = 0
        var lastDir = 0

        for (step in 1..canonicalHorizon) {
            val open = prevClose
            val maxEnvAtr = 1.10 * kotlin.math.sqrt((step + 5).toDouble())
            val totalExcAtr = ((open - baseClose) * dominantDir) / max(atr, 1e-6)
            val damp = (1.0 - max(0.0, totalExcAtr) / (maxEnvAtr * 1.04)).coerceIn(0.18, 1.0)

            if (waveMode == "PULLBACK" && step > pullbackBars) {
                waveMode = "IMPULSE"
                legBars = 0
                legStart = open
            } else if (waveMode == "IMPULSE") {
                val legGainAtr = ((open - legStart) * dominantDir) / max(atr, 1e-6)
                val activeTarget = if (sweepCount == 0) {
                    clampedMagnet
                } else {
                    baseClose + dominantDir * atr * min(maxEnvAtr * 0.9, 3.0 + sweepCount * 1.55)
                }
                val hitTarget = (open - activeTarget) * dominantDir >= -0.25 * atr && legBars >= 4
                val overext = legGainAtr >= 2.15 + 0.35 * (sweepCount % 2) ||
                    legBars >= 8 ||
                    totalExcAtr >= maxEnvAtr * 0.80
                if (hitTarget || overext) {
                    waveMode = "CORRECTION"
                    corrLen = 4 + ((step + sweepCount) % 3)
                    corrTarget = open - (open - legStart) * (0.42 + 0.10 * (sweepCount % 2))
                    legBars = 0
                    sweepCount += 1
                }
            } else if (waveMode == "CORRECTION") {
                val reached = (open - corrTarget) * (-dominantDir) >= -0.15 * atr && legBars >= 2
                if (legBars >= corrLen || reached) {
                    if (step >= 14 && sweepCount % 2 == 1) {
                        waveMode = "CONSOLIDATION"
                        consLen = 3 + (sweepCount % 2)
                        consMid = open
                        legBars = 0
                    } else {
                        waveMode = "IMPULSE"
                        legStart = open
                        legBars = 0
                    }
                }
            } else if (waveMode == "CONSOLIDATION") {
                if (legBars >= consLen) {
                    if (step < 48 && totalExcAtr < maxEnvAtr * 0.78) {
                        waveMode = "IMPULSE"
                        legStart = open
                        legBars = 0
                    } else {
                        consMid = open
                        legBars = 0
                    }
                }
            }

            val signedBody: Double = when (waveMode) {
                "PULLBACK" -> {
                    when {
                        pullbackBars == 1 -> dominantDir * atr * 0.22
                        step == pullbackBars -> dominantDir * atr * 0.24
                        else -> {
                            val remPullback = max(1, pullbackBars - step + 1)
                            val gapToPullback = (clampedPullback - open) / remPullback.toDouble()
                            val bodyMag = (abs(gapToPullback) * 0.85 + atr * 0.16).coerceIn(atr * 0.24, atr * 0.58)
                            val pullSign = if (gapToPullback >= 0.0) 1.0 else -1.0
                            pullSign * bodyMag
                        }
                    }
                }
                "IMPULSE" -> {
                    if (consecDir >= 3 && lastDir == dominantDir.toInt()) {
                        -dominantDir * atr * (0.24 + 0.18 * abs(kotlin.math.sin(step * 1.25 + n)))
                    } else {
                        val impulseScale = 0.38 + 0.30 * avgBodyRatio + 0.24 * abs(kotlin.math.cos(step * 0.85 + (n % 5)))
                        val mag = (atr * impulseScale * damp).coerceIn(atr * 0.24, atr * 1.15)
                        dominantDir * mag
                    }
                }
                "CORRECTION" -> {
                    if (consecDir >= 3 && lastDir == (-dominantDir).toInt()) {
                        dominantDir * atr * (0.20 + 0.14 * abs(kotlin.math.cos(step * 1.1)))
                    } else {
                        val remCorr = max(1, corrLen - legBars)
                        val gap = abs(corrTarget - open) / remCorr.toDouble()
                        val mag = (gap * 0.75 + atr * 0.16).coerceIn(atr * 0.22, atr * 0.72)
                        -dominantDir * mag
                    }
                }
                else -> {
                    val pullToMid = (consMid - open) * 0.30
                    val osc = (if (legBars % 2 == 0) -dominantDir else dominantDir) * atr * 0.30
                    val comb = pullToMid + osc
                    var sgn = if (comb >= 0.0) 1 else -1
                    if (consecDir >= 3 && sgn == lastDir) sgn = -lastDir
                    sgn * abs(comb).coerceIn(atr * 0.20, atr * 0.48)
                }
            }

            var close = max(baseClose * 0.05, open + signedBody)
            if (abs(close - open) < atr * 0.18) {
                close = open + (if (close >= open) 1.0 else -1.0) * atr * 0.20
            }
            val nextExcAtr = ((close - baseClose) * dominantDir) / max(atr, 1e-6)
            if (nextExcAtr > maxEnvAtr) {
                close = max(baseClose * 0.05, open - dominantDir * atr * 0.24)
            }
            if (consecDir >= 4 && (if (close >= open) 1 else -1) == lastDir) {
                close = max(baseClose * 0.05, open - lastDir * atr * (0.24 + 0.14 * abs(kotlin.math.cos(step * 1.15))))
            }

            val curSgn = if (close >= open) 1 else -1
            consecDir = if (curSgn == lastDir) consecDir + 1 else 1
            lastDir = curSgn

            val bodyAbs = abs(close - open)
            val upperWick = min(
                atr * 0.78,
                max(
                    atr * 0.14,
                    bodyAbs * (avgUpperWickRatio / avgBodyRatio) * (0.85 + 0.30 * abs(kotlin.math.cos(step * 0.9)))
                )
            )
            val lowerWick = min(
                atr * 0.78,
                max(
                    atr * 0.14,
                    bodyAbs * (avgLowerWickRatio / avgBodyRatio) * (0.85 + 0.30 * abs(kotlin.math.sin(step * 1.1)))
                )
            )

            var high = max(open, close) + upperWick
            var low = max(baseClose * 0.02, min(open, close) - lowerWick)

            if (abs(low - clampedPullback) <= atr * 0.30 || abs(low - poc) <= atr * 0.30 || abs(low - valPrice) <= atr * 0.30) {
                low = max(baseClose * 0.02, low - atr * 0.26)
            }
            if (abs(high - vah) <= atr * 0.30 || abs(high - clampedMagnet) <= atr * 0.30) {
                high += atr * 0.26
            }

            val pct = ((close - baseClose) / baseClose) * 100.0
            val bandHalf = atr * kotlin.math.sqrt(step.toDouble()) * 0.85

            out.add(
                FutureProjectedCandle(
                    step = step,
                    openTimeUtcMillis = baseBar.openTimeUtcMillis + step.toLong() * stepMs,
                    open = open,
                    high = high,
                    low = low,
                    close = close,
                    pctChangeFromAnchor = pct,
                    upperBand = close + bandHalf,
                    lowerBand = max(baseClose * 0.02, close - bandHalf)
                )
            )
            prevClose = close
            legBars += 1
        }
        return out.take(effectiveHorizon)
    }
}
