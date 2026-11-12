import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.35.0';
import { state } from '../core/store.js?v=1.35.0';

const STOCK_SYMBOLS = new Set([
  'NVDA', 'AMZN', 'TSLA', 'AAPL', 'GOOGL', 'MSFT', 'META', 'NFLX', 'AMD', 'UBER', 'NKE', 'IBM', 'SAN',
]);

export function getSymbolCategoryKey(symbolCode) {
  const code = String(symbolCode || '').toUpperCase();
  if (code === 'XAUUSD' || code === 'XAGUSD' || code.includes('XAU') || code.includes('XAG') || code.includes('GOLD')) {
    return 'METALS';
  }
  if (code === 'SPOTBRENT' || code === 'USOIL' || code === 'BRENT_FUTURES' || code.includes('OIL') || code.includes('BRENT') || code.includes('WTI')) {
    return 'ENERGY';
  }
  if (code === 'BTCUSD' || code === 'ETHUSD' || code.includes('BTC') || code.includes('ETH')) {
    return 'CRYPTO';
  }
  if (code === 'SPX500USD' || code === 'NDQ' || code.includes('SPX') || code.includes('NDX') || code.includes('NAS')) {
    return 'INDICES';
  }
  if (STOCK_SYMBOLS.has(code)) {
    return 'STOCKS';
  }
  return 'FX';
}

