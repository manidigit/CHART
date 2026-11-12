<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

use ChartIntelligence\Core\Database;
use PDO;
use Throwable;

/**
 * Centralized Catalog of 6 Independent Data Collection Methods (`tvdatafeed`, `biquote`,
 * `twelve_data`, `dukascopy`, `yahoo_finance`, `eia_brent_spot`) and the 22 Canonical
 * Watchlist Symbols with their Asset-Class Priority Rules.
 */
final class ProviderCatalog
{
    public static function getCanonicalWatchlistDefinitions(): array
    {
        return [
            ['rank' => 1,  'symbol_code' => 'SPOTBRENT', 'title_en' => 'Brent Crude (Spot)',               'title_fa' => 'نفت برنت اسپات',                  'category' => 'ENERGY',  'decimals' => 3, 'default_provider' => 'tvdatafeed',    'priority_chain' => ['tvdatafeed', 'dukascopy', 'biquote', 'yahoo_finance', 'twelve_data', 'stooq', 'eia_brent_spot']],
            ['rank' => 2,  'symbol_code' => 'ETHUSD',    'title_en' => 'Ethereum / U.S. Dollar',           'title_fa' => 'اتریوم / دلار آمریکا',            'category' => 'CRYPTO',  'decimals' => 2, 'default_provider' => 'biquote',       'priority_chain' => ['biquote', 'yahoo_finance', 'twelve_data', 'tvdatafeed', 'stooq']],
            ['rank' => 3,  'symbol_code' => 'BTCUSD',    'title_en' => 'Bitcoin / U.S. Dollar',            'title_fa' => 'بیت‌کوین / دلار آمریکا',          'category' => 'CRYPTO',  'decimals' => 2, 'default_provider' => 'biquote',       'priority_chain' => ['biquote', 'yahoo_finance', 'twelve_data', 'tvdatafeed', 'stooq']],
            ['rank' => 4,  'symbol_code' => 'XAGUSD',    'title_en' => 'Silver / U.S. Dollar',             'title_fa' => 'نقره جهانی / دلار آمریکا',        'category' => 'METALS',  'decimals' => 3, 'default_provider' => 'biquote',       'priority_chain' => ['biquote', 'twelve_data', 'yahoo_finance', 'dukascopy', 'tvdatafeed', 'stooq']],
            ['rank' => 5,  'symbol_code' => 'XAUUSD',    'title_en' => 'Gold Spot / U.S. Dollar',          'title_fa' => 'طلای جهانی اسپات / دلار',         'category' => 'METALS',  'decimals' => 2, 'default_provider' => 'twelve_data',   'priority_chain' => ['twelve_data', 'biquote', 'dukascopy', 'yahoo_finance', 'tvdatafeed', 'stooq']],
            ['rank' => 6,  'symbol_code' => 'SPX500USD', 'title_en' => 'US SPX 500',                       'title_fa' => 'شاخص S&P 500 آمریکا',             'category' => 'INDICES', 'decimals' => 2, 'default_provider' => 'yahoo_finance', 'priority_chain' => ['yahoo_finance', 'tvdatafeed', 'twelve_data', 'stooq']],
            ['rank' => 7,  'symbol_code' => 'NDQ',       'title_en' => 'US 100 Index (Nasdaq 100)',        'title_fa' => 'شاخص نزدک ۱۰۰ آمریکا',            'category' => 'INDICES', 'decimals' => 2, 'default_provider' => 'yahoo_finance', 'priority_chain' => ['yahoo_finance', 'tvdatafeed', 'twelve_data', 'stooq']],
            ['rank' => 8,  'symbol_code' => 'EURUSD',    'title_en' => 'Euro / U.S. Dollar',               'title_fa' => 'یورو / دلار آمریکا',              'category' => 'FX',      'decimals' => 4, 'default_provider' => 'tvdatafeed',    'priority_chain' => ['tvdatafeed', 'twelve_data', 'biquote', 'dukascopy', 'yahoo_finance', 'stooq']],
            ['rank' => 9,  'symbol_code' => 'USOIL',     'title_en' => 'CFDs on WTI Crude Oil',            'title_fa' => 'نفت خام سبک تگزاس (WTI)',         'category' => 'ENERGY',  'decimals' => 2, 'default_provider' => 'tvdatafeed',    'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'biquote', 'twelve_data', 'stooq']],
            ['rank' => 10, 'symbol_code' => 'NVDA',      'title_en' => 'NVIDIA Corporation',               'title_fa' => 'سهام انویدیا (NVIDIA)',           'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'yahoo_finance', 'priority_chain' => ['yahoo_finance', 'twelve_data', 'tvdatafeed', 'stooq']],
            ['rank' => 11, 'symbol_code' => 'AMZN',      'title_en' => 'Amazon.com, Inc.',                 'title_fa' => 'سهام آمازون (Amazon)',            'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'yahoo_finance', 'priority_chain' => ['yahoo_finance', 'twelve_data', 'tvdatafeed', 'stooq']],
            ['rank' => 12, 'symbol_code' => 'TSLA',      'title_en' => 'Tesla, Inc.',                      'title_fa' => 'سهام تسلا (Tesla)',               'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'yahoo_finance', 'priority_chain' => ['yahoo_finance', 'twelve_data', 'tvdatafeed', 'stooq']],
            ['rank' => 13, 'symbol_code' => 'AAPL',      'title_en' => 'Apple Inc.',                       'title_fa' => 'سهام اپل (Apple)',                'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'yahoo_finance', 'priority_chain' => ['yahoo_finance', 'twelve_data', 'tvdatafeed', 'stooq']],
            ['rank' => 14, 'symbol_code' => 'GOOGL',     'title_en' => 'Alphabet Inc (Google) Class A',    'title_fa' => 'سهام آلفابت / گوگل (Google)',     'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'yahoo_finance', 'priority_chain' => ['yahoo_finance', 'twelve_data', 'tvdatafeed', 'stooq']],
            ['rank' => 15, 'symbol_code' => 'MSFT',      'title_en' => 'Microsoft Corp.',                  'title_fa' => 'سهام مایکروسافت (Microsoft)',     'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'yahoo_finance', 'priority_chain' => ['yahoo_finance', 'twelve_data', 'tvdatafeed', 'stooq']],
            ['rank' => 16, 'symbol_code' => 'META',      'title_en' => 'Meta Platforms, Inc.',             'title_fa' => 'سهام متا / فیسبوک (Meta)',        'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'yahoo_finance', 'priority_chain' => ['yahoo_finance', 'twelve_data', 'tvdatafeed', 'stooq']],
            ['rank' => 17, 'symbol_code' => 'NFLX',      'title_en' => 'Netflix, Inc.',                    'title_fa' => 'سهام نتفلیکس (Netflix)',          'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'yahoo_finance', 'priority_chain' => ['yahoo_finance', 'twelve_data', 'tvdatafeed', 'stooq']],
            ['rank' => 18, 'symbol_code' => 'AMD',       'title_en' => 'Advanced Micro Devices Inc',       'title_fa' => 'سهام ای‌ام‌دی (AMD)',             'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'yahoo_finance', 'priority_chain' => ['yahoo_finance', 'twelve_data', 'tvdatafeed', 'stooq']],
            ['rank' => 19, 'symbol_code' => 'UBER',      'title_en' => 'Uber Technologies, Inc.',          'title_fa' => 'سهام اوبر (Uber)',                'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'yahoo_finance', 'priority_chain' => ['yahoo_finance', 'twelve_data', 'tvdatafeed', 'stooq']],
            ['rank' => 20, 'symbol_code' => 'NKE',       'title_en' => 'Nike, Inc.',                       'title_fa' => 'سهام نایکی (Nike)',               'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'yahoo_finance', 'priority_chain' => ['yahoo_finance', 'twelve_data', 'tvdatafeed', 'stooq']],
            ['rank' => 21, 'symbol_code' => 'IBM',       'title_en' => 'International Business Machines',  'title_fa' => 'سهام آی‌بی‌ام (IBM)',             'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'yahoo_finance', 'priority_chain' => ['yahoo_finance', 'twelve_data', 'tvdatafeed', 'stooq']],
            ['rank' => 22, 'symbol_code' => 'SAN',       'title_en' => 'Banco Santander, S.A.',            'title_fa' => 'سهام بانک سانتاندر (Santander)',  'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'yahoo_finance', 'priority_chain' => ['yahoo_finance', 'twelve_data', 'tvdatafeed', 'stooq']],
        ];
    }

    public static function resolvePriceBasis(string $symbolCode, string $providerId): string
    {
        $sym = strtoupper(trim($symbolCode));
        $prov = strtolower(trim($providerId));
        return match ($prov) {
            'eia_brent_spot' => 'Official FOB Spot',
            'dukascopy' => 'Interbank Spot',
            'biquote' => 'CFD / MT5 Feed',
            'stooq' => 'EOD Historical',
            'twelve_data' => in_array($sym, ['NVDA', 'AMZN', 'TSLA', 'AAPL', 'GOOGL', 'MSFT', 'META', 'NFLX', 'AMD', 'UBER', 'NKE', 'IBM', 'SAN'], true)
                ? 'Official Exchange'
                : 'Spot REST',
            'yahoo_finance' => match ($sym) {
                'SPOTBRENT', 'USOIL', 'XAUUSD', 'XAGUSD', 'BRENT_FUTURES' => 'Futures Ref',
                'BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'USDJPY' => 'Spot FX/Crypto',
                default => 'Official Exchange',
            },
            default => match ($sym) {
                'SPOTBRENT', 'USOIL', 'SPX500USD' => 'CFD Feed',
                'XAUUSD', 'XAGUSD', 'EURUSD', 'BTCUSD', 'ETHUSD', 'GBPUSD', 'USDJPY' => 'Spot Feed',
                default => 'Official Exchange',
            },
        };
    }

    public static function resolveChartId(string $symbolCode): string
    {
        $clean = strtoupper(trim(preg_replace('/[^A-Za-z0-9_]/', '', $symbolCode)));
        return match ($clean) {
            'SPOTBRENT' => 'chart_spotbrent_main',
            'XAUUSD' => 'chart_xauusd_main',
            'BRENT_FUTURES' => 'chart_brent_futures',
            'SPX500USD' => 'chart_spx500usd_index',
            'NDQ' => 'chart_ndq_index',
            'ETHUSD', 'BTCUSD', 'XAGUSD', 'EURUSD', 'USOIL', 'GBPUSD', 'USDJPY' => 'chart_' . strtolower($clean) . '_spot',
            'NVDA', 'AMZN', 'TSLA', 'AAPL', 'GOOGL', 'MSFT', 'META', 'NFLX', 'AMD', 'UBER', 'NKE', 'IBM', 'SAN' => 'chart_' . strtolower($clean) . '_stock',
            default => 'chart_' . strtolower($clean) . '_custom',
        };
    }

    public static function getMethods(): array
    {
        $cfg = Database::getConfig();
        $hasTwelveKey = trim((string) ($cfg['TWELVE_DATA_API_KEY'] ?? '')) !== '';
        $defs = self::getCanonicalWatchlistDefinitions();

        $buildSymbolList = static function (array $tickerMap) use ($defs): array {
            $list = [];
            foreach ($defs as $d) {
                $code = $d['symbol_code'];
                if (isset($tickerMap[$code])) {
                    $list[] = [
                        'symbol_code' => $code,
                        'provider_ticker' => $tickerMap[$code],
                        'title_fa' => $d['title_fa'],
                        'title_en' => $d['title_en'],
                        'category' => $d['category'],
                        'decimals' => $d['decimals'],
                    ];
                }
            }
            return $list;
        };

        return [
            [
                'provider_id' => 'tvdatafeed',
                'badge_label' => 'TradingView Wick',
                'title_fa' => 'الگوریتم استخراج کندل و شدو از TradingView (tvdatafeed)',
                'title_en' => 'TradingView Wick & WebSocket Engine (tvdatafeed)',
                'method_type' => 'WSS_STREAM_AND_SEED',
                'requires_api_key' => false,
                'is_configured' => true,
                'status_code' => 'READY',
                'formula_fa' => 'آرشیو پایه ۵۰۰۰ کندل در دیتابیس مرکزی + دریافت افزایشی کندل‌های جدید از سوکت زنده wss://data.tradingview.com با تراز دقیق UTC 00:00 و حفظ کامل شدوها (Wicks).',
                'formula_en' => '5,000-bar base archive in MariaDB + incremental delta sync via wss://data.tradingview.com WebSocket with exact 00:00 UTC alignment and full wick preservation.',
                'supported_timeframes' => ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'],
                'storage_key_rule' => 'UNIQUE(chart_id, "tvdatafeed", timeframe, open_time_utc)',
                'symbols' => $buildSymbolList([
                    'SPOTBRENT' => 'PEPPERSTONE:SPOTBRENT',
                    'ETHUSD' => 'BITSTAMP:ETHUSD',
                    'BTCUSD' => 'BITSTAMP:BTCUSD',
                    'XAGUSD' => 'OANDA:XAGUSD',
                    'XAUUSD' => 'OANDA:XAUUSD',
                    'SPX500USD' => 'OANDA:SPX500USD',
                    'NDQ' => 'NASDAQ:NDX',
                    'EURUSD' => 'OANDA:EURUSD',
                    'USOIL' => 'TVC:USOIL',
                    'NVDA' => 'NASDAQ:NVDA',
                    'AMZN' => 'NASDAQ:AMZN',
                    'TSLA' => 'NASDAQ:TSLA',
                    'AAPL' => 'NASDAQ:AAPL',
                    'GOOGL' => 'NASDAQ:GOOGL',
                    'MSFT' => 'NASDAQ:MSFT',
                    'META' => 'NASDAQ:META',
                    'NFLX' => 'NASDAQ:NFLX',
                    'AMD' => 'NASDAQ:AMD',
                    'UBER' => 'NYSE:UBER',
                    'NKE' => 'NYSE:NKE',
                    'IBM' => 'NYSE:IBM',
                    'SAN' => 'NYSE:SAN',
                ]),
            ],
            [
                'provider_id' => 'biquote',
                'badge_label' => 'biquote Feed',
                'title_fa' => 'فید چنددارایی سریع و رایگان biquote (کریپتو، فلزات، انرژی و فارکس)',
                'title_en' => 'biquote Multi-Asset Feed (Crypto, Metals, Energy & FX)',
                'method_type' => 'MULTI_ASSET_PUBLIC_FEED',
                'requires_api_key' => false,
                'is_configured' => true,
                'status_code' => 'READY',
                'formula_fa' => 'اولویت اول برای بیت‌کوین، اتریوم و نقره؛ دریافت سریع کندل‌های بسته‌شده UTC بدون نیاز به کلید API پولی و ذخیره افزایشی فقط کندل‌های جدید در MariaDB.',
                'formula_en' => 'Primary free feed for BTCUSD, ETHUSD, and XAGUSD; fetches closed UTC candles without paid API keys and appends only incremental delta bars to MariaDB.',
                'supported_timeframes' => ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'],
                'storage_key_rule' => 'UNIQUE(chart_id, "biquote", timeframe, open_time_utc)',
                'symbols' => $buildSymbolList([
                    'SPOTBRENT' => 'BIQUOTE:UKOIL',
                    'ETHUSD' => 'BIQUOTE:ETHUSD',
                    'BTCUSD' => 'BIQUOTE:BTCUSD',
                    'XAGUSD' => 'BIQUOTE:XAGUSD',
                    'XAUUSD' => 'BIQUOTE:XAUUSD',
                    'EURUSD' => 'BIQUOTE:EURUSD',
                    'USOIL' => 'BIQUOTE:USOIL',
                ]),
            ],
            [
                'provider_id' => 'twelve_data',
                'badge_label' => 'Twelve Data API',
                'title_fa' => 'وب‌سرویس رسمی Twelve Data REST API',
                'title_en' => 'Twelve Data REST Time-Series API',
                'method_type' => 'REST_API_KEY',
                'requires_api_key' => true,
                'is_configured' => $hasTwelveKey,
                'status_code' => $hasTwelveKey ? 'READY' : 'API_KEY_OPTIONAL_ARCHIVE',
                'formula_fa' => 'اولویت اول برای طلای جهانی (XAUUSD)؛ فراخوانی اندپوینت api.twelvedata.com/time_series با کلید اختصاصی و دریافت صرفاً کندل‌های جدید جاافتاده (outputsize = deltaBars).',
                'formula_en' => 'Primary feed for XAUUSD; queries api.twelvedata.com/time_series with API key using incremental outputsize = deltaBars after initial history is stored in MariaDB.',
                'supported_timeframes' => ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'],
                'storage_key_rule' => 'UNIQUE(chart_id, "twelve_data", timeframe, open_time_utc)',
                'symbols' => $buildSymbolList([
                    'SPOTBRENT' => 'XBR/USD',
                    'ETHUSD' => 'ETH/USD',
                    'BTCUSD' => 'BTC/USD',
                    'XAGUSD' => 'XAG/USD',
                    'XAUUSD' => 'XAU/USD',
                    'SPX500USD' => 'SPX',
                    'NDQ' => 'NDX',
                    'EURUSD' => 'EUR/USD',
                    'USOIL' => 'WTI/USD',
                    'NVDA' => 'NVDA',
                    'AMZN' => 'AMZN',
                    'TSLA' => 'TSLA',
                    'AAPL' => 'AAPL',
                    'GOOGL' => 'GOOGL',
                    'MSFT' => 'MSFT',
                    'META' => 'META',
                    'NFLX' => 'NFLX',
                    'AMD' => 'AMD',
                    'UBER' => 'UBER',
                    'NKE' => 'NKE',
                    'IBM' => 'IBM',
                    'SAN' => 'SAN',
                ]),
            ],
            [
                'provider_id' => 'dukascopy',
                'badge_label' => 'Dukascopy Swiss',
                'title_fa' => 'فید بین‌بانکی دوکاسکپی سوئیس (Dukascopy Bank)',
                'title_en' => 'Dukascopy Swiss Bank Historical Feed',
                'method_type' => 'SWISS_BANK_FEED',
                'requires_api_key' => false,
                'is_configured' => true,
                'status_code' => 'READY',
                'formula_fa' => 'استخراج کندل‌های استاندارد بین‌بانکی سوئیس با حذف کامل کندل‌های مصنوعی تعطیلات آخر هفته (volume = 0) و ذخیره‌سازی ماندگار در جدول candles.',
                'formula_en' => 'Interbank historical OHLC feed with strict weekend synthetic tick filtering and permanent MariaDB persistence.',
                'supported_timeframes' => ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'],
                'storage_key_rule' => 'UNIQUE(chart_id, "dukascopy", timeframe, open_time_utc)',
                'symbols' => $buildSymbolList([
                    'SPOTBRENT' => 'BRENT.CMD/USD',
                    'XAGUSD' => 'XAG/USD',
                    'XAUUSD' => 'XAU/USD',
                    'EURUSD' => 'EUR/USD',
                ]),
            ],
            [
                'provider_id' => 'yahoo_finance',
                'badge_label' => 'Yahoo Finance v8',
                'title_fa' => 'موتور عمومی یاهو فایننس (Yahoo Finance Chart v8 — اولویت اول سهام و شاخص‌ها)',
                'title_en' => 'Yahoo Finance v8 Chart Engine (Primary for US Equities & Indices)',
                'method_type' => 'PUBLIC_REST_V8',
                'requires_api_key' => false,
                'is_configured' => true,
                'status_code' => 'READY',
                'formula_fa' => 'اولویت اول برای سهام آمریکا (NVDA تا SAN) و شاخص‌ها (SPX500USD، NDQ)؛ دریافت کندل از query1.finance.yahoo.com/v8/finance/chart با بازه کوتاه در حالت Delta Sync.',
                'formula_en' => 'Primary free engine for US Equities (NVDA..SAN) and Indices (SPX500USD, NDQ); fetches from query1.finance.yahoo.com/v8/finance/chart with short delta windows.',
                'supported_timeframes' => ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'],
                'storage_key_rule' => 'UNIQUE(chart_id, "yahoo_finance", timeframe, open_time_utc)',
                'symbols' => $buildSymbolList([
                    'SPOTBRENT' => 'BZ=F',
                    'ETHUSD' => 'ETH-USD',
                    'BTCUSD' => 'BTC-USD',
                    'XAGUSD' => 'SI=F',
                    'XAUUSD' => 'GC=F',
                    'SPX500USD' => '^GSPC',
                    'NDQ' => '^NDX',
                    'EURUSD' => 'EURUSD=X',
                    'USOIL' => 'CL=F',
                    'NVDA' => 'NVDA',
                    'AMZN' => 'AMZN',
                    'TSLA' => 'TSLA',
                    'AAPL' => 'AAPL',
                    'GOOGL' => 'GOOGL',
                    'MSFT' => 'MSFT',
                    'META' => 'META',
                    'NFLX' => 'NFLX',
                    'AMD' => 'AMD',
                    'UBER' => 'UBER',
                    'NKE' => 'NKE',
                    'IBM' => 'IBM',
                    'SAN' => 'SAN',
                ]),
            ],
            [
                'provider_id' => 'stooq',
                'badge_label' => 'Stooq Free EOD',
                'title_fa' => 'آرشیو رایگان تاریخچه روزانه Stooq (طلا، نقره، انرژی، فارکس و سهام)',
                'title_en' => 'Stooq Free EOD Historical Feed (Gold, Metals, Energy, FX & US Stocks)',
                'method_type' => 'PUBLIC_CSV_HISTORICAL',
                'requires_api_key' => false,
                'is_configured' => true,
                'status_code' => 'READY',
                'formula_fa' => 'پیشنهاد دوم Grok برای تاریخچه رایگان کندل‌های روزانه و هفتگی (D1/W1) از stooq.com با پشتیبانی از کلید اختیاری BYOK و ذخیره افزایشی در MariaDB.',
                'formula_en' => 'Grok #2 recommended free historical daily/weekly (D1/W1) OHLCV feed from stooq.com with optional BYOK API key and MariaDB delta persistence.',
                'supported_timeframes' => ['D1', 'W1'],
                'storage_key_rule' => 'UNIQUE(chart_id, "stooq", timeframe, open_time_utc)',
                'symbols' => $buildSymbolList([
                    'SPOTBRENT' => 'CB.F',
                    'ETHUSD' => 'ETHUSD',
                    'BTCUSD' => 'BTCUSD',
                    'XAGUSD' => 'XAGUSD',
                    'XAUUSD' => 'XAUUSD',
                    'SPX500USD' => '^SPX',
                    'NDQ' => '^NDX',
                    'EURUSD' => 'EURUSD',
                    'USOIL' => 'CL.F',
                    'NVDA' => 'NVDA.US',
                    'AMZN' => 'AMZN.US',
                    'TSLA' => 'TSLA.US',
                    'AAPL' => 'AAPL.US',
                    'GOOGL' => 'GOOGL.US',
                    'MSFT' => 'MSFT.US',
                    'META' => 'META.US',
                    'NFLX' => 'NFLX.US',
                    'AMD' => 'AMD.US',
                    'UBER' => 'UBER.US',
                    'NKE' => 'NKE.US',
                    'IBM' => 'IBM.US',
                    'SAN' => 'SAN.US',
                ]),
            ],
            [
                'provider_id' => 'eia_brent_spot',
                'badge_label' => 'EIA FOB D1',
                'title_fa' => 'مرجع رسمی روزانه نفت برنت اداره اطلاعات انرژی آمریکا (EIA FOB)',
                'title_en' => 'U.S. EIA Official Daily Brent Spot FOB Benchmark',
                'method_type' => 'OFFICIAL_BENCHMARK_CSV',
                'requires_api_key' => false,
                'is_configured' => true,
                'status_code' => 'READY',
                'formula_fa' => 'سری زمانی رسمی روزانه (D1) قیمت نقدی نفت برنت دریای شمال (Europe Brent Spot Price FOB)؛ ذخیره دائمی کندل‌های روزهای گذشته و دریافت فقط روزهای جدید.',
                'formula_en' => 'Official daily (D1) Europe Brent Spot Price FOB benchmark; permanently caches past daily bars and appends only newly published sessions.',
                'supported_timeframes' => ['D1'],
                'storage_key_rule' => 'UNIQUE(chart_id, "eia_brent_spot", "D1", open_time_utc)',
                'symbols' => $buildSymbolList([
                    'SPOTBRENT' => 'EIA:RBRTE',
                ]),
            ],
        ];
    }

    public static function getSymbolsDirectory(): array
    {
        $defs = self::getCanonicalWatchlistDefinitions();
        $methods = self::getMethods();
        $methodById = [];
        foreach ($methods as $m) {
            $methodById[$m['provider_id']] = $m;
        }

        $directory = [];
        foreach ($defs as $d) {
            $code = $d['symbol_code'];
            $providersList = [];
            foreach ($d['priority_chain'] as $idx => $provId) {
                if (!isset($methodById[$provId])) {
                    continue;
                }
                $m = $methodById[$provId];
                $ticker = $code;
                foreach ($m['symbols'] as $symItem) {
                    if ($symItem['symbol_code'] === $code) {
                        $ticker = $symItem['provider_ticker'];
                        break;
                    }
                }
                $providersList[] = [
                    'priority_rank' => $idx + 1,
                    'provider_id' => $provId,
                    'badge_label' => $m['badge_label'],
                    'provider_ticker' => $ticker,
                    'supported_timeframes' => $m['supported_timeframes'],
                ];
            }
            $directory[] = [
                'rank' => $d['rank'],
                'symbol_code' => $code,
                'title_fa' => $d['title_fa'],
                'title_en' => $d['title_en'],
                'category' => $d['category'],
                'decimals' => $d['decimals'],
                'default_provider' => $d['default_provider'],
                'priority_chain' => $d['priority_chain'],
                'providers' => $providersList,
            ];
        }
        return $directory;
    }

    public static function getDatabaseStorageMatrix(?PDO $pdo): array
    {
        if ($pdo === null) {
            return [];
        }
        try {
            $stmt = $pdo->query(
                "SELECT chart_id, provider_id, timeframe,
                        COUNT(*) AS stored_bars,
                        MIN(open_time_utc) AS min_open_ms,
                        MAX(open_time_utc) AS max_open_ms
                 FROM candles
                 WHERE is_closed = 1
                 GROUP BY chart_id, provider_id, timeframe"
            );
            $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
            $matrix = [];
            foreach ($rows as $r) {
                $chartId = (string) ($r['chart_id'] ?? '');
                $symbol = strtoupper((string) preg_replace('/^chart_|_main$|_custom$|_spot$|_index$|_stock$|_futures$/i', '', $chartId));
                $prov = (string) ($r['provider_id'] ?? '');
                $tf = (string) ($r['timeframe'] ?? '');
                $matrix[] = [
                    'symbol_code' => $symbol,
                    'provider_id' => $prov,
                    'timeframe' => $tf,
                    'stored_bars' => (int) ($r['stored_bars'] ?? 0),
                    'min_open_utc_ms' => (int) ($r['min_open_ms'] ?? 0),
                    'max_open_utc_ms' => (int) ($r['max_open_ms'] ?? 0),
                ];
            }
            return $matrix;
        } catch (Throwable) {
            return [];
        }
    }
}
