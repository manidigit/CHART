<?php
declare(strict_types=1);

require_once __DIR__ . '/core/ApiEnvelope.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/algorithms/UtcTimeAnchor.php';
require_once __DIR__ . '/algorithms/CandleValidator.php';
require_once __DIR__ . '/algorithms/GapDetector.php';
require_once __DIR__ . '/providers/ProviderCatalog.php';

use ChartIntelligence\Algorithms\GapDetector;
use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;
use ChartIntelligence\Providers\ProviderCatalog;

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ApiEnvelope::sendCorsAndSecurityHeaders('GET, OPTIONS');
    exit;
}

$symbol = strtoupper(preg_replace('/[^A-Za-z0-9._:-]/', '', $_GET['symbol'] ?? 'SPOTBRENT'));
$provider = strtolower(preg_replace('/[^a-z0-9_]/', '', $_GET['provider'] ?? 'tvdatafeed'));
$timeframe = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $_GET['timeframe'] ?? 'M15'));
if (!in_array($timeframe, ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'], true)) {
    $timeframe = 'M15';
}

$nowMs = (int) round(microtime(true) * 1000);
$chartId = ProviderCatalog::resolveChartId($symbol);
$pdo = Database::getPdo();

$candles = [];
if ($pdo !== null) {
    try {
        $stmt = $pdo->prepare(
            "SELECT open_time_utc, open_price, high_price, low_price, close_price, volume
             FROM candles
             WHERE chart_id = :chart_id
               AND provider_id = :provider_id
               AND timeframe = :tf
               AND is_closed = 1
             ORDER BY open_time_utc DESC
             LIMIT 1500"
        );
        $stmt->execute([
            ':chart_id' => $chartId,
            ':provider_id' => $provider,
            ':tf' => $timeframe,
        ]);
        $rows = array_reverse($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []);
        foreach ($rows as $r) {
            $candles[] = [
                'open_time_utc_ms' => (int) ($r['open_time_utc'] ?? 0),
                'open' => (float) ($r['open_price'] ?? 0),
                'high' => (float) ($r['high_price'] ?? 0),
                'low' => (float) ($r['low_price'] ?? 0),
                'close' => (float) ($r['close_price'] ?? 0),
                'volume' => (float) ($r['volume'] ?? 0),
            ];
        }
    } catch (Throwable) {
        // Non-fatal fallback
    }
}

$report = GapDetector::detectGaps($candles, $timeframe, $symbol, $nowMs);
if ($pdo !== null) {
    GapDetector::upsertQualityReport($pdo, $chartId, $provider, $timeframe, $report);
}

ApiEnvelope::sendSuccess([
    'symbol' => $symbol,
    'chart_id' => $chartId,
    'provider' => $provider,
    'timeframe' => $timeframe,
    'report' => $report,
]);
