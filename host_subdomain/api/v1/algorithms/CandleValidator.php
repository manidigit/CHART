<?php
declare(strict_types=1);

namespace ChartIntelligence\Algorithms;

/**
 * Independent Backend Algorithm Module:
 * Enforces OHLC invariants, DECIMAL(18,8) formatting without floating-point drift,
 * and filters synthetic weekend micro-spread "comb/barcode" ticks.
 */
final class CandleValidator
{
    public static function sanitizeCandle(
        int $rawOpenMs,
        string $timeframe,
        float|string $open,
        float|string $high,
        float|string $low,
        float|string $close,
        float|string $volume = 0.0
    ): ?array {
        $o = (float) $open;
        $c = (float) $close;
        if ($o <= 0.0 || $c <= 0.0) {
            return null;
        }
        $h = max((float) $high, $o, $c);
        $l = min((float) $low, $o, $c);
        $v = max(0.0, (float) $volume);
        $snappedMs = UtcTimeAnchor::snapToOpenUtcMs($rawOpenMs, $timeframe);

        return [
            'open_time_utc_ms' => $snappedMs,
            'open_time_utc_iso' => gmdate('Y-m-d H:i \U\T\C', intdiv($snappedMs, 1000)),
            'open' => number_format($o, 8, '.', ''),
            'high' => number_format($h, 8, '.', ''),
            'low' => number_format($l, 8, '.', ''),
            'close' => number_format($c, 8, '.', ''),
            'volume' => number_format($v, 8, '.', ''),
            'is_closed' => true,
        ];
    }

    /**
     * Filters out synthetic weekend off-market micro-spread bars (e.g., Twelve Data weekend XAU/USD
     * flat bars with volume=0 and high-low < 0.018% of open) that cause comb/barcode distortion.
     */
    public static function filterSyntheticWeekendAndCombCandles(
        array $candles,
        string $symbolCode = 'XAUUSD',
        string $timeframe = 'M15'
    ): array {
        if (empty($candles)) {
            return [];
        }
        $normTf = strtoupper($timeframe);
        $isIntraday = !in_array($normTf, ['D1', 'W1'], true);
        $calendar = UtcTimeAnchor::getSessionCalendar($symbolCode);
        if ($calendar === UtcTimeAnchor::CALENDAR_CRYPTO_24_7) {
            return array_values($candles);
        }

        $step1 = [];
        foreach ($candles as $bar) {
            $openMs = (int) ($bar['open_time_utc_ms'] ?? 0);
            $o = (float) ($bar['open'] ?? 0.0);
            $h = (float) ($bar['high'] ?? 0.0);
            $l = (float) ($bar['low'] ?? 0.0);
            $v = (float) ($bar['volume'] ?? 0.0);
            $range = $h - $l;
            $isMicroRange = $o > 0.0 && ($range / $o) < 0.00018;
            $isWeekendClosed = $isIntraday && $calendar === UtcTimeAnchor::CALENDAR_OTC_FX_METALS && UtcTimeAnchor::isOtcWeekendClosed($openMs, $symbolCode);
            if ($isWeekendClosed && ($v <= 0.0 || $isMicroRange)) {
                continue;
            }
            if (!$isIntraday && $normTf === 'D1') {
                $dow = (int) gmdate('w', intdiv($openMs, 1000));
                if ($dow === 0 || $dow === 6) {
                    continue;
                }
            }
            $step1[] = $bar;
        }

        $n = count($step1);
        if ($n < 4) {
            return $step1;
        }

        $result = [];
        $i = 0;
        while ($i < $n) {
            $anchor = $step1[$i];
            $anchorOpen = (float) ($anchor['open'] ?? 0.0);
            $runEnd = $i;
            while ($runEnd < $n) {
                $cur = $step1[$runEnd];
                $curOpen = (float) ($cur['open'] ?? 0.0);
                $curRange = (float) ($cur['high'] ?? 0.0) - (float) ($cur['low'] ?? 0.0);
                $curVol = (float) ($cur['volume'] ?? 0.0);
                $sameOpen = $anchorOpen > 0.0 && (abs($curOpen - $anchorOpen) / $anchorOpen) < 0.00005;
                $microSpread = $anchorOpen > 0.0 && ($curRange / $anchorOpen) < 0.00018;
                if ($sameOpen && $microSpread && $curVol <= 0.0) {
                    $runEnd++;
                } else {
                    break;
                }
            }
            if (($runEnd - $i) >= 3) {
                $i = $runEnd;
            } else {
                $result[] = $anchor;
                $i++;
            }
        }
        return $result;
    }
}
