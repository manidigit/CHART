package es.manico.chartintelligence

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartPreferences
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.ProviderId
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.forecast.ExtractedForecastFeatures
import es.manico.chartintelligence.forecast.ForecastComplianceGuard
import es.manico.chartintelligence.forecast.ForecastEngine
import es.manico.chartintelligence.forecast.ForecastLedgerStore
import es.manico.chartintelligence.forecast.ForecastModelPlugin
import es.manico.chartintelligence.forecast.ForecastModelRegistry
import es.manico.chartintelligence.forecast.ForecastRenderMode
import es.manico.chartintelligence.forecast.ForecastStatus
import es.manico.chartintelligence.forecast.PluginPrediction
import es.manico.chartintelligence.forecast.RemoteWorkerStatus
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

        var prevTs = bars.last().openTimeUtcMillis
        for (p in result.points) {
            assertTrue(p.openTimeUtcMs > prevTs)
            assertTrue(p.q10 > 0.0 && p.q10 <= p.q25 && p.q25 <= p.q50 && p.q50 <= p.q75 && p.q75 <= p.q90)
            assertTrue(p.low <= p.open && p.low <= p.close && p.high >= p.open && p.high >= p.close)
            prevTs = p.openTimeUtcMs
        }

        val probSum = result.scenarios.sumOf { it.probability }
        assertTrue(abs(probSum - 1.0) <= 0.005)
        for (sc in result.scenarios) {
            assertFalse(ForecastComplianceGuard.containsForbiddenTradingTerms(sc.label))
        }
        assertNotNull(result.walkForward)
        assertTrue(result.walkForward!!.evaluatedWindows >= 4)
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
    fun ledgerStore_sha256HashChainDetectsTampering() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val prefs = context.getSharedPreferences("phase4_test_ledger_prefs", Context.MODE_PRIVATE)
        prefs.edit().clear().commit()

        val store = ForecastLedgerStore(prefs)
        val result = ForecastEngine.project(
            candles = generateBars(72, "M15"),
            symbolCode = "SPOTBRENT",
            timeframe = "M15",
            horizonBars = 30,
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
    }

    @Test
    fun forecastLabScreen_rendersAllFourStudioTabsViaCompose() {
        val bars = generateBars(80, "M15")
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
                    onBackToWatchlist = {}
                )
            }
        }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithTag("forecast_lab_screen").assertIsDisplayed()
        composeTestRule.onNodeWithTag("forecast_mini_fan_card").assertIsDisplayed()
        composeTestRule.onNodeWithTag("forecast_apply_to_chart_btn").assertIsDisplayed()

        composeTestRule.onNodeWithTag("forecast_subtab_1").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("forecast_remote_worker_card").performScrollTo().assertIsDisplayed()

        composeTestRule.onNodeWithTag("forecast_subtab_2").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("forecast_walkforward_card").performScrollTo().assertIsDisplayed()

        composeTestRule.onNodeWithTag("forecast_subtab_3").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("forecast_refresh_ledger_btn").performScrollTo().assertIsDisplayed()
    }
}
