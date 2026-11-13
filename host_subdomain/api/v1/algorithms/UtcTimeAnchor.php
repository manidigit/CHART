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
    public const CALENDAR_CRYPTO_24_7 = 'CRYPTO_24_7';
    public const CALENDAR_OTC_FX_METALS = 'OTC_FX_METALS';
    public const CALENDAR_US_EQUITIES = 'US_EQUITIES';

    private const EPOCH_MONDAY_OFFSET_MS = 259200000; // 3 days * 86400s * 1000ms (1970-01-01 was Thursday)

    private const OTC_WEEKEND_SYMBOLS = [
        'XAUUSD',
        'XAGUSD',
        'EURUSD',
        'GBPUSD',
        'USDJPY',
        'SPOTBRENT',
        'BRENT_FUTURES',
        'USOIL',
    ];

    private const US_EQUITIES_SYMBOLS = [
        'SPX500USD',
        'NDQ',
        'NVDA',
        'AMZN',
        'TSLA',
        'AAPL',
        'GOOGL',
        'MSFT',
        'META',
        'NFLX',
        'AMD',
        'UBER',
        'NKE',
        'IBM',
        'SAN',
    ];

    public static function stepMilliseconds(string $timeframe): int
    {
        return match (strtoupper($timeframe)) {
            'M15' => 15 * 60 * 1000,
            'M30' => 30 * 60 * 1000,
            'H1'  => 60 * 60 * 1000,
            'H4'  => 4 * 60 * 60 * 1000,
            'D1'  => 24 * 60 * 60 * 1000,
            'W1'  => 7 * 24 * 60 * 60 * 1000,
            default => 15 * 60 * 1000,
        };
    }

    public static function snapToOpenUtcMs(int $epochMs, string $timeframe): int
    {
        $tf = strtoupper($timeframe);
        $step = self::stepMilliseconds($tf);
        if ($tf === 'W1') {
            return (int) (floor(($epochMs + self::EPOCH_MONDAY_OFFSET_MS) / $step) * $step) - self::EPOCH_MONDAY_OFFSET_MS;
        }
        return (int) (floor($epochMs / $step) * $step);
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

    public static function getSessionCalendar(string $symbolCode = 'XAUUSD'): string
    {
        $code = strtoupper(trim($symbolCode));
        if (in_array($code, ['BTCUSD', 'ETHUSD'], true) || str_ends_with($code, 'USDT')) {
            return self::CALENDAR_CRYPTO_24_7;
        }
        if (in_array($code, self::US_EQUITIES_SYMBOLS, true)) {
            return self::CALENDAR_US_EQUITIES;
        }
        return self::CALENDAR_OTC_FX_METALS;
    }

    public static function getInstrumentTimezone(string $symbolCode = 'XAUUSD'): string
    {
        return match (self::getSessionCalendar($symbolCode)) {
            self::CALENDAR_CRYPTO_24_7 => 'UTC',
            self::CALENDAR_US_EQUITIES => 'America/New_York',
            default => 'Etc/GMT+0 (NY 17:00 Rollover)',
        };
    }

    public static function getVolumeType(string $symbolCode, string $providerId): string
    {
        $prov = strtolower(trim($providerId));
        $cal = self::getSessionCalendar($symbolCode);
        if ($prov === 'eia_brent_spot') {
            return 'NONE';
        }
        if ($cal === self::CALENDAR_CRYPTO_24_7 || $cal === self::CALENDAR_US_EQUITIES) {
            return in_array($prov, ['yahoo_finance', 'twelve_data', 'stooq', 'tvdatafeed', 'biquote'], true)
                ? 'REAL_EXCHANGE'
                : 'TICK_ESTIMATED';
        }
        return 'TICK_ESTIMATED';
    }

    public static function isOtcWeekendSymbol(string $symbolCode = 'XAUUSD'): bool
    {
        $code = strtoupper(trim($symbolCode));
        if (self::getSessionCalendar($code) === self::CALENDAR_CRYPTO_24_7) {
            return false;
        }
        return in_array($code, self::OTC_WEEKEND_SYMBOLS, true)
            || in_array($code, self::US_EQUITIES_SYMBOLS, true)
            || str_starts_with($code, 'XAU')
            || str_starts_with($code, 'XAG')
            || str_starts_with($code, 'EUR');
    }

    public static function isOtcWeekendClosed(int $epochMs, string $symbolCode = 'XAUUSD'): bool
    {
        $cal = self::getSessionCalendar($symbolCode);
        if ($cal === self::CALENDAR_CRYPTO_24_7) {
            return false;
        }
        $sec = intdiv($epochMs, 1000);
        if ($cal === self::CALENDAR_US_EQUITIES) {
            return !self::isUsEquitySessionOpen($sec);
        }
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

    public static function isMarketOpen(int $epochMs, string $symbolCode = 'XAUUSD'): bool
    {
        return !self::isOtcWeekendClosed($epochMs, $symbolCode);
    }

    public static function getSessionDayKey(int $epochMs, string $symbolCode = 'XAUUSD'): string
    {
        $sec = intdiv($epochMs, 1000);
        $cal = self::getSessionCalendar($symbolCode);
        if ($cal === self::CALENDAR_CRYPTO_24_7) {
            return gmdate('Y-m-d', $sec);
        }
        try {
            $nyTz = new \DateTimeZone('America/New_York');
            $dt = (new \DateTimeImmutable('@' . $sec))->setTimezone($nyTz);
            if ($cal === self::CALENDAR_OTC_FX_METALS) {
                $dt = $dt->modify('+7 hours');
            }
            return $dt->format('Y-m-d');
        } catch (\Throwable) {
            return gmdate('Y-m-d', $sec);
        }
    }

    private static function isUsEquitySessionOpen(int $epochSec): bool
    {
        try {
            $nyTz = new \DateTimeZone('America/New_York');
            $dt = (new \DateTimeImmutable('@' . $epochSec))->setTimezone($nyTz);
            $dow = (int) $dt->format('N'); // 1..5 Mon-Fri
            if ($dow >= 6) {
                return false;
            }
            $mins = ((int) $dt->format('G') * 60) + (int) $dt->format('i');
            return $mins >= (9 * 60 + 30) && $mins < (16 * 60);
        } catch (\Throwable) {
            $dow = (int) gmdate('N', $epochSec);
            return $dow <= 5;
        }
    }
}

