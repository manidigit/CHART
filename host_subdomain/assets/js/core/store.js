import { TimeframeAggregator } from '../algorithms/timeframeAggregator.js';

export const BASE_SYMBOLS = [
  {
    chartId: 'chart_xauusd_main',
    symbolCode: 'XAUUSD',
    customTitle: null,
    decimals: 2,
    inWatchlist: true,
    activeProvider: 'twelve_data',
    allowedProviders: ['twelve_data', 'tvdatafeed', 'dukascopy', 'yahoo_finance'],
    timeframe: 'M15',
  },
  {
    chartId: 'chart_spotbrent_main',
    symbolCode: 'SPOTBRENT',
    customTitle: null,
    decimals: 3,
    inWatchlist: true,
    activeProvider: 'tvdatafeed',
    allowedProviders: ['tvdatafeed', 'dukascopy', 'twelve_data', 'eia_brent_spot', 'yahoo_finance'],
    timeframe: 'M15',
  },
  {
    chartId: 'chart_brent_futures',
    symbolCode: 'BRENT_FUTURES',
    customTitle: null,
    decimals: 2,
    inWatchlist: false,
    activeProvider: 'yahoo_finance',
    allowedProviders: ['yahoo_finance', 'tvdatafeed', 'dukascopy', 'eia_brent_spot'],
    timeframe: 'M15',
  },
  {
    chartId: 'chart_xagusd_spot',
    symbolCode: 'XAGUSD',
    customTitle: null,
    decimals: 3,
    inWatchlist: false,
    activeProvider: 'twelve_data',
    allowedProviders: ['twelve_data', 'dukascopy', 'yahoo_finance'],
    timeframe: 'M15',
  },
  {
    chartId: 'chart_eurusd_spot',
    symbolCode: 'EURUSD',
    customTitle: null,
    decimals: 4,
    inWatchlist: false,
    activeProvider: 'twelve_data',
    allowedProviders: ['twelve_data', 'dukascopy', 'yahoo_finance'],
    timeframe: 'M15',
  },
];

export const candleCache = new Map();

export function isOtcWeekendClosedUtc(epochMs, symbolCode) {
  const code = String(symbolCode || '').trim().toUpperCase();
  if (!['XAUUSD', 'XAGUSD', 'EURUSD', 'SPOTBRENT', 'BRENT_FUTURES'].includes(code)) return false;
  const d = new Date(Number(epochMs));
  const dow = d.getUTCDay(); // 0 = Sun, 5 = Fri, 6 = Sat
  const hr = d.getUTCHours();
  if (dow === 6) return true;
  if (dow === 5 && hr >= 22) return true;
  if (dow === 0 && hr < 22) return true;
  return false;
}

export function filterSyntheticWeekendAndCombCandles(candles, symbolCode, timeframe) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const tf = String(timeframe || 'M15').toUpperCase();
  if (tf === 'D1') return candles;

  const afterWeekend = candles.filter((c) => {
    const ms = Number(c.open_time_utc_ms);
    if (!isOtcWeekendClosedUtc(ms, symbolCode)) return true;
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const vol = Number(c.volume || 0);
    const relRange = open > 0 ? Math.abs(high - low) / open : 0;
    return !(vol <= 0 && relRange < 0.0005);
  });

  if (afterWeekend.length < 4) return afterWeekend;
  const dropIndices = new Set();
  let runStart = 0;
  for (let i = 1; i <= afterWeekend.length; i++) {
    const prev = afterWeekend[runStart];
    const curr = i < afterWeekend.length ? afterWeekend[i] : null;
    const sameSyntheticCluster =
      curr !== null &&
      Number(curr.volume || 0) <= 0 &&
      Number(prev.volume || 0) <= 0 &&
      Number(prev.open) > 0 &&
      Math.abs(Number(curr.open) - Number(prev.open)) / Number(prev.open) < 0.00001 &&
      Math.abs(Number(curr.high) - Number(curr.low)) / Number(curr.open) < 0.00018 &&
      Math.abs(Number(prev.high) - Number(prev.low)) / Number(prev.open) < 0.00018;

    if (!sameSyntheticCluster) {
      const runLen = i - runStart;
      if (runLen >= 3) {
        for (let k = runStart; k < i; k++) dropIndices.add(k);
      }
      runStart = i;
    }
  }
  if (dropIndices.size === 0) return afterWeekend;
  return afterWeekend.filter((_, idx) => !dropIndices.has(idx));
}

