package es.manico.chartintelligence.data.model

import androidx.annotation.StringRes
import es.manico.chartintelligence.R

enum class ProviderId(
    val id: String,
    val badgeLabel: String,
    @StringRes val titleResId: Int,
    val defaultTimeframe: String
) {
    TWELVE_DATA(
        id = "twelve_data",
        badgeLabel = "TwelveData",
        titleResId = R.string.provider_twelve_data,
        defaultTimeframe = "M15"
    ),
    TVDATAFEED(
        id = "tvdatafeed",
        badgeLabel = "TradingView",
        titleResId = R.string.provider_tvdatafeed,
        defaultTimeframe = "M15"
    ),
    DUKASCOPY(
        id = "dukascopy",
        badgeLabel = "Dukascopy",
        titleResId = R.string.provider_dukascopy,
        defaultTimeframe = "M15"
    ),
    EIA_BRENT_SPOT(
        id = "eia_brent_spot",
        badgeLabel = "EIA FOB D1",
        titleResId = R.string.provider_eia,
        defaultTimeframe = "D1"
    ),
    YAHOO_FINANCE(
        id = "yahoo_finance",
        badgeLabel = "Yahoo Finance",
        titleResId = R.string.provider_yahoo,
        defaultTimeframe = "M15"
    );

    companion object {
        fun fromId(id: String?): ProviderId {
            return entries.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: DUKASCOPY
        }
    }
}
