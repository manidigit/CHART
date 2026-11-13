<?php
declare(strict_types=1);

require_once __DIR__ . '/core/ApiEnvelope.php';
require_once __DIR__ . '/core/Database.php';

use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ApiEnvelope::sendCorsAndSecurityHeaders('POST, OPTIONS');
    exit;
}

ApiEnvelope::sendCorsAndSecurityHeaders('POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

if (strtoupper($_SERVER['REQUEST_METHOD']) !== 'POST') {
    ApiEnvelope::sendError('METHOD_NOT_ALLOWED', 'error_invalid_parameters', 405);
}

$rawBody = file_get_contents('php://input');
$payload = is_string($rawBody) && $rawBody !== '' ? (json_decode($rawBody, true) ?? []) : [];
$action = strtolower(trim((string) ($_GET['action'] ?? ($payload['action'] ?? 'export'))));

$token = trim((string) ($payload['session_token'] ?? ($_GET['token'] ?? '')));
if ($token === '') {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
        $token = $matches[1];
    }
}

$pdo = Database::getPdo();
$sessionsFile = dirname(__DIR__, 2) . '/config/sessions.local.json';
$workspaceFile = dirname(__DIR__, 2) . '/config/workspace.local.json';
$ownerFile = dirname(__DIR__, 2) . '/config/owner.local.json';

// Verify authenticated session whenever an owner account exists
$username = null;
$nowUtc = gmdate('Y-m-d H:i:s');
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

$passphrase = (string) ($payload['passphrase'] ?? '');
if (strlen($passphrase) < 8) {
    ApiEnvelope::sendError('WEAK_PASSPHRASE', 'error_backup_passphrase_short', 400);
}

if (!function_exists('openssl_encrypt') || !function_exists('openssl_decrypt')) {
    ApiEnvelope::sendError('CRYPTO_UNAVAILABLE', 'error_backup_crypto_unavailable', 500);
}

function ci_derive_backup_key(string $passphrase, string $saltBin, int $iterations = 100000): string
{
    return hash_pbkdf2('sha256', $passphrase, $saltBin, $iterations, 32, true);
}

function ci_strip_byok_from_ws(array $ws): array
{
    $secretKeys = ['twelveDataApiKey', 'stooqApiKey', 'alphaVantageApiKey', 'finnhubApiKey'];
    if (isset($ws['preferences']) && is_array($ws['preferences'])) {
        foreach ($secretKeys as $k) {
            unset($ws['preferences'][$k]);
        }
    }
    foreach ($secretKeys as $k) {
        unset($ws[$k]);
    }
    return $ws;
}

if ($action === 'export') {
    $workspace = null;
    if ($pdo !== null) {
        try {
            $stmt = $pdo->prepare("SELECT workspace_json FROM user_workspace WHERE username = :u LIMIT 1");
            $stmt->execute([':u' => $username]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && !empty($row['workspace_json'])) {
                $decoded = json_decode((string) $row['workspace_json'], true);
                if (is_array($decoded)) {
                    $workspace = $decoded;
                }
            }
        } catch (\Throwable) {}
    }
    if ($workspace === null && is_file($workspaceFile)) {
        $fb = json_decode((string) @file_get_contents($workspaceFile), true);
        if (is_array($fb)) {
            $workspace = $fb['workspace'] ?? $fb;
        }
    }
    if (!is_array($workspace)) {
        $workspace = [];
    }
    $workspace = ci_strip_byok_from_ws($workspace);

    $qualityReports = [];
    if ($pdo !== null) {
        try {
            $qStmt = $pdo->query("SELECT chart_id, provider_id, timeframe, gaps_found, missing_bars_total, status, checked_at_utc FROM data_quality_reports ORDER BY checked_at_utc DESC LIMIT 100");
            if ($qStmt) {
                $qualityReports = $qStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
            }
        } catch (\Throwable) {}
    }

    $ownerMeta = ['username' => $username];
    if ($pdo !== null) {
        try {
            $oStmt = $pdo->prepare("SELECT username, email, role FROM users WHERE username = :u LIMIT 1");
            $oStmt->execute([':u' => $username]);
            $oRow = $oStmt->fetch(PDO::FETCH_ASSOC);
            if (is_array($oRow)) {
                $ownerMeta['email'] = (string) ($oRow['email'] ?? '');
                $ownerMeta['role'] = (string) ($oRow['role'] ?? 'owner');
            }
        } catch (\Throwable) {}
    }

    $snapshot = [
        'format' => 'ci_encrypted_backup_v1',
        'exported_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'owner' => $ownerMeta,
        'workspace' => $workspace,
        'quality_reports' => $qualityReports,
    ];
    $plaintext = json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($plaintext === false) {
        ApiEnvelope::sendError('ENCODE_FAILED', 'error_invalid_parameters', 500);
    }

    $checksum = hash('sha256', $plaintext);
    $salt = random_bytes(16);
    $iv = random_bytes(12);
    $iterations = 100000;
    $key = ci_derive_backup_key($passphrase, $salt, $iterations);
    $tag = '';
    $ciphertext = openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
    if ($ciphertext === false || strlen($tag) !== 16) {
        ApiEnvelope::sendError('ENCRYPT_FAILED', 'error_backup_crypto_unavailable', 500);
    }

    ApiEnvelope::sendSuccess([
        'format' => 'ci_encrypted_backup_v1',
        'cipher' => 'AES-256-GCM',
        'kdf' => 'PBKDF2-HMAC-SHA256',
        'iterations' => $iterations,
        'salt_b64' => base64_encode($salt),
        'iv_b64' => base64_encode($iv),
        'tag_b64' => base64_encode($tag),
        'checksum_sha256' => $checksum,
        'ciphertext_b64' => base64_encode($ciphertext),
        'exported_at_utc' => $snapshot['exported_at_utc'],
        'owner' => $username,
    ], 'status_backup_exported');
}

