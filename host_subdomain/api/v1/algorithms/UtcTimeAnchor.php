<?php
declare(strict_types=1);

namespace ChartIntelligence\Algorithms;

/**
 * Independent Backend Algorithm Module:
 * Snaps timestamps to 00:00:00 UTC candle boundaries, filters out incomplete candles,
 * and detects OTC weekend market closure windows.
 */
final class UtcTimeAnchor
{
    private const OTC_WEEKEND_SYMBOLS = [
        'XAUUSD',
        'XAGUSD',
        'EURUSD',
        'SPOTBRENT',
        'BRENT_FUTURES',
    ];

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

    public static function snapToCandleOpenUtc(int $epochMs, string $timeframe): int
    {
        return self::snapToOpenUtcMs($epochMs, $timeframe);
    }

    public static function isCandleClosed(int $openTimeUtcMs, string $timeframe, ?int $nowUtcMs = null): bool
    {
        $now = $nowUtcMs ?? (int) round(microtime(true) * 1000);
        $step = self::stepMilliseconds($timeframe);
        return ($openTimeUtcMs + $step) <= $now;
    }

    public static function isOtcWeekendClosed(int $epochMs, string $symbolCode = 'XAUUSD'): bool
    {
        $code = strtoupper(trim($symbolCode));
        if (!in_array($code, self::OTC_WEEKEND_SYMBOLS, true) && !str_starts_with($code, 'XAU') && !str_starts_with($code, 'EUR')) {
            return false;
        }
        $sec = intdiv($epochMs, 1000);
        $dow = (int) gmdate('N', $sec); // 1 (Mon) .. 5 (Fri), 6 (Sat), 7 (Sun)
        $hour = (int) gmdate('G', $sec); // 0 .. 23 UTC
        if ($dow === 6) {
            return true;
        }
        if ($dow === 7) {
            return $hour < 22;
        }
        if ($dow === 5) {
            return $hour >= 22;
        }
        return false;
    }
}
