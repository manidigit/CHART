<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Algorithms\TimeframeAggregator;
use ChartIntelligence\Algorithms\UtcTimeAnchor;

/**
 * Isolated Provider Adapter for biquote Multi-Asset Feed (`biquote`).
 *
 * Supports Crypto (`BTCUSD`, `ETHUSD`), Metals (`XAGUSD`, `XAUUSD`),
 * Energy (`SPOTBRENT`, `USOIL`), and Forex (`EURUSD`) with incremental
 * `DELTA_SYNC` (`$sinceOpenMs > 0`) and local seed archive support (`data/biquote/`).
 */
final class BiquoteAdapter
{
    public static function fetchClosedCandles(
        string $symbol,
        string $timeframe,
        int $limit,
        int $nowMs,
        int $sinceOpenMs = 0
    ): array {
        $cleanSymbol = strtoupper(preg_replace('/[^A-Za-z0-9_]/', '', $symbol));
        $normTf = strtoupper($timeframe);
        if (!in_array($normTf, ['M15', 'H1', 'H4', 'D1', 'W1'], true)) {
            $normTf = 'M15';
        }

        $baseDir = dirname(__DIR__, 3);
        $biquoteFile = sprintf('%s/data/biquote/%s_%s.json', $baseDir, $cleanSymbol, $normTf);

        $candles = [];
        if (is_file($biquoteFile)) {
            $raw = @file_get_contents($biquoteFile);
            if ($raw !== false) {
                $json = json_decode($raw, true);
                $rows = $json['candles'] ?? (is_array($json) ? $json : []);
                foreach ($rows as $r) {
                    $openMs = (int) ($r['open_time_utc_ms'] ?? 0);
                    if ($openMs <= 0 || ($sinceOpenMs > 0 && $openMs <= $sinceOpenMs)) {
                        continue;
                    }
                    if (!UtcTimeAnchor::isCandleClosed($openMs, $normTf, $nowMs)) {
                        continue;
                    }
                    $c = CandleValidator::sanitizeCandle(
                        $openMs,
                        $normTf,
                        $r['open'] ?? 0,
                        $r['high'] ?? 0,
                        $r['low'] ?? 0,
                        $r['close'] ?? 0,
                        $r['volume'] ?? 0
                    );
                    if ($c !== null) {
                        $candles[$c['open_time_utc_ms']] = $c;
                    }
                }
            }
        }

        // For Crypto (BTCUSD, ETHUSD), query public high-availability Binance/biquote klines endpoint first
        if (in_array($cleanSymbol, ['BTCUSD', 'ETHUSD'], true)) {
            $binancePair = $cleanSymbol === 'BTCUSD' ? 'BTCUSDT' : 'ETHUSDT';
            $binanceInterval = match ($normTf) {
                'M15' => '15m',
                'H1' => '1h',
                'H4' => '4h',
                'D1' => '1d',
                'W1' => '1w',
                default => '15m',
            };
            $stepMs = UtcTimeAnchor::stepMilliseconds($normTf);
            $fetchCount = $sinceOpenMs > 0
                ? max(10, min(1000, (int) ceil(max(0, $nowMs - $sinceOpenMs) / max(1, $stepMs)) + 5))
                : max(20, min(1000, $limit));
            $url = sprintf(
                'https://api.binance.com/api/v3/klines?symbol=%s&interval=%s&limit=%d',
                urlencode($binancePair),
                urlencode($binanceInterval),
                $fetchCount
            );
            $ctx = stream_context_create(['http' => ['timeout' => 7, 'header' => "User-Agent: ChartIntelligence/1.32\r\n"]]);
            $raw = @file_get_contents($url, false, $ctx);
            if ($raw !== false) {
                $rows = json_decode($raw, true);
                if (is_array($rows)) {
                    foreach ($rows as $row) {
                        if (!is_array($row) || count($row) < 6) {
                            continue;
                        }
                        $openMs = (int) $row[0];
                        if ($sinceOpenMs > 0 && $openMs <= $sinceOpenMs) {
                            continue;
                        }
                        if (!UtcTimeAnchor::isCandleClosed($openMs, $normTf, $nowMs)) {
                            continue;
                        }
                        $c = CandleValidator::sanitizeCandle(
                            $openMs,
                            $normTf,
                            $row[1],
                            $row[2],
                            $row[3],
                            $row[4],
                            $row[5]
                        );
                        if ($c !== null) {
                            $candles[$c['open_time_utc_ms']] = $c;
                        }
                    }
                }
            }
        }

        // Supplement with public market feed if needed
        if (empty($candles)) {
            $liveBars = YahooFinanceAdapter::fetchClosedCandles($cleanSymbol, $normTf, $limit, $nowMs, $sinceOpenMs);
            foreach ($liveBars as $bar) {
                $openMs = (int) ($bar['open_time_utc_ms'] ?? 0);
                if ($openMs > 0 && ($sinceOpenMs <= 0 || $openMs > $sinceOpenMs)) {
                    $candles[$openMs] = $bar;
                }
            }
        }

        ksort($candles);
        $filtered = CandleValidator::filterSyntheticWeekendAndCombCandles(
            array_values($candles),
            $cleanSymbol,
            $normTf
        );
        return array_slice($filtered, -$limit);
    }
}
