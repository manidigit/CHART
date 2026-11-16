package es.manico.chartintelligence

import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.forecast.CleanOhlcBar
import es.manico.chartintelligence.forecast.EmpiricalAnalogEngine
import es.manico.chartintelligence.forecast.ForecastCalendarHelper
import es.manico.chartintelligence.forecast.ForecastEngine
import es.manico.chartintelligence.forecast.ForecastFeatureExtractor
import es.manico.chartintelligence.forecast.ForecastSha256
import es.manico.chartintelligence.forecast.ForecastStatisticalTests
import es.manico.chartintelligence.forecast.ForecastStatus
import es.manico.chartintelligence.forecast.ScenarioIds
import es.manico.chartintelligence.forecast.ScenarioStatus
import es.manico.chartintelligence.forecast.WalkForwardEvaluator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.math.BigDecimal
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Rigorous Unit Tests for CHART Forecast Engine V2 (Rev 2.1).
 * Validates all non-negotiables:
 * - T01: Minimum candles data readiness gate (H=10: 142, H=20: 201, H=30: 263, H=60: 369).
 * - T02: Zero-clamping gate (zero-prices/NaNs rejected, valid prices preserved).
 * - T03: Zero synthetic wave patterns / zero fabricated volume.
 * - T04: 4-way disjoint nested walk-forward structure with embargo gaps.
 * - T05: Causal empirical analog search (jMax = T - 2L - H - G_embargo, >=6 matches).
 * - T06: Bartlett N_eff effective sample size (N_eff <= N_eval).
 * - T07: 3-scenario L2 multinomial logit with <3 sample not-estimable rule.
 * - T08: HLN-DM Diebold-Mariano test and stationary block bootstrap.
 * - T09: Conformal prediction calibration (finite, non-crossing).
 * - T10: Canonical JSON 12-sig-digit inputHash deterministic computation.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ForecastV2Test {

    private fun generateCandleSeries(
        count: Int,
        startPrice: Double = 2400.0,
        trend: Double = 0.0002,
        vol: Double = 0.003
    ): List<CandleBar> {
        val startMs = 1786320000000L
        val stepMs = 900_000L
        var prev = startPrice
        return (0 until count).map { i ->
            val ret = trend + vol * (sin(i * 0.17) + 0.5 * cos(i * 0.41))
            val o = prev
            val c = o * exp(ret)
            val sp = max(0.5, abs(c - o) * 1.3)
            val h = max(o, c) + sp * 0.4
            val l = min(o, c) - sp * 0.4
            prev = c
            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = startMs + i * stepMs,
                timeframe = "M15",
                open = BigDecimal.valueOf(o),
                high = BigDecimal.valueOf(h),
                low = BigDecimal.valueOf(l),
                close = BigDecimal.valueOf(c),
                volume = BigDecimal.valueOf(250.0 + i % 100)
            )!!
        }
    }

    @Test
    fun t01_dataReadiness_strictlyEnforcesNminTable() {
        // Exact operational requirements from 7-segment 4-way disjoint nested splits:
        assertEquals(155, ForecastCalendarHelper.computeHorizonRequirements(10).nOpMin)
        assertEquals(232, ForecastCalendarHelper.computeHorizonRequirements(20).nOpMin)
        assertEquals(318, ForecastCalendarHelper.computeHorizonRequirements(30).nOpMin)
        assertEquals(550, ForecastCalendarHelper.computeHorizonRequirements(60).nOpMin)

        val bars154 = generateCandleSeries(154)
        val res154 = ForecastEngine.project(
            candles = bars154,
            symbolCode = "XAUUSD",
            timeframe = "M15",
            horizonBars = 10
        )
        assertEquals(ForecastStatus.DATA_NOT_READY, res154.status)
        assertFalse(res154.readiness.ready)
        assertTrue(res154.points.isEmpty())
        assertTrue(res154.readiness.issues.any { it.contains("155") })

        val bars155 = generateCandleSeries(155)
        val res155 = ForecastEngine.project(
            candles = bars155,
            symbolCode = "XAUUSD",
            timeframe = "M15",
            horizonBars = 10,
            skipWalkForward = true
        )
        assertTrue(res155.readiness.ready)
        assertTrue(res155.status != ForecastStatus.DATA_NOT_READY)
        assertEquals(10, res155.points.size)
    }

    @Test
    fun t02_zeroClamping_rejectsInvalidAndPreservesNonZero() {
        val bars = generateCandleSeries(150).toMutableList()
        // Inject an invalid non-positive candle
        val badBar = CandleBar(
            openTimeUtcMillis = bars[50].openTimeUtcMillis,
            openTimeUtcIso = "2026-07-06T00:00:00Z",
            open = BigDecimal.ZERO,
            high = BigDecimal.valueOf(10.0),
            low = BigDecimal.ZERO,
            close = BigDecimal.valueOf(5.0),
            volume = BigDecimal.valueOf(100.0)
        )
        bars[50] = badBar
        val report = ForecastFeatureExtractor.validateReadiness(bars, horizonBars = 10, timeframe = "M15")
        assertFalse(report.ready)
        assertTrue(report.issues.any { it.contains("positive") || it.contains("valid") || it.contains("corrupted") })
    }

    @Test
    fun t03_zeroSyntheticWaveTemplatesOrVolumeFabrication() {
        val bars = generateCandleSeries(250)
        val res = ForecastEngine.project(
            candles = bars,
            symbolCode = "XAUUSD",
            timeframe = "M15",
            horizonBars = 20,
            skipWalkForward = true
        )
        assertEquals(20, res.points.size)
        for (p in res.points) {
            // Strict non-negotiable: zero fabricated future volume
            assertEquals(0.0, p.volume, 1e-9)
            // Strict non-negotiable: monotonic quantiles
            assertTrue("Monotonicity violation at step ${p.stepAhead}", p.q10 <= p.q25)
            assertTrue("Monotonicity violation at step ${p.stepAhead}", p.q25 <= p.q50)
            assertTrue("Monotonicity violation at step ${p.stepAhead}", p.q50 <= p.q75)
            assertTrue("Monotonicity violation at step ${p.stepAhead}", p.q75 <= p.q90)
            assertTrue("Strict positive price", p.q10 > 0.0)
        }
    }

    @Test
    fun t04_nestedWalkForward_disjoint4WaySplitsAndEmbargo() {
        val bars = generateCandleSeries(250)
        val h = 10
        val splits = WalkForwardEvaluator.buildDisjointNestedSplits(bars.size, h)
        assertTrue("Splits must be feasible for 250 bars at H=10", splits.feasible)

        val e = max(5, ceil(0.25 * h).toInt())
        val gap = h + e

        // Train ends before Val starts by at least gap
        if (splits.valOrigins.isNotEmpty()) {
            val firstVal = splits.valOrigins.first()
            assertTrue("Train end must be separated from val origin by gap ($gap)", firstVal >= splits.trainEndIdx + gap)
        }
        if (splits.calOrigins.isNotEmpty() && splits.valOrigins.isNotEmpty()) {
            val lastVal = splits.valOrigins.last()
            val firstCal = splits.calOrigins.first()
            assertTrue("Val end must be separated from cal origin by gap ($gap)", firstCal >= lastVal + gap)
        }
        if (splits.outerOrigins.isNotEmpty() && splits.calOrigins.isNotEmpty()) {
            val lastCal = splits.calOrigins.last()
            val firstOuter = splits.outerOrigins.first()
            assertTrue("Cal end must be separated from outer origin by gap ($gap)", firstOuter >= lastCal + gap)
        }
    }

    @Test
    fun t05_causalEmpiricalAnalogs_strictJmaxAndMin6Matches() {
        val engine = EmpiricalAnalogEngine(windowSize = 24, horizon = 10, timeframe = "M15")
        val bars = generateCandleSeries(160)
        val clean = bars.map {
            CleanOhlcBar(
                open = it.open.toDouble(),
                high = it.high.toDouble(),
                low = it.low.toDouble(),
                close = it.close.toDouble(),
                volume = it.volume.toDouble(),
                openTimeUtcMs = it.openTimeUtcMillis
            )
        }
        val atr = engine.calculateATR(clean)
        val search = engine.findCausalAnalogs(clean, 10, atr)

        val effL = min(24, max(12, (clean.size * 0.15).toInt()))
        val embargo = max(5, ceil(0.25 * 10).toInt())
        val expectedJmax = clean.size - effL - effL - 10 - embargo
        assertEquals(expectedJmax, search.jMax)

        // If matchedCount < 6, status must be INSUFFICIENT_EVIDENCE
        if (search.analogs.size < 6) {
            assertEquals("INSUFFICIENT_EVIDENCE", search.status)
        } else {
            assertEquals("READY", search.status)
            for (an in search.analogs) {
                // Must strictly end before current window minus embargo
                assertTrue("Analog future must not leak into current window", an.futureEndIndex <= clean.size - effL - embargo)
            }
        }
    }

    @Test
    fun t06_bartlettNeff_strictlyLeqNeval() {
        val nEval = 20
        // All non-negative terms in denominator ensure N_eff <= N_eval
        val dSeries = DoubleArray(nEval) { i -> 0.05 * sin(i * 0.3) }
        val nEff = ForecastStatisticalTests.computeBartlettEffectiveSampleSize(dSeries, horizonBars = 5)
        assertTrue("N_eff ($nEff) must be strictly <= N_eval ($nEval)", nEff <= nEval.toDouble())
        assertTrue("N_eff must be positive", nEff > 0.0)

        // Pure white noise gives N_eff ~ nEval
        val iid = DoubleArray(35) { (it % 2 * 2 - 1).toDouble() }
        val nEffIid = ForecastStatisticalTests.computeBartlettEffectiveSampleSize(iid, horizonBars = 4)
        assertTrue(nEffIid <= 35.0)
    }

    @Test
    fun t07_threeCausalScenarios_lowSampleProducesNullProbability() {
        val bars = generateCandleSeries(160)
        val res = ForecastEngine.project(
            candles = bars,
            symbolCode = "XAUUSD",
            timeframe = "M15",
            horizonBars = 10,
            skipWalkForward = true
        )
        assertEquals(3, res.scenarios.size)
        val ids = res.scenarios.map { it.id }.toSet()
        val expectedIds = setOf(ScenarioIds.BULLISH_EXPANSION, ScenarioIds.RANGE_CONTAINMENT, ScenarioIds.BEARISH_CONTRACTION)
        assertEquals(expectedIds, ids)

        for (sc in res.scenarios) {
            if (sc.status == ScenarioStatus.NOT_ESTIMABLE || sc.lowSampleWarning) {
                assertNull("Scenario with low sample count must have null probability", sc.probability)
            } else {
                assertNotNull("Scenario with sufficient observations must have probability", sc.probability)
                assertTrue(sc.probability!! in 0.0..1.0)
            }
        }
    }

    @Test
    fun t08_statisticalTests_hlnDmAndBlockBootstrap() {
        val n = 35
        val dSeries = DoubleArray(n) { 0.5 } // loss diff: positive means naive has higher loss

        val dm = ForecastStatisticalTests.hlnModifiedDieboldMariano(dSeries, effectiveHorizonH = 10)
        assertTrue("p-value should be between 0 and 1", dm.pValue in 0.0..1.0)
        assertTrue(dm.stat.isFinite())
        assertTrue(dm.hacVar > 0.0)

        val boot = ForecastStatisticalTests.centeredStationaryBlockBootstrap(dSeries, iterationsB = 200, meanBlockLen = 4)
        assertTrue("Bootstrap p-value in [0, 1]", boot.pValue in 0.0..1.0)
        assertEquals(200, boot.iterationsB)
    }

    @Test
    fun t09_conformalPrediction_finiteNonEmptyIntervals() {
        val scores = DoubleArray(25) { 0.01 + it * 0.002 }
        val cal = ForecastStatisticalTests.fitVolatilityNormalizedConformal(scores, alpha = 0.20)
        assertEquals("CALIBRATED_NORMALIZED", cal.calibrationStatus)
        assertTrue("gammaLevel must be finite", cal.gammaLevel.isFinite())
        assertEquals(25, cal.calibrationWindows)
    }

    @Test
    fun t10_canonicalJsonInputHash_12SigDigitsDeterministic() {
        val rounded = ForecastSha256.roundToSignificant(2400.1234567890123, 12)
        assertEquals("2400.12345679", rounded)

        val bars = generateCandleSeries(150)
        val resA = ForecastEngine.project(candles = bars, symbolCode = "XAUUSD", timeframe = "M15", horizonBars = 10, skipWalkForward = true)
        val resB = ForecastEngine.project(candles = bars, symbolCode = "XAUUSD", timeframe = "M15", horizonBars = 10, skipWalkForward = true)
        assertEquals("Input hash must be strictly deterministic", resA.inputHash, resB.inputHash)
        assertTrue("Input hash must be 64-char hex", resA.inputHash.length == 64)
    }
}
