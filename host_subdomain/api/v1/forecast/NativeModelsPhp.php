<?php
declare(strict_types=1);

namespace ChartIntelligence\Forecast;

final class NativeModelsPhp
{
    public const CANONICAL_HORIZON = 60;

    private static function clampNum(float $v, float $lo, float $hi): float
    {
        if (!is_finite($v)) {
            return $lo;
        }
        return max($lo, min($hi, $v));
    }

    public static function solveLinearSystem(array $matA, array $vecB): ?array
    {
        $n = count($vecB);
        if ($n === 0) {
            return [];
        }
        $a = [];
        $b = [];
        for ($i = 0; $i < $n; $i++) {
            $a[$i] = array_map('floatval', $matA[$i] ?? array_fill(0, $n, 0.0));
            $b[$i] = (float) ($vecB[$i] ?? 0.0);
        }

        for ($col = 0; $col < $n; $col++) {
            $pivot = $col;
            $maxAbs = abs($a[$col][$col]);
            for ($row = $col + 1; $row < $n; $row++) {
                $val = abs($a[$row][$col]);
                if ($val > $maxAbs) {
                    $maxAbs = $val;
                    $pivot = $row;
                }
            }
            if ($maxAbs < 1e-12 || !is_finite($maxAbs)) {
                return null;
            }
            if ($pivot !== $col) {
                [$a[$col], $a[$pivot]] = [$a[$pivot], $a[$col]];
                [$b[$col], $b[$pivot]] = [$b[$pivot], $b[$col]];
            }
            $diag = $a[$col][$col];
            for ($row = $col + 1; $row < $n; $row++) {
                $factor = $a[$row][$col] / $diag;
                if ($factor == 0.0) {
                    continue;
                }
                for ($k = $col; $k < $n; $k++) {
                    $a[$row][$k] -= $factor * $a[$col][$k];
                }
                $b[$row] -= $factor * $b[$col];
            }
        }

        $x = array_fill(0, $n, 0.0);
        for ($i = $n - 1; $i >= 0; $i--) {
            $sum = $b[$i];
            for ($j = $i + 1; $j < $n; $j++) {
                $sum -= $a[$i][$j] * $x[$j];
            }
            $x[$i] = $sum / $a[$i][$i];
            if (!is_finite($x[$i])) {
                return null;
            }
        }
        return $x;
    }

    public static function solveRidge(array $rows, array $targets, float $lambda = 1e-2): ?array
    {
        $m = count($rows);
        if ($m === 0) {
            return null;
        }
        $d = count($rows[0]);
        $xtx = array_fill(0, $d, array_fill(0, $d, 0.0));
        $xty = array_fill(0, $d, 0.0);
        for ($i = 0; $i < $m; $i++) {
            $r = $rows[$i];
            $y = (float) $targets[$i];
            for ($j = 0; $j < $d; $j++) {
                $rj = (float) $r[$j];
                $xty[$j] += $rj * $y;
                for ($k = 0; $k < $d; $k++) {
                    $xtx[$j][$k] += $rj * (float) $r[$k];
                }
            }
        }
        for ($j = 0; $j < $d; $j++) {
            $xtx[$j][$j] += $lambda;
        }
        return self::solveLinearSystem($xtx, $xty);
    }

    private static function seededNormal(int &$seed): float
    {
        $seed = ($seed * 1664525 + 1013904223) & 0x7FFFFFFF;
        $u1 = max(1e-7, $seed / 2147483647.0);
        $seed = ($seed * 1664525 + 1013904223) & 0x7FFFFFFF;
        $u2 = max(1e-7, $seed / 2147483647.0);
        return sqrt(-2.0 * log($u1)) * cos(2.0 * M_PI * $u2);
    }

    public static function sortedQuantile(array $sorted, float $q): float
    {
        $n = count($sorted);
        if ($n === 0) {
            return 0.0;
        }
        if ($n === 1) {
            return (float) $sorted[0];
        }
        $pos = self::clampNum($q, 0.0, 1.0) * ($n - 1);
        $lo = (int) floor($pos);
        $hi = min($n - 1, $lo + 1);
        $frac = $pos - $lo;
        return (float) $sorted[$lo] * (1.0 - $frac) + (float) $sorted[$hi] * $frac;
    }

    private static function buildTimestamps(int $lastOpenMs, string $timeframe, int $horizon): array
    {
        $stepMs = ForecastEnginePhp::stepMilliseconds($timeframe);
        $base = $lastOpenMs > 0 ? $lastOpenMs : (int) round(microtime(true) * 1000);
        $out = [];
        for ($h = 1; $h <= $horizon; $h++) {
            $out[] = $base + $h * $stepMs;
        }
        return $out;
    }

    public static function pointsFromQuantiles(
        float $lastClose,
        array $timestamps,
        array $q10Arr,
        array $q25Arr,
        array $q50Arr,
        array $q75Arr,
        array $q90Arr,
        int $horizon
    ): array {
        $pts = [];
        $prevClose = $lastClose;
        $floorPrice = max(1e-8, $lastClose * 0.02);
        for ($i = 0; $i < $horizon; $i++) {
            $q10 = max($floorPrice, (float) $q10Arr[$i]);
            $q25 = max($q10, (float) $q25Arr[$i]);
            $q50 = max($q25, (float) $q50Arr[$i]);
            $q75 = max($q50, (float) $q75Arr[$i]);
            $q90 = max($q75, (float) $q90Arr[$i]);

            $openP = $prevClose;
            $closeP = $q50;
            $bandSpread = max(1e-6, ($q75 - $q25) * 0.28);
            $highP = max($openP, $closeP) + $bandSpread;
            $lowP = max($floorPrice, min($openP, $closeP) - $bandSpread);
            $prevClose = $closeP;

            $pts[] = [
                'stepAhead' => $i + 1,
                'openTimeUtcMs' => $timestamps[$i] ?? 0,
                'open' => $openP,
                'high' => $highP,
                'low' => $lowP,
                'close' => $closeP,
                'q10' => $q10,
                'q25' => $q25,
                'q50' => $q50,
                'q75' => $q75,
                'q90' => $q90,
                'pctChangeFromLast' => $lastClose > 0 ? (($q50 - $lastClose) / $lastClose) * 100.0 : 0.0,
                'wavePhase' => $closeP >= $openP ? 'IMPULSE' : 'PULLBACK',
            ];
        }
        return $pts;
    }

