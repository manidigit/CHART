<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

use ChartIntelligence\Algorithms\UtcTimeAnchor;
use ChartIntelligence\Core\Database;
use PDO;
use Throwable;

/**
 * Centralized Catalog of Independent Data Collection Methods (`tvdatafeed` active; legacy
 * providers preserved as disabled/archived schemas) and the 79 Canonical Catalog Symbols
 * (22 default watchlist + 57 expanded global equities) with their Asset-Class Priority Rules.
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
            ['rank' => 23, 'symbol_code' => 'AVGO',      'title_en' => 'Broadcom Inc.',                    'title_fa' => 'سهام برودکام (AVGO)',              'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 24, 'symbol_code' => 'MU',        'title_en' => 'Micron Technology, Inc.',          'title_fa' => 'سهام مایکرون تکنولوژی (MU)',       'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 25, 'symbol_code' => 'INTC',      'title_en' => 'Intel Corporation',                'title_fa' => 'سهام اینتل (INTC)',                'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 26, 'symbol_code' => 'MRVL',      'title_en' => 'Marvell Technology, Inc.',         'title_fa' => 'سهام مارول تکنولوژی (MRVL)',       'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 27, 'symbol_code' => 'AMAT',      'title_en' => 'Applied Materials, Inc.',          'title_fa' => 'سهام اپلاید متریالز (AMAT)',       'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 28, 'symbol_code' => 'LRCX',      'title_en' => 'Lam Research Corporation',         'title_fa' => 'سهام لم ریسرچ (LRCX)',             'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 29, 'symbol_code' => 'QCOM',      'title_en' => 'Qualcomm Incorporated',            'title_fa' => 'سهام کوالکام (QCOM)',              'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 30, 'symbol_code' => 'SMCI',      'title_en' => 'Super Micro Computer, Inc.',       'title_fa' => 'سهام سوپرمیکرو کامپیوتر (SMCI)',   'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 31, 'symbol_code' => 'DELL',      'title_en' => 'Dell Technologies Inc.',           'title_fa' => 'سهام دل تکنولوژی (DELL)',          'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 32, 'symbol_code' => 'SNDK',      'title_en' => 'Sandisk Corporation',              'title_fa' => 'سهام سن‌دیسک (SNDK)',              'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 33, 'symbol_code' => 'ANET',      'title_en' => 'Arista Networks, Inc.',            'title_fa' => 'سهام آریستا نتورکس (ANET)',        'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 34, 'symbol_code' => 'PLTR',      'title_en' => 'Palantir Technologies Inc.',       'title_fa' => 'سهام پالانتیر (PLTR)',             'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 35, 'symbol_code' => 'ORCL',      'title_en' => 'Oracle Corporation',               'title_fa' => 'سهام اوراکل (ORCL)',               'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 36, 'symbol_code' => 'CRM',       'title_en' => 'Salesforce, Inc.',                 'title_fa' => 'سهام سیلزفورس (CRM)',              'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 37, 'symbol_code' => 'ADBE',      'title_en' => 'Adobe Inc.',                       'title_fa' => 'سهام ادوبی (ADBE)',                'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 38, 'symbol_code' => 'CRWD',      'title_en' => 'CrowdStrike Holdings, Inc.',       'title_fa' => 'سهام کراوداسترایک (CRWD)',         'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 39, 'symbol_code' => 'CSCO',      'title_en' => 'Cisco Systems, Inc.',              'title_fa' => 'سهام سیسکو (CSCO)',                'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 40, 'symbol_code' => 'APP',       'title_en' => 'AppLovin Corporation',             'title_fa' => 'سهام اپ‌لاوین (APP)',              'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 41, 'symbol_code' => 'NBIS',      'title_en' => 'Nebius Group N.V.',                'title_fa' => 'سهام نبیوس گروپ (NBIS)',           'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 42, 'symbol_code' => 'CRWV',      'title_en' => 'CoreWeave, Inc.',                  'title_fa' => 'سهام کورویو (CRWV)',               'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 43, 'symbol_code' => 'SPCX',      'title_en' => 'The SpaceX / Crossover Fund (SPCX)', 'title_fa' => 'سهام اسپیس‌ایکس (SPCX)',         'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 44, 'symbol_code' => 'RKLB',      'title_en' => 'Rocket Lab USA, Inc.',             'title_fa' => 'سهام راکت لب (RKLB)',              'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 45, 'symbol_code' => 'GEV',       'title_en' => 'GE Vernova Inc.',                  'title_fa' => 'سهام جی‌ای ورنووا (GEV)',          'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 46, 'symbol_code' => 'BE',        'title_en' => 'Bloom Energy Corporation',         'title_fa' => 'سهام بلوم انرژی (BE)',             'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 47, 'symbol_code' => 'IONQ',      'title_en' => 'IonQ, Inc.',                       'title_fa' => 'سهام آی‌اان‌کیو (IONQ)',           'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 48, 'symbol_code' => 'RIVN',      'title_en' => 'Rivian Automotive, Inc.',          'title_fa' => 'سهام ریویان (RIVN)',               'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 49, 'symbol_code' => 'JPM',       'title_en' => 'JPMorgan Chase & Co.',             'title_fa' => 'سهام جی‌پی مورگان چیس (JPM)',      'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 50, 'symbol_code' => 'BAC',       'title_en' => 'Bank of America Corp.',            'title_fa' => 'سهام بنک آو آمریکا (BAC)',         'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 51, 'symbol_code' => 'GS',        'title_en' => 'Goldman Sachs Group, Inc.',        'title_fa' => 'سهام گلدمن ساکس (GS)',             'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 52, 'symbol_code' => 'V',         'title_en' => 'Visa Inc.',                        'title_fa' => 'سهام ویزا (V)',                    'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 53, 'symbol_code' => 'MA',        'title_en' => 'Mastercard Incorporated',          'title_fa' => 'سهام مسترکارت (MA)',               'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 54, 'symbol_code' => 'BRK.B',     'title_en' => 'Berkshire Hathaway Inc. Class B',  'title_fa' => 'سهام برکشایر هاتاوی (BRK.B)',      'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 55, 'symbol_code' => 'HOOD',      'title_en' => 'Robinhood Markets, Inc.',          'title_fa' => 'سهام رابین‌هود (HOOD)',            'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 56, 'symbol_code' => 'MSTR',      'title_en' => 'MicroStrategy Inc.',               'title_fa' => 'سهام مایکرواستراتژی (MSTR)',       'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 57, 'symbol_code' => 'PYPL',      'title_en' => 'PayPal Holdings, Inc.',            'title_fa' => 'سهام پی‌پال (PYPL)',               'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 58, 'symbol_code' => 'COIN',      'title_en' => 'Coinbase Global, Inc.',            'title_fa' => 'سهام کوین‌بیس (COIN)',             'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 59, 'symbol_code' => 'WMT',       'title_en' => 'Walmart Inc.',                     'title_fa' => 'سهام والمارت (WMT)',               'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 60, 'symbol_code' => 'COST',      'title_en' => 'Costco Wholesale Corp.',           'title_fa' => 'سهام کاستکو (COST)',               'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 61, 'symbol_code' => 'DIS',       'title_en' => 'The Walt Disney Company',          'title_fa' => 'سهام والت دیزنی (DIS)',            'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 62, 'symbol_code' => 'SBUX',      'title_en' => 'Starbucks Corporation',            'title_fa' => 'سهام استارباکس (SBUX)',            'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 63, 'symbol_code' => 'MCD',       'title_en' => "McDonald's Corporation",           'title_fa' => 'سهام مک‌دونالد (MCD)',             'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 64, 'symbol_code' => 'KO',        'title_en' => 'The Coca-Cola Company',            'title_fa' => 'سهام کوکاکولا (KO)',               'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 65, 'symbol_code' => 'LLY',       'title_en' => 'Eli Lilly and Company',            'title_fa' => 'سهام الی لیلی (LLY)',              'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 66, 'symbol_code' => 'UNH',       'title_en' => 'UnitedHealth Group Inc.',          'title_fa' => 'سهام یونایتد هلث (UNH)',           'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 67, 'symbol_code' => 'PFE',       'title_en' => 'Pfizer Inc.',                      'title_fa' => 'سهام فایزر (PFE)',                 'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 68, 'symbol_code' => 'XOM',       'title_en' => 'Exxon Mobil Corporation',          'title_fa' => 'سهام اکسان موبیل (XOM)',           'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 69, 'symbol_code' => 'CVX',       'title_en' => 'Chevron Corporation',              'title_fa' => 'سهام شورون (CVX)',                 'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 70, 'symbol_code' => 'TSM',       'title_en' => 'Taiwan Semiconductor (TSMC)',      'title_fa' => 'سهام تی‌اس‌ام‌سی (TSM)',           'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 71, 'symbol_code' => 'ASML',      'title_en' => 'ASML Holding N.V.',                'title_fa' => 'سهام ای‌اس‌ام‌ال (ASML)',          'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 72, 'symbol_code' => 'SSNLF',     'title_en' => 'Samsung Electronics Co., Ltd.',    'title_fa' => 'سهام سامسونگ الکترونیکس (SSNLF)',  'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 73, 'symbol_code' => 'SKHY',      'title_en' => 'SK hynix Inc.',                    'title_fa' => 'سهام اس‌کی هاینیکس (SKHY)',        'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 74, 'symbol_code' => 'BABA',      'title_en' => 'Alibaba Group Holding Ltd.',       'title_fa' => 'سهام علی‌بابا (BABA)',             'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 75, 'symbol_code' => 'NVO',       'title_en' => 'Novo Nordisk A/S',                 'title_fa' => 'سهام نوو نوردیسک (NVO)',           'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 76, 'symbol_code' => 'TM',        'title_en' => 'Toyota Motor Corporation',         'title_fa' => 'سهام تویوتا موتور (TM)',           'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 77, 'symbol_code' => 'SAP',       'title_en' => 'SAP SE',                           'title_fa' => 'سهام اس‌آی‌پی (SAP)',              'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 78, 'symbol_code' => 'HSBC',      'title_en' => 'HSBC Holdings plc',                'title_fa' => 'سهام اچ‌اس‌بی‌سی (HSBC)',          'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
            ['rank' => 79, 'symbol_code' => '2222.SR',   'title_en' => 'Saudi Aramco (2222.SR)',           'title_fa' => 'سهام سعودی آرامکو (2222.SR)',      'category' => 'STOCKS',  'decimals' => 2, 'default_provider' => 'tvdatafeed', 'priority_chain' => ['tvdatafeed', 'yahoo_finance', 'twelve_data', 'stooq']],
        ];
    }

    public static function resolvePriceBasis(string $symbolCode, string $providerId): string
    {
        $sym = strtoupper(trim($symbolCode));
        $prov = strtolower(trim($providerId));
        $stockList = [
            'NVDA', 'AMZN', 'TSLA', 'AAPL', 'GOOGL', 'MSFT', 'META', 'NFLX', 'AMD', 'UBER', 'NKE', 'IBM', 'SAN',
            'AVGO', 'MU', 'INTC', 'MRVL', 'AMAT', 'LRCX', 'QCOM', 'SMCI', 'DELL', 'SNDK', 'ANET',
            'PLTR', 'ORCL', 'CRM', 'ADBE', 'CRWD', 'CSCO', 'APP', 'NBIS', 'CRWV',
            'SPCX', 'RKLB', 'GEV', 'BE', 'IONQ', 'RIVN',
            'JPM', 'BAC', 'GS', 'V', 'MA', 'BRK.B', 'BRKB', 'HOOD', 'MSTR', 'PYPL', 'COIN',
            'WMT', 'COST', 'DIS', 'SBUX', 'MCD', 'KO',
            'LLY', 'UNH', 'PFE', 'XOM', 'CVX',
            'TSM', 'ASML', 'SSNLF', 'SKHY', 'BABA', 'NVO', 'TM', 'SAP', 'HSBC', '2222.SR', '2222SR',
        ];
        return match ($prov) {
            'eia_brent_spot' => 'Official FOB Spot',
            'dukascopy' => 'Interbank Spot',
            'biquote' => 'CFD / MT5 Feed',
            'stooq' => 'EOD Historical',
            'local_csv' => 'Imported Archive',
            'twelve_data' => in_array($sym, $stockList, true)
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
            'NVDA', 'AMZN', 'TSLA', 'AAPL', 'GOOGL', 'MSFT', 'META', 'NFLX', 'AMD', 'UBER', 'NKE', 'IBM', 'SAN',
            'AVGO', 'MU', 'INTC', 'MRVL', 'AMAT', 'LRCX', 'QCOM', 'SMCI', 'DELL', 'SNDK', 'ANET',
            'PLTR', 'ORCL', 'CRM', 'ADBE', 'CRWD', 'CSCO', 'APP', 'NBIS', 'CRWV',
            'SPCX', 'RKLB', 'GEV', 'BE', 'IONQ', 'RIVN',
            'JPM', 'BAC', 'GS', 'V', 'MA', 'BRKB', 'HOOD', 'MSTR', 'PYPL', 'COIN',
            'WMT', 'COST', 'DIS', 'SBUX', 'MCD', 'KO',
            'LLY', 'UNH', 'PFE', 'XOM', 'CVX',
            'TSM', 'ASML', 'SSNLF', 'SKHY', 'BABA', 'NVO', 'TM', 'SAP', 'HSBC', '2222SR' => 'chart_' . strtolower($clean) . '_stock',
            default => 'chart_' . strtolower($clean) . '_custom',
        };
    }

    public static function getInstrumentSpec(string $symbolCode, string $providerId = ''): array
    {
        $clean = strtoupper(trim($symbolCode));
        $prov = strtolower(trim($providerId));
        if ($prov === '') {
            foreach (self::getCanonicalWatchlistDefinitions() as $def) {
                if ($def['symbol_code'] === $clean) {
                    $prov = $def['default_provider'];
                    break;
                }
            }
            if ($prov === '') {
                $prov = 'tvdatafeed';
            }
        }
        return [
            'symbol_code' => $clean,
            'provider' => $prov,
            'price_basis' => self::resolvePriceBasis($clean, $prov),
            'timezone' => UtcTimeAnchor::getInstrumentTimezone($clean),
            'session_calendar' => UtcTimeAnchor::getSessionCalendar($clean),
            'volume_type' => UtcTimeAnchor::getVolumeType($clean, $prov),
        ];
    }

    public static function getMethods(): array
    {
        $cfg = Database::getConfig();
        $hasTwelveKey = trim((string) ($cfg['TWELVE_DATA_API_KEY'] ?? '')) !== '';
        $defs = self::getCanonicalWatchlistDefinitions();

        $buildSymbolList = static function (array $tickerMap, string $providerId) use ($defs): array {
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
                        'price_basis' => self::resolvePriceBasis($code, $providerId),
                        'timezone' => UtcTimeAnchor::getInstrumentTimezone($code),
                        'session_calendar' => UtcTimeAnchor::getSessionCalendar($code),
                        'volume_type' => UtcTimeAnchor::getVolumeType($code, $providerId),
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
                    'AVGO' => 'NASDAQ:AVGO',
                    'MU' => 'NASDAQ:MU',
                    'INTC' => 'NASDAQ:INTC',
                    'MRVL' => 'NASDAQ:MRVL',
                    'AMAT' => 'NASDAQ:AMAT',
                    'LRCX' => 'NASDAQ:LRCX',
                    'QCOM' => 'NASDAQ:QCOM',
                    'SMCI' => 'NASDAQ:SMCI',
                    'DELL' => 'NYSE:DELL',
                    'SNDK' => 'NASDAQ:SNDK',
                    'ANET' => 'NYSE:ANET',
                    'PLTR' => 'NASDAQ:PLTR',
                    'ORCL' => 'NYSE:ORCL',
                    'CRM' => 'NYSE:CRM',
                    'ADBE' => 'NASDAQ:ADBE',
                    'CRWD' => 'NASDAQ:CRWD',
                    'CSCO' => 'NASDAQ:CSCO',
                    'APP' => 'NASDAQ:APP',
                    'NBIS' => 'NASDAQ:NBIS',
                    'CRWV' => 'NASDAQ:CRWV',
                    'SPCX' => 'AMEX:SPCX',
                    'RKLB' => 'NASDAQ:RKLB',
                    'GEV' => 'NYSE:GEV',
                    'BE' => 'NYSE:BE',
                    'IONQ' => 'NYSE:IONQ',
                    'RIVN' => 'NASDAQ:RIVN',
                    'JPM' => 'NYSE:JPM',
                    'BAC' => 'NYSE:BAC',
                    'GS' => 'NYSE:GS',
                    'V' => 'NYSE:V',
                    'MA' => 'NYSE:MA',
                    'BRK.B' => 'NYSE:BRK.B',
                    'HOOD' => 'NASDAQ:HOOD',
                    'MSTR' => 'NASDAQ:MSTR',
                    'PYPL' => 'NASDAQ:PYPL',
                    'COIN' => 'NASDAQ:COIN',
                    'WMT' => 'NYSE:WMT',
                    'COST' => 'NASDAQ:COST',
                    'DIS' => 'NYSE:DIS',
                    'SBUX' => 'NASDAQ:SBUX',
                    'MCD' => 'NYSE:MCD',
                    'KO' => 'NYSE:KO',
                    'LLY' => 'NYSE:LLY',
                    'UNH' => 'NYSE:UNH',
                    'PFE' => 'NYSE:PFE',
                    'XOM' => 'NYSE:XOM',
                    'CVX' => 'NYSE:CVX',
                    'TSM' => 'NYSE:TSM',
                    'ASML' => 'NASDAQ:ASML',
                    'SSNLF' => 'OTC:SSNLF',
                    'SKHY' => 'KRX:000660',
                    'BABA' => 'NYSE:BABA',
                    'NVO' => 'NYSE:NVO',
                    'TM' => 'NYSE:TM',
                    'SAP' => 'NYSE:SAP',
                    'HSBC' => 'NYSE:HSBC',
                    '2222.SR' => 'TADAWUL:2222',
                ], 'tvdatafeed'),
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
                ], 'biquote'),
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
                    'AVGO' => 'AVGO',
                    'MU' => 'MU',
                    'INTC' => 'INTC',
                    'MRVL' => 'MRVL',
                    'AMAT' => 'AMAT',
                    'LRCX' => 'LRCX',
                    'QCOM' => 'QCOM',
                    'SMCI' => 'SMCI',
                    'DELL' => 'DELL',
                    'SNDK' => 'SNDK',
                    'ANET' => 'ANET',
                    'PLTR' => 'PLTR',
                    'ORCL' => 'ORCL',
                    'CRM' => 'CRM',
                    'ADBE' => 'ADBE',
                    'CRWD' => 'CRWD',
                    'CSCO' => 'CSCO',
                    'APP' => 'APP',
                    'NBIS' => 'NBIS',
                    'CRWV' => 'CRWV',
                    'SPCX' => 'SPCX',
                    'RKLB' => 'RKLB',
                    'GEV' => 'GEV',
                    'BE' => 'BE',
                    'IONQ' => 'IONQ',
                    'RIVN' => 'RIVN',
                    'JPM' => 'JPM',
                    'BAC' => 'BAC',
                    'GS' => 'GS',
                    'V' => 'V',
                    'MA' => 'MA',
                    'BRK.B' => 'BRK.B',
                    'HOOD' => 'HOOD',
                    'MSTR' => 'MSTR',
                    'PYPL' => 'PYPL',
                    'COIN' => 'COIN',
                    'WMT' => 'WMT',
                    'COST' => 'COST',
                    'DIS' => 'DIS',
                    'SBUX' => 'SBUX',
                    'MCD' => 'MCD',
                    'KO' => 'KO',
                    'LLY' => 'LLY',
                    'UNH' => 'UNH',
                    'PFE' => 'PFE',
                    'XOM' => 'XOM',
                    'CVX' => 'CVX',
                    'TSM' => 'TSM',
                    'ASML' => 'ASML',
                    'SSNLF' => 'SSNLF',
                    'SKHY' => 'SKHY',
                    'BABA' => 'BABA',
                    'NVO' => 'NVO',
                    'TM' => 'TM',
                    'SAP' => 'SAP',
                    'HSBC' => 'HSBC',
                    '2222.SR' => '2222.SR',
                ], 'twelve_data'),
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
                ], 'dukascopy'),
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
                    'AVGO' => 'AVGO',
                    'MU' => 'MU',
                    'INTC' => 'INTC',
                    'MRVL' => 'MRVL',
                    'AMAT' => 'AMAT',
                    'LRCX' => 'LRCX',
                    'QCOM' => 'QCOM',
                    'SMCI' => 'SMCI',
                    'DELL' => 'DELL',
                    'SNDK' => 'SNDK',
                    'ANET' => 'ANET',
                    'PLTR' => 'PLTR',
                    'ORCL' => 'ORCL',
                    'CRM' => 'CRM',
                    'ADBE' => 'ADBE',
                    'CRWD' => 'CRWD',
                    'CSCO' => 'CSCO',
                    'APP' => 'APP',
                    'NBIS' => 'NBIS',
                    'CRWV' => 'CRWV',
                    'SPCX' => 'SPCX',
                    'RKLB' => 'RKLB',
                    'GEV' => 'GEV',
                    'BE' => 'BE',
                    'IONQ' => 'IONQ',
                    'RIVN' => 'RIVN',
                    'JPM' => 'JPM',
                    'BAC' => 'BAC',
                    'GS' => 'GS',
                    'V' => 'V',
                    'MA' => 'MA',
                    'BRK.B' => 'BRK-B',
                    'HOOD' => 'HOOD',
                    'MSTR' => 'MSTR',
                    'PYPL' => 'PYPL',
                    'COIN' => 'COIN',
                    'WMT' => 'WMT',
                    'COST' => 'COST',
                    'DIS' => 'DIS',
                    'SBUX' => 'SBUX',
                    'MCD' => 'MCD',
                    'KO' => 'KO',
                    'LLY' => 'LLY',
                    'UNH' => 'UNH',
                    'PFE' => 'PFE',
                    'XOM' => 'XOM',
                    'CVX' => 'CVX',
                    'TSM' => 'TSM',
                    'ASML' => 'ASML',
                    'SSNLF' => 'SSNLF',
                    'SKHY' => '000660.KS',
                    'BABA' => 'BABA',
                    'NVO' => 'NVO',
                    'TM' => 'TM',
                    'SAP' => 'SAP',
                    'HSBC' => 'HSBC',
                    '2222.SR' => '2222.SR',
                ], 'yahoo_finance'),
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
                    'AVGO' => 'AVGO.US',
                    'MU' => 'MU.US',
                    'INTC' => 'INTC.US',
                    'MRVL' => 'MRVL.US',
                    'AMAT' => 'AMAT.US',
                    'LRCX' => 'LRCX.US',
                    'QCOM' => 'QCOM.US',
                    'SMCI' => 'SMCI.US',
                    'DELL' => 'DELL.US',
                    'SNDK' => 'SNDK.US',
                    'ANET' => 'ANET.US',
                    'PLTR' => 'PLTR.US',
                    'ORCL' => 'ORCL.US',
                    'CRM' => 'CRM.US',
                    'ADBE' => 'ADBE.US',
                    'CRWD' => 'CRWD.US',
                    'CSCO' => 'CSCO.US',
                    'APP' => 'APP.US',
                    'NBIS' => 'NBIS.US',
                    'CRWV' => 'CRWV.US',
                    'SPCX' => 'SPCX.US',
                    'RKLB' => 'RKLB.US',
                    'GEV' => 'GEV.US',
                    'BE' => 'BE.US',
                    'IONQ' => 'IONQ.US',
                    'RIVN' => 'RIVN.US',
                    'JPM' => 'JPM.US',
                    'BAC' => 'BAC.US',
                    'GS' => 'GS.US',
                    'V' => 'V.US',
                    'MA' => 'MA.US',
                    'BRK.B' => 'BRK-B.US',
                    'HOOD' => 'HOOD.US',
                    'MSTR' => 'MSTR.US',
                    'PYPL' => 'PYPL.US',
                    'COIN' => 'COIN.US',
                    'WMT' => 'WMT.US',
                    'COST' => 'COST.US',
                    'DIS' => 'DIS.US',
                    'SBUX' => 'SBUX.US',
                    'MCD' => 'MCD.US',
                    'KO' => 'KO.US',
                    'LLY' => 'LLY.US',
                    'UNH' => 'UNH.US',
                    'PFE' => 'PFE.US',
                    'XOM' => 'XOM.US',
                    'CVX' => 'CVX.US',
                    'TSM' => 'TSM.US',
                    'ASML' => 'ASML.US',
                    'SSNLF' => 'SSNLF.US',
                    'SKHY' => '000660.KR',
                    'BABA' => 'BABA.US',
                    'NVO' => 'NVO.US',
                    'TM' => 'TM.US',
                    'SAP' => 'SAP.US',
                    'HSBC' => 'HSBC.US',
                    '2222.SR' => '2222.SR',
                ], 'stooq'),
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
                ], 'eia_brent_spot'),
            ],
            [
                'provider_id' => 'local_csv',
                'badge_label' => 'Local Import',
                'title_fa' => 'ورود تاریخچه محلی و دستی (CSV / EIA XLS / JSON / Manual)',
                'title_en' => 'Local Historical Import & Manual OHLC (CSV / XLS / JSON)',
                'method_type' => 'LOCAL_BATCH_IMPORT',
                'requires_api_key' => false,
                'is_configured' => true,
                'status_code' => 'READY',
                'formula_fa' => 'واردسازی ایمن فایل‌های تاریخی CSV، اکسل EIA RBRTEd.xls (BIFF8/XML/HTML)، JSON و ثبت دستی کندل با ثبت دسته (Batch Lineage) و لاگ اصلاحات.',
                'formula_en' => 'Audited batch import from CSV, EIA RBRTEd.xls, JSON, and manual OHLC entry with lineage and data_corrections history.',
                'supported_timeframes' => ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'],
                'storage_key_rule' => 'UNIQUE(chart_id, provider_id, timeframe, open_time_utc) + data_import_batches',
                'symbols' => $buildSymbolList([
                    'SPOTBRENT' => 'IMPORT:SPOTBRENT',
                    'XAUUSD' => 'IMPORT:XAUUSD',
                    'BTCUSD' => 'IMPORT:BTCUSD',
                ], 'local_csv'),
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
                    'price_basis' => self::resolvePriceBasis($code, $provId),
                    'volume_type' => UtcTimeAnchor::getVolumeType($code, $provId),
                ];
            }
            $defaultProv = $d['default_provider'];
            $directory[] = [
                'rank' => $d['rank'],
                'symbol_code' => $code,
                'title_fa' => $d['title_fa'],
                'title_en' => $d['title_en'],
                'category' => $d['category'],
                'decimals' => $d['decimals'],
                'default_provider' => $defaultProv,
                'price_basis' => self::resolvePriceBasis($code, $defaultProv),
                'timezone' => UtcTimeAnchor::getInstrumentTimezone($code),
                'session_calendar' => UtcTimeAnchor::getSessionCalendar($code),
                'volume_type' => UtcTimeAnchor::getVolumeType($code, $defaultProv),
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
                if ($symbol === 'BRKB') {
                    $symbol = 'BRK.B';
                } elseif ($symbol === '2222SR') {
                    $symbol = '2222.SR';
                }
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
