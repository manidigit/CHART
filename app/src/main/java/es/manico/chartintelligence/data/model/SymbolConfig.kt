package es.manico.chartintelligence.data.model

import androidx.annotation.StringRes
import java.math.BigDecimal

data class SymbolConfig(
    val chartId: String,
    val symbolCode: String,
    @StringRes val titleResId: Int,
    val decimals: Int,
    val inWatchlist: Boolean,
    val activeProvider: ProviderId,
    val allowedProviders: List<ProviderId>,
    val timeframe: String,
    val lastClose: BigDecimal? = null,
    val lastCandleUtc: String? = null,
    val storedCandleCount: Int = 0,
    val isSyncing: Boolean = false,
    val syncErrorText: String? = null
) {
    val compositeTabKey: String
        get() = "${symbolCode}_${activeProvider.id}_${timeframe}"
}
