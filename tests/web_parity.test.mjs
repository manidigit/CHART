import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFile } from 'node:fs/promises';

// Register inline loader to strip browser cache-busting query strings (?v=...) during Node ESM resolution
register(
    'data:text/javascript,' +
        encodeURIComponent(
            'export async function resolve(specifier, context, nextResolve) { return nextResolve(specifier.replace(/\\?v=[0-9.]+$/, ""), context); }'
        )
);


test('FORECAST-MIGRATION-UI-01: Unified Forecast Studio discloses shelved shared-hosting capabilities and removes Legacy switcher', async () => {
    const appSource = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
    assert.match(appSource, /Legacy capabilities not yet migrated and verified in New/);
    assert.match(appSource, /Chronos-2 · Not migrated/);
    assert.match(appSource, /Python models · Not migrated/);
    assert.match(appSource, /renderBacktestPanel\(nativeEvaluation/);
    assert.match(appSource, /renderLedgerPanel\(Number\(activeTab\?\.decimals \|\| 2\), isFa\)/);
    assert.match(appSource, /usesNativeEvaluation\s*=\s*selected === 'structural' && isNativeModelSelected/);
    assert.match(appSource, /id: 'ensemble', name: 'Calibrated Ensemble \(V2\)'/);
    // These are disclosure-only labels, not executable selection controls.
    assert.match(appSource, /<span class="chip" aria-disabled="true"/);
    assert.doesNotMatch(appSource, /Legacy · Forecast Studio/);
});

test('FORECAST-MIGRATION-UI-02: Unified Forecast Studio is the sole active engine with legacy preference normalization', async () => {
    const appSource = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
    const storeSource = await readFile(new URL('../host_subdomain/assets/js/core/store.js', import.meta.url), 'utf8');
    assert.match(appSource, /const selected = 'structural';/);
    assert.doesNotMatch(appSource, /data-engine="legacy"/);
    assert.doesNotMatch(appSource, /set-forecast-engine/);
    assert.match(storeSource, /forecastEngineMode:\s*'structural'/);
});

test('FORECAST-REGISTRY-01: all ten native model plugins are registered', async () => {
    const { defaultForecastRegistry } = await import('../host_subdomain/assets/js/forecast/modelRegistry.js');
    const models = defaultForecastRegistry.list();
    const ids = models.map((model) => model.id);
    assert.equal(models.length, 10);
    for (const id of [
        'naive_persistence',
        'historical_drift',
        'kalman_momentum',
        'garch_volatility',
        'arima_ets',
        'gaussian_process',
        'native_arima_diff',
        'native_prophet_decomp',
        'native_seq_recurrent_approx',
        'native_quantile_attention_approx',
    ]) assert.ok(ids.includes(id), `Missing registered model: ${id}`);
});

test('FORECAST-MIGRATION-MODELS-01: the unified model picker is generated from the complete native registry', async () => {
    const appSource = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
    const viewSource = await readFile(new URL('../host_subdomain/assets/js/views/forecastView.js', import.meta.url), 'utf8');
    assert.match(appSource, /const nativeModelChoices = defaultForecastRegistry\.list\(\)/);
    assert.match(appSource, /id: 'AUTO'/);
    assert.match(appSource, /id: 'empirical_analogs'/);
    assert.match(appSource, /id: 'ensemble'/);
    assert.doesNotMatch(viewSource, /ForecastWorkerClient/);
    assert.doesNotMatch(viewSource, /ci-forecast-worker-url/);
});

test('FORECAST-REPLAY-01: historical replay separates pre-anchor training from future-only scoring', async () => {
    const viewSource = await readFile(new URL('../host_subdomain/assets/js/views/forecastView.js', import.meta.url), 'utf8');
    const appSource = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
    assert.match(viewSource, /trainingCandles\s*=\s*candles\.slice\(0,\s*anchorIndex\s*\+\s*1\)/);
    assert.match(viewSource, /actualCandles\s*=\s*candles\.slice\(anchorIndex\s*\+\s*1/);
    assert.match(viewSource, /FUTURE_CANDLES_USED_ONLY_FOR_SCORING/);
    assert.match(viewSource, /data-action="run-forecast-replay"/);
    assert.match(viewSource, /data-action="set-forecast-replay-windows"/);
    assert.match(viewSource, /ci_forecast_replay_history_v1/);
    assert.match(viewSource, /forecastReplayFromDate/);
    assert.match(viewSource, /Date\.parse\(/);
    assert.match(viewSource, /forecast-replay-canvas/);
    assert.match(viewSource, /actualPoints/);
    assert.match(viewSource, /Play Replay/);
    assert.match(viewSource, /Saved Replay Run Comparison/);
    assert.match(appSource, /ci-forecast-replay-from/);
    assert.match(appSource, /action === 'toggle-forecast-replay-playback'/);
    assert.match(appSource, /stopForecastReplayPlayback/);
    assert.match(appSource, /action === 'set-forecast-replay-window'/);
    assert.match(appSource, /action === 'set-forecast-replay-windows'/);
    assert.match(appSource, /runHistoricalForecastReplay\(activeTab/);
});

test('FORECAST-RUNTIME-01: New Native forecast never invokes an external Python worker', async () => {
    const viewSource = await readFile(new URL('../host_subdomain/assets/js/views/forecastView.js', import.meta.url), 'utf8');
    const appSource = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
    assert.match(viewSource, /const workerUrl = ''/);
    assert.doesNotMatch(viewSource, /ForecastWorkerClient\.infer/);
    assert.doesNotMatch(appSource, /save-forecast-worker-url/);
});

test('FORECAST-REPLAY-02: replay refuses insufficient history instead of fabricating forecast windows', async () => {
    const { runHistoricalForecastReplay } = await import('../host_subdomain/assets/js/views/forecastView.js');
    const candles = Array.from({ length: 30 }, (_, index) => ({
        open_time_utc_ms: (index + 1) * 900000,
        open: 100 + index,
        high: 101 + index,
        low: 99 + index,
        close: 100.5 + index,
        volume: 1,
    }));
    const result = await runHistoricalForecastReplay({
        symbolCode: 'SPOTBRENT',
        provider: 'tvdatafeed',
        timeframe: 'M15',
        candles,
    }, { horizonBars: 10, maxWindows: 3 });
    assert.equal(result.status, 'INSUFFICIENT_HISTORY');
    assert.equal(result.windows.length, 0);
    assert.match(result.reason, /155 training candles/);
});

test('ARCH-01: every browser module shares one canonical store.js module URL', async () => {
    const files = [
        '../host_subdomain/assets/js/app.js',
        '../host_subdomain/assets/js/services/apiService.js',
        '../host_subdomain/assets/js/services/structuralForecastService.js',
        '../host_subdomain/assets/js/components/chartRenderer.js',
        '../host_subdomain/assets/js/views/forecastView.js',
        '../host_subdomain/assets/js/views/headerView.js',
        '../host_subdomain/assets/js/views/loginView.js',
        '../host_subdomain/assets/js/views/settingsView.js',
        '../host_subdomain/assets/js/views/watchlistView.js',
    ];
    const versions = [];
    for (const file of files) {
        const source = await readFile(new URL(file, import.meta.url), 'utf8');
        const match = source.match(/from\s+['"][^'"]*core\/store\.js\?v=([0-9.]+)['"]/);
        assert.ok(match, `Missing shared store import in ${file}`);
        versions.push(match[1]);
    }
    assert.deepEqual([...new Set(versions)], ['1.47.41'], 'All UI, chart, forecast and service modules must share one store singleton');
});

test('ARCH-02: unified ES module cache-busting, global store singleton guard, overlay cleanup & focus-pull tab guard', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const jsRoot = path.resolve('host_subdomain/assets/js');
    const allJsFiles = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile() && entry.name.endsWith('.js')) allJsFiles.push(full);
        }
    };
    walk(jsRoot);

    const indexHtml = fs.readFileSync(path.resolve('host_subdomain/index.html'), 'utf8');
    const entryMatch = indexHtml.match(/src=["']\.\/assets\/js\/app\.js\?v=([0-9.]+)["']/);
    assert.ok(entryMatch, 'index.html must load app.js with ?v= cache-buster');
    const canonicalVersion = entryMatch[1];

    const seenVersionsByTarget = new Map();
    const versionRegex = /(?:from\s+|new\s+URL\s*\(\s*)['"]([^'"]+\.js(?:\?v=([0-9.]+))?)['"]/g;
    for (const filePath of allJsFiles) {
        const src = fs.readFileSync(filePath, 'utf8');
        let m;
        while ((m = versionRegex.exec(src)) !== null) {
            const rawSpec = m[1];
            const ver = m[2];
            assert.ok(ver, `Missing ?v= cache-buster in ${path.relative(jsRoot, filePath)} -> ${rawSpec}`);
            assert.equal(
                ver,
                canonicalVersion,
                `Stale/split ?v=${ver} (expected ${canonicalVersion}) in ${path.relative(jsRoot, filePath)} -> ${rawSpec}`
            );
            const targetKey = path.resolve(path.dirname(filePath), rawSpec.split('?')[0]);
            if (!seenVersionsByTarget.has(targetKey)) seenVersionsByTarget.set(targetKey, new Set());
            seenVersionsByTarget.get(targetKey).add(ver);
        }
    }
    for (const [target, vers] of seenVersionsByTarget.entries()) {
        assert.equal(vers.size, 1, `Split ES module versions detected for ${target}: ${[...vers].join(', ')}`);
    }

    // Runtime dual-import test: even if two different ?v= URLs of store.js ever evaluate,
    // globalThis.__CI_STORE_SINGLETON_V1__ guarantees ONE shared state, candleCache & focus-pull clock.
    const storeUrlA = new URL('../host_subdomain/assets/js/core/store.js?v=test_singleton_a', import.meta.url).href;
    const storeUrlB = new URL('../host_subdomain/assets/js/core/store.js?v=test_singleton_b', import.meta.url).href;
    const storeA = await import(storeUrlA);
    const storeB = await import(storeUrlB);
    assert.strictEqual(storeA.state, storeB.state, 'Dual-loaded store.js modules must share exact same state reference');
    assert.strictEqual(storeA.state.candleCache, storeB.state.candleCache, 'Dual-loaded store.js modules must share exact same candleCache');
    storeA.suspendFocusPull(15000);
    assert.equal(storeB.isFocusPullSuspended(), true, 'suspendFocusPull must propagate across dual-loaded store instances');

    // Verify redrawActiveCanvas removes stale .tv-ohlc-overlay when activeTab has no candles
    const appSrc = fs.readFileSync(path.resolve('host_subdomain/assets/js/app.js'), 'utf8');
    assert.equal(appSrc.includes('oldOverlay.remove();'), true, 'redrawActiveCanvas must remove stale .tv-ohlc-overlay when empty');
    assert.equal(appSrc.includes('box.prepend(nextOverlay);'), true, 'redrawActiveCanvas must insert .tv-ohlc-overlay when candles arrive');

    // Verify downloadWorkspaceSync protects fresh local tab/timeframe selections during suspended focus pull
    const apiSrc = fs.readFileSync(path.resolve('host_subdomain/assets/js/services/apiService.js'), 'utf8');
    assert.equal(
        apiSrc.includes('const preserveLocalTabSelection = isLocalNewer || isFocusPullSuspended();'),
        true,
        'downloadWorkspaceSync must respect isFocusPullSuspended() before overwriting open_tabs'
    );
});

test('STORAGE-QUOTA-01: full localStorage auto-evicts candle caches, never throws on tab/symbol switches, and triggers full DB backfill', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const storeMod = await import('../host_subdomain/assets/js/core/store.js');

    // 1. Simulate a 5MB-saturated localStorage that rejects writes until ci_candles_v4_* keys are evicted
    const prevLs = globalThis.localStorage;
    const quotaMap = new Map([
        ['ci_candles_v4_SPOTBRENT_tvdatafeed_M15', 'x'.repeat(2000)],
        ['ci_candles_v4_BTCUSD_tvdatafeed_M30', 'y'.repeat(1800)],
        ['ci_candles_v3_OLD_CACHE', 'z'.repeat(1500)],
    ]);
    const quotaBytesLimit = 5350;
    const currentBytes = () => {
        let total = 0;
        for (const [k, v] of quotaMap.entries()) total += k.length + v.length;
        return total;
    };
    globalThis.localStorage = {
        get length() { return quotaMap.size; },
        key: (i) => Array.from(quotaMap.keys())[i] ?? null,
        getItem: (k) => (quotaMap.has(k) ? quotaMap.get(k) : null),
        removeItem: (k) => quotaMap.delete(k),
        setItem: (k, v) => {
            const s = String(v);
            const prevLen = quotaMap.has(k) ? quotaMap.get(k).length : 0;
            const projected = currentBytes() - prevLen + (quotaMap.has(k) ? 0 : k.length) + s.length;
            if (projected > quotaBytesLimit) {
                const err = new Error('QuotaExceededError');
                err.name = 'QuotaExceededError';
                throw err;
            }
            quotaMap.set(k, s);
        },
        clear: () => quotaMap.clear(),
    };

    try {
        const ok = storeMod.safeLocalStorageSet('ci_open_tabs_v2', JSON.stringify([{ symbolCode: 'SPOTBRENT' }, { symbolCode: 'NVDA' }]));
        assert.equal(ok, true, 'safeLocalStorageSet must succeed after auto-evicting candle cache keys');
        assert.equal(quotaMap.has('ci_candles_v3_OLD_CACHE'), false, 'Legacy candle cache must be evicted first');
        assert.ok(quotaMap.get('ci_open_tabs_v2').includes('NVDA'), 'New NVDA tab must persist cleanly');

        // 2. Simulate completely locked/read-only storage (always throws QuotaExceededError)
        globalThis.localStorage = {
            length: 0,
            key: () => null,
            getItem: () => null,
            removeItem: () => {},
            setItem: () => {
                const err = new Error('QuotaExceededError');
                err.name = 'QuotaExceededError';
                throw err;
            },
            clear: () => {},
        };

        assert.doesNotThrow(() => storeMod.saveOpenTabsToStorage(true), 'saveOpenTabsToStorage must never throw on QuotaExceededError');
        assert.doesNotThrow(() => storeMod.savePreferences(true), 'savePreferences must never throw on QuotaExceededError');
        assert.doesNotThrow(() => storeMod.saveSymbolsToStorage(true), 'saveSymbolsToStorage must never throw on QuotaExceededError');
        assert.doesNotThrow(() => storeMod.saveDrawings('NVDA_D1', [], true), 'saveDrawings must never throw on QuotaExceededError');
        assert.doesNotThrow(() => storeMod.saveLastOpenedSymbol('NVDA'), 'saveLastOpenedSymbol must never throw on QuotaExceededError');
        assert.doesNotThrow(() => storeMod.savePanelLayout(), 'savePanelLayout must never throw on QuotaExceededError');
        assert.doesNotThrow(() => storeMod.saveCandlesToCache('NVDA_tvdatafeed_D1', []), 'saveCandlesToCache must never throw on QuotaExceededError');
    } finally {
        globalThis.localStorage = prevLs;
    }

    // 3. Static audit: zero unprotected bare localStorage.setItem calls in app.js, apiService.js, or store.js
    const appSrc = fs.readFileSync(path.resolve('host_subdomain/assets/js/app.js'), 'utf8');
    const apiSrc = fs.readFileSync(path.resolve('host_subdomain/assets/js/services/apiService.js'), 'utf8');
    const storeSrc = fs.readFileSync(path.resolve('host_subdomain/assets/js/core/store.js'), 'utf8');
    assert.equal(/\blocalStorage\.setItem\s*\(/.test(appSrc), false, 'app.js must route all writes through safeLocalStorageSet');
    assert.equal(/\blocalStorage\.setItem\s*\(/.test(apiSrc), false, 'apiService.js must route all writes through safeLocalStorageSet');
    assert.equal(/\blocalStorage\.setItem\s*\(/.test(storeSrc), false, 'store.js must route all writes through safeLocalStorageSet');

    // 4. Verify openOrFocusSymbolTab triggers full backfill on empty watchlist symbols & click handler has try/catch
    assert.match(appSrc, /const needsFullBackfill = !cached \|\| cached\.length < 30;\s*syncSymbolNow\(symbolCode, tf, renderApp, needsFullBackfill\);/);
    assert.match(appSrc, /Click handler failed:/);
});

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
const { renderSymbolOverviewModal, getAssetBadge, SYMBOL_CATALOG_BADGES } = await import('../host_subdomain/assets/js/views/watchlistView.js');
const { syncSymbolNow } = await import('../host_subdomain/assets/js/services/apiService.js');

test('IND-01: RSI returns neutral for flat prices and extremes for one-sided movement', () => {
    const candles = (closes) => closes.map((close, i) => ({
        open_time_utc_ms: Date.UTC(2026, 0, 1) + i * 60_000,
        open: close,
        high: close,
        low: close,
        close,
        volume: 1
    }));
    assert.equal(TechnicalIndicators.computeRsi(candles([10, 10, 10]), 2)[2], 50);
    assert.equal(TechnicalIndicators.computeRsi(candles([10, 11, 12]), 2)[2], 100);
    assert.equal(TechnicalIndicators.computeRsi(candles([12, 11, 10]), 2)[2], 0);
});

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
        state.activeWorkspaceView = 'chart';
        const chartHeaderHtml = renderTopHeaderBar(sampleTab, mockI18n);
        assert.ok(chartHeaderHtml.includes('tv-open-tabs-strip'));
        assert.ok(chartHeaderHtml.includes('data-action="set-timeframe"'));
        assert.ok(chartHeaderHtml.includes('data-modal="indicators"'));
        assert.ok(chartHeaderHtml.includes('data-view="forecast"'), 'Forecast nav button must remain present');
        assert.equal(/data-view="forecast"[^>]*disabled|disabled[^>]*data-view="forecast"/.test(chartHeaderHtml), false, 'Forecast nav button must be enabled');
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

test('CHRONOS2-INTEGRATION: pinned amazon/chronos-2 revision, 21-quantile Close-only contract, Q50/Q25-Q75 toggles, and strict series-switch invalidation', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {
        isChronosForecastMatchingTab,
        clearTabChronosForecast
    } = await import('../host_subdomain/assets/js/core/store.js');
    const {
        buildClientChronos2CacheKey
    } = await import('../host_subdomain/assets/js/services/apiService.js');
    const { renderIndicatorsModal } = await import('../host_subdomain/assets/js/views/headerView.js');

    const cacheDir = path.resolve('host_subdomain/data/chronos2/cache');
    const h1CachePath = path.join(cacheDir, 'SPOTBRENT_tvdatafeed_H1_1794207600000_H30.json');
    const m15CachePath = path.join(cacheDir, 'SPOTBRENT_tvdatafeed_M15_1794213000000_H30.json');
    assert.equal(fs.existsSync(h1CachePath), true, 'Real Chronos-2 H1 cache file must exist');
    assert.equal(fs.existsSync(m15CachePath), true, 'Real Chronos-2 M15 cache file must exist');

    const h1Payload = JSON.parse(fs.readFileSync(h1CachePath, 'utf8'));
    assert.equal(h1Payload.status, 'READY');
    assert.equal(h1Payload.schema, 'chart_chronos2_forecast_v1');
    assert.equal(h1Payload.model.model_id, 'amazon/chronos-2');
    assert.equal(h1Payload.model.hf_revision_sha, '29ec3766d36d6f73f0696f85560a422f50e8498c');
    assert.equal(h1Payload.series.symbol, 'SPOTBRENT');
    assert.equal(h1Payload.series.provider, 'tvdatafeed');
    assert.equal(h1Payload.series.timeframe, 'H1');
    assert.equal(h1Payload.series.origin_open_time_utc_ms, 1794207600000);
    assert.equal(h1Payload.model.horizon_bars, 30);
    assert.equal(h1Payload.model.native_quantile_levels.length, 21);
    assert.equal(h1Payload.forecast.length, 30);

    for (const step of h1Payload.forecast) {
        assert.equal(typeof step.q50_median, 'number');
        assert.equal(typeof step.q25, 'number');
        assert.equal(typeof step.q75, 'number');
        assert.ok(step.q25 <= step.q50_median && step.q50_median <= step.q75, 'Quantile monotonicity Q25 <= Q50 <= Q75 must hold');
        assert.equal(Object.keys(step.native_quantiles).length, 21, 'All 21 native quantiles must be preserved');
        assert.equal('open' in step, false, 'Zero synthetic OHLC allowed in forecast steps');
        assert.equal('high' in step, false, 'Zero synthetic OHLC allowed in forecast steps');
        assert.equal('low' in step, false, 'Zero synthetic OHLC allowed in forecast steps');
        assert.equal('close' in step, false, 'Zero synthetic OHLC allowed in forecast steps');
    }

    // Verify deterministic client cache key incorporates symbol, provider, timeframe, origin_open_time_utc_ms, horizon, and revision
    const key1 = buildClientChronos2CacheKey('SPOTBRENT', 'tvdatafeed', 'H1', 1794207600000, 30);
    const key2 = buildClientChronos2CacheKey('SPOTBRENT', 'tvdatafeed', 'M15', 1794207600000, 30);
    const key3 = buildClientChronos2CacheKey('SPOTBRENT', 'tvdatafeed', 'H1', 1794211200000, 30);
    assert.notEqual(key1, key2);
    assert.notEqual(key1, key3);
    assert.ok(key1.includes('29ec3766d36d6f73f0696f85560a422f50e8498c'));

    // Verify strict series-switch invalidation (isChronosForecastMatchingTab)
    const matchingTab = {
        symbolCode: 'SPOTBRENT',
        provider: 'tvdatafeed',
        timeframe: 'H1',
        chronosHorizonBars: 30,
        candles: [
            { open_time_utc_ms: 1794204000000, open: 99.5, high: 100.1, low: 99.4, close: 99.7, is_closed: true },
            { open_time_utc_ms: 1794207600000, open: 99.7, high: 100.2, low: 99.6, close: 99.848, is_closed: true }
        ],
        chronosForecast: h1Payload,
        chronosStatus: 'READY'
    };
    assert.equal(isChronosForecastMatchingTab(matchingTab, h1Payload), true);

    // Changing timeframe, symbol, provider, or last closed candle timestamp must reject the previous forecast
    assert.equal(isChronosForecastMatchingTab({ ...matchingTab, timeframe: 'M15' }, h1Payload), false);
    assert.equal(isChronosForecastMatchingTab({ ...matchingTab, symbolCode: 'XAUUSD' }, h1Payload), false);
    assert.equal(isChronosForecastMatchingTab({ ...matchingTab, provider: 'yahoo_finance' }, h1Payload), false);
    assert.equal(
        isChronosForecastMatchingTab(
            {
                ...matchingTab,
                candles: [
                    ...matchingTab.candles,
                    { open_time_utc_ms: 1794211200000, open: 99.848, high: 100.3, low: 99.8, close: 100.1, is_closed: true }
                ]
            },
            h1Payload
        ),
        false
    );

    clearTabChronosForecast(matchingTab);
    assert.equal(matchingTab.chronosForecast, null);
    assert.equal(matchingTab.chronosStatus, 'IDLE');

    // Verify top header & indicators modal expose Native Browser Structural Forecast & Uncertainty Band toggles and mark Chronos-2 disabled
    const mockI18n = { getCurrentLanguage: () => 'fa', t: (k) => k };
    const topBarHtml = renderTopHeaderBar({ ...matchingTab, showStructuralForecast: true, showForecastBand: true }, mockI18n);
    assert.equal(topBarHtml.includes('data-action="toggle-structural-forecast"'), false, 'Forecast engine controls must not be duplicated in the chart toolbar');
    assert.equal(topBarHtml.includes('data-action="toggle-forecast-band"'), false, 'Forecast band controls belong to the Forecast workspace');

    const prevModal = state.activeModal;
    const prevCat = state.activeIndicatorCategory;
    try {
        state.activeModal = 'indicators';
        state.activeIndicatorCategory = 'all';
        const indHtml = renderIndicatorsModal({ ...matchingTab, showStructuralForecast: true, showForecastBand: true }, mockI18n);
        assert.equal(indHtml.includes('data-action="toggle-structural-forecast"'), false, 'Forecast engines must not appear as indicators');
        assert.equal(indHtml.includes('data-action="toggle-forecast-band"'), false, 'Forecast bands must not appear as indicators');
        assert.equal(indHtml.includes('data-action="set-forecast-horizon"'), false, 'Forecast horizon must not appear as an indicator setting');
        assert.ok(indHtml.includes('RSI') || indHtml.includes('MACD'), 'Indicators modal remains dedicated to technical indicators');
        const forecastViewModule = await import('../host_subdomain/assets/js/views/forecastView.js');
        assert.equal(typeof forecastViewModule.renderForecastStudioView, 'undefined', 'Legacy renderForecastStudioView must be removed in Phase 3');
        assert.equal(typeof forecastViewModule.renderOverviewPanel, 'function', 'Shared renderOverviewPanel must remain available for unified Forecast Studio');
        assert.equal(typeof forecastViewModule.buildForecastForTab, 'function', 'Shared buildForecastForTab must remain available for unified Forecast Studio');
    } finally {
        state.activeModal = prevModal;
        state.activeIndicatorCategory = prevCat;
    }

    // Verify forming bar at the tail of candles does not invalidate forecast anchored on last closed candle
    const tabWithFormingBar = {
        ...matchingTab,
        chronosForecast: h1Payload,
        chronosStatus: 'READY',
        candles: [
            { open_time_utc_ms: 1794204000000, open: 99.5, high: 100.1, low: 99.4, close: 99.7, is_closed: true },
            { open_time_utc_ms: 1794207600000, open: 99.7, high: 100.2, low: 99.6, close: 99.848, is_closed: true },
            { open_time_utc_ms: Date.now() + 60_000, open: 99.848, high: 99.9, low: 99.8, close: 99.88, is_closed: false },
        ],
    };
    assert.equal(isChronosForecastMatchingTab(tabWithFormingBar, h1Payload), true);

    const { invalidateTabChronosIfStale, reconcileTabChronosStateOnRender } = await import('../host_subdomain/assets/js/core/store.js');
    const { computeClosedSeriesDigest, extractChronos2ErrorMessage } = await import('../host_subdomain/assets/js/services/apiService.js');

    // Editing base candle close price even with identical timestamp must invalidate forecast & change digest
    const modifiedTab = {
        ...matchingTab,
        showChronosForecast: true,
        chronosForecast: h1Payload,
        chronosStatus: 'READY',
        candles: [
            { open_time_utc_ms: 1794204000000, open: 99.5, high: 100.1, low: 99.4, close: 99.7, is_closed: true },
            { open_time_utc_ms: 1794207600000, open: 99.7, high: 100.2, low: 99.6, close: 101.25, is_closed: true }
        ],
    };
    assert.equal(isChronosForecastMatchingTab(modifiedTab, h1Payload), false, 'Modified close price must invalidate forecast');
    assert.notEqual(
        computeClosedSeriesDigest(matchingTab.candles),
        computeClosedSeriesDigest(modifiedTab.candles),
        'Digest must change when base candle close changes'
    );
    invalidateTabChronosIfStale(modifiedTab);
    assert.equal(modifiedTab.chronosForecast, null);
    assert.equal(modifiedTab.showChronosForecast, false, 'Stale forecast invalidation must not keep active trigger');

    // Regression: renderApp() reconciliation MUST NOT wipe PROCESSING or ERROR states to IDLE when chronosForecast is null
    const processingTab = {
        ...matchingTab,
        showChronosForecast: true,
        chronosForecast: null,
        chronosStatus: 'PROCESSING',
        chronosError: '',
    };
    reconcileTabChronosStateOnRender(processingTab);
    assert.equal(processingTab.chronosStatus, 'PROCESSING', 'PROCESSING state must survive render reconciliation');

    const erroredTab = {
        ...matchingTab,
        showChronosForecast: true,
        chronosForecast: null,
        chronosStatus: 'ERROR',
        chronosError: 'PHP exec() is disabled on this shared hosting environment',
    };
    reconcileTabChronosStateOnRender(erroredTab);
    assert.equal(erroredTab.chronosStatus, 'ERROR', 'ERROR state must survive render reconciliation');
    assert.equal(erroredTab.chronosError, 'PHP exec() is disabled on this shared hosting environment');

    const staleReadyTab = {
        ...matchingTab,
        timeframe: 'M15',
        showChronosForecast: true,
        chronosForecast: h1Payload,
        chronosStatus: 'READY',
        chronosError: '',
    };
    reconcileTabChronosStateOnRender(staleReadyTab);
    assert.equal(staleReadyTab.chronosForecast, null);
    assert.equal(staleReadyTab.chronosStatus, 'IDLE');

    const disabledTab = {
        ...erroredTab,
        showChronosForecast: false,
    };
    reconcileTabChronosStateOnRender(disabledTab);
    assert.equal(disabledTab.chronosStatus, 'IDLE');
    assert.equal(disabledTab.chronosError, '');

    // Regression: ApiEnvelope errors (message_key / error_code), worker data.error, and raw text errors must surface cleanly
    assert.equal(
        extractChronos2ErrorMessage(422, '', {
            ok: false,
            error_code: 'ERR_INSUFFICIENT_CLOSED_CANDLES',
            message_key: 'Insufficient closed candles for SPOTBRENT (M15): 12 closed bars available, minimum 32 required.',
        }),
        'Insufficient closed candles for SPOTBRENT (M15): 12 closed bars available, minimum 32 required.'
    );
    assert.equal(
        extractChronos2ErrorMessage(500, '', {
            ok: true,
            data: { status: 'ERROR', error: 'PHP exec() function is disabled by host configuration.' },
        }),
        'PHP exec() function is disabled by host configuration.'
    );
    assert.equal(
        extractChronos2ErrorMessage(502, 'Upstream Python worker gateway timeout', null),
        'Upstream Python worker gateway timeout'
    );
    assert.equal(
        extractChronos2ErrorMessage(500, '<html><body>500 Internal Server Error</body></html>', null),
        'Server returned error (500)'
    );

    // Verify PHP files use existing ApiEnvelope & Database::getPdo() and JS uses unified v=1.47.1 cache-busting
    const phpEndpointSrc = fs.readFileSync(path.resolve('host_subdomain/api/v1/chronos2_forecast.php'), 'utf8');
    assert.equal(phpEndpointSrc.includes('core/Config.php'), false, 'Must not reference nonexistent Config.php');
    assert.equal(phpEndpointSrc.includes('core/Response.php'), false, 'Must not reference nonexistent Response.php');
    assert.equal(phpEndpointSrc.includes('core/ApiEnvelope.php'), true, 'Must use existing ApiEnvelope.php');

    const phpQueueMgrSrc = fs.readFileSync(path.resolve('host_subdomain/api/v1/core/Chronos2QueueManager.php'), 'utf8');
    assert.equal(phpQueueMgrSrc.includes('Database::getConnection()'), false, 'Must not call nonexistent Database::getConnection()');
    assert.equal(phpQueueMgrSrc.includes('Database::getPdo()'), true, 'Must call Database::getPdo()');
    assert.equal(phpQueueMgrSrc.includes('ProviderCatalog::resolveChartId'), true, 'Must resolve chart_id via ProviderCatalog');

    const indexHtmlSrc = fs.readFileSync(path.resolve('host_subdomain/index.html'), 'utf8');
    const appJsSrc = fs.readFileSync(path.resolve('host_subdomain/assets/js/app.js'), 'utf8');
    const storeJsSrc = fs.readFileSync(path.resolve('host_subdomain/assets/js/core/store.js'), 'utf8');
    const apiServiceJsSrc = fs.readFileSync(path.resolve('host_subdomain/assets/js/services/apiService.js'), 'utf8');
    assert.equal(indexHtmlSrc.includes('?v=1.47.41'), true);
    assert.equal(indexHtmlSrc.includes('?v=1.47.0'), false);
    assert.equal(indexHtmlSrc.includes('?v=1.46.1'), false);
    assert.equal(indexHtmlSrc.includes('?v=1.45.2'), false);
    assert.equal(appJsSrc.includes('?v=1.43.0'), false);
    assert.equal(appJsSrc.includes('?v=1.46.1'), false);
    assert.equal(appJsSrc.includes('?v=1.47.0'), false);
    assert.equal(appJsSrc.includes('?v=1.47.41'), true);

    // Verify Strictly On-Demand Architecture: No Cron dependency, No Queue files, No Auto-execution
    assert.equal(phpEndpointSrc.includes('enqueue_only'), false, 'Endpoint must not support enqueue_only');
    assert.equal(phpEndpointSrc.includes('QUEUED'), false, 'Endpoint must not return QUEUED');
    assert.equal(phpQueueMgrSrc.includes('.job.json'), false, 'Queue manager must not write .job.json queue files');
    assert.equal(phpQueueMgrSrc.includes("'status'    => 'DISABLED'"), true, 'Cron queue processing must be disabled');

    const cronScriptSrc = fs.readFileSync(path.resolve('host_subdomain/scripts/cron_process_chronos2_queue.php'), 'utf8');
    assert.equal(cronScriptSrc.includes("'status'        => 'DISABLED'"), true, 'Cron script must be disabled');

    assert.equal(
        apiServiceJsSrc.includes('MAX_CHRONOS2_ATTEMPTS = 3'),
        true,
        'Client must cap retry tracking to bounded 3 attempts'
    );
    assert.equal(
        storeJsSrc.includes("'showChronosForecast'"),
        false,
        'showChronosForecast must not be in synced INDICATOR_FLAG_KEYS'
    );
    assert.equal(
        appJsSrc.includes('openOrFocusSymbolTab') &&
        appJsSrc.includes('reconcileTabChronosStateOnRender(activeTab)'),
        true,
        'app.js must delegate render reconciliation to reconcileTabChronosStateOnRender(activeTab)'
    );
});

test('SYMBOL-STANDARDS-79: 100% of the 79 catalog symbols have standardized badges with non-empty SVG icons, authentic brand colors, and gradients', () => {
    assert.equal(state.symbols.length, 79, 'Catalog must contain exactly 79 symbols');
    for (const sym of state.symbols) {
        const badge = getAssetBadge(sym.symbolCode);
        assert.ok(badge, `Symbol ${sym.symbolCode} must have an asset badge`);
        assert.ok(badge.label && badge.label.length > 0, `Symbol ${sym.symbolCode} must have a label`);
        assert.ok(badge.color && badge.color.startsWith('#'), `Symbol ${sym.symbolCode} must have a valid hex color`);
        assert.ok(badge.bgGradient && badge.bgGradient.includes('linear-gradient'), `Symbol ${sym.symbolCode} must have a linear gradient`);
        assert.ok(badge.svgIcon && badge.svgIcon.length > 0, `Symbol ${sym.symbolCode} must have a non-empty SVG icon`);
        assert.ok(badge.svgIcon.includes('<svg') && badge.svgIcon.includes('</svg>'), `Symbol ${sym.symbolCode} svgIcon must be valid SVG markup`);
        assert.ok(badge.category && badge.category.length > 0, `Symbol ${sym.symbolCode} must have a category`);
        assert.ok(badge.providerTag && badge.providerTag.length > 0, `Symbol ${sym.symbolCode} must have a providerTag`);
    }
});

test('STRUCTURAL-FORECAST-JS: Native Browser Structural Wave Forecast runs purely in JS on real closed OHLC candles, produces deterministic structured turning points without exec/Python/sin/random/OHLC, and preserves honest INSUFFICIENT_EVIDENCE states', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {
        computeStructuralForecast,
        STRUCTURAL_FORECAST_ENGINE_ID,
        STRUCTURAL_FORECAST_SCHEMA,
        STRUCTURAL_FORECAST_MIN_CLOSED_BARS,
    } = await import('../host_subdomain/assets/js/algorithms/structuralForecastEngine.js');
    const {
        requestStructuralForecastForTab,
        clearStructuralForecastCache,
    } = await import('../host_subdomain/assets/js/services/structuralForecastService.js');
    const {
        state,
        isStructuralForecastMatchingTab,
        invalidateTabStructuralForecastIfStale,
        reconcileTabStructuralForecastOnRender,
    } = await import('../host_subdomain/assets/js/core/store.js');

    // 1) Real SPOTBRENT M15 closed candle fixture test
    const rawSpot = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/spotbrent_m15_sample.json'), 'utf8'));
    const realSlice = rawSpot.candles.slice(-260).map((c) => ({
        open_time_utc_ms: Number(c.open_time_utc_ms),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume || 0),
        is_closed: c.is_closed !== false,
    }));
    const lastRealOpenMs = realSlice[realSlice.length - 1].open_time_utc_ms;
    const realResA = computeStructuralForecast({
        symbolCode: 'SPOTBRENT',
        provider: 'tvdatafeed',
        timeframe: 'M15',
        candles: realSlice,
        horizonBars: 30,
        nowMs: lastRealOpenMs + 3_600_000,
    });
    const realResB = computeStructuralForecast({
        symbolCode: 'SPOTBRENT',
        provider: 'tvdatafeed',
        timeframe: 'M15',
        candles: realSlice,
        horizonBars: 30,
        nowMs: lastRealOpenMs + 3_600_000,
    });

    assert.equal(realResA.schema, STRUCTURAL_FORECAST_SCHEMA);
    assert.equal(realResA.status, 'READY');
    assert.equal(realResA.engine.engine_id, STRUCTURAL_FORECAST_ENGINE_ID);
    assert.equal(realResA.engine.is_chronos2, false, 'Must NEVER identify as Chronos-2');
    assert.equal(realResA.forecast.length, 30);
    assert.ok(realResA.swings.length >= 3, 'Must detect real structural swings');
    assert.ok(realResA.turning_points.length >= 2, 'Must project structured turning points (not a flat straight line)');
    assert.equal(realResA.model_diagnostics.empirical_analogs.status, 'SUCCESS');
    assert.ok(realResA.model_diagnostics.empirical_analogs.matched_count >= 6, 'Causal Historical Analogs must find at least six non-overlapping historical matches');
    assert.equal(realResA.model_paths[0].model_id, 'empirical_analogs');
    assert.equal(realResA.model_paths[0].illustrative_only, true);
    assert.equal(realResA.model_paths[0].points.length, 30);
    assert.equal('open' in realResA.model_paths[0].points[0] || 'high' in realResA.model_paths[0].points[0] || 'low' in realResA.model_paths[0].points[0] || 'close' in realResA.model_paths[0].points[0], false, 'Historical analog path must remain a close-only path, not fabricated OHLC');
    assert.equal(realResA.series.origin_open_time_utc_ms, lastRealOpenMs);
    assert.ok(Math.abs(realResA.series.last_closed_price - realSlice[realSlice.length - 1].close) < 1e-6);

    // Monotonic quantile bounds + timestamps + zero synthetic OHLC
    for (let i = 0; i < realResA.forecast.length; i++) {
        const pt = realResA.forecast[i];
        assert.equal(pt.step, i + 1);
        assert.ok(pt.q10 <= pt.q25 && pt.q25 <= pt.q50_median && pt.q50_median <= pt.q75 && pt.q75 <= pt.q90);
        assert.equal('open' in pt || 'high' in pt || 'low' in pt || 'close' in pt, false, 'Must NOT fabricate synthetic OHLC candles');
        if (i === 0) {
            assert.ok(pt.open_time_utc_ms > lastRealOpenMs);
        } else {
            assert.ok(pt.open_time_utc_ms > realResA.forecast[i - 1].open_time_utc_ms);
        }
        // Determinism check across repeated runs
        assert.equal(pt.q50_median, realResB.forecast[i].q50_median);
        assert.equal(pt.q25, realResB.forecast[i].q25);
        assert.equal(pt.q75, realResB.forecast[i].q75);
    }

    // 2) Forming tail bar must be excluded & forecast still anchored on last closed candle
    const withUnclosedTail = [
        ...realSlice,
        {
            open_time_utc_ms: lastRealOpenMs + 900_000,
            open: realSlice[realSlice.length - 1].close,
            high: realSlice[realSlice.length - 1].close + 0.5,
            low: realSlice[realSlice.length - 1].close - 0.5,
            close: realSlice[realSlice.length - 1].close + 0.25,
            volume: 100,
            is_closed: false,
        },
    ];
    const unclosedRes = computeStructuralForecast({
        symbolCode: 'SPOTBRENT',
        provider: 'tvdatafeed',
        timeframe: 'M15',
        candles: withUnclosedTail,
        horizonBars: 30,
        nowMs: lastRealOpenMs + 3_600_000,
    });
    assert.equal(unclosedRes.status, 'READY');
    assert.equal(unclosedRes.series.origin_open_time_utc_ms, lastRealOpenMs);
    assert.equal(unclosedRes.forecast[0].q50_median, realResA.forecast[0].q50_median);

    // 3) Honest INSUFFICIENT_EVIDENCE for short series & degenerate flat series
    const shortRes = computeStructuralForecast({
        symbolCode: 'SPOTBRENT',
        provider: 'tvdatafeed',
        timeframe: 'M15',
        candles: realSlice.slice(0, STRUCTURAL_FORECAST_MIN_CLOSED_BARS - 5),
        horizonBars: 30,
        nowMs: lastRealOpenMs + 3_600_000,
    });
    assert.equal(shortRes.status, 'INSUFFICIENT_EVIDENCE');
    assert.equal(shortRes.forecast.length, 0);
    assert.ok(shortRes.data_quality.limitations.length >= 1);

    const flatCandles = Array.from({ length: 60 }, (_, idx) => ({
        open_time_utc_ms: 1700000000000 + idx * 900_000,
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 10,
        is_closed: true,
    }));
    const flatRes = computeStructuralForecast({
        symbolCode: 'SPOTBRENT',
        provider: 'tvdatafeed',
        timeframe: 'M15',
        candles: flatCandles,
        horizonBars: 30,
        nowMs: 1700000000000 + 70 * 900_000,
    });
    assert.equal(flatRes.status, 'INSUFFICIENT_EVIDENCE');
    assert.equal(flatRes.forecast.length, 0);
    assert.ok(flatRes.data_quality.limitations.length >= 1);

    // 4) Service cache + tab matching + render reconciliation + stale invalidation
    clearStructuralForecastCache();
    const nowAnchoredStep = 900_000;
    const baseUtc = Math.floor((Date.now() - 200 * nowAnchoredStep) / nowAnchoredStep) * nowAnchoredStep;
    const tabCandles = realSlice.slice(0, 120).map((c, idx) => ({
        ...c,
        open_time_utc_ms: baseUtc + idx * nowAnchoredStep,
        is_closed: true,
    }));
    const lastTabOpenMs = tabCandles[tabCandles.length - 1].open_time_utc_ms;
    const testTab = {
        tabId: 'tab_spot_test',
        symbolCode: 'SPOTBRENT',
        provider: 'tvdatafeed',
        timeframe: 'M15',
        candles: tabCandles,
        showStructuralForecast: true,
        showForecastBand: true,
        forecastHorizonBars: 30,
        structuralForecast: null,
        structuralForecastStatus: 'IDLE',
        structuralForecastError: '',
    };

    const firstSvc = await requestStructuralForecastForTab(testTab, null);
    assert.equal(firstSvc.status, 'READY');
    assert.equal(firstSvc.served_from_cache, false);
    assert.equal(testTab.structuralForecastStatus, 'READY');
    assert.equal(isStructuralForecastMatchingTab(testTab, testTab.structuralForecast), true);
    // Structural horizon is independent: changing the legacy Forecast Studio horizon must not stale this result.
    const legacyHorizonChangedTab = { ...testTab, forecastHorizonBars: 10 };
    assert.equal(isStructuralForecastMatchingTab(legacyHorizonChangedTab, testTab.structuralForecast), true);

    // Subsequent click on same closed series hits in-memory cache cleanly
    testTab.structuralForecast = null;
    const cachedSvc = await requestStructuralForecastForTab(testTab, null);
    assert.equal(cachedSvc.status, 'READY');
    assert.equal(cachedSvc.served_from_cache, true);

    // Regression: COMPUTING & INSUFFICIENT_EVIDENCE survive render reconciliation
    const computingTab = {
        ...testTab,
        structuralForecast: null,
        structuralForecastStatus: 'COMPUTING',
        structuralForecastError: '',
    };
    reconcileTabStructuralForecastOnRender(computingTab);
    assert.equal(computingTab.structuralForecastStatus, 'COMPUTING');

    const insufficientTab = {
        ...testTab,
        structuralForecast: null,
        structuralForecastStatus: 'INSUFFICIENT_EVIDENCE',
        structuralForecastError: 'Not enough swings',
    };
    reconcileTabStructuralForecastOnRender(insufficientTab);
    assert.equal(insufficientTab.structuralForecastStatus, 'INSUFFICIENT_EVIDENCE');
    assert.equal(insufficientTab.structuralForecastError, 'Not enough swings');

    // Editing closed bar price invalidates structural forecast without auto-running
    const modifiedStructTab = {
        ...testTab,
        candles: [
            ...tabCandles.slice(0, -1),
            { ...tabCandles[tabCandles.length - 1], open_time_utc_ms: lastTabOpenMs, close: tabCandles[tabCandles.length - 1].close + 2.5 },
        ],
    };
    invalidateTabStructuralForecastIfStale(modifiedStructTab);
    assert.equal(modifiedStructTab.structuralForecast, null);
    assert.equal(modifiedStructTab.showStructuralForecast, false);
    assert.equal(modifiedStructTab.structuralForecastStatus, 'IDLE');

    // Regression: Stale READY or orphaned IDLE forecast must NOT strand showStructuralForecast=true with empty future slots
    const staleReadyTab = {
        ...testTab,
        candles: [
            ...tabCandles.slice(0, -1),
            { ...tabCandles[tabCandles.length - 1], open_time_utc_ms: lastTabOpenMs, close: tabCandles[tabCandles.length - 1].close + 2.5 },
        ],
    };
    reconcileTabStructuralForecastOnRender(staleReadyTab);
    assert.equal(staleReadyTab.structuralForecast, null);
    assert.equal(staleReadyTab.structuralForecastStatus, 'IDLE');
    assert.equal(staleReadyTab.showStructuralForecast, false);

    const orphanedIdleTab = {
        ...testTab,
        structuralForecast: null,
        structuralForecastStatus: 'IDLE',
        structuralForecastError: '',
    };
    reconcileTabStructuralForecastOnRender(orphanedIdleTab);
    assert.equal(orphanedIdleTab.showStructuralForecast, false);

    // Regression: Canvas rendering & future crosshair hover for Structural JS Forecast
    const prevWin = globalThis.window;
    const prevDoc = globalThis.document;
    globalThis.window = { devicePixelRatio: 1 };
    globalThis.document = { documentElement: { dataset: {} }, body: { classList: { add() {}, remove() {} } } };
    try {
        const { renderCandlestickCanvas } = await import('../host_subdomain/assets/js/components/chartRenderer.js');
        const drawTexts = [];
        const mockCtx = new Proxy(
            {},
            {
                get(_, prop) {
                    if (prop === 'measureText') return (t) => ({ width: String(t).length * 7 });
                    if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
                    if (prop === 'fillText') return (txt, x, y) => drawTexts.push({ txt: String(txt), x, y });
                    return () => {};
                },
                set() {
                    return true;
                },
            }
        );
        const mockCanvas = {
            parentElement: { clientWidth: 1000, clientHeight: 500 },
            getBoundingClientRect: () => ({ width: 1000, height: 500 }),
            style: {},
            getContext: () => mockCtx,
        };

        const renderTab = {
            ...testTab,
            visibleCount: 48,
            scrollOffset: 0,
            decimals: 3,
            hoverIndex: 48, // First future forecast slot when 48 visible candles are displayed
        };
        await requestStructuralForecastForTab(renderTab, null, true);
        assert.equal(renderTab.structuralForecastStatus, 'READY');
        renderCandlestickCanvas(mockCanvas, renderTab, { getCurrentLanguage: () => 'en', t: (k) => k });
        assert.ok(
            drawTexts.some((d) => d.txt.startsWith('Structural JS (+30')),
            'Canvas must render Structural JS badge inside forecast zone'
        );
        assert.equal(
            drawTexts.some((d) => d.txt.startsWith('Historical Analogs')),
            false,
            'Default Structural JS selection must not overlay Historical Analogs'
        );
        assert.ok(
            drawTexts.some((d) => d.txt.startsWith('Fcst ')),
            'Canvas must render central forecast level label on right axis'
        );
        assert.ok(
            drawTexts.some((d) => d.txt.startsWith('Structural JS (+1) · Path:')),
            'Crosshair hover over future forecast slots must render Structural JS tooltip'
        );

        // Selecting Historical Analogs must replace (not overlay) the Structural JS path.
        drawTexts.length = 0;
        const analogCanvasTab = { ...renderTab, structuralForecastModel: 'empirical_analogs', hoverIndex: 48 };
        renderCandlestickCanvas(mockCanvas, analogCanvasTab, { getCurrentLanguage: () => 'en', t: (k) => k });
        assert.ok(
            drawTexts.some((d) => d.txt.startsWith('Historical Analogs (+30')),
            'Canvas must render the selected Historical Analogs model badge'
        );
        assert.equal(
            drawTexts.some((d) => d.txt.startsWith('Structural JS (+30')),
            false,
            'Historical Analogs selection must hide the Structural JS forecast'
        );
        assert.ok(
            drawTexts.some((d) => d.txt.startsWith('Analog ')),
            'Right axis must identify the selected analog forecast price'
        );
        assert.ok(
            drawTexts.some((d) => d.txt.startsWith('Historical Analogs (+1)') && d.txt.includes('Illustrative')),
            'Future crosshair tooltip must identify the selected analog path as illustrative'
        );

        // When status is ERROR without valid forecast, no future horizon slots are stranded blank & limitation banner is shown
        drawTexts.length = 0;
        const errCanvasTab = {
            ...renderTab,
            structuralForecast: null,
            structuralForecastStatus: 'ERROR',
            structuralForecastError: 'Test error notice',
            hoverIndex: null,
        };
        renderCandlestickCanvas(mockCanvas, errCanvasTab, { getCurrentLanguage: () => 'en', t: (k) => k });
        assert.ok(
            drawTexts.some((d) => d.txt.includes('Forecast Limitation: Test error notice')),
            'Canvas must render explicit Forecast Limitation notice on ERROR'
        );
    } finally {
        globalThis.window = prevWin;
        globalThis.document = prevDoc;
    }

    // Verify showStructuralForecast is NOT synced across symbols in INDICATOR_FLAG_KEYS and app.js never swallows forecast errors silently
    const storeJsSrc = fs.readFileSync(path.resolve('host_subdomain/assets/js/core/store.js'), 'utf8');
    assert.equal(storeJsSrc.includes("'showStructuralForecast'"), false);
    const appJsSrc = fs.readFileSync(path.resolve('host_subdomain/assets/js/app.js'), 'utf8');
    const structCallMatches = [...appJsSrc.matchAll(/requestStructuralForecastForTab\([^\n]*\n(?:[^\n]*\n){0,4}[^\n]*\)\.catch\(([^)]*)\)/g)];
    assert.ok(structCallMatches.length >= 2, 'app.js must attach explicit .catch error handlers to requestStructuralForecastForTab calls');
    for (const m of structCallMatches) {
        assert.notEqual(m[1].trim(), '', 'requestStructuralForecastForTab .catch handler must accept err and surface ERROR state');
    }

    // 5) Static compliance: zero exec(), python, chronos2_forecast, Math.random, Math.sin, Math.cos in new browser forecast modules
    const engineSrc = fs.readFileSync(path.resolve('host_subdomain/assets/js/algorithms/structuralForecastEngine.js'), 'utf8');
    const svcSrc = fs.readFileSync(path.resolve('host_subdomain/assets/js/services/structuralForecastService.js'), 'utf8');
    const workerSrc = fs.readFileSync(path.resolve('host_subdomain/assets/js/workers/structuralForecastWorker.js'), 'utf8');
    for (const [label, src] of [['engine', engineSrc], ['service', svcSrc], ['worker', workerSrc]]) {
        const codeOnly = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
        assert.equal(/\bMath\.(random|sin|cos)\b/.test(codeOnly), false, `${label} must not contain Math.random/sin/cos`);
        assert.equal(/\bexec\s*\(|chronos2_forecast|python3?\b|shell_exec|proc_open/.test(codeOnly), false, `${label} must not depend on PHP exec, Python, or Chronos-2 endpoint`);
    }
    assert.equal(state.chartPreferences.showStructuralForecast, false);
});




test('FORECAST-ADAPTER-01: adapts only complete successful trajectories and preserves source status', async () => {
  const { adaptNativeModelTrajectory } = await import('../host_subdomain/assets/js/forecast/forecastContract.js');
  const trajectory = { modelId: 'naive_persistence', modelName: 'Naive Persistence', modelVersion: '2.0.0', executionRuntime: 'NATIVE_JS', status: 'SUCCESS', points: [{ q10: 98, q25: 99, q50: 100, q75: 101, q90: 102 }, { q10: 97, q25: 99, q50: 100, q75: 102, q90: 103 }] };
  const context = { symbolCode: 'XAUUSD', provider: 'tvdatafeed', timeframe: 'H1', horizonBars: 2, originOpenTimeUtcMs: 1795000000000, lastClosedPrice: 100, forecastStatus: 'INSUFFICIENT_EVIDENCE', inputHash: 'hash-1' };
  const adapted = adaptNativeModelTrajectory(trajectory, context);
  assert.equal(adapted.status, 'READY'); assert.equal(adapted.engine.engine_id, 'native_model_adapter'); assert.equal(adapted.forecast[1].q50_median, 100);
  assert.equal(adapted.provenance.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(adapted.model.source_engine_status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(adapted.model.oos.status, 'BASELINE');
  const passingWalkForward = { evalHorizon: 10, wisNaiveDistributional: 10, conformalCalibration: { calibrationStatus: 'CALIBRATED_NORMALIZED' }, modelBenchmarks: [{ modelId: 'test_candidate', status: 'SUCCESS', windows: 30, nEff: 30, rMae: 0.9, wis: 9, coverage80Pct: 80, dmPValue: 0.04, bootPValue: 0.05 }] };
  const candidate = adaptNativeModelTrajectory({ ...trajectory, modelId: 'test_candidate' }, { ...context, walkForward: passingWalkForward });
  assert.equal(candidate.model.oos.status, 'PASSED');
  const experimental = adaptNativeModelTrajectory({ ...trajectory, modelId: 'test_candidate', isApproximation: true }, { ...context, walkForward: passingWalkForward });
  assert.equal(experimental.model.oos.status, 'EXPERIMENTAL_NOT_ELIGIBLE');
  assert.equal(adaptNativeModelTrajectory({ ...trajectory, points: trajectory.points.slice(0, 1) }, context), null);
  assert.equal(adaptNativeModelTrajectory({ ...trajectory, status: 'FAILED' }, context), null);
  assert.equal(adaptNativeModelTrajectory({ ...trajectory, points: [{ ...trajectory.points[0], q25: 103 }, trajectory.points[1]] }, context), null);
});
test('FORECAST-MODEL-SELECTION-01: new Structural selector exposes registry models and routes native model choices through the adapter', async () => {
  const appSource = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const storeSource = await readFile(new URL('../host_subdomain/assets/js/core/store.js', import.meta.url), 'utf8');
  assert.ok(appSource.includes('const nativeModelChoices = defaultForecastRegistry.list()'));
  assert.ok(appSource.includes('const nativeModelButtons = ['));
  assert.ok(appSource.includes("id: 'ensemble', name: 'Calibrated Ensemble (V2)'"));
  assert.ok(appSource.includes('applyNativeModelForecastToTab(activeTab, activeTab.structuralForecastModel)'), 'Selected registry model ID must reach the adapter unchanged');
  assert.ok(storeSource.includes("String(params.model_id || '') !== String(tab.structuralForecastModel || 'naive_persistence')"));
});

test('CHRONOS2-PROVIDER-GUARD-01: Chronos-2 API rejects every provider except TradingView before resolving candles', async () => {
  const endpoint = await readFile(new URL('../host_subdomain/api/v1/chronos2_forecast.php', import.meta.url), 'utf8');
  const providerAssignment = endpoint.indexOf("$provider = strtolower(trim((string) ($bodyData['provider'] ?? $_GET['provider'] ?? 'tvdatafeed')));");
  const providerGuard = endpoint.indexOf("if ($provider !== 'tvdatafeed')");
  const candleResolution = endpoint.indexOf('Chronos2QueueManager::resolveClosedCandles(');
  assert.ok(providerAssignment >= 0, 'API must resolve the requested provider explicitly');
  assert.ok(providerGuard > providerAssignment, 'Provider allow-list must run after reading request input');
  assert.ok(providerGuard < candleResolution, 'Disallowed providers must be rejected before any candle lookup');
  assert.ok(endpoint.includes("'ERR_PROVIDER_NOT_ALLOWED'"), 'API must return a stable explicit error code');
});


test('FORECAST-LEDGER-01: local snapshot and lifecycle chains remain verifiable and mature exactly once', async () => {
  const { ForecastLedger } = await import('../host_subdomain/assets/js/forecast/forecastLedger.js');
  const ledger = new ForecastLedger('test_forecast_ledger_v1');
  ledger.clear();
  const entry = ledger.appendFromForecast({
    contractVersion: 'forecast-contract/v2', engineVersion: '2.0.0',
    symbolCode: 'SPOTBRENT', timeframe: 'H1', horizonBars: 10,
    anchorOpenTimeUtcMs: 1000000, anchorClose: 100,
    status: 'VALID', regime: 'TREND', inputHash: 'ledger-test-input',
    summary: { terminalQ50: 101, terminalQ10: 90, terminalQ90: 110 },
    walkForward: { wisModel: 2.5 },
    conformalCalibration: { calibrationStatus: 'CALIBRATED_NORMALIZED' },
    generatedAtUtcMs: 1000001,
    scenarios: [],
  });
  assert.ok(entry);
  assert.equal(ledger.verifyChain().valid, true);
  assert.equal(ledger.verifyChain().totalEntries, 1);
  const candles = Array.from({ length: 10 }, (_, i) => ({
    open_time_utc_ms: 1000001 + (i + 1) * 3600000,
    high: 103, low: 98, close: 101,
  }));
  const events = ledger.evaluateMaturedForecasts(candles, 'SPOTBRENT', 'H1');
  assert.deepEqual(events.map(e => e.horizonStep), [5, 10]);
  assert.ok(events.every(e => e.evaluationOutcome === 'SUCCESS'));
  assert.equal(ledger.verifyLifecycleChain().valid, true);
  assert.equal(ledger.evaluateMaturedForecasts(candles, 'SPOTBRENT', 'H1').length, 0, 'Matured checkpoints must not be appended twice');
  ledger.clear();
});


test('FORECAST-DATA-SOURCE-GUARD-01: persisted chart tabs and symbol switching normalize disabled providers to TradingView', async () => {
  const appSource = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const hydrateStart = appSource.indexOf('function ensureInitialTabs(');
  const switchStart = appSource.indexOf('function openOrFocusSymbolTab(');
  const switchEnd = appSource.indexOf('function computePresetBarCount(', switchStart);
  assert.ok(hydrateStart >= 0 && switchStart > hydrateStart && switchEnd > switchStart);
  const hydrate = appSource.slice(hydrateStart, switchStart);
  const switchTab = appSource.slice(switchStart, switchEnd);
  assert.match(hydrate, /isProviderEnabled\(requestedProvider\)/, 'Persisted tab providers must pass the allow-list');
  assert.match(hydrate, /tab\.provider = prov/, 'Normalized provider must be written back to tab state');
  assert.match(switchTab, /const provider = isProviderEnabled\(sym\.activeProvider\)/, 'Symbol switching must normalize the active provider');
  assert.match(switchTab, /existing\.provider = provider/);
  assert.match(switchTab, /provider:\s*provider,\s*timeframe: tf/);
});


test('FORECAST-NEW-EVALUATION-01: New Native workspace reuses Legacy Walk-Forward and Ledger panels; Ledger rejects open and duplicate candles', async () => {
  const appSource = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const viewSource = await readFile(new URL('../host_subdomain/assets/js/views/forecastView.js', import.meta.url), 'utf8');
  const ledgerSource = await readFile(new URL('../host_subdomain/assets/js/forecast/forecastLedger.js', import.meta.url), 'utf8');
  assert.match(appSource, /usesNativeEvaluation\s*=\s*selected === 'structural' && isNativeModelSelected/);
  assert.match(appSource, /renderBacktestPanel\(nativeEvaluation/);
  assert.match(appSource, /renderLedgerPanel\(Number\(activeTab\?\.decimals \|\| 2\), isFa\)/);
  assert.match(viewSource, /export function renderBacktestPanel\(/);
  assert.match(viewSource, /export function renderLedgerPanel\(/);
  assert.match(ledgerSource, /PriceFormatter\.isCandleClosed\(/);
  assert.match(ledgerSource, /const byOpenTime = new Map\(\)/);
  assert.match(ledgerSource, /Array\.from\(byOpenTime\.values\(\)\)\.sort/);
});


test('FORECAST-NEW-MODEL-CONFIG-01: New Native workspace reuses model weights and parameter controls without exposing a Python worker URL', async () => {
  const appSource = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const viewSource = await readFile(new URL('../host_subdomain/assets/js/views/forecastView.js', import.meta.url), 'utf8');
  assert.match(appSource, /renderModelsPanel\(nativeEvaluation, Number\(activeTab\?\.decimals \|\| 2\), isFa\)/);
  assert.match(viewSource, /export function renderModelsPanel\(fc, decimals, isFa\)/);
  assert.match(viewSource, /data-action="toggle-forecast-model"/);
  assert.match(viewSource, /data-action="set-forecast-model-weight"/);
  assert.match(viewSource, /data-action="set-forecast-model-param"/);
  assert.doesNotMatch(viewSource, /ForecastWorkerClient|REMOTE_DL_WORKER_SPEC|ci-forecast-worker-url/);
  assert.match(appSource, /Models & Configuration|مدل‌ها و تنظیمات/);
});


test('FORECAST-NEW-MODEL-CONFIG-02: model weight controls resolve the rendered data-model-id and invalidate stale forecasts', async () => {
  const appSource = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const viewSource = await readFile(new URL('../host_subdomain/assets/js/views/forecastView.js', import.meta.url), 'utf8');
  assert.match(viewSource, /data-action="set-forecast-model-weight" data-model-id=/);
  assert.match(appSource, /getAttribute\('data-model-id'\) \|\| el\.getAttribute\('data-model'\)/);
  assert.match(appSource, /function invalidateForecastAfterModelConfigChange\(tab, changedModelId = ''\)/);
  assert.match(appSource, /invalidateForecastAfterModelConfigChange\(activeTab, modelId\)/);
  assert.match(appSource, /tab\.showStructuralForecast = false;\s*clearTabStructuralForecast\(tab\)/);
});


test('FORECAST-NEW-STUDIO-01: New Native workspace restores Forecast Studio workflows', async () => {
  const app = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const view = await readFile(new URL('../host_subdomain/assets/js/views/forecastView.js', import.meta.url), 'utf8');
  assert.ok(app.includes('renderOverviewPanel(nativeEvaluation, activeTab'));
  assert.ok(app.includes('const structuralPreview = !usesNativeEvaluation'));
  assert.ok(app.includes('q50: Number(point.q50_median)'));
  assert.ok(app.includes('id="forecast-studio-canvas"'));
  assert.ok(app.includes("const nativeTabs = [['overview'"));
  assert.ok(app.includes('const needsNativeEvaluation = usesNativeEvaluation || nativeTab !== \'overview\''));
  assert.ok(app.includes("nativeEvaluationPanels = '<div class=\"ci-fc-card\""));
  assert.ok(app.includes("['models', isFa"));
  assert.ok(app.includes("['backtest', isFa"));
  assert.ok(app.includes("['ledger', isFa"));
  assert.ok(app.includes('data-action="record-forecast-snapshot"'));
  assert.ok(app.includes('data-action="apply-native-forecast-to-chart"'));
  assert.ok(app.includes('data-action="set-forecast-render-mode"'));
  assert.ok(app.includes('data-action="set-forecast-coord-mode"'));
  assert.ok(view.includes('export function renderOverviewPanel'));
  assert.ok(view.includes('buildForecastForTab(activeTab, overrides = {})'));
  assert.ok(view.includes('overrides.horizonBars'));
  assert.ok(view.includes('overrides.selectedModelId'));
  assert.ok(view.includes("const workerUrl = ''"));
  assert.ok(app.includes("workerUrl: ''"));
  assert.ok(view.includes("providerId: activeTab.provider || 'tvdatafeed'"));
  assert.ok(!view.includes("providerId: activeTab.provider || 'twelvedata'"));
});


test('FORECAST-NEW-COMPARE-01: New workspace exposes persistent independent comparison-overlay visibility and defaults to New engine', async () => {
  const app = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const store = await readFile(new URL('../host_subdomain/assets/js/core/store.js', import.meta.url), 'utf8');
  const view = await readFile(new URL('../host_subdomain/assets/js/views/forecastView.js', import.meta.url), 'utf8');
  assert.ok(store.includes("forecastEngineMode: 'structural'"));
  assert.ok(store.includes('forecastCompareModelIds: null'));
  assert.ok(app.includes('comparisonCandidates'));
  assert.ok(app.includes('visibleCompareIds'));
  assert.ok(app.includes('data-action="toggle-forecast-compare-model"'));
  assert.ok(app.includes("action === 'toggle-forecast-compare-model'"));
  assert.ok(app.includes('state.chartPreferences.forecastCompareModelIds = nextIds'));
  assert.ok(view.includes('forecast.visibleComparisonModelIds.includes(t.modelId)'));
  assert.ok(view.includes('data-forecast-compare-model'));
  assert.ok(view.includes('Side-by-side selected model paths'));
  assert.ok(app.includes("querySelectorAll('canvas[data-forecast-compare-model]')"));
});

test('FORECAST-NEW-COMPARE-02: selected Native model carries successful peer trajectories to the main chart renderer', async () => {
  const app = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const renderer = await readFile(new URL('../host_subdomain/assets/js/components/chartRenderer.js', import.meta.url), 'utf8');
  assert.match(app, /adapted\.comparisonTrajectories = built\.result\.modelTrajectories/);
  assert.match(app, /item\.status === 'SUCCESS'.*item\.modelId !== modelId/);
  assert.match(renderer, /const compareTrajectories = hasValidStructuralForecast && isNativeModelAdapter/);
  assert.match(renderer, /state\.chartPreferences\?\.forecastCompareModelIds/);
  assert.match(renderer, /Optional main-chart comparison overlays: q50 paths only/);
  assert.match(renderer, /ctx\.setLineDash\(\[5, 4\]\)/);
  assert.match(renderer, /trajectory\.modelName\.slice\(0, 18\)/);
});

test('FORECAST-NEW-COMPARE-03: main chart renderer module cache is invalidated with comparison overlay release', async () => {
  const app = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  assert.match(app, /chartRenderer\.js\?v=1\.47\.41/);
});

test('FORECAST-PHASE1-PARITY-01: adapter preserves AUTO OOS metadata, render mode, and validated Coordinated MTF points', async () => {
  const { adaptNativeModelTrajectory } = await import('../host_subdomain/assets/js/forecast/forecastContract.js');
  const trajectory = {
    modelId: 'kalman_momentum',
    modelName: 'Kalman Momentum',
    modelVersion: '2.0.0',
    executionRuntime: 'NATIVE_JS',
    status: 'SUCCESS',
    points: [
      { q10: 96, q25: 98, q50: 100, q75: 102, q90: 104 },
      { q10: 95, q25: 98, q50: 101, q75: 103, q90: 106 },
    ],
  };
  const coordinatedPoints = [
    { q10: 97, q25: 99, q50: 100.5, q75: 102.5, q90: 104.5 },
    { q10: 96, q25: 99, q50: 101.5, q75: 103.5, q90: 106.5 },
  ];
  const adapted = adaptNativeModelTrajectory(trajectory, {
    symbolCode: 'SPOTBRENT',
    provider: 'tvdatafeed',
    timeframe: 'H1',
    horizonBars: 2,
    originOpenTimeUtcMs: 1795000000000,
    lastClosedPrice: 100,
    forecastStatus: 'VALID',
    inputHash: 'hash-phase1',
    requestedModelId: 'AUTO',
    renderMode: 'HYBRID',
    coordMode: 'coordinated',
    coordinatedPoints,
    selectionMode: 'AUTO_OOS_BEST',
    regime: 'TRENDING_UP',
    oodStatus: 'IN_DISTRIBUTION',
    edgeGateState: 'EDGE_SUPPORTED',
  });
  assert.ok(adapted);
  assert.equal(adapted.engine.params.requested_model_id, 'AUTO');
  assert.equal(adapted.engine.params.model_id, 'kalman_momentum');
  assert.equal(adapted.engine.params.render_mode, 'HYBRID');
  assert.equal(adapted.engine.params.coord_mode, 'coordinated');
  assert.equal(adapted.forecast[0].q50_median, 100.5);
  assert.equal(adapted.forecast[1].q90, 106.5);
  assert.equal(adapted.model.requested_id, 'AUTO');
  assert.equal(adapted.model.regime, 'TRENDING_UP');
  assert.equal(adapted.provenance.source, 'ForecastEngine.mtfCoordination.coordinatedPoints');
});

test('FORECAST-PHASE1-PARITY-02: New UI exposes AUTO OOS, unified horizon, and wires Fan/Hybrid/Quantile Bars & MTF to main chart renderer', async () => {
  const app = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const renderer = await readFile(new URL('../host_subdomain/assets/js/components/chartRenderer.js', import.meta.url), 'utf8');
  const store = await readFile(new URL('../host_subdomain/assets/js/core/store.js', import.meta.url), 'utf8');
  assert.match(app, /id: 'AUTO', name: isFa \? 'خودکار \(بهترین OOS\)' : 'Auto \(OOS Best\)'/);
  assert.match(app, /const resolvedModelId = requestedModelId === 'AUTO'/);
  assert.match(app, /const horizonOptions = isNativeModelSelected \? \[10, 15, 20, 30, 45, 60\] : \[15, 30, 45, 60, 90, 120\]/);
  assert.match(store, /String\(params\.requested_model_id \|\| ''\) === 'AUTO'/);
  assert.match(renderer, /const drawFanBands = showForecastBand/);
  assert.match(renderer, /const drawQuantileBars = isNativeModelAdapter/);
  assert.match(renderer, /Q90 \$\{PriceFormatter\.formatPrice/);
  assert.match(renderer, /MTF:Coord/);
});

test('FORECAST-PHASE1-STUDIO-PARITY-03: New workspace renders full 12-panel Forecast Studio for all models including empirical_analogs & Structural JS and persists AUTO', async () => {
  const app = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const store = await readFile(new URL('../host_subdomain/assets/js/core/store.js', import.meta.url), 'utf8');
  assert.match(app, /const isNativeModelSelected = currentModel !== 'structural_wave_js'/);
  assert.match(app, /const nativeEvaluation = \(selected === 'structural' \|\| needsNativeEvaluation\)/);
  assert.match(app, /<section class="ci-forecast-studio">/);
  assert.match(app, /class="ci-fc-controls-row"/);
  assert.match(app, /class="ci-fc-subtabs-bar"/);
  assert.match(app, /class="ci-fc-body"/);
  assert.match(app, /id: 'empirical_analogs', name: isFa \? 'آنالوگ‌های تاریخی علّی' : 'Causal Historical Analogs'/);
  assert.match(app, /data-action="toggle-forecast-band"/);
  assert.match(app, /action === 'project-scenario-levels'[\s\S]{0,1400}redrawActiveCanvas\(\)/);
  assert.match(store, /structuralForecastModel:\s*\/\^\(AUTO\|\[a-z0-9_\]\+\)\$\/\.test/);
});

test('FORECAST-PHASE3-LEGACY-CLEANUP-01: Phase 3 removes Legacy Studio UI, chart overlay, and handlers while preserving shared Native Studio panels', async () => {
  const viewMod = await import('../host_subdomain/assets/js/views/forecastView.js');
  assert.equal(viewMod.renderForecastStudioView, undefined);
  assert.equal(viewMod.LEGACY_MIGRATED_UI_DISABLED, undefined);
  assert.equal(typeof viewMod.buildForecastForTab, 'function');
  assert.equal(typeof viewMod.renderOverviewPanel, 'function');
  assert.equal(typeof viewMod.renderModelsPanel, 'function');
  assert.equal(typeof viewMod.renderBacktestPanel, 'function');
  assert.equal(typeof viewMod.renderLedgerPanel, 'function');
  assert.equal(typeof viewMod.runHistoricalForecastReplay, 'function');

  const view = await readFile(new URL('../host_subdomain/assets/js/views/forecastView.js', import.meta.url), 'utf8');
  const header = await readFile(new URL('../host_subdomain/assets/js/views/headerView.js', import.meta.url), 'utf8');
  const renderer = await readFile(new URL('../host_subdomain/assets/js/components/chartRenderer.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const store = await readFile(new URL('../host_subdomain/assets/js/core/store.js', import.meta.url), 'utf8');

  assert.doesNotMatch(view, /export function renderForecastStudioView/);
  assert.doesNotMatch(header, /toggle-legacy-forecast-chart/);
  assert.doesNotMatch(renderer, /legacyForecastPoints|hasValidLegacyForecast|Legacy Forecast Studio/);
  assert.doesNotMatch(app, /renderForecastStudioView|LEGACY_MIGRATED_UI_DISABLED|toggle-legacy-forecast-chart|apply-forecast-to-chart|set-forecast-engine|data-engine="legacy"/);
  assert.match(app, /forecastView\.js\?v=1\.47\.41/);
  assert.match(app, /headerView\.js\?v=1\.47\.41/);
  assert.match(app, /chartRenderer\.js\?v=1\.47\.41/);
  assert.match(store, /forecastEngineMode:\s*'structural',\s*showFutureProjection:\s*false/);
});

test('FORECAST-PKG1-CALENDAR-01: adapter preserves open_time_utc_ms and calendar handles US Equities RTH, D1, and W1 cleanly', async () => {
  const { adaptNativeModelTrajectory } = await import('../host_subdomain/assets/js/forecast/forecastContract.js');
  const { advanceFutureTimestampsWithCalendar, getNewYorkParts } = await import('../host_subdomain/assets/js/forecast/calendarRegistry.js');
  const { advanceForecastTimestampMs } = await import('../host_subdomain/assets/js/algorithms/structuralForecastEngine.js');

  // 1. Adapter preserves openTimeUtcMs on both open_time_utc_ms and timestamp_utc_ms
  const ts1 = Date.UTC(2026, 4, 4, 14, 0, 0);
  const ts2 = Date.UTC(2026, 4, 4, 15, 0, 0);
  const adapted = adaptNativeModelTrajectory(
    {
      modelId: 'empirical_analogs',
      modelName: 'Causal Historical Analogs',
      status: 'SUCCESS',
      points: [
        { openTimeUtcMs: ts1, q10: 98, q25: 99, q50: 100, q75: 101, q90: 102 },
        { openTimeUtcMs: ts2, q10: 97, q25: 99, q50: 100.5, q75: 102, q90: 103 },
      ],
    },
    { symbolCode: 'SPOTBRENT', provider: 'tvdatafeed', timeframe: 'H1', horizonBars: 2, originOpenTimeUtcMs: ts1 - 3600000, lastClosedPrice: 100 }
  );
  assert.ok(adapted);
  assert.equal(adapted.forecast[0].open_time_utc_ms, ts1);
  assert.equal(adapted.forecast[0].timestamp_utc_ms, ts1);
  assert.equal(adapted.forecast[1].open_time_utc_ms, ts2);

  // 2. US Equities M15 respects 09:30-16:00 NY RTH (no overnight/weekend bars) in both calendarRegistry and Structural JS
  const friNearCloseUtc = Date.UTC(2026, 4, 8, 19, 45, 0); // Fri 15:45 EDT
  const eqNext = advanceForecastTimestampMs(friNearCloseUtc, 'M15', 'NVDA', 'tvdatafeed');
  const nyNext = getNewYorkParts(eqNext);
  assert.equal(nyNext.dow, 1, 'After Fri 15:45 EDT, next US Equity M15 bar must open on Monday');
  assert.equal(nyNext.hour * 60 + nyNext.minute, 9 * 60 + 30, 'Monday US Equity open must be 09:30 EDT');

  // 3. D1 on US Equities & SPOTBRENT advances by trading days without spinning past guard
  const friMidnightUtc = Date.UTC(2026, 4, 8, 0, 0, 0); // Fri 00:00 UTC
  const eqDaily = advanceFutureTimestampsWithCalendar(friMidnightUtc, 'D1', 5, 'NVDA', 'tvdatafeed');
  assert.equal(eqDaily.length, 5);
  assert.equal(new Date(eqDaily[0]).getUTCDay(), 1, 'Next D1 bar after Friday must be Monday');
  assert.equal(eqDaily[4] - eqDaily[0], 4 * 86400000, 'Mon..Fri D1 bars must span 4 days');

  const brentDailyWinter = advanceFutureTimestampsWithCalendar(Date.UTC(2026, 0, 9, 0, 0, 0), 'D1', 5, 'SPOTBRENT', 'tvdatafeed');
  assert.equal(new Date(brentDailyWinter[0]).getUTCDay(), 1, 'Winter SPOTBRENT D1 at 00:00 UTC must skip weekend cleanly');
  assert.equal(brentDailyWinter[4] - brentDailyWinter[0], 4 * 86400000);
});

test('FORECAST-PKG1-ANALYZER-02: KeyZones support stats are independent, MTF drift scales by TF ratio, and OOD uses histAtrPct', async () => {
  const { computeOodAndUncertainty, detectKeyZonesAndEventTree, coordinateMultiTimeframe } = await import('../host_subdomain/assets/js/forecast/forecastV130Analyzer.js');
  const { extractForecastFeatures } = await import('../host_subdomain/assets/js/forecast/featureExtractor.js');

  // 1. OOD: normal market with steady wick range (atrPct == histAtrPct, even if > 1.5x close-to-close sigma) stays IN_DISTRIBUTION
  const steadyWickCandles = Array.from({ length: 120 }, (_, i) => {
    const close = 100 + Math.sin(i * 0.25) * 0.2;
    return {
      open_time_utc_ms: Date.UTC(2026, 3, 1, 0, 0, 0) + i * 900000,
      open: close - 0.02,
      high: close + 0.35,
      low: close - 0.35,
      close,
      volume: 100,
    };
  });
  const feats = extractForecastFeatures(steadyWickCandles, 120);
  assert.ok(feats.histAtrPct > 0);
  const ood = computeOodAndUncertainty(feats, 0.0001, 0.00001, 30);
  assert.equal(ood.oodStatus, 'IN_DISTRIBUTION', `Steady-wick series should not false-trigger OOD (got ${ood.oodStatus}, dist=${ood.oodDistance})`);

  // 2. KeyZones: KZ_LOWER_REACTION must use lower-zone counts (not upperPenCount/complement) and honor horizon > 12
  const trendUpCandles = Array.from({ length: 180 }, (_, i) => {
    const base = 100 + i * 0.12 + (i % 7 === 0 ? 0.6 : -0.05);
    return {
      open_time_utc_ms: Date.UTC(2026, 3, 1, 0, 0, 0) + i * 900000,
      open: base - 0.05,
      high: base + 0.35,
      low: base - 0.15,
      close: base,
      volume: 100,
    };
  });
  const upFeats = extractForecastFeatures(trendUpCandles, 180);
  const lastC = upFeats.lastClose;
  const pts30 = Array.from({ length: 30 }, (_, k) => ({
    step: k + 1,
    q10: lastC * (1 - 0.002 * (k + 1)),
    q25: lastC * (1 - 0.001 * (k + 1)),
    q50: lastC * (1 + 0.0008 * (k + 1)),
    q75: lastC * (1 + 0.002 * (k + 1)),
    q90: lastC * (1 + 0.003 * (k + 1)),
  }));
  const { keyZones } = detectKeyZonesAndEventTree(upFeats, pts30, 30);
  assert.equal(keyZones.length, 2);
  assert.equal(keyZones[0].horizonBars, 30, 'KeyZones must evaluate across full 30-bar horizon when history permits');
  assert.equal(keyZones[1].horizonBars, 30);
  assert.ok(keyZones[0].touchProbability > keyZones[1].touchProbability, 'On steady uptrend, resistance touch rate must exceed support touch rate');
  assert.notEqual(
    Number((keyZones[0].touchProbability + keyZones[1].touchProbability).toFixed(3)),
    1.0,
    'Support touchProbability must not be hardcoded as (1 - resistanceTouchProbability)'
  );

  // 3. MTF coordination scales HTF per-bar drift by HTF/LTF ratio (M15 vs H4 = 16x)
  const htfUp = Array.from({ length: 40 }, (_, i) => {
    const c = 100 * Math.exp(0.01 * i);
    return { open_time_utc_ms: Date.UTC(2026, 3, 1) + i * 14400000, open: c * 0.995, high: c * 1.006, low: c * 0.992, close: c, volume: 100 };
  });
  const anchor = htfUp[htfUp.length - 1].close;
  const ltfDownPts = Array.from({ length: 30 }, (_, k) => ({
    step: k + 1,
    q10: anchor * (1 - 0.004 * (k + 1)),
    q25: anchor * (1 - 0.002 * (k + 1)),
    q50: anchor * (1 - 0.0005 * (k + 1)),
    q75: anchor * (1 + 0.001 * (k + 1)),
    q90: anchor * (1 + 0.002 * (k + 1)),
  }));
  const coord = coordinateMultiTimeframe(ltfDownPts, [], anchor, 'M15', 'H4', htfUp);
  assert.ok(Math.abs(coord.coordinatedMedianPct - coord.independentMedianPct) < 2.5, `M15 vs H4 MTF pull must be TF-ratio scaled (got ${coord.coordinatedMedianPct}% vs ${coord.independentMedianPct}%)`);
});

test('FORECAST-PKG1-LEDGER-03: ForecastLedger preserves SHA-256 chain past 120-entry trim, grades intermediate checkpoints by step quantiles, and avoids bare localStorage writes', async () => {
  const { ForecastLedger } = await import('../host_subdomain/assets/js/forecast/forecastLedger.js');
  const ledgerSrc = await readFile(new URL('../host_subdomain/assets/js/forecast/forecastLedger.js', import.meta.url), 'utf8');
  const viewSrc = await readFile(new URL('../host_subdomain/assets/js/views/forecastView.js', import.meta.url), 'utf8');
  assert.equal(/\blocalStorage\.setItem\s*\(/.test(ledgerSrc), false, 'forecastLedger.js must use safeLocalStorageSet');
  assert.equal(/\blocalStorage\.setItem\s*\(/.test(viewSrc), false, 'forecastView.js must use safeLocalStorageSet');

  const ledger = new ForecastLedger('test_pkg1_trim_ledger_v1');
  ledger.clear();
  for (let i = 0; i < 125; i++) {
    ledger.appendFromForecast({
      contractVersion: 'forecast-contract/v2',
      engineVersion: '2.0.0',
      symbolCode: 'SPOTBRENT',
      providerId: 'tvdatafeed',
      selectedChartModelId: 'empirical_analogs',
      timeframe: 'H1',
      horizonBars: 20,
      anchorOpenTimeUtcMs: 1700000000000 + i * 3600000,
      anchorClose: 100,
      status: 'VALID',
      regime: 'RANGING',
      inputHash: `h-${i}`,
      summary: { terminalQ50: 100, terminalQ10: 85, terminalQ90: 115 },
      points: Array.from({ length: 20 }, (_, s) => ({
        step: s + 1,
        q10: 100 - (s + 1) * 0.5,
        q50: 100,
        q90: 100 + (s + 1) * 0.5,
      })),
      generatedAtUtcMs: 1700000000001 + i,
      scenarios: [],
    });
  }
  const loaded = ledger.loadEntries();
  assert.equal(loaded.length, 120);
  assert.equal(loaded[0].seq, 6);
  assert.equal(loaded[loaded.length - 1].modelId, 'empirical_analogs');
  assert.equal(ledger.verifyChain().valid, true, 'Ledger chain must remain valid after trimming beyond 120 entries');
  assert.equal(ledger.verifyLifecycleChain().valid, true, 'Lifecycle chain must remain valid after trimming beyond 240 events');

  // Checkpoint +5 has band [97.5, 102.5], whereas terminal H=20 has [85, 115]; observed close 106 at +5 must FAIL +5 checkpoint
  const lastEntry = loaded[loaded.length - 1];
  const matureCandles = Array.from({ length: 5 }, (_, k) => ({
    open_time_utc_ms: lastEntry.anchorOpenTimeUtcMs + (k + 1) * 3600000,
    open: 105,
    high: 106.5,
    low: 104.5,
    close: 106,
  }));
  const evalEvents = ledger.evaluateMaturedForecasts(matureCandles, 'SPOTBRENT', 'H1');
  const latestCp5 = evalEvents.find((ev) => ev.forecastHash === lastEntry.forecastHash && ev.horizonStep === 5);
  assert.ok(latestCp5);
  assert.equal(latestCp5.evaluationOutcome, 'FAILED', 'Checkpoint +5 must evaluate against +5 step quantiles [97.5, 102.5], not terminal [85, 115]');
  ledger.clear();
});

test('FORECAST-PKG1-MODELS-04: GRU is prefix-invariant across horizons, Prophet sigma uses 1-step residuals, and Studio preview wires Structural JS', async () => {
  const { NativeProphetDecompModel, NativeSequenceRecurrentModel } = await import('../host_subdomain/assets/js/forecast/models/advancedNativeModels.js');
  const { extractForecastFeatures } = await import('../host_subdomain/assets/js/forecast/featureExtractor.js');
  const appSrc = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');

  const candles = Array.from({ length: 140 }, (_, i) => {
    const close = 100 * Math.exp(0.0015 * i + Math.sin(i * 0.18) * 0.025);
    return {
      open_time_utc_ms: Date.UTC(2026, 3, 1, 0, 0, 0) + i * 900000,
      open: close * 0.999,
      high: close * 1.003,
      low: close * 0.997,
      close,
      volume: 500,
    };
  });
  const feats = extractForecastFeatures(candles, 140);

  const gru15 = NativeSequenceRecurrentModel.predict(feats, 15);
  const gru60 = NativeSequenceRecurrentModel.predict(feats, 60);
  assert.equal(gru15.status, 'SUCCESS');
  assert.equal(gru60.status, 'SUCCESS');
  for (let h = 0; h < 15; h++) {
    assert.equal(gru15.directQuantiles.q50[h], gru60.directQuantiles.q50[h], `GRU q50[${h}] must be prefix-invariant across horizons 15 vs 60`);
  }

  const prophet = NativeProphetDecompModel.predict(feats, 30);
  assert.equal(prophet.status, 'SUCCESS');
  assert.ok(prophet.sigmas[0] <= feats.uncondSigma * 2.0, `Prophet step sigma (${prophet.sigmas[0]}) must stay on return-volatility scale, not level-residual scale`);

  assert.match(appSrc, /state\._forecastCanvasPayload = structuralPreview \|\| smcDirectPreview \|\| nativeEvaluation \|\| null/);
  assert.match(appSrc, /action === 'set-forecast-horizon'[\s\S]{0,1200}applyNativeModelForecastToTab\(activeTab, activeTab\.structuralForecastModel\)/);
});

test('FORECAST-PKG2-ANALOGS-01: EmpiricalAnalogEngine enforces NMS de-clustering, volatility scaling, kernel-weighted quantiles, and strict causality', async () => {
  const { EmpiricalAnalogEngine } = await import('../host_subdomain/assets/js/forecast/empiricalAnalogEngine.js');

  // Build 420 bars: calm regime in first 360 bars, then 2.2x higher volatility in last 60 bars
  const candles = [];
  let price = 100;
  const baseMs = Date.UTC(2026, 0, 5, 0, 0, 0);
  for (let i = 0; i < 420; i++) {
    const isHighVol = i >= 360;
    const amp = isHighVol ? 0.011 : 0.0045;
    const wave = Math.sin(i * 0.27) * amp + Math.cos(i * 0.11) * (amp * 0.45);
    const open = price;
    const close = Math.max(10, open * Math.exp(wave));
    const spread = Math.max(Math.abs(close - open), open * amp * 0.85);
    candles.push({
      open_time_utc_ms: baseMs + i * 900000,
      openTimeUtcMs: baseMs + i * 900000,
      open,
      high: Math.max(open, close) + spread * 0.4,
      low: Math.min(open, close) - spread * 0.4,
      close,
      volume: 1000,
    });
    price = close;
  }

  const H = 15;
  const engine = new EmpiricalAnalogEngine(24, H, 'M15');
  const currentAtr = engine.calculateATR(candles, 14);
  const search = engine.findCausalAnalogs(candles, H, currentAtr);
  assert.equal(search.status, 'READY');
  assert.ok(search.analogs.length >= 6);
  assert.ok(search.minSeparationBars >= 3, `Expected NMS minSeparationBars >= 3, got ${search.minSeparationBars}`);
  assert.ok(search.avgVolScale > 1.25, `Expected volatility scale > 1.25 when current regime is higher-vol, got ${search.avgVolScale}`);

  // Verify strict causality AND pairwise NMS spacing
  for (let i = 0; i < search.analogs.length; i++) {
    const a = search.analogs[i];
    assert.ok(a.futureEndIndex < candles.length - search.windowLength - search.embargoGap, 'Analog future must respect strict embargo');
    assert.ok(a.weight > 0 && Number.isFinite(a.weight));
    for (let j = i + 1; j < search.analogs.length; j++) {
      assert.ok(
        Math.abs(a.originIndex - search.analogs[j].originIndex) >= search.minSeparationBars,
        `De-clustered analogs must be separated by at least ${search.minSeparationBars} bars`
      );
    }
  }

  const proj = engine.projectEmpirical(candles, { lastClose: candles[candles.length - 1].close, atr14: currentAtr }, H);
  assert.equal(proj.status, 'SUCCESS');
  assert.equal(proj.points.length, H);
  for (const pt of proj.points) {
    assert.ok(pt.q10 <= pt.q25 && pt.q25 <= pt.q50 && pt.q50 <= pt.q75 && pt.q75 <= pt.q90, 'Kernel-weighted quantiles must be monotonic');
  }
  const centerMedoid = proj.representativePaths.find((p) => p.id === 'ANALOG_CENTER');
  assert.ok(centerMedoid && centerMedoid.closes.length === H && centerMedoid.volScale > 1.0);
});

test('FORECAST-PKG2-STRUCTURAL-02: Structural JS extracts S/R zones, asymmetric empirical bands, analog agreement diagnostics, and stays deterministic without sin/random', async () => {
  const { computeStructuralForecast } = await import('../host_subdomain/assets/js/algorithms/structuralForecastEngine.js');
  const src = await readFile(new URL('../host_subdomain/assets/js/algorithms/structuralForecastEngine.js', import.meta.url), 'utf8');
  const execSrc = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.equal(/Math\.random|Math\.sin|Math\.cos/.test(execSrc), false, 'structuralForecastEngine.js must remain free of Math.random/sin/cos');

  // Construct deterministic skewed swing series with repeated resistance around ~108 and support around ~96
  const baseMs = Date.UTC(2026, 1, 2, 0, 0, 0);
  const candles = [];
  const pattern = [96, 97.5, 99.8, 102.5, 105.6, 108.0, 106.2, 103.4, 100.1, 97.2, 96.1, 98.4, 101.6, 105.0, 108.1, 107.0, 104.1, 100.5, 97.0, 96.2];
  for (let i = 0; i < 220; i++) {
    const close = pattern[i % pattern.length] + (i >= 180 ? (i - 180) * 0.04 : 0);
    const prev = i > 0 ? candles[i - 1].close : close - 0.5;
    const hi = Math.max(prev, close) + 0.65;
    const lo = Math.min(prev, close) - 0.55;
    candles.push({
      open_time_utc_ms: baseMs + i * 3600000,
      open: prev,
      high: hi,
      low: lo,
      close,
      volume: 800,
      is_closed: true,
    });
  }

  const nowMs = candles[candles.length - 1].open_time_utc_ms + 86400000 * 7;
  const res = computeStructuralForecast({
    candles,
    symbolCode: 'SPOTBRENT',
    provider: 'tvdatafeed',
    timeframe: 'H1',
    horizonBars: 24,
    nowMs,
  });

  assert.equal(res.status, 'READY');
  assert.ok(Array.isArray(res.structural_zones) && res.structural_zones.length >= 2, 'Must extract real clustered S/R zones');
  assert.ok(Number.isFinite(res.engine.params.band_asymmetry_up) && Number.isFinite(res.engine.params.band_asymmetry_down));
  assert.ok(
    res.model_diagnostics.empirical_analogs.agreement_score >= 0 &&
      res.model_diagnostics.empirical_analogs.agreement_score <= 1,
    'Must emit normalized analog_agreement_score in [0, 1]'
  );
  for (const pt of res.forecast) {
    assert.ok(pt.q10 <= pt.q25 && pt.q25 <= pt.q50_median && pt.q50_median <= pt.q75 && pt.q75 <= pt.q90);
  }

  const fastRes = computeStructuralForecast({
    candles,
    symbolCode: 'SPOTBRENT',
    provider: 'tvdatafeed',
    timeframe: 'H1',
    horizonBars: 24,
    nowMs,
    skipAnalogs: true,
  });
  assert.equal(fastRes.status, 'READY');
  assert.equal(fastRes.model_diagnostics.empirical_analogs.status, 'SKIPPED_FAST_MODE');
  assert.deepEqual(fastRes.forecast, res.forecast, 'skipAnalogs must not alter the deterministic Structural JS trajectory');
});

test('FORECAST-PKG2-WF-REPLAY-03: Walk-Forward benchmarks empirical_analogs & structural_wave_js, Compare includes structural_wave_js, and Replay scores selected model directly', async () => {
  const { ForecastEngine } = await import('../host_subdomain/assets/js/forecast/forecastEngine.js');
  const { runHistoricalForecastReplay } = await import('../host_subdomain/assets/js/views/forecastView.js');
  const viewSrc = await readFile(new URL('../host_subdomain/assets/js/views/forecastView.js', import.meta.url), 'utf8');
  const appSrc = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');

  assert.match(viewSrc, /'structural_wave_js',\s*'empirical_analogs'/);
  assert.match(appSrc, /runHistoricalForecastReplay\(activeTab,\s*\{\s*selectedModelId:/);

  // Build 320 bars of BTCUSD H1 so disjoint nested Walk-Forward runs with real outer windows
  const baseMs = Date.UTC(2026, 0, 1, 0, 0, 0);
  const candles = [];
  let px = 60000;
  for (let i = 0; i < 320; i++) {
    const ret = Math.sin(i * 0.21) * 0.0065 + Math.cos(i * 0.07) * 0.003 + 0.0002;
    const open = px;
    const close = Math.max(1000, open * Math.exp(ret));
    const span = Math.max(Math.abs(close - open), open * 0.004);
    candles.push({
      open_time_utc_ms: baseMs + i * 3600000,
      openTimeUtcMs: baseMs + i * 3600000,
      open,
      high: Math.max(open, close) + span * 0.45,
      low: Math.min(open, close) - span * 0.45,
      close,
      volume: 1200,
      is_closed: true,
    });
    px = close;
  }

  const proj = ForecastEngine.project(candles, {
    symbolCode: 'BTCUSD',
    providerId: 'tvdatafeed',
    timeframe: 'H1',
    horizonBars: 10,
    skipBootstrap: true,
    bypassWalkForwardCache: true,
  });

  const trajIds = proj.modelTrajectories.map((t) => t.modelId);
  assert.ok(trajIds.includes('empirical_analogs'), 'ForecastEngine must emit empirical_analogs trajectory');
  assert.ok(trajIds.includes('structural_wave_js'), 'ForecastEngine must emit structural_wave_js trajectory');

  const wfBench = proj.walkForward?.modelBenchmarks || [];
  const analogBench = wfBench.find((b) => b.modelId === 'empirical_analogs');
  const structBench = wfBench.find((b) => b.modelId === 'structural_wave_js');
  assert.ok(analogBench && analogBench.evaluatedWindows > 0 && Number.isFinite(analogBench.wis), 'Walk-Forward must benchmark empirical_analogs');
  assert.ok(structBench && structBench.evaluatedWindows > 0 && Number.isFinite(structBench.wis), 'Walk-Forward must benchmark structural_wave_js');

  // Replay directly on structural_wave_js and empirical_analogs without silent fallback to naive_persistence
  const tab = {
    symbolCode: 'BTCUSD',
    provider: 'tvdatafeed',
    timeframe: 'H1',
    candles,
    forecastHorizonBars: 10,
    structuralForecastModel: 'structural_wave_js',
  };
  const replayStruct = await runHistoricalForecastReplay(tab, { maxWindows: 3, horizonBars: 10, selectedModelId: 'structural_wave_js' });
  assert.equal(replayStruct.status, 'COMPLETED');
  assert.equal(replayStruct.selectedModelId, 'structural_wave_js');
  assert.ok(replayStruct.windows.every((w) => w.modelId === 'structural_wave_js'), 'Structural JS Replay must score structural_wave_js, not naive_persistence');

  const replayAnalog = await runHistoricalForecastReplay(tab, { maxWindows: 3, horizonBars: 10, selectedModelId: 'empirical_analogs' });
  assert.equal(replayAnalog.status, 'COMPLETED');
  assert.equal(replayAnalog.selectedModelId, 'empirical_analogs');
  assert.ok(replayAnalog.windows.every((w) => w.modelId === 'empirical_analogs'), 'Empirical Analogs Replay must score empirical_analogs directly');
});

test('FORECAST-PKG3-SMC-01: Structural JS integrates causal SMC liquidity magnets (VP POC/VAH/VAL + unmitigated FVGs) deterministically without fake volume or randomness', async () => {
  const { computeStructuralForecast } = await import('../host_subdomain/assets/js/algorithms/structuralForecastEngine.js');
  const src = await readFile(new URL('../host_subdomain/assets/js/algorithms/structuralForecastEngine.js', import.meta.url), 'utf8');
  const execSrc = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.equal(/Math\.random|Math\.sin|Math\.cos/.test(execSrc), false, 'structuralForecastEngine.js must remain free of Math.random/sin/cos');
  assert.equal(/volume\s*[:=]\s*100\b/.test(execSrc), false, 'structuralForecastEngine.js must never inject synthetic volume = 100');

  // Build deterministic 180-bar series with clear volume concentration around 100 and a recent unmitigated bullish FVG
  const baseMs = Date.UTC(2026, 2, 2, 0, 0, 0);
  const candles = [];
  const pattern = [97, 98.4, 100.0, 101.8, 103.5, 102.0, 100.2, 98.5, 97.2, 99.0, 100.4, 102.6, 104.2, 101.5, 99.6, 97.8];
  for (let i = 0; i < 180; i++) {
    let close = pattern[i % pattern.length];
    let open = i > 0 ? candles[i - 1].close : close - 0.3;
    let high = Math.max(open, close) + 0.55;
    let low = Math.min(open, close) - 0.55;
    // Create a clean unmitigated bullish displacement FVG at bar 174-176
    if (i === 174) {
      open = 100.0;
      close = 100.4;
      high = 100.6;
      low = 99.8;
    } else if (i === 175) {
      open = 100.5;
      close = 103.0;
      high = 103.2;
      low = 100.4;
    } else if (i === 176) {
      open = 103.0;
      close = 103.6;
      high = 103.9;
      low = 102.2; // strictly > candle[174].high (100.6) -> unmitigated Bullish FVG
    } else if (i >= 177) {
      open = 103.5 + (i - 177) * 0.15;
      close = open + 0.12;
      high = close + 0.35;
      low = open - 0.25; // stays above 102.2 so FVG remains unmitigated
    }
    candles.push({
      open_time_utc_ms: baseMs + i * 3600000,
      open,
      high,
      low,
      close,
      volume: Math.abs(close - 100) < 1.2 ? 2500 : 600,
      is_closed: true,
    });
  }

  const nowMs = candles[candles.length - 1].open_time_utc_ms + 86400000 * 7;
  const r1 = computeStructuralForecast({ candles, symbolCode: 'SPOTBRENT', provider: 'tvdatafeed', timeframe: 'H1', horizonBars: 24, nowMs });
  const r2 = computeStructuralForecast({ candles, symbolCode: 'SPOTBRENT', provider: 'tvdatafeed', timeframe: 'H1', horizonBars: 24, nowMs, skipAnalogs: true });

  assert.equal(r1.status, 'READY');
  assert.ok(Array.isArray(r1.smc_liquidity_zones) && r1.smc_liquidity_zones.length >= 2, 'Must emit real SMC liquidity zones');
  assert.ok(r1.smc_liquidity_zones.some((z) => z.source === 'SMC_VP_POC'), 'Must extract Volume Profile POC zone');
  assert.ok(r1.smc_liquidity_zones.some((z) => z.source === 'SMC_FVG'), 'Must extract unmitigated FVG liquidity zone');
  assert.ok(Number.isFinite(r1.engine.params.smc_poc) && r1.engine.params.smc_poc > 0, 'Must expose smc_poc param');
  assert.ok(r1.engine.params.active_fvg_count >= 1, 'Must count active unmitigated FVGs');
  assert.equal(r1.model_diagnostics.smc_liquidity.status, 'READY');
  assert.equal(r1.model_diagnostics.smc_liquidity.has_real_volume, true);
  assert.deepEqual(r1.forecast, r2.forecast, 'SMC integration must remain deterministic and invariant under skipAnalogs');
  assert.deepEqual(r1.smc_liquidity_zones, r2.smc_liquidity_zones);
});

test('FORECAST-PKG3-CACHE-02: buildForecastForTab uses bounded LRU cache and instant BASE_RESELECT on model/renderMode switches without re-running Walk-Forward', async () => {
  const { buildForecastForTab } = await import('../host_subdomain/assets/js/views/forecastView.js');
  const { state } = await import('../host_subdomain/assets/js/core/store.js');

  state._forecastBaseCache = new Map();
  state._forecastViewCache = new Map();

  const makeSeries = (startPx) => {
    const baseMs = Date.UTC(2026, 0, 1, 0, 0, 0);
    const out = [];
    let px = startPx;
    for (let i = 0; i < 240; i++) {
      const ret = Math.sin(i * 0.23) * 0.006 + Math.cos(i * 0.09) * 0.0025;
      const open = px;
      const close = Math.max(10, open * Math.exp(ret));
      const span = Math.max(Math.abs(close - open), open * 0.004);
      out.push({
        open_time_utc_ms: baseMs + i * 3600000,
        openTimeUtcMs: baseMs + i * 3600000,
        open,
        high: Math.max(open, close) + span * 0.4,
        low: Math.min(open, close) - span * 0.4,
        close,
        volume: 1000,
        is_closed: true,
      });
      px = close;
    }
    return out;
  };

  const tabA = { symbolCode: 'BTCUSD', provider: 'tvdatafeed', timeframe: 'H1', candles: makeSeries(62000), forecastHorizonBars: 12 };
  const tabB = { symbolCode: 'ETHUSD', provider: 'tvdatafeed', timeframe: 'H1', candles: makeSeries(3200), forecastHorizonBars: 12 };

  const first = buildForecastForTab(tabA, { selectedModelId: 'AUTO', renderMode: 'FAN_CHART', skipBootstrap: true });
  assert.equal(first.cacheHit, 'MISS');

  // Exact same request -> EXACT hit
  const second = buildForecastForTab(tabA, { selectedModelId: 'AUTO', renderMode: 'FAN_CHART', skipBootstrap: true });
  assert.equal(second.cacheHit, 'EXACT');

  // Switch model to empirical_analogs -> instant BASE_RESELECT (no Walk-Forward recompute)
  const switchedModel = buildForecastForTab(tabA, { selectedModelId: 'empirical_analogs', renderMode: 'FAN_CHART', skipBootstrap: true });
  assert.equal(switchedModel.cacheHit, 'BASE_RESELECT');
  assert.equal(switchedModel.result.selectedChartModelId, 'empirical_analogs');
  assert.strictEqual(switchedModel.result.walkForward, first.result.walkForward, 'BASE_RESELECT must reuse walkForward reference without recomputing');

  // Switch renderMode -> instant BASE_RESELECT
  const switchedMode = buildForecastForTab(tabA, { selectedModelId: 'structural_wave_js', renderMode: 'HYBRID', skipBootstrap: true });
  assert.equal(switchedMode.cacheHit, 'BASE_RESELECT');
  assert.equal(switchedMode.result.selectedChartModelId, 'structural_wave_js');
  assert.equal(switchedMode.result.renderMode, 'HYBRID');

  // Switch to tabB, then back to tabA -> multi-entry LRU retains tabA with EXACT hit!
  const bRes = buildForecastForTab(tabB, { selectedModelId: 'AUTO', renderMode: 'FAN_CHART', skipBootstrap: true });
  assert.equal(bRes.cacheHit, 'MISS');
  const backToA = buildForecastForTab(tabA, { selectedModelId: 'empirical_analogs', renderMode: 'FAN_CHART', skipBootstrap: true });
  assert.equal(backToA.cacheHit, 'EXACT', 'Multi-entry LRU must keep previous symbol cached when switching tabs');
  assert.ok(state._forecastBaseCache.size <= 16);
});

test('FORECAST-PKG3-HOVER-03: renderForecastStudioFanCanvas renders crosshair HUD for Studio & Replay hover and app.js binds bindForecastCanvasHover', async () => {
  const { renderForecastStudioFanCanvas, bindForecastCanvasHover } = await import('../host_subdomain/assets/js/views/forecastView.js');
  const appSrc = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');

  assert.match(appSrc, /bindForecastCanvasHover\(\s*studioCanvas/);
  assert.match(appSrc, /bindForecastCanvasHover\(\s*replayCanvas/);
  assert.match(appSrc, /skipBootstrap:\s*!usesNativeEvaluation && nativeTab === 'overview'/);

  const drawnTexts = [];
  const listeners = {};
  const mockCtx = {
    setTransform() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    arc() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    setLineDash() {},
    roundRect() {},
    measureText: (txt) => ({ width: String(txt).length * 6.5 }),
    fillText: (txt) => { drawnTexts.push(String(txt)); },
  };
  const mockCanvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => mockCtx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 700, height: 300 }),
    addEventListener: (evt, fn) => { listeners[evt] = fn; },
  };

  const baseMs = Date.UTC(2026, 2, 10, 0, 0, 0);
  const candles = Array.from({ length: 24 }, (_, i) => ({
    open_time_utc_ms: baseMs + i * 3600000,
    open: 100 + i * 0.2,
    high: 101 + i * 0.2,
    low: 99 + i * 0.2,
    close: 100.3 + i * 0.2,
  }));
  const points = Array.from({ length: 10 }, (_, idx) => ({
    stepAhead: idx + 1,
    openTimeUtcMs: baseMs + (24 + idx) * 3600000,
    q10: 103 + idx * 0.1,
    q25: 104 + idx * 0.15,
    q50: 105 + idx * 0.2,
    q75: 106 + idx * 0.25,
    q90: 107 + idx * 0.3,
  }));
  const studioForecast = {
    points,
    smcPoc: 103.5,
    selectedChartModelId: 'structural_wave_js',
    renderMode: 'FAN_CHART',
    turningPoints: [{ step: 3, rationale: 'SMC VP POC liquidity magnet' }],
  };

  // Hover on future step +3 (index = 24 + 2 = 26)
  renderForecastStudioFanCanvas(mockCanvas, candles, studioForecast, 2, true, 'independent', 26);
  assert.ok(drawnTexts.some((t) => t.includes('POC 103.50')), 'Canvas must draw SMC POC reference line');
  assert.ok(drawnTexts.some((t) => t.includes('Step +3')), 'Studio hover HUD must render hovered step');
  assert.ok(drawnTexts.some((t) => t.includes('Node: SMC VP POC')), 'Studio hover HUD must surface nearby turning-point rationale');

  // Replay hover on future step +2 (index = 24 + 1 = 25)
  drawnTexts.length = 0;
  const replayForecast = {
    points,
    actualPoints: points.map((p) => ({ close: p.q50 - 0.1 })),
    selectedChartModelId: 'structural_wave_js',
    renderMode: 'FAN_CHART',
  };
  renderForecastStudioFanCanvas(mockCanvas, candles, replayForecast, 2, true, 'independent', 25);
  assert.ok(drawnTexts.some((t) => t.includes('Replay Step +2')), 'Replay hover HUD must show step header');
  assert.ok(drawnTexts.some((t) => t.includes('80% Band: IN')), 'Replay hover HUD must report 80% band inclusion');

  // Bind hover handler idempotently and fire mousemove + mouseleave
  bindForecastCanvasHover(mockCanvas, candles, studioForecast, 2, true, 'independent');
  assert.equal(mockCanvas.__ciHoverBound, true);
  assert.equal(typeof listeners.mousemove, 'function');
  assert.equal(typeof listeners.mouseleave, 'function');
  drawnTexts.length = 0;
  listeners.mousemove({ clientX: 500 });
  assert.ok(drawnTexts.some((t) => t.includes('Step +')), 'mousemove must trigger crosshair HUD redraw');
  listeners.mouseleave();
  assert.equal(mockCanvas.__ciHoverState.hoverSlotIdx, null);
});

test('FORECAST-SMC-ENGINE-01: independent causal SMCPredictionEngine (smc_prediction_js) is deterministic, free of sin/random/fake volume, wired into Studio UI, Walk-Forward, Compare & Replay', async () => {
  const { SMCPredictionEngine, computeSmcPrediction, SMC_PREDICTION_MODEL_ID } = await import('../host_subdomain/assets/js/forecast/smcPredictionEngine.js');
  const { ForecastEngine } = await import('../host_subdomain/assets/js/forecast/forecastEngine.js');
  const { runHistoricalForecastReplay } = await import('../host_subdomain/assets/js/views/forecastView.js');
  const smcSrc = await readFile(new URL('../host_subdomain/assets/js/forecast/smcPredictionEngine.js', import.meta.url), 'utf8');
  const appSrc = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const viewSrc = await readFile(new URL('../host_subdomain/assets/js/views/forecastView.js', import.meta.url), 'utf8');

  // Static compliance: zero Math.random/sin/cos and zero fake volume=100
  const execSrc = smcSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.equal(/Math\.random|Math\.sin|Math\.cos/.test(execSrc), false, 'smcPredictionEngine.js must not use Math.random/sin/cos');
  assert.equal(/volume\s*[:=]\s*100\b/.test(execSrc), false, 'smcPredictionEngine.js must not inject synthetic volume = 100');

  // UI & Compare wiring checks
  assert.match(appSrc, /id:\s*'smc_prediction_js'/);
  assert.match(viewSrc, /smc_prediction_js:\s*'#06B6D4'/);
  assert.match(viewSrc, /'smc_prediction_js'/);

  // Low-data honesty: must return SKIPPED_LOW_DATA when < 40 bars
  const lowDataRes = computeSmcPrediction([{ open: 100, high: 101, low: 99, close: 100.5, volume: 100, open_time_utc_ms: 1700000000000 }], null, 15);
  assert.equal(lowDataRes.status, 'SKIPPED_LOW_DATA');

  // Deterministic 260-bar series with clear volume profile POC, swings (BOS/CHoCH), and an unmitigated bullish FVG
  const baseMs = Date.UTC(2026, 0, 1, 0, 0, 0);
  const candles = [];
  let px = 60000;
  for (let i = 0; i < 260; i++) {
    const ret = Math.sin(i * 0.22) * 0.006 + Math.cos(i * 0.08) * 0.0028 + 0.00025;
    let open = px;
    let close = Math.max(1000, open * Math.exp(ret));
    const span = Math.max(Math.abs(close - open), open * 0.004);
    let high = Math.max(open, close) + span * 0.45;
    let low = Math.min(open, close) - span * 0.45;
    if (i === 255) {
      open = px;
      close = px * 1.003;
      high = close * 1.001;
      low = open * 0.998;
    } else if (i === 256) {
      open = px;
      close = px * 1.022;
      high = close * 1.002;
      low = open * 0.999;
    } else if (i === 257) {
      open = px;
      close = px * 1.004;
      high = close * 1.002;
      low = candles[255].high * 1.008; // Unmitigated Bullish FVG
    } else if (i >= 258) {
      open = px;
      close = px * 1.002;
      high = close * 1.002;
      low = Math.max(candles[257].low, open * 0.999);
    }
    candles.push({
      open_time_utc_ms: baseMs + i * 3600000,
      openTimeUtcMs: baseMs + i * 3600000,
      open,
      high,
      low,
      close,
      volume: 1500,
      is_closed: true,
    });
    px = close;
  }

  const engine = new SMCPredictionEngine({ timeframe: 'H1' });
  const r1 = engine.project(candles, null, 20);
  const r2 = engine.project(candles, null, 20);
  assert.equal(r1.modelId, SMC_PREDICTION_MODEL_ID);
  assert.equal(r1.status, 'SUCCESS');
  assert.equal(r1.points.length, 20);
  assert.ok(r1.turningPoints.length >= 1, 'SMC engine must produce structured liquidity turning points');
  assert.ok(Number.isFinite(r1.meta.pocPrice) && r1.meta.pocPrice > 0, 'SMC engine must compute active Volume Profile POC');
  assert.ok(r1.meta.activeFvgCount >= 1, 'SMC engine must detect unmitigated FVG');
  assert.deepEqual(r1.points, r2.points, 'SMCPredictionEngine must be 100% deterministic');
  for (const pt of r1.points) {
    assert.ok(pt.q10 <= pt.q25 && pt.q25 <= pt.q50 && pt.q50 <= pt.q75 && pt.q75 <= pt.q90, 'SMC quantiles must be monotonic');
  }

  // ForecastEngine + Walk-Forward integration
  const proj = ForecastEngine.project(candles, {
    symbolCode: 'BTCUSD',
    providerId: 'tvdatafeed',
    timeframe: 'H1',
    horizonBars: 10,
    selectedModelId: 'smc_prediction_js',
    skipBootstrap: true,
    bypassWalkForwardCache: true,
  });
  assert.equal(proj.selectedChartModelId, 'smc_prediction_js');
  assert.ok(proj.modelTrajectories.some((t) => t.modelId === 'smc_prediction_js' && t.status === 'SUCCESS'));
  assert.ok(Number.isFinite(proj.smcPoc) && proj.smcPoc > 0);
  assert.ok(Array.isArray(proj.turningPoints) && proj.turningPoints.length >= 1);
  const smcBench = (proj.walkForward?.modelBenchmarks || []).find((b) => b.modelId === 'smc_prediction_js');
  assert.ok(smcBench && smcBench.evaluatedWindows > 0 && Number.isFinite(smcBench.wis), 'Walk-Forward must causally benchmark smc_prediction_js');

  // Historical Replay directly on smc_prediction_js
  const tab = {
    symbolCode: 'BTCUSD',
    provider: 'tvdatafeed',
    timeframe: 'H1',
    candles,
    forecastHorizonBars: 10,
    structuralForecastModel: 'smc_prediction_js',
  };
  const replay = await runHistoricalForecastReplay(tab, { maxWindows: 3, horizonBars: 10, selectedModelId: 'smc_prediction_js' });
  assert.equal(replay.status, 'COMPLETED');
  assert.equal(replay.selectedModelId, 'smc_prediction_js');
  assert.ok(replay.windows.every((w) => w.modelId === 'smc_prediction_js'), 'SMC Replay must score smc_prediction_js directly');
});

test('BUGFIX-V14741-UI-SYNC-TF-SMC: topbar pinning, full MariaDB hydration past 250-bar mirror, smc_prediction_js allowlist/preview, and timeframe-switch forecast auto-recompute', async () => {
  const css = await readFile(new URL('../host_subdomain/assets/css/theme.css', import.meta.url), 'utf8');
  const html = await readFile(new URL('../host_subdomain/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const api = await readFile(new URL('../host_subdomain/assets/js/services/apiService.js', import.meta.url), 'utf8');
  const storeMod = await import('../host_subdomain/assets/js/core/store.js');

  // 1. Topbar right-edge overflow prevention & CSS cache-busting
  assert.match(css, /\.tv-topbar\s*\{[\s\S]*?overflow:\s*hidden;/, 'Topbar container must keep overflow:hidden so right actions stay pinned');
  assert.match(css, /\.tv-topbar-left\s*\{[\s\S]*?flex:\s*1\s+1\s+auto;[\s\S]*?min-width:\s*0;[\s\S]*?overflow-x:\s*auto;/, 'Topbar left must flex/scroll internally');
  assert.match(css, /\.tv-topbar-right\s*\{[\s\S]*?flex-shrink:\s*0;/, 'Topbar right controls must never shrink off-screen');
  assert.match(html, /theme\.css\?v=1\.47\.41/, 'index.html must cache-bust theme.css to v1.47.41');

  // 2. Full MariaDB history hydration past the 250-bar localStorage mirror cap (STORAGE-QUOTA-01 preserved)
  assert.equal(typeof storeMod.markCandleKeyHydratedFromServer, 'function');
  assert.equal(typeof storeMod.isCandleKeyHydratedFromServer, 'function');
  const probeKey = 'XAUUSD_tvdatafeed_M15_PROBE';
  assert.equal(storeMod.isCandleKeyHydratedFromServer(probeKey), false);
  storeMod.markCandleKeyHydratedFromServer(probeKey);
  assert.equal(storeMod.isCandleKeyHydratedFromServer(probeKey), true);
  assert.match(api, /isServerHydrated\s*=\s*[\s\S]*isCandleKeyHydratedFromServer\(cacheKey\)/, 'fetchFromBackend must require server hydration before enabling since_ms delta-only fetch');
  assert.match(api, /if\s*\(!sinceParam\)\s*\{\s*markCandleKeyHydratedFromServer\(cacheKey\);\s*\}/, 'Full server fetch must mark cacheKey as hydrated');
  assert.match(app, /directPreviewCanvasCardHtml/, 'Forecast Studio must render live Structural/SMC preview canvas alongside DATA_NOT_READY notice');

  // 3. SMCPredictionEngine prominence, click allowlist, and direct preview/plot fallback
  assert.match(app, /allowedCustomModels\s*=\s*\[[^\]]*'smc_prediction_js'/, 'set-structural-forecast-model must allow selecting smc_prediction_js');
  assert.match(app, /resolvedModelId === 'smc_prediction_js'[\s\S]{0,250}computeSmcPrediction/, 'applyNativeModelForecastToTab must support direct SMC fallback when <318 bars');

  // 4. Timeframe switch preserves active forecast settings and auto-recomputes on new timeframe
  assert.match(app, /action === 'set-timeframe'[\s\S]{0,600}const wasForecastActive = Boolean\(activeTab\.showStructuralForecast\)/, 'set-timeframe must capture active forecast state before clearing stale points');
  assert.match(app, /action === 'set-timeframe'[\s\S]{0,1600}recomputeActiveTabForecast\(activeTab/, 'set-timeframe must auto-recompute active forecast on new timeframe');
  assert.match(app, /action === 'set-date-range'[\s\S]{0,2000}recomputeActiveTabForecast\(activeTab/, 'set-date-range must auto-recompute active forecast when timeframe changes');
});

test('TA-CORE-AB-01: TechnicalAnalysisCore Phase A normalization, warm-up nulls, and two-pass Bollinger match shared golden fixture', async () => {
  const { TechnicalAnalysisCore } = await import('../host_subdomain/assets/js/algorithms/technicalAnalysisCore.js');
  const fixture = JSON.parse(await readFile(new URL('./fixtures/ta_core_golden_fixture.json', import.meta.url), 'utf8'));
  const tol = fixture.tolerance || 1e-6;

  const assertNear = (actual, expected, label) => {
    if (expected === null || expected === undefined) {
      assert.equal(actual, null, `${label} must be strictly null during warm-up`);
      return;
    }
    assert.equal(typeof actual, 'number', `${label} must be finite number`);
    assert.ok(Math.abs(actual - expected) <= tol, `${label} expected ${expected}, got ${actual}`);
  };

  for (const key of ['normal_trend_osc', 'large_price_btc', 'flat_price_zero_vol']) {
    const c = fixture.cases[key];
    const res = TechnicalAnalysisCore.computeCoreIndicators(c.candles, {
      timeframe: c.timeframe,
      symbolCode: c.symbolCode,
      bollingerPeriod: c.bollingerPeriod,
      bollingerStdDev: c.bollingerStdDev,
    });
    assert.equal(res.schemaVersion, 'ta-core/1.1');
    assert.equal(res.quality.validCount, c.candles.length);
    assert.equal(res.quality.droppedInvalidCount, 0);

    // Warm-up invariants: indices < period - 1 must remain strictly null (never 0)
    for (let i = 0; i < 19; i++) {
      assert.equal(res.indicators.sma20[i], null, `${key} sma20[${i}] warm-up must be null`);
      assert.equal(res.indicators.ema20[i], null, `${key} ema20[${i}] warm-up must be null`);
      assert.equal(res.indicators.bollinger[i], null, `${key} bollinger[${i}] warm-up must be null`);
    }
    for (let i = 0; i < 13; i++) {
      assert.equal(res.indicators.atr14[i], null, `${key} atr14[${i}] warm-up must be null`);
    }
    for (let i = 0; i < 14; i++) {
      assert.equal(res.indicators.rsi14[i], null, `${key} rsi14[${i}] warm-up must be null`);
    }

    const idx = c.expectedLast.lastIndex;
    assertNear(res.indicators.sma20[idx], c.expectedLast.sma20, `${key}.sma20`);
    assertNear(res.indicators.ema20[idx], c.expectedLast.ema20, `${key}.ema20`);
    assertNear(res.indicators.bollinger[idx].middle, c.expectedLast.bollinger.middle, `${key}.bb.middle`);
    assertNear(res.indicators.bollinger[idx].upper, c.expectedLast.bollinger.upper, `${key}.bb.upper`);
    assertNear(res.indicators.bollinger[idx].lower, c.expectedLast.bollinger.lower, `${key}.bb.lower`);
    assertNear(res.indicators.atr14[idx], c.expectedLast.atr14, `${key}.atr14`);
    assertNear(res.indicators.rsi14[idx], c.expectedLast.rsi14, `${key}.rsi14`);
    assertNear(res.indicators.macd[idx].macd, c.expectedLast.macd.macd, `${key}.macd.line`);
    assertNear(res.indicators.macd[idx].signal, c.expectedLast.macd.signal, `${key}.macd.signal`);
    assertNear(res.indicators.macd[idx].histogram, c.expectedLast.macd.histogram, `${key}.macd.hist`);
    assertNear(res.indicators.vwap[idx], c.expectedLast.vwap, `${key}.vwap`);
    assertNear(res.indicators.supertrend[idx].value, c.expectedLast.supertrend.value, `${key}.supertrend.val`);
    assert.equal(res.indicators.supertrend[idx].direction, c.expectedLast.supertrend.direction, `${key}.supertrend.dir`);
  }

  // Short-series warm-up case: all windowed indicators strictly null
  const shortRes = TechnicalAnalysisCore.computeCoreIndicators(fixture.cases.short_warmup.candles, {
    timeframe: 'M15',
    symbolCode: 'SPOTBRENT',
  });
  assert.ok(shortRes.indicators.sma20.every((v) => v === null));
  assert.ok(shortRes.indicators.ema20.every((v) => v === null));
  assert.ok(shortRes.indicators.bollinger.every((v) => v === null));
  assert.ok(shortRes.indicators.atr14.every((v) => v === null));
  assert.ok(shortRes.indicators.rsi14.every((v) => v === null));
  assert.ok(shortRes.indicators.macd.every((v) => v === null));

  // Dirty input Phase A normalization
  const dirtyRes = TechnicalAnalysisCore.normalizeCandles(fixture.cases.dirty_unsorted_dups.candles, {
    timeframe: 'M15',
    symbolCode: 'SPOTBRENT',
    excludeOpenBars: true,
  });
  assert.equal(dirtyRes.quality.wasUnsorted, true);
  assert.equal(dirtyRes.quality.deduplicatedCount, 1);
  assert.equal(dirtyRes.quality.droppedInvalidCount, 1);
  assert.equal(dirtyRes.quality.droppedOpenCount, 1);
  assert.equal(dirtyRes.quality.validCount, 3);
  assert.ok(dirtyRes.candles[0].open_time_utc_ms < dirtyRes.candles[1].open_time_utc_ms);
  assert.ok(dirtyRes.candles[1].open_time_utc_ms < dirtyRes.candles[2].open_time_utc_ms);
});

test('TA-CORE-CF-01: Phase C-F causal Swings/Trend, evidence-backed S/R Zones (>=2 touches), 7 Candlestick Patterns, and Canonical Analysis Contract (ta-core/1.1)', async () => {
  const { TechnicalAnalysisCore, TA_CORE_SCHEMA_VERSION } = await import('../host_subdomain/assets/js/algorithms/technicalAnalysisCore.js');
  const cfFixture = JSON.parse(await readFile(new URL('./fixtures/ta_core_cf_golden_fixture.json', import.meta.url), 'utf8'));
  const spotBrentRaw = JSON.parse(await readFile(new URL('./fixtures/spotbrent_m15_sample.json', import.meta.url), 'utf8'));

  assert.equal(TA_CORE_SCHEMA_VERSION, 'ta-core/1.1');

  // 1. Uptrend + Resistance Break & Retest + Active Support + Strict Causality (Zero Lookahead)
  const upCase = cfFixture.cases.uptrend_sr_break_retest;
  const upCanonical = TechnicalAnalysisCore.buildCanonicalAnalysis(upCase.candles, {
    timeframe: upCase.timeframe,
    symbolCode: upCase.symbolCode,
    swingLen: upCase.swingLen,
  });
  assert.equal(upCanonical.schemaVersion, 'ta-core/1.1');
  assert.equal(upCanonical.structures.trend, 'UPTREND');
  assert.ok(upCanonical.structures.swings.length >= 4, 'Must detect confirmed swing highs and lows');
  for (const sw of upCanonical.structures.swings) {
    assert.equal(sw.confirmIndex, sw.index + upCase.swingLen, 'Every swing must carry causal confirmIndex === index + swingLen');
  }

  // Strict causal prefix-truncation check: truncating future bars cannot alter already-confirmed swings
  const cutoff = 20;
  const prefixSwings = TechnicalAnalysisCore.detectSwingsAndTrend(upCase.candles.slice(0, cutoff), upCase.swingLen).swings;
  const fullBeforeCutoff = upCanonical.structures.swings.filter((s) => s.confirmIndex < cutoff);
  assert.deepEqual(prefixSwings, fullBeforeCutoff, 'Confirmed swings must be 100% invariant to future bars (zero lookahead)');

  // S/R zones: every zone MUST have >= 2 confirmed swing touches; resistance must be RETESTED, support ACTIVE
  assert.ok(upCanonical.structures.zones.length >= 2, 'Must detect both resistance and support clusters');
  for (const z of upCanonical.structures.zones) {
    assert.ok(z.touchCount >= 2, `S/R zone ${z.zoneId} must have >= 2 touches (got ${z.touchCount})`);
    assert.equal(z.touchIndices.length, z.touchCount);
    assert.ok(z.lowPrice < z.highPrice, 'Zone must span a valid price band');
  }
  const retestedRes = upCanonical.structures.zones.find((z) => z.role === 'RESISTANCE' && z.status === 'RETESTED');
  assert.ok(retestedRes, 'Expected a broken-and-retested resistance zone in uptrend_sr_break_retest');
  assert.ok(retestedRes.breakIndex !== null && retestedRes.retestIndex !== null && retestedRes.retestIndex > retestedRes.breakIndex);
  assert.ok(typeof retestedRes.invalidationReason === 'string' && retestedRes.invalidationReason.length > 0);
  const activeSup = upCanonical.structures.zones.find((z) => z.role === 'SUPPORT' && z.status === 'ACTIVE');
  assert.ok(activeSup, 'Expected an active support zone in uptrend_sr_break_retest');

  // 2. Downtrend + Decisive Support Breakdown (BROKEN with invalidationReason)
  const dnCase = cfFixture.cases.downtrend_breakdown;
  const dnCanonical = TechnicalAnalysisCore.buildCanonicalAnalysis(dnCase.candles, {
    timeframe: dnCase.timeframe,
    symbolCode: dnCase.symbolCode,
    swingLen: dnCase.swingLen,
  });
  assert.equal(dnCanonical.structures.trend, 'DOWNTREND');
  const brokenSup = dnCanonical.structures.zones.find((z) => z.role === 'SUPPORT' && z.status === 'BROKEN');
  assert.ok(brokenSup, 'Expected a broken support zone in downtrend_breakdown');
  assert.ok(brokenSup.breakIndex !== null && brokenSup.invalidationReason.includes('below support'));

  // 3. Range + All 7 Deterministic Candlestick Patterns anchored to real candles
  const patCase = cfFixture.cases.patterns_and_range;
  const patCanonical = TechnicalAnalysisCore.buildCanonicalAnalysis(patCase.candles, {
    timeframe: patCase.timeframe,
    symbolCode: patCase.symbolCode,
    swingLen: patCase.swingLen,
  });
  assert.equal(patCanonical.structures.trend, 'RANGE');
  const foundTypes = new Set(patCanonical.patterns.map((p) => p.type));
  for (const expectedType of [
    'DOJI',
    'HAMMER',
    'SHOOTING_STAR',
    'BULLISH_PIN_BAR',
    'BEARISH_PIN_BAR',
    'BULLISH_ENGULFING',
    'BEARISH_ENGULFING',
  ]) {
    assert.ok(foundTypes.has(expectedType), `Missing expected candlestick pattern: ${expectedType}`);
  }
  for (const p of patCanonical.patterns) {
    assert.ok(p.anchorIndex >= 0 && p.anchorIndex < patCase.candles.length);
    assert.equal(p.anchorTimeUtcMs, patCase.candles[p.anchorIndex].open_time_utc_ms);
    assert.ok(p.evidence.rangeAtrRatio >= 0.25);
    assert.ok(p.candleIndices.includes(p.anchorIndex));
  }

  // 4. Real 260-bar SPOTBRENT M15 Canonical Analysis invariants
  const spotCanonical = TechnicalAnalysisCore.buildCanonicalAnalysis(spotBrentRaw.candles, {
    timeframe: 'M15',
    symbolCode: 'SPOTBRENT',
    swingLen: 3,
  });
  assert.equal(spotCanonical.schemaVersion, 'ta-core/1.1');
  assert.equal(spotCanonical.quality.validCount, 260);
  assert.ok(['UPTREND', 'DOWNTREND', 'RANGE'].includes(spotCanonical.structures.trend));
  assert.ok(spotCanonical.structures.swings.length >= 20);
  assert.ok(spotCanonical.structures.zones.length >= 2);
  assert.ok(spotCanonical.structures.zones.every((z) => z.touchCount >= 2));
  assert.ok(spotCanonical.patterns.length >= 5);

  // 5. Web UI & Renderer wiring check (showSrZones & showCandlePatterns)
  const rendererSrc = await readFile(new URL('../host_subdomain/assets/js/components/chartRenderer.js', import.meta.url), 'utf8');
  const headerSrc = await readFile(new URL('../host_subdomain/assets/js/views/headerView.js', import.meta.url), 'utf8');
  const appSrc = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  assert.match(rendererSrc, /TechnicalAnalysisCore\.detectSupportResistanceZones/);
  assert.match(rendererSrc, /TechnicalAnalysisCore\.detectCandlestickPatterns/);
  assert.match(headerSrc, /toggle-sr-zones/);
  assert.match(headerSrc, /toggle-candle-patterns/);
  assert.match(appSrc, /action === 'toggle-sr-zones'/);
  assert.match(appSrc, /action === 'toggle-candle-patterns'/);
});

test('UI-02-OBJECT-TREE-01: Object Tree visibility/lock normalization, hidden hit-test skip, locked drag guard, modal rendering, and app action wiring', async () => {
  const { DrawingGeometry } = await import('../host_subdomain/assets/js/algorithms/drawingGeometry.js');
  const { normalizeDrawingObject, state } = await import('../host_subdomain/assets/js/core/store.js');
  const { renderObjectTreeModal, buildActiveIndicatorLayers } = await import('../host_subdomain/assets/js/views/objectTreeView.js');
  const rendererSrc = await readFile(new URL('../host_subdomain/assets/js/components/chartRenderer.js', import.meta.url), 'utf8');
  const appSrc = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');

  // 1. Backward-compatible defaults in normalizeDrawingObject
  const legacyHLine = normalizeDrawingObject({ id: 'hl_legacy', type: 'hline', price: 82.5 });
  assert.equal(legacyHLine.visible, true, 'Legacy drawing without visible key must default to true');
  assert.equal(legacyHLine.locked, false, 'Legacy drawing without locked key must default to false');

  const hiddenLocked = normalizeDrawingObject({
    id: 'hl_hl',
    type: 'horizontal_line',
    price: 85.0,
    visible: false,
    locked: true,
  });
  assert.equal(hiddenLocked.visible, false);
  assert.equal(hiddenLocked.locked, true);

  // 2. Hit-testing skips hidden drawings and hits visible ones
  const visibleLine = normalizeDrawingObject({ id: 'hl_vis', type: 'horizontal_line', price: 80.0, visible: true, locked: false });
  const hiddenLine = normalizeDrawingObject({ id: 'hl_hid', type: 'horizontal_line', price: 80.0, visible: false, locked: false });
  const timeToX = () => 100;
  const priceToY = (p) => 200 - (p - 70) * 10; // price 80 -> y=100

  const hitOnlyHidden = DrawingGeometry.hitTestDrawing([hiddenLine], 100, 100, timeToX, priceToY, 20);
  assert.equal(hitOnlyHidden, null, 'Hidden drawing must never be hit-tested');

  const hitVisibleUnderHidden = DrawingGeometry.hitTestDrawing([visibleLine, hiddenLine], 100, 100, timeToX, priceToY, 20);
  assert.ok(hitVisibleUnderHidden && hitVisibleUnderHidden.id === 'hl_vis', 'Visible drawing underneath hidden drawing must be hit');

  // 3. Locked drawings cannot be translated
  const lockedLine = normalizeDrawingObject({ id: 'hl_lock', type: 'horizontal_line', price: 90.0, visible: true, locked: true });
  const lockedAttempt = DrawingGeometry.translateDrawing(lockedLine, 3600000, 5.0);
  assert.equal(lockedAttempt.price, 90.0, 'Locked drawing must not move on translateDrawing');
  const unlockedAttempt = DrawingGeometry.translateDrawing(visibleLine, 3600000, 2.5);
  assert.equal(unlockedAttempt.price, 82.5, 'Unlocked drawing must translate normally');

  // 4. Object Tree modal HTML renders both Drawings (with badges/buttons) and Active Indicators (including S/R & Patterns)
  const prevModal = state.activeModal;
  state.activeModal = 'object-tree';
  const mockI18n = { getCurrentLanguage: () => 'en', t: (k) => k };
  const sampleTab = {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    decimals: 3,
    selectedDrawingId: 'hl_lock',
    drawings: [visibleLine, hiddenLine, lockedLine],
    showVolume: true,
    showSma20: true,
    showSrZones: true,
    showCandlePatterns: true,
  };
  const layers = buildActiveIndicatorLayers(sampleTab, false);
  assert.ok(layers.some((l) => l.id === 'sma20'));
  assert.ok(layers.some((l) => l.id === 'srZones'));
  assert.ok(layers.some((l) => l.id === 'candlePatterns'));
  assert.ok(layers.some((l) => l.id === 'volume'));

  const modalHtml = renderObjectTreeModal(sampleTab, mockI18n);
  state.activeModal = prevModal;
  assert.match(modalHtml, /Object Tree/);
  assert.match(modalHtml, /object-tree-toggle-visible/);
  assert.match(modalHtml, /object-tree-toggle-locked/);
  assert.match(modalHtml, /object-tree-delete-drawing/);
  assert.match(modalHtml, /object-tree-toggle-all-visible/);
  assert.match(modalHtml, /object-tree-clear-unlocked/);
  assert.match(modalHtml, /Hidden/);
  assert.match(modalHtml, /Locked/);
  assert.match(modalHtml, /S\/R Zones/);
  assert.match(modalHtml, /Candlestick Patterns/);

  // 5. Renderer skips hidden drawings & app.js wires all Object Tree actions + locked drag guard
  assert.match(rendererSrc, /if\s*\(!d\s*\|\|\s*d\.visible === false\)\s*return;/);
  assert.match(appSrc, /hit\.id === activeTab\.selectedDrawingId && !hit\.locked/);
  assert.match(appSrc, /action === 'object-tree-toggle-visible'/);
  assert.match(appSrc, /action === 'object-tree-toggle-locked'/);
  assert.match(appSrc, /action === 'object-tree-delete-drawing'/);
  assert.match(appSrc, /action === 'object-tree-toggle-all-visible'/);
  assert.match(appSrc, /action === 'object-tree-clear-unlocked'/);
});

test('PHASE6-STRATEGY-SIM-01: Offline Strategy Simulator causal execution, SL-before-TP tie-breaker, cost sensitivity (1x/1.5x/2x), and Strategy Lab UI', async () => {
  const { StrategySimulator, STRATEGY_SIM_SCHEMA_VERSION, STRATEGY_PRESETS } = await import(
    '../host_subdomain/assets/js/algorithms/strategySimulator.js'
  );
  const { renderStrategyLabModal } = await import('../host_subdomain/assets/js/views/strategyLabView.js');
  const { state, saveCandlesToCache } = await import('../host_subdomain/assets/js/core/store.js');
  const spotBrentRaw = JSON.parse(
    await readFile(new URL('./fixtures/spotbrent_m15_sample.json', import.meta.url), 'utf8')
  );
  const spotBrentCandles = Array.isArray(spotBrentRaw) ? spotBrentRaw : spotBrentRaw.candles;

  assert.equal(STRATEGY_SIM_SCHEMA_VERSION, 'strategy-sim/1.0');
  assert.equal(STRATEGY_PRESETS.length, 4);

  // 1. Run all 4 TA-Core presets on real 260-bar SPOTBRENT fixture with default EUR 1,000 / 1% risk
  for (const preset of STRATEGY_PRESETS) {
    const res = StrategySimulator.runSimulation(spotBrentCandles, {
      symbolCode: 'SPOTBRENT',
      timeframe: 'M15',
      chartId: 'SPOTBRENT_tvdatafeed_M15',
      presetId: preset.id,
      initialEquity: 1000.0,
      riskPerTradePct: 1.0,
    });
    assert.equal(res.status, 'READY', `${preset.id} must produce READY status`);
    assert.equal(res.config.initialEquity, 1000.0);
    assert.equal(res.config.intrabarPolicy, 'SL_BEFORE_TP');
    assert.equal(res.equityCurve.length, res.candleCount);
    assert.equal(res.costSensitivity.length, 3, `${preset.id} must compute 1x/1.5x/2x sensitivity`);
    assert.ok(Number.isFinite(res.metrics.finalEquity), `${preset.id} finalEquity must be finite`);
    assert.ok(Number.isFinite(res.metrics.sharpeRatio), `${preset.id} sharpeRatio must be finite`);
    assert.ok(Number.isFinite(res.metrics.sortinoRatio), `${preset.id} sortinoRatio must be finite`);
    assert.ok(res.metrics.maxDrawdownPct >= 0, `${preset.id} drawdown must be >= 0`);
    // Cost sensitivity monotonicity: 2x fees >= 1x fees when trades exist
    if (res.metrics.totalTrades > 0) {
      assert.ok(
        res.costSensitivity[2].totalFeesEur >= res.costSensitivity[0].totalFeesEur,
        `${preset.id} 2.0x friction must produce >= 1.0x total fees`
      );
      for (const t of res.trades) {
        assert.ok(t.exitIndex >= t.entryIndex, 'Trade exit index must be >= entry index');
        assert.ok(t.costsEur >= 0, 'Explicit costs must be non-negative');
      }
    }
  }

  // 2. Conservative SL-before-TP tie-breaker: construct valid OHLC candles with a clear Supertrend flip
  const synth = [];
  const startMs = 1700000000000;
  for (let i = 0; i < 90; i++) {
    const base =
      i < 42
        ? 100.0 - i * 0.25
        : i < 60
          ? 89.5 + (i - 41) * 1.15
          : i < 68
            ? 110.2 - (i - 59) * 0.85
            : 103.4 + (i - 67) * 0.9;
    const open = base;
    const close = base + (i >= 42 && i <= 59 || i >= 68 ? 0.55 : -0.35);
    const high = Math.max(open, close) + 0.45;
    const low = Math.min(open, close) - 0.45;
    synth.push({
      open_time_utc_ms: startMs + i * 900_000,
      open,
      high,
      low,
      close,
      volume: 120,
      is_closed: true,
    });
  }
  const probeRun = StrategySimulator.runSimulation(synth, {
    presetId: 'SUPERTREND_MOMENTUM',
    direction: 'LONG_ONLY',
    spreadBps: 0,
    commissionBps: 0,
    slippageBps: 0,
    swapPerBarBps: 0,
    includeSensitivity: false,
  });
  assert.ok(probeRun.trades.length >= 1, 'Synthetic Supertrend flip must trigger at least 1 LONG trade');
  const firstEntryIdx = probeRun.trades[0].entryIndex;
  // Mutate the entry bar so BOTH stopLoss and takeProfit are breached inside the same bar
  const dualHitCandles = synth.map((c, idx) =>
    idx === firstEntryIdx
      ? { ...c, high: c.open + 50.0, low: Math.max(1.0, c.open - 50.0) }
      : c
  );
  const dualHitRun = StrategySimulator.runSimulation(dualHitCandles, {
    presetId: 'SUPERTREND_MOMENTUM',
    direction: 'LONG_ONLY',
    spreadBps: 0,
    commissionBps: 0,
    slippageBps: 0,
    swapPerBarBps: 0,
    includeSensitivity: false,
  });
  assert.equal(
    dualHitRun.trades[0].exitReason,
    'SL_HIT',
    'When both SL and TP are hit on the same candle, SL_BEFORE_TP policy MUST trigger SL_HIT'
  );

  // 3. Insufficient data guard (< 30 bars)
  const tiny = StrategySimulator.runSimulation(spotBrentCandles.slice(0, 15));
  assert.equal(tiny.status, 'INSUFFICIENT_DATA');
  assert.equal(tiny.metrics.totalTrades, 0);

  // 4. Web Strategy Lab modal HTML renders offline disclaimer, KPIs, Equity Curve SVG, and Sensitivity table
  const prevModal = state.activeModal;
  const prevCache = state.candleCache['SPOTBRENT_tvdatafeed_M15'];
  state.activeModal = 'strategy-lab';
  saveCandlesToCache('SPOTBRENT_tvdatafeed_M15', spotBrentCandles, 5000, 'SPOTBRENT');
  const html = renderStrategyLabModal(
    { symbolCode: 'SPOTBRENT', provider: 'tvdatafeed', timeframe: 'M15' },
    { getCurrentLanguage: () => 'en', t: (k) => k }
  );
  state.activeModal = prevModal;
  if (prevCache === undefined) delete state.candleCache['SPOTBRENT_tvdatafeed_M15'];
  else saveCandlesToCache('SPOTBRENT_tvdatafeed_M15', prevCache, 5000, 'SPOTBRENT');

  assert.match(html, /Offline Research Simulation Only/);
  assert.match(html, /Equity Curve/);
  assert.match(html, /Cost Sensitivity Analysis/);
  assert.match(html, /strategy-sim-select-preset/);
});

test('ADMIN-USERS-RBAC-01: Multi-User Admin PHP RBAC safeguards and Web Admin UI role gating & XSS escaping', async () => {
  const adminPhp = await readFile(new URL('../host_subdomain/api/v1/admin_users.php', import.meta.url), 'utf8');
  const authPhp = await readFile(new URL('../host_subdomain/api/v1/auth.php', import.meta.url), 'utf8');
  const { renderAdminUsersCard } = await import('../host_subdomain/assets/js/views/adminUsersView.js');
  const { state } = await import('../host_subdomain/assets/js/core/store.js');

  // 1. Backend RBAC & safety invariants in admin_users.php & auth.php
  assert.match(adminPhp, /in_array\(\$role,\s*\['owner',\s*'admin'\],\s*true\)/);
  assert.match(adminPhp, /CANNOT_MODIFY_OWNER/);
  assert.match(adminPhp, /CANNOT_MODIFY_SELF/);
  assert.match(adminPhp, /FORBIDDEN_ROLE_ASSIGNMENT/);
  assert.match(adminPhp, /PASSWORD_ARGON2ID/);
  assert.match(adminPhp, /recordAdminAuditLog/);
  assert.doesNotMatch(adminPhp, /'password_hash'\s*=>/, 'admin_users roster must NEVER serialize password_hash');
  assert.match(authPhp, /ACCOUNT_DISABLED/);
  assert.match(authPhp, /'user_role'\s*=>/);

  // 2. Web Admin UI hides completely for viewer role, renders safely for owner/admin with HTML escaping
  const prevRole = state.userRole;
  const prevAdmin = state.adminUsers;
  const mockI18n = { getCurrentLanguage: () => 'en', t: (k) => k };

  state.userRole = 'viewer';
  assert.equal(renderAdminUsersCard(mockI18n), '', 'Viewer role must not see Multi-User Admin card');

  state.userRole = 'owner';
  state.adminUsers = {
    loading: false,
    loaded: true,
    error: '',
    users: [
      { id: 1, username: 'mani', email: 'owner@manico.es', role: 'owner', is_active: true, active_sessions: 1 },
      { id: 2, username: 'alice<script>', email: 'a@b.com', role: 'viewer', is_active: true, active_sessions: 0 },
    ],
  };
  const ownerHtml = renderAdminUsersCard(mockI18n);
  state.userRole = prevRole;
  state.adminUsers = prevAdmin;

  assert.match(ownerHtml, /admin-create-user-form/);
  assert.match(ownerHtml, /admin-toggle-user-active/);
  assert.match(ownerHtml, /alice&lt;script&gt;/, 'Username must be HTML-escaped in Admin UI');
  assert.doesNotMatch(ownerHtml, /alice<script>/, 'Raw script tag must never appear in Admin UI');
});

test('FORECAST-ANALOG-REV23-CONSISTENCY-01: EmpiricalAnalogEngine Rev 2.3 guarantees exact Horizon Prefix-Invariance (0.0000 diff), Hybrid MTF consistency (H1x60 vs H4x15 & M15<->H1), causal feature enrichment, and stride=1 speed', async () => {
  const { EmpiricalAnalogEngine, CANONICAL_ANALOG_HORIZON, ANALOG_ENGINE_VERSION } = await import('../host_subdomain/assets/js/forecast/empiricalAnalogEngine.js');
  const { ForecastEngine } = await import('../host_subdomain/assets/js/forecast/forecastEngine.js');
  const { extractForecastFeatures } = await import('../host_subdomain/assets/js/forecast/featureExtractor.js');

  assert.equal(CANONICAL_ANALOG_HORIZON, 60);
  assert.equal(ANALOG_ENGINE_VERSION, '2.3.0');

  // 1. Deterministic 2400-bar multi-regime H1 series + exact 4-bar aggregated 600-bar H4 series
  const baseMs = Date.UTC(2025, 0, 1, 0, 0, 0);
  const h1 = [];
  let px = 80;
  for (let i = 0; i < 2400; i++) {
    const reg = i < 600 ? 0.00025 : i < 1200 ? -0.0002 : i < 1800 ? 0.00005 : 0.0003;
    const vol = i >= 2100 ? 0.0065 : i >= 1200 && i < 1500 ? 0.005 : 0.0032;
    const ret = reg + Math.sin(i * 0.19) * vol + Math.cos(i * 0.07) * (vol * 0.55);
    const open = px;
    const close = Math.max(20, open * Math.exp(ret));
    const spread = Math.max(Math.abs(close - open), open * vol * 0.65);
    h1.push({
      openTimeUtcMs: baseMs + i * 3600000,
      open_time_utc_ms: baseMs + i * 3600000,
      open,
      high: Math.max(open, close) + spread * 0.45,
      low: Math.min(open, close) - spread * 0.45,
      close,
      volume: 1000 + (i % 7) * 150,
      is_closed: true,
    });
    px = close;
  }
  const h4 = [];
  for (let b = 0; b + 3 < h1.length; b += 4) {
    const grp = h1.slice(b, b + 4);
    h4.push({
      openTimeUtcMs: grp[0].openTimeUtcMs,
      open_time_utc_ms: grp[0].open_time_utc_ms,
      open: grp[0].open,
      high: Math.max(...grp.map((g) => g.high)),
      low: Math.min(...grp.map((g) => g.low)),
      close: grp[3].close,
      volume: grp.reduce((s, g) => s + g.volume, 0),
      is_closed: true,
    });
  }

  const f1 = extractForecastFeatures(h1, 2500);
  const f4 = extractForecastFeatures(h4, 2500);

  const t0 = performance.now();
  const s60 = new EmpiricalAnalogEngine(24, 60, 'H1').findCausalAnalogs(h1, 60, f1.atr14, { higherTimeframe: 'H4', higherCandles: h4 });
  const r15 = new EmpiricalAnalogEngine(24, 15, 'H1').projectEmpirical(h1, f1, 15, [], { higherTimeframe: 'H4', higherCandles: h4 });
  const r30 = new EmpiricalAnalogEngine(24, 30, 'H1').projectEmpirical(h1, f1, 30, [], { higherTimeframe: 'H4', higherCandles: h4 });
  const r60 = new EmpiricalAnalogEngine(24, 60, 'H1').projectEmpirical(h1, f1, 60, [], { higherTimeframe: 'H4', higherCandles: h4 });
  const rH4 = new EmpiricalAnalogEngine(24, 15, 'H4').projectEmpirical(h4, f4, 15, [], { lowerTimeframe: 'H1', lowerCandles: h1 });
  const avgRunMs = (performance.now() - t0) / 5;

  assert.equal(s60.status, 'READY');
  assert.equal(s60.stride, 1, 'Rev 2.3 must eliminate dynamic stride and scan with stride = 1');
  assert.equal(s60.referenceHorizon, 60);
  assert.ok(s60.analogs.every((a) => Number.isFinite(a.trendDist) && Number.isFinite(a.srDist) && Number.isFinite(a.macroDist)));
  assert.ok(s60.analogs.every((a) => a.futureEndRefIndex < h1.length - s60.windowLength - s60.embargoGap), 'Strict causality must hold across full canonical refH');
  assert.ok(avgRunMs < 250, `Expected stride=1 average execution well under budget, got ${avgRunMs.toFixed(1)}ms`);

  // Exact 0.0000 prefix diff across H = 15 / 30 / 60 for all 5 quantiles
  for (let i = 0; i < 15; i++) {
    for (const qk of ['q10', 'q25', 'q50', 'q75', 'q90']) {
      assert.equal(r15.points[i][qk], r60.points[i][qk], `Prefix-invariance violated at step ${i + 1} (${qk}) for H=15 vs H=60`);
    }
  }
  for (let i = 0; i < 30; i++) {
    for (const qk of ['q10', 'q25', 'q50', 'q75', 'q90']) {
      assert.equal(r30.points[i][qk], r60.points[i][qk], `Prefix-invariance violated at step ${i + 1} (${qk}) for H=30 vs H=60`);
    }
  }

  // Exact 0.0000 cross-timeframe alignment across all 15 shared 4h boundaries (H1x60 vs H4x15)
  assert.equal(rH4.status, 'SUCCESS');
  assert.equal(rH4.mtfMeta.clusterId, 'INTRADAY_M15_H1_H4');
  assert.equal(rH4.mtfMeta.anchorTimeframe, 'H1');
  assert.equal(rH4.mtfMeta.mode, 'LOWER_TF_AGGREGATED');
  assert.equal(rH4.mtfMeta.reconciled, true);
  assert.equal(rH4.mtfMeta.blockSizeBars, 4);
  for (let k = 0; k < 15; k++) {
    assert.equal(rH4.points[k].q50, r60.points[4 * k + 3].q50, `H4 bar +${k + 1} must match H1 bar +${4 * k + 4}`);
  }
  // Verify intra-block H1 natural fluctuations (not straight-line interpolation inside 4h blocks)
  let nonLinearBlocks = 0;
  for (let k = 0; k < 15; k++) {
    const startP = k === 0 ? f1.lastClose : r60.points[4 * k - 1].q50;
    const endP = r60.points[4 * k + 3].q50;
    const midActual = r60.points[4 * k + 1].q50;
    const midLinear = (startP + endP) / 2;
    if (Math.abs(midActual - midLinear) > 1e-4) nonLinearBlocks++;
  }
  assert.ok(nonLinearBlocks >= 8, 'Intra-block H1 steps must retain natural intermediate retracements/fluctuations');

  // 2. Full ForecastEngine.project Prefix-Invariance & MTF Consistency
  const fe15 = ForecastEngine.project(h1, { symbolCode: 'SPOTBRENT', timeframe: 'H1', horizonBars: 15, higherTimeframe: 'H4', higherTimeframeCandles: h4, skipWalkForward: true });
  const fe60 = ForecastEngine.project(h1, { symbolCode: 'SPOTBRENT', timeframe: 'H1', horizonBars: 60, higherTimeframe: 'H4', higherTimeframeCandles: h4, skipWalkForward: true });
  const feH4 = ForecastEngine.project(h4, { symbolCode: 'SPOTBRENT', timeframe: 'H4', horizonBars: 15, lowerTimeframe: 'H1', lowerTimeframeCandles: h1, selectedModelId: 'empirical_analogs', skipWalkForward: true });
  const fePts15 = fe15.modelTrajectories.find((t) => t.modelId === 'empirical_analogs').points;
  const fePts60 = fe60.modelTrajectories.find((t) => t.modelId === 'empirical_analogs').points;
  const fePtsH4 = feH4.modelTrajectories.find((t) => t.modelId === 'empirical_analogs').points;
  for (let i = 0; i < 15; i++) {
    for (const qk of ['q10', 'q25', 'q50', 'q75', 'q90']) {
      assert.equal(fePts15[i][qk], fePts60[i][qk], `ForecastEngine empirical_analogs must remain prefix-invariant at step ${i + 1} (${qk})`);
    }
  }
  assert.equal(fePtsH4[14].q50, fePts60[59].q50, 'ForecastEngine H4x15 and H1x60 terminal q50 must match exactly');
  assert.equal(feH4.mtfCoordination.alignmentState, 'ALIGNED');

  // 3. M15 <-> H1 Higher-Anchor Block Reconciliation + real 260-bar SPOTBRENT M15 prefix-invariance
  const m15 = [];
  let mPx = 90;
  for (let i = 0; i < 960; i++) {
    const ret = 0.0001 + Math.sin(i * 0.14) * 0.0022 + Math.cos(i * 0.04) * 0.0012;
    const open = mPx;
    const close = Math.max(20, open * Math.exp(ret));
    const span = Math.max(Math.abs(close - open), open * 0.0018);
    m15.push({
      openTimeUtcMs: baseMs + i * 900000,
      open_time_utc_ms: baseMs + i * 900000,
      open,
      high: Math.max(open, close) + span * 0.4,
      low: Math.min(open, close) - span * 0.4,
      close,
      volume: 400,
      is_closed: true,
    });
    mPx = close;
  }
  const m15H1 = [];
  for (let b = 0; b + 3 < m15.length; b += 4) {
    const grp = m15.slice(b, b + 4);
    m15H1.push({
      openTimeUtcMs: grp[0].openTimeUtcMs,
      open_time_utc_ms: grp[0].open_time_utc_ms,
      open: grp[0].open,
      high: Math.max(...grp.map((g) => g.high)),
      low: Math.min(...grp.map((g) => g.low)),
      close: grp[3].close,
      volume: 1600,
      is_closed: true,
    });
  }
  const fm15 = extractForecastFeatures(m15, 2500);
  const rm15 = new EmpiricalAnalogEngine(24, 40, 'M15').projectEmpirical(m15, fm15, 40, [], { higherTimeframe: 'H1', higherCandles: m15H1 });
  assert.equal(rm15.status, 'SUCCESS');
  assert.equal(rm15.mtfMeta.mode, 'BLOCK_RECONCILED');
  assert.equal(rm15.mtfMeta.reconciled, true);
  assert.equal(rm15.mtfMeta.anchorTimeframe, 'H1');
  for (const pt of rm15.points) {
    assert.ok(pt.q10 <= pt.q25 && pt.q25 <= pt.q50 && pt.q50 <= pt.q75 && pt.q75 <= pt.q90, 'Reconciled M15 quantiles must stay monotonic');
  }

  const realSpotBrent = JSON.parse(await readFile(new URL('./fixtures/spotbrent_m15_sample.json', import.meta.url), 'utf8')).candles;
  const fReal = extractForecastFeatures(realSpotBrent, 2500);
  const real15 = new EmpiricalAnalogEngine(24, 15, 'M15').projectEmpirical(realSpotBrent, fReal, 15);
  const real60 = new EmpiricalAnalogEngine(24, 60, 'M15').projectEmpirical(realSpotBrent, fReal, 60);
  assert.equal(real15.status, 'SUCCESS');
  assert.equal(real60.status, 'SUCCESS');
  for (let i = 0; i < 15; i++) {
    assert.equal(real15.points[i].q50, real60.points[i].q50, `Real SPOTBRENT M15 prefix-invariance violated at step ${i + 1}`);
  }
});

test('FORECAST-STRUCT-SMC-REV23-CONSISTENCY-01: Structural JS & SMC Prediction Engine Rev 2.3 guarantee exact 0.0000 Horizon Prefix-Invariance, Hybrid Two-Cluster MTF (H1x60 vs H4x15 & M15<->H1), ForecastEngine wiring, and skipAnalogs invariance', async () => {
  const {
    computeStructuralForecast,
    STRUCTURAL_FORECAST_VERSION,
    STRUCTURAL_CANONICAL_HORIZON,
  } = await import('../host_subdomain/assets/js/algorithms/structuralForecastEngine.js');
  const {
    computeSmcPrediction,
    SMC_PREDICTION_MODEL_VERSION,
    CANONICAL_SMC_HORIZON,
  } = await import('../host_subdomain/assets/js/forecast/smcPredictionEngine.js');
  const { ForecastEngine } = await import('../host_subdomain/assets/js/forecast/forecastEngine.js');

  assert.equal(STRUCTURAL_FORECAST_VERSION, '2.3.0');
  assert.equal(STRUCTURAL_CANONICAL_HORIZON, 60);
  assert.equal(SMC_PREDICTION_MODEL_VERSION, '2.3.0');
  assert.equal(CANONICAL_SMC_HORIZON, 60);

  // 1. Deterministic 2400-bar multi-regime H1 series + exact 4-bar aggregated 600-bar H4 series
  const baseMs = Date.UTC(2025, 0, 1, 0, 0, 0);
  const h1 = [];
  let px = 80;
  for (let i = 0; i < 2400; i++) {
    const reg = i < 600 ? 0.00025 : i < 1200 ? -0.0002 : i < 1800 ? 0.00005 : 0.0003;
    const vol = i >= 2100 ? 0.0065 : i >= 1200 && i < 1500 ? 0.005 : 0.0032;
    const ret = reg + Math.sin(i * 0.19) * vol + Math.cos(i * 0.07) * (vol * 0.55);
    const open = px;
    const close = Math.max(20, open * Math.exp(ret));
    const spread = Math.max(Math.abs(close - open), open * vol * 0.65);
    h1.push({
      openTimeUtcMs: baseMs + i * 3600000,
      open_time_utc_ms: baseMs + i * 3600000,
      open,
      high: Math.max(open, close) + spread * 0.45,
      low: Math.min(open, close) - spread * 0.45,
      close,
      volume: 1000 + (i % 7) * 150,
      is_closed: true,
    });
    px = close;
  }
  const h4 = [];
  for (let b = 0; b + 3 < h1.length; b += 4) {
    const grp = h1.slice(b, b + 4);
    h4.push({
      openTimeUtcMs: grp[0].openTimeUtcMs,
      open_time_utc_ms: grp[0].open_time_utc_ms,
      open: grp[0].open,
      high: Math.max(...grp.map((g) => g.high)),
      low: Math.min(...grp.map((g) => g.low)),
      close: grp[3].close,
      volume: grp.reduce((s, g) => s + g.volume, 0),
      is_closed: true,
    });
  }
  const fixedNowMs = h1[h1.length - 1].open_time_utc_ms + 8 * 3600000;

  // --- Structural JS Rev 2.3 ---
  const st15 = computeStructuralForecast({ candles: h1, symbolCode: 'SPOTBRENT', timeframe: 'H1', horizonBars: 15, nowMs: fixedNowMs, higherTimeframe: 'H4', higherCandles: h4 });
  const st30 = computeStructuralForecast({ candles: h1, symbolCode: 'SPOTBRENT', timeframe: 'H1', horizonBars: 30, nowMs: fixedNowMs, higherTimeframe: 'H4', higherCandles: h4 });
  const st60 = computeStructuralForecast({ candles: h1, symbolCode: 'SPOTBRENT', timeframe: 'H1', horizonBars: 60, nowMs: fixedNowMs, higherTimeframe: 'H4', higherCandles: h4 });
  const st60NoAnalogs = computeStructuralForecast({ candles: h1, symbolCode: 'SPOTBRENT', timeframe: 'H1', horizonBars: 60, nowMs: fixedNowMs, higherTimeframe: 'H4', higherCandles: h4, skipAnalogs: true });
  const stH4 = computeStructuralForecast({ candles: h4, symbolCode: 'SPOTBRENT', timeframe: 'H4', horizonBars: 15, nowMs: fixedNowMs, lowerTimeframe: 'H1', lowerCandles: h1 });

  assert.equal(st15.status, 'READY');
  assert.equal(st30.status, 'READY');
  assert.equal(st60.status, 'READY');
  assert.equal(stH4.status, 'READY');
  assert.equal(st60.engine.engine_version, '2.3.0');
  assert.equal(st60.engine.params.reference_horizon, 60);
  assert.equal(st60.mtf_meta.mode, 'ANCHOR_MACRO_AWARE');

  const stQuantileKeys = ['q10', 'q25', 'q50_median', 'q75', 'q90'];
  for (let i = 0; i < 15; i++) {
    for (const qk of stQuantileKeys) {
      assert.equal(st15.forecast[i][qk], st60.forecast[i][qk], `Structural JS prefix-invariance violated at step ${i + 1} (${qk}) for H=15 vs H=60`);
    }
  }
  for (let i = 0; i < 30; i++) {
    for (const qk of stQuantileKeys) {
      assert.equal(st30.forecast[i][qk], st60.forecast[i][qk], `Structural JS prefix-invariance violated at step ${i + 1} (${qk}) for H=30 vs H=60`);
    }
  }
  // skipAnalogs invariance preserved
  for (let i = 0; i < 60; i++) {
    assert.equal(st60.forecast[i].q50_median, st60NoAnalogs.forecast[i].q50_median, `Structural JS skipAnalogs invariance violated at step ${i + 1}`);
  }
  // H4x15 vs H1x60 exact boundary alignment (all 15 shared 4h boundaries)
  assert.equal(stH4.mtf_meta.clusterId, 'INTRADAY_M15_H1_H4');
  assert.equal(stH4.mtf_meta.anchorTimeframe, 'H1');
  assert.equal(stH4.mtf_meta.mode, 'LOWER_TF_AGGREGATED');
  assert.equal(stH4.mtf_meta.reconciled, true);
  assert.equal(stH4.mtf_meta.blockSizeBars, 4);
  for (let k = 0; k < 15; k++) {
    for (const qk of stQuantileKeys) {
      assert.equal(stH4.forecast[k][qk], st60.forecast[4 * k + 3][qk], `Structural JS H4 bar +${k + 1} (${qk}) must match H1 bar +${4 * k + 4}`);
    }
  }

  // --- SMC Prediction Engine Rev 2.3 ---
  const smc15 = computeSmcPrediction(h1, null, 15, { timeframe: 'H1', higherTimeframe: 'H4', higherCandles: h4 });
  const smc30 = computeSmcPrediction(h1, null, 30, { timeframe: 'H1', higherTimeframe: 'H4', higherCandles: h4 });
  const smc60 = computeSmcPrediction(h1, null, 60, { timeframe: 'H1', higherTimeframe: 'H4', higherCandles: h4 });
  const smcH4 = computeSmcPrediction(h4, null, 15, { timeframe: 'H4', lowerTimeframe: 'H1', lowerCandles: h1 });

  assert.equal(smc15.status, 'SUCCESS');
  assert.equal(smc30.status, 'SUCCESS');
  assert.equal(smc60.status, 'SUCCESS');
  assert.equal(smcH4.status, 'SUCCESS');
  assert.equal(smc60.modelVersion, '2.3.0');
  assert.equal(smc60.referenceHorizon, 60);
  assert.equal(smc60.mtfMeta.mode, 'ANCHOR_MACRO_AWARE');

  for (let i = 0; i < 15; i++) {
    for (const qk of ['q10', 'q25', 'q50', 'q75', 'q90']) {
      assert.equal(smc15.points[i][qk], smc60.points[i][qk], `SMC prefix-invariance violated at step ${i + 1} (${qk}) for H=15 vs H=60`);
    }
  }
  for (let i = 0; i < 30; i++) {
    for (const qk of ['q10', 'q25', 'q50', 'q75', 'q90']) {
      assert.equal(smc30.points[i][qk], smc60.points[i][qk], `SMC prefix-invariance violated at step ${i + 1} (${qk}) for H=30 vs H=60`);
    }
  }
  assert.equal(smcH4.mtfMeta.clusterId, 'INTRADAY_M15_H1_H4');
  assert.equal(smcH4.mtfMeta.anchorTimeframe, 'H1');
  assert.equal(smcH4.mtfMeta.mode, 'LOWER_TF_AGGREGATED');
  assert.equal(smcH4.mtfMeta.reconciled, true);
  assert.equal(smcH4.mtfMeta.blockSizeBars, 4);
  for (let k = 0; k < 15; k++) {
    for (const qk of ['q10', 'q25', 'q50', 'q75', 'q90']) {
      assert.equal(smcH4.points[k][qk], smc60.points[4 * k + 3][qk], `SMC H4 bar +${k + 1} (${qk}) must match H1 bar +${4 * k + 4}`);
    }
  }

  // --- M15 <-> H1 Higher-Anchor Block Reconciliation + Prefix-Invariance ---
  const m15 = [];
  let mPx = 90;
  for (let i = 0; i < 960; i++) {
    const ret = 0.0001 + Math.sin(i * 0.14) * 0.0022 + Math.cos(i * 0.04) * 0.0012;
    const open = mPx;
    const close = Math.max(20, open * Math.exp(ret));
    const span = Math.max(Math.abs(close - open), open * 0.0018);
    m15.push({
      openTimeUtcMs: baseMs + i * 900000,
      open_time_utc_ms: baseMs + i * 900000,
      open,
      high: Math.max(open, close) + span * 0.4,
      low: Math.min(open, close) - span * 0.4,
      close,
      volume: 400,
      is_closed: true,
    });
    mPx = close;
  }
  const m15H1 = [];
  for (let b = 0; b + 3 < m15.length; b += 4) {
    const grp = m15.slice(b, b + 4);
    m15H1.push({
      openTimeUtcMs: grp[0].openTimeUtcMs,
      open_time_utc_ms: grp[0].open_time_utc_ms,
      open: grp[0].open,
      high: Math.max(...grp.map((g) => g.high)),
      low: Math.min(...grp.map((g) => g.low)),
      close: grp[3].close,
      volume: 1600,
      is_closed: true,
    });
  }
  const m15NowMs = m15[m15.length - 1].open_time_utc_ms + 4 * 3600000;

  const stM15_15 = computeStructuralForecast({ candles: m15, symbolCode: 'SPOTBRENT', timeframe: 'M15', horizonBars: 15, nowMs: m15NowMs, higherTimeframe: 'H1', higherCandles: m15H1 });
  const stM15_40 = computeStructuralForecast({ candles: m15, symbolCode: 'SPOTBRENT', timeframe: 'M15', horizonBars: 40, nowMs: m15NowMs, higherTimeframe: 'H1', higherCandles: m15H1 });
  assert.equal(stM15_40.status, 'READY');
  assert.equal(stM15_40.mtf_meta.mode, 'BLOCK_RECONCILED');
  assert.equal(stM15_40.mtf_meta.reconciled, true);
  assert.equal(stM15_40.mtf_meta.anchorTimeframe, 'H1');
  for (let i = 0; i < 15; i++) {
    assert.equal(stM15_15.forecast[i].q50_median, stM15_40.forecast[i].q50_median, `Reconciled Structural JS M15 prefix-invariance violated at step ${i + 1}`);
  }
  for (const pt of stM15_40.forecast) {
    assert.ok(pt.q10 <= pt.q25 && pt.q25 <= pt.q50_median && pt.q50_median <= pt.q75 && pt.q75 <= pt.q90, 'Reconciled Structural JS M15 quantiles must stay monotonic');
  }

  const smcM15_15 = computeSmcPrediction(m15, null, 15, { timeframe: 'M15', higherTimeframe: 'H1', higherCandles: m15H1 });
  const smcM15_40 = computeSmcPrediction(m15, null, 40, { timeframe: 'M15', higherTimeframe: 'H1', higherCandles: m15H1 });
  assert.equal(smcM15_40.status, 'SUCCESS');
  assert.equal(smcM15_40.mtfMeta.mode, 'BLOCK_RECONCILED');
  assert.equal(smcM15_40.mtfMeta.reconciled, true);
  assert.equal(smcM15_40.mtfMeta.anchorTimeframe, 'H1');
  for (let i = 0; i < 15; i++) {
    assert.equal(smcM15_15.points[i].q50, smcM15_40.points[i].q50, `Reconciled SMC M15 prefix-invariance violated at step ${i + 1}`);
  }
  for (const pt of smcM15_40.points) {
    assert.ok(pt.q10 <= pt.q25 && pt.q25 <= pt.q50 && pt.q50 <= pt.q75 && pt.q75 <= pt.q90, 'Reconciled SMC M15 quantiles must stay monotonic');
  }

  // --- Real 260-bar SPOTBRENT M15 prefix-invariance for both engines ---
  const realSpotBrent = JSON.parse(await readFile(new URL('./fixtures/spotbrent_m15_sample.json', import.meta.url), 'utf8')).candles;
  const realNowMs = Number(realSpotBrent[realSpotBrent.length - 1].open_time_utc_ms) + 8 * 3600000;
  const realSt15 = computeStructuralForecast({ candles: realSpotBrent, symbolCode: 'SPOTBRENT', timeframe: 'M15', horizonBars: 15, nowMs: realNowMs });
  const realSt60 = computeStructuralForecast({ candles: realSpotBrent, symbolCode: 'SPOTBRENT', timeframe: 'M15', horizonBars: 60, nowMs: realNowMs });
  assert.equal(realSt15.status, 'READY');
  assert.equal(realSt60.status, 'READY');
  for (let i = 0; i < 15; i++) {
    assert.equal(realSt15.forecast[i].q50_median, realSt60.forecast[i].q50_median, `Real SPOTBRENT M15 Structural JS prefix-invariance violated at step ${i + 1}`);
  }
  const realSmc15 = computeSmcPrediction(realSpotBrent, null, 15, { timeframe: 'M15' });
  const realSmc60 = computeSmcPrediction(realSpotBrent, null, 60, { timeframe: 'M15' });
  assert.equal(realSmc15.status, 'SUCCESS');
  assert.equal(realSmc60.status, 'SUCCESS');
  for (let i = 0; i < 15; i++) {
    assert.equal(realSmc15.points[i].q50, realSmc60.points[i].q50, `Real SPOTBRENT M15 SMC prefix-invariance violated at step ${i + 1}`);
  }

  // --- Full ForecastEngine.project Prefix-Invariance & MTF Coordination for both models ---
  const fe15 = ForecastEngine.project(h1, { symbolCode: 'SPOTBRENT', timeframe: 'H1', horizonBars: 15, higherTimeframe: 'H4', higherTimeframeCandles: h4, skipWalkForward: true });
  const fe60 = ForecastEngine.project(h1, { symbolCode: 'SPOTBRENT', timeframe: 'H1', horizonBars: 60, higherTimeframe: 'H4', higherTimeframeCandles: h4, skipWalkForward: true });
  const feH4Struct = ForecastEngine.project(h4, { symbolCode: 'SPOTBRENT', timeframe: 'H4', horizonBars: 15, lowerTimeframe: 'H1', lowerTimeframeCandles: h1, selectedModelId: 'structural_wave_js', skipWalkForward: true });
  const feH4Smc = ForecastEngine.project(h4, { symbolCode: 'SPOTBRENT', timeframe: 'H4', horizonBars: 15, lowerTimeframe: 'H1', lowerTimeframeCandles: h1, selectedModelId: 'smc_prediction_js', skipWalkForward: true });

  for (const modelId of ['structural_wave_js', 'smc_prediction_js']) {
    const pts15 = fe15.modelTrajectories.find((t) => t.modelId === modelId).points;
    const pts60 = fe60.modelTrajectories.find((t) => t.modelId === modelId).points;
    for (let i = 0; i < 15; i++) {
      for (const qk of ['q10', 'q25', 'q50', 'q75', 'q90']) {
        assert.equal(pts15[i][qk], pts60[i][qk], `ForecastEngine ${modelId} must remain prefix-invariant at step ${i + 1} (${qk})`);
      }
    }
  }
  const feH4StructPts = feH4Struct.modelTrajectories.find((t) => t.modelId === 'structural_wave_js').points;
  const fe60StructPts = fe60.modelTrajectories.find((t) => t.modelId === 'structural_wave_js').points;
  assert.equal(feH4StructPts[14].q50, fe60StructPts[59].q50, 'ForecastEngine structural_wave_js H4x15 and H1x60 terminal q50 must match exactly');
  assert.equal(feH4Struct.mtfCoordination.alignmentState, 'ALIGNED');

  const feH4SmcPts = feH4Smc.modelTrajectories.find((t) => t.modelId === 'smc_prediction_js').points;
  const fe60SmcPts = fe60.modelTrajectories.find((t) => t.modelId === 'smc_prediction_js').points;
  assert.equal(feH4SmcPts[14].q50, fe60SmcPts[59].q50, 'ForecastEngine smc_prediction_js H4x15 and H1x60 terminal q50 must match exactly');
  assert.equal(feH4Smc.mtfCoordination.alignmentState, 'ALIGNED');

  // --- Service & App UI MTF wiring sanity checks ---
  const serviceSrc = await readFile(new URL('../host_subdomain/assets/js/services/structuralForecastService.js', import.meta.url), 'utf8');
  const appSrc = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  assert.match(serviceSrc, /higherCandles:\s*higherClosed/);
  assert.match(serviceSrc, /lowerCandles:\s*lowerClosed/);
  assert.match(appSrc, /resolveMtfContextForTab/);
  assert.match(appSrc, /smcPoc:\s*smcComputed\.meta\?\.pocPrice\s*\?\?\s*null/);
  assert.match(appSrc, /H_ref=/);
});

test('FORECAST-UX-EVAL-CHECKLIST-01: Multi-model batch recording, 5D evaluation, rolling scorecards, unified ledger UI, collapsible accordions, and visual replay overlay', async () => {
  const { ForecastLedger, defaultForecastLedger } = await import('../host_subdomain/assets/js/forecast/forecastLedger.js');
  const { renderOverviewPanel, renderBacktestPanel, renderLedgerPanel, computeMultiModelZoneConvergence, buildLedgerOverlayPayload } = await import('../host_subdomain/assets/js/views/forecastView.js');
  const { ForecastEngine } = await import('../host_subdomain/assets/js/forecast/forecastEngine.js');
  const { state } = await import('../host_subdomain/assets/js/core/store.js');

  // Construct 220 deterministic M15 bars (anchor at 199, 15 future closed bars after anchor)
  const baseMs = Date.UTC(2026, 5, 1, 0, 0, 0);
  const allBars = [];
  let px = 80.0;
  for (let i = 0; i < 220; i++) {
    const ret = i < 200 ? Math.sin(i * 0.2) * 0.004 + 0.0005 : 0.0022;
    const open = px;
    const close = Number((open * Math.exp(ret)).toFixed(4));
    const high = Number((Math.max(open, close) + 0.25).toFixed(4));
    const low = Number((Math.min(open, close) - 0.25).toFixed(4));
    allBars.push({
      open_time_utc_ms: baseMs + i * 900000,
      openTimeUtcMs: baseMs + i * 900000,
      open,
      high,
      low,
      close,
      volume: 1200,
      is_closed: true,
    });
    px = close;
  }

  const anchorBars = allBars.slice(0, 200);
  const anchorClose = anchorBars[anchorBars.length - 1].close;
  const anchorTimeMs = anchorBars[anchorBars.length - 1].open_time_utc_ms;
  const futureClose = allBars[214].close;

  const fc = ForecastEngine.project(anchorBars, {
    symbolCode: 'SPOTBRENT',
    providerId: 'tvdatafeed',
    timeframe: 'M15',
    horizonBars: 15,
    skipWalkForward: true,
    skipBootstrap: true,
  });
  assert.notEqual(fc.status, 'DATA_NOT_READY');

  // Check multi-model convergence computation
  const conv = computeMultiModelZoneConvergence(fc);
  assert.ok(conv.modelCount >= 2);
  assert.ok(conv.targetSpreadPct !== null);

  // Build synthetic batch entries with deterministic accurate model vs divergent/invalidated model
  const accuratePts = allBars.slice(200, 215).map((b, idx) => ({
    stepAhead: idx + 1,
    openTimeUtcMs: b.open_time_utc_ms,
    q10: b.close - 0.8,
    q25: b.close - 0.4,
    q50: b.close,
    q75: b.close + 0.4,
    q90: b.close + 0.8,
  }));
  const badPts = allBars.slice(200, 215).map((b, idx) => ({
    stepAhead: idx + 1,
    openTimeUtcMs: b.open_time_utc_ms,
    q10: anchorClose - 3.5 - idx * 0.2,
    q25: anchorClose - 3.0 - idx * 0.2,
    q50: anchorClose - 2.5 - idx * 0.2,
    q75: anchorClose - 2.0 - idx * 0.2,
    q90: anchorClose - 1.5 - idx * 0.2,
  }));

  const resTouch = {
    zoneId: 'RES_TEST_1',
    zoneType: 'RESISTANCE_ZONE',
    lowPrice: Math.min(...allBars.slice(200, 215).map((b) => b.high)) + 0.05,
    highPrice: Math.max(...allBars.slice(200, 215).map((b) => b.high)) + 0.4,
    invalidationPrice: futureClose + 2.0,
    strength: 0.82,
  };

  const batchResultPayload = {
    ...fc,
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    horizonBars: 15,
    anchorOpenTimeUtcMs: anchorTimeMs,
    anchorClose,
    selectedChartModelId: 'structural_wave_js',
    points: accuratePts,
    keyZones: [resTouch],
    modelTrajectories: [
      { modelId: 'structural_wave_js', modelName: 'Structural JS', status: 'SUCCESS', points: accuratePts, meta: { smcZones: [resTouch] } },
      { modelId: 'smc_prediction_js', modelName: 'SMC Engine', status: 'SUCCESS', points: badPts, meta: { smcZones: [] } },
      { modelId: 'naive_persistence', modelName: 'Naive Persistence', status: 'SUCCESS', points: accuratePts.map((p) => ({ ...p, q50: anchorClose })), meta: {} },
    ],
  };

  const testLedger = new ForecastLedger('ci_test_ux_checklist_ledger_v1');
  testLedger.clear();
  const batchRes = testLedger.appendBatchFromForecast(batchResultPayload, ['structural_wave_js', 'smc_prediction_js']);
  assert.ok(batchRes.batchId.startsWith('BATCH-SPOTBRENT-M15-'));
  assert.equal(batchRes.entries.length, 2);
  assert.equal(batchRes.entries[0].batchId, batchRes.entries[1].batchId);
  assert.ok(batchRes.entries[0].maturesAtUtcMs > batchRes.entries[0].anchorOpenTimeUtcMs);
  assert.ok(['TRENDING_EDGE', 'TRENDING_NO_EDGE', 'RANGING_EDGE', 'RANGING_NO_EDGE'].includes(batchRes.entries[0].marketConditionTag));

  // Evaluate against realized future candles
  const evalEvents = testLedger.evaluateMaturedForecasts(allBars, 'SPOTBRENT', 'M15');
  assert.ok(evalEvents.length >= 2);
  const fullStructEv = evalEvents.find((ev) => ev.forecastHash === batchRes.entries[0].forecastHash && ev.horizonStep === 15);
  const fullBadEv = evalEvents.find((ev) => ev.forecastHash === batchRes.entries[1].forecastHash && ev.horizonStep === 15);
  assert.ok(fullStructEv && fullStructEv.evaluationDetails, 'Full 15-bar evaluation details must be attached');
  assert.ok(fullBadEv && fullBadEv.evaluationDetails);

  assert.equal(fullStructEv.evaluationDetails.directionHit, true);
  assert.equal(fullStructEv.evaluationDetails.insideCount, 15);
  assert.equal(fullStructEv.evaluationDetails.hitRatePct, 100);
  assert.equal(fullStructEv.evaluationDetails.terminalInsideBand, true);
  assert.equal(fullStructEv.evaluationDetails.beatsBaseline, true);
  assert.ok(fullStructEv.evaluationDetails.overallScore >= 85, `Expected high score, got ${fullStructEv.evaluationDetails.overallScore}`);
  assert.ok(fullStructEv.evaluationDetails.volAdjustedMaeAtr >= 0);

  assert.equal(fullBadEv.evaluationDetails.earlyInvalidated, true, 'Far-off prediction must trigger early invalidation alert');
  assert.ok(fullBadEv.evaluationDetails.earlyInvalidatedAtStep >= 1 && fullBadEv.evaluationDetails.earlyInvalidatedAtStep < 15);
  assert.ok(fullStructEv.evaluationDetails.overallScore > fullBadEv.evaluationDetails.overallScore);

  assert.equal(testLedger.verifyChain().valid, true);
  assert.equal(testLedger.verifyLifecycleChain().valid, true);

  // Rolling Scorecards
  const scorecards = testLedger.buildModelScorecards(20, 'SPOTBRENT');
  assert.equal(scorecards.length, 2);
  assert.equal(scorecards[0].modelId, 'structural_wave_js');
  assert.ok(scorecards[0].meanScore > scorecards[1].meanScore);
  assert.equal(scorecards[0].maturedCount, 1);

  // Visual Replay Overlay helper
  const overlayData = buildLedgerOverlayPayload(batchRes.entries, allBars);
  assert.ok(overlayData && overlayData.histCandles.length === 48);
  assert.equal(overlayData.payload.actualPoints.length, 15);
  assert.equal(overlayData.payload.modelTrajectories.length, 1);

  // Render Overview, Backtest, and Ledger panels using defaultForecastLedger populated cleanly
  defaultForecastLedger.clear();
  defaultForecastLedger.appendBatchFromForecast(batchResultPayload, ['structural_wave_js', 'smc_prediction_js']);
  defaultForecastLedger.evaluateMaturedForecasts(allBars, 'SPOTBRENT', 'M15');

  const prevTabs = state.openTabs;
  const prevActiveId = state.activeTabId;
  state.openTabs = [{ tabId: 'tab_spot', symbolCode: 'SPOTBRENT', timeframe: 'M15', provider: 'tvdatafeed', decimals: 2, candles: allBars }];
  state.activeTabId = 'tab_spot';
  state._selectedForecastBatchId = batchRes.batchId;

  const overviewHtml = renderOverviewPanel(fc, state.openTabs[0], 2, false, 'independent');
  assert.match(overviewHtml, /ci-fc-summary-strip/, 'Overview must render Top Summary Status Card');
  assert.match(overviewHtml, /ci-fc-accordion/, 'Overview must collapse advanced diagnostics into accordion');
  assert.match(overviewHtml, /Pending Snapshots/);
  assert.match(overviewHtml, /Matured Outcomes/);

  const backtestHtml = renderBacktestPanel({
    ...fc,
    walkForward: {
      evaluatedWindows: 4,
      evalHorizon: 15,
      acceptancePassed: false,
      acceptanceReason: 'Sample verification gate',
      ensembleMetrics: {
        modelId: 'ensemble',
        modelName: 'Calibrated Ensemble',
        family: 'ENSEMBLE',
        status: 'SUCCESS',
        evaluatedWindows: 4,
        mae: 0.42,
        maePct: 0.51,
        rMae: 0.94,
        mase: 0.92,
        directionalAccuracyPct: 62.5,
        coverage80Pct: 80.0,
        wis: 0.38,
      },
      modelBenchmarks: [],
    },
  }, 2, false);
  assert.match(backtestHtml, /ci-fc-accordion/, 'Backtest must collapse raw tables into accordion');

  const ledgerHtml = renderLedgerPanel(2, false);
  assert.match(ledgerHtml, /record-selected-forecast-models/, 'Ledger must expose Record Selected Models button');
  assert.match(ledgerHtml, /Rolling Model Scorecards/);
  assert.match(ledgerHtml, /set-forecast-ledger-filter/, 'Ledger must include history filter selects');
  assert.match(ledgerHtml, /Side-by-Side Multi-Model Batch Comparison/);
  assert.match(ledgerHtml, /Best Performer/, 'Batch comparison must crown Best Performer');
  assert.match(ledgerHtml, /id="forecast-ledger-overlay-canvas"/, 'Ledger must render Visual Replay Overlay canvas');
  assert.match(ledgerHtml, /ci-fc-accordion/, 'Ledger must collapse raw SHA-256 audit log into accordion');

  // Clean up
  testLedger.clear();
  defaultForecastLedger.clear();
  state.openTabs = prevTabs;
  state.activeTabId = prevActiveId;
  delete state._selectedForecastBatchId;
});

test('FORECAST-LEDGER-UX-BUGFIX-02: prevents cached batch collisions, duplicate columns, SUPERSEDED actual leak, legacy awaiting bug, and duplicate buttons', async () => {
  const { ForecastLedger, defaultForecastLedger } = await import('../host_subdomain/assets/js/forecast/forecastLedger.js');
  const { renderLedgerPanel, buildLedgerOverlayPayload } = await import('../host_subdomain/assets/js/views/forecastView.js');
  const { state } = await import('../host_subdomain/assets/js/core/store.js');
  const appSource = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');

  const sampleRaw = JSON.parse(await readFile(new URL('./fixtures/spotbrent_m15_sample.json', import.meta.url), 'utf8'));
  const sampleBars = Array.isArray(sampleRaw) ? sampleRaw : sampleRaw.candles || [];
  const anchorBar = sampleBars[199];
  const anchorMs = Number(anchorBar.open_time_utc_ms);
  const anchorClose = Number(anchorBar.close);

  const mkPts = (delta) =>
    Array.from({ length: 15 }, (_, idx) => ({
      step: idx + 1,
      openTimeUtcMs: anchorMs + (idx + 1) * 900000,
      q10: anchorClose + delta - 1.0,
      q25: anchorClose + delta - 0.5,
      q50: anchorClose + delta,
      q75: anchorClose + delta + 0.5,
      q90: anchorClose + delta + 1.0,
    }));

  const cachedForecastResult = {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    providerId: 'tvdatafeed',
    status: 'PROVISIONAL',
    regime: 'RANGING',
    horizonBars: 15,
    anchorOpenTimeUtcMs: anchorMs,
    anchorClose,
    selectedChartModelId: 'rbf_gaussian',
    model: { id: 'rbf_gaussian', name: 'RBF Gaussian Process' },
    summary: { terminalQ50: anchorClose - 1.5, terminalQ10: anchorClose - 2.5, terminalQ90: anchorClose - 0.5 },
    points: mkPts(-1.5),
    generatedAtUtcMs: 1795551822913, // Frozen cached timestamp
    inputHash: 'cached-hash-test',
    modelTrajectories: [
      { modelId: 'rbf_gaussian', modelName: 'RBF Gaussian Process', status: 'SUCCESS', points: mkPts(-1.5) },
      { modelId: 'structural_wave_js', modelName: 'Structural JS', status: 'SUCCESS', points: mkPts(+2.2) },
      { modelId: 'smc_prediction_js', modelName: 'SMC Prediction Engine', status: 'SUCCESS', points: mkPts(+1.4) },
    ],
  };

  // 1. Overridden points in appendFromForecast must use overridden terminal quantiles & model name (not AUTO/RBF summary)
  const testLedger = new ForecastLedger('ci_test_bugfix02_ledger_v1');
  testLedger.clear();
  const structEntry = testLedger.appendFromForecast(cachedForecastResult, {
    modelId: 'structural_wave_js',
    points: mkPts(+2.2),
    recordedAtUtcMs: 1795552000000,
    generatedAtUtcMs: 1795552000000,
  });
  assert.equal(structEntry.modelId, 'structural_wave_js');
  assert.equal(structEntry.modelName, 'Structural JS');
  assert.ok(Math.abs(structEntry.terminalMedian - (anchorClose + 2.2)) < 1e-6, 'Overridden points must drive terminalMedian');

  // 2. Single-model requireMultiple batch must be rejected; consecutive multi-model batches must get distinct batchIds
  const singleRejected = testLedger.appendBatchFromForecast(cachedForecastResult, ['rbf_gaussian'], { requireMultiple: true });
  assert.equal(singleRejected.reason, 'NEED_AT_LEAST_2_MODELS');
  assert.equal(singleRejected.entries.length, 0);

  const batchA = testLedger.appendBatchFromForecast(cachedForecastResult, ['structural_wave_js', 'smc_prediction_js'], {
    requireMultiple: true,
    recordedAtUtcMs: 1795552100000,
  });
  const batchB = testLedger.appendBatchFromForecast(cachedForecastResult, ['structural_wave_js', 'smc_prediction_js'], {
    requireMultiple: true,
    recordedAtUtcMs: 1795552105000,
  });
  assert.equal(batchA.entries.length, 2);
  assert.equal(batchB.entries.length, 2);
  assert.notEqual(batchA.batchId, batchB.batchId, 'Consecutive batches on cached forecast must never collide into one batchId');

  // 3. SUPERSEDED entry must NOT leak anchor price into Actual column; legacy matured entry without evaluationDetails must NOT show Awaiting maturity
  defaultForecastLedger.clear();
  const e1 = defaultForecastLedger.appendFromForecast(cachedForecastResult, {
    modelId: 'structural_wave_js',
    points: mkPts(+1.2),
    recordedAtUtcMs: 1795552200000,
    generatedAtUtcMs: 1795552200000,
  });
  // Record second snapshot of same model -> supersedes e1 with observedClose = anchorClose
  defaultForecastLedger.appendFromForecast(cachedForecastResult, {
    modelId: 'structural_wave_js',
    points: mkPts(+1.5),
    recordedAtUtcMs: 1795552300000,
    generatedAtUtcMs: 1795552300000,
  });
  // Record a legacy matured entry without evaluationDetails
  const eLegacy = defaultForecastLedger.appendFromForecast(cachedForecastResult, {
    modelId: 'AUTO',
    modelName: 'AUTO',
    points: mkPts(+0.8),
    recordedAtUtcMs: 1795551000000,
    generatedAtUtcMs: 1795551000000,
  });
  defaultForecastLedger.appendLifecycleEvent({
    forecastHash: eLegacy.forecastHash,
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    horizonStep: 15,
    lifecycleStatus: 'MATURED',
    evaluationOutcome: 'SUCCESS',
    observedClose: anchorClose + 0.6,
    recordedAtUtcMs: 1795551900000,
    evaluationDetails: null,
  });

  const prevTabs = state.openTabs;
  const prevActiveId = state.activeTabId;
  state.openTabs = [{ tabId: 'tab_spot', symbolCode: 'SPOTBRENT', timeframe: 'M15', provider: 'tvdatafeed', decimals: 3, candles: sampleBars }];
  state.activeTabId = 'tab_spot';

  const ledgerHtml = renderLedgerPanel(3, false);
  // Extract row for e1 (#1, SUPERSEDED) and verify (+0.00%) anchor price is NOT shown in Actual column
  assert.doesNotMatch(ledgerHtml, /\(\+0\.00%\)/, 'SUPERSEDED entries must not display anchor close (+0.00%) as Actual');
  // Legacy matured row must show Legacy eval instead of Awaiting maturity
  assert.match(ledgerHtml, /Legacy/, 'Legacy matured entries without evaluationDetails must display fallback evaluation');
  assert.doesNotMatch(ledgerHtml, /Record Current Snapshot/, 'Duplicate Record Current Snapshot button must be removed from Ledger header');
  assert.match(ledgerHtml, /ci-fc-ledger-table/, 'Unified Ledger table must use compact ci-fc-ledger-table layout');

  // 4. Visual Replay Overlay assigns explicit distinct palette colors & unique snap_ modelIds
  const overlay = buildLedgerOverlayPayload([e1, eLegacy], sampleBars);
  assert.equal(overlay.payload.primaryLineColor, '#F59E0B');
  assert.equal(overlay.payload.modelTrajectories[0].color, '#38BDF8');
  assert.ok(overlay.payload.modelTrajectories[0].modelId.startsWith('snap_'));

  // 5. app.js preserves Structural JS & SMC previews across subtabs and removes duplicate topbar batch button
  assert.doesNotMatch(appSource, /const structuralPreview = !usesNativeEvaluation && nativeTab === 'overview'/);
  assert.match(appSource, /class="ci-fc-controls-drawer"/);
  assert.match(appSource, /class="ci-fc-legacy-disclosure"/);
  assert.match(appSource, /requireMultiple:\s*true/);

  // Clean up
  testLedger.clear();
  defaultForecastLedger.clear();
  state.openTabs = prevTabs;
  state.activeTabId = prevActiveId;
});

test('TOPBAR-DROPDOWNS-STRATEGY-01: top header uses TradingView-style Timeframe & Chart Style dropdowns and moves Strategy Lab from left rail next to Forecast', async () => {
  const { renderTopHeaderBar } = await import('../host_subdomain/assets/js/views/headerView.js');
  const { renderLeftToolRail, renderMobileBottomSheet } = await import('../host_subdomain/assets/js/views/toolRailView.js');
  const { state } = await import('../host_subdomain/assets/js/core/store.js');
  const appSource = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const cssSource = await readFile(new URL('../host_subdomain/assets/css/theme.css', import.meta.url), 'utf8');

  const mockI18n = {
    t: (k) => k,
    getCurrentLanguage: () => 'fa',
  };
  const prevWorkspace = state.activeWorkspaceView;
  const prevDropdown = state.activeTopDropdown;
  const prevModal = state.activeModal;

  const sampleTab = {
    tabId: 'tab_SPOTBRENT_H4',
    symbolCode: 'SPOTBRENT',
    provider: 'tvdatafeed',
    timeframe: 'H4',
    chartType: 'candles',
    decimals: 2,
    drawings: [],
    candles: [],
  };

  try {
    state.activeWorkspaceView = 'chart';
    state.activeTopDropdown = 'timeframe';
    state.activeModal = null;

    const chartHeader = renderTopHeaderBar(sampleTab, mockI18n);
    assert.match(chartHeader, /data-action="toggle-top-dropdown"[\s\S]{0,160}data-dropdown="timeframe"/);
    assert.match(chartHeader, /data-top-dropdown-menu="timeframe"[\s\S]*?data-action="set-timeframe"[\s\S]*?data-tf="H4"/);
    assert.match(chartHeader, /tv-topbar-dropdown-menu is-open"[\s\S]{0,80}data-top-dropdown-menu="timeframe"/);

    state.activeTopDropdown = 'chart-type';
    sampleTab.chartType = 'line';
    const lineHeader = renderTopHeaderBar(sampleTab, mockI18n);
    assert.match(lineHeader, /data-action="toggle-top-dropdown"[\s\S]{0,160}data-dropdown="chart-type"/);
    assert.match(lineHeader, /tv-topbar-dropdown-menu is-open"[\s\S]{0,80}data-top-dropdown-menu="chart-type"/);
    assert.match(lineHeader, /data-action="set-chart-type"[\s\S]{0,80}data-type="candles"/);
    assert.match(lineHeader, /data-action="set-chart-type"[\s\S]{0,80}data-type="line"/);

    const forecastIdx = lineHeader.indexOf('data-view="forecast"');
    const strategyIdx = lineHeader.indexOf('data-modal="strategy-lab"');
    const perfIdx = lineHeader.indexOf('data-action="open-active-symbol-overview"');
    assert.ok(forecastIdx > 0 && strategyIdx > forecastIdx && perfIdx > strategyIdx, 'Strategy button must appear directly after Forecast and before Performance in topbar nav');

    // Workspace navigation (Chart/Forecast/Strategy/Performance/Watchlist/Settings) must be docked inside .tv-topbar-right adjacent to utility buttons
    const rightPanelIdx = lineHeader.indexOf('class="tv-topbar-right"');
    const navGroupIdx = lineHeader.indexOf('class="tv-toolbar-group tv-top-nav-group"');
    const csvActionIdx = lineHeader.indexOf('data-action="export-candles-csv"');
    const snapActionIdx = lineHeader.indexOf('data-action="take-chart-snapshot"');
    const fsActionIdx = lineHeader.indexOf('data-action="toggle-fullscreen"');
    assert.ok(
      rightPanelIdx > 0 && navGroupIdx > rightPanelIdx && csvActionIdx > navGroupIdx && snapActionIdx > csvActionIdx && fsActionIdx > snapActionIdx,
      'Chart view topbar must dock tv-top-nav-group inside .tv-topbar-right directly beside CSV/snapshot/fullscreen actions'
    );

    state.activeWorkspaceView = 'forecast';
    state.activeTopDropdown = null;
    const forecastHeader = renderTopHeaderBar(sampleTab, mockI18n);
    assert.ok(forecastHeader.includes('data-dropdown="timeframe"'), 'Forecast view topbar must also use Timeframe dropdown');
    assert.ok(forecastHeader.includes('data-modal="strategy-lab"'), 'Forecast view topbar must include Strategy nav button');
    const fcRightIdx = forecastHeader.indexOf('class="tv-topbar-right"');
    const fcNavIdx = forecastHeader.indexOf('class="tv-toolbar-group tv-top-nav-group"');
    const fcCsvIdx = forecastHeader.indexOf('data-action="export-candles-csv"');
    assert.ok(
      fcRightIdx > 0 && fcNavIdx > fcRightIdx && fcCsvIdx > fcNavIdx,
      'Forecast view topbar must also dock tv-top-nav-group inside .tv-topbar-right'
    );

    const leftRailHtml = renderLeftToolRail(sampleTab, mockI18n, null);
    assert.equal(leftRailHtml.includes('data-modal="strategy-lab"'), false, 'Strategy button must be removed from desktop left drawing tool rail');
    const mobileToolsHtml = renderMobileBottomSheet(sampleTab, 'tools', mockI18n);
    assert.ok(mobileToolsHtml.includes('data-modal="strategy-lab"'), 'Mobile tools sheet keeps Strategy Lab shortcut');

    assert.match(appSource, /action === 'toggle-top-dropdown'/);
    assert.match(appSource, /function positionActiveTopDropdown\(\)/);
    assert.match(appSource, /renderStrategyLabModal\(activeTab, i18n\)/);
    assert.doesNotMatch(appSource, /isForecastWorkspace \? '' : renderStrategyLabModal/);
    assert.match(cssSource, /\.tv-topbar-dropdown-menu\s*\{[\s\S]*?position:\s*fixed;/);
    assert.match(cssSource, /\.tv-open-tabs-strip\s*\{[\s\S]*?flex:\s*0\s+1\s+auto;[\s\S]*?max-width:\s*min\(680px,\s*100%\);/);
  } finally {
    state.activeWorkspaceView = prevWorkspace;
    state.activeTopDropdown = prevDropdown;
    state.activeModal = prevModal;
  }
});

test('SIGNAL-GEN-RR-GATE-01: Classical Signal Generators, immutable Net R:R >= 2.0 Hard Gate, anti-TP-fabrication, causality, Strategy Lab UI, and Canvas overlay', async () => {
  const {
    MINIMUM_REQUIRED_RR,
    enforceMinimumRequiredRR,
    evaluateRiskRewardTradePlan,
  } = await import('../host_subdomain/assets/js/strategy/riskRewardEngine.js');
  const {
    CLASSICAL_STRATEGY_REGISTRY,
    evaluateBreakoutAtBar,
  } = await import('../host_subdomain/assets/js/strategy/classicalGenerators.js');
  const {
    prepareTaCoreContext,
    generateStrategySignals,
  } = await import('../host_subdomain/assets/js/strategy/signalEngine.js');
  const {
    SignalBacktester,
    SIGNAL_BACKTEST_VERSION,
  } = await import('../host_subdomain/assets/js/strategy/signalBacktester.js');
  const { renderStrategyLabModal } = await import('../host_subdomain/assets/js/views/strategyLabView.js');
  const { state, saveCandlesToCache } = await import('../host_subdomain/assets/js/core/store.js');

  const chartRendererSrc = await readFile(new URL('../host_subdomain/assets/js/components/chartRenderer.js', import.meta.url), 'utf8');
  const spotBrentRaw = JSON.parse(
    await readFile(new URL('./fixtures/spotbrent_m15_sample.json', import.meta.url), 'utf8')
  );
  const spotBrentCandles = Array.isArray(spotBrentRaw) ? spotBrentRaw : spotBrentRaw.candles;

  // 1. Immutable Hard Gate constants & floor clamping
  assert.equal(MINIMUM_REQUIRED_RR, 2.0);
  assert.equal(enforceMinimumRequiredRR(1.2), 2.0, 'Cannot lower minimum required R:R below 2.0');
  assert.equal(enforceMinimumRequiredRR(0), 2.0);
  assert.equal(enforceMinimumRequiredRR(2.5), 2.5);
  assert.equal(SIGNAL_BACKTEST_VERSION, 'strategy-sim/2.0');
  assert.equal(CLASSICAL_STRATEGY_REGISTRY.length, 5);

  // Helper to build a clean closed bar context with explicit causal structural targets
  const makeBarCtx = (targetsAbove = [], opts = {}) => ({
    bar: {
      open_time_utc_ms: 1700000000000,
      open: 99.6,
      high: 100.2,
      low: 99.2,
      close: 100.0,
      volume: 500,
      is_closed: opts.is_closed !== undefined ? opts.is_closed : true,
    },
    atr: opts.atr ?? 1.0,
    structure: {
      supports: [{ price: 98.5, source: 'SR_SUPPORT_ZONE', index: 40, confirmIndex: 43, strength: 2 }],
      swingLows: [{ price: 98.5, source: 'SWING_LOW', index: 40, confirmIndex: 43, strength: 1 }],
      resistances: [],
      swingHighs: targetsAbove.map((p, idx) => ({
        price: p,
        source: 'SWING_HIGH',
        index: 30 + idx * 5,
        confirmIndex: 33 + idx * 5,
        strength: 1,
      })),
    },
  });

  const baseCandidate = {
    strategyId: 'trend_pullback_v1',
    side: 'long',
    entryPrice: 100.0,
    stopLossPrice: 99.0, // 1.00 risk distance
    reason: 'Synthetic test pullback',
  };

  // 2. Exact R:R boundary matrix: 1.50 (reject), 1.99 (reject), 2.00 (accept), 2.50 (accept), 3.00 (optimal)
  const rr150 = evaluateRiskRewardTradePlan(baseCandidate, makeBarCtx([101.50]), { spreadBps: 0, commissionBps: 0, slippageBps: 0 });
  assert.equal(rr150.passed, false);
  assert.equal(rr150.status, 'no_trade');
  assert.equal(rr150.rejection_code, 'GROSS_RR_BELOW_MINIMUM');

  const rr199 = evaluateRiskRewardTradePlan(baseCandidate, makeBarCtx([101.99]), { spreadBps: 0, commissionBps: 0, slippageBps: 0 });
  assert.equal(rr199.passed, false);
  assert.equal(rr199.status, 'no_trade');
  assert.equal(rr199.rejection_code, 'GROSS_RR_BELOW_MINIMUM');

  const rr200 = evaluateRiskRewardTradePlan(baseCandidate, makeBarCtx([102.00]), { spreadBps: 0, commissionBps: 0, slippageBps: 0 });
  assert.equal(rr200.passed, true);
  assert.equal(rr200.status, 'valid');
  assert.equal(rr200.risk_reward.tier, 'CONDITIONAL_ACCEPT');
  assert.equal(rr200.risk_reward.net_rr, 2.0);

  const rr250 = evaluateRiskRewardTradePlan(baseCandidate, makeBarCtx([102.50, 104.20]), { spreadBps: 0, commissionBps: 0, slippageBps: 0 });
  assert.equal(rr250.passed, true);
  assert.equal(rr250.risk_reward.tier, 'CONDITIONAL_ACCEPT');
  assert.equal(rr250.take_profit_suggested[0], 102.5);
  assert.equal(rr250.take_profit_suggested[1], 104.2);

  const rr300 = evaluateRiskRewardTradePlan(baseCandidate, makeBarCtx([103.00]), { spreadBps: 0, commissionBps: 0, slippageBps: 0 });
  assert.equal(rr300.passed, true);
  assert.equal(rr300.risk_reward.tier, 'OPTIMAL');

  // 3. Gross RR = 2.10 eroded by realistic Spread + Commission + Slippage to Net RR < 2.00 (~1.95) -> MUST REJECT!
  // Round-trip friction = (spread + 2*comm + 2*slip) = 5 bps on 100 => 0.05/unit => Net RR = (2.10 - 0.05) / (1.00 + 0.05) = 1.9524
  const rrCostEroded = evaluateRiskRewardTradePlan(baseCandidate, makeBarCtx([102.10]), {
    spreadBps: 2.0,
    commissionBps: 1.0,
    slippageBps: 0.5,
  });
  assert.equal(rrCostEroded.passed, false, 'Gross 2.10 eroded by costs to Net ~1.95 MUST be rejected');
  assert.equal(rrCostEroded.status, 'no_trade');
  assert.equal(rrCostEroded.rejection_code, 'NET_RR_BELOW_MINIMUM');
  assert.ok(rrCostEroded.risk_reward.gross_rr >= 2.09);
  assert.ok(rrCostEroded.risk_reward.net_rr > 1.90 && rrCostEroded.risk_reward.net_rr < 2.00);

  // 4. Anti-TP-Fabrication: nearest structural resistance is at 1.45R, second is at 3.50R -> MUST use 1.45R and REJECT!
  const rrNoFab = evaluateRiskRewardTradePlan(baseCandidate, makeBarCtx([101.45, 103.50]), {
    spreadBps: 0,
    commissionBps: 0,
    slippageBps: 0,
  });
  assert.equal(rrNoFab.passed, false, 'Must NEVER skip nearer structural barrier (1.45R) to fabricate 3.50R');
  assert.equal(rrNoFab.rejection_code, 'GROSS_RR_BELOW_MINIMUM');
  assert.equal(rrNoFab.take_profit_suggested[0], 101.45);

  // 5. Missing SL, missing TP, open candle, insufficient data, duplicate suppression
  const missingSl = evaluateRiskRewardTradePlan({ ...baseCandidate, stopLossPrice: null }, makeBarCtx([103.0]));
  assert.equal(missingSl.passed, false);
  assert.equal(missingSl.rejection_code, 'NO_STRUCTURAL_STOP_LOSS');

  const missingTp = evaluateRiskRewardTradePlan(baseCandidate, makeBarCtx([]));
  assert.equal(missingTp.passed, false);
  assert.equal(missingTp.rejection_code, 'NO_STRUCTURAL_TARGET');

  const openBarRes = evaluateRiskRewardTradePlan(baseCandidate, makeBarCtx([103.0], { is_closed: false }));
  assert.equal(openBarRes.passed, false);
  assert.equal(openBarRes.rejection_code, 'OPEN_BAR_FORBIDDEN');

  const openFilteredCtx = prepareTaCoreContext([
    ...spotBrentCandles.slice(0, 60),
    { ...spotBrentCandles[60], is_closed: false },
  ]);
  assert.equal(openFilteredCtx.candles.length, 60, 'prepareTaCoreContext MUST exclude unclosed/forming candle');

  const tinyBacktest = SignalBacktester.runBacktest(spotBrentCandles.slice(0, 12), { strategyId: 'trend_pullback_v1' });
  assert.equal(tinyBacktest.status, 'INSUFFICIENT_DATA');
  assert.equal(tinyBacktest.signalReport.latestDecision.status, 'NO_TRADE');

  // Verify duplicate cooldown suppression on consecutive signals of same side
  const dupCtx = prepareTaCoreContext(spotBrentCandles, { symbolCode: 'SPOTBRENT', timeframe: 'M15' });
  const dupRun = generateStrategySignals(dupCtx, 'rsi_dip_v1', {
    direction: 'BOTH',
    duplicateCooldownBars: 8,
    spreadBps: 0,
    commissionBps: 0,
    slippageBps: 0,
  });
  for (let k = 1; k < dupRun.validSignals.length; k++) {
    const prev = dupRun.validSignals[k - 1];
    const curr = dupRun.validSignals[k];
    if (prev.side === curr.side) {
      assert.ok(curr.bar_index - prev.bar_index > 8, 'Valid same-side signals must respect cooldown suppression');
    }
  }

  // 6. Causal Donchian Breakout check: current bar MUST NOT pollute [i-N .. i-1] channel
  const brkCandles = [];
  for (let i = 0; i < 30; i++) {
    brkCandles.push({
      open_time_utc_ms: 1700000000000 + i * 900_000,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 100,
      is_closed: true,
    });
  }
  brkCandles.push({
    open_time_utc_ms: 1700000000000 + 30 * 900_000,
    open: 100.2,
    high: 103.0,
    low: 100.0,
    close: 102.8, // strong close strictly above prior 20-bar highest high (101)
    volume: 200,
    is_closed: true,
  });
  const brkCand = evaluateBreakoutAtBar(
    {
      candles: brkCandles,
      indicators: {
        atr14: Array(31).fill(1.0),
        sma50: Array(31).fill(98.0),
        sma200: Array(31).fill(null),
      },
      bar: brkCandles[30],
      atr: 1.0,
      structure: { supportsBelow: [], resistancesAbove: [] },
    },
    30,
    { breakoutPeriod: 20, useVolumeFilter: false, useAtrTrendFilter: false },
    'LONG_ONLY'
  );
  assert.ok(brkCand && brkCand.side === 'long', 'Causal Donchian breakout must trigger when close breaks prior N-bar high');
  assert.equal(brkCand.indicatorsSnapshot.priorHighestHigh, 101, 'Prior N-bar high MUST exclude current bar high (103)');

  // 7. Run all 5 classical generators & comparison on real 260-bar SPOTBRENT fixture + verify Connors RSI(2)
  const compare = SignalBacktester.compareAllStrategies(spotBrentCandles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    chartId: 'SPOTBRENT_tvdatafeed_M15',
    minRequiredRR: 1.0, // deliberately attempt < 2.0 to prove Hard Gate forces 2.0
  });
  assert.equal(compare.rows.length, 5);
  const rsiDipRow = compare.rows.find((r) => r.strategyId === 'rsi_dip_v1');
  assert.equal(rsiDipRow.isResearchBenchmarkOnly, true);

  for (const strat of CLASSICAL_STRATEGY_REGISTRY) {
    const bt = SignalBacktester.runBacktest(spotBrentCandles, {
      symbolCode: 'SPOTBRENT',
      timeframe: 'M15',
      chartId: 'SPOTBRENT_tvdatafeed_M15',
      strategyId: strat.id,
      minRequiredRR: 1.1, // must be clamped to 2.0
    });
    assert.equal(bt.status, 'READY');
    assert.equal(bt.config.minRequiredRR, 2.0, `${strat.id} must enforce Hard Gate minRequiredRR = 2.0`);
    assert.ok(['VALID', 'NO_TRADE'].includes(bt.signalReport.latestDecision.status));
    assert.equal(bt.costSensitivity.length, 4, `${strat.id} must include 0x/1x/1.5x/2x cost sensitivity`);
    assert.ok(bt.inSampleOutOfSample && bt.inSampleOutOfSample.splitBarIndex > 0, 'Must compute 70/30 IS/OOS split');
    // Every emitted valid signal MUST satisfy Net R:R >= 2.0 and contract schema
    for (const sig of bt.signalReport.validSignals) {
      assert.equal(sig.status, 'valid');
      assert.equal(sig.version, 'signal-gen/1.0');
      assert.ok(sig.risk_reward.net_rr >= 2.0, `${strat.id} emitted signal below Net R:R 2.0!`);
    }
  }

  // Verify Connors RSI(2) variant runs cleanly
  const connorsRun = SignalBacktester.runBacktest(spotBrentCandles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    strategyId: 'rsi_reversion_v1',
    strategyParams: { variant: 'CONNORS_RSI2', connorsRsi2Threshold: 10 },
  });
  assert.equal(connorsRun.status, 'READY');
  assert.equal(connorsRun.config.minRequiredRR, 2.0);

  // 8. Verify Strategy Lab UI renders all 4 tabs & Canvas chartRenderer enforces valid-only signal overlay
  const prevModal = state.activeModal;
  const prevStratCfg = state.strategySimConfig;
  const prevCache = state.candleCache['SPOTBRENT_tvdatafeed_M15'];
  try {
    state.activeModal = 'strategy-lab';
    saveCandlesToCache('SPOTBRENT_tvdatafeed_M15', spotBrentCandles, 5000, 'SPOTBRENT');
    const mockI18n = { getCurrentLanguage: () => 'en', t: (k) => k };
    const tabArg = { symbolCode: 'SPOTBRENT', provider: 'tvdatafeed', timeframe: 'M15' };

    state.strategySimConfig = { ...prevStratCfg, engineMode: 'CLASSICAL', activeLabTab: 'overview', strategyId: 'trend_pullback_v1' };
    const overviewHtml = renderStrategyLabModal(tabArg, mockI18n);
    assert.match(overviewHtml, /Net R:R ≥ 1:2\.00/);
    assert.match(overviewHtml, /strategy-sim-select-preset/);
    assert.match(overviewHtml, /data-action="strategy-lab-set-tab"/);

    state.strategySimConfig = { ...prevStratCfg, engineMode: 'CLASSICAL', activeLabTab: 'compare' };
    const compareHtml = renderStrategyLabModal(tabArg, mockI18n);
    assert.match(compareHtml, /Transparent Multi-Strategy Comparison/);
    assert.match(compareHtml, /rsi_dip_v1/);

    state.strategySimConfig = { ...prevStratCfg, engineMode: 'CLASSICAL', activeLabTab: 'diagnostics' };
    const diagHtml = renderStrategyLabModal(tabArg, mockI18n);
    assert.match(diagHtml, /NO TRADE/);

    assert.match(chartRendererSrc, /tab\.showStrategySignal[\s\S]{0,160}activeStrategySignal\.status === 'valid'[\s\S]{0,120}net_rr \|\| 0\) >= 2\.0/);
  } finally {
    state.activeModal = prevModal;
    state.strategySimConfig = prevStratCfg;
    if (prevCache === undefined) delete state.candleCache['SPOTBRENT_tvdatafeed_M15'];
    else saveCandlesToCache('SPOTBRENT_tvdatafeed_M15', prevCache, 5000, 'SPOTBRENT');
  }
});

test('FORECAST-UX-SIMPLIFY-03: duplicate snapshot prevention, simplified history table, explicit Compare Selected Models button, and decluttered Forecast Studio accordions', async () => {
  const { ForecastLedger, defaultForecastLedger } = await import('../host_subdomain/assets/js/forecast/forecastLedger.js');
  const { renderOverviewPanel, renderLedgerPanel } = await import('../host_subdomain/assets/js/views/forecastView.js');
  const { state } = await import('../host_subdomain/assets/js/core/store.js');
  const appSource = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');

  const sampleRaw = JSON.parse(await readFile(new URL('./fixtures/spotbrent_m15_sample.json', import.meta.url), 'utf8'));
  const sampleBars = Array.isArray(sampleRaw) ? sampleRaw : sampleRaw.candles || [];
  const anchorBar = sampleBars[199];
  const anchorMs = Number(anchorBar.open_time_utc_ms);
  const anchorClose = Number(anchorBar.close);

  const mkPts = (delta) =>
    Array.from({ length: 15 }, (_, idx) => ({
      step: idx + 1,
      openTimeUtcMs: anchorMs + (idx + 1) * 900000,
      q10: anchorClose + delta - 1.2,
      q25: anchorClose + delta - 0.6,
      q50: anchorClose + delta,
      q75: anchorClose + delta + 0.6,
      q90: anchorClose + delta + 1.2,
    }));

  const mockForecast = {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    providerId: 'tvdatafeed',
    status: 'INSUFFICIENT_EVIDENCE',
    regime: 'RANGING',
    horizonBars: 15,
    anchorOpenTimeUtcMs: anchorMs,
    anchorClose,
    selectedChartModelId: 'structural_wave_js',
    model: { id: 'structural_wave_js', name: 'Structural JS' },
    summary: { terminalQ50: anchorClose + 0.5, terminalQ10: anchorClose - 0.7, terminalQ90: anchorClose + 1.7, corridorWidthPct: 2.6 },
    points: mkPts(+0.5),
    featuresSummary: { ewmaSigmaPct: 0.42, atrPct: 0.45 },
    uncertainty: { oodStatus: 'IN_DISTRIBUTION', oodDistance: 0.4, spreadMultiplierApplied: 1.0, aleatoricShare: 0.7, epistemicShare: 0.3, aleatoricPct: 1.1, epistemicPct: 0.4, totalPct: 1.5, oodReasons: [] },
    noEdgeGate: { hasEdge: false, gateState: 'NO_EDGE_DETECTED', reasons: ['Sample test'] },
    conformalCalibration: { calibrationStatus: 'CALIBRATED_NORMALIZED', calibrationWindows: 10, gammaLevel: 0.8, normalizedScaleQ80: 1.2, decayLambda: 0.92 },
    scenarios: [],
    keyZones: [],
    generatedAtUtcMs: 1795560000000,
    inputHash: 'simplify03-hash',
    modelTrajectories: [
      { modelId: 'structural_wave_js', modelName: 'Structural JS', status: 'SUCCESS', points: mkPts(+0.5) },
      { modelId: 'smc_prediction_js', modelName: 'SMC Prediction Engine', status: 'SUCCESS', points: mkPts(-0.4) },
      { modelId: 'empirical_analogs', modelName: 'Causal Historical Analogs', status: 'SUCCESS', points: mkPts(+0.2) },
    ],
  };

  // 1. preventDuplicate blocks duplicate single & batch snapshots while keeping SHA-256 chain valid
  const testLedger = new ForecastLedger('ci_test_simplify03_ledger_v1');
  testLedger.clear();
  const first = testLedger.appendFromForecast(mockForecast, {
    modelId: 'structural_wave_js',
    points: mkPts(+0.5),
    recordedAtUtcMs: 1795560000000,
    generatedAtUtcMs: 1795560000000,
    preventDuplicate: true,
  });
  assert.ok(first && !first.duplicateSkipped);

  const secondDup = testLedger.appendFromForecast(mockForecast, {
    modelId: 'structural_wave_js',
    points: mkPts(+0.5),
    recordedAtUtcMs: 1795560010000,
    generatedAtUtcMs: 1795560010000,
    preventDuplicate: true,
  });
  assert.equal(secondDup.duplicateSkipped, true, 'Duplicate snapshot on same symbol/tf/horizon/model/anchor must be skipped');
  assert.equal(secondDup.seq, first.seq);
  assert.equal(testLedger.loadEntries().length, 1);

  const batch1 = testLedger.appendBatchFromForecast(mockForecast, ['structural_wave_js', 'smc_prediction_js', 'empirical_analogs'], {
    requireMultiple: true,
    preventDuplicate: true,
    recordedAtUtcMs: 1795560020000,
  });
  assert.equal(batch1.entries.length, 2, 'Only non-duplicate models (SMC + Analogs) should be appended');
  assert.equal(batch1.skippedDuplicates.length, 1, 'Already-recorded Structural JS must be reported as skipped duplicate');
  assert.equal(batch1.comparisonHashes.length, 3, 'All 3 models remain selectable together for comparison');

  const batch2AllDup = testLedger.appendBatchFromForecast(mockForecast, ['structural_wave_js', 'smc_prediction_js', 'empirical_analogs'], {
    requireMultiple: true,
    preventDuplicate: true,
    recordedAtUtcMs: 1795560030000,
  });
  assert.equal(batch2AllDup.reason, 'ALL_DUPLICATE');
  assert.equal(batch2AllDup.entries.length, 0);
  assert.equal(testLedger.verifyChain().valid, true, 'SHA-256 chain must stay 100% valid after duplicate skipping');

  // 2. Simplified Ledger UI: Hide Duplicates toggle, simple outcomes (موفق / ناموفق / در انتظار), explicit Compare Selected Models button
  const prevTabs = state.openTabs;
  const prevActiveId = state.activeTabId;
  const prevFilters = state._forecastLedgerFilters;
  const prevOverlayHashes = state._ledgerOverlayHashes;
  const prevCompareMode = state._ledgerCompareMode;
  try {
    defaultForecastLedger.clear();
    const eA = defaultForecastLedger.appendFromForecast(mockForecast, {
      modelId: 'structural_wave_js',
      points: mkPts(+0.4),
      recordedAtUtcMs: 1795560000000,
      generatedAtUtcMs: 1795560000000,
    });
    // Force an older duplicate entry to verify UI duplicate tagging/hiding
    const eADup = defaultForecastLedger.appendFromForecast(mockForecast, {
      modelId: 'structural_wave_js',
      points: mkPts(+0.4),
      recordedAtUtcMs: 1795560020000,
      generatedAtUtcMs: 1795560020000,
    });
    const eB = defaultForecastLedger.appendFromForecast(mockForecast, {
      modelId: 'smc_prediction_js',
      points: mkPts(-2.5),
      recordedAtUtcMs: 1795560030000,
      generatedAtUtcMs: 1795560030000,
    });
    defaultForecastLedger.evaluateMaturedForecasts(sampleBars, 'SPOTBRENT', 'M15');

    state.openTabs = [{ tabId: 'tab_spot', symbolCode: 'SPOTBRENT', timeframe: 'M15', provider: 'tvdatafeed', decimals: 2, candles: sampleBars }];
    state.activeTabId = 'tab_spot';
    state._ledgerOverlayHashes = [eADup.forecastHash, eB.forecastHash];
    state._ledgerCompareMode = 'selected';
    state._forecastLedgerFilters = { model: 'ALL', tfHorizon: 'ALL', status: 'ALL', condition: 'ALL', hideDuplicates: true };

    const ledgerFaHidden = renderLedgerPanel(2, true);
    assert.match(ledgerFaHidden, /data-action="compare-selected-ledger-entries"/, 'Ledger must expose explicit Compare Selected Models button');
    assert.match(ledgerFaHidden, /مقایسه مدل‌های انتخاب‌شده/, 'Persian Compare Selected Models button must be visible');
    assert.match(ledgerFaHidden, /مخفی‌سازی تکراری‌ها \(1\)/, 'Hide Duplicates toggle must show hidden duplicate count');
    assert.match(ledgerFaHidden, /مدل برتر این بازه/, 'Selected rows side-by-side comparison must crown Best Model in Persian');
    assert.match(ledgerFaHidden, /id="ci-fc-compare-card"/, 'Comparison card must render for manually checked rows even without shared batchId');
    assert.match(ledgerFaHidden, /(موفق|ناموفق|در انتظار)/, 'Table must show simple Persian outcomes');
    assert.doesNotMatch(ledgerFaHidden, /تکراری \(#/, 'Duplicate rows must be hidden when hideDuplicates is enabled');

    state._forecastLedgerFilters = { model: 'ALL', tfHorizon: 'ALL', status: 'ALL', condition: 'ALL', hideDuplicates: false };
    const ledgerFaShown = renderLedgerPanel(2, true);
    assert.match(ledgerFaShown, /تکراری \(#/, 'When Hide Duplicates is unchecked, duplicate rows must be clearly labeled');

    // 3. Decluttered Overview & app.js wiring
    const overviewFa = renderOverviewPanel(mockForecast, state.openTabs[0], 2, true, 'independent');
    const accordionMatches = overviewFa.match(/ci-fc-accordion/g) || [];
    assert.ok(accordionMatches.length >= 2, 'Overview must tuck scenarios/key-zones and technical diagnostics into collapsible accordions');
    assert.match(appSource, /preventDuplicate:\s*true/, 'app.js UI recording handlers must pass preventDuplicate: true');
    assert.match(appSource, /action === 'compare-selected-ledger-entries'/, 'app.js must wire Compare Selected Models action');
    assert.match(appSource, /action === 'toggle-ledger-hide-duplicates'/, 'app.js must wire Hide Duplicates toggle');
  } finally {
    testLedger.clear();
    defaultForecastLedger.clear();
    state.openTabs = prevTabs;
    state.activeTabId = prevActiveId;
    state._forecastLedgerFilters = prevFilters;
    state._ledgerOverlayHashes = prevOverlayHashes;
    state._ledgerCompareMode = prevCompareMode;
  }
});

test('LIVE-FORECAST-COMPARE-REFRESH-01: on-chart forecast persists across newly closed candles, tracks live hit/miss metrics, pins previous forecasts on refresh, and renders comparison overlays', async () => {
  const {
    isStructuralForecastMatchingTab,
    isPinnedPreviousForecastMatchingTab,
    evaluateOnChartForecastProgress,
    pinCurrentForecastAsPrevious,
    clearTabPinnedForecasts,
    clearTabStructuralForecast,
    invalidateTabStructuralForecastIfStale,
    reconcileTabStructuralForecastOnRender,
  } = await import('../host_subdomain/assets/js/core/store.js');
  const { renderCandlestickCanvas } = await import('../host_subdomain/assets/js/components/chartRenderer.js');
  const appSource = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const cssSource = await readFile(new URL('../host_subdomain/assets/css/theme.css', import.meta.url), 'utf8');

  // 1. Build 50 closed M15 candles in the past so every candle is deterministically closed
  const stepMs = 15 * 60 * 1000;
  const startMs = Date.UTC(2026, 2, 10, 8, 0, 0);
  const baseCandles = Array.from({ length: 50 }, (_, i) => {
    const close = 100 + i * 0.25;
    return {
      open_time_utc_ms: startMs + i * stepMs,
      open_time_utc_iso: new Date(startMs + i * stepMs).toISOString(),
      open: close - 0.1,
      high: close + 0.3,
      low: close - 0.3,
      close,
      volume: 1000,
      is_closed: true,
    };
  });

  const originCandle = baseCandles[baseCandles.length - 1];
  const makeForecastAt = (originBar, horizon = 10, modelId = 'naive_persistence') => ({
    status: 'READY',
    engine: {
      engine_id: 'native_model_adapter',
      is_chronos2: false,
      params: {
        horizon_bars: horizon,
        model_id: modelId,
        requested_model_id: modelId,
      },
    },
    model: {
      id: modelId,
      requested_id: modelId,
      name: modelId === 'naive_persistence' ? 'Naive Persistence' : 'Trend Model',
      oos: { status: 'EVALUATED' },
      source_engine_status: 'READY',
    },
    series: {
      symbol: 'BTCUSD',
      provider: 'tvdatafeed',
      timeframe: 'M15',
      origin_open_time_utc_ms: originBar.open_time_utc_ms,
      last_closed_price: originBar.close,
    },
    forecast: Array.from({ length: horizon }, (_, idx) => {
      const step = idx + 1;
      const q50 = originBar.close + step * 0.2;
      return {
        step,
        open_time_utc_ms: originBar.open_time_utc_ms + step * stepMs,
        q10: q50 - 0.6,
        q25: q50 - 0.3,
        q50_median: q50,
        q75: q50 + 0.3,
        q90: q50 + 0.6,
      };
    }),
  });

  const initialForecast = makeForecastAt(originCandle, 10, 'naive_persistence');
  const tab = {
    tabId: 'tab_live_fc',
    symbolCode: 'BTCUSD',
    provider: 'tvdatafeed',
    timeframe: 'M15',
    decimals: 2,
    candles: [...baseCandles],
    visibleCount: 40,
    scrollOffset: 0,
    showStructuralForecast: true,
    showForecastBand: true,
    forecastHorizonBars: 10,
    structuralForecastHorizonBars: 10,
    structuralForecastModel: 'naive_persistence',
    structuralForecast: initialForecast,
    structuralForecastStatus: 'READY',
    structuralForecastError: '',
    pinnedPreviousForecasts: [],
  };

  // Fresh forecast matches both default and requireLatestOrigin
  assert.equal(isStructuralForecastMatchingTab(tab, tab.structuralForecast), true);
  assert.equal(isStructuralForecastMatchingTab(tab, tab.structuralForecast, { requireLatestOrigin: true }), true);

  // 2. Append 3 newly closed candles (2 inside band, 1 outside band)
  const newBars = [
    {
      open_time_utc_ms: originCandle.open_time_utc_ms + 1 * stepMs,
      open_time_utc_iso: new Date(originCandle.open_time_utc_ms + 1 * stepMs).toISOString(),
      open: originCandle.close,
      high: originCandle.close + 0.4,
      low: originCandle.close - 0.1,
      close: originCandle.close + 0.25, // step +1 pred q50 = +0.20, band [-0.40..+0.80] -> IN BAND
      volume: 1100,
      is_closed: true,
    },
    {
      open_time_utc_ms: originCandle.open_time_utc_ms + 2 * stepMs,
      open_time_utc_iso: new Date(originCandle.open_time_utc_ms + 2 * stepMs).toISOString(),
      open: originCandle.close + 0.25,
      high: originCandle.close + 0.7,
      low: originCandle.close + 0.1,
      close: originCandle.close + 0.5, // step +2 pred q50 = +0.40, band [-0.20..+1.00] -> IN BAND
      volume: 1150,
      is_closed: true,
    },
    {
      open_time_utc_ms: originCandle.open_time_utc_ms + 3 * stepMs,
      open_time_utc_iso: new Date(originCandle.open_time_utc_ms + 3 * stepMs).toISOString(),
      open: originCandle.close + 0.5,
      high: originCandle.close + 2.6,
      low: originCandle.close + 0.4,
      close: originCandle.close + 2.4, // step +3 pred q50 = +0.60, band [0.00..+1.20] -> OUT OF BAND
      volume: 1400,
      is_closed: true,
    },
  ];
  tab.candles = [...baseCandles, ...newBars];

  // Forecast MUST NOT vanish when newer closed candles arrive!
  assert.equal(isStructuralForecastMatchingTab(tab, tab.structuralForecast), true, 'Forecast must stay valid on chart as newer candles close');
  assert.equal(
    isStructuralForecastMatchingTab(tab, tab.structuralForecast, { requireLatestOrigin: true }),
    false,
    'requireLatestOrigin must detect that newer closed candles exist for refresh'
  );
  invalidateTabStructuralForecastIfStale(tab);
  reconcileTabStructuralForecastOnRender(tab);
  assert.equal(tab.showStructuralForecast, true, 'Background sync invalidation must keep forecast active on chart');
  assert.ok(tab.structuralForecast, 'Forecast payload must remain intact after new candle arrival');

  // Live comparison metrics
  const prog = evaluateOnChartForecastProgress(tab.candles, tab.structuralForecast, 'M15', 'BTCUSD');
  assert.ok(prog, 'Must compute live forecast progress');
  assert.equal(prog.elapsedBars, 3);
  assert.equal(prog.evaluatedBars, 3);
  assert.equal(prog.inBandCount, 2);
  assert.equal(Math.round(prog.hitRatePct), 67);
  assert.equal(prog.latestDirMatch, true);
  assert.equal(prog.items.length, 3);
  assert.equal(prog.items[0].inBand, true);
  assert.equal(prog.items[1].inBand, true);
  assert.equal(prog.items[2].inBand, false);

  // 3. Pin current forecast as previous, then refresh to latest closed candle
  assert.equal(pinCurrentForecastAsPrevious(tab, 3), true);
  assert.equal(tab.pinnedPreviousForecasts.length, 1);
  // Deduplication check: pinning the exact same forecast again must not create duplicates
  assert.equal(pinCurrentForecastAsPrevious(tab, 3), true);
  assert.equal(tab.pinnedPreviousForecasts.length, 1);

  const refreshedForecast = makeForecastAt(newBars[2], 10, 'naive_persistence');
  tab.structuralForecast = refreshedForecast;
  assert.equal(isStructuralForecastMatchingTab(tab, tab.structuralForecast, { requireLatestOrigin: true }), true);
  assert.equal(isPinnedPreviousForecastMatchingTab(tab, tab.pinnedPreviousForecasts[0]), true);

  // 4. Canvas rendering with both pinned previous forecast + active forecast + realized hover tooltip
  const drawnTexts = [];
  const mockCtx = {
    setTransform() {},
    scale() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    arc() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    clip() {},
    rect() {},
    setLineDash() {},
    roundRect() {},
    measureText: (txt) => ({ width: String(txt).length * 6.5 }),
    fillText: (txt) => { drawnTexts.push(String(txt)); },
  };
  const mockCanvas = {
    width: 900,
    height: 460,
    parentElement: { clientWidth: 900, clientHeight: 460 },
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 460 }),
    getContext: () => mockCtx,
  };
  // Hover directly on the 2nd realized candle of the pinned forecast (global index 51 -> visible index within last 40 bars)
  tab.hoverIndex = 38;
  tab.hoverY = 180;
  const prevWindow = globalThis.window;
  globalThis.window = { ...(prevWindow || {}), devicePixelRatio: 1 };
  try {
    renderCandlestickCanvas(mockCanvas, tab, { isDarkTheme: true, timezoneMode: 'UTC' }, null);
  } finally {
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
  }
  assert.ok(drawnTexts.some((t) => t.includes('Prev #1')), 'Chart must render pinned previous forecast origin/accuracy label');
  assert.ok(drawnTexts.some((t) => t.includes('Pred ') && t.includes('vs Real ')), 'Hovering a realized candle must render Pred vs Real comparison tooltip');

  // 5. Origin candle price revision STILL invalidates cleanly
  const corruptedTab = {
    ...tab,
    candles: tab.candles.map((c, idx) =>
      idx === tab.candles.length - 1 ? { ...c, close: c.close + 9.5 } : c
    ),
  };
  assert.equal(isStructuralForecastMatchingTab(corruptedTab, corruptedTab.structuralForecast), false);
  invalidateTabStructuralForecastIfStale(corruptedTab);
  assert.equal(corruptedTab.structuralForecast, null);
  assert.equal(corruptedTab.showStructuralForecast, false);

  // 6. Explicit clear removes pinned forecasts cleanly
  clearTabPinnedForecasts(tab);
  assert.equal(tab.pinnedPreviousForecasts.length, 0);
  pinCurrentForecastAsPrevious(tab, 3);
  assert.equal(tab.pinnedPreviousForecasts.length, 1);
  clearTabStructuralForecast(tab, { clearPinned: true });
  assert.equal(tab.pinnedPreviousForecasts.length, 0);

  // 7. UI action & CSS wiring checks
  assert.equal(/\bpills\.push\s*\(/.test(appSource), false, 'app.js must push forecast badges to indPills (never undeclared pills)');
  assert.match(appSource, /indPills\.push\([\s\S]*?tv-ind-pill-forecast/, 'Live forecast badge must push into indPills');
  assert.match(appSource, /indPills\.push\([\s\S]*?tv-ind-pill-prev/, 'Pinned previous forecast badge must push into indPills');
  assert.match(appSource, /data-action="refresh-forecast-keep-previous"/, 'OHLCV overlay must expose Refresh (Keep Previous) button');
  assert.match(appSource, /data-action="clear-pinned-forecasts"/, 'OHLCV overlay must expose Clear Previous Forecasts button');
  assert.match(appSource, /action === 'refresh-forecast-keep-previous'/, 'app.js must wire refresh-forecast-keep-previous action');
  assert.match(appSource, /action === 'clear-pinned-forecasts'/, 'app.js must wire clear-pinned-forecasts action');
  assert.match(cssSource, /\.tv-ind-pill-live-stat/, 'theme.css must style live forecast comparison stat pill');
  assert.match(cssSource, /\.tv-ind-pill-prev/, 'theme.css must style pinned previous forecast pill');
});

test('FORECAST-P0-DECISION-SIMPLE-RESEARCH-01: Phase P0 Data Readiness 5-state contract, Model Governance tiers, 4-step Decision Layer (VALID/PROVISIONAL/NO_EDGE/INSUFFICIENT_EVIDENCE/DATA_NOT_READY), AUTO Relative candidate, and Simple vs Research UX', async () => {
  const {
    DATA_READINESS_STATE,
    FORECAST_STATUS,
    EDGE_STATUS,
    PATH_SEMANTICS,
    SELECTION_MODE,
    MODEL_EXECUTION_STATUS,
    OOD_STATUS,
    MTF_ALIGNMENT_STATE,
    validateDataReadiness,
  } = await import('../host_subdomain/assets/js/forecast/forecastContract.js');
  const {
    defaultForecastRegistry,
    resolveModelGovernance,
  } = await import('../host_subdomain/assets/js/forecast/modelRegistry.js');
  const {
    DECISION_POLICY_VERSION,
    buildDecisionSummary,
    resolveRelativeCandidate,
    resolvePathSemantics,
  } = await import('../host_subdomain/assets/js/forecast/decisionLayer.js');
  const { selectOosChartWinner } = await import('../host_subdomain/assets/js/forecast/walkForwardEvaluator.js');
  const { ForecastEngine } = await import('../host_subdomain/assets/js/forecast/forecastEngine.js');
  const { renderDecisionCard, renderOverviewPanel, renderModelsPanel } = await import('../host_subdomain/assets/js/views/forecastView.js');
  const appSource = await readFile(new URL('../host_subdomain/assets/js/app.js', import.meta.url), 'utf8');
  const cssSource = await readFile(new URL('../host_subdomain/assets/css/theme.css', import.meta.url), 'utf8');

  // 1. F-01: Data Readiness 5-state contract (READY, INSUFFICIENT_HISTORY, STALE_DATA, DATA_GAP, DATA_NOT_READY)
  const stepMs = 15 * 60 * 1000;
  const baseMs = Date.UTC(2026, 2, 16, 8, 0, 0); // Monday
  const makeCleanBars = (count, start = baseMs) =>
    Array.from({ length: count }, (_, i) => {
      const c = 2500 + Math.sin(i * 0.17) * 8 + i * 0.12;
      return {
        open_time_utc_ms: start + i * stepMs,
        open: c - 0.3,
        high: c + 0.9,
        low: c - 0.9,
        close: c,
        volume: 500 + (i % 40) * 10,
      };
    });

  // Empty -> DATA_NOT_READY
  const emptyReadiness = validateDataReadiness([], { horizonBars: 10 });
  assert.equal(emptyReadiness.ready, false);
  assert.equal(emptyReadiness.readinessState, DATA_READINESS_STATE.DATA_NOT_READY);
  assert.ok(emptyReadiness.missingBarsCount >= 155);

  // Insufficient bars -> INSUFFICIENT_HISTORY + exact missingBarsCount
  const shortBars = makeCleanBars(50);
  const shortReadiness = validateDataReadiness(shortBars, {
    horizonBars: 10,
    anchorNowMs: shortBars[shortBars.length - 1].open_time_utc_ms + stepMs * 2,
  });
  assert.equal(shortReadiness.ready, false);
  assert.equal(shortReadiness.readinessState, DATA_READINESS_STATE.INSUFFICIENT_HISTORY);
  assert.equal(shortReadiness.missingBarsCount, shortReadiness.nOpMin - 50);

  // Stale data -> STALE_DATA when enforceStaleData: true
  const readyBars = makeCleanBars(180);
  const lastCloseMs = readyBars[readyBars.length - 1].open_time_utc_ms + stepMs;
  const staleReadiness = validateDataReadiness(readyBars, {
    horizonBars: 10,
    symbolCode: 'BTCUSD',
    timeframe: 'M15',
    anchorNowMs: lastCloseMs + stepMs * 50, // 50 bars old > 4 bars crypto limit
    enforceStaleData: true,
  });
  assert.equal(staleReadiness.ready, false);
  assert.equal(staleReadiness.readinessState, DATA_READINESS_STATE.STALE_DATA);
  assert.equal(staleReadiness.staleTelemetry.isStale, true);

  // Disallowed gap -> DATA_GAP when enforceCalendarGaps: true
  const gappedBars = makeCleanBars(180).filter((_, idx) => idx !== 90 && idx !== 91);
  const gapReadiness = validateDataReadiness(gappedBars, {
    horizonBars: 10,
    symbolCode: 'BTCUSD',
    timeframe: 'M15',
    anchorNowMs: gappedBars[gappedBars.length - 1].open_time_utc_ms + stepMs * 2,
    enforceCalendarGaps: true,
  });
  assert.equal(gapReadiness.ready, false);
  assert.equal(gapReadiness.readinessState, DATA_READINESS_STATE.DATA_GAP);

  // Ready -> READY
  const okReadiness = validateDataReadiness(readyBars, {
    horizonBars: 10,
    symbolCode: 'BTCUSD',
    timeframe: 'M15',
    anchorNowMs: lastCloseMs + stepMs,
    enforceStaleData: true,
  });
  assert.equal(okReadiness.ready, true);
  assert.equal(okReadiness.readinessState, DATA_READINESS_STATE.READY);
  assert.equal(okReadiness.missingBarsCount, 0);

  // 2. F-04 & F-05: Model Governance tiers & exclusion of experimentalOnly models from AUTO/Decision Pool
  const approxIds = ['native_prophet_decomp', 'native_seq_recurrent_approx', 'native_quantile_attention_approx'];
  for (const id of approxIds) {
    const gov = resolveModelGovernance(id);
    assert.equal(gov.experimentalOnly, true, `${id} must be flagged experimentalOnly`);
    assert.equal(gov.governanceTier, 'EXPERIMENTAL_APPROX', `${id} must be EXPERIMENTAL_APPROX`);
    assert.equal(gov.decisionPoolEligible, false, `${id} must be excluded from AUTO decision pool`);
  }
  const decisionPoolIds = defaultForecastRegistry.getDecisionPoolPlugins().map((x) => x.plugin.id);
  for (const id of approxIds) {
    assert.equal(decisionPoolIds.includes(id), false, `Decision pool must exclude ${id}`);
  }
  assert.equal(resolvePathSemantics('structural_wave_js'), PATH_SEMANTICS.JOINT_TRAJECTORY);
  assert.equal(resolvePathSemantics('smc_prediction_js'), PATH_SEMANTICS.JOINT_TRAJECTORY);
  assert.equal(resolvePathSemantics('empirical_analogs'), PATH_SEMANTICS.MARGINAL_MEDIAN);

  // 3. F-06, F-07, F-08: 4-Step Decision Layer & AUTO Relative Candidate
  const mockPoints = Array.from({ length: 10 }, (_, i) => ({
    stepAhead: i + 1,
    openTimeUtcMs: lastCloseMs + i * stepMs,
    q10: 2510 + i * 0.5,
    q25: 2515 + i * 0.5,
    q50: 2520 + i * 0.5,
    q75: 2525 + i * 0.5,
    q90: 2530 + i * 0.5,
    pctChangeFromLast: 0.4,
  }));
  const mockTrajs = [
    { modelId: 'naive_persistence', modelName: 'Naive Persistence', status: MODEL_EXECUTION_STATUS.SUCCESS, isCalibratedInterval: true, points: mockPoints },
    { modelId: 'smc_prediction_js', modelName: 'SMC Prediction Engine', status: MODEL_EXECUTION_STATUS.SUCCESS, isCalibratedInterval: true, points: mockPoints },
    { modelId: 'native_seq_recurrent_approx', modelName: 'GRU Approx', status: MODEL_EXECUTION_STATUS.SUCCESS, isApproximation: true, experimentalOnly: true, isCalibratedInterval: false, points: mockPoints },
  ];

  // Case A: AUTO Relative Candidate (beats Naive on WIS & rMAE < 1, but dmPValue = 0.14 > 0.05 so fails strict 6-gate)
  // Also include an experimental model with even lower WIS to verify it is strictly ignored by AUTO Relative!
  const wfRelative = {
    evaluatedWindows: 32,
    effectiveSampleSize: 27.5,
    wisNaiveDistributional: 4.2,
    conformalCalibration: { calibrationStatus: 'CALIBRATED_NORMALIZED' },
    ensembleMetrics: null,
    modelBenchmarks: [
      {
        modelId: 'native_seq_recurrent_approx',
        modelName: 'GRU Approx',
        experimentalOnly: true,
        status: MODEL_EXECUTION_STATUS.SUCCESS,
        windows: 32,
        nEff: 27.5,
        rMae: 0.75,
        wis: 2.9,
        coverage80Pct: 80.0,
        dmPValue: 0.01,
        bootPValue: 0.01,
      },
      {
        modelId: 'smc_prediction_js',
        modelName: 'SMC Prediction Engine',
        experimentalOnly: false,
        status: MODEL_EXECUTION_STATUS.SUCCESS,
        windows: 32,
        nEff: 27.5,
        rMae: 0.91,
        wis: 3.6,
        coverage80Pct: 78.0,
        dmPValue: 0.14, // Not strict DM pass
        bootPValue: 0.18,
      },
    ],
  };

  const relCandidate = resolveRelativeCandidate(wfRelative, mockTrajs);
  assert.ok(relCandidate, 'Must find eligible relative candidate');
  assert.equal(relCandidate.candidate.modelId, 'smc_prediction_js', 'Must ignore experimental model and select smc_prediction_js');

  const selRelative = selectOosChartWinner(wfRelative, mockTrajs, 'AUTO');
  assert.equal(selRelative.selectionMode, SELECTION_MODE.AUTO_RELATIVE_PROVISIONAL);
  assert.equal(selRelative.selectedModelId, 'smc_prediction_js');
  assert.equal(selRelative.winnerModelId, null, 'Relative candidate must never claim strict winnerModelId');

  const dsRelative = buildDecisionSummary({
    status: FORECAST_STATUS.PROVISIONAL,
    readiness: { ready: true, readinessState: DATA_READINESS_STATE.READY, statisticallySufficient: true },
    anchorClose: 2510,
    horizonBars: 10,
    selectedChartModelId: selRelative.selectedModelId,
    selectionMode: selRelative.selectionMode,
    walkForward: wfRelative,
    conformalCalibration: wfRelative.conformalCalibration,
    noEdgeGate: { hasEdge: false, gateState: 'NO_EDGE_DETECTED', reasons: ['p_DM > 0.05'] },
    uncertainty: { oodStatus: OOD_STATUS.IN_DISTRIBUTION },
    mtfCoordination: { alignmentState: MTF_ALIGNMENT_STATE.ALIGNED },
    scenarioCalibration: { calibrationPassed: true },
    modelTrajectories: mockTrajs,
    points: mockPoints,
  });
  assert.equal(dsRelative.policyVersion, DECISION_POLICY_VERSION);
  assert.equal(dsRelative.status, FORECAST_STATUS.PROVISIONAL);
  assert.equal(dsRelative.edgeStatus, EDGE_STATUS.NOT_PROVEN);
  assert.equal(dsRelative.selectionTier, 'AUTO_RELATIVE');
  assert.equal(dsRelative.modelId, 'smc_prediction_js');
  assert.equal(dsRelative.pathSemantics, PATH_SEMANTICS.JOINT_TRAJECTORY);
  assert.equal(dsRelative.allowStrategy, false, 'AUTO_RELATIVE / PROVISIONAL must NEVER allow Strategy generation');

  // Case B: Manual selection of experimental model NEVER upgrades validity or Strategy eligibility
  const dsManualExp = buildDecisionSummary(
    {
      status: FORECAST_STATUS.NO_EDGE,
      readiness: { ready: true, readinessState: DATA_READINESS_STATE.READY, statisticallySufficient: true },
      anchorClose: 2510,
      horizonBars: 10,
      selectedChartModelId: 'native_seq_recurrent_approx',
      selectionMode: SELECTION_MODE.MANUAL_OVERRIDE,
      walkForward: wfRelative,
      conformalCalibration: wfRelative.conformalCalibration,
      uncertainty: { oodStatus: OOD_STATUS.IN_DISTRIBUTION },
      modelTrajectories: mockTrajs,
      points: mockPoints,
    },
    { requestedModelId: 'native_seq_recurrent_approx' }
  );
  assert.equal(dsManualExp.selectionTier, 'MANUAL');
  assert.equal(dsManualExp.isExperimentalOnly, true);
  assert.equal(dsManualExp.showUncertaintyBand, false, 'Experimental uncalibrated model must not claim calibrated 80% band');
  assert.equal(dsManualExp.allowStrategy, false);

  // Case C: Strict 6-gate OOS winner -> VALID + allowStrategy = true
  const wfStrict = {
    ...wfRelative,
    acceptancePassed: true,
    modelBenchmarks: [
      {
        ...wfRelative.modelBenchmarks[1],
        dmPValue: 0.02,
        bootPValue: 0.04,
      },
    ],
  };
  const selStrict = selectOosChartWinner(wfStrict, mockTrajs, 'AUTO');
  assert.equal(selStrict.selectionMode, SELECTION_MODE.AUTO_OOS_BEST);
  assert.equal(selStrict.winnerModelId, 'smc_prediction_js');
  const dsStrict = buildDecisionSummary({
    status: FORECAST_STATUS.VALID,
    readiness: { ready: true, readinessState: DATA_READINESS_STATE.READY, statisticallySufficient: true },
    anchorClose: 2510,
    horizonBars: 10,
    selectedChartModelId: 'smc_prediction_js',
    selectionMode: SELECTION_MODE.AUTO_OOS_BEST,
    walkForward: wfStrict,
    conformalCalibration: wfStrict.conformalCalibration,
    noEdgeGate: { hasEdge: true, gateState: 'EDGE_SUPPORTED', reasons: [] },
    uncertainty: { oodStatus: OOD_STATUS.IN_DISTRIBUTION },
    mtfCoordination: { alignmentState: MTF_ALIGNMENT_STATE.ALIGNED },
    scenarioCalibration: { calibrationPassed: true },
    modelTrajectories: mockTrajs,
    points: mockPoints,
  });
  assert.equal(dsStrict.status, FORECAST_STATUS.VALID);
  assert.equal(dsStrict.edgeStatus, EDGE_STATUS.PROVEN);
  assert.equal(dsStrict.selectionTier, 'AUTO_STRICT');
  assert.equal(dsStrict.allowStrategy, true, 'VALID with PROVEN edge must enable Strategy generation');

  // Case D: ForecastEngine.project defaults providerId to tvdatafeed and attaches decisionSummary
  const projNotReady = ForecastEngine.project(shortBars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: shortBars[shortBars.length - 1].open_time_utc_ms + stepMs * 2,
  });
  assert.equal(projNotReady.status, FORECAST_STATUS.DATA_NOT_READY);
  assert.ok(projNotReady.decisionSummary, 'DATA_NOT_READY result must carry decisionSummary');
  assert.equal(projNotReady.decisionSummary.readinessState, DATA_READINESS_STATE.INSUFFICIENT_HISTORY);
  assert.equal(projNotReady.decisionSummary.allowStrategy, false);

  // 4. Simple vs Research UX rendering & 3-action guardrail
  const mockFcForUi = {
    status: FORECAST_STATUS.PROVISIONAL,
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    horizonBars: 10,
    anchorClose: 2510,
    selectedChartModelId: 'smc_prediction_js',
    selectionMode: SELECTION_MODE.AUTO_RELATIVE_PROVISIONAL,
    summary: { corridorWidthPct: 0.79 },
    points: mockPoints,
    modelTrajectories: mockTrajs,
    decisionSummary: dsRelative,
    featuresSummary: { ewmaSigmaPct: 0.42 },
  };
  const simpleHtml = renderOverviewPanel(mockFcForUi, { symbolCode: 'SPOTBRENT', timeframe: 'M15', candles: readyBars }, 2, true, 'independent', 'simple');
  assert.match(simpleHtml, /ci-fc-decision-card/, 'Simple mode must render top Decision Card');
  assert.match(simpleHtml, /ci-fc-simple-actions/, 'Simple mode must render 3-button action bar');
  assert.match(simpleHtml, /data-action="open-strategy-from-forecast"\s+disabled/, 'Simple mode must disable Strategy button when allowStrategy is false');
  assert.doesNotMatch(simpleHtml, /ci-fc-accordion/, 'Simple mode must NOT render Research diagnostic accordions');
  assert.doesNotMatch(simpleHtml, /ci-fc-research-banner/, 'Simple mode must NOT render Research disclaimer banner');

  const researchHtml = renderOverviewPanel(mockFcForUi, { symbolCode: 'SPOTBRENT', timeframe: 'M15', candles: readyBars }, 2, true, 'independent', 'research');
  assert.match(researchHtml, /ci-fc-research-banner/, 'Research mode must render scientific evaluation disclaimer banner');
  assert.match(researchHtml, /برای ارزیابی علمی/, 'Research mode banner must include Persian scientific evaluation disclaimer');
  assert.match(researchHtml, /ci-fc-accordion/, 'Research mode must render diagnostic accordions');

  const modelsHtml = renderModelsPanel(mockFcForUi, 2, false);
  assert.match(modelsHtml, /Research-only \/ Experimental/, 'Models panel must badge experimentalOnly approximate models');
  assert.match(appSource, /data-action="set-forecast-ux-mode"/, 'app.js must expose Simple/Research UX mode toggle');
  assert.match(cssSource, /\.ci-fc-decision-card/, 'theme.css must style Decision Card');
});

test('FORECAST-P1-PATH-QUALITY-MARKET-CONTEXT-01: Phase P1 Causal Market Context Engine (§4), 7-Dimensional Path Quality (§5.2), and Ledger/Evaluation Alignment (§11)', async () => {
  const {
    MARKET_CONTEXT_ENGINE_VERSION,
    PATH_QUALITY_SCHEMA_VERSION,
    OBSERVATION_STATUS,
    buildCausalMarketContext,
    extractSeriesTurningPoints,
    computePullbackAndRangeMetrics,
    evaluatePathQualityVector,
  } = await import('../host_subdomain/assets/js/forecast/marketContextEngine.js?v=1.47.41');
  const { evaluateWalkForward } = await import('../host_subdomain/assets/js/forecast/walkForwardEvaluator.js?v=1.47.41');
  const { defaultForecastRegistry } = await import('../host_subdomain/assets/js/forecast/modelRegistry.js?v=1.47.41');
  const { ForecastEngine } = await import('../host_subdomain/assets/js/forecast/forecastEngine.js?v=1.47.41');
  const { ForecastLedger } = await import('../host_subdomain/assets/js/forecast/forecastLedger.js?v=1.47.41');
  const { renderBacktestPanel, renderLedgerPanel } = await import('../host_subdomain/assets/js/views/forecastView.js?v=1.47.41');

  // 1. F-03 & F-04: Causal Swing confirmation lag (index + swingLen) & BOS/CHoCH replay causality
  const stepMs = 15 * 60 * 1000;
  const baseMs = Date.UTC(2026, 2, 2, 8, 0, 0);
  // Build a controlled 30-bar series with a distinct swing high at index 10 (confirmIndex = 13 for swingLen = 3)
  // and a bullish breakout (BOS) above that swing high at index 18.
  const pricePath = [
    100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
    115, // index 10: local peak (115)
    112, 110, 109, // index 11..13: 3 lower highs confirm index 10 at bar 13!
    110, 111, 112, 114,
    117, // index 18: decisive close above 115 -> Bullish BOS confirmed at bar 18!
    118, 116, 115, 114, 113, 114, 115, 116, 117, 118, 119,
  ];
  const controlledCandles = pricePath.map((p, idx) => ({
    open_time_utc_ms: baseMs + idx * stepMs,
    open: p - 0.4,
    high: p + 0.8,
    low: p - 0.8,
    close: p,
    volume: 0, // zero volume to also verify no synthetic volume fabrication (§4.1/§4.3)
    is_closed: true,
  }));

  // At index 12 (before confirmIndex = 13), the swing high at index 10 MUST NOT be in confirmed swings!
  const ctxAt12 = buildCausalMarketContext(controlledCandles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    swingLen: 3,
    asOfIndex: 12,
    includeUnconfirmed: true,
  });
  assert.equal(ctxAt12.schemaVersion, MARKET_CONTEXT_ENGINE_VERSION);
  const confirmedAt12 = ctxAt12.swings.filter((s) => s.index === 10);
  assert.equal(confirmedAt12.length, 0, 'F-03: Swing high at index 10 must NOT be confirmed at index 12 (before index + 3)');
  const unconfirmedAt12 = ctxAt12.unconfirmedSwings.filter((s) => s.index === 10);
  assert.equal(unconfirmedAt12.length, 1, 'F-03: Swing at index 10 may only appear as UNCONFIRMED at index 12');
  assert.equal(unconfirmedAt12[0].status, OBSERVATION_STATUS.UNCONFIRMED);
  assert.equal(unconfirmedAt12[0].confirmedAt, null);

  // At index 13 (exact confirmIndex = 10 + 3), the swing high at index 10 MUST now be confirmed!
  const ctxAt13 = buildCausalMarketContext(controlledCandles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    swingLen: 3,
    asOfIndex: 13,
  });
  const confirmedAt13 = ctxAt13.swings.find((s) => s.index === 10 && s.type === 'SWING_HIGH');
  assert.ok(confirmedAt13, 'F-03: Swing high at index 10 must become confirmed at index 13');
  assert.equal(confirmedAt13.status, OBSERVATION_STATUS.ACTIVE);
  assert.ok(confirmedAt13.confirmedAt > confirmedAt13.occurredAt, 'F-03: confirmedAt must be strictly greater than occurredAt');

  // F-04: At index 17 (before break at index 18), no BOS above 115.8 exists; at index 18, BOS appears!
  const ctxAt17 = buildCausalMarketContext(controlledCandles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    swingLen: 3,
    asOfIndex: 17,
  });
  assert.equal(
    ctxAt17.structureEvents.some((ev) => ev.pivotIndex === 10),
    false,
    'F-04: BOS on pivot 10 must not appear before break bar 18'
  );
  const ctxAt18 = buildCausalMarketContext(controlledCandles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    swingLen: 3,
    asOfIndex: 18,
  });
  const bosAt18 = ctxAt18.structureEvents.find((ev) => ev.pivotIndex === 10);
  assert.ok(bosAt18, 'F-04: BOS on pivot 10 must appear at break bar 18');
  assert.equal(bosAt18.direction, 'BULLISH');
  assert.equal(
    ctxAt18.liquidity.volumeProfile.status,
    OBSERVATION_STATUS.UNAVAILABLE,
    '§4.3: Missing real volume must return UNAVAILABLE, never fabricated volume'
  );

  // 2. F-05 & F-06: 7-Dimensional Path Quality fixtures (turning points, wave segments, pullback depth/duration, amplitude)
  const anchorClose = 100;
  // Realized path: rises to peak 108 at step 4, pulls back to trough 103 at step 7 (depth = 5, duration = 3 bars), resumes to 112 at step 10
  const actualWaveCloses = [102, 104, 106, 108, 106, 104, 103, 106, 109, 112];
  const turns = extractSeriesTurningPoints([anchorClose, ...actualWaveCloses], 0.5);
  assert.equal(turns.length, 2, 'F-05: Must detect 1 PEAK (step 4) and 1 TROUGH (step 7)');
  assert.equal(turns[0].type, 'PEAK');
  assert.equal(turns[0].step, 4);
  assert.equal(turns[1].type, 'TROUGH');
  assert.equal(turns[1].step, 7);

  const pbStats = computePullbackAndRangeMetrics(anchorClose, actualWaveCloses, 2.0);
  assert.equal(pbStats.maxPullbackDepth, 5, 'F-06: Pullback depth from 108 to 103 must equal 5');
  assert.equal(pbStats.pullbackDurationBars, 3, 'F-06: Pullback duration from step 5 to 7 must equal 3 bars');

  // Compare wave-aware trajectory vs flat naive trajectory on the same actualWaveCloses
  const waveTrajPoints = actualWaveCloses.map((c) => ({ q10: c - 2, q50: c, q90: c + 2 }));
  const flatNaivePoints = actualWaveCloses.map(() => ({ q10: 96, q50: 100, q90: 104 }));

  const pqWave = evaluatePathQualityVector({
    anchorClose,
    trajPoints: waveTrajPoints,
    actualCandles: actualWaveCloses,
    atrAtAnchor: 2.0,
  });
  const pqNaive = evaluatePathQualityVector({
    anchorClose,
    trajPoints: flatNaivePoints,
    actualCandles: actualWaveCloses,
    atrAtAnchor: 2.0,
  });
  assert.equal(pqWave.schemaVersion, PATH_QUALITY_SCHEMA_VERSION);
  assert.equal(pqWave.turningPointAgreementPct, 100, 'Exact wave match must achieve 100% turning point agreement');
  assert.equal(pqWave.segmentDirectionSimilarityPct, 100, 'Exact wave match must achieve 100% segment direction similarity');
  assert.equal(pqWave.pullbackDepthErrorAtr, 0, 'Exact wave match must have 0 pullback depth error');
  assert.equal(pqWave.pullbackDurationErrorBars, 0, 'Exact wave match must have 0 pullback duration error');
  assert.ok(
    pqWave.pathQualityScore > pqNaive.pathQualityScore + 35,
    `Wave-accurate trajectory (${pqWave.pathQualityScore}) must score substantially higher than flat Naive (${pqNaive.pathQualityScore})`
  );

  // 3. F-07 & F-08: Walk-Forward Evaluator & ForecastEngine integration of 7D Path Quality & Market Context
  const historyBars = Array.from({ length: 220 }, (_, i) => {
    const wave = Math.sin(i / 5) * 4 + i * 0.15;
    const c = 2000 + wave;
    return {
      open_time_utc_ms: baseMs + i * stepMs,
      openTimeUtcMs: baseMs + i * stepMs,
      open: c - 0.8,
      high: c + 1.8,
      low: c - 1.8,
      close: c,
      volume: 120 + (i % 15) * 10,
      is_closed: true,
    };
  });
  const wfOut = evaluateWalkForward(historyBars, defaultForecastRegistry, {
    horizonBars: 10,
    includeAuxiliaryModels: false,
    skipBootstrap: true,
  });
  assert.ok(wfOut.evaluatedWindows > 0, 'Walk-forward must evaluate outer windows on 220 bars at H=10');
  assert.ok(wfOut.pathQualitySummary, 'Walk-forward output must include pathQualitySummary');
  assert.ok(Number.isFinite(wfOut.pathQualitySummary.pathQualityScore), 'pathQualitySummary must expose pathQualityScore');
  assert.ok(Number.isFinite(wfOut.naiveMetrics.pathQualityScore), 'naiveMetrics must expose pathQualityScore on same origins');

  const projOut = ForecastEngine.project(historyBars, {
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    horizonBars: 10,
    anchorNowMs: historyBars[historyBars.length - 1].open_time_utc_ms + stepMs,
  });
  assert.ok(projOut.marketContext, 'ForecastEngine.project must attach causal marketContext');
  assert.equal(projOut.marketContext.schemaVersion, MARKET_CONTEXT_ENGINE_VERSION);

  // 4. L-01, L-02, L-03 & O-03: Immutable Ledger evaluation with 7D Path Quality without mutating original snapshot hash
  const testLedger = new ForecastLedger('ci_test_p1_ledger_v1');
  testLedger.clear();
  const anchorBar = historyBars[199];
  const futureBars = historyBars.slice(200, 210);
  const snapEntry = testLedger.appendFromForecast(
    {
      ...projOut,
      symbolCode: 'XAUUSD',
      timeframe: 'M15',
      horizonBars: 10,
      anchorOpenTimeUtcMs: anchorBar.open_time_utc_ms,
      anchorClose: anchorBar.close,
      points: futureBars.map((b, idx) => ({
        stepAhead: idx + 1,
        openTimeUtcMs: b.open_time_utc_ms,
        q10: b.close - 5,
        q25: b.close - 2.5,
        q50: b.close,
        q75: b.close + 2.5,
        q90: b.close + 5,
      })),
    },
    { modelId: 'smc_prediction_js', modelName: 'SMC Prediction Engine' }
  );
  assert.ok(snapEntry?.forecastHash, 'L-01: Ledger must record immutable snapshot with SHA-256 hash');
  const hashBeforeEval = snapEntry.forecastHash;

  const evalEvents = testLedger.evaluateMaturedForecasts(
    historyBars.slice(0, 210),
    'XAUUSD',
    'M15'
  );
  assert.ok(evalEvents.length > 0, 'L-02: Ledger must evaluate matured checkpoints against subsequent closed candles');
  const terminalEv = evalEvents.find((e) => e.horizonStep === 10);
  assert.ok(terminalEv?.evaluationDetails?.pathQuality, 'L-02: Matured evaluationDetails must include 7D pathQuality');
  assert.ok(terminalEv.evaluationDetails.pathQualityScore >= 85, 'Exact trajectory match must yield high 7D pathQualityScore');

  const storedAfterEval = testLedger.loadEntries()[0];
  assert.equal(storedAfterEval.forecastHash, hashBeforeEval, 'L-01: Evaluation must never overwrite or mutate original snapshot hash');
  assert.equal(testLedger.verifyChain().valid, true, 'L-03: Snapshot SHA-256 hash chain must remain valid after evaluation');
  assert.equal(testLedger.verifyLifecycleChain().valid, true, 'L-03: Lifecycle SHA-256 hash chain must remain valid');

  const scorecards = testLedger.buildModelScorecards(20, 'XAUUSD');
  assert.equal(scorecards.length, 1);
  assert.ok(Number.isFinite(scorecards[0].meanPathQualityScore), 'Rolling scorecard must expose meanPathQualityScore');
  assert.equal(testLedger.getStorageStatus().localOnly, true, 'O-03: Ledger storage status must explicitly report localOnly');
  testLedger.clear();

  // 5. UI Verification for Backtest & Ledger Panels
  const backtestHtml = renderBacktestPanel(projOut, 2, true);
  assert.match(backtestHtml, /fc-path-quality-7d-card/, 'Backtest panel must render 7-Dimensional Path Quality summary card');
  assert.match(backtestHtml, /fc-market-context-card/, 'Backtest panel must render Causal Market Context summary card');
  assert.match(backtestHtml, /Path Q/, 'Backtest benchmark table must include Path Q column');

  const ledgerHtml = renderLedgerPanel(2, true);
  assert.match(ledgerHtml, /ذخیره محلی مرورگر/, 'Ledger panel must clearly disclose local browser storage limit');
});

test('FORECAST-P3-STRATEGY-BRIDGE-PURGED-WF-01: Controlled One-Way Forecast -> Strategy Bridge (S-01..S-06), Purged Walk-Forward + Embargo + Final Untouched Holdout, Regime Breakdown, and Portfolio Risk Controls', async () => {
  const {
    FORECAST_STRATEGY_BRIDGE_VERSION,
    BRIDGE_REJECTION_CODE,
    evaluateForecastStrategyBridge,
  } = await import('../host_subdomain/assets/js/strategy/forecastStrategyBridge.js');
  const {
    evaluateRiskRewardTradePlan,
    MINIMUM_REQUIRED_RR,
  } = await import('../host_subdomain/assets/js/strategy/riskRewardEngine.js');
  const {
    runClassicalStrategyBacktest,
    compareAllClassicalStrategies,
  } = await import('../host_subdomain/assets/js/strategy/signalBacktester.js');
  const { renderStrategyLabModal } = await import('../host_subdomain/assets/js/views/strategyLabView.js');
  const { state, saveCandlesToCache } = await import('../host_subdomain/assets/js/core/store.js');

  assert.equal(FORECAST_STRATEGY_BRIDGE_VERSION, 'forecast-strategy-bridge/1.0.0');
  assert.equal(MINIMUM_REQUIRED_RR, 2.0);

  // Build deterministic 160-bar series with clear confirmed swing low at 99.6 (bar 152, confirmed at 155)
  // and nearest confirmed swing high resistance at 109.5 (bar 142, confirmed at 145) with no intermediate swing highs between 101.2 and 109.5
  const baseMs = Date.UTC(2026, 2, 1, 0, 0, 0);
  const stepMs = 15 * 60 * 1000;
  const candles = [];
  for (let i = 0; i < 160; i++) {
    let c;
    if (i < 135) {
      c = 100.0 + Math.sin(i * 0.25) * 0.45; // Tight base range around 99.5..100.5 (highs <= 100.95 < 101.2)
    } else if (i <= 142) {
      c = 100.4 + (i - 135) * 1.25; // Clean rally up to swing high peak at i=142 (c=109.15, high=109.55)
    } else if (i <= 152) {
      c = 109.15 - (i - 142) * 0.92; // Clean pullback down to swing low trough at i=152 (c=99.95, low=99.55)
    } else {
      c = 99.95 + (i - 152) * 0.18; // Gentle recovery to 101.21 at i=159 (no new swing high formed)
    }
    const open = c - 0.15;
    const high = c + 0.4;
    const low = c - 0.4;
    candles.push({
      open_time_utc_ms: baseMs + i * stepMs,
      openTimeUtcMs: baseMs + i * stepMs,
      open,
      high,
      low,
      close: c,
      volume: 1000 + (i % 11) * 50,
      is_closed: true,
    });
  }
  const lastBar = candles[candles.length - 1];

  const makeMockForecast = (overrides = {}) => ({
    status: 'READY',
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    horizonBars: 10,
    inputHash: 'fnv1a_spotbrent_m15_160',
    anchorOpenTimeUtcMs: lastBar.open_time_utc_ms,
    anchorClose: lastBar.close,
    selectedChartModelId: 'structural_wave_js',
    selectionMode: 'AUTO_OOS_BEST',
    points: Array.from({ length: 10 }, (_, idx) => ({
      stepAhead: idx + 1,
      openTimeUtcMs: lastBar.open_time_utc_ms + (idx + 1) * stepMs,
      q10: lastBar.close - 1.5,
      q25: lastBar.close + idx * 0.4,
      q50: lastBar.close + (idx + 1) * 1.15, // Terminal Q50 = 101.2 + 11.5 = 112.7
      q75: lastBar.close + (idx + 1) * 1.35,
      q90: lastBar.close + (idx + 1) * 1.65,
    })),
    decisionSummary: {
      status: 'VALID',
      readinessState: 'READY',
      edgeStatus: 'PROVEN',
      selectionMode: 'AUTO_OOS_BEST',
      selectionTier: 'AUTO_STRICT',
      modelId: 'structural_wave_js',
      modelName: 'Structural Wave Forecast',
      modelVersion: '2.1.0',
      isBaseline: false,
      isExperimentalOnly: false,
      pathSemantics: 'JOINT_TRAJECTORY',
      confidence: 'HIGH',
      reasonCode: 'STRICT_OOS_WINNER',
      allowStrategy: true,
    },
    ...overrides,
  });

  // S-04: PROVISIONAL forecast must NEVER emit an actionable signal; allowResearchPreview emits preview-only object
  const provisionalFc = makeMockForecast({
    decisionSummary: {
      ...makeMockForecast().decisionSummary,
      status: 'PROVISIONAL',
      edgeStatus: 'NOT_PROVEN',
      selectionMode: 'AUTO_RELATIVE_PROVISIONAL',
      selectionTier: 'AUTO_RELATIVE',
      reasonCode: 'RELATIVE_CANDIDATE_UNPROVEN',
      allowStrategy: false,
    },
  });
  const s04Blocked = evaluateForecastStrategyBridge(provisionalFc, candles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    allowResearchPreview: false,
  });
  assert.equal(s04Blocked.passed, false, 'S-04: PROVISIONAL forecast must never pass Strategy Bridge');
  assert.equal(s04Blocked.status, 'no_trade');
  assert.equal(s04Blocked.actionable, false);
  assert.equal(s04Blocked.signal, null);
  assert.equal(s04Blocked.rejection_code, BRIDGE_REJECTION_CODE.FORECAST_PROVISIONAL_BLOCKED);

  const s04Preview = evaluateForecastStrategyBridge(provisionalFc, candles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    allowResearchPreview: true,
  });
  assert.equal(s04Preview.passed, false, 'S-04: Research preview must still be passed=false and status=no_trade');
  assert.equal(s04Preview.status, 'no_trade');
  assert.equal(s04Preview.signal, null);
  assert.ok(s04Preview.researchPreview, 'S-04: allowResearchPreview=true must populate researchPreview');
  assert.equal(s04Preview.researchPreview.isPreviewOnly, true);
  assert.equal(s04Preview.researchPreview.actionable, false);
  assert.match(s04Preview.researchPreview.warning, /NOT A VALID SIGNAL/);

  // Gate checks: DATA_NOT_READY, NO_EDGE, EXPERIMENTAL_MODEL, CONTEXT_MISMATCH, and STALE_ORIGIN
  const dataNotReadyRes = evaluateForecastStrategyBridge(
    makeMockForecast({
      status: 'DATA_NOT_READY',
      decisionSummary: { ...makeMockForecast().decisionSummary, status: 'DATA_NOT_READY', readinessState: 'INSUFFICIENT_HISTORY', allowStrategy: false },
    }),
    candles
  );
  assert.equal(dataNotReadyRes.rejection_code, BRIDGE_REJECTION_CODE.FORECAST_DATA_NOT_READY_BLOCKED);

  const expModelRes = evaluateForecastStrategyBridge(
    makeMockForecast({
      decisionSummary: {
        ...makeMockForecast().decisionSummary,
        modelId: 'chronos_bolt_tiny',
        isExperimentalOnly: true,
      },
    }),
    candles
  );
  assert.equal(expModelRes.rejection_code, BRIDGE_REJECTION_CODE.FORECAST_EXPERIMENTAL_MODEL_BLOCKED);

  const staleOriginRes = evaluateForecastStrategyBridge(
    makeMockForecast({
      anchorOpenTimeUtcMs: candles[candles.length - 5].open_time_utc_ms,
    }),
    candles
  );
  assert.equal(staleOriginRes.rejection_code, BRIDGE_REJECTION_CODE.FORECAST_STALE_ORIGIN);

  // S-03 & S-02: Closer real structural barrier must NEVER be skipped to fabricate R:R >= 2.0
  // Suppose entry = 100, stopLoss = 98 (risk = 2.0), and there is a close real resistance barrier at 101.8 (reward = 1.8 -> Gross R:R = 0.90)
  // AND a farther resistance barrier at 108.0 (reward = 8.0 -> R:R = 4.0).
  // `evaluateRiskRewardTradePlan` MUST select 101.8 as TP1 (nearest barrier) and reject with GROSS_RR_BELOW_MINIMUM / NET_RR_BELOW_MINIMUM!
  const s03Check = evaluateRiskRewardTradePlan(
    {
      side: 'long',
      entryPrice: 100.0,
      stopLossPrice: 98.0,
      explicitTargets: null,
    },
    {
      bar: { open: 99.8, high: 100.2, low: 99.5, close: 100.0, is_closed: true },
      barIndex: 50,
      atr: 1.2,
      ema20: 99.6,
      structure: {
        swingHighs: [
          { price: 101.8, index: 42 }, // Closer barrier (dist = 1.8 -> R:R = 0.9 < 2.0)
          { price: 108.0, index: 25 }, // Farther barrier (dist = 8.0 -> R:R = 4.0)
        ],
        swingLows: [{ price: 98.3, index: 45 }],
        resistances: [],
        supports: [],
      },
    },
    { minRequiredRR: 2.0, spreadBps: 4, commissionBps: 5, slippageBps: 2 }
  );
  assert.equal(s03Check.passed, false, 'S-03 & S-02: Setup with close structural barrier yielding R:R < 2.0 must be rejected');
  assert.equal(s03Check.take_profit_suggested[0], 101.8, 'S-03: TP1 must remain anchored to the nearest barrier (101.8) and never skip to 108.0');
  assert.equal(s03Check.rejection_code, 'GROSS_RR_BELOW_MINIMUM');

  // S-02: Even when Gross R:R >= 2.0 (e.g. Gross R:R = 2.05), round-trip Spread+Commission+Slippage pulling Net R:R < 2.0 must reject!
  const s02NetCheck = evaluateRiskRewardTradePlan(
    {
      side: 'long',
      entryPrice: 100.0,
      stopLossPrice: 99.0, // Gross risk = 1.0
      explicitTargets: null,
    },
    {
      bar: { open: 99.8, high: 100.1, low: 99.6, close: 100.0, is_closed: true },
      barIndex: 50,
      atr: 1.0,
      ema20: 99.8,
      structure: {
        swingHighs: [{ price: 102.05, index: 40 }], // Gross reward = 2.05 -> Gross R:R = 2.05 >= 2.0
        swingLows: [{ price: 99.2, index: 45 }],
        resistances: [],
        supports: [],
      },
    },
    { minRequiredRR: 2.0, spreadBps: 15, commissionBps: 15, slippageBps: 10 } // Friction pushes Net R:R < 2.0
  );
  assert.equal(s02NetCheck.passed, false, 'S-02: Setup with Gross R:R >= 2.0 but Net R:R < 2.0 after costs must be rejected');
  assert.equal(s02NetCheck.rejection_code, 'NET_RR_BELOW_MINIMUM');

  // S-01 & S-05: VALID + PROVEN forecast that also satisfies causal structure & Net R:R >= 2.0 emits a VALID signal scheduled strictly for NEXT_BAR_OPEN_ONLY
  const validBridgeRes = evaluateForecastStrategyBridge(makeMockForecast(), candles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    minRequiredRR: 2.0,
    spreadBps: 4,
    commissionBps: 5,
    slippageBps: 2,
  });
  assert.equal(validBridgeRes.passed, true, `S-05: VALID+PROVEN forecast with Net R:R >= 2.0 must pass bridge (got ${validBridgeRes.reason})`);
  assert.equal(validBridgeRes.status, 'VALID');
  assert.equal(validBridgeRes.actionable, true);
  assert.ok(validBridgeRes.signal, 'S-05: Bridge must emit validated signal object');
  assert.ok(validBridgeRes.signal.risk_reward.net_rr >= 2.0, 'S-02/S-05: Emitted bridge signal must have Net R:R >= 2.0');
  assert.equal(validBridgeRes.signal.bar_index, candles.length - 1, 'S-01: Signal decision bar must be latest closed candle');
  assert.equal(validBridgeRes.signal.executionPlan.entryExecutionPolicy, 'NEXT_BAR_OPEN_ONLY', 'S-01: Entry must be scheduled strictly on next bar open');
  assert.equal(validBridgeRes.signal.executionPlan.nextBarIndex, candles.length, 'S-01: nextBarIndex must be decisionBarIndex + 1');
  assert.equal(validBridgeRes.signal.forecastProvenance.modelId, 'structural_wave_js');
  assert.equal(validBridgeRes.signal.forecastProvenance.inputHash, 'fnv1a_spotbrent_m15_160');

  // S-06 & Purged Walk-Forward + Final Untouched Holdout + Regime Breakdown + Portfolio Risk Policy:
  // Classical strategies run 100% independently even when Forecast is missing or DATA_NOT_READY
  const prevForecast = state._lastForecastResult;
  state._lastForecastResult = null;
  const spotBrentRaw = JSON.parse(
    await readFile(new URL('./fixtures/spotbrent_m15_sample.json', import.meta.url), 'utf8')
  );
  const spotBrentCandles = Array.isArray(spotBrentRaw) ? spotBrentRaw : spotBrentRaw.candles;

  const btRes = runClassicalStrategyBacktest(spotBrentCandles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
    strategyId: 'trend_pullback_v1',
    includeSplit: true,
    includeSensitivity: true,
    maxDrawdownHaltPct: 25,
  });
  assert.equal(btRes.status, 'READY', 'S-06: Classical strategy backtest must run independently when Forecast is null');
  assert.ok(btRes.inSampleOutOfSample, 'Must retain 70/30 In-Sample / Out-of-Sample report');
  assert.ok(btRes.purgedWalkForward, 'Must compute Purged Walk-Forward + Embargo + Final Untouched Holdout on >=90 bars');
  assert.equal(btRes.purgedWalkForward.protocol, 'PURGED_WALK_FORWARD_WITH_UNTOUCHED_HOLDOUT_V1');
  assert.ok(btRes.purgedWalkForward.purgeBars >= 2 && btRes.purgedWalkForward.embargoBars >= 2);
  assert.equal(btRes.purgedWalkForward.folds.length, 3);
  // Verify disjoint fold boundaries separated by gapBarsBetweenFolds and final holdout separated by gapBarsBetweenFolds
  const gap = btRes.purgedWalkForward.gapBarsBetweenFolds;
  for (let f = 1; f < btRes.purgedWalkForward.folds.length; f++) {
    const prevFold = btRes.purgedWalkForward.folds[f - 1];
    const curFold = btRes.purgedWalkForward.folds[f];
    assert.equal(curFold.startBarIndex - prevFold.endBarIndex, gap, 'Purged Walk-Forward folds must be separated by purge + embargo bars');
  }
  const lastFold = btRes.purgedWalkForward.folds[btRes.purgedWalkForward.folds.length - 1];
  assert.ok(
    btRes.purgedWalkForward.untouchedHoldout.startBarIndex - lastFold.endBarIndex >= gap,
    'Final Untouched Holdout must be separated from Walk-Forward folds by at least purge + embargo bars'
  );
  assert.equal(btRes.regimeBreakdown.length, 5, 'Must report causal regime breakdown across all 5 regime buckets');
  assert.equal(btRes.portfolioRiskPolicy.scope, 'SINGLE_INSTRUMENT_BACKTEST');
  assert.equal(btRes.portfolioRiskPolicy.multiSymbolCorrelationSupported, false);
  assert.equal(btRes.portfolioRiskPolicy.sizingMode, 'UNIT_APPROXIMATION');
  assert.equal(btRes.portfolioRiskPolicy.maxDrawdownHaltPct, 25);

  const cmpAll = compareAllClassicalStrategies(spotBrentCandles, {
    symbolCode: 'SPOTBRENT',
    timeframe: 'M15',
  });
  assert.equal(cmpAll.rows.length, 5, 'S-06: All 5 classical strategies must compare independently without Forecast');

  // Verify Strategy Lab modal renders Forecast Bridge card and Purged Walk-Forward card
  const prevModal = state.activeModal;
  const prevCache = state.candleCache['SPOTBRENT_tvdatafeed_M15'];
  state.activeModal = 'strategy-lab';
  state._lastForecastResult = makeMockForecast();
  saveCandlesToCache('SPOTBRENT_tvdatafeed_M15', candles, 5000, 'SPOTBRENT');
  const modalHtml = renderStrategyLabModal(
    { symbolCode: 'SPOTBRENT', provider: 'tvdatafeed', timeframe: 'M15' },
    { getCurrentLanguage: () => 'en', t: (k) => k }
  );
  state.activeModal = prevModal;
  state._lastForecastResult = prevForecast;
  if (prevCache === undefined) delete state.candleCache['SPOTBRENT_tvdatafeed_M15'];
  else saveCandlesToCache('SPOTBRENT_tvdatafeed_M15', prevCache, 5000, 'SPOTBRENT');

  assert.match(modalHtml, /Controlled Forecast → Strategy Bridge/);
  assert.match(modalHtml, /BRIDGE VALID/);
  assert.match(modalHtml, /Purged Walk-Forward \+ Embargo & Final Untouched Holdout/);
  assert.match(modalHtml, /Single-instrument causal backtest/);
});

test('FORECAST-MASTER-PLAN-DELTA-01: coordinate-bound trajectory behavioral events, 3-part behavior scenario contract, OOS regime breakdown & final holdout, and strict AUTO Relative pathQualityScore guard', async () => {
  const {
    TRAJECTORY_EVENT_TYPES,
    TRAJECTORY_EVENT_SOURCE,
    buildCausalMarketContext,
    evaluatePathQualityVector,
    extractTrajectoryBehavioralEvents,
    buildBehaviorScenarioContract,
  } = await import('../host_subdomain/assets/js/forecast/marketContextEngine.js');
  const { resolveRelativeCandidate, buildDecisionSummary } = await import(
    '../host_subdomain/assets/js/forecast/decisionLayer.js'
  );
  const { ForecastEngine } = await import('../host_subdomain/assets/js/forecast/forecastEngine.js');
  const { renderOverviewPanel, renderBacktestPanel } = await import(
    '../host_subdomain/assets/js/views/forecastView.js'
  );

  // 1) Verify all 8 event types and 2 source types exist
  assert.deepEqual(Object.keys(TRAJECTORY_EVENT_TYPES).sort(), [
    'BREAKOUT',
    'PULLBACK',
    'RANGE_FORMATION',
    'RESISTANCE_TEST',
    'RETEST',
    'REVERSAL',
    'SUPPORT_REACTION',
    'TREND_CONTINUATION',
  ]);
  assert.equal(TRAJECTORY_EVENT_SOURCE.MODEL_NATIVE, 'MODEL_NATIVE');
  assert.equal(TRAJECTORY_EVENT_SOURCE.SYSTEM_DERIVED, 'SYSTEM_DERIVED');

  // 2) Verify evaluatePathQualityVector computes falsePositiveEventRate and missedEventRate
  const predCloses = [100.5, 101.2, 102.0, 101.0, 100.2, 101.5, 102.8, 103.5, 102.4, 104.0];
  const actCloses = [100.4, 101.1, 101.9, 100.9, 100.3, 101.4, 102.7, 103.4, 102.5, 103.9];
  const pqVec = evaluatePathQualityVector({
    anchorClose: 100.0,
    trajPoints: predCloses.map((q50, idx) => ({ stepAhead: idx + 1, q10: q50 - 0.6, q50, q90: q50 + 0.6 })),
    actualCandles: actCloses,
    atrAtAnchor: 0.8,
  });
  assert.equal(typeof pqVec.falsePositiveEventRate, 'number');
  assert.equal(typeof pqVec.missedEventRate, 'number');
  assert.ok(pqVec.falsePositiveEventRate >= 0 && pqVec.falsePositiveEventRate <= 1);
  assert.ok(pqVec.missedEventRate >= 0 && pqVec.missedEventRate <= 1);

  // 3) Run full ForecastEngine.project on real SPOTBRENT M15 fixture and verify pathEvents, behaviorScenarios, regimeBreakdown, worstRegimeSubgroup, finalHoldoutSummary
  const spotBrentRaw = JSON.parse(
    await readFile(new URL('./fixtures/spotbrent_m15_sample.json', import.meta.url), 'utf8')
  );
  const candles = (Array.isArray(spotBrentRaw) ? spotBrentRaw : spotBrentRaw.candles).slice(0, 260);
  const fc = ForecastEngine.project(candles, {
    symbolCode: 'SPOTBRENT',
    providerId: 'tvdatafeed',
    timeframe: 'M15',
    horizonBars: 15,
    selectedModelId: 'structural_wave_js',
  });

  assert.ok(Array.isArray(fc.pathEvents) && fc.pathEvents.length > 0, 'Forecast result must emit coordinate-bound pathEvents');
  for (const ev of fc.pathEvents) {
    assert.ok(ev.type in TRAJECTORY_EVENT_TYPES, `Event type ${ev.type} must be in TRAJECTORY_EVENT_TYPES`);
    assert.ok(
      ev.sourceType === TRAJECTORY_EVENT_SOURCE.MODEL_NATIVE || ev.sourceType === TRAJECTORY_EVENT_SOURCE.SYSTEM_DERIVED,
      'Event sourceType must be MODEL_NATIVE or SYSTEM_DERIVED'
    );
    assert.ok(Number.isFinite(ev.stepStart) && ev.stepStart >= 1);
    assert.ok(Number.isFinite(ev.stepEnd) && ev.stepEnd >= ev.stepStart);
    assert.ok(Number.isFinite(ev.priceLevel) && ev.priceLevel > 0);
    assert.ok(Array.isArray(ev.priceRange) && ev.priceRange.length === 2);
    assert.ok(Number.isFinite(ev.invalidationLevel) && ev.invalidationLevel > 0);
    assert.ok(typeof ev.triggerCondition === 'string' && ev.triggerCondition.length > 0);
    assert.ok(typeof ev.invalidationCondition === 'string' && ev.invalidationCondition.length > 0);
  }

  // 4) Verify 3-Part Behavior Scenario Contract (basePath, alternativePath, invalidationZone)
  assert.ok(fc.behaviorScenarios, 'Forecast result must include behaviorScenarios contract');
  assert.equal(fc.behaviorScenarios.contractVersion, 'behavior-scenario/1.0.0');
  assert.ok(fc.behaviorScenarios.basePath && Number.isFinite(fc.behaviorScenarios.basePath.targetPrice));
  assert.ok(fc.behaviorScenarios.alternativePath && Number.isFinite(fc.behaviorScenarios.alternativePath.targetPrice));
  assert.ok(fc.behaviorScenarios.invalidationZone && Number.isFinite(fc.behaviorScenarios.invalidationZone.triggerLevel));

  // Verify uncalibrated probabilities strictly remain null (never fabricated)
  const uncalScenarios = buildBehaviorScenarioContract({
    points: fc.points,
    anchorClose: fc.anchorClose,
    marketContext: buildCausalMarketContext(candles),
    scenarios: [
      { id: 'SCENARIO_A', bias: 'bull', status: 'NOT_ESTIMABLE_LOW_SAMPLE', probability: null },
      { id: 'SCENARIO_B', bias: 'bear', status: 'NOT_ESTIMABLE_LOW_SAMPLE', probability: null },
    ],
    pathEvents: fc.pathEvents,
  });
  assert.equal(uncalScenarios.basePath.calibratedProbability, null, 'Uncalibrated scenario probability must be strictly null');
  assert.equal(uncalScenarios.alternativePath.calibratedProbability, null, 'Uncalibrated alternative probability must be strictly null');

  // 5) Verify Walk-Forward OOS regimeBreakdown, worstRegimeSubgroup, finalHoldoutSummary, and event FP/Missed rates
  assert.ok(Array.isArray(fc.walkForward.regimeBreakdown) && fc.walkForward.regimeBreakdown.length > 0);
  assert.ok(fc.walkForward.worstRegimeSubgroup && typeof fc.walkForward.worstRegimeSubgroup.regime === 'string');
  assert.ok(fc.walkForward.finalHoldoutSummary && fc.walkForward.finalHoldoutSummary.windowCount >= 1);
  assert.equal(typeof fc.walkForward.pathQualitySummary.falsePositiveEventRate, 'number');
  assert.equal(typeof fc.walkForward.pathQualitySummary.missedEventRate, 'number');

  // 6) Verify D-06 / Master Plan §6.5 strict pathQualityScore guard in AUTO Relative
  const mockWfPoorPathQ = {
    evaluatedWindows: 35,
    effectiveSampleSize: 28,
    wisNaiveDistributional: 0.65,
    conformalCalibration: { calibrationStatus: 'CALIBRATED_NORMALIZED' },
    naiveMetrics: { pathQualityScore: 52.0 },
    modelBenchmarks: [
      {
        modelId: 'native_arima_diff',
        modelName: 'ARIMA-LogReturn (Native JS)',
        status: 'SUCCESS',
        windows: 35,
        evaluatedWindows: 35,
        wis: 0.45,
        rMae: 0.96,
        mase: 0.96,
        coverage80Pct: 80,
        pathQualityScore: 38.0, // Materially worse than naivePathQualityScore (52.0)!
        naivePathQualityScore: 52.0,
      },
    ],
  };
  const mockTrajs = [
    {
      modelId: 'native_arima_diff',
      modelName: 'ARIMA-LogReturn (Native JS)',
      status: 'SUCCESS',
      points: fc.points,
    },
    {
      modelId: 'naive_persistence',
      modelName: 'Naive Persistence (Random Walk)',
      status: 'SUCCESS',
      points: fc.points,
    },
  ];
  const relCand = resolveRelativeCandidate(mockWfPoorPathQ, mockTrajs);
  assert.equal(
    relCand,
    null,
    'D-06 / §6.5: AUTO Relative must reject a candidate whose pathQualityScore is materially worse than naivePathQualityScore'
  );
  const dsPoor = buildDecisionSummary(
    {
      status: 'NO_EDGE',
      anchorClose: fc.anchorClose,
      horizonBars: 15,
      selectedChartModelId: 'naive_persistence',
      walkForward: mockWfPoorPathQ,
      modelTrajectories: mockTrajs,
      points: fc.points,
    },
    { requestedModelId: 'AUTO' }
  );
  assert.equal(dsPoor.status, 'NO_EDGE');
  assert.equal(dsPoor.modelId, 'naive_persistence');

  // 7) Verify UI rendering of pathEvents, behaviorScenarios, and regimeBreakdown/finalHoldoutSummary in Simple & Research modes
  const simpleHtml = renderOverviewPanel(fc, { symbolCode: 'SPOTBRENT', timeframe: 'M15' }, 2, false, 'independent', 'simple');
  assert.match(simpleHtml, /data-testid="fc-simple-behavior-card"/);
  const researchHtml = renderOverviewPanel(fc, { symbolCode: 'SPOTBRENT', timeframe: 'M15' }, 2, false, 'independent', 'research');
  assert.match(researchHtml, /data-testid="fc-path-events-card"/);
  assert.match(researchHtml, /data-testid="fc-behavior-scenarios-card"/);
  const backtestHtml = renderBacktestPanel(fc, 2, false);
  assert.match(backtestHtml, /data-testid="fc-regime-holdout-card"/);
  assert.match(backtestHtml, /Event FP \/ Missed/);
});

test('FCST-LEDGER-03-CLOUD-SYNC-01: ForecastLedger mergeCloudSnapshot bidirectional cloud sync, multi-device SHA-256 chain integrity, API endpoint & migration verification', async () => {
  const { ForecastLedger } = await import('../host_subdomain/assets/js/forecast/forecastLedger.js');
  const { ForecastEngine } = await import('../host_subdomain/assets/js/forecast/forecastEngine.js');
  const { renderLedgerPanel } = await import('../host_subdomain/assets/js/views/forecastView.js');

  const spotBrentRaw = JSON.parse(
    await readFile(new URL('./fixtures/spotbrent_m15_sample.json', import.meta.url), 'utf8')
  );
  const candles = (Array.isArray(spotBrentRaw) ? spotBrentRaw : spotBrentRaw.candles).slice(0, 260);
  const fcA = ForecastEngine.project(candles.slice(0, 220), {
    symbolCode: 'SPOTBRENT',
    providerId: 'tvdatafeed',
    timeframe: 'M15',
    horizonBars: 10,
    selectedModelId: 'structural_wave_js',
  });
  const fcB = ForecastEngine.project(candles.slice(0, 240), {
    symbolCode: 'SPOTBRENT',
    providerId: 'tvdatafeed',
    timeframe: 'M15',
    horizonBars: 10,
    selectedModelId: 'smc_prediction_js',
  });

  // Device A records a batch of 2 models and evaluates maturity
  const ledgerA = new ForecastLedger('ci_test_ledger_dev_a', 'ci_test_lc_dev_a');
  ledgerA.clear();
  const batchA = ledgerA.appendBatchFromForecast(fcA, ['structural_wave_js', 'naive_persistence'], {
    recordedAtUtcMs: 1730000000000,
  });
  assert.equal(batchA.entries.length, 2, 'Device A must record 2 batch entries');
  const maturedEventsA = ledgerA.evaluateMaturedForecasts(candles.slice(0, 245), 'SPOTBRENT', 'M15');
  assert.ok(maturedEventsA.length > 0, 'Device A must evaluate matured lifecycle events');

  // Device B starts independently and records a snapshot on a later candle
  const ledgerB = new ForecastLedger('ci_test_ledger_dev_b', 'ci_test_lc_dev_b');
  ledgerB.clear();
  const entryB = ledgerB.appendFromForecast(fcB, {
    modelId: 'smc_prediction_js',
    recordedAtUtcMs: 1730003600000,
    generatedAtUtcMs: 1730003600000,
  });
  assert.ok(entryB && entryB.forecastHash, 'Device B must record independent snapshot');
  assert.equal(entryB.syncedToCloud, false);

  // Merge Device A's cloud snapshot into Device B
  const remoteEntriesFromA = ledgerA.loadEntries();
  const remoteEventsFromA = ledgerA.loadLifecycleEvents();
  const mergeRes = ledgerB.mergeCloudSnapshot(remoteEntriesFromA, remoteEventsFromA);

  assert.equal(mergeRes.addedEntries, 2, 'Device B must merge 2 new entries from Device A cloud snapshot');
  assert.equal(mergeRes.totalEntries, 3, 'Device B must hold all 3 combined entries (2 from A + 1 from B)');
  assert.ok(mergeRes.addedEvents >= 2, 'Device B must merge lifecycle events from Device A');

  // Re-merging identical cloud snapshot must be idempotent (zero duplicates)
  const idempotentRes = ledgerB.mergeCloudSnapshot(remoteEntriesFromA, remoteEventsFromA);
  assert.equal(idempotentRes.addedEntries, 0, 'Idempotent cloud merge must add 0 duplicate entries');
  assert.equal(idempotentRes.addedEvents, 0, 'Idempotent cloud merge must add 0 duplicate lifecycle events');
  assert.equal(idempotentRes.totalEntries, 3);

  // Tampered remote entry must be rejected by cryptographic hash verification
  const tamperedRemote = [
    {
      ...remoteEntriesFromA[0],
      forecastHash: 'f'.repeat(64),
      terminalMedian: 999999,
    },
  ];
  const tamperRes = ledgerB.mergeCloudSnapshot(tamperedRemote, []);
  assert.equal(tamperRes.addedEntries, 0, 'Tampered cloud entry with invalid SHA-256 hash must be rejected');

  // Multi-device merged chain verification must pass for both entries and lifecycle events
  const chainAudit = ledgerB.verifyChain();
  assert.equal(chainAudit.valid, true, `Merged multi-device entry chain must be valid: ${chainAudit.reason}`);
  const lcAudit = ledgerB.verifyLifecycleChain();
  assert.equal(lcAudit.valid, true, `Merged multi-device lifecycle chain must be valid: ${lcAudit.reason}`);

  // Mark all synced and verify syncedToCloud flag
  ledgerB.markSynced();
  const finalEntriesB = ledgerB.loadEntries();
  assert.ok(finalEntriesB.every((e) => e.syncedToCloud === true), 'All entries must be marked syncedToCloud=true');

  // Verify SQL migration 005 and PHP endpoint forecast_ledger_sync.php exist and contain required schemas
  const sql005 = await readFile(
    new URL('../host_subdomain/migrations/005_phase4_forecast_ledger_sync.sql', import.meta.url),
    'utf8'
  );
  assert.match(sql005, /CREATE TABLE IF NOT EXISTS prediction_ledger_entries/);
  assert.match(sql005, /CREATE TABLE IF NOT EXISTS prediction_ledger_lifecycle/);

  const phpEndpoint = await readFile(
    new URL('../host_subdomain/api/v1/forecast_ledger_sync.php', import.meta.url),
    'utf8'
  );
  assert.match(phpEndpoint, /prediction_ledger_entries/);
  assert.match(phpEndpoint, /prediction_ledger_lifecycle/);
  assert.match(phpEndpoint, /status_forecast_ledger_synced/);

  // Verify renderLedgerPanel renders Cloud Sync status badge and button
  const ledgerHtml = renderLedgerPanel(2, false);
  assert.match(ledgerHtml, /data-testid="fc-ledger-cloud-badge"/);
  assert.match(ledgerHtml, /data-action="refresh-forecast-ledger"/);
  assert.match(ledgerHtml, /Cloud Sync/);

  ledgerA.clear();
  ledgerB.clear();
});

test('LEDGER-CLICK-TO-CHART-REPLAY-01: clicking a recorded 15-bar forecast ledger entry overlays strictly the 15 predicted candles at anchorOpenTimeUtcMs onto the 30+ realized chart candles and scrolls viewport to the forecast window', async () => {
  const { ForecastEngine } = await import('../host_subdomain/assets/js/forecast/forecastEngine.js');
  const { ForecastLedger, defaultForecastLedger } = await import(
    '../host_subdomain/assets/js/forecast/forecastLedger.js'
  );
  const {
    buildChartForecastPayloadFromLedgerEntry,
    evaluateOnChartForecastProgress,
    isStructuralForecastMatchingTab,
  } = await import('../host_subdomain/assets/js/core/store.js');
  const { renderLedgerPanel } = await import('../host_subdomain/assets/js/views/forecastView.js');

  // Build 420 closed M15 candles ending well in the past so all bars are closed
  const stepMs = 15 * 60 * 1000;
  const totalBars = 420;
  const baseMs = Date.UTC(2026, 0, 5, 8, 0, 0);
  const fullCandles = [];
  let price = 2650;
  for (let i = 0; i < totalBars; i++) {
    const drift = Math.sin(i / 9) * 1.4 + (i % 5 === 0 ? 0.45 : -0.2);
    const open = price;
    const close = Number((open + drift).toFixed(2));
    const high = Number((Math.max(open, close) + 1.1).toFixed(2));
    const low = Number((Math.min(open, close) - 1.1).toFixed(2));
    price = close;
    fullCandles.push({
      open_time_utc_ms: baseMs + i * stepMs,
      open,
      high,
      low,
      close,
      volume: 150 + (i % 40) * 5,
      is_closed: true,
    });
  }

  // Suppose the forecast of horizonBars = 15 was recorded at candle index 359 (so 60 real candles formed afterwards: 360..419)
  const originIdxExpected = 359;
  const historyAtForecastTime = fullCandles.slice(0, originIdxExpected + 1);
  const fc15 = ForecastEngine.project(historyAtForecastTime, {
    symbolCode: 'XAUUSD',
    providerId: 'tvdatafeed',
    timeframe: 'M15',
    horizonBars: 15,
    selectedModelId: 'damped_trend',
    skipBootstrap: true,
    bypassWalkForwardCache: true,
  });

  const testLedger = new ForecastLedger('ci_test_click_chart_ledger', 'ci_test_click_chart_lc');
  testLedger.clear();
  const recordedEntry = testLedger.appendFromForecast(fc15, {
    modelId: 'damped_trend',
    recordedAtUtcMs: historyAtForecastTime[historyAtForecastTime.length - 1].open_time_utc_ms + stepMs,
    generatedAtUtcMs: historyAtForecastTime[historyAtForecastTime.length - 1].open_time_utc_ms + stepMs,
  });
  assert.ok(recordedEntry && recordedEntry.forecastHash, 'Ledger must record 15-bar forecast snapshot');
  assert.equal(recordedEntry.horizonBars, 15);
  assert.equal(recordedEntry.stepPoints.length, 15);

  // Build chart replay payload when 60 subsequent candles have elapsed (fullCandles has 420 bars)
  const replayBuilt = buildChartForecastPayloadFromLedgerEntry(recordedEntry, {
    candles: fullCandles,
    symbolCode: 'XAUUSD',
    timeframe: 'M15',
    provider: 'tvdatafeed',
    visibleCount: 48,
    renderMode: 'FAN_CHART',
  });

  assert.ok(replayBuilt && replayBuilt.payload, 'Must build chart forecast payload from ledger entry');
  assert.equal(replayBuilt.originIdx, originIdxExpected, 'Must anchor at exact historical candle index 359');
  assert.equal(replayBuilt.horizonBars, 15, 'Forecast horizon must remain strictly 15 bars');
  assert.equal(
    replayBuilt.payload.forecast.length,
    15,
    'Must overlay strictly the 15 predicted candles and never fabricate extra forecast bars beyond 15'
  );
  assert.equal(replayBuilt.elapsedBars, 60, '60 real candles have formed after the 15-bar forecast origin');
  assert.ok(
    replayBuilt.scrollOffset > 0,
    'Must scroll chart back in time (scrollOffset > 0) so the historical forecast window is centered in viewport'
  );

  // Verify the visible viewport [startIdx, endIdx) contains both originIdx and the 15 predicted candles + subsequent real candles
  const visibleCount = 48;
  const endIdx = fullCandles.length - replayBuilt.scrollOffset;
  const startIdx = endIdx - visibleCount;
  assert.ok(
    startIdx <= originIdxExpected && originIdxExpected + 15 < endIdx,
    `Viewport [${startIdx}..${endIdx}) must frame originIdx (${originIdxExpected}), the 15 forecast bars (${originIdxExpected + 1}..${originIdxExpected + 15}), and subsequent real candles`
  );

  // Verify tab matching and on-chart realized comparison evaluation
  const mockTab = {
    symbolCode: 'XAUUSD',
    provider: 'tvdatafeed',
    timeframe: 'M15',
    candles: fullCandles,
    visibleCount: 48,
    scrollOffset: replayBuilt.scrollOffset,
    showStructuralForecast: true,
    structuralForecast: replayBuilt.payload,
    forecastHorizonBars: 30, // even if tab preference was 30, 15-bar ledger snapshot replay must match!
    structuralForecastHorizonBars: 30,
    structuralForecastModel: 'AUTO',
  };
  assert.equal(
    isStructuralForecastMatchingTab(mockTab, replayBuilt.payload),
    true,
    'isStructuralForecastMatchingTab must accept replayed historical ledger snapshot'
  );

  const progress = evaluateOnChartForecastProgress(fullCandles, replayBuilt.payload, 'M15', 'XAUUSD');
  assert.ok(progress, 'evaluateOnChartForecastProgress must evaluate replayed historical snapshot');
  assert.equal(progress.originIdx, originIdxExpected);
  assert.equal(progress.elapsedBars, 60, 'Must report 60 elapsed real candles since origin');
  assert.equal(progress.horizonBars, 15, 'Horizon is strictly 15 bars');
  assert.equal(
    progress.evaluatedBars,
    15,
    'Must compare strictly the 15 predicted bars against the 15 realized bars and leave bars 16..60 as pure realized candles'
  );
  assert.equal(progress.items.length, 15);
  assert.equal(progress.items[0].candleIdx, originIdxExpected + 1);
  assert.equal(progress.items[14].candleIdx, originIdxExpected + 15);

  // Verify renderLedgerPanel includes view-ledger-entry-on-chart clickable rows and buttons
  defaultForecastLedger.appendFromForecast(fc15, {
    modelId: 'damped_trend',
    recordedAtUtcMs: historyAtForecastTime[historyAtForecastTime.length - 1].open_time_utc_ms + stepMs,
    generatedAtUtcMs: historyAtForecastTime[historyAtForecastTime.length - 1].open_time_utc_ms + stepMs,
  });
  const htmlFa = renderLedgerPanel(2, true, mockTab);
  assert.match(htmlFa, /data-action="view-ledger-entry-on-chart"/);
  assert.match(htmlFa, /نمایش روی چارت/);

  testLedger.clear();
  defaultForecastLedger.clear();
});

