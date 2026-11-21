package es.manico.chartintelligence.algorithms

import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartPreferences
import es.manico.chartintelligence.data.model.ChartTabState
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * TechnicalAnalysisCore (Android Kotlin) — Phases A–F of TECHNICAL_ANALYSIS_CORE_IMPLEMENTATION_PLAN_V1.
 *
 * Pure, UI-independent deterministic analysis layer:
 * - Phase A: Candle normalization & data quality summary (`CandleQualityReport`).
 * - Phase B: Canonical core indicators & renderer decoupling (`computeChartBundle`).
 * - Phase C: Causal Swing High/Low detection, trend classification, and evidence-backed S/R Zones.
 * - Phase D: Deterministic Candlestick Pattern detection anchored strictly to real candles.
 * - Phases E & F: Versioned Canonical Analysis Result (`ta-core/1.1`) bit-for-bit aligned with Web.
 */
object TechnicalAnalysisCore {

    const val SCHEMA_VERSION = "ta-core/1.1"

    data class CandleQualityReport(
        val inputCount: Int,
        val validCount: Int,
        val droppedInvalidCount: Int,
        val deduplicatedCount: Int,
        val droppedOpenCount: Int,
        val wasUnsorted: Boolean,
        val gapCount: Int,
        val integrityRatio: Double,
        val rangeStartMs: Long?,
        val rangeEndMs: Long?
    )

    data class NormalizedCandleResult(
        val candles: List<CandleBar>,
        val quality: CandleQualityReport
    )

    data class CoreIndicatorSnapshot(
        val schemaVersion: String = SCHEMA_VERSION,
        val symbolCode: String,
        val timeframe: String,
        val quality: CandleQualityReport,
        val timestamps: List<Long>,
        val sma20: List<Double?>,
        val ema20: List<Double?>,
        val bollinger: List<PriceFormatterAlgorithm.BollingerPoint?>,
        val atr14: List<Double?>,
        val rsi14: List<Double?>,
        val macd: List<PriceFormatterAlgorithm.MacdPoint?>,
        val vwap: List<Double?>,
        val supertrend: List<PriceFormatterAlgorithm.SupertrendPoint?>
    )

    data class SwingPivot(
        val type: String, // "SWING_HIGH" | "SWING_LOW"
        val index: Int,
        val confirmIndex: Int,
        val openTimeUtcMs: Long,
        val confirmTimeUtcMs: Long,
        val price: Double
    )

    data class SwingTrendResult(
        val swingLen: Int,
        val swings: List<SwingPivot>,
        val trend: String, // "UPTREND" | "DOWNTREND" | "RANGE" | "INSUFFICIENT_DATA"
        val trendReason: String
    )

    data class SupportResistanceZone(
        val zoneId: String,
        val role: String, // "SUPPORT" | "RESISTANCE"
        val lowPrice: Double,
        val highPrice: Double,
        val centerPrice: Double,
        val touchCount: Int,
        val wickRejectionCount: Int,
        val startIndex: Int,
        val lastTouchIndex: Int,
        val startTimeUtcMs: Long,
        val lastTouchTimeUtcMs: Long,
        val touchIndices: List<Int>,
        val touchTimesUtcMs: List<Long>,
        val status: String, // "ACTIVE" | "BROKEN" | "RETESTED"
        val breakIndex: Int?,
        val breakTimeUtcMs: Long?,
        val retestIndex: Int?,
        val invalidationReason: String?,
        val distancePct: Double
    )

    data class PatternEvidence(
        val bodyRatio: Double,
        val upperWickRatio: Double,
        val lowerWickRatio: Double,
        val rangeAtrRatio: Double
    )

    data class CandlestickPattern(
        val patternId: String,
        val type: String,
        val shortLabel: String,
        val direction: Int, // +1 Bullish, -1 Bearish, 0 Neutral
        val anchorIndex: Int,
        val anchorTimeUtcMs: Long,
        val candleIndices: List<Int>,
        val candleTimesUtcMs: List<Long>,
        val priceLow: Double,
        val priceHigh: Double,
        val markerPrice: Double,
        val evidence: PatternEvidence
    )

    data class CanonicalStructureBundle(
        val swingLen: Int,
        val trend: String,
        val trendReason: String,
        val swings: List<SwingPivot>,
        val zones: List<SupportResistanceZone>
    )

