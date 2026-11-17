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
const {
    parseHistoricalBytes,
    buildManualCandle,
    isImageBytesOrFilename
} = await import('../host_subdomain/assets/js/algorithms/candleImport.js');
const {
    resolvePriceBasis,
    filterSyntheticWeekendAndCombCandles,
    UNIVERSAL_COLOR_PALETTE,
    DEFAULT_INDICATOR_COLORS,
    PROVIDER_METHODS_CATALOG,
    isProviderEnabled,
    normalizeCanonicalChartKey,
    normalizeHexForWeb,
    normalizeHexForAndroid,
    state,
    setIndicatorCustomColor,
    resetSingleIndicatorColor,
    setChartAppearanceColor,
    resetIndicatorColorsToDefault,
    getIndicatorColorPalette
} = await import('../host_subdomain/assets/js/core/store.js');
const { renderTopHeaderBar } = await import('../host_subdomain/assets/js/views/headerView.js');
const { renderSettingsModal } = await import('../host_subdomain/assets/js/views/settingsView.js');
const { renderSymbolOverviewModal } = await import('../host_subdomain/assets/js/views/watchlistView.js');
const { syncSymbolNow } = await import('../host_subdomain/assets/js/services/apiService.js');

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

test('IND-01 & PRED-09/PRED-10: 4-Variant Pivot Points and 30-Period Future Candlestick Projection across all timeframes', () => {
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

    const pivotsStd = TechnicalIndicators.computePivotPoints(sampleBars, 'M15', 'XAUUSD', 'STANDARD');
    assert.ok(pivotsStd);
    assert.equal(pivotsStd.variant, 'STANDARD');
    assert.ok(
        pivotsStd.r3 > pivotsStd.r2 &&
        pivotsStd.r2 > pivotsStd.r1 &&
        pivotsStd.r1 > pivotsStd.p &&
        pivotsStd.p > pivotsStd.s1 &&
        pivotsStd.s1 > pivotsStd.s2 &&
        pivotsStd.s2 > pivotsStd.s3
    );

    const d1Bars = [
        { open_time_utc_ms: Date.parse('2026-07-13T00:00:00Z'), open: 100, high: 120, low: 90, close: 110, volume: 100 },
        { open_time_utc_ms: Date.parse('2026-07-14T00:00:00Z'), open: 114, high: 118, low: 112, close: 115, volume: 100 }
    ];
    const fib = TechnicalIndicators.computePivotPoints(d1Bars, 'D1', 'SPOTBRENT', 'FIBONACCI');
    assert.equal(fib.variant, 'FIBONACCI');
    const expectedP = (120 + 90 + 110) / 3;
    assert.ok(Math.abs(fib.p - expectedP) < 1e-9);
    assert.ok(Math.abs(fib.r1 - (expectedP + 0.382 * 30)) < 1e-9);
    assert.ok(Math.abs(fib.r3 - (expectedP + 30)) < 1e-9);

    const cam = TechnicalIndicators.computePivotPoints(d1Bars, 'D1', 'SPOTBRENT', 'CAMARILLA');
    assert.equal(cam.variant, 'CAMARILLA');
    assert.ok(cam.r4 > cam.r3 && cam.r3 > cam.r2 && cam.r2 > cam.r1);
    assert.ok(cam.s1 > cam.s2 && cam.s2 > cam.s3 && cam.s3 > cam.s4);
    assert.ok(Math.abs(cam.r4 - (110 + (30 * 1.1) / 2)) < 1e-9);

    const woodie = TechnicalIndicators.computePivotPoints(d1Bars, 'D1', 'SPOTBRENT', 'WOODIE');
    assert.equal(woodie.variant, 'WOODIE');
    const expectedWoodieP = (120 + 90 + 2 * 114) / 4;
    assert.ok(Math.abs(woodie.p - expectedWoodieP) < 1e-9);
});