    public static function pointsFromMeanSigma(
        float $lastClose,
        array $timestamps,
        array $meanReturns,
        array $sigmas,
        int $horizon
    ): array {
        $cumRet = 0.0;
        $cumVar = 0.0;
        $q10 = [];
        $q25 = [];
        $q50 = [];
        $q75 = [];
        $q90 = [];
        for ($i = 0; $i < $horizon; $i++) {
            $cumRet += self::clampNum((float) ($meanReturns[$i] ?? 0.0), -0.06, 0.06);
            $sig = max(1e-5, (float) ($sigmas[$i] ?? 0.004));
            $cumVar += $sig * $sig;
            $cumSig = sqrt(max(1e-9, $cumVar));
            $q10[] = $lastClose * exp($cumRet - 1.28155 * $cumSig);
            $q25[] = $lastClose * exp($cumRet - 0.67449 * $cumSig);
            $q50[] = $lastClose * exp($cumRet);
            $q75[] = $lastClose * exp($cumRet + 0.67449 * $cumSig);
            $q90[] = $lastClose * exp($cumRet + 1.28155 * $cumSig);
        }
        return self::pointsFromQuantiles($lastClose, $timestamps, $q10, $q25, $q50, $q75, $q90, $horizon);
    }

    private static function prepareSeriesStats(array $candles): array
    {
        $n = count($candles);
        $closes = [];
        $times = [];
        $vols = [];
        for ($i = 0; $i < $n; $i++) {
            $closes[] = (float) $candles[$i]['close'];
            $times[] = (int) ($candles[$i]['open_time_utc_ms'] ?? 0);
            $vols[] = max(1.0, (float) ($candles[$i]['volume'] ?? 100.0));
        }
        $returns = [];
        for ($i = 1; $i < $n; $i++) {
            $returns[] = log($closes[$i] / max(1e-8, $closes[$i - 1]));
        }
        $rc = count($returns);
        $meanR = $rc > 0 ? array_sum($returns) / $rc : 0.0;
        $varSum = 0.0;
        foreach ($returns as $r) {
            $d = $r - $meanR;
            $varSum += $d * $d;
        }
        $sigma = max(1e-5, sqrt($varSum / max(1, $rc - 1)));
        return [
            'n' => $n,
            'closes' => $closes,
            'times' => $times,
            'vols' => $vols,
            'returns' => $returns,
            'meanR' => $meanR,
            'sigma' => $sigma,
            'lastClose' => $closes[$n - 1],
            'lastOpenMs' => $times[$n - 1],
            'startOpenMs' => $times[0],
        ];
    }

