package es.manico.chartintelligence.data.model

import java.math.BigDecimal

data class CandleBar(
    val openTimeUtcMillis: Long,
    val openTimeUtcIso: String,
    val open: BigDecimal,
    val high: BigDecimal,
    val low: BigDecimal,
    val close: BigDecimal,
    val volume: BigDecimal,
    val isClosed: Boolean = true
) {
    val isBullish: Boolean
        get() = close >= open
}
