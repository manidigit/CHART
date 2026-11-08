import { PriceFormatter } from '../algorithms/priceFormatter.js';
import { state } from '../core/store.js';

export function renderTopHeaderBar(activeTab, i18n) {
  const sym = activeTab
    ? state.symbols.find((s) => s.symbolCode === activeTab.symbolCode)
    : state.symbols[0];
  const lastClose = sym ? Number(sym.lastClose || 0) : 0;
  const openRef =
    sym && sym.candles && sym.candles.length >= 2
      ? Number(sym.candles[sym.candles.length - 2].close)
      : lastClose;
  const diff = lastClose - openRef;
  const pctStr = openRef > 0 ? PriceFormatter.formatSignedPct(openRef, lastClose) : '+0.00%';
  const isBull = diff >= 0;

  let statusKey = 'chart_status_live';
  let statusColor = 'var(--bull)';
  if (sym && sym.isSyncing) {
    statusKey = 'chart_status_syncing';
    statusColor = 'var(--gold)';
  } else if (sym && sym.syncError) {
    statusKey = 'chart_status_error';
    statusColor = 'var(--bear)';
  } else if (sym && sym.candles && sym.candles.length > 0) {
    const lastSec = Number(sym.candles[sym.candles.length - 1].openTimeSec || 0);
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - lastSec > 86400 * 2) {
      statusKey = 'chart_status_market_closed';
      statusColor = 'var(--text-muted)';
    } else if (nowSec - lastSec > 3600 * 2) {
      statusKey = 'chart_status_cached';
      statusColor = 'var(--gold)';
    }
  }

  const tabsHtml = state.openTabs
    .map((t) => {
      const isAct = t.tabId === state.activeTabId;
      return `
        <div class="chart-tab ltr-num ${isAct ? 'active' : ''}" data-action="select-tab" data-tab-id="${t.tabId}">
          <span>${t.symbolCode}</span>
          <span style="opacity: 0.75; font-size: 10px;">${PriceFormatter.displayTimeframeLabel(t.timeframe)}</span>
          <span data-action="close-tab" data-tab-id="${t.tabId}" style="margin-inline-start: 4px; opacity: 0.65; cursor: pointer;">✕</span>
        </div>
      `;
    })
    .join('');

  return `
    <header class="tv-topbar">
      <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
        <div class="tv-brand">
          <div class="tv-logo">CI</div>
          <strong class="ltr-num" style="font-size: 13px; letter-spacing: 0.3px;">CHART</strong>
        </div>

        ${
          sym
            ? `
          <div style="display: flex; align-items: center; gap: 8px; padding: 2px 8px; border-radius: 4px; background: var(--bg); border: 1px solid var(--border);">
            <strong class="ltr-num" style="font-size: 13px; color: var(--text);">${sym.symbolCode}</strong>
            <span class="ltr-num" style="font-size: 10.5px; color: var(--text-muted);">${sym.activeProvider}</span>
            <strong class="ltr-num" style="font-size: 13px; color: var(--primary);">${PriceFormatter.formatPrice(lastClose, sym.decimals)}</strong>
            <span class="ltr-num" style="font-size: 11px; font-weight: 700; padding: 1px 5px; border-radius: 3px; color: ${isBull ? 'var(--bull)' : 'var(--bear)'}; background: ${isBull ? 'rgba(38, 166, 154, 0.14)' : 'rgba(239, 83, 80, 0.14)'};">
              ${diff >= 0 ? '+' : ''}${PriceFormatter.formatPrice(diff, sym.decimals)} (${pctStr})
            </span>
            <span style="font-size: 10.5px; padding: 1px 6px; border-radius: 3px; border: 1px solid ${statusColor}; color: ${statusColor};">
              ${i18n.t(statusKey)}
            </span>
          </div>
        `
            : ''
        }

        <div class="tab-strip">
          ${tabsHtml}
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 5px; flex-shrink: 0;">
        <button class="btn btn-sm btn-icon" data-action="sync-active-tab" title="${i18n.t('action_sync_now')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
        </button>
        <button class="btn btn-sm btn-icon" data-action="toggle-fullscreen" title="${i18n.t('action_fullscreen')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        </button>
        <button class="btn btn-sm ${state.isSideDrawerOpen && state.activeNav === 'watchlist' ? 'btn-primary' : ''}" data-action="open-drawer" data-nav="watchlist">
          ${i18n.t('nav_watchlist')}
        </button>
        <button class="btn btn-sm ${state.isSideDrawerOpen && state.activeNav === 'prediction' ? 'btn-primary' : ''}" data-action="open-drawer" data-nav="prediction">
          ${i18n.t('nav_prediction')}
        </button>
        <button class="btn btn-sm ${state.isSideDrawerOpen && state.activeNav === 'settings' ? 'btn-primary' : ''}" data-action="open-drawer" data-nav="settings">
          ${i18n.t('nav_settings')}
        </button>
        <button class="btn btn-sm" data-action="open-drawer" data-nav="settings" title="${i18n.t('settings_group_account')}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span class="ltr-num">${state.ownerUsername || 'Owner'}</span>
        </button>
        <button class="btn btn-sm" style="color: var(--bear); border-color: rgba(239, 83, 80, 0.45);" data-action="sign-out" title="${i18n.t('action_sign_out')}">
          ${i18n.t('action_logout_short')}
        </button>
      </div>
    </header>
  `;
}

