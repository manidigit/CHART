<?php
declare(strict_types=1);

namespace ChartIntelligence\Core;

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Algorithms\UtcTimeAnchor;
use ChartIntelligence\Providers\ProviderCatalog;
use ChartIntelligence\Providers\TvDatafeedAdapter;
use PDO;

/**
 * Chronos-2 Execution, Queue, Mutex & Deterministic Cache Manager
 * ===============================================================
 * - Model: amazon/chronos-2
 * - Pinned Revision: 29ec3766d36d6f73f0696f85560a422f50e8498c
 * - Enforces single-process concurrency via OS-level flock() mutex
 * - Caches computed 21-quantile forecasts keyed by:
 *   (symbol, provider, timeframe, last_closed_candle_ms, horizon, model_revision)
 */
final class Chronos2QueueManager
{
    public const MODEL_ID = 'amazon/chronos-2';
    public const MODEL_REVISION = '29ec3766d36d6f73f0696f85560a422f50e8498c';
    public const DEFAULT_HORIZON = 30;
    public const DEFAULT_CONTEXT_BARS = 256;
    public const MIN_CLOSED_BARS = 32;

    public static function getBaseDataDir(): string
    {
        return dirname(__DIR__, 3) . '/data/chronos2';
    }

    public static function ensureDirectories(): array
    {
        $base = self::getBaseDataDir();
        $dirs = [
            'base'   => $base,
            'cache'  => $base . '/cache',
            'queue'  => $base . '/queue',
            'inputs' => $base . '/inputs',
            'logs'   => $base . '/logs',
        ];
        foreach ($dirs as $dir) {
            if (!is_dir($dir)) {
                @mkdir($dir, 0775, true);
            }
        }
        return $dirs;
    }

    /**
     * Builds the deterministic cache key incorporating:
     * symbol, provider, timeframe, last_closed_candle_open_time_utc_ms, horizon, and model_revision.
     */
    public static function buildCacheKey(
        string $symbol,
        string $provider,
        string $timeframe,
        int $lastClosedOpenMs,
        int $horizon = self::DEFAULT_HORIZON
    ): string {
        $cleanSym = strtoupper(preg_replace('/[^A-Za-z0-9_]/', '', $symbol));
        $cleanProv = strtolower(preg_replace('/[^a-z0-9_]/', '', $provider));
        $cleanTf = strtoupper(preg_replace('/[^A-Z0-9]/', '', $timeframe));
        $normHorizon = max(1, min(120, $horizon));

        $rawIdentity = implode('|', [
            $cleanSym,
            $cleanProv,
            $cleanTf,
            (string) $lastClosedOpenMs,
            'H' . $normHorizon,
            self::MODEL_ID . '@' . self::MODEL_REVISION,
        ]);
        $shortHash = substr(hash('sha256', $rawIdentity), 0, 16);

        return sprintf(
            '%s_%s_%s_%d_H%d_%s',
            $cleanSym,
            $cleanProv,
            $cleanTf,
            $lastClosedOpenMs,
            $normHorizon,
            $shortHash
        );
    }

    public static function getCacheFilePath(string $cacheKey): string
    {
        $dirs = self::ensureDirectories();
        $safeKey = preg_replace('/[^A-Za-z0-9_\-]/', '', $cacheKey);
        return $dirs['cache'] . '/' . $safeKey . '.json';
    }

    public static function getJobFilePath(string $cacheKey): string
    {
        $dirs = self::ensureDirectories();
        $safeKey = preg_replace('/[^A-Za-z0-9_\-]/', '', $cacheKey);
        return $dirs['queue'] . '/' . $safeKey . '.job.json';
    }

    public static function getInputFilePath(string $cacheKey): string
    {
        $dirs = self::ensureDirectories();
        $safeKey = preg_replace('/[^A-Za-z0-9_\-]/', '', $cacheKey);
        return $dirs['inputs'] . '/' . $safeKey . '.candles.json';
    }

