<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Algorithms\UtcTimeAnchor;

/**
 * Phase 3 Historical Data Import & Normalization Engine.
 * Supports:
 *  - Standard OHLCV CSV / TSV & 2-column Daily Series (e.g. DataHub brent-daily.csv, FRED)
 *  - U.S. EIA Europe Brent Spot FOB RBRTEd.xls (Binary BIFF8 OLE2 .xls, SpreadsheetML XML, HTML table, TSV)
 *  - Canonical JSON ({candles: [...]} or array of bars)
 *  - Manual OHLC bar entry
 *
 * Security Policy: Strictly rejects image files (PNG, JPEG, WEBP, GIF, BMP, SVG) by extension,
 * MIME type, and magic byte signatures. Never synthesizes intraday bars from daily series.
 */
final class LocalCsvAdapter
{
    public static function isImagePayload(string $rawBytes, string $fileName = '', string $mimeType = ''): bool
    {
        $mime = strtolower(trim($mimeType));
        if ($mime !== '' && str_starts_with($mime, 'image/')) {
            return true;
        }
        $ext = strtolower((string) pathinfo($fileName, PATHINFO_EXTENSION));
        if (in_array($ext, ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'heic', 'avif', 'tif', 'tiff'], true)) {
            return true;
        }
        $len = strlen($rawBytes);
        if ($len >= 4) {
            if (substr($rawBytes, 0, 4) === "\x89PNG") {
                return true;
            }
            if (substr($rawBytes, 0, 3) === "\xFF\xD8\xFF") {
                return true;
            }
            if (substr($rawBytes, 0, 4) === 'GIF8') {
                return true;
            }
            if ($len >= 12 && substr($rawBytes, 0, 4) === 'RIFF' && substr($rawBytes, 8, 4) === 'WEBP') {
                return true;
            }
            if (substr($rawBytes, 0, 2) === 'BM' && $len > 14 && ord($rawBytes[6]) === 0 && ord($rawBytes[7]) === 0) {
                return true;
            }
        }
        $headTrim = ltrim(substr($rawBytes, 0, 256));
        if (stripos($headTrim, '<svg') === 0 || preg_match('/^<\?xml[^>]*>\s*<svg\b/i', $headTrim)) {
            return true;
        }
        return false;
    }

    /**
     * @return array{
     *   ok: bool,
     *   error_code: string|null,
     *   detected_format: string,
     *   forced_daily_only: bool,
     *   effective_timeframe: string,
     *   rows_total: int,
     *   rows_skipped: int,
     *   candles: array<int, array<string, mixed>>
     * }
     */
    public static function parseHistoricalBytes(
        string $rawBytes,
        string $fileName = '',
        string $requestedTf = 'D1',
        string $symbolCode = 'SPOTBRENT'
    ): array {
        if (self::isImagePayload($rawBytes, $fileName)) {
            return [
                'ok' => false,
                'error_code' => 'ERR_IMAGE_UPLOAD_FORBIDDEN',
                'detected_format' => 'IMAGE_REJECTED',
                'forced_daily_only' => false,
                'effective_timeframe' => $requestedTf,
                'rows_total' => 0,
                'rows_skipped' => 0,
                'candles' => [],
            ];
        }

        $tf = strtoupper(trim($requestedTf));
        if (!in_array($tf, ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'], true)) {
            $tf = 'D1';
        }

        $len = strlen($rawBytes);
        if ($len === 0) {
            return [
                'ok' => false,
                'error_code' => 'EMPTY_INPUT',
                'detected_format' => 'EMPTY',
                'forced_daily_only' => false,
                'effective_timeframe' => $tf,
                'rows_total' => 0,
                'rows_skipped' => 0,
                'candles' => [],
            ];
        }

        // 1. Binary BIFF8 OLE2 (.xls)
        if ($len >= 8 && substr($rawBytes, 0, 8) === "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1") {
            $rows = self::parseBiff8Ole2Rows($rawBytes);
            return self::normalizeTabularRows($rows, 'XLS_BIFF8', $tf, $symbolCode);
        }

        $text = self::stripUtf8Bom($rawBytes);
        $trimHead = ltrim(substr($text, 0, 512));

        // 2. JSON
        if ($trimHead !== '' && ($trimHead[0] === '{' || $trimHead[0] === '[')) {
            $decoded = json_decode($text, true);
            if (is_array($decoded)) {
                return self::normalizeJsonArray($decoded, $tf, $symbolCode);
            }
        }

        // 3. SpreadsheetML XML (.xls / .xml)
        if (preg_match('/<Workbook\b|<ss:Workbook\b|<Worksheet\b/i', $trimHead . substr($text, 0, 4096))) {
            $rows = self::parseSpreadsheetMlRows($text);
            return self::normalizeTabularRows($rows, 'XLS_XML', $tf, $symbolCode);
        }

        // 4. HTML Table saved as .xls
        if (preg_match('/<table\b|<tr\b/i', substr($text, 0, 4096))) {
            $rows = self::parseHtmlTableRows($text);
            return self::normalizeTabularRows($rows, 'XLS_HTML', $tf, $symbolCode);
        }

        // 5. Delimited CSV / TSV (including DataHub brent-daily.csv, TradingView CSV, Stooq CSV, EIA TSV)
        $rows = self::parseDelimitedRows($text);
        return self::normalizeTabularRows($rows, 'CSV', $tf, $symbolCode);
    }

    /**
     * @param array<int, array<int, mixed>> $rows
     */
    public static function normalizeTabularRows(
        array $rows,
        string $format,
        string $requestedTf,
        string $symbolCode
    ): array {
        $rowsTotal = count($rows);
        if ($rowsTotal === 0) {
            return [
                'ok' => false,
                'error_code' => 'NO_PARSABLE_ROWS',
                'detected_format' => $format,
                'forced_daily_only' => false,
                'effective_timeframe' => $requestedTf,
                'rows_total' => 0,
                'rows_skipped' => 0,
                'candles' => [],
            ];
        }

        $headerColMap = null;
        $headerRowIdx = -1;
        $maxScan = min(20, $rowsTotal);
        for ($i = 0; $i < $maxScan; $i++) {
            $mapped = self::detectHeaderColumns($rows[$i]);
            if ($mapped !== null) {
                $headerColMap = $mapped;
                $headerRowIdx = $i;
                break;
            }
        }

        // Fallback if no header row: detect Date+Price or Date+OHLCV from first valid numeric row
        $isTwoColDaily = false;
        if ($headerColMap !== null) {
            $isTwoColDaily = ($headerColMap['open'] === null && $headerColMap['high'] === null && $headerColMap['low'] === null && $headerColMap['close'] !== null);
        } else {
            for ($i = 0; $i < $maxScan; $i++) {
                $r = $rows[$i];
                if (count($r) >= 5 && self::parseTimestampMs($r[0]) !== null && is_numeric($r[1]) && is_numeric($r[2]) && is_numeric($r[3]) && is_numeric($r[4])) {
                    $headerColMap = ['time' => 0, 'open' => 1, 'high' => 2, 'low' => 3, 'close' => 4, 'volume' => isset($r[5]) ? 5 : null];
                    $headerRowIdx = $i - 1;
                    break;
                }
                if (count($r) >= 2 && self::parseTimestampMs($r[0]) !== null && self::parseNumeric($r[1]) !== null) {
                    $headerColMap = ['time' => 0, 'open' => null, 'high' => null, 'low' => null, 'close' => 1, 'volume' => null];
                    $headerRowIdx = $i - 1;
                    $isTwoColDaily = true;
                    break;
                }
            }
        }

        if ($headerColMap === null) {
            return [
                'ok' => false,
                'error_code' => 'UNRECOGNIZED_SCHEMA',
                'detected_format' => $format,
                'forced_daily_only' => false,
                'effective_timeframe' => $requestedTf,
                'rows_total' => $rowsTotal,
                'rows_skipped' => $rowsTotal,
                'candles' => [],
            ];
        }

        $forcedDailyOnly = $isTwoColDaily;
        $effectiveTf = $forcedDailyOnly ? 'D1' : $requestedTf;
        $startIdx = max(0, $headerRowIdx + 1);

        $rawParsed = [];
        $skipped = 0;
        for ($i = $startIdx; $i < $rowsTotal; $i++) {
            $r = $rows[$i];
            if (!is_array($r) || count($r) < 2) {
                continue;
            }
            $timeRaw = $r[$headerColMap['time']] ?? null;
            $openMs = self::parseTimestampMs($timeRaw);
            if ($openMs === null || $openMs <= 0) {
                $skipped++;
                continue;
            }
            $cVal = $headerColMap['close'] !== null ? self::parseNumeric($r[$headerColMap['close']] ?? null) : null;
            if ($cVal === null || $cVal <= 0.0) {
                $skipped++;
                continue;
            }
            if ($isTwoColDaily) {
                $rawParsed[$openMs] = [
                    'open_ms' => $openMs,
                    'open' => null,
                    'high' => null,
                    'low' => null,
                    'close' => $cVal,
                    'volume' => 0.0,
                ];
            } else {
                $oVal = self::parseNumeric($r[$headerColMap['open']] ?? null) ?? $cVal;
                $hVal = self::parseNumeric($r[$headerColMap['high']] ?? null) ?? max($oVal, $cVal);
                $lVal = self::parseNumeric($r[$headerColMap['low']] ?? null) ?? min($oVal, $cVal);
                $vVal = $headerColMap['volume'] !== null ? (self::parseNumeric($r[$headerColMap['volume']] ?? null) ?? 0.0) : 0.0;
                $rawParsed[$openMs] = [
                    'open_ms' => $openMs,
                    'open' => $oVal,
                    'high' => $hVal,
                    'low' => $lVal,
                    'close' => $cVal,
                    'volume' => max(0.0, $vVal),
                ];
            }
        }

        ksort($rawParsed);
        $candles = [];
        $prevClose = null;
        foreach ($rawParsed as $openMs => $row) {
            $close = (float) $row['close'];
            if ($isTwoColDaily) {
                $open = $prevClose ?? $close;
                $high = max($open, $close);
                $low = min($open, $close);
                $vol = 0.0;
            } else {
                $open = (float) $row['open'];
                $high = (float) $row['high'];
                $low = (float) $row['low'];
                $vol = (float) $row['volume'];
            }
            $prevClose = $close;
            $bar = CandleValidator::sanitizeCandle($openMs, $effectiveTf, $open, $high, $low, $close, $vol);
            if ($bar !== null) {
                $candles[$bar['open_time_utc_ms']] = $bar;
            } else {
                $skipped++;
            }
        }
        ksort($candles);

        return [
            'ok' => !empty($candles),
            'error_code' => empty($candles) ? 'NO_VALID_CANDLES' : null,
            'detected_format' => $format,
            'forced_daily_only' => $forcedDailyOnly,
            'effective_timeframe' => $effectiveTf,
            'rows_total' => max(0, $rowsTotal - $startIdx),
            'rows_skipped' => $skipped,
            'candles' => array_values($candles),
        ];
    }

    private static function normalizeJsonArray(array $decoded, string $requestedTf, string $symbolCode): array
    {
        $items = $decoded;
        if (isset($decoded['candles']) && is_array($decoded['candles'])) {
            $items = $decoded['candles'];
        } elseif (isset($decoded['data']['candles']) && is_array($decoded['data']['candles'])) {
            $items = $decoded['data']['candles'];
        }
        if (!is_array($items)) {
            return [
                'ok' => false,
                'error_code' => 'INVALID_JSON_SCHEMA',
                'detected_format' => 'JSON',
                'forced_daily_only' => false,
                'effective_timeframe' => $requestedTf,
                'rows_total' => 0,
                'rows_skipped' => 0,
                'candles' => [],
            ];
        }

        $total = count($items);
        $skipped = 0;
        $candles = [];
        $prevClose = null;
        $sawFullOhlc = false;
        foreach ($items as $item) {
            if (!is_array($item)) {
                $skipped++;
                continue;
            }
            $tRaw = $item['open_time_utc_ms'] ?? $item['open_time_utc_iso'] ?? $item['t'] ?? $item['time'] ?? $item['date'] ?? $item['timestamp'] ?? null;
            $openMs = self::parseTimestampMs($tRaw);
            $cVal = self::parseNumeric($item['close'] ?? $item['c'] ?? $item['price'] ?? $item['value'] ?? null);
            if ($openMs === null || $cVal === null || $cVal <= 0.0) {
                $skipped++;
                continue;
            }
            $hasOhlc = isset($item['open']) || isset($item['o']);
            if ($hasOhlc) {
                $sawFullOhlc = true;
            }
            $oVal = self::parseNumeric($item['open'] ?? $item['o'] ?? null) ?? ($prevClose ?? $cVal);
            $hVal = self::parseNumeric($item['high'] ?? $item['h'] ?? null) ?? max($oVal, $cVal);
            $lVal = self::parseNumeric($item['low'] ?? $item['l'] ?? null) ?? min($oVal, $cVal);
            $vVal = self::parseNumeric($item['volume'] ?? $item['v'] ?? null) ?? 0.0;
            $prevClose = $cVal;
            $tf = $sawFullOhlc ? $requestedTf : 'D1';
            $bar = CandleValidator::sanitizeCandle($openMs, $tf, $oVal, $hVal, $lVal, $cVal, max(0.0, $vVal));
            if ($bar !== null) {
                $candles[$bar['open_time_utc_ms']] = $bar;
            } else {
                $skipped++;
            }
        }
        ksort($candles);
        $forcedDailyOnly = !$sawFullOhlc && !empty($candles);
        return [
            'ok' => !empty($candles),
            'error_code' => empty($candles) ? 'NO_VALID_CANDLES' : null,
            'detected_format' => 'JSON',
            'forced_daily_only' => $forcedDailyOnly,
            'effective_timeframe' => $forcedDailyOnly ? 'D1' : $requestedTf,
            'rows_total' => $total,
            'rows_skipped' => $skipped,
            'candles' => array_values($candles),
        ];
    }

    private static function detectHeaderColumns(array $row): ?array
    {
        $timeIdx = null;
        $openIdx = null;
        $highIdx = null;
        $lowIdx = null;
        $closeIdx = null;
        $volIdx = null;

        foreach ($row as $idx => $cell) {
            $norm = strtolower(trim((string) $cell));
            $norm = preg_replace('/\s+/', ' ', $norm);
            if ($norm === '') {
                continue;
            }
            if ($timeIdx === null && (in_array($norm, ['date', 'time', 'datetime', 'timestamp', 'open_time_utc_ms', 'open_time_utc_iso', 'open_time_utc', 'period'], true) || str_contains($norm, 'date'))) {
                $timeIdx = (int) $idx;
                continue;
            }
            if ($openIdx === null && ($norm === 'open' || $norm === 'o' || str_starts_with($norm, 'open '))) {
                $openIdx = (int) $idx;
                continue;
            }
            if ($highIdx === null && ($norm === 'high' || $norm === 'h' || str_starts_with($norm, 'high '))) {
                $highIdx = (int) $idx;
                continue;
            }
            if ($lowIdx === null && ($norm === 'low' || $norm === 'l' || str_starts_with($norm, 'low '))) {
                $lowIdx = (int) $idx;
                continue;
            }
            if ($closeIdx === null && (in_array($norm, ['close', 'c', 'price', 'value', 'spot', 'brent', 'rbrte'], true) || str_contains($norm, 'brent') || str_contains($norm, 'spot price') || str_contains($norm, 'dollars per barrel'))) {
                $closeIdx = (int) $idx;
                continue;
            }
            if ($volIdx === null && ($norm === 'volume' || $norm === 'vol' || $norm === 'v')) {
                $volIdx = (int) $idx;
                continue;
            }
        }

        if ($timeIdx !== null && $closeIdx !== null) {
            return [
                'time' => $timeIdx,
                'open' => $openIdx,
                'high' => $highIdx,
                'low' => $lowIdx,
                'close' => $closeIdx,
                'volume' => $volIdx,
            ];
        }
        return null;
    }

    private static function parseDelimitedRows(string $text): array
    {
        $lines = preg_split("/\r\n|\n|\r/", $text);
        if (!is_array($lines)) {
            return [];
        }
        $delimiter = ',';
        foreach (array_slice($lines, 0, 10) as $sample) {
            if (substr_count($sample, "\t") >= 1 && substr_count($sample, ',') === 0) {
                $delimiter = "\t";
                break;
            }
            if (substr_count($sample, ';') >= 1 && substr_count($sample, ',') === 0) {
                $delimiter = ';';
                break;
            }
        }
        $rows = [];
        foreach ($lines as $line) {
            $trimmed = trim($line);
            if ($trimmed === '') {
                continue;
            }
            $rows[] = str_getcsv($trimmed, $delimiter);
        }
        return $rows;
    }

    private static function parseSpreadsheetMlRows(string $xmlText): array
    {
        $rows = [];
        if (preg_match_all('/<(?:\w+:)?Row\b[^>]*>(.*?)<\/(?:\w+:)?Row>/is', $xmlText, $rowMatches)) {
            foreach ($rowMatches[1] as $rowXml) {
                $cells = [];
                if (preg_match_all('/<(?:\w+:)?Cell\b([^>]*)>(.*?)<\/(?:\w+:)?Cell>/is', $rowXml, $cellMatches, PREG_SET_ORDER)) {
                    $colCursor = 0;
                    foreach ($cellMatches as $cm) {
                        if (preg_match('/(?:ss:)?Index=["\'](\d+)["\']/i', $cm[1], $idxMatch)) {
                            $target = max(0, ((int) $idxMatch[1]) - 1);
                            while ($colCursor < $target) {
                                $cells[] = '';
                                $colCursor++;
                            }
                        }
                        $val = '';
                        if (preg_match('/<(?:\w+:)?Data\b[^>]*>(.*?)<\/(?:\w+:)?Data>/is', $cm[2], $dm)) {
                            $val = html_entity_decode(strip_tags($dm[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
                        }
                        $cells[] = trim($val);
                        $colCursor++;
                    }
                }
                if (!empty($cells)) {
                    $rows[] = $cells;
                }
            }
        }
        return $rows;
    }

    private static function parseHtmlTableRows(string $htmlText): array
    {
        $rows = [];
        if (preg_match_all('/<tr\b[^>]*>(.*?)<\/tr>/is', $htmlText, $trMatches)) {
            foreach ($trMatches[1] as $trHtml) {
                $cells = [];
                if (preg_match_all('/<t[dh]\b[^>]*>(.*?)<\/t[dh]>/is', $trHtml, $tdMatches)) {
                    foreach ($tdMatches[1] as $td) {
                        $cells[] = trim(html_entity_decode(strip_tags($td), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                    }
                }
                if (!empty($cells)) {
                    $rows[] = $cells;
                }
            }
        }
        return $rows;
    }

    /**
     * Pure-PHP BIFF8 OLE2 (.xls) reader for legacy binary Excel workbooks such as EIA RBRTEd.xls.
     * Supports regular FAT + DIFAT + MiniFAT streams, SST shared strings, LABELSST, LABEL, NUMBER, RK, and MULRK.
     */
    public static function parseBiff8Ole2Rows(string $bytes): array
    {
        $len = strlen($bytes);
        if ($len < 512 || substr($bytes, 0, 8) !== "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1") {
            return [];
        }

        $sectorShift = self::u16($bytes, 30);
        if ($sectorShift < 9 || $sectorShift > 12) {
            $sectorShift = 9;
        }
        $sectorSize = 1 << $sectorShift;
        $miniSectorShift = self::u16($bytes, 32);
        $miniSectorSize = ($miniSectorShift >= 6 && $miniSectorShift <= 9) ? (1 << $miniSectorShift) : 64;

        $numFatSectors = self::u32($bytes, 44);
        $dirFirstSector = self::i32($bytes, 48);
        $miniCutoff = self::u32($bytes, 56);
        if ($miniCutoff === 0) {
            $miniCutoff = 4096;
        }
        $miniFatFirstSector = self::i32($bytes, 60);
        $numMiniFatSectors = self::u32($bytes, 64);
        $difatFirstSector = self::i32($bytes, 68);
        $numDifatSectors = self::u32($bytes, 72);

        // Build list of FAT sector numbers (109 inline + DIFAT chain)
        $fatSectorList = [];
        for ($i = 0; $i < 109 && count($fatSectorList) < $numFatSectors; $i++) {
            $sec = self::i32($bytes, 76 + $i * 4);
            if ($sec >= 0) {
                $fatSectorList[] = $sec;
            }
        }
        $difatSec = $difatFirstSector;
        $difatGuard = 0;
        $entriesPerDifat = intdiv($sectorSize, 4) - 1;
        while ($difatSec >= 0 && count($fatSectorList) < $numFatSectors && $difatGuard < $numDifatSectors + 4) {
            $difatGuard++;
            $off = 512 + $difatSec * $sectorSize;
            if ($off + $sectorSize > $len) {
                break;
            }
            for ($i = 0; $i < $entriesPerDifat && count($fatSectorList) < $numFatSectors; $i++) {
                $sec = self::i32($bytes, $off + $i * 4);
                if ($sec >= 0) {
                    $fatSectorList[] = $sec;
                }
            }
            $difatSec = self::i32($bytes, $off + $sectorSize - 4);
        }

        // Read FAT table
        $fat = [];
        foreach ($fatSectorList as $fSec) {
            $off = 512 + $fSec * $sectorSize;
            if ($off + $sectorSize > $len) {
                break;
            }
            $cnt = intdiv($sectorSize, 4);
            for ($i = 0; $i < $cnt; $i++) {
                $fat[] = self::i32($bytes, $off + $i * 4);
            }
        }

        $readChain = static function (int $startSec, int $maxBytes) use ($bytes, $len, $sectorSize, $fat): string {
            if ($startSec < 0) {
                return '';
            }
            $out = '';
            $sec = $startSec;
            $visited = 0;
            $maxLoops = 200000;
            while ($sec >= 0 && $visited < $maxLoops) {
                $visited++;
                $off = 512 + $sec * $sectorSize;
                if ($off >= $len) {
                    break;
                }
                $out .= substr($bytes, $off, min($sectorSize, $len - $off));
                if ($maxBytes > 0 && strlen($out) >= $maxBytes) {
                    return substr($out, 0, $maxBytes);
                }
                $sec = $fat[$sec] ?? -2;
            }
            return $maxBytes > 0 ? substr($out, 0, $maxBytes) : $out;
        };

        $dirBytes = $readChain($dirFirstSector, 0);
        $dirLen = strlen($dirBytes);
        if ($dirLen < 128) {
            return [];
        }

        $rootStartSec = -1;
        $rootSize = 0;
        $wbStartSec = -1;
        $wbSize = 0;

        $entryCount = intdiv($dirLen, 128);
        for ($i = 0; $i < $entryCount; $i++) {
            $eOff = $i * 128;
            $objType = ord($dirBytes[$eOff + 66]);
            $nameByteLen = self::u16($dirBytes, $eOff + 64);
            $nameChars = [];
            for ($c = 0; $c + 1 < min($nameByteLen, 64); $c += 2) {
                $ch = self::u16($dirBytes, $eOff + $c);
                if ($ch === 0) {
                    break;
                }
                $nameChars[] = chr($ch & 0x7F);
            }
            $nameLower = strtolower(implode('', $nameChars));
            $startSec = self::i32($dirBytes, $eOff + 116);
            $streamSize = self::u32($dirBytes, $eOff + 120);

            if ($objType === 5) {
                $rootStartSec = $startSec;
                $rootSize = $streamSize;
            } elseif ($objType === 2 && ($nameLower === 'workbook' || $nameLower === 'book')) {
                $wbStartSec = $startSec;
                $wbSize = $streamSize;
            }
        }

        if ($wbStartSec < 0 || $wbSize <= 0) {
            return [];
        }

        $workbookStream = '';
        if ($wbSize < $miniCutoff && $rootStartSec >= 0) {
            $miniContainer = $readChain($rootStartSec, $rootSize);
            $miniFatRaw = ($miniFatFirstSector >= 0 && $numMiniFatSectors > 0) ? $readChain($miniFatFirstSector, $numMiniFatSectors * $sectorSize) : '';
            $miniFat = [];
            for ($i = 0; $i + 4 <= strlen($miniFatRaw); $i += 4) {
                $miniFat[] = self::i32($miniFatRaw, $i);
            }
            $sec = $wbStartSec;
            $visited = 0;
            while ($sec >= 0 && $visited < 200000 && strlen($workbookStream) < $wbSize) {
                $visited++;
                $mOff = $sec * $miniSectorSize;
                if ($mOff >= strlen($miniContainer)) {
                    break;
                }
                $workbookStream .= substr($miniContainer, $mOff, $miniSectorSize);
                $sec = $miniFat[$sec] ?? -2;
            }
            $workbookStream = substr($workbookStream, 0, $wbSize);
        } else {
            $workbookStream = $readChain($wbStartSec, $wbSize);
        }

        return self::parseBiff8WorkbookRecords($workbookStream);
    }

    private static function parseBiff8WorkbookRecords(string $stream): array
    {
        $len = strlen($stream);
        $pos = 0;
        $sst = [];
        $sheets = [];
        $currentSheetIdx = -1;
        $substreamDepth = 0;
        $inGlobals = false;

        $records = [];
        while ($pos + 4 <= $len) {
            $recType = self::u16($stream, $pos);
            $recLen = self::u16($stream, $pos + 2);
            $pos += 4;
            if ($pos + $recLen > $len) {
                break;
            }
            $recData = substr($stream, $pos, $recLen);
            $pos += $recLen;
            if ($recType === 0x003C && !empty($records)) {
                $records[count($records) - 1]['cont'][] = $recData;
            } else {
                $records[] = ['type' => $recType, 'data' => $recData, 'cont' => []];
            }
        }

        foreach ($records as $rec) {
            $type = $rec['type'];
            $data = $rec['data'];
            $dLen = strlen($data);

            if ($type === 0x0809) {
                // BOF
                $bofType = $dLen >= 4 ? self::u16($data, 2) : 0;
                $substreamDepth++;
                if ($bofType === 0x0005) {
                    $inGlobals = true;
                } elseif ($bofType === 0x0010) {
                    $inGlobals = false;
                    $currentSheetIdx = count($sheets);
                    $sheets[$currentSheetIdx] = [];
                }
                continue;
            }
            if ($type === 0x000A) {
                // EOF
                $substreamDepth = max(0, $substreamDepth - 1);
                $inGlobals = false;
                continue;
            }
            if ($type === 0x00FC && $dLen >= 8) {
                // SST (Shared String Table)
                $sst = self::parseBiff8Sst($data, $rec['cont']);
                continue;
            }

            if ($inGlobals || $currentSheetIdx < 0) {
                continue;
            }

            if ($type === 0x00FD && $dLen >= 10) {
                // LABELSST
                $row = self::u16($data, 0);
                $col = self::u16($data, 2);
                $sstIdx = self::u32($data, 6);
                if (isset($sst[$sstIdx])) {
                    $sheets[$currentSheetIdx][$row][$col] = $sst[$sstIdx];
                }
            } elseif ($type === 0x0203 && $dLen >= 14) {
                // NUMBER (IEEE 754 LE double)
                $row = self::u16($data, 0);
                $col = self::u16($data, 2);
                $val = self::f64($data, 6);
                $sheets[$currentSheetIdx][$row][$col] = $val;
            } elseif ($type === 0x027E && $dLen >= 10) {
                // RK
                $row = self::u16($data, 0);
                $col = self::u16($data, 2);
                $val = self::decodeRk(self::u32($data, 6));
                $sheets[$currentSheetIdx][$row][$col] = $val;
            } elseif ($type === 0x00BD && $dLen >= 12) {
                // MULRK
                $row = self::u16($data, 0);
                $colFirst = self::u16($data, 2);
                $n = intdiv($dLen - 6, 6);
                for ($k = 0; $k < $n; $k++) {
                    $rkRaw = self::u32($data, 4 + $k * 6 + 2);
                    $sheets[$currentSheetIdx][$row][$colFirst + $k] = self::decodeRk($rkRaw);
                }
            } elseif ($type === 0x0204 && $dLen >= 9) {
                // LABEL
                $row = self::u16($data, 0);
                $col = self::u16($data, 2);
                $cch = self::u16($data, 6);
                $flags = ord($data[8]);
                $isUnicode = ($flags & 0x01) !== 0;
                $strBytes = substr($data, 9);
                $sheets[$currentSheetIdx][$row][$col] = self::decodeBiffStringSlice($strBytes, $cch, $isUnicode);
            }
        }

        // Choose worksheet with the most populated rows (e.g. EIA 'Data 1')
        $bestRows = [];
        $bestScore = -1;
        foreach ($sheets as $rowMap) {
            $score = count($rowMap);
            if ($score > $bestScore) {
                $bestScore = $score;
                ksort($rowMap);
                $normalized = [];
                foreach ($rowMap as $cols) {
                    if (empty($cols)) {
                        continue;
                    }
                    $maxCol = max(array_keys($cols));
                    $dense = [];
                    for ($c = 0; $c <= $maxCol; $c++) {
                        $dense[] = $cols[$c] ?? '';
                    }
                    $normalized[] = $dense;
                }
                $bestRows = $normalized;
            }
        }
        return $bestRows;
    }

    private static function parseBiff8Sst(string $firstChunk, array $contChunks): array
    {
        $chunks = array_merge([$firstChunk], $contChunks);
        $chunkIdx = 0;
        $offset = 8;
        $uniqueCount = self::u32($firstChunk, 4);
        $result = [];

        $readBytes = static function (int $count) use (&$chunks, &$chunkIdx, &$offset): string {
            $out = '';
            while ($count > 0 && $chunkIdx < count($chunks)) {
                $cur = $chunks[$chunkIdx];
                $avail = strlen($cur) - $offset;
                if ($avail <= 0) {
                    $chunkIdx++;
                    $offset = 0;
                    continue;
                }
                $take = min($count, $avail);
                $out .= substr($cur, $offset, $take);
                $offset += $take;
                $count -= $take;
            }
            return $out;
        };

        for ($i = 0; $i < $uniqueCount && $chunkIdx < count($chunks); $i++) {
            if ($offset >= strlen($chunks[$chunkIdx])) {
                $chunkIdx++;
                $offset = 0;
                if ($chunkIdx >= count($chunks)) {
                    break;
                }
            }
            $hdr = $readBytes(3);
            if (strlen($hdr) < 3) {
                break;
            }
            $cch = self::u16($hdr, 0);
            $flags = ord($hdr[2]);
            $isUnicode = ($flags & 0x01) !== 0;
            $hasExt = ($flags & 0x04) !== 0;
            $hasRich = ($flags & 0x08) !== 0;

            $richRuns = $hasRich ? self::u16($readBytes(2), 0) : 0;
            $extBytes = $hasExt ? self::u32($readBytes(4), 0) : 0;

            $charsOut = '';
            $rem = $cch;
            while ($rem > 0 && $chunkIdx < count($chunks)) {
                if ($offset >= strlen($chunks[$chunkIdx])) {
                    $chunkIdx++;
                    $offset = 0;
                    if ($chunkIdx >= count($chunks)) {
                        break;
                    }
                    // Each CONTINUE chunk inside a string begins with 1-byte option flags!
                    $contFlag = ord($chunks[$chunkIdx][0]);
                    $offset = 1;
                    $isUnicode = ($contFlag & 0x01) !== 0;
                }
                $avail = strlen($chunks[$chunkIdx]) - $offset;
                $bpc = $isUnicode ? 2 : 1;
                $canTakeChars = min($rem, intdiv($avail, $bpc));
                if ($canTakeChars <= 0) {
                    $chunkIdx++;
                    $offset = 0;
                    continue;
                }
                $slice = substr($chunks[$chunkIdx], $offset, $canTakeChars * $bpc);
                $charsOut .= self::decodeBiffStringSlice($slice, $canTakeChars, $isUnicode);
                $offset += $canTakeChars * $bpc;
                $rem -= $canTakeChars;
            }
            if ($richRuns > 0) {
                $readBytes($richRuns * 4);
            }
            if ($extBytes > 0) {
                $readBytes($extBytes);
            }
            $result[] = $charsOut;
        }
        return $result;
    }

    private static function decodeBiffStringSlice(string $bytes, int $cch, bool $isUnicode): string
    {
        if ($cch <= 0 || $bytes === '') {
            return '';
        }
        if ($isUnicode) {
            $take = min(strlen($bytes), $cch * 2);
            $slice = substr($bytes, 0, $take);
            if (function_exists('mb_convert_encoding')) {
                return (string) mb_convert_encoding($slice, 'UTF-8', 'UTF-16LE');
            }
            $out = '';
            for ($i = 0; $i + 1 < strlen($slice); $i += 2) {
                $code = ord($slice[$i]) | (ord($slice[$i + 1]) << 8);
                $out .= $code < 128 ? chr($code) : '?';
            }
            return $out;
        }
        return substr($bytes, 0, min(strlen($bytes), $cch));
    }

    private static function decodeRk(int $rk): float
    {
        $isDiv100 = ($rk & 0x01) !== 0;
        $isInt = ($rk & 0x02) !== 0;
        if ($isInt) {
            $signed = $rk >> 2;
            if (($rk & 0x80000000) !== 0) {
                // Arithmetic sign extension on 64-bit PHP
                $signed = (($rk & 0x7FFFFFFF) >> 2) - 0x20000000;
            }
            $val = (float) $signed;
        } else {
            $highBits = $rk & ~0x03;
            $packed = pack('VV', 0, $highBits);
            $unpacked = unpack('d', $packed);
            $val = (float) ($unpacked[1] ?? 0.0);
        }
        return $isDiv100 ? ($val / 100.0) : $val;
    }

    public static function parseTimestampMs(mixed $raw): ?int
    {
        if ($raw === null) {
            return null;
        }
        if (is_int($raw) || is_float($raw)) {
            $num = (float) $raw;
            // Excel 1900 serial date range (roughly 1954 to 2077)
            if ($num >= 20000.0 && $num <= 75000.0) {
                $days = (int) floor($num);
                return ($days - 25569) * 86400000;
            }
            if ($num >= 1000000000000.0) {
                return (int) round($num);
            }
            if ($num >= 100000000.0 && $num < 100000000000.0) {
                return (int) round($num * 1000.0);
            }
            return null;
        }

        $s = trim((string) $raw);
        if ($s === '') {
            return null;
        }
        if (is_numeric($s)) {
            return self::parseTimestampMs((float) $s);
        }
        // Handle SpreadsheetML ISO date strings like 1987-05-20T00:00:00.000
        if (preg_match('/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/', $s, $m)) {
            $ts = strtotime($m[1] . ' ' . $m[2] . ' UTC');
            return $ts !== false ? ($ts * 1000) : null;
        }
        $hasTz = (bool) preg_match('/(?:Z|[+-]\d{2}:?\d{2}|\bUTC|\bGMT)\s*$/i', $s);
        $suffix = $hasTz ? '' : (str_contains($s, ':') ? ' UTC' : ' 00:00:00 UTC');
        $ts = strtotime($s . $suffix);
        return $ts !== false ? ($ts * 1000) : null;
    }

    private static function parseNumeric(mixed $raw): ?float
    {
        if ($raw === null) {
            return null;
        }
        if (is_int($raw) || is_float($raw)) {
            $v = (float) $raw;
            return is_finite($v) ? $v : null;
        }
        $s = trim((string) $raw);
        if ($s === '' || $s === '.' || strcasecmp($s, 'na') === 0 || strcasecmp($s, 'n/a') === 0 || strcasecmp($s, 'null') === 0) {
            return null;
        }
        $clean = str_replace([',', '$', ' '], '', $s);
        return is_numeric($clean) ? (float) $clean : null;
    }

    private static function stripUtf8Bom(string $s): string
    {
        return str_starts_with($s, "\xEF\xBB\xBF") ? substr($s, 3) : $s;
    }

    private static function u16(string $b, int $o): int
    {
        return ord($b[$o]) | (ord($b[$o + 1]) << 8);
    }

    private static function u32(string $b, int $o): int
    {
        return ord($b[$o]) | (ord($b[$o + 1]) << 8) | (ord($b[$o + 2]) << 16) | (ord($b[$o + 3]) << 24);
    }

    private static function i32(string $b, int $o): int
    {
        $u = self::u32($b, $o);
        return ($u & 0x80000000) !== 0 ? ($u - 0x100000000) : $u;
    }

    private static function f64(string $b, int $o): float
    {
        $u = unpack('d', substr($b, $o, 8));
        return (float) ($u[1] ?? 0.0);
    }
}
