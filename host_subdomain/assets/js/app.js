import { I18nManager } from './core/i18n.js?v=1.35.0';
import {
  state,
  savePreferences,
  saveSymbolsToStorage,
  saveDrawings,
  saveLastOpenedSymbol,
  saveOpenTabs,
  saveOpenTabsToStorage,
  savePanelLayout,
  getCachedOrAggregatedCandles,
  resetColorsToDefault,
  resetAlgoParamsToDefault,
  registerAutoSyncCallback,
} from './core/store.js?v=1.35.0';
import {
  syncServerAuthStatus,
  fetchSystemStatus,
  uploadWorkspaceSync,
  downloadWorkspaceSync,
  loginOrRegisterOwner,
  updateOwnerEmailOnServer,
  updateOwnerPasswordOnServer,
  requestPasswordResetCode,
  confirmPasswordResetCode,
  logoutOwnerOnServer,
  syncSymbolNow,
  syncAllWatchlistSymbols,
} from './services/apiService.js?v=1.35.0';
import { PriceFormatter } from './algorithms/priceFormatter.js?v=1.35.0';
import { DrawingGeometry } from './algorithms/drawingGeometry.js?v=1.35.0';
import { renderCandlestickCanvas } from './components/chartRenderer.js?v=1.35.0';
import { renderLoginScreen } from './views/loginView.js?v=1.35.0';
import {
  renderTopHeaderBar,
  renderBottomChartBar,
  renderIndicatorsModal,
} from './views/headerView.js?v=1.35.0';
import { renderLeftToolRail } from './views/toolRailView.js?v=1.35.0';
import {
  renderRightSplitPanel,
  renderSymbolOverviewModal,
  renderSymbolBadge,
} from './views/watchlistView.js?v=1.35.0';
import { renderPredictionModal } from './views/analysisView.js?v=1.35.0';
import { renderSettingsModal } from './views/settingsView.js?v=1.35.0';
import { renderRightIconRail } from './views/navigationView.js?v=1.35.0';

const i18n = new I18nManager();
let countdownIntervalId = null;
let canvasResizeObserver = null;

registerAutoSyncCallback(() => {
  if (state.isAuthenticated) {
    uploadWorkspaceSync().catch(() => {});
  }
});

function applyTheme() {
  const mode = state.isDarkTheme ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', mode);
  if (document.body) {
    document.body.classList.toggle('theme-dark', state.isDarkTheme);
    document.body.classList.toggle('theme-light', !state.isDarkTheme);
  }
  localStorage.setItem('ci_theme_dark', state.isDarkTheme ? 'true' : 'false');
}

function getActiveTab() {
  return state.openTabs.find((t) => t.tabId === state.activeTabId) || state.openTabs[0] || null;
}

function ensureInitialTabs() {
  if (state.openTabs && state.openTabs.length > 0) {
    state.openTabs.forEach((tab) => {
      const sym = state.symbols.find((s) => s.symbolCode === tab.symbolCode);
      const prov = tab.provider || (sym ? sym.activeProvider : 'tvdatafeed');
      const tf =
        prov === 'eia_brent_spot'
          ? 'D1'
          : prov === 'stooq' && tab.timeframe !== 'W1'
            ? 'D1'
            : tab.timeframe || 'M15';
      tab.timeframe = tf;
      tab.chartId = `${tab.symbolCode}_${tf}`;
      const cached = getCachedOrAggregatedCandles(tab.symbolCode, prov, tf);
      tab.candles = cached.length > 0 ? cached : (sym && sym.candles) || [];
      tab.drawings = state.drawingsByChartId[tab.chartId] || tab.drawings || [];
    });
    if (!state.activeTabId || !state.openTabs.some((t) => t.tabId === state.activeTabId)) {
      const preferred = state.openTabs.find((t) => t.symbolCode === state.lastOpenedSymbolCode);
      state.activeTabId = preferred ? preferred.tabId : state.openTabs[0].tabId;
    }
    return;
  }
  const watchlist = state.symbols.filter((s) => s.inWatchlist);
  const listToOpen = watchlist.length > 0 ? watchlist.slice(0, 2) : state.symbols.slice(0, 2);

  listToOpen.forEach((sym) => {
    const tf =
      sym.activeProvider === 'eia_brent_spot' || sym.activeProvider === 'stooq'
        ? 'D1'
        : sym.timeframe || 'M15';
    const tabId = `tab_${sym.symbolCode}_${tf}`;
    const drawKey = `${sym.symbolCode}_${tf}`;
    const cached = getCachedOrAggregatedCandles(sym.symbolCode, sym.activeProvider, tf);
    state.openTabs.push({
      tabId,
      chartId: drawKey,
      symbolCode: sym.symbolCode,
      provider: sym.activeProvider,
      timeframe: tf,
      decimals: sym.decimals,
      candles: cached.length > 0 ? cached : sym.candles || [],
      chartType: 'candles',
      showVolume: true,
      volumePaneRatio: 0.22,
      showSma20: false,
      showEma50: false,
      showBollinger: false,
      isLogScale: Boolean(state.chartPreferences.isLogScale),
      selectedRangePreset: null,
      visibleCount: 48,
      scrollOffset: 0,
      priceScaleFactor: 1.0,
      verticalPriceOffset: 0.0,
      hoverIndex: null,
      hoverY: null,
      activeTool: 'cursor',
      activeDrawingColorHex: '#2962FF',
      activeDrawingWidthPx: 2.0,
      selectedDrawingId: null,
      pendingTrendStart: null,
      drawings: state.drawingsByChartId[drawKey] || [],
    });
  });

  if (state.openTabs.length > 0) {
    const preferred = state.openTabs.find((t) => t.symbolCode === state.lastOpenedSymbolCode);
    state.activeTabId = preferred ? preferred.tabId : state.openTabs[0].tabId;
  }
  saveOpenTabs(true);
}

function openOrFocusSymbolTab(symbolCode, requestedTf) {
  const sym = state.symbols.find((s) => s.symbolCode === symbolCode);
  if (!sym) return;
  saveLastOpenedSymbol(symbolCode);

  let existing = state.openTabs.find((t) => t.symbolCode === symbolCode);
  const rawTf = requestedTf || (existing ? existing.timeframe : sym.timeframe || 'M15');
  const tf =
    sym.activeProvider === 'eia_brent_spot'
      ? 'D1'
      : sym.activeProvider === 'stooq' && rawTf !== 'W1'
        ? 'D1'
        : rawTf;

  const cached = getCachedOrAggregatedCandles(symbolCode, sym.activeProvider, tf);
  const drawKey = `${symbolCode}_${tf}`;
  if (existing) {
    existing.timeframe = tf;
    existing.chartId = drawKey;
    existing.provider = sym.activeProvider;
    existing.candles = cached.length > 0 ? cached : sym.candles || [];
    existing.drawings = state.drawingsByChartId[drawKey] || existing.drawings || [];
    state.activeTabId = existing.tabId;
  } else {
    const tabId = `tab_${symbolCode}_${Date.now()}`;
    const newTab = {
      tabId,
      chartId: drawKey,
      symbolCode: sym.symbolCode,
      provider: sym.activeProvider,
      timeframe: tf,
      decimals: sym.decimals,
      candles: cached.length > 0 ? cached : sym.candles || [],
      chartType: 'candles',
      showVolume: true,
      volumePaneRatio: 0.22,
      showSma20: false,
      showEma50: false,
      showBollinger: false,
      isLogScale: Boolean(state.chartPreferences.isLogScale),
      selectedRangePreset: null,
      visibleCount: 48,
      scrollOffset: 0,
      priceScaleFactor: 1.0,
      verticalPriceOffset: 0.0,
      hoverIndex: null,
      hoverY: null,
      activeTool: 'cursor',
      activeDrawingColorHex: '#2962FF',
      activeDrawingWidthPx: 2.0,
      selectedDrawingId: null,
      pendingTrendStart: null,
      drawings: state.drawingsByChartId[drawKey] || [],
    };
    state.openTabs.push(newTab);
    state.activeTabId = tabId;
  }

  saveOpenTabs();
  syncSymbolNow(symbolCode, tf, renderApp);
}

