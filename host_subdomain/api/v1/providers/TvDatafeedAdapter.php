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
 * from the last stored candle in MariaDB right up to `$nowMs` across M15, M30, H1, H4,
 * D1, and W1:
 *  1. Computes the incremental delta needed from `$sinceOpenMs` (latest candle in MariaDB).
 *  2. Connects directly via pure-PHP WebSocket (`tls://data.tradingview.com:443`) to fetch
 *     all newly closed bars without creating or reading static CSV/JSON files on disk.
 *  3. Returns sanitized closed candles for direct persistence into MariaDB (`candles` table).
 */
final class TvDatafeedAdapter
{
    public static string $lastError = '';

    public static function fetchClosedCandles(
        string $symbol,
        string $timeframe,
        int $limit,
        int $nowMs,
        bool $tryLiveCli = true,
        int $sinceOpenMs = 0
    ): array {
        self::$lastError = '';
        $cleanSymbol = strtoupper(preg_replace('/[^A-Za-z0-9_]/', '', $symbol));
        $normTf = strtoupper($timeframe);
        if (!in_array($normTf, ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'], true)) {
            $normTf = 'M15';
        }

        $exchange = match ($cleanSymbol) {
            'XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'SPX500USD' => 'OANDA',
            'BRENT_FUTURES' => 'NYMEX',
            'USOIL' => 'TVC',
            'BTCUSD', 'ETHUSD' => 'BITSTAMP',
            'NDQ', 'NVDA', 'AMZN', 'TSLA', 'AAPL', 'GOOGL', 'MSFT', 'META', 'NFLX', 'AMD',
            'AVGO', 'MU', 'INTC', 'MRVL', 'AMAT', 'LRCX', 'QCOM', 'SMCI', 'SNDK',
            'PLTR', 'ADBE', 'CRWD', 'CSCO', 'APP', 'NBIS', 'CRWV', 'RKLB', 'RIVN',
            'HOOD', 'MSTR', 'PYPL', 'COIN', 'COST', 'SBUX', 'ASML' => 'NASDAQ',
            'UBER', 'NKE', 'IBM', 'SAN',
            'DELL', 'ANET', 'ORCL', 'CRM', 'GEV', 'BE', 'IONQ',
            'JPM', 'BAC', 'GS', 'V', 'MA', 'BRKB', 'WMT', 'DIS', 'MCD', 'KO',
            'LLY', 'UNH', 'PFE', 'XOM', 'CVX', 'TSM', 'BABA', 'NVO', 'TM', 'SAP', 'HSBC' => 'NYSE',
            'SPCX' => 'AMEX',
            'SSNLF' => 'OTC',
            'SKHY' => 'KRX',
            '2222SR' => 'TADAWUL',
            default => 'PEPPERSTONE',
        };
        $tvSymbol = match ($cleanSymbol) {
            'BRENT_FUTURES' => 'BZ1!',
            'NDQ' => 'NDX',
            'BRKB' => 'BRK.B',
            'SKHY' => '000660',
            '2222SR' => '2222',
            default => $cleanSymbol,
        };

        $stepMs = UtcTimeAnchor::stepMilliseconds($normTf);
        $lastStoredOpenMs = $sinceOpenMs > 0 ? $sinceOpenMs : 0;
        $hasShallowHistory = $sinceOpenMs <= 0;
        $expectedLastClosedOpenMs = self::computeExpectedLastClosedOpenMs($normTf, $nowMs, $cleanSymbol);
        $needsIncrementalSync = $lastStoredOpenMs < $expectedLastClosedOpenMs;

        $existing = [];
        if ($needsIncrementalSync || ($hasShallowHistory && $tryLiveCli)) {
            $gapBars = ($lastStoredOpenMs > 0 && !$hasShallowHistory)
                ? (int) ceil(max(0, $nowMs - $lastStoredOpenMs) / max(1, $stepMs)) + 16
                : $limit;
            $barsToFetch = ($lastStoredOpenMs > 0 && !$hasShallowHistory)
                ? max(16, min(1500, $gapBars))
                : max(500, min(1500, $gapBars));

            // Primary: Pure PHP TradingView WebSocket Client (MariaDB-only, no static disk files)
            $liveCandles = self::fetchLiveFromTradingViewWs($tvSymbol, $exchange, $normTf, $barsToFetch, $nowMs);

            // Secondary: On H4, only fetch & aggregate H1 if primary H4 bars are empty or still behind $expectedLastClosedOpenMs
            if ($normTf === 'H4') {
                $latestPrimaryMs = !empty($liveCandles) ? (int) $liveCandles[count($liveCandles) - 1]['open_time_utc_ms'] : 0;
                if ($latestPrimaryMs < $expectedLastClosedOpenMs) {
                    $liveH1 = self::fetchLiveFromTradingViewWs($tvSymbol, $exchange, 'H1', min(1500, $barsToFetch * 4), $nowMs);
                    if (!empty($liveH1)) {
                        $aggH4 = TimeframeAggregator::aggregateCandles($liveH1, 'H4', $nowMs, $cleanSymbol);
                        $liveCandles = self::mergeCandlesByOpenMs($liveCandles, $aggH4, 'H4', $nowMs);
                    }
                }
            }

            // Strict Provider Isolation: Never substitute Yahoo Finance bars into tvdatafeed series.
            if (!empty($liveCandles)) {
                self::$lastError = '';
                $existing = self::mergeCandlesByOpenMs($existing, $liveCandles, $normTf, $nowMs);
            } elseif (self::$lastError === '') {
                self::$lastError = 'tvdatafeed WebSocket returned no new bars';
            }
        }

        if (!empty($existing)) {
            $filtered = CandleValidator::filterSyntheticWeekendAndCombCandles($existing, $cleanSymbol, $normTf);
            if ($sinceOpenMs > 0) {
                $filtered = array_values(array_filter(
                    $filtered,
                    static fn(array $b): bool => (int) ($b['open_time_utc_ms'] ?? 0) > $sinceOpenMs
                ));
            }
            return array_slice($filtered, -$limit);
        }

        return [];
    }

    /**
     * Computes the open timestamp (UTC ms) of the most recent candle that SHOULD be closed at `$nowMs`,
     * accounting for the asset's session calendar (`CRYPTO_24_7`, `OTC_FX_METALS`, `US_EQUITIES`).
     */
    public static function computeExpectedLastClosedOpenMs(string $timeframe, int $nowMs, string $symbolCode = 'XAUUSD'): int
    {
        $normTf = strtoupper($timeframe);
        $stepMs = UtcTimeAnchor::stepMilliseconds($normTf);
        $currentBucketOpenMs = UtcTimeAnchor::snapToOpenUtcMs($nowMs, $normTf);
        $candidateOpenMs = $currentBucketOpenMs - $stepMs;

        if ($normTf === 'W1') {
            return $candidateOpenMs;
        }

        $calendar = UtcTimeAnchor::getSessionCalendar($symbolCode);
        if ($calendar === UtcTimeAnchor::CALENDAR_CRYPTO_24_7) {
            return $candidateOpenMs;
        }

        $nowSec = (int) floor($nowMs / 1000);
        $dow = (int) gmdate('w', $nowSec); // 0 = Sun, 1 = Mon, ..., 6 = Sat
        $hour = (int) gmdate('G', $nowSec);

        if ($normTf === 'D1') {
            $todayMidnightMs = UtcTimeAnchor::snapToOpenUtcMs($nowMs, 'D1');
            if ($dow === 1) {
                return $todayMidnightMs - (3 * 86400000);
            }
            if ($dow === 0) {
                return $todayMidnightMs - (2 * 86400000);
            }
            return $todayMidnightMs - 86400000;
        }

        if ($calendar === UtcTimeAnchor::CALENDAR_US_EQUITIES && ($dow === 6 || $dow === 0)) {
            $daysBackToFriday = $dow === 6 ? 1 : 2;
            $fridayMidnightMs = UtcTimeAnchor::snapToOpenUtcMs($nowMs, 'D1') - ($daysBackToFriday * 86400000);
            return match ($normTf) {
                'H4' => $fridayMidnightMs + (16 * 3600000),
                'H1' => $fridayMidnightMs + (20 * 3600000),
                'M30' => $fridayMidnightMs + (20 * 3600000) + (30 * 60000),
                default => $fridayMidnightMs + (20 * 3600000) + (45 * 60000),
            };
        }

        // Intraday OTC (M15, H1, H4): during weekend closure, last closed candle is Friday 21:45 / 21:00 / 20:00 UTC
        if ($dow === 6 || ($dow === 0 && $hour < 23)) {
            $daysBackToFriday = $dow === 6 ? 1 : 2;
            $fridayMidnightMs = UtcTimeAnchor::snapToOpenUtcMs($nowMs, 'D1') - ($daysBackToFriday * 86400000);
            return match ($normTf) {
                'H4' => $fridayMidnightMs + (20 * 3600000),
                'H1' => $fridayMidnightMs + (21 * 3600000),
                'M30' => $fridayMidnightMs + (21 * 3600000) + (30 * 60000),
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
            'M30' => '30',
            'H1' => '60',
            'H4' => '240',
            'D1' => '1D',
            'W1' => '1W',
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
            4.5,
            STREAM_CLIENT_CONNECT,
            $ctx
        );
        if (!is_resource($sock)) {
            return [];
        }

        stream_set_timeout($sock, 4);

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
            $deadline = microtime(true) + 4.5;
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
}
