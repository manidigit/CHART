<?php
declare(strict_types=1);

/**
 * CHART read-only API. Provider secrets and database credentials are server-side.
 * Configure CHART_DB_* environment variables; never expose PDO credentials.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $body): never {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}
function env_required(string $key): string {
    $value = getenv($key);
    if ($value === false || $value === '') respond(503, ['error' => 'service_not_configured', 'field' => $key]);
    return $value;
}
function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $dsn = 'mysql:host=' . env_required('CHART_DB_HOST') . ';dbname=' . env_required('CHART_DB_NAME') . ';charset=utf8mb4';
    $pdo = new PDO($dsn, env_required('CHART_DB_USER'), env_required('CHART_DB_PASSWORD'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}
function utc_iso(?string $value): ?string {
    if ($value === null) return null;
    return (new DateTimeImmutable($value, new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') respond(405, ['error' => 'method_not_allowed']);
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
if ($path === '/api/v1/health') respond(200, ['status' => 'ok', 'api_version' => 'v1']);

$expectedToken = getenv('CHART_API_READ_TOKEN');
$headers = function_exists('getallheaders') ? getallheaders() : [];
$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? ($headers['Authorization'] ?? $headers['authorization'] ?? '');
if ($expectedToken === false || $expectedToken === '' ||
    !preg_match('/^Bearer\\s+(.+)$/i', $authorization, $tokenMatch) ||
    !hash_equals($expectedToken, trim($tokenMatch[1]))) {
    respond(401, ['error' => 'unauthorized']);
}

try {
    if ($path === '/api/v1/instruments') {
        $rows = db()->query("SELECT id, display_name, tradingview_symbol, market_type, quote_currency, price_basis, decimals, status FROM instruments ORDER BY is_initial_primary DESC, id")->fetchAll();
        respond(200, ['api_version' => 'v1', 'data' => $rows]);
    }

    if (preg_match('#^/api/v1/instruments/([A-Za-z0-9_-]+)/candles$#', $path, $m)) {
        $instrumentId = $m[1];
        $timeframe = $_GET['timeframe'] ?? 'M15';
        if (!in_array($timeframe, ['M15', 'M30', 'H1', 'H4', 'D1'], true)) respond(422, ['error' => 'invalid_timeframe']);
        $limit = filter_var($_GET['limit'] ?? 500, FILTER_VALIDATE_INT);
        if ($limit === false || $limit < 1 || $limit > 2000) respond(422, ['error' => 'invalid_limit', 'max' => 2000]);
        $sql = "SELECT c.open_time_utc, c.close_time_utc, c.open_price, c.high_price, c.low_price, c.close_price, c.volume, c.volume_type, c.quality_status, c.is_closed, s.provider_code, s.provider_symbol, s.price_basis
                FROM candles c JOIN market_data_sources s ON s.id=c.source_id
                WHERE c.instrument_id=:instrument AND c.timeframe=:timeframe AND c.is_closed=1
                ORDER BY c.open_time_utc DESC LIMIT " . (int)$limit;
        $stmt = db()->prepare($sql);
        $stmt->execute(['instrument' => $instrumentId, 'timeframe' => $timeframe]);
        $rows = array_reverse($stmt->fetchAll());
        foreach ($rows as &$row) {
            $row['time'] = utc_iso($row['open_time_utc']);
            $row['open_time_utc'] = utc_iso($row['open_time_utc']);
            $row['close_time_utc'] = utc_iso($row['close_time_utc']);
        }
        unset($row);
        respond(200, ['api_version' => 'v1', 'instrument_id' => $instrumentId, 'timeframe' => $timeframe, 'data' => $rows]);
    }

    if (preg_match('#^/api/v1/instruments/([A-Za-z0-9_-]+)/snapshot$#', $path, $m)) {
        $stmt = db()->prepare("SELECT instrument_id, timeframe, candle_cutoff_utc, analysis_version, trend_state, atr, rsi, macd, payload_json, created_at FROM analysis_snapshots WHERE instrument_id=:id ORDER BY created_at DESC LIMIT 1");
        $stmt->execute(['id' => $m[1]]);
        $row = $stmt->fetch();
        if (!$row) respond(404, ['error' => 'snapshot_not_found']);
        $row['payload'] = json_decode($row['payload_json'], true);
        unset($row['payload_json']);
        $row['candle_cutoff_utc'] = utc_iso($row['candle_cutoff_utc']);
        $row['created_at'] = utc_iso($row['created_at']);
        respond(200, ['api_version' => 'v1', 'data' => $row]);
    }

    if (preg_match('#^/api/v1/instruments/([A-Za-z0-9_-]+)/forecasts$#', $path, $m)) {
        $stmt = db()->prepare("SELECT timeframe, horizon, candle_cutoff_utc, model_id, model_version, status, payload_json, created_at FROM forecasts WHERE instrument_id=:id ORDER BY created_at DESC LIMIT 100");
        $stmt->execute(['id' => $m[1]]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row['payload'] = json_decode($row['payload_json'], true);
            unset($row['payload_json']);
            $row['candle_cutoff_utc'] = utc_iso($row['candle_cutoff_utc']);
            $row['created_at'] = utc_iso($row['created_at']);
        }
        unset($row);
        respond(200, ['api_version' => 'v1', 'instrument_id' => $m[1], 'data' => $rows]);
    }

    if ($path === '/api/v1/jobs/market-data-status') {
        $rows = db()->query("SELECT status, COUNT(*) AS count, MAX(updated_at) AS last_updated FROM worker_jobs GROUP BY status")->fetchAll();
        respond(200, ['api_version' => 'v1', 'data' => $rows]);
    }
    respond(404, ['error' => 'not_found']);
} catch (Throwable $e) {
    error_log('[CHART API] ' . $e->getMessage());
    respond(500, ['error' => 'internal_server_error']);
}
