<?php
declare(strict_types=1);

namespace ChartIntelligence\Algorithms;

/**
 * Independent Backend Algorithm Module:
 * Enforces OHLC invariants and DECIMAL(18,8) formatting without floating-point drift.
 */
final class CandleValidator
{
    public static function sanitizeCandle(
        int $rawOpenMs,
        string $timeframe,
        float|string $open,
        float|string $high,
        float|string $low,
        float|string $close,
        float|string $volume = 0.0
    ): ?array {
        $o = (float) $open;
        $c = (float) $close;
        if ($o <= 0.0 || $c <= 0.0) {
            return null;
        }
        $h = max((float) $high, $o, $c);
        $l = min((float) $low, $o, $c);
        $v = max(0.0, (float) $volume);
        $snappedMs = UtcTimeAnchor::snapToOpenUtcMs($rawOpenMs, $timeframe);

        return [
            'open_time_utc_ms' => $snappedMs,
            'open_time_utc_iso' => gmdate('Y-m-d H:i \U\T\C', intdiv($snappedMs, 1000)),
            'open' => number_format($o, 8, '.', ''),
            'high' => number_format($h, 8, '.', ''),
            'low' => number_format($l, 8, '.', ''),
            'close' => number_format($c, 8, '.', ''),
            'volume' => number_format($v, 8, '.', ''),
            'is_closed' => true,
        ];
    }
}
