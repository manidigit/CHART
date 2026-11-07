import { PriceFormatter } from '../algorithms/priceFormatter.js';
import { state } from '../core/store.js';

export function renderWatchlistContent(i18n) {
  const watchlist = state.symbols.filter((s) => s.inWatchlist);
  const cardsHtml = watchlist
    .map((s) => {
      const title = s.customTitle || i18n.t('symbol_' + s.symbolCode) || s.symbolCode;
      const pct = s.candles.length >= 2 ? PriceFormatter.formatSignedPct(s.candles[0].open, s.lastClose) : '+0.00%';
      const isBull = !pct.startsWith('-');
      return `
      <div class="card-subtle" style="margin-bottom: 8px;">
        <div class="row-between">
          <div>
            <div style="font-weight: 700; font-size: 14px;">${title}</div>
            <div class="ltr-num" style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              ${s.symbolCode} · ${s.activeProvider} (${s.timeframe})
            </div>
          </div>
          <div style="text-align: end;">
            <div class="ltr-num" style="font-weight: 700; font-size: 15px; color: var(--primary);">
              ${PriceFormatter.formatPrice(s.lastClose, s.decimals)}
            </div>
            <span class="pct-badge ${isBull ? 'bull' : 'bear'}">${pct}</span>
          </div>
        </div>
        <div class="btn-row" style="margin-top: 10px;">
          <button class="btn btn-sm" data-action="sync-symbol" data-symbol="${s.symbolCode}" ${s.isSyncing ? 'disabled' : ''}>
            ${s.isSyncing ? i18n.t('action_syncing') : i18n.t('action_sync_now')}
          </button>
          <button class="btn btn-sm btn-primary" data-action="open-chart" data-symbol="${s.symbolCode}">
            ${i18n.t('action_open_chart_view')}
          </button>
        </div>
      </div>
    `;
    })
    .join('');

  return `
    <div>
      <div class="row-between" style="margin-bottom: 12px;">
        <h4 style="margin: 0;">${i18n.t('watchlist_title')} (${watchlist.length})</h4>
        <button class="btn btn-sm btn-primary" data-action="sync-all">
          ${i18n.t('action_sync_all')}
        </button>
      </div>
      ${watchlist.length === 0 ? `<p style="color: var(--text-muted); font-size: 13px;">${i18n.t('watchlist_empty_hint')}</p>` : cardsHtml}
    </div>
  `;
}
