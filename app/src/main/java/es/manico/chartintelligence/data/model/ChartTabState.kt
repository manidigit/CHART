package es.manico.chartintelligence.data.model

import es.manico.chartintelligence.config.AppConfig

data class ChartTabState(
    val tabId: String,
    val chartId: String,
    val symbolCode: String,
    val decimals: Int,
    val provider: ProviderId,
    val timeframe: String,
    val candles: List<CandleBar>,
    val visibleCandleCount: Int = AppConfig.DEFAULT_VISIBLE_CANDLES,
    val scrollOffsetFromRight: Int = 0,
    val selectedCandleIndex: Int? = null
) {
    val tabTitle: String
        get() = "$symbolCode · ${provider.badgeLabel}"
}
