import { I18nManager } from './i18n.js';
import { AuthManager } from './auth.js';
import { MarketDataClient } from './marketData.js';
import { CandleAggregator } from './algorithms/candleAggregator.js';
import { PriceFormatter } from './algorithms/priceFormatter.js';
import { DrawingGeometry } from './algorithms/drawingGeometry.js';
import { TechnicalIndicators } from './algorithms/technicalIndicators.js';
import {
  state,
  saveChartPreferences,
  registerRenderCallback,
  triggerRender,
} from './core/store.js';
import { renderCandlestickCanvas } from './components/chartRenderer.js';
import { renderAuthModal } from './views/authView.js';
import { renderWatchlistContent, renderSymbolOverviewModal } from './views/watchlistView.js';
import { renderAnalysisContent } from './views/analysisView.js';
import { renderSettingsContent } from './views/settingsView.js';
import { renderTopHeaderBar, renderSubToolbar } from './views/headerView.js';
import { renderLeftToolRail } from './views/toolRailView.js';

const i18n = new I18nManager('fa');
const auth = new AuthManager();
const marketClient = new MarketDataClient('./api/candles.php');

function applyThemeClass() {
  document.body.classList.toggle('theme-light', !state.isDarkTheme);
}

async function persistRemoteWorkspaceNow() {
  if (!auth.isAuthenticated()) return;
  await auth.saveRemoteWorkspace({
    symbols: state.symbols.map((s) => ({
      symbolCode: s.symbolCode,
      inWatchlist: s.inWatchlist,
      activeProvider: s.activeProvider,
      allowedProviders: s.allowedProviders,
      decimals: s.decimals,
      isCustom: Boolean(s.isCustom),
      customTitle: s.customTitle || '',
    })),
    chartPreferences: state.chartPreferences,
    openTabs: state.openTabs.map((t) => ({
      tabId: t.tabId,
      symbolCode: t.symbolCode,
      provider: t.provider,
      timeframe: t.timeframe,
      chartType: t.chartType,
      showVolume: t.showVolume !== false,
      volumePaneRatio: t.volumePaneRatio || 0.22,
      showSma20: Boolean(t.showSma20),
      isLogScale: Boolean(t.isLogScale ?? state.chartPreferences.isLogScale),
      selectedRangePreset: t.selectedRangePreset || null,
      activeDrawingColorHex: t.activeDrawingColorHex || '#2962FF',
      activeDrawingWidthPx: t.activeDrawingWidthPx || 2.0,
      drawings: t.drawings || [],
    })),
    activeTabId: state.activeTabId,
  });
}

async function applyRemoteWorkspaceIfPresent() {
  const ws = await auth.fetchRemoteWorkspace();
  if (!ws || typeof ws !== 'object') return;
  if (ws.chartPreferences && typeof ws.chartPreferences === 'object') {
    state.chartPreferences = { ...state.chartPreferences, ...ws.chartPreferences };
    saveChartPreferences(state.chartPreferences);
  }
  if (Array.isArray(ws.symbols)) {
    ws.symbols.forEach((remoteSym) => {
      const existing = state.symbols.find((s) => s.symbolCode === remoteSym.symbolCode);
      if (existing) {
        existing.inWatchlist = Boolean(remoteSym.inWatchlist);
        if (remoteSym.activeProvider) existing.activeProvider = remoteSym.activeProvider;
      } else if (remoteSym.symbolCode) {
        state.symbols.push({
          symbolCode: remoteSym.symbolCode,
          inWatchlist: Boolean(remoteSym.inWatchlist),
          activeProvider: remoteSym.activeProvider || 'twelve_data',
          allowedProviders: remoteSym.allowedProviders || ['twelve_data', 'yahoo_finance'],
          decimals: Number(remoteSym.decimals ?? 2),
          lastClose: 0,
          lastCandleUtc: '',
          candles: [],
          isSyncing: false,
          syncError: false,
          isCustom: true,
          customTitle: remoteSym.customTitle || remoteSym.symbolCode,
        });
      }
    });
  }
}

