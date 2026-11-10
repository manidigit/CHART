package es.manico.chartintelligence

import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.algorithms.DrawingGeometryAlgorithm
import es.manico.chartintelligence.algorithms.PasswordHashAlgorithm
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.algorithms.TimeframeAggregatorAlgorithm
import es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartDrawing
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class Phase1AlgorithmsTest {

    @Test
    fun utcTimeAnchor_snapsM15H1H4D1AndFiltersOpenCandles() {
        val rawMillis = 1793966852000L
        for (tf in listOf("M15", "H1", "H4", "D1", "W1")) {
            val step = UtcTimeAnchorAlgorithm.timeframeStepMillis(tf)
            val snapped = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(rawMillis, tf)
            assertEquals(0L, snapped % step)
            assertFalse(UtcTimeAnchorAlgorithm.isCandleClosed(snapped, tf, rawMillis))
            assertTrue(UtcTimeAnchorAlgorithm.isCandleClosed(snapped - step, tf, rawMillis))
        }
    }

    @Test
    fun candleValidator_enforcesDecimalScaleAndIdempotentMerge() {
        val nowMillis = 1793966852000L
        val closedOpen = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(nowMillis, "M15") - (15L * 60L * 1000L)
        val c1 = CandleValidatorAlgorithm.sanitizeAndValidate(
            rawOpenTimeMillis = closedOpen,
            timeframe = "M15",
            open = BigDecimal("2740.10"),
            high = BigDecimal("2745.50"),
            low = BigDecimal("2739.00"),
            close = BigDecimal("2743.25"),
            volume = BigDecimal("510.5")
        )
        assertNotNull(c1)
        assertEquals(8, c1!!.close.scale())

        val merged = CandleValidatorAlgorithm.mergeIdempotent(
            existing = listOf(c1),
            incoming = listOf(c1.copy(close = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal("2744.00")))),
            timeframe = "M15",
            nowUtcMillis = nowMillis
        )
        assertEquals(1, merged.size)
        assertEquals("2744.00", PriceFormatterAlgorithm.formatPrice(merged.first().close, 2))
    }

    @Test
    fun timeframeAggregator_aggregatesM15ToH1AndH4WithExactOhlcvRules() {
        // 2026-11-06 00:00:00 UTC epoch millis = 1793923200000L
        val dayStartUtc = 1793923200000L
        val m15Step = 15L * 60L * 1000L
        val nowAfter4Hours = dayStartUtc + (5L * 60L * 60L * 1000L)

        val m15Bars = listOf(
            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = dayStartUtc + 0 * m15Step,
                timeframe = "M15",
                open = BigDecimal("2740.00"),
                high = BigDecimal("2744.00"),
                low = BigDecimal("2738.50"),
                close = BigDecimal("2742.00"),
                volume = BigDecimal("100")
            )!!,
            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = dayStartUtc + 1 * m15Step,
                timeframe = "M15",
                open = BigDecimal("2742.00"),
                high = BigDecimal("2749.25"), // Highest in H1
                low = BigDecimal("2741.00"),
                close = BigDecimal("2746.00"),
                volume = BigDecimal("150")
            )!!,
            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = dayStartUtc + 2 * m15Step,
                timeframe = "M15",
                open = BigDecimal("2746.00"),
                high = BigDecimal("2747.00"),
                low = BigDecimal("2735.10"), // Lowest in H1
                close = BigDecimal("2739.00"),
                volume = BigDecimal("200")
            )!!,
            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = dayStartUtc + 3 * m15Step,
                timeframe = "M15",
                open = BigDecimal("2739.00"),
                high = BigDecimal("2745.00"),
                low = BigDecimal("2738.00"),
                close = BigDecimal("2743.75"), // Last Close in H1
                volume = BigDecimal("120")
            )!!
        )

        val h1Candles: List<CandleBar> = TimeframeAggregatorAlgorithm.aggregateCandles(
            sourceCandles = m15Bars,
            targetTimeframe = "H1",
            nowUtcMillis = nowAfter4Hours
        )
        assertEquals(1, h1Candles.size)
        val h1 = h1Candles.first()
        assertEquals(dayStartUtc, h1.openTimeUtcMillis)
        assertEquals("2740.00", PriceFormatterAlgorithm.formatPrice(h1.open, 2))
        assertEquals("2749.25", PriceFormatterAlgorithm.formatPrice(h1.high, 2))
        assertEquals("2735.10", PriceFormatterAlgorithm.formatPrice(h1.low, 2))
        assertEquals("2743.75", PriceFormatterAlgorithm.formatPrice(h1.close, 2))
        assertEquals(570L, h1.volume.toLong())

        val h4Candles = TimeframeAggregatorAlgorithm.aggregateCandles(
            sourceCandles = h1Candles,
            targetTimeframe = "H4",
            nowUtcMillis = nowAfter4Hours
        )
        assertEquals(1, h4Candles.size)
        assertEquals(dayStartUtc, h4Candles.first().openTimeUtcMillis)
    }

    @Test
    fun drawingGeometry_hitTestsAndTranslatesDrawingsInMarketCoordinates() {
        val hLine = ChartDrawing.HorizontalLine(
            id = "hl_1",
            price = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal("2750.00"))
        )
        val trendLine = ChartDrawing.TrendLine(
            id = "tl_1",
            startTimeUtcMillis = 1000L,
            startPrice = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal("2700.00")),
            endTimeUtcMillis = 2000L,
            endPrice = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal("2800.00"))
        )
        val drawings = listOf(hLine, trendLine)

        val hit = DrawingGeometryAlgorithm.hitTestDrawing(
            drawings = drawings,
            tapX = 150f,
            tapY = 100f,
            timeToX = { t -> if (t == 1000L) 50f else 250f },
            priceToY = { p ->
                when (p) {
                    2750.0 -> 100f
                    2700.0 -> 200f
                    2800.0 -> 0f
                    else -> 500f
                }
            },
            hitTolerancePx = 15f
        )
        assertNotNull(hit)

        val miss = DrawingGeometryAlgorithm.hitTestDrawing(
            drawings = drawings,
            tapX = 10f,
            tapY = 390f,
            timeToX = { 100f },
            priceToY = { 100f },
            hitTolerancePx = 15f
        )
        assertNull(miss)

        val moved = DrawingGeometryAlgorithm.translateDrawing(
            drawing = hLine,
            deltaTimeMillis = 0L,
            deltaPrice = BigDecimal("5.25")
        ) as ChartDrawing.HorizontalLine
        assertEquals("2755.25", PriceFormatterAlgorithm.formatPrice(moved.price, 2))
    }

    @Test
    fun passwordHashAlgorithm_verifiesPersonalOwnerPassword() {
        val salt = PasswordHashAlgorithm.generateSaltBase64()
        val hash = PasswordHashAlgorithm.hashPassword("MySecretPass123", salt)
        assertTrue(PasswordHashAlgorithm.verifyPassword("MySecretPass123", salt, hash))
        assertFalse(PasswordHashAlgorithm.verifyPassword("WrongPass", salt, hash))
    }

    @Test
    fun chartPreferences_parsesColorsAndSafeguardsNonHardcodedConfig() {
        val defaultPrefs = es.manico.chartintelligence.data.model.ChartPreferences()
        assertEquals("FF26A69A", defaultPrefs.bullCandleColorHex)
        assertEquals("FFEF5350", defaultPrefs.bearCandleColorHex)
        assertEquals(500, defaultPrefs.candleFetchLimit)
        assertEquals(5000, defaultPrefs.maxVisibleCandles)
        assertEquals(8, defaultPrefs.zoomStepCandles)
        assertEquals(28f, defaultPrefs.drawingHitTolerancePx, 0.01f)

        val customPrefs = defaultPrefs.copy(
            bullCandleColorHex = "FF06B6D4",
            candleFetchLimit = 5000,
            drawingHitTolerancePx = 36f
        )
        val bullColor = customPrefs.bullCandleColor
        assertEquals(androidx.compose.ui.graphics.Color(0xFF06B6D4), bullColor)
        assertEquals(5000, customPrefs.candleFetchLimit)
        assertEquals(36f, customPrefs.drawingHitTolerancePx, 0.01f)
    }

    @Test
    fun symbolConfig_supportsDynamicCustomSymbolsAndTvDatafeedProvider() {
        val tvProvider = es.manico.chartintelligence.data.model.ProviderId.fromId("tvdatafeed")
        assertEquals(es.manico.chartintelligence.data.model.ProviderId.TVDATAFEED, tvProvider)
        assertEquals("TradingView", tvProvider.badgeLabel)

        val spotBrent = es.manico.chartintelligence.data.model.SymbolConfig(
            chartId = "chart_spotbrent_main",
            symbolCode = "SPOTBRENT",
            titleResId = null,
            customTitle = "Brent Spot (PEPPERSTONE:SPOTBRENT)",
            decimals = 3,
            inWatchlist = true,
            activeProvider = tvProvider
        )
        assertEquals("SPOTBRENT_tvdatafeed_M15", spotBrent.compositeTabKey)
        assertEquals("101.198", PriceFormatterAlgorithm.formatPrice(BigDecimal("101.198"), spotBrent.decimals))
    }

    @Test
    fun candleValidator_filtersSyntheticWeekendCombBarsAndDetectsWeekendStatus() {
        // Sunday 2026-11-08 12:00 UTC = 1794139200000L (OTC Weekend Closed)
        val sundayMillis = 1794139200000L
        assertTrue(UtcTimeAnchorAlgorithm.isOtcWeekendClosed(sundayMillis, "XAUUSD"))

        val m15Step = 15L * 60L * 1000L
        val syntheticWeekendBars = (0 until 6).map { idx ->
            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = sundayMillis - (6 - idx) * m15Step,
                timeframe = "M15",
                open = BigDecimal("4065.98607000"),
                high = BigDecimal("4066.16800000"),
                low = BigDecimal("4065.92500000"),
                close = BigDecimal("4065.97000000"),
                volume = BigDecimal.ZERO
            )!!
        }
        val filtered = CandleValidatorAlgorithm.filterSyntheticWeekendAndCombCandles(
            syntheticWeekendBars,
            "XAUUSD",
            "M15"
        )
        assertTrue(filtered.isEmpty())
    }

    @Test
    fun phase1ProUpgrades_supportsTradingViewTogglesLogScaleAnd5YRange() {
        val prefs = es.manico.chartintelligence.data.model.ChartPreferences()
        assertFalse(prefs.hideWatchlistLogos)
        assertTrue(prefs.showSymbolScreen)
        assertTrue(prefs.chartVibrations)
        assertFalse(prefs.logarithmicScaleDefault)
        assertTrue(prefs.rememberLastChartOnDevice)
        assertTrue(prefs.hideTabBarInLandscape)
        assertTrue(prefs.pickerVibrations)
        assertTrue(prefs.showPickerScrollMagnifiers)

        val tab = es.manico.chartintelligence.data.model.ChartTabState(
            tabId = "SPOTBRENT_tvdatafeed",
            chartId = "chart_spotbrent_main",
            symbolCode = "SPOTBRENT",
            decimals = 3,
            provider = es.manico.chartintelligence.data.model.ProviderId.TVDATAFEED,
            isLogScale = true
        )
        assertTrue(tab.isLogScale)
        val presetIds = tab.computeDateRangePresets().map { it.id }
        assertTrue("5Y" in presetIds)
        assertTrue("All" in presetIds)
    }

    @Test
    fun tvDatafeedAdapter_detectsMondayIntradayReopenForM15H1H4WhileKeepingMondayD1Unclosed() {
        val adapter = es.manico.chartintelligence.providers.TvDatafeedAdapter()
        // Monday 2026-11-09 08:50:00 UTC = 1794214200000L
        val mondayMorningMs = 1794214200000L
        // Friday 2026-11-06 21:45:00 UTC = 1794001500000L
        val fridayLastM15Ms = 1794001500000L

        val expectedM15 = adapter.computeExpectedLastClosedOpenMs("M15", mondayMorningMs)
        val expectedH1 = adapter.computeExpectedLastClosedOpenMs("H1", mondayMorningMs)
        val expectedH4 = adapter.computeExpectedLastClosedOpenMs("H4", mondayMorningMs)
        val expectedD1 = adapter.computeExpectedLastClosedOpenMs("D1", mondayMorningMs)

        // M15 (08:30 UTC), H1 (07:00 UTC), and H4 (04:00 UTC) must all be strictly newer than Friday 21:45 UTC
        assertTrue(expectedM15 > fridayLastM15Ms)
        assertTrue(expectedH1 > fridayLastM15Ms)
        assertTrue(expectedH4 > fridayLastM15Ms)
        assertEquals("2026-11-09 08:30 UTC", UtcTimeAnchorAlgorithm.formatUtcIso(expectedM15))
        assertEquals("2026-11-09 07:00 UTC", UtcTimeAnchorAlgorithm.formatUtcIso(expectedH1))
        assertEquals("2026-11-09 04:00 UTC", UtcTimeAnchorAlgorithm.formatUtcIso(expectedH4))

        // Meanwhile, Monday's D1 candle is not yet closed, so expected last closed D1 is Friday 2026-11-06 00:00 UTC
        assertEquals("2026-11-06 00:00 UTC", UtcTimeAnchorAlgorithm.formatUtcIso(expectedD1))
    }
}


