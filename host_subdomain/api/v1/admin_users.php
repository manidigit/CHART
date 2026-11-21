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
$action = trim((string) ($_GET['action'] ?? ($payload['action'] ?? 'list')));

$pdo = Database::getPdo();
if ($pdo === null) {
    ApiEnvelope::sendError('DATABASE_UNAVAILABLE', 'error_db_unavailable', 503);
}

$sessionsFile = dirname(__DIR__, 2) . '/config/sessions.local.json';

function extractAdminSessionToken(array $payload): string
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

function authenticateAdminCaller(PDO $pdo, string $sessionsFile, string $token): array
{
    if ($token === '') {
        ApiEnvelope::sendError('UNAUTHORIZED', 'error_invalid_credentials', 401);
    }

    $username = '';
    $nowUtc = gmdate('Y-m-d H:i:s');

    try {
        $stmt = $pdo->prepare("SELECT username FROM user_sessions WHERE token = :t AND expires_at_utc > :now LIMIT 1");
        $stmt->execute([':t' => $token, ':now' => $nowUtc]);
        $row = $stmt->fetch();
        if ($row && !empty($row['username'])) {
            $username = (string) $row['username'];
        }
    } catch (\Throwable) {
        // Fallback check below
    }

    if ($username === '' && is_file($sessionsFile)) {
        $data = json_decode((string) @file_get_contents($sessionsFile), true);
        if (is_array($data) && isset($data[$token])) {
            $s = $data[$token];
            if (isset($s['expires_ts']) && (int) $s['expires_ts'] > time() && !empty($s['username'])) {
                $username = (string) $s['username'];
            }
        }
    }

    if ($username === '') {
        ApiEnvelope::sendError('UNAUTHORIZED', 'error_invalid_credentials', 401);
    }

    $uStmt = $pdo->prepare("SELECT id, username, email, role, is_active FROM users WHERE LOWER(username) = LOWER(:u) LIMIT 1");
    $uStmt->execute([':u' => $username]);
    $user = $uStmt->fetch();
    if (!$user || (int) ($user['is_active'] ?? 0) !== 1) {
        ApiEnvelope::sendError('ACCOUNT_DISABLED', 'error_account_disabled', 403);
    }

    $role = strtolower((string) ($user['role'] ?? 'viewer'));
    if (!in_array($role, ['owner', 'admin'], true)) {
        ApiEnvelope::sendError('FORBIDDEN', 'error_admin_forbidden', 403);
    }

    return [
        'id' => (int) $user['id'],
        'username' => (string) $user['username'],
        'email' => (string) ($user['email'] ?? ''),
        'role' => $role,
    ];
}

function revokeSessionsForUsername(PDO $pdo, string $sessionsFile, string $username): void
{
    try {
        $stmt = $pdo->prepare("DELETE FROM user_sessions WHERE LOWER(username) = LOWER(:u)");
        $stmt->execute([':u' => $username]);
    } catch (\Throwable) {}

    if (is_file($sessionsFile)) {
        $data = json_decode((string) @file_get_contents($sessionsFile), true);
        if (is_array($data)) {
            $filtered = [];
            foreach ($data as $t => $s) {
                if (strcasecmp((string) ($s['username'] ?? ''), $username) !== 0) {
                    $filtered[$t] = $s;
                }
            }
            @file_put_contents($sessionsFile, json_encode($filtered, JSON_UNESCAPED_UNICODE), LOCK_EX);
        }
    }
}

function recordAdminAuditLog(PDO $pdo, array $caller, string $actionName, string $targetUsername, array $details = []): void
{
    try {
        $stmt = $pdo->prepare(
            "INSERT INTO audit_logs (actor_username, action_type, target_entity, details_json, created_at_utc)
             VALUES (:actor, :act, :target, :details, :now)"
        );
        $stmt->execute([
            ':actor' => $caller['username'],
            ':act' => 'ADMIN_USER_' . strtoupper($actionName),
            ':target' => $targetUsername,
            ':details' => json_encode($details, JSON_UNESCAPED_UNICODE),
            ':now' => gmdate('Y-m-d H:i:s'),
        ]);
    } catch (\Throwable) {
        // audit_logs table may not be migrated yet; never block user management on optional telemetry
    }
}

