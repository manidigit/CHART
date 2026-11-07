import { I18nManager } from './core/i18n.js';
import { PriceFormatter } from './algorithms/priceFormatter.js';
import { TimeframeAggregator } from './algorithms/timeframeAggregator.js';
import { DrawingGeometry } from './algorithms/drawingGeometry.js';
import { computeChartGeometry, renderCandlestickCanvas } from './components/chartRenderer.js';

const i18n = new I18nManager();

const BASE_SYMBOLS = [
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

const candleCache = new Map();

const state = {
  isDarkTheme: (localStorage.getItem('ci_theme') || 'dark') === 'dark',
  isOwnerRegistered: Boolean(localStorage.getItem('ci_owner_username')),
  isAuthenticated: false,
  ownerUsername: localStorage.getItem('ci_owner_username') || '',
  authErrorKey: null,
  statusBannerKey: null,
  currentScreen: 'chart_view',
  desktopSidePanel: 'watchlist', // 'watchlist' | 'analysis' | 'settings' | null (collapsed)
  symbols: [],
  openTabs: [],
  activeTabId: null,
  chartPreferences: loadChartPreferences(),
  showAddSymbolModal: false,
};

function loadChartPreferences() {
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

function saveChartPreferences(prefs) {
  state.chartPreferences = { ...state.chartPreferences, ...prefs };
  localStorage.setItem('ci_chart_preferences', JSON.stringify(state.chartPreferences));
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.isDarkTheme ? 'dark' : 'light');
  localStorage.setItem('ci_theme', state.isDarkTheme ? 'dark' : 'light');
}

function getCachedOrAggregatedCandles(symbolCode, provider, timeframe) {
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

function saveCandlesToCache(symbolCode, provider, timeframe, candles) {
  const normTf = provider === 'eia_brent_spot' ? 'D1' : String(timeframe || 'M15').toUpperCase();
  const exactKey = `${symbolCode}_${provider}_${normTf}`;
  candleCache.set(exactKey, candles);
  try {
    const limit = state.chartPreferences.candleFetchLimit || 160;
    localStorage.setItem(`ci_candles_v2_${exactKey}`, JSON.stringify(candles.slice(-limit)));
  } catch (_) {}
}

function loadDrawings(chartId) {
  try {
    const arr = JSON.parse(localStorage.getItem(`ci_drawings_v1_${chartId}`) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function saveDrawings(chartId, drawings) {
  try {
    localStorage.setItem(`ci_drawings_v1_${chartId}`, JSON.stringify(drawings || []));
  } catch (_) {}
}

function loadSymbolsFromStorage() {
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

function saveSymbolsToStorage() {
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

function addCustomSymbol(symbolCode, customTitle, decimals, provider) {
  const cleanCode = symbolCode.trim().toUpperCase();
  if (!cleanCode || state.symbols.some((s) => s.symbolCode === cleanCode)) return;

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
  openSymbolInTab(cleanCode);
  syncSymbolNow(cleanCode);
}

function deleteSymbol(symbolCode) {
  state.symbols = state.symbols.filter((s) => s.symbolCode !== symbolCode);
  state.openTabs = state.openTabs.filter((t) => t.symbolCode !== symbolCode);
  if (state.activeTabId && state.activeTabId.startsWith(symbolCode)) {
    state.activeTabId = state.openTabs.length ? state.openTabs[state.openTabs.length - 1].tabId : null;
  }
  saveSymbolsToStorage();
  renderApp();
}

async function checkBackendOwnerStatus() {
  try {
    const res = await fetch('./api/v1/auth.php?action=status');
    const json = await res.json();
    if (json && json.ok && json.data && json.data.is_owner_registered) {
      state.isOwnerRegistered = true;
      state.ownerUsername = json.data.owner_username || state.ownerUsername;
    }
  } catch (_) {}
}

async function syncSymbolNow(symbolCode, requestedTimeframe = null) {
  const sym = state.symbols.find((s) => s.symbolCode === symbolCode);
  if (!sym) return;
  const tf =
    sym.activeProvider === 'eia_brent_spot'
      ? 'D1'
      : String(requestedTimeframe || sym.timeframe || 'M15').toUpperCase();
  sym.timeframe = tf;
  sym.isSyncing = true;
  sym.hasError = false;

  const tabId = `${sym.symbolCode}_${sym.activeProvider}`;
  const openTab = state.openTabs.find((t) => t.tabId === tabId);
  if (openTab) {
    openTab.isLoading = openTab.candles.length === 0;
    openTab.hasError = false;
  }
  renderApp();

  let fetchedCandles = [];
  try {
    const limit = state.chartPreferences.candleFetchLimit || 160;
    const url = `./api/v1/candles_sync.php?symbol=${encodeURIComponent(
      sym.symbolCode
    )}&provider=${encodeURIComponent(sym.activeProvider)}&timeframe=${encodeURIComponent(
      tf
    )}&limit=${limit}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json && json.ok && json.data && Array.isArray(json.data.candles)) {
      fetchedCandles = json.data.candles;
    }
  } catch (_) {}

  if (fetchedCandles.length > 0) {
    saveCandlesToCache(sym.symbolCode, sym.activeProvider, tf, fetchedCandles);
    sym.candles = fetchedCandles;
    sym.hasError = false;
    state.statusBannerKey = 'status_synced_ok';
  } else {
    sym.candles = getCachedOrAggregatedCandles(sym.symbolCode, sym.activeProvider, tf);
    sym.hasError = sym.candles.length === 0;
  }

  const latest = sym.candles[sym.candles.length - 1];
  sym.lastClose = latest ? latest.close : null;
  sym.lastCandleUtc = latest ? latest.open_time_utc_iso : null;
  sym.isSyncing = false;

  if (openTab) {
    const oldLen = (openTab.candles || []).length;
    const newLen = sym.candles.length;
    if (openTab.timeframe === tf && openTab.scrollOffset > 0 && oldLen > 0 && newLen >= oldLen) {
      openTab.scrollOffset += newLen - oldLen;
    }
    openTab.timeframe = tf;
    openTab.candles = sym.candles;
    openTab.isLoading = false;
    openTab.hasError = sym.candles.length === 0;
  }
  saveSymbolsToStorage();
  renderApp();
}

function openSymbolInTab(symbolCode) {
  const sym = state.symbols.find((s) => s.symbolCode === symbolCode);
  if (!sym) return;
  const tabId = `${sym.symbolCode}_${sym.activeProvider}`;
  let existing = state.openTabs.find((t) => t.tabId === tabId);
  if (!existing) {
    existing = {
      tabId,
      symbolCode: sym.symbolCode,
      customTitle: sym.customTitle,
      provider: sym.activeProvider,
      timeframe: sym.timeframe,
      decimals: sym.decimals,
      chartId: sym.chartId,
      candles: sym.candles || [],
      scrollOffset: 0,
      visibleCount: 48,
      chartType: 'candlestick',
      activeDrawingTool: 'cursor',
      drawings: loadDrawings(sym.chartId),
      selectedDrawingId: null,
      pendingTrendPoint: null,
      selectedCandleIndex: null,
      isAutoScaleY: true,
      yPriceScaleFactor: 1.0,
      isLoading: (sym.candles || []).length === 0,
      hasError: false,
    };
    state.openTabs.push(existing);
  }
  state.activeTabId = tabId;
  state.currentScreen = 'chart_view';
  renderApp();
}

function computeTechnicalAnalytics(candles) {
  if (!candles || candles.length === 0) return null;
  const slice = candles.slice(-24);
  let highest = -Infinity;
  let lowest = Infinity;
  let bullCount = 0;
  let bearCount = 0;
  let totalVol = 0;

  for (const c of slice) {
    highest = Math.max(highest, Number(c.high));
    lowest = Math.min(lowest, Number(c.low));
    if (Number(c.close) >= Number(c.open)) bullCount++;
    else bearCount++;
    totalVol += Number(c.volume || 0);
  }

  // ATR (14 period)
  let atr = 0;
  if (candles.length >= 2) {
    const atrSlice = candles.slice(-15);
    let trSum = 0;
    for (let i = 1; i < atrSlice.length; i++) {
      const cur = atrSlice[i];
      const prev = atrSlice[i - 1];
      const hl = Number(cur.high) - Number(cur.low);
      const hc = Math.abs(Number(cur.high) - Number(prev.close));
      const lc = Math.abs(Number(cur.low) - Number(prev.close));
      trSum += Math.max(hl, hc, lc);
    }
    atr = trSum / (atrSlice.length - 1);
  }

  // Classic Floor Pivot Points
  const lastBar = candles[candles.length - 1];
  const h = Number(lastBar.high);
  const l = Number(lastBar.low);
  const c = Number(lastBar.close);
  const p = (h + l + c) / 3;
  const r1 = 2 * p - l;
  const s1 = 2 * p - h;
  const r2 = p + (h - l);
  const s2 = p - (h - l);

  return {
    periodHigh: highest,
    periodLow: lowest,
    spread: highest - lowest,
    atr14: atr,
    bullCount,
    bearCount,
    totalBars: slice.length,
    bullRatio: Math.round((bullCount / Math.max(1, slice.length)) * 100),
    pivot: p,
    r1,
    s1,
    r2,
    s2,
    lastClose: c,
    volume: totalVol,
  };
}

function renderLoginScreen() {
  const isReg = state.isOwnerRegistered;
  return `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;">
      <div class="card" style="max-width: 440px; width: 100%; padding: 28px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-size: 26px; font-weight: 800; letter-spacing: 1px; color: var(--primary);">${i18n.t('app_name')}</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-top: 6px;">${i18n.t('app_subtitle')}</div>
        </div>
        <h3 style="margin: 0 0 8px 0;">${isReg ? i18n.t('login_signin_title') : i18n.t('login_setup_title')}</h3>
        <p style="font-size: 13px; color: var(--text-muted); margin: 0 0 20px 0;">
          ${isReg ? i18n.t('login_signin_subtitle') : i18n.t('login_setup_subtitle')}
        </p>
        ${
          state.authErrorKey
            ? `<div style="background: var(--bear-bg); border: 1px solid var(--bear); color: var(--bear); padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; margin-bottom: 16px;">
                 ${i18n.t(state.authErrorKey)}
               </div>`
            : ''
        }
        <form id="auth-form">
          <input class="input-field" type="text" name="username" placeholder="${i18n.t('label_username')}" value="${state.ownerUsername}" required autocomplete="username" />
          <input class="input-field" type="password" name="password" placeholder="${i18n.t('label_password')}" required autocomplete="current-password" />
          ${
            !isReg
              ? `<input class="input-field" type="password" name="confirm_password" placeholder="${i18n.t('label_confirm_password')}" required autocomplete="new-password" />`
              : ''
          }
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px;">
            ${isReg ? i18n.t('action_sign_in') : i18n.t('action_create_owner_account')}
          </button>
        </form>
        <div style="margin-top: 24px; border-top: 1px solid var(--border); padding-top: 16px;">
          ${renderLanguageThemeBar()}
        </div>
      </div>
    </div>
  `;
}

function renderLanguageThemeBar() {
  const isFa = i18n.getCurrentLanguage() === 'fa';
  return `
    <div class="row-between" style="font-size: 13px;">
      <div class="chip-group">
        <button class="chip ${isFa ? 'active' : ''}" data-action="set-lang" data-lang="fa">فارسی</button>
        <button class="chip ${!isFa ? 'active' : ''}" data-action="set-lang" data-lang="en">English</button>
      </div>
      <div class="chip-group">
        <button class="chip ${state.isDarkTheme ? 'active' : ''}" data-action="set-theme" data-theme="dark">Dark</button>
        <button class="chip ${!state.isDarkTheme ? 'active' : ''}" data-action="set-theme" data-theme="light">Light</button>
      </div>
    </div>
  `;
}

function renderWatchlistContent() {
  const watchlist = state.symbols.filter((s) => s.inWatchlist);
  const cardsHtml = watchlist
    .map((s) => {
      const title = s.customTitle || i18n.t('symbol_' + s.symbolCode) || s.symbolCode;
      const pct = s.candles.length >= 2 ? PriceFormatter.formatSignedPct(s.candles[0].open, s.lastClose) : '+0.00%';
      const isBull = !pct.startsWith('-');
      return `
      <div class="card-subtle" style="margin-bottom: 8px;">
        <div class="row-between">
          <div>
            <div style="font-weight: 700; font-size: 14px;">${title}</div>
            <div class="ltr-num" style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              ${s.symbolCode} · ${s.activeProvider} (${s.timeframe})
            </div>
          </div>
          <div style="text-align: end;">
            <div class="ltr-num" style="font-weight: 700; font-size: 15px; color: var(--primary);">
              ${PriceFormatter.formatPrice(s.lastClose, s.decimals)}
            </div>
            <span class="pct-badge ${isBull ? 'bull' : 'bear'}">${pct}</span>
          </div>
        </div>
        <div class="btn-row" style="margin-top: 10px;">
          <button class="btn btn-sm" data-action="sync-symbol" data-symbol="${s.symbolCode}" ${s.isSyncing ? 'disabled' : ''}>
            ${s.isSyncing ? i18n.t('action_syncing') : i18n.t('action_sync_now')}
          </button>
          <button class="btn btn-sm btn-primary" data-action="open-chart" data-symbol="${s.symbolCode}">
            ${i18n.t('action_open_chart_view')}
          </button>
        </div>
      </div>
    `;
    })
    .join('');

  return `
    <div>
      <div class="row-between" style="margin-bottom: 12px;">
        <h4 style="margin: 0;">${i18n.t('watchlist_title')} (${watchlist.length})</h4>
        <button class="btn btn-sm btn-primary" data-action="sync-all">
          ${i18n.t('action_sync_all')}
        </button>
      </div>
      ${watchlist.length === 0 ? `<p style="color: var(--text-muted); font-size: 13px;">${i18n.t('watchlist_empty_hint')}</p>` : cardsHtml}
    </div>
  `;
}

function renderAnalysisContent(activeTab) {
  if (!activeTab || !activeTab.candles || activeTab.candles.length === 0) {
    return `<p style="color: var(--text-muted); font-size: 13px;">${i18n.t('analysis_no_data')}</p>`;
  }
  const stats = computeTechnicalAnalytics(activeTab.candles);
  if (!stats) return `<p style="color: var(--text-muted); font-size: 13px;">${i18n.t('analysis_no_data')}</p>`;

  const dec = activeTab.decimals;
  return `
    <div>
      <h4 style="margin: 0 0 12px 0;">${i18n.t('analysis_title')}</h4>
      <div class="card-subtle" style="margin-bottom: 10px;">
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">${i18n.t('analysis_key_stats')} (24 Bars)</div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px;">
          <span>High / Low</span>
          <strong>${PriceFormatter.formatPrice(stats.periodHigh, dec)} / ${PriceFormatter.formatPrice(stats.periodLow, dec)}</strong>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px;">
          <span>Spread / Range</span>
          <strong>${PriceFormatter.formatPrice(stats.spread, dec)}</strong>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px;">
          <span>ATR (14)</span>
          <strong style="color: var(--gold);">${PriceFormatter.formatPrice(stats.atr14, dec)}</strong>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px;">
          <span>Sentiment</span>
          <strong style="color: ${stats.bullRatio >= 50 ? 'var(--bull)' : 'var(--bear)'};">
            ${stats.bullRatio}% Bullish (${stats.bullCount}/${stats.totalBars})
          </strong>
        </div>
      </div>

      <div class="card-subtle">
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">${i18n.t('analysis_pivot_points')}</div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px;">
          <span style="color: var(--bear);">R2</span>
          <span>${PriceFormatter.formatPrice(stats.r2, dec)}</span>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px;">
          <span style="color: var(--bear);">R1</span>
          <span>${PriceFormatter.formatPrice(stats.r1, dec)}</span>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px; font-weight: 700; color: var(--gold);">
          <span>Pivot (P)</span>
          <span>${PriceFormatter.formatPrice(stats.pivot, dec)}</span>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px;">
          <span style="color: var(--bull);">S1</span>
          <span>${PriceFormatter.formatPrice(stats.s1, dec)}</span>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px;">
          <span style="color: var(--bull);">S2</span>
          <span>${PriceFormatter.formatPrice(stats.s2, dec)}</span>
        </div>
      </div>
    </div>
  `;
}

function renderSettingsContent() {
  const p = state.chartPreferences;
  const symbolsList = state.symbols
    .map(
      (s) => `
      <div class="card-subtle" style="margin-bottom: 8px;">
        <div class="row-between">
          <div>
            <strong>${s.customTitle || i18n.t('symbol_' + s.symbolCode) || s.symbolCode}</strong>
            <div class="ltr-num" style="font-size: 11px; color: var(--primary);">${s.symbolCode} · ${s.timeframe} · ${s.decimals} dec</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 12px;">
              <input type="checkbox" data-action="toggle-watchlist" data-symbol="${s.symbolCode}" ${s.inWatchlist ? 'checked' : ''} />
            </label>
            ${
              s.isCustom
                ? `<button class="btn btn-sm" style="color: var(--bear);" data-action="delete-symbol" data-symbol="${s.symbolCode}">✕</button>`
                : ''
            }
          </div>
        </div>
        <div class="chip-group" style="margin-top: 6px;">
          ${s.allowedProviders
            .map(
              (prov) => `
              <button class="chip ${s.activeProvider === prov ? 'active' : ''}" style="font-size: 11px; min-height: 26px; padding: 2px 8px;" data-action="select-provider" data-symbol="${s.symbolCode}" data-provider="${prov}">
                ${i18n.t('provider_' + prov)}
              </button>
            `
            )
            .join('')}
        </div>
      </div>
    `
    )
    .join('');

  return `
    <div>
      <div class="row-between" style="margin-bottom: 12px;">
        <h4 style="margin: 0;">${i18n.t('settings_symbols_section')}</h4>
        <button class="btn btn-sm btn-primary" data-action="open-add-symbol-modal">
          + ${i18n.t('settings_add_custom_symbol')}
        </button>
      </div>
      ${symbolsList}

      <div class="card-subtle" style="margin-top: 14px;">
        <h5 style="margin: 0 0 10px 0;">${i18n.t('settings_chart_colors')}</h5>
        <div style="font-size: 12px; margin-bottom: 4px;">Bullish Candle</div>
        <div class="color-picker-row">
          ${['#10B981', '#84CC16', '#06B6D4', '#22C55E', '#FFFFFF']
            .map(
              (c) => `<div class="color-dot ${p.bullColor === c ? 'active' : ''}" style="background: ${c};" data-action="set-color" data-target="bullColor" data-color="${c}"></div>`
            )
            .join('')}
        </div>
        <div style="font-size: 12px; margin: 10px 0 4px 0;">Bearish Candle</div>
        <div class="color-picker-row">
          ${['#F43F5E', '#E11D48', '#F97316', '#EC4899', '#A855F7']
            .map(
              (c) => `<div class="color-dot ${p.bearColor === c ? 'active' : ''}" style="background: ${c};" data-action="set-color" data-target="bearColor" data-color="${c}"></div>`
            )
            .join('')}
        </div>
      </div>

      <div class="card-subtle" style="margin-top: 14px;">
        <h5 style="margin: 0 0 8px 0;">${i18n.t('settings_appearance_section')}</h5>
        ${renderLanguageThemeBar()}
      </div>

      <button class="btn" style="width: 100%; margin-top: 14px;" data-action="sign-out">
        ${i18n.t('action_sign_out')} (${state.ownerUsername})
      </button>
    </div>
  `;
}

function renderApp() {
  const root = document.getElementById('app-root');
  if (!root) return;

  if (!state.isAuthenticated) {
    root.innerHTML = renderLoginScreen();
    return;
  }

  const isDesktop = window.innerWidth >= 769;
  const activeTab = state.openTabs.find((t) => t.tabId === state.activeTabId) || state.openTabs[0] || null;

  if (!activeTab && state.symbols.length > 0) {
    openSymbolInTab(state.symbols[0].symbolCode);
    return;
  }

  // Active symbol inspected candle stats
  const latestCandle = activeTab && activeTab.candles.length ? activeTab.candles[activeTab.candles.length - 1] : {};
  const inspected =
    activeTab && activeTab.selectedCandleIndex !== null && activeTab.candles[activeTab.selectedCandleIndex]
      ? activeTab.candles[activeTab.selectedCandleIndex]
      : latestCandle;
  const pct = activeTab && latestCandle.open ? PriceFormatter.formatSignedPct(latestCandle.open, latestCandle.close) : '+0.00%';
  const isBull = !pct.startsWith('-');
  const allowedTfs = activeTab && activeTab.provider === 'eia_brent_spot' ? ['D1'] : ['M15', 'H1', 'H4', 'D1'];

  // Topbar Timeframe Chips
  const tfChipsHtml = ['M15', 'H1', 'H4', 'D1']
    .map((tf) => {
      const enabled = allowedTfs.includes(tf);
      const isAct = activeTab && activeTab.timeframe === tf;
      return `<button class="chip ltr-num ${isAct ? 'active' : ''}" data-action="set-timeframe" data-tf="${tf}" ${!enabled ? 'disabled' : ''}>${tf}</button>`;
    })
    .join('');

  // Topbar Tabs for Open Charts
  const tabsHtml = state.openTabs
    .map(
      (t) => `
      <div class="chart-tab ${t.tabId === (activeTab ? activeTab.tabId : '') ? 'active' : ''}" data-action="select-tab" data-tab="${t.tabId}">
        <strong>${t.symbolCode}</strong>
        <span>${t.timeframe}</span>
        <button class="chart-tab-close" data-action="close-tab" data-tab="${t.tabId}">×</button>
      </div>
    `
    )
    .join('');

  // Side Panel Content on Desktop
  let sidePanelHtml = '';
  if (state.desktopSidePanel === 'watchlist') sidePanelHtml = renderWatchlistContent();
  else if (state.desktopSidePanel === 'analysis') sidePanelHtml = renderAnalysisContent(activeTab);
  else if (state.desktopSidePanel === 'settings') sidePanelHtml = renderSettingsContent();

  const appHtml = `
    <div class="terminal-layout">
      <!-- Top Navigation & Ticker Header Bar -->
      <header class="terminal-topbar">
        <div class="topbar-left">
          <div class="brand-badge">
            <span class="live-dot"></span>
            <span>CHART</span>
          </div>

          <!-- Symbol & Price Info Pill -->
          ${
            activeTab
              ? `
            <div class="symbol-selector-wrap" data-action="toggle-desktop-panel" data-panel="watchlist">
              <span class="ticker-name">${activeTab.symbolCode}</span>
              <span class="ticker-price ltr-num">${PriceFormatter.formatPrice(latestCandle.close, activeTab.decimals)}</span>
              <span class="pct-badge ${isBull ? 'bull' : 'bear'}">${pct}</span>
            </div>
          `
              : ''
          }

          <!-- Open Chart Tabs -->
          <div class="tab-bar" style="max-width: 320px;">
            ${tabsHtml}
          </div>
        </div>

        <!-- Timeframe Controls -->
        <div class="topbar-controls">
          <div class="chip-group">
            ${tfChipsHtml}
          </div>
          <div class="chip-group" style="margin-inline-start: 6px;">
            <button class="chip ${activeTab && activeTab.chartType !== 'line' ? 'active' : ''}" data-action="set-chart-type" data-type="candlestick" title="${i18n.t('chart_type_candles')}">
               شمعی
            </button>
            <button class="chip ${activeTab && activeTab.chartType === 'line' ? 'active' : ''}" data-action="set-chart-type" data-type="line" title="${i18n.t('chart_type_line')}">
              خطی
            </button>
          </div>
        </div>

        <!-- Right Quick Actions -->
        <div class="topbar-right">
          <button class="btn btn-sm btn-icon" data-action="sync-symbol" data-symbol="${activeTab ? activeTab.symbolCode : ''}" title="${i18n.t('action_sync_now')}">
            ↻
          </button>
          <button class="btn btn-sm btn-icon" data-action="toggle-fullscreen" title="${i18n.t('action_fullscreen')}">
            ⛶
          </button>
          <button class="btn btn-sm ${state.desktopSidePanel === 'watchlist' ? 'btn-primary' : ''}" data-action="toggle-desktop-panel" data-panel="watchlist">
            ${i18n.t('nav_watchlist')}
          </button>
          <button class="btn btn-sm ${state.desktopSidePanel === 'analysis' ? 'btn-primary' : ''}" data-action="toggle-desktop-panel" data-panel="analysis">
            ${i18n.t('nav_analysis')}
          </button>
          <button class="btn btn-sm ${state.desktopSidePanel === 'settings' ? 'btn-primary' : ''}" data-action="toggle-desktop-panel" data-panel="settings">
            ${i18n.t('nav_settings')}
          </button>
        </div>
      </header>

      <!-- Main Terminal Body -->
      <div class="terminal-body">
        <!-- Left Vertical Tool Rail (TradingView Style) -->
        <aside class="left-tool-rail">
          <button class="tool-rail-btn ${activeTab && activeTab.activeDrawingTool === 'cursor' ? 'active' : ''}" data-action="set-draw-tool" data-tool="cursor" title="${i18n.t('draw_tool_cursor')}">
            +
          </button>
          <button class="tool-rail-btn ${activeTab && activeTab.activeDrawingTool === 'trend_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="trend_line" title="${i18n.t('draw_tool_trend')}">
            ╱
          </button>
          <button class="tool-rail-btn ${activeTab && activeTab.activeDrawingTool === 'horizontal_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="horizontal_line" title="${i18n.t('draw_tool_hline')}">
            ―
          </button>
          <button class="tool-rail-btn ${activeTab && activeTab.activeDrawingTool === 'vertical_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="vertical_line" title="${i18n.t('draw_tool_vline')}">
            │
          </button>
          <div class="tool-rail-divider"></div>
          ${
            activeTab && activeTab.selectedDrawingId
              ? `<button class="tool-rail-btn danger" data-action="delete-drawing" title="${i18n.t('draw_delete_selected')}">🗑</button>`
              : ''
          }
          ${
            activeTab && (activeTab.drawings || []).length > 0
              ? `<button class="tool-rail-btn" data-action="clear-drawings" title="${i18n.t('draw_clear_all')}">✕</button>`
              : ''
          }
          <div class="tool-rail-divider"></div>
          <button class="tool-rail-btn" data-action="zoom-in" title="${i18n.t('chart_zoom_in')}">🔍+</button>
          <button class="tool-rail-btn" data-action="zoom-out" title="${i18n.t('chart_zoom_out')}">🔍-</button>
          <button class="tool-rail-btn" data-action="fit-content" title="${i18n.t('chart_fit_content')}">⤢</button>
          <button class="tool-rail-btn" data-action="reset-chart" title="${i18n.t('chart_reset_view')}">↦</button>
        </aside>

        <!-- Mobile Horizontal Tools Bar (Under 768px) -->
        <div class="mobile-chart-tools">
          <button class="chip ${activeTab && activeTab.activeDrawingTool === 'cursor' ? 'active' : ''}" data-action="set-draw-tool" data-tool="cursor">${i18n.t('draw_tool_cursor')}</button>
          <button class="chip ${activeTab && activeTab.activeDrawingTool === 'trend_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="trend_line">${i18n.t('draw_tool_trend')}</button>
          <button class="chip ${activeTab && activeTab.activeDrawingTool === 'horizontal_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="horizontal_line">${i18n.t('draw_tool_hline')}</button>
          <button class="chip ${activeTab && activeTab.activeDrawingTool === 'vertical_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="vertical_line">${i18n.t('draw_tool_vline')}</button>
          <button class="chip" data-action="fit-content">${i18n.t('chart_fit_content')}</button>
          <button class="chip" data-action="reset-chart">${i18n.t('chart_reset_view')}</button>
        </div>

        <!-- Central Chart Workspace -->
        <main class="chart-workspace">
          <!-- Floating OHLC Bar -->
          ${
            activeTab && inspected && inspected.close
              ? `
            <div class="floating-ohlc-bar">
              <span style="color: var(--primary); font-weight: 700;">${activeTab.symbolCode} · ${activeTab.timeframe}</span>
              <span>O: <span class="ohlc-val">${PriceFormatter.formatPrice(inspected.open, activeTab.decimals)}</span></span>
              <span>H: <span class="ohlc-val bull">${PriceFormatter.formatPrice(inspected.high, activeTab.decimals)}</span></span>
              <span>L: <span class="ohlc-val bear">${PriceFormatter.formatPrice(inspected.low, activeTab.decimals)}</span></span>
              <span>C: <span class="ohlc-val">${PriceFormatter.formatPrice(inspected.close, activeTab.decimals)}</span></span>
              ${inspected.volume ? `<span>V: <span class="ohlc-val">${Math.round(inspected.volume)}</span></span>` : ''}
              <span style="color: var(--text-dim);">${inspected.open_time_utc_iso || ''}</span>
            </div>
          `
              : ''
          }

          <!-- Canvas or Empty/Loading State -->
          <div class="chart-canvas-container">
            ${
              !activeTab || activeTab.candles.length === 0
                ? `<div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center;">
                     <p style="color: ${activeTab && activeTab.hasError ? 'var(--bear)' : 'var(--text-muted)'}; font-size: 14px;">
                       ${i18n.t(activeTab && activeTab.isLoading ? 'chart_state_loading' : activeTab && activeTab.hasError ? 'chart_state_error' : 'chart_state_empty')}
                     </p>
                     ${
                       activeTab && !activeTab.isLoading
                         ? `<button class="btn btn-primary" data-action="sync-symbol" data-symbol="${activeTab.symbolCode}">${i18n.t('chart_action_retry')}</button>`
                         : ''
                     }
                   </div>`
                : `<canvas id="active-chart-canvas" class="trading-canvas"></canvas>`
            }
          </div>
        </main>

        <!-- Right Collapsible Panel (Desktop) -->
        <aside class="right-panel ${state.desktopSidePanel ? '' : 'collapsed'}">
          <div class="panel-header">
            <h4 class="panel-title">${i18n.t('nav_' + (state.desktopSidePanel || 'watchlist'))}</h4>
            <button class="tool-rail-btn" data-action="toggle-desktop-panel" data-panel="${state.desktopSidePanel}">✕</button>
          </div>
          <div class="panel-content">
            ${sidePanelHtml}
          </div>
        </aside>
      </div>

      <!-- Mobile Fixed Material 3 Bottom Navigation Bar -->
      <nav class="bottom-nav">
        <button class="nav-item ${state.currentScreen === 'watchlist' ? 'active' : ''}" data-action="nav" data-screen="watchlist">
          <div class="nav-icon-pill">
            <svg viewBox="0 0 24 24"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>
          </div>
          <span>${i18n.t('nav_watchlist')}</span>
        </button>
        <button class="nav-item ${state.currentScreen === 'chart_view' ? 'active' : ''}" data-action="nav" data-screen="chart_view">
          <div class="nav-icon-pill">
            <svg viewBox="0 0 24 24"><path d="M9 4H7v2H5v12h2v2h2v-2h2V6H9V4zm0 12H7V8h2v8zm10-8h-2V4h-2v2h-2v8h2v6h2v-6h2V8zm-2 4h-2v-2h2v2z"/></svg>
          </div>
          <span>${i18n.t('nav_chart_view')}</span>
        </button>
        <button class="nav-item ${state.currentScreen === 'analysis' ? 'active' : ''}" data-action="nav" data-screen="analysis">
          <div class="nav-icon-pill">
            <svg viewBox="0 0 24 24"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>
          </div>
          <span>${i18n.t('nav_analysis')}</span>
        </button>
        <button class="nav-item ${state.currentScreen === 'settings' ? 'active' : ''}" data-action="nav" data-screen="settings">
          <div class="nav-icon-pill">
            <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
          </div>
          <span>${i18n.t('nav_settings')}</span>
        </button>
      </nav>

      <!-- Custom Symbol Modal Dialog -->
      ${
        state.showAddSymbolModal
          ? `
        <div class="modal-overlay">
          <div class="modal-dialog">
            <h4 style="margin: 0 0 14px 0;">${i18n.t('settings_add_custom_symbol')}</h4>
            <form id="add-symbol-form">
              <input class="input-field" type="text" name="symbol_code" placeholder="Symbol Code (e.g. BTCUSD, AAPL)" required />
              <input class="input-field" type="text" name="custom_title" placeholder="Display Name (e.g. Bitcoin Spot)" />
              <input class="input-field" type="number" name="decimals" placeholder="Decimals (0 - 6)" min="0" max="6" value="2" />
              <div class="btn-row" style="margin-top: 14px;">
                <button type="button" class="btn" data-action="close-modal" style="flex: 1;">Cancel</button>
                <button type="submit" class="btn btn-primary" style="flex: 1;">Save</button>
              </div>
            </form>
          </div>
        </div>
      `
          : ''
      }
    </div>
  `;

  root.innerHTML = appHtml;

  // Initialize Canvas
  if (activeTab && activeTab.candles.length > 0) {
    const canvas = document.getElementById('active-chart-canvas');
    if (canvas) {
      renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
      attachCanvasInteractions(canvas, activeTab);

      // Auto-resize observer
      const container = canvas.parentElement;
      if (container && window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
          renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
        });
        ro.observe(container);
      }
    }
  }
}

function attachCanvasInteractions(canvas, activeTab) {
  let isDragging = false;
  let isScalingY = false;
  let isDraggingDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let pinchStartDist = null;
  let pinchStartVisible = activeTab.visibleCount || 48;

  const handleTap = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const geom = computeChartGeometry(canvas, activeTab);
    if (x > geom.padLeft + geom.plotW) return;

    const tappedTime = geom.xToTime(x);
    const tappedPrice = geom.yToPrice(y);

    if (activeTab.activeDrawingTool === 'horizontal_line') {
      const d = { id: 'hl_' + Date.now(), type: 'horizontal_line', price: tappedPrice };
      activeTab.drawings = [...(activeTab.drawings || []), d];
      activeTab.selectedDrawingId = d.id;
      activeTab.activeDrawingTool = 'cursor';
      saveDrawings(activeTab.chartId, activeTab.drawings);
      renderApp();
    } else if (activeTab.activeDrawingTool === 'vertical_line') {
      const d = { id: 'vl_' + Date.now(), type: 'vertical_line', timeUtcMillis: tappedTime };
      activeTab.drawings = [...(activeTab.drawings || []), d];
      activeTab.selectedDrawingId = d.id;
      activeTab.activeDrawingTool = 'cursor';
      saveDrawings(activeTab.chartId, activeTab.drawings);
      renderApp();
    } else if (activeTab.activeDrawingTool === 'trend_line') {
      if (!activeTab.pendingTrendPoint) {
        activeTab.pendingTrendPoint = { timeUtcMillis: tappedTime, price: tappedPrice };
        renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
      } else {
        const d = {
          id: 'tl_' + Date.now(),
          type: 'trend_line',
          startTimeUtcMillis: activeTab.pendingTrendPoint.timeUtcMillis,
          startPrice: activeTab.pendingTrendPoint.price,
          endTimeUtcMillis: tappedTime,
          endPrice: tappedPrice,
        };
        activeTab.drawings = [...(activeTab.drawings || []), d];
        activeTab.selectedDrawingId = d.id;
        activeTab.pendingTrendPoint = null;
        activeTab.activeDrawingTool = 'cursor';
        saveDrawings(activeTab.chartId, activeTab.drawings);
        renderApp();
      }
    } else {
      const hit = DrawingGeometry.hitTestDrawing(
        activeTab.drawings || [],
        x,
        y,
        geom.timeToX,
        geom.priceToY
      );
      if (hit) {
        activeTab.selectedDrawingId = hit.id;
      } else {
        activeTab.selectedDrawingId = null;
        const slotW = Math.max(1, geom.plotW / Math.max(1, geom.slice.length));
        const localIdx = Math.max(0, Math.min(geom.slice.length - 1, Math.floor((x - geom.padLeft) / slotW)));
        activeTab.selectedCandleIndex = geom.startIdx + localIdx;
      }
      renderApp();
    }
  };

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    lastX = e.clientX;
    lastY = e.clientY;
    const geom = computeChartGeometry(canvas, activeTab);
    if (x >= geom.padLeft + geom.plotW) {
      isScalingY = true;
    } else if (activeTab.activeDrawingTool === 'cursor' && activeTab.selectedDrawingId) {
      isDraggingDrawing = true;
    } else {
      isDragging = true;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!isDragging && !isScalingY && !isDraggingDrawing) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    const geom = computeChartGeometry(canvas, activeTab);
    const slotW = Math.max(3, geom.plotW / Math.max(1, geom.slice.length));

    if (isScalingY) {
      activeTab.isAutoScaleY = false;
      activeTab.yPriceScaleFactor = Math.max(
        0.25,
        Math.min(4.0, (activeTab.yPriceScaleFactor || 1.0) + dy * 0.005)
      );
      lastY = e.clientY;
      renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
    } else if (isDraggingDrawing && activeTab.selectedDrawingId) {
      const deltaSlots = Math.round(dx / slotW);
      const deltaTimeMs = deltaSlots * geom.stepMs;
      const deltaPrice = (-dy / Math.max(1, geom.plotH)) * geom.fullSpan;
      activeTab.drawings = (activeTab.drawings || []).map((d) =>
        d.id === activeTab.selectedDrawingId
          ? DrawingGeometry.translateDrawing(d, deltaTimeMs, deltaPrice)
          : d
      );
      saveDrawings(activeTab.chartId, activeTab.drawings);
      lastX = e.clientX;
      lastY = e.clientY;
      renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
    } else if (isDragging) {
      const deltaBars = Math.round(dx / slotW);
      if (deltaBars !== 0) {
        const maxOff = Math.max(0, activeTab.candles.length - (activeTab.visibleCount || 48));
        activeTab.scrollOffset = Math.max(0, Math.min(maxOff, (activeTab.scrollOffset || 0) + deltaBars));
        lastX = e.clientX;
        renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
      }
    }
  });

  window.addEventListener('pointerup', () => {
    isDragging = false;
    isScalingY = false;
    isDraggingDrawing = false;
  });

  canvas.addEventListener('click', (e) => {
    handleTap(e.clientX, e.clientY);
  });

  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const geom = computeChartGeometry(canvas, activeTab);
    if (x >= geom.padLeft + geom.plotW) {
      activeTab.isAutoScaleY = true;
      activeTab.yPriceScaleFactor = 1.0;
      renderApp();
    }
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 6 : -6;
      const maxCap = Math.max(12, Math.min(160, activeTab.candles.length));
      activeTab.visibleCount = Math.max(12, Math.min(maxCap, (activeTab.visibleCount || 48) + delta));
      renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
    },
    { passive: false }
  );

  canvas.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 2) {
        pinchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        pinchStartVisible = activeTab.visibleCount || 48;
      }
    },
    { passive: true }
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length === 2 && pinchStartDist) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = Math.max(0.25, dist / pinchStartDist);
        const maxCap = Math.max(12, Math.min(160, activeTab.candles.length));
        activeTab.visibleCount = Math.max(12, Math.min(maxCap, Math.round(pinchStartVisible / factor)));
        renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
      }
    },
    { passive: false }
  );
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const activeTab = state.openTabs.find((t) => t.tabId === state.activeTabId) || state.openTabs[0];

  if (action === 'set-lang') {
    i18n.setLanguage(btn.getAttribute('data-lang'));
    renderApp();
  } else if (action === 'set-theme') {
    state.isDarkTheme = btn.getAttribute('data-theme') === 'dark';
    applyTheme();
    renderApp();
  } else if (action === 'nav') {
    const screen = btn.getAttribute('data-screen');
    state.currentScreen = screen;
    if (window.innerWidth >= 769) {
      if (screen === 'chart_view') {
        state.desktopSidePanel = null;
      } else {
        state.desktopSidePanel = screen;
      }
    }
    renderApp();
  } else if (action === 'toggle-desktop-panel') {
    const panel = btn.getAttribute('data-panel');
    state.desktopSidePanel = state.desktopSidePanel === panel ? null : panel;
    renderApp();
  } else if (action === 'toggle-fullscreen') {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  } else if (action === 'sync-symbol') {
    await syncSymbolNow(btn.getAttribute('data-symbol'));
  } else if (action === 'sync-all') {
    for (const s of state.symbols.filter((x) => x.inWatchlist)) {
      await syncSymbolNow(s.symbolCode);
    }
  } else if (action === 'open-chart') {
    openSymbolInTab(btn.getAttribute('data-symbol'));
  } else if (action === 'select-tab') {
    state.activeTabId = btn.getAttribute('data-tab');
    renderApp();
  } else if (action === 'close-tab') {
    e.stopPropagation();
    const tid = btn.getAttribute('data-tab');
    state.openTabs = state.openTabs.filter((t) => t.tabId !== tid);
    if (state.activeTabId === tid) {
      state.activeTabId = state.openTabs.length ? state.openTabs[state.openTabs.length - 1].tabId : null;
    }
    renderApp();
  } else if (action === 'set-timeframe' && activeTab) {
    const tf = btn.getAttribute('data-tf');
    activeTab.timeframe = tf;
    activeTab.scrollOffset = 0;
    activeTab.selectedCandleIndex = null;
    activeTab.candles = getCachedOrAggregatedCandles(activeTab.symbolCode, activeTab.provider, tf);
    renderApp();
    await syncSymbolNow(activeTab.symbolCode, tf);
  } else if (action === 'set-chart-type' && activeTab) {
    activeTab.chartType = btn.getAttribute('data-type');
    renderApp();
  } else if (
    (action === 'zoom-in' ||
      action === 'zoom-out' ||
      action === 'fit-content' ||
      action === 'reset-chart' ||
      action === 'auto-scale-y') &&
    activeTab
  ) {
    const maxCap = Math.max(12, Math.min(160, activeTab.candles.length));
    if (action === 'zoom-in') activeTab.visibleCount = Math.max(12, (activeTab.visibleCount || 48) - 8);
    if (action === 'zoom-out') activeTab.visibleCount = Math.min(maxCap, (activeTab.visibleCount || 48) + 8);
    if (action === 'fit-content') {
      activeTab.visibleCount = maxCap;
      activeTab.scrollOffset = 0;
      activeTab.isAutoScaleY = true;
      activeTab.yPriceScaleFactor = 1.0;
    }
    if (action === 'reset-chart') {
      activeTab.scrollOffset = 0;
      activeTab.selectedCandleIndex = null;
    }
    if (action === 'auto-scale-y') {
      activeTab.isAutoScaleY = true;
      activeTab.yPriceScaleFactor = 1.0;
    }
    renderApp();
  } else if (action === 'set-draw-tool' && activeTab) {
    activeTab.activeDrawingTool = btn.getAttribute('data-tool');
    activeTab.pendingTrendPoint = null;
    renderApp();
  } else if (action === 'delete-drawing' && activeTab) {
    activeTab.drawings = (activeTab.drawings || []).filter((d) => d.id !== activeTab.selectedDrawingId);
    activeTab.selectedDrawingId = null;
    saveDrawings(activeTab.chartId, activeTab.drawings);
    renderApp();
  } else if (action === 'clear-drawings' && activeTab) {
    activeTab.drawings = [];
    activeTab.selectedDrawingId = null;
    activeTab.pendingTrendPoint = null;
    saveDrawings(activeTab.chartId, []);
    renderApp();
  } else if (action === 'select-provider') {
    const code = btn.getAttribute('data-symbol');
    const prov = btn.getAttribute('data-provider');
    const sym = state.symbols.find((s) => s.symbolCode === code);
    if (sym) {
      sym.activeProvider = prov;
      sym.timeframe = prov === 'eia_brent_spot' ? 'D1' : 'M15';
      sym.candles = getCachedOrAggregatedCandles(sym.symbolCode, sym.activeProvider, sym.timeframe);
      const latest = sym.candles[sym.candles.length - 1];
      sym.lastClose = latest ? latest.close : null;
      sym.lastCandleUtc = latest ? latest.open_time_utc_iso : null;
      saveSymbolsToStorage();
      renderApp();
      await syncSymbolNow(sym.symbolCode, sym.timeframe);
    }
  } else if (action === 'set-color') {
    const target = btn.getAttribute('data-target');
    const color = btn.getAttribute('data-color');
    saveChartPreferences({ [target]: color });
    renderApp();
  } else if (action === 'open-add-symbol-modal') {
    state.showAddSymbolModal = true;
    renderApp();
  } else if (action === 'close-modal') {
    state.showAddSymbolModal = false;
    renderApp();
  } else if (action === 'delete-symbol') {
    deleteSymbol(btn.getAttribute('data-symbol'));
  } else if (action === 'sign-out') {
    state.isAuthenticated = false;
    renderApp();
  }
});

document.addEventListener('change', (e) => {
  const input = e.target.closest('[data-action="toggle-watchlist"]');
  if (!input) return;
  const code = input.getAttribute('data-symbol');
  const sym = state.symbols.find((s) => s.symbolCode === code);
  if (sym) {
    sym.inWatchlist = Boolean(input.checked);
    saveSymbolsToStorage();
    renderApp();
  }
});

document.addEventListener('submit', async (e) => {
  if (e.target.id === 'add-symbol-form') {
    e.preventDefault();
    const fd = new FormData(e.target);
    const code = (fd.get('symbol_code') || '').toString().trim();
    const title = (fd.get('custom_title') || '').toString().trim();
    const dec = parseInt(fd.get('decimals') || '2', 10);
    if (code) {
      addCustomSymbol(code, title, dec, 'dukascopy');
      state.showAddSymbolModal = false;
      renderApp();
    }
    return;
  }

  if (e.target.id !== 'auth-form') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const username = (fd.get('username') || '').toString().trim();
  const password = (fd.get('password') || '').toString();
  const confirmPassword = (fd.get('confirm_password') || '').toString();

  if (!username || !password) {
    state.authErrorKey = 'error_empty_credentials';
    renderApp();
    return;
  }
  if (!state.isOwnerRegistered) {
    if (password.length < 4) {
      state.authErrorKey = 'error_password_short';
      renderApp();
      return;
    }
    if (password !== confirmPassword) {
      state.authErrorKey = 'error_password_mismatch';
      renderApp();
      return;
    }
    try {
      await fetch('./api/v1/auth.php?action=register_owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
    } catch (_) {}
    localStorage.setItem('ci_owner_username', username);
    localStorage.setItem('ci_owner_pass_b64', btoa(unescape(encodeURIComponent(password))));
    state.isOwnerRegistered = true;
    state.ownerUsername = username;
    state.isAuthenticated = true;
    state.authErrorKey = null;
    renderApp();
  } else {
    let ok = false;
    try {
      const res = await fetch('./api/v1/auth.php?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (json && json.ok) ok = true;
    } catch (_) {}
    const savedPass = localStorage.getItem('ci_owner_pass_b64');
    if (
      !ok &&
      username.toLowerCase() === (state.ownerUsername || '').toLowerCase() &&
      savedPass === btoa(unescape(encodeURIComponent(password)))
    ) {
      ok = true;
    }
    if (!ok) {
      state.authErrorKey = 'error_invalid_credentials';
      renderApp();
      return;
    }
    state.isAuthenticated = true;
    state.authErrorKey = null;
    renderApp();
  }
});

window.addEventListener('resize', () => {
  if (state.isAuthenticated && state.currentScreen === 'chart_view') {
    const activeTab = state.openTabs.find((t) => t.tabId === state.activeTabId) || state.openTabs[0];
    const canvas = document.getElementById('active-chart-canvas');
    if (canvas && activeTab) {
      renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
    }
  }
});

(async function bootstrap() {
  applyTheme();
  loadSymbolsFromStorage();
  await i18n.init();
  await checkBackendOwnerStatus();
  renderApp();
  for (const s of state.symbols.filter((x) => x.inWatchlist && x.candles.length === 0)) {
    syncSymbolNow(s.symbolCode, s.timeframe);
  }
})();
