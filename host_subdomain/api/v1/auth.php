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

$rawBody = file_get_contents('php://input');
$payload = is_string($rawBody) && $rawBody !== '' ? (json_decode($rawBody, true) ?? []) : [];
$action = $_GET['action'] ?? ($payload['action'] ?? 'status');

$pdo = Database::getPdo();
$fallbackFile = dirname(__DIR__, 2) . '/config/owner.local.json';
$rateLimitFile = dirname(__DIR__, 2) . '/config/auth_ratelimit.local.json';

if ($pdo !== null) {
    try {
        $pdo->exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(120) NULL AFTER username");
        $pdo->exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code_hash VARCHAR(255) NULL AFTER password_hash");
        $pdo->exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires_at_utc DATETIME NULL AFTER reset_code_hash");
        $pdo->exec("CREATE TABLE IF NOT EXISTS user_sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            token VARCHAR(64) NOT NULL UNIQUE,
            username VARCHAR(64) NOT NULL,
            email VARCHAR(120) NULL,
            expires_at_utc DATETIME NOT NULL,
            created_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_token (token),
            INDEX idx_expires (expires_at_utc)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (\Throwable $e) {
        // Ignore if columns or table already exist
    }
}

$sessionsFile = dirname(__DIR__, 2) . '/config/sessions.local.json';

function extractSessionToken(array $payload): string
{
    $token = trim((string) ($payload['session_token'] ?? ($_GET['session_token'] ?? ($_GET['token'] ?? ''))));
    if ($token === '') {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
            $token = $matches[1];
        }
    }
    return $token;
}

function getClientIpAddress(): string
{
    $forwarded = trim((string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''));
    if ($forwarded !== '') {
        $parts = explode(',', $forwarded);
        return trim($parts[0]);
    }
    return trim((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'));
}

function enforceRateLimit(string $rateLimitFile, string $bucket, int $maxAttempts, int $windowSec): void
{
    $ip = getClientIpAddress();
    $key = hash('sha256', $bucket . '|' . $ip);
    $now = time();
    $records = [];
    if (is_file($rateLimitFile)) {
        $raw = json_decode((string) @file_get_contents($rateLimitFile), true);
        if (is_array($raw)) {
            foreach ($raw as $k => $timestamps) {
                if (is_array($timestamps)) {
                    $valid = array_values(array_filter($timestamps, static fn ($ts) => ((int) $ts) > ($now - 3600)));
                    if (!empty($valid)) {
                        $records[$k] = $valid;
                    }
                }
            }
        }
    }
    $recent = array_values(array_filter($records[$key] ?? [], static fn ($ts) => ((int) $ts) > ($now - $windowSec)));
    if (count($recent) >= $maxAttempts) {
        ApiEnvelope::sendError('RATE_LIMITED', 'error_rate_limited', 429);
    }
    $recent[] = $now;
    $records[$key] = $recent;
    $dir = dirname($rateLimitFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @file_put_contents($rateLimitFile, json_encode($records, JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function clearRateLimitBucket(string $rateLimitFile, string $bucket): void
{
    if (!is_file($rateLimitFile)) {
        return;
    }
    $key = hash('sha256', $bucket . '|' . getClientIpAddress());
    $raw = json_decode((string) @file_get_contents($rateLimitFile), true);
    if (is_array($raw) && isset($raw[$key])) {
        unset($raw[$key]);
        @file_put_contents($rateLimitFile, json_encode($raw, JSON_UNESCAPED_UNICODE), LOCK_EX);
    }
}

function pruneExpiredSessions(?PDO $pdo, string $sessionsFile): void
{
    if ($pdo !== null) {
        try {
            $stmt = $pdo->prepare("DELETE FROM user_sessions WHERE expires_at_utc <= :now");
            $stmt->execute([':now' => gmdate('Y-m-d H:i:s')]);
        } catch (\Throwable) {}
    }
    if (is_file($sessionsFile)) {
        $data = json_decode((string) @file_get_contents($sessionsFile), true);
        if (is_array($data)) {
            $now = time();
            $pruned = [];
            foreach ($data as $t => $s) {
                if (isset($s['expires_ts']) && (int) $s['expires_ts'] > $now) {
                    $pruned[$t] = $s;
                }
            }
            if (count($pruned) !== count($data)) {
                @file_put_contents($sessionsFile, json_encode($pruned, JSON_UNESCAPED_UNICODE), LOCK_EX);
            }
        }
    }
}

function createSessionToken(?PDO $pdo, string $sessionsFile, string $username, string $email): string
{
    $token = bin2hex(random_bytes(32));
    $expiresSec = time() + (30 * 86400); // 30 days remember me
    $expiresUtc = gmdate('Y-m-d H:i:s', $expiresSec);

    if ($pdo !== null) {
        try {
            $del = $pdo->prepare("DELETE FROM user_sessions WHERE expires_at_utc <= :now");
            $del->execute([':now' => gmdate('Y-m-d H:i:s')]);
            $stmt = $pdo->prepare("INSERT INTO user_sessions (token, username, email, expires_at_utc) VALUES (:t, :u, :e, :exp)");
            $stmt->execute([':t' => $token, ':u' => $username, ':e' => $email !== '' ? $email : null, ':exp' => $expiresUtc]);
        } catch (\Throwable) {}
    }

    $sessions = [];
    if (is_file($sessionsFile)) {
        $data = json_decode((string) @file_get_contents($sessionsFile), true);
        if (is_array($data)) {
            $now = time();
            foreach ($data as $t => $s) {
                if (isset($s['expires_ts']) && (int) $s['expires_ts'] > $now) {
                    $sessions[$t] = $s;
                }
            }
        }
    }
    $sessions[$token] = [
        'username' => $username,
        'email' => $email,
        'expires_ts' => $expiresSec,
        'created_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
    $dir = dirname($sessionsFile);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    @file_put_contents($sessionsFile, json_encode($sessions, JSON_UNESCAPED_UNICODE), LOCK_EX);

    return $token;
}

function verifySessionToken(?PDO $pdo, string $sessionsFile, string $token): ?array
{
    if ($token === '') return null;
    $nowUtc = gmdate('Y-m-d H:i:s');

    if ($pdo !== null) {
        try {
            $stmt = $pdo->prepare("SELECT username, email FROM user_sessions WHERE token = :t AND expires_at_utc > :now LIMIT 1");
            $stmt->execute([':t' => $token, ':now' => $nowUtc]);
            $row = $stmt->fetch();
            if ($row && !empty($row['username'])) {
                return [
                    'username' => (string) $row['username'],
                    'email' => (string) ($row['email'] ?? ''),
                ];
            }
        } catch (\Throwable) {}
    }

    if (is_file($sessionsFile)) {
        $data = json_decode((string) @file_get_contents($sessionsFile), true);
        if (is_array($data) && isset($data[$token])) {
            $s = $data[$token];
            if (isset($s['expires_ts']) && (int) $s['expires_ts'] > time()) {
                return [
                    'username' => (string) ($s['username'] ?? ''),
                    'email' => (string) ($s['email'] ?? ''),
                ];
            }
        }
    }
    return null;
}

function revokeSessionToken(?PDO $pdo, string $sessionsFile, string $token): void
{
    if ($token === '') return;
    if ($pdo !== null) {
        try {
            $stmt = $pdo->prepare("DELETE FROM user_sessions WHERE token = :t");
            $stmt->execute([':t' => $token]);
        } catch (\Throwable) {}
    }
    if (is_file($sessionsFile)) {
        $data = json_decode((string) @file_get_contents($sessionsFile), true);
        if (is_array($data) && isset($data[$token])) {
            unset($data[$token]);
            @file_put_contents($sessionsFile, json_encode($data, JSON_UNESCAPED_UNICODE), LOCK_EX);
        }
    }
}

function revokeAllSessions(?PDO $pdo, string $sessionsFile): void
{
    if ($pdo !== null) {
        try {
            $pdo->exec("DELETE FROM user_sessions");
        } catch (\Throwable) {}
    }
    if (is_file($sessionsFile)) {
        @file_put_contents($sessionsFile, json_encode([], JSON_UNESCAPED_UNICODE), LOCK_EX);
    }
}

function isOwnerRegisteredAnywhere(?PDO $pdo, string $fallbackFile): bool
{
    if ($pdo !== null) {
        try {
            $stmt = $pdo->query("SELECT 1 FROM users WHERE role = 'owner' LIMIT 1");
            if ($stmt && $stmt->fetch()) {
                return true;
            }
        } catch (\Throwable) {}
    }
    return loadFallbackOwner($fallbackFile) !== null;
}

function loadFallbackOwner(string $file): ?array
{
    if (!is_file($file)) {
        return null;
    }
    $data = json_decode((string) @file_get_contents($file), true);
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
    ], JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function loadMailEnvConfig(): array
{
    $envFile = dirname(__DIR__, 2) . '/config/env.local.php';
    $cfg = is_file($envFile) ? (include $envFile) : [];
    return is_array($cfg) ? $cfg : [];
}

function sendViaSmtpSocket(
    string $host,
    int $port,
    string $user,
    string $pass,
    string $from,
    string $to,
    string $subject,
    string $body
): bool {
    $transport = ($port === 465) ? "ssl://{$host}:{$port}" : "tcp://{$host}:{$port}";
    $fp = @stream_socket_client($transport, $errno, $errstr, 8);
    if (!is_resource($fp)) {
        return false;
    }
    stream_set_timeout($fp, 8);
    $read = static function () use ($fp): string {
        $out = '';
        while (($line = fgets($fp, 515)) !== false) {
            $out .= $line;
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }
        return $out;
    };
    $write = static function (string $cmd) use ($fp): void {
        fwrite($fp, $cmd . "\r\n");
    };
    if (!str_starts_with($read(), '220')) {
        fclose($fp);
        return false;
    }
    $write('EHLO chart.manico.es');
    $ehlo = $read();
    if ($port === 587 && stripos($ehlo, 'STARTTLS') !== false) {
        $write('STARTTLS');
        if (!str_starts_with($read(), '220')) {
            fclose($fp);
            return false;
        }
        if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            fclose($fp);
            return false;
        }
        $write('EHLO chart.manico.es');
        $read();
    }
    if ($user !== '' && $pass !== '') {
        $write('AUTH LOGIN');
        if (!str_starts_with($read(), '334')) {
            fclose($fp);
            return false;
        }
        $write(base64_encode($user));
        if (!str_starts_with($read(), '334')) {
            fclose($fp);
            return false;
        }
        $write(base64_encode($pass));
        if (!str_starts_with($read(), '235')) {
            fclose($fp);
            return false;
        }
    }
    $write("MAIL FROM:<{$from}>");
    if (!str_starts_with($read(), '250')) {
        fclose($fp);
        return false;
    }
    $write("RCPT TO:<{$to}>");
    $rcptResp = $read();
    if (!str_starts_with($rcptResp, '250') && !str_starts_with($rcptResp, '251')) {
        fclose($fp);
        return false;
    }
    $write('DATA');
    if (!str_starts_with($read(), '354')) {
        fclose($fp);
        return false;
    }
    $msg = "From: Chart Intelligence <{$from}>\r\n"
        . "To: <{$to}>\r\n"
        . "Subject: {$subject}\r\n"
        . "MIME-Version: 1.0\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n\r\n"
        . $body . "\r\n.";
    $write($msg);
    $ok = str_starts_with($read(), '250');
    $write('QUIT');
    fclose($fp);
    return $ok;
}

function sendRecoveryEmailMessage(string $email, string $username, string $code): bool
{
    $cfg = loadMailEnvConfig();
    $fromEmail = (string) ($cfg['MAIL_FROM'] ?? (getenv('MAIL_FROM') ?: 'noreply@manico.es'));
    $subject = "Chart Intelligence - Password Recovery Code: {$code}";
    $body = "Hello {$username},\r\n\r\n"
        . "Your 6-digit password recovery code for Chart Intelligence (chart.manico.es) is:\r\n\r\n"
        . "    {$code}\r\n\r\n"
        . "This code expires in 15 minutes (UTC).\r\n"
        . "If you did not request a password reset, you can safely ignore this email.\r\n";

    // 1. HTTPS Transactional Email API (Resend) if configured
    $resendKey = trim((string) ($cfg['RESEND_API_KEY'] ?? (getenv('RESEND_API_KEY') ?: '')));
    if ($resendKey !== '' && function_exists('curl_init')) {
        $ch = curl_init('https://api.resend.com/emails');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $resendKey,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode([
                'from' => "Chart Intelligence <{$fromEmail}>",
                'to' => [$email],
                'subject' => $subject,
                'text' => $body,
            ], JSON_UNESCAPED_UNICODE),
        ]);
        $resp = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($resp !== false && $httpCode >= 200 && $httpCode < 300) {
            return true;
        }
    }

    // 2. Authenticated TLS/SSL SMTP Socket if configured in env.local.php
    $smtpHost = trim((string) ($cfg['SMTP_HOST'] ?? (getenv('SMTP_HOST') ?: '')));
    $smtpPort = (int) ($cfg['SMTP_PORT'] ?? (getenv('SMTP_PORT') ?: 465));
    $smtpUser = trim((string) ($cfg['SMTP_USER'] ?? (getenv('SMTP_USER') ?: '')));
    $smtpPass = (string) ($cfg['SMTP_PASS'] ?? (getenv('SMTP_PASS') ?: ''));
    if ($smtpHost !== '') {
        if (sendViaSmtpSocket($smtpHost, $smtpPort, $smtpUser, $smtpPass, $fromEmail, $email, $subject, $body)) {
            return true;
        }
    }

    // 3. Fallback to local MTA mail() with explicit envelope sender
    $headers = "From: Chart Intelligence <{$fromEmail}>\r\n"
        . "Reply-To: {$fromEmail}\r\n"
        . "MIME-Version: 1.0\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n";
    $sent = (bool) @mail($email, $subject, $body, $headers, "-f {$fromEmail}");
    if (!$sent) {
        $sent = (bool) @mail($email, $subject, $body, $headers);
    }
    if (!$sent) {
        error_log('[ChartIntelligence auth] Failed to dispatch recovery email via Resend/SMTP/mail()');
    }
    return $sent;
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
    if (isOwnerRegisteredAnywhere($pdo, $fallbackFile)) {
        ApiEnvelope::sendError('OWNER_ALREADY_EXISTS', 'error_invalid_credentials', 403);
    }
    $username = trim((string) ($payload['username'] ?? ''));
    $email = strtolower(trim((string) ($payload['email'] ?? '')));
    $password = (string) ($payload['password'] ?? '');
    if ($username === '' || $password === '') {
        ApiEnvelope::sendError('EMPTY_CREDENTIALS', 'error_empty_credentials');
    }
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        ApiEnvelope::sendError('INVALID_EMAIL', 'error_invalid_email');
    }
    if (mb_strlen($password) < 8) {
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
    $token = createSessionToken($pdo, $sessionsFile, $username, $email);
    ApiEnvelope::sendSuccess([
        'authenticated' => true,
        'session_token' => $token,
        'is_owner_registered' => true,
        'owner_username' => $username,
        'owner_email' => $email,
    ]);
}

if ($action === 'validate_session') {
    pruneExpiredSessions($pdo, $sessionsFile);
    $token = extractSessionToken($payload);
    $session = verifySessionToken($pdo, $sessionsFile, $token);
    if ($session !== null) {
        ApiEnvelope::sendSuccess([
            'authenticated' => true,
            'session_token' => $token,
            'owner_username' => $session['username'],
            'owner_email' => $session['email'],
        ]);
    }
    ApiEnvelope::sendError('INVALID_SESSION', 'error_invalid_credentials', 401);
}

if ($action === 'logout') {
    $token = extractSessionToken($payload);
    revokeSessionToken($pdo, $sessionsFile, $token);
    ApiEnvelope::sendSuccess(['logged_out' => true]);
}

if ($action === 'login') {
    enforceRateLimit($rateLimitFile, 'login', 15, 600);
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
            clearRateLimitBucket($rateLimitFile, 'login');
            $u = (string) $row['username'];
            $e = (string) ($row['email'] ?? '');
            $token = createSessionToken($pdo, $sessionsFile, $u, $e);
            ApiEnvelope::sendSuccess([
                'authenticated' => true,
                'session_token' => $token,
                'owner_username' => $u,
                'owner_email' => $e,
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
        clearRateLimitBucket($rateLimitFile, 'login');
        $u = (string) $fb['username'];
        $e = (string) ($fb['email'] ?? '');
        $token = createSessionToken($pdo, $sessionsFile, $u, $e);
        ApiEnvelope::sendSuccess([
            'authenticated' => true,
            'session_token' => $token,
            'owner_username' => $u,
            'owner_email' => $e,
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
                $u = (string) $row['username'];
                $token = createSessionToken($pdo, $sessionsFile, $u, $ownerEmail);
                ApiEnvelope::sendSuccess([
                    'authenticated' => true,
                    'session_token' => $token,
                    'is_owner_registered' => true,
                    'owner_username' => $u,
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
            $token = createSessionToken($pdo, $sessionsFile, $fallbackUsername, $email);
            ApiEnvelope::sendSuccess([
                'authenticated' => true,
                'session_token' => $token,
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
            $u = (string) $fb['username'];
            $token = createSessionToken($pdo, $sessionsFile, $u, $email);
            ApiEnvelope::sendSuccess([
                'authenticated' => true,
                'session_token' => $token,
                'is_owner_registered' => true,
                'owner_username' => $u,
                'owner_email' => $email,
            ]);
        }
        ApiEnvelope::sendError('INVALID_CREDENTIALS', 'error_invalid_credentials', 401);
    } else {
        $hashAlgo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
        $randomHash = password_hash(bin2hex(random_bytes(16)), $hashAlgo);
        saveFallbackOwner($fallbackFile, $fallbackUsername, $randomHash, $email);
        $token = createSessionToken($pdo, $sessionsFile, $fallbackUsername, $email);
        ApiEnvelope::sendSuccess([
            'authenticated' => true,
            'session_token' => $token,
            'is_owner_registered' => true,
            'owner_username' => $fallbackUsername,
            'owner_email' => $email,
        ]);
    }
}

if ($action === 'update_profile') {
    $session = verifySessionToken($pdo, $sessionsFile, extractSessionToken($payload));
    if ($session === null && isOwnerRegisteredAnywhere($pdo, $fallbackFile)) {
        ApiEnvelope::sendError('UNAUTHORIZED', 'error_invalid_credentials', 401);
    }
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
    $session = verifySessionToken($pdo, $sessionsFile, extractSessionToken($payload));
    if ($session === null && isOwnerRegisteredAnywhere($pdo, $fallbackFile)) {
        ApiEnvelope::sendError('UNAUTHORIZED', 'error_invalid_credentials', 401);
    }
    $newPassword = (string) ($payload['new_password'] ?? '');
    if (mb_strlen($newPassword) < 8) {
        ApiEnvelope::sendError('PASSWORD_SHORT', 'error_password_short');
    }
    $hashAlgo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
    $hash = password_hash($newPassword, $hashAlgo);

    $ownerUsername = $session['username'] ?? '';
    $ownerEmail = $session['email'] ?? '';
    if ($pdo !== null) {
        $stmt = $pdo->prepare("UPDATE users SET password_hash = :h WHERE role = 'owner'");
        $stmt->execute([':h' => $hash]);
        if ($ownerUsername === '') {
            $uStmt = $pdo->query("SELECT username, email FROM users WHERE role = 'owner' LIMIT 1");
            $uRow = $uStmt ? $uStmt->fetch() : false;
            if ($uRow) {
                $ownerUsername = (string) ($uRow['username'] ?? '');
                $ownerEmail = (string) ($uRow['email'] ?? '');
            }
        }
    }
    $fb = loadFallbackOwner($fallbackFile);
    if ($fb !== null) {
        if ($ownerUsername === '') {
            $ownerUsername = (string) $fb['username'];
            $ownerEmail = (string) ($fb['email'] ?? '');
        }
        saveFallbackOwner(
            $fallbackFile,
            (string) $fb['username'],
            $hash,
            (string) ($fb['email'] ?? '')
        );
    }
    revokeAllSessions($pdo, $sessionsFile);
    $freshToken = $ownerUsername !== '' ? createSessionToken($pdo, $sessionsFile, $ownerUsername, $ownerEmail) : '';
    ApiEnvelope::sendSuccess([
        'password_updated' => true,
        'session_token' => $freshToken,
    ], 'settings_password_updated');
}

if ($action === 'request_password_reset') {
    enforceRateLimit($rateLimitFile, 'password_reset_req', 6, 900);
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
    enforceRateLimit($rateLimitFile, 'password_reset_confirm', 10, 900);
    $email = strtolower(trim((string) ($payload['email'] ?? '')));
    $code = trim((string) ($payload['code'] ?? ''));
    $newPassword = (string) ($payload['new_password'] ?? '');

    if ($email === '' || $code === '' || $newPassword === '') {
        ApiEnvelope::sendError('EMPTY_CREDENTIALS', 'error_empty_credentials');
    }
    if (mb_strlen($newPassword) < 8) {
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
    revokeAllSessions($pdo, $sessionsFile);
    $freshToken = $ownerUsername !== '' ? createSessionToken($pdo, $sessionsFile, $ownerUsername, $email) : '';

    ApiEnvelope::sendSuccess([
        'password_reset' => true,
        'session_token' => $freshToken,
        'owner_username' => $ownerUsername,
        'owner_email' => $email,
    ], 'status_password_reset_success');
}

ApiEnvelope::sendError('UNKNOWN_ACTION', 'error_invalid_credentials');
