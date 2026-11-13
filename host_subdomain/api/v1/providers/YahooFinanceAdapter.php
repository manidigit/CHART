<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Algorithms\TimeframeAggregator;
use ChartIntelligence\Algorithms\UtcTimeAnchor;

/**
 * Isolated Provider Adapter for Yahoo Finance v8 Chart Engine (`yahoo_finance`).
 *
 * Supports incremental `DELTA_SYNC` (`$sinceOpenMs > 0`): when historical candles are already
 * stored in MariaDB, selects a minimal range (`1d` or `5d`) and filters strictly to bars
 * newer than `$sinceOpenMs`.
 */
final class YahooFinanceAdapter
{
    public static string $lastError = '';

    public static function fetchClosedCandles(
        string $symbol,
        string $timeframe,
        int $limit,
        int $nowMs,
        int $sinceOpenMs = 0
    ): array {
        self::$lastError = '';
        $ticker = match (strtoupper($symbol)) {
            'SPOTBRENT', 'BRENT_FUTURES' => 'BZ=F',
            'USOIL' => 'CL=F',
            'XAUUSD' => 'GC=F',
            'XAGUSD' => 'SI=F',
            'EURUSD' => 'EURUSD=X',
            'GBPUSD' => 'GBPUSD=X',
            'USDJPY' => 'JPY=X',
            'BTCUSD' => 'BTC-USD',
            'ETHUSD' => 'ETH-USD',
            'SPX500USD' => '^GSPC',
            'NDQ' => '^NDX',
            default => strtoupper($symbol),
        };
        $normTf = strtoupper($timeframe);
        $isDelta = $sinceOpenMs > 0 && ($nowMs - $sinceOpenMs) < (5 * 86400000);

        [$interval, $range, $sourceTf] = match ($normTf) {
            'W1' => ['1d', $isDelta ? '1mo' : '10y', 'D1'],
            'D1' => ['1d', $isDelta ? '5d' : '10y', 'D1'],
            'H4' => ['60m', $isDelta ? '5d' : '730d', 'H1'],
            'H1' => ['60m', $isDelta ? '5d' : '730d', 'H1'],
            'M30' => ['30m', $isDelta ? '5d' : '60d', 'M30'],
            default => ['15m', $isDelta ? '5d' : '60d', 'M15'],
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
                'header' => "User-Agent: Mozilla/5.0 (ChartIntelligence/1.31)\r\n",
            ],
        ]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) {
            self::$lastError = 'Yahoo Finance request failed';
            return [];
        }
        $json = json_decode($raw, true);
        $res = $json['chart']['result'][0] ?? null;
        if (!is_array($res) || empty($res['timestamp'])) {
            self::$lastError = (string) ($json['chart']['error']['description'] ?? 'Yahoo Finance empty payload');
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
        if (in_array($normTf, ['H4', 'W1'], true)) {
            $ordered = TimeframeAggregator::aggregateCandles($ordered, $normTf, $nowMs, $symbol);
        }
        if ($sinceOpenMs > 0) {
            $ordered = array_values(array_filter(
                $ordered,
                static fn(array $b): bool => (int) ($b['open_time_utc_ms'] ?? 0) > $sinceOpenMs
            ));
        }
        return array_slice($ordered, -$limit);
    }
}
