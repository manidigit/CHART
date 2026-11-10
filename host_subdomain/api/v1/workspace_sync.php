<?php
declare(strict_types=1);

require_once __DIR__ . '/core/ApiEnvelope.php';
require_once __DIR__ . '/core/Database.php';

use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$pdo = Database::getPdo();
$sessionsFile = dirname(__DIR__, 2) . '/config/sessions.local.json';
$workspaceFile = dirname(__DIR__, 2) . '/config/workspace.local.json';

// Ensure user_workspace table exists in MariaDB
if ($pdo !== null) {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS user_workspace (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(64) NOT NULL UNIQUE,
            workspace_json MEDIUMTEXT NOT NULL,
            updated_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_ws_user (username)
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

// Authenticate user session
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

// If no valid session token provided, check if fallback owner exists for single-tenant local operation
if ($username === null || $username === '') {
    $ownerFile = dirname(__DIR__, 2) . '/config/owner.local.json';
    if (is_file($ownerFile)) {
        $ownerData = json_decode((string) file_get_contents($ownerFile), true);
        if (is_array($ownerData) && !empty($ownerData['username'])) {
            $username = (string) $ownerData['username'];
        }
    }
}

if ($username === null || $username === '') {
    $username = 'owner';
}

$method = strtoupper($_SERVER['REQUEST_METHOD']);

if ($method === 'GET') {
    $workspace = null;
    $updatedAt = null;

    if ($pdo !== null) {
        try {
            $stmt = $pdo->prepare("SELECT workspace_json, updated_at_utc FROM user_workspace WHERE username = :u LIMIT 1");
            $stmt->execute([':u' => $username]);
            $row = $stmt->fetch();
            if ($row && !empty($row['workspace_json'])) {
                $workspace = json_decode((string) $row['workspace_json'], true);
                $updatedAt = (string) ($row['updated_at_utc'] ?? '');
            }
        } catch (\Throwable) {}
    }

    if ($workspace === null && is_file($workspaceFile)) {
        $fbData = json_decode((string) file_get_contents($workspaceFile), true);
        if (is_array($fbData)) {
            $workspace = $fbData['workspace'] ?? $fbData;
            $updatedAt = $fbData['updated_at_utc'] ?? gmdate('Y-m-d\TH:i:s\Z');
        }
    }

    ApiEnvelope::sendSuccess([
        'username' => $username,
        'has_saved_workspace' => ($workspace !== null),
        'workspace' => $workspace,
        'updated_at_utc' => $updatedAt ?: gmdate('Y-m-d\TH:i:s\Z'),
    ], 'status_workspace_loaded');
}

if ($method === 'POST') {
    $workspaceData = $payload['workspace'] ?? $payload;
    if (!is_array($workspaceData) || empty($workspaceData)) {
        ApiEnvelope::sendError('EMPTY_WORKSPACE', 'error_invalid_parameters', 400);
    }

    $workspaceJson = json_encode($workspaceData, JSON_UNESCAPED_UNICODE);
    $nowIso = gmdate('Y-m-d\TH:i:s\Z');
    $savedInDb = false;

    if ($pdo !== null) {
        try {
            $stmt = $pdo->prepare("INSERT INTO user_workspace (username, workspace_json, updated_at_utc)
                VALUES (:u, :w, :now)
                ON DUPLICATE KEY UPDATE workspace_json = VALUES(workspace_json), updated_at_utc = VALUES(updated_at_utc)");
            $stmt->execute([
                ':u' => $username,
                ':w' => $workspaceJson,
                ':now' => gmdate('Y-m-d H:i:s'),
            ]);
            $savedInDb = true;
        } catch (\Throwable) {}
    }

    $dir = dirname($workspaceFile);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    @file_put_contents($workspaceFile, json_encode([
        'username' => $username,
        'workspace' => $workspaceData,
        'updated_at_utc' => $nowIso,
    ], JSON_UNESCAPED_UNICODE));

    ApiEnvelope::sendSuccess([
        'synced' => true,
        'saved_in_database' => $savedInDb,
        'username' => $username,
        'updated_at_utc' => $nowIso,
    ], 'status_workspace_synced');
}

ApiEnvelope::sendError('METHOD_NOT_ALLOWED', 'error_invalid_parameters', 405);