    public static function runArimaDiff(array $candles, string $timeframe, int $horizon): array
    {
        $st = self::prepareSeriesStats($candles);
        $r1 = $st['returns'];
        if (count($r1) < 20) {
            return [
                'modelId' => 'native_arima_diff',
                'modelName' => 'ARIMA(p,d,q) Differenced',
                'family' => 'ECONOMETRIC',
                'executionRuntime' => 'NATIVE_PHP',
                'isApproximation' => false,
                'isCalibratedInterval' => true,
                'status' => 'SKIPPED_LOW_DATA',
                'reason' => 'At least 21 bars required for ARIMA(p,d,q) differencing.',
                'points' => [],
            ];
        }

        // ADF check on r1 with 1 lag
        $rc = count($r1);
        $dRows = [];
        $dTargets = [];
        for ($t = 2; $t < $rc; $t++) {
            $dRows[] = [1.0, $r1[$t - 1], $r1[$t - 1] - $r1[$t - 2]];
            $dTargets[] = $r1[$t] - $r1[$t - 1];
        }
        $adfBeta = self::solveRidge($dRows, $dTargets, 1e-4);
        $dSelected = 1;
        if ($adfBeta !== null) {
            $rho = $adfBeta[1];
            $rss = 0.0;
            foreach ($dRows as $idx => $row) {
                $hat = $adfBeta[0] + $adfBeta[1] * $row[1] + $adfBeta[2] * $row[2];
                $err = $dTargets[$idx] - $hat;
                $rss += $err * $err;
            }
            $s2 = max(1e-12, $rss / max(1, count($dRows) - 3));
            $seRho = sqrt($s2 / max(1e-10, count($dRows) * $st['sigma'] * $st['sigma']));
            $tStat = $rho / max(1e-8, $seRho);
            if ($tStat > -2.55) {
                $dSelected = 2;
            }
        }

        $fitOrder = static function (array $series, int $p, int $q, int $dVal): ?array {
            $n = count($series);
            if ($n < max(16, $p + $q + 8)) {
                return null;
            }
            $longLag = min(6, max($p + 2, (int) floor($n / 6)));
            $longRows = [];
            $longY = [];
            for ($t = $longLag; $t < $n; $t++) {
                $row = [1.0];
                for ($k = 1; $k <= $longLag; $k++) {
                    $row[] = $series[$t - $k];
                }
                $longRows[] = $row;
                $longY[] = $series[$t];
            }
            $longCoefs = self::solveRidge($longRows, $longY, 1e-4);
            if ($longCoefs === null) {
                return null;
            }
            $epsHat = array_fill(0, $n, 0.0);
            for ($t = $longLag; $t < $n; $t++) {
                $hat = $longCoefs[0];
                for ($k = 1; $k <= $longLag; $k++) {
                    $hat += $longCoefs[$k] * $series[$t - $k];
                }
                $epsHat[$t] = $series[$t] - $hat;
            }

            $startT = max($p, $q, $longLag);
            $dim = 1 + $p + $q;
            $rows = [];
            $y = [];
            for ($t = $startT; $t < $n; $t++) {
                $row = [1.0];
                for ($i = 1; $i <= $p; $i++) {
                    $row[] = $series[$t - $i];
                }
                for ($j = 1; $j <= $q; $j++) {
                    $row[] = $epsHat[$t - $j];
                }
                $rows[] = $row;
                $y[] = $series[$t];
            }
            $effN = count($rows);
            if ($effN <= $dim + 3) {
                return null;
            }
            $beta = self::solveRidge($rows, $y, 1e-3);
            if ($beta === null) {
                return null;
            }
            $intercept = $beta[0];
            $ar = array_slice($beta, 1, $p);
            $ma = array_slice($beta, 1 + $p, $q);
            $arSum = array_sum(array_map('abs', $ar));
            if ($arSum >= 0.98 && $arSum > 0.0) {
                $scale = 0.95 / $arSum;
                foreach ($ar as $idx => $v) {
                    $ar[$idx] = $v * $scale;
                }
            }
            $maSum = array_sum(array_map('abs', $ma));
            if ($maSum >= 0.98 && $maSum > 0.0) {
                $scale = 0.95 / $maSum;
                foreach ($ma as $idx => $v) {
                    $ma[$idx] = $v * $scale;
                }
            }

            $finalEps = array_fill(0, $n, 0.0);
            $rss = 0.0;
            for ($t = $startT; $t < $n; $t++) {
                $hat = $intercept;
                for ($i = 0; $i < $p; $i++) {
                    $hat += $ar[$i] * $series[$t - 1 - $i];
                }
                for ($j = 0; $j < $q; $j++) {
                    $hat += $ma[$j] * $finalEps[$t - 1 - $j];
                }
                $e = $series[$t] - $hat;
                $finalEps[$t] = $e;
                $rss += $e * $e;
            }
            $sigma2 = max(1e-10, $rss / max(1, $effN - $dim));
            $aic = $effN * log($sigma2) + 2.0 * $dim;
            return [
                'd' => $dVal,
                'p' => $p,
                'q' => $q,
                'intercept' => $intercept,
                'ar' => $ar,
                'ma' => $ma,
                'sigma2' => $sigma2,
                'tailDiffs' => array_slice($series, -max(1, $p)),
                'tailEps' => array_slice($finalEps, -max(1, $q)),
                'aic' => $aic,
            ];
        };

        $dCands = $dSelected === 2 ? [1, 2] : [1];
        $best = null;
        foreach ($dCands as $dTry) {
            if ($dTry === 2) {
                $s = [];
                for ($i = 1; $i < $rc; $i++) {
                    $s[] = $r1[$i] - $r1[$i - 1];
                }
            } else {
                $s = $r1;
            }
            for ($p = 0; $p <= 3; $p++) {
                for ($q = 0; $q <= 2; $q++) {
                    if ($p === 0 && $q === 0) {
                        continue;
                    }
                    $cand = $fitOrder($s, $p, $q, $dTry);
                    if ($cand !== null && ($best === null || $cand['aic'] < $best['aic'])) {
                        $best = $cand;
                    }
                }
            }
        }
        if ($best === null) {
            return [
                'modelId' => 'native_arima_diff',
                'modelName' => 'ARIMA(p,d,q) Differenced',
                'family' => 'ECONOMETRIC',
                'executionRuntime' => 'NATIVE_PHP',
                'isApproximation' => false,
                'isCalibratedInterval' => true,
                'status' => 'FAILED',
                'reason' => 'ARIMA order fit failed on differenced log series.',
                'points' => [],
            ];
        }

        $rollH = max($horizon, self::CANONICAL_HORIZON);
        $diffHist = $best['tailDiffs'];
        $epsHist = $best['tailEps'];
        $p = $best['p'];
        $q = $best['q'];
        $ar = $best['ar'];
        $ma = $best['ma'];

        // Analytical MA(infinity) impulse response for step variance
        $psi = array_fill(0, $rollH, 0.0);
        $psi[0] = 1.0;
        for ($j = 1; $j < $rollH; $j++) {
            $val = $j <= $q ? $ma[$j - 1] : 0.0;
            for ($i = 1; $i <= min($p, $j); $i++) {
                $val += $ar[$i - 1] * $psi[$j - $i];
            }
            $psi[$j] = $val;
        }

        $meanR = [];
        $sigs = [];
        $curRet = $r1[$rc - 1];
        for ($h = 0; $h < $rollH; $h++) {
            $nextVal = $best['intercept'];
            for ($i = 0; $i < $p; $i++) {
                $idx = count($diffHist) - 1 - $i;
                if ($idx >= 0) {
                    $nextVal += $ar[$i] * $diffHist[$idx];
                }
            }
            for ($j = 0; $j < $q; $j++) {
                $idx = count($epsHist) - 1 - $j;
                if ($idx >= 0) {
                    $nextVal += $ma[$j] * $epsHist[$idx];
                }
            }
            $diffHist[] = $nextVal;
            $epsHist[] = 0.0;

            if ($best['d'] === 2) {
                $curRet = self::clampNum($curRet + $nextVal, -0.04, 0.04);
                $meanR[] = $curRet;
            } else {
                $meanR[] = self::clampNum($nextVal, -0.04, 0.04);
            }
            $sigs[] = max(1e-5, sqrt($best['sigma2']) * max(0.25, abs($psi[$h])));
        }

        $timestamps = self::buildTimestamps($st['lastOpenMs'], $timeframe, $horizon);
        $pts = self::pointsFromMeanSigma($st['lastClose'], $timestamps, $meanR, $sigs, $horizon);
        return [
            'modelId' => 'native_arima_diff',
            'modelName' => 'ARIMA(p,d,q) Differenced',
            'family' => 'ECONOMETRIC',
            'executionRuntime' => 'NATIVE_PHP',
            'isApproximation' => false,
            'isCalibratedInterval' => true,
            'status' => 'SUCCESS',
            'reason' => '',
            'trainingStartUtcMs' => $st['startOpenMs'],
            'trainingEndUtcMs' => $st['lastOpenMs'],
            'trainingSampleCount' => $st['n'],
            'points' => $pts,
        ];
    }

