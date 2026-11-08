<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Algorithms\UtcTimeAnchor;
use ChartIntelligence\Core\Database;

final class TwelveDataAdapter
{
    public static function fetchClosedCandles(string $symbol, string $timeframe, int $limit, int $nowMs): array
    {
        $cfg = Database::getConfig();
        $apiKey = trim((string) ($cfg['TWELVE_DATA_API_KEY'] ?? ''));
        if ($apiKey === '') {
            return self::fetchFallbackRealCandles($symbol, $timeframe, $limit, $nowMs);
        }

        $apiSymbol = match (strtoupper($symbol)) {
            'XAUUSD' => 'XAU/USD',
            'SPOTBRENT', 'BRENT_FUTURES' => 'XBR/USD',
            'XAGUSD' => 'XAG/USD',
            'EURUSD' => 'EUR/USD',
            default => $symbol,
        };
        $interval = match (strtoupper($timeframe)) {
            'M15' => '15min',
            'M30' => '30min',
            'H1' => '1h',
            'H4' => '4h',
            'D1' => '1day',
            default => '15min',
        };

        $url = sprintf(
            'https://api.twelvedata.com/time_series?symbol=%s&interval=%s&outputsize=%d&timezone=UTC&apikey=%s',
            urlencode($apiSymbol),
            urlencode($interval),
            $limit,
            urlencode($apiKey)
        );

        $ctx = stream_context_create(['http' => ['timeout' => 8]]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) {
            return self::fetchFallbackRealCandles($symbol, $timeframe, $limit, $nowMs);
        }
        $json = json_decode($raw, true);
        if (!is_array($json) || empty($json['values']) || !is_array($json['values'])) {
            return self::fetchFallbackRealCandles($symbol, $timeframe, $limit, $nowMs);
        }

        $candles = [];
        foreach ($json['values'] as $row) {
            $ts = strtotime(($row['datetime'] ?? '') . ' UTC');
            if ($ts === false) {
                continue;
            }
            $openMs = $ts * 1000;
            if (!UtcTimeAnchor::isCandleClosed($openMs, $timeframe, $nowMs)) {
                continue;
            }
            $c = CandleValidator::sanitizeCandle(
                $openMs,
                $timeframe,
                $row['open'] ?? 0,
                $row['high'] ?? 0,
                $row['low'] ?? 0,
                $row['close'] ?? 0,
                $row['volume'] ?? 0
            );
            if ($c !== null) {
                $candles[$c['open_time_utc_ms']] = $c;
            }
        }
        ksort($candles);
        $filtered = CandleValidator::filterSyntheticWeekendAndCombCandles(
            array_values($candles),
            $symbol,
            $timeframe
        );
        if (count($filtered) >= 5) {
            return $filtered;
        }
        return self::fetchFallbackRealCandles($symbol, $timeframe, $limit, $nowMs);
    }

    private static function fetchFallbackRealCandles(string $symbol, string $timeframe, int $limit, int $nowMs): array
    {
        $tvCandles = TvDatafeedAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs);
        $tvFiltered = CandleValidator::filterSyntheticWeekendAndCombCandles($tvCandles, $symbol, $timeframe);
        if (count($tvFiltered) >= 5) {
            return $tvFiltered;
        }
        $yahooCandles = YahooFinanceAdapter::fetchClosedCandles($symbol, $timeframe, $limit, $nowMs);
        return CandleValidator::filterSyntheticWeekendAndCombCandles($yahooCandles, $symbol, $timeframe);
    }
}
