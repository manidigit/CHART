import { I18nManager } from './core/i18n.js';
import { PriceFormatter } from './algorithms/priceFormatter.js';
import { renderCandlestickCanvas } from './components/chartRenderer.js';
import {
  state,
  applyTheme,
  loadSymbolsFromStorage,
  saveSymbolsToStorage,
  addCustomSymbol,
  deleteSymbol,
  loadDrawings,
  saveDrawings,
  saveChartPreferences,
  getCachedOrAggregatedCandles,
} from './core/store.js';
import {
  checkBackendOwnerStatus,
  syncSymbolNow,
  loginOwner,
  registerOwner,
  updateOwnerEmail,
  updateOwnerPassword,
  requestPasswordReset,
  confirmPasswordReset,
} from './services/apiService.js';
import { attachCanvasInteractions } from './controllers/chartInteractionController.js';
import { renderTerminalTopBar } from './views/headerView.js';
import { renderLeftToolRail, renderMobileChartTools } from './views/toolRailView.js';
import { renderWatchlistContent } from './views/watchlistView.js';
import { renderAnalysisContent } from './views/analysisView.js';
import { renderSettingsContent } from './views/settingsView.js';
import { renderLoginScreen } from './views/loginView.js';
import { renderBottomNav } from './views/navigationView.js';

const i18n = new I18nManager();

