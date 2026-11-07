<?php
declare(strict_types=1);

namespace ChartIntelligence\Algorithms;

/**
 * Deterministic OHLCV timeframe aggregation anchored strictly at 00:00:00 UTC.
 */
final class TimeframeAggregator
{
    public static function aggregateCandles(array $sourceCandles, string $targetTimeframe, int $nowMs): array
    {
        if (empty($sourceCandles)) {
            return [];
        }

        usort($sourceCandles, static fn(array $a, array $b): int => ($a['open_time_utc_ms'] ?? 0) <=> ($b['open_time_utc_ms'] ?? 0));

        $targetStep = UtcTimeAnchor::stepMilliseconds($targetTimeframe);
        $buckets = [];

        foreach ($sourceCandles as $bar) {
            $openMs = (int) ($bar['open_time_utc_ms'] ?? 0);
            if ($openMs <= 0) {
                continue;
            }
            $bucketOpen = intdiv($openMs, $targetStep) * $targetStep;
            if (!UtcTimeAnchor::isCandleClosed($bucketOpen, $targetTimeframe, $nowMs)) {
                continue;
            }
            $buckets[$bucketOpen][$openMs] = $bar;
        }

        ksort($buckets);
        $aggregated = [];

        foreach ($buckets as $bucketOpen => $barsMap) {
            if (empty($barsMap)) {
                continue;
            }
            ksort($barsMap);
            $bars = array_values($barsMap);
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
                $targetTimeframe,
                $open,
                $high,
                $low,
                $close,
                $vol
            );
            if ($sanitized !== null) {
                $aggregated[] = $sanitized;
            }
        }

        return $aggregated;
    }
}