async function syncSymbolUpToNow(symbolCode) {
  const sym = state.symbols.find((s) => s.symbolCode === symbolCode);
  if (!sym) return;
  sym.isSyncing = true;
  sym.syncError = false;
  triggerRender();

  const baseTf = sym.activeProvider === 'eia_brent_spot' ? 'D1' : 'M15';
  const fetchLimit = state.chartPreferences.candleFetchLimit || 500;
  try {
    const candles = await marketClient.fetchClosedCandles({
      symbol: sym.symbolCode,
      provider: sym.activeProvider,
      timeframe: baseTf,
      limit: fetchLimit,
    });
    sym.isSyncing = false;
    if (candles.length > 0) {
      sym.candles = candles;
      const last = candles[candles.length - 1];
      sym.lastClose = Number(last.close);
      sym.lastCandleUtc = PriceFormatter.formatCandleUtc(last.openTimeUtc);
      sym.syncError = false;
    }
  } catch (e) {
    sym.isSyncing = false;
    sym.syncError = true;
  }

  for (const tab of state.openTabs) {
    if (tab.symbolCode === symbolCode) {
      tab.provider = sym.activeProvider;
      if (sym.activeProvider === 'eia_brent_spot') tab.timeframe = 'D1';
      tab.candles = CandleAggregator.aggregate(sym.candles, tab.timeframe);
    }
  }
  triggerRender();
}

async function syncAllWatchlist() {
  const active = state.symbols.filter((s) => s.inWatchlist);
  await Promise.all(active.map((s) => syncSymbolUpToNow(s.symbolCode)));
}

async function openSymbolInTab(symbolCode) {
  const sym = state.symbols.find((s) => s.symbolCode === symbolCode);
  if (!sym) return;

  const existing = state.openTabs.find((t) => t.symbolCode === symbolCode);
  if (existing) {
    state.activeTabId = existing.tabId;
    state.symbolOverviewCode = null;
    triggerRender();
    return;
  }

  const defaultTf = sym.activeProvider === 'eia_brent_spot' ? 'D1' : 'M15';
  if (sym.candles.length === 0) {
    await syncSymbolUpToNow(symbolCode);
  }

  const tabId = `${symbolCode}_${Date.now()}`;
  state.openTabs.push({
    tabId,
    symbolCode,
    provider: sym.activeProvider,
    decimals: sym.decimals,
    timeframe: defaultTf,
    chartType: 'candles',
    activeTool: 'cursor',
    candles: CandleAggregator.aggregate(sym.candles, defaultTf),
    visibleCount: 48,
    scrollOffset: 0,
    priceScaleFactor: 1.0,
    verticalPriceOffset: 0.0,
    showVolume: true,
    volumePaneRatio: 0.22,
    showSma20: false,
    isLogScale: Boolean(state.chartPreferences.isLogScale),
    selectedRangePreset: null,
    activeDrawingColorHex: state.chartPreferences.defaultLineColor || '#2962FF',
    activeDrawingWidthPx: state.chartPreferences.defaultLineWidthPx || 2.0,
    hoverIndex: null,
    hoverY: null,
    drawings: [],
    selectedDrawingId: null,
    pendingTrendStart: null,
  });
  state.activeTabId = tabId;
  state.symbolOverviewCode = null;
  triggerRender();
}

function renderFloatingOhlcBar(activeTab) {
  if (!activeTab || !activeTab.candles || activeTab.candles.length === 0) return '';
  const visibleCount = Math.max(15, Math.min(180, Math.round(activeTab.visibleCount || 48)));
  const maxOffset = Math.max(0, activeTab.candles.length - 5);
  const offset = Math.max(0, Math.min(maxOffset, Math.round(activeTab.scrollOffset || 0)));
  const endIdx = Math.max(1, activeTab.candles.length - offset);
  const startIdx = Math.max(0, endIdx - visibleCount);
  const visible = activeTab.candles.slice(startIdx, endIdx);
  const ref =
    activeTab.hoverIndex !== null && visible[activeTab.hoverIndex]
      ? visible[activeTab.hoverIndex]
      : visible[visible.length - 1] || activeTab.candles[activeTab.candles.length - 1];
  if (!ref) return '';

  const isBull = Number(ref.close) >= Number(ref.open);
  const valColor = isBull ? 'var(--bull)' : 'var(--bear)';
  const d = activeTab.decimals;
  const smaArr = activeTab.showSma20 ? TechnicalIndicators.computeSma(activeTab.candles, 20) : [];
  const smaVal =
    activeTab.showSma20 && smaArr.length > 0 ? smaArr[smaArr.length - 1 - offset] : null;

  return `
    <div class="floating-ohlc-bar ltr-num">
      <strong style="color: var(--primary);">${activeTab.symbolCode} · ${PriceFormatter.displayTimeframeLabel(activeTab.timeframe)}</strong>
      <span>O: <strong style="color:${valColor}">${PriceFormatter.formatPrice(ref.open, d)}</strong></span>
      <span>H: <strong style="color:${valColor}">${PriceFormatter.formatPrice(ref.high, d)}</strong></span>
      <span>L: <strong style="color:${valColor}">${PriceFormatter.formatPrice(ref.low, d)}</strong></span>
      <span>C: <strong style="color:${valColor}">${PriceFormatter.formatPrice(ref.close, d)}</strong></span>
      <span>V: <strong>${PriceFormatter.formatVolume(ref.volume)}</strong></span>
      ${smaVal ? `<span style="color: var(--gold);">SMA20: <strong>${PriceFormatter.formatPrice(smaVal, d)}</strong></span>` : ''}
      <span style="opacity: 0.75;">${PriceFormatter.formatCandleUtc(ref.openTimeUtc)}</span>
    </div>
  `;
}

