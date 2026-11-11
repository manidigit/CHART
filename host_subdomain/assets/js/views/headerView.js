import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.35.0';
import { state, resolvePriceBasis } from '../core/store.js?v=1.35.0';
import { renderSymbolBadge } from './watchlistView.js?v=1.35.0';

export function renderTopHeaderBar(activeTab, i18n) {
  const sym = activeTab
    ? state.symbols.find((s) => s.symbolCode === activeTab.symbolCode)
    : state.symbols[0];

  const allowedTfs =
    activeTab && (activeTab.provider === 'eia_brent_spot' || activeTab.provider === 'stooq')
      ? ['D1', 'W1']
      : ['M15', 'H1', 'H4', 'D1', 'W1'];

  const tfButtons = allowedTfs
    .map((tf) => {
      const isAct = activeTab && activeTab.timeframe === tf;
      return `<button class="tv-tool-btn ltr-num ${isAct ? 'active' : ''}" data-action="set-timeframe" data-tf="${tf}">${PriceFormatter.displayTimeframeLabel(tf)}</button>`;
    })
    .join('');

  const activeIndicatorsCount = activeTab
    ? (activeTab.showSma20 ? 1 : 0) +
      (activeTab.showEma50 ? 1 : 0) +
      (activeTab.showBollinger ? 1 : 0) +
      (activeTab.showVolume !== false ? 1 : 0)
    : 1;

  let statusDotColor = 'var(--bull)';
  let statusText = i18n.t('chart_status_live');
  if (sym && sym.isSyncing) {
    statusDotColor = 'var(--gold)';
    statusText = i18n.t('chart_status_syncing');
  } else if (sym && sym.syncError) {
    statusDotColor = 'var(--bear)';
    statusText = i18n.t('chart_status_error');
  } else if (sym && sym.candles && sym.candles.length > 0) {
    const lastSec = Number(sym.candles[sym.candles.length - 1].openTimeSec || 0);
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - lastSec > 86400 * 2) {
      statusDotColor = 'var(--text-muted)';
      statusText = i18n.t('chart_status_market_closed');
    } else if (nowSec - lastSec > 3600 * 2) {
      statusDotColor = 'var(--gold)';
      statusText = i18n.t('chart_status_cached');
    }
  }

  const isFa = i18n.getCurrentLanguage() === 'fa';
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
      return `
        <div
          class="tv-open-tab-chip ltr-num ${isSelected ? 'active' : ''}"
          data-action="select-tab"
          data-tab-id="${t.tabId}"
          title="${t.symbolCode} · ${tfLabel} (${t.provider || 'tvdatafeed'})"
        >
          ${renderSymbolBadge(t.symbolCode, 17)}
          <span class="tv-open-tab-sym">${t.symbolCode}</span>
          <span class="tv-open-tab-tf">${tfLabel}</span>
          ${
            canClose
              ? `<button type="button" class="tv-open-tab-close" data-action="close-tab" data-tab-id="${t.tabId}" title="${i18n.t('chart_close_tab')}">✕</button>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  const priceBasis =
    (sym && sym.priceBasis) ||
    resolvePriceBasis(activeCode, sym ? sym.activeProvider : 'tvdatafeed');
  const rawSyncMode = (sym && sym.lastSyncMode) || 'DB_CACHE_HIT';
  const syncModeBadge =
    rawSyncMode === 'DELTA_SYNC'
      ? 'DELTA'
      : rawSyncMode === 'INITIAL_BACKFILL'
        ? 'SEED'
        : 'CACHE';

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
        ${
          sym
            ? `<div class="ltr-num" title="Provider: ${sym.activeProvider} | Price Basis: ${priceBasis} | Sync: ${rawSyncMode}" style="display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 4px; background: var(--bg); border: 1px solid var(--border); font-size: 10.5px;">
                 <span style="width: 7px; height: 7px; border-radius: 50%; background: ${statusDotColor}; display: inline-block;"></span>
                 <span style="color: var(--text-strong); font-weight: 700;">${sym.activeProvider}</span>
                 <span style="color: var(--text-muted);">·</span>
                 <span style="color: var(--primary); font-weight: 600;">${priceBasis}</span>
                 <span style="color: var(--text-muted);">·</span>
                 <span style="color: var(--text-muted); font-weight: 600;">${syncModeBadge}</span>
                 <span style="color: var(--text-muted);">·</span>
                 <span style="color: ${statusDotColor}; font-weight: 600;">${statusText}</span>
               </div>`
            : ''
        }

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

  const isLog = Boolean(activeTab.isLogScale ?? state.chartPreferences.isLogScale);
  const isAuto =
    Number(activeTab.priceScaleFactor || 1) === 1 &&
    Number(activeTab.verticalPriceOffset || 0) === 0;
  const nowUtcStr = new Date().toISOString().slice(11, 19) + ' UTC';

  return `
    <div class="tv-bottom-bar" dir="ltr">
      <div class="tv-bottom-ranges">
        ${rangeButtons}
        <div class="tv-divider"></div>
        <button class="tv-range-btn" data-action="fit-content" title="${i18n.t('chart_fit_content')}">⤢</button>
        <button class="tv-range-btn" data-action="reset-view" title="${i18n.t('chart_reset_view')}">⏭</button>
      </div>

      <div class="tv-bottom-scales">
        <span id="tv-live-utc-clock" class="ltr-num" style="color: var(--text-muted); font-size: 11px; margin-right: 4px; white-space: nowrap;">
          ${nowUtcStr}
        </span>
        <div class="tv-divider"></div>
        <button class="tv-scale-btn ltr-num ${isLog ? 'active' : ''}" data-action="toggle-log-scale" title="${i18n.t('tv_log_scale')}">
          log
        </button>
        <button class="tv-scale-btn ltr-num ${isAuto ? 'active' : ''}" data-action="reset-price-scale" title="${i18n.t('chart_auto_scale')}">
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

  return `
    <div class="modal-backdrop" data-action="close-modal-backdrop">
      <div class="modal-card" style="max-width: 480px;" dir="${isFa ? 'rtl' : 'ltr'}">
        <div class="tv-modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
            <span>${isFa ? 'اندیکاتورها و ابزارهای تحلیلی چارت' : 'Indicators & Chart Studies'}</span>
          </div>
          <button class="btn btn-sm btn-icon" data-action="close-modal">✕</button>
        </div>

        <div class="tv-modal-body" style="display: flex; flex-direction: column; gap: 10px;">
          <!-- 1. SMA 20 -->
          <div class="card-subtle row-between">
            <div>
              <div style="font-weight: 700; color: var(--text-strong); font-size: 13px;">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #F59E0B; margin-inline-end: 6px;"></span>
                SMA 20 (Simple Moving Average)
              </div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                ${isFa ? 'میانگین متحرک ساده ۲۰ دوره‌ای روی قیمت پایانی کندل‌ها' : '20-Period Simple Moving Average on Close price'}
              </div>
            </div>
            <button
              class="btn btn-sm ${activeTab.showSma20 ? 'btn-primary' : ''}"
              data-action="toggle-sma20"
            >
              ${activeTab.showSma20 ? (isFa ? 'فعال ✓' : 'Active ✓') : isFa ? 'افزودن' : 'Add'}
            </button>
          </div>

          <!-- 2. EMA 50 -->
          <div class="card-subtle row-between">
            <div>
              <div style="font-weight: 700; color: var(--text-strong); font-size: 13px;">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #06B6D4; margin-inline-end: 6px;"></span>
                EMA 50 (Exponential Moving Average)
              </div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                ${isFa ? 'میانگین متحرک نمایی ۵۰ دوره‌ای جهت تشخیص روند میان‌مدت' : '50-Period Exponential Moving Average for trend direction'}
              </div>
            </div>
            <button
              class="btn btn-sm ${activeTab.showEma50 ? 'btn-primary' : ''}"
              data-action="toggle-ema50"
            >
              ${activeTab.showEma50 ? (isFa ? 'فعال ✓' : 'Active ✓') : isFa ? 'افزودن' : 'Add'}
            </button>
          </div>

          <!-- 3. Bollinger Bands (20, 2) -->
          <div class="card-subtle row-between">
            <div>
              <div style="font-weight: 700; color: var(--text-strong); font-size: 13px;">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #A855F7; margin-inline-end: 6px;"></span>
                Bollinger Bands (20, 2)
              </div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                ${isFa ? 'کانال نوسان بولینگر (دوره ۲۰ و انحراف معیار ۲)' : '20-Period Bollinger volatility channel (±2σ)'}
              </div>
            </div>
            <button
              class="btn btn-sm ${activeTab.showBollinger ? 'btn-primary' : ''}"
              data-action="toggle-bollinger"
            >
              ${activeTab.showBollinger ? (isFa ? 'فعال ✓' : 'Active ✓') : isFa ? 'افزودن' : 'Add'}
            </button>
          </div>

          <!-- 4. Volume Pane & Height Control -->
          <div class="card-subtle">
            <div class="row-between">
              <div>
                <div style="font-weight: 700; color: var(--text-strong); font-size: 13px;">
                  <span style="display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: #26A69A; margin-inline-end: 6px;"></span>
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
              <div class="row-between" style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border); font-size: 11.5px;">
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
