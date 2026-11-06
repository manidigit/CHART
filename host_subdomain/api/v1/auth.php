<?php
declare(strict_types=1);

require_once __DIR__ . '/core/ApiEnvelope.php';
require_once __DIR__ . '/core/Database.php';

use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    exit;
}

$rawBody = file_get_contents('php://input');
$payload = is_string($rawBody) && $rawBody !== '' ? (json_decode($rawBody, true) ?? []) : [];
$action = $_GET['action'] ?? ($payload['action'] ?? 'status');

$pdo = Database::getPdo();
$fallbackFile = dirname(__DIR__, 2) . '/config/owner.local.json';

function loadFallbackOwner(string $file): ?array
{
    if (!is_file($file)) {
        return null;
    }
    $data = json_decode((string) file_get_contents($file), true);
    return is_array($data) && !empty($data['username']) ? $data : null;
}

function saveFallbackOwner(string $file, string $username, string $passwordHash): void
{
    $dir = dirname($file);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @file_put_contents($file, json_encode([
        'username' => $username,
        'password_hash' => $passwordHash,
        'updated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ], JSON_UNESCAPED_UNICODE));
}

if ($action === 'status') {
    if ($pdo !== null) {
        $stmt = $pdo->query("SELECT username FROM users WHERE role = 'owner' LIMIT 1");
        $row = $stmt ? $stmt->fetch() : false;
        if ($row && !empty($row['username'])) {
            ApiEnvelope::sendSuccess([
                'is_owner_registered' => true,
                'owner_username' => $row['username'],
            ]);
        }
    }
    $fb = loadFallbackOwner($fallbackFile);
    ApiEnvelope::sendSuccess([
        'is_owner_registered' => $fb !== null,
        'owner_username' => $fb['username'] ?? '',
    ]);
}

if ($action === 'register_owner') {
    $username = trim((string) ($payload['username'] ?? ''));
    $password = (string) ($payload['password'] ?? '');
    if ($username === '' || $password === '') {
        ApiEnvelope::sendError('EMPTY_CREDENTIALS', 'error_empty_credentials');
    }
    if (mb_strlen($password) < 4) {
        ApiEnvelope::sendError('PASSWORD_SHORT', 'error_password_short');
    }
    $hashAlgo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
    $hash = password_hash($password, $hashAlgo);

    if ($pdo !== null) {
        $stmt = $pdo->prepare(
            "INSERT INTO users (username, password_hash, role) VALUES (:u, :h, 'owner')
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)"
        );
        $stmt->execute([':u' => $username, ':h' => $hash]);
    }
    saveFallbackOwner($fallbackFile, $username, $hash);
    ApiEnvelope::sendSuccess([
        'is_owner_registered' => true,
        'owner_username' => $username,
    ]);
}

if ($action === 'login') {
    $username = trim((string) ($payload['username'] ?? ''));
    $password = (string) ($payload['password'] ?? '');
    if ($username === '' || $password === '') {
        ApiEnvelope::sendError('EMPTY_CREDENTIALS', 'error_empty_credentials');
    }

    if ($pdo !== null) {
        $stmt = $pdo->prepare("SELECT username, password_hash FROM users WHERE LOWER(username) = LOWER(:u) LIMIT 1");
        $stmt->execute([':u' => $username]);
        $row = $stmt->fetch();
        if ($row && password_verify($password, (string) $row['password_hash'])) {
            ApiEnvelope::sendSuccess([
                'authenticated' => true,
                'owner_username' => $row['username'],
            ]);
        }
    }

    $fb = loadFallbackOwner($fallbackFile);
    if ($fb !== null && strcasecmp($fb['username'], $username) === 0 && password_verify($password, (string) $fb['password_hash'])) {
        ApiEnvelope::sendSuccess([
            'authenticated' => true,
            'owner_username' => $fb['username'],
        ]);
    }

    ApiEnvelope::sendError('INVALID_CREDENTIALS', 'error_invalid_credentials', 401);
}

if ($action === 'change_password') {
    $newPassword = (string) ($payload['new_password'] ?? '');
    if (mb_strlen($newPassword) < 4) {
        ApiEnvelope::sendError('PASSWORD_SHORT', 'error_password_short');
    }
    $hashAlgo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
    $hash = password_hash($newPassword, $hashAlgo);

    if ($pdo !== null) {
        $stmt = $pdo->prepare("UPDATE users SET password_hash = :h WHERE role = 'owner'");
        $stmt->execute([':h' => $hash]);
    }
    $fb = loadFallbackOwner($fallbackFile);
    if ($fb !== null) {
        saveFallbackOwner($fallbackFile, $fb['username'], $hash);
    }
    ApiEnvelope::sendSuccess(['password_updated' => true], 'settings_password_updated');
}

ApiEnvelope::sendError('UNKNOWN_ACTION', 'error_invalid_credentials');