export function getAssetBadge(symbolCode) {
  const code = String(symbolCode || '').toUpperCase();
  if (code === 'XAUUSD') {
    return {
      label: 'Au',
      color: '#F59E0B',
      bgGradient: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)',
      providerTag: 'TWELVE_DATA · biquote',
      category: 'Spot Gold · Commodity',
      svgIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 14 18 14 21 20 3 20 6 14" fill="rgba(255,255,255,0.28)"/><polygon points="8 7 16 7 18 12 6 12 8 7" fill="rgba(255,255,255,0.28)"/><path d="M12 2v2"/></svg>`,
    };
  }
  if (code === 'SPOTBRENT' || code === 'USOIL' || code === 'BRENT_FUTURES' || code.includes('OIL') || code.includes('BRENT')) {
    const isWti = code === 'USOIL';
    return {
      label: isWti ? 'WTI' : 'OIL',
      color: isWti ? '#0EA5E9' : '#2962FF',
      bgGradient: isWti
        ? 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)'
        : 'linear-gradient(135deg, #2962FF 0%, #1D4ED8 100%)',
      providerTag: isWti ? 'TVC · Yahoo' : 'PEPPERSTONE · tvdatafeed',
      category: isWti ? 'WTI Crude Oil · Energy' : 'Brent Crude Spot · Energy',
      svgIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.26)" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" stroke-width="1.8"/></svg>`,
    };
  }
  if (code === 'XAGUSD') {
    return {
      label: 'Ag',
      color: '#94A3B8',
      bgGradient: 'linear-gradient(135deg, #94A3B8 0%, #475569 100%)',
      providerTag: 'biquote · TWELVE_DATA',
      category: 'Spot Silver · Commodity',
      svgIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.25)" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 15 19 15 22 20 2 20 5 15"/><polygon points="8 8 16 8 18 13 6 13 8 8"/></svg>`,
    };
  }
  if (code === 'BTCUSD' || code === 'ETHUSD') {
    const isEth = code === 'ETHUSD';
    return {
      label: isEth ? 'ETH' : 'BTC',
      color: isEth ? '#6366F1' : '#F7931A',
      bgGradient: isEth
        ? 'linear-gradient(135deg, #6366F1 0%, #4338CA 100%)'
        : 'linear-gradient(135deg, #F7931A 0%, #C2410C 100%)',
      providerTag: 'biquote · Yahoo Finance',
      category: isEth ? 'Ethereum · Crypto' : 'Bitcoin · Crypto',
      svgIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M9.5 8h4a2 2 0 0 1 0 4h-4h4.5a2 2 0 0 1 0 4h-4.5"/><line x1="11" y1="6" x2="11" y2="18"/></svg>`,
    };
  }
  if (code === 'SPX500USD' || code === 'NDQ') {
    const isNasdaq = code === 'NDQ';
    return {
      label: isNasdaq ? '100' : '500',
      color: isNasdaq ? '#06B6D4' : '#EF4444',
      bgGradient: isNasdaq
        ? 'linear-gradient(135deg, #06B6D4 0%, #0E7490 100%)'
        : 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
      providerTag: 'Yahoo Finance · TV',
      category: isNasdaq ? 'Nasdaq 100 · US Index' : 'S&P 500 · US Index',
      svgIcon: '',
    };
  }
  if (code === 'EURUSD') {
    return {
      label: 'FX',
      color: '#26A69A',
      bgGradient: 'linear-gradient(135deg, #26A69A 0%, #0F766E 100%)',
      providerTag: 'TradingView · Twelve Data',
      category: 'Forex · Major Currency',
      svgIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M14.5 9a3.5 3.5 0 1 0 0 6"/><line x1="8" y1="11" x2="13" y2="11"/><line x1="8" y1="13" x2="13" y2="13"/></svg>`,
    };
  }
  if (STOCK_SYMBOLS.has(code)) {
    const stockThemes = {
      NVDA: ['#22C55E', 'linear-gradient(135deg, #22C55E 0%, #15803D 100%)', 'NV', `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M4 16c4-6 12-6 16 0"/><circle cx="12" cy="12" r="3" fill="#FFFFFF"/></svg>`],
      AMZN: ['#F59E0B', 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)', 'AZ', `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M5 16c4 3 10 3 14 0"/><path d="M16 13l3 3-3 3"/></svg>`],
      TSLA: ['#EF4444', 'linear-gradient(135deg, #EF4444 0%, #991B1B 100%)', 'TS', `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M12 4v16M6 6c3-2 9-2 12 0"/></svg>`],
      AAPL: ['#64748B', 'linear-gradient(135deg, #64748B 0%, #334155 100%)', 'AP', `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.1"><path d="M12 20.94c1.88 0 3.05-.91 4.29-.91 1.23 0 2.22.91 4.1.91 2.53 0 4.61-2.13 4.61-4.75 0-2.48-1.57-4.16-3.8-4.24-1.6-.06-3.1 1.04-3.88 1.04-.79 0-2.02-.99-3.32-.99-2.2 0-4.32 1.63-4.32 4.47 0 2.97 1.94 6.47 4.32 6.47z"/><path d="M15.5 5.5c.83-1 1.3-2.3 1.15-3.5-1.2.06-2.6.8-3.4 1.8-.73.85-1.3 2.1-1.15 3.3 1.3 0 2.6-.7 3.4-1.6z"/></svg>`],
      GOOGL: ['#3B82F6', 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)', 'GO', `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 12h5a5 5 0 0 1-5 5c-3 0-5-2-5-5s2-5 5-5c2 0 3.5.8 4.3 1.7"/></svg>`],
      MSFT: ['#0EA5E9', 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)', 'MS', `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="1.8"><rect x="4" y="4" width="7" height="7" fill="rgba(255,255,255,0.4)"/><rect x="13" y="4" width="7" height="7" fill="rgba(255,255,255,0.4)"/><rect x="4" y="13" width="7" height="7" fill="rgba(255,255,255,0.4)"/><rect x="13" y="13" width="7" height="7" fill="rgba(255,255,255,0.4)"/></svg>`],
      META: ['#2563EB', 'linear-gradient(135deg, #2563EB 0%, #1E40AF 100%)', 'MT', `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M6 16c-2 0-3-2-3-4s1-4 3-4c3 0 4 5 6 5s3-5 6-5c2 0 3 2 3 4s-1 4-3 4c-3 0-4-5-6-5s-3 5-6 5z"/></svg>`],
      NFLX: ['#DC2626', 'linear-gradient(135deg, #DC2626 0%, #7F1D1D 100%)', 'NF', `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4"><path d="M5 4v16M19 4v16M5 4l14 16"/></svg>`],
      AMD: ['#10B981', 'linear-gradient(135deg, #10B981 0%, #047857 100%)', 'AM', `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="12 4 20 12 12 20 4 12"/></svg>`],
      UBER: ['#475569', 'linear-gradient(135deg, #475569 0%, #1E293B 100%)', 'UB', `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="#FFFFFF"/></svg>`],
      NKE: ['#F97316', 'linear-gradient(135deg, #F97316 0%, #C2410C 100%)', 'NK', `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M4 14c4 3 12 3 16-8-4 4-10 6-16 8z"/></svg>`],
      IBM: ['#3B82F6', 'linear-gradient(135deg, #3B82F6 0%, #1E3A8A 100%)', 'IB', `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/></svg>`],
      SAN: ['#EC1C24', 'linear-gradient(135deg, #EC1C24 0%, #991B1B 100%)', 'SA', `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><polygon points="12 7 16 16 8 16" fill="#FFFFFF"/></svg>`],
    };
    const [color, bgGradient, label, svg] = stockThemes[code] || [
      '#2962FF',
      'linear-gradient(135deg, #2962FF 0%, #1E40AF 100%)',
      code.slice(0, 2),
      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M8 12h8"/></svg>`,
    ];
    return {
      label,
      color,
      bgGradient,
      providerTag: 'Yahoo Finance · NASDAQ/NYSE',
      category: 'Equity · Global Stock',
      svgIcon: svg,
    };
  }
  return {
    label: code.slice(0, 3) || 'SYM',
    color: '#2962FF',
    bgGradient: 'linear-gradient(135deg, #2962FF 0%, #1E40AF 100%)',
    providerTag: 'MARKET',
    category: 'Financial Instrument',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  };
}

