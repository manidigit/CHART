<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Algorithms\TimeframeAggregator;
use ChartIntelligence\Algorithms\UtcTimeAnchor;
use ChartIntelligence\Core\Database;

/**
 * Isolated Provider Adapter for Stooq Historical & EOD Market Feed (`stooq`).
 *
 * Implements Grok's #2 recommended free historical provider for Gold (`XAUUSD`),
 * Silver (`XAGUSD`), Brent (`SPOTBRENT`), WTI (`USOIL`), Forex (`EURUSD`),
 * Indices (`^SPX`, `^NDX`), and US Equities (`NVDA.US` .. `SAN.US`).
 *
 * Strict Provider Isolation (v1.35.0):
 * - Persists under isolated key `UNIQUE(chart_id, "stooq", timeframe, open_time_utc)`.
 * - Supports optional BYOK (`$customApiKey`) if configured by the user in Settings.
 */
final class StooqAdapter
{
    public static function resolveStooqTicker(string $symbol): string
    {
        return match (strtoupper(trim($symbol))) {
            'XAUUSD' => 'xauusd',
            'XAGUSD' => 'xagusd',
            'EURUSD' => 'eurusd',
            'GBPUSD' => 'gbpusd',
            'USDJPY' => 'usdjpy',
            'BTCUSD' => 'btcusd',
            'ETHUSD' => 'ethusd',
            'SPOTBRENT', 'BRENT_FUTURES' => 'cb.f',
            'USOIL' => 'cl.f',
            'SPX500USD' => '^spx',
            'NDQ' => '^ndx',
            'NVDA', 'AMZN', 'TSLA', 'AAPL', 'GOOGL', 'MSFT', 'META', 'NFLX', 'AMD', 'UBER', 'NKE', 'IBM', 'SAN' => strtolower(trim($symbol)) . '.us',
            default => strtolower(trim($symbol)),
        };
    }

    public static function fetchClosedCandles(
        string $symbol,
        string $timeframe,
        int $limit,
        int $nowMs,
        int $sinceOpenMs = 0,
        string $customApiKey = ''
    ): array {
        $normTf = strtoupper($timeframe);
        if (!in_array($normTf, ['D1', 'W1'], true)) {
            $normTf = 'D1';
        }

        $ticker = self::resolveStooqTicker($symbol);
        $cfg = Database::getConfig();
        $apiKey = trim($customApiKey !== '' ? $customApiKey : (string) ($cfg['STOOQ_API_KEY'] ?? ''));

        $intervalParam = $normTf === 'W1' ? 'w' : 'd';
        $url = sprintf(
            'https://stooq.com/q/d/l/?s=%s&i=%s%s',
            urlencode($ticker),
            $intervalParam,
            $apiKey !== '' ? '&apikey=' . urlencode($apiKey) : ''
        );

        $ctx = stream_context_create([
            'http' => [
                'timeout' => 8,
                'header' => "User-Agent: Mozilla/5.0 (compatible; ChartIntelligence/1.35)\r\n",
            ],
        ]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false || stripos($raw, 'Date,Open,High,Low,Close') === false) {
            return [];
        }

        $allLines = array_filter(explode("\n", trim($raw)));
        if (count($allLines) <= 1) {
            return [];
        }
        // Skip CSV header
        $dataLines = array_slice($allLines, 1);
        $tailLines = array_slice($dataLines, -max(20, min(5000, $limit + 10)));

        $candles = [];
        foreach ($tailLines as $line) {
            $parts = str_getcsv(trim($line));
            if (count($parts) < 5 || !is_numeric($parts[1]) || !is_numeric($parts[4])) {
                continue;
            }
            $ts = strtotime(trim($parts[0]) . ' 00:00:00 UTC');
            if ($ts === false) {
                continue;
            }
            $openMs = $ts * 1000;
            if ($sinceOpenMs > 0 && $openMs <= $sinceOpenMs) {
                continue;
            }
            if (!UtcTimeAnchor::isCandleClosed($openMs, $normTf, $nowMs)) {
                continue;
            }
            $open = (float) $parts[1];
            $high = (float) $parts[2];
            $low = (float) $parts[3];
            $close = (float) $parts[4];
            $volume = isset($parts[5]) && is_numeric($parts[5]) ? (float) $parts[5] : 0.0;

            $c = CandleValidator::sanitizeCandle($openMs, $normTf, $open, $high, $low, $close, $volume);
            if ($c !== null) {
                $candles[$c['open_time_utc_ms']] = $c;
            }
        }

        ksort($candles);
        return CandleValidator::filterSyntheticWeekendAndCombCandles(
            array_values($candles),
            $symbol,
            $normTf
        );
    }
}
