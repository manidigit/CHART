import { I18nManager } from './core/i18n.js';
import { PriceFormatter } from './algorithms/priceFormatter.js';
import { TimeframeAggregator } from './algorithms/timeframeAggregator.js';
import { DrawingGeometry } from './algorithms/drawingGeometry.js';
import { computeChartGeometry, renderCandlestickCanvas } from './components/chartRenderer.js';

const i18n = new I18nManager();

const DEFAULT_SYMBOLS = [
  {
    chartId: 'chart_xauusd_main',
    symbolCode: 'XAUUSD',
    decimals: 2,
    inWatchlist: true,
    activeProvider: 'twelve_data',
    allowedProviders: ['twelve_data', 'dukascopy', 'yahoo_finance'],
    timeframe: 'M15',
  },
  {
    chartId: 'chart_spotbrent_main',
    symbolCode: 'SPOTBRENT',
    decimals: 2,
    inWatchlist: true,
    activeProvider: 'dukascopy',
    allowedProviders: ['dukascopy', 'twelve_data', 'eia_brent_spot', 'yahoo_finance'],
    timeframe: 'M15',
  },
  {
    chartId: 'chart_brent_futures',
    symbolCode: 'BRENT_FUTURES',
    decimals: 2,
    inWatchlist: false,
    activeProvider: 'yahoo_finance',
    allowedProviders: ['yahoo_finance', 'dukascopy', 'eia_brent_spot'],
    timeframe: 'M15',
  },
  {
    chartId: 'chart_xagusd_spot',
    symbolCode: 'XAGUSD',
    decimals: 3,
    inWatchlist: false,
    activeProvider: 'twelve_data',
    allowedProviders: ['twelve_data', 'dukascopy', 'yahoo_finance'],
    timeframe: 'M15',
  },
  {
    chartId: 'chart_eurusd_spot',
    symbolCode: 'EURUSD',
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
  currentScreen: 'watchlist',
  symbols: [],
  openTabs: [],
  activeTabId: null,
};

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
    localStorage.setItem(`ci_candles_v2_${exactKey}`, JSON.stringify(candles.slice(-160)));
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
  try {
    saved = JSON.parse(localStorage.getItem('ci_symbols') || 'null');
  } catch (_) {}
  state.symbols = DEFAULT_SYMBOLS.map((item) => {
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
    const url = `./api/v1/candles_sync.php?symbol=${encodeURIComponent(
      sym.symbolCode
    )}&provider=${encodeURIComponent(sym.activeProvider)}&timeframe=${encodeURIComponent(
      tf
    )}&limit=160`;
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
    const cached = getCachedOrAggregatedCandles(sym.symbolCode, sym.activeProvider, sym.timeframe);
    existing = {
      tabId,
      chartId: sym.chartId,
      symbolCode: sym.symbolCode,
      decimals: sym.decimals,
      provider: sym.activeProvider,
      timeframe: sym.timeframe,
      chartType: 'candlestick',
      candles: cached,
      visibleCount: 48,
      scrollOffset: 0,
      selectedCandleIndex: null,
      isAutoScaleY: true,
      yPriceScaleFactor: 1.0,
      activeDrawingTool: 'cursor',
      drawings: loadDrawings(sym.chartId),
      selectedDrawingId: null,
      pendingTrendPoint: null,
      isLoading: cached.length === 0,
      hasError: false,
    };
    state.openTabs.push(existing);
  }
  state.activeTabId = tabId;
  state.currentScreen = 'chart_view';
  renderApp();

  if (existing.candles.length === 0) {
    syncSymbolNow(sym.symbolCode, existing.timeframe);
  }
}

function renderLanguageThemeBar() {
  return `
    <div class="chip-group" style="margin-bottom: 14px;">
      <button class="chip ${i18n.lang === 'fa' ? 'active' : ''}" data-action="set-lang" data-lang="fa" data-testid="lang_fa_chip">
        ${i18n.t('settings_lang_fa')}
      </button>
      <button class="chip ${i18n.lang === 'en' ? 'active' : ''}" data-action="set-lang" data-lang="en" data-testid="lang_en_chip">
        ${i18n.t('settings_lang_en')}
      </button>
      <button class="chip ${state.isDarkTheme ? 'active' : ''}" data-action="set-theme" data-theme="dark" data-testid="theme_dark_chip">
        ${i18n.t('settings_theme_dark')}
      </button>
      <button class="chip ${!state.isDarkTheme ? 'active' : ''}" data-action="set-theme" data-theme="light" data-testid="theme_light_chip">
        ${i18n.t('settings_theme_light')}
      </button>
    </div>
  `;
}

function renderLoginScreen() {
  const isSetup = !state.isOwnerRegistered;
  return `
    <div class="app-container" style="max-width: 500px; margin-top: 24px;">
      <h1 style="color: var(--primary); margin-bottom: 4px;">${i18n.t('app_name')}</h1>
      <p style="color: var(--muted); margin-top: 0;">${i18n.t('app_subtitle')}</p>
      ${renderLanguageThemeBar()}
      <div class="card" data-testid="login_card">
        <h2 style="margin-top: 0;">${i18n.t(isSetup ? 'login_setup_title' : 'login_signin_title')}</h2>
        <p style="color: var(--muted);">${i18n.t(isSetup ? 'login_setup_subtitle' : 'login_signin_subtitle')}</p>
        <form id="auth-form">
          <input class="input-field" name="username" placeholder="${i18n.t('label_username')}" value="${state.ownerUsername}" data-testid="username_input" />
          <input class="input-field" type="password" name="password" placeholder="${i18n.t('label_password')}" data-testid="password_input" />
          ${
            isSetup
              ? `<input class="input-field" type="password" name="confirm_password" placeholder="${i18n.t('label_confirm_password')}" data-testid="confirm_password_input" />`
              : ''
          }
          ${
            state.authErrorKey
              ? `<p style="color: var(--bear); font-weight: 600;">${i18n.t(state.authErrorKey)}</p>`
              : ''
          }
          <button type="submit" class="btn btn-primary" style="width: 100%;" data-testid="login_submit_button">
            ${i18n.t(isSetup ? 'action_create_owner_account' : 'action_sign_in')}
          </button>
        </form>
      </div>
    </div>
  `;
}

function renderWatchlistScreen() {
  const watchlist = state.symbols.filter((s) => s.inWatchlist);
  const cardsHtml = watchlist
    .map(
      (s) => `
      <div class="card" data-testid="watchlist_card_${s.symbolCode.toLowerCase()}">
        <div class="row-between">
          <div>
            <div style="font-size: 16px; font-weight: 700;">${i18n.t('symbol_' + s.symbolCode)}</div>
            <div style="margin-top: 6px; display: flex; gap: 8px; align-items: center;">
              <span class="ltr-num" style="color: var(--muted); font-weight: 600;">${s.symbolCode}</span>
              <span class="source-badge ltr-num">${s.activeProvider} · ${s.timeframe}</span>
            </div>
          </div>
          <div class="ltr-num" style="text-align: right;">
            <div style="font-size: 20px; font-weight: 700; color: var(--primary);">
              ${PriceFormatter.formatPrice(s.lastClose, s.decimals)}
            </div>
            <div style="font-size: 12px; color: var(--muted);">${s.candles.length} bars</div>
          </div>
        </div>
        <div class="row-between" style="margin-top: 12px; font-size: 13px;">
          <span style="color: var(--muted);">${i18n.t('label_last_candle_utc')}</span>
          <span class="ltr-num" style="color: var(--bull);">${s.lastCandleUtc || i18n.t('status_never_synced')}</span>
        </div>
        <div class="btn-row" style="margin-top: 14px;">
          <button class="btn" data-action="sync-symbol" data-symbol="${s.symbolCode}" ${s.isSyncing ? 'disabled' : ''} data-testid="sync_now_button_${s.symbolCode.toLowerCase()}">
            ${s.isSyncing ? i18n.t('action_syncing') : i18n.t('action_sync_now')}
          </button>
          <button class="btn btn-primary" data-action="open-chart" data-symbol="${s.symbolCode}" data-testid="open_chart_button_${s.symbolCode.toLowerCase()}">
            ${i18n.t('action_open_chart_view')}
          </button>
        </div>
      </div>
    `
    )
    .join('');

  return `
    <div class="app-container">
      <div class="row-between" style="margin-bottom: 12px;">
        <div>
          <h2 style="margin: 0;">${i18n.t('watchlist_title')}</h2>
          <p style="color: var(--muted); margin: 4px 0 0 0;">${i18n.t('watchlist_subtitle')}</p>
        </div>
      </div>
      <div class="btn-row" style="margin-bottom: 14px;">
        <button class="btn btn-primary" data-action="sync-all" data-testid="sync_all_watchlist_button">
          ${i18n.t('action_sync_all')}
        </button>
        <button class="btn" data-action="nav" data-screen="settings" style="flex: 0 0 auto;">
          ${i18n.t('nav_settings')}
        </button>
      </div>
      ${
        state.statusBannerKey
          ? `<p style="color: var(--bull); font-weight: 600;">${i18n.t(state.statusBannerKey)}</p>`
          : ''
      }
      ${
        watchlist.length === 0
          ? `<div class="card"><h3>${i18n.t('watchlist_empty_title')}</h3><p style="color: var(--muted);">${i18n.t('watchlist_empty_hint')}</p></div>`
          : cardsHtml
      }
    </div>
  `;
}

function renderChartViewScreen() {
  const activeTab = state.openTabs.find((t) => t.tabId === state.activeTabId) || state.openTabs[0] || null;
  if (!activeTab) {
    return `
      <div class="app-container">
        <div class="row-between" style="margin-bottom: 14px;">
          <h2 style="margin: 0;">${i18n.t('chart_view_title')}</h2>
          <button class="btn" data-action="nav" data-screen="watchlist" style="flex: 0 0 auto;">
            ${i18n.t('chart_open_from_watchlist')}
          </button>
        </div>
        <div class="card" style="text-align: center; padding: 42px 18px;">
          <h3>${i18n.t('chart_view_no_tabs_title')}</h3>
          <p style="color: var(--muted);">${i18n.t('chart_view_no_tabs_hint')}</p>
          <button class="btn btn-primary" data-action="nav" data-screen="watchlist" style="max-width: 240px;">
            ${i18n.t('chart_open_from_watchlist')}
          </button>
        </div>
      </div>
    `;
  }

  const tabsHtml = state.openTabs
    .map(
      (t) => `
      <div class="chart-tab ${t.tabId === activeTab.tabId ? 'active' : ''}" data-action="select-tab" data-tab="${t.tabId}" data-testid="chart_tab_${t.tabId.toLowerCase()}">
        <strong>${t.symbolCode}</strong>
        <span style="font-size: 12px; color: var(--muted);">${t.provider} (${t.timeframe})</span>
        <button class="chart-tab-close" data-action="close-tab" data-tab="${t.tabId}" title="${i18n.t('chart_close_tab')}">×</button>
      </div>
    `
    )
    .join('');

  const inspected =
    activeTab.selectedCandleIndex !== null &&
    activeTab.candles[activeTab.selectedCandleIndex]
      ? activeTab.candles[activeTab.selectedCandleIndex]
      : activeTab.candles[activeTab.candles.length - 1] || {};
  const pct = PriceFormatter.formatSignedPct(inspected.open, inspected.close);
  const allowedTfs = activeTab.provider === 'eia_brent_spot' ? ['D1'] : ['M15', 'H1', 'H4', 'D1'];

  const tfButtonsHtml = ['M15', 'H1', 'H4', 'D1']
    .map((tf) => {
      const enabled = allowedTfs.includes(tf);
      return `<button class="chip ltr-num ${activeTab.timeframe === tf ? 'active' : ''}" data-action="set-timeframe" data-tf="${tf}" ${!enabled ? 'disabled' : ''} data-testid="chart_tf_${tf.toLowerCase()}_button">${tf}</button>`;
    })
    .join('');

  return `
    <div class="app-container">
      <div class="row-between" style="margin-bottom: 10px;">
        <h2 style="margin: 0;">${i18n.t('chart_view_title')}</h2>
        <button class="btn" data-action="nav" data-screen="watchlist" style="flex: 0 0 auto;" data-testid="chart_back_to_watchlist_button">
          ${i18n.t('chart_open_from_watchlist')}
        </button>
      </div>
      <div class="tab-bar">${tabsHtml}</div>

      <!-- Timeframe, Chart Type & Navigation Toolbar -->
      <div class="card-subtle" style="padding: 10px;">
        <div class="row-between" style="gap: 8px;">
          <div class="chip-group">${tfButtonsHtml}</div>
          <div class="chip-group">
            <button class="chip ${activeTab.chartType !== 'line' ? 'active' : ''}" data-action="set-chart-type" data-type="candlestick" data-testid="chart_type_candlestick_button">${i18n.t('chart_type_candles')}</button>
            <button class="chip ${activeTab.chartType === 'line' ? 'active' : ''}" data-action="set-chart-type" data-type="line" data-testid="chart_type_line_button">${i18n.t('chart_type_line')}</button>
          </div>
        </div>
        <div class="chip-group" style="margin-top: 8px;">
          <button class="chip" data-action="zoom-in" data-testid="chart_zoom_in_button">${i18n.t('chart_zoom_in')}</button>
          <button class="chip" data-action="zoom-out" data-testid="chart_zoom_out_button">${i18n.t('chart_zoom_out')}</button>
          <button class="chip" data-action="fit-content" data-testid="chart_fit_content_button">${i18n.t('chart_fit_content')}</button>
          <button class="chip" data-action="reset-chart" data-testid="chart_reset_latest_button">${i18n.t('chart_reset_view')}</button>
          <button class="chip ${activeTab.isAutoScaleY !== false ? 'active' : ''}" data-action="auto-scale-y" data-testid="chart_auto_scale_button">
            ${activeTab.isAutoScaleY !== false ? i18n.t('chart_auto_scale') : i18n.t('chart_manual_scale')}
          </button>
        </div>
      </div>

      <!-- Drawing Tools Bar -->
      <div class="card-subtle" style="padding: 10px;">
        <div class="chip-group">
          <button class="chip ${activeTab.activeDrawingTool === 'cursor' ? 'active' : ''}" data-action="set-draw-tool" data-tool="cursor" data-testid="draw_tool_cursor_button">${i18n.t('draw_tool_cursor')}</button>
          <button class="chip ${activeTab.activeDrawingTool === 'horizontal_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="horizontal_line" data-testid="draw_tool_hline_button">${i18n.t('draw_tool_hline')}</button>
          <button class="chip ${activeTab.activeDrawingTool === 'vertical_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="vertical_line" data-testid="draw_tool_vline_button">${i18n.t('draw_tool_vline')}</button>
          <button class="chip ${activeTab.activeDrawingTool === 'trend_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="trend_line" data-testid="draw_tool_trend_button">${i18n.t('draw_tool_trend')}</button>
          ${
            activeTab.selectedDrawingId
              ? `<button class="chip" style="border-color: var(--bear); color: var(--bear);" data-action="delete-drawing" data-testid="draw_delete_selected_button">${i18n.t('draw_delete_selected')}</button>`
              : ''
          }
          ${
            (activeTab.drawings || []).length > 0
              ? `<button class="chip" data-action="clear-drawings" data-testid="draw_clear_all_button">${i18n.t('draw_clear_all')} (${activeTab.drawings.length})</button>`
              : ''
          }
        </div>
      </div>

      <!-- Main Chart Card -->
      <div class="card" style="padding: 12px;">
        <div class="row-between ltr-num" style="margin-bottom: 6px; font-size: 13px;">
          <strong style="color: var(--primary);">${activeTab.symbolCode} · ${activeTab.provider} · ${activeTab.timeframe}</strong>
          <span style="color: var(--muted);">${inspected.open_time_utc_iso || ''}</span>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 10px;">
          <span>O: ${PriceFormatter.formatPrice(inspected.open, activeTab.decimals)}</span>
          <span style="color: var(--bull);">H: ${PriceFormatter.formatPrice(inspected.high, activeTab.decimals)}</span>
          <span style="color: var(--bear);">L: ${PriceFormatter.formatPrice(inspected.low, activeTab.decimals)}</span>
          <strong>C: ${PriceFormatter.formatPrice(inspected.close, activeTab.decimals)} (${pct})</strong>
          ${inspected.volume ? `<span style="color: var(--muted);">V: ${Math.round(inspected.volume)}</span>` : ''}
        </div>
        ${
          activeTab.candles.length === 0
            ? `<div style="height: 350px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center;">
                 <p style="color: ${activeTab.hasError ? 'var(--bear)' : 'var(--muted)'};">
                   ${i18n.t(activeTab.isLoading ? 'chart_state_loading' : activeTab.hasError ? 'chart_state_error' : 'chart_state_empty')}
                 </p>
                 ${
                   !activeTab.isLoading
                     ? `<button class="btn btn-primary" style="max-width: 200px;" data-action="sync-symbol" data-symbol="${activeTab.symbolCode}">${i18n.t('chart_action_retry')}</button>`
                     : ''
                 }
               </div>`
            : `<canvas id="active-chart-canvas" class="trading-canvas"></canvas>`
        }
        <div class="btn-row" style="margin-top: 10px;">
          <button class="btn btn-primary" data-action="sync-symbol" data-symbol="${activeTab.symbolCode}">
            ${i18n.t('action_sync_now')}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderSettingsScreen() {
  const symbolsHtml = state.symbols
    .map(
      (s) => `
      <div class="card-subtle" data-testid="settings_symbol_card_${s.symbolCode.toLowerCase()}">
        <div class="row-between">
          <div>
            <strong>${i18n.t('symbol_' + s.symbolCode)}</strong>
            <div class="ltr-num" style="font-size: 12px; color: var(--primary);">${s.symbolCode} · ${s.timeframe}</div>
          </div>
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="checkbox" data-action="toggle-watchlist" data-symbol="${s.symbolCode}" ${s.inWatchlist ? 'checked' : ''} />
            <span>${i18n.t('settings_in_watchlist')}</span>
          </label>
        </div>
        <div style="margin-top: 8px; font-size: 13px; color: var(--muted);">${i18n.t('settings_select_provider')}</div>
        <div class="chip-group" style="margin-top: 6px;">
          ${s.allowedProviders
            .map(
              (p) => `
              <button class="chip ${s.activeProvider === p ? 'active' : ''}" data-action="select-provider" data-symbol="${s.symbolCode}" data-provider="${p}">
                ${i18n.t('provider_' + p)}
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
    <div class="app-container">
      <h2>${i18n.t('settings_title')}</h2>
      <div class="card">
        <h3 style="margin-top: 0;">${i18n.t('settings_appearance_section')}</h3>
        ${renderLanguageThemeBar()}
      </div>
      <div class="card">
        <h3 style="margin-top: 0;">${i18n.t('settings_symbols_section')}</h3>
        <p style="color: var(--muted);">${i18n.t('settings_symbols_hint')}</p>
        ${symbolsHtml}
      </div>
      <div class="card">
        <h3 style="margin-top: 0;">${i18n.t('settings_account_section')} (${state.ownerUsername})</h3>
        <button class="btn" data-action="sign-out" data-testid="settings_sign_out_button">
          ${i18n.t('action_sign_out')}
        </button>
      </div>
    </div>
  `;
}

function renderBottomNav() {
  if (!state.isAuthenticated) return '';
  const wlCount = state.symbols.filter((s) => s.inWatchlist).length;
  const tabCount = state.openTabs.length;
  return `
    <nav class="bottom-nav">
      <button class="nav-item ${state.currentScreen === 'watchlist' ? 'active' : ''}" data-action="nav" data-screen="watchlist" data-testid="nav_watchlist_item">
        ${i18n.t('nav_watchlist')} (${wlCount})
      </button>
      <button class="nav-item ${state.currentScreen === 'chart_view' ? 'active' : ''}" data-action="nav" data-screen="chart_view" data-testid="nav_chart_view_item">
        ${i18n.t('nav_chart_view')} (${tabCount})
      </button>
      <button class="nav-item ${state.currentScreen === 'settings' ? 'active' : ''}" data-action="nav" data-screen="settings" data-testid="nav_settings_item">
        ${i18n.t('nav_settings')}
      </button>
    </nav>
  `;
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

function renderApp() {
  const root = document.getElementById('app-root');
  if (!root) return;

  if (!state.isAuthenticated) {
    root.innerHTML = renderLoginScreen();
  } else {
    let bodyHtml = '';
    if (state.currentScreen === 'watchlist') bodyHtml = renderWatchlistScreen();
    else if (state.currentScreen === 'chart_view') bodyHtml = renderChartViewScreen();
    else bodyHtml = renderSettingsScreen();
    root.innerHTML = bodyHtml + renderBottomNav();
  }

  if (state.isAuthenticated && state.currentScreen === 'chart_view') {
    const activeTab = state.openTabs.find((t) => t.tabId === state.activeTabId) || state.openTabs[0];
    const canvas = document.getElementById('active-chart-canvas');
    if (canvas && activeTab && activeTab.candles.length > 0) {
      renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
      attachCanvasInteractions(canvas, activeTab);
    }
  }
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
    state.currentScreen = btn.getAttribute('data-screen');
    state.statusBannerKey = null;
    renderApp();
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