    public static function runProphetDecomp(array $candles, string $timeframe, int $horizon): array
    {
        $st = self::prepareSeriesStats($candles);
        $n = $st['n'];
        if ($n < 28) {
            return [
                'modelId' => 'native_prophet_decomp',
                'modelName' => 'Prophet-Style Trend + Fourier (Approx)',
                'family' => 'DECOMPOSITION',
                'executionRuntime' => 'NATIVE_PHP',
                'isApproximation' => true,
                'isCalibratedInterval' => false,
                'status' => 'SKIPPED_LOW_DATA',
                'reason' => 'At least 28 bars required for changepoint trend + Fourier seasonality.',
                'points' => [],
            ];
        }

        $stepMs = ForecastEnginePhp::stepMilliseconds($timeframe);
        $t0Sec = $st['times'][0] > 0 ? $st['times'][0] / 1000.0 : 0.0;
        $endSec = ($st['times'][$n - 1] > 0 ? $st['times'][$n - 1] / 1000.0 : $t0Sec + ($n - 1) * ($stepMs / 1000.0));
        $spanSec = max(1.0, $endSec - $t0Sec);
        $cpFracs = [0.25, 0.50, 0.72, 0.86];

        $buildBasis = static function (float $tsSec) use ($t0Sec, $spanSec, $cpFracs): array {
            $tn = ($tsSec - $t0Sec) / $spanSec;
            $row = [1.0, $tn];
            foreach ($cpFracs as $cp) {
                $row[] = max(0.0, $tn - $cp);
            }
            $dayPhase = 2.0 * M_PI * ($tsSec / 86400.0);
            $weekPhase = 2.0 * M_PI * ($tsSec / 604800.0);
            for ($k = 1; $k <= 2; $k++) {
                $row[] = sin($k * $dayPhase);
                $row[] = cos($k * $dayPhase);
            }
            $row[] = sin($weekPhase);
            $row[] = cos($weekPhase);
            return $row;
        };

        $design = [];
        $targets = [];
        for ($i = 0; $i < $n; $i++) {
            $ts = $st['times'][$i] > 0 ? $st['times'][$i] / 1000.0 : ($t0Sec + $i * ($stepMs / 1000.0));
            $design[] = $buildBasis($ts);
            $targets[] = log($st['closes'][$i]);
        }
        $beta = self::solveRidge($design, $targets, 0.35);
        if ($beta === null) {
            return [
                'modelId' => 'native_prophet_decomp',
                'modelName' => 'Prophet-Style Trend + Fourier (Approx)',
                'family' => 'DECOMPOSITION',
                'executionRuntime' => 'NATIVE_PHP',
                'isApproximation' => true,
                'isCalibratedInterval' => false,
                'status' => 'FAILED',
                'reason' => 'Prophet ridge solver failed.',
                'points' => [],
            ];
        }

        $resSq = 0.0;
        for ($i = 0; $i < $n; $i++) {
            $hat = 0.0;
            foreach ($beta as $j => $bVal) {
                $hat += $bVal * $design[$i][$j];
            }
            $e = $targets[$i] - $hat;
            $resSq += $e * $e;
        }
        $resSig = max(1e-5, sqrt($resSq / max(1, $n - count($beta))));
        $lastHat = 0.0;
        $lastBasis = $design[$n - 1];
        foreach ($beta as $j => $bVal) {
            $lastHat += $bVal * $lastBasis[$j];
        }
        $anchorOffset = log($st['lastClose']) - $lastHat;

        $rollH = max($horizon, self::CANONICAL_HORIZON);
        $futTimestamps = self::buildTimestamps($st['lastOpenMs'], $timeframe, $rollH);
        $meanR = [];
        $sigs = [];
        $prevHat = log($st['lastClose']);
        for ($h = 0; $h < $rollH; $h++) {
            $futSec = ($futTimestamps[$h] > 0 ? $futTimestamps[$h] / 1000.0 : $endSec + ($h + 1) * ($stepMs / 1000.0));
            $bVec = $buildBasis($futSec);
            $rawHat = $anchorOffset;
            foreach ($beta as $j => $bVal) {
                $rawHat += $bVal * $bVec[$j];
            }
            $dampLog = log($st['lastClose']) + ($rawHat - log($st['lastClose'])) * exp(-0.015 * $h);
            $stepR = self::clampNum($dampLog - $prevHat, -0.04, 0.04);
            $prevHat = $dampLog;
            $meanR[] = $stepR;
            $sigs[] = max($resSig * 0.45, $st['sigma']) * sqrt(1.0 + 0.03 * $h);
        }

        $pts = self::pointsFromMeanSigma($st['lastClose'], array_slice($futTimestamps, 0, $horizon), $meanR, $sigs, $horizon);
        return [
            'modelId' => 'native_prophet_decomp',
            'modelName' => 'Prophet-Style Trend + Fourier (Approx)',
            'family' => 'DECOMPOSITION',
            'executionRuntime' => 'NATIVE_PHP',
            'isApproximation' => true,
            'isCalibratedInterval' => false,
            'status' => 'SUCCESS',
            'reason' => '',
            'trainingStartUtcMs' => $st['startOpenMs'],
            'trainingEndUtcMs' => $st['lastOpenMs'],
            'trainingSampleCount' => $st['n'],
            'points' => $pts,
        ];
    }

