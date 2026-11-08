export const DEFAULT_CHART_PREFS = {
  bullColor: '#26A69A',
  bearColor: '#EF5350',
  trendColor: '#2962FF',
  hLineColor: '#F59E0B',
  vLineColor: '#A855F7',
  candleFetchLimit: 500,
  zoomStep: 12,
  touchTolerancePx: 20,
  defaultLineColor: '#2962FF',
  defaultLineWidthPx: 2.0,
  hideWatchlistLogos: false,
  showSymbolScreen: true,
  chartVibrations: true,
  isLogScale: false,
  rememberLastChart: true,
  hideTabBarInLandscape: true,
  pickerVibrates: true,
  showScrollMagnifier: true,
};

export function loadChartPreferences() {
  try {
    const raw = localStorage.getItem('ci_chart_prefs');
    if (!raw) return { ...DEFAULT_CHART_PREFS };
    return { ...DEFAULT_CHART_PREFS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_CHART_PREFS };
  }
}

export function saveChartPreferences(prefs) {
  localStorage.setItem('ci_chart_prefs', JSON.stringify(prefs));
}

export const INITIAL_SYMBOLS = [
  {
    symbolCode: 'XAUUSD',
    inWatchlist: true,
    activeProvider: 'twelve_data',
    allowedProviders: ['twelve_data', 'dukascopy'],
    decimals: 2,
    lastClose: 0,
    lastCandleUtc: '',
    candles: [],
    isSyncing: false,
    syncError: false,
    isCustom: false,
    customTitle: '',
  },
  {
    symbolCode: 'SPOTBRENT',
    inWatchlist: true,
    activeProvider: 'tvdatafeed',
    allowedProviders: ['tvdatafeed', 'twelve_data', 'dukascopy'],
    decimals: 3,
    lastClose: 0,
    lastCandleUtc: '',
    candles: [],
    isSyncing: false,
    syncError: false,
    isCustom: false,
    customTitle: '',
  },
  {
    symbolCode: 'BRENT_FUTURES',
    inWatchlist: false,
    activeProvider: 'yahoo_finance',
    allowedProviders: ['yahoo_finance', 'twelve_data'],
    decimals: 2,
    lastClose: 0,
    lastCandleUtc: '',
    candles: [],
    isSyncing: false,
    syncError: false,
    isCustom: false,
    customTitle: '',
  },
  {
    symbolCode: 'XAGUSD',
    inWatchlist: false,
    activeProvider: 'twelve_data',
    allowedProviders: ['twelve_data', 'dukascopy'],
    decimals: 3,
    lastClose: 0,
    lastCandleUtc: '',
    candles: [],
    isSyncing: false,
    syncError: false,
    isCustom: false,
    customTitle: '',
  },
  {
    symbolCode: 'EURUSD',
    inWatchlist: false,
    activeProvider: 'twelve_data',
    allowedProviders: ['twelve_data', 'dukascopy'],
    decimals: 4,
    lastClose: 0,
    lastCandleUtc: '',
    candles: [],
    isSyncing: false,
    syncError: false,
    isCustom: false,
    customTitle: '',
  },
];

export const state = {
  isAuthenticated: false,
  hasOwnerAccount: false,
  ownerUsername: '',
  ownerEmail: '',
  authErrorKey: null,
  statusBannerKey: null,
  authViewMode: 'login',
  pendingRecoveryEmail: '',
  activeNav: 'watchlist',
  isSideDrawerOpen: false,
  isFullscreen: false,
  isAddSymbolModalOpen: false,
  symbolOverviewCode: null,
  symbolOverviewRange: '5D',
  watchlistSearchQuery: '',
  isDarkTheme: localStorage.getItem('ci_theme_v2') !== 'light',
  chartPreferences: loadChartPreferences(),
  symbols: JSON.parse(JSON.stringify(INITIAL_SYMBOLS)),
  openTabs: [],
  activeTabId: null,
};

let renderCallback = () => {};

export function registerRenderCallback(fn) {
  renderCallback = fn;
}

export function triggerRender() {
  renderCallback();
}