function computePresetBarCount(candles, rk) {
  const fallbackMap = {
    '1D': 64,
    '5D': 85,
    '1W': 120,
    '1M': 125,
    '3M': 66,
    '6M': 132,
    '9M': 198,
    YTD: 210,
    '1Y': 260,
    '5Y': 260,
    All: 320,
  };
  if (!candles || candles.length === 0) return fallbackMap[rk] || 64;
  if (rk === 'All') return Math.min(600, Math.max(24, candles.length));

  const lastC = candles[candles.length - 1];
  const lastMs =
    Number(lastC.open_time_utc_ms) ||
    Number(lastC.openTimeSec || 0) * 1000 ||
    Date.parse(lastC.open_time_utc || '') ||
    Date.now();

  let cutoffMs = lastMs - 86400000 * 7;
  if (rk === '1D') cutoffMs = lastMs - 86400000 * 1.5;
  else if (rk === '5D') cutoffMs = lastMs - 86400000 * 5.5;
  else if (rk === '1W') cutoffMs = lastMs - 86400000 * 7.5;
  else if (rk === '1M') cutoffMs = lastMs - 86400000 * 31;
  else if (rk === '3M') cutoffMs = lastMs - 86400000 * 92;
  else if (rk === '6M') cutoffMs = lastMs - 86400000 * 183;
  else if (rk === '9M') cutoffMs = lastMs - 86400000 * 274;
  else if (rk === 'YTD') {
    const yr = new Date(lastMs).getUTCFullYear();
    cutoffMs = Date.UTC(yr, 0, 1, 0, 0, 0);
  } else if (rk === '1Y') cutoffMs = lastMs - 86400000 * 366;
  else if (rk === '5Y') cutoffMs = lastMs - 86400000 * 365 * 5;

  let count = 0;
  for (let i = candles.length - 1; i >= 0; i--) {
    const c = candles[i];
    const ms =
      Number(c.open_time_utc_ms) ||
      Number(c.openTimeSec || 0) * 1000 ||
      Date.parse(c.open_time_utc || '') ||
      0;
    if (ms >= cutoffMs) {
      count++;
    } else {
      break;
    }
  }

  if (count < 15) {
    count = Math.min(candles.length, fallbackMap[rk] || 64);
  }
  return Math.max(15, Math.min(600, count));
}

function renderOhlcvOverlay(activeTab) {
  if (!activeTab || !activeTab.candles || activeTab.candles.length === 0) return '';
  const visibleCount = Math.max(15, Math.min(600, Math.round(activeTab.visibleCount || 48)));
  const maxOffset = Math.max(0, activeTab.candles.length - 5);
  const offset = Math.max(0, Math.min(maxOffset, Math.round(activeTab.scrollOffset || 0)));
  const endIdx = Math.max(1, activeTab.candles.length - offset);
  const startIdx = Math.max(0, endIdx - visibleCount);
  const visible = activeTab.candles.slice(startIdx, endIdx);

  const c =
    activeTab.hoverIndex !== null && visible[activeTab.hoverIndex]
      ? visible[activeTab.hoverIndex]
      : activeTab.candles[activeTab.candles.length - 1];
  if (!c) return '';

  const sym = state.symbols.find((s) => s.symbolCode === activeTab.symbolCode);
  const title = sym ? sym.customTitle || i18n.t('symbol_' + sym.symbolCode) || sym.symbolCode : activeTab.symbolCode;
  const dec = activeTab.decimals;
  const isBull = Number(c.close) >= Number(c.open);
  const col = isBull ? 'var(--bull)' : 'var(--bear)';
  const diff = Number(c.close) - Number(c.open);
  const pct = Number(c.open) > 0 ? PriceFormatter.formatSignedPct(c.open, c.close) : '+0.00%';

  const indPills = [];
  if (activeTab.showSma20) {
    indPills.push(
      `<span class="tv-ind-pill" style="color: #F59E0B;">SMA 20 <span style="cursor:pointer; opacity:0.8;" data-action="toggle-sma20">✕</span></span>`
    );
  }
  if (activeTab.showEma50) {
    indPills.push(
      `<span class="tv-ind-pill" style="color: #06B6D4;">EMA 50 <span style="cursor:pointer; opacity:0.8;" data-action="toggle-ema50">✕</span></span>`
    );
  }
  if (activeTab.showBollinger) {
    indPills.push(
      `<span class="tv-ind-pill" style="color: #A855F7;">BB (20, 2) <span style="cursor:pointer; opacity:0.8;" data-action="toggle-bollinger">✕</span></span>`
    );
  }

  return `
    <div class="tv-ohlc-overlay ltr-num" dir="ltr">
      <div class="tv-ohlc-main-line">
        <span class="tv-ohlc-symbol-title">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--bull); display: inline-block;"></span>
          <span>${title}</span>
          <span style="color: var(--text-muted); font-weight: 600;">· ${PriceFormatter.displayTimeframeLabel(activeTab.timeframe)}</span>
        </span>
        <span>O<strong style="color: ${col}; margin-left: 2px;">${PriceFormatter.formatPrice(c.open, dec)}</strong></span>
        <span>H<strong style="color: var(--bull); margin-left: 2px;">${PriceFormatter.formatPrice(c.high, dec)}</strong></span>
        <span>L<strong style="color: var(--bear); margin-left: 2px;">${PriceFormatter.formatPrice(c.low, dec)}</strong></span>
        <span>C<strong style="color: ${col}; margin-left: 2px;">${PriceFormatter.formatPrice(c.close, dec)}</strong></span>
        <span style="color: ${col}; font-weight: 700;">${diff >= 0 ? '+' : ''}${PriceFormatter.formatPrice(diff, dec)} (${pct})</span>
        <span style="color: var(--text-muted);">Vol <strong style="color: var(--text);">${PriceFormatter.formatVolume(c.volume)}</strong></span>
      </div>
      ${
        indPills.length > 0
          ? `<div class="tv-ohlc-indicators-line">${indPills.join('')}</div>`
          : ''
      }
    </div>
  `;
}

