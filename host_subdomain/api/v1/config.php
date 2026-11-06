<?php
/**
 * Chart Intelligence — Phase 1 Configuration Loader (v1.15)
 * Domain: https://chart.manico.es
 *
 * Loads local deployment secrets from config.local.php (generated automatically
 * by GitHub Actions during cPanel UAPI deploy from the 8 stored GitHub Secrets:
 * DB_NAME, DB_PASSWORD, DB_USER, TWELVE_DATA_API_KEY, etc.).
 */

declare(strict_types=1);

// Default configuration values (overridden by config.local.php on host)
$config = [
    'app_name'            => 'Chart Intelligence',
    'app_version'         => '1.15.0',
    'base_url'            => 'https://chart.manico.es',
    'db_host'             => getenv('DB_HOST') ?: 'localhost',
    'db_port'             => getenv('DB_PORT') ?: '3306',
    'db_name'             => getenv('DB_NAME') ?: '',
    'db_user'             => getenv('DB_USER') ?: '',
    'db_password'         => getenv('DB_PASSWORD') ?: '',
    'twelve_data_api_key' => getenv('TWELVE_DATA_API_KEY') ?: '',
    // Default personal owner credentials (stored hashed in MariaDB users table on init)
    'default_username'    => getenv('APP_OWNER_USER') ?: 'admin',
    'default_password'    => getenv('APP_OWNER_PASS') ?: 'manico2026',
    'auth_secret_salt'    => 'chart_manico_es_v1_15_secret_salt',
];

$localConfigFile = __DIR__ . '/config.local.php';
if (is_file($localConfigFile)) {
    $localOverrides = include $localConfigFile;
    if (is_array($localOverrides)) {
        $config = array_merge($config, $localOverrides);
    }
}

return $config;
