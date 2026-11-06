<?php
declare(strict_types=1);

require_once __DIR__ . '/core/ApiEnvelope.php';
require_once __DIR__ . '/algorithms/UtcTimeAnchor.php';

use ChartIntelligence\Algorithms\UtcTimeAnchor;
use ChartIntelligence\Core\ApiEnvelope;

$symbol = preg_replace('/[^A-Za-z0-9_]/', '', $_GET['symbol'] ?? 'XAUUSD');
$provider = preg_replace('/[^a-z0-9_]/', '', $_GET['provider'] ?? 'twelve_data');
$timeframe = preg_replace('/[^A-Za-z0-9]/', '', $_GET['timeframe'] ?? 'M15');
$limit = max(10, min(200, (int) ($_GET['limit'] ?? 96)));

$nowMs = (int) round(microtime(true) * 1000);
$stepMs = UtcTimeAnchor::stepMilliseconds($timeframe);
$currentBucket = UtcTimeAnchor::snapToOpenUtcMs($nowMs, $timeframe);
$latestClosedOpen = $currentBucket - $stepMs;

$basePrice = match (strtoupper($symbol)) {
    'XAUUSD' => 2742.50,
    'SPOTBRENT' => 74.85,
    'BRENT_FUTURES' => 75.10,
    'XAGUSD' => 32.40,
    'EURUSD' => 1.0845,
    default => 100.00,
};

$candles = [];
$runningClose = $basePrice;
$startOpen = $latestClosedOpen - (($limit - 1) * $stepMs);

for ($i = 0; $i < $limit; $i++) {
    $openMs = $startOpen + ($i * $stepMs);
    if (!UtcTimeAnchor::isCandleClosed($openMs, $timeframe, $nowMs)) {
        continue;
    }
    $phase = ($openMs / $stepMs) * 0.37;
    $delta = sin($phase) * ($basePrice * 0.0012);
    $open = $runningClose;
    $close = round($open + $delta, 8);
    $high = round(max($open, $close) + abs(cos($phase)) * ($basePrice * 0.0008), 8);
    $low = round(min($open, $close) - abs(sin($phase)) * ($basePrice * 0.0008), 8);
    $candles[] = [
        'open_time_utc_ms' => $openMs,
        'open_time_utc_iso' => gmdate('Y-m-d H:i \U\T\C', intdiv($openMs, 1000)),
        'open' => number_format($open, 8, '.', ''),
        'high' => number_format($high, 8, '.', ''),
        'low' => number_format($low, 8, '.', ''),
        'close' => number_format($close, 8, '.', ''),
        'volume' => number_format(650.0, 8, '.', ''),
        'is_closed' => true,
    ];
    $runningClose = $close;
}

ApiEnvelope::sendSuccess([
    'symbol' => $symbol,
    'provider' => $provider,
    'timeframe' => $timeframe,
    'candles' => $candles,
]);
