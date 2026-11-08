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
      const openRef = s.candles.length >= 2 ? Number(s.candles[s.candles.length - 2].close) : Number(s.lastClose || 0);
      const lastClose = Number(s.lastClose || 0);
      const diff = lastClose - openRef;
      const pct = openRef > 0 ? PriceFormatter.formatSignedPct(openRef, lastClose) : '+0.00%';
      const isBull = diff >= 0;
      const sign = isBull ? '+' : '';
      const diffStr = `${sign}${PriceFormatter.formatPrice(diff, s.decimals)} (${pct})`;
      const badge = getAssetBadge(s.symbolCode);
      return `
      <div class="card-subtle" data-action="open-chart" data-symbol="${s.symbolCode}" style="min-height: 58px; margin-bottom: 1px; border-radius: 0; border-left: none; border-right: none; border-top: none; padding: 10px 12px; cursor: pointer;">
        <div class="row-between">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <span class="ltr-num" style="width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; color: ${badge.color}; background: ${badge.color}24; border: 1px solid ${badge.color}55; flex-shrink: 0;">
              ${badge.label}
            </span>
            <div style="min-width: 0;">
              <div class="ltr-num" style="font-weight: 800; font-size: 13.5px; color: var(--text);">
                ${s.symbolCode}
              </div>
              <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${title}
              </div>
            </div>
          </div>
          <div style="text-align: end; flex-shrink: 0;">
            <div class="ltr-num" style="font-weight: 700; font-size: 14px; color: var(--text);">
              ${PriceFormatter.formatPrice(s.lastClose, s.decimals)}
            </div>
            <div class="ltr-num" style="font-size: 11.5px; font-weight: 600; color: ${isBull ? 'var(--bull)' : 'var(--bear)'}; margin-top: 2px;">
              ${diffStr}
            </div>
          </div>
        </div>
      </div>
    `;
    })
    .join('');

  return `
    <div>
      <div class="row-between" style="height: 44px; margin-bottom: 6px; padding: 0 4px;">
        <h4 style="margin: 0; font-size: 15px;">${i18n.t('nav_watchlist')}</h4>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button class="btn btn-sm btn-icon" data-action="sync-all" title="${i18n.t('action_sync_all')}">
            ↻
          </button>
          <button class="btn btn-sm btn-primary" data-action="open-add-symbol-modal" title="${i18n.t('settings_add_custom_symbol')}">
            +
          </button>
        </div>
      </div>
      ${watchlist.length === 0 ? `<p style="color: var(--text-muted); font-size: 13px;">${i18n.t('watchlist_empty_hint')}</p>` : cardsHtml}
    </div>
  `;
}
