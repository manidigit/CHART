<?php
declare(strict_types=1);

/** Permanently disabled: Chronos-2 has no Cron, schedule, or queue execution path. */
http_response_code(410);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode([
    'status' => 'DISABLED',
    'message' => 'No Chronos-2 cron worker is configured or supported.',
], JSON_UNESCAPED_SLASHES) . PHP_EOL;