export const state = {
  isDarkTheme: (localStorage.getItem('ci_theme') || 'dark') === 'dark',
  isOwnerRegistered: Boolean(localStorage.getItem('ci_owner_username')),
  isAuthenticated: false,
  ownerUsername: localStorage.getItem('ci_owner_username') || '',
  ownerEmail: localStorage.getItem('ci_owner_email') || '',
  authMode: 'login',
  authErrorKey: null,
  authInfoKey: null,
  statusBannerKey: null,
  currentScreen: 'watchlist',
  desktopSidePanel: 'watchlist',
  symbols: [],
  openTabs: [],
  activeTabId: null,
  chartPreferences: loadChartPreferences(),
  showAddSymbolModal: false,
};

export function loadChartPreferences() {
  const defaults = {
    bullColor: '#26A69A',
    bearColor: '#EF5350',
    trendColor: '#2962FF',
    hlineColor: '#38BDF8',
    vlineColor: '#F59E0B',
    candleFetchLimit: 500,
  };
  try {
    const saved = JSON.parse(localStorage.getItem('ci_chart_preferences') || '{}');
    const merged = { ...defaults, ...saved };
    if (merged.bullColor === '#10B981') merged.bullColor = '#26A69A';
    if (merged.bearColor === '#F43F5E') merged.bearColor = '#EF5350';
    merged.candleFetchLimit = Math.max(40, Math.min(5000, Number(merged.candleFetchLimit) || 500));
    return merged;
  } catch (_) {
    return defaults;
  }
}

export function saveChartPreferences(prefs) {
  state.chartPreferences = { ...state.chartPreferences, ...prefs };
  state.chartPreferences.candleFetchLimit = Math.max(
    40,
    Math.min(5000, Number(state.chartPreferences.candleFetchLimit) || 500)
  );
  localStorage.setItem('ci_chart_preferences', JSON.stringify(state.chartPreferences));
}

export function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.isDarkTheme ? 'dark' : 'light');
  localStorage.setItem('ci_theme', state.isDarkTheme ? 'dark' : 'light');
}

export function getCachedOrAggregatedCandles(symbolCode, provider, timeframe) {
  const normTf = provider === 'eia_brent_spot' ? 'D1' : String(timeframe || 'M15').toUpperCase();
  const exactKey = `${symbolCode}_${provider}_${normTf}`;
  if (candleCache.has(exactKey)) return candleCache.get(exactKey);

  try {
    const saved = JSON.parse(localStorage.getItem(`ci_candles_v2_${exactKey}`) || 'null');
    if (Array.isArray(saved) && saved.length > 0) {
      const cleaned = filterSyntheticWeekendAndCombCandles(saved, symbolCode, normTf);
      candleCache.set(exactKey, cleaned);
      return cleaned;
    }
  } catch (_) {}

  if (['H1', 'H4', 'D1'].includes(normTf)) {
    const m15 = getCachedOrAggregatedCandles(symbolCode, provider, 'M15');
    if (m15.length > 0) {
      const agg = TimeframeAggregator.aggregateCandles(m15, normTf);
      if (agg.length > 0) return agg;
    }
  }
  return [];
}

export function saveCandlesToCache(symbolCode, provider, timeframe, candles) {
  const normTf = provider === 'eia_brent_spot' ? 'D1' : String(timeframe || 'M15').toUpperCase();
  const exactKey = `${symbolCode}_${provider}_${normTf}`;
  const cleaned = filterSyntheticWeekendAndCombCandles(candles, symbolCode, normTf);
  const limit = Math.max(40, Math.min(5000, Number(state.chartPreferences.candleFetchLimit) || 500));
  const cappedInMemory = cleaned.slice(-limit);
  candleCache.set(exactKey, cappedInMemory);
  try {
    // Store up to 1500 in browser localStorage to avoid QuotaExceededError while keeping up to 5000 in memory & MariaDB
    const localCap = Math.min(limit, 1500);
    localStorage.setItem(`ci_candles_v2_${exactKey}`, JSON.stringify(cappedInMemory.slice(-localCap)));
  } catch (_) {}
}

