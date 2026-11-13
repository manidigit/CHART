import { I18nManager } from './core/i18n.js?v=1.40.1';
import {
  state,
  PROVIDER_METHODS_CATALOG,
  savePreferences,
  saveSymbolsToStorage,
  saveDrawings,
  saveLastOpenedSymbol,
  saveOpenTabs,
  saveOpenTabsToStorage,
  saveActiveTabId,
  saveLocalByokKeys,
  savePanelLayout,
  escapeHtml,
  sanitizeSymbolCode,
  getCachedOrAggregatedCandles,
  resetColorsToDefault,
  resetAlgoParamsToDefault,
  resetAllPreferencesToDefault,
  registerAutoSyncCallback,
  INDICATOR_FLAG_KEYS,
  syncIndicatorsAcrossTabsAndPrefs,
  getIndicatorColorPalette,
  normalizeHexForWeb,
} from './core/store.js?v=1.40.1';
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
  fetchLiveQuote,
  fetchGapReport,
  exportEncryptedBackup,
  restoreEncryptedBackup,
  fetchSymbolIntel,
} from './services/apiService.js?v=1.40.1';
import { PriceFormatter } from './algorithms/priceFormatter.js?v=1.40.1';
import { DrawingGeometry, PHASE2_DRAWING_TOOLS } from './algorithms/drawingGeometry.js?v=1.40.1';
import { renderCandlestickCanvas } from './components/chartRenderer.js?v=1.40.1';
import { renderLoginScreen } from './views/loginView.js?v=1.40.1';
import {
  renderTopHeaderBar,
  renderBottomChartBar,
  renderIndicatorsModal,
} from './views/headerView.js?v=1.40.1';
import { renderLeftToolRail, renderMobileBottomSheet } from './views/toolRailView.js?v=1.40.1';
import {
  renderRightSplitPanel,
  renderSymbolOverviewModal,
  renderSymbolBadge,
} from './views/watchlistView.js?v=1.40.1';
import { renderPredictionModal } from './views/analysisView.js?v=1.40.1';
import { renderSettingsModal } from './views/settingsView.js?v=1.40.1';
import { renderRightIconRail } from './views/navigationView.js?v=1.40.1';

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

function ensureInitialTabs(forceHydrate = false) {
  if (state.openTabs && state.openTabs.length > 0) {
    if (state._tabsHydrated && !forceHydrate) {
      if (!state.activeTabId || !state.openTabs.some((t) => t.tabId === state.activeTabId)) {
        const preferred = state.openTabs.find((t) => t.symbolCode === state.lastOpenedSymbolCode);
        state.activeTabId = preferred ? preferred.tabId : state.openTabs[0].tabId;
        saveActiveTabId(state.activeTabId);
      }
      return;
    }
    // Determine active indicator state from chartPreferences or any tab that has indicators enabled
    const effectiveIndicators = {};
    for (const k of INDICATOR_FLAG_KEYS) {
      effectiveIndicators[k] =
        Boolean(state.chartPreferences[k]) ||
        state.openTabs.some((t) => Boolean(t && t[k]));
      state.chartPreferences[k] = effectiveIndicators[k];
    }

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
      if (!Array.isArray(tab.candles) || tab.candles.length === 0 || forceHydrate) {
        const cached = getCachedOrAggregatedCandles(tab.symbolCode, prov, tf);
        tab.candles = cached.length > 0 ? cached : (sym && sym.candles) || [];
      }
      tab.drawings = state.drawingsByChartId[tab.chartId] || tab.drawings || [];
      for (const k of INDICATOR_FLAG_KEYS) {
        tab[k] = effectiveIndicators[k];
      }
      tab.volumePaneRatio = Math.max(
        0.12,
        Math.min(
          0.35,
          Number(tab.volumePaneRatio || state.chartPreferences.volumePaneRatio || 0.22)
        )
      );
      const fallbackColor =
        tab.activeDrawingColorHex ||
        tab.activeDrawingColor ||
        state.chartPreferences.defaultDrawingColorHex ||
        '#2962FF';
      tab.activeDrawingColorHex = fallbackColor;
      tab.activeDrawingColor = fallbackColor;
      tab.activeDrawingWidthPx = Number(
        tab.activeDrawingWidthPx || state.chartPreferences.defaultDrawingWidthPx || 2.0
      );
    });
    if (!state.activeTabId || !state.openTabs.some((t) => t.tabId === state.activeTabId)) {
      const preferred = state.openTabs.find((t) => t.symbolCode === state.lastOpenedSymbolCode);
      state.activeTabId = preferred ? preferred.tabId : state.openTabs[0].tabId;
      saveActiveTabId(state.activeTabId);
    }
    state._tabsHydrated = true;
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
    const tabObj = {
      tabId,
      chartId: drawKey,
      symbolCode: sym.symbolCode,
      provider: sym.activeProvider,
      timeframe: tf,
      decimals: sym.decimals,
      candles: cached.length > 0 ? cached : sym.candles || [],
      chartType: 'candles',
      showVolume: true,
      volumePaneRatio: Math.max(
        0.12,
        Math.min(0.35, Number(state.chartPreferences.volumePaneRatio || 0.22))
      ),
      isLogScale: Boolean(state.chartPreferences.isLogScale),
      selectedRangePreset: null,
      visibleCount: 48,
      scrollOffset: 0,
      priceScaleFactor: 1.0,
      verticalPriceOffset: 0.0,
      hoverIndex: null,
      hoverY: null,
      activeTool: 'cursor',
      activeDrawingColorHex: state.chartPreferences.defaultDrawingColorHex || '#2962FF',
      activeDrawingWidthPx: Number(state.chartPreferences.defaultDrawingWidthPx || 2.0),
      selectedDrawingId: null,
      pendingTrendStart: null,
      drawings: state.drawingsByChartId[drawKey] || [],
    };
    for (const k of INDICATOR_FLAG_KEYS) {
      tabObj[k] = Boolean(state.chartPreferences[k]);
    }
    state.openTabs.push(tabObj);
  });

  if (state.openTabs.length > 0) {
    const preferred = state.openTabs.find((t) => t.symbolCode === state.lastOpenedSymbolCode);
    state.activeTabId = preferred ? preferred.tabId : state.openTabs[0].tabId;
    saveActiveTabId(state.activeTabId);
  }
  saveOpenTabs(true);
}

function openOrFocusSymbolTab(symbolCode, requestedTf) {
  const sym = state.symbols.find((s) => s.symbolCode === symbolCode);
  if (!sym) return;
  saveLastOpenedSymbol(symbolCode);

  const curActive = getActiveTab();
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
    for (const k of INDICATOR_FLAG_KEYS) {
      existing[k] = Boolean(curActive ? curActive[k] : state.chartPreferences[k]);
    }
    state.activeTabId = existing.tabId;
    saveActiveTabId(state.activeTabId);
    syncIndicatorsAcrossTabsAndPrefs(existing, true);
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
      chartType: curActive ? curActive.chartType || 'candles' : 'candles',
      showVolume: curActive ? curActive.showVolume !== false : true,
      volumePaneRatio: Math.max(
        0.12,
        Math.min(
          0.35,
          Number(
            (curActive && curActive.volumePaneRatio) ||
              state.chartPreferences.volumePaneRatio ||
              0.22
          )
        )
      ),
      isMagnetMode: curActive ? Boolean(curActive.isMagnetMode) : false,
      isLogScale: Boolean(state.chartPreferences.isLogScale),
      selectedRangePreset: null,
      visibleCount: 48,
      scrollOffset: 0,
      priceScaleFactor: 1.0,
      verticalPriceOffset: 0.0,
      hoverIndex: null,
      hoverY: null,
      activeTool: 'cursor',
      activeDrawingColorHex: curActive
        ? curActive.activeDrawingColorHex || state.chartPreferences.defaultDrawingColorHex || '#2962FF'
        : state.chartPreferences.defaultDrawingColorHex || '#2962FF',
      activeDrawingColor: curActive
        ? curActive.activeDrawingColor || state.chartPreferences.defaultDrawingColorHex || '#2962FF'
        : state.chartPreferences.defaultDrawingColorHex || '#2962FF',
      activeDrawingWidthPx: Number(
        (curActive && curActive.activeDrawingWidthPx) || state.chartPreferences.defaultDrawingWidthPx || 2.0
      ),
      selectedDrawingId: null,
      pendingTrendStart: null,
      drawings: state.drawingsByChartId[drawKey] || [],
    };
    for (const k of INDICATOR_FLAG_KEYS) {
      newTab[k] = Boolean(curActive ? curActive[k] : state.chartPreferences[k]);
    }
    state.openTabs.push(newTab);
    state.activeTabId = tabId;
    saveActiveTabId(state.activeTabId);
    syncIndicatorsAcrossTabsAndPrefs(newTab, true);
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
  if (rk === 'All') return Math.min(5000, Math.max(24, candles.length));

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
  return Math.max(15, Math.min(5000, count));
}

