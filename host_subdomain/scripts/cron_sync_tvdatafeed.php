<?php
declare(strict_types=1);

/**
 * CLI / Cron Job Script: Extracts PEPPERSTONE:SPOTBRENT candles via Python `tvdatafeed`
 * (`sync_tvdatafeed.py`) and upserts up to 5,000 closed bars per timeframe (M15, H1, H4, D1)
 * directly into the cPanel MariaDB `candles` table.
 *
 * Usage (cPanel Cron or SSH):
 *   php /home/manicoes/chart.manico.es/scripts/cron_sync_tvdatafeed.php
 */

require_once __DIR__ . '/../api/v1/core/Database.php';
require_once __DIR__ . '/../api/v1/providers/TvDatafeedAdapter.php';

use ChartIntelligence\Core\Database;
use ChartIntelligence\Providers\TvDatafeedAdapter;

$scriptPath = __DIR__ . '/sync_tvdatafeed.py';
$outputDir  = __DIR__ . '/../data/tvdatafeed';

if (is_file($scriptPath) && function_exists('exec')) {
    foreach (['python3', '/usr/bin/python3', '/usr/local/bin/python3', 'python'] as $bin) {
        $cmd = sprintf(
            '%s %s --symbol SPOTBRENT --exchange PEPPERSTONE --bars 5000 --output-dir %s 2>&1',
            escapeshellcmd($bin),
            escapeshellarg($scriptPath),
            escapeshellarg($outputDir)
        );
        $out = [];
        $code = 1;
        @exec($cmd, $out, $code);
        if ($code === 0) {
            break;
        }
    }
}

$pdo = Database::getPdo();
$summary = [];

foreach (['M15', 'H1', 'H4', 'D1'] as $tf) {
    $candles = TvDatafeedAdapter::fetchClosedCandles('SPOTBRENT', $tf, 5000);
    $summary[$tf] = count($candles);

    if ($pdo !== null && count($candles) > 0) {
        $sql = "INSERT INTO candles
            (chart_id, provider_id, timeframe, open_time_utc_ms, open_time_utc_iso,
             open_price, high_price, low_price, close_price, volume)
            VALUES (:cid, 'tvdatafeed', :tf, :ms, :iso, :o, :h, :l, :c, :v)
            ON DUPLICATE KEY UPDATE
            open_price = VALUES(open_price),
            high_price = VALUES(high_price),
            low_price  = VALUES(low_price),
            close_price = VALUES(close_price),
            volume     = VALUES(volume)";
        $stmt = $pdo->prepare($sql);
        $pdo->beginTransaction();
        foreach ($candles as $bar) {
            $stmt->execute([
                ':cid' => 'chart_spotbrent_main',
                ':tf'  => $tf,
                ':ms'  => $bar['open_time_utc_ms'],
                ':iso' => $bar['open_time_utc_iso'],
                ':o'   => $bar['open'],
                ':h'   => $bar['high'],
                ':l'   => $bar['low'],
                ':c'   => $bar['close'],
                ':v'   => $bar['volume'],
            ]);
        }
        $pdo->commit();
    }
}

echo json_encode([
    'ok' => true,
    'symbol' => 'SPOTBRENT',
    'exchange' => 'PEPPERSTONE',
    'provider' => 'tvdatafeed',
    'stored_in_db' => $pdo !== null,
    'counts' => $summary,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
