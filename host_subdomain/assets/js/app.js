import { I18nManager } from './core/i18n.js';
import { PriceFormatter } from './algorithms/priceFormatter.js';
import { renderCandlestickCanvas } from './components/chartRenderer.js';

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

function loadSymbolsFromStorage() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem('ci_symbols') || 'null');
  } catch (_) {}
  state.symbols = DEFAULT_SYMBOLS.map((item) => {
    const match = Array.isArray(saved) ? saved.find((s) => s.symbolCode === item.symbolCode) : null;
    const activeProvider = match && item.allowedProviders.includes(match.activeProvider)
      ? match.activeProvider
      : item.activeProvider;
    const timeframe = activeProvider === 'eia_brent_spot' ? 'D1' : 'M15';
    const candles = PriceFormatter.buildSeedCandles(item.symbolCode, activeProvider, timeframe, 96);
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

async function syncSymbolNow(symbolCode) {
  const sym = state.symbols.find((s) => s.symbolCode === symbolCode);
  if (!sym) return;
  sym.isSyncing = true;
  renderApp();

  try {
    const url = `./api/v1/candles_sync.php?symbol=${encodeURIComponent(sym.symbolCode)}&provider=${encodeURIComponent(sym.activeProvider)}&timeframe=${encodeURIComponent(sym.timeframe)}&limit=96`;
    const res = await fetch(url);
    const json = await res.json();
    if (json && json.ok && json.data && Array.isArray(json.data.candles) && json.data.candles.length > 0) {
      sym.candles = json.data.candles;
    } else {
      sym.candles = PriceFormatter.buildSeedCandles(sym.symbolCode, sym.activeProvider, sym.timeframe, 96);
    }
  } catch (_) {
    sym.candles = PriceFormatter.buildSeedCandles(sym.symbolCode, sym.activeProvider, sym.timeframe, 96);
  }

  const latest = sym.candles[sym.candles.length - 1];
  sym.lastClose = latest ? latest.close : null;
  sym.lastCandleUtc = latest ? latest.open_time_utc_iso : null;
  sym.isSyncing = false;
  state.statusBannerKey = 'status_synced_ok';

  // Update matching open tab if open
  const tabId = `${sym.symbolCode}_${sym.activeProvider}_${sym.timeframe}`;
  const openTab = state.openTabs.find((t) => t.tabId === tabId);
  if (openTab) {
    openTab.candles = sym.candles;
  }
  renderApp();
}

function openSymbolInTab(symbolCode) {
  const sym = state.symbols.find((s) => s.symbolCode === symbolCode);
  if (!sym) return;
  const tabId = `${sym.symbolCode}_${sym.activeProvider}_${sym.timeframe}`;
  let existing = state.openTabs.find((t) => t.tabId === tabId);
  if (!existing) {
    existing = {
      tabId,
      symbolCode: sym.symbolCode,
      decimals: sym.decimals,
      provider: sym.activeProvider,
      timeframe: sym.timeframe,
      candles: sym.candles,
      visibleCount: 48,
      scrollOffset: 0,
    };
    state.openTabs.push(existing);
  }
  state.activeTabId = tabId;
  state.currentScreen = 'chart_view';
  renderApp();
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

  const last = activeTab.candles[activeTab.candles.length - 1] || {};
  const pct = PriceFormatter.formatSignedPct(last.open, last.close);

  return `
    <div class="app-container">
      <div class="row-between" style="margin-bottom: 10px;">
        <h2 style="margin: 0;">${i18n.t('chart_view_title')}</h2>
        <button class="btn" data-action="nav" data-screen="watchlist" style="flex: 0 0 auto;" data-testid="chart_back_to_watchlist_button">
          ${i18n.t('chart_open_from_watchlist')}
        </button>
      </div>
      <div class="tab-bar">${tabsHtml}</div>
      <div class="card" style="padding: 12px;">
        <div class="row-between ltr-num" style="margin-bottom: 8px; font-size: 13px;">
          <strong style="color: var(--primary);">${activeTab.symbolCode} · ${activeTab.provider} · ${activeTab.timeframe}</strong>
          <span style="color: var(--muted);">${last.open_time_utc_iso || ''}</span>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 10px;">
          <span>O: ${PriceFormatter.formatPrice(last.open, activeTab.decimals)}</span>
          <span style="color: var(--bull);">H: ${PriceFormatter.formatPrice(last.high, activeTab.decimals)}</span>
          <span style="color: var(--bear);">L: ${PriceFormatter.formatPrice(last.low, activeTab.decimals)}</span>
          <strong>C: ${PriceFormatter.formatPrice(last.close, activeTab.decimals)} (${pct})</strong>
        </div>
        <canvas id="active-chart-canvas" style="width: 100%; height: 320px; display: block; border-radius: 10px;"></canvas>
        <div class="btn-row" style="margin-top: 10px;">
          <button class="btn" data-action="zoom-in">${i18n.t('chart_zoom_in')}</button>
          <button class="btn" data-action="zoom-out">${i18n.t('chart_zoom_out')}</button>
          <button class="btn" data-action="reset-chart">${i18n.t('chart_reset_view')}</button>
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
    if (canvas && activeTab) {
      renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
    }
  }
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');

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
  } else if (action === 'zoom-in' || action === 'zoom-out' || action === 'reset-chart') {
    const activeTab = state.openTabs.find((t) => t.tabId === state.activeTabId) || state.openTabs[0];
    if (activeTab) {
      if (action === 'zoom-in') activeTab.visibleCount = Math.max(16, (activeTab.visibleCount || 48) - 8);
      if (action === 'zoom-out') activeTab.visibleCount = Math.min(96, (activeTab.visibleCount || 48) + 8);
      if (action === 'reset-chart') activeTab.scrollOffset = 0;
      renderApp();
    }
  } else if (action === 'select-provider') {
    const code = btn.getAttribute('data-symbol');
    const prov = btn.getAttribute('data-provider');
    const sym = state.symbols.find((s) => s.symbolCode === code);
    if (sym) {
      sym.activeProvider = prov;
      sym.timeframe = prov === 'eia_brent_spot' ? 'D1' : 'M15';
      sym.candles = PriceFormatter.buildSeedCandles(sym.symbolCode, sym.activeProvider, sym.timeframe, 96);
      const latest = sym.candles[sym.candles.length - 1];
      sym.lastClose = latest ? latest.close : null;
      sym.lastCandleUtc = latest ? latest.open_time_utc_iso : null;
      saveSymbolsToStorage();
      renderApp();
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
})();
