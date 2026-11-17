<?php
declare(strict_types=1);

/**
 * Isolated Shared Hosting Single-Mutex Runner (`feasibility_test/runner.php`)
 * Executes `standalone_chronos.py` under an exclusive `flock` mutex so concurrent
 * requests never trigger dual model loads on a 2 GB shared host, and caches
 * the latest 30-step output by `(series_id, timeframe, origin_open_time_utc_ms)`.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$lockFile = __DIR__ . '/results/chronos_runner.lock';
$reportFile = __DIR__ . '/results/benchmark_report.json';
$scriptFile = __DIR__ . '/standalone_chronos.py';
$candlesFile = dirname(__DIR__) . '/host_subdomain/data/tvdatafeed/SPOTBRENT_H1.json';

if (!is_dir(__DIR__ . '/results')) {
    @mkdir(__DIR__ . '/results', 0755, true);
}

$forceRefresh = isset($_GET['force']) && $_GET['force'] === '1';
if (!$forceRefresh && is_file($reportFile)) {
    $cached = json_decode((string) file_get_contents($reportFile), true);
    if (is_array($cached) && !empty($cached['ok'])) {
        $cached['served_from_cache'] = true;
        echo json_encode($cached, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

$fp = @fopen($lockFile, 'c+');
if ($fp === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Cannot open mutex lock file']);
    exit;
}

if (!flock($fp, LOCK_EX | LOCK_NB)) {
    fclose($fp);
    http_response_code(202);
    echo json_encode([
        'ok' => true,
        'status' => 'RUNNING',
        'message' => 'Another Chronos-2 job is currently executing under the single-instance mutex.',
    ]);
    exit;
}

try {
    $pythonBin = getenv('CHRONOS_PYTHON_BIN') ?: '/tmp/chronos_venv/bin/python3';
    if (!is_executable($pythonBin)) {
        $pythonBin = 'python3';
    }

    $cmd = sprintf(
        '%s %s --candles-json %s --context-bars 256 --horizon 30 --threads 2 --output-json %s 2>&1',
        escapeshellcmd($pythonBin),
        escapeshellarg($scriptFile),
        escapeshellarg($candlesFile),
        escapeshellarg($reportFile)
    );

    $out = [];
    $exitCode = 1;
    @exec($cmd, $out, $exitCode);

    if ($exitCode !== 0 || !is_file($reportFile)) {
        http_response_code(500);
        echo json_encode([
            'ok' => false,
            'exit_code' => $exitCode,
            'error' => 'Chronos-2 execution failed',
            'stdout_stderr' => implode("\n", array_slice($out, -30)),
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        exit;
    }

    echo (string) file_get_contents($reportFile);
} finally {
    flock($fp, LOCK_UN);
    fclose($fp);
}