function renderAddSymbolModal(i18n) {
  if (!state.isAddSymbolModalOpen) return '';
  return `
    <div class="modal-backdrop" data-action="close-add-symbol-modal">
      <div class="modal-card" onclick="event.stopPropagation()">
        <div class="row-between" style="margin-bottom: 12px;">
          <h4 style="margin: 0;">${i18n.t('settings_add_custom_symbol')}</h4>
          <button class="btn btn-sm btn-icon" data-action="close-add-symbol-modal">✕</button>
        </div>
        <form id="add-symbol-form">
          <div style="margin-bottom: 10px;">
            <input class="input-field ltr-num" type="text" name="symbol_code" placeholder="Symbol Code (e.g. BTCUSD)" required />
          </div>
          <div style="margin-bottom: 10px;">
            <input class="input-field" type="text" name="custom_title" placeholder="Title (e.g. Bitcoin Spot)" required />
          </div>
          <div style="margin-bottom: 12px;">
            <input class="input-field ltr-num" type="number" name="decimals" min="0" max="6" value="2" required />
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%;">${i18n.t('settings_add_custom_symbol')}</button>
        </form>
      </div>
    </div>
  `;
}

function renderApp() {
  applyThemeClass();
  const root = document.getElementById('app');
  if (!root) return;

  if (!state.isAuthenticated) {
    root.innerHTML = renderAuthModal(i18n);
    bindAuthEvents();
    return;
  }

  const activeTab =
    state.openTabs.find((t) => t.tabId === state.activeTabId) || state.openTabs[0] || null;
  if (activeTab && state.activeTabId !== activeTab.tabId) {
    state.activeTabId = activeTab.tabId;
  }

  let drawerTitle = i18n.t('nav_watchlist');
  let drawerBody = '';
  if (state.activeNav === 'watchlist') {
    drawerTitle = i18n.t('nav_watchlist');
    drawerBody = renderWatchlistContent(i18n);
  } else if (state.activeNav === 'prediction') {
    drawerTitle = i18n.t('nav_prediction');
    drawerBody = renderAnalysisContent(activeTab, i18n);
  } else if (state.activeNav === 'settings') {
    drawerTitle = i18n.t('nav_settings');
    drawerBody = renderSettingsContent(i18n);
  }

  const isScrolledBack = activeTab && Number(activeTab.scrollOffset || 0) > 5;
  const isAutoScale =
    activeTab &&
    Number(activeTab.priceScaleFactor || 1) === 1 &&
    Number(activeTab.verticalPriceOffset || 0) === 0;
  const isLogScale =
    activeTab && Boolean(activeTab.isLogScale ?? state.chartPreferences.isLogScale);

  root.innerHTML = `
    <div class="tv-app-shell">
      ${state.isFullscreen ? '' : renderTopHeaderBar(activeTab, i18n)}
      ${state.isFullscreen ? '' : renderSubToolbar(activeTab, i18n)}

      <div class="tv-main-area">
        ${renderLeftToolRail(activeTab, i18n)}

        <main class="chart-workspace" dir="ltr">
          <div class="chart-canvas-box" dir="ltr">
            ${renderFloatingOhlcBar(activeTab)}
            <canvas id="main-chart-canvas" class="chart-canvas" dir="ltr"></canvas>

            ${
              isScrolledBack
                ? `<div class="chart-floating-controls">
                    <button class="btn btn-sm btn-primary ltr-num" data-action="reset-view" title="${i18n.t('chart_reset_view')}">
                      ⏭ Latest
                    </button>
                  </div>`
                : ''
            }

            ${
              activeTab
                ? `<div class="chart-axis-scale-badges">
                    <button class="axis-badge-btn ${isAutoScale ? 'active' : ''}" data-action="reset-price-scale" title="${i18n.t('chart_auto_scale')}">Auto</button>
                    <button class="axis-badge-btn ${isLogScale ? 'active' : ''}" data-action="toggle-log-scale" title="${i18n.t('tv_log_scale')}">Log</button>
                  </div>`
                : ''
            }
          </div>
        </main>

        <aside class="side-drawer ${state.isSideDrawerOpen ? '' : 'closed'}" dir="${i18n.getCurrentLanguage() === 'fa' ? 'rtl' : 'ltr'}">
          <div class="side-drawer-header">
            <span>${drawerTitle}</span>
            <button class="btn btn-sm btn-icon" data-action="close-drawer">✕</button>
          </div>
          <div class="side-drawer-body">
            ${drawerBody}
          </div>
        </aside>
      </div>
      ${renderAddSymbolModal(i18n)}
      ${renderSymbolOverviewModal(i18n)}
    </div>
  `;

  bindWorkspaceEvents(activeTab);

  const canvas = document.getElementById('main-chart-canvas');
  if (canvas && activeTab) {
    renderCandlestickCanvas(canvas, activeTab, i18n);
    bindCanvasInteractions(canvas, activeTab);
  }
}