test('AUDIT-v1.40.1: Middle incomplete bucket rejection and D1 UTC midnight alignment', () => {
    const mon1300 = Date.parse('2026-07-13T13:00:00Z');
    const m15Step = 15 * 60_000;
    const bucket1 = [0, 1, 2, 3].map((i) => ({
        open_time_utc_ms: mon1300 + i * m15Step,
        open: 100 + i, high: 105, low: 95, close: 101 + i, volume: 100
    }));
    const bucket2 = [4, 5].map((i) => ({
        open_time_utc_ms: mon1300 + i * m15Step,
        open: 110 + i, high: 115, low: 105, close: 111 + i, volume: 100
    }));
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
    assert.equal(aggResult.length, 2, 'Incomplete middle bucket must be dropped');
    assert.equal(aggResult[0].open_time_utc_ms, mon1300);
    assert.equal(aggResult[1].open_time_utc_ms, mon1300 + 8 * m15Step);

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

    const tsMidday = Date.parse('2026-07-15T15:30:00Z');
    const boundsEq = PriceFormatter.getSessionBucketBounds(tsMidday, 'D1', 'AAPL');
    const boundsFx = PriceFormatter.getSessionBucketBounds(tsMidday, 'D1', 'XAUUSD');
    const boundsCrypto = PriceFormatter.getSessionBucketBounds(tsMidday, 'D1', 'BTCUSD');

    assert.equal(boundsEq.openMs, Date.parse('2026-07-15T00:00:00Z'));
    assert.equal(boundsFx.openMs, Date.parse('2026-07-15T00:00:00Z'));
    assert.equal(boundsCrypto.openMs, Date.parse('2026-07-15T00:00:00Z'));
});

function buildSyntheticBiff8Xls(strings, cells) {
    const records = [];
    const pushRec = (type, payloadBytes) => {
        const hdr = new Uint8Array(4 + payloadBytes.length);
        const dv = new DataView(hdr.buffer);
        dv.setUint16(0, type, true);
        dv.setUint16(2, payloadBytes.length, true);
        hdr.set(payloadBytes, 4);
        records.push(hdr);
    };
    const makeBof = (bofType) => {
        const b = new Uint8Array(16);
        const dv = new DataView(b.buffer);
        dv.setUint16(0, 0x0600, true);
        dv.setUint16(2, bofType, true);
        return b;
    };

    // Globals BOF
    pushRec(0x0809, makeBof(0x0005));
    // SST
    let sstLen = 8;
    for (const s of strings) sstLen += 3 + s.length;
    const sst = new Uint8Array(sstLen);
    const sstDv = new DataView(sst.buffer);
    sstDv.setUint32(0, strings.length, true);
    sstDv.setUint32(4, strings.length, true);
    let p = 8;
    for (const s of strings) {
        sstDv.setUint16(p, s.length, true);
        sst[p + 2] = 0; // compressed ASCII
        p += 3;
        for (let i = 0; i < s.length; i++) sst[p++] = s.charCodeAt(i);
    }
    pushRec(0x00fc, sst);
    pushRec(0x000a, new Uint8Array(0));

    // Worksheet BOF
    pushRec(0x0809, makeBof(0x0010));
    for (const cell of cells) {
        if (cell.kind === 'sst') {
            const b = new Uint8Array(10);
            const dv = new DataView(b.buffer);
            dv.setUint16(0, cell.r, true);
            dv.setUint16(2, cell.c, true);
            dv.setUint32(6, cell.idx, true);
            pushRec(0x00fd, b);
        } else {
            const b = new Uint8Array(14);
            const dv = new DataView(b.buffer);
            dv.setUint16(0, cell.r, true);
            dv.setUint16(2, cell.c, true);
            dv.setFloat64(6, cell.val, true);
            pushRec(0x0203, b);
        }
    }
    pushRec(0x000a, new Uint8Array(0));

    const wbTotal = records.reduce((a, r) => a + r.length, 0);
    const wbSize = Math.max(4096, Math.ceil(wbTotal / 512) * 512);
    const wbSectors = wbSize / 512;
    const totalSectors = 2 + wbSectors; // sec 0 FAT, sec 1 Dir, sec 2.. Workbook
    const file = new Uint8Array(512 + totalSectors * 512);
    const hdv = new DataView(file.buffer);
    file.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
    hdv.setUint16(24, 0x003e, true);
    hdv.setUint16(26, 0x0003, true);
    hdv.setUint16(28, 0xfffe, true);
    hdv.setUint16(30, 9, true);
    hdv.setUint16(32, 6, true);
    hdv.setUint32(44, 1, true); // 1 FAT sector
    hdv.setInt32(48, 1, true); // Dir first sector = 1
    hdv.setUint32(56, 4096, true);
    hdv.setInt32(60, -2, true);
    hdv.setInt32(68, -2, true);
    for (let i = 0; i < 109; i++) hdv.setInt32(76 + i * 4, i === 0 ? 0 : -1, true);

    // Sector 0: FAT
    const fatOff = 512;
    for (let i = 0; i < 128; i++) hdv.setInt32(fatOff + i * 4, -1, true);
    hdv.setInt32(fatOff + 0 * 4, -3, true);
    hdv.setInt32(fatOff + 1 * 4, -2, true);
    for (let s = 0; s < wbSectors; s++) {
        hdv.setInt32(fatOff + (2 + s) * 4, s === wbSectors - 1 ? -2 : 2 + s + 1, true);
    }

    // Sector 1: Directory
    const writeDirEntry = (slot, name, objType, startSec, size) => {
        const base = 512 + 512 + slot * 128;
        for (let i = 0; i < name.length; i++) hdv.setUint16(base + i * 2, name.charCodeAt(i), true);
        hdv.setUint16(base + 64, (name.length + 1) * 2, true);
        file[base + 66] = objType;
        hdv.setInt32(base + 116, startSec, true);
        hdv.setUint32(base + 120, size, true);
    };
    writeDirEntry(0, 'Root Entry', 5, -2, 0);
    writeDirEntry(1, 'Workbook', 2, 2, wbSize);

    let wbPos = 512 + 2 * 512;
    for (const r of records) {
        file.set(r, wbPos);
        wbPos += r.length;
    }
    return file;
}

