<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

final class DukascopyAdapter
{
    public static function fetchClosedCandles(string $symbol, string $timeframe, int $limit, int $nowMs): array
    {
        return YahooFinanceAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs);
    }
}
