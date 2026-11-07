import { TimeframeAggregator } from '../algorithms/timeframeAggregator.js';

export const BASE_SYMBOLS = [
  {
    chartId: 'chart_xauusd_main',
    symbolCode: 'XAUUSD',
    customTitle: null,
    decimals: 2,
    inWatchlist: true,
    activeProvider: 'twelve_data',
    allowedProviders: ['twelve_data', 'dukascopy', 'yahoo_finance'],
    timeframe: 'M15',
  },
  {
    chartId: 'chart_spotbrent_main',
    symbolCode: 'SPOTBRENT',
    customTitle: null,
    decimals: 2,
    inWatchlist: true,
    activeProvider: 'dukascopy',
    allowedProviders: ['dukascopy', 'twelve_data', 'eia_brent_spot', 'yahoo_finance'],
    timeframe: 'M15',
  },
  {
    chartId: 'chart_brent_futures',
    symbolCode: 'BRENT_FUTURES',
    customTitle: null,
    decimals: 2,
    inWatchlist: false,
    activeProvider: 'yahoo_finance',
    allowedProviders: ['yahoo_finance', 'dukascopy', 'eia_brent_spot'],
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

export const state = {
  isDarkTheme: (localStorage.getItem('ci_theme') || 'dark') === 'dark',
  isOwnerRegistered: Boolean(localStorage.getItem('ci_owner_username')),
  isAuthenticated: false,
  ownerUsername: localStorage.getItem('ci_owner_username') || '',
  authErrorKey: null,
  statusBannerKey: null,
  currentScreen: 'chart_view',
  desktopSidePanel: 'watchlist',
  symbols: [],
  openTabs: [],
  activeTabId: null,
  chartPreferences: loadChartPreferences(),
  showAddSymbolModal: false,
};

export function loadChartPreferences() {
  const defaults = {
    bullColor: '#10B981',
    bearColor: '#F43F5E',
    trendColor: '#A855F7',
    hlineColor: '#38BDF8',
    vlineColor: '#F59E0B',
    candleFetchLimit: 160,
  };
  try {
    const saved = JSON.parse(localStorage.getItem('ci_chart_preferences') || '{}');
    return { ...defaults, ...saved };
  } catch (_) {
    return defaults;
  }
}

export function saveChartPreferences(prefs) {
  state.chartPreferences = { ...state.chartPreferences, ...prefs };
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
      candleCache.set(exactKey, saved);
      return saved;
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
  candleCache.set(exactKey, candles);
  try {
    const limit = state.chartPreferences.candleFetchLimit || 160;
    localStorage.setItem(`ci_candles_v2_${exactKey}`, JSON.stringify(candles.slice(-limit)));
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
  try {
    saved = JSON.parse(localStorage.getItem('ci_symbols') || 'null');
    custom = JSON.parse(localStorage.getItem('ci_custom_symbols') || '[]');
  } catch (_) {}

  const allDefinitions = [...BASE_SYMBOLS, ...(Array.isArray(custom) ? custom : [])];
  state.symbols = allDefinitions.map((item) => {
    const match = Array.isArray(saved) ? saved.find((s) => s.symbolCode === item.symbolCode) : null;
    const activeProvider =
      match && item.allowedProviders.includes(match.activeProvider)
        ? match.activeProvider
        : item.activeProvider;
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