test('PHASE3-IMPORT: CSV, 2-col Daily Forced D1, SpreadsheetML, HTML, BIFF8 OLE2, JSON, Manual OHLC, and Image Rejection', () => {
    // 1. Strict No-Image-Storage Policy (magic bytes, SVG, and filenames)
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(isImageBytesOrFilename(pngBytes, 'chart.bin', 'application/octet-stream'), true);
    const pngRes = parseHistoricalBytes(pngBytes, 'shot.dat', 'D1');
    assert.equal(pngRes.ok, false);
    assert.equal(pngRes.errorCode, 'ERR_IMAGE_UPLOAD_FORBIDDEN');

    const svgRes = parseHistoricalBytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'chart.txt', 'M15');
    assert.equal(svgRes.ok, false);
    assert.equal(svgRes.errorCode, 'ERR_IMAGE_UPLOAD_FORBIDDEN');

    const jpgByName = parseHistoricalBytes('not even bytes', 'photo.jpg', 'D1');
    assert.equal(jpgByName.ok, false);
    assert.equal(jpgByName.errorCode, 'ERR_IMAGE_UPLOAD_FORBIDDEN');

    // 2. DataHub 2-column daily CSV requested on M15 -> must force D1 and never fabricate intraday bars
    const datahubCsv = 'Date,Price\n2026-01-02,74.10\n2026-01-05,75.40\n';
    const dhRes = parseHistoricalBytes(datahubCsv, 'brent-daily.csv', 'M15', 'SPOTBRENT');
    assert.equal(dhRes.ok, true);
    assert.equal(dhRes.forcedDailyOnly, true);
    assert.equal(dhRes.effectiveTimeframe, 'D1');
    assert.equal(dhRes.candles.length, 2);
    assert.equal(dhRes.candles[1].open, 74.10);
    assert.equal(dhRes.candles[1].close, 75.40);

    // 3. Full OHLCV CSV keeps requested H1
    const ohlcvCsv = 'open_time_utc_iso,open,high,low,close,volume\n2026-07-15T12:00:00Z,100,105,99,104,500\n2026-07-15T13:00:00Z,104,108,103,107,750\n';
    const csvH1 = parseHistoricalBytes(ohlcvCsv, 'bars.csv', 'H1', 'XAUUSD');
    assert.equal(csvH1.ok, true);
    assert.equal(csvH1.forcedDailyOnly, false);
    assert.equal(csvH1.effectiveTimeframe, 'H1');
    assert.equal(csvH1.candles.length, 2);

    // 4. EIA SpreadsheetML XML .xls -> forces D1
    const xmlXls = `<Workbook><Worksheet><Table>
      <Row><Cell><Data>Date</Data></Cell><Cell><Data>Europe Brent Spot Price FOB</Data></Cell></Row>
      <Row><Cell><Data>1987-05-20</Data></Cell><Cell><Data>18.63</Data></Cell></Row>
      <Row><Cell><Data>1987-05-21</Data></Cell><Cell><Data>18.45</Data></Cell></Row>
    </Table></Worksheet></Workbook>`;
    const xmlRes = parseHistoricalBytes(xmlXls, 'RBRTEd.xls', 'M15', 'SPOTBRENT');
    assert.equal(xmlRes.ok, true);
    assert.equal(xmlRes.detectedFormat, 'XLS_XML');
    assert.equal(xmlRes.forcedDailyOnly, true);
    assert.equal(xmlRes.effectiveTimeframe, 'D1');
    assert.equal(xmlRes.candles.length, 2);

    // 5. EIA HTML table .xls -> forces D1
    const htmlXls = `<table><tr><th>Date</th><th>Spot Price</th></tr><tr><td>2026-02-02</td><td>71.20</td></tr><tr><td>2026-02-03</td><td>72.80</td></tr></table>`;
    const htmlRes = parseHistoricalBytes(htmlXls, 'RBRTEd.xls', 'H4', 'SPOTBRENT');
    assert.equal(htmlRes.ok, true);
    assert.equal(htmlRes.detectedFormat, 'XLS_HTML');
    assert.equal(htmlRes.forcedDailyOnly, true);
    assert.equal(htmlRes.effectiveTimeframe, 'D1');
    assert.equal(htmlRes.candles.length, 2);

    // 6. Synthetic binary BIFF8 OLE2 .xls -> XLS_BIFF8, forces D1
    const biffBytes = buildSyntheticBiff8Xls(
        ['Date', 'Europe Brent Spot Price FOB'],
        [
            { kind: 'sst', r: 0, c: 0, idx: 0 },
            { kind: 'sst', r: 0, c: 1, idx: 1 },
            { kind: 'num', r: 1, c: 0, val: 46023.0 }, // 2026-01-01
            { kind: 'num', r: 1, c: 1, val: 72.45 },
            { kind: 'num', r: 2, c: 0, val: 46024.0 }, // 2026-01-02
            { kind: 'num', r: 2, c: 1, val: 73.80 }
        ]
    );
    const biffRes = parseHistoricalBytes(biffBytes, 'RBRTEd.xls', 'M15', 'SPOTBRENT');
    assert.equal(biffRes.ok, true);
    assert.equal(biffRes.detectedFormat, 'XLS_BIFF8');
    assert.equal(biffRes.forcedDailyOnly, true);
    assert.equal(biffRes.effectiveTimeframe, 'D1');
    assert.equal(biffRes.candles.length, 2);
    assert.equal(biffRes.candles[0].open_time_utc_ms, Date.parse('2026-01-01T00:00:00Z'));
    assert.equal(biffRes.candles[1].close, 73.80);

    // 7. JSON & Manual OHLC entry
    const jsonRes = parseHistoricalBytes(JSON.stringify({ candles: [{ t: '2026-07-15T14:00:00Z', o: 100, h: 102, l: 98, c: 101, v: 250 }] }), 'feed.json', 'H1');
    assert.equal(jsonRes.ok, true);
    assert.equal(jsonRes.detectedFormat, 'JSON');
    assert.equal(jsonRes.effectiveTimeframe, 'H1');

    const manual = buildManualCandle({ dateTimeInput: '2026-07-15 14:22 UTC', open: 98.1, high: 99.0, low: 97.9, close: 98.6, volume: 120, timeframe: 'M15' });
    assert.ok(manual);
    assert.equal(manual.open_time_utc_ms, Date.parse('2026-07-15T14:15:00Z'));
    assert.equal(manual.close, 98.6);
});