function bindAuthEvents() {
  const setupForm = document.getElementById('setup-form');
  if (setupForm) {
    setupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(setupForm);
      const u = String(fd.get('username') || '').trim();
      const em = String(fd.get('email') || '').trim();
      const p = String(fd.get('password') || '');
      const c = String(fd.get('confirm') || '');
      if (!u || !p) {
        state.authErrorKey = 'error_empty_credentials';
        return triggerRender();
      }
      if (p.length < 4) {
        state.authErrorKey = 'error_password_short';
        return triggerRender();
      }
      if (p !== c) {
        state.authErrorKey = 'error_password_mismatch';
        return triggerRender();
      }
      const res = await auth.createOwnerAccount(u, p, em);
      if (res.ok) {
        state.hasOwnerAccount = true;
        state.isAuthenticated = true;
        state.ownerUsername = auth.getOwnerUsername();
        state.ownerEmail = auth.getOwnerEmail();
        await syncAllWatchlist();
        await openSymbolInTab('SPOTBRENT');
      } else {
        state.authErrorKey = res.errorKey;
        triggerRender();
      }
    });
  }

  const signinForm = document.getElementById('signin-form');
  if (signinForm) {
    signinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(signinForm);
      const u = String(fd.get('username') || '').trim();
      const p = String(fd.get('password') || '');
      const res = await auth.signIn(u, p);
      if (res.ok) {
        state.isAuthenticated = true;
        state.ownerUsername = auth.getOwnerUsername();
        state.ownerEmail = auth.getOwnerEmail();
        await applyRemoteWorkspaceIfPresent();
        await syncAllWatchlist();
        await openSymbolInTab('SPOTBRENT');
      } else {
        state.authErrorKey = res.errorKey;
        triggerRender();
      }
    });
  }

  document.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const act = e.currentTarget.getAttribute('data-action');
      if (act === 'set-lang') {
        i18n.setLanguage(e.currentTarget.getAttribute('data-lang'));
        triggerRender();
      } else if (act === 'set-theme') {
        state.isDarkTheme = e.currentTarget.getAttribute('data-theme') === 'dark';
        localStorage.setItem('ci_theme_v2', state.isDarkTheme ? 'dark' : 'light');
        triggerRender();
      } else if (act === 'open-forgot-password') {
        state.authViewMode = 'forgot_request';
        triggerRender();
      } else if (act === 'back-to-login') {
        state.authViewMode = 'login';
        triggerRender();
      }
    });
  });
}

