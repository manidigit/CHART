package es.manico.chartintelligence.data.model

import androidx.annotation.StringRes
import java.math.BigDecimal

data class SymbolConfig(
    val chartId: String,
    val symbolCode: String,
    @StringRes val titleResId: Int? = null,
    val customTitle: String? = null,
    val decimals: Int = 2,
    val inWatchlist: Boolean = true,
    val activeProvider: ProviderId = ProviderId.DUKASCOPY,
    val allowedProviders: List<ProviderId> = listOf(
        ProviderId.DUKASCOPY,
        ProviderId.TWELVE_DATA,
        ProviderId.YAHOO_FINANCE
    ),
    val timeframe: String = "M15",
    val lastClose: BigDecimal? = null,
    val lastCandleUtc: String? = null,
    val storedCandleCount: Int = 0,
    val isSyncing: Boolean = false,
    val syncErrorText: String? = null
) {
    val compositeTabKey: String
        get() = "${symbolCode}_${activeProvider.id}_${timeframe}"

    val isCustom: Boolean
        get() = !customTitle.isNullOrBlank() || titleResId == null
}
