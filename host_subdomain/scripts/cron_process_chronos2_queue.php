<?php
declare(strict_types=1);

/**
 * Cron Queue Worker for Chronos-2 Forecast Jobs
 * =============================================
 * Crontab schedule example (every minute):
 *   * * * * * /usr/bin/php /path/to/host_subdomain/scripts/cron_process_chronos2_queue.php >> /tmp/chronos2_cron.log 2>&1
 *
 * Enforces single-instance execution via `flock` mutex in `Chronos2QueueManager`
 * so at most one `amazon/chronos-2` process runs at any moment.
 */

require_once __DIR__ . '/../api/v1/core/Database.php';
require_once __DIR__ . '/../api/v1/core/Chronos2QueueManager.php';
require_once __DIR__ . '/../api/v1/algorithms/UtcTimeAnchor.php';
require_once __DIR__ . '/../api/v1/algorithms/CandleValidator.php';
require_once __DIR__ . '/../api/v1/algorithms/TimeframeAggregator.php';
require_once __DIR__ . '/../api/v1/providers/ProviderCatalog.php';
require_once __DIR__ . '/../api/v1/providers/TvDatafeedAdapter.php';

use ChartIntelligence\Core\Chronos2QueueManager;

$maxJobs = isset($argv[1]) ? max(1, min(10, (int) $argv[1])) : 2;
$report = Chronos2QueueManager::processQueueBatch($maxJobs);

echo json_encode([
    'timestamp_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    'worker'        => 'cron_process_chronos2_queue',
    'model_id'      => Chronos2QueueManager::MODEL_ID,
    'revision_sha'  => Chronos2QueueManager::MODEL_REVISION,
    'report'        => $report,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