function bindWorkspaceEvents(activeTab) {
  const searchInput = document.querySelector('[data-action="watchlist-search"]');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.watchlistSearchQuery = e.target.value;
      triggerRender();
      const el = document.querySelector('[data-action="watchlist-search"]');
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  document.querySelectorAll('[data-action]').forEach((el) => {
    const action = el.getAttribute('data-action');
    if (
      action === 'select-provider-dropdown' ||
      action === 'toggle-watchlist' ||
      action === 'set-fetch-limit' ||
      action === 'select-prediction-symbol' ||
      action === 'toggle-tv-pref' ||
      action === 'watchlist-search'
    ) {
      return;
    }
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (action === 'open-drawer') {
        const nav = el.getAttribute('data-nav');
        if (state.isSideDrawerOpen && state.activeNav === nav) {
          state.isSideDrawerOpen = false;
        } else {
          state.activeNav = nav;
          state.isSideDrawerOpen = true;
        }
        triggerRender();
      } else if (action === 'close-drawer') {
        state.isSideDrawerOpen = false;
        triggerRender();
      } else if (action === 'toggle-fullscreen') {
        state.isFullscreen = !state.isFullscreen;
        triggerRender();
      } else if (action === 'open-symbol-overview') {
        state.symbolOverviewCode = el.getAttribute('data-symbol');
        triggerRender();
      } else if (
        action === 'close-symbol-overview' ||
        (action === 'close-symbol-overview-backdrop' && e.target === el)
      ) {
        state.symbolOverviewCode = null;
        triggerRender();
      } else if (action === 'set-overview-range') {
        state.symbolOverviewRange = el.getAttribute('data-range') || '5D';
        triggerRender();
      } else if (action === 'open-chart') {
        const symCode = el.getAttribute('data-symbol');
        state.symbolOverviewCode = null;
        await openSymbolInTab(symCode);
      } else if (action === 'select-tab') {
        state.activeTabId = el.getAttribute('data-tab-id');
        triggerRender();
      } else if (action === 'close-tab') {
        const id = el.getAttribute('data-tab-id');
        state.openTabs = state.openTabs.filter((t) => t.tabId !== id);
        if (state.activeTabId === id) {
          state.activeTabId = state.openTabs[0] ? state.openTabs[0].tabId : null;
        }
        triggerRender();
      } else if (action === 'set-timeframe' && activeTab) {
        const tf = el.getAttribute('data-tf');
        activeTab.timeframe = tf;
        const sym = state.symbols.find((s) => s.symbolCode === activeTab.symbolCode);
        if (sym) {
          activeTab.candles = CandleAggregator.aggregate(sym.candles, tf);
          activeTab.scrollOffset = 0;
        }
        triggerRender();
      } else if (action === 'set-date-range' && activeTab) {
        const rk = el.getAttribute('data-range');
        activeTab.selectedRangePreset = rk;
        activeTab.scrollOffset = 0;
        const map = { '1D': 24, '5D': 48, '1M': 72, '3M': 100, YTD: 120, '1Y': 150, All: 180 };
        activeTab.visibleCount = map[rk] || 48;
        triggerRender();
      } else if (action === 'set-chart-type' && activeTab) {
        activeTab.chartType = el.getAttribute('data-type');
        triggerRender();
      } else if (action === 'toggle-volume' && activeTab) {
        activeTab.showVolume = activeTab.showVolume === false;
        triggerRender();
      } else if (action === 'cycle-volume-height' && activeTab) {
        const cur = Number(activeTab.volumePaneRatio || 0.22);
        activeTab.volumePaneRatio = cur < 0.18 ? 0.22 : cur < 0.26 ? 0.3 : 0.15;
        triggerRender();
      } else if (action === 'toggle-sma20' && activeTab) {
        activeTab.showSma20 = !activeTab.showSma20;
        triggerRender();
      } else if (action === 'toggle-log-scale' && activeTab) {
        const nextLog = !Boolean(activeTab.isLogScale ?? state.chartPreferences.isLogScale);
        activeTab.isLogScale = nextLog;
        state.chartPreferences.isLogScale = nextLog;
        saveChartPreferences(state.chartPreferences);
        triggerRender();
      } else if (action === 'reset-price-scale' && activeTab) {
        activeTab.priceScaleFactor = 1.0;
        activeTab.verticalPriceOffset = 0.0;
        triggerRender();
      } else if (action === 'fit-content' && activeTab) {
        activeTab.visibleCount = Math.min(180, Math.max(15, activeTab.candles.length));
        activeTab.scrollOffset = 0;
        triggerRender();
      } else if (action === 'reset-view' && activeTab) {
        activeTab.visibleCount = 48;
        activeTab.scrollOffset = 0;
        triggerRender();
      } else if (action === 'set-tool' && activeTab) {
        activeTab.activeTool = el.getAttribute('data-tool');
        activeTab.pendingTrendStart = null;
        triggerRender();
      } else if (action === 'set-draw-color' && activeTab) {
        const c = el.getAttribute('data-color');
        activeTab.activeDrawingColorHex = c;
        if (activeTab.selectedDrawingId) {
          activeTab.drawings = activeTab.drawings.map((d) =>
            d.id === activeTab.selectedDrawingId ? { ...d, colorHex: c } : d
          );
        }
        triggerRender();
      } else if (action === 'set-draw-width' && activeTab) {
        const w = Number(el.getAttribute('data-width') || 2);
        activeTab.activeDrawingWidthPx = w;
        if (activeTab.selectedDrawingId) {
          activeTab.drawings = activeTab.drawings.map((d) =>
            d.id === activeTab.selectedDrawingId ? { ...d, lineWidthPx: w } : d
          );
        }
        triggerRender();
      } else if (action === 'zoom-in' && activeTab) {
        activeTab.visibleCount = Math.max(15, activeTab.visibleCount - 10);
        triggerRender();
      } else if (action === 'zoom-out' && activeTab) {
        activeTab.visibleCount = Math.min(180, activeTab.visibleCount + 10);
        triggerRender();
      } else if (action === 'delete-drawing' && activeTab) {
        activeTab.drawings = activeTab.drawings.filter((d) => d.id !== activeTab.selectedDrawingId);
        activeTab.selectedDrawingId = null;
        persistRemoteWorkspaceNow();
        triggerRender();
      } else if (action === 'clear-drawings' && activeTab) {
        activeTab.drawings = [];
        activeTab.selectedDrawingId = null;
        persistRemoteWorkspaceNow();
        triggerRender();
      } else if (action === 'project-scenario-levels' && activeTab) {
        const entry = Number(el.getAttribute('data-entry'));
        const t1 = Number(el.getAttribute('data-t1'));
        const t2 = Number(el.getAttribute('data-t2'));
        const stop = Number(el.getAttribute('data-stop'));
        const bias = el.getAttribute('data-bias');
        const targetCol = bias === 'bull' ? '#26A69A' : '#EF5350';
        const stopCol = bias === 'bull' ? '#EF5350' : '#26A69A';
        const nowId = Date.now();
        activeTab.drawings = [
          ...(activeTab.drawings || []).filter((d) => !String(d.id).startsWith('proj_')),
          { id: `proj_p_${nowId}`, type: 'hline', price1: entry, colorHex: '#F59E0B', lineWidthPx: 1.8, label: 'Pivot P' },
          { id: `proj_t1_${nowId}`, type: 'hline', price1: t1, colorHex: targetCol, lineWidthPx: 2.0, label: 'Target 1' },
          { id: `proj_t2_${nowId}`, type: 'hline', price1: t2, colorHex: targetCol, lineWidthPx: 2.2, label: 'Target 2' },
          { id: `proj_sl_${nowId}`, type: 'hline', price1: stop, colorHex: stopCol, lineWidthPx: 1.8, label: 'Invalidation' },
        ];
        persistRemoteWorkspaceNow();
        triggerRender();
      } else if (action === 'sync-active-tab' && activeTab) {
        await syncSymbolUpToNow(activeTab.symbolCode);
      } else if (action === 'sync-all') {
        await syncAllWatchlist();
      } else if (action === 'set-lang') {
        i18n.setLanguage(el.getAttribute('data-lang'));
        triggerRender();
      } else if (action === 'set-theme') {
        state.isDarkTheme = el.getAttribute('data-theme') === 'dark';
        localStorage.setItem('ci_theme_v2', state.isDarkTheme ? 'dark' : 'light');
        triggerRender();
      } else if (action === 'set-color') {
        const target = el.getAttribute('data-target');
        const col = el.getAttribute('data-color');
        state.chartPreferences[target] = col;
        saveChartPreferences(state.chartPreferences);
        persistRemoteWorkspaceNow();
        triggerRender();
      } else if (action === 'open-add-symbol-modal') {
        state.isAddSymbolModalOpen = true;
        triggerRender();
      } else if (action === 'close-add-symbol-modal') {
        state.isAddSymbolModalOpen = false;
        triggerRender();
      } else if (action === 'delete-symbol') {
        const code = el.getAttribute('data-symbol');
        state.symbols = state.symbols.filter((s) => s.symbolCode !== code);
        persistRemoteWorkspaceNow();
        triggerRender();
      } else if (action === 'sign-out') {
        await auth.signOut();
        state.isAuthenticated = false;
        triggerRender();
      }
    });
  });

  document.querySelectorAll('[data-action="select-provider-dropdown"]').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      const symCode = e.currentTarget.getAttribute('data-symbol');
      const prov = e.currentTarget.value;
      const sym = state.symbols.find((s) => s.symbolCode === symCode);
      if (sym) {
        sym.activeProvider = prov;
        await syncSymbolUpToNow(symCode);
        await persistRemoteWorkspaceNow();
      }
    });
  });

  document.querySelectorAll('[data-action="select-prediction-symbol"]').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      await openSymbolInTab(e.currentTarget.value);
    });
  });

  document.querySelectorAll('[data-action="toggle-watchlist"]').forEach((chk) => {
    chk.addEventListener('change', (e) => {
      const symCode = e.currentTarget.getAttribute('data-symbol');
      const sym = state.symbols.find((s) => s.symbolCode === symCode);
      if (sym) {
        sym.inWatchlist = e.currentTarget.checked;
        persistRemoteWorkspaceNow();
        triggerRender();
      }
    });
  });

  document.querySelectorAll('[data-action="toggle-tv-pref"]').forEach((chk) => {
    chk.addEventListener('change', (e) => {
      const key = e.currentTarget.getAttribute('data-pref-key');
      const val = Boolean(e.currentTarget.checked);
      state.chartPreferences[key] = val;
      if (key === 'isLogScale' && activeTab) {
        activeTab.isLogScale = val;
      }
      saveChartPreferences(state.chartPreferences);
      persistRemoteWorkspaceNow();
      triggerRender();
    });
  });

  const fetchSlider = document.querySelector('[data-action="set-fetch-limit"]');
  if (fetchSlider) {
    fetchSlider.addEventListener('input', (e) => {
      const val = Number(e.currentTarget.value || 500);
      state.chartPreferences.candleFetchLimit = val;
      const lbl = document.getElementById('fetch-limit-value-label');
      if (lbl) lbl.textContent = String(val);
    });
    fetchSlider.addEventListener('change', () => {
      saveChartPreferences(state.chartPreferences);
      persistRemoteWorkspaceNow();
    });
  }

  const addSymForm = document.getElementById('add-symbol-form');
  if (addSymForm) {
    addSymForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(addSymForm);
      const code = String(fd.get('symbol_code') || '').trim().toUpperCase();
      const title = String(fd.get('custom_title') || '').trim();
      const dec = Number(fd.get('decimals') || 2);
      if (code && !state.symbols.some((s) => s.symbolCode === code)) {
        state.symbols.push({
          symbolCode: code,
          inWatchlist: true,
          activeProvider: 'twelve_data',
          allowedProviders: ['twelve_data', 'yahoo_finance'],
          decimals: dec,
          lastClose: 0,
          lastCandleUtc: '',
          candles: [],
          isSyncing: false,
          syncError: false,
          isCustom: true,
          customTitle: title || code,
        });
        state.isAddSymbolModalOpen = false;
        await syncSymbolUpToNow(code);
        await persistRemoteWorkspaceNow();
      }
      triggerRender();
    });
  }
}

