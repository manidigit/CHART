import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.39.0';
import { state, escapeHtml, getIndicatorColorPalette } from '../core/store.js?v=1.39.0';
import { renderSymbolBadge } from './watchlistView.js?v=1.39.0';

export function renderTopHeaderBar(activeTab, i18n) {
  const sym = activeTab
    ? state.symbols.find((s) => s.symbolCode === activeTab.symbolCode)
    : state.symbols[0];

  const allowedTfs =
    activeTab && (activeTab.provider === 'eia_brent_spot' || activeTab.provider === 'stooq')
      ? ['D1', 'W1']
      : ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

  const tfButtons = allowedTfs
    .map((tf) => {
      const isAct = activeTab && activeTab.timeframe === tf;
      return `<button class="tv-tool-btn ltr-num ${isAct ? 'active' : ''}" data-action="set-timeframe" data-tf="${tf}">${PriceFormatter.displayTimeframeLabel(tf)}</button>`;
    })
    .join('');

  const activeIndicatorsCount = activeTab
    ? (activeTab.showSma20 ? 1 : 0) +
      (activeTab.showSma50 ? 1 : 0) +
      (activeTab.showSma200 ? 1 : 0) +
      (activeTab.showEma20 ? 1 : 0) +
      (activeTab.showEma50 ? 1 : 0) +
      (activeTab.showEma200 ? 1 : 0) +
      (activeTab.showSupertrend ? 1 : 0) +
      (activeTab.showVwap ? 1 : 0) +
      (activeTab.showPsar ? 1 : 0) +
      (activeTab.showIchimoku ? 1 : 0) +
      (activeTab.showKeltner ? 1 : 0) +
      (activeTab.showDonchian ? 1 : 0) +
      (activeTab.showMtfEma ? 1 : 0) +
      (activeTab.showKillzones ? 1 : 0) +
      (activeTab.showBollinger ? 1 : 0) +
      (activeTab.showOverlayMacd ? 1 : 0) +
      (activeTab.showVolume !== false ? 1 : 0) +
      (activeTab.showRsi14 ? 1 : 0) +
      (activeTab.showMacd ? 1 : 0) +
      (activeTab.showAtr14 ? 1 : 0) +
      (activeTab.showAdx14 ? 1 : 0) +
      (activeTab.showStoch14 ? 1 : 0) +
      (activeTab.showCci20 ? 1 : 0) +
      (activeTab.showWillR14 ? 1 : 0) +
      (activeTab.showObv ? 1 : 0) +
      (activeTab.showCmf20 ? 1 : 0) +
      (activeTab.showRoc12 ? 1 : 0) +
      (activeTab.showSmcStructure ? 1 : 0) +
      (activeTab.showFvg ? 1 : 0) +
      (activeTab.showVolumeProfile ? 1 : 0) +
      (activeTab.showPivotPoints ? 1 : 0) +
      (activeTab.showFutureProjection ? 1 : 0)
    : 1;

  const isFa = i18n.getCurrentLanguage() === 'fa';
  const connStatus = (sym && sym.connectionStatus) || 'OFFLINE';
  const lastFetchMs = Number((sym && sym.lastSuccessfulFetchMs) || 0);
  const lastCloseMs = Number((sym && sym.lastCandleCloseMs) || 0);
  const fetchTimeStr = lastFetchMs > 0 ? new Date(lastFetchMs).toISOString().slice(11, 19) + 'Z' : '—';
  const closeTimeStr = lastCloseMs > 0 ? new Date(lastCloseMs).toISOString().slice(5, 16).replace('T', ' ') + 'Z' : '—';
  const errNote = sym && sym.syncErrorMessage ? ` · ${sym.syncErrorMessage}` : '';

  let statusDotColor = 'var(--text-muted)';
  let statusText = i18n.t('status_never_synced');
  if (sym && sym.isSyncing) {
    statusDotColor = 'var(--gold)';
    statusText = i18n.t('chart_status_syncing');
  } else if (sym && sym.providerStatus === 'API_KEY_REQUIRED') {
    statusDotColor = 'var(--gold)';
    statusText = isFa ? 'نیاز به کلید API' : 'API Key Needed';
  } else if (connStatus === 'ERROR' || (sym && sym.syncError && connStatus !== 'STALE')) {
    statusDotColor = 'var(--bear)';
    statusText = i18n.t('chart_status_error');
  } else if (connStatus === 'STALE') {
    statusDotColor = 'var(--gold)';
    statusText = i18n.t('chart_status_stale') || i18n.t('chart_status_cached');
  } else if (connStatus === 'CLOSED' || (sym && !PriceFormatter.isMarketOpen(Date.now(), sym.symbolCode) && lastCloseMs > 0)) {
    statusDotColor = 'var(--text-muted)';
    statusText = i18n.t('chart_status_market_closed');
  } else if (connStatus === 'CACHED') {
    statusDotColor = 'var(--gold)';
    statusText = i18n.t('chart_status_cached');
  } else if (connStatus === 'LIVE' && PriceFormatter.isMarketOpen(Date.now(), sym ? sym.symbolCode : 'XAUUSD')) {
    statusDotColor = 'var(--bull)';
    statusText = i18n.t('chart_status_live');
  }

  const statusTooltip = escapeHtml(
    `${sym ? sym.activeProvider : ''} · ${connStatus} · Fetch: ${fetchTimeStr} · BarClose: ${closeTimeStr}${errNote}`
  );
  const indicatorsLabel = isFa ? 'اندیکاتورها' : 'Indicators';
  const activeCode = sym ? sym.symbolCode : 'SPOTBRENT';
  const openTabsList =
    Array.isArray(state.openTabs) && state.openTabs.length > 0
      ? state.openTabs
      : [
          activeTab || {
            tabId: `tab_${activeCode}_M15`,
            symbolCode: activeCode,
            timeframe: 'M15',
            provider: sym ? sym.activeProvider : 'tvdatafeed',
          },
        ];

  const openTabsHtml = openTabsList
    .map((t) => {
      const isSelected = activeTab ? t.tabId === activeTab.tabId : t.tabId === state.activeTabId;
      const tfLabel = PriceFormatter.displayTimeframeLabel(t.timeframe || 'M15');
      const canClose = openTabsList.length > 1;
      const safeTabId = escapeHtml(t.tabId);
      const safeSym = escapeHtml(t.symbolCode);
      const safeProv = escapeHtml(t.provider || 'tvdatafeed');
      return `
        <div
          class="tv-open-tab-chip ltr-num ${isSelected ? 'active' : ''}"
          data-action="select-tab"
          data-tab-id="${safeTabId}"
          title="${safeSym} · ${tfLabel} (${safeProv})"
        >
          ${renderSymbolBadge(t.symbolCode, 17)}
          <span class="tv-open-tab-sym">${safeSym}</span>
          <span class="tv-open-tab-tf">${tfLabel}</span>
          ${
            canClose
              ? `<button type="button" class="tv-open-tab-close" data-action="close-tab" data-tab-id="${safeTabId}" title="${i18n.t('chart_close_tab')}">✕</button>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  return `
    <header class="tv-topbar" dir="ltr">
      <div class="tv-topbar-left">
        <div class="tv-brand">
          <div class="tv-logo">CI</div>
        </div>

        <!-- Multi-Tab Chart Bar (1-click switching between open chart tabs + Add/Search button) -->
        <div class="tv-open-tabs-strip" role="tablist" aria-label="Open Chart Tabs">
          ${openTabsHtml}
          <button
            type="button"
            class="tv-tab-add-btn"
            data-action="focus-watchlist-search"
            title="${isFa ? 'جستجو و باز کردن نماد جدید در تب موازی' : 'Search & open symbol in parallel tab'}"
          >+</button>
        </div>

        <div class="tv-divider"></div>

        <!-- Unified Candle Timeframes Group (15m, 1h, 4h, 1D, 1W) -->
        <div class="tv-toolbar-group" title="Candle Timeframes">
          ${tfButtons}
        </div>

        <div class="tv-divider"></div>

        <!-- Unified Chart Style Group (Candles / Line) -->
        <div class="tv-toolbar-group" title="Chart Type">
          <button class="tv-tool-btn ${activeTab && activeTab.chartType !== 'line' ? 'active' : ''}" data-action="set-chart-type" data-type="candles" title="${i18n.t('chart_type_candles')}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4v16"/><rect x="6" y="8" width="6" height="8" rx="1"/><path d="M17 3v18"/><rect x="14" y="7" width="6" height="9" rx="1"/></svg>
          </button>
          <button class="tv-tool-btn ${activeTab && activeTab.chartType === 'line' ? 'active' : ''}" data-action="set-chart-type" data-type="line" title="${i18n.t('chart_type_line')}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>
          </button>
        </div>

        <div class="tv-divider"></div>

        <!-- Dedicated TradingView Indicators Button (Opens Unified Indicators Modal) -->
        <button
          class="tv-tool-btn ${state.activeModal === 'indicators' ? 'active' : ''}"
          data-action="open-modal"
          data-modal="indicators"
          title="${indicatorsLabel}"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          <span>${indicatorsLabel}</span>
          ${
            activeIndicatorsCount > 0
              ? `<span class="tv-badge-count ltr-num">${activeIndicatorsCount}</span>`
              : ''
          }
        </button>
      </div>

      <div class="tv-topbar-right">
        <button
          type="button"
          class="tv-tool-btn tv-mobile-only-btn ${state.mobileSheet === 'tools' ? 'active' : ''}"
          data-action="open-mobile-sheet"
          data-sheet="tools"
          title="${i18n.t('draw_tools_toggle')}"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/></svg>
        </button>

        <button
          type="button"
          class="tv-tool-btn tv-mobile-only-btn ${state.mobileSheet === 'indicators' ? 'active' : ''}"
          data-action="open-mobile-sheet"
          data-sheet="indicators"
          title="${indicatorsLabel}"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        </button>

        <span
          class="ltr-num"
          title="${statusTooltip}"
          style="display: inline-flex; align-items: center; gap: 5px; padding: 0 6px; font-size: 11px; color: ${statusDotColor}; font-weight: 600;"
        >
          <span style="width: 7px; height: 7px; border-radius: 50%; background: ${statusDotColor}; display: inline-block;"></span>
          <span>${escapeHtml(statusText)}</span>
        </span>

        <button class="tv-tool-btn ltr-num" data-action="export-candles-csv" title="${i18n.t('action_export_csv') || 'Export CSV'}">
          CSV
        </button>

        <button class="tv-tool-btn ltr-num" data-action="export-candles-json" title="${i18n.t('action_export_json') || 'Export JSON'}">
          JSON
        </button>

        <button class="tv-tool-btn" data-action="take-chart-snapshot" title="${i18n.t('action_take_snapshot')}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </button>

        <button class="tv-tool-btn" data-action="sync-active-tab" title="${i18n.t('action_sync_now')}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
        </button>

        <button class="tv-tool-btn" data-action="toggle-fullscreen" title="${i18n.t('action_fullscreen')}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        </button>
      </div>
    </header>
  `;
}

export function renderBottomChartBar(activeTab, i18n) {
  if (!activeTab) return '';
  const ranges = ['1D', '5D', '1W', '1M', '3M', '6M', '9M', 'YTD', '1Y', '5Y', 'All'];
  const rangeButtons = ranges
    .map((rk) => {
      const isAct = activeTab.selectedRangePreset === rk;
      return `<button class="tv-range-btn ltr-num ${isAct ? 'active' : ''}" data-action="set-date-range" data-range="${rk}">${rk}</button>`;
    })
    .join('');

  const isFa = i18n.getCurrentLanguage() === 'fa';
  const isLog = Boolean(activeTab.isLogScale ?? state.chartPreferences.isLogScale);
  const isAuto =
    activeTab.isAutoScaleY !== false &&
    Math.abs(Number(activeTab.priceScaleFactor || 1) - 1) < 0.01 &&
    Math.abs(Number(activeTab.verticalPriceOffset || 0)) < 0.0001;
  const tzMode = state.chartPreferences.timezoneMode === 'LOCAL' ? 'LOCAL' : 'UTC';
  const nowClockStr = PriceFormatter.formatLiveClock(tzMode);

  return `
    <div class="tv-bottom-bar" dir="ltr">
      <div class="tv-bottom-ranges">
        ${rangeButtons}
        <div class="tv-divider"></div>
        <button class="tv-range-btn" data-action="fit-content" title="${i18n.t('chart_fit_content')}">⤢</button>
        <button class="tv-range-btn" data-action="reset-view" title="${i18n.t('chart_reset_view')}">⏭</button>
      </div>

      <div class="tv-bottom-scales">
        <button
          type="button"
          id="tv-live-utc-clock"
          class="tv-scale-btn ltr-num"
          data-action="toggle-timezone-mode"
          title="${isFa ? 'تغییر ساعت بین UTC و ساعت محلی سیستم' : 'Click to toggle between UTC and Local System Time'}"
          style="color: var(--text); font-size: 11px; margin-right: 4px; white-space: nowrap;"
        >
          ${nowClockStr}
        </button>
        <div class="tv-divider"></div>
        <button type="button" class="tv-scale-btn ltr-num ${isLog ? 'active' : ''}" data-action="toggle-log-scale" title="${i18n.t('tv_log_scale')}">
          log
        </button>
        <button type="button" class="tv-scale-btn ltr-num ${isAuto ? 'active' : ''}" data-action="reset-price-scale" title="${i18n.t('chart_auto_scale')}">
          auto
        </button>
      </div>
    </div>
  `;
}

export function renderIndicatorsModal(activeTab, i18n) {
  if (state.activeModal !== 'indicators' || !activeTab) return '';
  const isFa = i18n.getCurrentLanguage() === 'fa';
  const volRatioPct = Math.round((activeTab.volumePaneRatio || 0.22) * 100);
  const pal = getIndicatorColorPalette(state.chartPreferences);

  const FAMILY_PRESET_COLORS = [
    '#2962FF',
    '#0EA5E9',
    '#14B8A6',
    '#10B981',
    '#F59E0B',
    '#F97316',
    '#EC4899',
    '#A855F7',
  ];

  const renderFamilyHeader = (title, subtitle, familyKey, currentHex) => `
    <div class="card-subtle" style="padding: 8px 11px; margin-top: 8px; border-inline-start: 3px solid ${currentHex}; background: rgba(148, 163, 184, 0.05);">
      <div class="row-between" style="flex-wrap: wrap; gap: 6px;">
        <div>
          <div style="font-size: 11.5px; font-weight: 800; color: ${currentHex}; letter-spacing: 0.3px;">
            ${title}
          </div>
          <div style="font-size: 10.5px; color: var(--text-muted); margin-top: 1px;">
            ${subtitle}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;" title="${isFa ? 'انتخاب طیف رنگی این دسته' : 'Choose color spectrum for this category'}">
          <span style="font-size: 10px; color: var(--text-muted); margin-inline-end: 2px;">${isFa ? 'طیف رنگ:' : 'Palette:'}</span>
          ${FAMILY_PRESET_COLORS.map((hex) => {
            const isSel = String(currentHex || '').toUpperCase() === hex.toUpperCase();
            return `<button
              type="button"
              data-action="set-ind-family-color"
              data-family="${familyKey}"
              data-color="${hex}"
              style="width: 15px; height: 15px; border-radius: 50%; background: ${hex}; border: ${isSel ? '2px solid #FFFFFF' : '1px solid rgba(255,255,255,0.25)'}; box-shadow: ${isSel ? `0 0 0 1.5px ${hex}` : 'none'}; cursor: pointer; padding: 0;"
              title="${hex}"
            ></button>`;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  const renderToggleRow = (color, title, subtitle, isActive, actionName, styleBadge = '──') => `
    <div class="card-subtle row-between" style="padding: 8px 11px;">
      <div>
        <div style="font-weight: 700; color: var(--text-strong); font-size: 12.5px; display: flex; align-items: center; gap: 6px;">
          <span class="ltr-num" style="display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 15px; padding: 0 4px; border-radius: 4px; background: rgba(15,23,42,0.45); border: 1px solid ${color}; color: ${color}; font-size: 9.5px; font-weight: 800;">${styleBadge}</span>
          <span>${title}</span>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
          ${subtitle}
        </div>
      </div>
      <button
        class="btn btn-sm ${isActive ? 'btn-primary' : ''}"
        data-action="${actionName}"
      >
        ${isActive ? (isFa ? 'فعال ✓' : 'Active ✓') : isFa ? 'افزودن' : 'Add'}
      </button>
    </div>
  `;

  return `
    <div class="modal-backdrop" data-action="close-modal-backdrop">
      <div class="modal-card" style="max-width: 580px; max-height: 86vh; display: flex; flex-direction: column;" dir="${isFa ? 'rtl' : 'ltr'}">
        <div class="tv-modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
            <span>${isFa ? 'اندیکاتورها، طیف رنگی دسته‌بندی‌شده و اسیلاتورها' : 'Categorized Indicators, Color Spectra & Oscillators'}</span>
          </div>
          <button class="btn btn-sm btn-icon" data-action="close-modal">✕</button>
        </div>

        <div class="tv-modal-body" style="display: flex; flex-direction: column; gap: 7px; overflow-y: auto; padding-bottom: 14px;">
          ${renderFamilyHeader(
            isFa ? '۱. خانواده میانگین‌های متحرک (Moving Averages Spectrum)' : '1. Moving Averages Family (Graduated Shade Spectrum)',
            isFa ? 'همه میانگین‌ها در یک طیف رنگی هماهنگ (از روشن برای کوتاه‌مدت تا پررنگ برای بلندمدت) رسم می‌شوند' : 'All MAs share a unified color spectrum (light short-term to deep long-term)',
            'ma',
            pal.maBase
          )}
          ${renderToggleRow(pal.sma20, 'SMA 20', isFa ? 'میانگین متحرک ساده ۲۰ دوره‌ای (روشن — کوتاه‌مدت)' : '20-Period Simple Moving Average (Light Shade)', activeTab.showSma20, 'toggle-sma20', '──')}
          ${renderToggleRow(pal.sma50, 'SMA 50', isFa ? 'میانگین متحرک ساده ۵۰ دوره‌ای (میانی — میان‌مدت)' : '50-Period Simple Moving Average (Medium Shade)', activeTab.showSma50, 'toggle-sma50', '──')}
          ${renderToggleRow(pal.sma200, 'SMA 200', isFa ? 'میانگین متحرک ساده ۲۰۰ دوره‌ای (پررنگ ضخیم — روند کلان)' : '200-Period Institutional Simple Moving Average (Deep Bold)', activeTab.showSma200, 'toggle-sma200', '━━')}
          ${renderToggleRow(pal.ema20, 'EMA 20', isFa ? 'میانگین متحرک نمایی سریع ۲۰ دوره‌ای' : '20-Period Fast Exponential Moving Average', activeTab.showEma20, 'toggle-ema20', '──')}
          ${renderToggleRow(pal.ema50, 'EMA 50', isFa ? 'میانگین متحرک نمایی ۵۰ دوره‌ای' : '50-Period Exponential Moving Average', activeTab.showEma50, 'toggle-ema50', '──')}
          ${renderToggleRow(pal.ema200, 'EMA 200', isFa ? 'میانگین متحرک نمایی ۲۰۰ دوره‌ای (پررنگ — روند بلندمدت)' : '200-Period Institutional Exponential Moving Average', activeTab.showEma200, 'toggle-ema200', '━━')}
          ${renderToggleRow(pal.mtfEma, 'MTF EMA (20)', isFa ? 'میانگین نمایی تایم‌فریم بالاتر (خط‌چین پله‌ای بدون نشت آینده)' : 'Higher-Timeframe closed-bar EMA 20 step overlay (Dashed)', activeTab.showMtfEma, 'toggle-mtf-ema', '╌╌')}

          ${renderFamilyHeader(
            isFa ? '۲. خانواده کانال‌ها و باندهای نوسان (Volatility Channels Spectrum)' : '2. Volatility Bands & Channels Family',
            isFa ? 'باند بولینگر، کانال کلتنر و دونچیان در طیف رنگی یکپارچه' : 'Bollinger Bands, Keltner & Donchian in a unified channel spectrum',
            'bands',
            pal.bandsBase
          )}
          ${renderToggleRow(pal.bollinger, `Bollinger Bands (${state.chartPreferences.bollingerPeriod || 20}, ${state.chartPreferences.bollingerStdDev || 2})`, isFa ? 'کانال نوسان بولینگر با قابلیت تنظیم دوره (Period) و انحراف معیار (StdDev)' : 'Configurable Bollinger volatility channel (Period & StdDev)', activeTab.showBollinger, 'toggle-bollinger', '≈≈')}
          <div class="card-subtle" style="padding: 8px 11px; margin-top: -4px; border-top: 1px dashed var(--border);">
            <div class="row-between" style="font-size: 11.5px; margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
              <span style="color: var(--text-muted);">${isFa ? 'دوره باند بولینگر (Period):' : 'Bollinger Period:'}</span>
              <div class="chip-group ltr-num">
                ${[10, 14, 20, 30, 50]
                  .map(
                    (pVal) =>
                      `<button type="button" class="chip ${Number(state.chartPreferences.bollingerPeriod || 20) === pVal ? 'active' : ''}" data-action="set-bb-period" data-period="${pVal}">${pVal}</button>`
                  )
                  .join('')}
              </div>
            </div>
            <div class="row-between" style="font-size: 11.5px; flex-wrap: wrap; gap: 6px;">
              <span style="color: var(--text-muted);">${isFa ? 'ضریب انحراف معیار (StdDev):' : 'Bollinger StdDev:'}</span>
              <div class="chip-group ltr-num">
                ${[1.5, 2.0, 2.5, 3.0]
                  .map(
                    (sdVal) =>
                      `<button type="button" class="chip ${Math.abs(Number(state.chartPreferences.bollingerStdDev || 2.0) - sdVal) < 0.05 ? 'active' : ''}" data-action="set-bb-stddev" data-stddev="${sdVal}">${sdVal}σ</button>`
                  )
                  .join('')}
              </div>
            </div>
          </div>
          ${renderToggleRow(pal.keltner, 'Keltner Channels (20, 10, 2.0)', isFa ? 'کانال کلتنر بر پایه EMA 20 و ۲ برابر ATR 10' : 'EMA 20 basis ± 2.0× Wilder ATR 10 channel', activeTab.showKeltner, 'toggle-keltner', '≈≈')}
          ${renderToggleRow(pal.donchian, 'Donchian Channels (20)', isFa ? 'کانال شکست دونچیان ۲۰ دوره‌ای (سقف/کف/میانه)' : '20-Period Highest High / Lowest Low breakout channel', activeTab.showDonchian, 'toggle-donchian', '══')}

          ${renderFamilyHeader(
            isFa ? '۳. خانواده سطوح کلیدی، پیوت و پروفایل حجم (Levels, Pivots & VRVP)' : '3. Key Levels, Pivot Points & Volume Profile Family',
            isFa ? 'تگ‌های قیمت در حاشیه راست بدون تداخل با کندل‌ها یا یکدیگر چیده می‌شوند' : 'Right-docked non-overlapping level pills for clean candle visibility',
            'levels',
            pal.levelsBase
          )}
          ${renderToggleRow(pal.vwap, 'Session VWAP', isFa ? 'میانگین قیمت وزنی حجم (خط‌چین تراز سشن روزانه UTC)' : 'Session-Anchored Volume Weighted Average Price', activeTab.showVwap, 'toggle-vwap', '╌╌')}
          ${renderToggleRow(pal.pivotP, isFa ? 'Pivot Points (P, R1, R2, S1, S2)' : 'Pivot Points (P, R1, R2, S1, S2)', isFa ? 'سطوح پیوت استاندارد با برچسب‌های ضدتداخل در سمت راست چارت' : 'Standard floor pivot levels with collision-free right-edge badges', activeTab.showPivotPoints, 'toggle-pivot-points', 'P/R/S')}
          ${renderToggleRow(pal.vrvpPoc, 'Volume Profile (VRVP — POC / VAH / VAL)', isFa ? 'پروفایل حجم محدوده قابل مشاهده به همراه خطوط POC، VAH و VAL (۷۰٪)' : 'Visible Range Volume Profile histogram with Point of Control & 70% Value Area', activeTab.showVolumeProfile, 'toggle-volume-profile', '▋POC')}

          ${renderFamilyHeader(
            isFa ? '۴. خانواده سیستم‌های تعقیب روند و ایچیموکو (Trend Systems & Cloud)' : '4. Trend Systems, Cloud & Overlay Momentum Family',
            isFa ? 'سوپرترند، پارابولیک سار، ابر ایچیموکو و مکدی روی چارت' : 'Supertrend, Parabolic SAR, Ichimoku Cloud & Overlay MACD',
            'trend',
            pal.trendBase
          )}
          ${renderToggleRow(pal.supertrend, 'Supertrend (10, 3)', isFa ? 'خط روند هوشمند سوپرترند (صعودی / نزولی)' : 'Dynamic ATR Supertrend trailing stop (Period 10, Mult 3)', activeTab.showSupertrend, 'toggle-supertrend', '━━')}
          ${renderToggleRow(pal.psar, 'Parabolic SAR (0.02, 0.20)', isFa ? 'نقاط تعقیب روند و چرخش پارابولیک سار' : 'Wilder Parabolic Stop and Reverse dots (0.02, 0.20)', activeTab.showPsar, 'toggle-psar', '•••')}
          ${renderToggleRow(pal.ichimoku, 'Ichimoku Cloud (9, 26, 52, 26)', isFa ? 'ابر ایچیموکو با تنکانسن، کیجونسن، سنکو اسپن A/B و چیکو' : 'Tenkan, Kijun, Senkou Span A/B cloud & Chikou Span', activeTab.showIchimoku, 'toggle-ichimoku', '☁')}
          ${renderToggleRow(pal.overlayMacd, isFa ? 'MACD Classic (روی چارت اصلی — Overlay)' : 'MACD Classic (Main Chart Overlay)', isFa ? 'نمایش مکدی کلاسیک (۱۲، ۲۶، ۹) مستقیماً در نوار پایینی چارت قیمت' : 'Render Classic MACD (12, 26, 9) directly overlaid on the main price canvas', activeTab.showOverlayMacd, 'toggle-overlay-macd', '∿')}
          ${renderToggleRow('#A796D4', isFa ? 'Future Candlesticks (پیش‌بینی ۳۰ کندل آینده روی چارت)' : 'Future Candlesticks (30-Period AI Projection)', isFa ? 'ترسیم ۳۰ کندل آینده (حداقل ۱۰ کندل روی هر تایم‌فریم) همراه با خط جداکننده PAST | Future Projection' : 'Render 30 ghosted future candlesticks with Present Bar Divider & +5..+30 % labels', activeTab.showFutureProjection, 'toggle-future-projection', '+30')}

          ${renderFamilyHeader(
            isFa ? '۵. خانواده ساختار بازار هوشمند و سشن‌ها (SMC & Session Killzones)' : '5. Smart Money Concepts (SMC) & Killzones Family',
            isFa ? 'شکست ساختار BOS/CHoCH، گپ ارزش منصفانه FVG و سشن‌های معاملاتی' : 'Market Structure Breaks, Fair Value Gaps & UTC Session Killzones',
            'smc',
            pal.smcBase
          )}
          ${renderToggleRow(pal.smcStructure, 'BOS / CHoCH & EQH / EQL', isFa ? 'تشخیص خودکار شکست ساختار (BOS)، تغییر کاراکتر (CHoCH) و نقدینگی سقف/کف برابر' : 'Auto Market Structure Breaks (BOS/CHoCH) & Equal Highs/Lows liquidity pools', activeTab.showSmcStructure, 'toggle-smc-structure', 'BOS')}
          ${renderToggleRow(pal.fvg, 'Fair Value Gaps (FVG / Imbalance)', isFa ? 'ترسیم خودکار باکس گپ‌های ارزش منصفانه صعودی و نزولی تسویه‌نشده' : 'Highlight unmitigated 3-candle Bullish & Bearish Fair Value Gaps', activeTab.showFvg, 'toggle-fvg', '▭FVG')}
          ${renderToggleRow(pal.killzones, isFa ? 'Trading Killzones (Asia / London / NY)' : 'Session Killzones (Asia / London / NY Overlap)', isFa ? 'نوارهای زمانی سشن‌های آسیا، لندن، نیویورک و همپوشانی (UTC)' : 'UTC session background bands (Asia 00-09, London 07-16, NY 13-22)', activeTab.showKillzones, 'toggle-killzones', '▒▒')}

          <div style="font-size: 11px; font-weight: 800; color: #38BDF8; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 8px;">
            ${isFa ? '۶. پنل‌های پایینی همگام (Multi-Pane Sub-Charts)' : '6. Synchronized Sub-Pane Oscillators'}
          </div>
          ${renderToggleRow('#A855F7', 'RSI (14)', isFa ? 'شاخص قدرت نسبی ۱۴ دوره‌ای با سطوح اشباع ۳۰ و ۷۰ در پنل پایین' : '14-Period Wilder Relative Strength Index with 30/70 levels', activeTab.showRsi14, 'toggle-rsi14', 'RSI')}
          ${renderToggleRow('#2962FF', 'MACD (12, 26, 9)', isFa ? 'خطوط مکدی، سیگنال و هیستوگرام مومنتوم در پنل پایین' : 'MACD Line, Signal Line, and Momentum Histogram sub-pane', activeTab.showMacd, 'toggle-macd', 'MACD')}
          ${renderToggleRow('#F43F5E', 'ATR (14)', isFa ? 'میانگین دامنه نوسان واقعی ۱۴ دوره‌ای در پنل مجزای پایین' : '14-Period Wilder Average True Range volatility sub-pane', activeTab.showAtr14, 'toggle-atr14', 'ATR')}
          ${renderToggleRow('#F59E0B', 'ADX / DMI (14)', isFa ? 'شاخص قدرت روند و جهت حرکتی (+DI / -DI / ADX) با خط مرجع ۲۵' : 'Directional Movement Index (+DI / -DI) & ADX trend strength (Ref 25)', activeTab.showAdx14, 'toggle-adx14', 'ADX')}
          ${renderToggleRow('#06B6D4', 'Stochastic (14, 3, 3)', isFa ? 'اسیلاتور استوکاستیک کند (%K / %D) با سطوح اشباع ۲۰ و ۸۰' : 'Slow Stochastic Oscillator (%K / %D) with 20/80 thresholds', activeTab.showStoch14, 'toggle-stoch14', '%K%D')}
          ${renderToggleRow('#10B981', 'CCI (20)', isFa ? 'شاخص کانال کالا ۲۰ دوره‌ای با سطوح -۱۰۰ و +۱۰۰' : 'Commodity Channel Index (20) with ±100 bands', activeTab.showCci20, 'toggle-cci20', 'CCI')}
          ${renderToggleRow('#EC4899', 'Williams %R (14)', isFa ? 'شاخص ویلیامز درصد آر (-۱۰۰ تا ۰) با سطوح -۲۰ و -۸۰' : 'Williams Percent Range (-100 to 0) with -20 / -80 bands', activeTab.showWillR14, 'toggle-willr14', '%R')}
          ${renderToggleRow('#3B82F6', 'OBV', isFa ? 'حجم تعادلی تجمعی (On-Balance Volume)' : 'On-Balance Volume cumulative flow', activeTab.showObv, 'toggle-obv', 'OBV')}
          ${renderToggleRow('#22C55E', 'CMF (20)', isFa ? 'جریان نقدینگی چایکین ۲۰ دوره‌ای (-۱ تا +۱)' : 'Chaikin Money Flow (20) accumulation/distribution oscillator', activeTab.showCmf20, 'toggle-cmf20', 'CMF')}
          ${renderToggleRow('#EAB308', 'ROC (12)', isFa ? 'نرخ تغییر قیمت ۱۲ دوره‌ای حول محور صفر' : '12-Period Price Rate of Change (%) around 0.0', activeTab.showRoc12, 'toggle-roc12', 'ROC')}

          <!-- Volume Pane & Height Control -->
          <div class="card-subtle" style="padding: 8px 11px;">
            <div class="row-between">
              <div>
                <div style="font-weight: 700; color: var(--text-strong); font-size: 12.5px;">
                  <span style="display: inline-block; width: 9px; height: 9px; border-radius: 2px; background: #26A69A; margin-inline-end: 6px;"></span>
                  Volume (${i18n.t('chart_volume_toggle')})
                </div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                  ${isFa ? 'نمایش هیستوگرام حجم معاملات در پنل مجزای پایین چارت' : 'Render transaction volume bars in dedicated bottom sub-pane'}
                </div>
              </div>
              <button
                class="btn btn-sm ${activeTab.showVolume !== false ? 'btn-primary' : ''}"
                data-action="toggle-volume"
              >
                ${activeTab.showVolume !== false ? (isFa ? 'فعال ✓' : 'Active ✓') : isFa ? 'افزودن' : 'Add'}
              </button>
            </div>

            ${
              activeTab.showVolume !== false
                ? `
              <div class="row-between" style="margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--border); font-size: 11.5px;">
                <span style="color: var(--text-muted);">${isFa ? 'نسبت ارتفاع پنل حجم:' : 'Volume Pane Height:'}</span>
                <div class="chip-group ltr-num">
                  <button class="chip ${volRatioPct <= 18 ? 'active' : ''}" data-action="set-volume-height" data-ratio="0.16">16%</button>
                  <button class="chip ${volRatioPct > 18 && volRatioPct <= 25 ? 'active' : ''}" data-action="set-volume-height" data-ratio="0.22">22%</button>
                  <button class="chip ${volRatioPct > 25 ? 'active' : ''}" data-action="set-volume-height" data-ratio="0.30">30%</button>
                </div>
              </div>
            `
                : ''
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

export const renderSubToolbar = renderBottomChartBar;
