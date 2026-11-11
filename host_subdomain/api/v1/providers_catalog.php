<?php
declare(strict_types=1);

require_once __DIR__ . '/core/ApiEnvelope.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/providers/ProviderCatalog.php';

use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;
use ChartIntelligence\Providers\ProviderCatalog;

$pdo = Database::getPdo();
$methods = ProviderCatalog::getMethods();
$symbols = ProviderCatalog::getSymbolsDirectory();
$storageMatrix = ProviderCatalog::getDatabaseStorageMatrix($pdo);

ApiEnvelope::sendSuccess([
    'version' => '1.31.0',
    'sync_policy' => 'DB_FIRST_DELTA_SYNC',
    'provider_isolation' => 'STRICT_KEY_SEPARATION_NO_SILENT_FALLBACK',
    'methods' => $methods,
    'symbols' => $symbols,
    'storage_matrix' => $storageMatrix,
]);
