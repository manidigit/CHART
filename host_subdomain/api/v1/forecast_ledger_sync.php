<?php
declare(strict_types=1);

require_once __DIR__ . '/core/ApiEnvelope.php';
require_once __DIR__ . '/core/Database.php';

use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ApiEnvelope::sendCorsAndSecurityHeaders('GET, POST, OPTIONS');
    exit;
}

ApiEnvelope::sendCorsAndSecurityHeaders('GET, POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

$pdo = Database::getPdo();
$sessionsFile = dirname(__DIR__, 2) . '/config/sessions.local.json';
$ledgerFile = dirname(__DIR__, 2) . '/config/forecast_ledger.local.json';

const MAX_CLOUD_LEDGER_ENTRIES = 120;
const MAX_CLOUD_LIFECYCLE_EVENTS = 240;

if ($pdo !== null) {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS prediction_ledger_entries (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(64) NOT NULL DEFAULT 'owner',
            forecast_hash CHAR(64) NOT NULL,
            prev_forecast_hash CHAR(64) NOT NULL,
            seq INT UNSIGNED NOT NULL DEFAULT 1,
            batch_id VARCHAR(96) NOT NULL DEFAULT '',
            symbol_code VARCHAR(32) NOT NULL,
            timeframe VARCHAR(16) NOT NULL,
            horizon_bars INT NOT NULL DEFAULT 30,
            model_id VARCHAR(64) NOT NULL DEFAULT 'AUTO',
            anchor_open_time_utc_ms BIGINT NOT NULL DEFAULT 0,
            recorded_at_utc_ms BIGINT NOT NULL DEFAULT 0,
            entry_json MEDIUMTEXT NOT NULL,
            updated_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_pred_ledger_user_hash (username, forecast_hash),
            INDEX idx_pred_ledger_user_rec (username, recorded_at_utc_ms),
            INDEX idx_pred_ledger_sym_tf (symbol_code, timeframe, anchor_open_time_utc_ms)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $pdo->exec("CREATE TABLE IF NOT EXISTS prediction_ledger_lifecycle (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(64) NOT NULL DEFAULT 'owner',
            event_hash CHAR(64) NOT NULL,
            prev_event_hash CHAR(64) NOT NULL,
            forecast_hash CHAR(64) NOT NULL,
            seq INT UNSIGNED NOT NULL DEFAULT 1,
            symbol_code VARCHAR(32) NOT NULL,
            timeframe VARCHAR(16) NOT NULL,
            horizon_step INT NOT NULL DEFAULT 0,
            lifecycle_status VARCHAR(24) NOT NULL,
            evaluation_outcome VARCHAR(24) NOT NULL,
            recorded_at_utc_ms BIGINT NOT NULL DEFAULT 0,
            event_json MEDIUMTEXT NOT NULL,
            updated_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_pred_lc_user_hash (username, event_hash),
            INDEX idx_pred_lc_user_rec (username, recorded_at_utc_ms),
            INDEX idx_pred_lc_fc_hash (username, forecast_hash, horizon_step)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $pdo->exec("CREATE TABLE IF NOT EXISTS prediction_lifecycle_events (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            event_uuid VARCHAR(64) NOT NULL UNIQUE,
            run_uuid VARCHAR(64) NULL,
            forecast_hash CHAR(64) NOT NULL,
            symbol_code VARCHAR(32) NOT NULL,
            timeframe VARCHAR(16) NOT NULL,
            horizon_step INT NOT NULL DEFAULT 0,
            lifecycle_status VARCHAR(24) NOT NULL,
            evaluation_outcome VARCHAR(24) NOT NULL,
            reason VARCHAR(255) NOT NULL DEFAULT '',
            observed_close DECIMAL(18,8) NULL,
            prev_event_hash CHAR(64) NOT NULL,
            event_hash CHAR(64) NOT NULL,
            recorded_at_utc_ms BIGINT NOT NULL,
            INDEX idx_pred_lc_hash (forecast_hash, horizon_step),
            INDEX idx_pred_lc_sym (symbol_code, timeframe, recorded_at_utc_ms)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (\Throwable) {}
}

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
$ownerFile = dirname(__DIR__, 2) . '/config/owner.local.json';
if (!$ownerRegistered && is_file($ownerFile)) {
    $ownerData = json_decode((string) @file_get_contents($ownerFile), true);
    if (is_array($ownerData) && !empty($ownerData['username'])) {
        $ownerRegistered = true;
    }
}

if ($username === null || $username === '') {
    if ($ownerRegistered) {
        ApiEnvelope::sendError('UNAUTHORIZED', 'error_invalid_credentials', 401);
    }
    $username = 'owner';
}

function ci_load_cloud_ledger(?\PDO $pdo, string $username, string $ledgerFile): array
{
    $entriesByHash = [];
    $eventsByHash = [];

    if ($pdo !== null) {
        try {
            $eStmt = $pdo->prepare("SELECT entry_json FROM prediction_ledger_entries WHERE username = :u ORDER BY recorded_at_utc_ms ASC, seq ASC LIMIT " . (MAX_CLOUD_LEDGER_ENTRIES * 2));
            $eStmt->execute([':u' => $username]);
            while ($row = $eStmt->fetch()) {
                $item = json_decode((string) ($row['entry_json'] ?? ''), true);
                if (is_array($item) && !empty($item['forecastHash'])) {
                    $item['syncedToCloud'] = true;
                    $entriesByHash[(string) $item['forecastHash']] = $item;
                }
            }

            $lStmt = $pdo->prepare("SELECT event_json FROM prediction_ledger_lifecycle WHERE username = :u ORDER BY recorded_at_utc_ms ASC, seq ASC LIMIT " . (MAX_CLOUD_LIFECYCLE_EVENTS * 2));
            $lStmt->execute([':u' => $username]);
            while ($row = $lStmt->fetch()) {
                $ev = json_decode((string) ($row['event_json'] ?? ''), true);
                if (is_array($ev) && !empty($ev['eventHash'])) {
                    $eventsByHash[(string) $ev['eventHash']] = $ev;
                }
            }
        } catch (\Throwable) {}
    }

    if ((empty($entriesByHash) && empty($eventsByHash)) && is_file($ledgerFile)) {
        $fbAll = json_decode((string) @file_get_contents($ledgerFile), true);
        $userBlock = is_array($fbAll) ? ($fbAll[$username] ?? ($fbAll['entries'] ? $fbAll : null)) : null;
        if (is_array($userBlock)) {
            foreach (($userBlock['entries'] ?? []) as $item) {
                if (is_array($item) && !empty($item['forecastHash'])) {
                    $item['syncedToCloud'] = true;
                    $entriesByHash[(string) $item['forecastHash']] = $item;
                }
            }
            foreach (($userBlock['lifecycle_events'] ?? []) as $ev) {
                if (is_array($ev) && !empty($ev['eventHash'])) {
                    $eventsByHash[(string) $ev['eventHash']] = $ev;
                }
            }
        }
    }

    $entries = array_values($entriesByHash);
    usort($entries, static function (array $a, array $b): int {
        $tA = (int) ($a['recordedAtUtcMs'] ?? $a['generatedAtUtcMs'] ?? 0);
        $tB = (int) ($b['recordedAtUtcMs'] ?? $b['generatedAtUtcMs'] ?? 0);
        if ($tA !== $tB) {
            return $tA <=> $tB;
        }
        return ((int) ($a['seq'] ?? 0)) <=> ((int) ($b['seq'] ?? 0));
    });
    if (count($entries) > MAX_CLOUD_LEDGER_ENTRIES) {
        $entries = array_slice($entries, -MAX_CLOUD_LEDGER_ENTRIES);
    }

    $events = array_values($eventsByHash);
    usort($events, static function (array $a, array $b): int {
        $tA = (int) ($a['recordedAtUtcMs'] ?? 0);
        $tB = (int) ($b['recordedAtUtcMs'] ?? 0);
        if ($tA !== $tB) {
            return $tA <=> $tB;
        }
        return ((int) ($a['seq'] ?? 0)) <=> ((int) ($b['seq'] ?? 0));
    });
    if (count($events) > MAX_CLOUD_LIFECYCLE_EVENTS) {
        $events = array_slice($events, -MAX_CLOUD_LIFECYCLE_EVENTS);
    }

    return [
        'entries' => $entries,
        'lifecycle_events' => $events,
    ];
}

$method = strtoupper($_SERVER['REQUEST_METHOD']);

if ($method === 'GET') {
    $loaded = ci_load_cloud_ledger($pdo, $username, $ledgerFile);
    ApiEnvelope::sendSuccess([
        'username' => $username,
        'entries' => $loaded['entries'],
        'lifecycle_events' => $loaded['lifecycle_events'],
        'entry_count' => count($loaded['entries']),
        'lifecycle_count' => count($loaded['lifecycle_events']),
        'updated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ], 'status_forecast_ledger_loaded');
}

if ($method === 'POST') {
    $incomingEntries = is_array($payload['entries'] ?? null) ? $payload['entries'] : [];
    $incomingEvents = is_array($payload['lifecycle_events'] ?? null) ? $payload['lifecycle_events'] : [];

    $existing = ci_load_cloud_ledger($pdo, $username, $ledgerFile);
    $entriesByHash = [];
    foreach ($existing['entries'] as $e) {
        if (is_array($e) && !empty($e['forecastHash'])) {
            $entriesByHash[(string) $e['forecastHash']] = $e;
        }
    }
    foreach ($incomingEntries as $e) {
        if (!is_array($e) || empty($e['forecastHash'])) {
            continue;
        }
        $hash = substr(trim((string) $e['forecastHash']), 0, 64);
        if ($hash === '') {
            continue;
        }
        $e['forecastHash'] = $hash;
        $e['syncedToCloud'] = true;
        $entriesByHash[$hash] = $e;
    }

    $eventsByHash = [];
    foreach ($existing['lifecycle_events'] as $ev) {
        if (is_array($ev) && !empty($ev['eventHash'])) {
            $eventsByHash[(string) $ev['eventHash']] = $ev;
        }
    }
    foreach ($incomingEvents as $ev) {
        if (!is_array($ev) || empty($ev['eventHash'])) {
            continue;
        }
        $eHash = substr(trim((string) $ev['eventHash']), 0, 64);
        if ($eHash === '') {
            continue;
        }
        $ev['eventHash'] = $eHash;
        if (isset($entriesByHash[$eHash]) && empty($ev['evaluationDetails']) && !empty($eventsByHash[$eHash]['evaluationDetails'])) {
            $ev['evaluationDetails'] = $eventsByHash[$eHash]['evaluationDetails'];
        }
        $eventsByHash[$eHash] = $ev;
    }

    $mergedEntries = array_values($entriesByHash);
    usort($mergedEntries, static function (array $a, array $b): int {
        $tA = (int) ($a['recordedAtUtcMs'] ?? $a['generatedAtUtcMs'] ?? 0);
        $tB = (int) ($b['recordedAtUtcMs'] ?? $b['generatedAtUtcMs'] ?? 0);
        if ($tA !== $tB) {
            return $tA <=> $tB;
        }
        return ((int) ($a['seq'] ?? 0)) <=> ((int) ($b['seq'] ?? 0));
    });
    if (count($mergedEntries) > MAX_CLOUD_LEDGER_ENTRIES) {
        $mergedEntries = array_slice($mergedEntries, -MAX_CLOUD_LEDGER_ENTRIES);
    }

    $mergedEvents = array_values($eventsByHash);
    usort($mergedEvents, static function (array $a, array $b): int {
        $tA = (int) ($a['recordedAtUtcMs'] ?? 0);
        $tB = (int) ($b['recordedAtUtcMs'] ?? 0);
        if ($tA !== $tB) {
            return $tA <=> $tB;
        }
        return ((int) ($a['seq'] ?? 0)) <=> ((int) ($b['seq'] ?? 0));
    });
    if (count($mergedEvents) > MAX_CLOUD_LIFECYCLE_EVENTS) {
        $mergedEvents = array_slice($mergedEvents, -MAX_CLOUD_LIFECYCLE_EVENTS);
    }

    $savedInDb = false;
    $nowIso = gmdate('Y-m-d\TH:i:s\Z');

    if ($pdo !== null) {
        try {
            $eUpsert = $pdo->prepare("INSERT INTO prediction_ledger_entries
                (username, forecast_hash, prev_forecast_hash, seq, batch_id, symbol_code, timeframe, horizon_bars, model_id, anchor_open_time_utc_ms, recorded_at_utc_ms, entry_json, updated_at_utc)
                VALUES (:u, :fh, :pfh, :seq, :bid, :sym, :tf, :hb, :mid, :aot, :rec, :ej, :now)
                ON DUPLICATE KEY UPDATE
                    entry_json = VALUES(entry_json),
                    batch_id = VALUES(batch_id),
                    updated_at_utc = VALUES(updated_at_utc)");

            foreach ($mergedEntries as $item) {
                $eUpsert->execute([
                    ':u' => $username,
                    ':fh' => substr((string) ($item['forecastHash'] ?? ''), 0, 64),
                    ':pfh' => substr((string) ($item['prevForecastHash'] ?? ''), 0, 64),
                    ':seq' => (int) ($item['seq'] ?? 1),
                    ':bid' => substr((string) ($item['batchId'] ?? ''), 0, 96),
                    ':sym' => substr((string) ($item['symbolCode'] ?? 'XAUUSD'), 0, 32),
                    ':tf' => substr((string) ($item['timeframe'] ?? 'M15'), 0, 16),
                    ':hb' => (int) ($item['horizonBars'] ?? 30),
                    ':mid' => substr((string) ($item['modelId'] ?? 'AUTO'), 0, 64),
                    ':aot' => (int) ($item['anchorOpenTimeUtcMs'] ?? 0),
                    ':rec' => (int) ($item['recordedAtUtcMs'] ?? $item['generatedAtUtcMs'] ?? 0),
                    ':ej' => json_encode($item, JSON_UNESCAPED_UNICODE),
                    ':now' => gmdate('Y-m-d H:i:s'),
                ]);
            }

            $lUpsert = $pdo->prepare("INSERT INTO prediction_ledger_lifecycle
                (username, event_hash, prev_event_hash, forecast_hash, seq, symbol_code, timeframe, horizon_step, lifecycle_status, evaluation_outcome, recorded_at_utc_ms, event_json, updated_at_utc)
                VALUES (:u, :eh, :peh, :fh, :seq, :sym, :tf, :hs, :ls, :eo, :rec, :evj, :now)
                ON DUPLICATE KEY UPDATE
                    event_json = VALUES(event_json),
                    lifecycle_status = VALUES(lifecycle_status),
                    evaluation_outcome = VALUES(evaluation_outcome),
                    updated_at_utc = VALUES(updated_at_utc)");

            $auditLcUpsert = $pdo->prepare("INSERT IGNORE INTO prediction_lifecycle_events
                (event_uuid, run_uuid, forecast_hash, symbol_code, timeframe, horizon_step, lifecycle_status, evaluation_outcome, reason, observed_close, prev_event_hash, event_hash, recorded_at_utc_ms)
                VALUES (:eu, :ru, :fh, :sym, :tf, :hs, :ls, :eo, :rsn, :obs, :peh, :eh, :rec)");

            foreach ($mergedEvents as $ev) {
                $eHash = substr((string) ($ev['eventHash'] ?? ''), 0, 64);
                $fHash = substr((string) ($ev['forecastHash'] ?? ''), 0, 64);
                $pHash = substr((string) ($ev['prevEventHash'] ?? ''), 0, 64);
                $sym = substr((string) ($ev['symbolCode'] ?? 'XAUUSD'), 0, 32);
                $tf = substr((string) ($ev['timeframe'] ?? 'M15'), 0, 16);
                $hs = (int) ($ev['horizonStep'] ?? 0);
                $ls = substr((string) ($ev['lifecycleStatus'] ?? 'ACTIVE'), 0, 24);
                $eo = substr((string) ($ev['evaluationOutcome'] ?? 'PENDING'), 0, 24);
                $rec = (int) ($ev['recordedAtUtcMs'] ?? 0);

                $lUpsert->execute([
                    ':u' => $username,
                    ':eh' => $eHash,
                    ':peh' => $pHash,
                    ':fh' => $fHash,
                    ':seq' => (int) ($ev['seq'] ?? 1),
                    ':sym' => $sym,
                    ':tf' => $tf,
                    ':hs' => $hs,
                    ':ls' => $ls,
                    ':eo' => $eo,
                    ':rec' => $rec,
                    ':evj' => json_encode($ev, JSON_UNESCAPED_UNICODE),
                    ':now' => gmdate('Y-m-d H:i:s'),
                ]);

                $auditLcUpsert->execute([
                    ':eu' => substr($username . ':' . $eHash, 0, 64),
                    ':ru' => $fHash,
                    ':fh' => $fHash,
                    ':sym' => $sym,
                    ':tf' => $tf,
                    ':hs' => $hs,
                    ':ls' => $ls,
                    ':eo' => $eo,
                    ':rsn' => substr((string) ($ev['reason'] ?? ''), 0, 255),
                    ':obs' => isset($ev['observedClose']) && is_numeric($ev['observedClose']) ? (float) $ev['observedClose'] : null,
                    ':peh' => $pHash,
                    ':eh' => $eHash,
                    ':rec' => $rec,
                ]);
            }

            $savedInDb = true;
        } catch (\Throwable) {}
    }

    $dir = dirname($ledgerFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $allFileData = is_file($ledgerFile) ? (json_decode((string) @file_get_contents($ledgerFile), true) ?? []) : [];
    if (!is_array($allFileData)) {
        $allFileData = [];
    }
    $allFileData[$username] = [
        'username' => $username,
        'entries' => $mergedEntries,
        'lifecycle_events' => $mergedEvents,
        'updated_at_utc' => $nowIso,
    ];
    @file_put_contents($ledgerFile, json_encode($allFileData, JSON_UNESCAPED_UNICODE), LOCK_EX);

    ApiEnvelope::sendSuccess([
        'synced' => true,
        'saved_in_database' => $savedInDb,
        'username' => $username,
        'entries' => $mergedEntries,
        'lifecycle_events' => $mergedEvents,
        'entry_count' => count($mergedEntries),
        'lifecycle_count' => count($mergedEvents),
        'updated_at_utc' => $nowIso,
    ], 'status_forecast_ledger_synced');
}

ApiEnvelope::sendError('METHOD_NOT_ALLOWED', 'error_invalid_parameters', 405);
