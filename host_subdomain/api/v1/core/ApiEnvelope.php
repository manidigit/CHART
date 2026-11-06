<?php
declare(strict_types=1);

namespace ChartIntelligence\Core;

final class ApiEnvelope
{
    public static function sendSuccess(array $data, string $messageKey = 'status_synced_ok'): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        echo json_encode([
            'ok' => true,
            'message_key' => $messageKey,
            'timestamp_utc' => gmdate('Y-m-d\TH:i:s\Z'),
            'data' => $data,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function sendError(string $errorCode, string $messageKey, int $httpStatus = 400): void
    {
        http_response_code($httpStatus);
        header('Content-Type: application/json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        echo json_encode([
            'ok' => false,
            'error_code' => $errorCode,
            'message_key' => $messageKey,
            'timestamp_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}
