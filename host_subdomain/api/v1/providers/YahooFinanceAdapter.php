<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Algorithms\TimeframeAggregator;
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
        $normTf = strtoupper($timeframe);
        [$interval, $range, $sourceTf] = match ($normTf) {
            'D1' => ['1d', '1y', 'D1'],
            'H4' => ['60m', '3mo', 'H1'],
            'H1' => ['60m', '1mo', 'H1'],
            default => ['15m', '5d', 'M15'],
        };

        $url = sprintf(
            'https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=%s&range=%s',
            urlencode($ticker),
            $interval,
            $range
        );
        $ctx = stream_context_create([
            'http' => [
                'timeout' => 8,
                'header' => "User-Agent: Mozilla/5.0 (ChartIntelligence/1.23)\r\n",
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
            if (!UtcTimeAnchor::isCandleClosed($openMs, $sourceTf, $nowMs)) {
                continue;
            }
            $c = CandleValidator::sanitizeCandle(
                $openMs,
                $sourceTf,
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
        $ordered = array_values($candles);
        if ($normTf === 'H4') {
            $ordered = TimeframeAggregator::aggregateCandles($ordered, 'H4', $nowMs);
        }
        return array_slice($ordered, -$limit);
    }
}