    public static function runSequenceRecurrent(array $candles, string $timeframe, int $horizon): array
    {
        $st = self::prepareSeriesStats($candles);
        $returns = $st['returns'];
        $seqLen = 14;
        if (count($returns) < $seqLen + 14) {
            return [
                'modelId' => 'native_seq_recurrent_approx',
                'modelName' => 'Native Recurrent + MC Dropout (Approx)',
                'family' => 'SEQUENCE_APPROX',
                'executionRuntime' => 'NATIVE_PHP',
                'isApproximation' => true,
                'isCalibratedInterval' => false,
                'status' => 'SKIPPED_LOW_DATA',
                'reason' => 'At least ' . ($seqLen + 15) . ' bars required for recurrent sequence training.',
                'points' => [],
            ];
        }

        // Strict training-only standardization
        $meanR = $st['meanR'];
        $stdR = max(1e-5, $st['sigma']);
        $normR = array_map(static fn($r) => self::clampNum(($r - $meanR) / $stdR, -4.0, 4.0), $returns);

        $hidden = 12;
        $seed = 97531;
        $wIn = [];
        $wRec = [];
        for ($h = 0; $h < $hidden; $h++) {
            $wIn[] = self::seededNormal($seed) * 0.45;
            $row = [];
            for ($k = 0; $k < $hidden; $k++) {
                $row[] = self::seededNormal($seed) * 0.20;
            }
            $wRec[] = $row;
        }

        $encodeWindow = static function (array $window, bool $applyDrop, int &$dSeed, float $dropRate = 0.15) use ($hidden, $wIn, $wRec): array {
            $state = array_fill(0, $hidden, 0.0);
            foreach ($window as $x) {
                $next = array_fill(0, $hidden, 0.0);
                for ($h = 0; $h < $hidden; $h++) {
                    $pre = $wIn[$h] * $x;
                    for ($k = 0; $k < $hidden; $k++) {
                        $pre += $wRec[$h][$k] * $state[$k];
                    }
                    $z = 0.65 * $state[$h] + 0.35 * tanh($pre);
                    if ($applyDrop) {
                        $dSeed = ($dSeed * 1664525 + 1013904223) & 0x7FFFFFFF;
                        if (($dSeed / 2147483647.0) < $dropRate) {
                            $z = 0.0;
                        } else {
                            $z /= (1.0 - $dropRate);
                        }
                    }
                    $next[$h] = $z;
                }
                $state = $next;
            }
            $state[] = 1.0;
            return $state;
        };

        $trainRows = [];
        $trainY = [];
        $dummy = 1;
        $limit = count($normR);
        for ($t = $seqLen; $t < $limit; $t++) {
            $win = array_slice($normR, $t - $seqLen, $seqLen);
            $trainRows[] = $encodeWindow($win, false, $dummy);
            $trainY[] = $normR[$t];
        }
        $weights = self::solveRidge($trainRows, $trainY, 1.5);
        if ($weights === null) {
            return [
                'modelId' => 'native_seq_recurrent_approx',
                'modelName' => 'Native Recurrent + MC Dropout (Approx)',
                'family' => 'SEQUENCE_APPROX',
                'executionRuntime' => 'NATIVE_PHP',
                'isApproximation' => true,
                'isCalibratedInterval' => false,
                'status' => 'FAILED',
                'reason' => 'Recurrent ridge solver failed.',
                'points' => [],
            ];
        }

        $rollH = max($horizon, self::CANONICAL_HORIZON);
        $mcRuns = 50;
        $stepPaths = array_fill(0, $rollH, []);
        $baseWin = array_slice($normR, -$seqLen);

        for ($m = 0; $m < $mcRuns; $m++) {
            $mcSeed = 40000 + $m * 131 + $st['n'];
            $win = $baseWin;
            $logPrice = log($st['lastClose']);
            for ($h = 0; $h < $rollH; $h++) {
                $feat = $encodeWindow($win, true, $mcSeed, 0.16);
                $predNorm = 0.0;
                foreach ($weights as $idx => $w) {
                    $predNorm += $w * $feat[$idx];
                }
                $damp = exp(-0.03 * $h);
                $stepRet = self::clampNum($meanR + ($predNorm * $damp * 0.45 + self::seededNormal($mcSeed) * 0.65) * $stdR, -0.05, 0.05);
                $logPrice += $stepRet;
                $stepPaths[$h][] = exp($logPrice);
                $nextNorm = self::clampNum(($stepRet - $meanR) / $stdR, -4.0, 4.0);
                array_shift($win);
                $win[] = $nextNorm;
            }
        }

        $q10 = [];
        $q25 = [];
        $q50 = [];
        $q75 = [];
        $q90 = [];
        for ($h = 0; $h < $horizon; $h++) {
            $arr = $stepPaths[$h];
            sort($arr);
            $q10[] = self::sortedQuantile($arr, 0.10);
            $q25[] = self::sortedQuantile($arr, 0.25);
            $q50[] = self::sortedQuantile($arr, 0.50);
            $q75[] = self::sortedQuantile($arr, 0.75);
            $q90[] = self::sortedQuantile($arr, 0.90);
        }

        $timestamps = self::buildTimestamps($st['lastOpenMs'], $timeframe, $horizon);
        $pts = self::pointsFromQuantiles($st['lastClose'], $timestamps, $q10, $q25, $q50, $q75, $q90, $horizon);
        return [
            'modelId' => 'native_seq_recurrent_approx',
            'modelName' => 'Native Recurrent + MC Dropout (Approx)',
            'family' => 'SEQUENCE_APPROX',
            'executionRuntime' => 'NATIVE_PHP',
            'isApproximation' => true,
            'isCalibratedInterval' => false,
            'status' => 'SUCCESS',
            'reason' => '',
            'trainingStartUtcMs' => $st['startOpenMs'],
            'trainingEndUtcMs' => $st['lastOpenMs'],
            'trainingSampleCount' => $st['n'],
            'points' => $pts,
        ];
    }

