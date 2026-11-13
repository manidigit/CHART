<?php
declare(strict_types=1);

require_once __DIR__ . '/core/ApiEnvelope.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/algorithms/UtcTimeAnchor.php';
require_once __DIR__ . '/providers/ProviderCatalog.php';

use ChartIntelligence\Algorithms\UtcTimeAnchor;
use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;
use ChartIntelligence\Providers\ProviderCatalog;

/**
 * ENG-02 · Lightweight Live / Forming Quote Endpoint.
 * Strictly read-only: NEVER writes unclosed bars to the `candles` table (preserving `is_closed = 1`).
 */
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ApiEnvelope::sendCorsAndSecurityHeaders('GET, OPTIONS');
    exit;
}

$symbol = strtoupper(preg_replace('/[^A-Za-z0-9._:-]/', '', $_GET['symbol'] ?? 'SPOTBRENT'));
$provider = strtolower(preg_replace('/[^a-z0-9_]/', '', $_GET['provider'] ?? 'tvdatafeed'));
$timeframe = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $_GET['timeframe'] ?? 'M15'));
if (!in_array($timeframe, ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'], true)) {
    $timeframe = 'M15';
}

$nowMs = (int) round(microtime(true) * 1000);
$userApiKey = trim((string) ($_SERVER['HTTP_X_PROVIDER_API_KEY'] ?? ($_GET['api_key'] ?? '')));

$httpGetJson = static function (string $url, int $timeoutSec = 5): ?array {
    $ctx = stream_context_create([
        'http' => [
            'timeout' => $timeoutSec,
            'header' => "User-Agent: Mozilla/5.0 (ChartIntelligence/1.39)\r\n",
        ],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false || $raw === '') {
        return null;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
};

$formingBar = null;
$livePrice = 0.0;
$sourceMode = 'UNAVAILABLE';
$isForming = false;

$bounds = UtcTimeAnchor::getSessionBucketBounds($nowMs, $timeframe, $symbol);
$currentOpenMs = $bounds['open_ms'];

// 1. Binance live kline + price for crypto via biquote
if (in_array($symbol, ['BTCUSD', 'ETHUSD'], true) && $provider === 'biquote') {
    $pair = $symbol === 'BTCUSD' ? 'BTCUSDT' : 'ETHUSDT';
    $interval = match ($timeframe) {
        'M30' => '30m',
        'H1' => '1h',
        'H4' => '4h',
        'D1' => '1d',
        'W1' => '1w',
        default => '15m',
    };
    $klines = $httpGetJson(
        sprintf('https://api.binance.com/api/v3/klines?symbol=%s&interval=%s&limit=1', urlencode($pair), urlencode($interval)),
        4
    );
    if (is_array($klines) && !empty($klines[0]) && count($klines[0]) >= 6) {
        $row = $klines[0];
        $openMs = (int) $row[0];
        $closeP = (float) $row[4];
        if ($closeP > 0) {
            $livePrice = $closeP;
            $isForming = ($openMs + UtcTimeAnchor::stepMilliseconds($timeframe)) > $nowMs;
            $formingBar = [
                'open_time_utc_ms' => $openMs,
                'open' => (float) $row[1],
                'high' => (float) $row[2],
                'low' => (float) $row[3],
                'close' => $closeP,
                'volume' => (float) $row[5],
                'is_closed' => false,
            ];
            $sourceMode = 'LIVE_TICK';
        }
    }
}

// 2. Twelve Data /quote when BYOK or server key is present for twelve_data
if ($sourceMode === 'UNAVAILABLE' && $provider === 'twelve_data') {
    $cfg = Database::getConfig();
    $apiKey = $userApiKey !== '' ? $userApiKey : trim((string) ($cfg['TWELVE_DATA_API_KEY'] ?? ''));
    if ($apiKey !== '') {
        $tdSym = match ($symbol) {
            'XAUUSD' => 'XAU/USD',
            'SPOTBRENT', 'BRENT_FUTURES' => 'XBR/USD',
            'USOIL' => 'WTI/USD',
            'XAGUSD' => 'XAG/USD',
            'EURUSD' => 'EUR/USD',
            'GBPUSD' => 'GBP/USD',
            'USDJPY' => 'USD/JPY',
            'BTCUSD' => 'BTC/USD',
            'ETHUSD' => 'ETH/USD',
            'SPX500USD' => 'SPX',
            'NDQ' => 'NDX',
            default => $symbol,
        };
        $q = $httpGetJson(
            sprintf('https://api.twelvedata.com/price?symbol=%s&apikey=%s', urlencode($tdSym), urlencode($apiKey)),
            5
        );
        $p = (float) ($q['price'] ?? 0);
        if ($p > 0) {
            $livePrice = $p;
            $sourceMode = 'LIVE_TICK';
            $isForming = true;
            $formingBar = [
                'open_time_utc_ms' => $currentOpenMs,
                'open' => $p,
                'high' => $p,
                'low' => $p,
                'close' => $p,
                'volume' => 0.0,
                'is_closed' => false,
            ];
        }
    }
}

// 3. Yahoo Finance fast 1m forming quote (for yahoo_finance, or free fallback ONLY when provider itself is yahoo_finance/biquote FX)
if ($sourceMode === 'UNAVAILABLE' && $provider === 'yahoo_finance') {
    $ticker = match ($symbol) {
        'SPOTBRENT', 'BRENT_FUTURES' => 'BZ=F',
        'USOIL' => 'CL=F',
        'XAUUSD' => 'GC=F',
        'XAGUSD' => 'SI=F',
        'EURUSD' => 'EURUSD=X',
        'GBPUSD' => 'GBPUSD=X',
        'USDJPY' => 'JPY=X',
        'BTCUSD' => 'BTC-USD',
        'ETHUSD' => 'ETH-USD',
        'SPX500USD' => '^GSPC',
        'NDQ' => '^NDX',
        default => $symbol,
    };
    $yf = $httpGetJson(
        sprintf('https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=1m&range=1d', urlencode($ticker)),
        5
    );
    $res = $yf['chart']['result'][0] ?? null;
    if (is_array($res)) {
        $meta = $res['meta'] ?? [];
        $regPrice = (float) ($meta['regularMarketPrice'] ?? 0);
        $q = $res['indicators']['quote'][0] ?? [];
        $closes = array_values(array_filter((array) ($q['close'] ?? []), static fn($v) => $v !== null && (float) $v > 0));
        $lastP = $regPrice > 0 ? $regPrice : (!empty($closes) ? (float) end($closes) : 0.0);
        if ($lastP > 0) {
            $livePrice = $lastP;
            $sourceMode = 'LIVE_TICK';
            $isForming = true;
            $dayOpen = (float) ($meta['chartPreviousClose'] ?? $lastP);
            $formingBar = [
                'open_time_utc_ms' => $currentOpenMs,
                'open' => $lastP > 0 ? $lastP : $dayOpen,
                'high' => max($lastP, (float) ($meta['regularMarketDayHigh'] ?? $lastP)),
                'low' => min($lastP, (float) (($meta['regularMarketDayLow'] ?? 0) > 0 ? $meta['regularMarketDayLow'] : $lastP)),
                'close' => $lastP,
                'volume' => (float) ($meta['regularMarketVolume'] ?? 0),
                'is_closed' => false,
            ];
        }
    }
}

// 4. Isolated DB latest closed candle fallback (strictly isolated by chart_id + provider_id + timeframe)
$pdo = Database::getPdo();
if ($sourceMode === 'UNAVAILABLE' && $pdo !== null) {
    try {
        $chartId = ProviderCatalog::resolveChartId($symbol);
        $stmt = $pdo->prepare(
            "SELECT open_time_utc, open_price, high_price, low_price, close_price, volume
             FROM candles
             WHERE chart_id = :chart_id AND provider_id = :provider_id AND timeframe = :tf AND is_closed = 1
             ORDER BY open_time_utc DESC LIMIT 1"
        );
        $stmt->execute([
            ':chart_id' => $chartId,
            ':provider_id' => $provider,
            ':tf' => $timeframe,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (is_array($row)) {
            $livePrice = (float) ($row['close_price'] ?? 0);
            $sourceMode = 'LAST_CLOSED_FALLBACK';
            $isForming = false;
        }
    } catch (Throwable) {
        // Non-fatal
    }
}

ApiEnvelope::sendSuccess([
    'symbol' => $symbol,
    'provider' => $provider,
    'timeframe' => $timeframe,
    'price' => $livePrice,
    'is_forming' => $isForming,
    'source_mode' => $sourceMode,
    'forming_bar' => $formingBar,
    'current_bucket_open_ms' => $currentOpenMs,
    'current_bucket_close_ms' => $bounds['close_ms'],
    'fetched_at_utc_ms' => $nowMs,
]);
