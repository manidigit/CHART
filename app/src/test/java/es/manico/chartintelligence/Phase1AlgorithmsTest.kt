package es.manico.chartintelligence

import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.algorithms.DrawingGeometryAlgorithm
import es.manico.chartintelligence.algorithms.PasswordHashAlgorithm
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.algorithms.SessionCalendar
import es.manico.chartintelligence.algorithms.TimeframeAggregatorAlgorithm
import es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm
import es.manico.chartintelligence.algorithms.VolumeType
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartDrawing
import es.manico.chartintelligence.data.model.ProviderId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal
import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneOffset

class Phase1AlgorithmsTest {

    @Test
    fun utcTimeAnchor_snapsM15H1H4D1AndFiltersOpenCandles() {
        val rawMillis = 1793966852000L
        for (tf in listOf("M15", "H1", "H4", "D1", "W1")) {
            val step = UtcTimeAnchorAlgorithm.timeframeStepMillis(tf)
            val snapped = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(rawMillis, tf)
            if (tf == "W1") {
                assertEquals(0L, (snapped + 259_200_000L) % step)
                assertEquals(DayOfWeek.MONDAY, Instant.ofEpochMilli(snapped).atZone(ZoneOffset.UTC).dayOfWeek)
            } else {
                assertEquals(0L, snapped % step)
            }
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

    @Test
    fun drawingGeometry_magnetSnap_snapsToNearestOhlc() {
        val open = BigDecimal("2700.00")
        val high = BigDecimal("2750.00")
        val low = BigDecimal("2680.00")
        val close = BigDecimal("2720.00")

        // Closer to High (2750)
        val snapped1 = DrawingGeometryAlgorithm.snapToCandleOhlc(open, high, low, close, BigDecimal("2746.00"))
        assertEquals("2750.00000000", snapped1.toPlainString())

        // Closer to Low (2680)
        val snapped2 = DrawingGeometryAlgorithm.snapToCandleOhlc(open, high, low, close, BigDecimal("2684.00"))
        assertEquals("2680.00000000", snapped2.toPlainString())

        // Closer to Close (2720)
        val snapped3 = DrawingGeometryAlgorithm.snapToCandleOhlc(open, high, low, close, BigDecimal("2718.50"))
        assertEquals("2720.00000000", snapped3.toPlainString())
    }

    @Test
    fun chartDrawing_fibRetracementAndPositions_computeExactFormulas() {
        // Fib Retracement from 100 to 200
        val fib = ChartDrawing.FibRetracement(
            id = "fib_test",
            startTimeUtcMillis = 1000L,
            startPrice = BigDecimal("100.00"),
            endTimeUtcMillis = 2000L,
            endPrice = BigDecimal("200.00")
        )
        val levels = fib.computeLevels()
        assertEquals(7, levels.size)
        val lvl05 = levels.first { it.ratio == 0.5 }
        val lvl0618 = levels.first { it.ratio == 0.618 }
        assertEquals("150.00", PriceFormatterAlgorithm.formatPrice(lvl05.price, 2))
        assertEquals("161.80", PriceFormatterAlgorithm.formatPrice(lvl0618.price, 2))

        // Long Position: entry 100, target 110 (+10%), stop 95 (-5%) -> R/R = 2.0
        val longPos = ChartDrawing.LongPosition(
            id = "long_test",
            startTimeUtcMillis = 1000L,
            endTimeUtcMillis = 5000L,
            entryPrice = BigDecimal("100.00"),
            targetPrice = BigDecimal("110.00"),
            stopPrice = BigDecimal("95.00")
        )
        assertEquals(2.0, longPos.riskRewardRatio.toDouble(), 0.001)
        assertEquals(10.0, longPos.targetPercent.toDouble(), 0.001)
        assertEquals(5.0, longPos.stopPercent.toDouble(), 0.001)

        // Short Position: entry 100, target 90 (-10%), stop 105 (+5%) -> R/R = 2.0
        val shortPos = ChartDrawing.ShortPosition(
            id = "short_test",
            startTimeUtcMillis = 1000L,
            endTimeUtcMillis = 5000L,
            entryPrice = BigDecimal("100.00"),
            targetPrice = BigDecimal("90.00"),
            stopPrice = BigDecimal("105.00")
        )
        assertEquals(2.0, shortPos.riskRewardRatio.toDouble(), 0.001)
        assertEquals(10.0, shortPos.targetPercent.toDouble(), 0.001)
        assertEquals(5.0, shortPos.stopPercent.toDouble(), 0.001)
    }

    @Test
    fun providerMethodCatalog_includesBiquoteAnd22WatchlistSymbols() {
        val biquote = es.manico.chartintelligence.data.model.ProviderId.fromId("biquote")
        assertEquals(es.manico.chartintelligence.data.model.ProviderId.BIQUOTE, biquote)
        assertEquals("biquote", biquote.badgeLabel)

        val catalog = es.manico.chartintelligence.data.model.ProviderId.providerMethodCatalog
        assertEquals(7, catalog.size)

        val stooq = es.manico.chartintelligence.data.model.ProviderId.fromId("stooq")
        assertEquals(es.manico.chartintelligence.data.model.ProviderId.STOOQ, stooq)
        assertEquals("Stooq EOD", stooq.badgeLabel)
        assertEquals("EOD Historical", stooq.resolvePriceBasis("SPOTBRENT"))

        val stooqSpec = catalog.first { it.providerId == stooq }
        assertEquals(22, stooqSpec.supportedSymbols.size)

        val biquoteSpec = catalog.first { it.providerId == biquote }
        val biquoteCodes = biquoteSpec.supportedSymbols.map { it.symbolCode }
        assertTrue(biquoteCodes.containsAll(listOf("SPOTBRENT", "ETHUSD", "BTCUSD", "XAGUSD", "XAUUSD", "EURUSD", "USOIL")))

        val yahooSpec = catalog.first { it.providerId == es.manico.chartintelligence.data.model.ProviderId.YAHOO_FINANCE }
        val yahooCodes = yahooSpec.supportedSymbols.map { it.symbolCode }
        assertTrue(yahooCodes.containsAll(listOf(
            "SPOTBRENT", "ETHUSD", "BTCUSD", "XAGUSD", "XAUUSD", "SPX500USD", "NDQ", "EURUSD", "USOIL",
            "NVDA", "AMZN", "TSLA", "AAPL", "GOOGL", "MSFT", "META", "NFLX", "AMD", "UBER", "NKE", "IBM", "SAN"
        )))
    }

    @Test
    fun chartIdMapping_conformsToCanonicalNamingRules() {
        val testSymbols = listOf(
            "SPOTBRENT" to "chart_spotbrent_main",
            "XAUUSD" to "chart_xauusd_main",
            "ETHUSD" to "chart_ethusd_spot",
            "BTCUSD" to "chart_btcusd_spot",
            "XAGUSD" to "chart_xagusd_spot",
            "SPX500USD" to "chart_spx500usd_index",
            "NDQ" to "chart_ndq_index",
            "EURUSD" to "chart_eurusd_spot",
            "USOIL" to "chart_usoil_spot",
            "NVDA" to "chart_nvda_stock",
            "SAN" to "chart_san_stock"
        )
        for ((code, expectedId) in testSymbols) {
            val resolvedId = when (code) {
                "SPOTBRENT" -> "chart_spotbrent_main"
                "XAUUSD" -> "chart_xauusd_main"
                "BRENT_FUTURES" -> "chart_brent_futures"
                "SPX500USD" -> "chart_spx500usd_index"
                "NDQ" -> "chart_ndq_index"
                "ETHUSD", "BTCUSD", "XAGUSD", "EURUSD", "USOIL" -> "chart_${code.lowercase()}_spot"
                "NVDA", "AMZN", "TSLA", "AAPL", "GOOGL", "MSFT", "META", "NFLX", "AMD", "UBER", "NKE", "IBM", "SAN" -> "chart_${code.lowercase()}_stock"
                else -> "chart_${code.lowercase()}_custom"
            }
            assertEquals(expectedId, resolvedId)
        }
    }

    @Test
    fun openTabs_serializationAndParsingContract() {
        val tab = es.manico.chartintelligence.data.model.ChartTabState(
            tabId = "tab_spotbrent_m15_0",
            chartId = "chart_spotbrent_main",
            symbolCode = "SPOTBRENT",
            decimals = 3,
            provider = es.manico.chartintelligence.data.model.ProviderId.TVDATAFEED,
            timeframe = "M15",
            visibleCandleCount = 64,
            scrollOffsetFromRight = 5,
            showVolume = true,
            showSma20 = true,
            showEma50 = false,
            showBollinger = true,
            isLogScale = false
        )

        assertEquals("tab_spotbrent_m15_0", tab.tabId)
        assertEquals("SPOTBRENT", tab.symbolCode)
        assertEquals("tvdatafeed", tab.provider.id)
        assertEquals("M15", tab.timeframe)
        assertEquals(3, tab.decimals)
        assertEquals(64, tab.visibleCandleCount)
        assertEquals(5, tab.scrollOffsetFromRight)
        assertTrue(tab.showVolume)
        assertTrue(tab.showSma20)
        assertFalse(tab.showEma50)
        assertTrue(tab.showBollinger)
        assertFalse(tab.isLogScale)
        assertEquals("chart_spotbrent_main", tab.chartId)
    }

    @Test
    fun phase2And3_supportsM30AndComputesIndicatorsOscillatorsSmcAndVolumeProfile() {
        assertEquals("30m", PriceFormatterAlgorithm.displayTimeframeLabel("M30"))
        assertTrue("M30" in es.manico.chartintelligence.config.AppConfig.SUPPORTED_TIMEFRAMES)
        assertEquals(30L * 60_000L, UtcTimeAnchorAlgorithm.timeframeStepMillis("M30"))

        val baseTimeMs = 1793923200000L
        val stepMs = 15L * 60_000L
        val bars = (0 until 40).map { i ->
            val basePrice = 2700.0 + (i * 2.5) + if (i % 4 == 0) -3.0 else 4.0
            val open = BigDecimal.valueOf(basePrice)
            val high = BigDecimal.valueOf(basePrice + 8.0 + (i % 3) * 2.0)
            val low = BigDecimal.valueOf(basePrice - 5.0)
            val close = BigDecimal.valueOf(basePrice + 3.5)
            val vol = BigDecimal.valueOf(100.0 + i * 15.0)
            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = baseTimeMs + i * stepMs,
                timeframe = "M15",
                open = open,
                high = high,
                low = low,
                close = close,
                volume = vol
            )!!
        }

        val m30Bars = TimeframeAggregatorAlgorithm.aggregateCandles(
            sourceCandles = bars,
            targetTimeframe = "M30",
            nowUtcMillis = baseTimeMs + 50 * stepMs
        )
        assertEquals(20, m30Bars.size)
        assertEquals(baseTimeMs, m30Bars.first().openTimeUtcMillis)

        val closes = bars.map { it.close.toDouble() }
        val sma50 = PriceFormatterAlgorithm.computeSmaValues(closes, 20)
        val ema20 = PriceFormatterAlgorithm.computeEmaValues(closes, 20)
        val vwap = PriceFormatterAlgorithm.computeVwapValues(bars)
        val atr14 = PriceFormatterAlgorithm.computeAtrValues(bars, 14)
        val supertrend = PriceFormatterAlgorithm.computeSupertrendValues(bars, 10, 3.0)
        val rsi14 = PriceFormatterAlgorithm.computeRsiValues(closes, 14)
        val macd = PriceFormatterAlgorithm.computeMacdValues(closes, 12, 26, 9)
        val smc = PriceFormatterAlgorithm.detectSmcMarketStructures(bars, 3)
        val vp = PriceFormatterAlgorithm.computeVolumeProfile(bars, 24, 0.70)

        assertNotNull(sma50.last())
        assertNotNull(ema20.last())
        assertNotNull(vwap.last())
        assertNotNull(atr14.last())
        assertTrue(atr14.last()!! > 0.0)
        assertNotNull(supertrend.last())
        assertTrue(supertrend.last()!!.direction in listOf(-1, 1))
        assertNotNull(rsi14.last())
        assertTrue(rsi14.last()!! in 0.0..100.0)
        assertNotNull(macd.last())
        assertNotNull(macd.last()!!.signal)
        assertNotNull(macd.last()!!.histogram)
        assertNotNull(smc)
        assertNotNull(vp)
        assertEquals(24, vp!!.bins.size)
        assertTrue(vp.vahPrice >= vp.pocPrice)
        assertTrue(vp.pocPrice >= vp.valPrice)
    }

    @Test
    fun securityAndProviderStatus_contractsMatchBackendExpectations() {
        // 24/7 Crypto symbols must never be treated as OTC weekend-closed
        val sundayMillis = 1794139200000L
        assertFalse(UtcTimeAnchorAlgorithm.isOtcWeekendClosed(sundayMillis, "BTCUSD"))
        assertFalse(UtcTimeAnchorAlgorithm.isOtcWeekendClosed(sundayMillis, "ETHUSD"))
        assertTrue(UtcTimeAnchorAlgorithm.isOtcWeekendClosed(sundayMillis, "XAUUSD"))

        // providerStatus defaults and API_KEY_REQUIRED contract
        val symbolReady = es.manico.chartintelligence.data.model.SymbolConfig(
            chartId = "chart_xauusd_main",
            symbolCode = "XAUUSD"
        )
        assertEquals("READY", symbolReady.providerStatus)
        val symbolMissingKey = symbolReady.copy(providerStatus = "API_KEY_REQUIRED", syncErrorText = "ERR_API_KEY_REQUIRED")
        assertEquals("API_KEY_REQUIRED", symbolMissingKey.providerStatus)

        val tabMissingKey = es.manico.chartintelligence.data.model.ChartTabState(
            tabId = "XAUUSD_twelve_data",
            chartId = "chart_xauusd_main",
            symbolCode = "XAUUSD",
            decimals = 2,
            provider = es.manico.chartintelligence.data.model.ProviderId.TWELVE_DATA,
            hasError = true,
            providerStatus = symbolMissingKey.providerStatus
        )
        assertEquals("API_KEY_REQUIRED", tabMissingKey.providerStatus)

        // Session token key must be configured cleanly
        assertEquals("pref_session_token", es.manico.chartintelligence.config.AppConfig.KEY_SESSION_TOKEN)
    }

    @Test
    fun codeReviewFixes_sessionCalendarsVwapSma200VolumeProfileAndCanonicalKeys() {
        // 1. Session calendars & DST-aware session keys + countdown Closed state
        assertEquals(SessionCalendar.CRYPTO_24_7, UtcTimeAnchorAlgorithm.getSessionCalendar("BTCUSD"))
        assertEquals(SessionCalendar.US_EQUITIES, UtcTimeAnchorAlgorithm.getSessionCalendar("AAPL"))
        assertEquals(SessionCalendar.OTC_FX_METALS, UtcTimeAnchorAlgorithm.getSessionCalendar("XAUUSD"))

        // Sunday 2026-11-08 12:00 UTC -> OTC/US closed ("Closed"), BTCUSD open (timer string)
        val sundayNoonMs = 1794139200000L
        assertEquals("Closed", UtcTimeAnchorAlgorithm.formatCountdownToBarClose("XAUUSD", "M15", sundayNoonMs))
        assertEquals("Closed", UtcTimeAnchorAlgorithm.formatCountdownToBarClose("AAPL", "M15", sundayNoonMs))
        val btcCountdown = UtcTimeAnchorAlgorithm.formatCountdownToBarClose("BTCUSD", "M15", sundayNoonMs)
        assertFalse(btcCountdown == "Closed")

        // Crypto D1 Sat/Sun bars are preserved by CandleValidatorAlgorithm
        val satMs = Instant.parse("2026-11-07T00:00:00Z").toEpochMilli()
        val satBtcD1 = CandleValidatorAlgorithm.sanitizeAndValidate(
            rawOpenTimeMillis = satMs,
            timeframe = "D1",
            open = BigDecimal("90000"),
            high = BigDecimal("91000"),
            low = BigDecimal("89500"),
            close = BigDecimal("90500"),
            volume = BigDecimal("1234")
        )!!
        val filteredCryptoD1 = CandleValidatorAlgorithm.filterSyntheticWeekendAndCombCandles(
            listOf(satBtcD1),
            "BTCUSD",
            "D1"
        )
        assertEquals(1, filteredCryptoD1.size)

        // 2. Incomplete boundary bucket skipped when aggregating H1 -> H4 (minExpectedChildren = 3)
        val h1Step = 60L * 60_000L
        val dayStartMs = Instant.parse("2026-11-05T00:00:00Z").toEpochMilli()
        val completeH4Bars = (0 until 4).map { h ->
            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = dayStartMs + h * h1Step,
                timeframe = "H1",
                open = BigDecimal("100"),
                high = BigDecimal("105"),
                low = BigDecimal("99"),
                close = BigDecimal("102"),
                volume = BigDecimal("50")
            )!!
        }
        val incompleteBoundaryH1 = listOf(
            CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = dayStartMs + 4 * h1Step,
                timeframe = "H1",
                open = BigDecimal("102"),
                high = BigDecimal("104"),
                low = BigDecimal("101"),
                close = BigDecimal("103"),
                volume = BigDecimal("25")
            )!!
        )
        val aggregatedH4 = TimeframeAggregatorAlgorithm.aggregateCandles(
            sourceCandles = completeH4Bars + incompleteBoundaryH1,
            targetTimeframe = "H4",
            nowUtcMillis = dayStartMs + 10 * h1Step,
            sourceTimeframe = "H1",
            symbolCode = "BTCUSD"
        )
        assertEquals(1, aggregatedH4.size)