    data class CanonicalAnalysisResult(
        val schemaVersion: String = SCHEMA_VERSION,
        val symbolCode: String,
        val timeframe: String,
        val quality: CandleQualityReport,
        val timestamps: List<Long>,
        val indicators: CoreIndicatorSnapshot,
        val structures: CanonicalStructureBundle,
        val patterns: List<CandlestickPattern>
    )

    data class ChartAnalysisBundle(
        val fullSma20: List<Double?> = emptyList(),
        val fullSma50: List<Double?> = emptyList(),
        val fullSma200: List<Double?> = emptyList(),
        val fullEma20: List<Double?> = emptyList(),
        val fullEma50: List<Double?> = emptyList(),
        val fullEma200: List<Double?> = emptyList(),
        val fullBollinger: List<PriceFormatterAlgorithm.BollingerPoint?> = emptyList(),
        val fullSupertrend: List<PriceFormatterAlgorithm.SupertrendPoint?> = emptyList(),
        val fullVwap: List<Double?> = emptyList(),
        val fullRsi14: List<Double?> = emptyList(),
        val fullMacd: List<PriceFormatterAlgorithm.MacdPoint?> = emptyList(),
        val fullAtr14: List<Double?> = emptyList(),
        val fullSmcResult: PriceFormatterAlgorithm.SmcAnalysisResult? = null,
        val fullPsar: List<PsarPoint?> = emptyList(),
        val fullIchimoku: IchimokuResult? = null,
        val fullKeltner: List<BandPoint?> = emptyList(),
        val fullDonchian: List<BandPoint?> = emptyList(),
        val fullMtfEma: List<Double?> = emptyList(),
        val fullAdx14: List<AdxDmiPoint?> = emptyList(),
        val fullStoch14: List<StochPoint?> = emptyList(),
        val fullCci20: List<Double?> = emptyList(),
        val fullWillR14: List<Double?> = emptyList(),
        val fullObv: List<Double> = emptyList(),
        val fullCmf20: List<Double?> = emptyList(),
        val fullRoc12: List<Double?> = emptyList(),
        val pivotPoints: Phase2IndicatorsAlgorithm.PivotPointsResult? = null,
        val srZones: List<SupportResistanceZone> = emptyList(),
        val candlePatterns: List<CandlestickPattern> = emptyList()
    ) {
        fun <T> sliceWindow(series: List<T>, startIndex: Int, endIndexExclusive: Int): List<T> {
            if (series.isEmpty()) return emptyList()
            val safeStart = startIndex.coerceIn(0, series.size)
            val safeEnd = endIndexExclusive.coerceIn(safeStart, series.size)
            return series.subList(safeStart, safeEnd)
        }
    }

    /**
     * Phase A — Validate, deduplicate, and sort candles strictly ascending by UTC open timestamp
     * without mutating BigDecimal precision or fabricating missing candles.
     */
    fun normalizeCandles(
        rawCandles: List<CandleBar>,
        timeframe: String = "M15",
        symbolCode: String = "SPOTBRENT",
        excludeOpenBars: Boolean = false
    ): NormalizedCandleResult {
        if (rawCandles.isEmpty()) {
            return NormalizedCandleResult(
                candles = emptyList(),
                quality = CandleQualityReport(
                    inputCount = 0,
                    validCount = 0,
                    droppedInvalidCount = 0,
                    deduplicatedCount = 0,
                    droppedOpenCount = 0,
                    wasUnsorted = false,
                    gapCount = 0,
                    integrityRatio = 1.0,
                    rangeStartMs = null,
                    rangeEndMs = null
                )
            )
        }

        val normTf = timeframe.uppercase()
        val normSym = symbolCode.uppercase()
        var droppedInvalid = 0
        var droppedOpen = 0
        var deduplicated = 0
        var wasUnsorted = false
        var prevMs = Long.MIN_VALUE

        val byOpenMs = LinkedHashMap<Long, CandleBar>(rawCandles.size)
        for (bar in rawCandles) {
            if (excludeOpenBars && !bar.isClosed) {
                droppedOpen++
                continue
            }
            val openMs = bar.openTimeUtcMillis
            val o = bar.open.toDouble()
            val h = bar.high.toDouble()
            val l = bar.low.toDouble()
            val c = bar.close.toDouble()
            val maxOc = maxOf(o, c)
            val minOc = minOf(o, c)

            if (
                openMs <= 0L ||
                !o.isFinite() || !h.isFinite() || !l.isFinite() || !c.isFinite() ||
                o <= 0.0 || h <= 0.0 || l <= 0.0 || c <= 0.0 ||
                h < l || h < maxOc || l > minOc
            ) {
                droppedInvalid++
                continue
            }

            if (openMs < prevMs) {
                wasUnsorted = true
            }
            prevMs = openMs

            if (byOpenMs.containsKey(openMs)) {
                deduplicated++
            }
            byOpenMs[openMs] = bar
        }

        val sorted = byOpenMs.values.sortedBy { it.openTimeUtcMillis }
        val gapReport = if (sorted.size >= 2) {
            GapDetectorAlgorithm.detectGaps(sorted, normTf, normSym)
        } else {
            null
        }

        return NormalizedCandleResult(
            candles = sorted,
            quality = CandleQualityReport(
                inputCount = rawCandles.size,
                validCount = sorted.size,
                droppedInvalidCount = droppedInvalid,
                deduplicatedCount = deduplicated,
                droppedOpenCount = droppedOpen,
                wasUnsorted = wasUnsorted,
                gapCount = gapReport?.gapCount ?: 0,
                integrityRatio = gapReport?.integrityRatio ?: 1.0,
                rangeStartMs = sorted.firstOrNull()?.openTimeUtcMillis,
                rangeEndMs = sorted.lastOrNull()?.openTimeUtcMillis
            )
        )
    }

