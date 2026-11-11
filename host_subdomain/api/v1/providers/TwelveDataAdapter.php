<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Algorithms\TimeframeAggregator;
use ChartIntelligence\Algorithms\UtcTimeAnchor;
use ChartIntelligence\Core\Database;

/**
 * Isolated Provider Adapter for Twelve Data REST Time-Series API (`twelve_data`).
 *
 * Strict Provider Isolation (v1.31.0):
 * - Never substitutes candles from another provider (`tvdatafeed` / `yahoo_finance`)
 *   when `TWELVE_DATA_API_KEY` is missing or rate-limited.
 * - Supports incremental `DELTA_SYNC` (`$sinceOpenMs > 0`), requesting only the missing
 *   delta bars (`outputsize = deltaBars`) instead of re-downloading 5,000 historical bars.
 */
final class TwelveDataAdapter
{
    public static function hasConfiguredApiKey(): bool
    {
        $cfg = Database::getConfig();
        return trim((string) ($cfg['TWELVE_DATA_API_KEY'] ?? '')) !== '';
    }

    public static function fetchClosedCandles(
        string $symbol,
        string $timeframe,
        int $limit,
        int $nowMs,
        int $sinceOpenMs = 0
    ): array {
        $cfg = Database::getConfig();
        $apiKey = trim((string) ($cfg['TWELVE_DATA_API_KEY'] ?? ''));
        if ($apiKey === '') {
            // Strict isolation: return empty array so candles_sync.php serves only pure twelve_data archive from MariaDB
            return [];
        }

        $normTf = strtoupper($timeframe);
        $apiSymbol = match (strtoupper($symbol)) {
            'XAUUSD' => 'XAU/USD',
            'SPOTBRENT', 'BRENT_FUTURES' => 'XBR/USD',
            'XAGUSD' => 'XAG/USD',
            'EURUSD' => 'EUR/USD',
            'GBPUSD' => 'GBP/USD',
            'USDJPY' => 'USD/JPY',
            'BTCUSD' => 'BTC/USD',
            default => $symbol,
        };
        $interval = match ($normTf) {
            'M15' => '15min',
            'M30' => '30min',
            'H1' => '1h',
            'H4' => '4h',
            'D1' => '1day',
            'W1' => '1week',
            default => '15min',
        };

        $stepMs = UtcTimeAnchor::stepMilliseconds($normTf);
        $outputSize = $sinceOpenMs > 0
            ? max(8, min(500, (int) ceil(max(0, $nowMs - $sinceOpenMs) / max(1, $stepMs)) + 6))
            : max(12, min(5000, $limit));

        $url = sprintf(
            'https://api.twelvedata.com/time_series?symbol=%s&interval=%s&outputsize=%d&timezone=UTC&apikey=%s',
            urlencode($apiSymbol),
            urlencode($interval),
            $outputSize,
            urlencode($apiKey)
        );

        $ctx = stream_context_create(['http' => ['timeout' => 8]]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) {
            return [];
        }
        $json = json_decode($raw, true);
        if (!is_array($json) || empty($json['values']) || !is_array($json['values'])) {
            return [];
        }

        $candles = [];
        foreach ($json['values'] as $row) {
            $ts = strtotime(($row['datetime'] ?? '') . ' UTC');
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
            $c = CandleValidator::sanitizeCandle(
                $openMs,
                $normTf,
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
        return CandleValidator::filterSyntheticWeekendAndCombCandles(
            array_values($candles),
            $symbol,
            $normTf
        );
    }
}
