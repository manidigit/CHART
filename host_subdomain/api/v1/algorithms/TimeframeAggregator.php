<?php
declare(strict_types=1);

namespace ChartIntelligence\Algorithms;

/**
 * Deterministic OHLCV timeframe aggregation anchored strictly at 00:00:00 UTC.
 */
final class TimeframeAggregator
{
    public static function aggregate(
        array $sourceCandles,
        string $targetTimeframe,
        int $nowMs,
        string $symbolCode = 'XAUUSD'
    ): array {
        return self::aggregateCandles($sourceCandles, $targetTimeframe, $nowMs, $symbolCode);
    }

    public static function aggregateCandles(
        array $sourceCandles,
        string $targetTimeframe,
        int $nowMs,
        string $symbolCode = 'XAUUSD'
    ): array {
        if (empty($sourceCandles)) {
            return [];
        }

        usort($sourceCandles, static fn(array $a, array $b): int => ($a['open_time_utc_ms'] ?? 0) <=> ($b['open_time_utc_ms'] ?? 0));

        $normTf = strtoupper($targetTimeframe);
        $sourceStepMs = self::inferSourceStepMs($sourceCandles);
        $targetStepMs = UtcTimeAnchor::stepMilliseconds($normTf);
        $minExpectedChildren = self::minExpectedChildren($sourceStepMs, $targetStepMs, $normTf, $symbolCode);

        $buckets = [];
        $bucketCloseMap = [];
        $sessionAnchoredMap = [];
        foreach ($sourceCandles as $bar) {
            $openMs = (int) ($bar['open_time_utc_ms'] ?? 0);
            if ($openMs <= 0) {
                continue;
            }
            $bounds = UtcTimeAnchor::getSessionBucketBounds($openMs, $normTf, $symbolCode);
            $bucketOpen = $bounds['open_ms'];
            $bucketClose = $bounds['close_ms'];
            if ($bucketClose > $nowMs) {
                continue;
            }
            $buckets[$bucketOpen][$openMs] = $bar;
            $bucketCloseMap[$bucketOpen] = max($bucketCloseMap[$bucketOpen] ?? 0, $bucketClose);
            if (!empty($bounds['session_anchored'])) {
                $sessionAnchoredMap[$bucketOpen] = true;
            }
        }

        ksort($buckets);
        $aggregated = [];
        $bucketKeys = array_keys($buckets);
        $lastKeyIdx = count($bucketKeys) - 1;

        foreach ($bucketKeys as $idx => $bucketOpen) {
            $barsMap = $buckets[$bucketOpen];
            if (empty($barsMap)) {
                continue;
            }
            // Prevent boundary-truncated leading/trailing partial buckets from being treated as complete bars
            if (($idx === 0 || $idx === $lastKeyIdx) && count($barsMap) < $minExpectedChildren) {
                continue;
            }

            ksort($barsMap);
            $bars = array_values($barsMap);
            if (!self::hasContiguousChildren($bars, $sourceStepMs, $normTf, $symbolCode)) {
                continue;
            }

            $first = $bars[0];
            $last = $bars[count($bars) - 1];

            $open = (float) $first['open'];
            $close = (float) $last['close'];
            $high = (float) $first['high'];
            $low = (float) $first['low'];
            $vol = 0.0;

            foreach ($bars as $item) {
                $h = (float) $item['high'];
                $l = (float) $item['low'];
                if ($h > $high) {
                    $high = $h;
                }
                if ($l < $low) {
                    $low = $l;
                }
                $vol += (float) ($item['volume'] ?? 0.0);
            }

            $sanitized = CandleValidator::sanitizeCandle(
                (int) $bucketOpen,
                $normTf,
                $open,
                $high,
                $low,
                $close,
                $vol,
                !empty($sessionAnchoredMap[$bucketOpen])
            );
            if ($sanitized !== null) {
                $aggregated[] = $sanitized;
            }
        }

        return $aggregated;
    }

    private static function inferSourceStepMs(array $sortedCandles): int
    {
        $minDiff = PHP_INT_MAX;
        $prev = null;
        $limit = min(40, count($sortedCandles));
        for ($i = 0; $i < $limit; $i++) {
            $ms = (int) ($sortedCandles[$i]['open_time_utc_ms'] ?? 0);
            if ($prev !== null && $ms > $prev) {
                $diff = $ms - $prev;
                if ($diff < $minDiff) {
                    $minDiff = $diff;
                }
            }
            $prev = $ms;
        }
        return $minDiff === PHP_INT_MAX ? UtcTimeAnchor::stepMilliseconds('M15') : $minDiff;
    }

    private static function minExpectedChildren(
        int $sourceStepMs,
        int $targetStepMs,
        string $targetTf,
        string $symbolCode
    ): int {
        if ($sourceStepMs <= 0 || $sourceStepMs >= $targetStepMs) {
            return 1;
        }
        $calendar = UtcTimeAnchor::getSessionCalendar($symbolCode);
        if ($targetTf === 'W1' && $sourceStepMs >= 86400000) {
            return $calendar === UtcTimeAnchor::CALENDAR_CRYPTO_24_7 ? 5 : 3;
        }
        if ($targetTf === 'D1' && $sourceStepMs < 86400000) {
            $fullCount = (int) floor($targetStepMs / $sourceStepMs);
            return $calendar === UtcTimeAnchor::CALENDAR_US_EQUITIES
                ? max(1, (int) floor($fullCount * 0.2))
                : max(2, (int) floor($fullCount * 0.5));
        }
        $ratio = (int) floor($targetStepMs / $sourceStepMs);
        return $calendar === UtcTimeAnchor::CALENDAR_US_EQUITIES
            ? max(1, (int) floor($ratio * 0.25))
            : max(2, (int) ceil($ratio * 0.5));
    }

    private static function hasContiguousChildren(
        array $bars,
        int $sourceStepMs,
        string $targetTf,
        string $symbolCode
    ): bool {
        if (count($bars) <= 1 || $sourceStepMs <= 0) {
            return true;
        }
        $calendar = UtcTimeAnchor::getSessionCalendar($symbolCode);
        $maxOpenGapSteps = ($targetTf === 'D1' || $targetTf === 'W1') ? 4 : 2;

        for ($i = 1, $n = count($bars); $i < $n; $i++) {
            $prevMs = (int) ($bars[$i - 1]['open_time_utc_ms'] ?? 0);
            $curMs = (int) ($bars[$i]['open_time_utc_ms'] ?? 0);
            $diffMs = $curMs - $prevMs;
            if ($diffMs <= $sourceStepMs * $maxOpenGapSteps) {
                continue;
            }
            if ($calendar === UtcTimeAnchor::CALENDAR_CRYPTO_24_7) {
                return false;
            }
            $openMissingSteps = 0;
            $probeMs = $prevMs + $sourceStepMs;
            $guard = 0;
            while ($probeMs < $curMs && $guard < 96) {
                if (UtcTimeAnchor::isMarketOpen($probeMs, $symbolCode)) {
                    $openMissingSteps++;
                    if ($openMissingSteps >= $maxOpenGapSteps) {
                        return false;
                    }
                }
                $probeMs += $sourceStepMs;
                $guard++;
            }
        }
        return true;
    }
}