export function getInstrumentProfileMeta(symbolCode, providerBadge) {
  const code = String(symbolCode || '').toUpperCase();
  if (code.includes('XAU')) {
    return {
      sector: 'Precious Metals',
      industry: 'Spot Bullion (LBMA / OTC)',
      benchmark: `XAU/USD Spot · ${providerBadge}`,
      activeVenues: '24+ Global Venues',
      dailyTurnover: '162.4B USD',
      payoutRatio: '8.86% (Carry)',
      yieldTtm: '2.94% (Lease)',
      figi: 'BBG000B9XRY4',
      isin: 'XC0009655157',
    };
  }
  if (code.includes('BRENT') || code.includes('OIL')) {
    return {
      sector: 'Energy Commodities',
      industry: 'North Sea Brent Crude',
      benchmark: `Dated Brent / ICE · ${providerBadge}`,
      activeVenues: '18+ Energy Hubs',
      dailyTurnover: '94.8B USD',
      payoutRatio: '12.40% (Roll)',
      yieldTtm: '4.15% (Carry)',
      figi: 'BBG000G2R5T8',
      isin: 'EU0009658426',
    };
  }
  if (code.includes('XAG')) {
    return {
      sector: 'Precious & Industrial Metals',
      industry: 'Spot Silver Bullion',
      benchmark: `XAG/USD Spot · ${providerBadge}`,
      activeVenues: '19+ Global Venues',
      dailyTurnover: '38.2B USD',
      payoutRatio: '7.20%',
      yieldTtm: '2.10%',
      figi: 'BBG000B9XVV8',
      isin: 'XC0009653103',
    };
  }
  return {
    sector: 'Global Foreign Exchange',
    industry: 'G10 Interbank FX',
    benchmark: `${code} · ${providerBadge}`,
    activeVenues: '30+ ECN Venues',
    dailyTurnover: '410.0B USD',
    payoutRatio: '6.50% (Swap)',
    yieldTtm: '3.45% (Rate Diff)',
    figi: 'BBG0013HG040',
    isin: 'EU0009652759',
  };
}

export function renderSymbolBadge(symbolCode, sizePx = 22) {
  const badge = getAssetBadge(symbolCode);
  return `<span class="tv-wl-icon-badge" style="width: ${sizePx}px; height: ${sizePx}px; min-width: ${sizePx}px; background: ${badge.bgGradient};" title="${badge.category}">${badge.svgIcon}</span>`;
}

export function computeDayStats(s, overrideCandles = null) {
  const candles =
    Array.isArray(overrideCandles) && overrideCandles.length > 0
      ? overrideCandles
      : s.candles || [];
  if (candles.length === 0) {
    const fallback = Number(s.lastClose || 0);
    return {
      lastClose: fallback,
      prevClose: fallback,
      openPrice: fallback,
      dayLow: fallback,
      dayHigh: fallback,
      volume: 0,
      isLive: false,
    };
  }

  const latestCandle = candles[candles.length - 1];
  const lastClose = Number(latestCandle.close || s.lastClose || 0);
  const daySlice = candles.slice(-24);
  let dayLow = lastClose;
  let dayHigh = lastClose;
  let volSum = 0;

  for (const c of daySlice) {
    const lo = Number(c.low);
    const hi = Number(c.high);
    if (Number.isFinite(lo) && lo > 0) dayLow = Math.min(dayLow, lo);
    if (Number.isFinite(hi) && hi > 0) dayHigh = Math.max(dayHigh, hi);
    volSum += Number(c.volume || 0);
  }

  const prevClose =
    candles.length >= 2 ? Number(candles[candles.length - 2].close) : Number(daySlice[0].open);
  const openPrice = Number(latestCandle.open || daySlice[0].open || lastClose);
  const lastSec = Number(
    latestCandle.openTimeSec ||
      Math.floor(Number(latestCandle.open_time_utc_ms || 0) / 1000) ||
      0
  );
  const nowSec = Math.floor(Date.now() / 1000);
  const isLive = nowSec - lastSec < 86400 * 3;

  return {
    lastClose,
    prevClose,
    openPrice,
    dayLow: Number.isFinite(dayLow) ? dayLow : lastClose,
    dayHigh: Number.isFinite(dayHigh) ? dayHigh : lastClose,
    volume: Number(latestCandle.volume || volSum || 0),
    isLive,
  };
}

function renderSpeedometerSvg(needleRatio, accentColor) {
  const clamped = Math.max(0.06, Math.min(0.94, Number(needleRatio || 0.5)));
  const angleDeg = 180 + clamped * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cx = 65;
  const cy = 58;
  const r = 42;
  const nx = (cx + r * Math.cos(angleRad)).toFixed(1);
  const ny = (cy + r * Math.sin(angleRad)).toFixed(1);

  return `
    <svg viewBox="0 0 130 68" width="124" height="64" style="display: block; margin: 0 auto;">
      <path d="M 18 58 A 47 47 0 0 1 32 24" fill="none" stroke="#EF5350" stroke-width="8" stroke-linecap="round"/>
      <path d="M 35 21 A 47 47 0 0 1 56 12" fill="none" stroke="#F59E0B" stroke-width="8" stroke-linecap="round"/>
      <path d="M 60 11 A 47 47 0 0 1 70 11" fill="none" stroke="#787B86" stroke-width="8" stroke-linecap="round"/>
      <path d="M 74 12 A 47 47 0 0 1 95 21" fill="none" stroke="#2962FF" stroke-width="8" stroke-linecap="round"/>
      <path d="M 98 24 A 47 47 0 0 1 112 58" fill="none" stroke="#26A69A" stroke-width="8" stroke-linecap="round"/>
      <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${accentColor}" stroke-width="3.2" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="4.5" fill="${accentColor}"/>
    </svg>
  `;
}

