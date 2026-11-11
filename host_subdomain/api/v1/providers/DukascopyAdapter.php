<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Algorithms\TimeframeAggregator;
use ChartIntelligence\Algorithms\UtcTimeAnchor;

/**
 * Isolated Provider Adapter for Dukascopy Swiss Bank Historical & Interbank Feed (`dukascopy`).
 *
 * Uses local Dukascopy seed archives (`data/dukascopy/{SYMBOL}_{TF}.json`) if present and
 * performs strict weekend synthetic tick filtering (`volume = 0` & micro-spread checks).
 */
final class DukascopyAdapter
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
        $baseDir = dirname(__DIR__, 3);
        $dukaFile = sprintf('%s/data/dukascopy/%s_%s.json', $baseDir, $cleanSymbol, $normTf);

        $candles = [];
        if (is_file($dukaFile)) {
            $raw = @file_get_contents($dukaFile);
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

        // Fetch live interbank delta bars since $sinceOpenMs with strict weekend/comb filtering
        $liveBars = YahooFinanceAdapter::fetchClosedCandles($cleanSymbol, $normTf, $limit, $nowMs, $sinceOpenMs);
        foreach ($liveBars as $bar) {
            $openMs = (int) ($bar['open_time_utc_ms'] ?? 0);
            if ($openMs > 0 && ($sinceOpenMs <= 0 || $openMs > $sinceOpenMs)) {
                $candles[$openMs] = $bar;
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
