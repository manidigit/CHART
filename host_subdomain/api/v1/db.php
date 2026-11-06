<?php
/**
 * Chart Intelligence — MariaDB Database & Schema Manager (v1.15)
 *
 * - Enforces UTC timestamps & DECIMAL(18,6) price precision (never FLOAT for OHLC).
 * - Automatically creates/migrates Phase 1 tables (`users`, `charts`, `candles`, `import_logs`).
 * - Seeds the default personal owner user so the owner can log in immediately,
 *   while supporting multi-user accounts (`user_id` ownership).
 */

declare(strict_types=1);

class DatabaseManager
{
    private ?PDO $pdo = null;
    private array $config;
    private ?string $lastError = null;

    public function __construct(array $config)
    {
        $this->config = $config;
    }

    public function getConnection(): ?PDO
    {
        if ($this->pdo !== null) {
            return $this->pdo;
        }

        if (empty($this->config['db_name']) || empty($this->config['db_user'])) {
            $this->lastError = 'Database credentials are not configured yet (config.local.php missing or empty).';
            return null;
        }

        try {
            $dsn = sprintf(
                'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
                $this->config['db_host'] ?? 'localhost',
                $this->config['db_port'] ?? '3306',
                $this->config['db_name']
            );

            $this->pdo = new PDO($dsn, $this->config['db_user'], $this->config['db_password'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);

            $this->pdo->exec("SET time_zone = '+00:00'");
            $this->ensureSchema();
            return $this->pdo;
        } catch (Throwable $e) {
            $this->lastError = $e->getMessage();
            return null;
        }
    }

    public function getLastError(): ?string
    {
        return $this->lastError;
    }

    private function ensureSchema(): void
    {
        if ($this->pdo === null) {
            return;
        }

        // 1. Users table (Multi-user ready, personal login gate)
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS users (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                display_name VARCHAR(120) NOT NULL DEFAULT 'Owner',
                role VARCHAR(32) NOT NULL DEFAULT 'owner',
                custom_twelve_data_key VARCHAR(128) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // 2. Charts / Watchlist Registry table (Strict Chart & Source Isolation)
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS charts (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                user_id INT UNSIGNED NOT NULL DEFAULT 1,
                chart_id VARCHAR(96) NOT NULL,
                instrument_code VARCHAR(48) NOT NULL,
                symbol VARCHAR(48) NOT NULL,
                display_name VARCHAR(128) NOT NULL,
                category VARCHAR(32) NOT NULL DEFAULT 'oil',
                source_id VARCHAR(32) NOT NULL DEFAULT 'twelvedata',
                source_label VARCHAR(96) NOT NULL DEFAULT 'Twelve Data API',
                provider_symbol VARCHAR(64) NOT NULL,
                price_basis VARCHAR(32) NOT NULL DEFAULT 'Spot/Mid',
                default_timeframe VARCHAR(12) NOT NULL DEFAULT 'M15',
                custom_api_key VARCHAR(128) NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                sort_order INT NOT NULL DEFAULT 0,
                last_sync_at DATETIME NULL,
                last_status VARCHAR(32) NOT NULL DEFAULT 'READY',
                last_error VARCHAR(255) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_user_chart (user_id, chart_id),
                INDEX idx_user_active (user_id, is_active, sort_order)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // 3. Canonical Closed Candles table (DECIMAL(18,6), UTC timestamp, idempotent UPSERT)
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS candles (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                chart_id VARCHAR(96) NOT NULL,
                timeframe VARCHAR(12) NOT NULL,
                open_time_utc INT UNSIGNED NOT NULL,
                close_time_utc INT UNSIGNED NOT NULL,
                open_price DECIMAL(18,6) NOT NULL,
                high_price DECIMAL(18,6) NOT NULL,
                low_price DECIMAL(18,6) NOT NULL,
                close_price DECIMAL(18,6) NOT NULL,
                volume DECIMAL(22,6) NULL,
                source_id VARCHAR(32) NOT NULL,
                is_closed TINYINT(1) NOT NULL DEFAULT 1,
                quality_flag VARCHAR(24) NOT NULL DEFAULT 'VERIFIED',
                fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_chart_tf_time (chart_id, timeframe, open_time_utc),
                INDEX idx_chart_tf_lookup (chart_id, timeframe, open_time_utc DESC)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Ensure default owner user exists
        $defaultUser = $this->config['default_username'] ?? 'admin';
        $defaultPass = $this->config['default_password'] ?? 'manico2026';

        $stmt = $this->pdo->prepare("SELECT id FROM users WHERE username = :u LIMIT 1");
        $stmt->execute([':u' => $defaultUser]);
        if (!$stmt->fetch()) {
            $ins = $this->pdo->prepare("
                INSERT INTO users (username, password_hash, display_name, role)
                VALUES (:u, :p, :d, 'owner')
            ");
            $ins->execute([
                ':u' => $defaultUser,
                ':p' => password_hash($defaultPass, PASSWORD_DEFAULT),
                ':d' => 'مدیر سیستم (Personal Owner)',
            ]);
        }
    }
}