if ($action === 'restore') {
    $backup = $payload['backup'] ?? null;
    if (!is_array($backup)) {
        ApiEnvelope::sendError('INVALID_BACKUP', 'error_backup_invalid_format', 400);
    }
    if (($backup['format'] ?? '') !== 'ci_encrypted_backup_v1') {
        ApiEnvelope::sendError('UNSUPPORTED_BACKUP_FORMAT', 'error_backup_invalid_format', 400);
    }
    $iterations = max(10000, min(500000, (int) ($backup['iterations'] ?? 100000)));
    $salt = base64_decode((string) ($backup['salt_b64'] ?? ''), true);
    $iv = base64_decode((string) ($backup['iv_b64'] ?? ''), true);
    $tag = base64_decode((string) ($backup['tag_b64'] ?? ''), true);
    $ciphertext = base64_decode((string) ($backup['ciphertext_b64'] ?? ''), true);
    $expectedChecksum = strtolower(trim((string) ($backup['checksum_sha256'] ?? '')));

    if ($salt === false || $iv === false || $tag === false || $ciphertext === false || strlen($iv) !== 12 || strlen($tag) !== 16) {
        ApiEnvelope::sendError('INVALID_BACKUP_CRYPTO', 'error_backup_invalid_format', 400);
    }

    $key = ci_derive_backup_key($passphrase, $salt, $iterations);
    $plaintext = openssl_decrypt($ciphertext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($plaintext === false) {
        ApiEnvelope::sendError('DECRYPT_FAILED', 'error_backup_wrong_passphrase', 403);
    }

    if ($expectedChecksum !== '' && !hash_equals($expectedChecksum, hash('sha256', $plaintext))) {
        ApiEnvelope::sendError('CHECKSUM_MISMATCH', 'error_backup_checksum_mismatch', 400);
    }

    $snapshot = json_decode($plaintext, true);
    if (!is_array($snapshot) || ($snapshot['format'] ?? '') !== 'ci_encrypted_backup_v1' || !isset($snapshot['workspace']) || !is_array($snapshot['workspace'])) {
        ApiEnvelope::sendError('CORRUPT_BACKUP_SCHEMA', 'error_backup_invalid_format', 400);
    }

    $workspaceData = ci_strip_byok_from_ws($snapshot['workspace']);
    $workspaceJson = json_encode($workspaceData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($workspaceJson === false) {
        ApiEnvelope::sendError('ENCODE_FAILED', 'error_invalid_parameters', 500);
    }

    $savedInDb = false;
    if ($pdo !== null) {
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("INSERT INTO user_workspace (username, workspace_json, updated_at_utc)
                VALUES (:u, :w, :now)
                ON DUPLICATE KEY UPDATE workspace_json = VALUES(workspace_json), updated_at_utc = VALUES(updated_at_utc)");
            $stmt->execute([
                ':u' => $username,
                ':w' => $workspaceJson,
                ':now' => gmdate('Y-m-d H:i:s'),
            ]);
            $pdo->commit();
            $savedInDb = true;
        } catch (\Throwable) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
        }
    }

    $dir = dirname($workspaceFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $nowIso = gmdate('Y-m-d\TH:i:s\Z');
    @file_put_contents($workspaceFile, json_encode([
        'username' => $username,
        'workspace' => $workspaceData,
        'updated_at_utc' => $nowIso,
    ], JSON_UNESCAPED_UNICODE), LOCK_EX);

    ApiEnvelope::sendSuccess([
        'restored' => true,
        'saved_in_database' => $savedInDb,
        'username' => $username,
        'exported_at_utc' => (string) ($snapshot['exported_at_utc'] ?? ''),
        'restored_at_utc' => $nowIso,
        'workspace' => $workspaceData,
    ], 'status_backup_restored');
}

ApiEnvelope::sendError('INVALID_ACTION', 'error_invalid_parameters', 400);
