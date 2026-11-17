<?php
declare(strict_types=1);

/**
 * DEPRECATED / DISABLED: Chronos-2 Cron Queue Worker
 * ==================================================
 * By system architecture decision, Chronos-2 execution is strictly ON-DEMAND
 * per explicit user click. No cron jobs or scheduled tasks are used or required.
 */

require_once __DIR__ . '/../api/v1/core/Chronos2QueueManager.php';

use ChartIntelligence\Core\Chronos2QueueManager;

$report = Chronos2QueueManager::processQueueBatch();

echo json_encode([
    'timestamp_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    'worker'        => 'cron_process_chronos2_queue',
    'status'        => 'DISABLED',
    'message'       => 'Cron queue processing is disabled. Chronos-2 runs strictly on-demand per user click.',
    'report'        => $report,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;

