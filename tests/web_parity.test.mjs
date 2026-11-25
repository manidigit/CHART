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






