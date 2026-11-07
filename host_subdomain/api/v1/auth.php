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

if ($pdo !== null) {
    try {
        $pdo->exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(120) NULL AFTER username");
        $pdo->exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code_hash VARCHAR(255) NULL AFTER password_hash");
        $pdo->exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires_at_utc DATETIME NULL AFTER reset_code_hash");
    } catch (\Throwable $e) {
        // Ignore if columns already exist or DB user lacks ALTER privilege
    }
}

function loadFallbackOwner(string $file): ?array
{
    if (!is_file($file)) {
        return null;
    }
    $data = json_decode((string) file_get_contents($file), true);
    return is_array($data) && !empty($data['username']) ? $data : null;
}

function saveFallbackOwner(
    string $file,
    string $username,
    string $passwordHash,
    string $email = '',
    ?string $resetCodeHash = null,
    ?string $resetExpiresAtUtc = null
): void {
    $dir = dirname($file);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @file_put_contents($file, json_encode([
        'username' => $username,
        'email' => $email,
        'password_hash' => $passwordHash,
        'reset_code_hash' => $resetCodeHash,
        'reset_expires_at_utc' => $resetExpiresAtUtc,
        'updated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ], JSON_UNESCAPED_UNICODE));
}

function sendRecoveryEmailMessage(string $email, string $username, string $code): bool
{
    $subject = "Chart Intelligence - Password Recovery Code: {$code}";
    $body = "Hello {$username},\r\n\r\n"
        . "Your 6-digit password recovery code for Chart Intelligence (chart.manico.es) is:\r\n\r\n"
        . "    {$code}\r\n\r\n"
        . "This code expires in 15 minutes (UTC).\r\n"
        . "If you did not request a password reset, you can safely ignore this email.\r\n";
    $headers = "From: noreply@manico.es\r\n"
        . "Reply-To: noreply@manico.es\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n";
    return (bool) @mail($email, $subject, $body, $headers);
}

if ($action === 'status') {
    if ($pdo !== null) {
        $stmt = $pdo->query("SELECT username, email FROM users WHERE role = 'owner' LIMIT 1");
        $row = $stmt ? $stmt->fetch() : false;
        if ($row && !empty($row['username'])) {
            ApiEnvelope::sendSuccess([
                'is_owner_registered' => true,
                'owner_username' => (string) $row['username'],
                'owner_email' => (string) ($row['email'] ?? ''),
            ]);
        }
    }
    $fb = loadFallbackOwner($fallbackFile);
    ApiEnvelope::sendSuccess([
        'is_owner_registered' => $fb !== null,
        'owner_username' => (string) ($fb['username'] ?? ''),
        'owner_email' => (string) ($fb['email'] ?? ''),
    ]);
}

if ($action === 'register_owner') {
    $username = trim((string) ($payload['username'] ?? ''));
    $email = strtolower(trim((string) ($payload['email'] ?? '')));
    $password = (string) ($payload['password'] ?? '');
    if ($username === '' || $password === '') {
        ApiEnvelope::sendError('EMPTY_CREDENTIALS', 'error_empty_credentials');
    }
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        ApiEnvelope::sendError('INVALID_EMAIL', 'error_invalid_email');
    }
    if (mb_strlen($password) < 4) {
        ApiEnvelope::sendError('PASSWORD_SHORT', 'error_password_short');
    }
    $hashAlgo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
    $hash = password_hash($password, $hashAlgo);

    if ($pdo !== null) {
        $stmt = $pdo->prepare(
            "INSERT INTO users (username, email, password_hash, role) VALUES (:u, :e, :h, 'owner')
             ON DUPLICATE KEY UPDATE email = VALUES(email), password_hash = VALUES(password_hash)"
        );
        $stmt->execute([':u' => $username, ':e' => $email !== '' ? $email : null, ':h' => $hash]);
    }
    saveFallbackOwner($fallbackFile, $username, $hash, $email);
    ApiEnvelope::sendSuccess([
        'is_owner_registered' => true,
        'owner_username' => $username,
        'owner_email' => $email,
    ]);
}

if ($action === 'login') {
    $identifier = trim((string) ($payload['username'] ?? ''));
    $password = (string) ($payload['password'] ?? '');
    if ($identifier === '' || $password === '') {
        ApiEnvelope::sendError('EMPTY_CREDENTIALS', 'error_empty_credentials');
    }

    if ($pdo !== null) {
        $stmt = $pdo->prepare(
            "SELECT username, email, password_hash FROM users
             WHERE LOWER(username) = LOWER(:u) OR (email IS NOT NULL AND LOWER(email) = LOWER(:e))
             LIMIT 1"
        );
        $stmt->execute([':u' => $identifier, ':e' => $identifier]);
        $row = $stmt->fetch();
        if ($row && password_verify($password, (string) $row['password_hash'])) {
            ApiEnvelope::sendSuccess([
                'authenticated' => true,
                'owner_username' => (string) $row['username'],
                'owner_email' => (string) ($row['email'] ?? ''),
            ]);
        }
    }

    $fb = loadFallbackOwner($fallbackFile);
    if (
        $fb !== null &&
        (strcasecmp((string) $fb['username'], $identifier) === 0 ||
            (!empty($fb['email']) && strcasecmp((string) $fb['email'], $identifier) === 0)) &&
        password_verify($password, (string) $fb['password_hash'])
    ) {
        ApiEnvelope::sendSuccess([
            'authenticated' => true,
            'owner_username' => (string) $fb['username'],
            'owner_email' => (string) ($fb['email'] ?? ''),
        ]);
    }

    ApiEnvelope::sendError('INVALID_CREDENTIALS', 'error_invalid_credentials', 401);
}

if ($action === 'google_sign_in') {
    $email = strtolower(trim((string) ($payload['email'] ?? '')));
    $displayName = trim((string) ($payload['username'] ?? ''));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        ApiEnvelope::sendError('INVALID_EMAIL', 'error_invalid_email');
    }
    $fallbackUsername = $displayName !== '' ? $displayName : explode('@', $email)[0];

    if ($pdo !== null) {
        $stmt = $pdo->query("SELECT id, username, email FROM users WHERE role = 'owner' LIMIT 1");
        $row = $stmt ? $stmt->fetch() : false;
        if ($row) {
            $ownerEmail = strtolower(trim((string) ($row['email'] ?? '')));
            if ($ownerEmail === '') {
                $upd = $pdo->prepare("UPDATE users SET email = :e WHERE id = :id");
                $upd->execute([':e' => $email, ':id' => $row['id']]);
                $ownerEmail = $email;
            }
            if (strcasecmp($ownerEmail, $email) === 0) {
                ApiEnvelope::sendSuccess([
                    'authenticated' => true,
                    'is_owner_registered' => true,
                    'owner_username' => (string) $row['username'],
                    'owner_email' => $ownerEmail,
                ]);
            }
            ApiEnvelope::sendError('INVALID_CREDENTIALS', 'error_invalid_credentials', 401);
        } else {
            $hashAlgo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
            $randomHash = password_hash(bin2hex(random_bytes(16)), $hashAlgo);
            $ins = $pdo->prepare("INSERT INTO users (username, email, password_hash, role) VALUES (:u, :e, :h, 'owner')");
            $ins->execute([':u' => $fallbackUsername, ':e' => $email, ':h' => $randomHash]);
            saveFallbackOwner($fallbackFile, $fallbackUsername, $randomHash, $email);
            ApiEnvelope::sendSuccess([
                'authenticated' => true,
                'is_owner_registered' => true,
                'owner_username' => $fallbackUsername,
                'owner_email' => $email,
            ]);
        }
    }

    $fb = loadFallbackOwner($fallbackFile);
    if ($fb !== null) {
        $fbEmail = strtolower(trim((string) ($fb['email'] ?? '')));
        if ($fbEmail === '' || strcasecmp($fbEmail, $email) === 0) {
            saveFallbackOwner($fallbackFile, (string) $fb['username'], (string) $fb['password_hash'], $email);
            ApiEnvelope::sendSuccess([
                'authenticated' => true,
                'is_owner_registered' => true,
                'owner_username' => (string) $fb['username'],
                'owner_email' => $email,
            ]);
        }
        ApiEnvelope::sendError('INVALID_CREDENTIALS', 'error_invalid_credentials', 401);
    } else {
        $hashAlgo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
        $randomHash = password_hash(bin2hex(random_bytes(16)), $hashAlgo);
        saveFallbackOwner($fallbackFile, $fallbackUsername, $randomHash, $email);
        ApiEnvelope::sendSuccess([
            'authenticated' => true,
            'is_owner_registered' => true,
            'owner_username' => $fallbackUsername,
            'owner_email' => $email,
        ]);
    }
}

if ($action === 'update_profile') {
    $email = strtolower(trim((string) ($payload['email'] ?? '')));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        ApiEnvelope::sendError('INVALID_EMAIL', 'error_invalid_email');
    }
    if ($pdo !== null) {
        $stmt = $pdo->prepare("UPDATE users SET email = :e WHERE role = 'owner'");
        $stmt->execute([':e' => $email]);
    }
    $fb = loadFallbackOwner($fallbackFile);
    if ($fb !== null) {
        saveFallbackOwner(
            $fallbackFile,
            (string) $fb['username'],
            (string) $fb['password_hash'],
            $email,
            $fb['reset_code_hash'] ?? null,
            $fb['reset_expires_at_utc'] ?? null
        );
    }
    ApiEnvelope::sendSuccess([
        'email_updated' => true,
        'owner_email' => $email,
    ], 'status_email_updated');
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
        saveFallbackOwner(
            $fallbackFile,
            (string) $fb['username'],
            $hash,
            (string) ($fb['email'] ?? '')
        );
    }
    ApiEnvelope::sendSuccess(['password_updated' => true], 'settings_password_updated');
}

