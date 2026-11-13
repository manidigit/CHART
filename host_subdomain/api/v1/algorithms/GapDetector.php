<?php
declare(strict_types=1);

namespace ChartIntelligence\Algorithms;

use PDO;
use Throwable;

/**
 * ENG-03 · Smart Market-Calendar-Aware Gap Detection Engine.
 * Identifies missing trading bars across sorted closed candles without false-flagging
 * weekends or outside regular market hours, and persists quality diagnostics.
 */
final class GapDetector
{
    public static function isTradingSlotExpected(int $openMs, string $timeframe, string $symbolCode): bool
    {
        $tf = strtoupper($timeframe);
        $cal = UtcTimeAnchor::getSessionCalendar($symbolCode);
        if ($cal === UtcTimeAnchor::CALENDAR_CRYPTO_24_7) {
            return true;
        }
        $sec = intdiv($openMs, 1000);
        if ($tf === 'W1') {
            return true;
        }
        if ($tf === 'D1') {
            $dow = (int) gmdate('N', $sec); // 1=Mon..5=Fri
            return $dow <= 5;
        }
        $stepMs = UtcTimeAnchor::stepMilliseconds($tf);
        $midMs = $openMs + intdiv($stepMs, 2);
        return UtcTimeAnchor::isMarketOpen($midMs, $symbolCode);
    }

    public static function detectGaps(
        array $candles,
        string $timeframe,
        string $symbolCode,
        ?int $nowMs = null
    ): array {
        $now = $nowMs ?? (int) round(microtime(true) * 1000);
        $tf = strtoupper($timeframe);
        $stepMs = max(60000, UtcTimeAnchor::stepMilliseconds($tf));
        $count = count($candles);

        if ($count < 2) {
            return [
                'gaps_found' => 0,
                'missing_bars_total' => 0,
                'largest_gap_start_utc' => null,
                'largest_gap_end_utc' => null,
                'status' => $count === 0 ? 'NO_DATA' : 'CLEAN',
                'checked_bars' => $count,
                'checked_at_utc_ms' => $now,
                'windows' => [],
            ];
        }

        // Evaluate last 1500 bars for bounded deterministic execution
        $slice = $count > 1500 ? array_slice($candles, -1500) : $candles;
        $windows = [];
        $missingTotal = 0;
        $largestCount = 0;
        $largestStart = null;
        $largestEnd = null;

        for ($i = 1, $n = count($slice); $i < $n; $i++) {
            $prevMs = (int) ($slice[$i - 1]['open_time_utc_ms'] ?? 0);
            $curMs = (int) ($slice[$i]['open_time_utc_ms'] ?? 0);
            if ($prevMs <= 0 || $curMs <= $prevMs) {
                continue;
            }
            $diffMs = $curMs - $prevMs;
            if ($diffMs <= $stepMs + intdiv($stepMs, 2)) {
                continue;
            }

            // Cap walking per gap interval to 5000 steps; estimate above that safely
            $rawSteps = intdiv($diffMs, $stepMs) - 1;
            if ($rawSteps <= 0) {
                continue;
            }

            $expectedMissing = 0;
            if ($rawSteps <= 2000) {
                for ($cursor = $prevMs + $stepMs; $cursor < $curMs - intdiv($stepMs, 4); $cursor += $stepMs) {
                    if (self::isTradingSlotExpected($cursor, $tf, $symbolCode)) {
                        $expectedMissing++;
                    }
                }
            } else {
                // Sample daily chunks for very wide historical gaps (>2000 steps)
                $cal = UtcTimeAnchor::getSessionCalendar($symbolCode);
                $ratio = match ($cal) {
                    UtcTimeAnchor::CALENDAR_CRYPTO_24_7 => 1.0,
                    UtcTimeAnchor::CALENDAR_US_EQUITIES => ($tf === 'D1' ? 5.0 / 7.0 : (5.0 / 7.0) * (6.5 / 24.0)),
                    default => 5.0 / 7.0,
                };
                $expectedMissing = max(1, (int) round($rawSteps * $ratio));
            }

            if ($expectedMissing > 0) {
                $missingTotal += $expectedMissing;
                $gapStart = $prevMs + $stepMs;
                $gapEnd = $curMs - $stepMs;
                if ($expectedMissing > $largestCount) {
                    $largestCount = $expectedMissing;
                    $largestStart = $gapStart;
                    $largestEnd = $gapEnd;
                }
                $windows[] = [
                    'start_utc_ms' => $gapStart,
                    'end_utc_ms' => max($gapStart, $gapEnd),
                    'missing_bars' => $expectedMissing,
                ];
            }
        }

        $gapsFound = count($windows);
        if ($gapsFound > 25) {
            $windows = array_slice($windows, -25);
        }

        return [
            'gaps_found' => $gapsFound,
            'missing_bars_total' => $missingTotal,
            'largest_gap_start_utc' => $largestStart,
            'largest_gap_end_utc' => $largestEnd,
            'status' => $gapsFound > 0 ? 'GAP_OPEN' : 'CLEAN',
            'checked_bars' => count($slice),
            'checked_at_utc_ms' => $now,
            'windows' => $windows,
        ];
    }

    public static function upsertQualityReport(
        ?PDO $pdo,
        string $chartId,
        string $providerId,
        string $timeframe,
        array $report
    ): void {
        if ($pdo === null) {
            return;
        }
        try {
            $stmt = $pdo->prepare(
                "INSERT INTO data_quality_reports
                    (chart_id, provider_id, timeframe, gaps_found, missing_bars_total, largest_gap_start_utc, largest_gap_end_utc, status, report_json)
                 VALUES
                    (:chart_id, :provider_id, :tf, :gaps_found, :missing_total, :lg_start, :lg_end, :status, :report_json)
                 ON DUPLICATE KEY UPDATE
                    gaps_found = VALUES(gaps_found),
                    missing_bars_total = VALUES(missing_bars_total),
                    largest_gap_start_utc = VALUES(largest_gap_start_utc),
                    largest_gap_end_utc = VALUES(largest_gap_end_utc),
                    status = VALUES(status),
                    report_json = VALUES(report_json),
                    checked_at_utc = CURRENT_TIMESTAMP"
            );
            $stmt->execute([
                ':chart_id' => $chartId,
                ':provider_id' => $providerId,
                ':tf' => strtoupper($timeframe),
                ':gaps_found' => (int) ($report['gaps_found'] ?? 0),
                ':missing_total' => (int) ($report['missing_bars_total'] ?? 0),
                ':lg_start' => $report['largest_gap_start_utc'],
                ':lg_end' => $report['largest_gap_end_utc'],
                ':status' => (string) ($report['status'] ?? 'CLEAN'),
                ':report_json' => json_encode($report, JSON_UNESCAPED_SLASHES) ?: '{}',
            ]);
        } catch (Throwable) {
            // Non-fatal persistence safeguard
        }
    }
}
