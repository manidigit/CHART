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

$rawBody = file_get_contents('php://input');
$payload = is_string($rawBody) && $rawBody !== '' ? (json_decode($rawBody, true) ?? []) : [];

$token = trim((string) ($payload['session_token'] ?? ($_GET['token'] ?? '')));
if ($token === '') {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
        $token = $matches[1];
    }
}

$pdo = Database::getPdo();
$sessionsFile = dirname(__DIR__, 2) . '/config/sessions.local.json';
$ownerFile = dirname(__DIR__, 2) . '/config/owner.local.json';

$username = null;
if ($token !== '') {
    if ($pdo !== null) {
        try {
            $stmt = $pdo->prepare("SELECT username FROM user_sessions WHERE token = :t AND expires_at_utc > :now LIMIT 1");
            $stmt->execute([':t' => $token, ':now' => gmdate('Y-m-d H:i:s')]);
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
    ApiEnvelope::sendError('OWNER_REQUIRED', 'error_unauthorized', 401);
}

$docroot = dirname(__DIR__, 2);
$backupRoot = dirname($docroot) . '/_ci_backups';
if (!is_dir($backupRoot)) {
    ApiEnvelope::sendSuccess(['snapshots' => [], 'rolled_back' => false], 'status_no_snapshots');
}

$dirs = glob($backupRoot . '/snapshot_*', GLOB_ONLYDIR) ?: [];
rsort($dirs, SORT_STRING);
$snapshotNames = array_map('basename', $dirs);

if (strtoupper($_SERVER['REQUEST_METHOD']) === 'GET') {
    ApiEnvelope::sendSuccess([
        'snapshots' => $snapshotNames,
        'latest' => $snapshotNames[0] ?? null,
    ], 'status_snapshots_listed');
}

if (strtoupper($_SERVER['REQUEST_METHOD']) !== 'POST') {
    ApiEnvelope::sendError('METHOD_NOT_ALLOWED', 'error_invalid_parameters', 405);
}

$requested = preg_replace('/[^A-Za-z0-9._-]/', '', (string) ($payload['snapshot'] ?? ''));
$targetSnapDir = $requested !== '' ? ($backupRoot . '/' . $requested) : ($dirs[0] ?? '');
if ($targetSnapDir === '' || !is_dir($targetSnapDir)) {
    ApiEnvelope::sendError('SNAPSHOT_NOT_FOUND', 'error_invalid_parameters', 404);
}

function ci_copy_dir_recursive(string $src, string $dst): int
{
    $count = 0;
    if (!is_dir($src)) {
        return 0;
    }
    if (!is_dir($dst)) {
        @mkdir($dst, 0755, true);
    }
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($src, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($it as $item) {
        $rel = substr($item->getPathname(), strlen($src) + 1);
        $destPath = $dst . '/' . $rel;
        if ($item->isDir()) {
            if (!is_dir($destPath)) {
                @mkdir($destPath, 0755, true);
            }
        } else {
            @copy($item->getPathname(), $destPath);
            $count++;
        }
    }
    return $count;
}

$restoredFiles = 0;
foreach (['api', 'assets', 'i18n', 'migrations'] as $sub) {
    if (is_dir($targetSnapDir . '/' . $sub)) {
        $restoredFiles += ci_copy_dir_recursive($targetSnapDir . '/' . $sub, $docroot . '/' . $sub);
    }
}
if (is_file($targetSnapDir . '/index.html')) {
    @copy($targetSnapDir . '/index.html', $docroot . '/index.html');
    $restoredFiles++;
}

ApiEnvelope::sendSuccess([
    'rolled_back' => true,
    'snapshot' => basename($targetSnapDir),
    'restored_files' => $restoredFiles,
    'restored_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
], 'status_rollback_complete');
