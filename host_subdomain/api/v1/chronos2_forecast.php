<?php
declare(strict_types=1);

require_once __DIR__ . '/core/Config.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Response.php';
require_once __DIR__ . '/core/Chronos2QueueManager.php';
require_once __DIR__ . '/algorithms/UtcTimeAnchor.php';
require_once __DIR__ . '/algorithms/CandleValidator.php';
require_once __DIR__ . '/algorithms/TimeframeAggregator.php';
require_once __DIR__ . '/providers/TvDatafeedAdapter.php';

use ChartIntelligence\Core\Chronos2QueueManager;
use ChartIntelligence\Core\Response;

/**
 * API Endpoint: `/api/v1/chronos2_forecast.php`
 * =============================================
 * Connects the CHART frontend to the official `amazon/chronos-2` engine
 * (`29ec3766d36d6f73f0696f85560a422f50e8498c`).
 *
 * - Accepts GET or POST parameters:
 *   `symbol`, `provider`, `timeframe`, `horizon` (default 30), `context_bars` (default 256),
 *   `mode` (`auto` | `cache_only` | `enqueue_only`), and optional `candles` (closed candles from active tab).
 * - Enforces single-instance execution via `flock` mutex.
 * - Caches by `(symbol, provider, timeframe, last_closed_candle_ms, horizon, model_revision)`.
 */

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    Response::json(['status' => 'OK']);
}

$rawBody = file_get_contents('php://input');
$bodyData = ($rawBody !== false && $rawBody !== '') ? (json_decode($rawBody, true) ?: []) : [];

$symbol = strtoupper(trim((string) ($bodyData['symbol'] ?? $_GET['symbol'] ?? 'SPOTBRENT')));
$provider = strtolower(trim((string) ($bodyData['provider'] ?? $_GET['provider'] ?? 'tvdatafeed')));
$timeframe = strtoupper(trim((string) ($bodyData['timeframe'] ?? $_GET['timeframe'] ?? 'H1')));
$horizon = (int) ($bodyData['horizon'] ?? $_GET['horizon'] ?? Chronos2QueueManager::DEFAULT_HORIZON);
$contextBars = (int) ($bodyData['context_bars'] ?? $_GET['context_bars'] ?? Chronos2QueueManager::DEFAULT_CONTEXT_BARS);
$mode = strtolower(trim((string) ($bodyData['mode'] ?? $_GET['mode'] ?? 'auto')));
$clientCandles = is_array($bodyData['candles'] ?? null) ? $bodyData['candles'] : [];

$horizon = max(1, min(120, $horizon));
$contextBars = max(Chronos2QueueManager::MIN_CLOSED_BARS, min(2048, $contextBars));
$nowMs = (int) round(microtime(true) * 1000);

$closedCandles = Chronos2QueueManager::resolveClosedCandles(
    $symbol,
    $provider,
    $timeframe,
    $nowMs,
    $clientCandles,
    max(300, $contextBars)
);

if (count($closedCandles) < Chronos2QueueManager::MIN_CLOSED_BARS) {
    Response::error(
        sprintf(
            'Insufficient closed candles for %s (%s): %d closed bars available, minimum %d required.',
            $symbol,
            $timeframe,
            count($closedCandles),
            Chronos2QueueManager::MIN_CLOSED_BARS
        ),
        422
    );
}

$lastClosedBar = $closedCandles[count($closedCandles) - 1];
$originOpenMs = (int) ($lastClosedBar['open_time_utc_ms'] ?? 0);
$cacheKey = Chronos2QueueManager::buildCacheKey($symbol, $provider, $timeframe, $originOpenMs, $horizon);

if ($mode === 'cache_only') {
    $cached = Chronos2QueueManager::readCachedForecast($cacheKey, $symbol, $provider, $timeframe, $originOpenMs, $horizon);
    if ($cached !== null) {
        Response::json($cached, 200);
    }
    $jobFile = Chronos2QueueManager::getJobFilePath($cacheKey);
    if (is_file($jobFile)) {
        Response::json([
            'status'                  => 'PROCESSING',
            'cache_key'               => $cacheKey,
            'symbol'                  => $symbol,
            'provider'                => $provider,
            'timeframe'               => $timeframe,
            'origin_open_time_utc_ms' => $originOpenMs,
            'horizon_bars'            => $horizon,
            'model_id'                => Chronos2QueueManager::MODEL_ID,
            'hf_revision_sha'         => Chronos2QueueManager::MODEL_REVISION,
        ], 202);
    }
    Response::json([
        'status'                  => 'NOT_CACHED',
        'cache_key'               => $cacheKey,
        'symbol'                  => $symbol,
        'provider'                => $provider,
        'timeframe'               => $timeframe,
        'origin_open_time_utc_ms' => $originOpenMs,
        'horizon_bars'            => $horizon,
    ], 200);
}

$executeIfLockFree = ($mode !== 'enqueue_only');
$result = Chronos2QueueManager::requestOrRunForecast(
    $symbol,
    $provider,
    $timeframe,
    $closedCandles,
    $horizon,
    $contextBars,
    $executeIfLockFree
);

$httpStatus = match ($result['status'] ?? 'ERROR') {
    'READY' => 200,
    'PROCESSING', 'QUEUED' => 202,
    default => 500,
};

Response::json($result, $httpStatus);
