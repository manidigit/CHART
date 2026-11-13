<?php
declare(strict_types=1);

require_once __DIR__ . '/core/ApiEnvelope.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/algorithms/UtcTimeAnchor.php';
require_once __DIR__ . '/algorithms/CandleValidator.php';
require_once __DIR__ . '/algorithms/TimeframeAggregator.php';
require_once __DIR__ . '/providers/YahooFinanceAdapter.php';
require_once __DIR__ . '/providers/TwelveDataAdapter.php';
require_once __DIR__ . '/providers/DukascopyAdapter.php';
require_once __DIR__ . '/providers/EiaBenchmarkAdapter.php';
require_once __DIR__ . '/providers/TvDatafeedAdapter.php';
require_once __DIR__ . '/providers/BiquoteAdapter.php';
require_once __DIR__ . '/providers/StooqAdapter.php';
require_once __DIR__ . '/providers/ProviderCatalog.php';

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Algorithms\UtcTimeAnchor;
use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;
use ChartIntelligence\Providers\BiquoteAdapter;
use ChartIntelligence\Providers\DukascopyAdapter;
use ChartIntelligence\Providers\EiaBenchmarkAdapter;
use ChartIntelligence\Providers\StooqAdapter;
use ChartIntelligence\Providers\TvDatafeedAdapter;
use ChartIntelligence\Providers\TwelveDataAdapter;
use ChartIntelligence\Providers\YahooFinanceAdapter;

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ApiEnvelope::sendCorsAndSecurityHeaders('GET, OPTIONS');
    exit;
}

