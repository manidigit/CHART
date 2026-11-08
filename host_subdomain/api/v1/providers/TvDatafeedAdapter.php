<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Algorithms\TimeframeAggregator;
use ChartIntelligence\Algorithms\UtcTimeAnchor;

/**
 * Provider Adapter for TradingView `tvdatafeed` (`PEPPERSTONE:SPOTBRENT`, `OANDA:XAUUSD`).
 * Reads closed candles extracted by `scripts/sync_tvdatafeed.py` (stored in MariaDB `candles` table
 * and `data/tvdatafeed/{SYMBOL}_{TF}.json` / `.csv`), and optionally triggers an on-demand CLI refresh
 * if Python 3 + tvdatafeed is available on the host.
 */
final class TvDatafeedAdapter
{
    public static function fetchClosedCandles(string $symbol, string $timeframe, int $limit, int $nowMs, bool $tryLiveCli = false): array
    {
        $cleanSymbol = strtoupper(preg_replace('/[^A-Za-z0-9_]/', '', $symbol));
        $normTf = strtoupper($timeframe);
        if (!in_array($normTf, ['M15', 'H1', 'H4', 'D1'], true)) {
            $normTf = 'M15';
        }

        $exchange = match ($cleanSymbol) {
            'XAUUSD', 'XAGUSD', 'EURUSD' => 'OANDA',
            default => 'PEPPERSTONE',
        };

        $baseDir = dirname(__DIR__, 3);
        $dataDir = $baseDir . '/data/tvdatafeed';
        $scriptPath = $baseDir . '/scripts/sync_tvdatafeed.py';

        // If requested and Python 3 is callable on the server, attempt a quick refresh
        if ($tryLiveCli && is_file($scriptPath) && function_exists('exec')) {
            $jsonTarget = $dataDir . '/' . $cleanSymbol . '_' . $normTf . '.json';
            $isStale = !is_file($jsonTarget) || (time() - (int) @filemtime($jsonTarget)) > 600;
            if ($isStale) {
                $cmd = sprintf(
                    'python3 %s --symbol %s --exchange %s --bars %d --output-dir %s 2>/dev/null',
                    escapeshellarg($scriptPath),
                    escapeshellarg($cleanSymbol),
                    escapeshellarg($exchange),
                    max(160, min(5000, $limit)),
                    escapeshellarg($dataDir)
                );
                @exec($cmd);
            }
        }

        // 1. Read from normalized JSON produced by sync_tvdatafeed.py
        $candles = self::readFromNormalizedJson($dataDir, $cleanSymbol, $normTf, $limit, $nowMs);
        if (!empty($candles)) {
            return CandleValidator::filterSyntheticWeekendAndCombCandles($candles, $cleanSymbol, $normTf);
        }

        // 2. Or read from the CSV files ({SYMBOL}_15m.csv, {SYMBOL}_1h.csv, {SYMBOL}_4h.csv, {SYMBOL}_1d.csv)
        $candles = self::readFromCsvFile($dataDir, $cleanSymbol, $normTf, $limit, $nowMs);
        if (!empty($candles)) {
            return CandleValidator::filterSyntheticWeekendAndCombCandles($candles, $cleanSymbol, $normTf);
        }

        // 3. If higher timeframe (H1/H4/D1) is requested and M15 exists, aggregate from M15
        if (in_array($normTf, ['H1', 'H4', 'D1'], true)) {
            $m15 = self::readFromNormalizedJson($dataDir, $cleanSymbol, 'M15', 5000, $nowMs);
            if (empty($m15)) {
                $m15 = self::readFromCsvFile($dataDir, $cleanSymbol, 'M15', 5000, $nowMs);
            }
            if (!empty($m15)) {
                $cleanM15 = CandleValidator::filterSyntheticWeekendAndCombCandles($m15, $cleanSymbol, 'M15');
                $aggregated = TimeframeAggregator::aggregate($cleanM15, $normTf, $nowMs);
                return array_slice($aggregated, -$limit);
            }
        }

        return [];
    }

    private static function readFromNormalizedJson(string $dataDir, string $symbol, string $timeframe, int $limit, int $nowMs): array
    {
        $jsonFile = $dataDir . '/' . $symbol . '_' . $timeframe . '.json';
        if (!is_file($jsonFile)) {
            return [];
        }
        $raw = @file_get_contents($jsonFile);
        if ($raw === false || $raw === '') {
            return [];
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded) || empty($decoded['candles']) || !is_array($decoded['candles'])) {
            return [];
        }

        $result = [];
        foreach ($decoded['candles'] as $item) {
            $openMs = (int) ($item['open_time_utc_ms'] ?? 0);
            if ($openMs <= 0 || !UtcTimeAnchor::isCandleClosed($openMs, $timeframe, $nowMs)) {
                continue;
            }
            $c = CandleValidator::sanitizeCandle(
                $openMs,
                $timeframe,
                $item['open'] ?? 0,
                $item['high'] ?? 0,
                $item['low'] ?? 0,
                $item['close'] ?? 0,
                $item['volume'] ?? 0
            );
            if ($c !== null) {
                $result[$c['open_time_utc_ms']] = $c;
            }
        }
        ksort($result);
        return array_slice(array_values($result), -$limit);
    }

    private static function readFromCsvFile(string $dataDir, string $symbol, string $timeframe, int $limit, int $nowMs): array
    {
        $suffixMap = [
            'M15' => '15m',
            'H1' => '1h',
            'H4' => '4h',
            'D1' => '1d',
        ];
        $suffix = $suffixMap[$timeframe] ?? '15m';
        $csvFile = $dataDir . '/' . $symbol . '_' . $suffix . '.csv';
        if (!is_file($csvFile)) {
            return [];
        }
        $fh = @fopen($csvFile, 'r');
        if ($fh === false) {
            return [];
        }

        $header = fgetcsv($fh);
        if (!is_array($header)) {
            fclose($fh);
            return [];
        }
        $colMap = [];
        foreach ($header as $idx => $colName) {
            $colMap[strtolower(trim((string) $colName))] = $idx;
        }

        $dtIdx = $colMap['datetime'] ?? 0;
        $oIdx = $colMap['open'] ?? 2;
        $hIdx = $colMap['high'] ?? 3;
        $lIdx = $colMap['low'] ?? 4;
        $cIdx = $colMap['close'] ?? 5;
        $vIdx = $colMap['volume'] ?? 6;

        $result = [];
        while (($row = fgetcsv($fh)) !== false) {
            if (count($row) <= $cIdx) {
                continue;
            }
            $dtStr = trim((string) ($row[$dtIdx] ?? ''));
            if ($dtStr === '') {
                continue;
            }
            $tsSec = strtotime($dtStr . ' UTC');
            if ($tsSec === false || $tsSec <= 0) {
                continue;
            }
            $openMs = UtcTimeAnchor::snapToOpenUtcMs($tsSec * 1000, $timeframe);
            if (!UtcTimeAnchor::isCandleClosed($openMs, $timeframe, $nowMs)) {
                continue;
            }
            $c = CandleValidator::sanitizeCandle(
                $openMs,
                $timeframe,
                $row[$oIdx] ?? 0,
                $row[$hIdx] ?? 0,
                $row[$lIdx] ?? 0,
                $row[$cIdx] ?? 0,
                $row[$vIdx] ?? 0
            );
            if ($c !== null) {
                $result[$c['open_time_utc_ms']] = $c;
            }
        }
        fclose($fh);
        ksort($result);
        return array_slice(array_values($result), -$limit);
    }
}
