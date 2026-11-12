<?php
declare(strict_types=1);

namespace ChartIntelligence\Core;

final class ApiEnvelope
{
    private const ALLOWED_ORIGINS = [
        'https://chart.manico.es',
        'http://chart.manico.es',
    ];

    public static function sendCorsAndSecurityHeaders(string $methods = 'GET, POST, OPTIONS'): void
    {
        if (headers_sent()) {
            return;
        }
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('Access-Control-Allow-Methods: ' . $methods);
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Provider-Api-Key');

        $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
        if ($origin !== '') {
            $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
            $isTrusted = in_array($origin, self::ALLOWED_ORIGINS, true)
                || preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#i', $origin) === 1
                || preg_match('#^https://[a-z0-9-]+\.run\.app$#i', $origin) === 1
                || ($host !== '' && preg_match('#^https?://' . preg_quote($host, '#') . '$#i', $origin) === 1);
            if ($isTrusted) {
                header('Access-Control-Allow-Origin: ' . $origin);
                header('Vary: Origin');
            }
        }
    }

    public static function sendSuccess(array $data, string $messageKey = 'status_synced_ok'): void
    {
        self::sendCorsAndSecurityHeaders();
        header('Content-Type: application/json; charset=utf-8');
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
        self::sendCorsAndSecurityHeaders();
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'ok' => false,
            'error_code' => $errorCode,
            'message_key' => $messageKey,
            'timestamp_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