function bindCanvasInteractions(canvas, tab) {
  let isDragging = false;
  let isRightAxisDrag = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 6 : -6;
      tab.visibleCount = Math.max(15, Math.min(180, (tab.visibleCount || 48) + delta));
      renderCandlestickCanvas(canvas, tab, i18n);
    },
    { passive: false }
  );

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const meta = canvas._chartMeta;
    if (!meta) return;

    if (x > meta.chartW) {
      isRightAxisDrag = true;
      lastY = y;
      return;
    }

    const tool = tab.activeTool || 'cursor';
    if (tool !== 'cursor') {
      const idx = Math.max(0, Math.min(meta.visible.length - 1, Math.floor(x / meta.slotW)));
      const candle = meta.visible[idx];
      const price = meta.yToPrice(y);
      if (!candle) return;

      if (tool === 'hline') {
        tab.drawings.push({
          id: 'hl_' + Date.now(),
          type: 'hline',
          price1: price,
          time1EpochSec: Number(candle.openTimeSec),
          colorHex: tab.activeDrawingColorHex || '#F59E0B',
          lineWidthPx: tab.activeDrawingWidthPx || 2.0,
        });
        tab.activeTool = 'cursor';
        persistRemoteWorkspaceNow();
        triggerRender();
      } else if (tool === 'vline') {
        tab.drawings.push({
          id: 'vl_' + Date.now(),
          type: 'vline',
          price1: price,
          time1EpochSec: Number(candle.openTimeSec),
          colorHex: tab.activeDrawingColorHex || '#A855F7',
          lineWidthPx: tab.activeDrawingWidthPx || 2.0,
        });
        tab.activeTool = 'cursor';
        persistRemoteWorkspaceNow();
        triggerRender();
      } else if (tool === 'trend') {
        if (!tab.pendingTrendStart) {
          tab.pendingTrendStart = { price, timeEpochSec: Number(candle.openTimeSec) };
        } else {
          tab.drawings.push({
            id: 'tr_' + Date.now(),
            type: 'trend',
            price1: tab.pendingTrendStart.price,
            time1EpochSec: tab.pendingTrendStart.timeEpochSec,
            price2: price,
            time2EpochSec: Number(candle.openTimeSec),
            colorHex: tab.activeDrawingColorHex || '#2962FF',
            lineWidthPx: tab.activeDrawingWidthPx || 2.0,
          });
          tab.pendingTrendStart = null;
          tab.activeTool = 'cursor';
          persistRemoteWorkspaceNow();
          triggerRender();
        }
      }
      return;
    }

    const hitId = DrawingGeometry.findHitDrawing(tab.drawings, x, y, meta, 18);
    if (hitId) {
      tab.selectedDrawingId = hitId;
      triggerRender();
      return;
    } else if (tab.selectedDrawingId) {
      tab.selectedDrawingId = null;
      triggerRender();
    }

    isDragging = true;
    lastX = x;
    lastY = y;
  });

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const meta = canvas._chartMeta;
    if (!meta) return;

    if (isRightAxisDrag) {
      const dy = y - lastY;
      lastY = y;
      tab.priceScaleFactor = Math.max(
        0.25,
        Math.min(4.0, (tab.priceScaleFactor || 1.0) * (1 + dy * 0.005))
      );
      renderCandlestickCanvas(canvas, tab, i18n);
      return;
    }

    if (isDragging) {
      const dx = x - lastX;
      const dy = y - lastY;
      lastX = x;
      lastY = y;
      const candleShift = dx / Math.max(4, meta.slotW);
      const maxOff = Math.max(0, tab.candles.length - 5);
      tab.scrollOffset = Math.max(0, Math.min(maxOff, (tab.scrollOffset || 0) + candleShift));

      const priceRange = meta.maxP - meta.minP;
      const priceShift = (dy / Math.max(1, meta.chartH)) * priceRange;
      tab.verticalPriceOffset = (tab.verticalPriceOffset || 0) + priceShift;
      renderCandlestickCanvas(canvas, tab, i18n);
      return;
    }

    if (x <= meta.chartW) {
      const idx = Math.max(0, Math.min(meta.visible.length - 1, Math.floor(x / meta.slotW)));
      if (tab.hoverIndex !== idx && state.chartPreferences.chartVibrations && navigator.vibrate) {
        try {
          navigator.vibrate(4);
        } catch (_) {}
      }
      tab.hoverIndex = idx;
      tab.hoverY = y;
      renderCandlestickCanvas(canvas, tab, i18n);
      const ohlcContainer = document.querySelector('.floating-ohlc-bar');
      if (ohlcContainer) {
        const tmp = document.createElement('div');
        tmp.innerHTML = renderFloatingOhlcBar(tab);
        if (tmp.firstElementChild) {
          ohlcContainer.replaceWith(tmp.firstElementChild);
        }
      }
    }
  });

  const stopDrag = () => {
    isDragging = false;
    isRightAxisDrag = false;
  };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointerleave', () => {
    stopDrag();
    tab.hoverIndex = null;
    tab.hoverY = null;
    renderCandlestickCanvas(canvas, tab, i18n);
  });
}

async function bootstrap() {
  registerRenderCallback(renderApp);
  await i18n.init('fa');
  const sessionInfo = await auth.checkSession();
  state.hasOwnerAccount = sessionInfo.hasOwnerAccount;
  state.isAuthenticated = sessionInfo.isAuthenticated;
  state.ownerUsername = sessionInfo.username || '';
  state.ownerEmail = sessionInfo.email || '';

  if (state.isAuthenticated) {
    await applyRemoteWorkspaceIfPresent();
    await syncAllWatchlist();
    await openSymbolInTab('SPOTBRENT');
  } else {
    triggerRender();
  }

  window.addEventListener('resize', () => {
    const canvas = document.getElementById('main-chart-canvas');
    const activeTab = state.openTabs.find((t) => t.tabId === state.activeTabId);
    if (canvas && activeTab) {
      renderCandlestickCanvas(canvas, activeTab, i18n);
    }
  });
}

bootstrap();
