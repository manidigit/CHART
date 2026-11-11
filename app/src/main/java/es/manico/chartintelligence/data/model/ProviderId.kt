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

        val providerMethodCatalog: List<ProviderMethodSpec> = listOf(
            ProviderMethodSpec(
                providerId = TVDATAFEED,
                methodCode = "METHOD_TV_WICK_WS",
                nameFa = "TradingView Wick / WebSocket Engine",
                nameEn = "TradingView Wick / WebSocket Engine",
                formulaFa = "اتصال مستقیم سوکت به فید رسمی TradingView (PEPPERSTONE / OANDA / NYMEX) + تجمیع دقیق M15→H1→H4 روی ساعت 00:00 UTC و حذف تیک‌های مصنوعی آخر هفته",
                formulaEn = "Direct WebSocket stream (wss://data.tradingview.com) + deterministic M15->H1->H4 UTC bucket aggregation & weekend comb filter",
                endpointProtocol = "WSS Socket.IO + Local Python/PHP Bridge (tvdatafeed)",
                persistenceRule = "UNIQUE(chart_id, 'tvdatafeed', timeframe, open_time_utc) — بدون جایگزینی پنهان (Strict Isolation)",
                supportedTimeframes = listOf("M15", "H1", "H4", "D1"),
                supportedSymbols = listOf(
                    ProviderSourceSymbolSpec("SPOTBRENT", "PEPPERSTONE:SPOTBRENT", "نفت برنت اسپات (Pepperstone)", "Brent Crude Spot (Pepperstone)"),
                    ProviderSourceSymbolSpec("XAUUSD", "OANDA:XAUUSD", "طلای جهانی اسپات (OANDA)", "Gold Spot (OANDA)"),
                    ProviderSourceSymbolSpec("BRENT_FUTURES", "NYMEX:BZ1!", "آتی نفت برنت (NYMEX BZ1!)", "Brent Futures (NYMEX BZ1!)"),
                    ProviderSourceSymbolSpec("XAGUSD", "OANDA:XAGUSD", "نقره جهانی اسپات (OANDA)", "Silver Spot (OANDA)"),
                    ProviderSourceSymbolSpec("EURUSD", "OANDA:EURUSD", "یورو به دلار آمریکا (OANDA)", "EUR/USD (OANDA)"),
                    ProviderSourceSymbolSpec("GBPUSD", "OANDA:GBPUSD", "پوند به دلار آمریکا (OANDA)", "GBP/USD (OANDA)"),
                    ProviderSourceSymbolSpec("USDJPY", "OANDA:USDJPY", "دلار به ین ژاپن (OANDA)", "USD/JPY (OANDA)"),
                    ProviderSourceSymbolSpec("BTCUSD", "COINBASE:BTCUSD", "بیت‌کوین به دلار (Coinbase)", "Bitcoin / USD (Coinbase)")
                )
            ),
            ProviderMethodSpec(
                providerId = TWELVE_DATA,
                methodCode = "METHOD_TWELVEDATA_REST",
                nameFa = "Twelve Data REST Time-Series API",
                nameEn = "Twelve Data REST Time-Series API",
                formulaFa = "فراخوانی REST API رسمی Twelve Data (/time_series?timezone=UTC) با کلید اختصاصی، فیلتر کندل‌های باز و حذف کندل‌های صاف آخر هفته",
                formulaEn = "Official Twelve Data REST /time_series (UTC) with API key, closed-bar validation & flat weekend bar stripping",
                endpointProtocol = "HTTPS REST JSON (api.twelvedata.com/time_series)",
                persistenceRule = "UNIQUE(chart_id, 'twelve_data', timeframe, open_time_utc) — بدون جایگزینی پنهان (Strict Isolation)",
                supportedTimeframes = listOf("M15", "H1", "H4", "D1"),
                supportedSymbols = listOf(
                    ProviderSourceSymbolSpec("XAUUSD", "XAU/USD", "طلای جهانی اسپات (XAU/USD)", "Gold Spot (XAU/USD)"),
                    ProviderSourceSymbolSpec("SPOTBRENT", "XBR/USD", "نفت برنت اسپات (XBR/USD)", "Brent Spot (XBR/USD)"),
                    ProviderSourceSymbolSpec("XAGUSD", "XAG/USD", "نقره جهانی اسپات (XAG/USD)", "Silver Spot (XAG/USD)"),
                    ProviderSourceSymbolSpec("EURUSD", "EUR/USD", "یورو به دلار آمریکا (EUR/USD)", "Euro / US Dollar (EUR/USD)"),
                    ProviderSourceSymbolSpec("GBPUSD", "GBP/USD", "پوند به دلار آمریکا (GBP/USD)", "GBP / US Dollar (GBP/USD)"),
                    ProviderSourceSymbolSpec("USDJPY", "USD/JPY", "دلار به ین ژاپن (USD/JPY)", "US Dollar / Yen (USD/JPY)"),
                    ProviderSourceSymbolSpec("BTCUSD", "BTC/USD", "بیت‌کوین به دلار (BTC/USD)", "Bitcoin / USD (BTC/USD)")
                )
            ),
            ProviderMethodSpec(
                providerId = DUKASCOPY,
                methodCode = "METHOD_DUKASCOPY_SWISS",
                nameFa = "Dukascopy Swiss Bank Feed",
                nameEn = "Dukascopy Swiss Bank Feed",
                formulaFa = "دریافت کندل‌های بین‌بانکی سوئیس (Dukascopy Bank SA) تراز شده با ساعت 00:00 UTC بدون نیاز به کلید API",
                formulaEn = "Swiss interbank OHLCV feed aligned to 00:00 UTC boundaries (Zero-Key Free Feed)",
                endpointProtocol = "HTTPS JSON Feed (Dukascopy Bank SA)",
                persistenceRule = "UNIQUE(chart_id, 'dukascopy', timeframe, open_time_utc) — بدون جایگزینی پنهان (Strict Isolation)",
                supportedTimeframes = listOf("M15", "H1", "H4", "D1"),
                supportedSymbols = listOf(
                    ProviderSourceSymbolSpec("XAUUSD", "XAUUSD", "طلای بین‌بانکی سوئیس", "Swiss Interbank Gold"),
                    ProviderSourceSymbolSpec("SPOTBRENT", "BRENT.CMD/USD", "نفت برنت بین‌بانکی", "Interbank Brent Crude"),
                    ProviderSourceSymbolSpec("XAGUSD", "XAGUSD", "نقره بین‌بانکی سوئیس", "Swiss Interbank Silver"),
                    ProviderSourceSymbolSpec("EURUSD", "EURUSD", "یورو / دلار بین‌بانکی", "Interbank EUR/USD"),
                    ProviderSourceSymbolSpec("GBPUSD", "GBPUSD", "پوند / دلار بین‌بانکی", "Interbank GBP/USD"),
                    ProviderSourceSymbolSpec("USDJPY", "USDJPY", "دلار / ین بین‌بانکی", "Interbank USD/JPY")
                )
            ),
            ProviderMethodSpec(
                providerId = YAHOO_FINANCE,
                methodCode = "METHOD_YAHOO_V8_CHART",
                nameFa = "Yahoo Finance v8 Market Chart Engine",
                nameEn = "Yahoo Finance v8 Market Chart Engine",
                formulaFa = "دریافت مستقیم قراردادهای آتی و اسپات از موتور v8 یاهو فایننس (BZ=F / GC=F) و تجمیع استاندارد H1 به H4",
                formulaEn = "Yahoo Finance v8 chart endpoint (BZ=F, GC=F, SI=F, EURUSD=X) with H1->H4 UTC aggregation",
                endpointProtocol = "HTTPS REST v8 (query1.finance.yahoo.com/v8/finance/chart)",
                persistenceRule = "UNIQUE(chart_id, 'yahoo_finance', timeframe, open_time_utc) — بدون جایگزینی پنهان (Strict Isolation)",
                supportedTimeframes = listOf("M15", "H1", "H4", "D1"),
                supportedSymbols = listOf(
                    ProviderSourceSymbolSpec("BRENT_FUTURES", "BZ=F", "آتی نفت برنت (ICE BZ=F)", "Brent Crude Futures (BZ=F)"),
                    ProviderSourceSymbolSpec("SPOTBRENT", "BZ=F", "نفت برنت مرجع یاهو (BZ=F)", "Brent Reference (BZ=F)"),
                    ProviderSourceSymbolSpec("XAUUSD", "GC=F", "طلای جهانی مرجع (GC=F)", "Gold Futures/Spot (GC=F)"),
                    ProviderSourceSymbolSpec("XAGUSD", "SI=F", "نقره جهانی مرجع (SI=F)", "Silver Futures/Spot (SI=F)"),
                    ProviderSourceSymbolSpec("EURUSD", "EURUSD=X", "یورو به دلار (EURUSD=X)", "EUR/USD (EURUSD=X)"),
                    ProviderSourceSymbolSpec("GBPUSD", "GBPUSD=X", "پوند به دلار (GBPUSD=X)", "GBP/USD (GBPUSD=X)"),
                    ProviderSourceSymbolSpec("USDJPY", "JPY=X", "دلار به ین (JPY=X)", "USD/JPY (JPY=X)"),
                    ProviderSourceSymbolSpec("BTCUSD", "BTC-USD", "بیت‌کوین به دلار (BTC-USD)", "Bitcoin / USD (BTC-USD)")
                )
            ),
            ProviderMethodSpec(
                providerId = EIA_BRENT_SPOT,
                methodCode = "METHOD_EIA_FOB_DAILY",
                nameFa = "U.S. EIA Europe Brent Spot FOB (D1 Official)",
                nameEn = "U.S. EIA Europe Brent Spot FOB (D1 Official)",
                formulaFa = "سری زمانی رسمی روزانه اداره اطلاعات انرژی آمریکا (EIA Europe Brent Spot Price FOB) از ۱۹۸۷ تا امروز در تایم‌فریم روزانه D1",
                formulaEn = "Official U.S. Energy Information Administration Europe Brent Spot FOB daily benchmark series (D1 only)",
                endpointProtocol = "HTTPS Official CSV/JSON Mirror (EIA / DataHub D1)",
                persistenceRule = "UNIQUE(chart_id, 'eia_brent_spot', 'D1', open_time_utc) — بدون جایگزینی پنهان (Strict Isolation)",
                supportedTimeframes = listOf("D1"),
                supportedSymbols = listOf(
                    ProviderSourceSymbolSpec("SPOTBRENT", "PET.RBRTE.D", "نفت برنت اسپات اروپا (EIA FOB D1)", "Europe Brent Spot FOB (D1)"),
                    ProviderSourceSymbolSpec("BRENT_FUTURES", "PET.RBRTE.D", "مرجع روزانه برنت (EIA FOB D1)", "Brent Daily Benchmark (D1)")
                )
            )
        )
    }
}

data class ProviderSourceSymbolSpec(
    val symbolCode: String,
    val providerTicker: String,
    val labelFa: String,
    val labelEn: String
)

data class ProviderMethodSpec(
    val providerId: ProviderId,
    val methodCode: String,
    val nameFa: String,
    val nameEn: String,
    val formulaFa: String,
    val formulaEn: String,
    val endpointProtocol: String,
    val persistenceRule: String,
    val supportedTimeframes: List<String>,
    val supportedSymbols: List<ProviderSourceSymbolSpec>
)