function renderAddSymbolModal() {
  if (!state.isAddSymbolModalOpen) return '';
  const catalogRows = state.symbols
    .map((s) => {
      const rawTitle = s.customTitle || i18n.t('symbol_' + s.symbolCode) || s.symbolCode;
      const cleanTitle = rawTitle.replace(/\s*\([A-Z0-9_]+\)\s*/g, '').trim() || rawTitle;
      return `
        <div class="tv-settings-symbol-row" style="padding: 8px 10px; margin-bottom: 6px;">
          <div class="tv-settings-symbol-left">
            ${renderSymbolBadge(s.symbolCode, 28)}
            <div>
              <div style="font-size: 12.5px; font-weight: 700; color: var(--text-strong);">${s.symbolCode}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${cleanTitle}</div>
            </div>
          </div>
          <label class="tv-toggle-label">
            <input
              type="checkbox"
              class="tv-toggle-input"
              data-action="toggle-watchlist"
              data-symbol="${s.symbolCode}"
              ${s.inWatchlist ? 'checked' : ''}
            />
            <span class="tv-toggle-slider"></span>
          </label>
        </div>
      `;
    })
    .join('');

  return `
    <div class="modal-backdrop" data-action="close-add-symbol-modal">
      <div class="modal-card" style="max-width: 480px;">
        <div class="tv-modal-header">
          <div class="tv-modal-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>${i18n.t('settings_add_custom_symbol')}</span>
          </div>
          <button type="button" class="btn btn-sm btn-icon" data-action="close-add-symbol-modal">✕</button>
        </div>
        <div class="tv-modal-body">
          <div style="margin-bottom: 14px;">
            <div style="font-size: 12px; font-weight: 700; color: var(--text-strong); margin-bottom: 8px;">
              ${i18n.t('settings_symbols_section')}
            </div>
            ${catalogRows}
          </div>

          <div class="card-subtle">
            <div style="font-size: 12px; font-weight: 700; color: var(--text-strong); margin-bottom: 8px;">
              + ${i18n.t('settings_add_custom_symbol')}
            </div>
            <form id="add-symbol-form" style="display: flex; flex-direction: column; gap: 10px;">
              <div>
                <label class="tv-input-label">${i18n.t('settings_custom_symbol_code_hint')}</label>
                <input class="input-field ltr-num" type="text" name="symbol_code" placeholder="e.g. BTCUSD, USOIL" required />
              </div>
              <div>
                <label class="tv-input-label">${i18n.t('settings_custom_symbol_title_hint')}</label>
                <input class="input-field" type="text" name="symbol_title" placeholder="${i18n.t('settings_custom_symbol_title_hint')}" required />
              </div>
              <div>
                <label class="tv-input-label">${i18n.t('label_active_source')}</label>
                <select class="input-field ltr-num" name="provider">
                  <option value="tvdatafeed">TradingView (tvdatafeed)</option>
                  <option value="biquote">biquote Feed</option>
                  <option value="twelve_data">Twelve Data</option>
                  <option value="dukascopy">Dukascopy</option>
                  <option value="yahoo_finance">Yahoo Finance</option>
                  <option value="stooq">Stooq EOD</option>
                </select>
              </div>
              <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 4px; min-height: 36px;">
                ${i18n.t('settings_custom_symbol_save')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderFallbackErrorBoundary(err) {
  const root = document.getElementById('app') || document.getElementById('app-root');
  if (!root) return;
  const msg = err && err.message ? err.message : 'Unknown UI Error';
  root.innerHTML = `
    <div class="tv-auth-screen" dir="rtl">
      <div class="tv-auth-card" style="text-align: center; max-width: 460px;">
        <div class="tv-auth-emblem" style="background: linear-gradient(135deg, #EF5350, #B71C1C); color: #fff;">!</div>
        <h2 class="tv-auth-title" style="color: var(--bear); font-size: 18px;">بازیابی خودکار محیط کاری</h2>
        <div class="tv-auth-sub" style="margin-top: 8px;">
          یک خطای غیرمنتظره در رندرینگ شناسایی شد، اما تنظیمات و داده‌های شما در حافظه امن مرورگر حفظ شده‌اند.
        </div>
        <div style="margin: 14px 0; background: var(--bg); border: 1px solid var(--border); padding: 10px; border-radius: 8px; font-family: monospace; font-size: 11px; color: var(--text-muted); text-align: left; direction: ltr; overflow-x: auto;">
          ${msg}
        </div>
        <div style="display: flex; gap: 8px; justify-content: center; margin-top: 16px;">
          <button class="tv-auth-submit" style="margin: 0; width: auto; padding: 0 20px;" onclick="location.reload(true);">
            بارگذاری مجدد
          </button>
          <button class="tv-auth-submit" style="margin: 0; width: auto; padding: 0 20px; background: var(--surface-elevated); color: var(--text-strong); border: 1px solid var(--border);" onclick="localStorage.removeItem('ci_theme_dark'); location.reload();">
            بازنشانی تنظیمات
          </button>
        </div>
      </div>
    </div>
  `;
}

export function renderApp() {
  try {
    applyTheme();
    const root = document.getElementById('app') || document.getElementById('app-root');
    if (!root) return;

    if (!state.isAuthenticated) {
      root.innerHTML = renderLoginScreen(i18n);
      bindAuthForms();
      window.__CI_APP_MOUNTED__ = true;
      return;
    }

    ensureInitialTabs();
    const activeTab = getActiveTab();
    if (activeTab) {
      activeTab.candles = getCachedOrAggregatedCandles(
        activeTab.symbolCode,
        activeTab.provider,
        activeTab.timeframe
      );
    }

    const scrollPositions = {};
    const scrollSelectors = [
      '.tv-wl-list',
      '.tv-symbol-details-pane',
      '.tv-settings-body',
      '.modal-body',
      '.tv-symbol-overview-modal-body',
      '#tv-watchlist-top-pane',
      '.tv-symbols-table-container'
    ];
    scrollSelectors.forEach((sel) => {
      const element = document.querySelector(sel);
      if (element) {
        scrollPositions[sel] = { top: element.scrollTop, left: element.scrollLeft };
      }
    });

    root.innerHTML = `
      <div class="tv-app-shell ${state.isFullscreen ? 'is-fullscreen' : ''}">
        ${renderTopHeaderBar(activeTab, i18n)}

        <div class="tv-main-area">
          ${renderLeftToolRail(activeTab, i18n, state.activeRailPopup)}

          <main class="chart-workspace">
            <div class="chart-canvas-box">
              ${renderOhlcvOverlay(activeTab)}
              <canvas id="main-chart-canvas" class="chart-canvas"></canvas>
            </div>
            ${renderBottomChartBar(activeTab, i18n)}
          </main>

          ${renderRightSplitPanel(activeTab, i18n)}
          ${renderRightIconRail(i18n)}
        </div>

        ${renderSettingsModal(i18n)}
        ${renderPredictionModal(activeTab, i18n)}
        ${renderIndicatorsModal(activeTab, i18n)}
        ${renderSymbolOverviewModal(i18n)}
        ${renderAddSymbolModal()}
      </div>
    `;

    bindSettingsForms();
    bindPanelResizers();
    bindCanvasEvents(activeTab);
    redrawActiveCanvas();

    scrollSelectors.forEach((sel) => {
      const element = document.querySelector(sel);
      if (element && scrollPositions[sel]) {
        element.scrollTop = scrollPositions[sel].top;
        element.scrollLeft = scrollPositions[sel].left;
      }
    });

    window.__CI_APP_MOUNTED__ = true;
  } catch (err) {
    console.error('[Chart Intelligence] Render failed:', err);
    renderFallbackErrorBoundary(err);
  }
}

function bindPanelResizers() {
  const colResizer = document.getElementById('tv-right-col-resizer');
  const rightPanel = document.getElementById('tv-right-split-panel');
  if (colResizer && rightPanel) {
    colResizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      colResizer.classList.add('dragging');
      const startX = e.clientX;
      const startW = rightPanel.getBoundingClientRect().width;

      const onMove = (moveEv) => {
        // Right panel is on the right side in LTR layout, so dragging left (negative dx) increases its width
        const dx = startX - moveEv.clientX;
        const nextW = Math.max(185, Math.min(520, Math.round(startW + dx)));
        state.rightPanelWidth = nextW;
        rightPanel.style.width = `${nextW}px`;
        rightPanel.style.minWidth = `${nextW}px`;
        redrawActiveCanvas();
      };

      const onUp = () => {
        colResizer.classList.remove('dragging');
        savePanelLayout();
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  const rowResizer = document.getElementById('tv-right-row-resizer');
  const topPane = document.getElementById('tv-watchlist-top-pane');
  if (rowResizer && rightPanel && topPane) {
    rowResizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      rowResizer.classList.add('dragging');
      const panelRect = rightPanel.getBoundingClientRect();

      const onMove = (moveEv) => {
        if (panelRect.height <= 100) return;
        const relY = moveEv.clientY - panelRect.top;
        const ratio = Math.max(0.22, Math.min(0.78, relY / panelRect.height));
        state.watchlistTopRatio = ratio;
        const pct = Math.round(ratio * 100);
        topPane.style.flex = `0 0 ${pct}%`;
        topPane.style.height = `${pct}%`;
      };

      const onUp = () => {
        rowResizer.classList.remove('dragging');
        savePanelLayout();
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }
}

function redrawActiveCanvas() {
  const canvas = document.getElementById('main-chart-canvas');
  const activeTab = getActiveTab();
  if (canvas && activeTab) {
    renderCandlestickCanvas(canvas, activeTab, i18n);
    const box = canvas.closest('.chart-canvas-box');
    if (box) {
      const oldOverlay = box.querySelector('.tv-ohlc-overlay');
      if (oldOverlay) {
        const temp = document.createElement('div');
        temp.innerHTML = renderOhlcvOverlay(activeTab);
        if (temp.firstElementChild) {
          oldOverlay.replaceWith(temp.firstElementChild);
        }
      }
    }
  }
}

function bindCanvasEvents(activeTab) {
  const canvas = document.getElementById('main-chart-canvas');
  if (!canvas || !activeTab) return;

  const box = canvas.closest('.chart-canvas-box');
  if (box && typeof ResizeObserver !== 'undefined') {
    if (canvasResizeObserver) {
      canvasResizeObserver.disconnect();
    }
    canvasResizeObserver = new ResizeObserver(() => {
      redrawActiveCanvas();
    });
    canvasResizeObserver.observe(box);
  }

  let isDragging = false;
  let dragStartX = 0;
  let dragStartOffset = 0;
  let isScalingAxis = false;
  let scaleStartY = 0;
  let scaleStartFactor = 1.0;

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const meta = canvas._chartMeta;
    if (!meta) return;

    if (x > meta.chartW) {
      isScalingAxis = true;
      scaleStartY = y;
      scaleStartFactor = Number(activeTab.priceScaleFactor || 1.0);
      return;
    }

    const tool = activeTab.activeTool || activeTab.activeDrawingTool || 'cursor';
    if (tool && tool !== 'cursor') {
      const idx = Math.max(0, Math.min(meta.visible.length - 1, Math.floor(x / meta.slotW)));
      const candle = meta.visible[idx];
      if (!candle) return;
      const rawPrice = meta.yToPrice(y);
      const price = activeTab.isMagnetMode
        ? DrawingGeometry.snapToCandleOhlc(candle.open, candle.high, candle.low, candle.close, rawPrice)
        : rawPrice;
      const openSec = Number(
        candle.openTimeSec || Math.floor(Number(candle.open_time_utc_ms || 0) / 1000)
      );
      const openMs = openSec * 1000;
      const drawKey = `${activeTab.symbolCode}_${activeTab.timeframe}`;

      if (tool === 'hline' || tool === 'horizontal_line') {
        activeTab.drawings.push({
          id: 'd_' + Date.now(),
          type: 'horizontal_line',
          price: price,
          price1: price,
          colorHex: activeTab.activeDrawingColorHex,
          strokeWidthPx: activeTab.activeDrawingWidthPx,
          lineWidthPx: activeTab.activeDrawingWidthPx,
        });
        activeTab.activeTool = 'cursor';
        activeTab.activeDrawingTool = 'cursor';
        saveDrawings(drawKey, activeTab.drawings);
        renderApp();
        return;
      }
      if (tool === 'vline' || tool === 'vertical_line') {
        activeTab.drawings.push({
          id: 'd_' + Date.now(),
          type: 'vertical_line',
          timeUtcMillis: openMs,
          time1EpochSec: openSec,
          colorHex: activeTab.activeDrawingColorHex,
          strokeWidthPx: activeTab.activeDrawingWidthPx,
          lineWidthPx: activeTab.activeDrawingWidthPx,
        });
        activeTab.activeTool = 'cursor';
        activeTab.activeDrawingTool = 'cursor';
        saveDrawings(drawKey, activeTab.drawings);
        renderApp();
        return;
      }
      if (tool === 'trend' || tool === 'trend_line' || tool === 'fib' || tool === 'fib_retracement') {
        const canonicalType = tool === 'fib' || tool === 'fib_retracement' ? 'fib_retracement' : 'trend_line';
        if (!activeTab.pendingTrendStart) {
          activeTab.pendingTrendStart = { timeUtcMillis: openMs, time1EpochSec: openSec, price1: price };
        } else {
          activeTab.drawings.push({
            id: 'd_' + Date.now(),
            type: canonicalType,
            startTimeUtcMillis: activeTab.pendingTrendStart.timeUtcMillis,
            endTimeUtcMillis: openMs,
            startPrice: activeTab.pendingTrendStart.price1,
            endPrice: price,
            time1EpochSec: activeTab.pendingTrendStart.time1EpochSec,
            price1: activeTab.pendingTrendStart.price1,
            time2EpochSec: openSec,
            price2: price,
            colorHex: activeTab.activeDrawingColorHex,
            strokeWidthPx: activeTab.activeDrawingWidthPx,
            lineWidthPx: activeTab.activeDrawingWidthPx,
          });
          activeTab.pendingTrendStart = null;
          activeTab.activeTool = 'cursor';
          activeTab.activeDrawingTool = 'cursor';
          saveDrawings(drawKey, activeTab.drawings);
          renderApp();
        }
        return;
      }
      if (tool === 'long_position' || tool === 'short_position') {
        const stepMs = PriceFormatter.stepMilliseconds(activeTab.timeframe);
        const endMs = openMs + stepMs * 8;
        const span = Math.max((meta.maxP - meta.minP) * 0.14, price * 0.004);
        const isLong = tool === 'long_position';
        const targetPrice = isLong ? price + span * 1.8 : Math.max(0.0001, price - span * 1.8);
        const stopPrice = isLong ? Math.max(0.0001, price - span * 0.9) : price + span * 0.9;
        activeTab.drawings.push({
          id: 'd_' + Date.now(),
          type: tool,
          startTimeUtcMillis: openMs,
          endTimeUtcMillis: endMs,
          entryPrice: price,
          targetPrice,
          stopPrice,
          colorHex: isLong ? '#26A69A' : '#EF5350',
          strokeWidthPx: activeTab.activeDrawingWidthPx,
          lineWidthPx: activeTab.activeDrawingWidthPx,
        });
        activeTab.activeTool = 'cursor';
        activeTab.activeDrawingTool = 'cursor';
        saveDrawings(drawKey, activeTab.drawings);
        renderApp();
        return;
      }
    } else if (canvas._chartLayout && Array.isArray(activeTab.drawings) && activeTab.drawings.length > 0) {
      const tol = Number(state.chartPreferences.drawingHitTolerancePx || 24);
      const hit = DrawingGeometry.hitTestDrawing(
        activeTab.drawings,
        x,
        y,
        canvas._chartLayout.timeToX,
        canvas._chartLayout.priceToY,
        tol
      );
      const nextSelId = hit ? hit.id : null;
      if (activeTab.selectedDrawingId !== nextSelId) {
        activeTab.selectedDrawingId = nextSelId;
        renderApp();
      }
    }

    isDragging = true;
    dragStartX = x;
    dragStartOffset = Number(activeTab.scrollOffset || 0);
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const meta = canvas._chartMeta;
    if (!meta) return;

    if (isScalingAxis) {
      const dy = y - scaleStartY;
      activeTab.priceScaleFactor = Math.max(0.25, Math.min(4.0, scaleStartFactor * (1 + dy * 0.005)));
      redrawActiveCanvas();
      return;
    }

    if (isDragging) {
      const dx = x - dragStartX;
      const deltaBars = Math.round(dx / Math.max(2, meta.slotW));
      const maxOffset = Math.max(0, (activeTab.candles || []).length - 5);
      activeTab.scrollOffset = Math.max(0, Math.min(maxOffset, dragStartOffset + deltaBars));
      redrawActiveCanvas();
      return;
    }

    if (x <= meta.chartW) {
      const idx = Math.max(0, Math.min(meta.visible.length - 1, Math.floor(x / meta.slotW)));
      activeTab.hoverIndex = idx;
      activeTab.hoverY = y;
      redrawActiveCanvas();
    }
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    isScalingAxis = false;
  });

  canvas.addEventListener('mouseleave', () => {
    activeTab.hoverIndex = null;
    activeTab.hoverY = null;
    redrawActiveCanvas();
  });

  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const meta = canvas._chartMeta;
    if (meta && x > meta.chartW) {
      activeTab.priceScaleFactor = 1.0;
      activeTab.verticalPriceOffset = 0.0;
      renderApp();
    }
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const step = e.deltaY > 0 ? 6 : -6;
      activeTab.visibleCount = Math.max(15, Math.min(600, (activeTab.visibleCount || 48) + step));
      redrawActiveCanvas();
    },
    { passive: false }
  );
}

function bindAuthForms() {
  const authForm = document.getElementById('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(authForm);
      const username = String(fd.get('username') || '').trim();
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      const confirm = String(fd.get('confirm_password') || '');

      if (!state.isOwnerRegistered && password !== confirm) {
        state.authErrorKey = 'login_error_password_mismatch';
        renderApp();
        return;
      }
      const res = await loginOrRegisterOwner(username, email, password);
      if (!res.ok) {
        state.authErrorKey = res.errorKey || 'login_error_invalid_credentials';
      } else {
        state.authErrorKey = '';
        await syncAllWatchlistSymbols(renderApp);
      }
      renderApp();
    });
  }

  const forgotReq = document.getElementById('forgot-request-form');
  if (forgotReq) {
    forgotReq.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(forgotReq);
      const email = String(fd.get('email') || '').trim();
      const ok = await requestPasswordResetCode(email);
      if (ok) {
        state.authMode = 'forgot_verify';
        state.authInfoKey = 'forgot_code_sent_success';
        state.authErrorKey = '';
      } else {
        state.authErrorKey = 'forgot_error_email_not_found';
      }
      renderApp();
    });
  }

  const forgotVer = document.getElementById('forgot-verify-form');
  if (forgotVer) {
    forgotVer.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(forgotVer);
      const email = String(fd.get('email') || '').trim();
      const code = String(fd.get('recovery_code') || '').trim();
      const np = String(fd.get('new_password') || '');
      const cp = String(fd.get('confirm_password') || '');
      if (np !== cp) {
        state.authErrorKey = 'login_error_password_mismatch';
        renderApp();
        return;
      }
      const ok = await confirmPasswordResetCode(email, code, np);
      if (ok) {
        state.authMode = 'login';
        state.authInfoKey = 'forgot_reset_success';
        state.authErrorKey = '';
      } else {
        state.authErrorKey = 'forgot_error_invalid_code';
      }
      renderApp();
    });
  }
}

function bindSettingsForms() {
  const emailForm = document.getElementById('settings-email-form');
  if (emailForm) {
    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(emailForm);
      const email = String(fd.get('recovery_email') || '').trim();
      await updateOwnerEmailOnServer(email);
      state.statusBannerKey = 'settings_email_updated_toast';
      renderApp();
    });
  }

  const passForm = document.getElementById('settings-password-form');
  if (passForm) {
    passForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(passForm);
      const np = String(fd.get('new_password') || '');
      await updateOwnerPasswordOnServer(np);
      state.statusBannerKey = 'settings_password_updated_toast';
      renderApp();
    });
  }

  const byokForm = document.getElementById('settings-byok-form');
  if (byokForm) {
    byokForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tdEl = document.getElementById('byok-twelve-data');
      const stqEl = document.getElementById('byok-stooq');
      const avEl = document.getElementById('byok-alphavantage');
      const fhEl = document.getElementById('byok-finnhub');
      state.chartPreferences.twelveDataApiKey = tdEl ? String(tdEl.value || '').trim() : '';
      state.chartPreferences.stooqApiKey = stqEl ? String(stqEl.value || '').trim() : '';
      state.chartPreferences.alphaVantageApiKey = avEl ? String(avEl.value || '').trim() : '';
      state.chartPreferences.finnhubApiKey = fhEl ? String(fhEl.value || '').trim() : '';
      savePreferences();
      state.statusBannerKey = 'settings_byok_saved';
      showFloatingToast(i18n.t('settings_byok_saved'));
      renderApp();
    });
  }

  const addSymForm = document.getElementById('add-symbol-form');
  if (addSymForm) {
    addSymForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(addSymForm);
      const code = String(fd.get('symbol_code') || '')
        .trim()
        .toUpperCase();
      const title = String(fd.get('symbol_title') || '').trim();
      const provider = String(fd.get('provider') || 'tvdatafeed');
      if (code && !state.symbols.some((s) => s.symbolCode === code)) {
        const initTf = provider === 'stooq' ? 'D1' : 'M15';
        state.symbols.push({
          symbolCode: code,
          customTitle: title || code,
          decimals: 2,
          inWatchlist: true,
          activeProvider: provider,
          allowedProviders: ['tvdatafeed', 'biquote', 'twelve_data', 'dukascopy', 'yahoo_finance', 'stooq'],
          timeframe: initTf,
          lastClose: 0,
          lastCandleUtc: '',
          candles: [],
          isCustom: true,
        });
        saveSymbolsToStorage();
        state.isAddSymbolModalOpen = false;
        await syncSymbolNow(code, initTf, renderApp);
      }
      renderApp();
    });
  }
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) {
    if (state.activeRailPopup && !e.target.closest('.rail-flyout-menu') && !e.target.closest('.tool-rail-picker-wrap')) {
      state.activeRailPopup = null;
      renderApp();
    }
    return;
  }
  const action = el.getAttribute('data-action');
  const activeTab = getActiveTab();

  if (action === 'toggle-rail-popup') {
    const popupType = el.getAttribute('data-popup');
    state.activeRailPopup = state.activeRailPopup === popupType ? null : popupType;
    renderApp();
  } else if (action === 'set-lang') {
    i18n.setLanguage(el.getAttribute('data-lang'));
    renderApp();
  } else if (action === 'toggle-lang-quick') {
    const nextLang = i18n.getCurrentLanguage() === 'fa' ? 'en' : 'fa';
    i18n.setLanguage(nextLang);
    renderApp();
  } else if (action === 'set-theme') {
    state.isDarkTheme = el.getAttribute('data-theme') === 'dark';
    renderApp();
  } else if (action === 'toggle-theme-quick') {
    state.isDarkTheme = !state.isDarkTheme;
    renderApp();
  } else if (action === 'toggle-password-vis') {
    state.showLoginPassword = !state.showLoginPassword;
    renderApp();
  } else if (action === 'set-auth-mode') {
    state.authMode = el.getAttribute('data-mode') || 'login';
    state.authErrorKey = '';
    state.authInfoKey = '';
    renderApp();
  } else if (action === 'sign-out') {
    await logoutOwnerOnServer();
    state.activeModal = null;
    renderApp();
  } else if (action === 'toggle-right-panel') {
    state.isSideDrawerOpen = !state.isSideDrawerOpen;
    renderApp();
  } else if (action === 'open-modal') {
    const modalName = el.getAttribute('data-modal');
    state.activeModal = state.activeModal === modalName ? null : modalName;
    state.statusBannerKey = '';
    renderApp();
  } else if (action === 'close-modal' || action === 'close-modal-backdrop') {
    if (action === 'close-modal-backdrop' && e.target !== el) return;
    state.activeModal = null;
    state.statusBannerKey = '';
    renderApp();
  } else if (action === 'set-settings-tab') {
    state.settingsTab = el.getAttribute('data-tab') || 'sources';
    state.statusBannerKey = '';
    renderApp();
  } else if (action === 'toggle-fullscreen') {
    state.isFullscreen = !state.isFullscreen;
    renderApp();
  } else if (action === 'sync-cloud-workspace') {
    state.isWorkspaceSyncing = true;
    renderApp();
    const ok = await uploadWorkspaceSync();
    await fetchSystemStatus();
    state.statusBannerKey = ok ? 'status_workspace_synced' : '';
    renderApp();
  } else if (action === 'select-tab') {
    const nextTabId = el.getAttribute('data-tab-id');
    state.activeTabId = nextTabId;
    const selTab = state.openTabs.find((t) => t.tabId === nextTabId);
    if (selTab) {
      saveLastOpenedSymbol(selTab.symbolCode);
      selTab.candles = getCachedOrAggregatedCandles(
        selTab.symbolCode,
        selTab.provider,
        selTab.timeframe
      );
      if (!selTab.candles || selTab.candles.length === 0) {
        syncSymbolNow(selTab.symbolCode, selTab.timeframe, renderApp);
      }
    }
    saveOpenTabs();
    renderApp();
    redrawActiveCanvas();
  } else if (action === 'close-tab') {
    e.stopPropagation();
    const id = el.getAttribute('data-tab-id');
    if (state.openTabs.length > 1) {
      state.openTabs = state.openTabs.filter((t) => t.tabId !== id);
      if (state.activeTabId === id) {
        state.activeTabId = state.openTabs[0].tabId;
      }
      saveOpenTabs();
      renderApp();
    }
  } else if (action === 'focus-watchlist-search') {
    if (!state.isSideDrawerOpen) {
      state.isSideDrawerOpen = true;
      renderApp();
    }
    const searchInput = document.getElementById('tv-watchlist-search-input');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  } else if (action === 'open-symbol-overview') {
    state.symbolOverviewCode = el.getAttribute('data-symbol');
    renderApp();
  } else if (action === 'open-active-symbol-overview') {
    state.symbolOverviewCode = activeTab ? activeTab.symbolCode : 'SPOTBRENT';
    renderApp();
  } else if (action === 'close-symbol-overview' || action === 'close-symbol-overview-backdrop') {
    if (action === 'close-symbol-overview-backdrop' && e.target !== el) return;
    state.symbolOverviewCode = null;
    renderApp();
  } else if (action === 'set-overview-range') {
    state.symbolOverviewRange = el.getAttribute('data-range') || '5D';
    renderApp();
  } else if (action === 'set-overview-subtab') {
    state.symbolOverviewSubTab = el.getAttribute('data-subtab') || 'OVERVIEW';
    renderApp();
  } else if (action === 'set-overview-fin-mode') {
    state.symbolOverviewFinMode = el.getAttribute('data-mode') || 'ANNUAL';
    renderApp();
  } else if (action === 'open-prediction-from-overview') {
    const symCode = el.getAttribute('data-symbol');
    state.symbolOverviewCode = null;
    if (symCode) openOrFocusSymbolTab(symCode);
    state.activeModal = 'prediction';
    renderApp();
  } else if (action === 'copy-identifier') {
    const textToCopy = el.getAttribute('data-copy') || '';
    if (textToCopy && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).catch(() => {});
    }
  } else if (action === 'remove-from-watchlist') {
    e.stopPropagation();
    const symCode = el.getAttribute('data-symbol');
    const sym = state.symbols.find((s) => s.symbolCode === symCode);
    if (sym) {
      sym.inWatchlist = false;
      saveSymbolsToStorage();
      renderApp();
    }
  } else if (action === 'open-chart') {
    const code = el.getAttribute('data-symbol');
    state.symbolOverviewCode = null;
    openOrFocusSymbolTab(code);
    renderApp();
  } else if (action === 'set-timeframe' && activeTab) {
    const newTf = el.getAttribute('data-tf') || 'M15';
    activeTab.timeframe = newTf;
    activeTab.chartId = `${activeTab.symbolCode}_${newTf}`;
    activeTab.selectedRangePreset = null;
    activeTab.scrollOffset = 0;
    activeTab.drawings = state.drawingsByChartId[activeTab.chartId] || [];
    saveOpenTabsToStorage();
    activeTab.candles = getCachedOrAggregatedCandles(activeTab.symbolCode, activeTab.provider, newTf);
    renderApp();
    redrawActiveCanvas();
    await syncSymbolNow(activeTab.symbolCode, newTf, () => {
      renderApp();
      redrawActiveCanvas();
    });
  } else if (action === 'set-date-range' && activeTab) {
    const rk = el.getAttribute('data-range') || 'All';
    activeTab.selectedRangePreset = rk;
    activeTab.scrollOffset = 0;

    // TradingView-style automatic timeframe resolution for historical date range presets
    let targetTf = activeTab.timeframe || 'D1';
    if (activeTab.provider === 'eia_brent_spot') {
      targetTf = rk === '5Y' || rk === 'All' ? 'W1' : 'D1';
    } else if (rk === '1D') {
      targetTf = 'M15';
    } else if (rk === '5D' || rk === '1W') {
      targetTf = 'H1';
    } else if (rk === '1M') {
      targetTf = 'H4';
    } else if (rk === '3M' || rk === '6M' || rk === '9M' || rk === 'YTD' || rk === '1Y') {
      targetTf = 'D1';
    } else if (rk === '5Y' || rk === 'All') {
      targetTf = 'W1';
    }

    const tfChanged = activeTab.timeframe !== targetTf;
    activeTab.timeframe = targetTf;
    activeTab.chartId = `${activeTab.symbolCode}_${targetTf}`;
    activeTab.drawings = state.drawingsByChartId[activeTab.chartId] || [];
    saveOpenTabsToStorage();
    activeTab.candles = getCachedOrAggregatedCandles(activeTab.symbolCode, activeTab.provider, targetTf);
    activeTab.visibleCount = computePresetBarCount(activeTab.candles, rk);
    renderApp();
    redrawActiveCanvas();

    if (tfChanged || !activeTab.candles || activeTab.candles.length < 30) {
      await syncSymbolNow(activeTab.symbolCode, targetTf, () => {
        activeTab.candles = getCachedOrAggregatedCandles(
          activeTab.symbolCode,
          activeTab.provider,
          targetTf
        );
        activeTab.visibleCount = computePresetBarCount(activeTab.candles, rk);
        renderApp();
        redrawActiveCanvas();
      });
    }
  } else if (action === 'set-chart-type' && activeTab) {
    activeTab.chartType = el.getAttribute('data-type') || 'candles';
    renderApp();
  } else if (action === 'toggle-volume' && activeTab) {
    activeTab.showVolume = activeTab.showVolume === false;
    renderApp();
  } else if (action === 'cycle-volume-height' && activeTab) {
    const cur = Number(activeTab.volumePaneRatio || 0.22);
    activeTab.volumePaneRatio = cur < 0.19 ? 0.22 : cur < 0.26 ? 0.3 : 0.16;
    renderApp();
  } else if (action === 'set-volume-height' && activeTab) {
    activeTab.volumePaneRatio = Math.max(0.12, Math.min(0.35, Number(el.getAttribute('data-ratio') || 0.22)));
    renderApp();
  } else if (action === 'toggle-sma20' && activeTab) {
    activeTab.showSma20 = !activeTab.showSma20;
    renderApp();
  } else if (action === 'toggle-ema50' && activeTab) {
    activeTab.showEma50 = !activeTab.showEma50;
    renderApp();
  } else if (action === 'toggle-bollinger' && activeTab) {
    activeTab.showBollinger = !activeTab.showBollinger;
    renderApp();
  } else if (action === 'toggle-log-scale' && activeTab) {
    activeTab.isLogScale = !activeTab.isLogScale;
    state.chartPreferences.isLogScale = activeTab.isLogScale;
    savePreferences();
    renderApp();
  } else if (action === 'reset-price-scale' && activeTab) {
    activeTab.priceScaleFactor = 1.0;
    activeTab.verticalPriceOffset = 0.0;
    renderApp();
  } else if (action === 'fit-content' && activeTab) {
    activeTab.scrollOffset = 0;
    activeTab.visibleCount = Math.min(300, Math.max(24, (activeTab.candles || []).length));
    activeTab.priceScaleFactor = 1.0;
    renderApp();
  } else if (action === 'reset-view' && activeTab) {
    activeTab.scrollOffset = 0;
    activeTab.visibleCount = 48;
    activeTab.priceScaleFactor = 1.0;
    activeTab.verticalPriceOffset = 0.0;
    renderApp();
  } else if (action === 'set-tool' && activeTab) {
    const t = el.getAttribute('data-tool') || 'cursor';
    activeTab.activeTool = t;
    activeTab.activeDrawingTool = t;
    activeTab.pendingTrendStart = null;
    activeTab.pendingTrendPoint = null;
    renderApp();
  } else if (action === 'toggle-magnet' && activeTab) {
    activeTab.isMagnetMode = !activeTab.isMagnetMode;
    renderApp();
  } else if (action === 'delete-drawing' && activeTab) {
    if (activeTab.selectedDrawingId) {
      activeTab.drawings = (activeTab.drawings || []).filter((d) => d.id !== activeTab.selectedDrawingId);
      activeTab.selectedDrawingId = null;
      saveDrawings(activeTab.chartId || `${activeTab.symbolCode}_${activeTab.timeframe}`, activeTab.drawings);
      renderApp();
    }
  } else if (action === 'set-draw-color' && activeTab) {
    activeTab.activeDrawingColorHex = el.getAttribute('data-color') || '#2962FF';
    state.activeRailPopup = null;
    renderApp();
  } else if (action === 'set-draw-width' && activeTab) {
    activeTab.activeDrawingWidthPx = Number(el.getAttribute('data-width') || 2.0);
    state.activeRailPopup = null;
    renderApp();
  } else if (action === 'zoom-in' && activeTab) {
    const step = Number(state.chartPreferences.zoomStepCandles || 8);
    activeTab.visibleCount = Math.max(15, (activeTab.visibleCount || 48) - step);
    renderApp();
  } else if (action === 'zoom-out' && activeTab) {
    const step = Number(state.chartPreferences.zoomStepCandles || 8);
    activeTab.visibleCount = Math.min(600, (activeTab.visibleCount || 48) + step);
    renderApp();
  } else if (action === 'set-wl-category') {
    state.watchlistCategory = el.getAttribute('data-category') || 'ALL';
    renderApp();
  } else if (action === 'reset-chart-colors') {
    resetColorsToDefault();
    renderApp();
  } else if (action === 'reset-algo-params') {
    resetAlgoParamsToDefault();
    renderApp();
  } else if (action === 'clear-drawings' && activeTab) {
    activeTab.drawings = [];
    activeTab.selectedDrawingId = null;
    saveDrawings(`${activeTab.symbolCode}_${activeTab.timeframe}`, []);
    renderApp();
  } else if (action === 'project-scenario-levels' && activeTab) {
    const entry = Number(el.getAttribute('data-entry'));
    const t1 = Number(el.getAttribute('data-t1'));
    const t2 = Number(el.getAttribute('data-t2'));
    const stop = Number(el.getAttribute('data-stop'));
    const bias = el.getAttribute('data-bias') || 'bull';
    const targetCol = bias === 'bull' ? '#26A69A' : '#EF5350';
    const stopCol = bias === 'bull' ? '#EF5350' : '#26A69A';

    activeTab.drawings = [
      ...(activeTab.drawings || []).filter((d) => !String(d.id).startsWith('proj_')),
      { id: 'proj_entry', type: 'hline', price1: entry, colorHex: '#F59E0B', lineWidthPx: 2, label: 'Pivot Entry' },
      { id: 'proj_t1', type: 'hline', price1: t1, colorHex: targetCol, lineWidthPx: 2, label: 'Target 1' },
      { id: 'proj_t2', type: 'hline', price1: t2, colorHex: targetCol, lineWidthPx: 2, label: 'Target 2' },
      { id: 'proj_stop', type: 'hline', price1: stop, colorHex: stopCol, lineWidthPx: 2, label: 'Invalidation' },
    ];
    saveDrawings(`${activeTab.symbolCode}_${activeTab.timeframe}`, activeTab.drawings);
    state.activeModal = null;
    renderApp();
  } else if (action === 'take-chart-snapshot') {
    await handleChartSnapshot();
  } else if (action === 'move-watchlist-symbol') {
    e.stopPropagation();
    const symCode = el.getAttribute('data-symbol');
    const dir = el.getAttribute('data-direction');
    moveSymbolOrder(symCode, dir);
  } else if (action === 'sync-active-tab' && activeTab) {
    await syncSymbolNow(activeTab.symbolCode, activeTab.timeframe, renderApp);
  } else if (action === 'sync-all') {
    await syncAllWatchlistSymbols(renderApp);
  } else if (action === 'open-add-symbol-modal') {
    state.isAddSymbolModalOpen = true;
    renderApp();
  } else if (action === 'close-add-symbol-modal') {
    if (e.target !== el && !el.classList.contains('btn-icon')) return;
    state.isAddSymbolModalOpen = false;
    renderApp();
  } else if (action === 'set-color') {
    const target = el.getAttribute('data-target');
    const col = el.getAttribute('data-color');
    if (target && col) {
      state.chartPreferences[target] = col;
      savePreferences();
      renderApp();
    }
  } else if (action === 'delete-symbol') {
    const code = el.getAttribute('data-symbol');
    state.symbols = state.symbols.filter((s) => s.symbolCode !== code);
    saveSymbolsToStorage();
    renderApp();
  } else if (action === 'set-explorer-mode') {
    state.sourceExplorerMode = el.getAttribute('data-mode') || 'by_source';
    renderApp();
  } else if (action === 'select-explorer-provider') {
    state.selectedExplorerProvider = el.getAttribute('data-provider') || 'tvdatafeed';
    renderApp();
  } else if (action === 'activate-source-symbol') {
    const code = (el.getAttribute('data-symbol') || '').trim().toUpperCase();
    const prov = el.getAttribute('data-provider') || 'tvdatafeed';
    if (!code) return;
    let sym = state.symbols.find((s) => s.symbolCode === code);
    if (!sym) {
      sym = {
        chartId: `chart_${code.toLowerCase()}_main`,
        symbolCode: code,
        decimals: code === 'EURUSD' || code === 'GBPUSD' ? 4 : code === 'SPOTBRENT' || code === 'XAGUSD' ? 3 : 2,
        inWatchlist: true,
        activeProvider: prov,
        allowedProviders: ['tvdatafeed', 'twelve_data', 'dukascopy', 'yahoo_finance'],
        timeframe: prov === 'eia_brent_spot' ? 'D1' : 'M15',
        storedCandleCount: 0,
        lastSyncMode: 'DB_CACHE_HIT',
        fetchedNewBars: 0,
      };
      state.symbols.push(sym);
    } else {
      sym.activeProvider = prov;
      sym.inWatchlist = true;
      if (prov === 'eia_brent_spot') sym.timeframe = 'D1';
    }
    saveSymbolsToStorage();
    renderApp();
    await syncSymbolNow(code, sym.timeframe || 'M15', renderApp, false);
  } else if (action === 'delta-sync-symbol') {
    const code = (el.getAttribute('data-symbol') || '').trim().toUpperCase();
    const sym = state.symbols.find((s) => s.symbolCode === code);
    if (sym) {
      await syncSymbolNow(code, sym.timeframe || 'M15', renderApp, false);
    }
  }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  const action = el.getAttribute('data-action');
  if (action === 'watchlist-search') {
    state.watchlistSearchQuery = el.value;
    renderApp();
  } else if (action === 'search-explorer-symbol') {
    state.symbolExplorerSearchQuery = el.value;
    renderApp();
  } else if (action === 'set-fetch-limit') {
    const val = Math.max(40, Math.min(5000, Number(el.value) || 500));
    state.chartPreferences.candleFetchLimit = val;
    savePreferences();
    const lbl = document.getElementById('fetch-limit-value-label');
    if (lbl) lbl.textContent = String(val);
  } else if (action === 'set-zoom-step') {
    const val = Math.max(2, Math.min(30, Number(el.value) || 8));
    state.chartPreferences.zoomStepCandles = val;
    savePreferences();
    const lbl = document.getElementById('zoom-step-value-label');
    if (lbl) lbl.textContent = String(val);
  } else if (action === 'set-hit-tolerance') {
    const val = Math.max(12, Math.min(60, Number(el.value) || 28));
    state.chartPreferences.drawingHitTolerancePx = val;
    savePreferences();
    const lbl = document.getElementById('hit-tolerance-value-label');
    if (lbl) lbl.textContent = `${val} px`;
  }
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  const action = el.getAttribute('data-action');
  if (action === 'toggle-remember-creds') {
    state.rememberCredentials = Boolean(el.checked);
    localStorage.setItem('ci_remember_creds', state.rememberCredentials ? 'true' : 'false');
    if (!state.rememberCredentials) {
      state.savedPassword = '';
      localStorage.removeItem('ci_saved_password');
      localStorage.removeItem('ci_auto_authenticated');
    }
  } else if (action === 'select-provider-dropdown') {
    const code = el.getAttribute('data-symbol');
    const prov = el.value;
    const sym = state.symbols.find((s) => s.symbolCode === code);
    if (sym) {
      sym.activeProvider = prov;
      if (prov === 'eia_brent_spot') sym.timeframe = 'D1';
      saveSymbolsToStorage();
      await syncSymbolNow(code, sym.timeframe, renderApp);
      renderApp();
    }
  } else if (action === 'toggle-watchlist') {
    const code = el.getAttribute('data-symbol');
    const sym = state.symbols.find((s) => s.symbolCode === code);
    if (sym) {
      sym.inWatchlist = Boolean(el.checked);
      saveSymbolsToStorage();
      renderApp();
    }
  } else if (action === 'toggle-tv-pref') {
    const key = el.getAttribute('data-pref-key');
    if (key) {
      state.chartPreferences[key] = Boolean(el.checked);
      savePreferences();
      renderApp();
    }
  } else if (action === 'select-prediction-symbol') {
    openOrFocusSymbolTab(el.value);
    renderApp();
  }
});

function showFloatingToast(message, durationMs = 3000) {
  let toast = document.getElementById('ci-floating-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ci-floating-toast';
    toast.className = 'ci-floating-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, durationMs);
}

async function handleChartSnapshot() {
  const activeTab = getActiveTab();
  const canvas = document.getElementById('main-chart-canvas');
  if (!canvas) {
    showFloatingToast('Canvas unavailable');
    return;
  }

  try {
    const dpr = window.devicePixelRatio || 1;
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = canvas.width;
    snapCanvas.height = canvas.height;
    const ctx = snapCanvas.getContext('2d');

    // Fill background
    ctx.fillStyle = state.isDarkTheme ? '#131722' : '#FFFFFF';
    ctx.fillRect(0, 0, snapCanvas.width, snapCanvas.height);

    // Draw main chart canvas
    ctx.drawImage(canvas, 0, 0);

    // Draw brand watermark
    ctx.save();
    ctx.font = `bold ${Math.round(14 * dpr)}px sans-serif`;
    ctx.fillStyle = '#2962FF';
    ctx.fillText('CHART INTELLIGENCE', 16 * dpr, 28 * dpr);

    if (activeTab) {
      ctx.font = `${Math.round(11 * dpr)}px monospace`;
      ctx.fillStyle = state.isDarkTheme ? '#D1D4DC' : '#333333';
      const lastCandle = (activeTab.candles || []).slice(-1)[0];
      const priceStr = lastCandle ? ` • ${lastCandle.close}` : '';
      const text = `${activeTab.symbolCode} • ${activeTab.timeframe || 'M15'}${priceStr} • ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
      ctx.fillText(text, 16 * dpr, 46 * dpr);
    }
    ctx.restore();

    let copiedToClipboard = false;
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        const blob = await new Promise((res) => snapCanvas.toBlob(res, 'image/png'));
        if (blob) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          copiedToClipboard = true;
          showFloatingToast(i18n.t('snapshot_copied_success'));
        }
      } catch (clipErr) {
        console.warn('[Snapshot] Clipboard image failed, will trigger file download:', clipErr);
      }
    }

    if (!copiedToClipboard) {
      const dataUrl = snapCanvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `chart_${activeTab ? activeTab.symbolCode : 'snapshot'}_${activeTab ? activeTab.timeframe : 'm15'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showFloatingToast(i18n.t('snapshot_downloaded_success'));
    }
  } catch (err) {
    console.error('[Snapshot] Error taking chart snapshot:', err);
    showFloatingToast('Snapshot failed');
  }
}

function moveSymbolOrder(symbolCode, direction) {
  const list = state.symbols;
  const idx = list.findIndex((s) => s.symbolCode === symbolCode);
  if (idx < 0) return;
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= list.length) return;

  const item = list.splice(idx, 1)[0];
  list.splice(targetIdx, 0, item);
  saveSymbolsToStorage();
  if (state.isAuthenticated) {
    uploadWorkspaceSync().catch(() => {});
  }
  renderApp();
}

function reorderSymbolsDragDrop(draggedCode, targetCode) {
  if (!draggedCode || !targetCode || draggedCode === targetCode) return;
  const list = state.symbols;
  const fromIdx = list.findIndex((s) => s.symbolCode === draggedCode);
  const toIdx = list.findIndex((s) => s.symbolCode === targetCode);
  if (fromIdx < 0 || toIdx < 0) return;

  const item = list.splice(fromIdx, 1)[0];
  list.splice(toIdx, 0, item);
  saveSymbolsToStorage();
  if (state.isAuthenticated) {
    uploadWorkspaceSync().catch(() => {});
  }
  renderApp();
}

let currentDraggedSymbol = null;

document.addEventListener('dragstart', (e) => {
  const row = e.target.closest('.tv-wl-row');
  if (row) {
    currentDraggedSymbol = row.getAttribute('data-symbol');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', currentDraggedSymbol);
    row.classList.add('tv-wl-dragging');
  }
});

document.addEventListener('dragover', (e) => {
  const row = e.target.closest('.tv-wl-row');
  if (row && currentDraggedSymbol) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = row.getBoundingClientRect();
    const isBottom = e.clientY > rect.top + rect.height / 2;
    row.classList.toggle('tv-wl-drag-over-bottom', isBottom);
    row.classList.toggle('tv-wl-drag-over-top', !isBottom);
  }
});

document.addEventListener('dragleave', (e) => {
  const row = e.target.closest('.tv-wl-row');
  if (row) {
    row.classList.remove('tv-wl-drag-over-top', 'tv-wl-drag-over-bottom');
  }
});

document.addEventListener('drop', (e) => {
  const row = e.target.closest('.tv-wl-row');
  if (row && currentDraggedSymbol) {
    e.preventDefault();
    const targetSymbol = row.getAttribute('data-symbol');
    row.classList.remove('tv-wl-drag-over-top', 'tv-wl-drag-over-bottom');
    if (targetSymbol && targetSymbol !== currentDraggedSymbol) {
      reorderSymbolsDragDrop(currentDraggedSymbol, targetSymbol);
    }
  }
  currentDraggedSymbol = null;
});

document.addEventListener('dragend', () => {
  document.querySelectorAll('.tv-wl-row').forEach((r) => {
    r.classList.remove('tv-wl-dragging', 'tv-wl-drag-over-top', 'tv-wl-drag-over-bottom');
  });
  currentDraggedSymbol = null;
});

window.addEventListener('resize', () => {
  redrawActiveCanvas();
});

async function bootstrap() {
  try {
    // Render immediately using built-in fallback dictionary so screen is NEVER blank
    renderApp();
    window.__CI_APP_MOUNTED__ = true;
  } catch (err) {
    console.error('[Chart Intelligence] Initial render failed:', err);
    renderFallbackErrorBoundary(err);
  }

  try {
    await i18n.init();
    renderApp();
  } catch {
    // Non-blocking i18n fallback
  }

  try {
    await syncServerAuthStatus();
    renderApp();
  } catch {
    // Non-blocking auth status fallback
  }

  try {
    await fetchSystemStatus();
    if (state.isAuthenticated) {
      await downloadWorkspaceSync();
      ensureInitialTabs();
    }
    renderApp();
  } catch {
    // Non-blocking status/workspace fallback
  }

  window.__CI_APP_MOUNTED__ = true;

  if (state.isAuthenticated) {
    syncAllWatchlistSymbols(renderApp).catch(() => {});
  }

  if (!countdownIntervalId) {
    countdownIntervalId = setInterval(() => {
      if (state.isAuthenticated) {
        const clockEl = document.getElementById('tv-live-utc-clock');
        if (clockEl) {
          clockEl.textContent = new Date().toISOString().slice(11, 19) + ' UTC';
        }
        redrawActiveCanvas();
      }
    }, 1000);
  }
}

bootstrap().catch((err) => {
  console.error('[Chart Intelligence] Bootstrap unhandled exception:', err);
  renderFallbackErrorBoundary(err);
});