$symbol = strtoupper(preg_replace('/[^A-Za-z0-9_]/', '', $_GET['symbol'] ?? 'XAUUSD'));
$provider = strtolower(preg_replace('/[^a-z0-9_]/', '', $_GET['provider'] ?? 'twelve_data'));
$timeframe = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $_GET['timeframe'] ?? 'M15'));
$userApiKey = trim((string) ($_SERVER['HTTP_X_PROVIDER_API_KEY'] ?? ($_GET['api_key'] ?? '')));
if (!in_array($timeframe, ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'], true)) {
    $timeframe = 'M15';
}
if ($provider === 'eia_brent_spot') {
    $timeframe = 'D1';
} elseif ($provider === 'stooq' && !in_array($timeframe, ['D1', 'W1'], true)) {
    $timeframe = 'D1';
}

// Support up to 5,000 candles per request
$limit = max(12, min(5000, (int) ($_GET['limit'] ?? 500)));
$clientSinceMs = max(0, (int) ($_GET['since_ms'] ?? 0));
$forceBackfill = !empty($_GET['backfill']);
$nowMs = (int) round(microtime(true) * 1000);

$pdo = Database::getPdo();
$chartId = \ChartIntelligence\Providers\ProviderCatalog::resolveChartId($symbol);
$priceBasis = \ChartIntelligence\Providers\ProviderCatalog::resolvePriceBasis($symbol, $provider);

// 1. Purge only synthetic OTC weekend micro-spread rows (Fri 22:00 UTC .. Sun 21:59 UTC),
// preserving legitimate quiet weekday Asian-session candles and 24/7 crypto bars.
if ($pdo !== null && $timeframe !== 'D1' && $timeframe !== 'W1' && UtcTimeAnchor::isOtcWeekendSymbol($symbol)) {
    try {
        $purgeStmt = $pdo->prepare(
            "DELETE FROM candles
             WHERE chart_id = :chart_id
               AND provider_id = :provider_id
               AND timeframe = :tf
               AND volume = 0
               AND (high_price - low_price) < (open_price * 0.00018)
               AND (FLOOR(open_time_utc / 1000) MOD 604800) BETWEEN 165600 AND 338399"
        );
        $purgeStmt->execute([
            ':chart_id' => $chartId,
            ':provider_id' => $provider,
            ':tf' => $timeframe,
        ]);
    } catch (Throwable) {
        // Non-fatal cleanup
    }
}

// 2. DB-FIRST LOOKUP: Inspect existing historical closed candles in MariaDB for (chart_id, provider_id, timeframe)
$storedCount = 0;
$minOpenMs = 0;
$maxOpenMs = 0;

if ($pdo !== null) {
    try {
        $metaStmt = $pdo->prepare(
            "SELECT COUNT(*) AS cnt,
                    COALESCE(MIN(open_time_utc), 0) AS min_open_ms,
                    COALESCE(MAX(open_time_utc), 0) AS max_open_ms
             FROM candles
             WHERE chart_id = :chart_id
               AND provider_id = :provider_id
               AND timeframe = :tf
               AND is_closed = 1"
        );
        $metaStmt->execute([
            ':chart_id' => $chartId,
            ':provider_id' => $provider,
            ':tf' => $timeframe,
        ]);
        $metaRow = $metaStmt->fetch(PDO::FETCH_ASSOC);
        if (is_array($metaRow)) {
            $storedCount = (int) ($metaRow['cnt'] ?? 0);
            $minOpenMs = (int) ($metaRow['min_open_ms'] ?? 0);
            $maxOpenMs = (int) ($metaRow['max_open_ms'] ?? 0);
        }
    } catch (Throwable) {
        // Non-fatal
    }
}

$instrumentSpec = \ChartIntelligence\Providers\ProviderCatalog::getInstrumentSpec($symbol, $provider);
$isCryptoAsset = UtcTimeAnchor::getSessionCalendar($symbol) === UtcTimeAnchor::CALENDAR_CRYPTO_24_7;
$expectedLastClosedOpenMs = TvDatafeedAdapter::computeExpectedLastClosedOpenMs($timeframe, $nowMs, $symbol);
$stepMs = UtcTimeAnchor::stepMilliseconds($timeframe);

// 3. 3-STATE INCREMENTAL DECISION ENGINE (DB_CACHE_HIT | DELTA_SYNC | INITIAL_BACKFILL)
$syncMode = 'INITIAL_BACKFILL';
$incomingDeltaCandles = [];
$fetchedNewBars = 0;
$upstreamError = '';
$upstreamSucceeded = false;

$minRequiredBarsForCache = match ($timeframe) {
    'M15' => 300,
    'M30' => 240,
    'H1' => 240,
    'H4' => 180,
    'D1' => 250,
    'W1' => 140,
    default => 240,
};

$resolveProviderError = static function (string $provId): string {
    return match ($provId) {
        'tvdatafeed' => TvDatafeedAdapter::$lastError,
        'biquote' => BiquoteAdapter::$lastError,
        'twelve_data' => TwelveDataAdapter::$lastError,
        'dukascopy' => DukascopyAdapter::$lastError,
        'stooq' => StooqAdapter::$lastError,
        'eia_brent_spot' => EiaBenchmarkAdapter::$lastError,
        'yahoo_finance' => YahooFinanceAdapter::$lastError,
        default => 'Unsupported provider',
    };
};

if ($pdo !== null && $storedCount >= $minRequiredBarsForCache && !$forceBackfill && $maxOpenMs >= $expectedLastClosedOpenMs) {
    // [STATE 1: DB_CACHE_HIT] Historical candles up to the latest closed UTC bucket are already stored in MariaDB.
    // ZERO external API / WebSocket calls are made!
    $syncMode = 'DB_CACHE_HIT';
    $upstreamSucceeded = true;
} elseif ($pdo !== null && $storedCount >= $minRequiredBarsForCache && !$forceBackfill && $maxOpenMs < $expectedLastClosedOpenMs) {
    // [STATE 2: DELTA_SYNC] Historical candles exist in MariaDB up to $maxOpenMs.
    // Fetch ONLY the missing newly closed candles since $maxOpenMs!
    $syncMode = 'DELTA_SYNC';
    $missingBars = (int) ceil(max(0, $expectedLastClosedOpenMs - $maxOpenMs) / max(1, $stepMs)) + 6;
    $deltaFetchLimit = max(12, min($limit, $missingBars));

    $rawDelta = match ($provider) {
        'tvdatafeed' => TvDatafeedAdapter::fetchClosedCandles($symbol, $timeframe, $deltaFetchLimit, $nowMs, true, $maxOpenMs),
        'biquote' => BiquoteAdapter::fetchClosedCandles($symbol, $timeframe, $deltaFetchLimit, $nowMs, $maxOpenMs),
        'twelve_data' => TwelveDataAdapter::fetchClosedCandles($symbol, $timeframe, $deltaFetchLimit, $nowMs, $maxOpenMs, $userApiKey),
        'dukascopy' => DukascopyAdapter::fetchClosedCandles($symbol, $timeframe, $deltaFetchLimit, $nowMs, $maxOpenMs),
        'stooq' => StooqAdapter::fetchClosedCandles($symbol, $timeframe, $deltaFetchLimit, $nowMs, $maxOpenMs, $userApiKey),
        'eia_brent_spot' => EiaBenchmarkAdapter::fetchClosedCandles($symbol, $deltaFetchLimit, $nowMs, $maxOpenMs),
        'yahoo_finance' => YahooFinanceAdapter::fetchClosedCandles($symbol, $timeframe, $deltaFetchLimit, $nowMs, $maxOpenMs),
        default => [],
    };
    $upstreamError = $resolveProviderError($provider);
    $upstreamSucceeded = ($upstreamError === '');

    $validatedDelta = CandleValidator::filterSyntheticWeekendAndCombCandles($rawDelta, $symbol, $timeframe);
    foreach ($validatedDelta as $bar) {
        if ((int) ($bar['open_time_utc_ms'] ?? 0) > $maxOpenMs) {
            $incomingDeltaCandles[] = $bar;
        }
    }
    $fetchedNewBars = count($incomingDeltaCandles);
} else {
    // [STATE 3: INITIAL_BACKFILL] First time for this (symbol, provider, timeframe) or explicit backfill=1 requested.
    $syncMode = 'INITIAL_BACKFILL';
    $rawInitial = match ($provider) {
        'tvdatafeed' => TvDatafeedAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs, true, 0),
        'biquote' => BiquoteAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs, 0),
        'twelve_data' => TwelveDataAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs, 0, $userApiKey),
        'dukascopy' => DukascopyAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs, 0),
        'stooq' => StooqAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs, 0, $userApiKey),
        'eia_brent_spot' => EiaBenchmarkAdapter::fetchClosedCandles($symbol, $limit, $nowMs, 0),
        'yahoo_finance' => YahooFinanceAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs, 0),
        default => [],
    };
    $upstreamError = $resolveProviderError($provider);
    $upstreamSucceeded = ($upstreamError === '' && !empty($rawInitial));
    $incomingDeltaCandles = CandleValidator::filterSyntheticWeekendAndCombCandles($rawInitial, $symbol, $timeframe);
    $fetchedNewBars = count($incomingDeltaCandles);
}