    public static function runQuantileAttention(array $candles, string $timeframe, int $horizon): array
    {
        $st = self::prepareSeriesStats($candles);
        if ($st['n'] < 90) {
            return [
                'modelId' => 'native_quantile_attention_approx',
                'modelName' => 'TFT Attention Quantiles (Approx)',
                'family' => 'ATTENTION_APPROX',
                'executionRuntime' => 'NATIVE_PHP',
                'isApproximation' => true,
                'isCalibratedInterval' => false,
                'status' => 'SKIPPED_LOW_DATA',
                'reason' => 'At least 90 bars required for TFT variable selection & attention (got ' . $st['n'] . ').',
                'points' => [],
            ];
        }

        $n = $st['n'];
        $closes = $st['closes'];
        $returns = $st['returns'];
        $vols = $st['vols'];
        $stdR = max(1e-5, $st['sigma']);

        // Causal rolling feature matrix per bar t >= 20
        $feats = [];
        for ($t = 20; $t < $n; $t++) {
            $r1 = $returns[$t - 1];
            $r5 = log($closes[$t] / max(1e-8, $closes[$t - 5])) / 5.0;
            $r20 = log($closes[$t] / max(1e-8, $closes[$t - 20])) / 20.0;
            $vSum = 0.0;
            for ($k = $t - 14; $k < $t; $k++) {
                $vSum += $returns[$k] * $returns[$k];
            }
            $rv14 = sqrt(max(1e-10, $vSum / 14.0));
            $volAvg = array_sum(array_slice($vols, $t - 20, 20)) / 20.0;
            $volRatio = log(max(0.2, min(5.0, $vols[$t] / max(1.0, $volAvg))));
            $feats[$t] = [
                self::clampNum($r1 / $stdR, -4.0, 4.0),
                self::clampNum($r5 / $stdR, -4.0, 4.0),
                self::clampNum($r20 / $stdR, -4.0, 4.0),
                self::clampNum($rv14 / $stdR, 0.2, 4.0),
                self::clampNum($volRatio, -2.0, 2.0),
            ];
        }

        $ctxLen = 16;
        $trainRows = [];
        $trainY = [];
        for ($t = 20 + $ctxLen; $t < $n - 1; $t++) {
            $qVec = $feats[$t];
            $weights = [];
            $maxDot = -1e9;
            for ($k = $t - $ctxLen; $k < $t; $k++) {
                $dot = 0.0;
                for ($d = 0; $d < 5; $d++) {
                    $dot += $qVec[$d] * $feats[$k][$d];
                }
                $dot /= sqrt(5.0);
                $weights[] = $dot;
                if ($dot > $maxDot) {
                    $maxDot = $dot;
                }
            }
            $expSum = 0.0;
            foreach ($weights as $idx => $w) {
                $ew = exp($w - $maxDot);
                $weights[$idx] = $ew;
                $expSum += $ew;
            }
            $ctxVec = array_fill(0, 5, 0.0);
            for ($k = 0; $k < $ctxLen; $k++) {
                $att = $weights[$k] / max(1e-8, $expSum);
                $fk = $feats[$t - $ctxLen + $k];
                for ($d = 0; $d < 5; $d++) {
                    $ctxVec[$d] += $att * $fk[$d];
                }
            }
            $trainRows[] = array_merge($qVec, $ctxVec, [1.0]);
            $trainY[] = self::clampNum($returns[$t] / $stdR, -4.0, 4.0);
        }

        $beta = self::solveRidge($trainRows, $trainY, 1.2);
        if ($beta === null) {
            return [
                'modelId' => 'native_quantile_attention_approx',
                'modelName' => 'TFT Attention Quantiles (Approx)',
                'family' => 'ATTENTION_APPROX',
                'executionRuntime' => 'NATIVE_PHP',
                'isApproximation' => true,
                'isCalibratedInterval' => false,
                'status' => 'FAILED',
                'reason' => 'TFT ridge solver failed.',
                'points' => [],
            ];
        }

        // Canonical 60-step rollout using last bar's query + causal attention context
        $rollH = max($horizon, self::CANONICAL_HORIZON);
        $lastT = $n - 1;
        $qLast = $feats[$lastT];
        $weights = [];
        $maxDot = -1e9;
        for ($k = $lastT - $ctxLen; $k < $lastT; $k++) {
            $dot = 0.0;
            for ($d = 0; $d < 5; $d++) {
                $dot += $qLast[$d] * $feats[$k][$d];
            }
            $dot /= sqrt(5.0);
            $weights[] = $dot;
            if ($dot > $maxDot) {
                $maxDot = $dot;
            }
        }
        $expSum = 0.0;
        foreach ($weights as $idx => $w) {
            $ew = exp($w - $maxDot);
            $weights[$idx] = $ew;
            $expSum += $ew;
        }
        $ctxLast = array_fill(0, 5, 0.0);
        for ($k = 0; $k < $ctxLen; $k++) {
            $att = $weights[$k] / max(1e-8, $expSum);
            $fk = $feats[$lastT - $ctxLen + $k];
            for ($d = 0; $d < 5; $d++) {
                $ctxLast[$d] += $att * $fk[$d];
            }
        }
        $queryRow = array_merge($qLast, $ctxLast, [1.0]);
        $basePredNorm = 0.0;
        foreach ($beta as $j => $b) {
            $basePredNorm += $b * $queryRow[$j];
        }

        $meanR = [];
        $sigs = [];
        for ($h = 0; $h < $rollH; $h++) {
            $decay = exp(-0.035 * $h);
            $meanR[] = self::clampNum($st['meanR'] + $basePredNorm * $stdR * 0.45 * $decay, -0.04, 0.04);
            $sigs[] = $stdR * (1.0 + 0.018 * $h);
        }

        $timestamps = self::buildTimestamps($st['lastOpenMs'], $timeframe, $horizon);
        $pts = self::pointsFromMeanSigma($st['lastClose'], $timestamps, $meanR, $sigs, $horizon);
        return [
            'modelId' => 'native_quantile_attention_approx',
            'modelName' => 'TFT Attention Quantiles (Approx)',
            'family' => 'ATTENTION_APPROX',
            'executionRuntime' => 'NATIVE_PHP',
            'isApproximation' => true,
            'isCalibratedInterval' => false,
            'status' => 'SUCCESS',
            'reason' => '',
            'trainingStartUtcMs' => $st['startOpenMs'],
            'trainingEndUtcMs' => $st['lastOpenMs'],
            'trainingSampleCount' => $st['n'],
            'points' => $pts,
        ];
    }

    public static function runNaiveBaseline(array $candles, string $timeframe, int $horizon): array
    {
        $st = self::prepareSeriesStats($candles);
        $rollH = max($horizon, self::CANONICAL_HORIZON);
        $meanR = array_fill(0, $rollH, 0.0);
        $sigs = array_fill(0, $rollH, $st['sigma']);
        $timestamps = self::buildTimestamps($st['lastOpenMs'], $timeframe, $horizon);
        return [
            'modelId' => 'naive_persistence',
            'modelName' => 'Naive Random-Walk Baseline',
            'family' => 'BASELINE',
            'executionRuntime' => 'NATIVE_PHP',
            'isApproximation' => false,
            'isCalibratedInterval' => true,
            'status' => 'SUCCESS',
            'reason' => '',
            'trainingStartUtcMs' => $st['startOpenMs'],
            'trainingEndUtcMs' => $st['lastOpenMs'],
            'trainingSampleCount' => $st['n'],
            'points' => self::pointsFromMeanSigma($st['lastClose'], $timestamps, $meanR, $sigs, $horizon),
        ];
    }

