import { I18nManager } from './core/i18n.js?v=1.28.5';
import {
  state,
  savePreferences,
  saveSymbolsToStorage,
  saveDrawings,
  saveLastOpenedSymbol,
  getCachedOrAggregatedCandles,
} from './core/store.js?v=1.28.5';
import {
  syncServerAuthStatus,
  loginOrRegisterOwner,
  updateOwnerEmailOnServer,
  updateOwnerPasswordOnServer,
  requestPasswordResetCode,
  confirmPasswordResetCode,
  logoutOwnerOnServer,
  syncSymbolNow,
  syncAllWatchlistSymbols,
} from './services/apiService.js?v=1.28.5';
import { PriceFormatter } from './algorithms/priceFormatter.js?v=1.28.5';
import { renderCandlestickCanvas } from './components/chartRenderer.js?v=1.28.5';
import { renderLoginScreen } from './views/loginView.js?v=1.28.5';
import { renderTopHeaderBar, renderBottomChartBar } from './views/headerView.js?v=1.28.5';
import { renderLeftToolRail } from './views/toolRailView.js?v=1.28.5';
import { renderRightSplitPanel, renderSymbolOverviewModal } from './views/watchlistView.js?v=1.28.5';
import { renderPredictionModal } from './views/analysisView.js?v=1.28.5';
import { renderSettingsModal } from './views/settingsView.js?v=1.28.5';
import { renderRightIconRail, renderBottomNav } from './views/navigationView.js?v=1.28.5';

