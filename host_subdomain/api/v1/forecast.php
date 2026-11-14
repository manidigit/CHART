<?php
declare(strict_types=1);

require_once __DIR__ . '/core/ApiEnvelope.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/forecast/ForecastEnginePhp.php';

use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;
use ChartIntelligence\Forecast\ForecastEnginePhp;

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ApiEnvelope::sendCorsAndSecurityHeaders('GET, POST, OPTIONS');
    exit;
}

ApiEnvelope::sendCorsAndSecurityHeaders('GET, POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

$pdo = Database::getPdo();
$sessionsFile = dirname(__DIR__, 2) . '/config/sessions.local.json';
$ledgerFile = dirname(__DIR__, 2) . '/config/forecast_ledger.local.json';
$rawBody = file_get_contents('php://input');
$payload = is_string($rawBody) && $rawBody !== '' ? (json_decode($rawBody, true) ?? []) : [];

$token = trim((string) ($payload['session_token'] ?? ($_GET['token'] ?? '')));
if ($token === '') {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
        $token = $matches[1];
    }
}

$nowUtc = gmdate('Y-m-d H:i:s');
$username = null;
if ($token !== '') {
    if ($pdo !== null) {
        try {
            $stmt = $pdo->prepare("SELECT username FROM user_sessions WHERE token = :t AND expires_at_utc > :now LIMIT 1");
            $stmt->execute([':t' => $token, ':now' => $nowUtc]);
            $row = $stmt->fetch();
            if ($row && !empty($row['username'])) {
                $username = (string) $row['username'];
            }
        } catch (\Throwable) {}
    }
    if ($username === null && is_file($sessionsFile)) {
        $sData = json_decode((string) file_get_contents($sessionsFile), true);
        if (is_array($sData) && isset($sData[$token])) {
            $s = $sData[$token];
            if (isset($s['expires_ts']) && (int) $s['expires_ts'] > time()) {
                $username = (string) ($s['username'] ?? '');
            }
        }
    }
}

$ownerRegistered = false;
if ($pdo !== null) {
    try {
        $uStmt = $pdo->query("SELECT 1 FROM users WHERE role = 'owner' LIMIT 1");
        if ($uStmt && $uStmt->fetch()) {
            $ownerRegistered = true;
        }
    } catch (\Throwable) {}
}
if (!$ownerRegistered) {
    $ownerFile = dirname(__DIR__, 2) . '/config/owner.local.json';
    if (is_file($ownerFile)) {
        $oData = json_decode((string) file_get_contents($ownerFile), true);
        if (is_array($oData) && !empty($oData['username'])) {
            $ownerRegistered = true;
        }
    }
}

if ($username === null) {
    if ($ownerRegistered) {
        ApiEnvelope::sendError('UNAUTHORIZED', 'auth_session_required', 401);
        exit;
    }
    $username = 'owner';
}

function loadLocalLedgerEntries(string $ledgerFile): array
{
    if (!is_file($ledgerFile)) {
        return [];
    }
    $data = json_decode((string) file_get_contents($ledgerFile), true);
    return is_array($data) ? $data : [];
}

