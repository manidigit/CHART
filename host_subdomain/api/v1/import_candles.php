<?php
declare(strict_types=1);

require_once __DIR__ . '/core/ApiEnvelope.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/algorithms/UtcTimeAnchor.php';
require_once __DIR__ . '/algorithms/CandleValidator.php';
require_once __DIR__ . '/providers/ProviderCatalog.php';
require_once __DIR__ . '/providers/LocalCsvAdapter.php';

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;
use ChartIntelligence\Providers\LocalCsvAdapter;
use ChartIntelligence\Providers\ProviderCatalog;

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ApiEnvelope::sendCorsAndSecurityHeaders('GET, POST, OPTIONS');
    exit;
}

ApiEnvelope::sendCorsAndSecurityHeaders('GET, POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

$pdo = Database::getPdo();
$sessionsFile = dirname(__DIR__, 2) . '/config/sessions.local.json';
$ownerFile = dirname(__DIR__, 2) . '/config/owner.local.json';
$batchesFallbackFile = dirname(__DIR__, 2) . '/config/import_batches.local.json';

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$rawBody = $method === 'POST' ? file_get_contents('php://input') : '';
$payload = is_string($rawBody) && $rawBody !== '' ? (json_decode($rawBody, true) ?? []) : [];

$token = trim((string) ($_POST['session_token'] ?? ($payload['session_token'] ?? ($_GET['token'] ?? ''))));
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
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && !empty($row['username'])) {
                $username = (string) $row['username'];
            }
        } catch (\Throwable) {}
    }
    if ($username === null && is_file($sessionsFile)) {
        $sData = json_decode((string) @file_get_contents($sessionsFile), true);
        if (is_array($sData) && isset($sData[$token]) && (int) ($sData[$token]['expires_ts'] ?? 0) > time()) {
            $username = (string) ($sData[$token]['username'] ?? '');
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
if (!$ownerRegistered && is_file($ownerFile)) {
    $ownerData = json_decode((string) @file_get_contents($ownerFile), true);
    if (is_array($ownerData) && !empty($ownerData['username'])) {
        $ownerRegistered = true;
    }
}

if ($username === null || $username === '') {
    if ($ownerRegistered) {
        ApiEnvelope::sendError('UNAUTHORIZED', 'error_unauthorized', 401);
    }
    $username = 'owner';
}

// GET ?action=batches: Return recent historical import lineage batches
if ($method === 'GET') {
    $limit = max(1, min(100, (int) ($_GET['limit'] ?? 30)));
    $batches = [];
    if ($pdo !== null) {
        try {
            $stmt = $pdo->prepare("SELECT id, chart_id, symbol_code, provider_id, timeframe, source_type, file_name, file_sha256, quality_status, rows_total, rows_inserted, rows_corrected, rows_skipped, imported_by, notes, imported_at_utc FROM data_import_batches ORDER BY id DESC LIMIT :lim");
            $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
            $stmt->execute();
            $batches = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable) {}
    }
    if (empty($batches) && is_file($batchesFallbackFile)) {
        $fb = json_decode((string) @file_get_contents($batchesFallbackFile), true);
        if (is_array($fb)) {
            $batches = array_slice($fb, 0, $limit);
        }
    }
    ApiEnvelope::sendSuccess([
        'batches' => $batches,
        'count' => count($batches),
    ]);
}

if ($method !== 'POST') {
    ApiEnvelope::sendError('METHOD_NOT_ALLOWED', 'error_invalid_parameters', 405);
}

$action = strtolower(trim((string) ($_GET['action'] ?? ($payload['action'] ?? 'import'))));
$symbol = strtoupper(preg_replace('/[^A-Za-z0-9._:-]/', '', (string) ($payload['symbol'] ?? ($_POST['symbol'] ?? 'SPOTBRENT'))));
$provider = strtolower(preg_replace('/[^a-z0-9_]/', '', (string) ($payload['provider'] ?? ($_POST['provider'] ?? 'local_csv'))));
$timeframe = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) ($payload['timeframe'] ?? ($_POST['timeframe'] ?? 'D1'))));
$qualityStatus = strtoupper(preg_replace('/[^A-Za-z0-9_]/', '', (string) ($payload['quality_status'] ?? ($_POST['quality_status'] ?? 'OFFICIAL'))));
$notes = substr(trim((string) ($payload['notes'] ?? ($_POST['notes'] ?? ''))), 0, 250);
$fileName = substr(trim((string) ($payload['file_name'] ?? ($_FILES['file']['name'] ?? 'upload.csv'))), 0, 180);
$mimeType = trim((string) ($payload['mime_type'] ?? ($_FILES['file']['type'] ?? '')));