export function openSymbolInTab(symbolCode) {
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
      visibleCount: 56,
      activeDateRange: null,
      chartType: 'candlestick',
      showVolume: true,
      volumePaneRatio: 0.22,
      showSma20: false,
      activeDrawingTool: 'cursor',
      activeDrawingColor: '#38BDF8',
      activeDrawingWidth: 2,
      mobileDockCollapsed: false,
      drawings: loadDrawings(sym.chartId),
      selectedDrawingId: null,
      pendingTrendPoint: null,
      selectedCandleIndex: null,
      crosshair: { active: false, x: 0, y: 0 },
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

export function renderApp() {
  const root = document.getElementById('app-root');
  if (!root) return;

  if (!state.isAuthenticated) {
    root.innerHTML = renderLoginScreen(i18n);
    return;
  }

  const activeTab = state.openTabs.find((t) => t.tabId === state.activeTabId) || state.openTabs[0] || null;

  if (!activeTab && state.symbols.length > 0) {
    openSymbolInTab(state.symbols[0].symbolCode);
    return;
  }

  const latestCandle =
    activeTab && activeTab.candles.length ? activeTab.candles[activeTab.candles.length - 1] : {};
  const inspectedIdx =
    activeTab &&
    activeTab.selectedCandleIndex !== null &&
    activeTab.selectedCandleIndex !== undefined &&
    activeTab.candles[activeTab.selectedCandleIndex]
      ? activeTab.selectedCandleIndex
      : activeTab && activeTab.candles.length
      ? activeTab.candles.length - 1
      : null;
  const inspected = inspectedIdx !== null && activeTab ? activeTab.candles[inspectedIdx] : latestCandle;

  const priceDiff =
    activeTab && latestCandle.open
      ? PriceFormatter.formatSignedDiff(latestCandle.open, latestCandle.close, activeTab.decimals)
      : '0.00';
  const pct =
    activeTab && latestCandle.open
      ? PriceFormatter.formatSignedPct(latestCandle.open, latestCandle.close)
      : '+0.00%';
  const isBull = !pct.startsWith('-');
  const allowedTfs =
    activeTab && activeTab.provider === 'eia_brent_spot' ? ['D1'] : ['M15', 'H1', 'H4', 'D1'];

  const tfChipsHtml = ['M15', 'H1', 'H4', 'D1']
    .map((tf) => {
      const enabled = allowedTfs.includes(tf);
      const isAct = activeTab && activeTab.timeframe === tf;
      const disp = PriceFormatter.displayTimeframeLabel(tf);
      return `<button class="chip ltr-num ${isAct ? 'active' : ''}" data-action="set-timeframe" data-tf="${tf}" ${!enabled ? 'disabled' : ''}>${disp}</button>`;
    })
    .join('');

  const availableRanges = activeTab
    ? PriceFormatter.computeAvailableDateRanges(activeTab.candles, activeTab.timeframe)
    : [];
  const dateRangeChipsHtml = availableRanges
    .map((r) => {
      const isAct = activeTab && activeTab.activeDateRange === r.id;
      return `<button class="chip ltr-num ${isAct ? 'active' : ''}" data-action="set-date-range" data-range="${r.id}" data-count="${r.count}" ${!r.enabled ? 'disabled' : ''}>${r.label}</button>`;
    })
    .join('');

  const tabsHtml = state.openTabs
    .map(
      (t) => `
      <div class="chart-tab ${t.tabId === (activeTab ? activeTab.tabId : '') ? 'active' : ''}" data-action="select-tab" data-tab="${t.tabId}">
        <strong>${t.symbolCode}</strong>
        <span>${PriceFormatter.displayTimeframeLabel(t.timeframe)}</span>
        <button class="chart-tab-close" data-action="close-tab" data-tab="${t.tabId}">×</button>
      </div>
    `
    )
    .join('');

  const activeMobileScreen = state.currentScreen || 'chart_view';
  let sidePanelHtml = '';
  const panelTarget =
    window.innerWidth < 769 && activeMobileScreen !== 'chart_view'
      ? activeMobileScreen
      : state.desktopSidePanel;

  if (panelTarget === 'watchlist') sidePanelHtml = renderWatchlistContent(i18n);
  else if (panelTarget === 'analysis') sidePanelHtml = renderAnalysisContent(activeTab, i18n);
  else if (panelTarget === 'settings') sidePanelHtml = renderSettingsContent(i18n);

  let smaBadgeHtml = '';
  if (activeTab && activeTab.showSma20 && inspectedIdx !== null) {
    const smaArr = PriceFormatter.computeSmaSeries(activeTab.candles, 20);
    const smaVal = smaArr[inspectedIdx];
    if (smaVal !== null && smaVal !== undefined) {
      smaBadgeHtml = `<span style="color:#F59E0B;font-weight:700;">SMA20: ${PriceFormatter.formatPrice(smaVal, activeTab.decimals)}</span>`;
    }
  }

  root.innerHTML = `
    <div class="terminal-layout screen-${activeMobileScreen}">
      ${renderTerminalTopBar(activeTab, latestCandle, priceDiff, pct, isBull, tfChipsHtml, dateRangeChipsHtml, tabsHtml, i18n)}

      <div class="terminal-body">
        ${renderLeftToolRail(activeTab, i18n)}

        <main class="chart-workspace ${activeMobileScreen !== 'chart_view' ? 'mobile-hidden' : ''}">
          ${
            activeTab && inspected && inspected.close !== undefined
              ? `
            <div class="floating-ohlc-bar ltr-num">
              <span style="color: var(--primary); font-weight: 700;">${activeTab.symbolCode} · ${PriceFormatter.displayTimeframeLabel(activeTab.timeframe)}</span>
              <span>O: <span class="ohlc-val">${PriceFormatter.formatPrice(inspected.open, activeTab.decimals)}</span></span>
              <span>H: <span class="ohlc-val bull">${PriceFormatter.formatPrice(inspected.high, activeTab.decimals)}</span></span>
              <span>L: <span class="ohlc-val bear">${PriceFormatter.formatPrice(inspected.low, activeTab.decimals)}</span></span>
              <span>C: <span class="ohlc-val ${Number(inspected.close) >= Number(inspected.open) ? 'bull' : 'bear'}">${PriceFormatter.formatPrice(inspected.close, activeTab.decimals)}</span></span>
              ${Number(inspected.volume || 0) > 0 ? `<span>V: <span class="ohlc-val">${PriceFormatter.formatCompactVolume(inspected.volume)}</span></span>` : ''}
              ${smaBadgeHtml}
              <span style="color: var(--text-dim);">${inspected.open_time_utc_iso || ''}</span>
            </div>
          `
              : ''
          }

          <div class="chart-canvas-container">
            ${
              !activeTab || activeTab.candles.length === 0
                ? `<div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; padding: 16px;">
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

          ${renderMobileChartTools(activeTab, i18n)}
        </main>

        <aside class="right-panel ${panelTarget ? '' : 'collapsed'} ${activeMobileScreen === 'chart_view' ? 'mobile-hidden' : ''}">
          <div class="panel-header">
            <h4 class="panel-title">${i18n.t('nav_' + (panelTarget || 'watchlist'))}</h4>
            <button class="tool-rail-btn" data-action="toggle-desktop-panel" data-panel="${panelTarget}">✕</button>
          </div>
          <div class="panel-content">
            ${sidePanelHtml}
          </div>
        </aside>
      </div>

      ${renderBottomNav(i18n)}

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

  if (activeTab && activeTab.candles.length > 0 && (window.innerWidth >= 769 || activeMobileScreen === 'chart_view')) {
    const canvas = document.getElementById('active-chart-canvas');
    if (canvas) {
      renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme, i18n);
      attachCanvasInteractions(canvas, activeTab, renderApp, i18n);

      const container = canvas.parentElement;
      if (container && window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
          renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme, i18n);
        });
        ro.observe(container);
      }
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
    const screen = btn.getAttribute('data-screen');
    state.currentScreen = screen;
    if (window.innerWidth >= 769) {
      state.desktopSidePanel = screen === 'chart_view' ? null : screen;
    }
    renderApp();
  } else if (action === 'toggle-desktop-panel') {
    const panel = btn.getAttribute('data-panel');
    if (window.innerWidth < 769) {
      state.currentScreen = state.currentScreen === panel ? 'chart_view' : panel;
    } else {
      state.desktopSidePanel = state.desktopSidePanel === panel ? null : panel;
    }
    renderApp();
  } else if (action === 'toggle-fullscreen') {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  } else if (action === 'sync-symbol') {
    await syncSymbolNow(btn.getAttribute('data-symbol'), null, renderApp);
  } else if (action === 'sync-all') {
    for (const s of state.symbols.filter((x) => x.inWatchlist)) {
      await syncSymbolNow(s.symbolCode, null, renderApp);
    }
  } else if (action === 'open-chart') {
    openSymbolInTab(btn.getAttribute('data-symbol'));
  } else if (action === 'select-tab') {
    state.activeTabId = btn.getAttribute('data-tab');
    state.currentScreen = 'chart_view';
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
    activeTab.activeDateRange = null;
    activeTab.selectedCandleIndex = null;
    activeTab.candles = getCachedOrAggregatedCandles(activeTab.symbolCode, activeTab.provider, tf);
    renderApp();
    await syncSymbolNow(activeTab.symbolCode, tf, renderApp);
  } else if (action === 'set-date-range' && activeTab) {
    const rangeId = btn.getAttribute('data-range');
    const count = parseInt(btn.getAttribute('data-count') || '56', 10);
    activeTab.activeDateRange = rangeId;
    activeTab.visibleCount = Math.max(8, Math.min(activeTab.candles.length || 56, count));
    activeTab.scrollOffset = 0;
    activeTab.isAutoScaleY = true;
    activeTab.yPriceScaleFactor = 1.0;
    renderApp();
  } else if (action === 'set-chart-type' && activeTab) {
    activeTab.chartType = btn.getAttribute('data-type');
    renderApp();
  } else if (action === 'toggle-volume' && activeTab) {
    activeTab.showVolume = activeTab.showVolume === false ? true : false;
    renderApp();
  } else if (action === 'cycle-volume-height' && activeTab) {
    const cur = Number(activeTab.volumePaneRatio || 0.22);
    activeTab.volumePaneRatio = cur < 0.2 ? 0.22 : cur < 0.27 ? 0.30 : 0.16;
    renderApp();
  } else if (action === 'toggle-sma20' && activeTab) {
    activeTab.showSma20 = !activeTab.showSma20;
    renderApp();
  } else if (
    (action === 'zoom-in' ||
      action === 'zoom-out' ||
      action === 'fit-content' ||
      action === 'reset-chart' ||
      action === 'auto-scale-y') &&
    activeTab
  ) {
    const maxCap = Math.max(8, activeTab.candles.length);
    if (action === 'zoom-in') {
      activeTab.visibleCount = Math.max(8, (activeTab.visibleCount || 56) - 8);
      activeTab.activeDateRange = null;
    }
    if (action === 'zoom-out') {
      activeTab.visibleCount = Math.min(maxCap, (activeTab.visibleCount || 56) + 8);
      activeTab.activeDateRange = null;
    }
    if (action === 'fit-content') {
      activeTab.visibleCount = maxCap;
      activeTab.scrollOffset = 0;
      activeTab.activeDateRange = 'ALL';
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
    const tool = btn.getAttribute('data-tool');
    activeTab.activeDrawingTool = tool;
    activeTab.pendingTrendPoint = null;
    if (tool !== 'cursor') {
      activeTab.mobileDockCollapsed = false;
    }
    renderApp();
  } else if (action === 'set-draw-color' && activeTab) {
    const color = btn.getAttribute('data-color');
    activeTab.activeDrawingColor = color;
    if (activeTab.selectedDrawingId) {
      activeTab.drawings = (activeTab.drawings || []).map((d) =>
        d.id === activeTab.selectedDrawingId ? { ...d, color } : d
      );
      saveDrawings(activeTab.chartId, activeTab.drawings);
    }
    renderApp();
  } else if (action === 'set-draw-width' && activeTab) {
    const width = parseInt(btn.getAttribute('data-width') || '2', 10);
    activeTab.activeDrawingWidth = width;
    if (activeTab.selectedDrawingId) {
      activeTab.drawings = (activeTab.drawings || []).map((d) =>
        d.id === activeTab.selectedDrawingId ? { ...d, strokeWidth: width } : d
      );
      saveDrawings(activeTab.chartId, activeTab.drawings);
    }
    renderApp();
  } else if (action === 'toggle-mobile-dock' && activeTab) {
    activeTab.mobileDockCollapsed = !activeTab.mobileDockCollapsed;
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
      const oldProvider = sym.activeProvider;
      sym.activeProvider = prov;
      sym.timeframe = prov === 'eia_brent_spot' ? 'D1' : 'M15';
      sym.candles = getCachedOrAggregatedCandles(sym.symbolCode, sym.activeProvider, sym.timeframe);
      const latest = sym.candles[sym.candles.length - 1];
      sym.lastClose = latest ? latest.close : null;
      sym.lastCandleUtc = latest ? latest.open_time_utc_iso : null;

      // Update any existing open tab for this symbol so Chart View reflects the new provider immediately
      const oldTabId = `${sym.symbolCode}_${oldProvider}`;
      const newTabId = `${sym.symbolCode}_${prov}`;
      const openTab = state.openTabs.find((t) => t.tabId === oldTabId || t.symbolCode === sym.symbolCode);
      if (openTab) {
        const wasActive = state.activeTabId === openTab.tabId;
        openTab.tabId = newTabId;
        openTab.provider = prov;
        openTab.timeframe = sym.timeframe;
        openTab.candles = sym.candles;
        openTab.scrollOffset = 0;
        openTab.selectedCandleIndex = null;
        if (wasActive) state.activeTabId = newTabId;
      }

      saveSymbolsToStorage();
      renderApp();
      await syncSymbolNow(sym.symbolCode, sym.timeframe, renderApp);
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
    renderApp();
  } else if (action === 'set-auth-mode') {
    state.authMode = btn.getAttribute('data-mode') || 'login';
    state.authErrorKey = null;
    state.authInfoKey = null;
    renderApp();
  } else if (action === 'sign-out') {
    state.isAuthenticated = false;
    state.authMode = 'login';
    state.authErrorKey = null;
    state.authInfoKey = null;
    renderApp();
  }
});