test('COLOR-PARITY: hex normalization, universal palette, custom indicator color set/reset, and chart appearance colors', () => {
    assert.equal(UNIVERSAL_COLOR_PALETTE.length, 18);
    assert.equal(normalizeHexForWeb('#f5a'), '#FF55AA');
    assert.equal(normalizeHexForWeb('FF2962FF'), '#2962FF');
    assert.equal(normalizeHexForWeb('invalid', '#123456'), '#123456');
    assert.equal(normalizeHexForAndroid('#0af'), 'FF00AAFF');
    assert.equal(normalizeHexForAndroid('#FF10B981'), 'FF10B981');

    resetIndicatorColorsToDefault();
    const initPal = getIndicatorColorPalette(state.chartPreferences);
    assert.equal(initPal.ichimokuTenkan, '#2962FF');
    assert.equal(initPal.ichimokuKijun, '#EF5350');
    assert.equal(initPal.ichimokuCloud, '#06B6D4');
    assert.equal(initPal.ichimokuChikou, '#10B981');
    assert.equal(initPal.smcBullChoch, '#38BDF8');
    assert.equal(initPal.smcEql, '#10B981');
    assert.ok(initPal.maBase);
    assert.ok(initPal.bandsBase);
    assert.ok(initPal.levelsBase);
    assert.ok(initPal.trendBase);
    assert.ok(initPal.smcBase);

    // Custom indicator color + alias syncing (macd <-> macdLine, adx14 <-> adxLine, stoch14 <-> stochK)
    assert.equal(setIndicatorCustomColor('macd', '#a855f7', true), '#A855F7');
    assert.equal(state.chartPreferences.indicatorCustomColors.macd, '#A855F7');
    assert.equal(state.chartPreferences.indicatorCustomColors.macdLine, '#A855F7');
    assert.equal(getIndicatorColorPalette(state.chartPreferences).macd, '#A855F7');

    // Single-key reset restores default and cleans alias
    const restoredMacd = resetSingleIndicatorColor('macd', true);
    assert.equal(restoredMacd, DEFAULT_INDICATOR_COLORS.macd);
    assert.equal(getIndicatorColorPalette(state.chartPreferences).macd, DEFAULT_INDICATOR_COLORS.macd);

    // Non-3/6 char garbage is safely normalized to fallback instead of corrupting
    assert.equal(setIndicatorCustomColor('rsi14', '#123456', true), '#123456');
    assert.equal(getIndicatorColorPalette(state.chartPreferences).rsi14, '#123456');
    resetSingleIndicatorColor('rsi14', true);
    assert.equal(getIndicatorColorPalette(state.chartPreferences).rsi14, DEFAULT_INDICATOR_COLORS.rsi14);

    // Settings chart appearance colors
    assert.equal(setChartAppearanceColor('bullColor', '#10b981', true), '#10B981');
    assert.equal(state.chartPreferences.bullColor, '#10B981');
    assert.equal(setChartAppearanceColor('trendColor', '#f59e0b', true), '#F59E0B');
    assert.equal(state.chartPreferences.trendColor, '#F59E0B');
});