    /**
     * Phase B — Compute the canonical reference indicator set (SMA20, EMA20, Bollinger, ATR14,
     * RSI14, MACD, VWAP, Supertrend) aligned 1-to-1 with normalized candles.
     */
    fun computeCoreIndicators(
        rawCandles: List<CandleBar>,
        timeframe: String = "M15",
        symbolCode: String = "SPOTBRENT",
        bollingerPeriod: Int = 20,
        bollingerStdDev: Double = 2.0,
        excludeOpenBars: Boolean = false
    ): CoreIndicatorSnapshot {
        val normTf = timeframe.uppercase()
        val normSym = symbolCode.uppercase()
        val safeBbPeriod = bollingerPeriod.coerceIn(2, 200)
        val safeBbStd = bollingerStdDev.coerceIn(0.5, 5.0)
        val normalized = normalizeCandles(rawCandles, normTf, normSym, excludeOpenBars)
        val candles = normalized.candles
        val closes = candles.map { it.close.toDouble() }

        return CoreIndicatorSnapshot(
            schemaVersion = SCHEMA_VERSION,
            symbolCode = normSym,
            timeframe = normTf,
            quality = normalized.quality,
            timestamps = candles.map { it.openTimeUtcMillis },
            sma20 = PriceFormatterAlgorithm.computeSmaValues(closes, 20),
            ema20 = PriceFormatterAlgorithm.computeEmaValues(closes, 20),
            bollinger = PriceFormatterAlgorithm.computeBollingerBands(closes, safeBbPeriod, safeBbStd),
            atr14 = PriceFormatterAlgorithm.computeAtrValues(candles, 14),
            rsi14 = PriceFormatterAlgorithm.computeRsiValues(closes, 14),
            macd = PriceFormatterAlgorithm.computeMacdValues(closes, 12, 26, 9),
            vwap = PriceFormatterAlgorithm.computeVwapValues(candles, normTf, normSym),
            supertrend = PriceFormatterAlgorithm.computeSupertrendValues(candles, 10, 3.0)
        )
    }

