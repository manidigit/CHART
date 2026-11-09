<?php
declare(strict_types=1);

namespace ChartIntelligence\Providers;

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Algorithms\TimeframeAggregator;
use ChartIntelligence\Algorithms\UtcTimeAnchor;

/**
 * Provider Adapter for TradingView `tvdatafeed` (`PEPPERSTONE:SPOTBRENT`, `OANDA:XAUUSD`, etc.).
 *
 * Ensures that pressing Sync when the market is open always updates all closed candles
 * from the last stored candle right up to `$nowMs` across M15, H1, and H4 (while keeping
 * D1 strictly for closed daily sessions):
 *  1. Reads historical candles from `data/tvdatafeed/{SYMBOL}_{TF}.json` / `.csv`.
 *  2. Detects if the latest stored candle is behind the latest closed UTC bucket (`nowMs - stepMs`).
 *  3. Connects directly via pure-PHP WebSocket (`tls://data.tradingview.com:443`) to fetch
 *     all newly closed bars since the last stored candle (with Python CLI and Yahoo Finance
 *     gap-fill fallbacks if outbound WebSocket is restricted on the host).
 *  4. Merges idempotently and persists the updated JSON back to `data/tvdatafeed/`.
 */
final class TvDatafeedAdapter
{
    public static function fetchClosedCandles(
        string $symbol,
        string $timeframe,
        int $limit,
        int $nowMs,
        bool $tryLiveCli = true
    ): array {
        $cleanSymbol = strtoupper(preg_replace('/[^A-Za-z0-9_]/', '', $symbol));
        $normTf = strtoupper($timeframe);
        if (!in_array($normTf, ['M15', 'H1', 'H4', 'D1'], true)) {
            $normTf = 'M15';
        }

        $exchange = match ($cleanSymbol) {
            'XAUUSD', 'XAGUSD', 'EURUSD' => 'OANDA',
            'BRENT_FUTURES' => 'NYMEX',
            default => 'PEPPERSTONE',
        };
        $tvSymbol = $cleanSymbol === 'BRENT_FUTURES' ? 'BZ1!' : $cleanSymbol;

        $baseDir = dirname(__DIR__, 3);
        $dataDir = $baseDir . '/data/tvdatafeed';
        $scriptPath = $baseDir . '/scripts/sync_tvdatafeed.py';

        // 1. Load full existing historical series (up to 5,000 bars)
        $existing = self::readFromNormalizedJson($dataDir, $cleanSymbol, $normTf, 5000, $nowMs);
        if (empty($existing)) {
            $existing = self::readFromCsvFile($dataDir, $cleanSymbol, $normTf, 5000, $nowMs);
        }

        $stepMs = UtcTimeAnchor::stepMilliseconds($normTf);
        $lastStoredOpenMs = !empty($existing)
            ? (int) $existing[count($existing) - 1]['open_time_utc_ms']
            : 0;

        $expectedLastClosedOpenMs = self::computeExpectedLastClosedOpenMs($normTf, $nowMs);
        $needsIncrementalSync = $lastStoredOpenMs < $expectedLastClosedOpenMs;

        if ($needsIncrementalSync || $tryLiveCli) {
            $gapBars = $lastStoredOpenMs > 0
                ? (int) ceil(max(0, $nowMs - $lastStoredOpenMs) / max(1, $stepMs)) + 32
                : $limit;
            $barsToFetch = max(120, min(1500, $gapBars));

            // Primary: Pure PHP TradingView WebSocket Client (works on shared hosts without exec)
            $liveCandles = self::fetchLiveFromTradingViewWs($tvSymbol, $exchange, $normTf, $barsToFetch, $nowMs);

            // Secondary: If H4, also aggregate closed H1 bars from TradingView so 00:00/04:00/08:00/12:00/16:00/20:00 UTC buckets are exact
            if ($normTf === 'H4') {
                $liveH1 = self::fetchLiveFromTradingViewWs($tvSymbol, $exchange, 'H1', min(1500, $barsToFetch * 4), $nowMs);
                if (!empty($liveH1)) {
                    $aggH4 = TimeframeAggregator::aggregateCandles($liveH1, 'H4', $nowMs);
                    $liveCandles = self::mergeCandlesByOpenMs($liveCandles, $aggH4, 'H4', $nowMs);
                }
            }

            // Tertiary: Python CLI fallback if socket was blocked and exec() is enabled
            if (empty($liveCandles) && is_file($scriptPath) && function_exists('exec')) {
                $cmd = sprintf(
                    'python3 %s --symbol %s --exchange %s --bars %d --output-dir %s 2>/dev/null',
                    escapeshellarg($scriptPath),
                    escapeshellarg($cleanSymbol),
                    escapeshellarg($exchange),
                    max(300, min(5000, $limit)),
                    escapeshellarg($dataDir)
                );
                @exec($cmd);
                $reloaded = self::readFromNormalizedJson($dataDir, $cleanSymbol, $normTf, 5000, $nowMs);
                if (!empty($reloaded)) {
                    $existing = self::mergeCandlesByOpenMs($existing, $reloaded, $normTf, $nowMs);
                }
            }

            // Quaternary: Yahoo Finance incremental gap-fill for candles newer than $lastStoredOpenMs
            if (empty($liveCandles) && $needsIncrementalSync) {
                $yahooBars = YahooFinanceAdapter::fetchClosedCandles($cleanSymbol, $normTf, 300, $nowMs);
                if (!empty($yahooBars)) {
                    $newerOnly = array_values(array_filter(
                        $yahooBars,
                        static fn(array $b): bool => (int) ($b['open_time_utc_ms'] ?? 0) > $lastStoredOpenMs
                    ));
                    $liveCandles = $newerOnly;
                }
            }

            if (!empty($liveCandles)) {
                $existing = self::mergeCandlesByOpenMs($existing, $liveCandles, $normTf, $nowMs);
                self::persistNormalizedJson($dataDir, $cleanSymbol, $exchange, $normTf, $existing, $nowMs);
            }
        }

        // If higher timeframe (H1/H4) is requested and M15 has newer closed bars, merge aggregated M15
        if (in_array($normTf, ['H1', 'H4'], true)) {
            $m15 = self::readFromNormalizedJson($dataDir, $cleanSymbol, 'M15', 1500, $nowMs);
            if (!empty($m15)) {
                $cleanM15 = CandleValidator::filterSyntheticWeekendAndCombCandles($m15, $cleanSymbol, 'M15');
                $aggregated = TimeframeAggregator::aggregateCandles($cleanM15, $normTf, $nowMs);
                if (!empty($aggregated)) {
                    $existing = self::mergeCandlesByOpenMs($existing, $aggregated, $normTf, $nowMs);
                }
            }
        }

        if (!empty($existing)) {
            $filtered = CandleValidator::filterSyntheticWeekendAndCombCandles($existing, $cleanSymbol, $normTf);
            return array_slice($filtered, -$limit);
        }

        return [];
    }

