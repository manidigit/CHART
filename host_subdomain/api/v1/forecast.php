<?php
declare(strict_types=1);

require_once __DIR__ . '/core/ApiEnvelope.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/forecast/ForecastEnginePhp.php';

use ChartIntelligence\Core\ApiEnvelope;
use ChartIntelligence\Core\Database;
use ChartIntelligence\Forecast\ForecastEnginePhp;

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ApiEnvelope::sendCorsAndSecurityHeaders('GET, POST, OPTIONS');
    exit;
}

ApiEnvelope::sendCorsAndSecurityHeaders('GET, POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

$pdo = Database::getPdo();
$sessionsFile = dirname(__DIR__, 2) . '/config/sessions.local.json';
$ledgerFile = dirname(__DIR__, 2) . '/config/forecast_ledger.local.json';
$lifecycleFile = dirname(__DIR__, 2) . '/config/forecast_lifecycle.local.json';
$rawBody = file_get_contents('php://input');
$payload = is_string($rawBody) && $rawBody !== '' ? (json_decode($rawBody, true) ?? []) : [];

$token = trim((string) ($payload['session_token'] ?? ($_GET['token'] ?? '')));
if ($token === '') {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
        $token = $matches[1];
    }
}

$nowUtc = gmdate('Y-m-d H:i:s');
$username = null;
if ($token !== '') {
    if ($pdo !== null) {
        try {
            $stmt = $pdo->prepare("SELECT username FROM user_sessions WHERE token = :t AND expires_at_utc > :now LIMIT 1");
            $stmt->execute([':t' => $token, ':now' => $nowUtc]);
            $row = $stmt->fetch();
            if ($row && !empty($row['username'])) {
                $username = (string) $row['username'];
            }
        } catch (\Throwable) {}
    }
    if ($username === null && is_file($sessionsFile)) {
        $sData = json_decode((string) file_get_contents($sessionsFile), true);
        if (is_array($sData) && isset($sData[$token])) {
            $s = $sData[$token];
            if (isset($s['expires_ts']) && (int) $s['expires_ts'] > time()) {
                $username = (string) ($s['username'] ?? '');
            }
        }
    }
}

$ownerRegistered = false;
if ($pdo !== null) {
    try {
        $uStmt = $pdo->query("SELECT 1 FROM users WHERE role = 'owner' LIMIT 1");
        if ($uStmt && $uStmt->fetch()) {
            $ownerRegistered = true;
        }
    } catch (\Throwable) {}
}
if (!$ownerRegistered) {
    $ownerFile = dirname(__DIR__, 2) . '/config/owner.local.json';
    if (is_file($ownerFile)) {
        $oData = json_decode((string) file_get_contents($ownerFile), true);
        if (is_array($oData) && !empty($oData['username'])) {
            $ownerRegistered = true;
        }
    }
}

if ($username === null) {
    if ($ownerRegistered) {
        ApiEnvelope::sendError('UNAUTHORIZED', 'auth_session_required', 401);
        exit;
    }
    $username = 'owner';
}

function loadLocalLedgerEntries(string $ledgerFile): array
{
    if (!is_file($ledgerFile)) {
        return [];
    }
    $data = json_decode((string) file_get_contents($ledgerFile), true);
    return is_array($data) ? $data : [];
}