    /**
     * Phase C — Causal Swing High/Low pivots with explicit confirmation lag (`confirmIndex = index + swingLen`)
     * and deterministic trend classification from confirmed swing sequences.
     */
    fun detectSwingsAndTrend(candles: List<CandleBar>, swingLen: Int = 3): SwingTrendResult {
        val len = max(1, swingLen)
        val n = candles.size
        if (n < len * 2 + 1) {
            return SwingTrendResult(
                swingLen = len,
                swings = emptyList(),
                trend = "INSUFFICIENT_DATA",
                trendReason = "Insufficient bars for causal swing confirmation"
            )
        }

        val swings = ArrayList<SwingPivot>()
        for (i in len..(n - 1 - len)) {
            val hi = candles[i].high.toDouble()
            val lo = candles[i].low.toDouble()
            var isHigh = true
            var strictLeftHigh = false
            var strictRightHigh = false
            var isLow = true
            var strictLeftLow = false
            var strictRightLow = false

            for (k in 1..len) {
                val lh = candles[i - k].high.toDouble()
                val rh = candles[i + k].high.toDouble()
                if (hi < lh || hi < rh) isHigh = false
                if (hi > lh) strictLeftHigh = true
                if (hi > rh) strictRightHigh = true

                val ll = candles[i - k].low.toDouble()
                val rl = candles[i + k].low.toDouble()
                if (lo > ll || lo > rl) isLow = false
                if (lo < ll) strictLeftLow = true
                if (lo < rl) strictRightLow = true
            }

            val confirmIdx = i + len
            if (isHigh && strictLeftHigh && strictRightHigh) {
                swings.add(
                    SwingPivot(
                        type = "SWING_HIGH",
                        index = i,
                        confirmIndex = confirmIdx,
                        openTimeUtcMs = candles[i].openTimeUtcMillis,
                        confirmTimeUtcMs = candles[confirmIdx].openTimeUtcMillis,
                        price = hi
                    )
                )
            }
            if (isLow && strictLeftLow && strictRightLow) {
                swings.add(
                    SwingPivot(
                        type = "SWING_LOW",
                        index = i,
                        confirmIndex = confirmIdx,
                        openTimeUtcMs = candles[i].openTimeUtcMillis,
                        confirmTimeUtcMs = candles[confirmIdx].openTimeUtcMillis,
                        price = lo
                    )
                )
            }
        }

        val highs = swings.filter { it.type == "SWING_HIGH" }
        val lows = swings.filter { it.type == "SWING_LOW" }
        var trend = "INSUFFICIENT_DATA"
        var reason = "Need at least 2 confirmed swing highs and 2 confirmed swing lows"
        if (highs.size >= 2 && lows.size >= 2) {
            val prevH = highs[highs.size - 2].price
            val lastH = highs[highs.size - 1].price
            val prevL = lows[lows.size - 2].price
            val lastL = lows[lows.size - 1].price
            when {
                lastH > prevH && lastL > prevL -> {
                    trend = "UPTREND"
                    reason = "Confirmed Higher Highs and Higher Lows"
                }
                lastH < prevH && lastL < prevL -> {
                    trend = "DOWNTREND"
                    reason = "Confirmed Lower Highs and Lower Lows"
                }
                else -> {
                    trend = "RANGE"
                    reason = "Mixed confirmed swing highs/lows (consolidation or transition)"
                }
            }
        }

        return SwingTrendResult(
            swingLen = len,
            swings = swings,
            trend = trend,
            trendReason = reason
        )
    }

    private class MutableZoneCluster(
        val role: String,
        val touches: MutableList<SwingPivot>,
        var sumPrice: Double,
        var centerPrice: Double,
        var rawLow: Double,
        var rawHigh: Double
    )