document.addEventListener('input', (e) => {
  const slider = e.target.closest('[data-action="set-fetch-limit"]');
  if (!slider) return;
  const val = Math.max(40, Math.min(5000, parseInt(slider.value || '500', 10)));
  const lbl = document.getElementById('fetch-limit-value-label');
  if (lbl) lbl.textContent = String(val);
});

document.addEventListener('change', async (e) => {
  const slider = e.target.closest('[data-action="set-fetch-limit"]');
  if (slider) {
    const val = Math.max(40, Math.min(5000, parseInt(slider.value || '500', 10)));
    saveChartPreferences({ candleFetchLimit: val });
    const activeTab = state.openTabs.find((t) => t.tabId === state.activeTabId) || state.openTabs[0];
    if (activeTab) {
      await syncSymbolNow(activeTab.symbolCode, activeTab.timeframe, renderApp);
    } else {
      renderApp();
    }
    return;
  }

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
      openSymbolInTab(code);
      state.showAddSymbolModal = false;
      renderApp();
      await syncSymbolNow(code, null, renderApp);
    }
    return;
  }

  if (e.target.id === 'settings-email-form') {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = (fd.get('recovery_email') || '').toString().trim();
    if (!email || !email.includes('@')) {
      state.statusBannerKey = 'error_invalid_email';
      renderApp();
      return;
    }
    const res = await updateOwnerEmail(email);
    state.ownerEmail = email;
    localStorage.setItem('ci_owner_email', email);
    state.statusBannerKey = res && res.ok ? 'status_email_updated' : 'status_email_updated';
    renderApp();
    return;
  }

  if (e.target.id === 'settings-password-form') {
    e.preventDefault();
    const fd = new FormData(e.target);
    const newPassword = (fd.get('new_password') || '').toString();
    if (newPassword.length < 4) {
      state.statusBannerKey = 'error_password_short';
      renderApp();
      return;
    }
    await updateOwnerPassword(newPassword);
    localStorage.setItem('ci_owner_pass_b64', btoa(unescape(encodeURIComponent(newPassword))));
    state.statusBannerKey = 'settings_password_updated';
    renderApp();
    return;
  }

  if (e.target.id === 'forgot-request-form') {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = (fd.get('email') || '').toString().trim();
    if (!email || !email.includes('@')) {
      state.authErrorKey = 'error_invalid_email';
      state.authInfoKey = null;
      renderApp();
      return;
    }
    const res = await requestPasswordReset(email);
    if (res && res.ok) {
      state.ownerEmail = email;
      localStorage.setItem('ci_owner_email', email);
      state.authMode = 'forgot_verify';
      state.authErrorKey = null;
      state.authInfoKey = 'status_recovery_code_sent';
    } else {
      state.authErrorKey = (res && res.error_message) || 'error_email_not_found';
      state.authInfoKey = null;
    }
    renderApp();
    return;
  }

  if (e.target.id === 'forgot-verify-form') {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = (fd.get('email') || '').toString().trim();
    const code = (fd.get('recovery_code') || '').toString().trim();
    const newPassword = (fd.get('new_password') || '').toString();
    const confirmPassword = (fd.get('confirm_password') || '').toString();
    if (newPassword.length < 4) {
      state.authErrorKey = 'error_password_short';
      renderApp();
      return;
    }
    if (newPassword !== confirmPassword) {
      state.authErrorKey = 'error_password_mismatch';
      renderApp();
      return;
    }
    const res = await confirmPasswordReset(email, code, newPassword);
    if (res && res.ok) {
      localStorage.setItem('ci_owner_pass_b64', btoa(unescape(encodeURIComponent(newPassword))));
      state.authMode = 'login';
      state.authErrorKey = null;
      state.authInfoKey = 'status_password_reset_success';
    } else {
      state.authErrorKey = (res && res.error_message) || 'error_invalid_recovery_code';
      state.authInfoKey = null;
    }
    renderApp();
    return;
  }

  if (e.target.id !== 'auth-form') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const username = (fd.get('username') || '').toString().trim();
  const email = (fd.get('email') || '').toString().trim();
  const password = (fd.get('password') || '').toString();
  const confirmPassword = (fd.get('confirm_password') || '').toString();

  if (!username || !password) {
    state.authErrorKey = 'error_empty_credentials';
    renderApp();
    return;
  }
  if (!state.isOwnerRegistered) {
    if (email && !email.includes('@')) {
      state.authErrorKey = 'error_invalid_email';
      renderApp();
      return;
    }
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
    await registerOwner(username, email, password);
    localStorage.setItem('ci_owner_username', username);
    if (email) localStorage.setItem('ci_owner_email', email);
    localStorage.setItem('ci_owner_pass_b64', btoa(unescape(encodeURIComponent(password))));
    state.isOwnerRegistered = true;
    state.ownerUsername = username;
    state.ownerEmail = email;
    state.isAuthenticated = true;
    state.authErrorKey = null;
    state.authInfoKey = null;
    renderApp();
  } else {
    const ok = await loginOwner(username, password);
    if (!ok) {
      state.authErrorKey = 'error_invalid_credentials';
      renderApp();
      return;
    }
    state.isAuthenticated = true;
    state.authErrorKey = null;
    state.authInfoKey = null;
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
    syncSymbolNow(s.symbolCode, s.timeframe, renderApp);
  }
})();