function fetchUsersRoster(PDO $pdo): array
{
    $nowUtc = gmdate('Y-m-d H:i:s');
    $stmt = $pdo->prepare(
        "SELECT u.id, u.username, u.email, u.role, u.is_active, u.created_at_utc, u.updated_at_utc,
                (SELECT COUNT(*) FROM user_sessions s WHERE LOWER(s.username) = LOWER(u.username) AND s.expires_at_utc > :now) AS active_sessions
         FROM users u
         ORDER BY FIELD(u.role, 'owner', 'admin', 'viewer'), u.id ASC"
    );
    $stmt->execute([':now' => $nowUtc]);
    $rows = $stmt->fetchAll();

    $out = [];
    foreach ($rows as $row) {
        $out[] = [
            'id' => (int) $row['id'],
            'username' => (string) $row['username'],
            'email' => (string) ($row['email'] ?? ''),
            'role' => strtolower((string) ($row['role'] ?? 'viewer')),
            'is_active' => ((int) ($row['is_active'] ?? 1)) === 1,
            'active_sessions' => (int) ($row['active_sessions'] ?? 0),
            'created_at_utc' => (string) ($row['created_at_utc'] ?? ''),
            'updated_at_utc' => (string) ($row['updated_at_utc'] ?? ''),
        ];
    }
    return $out;
}

$caller = authenticateAdminCaller($pdo, $sessionsFile, extractAdminSessionToken($payload));

