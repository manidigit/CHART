<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/core/ApiEnvelope.php';
require_once dirname(__DIR__) . '/core/Database.php';

use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ApiEnvelope::sendCorsAndSecurityHeaders('GET, OPTIONS');
    exit;
}

ApiEnvelope::sendCorsAndSecurityHeaders('GET, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

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

// MariaDB is the single source of truth for candle counts (no disk JSON cache fallback).

$phpRuntime = [
    'php_version' => PHP_VERSION,
    'memory_limit' => (string) ini_get('memory_limit'),
    'max_execution_time' => (int) ini_get('max_execution_time'),
    'upload_max_filesize' => (string) ini_get('upload_max_filesize'),
    'post_max_size' => (string) ini_get('post_max_size'),
    'extensions' => [
        'pdo_mysql' => extension_loaded('pdo_mysql'),
        'curl' => extension_loaded('curl'),
        'openssl' => extension_loaded('openssl'),
        'mbstring' => extension_loaded('mbstring'),
        'zip' => extension_loaded('zip'),
        'json' => extension_loaded('json'),
    ],
];

ApiEnvelope::sendSuccess([
    'status' => 'healthy',
    'version' => '1.47.1',
    'phase' => 'Phase 1-3 Core Engine & Native Browser Structural Forecast (v1.47.1)',
    'server_time_utc' => $nowUtc,
    'server_time_ms' => $nowMs,
    'database' => [
        'connected' => $dbConnected,
        'engine' => 'MariaDB',
        'version' => $dbVersion,
        'host' => $cfg['DB_HOST'] ?? 'localhost',
        'database_name' => $cfg['DB_NAME'] ?? '',
    ],
    'php_runtime' => $phpRuntime,
    'total_candles' => $totalCandles,
    'candle_stats' => $candleStats,
    'registered_owner' => $ownerRegistered,
    'supported_timeframes' => ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'],
    'supported_providers' => ['tvdatafeed', 'biquote', 'twelve_data', 'dukascopy', 'yahoo_finance', 'stooq', 'eia_brent_spot', 'local_csv'],
], 'status_system_healthy');