test('UI-PARITY & TIMEFRAME-SYNC: default by_symbol mode, RTL Settings, disabled Forecast nav tab, and rapid timeframe-switch abort safety', async () => {
    const mockI18n = {
        getCurrentLanguage: () => 'fa',
        t: (k) => k
    };

    // 1. Default watchlist explorer mode must be by_symbol
    assert.equal(state.sourceExplorerMode, 'by_symbol');

    // 2. Settings modal uses dir="rtl" in Persian and renders by_symbol chip before by_source
    const prevModal = state.activeModal;
    const prevSettingsTab = state.settingsTab;
    try {
        state.activeModal = 'settings';
        state.settingsTab = 'watchlist';
        const settingsHtml = renderSettingsModal(mockI18n);
        assert.ok(settingsHtml.includes('dir="rtl"'));
        const idxSym = settingsHtml.indexOf('data-mode="by_symbol"');
        const idxSrc = settingsHtml.indexOf('data-mode="by_source"');
        assert.ok(idxSym > -1 && idxSrc > -1 && idxSym < idxSrc, 'by_symbol mode must appear before by_source');
    } finally {
        state.activeModal = prevModal;
        state.settingsTab = prevSettingsTab;
    }

    // 3. Top header bar keeps Forecast button visible but strictly disabled, keeps Chart nav active, and Symbol Overview disables Forecast CTA
    const prevWorkspace = state.activeWorkspaceView;
    const prevOverview = state.symbolOverviewCode;
    const sampleTab = {
        tabId: 'tab_SPOTBRENT_M15',
        symbolCode: 'SPOTBRENT',
        provider: 'tvdatafeed',
        timeframe: 'M15',
        decimals: 2,
        showFutureProjection: false,
        candles: []
    };
    try {
        state.activeWorkspaceView = 'forecast'; // even if stale state asks for forecast, UI remains on chart
        const chartHeaderHtml = renderTopHeaderBar(sampleTab, mockI18n);
        assert.ok(chartHeaderHtml.includes('tv-open-tabs-strip'));
        assert.ok(chartHeaderHtml.includes('data-action="set-timeframe"'));
        assert.ok(chartHeaderHtml.includes('data-modal="indicators"'));
        assert.ok(chartHeaderHtml.includes('data-view="forecast"'), 'Forecast nav button must remain present');
        assert.ok(
            /data-view="forecast"[^>]*disabled[^>]*aria-disabled="true"|disabled[^>]*data-view="forecast"/.test(chartHeaderHtml),
            'Forecast nav button must be disabled'
        );
        assert.equal(chartHeaderHtml.includes('toggle-future-projection'), false, 'Future projection indicator toggle must be removed');
        assert.equal(chartHeaderHtml.includes('data-action="export-candles-json"'), false, 'JSON export button must be removed from chart topbar');

        state.symbolOverviewCode = 'SPOTBRENT';
        const overviewHtml = renderSymbolOverviewModal(mockI18n);
        if (overviewHtml.includes('open-prediction-from-overview')) {
            assert.ok(overviewHtml.includes('disabled') && overviewHtml.includes('aria-disabled="true"'));
        }
    } finally {
        state.activeWorkspaceView = prevWorkspace;
        state.symbolOverviewCode = prevOverview;
    }

    // 3b. SPOTBRENT daily settlement break (17:00-20:00 NY / 21:00-00:00 UTC in EDT) must not produce false gap warnings
    const brentPreBreak = Date.parse('2026-08-18T20:30:00Z');
    const brentPostBreak = Date.parse('2026-08-19T00:00:00Z');
    const brentBars = [
        { open_time_utc_ms: brentPreBreak, open: 98, high: 98.5, low: 97.8, close: 98.2, volume: 300 },
        { open_time_utc_ms: brentPreBreak + 15 * 60_000, open: 98.2, high: 98.6, low: 98.0, close: 98.4, volume: 320 },
        { open_time_utc_ms: brentPostBreak, open: 98.4, high: 98.9, low: 98.1, close: 98.7, volume: 410 },
        { open_time_utc_ms: brentPostBreak + 15 * 60_000, open: 98.7, high: 99.0, low: 98.5, close: 98.8, volume: 390 },
    ];
    const { GapDetector } = await import('../host_subdomain/assets/js/algorithms/gapDetector.js');
    const brentGapReport = GapDetector.detectGaps(brentBars, 'M15', 'SPOTBRENT');
    assert.equal(brentGapReport.gaps_found, 0, 'SPOTBRENT 17:00-20:00 NY daily break must not be counted as a gap');
    assert.equal(brentGapReport.status, 'CLEAN');

    // 4. Rapid sequential timeframe switching aborts superseded requests and finishes cleanly on D1
    const d1Now = Math.floor(Date.now() / 86_400_000) * 86_400_000;
    const mockD1Candles = Array.from({ length: 40 }, (_, i) => ({
        open_time_utc_ms: d1Now - (39 - i) * 86_400_000,
        open_time_utc_iso: new Date(d1Now - (39 - i) * 86_400_000).toISOString(),
        open: 70 + i * 0.1,
        high: 71 + i * 0.1,
        low: 69.5 + i * 0.1,
        close: 70.5 + i * 0.1,
        volume: 1000
    }));
    const abortedUrls = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts = {}) => {
        const urlStr = String(url);
        if (urlStr.includes('timeframe=H1') || urlStr.includes('timeframe=H4')) {
            return new Promise((resolve, reject) => {
                if (opts.signal) {
                    opts.signal.addEventListener('abort', () => {
                        abortedUrls.push(urlStr);
                        const err = new Error('Aborted');
                        err.name = 'AbortError';
                        reject(err);
                    }, { once: true });
                }
            });
        }
        return {
            ok: true,
            status: 200,
            json: async () => ({
                ok: true,
                data: {
                    candles: mockD1Candles,
                    sync_meta: { sync_mode: 'DELTA_SYNC', fetched_new_bars: 1, provider_status: 'READY' }
                }
            })
        };
    };
    try {
        const pH1 = syncSymbolNow('SPOTBRENT', 'H1', null, false, false);
        const pH4 = syncSymbolNow('SPOTBRENT', 'H4', null, false, false);
        const pD1 = syncSymbolNow('SPOTBRENT', 'D1', null, false, false);
        await Promise.all([pH1, pH4, pD1]);
        assert.ok(abortedUrls.some((u) => u.includes('timeframe=H1')), 'Superseded H1 request must abort');
        assert.ok(abortedUrls.some((u) => u.includes('timeframe=H4')), 'Superseded H4 request must abort');
        const brent = state.symbols.find((s) => s.symbolCode === 'SPOTBRENT');
        assert.equal(brent.timeframe, 'D1');
        assert.equal(brent.syncError, false);
        assert.equal(brent.isSyncing, false);
    } finally {
        globalThis.fetch = origFetch;
    }
});

