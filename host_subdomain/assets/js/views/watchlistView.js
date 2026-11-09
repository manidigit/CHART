import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.28.5';
import { state } from '../core/store.js?v=1.28.5';

export function getAssetBadge(symbolCode) {
  if (symbolCode === 'XAUUSD') return { label: 'Au', color: '#F59E0B', providerTag: 'FX_IDC / TWELVE_DATA', category: 'Commodity · Spot Gold' };
  if (symbolCode === 'SPOTBRENT') return { label: 'OIL', color: '#2962FF', providerTag: 'PEPPERSTONE', category: 'Commodity · CFD Crude Oil' };
  if (symbolCode === 'BRENT_FUTURES') return { label: 'BZ', color: '#06B6D4', providerTag: 'NYMEX', category: 'Futures · Brent Crude' };
  if (symbolCode === 'XAGUSD') return { label: 'Ag', color: '#94A3B8', providerTag: 'OANDA', category: 'Commodity · Spot Silver' };
  if (symbolCode === 'EURUSD') return { label: 'FX', color: '#26A69A', providerTag: 'FOREX', category: 'Forex · Major Currency' };
  return { label: String(symbolCode || '').slice(0, 3), color: '#2962FF', providerTag: 'MARKET', category: 'Financial Instrument' };
}

export function computeDayStats(s) {
  const candles = s.candles || [];
  const lastClose = Number(s.lastClose || (candles.length ? candles[candles.length - 1].close : 0));
  if (candles.length === 0) {
    return {
      lastClose,
      prevClose: lastClose,
      openPrice: lastClose,
      dayLow: lastClose,
      dayHigh: lastClose,
      volume: 0,
      isLive: false,
    };
  }
  const daySlice = candles.slice(-24);
  let dayLow = Infinity;
  let dayHigh = -Infinity;
  let volSum = 0;
  for (const c of daySlice) {
    dayLow = Math.min(dayLow, Number(c.low));
    dayHigh = Math.max(dayHigh, Number(c.high));
    volSum += Number(c.volume || 0);
  }
  const prevClose = candles.length >= 2 ? Number(candles[candles.length - 2].close) : Number(daySlice[0].open);
  const openPrice = Number(daySlice[0].open);
  const lastSec = Number(candles[candles.length - 1].openTimeSec || 0);
  const nowSec = Math.floor(Date.now() / 1000);
  const isLive = nowSec - lastSec < 86400 * 2;
  return {
    lastClose,
    prevClose,
    openPrice,
    dayLow: Number.isFinite(dayLow) ? dayLow : lastClose,
    dayHigh: Number.isFinite(dayHigh) ? dayHigh : lastClose,
    volume: volSum,
    isLive,
  };
}

