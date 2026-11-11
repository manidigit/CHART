package es.manico.chartintelligence.data.model

import es.manico.chartintelligence.config.AppConfig
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
    val showEma50: Boolean = false,
    val showBollinger: Boolean = false,
    val activeDrawingTool: DrawingTool = DrawingTool.CURSOR,
    val activeDrawingColorHex: String = "FF2962FF",
    val activeDrawingWidthDp: Float = 2.2f,
    val isDrawingDockCollapsed: Boolean = true,
    val isMagnetMode: Boolean = false,
    val drawings: List<ChartDrawing> = emptyList(),
    val selectedDrawingId: String? = null,
    val pendingTrendPoint: TrendAnchorPoint? = null,
    val isLoading: Boolean = false,
    val hasError: Boolean = false
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
            Spec("1D", 1L * dayMs, 96),
            Spec("5D", 5L * dayMs, 120),
            Spec("1W", 7L * dayMs, 168),
            Spec("1M", 30L * dayMs, 180),
            Spec("3M", 90L * dayMs, 90),
            Spec("6M", 180L * dayMs, 180),
            Spec("9M", 270L * dayMs, 270),
            Spec("YTD", max(dayMs, lastTs - ytdStartMs), 180),
            Spec("1Y", 365L * dayMs, 260),
            Spec("5Y", 1825L * dayMs, 260),
            Spec("All", max(dayMs, spanMs), total)
        )

        return specs.map { spec ->
            if (spec.id == "All") {
                DateRangePresetOption(
                    id = "All",
                    label = "All",
                    enabled = total >= 2,
                    targetBars = total.coerceIn(AppConfig.MIN_VISIBLE_CANDLES, max(AppConfig.MIN_VISIBLE_CANDLES, total))
                )
            } else {
                val cutoff = lastTs - spec.durationMs
                val matching = candles.count { it.openTimeUtcMillis >= cutoff }
                val target = if (matching >= 2) {
                    min(total, max(AppConfig.MIN_VISIBLE_CANDLES, matching))
                } else {
                    min(total, max(AppConfig.MIN_VISIBLE_CANDLES, spec.defaultBars))
                }
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