if ($symbol === '') {
    ApiEnvelope::sendError('INVALID_SYMBOL', 'error_invalid_parameters', 400);
}
if (!in_array($timeframe, ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'], true)) {
    $timeframe = 'D1';
}
if (!in_array($provider, ['tvdatafeed', 'biquote', 'twelve_data', 'dukascopy', 'yahoo_finance', 'stooq', 'eia_brent_spot', 'local_csv'], true)) {
    $provider = 'local_csv';
}
if (!in_array($qualityStatus, ['OFFICIAL', 'VERIFIED', 'CORRECTED', 'UNVERIFIED'], true)) {
    $qualityStatus = 'OFFICIAL';
}

$candlesToPersist = [];
$sourceType = 'CSV_UPLOAD';
$rowsTotal = 0;
$rowsSkipped = 0;
$forcedDailyOnly = false;
$sha256 = '';

if ($action === 'manual' || (isset($payload['manual_candles']) && is_array($payload['manual_candles']))) {
    $sourceType = 'MANUAL_OHLC';
    $manualList = $payload['manual_candles'] ?? [];
    if (!is_array($manualList) || empty($manualList)) {
        ApiEnvelope::sendError('EMPTY_MANUAL_ROWS', 'error_invalid_parameters', 400);
    }
    $rowsTotal = count($manualList);
    $sha256 = hash('sha256', (string) json_encode($manualList, JSON_UNESCAPED_SLASHES));
    $fileName = $fileName !== '' ? $fileName : 'manual_ohlc_entry';
    foreach ($manualList as $row) {
        if (!is_array($row)) {
            $rowsSkipped++;
            continue;
        }
        $openMs = LocalCsvAdapter::parseTimestampMs($row['open_time_utc_ms'] ?? $row['time'] ?? $row['date'] ?? null);
        $o = is_numeric($row['open'] ?? null) ? (float) $row['open'] : null;
        $h = is_numeric($row['high'] ?? null) ? (float) $row['high'] : null;
        $l = is_numeric($row['low'] ?? null) ? (float) $row['low'] : null;
        $c = is_numeric($row['close'] ?? null) ? (float) $row['close'] : null;
        $v = is_numeric($row['volume'] ?? null) ? (float) $row['volume'] : 0.0;
        if ($openMs === null || $c === null) {
            $rowsSkipped++;
            continue;
        }
        $o = $o ?? $c;
        $h = $h ?? max($o, $c);
        $l = $l ?? min($o, $c);
        $san = CandleValidator::sanitizeCandle($openMs, $timeframe, $o, $h, $l, $c, max(0.0, $v));
        if ($san !== null) {
            $candlesToPersist[$san['open_time_utc_ms']] = $san;
        } else {
            $rowsSkipped++;
        }
    }
    ksort($candlesToPersist);
    $candlesToPersist = array_values($candlesToPersist);
} else {
    $rawBytes = '';
    if (isset($_FILES['file']) && is_array($_FILES['file']) && !empty($_FILES['file']['tmp_name']) && is_uploaded_file($_FILES['file']['tmp_name'])) {
        $rawBytes = (string) file_get_contents($_FILES['file']['tmp_name']);
    } elseif (!empty($payload['file_base64']) && is_string($payload['file_base64'])) {
        $decoded = base64_decode($payload['file_base64'], true);
        if ($decoded === false) {
            ApiEnvelope::sendError('INVALID_BASE64', 'error_invalid_parameters', 400);
        }
        $rawBytes = $decoded;
    } elseif (!empty($payload['raw_text']) && is_string($payload['raw_text'])) {
        $rawBytes = $payload['raw_text'];
    }

    if (LocalCsvAdapter::isImagePayload($rawBytes, $fileName, $mimeType)) {
        ApiEnvelope::sendError('ERR_IMAGE_UPLOAD_FORBIDDEN', 'error_image_upload_forbidden', 400);
    }
    if ($rawBytes === '') {
        ApiEnvelope::sendError('EMPTY_IMPORT_FILE', 'error_invalid_parameters', 400);
    }

    $sha256 = hash('sha256', $rawBytes);
    $parsed = LocalCsvAdapter::parseHistoricalBytes($rawBytes, $fileName, $timeframe, $symbol);
    if (!$parsed['ok']) {
        $errCode = (string) ($parsed['error_code'] ?? 'PARSE_FAILED');
        $errKey = $errCode === 'ERR_IMAGE_UPLOAD_FORBIDDEN' ? 'error_image_upload_forbidden' : 'error_import_parse_failed';
        ApiEnvelope::sendError($errCode, $errKey, 400);
    }

    $sourceType = (string) $parsed['detected_format'];
    $forcedDailyOnly = (bool) $parsed['forced_daily_only'];
    $timeframe = (string) $parsed['effective_timeframe'];
    $rowsTotal = (int) $parsed['rows_total'];
    $rowsSkipped = (int) $parsed['rows_skipped'];
    $candlesToPersist = $parsed['candles'];
}

if (empty($candlesToPersist)) {
    ApiEnvelope::sendError('NO_VALID_CANDLES', 'error_import_parse_failed', 400);
}

$chartId = ProviderCatalog::resolveChartId($symbol);
$rowsInserted = 0;
$rowsCorrected = 0;
$batchId = 0;
$importedAtIso = gmdate('Y-m-d\TH:i:s\Z');

if ($pdo !== null) {
    try {
        $pdo->beginTransaction();

        // Create import batch record first to obtain batch_id for lineage/corrections
        $bStmt = $pdo->prepare(
            "INSERT INTO data_import_batches
                (chart_id, symbol_code, provider_id, timeframe, source_type, file_name, file_sha256, quality_status, rows_total, rows_inserted, rows_corrected, rows_skipped, imported_by, notes)
             VALUES
                (:cid, :sym, :prov, :tf, :stype, :fname, :sha, :qstat, :rtot, 0, 0, :rskip, :iby, :notes)"
        );
        $bStmt->execute([
            ':cid' => $chartId,
            ':sym' => $symbol,
            ':prov' => $provider,
            ':tf' => $timeframe,
            ':stype' => $sourceType,
            ':fname' => $fileName,
            ':sha' => $sha256,
            ':qstat' => $qualityStatus,
            ':rtot' => $rowsTotal,
            ':rskip' => $rowsSkipped,
            ':iby' => $username,
            ':notes' => $notes !== '' ? $notes : null,
        ]);
        $batchId = (int) $pdo->lastInsertId();

        $selExisting = $pdo->prepare(
            "SELECT open_price, high_price, low_price, close_price, volume
             FROM candles
             WHERE chart_id = :cid AND provider_id = :prov AND timeframe = :tf AND open_time_utc = :open_ms
             LIMIT 1"
        );
        $insCorr = $pdo->prepare(
            "INSERT INTO data_corrections
                (batch_id, chart_id, provider_id, timeframe, open_time_utc, old_open, old_high, old_low, old_close, old_volume, new_open, new_high, new_low, new_close, new_volume, correction_reason)
             VALUES
                (:bid, :cid, :prov, :tf, :open_ms, :oo, :oh, :ol, :oc, :ov, :no, :nh, :nl, :nc, :nv, :reason)"
        );
        $upsert = $pdo->prepare(
            "INSERT INTO candles
                (chart_id, provider_id, timeframe, open_time_utc, open_price, high_price, low_price, close_price, volume, is_closed)
             VALUES
                (:cid, :prov, :tf, :open_ms, :o, :h, :l, :c, :v, 1)
             ON DUPLICATE KEY UPDATE
                open_price = VALUES(open_price),
                high_price = VALUES(high_price),
                low_price = VALUES(low_price),
                close_price = VALUES(close_price),
                volume = VALUES(volume),
                fetched_at_utc = CURRENT_TIMESTAMP"
        );

        foreach ($candlesToPersist as $bar) {
            $openMs = (int) $bar['open_time_utc_ms'];
            $selExisting->execute([
                ':cid' => $chartId,
                ':prov' => $provider,
                ':tf' => $timeframe,
                ':open_ms' => $openMs,
            ]);
            $prevRow = $selExisting->fetch(PDO::FETCH_ASSOC);
            if (is_array($prevRow)) {
                $changed = abs((float) $prevRow['open_price'] - (float) $bar['open']) > 1e-8
                    || abs((float) $prevRow['high_price'] - (float) $bar['high']) > 1e-8
                    || abs((float) $prevRow['low_price'] - (float) $bar['low']) > 1e-8
                    || abs((float) $prevRow['close_price'] - (float) $bar['close']) > 1e-8
                    || abs((float) $prevRow['volume'] - (float) $bar['volume']) > 1e-8;
                if ($changed) {
                    $rowsCorrected++;
                    $insCorr->execute([
                        ':bid' => $batchId,
                        ':cid' => $chartId,
                        ':prov' => $provider,
                        ':tf' => $timeframe,
                        ':open_ms' => $openMs,
                        ':oo' => $prevRow['open_price'],
                        ':oh' => $prevRow['high_price'],
                        ':ol' => $prevRow['low_price'],
                        ':oc' => $prevRow['close_price'],
                        ':ov' => $prevRow['volume'],
                        ':no' => $bar['open'],
                        ':nh' => $bar['high'],
                        ':nl' => $bar['low'],
                        ':nc' => $bar['close'],
                        ':nv' => $bar['volume'],
                        ':reason' => $sourceType === 'MANUAL_OHLC' ? 'MANUAL_CORRECTION' : 'IMPORT_OVERWRITE',
                    ]);
                }
            } else {
                $rowsInserted++;
            }

            $upsert->execute([
                ':cid' => $chartId,
                ':prov' => $provider,
                ':tf' => $timeframe,
                ':open_ms' => $openMs,
                ':o' => $bar['open'],
                ':h' => $bar['high'],
                ':l' => $bar['low'],
                ':c' => $bar['close'],
                ':v' => $bar['volume'],
            ]);
        }

        $updBatch = $pdo->prepare(
            "UPDATE data_import_batches
             SET rows_inserted = :ri, rows_corrected = :rc
             WHERE id = :bid"
        );
        $updBatch->execute([
            ':ri' => $rowsInserted,
            ':rc' => $rowsCorrected,
            ':bid' => $batchId,
        ]);

        $aStmt = $pdo->prepare(
            "INSERT INTO audit_logs (actor_username, event_type, entity_type, entity_id, details_json)
             VALUES (:u, 'HISTORICAL_IMPORT', 'candles', :eid, :details)"
        );
        $aStmt->execute([
            ':u' => $username,
            ':eid' => $symbol . '_' . $provider . '_' . $timeframe,
            ':details' => json_encode([
                'batch_id' => $batchId,
                'source_type' => $sourceType,
                'file_name' => $fileName,
                'file_sha256' => $sha256,
                'rows_inserted' => $rowsInserted,
                'rows_corrected' => $rowsCorrected,
                'rows_skipped' => $rowsSkipped,
                'forced_daily_only' => $forcedDailyOnly,
            ], JSON_UNESCAPED_SLASHES),
        ]);

        $pdo->commit();
    } catch (\Throwable) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        $rowsInserted = count($candlesToPersist);
    }
} else {
    $rowsInserted = count($candlesToPersist);
}