    /**
     * Phase C — Evidence-backed Support/Resistance Zones clustered from confirmed Swing pivots.
     * Requires >= 2 confirmed swing touches; tracks wick rejections, decisive breaks, retests, and invalidation.
     */
    fun detectSupportResistanceZones(
        candles: List<CandleBar>,
        swingLen: Int = 3,
        atrPeriod: Int = 14
    ): List<SupportResistanceZone> {
        val n = candles.size
        if (n < swingLen * 2 + 2) return emptyList()

        val swingRes = detectSwingsAndTrend(candles, swingLen)
        if (swingRes.swings.size < 2) return emptyList()

        val atrSeries = PriceFormatterAlgorithm.computeAtrValues(candles, atrPeriod)
        var refAtr = 0.0
        for (i in atrSeries.indices.reversed()) {
            val v = atrSeries[i]
            if (v != null && v > 0.0) {
                refAtr = v
                break
            }
        }
        val lastClose = candles[n - 1].close.toDouble().let { if (it > 0.0) it else 1.0 }
        if (refAtr <= 0.0) {
            var meanRange = 0.0
            for (c in candles) {
                meanRange += max(0.0, c.high.toDouble() - c.low.toDouble())
            }
            refAtr = max(meanRange / n.toDouble(), lastClose * 1e-4)
        }

        val clusterTol = 0.65 * refAtr
        val minHalfThickness = 0.15 * refAtr
        val breakBuffer = 0.15 * refAtr

        fun buildSideZones(sideSwings: List<SwingPivot>, role: String): List<SupportResistanceZone> {
            val clusters = ArrayList<MutableZoneCluster>()
            for (sw in sideSwings) {
                var bestIdx = -1
                var bestDist = Double.POSITIVE_INFINITY
                for (cIdx in clusters.indices) {
                    val dist = abs(sw.price - clusters[cIdx].centerPrice)
                    if (dist <= clusterTol && dist < bestDist) {
                        bestDist = dist
                        bestIdx = cIdx
                    }
                }
                if (bestIdx >= 0) {
                    val cl = clusters[bestIdx]
                    cl.touches.add(sw)
                    cl.sumPrice += sw.price
                    cl.centerPrice = cl.sumPrice / cl.touches.size.toDouble()
                    cl.rawLow = min(cl.rawLow, sw.price)
                    cl.rawHigh = max(cl.rawHigh, sw.price)
                } else {
                    clusters.add(
                        MutableZoneCluster(
                            role = role,
                            touches = mutableListOf(sw),
                            sumPrice = sw.price,
                            centerPrice = sw.price,
                            rawLow = sw.price,
                            rawHigh = sw.price
                        )
                    )
                }
            }

            val zones = ArrayList<SupportResistanceZone>()
            for (cl in clusters) {
                if (cl.touches.size < 2) continue
                val lowPrice = min(cl.rawLow, cl.centerPrice - minHalfThickness)
                val highPrice = max(cl.rawHigh, cl.centerPrice + minHalfThickness)
                val firstTouch = cl.touches.first()
                val lastTouch = cl.touches.last()

                var status = "ACTIVE"
                var wickRejectionCount = 0
                var breakIndex: Int? = null
                var breakTimeUtcMs: Long? = null
                var retestIndex: Int? = null
                var invalidationReason: String? = null

                for (i in (lastTouch.confirmIndex + 1) until n) {
                    val h = candles[i].high.toDouble()
                    val l = candles[i].low.toDouble()
                    val c = candles[i].close.toDouble()

                    if (role == "RESISTANCE") {
                        if (status == "ACTIVE") {
                            if (c > highPrice + breakBuffer) {
                                status = "BROKEN"
                                breakIndex = i
                                breakTimeUtcMs = candles[i].openTimeUtcMillis
                                invalidationReason = "Decisive close above resistance upper bound"
                            } else if (h >= lowPrice && c <= highPrice) {
                                wickRejectionCount++
                            }
                        } else if (status == "BROKEN" && l <= highPrice + breakBuffer && c >= lowPrice) {
                            status = "RETESTED"
                            retestIndex = i
                        }
                    } else {
                        if (status == "ACTIVE") {
                            if (c < lowPrice - breakBuffer) {
                                status = "BROKEN"
                                breakIndex = i
                                breakTimeUtcMs = candles[i].openTimeUtcMillis
                                invalidationReason = "Decisive close below support lower bound"
                            } else if (l <= highPrice && c >= lowPrice) {
                                wickRejectionCount++
                            }
                        } else if (status == "BROKEN" && h >= lowPrice - breakBuffer && c <= highPrice) {
                            status = "RETESTED"
                            retestIndex = i
                        }
                    }
                }

                val distancePct = if (lastClose > 0.0) ((cl.centerPrice - lastClose) / lastClose) * 100.0 else 0.0
                zones.add(
                    SupportResistanceZone(
                        zoneId = "${role}_${firstTouch.openTimeUtcMs}_${cl.touches.size}",
                        role = role,
                        lowPrice = lowPrice,
                        highPrice = highPrice,
                        centerPrice = cl.centerPrice,
                        touchCount = cl.touches.size,
                        wickRejectionCount = wickRejectionCount,
                        startIndex = firstTouch.index,
                        lastTouchIndex = lastTouch.index,
                        startTimeUtcMs = firstTouch.openTimeUtcMs,
                        lastTouchTimeUtcMs = lastTouch.openTimeUtcMs,
                        touchIndices = cl.touches.map { it.index },
                        touchTimesUtcMs = cl.touches.map { it.openTimeUtcMs },
                        status = status,
                        breakIndex = breakIndex,
                        breakTimeUtcMs = breakTimeUtcMs,
                        retestIndex = retestIndex,
                        invalidationReason = invalidationReason,
                        distancePct = distancePct
                    )
                )
            }

            zones.sortWith(compareByDescending<SupportResistanceZone> { it.touchCount }.thenByDescending { it.lastTouchIndex })
            return zones.take(4)
        }

        val resistanceZones = buildSideZones(swingRes.swings.filter { it.type == "SWING_HIGH" }, "RESISTANCE")
        val supportZones = buildSideZones(swingRes.swings.filter { it.type == "SWING_LOW" }, "SUPPORT")
        return (resistanceZones + supportZones).sortedByDescending { it.centerPrice }
    }