    /**
     * Computes the open timestamp (UTC ms) of the most recent candle that SHOULD be closed at `$nowMs`,
     * accounting for weekend market closure (Saturday all day, Sunday before 22:00 UTC).
     */
    public static function computeExpectedLastClosedOpenMs(string $timeframe, int $nowMs): int
    {
        $stepMs = UtcTimeAnchor::stepMilliseconds($timeframe);
        $currentBucketOpenMs = UtcTimeAnchor::snapToOpenUtcMs($nowMs, $timeframe);
        $candidateOpenMs = $currentBucketOpenMs - $stepMs;

        $nowSec = (int) floor($nowMs / 1000);
        $dow = (int) gmdate('w', $nowSec); // 0 = Sun, 1 = Mon, ..., 6 = Sat
        $hour = (int) gmdate('G', $nowSec);

        if ($timeframe === 'D1') {
            // Daily candle for Monday does not close until Tuesday 00:00 UTC.
            // On Saturday (6), Sunday (0), and Monday (1), the last closed daily bar is Friday 00:00 UTC.
            $todayMidnightMs = UtcTimeAnchor::snapToOpenUtcMs($nowMs, 'D1');
            if ($dow === 1) {
                return $todayMidnightMs - (3 * 86400000);
            }
            if ($dow === 0) {
                return $todayMidnightMs - (2 * 86400000);
            }
            if ($dow === 6) {
                return $todayMidnightMs - 86400000;
            }
            return $todayMidnightMs - 86400000;
        }

        // Intraday (M15, H1, H4): during weekend closure, last closed candle is Friday 21:45 / 21:00 / 20:00 UTC
        if ($dow === 6 || ($dow === 0 && $hour < 23)) {
            $daysBackToFriday = $dow === 6 ? 1 : 2;
            $fridayMidnightMs = UtcTimeAnchor::snapToOpenUtcMs($nowMs, 'D1') - ($daysBackToFriday * 86400000);
            return match ($timeframe) {
                'H4' => $fridayMidnightMs + (20 * 3600000),
                'H1' => $fridayMidnightMs + (21 * 3600000),
                default => $fridayMidnightMs + (21 * 3600000) + (45 * 60000),
            };
        }

        return $candidateOpenMs;
    }

