package es.manico.chartintelligence.data.model

import es.manico.chartintelligence.algorithms.ConnectionStatus
import es.manico.chartintelligence.config.AppConfig
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneOffset
import kotlin.math.max
import kotlin.math.min

data class ChartTabState(
    val tabId: String,
    val chartId: String,
    val symbolCode: String,
    val decimals: Int,
    val provider: ProviderId,
    val timeframe: String = AppConfig.DEFAULT_TIMEFRAME,
    val chartType: ChartType = ChartType.CANDLESTICK,
    val candles: List<CandleBar> = emptyList(),
    val visibleCandleCount: Int = AppConfig.DEFAULT_VISIBLE_CANDLES,
    val scrollOffsetFromRight: Int = 0,
    val selectedCandleIndex: Int? = null,
    val isAutoScaleY: Boolean = true,
    val isLogScale: Boolean = false,
    val yPriceScaleFactor: Float = 1.0f,
    val activeDateRange: String? = null,
    val showVolume: Boolean = true,
    val volumePaneRatio: Float = 0.22f,
    val showSma20: Boolean = false,
    val showSma50: Boolean = false,
    val showSma200: Boolean = false,
    val showEma20: Boolean = false,
    val showEma50: Boolean = false,
    val showEma200: Boolean = false,
    val showBollinger: Boolean = false,
    val showSupertrend: Boolean = false,
    val showVwap: Boolean = false,
    val showPsar: Boolean = false,
    val showIchimoku: Boolean = false,
    val showKeltner: Boolean = false,
    val showDonchian: Boolean = false,
    val showMtfEma: Boolean = false,
    val showKillzones: Boolean = false,
    val showRsi14: Boolean = false,
    val showMacd: Boolean = false,
    val showOverlayMacd: Boolean = false,
    val showAtr14: Boolean = false,
    val showAdx14: Boolean = false,
    val showStoch14: Boolean = false,
    val showCci20: Boolean = false,
    val showWillR14: Boolean = false,
    val showObv: Boolean = false,
    val showCmf20: Boolean = false,
    val showRoc12: Boolean = false,
    val showSmcStructure: Boolean = false,
    val showFvg: Boolean = false,
    val showVolumeProfile: Boolean = false,
    val showPivotPoints: Boolean = false,
    val pivotType: String = "STANDARD",
    val showFutureProjection: Boolean = false,
    val pitchforkVariant: String = "original",
    val activeDrawingTool: DrawingTool = DrawingTool.CURSOR,
    val activeDrawingColorHex: String = "FF2962FF",
    val activeDrawingWidthDp: Float = 2.0f,
    val isDrawingDockCollapsed: Boolean = true,
    val isMagnetMode: Boolean = false,
    val drawings: List<ChartDrawing> = emptyList(),
    val selectedDrawingId: String? = null,
    val pendingTrendPoint: TrendAnchorPoint? = null,
    val pendingAnchors: List<DrawingAnchor> = emptyList(),
    val isLoading: Boolean = false,
    val hasError: Boolean = false,
    val providerStatus: String = "READY",
    val syncErrorText: String? = null,
    val lastSuccessfulFetchMs: Long = 0L,
    val lastCandleCloseMs: Long = 0L,
    val connectionStatus: ConnectionStatus = ConnectionStatus.CONNECTED_LIVE,
    val sessionPrevClose: BigDecimal? = null,
    val liveQuotePrice: BigDecimal? = null,
    val liveQuoteMode: String? = null,
    val formingBar: CandleBar? = null,
    val gapSummary: es.manico.chartintelligence.algorithms.GapReport? = null
) {
    val tabTitle: String
        get() = "$symbolCode · ${provider.badgeLabel}"

    val allowedTimeframes: List<String>
        get() = if (provider == ProviderId.EIA_BRENT_SPOT || provider == ProviderId.STOOQ) {
            listOf("D1", "W1")
        } else {
            AppConfig.SUPPORTED_TIMEFRAMES
        }

    fun computeDateRangePresets(): List<DateRangePresetOption> {
        val allPresetIds = listOf("1D", "5D", "1W", "1M", "3M", "6M", "9M", "YTD", "1Y", "5Y", "All")
        val total = candles.size
        if (total == 0) {
            return allPresetIds.map {
                DateRangePresetOption(it, it, false, AppConfig.MIN_VISIBLE_CANDLES)
            }
        }
        val firstTs = candles.first().openTimeUtcMillis
        val lastTs = candles.last().openTimeUtcMillis
        val spanMs = max(0L, lastTs - firstTs)
        val dayMs = 86_400_000L
        val lastYear = Instant.ofEpochMilli(lastTs).atZone(ZoneOffset.UTC).year
        val ytdStartMs = Instant.parse("${lastYear}-01-01T00:00:00Z").toEpochMilli()

        data class Spec(val id: String, val durationMs: Long, val defaultBars: Int)
        val specs = listOf(
            Spec("1D", 1L * dayMs, 60),
            Spec("5D", 5L * dayMs, 90),
            Spec("1W", 7L * dayMs, 110),
            Spec("1M", 30L * dayMs, 120),
            Spec("3M", 90L * dayMs, 90),
            Spec("6M", 180L * dayMs, 130),
            Spec("9M", 270L * dayMs, 195),
            Spec("YTD", max(dayMs, lastTs - ytdStartMs), 130),
            Spec("1Y", 365L * dayMs, 252),
            Spec("5Y", 1825L * dayMs, total),
            Spec("All", max(dayMs, spanMs), total)
        )

        return specs.map { spec ->
            if (spec.id == "All") {
                DateRangePresetOption(
                    id = "All",
                    label = "All",
                    enabled = total >= 2,
                    targetBars = total.coerceAtLeast(AppConfig.MIN_VISIBLE_CANDLES)
                )
            } else {
                val cutoff = lastTs - spec.durationMs
                val matching = candles.count { it.openTimeUtcMillis >= cutoff }
                val rawTarget = if (matching >= AppConfig.MIN_VISIBLE_CANDLES) {
                    matching
                } else {
                    spec.defaultBars
                }
                val target = min(total, max(AppConfig.MIN_VISIBLE_CANDLES, rawTarget))
                DateRangePresetOption(
                    id = spec.id,
                    label = spec.id,
                    enabled = total >= 2,
                    targetBars = target
                )
            }
        }
    }
}
