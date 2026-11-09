import { PriceFormatter } from '../algorithms/priceFormatter.js';
import { TimeframeAggregator } from '../algorithms/timeframeAggregator.js';

const STORAGE_KEY_THEME = 'ci_theme_dark';
const STORAGE_KEY_PREFS = 'ci_chart_prefs_v4';
const STORAGE_KEY_SYMBOLS = 'ci_symbols_v4';
const STORAGE_KEY_DRAWINGS = 'ci_drawings_v2';
const STORAGE_KEY_LAST_SYMBOL = 'ci_last_opened_symbol';
const STORAGE_CANDLES_PREFIX = 'ci_candles_v4_';

const DEFAULT_PREFS = {
  bullColor: '#26A69A',
  bearColor: '#EF5350',
  trendColor: '#2962FF',
  hLineColor: '#F59E0B',
  vLineColor: '#A855F7',
  candleFetchLimit: 500,
  hideWatchlistLogos: false,
  showSymbolScreen: true,
  chartVibrations: true,
  isLogScale: false,
  rememberLastChart: true,
  hideTabBarInLandscape: true,
  pickerVibrates: true,
  showScrollMagnifier: true,
};

const DEFAULT_SYMBOLS = [
  {
    symbolCode: 'XAUUSD',
    decimals: 2,
    inWatchlist: true,
    activeProvider: 'twelve_data',
    allowedProviders: ['twelve_data', 'tvdatafeed', 'dukascopy', 'yahoo_finance'],
    timeframe: 'M15',
    lastClose: 0,
    lastCandleUtc: '',
    candles: [],
    isSyncing: false,
    syncError: false,
  },
  {
    symbolCode: 'SPOTBRENT',
    decimals: 3,
    inWatchlist: true,
    activeProvider: 'tvdatafeed',
    allowedProviders: ['tvdatafeed', 'dukascopy', 'twelve_data', 'eia_brent_spot', 'yahoo_finance'],
    timeframe: 'M15',
    lastClose: 0,
    lastCandleUtc: '',
    candles: [],
    isSyncing: false,
    syncError: false,
  },
  {
    symbolCode: 'BRENT_FUTURES',
    decimals: 2,
    inWatchlist: false,
    activeProvider: 'yahoo_finance',
    allowedProviders: ['yahoo_finance', 'tvdatafeed', 'dukascopy', 'eia_brent_spot'],
    timeframe: 'M15',
    lastClose: 0,
    lastCandleUtc: '',
    candles: [],
    isSyncing: false,
    syncError: false,
  },
  {
    symbolCode: 'XAGUSD',
    decimals: 3,
    inWatchlist: false,
    activeProvider: 'twelve_data',
    allowedProviders: ['twelve_data', 'dukascopy', 'yahoo_finance'],
    timeframe: 'M15',
    lastClose: 0,
    lastCandleUtc: '',
    candles: [],
    isSyncing: false,
    syncError: false,
  },
  {
    symbolCode: 'EURUSD',
    decimals: 4,
    inWatchlist: false,
    activeProvider: 'twelve_data',
    allowedProviders: ['twelve_data', 'dukascopy', 'yahoo_finance'],
    timeframe: 'M15',
    lastClose: 0,
    lastCandleUtc: '',
    candles: [],
    isSyncing: false,
    syncError: false,
  },
];