export function renderRightSplitPanel(activeTab, i18n) {
  const query = (state.watchlistSearchQuery || '').trim().toUpperCase();
  const hideLogos = Boolean(state.chartPreferences.hideWatchlistLogos);
  const watchlist = state.symbols.filter((s) => {
    if (!s.inWatchlist) return false;
    if (!query) return true;
    const title = (s.customTitle || i18n.t('symbol_' + s.symbolCode) || '').toUpperCase();
    return s.symbolCode.toUpperCase().includes(query) || title.includes(query);
  });

  const rowsHtml = watchlist
    .map((s) => {
      const d = computeDayStats(s);
      const diff = d.lastClose - d.prevClose;
      const pct = d.prevClose > 0 ? PriceFormatter.formatSignedPct(d.prevClose, d.lastClose) : '+0.00%';
      const isBull = diff >= 0;
      const sign = isBull ? '+' : '';
      const badge = getAssetBadge(s.symbolCode);
      const isSelected = activeTab && activeTab.symbolCode === s.symbolCode;

      return `
        <div class="tv-wl-row ${isSelected ? 'active' : ''}" data-action="open-chart" data-symbol="${s.symbolCode}" dir="ltr">
          <div class="tv-wl-sym-cell">
            ${
              hideLogos
                ? `<span style="width: 7px; height: 7px; border-radius: 50%; background: ${d.isLive ? 'var(--bull)' : 'var(--text-muted)'}; flex-shrink: 0;"></span>`
                : `<span class="tv-wl-badge ltr-num" style="color: ${badge.color}; background: ${badge.color}22; border: 1px solid ${badge.color}55;">
                     ${badge.label}
                   </span>`
            }
            <span class="tv-wl-ticker ltr-num">${s.symbolCode}</span>
          </div>
          <div class="tv-wl-num ltr-num" style="color: var(--text);">
            ${PriceFormatter.formatPrice(d.lastClose, s.decimals)}
          </div>
          <div class="tv-wl-num ltr-num" style="color: ${isBull ? 'var(--bull)' : 'var(--bear)'};">
            ${sign}${PriceFormatter.formatPrice(diff, s.decimals)}
          </div>
          <div class="tv-wl-num ltr-num" style="color: ${isBull ? 'var(--bull)' : 'var(--bear)'};">
            ${pct}
          </div>
        </div>
      `;
    })
    .join('');

  // Selected Symbol Details (Bottom Half of Right Panel, matching TradingView Desktop)
  const sym = activeTab
    ? state.symbols.find((s) => s.symbolCode === activeTab.symbolCode) || state.symbols[0]
    : state.symbols[0];
  let detailsHtml = '';
  if (sym) {
    const d = computeDayStats(sym);
    const diff = d.lastClose - d.prevClose;
    const pct = d.prevClose > 0 ? PriceFormatter.formatSignedPct(d.prevClose, d.lastClose) : '+0.00%';
    const isBull = diff >= 0;
    const sign = isBull ? '+' : '';
    const badge = getAssetBadge(sym.symbolCode);
    const title = sym.customTitle || i18n.t('symbol_' + sym.symbolCode) || sym.symbolCode;
    const rangeSpan = Math.max(0.00001, d.dayHigh - d.dayLow);
    const posPct = Math.max(4, Math.min(96, Math.round(((d.lastClose - d.dayLow) / rangeSpan) * 100)));

    detailsHtml = `
      <div class="tv-symbol-details-pane" dir="ltr">
        <div class="row-between" style="margin-bottom: 6px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="tv-wl-badge ltr-num" style="width: 24px; height: 24px; font-size: 10px; color: ${badge.color}; background: ${badge.color}22; border: 1px solid ${badge.color}55;">
              ${badge.label}
            </span>
            <strong class="ltr-num" style="font-size: 14px; color: var(--text);">${sym.symbolCode}</strong>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <button class="tv-tool-btn" data-action="open-symbol-overview" data-symbol="${sym.symbolCode}" title="Seasonals & Key Data">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </button>
          </div>
        </div>

        <div style="font-size: 11.5px; color: var(--text-muted); margin-bottom: 2px;">
          ${title} · <span class="ltr-num" style="color: var(--text);">${sym.activeProvider.toUpperCase()}</span>
        </div>
        <div class="ltr-num" style="font-size: 11px; color: var(--text-dim); margin-bottom: 8px;">
          ${badge.category}
        </div>

        <div class="tv-detail-price ltr-num">
          ${PriceFormatter.formatPrice(d.lastClose, sym.decimals)}
          <span style="font-size: 11px; font-weight: 600; color: var(--text-muted);">USD</span>
        </div>
        <div class="tv-detail-chg ltr-num" style="color: ${isBull ? 'var(--bull)' : 'var(--bear)'};">
          ${sign}${PriceFormatter.formatPrice(diff, sym.decimals)} (${pct})
        </div>

        <div class="ltr-num" style="font-size: 11px; color: ${d.isLive ? 'var(--bull)' : 'var(--text-muted)'}; margin-top: 5px; display: flex; align-items: center; gap: 5px;">
          <span>●</span>
          <span>${d.isLive ? i18n.t('chart_status_live') : i18n.t('chart_status_market_closed')}</span>
        </div>

        <!-- Day's Range Bar -->
        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border);">
          <div class="row-between ltr-num" style="font-size: 10.5px; color: var(--text-muted); margin-bottom: 4px;">
            <span>Low: <strong style="color: var(--text);">${PriceFormatter.formatPrice(d.dayLow, sym.decimals)}</strong></span>
            <span>Day's Range</span>
            <span>High: <strong style="color: var(--text);">${PriceFormatter.formatPrice(d.dayHigh, sym.decimals)}</strong></span>
          </div>
          <div style="height: 4px; background: var(--surface-elevated); border-radius: 2px; position: relative; margin-bottom: 10px;">
            <div style="position: absolute; left: 0; top: 0; bottom: 0; width: ${posPct}%; background: ${isBull ? 'var(--bull)' : 'var(--bear)'}; border-radius: 2px;"></div>
          </div>

          <div class="tv-detail-grid ltr-num">
            <div class="tv-detail-stat">
              <span>Volume (24B)</span>
              <strong>${PriceFormatter.formatVolume(d.volume)}</strong>
            </div>
            <div class="tv-detail-stat">
              <span>Prev Close</span>
              <strong>${PriceFormatter.formatPrice(d.prevClose, sym.decimals)}</strong>
            </div>
            <div class="tv-detail-stat">
              <span>Open</span>
              <strong>${PriceFormatter.formatPrice(d.openPrice, sym.decimals)}</strong>
            </div>
            <div class="tv-detail-stat">
              <span>Timeframe</span>
              <strong>${PriceFormatter.displayTimeframeLabel(activeTab ? activeTab.timeframe : sym.timeframe)}</strong>
            </div>
          </div>

          <button class="btn btn-sm" style="width: 100%; margin-top: 10px;" data-action="open-symbol-overview" data-symbol="${sym.symbolCode}">
            <span>📊 ${i18n.t('symbol_overview_seasonals')} & ${i18n.t('symbol_overview_key_data')}</span>
          </button>
        </div>
      </div>
    `;
  }

  return `
    <aside class="tv-right-panel ${state.isSideDrawerOpen ? '' : 'collapsed'}">
      <div class="tv-watchlist-pane">
        <div class="tv-pane-header">
          <span>${i18n.t('nav_watchlist')}</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <button class="tv-tool-btn" data-action="open-add-symbol-modal" title="${i18n.t('settings_add_custom_symbol')}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="tv-tool-btn" data-action="sync-all" title="${i18n.t('action_sync_all')}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
            </button>
            <button class="tv-tool-btn" data-action="toggle-right-panel" title="Collapse Panel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        <div style="padding: 6px 10px; border-bottom: 1px solid var(--border);">
          <input
            type="text"
            class="input-field"
            style="min-height: 26px; padding: 3px 8px; font-size: 11px;"
            placeholder="${i18n.t('watchlist_search_placeholder')}"
            value="${state.watchlistSearchQuery || ''}"
            data-action="watchlist-search"
          />
        </div>

        <div class="tv-wl-table-head" dir="ltr">
          <span>Symbol</span>
          <span style="text-align: right;">Last</span>
          <span style="text-align: right;">Chg</span>
          <span style="text-align: right;">Chg%</span>
        </div>

        <div class="tv-wl-list">
          ${watchlist.length === 0 ? `<div style="padding: 14px; font-size: 12px; color: var(--text-muted);">${i18n.t('watchlist_empty_hint')}</div>` : rowsHtml}
        </div>
      </div>

      ${detailsHtml}
    </aside>
  `;
}