    /**
     * Resolves strictly closed historical candles from CHART's existing infrastructure:
     * 1. MariaDB `candles` table (is_closed = 1) if database is connected
     * 2. Local normalized JSON/CSV or TvDatafeedAdapter closed candles
     * 3. Client-provided closed candles fallback (validated strictly as closed)
     */
    public static function resolveClosedCandles(
        string $symbol,
        string $provider,
        string $timeframe,
        int $nowMs,
        array $clientCandles = [],
        int $maxBars = 512
    ): array {
        $cleanSymbol = strtoupper(preg_replace('/[^A-Za-z0-9_]/', '', $symbol));
        $cleanProvider = strtolower(trim($provider)) ?: 'tvdatafeed';
        $normTf = strtoupper(trim($timeframe)) ?: 'M15';

        $closedMap = [];

        // 1. Try MariaDB existing infrastructure first (read-only, zero schema changes)
        try {
            $pdo = Database::getPdo();
            if ($pdo !== null) {
                $chartId = ProviderCatalog::resolveChartId($cleanSymbol);
                $stmtC = $pdo->prepare(
                    'SELECT open_time_utc, open_price, high_price, low_price, close_price, volume
                     FROM candles
                     WHERE chart_id = :chart_id
                       AND provider_id = :provider_id
                       AND timeframe = :tf
                       AND is_closed = 1
                     ORDER BY open_time_utc DESC
                     LIMIT :lim'
                );
                $stmtC->bindValue(':chart_id', $chartId, PDO::PARAM_STR);
                $stmtC->bindValue(':provider_id', $cleanProvider, PDO::PARAM_STR);
                $stmtC->bindValue(':tf', $normTf, PDO::PARAM_STR);
                $stmtC->bindValue(':lim', max(64, $maxBars), PDO::PARAM_INT);
                $stmtC->execute();
                $rows = array_reverse($stmtC->fetchAll(PDO::FETCH_ASSOC) ?: []);
                foreach ($rows as $r) {
                    $openMs = (int) ($r['open_time_utc'] ?? 0);
                    if ($openMs <= 0 || !UtcTimeAnchor::isCandleClosed($openMs, $normTf, $nowMs, $cleanSymbol)) {
                        continue;
                    }
                    $c = CandleValidator::sanitizeCandle(
                        $openMs,
                        $normTf,
                        $r['open_price'],
                        $r['high_price'],
                        $r['low_price'],
                        $r['close_price'],
                        $r['volume'] ?? 0
                    );
                    if ($c !== null) {
                        $closedMap[$c['open_time_utc_ms']] = $c;
                    }
                }
            }
        } catch (\Throwable) {
            // Database unavailable in offline/local host environment; continue to local storage/adapter
        }

        // 2. Merge from local tvdatafeed JSON/CSV infrastructure
        if (count($closedMap) < self::MIN_CLOSED_BARS || $cleanProvider === 'tvdatafeed') {
            try {
                $adapterBars = TvDatafeedAdapter::fetchClosedCandles(
                    $cleanSymbol,
                    $normTf,
                    max(300, $maxBars),
                    $nowMs,
                    false
                );
                foreach ($adapterBars as $bar) {
                    $openMs = (int) ($bar['open_time_utc_ms'] ?? 0);
                    if ($openMs > 0 && UtcTimeAnchor::isCandleClosed($openMs, $normTf, $nowMs, $cleanSymbol)) {
                        $closedMap[$openMs] = $bar;
                    }
                }
            } catch (\Throwable) {
                // Ignore adapter error and check clientCandles next
            }
        }

        // 3. Merge client-supplied closed candles (if provided by the active CHART tab)
        if (!empty($clientCandles)) {
            foreach ($clientCandles as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $openMs = (int) ($item['open_time_utc_ms'] ?? ($item['openTimeSec'] ?? 0) * 1000);
                if ($openMs <= 0 || !UtcTimeAnchor::isCandleClosed($openMs, $normTf, $nowMs, $cleanSymbol)) {
                    continue;
                }
                $closeVal = $item['close'] ?? null;
                if (!is_numeric($closeVal) || (float) $closeVal <= 0) {
                    continue;
                }
                $openVal = is_numeric($item['open'] ?? null) ? $item['open'] : $closeVal;
                $highVal = is_numeric($item['high'] ?? null) ? $item['high'] : $closeVal;
                $lowVal = is_numeric($item['low'] ?? null) ? $item['low'] : $closeVal;
                $volVal = is_numeric($item['volume'] ?? null) ? $item['volume'] : 0;

                $c = CandleValidator::sanitizeCandle(
                    $openMs,
                    $normTf,
                    $openVal,
                    $highVal,
                    $lowVal,
                    $closeVal,
                    $volVal
                );
                if ($c !== null) {
                    $closedMap[$c['open_time_utc_ms']] = $c;
                }
            }
        }

        ksort($closedMap);
        $sorted = array_values($closedMap);
        $filtered = CandleValidator::filterSyntheticWeekendAndCombCandles($sorted, $cleanSymbol, $normTf);
        return array_slice($filtered, -$maxBars);
    }