    public static function runAllAndAudit(
        array $candles,
        string $timeframe,
        int $horizon,
        string $requestedModelId = 'AUTO'
    ): array {
        $trajectories = [];
        $specs = [
            ['id' => 'naive_persistence', 'fn' => [self::class, 'runNaiveBaseline']],
            ['id' => 'native_arima_diff', 'fn' => [self::class, 'runArimaDiff']],
            ['id' => 'native_prophet_decomp', 'fn' => [self::class, 'runProphetDecomp']],
            ['id' => 'native_seq_recurrent_approx', 'fn' => [self::class, 'runSequenceRecurrent']],
            ['id' => 'native_quantile_attention_approx', 'fn' => [self::class, 'runQuantileAttention']],
        ];

        foreach ($specs as $sp) {
            try {
                $trajectories[] = call_user_func($sp['fn'], $candles, $timeframe, $horizon);
            } catch (\Throwable $e) {
                $trajectories[] = [
                    'modelId' => $sp['id'],
                    'modelName' => $sp['id'],
                    'family' => 'NATIVE_PHP',
                    'executionRuntime' => 'NATIVE_PHP',
                    'isApproximation' => str_contains($sp['id'], 'approx') || str_contains($sp['id'], 'prophet'),
                    'isCalibratedInterval' => !str_contains($sp['id'], 'approx') && !str_contains($sp['id'], 'prophet'),
                    'status' => 'FAILED',
                    'reason' => $e->getMessage(),
                    'points' => [],
                ];
            }
        }

        // Chronological walk-forward backtest across origins (strict causal slicing [0..origin-1])
        $n = count($candles);
        $evalH = 5;
        $minTrain = max(32, min(60, (int) floor($n * 0.55)));
        $origins = [];
        if ($n >= $minTrain + $evalH + 2) {
            $stride = max(1, (int) floor(($n - $evalH - $minTrain) / 6));
            for ($o = $minTrain; $o <= $n - $evalH && count($origins) < 6; $o += $stride) {
                $origins[] = $o;
            }
        }

        $benchmarks = [];
        $naiveBench = null;
        foreach ($specs as $sp) {
            $mId = $sp['id'];
            $curTraj = null;
            foreach ($trajectories as $t) {
                if ($t['modelId'] === $mId) {
                    $curTraj = $t;
                    break;
                }
            }
            if (empty($origins)) {
                $benchmarks[] = [
                    'modelId' => $mId,
                    'modelName' => $curTraj['modelName'] ?? $mId,
                    'family' => $curTraj['family'] ?? 'NATIVE_PHP',
                    'windows' => 0,
                    'evaluatedWindows' => 0,
                    'mae' => 0.0,
                    'maePct' => 0.0,
                    'rmse' => 0.0,
                    'safeMapePct' => null,
                    'safeMapeValidCount' => 0,
                    'directionalAccuracyPct' => 0.0,
                    'coverage80Pct' => 0.0,
                    'avgIntervalWidthPct' => null,
                    'executionRuntime' => 'NATIVE_PHP',
                    'isApproximation' => (bool) ($curTraj['isApproximation'] ?? false),
                    'isCalibratedInterval' => (bool) ($curTraj['isCalibratedInterval'] ?? true),
                    'status' => $curTraj['status'] ?? 'SKIPPED_LOW_DATA',
                    'reason' => $curTraj['reason'] ?? 'Insufficient history for walk-forward windows.',
                ];
                continue;
            }

            $sumAbs = 0.0;
            $sumPct = 0.0;
            $sumSq = 0.0;
            $sumMape = 0.0;
            $mapeN = 0;
            $dirOk = 0;
            $covOk = 0;
            $sumWidthPct = 0.0;
            $cnt = 0;
            $wins = 0;
            $lastErr = '';
            $allSkipped = true;

            foreach ($origins as $origin) {
                $trainSlice = array_slice($candles, 0, $origin);
                try {
                    $subRes = call_user_func($sp['fn'], $trainSlice, $timeframe, $evalH);
                } catch (\Throwable $e) {
                    $lastErr = $e->getMessage();
                    $allSkipped = false;
                    continue;
                }
                if (($subRes['status'] ?? '') !== 'SUCCESS' || count($subRes['points'] ?? []) < $evalH) {
                    $lastErr = (string) ($subRes['reason'] ?? $subRes['status'] ?? 'SKIPPED');
                    if (($subRes['status'] ?? '') === 'FAILED') {
                        $allSkipped = false;
                    }
                    continue;
                }
                $allSkipped = false;
                $wins++;
                $baseClose = (float) $candles[$origin - 1]['close'];
                for ($h = 0; $h < $evalH; $h++) {
                    $actual = (float) $candles[$origin + $h]['close'];
                    $pt = $subRes['points'][$h];
                    $pred = (float) $pt['q50'];
                    $err = abs($actual - $pred);
                    $sumAbs += $err;
                    $sumPct += ($err / max(1e-8, $baseClose)) * 100.0;
                    $sumSq += ($actual - $pred) * ($actual - $pred);
                    if (abs($actual) > 1e-8) {
                        $sumMape += ($err / abs($actual)) * 100.0;
                        $mapeN++;
                    }
                    if (($pred - $baseClose) * ($actual - $baseClose) > 0.0 || abs($pred - $baseClose) < 1e-9) {
                        $dirOk++;
                    }
                    if ($actual >= (float) $pt['q10'] && $actual <= (float) $pt['q90']) {
                        $covOk++;
                    }
                    $sumWidthPct += (((float) $pt['q90'] - (float) $pt['q10']) / max(1e-8, $baseClose)) * 100.0;
                    $cnt++;
                }
            }

            if ($wins === 0 || $cnt === 0) {
                $stFlag = ($curTraj['status'] ?? '') !== 'SUCCESS'
                    ? $curTraj['status']
                    : ($allSkipped ? 'SKIPPED_LOW_DATA' : 'FAILED');
                $row = [
                    'modelId' => $mId,
                    'modelName' => $curTraj['modelName'] ?? $mId,
                    'family' => $curTraj['family'] ?? 'NATIVE_PHP',
                    'windows' => 0,
                    'evaluatedWindows' => 0,
                    'mae' => 0.0,
                    'maePct' => 0.0,
                    'rmse' => 0.0,
                    'safeMapePct' => null,
                    'safeMapeValidCount' => 0,
                    'directionalAccuracyPct' => 0.0,
                    'coverage80Pct' => 0.0,
                    'avgIntervalWidthPct' => null,
                    'executionRuntime' => 'NATIVE_PHP',
                    'isApproximation' => (bool) ($curTraj['isApproximation'] ?? false),
                    'isCalibratedInterval' => (bool) ($curTraj['isCalibratedInterval'] ?? true),
                    'status' => $stFlag,
                    'reason' => $lastErr !== '' ? $lastErr : ($curTraj['reason'] ?? ''),
                ];
            } else {
                $row = [
                    'modelId' => $mId,
                    'modelName' => $curTraj['modelName'] ?? $mId,
                    'family' => $curTraj['family'] ?? 'NATIVE_PHP',
                    'windows' => $wins,
                    'evaluatedWindows' => $wins,
                    'mae' => round($sumAbs / $cnt, 6),
                    'maePct' => round($sumPct / $cnt, 4),
                    'rmse' => round(sqrt($sumSq / $cnt), 6),
                    'safeMapePct' => $mapeN > 0 ? round($sumMape / $mapeN, 4) : null,
                    'safeMapeValidCount' => $mapeN,
                    'directionalAccuracyPct' => round(($dirOk / $cnt) * 100.0, 2),
                    'coverage80Pct' => round(($covOk / $cnt) * 100.0, 2),
                    'avgIntervalWidthPct' => round($sumWidthPct / $cnt, 4),
                    'executionRuntime' => 'NATIVE_PHP',
                    'isApproximation' => (bool) ($curTraj['isApproximation'] ?? false),
                    'isCalibratedInterval' => (bool) ($curTraj['isCalibratedInterval'] ?? true),
                    'status' => 'SUCCESS',
                    'reason' => '',
                ];
            }
            $benchmarks[] = $row;
            if ($mId === 'naive_persistence') {
                $naiveBench = $row;
            }
        }

        $selection = self::selectWinnerAndPoints($trajectories, $benchmarks, $requestedModelId, $horizon);
        return [
            'modelTrajectories' => $trajectories,
            'modelBenchmarks' => $benchmarks,
            'naiveBench' => $naiveBench,
            'winnerModelId' => $selection['winnerModelId'],
            'selectedChartModelId' => $selection['selectedChartModelId'],
            'selectionMode' => $selection['selectionMode'],
            'selectionReason' => $selection['selectionReason'],
            'chosenPoints' => $selection['chosenPoints'],
        ];
    }

