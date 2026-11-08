import { PriceFormatter } from '../algorithms/priceFormatter.js';
import { state } from '../core/store.js';

function getAssetBadge(symbolCode) {
  if (symbolCode === 'XAUUSD') return { label: 'Au', color: '#F59E0B' };
  if (symbolCode === 'SPOTBRENT' || symbolCode === 'BRENT_FUTURES') return { label: 'OIL', color: '#2962FF' };
  if (symbolCode === 'XAGUSD') return { label: 'Ag', color: '#94A3B8' };
  if (symbolCode === 'EURUSD') return { label: 'FX', color: '#26A69A' };
  return { label: String(symbolCode || '').slice(0, 3), color: '#2962FF' };
}

export function renderWatchlistContent(i18n) {
  const watchlist = state.symbols.filter((s) => s.inWatchlist);
  const cardsHtml = watchlist
    .map((s) => {
      const title = s.customTitle || i18n.t('symbol_' + s.symbolCode) || s.symbolCode;
      const pct = s.candles.length >= 2 ? PriceFormatter.formatSignedPct(s.candles[0].open, s.lastClose) : '+0.00%';
      const isBull = !pct.startsWith('-');
      const badge = getAssetBadge(s.symbolCode);
      return `
      <div class="card-subtle" data-action="open-chart" data-symbol="${s.symbolCode}" style="margin-bottom: 6px; padding: 10px 12px; cursor: pointer;">
        <div class="row-between">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <span class="ltr-num" style="width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; color: ${badge.color}; background: ${badge.color}24; border: 1px solid ${badge.color}55; flex-shrink: 0;">
              ${badge.label}
            </span>
            <div style="min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="ltr-num" style="font-weight: 800; font-size: 13.5px;">${s.symbolCode}</span>
                <span class="ltr-num" style="font-size: 10px; padding: 1px 5px; border-radius: 4px; background: var(--surface); color: var(--text-muted); border: 1px solid var(--border);">${s.activeProvider}</span>
              </div>
              <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${title}
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            <div style="text-align: end;">
              <div class="ltr-num" style="font-weight: 700; font-size: 14px; color: var(--text);">
                ${PriceFormatter.formatPrice(s.lastClose, s.decimals)}
              </div>
              <span class="pct-badge ltr-num ${isBull ? 'bull' : 'bear'}">${pct}</span>
            </div>
            <button class="btn btn-sm btn-icon" data-action="sync-symbol" data-symbol="${s.symbolCode}" title="${i18n.t('action_sync_now')}" ${s.isSyncing ? 'disabled' : ''}>
              ↻
            </button>
          </div>
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
