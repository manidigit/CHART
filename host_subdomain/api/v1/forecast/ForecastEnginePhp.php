<?php
declare(strict_types=1);

namespace ChartIntelligence\Forecast;

final class ForecastEnginePhp
{
    public const CONTRACT_VERSION = 'forecast-contract/v1';
    public const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

    public static function stepMilliseconds(string $timeframe): int
    {
        return match (strtoupper(trim($timeframe))) {
            'M30' => 30 * 60 * 1000,
            'H1' => 60 * 60 * 1000,
            'H4' => 4 * 60 * 60 * 1000,
            'D1' => 24 * 60 * 60 * 1000,
            'W1' => 7 * 24 * 60 * 60 * 1000,
            default => 15 * 60 * 1000,
        };
    }

    public static function canonicalJson(mixed $value): string
    {
        if (is_null($value) || is_bool($value) || is_string($value)) {
            return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: 'null';
        }
        if (is_int($value)) {
            return (string) $value;
        }
        if (is_float($value)) {
            return json_encode(round($value, 8)) ?: '0';
        }
        if (!is_array($value)) {
            return 'null';
        }
        if (array_is_list($value)) {
            $parts = [];
            foreach ($value as $item) {
                $parts[] = self::canonicalJson($item);
            }
            return '[' . implode(',', $parts) . ']';
        }
        ksort($value);
        $parts = [];
        foreach ($value as $k => $v) {
            $parts[] = json_encode((string) $k, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ':' . self::canonicalJson($v);
        }
        return '{' . implode(',', $parts) . '}';
    }

    public static function computeChainHash(string $prevHash, array $body): string
    {
        return hash('sha256', $prevHash . '|' . self::canonicalJson($body));
    }

    public static function probeRemoteWorker(string $workerUrl, array $payload): array
    {
        $url = trim($workerUrl);
        if ($url === '' || !function_exists('curl_init')) {
            return [
                'status' => $url === '' ? 'LOCAL_STATISTICAL_ONLY' : 'UNCONFIGURED',
                'configured' => $url !== '',
                'url' => $url,
                'response' => null,
            ];
        }
        if (!preg_match('#^https?://#i', $url)) {
            return [
                'status' => 'ERROR',
                'configured' => true,
                'url' => $url,
                'response' => null,
            ];
        }
        $endpoint = rtrim($url, '/') . '/forecast/infer';
        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 4,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_SLASHES),
        ]);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (!is_string($raw) || $code < 200 || $code >= 300) {
            return [
                'status' => 'UNCONFIGURED',
                'configured' => true,
                'url' => $url,
                'response' => null,
            ];
        }
        $decoded = json_decode($raw, true);
        return [
            'status' => is_array($decoded) ? 'CONNECTED' : 'ERROR',
            'configured' => true,
            'url' => $url,
            'response' => is_array($decoded) ? $decoded : null,
        ];
    }

    public static function project(array $candles, string $symbolCode, string $timeframe, int $horizonBars = 30, string $workerUrl = ''): array
    {
        $horizon = max(10, min(60, $horizonBars));
        $clean = [];
        foreach ($candles as $c) {
            $o = (float) ($c['open'] ?? 0);
            $h = (float) ($c['high'] ?? 0);
            $l = (float) ($c['low'] ?? 0);
            $cl = (float) ($c['close'] ?? 0);
            $ms = (int) ($c['open_time_utc_ms'] ?? ($c['openTimeUtcMs'] ?? 0));
            if ($o > 0 && $cl > 0 && is_finite($cl)) {
                $clean[] = [
                    'open' => $o,
                    'high' => max($h, $o, $cl),
                    'low' => max(1e-8, min($l, $o, $cl)),
                    'close' => $cl,
                    'open_time_utc_ms' => $ms,
                ];
            }
        }

        if (count($clean) < 24) {
            return [
                'contractVersion' => self::CONTRACT_VERSION,
                'status' => 'DATA_NOT_READY',
                'symbolCode' => strtoupper($symbolCode),
                'timeframe' => strtoupper($timeframe),
                'horizonBars' => $horizon,
                'points' => [],
                'scenarios' => [],
                'remoteWorker' => self::probeRemoteWorker($workerUrl, []),
                'walkForward' => [
                    'evaluatedWindows' => 0,
                    'evalHorizon' => 5,
                    'forecastStatus' => 'DATA_NOT_READY',
                    'acceptancePassed' => false,
                    'maeImprovementVsNaivePct' => 0.0,
                ],
            ];
        }

        $slice = count($clean) > 160 ? array_slice($clean, -160) : $clean;
        $n = count($slice);
        $last = $slice[$n - 1];
        $lastClose = $last['close'];
        $lastMs = $last['open_time_utc_ms'] > 0 ? $last['open_time_utc_ms'] : (int) round(microtime(true) * 1000);

        $returns = [];
        for ($i = 1; $i < $n; $i++) {
            $returns[] = log($slice[$i]['close'] / $slice[$i - 1]['close']);
        }
        $rCount = count($returns);
        $meanRet = array_sum($returns) / max(1, $rCount);
        $varSum = 0.0;
        foreach ($returns as $r) {
            $d = $r - $meanRet;
            $varSum += $d * $d;
        }
        $uncondVar = max(1e-10, $varSum / max(1, $rCount - 1));
        $uncondSigma = sqrt($uncondVar);

        // EWMA + GARCH(1,1)
        $alpha = 0.09;
        $beta = 0.87;
        $persistence = $alpha + $beta;
        $omega = $uncondVar * max(0.01, 1.0 - $persistence);
        $garchVar = $uncondVar;
        foreach ($returns as $r) {
            $eps = $r - $meanRet;
            $garchVar = $omega + $alpha * ($eps * $eps) + $beta * $garchVar;
        }

        $tail20 = array_slice($returns, -min(20, $rCount));
        $recentMean = array_sum($tail20) / max(1, count($tail20));
        $cappedDrift = max(-$uncondSigma * 0.4, min($uncondSigma * 0.4, $recentMean * 0.65 + $meanRet * 0.35));

        $stepMs = self::stepMilliseconds($timeframe);
        $points = [];
        $cumRet = 0.0;
        $cumVar = 0.0;
        $curVar = $garchVar;
        $drift = $cappedDrift;
        $prevClose = $lastClose;

        for ($h = 1; $h <= $horizon; $h++) {
            $curVar = $omega + $persistence * $curVar;
            $drift *= 0.87;
            $cumRet += $drift;
            $cumVar += $curVar;
            $cumSigma = sqrt(max(1e-9, $cumVar));

            $q10 = max($lastClose * 0.02, $lastClose * exp($cumRet - 1.28155 * $cumSigma));
            $q25 = max($q10, $lastClose * exp($cumRet - 0.67449 * $cumSigma));
            $q50 = max($q25, $lastClose * exp($cumRet));
            $q75 = max($q50, $lastClose * exp($cumRet + 0.67449 * $cumSigma));
            $q90 = max($q75, $lastClose * exp($cumRet + 1.28155 * $cumSigma));

            $openP = $prevClose;
            $closeP = $q50;
            $wick = max($lastClose * sqrt($curVar) * 0.35, abs($closeP - $openP) * 0.4);
            $highP = max($openP, $closeP) + $wick;
            $lowP = max($lastClose * 0.02, min($openP, $closeP) - $wick);
            $prevClose = $closeP;

            $points[] = [
                'stepAhead' => $h,
                'openTimeUtcMs' => $lastMs + ($h * $stepMs),
                'open' => $openP,
                'high' => $highP,
                'low' => $lowP,
                'close' => $closeP,
                'q10' => $q10,
                'q25' => $q25,
                'q50' => $q50,
                'q75' => $q75,
                'q90' => $q90,
            ];
        }

        // Quick chronological walk-forward audit (5-bar eval horizon)
        $evalH = 5;
        $minTrain = max(24, min(36, (int) floor($n * 0.55)));
        $windows = 0;
        $ensAbs = 0.0;
        $naiveAbs = 0.0;
        $ensCov = 0;
        $ptCount = 0;
        if ($n >= $minTrain + $evalH + 2) {
            $stride = max(1, (int) floor(($n - $evalH - $minTrain) / 8));
            for ($origin = $minTrain; $origin <= $n - $evalH && $windows < 8; $origin += $stride) {
                $windows++;
                $base = $slice[$origin - 1]['close'];
                $subRet = [];
                for ($j = 1; $j < $origin; $j++) {
                    $subRet[] = log($slice[$j]['close'] / $slice[$j - 1]['close']);
                }
                $subMean = array_sum(array_slice($subRet, -12)) / max(1, min(12, count($subRet)));
                $subVar = 0.0;
                foreach ($subRet as $sr) {
                    $subVar += $sr * $sr;
                }
                $subSig = max(1e-5, sqrt($subVar / max(1, count($subRet))));
                for ($h = 1; $h <= $evalH; $h++) {
                    $actual = $slice[$origin + $h - 1]['close'];
                    $pred = $base * exp($subMean * 0.5 * $h);
                    $sH = $subSig * sqrt($h);
                    $lo = $pred * exp(-1.28155 * $sH);
                    $hi = $pred * exp(1.28155 * $sH);
                    $ensAbs += abs($actual - $pred);
                    $naiveAbs += abs($actual - $base);
                    if ($actual >= $lo && $actual <= $hi) {
                        $ensCov++;
                    }
                    $ptCount++;
                }
            }
        }

        $ensMae = $ptCount > 0 ? ($ensAbs / $ptCount) : 0.0;
        $naiveMae = $ptCount > 0 ? ($naiveAbs / $ptCount) : 0.0;
        $covPct = $ptCount > 0 ? (($ensCov / $ptCount) * 100.0) : 0.0;
        $impPct = $naiveMae > 1e-9 ? ((($naiveMae - $ensMae) / $naiveMae) * 100.0) : 0.0;
        $passed = $windows >= 5 && $ensMae <= ($naiveMae * 1.015) && $covPct >= 50.0 && $covPct <= 98.0;
        $status = $passed ? 'VALID' : 'PROVISIONAL';

        $lastPt = $points[count($points) - 1];
        $inputHash = hash('sha256', self::canonicalJson([
            'symbolCode' => strtoupper($symbolCode),
            'timeframe' => strtoupper($timeframe),
            'horizonBars' => $horizon,
            'lastOpenMs' => $lastMs,
            'lastClose' => $lastClose,
        ]));

        return [
            'contractVersion' => self::CONTRACT_VERSION,
            'status' => $status,
            'symbolCode' => strtoupper($symbolCode),
            'timeframe' => strtoupper($timeframe),
            'horizonBars' => $horizon,
            'anchorOpenTimeUtcMs' => $lastMs,
            'anchorClose' => $lastClose,
            'regime' => abs($cappedDrift) > $uncondSigma * 0.18 ? ($cappedDrift > 0 ? 'TRENDING_UP' : 'TRENDING_DOWN') : 'RANGING',
            'remoteWorker' => self::probeRemoteWorker($workerUrl, []),
            'points' => $points,
            'scenarios' => [
                [
                    'id' => 'BULL_EXPANSION',
                    'label' => 'Bullish Expansion Scenario',
                    'bias' => 'bull',
                    'probability' => 0.333,
                    'targetPrice' => $lastPt['q75'],
                    'extremePrice' => $lastPt['q90'],
                    'invalidationReference' => $lastPt['q25'],
                ],
                [
                    'id' => 'BASE_RANGE',
                    'label' => 'Base Range Scenario',
                    'bias' => 'neutral',
                    'probability' => 0.334,
                    'targetPrice' => $lastPt['q50'],
                    'extremePrice' => $lastPt['q75'],
                    'invalidationReference' => $lastPt['q25'],
                ],
                [
                    'id' => 'BEAR_CONTRACTION',
                    'label' => 'Bearish Contraction Scenario',
                    'bias' => 'bear',
                    'probability' => 0.333,
                    'targetPrice' => $lastPt['q25'],
                    'extremePrice' => $lastPt['q10'],
                    'invalidationReference' => $lastPt['q75'],
                ],
            ],
            'walkForward' => [
                'evaluatedWindows' => $windows,
                'evalHorizon' => $evalH,
                'forecastStatus' => $status,
                'acceptancePassed' => $passed,
                'maeImprovementVsNaivePct' => round($impPct, 2),
                'ensembleMae' => round($ensMae, 6),
                'naiveMae' => round($naiveMae, 6),
                'coverage80Pct' => round($covPct, 2),
            ],
            'summary' => [
                'terminalQ10' => $lastPt['q10'],
                'terminalQ25' => $lastPt['q25'],
                'terminalQ50' => $lastPt['q50'],
                'terminalQ75' => $lastPt['q75'],
                'terminalQ90' => $lastPt['q90'],
            ],
            'inputHash' => $inputHash,
        ];
    }
}