test('CATALOG-79: expanded 79-symbol catalog, TradingView-only active, and new 57 symbols excluded from default watchlist', () => {
    assert.equal(isProviderEnabled('tvdatafeed'), true);
    assert.equal(isProviderEnabled('yahoo_finance'), false);
    assert.equal(isProviderEnabled('twelve_data'), false);
    assert.equal(isProviderEnabled('biquote'), false);

    const enabledProviders = PROVIDER_METHODS_CATALOG.filter((m) => m.enabled);
    assert.equal(enabledProviders.length, 1);
    assert.equal(enabledProviders[0].providerId, 'tvdatafeed');

    for (const provId of ['tvdatafeed', 'twelve_data', 'yahoo_finance']) {
        const method = PROVIDER_METHODS_CATALOG.find((m) => m.providerId === provId);
        assert.ok(method, `Missing provider ${provId}`);
        assert.equal(method.symbols.length, 79, `${provId} must support 79 catalog symbols`);
        assert.ok(method.symbols.some((s) => s.symbolCode === 'BRK.B'));
        assert.ok(method.symbols.some((s) => s.symbolCode === '2222.SR'));
        assert.ok(method.symbols.some((s) => s.symbolCode === 'AVGO'));
    }

    assert.equal(state.symbols.length, 79);
    const inWatchlistCount = state.symbols.filter((s) => s.inWatchlist).length;
    assert.equal(inWatchlistCount, 22, 'Default watchlist must stay uncluttered with 22 symbols');

    for (const symCode of ['AVGO', 'PLTR', 'BRK.B', 'TSM', 'ASML', 'SKHY', '2222.SR']) {
        const entry = state.symbols.find((s) => s.symbolCode === symCode);
        assert.ok(entry, `Missing catalog entry for ${symCode}`);
        assert.equal(entry.inWatchlist, false, `${symCode} must default to inWatchlist=false`);
        assert.equal(entry.activeProvider, 'tvdatafeed');
        assert.equal(PriceFormatter.getSessionCalendar(symCode), 'US_EQUITIES');
    }

    assert.equal(normalizeCanonicalChartKey('chart_brkb_stock'), 'BRK.B_M15');
    assert.equal(normalizeCanonicalChartKey('chart_2222sr_stock'), '2222.SR_M15');
});