export function loadDrawings(chartId) {
  try {
    const arr = JSON.parse(localStorage.getItem(`ci_drawings_v1_${chartId}`) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

export function saveDrawings(chartId, drawings) {
  try {
    localStorage.setItem(`ci_drawings_v1_${chartId}`, JSON.stringify(drawings || []));
  } catch (_) {}
}

export function loadSymbolsFromStorage() {
  let saved = null;
  let custom = [];
  const migratedTvDefault = localStorage.getItem('ci_spotbrent_tv_default_v1') === '1';
  try {
    saved = JSON.parse(localStorage.getItem('ci_symbols') || 'null');
    custom = JSON.parse(localStorage.getItem('ci_custom_symbols') || '[]');
  } catch (_) {}

  const allDefinitions = [...BASE_SYMBOLS, ...(Array.isArray(custom) ? custom : [])];
  state.symbols = allDefinitions.map((item) => {
    const match = Array.isArray(saved) ? saved.find((s) => s.symbolCode === item.symbolCode) : null;
    let activeProvider =
      match && item.allowedProviders.includes(match.activeProvider)
        ? match.activeProvider
        : item.activeProvider;
    if (item.symbolCode === 'SPOTBRENT' && !migratedTvDefault) {
      activeProvider = 'tvdatafeed';
    }
    const timeframe =
      activeProvider === 'eia_brent_spot'
        ? 'D1'
        : match && ['M15', 'H1', 'H4', 'D1'].includes(match.timeframe)
        ? match.timeframe
        : 'M15';
    const candles = getCachedOrAggregatedCandles(item.symbolCode, activeProvider, timeframe);
    const last = candles[candles.length - 1];
    return {
      ...item,
      inWatchlist: match ? Boolean(match.inWatchlist) : item.inWatchlist,
      activeProvider,
      timeframe,
      candles,
      lastClose: last ? last.close : null,
      lastCandleUtc: last ? last.open_time_utc_iso : null,
      isSyncing: false,
      hasError: false,
    };
  });
  if (!migratedTvDefault) {
    localStorage.setItem('ci_spotbrent_tv_default_v1', '1');
    saveSymbolsToStorage();
  }
}

export function saveSymbolsToStorage() {
  localStorage.setItem(
    'ci_symbols',
    JSON.stringify(
      state.symbols.map((s) => ({
        symbolCode: s.symbolCode,
        inWatchlist: s.inWatchlist,
        activeProvider: s.activeProvider,
        timeframe: s.timeframe,
      }))
    )
  );
  const customSymbols = state.symbols.filter((s) => s.isCustom);
  localStorage.setItem('ci_custom_symbols', JSON.stringify(customSymbols));
}

export function addCustomSymbol(symbolCode, customTitle, decimals, provider) {
  const cleanCode = symbolCode.trim().toUpperCase();
  if (!cleanCode || state.symbols.some((s) => s.symbolCode === cleanCode)) return null;

  const newSym = {
    chartId: `chart_${cleanCode.toLowerCase()}_custom`,
    symbolCode: cleanCode,
    customTitle: customTitle.trim() || cleanCode,
    decimals: Math.max(0, Math.min(6, decimals || 2)),
    inWatchlist: true,
    activeProvider: provider || 'dukascopy',
    allowedProviders: ['dukascopy', 'twelve_data', 'yahoo_finance'],
    timeframe: 'M15',
    isCustom: true,
    candles: [],
    lastClose: null,
    lastCandleUtc: null,
    isSyncing: false,
    hasError: false,
  };
  state.symbols.push(newSym);
  saveSymbolsToStorage();
  return newSym;
}

export function deleteSymbol(symbolCode) {
  state.symbols = state.symbols.filter((s) => s.symbolCode !== symbolCode);
  state.openTabs = state.openTabs.filter((t) => t.symbolCode !== symbolCode);
  if (state.activeTabId && state.activeTabId.startsWith(symbolCode)) {
    state.activeTabId = state.openTabs.length ? state.openTabs[state.openTabs.length - 1].tabId : null;
  }
  saveSymbolsToStorage();
}
