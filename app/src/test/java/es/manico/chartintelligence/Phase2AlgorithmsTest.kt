package es.manico.chartintelligence

import android.content.Context
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import es.manico.chartintelligence.algorithms.CandleExportAlgorithm
import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.algorithms.DrawingGeometryAlgorithm
import es.manico.chartintelligence.algorithms.GapDetectorAlgorithm
import es.manico.chartintelligence.algorithms.KillzoneSession
import es.manico.chartintelligence.algorithms.Phase2IndicatorsAlgorithm
import es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartDrawing
import es.manico.chartintelligence.data.model.DrawingAnchor
import es.manico.chartintelligence.data.model.DrawingTool
import es.manico.chartintelligence.data.repository.WorkspaceRepository
import es.manico.chartintelligence.ui.state.coordinators.SymbolCatalogCoordinator
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneOffset
import java.time.ZonedDateTime

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class Phase2AlgorithmsTest {

    private fun makeBar(
        openMs: Long,
        tf: String,
        open: Double,
        high: Double,
        low: Double,
        close: Double,
        volume: Double = 100.0
    ): CandleBar = CandleValidatorAlgorithm.sanitizeAndValidate(
        rawOpenTimeMillis = openMs,
        timeframe = tf,
        open = BigDecimal.valueOf(open),
        high = BigDecimal.valueOf(high),
        low = BigDecimal.valueOf(low),
        close = BigDecimal.valueOf(close),
        volume = BigDecimal.valueOf(volume)
    )!!

    @Test
    fun eng01_sessionBucketAlignmentAndDstTransitions() {
        // Winter (EST, UTC-5): 2026-01-15 15:00 UTC = 10:00 AM NY
        val winterMs = Instant.parse("2026-01-15T15:00:00Z").toEpochMilli()
        val winterEqD1 = UtcTimeAnchorAlgorithm.getSessionBucketBounds(winterMs, "D1", "AAPL")
        assertTrue(winterEqD1.sessionAnchored)
        assertEquals(Instant.parse("2026-01-15T14:30:00Z").toEpochMilli(), winterEqD1.openMs)
        assertEquals(Instant.parse("2026-01-15T21:00:00Z").toEpochMilli(), winterEqD1.closeMs)

        // Summer (EDT, UTC-4): 2026-07-15 15:00 UTC = 11:00 AM NY
        val summerMs = Instant.parse("2026-07-15T15:00:00Z").toEpochMilli()
        val summerEqD1 = UtcTimeAnchorAlgorithm.getSessionBucketBounds(summerMs, "D1", "AAPL")
        assertTrue(summerEqD1.sessionAnchored)
        assertEquals(Instant.parse("2026-07-15T13:30:00Z").toEpochMilli(), summerEqD1.openMs)
        assertEquals(Instant.parse("2026-07-15T20:00:00Z").toEpochMilli(), summerEqD1.closeMs)

        // US Equities H4 splits RTH at 13:30 NY
        val summerAfternoonMs = Instant.parse("2026-07-15T18:00:00Z").toEpochMilli() // 14:00 EDT
        val eqH4Morning = UtcTimeAnchorAlgorithm.getSessionBucketBounds(summerMs, "H4", "NVDA")
        val eqH4Afternoon = UtcTimeAnchorAlgorithm.getSessionBucketBounds(summerAfternoonMs, "H4", "NVDA")
        assertNotEquals(eqH4Morning.openMs, eqH4Afternoon.openMs)
        assertEquals(eqH4Morning.closeMs, eqH4Afternoon.openMs)

        // OTC FX/Metals D1 rollover at 17:00 NY
        val fxWinterRollover = UtcTimeAnchorAlgorithm.getSessionBucketBounds(winterMs, "D1", "XAUUSD")
        assertTrue(fxWinterRollover.sessionAnchored)
        assertEquals(Instant.parse("2026-01-14T22:00:00Z").toEpochMilli(), fxWinterRollover.openMs)
        assertEquals(Instant.parse("2026-01-15T22:00:00Z").toEpochMilli(), fxWinterRollover.closeMs)

        // Crypto 24/7 stays strictly UTC 00:00
        val cryptoD1 = UtcTimeAnchorAlgorithm.getSessionBucketBounds(summerMs, "D1", "BTCUSD")
        assertFalse(cryptoD1.sessionAnchored)
        assertEquals(Instant.parse("2026-07-15T00:00:00Z").toEpochMilli(), cryptoD1.openMs)

        // Rollover day key flips at 22:00 UTC in EST winter for XAUUSD
        val beforeRollover = Instant.parse("2026-01-15T21:45:00Z").toEpochMilli()
        val afterRollover = Instant.parse("2026-01-15T22:15:00Z").toEpochMilli()
        assertEquals("2026-01-15", UtcTimeAnchorAlgorithm.getSessionDayKey(beforeRollover, "XAUUSD"))
        assertEquals("2026-01-16", UtcTimeAnchorAlgorithm.getSessionDayKey(afterRollover, "XAUUSD"))
    }

    @Test
    fun eng03_gapDetector_detectsMissingBarsWithoutFalseWeekendPositives() {
        val m15Step = 15L * 60_000L
        val cryptoStart = Instant.parse("2026-11-05T00:00:00Z").toEpochMilli()
        val cleanCryptoBars = (0 until 12).map { i ->
            makeBar(cryptoStart + i * m15Step, "M15", 90000.0 + i, 90010.0 + i, 89990.0 + i, 90005.0 + i)
        }
        val cleanReport = GapDetectorAlgorithm.detectGaps(cleanCryptoBars, "M15", "BTCUSD")
        assertEquals("CLEAN", cleanReport.status)
        assertEquals(0, cleanReport.gapCount)
        assertEquals(0, cleanReport.totalMissingBars)
        assertEquals(1.0, cleanReport.integrityRatio, 1e-4)

        // OTC weekend closure: Friday 2026-11-06 21:30, 21:45 UTC -> Sunday 2026-11-08 22:00, 22:15 UTC
        val friday2130 = Instant.parse("2026-11-06T21:30:00Z").toEpochMilli()
        val sunday2200 = Instant.parse("2026-11-08T22:00:00Z").toEpochMilli()
        val weekendSpanBars = listOf(
            makeBar(friday2130, "M15", 2700.0, 2705.0, 2698.0, 2702.0),
            makeBar(friday2130 + m15Step, "M15", 2702.0, 2706.0, 2700.0, 2704.0),
            makeBar(sunday2200, "M15", 2705.0, 2708.0, 2703.0, 2706.0),
            makeBar(sunday2200 + m15Step, "M15", 2706.0, 2709.0, 2704.0, 2707.0)
        )
        val weekendReport = GapDetectorAlgorithm.detectGaps(weekendSpanBars, "M15", "XAUUSD")
        assertEquals("CLEAN", weekendReport.status)
        assertEquals(0, weekendReport.gapCount)

        // Weekday missing 3 consecutive M15 bars on XAUUSD (Wednesday 10:00 -> 11:00 missing 10:15, 10:30, 10:45)
        val wedStart = Instant.parse("2026-11-04T10:00:00Z").toEpochMilli()
        val gappedOtc = listOf(
            makeBar(wedStart, "M15", 2700.0, 2702.0, 2699.0, 2701.0),
            makeBar(wedStart + 4 * m15Step, "M15", 2703.0, 2705.0, 2701.0, 2704.0)
        )
        val gapReport = GapDetectorAlgorithm.detectGaps(gappedOtc, "M15", "XAUUSD")
        assertEquals(1, gapReport.gapCount)
        assertEquals(3, gapReport.totalMissingBars)
        assertEquals("DEGRADED", gapReport.status)
        assertTrue(gapReport.integrityRatio < 1.0)
    }

    @Test
    fun sec01_symbolSanitizer_stripsInjectionAndInvalidCharacters() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val coordinator = SymbolCatalogCoordinator(WorkspaceRepository(context))

        assertEquals("AAPL.US", coordinator.sanitizeSymbolCode("  aapl.us  "))
        assertEquals("BRENT:UKOIL-1", coordinator.sanitizeSymbolCode("brent:ukoil-1"))
        val sanitizedXss = coordinator.sanitizeSymbolCode("  btc/usd <script>alert(1)</script> ")
        assertFalse(sanitizedXss.contains("<"))
        assertFalse(sanitizedXss.contains(">"))
        assertFalse(sanitizedXss.contains("/"))
        assertFalse(sanitizedXss.contains(" "))
        assertTrue(sanitizedXss.length <= 20)
        assertTrue(sanitizedXss.matches(Regex("^[A-Z0-9._:-]+$")))
    }

    @Test
    fun sec23_candleExportCsvJsonAndSeasonalsGate() {
        // 11 distinct months -> strictly gated (< 12 months)
        val insufficientD1 = (1..11).map { m ->
            val ts = ZonedDateTime.of(2025, m, 2, 0, 0, 0, 0, ZoneOffset.UTC).toInstant().toEpochMilli()
            makeBar(ts, "D1", 100.0, 106.0, 99.0, 105.0, 500.0)
        }
        val gatedReport = CandleExportAlgorithm.computeMultiYearSeasonals(insufficientD1)
        assertFalse(gatedReport.hasSufficientData)
        assertEquals(11, gatedReport.distinctMonthCount)
        assertTrue(gatedReport.cells.isEmpty())

        // 14 distinct months spanning 2025 & 2026 -> enabled
        val fullD1 = ArrayList<CandleBar>()
        for (m in 1..12) {
            val ts = ZonedDateTime.of(2025, m, 2, 0, 0, 0, 0, ZoneOffset.UTC).toInstant().toEpochMilli()
            fullD1.add(makeBar(ts, "D1", 100.0, 112.0, 98.0, 110.0, 600.0)) // +10%
        }
        for (m in 1..2) {
            val ts = ZonedDateTime.of(2026, m, 2, 0, 0, 0, 0, ZoneOffset.UTC).toInstant().toEpochMilli()
            fullD1.add(makeBar(ts, "D1", 100.0, 102.0, 88.0, 90.0, 700.0)) // -10%
        }
        val report = CandleExportAlgorithm.computeMultiYearSeasonals(fullD1)
        assertTrue(report.hasSufficientData)
        assertEquals(14, report.distinctMonthCount)
        assertEquals(2, report.yearCount)
        assertEquals(10.0, report.cells[2025 to 1]!!, 0.01)
        assertEquals(-10.0, report.cells[2026 to 1]!!, 0.01)
        val janStat = report.monthlyStats.first { it.month == 1 }
        assertEquals(2, janStat.sampleYears)
        assertEquals(0.0, janStat.avgReturnPct, 0.01) // (+10 + -10) / 2
        assertEquals(50.0, janStat.winRatePct, 0.01)

        // CSV + JSON Export
        val csv = CandleExportAlgorithm.formatCandlesCsv("XAUUSD", "twelve_data", "D1", insufficientD1.take(2))
        val csvLines = csv.trim().lines()
        assertEquals(3, csvLines.size)
        assertEquals("symbol,provider,timeframe,open_time_utc_ms,open_time_utc_iso,open,high,low,close,volume", csvLines.first())
        assertTrue(csvLines[1].startsWith("XAUUSD,twelve_data,D1,"))

        val jsonStr = CandleExportAlgorithm.formatCandlesJson("XAUUSD", "twelve_data", "D1", insufficientD1.take(2))
        val parsed = JSONObject(jsonStr)
        assertEquals("ci_candles_export_v1", parsed.getString("schema"))
        assertEquals(2, parsed.getInt("count"))
        assertEquals(2, parsed.getJSONArray("candles").length())
    }

    @Test
    fun sec22_phase2Indicators_psarIchimokuKeltnerDonchianMtfEmaKillzonesAndOscillators() {
        val stepMs = 15L * 60_000L
        val startMs = Instant.parse("2026-11-02T00:00:00Z").toEpochMilli() // Monday 00:00 UTC
        val bars = (0 until 120).map { i ->
            val wave = if (i < 60) i * 2.0 else (120 - i) * 1.5 + 30.0
            val o = 2700.0 + wave
            val c = o + if (i % 3 == 0) -1.2 else 2.4
            val h = maxOf(o, c) + 3.0
            val l = minOf(o, c) - 2.5
            makeBar(startMs + i * stepMs, "M15", o, h, l, c, 100.0 + i * 5.0)
        }
        val closes = bars.map { it.close.toDouble() }

        val psar = Phase2IndicatorsAlgorithm.computeParabolicSar(bars)
        assertNull(psar[0])
        assertNotNull(psar[1])
        assertTrue(psar.last()!!.sar > 0.0)

        val ichi = Phase2IndicatorsAlgorithm.computeIchimoku(bars)
        assertNull(ichi.tenkan[7])
        assertNotNull(ichi.tenkan[8])
        assertNotNull(ichi.kijun[25])
        assertNull(ichi.senkouA[25])
        assertNotNull(ichi.senkouA[51])
        assertNotNull(ichi.chikou[0])
        assertNull(ichi.chikou[bars.lastIndex])

        val keltner = Phase2IndicatorsAlgorithm.computeKeltnerChannels(bars, 20, 10, 2.0)
        val lastKc = keltner.last()!!
        assertTrue(lastKc.upper > lastKc.middle && lastKc.middle > lastKc.lower)

        val donchian = Phase2IndicatorsAlgorithm.computeDonchianChannels(bars, 20)
        val lastDc = donchian.last()!!
        assertTrue(lastDc.upper >= lastDc.middle && lastDc.middle >= lastDc.lower)
        val expected20High = bars.takeLast(20).maxOf { it.high.toDouble() }
        val expected20Low = bars.takeLast(20).minOf { it.low.toDouble() }
        assertEquals(expected20High, lastDc.upper, 1e-6)
        assertEquals(expected20Low, lastDc.lower, 1e-6)

        // Strict Non-Lookahead MTF EMA: 120 M15 bars = 30 H1 bars -> EMA(20) only appears after 20 closed H1 bars (index >= 79)
        val mtfEma = Phase2IndicatorsAlgorithm.computeMtfEma(bars, "M15", 20, "BTCUSD")
        assertTrue(mtfEma.take(70).all { it == null })
        assertNotNull(mtfEma.last())
        // During H1 bar #20 (indices 80..83), EMA remains constant for bars 80..82 until bar 83 closes the H1 bucket
        assertEquals(mtfEma[79], mtfEma[80])
        assertEquals(mtfEma[80], mtfEma[81])
        assertEquals(mtfEma[81], mtfEma[82])

        // Killzones UTC classification
        assertEquals(KillzoneSession.ASIA, Phase2IndicatorsAlgorithm.classifyKillzoneUtcHour(3))
        assertEquals(KillzoneSession.LONDON, Phase2IndicatorsAlgorithm.classifyKillzoneUtcHour(9))
        assertEquals(KillzoneSession.OVERLAP, Phase2IndicatorsAlgorithm.classifyKillzoneUtcHour(14))
        assertEquals(KillzoneSession.NEW_YORK, Phase2IndicatorsAlgorithm.classifyKillzoneUtcHour(18))
        assertNull(Phase2IndicatorsAlgorithm.classifyKillzoneUtcHour(23))

        // Oscillators
        val adx = Phase2IndicatorsAlgorithm.computeAdxDmi(bars, 14)
        val lastAdx = adx.last()!!
        assertTrue(lastAdx.adx in 0.0..100.0)
        assertTrue(lastAdx.plusDi >= 0.0 && lastAdx.minusDi >= 0.0)

        val stoch = Phase2IndicatorsAlgorithm.computeStochastic(bars, 14, 3, 3)
        val lastStoch = stoch.last()!!
        assertTrue(lastStoch.k in 0.0..100.0)
        assertNotNull(lastStoch.d)

        val cci = Phase2IndicatorsAlgorithm.computeCci(bars, 20)
        assertNotNull(cci.last())
        assertTrue(cci.last()!!.isFinite())

        val willR = Phase2IndicatorsAlgorithm.computeWilliamsR(bars, 14)
        assertTrue(willR.last()!! in -100.0..0.0)

        val obv = Phase2IndicatorsAlgorithm.computeObv(bars)
        assertEquals(bars.size, obv.size)

        val cmf = Phase2IndicatorsAlgorithm.computeCmf(bars, 20)
        assertTrue(cmf.last()!! in -1.0..1.0)

        val roc = Phase2IndicatorsAlgorithm.computeRoc(closes, 12)
        val expectedLastRoc = ((closes.last() - closes[closes.size - 13]) / closes[closes.size - 13]) * 100.0
        assertEquals(expectedLastRoc, roc.last()!!, 1e-6)
    }

    @Test
    fun sec21_drawingGeometry_phase2MultiAnchorToolsAndPitchforkVariants() {
        val phase2Tools = DrawingTool.entries.filter { it.isPhase2MultiAnchor }
        assertEquals(12, phase2Tools.size)
        assertEquals(1, DrawingTool.AVWAP.requiredAnchors)
        assertEquals(3, DrawingTool.PITCHFORK.requiredAnchors)
        assertEquals(4, DrawingTool.ABCD_PATTERN.requiredAnchors)
        assertEquals(5, DrawingTool.XABCD_PATTERN.requiredAnchors)
        assertEquals(5, DrawingTool.HEAD_SHOULDERS.requiredAnchors)

        val stepMs = 15L * 60_000L
        val t0 = Instant.parse("2026-11-04T00:00:00Z").toEpochMilli()
        val bars = (0 until 10).map { i ->
            makeBar(t0 + i * stepMs, "M15", 100.0 + i, 102.0 + i, 99.0 + i, 101.0 + i, 200.0)
        }

        val avwap = DrawingGeometryAlgorithm.computeAnchoredVwap(bars, t0 + 3 * stepMs)
        assertEquals(7, avwap.size)
        assertEquals(t0 + 3 * stepMs, avwap.first().first)
        val bar3Tp = ((102.0 + 3) + (99.0 + 3) + (101.0 + 3)) / 3.0
        assertEquals(bar3Tp, avwap.first().second, 1e-6)

        val reg = DrawingGeometryAlgorithm.computeRegressionChannel(bars, t0, t0 + 9 * stepMs, 100.0, 110.0)
        assertEquals(10, reg.barCount)
        assertEquals(1.0, reg.slope, 1e-4)
        assertEquals(0.0, reg.stdDev, 1e-4)

        assertEquals(9, DrawingGeometryAlgorithm.gannAngleSpecs().size)

        // All 4 Pitchfork variants produce distinct handles
        val pfAnchors = listOf(
            DrawingAnchor(t0, BigDecimal("100.00")),
            DrawingAnchor(t0 + 4 * stepMs, BigDecimal("120.00")),
            DrawingAnchor(t0 + 8 * stepMs, BigDecimal("108.00"))
        )
        val pfOrig = DrawingGeometryAlgorithm.computePitchforkGeometry(pfAnchors, "original")!!
        val pfSchiff = DrawingGeometryAlgorithm.computePitchforkGeometry(pfAnchors, "schiff")!!
        val pfMod = DrawingGeometryAlgorithm.computePitchforkGeometry(pfAnchors, "mod_schiff")!!
        val pfInside = DrawingGeometryAlgorithm.computePitchforkGeometry(pfAnchors, "inside")!!
        assertEquals(pfAnchors[0].timeUtcMillis, pfOrig.handle.timeUtcMillis)
        assertEquals(110.0, pfSchiff.handle.price, 1e-6)
        assertEquals(t0 + 2 * stepMs, pfMod.handle.timeUtcMillis)
        assertEquals((100.0 + 120.0 + 108.0) / 3.0, pfInside.handle.price, 1e-6)

        val fibZones = DrawingGeometryAlgorithm.computeFibTimeZones(t0, t0 + stepMs, stepMs)
        assertEquals(10, fibZones.size)
        assertEquals(55, fibZones.last().first)

        val xabcdAnchors = listOf(
            DrawingAnchor(t0, BigDecimal("100.00")),
            DrawingAnchor(t0 + 1 * stepMs, BigDecimal("200.00")),
            DrawingAnchor(t0 + 2 * stepMs, BigDecimal("138.20")),
            DrawingAnchor(t0 + 3 * stepMs, BigDecimal("188.60")),
            DrawingAnchor(t0 + 4 * stepMs, BigDecimal("121.40"))
        )
        val ratios = DrawingGeometryAlgorithm.computeHarmonicRatios(xabcdAnchors)
        assertEquals(0.618, ratios.abXa, 1e-3)
        assertEquals(0.786, ratios.adXa, 1e-3)

        // Hit-test & translation on MultiAnchor drawing
        val pfDrawing = ChartDrawing.MultiAnchor(
            id = "pf_1",
            toolType = DrawingTool.PITCHFORK,
            anchors = pfAnchors,
            variant = "schiff"
        )
        val hit = DrawingGeometryAlgorithm.hitTestDrawing(
            drawings = listOf(pfDrawing),
            tapX = 100f,
            tapY = 100f,
            timeToX = { t -> if (t == pfAnchors[0].timeUtcMillis) 100f else 300f },
            priceToY = { p -> if (p == 100.0) 100f else 250f },
            hitTolerancePx = 20f
        )
        assertNotNull(hit)

        val moved = DrawingGeometryAlgorithm.translateDrawing(
            drawing = pfDrawing,
            deltaTimeMillis = stepMs,
            deltaPrice = BigDecimal("5.00")
        ) as ChartDrawing.MultiAnchor
        assertEquals(t0 + stepMs, moved.anchors[0].timeUtcMillis)
        assertEquals(105.0, moved.anchors[0].price.toDouble(), 1e-4)
    }

    @Test
    fun qa01_par01_sync01_eng01b_eng03b_ind01_pred09_pred10_crossPlatformParity() {
        // 1. PAR-01: Price Basis for SPOTBRENT on TVDATAFEED is strictly "CFD Feed"
        assertEquals(
            "CFD Feed",
            UtcTimeAnchorAlgorithm.resolvePriceBasis(
                "SPOTBRENT",
                es.manico.chartintelligence.data.model.ProviderId.TVDATAFEED
            )
        )

        // 2. ENG-01b: Custom symbol calendar detection, US Equities H1 (:30 ET), DST-aware OTC weekend, and Contiguity
        assertEquals(
            es.manico.chartintelligence.algorithms.SessionCalendar.CRYPTO_24_7,
            UtcTimeAnchorAlgorithm.getSessionCalendar("DOGEUSD")
        )
        assertEquals(
            es.manico.chartintelligence.algorithms.SessionCalendar.US_EQUITIES,
            UtcTimeAnchorAlgorithm.getSessionCalendar("NAS100")
        )
        val eqH1Summer = UtcTimeAnchorAlgorithm.getSessionBucketBounds(
            Instant.parse("2026-07-15T14:10:00Z").toEpochMilli(), // 10:10 EDT
            "H1",
            "AAPL"
        )
        assertTrue(eqH1Summer.sessionAnchored)
        assertEquals(Instant.parse("2026-07-15T13:30:00Z").toEpochMilli(), eqH1Summer.openMs)
        assertEquals(Instant.parse("2026-07-15T14:30:00Z").toEpochMilli(), eqH1Summer.closeMs)

        // DST-aware OTC weekend: Friday 17:15 EDT (21:15 UTC in summer) is closed
        val friSummer2115Utc = Instant.parse("2026-07-17T21:15:00Z").toEpochMilli()
        assertTrue(UtcTimeAnchorAlgorithm.isOtcWeekendClosed(friSummer2115Utc))

        // TimeframeAggregator preserves session-anchored open time & skips non-contiguous middle bucket
        val m15Step = 15L * 60_000L
        val mon1330Edt = Instant.parse("2026-07-13T13:30:00Z").toEpochMilli()
        val contiguousM15 = (0 until 8).map { i ->
            makeBar(mon1330Edt + i * m15Step, "M15", 200.0 + i, 202.0 + i, 199.0 + i, 201.0 + i, 1000.0)
        }
        val aggH1 = es.manico.chartintelligence.algorithms.TimeframeAggregatorAlgorithm.aggregateCandles(
            sourceCandles = contiguousM15,
            targetTimeframe = "H1",
            sourceTimeframe = "M15",
            symbolCode = "AAPL"
        )
        assertEquals(2, aggH1.size)
        assertEquals(mon1330Edt, aggH1[0].openTimeUtcMillis)

        // 3. ENG-03b: Comb filter exempts CRYPTO_24_7 and removes flat 0-vol spikes on OTC
        val cryptoFlatBars = (0 until 6).map { i ->
            makeBar(mon1330Edt + i * m15Step, "M15", 90000.0, 90000.01, 90000.0, 90000.0, 0.0)
        }
        val filteredCrypto = CandleValidatorAlgorithm.filterSyntheticWeekendAndCombCandles(
            cryptoFlatBars,
            "BTCUSD",
            "M15"
        )
        assertEquals(6, filteredCrypto.size)

        // 4. IND-01 & PRED-09/PRED-10: Pivot Points and 30-Period Future Candlestick Projection across all timeframes
        val sampleBars = (0 until 60).map { i ->
            val o = 2700.0 + i * 1.5
            makeBar(mon1330Edt + i * m15Step, "M15", o, o + 4.0, o - 3.0, o + 1.2, 500.0 + i * 10.0)
        }
        val pivots = Phase2IndicatorsAlgorithm.computePivotPoints(sampleBars, "M15", "XAUUSD")
        assertNotNull(pivots)
        assertTrue(pivots!!.r2 > pivots.r1 && pivots.r1 > pivots.p && pivots.p > pivots.s1 && pivots.s1 > pivots.s2)

        for (tf in listOf("M15", "M30", "H1", "H4", "D1", "W1")) {
            val projected = Phase2IndicatorsAlgorithm.computeFutureCandlestickProjection(sampleBars, tf, 30)
            assertEquals("Expected 30 projected bars (>= 10) for $tf", 30, projected.size)
            assertTrue(projected.size >= 10)
            assertEquals(1, projected.first().stepAhead)
            assertEquals(30, projected.last().stepAhead)
            assertTrue(projected.all { it.high >= maxOf(it.open, it.close) && it.low <= minOf(it.open, it.close) })
        }

        // 5. SYNC-01: WorkspaceRepository round-trip persistence of volumePaneRatio=0.16f, timezoneMode=LOCAL, and indicators
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repo = WorkspaceRepository(context)
        val prefs = repo.loadChartPreferences().copy(
            timezoneMode = "LOCAL",
            bollingerPeriod = 30,
            bollingerStdDev = 2.5f
        )
        repo.saveChartPreferences(prefs)
        val tab = es.manico.chartintelligence.data.model.ChartTabState(
            tabId = "XAUUSD_twelve_data",
            chartId = "XAUUSD_H1",
            symbolCode = "XAUUSD",
            decimals = 2,
            provider = es.manico.chartintelligence.data.model.ProviderId.TWELVE_DATA,
            timeframe = "H1",
            volumePaneRatio = 0.16f,
            showRsi14 = true,
            showMacd = true,
            showOverlayMacd = true,
            showPivotPoints = true,
            showFutureProjection = true
        )
        val wsJson = repo.buildWorkspaceJson(repo.loadSymbolCatalog(), prefs, emptyMap(), listOf(tab))
        // Simulate resetting local state and applying cloud workspace JSON
        repo.saveChartPreferences(repo.loadChartPreferences().copy(timezoneMode = "UTC"))
        assertTrue(repo.applyCloudWorkspaceToLocal(wsJson))
        val hydratedPrefs = repo.loadChartPreferences()
        assertEquals("LOCAL", hydratedPrefs.timezoneMode)
        assertEquals(30, hydratedPrefs.bollingerPeriod)
        assertEquals(2.5f, hydratedPrefs.bollingerStdDev, 1e-3f)
        val hydratedTabs = repo.loadSavedOpenTabs()
        assertEquals(1, hydratedTabs.size)
        val hydratedTab = hydratedTabs.first()
        assertEquals(0.16f, hydratedTab.volumePaneRatio, 1e-3f)
        assertTrue(hydratedTab.showRsi14)
        assertTrue(hydratedTab.showMacd)
        assertTrue(hydratedTab.showOverlayMacd)
        assertTrue(hydratedTab.showPivotPoints)
        assertTrue(hydratedTab.showFutureProjection)
    }

    @get:org.junit.Rule
    val composeTestRule = androidx.compose.ui.test.junit4.createComposeRule()

    @Test
    fun settingsScreen_rendersAndNavigatesTabsWithoutCrash() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repo = WorkspaceRepository(context)
        val symbols = repo.loadSymbolCatalog()
        val prefs = repo.loadChartPreferences()

        composeTestRule.setContent {
            es.manico.chartintelligence.ui.theme.ChartIntelligenceTheme(
                darkTheme = true,
                language = es.manico.chartintelligence.i18n.AppLanguage.FA
            ) {
                es.manico.chartintelligence.ui.screens.SettingsScreen(
                    currentLanguage = es.manico.chartintelligence.i18n.AppLanguage.FA,
                    isDarkTheme = true,
                    symbols = symbols,
                    ownerUsername = "mani",
                    ownerEmail = "mani@example.com",
                    statusBannerResId = null,
                    chartPreferences = prefs,
                    onLanguageSelected = {},
                    onThemeSelected = {},
                    onToggleSymbolInWatchlist = { _, _ -> },
                    onSelectProviderForSymbol = { _, _ -> },
                    onUpdatePassword = {},
                    onSignOut = {},
                    onBackToWatchlist = {},
                    onUpdateBullColor = {},
                    onUpdateBearColor = {},
                    onUpdateTrendColor = {},
                    onUpdateHLineColor = {},
                    onUpdateVLineColor = {},
                    onResetColors = {},
                    onUpdateAlgoParams = { _, _, _ -> },
                    onResetAlgoParams = {},
                    onAddCustomSymbol = { _, _, _, _ -> },
                    onDeleteSymbol = {}
                )
            }
        }
        composeTestRule.waitForIdle()
        for (tabKey in listOf("chart", "notifications", "theme", "account", "sync")) {
            composeTestRule.onNode(androidx.compose.ui.test.hasTestTag("settings_tab_$tabKey")).performClick()
            composeTestRule.waitForIdle()
        }
        composeTestRule.onNode(androidx.compose.ui.test.hasTestTag("explorer_mode_by_symbol")).performClick()
        composeTestRule.waitForIdle()
    }
}