function saveLocalLedgerEntries(string $ledgerFile, array $entries): void
{
    $dir = dirname($ledgerFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $trimmed = array_slice($entries, -120);
    @file_put_contents($ledgerFile, json_encode($trimmed, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function appendLocalLifecycleEvent(string $lifecycleFile, array $event): array
{
    $existing = loadLocalLedgerEntries($lifecycleFile);
    $prevHash = !empty($existing)
        ? (string) ($existing[count($existing) - 1]['event_hash'] ?? ForecastEnginePhp::GENESIS_HASH)
        : ForecastEnginePhp::GENESIS_HASH;
    $body = [
        'forecast_hash' => (string) ($event['forecast_hash'] ?? ''),
        'symbol_code' => (string) ($event['symbol_code'] ?? ''),
        'timeframe' => (string) ($event['timeframe'] ?? ''),
        'horizon_step' => (int) ($event['horizon_step'] ?? 0),
        'lifecycle_status' => (string) ($event['lifecycle_status'] ?? 'ACTIVE'),
        'evaluation_outcome' => (string) ($event['evaluation_outcome'] ?? 'PENDING'),
        'recorded_at_utc_ms' => (int) ($event['recorded_at_utc_ms'] ?? 0),
    ];
    $event['prev_event_hash'] = $prevHash;
    $event['event_hash'] = ForecastEnginePhp::computeChainHash($prevHash, $body);
    $existing[] = $event;
    saveLocalLedgerEntries($lifecycleFile, array_slice($existing, -240));
    return $event;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = trim((string) ($payload['action'] ?? ($_GET['action'] ?? 'ledger')));
$symbolFilter = strtoupper(trim((string) ($payload['symbol'] ?? ($_GET['symbol'] ?? ''))));
$tfFilter = strtoupper(trim((string) ($payload['timeframe'] ?? ($_GET['timeframe'] ?? ''))));

if ($method === 'GET' || $action === 'ledger') {
    $entries = [];
    $lifecycleEvents = [];
    if ($pdo !== null) {
        try {
            $sql = "SELECT id, run_uuid, symbol_code, timeframe, horizon_bars, forecast_status, regime, anchor_open_time_utc_ms, anchor_close, terminal_q10, terminal_q50, terminal_q90, input_hash, prev_forecast_hash, forecast_hash, remote_worker_status, created_at_utc_ms FROM prediction_runs WHERE 1=1";
            $params = [];
            if ($symbolFilter !== '') {
                $sql .= " AND symbol_code = :sym";
                $params[':sym'] = $symbolFilter;
            }
            if ($tfFilter !== '') {
                $sql .= " AND timeframe = :tf";
                $params[':tf'] = $tfFilter;
            }
            $sql .= " ORDER BY id DESC LIMIT 50";
            $st = $pdo->prepare($sql);
            $st->execute($params);
            $rows = $st->fetchAll() ?: [];
            $entries = array_reverse($rows);

            $lcSql = "SELECT event_uuid, run_uuid, forecast_hash, symbol_code, timeframe, horizon_step, lifecycle_status, evaluation_outcome, reason, observed_close, prev_event_hash, event_hash, recorded_at_utc_ms FROM prediction_lifecycle_events WHERE 1=1";
            $lcParams = [];
            if ($symbolFilter !== '') {
                $lcSql .= " AND symbol_code = :sym";
                $lcParams[':sym'] = $symbolFilter;
            }
            if ($tfFilter !== '') {
                $lcSql .= " AND timeframe = :tf";
                $lcParams[':tf'] = $tfFilter;
            }
            $lcSql .= " ORDER BY id DESC LIMIT 80";
            $lcSt = $pdo->prepare($lcSql);
            $lcSt->execute($lcParams);
            $lcRows = $lcSt->fetchAll() ?: [];
            $lifecycleEvents = array_reverse($lcRows);
        } catch (\Throwable) {}
    }
    if (empty($entries)) {
        $local = loadLocalLedgerEntries($ledgerFile);
        $entries = array_values(array_filter($local, static function (array $row) use ($symbolFilter, $tfFilter): bool {
            if ($symbolFilter !== '' && strtoupper((string) ($row['symbol_code'] ?? '')) !== $symbolFilter) {
                return false;
            }
            if ($tfFilter !== '' && strtoupper((string) ($row['timeframe'] ?? '')) !== $tfFilter) {
                return false;
            }
            return true;
        }));
    }
    if (empty($lifecycleEvents)) {
        $localLc = loadLocalLedgerEntries($lifecycleFile);
        $lifecycleEvents = array_values(array_filter($localLc, static function (array $row) use ($symbolFilter, $tfFilter): bool {
            if ($symbolFilter !== '' && strtoupper((string) ($row['symbol_code'] ?? '')) !== $symbolFilter) {
                return false;
            }
            if ($tfFilter !== '' && strtoupper((string) ($row['timeframe'] ?? '')) !== $tfFilter) {
                return false;
            }
            return true;
        }));
    }
    ApiEnvelope::sendSuccess([
        'entries' => $entries,
        'count' => count($entries),
        'lifecycle_events' => $lifecycleEvents,
        'lifecycle_count' => count($lifecycleEvents),
    ], 'forecast_ledger_loaded');
    exit;
}

if ($method !== 'POST') {
    ApiEnvelope::sendError('METHOD_NOT_ALLOWED', 'error_method_not_allowed', 405);
    exit;
}

if ($action === 'append_lifecycle_event') {
    $evPayload = is_array($payload['lifecycle_event'] ?? null) ? $payload['lifecycle_event'] : $payload;
    $nowEvMs = (int) ($evPayload['recorded_at_utc_ms'] ?? round(microtime(true) * 1000));
    $fHash = trim((string) ($evPayload['forecast_hash'] ?? ''));
    if ($fHash === '') {
        ApiEnvelope::sendError('INVALID_INPUT', 'forecast_hash_required', 400);
        exit;
    }
    $sym = strtoupper(trim((string) ($evPayload['symbol_code'] ?? ($payload['symbol'] ?? 'UNKNOWN'))));
    $tf = strtoupper(trim((string) ($evPayload['timeframe'] ?? ($payload['timeframe'] ?? 'M15'))));
    $step = (int) ($evPayload['horizon_step'] ?? 0);
    $lcStatus = strtoupper(trim((string) ($evPayload['lifecycle_status'] ?? 'MATURED')));
    $outcome = strtoupper(trim((string) ($evPayload['evaluation_outcome'] ?? 'PENDING')));
    $reason = substr(trim((string) ($evPayload['reason'] ?? '')), 0, 250);
    $obsClose = isset($evPayload['observed_close']) && is_numeric($evPayload['observed_close']) ? (float) $evPayload['observed_close'] : null;

    $prevEvHash = ForecastEnginePhp::GENESIS_HASH;
    if ($pdo !== null) {
        try {
            $lStmt = $pdo->query("SELECT event_hash FROM prediction_lifecycle_events ORDER BY id DESC LIMIT 1");
            $lRow = $lStmt ? $lStmt->fetch() : null;
            if ($lRow && !empty($lRow['event_hash'])) {
                $prevEvHash = (string) $lRow['event_hash'];
            }
        } catch (\Throwable) {}
    }
    $evHash = ForecastEnginePhp::computeChainHash($prevEvHash, [
        'forecast_hash' => $fHash,
        'symbol_code' => $sym,
        'timeframe' => $tf,
        'horizon_step' => $step,
        'lifecycle_status' => $lcStatus,
        'evaluation_outcome' => $outcome,
        'recorded_at_utc_ms' => $nowEvMs,
    ]);
    $evUuid = sprintf('LC-%s-%d-%s', $sym, $nowEvMs, substr($evHash, 0, 8));
    $evRecord = [
        'event_uuid' => $evUuid,
        'run_uuid' => trim((string) ($evPayload['run_uuid'] ?? '')),
        'forecast_hash' => $fHash,
        'symbol_code' => $sym,
        'timeframe' => $tf,
        'horizon_step' => $step,
        'lifecycle_status' => $lcStatus,
        'evaluation_outcome' => $outcome,
        'reason' => $reason,
        'observed_close' => $obsClose,
        'prev_event_hash' => $prevEvHash,
        'event_hash' => $evHash,
        'recorded_at_utc_ms' => $nowEvMs,
    ];
    if ($pdo !== null) {
        try {
            $evIns = $pdo->prepare("INSERT INTO prediction_lifecycle_events (event_uuid, run_uuid, forecast_hash, symbol_code, timeframe, horizon_step, lifecycle_status, evaluation_outcome, reason, observed_close, prev_event_hash, event_hash, recorded_at_utc_ms) VALUES (:eu, :ru, :fh, :sym, :tf, :hs, :ls, :eo, :rs, :oc, :ph, :eh, :ms)");
            $evIns->execute([
                ':eu' => $evUuid,
                ':ru' => $evRecord['run_uuid'] ?: null,
                ':fh' => $fHash,
                ':sym' => $sym,
                ':tf' => $tf,
                ':hs' => $step,
                ':ls' => $lcStatus,
                ':eo' => $outcome,
                ':rs' => $reason,
                ':oc' => $obsClose,
                ':ph' => $prevEvHash,
                ':eh' => $evHash,
                ':ms' => $nowEvMs,
            ]);
        } catch (\Throwable) {}
    }
    $storedEv = appendLocalLifecycleEvent($lifecycleFile, $evRecord);
    ApiEnvelope::sendSuccess(['lifecycle_event' => $storedEv], 'lifecycle_event_appended');
    exit;
}

$symbolCode = strtoupper(trim((string) ($payload['symbol'] ?? 'SPOTBRENT')));
$timeframe = strtoupper(trim((string) ($payload['timeframe'] ?? 'M15')));
$horizonBars = max(10, min(60, (int) ($payload['horizon_bars'] ?? 30)));
$workerUrl = trim((string) ($payload['worker_url'] ?? ''));

$candles = is_array($payload['candles'] ?? null) ? $payload['candles'] : [];
if (empty($candles) && $pdo !== null) {
    try {
        $cStmt = $pdo->prepare("SELECT open_time_utc_ms, open_price AS open, high_price AS high, low_price AS low, close_price AS close, volume FROM candles WHERE symbol_code = :s AND timeframe = :tf ORDER BY open_time_utc_ms DESC LIMIT 200");
        $cStmt->execute([':s' => $symbolCode, ':tf' => $timeframe]);
        $fetched = $cStmt->fetchAll() ?: [];
        $candles = array_reverse($fetched);
    } catch (\Throwable) {}
}

$clientEntry = is_array($payload['client_forecast'] ?? null) ? $payload['client_forecast'] : null;
$forecast = $action === 'append_client_forecast' && $clientEntry !== null
    ? $clientEntry
    : ForecastEnginePhp::project($candles, $symbolCode, $timeframe, $horizonBars, $workerUrl);

if (($forecast['status'] ?? '') === 'DATA_NOT_READY') {
    ApiEnvelope::sendSuccess([
        'forecast' => $forecast,
        'ledger_entry' => null,
    ], 'forecast_data_not_ready');
    exit;
}

$prevHash = ForecastEnginePhp::GENESIS_HASH;
$localEntries = loadLocalLedgerEntries($ledgerFile);
if ($pdo !== null) {
    try {
        $lastStmt = $pdo->query("SELECT forecast_hash FROM prediction_runs ORDER BY id DESC LIMIT 1");
        $lastRow = $lastStmt ? $lastStmt->fetch() : null;
        if ($lastRow && !empty($lastRow['forecast_hash'])) {
            $prevHash = (string) $lastRow['forecast_hash'];
        }
    } catch (\Throwable) {}
} elseif (!empty($localEntries)) {
    $prevHash = (string) ($localEntries[count($localEntries) - 1]['forecast_hash'] ?? ForecastEnginePhp::GENESIS_HASH);
}

$nowMs = (int) round(microtime(true) * 1000);
$summary = is_array($forecast['summary'] ?? null) ? $forecast['summary'] : [];
$anchorMs = (int) ($forecast['anchorOpenTimeUtcMs'] ?? $nowMs);
$anchorClose = (float) ($forecast['anchorClose'] ?? 0);
$termQ10 = (float) ($summary['terminalQ10'] ?? 0);
$termQ50 = (float) ($summary['terminalQ50'] ?? 0);
$termQ90 = (float) ($summary['terminalQ90'] ?? 0);
$inputHash = (string) ($forecast['inputHash'] ?? hash('sha256', $symbolCode . '|' . $timeframe . '|' . $anchorMs));
$forecastStatus = (string) ($forecast['status'] ?? 'PROVISIONAL');
$regime = (string) ($forecast['regime'] ?? 'RANGING');
$workerStatus = (string) ($forecast['remoteWorker']['status'] ?? 'LOCAL_STATISTICAL_ONLY');

$hashBody = [
    'symbol_code' => $symbolCode,
    'timeframe' => $timeframe,
    'horizon_bars' => $horizonBars,
    'anchor_open_time_utc_ms' => $anchorMs,
    'anchor_close' => round($anchorClose, 8),
    'terminal_q50' => round($termQ50, 8),
    'input_hash' => $inputHash,
    'created_at_utc_ms' => $nowMs,
];
$forecastHash = ForecastEnginePhp::computeChainHash($prevHash, $hashBody);
$runUuid = sprintf('%s-%s-%d-%s', $symbolCode, $timeframe, $nowMs, substr($forecastHash, 0, 8));

$ledgerRecord = [
    'run_uuid' => $runUuid,
    'username' => $username,
    'symbol_code' => $symbolCode,
    'timeframe' => $timeframe,
    'horizon_bars' => $horizonBars,
    'forecast_status' => $forecastStatus,
    'regime' => $regime,
    'anchor_open_time_utc_ms' => $anchorMs,
    'anchor_close' => $anchorClose,
    'terminal_q10' => $termQ10,
    'terminal_q50' => $termQ50,
    'terminal_q90' => $termQ90,
    'input_hash' => $inputHash,
    'prev_forecast_hash' => $prevHash,
    'forecast_hash' => $forecastHash,
    'remote_worker_status' => $workerStatus,
    'created_at_utc_ms' => $nowMs,
];

if ($pdo !== null) {
    try {
        $ins = $pdo->prepare("INSERT INTO prediction_runs (run_uuid, username, symbol_code, timeframe, horizon_bars, contract_version, forecast_status, regime, anchor_open_time_utc_ms, anchor_close, terminal_q10, terminal_q50, terminal_q90, input_hash, prev_forecast_hash, forecast_hash, remote_worker_status, payload_json, created_at_utc_ms) VALUES (:uuid, :user, :sym, :tf, :hor, :cv, :st, :reg, :ams, :acl, :q10, :q50, :q90, :ih, :ph, :fh, :rws, :pl, :cms)");
        $ins->execute([
            ':uuid' => $runUuid,
            ':user' => $username,
            ':sym' => $symbolCode,
            ':tf' => $timeframe,
            ':hor' => $horizonBars,
            ':cv' => ForecastEnginePhp::CONTRACT_VERSION,
            ':st' => $forecastStatus,
            ':reg' => $regime,
            ':ams' => $anchorMs,
            ':acl' => $anchorClose,
            ':q10' => $termQ10,
            ':q50' => $termQ50,
            ':q90' => $termQ90,
            ':ih' => $inputHash,
            ':ph' => $prevHash,
            ':fh' => $forecastHash,
            ':rws' => $workerStatus,
            ':pl' => json_encode($forecast, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ':cms' => $nowMs,
        ]);
        $runId = (int) $pdo->lastInsertId();

        if ($runId > 0 && is_array($forecast['points'] ?? null)) {
            $ptIns = $pdo->prepare("INSERT INTO prediction_forecasts (run_id, step_ahead, open_time_utc_ms, q10, q25, q50, q75, q90, synth_open, synth_high, synth_low, synth_close) VALUES (:rid, :st, :ms, :q10, :q25, :q50, :q75, :q90, :o, :h, :l, :c)");
            foreach ($forecast['points'] as $pt) {
                $ptIns->execute([
                    ':rid' => $runId,
                    ':st' => (int) ($pt['stepAhead'] ?? 0),
                    ':ms' => (int) ($pt['openTimeUtcMs'] ?? 0),
                    ':q10' => (float) ($pt['q10'] ?? 0),
                    ':q25' => (float) ($pt['q25'] ?? 0),
                    ':q50' => (float) ($pt['q50'] ?? 0),
                    ':q75' => (float) ($pt['q75'] ?? 0),
                    ':q90' => (float) ($pt['q90'] ?? 0),
                    ':o' => (float) ($pt['open'] ?? 0),
                    ':h' => (float) ($pt['high'] ?? 0),
                    ':l' => (float) ($pt['low'] ?? 0),
                    ':c' => (float) ($pt['close'] ?? 0),
                ]);
            }
        }
        if ($runId > 0 && is_array($forecast['scenarios'] ?? null)) {
            $scIns = $pdo->prepare("INSERT INTO prediction_scenarios (run_id, scenario_id, scenario_label, bias, probability, target_price, extreme_price, invalidation_reference) VALUES (:rid, :sid, :sl, :bi, :pr, :tp, :ep, :ir)");
            foreach ($forecast['scenarios'] as $sc) {
                $scIns->execute([
                    ':rid' => $runId,
                    ':sid' => substr((string) ($sc['leafId'] ?? ($sc['id'] ?? 'SCENARIO')), 0, 32),
                    ':sl' => substr((string) ($sc['label'] ?? ''), 0, 128),
                    ':bi' => substr((string) ($sc['bias'] ?? 'neutral'), 0, 16),
                    ':pr' => (float) ($sc['probability'] ?? 0),
                    ':tp' => (float) ($sc['targetPrice'] ?? 0),
                    ':ep' => (float) ($sc['extremePrice'] ?? 0),
                    ':ir' => (float) ($sc['invalidationReference'] ?? 0),
                ]);
            }
        }

        if ($runId > 0 && is_array($forecast['keyZones'] ?? null)) {
            $kzIns = $pdo->prepare("INSERT INTO prediction_key_zones (run_id, zone_id, zone_type, low_price, high_price, center_price, strength, touch_probability, penetration_probability, reclaim_probability, breakout_probability, reach_before_invalidation_prob, invalidation_before_reach_prob, expected_bars_to_reach, invalidation_price, horizon_bars) VALUES (:rid, :zid, :zt, :lp, :hp, :cp, :str, :tp, :pp, :rp, :bp, :rbi, :ibr, :ebr, :ip, :hb)");
            foreach ($forecast['keyZones'] as $kz) {
                $kzIns->execute([
                    ':rid' => $runId,
                    ':zid' => substr((string) ($kz['zoneId'] ?? 'ZONE'), 0, 64),
                    ':zt' => substr((string) ($kz['zoneType'] ?? 'REACTION_PIVOT'), 0, 32),
                    ':lp' => (float) ($kz['lowPrice'] ?? 0),
                    ':hp' => (float) ($kz['highPrice'] ?? 0),
                    ':cp' => (float) ($kz['centerPrice'] ?? 0),
                    ':str' => (float) ($kz['strength'] ?? 0.5),
                    ':tp' => (float) ($kz['touchProbability'] ?? 0),
                    ':pp' => (float) ($kz['penetrationProbability'] ?? 0),
                    ':rp' => (float) ($kz['reclaimProbability'] ?? 0),
                    ':bp' => (float) ($kz['confirmedBreakoutProbability'] ?? 0),
                    ':rbi' => (float) ($kz['reachBeforeInvalidationProb'] ?? 0),
                    ':ibr' => (float) ($kz['invalidationBeforeReachProb'] ?? 0),
                    ':ebr' => (float) ($kz['expectedBarsToReachCensored'] ?? 0),
                    ':ip' => (float) ($kz['invalidationPrice'] ?? 0),
                    ':hb' => (int) ($kz['horizonBars'] ?? $horizonBars),
                ]);
            }
        }

        if ($runId > 0 && is_array($forecast['mtfCoordination'] ?? null)) {
            $mtf = $forecast['mtfCoordination'];
            $mtfIns = $pdo->prepare("INSERT INTO prediction_mtf_coordination (run_id, independent_timeframe, reference_timeframe, alignment_state, ohlc_consistent, independent_median_pct, coordinated_median_pct, uncertainty_adjustment_factor, conflict_reasons_json) VALUES (:rid, :itf, :rtf, :as, :oc, :imp, :cmp, :uaf, :cr)");
            $mtfIns->execute([
                ':rid' => $runId,
                ':itf' => $timeframe,
                ':rtf' => substr((string) ($mtf['referenceTimeframe'] ?? ''), 0, 16),
                ':as' => substr((string) ($mtf['alignmentState'] ?? 'SINGLE_TIMEFRAME'), 0, 40),
                ':oc' => !empty($mtf['ohlcConsistent']) ? 1 : 0,
                ':imp' => (float) ($mtf['independentMedianPct'] ?? 0),
                ':cmp' => (float) ($mtf['coordinatedMedianPct'] ?? 0),
                ':uaf' => (float) ($mtf['uncertaintyAdjustmentFactor'] ?? 1.0),
                ':cr' => json_encode($mtf['conflictReasons'] ?? [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ]);
        }

        if ($runId > 0) {
            $unc = is_array($forecast['uncertainty'] ?? null) ? $forecast['uncertainty'] : [];
            $neg = is_array($forecast['noEdgeGate'] ?? null) ? $forecast['noEdgeGate'] : [];
            $wf = is_array($forecast['walkForward'] ?? null) ? $forecast['walkForward'] : [];
            $ed = is_array($forecast['eventDictionary'] ?? null) ? $forecast['eventDictionary'] : [];
            $peIns = $pdo->prepare("INSERT INTO prediction_path_events (run_id, aleatoric_pct, epistemic_pct, ood_status, ood_distance, no_edge_gate_state, effective_sample_size, skill_score_vs_baseline, ambiguous_rate_pct, path_stats_json, sensitivity_grid_json) VALUES (:rid, :ap, :ep, :os, :od, :neg, :neff, :ss, :ar, :ps, :sg)");
            $peIns->execute([
                ':rid' => $runId,
                ':ap' => (float) ($unc['aleatoricPct'] ?? 0),
                ':ep' => (float) ($unc['epistemicPct'] ?? 0),
                ':os' => substr((string) ($unc['oodStatus'] ?? 'IN_DISTRIBUTION'), 0, 24),
                ':od' => (float) ($unc['oodDistance'] ?? 0),
                ':neg' => substr((string) ($neg['gateState'] ?? 'NO_EDGE_DETECTED'), 0, 32),
                ':neff' => (float) ($neg['effectiveSampleSize'] ?? ($wf['effectiveSampleSize'] ?? 0)),
                ':ss' => (float) ($neg['skillScoreVsBaseline'] ?? ($wf['skillScoreVsNaive'] ?? 0)),
                ':ar' => (float) ($wf['ambiguousRatePct'] ?? 0),
                ':ps' => json_encode($wf['pathEventStats'] ?? null, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                ':sg' => json_encode($ed['sensitivityGrid'] ?? [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ]);
        }
    } catch (\Throwable) {}
}

$localEntries[] = $ledgerRecord;
saveLocalLedgerEntries($ledgerFile, $localEntries);
$initialLifecycle = appendLocalLifecycleEvent($lifecycleFile, [
    'event_uuid' => sprintf('LC-%s-%d-%s', $symbolCode, $nowMs, substr($forecastHash, 0, 8)),
    'run_uuid' => $runUuid,
    'forecast_hash' => $forecastHash,
    'symbol_code' => $symbolCode,
    'timeframe' => $timeframe,
    'horizon_step' => $horizonBars,
    'lifecycle_status' => 'ACTIVE',
    'evaluation_outcome' => 'PENDING',
    'reason' => 'Immutable v1.3.0 snapshot anchored pre-outcome',
    'observed_close' => null,
    'recorded_at_utc_ms' => $nowMs,
]);

ApiEnvelope::sendSuccess([
    'forecast' => $forecast,
    'ledger_entry' => $ledgerRecord,
    'lifecycle_event' => $initialLifecycle,
], 'forecast_recorded');