    public static function selectWinnerAndPoints(
        array $trajectories,
        array $benchmarks,
        string $requestedModelId = 'AUTO',
        int $horizon = 30
    ): array {
        $naiveBench = null;
        foreach ($benchmarks as $b) {
            if (($b['modelId'] ?? '') === 'naive_persistence') {
                $naiveBench = $b;
                break;
            }
        }

        $reqClean = trim($requestedModelId);
        $winnerId = null;
        $bestSkill = -1e9;
        if ($naiveBench !== null && ($naiveBench['status'] ?? '') === 'SUCCESS' && (float) ($naiveBench['mae'] ?? 0.0) > 1e-9) {
            $naiveMae = (float) $naiveBench['mae'];
            $naiveRmse = max(1e-9, (float) ($naiveBench['rmse'] ?? 0.0));
            foreach ($benchmarks as $b) {
                $mId = (string) ($b['modelId'] ?? '');
                if ($mId === 'naive_persistence' || ($b['status'] ?? '') !== 'SUCCESS') {
                    continue;
                }
                if ((int) ($b['evaluatedWindows'] ?? ($b['windows'] ?? 0)) < 5) {
                    continue;
                }
                $maeGain = ($naiveMae - (float) ($b['mae'] ?? 0.0)) / $naiveMae;
                $rmseGain = ($naiveRmse - (float) ($b['rmse'] ?? 0.0)) / $naiveRmse;
                $cov = (float) ($b['coverage80Pct'] ?? 0.0);
                if ($maeGain >= 0.015 && $rmseGain >= 0.015 && $cov >= 40.0 && $cov <= 98.0 && $maeGain > $bestSkill) {
                    $bestSkill = $maeGain;
                    $winnerId = $mId;
                }
            }
        }

        if ($reqClean !== '' && strtoupper($reqClean) !== 'AUTO') {
            $selectedId = $reqClean;
            $selectionMode = 'MANUAL_OVERRIDE';
            $selectionReason = "Manual chart selection: {$reqClean}";
        } elseif ($winnerId !== null) {
            $selectedId = $winnerId;
            $selectionMode = 'AUTO_OOS_BEST';
            $selectionReason = sprintf('OOS Winner %s beat Naive by %.2f%% MAE across >=5 windows.', $winnerId, $bestSkill * 100.0);
        } else {
            $selectedId = 'naive_persistence';
            $selectionMode = 'NO_CLEAR_WINNER_BASELINE';
            $selectionReason = 'No model beat Naive Persistence by >=1.5% OOS MAE & RMSE across >=5 windows; defaulting honestly to baseline.';
        }

        $chosenPoints = [];
        foreach ($trajectories as $t) {
            if (($t['modelId'] ?? '') === $selectedId && ($t['status'] ?? '') === 'SUCCESS' && count($t['points'] ?? []) >= $horizon) {
                $chosenPoints = array_slice($t['points'], 0, $horizon);
                break;
            }
        }
        if (empty($chosenPoints)) {
            foreach ($trajectories as $t) {
                if (($t['modelId'] ?? '') === 'naive_persistence' && count($t['points'] ?? []) >= $horizon) {
                    $chosenPoints = array_slice($t['points'], 0, $horizon);
                    break;
                }
            }
        }
        if (empty($chosenPoints) && !empty($trajectories[0]['points'])) {
            $chosenPoints = array_slice($trajectories[0]['points'], 0, $horizon);
        }

        return [
            'naiveBench' => $naiveBench,
            'winnerModelId' => $winnerId,
            'selectedChartModelId' => $selectedId,
            'selectionMode' => $selectionMode,
            'selectionReason' => $selectionReason,
            'chosenPoints' => $chosenPoints,
        ];
    }
}