function renderOhlcvOverlay(activeTab) {
  if (!activeTab || !activeTab.candles || activeTab.candles.length === 0) return '';
  const visibleCount = Math.max(15, Math.min(5000, Math.round(activeTab.visibleCount || 48)));
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

  const pal = getIndicatorColorPalette(state.chartPreferences);
  const indPills = [];
  const pushPill = (flag, color, label, action) => {
    if (flag) {
      indPills.push(
        `<span class="tv-ind-pill" style="color: ${color}; border-color: ${color}55;">${label} <span style="cursor:pointer; opacity:0.8;" data-action="${action}">✕</span></span>`
      );
    }
  };
  pushPill(activeTab.showSma20, pal.sma20, 'SMA 20', 'toggle-sma20');
  pushPill(activeTab.showSma50, pal.sma50, 'SMA 50', 'toggle-sma50');
  pushPill(activeTab.showSma200, pal.sma200, 'SMA 200', 'toggle-sma200');
  pushPill(activeTab.showEma20, pal.ema20, 'EMA 20', 'toggle-ema20');
  pushPill(activeTab.showEma50, pal.ema50, 'EMA 50', 'toggle-ema50');
  pushPill(activeTab.showEma200, pal.ema200, 'EMA 200', 'toggle-ema200');
  pushPill(activeTab.showMtfEma, pal.mtfEma, 'MTF EMA 20', 'toggle-mtf-ema');
  const bbP = Number(state.chartPreferences.bollingerPeriod || 20);
  const bbS = Number(state.chartPreferences.bollingerStdDev || 2.0);
  pushPill(activeTab.showBollinger, pal.bollinger, `BB (${bbP},${bbS})`, 'toggle-bollinger');
  pushPill(activeTab.showKeltner, pal.keltner, 'Keltner', 'toggle-keltner');
  pushPill(activeTab.showDonchian, pal.donchian, 'Donchian', 'toggle-donchian');
  pushPill(activeTab.showVwap, pal.vwap, 'VWAP', 'toggle-vwap');
  pushPill(activeTab.showPivotPoints, pal.pivotP, 'Pivots', 'toggle-pivot-points');
  pushPill(activeTab.showVolumeProfile, pal.vrvpPoc, 'VP (POC)', 'toggle-volume-profile');
  pushPill(activeTab.showSupertrend, pal.supertrend, 'Supertrend', 'toggle-supertrend');
  pushPill(activeTab.showPsar, pal.psar, 'PSAR', 'toggle-psar');
  pushPill(activeTab.showIchimoku, pal.ichimoku, 'Ichimoku', 'toggle-ichimoku');
  pushPill(activeTab.showOverlayMacd, pal.overlayMacd, 'MACD Overlay', 'toggle-overlay-macd');
  pushPill(activeTab.showFutureProjection, pal.futureProjection, 'Future Proj (+30)', 'toggle-future-projection');
  pushPill(activeTab.showSmcStructure, pal.smcStructure, 'SMC (BOS)', 'toggle-smc-structure');
  pushPill(activeTab.showFvg, pal.fvg, 'FVG', 'toggle-fvg');
  pushPill(activeTab.showKillzones, pal.killzones, 'Killzones', 'toggle-killzones');
  pushPill(activeTab.showRsi14, pal.rsi14, 'RSI 14', 'toggle-rsi14');
  pushPill(activeTab.showMacd, pal.macd, 'MACD', 'toggle-macd');
  pushPill(activeTab.showAtr14, pal.atr14, 'ATR 14', 'toggle-atr14');
  pushPill(activeTab.showAdx14, pal.adx14, 'ADX 14', 'toggle-adx14');
  pushPill(activeTab.showStoch14, pal.stoch14, 'Stoch 14', 'toggle-stoch14');
  pushPill(activeTab.showCci20, pal.cci20, 'CCI 20', 'toggle-cci20');
  pushPill(activeTab.showWillR14, pal.willr14, 'Will %R', 'toggle-willr14');
  pushPill(activeTab.showObv, pal.obv, 'OBV', 'toggle-obv');
  pushPill(activeTab.showCmf20, pal.cmf20, 'CMF 20', 'toggle-cmf20');
  pushPill(activeTab.showRoc12, pal.roc12, 'ROC 12', 'toggle-roc12');

  const gapInfo = activeTab.gapSummary || (sym && sym.gapSummary) || null;
  const gapCount = gapInfo ? Number(gapInfo.gaps_found ?? gapInfo.gap_count ?? 0) : 0;
  if (gapCount > 0) {
    indPills.push(
      `<span class="tv-ind-pill" style="color: #F59E0B; border-color: rgba(245,158,11,0.45);" title="Detected missing trading bars in feed history">⚠ Gaps: ${gapCount}</span>`
    );
  }

  return `
    <div class="tv-ohlc-overlay ltr-num" dir="ltr">
      <div class="tv-ohlc-main-line">
        <span class="tv-ohlc-symbol-title">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--bull); display: inline-block;"></span>
          <span>${escapeHtml(title)}</span>
          <span style="color: var(--text-muted); font-weight: 600;">· ${escapeHtml(PriceFormatter.displayTimeframeLabel(activeTab.timeframe))}</span>
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
      const safeCode = escapeHtml(s.symbolCode);
      const safeCleanTitle = escapeHtml(cleanTitle);
      return `
        <div class="tv-settings-symbol-row" style="padding: 8px 10px; margin-bottom: 6px;">
          <div class="tv-settings-symbol-left">
            ${renderSymbolBadge(s.symbolCode, 28)}
            <div>
              <div style="font-size: 12.5px; font-weight: 700; color: var(--text-strong);">${safeCode}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${safeCleanTitle}</div>
            </div>
          </div>
          <label class="tv-toggle-label">
            <input
              type="checkbox"
              class="tv-toggle-input"
              data-action="toggle-watchlist"
              data-symbol="${safeCode}"
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
          ${escapeHtml(msg)}
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
      '.watchlist-container',
      '.tv-symbol-details-pane',
      '.tv-settings-body',
      '.tv-modal-body',
      '.modal-body',
      '.symbol-overview-modal',
      '.tv-symbol-overview-modal-body',
      '#tv-watchlist-top-pane',
      '.tv-symbols-table-container',
      '.ci-mobile-sheet',
      '.modal-card'
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
        ${renderMobileBottomSheet(activeTab, state.mobileSheet, i18n)}
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

let pendingRafRedraw = 0;

function minBarsForTimeframe(tf) {
  const norm = String(tf || 'M15').toUpperCase();
  if (norm === 'M15') return 4800;
  if (norm === 'M30' || norm === 'H1') return 4000;
  if (norm === 'H4') return 2000;
  if (norm === 'D1') return 2500;
  return 600;
}

function maybeTriggerDeepBackfill(tab) {
  if (!tab || !tab.symbolCode) return;
  const tf = String(tab.timeframe || 'M15').toUpperCase();
  const configuredMax = Math.max(500, Math.min(5000, Number(state.chartPreferences.candleFetchLimit || 5000)));
  const goalBars = Math.min(configuredMax, minBarsForTimeframe(tf));
  const count = Array.isArray(tab.candles) ? tab.candles.length : 0;
  if (count >= goalBars) return;
  const attemptKey = `${tab.symbolCode}_${tab.provider || 'tvdatafeed'}_${tf}_${count}`;
  if (tab._backfillAttemptedKey === attemptKey || tab._isBackfilling) return;
  tab._backfillAttemptedKey = attemptKey;
  tab._isBackfilling = true;
  syncSymbolNow(
    tab.symbolCode,
    tf,
    () => {
      tab.candles = getCachedOrAggregatedCandles(tab.symbolCode, tab.provider, tf);
      tab._isBackfilling = false;
      scheduleCanvasRedraw();
    },
    true
  )
    .catch(() => {
      tab._isBackfilling = false;
    });
}

function redrawActiveCanvas() {
  if (pendingRafRedraw) {
    cancelAnimationFrame(pendingRafRedraw);
    pendingRafRedraw = 0;
  }
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

function scheduleCanvasRedraw() {
  if (pendingRafRedraw) return;
  pendingRafRedraw = requestAnimationFrame(() => {
    pendingRafRedraw = 0;
    redrawActiveCanvas();
  });
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

  // Shared drawing placement helper for both desktop mouse and mobile 1-finger touch
  const placeDrawingAtPoint = (x, y, meta) => {
    const tool = activeTab.activeTool || activeTab.activeDrawingTool || 'cursor';
    if (!tool || tool === 'cursor' || !meta || !meta.visible || meta.visible.length === 0) return false;
    const idx = Math.max(0, Math.min(meta.visible.length - 1, Math.floor(x / meta.slotW)));
    const candle = meta.visible[idx];
    if (!candle) return false;
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
      return true;
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
      return true;
    }
    if (tool === 'trend' || tool === 'trend_line' || tool === 'fib' || tool === 'fib_retracement') {
      const canonicalType = tool === 'fib' || tool === 'fib_retracement' ? 'fib_retracement' : 'trend_line';
      if (!activeTab.pendingTrendStart) {
        activeTab.pendingTrendStart = { timeUtcMillis: openMs, time1EpochSec: openSec, price1: price };
        activeTab.pendingAnchors = [{ timeUtcMillis: openMs, price }];
        scheduleCanvasRedraw();
        showFloatingToast(
          i18n.getCurrentLanguage() === 'fa'
            ? 'نقطه دوم را روی نمودار لمس یا کلیک کنید (1 / 2)'
            : 'Click or tap anchor 2 on chart (1 / 2)'
        );
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
        activeTab.pendingAnchors = [];
        activeTab.activeTool = 'cursor';
        activeTab.activeDrawingTool = 'cursor';
        saveDrawings(drawKey, activeTab.drawings);
        renderApp();
      }
      return true;
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
      return true;
    }
    if (PHASE2_DRAWING_TOOLS.has(tool)) {
      const needed = DrawingGeometry.requiredAnchorsForTool(tool);
      const nextAnchors = [...(activeTab.pendingAnchors || []), { timeUtcMillis: openMs, price }];
      if (nextAnchors.length < needed) {
        activeTab.pendingAnchors = nextAnchors;
        scheduleCanvasRedraw();
        showFloatingToast(
          i18n.getCurrentLanguage() === 'fa'
            ? `نقطه ${nextAnchors.length} از ${needed} ثبت شد`
            : `Anchor ${nextAnchors.length} / ${needed} placed`
        );
      } else {
        const newDrawing = {
          id: 'd_' + Date.now(),
          type: tool,
          anchors: nextAnchors,
          variant: tool === 'pitchfork' ? String(activeTab.pitchforkVariant || 'original') : 'original',
          colorHex: activeTab.activeDrawingColorHex,
          strokeWidthPx: activeTab.activeDrawingWidthPx,
          lineWidthPx: activeTab.activeDrawingWidthPx,
        };
        activeTab.drawings.push(newDrawing);
        activeTab.selectedDrawingId = newDrawing.id;
        activeTab.pendingAnchors = [];
        activeTab.pendingTrendStart = null;
        activeTab.activeTool = 'cursor';
        activeTab.activeDrawingTool = 'cursor';
        saveDrawings(drawKey, activeTab.drawings);
        renderApp();
      }
      return true;
    }
    return false;
  };

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
      placeDrawingAtPoint(x, y, meta);
      return;
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
      activeTab.isAutoScaleY = false;
      activeTab.priceScaleFactor = Math.max(0.25, Math.min(4.0, scaleStartFactor * (1 + dy * 0.005)));
      scheduleCanvasRedraw();
      return;
    }

    if (isDragging) {
      const dx = x - dragStartX;
      const deltaBars = Math.round(dx / Math.max(0.5, meta.slotW));
      const maxOffset = Math.max(0, (activeTab.candles || []).length - 5);
      activeTab.scrollOffset = Math.max(0, Math.min(maxOffset, dragStartOffset + deltaBars));
      if (activeTab.scrollOffset >= Math.max(0, maxOffset - 15)) {
        maybeTriggerDeepBackfill(activeTab);
      }
      scheduleCanvasRedraw();
      return;
    }

    if (x <= meta.chartW) {
      const idx = Math.max(0, Math.min(meta.visible.length - 1, Math.floor(x / meta.slotW)));
      if (activeTab.hoverIndex !== idx || Math.abs((activeTab.hoverY || 0) - y) >= 1) {
        activeTab.hoverIndex = idx;
        activeTab.hoverY = y;
        scheduleCanvasRedraw();
      }
    }
  });

  if (window._ciCanvasMouseUp) {
    window.removeEventListener('mouseup', window._ciCanvasMouseUp);
  }
  window._ciCanvasMouseUp = () => {
    if (isDragging) {
      saveOpenTabsToStorage();
    }
    isDragging = false;
    isScalingAxis = false;
  };
  window.addEventListener('mouseup', window._ciCanvasMouseUp);

  canvas.addEventListener('mouseleave', () => {
    activeTab.hoverIndex = null;
    activeTab.hoverY = null;
    scheduleCanvasRedraw();
  });

  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const meta = canvas._chartMeta;
    if (meta && x > meta.chartW) {
      activeTab.isAutoScaleY = true;
      activeTab.priceScaleFactor = 1.0;
      activeTab.verticalPriceOffset = 0.0;
      saveOpenTabsToStorage();
      renderApp();
    }
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const step = e.deltaY > 0 ? Math.max(4, Number(state.chartPreferences.zoomStepCandles || 6)) : -Math.max(4, Number(state.chartPreferences.zoomStepCandles || 6));
      const maxZoomCap = Math.min(5000, Math.max(200, ((activeTab.candles || []).length || 400) + 12));
      activeTab.visibleCount = Math.max(15, Math.min(maxZoomCap, (activeTab.visibleCount || 48) + step));
      if (step > 0) {
        maybeTriggerDeepBackfill(activeTab);
      }
      saveOpenTabsToStorage();
      scheduleCanvasRedraw();
    },
    { passive: false }
  );

  // Mobile/Tablet Touch Support: 1-finger tap drawing, selected-drawing drag-to-translate, pan, 2-finger pinch-zoom, and long-press crosshair inspection
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartOffset = 0;
  let touchMoved = false;
  let isTouchInspecting = false;
  let touchLongPressTimer = null;
  let pinchStartDist = 0;
  let pinchStartVisibleCount = 48;
  let touchDraggingDrawing = null;

  const cancelTouchLongPress = () => {
    if (touchLongPressTimer) {
      clearTimeout(touchLongPressTimer);
      touchLongPressTimer = null;
    }
  };

  const updateTouchCrosshair = (clientX, clientY) => {
    const meta = canvas._chartMeta;
    if (!meta || !meta.visible || meta.visible.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x <= meta.chartW) {
      const idx = Math.max(0, Math.min(meta.visible.length - 1, Math.floor(x / meta.slotW)));
      activeTab.hoverIndex = idx;
      activeTab.hoverY = y;
      scheduleCanvasRedraw();
    }
  };

  canvas.addEventListener(
    'touchstart',
    (e) => {
      cancelTouchLongPress();
      touchMoved = false;
      touchDraggingDrawing = null;
      if (e.touches.length === 1) {
        const rect = canvas.getBoundingClientRect();
        const t = e.touches[0];
        touchStartX = t.clientX - rect.left;
        touchStartY = t.clientY - rect.top;
        touchStartOffset = Number(activeTab.scrollOffset || 0);
        pinchStartDist = 0;
        isTouchInspecting = false;

        const tool = activeTab.activeTool || activeTab.activeDrawingTool || 'cursor';
        const meta = canvas._chartMeta;
        if (
          tool === 'cursor' &&
          activeTab.selectedDrawingId &&
          canvas._chartLayout &&
          meta &&
          touchStartX <= meta.chartW &&
          Array.isArray(activeTab.drawings)
        ) {
          const tol = Math.max(24, Number(state.chartPreferences.drawingHitTolerancePx || 28));
          const hit = DrawingGeometry.hitTestDrawing(
            activeTab.drawings,
            touchStartX,
            touchStartY,
            canvas._chartLayout.timeToX,
            canvas._chartLayout.priceToY,
            tol
          );
          if (hit && hit.id === activeTab.selectedDrawingId) {
            touchDraggingDrawing = {
              id: hit.id,
              orig: { ...hit },
              startPrice: meta.yToPrice(touchStartY),
              stepMs: PriceFormatter.stepMilliseconds(activeTab.timeframe),
            };
            return;
          }
        }

        if (tool === 'cursor') {
          touchLongPressTimer = setTimeout(() => {
            if (!touchMoved && !touchDraggingDrawing) {
              isTouchInspecting = true;
              updateTouchCrosshair(t.clientX, t.clientY);
            }
          }, 320);
        }
      } else if (e.touches.length === 2) {
        isTouchInspecting = false;
        touchDraggingDrawing = null;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchStartDist = Math.hypot(dx, dy);
        pinchStartVisibleCount = Number(activeTab.visibleCount || 48);
      }
    },
    { passive: true }
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      const meta = canvas._chartMeta;
      if (!meta) return;
      if (e.touches.length === 2 && pinchStartDist > 10) {
        cancelTouchLongPress();
        touchMoved = true;
        touchDraggingDrawing = null;
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.max(10, Math.hypot(dx, dy));
        const zoomFactor = dist / pinchStartDist;
        const maxZoomCap = Math.max(1500, Math.min(5000, Math.round(((activeTab.candles || []).length || 600) * 1.4)));
        const nextCount = Math.round(pinchStartVisibleCount / zoomFactor);
        activeTab.visibleCount = Math.max(15, Math.min(maxZoomCap, nextCount));
        if (zoomFactor < 1) {
          maybeTriggerDeepBackfill(activeTab);
        }
        scheduleCanvasRedraw();
      } else if (e.touches.length === 1 && pinchStartDist === 0) {
        const t = e.touches[0];
        if (isTouchInspecting) {
          e.preventDefault();
          updateTouchCrosshair(t.clientX, t.clientY);
          return;
        }
        const rect = canvas.getBoundingClientRect();
        const x = t.clientX - rect.left;
        const y = t.clientY - rect.top;
        if (Math.hypot(x - touchStartX, y - touchStartY) > 8) {
          touchMoved = true;
          cancelTouchLongPress();
        }
        if (touchDraggingDrawing) {
          e.preventDefault();
          const curPrice = meta.yToPrice(y);
          const deltaPrice = curPrice - touchDraggingDrawing.startPrice;
          const deltaBars = Math.round((x - touchStartX) / Math.max(0.5, meta.slotW));
          const deltaTimeMs = deltaBars * touchDraggingDrawing.stepMs;
          const translated = DrawingGeometry.translateDrawing(
            touchDraggingDrawing.orig,
            deltaTimeMs,
            deltaPrice
          );
          activeTab.drawings = (activeTab.drawings || []).map((d) =>
            d.id === touchDraggingDrawing.id ? translated : d
          );
          scheduleCanvasRedraw();
          return;
        }
        e.preventDefault();
        const dx = x - touchStartX;
        const deltaBars = Math.round(dx / Math.max(0.5, meta.slotW));
        const maxOffset = Math.max(0, (activeTab.candles || []).length - 5);
        activeTab.scrollOffset = Math.max(0, Math.min(maxOffset, touchStartOffset + deltaBars));
        if (activeTab.scrollOffset >= Math.max(0, maxOffset - 15)) {
          maybeTriggerDeepBackfill(activeTab);
        }
        scheduleCanvasRedraw();
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    'touchend',
    (e) => {
      cancelTouchLongPress();
      const meta = canvas._chartMeta;
      if (touchDraggingDrawing) {
        const drawKey = `${activeTab.symbolCode}_${activeTab.timeframe}`;
        saveDrawings(drawKey, activeTab.drawings);
        touchDraggingDrawing = null;
        renderApp();
        return;
      }
      if (!touchMoved && !isTouchInspecting && meta) {
        const tool = activeTab.activeTool || activeTab.activeDrawingTool || 'cursor';
        if (tool && tool !== 'cursor' && touchStartX <= meta.chartW) {
          if (e.cancelable) e.preventDefault();
          placeDrawingAtPoint(touchStartX, touchStartY, meta);
          isTouchInspecting = false;
          pinchStartDist = 0;
          return;
        }
        if (
          tool === 'cursor' &&
          touchStartX <= meta.chartW &&
          canvas._chartLayout &&
          Array.isArray(activeTab.drawings) &&
          activeTab.drawings.length > 0
        ) {
          const tol = Math.max(24, Number(state.chartPreferences.drawingHitTolerancePx || 28));
          const hit = DrawingGeometry.hitTestDrawing(
            activeTab.drawings,
            touchStartX,
            touchStartY,
            canvas._chartLayout.timeToX,
            canvas._chartLayout.priceToY,
            tol
          );
          const nextSelId = hit ? hit.id : null;
          if (activeTab.selectedDrawingId !== nextSelId) {
            activeTab.selectedDrawingId = nextSelId;
            renderApp();
          }
        } else if (activeTab.hoverIndex !== null) {
          activeTab.hoverIndex = null;
          activeTab.hoverY = null;
          scheduleCanvasRedraw();
        }
      }
      isTouchInspecting = false;
      pinchStartDist = 0;
      saveOpenTabsToStorage();
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

      if (!state.isOwnerRegistered && password.length < 8) {
        state.authErrorKey = 'error_password_short';
        renderApp();
        return;
      }
      if (!state.isOwnerRegistered && password !== confirm) {
        state.authErrorKey = 'error_password_mismatch';
        renderApp();
        return;
      }
      const res = await loginOrRegisterOwner(username, email, password);
      if (!res.ok) {
        state.authErrorKey = res.errorKey || 'error_invalid_credentials';
      } else {
        state.authErrorKey = '';
        await downloadWorkspaceSync();
        ensureInitialTabs();
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
      const res = await requestPasswordResetCode(email);
      if (res && res.ok) {
        state.authMode = 'forgot_verify';
        state.authInfoKey = 'status_recovery_code_sent';
        state.authErrorKey = '';
      } else {
        state.authErrorKey = (res && res.errorKey) || 'error_email_not_found';
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
      if (np.length < 8) {
        state.authErrorKey = 'error_password_short';
        renderApp();
        return;
      }
      if (np !== cp) {
        state.authErrorKey = 'error_password_mismatch';
        renderApp();
        return;
      }
      const res = await confirmPasswordResetCode(email, code, np);
      if (res && res.ok) {
        state.authMode = 'login';
        state.authInfoKey = 'status_password_reset_success';
        state.authErrorKey = '';
      } else {
        state.authErrorKey = (res && res.errorKey) || 'error_invalid_recovery_code';
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
      const res = await updateOwnerEmailOnServer(email);
      state.statusBannerKey = res && res.ok
        ? 'settings_email_updated_toast'
        : (res && res.errorKey) || 'error_invalid_email';
      showFloatingToast(i18n.t(state.statusBannerKey));
      renderApp();
    });
  }

  const passForm = document.getElementById('settings-password-form');
  if (passForm) {
    passForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(passForm);
      const np = String(fd.get('new_password') || '');
      if (np.length < 8) {
        state.statusBannerKey = 'error_password_short';
        showFloatingToast(i18n.t('error_password_short'));
        renderApp();
        return;
      }
      const res = await updateOwnerPasswordOnServer(np);
      state.statusBannerKey = res && res.ok
        ? 'settings_password_updated_toast'
        : (res && res.errorKey) || 'error_unauthorized';
      showFloatingToast(i18n.t(state.statusBannerKey));
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
      saveLocalByokKeys({
        twelveDataApiKey: tdEl ? String(tdEl.value || '').trim() : '',
        stooqApiKey: stqEl ? String(stqEl.value || '').trim() : '',
        alphaVantageApiKey: avEl ? String(avEl.value || '').trim() : '',
        finnhubApiKey: fhEl ? String(fhEl.value || '').trim() : '',
      });
      state.statusBannerKey = 'settings_byok_saved';
      showFloatingToast(i18n.t('settings_byok_saved'));
      renderApp();
    });
  }

  const backupExportForm = document.getElementById('backup-export-form');
  if (backupExportForm) {
    backupExportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const passEl = document.getElementById('backup-export-passphrase');
      const pass = String((passEl && passEl.value) || '');
      if (pass.length < 8) {
        showFloatingToast(i18n.t('error_password_short'));
        return;
      }
      const res = await exportEncryptedBackup(pass);
      if (res && res.ok && res.backup) {
        const stamp = new Date().toISOString().slice(0, 10);
        triggerTextDownload(
          `chart_intelligence_backup_${stamp}.cibak.json`,
          'application/json;charset=utf-8',
          JSON.stringify(res.backup, null, 2)
        );
        state.backupStatusMessage = 'Encrypted AES-256-GCM backup exported.';
        showFloatingToast(state.backupStatusMessage);
      } else {
        state.backupStatusMessage = (res && res.error) || 'Backup export failed';
        showFloatingToast(state.backupStatusMessage);
      }
      renderApp();
    });
  }

  const backupRestoreForm = document.getElementById('backup-restore-form');
  if (backupRestoreForm) {
    backupRestoreForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('backup-restore-file');
      const passInput = document.getElementById('backup-restore-passphrase');
      const file = fileInput && fileInput.files ? fileInput.files[0] : null;
      const pass = String((passInput && passInput.value) || '');
      if (!file || pass.length < 8) {
        showFloatingToast(i18n.t('error_password_short'));
        return;
      }
      try {
        const parsed = JSON.parse(await file.text());
        const res = await restoreEncryptedBackup(parsed, pass);
        if (res && res.ok) {
          await downloadWorkspaceSync();
          ensureInitialTabs();
          state.backupStatusMessage = 'Workspace restored & verified cleanly.';
          showFloatingToast(state.backupStatusMessage);
        } else {
          state.backupStatusMessage = (res && res.error) || 'Restore failed: wrong passphrase or tampered file.';
          showFloatingToast(state.backupStatusMessage);
        }
      } catch {
        state.backupStatusMessage = 'Invalid .cibak.json archive file.';
        showFloatingToast(state.backupStatusMessage);
      }
      renderApp();
    });
  }

  const addSymForm = document.getElementById('add-symbol-form');
  if (addSymForm) {
    addSymForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(addSymForm);
      const code = sanitizeSymbolCode(fd.get('symbol_code') || '');
      const title = String(fd.get('symbol_title') || '').trim().slice(0, 64);
      const provider = String(fd.get('provider') || 'tvdatafeed');
      if (!code || code.length < 2) {
        showFloatingToast(i18n.t('error_invalid_symbol') || 'Invalid symbol code (A-Z, 0-9, ., _, :, -)');
        return;
      }
      if (!state.symbols.some((s) => s.symbolCode === code)) {
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
  } else if (action === 'open-mobile-sheet') {
    const sheet = el.getAttribute('data-sheet') || null;
    state.mobileSheet = state.mobileSheet === sheet ? null : sheet;
    renderApp();
  } else if (action === 'close-mobile-sheet') {
    if (e.target !== el && !el.classList.contains('btn-icon')) return;
    state.mobileSheet = null;
    renderApp();
  } else if (action === 'select-tab') {
    const prevTab = activeTab;
    const nextTabId = el.getAttribute('data-tab-id');
    state.activeTabId = nextTabId;
    saveActiveTabId(state.activeTabId);
    const selTab = state.openTabs.find((t) => t.tabId === nextTabId);
    if (selTab) {
      if (prevTab) {
        for (const k of INDICATOR_FLAG_KEYS) {
          selTab[k] = Boolean(prevTab[k]);
        }
      }
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
        saveActiveTabId(state.activeTabId);
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
    const code = el.getAttribute('data-symbol');
    state.symbolOverviewCode = code;
    renderApp();
    if (code) {
      fetchSymbolIntel(code).then(() => renderApp()).catch(() => {});
    }
  } else if (action === 'open-active-symbol-overview') {
    const code = activeTab ? activeTab.symbolCode : 'SPOTBRENT';
    state.symbolOverviewCode = code;
    renderApp();
    fetchSymbolIntel(code).then(() => renderApp()).catch(() => {});
  } else if (action === 'refresh-symbol-intel') {
    const code = el.getAttribute('data-symbol') || state.symbolOverviewCode;
    if (code) {
      showFloatingToast('Refreshing live external intel...');
      await fetchSymbolIntel(code, true);
      renderApp();
    }
  } else if (action === 'audit-active-gap') {
    const targetTab = activeTab || state.openTabs[0];
    if (targetTab) {
      const report = await fetchGapReport(targetTab.symbolCode, targetTab.provider, targetTab.timeframe);
      if (report) {
        const gf = Number(report.gaps_found ?? report.gap_count ?? 0);
        showFloatingToast(`Gap Audit (${targetTab.symbolCode} ${targetTab.timeframe}): ${report.status || 'CLEAN'} · ${gf} gaps`);
      }
      renderApp();
    }
  } else if (action === 'export-candles-csv' || action === 'export-candles-json') {
    const codeAttr = el.getAttribute('data-symbol');
    const symObj = codeAttr
      ? state.symbols.find((s) => s.symbolCode === codeAttr)
      : (activeTab ? state.symbols.find((s) => s.symbolCode === activeTab.symbolCode) : state.symbols[0]);
    const tabForExport = (codeAttr && state.openTabs.find((t) => t.symbolCode === codeAttr)) || activeTab;
    const symCode = (symObj && symObj.symbolCode) || (tabForExport && tabForExport.symbolCode) || 'SPOTBRENT';
    const prov = (tabForExport && tabForExport.provider) || (symObj && symObj.activeProvider) || 'tvdatafeed';
    const tf = (tabForExport && tabForExport.timeframe) || (symObj && symObj.timeframe) || 'M15';
    const candles = (tabForExport && Array.isArray(tabForExport.candles) && tabForExport.candles.length > 0)
      ? tabForExport.candles
      : getCachedOrAggregatedCandles(symCode, prov, tf);
    if (!candles || candles.length === 0) {
      showFloatingToast('No candles loaded to export.');
      return;
    }
    if (action === 'export-candles-csv') {
      triggerTextDownload(
        `${symCode}_${prov}_${tf}.csv`,
        'text/csv;charset=utf-8',
        formatCandlesCsv(symCode, prov, tf, candles)
      );
      showFloatingToast(`Exported ${candles.length} bars to CSV`);
    } else {
      triggerTextDownload(
        `${symCode}_${prov}_${tf}.json`,
        'application/json;charset=utf-8',
        formatCandlesJson(symCode, prov, tf, candles)
      );
      showFloatingToast(`Exported ${candles.length} bars to JSON`);
    }
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
    activeTab.priceScaleFactor = 1.0;
    activeTab.verticalPriceOffset = 0.0;
    activeTab.drawings = state.drawingsByChartId[activeTab.chartId] || [];
    activeTab.candles = getCachedOrAggregatedCandles(activeTab.symbolCode, activeTab.provider, newTf);
    if (activeTab.candles && activeTab.candles.length > 0) {
      activeTab.visibleCount = Math.min(Math.max(24, activeTab.visibleCount || 48), Math.max(24, activeTab.candles.length));
    }
    saveOpenTabsToStorage();
    renderApp();
    redrawActiveCanvas();
    const needsFullBackfill = !activeTab.candles || activeTab.candles.length < 30;
    await syncSymbolNow(activeTab.symbolCode, newTf, () => {
      activeTab.candles = getCachedOrAggregatedCandles(activeTab.symbolCode, activeTab.provider, newTf);
      renderApp();
      redrawActiveCanvas();
    }, needsFullBackfill);
  } else if (action === 'set-date-range' && activeTab) {
    const rk = el.getAttribute('data-range') || 'All';
    activeTab.selectedRangePreset = rk;
    activeTab.scrollOffset = 0;
    activeTab.priceScaleFactor = 1.0;
    activeTab.verticalPriceOffset = 0.0;

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
    activeTab.candles = getCachedOrAggregatedCandles(activeTab.symbolCode, activeTab.provider, targetTf);
    activeTab.visibleCount = computePresetBarCount(activeTab.candles, rk);
    saveOpenTabsToStorage();
    renderApp();
    redrawActiveCanvas();

    const needsFullBackfill = !activeTab.candles || activeTab.candles.length < 30;
    if (tfChanged || needsFullBackfill) {
      await syncSymbolNow(activeTab.symbolCode, targetTf, () => {
        activeTab.candles = getCachedOrAggregatedCandles(
          activeTab.symbolCode,
          activeTab.provider,
          targetTf
        );
        activeTab.visibleCount = computePresetBarCount(activeTab.candles, rk);
        saveOpenTabsToStorage();
        renderApp();
        redrawActiveCanvas();
      }, needsFullBackfill);
    }
  } else if (action === 'set-chart-type' && activeTab) {
    activeTab.chartType = el.getAttribute('data-type') || 'candles';
    saveOpenTabsToStorage();
    renderApp();
  } else if (action === 'toggle-volume' && activeTab) {
    activeTab.showVolume = activeTab.showVolume === false;
    saveOpenTabsToStorage();
    renderApp();
  } else if (action === 'cycle-volume-height' && activeTab) {
    const cur = Number(activeTab.volumePaneRatio || state.chartPreferences.volumePaneRatio || 0.22);
    const nextRatio = cur < 0.19 ? 0.22 : cur < 0.26 ? 0.3 : 0.16;
    activeTab.volumePaneRatio = nextRatio;
    state.chartPreferences.volumePaneRatio = nextRatio;
    for (const t of state.openTabs) {
      t.volumePaneRatio = nextRatio;
    }
    savePreferences();
    saveOpenTabsToStorage();
    renderApp();
  } else if (action === 'set-volume-height' && activeTab) {
    const nextRatio = Math.max(0.12, Math.min(0.35, Number(el.getAttribute('data-ratio') || 0.22)));
    activeTab.volumePaneRatio = nextRatio;
    state.chartPreferences.volumePaneRatio = nextRatio;
    for (const t of state.openTabs) {
      t.volumePaneRatio = nextRatio;
    }
    savePreferences();
    saveOpenTabsToStorage();
    renderApp();
  } else if (action === 'toggle-sma20' && activeTab) {
    activeTab.showSma20 = !activeTab.showSma20;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-sma50' && activeTab) {
    activeTab.showSma50 = !activeTab.showSma50;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-sma200' && activeTab) {
    activeTab.showSma200 = !activeTab.showSma200;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-ema20' && activeTab) {
    activeTab.showEma20 = !activeTab.showEma20;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-ema50' && activeTab) {
    activeTab.showEma50 = !activeTab.showEma50;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-ema200' && activeTab) {
    activeTab.showEma200 = !activeTab.showEma200;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-supertrend' && activeTab) {
    activeTab.showSupertrend = !activeTab.showSupertrend;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-vwap' && activeTab) {
    activeTab.showVwap = !activeTab.showVwap;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-psar' && activeTab) {
    activeTab.showPsar = !activeTab.showPsar;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-ichimoku' && activeTab) {
    activeTab.showIchimoku = !activeTab.showIchimoku;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-keltner' && activeTab) {
    activeTab.showKeltner = !activeTab.showKeltner;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-donchian' && activeTab) {
    activeTab.showDonchian = !activeTab.showDonchian;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-mtf-ema' && activeTab) {
    activeTab.showMtfEma = !activeTab.showMtfEma;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-killzones' && activeTab) {
    activeTab.showKillzones = !activeTab.showKillzones;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-bollinger' && activeTab) {
    activeTab.showBollinger = !activeTab.showBollinger;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-overlay-macd' && activeTab) {
    activeTab.showOverlayMacd = !activeTab.showOverlayMacd;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'set-bb-period') {
    const p = Math.max(5, Math.min(200, Number(el.getAttribute('data-period') || 20)));
    state.chartPreferences.bollingerPeriod = p;
    savePreferences();
    renderApp();
  } else if (action === 'set-bb-stddev') {
    const sd = Math.max(0.5, Math.min(5.0, Number(el.getAttribute('data-stddev') || 2.0)));
    state.chartPreferences.bollingerStdDev = sd;
    savePreferences();
    renderApp();
  } else if (action === 'toggle-rsi14' && activeTab) {
    activeTab.showRsi14 = !activeTab.showRsi14;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-macd' && activeTab) {
    activeTab.showMacd = !activeTab.showMacd;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-atr14' && activeTab) {
    activeTab.showAtr14 = !activeTab.showAtr14;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-adx14' && activeTab) {
    activeTab.showAdx14 = !activeTab.showAdx14;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-stoch14' && activeTab) {
    activeTab.showStoch14 = !activeTab.showStoch14;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-cci20' && activeTab) {
    activeTab.showCci20 = !activeTab.showCci20;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-willr14' && activeTab) {
    activeTab.showWillR14 = !activeTab.showWillR14;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-obv' && activeTab) {
    activeTab.showObv = !activeTab.showObv;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-cmf20' && activeTab) {
    activeTab.showCmf20 = !activeTab.showCmf20;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-roc12' && activeTab) {
    activeTab.showRoc12 = !activeTab.showRoc12;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-smc-structure' && activeTab) {
    activeTab.showSmcStructure = !activeTab.showSmcStructure;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-fvg' && activeTab) {
    activeTab.showFvg = !activeTab.showFvg;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-volume-profile' && activeTab) {
    activeTab.showVolumeProfile = !activeTab.showVolumeProfile;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-pivot-points' && activeTab) {
    activeTab.showPivotPoints = !activeTab.showPivotPoints;
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-future-projection' && activeTab) {
    activeTab.showFutureProjection = !activeTab.showFutureProjection;
    if (activeTab.showFutureProjection) {
      activeTab.scrollOffset = 0;
    }
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
  } else if (action === 'toggle-future-projection-from-modal' && activeTab) {
    activeTab.showFutureProjection = !activeTab.showFutureProjection;
    if (activeTab.showFutureProjection) {
      activeTab.scrollOffset = 0;
      state.activeModal = null;
    }
    syncIndicatorsAcrossTabsAndPrefs(activeTab);
    renderApp();
    redrawActiveCanvas();
  } else if (action === 'toggle-timezone-mode') {
    const nextTz = state.chartPreferences.timezoneMode === 'LOCAL' ? 'UTC' : 'LOCAL';
    state.chartPreferences.timezoneMode = nextTz;
    savePreferences();
    renderApp();
    redrawActiveCanvas();
    showFloatingToast(
      i18n.getCurrentLanguage() === 'fa'
        ? nextTz === 'LOCAL'
          ? 'ساعت نمودار: زمان محلی سیستم'
          : 'ساعت نمودار: گرینویچ (UTC)'
        : nextTz === 'LOCAL'
          ? 'Chart Time: Local System Time'
          : 'Chart Time: UTC'
    );
  } else if (action === 'set-timezone-mode') {
    const mode = el.getAttribute('data-tz') === 'LOCAL' ? 'LOCAL' : 'UTC';
    state.chartPreferences.timezoneMode = mode;
    savePreferences();
    renderApp();
    redrawActiveCanvas();
  } else if (action === 'toggle-log-scale' && activeTab) {
    activeTab.isLogScale = !Boolean(activeTab.isLogScale ?? state.chartPreferences.isLogScale);
    state.chartPreferences.isLogScale = activeTab.isLogScale;
    savePreferences();
    saveOpenTabs();
    renderApp();
    redrawActiveCanvas();
    showFloatingToast(
      i18n.getCurrentLanguage() === 'fa'
        ? activeTab.isLogScale
          ? 'مقیاس لگاریتمی (Log) فعال شد'
          : 'مقیاس خطی (Linear) فعال شد'
        : activeTab.isLogScale
          ? 'Logarithmic scale enabled'
          : 'Linear price scale restored'
    );
  } else if (action === 'reset-price-scale' && activeTab) {
    const currentlyAuto =
      activeTab.isAutoScaleY !== false &&
      Math.abs(Number(activeTab.priceScaleFactor || 1) - 1) < 0.01 &&
      Math.abs(Number(activeTab.verticalPriceOffset || 0)) < 0.0001;
    if (currentlyAuto) {
      activeTab.isAutoScaleY = false;
      showFloatingToast(
        i18n.getCurrentLanguage() === 'fa'
          ? 'مقیاس عمودی دستی (Auto Scale خاموش)'
          : 'Auto Scale OFF (Drag Y-axis to stretch)'
      );
    } else {
      activeTab.isAutoScaleY = true;
      activeTab.priceScaleFactor = 1.0;
      activeTab.verticalPriceOffset = 0.0;
      showFloatingToast(
        i18n.getCurrentLanguage() === 'fa'
          ? 'مقیاس عمودی خودکار (Auto Scale) فعال شد'
          : 'Auto Scale ON (Price range fitted)'
      );
    }
    saveOpenTabs();
    renderApp();
    redrawActiveCanvas();
  } else if (action === 'fit-content' && activeTab) {
    activeTab.scrollOffset = 0;
    activeTab.visibleCount = Math.min(5000, Math.max(24, (activeTab.candles || []).length));
    activeTab.isAutoScaleY = true;
    activeTab.priceScaleFactor = 1.0;
    activeTab.verticalPriceOffset = 0.0;
    saveOpenTabs();
    maybeTriggerDeepBackfill(activeTab);
    renderApp();
    redrawActiveCanvas();
  } else if (action === 'reset-view' && activeTab) {
    activeTab.scrollOffset = 0;
    activeTab.visibleCount = 48;
    activeTab.isAutoScaleY = true;
    activeTab.priceScaleFactor = 1.0;
    activeTab.verticalPriceOffset = 0.0;
    saveOpenTabs();
    renderApp();
    redrawActiveCanvas();
  } else if (action === 'set-tool' && activeTab) {
    const t = el.getAttribute('data-tool') || 'cursor';
    activeTab.activeTool = t;
    activeTab.activeDrawingTool = t;
    activeTab.pendingTrendStart = null;
    activeTab.pendingTrendPoint = null;
    activeTab.pendingAnchors = [];
    state.activeRailPopup = null;
    state.mobileSheet = null;
    renderApp();
  } else if (action === 'set-pitchfork-variant' && activeTab) {
    const variant = el.getAttribute('data-variant') || 'original';
    activeTab.pitchforkVariant = variant;
    if (activeTab.selectedDrawingId) {
      activeTab.drawings = (activeTab.drawings || []).map((d) =>
        d.id === activeTab.selectedDrawingId && d.type === 'pitchfork' ? { ...d, variant } : d
      );
      saveDrawings(activeTab.chartId || `${activeTab.symbolCode}_${activeTab.timeframe}`, activeTab.drawings);
    }
    saveOpenTabsToStorage();
    renderApp();
  } else if (action === 'toggle-magnet' && activeTab) {
    activeTab.isMagnetMode = !activeTab.isMagnetMode;
    saveOpenTabsToStorage();
    renderApp();
  } else if (action === 'delete-drawing' && activeTab) {
    if (activeTab.selectedDrawingId) {
      activeTab.drawings = (activeTab.drawings || []).filter((d) => d.id !== activeTab.selectedDrawingId);
      activeTab.selectedDrawingId = null;
      saveDrawings(activeTab.chartId || `${activeTab.symbolCode}_${activeTab.timeframe}`, activeTab.drawings);
      renderApp();
    }
  } else if (action === 'set-draw-color' && activeTab) {
    const col = el.getAttribute('data-color') || '#2962FF';
    activeTab.activeDrawingColorHex = col;
    activeTab.activeDrawingColor = col;
    state.chartPreferences.defaultDrawingColorHex = col;
    if (activeTab.selectedDrawingId) {
      activeTab.drawings = (activeTab.drawings || []).map((d) =>
        d.id === activeTab.selectedDrawingId ? { ...d, color: col, colorHex: col } : d
      );
      saveDrawings(activeTab.chartId || `${activeTab.symbolCode}_${activeTab.timeframe}`, activeTab.drawings);
    }
    savePreferences();
    saveOpenTabsToStorage();
    state.activeRailPopup = null;
    renderApp();
  } else if (action === 'set-draw-width' && activeTab) {
    const w = Number(el.getAttribute('data-width') || 2.0);
    activeTab.activeDrawingWidthPx = w;
    state.chartPreferences.defaultDrawingWidthPx = w;
    if (activeTab.selectedDrawingId) {
      activeTab.drawings = (activeTab.drawings || []).map((d) =>
        d.id === activeTab.selectedDrawingId
          ? { ...d, strokeWidth: w, strokeWidthDp: w, lineWidthPx: w }
          : d
      );
      saveDrawings(activeTab.chartId || `${activeTab.symbolCode}_${activeTab.timeframe}`, activeTab.drawings);
    }
    savePreferences();
    saveOpenTabsToStorage();
    state.activeRailPopup = null;
    renderApp();
  } else if (action === 'set-default-draw-width') {
    const w = Number(el.getAttribute('data-width') || 2.0);
    state.chartPreferences.defaultDrawingWidthPx = w;
    if (activeTab) activeTab.activeDrawingWidthPx = w;
    savePreferences();
    saveOpenTabsToStorage();
    renderApp();
  } else if (action === 'zoom-in' && activeTab) {
    const step = Number(state.chartPreferences.zoomStepCandles || 8);
    activeTab.visibleCount = Math.max(15, (activeTab.visibleCount || 48) - step);
    saveOpenTabsToStorage();
    renderApp();
  } else if (action === 'zoom-out' && activeTab) {
    const step = Number(state.chartPreferences.zoomStepCandles || 8);
    const maxZoomCap = Math.max(1500, Math.min(5000, Math.round(((activeTab.candles || []).length || 600) * 1.4)));
    activeTab.visibleCount = Math.min(maxZoomCap, (activeTab.visibleCount || 48) + step);
    saveOpenTabsToStorage();
    renderApp();
    maybeTriggerDeepBackfill(activeTab);
  } else if (action === 'set-wl-category') {
    state.watchlistCategory = el.getAttribute('data-category') || 'ALL';
    renderApp();
  } else if (action === 'reset-chart-colors') {
    resetColorsToDefault();
    renderApp();
  } else if (action === 'reset-algo-params') {
    resetAlgoParamsToDefault();
    renderApp();
  } else if (action === 'reset-all-defaults') {
    resetAllPreferencesToDefault();
    renderApp();
  } else if (action === 'clear-drawings' && activeTab) {
    activeTab.drawings = [];
    activeTab.selectedDrawingId = null;
    activeTab.pendingTrendStart = null;
    activeTab.pendingTrendPoint = null;
    activeTab.pendingAnchors = [];
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
  } else if (action === 'set-settings-source-category') {
    state.settingsSourceCategory = el.getAttribute('data-category') || 'ALL';
    renderApp();
  } else if (action === 'apply-category-provider') {
    const prov = el.getAttribute('data-provider') || 'tvdatafeed';
    const cat = el.getAttribute('data-category') || 'ALL';
    const method = PROVIDER_METHODS_CATALOG.find((m) => m.providerId === prov);
    if (method && Array.isArray(method.symbols)) {
      const targetItems = method.symbols.filter(
        (item) => cat === 'ALL' || item.category === cat
      );
      targetItems.forEach((item) => {
        const code = item.symbolCode;
        let sym = state.symbols.find((s) => s.symbolCode === code);
        if (!sym) {
          sym = {
            chartId: `chart_${code.toLowerCase()}_main`,
            symbolCode: code,
            decimals: item.decimals || (code === 'EURUSD' ? 4 : code === 'SPOTBRENT' || code === 'XAGUSD' ? 3 : 2),
            inWatchlist: true,
            activeProvider: prov,
            allowedProviders: ['tvdatafeed', 'biquote', 'twelve_data', 'dukascopy', 'yahoo_finance', 'stooq', 'eia_brent_spot'],
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
          else if (prov === 'stooq' && sym.timeframe !== 'W1') sym.timeframe = 'D1';
        }
        state.openTabs.forEach((t) => {
          if (t.symbolCode === code) {
            t.provider = prov;
            if (prov === 'eia_brent_spot') t.timeframe = 'D1';
          }
        });
      });
      saveSymbolsToStorage();
      saveOpenTabs();
      renderApp();
      syncAllWatchlistSymbols(renderApp);
    }
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
  } else if (action === 'set-indicator-color') {
    const indKey = el.getAttribute('data-indicator');
    const colorHex = el.value || el.getAttribute('data-color');
    if (indKey && colorHex) {
      if (!state.chartPreferences.indicatorCustomColors) {
        state.chartPreferences.indicatorCustomColors = {};
      }
      state.chartPreferences.indicatorCustomColors[indKey] = colorHex.toUpperCase();
      const dot = el.parentElement ? el.parentElement.querySelector('.tv-ind-color-dot') : null;
      if (dot) dot.style.backgroundColor = colorHex;
      redrawActiveCanvas();
    }
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
      localStorage.removeItem('ci_offline_pw_salt');
      localStorage.removeItem('ci_offline_pw_hash');
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
  } else if (action === 'set-wl-category-select') {
    state.watchlistCategory = el.value || 'ALL';
    renderApp();
  } else if (action === 'set-settings-source-category-select') {
    state.settingsSourceCategory = el.value || 'ALL';
    renderApp();
  } else if (action === 'select-explorer-provider-select') {
    state.selectedExplorerProvider = el.value || 'tvdatafeed';
    renderApp();
  } else if (action === 'set-indicator-color') {
    const indKey = el.getAttribute('data-indicator');
    const colorHex = el.value || el.getAttribute('data-color');
    if (indKey && colorHex) {
      if (!state.chartPreferences.indicatorCustomColors) {
        state.chartPreferences.indicatorCustomColors = {};
      }
      state.chartPreferences.indicatorCustomColors[indKey] = colorHex.toUpperCase();
      savePreferences();
      renderApp();
      redrawActiveCanvas();
    }
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

function csvCell(val) {
  const s = String(val ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatCandlesCsv(symbolCode, provider, timeframe, candles) {
  const header = 'symbol,provider,timeframe,open_time_utc_ms,open_time_utc_iso,open,high,low,close,volume';
  const rows = candles.map((c) => {
    const ms = Number(c.open_time_utc_ms || Number(c.openTimeSec || 0) * 1000);
    const iso = c.open_time_utc_iso || c.open_time_utc || (ms > 0 ? new Date(ms).toISOString() : '');
    return [
      csvCell(symbolCode),
      csvCell(provider),
      csvCell(timeframe),
      ms,
      csvCell(iso),
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume ?? 0,
    ].join(',');
  });
  return [header, ...rows].join('\n');
}

function formatCandlesJson(symbolCode, provider, timeframe, candles) {
  return JSON.stringify(
    {
      schema: 'ci_candles_export_v1',
      symbol: symbolCode,
      provider,
      timeframe,
      count: candles.length,
      exported_at_utc: new Date().toISOString(),
      candles: candles.map((c) => {
        const ms = Number(c.open_time_utc_ms || Number(c.openTimeSec || 0) * 1000);
        return {
          open_time_utc_ms: ms,
          open_time_utc_iso: c.open_time_utc_iso || c.open_time_utc || (ms > 0 ? new Date(ms).toISOString() : ''),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume ?? 0),
        };
      }),
    },
    null,
    2
  );
}

function triggerTextDownload(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    const headerH = Math.round(56 * dpr);
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = canvas.width;
    snapCanvas.height = canvas.height + headerH;
    const ctx = snapCanvas.getContext('2d');

    // Fill background
    ctx.fillStyle = state.isDarkTheme ? '#131722' : '#FFFFFF';
    ctx.fillRect(0, 0, snapCanvas.width, snapCanvas.height);

    // Draw main chart canvas below header
    ctx.drawImage(canvas, 0, headerH);

    // Draw top header background banner
    ctx.fillStyle = state.isDarkTheme ? '#1E222D' : '#F8F9FA';
    ctx.fillRect(0, 0, snapCanvas.width, headerH);

    // Bottom border of header
    ctx.strokeStyle = state.isDarkTheme ? '#2A2E39' : '#E0E3EB';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(snapCanvas.width, headerH);
    ctx.stroke();

    // Render Brand & OHLCV details on header
    ctx.save();
    ctx.font = `bold ${Math.round(13 * dpr)}px sans-serif`;
    ctx.fillStyle = '#2962FF';
    ctx.fillText('CHART INTELLIGENCE', 16 * dpr, 22 * dpr);

    if (activeTab) {
      const sym = state.symbols.find((s) => s.symbolCode === activeTab.symbolCode);
      const title = sym ? sym.customTitle || i18n.t('symbol_' + sym.symbolCode) || sym.symbolCode : activeTab.symbolCode;
      const dec = activeTab.decimals;
      const visibleCount = Math.max(15, Math.min(5000, Math.round(activeTab.visibleCount || 48)));
      const maxOffset = Math.max(0, activeTab.candles.length - 5);
      const offset = Math.max(0, Math.min(maxOffset, Math.round(activeTab.scrollOffset || 0)));
      const endIdx = Math.max(1, activeTab.candles.length - offset);
      const startIdx = Math.max(0, endIdx - visibleCount);
      const visible = activeTab.candles.slice(startIdx, endIdx);
      const c =
        activeTab.hoverIndex !== null && visible[activeTab.hoverIndex]
          ? visible[activeTab.hoverIndex]
          : activeTab.candles[activeTab.candles.length - 1];

      if (c) {
        const isBull = Number(c.close) >= Number(c.open);
        const col = isBull ? '#26A69A' : '#EF5350';
        const diff = Number(c.close) - Number(c.open);
        const pct = Number(c.open) > 0 ? PriceFormatter.formatSignedPct(c.open, c.close) : '+0.00%';

        ctx.font = `bold ${Math.round(11 * dpr)}px monospace`;
        ctx.fillStyle = state.isDarkTheme ? '#D1D4DC' : '#131722';
        let cursorX = 175 * dpr;
        ctx.fillText(`${title} · ${PriceFormatter.displayTimeframeLabel(activeTab.timeframe)}`, cursorX, 22 * dpr);

        ctx.font = `${Math.round(10.5 * dpr)}px monospace`;
        cursorX += ctx.measureText(`${title} · ${PriceFormatter.displayTimeframeLabel(activeTab.timeframe)}`).width + 20 * dpr;
        
        ctx.fillStyle = state.isDarkTheme ? '#787B86' : '#59606B';
        ctx.fillText(`O `, cursorX, 22 * dpr); cursorX += ctx.measureText(`O `).width;
        ctx.fillStyle = col;
        ctx.fillText(`${PriceFormatter.formatPrice(c.open, dec)} `, cursorX, 22 * dpr); cursorX += ctx.measureText(`${PriceFormatter.formatPrice(c.open, dec)} `).width;

        ctx.fillStyle = state.isDarkTheme ? '#787B86' : '#59606B';
        ctx.fillText(`H `, cursorX, 22 * dpr); cursorX += ctx.measureText(`H `).width;
        ctx.fillStyle = '#26A69A';
        ctx.fillText(`${PriceFormatter.formatPrice(c.high, dec)} `, cursorX, 22 * dpr); cursorX += ctx.measureText(`${PriceFormatter.formatPrice(c.high, dec)} `).width;

        ctx.fillStyle = state.isDarkTheme ? '#787B86' : '#59606B';
        ctx.fillText(`L `, cursorX, 22 * dpr); cursorX += ctx.measureText(`L `).width;
        ctx.fillStyle = '#EF5350';
        ctx.fillText(`${PriceFormatter.formatPrice(c.low, dec)} `, cursorX, 22 * dpr); cursorX += ctx.measureText(`${PriceFormatter.formatPrice(c.low, dec)} `).width;

        ctx.fillStyle = state.isDarkTheme ? '#787B86' : '#59606B';
        ctx.fillText(`C `, cursorX, 22 * dpr); cursorX += ctx.measureText(`C `).width;
        ctx.fillStyle = col;
        ctx.fillText(`${PriceFormatter.formatPrice(c.close, dec)} `, cursorX, 22 * dpr); cursorX += ctx.measureText(`${PriceFormatter.formatPrice(c.close, dec)} `).width;

        ctx.fillStyle = col;
        ctx.fillText(`${diff >= 0 ? '+' : ''}${PriceFormatter.formatPrice(diff, dec)} (${pct}) `, cursorX, 22 * dpr); cursorX += ctx.measureText(`${diff >= 0 ? '+' : ''}${PriceFormatter.formatPrice(diff, dec)} (${pct}) `).width;

        ctx.fillStyle = state.isDarkTheme ? '#787B86' : '#59606B';
        ctx.fillText(`Vol `, cursorX, 22 * dpr); cursorX += ctx.measureText(`Vol `).width;
        ctx.fillStyle = state.isDarkTheme ? '#D1D4DC' : '#131722';
        ctx.fillText(`${PriceFormatter.formatVolume(c.volume)}`, cursorX, 22 * dpr);
      }

      // Render active indicator pills on second line of header
      const pal = getIndicatorColorPalette(state.chartPreferences);
      const activePills = [];
      if (activeTab.showSma20) activePills.push({ label: 'SMA 20', color: pal.sma20 });
      if (activeTab.showSma50) activePills.push({ label: 'SMA 50', color: pal.sma50 });
      if (activeTab.showSma200) activePills.push({ label: 'SMA 200', color: pal.sma200 });
      if (activeTab.showEma20) activePills.push({ label: 'EMA 20', color: pal.ema20 });
      if (activeTab.showEma50) activePills.push({ label: 'EMA 50', color: pal.ema50 });
      if (activeTab.showEma200) activePills.push({ label: 'EMA 200', color: pal.ema200 });
      if (activeTab.showBollinger) activePills.push({ label: 'BB', color: pal.bollinger });
      if (activeTab.showVwap) activePills.push({ label: 'VWAP', color: pal.vwap });
      if (activeTab.showSupertrend) activePills.push({ label: 'Supertrend', color: pal.supertrend });
      if (activeTab.showSmcStructure) activePills.push({ label: 'SMC (BOS)', color: pal.smcStructure });
      if (activeTab.showFvg) activePills.push({ label: 'FVG', color: pal.fvg });
      if (activeTab.showRsi14) activePills.push({ label: 'RSI', color: pal.rsi14 });
      if (activeTab.showMacd) activePills.push({ label: 'MACD', color: pal.macd });

      if (activePills.length > 0) {
        let pillX = 16 * dpr;
        const pillY = 35 * dpr;
        ctx.font = `bold ${Math.round(9.5 * dpr)}px monospace`;
        for (const pill of activePills) {
          const m = ctx.measureText(pill.label);
          const pW = m.width + 12 * dpr;
          const pH = 15 * dpr;
          ctx.fillStyle = state.isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
          ctx.fillRect(pillX, pillY, pW, pH);
          ctx.strokeStyle = pill.color;
          ctx.lineWidth = 1 * dpr;
          ctx.strokeRect(pillX, pillY, pW, pH);
          ctx.fillStyle = pill.color;
          ctx.fillText(pill.label, pillX + 6 * dpr, pillY + 11 * dpr);
          pillX += pW + 6 * dpr;
        }
      }
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
      ensureInitialTabs(true);
    }
    renderApp();
  } catch {
    // Non-blocking status/workspace fallback
  }

  window.__CI_APP_MOUNTED__ = true;

  const requestBackgroundRender = () => {
    // Never replace root.innerHTML while a user has any modal, mobile sheet, or form control open/focused
    if (
      state.activeModal ||
      state.symbolOverviewCode ||
      state.isAddSymbolModalOpen ||
      state.mobileSheet
    ) {
      redrawActiveCanvas();
      return;
    }
    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.tagName === 'TEXTAREA')
    ) {
      redrawActiveCanvas();
      return;
    }
    renderApp();
  };

  if (state.isAuthenticated) {
    syncAllWatchlistSymbols(requestBackgroundRender).catch(() => {});
  }

  if (!countdownIntervalId) {
    countdownIntervalId = setInterval(() => {
      if (state.isAuthenticated) {
        const clockEl = document.getElementById('tv-live-utc-clock');
        if (clockEl) {
          clockEl.textContent = PriceFormatter.formatLiveClock(state.chartPreferences.timezoneMode);
        }
        redrawActiveCanvas();

        const tab = getActiveTab();
        if (tab && !state.isSyncing && PriceFormatter.isMarketOpen(Date.now(), tab.symbolCode)) {
          const nowMs = Date.now();
          const sym = state.symbols.find((s) => s.symbolCode === tab.symbolCode);
          const lastAuto = Number(tab._lastAutoSyncMs || 0);
          const lastFetch = Number((sym && sym.lastSuccessfulFetchMs) || 0);
          const snapOpen = PriceFormatter.snapToSessionOpenUtcMs
            ? PriceFormatter.snapToSessionOpenUtcMs(nowMs, tab.timeframe || 'M15', tab.symbolCode)
            : PriceFormatter.snapToOpenUtcMs(nowMs, tab.timeframe || 'M15');
          const elapsedInBar = nowMs - snapOpen;
          const isIntraday = ['M15', 'M30', 'H1', 'H4'].includes(String(tab.timeframe || 'M15').toUpperCase());
          const nearBarClose = elapsedInBar >= 1500 && elapsedInBar <= 12000 && nowMs - lastAuto >= 15000;
          const periodicRefresh = isIntraday && nowMs - Math.max(lastAuto, lastFetch) >= 60000;
          if (nearBarClose || periodicRefresh) {
            tab._lastAutoSyncMs = nowMs;
            syncSymbolNow(tab.symbolCode, tab.timeframe, requestBackgroundRender, false, true).catch(() => {});
          }

          // ENG-02: Non-intrusive 15s read-only forming quote tick polling
          const lastQuotePoll = Number(tab._lastQuotePollMs || 0);
          if (nowMs - lastQuotePoll >= 15000 && (tab.candles || []).length > 0) {
            tab._lastQuotePollMs = nowMs;
            fetchLiveQuote(tab.symbolCode, tab.provider, tab.timeframe)
              .then((q) => {
                if (q && Number.isFinite(Number(q.price))) {
                  tab.liveQuotePrice = Number(q.price);
                  tab.liveQuoteMode = q.mode || 'LIVE_TICK';
                  tab.formingBar = q.forming_bar || null;
                  redrawActiveCanvas();
                }
              })
              .catch(() => {});
          }
        }
      }
    }, 1000);
  }
}

bootstrap().catch((err) => {
  console.error('[Chart Intelligence] Bootstrap unhandled exception:', err);
  renderFallbackErrorBoundary(err);
});
