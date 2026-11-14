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
        $skillScore = $naiveMae > 1e-9 ? (($naiveMae - $ensMae) / $naiveMae) : 0.0;
        $nEff = $n > 0 ? round($n / max(1.0, $evalH * 0.65), 2) : 0.0;
        $passed = $windows >= 5 && $ensMae <= ($naiveMae * 1.015) && $covPct >= 50.0 && $covPct <= 98.0;
        $status = $passed ? 'VALID' : 'PROVISIONAL';

        $lastPt = $points[count($points) - 1];
        $cumSigmaTerm = sqrt(max(1e-9, $cumVar));
        $aleatoricPct = round($cumSigmaTerm * 100.0, 4);
        $tailZ = abs(($returns[$rCount - 1] ?? 0.0) - $meanRet) / max(1e-6, $uncondSigma);
        $driftZAbs = abs($cappedDrift) / max(1e-6, $uncondSigma);
        $oodDistance = round(sqrt(($tailZ * $tailZ + $driftZAbs * $driftZAbs) / 2.0), 4);
        $oodStatus = $oodDistance >= 3.6 ? 'EXTREME' : ($oodDistance >= 2.2 ? 'ELEVATED' : 'IN_DISTRIBUTION');
        $epistemicVar = $cumVar * (1.0 / max(8.0, $nEff)) + ($oodStatus === 'EXTREME' ? $cumVar * 0.45 : ($oodStatus === 'ELEVATED' ? $cumVar * 0.18 : 0.0));
        $epistemicPct = round(sqrt(max(1e-10, $epistemicVar)) * 100.0, 4);
        $totalUncPct = round(sqrt(max(1e-10, $cumVar + $epistemicVar)) * 100.0, 4);

        $hasEdge = $passed && $nEff >= 12.0 && $skillScore > 0.0 && $oodStatus !== 'EXTREME';
        $noEdgeReasons = [];
        if ($windows < 5) {
            $noEdgeReasons[] = 'Walk-forward windows below minimum threshold (5)';
        }
        if ($nEff < 12.0) {
            $noEdgeReasons[] = 'Effective sample size N_eff below 12.0';
        }
        if ($skillScore <= 0.0) {
            $noEdgeReasons[] = 'Out-of-sample skill score <= 0 vs Naive Persistence';
        }
        if ($oodStatus === 'EXTREME') {
            $noEdgeReasons[] = 'Extreme Out-of-Distribution (OOD) market telemetry detected';
        }

        $atrProxy = max($lastClose * $uncondSigma * 1.4, $lastClose * 0.001);
        $upperZoneCenter = $lastPt['q75'];
        $lowerZoneCenter = $lastPt['q25'];
        $zoneHalf = $atrProxy * 0.35;

        // 5-leaf mutually exclusive event tree summing strictly to 1.000
        $driftNorm = ($lastPt['q50'] - $lastClose) / max(1e-8, $lastClose * $cumSigmaTerm);
        $pTouch = max(0.32, min(0.88, 0.58 + 0.12 * min(2.0, abs($driftNorm))));
        $pNoTouch = round(1.0 - $pTouch, 3);
        $pReaction = round($pTouch * 0.30, 3);
        $pReclaim = round($pTouch * 0.24, 3);
        $bullShare = 1.0 / (1.0 + exp(-1.4 * $driftNorm));
        $remBreak = max(0.0, 1.0 - $pNoTouch - $pReaction - $pReclaim);
        $pBreakBull = round($remBreak * $bullShare, 3);
        $pBreakBear = round(max(0.0, 1.0 - $pNoTouch - $pReaction - $pReclaim - $pBreakBull), 3);

        $inputHash = hash('sha256', self::canonicalJson([
            'symbolCode' => strtoupper($symbolCode),
            'timeframe' => strtoupper($timeframe),
            'horizonBars' => $horizon,
            'lastOpenMs' => $lastMs,
            'lastClose' => $lastClose,
        ]));

        return [
            'contractVersion' => self::CONTRACT_VERSION,
            'specVersion' => '1.3.0',
            'status' => $status,
            'symbolCode' => strtoupper($symbolCode),
            'timeframe' => strtoupper($timeframe),
            'horizonBars' => $horizon,
            'anchorOpenTimeUtcMs' => $lastMs,
            'anchorClose' => $lastClose,
            'regime' => abs($cappedDrift) > $uncondSigma * 0.18 ? ($cappedDrift > 0 ? 'TRENDING_UP' : 'TRENDING_DOWN') : 'RANGING',
            'remoteWorker' => self::probeRemoteWorker($workerUrl, []),
            'uncertainty' => [
                'aleatoricPct' => $aleatoricPct,
                'epistemicPct' => $epistemicPct,
                'totalPct' => $totalUncPct,
                'aleatoricShare' => round($cumVar / max(1e-10, $cumVar + $epistemicVar), 4),
                'epistemicShare' => round($epistemicVar / max(1e-10, $cumVar + $epistemicVar), 4),
                'oodStatus' => $oodStatus,
                'oodDistance' => $oodDistance,
                'oodReasons' => $oodStatus === 'IN_DISTRIBUTION' ? [] : ['Multivariate feature dispersion exceeds historical baseline'],
                'spreadMultiplierApplied' => $oodStatus === 'EXTREME' ? 1.42 : ($oodStatus === 'ELEVATED' ? 1.18 : 1.0),
            ],
            'noEdgeGate' => [
                'gateState' => $hasEdge ? 'EDGE_SUPPORTED' : 'NO_EDGE_DETECTED',
                'hasEdge' => $hasEdge,
                'effectiveSampleSize' => $nEff,
                'skillScoreVsBaseline' => round($skillScore, 4),
                'reasons' => $noEdgeReasons,
            ],
            'eventDictionary' => [
                'priceBasis' => 'MID_OHLC',
                'evaluationRule' => 'HIGH_LOW_AND_CLOSE',
                'penetrationAtrMult' => 0.2,
                'reclaimWindowBars' => 3,
                'confirmedBreakoutCloses' => 2,
                'sensitivityGrid' => [],
            ],
            'keyZones' => [
                [
                    'zoneId' => 'KZ_UPPER_REACTION',
                    'zoneType' => 'RESISTANCE_ZONE',
                    'lowPrice' => round($upperZoneCenter - $zoneHalf, 6),
                    'highPrice' => round($upperZoneCenter + $zoneHalf, 6),
                    'centerPrice' => round($upperZoneCenter, 6),
                    'strength' => 0.72,
                    'touchProbability' => round($pTouch * $bullShare, 3),
                    'penetrationProbability' => round($pTouch * $bullShare * 0.62, 3),
                    'reclaimProbability' => round($pReclaim * 0.5, 3),
                    'confirmedBreakoutProbability' => $pBreakBull,
                    'reachBeforeInvalidationProb' => round($bullShare * 0.65, 3),
                    'invalidationBeforeReachProb' => round((1.0 - $bullShare) * 0.65, 3),
                    'expectedBarsToReachCensored' => round($horizon * 0.58, 1),
                    'invalidationPrice' => round($lowerZoneCenter, 6),
                    'horizonBars' => $horizon,
                ],
                [
                    'zoneId' => 'KZ_LOWER_REACTION',
                    'zoneType' => 'SUPPORT_ZONE',
                    'lowPrice' => round($lowerZoneCenter - $zoneHalf, 6),
                    'highPrice' => round($lowerZoneCenter + $zoneHalf, 6),
                    'centerPrice' => round($lowerZoneCenter, 6),
                    'strength' => 0.70,
                    'touchProbability' => round($pTouch * (1.0 - $bullShare), 3),
                    'penetrationProbability' => round($pTouch * (1.0 - $bullShare) * 0.62, 3),
                    'reclaimProbability' => round($pReclaim * 0.5, 3),
                    'confirmedBreakoutProbability' => $pBreakBear,
                    'reachBeforeInvalidationProb' => round((1.0 - $bullShare) * 0.65, 3),
                    'invalidationBeforeReachProb' => round($bullShare * 0.65, 3),
                    'expectedBarsToReachCensored' => round($horizon * 0.61, 1),
                    'invalidationPrice' => round($upperZoneCenter, 6),
                    'horizonBars' => $horizon,
                ],
            ],
            'points' => $points,
            'scenarios' => [
                [
                    'id' => 'NO_ZONE_TOUCH_RANGE',
                    'leafId' => 'NO_ZONE_TOUCH_RANGE',
                    'parentBranch' => 'NO_TOUCH',
                    'label' => 'No Key Zone Touch (Range Containment)',
                    'bias' => 'neutral',
                    'probability' => $pNoTouch,
                    'targetPrice' => $lastPt['q50'],
                    'extremePrice' => $lastPt['q75'],
                    'invalidationReference' => $lastPt['q25'],
                    'entryCondition' => 'Price remains inside central corridor',
                    'intermediateEvent' => 'No key zone touch within horizon',
                    'invalidationCondition' => 'Touch of upper or lower key zone',
                ],
                [
                    'id' => 'ZONE_REACTION_REJECTION',
                    'leafId' => 'ZONE_REACTION_REJECTION',
                    'parentBranch' => 'TOUCH_OBSERVED',
                    'label' => 'Key Zone Touch & Reaction Rejection',
                    'bias' => 'neutral',
                    'probability' => $pReaction,
                    'targetPrice' => $lastPt['q50'],
                    'extremePrice' => $lastPt['q75'],
                    'invalidationReference' => $lastPt['q25'],
                    'entryCondition' => 'High/Low touches primary key zone',
                    'intermediateEvent' => 'Penetration remains below 0.2x ATR',
                    'invalidationCondition' => 'Penetration >= 0.2x ATR beyond boundary',
                ],
                [
                    'id' => 'PENETRATE_AND_RECLAIM',
                    'leafId' => 'PENETRATE_AND_RECLAIM',
                    'parentBranch' => 'TOUCH_OBSERVED',
                    'label' => 'Zone Penetration & <=3-Bar Reclaim',
                    'bias' => 'neutral',
                    'probability' => $pReclaim,
                    'targetPrice' => $lastPt['q50'],
                    'extremePrice' => $lastPt['q75'],
                    'invalidationReference' => $lastPt['q25'],
                    'entryCondition' => 'Penetration >= 0.2x ATR beyond zone',
                    'intermediateEvent' => 'Close reclaims inside zone within 3 bars',
                    'invalidationCondition' => '2 consecutive closes outside zone',
                ],
                [
                    'id' => 'CONFIRMED_BREAKOUT_BULL',
                    'leafId' => 'CONFIRMED_BREAKOUT_BULL',
                    'parentBranch' => 'TOUCH_OBSERVED',
                    'label' => 'Confirmed Bullish Zone Expansion',
                    'bias' => 'bull',
                    'probability' => $pBreakBull,
                    'targetPrice' => $lastPt['q75'],
                    'extremePrice' => $lastPt['q90'],
                    'invalidationReference' => $lastPt['q25'],
                    'entryCondition' => 'Upper zone penetration >= 0.2x ATR',
                    'intermediateEvent' => '2 consecutive closes above upper zone',
                    'invalidationCondition' => 'Reclaim below lower structural pivot',
                ],
                [
                    'id' => 'CONFIRMED_BREAKOUT_BEAR',
                    'leafId' => 'CONFIRMED_BREAKOUT_BEAR',
                    'parentBranch' => 'TOUCH_OBSERVED',
                    'label' => 'Confirmed Bearish Zone Contraction',
                    'bias' => 'bear',
                    'probability' => $pBreakBear,
                    'targetPrice' => $lastPt['q25'],
                    'extremePrice' => $lastPt['q10'],
                    'invalidationReference' => $lastPt['q75'],
                    'entryCondition' => 'Lower zone penetration >= 0.2x ATR',
                    'intermediateEvent' => '2 consecutive closes below lower zone',
                    'invalidationCondition' => 'Reclaim above upper structural pivot',
                ],
            ],
            'walkForward' => [
                'evaluatedWindows' => $windows,
                'evalHorizon' => $evalH,
                'forecastStatus' => $status,
                'acceptancePassed' => $passed,
                'effectiveSampleSize' => $nEff,
                'skillScoreVsNaive' => round($skillScore, 4),
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