export function normalizeCandle(raw, timeframe = 'M15', nowMs = Date.now()) {
  if (!raw) return null;
  const stepMs = PriceFormatter.stepMilliseconds(timeframe);
  let openMs = Number(
    raw.open_time_utc_ms ||
      (raw.openTimeSec ? Number(raw.openTimeSec) * 1000 : 0) ||
      (raw.time ? Number(raw.time) * 1000 : 0)
  );
  if (!openMs && raw.open_time_utc_iso) {
    const parsed = Date.parse(String(raw.open_time_utc_iso).replace(' UTC', 'Z'));
    if (!isNaN(parsed)) openMs = parsed;
  }
  if (!openMs || openMs <= 0) return null;
  openMs = Math.floor(openMs / stepMs) * stepMs;
  if (openMs + stepMs > nowMs) return null;

  if (String(timeframe).toUpperCase() === 'D1') {
    const dow = new Date(openMs).getUTCDay();
    if (dow === 0 || dow === 6) return null;
  }

  const o = Number(raw.open);
  const h = Number(raw.high);
  const l = Number(raw.low);
  const c = Number(raw.close);
  const v = Math.max(0, Number(raw.volume || 0));
  if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) return null;
  if (Math.min(o, h, l, c) <= 0) return null;

  const high = Math.max(o, h, l, c);
  const low = Math.min(o, h, l, c);
  const iso = new Date(openMs).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

  return {
    open_time_utc_ms: openMs,
    open_time_utc_iso: iso,
    openTimeSec: Math.floor(openMs / 1000),
    openTimeUtc: iso,
    open: o,
    high,
    low,
    close: c,
    volume: v,
    is_closed: true,
  };
}

export function mergeCandlesIdempotent(existing = [], incoming = [], timeframe = 'M15', nowMs = Date.now()) {
  const map = new Map();
  for (const item of existing) {
    const norm = normalizeCandle(item, timeframe, nowMs);
    if (norm) map.set(norm.open_time_utc_ms, norm);
  }
  for (const item of incoming) {
    const norm = normalizeCandle(item, timeframe, nowMs);
    if (norm) map.set(norm.open_time_utc_ms, norm);
  }
  return Array.from(map.values()).sort((a, b) => a.open_time_utc_ms - b.open_time_utc_ms);
}

function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFS);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function loadSymbols() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SYMBOLS);
    if (!raw) return DEFAULT_SYMBOLS.map((s) => ({ ...s }));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_SYMBOLS.map((s) => ({ ...s }));
    }
    return parsed.map((item) => {
      const def = DEFAULT_SYMBOLS.find((d) => d.symbolCode === item.symbolCode);
      const allowed = def
        ? def.allowedProviders
        : ['tvdatafeed', 'dukascopy', 'twelve_data', 'yahoo_finance'];
      return {
        ...(def || {}),
        ...item,
        allowedProviders: allowed,
        candles: Array.isArray(item.candles) ? item.candles : [],
        isSyncing: false,
        syncError: false,
      };
    });
  } catch {
    return DEFAULT_SYMBOLS.map((s) => ({ ...s }));
  }
}

function loadDrawingsByKey() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DRAWINGS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export const state = {
  isDarkTheme: localStorage.getItem(STORAGE_KEY_THEME) !== 'false',
  isAuthenticated: false,
  isOwnerRegistered: false,
  ownerUsername: localStorage.getItem('ci_owner_username') || '',
  ownerEmail: localStorage.getItem('ci_owner_email') || '',
  authMode: 'login',
  authErrorKey: '',
  authInfoKey: '',
  statusBannerKey: '',

  currentScreen: 'watchlist',
  activeNav: 'watchlist',
  isSideDrawerOpen: true,
  isFullscreen: false,

  watchlistSearchQuery: '',
  symbolOverviewCode: null,
  symbolOverviewRange: '5D',
  isAddSymbolModalOpen: false,

  chartPreferences: loadPreferences(),
  symbols: loadSymbols(),
  drawingsByChartId: loadDrawingsByKey(),
  candleCache: {},

  openTabs: [],
  activeTabId: null,
  lastOpenedSymbolCode: localStorage.getItem(STORAGE_KEY_LAST_SYMBOL) || 'SPOTBRENT',
};

export function savePreferences() {
  localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(state.chartPreferences));
}