    /**
     * Phase D — Deterministic Candlestick Pattern Detector anchored strictly to real candle coordinates
     * with quantitative evidence (`bodyRatio`, `upperWickRatio`, `lowerWickRatio`, `rangeAtrRatio`).
     */
    fun detectCandlestickPatterns(candles: List<CandleBar>, atrPeriod: Int = 14): List<CandlestickPattern> {
        val n = candles.size
        if (n == 0) return emptyList()

        val atrSeries = PriceFormatterAlgorithm.computeAtrValues(candles, atrPeriod)
        val patterns = ArrayList<CandlestickPattern>()

        for (i in 0 until n) {
            val c = candles[i]
            val o = c.open.toDouble()
            val h = c.high.toDouble()
            val l = c.low.toDouble()
            val cl = c.close.toDouble()
            val range = h - l
            if (!range.isFinite() || range <= 0.0) continue

            var localAtr = atrSeries[i]
            if (localAtr == null || localAtr <= 0.0) {
                val start = max(0, i - 4)
                var sumR = 0.0
                for (j in start..i) {
                    sumR += max(0.0, candles[j].high.toDouble() - candles[j].low.toDouble())
                }
                localAtr = sumR / (i - start + 1).toDouble()
            }
            if (localAtr <= 0.0) continue
            val rangeAtrRatio = range / localAtr
            if (rangeAtrRatio < 0.25) continue

            val body = abs(cl - o)
            val upperWick = h - max(o, cl)
            val lowerWick = min(o, cl) - l
            val bodyRatio = body / range
            val upperWickRatio = upperWick / range
            val lowerWickRatio = lowerWick / range
            val openMs = c.openTimeUtcMillis

            var singleType: String? = null
            var singleDir = 0
            var singleShort = ""
            when {
                bodyRatio <= 0.10 && upperWickRatio >= 0.25 && lowerWickRatio >= 0.25 -> {
                    singleType = "DOJI"
                    singleDir = 0
                    singleShort = "DOJ"
                }
                bodyRatio <= 0.35 && lowerWick >= body * 2.0 && upperWickRatio <= 0.15 && cl >= l + 0.65 * range -> {
                    singleType = "HAMMER"
                    singleDir = 1
                    singleShort = "HAM"
                }
                bodyRatio <= 0.35 && upperWick >= body * 2.0 && lowerWickRatio <= 0.15 && cl <= h - 0.65 * range -> {
                    singleType = "SHOOTING_STAR"
                    singleDir = -1
                    singleShort = "STR"
                }
                lowerWickRatio >= 0.62 && bodyRatio <= 0.30 && upperWickRatio <= 0.20 -> {
                    singleType = "BULLISH_PIN_BAR"
                    singleDir = 1
                    singleShort = "PIN"
                }
                upperWickRatio >= 0.62 && bodyRatio <= 0.30 && lowerWickRatio <= 0.20 -> {
                    singleType = "BEARISH_PIN_BAR"
                    singleDir = -1
                    singleShort = "PIN"
                }
            }

            if (singleType != null) {
                patterns.add(
                    CandlestickPattern(
                        patternId = "${singleType}_${openMs}",
                        type = singleType,
                        shortLabel = singleShort,
                        direction = singleDir,
                        anchorIndex = i,
                        anchorTimeUtcMs = openMs,
                        candleIndices = listOf(i),
                        candleTimesUtcMs = listOf(openMs),
                        priceLow = l,
                        priceHigh = h,
                        markerPrice = if (singleDir >= 0) l else h,
                        evidence = PatternEvidence(
                            bodyRatio = bodyRatio,
                            upperWickRatio = upperWickRatio,
                            lowerWickRatio = lowerWickRatio,
                            rangeAtrRatio = rangeAtrRatio
                        )
                    )
                )
            }

            if (i >= 1) {
                val prev = candles[i - 1]
                val po = prev.open.toDouble()
                val ph = prev.high.toDouble()
                val pl = prev.low.toDouble()
                val pcl = prev.close.toDouble()
                val prevRange = ph - pl
                val prevBody = abs(pcl - po)
                val prevOpenMs = prev.openTimeUtcMillis

                if (prevRange > 0.0 && prevBody >= 0.15 * prevRange && body >= prevBody * 1.05) {
                    if (pcl < po && cl > o && o <= pcl && cl >= po) {
                        patterns.add(
                            CandlestickPattern(
                                patternId = "BULLISH_ENGULFING_${openMs}",
                                type = "BULLISH_ENGULFING",
                                shortLabel = "ENG",
                                direction = 1,
                                anchorIndex = i,
                                anchorTimeUtcMs = openMs,
                                candleIndices = listOf(i - 1, i),
                                candleTimesUtcMs = listOf(prevOpenMs, openMs),
                                priceLow = min(pl, l),
                                priceHigh = max(ph, h),
                                markerPrice = l,
                                evidence = PatternEvidence(
                                    bodyRatio = bodyRatio,
                                    upperWickRatio = upperWickRatio,
                                    lowerWickRatio = lowerWickRatio,
                                    rangeAtrRatio = rangeAtrRatio
                                )
                            )
                        )
                    } else if (pcl > po && cl < o && o >= pcl && cl <= po) {
                        patterns.add(
                            CandlestickPattern(
                                patternId = "BEARISH_ENGULFING_${openMs}",
                                type = "BEARISH_ENGULFING",
                                shortLabel = "ENG",
                                direction = -1,
                                anchorIndex = i,
                                anchorTimeUtcMs = openMs,
                                candleIndices = listOf(i - 1, i),
                                candleTimesUtcMs = listOf(prevOpenMs, openMs),
                                priceLow = min(pl, l),
                                priceHigh = max(ph, h),
                                markerPrice = h,
                                evidence = PatternEvidence(
                                    bodyRatio = bodyRatio,
                                    upperWickRatio = upperWickRatio,
                                    lowerWickRatio = lowerWickRatio,
                                    rangeAtrRatio = rangeAtrRatio
                                )
                            )
                        )
                    }
                }
            }
        }

        return patterns
    }