    /**
     * Reads a valid cached READY forecast if available for the exact cache key.
     */
    public static function readCachedForecast(
        string $cacheKey,
        string $symbol,
        string $provider,
        string $timeframe,
        int $originOpenMs,
        int $horizon
    ): ?array {
        $cacheFile = self::getCacheFilePath($cacheKey);
        if (!is_file($cacheFile)) {
            return null;
        }
        $raw = @file_get_contents($cacheFile);
        if ($raw === false || $raw === '') {
            return null;
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded) || ($decoded['status'] ?? '') !== 'READY') {
            return null;
        }

        // Verify strict identity & revision provenance
        $series = $decoded['series'] ?? [];
        $model = $decoded['model'] ?? [];
        if (
            strtoupper((string) ($series['symbol'] ?? '')) !== strtoupper($symbol)
            || strtolower((string) ($series['provider'] ?? '')) !== strtolower($provider)
            || strtoupper((string) ($series['timeframe'] ?? '')) !== strtoupper($timeframe)
            || (int) ($series['origin_open_time_utc_ms'] ?? 0) !== $originOpenMs
            || (int) ($model['horizon_bars'] ?? 0) !== $horizon
            || (string) ($model['hf_revision_sha'] ?? '') !== self::MODEL_REVISION
        ) {
            return null;
        }

