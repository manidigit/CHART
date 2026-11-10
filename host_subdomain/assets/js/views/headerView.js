import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.28.6';
import { state } from '../core/store.js?v=1.28.6';

export function renderTopHeaderBar(activeTab, i18n) {
  const sym = activeTab
    ? state.symbols.find((s) => s.symbolCode === activeTab.symbolCode)
    : state.symbols[0];

  const allowedTfs =
    activeTab && activeTab.provider === 'eia_brent_spot' ? ['D1'] : ['M15', 'H1', 'H4', 'D1'];

  const tfButtons = allowedTfs
    .map((tf) => {
      const isAct = activeTab && activeTab.timeframe === tf;
      return `<button class="tv-tool-btn ltr-num ${isAct ? 'active' : ''}" data-action="set-timeframe" data-tf="${tf}">${PriceFormatter.displayTimeframeLabel(tf)}</button>`;
    })
    .join('');

  const tabsHtml = state.openTabs
    .map((t) => {
      const isAct = t.tabId === state.activeTabId;
      return `
        <div class="chart-tab ltr-num ${isAct ? 'active' : ''}" data-action="select-tab" data-tab-id="${t.tabId}">
          <span>${t.symbolCode}</span>
          <span style="opacity: 0.72; font-size: 10px;">${PriceFormatter.displayTimeframeLabel(t.timeframe)}</span>
          ${
            state.openTabs.length > 1
              ? `<span class="tab-close" data-action="close-tab" data-tab-id="${t.tabId}">✕</span>`
              : ''
          }
        </div>
      `;
    })
    .join('');

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

  return `
    <header class="tv-topbar" dir="ltr">
      <div class="tv-topbar-left">
        <div class="tv-brand">
          <div class="tv-logo">CI</div>
        </div>

        <button class="tv-symbol-btn ltr-num" data-action="open-active-symbol-overview" title="Symbol Overview & Seasonals">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>${sym ? sym.symbolCode : 'SPOTBRENT'}</span>
        </button>

        <div class="tab-strip">
          ${tabsHtml}
        </div>

        <button class="tv-tool-btn" data-action="open-add-symbol-modal" title="${i18n.t('settings_add_custom_symbol')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        </button>

        <div class="tv-divider"></div>

        <div style="display: flex; align-items: center; gap: 2px;">
          ${tfButtons}
        </div>

        <div class="tv-divider"></div>

        <div style="display: flex; align-items: center; gap: 2px;">
          <button class="tv-tool-btn ${activeTab && activeTab.chartType !== 'line' ? 'active' : ''}" data-action="set-chart-type" data-type="candles" title="${i18n.t('chart_type_candles')}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4v16"/><rect x="6" y="8" width="6" height="8" rx="1"/><path d="M17 3v18"/><rect x="14" y="7" width="6" height="9" rx="1"/></svg>
          </button>
          <button class="tv-tool-btn ${activeTab && activeTab.chartType === 'line' ? 'active' : ''}" data-action="set-chart-type" data-type="line" title="${i18n.t('chart_type_line')}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>
          </button>
        </div>

        <div class="tv-divider"></div>

        <button class="tv-tool-btn ltr-num ${activeTab && activeTab.showSma20 ? 'active' : ''}" data-action="toggle-sma20" title="Simple Moving Average (20)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          <span>SMA 20</span>
        </button>

        <button class="tv-tool-btn ltr-num ${activeTab && activeTab.showVolume !== false ? 'active' : ''}" data-action="toggle-volume" title="${i18n.t('chart_volume_toggle')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
          <span>Vol</span>
        </button>

        ${
          activeTab && activeTab.showVolume !== false
            ? `<button class="tv-tool-btn ltr-num" data-action="cycle-volume-height" title="${i18n.t('chart_volume_resize')}">
                 ↕ ${Math.round((activeTab.volumePaneRatio || 0.22) * 100)}%
               </button>`
            : ''
        }
      </div>

      <div class="tv-topbar-right">
        ${
          sym
            ? `<div class="ltr-num" style="display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 4px; background: var(--bg); border: 1px solid var(--border); font-size: 11px;">
                 <span style="width: 7px; height: 7px; border-radius: 50%; background: ${statusDotColor}; display: inline-block;"></span>
                 <span style="color: var(--text-muted); font-weight: 600;">${sym.activeProvider}</span>
                 <span style="color: ${statusDotColor}; font-weight: 600;">${statusText}</span>
               </div>`
            : ''
        }

        <button class="tv-tool-btn" data-action="sync-active-tab" title="${i18n.t('action_sync_now')}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
        </button>

        <button class="tv-tool-btn ${state.activeModal === 'prediction' ? 'active' : ''}" data-action="open-modal" data-modal="prediction" title="${i18n.t('nav_prediction')}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
          <span>${i18n.t('nav_prediction')}</span>
        </button>

        <button class="tv-tool-btn ${state.activeModal === 'settings' ? 'active' : ''}" data-action="open-modal" data-modal="settings" title="${i18n.t('nav_settings')}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
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
  const ranges = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'All'];
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
        <span id="tv-live-utc-clock" class="ltr-num" style="color: var(--text-muted); font-size: 11.5px; margin-right: 6px;">
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

export const renderSubToolbar = renderBottomChartBar;