    /**
     * Phases E & F — Canonical Analysis Result (`ta-core/1.1`) unifying data quality, core indicators,
     * causal market structures (swings + trend + S/R zones), and candlestick patterns.
     */
    fun buildCanonicalAnalysis(
        rawCandles: List<CandleBar>,
        timeframe: String = "M15",
        symbolCode: String = "SPOTBRENT",
        swingLen: Int = 3,
        bollingerPeriod: Int = 20,
        bollingerStdDev: Double = 2.0,
        excludeOpenBars: Boolean = false
    ): CanonicalAnalysisResult {
        val normTf = timeframe.uppercase()
        val normSym = symbolCode.uppercase()
        val normalized = normalizeCandles(rawCandles, normTf, normSym, excludeOpenBars)
        val candles = normalized.candles
        val core = computeCoreIndicators(
            rawCandles = candles,
            timeframe = normTf,
            symbolCode = normSym,
            bollingerPeriod = bollingerPeriod,
            bollingerStdDev = bollingerStdDev,
            excludeOpenBars = false
        )
        val swingRes = detectSwingsAndTrend(candles, swingLen)
        val zones = detectSupportResistanceZones(candles, swingLen, 14)
        val patterns = detectCandlestickPatterns(candles, 14)

        return CanonicalAnalysisResult(
            schemaVersion = SCHEMA_VERSION,
            symbolCode = normSym,
            timeframe = normTf,
            quality = normalized.quality,
            timestamps = core.timestamps,
            indicators = core,
            structures = CanonicalStructureBundle(
                swingLen = swingRes.swingLen,
                trend = swingRes.trend,
                trendReason = swingRes.trendReason,
                swings = swingRes.swings,
                zones = zones
            ),
            patterns = patterns
        )
    }

