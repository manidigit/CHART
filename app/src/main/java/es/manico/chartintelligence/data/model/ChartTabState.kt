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
    val yPriceScaleFactor: Float = 1.0f,
    val activeDateRange: String? = null,
    val showVolume: Boolean = true,
    val volumePaneRatio: Float = 0.22f,
    val showSma20: Boolean = false,
    val activeDrawingTool: DrawingTool = DrawingTool.CURSOR,
    val activeDrawingColorHex: String = "FF2962FF",
    val activeDrawingWidthDp: Float = 2.2f,
    val isDrawingDockCollapsed: Boolean = true,
    val drawings: List<ChartDrawing> = emptyList(),
    val selectedDrawingId: String? = null,
    val pendingTrendPoint: TrendAnchorPoint? = null,
    val isLoading: Boolean = false,
    val hasError: Boolean = false
) {
    val tabTitle: String
        get() = "$symbolCode · ${provider.badgeLabel}"

    val allowedTimeframes: List<String>
        get() = if (provider == ProviderId.EIA_BRENT_SPOT) {
            listOf("D1")
        } else {
            AppConfig.SUPPORTED_TIMEFRAMES
        }

    fun computeDateRangePresets(): List<DateRangePresetOption> {
        val total = candles.size
        if (total == 0) {
            return listOf("1D", "5D", "1M", "3M", "YTD", "1Y", "All").map {
                DateRangePresetOption(it, it, false, AppConfig.MIN_VISIBLE_CANDLES)
            }
        }
        val firstTs = candles.first().openTimeUtcMillis
        val lastTs = candles.last().openTimeUtcMillis
        val spanMs = max(0L, lastTs - firstTs)
        val dayMs = 86_400_000L
        val lastYear = Instant.ofEpochMilli(lastTs).atZone(ZoneOffset.UTC).year
        val ytdStartMs = Instant.parse("${lastYear}-01-01T00:00:00Z").toEpochMilli()

        data class Spec(val id: String, val durationMs: Long, val minSpanMs: Long)
        val specs = listOf(
            Spec("1D", 1L * dayMs, 0L),
            Spec("5D", 5L * dayMs, 1L * dayMs),
            Spec("1M", 30L * dayMs, 5L * dayMs),
            Spec("3M", 90L * dayMs, 25L * dayMs),
            Spec("YTD", max(dayMs, lastTs - ytdStartMs), 14L * dayMs),
            Spec("1Y", 365L * dayMs, 90L * dayMs),
            Spec("All", max(dayMs, spanMs), 0L)
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
                val enabled = spanMs >= spec.minSpanMs && matching >= 2
                val target = min(total, max(AppConfig.MIN_VISIBLE_CANDLES, matching))
                DateRangePresetOption(
                    id = spec.id,
                    label = spec.id,
                    enabled = enabled,
                    targetBars = target
                )
            }
        }
    }
}