// 4. Persist any newly fetched closed candles to MariaDB under isolated key (chart_id, provider_id, timeframe, open_time_utc)
if ($pdo !== null && !empty($incomingDeltaCandles)) {
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare(
            "INSERT INTO candles
                (chart_id, provider_id, timeframe, open_time_utc, open_price, high_price, low_price, close_price, volume, is_closed)
             VALUES
                (:chart_id, :provider_id, :tf, :open_ms, :o, :h, :l, :c, :v, 1)
             ON DUPLICATE KEY UPDATE
                open_price = VALUES(open_price),
                high_price = VALUES(high_price),
                low_price = VALUES(low_price),
                close_price = VALUES(close_price),
                volume = VALUES(volume),
                fetched_at_utc = CURRENT_TIMESTAMP"
        );
        foreach ($incomingDeltaCandles as $bar) {
            $stmt->execute([
                ':chart_id' => $chartId,
                ':provider_id' => $provider,
                ':tf' => $timeframe,
                ':open_ms' => $bar['open_time_utc_ms'],
                ':o' => $bar['open'],
                ':h' => $bar['high'],
                ':l' => $bar['low'],
                ':c' => $bar['close'],
                ':v' => $bar['volume'],
            ]);
        }
        $pdo->commit();
    } catch (Throwable) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
    }
}

