<?php
declare(strict_types=1);

/**
 * Chronos-2 execution through PHP is disabled.
 * The website reads only validated static JSON published by the manual GitHub Actions workflow.
 */
http_response_code(410);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
echo json_encode([
    'ok' => false,
    'error_code' => 'FORECAST_STATIC_CACHE_ONLY',
    'message' => 'Chronos-2 is generated manually through GitHub Actions. This endpoint does not execute a model.',
], JSON_UNESCAPED_SLASHES);
