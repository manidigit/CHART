package es.manico.chartintelligence.data.model

import androidx.annotation.StringRes
import es.manico.chartintelligence.algorithms.ConnectionStatus
import java.math.BigDecimal

enum class AssetClass {
    STOCKS,
    COMMODITIES,
    CRYPTO,
    INDICES,
    FX
}

fun assetClassForSymbol(symbolCode: String): AssetClass {
    val code = symbolCode.trim().uppercase()
    return when {
        code in setOf("SPOTBRENT", "BRENT_FUTURES", "USOIL", "XAUUSD", "XAGUSD") ||
            code.contains("BRENT") || code.contains("OIL") || code.startsWith("XAU") || code.startsWith("XAG") -> AssetClass.COMMODITIES
        code in setOf("BTCUSD", "ETHUSD") || code.endsWith("USDT") ||
            (code.endsWith("USD") && (code.startsWith("BTC") || code.startsWith("ETH") || code.startsWith("SOL") || code.startsWith("XRP"))) -> AssetClass.CRYPTO
        code in setOf("SPX500USD", "NDQ") || code.contains("SPX") || code.contains("NDX") || code.contains("US100") || code.contains("US500") -> AssetClass.INDICES
        code in setOf("EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF") ||
            (code.length == 6 && (code.startsWith("EUR") || code.startsWith("GBP") || code.endsWith("JPY"))) -> AssetClass.FX
        else -> AssetClass.STOCKS
    }
}

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
    val prevClose: BigDecimal? = null,
    val dayOpen: BigDecimal? = null,
    val dayHigh: BigDecimal? = null,
    val dayLow: BigDecimal? = null,
    val dayVolume: BigDecimal? = null,
    val lastCandleUtc: String? = null,
    val storedCandleCount: Int = 0,
    val lastSyncMode: String = "DB_CACHE_HIT",
    val fetchedNewBars: Int = 0,
    val isSyncing: Boolean = false,
    val syncErrorText: String? = null,
    val providerStatus: String = "READY",
    val lastSuccessfulFetchMs: Long = 0L,
    val lastCandleCloseMs: Long = 0L,
    val connectionStatus: ConnectionStatus = ConnectionStatus.CONNECTED_LIVE
) {
    val compositeTabKey: String
        get() = "${symbolCode}_${activeProvider.id}_${timeframe}"

    val isCustom: Boolean
        get() = !customTitle.isNullOrBlank() || titleResId == null

    val assetClass: AssetClass
        get() = assetClassForSymbol(symbolCode)
}
