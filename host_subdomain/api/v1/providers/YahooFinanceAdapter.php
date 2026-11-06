<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Algorithms\UtcTimeAnchor;

final class YahooFinanceAdapter
{
    public static function fetchClosedCandles(string $symbol, string $timeframe, int $limit, int $nowMs): array
    {
        $ticker = match (strtoupper($symbol)) {
            'SPOTBRENT', 'BRENT_FUTURES' => 'BZ=F',
            'XAUUSD' => 'GC=F',
            'XAGUSD' => 'SI=F',
            'EURUSD' => 'EURUSD=X',
            default => $symbol,
        };
        $interval = strtoupper($timeframe) === 'D1' ? '1d' : '15m';
        $range = $interval === '1d' ? '6mo' : '5d';
        $url = sprintf(
            'https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=%s&range=%s',
            urlencode($ticker),
            $interval,
            $range
        );
        $ctx = stream_context_create([
            'http' => [
                'timeout' => 7,
                'header' => "User-Agent: Mozilla/5.0 (ChartIntelligence/1.0)\r\n",
            ],
        ]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) {
            return [];
        }
        $json = json_decode($raw, true);
        $res = $json['chart']['result'][0] ?? null;
        if (!is_array($res) || empty($res['timestamp'])) {
            return [];
        }
        $timestamps = $res['timestamp'];
        $quote = $res['indicators']['quote'][0] ?? [];
        $candles = [];
        foreach ($timestamps as $i => $tsSec) {
            if (!isset($quote['open'][$i], $quote['high'][$i], $quote['low'][$i], $quote['close'][$i])) {
                continue;
            }
            $openMs = ((int) $tsSec) * 1000;
            if (!UtcTimeAnchor::isCandleClosed($openMs, $timeframe, $nowMs)) {
                continue;
            }
            $c = CandleValidator::sanitizeCandle(
                $openMs,
                $timeframe,
                $quote['open'][$i],
                $quote['high'][$i],
                $quote['low'][$i],
                $quote['close'][$i],
                $quote['volume'][$i] ?? 0
            );
            if ($c !== null) {
                $candles[$c['open_time_utc_ms']] = $c;
            }
        }
        ksort($candles);
        return array_slice(array_values($candles), -$limit);
    }
}
