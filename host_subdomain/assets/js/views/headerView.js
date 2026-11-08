import { PriceFormatter } from '../algorithms/priceFormatter.js';
import { state, isOtcWeekendClosedUtc } from '../core/store.js';

export function renderTerminalTopBar(
  activeTab,
  latestCandle,
  priceDiff,
  pct,
  isBull,
  tfChipsHtml,
  dateRangeChipsHtml,
  tabsHtml,
  i18n
) {
  const userLabel = state.ownerUsername || state.ownerEmail || 'Owner';
  const symTitle = activeTab
    ? activeTab.customTitle || i18n.t(`symbol_${activeTab.symbolCode}`) || activeTab.symbolCode
    : '';
  let statusLabel = i18n.t('chart_status_cached');
  let statusDotCol = 'var(--text-muted)';
  if (activeTab) {
    if (activeTab.isLoading) {
      statusLabel = i18n.t('chart_status_syncing');
      statusDotCol = 'var(--primary)';
    } else if (activeTab.hasError) {
      statusLabel = i18n.t('chart_status_error');
      statusDotCol = 'var(--bear)';
    } else if (isOtcWeekendClosedUtc(Date.now(), activeTab.symbolCode)) {
      statusLabel = i18n.t('chart_status_market_closed');
      statusDotCol = 'var(--gold)';
    } else if (latestCandle && latestCandle.open_time_utc_ms) {
      const ageMs = Math.max(0, Date.now() - Number(latestCandle.open_time_utc_ms));
      const stepMs = PriceFormatter.stepMilliseconds(activeTab.timeframe || 'M15');
      if (ageMs <= stepMs * 2) {
        statusLabel = i18n.t('chart_status_live');
        statusDotCol = 'var(--bull)';
      } else if (ageMs <= stepMs * 16) {
        statusLabel = i18n.t('chart_status_delayed');
        statusDotCol = 'var(--gold)';
      } else {
        statusLabel = i18n.t('chart_status_cached');
        statusDotCol = 'var(--text-muted)';
      }
    }
  }

  return `
    <header class="terminal-topbar">
      <div class="topbar-left">
        <div class="brand-badge">
          <span class="live-dot" style="background: ${statusDotCol}; box-shadow: 0 0 8px ${statusDotCol};"></span>
          <span>CHART</span>
        </div>

        ${
          activeTab
            ? `
          <div class="symbol-selector-wrap" data-action="toggle-desktop-panel" data-panel="watchlist" title="${symTitle}">
            <span class="ticker-name">${activeTab.symbolCode}</span>
            <span class="ticker-sub">${activeTab.provider}</span>
            <span class="ticker-price ltr-num">${PriceFormatter.formatPrice(latestCandle.close, activeTab.decimals)}</span>
            <span class="pct-badge ltr-num ${isBull ? 'bull' : 'bear'}">${priceDiff} (${pct})</span>
            <span class="status-pill" style="color: ${statusDotCol};">${statusLabel}</span>
          </div>
        `
            : ''
        }

        <div class="tab-bar" style="max-width: 340px;">
          ${tabsHtml}
        </div>
      </div>

      <div class="topbar-right">
        <button class="btn btn-sm btn-icon" data-action="sync-symbol" data-symbol="${activeTab ? activeTab.symbolCode : ''}" title="${i18n.t('action_sync_now')}">
          ↻
        </button>
        <button class="btn btn-sm btn-icon" data-action="toggle-fullscreen" title="${i18n.t('action_fullscreen')}">
          ⛶
        </button>
        <button class="btn btn-sm desktop-only-btn ${state.desktopSidePanel === 'watchlist' ? 'btn-primary' : ''}" data-action="toggle-desktop-panel" data-panel="watchlist">
          ${i18n.t('nav_watchlist')}
        </button>
        <button class="btn btn-sm desktop-only-btn ${state.desktopSidePanel === 'analysis' ? 'btn-primary' : ''}" data-action="toggle-desktop-panel" data-panel="analysis">
          ${i18n.t('nav_analysis')}
        </button>
        <button class="btn btn-sm desktop-only-btn ${state.desktopSidePanel === 'settings' ? 'btn-primary' : ''}" data-action="toggle-desktop-panel" data-panel="settings">
          ${i18n.t('nav_settings')}
        </button>
        <span class="chip ltr-num user-chip" title="${state.ownerEmail || userLabel}">
          👤 ${userLabel}
        </span>
        <button class="btn btn-sm" style="color: var(--bear); border-color: var(--bear);" data-action="sign-out" title="${i18n.t('action_sign_out')}">
          ${i18n.t('action_logout_short')}
        </button>
      </div>
    </header>

    <div class="unified-chart-subbar">
      <div class="subbar-group">
        <span class="subbar-label">${i18n.t('chart_timeframe_label')}</span>
        ${tfChipsHtml}
      </div>

      <div class="subbar-divider"></div>

      <div class="subbar-group">
        <span class="subbar-label">${i18n.t('chart_date_range_label')}</span>
        ${dateRangeChipsHtml}
      </div>

      <div class="subbar-divider"></div>

      <div class="subbar-group">
        <button class="chip ${activeTab && activeTab.chartType !== 'line' ? 'active' : ''}" data-action="set-chart-type" data-type="candlestick">
          🕯 ${i18n.t('chart_type_candles')}
        </button>
        <button class="chip ${activeTab && activeTab.chartType === 'line' ? 'active' : ''}" data-action="set-chart-type" data-type="line">
          📈 ${i18n.t('chart_type_line')}
        </button>
        <button class="chip ${activeTab && activeTab.showVolume !== false ? 'active' : ''}" data-action="toggle-volume" title="${i18n.t('chart_volume_toggle')}">
          📊 Vol
        </button>
        ${
          activeTab && activeTab.showVolume !== false
            ? `<button class="chip ltr-num" data-action="cycle-volume-height" title="${i18n.t('chart_volume_resize')}">↕ ${Math.round((activeTab.volumePaneRatio || 0.22) * 100)}%</button>`
            : ''
        }
        <button class="chip ltr-num ${activeTab && activeTab.showSma20 ? 'active' : ''}" data-action="toggle-sma20">
          ${i18n.t('chart_indicator_sma20')}
        </button>
        <button class="chip ${activeTab && activeTab.isAutoScaleY !== false ? 'active' : ''}" data-action="auto-scale-y">
          ${i18n.t('chart_auto_scale')}
        </button>
        <button class="chip" data-action="fit-content" title="${i18n.t('chart_fit_content')}">⤢</button>
        <button class="chip" data-action="reset-chart" title="${i18n.t('chart_reset_view')}">↦</button>
      </div>
    </div>
  `;
}
