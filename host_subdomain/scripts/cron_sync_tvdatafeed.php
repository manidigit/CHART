<?php
declare(strict_types=1);

/**
 * CLI / Cron Job Script: Pure-PHP TradingView WebSocket → MariaDB incremental sync.
 *
 * Fetches newly closed bars directly from TradingView via `TvDatafeedAdapter`
 * (without writing any CSV/JSON files on disk) and upserts them directly into
 * the MariaDB `candles` table using the canonical schema columns.
 *
 * Usage (cPanel Cron or SSH):
 *   php /home/manicoes/chart.manico.es/scripts/cron_sync_tvdatafeed.php
 */

require_once __DIR__ . '/../api/v1/algorithms/UtcTimeAnchor.php';
require_once __DIR__ . '/../api/v1/algorithms/CandleValidator.php';
require_once __DIR__ . '/../api/v1/algorithms/TimeframeAggregator.php';
require_once __DIR__ . '/../api/v1/core/Database.php';
require_once __DIR__ . '/../api/v1/providers/TvDatafeedAdapter.php';

use ChartIntelligence\Core\Database;
use ChartIntelligence\Providers\TvDatafeedAdapter;

$pdo = Database::getPdo();
if ($pdo === null) {
    fwrite(STDERR, json_encode([
        'ok' => false,
        'error' => 'MariaDB connection unavailable',
    ], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    exit(1);
}

$nowMs = (int) round(microtime(true) * 1000);
$targets = [
    ['symbol' => 'SPOTBRENT', 'chart_id' => 'chart_spotbrent_main'],
    ['symbol' => 'XAUUSD', 'chart_id' => 'chart_xauusd_main'],
];
$timeframes = ['M15', 'H1', 'H4', 'D1', 'W1'];

$maxStmt = $pdo->prepare(
    "SELECT MAX(open_time_utc) AS last_open_ms
     FROM candles
     WHERE chart_id = :cid AND provider_id = 'tvdatafeed' AND timeframe = :tf"
);

$upsertStmt = $pdo->prepare(
    "INSERT INTO candles
        (chart_id, provider_id, timeframe, open_time_utc,
         open_price, high_price, low_price, close_price, volume, is_closed)
     VALUES (:cid, 'tvdatafeed', :tf, :open_ms, :o, :h, :l, :c, :v, 1)
     ON DUPLICATE KEY UPDATE
        open_price  = VALUES(open_price),
        high_price  = VALUES(high_price),
        low_price   = VALUES(low_price),
        close_price = VALUES(close_price),
        volume      = VALUES(volume),
        is_closed   = 1"
);

$summary = [];

foreach ($targets as $target) {
    $symbol = $target['symbol'];
    $chartId = $target['chart_id'];
    $summary[$symbol] = [];

    foreach ($timeframes as $tf) {
        $maxStmt->execute([':cid' => $chartId, ':tf' => $tf]);
        $row = $maxStmt->fetch(\PDO::FETCH_ASSOC);
        $sinceOpenMs = isset($row['last_open_ms']) && $row['last_open_ms'] !== null
            ? (int) $row['last_open_ms']
            : 0;

        $candles = TvDatafeedAdapter::fetchClosedCandles($symbol, $tf, 1500, $nowMs, false, $sinceOpenMs);
        $upserted = 0;

        if (count($candles) > 0) {
            $pdo->beginTransaction();
            try {
                foreach ($candles as $bar) {
                    $upsertStmt->execute([
                        ':cid'     => $chartId,
                        ':tf'      => $tf,
                        ':open_ms' => (int) ($bar['open_time_utc_ms'] ?? 0),
                        ':o'       => (string) ($bar['open'] ?? '0'),
                        ':h'       => (string) ($bar['high'] ?? '0'),
                        ':l'       => (string) ($bar['low'] ?? '0'),
                        ':c'       => (string) ($bar['close'] ?? '0'),
                        ':v'       => (string) ($bar['volume'] ?? '0'),
                    ]);
                    $upserted++;
                }
                $pdo->commit();
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                $summary[$symbol][$tf] = ['upserted' => 0, 'error' => $e->getMessage()];
                continue;
            }
        }

        $summary[$symbol][$tf] = [
            'since_open_ms' => $sinceOpenMs,
            'upserted'      => $upserted,
            'last_error'    => TvDatafeedAdapter::$lastError !== '' ? TvDatafeedAdapter::$lastError : null,
        ];
    }
}

echo json_encode([
    'ok'            => true,
    'provider'      => 'tvdatafeed',
    'mode'          => 'DIRECT_WEBSOCKET_TO_MARIADB',
    'synced_at_ms'  => $nowMs,
    'results'       => $summary,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
