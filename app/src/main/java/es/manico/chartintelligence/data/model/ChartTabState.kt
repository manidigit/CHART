package es.manico.chartintelligence.data.model

import es.manico.chartintelligence.config.AppConfig

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
    val activeDrawingTool: DrawingTool = DrawingTool.CURSOR,
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
}
