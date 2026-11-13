import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.38.0';
import { state, escapeHtml } from '../core/store.js?v=1.38.0';
import { renderSymbolBadge } from './watchlistView.js?v=1.38.1';

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
      (activeTab.showSupertrend ? 1 : 0) +
      (activeTab.showVwap ? 1 : 0) +
      (activeTab.showBollinger ? 1 : 0) +
      (activeTab.showOverlayMacd ? 1 : 0) +
      (activeTab.showVolume !== false ? 1 : 0) +
      (activeTab.showRsi14 ? 1 : 0) +
      (activeTab.showMacd ? 1 : 0) +
      (activeTab.showAtr14 ? 1 : 0) +
      (activeTab.showSmcStructure ? 1 : 0) +
      (activeTab.showFvg ? 1 : 0) +
      (activeTab.showVolumeProfile ? 1 : 0)
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

  const renderToggleRow = (color, title, subtitle, isActive, actionName) => `
    <div class="card-subtle row-between" style="padding: 8px 11px;">
      <div>
        <div style="font-weight: 700; color: var(--text-strong); font-size: 12.5px;">
          <span style="display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: ${color}; margin-inline-end: 6px;"></span>
          ${title}
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
      <div class="modal-card" style="max-width: 560px; max-height: 86vh; display: flex; flex-direction: column;" dir="${isFa ? 'rtl' : 'ltr'}">
        <div class="tv-modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
            <span>${isFa ? 'اندیکاتورها، اسیلاتورهای چندپنلی و ساختار بازار (SMC)' : 'Indicators, Multi-Pane Oscillators & SMC'}</span>
          </div>
          <button class="btn btn-sm btn-icon" data-action="close-modal">✕</button>
        </div>

        <div class="tv-modal-body" style="display: flex; flex-direction: column; gap: 8px; overflow-y: auto; padding-bottom: 14px;">
          <div style="font-size: 11px; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 0.4px; margin-top: 2px;">
            ${isFa ? '۱. اندیکاتورهای روند روی چارت اصلی (Main Pane Overlays)' : '1. Main Chart Trend & Volatility Overlays'}
          </div>
          ${renderToggleRow('#F59E0B', 'SMA 20', isFa ? 'میانگین متحرک ساده ۲۰ دوره‌ای' : '20-Period Simple Moving Average', activeTab.showSma20, 'toggle-sma20')}
          ${renderToggleRow('#38BDF8', 'SMA 50', isFa ? 'میانگین متحرک ساده ۵۰ دوره‌ای' : '50-Period Simple Moving Average', activeTab.showSma50, 'toggle-sma50')}
          ${renderToggleRow('#EC4899', 'SMA 200', isFa ? 'میانگین متحرک ساده ۲۰۰ دوره‌ای (روند کلان)' : '200-Period Institutional Simple Moving Average', activeTab.showSma200, 'toggle-sma200')}
          ${renderToggleRow('#10B981', 'EMA 20', isFa ? 'میانگین متحرک نمایی سریع ۲۰ دوره‌ای' : '20-Period Fast Exponential Moving Average', activeTab.showEma20, 'toggle-ema20')}
          ${renderToggleRow('#06B6D4', 'EMA 50', isFa ? 'میانگین متحرک نمایی ۵۰ دوره‌ای' : '50-Period Exponential Moving Average', activeTab.showEma50, 'toggle-ema50')}
          ${renderToggleRow('#26A69A', 'Supertrend (10, 3)', isFa ? 'خط روند هوشمند سوپرترند (سبز صعودی / قرمز نزولی)' : 'Dynamic ATR Supertrend trailing stop (Period 10, Mult 3)', activeTab.showSupertrend, 'toggle-supertrend')}
          ${renderToggleRow('#EAB308', 'Session VWAP', isFa ? 'میانگین قیمت وزنی حجم (تراز سشن روزانه UTC)' : 'Session-Anchored Volume Weighted Average Price', activeTab.showVwap, 'toggle-vwap')}
          ${renderToggleRow('#A855F7', `Bollinger Bands (${state.chartPreferences.bollingerPeriod || 20}, ${state.chartPreferences.bollingerStdDev || 2})`, isFa ? 'کانال نوسان بولینگر با قابلیت تنظیم دوره (Period) و انحراف معیار (StdDev)' : 'Configurable Bollinger volatility channel (Period & StdDev)', activeTab.showBollinger, 'toggle-bollinger')}
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
          ${renderToggleRow('#2962FF', isFa ? 'MACD Classic (روی چارت اصلی — Overlay)' : 'MACD Classic (Main Chart Overlay)', isFa ? 'نمایش مکدی کلاسیک (۱۲، ۲۶، ۹) مستقیماً روی خود چارت قیمت بدون ایجاد پنل جداگانه در پایین' : 'Render Classic MACD (12, 26, 9) directly overlaid on the main price canvas', activeTab.showOverlayMacd, 'toggle-overlay-macd')}

          <div style="font-size: 11px; font-weight: 800; color: var(--gold); text-transform: uppercase; letter-spacing: 0.4px; margin-top: 8px;">
            ${isFa ? '۲. ساختار بازار هوشمند (SMC) و پروفایل حجم (Volume Profile)' : '2. Smart Money Concepts (SMC) & Volume Profile'}
          </div>
          ${renderToggleRow('#26A69A', 'BOS / CHoCH & EQH / EQL', isFa ? 'تشخیص خودکار شکست ساختار (BOS)، تغییر کاراکتر (CHoCH) و نقدینگی سقف/کف برابر' : 'Auto Market Structure Breaks (BOS/CHoCH) & Equal Highs/Lows liquidity pools', activeTab.showSmcStructure, 'toggle-smc-structure')}
          ${renderToggleRow('#10B981', 'Fair Value Gaps (FVG / Imbalance)', isFa ? 'ترسیم خودکار باکس گپ‌های ارزش منصفانه صعودی و نزولی تسویه‌نشده' : 'Highlight unmitigated 3-candle Bullish & Bearish Fair Value Gaps', activeTab.showFvg, 'toggle-fvg')}
          ${renderToggleRow('#F59E0B', 'Volume Profile (VRVP — POC / VAH / VAL)', isFa ? 'پروفایل حجم محدوده قابل مشاهده به همراه خطوط POC، VAH و VAL (۷۰٪)' : 'Visible Range Volume Profile histogram with Point of Control & 70% Value Area', activeTab.showVolumeProfile, 'toggle-volume-profile')}

          <div style="font-size: 11px; font-weight: 800; color: #38BDF8; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 8px;">
            ${isFa ? '۳. پنل‌های پایینی همگام (Multi-Pane Sub-Charts)' : '3. Synchronized Sub-Pane Oscillators'}
          </div>
          ${renderToggleRow('#A855F7', 'RSI (14)', isFa ? 'شاخص قدرت نسبی ۱۴ دوره‌ای با سطوح اشباع ۳۰ و ۷۰ در پنل پایین' : '14-Period Wilder Relative Strength Index with 30/70 levels', activeTab.showRsi14, 'toggle-rsi14')}
          ${renderToggleRow('#2962FF', 'MACD (12, 26, 9)', isFa ? 'خطوط مکدی، سیگنال و هیستوگرام مومنتوم در پنل پایین' : 'MACD Line, Signal Line, and Momentum Histogram sub-pane', activeTab.showMacd, 'toggle-macd')}
          ${renderToggleRow('#F43F5E', 'ATR (14)', isFa ? 'میانگین دامنه نوسان واقعی ۱۴ دوره‌ای در پنل مجزای پایین' : '14-Period Wilder Average True Range volatility sub-pane', activeTab.showAtr14, 'toggle-atr14')}

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
