import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Register inline loader to strip browser cache-busting query strings (?v=...) during Node ESM resolution
register(
    'data:text/javascript,' +
        encodeURIComponent(
            'export async function resolve(specifier, context, nextResolve) { return nextResolve(specifier.replace(/\\?v=[0-9.]+$/, ""), context); }'
        )
);

const memStore = new Map();
globalThis.localStorage = {
    getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
    setItem: (k, v) => memStore.set(k, String(v)),
    removeItem: (k) => memStore.delete(k),
    clear: () => memStore.clear()
};

const { PriceFormatter } = await import('../host_subdomain/assets/js/algorithms/priceFormatter.js');
const { TimeframeAggregator } = await import('../host_subdomain/assets/js/algorithms/timeframeAggregator.js');
const { TechnicalIndicators } = await import('../host_subdomain/assets/js/algorithms/technicalIndicators.js');
const { resolvePriceBasis, filterSyntheticWeekendAndCombCandles } = await import(
    '../host_subdomain/assets/js/core/store.js'
);

test('PAR-01: resolvePriceBasis returns CFD Feed for SPOTBRENT on tvdatafeed', () => {
    assert.equal(resolvePriceBasis('SPOTBRENT', 'tvdatafeed'), 'CFD Feed');
    assert.equal(resolvePriceBasis('SPOTBRENT', 'yahoo_finance'), 'Futures Ref');
    assert.equal(resolvePriceBasis('BTCUSD', 'biquote'), 'CFD / MT5 Feed');
});

test('ENG-01b: getSessionCalendar, US Equities H1 (:30 ET), DST-aware OTC weekend, and Contiguity', () => {
    assert.equal(PriceFormatter.getSessionCalendar('DOGEUSD'), 'CRYPTO_24_7');
    assert.equal(PriceFormatter.getSessionCalendar('NAS100'), 'US_EQUITIES');
    assert.equal(PriceFormatter.getSessionCalendar('XAUUSD'), 'OTC_FX_METALS');

    const eqH1Summer = PriceFormatter.getSessionBucketBounds(Date.parse('2026-07-15T14:10:00Z'), 'H1', 'AAPL');
    assert.equal(eqH1Summer.sessionAnchored, true);
    assert.equal(eqH1Summer.openMs, Date.parse('2026-07-15T13:30:00Z'));
    assert.equal(eqH1Summer.closeMs, Date.parse('2026-07-15T14:30:00Z'));

    // Friday 17:15 EDT (21:15 UTC) is closed on OTC
    assert.equal(PriceFormatter.isOtcWeekendClosed(Date.parse('2026-07-17T21:15:00Z')), true);

    const m15Step = 15 * 60_000;
    const mon1330 = Date.parse('2026-07-13T13:30:00Z');
    const sourceBars = Array.from({ length: 8 }, (_, i) => ({
        open_time_utc_ms: mon1330 + i * m15Step,
        open: 200 + i,
        high: 202 + i,
        low: 199 + i,
        close: 201 + i,
        volume: 1000
    }));
    const aggH1 = TimeframeAggregator.aggregateCandles(
        sourceBars,
        'H1',
        mon1330 + 10 * m15Step,
        'AAPL'
    );
    assert.equal(aggH1.length, 2);
    assert.equal(aggH1[0].open_time_utc_ms, mon1330);
});

test('ENG-03b: Volume Profile overlap weighting, VWAP zero-vol handling, and CRYPTO_24_7 Comb exemption', () => {
    const mon1330 = Date.parse('2026-07-13T13:30:00Z');
    const m15Step = 15 * 60_000;
    const cryptoFlatBars = Array.from({ length: 6 }, (_, i) => ({
        open_time_utc_ms: mon1330 + i * m15Step,
        open: 90000,
        high: 90000.01,
        low: 90000,
        close: 90000,
        volume: 0
    }));
    assert.equal(filterSyntheticWeekendAndCombCandles(cryptoFlatBars, 'BTCUSD', 'M15').length, 6);

    const barsWithRealVol = [
        { open_time_utc_ms: mon1330, open: 100, high: 110, low: 100, close: 108, volume: 1000 },
        { open_time_utc_ms: mon1330 + m15Step, open: 108, high: 120, low: 110, close: 118, volume: 0 }
    ];
    const vp = TechnicalIndicators.computeVolumeProfile(barsWithRealVol, 10, 0.7, 'REAL_EXCHANGE');
    assert.ok(vp);
    assert.equal(vp.hasRealVolume, true);
    assert.equal(vp.isEstimated, false);
    // Bar 2 has 0 volume while series hasRealVolume=true, so POC must lie in [100, 110]
    assert.ok(vp.pocPrice >= 100 && vp.pocPrice <= 110);

    const vwap = TechnicalIndicators.computeVwap(barsWithRealVol, 'XAUUSD');
    assert.equal(vwap.length, 2);
    // Bar 2 has 0 volume so cumulative VWAP stays equal to Bar 1's typical price
    assert.ok(Math.abs(vwap[0] - vwap[1]) < 1e-9);
});

