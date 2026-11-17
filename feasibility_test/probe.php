<?php
declare(strict_types=1);

/**
 * Isolated Shared Hosting Feasibility Probe (`feasibility_test/probe.php`)
 * Inspects cPanel shared hosting capabilities for running Amazon Chronos-2 on CPU
 * without modifying any main CHART application code, API, or database.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$nowUtc = gmdate('Y-m-d\TH:i:s\Z');

$disabledRaw = (string) ini_get('disable_functions');
$disabledList = array_values(array_filter(array_map('trim', explode(',', $disabledRaw))));

$canExec = function_exists('exec') && !in_array('exec', $disabledList, true);
$canProcOpen = function_exists('proc_open') && !in_array('proc_open', $disabledList, true);
$canShellExec = function_exists('shell_exec') && !in_array('shell_exec', $disabledList, true);

$runShell = static function (string $cmd) use ($canExec): array {
    if (!$canExec) {
        return ['ok' => false, 'exit_code' => -1, 'output' => 'exec() disabled'];
    }
    $out = [];
    $code = 1;
    @exec($cmd . ' 2>&1', $out, $code);
    return [
        'ok' => ($code === 0),
        'exit_code' => $code,
        'output' => trim(implode("\n", $out)),
    ];
};

$candidatePythonBins = [
    '/opt/alt/python311/bin/python3',
    '/opt/alt/python310/bin/python3',
    '/opt/cpanel/ea-python311/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
    'python3',
];

$detectedPythons = [];
foreach ($candidatePythonBins as $bin) {
    $res = $runShell(escapeshellcmd($bin) . ' --version');
    if ($res['ok'] && $res['output'] !== '') {
        $detectedPythons[$bin] = $res['output'];
    }
}

$memInfo = [];
if (is_readable('/proc/meminfo')) {
    $lines = @file('/proc/meminfo', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    foreach (array_slice($lines, 0, 8) as $line) {
        $parts = explode(':', $line, 2);
        if (count($parts) === 2) {
            $memInfo[trim($parts[0])] = trim($parts[1]);
        }
    }
}

$ulimitInfo = $runShell('ulimit -a');
$diskFreeBytes = @disk_free_space(__DIR__);
$diskTotalBytes = @disk_total_space(__DIR__);

echo json_encode([
    'ok' => true,
    'test_suite' => 'CHART_CHRONOS2_SHARED_HOSTING_FEASIBILITY_PROBE_V1',
    'timestamp_utc' => $nowUtc,
    'php_runtime' => [
        'version' => PHP_VERSION,
        'sapi' => PHP_SAPI,
        'memory_limit' => (string) ini_get('memory_limit'),
        'max_execution_time' => (int) ini_get('max_execution_time'),
        'can_exec' => $canExec,
        'can_proc_open' => $canProcOpen,
        'can_shell_exec' => $canShellExec,
        'disabled_functions' => $disabledList,
    ],
    'python_discovery' => $detectedPythons,
    'system_resources' => [
        'disk_free_mb' => $diskFreeBytes !== false ? round($diskFreeBytes / (1024 * 1024), 2) : null,
        'disk_total_mb' => $diskTotalBytes !== false ? round($diskTotalBytes / (1024 * 1024), 2) : null,
        'proc_meminfo' => $memInfo,
        'ulimit' => $ulimitInfo['output'],
    ],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