export function renderSubToolbar(activeTab, i18n) {
  if (!activeTab) return '';
  const allowedTfs =
    activeTab.provider === 'eia_brent_spot' ? ['D1'] : ['M15', 'H1', 'H4', 'D1'];
  const tfButtons = allowedTfs
    .map((tf) => {
      const isAct = activeTab.timeframe === tf;
      return `<button class="chip ltr-num ${isAct ? 'active' : ''}" data-action="set-timeframe" data-tf="${tf}">${PriceFormatter.displayTimeframeLabel(tf)}</button>`;
    })
    .join('');

  const ranges = ['1D', '5D', '1M', '3M', 'YTD', '1Y', 'All'];
  const rangeButtons = ranges
    .map((rk) => {
      const isAct = activeTab.selectedRangePreset === rk;
      return `<button class="chip ltr-num ${isAct ? 'active' : ''}" data-action="set-date-range" data-range="${rk}">${rk}</button>`;
    })
    .join('');

  const isLog = Boolean(activeTab.isLogScale ?? state.chartPreferences.isLogScale);

  return `
    <div class="tv-subbar">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 11px; color: var(--text-muted);">${i18n.t('chart_timeframe_label')}</span>
        <div class="chip-group">${tfButtons}</div>

        <span style="font-size: 11px; color: var(--text-muted); margin-inline-start: 4px;">${i18n.t('chart_date_range_label')}</span>
        <div class="chip-group">${rangeButtons}</div>

        <div class="chip-group" style="margin-inline-start: 4px;">
          <button class="chip ${activeTab.chartType !== 'line' ? 'active' : ''}" data-action="set-chart-type" data-type="candles">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5v14"/><rect x="6" y="8" width="6" height="8" rx="1"/><path d="M17 3v18"/><rect x="14" y="7" width="6" height="9" rx="1"/></svg>
            <span>${i18n.t('chart_type_candles')}</span>
          </button>
          <button class="chip ${activeTab.chartType === 'line' ? 'active' : ''}" data-action="set-chart-type" data-type="line">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>
            <span>${i18n.t('chart_type_line')}</span>
          </button>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 5px;">
        <button class="btn btn-sm ${activeTab.showVolume !== false ? 'btn-primary' : ''}" data-action="toggle-volume" title="${i18n.t('chart_volume_toggle')}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
          <span>Vol</span>
        </button>
        ${
          activeTab.showVolume !== false
            ? `<button class="btn btn-sm ltr-num" data-action="cycle-volume-height" title="${i18n.t('chart_volume_resize')}">
                ↕ ${Math.round((activeTab.volumePaneRatio || 0.22) * 100)}%
              </button>`
            : ''
        }
        <button class="btn btn-sm ltr-num ${activeTab.showSma20 ? 'btn-primary' : ''}" data-action="toggle-sma20">
          SMA 20
        </button>
        <button class="btn btn-sm ltr-num ${isLog ? 'btn-primary' : ''}" data-action="toggle-log-scale" title="${i18n.t('tv_log_scale')}">
          Log
        </button>
        <button class="btn btn-sm ${Number(activeTab.priceScaleFactor || 1) === 1 && Number(activeTab.verticalPriceOffset || 0) === 0 ? 'btn-primary' : ''}" data-action="reset-price-scale">
          ${i18n.t('chart_auto_scale')}
        </button>
        <button class="btn btn-sm" data-action="fit-content" title="${i18n.t('chart_fit_content')}">⤢</button>
        <button class="btn btn-sm" data-action="reset-view" title="${i18n.t('chart_reset_view')}">⏭</button>
      </div>
    </div>
  `;
}
