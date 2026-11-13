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

    /**
     * DST- & session-calendar-aware bucket open/close resolver (ENG-01).
     * - CRYPTO_24_7: always 00:00 UTC anchored.
     * - US_EQUITIES: H1/H4/D1 aligned to 09:30 America/New_York regular session (with DST).
     * - OTC_FX_METALS: D1 aligned to NY 17:00 rollover (17:00 prev day -> 17:00 day); intraday stays UTC.
     *
     * @return array{open_ms: int, close_ms: int, session_anchored: bool}
     */
    public static function getSessionBucketBounds(int $epochMs, string $timeframe, string $symbolCode = 'XAUUSD'): array
    {
        $tf = strtoupper($timeframe);
        $step = self::stepMilliseconds($tf);
        $cal = self::getSessionCalendar($symbolCode);

        if ($tf === 'W1' || $cal === self::CALENDAR_CRYPTO_24_7 || $tf === 'M15' || $tf === 'M30') {
            $openMs = self::snapToOpenUtcMs($epochMs, $tf);
            return [
                'open_ms' => $openMs,
                'close_ms' => $openMs + $step,
                'session_anchored' => false,
            ];
        }

        try {
            $nyTz = new \DateTimeZone('America/New_York');
            $dtNy = (new \DateTimeImmutable('@' . intdiv($epochMs, 1000)))->setTimezone($nyTz);

            if ($cal === self::CALENDAR_US_EQUITIES) {
                $sessionDate = $dtNy->format('Y-m-d');
                $sessionStart = new \DateTimeImmutable($sessionDate . ' 09:30:00', $nyTz);
                $sessionEnd = new \DateTimeImmutable($sessionDate . ' 16:00:00', $nyTz);
                $sessionStartMs = $sessionStart->getTimestamp() * 1000;
                $sessionEndMs = $sessionEnd->getTimestamp() * 1000;

                if ($tf === 'D1') {
                    // Canonical D1 key stays aligned to UTC midnight for stable daily display while close respects 16:00 ET
                    $utcDayOpenMs = self::snapToOpenUtcMs($epochMs, 'D1');
                    return [
                        'open_ms' => $utcDayOpenMs,
                        'close_ms' => max($utcDayOpenMs + 1, $sessionEndMs),
                        'session_anchored' => true,
                    ];
                }

                // Regular US Equities H1 (09:30, 10:30, ..., 15:30 ET) & H4 (09:30, 13:30 ET)
                if ($epochMs >= $sessionStartMs && $epochMs < $sessionEndMs) {
                    $offsetMs = $epochMs - $sessionStartMs;
                    $bucketIdx = intdiv($offsetMs, $step);
                    $openMs = $sessionStartMs + ($bucketIdx * $step);
                    $closeMs = min($sessionEndMs, $openMs + $step);
                    return [
                        'open_ms' => $openMs,
                        'close_ms' => $closeMs,
                        'session_anchored' => true,
                    ];
                }

                // Extended/off-session fallback anchored to 09:30 ET step grid
                $bucketIdx = (int) floor(($epochMs - $sessionStartMs) / $step);
                $openMs = $sessionStartMs + ($bucketIdx * $step);
                return [
                    'open_ms' => $openMs,
                    'close_ms' => $openMs + $step,
                    'session_anchored' => true,
                ];
            }

            if ($cal === self::CALENDAR_OTC_FX_METALS && $tf === 'D1') {
                // NY 17:00 rollover day key, anchored at UTC midnight for D1 display while closing at 17:00 NY
                $shiftedNy = $dtNy->modify('+7 hours');
                $tradeDate = $shiftedNy->format('Y-m-d');
                $rolloverClose = new \DateTimeImmutable($tradeDate . ' 17:00:00', $nyTz);
                $utcDayOpenMs = (new \DateTimeImmutable($tradeDate . ' 00:00:00', new \DateTimeZone('UTC')))->getTimestamp() * 1000;
                return [
                    'open_ms' => $utcDayOpenMs,
                    'close_ms' => $rolloverClose->getTimestamp() * 1000,
                    'session_anchored' => true,
                ];
            }
        } catch (\Throwable) {
            // Fall through to standard UTC snapping
        }

        $openMs = self::snapToOpenUtcMs($epochMs, $tf);
        return [
            'open_ms' => $openMs,
            'close_ms' => $openMs + $step,
            'session_anchored' => false,
        ];
    }

    public static function snapToSessionOpenUtcMs(int $epochMs, string $timeframe, string $symbolCode = 'XAUUSD'): int
    {
        $bounds = self::getSessionBucketBounds($epochMs, $timeframe, $symbolCode);
        return $bounds['open_ms'];
    }

    public static function snapToCandleOpenUtc(int $epochMs, string $timeframe): int
    {
        return self::snapToOpenUtcMs($epochMs, $timeframe);
    }

    public static function isCandleClosed(
        int $openTimeUtcMs,
        string $timeframe,
        ?int $nowUtcMs = null,
        string $symbolCode = 'XAUUSD'
    ): bool {
        $now = $nowUtcMs ?? (int) round(microtime(true) * 1000);
        $bounds = self::getSessionBucketBounds($openTimeUtcMs, $timeframe, $symbolCode);
        if ($bounds['session_anchored']) {
            return $bounds['close_ms'] <= $now;
        }
        $step = self::stepMilliseconds($timeframe);
        return ($openTimeUtcMs + $step) <= $now;
    }

    public static function getSessionCalendar(string $symbolCode = 'XAUUSD'): string
    {
        $code = strtoupper(trim($symbolCode));
        $cryptoPrefixes = [
            'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'BNB', 'AVAX',
            'DOT', 'LINK', 'LTC', 'MATIC', 'SHIB', 'TON', 'TRX', 'UNI',
        ];
        $hasCryptoPrefix = false;
        foreach ($cryptoPrefixes as $prefix) {
            if (str_starts_with($code, $prefix)) {
                $hasCryptoPrefix = true;
                break;
            }
        }
        if (
            in_array($code, ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'DOGEUSD', 'ADAUSD', 'BNBUSD'], true)
            || str_ends_with($code, 'USDT')
            || ($hasCryptoPrefix && (str_ends_with($code, 'USD') || str_ends_with($code, 'USDT') || str_ends_with($code, 'EUR')))
        ) {
            return self::CALENDAR_CRYPTO_24_7;
        }
        if (
            in_array($code, self::US_EQUITIES_SYMBOLS, true)
            || str_contains($code, 'SPX')
            || str_contains($code, 'NAS')
            || str_contains($code, 'NDQ')
            || str_contains($code, 'NDX')
            || str_contains($code, 'US100')
            || str_contains($code, 'US500')
            || str_contains($code, 'US30')
            || str_contains($code, 'DJ30')
        ) {
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
        try {
            $nyTz = new \DateTimeZone('America/New_York');
            $dtNy = (new \DateTimeImmutable('@' . $sec))->setTimezone($nyTz);
            $dowNy = (int) $dtNy->format('N'); // 1 (Mon) .. 5 (Fri), 6 (Sat), 7 (Sun)
            $hourNy = (int) $dtNy->format('G'); // 0 .. 23 NY
            if ($dowNy === 6) {
                return true;
            }
            if ($dowNy === 7) {
                return $hourNy < 17;
            }
            if ($dowNy === 5) {
                return $hourNy >= 17;
            }
            return false;
        } catch (\Throwable) {
            $dow = (int) gmdate('N', $sec);
            $hour = (int) gmdate('G', $sec);
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