$batchRecord = [
    'id' => $batchId > 0 ? $batchId : (int) round(microtime(true) * 1000),
    'chart_id' => $chartId,
    'symbol_code' => $symbol,
    'provider_id' => $provider,
    'timeframe' => $timeframe,
    'source_type' => $sourceType,
    'file_name' => $fileName,
    'file_sha256' => $sha256,
    'quality_status' => $qualityStatus,
    'rows_total' => $rowsTotal,
    'rows_inserted' => $rowsInserted,
    'rows_corrected' => $rowsCorrected,
    'rows_skipped' => $rowsSkipped,
    'imported_by' => $username,
    'notes' => $notes,
    'imported_at_utc' => $importedAtIso,
];

// Always mirror recent batch history to config/import_batches.local.json when DB is offline
if ($pdo === null) {
    $dir = dirname($batchesFallbackFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $existingBatches = is_file($batchesFallbackFile) ? (json_decode((string) @file_get_contents($batchesFallbackFile), true) ?: []) : [];
    if (!is_array($existingBatches)) {
        $existingBatches = [];
    }
    array_unshift($existingBatches, $batchRecord);
    @file_put_contents($batchesFallbackFile, json_encode(array_slice($existingBatches, 0, 100), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

ApiEnvelope::sendSuccess([
    'batch' => $batchRecord,
    'forced_daily_only' => $forcedDailyOnly,
    'effective_timeframe' => $timeframe,
    'candles_count' => count($candlesToPersist),
    'candles' => array_slice($candlesToPersist, -5000),
], 'status_import_completed');
