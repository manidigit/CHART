<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/core/ApiEnvelope.php';
require_once dirname(__DIR__) . '/core/Database.php';

use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$nowSec = time();
$nowMs = (int) round(microtime(true) * 1000);
$nowUtc = gmdate('Y-m-d\TH:i:s\Z');

$pdo = Database::getPdo();
$cfg = Database::getConfig();

$dbConnected = ($pdo !== null);
$dbVersion = 'Unknown';
$totalCandles = 0;
$candleStats = [];
$ownerRegistered = false;

if ($dbConnected) {
    try {
        $vStmt = $pdo->query("SELECT VERSION() as v");
        if ($vStmt && ($row = $vStmt->fetch())) {
            $dbVersion = (string) ($row['v'] ?? 'Unknown');
        }
    } catch (\Throwable) {
        $dbVersion = 'MariaDB';
    }

    try {
        $cntStmt = $pdo->query("SELECT COUNT(*) as c FROM candles");
        if ($cntStmt && ($row = $cntStmt->fetch())) {
            $totalCandles = (int) ($row['c'] ?? 0);
        }
    } catch (\Throwable) {}

    try {
        $statsStmt = $pdo->query("
            SELECT chart_id, timeframe, provider_id, COUNT(*) as count,
                   MIN(open_time_utc) as min_utc_ms,
                   MAX(open_time_utc) as max_utc_ms
            FROM candles
            GROUP BY chart_id, timeframe, provider_id
            ORDER BY chart_id, timeframe
        ");
        if ($statsStmt) {
            while ($r = $statsStmt->fetch()) {
                $candleStats[] = [
                    'chart_id' => (string) $r['chart_id'],
                    'timeframe' => (string) $r['timeframe'],
                    'provider_id' => (string) $r['provider_id'],
                    'count' => (int) $r['count'],
                    'min_utc_ms' => (int) $r['min_utc_ms'],
                    'max_utc_ms' => (int) $r['max_utc_ms'],
                ];
            }
        }
    } catch (\Throwable) {}

    try {
        $uStmt = $pdo->query("SELECT COUNT(*) as uc FROM users WHERE role = 'owner'");
        if ($uStmt && ($row = $uStmt->fetch())) {
            $ownerRegistered = ((int) ($row['uc'] ?? 0)) > 0;
        }
    } catch (\Throwable) {}
}

if (!$ownerRegistered) {
    $fbFile = dirname(__DIR__, 2) . '/config/owner.local.json';
    if (is_file($fbFile)) {
        $fb = json_decode((string) file_get_contents($fbFile), true);
        $ownerRegistered = is_array($fb) && !empty($fb['username']);
    }
}

// Fallback to static JSON file candle counts if DB is empty or not yet seeded
if ($totalCandles === 0) {
    $tvDir = dirname(__DIR__, 2) . '/data/tvdatafeed';
    if (is_dir($tvDir)) {
        $files = glob($tvDir . '/*.json');
        if (is_array($files)) {
            foreach ($files as $f) {
                $base = basename($f, '.json');
                $parts = explode('_', $base);
                $sym = $parts[0] ?? 'UNKNOWN';
                $tf = $parts[1] ?? 'M15';
                $data = json_decode((string) file_get_contents($f), true);
                $cnt = is_array($data) && isset($data['candles']) ? count($data['candles']) : 0;
                if ($cnt > 0) {
                    $totalCandles += $cnt;
                    $candleStats[] = [
                        'chart_id' => 'chart_' . strtolower($sym) . '_main',
                        'timeframe' => $tf,
                        'provider_id' => 'tvdatafeed_cache',
                        'count' => $cnt,
                        'min_utc_ms' => (int) ($data['candles'][0]['open_time_utc_ms'] ?? 0),
                        'max_utc_ms' => (int) ($data['candles'][$cnt - 1]['open_time_utc_ms'] ?? 0),
                    ];
                }
            }
        }
    }
}

ApiEnvelope::sendSuccess([
    'status' => 'healthy',
    'version' => '1.32.0',
    'phase' => 'Phase 1 - DB-First Central Core, 6-Provider & 22-Symbol Catalog',
    'server_time_utc' => $nowUtc,
    'server_time_ms' => $nowMs,
    'database' => [
        'connected' => $dbConnected,
        'engine' => 'MariaDB',
        'version' => $dbVersion,
        'host' => $cfg['DB_HOST'] ?? 'localhost',
        'database_name' => $cfg['DB_NAME'] ?? '',
    ],
    'total_candles' => $totalCandles,
    'candle_stats' => $candleStats,
    'registered_owner' => $ownerRegistered,
    'supported_timeframes' => ['M15', 'H1', 'H4', 'D1', 'W1'],
    'supported_providers' => ['tvdatafeed', 'biquote', 'twelve_data', 'dukascopy', 'yahoo_finance', 'eia_brent_spot'],
], 'status_system_healthy');