    /**
     * Phase B–E Renderer Decoupling — Computes only enabled indicator overlays, oscillators,
     * S/R Zones, and Candlestick Patterns outside `CandlestickCanvas`.
     */
    fun computeChartBundle(
        tab: ChartTabState,
        preferences: ChartPreferences
    ): ChartAnalysisBundle {
        val candles = tab.candles
        if (candles.isEmpty()) return ChartAnalysisBundle()
        val closes = candles.map { it.close.toDouble() }
        val bbPeriod = preferences.bollingerPeriod.coerceIn(5, 200)
        val bbStdDev = preferences.bollingerStdDev.coerceIn(0.5f, 5.0f).toDouble()

        return ChartAnalysisBundle(
            fullSma20 = if (tab.showSma20) PriceFormatterAlgorithm.computeSmaValues(closes, 20) else emptyList(),
            fullSma50 = if (tab.showSma50) PriceFormatterAlgorithm.computeSmaValues(closes, 50) else emptyList(),
            fullSma200 = if (tab.showSma200) PriceFormatterAlgorithm.computeSmaValues(closes, 200) else emptyList(),
            fullEma20 = if (tab.showEma20) PriceFormatterAlgorithm.computeEmaValues(closes, 20) else emptyList(),
            fullEma50 = if (tab.showEma50) PriceFormatterAlgorithm.computeEmaValues(closes, 50) else emptyList(),
            fullEma200 = if (tab.showEma200 && closes.size >= 200) PriceFormatterAlgorithm.computeEmaValues(closes, 200) else emptyList(),
            fullBollinger = if (tab.showBollinger) PriceFormatterAlgorithm.computeBollingerBands(closes, bbPeriod, bbStdDev) else emptyList(),
            fullSupertrend = if (tab.showSupertrend) PriceFormatterAlgorithm.computeSupertrendValues(candles, 10, 3.0) else emptyList(),
            fullVwap = if (tab.showVwap) PriceFormatterAlgorithm.computeVwapValues(candles, tab.timeframe, tab.symbolCode) else emptyList(),
            fullRsi14 = if (tab.showRsi14) PriceFormatterAlgorithm.computeRsiValues(closes, 14) else emptyList(),
            fullMacd = if (tab.showMacd || tab.showOverlayMacd) PriceFormatterAlgorithm.computeMacdValues(closes, 12, 26, 9) else emptyList(),
            fullAtr14 = if (tab.showAtr14) PriceFormatterAlgorithm.computeAtrValues(candles, 14) else emptyList(),
            fullSmcResult = if (tab.showSmcStructure || tab.showFvg) PriceFormatterAlgorithm.detectSmcMarketStructures(candles, 3) else null,
            fullPsar = if (tab.showPsar && candles.size >= 2) Phase2IndicatorsAlgorithm.computeParabolicSar(candles, 0.02, 0.20) else emptyList(),
            fullIchimoku = if (tab.showIchimoku) Phase2IndicatorsAlgorithm.computeIchimoku(candles, 9, 26, 52, 26) else null,
            fullKeltner = if (tab.showKeltner) Phase2IndicatorsAlgorithm.computeKeltnerChannels(candles, 20, 10, 2.0) else emptyList(),
            fullDonchian = if (tab.showDonchian) Phase2IndicatorsAlgorithm.computeDonchianChannels(candles, 20) else emptyList(),
            fullMtfEma = if (tab.showMtfEma) Phase2IndicatorsAlgorithm.computeMtfEma(candles, tab.timeframe, 20, tab.symbolCode) else emptyList(),
            fullAdx14 = if (tab.showAdx14) Phase2IndicatorsAlgorithm.computeAdxDmi(candles, 14) else emptyList(),
            fullStoch14 = if (tab.showStoch14) Phase2IndicatorsAlgorithm.computeStochastic(candles, 14, 3, 3) else emptyList(),
            fullCci20 = if (tab.showCci20) Phase2IndicatorsAlgorithm.computeCci(candles, 20) else emptyList(),
            fullWillR14 = if (tab.showWillR14) Phase2IndicatorsAlgorithm.computeWilliamsR(candles, 14) else emptyList(),
            fullObv = if (tab.showObv) Phase2IndicatorsAlgorithm.computeObv(candles) else emptyList(),
            fullCmf20 = if (tab.showCmf20) Phase2IndicatorsAlgorithm.computeCmf(candles, 20) else emptyList(),
            fullRoc12 = if (tab.showRoc12) Phase2IndicatorsAlgorithm.computeRoc(closes, 12) else emptyList(),
            pivotPoints = if (tab.showPivotPoints && candles.size >= 2) {
                Phase2IndicatorsAlgorithm.computePivotPoints(candles, tab.timeframe, tab.symbolCode, tab.pivotType)
            } else {
                null
            },
            srZones = if (tab.showSrZones) detectSupportResistanceZones(candles, 3, 14) else emptyList(),
            candlePatterns = if (tab.showCandlePatterns) detectCandlestickPatterns(candles, 14) else emptyList()
        )
    }
}