if ($action === 'list') {
    ApiEnvelope::sendSuccess([
        'caller_username' => $caller['username'],
        'caller_role' => $caller['role'],
        'users' => fetchUsersRoster($pdo),
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    ApiEnvelope::sendError('METHOD_NOT_ALLOWED', 'error_method_not_allowed', 405);
}

if ($action === 'create') {
    $username = trim((string) ($payload['username'] ?? ''));
    $email = strtolower(trim((string) ($payload['email'] ?? '')));
    $password = (string) ($payload['password'] ?? '');
    $role = strtolower(trim((string) ($payload['role'] ?? 'viewer')));

    if (!preg_match('/^[A-Za-z0-9._-]{3,40}$/', $username)) {
        ApiEnvelope::sendError('INVALID_USERNAME', 'error_invalid_username', 400);
    }
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        ApiEnvelope::sendError('INVALID_EMAIL', 'error_invalid_email', 400);
    }
    if (mb_strlen($password) < 8) {
        ApiEnvelope::sendError('PASSWORD_SHORT', 'error_password_short', 400);
    }
    if (!in_array($role, ['admin', 'viewer'], true)) {
        ApiEnvelope::sendError('INVALID_ROLE', 'error_invalid_role', 400);
    }
    if ($role === 'admin' && $caller['role'] !== 'owner') {
        ApiEnvelope::sendError('FORBIDDEN_ROLE_ASSIGNMENT', 'error_admin_forbidden', 403);
    }

    $dupStmt = $pdo->prepare("SELECT 1 FROM users WHERE LOWER(username) = LOWER(:u) LIMIT 1");
    $dupStmt->execute([':u' => $username]);
    if ($dupStmt->fetch()) {
        ApiEnvelope::sendError('USERNAME_EXISTS', 'error_username_exists', 409);
    }

    $hashAlgo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
    $hash = password_hash($password, $hashAlgo);

    $ins = $pdo->prepare(
        "INSERT INTO users (username, email, password_hash, role, is_active)
         VALUES (:u, :e, :h, :r, 1)"
    );
    $ins->execute([
        ':u' => $username,
        ':e' => $email !== '' ? $email : null,
        ':h' => $hash,
        ':r' => $role,
    ]);

    recordAdminAuditLog($pdo, $caller, 'create', $username, ['role' => $role, 'email' => $email]);
    ApiEnvelope::sendSuccess([
        'created_username' => $username,
        'caller_role' => $caller['role'],
        'users' => fetchUsersRoster($pdo),
    ], 'status_user_created');
}

if ($action === 'update') {
    $targetId = (int) ($payload['user_id'] ?? 0);
    if ($targetId <= 0) {
        ApiEnvelope::sendError('INVALID_USER_ID', 'error_invalid_request', 400);
    }

    $tStmt = $pdo->prepare("SELECT id, username, role, is_active FROM users WHERE id = :id LIMIT 1");
    $tStmt->execute([':id' => $targetId]);
    $target = $tStmt->fetch();
    if (!$target) {
        ApiEnvelope::sendError('USER_NOT_FOUND', 'error_user_not_found', 404);
    }

    $targetRole = strtolower((string) $target['role']);
    $targetUsername = (string) $target['username'];
    if ($targetRole === 'owner') {
        ApiEnvelope::sendError('CANNOT_MODIFY_OWNER', 'error_cannot_modify_owner', 403);
    }
    if ((int) $target['id'] === $caller['id']) {
        ApiEnvelope::sendError('CANNOT_MODIFY_SELF', 'error_cannot_modify_self', 403);
    }
    if ($caller['role'] !== 'owner' && $targetRole === 'admin') {
        ApiEnvelope::sendError('FORBIDDEN', 'error_admin_forbidden', 403);
    }

    $newRole = isset($payload['role']) ? strtolower(trim((string) $payload['role'])) : $targetRole;
    $newActive = isset($payload['is_active']) ? (bool) $payload['is_active'] : (((int) $target['is_active']) === 1);

    if (!in_array($newRole, ['admin', 'viewer'], true)) {
        ApiEnvelope::sendError('INVALID_ROLE', 'error_invalid_role', 400);
    }
    if ($newRole === 'admin' && $caller['role'] !== 'owner') {
        ApiEnvelope::sendError('FORBIDDEN_ROLE_ASSIGNMENT', 'error_admin_forbidden', 403);
    }

    $upd = $pdo->prepare("UPDATE users SET role = :r, is_active = :a WHERE id = :id");
    $upd->execute([
        ':r' => $newRole,
        ':a' => $newActive ? 1 : 0,
        ':id' => $targetId,
    ]);

    if (!$newActive) {
        revokeSessionsForUsername($pdo, $sessionsFile, $targetUsername);
    }

    recordAdminAuditLog($pdo, $caller, 'update', $targetUsername, ['role' => $newRole, 'is_active' => $newActive]);
    ApiEnvelope::sendSuccess([
        'updated_user_id' => $targetId,
        'caller_role' => $caller['role'],
        'users' => fetchUsersRoster($pdo),
    ], 'status_user_updated');
}

if ($action === 'reset_password') {
    $targetId = (int) ($payload['user_id'] ?? 0);
    $newPassword = (string) ($payload['new_password'] ?? '');
    if ($targetId <= 0 || mb_strlen($newPassword) < 8) {
        ApiEnvelope::sendError('PASSWORD_SHORT', 'error_password_short', 400);
    }

    $tStmt = $pdo->prepare("SELECT id, username, role FROM users WHERE id = :id LIMIT 1");
    $tStmt->execute([':id' => $targetId]);
    $target = $tStmt->fetch();
    if (!$target) {
        ApiEnvelope::sendError('USER_NOT_FOUND', 'error_user_not_found', 404);
    }

    $targetRole = strtolower((string) $target['role']);
    $targetUsername = (string) $target['username'];
    if ($targetRole === 'owner') {
        ApiEnvelope::sendError('CANNOT_MODIFY_OWNER', 'error_cannot_modify_owner', 403);
    }
    if ($caller['role'] !== 'owner' && $targetRole === 'admin') {
        ApiEnvelope::sendError('FORBIDDEN', 'error_admin_forbidden', 403);
    }

    $hashAlgo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
    $hash = password_hash($newPassword, $hashAlgo);

    $upd = $pdo->prepare("UPDATE users SET password_hash = :h WHERE id = :id");
    $upd->execute([':h' => $hash, ':id' => $targetId]);

    revokeSessionsForUsername($pdo, $sessionsFile, $targetUsername);
    recordAdminAuditLog($pdo, $caller, 'reset_password', $targetUsername);
    ApiEnvelope::sendSuccess([
        'reset_user_id' => $targetId,
        'caller_role' => $caller['role'],
        'users' => fetchUsersRoster($pdo),
    ], 'status_user_password_reset');
}

if ($action === 'revoke_sessions') {
    $targetId = (int) ($payload['user_id'] ?? 0);
    if ($targetId <= 0) {
        ApiEnvelope::sendError('INVALID_USER_ID', 'error_invalid_request', 400);
    }

    $tStmt = $pdo->prepare("SELECT id, username, role FROM users WHERE id = :id LIMIT 1");
    $tStmt->execute([':id' => $targetId]);
    $target = $tStmt->fetch();
    if (!$target) {
        ApiEnvelope::sendError('USER_NOT_FOUND', 'error_user_not_found', 404);
    }

    $targetRole = strtolower((string) $target['role']);
    $targetUsername = (string) $target['username'];
    if ($targetRole === 'owner' && $caller['role'] !== 'owner') {
        ApiEnvelope::sendError('FORBIDDEN', 'error_admin_forbidden', 403);
    }
    if ($targetRole === 'admin' && $caller['role'] !== 'owner') {
        ApiEnvelope::sendError('FORBIDDEN', 'error_admin_forbidden', 403);
    }

    revokeSessionsForUsername($pdo, $sessionsFile, $targetUsername);
    recordAdminAuditLog($pdo, $caller, 'revoke_sessions', $targetUsername);
    ApiEnvelope::sendSuccess([
        'revoked_user_id' => $targetId,
        'caller_role' => $caller['role'],
        'users' => fetchUsersRoster($pdo),
    ], 'status_user_sessions_revoked');
}

if ($action === 'delete') {
    $targetId = (int) ($payload['user_id'] ?? 0);
    if ($targetId <= 0) {
        ApiEnvelope::sendError('INVALID_USER_ID', 'error_invalid_request', 400);
    }

    $tStmt = $pdo->prepare("SELECT id, username, role FROM users WHERE id = :id LIMIT 1");
    $tStmt->execute([':id' => $targetId]);
    $target = $tStmt->fetch();
    if (!$target) {
        ApiEnvelope::sendError('USER_NOT_FOUND', 'error_user_not_found', 404);
    }

    $targetRole = strtolower((string) $target['role']);
    $targetUsername = (string) $target['username'];
    if ($targetRole === 'owner') {
        ApiEnvelope::sendError('CANNOT_MODIFY_OWNER', 'error_cannot_modify_owner', 403);
    }
    if ((int) $target['id'] === $caller['id']) {
        ApiEnvelope::sendError('CANNOT_MODIFY_SELF', 'error_cannot_modify_self', 403);
    }
    if ($caller['role'] !== 'owner' && $targetRole === 'admin') {
        ApiEnvelope::sendError('FORBIDDEN', 'error_admin_forbidden', 403);
    }

    revokeSessionsForUsername($pdo, $sessionsFile, $targetUsername);
    $del = $pdo->prepare("DELETE FROM users WHERE id = :id AND role <> 'owner'");
    $del->execute([':id' => $targetId]);

    recordAdminAuditLog($pdo, $caller, 'delete', $targetUsername, ['deleted_role' => $targetRole]);
    ApiEnvelope::sendSuccess([
        'deleted_user_id' => $targetId,
        'caller_role' => $caller['role'],
        'users' => fetchUsersRoster($pdo),
    ], 'status_user_deleted');
}

ApiEnvelope::sendError('UNKNOWN_ACTION', 'error_invalid_request', 400);