test('IND-01 & PRED-09/PRED-10: Pivot Points and 30-Period Future Candlestick Projection across all timeframes', () => {
    const mon1330 = Date.parse('2026-07-13T13:30:00Z');
    const m15Step = 15 * 60_000;
    const sampleBars = Array.from({ length: 60 }, (_, i) => {
        const o = 2700 + i * 1.5;
        return {
            open_time_utc_ms: mon1330 + i * m15Step,
            open: o,
            high: o + 4.0,
            low: o - 3.0,
            close: o + 1.2,
            volume: 500 + i * 10
        };
    });

    const pivots = TechnicalIndicators.computePivotPoints(sampleBars, 'M15', 'XAUUSD');
    assert.ok(pivots);
    assert.ok(pivots.r2 > pivots.r1 && pivots.r1 > pivots.p && pivots.p > pivots.s1 && pivots.p > pivots.s2);

    for (const tf of ['M15', 'M30', 'H1', 'H4', 'D1', 'W1']) {
        const projected = TechnicalIndicators.computeFutureCandlestickProjection(sampleBars, tf, 30);
        assert.equal(projected.length, 30, `Expected 30 projected bars (>=10) for ${tf}`);
        assert.equal(projected[0].step, 1);
        assert.equal(projected[29].step, 30);
        assert.ok(projected.every((c) => c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close)));
    }
});

test('AUDIT-v1.40.1: Middle incomplete bucket rejection and D1 UTC midnight alignment', () => {
    // 1. Timeframe aggregation middle bucket rejection:
    // If aggregating M15 -> H1 for XAUUSD (minExpectedChildren=3), bucket 1 has 4 bars, bucket 2 has only 2 bars (incomplete), bucket 3 has 4 bars.
    const mon1300 = Date.parse('2026-07-13T13:00:00Z');
    const m15Step = 15 * 60_000;
    const bucket1 = [0, 1, 2, 3].map((i) => ({
        open_time_utc_ms: mon1300 + i * m15Step,
        open: 100 + i, high: 105, low: 95, close: 101 + i, volume: 100
    }));
    // Bucket 2 has only 2 bars (missing 2 bars in the middle of data feed)
    const bucket2 = [4, 5].map((i) => ({
        open_time_utc_ms: mon1300 + i * m15Step,
        open: 110 + i, high: 115, low: 105, close: 111 + i, volume: 100
    }));
    // Bucket 3 has 4 bars
    const bucket3 = [8, 9, 10, 11].map((i) => ({
        open_time_utc_ms: mon1300 + i * m15Step,
        open: 120 + i, high: 125, low: 115, close: 121 + i, volume: 100
    }));

    const mixedBars = [...bucket1, ...bucket2, ...bucket3];
    const aggResult = TimeframeAggregator.aggregateCandles(
        mixedBars,
        'H1',
        mon1300 + 12 * m15Step,
        'XAUUSD',
        'M15'
    );
    // Bucket 2 must be rejected because it only has 2 bars (< 3 expected for M15->H1 on OTC)
    assert.equal(aggResult.length, 2, 'Incomplete middle bucket must be dropped');
    assert.equal(aggResult[0].open_time_utc_ms, mon1300);
    assert.equal(aggResult[1].open_time_utc_ms, mon1300 + 8 * m15Step);

    // Also for US_EQUITIES (minExpectedChildren=2), a bucket with only 1 bar must be dropped
    const mon1330 = Date.parse('2026-07-13T13:30:00Z');
    const bucketEq1 = [0, 1, 2, 3].map((i) => ({
        open_time_utc_ms: mon1330 + i * m15Step,
        open: 100 + i, high: 105, low: 95, close: 101 + i, volume: 100
    }));
    const bucketEqSingle = [4].map((i) => ({
        open_time_utc_ms: mon1330 + i * m15Step,
        open: 110, high: 115, low: 105, close: 111, volume: 100
    }));
    const bucketEq3 = [8, 9, 10, 11].map((i) => ({
        open_time_utc_ms: mon1330 + i * m15Step,
        open: 120 + i, high: 125, low: 115, close: 121 + i, volume: 100
    }));
    const aggResultEq = TimeframeAggregator.aggregateCandles(
        [...bucketEq1, ...bucketEqSingle, ...bucketEq3],
        'H1',
        mon1330 + 12 * m15Step,
        'AAPL',
        'M15'
    );
    assert.equal(aggResultEq.length, 2, 'Single bar middle bucket in US Equities must be dropped');

    // 2. D1 UTC midnight open alignment
    const tsMidday = Date.parse('2026-07-15T15:30:00Z');
    const boundsEq = PriceFormatter.getSessionBucketBounds(tsMidday, 'D1', 'AAPL');
    const boundsFx = PriceFormatter.getSessionBucketBounds(tsMidday, 'D1', 'XAUUSD');
    const boundsCrypto = PriceFormatter.getSessionBucketBounds(tsMidday, 'D1', 'BTCUSD');

    assert.equal(boundsEq.openMs, Date.parse('2026-07-15T00:00:00Z'));
    assert.equal(boundsFx.openMs, Date.parse('2026-07-15T00:00:00Z'));
    assert.equal(boundsCrypto.openMs, Date.parse('2026-07-15T00:00:00Z'));
});