        $decoded['served_from_cache'] = true;
        return $decoded;
    }

    /**
     * Enqueues a Chronos-2 forecast job and optionally executes it immediately
     * if the single-instance flock() mutex is free.
     */
    public static function requestOrRunForecast(
        string $symbol,
        string $provider,
        string $timeframe,
        array $closedCandles,
        int $horizon = self::DEFAULT_HORIZON,
        int $contextBars = self::DEFAULT_CONTEXT_BARS,
        bool $executeIfLockFree = true
    ): array {
        $cleanSym = strtoupper(preg_replace('/[^A-Za-z0-9_]/', '', $symbol));
        $cleanProv = strtolower(preg_replace('/[^a-z0-9_]/', '', $provider)) ?: 'tvdatafeed';
        $cleanTf = strtoupper(preg_replace('/[^A-Z0-9]/', '', $timeframe)) ?: 'M15';
        $normHorizon = max(1, min(120, $horizon));
        $normContext = max(self::MIN_CLOSED_BARS, min(2048, $contextBars));

        if (count($closedCandles) < self::MIN_CLOSED_BARS) {
            return [
                'status'  => 'ERROR',
                'error'   => sprintf(
                    'Insufficient closed candles for %s (%s): %d available, minimum %d required.',
                    $cleanSym,
                    $cleanTf,
                    count($closedCandles),
                    self::MIN_CLOSED_BARS
                ),
            ];
        }

        $lastClosedBar = $closedCandles[count($closedCandles) - 1];
        $originOpenMs = (int) ($lastClosedBar['open_time_utc_ms'] ?? 0);
        if ($originOpenMs <= 0) {
            return [
                'status' => 'ERROR',
                'error'  => 'Invalid origin_open_time_utc_ms on last closed candle.',
            ];
        }

        $cacheKey = self::buildCacheKey($cleanSym, $cleanProv, $cleanTf, $originOpenMs, $normHorizon);

        // 1. Check deterministic cache first
        $cached = self::readCachedForecast($cacheKey, $cleanSym, $cleanProv, $cleanTf, $originOpenMs, $normHorizon);
        if ($cached !== null) {
            return $cached;
        }

        // 2. Persist closed context snapshot & queue job descriptor
        $inputFile = self::getInputFilePath($cacheKey);
        $contextSlice = array_slice($closedCandles, -$normContext);
        if (!is_file($inputFile)) {
            $inputPayload = json_encode([
                'symbol'                  => $cleanSym,
                'provider'                => $cleanProv,
                'timeframe'               => $cleanTf,
                'origin_open_time_utc_ms' => $originOpenMs,
                'count'                   => count($contextSlice),
                'candles'                 => array_values($contextSlice),
            ], JSON_UNESCAPED_SLASHES);
            @file_put_contents($inputFile, $inputPayload, LOCK_EX);
        }

        $jobFile = self::getJobFilePath($cacheKey);
        $nowMs = (int) round(microtime(true) * 1000);
        if (!is_file($jobFile)) {
            $jobPayload = [
                'cache_key'               => $cacheKey,
                'symbol'                  => $cleanSym,
                'provider'                => $cleanProv,
                'timeframe'               => $cleanTf,
                'origin_open_time_utc_ms' => $originOpenMs,
                'horizon_bars'            => $normHorizon,
                'context_bars'            => $normContext,
                'model_id'                => self::MODEL_ID,
                'hf_revision_sha'         => self::MODEL_REVISION,
                'input_file'              => $inputFile,
                'status'                  => 'QUEUED',
                'enqueued_at_utc_ms'      => $nowMs,
            ];
            @file_put_contents($jobFile, json_encode($jobPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
        }

        if (!$executeIfLockFree) {
            return [
                'status'                  => 'QUEUED',
                'cache_key'               => $cacheKey,
                'symbol'                  => $cleanSym,
                'provider'                => $cleanProv,
                'timeframe'               => $cleanTf,
                'origin_open_time_utc_ms' => $originOpenMs,
                'horizon_bars'            => $normHorizon,
                'model_id'                => self::MODEL_ID,
                'hf_revision_sha'         => self::MODEL_REVISION,
                'message'                 => 'Forecast job queued for Chronos-2 execution.',
            ];
        }

        // 3. Attempt to acquire the single-instance Chronos-2 worker mutex (non-blocking)
        $dirs = self::ensureDirectories();
        $lockFile = $dirs['base'] . '/chronos2_worker.lock';
        $lockFp = @fopen($lockFile, 'c+');
        if ($lockFp === false) {
            return [
                'status'                  => 'PROCESSING',
                'cache_key'               => $cacheKey,
                'symbol'                  => $cleanSym,
                'provider'                => $cleanProv,
                'timeframe'               => $cleanTf,
                'origin_open_time_utc_ms' => $originOpenMs,
                'horizon_bars'            => $normHorizon,
                'message'                 => 'Chronos-2 worker lock unavailable; job queued.',
            ];
        }

        if (!@flock($lockFp, LOCK_EX | LOCK_NB)) {
            @fclose($lockFp);
            return [
                'status'                  => 'PROCESSING',
                'cache_key'               => $cacheKey,
                'symbol'                  => $cleanSym,
                'provider'                => $cleanProv,
                'timeframe'               => $cleanTf,
                'origin_open_time_utc_ms' => $originOpenMs,
                'horizon_bars'            => $normHorizon,
                'model_id'                => self::MODEL_ID,
                'hf_revision_sha'         => self::MODEL_REVISION,
                'message'                 => 'Another Chronos-2 process is currently active; job is queued.',
            ];
        }

        try {
            // Re-check cache after acquiring lock in case a concurrent worker just finished it
            $cachedAfterLock = self::readCachedForecast($cacheKey, $cleanSym, $cleanProv, $cleanTf, $originOpenMs, $normHorizon);
            if ($cachedAfterLock !== null) {
                @unlink($jobFile);
                return $cachedAfterLock;
            }

            return self::executeSingleJobUnderLock(
                $cacheKey,
                $cleanSym,
                $cleanProv,
                $cleanTf,
                $originOpenMs,
                $normHorizon,
                $normContext,
                $inputFile,
                $jobFile
            );
        } finally {
            @flock($lockFp, LOCK_UN);
            @fclose($lockFp);
        }
    }

    /**
     * Processes pending jobs in the queue directory (invoked by Cron or CLI worker).
     * Strictly honors the single-instance flock() mutex.
     */
    public static function processQueueBatch(int $maxJobs = 3): array
    {
        $dirs = self::ensureDirectories();
        $lockFile = $dirs['base'] . '/chronos2_worker.lock';
        $lockFp = @fopen($lockFile, 'c+');
        if ($lockFp === false || !@flock($lockFp, LOCK_EX | LOCK_NB)) {
            if (is_resource($lockFp)) {
                @fclose($lockFp);
            }
            return [
                'status'    => 'BUSY',
                'processed' => 0,
                'message'   => 'Another Chronos-2 worker holds the active mutex.',
            ];
        }

        $processed = [];
        try {
            $jobFiles = glob($dirs['queue'] . '/*.job.json') ?: [];
            usort($jobFiles, static fn(string $a, string $b): int => (@filemtime($a) ?: 0) <=> (@filemtime($b) ?: 0));

            foreach (array_slice($jobFiles, 0, max(1, $maxJobs)) as $jobFile) {
                $raw = @file_get_contents($jobFile);
                $job = $raw ? json_decode($raw, true) : null;
                if (!is_array($job)) {
                    @unlink($jobFile);
                    continue;
                }

                $cacheKey = (string) ($job['cache_key'] ?? '');
                $symbol = (string) ($job['symbol'] ?? 'SPOTBRENT');
                $provider = (string) ($job['provider'] ?? 'tvdatafeed');
                $timeframe = (string) ($job['timeframe'] ?? 'H1');
                $originOpenMs = (int) ($job['origin_open_time_utc_ms'] ?? 0);
                $horizon = (int) ($job['horizon_bars'] ?? self::DEFAULT_HORIZON);
                $contextBars = (int) ($job['context_bars'] ?? self::DEFAULT_CONTEXT_BARS);
                $inputFile = (string) ($job['input_file'] ?? self::getInputFilePath($cacheKey));

                $res = self::executeSingleJobUnderLock(
                    $cacheKey,
                    $symbol,
                    $provider,
                    $timeframe,
                    $originOpenMs,
                    $horizon,
                    $contextBars,
                    $inputFile,
                    $jobFile
                );
                $processed[] = [
                    'cache_key' => $cacheKey,
                    'symbol'    => $symbol,
                    'timeframe' => $timeframe,
                    'status'    => $res['status'] ?? 'UNKNOWN',
                ];
            }
        } finally {
            @flock($lockFp, LOCK_UN);
            @fclose($lockFp);
        }

        return [
            'status'    => 'OK',
            'processed' => count($processed),
            'jobs'      => $processed,
        ];
    }

    /**
     * Resolves the Python binary from the proven Chronos-2 virtual environment.
     */
    public static function resolvePythonBinary(): string
    {
        $candidates = [
            getenv('CHRONOS_PYTHON_BIN') ?: '',
            '/tmp/chronos_venv/bin/python3',
            dirname(__DIR__, 4) . '/.venv/bin/python3',
            '/usr/bin/python3',
            'python3',
        ];
        foreach ($candidates as $bin) {
            if ($bin !== '' && ($bin === 'python3' || is_executable($bin))) {
                return $bin;
            }
        }
        return 'python3';
    }

    private static function executeSingleJobUnderLock(
        string $cacheKey,
        string $symbol,
        string $provider,
        string $timeframe,
        int $originOpenMs,
        int $horizon,
        int $contextBars,
        string $inputFile,
        string $jobFile
    ): array {
        $cacheFile = self::getCacheFilePath($cacheKey);
        $workerScript = dirname(__DIR__, 3) . '/scripts/chronos2_worker.py';
        $pythonBin = self::resolvePythonBinary();

        if (!is_file($workerScript)) {
            return [
                'status' => 'ERROR',
                'error'  => 'chronos2_worker.py script is missing.',
            ];
        }

        // Update job status to RUNNING
        if (is_file($jobFile)) {
            $jobData = json_decode((string) @file_get_contents($jobFile), true) ?: [];
            $jobData['status'] = 'RUNNING';
            $jobData['started_at_utc_ms'] = (int) round(microtime(true) * 1000);
            @file_put_contents($jobFile, json_encode($jobData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
        }

        $cmd = sprintf(
            '%s %s --input %s --output %s --symbol %s --provider %s --timeframe %s --horizon %d --context-bars %d --cache-key %s 2>&1',
            escapeshellarg($pythonBin),
            escapeshellarg($workerScript),
            escapeshellarg($inputFile),
            escapeshellarg($cacheFile),
            escapeshellarg($symbol),
            escapeshellarg($provider),
            escapeshellarg($timeframe),
            $horizon,
            $contextBars,
            escapeshellarg($cacheKey)
        );

        $outputLines = [];
        $exitCode = 1;
        if (function_exists('exec')) {
            @exec($cmd, $outputLines, $exitCode);
        }

        if ($exitCode === 0 && is_file($cacheFile)) {
            $decoded = json_decode((string) @file_get_contents($cacheFile), true);
            if (is_array($decoded) && ($decoded['status'] ?? '') === 'READY') {
                @unlink($jobFile);
                $decoded['served_from_cache'] = false;
                return $decoded;
            }
        }

        // If exec is unavailable or failed, keep job in queue or report error detail
        $errDetail = trim(implode("\n", array_slice($outputLines, -8)));
        if (is_file($cacheFile)) {
            $errJson = json_decode((string) @file_get_contents($cacheFile), true);
            if (is_array($errJson) && !empty($errJson['error'])) {
                $errDetail = (string) $errJson['error'];
            }
            @unlink($cacheFile);
        }

        return [
            'status'                  => 'ERROR',
            'cache_key'               => $cacheKey,
            'symbol'                  => $symbol,
            'provider'                => $provider,
            'timeframe'               => $timeframe,
            'origin_open_time_utc_ms' => $originOpenMs,
            'horizon_bars'            => $horizon,
            'error'                   => $errDetail !== '' ? $errDetail : 'Chronos-2 worker execution failed.',
        ];
    }
}
