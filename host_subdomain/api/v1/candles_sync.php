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

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;
use ChartIntelligence\Providers\DukascopyAdapter;
use ChartIntelligence\Providers\EiaBenchmarkAdapter;
use ChartIntelligence\Providers\TvDatafeedAdapter;
use ChartIntelligence\Providers\TwelveDataAdapter;
use ChartIntelligence\Providers\YahooFinanceAdapter;

$symbol = preg_replace('/[^A-Za-z0-9_]/', '', $_GET['symbol'] ?? 'XAUUSD');
$provider = preg_replace('/[^a-z0-9_]/', '', $_GET['provider'] ?? 'twelve_data');
$timeframe = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $_GET['timeframe'] ?? 'M15'));
if (!in_array($timeframe, ['M15', 'H1', 'H4', 'D1'], true)) {
    $timeframe = 'M15';
}
if ($provider === 'eia_brent_spot') {
    $timeframe = 'D1';
}
// Support up to 5,000 candles per request
$limit = max(12, min(5000, (int) ($_GET['limit'] ?? 500)));
$nowMs = (int) round(microtime(true) * 1000);

$pdo = Database::getPdo();
$chartId = 'chart_' . strtolower($symbol) . '_main';

// Purge any previously persisted synthetic weekend micro-spread rows from MariaDB for intraday timeframes
if ($pdo !== null && $timeframe !== 'D1') {
    try {
        $purgeStmt = $pdo->prepare(
            "DELETE FROM candles
             WHERE chart_id = :chart_id
               AND timeframe = :tf
               AND volume = 0
               AND (high_price - low_price) < (open_price * 0.00018)"
        );
        $purgeStmt->execute([
            ':chart_id' => $chartId,
            ':tf' => $timeframe,
        ]);
    } catch (Throwable) {
        // Non-fatal cleanup
    }
}

$candles = match ($provider) {
    'tvdatafeed' => TvDatafeedAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs, !empty($_GET['refresh'])),
    'twelve_data' => TwelveDataAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs),
    'dukascopy' => DukascopyAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs),
    'eia_brent_spot' => EiaBenchmarkAdapter::fetchClosedCandles($symbol, $limit, $nowMs),
    'yahoo_finance' => YahooFinanceAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs),
    default => [],
};

$candles = CandleValidator::filterSyntheticWeekendAndCombCandles($candles, $symbol, $timeframe);

// Persist real candles to MariaDB in a fast batch transaction, then query up to $limit (up to 5,000) candles from MariaDB
if ($pdo !== null && !empty($candles)) {
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
        foreach ($candles as $bar) {
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

// Always read and merge the canonical series from MariaDB if available (up to $limit = 5,000 candles)
if ($pdo !== null) {
    $q = $pdo->prepare(
        "SELECT open_time_utc, open_price, high_price, low_price, close_price, volume
         FROM candles
         WHERE chart_id = :chart_id AND provider_id = :provider_id AND timeframe = :tf AND is_closed = 1
         ORDER BY open_time_utc DESC
         LIMIT :lim"
    );
    $q->bindValue(':chart_id', $chartId);
    $q->bindValue(':provider_id', $provider);
    $q->bindValue(':tf', $timeframe);
    $q->bindValue(':lim', $limit, PDO::PARAM_INT);
    $q->execute();
    $rows = array_reverse($q->fetchAll(PDO::FETCH_ASSOC));
    if (!empty($rows)) {
        $mergedMap = [];
        foreach ($rows as $r) {
            $openMs = (int) $r['open_time_utc'];
            if (!\ChartIntelligence\Algorithms\UtcTimeAnchor::isCandleClosed($openMs, $timeframe, $nowMs)) {
                continue;
            }
            if ($timeframe === 'D1') {
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
        foreach ($candles as $c) {
            $openMs = (int) ($c['open_time_utc_ms'] ?? 0);
            if ($openMs > 0 && \ChartIntelligence\Algorithms\UtcTimeAnchor::isCandleClosed($openMs, $timeframe, $nowMs)) {
                $mergedMap[$openMs] = $c;
            }
        }
        ksort($mergedMap);
        $dbCandles = CandleValidator::filterSyntheticWeekendAndCombCandles(array_values($mergedMap), $symbol, $timeframe);
        if (count($dbCandles) >= 5) {
            $candles = array_slice($dbCandles, -$limit);
        }
    }
}

ApiEnvelope::sendSuccess([
    'symbol' => $symbol,
    'provider' => $provider,
    'timeframe' => $timeframe,
    'count' => count($candles),
    'candles' => $candles,
]);
