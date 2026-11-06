<?php
declare(strict_types=1);

namespace ChartIntelligence\Algorithms;

/**
 * Independent Backend Algorithm Module:
 * Snaps timestamps to 00:00:00 UTC candle boundaries and filters out incomplete candles.
 */
final class UtcTimeAnchor
{
    public static function stepMilliseconds(string $timeframe): int
    {
        return match (strtoupper($timeframe)) {
            'M15' => 15 * 60 * 1000,
            'M30' => 30 * 60 * 1000,
            'H1'  => 60 * 60 * 1000,
            'H4'  => 4 * 60 * 60 * 1000,
            'D1'  => 24 * 60 * 60 * 1000,
            default => 15 * 60 * 1000,
        };
    }

    public static function snapToOpenUtcMs(int $epochMs, string $timeframe): int
    {
        $step = self::stepMilliseconds($timeframe);
        return intdiv($epochMs, $step) * $step;
    }

    public static function isCandleClosed(int $openTimeUtcMs, string $timeframe, ?int $nowUtcMs = null): bool
    {
        $now = $nowUtcMs ?? (int) round(microtime(true) * 1000);
        $step = self::stepMilliseconds($timeframe);
        return ($openTimeUtcMs + $step) <= $now;
    }
}