export function saveSymbolsToStorage() {
  const clean = state.symbols.map((s) => ({
    symbolCode: s.symbolCode,
    customTitle: s.customTitle || '',
    decimals: s.decimals,
    inWatchlist: s.inWatchlist,
    activeProvider: s.activeProvider,
    timeframe: s.timeframe,
    lastClose: s.lastClose,
    lastCandleUtc: s.lastCandleUtc,
    isCustom: Boolean(s.isCustom),
  }));
  localStorage.setItem(STORAGE_KEY_SYMBOLS, JSON.stringify(clean));
}

export const saveSymbols = saveSymbolsToStorage;

export function saveDrawings(chartKey, drawingsList) {
  if (chartKey && Array.isArray(drawingsList)) {
    state.drawingsByChartId[chartKey] = drawingsList;
  }
  localStorage.setItem(STORAGE_KEY_DRAWINGS, JSON.stringify(state.drawingsByChartId));
}

export function saveLastOpenedSymbol(code) {
  state.lastOpenedSymbolCode = code;
  localStorage.setItem(STORAGE_KEY_LAST_SYMBOL, code);
}

function loadCandlesFromLocalStorage(key, timeframe) {
  try {
    const raw = localStorage.getItem(STORAGE_CANDLES_PREFIX + key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return mergeCandlesIdempotent([], parsed, timeframe);
  } catch {
    return [];
  }
}

export function saveCandlesToCache(key, candles, maxLimit = 5000) {
  const parts = String(key).split('_');
  const tf = parts[parts.length - 1] || 'M15';
  const normalized = mergeCandlesIdempotent([], candles, tf).slice(-Math.max(40, Math.min(5000, maxLimit)));
  state.candleCache[key] = normalized;
  try {
    // Store up to 1500 bars in localStorage to avoid quota overflow while keeping full 5000 in memory
    localStorage.setItem(STORAGE_CANDLES_PREFIX + key, JSON.stringify(normalized.slice(-1500)));
  } catch {
    // Ignore storage quota warnings
  }
}

export function getCachedOrAggregatedCandles(symbolCode, provider, timeframe) {
  const normTf = provider === 'eia_brent_spot' ? 'D1' : String(timeframe || 'M15').toUpperCase();
  const exactKey = `${symbolCode}_${provider}_${normTf}`;
  let current = state.candleCache[exactKey];
  if (!current || current.length === 0) {
    current = loadCandlesFromLocalStorage(exactKey, normTf);
    if (current.length > 0) {
      state.candleCache[exactKey] = current;
    }
  }

  // For H1 and H4, also merge any newer closed bars aggregated from cached M15 / H1
  // so stale cached H1/H4 entries never hide newly synced intraday candles
  if (normTf === 'H1' || normTf === 'H4') {
    const m15Key = `${symbolCode}_${provider}_M15`;
    const m15 = state.candleCache[m15Key] || loadCandlesFromLocalStorage(m15Key, 'M15');
    if (m15 && m15.length > 0) {
      const aggFromM15 = TimeframeAggregator.aggregateCandles(m15, normTf);
      if (aggFromM15.length > 0) {
        current = mergeCandlesIdempotent(current || [], aggFromM15, normTf);
        state.candleCache[exactKey] = current;
      }
    }
    if (normTf === 'H4') {
      const h1Key = `${symbolCode}_${provider}_H1`;
      const h1 = state.candleCache[h1Key] || loadCandlesFromLocalStorage(h1Key, 'H1');
      if (h1 && h1.length > 0) {
        const aggFromH1 = TimeframeAggregator.aggregateCandles(h1, 'H4');
        if (aggFromH1.length > 0) {
          current = mergeCandlesIdempotent(current || [], aggFromH1, 'H4');
          state.candleCache[exactKey] = current;
        }
      }
    }
  } else if (normTf === 'D1' && (!current || current.length === 0)) {
    const h1Key = `${symbolCode}_${provider}_H1`;
    const h1 = state.candleCache[h1Key] || loadCandlesFromLocalStorage(h1Key, 'H1');
    if (h1 && h1.length > 0) {
      return TimeframeAggregator.aggregateCandles(h1, 'D1');
    }
  }

  return current || [];
}
