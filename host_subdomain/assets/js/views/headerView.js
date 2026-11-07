import { PriceFormatter } from '../algorithms/priceFormatter.js';
import { state } from '../core/store.js';

export function renderTerminalTopBar(activeTab, latestCandle, pct, isBull, tfChipsHtml, tabsHtml, i18n) {
  return `
    <header class="terminal-topbar">
      <div class="topbar-left">
        <div class="brand-badge">
          <span class="live-dot"></span>
          <span>CHART</span>
        </div>

        <!-- Symbol & Price Info Pill -->
        ${
          activeTab
            ? `
          <div class="symbol-selector-wrap" data-action="toggle-desktop-panel" data-panel="watchlist">
            <span class="ticker-name">${activeTab.symbolCode}</span>
            <span class="ticker-price ltr-num">${PriceFormatter.formatPrice(latestCandle.close, activeTab.decimals)}</span>
            <span class="pct-badge ${isBull ? 'bull' : 'bear'}">${pct}</span>
          </div>
        `
            : ''
        }

        <!-- Open Chart Tabs -->
        <div class="tab-bar" style="max-width: 320px;">
          ${tabsHtml}
        </div>
      </div>

      <!-- Timeframe Controls -->
      <div class="topbar-controls">
        <div class="chip-group">
          ${tfChipsHtml}
        </div>
        <div class="chip-group" style="margin-inline-start: 6px;">
          <button class="chip ${activeTab && activeTab.chartType !== 'line' ? 'active' : ''}" data-action="set-chart-type" data-type="candlestick" title="${i18n.t('chart_type_candles')}">
             شمعی
          </button>
          <button class="chip ${activeTab && activeTab.chartType === 'line' ? 'active' : ''}" data-action="set-chart-type" data-type="line" title="${i18n.t('chart_type_line')}">
            خطی
          </button>
        </div>
      </div>

      <!-- Right Quick Actions -->
      <div class="topbar-right">
        <button class="btn btn-sm btn-icon" data-action="sync-symbol" data-symbol="${activeTab ? activeTab.symbolCode : ''}" title="${i18n.t('action_sync_now')}">
          ↻
        </button>
        <button class="btn btn-sm btn-icon" data-action="toggle-fullscreen" title="${i18n.t('action_fullscreen')}">
          ⛶
        </button>
        <button class="btn btn-sm ${state.desktopSidePanel === 'watchlist' ? 'btn-primary' : ''}" data-action="toggle-desktop-panel" data-panel="watchlist">
          ${i18n.t('nav_watchlist')}
        </button>
        <button class="btn btn-sm ${state.desktopSidePanel === 'analysis' ? 'btn-primary' : ''}" data-action="toggle-desktop-panel" data-panel="analysis">
          ${i18n.t('nav_analysis')}
        </button>
        <button class="btn btn-sm ${state.desktopSidePanel === 'settings' ? 'btn-primary' : ''}" data-action="toggle-desktop-panel" data-panel="settings">
          ${i18n.t('nav_settings')}
        </button>
      </div>
    </header>
  `;
}