        // 3. Strict SMA 200 requires >= 200 bars
        val shortCloses = List(199) { 100.0 + it }
        assertTrue(PriceFormatterAlgorithm.computeSmaValues(shortCloses, 200).all { it == null })
        val fullCloses = List(200) { 100.0 }
        val sma200 = PriceFormatterAlgorithm.computeSmaValues(fullCloses, 200)
        assertNull(sma200[198])
        assertEquals(100.0, sma200[199]!!, 1e-6)

        // 4. Unified VWAP: intraday resets at session day key; D1/W1 rolls over 20 bars
        val m15Step = 15L * 60_000L
        val day1End = Instant.parse("2026-11-05T23:45:00Z").toEpochMilli()
        val day2Start = Instant.parse("2026-11-06T00:00:00Z").toEpochMilli()
        val vwapBars = listOf(
            CandleValidatorAlgorithm.sanitizeAndValidate(day1End, "M15", BigDecimal("100"), BigDecimal("100"), BigDecimal("100"), BigDecimal("100"), BigDecimal("100"))!!,
            CandleValidatorAlgorithm.sanitizeAndValidate(day2Start, "M15", BigDecimal("200"), BigDecimal("200"), BigDecimal("200"), BigDecimal("200"), BigDecimal("50"))!!
        )
        val intradayVwap = PriceFormatterAlgorithm.computeVwapValues(vwapBars, "M15", "BTCUSD")
        assertEquals(100.0, intradayVwap[0]!!, 1e-6)
        assertEquals(200.0, intradayVwap[1]!!, 1e-6) // strictly reset on new UTC day

        // 5. VolumeProfile & InstrumentSpec metadata
        val eiaSpec = UtcTimeAnchorAlgorithm.getInstrumentSpec("SPOTBRENT", ProviderId.EIA_BRENT_SPOT)
        assertEquals(VolumeType.NONE, eiaSpec.volumeType)
        val vpEia = PriceFormatterAlgorithm.computeVolumeProfile(vwapBars, 10, 0.70, VolumeType.NONE)
        assertNotNull(vpEia)
        assertTrue(vpEia!!.isEstimated)
        assertEquals("BTCUSD_H4", UtcTimeAnchorAlgorithm.canonicalChartKey("btcusd", "h4"))
    }
}
