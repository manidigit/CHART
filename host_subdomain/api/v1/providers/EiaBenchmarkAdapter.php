<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Algorithms\UtcTimeAnchor;

final class EiaBenchmarkAdapter
{
    public static function fetchClosedCandles(string $symbol, int $limit, int $nowMs): array
    {
        $url = 'https://datahub.io/core/oil-prices/r/brent-daily.csv';
        $ctx = stream_context_create(['http' => ['timeout' => 7]]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) {
            return [];
        }
        $lines = array_slice(array_filter(explode("\n", trim($raw))), -($limit + 1));
        $candles = [];
        $prevClose = null;
        foreach ($lines as $line) {
            $parts = str_getcsv($line);
            if (count($parts) < 2 || !is_numeric($parts[1])) {
                continue;
            }
            $ts = strtotime($parts[0] . ' 00:00:00 UTC');
            if ($ts === false) {
                continue;
            }
            $openMs = $ts * 1000;
            if (!UtcTimeAnchor::isCandleClosed($openMs, 'D1', $nowMs)) {
                continue;
            }
            $close = (float) $parts[1];
            $open = $prevClose ?? $close;
            $high = max($open, $close) + 0.35;
            $low = min($open, $close) - 0.35;
            $c = CandleValidator::sanitizeCandle($openMs, 'D1', $open, $high, $low, $close, 1000.0);
            if ($c !== null) {
                $candles[$c['open_time_utc_ms']] = $c;
            }
            $prevClose = $close;
        }
        ksort($candles);
        return array_values($candles);
    }
}