// 5. Read the canonical isolated series from MariaDB (or fallback to $incomingDeltaCandles if DB is offline)
$candles = $incomingDeltaCandles;
if ($pdo !== null) {
    try {
        if ($clientSinceMs > 0) {
            $q = $pdo->prepare(
                "SELECT open_time_utc, open_price, high_price, low_price, close_price, volume
                 FROM candles
                 WHERE chart_id = :chart_id
                   AND provider_id = :provider_id
                   AND timeframe = :tf
                   AND is_closed = 1
                   AND open_time_utc > :since_ms
                 ORDER BY open_time_utc ASC
                 LIMIT :lim"
            );
            $q->bindValue(':chart_id', $chartId);
            $q->bindValue(':provider_id', $provider);
            $q->bindValue(':tf', $timeframe);
            $q->bindValue(':since_ms', $clientSinceMs, PDO::PARAM_INT);
            $q->bindValue(':lim', $limit, PDO::PARAM_INT);
            $q->execute();
            $rows = $q->fetchAll(PDO::FETCH_ASSOC);
        } else {
            $q = $pdo->prepare(
                "SELECT open_time_utc, open_price, high_price, low_price, close_price, volume
                 FROM candles
                 WHERE chart_id = :chart_id
                   AND provider_id = :provider_id
                   AND timeframe = :tf
                   AND is_closed = 1
                 ORDER BY open_time_utc DESC
                 LIMIT :lim"
            );
            $q->bindValue(':chart_id', $chartId);
            $q->bindValue(':provider_id', $provider);
            $q->bindValue(':tf', $timeframe);
            $q->bindValue(':lim', $limit, PDO::PARAM_INT);
            $q->execute();
            $rows = array_reverse($q->fetchAll(PDO::FETCH_ASSOC));
        }

        if (!empty($rows)) {
            $mergedMap = [];
            foreach ($rows as $r) {
                $openMs = (int) $r['open_time_utc'];
                if (!UtcTimeAnchor::isCandleClosed($openMs, $timeframe, $nowMs)) {
                    continue;
                }
                if ($timeframe === 'D1' && !$isCryptoAsset) {
                    $dow = (int) gmdate('w', (int) floor($openMs / 1000));
                    if ($dow === 0 || $dow === 6) {
                        continue;
                    }
                }
                $c = CandleValidator::sanitizeCandle(
                    $openMs,
                    $timeframe,
                    $r['open_price'],
                    $r['high_price'],
                    $r['low_price'],
                    $r['close_price'],
                    $r['volume']
                );
                if ($c !== null) {
                    $mergedMap[$c['open_time_utc_ms']] = $c;
                }
            }
            ksort($mergedMap);
            $dbCandles = CandleValidator::filterSyntheticWeekendAndCombCandles(array_values($mergedMap), $symbol, $timeframe);
            if (!empty($dbCandles)) {
                $candles = array_slice($dbCandles, -$limit);
            }
        }
    } catch (Throwable) {
        // Fallback to $incomingDeltaCandles
    }
}

$totalStoredAfter = max($storedCount, count($candles));
if (!empty($candles)) {
    $minOpenMs = (int) ($candles[0]['open_time_utc_ms'] ?? $minOpenMs);
    $maxOpenMs = (int) ($candles[count($candles) - 1]['open_time_utc_ms'] ?? $maxOpenMs);
}
$lastCandleCloseMs = $maxOpenMs > 0 ? ($maxOpenMs + $stepMs) : 0;

$providerStatus = 'READY';
if ($provider === 'twelve_data' && !TwelveDataAdapter::hasConfiguredApiKey($userApiKey)) {
    $providerStatus = $totalStoredAfter > 0 ? 'DB_ARCHIVE_ONLY' : 'API_KEY_REQUIRED';
} elseif (!$upstreamSucceeded && $upstreamError !== '') {
    $providerStatus = !empty($candles) ? 'STALE_CACHE_UPSTREAM_ERROR' : 'UPSTREAM_ERROR';
} elseif (empty($candles) && $totalStoredAfter === 0) {
    $providerStatus = 'NO_DATA';
}

ApiEnvelope::sendSuccess([
    'symbol' => $symbol,
    'provider' => $provider,
    'timeframe' => $timeframe,
    'count' => count($candles),
    'sync_meta' => [
        'sync_mode' => $syncMode,
        'stored_total_bars' => $totalStoredAfter,
        'fetched_new_bars' => $fetchedNewBars,
        'min_open_time_utc_ms' => $minOpenMs,
        'max_open_time_utc_ms' => $maxOpenMs,
        'expected_last_closed_open_ms' => $expectedLastClosedOpenMs,
        'provider_status' => $providerStatus,
        'upstream_error' => $upstreamError,
        'last_fetch_utc_ms' => $upstreamSucceeded ? $nowMs : 0,
        'last_candle_close_utc_ms' => $lastCandleCloseMs,
        'price_basis' => $priceBasis,
        'instrument_spec' => $instrumentSpec,
    ],
    'candles' => $candles,
]);