    /**
     * Pure-PHP TradingView WebSocket client (`wss://data.tradingview.com/socket.io/websocket`).
     * Fetches closed OHLCV candles without requiring `exec()` or Python on the host.
     */
    private static function fetchLiveFromTradingViewWs(
        string $tvSymbol,
        string $exchange,
        string $timeframe,
        int $nBars,
        int $nowMs
    ): array {
        $tvCode = match ($timeframe) {
            'M15' => '15',
            'H1' => '60',
            'H4' => '240',
            'D1' => '1D',
            default => '15',
        };
        $stepMs = UtcTimeAnchor::stepMilliseconds($timeframe);

        $ctx = stream_context_create([
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);

        $sock = @stream_socket_client(
            'tls://data.tradingview.com:443',
            $errno,
            $errstr,
            8.0,
            STREAM_CLIENT_CONNECT,
            $ctx
        );
        if (!is_resource($sock)) {
            return [];
        }

        stream_set_timeout($sock, 8);

        try {
            $wsKey = base64_encode(random_bytes(16));
            $handshake = "GET /socket.io/websocket?from=chart%2F HTTP/1.1\r\n"
                . "Host: data.tradingview.com\r\n"
                . "Upgrade: websocket\r\n"
                . "Connection: Upgrade\r\n"
                . "Origin: https://www.tradingview.com\r\n"
                . "Sec-WebSocket-Key: {$wsKey}\r\n"
                . "Sec-WebSocket-Version: 13\r\n"
                . "User-Agent: Mozilla/5.0\r\n\r\n";

            @fwrite($sock, $handshake);

            $headerBuf = '';
            while (!str_contains($headerBuf, "\r\n\r\n") && !feof($sock)) {
                $chunk = @fread($sock, 2048);
                if ($chunk === false || $chunk === '') {
                    break;
                }
                $headerBuf .= $chunk;
            }

            if (!str_contains($headerBuf, '101')) {
                return [];
            }

            $chartSession = 'cs_' . bin2hex(random_bytes(6));
            $symJson = json_encode([
                'symbol' => $exchange . ':' . $tvSymbol,
                'adjustment' => 'splits',
                'session' => 'regular',
            ], JSON_UNESCAPED_SLASHES);

            self::wsSendText($sock, self::tvPackMsg('set_auth_token', ['unauthorized_user_token']));
            self::wsSendText($sock, self::tvPackMsg('chart_create_session', [$chartSession, '']));
            self::wsSendText($sock, self::tvPackMsg('switch_timezone', [$chartSession, 'Etc/UTC']));
            self::wsSendText($sock, self::tvPackMsg('resolve_symbol', [$chartSession, 'symbol_1', '=' . $symJson]));
            self::wsSendText($sock, self::tvPackMsg('create_series', [$chartSession, 's1', 's1', 'symbol_1', $tvCode, $nBars]));

            $rawBuffer = '';
            $deadline = microtime(true) + 8.5;
            while (microtime(true) < $deadline && !feof($sock)) {
                $frame = self::wsRecvFrame($sock);
                if ($frame === null) {
                    break;
                }
                if ($frame === '') {
                    continue;
                }
                if (str_starts_with($frame, '~m~') && str_contains($frame, '~h~')) {
                    self::wsSendText($sock, $frame);
                    continue;
                }
                $rawBuffer .= $frame;
                if (str_contains($rawBuffer, '"series_completed"') || str_contains($frame, '"symbol_error"')) {
                    break;
                }
            }

            if ($rawBuffer === '') {
                return [];
            }

            $result = [];
            if (preg_match_all('/"s":\[(\{"i":.*?\})\]/s', $rawBuffer, $matches)) {
                foreach ($matches[1] as $inner) {
                    $items = json_decode('[' . $inner . ']', true);
                    if (!is_array($items)) {
                        continue;
                    }
                    foreach ($items as $item) {
                        $v = $item['v'] ?? null;
                        if (!is_array($v) || count($v) < 5) {
                            continue;
                        }
                        $epochSec = (int) round((float) $v[0]);
                        $rawMs = $epochSec * 1000;

                        if ($timeframe === 'D1') {
                            // Daily sessions opening 21:00-23:59 UTC belong to the next UTC calendar day
                            $hourUtc = (int) gmdate('G', $epochSec);
                            $adjustedMs = $hourUtc >= 21 ? $rawMs + (4 * 3600000) : $rawMs;
                            $openMs = UtcTimeAnchor::snapToOpenUtcMs($adjustedMs, 'D1');
                            if ($rawMs + $stepMs > $nowMs || $openMs + $stepMs > $nowMs) {
                                continue;
                            }
                        } elseif ($timeframe === 'H4') {
                            $openMs = UtcTimeAnchor::snapToOpenUtcMs($rawMs, 'H4');
                            if ($rawMs + $stepMs > $nowMs || $openMs + $stepMs > $nowMs) {
                                continue;
                            }
                        } else {
                            $openMs = UtcTimeAnchor::snapToOpenUtcMs($rawMs, $timeframe);
                            if ($openMs + $stepMs > $nowMs) {
                                continue;
                            }
                        }

                        $c = CandleValidator::sanitizeCandle(
                            $openMs,
                            $timeframe,
                            $v[1],
                            $v[2],
                            $v[3],
                            $v[4],
                            $v[5] ?? 0
                        );
                        if ($c !== null) {
                            $result[$c['open_time_utc_ms']] = $c;
                        }
                    }
                }
            }

            ksort($result);
            return array_values($result);
        } catch (\Throwable) {
            return [];
        } finally {
            @fclose($sock);
        }
    }

    private static function tvPackMsg(string $func, array $params): string
    {
        $payload = json_encode(['m' => $func, 'p' => $params], JSON_UNESCAPED_SLASHES);
        return '~m~' . strlen((string) $payload) . '~m~' . $payload;
    }

    /**
     * @param resource $sock
     */
    private static function wsSendText($sock, string $text): void
    {
        $len = strlen($text);
        $header = chr(0x81);
        $mask = random_bytes(4);
        if ($len < 126) {
            $header .= chr(0x80 | $len);
        } elseif ($len < 65536) {
            $header .= chr(0x80 | 126) . pack('n', $len);
        } else {
            $header .= chr(0x80 | 127) . pack('J', $len);
        }
        $header .= $mask;
        $masked = '';
        for ($i = 0; $i < $len; $i++) {
            $masked .= $text[$i] ^ $mask[$i % 4];
        }
        @fwrite($sock, $header . $masked);
    }

    /**
     * @param resource $sock
     */
    private static function wsRecvFrame($sock): ?string
    {
        $first2 = self::readExact($sock, 2);
        if ($first2 === null) {
            return null;
        }
        $b0 = ord($first2[0]);
        $b1 = ord($first2[1]);
        $opcode = $b0 & 0x0F;
        $masked = ($b1 & 0x80) !== 0;
        $len = $b1 & 0x7F;

        if ($len === 126) {
            $ext = self::readExact($sock, 2);
            if ($ext === null) {
                return null;
            }
            $len = unpack('n', $ext)[1];
        } elseif ($len === 127) {
            $ext = self::readExact($sock, 8);
            if ($ext === null) {
                return null;
            }
            $len = unpack('J', $ext)[1];
        }

        $maskKey = '';
        if ($masked) {
            $maskKey = self::readExact($sock, 4) ?? '';
        }

        $payload = $len > 0 ? self::readExact($sock, (int) $len) : '';
        if ($payload === null) {
            return null;
        }
        if ($masked && $maskKey !== '') {
            for ($i = 0, $n = strlen($payload); $i < $n; $i++) {
                $payload[$i] = $payload[$i] ^ $maskKey[$i % 4];
            }
        }
        if ($opcode === 0x8) {
            return null;
        }
        if ($opcode === 0x9) {
            return '';
        }
        return $payload;
    }

    /**
     * @param resource $sock
     */
    private static function readExact($sock, int $length): ?string
    {
        $buf = '';
        while (strlen($buf) < $length && !feof($sock)) {
            $chunk = @fread($sock, $length - strlen($buf));
            if ($chunk === false || $chunk === '') {
                $meta = stream_get_meta_data($sock);
                if (!empty($meta['timed_out'])) {
                    return null;
                }
                break;
            }
            $buf .= $chunk;
        }
        return strlen($buf) === $length ? $buf : null;
    }

    private static function mergeCandlesByOpenMs(array $existing, array $incoming, string $timeframe, int $nowMs): array
    {
        $map = [];
        foreach ($existing as $bar) {
            $ms = (int) ($bar['open_time_utc_ms'] ?? 0);
            if ($ms > 0 && UtcTimeAnchor::isCandleClosed($ms, $timeframe, $nowMs)) {
                $map[$ms] = $bar;
            }
        }
        foreach ($incoming as $bar) {
            $ms = (int) ($bar['open_time_utc_ms'] ?? 0);
            if ($ms > 0 && UtcTimeAnchor::isCandleClosed($ms, $timeframe, $nowMs)) {
                $map[$ms] = $bar;
            }
        }
        ksort($map);
        return array_slice(array_values($map), -5000);
    }

    private static function persistNormalizedJson(
        string $dataDir,
        string $symbol,
        string $exchange,
        string $timeframe,
        array $candles,
        int $nowMs
    ): void {
        if (!is_dir($dataDir)) {
            @mkdir($dataDir, 0775, true);
        }
        $jsonFile = $dataDir . '/' . $symbol . '_' . $timeframe . '.json';
        $payload = json_encode([
            'symbol' => $symbol,
            'exchange' => $exchange,
            'provider' => 'tvdatafeed',
            'timeframe' => $timeframe,
            'synced_at_utc_ms' => $nowMs,
            'count' => count($candles),
            'candles' => array_values($candles),
        ], JSON_UNESCAPED_SLASHES);
        if ($payload !== false) {
            @file_put_contents($jsonFile, $payload, LOCK_EX);
        }
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
            if ($timeframe === 'D1') {
                $dow = (int) gmdate('w', (int) floor($openMs / 1000));
                if ($dow === 0 || $dow === 6) {
                    continue;
                }
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
        $stepMs = UtcTimeAnchor::stepMilliseconds($timeframe);

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
            $rawMs = $tsSec * 1000;
            if ($timeframe === 'D1') {
                $hourUtc = (int) gmdate('G', $tsSec);
                $adjustedMs = $hourUtc >= 21 ? $rawMs + (4 * 3600000) : $rawMs;
                $openMs = UtcTimeAnchor::snapToOpenUtcMs($adjustedMs, 'D1');
                if ($rawMs + $stepMs > $nowMs || $openMs + $stepMs > $nowMs) {
                    continue;
                }
            } else {
                $openMs = UtcTimeAnchor::snapToOpenUtcMs($rawMs, $timeframe);
                if ($rawMs + $stepMs > $nowMs || !UtcTimeAnchor::isCandleClosed($openMs, $timeframe, $nowMs)) {
                    continue;
                }
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
