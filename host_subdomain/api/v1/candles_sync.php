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

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;
use ChartIntelligence\Providers\DukascopyAdapter;
use ChartIntelligence\Providers\EiaBenchmarkAdapter;
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
$limit = max(12, min(200, (int) ($_GET['limit'] ?? 160)));
$nowMs = (int) round(microtime(true) * 1000);

$candles = match ($provider) {
    'twelve_data' => TwelveDataAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs),
    'dukascopy' => DukascopyAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs),
    'eia_brent_spot' => EiaBenchmarkAdapter::fetchClosedCandles($symbol, $limit, $nowMs),
    'yahoo_finance' => YahooFinanceAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs),
    default => [],
};

// Persist real candles to MariaDB or read previously stored real candles if upstream is temporarily unreachable.
// Strictly NO synthetic/fake sine-wave data is ever fabricated.
$pdo = Database::getPdo();
$chartId = 'chart_' . strtolower($symbol) . '_main';

if ($pdo !== null && !empty($candles)) {
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
} elseif ($pdo !== null && empty($candles)) {
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
    foreach ($rows as $r) {
        $c = CandleValidator::sanitizeCandle(
            (int) $r['open_time_utc'],
            $timeframe,
            $r['open_price'],
            $r['high_price'],
            $r['low_price'],
            $r['close_price'],
            $r['volume']
        );
        if ($c !== null) {
            $candles[] = $c;
        }
    }
}

ApiEnvelope::sendSuccess([
    'symbol' => $symbol,
    'provider' => $provider,
    'timeframe' => $timeframe,
    'candles' => $candles,
]);
