<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

use ChartIntelligence\Core\Database;
use PDO;
use Throwable;

/**
 * Centralized Catalog of Independent Data Collection Methods (Algorithms & APIs)
 * and their supported market symbols.
 *
 * Enforces strict separation of collection methods (`tvdatafeed`, `twelve_data`,
 * `dukascopy`, `yahoo_finance`, `eia_brent_spot`) and provides metadata for both
 * "Filter by Source -> Symbols" and "Search by Symbol -> Supported Sources" flows
 * across Web and Android Settings.
 */
final class ProviderCatalog
{
    public static function getMethods(): array
    {
        $cfg = Database::getConfig();
        $hasTwelveKey = trim((string) ($cfg['TWELVE_DATA_API_KEY'] ?? '')) !== '';

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
                'supported_timeframes' => ['M15', 'H1', 'H4', 'D1', 'W1'],
                'storage_key_ rule' => 'UNIQUE(chart_id, "tvdatafeed", timeframe, open_time_utc)',
                'symbols' => [
                    ['symbol_code' => 'SPOTBRENT', 'provider_ticker' => 'PEPPERSTONE:SPOTBRENT', 'title_fa' => 'نفت برنت اسپات', 'title_en' => 'Brent Crude Oil Spot', 'category' => 'ENERGY', 'decimals' => 3],
                    ['symbol_code' => 'XAUUSD', 'provider_ticker' => 'OANDA:XAUUSD', 'title_fa' => 'طلای جهانی اسپات', 'title_en' => 'Gold Spot / USD', 'category' => 'METALS', 'decimals' => 2],
                    ['symbol_code' => 'BRENT_FUTURES', 'provider_ticker' => 'NYMEX:BZ1!', 'title_fa' => 'قرارداد آتی نفت برنت', 'title_en' => 'Brent Crude Futures', 'category' => 'ENERGY', 'decimals' => 2],
                    ['symbol_code' => 'XAGUSD', 'provider_ticker' => 'OANDA:XAGUSD', 'title_fa' => 'نقره جهانی اسپات', 'title_en' => 'Silver Spot / USD', 'category' => 'METALS', 'decimals' => 3],
                    ['symbol_code' => 'EURUSD', 'provider_ticker' => 'OANDA:EURUSD', 'title_fa' => 'یورو به دلار آمریکا', 'title_en' => 'Euro / US Dollar', 'category' => 'FX', 'decimals' => 4],
                    ['symbol_code' => 'GBPUSD', 'provider_ticker' => 'OANDA:GBPUSD', 'title_fa' => 'پوند بریتانیا به دلار', 'title_en' => 'British Pound / USD', 'category' => 'FX', 'decimals' => 4],
                    ['symbol_code' => 'USDJPY', 'provider_ticker' => 'OANDA:USDJPY', 'title_fa' => 'دلار آمریکا به ین ژاپن', 'title_en' => 'US Dollar / Japanese Yen', 'category' => 'FX', 'decimals' => 3],
                    ['symbol_code' => 'BTCUSD', 'provider_ticker' => 'BITSTAMP:BTCUSD', 'title_fa' => 'بیت‌کوین به دلار آمریکا', 'title_en' => 'Bitcoin / US Dollar', 'category' => 'CRYPTO', 'decimals' => 2],
                ],
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
                'formula_fa' => 'فراخوانی اندپوینت api.twelvedata.com/time_series با کلید اختصاصی و دریافت صرفاً کندل‌های جدید جاافتاده (outputsize = deltaBars) پس از ذخیره تاریخچه اولیه در دیتابیس.',
                'formula_en' => 'Queries api.twelvedata.com/time_series with API key using incremental outputsize = deltaBars after initial history is stored in MariaDB.',
                'supported_timeframes' => ['M15', 'H1', 'H4', 'D1', 'W1'],
                'storage_key_rule' => 'UNIQUE(chart_id, "twelve_data", timeframe, open_time_utc)',
                'symbols' => [
                    ['symbol_code' => 'XAUUSD', 'provider_ticker' => 'XAU/USD', 'title_fa' => 'طلای جهانی اسپات', 'title_en' => 'Gold Spot / USD', 'category' => 'METALS', 'decimals' => 2],
                    ['symbol_code' => 'SPOTBRENT', 'provider_ticker' => 'XBR/USD', 'title_fa' => 'نفت برنت اسپات', 'title_en' => 'Brent Crude Oil Spot', 'category' => 'ENERGY', 'decimals' => 3],
                    ['symbol_code' => 'XAGUSD', 'provider_ticker' => 'XAG/USD', 'title_fa' => 'نقره جهانی اسپات', 'title_en' => 'Silver Spot / USD', 'category' => 'METALS', 'decimals' => 3],
                    ['symbol_code' => 'EURUSD', 'provider_ticker' => 'EUR/USD', 'title_fa' => 'یورو به دلار آمریکا', 'title_en' => 'Euro / US Dollar', 'category' => 'FX', 'decimals' => 4],
                    ['symbol_code' => 'GBPUSD', 'provider_ticker' => 'GBP/USD', 'title_fa' => 'پوند بریتانیا به دلار', 'title_en' => 'British Pound / USD', 'category' => 'FX', 'decimals' => 4],
                    ['symbol_code' => 'USDJPY', 'provider_ticker' => 'USD/JPY', 'title_fa' => 'دلار آمریکا به ین ژاپن', 'title_en' => 'US Dollar / Japanese Yen', 'category' => 'FX', 'decimals' => 3],
                    ['symbol_code' => 'BTCUSD', 'provider_ticker' => 'BTC/USD', 'title_fa' => 'بیت‌کوین به دلار آمریکا', 'title_en' => 'Bitcoin / US Dollar', 'category' => 'CRYPTO', 'decimals' => 2],
                ],
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
                'formula_fa' => 'استخراج کندل‌های استاندارد بین‌بانکی با حذف کامل کندل‌های مصنوعی تعطیلات آخر هفته (volume = 0) و ذخیره‌سازی ماندگار در جدول candles.',
                'formula_en' => 'Interbank historical OHLC feed with strict weekend synthetic tick filtering and permanent MariaDB persistence.',
                'supported_timeframes' => ['M15', 'H1', 'H4', 'D1', 'W1'],
                'storage_key_rule' => 'UNIQUE(chart_id, "dukascopy", timeframe, open_time_utc)',
                'symbols' => [
                    ['symbol_code' => 'XAUUSD', 'provider_ticker' => 'XAU/USD', 'title_fa' => 'طلای جهانی اسپات', 'title_en' => 'Gold Spot / USD', 'category' => 'METALS', 'decimals' => 2],
                    ['symbol_code' => 'SPOTBRENT', 'provider_ticker' => 'BRENT.CMD/USD', 'title_fa' => 'نفت برنت اسپات', 'title_en' => 'Brent Crude Oil Spot', 'category' => 'ENERGY', 'decimals' => 3],
                    ['symbol_code' => 'BRENT_FUTURES', 'provider_ticker' => 'BRENT.CMD/USD', 'title_fa' => 'قرارداد آتی نفت برنت', 'title_en' => 'Brent Crude Futures', 'category' => 'ENERGY', 'decimals' => 2],
                    ['symbol_code' => 'XAGUSD', 'provider_ticker' => 'XAG/USD', 'title_fa' => 'نقره جهانی اسپات', 'title_en' => 'Silver Spot / USD', 'category' => 'METALS', 'decimals' => 3],
                    ['symbol_code' => 'EURUSD', 'provider_ticker' => 'EUR/USD', 'title_fa' => 'یورو به دلار آمریکا', 'title_en' => 'Euro / US Dollar', 'category' => 'FX', 'decimals' => 4],
                    ['symbol_code' => 'GBPUSD', 'provider_ticker' => 'GBP/USD', 'title_fa' => 'پوند بریتانیا به دلار', 'title_en' => 'British Pound / USD', 'category' => 'FX', 'decimals' => 4],
                    ['symbol_code' => 'USDJPY', 'provider_ticker' => 'USD/JPY', 'title_fa' => 'دلار آمریکا به ین ژاپن', 'title_en' => 'US Dollar / Japanese Yen', 'category' => 'FX', 'decimals' => 3],
                ],
            ],
            [
                'provider_id' => 'yahoo_finance',
                'badge_label' => 'Yahoo Finance v8',
                'title_fa' => 'موتور عمومی یاهو فایننس (Yahoo Finance Chart v8)',
                'title_en' => 'Yahoo Finance v8 Chart Engine',
                'method_type' => 'PUBLIC_REST_V8',
                'requires_api_key' => false,
                'is_configured' => true,
                'status_code' => 'READY',
                'formula_fa' => 'دریافت کندل از query1.finance.yahoo.com/v8/finance/chart با انتخاب هوشمند بازه کوتاه (1d/5d) در حالت Delta Sync جهت جلوگیری از دریافت مجدد تاریخچه قبلی.',
                'formula_en' => 'Fetches from query1.finance.yahoo.com/v8/finance/chart using short 1d/5d windows during Delta Sync to avoid re-downloading cached history.',
                'supported_timeframes' => ['M15', 'H1', 'H4', 'D1', 'W1'],
                'storage_key_rule' => 'UNIQUE(chart_id, "yahoo_finance", timeframe, open_time_utc)',
                'symbols' => [
                    ['symbol_code' => 'SPOTBRENT', 'provider_ticker' => 'BZ=F', 'title_fa' => 'نفت برنت اسپات', 'title_en' => 'Brent Crude Oil Spot', 'category' => 'ENERGY', 'decimals' => 3],
                    ['symbol_code' => 'BRENT_FUTURES', 'provider_ticker' => 'BZ=F', 'title_fa' => 'قرارداد آتی نفت برنت', 'title_en' => 'Brent Crude Futures', 'category' => 'ENERGY', 'decimals' => 2],
                    ['symbol_code' => 'XAUUSD', 'provider_ticker' => 'GC=F', 'title_fa' => 'طلای جهانی اسپات', 'title_en' => 'Gold Spot / USD', 'category' => 'METALS', 'decimals' => 2],
                    ['symbol_code' => 'XAGUSD', 'provider_ticker' => 'SI=F', 'title_fa' => 'نقره جهانی اسپات', 'title_en' => 'Silver Spot / USD', 'category' => 'METALS', 'decimals' => 3],
                    ['symbol_code' => 'EURUSD', 'provider_ticker' => 'EURUSD=X', 'title_fa' => 'یورو به دلار آمریکا', 'title_en' => 'Euro / US Dollar', 'category' => 'FX', 'decimals' => 4],
                    ['symbol_code' => 'GBPUSD', 'provider_ticker' => 'GBPUSD=X', 'title_fa' => 'پوند بریتانیا به دلار', 'title_en' => 'British Pound / USD', 'category' => 'FX', 'decimals' => 4],
                    ['symbol_code' => 'USDJPY', 'provider_ticker' => 'JPY=X', 'title_fa' => 'دلار آمریکا به ین ژاپن', 'title_en' => 'US Dollar / Japanese Yen', 'category' => 'FX', 'decimals' => 3],
                    ['symbol_code' => 'BTCUSD', 'provider_ticker' => 'BTC-USD', 'title_fa' => 'بیت‌کوین به دلار آمریکا', 'title_en' => 'Bitcoin / US Dollar', 'category' => 'CRYPTO', 'decimals' => 2],
                ],
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
                'symbols' => [
                    ['symbol_code' => 'SPOTBRENT', 'provider_ticker' => 'EIA:RBRTE', 'title_fa' => 'نفت برنت اسپات', 'title_en' => 'Brent Crude Oil Spot', 'category' => 'ENERGY', 'decimals' => 3],
                    ['symbol_code' => 'BRENT_FUTURES', 'provider_ticker' => 'EIA:RBRTE', 'title_fa' => 'قرارداد آتی نفت برنت', 'title_en' => 'Brent Crude Futures', 'category' => 'ENERGY', 'decimals' => 2],
                ],
            ],
        ];
    }

    public static function getSymbolsDirectory(): array
    {
        $methods = self::getMethods();
        $map = [];
        foreach ($methods as $method) {
            $provId = $method['provider_id'];
            foreach ($method['symbols'] as $sym) {
                $code = $sym['symbol_code'];
                if (!isset($map[$code])) {
                    $map[$code] = [
                        'symbol_code' => $code,
                        'title_fa' => $sym['title_fa'],
                        'title_en' => $sym['title_en'],
                        'category' => $sym['category'],
                        'decimals' => $sym['decimals'],
                        'default_provider' => $code === 'SPOTBRENT' ? 'tvdatafeed' : ($code === 'XAUUSD' ? 'twelve_data' : $provId),
                        'providers' => [],
                    ];
                }
                $map[$code]['providers'][] = [
                    'provider_id' => $provId,
                    'badge_label' => $method['badge_label'],
                    'provider_ticker' => $sym['provider_ticker'],
                    'supported_timeframes' => $method['supported_timeframes'],
                ];
            }
        }
        return array_values($map);
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
                $symbol = strtoupper((string) preg_replace('/^chart_|_main$|_custom$/i', '', $chartId));
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