export function renderSymbolOverviewModal(i18n) {
  const code = state.symbolOverviewCode;
  if (!code) return '';
  const sym = state.symbols.find((s) => s.symbolCode === code);
  if (!sym) return '';

  const d = computeDayStats(sym);
  const diff = d.lastClose - d.prevClose;
  const pct = d.prevClose > 0 ? PriceFormatter.formatSignedPct(d.prevClose, d.lastClose) : '+0.00%';
  const isBull = diff >= 0;
  const badge = getAssetBadge(sym.symbolCode);

  const candles = (sym.candles || []).slice(-42);
  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of candles) {
    minP = Math.min(minP, Number(c.low));
    maxP = Math.max(maxP, Number(c.high));
  }
  if (!Number.isFinite(minP) || !Number.isFinite(maxP)) {
    minP = d.lastClose * 0.99;
    maxP = d.lastClose * 1.01;
  }
  const span = Math.max(maxP - minP, 0.0001);
  const svgW = 420;
  const svgH = 140;
  const pToY = (p) => 12 + (svgH - 24) * (1 - (Number(p) - minP) / span);
  const slotW = candles.length > 0 ? svgW / candles.length : 10;
  const bodyW = Math.max(2, Math.min(7, slotW * 0.65));

  const miniCandlesSvg = candles
    .map((c, idx) => {
      const x = (idx + 0.5) * slotW;
      const oY = pToY(c.open);
      const cY = pToY(c.close);
      const hY = pToY(c.high);
      const lY = pToY(c.low);
      const col = Number(c.close) >= Number(c.open) ? '#26A69A' : '#EF5350';
      const top = Math.min(oY, cY);
      const bh = Math.max(1.8, Math.abs(cY - oY));
      return `<line x1="${x.toFixed(1)}" y1="${hY.toFixed(1)}" x2="${x.toFixed(1)}" y2="${lY.toFixed(1)}" stroke="${col}" stroke-width="1"/><rect x="${(x - bodyW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bodyW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${col}"/>`;
    })
    .join('');

  const prevCloseY = pToY(d.prevClose);
  const ranges = ['1D', '5D', '1M', '3M', 'YTD', '1Y', '5Y', 'All'];
  const activeRange = state.symbolOverviewRange || '5D';

  const seasonalPoints2026 = '10,95 45,92 80,42 115,58 150,34 185,84 220,54 255,66 290,38 325,28 355,50';
  const seasonalPoints2025 = '10,96 60,90 120,98 180,92 240,95 300,89 360,96 400,98';
  const seasonalPoints2024 = '10,95 55,88 110,80 165,86 220,82 275,92 330,90 390,94';

  return `
    <div class="modal-backdrop" data-action="close-symbol-overview-backdrop">
      <div class="modal-card symbol-overview-modal" dir="ltr" style="padding: 18px;">
        <div class="row-between" style="margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="ltr-num" style="width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; color: ${badge.color}; background: ${badge.color}24; border: 1px solid ${badge.color}55;">
              ${badge.label}
            </span>
            <div>
              <div class="ltr-num" style="display: flex; align-items: baseline; gap: 8px;">
                <span style="font-size: 20px; font-weight: 800; color: var(--text);">${PriceFormatter.formatPrice(d.lastClose, sym.decimals)}</span>
                <span style="font-size: 15px; font-weight: 700; color: ${isBull ? '#26A69A' : '#EF5350'};">${pct}</span>
              </div>
              <div class="ltr-num" style="font-size: 11px; color: var(--text-muted); font-weight: 600;">
                ${sym.symbolCode} • ${badge.providerTag}
              </div>
            </div>
          </div>
          <button class="btn btn-sm btn-icon" data-action="close-symbol-overview">✕</button>
        </div>

        <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px; margin-bottom: 10px;">
          <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="140" style="display: block;">
            <line x1="0" y1="${prevCloseY.toFixed(1)}" x2="${svgW}" y2="${prevCloseY.toFixed(1)}" stroke="#787B86" stroke-dasharray="4 4" stroke-width="1"/>
            ${miniCandlesSvg}
          </svg>
          <div class="row-between" style="margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 3px; flex-wrap: wrap;">
              ${ranges
                .map(
                  (r) => `<button class="chip ltr-num ${activeRange === r ? 'active' : ''}" style="font-size: 11px; padding: 2px 7px;" data-action="set-overview-range" data-range="${r}">${r}</button>`
                )
                .join('')}
            </div>
            <button class="btn btn-sm btn-primary" data-action="open-chart" data-symbol="${sym.symbolCode}" title="${i18n.t('action_open_chart_view')}">
              <span>${i18n.t('action_open_chart_view')}</span>
            </button>
          </div>
        </div>

        <div class="card-subtle" style="margin-bottom: 10px;">
          <div style="font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 10px;">
            ${i18n.t('symbol_overview_key_data')}
          </div>
          <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 6px;">
            <span style="color: var(--text-muted);">Volume</span>
            <strong>${PriceFormatter.formatVolume(d.volume)}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 6px;">
            <span style="color: var(--text-muted);">${i18n.t('symbol_overview_prev_close')}</span>
            <strong>${PriceFormatter.formatPrice(d.prevClose, sym.decimals)} USD</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 6px;">
            <span style="color: var(--text-muted);">${i18n.t('symbol_overview_open')}</span>
            <strong>${PriceFormatter.formatPrice(d.openPrice, sym.decimals)} USD</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px;">
            <span style="color: var(--text-muted);">${i18n.t('symbol_overview_days_range')}</span>
            <strong>${PriceFormatter.formatPrice(d.dayLow, sym.decimals)} — ${PriceFormatter.formatPrice(d.dayHigh, sym.decimals)} USD</strong>
          </div>
        </div>

        <div class="card-subtle">
          <div style="font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 8px;">
            ${i18n.t('symbol_overview_seasonals')}
          </div>
          <svg viewBox="0 0 410 110" width="100%" height="105" style="display: block;">
            <line x1="85" y1="5" x2="85" y2="100" stroke="#2A2E39" stroke-dasharray="3 3"/>
            <line x1="195" y1="5" x2="195" y2="100" stroke="#2A2E39" stroke-dasharray="3 3"/>
            <line x1="305" y1="5" x2="305" y2="100" stroke="#2A2E39" stroke-dasharray="3 3"/>
            <polyline fill="none" stroke="#F59E0B" stroke-width="1.4" points="${seasonalPoints2024}"/>
            <polyline fill="none" stroke="#22C55E" stroke-width="1.4" points="${seasonalPoints2025}"/>
            <polyline fill="none" stroke="#2962FF" stroke-width="2.2" points="${seasonalPoints2026}"/>
            <circle cx="355" cy="50" r="3.5" fill="#2962FF"/>
          </svg>
          <div class="row-between ltr-num" style="font-size: 10.5px; color: var(--text-muted); margin-top: 4px; padding: 0 8px;">
            <span>Jan</span>
            <span>Apr</span>
            <span>Jul</span>
            <span>Oct</span>
          </div>
          <div style="display: flex; justify-content: center; gap: 16px; margin-top: 6px; font-size: 11px;" class="ltr-num">
            <span><span style="color: #2962FF;">●</span> 2026</span>
            <span><span style="color: #22C55E;">●</span> 2025</span>
            <span><span style="color: #F59E0B;">●</span> 2024</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

export const renderWatchlistContent = renderRightSplitPanel;

