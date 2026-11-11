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
    BIQUOTE(
        id = "biquote",
        badgeLabel = "biquote",
        titleResId = R.string.provider_biquote,
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
                formulaFa = "اتصال مستقیم سوکت به فید رسمی TradingView (PEPPERSTONE / OANDA / NASDAQ / NYSE) + تجمیع دقیق M15→H1→H4 روی ساعت 00:00 UTC و حذف تیک‌های مصنوعی آخر هفته",
                formulaEn = "Direct WebSocket stream (wss://data.tradingview.com) + deterministic M15->H1->H4 UTC bucket aggregation & weekend comb filter",
                endpointProtocol = "WSS Socket.IO + Local Python/PHP Bridge (tvdatafeed)",
                persistenceRule = "UNIQUE(chart_id, 'tvdatafeed', timeframe, open_time_utc) — بدون جایگزینی پنهان (Strict Isolation)",
                supportedTimeframes = listOf("M15", "H1", "H4", "D1"),
                supportedSymbols = listOf(
                    ProviderSourceSymbolSpec("SPOTBRENT", "PEPPERSTONE:SPOTBRENT", "نفت برنت اسپات (Pepperstone)", "Brent Crude Spot (Pepperstone)"),
                    ProviderSourceSymbolSpec("ETHUSD", "BITSTAMP:ETHUSD", "اتریوم / دلار آمریکا (Bitstamp)", "Ethereum / USD (Bitstamp)"),
                    ProviderSourceSymbolSpec("BTCUSD", "BITSTAMP:BTCUSD", "بیت‌کوین / دلار آمریکا (Bitstamp)", "Bitcoin / USD (Bitstamp)"),
                    ProviderSourceSymbolSpec("XAGUSD", "OANDA:XAGUSD", "نقره جهانی اسپات (OANDA)", "Silver Spot (OANDA)"),
                    ProviderSourceSymbolSpec("XAUUSD", "OANDA:XAUUSD", "طلای جهانی اسپات (OANDA)", "Gold Spot (OANDA)"),
                    ProviderSourceSymbolSpec("SPX500USD", "OANDA:SPX500USD", "شاخص S&P 500 آمریکا (OANDA)", "US SPX 500 (OANDA)"),
                    ProviderSourceSymbolSpec("NDQ", "NASDAQ:NDX", "شاخص نزدک ۱۰۰ آمریکا (NASDAQ)", "US 100 Index / Nasdaq 100"),
                    ProviderSourceSymbolSpec("EURUSD", "OANDA:EURUSD", "یورو / دلار آمریکا (OANDA)", "EUR/USD (OANDA)"),
                    ProviderSourceSymbolSpec("USOIL", "TVC:USOIL", "نفت خام سبک تگزاس (WTI)", "CFDs on WTI Crude Oil"),
                    ProviderSourceSymbolSpec("NVDA", "NASDAQ:NVDA", "سهام انویدیا (NVIDIA)", "NVIDIA Corporation"),
                    ProviderSourceSymbolSpec("AMZN", "NASDAQ:AMZN", "سهام آمازون (Amazon)", "Amazon.com, Inc."),
                    ProviderSourceSymbolSpec("TSLA", "NASDAQ:TSLA", "سهام تسلا (Tesla)", "Tesla, Inc."),
                    ProviderSourceSymbolSpec("AAPL", "NASDAQ:AAPL", "سهام اپل (Apple)", "Apple Inc."),
                    ProviderSourceSymbolSpec("GOOGL", "NASDAQ:GOOGL", "سهام آلفابت / گوگل (Google)", "Alphabet Inc (Google) Class A"),
                    ProviderSourceSymbolSpec("MSFT", "NASDAQ:MSFT", "سهام مایکروسافت (Microsoft)", "Microsoft Corp."),
                    ProviderSourceSymbolSpec("META", "NASDAQ:META", "سهام متا / فیسبوک (Meta)", "Meta Platforms, Inc."),
                    ProviderSourceSymbolSpec("NFLX", "NASDAQ:NFLX", "سهام نتفلیکس (Netflix)", "Netflix, Inc."),
                    ProviderSourceSymbolSpec("AMD", "NASDAQ:AMD", "سهام ای‌ام‌دی (AMD)", "Advanced Micro Devices Inc"),
                    ProviderSourceSymbolSpec("UBER", "NYSE:UBER", "سهام اوبر (Uber)", "Uber Technologies, Inc."),
                    ProviderSourceSymbolSpec("NKE", "NYSE:NKE", "سهام نایکی (Nike)", "Nike, Inc."),
                    ProviderSourceSymbolSpec("IBM", "NYSE:IBM", "سهام آی‌بی‌ام (IBM)", "International Business Machines"),
                    ProviderSourceSymbolSpec("SAN", "NYSE:SAN", "سهام بانک سانتاندر (Santander)", "Banco Santander, S.A.")
                )
            ),
            ProviderMethodSpec(
                providerId = BIQUOTE,
                methodCode = "METHOD_BIQUOTE_FEED",
                nameFa = "biquote Multi-Asset Feed (اولویت اول کریپتو و نقره)",
                nameEn = "biquote Multi-Asset Feed (Primary for Crypto & Silver)",
                formulaFa = "فید سریع و رایگان چنددارایی برای بیت‌کوین، اتریوم، نقره، طلا، نفت و یورو بدون نیاز به کلید API پولی و با ذخیره‌سازی افزایشی در MariaDB",
                formulaEn = "Free multi-asset feed for BTCUSD, ETHUSD, XAGUSD, XAUUSD, SPOTBRENT, USOIL, and EURUSD with incremental delta persistence",
                endpointProtocol = "HTTPS JSON Feed (biquote / Public Multi-Asset Engine)",
                persistenceRule = "UNIQUE(chart_id, 'biquote', timeframe, open_time_utc) — بدون جایگزینی پنهان (Strict Isolation)",
                supportedTimeframes = listOf("M15", "H1", "H4", "D1"),
                supportedSymbols = listOf(
                    ProviderSourceSymbolSpec("SPOTBRENT", "BIQUOTE:UKOIL", "نفت برنت اسپات (biquote)", "Brent Crude Spot (biquote)"),
                    ProviderSourceSymbolSpec("ETHUSD", "BIQUOTE:ETHUSD", "اتریوم / دلار آمریکا (biquote)", "Ethereum / USD (biquote)"),
                    ProviderSourceSymbolSpec("BTCUSD", "BIQUOTE:BTCUSD", "بیت‌کوین / دلار آمریکا (biquote)", "Bitcoin / USD (biquote)"),
                    ProviderSourceSymbolSpec("XAGUSD", "BIQUOTE:XAGUSD", "نقره جهانی / دلار آمریکا (biquote)", "Silver / USD (biquote)"),
                    ProviderSourceSymbolSpec("XAUUSD", "BIQUOTE:XAUUSD", "طلای جهانی اسپات (biquote)", "Gold Spot / USD (biquote)"),
                    ProviderSourceSymbolSpec("EURUSD", "BIQUOTE:EURUSD", "یورو / دلار آمریکا (biquote)", "Euro / USD (biquote)"),
                    ProviderSourceSymbolSpec("USOIL", "BIQUOTE:USOIL", "نفت خام WTI (biquote)", "WTI Crude Oil (biquote)")
                )
            ),
            ProviderMethodSpec(
                providerId = TWELVE_DATA,
                methodCode = "METHOD_TWELVEDATA_REST",
                nameFa = "Twelve Data REST Time-Series API (اولویت اول طلا XAUUSD)",
                nameEn = "Twelve Data REST Time-Series API (Primary for Gold XAUUSD)",
                formulaFa = "فراخوانی REST API رسمی Twelve Data (/time_series?timezone=UTC) با کلید اختصاصی، فیلتر کندل‌های باز و دریافت فقط کندل‌های جاافتاده جدید",
                formulaEn = "Official Twelve Data REST /time_series (UTC) with API key and incremental delta outputsize",
                endpointProtocol = "HTTPS REST JSON (api.twelvedata.com/time_series)",
                persistenceRule = "UNIQUE(chart_id, 'twelve_data', timeframe, open_time_utc) — بدون جایگزینی پنهان (Strict Isolation)",
                supportedTimeframes = listOf("M15", "H1", "H4", "D1"),
                supportedSymbols = listOf(
                    ProviderSourceSymbolSpec("SPOTBRENT", "XBR/USD", "نفت برنت اسپات (XBR/USD)", "Brent Crude Spot (XBR/USD)"),
                    ProviderSourceSymbolSpec("ETHUSD", "ETH/USD", "اتریوم / دلار آمریکا (ETH/USD)", "Ethereum / USD (ETH/USD)"),
                    ProviderSourceSymbolSpec("BTCUSD", "BTC/USD", "بیت‌کوین / دلار آمریکا (BTC/USD)", "Bitcoin / USD (BTC/USD)"),
                    ProviderSourceSymbolSpec("XAGUSD", "XAG/USD", "نقره جهانی اسپات (XAG/USD)", "Silver Spot (XAG/USD)"),
                    ProviderSourceSymbolSpec("XAUUSD", "XAU/USD", "طلای جهانی اسپات (XAU/USD)", "Gold Spot (XAU/USD)"),
                    ProviderSourceSymbolSpec("SPX500USD", "SPX", "شاخص S&P 500 آمریکا (SPX)", "US SPX 500 (SPX)"),
                    ProviderSourceSymbolSpec("NDQ", "NDX", "شاخص نزدک ۱۰۰ آمریکا (NDX)", "US 100 Index (NDX)"),
                    ProviderSourceSymbolSpec("EURUSD", "EUR/USD", "یورو / دلار آمریکا (EUR/USD)", "Euro / US Dollar (EUR/USD)"),
                    ProviderSourceSymbolSpec("USOIL", "WTI/USD", "نفت خام سبک تگزاس (WTI/USD)", "WTI Crude Oil (WTI/USD)"),
                    ProviderSourceSymbolSpec("NVDA", "NVDA", "سهام انویدیا (NVIDIA)", "NVIDIA Corporation"),
                    ProviderSourceSymbolSpec("AMZN", "AMZN", "سهام آمازون (Amazon)", "Amazon.com, Inc."),
                    ProviderSourceSymbolSpec("TSLA", "TSLA", "سهام تسلا (Tesla)", "Tesla, Inc."),
                    ProviderSourceSymbolSpec("AAPL", "AAPL", "سهام اپل (Apple)", "Apple Inc."),
                    ProviderSourceSymbolSpec("GOOGL", "GOOGL", "سهام آلفابت / گوگل (Google)", "Alphabet Inc Class A"),
                    ProviderSourceSymbolSpec("MSFT", "MSFT", "سهام مایکروسافت (Microsoft)", "Microsoft Corp."),
                    ProviderSourceSymbolSpec("META", "META", "سهام متا / فیسبوک (Meta)", "Meta Platforms, Inc."),
                    ProviderSourceSymbolSpec("NFLX", "NFLX", "سهام نتفلیکس (Netflix)", "Netflix, Inc."),
                    ProviderSourceSymbolSpec("AMD", "AMD", "سهام ای‌ام‌دی (AMD)", "Advanced Micro Devices Inc"),
                    ProviderSourceSymbolSpec("UBER", "UBER", "سهام اوبر (Uber)", "Uber Technologies, Inc."),
                    ProviderSourceSymbolSpec("NKE", "NKE", "سهام نایکی (Nike)", "Nike, Inc."),
                    ProviderSourceSymbolSpec("IBM", "IBM", "سهام آی‌بی‌ام (IBM)", "International Business Machines"),
                    ProviderSourceSymbolSpec("SAN", "SAN", "سهام بانک سانتاندر (Santander)", "Banco Santander, S.A.")
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
                    ProviderSourceSymbolSpec("SPOTBRENT", "BRENT.CMD/USD", "نفت برنت بین‌بانکی", "Interbank Brent Crude"),
                    ProviderSourceSymbolSpec("XAGUSD", "XAGUSD", "نقره بین‌بانکی سوئیس", "Swiss Interbank Silver"),
                    ProviderSourceSymbolSpec("XAUUSD", "XAUUSD", "طلای بین‌بانکی سوئیس", "Swiss Interbank Gold"),
                    ProviderSourceSymbolSpec("EURUSD", "EURUSD", "یورو / دلار بین‌بانکی", "Interbank EUR/USD")
                )
            ),
            ProviderMethodSpec(
                providerId = YAHOO_FINANCE,
                methodCode = "METHOD_YAHOO_V8_CHART",
                nameFa = "Yahoo Finance v8 Market Chart Engine (اولویت اول سهام و شاخص‌ها)",
                nameEn = "Yahoo Finance v8 Market Chart Engine (Primary for Stocks & Indices)",
                formulaFa = "مرجع رایگان و پایدار برای سهام آمریکا (NVDA تا SAN) و شاخص‌ها (SPX500USD، NDQ) + تجمیع استاندارد H1 به H4",
                formulaEn = "Primary free feed for US Equities (NVDA..SAN) and Indices (SPX500USD, NDQ) via Yahoo Finance v8 chart API",
                endpointProtocol = "HTTPS REST v8 (query1.finance.yahoo.com/v8/finance/chart)",
                persistenceRule = "UNIQUE(chart_id, 'yahoo_finance', timeframe, open_time_utc) — بدون جایگزینی پنهان (Strict Isolation)",
                supportedTimeframes = listOf("M15", "H1", "H4", "D1"),
                supportedSymbols = listOf(
                    ProviderSourceSymbolSpec("SPOTBRENT", "BZ=F", "نفت برنت مرجع یاهو (BZ=F)", "Brent Reference (BZ=F)"),
                    ProviderSourceSymbolSpec("ETHUSD", "ETH-USD", "اتریوم به دلار (ETH-USD)", "Ethereum / USD (ETH-USD)"),
                    ProviderSourceSymbolSpec("BTCUSD", "BTC-USD", "بیت‌کوین به دلار (BTC-USD)", "Bitcoin / USD (BTC-USD)"),
                    ProviderSourceSymbolSpec("XAGUSD", "SI=F", "نقره جهانی مرجع (SI=F)", "Silver Futures/Spot (SI=F)"),
                    ProviderSourceSymbolSpec("XAUUSD", "GC=F", "طلای جهانی مرجع (GC=F)", "Gold Futures/Spot (GC=F)"),
                    ProviderSourceSymbolSpec("SPX500USD", "^GSPC", "شاخص S&P 500 آمریکا (^GSPC)", "US SPX 500 (^GSPC)"),
                    ProviderSourceSymbolSpec("NDQ", "^NDX", "شاخص نزدک ۱۰۰ آمریکا (^NDX)", "US 100 Index (^NDX)"),
                    ProviderSourceSymbolSpec("EURUSD", "EURUSD=X", "یورو به دلار (EURUSD=X)", "EUR/USD (EURUSD=X)"),
                    ProviderSourceSymbolSpec("USOIL", "CL=F", "نفت خام سبک تگزاس (CL=F)", "WTI Crude Oil (CL=F)"),
                    ProviderSourceSymbolSpec("NVDA", "NVDA", "سهام انویدیا (NVIDIA)", "NVIDIA Corporation"),
                    ProviderSourceSymbolSpec("AMZN", "AMZN", "سهام آمازون (Amazon)", "Amazon.com, Inc."),
                    ProviderSourceSymbolSpec("TSLA", "TSLA", "سهام تسلا (Tesla)", "Tesla, Inc."),
                    ProviderSourceSymbolSpec("AAPL", "AAPL", "سهام اپل (Apple)", "Apple Inc."),
                    ProviderSourceSymbolSpec("GOOGL", "GOOGL", "سهام آلفابت / گوگل (Google)", "Alphabet Inc Class A"),
                    ProviderSourceSymbolSpec("MSFT", "MSFT", "سهام مایکروسافت (Microsoft)", "Microsoft Corp."),
                    ProviderSourceSymbolSpec("META", "META", "سهام متا / فیسبوک (Meta)", "Meta Platforms, Inc."),
                    ProviderSourceSymbolSpec("NFLX", "NFLX", "سهام نتفلیکس (Netflix)", "Netflix, Inc."),
                    ProviderSourceSymbolSpec("AMD", "AMD", "سهام ای‌ام‌دی (AMD)", "Advanced Micro Devices Inc"),
                    ProviderSourceSymbolSpec("UBER", "UBER", "سهام اوبر (Uber)", "Uber Technologies, Inc."),
                    ProviderSourceSymbolSpec("NKE", "NKE", "سهام نایکی (Nike)", "Nike, Inc."),
                    ProviderSourceSymbolSpec("IBM", "IBM", "سهام آی‌بی‌ام (IBM)", "International Business Machines"),
                    ProviderSourceSymbolSpec("SAN", "SAN", "سهام بانک سانتاندر (Santander)", "Banco Santander, S.A.")
                )
            ),
            ProviderMethodSpec(
                providerId = EIA_BRENT_SPOT,
                methodCode = "METHOD_EIA_FOB_DAILY",
                nameFa = "U.S. EIA Europe Brent Spot FOB (D1 Official)",
                nameEn = "U.S. EIA Europe Brent Spot FOB (D1 Official)",
                formulaFa = "سری زمانی رسمی روزانه اداره اطلاعات انرژی آمریکا (EIA Europe Brent Spot Price FOB) در تایم‌فریم روزانه D1",
                formulaEn = "Official U.S. Energy Information Administration Europe Brent Spot FOB daily benchmark series (D1 only)",
                endpointProtocol = "HTTPS Official CSV/JSON Mirror (EIA / DataHub D1)",
                persistenceRule = "UNIQUE(chart_id, 'eia_brent_spot', 'D1', open_time_utc) — بدون جایگزینی پنهان (Strict Isolation)",
                supportedTimeframes = listOf("D1"),
                supportedSymbols = listOf(
                    ProviderSourceSymbolSpec("SPOTBRENT", "PET.RBRTE.D", "نفت برنت اسپات اروپا (EIA FOB D1)", "Europe Brent Spot FOB (D1)")
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