const i18n = new I18nManager();
let countdownIntervalId = null;
let canvasResizeObserver = null;

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
  if (state.openTabs.length > 0) return;
  const watchlist = state.symbols.filter((s) => s.inWatchlist);
  const listToOpen = watchlist.length > 0 ? watchlist.slice(0, 2) : state.symbols.slice(0, 2);

  listToOpen.forEach((sym) => {
    const tf = sym.activeProvider === 'eia_brent_spot' ? 'D1' : sym.timeframe || 'M15';
    const tabId = `tab_${sym.symbolCode}_${tf}`;
    const drawKey = `${sym.symbolCode}_${tf}`;
    const cached = getCachedOrAggregatedCandles(sym.symbolCode, sym.activeProvider, tf);
    state.openTabs.push({
      tabId,
      symbolCode: sym.symbolCode,
      provider: sym.activeProvider,
      timeframe: tf,
      decimals: sym.decimals,
      candles: cached.length > 0 ? cached : sym.candles || [],
      chartType: 'candles',
      showVolume: true,
      volumePaneRatio: 0.22,
      showSma20: false,
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
}

function openOrFocusSymbolTab(symbolCode, requestedTf) {
  const sym = state.symbols.find((s) => s.symbolCode === symbolCode);
  if (!sym) return;
  const tf =
    sym.activeProvider === 'eia_brent_spot'
      ? 'D1'
      : requestedTf || sym.timeframe || 'M15';
  saveLastOpenedSymbol(symbolCode);

  let existing = state.openTabs.find((t) => t.symbolCode === symbolCode);
  const cached = getCachedOrAggregatedCandles(symbolCode, sym.activeProvider, tf);
  if (existing) {
    existing.timeframe = tf;
    existing.provider = sym.activeProvider;
    existing.candles = cached.length > 0 ? cached : sym.candles || [];
    existing.drawings = state.drawingsByChartId[`${symbolCode}_${tf}`] || [];
    state.activeTabId = existing.tabId;
  } else {
    const tabId = `tab_${symbolCode}_${Date.now()}`;
    const newTab = {
      tabId,
      symbolCode: sym.symbolCode,
      provider: sym.activeProvider,
      timeframe: tf,
      decimals: sym.decimals,
      candles: cached.length > 0 ? cached : sym.candles || [],
      chartType: 'candles',
      showVolume: true,
      volumePaneRatio: 0.22,
      showSma20: false,
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
      drawings: state.drawingsByChartId[`${symbolCode}_${tf}`] || [],
    };
    state.openTabs.push(newTab);
    state.activeTabId = tabId;
  }

  syncSymbolNow(symbolCode, tf, renderApp);
}

function renderOhlcvOverlay(activeTab) {
  if (!activeTab || !activeTab.candles || activeTab.candles.length === 0) return '';
  const visibleCount = Math.max(15, Math.min(180, Math.round(activeTab.visibleCount || 48)));
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
  const lastClose = Number(activeTab.candles[activeTab.candles.length - 1].close || c.close);
  const spreadStep = Math.pow(10, -dec) * 2;
  const sellPrice = PriceFormatter.formatPrice(lastClose - spreadStep, dec);
  const buyPrice = PriceFormatter.formatPrice(lastClose + spreadStep, dec);

  return `
    <div class="tv-ohlc-overlay ltr-num" dir="ltr">
      <div class="tv-ohlc-main-line">
        <span class="tv-ohlc-symbol-title">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--bull); display: inline-block;"></span>
          <span>${title}</span>
          <span style="color: var(--text-muted); font-weight: 600;">· ${PriceFormatter.displayTimeframeLabel(activeTab.timeframe)} · ${activeTab.provider.toUpperCase()}</span>
        </span>
        <span>O<strong style="color: ${col}; margin-left: 2px;">${PriceFormatter.formatPrice(c.open, dec)}</strong></span>
        <span>H<strong style="color: var(--bull); margin-left: 2px;">${PriceFormatter.formatPrice(c.high, dec)}</strong></span>
        <span>L<strong style="color: var(--bear); margin-left: 2px;">${PriceFormatter.formatPrice(c.low, dec)}</strong></span>
        <span>C<strong style="color: ${col}; margin-left: 2px;">${PriceFormatter.formatPrice(c.close, dec)}</strong></span>
        <span style="color: ${col}; font-weight: 700;">${diff >= 0 ? '+' : ''}${PriceFormatter.formatPrice(diff, dec)} (${pct})</span>
        <span style="color: var(--text-muted);">Vol <strong style="color: var(--text);">${PriceFormatter.formatVolume(c.volume)}</strong></span>
      </div>

      <div class="tv-bid-ask-strip">
        <div class="tv-order-box sell">
          <span>${sellPrice}</span>
          <span class="tv-order-sub">SELL</span>
        </div>
        <span style="font-size: 10px; color: var(--text-muted); font-weight: 600;">${(spreadStep * 2 * Math.pow(10, dec)).toFixed(0)}</span>
        <div class="tv-order-box buy">
          <span>${buyPrice}</span>
          <span class="tv-order-sub">BUY</span>
        </div>
      </div>
    </div>
  `;
}

function renderAddSymbolModal() {
  if (!state.isAddSymbolModalOpen) return '';
  return `
    <div class="modal-backdrop" data-action="close-add-symbol-modal">
      <div class="modal-card" style="max-width: 420px;">
        <div class="tv-modal-header">
          <div class="tv-modal-title">${i18n.t('settings_add_custom_symbol')}</div>
          <button class="btn btn-sm btn-icon" data-action="close-add-symbol-modal">✕</button>
        </div>
        <div class="tv-modal-body">
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
              <label class="tv-input-label">Data Provider</label>
              <select class="input-field ltr-num" name="provider">
                <option value="tvdatafeed">TradingView (tvdatafeed)</option>
                <option value="twelve_data">Twelve Data</option>
                <option value="dukascopy">Dukascopy</option>
                <option value="yahoo_finance">Yahoo Finance</option>
              </select>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 6px; min-height: 36px;">
              ${i18n.t('settings_custom_symbol_save')}
            </button>
          </form>
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
      const latestCached = getCachedOrAggregatedCandles(
        activeTab.symbolCode,
        activeTab.provider,
        activeTab.timeframe
      );
      if (latestCached.length > 0) {
        activeTab.candles = latestCached;
      }
    }

    root.innerHTML = `
      <div class="tv-app-shell ${state.isFullscreen ? 'is-fullscreen' : ''}">
        ${renderTopHeaderBar(activeTab, i18n)}

        <div class="tv-main-area">
          ${renderLeftToolRail(activeTab, i18n)}

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

        ${renderBottomNav(i18n)}
        ${renderSettingsModal(i18n)}
        ${renderPredictionModal(activeTab, i18n)}
        ${renderSymbolOverviewModal(i18n)}
        ${renderAddSymbolModal()}
      </div>
    `;

    bindSettingsForms();
    bindCanvasEvents(activeTab);
    redrawActiveCanvas();
    window.__CI_APP_MOUNTED__ = true;
  } catch (err) {
    console.error('[Chart Intelligence] Render failed:', err);
    renderFallbackErrorBoundary(err);
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

    if (activeTab.activeTool && activeTab.activeTool !== 'cursor') {
      const idx = Math.max(0, Math.min(meta.visible.length - 1, Math.floor(x / meta.slotW)));
      const candle = meta.visible[idx];
      const price = meta.yToPrice(y);
      if (!candle) return;
      const openSec = Number(
        candle.openTimeSec || Math.floor(Number(candle.open_time_utc_ms || 0) / 1000)
      );

      if (activeTab.activeTool === 'hline') {
        activeTab.drawings.push({
          id: 'd_' + Date.now(),
          type: 'hline',
          price1: price,
          colorHex: activeTab.activeDrawingColorHex,
          lineWidthPx: activeTab.activeDrawingWidthPx,
        });
        activeTab.activeTool = 'cursor';
        saveDrawings(`${activeTab.symbolCode}_${activeTab.timeframe}`, activeTab.drawings);
        renderApp();
        return;
      }
      if (activeTab.activeTool === 'vline') {
        activeTab.drawings.push({
          id: 'd_' + Date.now(),
          type: 'vline',
          time1EpochSec: openSec,
          colorHex: activeTab.activeDrawingColorHex,
          lineWidthPx: activeTab.activeDrawingWidthPx,
        });
        activeTab.activeTool = 'cursor';
        saveDrawings(`${activeTab.symbolCode}_${activeTab.timeframe}`, activeTab.drawings);
        renderApp();
        return;
      }
      if (activeTab.activeTool === 'trend') {
        if (!activeTab.pendingTrendStart) {
          activeTab.pendingTrendStart = { time1EpochSec: openSec, price1: price };
        } else {
          activeTab.drawings.push({
            id: 'd_' + Date.now(),
            type: 'trend',
            time1EpochSec: activeTab.pendingTrendStart.time1EpochSec,
            price1: activeTab.pendingTrendStart.price1,
            time2EpochSec: openSec,
            price2: price,
            colorHex: activeTab.activeDrawingColorHex,
            lineWidthPx: activeTab.activeDrawingWidthPx,
          });
          activeTab.pendingTrendStart = null;
          activeTab.activeTool = 'cursor';
          saveDrawings(`${activeTab.symbolCode}_${activeTab.timeframe}`, activeTab.drawings);
          renderApp();
        }
        return;
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
      activeTab.visibleCount = Math.max(15, Math.min(180, (activeTab.visibleCount || 48) + step));
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
        state.symbols.push({
          symbolCode: code,
          customTitle: title || code,
          decimals: 2,
          inWatchlist: true,
          activeProvider: provider,
          allowedProviders: ['tvdatafeed', 'twelve_data', 'dukascopy', 'yahoo_finance'],
          timeframe: 'M15',
          lastClose: 0,
          lastCandleUtc: '',
          candles: [],
          isCustom: true,
        });
        saveSymbolsToStorage();
        state.isAddSymbolModalOpen = false;
        await syncSymbolNow(code, 'M15', renderApp);
      }
      renderApp();
    });
  }
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.getAttribute('data-action');
  const activeTab = getActiveTab();

  if (action === 'set-lang') {
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
  } else if (action === 'select-tab') {
    state.activeTabId = el.getAttribute('data-tab-id');
    renderApp();
  } else if (action === 'close-tab') {
    e.stopPropagation();
    const id = el.getAttribute('data-tab-id');
    if (state.openTabs.length > 1) {
      state.openTabs = state.openTabs.filter((t) => t.tabId !== id);
      if (state.activeTabId === id) {
        state.activeTabId = state.openTabs[0].tabId;
      }
      renderApp();
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
  } else if (action === 'open-chart') {
    const code = el.getAttribute('data-symbol');
    state.symbolOverviewCode = null;
    openOrFocusSymbolTab(code);
    renderApp();
  } else if (action === 'set-timeframe' && activeTab) {
    const newTf = el.getAttribute('data-tf') || 'M15';
    activeTab.timeframe = newTf;
    activeTab.scrollOffset = 0;
    activeTab.drawings = state.drawingsByChartId[`${activeTab.symbolCode}_${newTf}`] || [];
    const cached = getCachedOrAggregatedCandles(activeTab.symbolCode, activeTab.provider, newTf);
    if (cached.length > 0) {
      activeTab.candles = cached;
    }
    renderApp();
    await syncSymbolNow(activeTab.symbolCode, newTf, renderApp);
  } else if (action === 'set-date-range' && activeTab) {
    const rk = el.getAttribute('data-range') || 'All';
    activeTab.selectedRangePreset = rk;
    activeTab.scrollOffset = 0;
    const mapCount = { '1D': 24, '5D': 48, '1M': 90, '3M': 125, '6M': 145, YTD: 155, '1Y': 170, '5Y': 180, All: 180 };
    activeTab.visibleCount = Math.min((activeTab.candles || []).length || 48, mapCount[rk] || 60);
    renderApp();
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
  } else if (action === 'toggle-sma20' && activeTab) {
    activeTab.showSma20 = !activeTab.showSma20;
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
    activeTab.visibleCount = Math.min(140, Math.max(24, (activeTab.candles || []).length));
    activeTab.priceScaleFactor = 1.0;
    renderApp();
  } else if (action === 'reset-view' && activeTab) {
    activeTab.scrollOffset = 0;
    activeTab.visibleCount = 48;
    activeTab.priceScaleFactor = 1.0;
    activeTab.verticalPriceOffset = 0.0;
    renderApp();
  } else if (action === 'set-tool' && activeTab) {
    activeTab.activeTool = el.getAttribute('data-tool') || 'cursor';
    activeTab.pendingTrendStart = null;
    renderApp();
  } else if (action === 'set-draw-color' && activeTab) {
    activeTab.activeDrawingColorHex = el.getAttribute('data-color') || '#2962FF';
    renderApp();
  } else if (action === 'set-draw-width' && activeTab) {
    activeTab.activeDrawingWidthPx = Number(el.getAttribute('data-width') || 2.0);
    renderApp();
  } else if (action === 'zoom-in' && activeTab) {
    activeTab.visibleCount = Math.max(15, (activeTab.visibleCount || 48) - 8);
    renderApp();
  } else if (action === 'zoom-out' && activeTab) {
    activeTab.visibleCount = Math.min(180, (activeTab.visibleCount || 48) + 8);
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
  }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  const action = el.getAttribute('data-action');
  if (action === 'watchlist-search') {
    state.watchlistSearchQuery = el.value;
    renderApp();
  } else if (action === 'set-fetch-limit') {
    const val = Math.max(40, Math.min(5000, Number(el.value) || 500));
    state.chartPreferences.candleFetchLimit = val;
    savePreferences();
    const lbl = document.getElementById('fetch-limit-value-label');
    if (lbl) lbl.textContent = String(val);
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
