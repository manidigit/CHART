<?php
declare(strict_types=1);

namespace ChartIntelligence\Core;

use ChartIntelligence\Algorithms\CandleValidator;
use ChartIntelligence\Algorithms\UtcTimeAnchor;
use ChartIntelligence\Providers\ProviderCatalog;
use ChartIntelligence\Providers\TvDatafeedAdapter;
use PDO;

/**
 * Chronos-2 Direct On-Demand Execution, Mutex & Deterministic Cache Manager
 * =========================================================================
 * - Model: amazon/chronos-2
 * - Pinned Revision: 29ec3766d36d6f73f0696f85560a422f50e8498c
 * - Strictly on-demand PHP -> Python Worker execution per explicit user click
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
     * Reads a valid cached READY forecast if available for the exact cache key and unchanged base candles.
     */
    public static function readCachedForecast(
        string $cacheKey,
        string $symbol,
        string $provider,
        string $timeframe,
        int $originOpenMs,
        int $horizon,
        ?float $expectedLastClose = null,
        ?string $expectedContextSha256 = null
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

        // Invalidate cache automatically if base candle values changed
        if ($expectedLastClose !== null && isset($series['last_closed_price'])) {
            if (abs((float) $series['last_closed_price'] - $expectedLastClose) > 1e-8) {
                return null;
            }
        }
        if (
            $expectedContextSha256 !== null
            && $expectedContextSha256 !== ''
            && !empty($series['context_close_sha256'])
            && !hash_equals((string) $series['context_close_sha256'], $expectedContextSha256)
        ) {
            return null;
        }

        $decoded['served_from_cache'] = true;
        return $decoded;
    }

    /**
     * Executes Chronos-2 forecast directly on-demand under process mutex lock.
     * Strictly on-demand: no background cron job, no infinite queue files.
     * Checks deterministic cache first; if missed, runs Python worker synchronously and returns result or real error.
     */
    public static function requestOrRunForecast(
        string $symbol,
        string $provider,
        string $timeframe,
        array $closedCandles,
        int $horizon = self::DEFAULT_HORIZON,
        int $contextBars = self::DEFAULT_CONTEXT_BARS
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
        $lastClosedPrice = isset($lastClosedBar['close']) ? (float) $lastClosedBar['close'] : null;
        if ($originOpenMs <= 0) {
            return [
                'status' => 'ERROR',
                'error'  => 'Invalid origin_open_time_utc_ms on last closed candle.',
            ];
        }

        $contextSlice = array_slice($closedCandles, -$normContext);
        $closeValues = array_map(static fn(array $c): float => (float) ($c['close'] ?? 0.0), array_values($contextSlice));
        $contextCloseSha256 = hash('sha256', (string) json_encode($closeValues));

        $cacheKey = self::buildCacheKey($cleanSym, $cleanProv, $cleanTf, $originOpenMs, $normHorizon);

        // 1. Check deterministic cache first (instant return, zero worker invocation)
        $cached = self::readCachedForecast(
            $cacheKey,
            $cleanSym,
            $cleanProv,
            $cleanTf,
            $originOpenMs,
            $normHorizon,
            $lastClosedPrice,
            $contextCloseSha256
        );
        if ($cached !== null) {
            return $cached;
        }

        // 2. Always persist latest closed context snapshot for the Python worker
        $inputFile = self::getInputFilePath($cacheKey);
        $inputPayload = json_encode([
            'symbol'                  => $cleanSym,
            'provider'                => $cleanProv,
            'timeframe'               => $cleanTf,
            'origin_open_time_utc_ms' => $originOpenMs,
            'count'                   => count($contextSlice),
            'candles'                 => array_values($contextSlice),
        ], JSON_UNESCAPED_SLASHES);
        @file_put_contents($inputFile, $inputPayload, LOCK_EX);

        // 3. Acquire single-instance execution mutex
        $dirs = self::ensureDirectories();
        $lockFile = $dirs['base'] . '/chronos2_worker.lock';
        $lockFp = @fopen($lockFile, 'c+');
        if ($lockFp === false) {
            return [
                'status'                  => 'ERROR',
                'error'                   => 'Unable to initialize Chronos-2 worker lock file.',
                'cache_key'               => $cacheKey,
            ];
        }

        // Spin-wait briefly (up to 2 seconds) if another request is currently finishing
        $locked = false;
        for ($i = 0; $i < 20; $i++) {
            if (@flock($lockFp, LOCK_EX | LOCK_NB)) {
                $locked = true;
                break;
            }
            usleep(100000); // 100ms
        }

        if (!$locked) {
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
                'message'                 => 'Another Chronos-2 execution is currently active. Please retry in a few moments.',
            ];
        }

        try {
            // Re-check cache under lock in case previous request just finished
            $cachedAfterLock = self::readCachedForecast(
                $cacheKey,
                $cleanSym,
                $cleanProv,
                $cleanTf,
                $originOpenMs,
                $normHorizon,
                $lastClosedPrice,
                $contextCloseSha256
            );
            if ($cachedAfterLock !== null) {
                return $cachedAfterLock;
            }

            return self::executeDirectJobUnderLock(
                $cacheKey,
                $cleanSym,
                $cleanProv,
                $cleanTf,
                $originOpenMs,
                $normHorizon,
                $normContext,
                $inputFile
            );
        } finally {
            @flock($lockFp, LOCK_UN);
            @fclose($lockFp);
        }
    }

    /**
     * Cron queue worker disabled by architecture decision.
     * All executions are strictly on-demand per user click.
     */
    public static function processQueueBatch(int $maxJobs = 3): array
    {
        return [
            'status'    => 'DISABLED',
            'processed' => 0,
            'message'   => 'Cron queue processing is disabled. Chronos-2 execution is strictly on-demand per user request.',
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

    private static function executeDirectJobUnderLock(
        string $cacheKey,
        string $symbol,
        string $provider,
        string $timeframe,
        int $originOpenMs,
        int $horizon,
        int $contextBars,
        string $inputFile
    ): array {
        $cacheFile = self::getCacheFilePath($cacheKey);
        $workerScript = dirname(__DIR__, 3) . '/scripts/chronos2_worker.py';
        $pythonBin = self::resolvePythonBinary();

        if (!is_file($workerScript)) {
            return [
                'status' => 'ERROR',
                'error'  => 'Chronos-2 worker script is missing at ' . $workerScript,
            ];
        }

        if (!function_exists('exec')) {
            return [
                'status' => 'ERROR',
                'error'  => 'PHP exec() function is disabled on this server host environment.',
            ];
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
        @exec($cmd, $outputLines, $exitCode);

        if ($exitCode === 0 && is_file($cacheFile)) {
            $decoded = json_decode((string) @file_get_contents($cacheFile), true);
            if (is_array($decoded) && ($decoded['status'] ?? '') === 'READY') {
                $decoded['served_from_cache'] = false;
                return $decoded;
            }
        }

        // Capture real, visible error from python / system
        $errDetail = trim(implode("\n", array_slice($outputLines, -10)));
        if (is_file($cacheFile)) {
            $errJson = json_decode((string) @file_get_contents($cacheFile), true);
            if (is_array($errJson) && !empty($errJson['error'])) {
                $errDetail = (string) $errJson['error'];
            }
            @unlink($cacheFile);
        }

        if ($errDetail === '') {
            $errDetail = sprintf('Python worker failed with exit code %d using binary "%s".', $exitCode, $pythonBin);
        }

        return [
            'status'                  => 'ERROR',
            'cache_key'               => $cacheKey,
            'symbol'                  => $symbol,
            'provider'                => $provider,
            'timeframe'               => $timeframe,
            'origin_open_time_utc_ms' => $originOpenMs,
            'horizon_bars'            => $horizon,
            'error'                   => $errDetail,
        ];
    }
}