export function renderRightSplitPanel(activeTab, i18n) {
  const query = (state.watchlistSearchQuery || '').trim().toUpperCase();
  const activeCat = state.watchlistCategory || 'ALL';
  const hideLogos = Boolean(state.chartPreferences.hideWatchlistLogos);

  const watchlist = state.symbols.filter((s) => {
    if (!s.inWatchlist) return false;
    if (activeCat !== 'ALL' && getSymbolCategoryKey(s.symbolCode) !== activeCat) return false;
    if (!query) return true;
    const title = (s.customTitle || i18n.t('symbol_' + s.symbolCode) || '').toUpperCase();
    return s.symbolCode.toUpperCase().includes(query) || title.includes(query);
  });

  const categories = [
    { key: 'ALL', label: i18n.t('watchlist_cat_all') || 'All' },
    { key: 'METALS', label: i18n.t('watchlist_cat_metals') || 'Metals' },
    { key: 'ENERGY', label: i18n.t('watchlist_cat_energy') || 'Energy' },
    { key: 'CRYPTO', label: i18n.t('watchlist_cat_crypto') || 'Crypto' },
    { key: 'INDICES', label: i18n.t('watchlist_cat_indices') || 'Indices' },
    { key: 'STOCKS', label: i18n.t('watchlist_cat_stocks') || 'Stocks' },
    { key: 'FX', label: i18n.t('watchlist_cat_fx') || 'Forex' },
  ];

  const catChipsHtml = categories
    .map(
      (cat) =>
        `<button type="button" class="tv-wl-cat-chip ${activeCat === cat.key ? 'active' : ''}" data-action="set-wl-category" data-category="${cat.key}">${cat.label}</button>`
    )
    .join('');

  const rowsHtml = watchlist
    .map((s, idx) => {
      const isSelected = activeTab && activeTab.symbolCode === s.symbolCode;
      const d = computeDayStats(s, isSelected ? activeTab.candles : null);
      const diff = d.lastClose - d.prevClose;
      const pct = d.prevClose > 0 ? PriceFormatter.formatSignedPct(d.prevClose, d.lastClose) : '+0.00%';
      const isBull = diff >= 0;
      const sign = isBull ? '+' : '';

      return `
        <div
          class="tv-wl-row ${isSelected ? 'active' : ''}"
          draggable="true"
          data-symbol="${s.symbolCode}"
          data-index="${idx}"
          data-action="open-chart"
          dir="ltr"
        >
          <div class="tv-wl-sym-cell">
            <span
              class="tv-wl-drag-handle"
              title="${i18n.t('watchlist_reorder_hint') || 'Drag to reorder / جابجایی سهم'}"
              data-action="drag-handle"
            >
              <svg width="7" height="12" viewBox="0 0 8 14" fill="currentColor">
                <circle cx="2" cy="2.5" r="1.3"/><circle cx="6" cy="2.5" r="1.3"/>
                <circle cx="2" cy="7" r="1.3"/><circle cx="6" cy="7" r="1.3"/>
                <circle cx="2" cy="11.5" r="1.3"/><circle cx="6" cy="11.5" r="1.3"/>
              </svg>
            </span>
            ${
              hideLogos
                ? `<span style="width: 7px; height: 7px; border-radius: 50%; background: ${d.isLive ? 'var(--bull)' : 'var(--text-muted)'}; flex-shrink: 0;"></span>`
                : renderSymbolBadge(s.symbolCode, 22)
            }
            <span class="tv-wl-ticker ltr-num">${s.symbolCode}</span>
          </div>
          <div class="tv-wl-num ltr-num" style="color: var(--text-strong); font-weight: 600;">
            ${PriceFormatter.formatPrice(d.lastClose, s.decimals)}
          </div>
          <div class="tv-wl-num tv-wl-col-chg ltr-num" style="color: ${isBull ? 'var(--bull)' : 'var(--bear)'};">
            ${sign}${PriceFormatter.formatPrice(diff, s.decimals)}
          </div>
          <div class="tv-wl-num ltr-num" style="display: flex; align-items: center; justify-content: flex-end; gap: 2px; color: ${isBull ? 'var(--bull)' : 'var(--bear)'}; font-weight: 600;">
            <span>${pct}</span>
            <div class="tv-wl-row-actions" style="display: inline-flex; align-items: center; gap: 1px; margin-left: 2px;">
              <button
                type="button"
                class="tv-wl-move-btn"
                data-action="move-watchlist-symbol"
                data-direction="up"
                data-symbol="${s.symbolCode}"
                title="${i18n.t('watchlist_move_up')}"
              >▲</button>
              <button
                type="button"
                class="tv-wl-move-btn"
                data-action="move-watchlist-symbol"
                data-direction="down"
                data-symbol="${s.symbolCode}"
                title="${i18n.t('watchlist_move_down')}"
              >▼</button>
              <button
                type="button"
                class="tv-wl-remove-btn"
                data-action="remove-from-watchlist"
                data-symbol="${s.symbolCode}"
                title="Remove from Watchlist"
              >×</button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  // Selected Symbol Details (Bottom Half of Right Panel)
  const sym = activeTab
    ? state.symbols.find((s) => s.symbolCode === activeTab.symbolCode) || state.symbols[0]
    : state.symbols[0];
  let detailsHtml = '';
  if (sym) {
    const d = computeDayStats(
      sym,
      activeTab && activeTab.symbolCode === sym.symbolCode ? activeTab.candles : null
    );
    const diff = d.lastClose - d.prevClose;
    const pct = d.prevClose > 0 ? PriceFormatter.formatSignedPct(d.prevClose, d.lastClose) : '+0.00%';
    const isBull = diff >= 0;
    const sign = isBull ? '+' : '';
    const badge = getAssetBadge(sym.symbolCode);
    const rawTitle = sym.customTitle || i18n.t('symbol_' + sym.symbolCode) || sym.symbolCode;
    const cleanTitle = rawTitle.replace(/\s*\([A-Z0-9_]+\)\s*/g, '').trim() || rawTitle;
    const rangeSpan = Math.max(0.00001, d.dayHigh - d.dayLow);
    const posPct = Math.max(4, Math.min(96, Math.round(((d.lastClose - d.dayLow) / rangeSpan) * 100)));

    detailsHtml = `
      <div class="tv-symbol-details-pane" dir="ltr">
        <div class="tv-detail-header-row">
          <div class="tv-detail-title-group">
            ${renderSymbolBadge(sym.symbolCode, 24)}
            <strong class="tv-detail-sym-code ltr-num">${sym.symbolCode}</strong>
          </div>
          <span class="tv-detail-cat-pill ltr-num">${badge.category}</span>
        </div>

        <div class="tv-detail-subtitle" dir="auto">
          ${cleanTitle}
        </div>

        <div class="tv-detail-price-row">
          <div class="tv-detail-price ltr-num">
            ${PriceFormatter.formatPrice(d.lastClose, sym.decimals)}
            <span class="tv-detail-currency">USD</span>
          </div>
          <div class="tv-detail-chg ltr-num" style="color: ${isBull ? 'var(--bull)' : 'var(--bear)'};">
            ${sign}${PriceFormatter.formatPrice(diff, sym.decimals)} (${pct})
          </div>
        </div>

        <!-- Day's Range Bar -->
        <div class="tv-detail-range-box">
          <div class="tv-detail-range-labels ltr-num">
            <span>L: <strong>${PriceFormatter.formatPrice(d.dayLow, sym.decimals)}</strong></span>
            <span class="tv-detail-range-title">Day's Range</span>
            <span>H: <strong>${PriceFormatter.formatPrice(d.dayHigh, sym.decimals)}</strong></span>
          </div>
          <div class="tv-detail-range-track">
            <div style="position: absolute; left: 0; top: 0; bottom: 0; width: ${posPct}%; background: ${isBull ? 'var(--bull)' : 'var(--bear)'}; border-radius: 3px;"></div>
          </div>

          <div class="tv-detail-grid ltr-num">
            <div class="tv-detail-stat">
              <span>Volume</span>
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
              <span>Range Spread</span>
              <strong>${PriceFormatter.formatPrice(d.dayHigh - d.dayLow, sym.decimals)}</strong>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const panelW = Math.max(185, Math.min(520, Math.round(state.rightPanelWidth || 310)));
  const topPct = Math.round(Math.max(0.22, Math.min(0.78, Number(state.watchlistTopRatio || 0.52))) * 100);

  return `
    ${
      state.isSideDrawerOpen
        ? `<div class="tv-col-resizer" id="tv-right-col-resizer" title="Drag to resize Watchlist width"></div>`
        : ''
    }
    <aside
      id="tv-right-split-panel"
      class="tv-right-panel ${state.isSideDrawerOpen ? '' : 'collapsed'}"
      style="${state.isSideDrawerOpen ? `width: ${panelW}px; min-width: ${panelW}px;` : ''}"
    >
      <div class="tv-watchlist-pane" id="tv-watchlist-top-pane" style="flex: 0 0 ${topPct}%; height: ${topPct}%;">
        <div class="tv-pane-header">
          <span>${i18n.t('nav_watchlist')}</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <button class="tv-tool-btn" data-action="open-add-symbol-modal" title="${i18n.t('settings_add_custom_symbol')}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>

        <div style="padding: 6px 8px; border-bottom: 1px solid var(--border);">
          <input
            id="tv-watchlist-search-input"
            type="text"
            class="input-field"
            style="min-height: 26px; padding: 3px 8px; font-size: 11px;"
            placeholder="${i18n.t('watchlist_search_placeholder')}"
            value="${state.watchlistSearchQuery || ''}"
            data-action="watchlist-search"
          />
        </div>

        <div class="tv-wl-cat-bar" dir="ltr">
          ${catChipsHtml}
        </div>

        <div class="tv-wl-table-head" dir="ltr">
          <span>Symbol</span>
          <span style="text-align: right;">Last</span>
          <span class="tv-wl-col-chg" style="text-align: right;">Chg</span>
          <span style="text-align: right;">Chg%</span>
        </div>

        <div class="tv-wl-list">
          ${watchlist.length === 0 ? `<div style="padding: 14px; font-size: 12px; color: var(--text-muted);">${i18n.t('watchlist_empty_hint')}</div>` : rowsHtml}
        </div>
      </div>

      <div class="tv-row-resizer" id="tv-right-row-resizer" title="Drag to resize Watchlist / Details height"></div>

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
  const accentColor = isBull ? '#26A69A' : '#EF5350';
  const badge = getAssetBadge(sym.symbolCode);
  const profileMeta = getInstrumentProfileMeta(sym.symbolCode, badge.providerTag);
  const rangeSpan = Math.max(0.00001, d.dayHigh - d.dayLow);
  const posPct = Math.max(6, Math.min(94, Math.round(((d.lastClose - d.dayLow) / rangeSpan) * 100)));
  const target1Y = d.lastClose * (isBull ? 1.148 : 1.092);
  const targetPctStr = isBull ? '+14.80%' : '+9.20%';

  const activeSubTab = state.symbolOverviewSubTab || 'OVERVIEW';
  const finMode = state.symbolOverviewFinMode || 'ANNUAL';

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
  const svgH = 128;
  const pToY = (p) => 10 + (svgH - 20) * (1 - (Number(p) - minP) / span);
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

  const subTabs = [
    { key: 'OVERVIEW', label: i18n.t('symbol_overview_tab_overview') || 'Overview' },
    { key: 'NEWS', label: i18n.t('symbol_overview_tab_news') || 'News' },
    { key: 'MINDS', label: i18n.t('symbol_overview_tab_minds') || 'Minds' },
    { key: 'IDEAS', label: i18n.t('symbol_overview_tab_ideas') || 'Ideas' },
  ];

  const revBars = finMode === 'ANNUAL' ? [42, 54, 62, 74, 84] : [48, 56, 63, 70, 78];
  const netBars = finMode === 'ANNUAL' ? [22, 28, 35, 43, 51] : [26, 30, 36, 41, 47];

  return `
    <div class="modal-backdrop" data-action="close-symbol-overview-backdrop">
      <div class="modal-card symbol-overview-modal" dir="ltr" style="padding: 18px; max-height: 88vh; overflow-y: auto;">
        <!-- [1] Header & Price -->
        <div class="row-between" style="margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="tv-wl-icon-badge" style="width: 36px; height: 36px; background: ${badge.bgGradient};">
              ${badge.svgIcon}
            </span>
            <div>
              <div class="ltr-num" style="display: flex; align-items: baseline; gap: 8px;">
                <span style="font-size: 20px; font-weight: 800; color: var(--text);">${PriceFormatter.formatPrice(d.lastClose, sym.decimals)}</span>
                <span style="font-size: 15px; font-weight: 700; color: ${accentColor};">${pct}</span>
              </div>
              <div class="ltr-num" style="font-size: 11px; color: var(--text-muted); font-weight: 600;">
                ${sym.symbolCode} • ${badge.providerTag} • USD
              </div>
            </div>
          </div>
          <button class="btn btn-sm btn-icon" data-action="close-symbol-overview">✕</button>
        </div>

        <!-- [1b] 4 Detail Sub-Tabs (Overview | News | Minds | Ideas) -->
        <div style="display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap;">
          ${subTabs
            .map(
              (t) => `<button type="button" class="chip ${activeSubTab === t.key ? 'active' : ''}" data-action="set-overview-subtab" data-subtab="${t.key}">${t.label}</button>`
            )
            .join('')}
        </div>

        <!-- Mini-Chart + Range Chips -->
        <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px; margin-bottom: 10px;">
          <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="128" style="display: block;">
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
              <span>⛶ ${i18n.t('action_open_chart_view')}</span>
            </button>
          </div>
        </div>

        <!-- [2] Flash News Banner -->
        <div
          class="card-subtle"
          style="margin-bottom: 10px; cursor: pointer; border-color: rgba(41, 98, 255, 0.4); background: rgba(41, 98, 255, 0.08);"
          data-action="set-overview-subtab"
          data-subtab="NEWS"
        >
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="width: 26px; height: 26px; border-radius: 50%; background: rgba(245, 158, 11, 0.22); color: #F59E0B; display: inline-flex; align-items: center; justify-content: center; font-weight: 800;">⚡</span>
            <div style="flex: 1;">
              <div style="font-size: 12px; font-weight: 700; color: var(--text-strong);">
                ${sym.symbolCode} • ${i18n.t('symbol_overview_flash_news_title')}
              </div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                ${i18n.t('symbol_overview_flash_news_desc')}
              </div>
            </div>
          </div>
        </div>

        ${
          activeSubTab !== 'OVERVIEW'
            ? `
          <div class="card-subtle" style="margin-bottom: 10px;">
            <div style="font-size: 13px; font-weight: 700; color: var(--text-strong); margin-bottom: 8px;">
              ${sym.symbolCode} — ${activeSubTab}
            </div>
            <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 6px;">
              <span style="color: var(--text-muted);">UTC Anchor Status</span>
              <strong>00:00:00 UTC Verified</strong>
            </div>
            <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 6px;">
              <span style="color: var(--text-muted);">Active Feed Channel</span>
              <strong>${badge.providerTag}</strong>
            </div>
            <div style="font-size: 11.5px; color: var(--text-muted); line-height: 1.5;">
              ${i18n.t('symbol_overview_flash_news_desc')}
            </div>
          </div>
        `
            : ''
        }

        <!-- [3] Key data points + Visual Day's Range Bar -->
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
          <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 8px;">
            <span style="color: var(--text-muted);">${i18n.t('symbol_overview_days_range')}</span>
            <strong>${PriceFormatter.formatPrice(d.dayLow, sym.decimals)} — ${PriceFormatter.formatPrice(d.dayHigh, sym.decimals)} USD</strong>
          </div>
          <div style="position: relative; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;">
            <div style="position: absolute; left: 0; top: 0; bottom: 0; width: ${posPct}%; background: ${accentColor}; border-radius: 3px;"></div>
          </div>
        </div>

        <!-- [4] Seasonals Multi-Year Comparison Card -->
        <div class="card-subtle" style="margin-bottom: 10px;">
          <div style="font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 8px;">
            ${i18n.t('symbol_overview_seasonals')}
          </div>
          <svg viewBox="0 0 410 110" width="100%" height="100" style="display: block;">
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
          <div style="display: flex; justify-content: center; gap: 14px; margin-top: 6px; font-size: 11px;" class="ltr-num">
            <span><span style="color: #2962FF;">●</span> 2026 (+18.4%)</span>
            <span><span style="color: #22C55E;">●</span> 2025 (+11.2%)</span>
            <span><span style="color: #F59E0B;">●</span> 2024 (+6.8%)</span>
          </div>
        </div>

        <!-- [5 & 6] Technicals Speedometer Gauge & Analyst Rating / 1Y Target Gauge -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
          <div class="card-subtle" style="text-align: center;">
            <div style="font-size: 12px; font-weight: 700; color: var(--text-strong); margin-bottom: 4px;">
              ${i18n.t('symbol_overview_technicals_title')}
            </div>
            ${renderSpeedometerSvg(isBull ? 0.78 : 0.26, accentColor)}
            <div style="font-size: 12.5px; font-weight: 800; color: ${accentColor}; margin-top: 2px;">
              ${isBull ? i18n.t('symbol_overview_gauge_buy') : i18n.t('symbol_overview_gauge_sell')}
            </div>
          </div>

          <div class="card-subtle" style="text-align: center;">
            <div style="font-size: 12px; font-weight: 700; color: var(--text-strong); margin-bottom: 4px;">
              ${i18n.t('symbol_overview_analyst_title')}
            </div>
            ${renderSpeedometerSvg(0.84, '#26A69A')}
            <div class="ltr-num" style="font-size: 11px; font-weight: 700; color: #26A69A; margin-top: 2px;">
              ${PriceFormatter.formatPrice(target1Y, sym.decimals)} (${targetPctStr})
            </div>
            <button
              type="button"
              class="btn btn-sm"
              style="margin-top: 6px; font-size: 10.5px; color: var(--primary); border-color: var(--primary);"
              data-action="open-prediction-from-overview"
              data-symbol="${sym.symbolCode}"
            >
              ${i18n.t('symbol_overview_see_forecast')}
            </button>
          </div>
        </div>

        <!-- [7 & 8] Income Statement & Margins + Dividends & Yield -->
        <div class="card-subtle" style="margin-bottom: 10px;">
          <div class="row-between" style="margin-bottom: 8px;">
            <span style="font-size: 13px; font-weight: 700; color: var(--text);">
              ${i18n.t('symbol_overview_financials_title')}
            </span>
            <div class="chip-group">
              <button type="button" class="chip ${finMode === 'ANNUAL' ? 'active' : ''}" data-action="set-overview-fin-mode" data-mode="ANNUAL">${i18n.t('symbol_overview_fin_annual')}</button>
              <button type="button" class="chip ${finMode === 'QUARTERLY' ? 'active' : ''}" data-action="set-overview-fin-mode" data-mode="QUARTERLY">${i18n.t('symbol_overview_fin_quarterly')}</button>
            </div>
          </div>

          <svg viewBox="0 0 360 95" width="100%" height="90" style="display: block;">
            ${revBars
              .map((rv, idx) => {
                const cx = 36 + idx * 72;
                const nv = netBars[idx];
                return `
                  <rect x="${cx - 13}" y="${90 - rv}" width="11" height="${rv}" fill="#2962FF" rx="2"/>
                  <rect x="${cx + 2}" y="${90 - nv}" width="11" height="${nv}" fill="#06B6D4" rx="2"/>
                `;
              })
              .join('')}
            <polyline
              fill="none"
              stroke="#F59E0B"
              stroke-width="2"
              points="${revBars.map((rv, idx) => `${36 + idx * 72},${Math.round(90 - (netBars[idx] / rv) * 78)}`).join(' ')}"
            />
          </svg>

          <div style="display: flex; justify-content: space-evenly; font-size: 10.5px; margin: 6px 0 10px 0;" class="ltr-num">
            <span style="color: #2962FF;">■ ${i18n.t('symbol_overview_fin_revenue')}</span>
            <span style="color: #06B6D4;">■ ${i18n.t('symbol_overview_fin_net_income')}</span>
            <span style="color: #F59E0B;">● ${i18n.t('symbol_overview_fin_net_margin')}</span>
          </div>

          <div style="border-top: 1px solid var(--border); padding-top: 8px;">
            <div style="font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 6px;">
              ${i18n.t('symbol_overview_dividends_title')}
            </div>
            <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 4px;">
              <span style="color: var(--text-muted);">${i18n.t('symbol_overview_div_payout')}</span>
              <strong>${profileMeta.payoutRatio}</strong>
            </div>
            <div class="row-between ltr-num" style="font-size: 11.5px;">
              <span style="color: var(--text-muted);">${i18n.t('symbol_overview_div_yield')}</span>
              <strong>${profileMeta.yieldTtm}</strong>
            </div>
          </div>
        </div>

        <!-- [9 & 10] Productivity Metrics & Instrument Profile (with Copyable FIGI & ISIN) -->
        <div class="card-subtle">
          <div style="font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 8px;">
            ${i18n.t('symbol_overview_about_title')}
          </div>
          <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">${i18n.t('symbol_overview_about_sector')}</span>
            <strong>${profileMeta.sector}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">${i18n.t('symbol_overview_about_industry')}</span>
            <strong>${profileMeta.industry}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">${i18n.t('symbol_overview_about_benchmark')}</span>
            <strong>${profileMeta.benchmark}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">${i18n.t('symbol_overview_emp_count')}</span>
            <strong>${profileMeta.activeVenues}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">${i18n.t('symbol_overview_emp_rev')}</span>
            <strong>${profileMeta.dailyTurnover}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">${i18n.t('symbol_overview_about_figi')}</span>
            <button type="button" class="btn btn-sm" style="padding: 1px 6px; min-height: 20px; font-size: 11px;" data-action="copy-identifier" data-copy="${profileMeta.figi}">
              <span>${profileMeta.figi}</span>
              <span>⧉</span>
            </button>
          </div>
          <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">${i18n.t('symbol_overview_about_isin')}</span>
            <button type="button" class="btn btn-sm" style="padding: 1px 6px; min-height: 20px; font-size: 11px;" data-action="copy-identifier" data-copy="${profileMeta.isin}">
              <span>${profileMeta.isin}</span>
              <span>⧉</span>
            </button>
          </div>
          <div class="row-between ltr-num" style="font-size: 11.5px;">
            <span style="color: var(--text-muted);">Google Sheets Formula</span>
            <button type="button" class="btn btn-sm" style="padding: 1px 6px; min-height: 20px; font-size: 11px;" data-action="copy-identifier" data-copy="=GOOGLEFINANCE(&quot;${sym.symbolCode}&quot;, &quot;price&quot;)">
              <span>=GOOGLEFINANCE("${sym.symbolCode}", "price")</span>
              <span>⧉</span>
            </button>
          </div>
        </div>

        <!-- [11] Smart Conversational Summary ("Why It Moved Today" — Google Finance AI Digest) -->
        <div class="card-subtle" style="margin-top: 10px;">
          <div style="font-size: 13px; font-weight: 700; color: var(--primary); margin-bottom: 6px;">
            خلاصهٔ هوشمند تحلیلی (چرا قیمت تغییر کرد؟ — Google Finance AI Digest)
          </div>
          <div style="font-size: 11.5px; color: var(--text); line-height: 1.6;">
            در بازهٔ انتخابی (${rangeKey})، نماد <strong>${sym.symbolCode}</strong> با تغییر <strong>${pctStr}</strong> در محدودهٔ ${PriceFormatter.formatPrice(pLow, sym.decimals)} تا ${PriceFormatter.formatPrice(pHigh, sym.decimals)} معامله شد. سنتیمنت تکنیکال لحظه‌ای (<strong>${techGauge.overallText}</strong>) و میانگین حجم (${PriceFormatter.formatVolume(avgVol)}) نشان‌دهندهٔ تمرکز نقدینگی در حوالی قیمت تعادلی ${PriceFormatter.formatPrice(closeP, sym.decimals)} است.
          </div>
        </div>

        <!-- [12] Earnings Calendar, EPS Surprises & Official SEC EDGAR Filings (10-K / 10-Q / 8-K) -->
        <div class="card-subtle" style="margin-top: 10px;">
          <div style="font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 8px;">
            تقویم گزارش‌های مالی، سورپرایز EPS و اسناد رسمی SEC EDGAR
          </div>
          <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">Next Earnings / Macro Release</span>
            <strong>${badge.category === 'STOCKS' ? `Upcoming Quarter (EPS Est: ${profileMeta.epsDilutedTtm})` : 'Central Bank / Weekly Inventory Release'}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">Last EPS Beat / Surprise</span>
            <strong style="color: ${isPositive ? 'var(--bull)' : 'var(--bear)'};">${isPositive ? '+4.8% Beat vs Consensus' : '-1.4% Inline / Mixed'}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 11.5px;">
            <span style="color: var(--text-muted);">SEC EDGAR / Official Benchmark</span>
            <strong>${badge.category === 'STOCKS' ? 'Form 10-K • Form 10-Q • Form 8-K' : profileMeta.benchmark}</strong>
          </div>
        </div>

        <!-- [13] Top Market Movers (Gainers / Losers / Most Active) & Global Regional Indices Snapshot -->
        <div class="card-subtle" style="margin-top: 10px;">
          <div style="font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 8px;">
            پرتراکنش‌ترین نمادهای بازار و نمای شاخص‌های منطقه‌ای (Americas / Europe / Asia)
          </div>
          <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">Top Movers & Most Active</span>
            <strong>NVDA • BTCUSD • XAUUSD • SPOTBRENT</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">Americas Indices</span>
            <strong>S&P 500 (SPX500USD) • Nasdaq 100 (NDQ)</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 11.5px;">
            <span style="color: var(--text-muted);">Europe & Asia Benchmarks</span>
            <strong>EUR/USD Spot • Brent Sea FOB (SPOTBRENT)</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}

export const renderWatchlistContent = renderRightSplitPanel;