if ($action === 'request_password_reset') {
    $email = strtolower(trim((string) ($payload['email'] ?? '')));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        ApiEnvelope::sendError('INVALID_EMAIL', 'error_invalid_email');
    }

    $code = (string) random_int(100000, 999999);
    $hashAlgo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
    $codeHash = password_hash($code, $hashAlgo);
    $expiresAtUtc = gmdate('Y-m-d H:i:s', time() + 900); // 15 minutes

    $matchedUsername = '';
    if ($pdo !== null) {
        $stmt = $pdo->prepare("SELECT id, username, email FROM users WHERE role = 'owner' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch();
        if ($row) {
            $ownerEmail = strtolower(trim((string) ($row['email'] ?? '')));
            if ($ownerEmail !== '' && strcasecmp($ownerEmail, $email) !== 0) {
                ApiEnvelope::sendError('EMAIL_NOT_FOUND', 'error_email_not_found', 404);
            }
            $upd = $pdo->prepare(
                "UPDATE users SET email = :e, reset_code_hash = :ch, reset_expires_at_utc = :exp WHERE id = :id"
            );
            $upd->execute([
                ':e' => $email,
                ':ch' => $codeHash,
                ':exp' => $expiresAtUtc,
                ':id' => $row['id'],
            ]);
            $matchedUsername = (string) $row['username'];
        }
    }

    $fb = loadFallbackOwner($fallbackFile);
    if ($fb !== null) {
        $fbEmail = strtolower(trim((string) ($fb['email'] ?? '')));
        if ($matchedUsername === '' && $fbEmail !== '' && strcasecmp($fbEmail, $email) !== 0) {
            ApiEnvelope::sendError('EMAIL_NOT_FOUND', 'error_email_not_found', 404);
        }
        saveFallbackOwner(
            $fallbackFile,
            (string) $fb['username'],
            (string) $fb['password_hash'],
            $email,
            $codeHash,
            $expiresAtUtc
        );
        if ($matchedUsername === '') {
            $matchedUsername = (string) $fb['username'];
        }
    }

    if ($matchedUsername === '') {
        ApiEnvelope::sendError('EMAIL_NOT_FOUND', 'error_email_not_found', 404);
    }

    $mailSent = sendRecoveryEmailMessage($email, $matchedUsername, $code);
    ApiEnvelope::sendSuccess([
        'reset_code_sent' => true,
        'mail_dispatched' => $mailSent,
        'expires_in_seconds' => 900,
    ], 'status_recovery_code_sent');
}