function saveLocalLedgerEntries(string $ledgerFile, array $entries): void
{
    $dir = dirname($ledgerFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $trimmed = array_slice($entries, -120);
    @file_put_contents($ledgerFile, json_encode($trimmed, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = trim((string) ($payload['action'] ?? ($_GET['action'] ?? 'ledger')));
$symbolFilter = strtoupper(trim((string) ($payload['symbol'] ?? ($_GET['symbol'] ?? ''))));
$tfFilter = strtoupper(trim((string) ($payload['timeframe'] ?? ($_GET['timeframe'] ?? ''))));

if ($method === 'GET' || $action === 'ledger') {
    $entries = [];
    if ($pdo !== null) {
        try {
            $sql = "SELECT id, run_uuid, symbol_code, timeframe, horizon_bars, forecast_status, regime, anchor_open_time_utc_ms, anchor_close, terminal_q10, terminal_q50, terminal_q90, input_hash, prev_forecast_hash, forecast_hash, remote_worker_status, created_at_utc_ms FROM prediction_runs WHERE 1=1";
            $params = [];
            if ($symbolFilter !== '') {
                $sql .= " AND symbol_code = :sym";
                $params[':sym'] = $symbolFilter;
            }
            if ($tfFilter !== '') {
                $sql .= " AND timeframe = :tf";
                $params[':tf'] = $tfFilter;
            }
            $sql .= " ORDER BY id DESC LIMIT 50";
            $st = $pdo->prepare($sql);
            $st->execute($params);
            $rows = $st->fetchAll() ?: [];
            $entries = array_reverse($rows);
        } catch (\Throwable) {}
    }
    if (empty($entries)) {
        $local = loadLocalLedgerEntries($ledgerFile);
        $entries = array_values(array_filter($local, static function (array $row) use ($symbolFilter, $tfFilter): bool {
            if ($symbolFilter !== '' && strtoupper((string) ($row['symbol_code'] ?? '')) !== $symbolFilter) {
                return false;
            }
            if ($tfFilter !== '' && strtoupper((string) ($row['timeframe'] ?? '')) !== $tfFilter) {
                return false;
            }
            return true;
        }));
    }
    ApiEnvelope::sendSuccess([
        'entries' => $entries,
        'count' => count($entries),
    ], 'forecast_ledger_loaded');
    exit;
}

if ($method !== 'POST') {
    ApiEnvelope::sendError('METHOD_NOT_ALLOWED', 'error_method_not_allowed', 405);
    exit;
}

$symbolCode = strtoupper(trim((string) ($payload['symbol'] ?? 'SPOTBRENT')));
$timeframe = strtoupper(trim((string) ($payload['timeframe'] ?? 'M15')));
$horizonBars = max(10, min(60, (int) ($payload['horizon_bars'] ?? 30)));
$workerUrl = trim((string) ($payload['worker_url'] ?? ''));

$candles = is_array($payload['candles'] ?? null) ? $payload['candles'] : [];
if (empty($candles) && $pdo !== null) {
    try {
        $cStmt = $pdo->prepare("SELECT open_time_utc_ms, open_price AS open, high_price AS high, low_price AS low, close_price AS close, volume FROM candles WHERE symbol_code = :s AND timeframe = :tf ORDER BY open_time_utc_ms DESC LIMIT 200");
        $cStmt->execute([':s' => $symbolCode, ':tf' => $timeframe]);
        $fetched = $cStmt->fetchAll() ?: [];
        $candles = array_reverse($fetched);
    } catch (\Throwable) {}
}

$clientEntry = is_array($payload['client_forecast'] ?? null) ? $payload['client_forecast'] : null;
$forecast = $action === 'append_client_forecast' && $clientEntry !== null
    ? $clientEntry
    : ForecastEnginePhp::project($candles, $symbolCode, $timeframe, $horizonBars, $workerUrl);

if (($forecast['status'] ?? '') === 'DATA_NOT_READY') {
    ApiEnvelope::sendSuccess([
        'forecast' => $forecast,
        'ledger_entry' => null,
    ], 'forecast_data_not_ready');
    exit;
}

$prevHash = ForecastEnginePhp::GENESIS_HASH;
$localEntries = loadLocalLedgerEntries($ledgerFile);
if ($pdo !== null) {
    try {
        $lastStmt = $pdo->query("SELECT forecast_hash FROM prediction_runs ORDER BY id DESC LIMIT 1");
        $lastRow = $lastStmt ? $lastStmt->fetch() : null;
        if ($lastRow && !empty($lastRow['forecast_hash'])) {
            $prevHash = (string) $lastRow['forecast_hash'];
        }
    } catch (\Throwable) {}
} elseif (!empty($localEntries)) {
    $prevHash = (string) ($localEntries[count($localEntries) - 1]['forecast_hash'] ?? ForecastEnginePhp::GENESIS_HASH);
}

$nowMs = (int) round(microtime(true) * 1000);
$summary = is_array($forecast['summary'] ?? null) ? $forecast['summary'] : [];
$anchorMs = (int) ($forecast['anchorOpenTimeUtcMs'] ?? $nowMs);
$anchorClose = (float) ($forecast['anchorClose'] ?? 0);
$termQ10 = (float) ($summary['terminalQ10'] ?? 0);
$termQ50 = (float) ($summary['terminalQ50'] ?? 0);
$termQ90 = (float) ($summary['terminalQ90'] ?? 0);
$inputHash = (string) ($forecast['inputHash'] ?? hash('sha256', $symbolCode . '|' . $timeframe . '|' . $anchorMs));
$forecastStatus = (string) ($forecast['status'] ?? 'PROVISIONAL');
$regime = (string) ($forecast['regime'] ?? 'RANGING');
$workerStatus = (string) ($forecast['remoteWorker']['status'] ?? 'LOCAL_STATISTICAL_ONLY');

$hashBody = [
    'symbol_code' => $symbolCode,
    'timeframe' => $timeframe,
    'horizon_bars' => $horizonBars,
    'anchor_open_time_utc_ms' => $anchorMs,
    'anchor_close' => round($anchorClose, 8),
    'terminal_q50' => round($termQ50, 8),
    'input_hash' => $inputHash,
    'created_at_utc_ms' => $nowMs,
];
$forecastHash = ForecastEnginePhp::computeChainHash($prevHash, $hashBody);
$runUuid = sprintf('%s-%s-%d-%s', $symbolCode, $timeframe, $nowMs, substr($forecastHash, 0, 8));

$ledgerRecord = [
    'run_uuid' => $runUuid,
    'username' => $username,
    'symbol_code' => $symbolCode,
    'timeframe' => $timeframe,
    'horizon_bars' => $horizonBars,
    'forecast_status' => $forecastStatus,
    'regime' => $regime,
    'anchor_open_time_utc_ms' => $anchorMs,
    'anchor_close' => $anchorClose,
    'terminal_q10' => $termQ10,
    'terminal_q50' => $termQ50,
    'terminal_q90' => $termQ90,
    'input_hash' => $inputHash,
    'prev_forecast_hash' => $prevHash,
    'forecast_hash' => $forecastHash,
    'remote_worker_status' => $workerStatus,
    'created_at_utc_ms' => $nowMs,
];

if ($pdo !== null) {
    try {
        $ins = $pdo->prepare("INSERT INTO prediction_runs (run_uuid, username, symbol_code, timeframe, horizon_bars, contract_version, forecast_status, regime, anchor_open_time_utc_ms, anchor_close, terminal_q10, terminal_q50, terminal_q90, input_hash, prev_forecast_hash, forecast_hash, remote_worker_status, payload_json, created_at_utc_ms) VALUES (:uuid, :user, :sym, :tf, :hor, :cv, :st, :reg, :ams, :acl, :q10, :q50, :q90, :ih, :ph, :fh, :rws, :pl, :cms)");
        $ins->execute([
            ':uuid' => $runUuid,
            ':user' => $username,
            ':sym' => $symbolCode,
            ':tf' => $timeframe,
            ':hor' => $horizonBars,
            ':cv' => ForecastEnginePhp::CONTRACT_VERSION,
            ':st' => $forecastStatus,
            ':reg' => $regime,
            ':ams' => $anchorMs,
            ':acl' => $anchorClose,
            ':q10' => $termQ10,
            ':q50' => $termQ50,
            ':q90' => $termQ90,
            ':ih' => $inputHash,
            ':ph' => $prevHash,
            ':fh' => $forecastHash,
            ':rws' => $workerStatus,
            ':pl' => json_encode($forecast, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ':cms' => $nowMs,
        ]);
        $runId = (int) $pdo->lastInsertId();

        if ($runId > 0 && is_array($forecast['points'] ?? null)) {
            $ptIns = $pdo->prepare("INSERT INTO prediction_forecasts (run_id, step_ahead, open_time_utc_ms, q10, q25, q50, q75, q90, synth_open, synth_high, synth_low, synth_close) VALUES (:rid, :st, :ms, :q10, :q25, :q50, :q75, :q90, :o, :h, :l, :c)");
            foreach ($forecast['points'] as $pt) {
                $ptIns->execute([
                    ':rid' => $runId,
                    ':st' => (int) ($pt['stepAhead'] ?? 0),
                    ':ms' => (int) ($pt['openTimeUtcMs'] ?? 0),
                    ':q10' => (float) ($pt['q10'] ?? 0),
                    ':q25' => (float) ($pt['q25'] ?? 0),
                    ':q50' => (float) ($pt['q50'] ?? 0),
                    ':q75' => (float) ($pt['q75'] ?? 0),
                    ':q90' => (float) ($pt['q90'] ?? 0),
                    ':o' => (float) ($pt['open'] ?? 0),
                    ':h' => (float) ($pt['high'] ?? 0),
                    ':l' => (float) ($pt['low'] ?? 0),
                    ':c' => (float) ($pt['close'] ?? 0),
                ]);
            }
        }
    } catch (\Throwable) {}
}

$localEntries[] = $ledgerRecord;
saveLocalLedgerEntries($ledgerFile, $localEntries);

ApiEnvelope::sendSuccess([
    'forecast' => $forecast,
    'ledger_entry' => $ledgerRecord,
], 'forecast_recorded');
