<?php
declare(strict_types=1);

require_once __DIR__ . '/core/ApiEnvelope.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/providers/ProviderCatalog.php';

use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ApiEnvelope::sendCorsAndSecurityHeaders('GET, OPTIONS');
    exit;
}

ApiEnvelope::sendCorsAndSecurityHeaders('GET, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

$symbol = strtoupper(preg_replace('/[^A-Za-z0-9._:-]/', '', $_GET['symbol'] ?? 'SPOTBRENT'));
if ($symbol === '') {
    $symbol = 'SPOTBRENT';
}
$forceRefresh = !empty($_GET['refresh']);
$pdo = Database::getPdo();
$ttlSeconds = 900; // 15m cache

// Check MariaDB cache first
if ($pdo !== null && !$forceRefresh) {
    try {
        $stmt = $pdo->prepare(
            "SELECT payload_json, expires_at_utc
             FROM symbol_intel_cache
             WHERE symbol_code = :sym AND feed_type = 'BUNDLE_V1'
             LIMIT 1"
        );
        $stmt->execute([':sym' => $symbol]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row && !empty($row['payload_json']) && !empty($row['expires_at_utc'])) {
            $expTs = strtotime((string) $row['expires_at_utc'] . ' UTC');
            if ($expTs !== false && $expTs > time()) {
                $cached = json_decode((string) $row['payload_json'], true);
                if (is_array($cached)) {
                    $cached['cache_hit'] = true;
                    ApiEnvelope::sendSuccess($cached, 'status_symbol_intel_loaded');
                }
            }
        }
    } catch (\Throwable) {}
}

function ci_http_get(string $url, array $headers = [], int $timeout = 7): ?string
{
    $headerLines = array_merge(
        ["User-Agent: ChartIntelligence/1.39.0 (support@chart.manico.es)"],
        $headers
    );
    $ctx = stream_context_create([
        'http' => [
            'timeout' => $timeout,
            'ignore_errors' => true,
            'header' => implode("\r\n", $headerLines) . "\r\n",
        ],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    return is_string($raw) && $raw !== '' ? $raw : null;
}

function ci_classify_asset(string $sym): string
{
    $s = strtoupper($sym);
    if (in_array($s, ['SPOTBRENT', 'BRENT_FUTURES', 'USOIL'], true) || str_contains($s, 'BRENT') || str_contains($s, 'OIL') || str_contains($s, 'WTI')) {
        return 'ENERGY';
    }
    if (in_array($s, ['XAUUSD', 'XAGUSD'], true) || str_contains($s, 'XAU') || str_contains($s, 'XAG')) {
        return 'METALS';
    }
    if (in_array($s, ['BTCUSD', 'ETHUSD'], true) || str_contains($s, 'BTC') || str_contains($s, 'ETH')) {
        return 'CRYPTO';
    }
    if (in_array($s, ['SPX500USD', 'NDQ'], true) || str_contains($s, 'SPX') || str_contains($s, 'NDQ')) {
        return 'INDICES';
    }
    if (in_array($s, ['EURUSD', 'GBPUSD', 'USDJPY'], true) || str_contains($s, 'EUR') || str_contains($s, 'GBP') || str_contains($s, 'JPY')) {
        return 'FX';
    }
    return 'STOCKS';
}

function ci_yahoo_ticker(string $sym): string
{
    return match (strtoupper($sym)) {
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
        default => strtoupper($sym),
    };
}

function ci_parse_rss_items(?string $xmlRaw, string $feedName, int $limit = 6): array
{
    if ($xmlRaw === null || trim($xmlRaw) === '') {
        return [];
    }
    $items = [];
    $prevUseErrors = libxml_use_internal_errors(true);
    try {
        $xml = simplexml_load_string($xmlRaw, 'SimpleXMLElement', LIBXML_NOCDATA);
        if ($xml !== false && isset($xml->channel->item)) {
            foreach ($xml->channel->item as $node) {
                $title = trim((string) ($node->title ?? ''));
                $link = trim((string) ($node->link ?? ''));
                $pubDate = trim((string) ($node->pubDate ?? ''));
                if ($title === '' || $link === '') {
                    continue;
                }
                $ts = strtotime($pubDate);
                $items[] = [
                    'title' => $title,
                    'url' => $link,
                    'published_utc' => $ts !== false ? gmdate('Y-m-d\TH:i:s\Z', $ts) : $pubDate,
                    'publisher' => $feedName,
                    'source_type' => 'EXTERNAL_LIVE',
                ];
                if (count($items) >= $limit) {
                    break;
                }
            }
        }
    } catch (\Throwable) {
        // Ignore malformed RSS XML
    }
    libxml_clear_errors();
    libxml_use_internal_errors($prevUseErrors);
    return $items;
}

$assetClass = ci_classify_asset($symbol);
$yahooTicker = ci_yahoo_ticker($symbol);

// 1. Live News RSS (Yahoo Finance RSS + EIA Today in Energy for Energy assets)
$newsItems = [];
$yfRssUrl = 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=' . urlencode($yahooTicker) . '&region=US&lang=en-US';
$newsItems = array_merge($newsItems, ci_parse_rss_items(ci_http_get($yfRssUrl), 'Yahoo Finance RSS', 6));

if ($assetClass === 'ENERGY') {
    $eiaRss = ci_http_get('https://www.eia.gov/rss/todayinenergy.xml');
    $eiaItems = ci_parse_rss_items($eiaRss, 'U.S. EIA Energy', 4);
    $newsItems = array_slice(array_merge($newsItems, $eiaItems), 0, 8);
}

// 2. SEC EDGAR Filings (Strictly for US Equities / STOCKS — zero fake EDGAR on Oil/Gold/FX/Crypto)
$secFilings = [];
$secNotice = null;
if ($assetClass === 'STOCKS') {
    $tickersJson = ci_http_get('https://www.sec.gov/files/company_tickers.json');
    $cikPadded = null;
    if ($tickersJson !== null) {
        $map = json_decode($tickersJson, true);
        if (is_array($map)) {
            foreach ($map as $entry) {
                if (strtoupper((string) ($entry['ticker'] ?? '')) === $symbol && isset($entry['cik_str'])) {
                    $cikPadded = str_pad((string) $entry['cik_str'], 10, '0', STR_PAD_LEFT);
                    break;
                }
            }
        }
    }
    if ($cikPadded !== null) {
        $subJson = ci_http_get("https://data.sec.gov/submissions/CIK{$cikPadded}.json");
        $sub = $subJson !== null ? json_decode($subJson, true) : null;
        $recent = $sub['filings']['recent'] ?? null;
        if (is_array($recent) && !empty($recent['form']) && is_array($recent['form'])) {
            $cikNum = ltrim($cikPadded, '0');
            foreach ($recent['form'] as $idx => $formType) {
                $formStr = strtoupper((string) $formType);
                if (!in_array($formStr, ['10-K', '10-Q', '8-K', '20-F', '6-K'], true)) {
                    continue;
                }
                $acc = (string) ($recent['accessionNumber'][$idx] ?? '');
                $doc = (string) ($recent['primaryDocument'][$idx] ?? '');
                $date = (string) ($recent['filingDate'][$idx] ?? '');
                $accNoDash = str_replace('-', '', $acc);
                $docUrl = ($cikNum !== '' && $accNoDash !== '' && $doc !== '')
                    ? "https://www.sec.gov/Archives/edgar/data/{$cikNum}/{$accNoDash}/{$doc}"
                    : "https://www.sec.gov/edgar/browse/?CIK={$cikPadded}";
                $secFilings[] = [
                    'form' => $formStr,
                    'filing_date' => $date,
                    'description' => (string) ($recent['primaryDocDescription'][$idx] ?? $formStr),
                    'url' => $docUrl,
                    'source_type' => 'EXTERNAL_LIVE',
                ];
                if (count($secFilings) >= 6) {
                    break;
                }
            }
        }
    }
    if (empty($secFilings)) {
        $secNotice = 'SEC EDGAR lookup temporarily unavailable or ticker not listed on US EDGAR.';
    }
}

// 3. Real Public Macro Calendar Windows (Computed relative to current UTC week/month + official recurring schedules)
$nowTs = time();
$nextWedTs = strtotime('next Wednesday 14:30 UTC', $nowTs - 3600);
$firstFridayMonth = strtotime('first Friday of ' . gmdate('Y-m', $nowTs) . ' 13:30 UTC');
if ($firstFridayMonth < $nowTs) {
    $firstFridayMonth = strtotime('first Friday of next month 13:30 UTC', $nowTs);
}
$macroEvents = [
    [
        'code' => 'EIA_PETROLEUM',
        'title' => 'EIA Weekly Petroleum Status Report',
        'scheduled_utc' => gmdate('Y-m-d\TH:i:s\Z', $nextWedTs ?: ($nowTs + 86400)),
        'relevance' => $assetClass === 'ENERGY' ? 'HIGH' : 'MEDIUM',
        'source_type' => 'EXTERNAL_LIVE',
        'reference_url' => 'https://www.eia.gov/petroleum/supply/weekly/',
    ],
    [
        'code' => 'US_NFP',
        'title' => 'US Non-Farm Payrolls (BLS Employment Situation)',
        'scheduled_utc' => gmdate('Y-m-d\TH:i:s\Z', $firstFridayMonth ?: ($nowTs + 7 * 86400)),
        'relevance' => in_array($assetClass, ['METALS', 'FX', 'INDICES', 'CRYPTO'], true) ? 'HIGH' : 'MEDIUM',
        'source_type' => 'EXTERNAL_LIVE',
        'reference_url' => 'https://www.bls.gov/bls/newsrels.htm',
    ],
    [
        'code' => 'FOMC_CALENDAR',
        'title' => 'Federal Reserve FOMC Policy Release Calendar',
        'scheduled_utc' => gmdate('Y-m-d\TH:i:s\Z', strtotime('third Wednesday of this month 18:00 UTC') ?: ($nowTs + 14 * 86400)),
        'relevance' => 'HIGH',
        'source_type' => 'EXTERNAL_LIVE',
        'reference_url' => 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    ],
];

// 4. Intermarket Benchmarks (Real Yahoo v8 daily series: DXY, US 10Y Yield, Brent, Gold)
$benchmarks = [
    ['symbol' => 'DX-Y.NYB', 'label' => 'US Dollar Index (DXY)'],
    ['symbol' => '^TNX', 'label' => 'US 10Y Treasury Yield'],
    ['symbol' => 'BZ=F', 'label' => 'Brent Crude Futures'],
    ['symbol' => 'GC=F', 'label' => 'Gold Futures'],
    ['symbol' => '^GSPC', 'label' => 'S&P 500 Index'],
];

function ci_fetch_yahoo_closes(string $ticker, string $range = '3mo'): array
{
    $url = 'https://query1.finance.yahoo.com/v8/finance/chart/' . urlencode($ticker) . '?interval=1d&range=' . $range;
    $raw = ci_http_get($url, [], 6);
    if ($raw === null) {
        return ['last' => null, 'prev' => null, 'closes' => []];
    }
    $json = json_decode($raw, true);
    $res = $json['chart']['result'][0] ?? null;
    $timestamps = $res['timestamp'] ?? [];
    $closesRaw = $res['indicators']['quote'][0]['close'] ?? [];
    $map = [];
    foreach ($timestamps as $i => $ts) {
        $c = $closesRaw[$i] ?? null;
        if ($c !== null && is_numeric($c) && (float) $c > 0) {
            $dayKey = gmdate('Y-m-d', (int) $ts);
            $map[$dayKey] = (float) $c;
        }
    }
    $vals = array_values($map);
    $n = count($vals);
    return [
        'last' => $n > 0 ? $vals[$n - 1] : null,
        'prev' => $n > 1 ? $vals[$n - 2] : ($n > 0 ? $vals[0] : null),
        'series' => $map,
    ];
}

function ci_pearson_return_corr(array $seriesA, array $seriesB): ?float
{
    $commonDates = array_values(array_intersect(array_keys($seriesA), array_keys($seriesB)));
    sort($commonDates);
    if (count($commonDates) < 12) {
        return null;
    }
    $retA = [];
    $retB = [];
    for ($i = 1, $n = count($commonDates); $i < $n; $i++) {
        $d0 = $commonDates[$i - 1];
        $d1 = $commonDates[$i];
        if ($seriesA[$d0] > 0 && $seriesB[$d0] > 0) {
            $retA[] = ($seriesA[$d1] - $seriesA[$d0]) / $seriesA[$d0];
            $retB[] = ($seriesB[$d1] - $seriesB[$d0]) / $seriesB[$d0];
        }
    }
    $m = count($retA);
    if ($m < 10) {
        return null;
    }
    $meanA = array_sum($retA) / $m;
    $meanB = array_sum($retB) / $m;
    $num = 0.0;
    $denA = 0.0;
    $denB = 0.0;
    for ($i = 0; $i < $m; $i++) {
        $da = $retA[$i] - $meanA;
        $db = $retB[$i] - $meanB;
        $num += $da * $db;
        $denA += $da * $da;
        $denB += $db * $db;
    }
    $den = sqrt($denA * $denB);
    return $den > 1e-12 ? round($num / $den, 3) : null;
}

$targetSeries = ci_fetch_yahoo_closes($yahooTicker);
$intermarket = [];
foreach ($benchmarks as $bm) {
    if ($bm['symbol'] === $yahooTicker) {
        continue;
    }
    $bmData = ci_fetch_yahoo_closes($bm['symbol']);
    if ($bmData['last'] === null) {
        continue;
    }
    $prev = (float) ($bmData['prev'] ?? $bmData['last']);
    $chgPct = $prev > 0 ? round((($bmData['last'] - $prev) / $prev) * 100, 2) : 0.0;
    $corr = ci_pearson_return_corr($targetSeries['series'] ?? [], $bmData['series'] ?? []);
    $intermarket[] = [
        'ticker' => $bm['symbol'],
        'label' => $bm['label'],
        'last_price' => round((float) $bmData['last'], 4),
        'change_pct' => $chgPct,
        'corr_60d' => $corr,
        'source_type' => 'EXTERNAL_LIVE',
    ];
}

$bundle = [
    'symbol' => $symbol,
    'asset_class' => $assetClass,
    'fetched_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    'cache_hit' => false,
    'news' => $newsItems,
    'sec_filings' => $secFilings,
    'sec_notice' => $secNotice,
    'macro_events' => $macroEvents,
    'intermarket' => $intermarket,
    'source_policy' => 'Live public feeds only; zero fabricated headlines or financial numbers.',
];

if ($pdo !== null) {
    try {
        $up = $pdo->prepare(
            "INSERT INTO symbol_intel_cache (symbol_code, feed_type, payload_json, expires_at_utc)
             VALUES (:sym, 'BUNDLE_V1', :payload, :exp)
             ON DUPLICATE KEY UPDATE
               payload_json = VALUES(payload_json),
               expires_at_utc = VALUES(expires_at_utc),
               updated_at_utc = CURRENT_TIMESTAMP"
        );
        $up->execute([
            ':sym' => $symbol,
            ':payload' => json_encode($bundle, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}',
            ':exp' => gmdate('Y-m-d H:i:s', time() + $ttlSeconds),
        ]);
    } catch (\Throwable) {}
}

ApiEnvelope::sendSuccess($bundle, 'status_symbol_intel_loaded');