if ($action === 'confirm_password_reset') {
    $email = strtolower(trim((string) ($payload['email'] ?? '')));
    $code = trim((string) ($payload['code'] ?? ''));
    $newPassword = (string) ($payload['new_password'] ?? '');

    if ($email === '' || $code === '' || $newPassword === '') {
        ApiEnvelope::sendError('EMPTY_CREDENTIALS', 'error_empty_credentials');
    }
    if (mb_strlen($newPassword) < 4) {
        ApiEnvelope::sendError('PASSWORD_SHORT', 'error_password_short');
    }

    $nowUtc = gmdate('Y-m-d H:i:s');
    $verified = false;
    $ownerUsername = '';

    if ($pdo !== null) {
        $stmt = $pdo->prepare(
            "SELECT id, username, reset_code_hash, reset_expires_at_utc FROM users
             WHERE role = 'owner' AND LOWER(email) = LOWER(:e) LIMIT 1"
        );
        $stmt->execute([':e' => $email]);
        $row = $stmt->fetch();
        if (
            $row &&
            !empty($row['reset_code_hash']) &&
            !empty($row['reset_expires_at_utc']) &&
            $row['reset_expires_at_utc'] >= $nowUtc &&
            password_verify($code, (string) $row['reset_code_hash'])
        ) {
            $verified = true;
            $ownerUsername = (string) $row['username'];
        }
    }

    $fb = loadFallbackOwner($fallbackFile);
    if (
        !$verified &&
        $fb !== null &&
        strcasecmp((string) ($fb['email'] ?? ''), $email) === 0 &&
        !empty($fb['reset_code_hash']) &&
        !empty($fb['reset_expires_at_utc']) &&
        $fb['reset_expires_at_utc'] >= $nowUtc &&
        password_verify($code, (string) $fb['reset_code_hash'])
    ) {
        $verified = true;
        $ownerUsername = (string) $fb['username'];
    }

    if (!$verified) {
        ApiEnvelope::sendError('INVALID_RECOVERY_CODE', 'error_invalid_recovery_code', 400);
    }

    $hashAlgo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
    $newHash = password_hash($newPassword, $hashAlgo);

    if ($pdo !== null) {
        $upd = $pdo->prepare(
            "UPDATE users SET password_hash = :h, reset_code_hash = NULL, reset_expires_at_utc = NULL WHERE role = 'owner'"
        );
        $upd->execute([':h' => $newHash]);
    }
    if ($fb !== null) {
        saveFallbackOwner($fallbackFile, (string) $fb['username'], $newHash, $email, null, null);
    }

    ApiEnvelope::sendSuccess([
        'password_reset' => true,
        'owner_username' => $ownerUsername,
        'owner_email' => $email,
    ], 'status_password_reset_success');
}

ApiEnvelope::sendError('UNKNOWN_ACTION', 'error_invalid_credentials');
