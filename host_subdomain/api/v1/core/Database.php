<?php
declare(strict_types=1);

namespace ChartIntelligence\Core;

use PDO;
use Throwable;

final class Database
{
    private static ?PDO $pdo = null;
    private static bool $initialized = false;

    public static function getConfig(): array
    {
        $envFile = dirname(__DIR__, 3) . '/config/env.local.php';
        if (is_file($envFile)) {
            $cfg = require $envFile;
            if (is_array($cfg)) {
                return $cfg;
            }
        }
        return [
            'DB_HOST' => getenv('DB_HOST') ?: 'localhost',
            'DB_NAME' => getenv('DB_NAME') ?: '',
            'DB_USER' => getenv('DB_USER') ?: '',
            'DB_PASSWORD' => getenv('DB_PASSWORD') ?: '',
            'TWELVE_DATA_API_KEY' => getenv('TWELVE_DATA_API_KEY') ?: '',
        ];
    }

    public static function getPdo(): ?PDO
    {
        if (self::$initialized) {
            return self::$pdo;
        }
        self::$initialized = true;
        $cfg = self::getConfig();
        if (empty($cfg['DB_NAME']) || empty($cfg['DB_USER'])) {
            return null;
        }
        try {
            $dsn = sprintf(
                'mysql:host=%s;dbname=%s;charset=utf8mb4',
                $cfg['DB_HOST'] ?? 'localhost',
                $cfg['DB_NAME']
            );
            $pdo = new PDO($dsn, $cfg['DB_USER'], $cfg['DB_PASSWORD'] ?? '', [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            self::ensureSchemaInitialized($pdo);
            self::$pdo = $pdo;
            return self::$pdo;
        } catch (Throwable) {
            return null;
        }
    }

    private static function ensureSchemaInitialized(PDO $pdo): void
    {
        $migrationsDir = dirname(__DIR__, 3) . '/migrations';
        $files = [
            $migrationsDir . '/001_phase1_init.sql',
            $migrationsDir . '/002_phase2_3_tables.sql',
            $migrationsDir . '/003_phase4_forecast_tables.sql',
        ];
        foreach ($files as $sqlFile) {
            if (!is_file($sqlFile)) {
                continue;
            }
            $sql = file_get_contents($sqlFile);
            if ($sql === false) {
                continue;
            }
            $statements = array_filter(array_map('trim', explode(';', $sql)));
            foreach ($statements as $stmt) {
                if ($stmt !== '') {
                    $pdo->exec($stmt);
                }
            }
        }
    }
}
