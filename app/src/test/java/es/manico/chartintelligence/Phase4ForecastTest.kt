package es.manico.chartintelligence

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.algorithms.Phase2IndicatorsAlgorithm
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartPreferences
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.ProviderId
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.forecast.ExtractedForecastFeatures
import es.manico.chartintelligence.forecast.ForecastComplianceGuard
import es.manico.chartintelligence.forecast.ForecastEngine
import es.manico.chartintelligence.forecast.ForecastEvaluationOutcome
import es.manico.chartintelligence.forecast.ForecastLedgerStore
import es.manico.chartintelligence.forecast.ForecastLifecycleStatus
import es.manico.chartintelligence.forecast.ForecastModelPlugin
import es.manico.chartintelligence.forecast.ForecastModelRegistry
import es.manico.chartintelligence.forecast.ForecastRenderMode
import es.manico.chartintelligence.forecast.ForecastStatus
import es.manico.chartintelligence.forecast.ModelExecutionStatus
import es.manico.chartintelligence.forecast.NoEdgeGateState
import es.manico.chartintelligence.forecast.OodStatus
import es.manico.chartintelligence.forecast.PluginPrediction
import es.manico.chartintelligence.forecast.RemoteWorkerStatus
import es.manico.chartintelligence.forecast.SelectionMode
import es.manico.chartintelligence.ui.screens.ForecastLabScreen
import es.manico.chartintelligence.ui.theme.ChartIntelligenceTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.math.BigDecimal
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class Phase4ForecastTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private fun generateBars(count: Int, tf: String = "M15"): List<CandleBar> {
        val stepMs = when (tf) {
            "D1" -> 86_400_000L
            "H1" -> 3_600_000L
            else -> 900_000L
        }
        val start = 1783296000000L // 2026-07-06T00:00:00Z
        var prev = 94.0
        return (0 until count).map { i ->
            val r = 0.0012 + 0.0038 * sin(i * 0.24) + 0.0015 * cos(i * 0.58)
            val o = prev
            val c = o * exp(r)
            val sp = max(0.15, abs(c - o) * 1.4)
            val h = max(o, c) + sp * 0.45
            val l = min(o, c) - sp * 0.40
            prev = c
            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = start + i * stepMs,
                timeframe = tf,
                open = BigDecimal.valueOf(o),
                high = BigDecimal.valueOf(h),
                low = BigDecimal.valueOf(l),
                close = BigDecimal.valueOf(c),
                volume = BigDecimal.valueOf(500.0 + i * 3)
            )!!
        }
    }

    @Test
    fun forecastEngine_enforcesQuantileMonotonicityAndNonTradingCompliance() {
        val bars = generateBars(105, "M15")
        val result = ForecastEngine.project(
            candles = bars,
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 30,
            renderMode = ForecastRenderMode.HYBRID
        )
        assertEquals(30, result.points.size)
        assertTrue(result.points.size >= 10)
        assertTrue(result.status == ForecastStatus.VALID || result.status == ForecastStatus.PROVISIONAL)
        assertEquals(RemoteWorkerStatus.LOCAL_STATISTICAL_ONLY, result.remoteWorkerStatus)
        assertEquals("1.3.0", result.specVersion)

        var prevTs = bars.last().openTimeUtcMillis
        for (p in result.points) {
            assertTrue(p.openTimeUtcMs > prevTs)
            assertTrue(p.q10 > 0.0 && p.q10 <= p.q25 && p.q25 <= p.q50 && p.q50 <= p.q75 && p.q75 <= p.q90)
            assertTrue(p.low <= p.open && p.low <= p.close && p.high >= p.open && p.high >= p.close)
            prevTs = p.openTimeUtcMs
        }

        assertEquals(5, result.scenarios.size)
        val expectedLeaves = setOf(
            "NO_ZONE_TOUCH_RANGE",
            "ZONE_REACTION_REJECTION",
            "PENETRATE_AND_RECLAIM",
            "CONFIRMED_BREAKOUT_BULL",
            "CONFIRMED_BREAKOUT_BEAR"
        )
        assertEquals(expectedLeaves, result.scenarios.map { it.leafId }.toSet())

        val probSum = result.scenarios.sumOf { it.probability }
        assertTrue(abs(probSum - 1.0) <= 0.005)
        for (sc in result.scenarios) {
            assertFalse(ForecastComplianceGuard.containsForbiddenTradingTerms(sc.label))
        }
        assertNotNull(result.walkForward)
        assertTrue(result.walkForward!!.evaluatedWindows >= 4)
        assertNotNull(result.walkForward!!.pathEventStats)
        assertEquals(2, result.keyZones.size)
        assertEquals(9, result.eventDictionary?.sensitivityGrid?.size ?: 0)
    }

    @Test
    fun uncertaintyAndOod_detectsExtremeSpikeAndEnforcesNoEdgeGate() {
        val base = generateBars(90, "M15").toMutableList()
        val last = base.last()
        val shockOpen = last.close.toDouble()
        val shockClose = shockOpen * 1.18 // Extreme 18% single-bar shock
        base[base.lastIndex] = CandleValidatorAlgorithm.sanitizeAndValidate(
            rawOpenTimeMillis = last.openTimeUtcMillis,
            timeframe = "M15",
            open = BigDecimal.valueOf(shockOpen),
            high = BigDecimal.valueOf(shockClose * 1.01),
            low = BigDecimal.valueOf(shockOpen * 0.99),
            close = BigDecimal.valueOf(shockClose),
            volume = last.volume
        )!!

        val shocked = ForecastEngine.project(
            candles = base,
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 30
        )
        assertNotNull(shocked.uncertainty)
        val u = shocked.uncertainty!!
        assertTrue(abs((u.aleatoricShare + u.epistemicShare) - 1.0) <= 0.01)
        assertEquals(OodStatus.EXTREME, u.oodStatus)
        assertTrue(u.spreadMultiplierApplied > 1.3)
        assertNotNull(shocked.noEdgeGate)
        assertEquals(NoEdgeGateState.NO_EDGE_DETECTED, shocked.noEdgeGate!!.gateState)
        assertFalse(shocked.noEdgeGate!!.hasEdge)
    }

    @Test
    fun mtfCoordination_preservesIndependentPointsWhileCoordinatingHtf() {
        val m15Bars = generateBars(105, "M15")
        val h1Bars = generateBars(60, "H1")

        val indOnly = ForecastEngine.project(
            candles = m15Bars,
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 30,
            skipWalkForward = true
        )
        val withHtf = ForecastEngine.project(
            candles = m15Bars,
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 30,
            skipWalkForward = true,
            higherTimeframe = "H1",
            higherTimeframeCandles = h1Bars
        )

        assertEquals(indOnly.summary?.terminalQ50, withHtf.summary?.terminalQ50)
        assertNotNull(withHtf.mtfCoordination)
        assertEquals("H1", withHtf.mtfCoordination!!.referenceTimeframe)
        assertEquals(withHtf.points.size, withHtf.mtfCoordination!!.coordinatedPoints.size)
    }

    @Test
    fun dataReadinessGate_rejectsInsufficientCandles() {
        val fewBars = generateBars(16, "H1")
        val result = ForecastEngine.project(
            candles = fewBars,
            symbolCode = "XAUUSD",
            timeframe = "H1",
            horizonBars = 30
        )
        assertEquals(ForecastStatus.DATA_NOT_READY, result.status)
        assertTrue(result.points.isEmpty())
        assertFalse(result.readiness.ready)
    }

    @Test
    fun modelRegistry_supportsCustomPluginAndJsonSerialization() {
        val customPlugin = object : ForecastModelPlugin {
            override val id = "custom_ornstein_uhlenbeck"
            override val name = "Custom Ornstein-Uhlenbeck"
            override val family = "ECONOMETRIC"
            override val description = "External mean reversion plugin"
            override val defaultEnabled = true
            override val defaultWeight = 0.30
            override val defaultParams = mapOf("theta" to 0.85)
            override fun predict(features: ExtractedForecastFeatures, horizon: Int, params: Map<String, Double>): PluginPrediction {
                val theta = params["theta"] ?: 0.85
                val means = DoubleArray(horizon) { h -> -features.recentMeanReturn * 0.1 * theta.pow(h) }
                val sigs = DoubleArray(horizon) { features.ewmaSigma }
                return PluginPrediction(id, means, sigs)
            }
        }

        val registry = ForecastModelRegistry().register(customPlugin)
        registry.setWeight("naive_persistence", 0.05)
        val json = registry.serializeToJson()

        val restored = ForecastModelRegistry().register(customPlugin).apply { applyFromJson(json) }
        val result = ForecastEngine.project(
            candles = generateBars(70, "D1"),
            symbolCode = "NVDA",
            timeframe = "D1",
            horizonBars = 15,
            registry = restored,
            skipWalkForward = true
        )
        assertTrue(result.modelContributions.any { it.modelId == "custom_ornstein_uhlenbeck" })
    }

    @Test
    fun ledgerStore_sha256HashChainAndLifecycleAmbiguousEvaluation() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val prefs = context.getSharedPreferences("phase4_test_ledger_prefs", Context.MODE_PRIVATE)
        prefs.edit().clear().commit()

        val store = ForecastLedgerStore(prefs)
        val bars = generateBars(72, "M15")
        val anchorSlice = bars.subList(0, 50)
        val result = ForecastEngine.project(
            candles = anchorSlice,
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 10,
            skipWalkForward = true
        )

        val e1 = store.appendFromForecast(result)
        val e2 = store.appendFromForecast(result)
        assertNotNull(e1)
        assertNotNull(e2)
        assertEquals(e1!!.forecastHash, e2!!.prevForecastHash)

        val validRes = store.verifyChain()
        assertTrue(validRes.valid)
        assertEquals(2, validRes.totalEntries)

        val tampered = store.loadEntries().toMutableList()
        tampered[0] = tampered[0].copy(terminalMedian = tampered[0].terminalMedian + 5.0)
        val badRes = store.verifyChain(tampered)
        assertFalse(badRes.valid)
        assertEquals(0, badRes.brokenIndex)

        // Inject simultaneous inside-bar corridor spike at step 52 to verify AMBIGUOUS outcome
        val barsWithAmbiguous = bars.toMutableList()
        val spikeBar = barsWithAmbiguous[52]
        val hiBound = max(e2.anchorClose, e2.terminalQ90) * 1.05
        val loBound = min(e2.anchorClose, e2.terminalQ10) * 0.95
        barsWithAmbiguous[52] = CandleValidatorAlgorithm.sanitizeAndValidate(
            rawOpenTimeMillis = spikeBar.openTimeUtcMillis,
            timeframe = "M15",
            open = spikeBar.open,
            high = BigDecimal.valueOf(hiBound),
            low = BigDecimal.valueOf(loBound),
            close = spikeBar.close,
            volume = spikeBar.volume
        )!!

        val evaluated = store.evaluateMaturedForecasts(barsWithAmbiguous, "SPOTBRENT", "M15")
        assertTrue(evaluated.any {
            it.lifecycleStatus == ForecastLifecycleStatus.MATURED &&
                it.evaluationOutcome == ForecastEvaluationOutcome.AMBIGUOUS
        })
        assertTrue(store.verifyLifecycleChain().valid)
    }

    @Test
    fun forecastLabScreen_rendersAllFourStudioTabsViaCompose() {
        val bars = generateBars(80, "M15")
        val h1Bars = generateBars(40, "H1")
        val activeTab = ChartTabState(
            tabId = "tab_spotbrent",
            chartId = "SPOTBRENT_M15",
            symbolCode = "SPOTBRENT",
            decimals = 3,
            provider = ProviderId.TVDATAFEED,
            timeframe = "M15",
            candles = bars
        )
        val watchlist = listOf(
            SymbolConfig(
                symbolCode = "SPOTBRENT",
                chartId = "SPOTBRENT_M15",
                decimals = 3,
                activeProvider = ProviderId.TVDATAFEED,
                timeframe = "M15",
                inWatchlist = true
            )
        )

        composeTestRule.setContent {
            ChartIntelligenceTheme(darkTheme = true) {
                ForecastLabScreen(
                    activeTab = activeTab,
                    watchlistSymbols = watchlist,
                    preferences = ChartPreferences(),
                    localLedgerEntries = emptyList(),
                    serverLedgerEntries = emptyList(),
                    ledgerVerifyResult = es.manico.chartintelligence.forecast.LedgerVerifyResult(true, 0, -1, "Empty"),
                    onSelectSymbol = {},
                    onSelectTimeframe = {},
                    onSelectHorizonBars = {},
                    onSelectRenderMode = {},
                    onToggleModelPlugin = { _, _ -> },
                    onSetModelWeight = { _, _ -> },
                    onSetModelParam = { _, _, _ -> },
                    onResetModelPlugins = {},
                    onSaveWorkerUrl = {},
                    onRecordSnapshot = {},
                    onRefreshServerLedger = {},
                    onPlotReferenceLevelsToChart = { _, _, _, _, _ -> },
                    onApplyForecastToChart = {},
                    onBackToWatchlist = {},
                    higherTimeframeCandlesProvider = { h1Bars }
                )
            }
        }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithTag("forecast_lab_screen").assertIsDisplayed()
        composeTestRule.onNodeWithTag("forecast_symbol_selector").assertIsDisplayed()
        composeTestRule.onNodeWithTag("forecast_tf_chip_m15").assertIsDisplayed()
        composeTestRule.onNodeWithTag("forecast_mini_fan_card").assertIsDisplayed()
        composeTestRule.onNodeWithTag("forecast_apply_to_chart_btn").assertIsDisplayed()
        composeTestRule.onNodeWithTag("forecast_uncertainty_card").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("forecast_mtf_card").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("forecast_key_zones_card").performScrollTo().assertIsDisplayed()

        composeTestRule.onNodeWithTag("forecast_subtab_1").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("forecast_remote_worker_card").performScrollTo().assertIsDisplayed()

        composeTestRule.onNodeWithTag("forecast_subtab_2").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("forecast_walkforward_card").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("forecast_path_sensitivity_card").performScrollTo().assertIsDisplayed()

        composeTestRule.onNodeWithTag("forecast_subtab_3").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("forecast_refresh_ledger_btn").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("forecast_lifecycle_evaluate_btn").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun forecastEngine_preservesHorizonPrefixInvarianceAndRealistic60BarWaves() {
        val bars = generateBars(160, "M15")
        val res10 = ForecastEngine.project(
            candles = bars,
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 10,
            skipWalkForward = true,
            selectedModelId = "smc_kmedoids"
        )
        val res20 = ForecastEngine.project(
            candles = bars,
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 20,
            skipWalkForward = true,
            selectedModelId = "smc_kmedoids"
        )
        val res60 = ForecastEngine.project(
            candles = bars,
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 60,
            skipWalkForward = true,
            selectedModelId = "smc_kmedoids"
        )

        assertEquals(3, res10.smcScenarios.size)
        for (sIdx in 0 until 3) {
            val s10 = res10.smcScenarios[sIdx]
            val s20 = res20.smcScenarios[sIdx]
            val s60 = res60.smcScenarios[sIdx]
            assertEquals(s10.id, s20.id)
            assertEquals(s10.id, s60.id)
            assertEquals(s10.clusterType, s20.clusterType)
            assertEquals(s10.clusterType, s60.clusterType)
            assertEquals(s10.probability, s20.probability, 1e-9)
            assertEquals(s10.probability, s60.probability, 1e-9)
            for (i in 0 until 10) {
                assertEquals(s10.candles[i].open, s20.candles[i].open, 1e-9)
                assertEquals(s10.candles[i].close, s20.candles[i].close, 1e-9)
                assertEquals(s10.candles[i].high, s20.candles[i].high, 1e-9)
                assertEquals(s10.candles[i].low, s20.candles[i].low, 1e-9)
                assertEquals(s10.candles[i].open, s60.candles[i].open, 1e-9)
                assertEquals(s10.candles[i].close, s60.candles[i].close, 1e-9)
                assertEquals(s10.candles[i].high, s60.candles[i].high, 1e-9)
                assertEquals(s10.candles[i].low, s60.candles[i].low, 1e-9)
            }
        }
        for (i in 0 until 10) {
            assertEquals(res10.points[i].q50, res60.points[i].q50, 1e-9)
            assertEquals(res10.points[i].q10, res60.points[i].q10, 1e-9)
            assertEquals(res10.points[i].q90, res60.points[i].q90, 1e-9)
        }
        for (i in 0 until 20) {
            assertEquals(res20.points[i].q50, res60.points[i].q50, 1e-9)
        }

        var bullCount = 0
        var bearCount = 0
        var maxConsec = 0
        var curRun = 0
        var prevSign = 0
        for (p in res60.points) {
            val sign = if (p.close >= p.open) 1 else -1
            if (sign > 0) bullCount += 1 else bearCount += 1
            curRun = if (sign == prevSign) curRun + 1 else 1
            prevSign = sign
            if (curRun > maxConsec) maxConsec = curRun
        }
        assertTrue("Expected oscillating waves (bull=$bullCount, bear=$bearCount)", bullCount >= 12 && bearCount >= 12)
        assertTrue("Expected <=5 consecutive same-color bars (got $maxConsec)", maxConsec <= 5)
        val atr = res60.featuresSummary!!.atr14
        for (sc in res60.smcScenarios) {
            assertTrue(abs(sc.targetPrice - res60.anchorClose) <= atr * 12.5)
        }

        val p10 = Phase2IndicatorsAlgorithm.computeFutureCandlestickProjection(bars, "M15", 10)
        val p60 = Phase2IndicatorsAlgorithm.computeFutureCandlestickProjection(bars, "M15", 60)
        assertEquals(10, p10.size)
        assertEquals(60, p60.size)
        for (i in 0 until 10) {
            assertEquals(p10[i].open, p60[i].open, 1e-9)
            assertEquals(p10[i].close, p60[i].close, 1e-9)
            assertEquals(p10[i].high, p60[i].high, 1e-9)
            assertEquals(p10[i].low, p60[i].low, 1e-9)
        }
    }

    @Test
    fun forecastEngine_crossTimeframeM15AndH1FirstBarMatchesRollup() {
        val m15Bars = generateBars(160, "M15")
        val h1Bars = (0 until m15Bars.size step 4).map { idx ->
            val chunk = m15Bars.subList(idx, idx + 4)
            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = chunk.first().openTimeUtcMillis,
                timeframe = "H1",
                open = chunk.first().open,
                high = chunk.maxOf { it.high },
                low = chunk.minOf { it.low },
                close = chunk.last().close,
                volume = chunk.fold(BigDecimal.ZERO) { acc, b -> acc.add(b.volume) }
            )!!
        }

        val m15Res = ForecastEngine.project(
            candles = m15Bars,
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 16,
            skipWalkForward = true
        )
        val h1Res = ForecastEngine.project(
            candles = h1Bars,
            symbolCode = "SPOTBRENT",
            timeframe = "H1",
            horizonBars = 10,
            skipWalkForward = true,
            lowerTimeframe = "M15",
            lowerTimeframeCandles = m15Bars
        )

        for (h1Sc in h1Res.smcScenarios) {
            val m15Sc = m15Res.smcScenarios.firstOrNull { it.clusterType == h1Sc.clusterType }
                ?: m15Res.smcScenarios.first()
            val first4 = m15Sc.candles.take(4)
            val rollupHigh = first4.maxOf { it.high }
            val rollupLow = first4.minOf { it.low }
            val h1Bar0 = h1Sc.candles.first()
            assertEquals(first4.first().open, h1Bar0.open, 1e-6)
            assertEquals(rollupHigh, h1Bar0.high, 1e-6)
            assertEquals(rollupLow, h1Bar0.low, 1e-6)
            assertEquals(first4.last().close, h1Bar0.close, 1e-6)
        }
    }

    @Test
    fun forecastEngine_pred12_causalAntiLeakageCutoffInvariant() {
        val fullBars = generateBars(170, "M15")
        val prefixBars = fullBars.subList(0, 120)
        val altBars = fullBars.subList(0, 120).toMutableList()
        for (i in 120 until fullBars.size) {
            val b = fullBars[i]
            val spike = b.close.multiply(BigDecimal.valueOf(1.25))
            altBars.add(
                CandleValidatorAlgorithm.sanitizeAndValidate(
                    rawOpenTimeMillis = b.openTimeUtcMillis,
                    timeframe = "M15",
                    open = spike,
                    high = spike.multiply(BigDecimal.valueOf(1.02)),
                    low = spike.multiply(BigDecimal.valueOf(0.98)),
                    close = spike,
                    volume = b.volume
                )!!
            )
        }

        val resPrefix = ForecastEngine.project(
            candles = prefixBars,
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 20,
            skipWalkForward = true
        )
        val resSubPrefix = ForecastEngine.project(
            candles = altBars.subList(0, 120),
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 20,
            skipWalkForward = true
        )
        assertEquals(resPrefix.inputHash, resSubPrefix.inputHash)
        for (tr in resPrefix.modelTrajectories) {
            assertTrue(tr.trainingEndUtcMs <= prefixBars.last().openTimeUtcMillis)
        }
        for (i in 0 until 20) {
            assertEquals(resPrefix.points[i].q50, resSubPrefix.points[i].q50, 1e-9)
        }
    }

    @Test
    fun forecastEngine_pred13_tftEnforcesStrictLowDataSkipWithoutFlatFallback() {
        val bars70 = generateBars(70, "M15")
        val res70 = ForecastEngine.project(
            candles = bars70,
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 15,
            skipWalkForward = true,
            selectedModelId = "native_quantile_attention_approx"
        )
        val tft70 = res70.modelTrajectories.firstOrNull { it.modelId == "native_quantile_attention_approx" }
        assertNotNull(tft70)
        assertEquals(ModelExecutionStatus.SKIPPED_LOW_DATA, tft70!!.status)
        assertTrue(tft70.points.isEmpty())
        assertTrue(tft70.isApproximation)
        assertFalse(tft70.isCalibratedInterval)
        assertTrue(tft70.reason.contains("90"))

        val bars120 = generateBars(120, "M15")
        val res120 = ForecastEngine.project(
            candles = bars120,
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 15,
            skipWalkForward = true,
            selectedModelId = "native_quantile_attention_approx"
        )
        val tft120 = res120.modelTrajectories.firstOrNull { it.modelId == "native_quantile_attention_approx" }
        assertNotNull(tft120)
        assertEquals(ModelExecutionStatus.SUCCESS, tft120!!.status)
        assertEquals(15, tft120.points.size)
        assertTrue(tft120.isApproximation)
        assertFalse(tft120.isCalibratedInterval)
    }

    @Test
    fun forecastEngine_pred14_failingPluginIsExposedExplicitlyWithoutMasking() {
        val brokenPlugin = object : ForecastModelPlugin {
            override val id = "broken_test_plugin"
            override val name = "Broken Test Plugin"
            override val family = "CUSTOM"
            override val description = "Throws intentionally to verify non-masking"
            override val defaultEnabled = true
            override val defaultWeight = 0.20
            override val defaultParams = emptyMap<String, Double>()
            override fun predict(features: ExtractedForecastFeatures, horizon: Int, params: Map<String, Double>): PluginPrediction {
                throw IllegalStateException("Synthetic model exception")
            }
        }
        val registry = ForecastModelRegistry().register(brokenPlugin)
        val bars = generateBars(110, "M15")
        val res = ForecastEngine.project(
            candles = bars,
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 15,
            registry = registry,
            skipWalkForward = false
        )
        val brokenTraj = res.modelTrajectories.firstOrNull { it.modelId == "broken_test_plugin" }
        assertNotNull(brokenTraj)
        assertEquals(ModelExecutionStatus.FAILED, brokenTraj!!.status)
        assertTrue(brokenTraj.points.isEmpty())
        assertTrue(brokenTraj.reason.contains("Synthetic model exception"))

        val brokenBench = res.walkForward?.modelBenchmarks?.firstOrNull { it.modelId == "broken_test_plugin" }
        assertNotNull(brokenBench)
        assertEquals(ModelExecutionStatus.FAILED, brokenBench!!.status)
    }

    @Test
    fun forecastEngine_pred15_oosWinnerGateBlocksUnprovenDefaultAndAllowsManualOverride() {
        // Pure random-walk-like bars where no model reliably beats naive persistence by >=1.5% across >=5 windows
        val start = 1783296000000L
        var prev = 100.0
        var seed = 42L
        val rwBars = (0 until 125).map { i ->
            seed = (seed * 1664525L + 1013904223L) and 0xFFFFFFFFL
            val u = (seed.toDouble() / 4294967296.0) - 0.5
            val c = prev * exp(u * 0.008)
            val o = prev
            val h = max(o, c) * 1.001
            val l = min(o, c) * 0.999
            prev = c
            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = start + i * 900_000L,
                timeframe = "M15",
                open = BigDecimal.valueOf(o),
                high = BigDecimal.valueOf(h),
                low = BigDecimal.valueOf(l),
                close = BigDecimal.valueOf(c),
                volume = BigDecimal.valueOf(400.0)
            )!!
        }

        val autoRes = ForecastEngine.project(
            candles = rwBars,
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 10,
            skipWalkForward = false,
            selectedModelId = "AUTO"
        )
        assertNotNull(autoRes.walkForward)
        if (autoRes.walkForward!!.winnerModelId == null) {
            assertEquals(SelectionMode.NO_CLEAR_WINNER_BASELINE, autoRes.selectionMode)
            assertEquals("naive_persistence", autoRes.selectedChartModelId)
        } else {
            assertEquals(SelectionMode.AUTO_OOS_BEST, autoRes.selectionMode)
            assertEquals(autoRes.walkForward!!.winnerModelId, autoRes.selectedChartModelId)
        }

        val manualRes = ForecastEngine.project(
            candles = rwBars,
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 10,
            skipWalkForward = false,
            selectedModelId = "native_arima_diff"
        )
        assertEquals(SelectionMode.MANUAL_OVERRIDE, manualRes.selectionMode)
        assertEquals("native_arima_diff", manualRes.selectedChartModelId)
    }

    @Test
    fun forecastEngine_pred16_allFourNewNativeModelsPreserveHorizonPrefixInvariance() {
        val bars = generateBars(160, "M15")
        val modelIds = listOf(
            "native_arima_diff",
            "native_prophet_decomp",
            "native_seq_recurrent_approx",
            "native_quantile_attention_approx"
        )
        for (mId in modelIds) {
            val r10 = ForecastEngine.project(
                candles = bars,
                symbolCode = "SPOTBRENT",
                timeframe = "M15",
                horizonBars = 10,
                skipWalkForward = true,
                selectedModelId = mId
            )
            val r20 = ForecastEngine.project(
                candles = bars,
                symbolCode = "SPOTBRENT",
                timeframe = "M15",
                horizonBars = 20,
                skipWalkForward = true,
                selectedModelId = mId
            )
            val r60 = ForecastEngine.project(
                candles = bars,
                symbolCode = "SPOTBRENT",
                timeframe = "M15",
                horizonBars = 60,
                skipWalkForward = true,
                selectedModelId = mId
            )
            assertEquals("Expected $mId selected on 10", mId, r10.selectedChartModelId)
            assertEquals("Expected $mId selected on 20", mId, r20.selectedChartModelId)
            assertEquals("Expected $mId selected on 60", mId, r60.selectedChartModelId)
            for (i in 0 until 10) {
                assertEquals("$mId q50 mismatch at step $i (10 vs 60)", r10.points[i].q50, r60.points[i].q50, 1e-8)
                assertEquals("$mId q10 mismatch at step $i (10 vs 60)", r10.points[i].q10, r60.points[i].q10, 1e-8)
                assertEquals("$mId q90 mismatch at step $i (10 vs 60)", r10.points[i].q90, r60.points[i].q90, 1e-8)
            }
            for (i in 0 until 20) {
                assertEquals("$mId q50 mismatch at step $i (20 vs 60)", r20.points[i].q50, r60.points[i].q50, 1e-8)
            }
        }
    }
}


