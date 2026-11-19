import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.47.1';
import { TechnicalIndicators } from '../algorithms/technicalIndicators.js?v=1.47.1';
import { state, getAssetClass, escapeHtml, getInstrumentSpec, getCachedOrAggregatedCandles } from '../core/store.js?v=1.47.15';

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
  const ac = getAssetClass(code);
  if (ac === 'STOCKS') {
    return 'STOCKS';
  }
  if (ac === 'COMMODITIES') {
    return 'ENERGY';
  }
  if (ac === 'INDICES') {
    return 'INDICES';
  }
  if (ac === 'CRYPTO') {
    return 'CRYPTO';
  }
  if (ac === 'FX') {
    return 'FX';
  }
  return 'STOCKS';
}

export function getShortCategoryLabel(symbolCode, i18n) {
  const catKey = getSymbolCategoryKey(symbolCode);
  const raw =
    catKey === 'METALS'
      ? i18n?.t('watchlist_cat_metals') || 'Metals'
      : catKey === 'ENERGY'
        ? i18n?.t('watchlist_cat_energy') || 'Energy'
        : catKey === 'CRYPTO'
          ? i18n?.t('watchlist_cat_crypto') || 'Crypto'
          : catKey === 'INDICES'
            ? i18n?.t('watchlist_cat_indices') || 'Indices'
            : catKey === 'STOCKS'
              ? i18n?.t('watchlist_cat_stocks') || 'Stocks'
              : i18n?.t('watchlist_cat_fx') || 'Forex';
  return String(raw).replace(/\s*\([^)]*\)\s*/g, '').trim();
}

export const SYMBOL_CATALOG_BADGES = {
  // Commodities & Energy
  XAUUSD: {
    label: 'Au',
    color: '#F59E0B',
    bgGradient: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)',
    providerTag: 'TWELVE_DATA · biquote',
    category: 'Spot Gold · Commodity',
    svgIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 14 18 14 21 20 3 20 6 14" fill="rgba(255,255,255,0.28)"/><polygon points="8 7 16 7 18 12 6 12 8 7" fill="rgba(255,255,255,0.28)"/><path d="M12 2v2"/></svg>`,
  },
  SPOTBRENT: {
    label: 'OIL',
    color: '#2962FF',
    bgGradient: 'linear-gradient(135deg, #2962FF 0%, #1D4ED8 100%)',
    providerTag: 'PEPPERSTONE · tvdatafeed',
    category: 'Brent Crude Spot · Energy',
    svgIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.26)" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" stroke-width="1.8"/></svg>`,
  },
  USOIL: {
    label: 'WTI',
    color: '#0EA5E9',
    bgGradient: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)',
    providerTag: 'TVC · Yahoo',
    category: 'WTI Crude Oil · Energy',
    svgIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.26)" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" stroke-width="1.8"/></svg>`,
  },
  XAGUSD: {
    label: 'Ag',
    color: '#94A3B8',
    bgGradient: 'linear-gradient(135deg, #94A3B8 0%, #475569 100%)',
    providerTag: 'biquote · TWELVE_DATA',
    category: 'Spot Silver · Commodity',
    svgIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.25)" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 15 19 15 22 20 2 20 5 15"/><polygon points="8 8 16 8 18 13 6 13 8 8"/></svg>`,
  },
  EURUSD: {
    label: 'FX',
    color: '#26A69A',
    bgGradient: 'linear-gradient(135deg, #26A69A 0%, #0F766E 100%)',
    providerTag: 'TradingView · Twelve Data',
    category: 'Forex · Major Currency',
    svgIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M14.5 9a3.5 3.5 0 1 0 0 6"/><line x1="8" y1="11" x2="13" y2="11"/><line x1="8" y1="13" x2="13" y2="13"/></svg>`,
  },

  // Crypto
  BTCUSD: {
    label: 'BTC',
    color: '#F7931A',
    bgGradient: 'linear-gradient(135deg, #F7931A 0%, #C2410C 100%)',
    providerTag: 'biquote · Yahoo Finance',
    category: 'Bitcoin · Crypto',
    svgIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M9.5 8h4a2 2 0 0 1 0 4h-4h4.5a2 2 0 0 1 0 4h-4.5"/><line x1="11" y1="6" x2="11" y2="18"/></svg>`,
  },
  ETHUSD: {
    label: 'ETH',
    color: '#6366F1',
    bgGradient: 'linear-gradient(135deg, #6366F1 0%, #4338CA 100%)',
    providerTag: 'biquote · Yahoo Finance',
    category: 'Ethereum · Crypto',
    svgIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="12 2 19 12 12 15 5 12"/><polygon points="12 17 19 13 12 22 5 13"/></svg>`,
  },

  // Major Indices
  SPX500USD: {
    label: '500',
    color: '#EF4444',
    bgGradient: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
    providerTag: 'S&P Dow Jones · tvdatafeed',
    category: 'S&P 500 · US Benchmark Index',
    svgIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M5 16v-3"/><path d="M10 16v-7"/><path d="M15 16v-11"/><path d="M20 16V5"/><path d="M4 11l6-5 5 4 5-6"/></svg>`,
  },
  NDQ: {
    label: '100',
    color: '#06B6D4',
    bgGradient: 'linear-gradient(135deg, #06B6D4 0%, #0E7490 100%)',
    providerTag: 'Nasdaq Inc. · tvdatafeed',
    category: 'Nasdaq 100 · US Tech Index',
    svgIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/><path d="M8 12h2"/></svg>`,
  },

  // Megacap Tech & Entertainment
  NVDA: {
    label: 'NV',
    color: '#22C55E',
    bgGradient: 'linear-gradient(135deg, #22C55E 0%, #15803D 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Semiconductor & AI Compute',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M4 16c4-6 12-6 16 0"/><circle cx="12" cy="12" r="3" fill="#FFFFFF"/></svg>`,
  },
  AMZN: {
    label: 'AZ',
    color: '#F59E0B',
    bgGradient: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Cloud & E-Commerce',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M5 16c4 3 10 3 14 0"/><path d="M16 13l3 3-3 3"/></svg>`,
  },
  TSLA: {
    label: 'TS',
    color: '#EF4444',
    bgGradient: 'linear-gradient(135deg, #EF4444 0%, #991B1B 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Automotive & Clean Energy',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M12 4v16M6 6c3-2 9-2 12 0"/></svg>`,
  },
  AAPL: {
    label: 'AP',
    color: '#64748B',
    bgGradient: 'linear-gradient(135deg, #64748B 0%, #334155 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Consumer Electronics & Services',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.1"><path d="M12 20.94c1.88 0 3.05-.91 4.29-.91 1.23 0 2.22.91 4.1.91 2.53 0 4.61-2.13 4.61-4.75 0-2.48-1.57-4.16-3.8-4.24-1.6-.06-3.1 1.04-3.88 1.04-.79 0-2.02-.99-3.32-.99-2.2 0-4.32 1.63-4.32 4.47 0 2.97 1.94 6.47 4.32 6.47z"/><path d="M15.5 5.5c.83-1 1.3-2.3 1.15-3.5-1.2.06-2.6.8-3.4 1.8-.73.85-1.3 2.1-1.15 3.3 1.3 0 2.6-.7 3.4-1.6z"/></svg>`,
  },
  GOOGL: {
    label: 'GO',
    color: '#3B82F6',
    bgGradient: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Search & Cloud Platforms',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 12h5a5 5 0 0 1-5 5c-3 0-5-2-5-5s2-5 5-5c2 0 3.5.8 4.3 1.7"/></svg>`,
  },
  MSFT: {
    label: 'MS',
    color: '#0EA5E9',
    bgGradient: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Enterprise Software & Azure',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="1.8"><rect x="4" y="4" width="7" height="7" fill="rgba(255,255,255,0.4)"/><rect x="13" y="4" width="7" height="7" fill="rgba(255,255,255,0.4)"/><rect x="4" y="13" width="7" height="7" fill="rgba(255,255,255,0.4)"/><rect x="13" y="13" width="7" height="7" fill="rgba(255,255,255,0.4)"/></svg>`,
  },
  META: {
    label: 'MT',
    color: '#2563EB',
    bgGradient: 'linear-gradient(135deg, #2563EB 0%, #1E40AF 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Social Technology & AI',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M6 16c-2 0-3-2-3-4s1-4 3-4c3 0 4 5 6 5s3-5 6-5c2 0 3 2 3 4s-1 4-3 4c-3 0-4-5-6-5s-3 5-6 5z"/></svg>`,
  },
  NFLX: {
    label: 'NF',
    color: '#DC2626',
    bgGradient: 'linear-gradient(135deg, #DC2626 0%, #7F1D1D 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Digital Entertainment & Streaming',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4"><path d="M5 4v16M19 4v16M5 4l14 16"/></svg>`,
  },
  AMD: {
    label: 'AM',
    color: '#10B981',
    bgGradient: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Processors & Graphics',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="12 4 20 12 12 20 4 12"/></svg>`,
  },
  UBER: {
    label: 'UB',
    color: '#475569',
    bgGradient: 'linear-gradient(135deg, #475569 0%, #1E293B 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Mobility & Delivery Platform',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="#FFFFFF"/></svg>`,
  },
  NKE: {
    label: 'NK',
    color: '#F97316',
    bgGradient: 'linear-gradient(135deg, #F97316 0%, #C2410C 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Athletic Footwear & Apparel',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M4 14c4 3 12 3 16-8-4 4-10 6-16 8z"/></svg>`,
  },
  IBM: {
    label: 'IB',
    color: '#3B82F6',
    bgGradient: 'linear-gradient(135deg, #3B82F6 0%, #1E3A8A 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Enterprise IT & Hybrid Cloud',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/></svg>`,
  },
  SAN: {
    label: 'SA',
    color: '#EC1C24',
    bgGradient: 'linear-gradient(135deg, #EC1C24 0%, #991B1B 100%)',
    providerTag: 'BME · tvdatafeed',
    category: 'International Banking',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><polygon points="12 7 16 16 8 16" fill="#FFFFFF"/></svg>`,
  },

  // Semiconductors & Hardware Infrastructure
  AVGO: {
    label: 'AV',
    color: '#CC092F',
    bgGradient: 'linear-gradient(135deg, #CC092F 0%, #8A001A 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Semiconductors & Infrastructure Software',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"><path d="M2 13c3-8 7-8 10 0s7 8 10 0"/></svg>`,
  },
  MU: {
    label: 'MU',
    color: '#005A9C',
    bgGradient: 'linear-gradient(135deg, #005A9C 0%, #002D5A 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Memory & Storage Solutions (DRAM/NAND)',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16V8l4 5 4-5v8"/></svg>`,
  },
  INTC: {
    label: 'IN',
    color: '#0068B5',
    bgGradient: 'linear-gradient(135deg, #0068B5 0%, #003B6F 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Semiconductor Foundry & CPUs',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><ellipse cx="12" cy="12" rx="9" ry="5" transform="rotate(-25 12 12)"/><circle cx="12" cy="12" r="2.5" fill="#FFFFFF"/></svg>`,
  },
  MRVL: {
    label: 'MV',
    color: '#D32F2F',
    bgGradient: 'linear-gradient(135deg, #D32F2F 0%, #8E0000 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Data Infrastructure Semiconductors',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M4 18V6l8 8 8-8v12"/><line x1="12" y1="14" x2="12" y2="20"/></svg>`,
  },
  AMAT: {
    label: 'AT',
    color: '#00838F',
    bgGradient: 'linear-gradient(135deg, #00838F 0%, #004D40 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Semiconductor Manufacturing Equipment',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>`,
  },
  LRCX: {
    label: 'LC',
    color: '#1565C0',
    bgGradient: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Wafer Fabrication & Etching Equipment',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="12 3 21 12 12 21 3 12"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
  },
  QCOM: {
    label: 'QC',
    color: '#1976D2',
    bgGradient: 'linear-gradient(135deg, #1976D2 0%, #0D47A1 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Wireless Technologies & Mobile SoC',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="3" fill="#FFFFFF"/><path d="M7.76 7.76a6 6 0 0 0 0 8.48"/><path d="M16.24 7.76a6 6 0 0 1 0 8.48"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  },
  SMCI: {
    label: 'SM',
    color: '#059669',
    bgGradient: 'linear-gradient(135deg, #059669 0%, #064E3B 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'High-Performance Enterprise Servers',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><rect x="4" y="4" width="16" height="5" rx="1"/><rect x="4" y="11" width="16" height="5" rx="1"/><rect x="4" y="18" width="16" height="5" rx="1"/><circle cx="7" cy="6.5" r="1" fill="#FFFFFF"/><circle cx="7" cy="13.5" r="1" fill="#FFFFFF"/><circle cx="7" cy="20.5" r="1" fill="#FFFFFF"/></svg>`,
  },
  DELL: {
    label: 'DL',
    color: '#0076CE',
    bgGradient: 'linear-gradient(135deg, #0076CE 0%, #004680 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'IT Hardware & Enterprise Storage',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M8 8h4a4 4 0 0 1 0 8H8z"/></svg>`,
  },
  SNDK: {
    label: 'SD',
    color: '#D32F2F',
    bgGradient: 'linear-gradient(135deg, #D32F2F 0%, #9A0007 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Flash Storage & Memory Tech',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><rect x="6" y="5" width="12" height="14" rx="2"/><line x1="9" y1="5" x2="9" y2="2"/><line x1="12" y1="5" x2="12" y2="2"/><line x1="15" y1="5" x2="15" y2="2"/></svg>`,
  },
  ANET: {
    label: 'AN',
    color: '#3949AB',
    bgGradient: 'linear-gradient(135deg, #3949AB 0%, #1A237E 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Cloud Networking & Switch Mesh',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><line x1="8" y1="7.5" x2="16" y2="7.5"/><line x1="7.5" y1="8" x2="10.5" y2="16"/><line x1="16.5" y1="8" x2="13.5" y2="16"/></svg>`,
  },
  TSM: {
    label: 'TSM',
    color: '#006699',
    bgGradient: 'linear-gradient(135deg, #006699 0%, #003366 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Advanced Pure-Play Semiconductor Foundry',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="4.5"/></svg>`,
  },
  ASML: {
    label: 'ASM',
    color: '#1E1B4B',
    bgGradient: 'linear-gradient(135deg, #312E81 0%, #0F172A 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'EUV Lithography Systems for Semis',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><rect x="4" y="4" width="16" height="16" rx="2"/><polygon points="12 7 16 17 8 17"/></svg>`,
  },
  SSNLF: {
    label: 'SEC',
    color: '#1428A0',
    bgGradient: 'linear-gradient(135deg, #1428A0 0%, #071363 100%)',
    providerTag: 'KRX · tvdatafeed',
    category: 'Global Electronics, Memory & Displays',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><ellipse cx="12" cy="12" rx="10" ry="5.5" transform="rotate(-20 12 12)"/></svg>`,
  },
  SKHY: {
    label: 'SKH',
    color: '#EA580C',
    bgGradient: 'linear-gradient(135deg, #EA580C 0%, #9A3412 100%)',
    providerTag: 'KRX · tvdatafeed',
    category: 'High-Bandwidth Memory (HBM) Leader',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="12 2 20 8 16 18 12 14 8 18 4 8"/></svg>`,
  },

  // AI, Cloud & Enterprise Software
  PLTR: {
    label: 'PLT',
    color: '#334155',
    bgGradient: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Enterprise AI & Defense Analytics',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="10" r="5"/><ellipse cx="12" cy="14" rx="8" ry="4"/><circle cx="12" cy="10" r="1.5" fill="#FFFFFF"/></svg>`,
  },
  ORCL: {
    label: 'OR',
    color: '#C74634',
    bgGradient: 'linear-gradient(135deg, #C74634 0%, #8C2417 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Enterprise Database & Cloud Infrastructure',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><ellipse cx="12" cy="12" rx="9" ry="5"/></svg>`,
  },
  CRM: {
    label: 'SF',
    color: '#00A1E0',
    bgGradient: 'linear-gradient(135deg, #00A1E0 0%, #0070B8 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Customer Relationship Cloud Software',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></svg>`,
  },
  ADBE: {
    label: 'AD',
    color: '#FA0F00',
    bgGradient: 'linear-gradient(135deg, #FA0F00 0%, #A80000 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Creative Cloud & Document Intelligence',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="12 4 19 20 15 20 12 13 9 20 5 20"/></svg>`,
  },
  CRWD: {
    label: 'CW',
    color: '#E53935',
    bgGradient: 'linear-gradient(135deg, #E53935 0%, #B71C1C 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Cloud-Native Cybersecurity & EDR',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  },
  CSCO: {
    label: 'CS',
    color: '#049FD9',
    bgGradient: 'linear-gradient(135deg, #049FD9 0%, #005073 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Enterprise Networking & Communications',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="15" x2="4" y2="18"/><line x1="8" y1="11" x2="8" y2="18"/><line x1="12" y1="7" x2="12" y2="18"/><line x1="16" y1="11" x2="16" y2="18"/><line x1="20" y1="15" x2="20" y2="18"/></svg>`,
  },
  APP: {
    label: 'AL',
    color: '#8B5CF6',
    bgGradient: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Mobile Marketing & Monetization Engine',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M4 18l6-6 4 4 6-8"/><polyline points="15 8 20 8 20 13"/></svg>`,
  },
  NBIS: {
    label: 'NB',
    color: '#4F46E5',
    bgGradient: 'linear-gradient(135deg, #4F46E5 0%, #312E81 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'AI Infrastructure & GPU Supercomputing',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="12" r="2.5" fill="#FFFFFF"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><line x1="8" y1="7" x2="10" y2="11"/><line x1="16" y1="7" x2="14" y2="11"/><line x1="8" y1="17" x2="10" y2="13"/><line x1="16" y1="17" x2="14" y2="13"/></svg>`,
  },
  CRWV: {
    label: 'CW',
    color: '#0D9488',
    bgGradient: 'linear-gradient(135deg, #0D9488 0%, #115E59 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Specialized Generative AI Cloud GPU',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="12 2 21 7 12 12 3 7"/><polygon points="12 12 21 17 12 22 3 17"/><line x1="12" y1="12" x2="12" y2="22"/></svg>`,
  },
  SAP: {
    label: 'SAP',
    color: '#008FD3',
    bgGradient: 'linear-gradient(135deg, #008FD3 0%, #005691 100%)',
    providerTag: 'XETRA · tvdatafeed',
    category: 'Enterprise Resource Planning & Cloud ERP',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="4 6 12 2 20 6 20 18 12 22 4 18"/></svg>`,
  },

  // Space, Quantum & Future Tech
  SPCX: {
    label: 'SPX',
    color: '#262626',
    bgGradient: 'linear-gradient(135deg, #262626 0%, #000000 100%)',
    providerTag: 'SpaceX Track · tvdatafeed',
    category: 'Aerospace & Orbital Launch Systems',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>`,
  },
  RKLB: {
    label: 'RL',
    color: '#C62828',
    bgGradient: 'linear-gradient(135deg, #C62828 0%, #7F0000 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Small Satellite Launch & Space Systems',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M12 2l3 7h-6z"/><rect x="9" y="9" width="6" height="8"/><path d="M7 17l2-3v3z"/><path d="M17 17l-2-3v3z"/><path d="M10 17v4l2-1 2 1v-4"/></svg>`,
  },
  GEV: {
    label: 'GEV',
    color: '#16A34A',
    bgGradient: 'linear-gradient(135deg, #16A34A 0%, #14532D 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Clean Energy, Wind & Grid Modernization',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="2.5" fill="#FFFFFF"/><path d="M12 9.5V2l2 4z"/><path d="M14.5 13.5l6.5 3.5-4 1z"/><path d="M9.5 13.5L3 17l2-4z"/></svg>`,
  },
  BE: {
    label: 'BE',
    color: '#10B981',
    bgGradient: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Solid Oxide Fuel Cells & Clean Power',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M11 20A7 7 0 0 1 4 13C4 7 11 3 11 3s7 4 7 10a7 7 0 0 1-7 7z"/><path d="M11 20v-9"/></svg>`,
  },
  IONQ: {
    label: 'IQ',
    color: '#7C3AED',
    bgGradient: 'linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Trapped-Ion Quantum Computing',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="3" fill="#FFFFFF"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)"/></svg>`,
  },
  RIVN: {
    label: 'RIV',
    color: '#D97706',
    bgGradient: 'linear-gradient(135deg, #D97706 0%, #78350F 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Electric Adventure Vehicles & Delivery Vans',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="12 3 20 12 12 21 4 12"/></svg>`,
  },

  // Banking, FinTech & Payments
  JPM: {
    label: 'JPM',
    color: '#117ACA',
    bgGradient: 'linear-gradient(135deg, #117ACA 0%, #0A436D 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Diversified Global Investment Banking',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="7 3 17 3 21 7 21 17 17 21 7 21 3 17 3 7"/></svg>`,
  },
  BAC: {
    label: 'BAC',
    color: '#0052C2',
    bgGradient: 'linear-gradient(135deg, #0052C2 0%, #B71C1C 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Commercial & Consumer Banking',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><rect x="4" y="5" width="16" height="4" fill="rgba(255,255,255,0.4)"/><rect x="4" y="10" width="16" height="4"/><rect x="4" y="15" width="16" height="4" fill="rgba(255,255,255,0.4)"/></svg>`,
  },
  GS: {
    label: 'GS',
    color: '#7399C6',
    bgGradient: 'linear-gradient(135deg, #7399C6 0%, #2B547E 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Investment Banking & Wealth Management',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.5" fill="#FFFFFF"/></svg>`,
  },
  V: {
    label: 'V',
    color: '#1A1F71',
    bgGradient: 'linear-gradient(135deg, #1A1F71 0%, #0F1347 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Global Digital Payments Network',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="3 6 8 18 12 18 17 6 13 6 10 14 7 6"/></svg>`,
  },
  MA: {
    label: 'MA',
    color: '#EB001B',
    bgGradient: 'linear-gradient(135deg, #EB001B 0%, #F79E1B 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Payment Technology & Transaction Processing',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="9" cy="12" r="6" fill="rgba(235,0,27,0.6)"/><circle cx="15" cy="12" r="6" fill="rgba(247,158,27,0.6)"/></svg>`,
  },
  'BRK.B': {
    label: 'BRK',
    color: '#002244',
    bgGradient: 'linear-gradient(135deg, #002244 0%, #001122 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Diversified Holding & Value Investing',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7"/><line x1="12" y1="7" x2="12" y2="17"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
  },
  BRKB: {
    label: 'BRK',
    color: '#002244',
    bgGradient: 'linear-gradient(135deg, #002244 0%, #001122 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Diversified Holding & Value Investing',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7"/><line x1="12" y1="7" x2="12" y2="17"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
  },
  HOOD: {
    label: 'HD',
    color: '#00C805',
    bgGradient: 'linear-gradient(135deg, #00C805 0%, #008003 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Retail FinTech & Crypto Brokerage',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M20 4s-8 1-12 7c-2 3-2 6-2 9 0 0 4-1 6-4 3-4 8-12 8-12z"/></svg>`,
  },
  MSTR: {
    label: 'MST',
    color: '#D32F2F',
    bgGradient: 'linear-gradient(135deg, #D32F2F 0%, #8B0000 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Bitcoin Treasury & Enterprise Analytics',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polyline points="4 18 4 6 12 14 20 6 20 18"/></svg>`,
  },
  PYPL: {
    label: 'PY',
    color: '#003087',
    bgGradient: 'linear-gradient(135deg, #003087 0%, #0079C1 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Digital Checkout & Peer-to-Peer Payments',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M7 4h7a4 4 0 0 1 4 4c0 3-2 5-5 5H9l-2 7"/></svg>`,
  },
  COIN: {
    label: 'CN',
    color: '#0052FF',
    bgGradient: 'linear-gradient(135deg, #0052FF 0%, #0033A0 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Cryptocurrency Trading & Custody Platform',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 8h4"/></svg>`,
  },
  HSBC: {
    label: 'HSB',
    color: '#DB0011',
    bgGradient: 'linear-gradient(135deg, #DB0011 0%, #8B0000 100%)',
    providerTag: 'LSE · tvdatafeed',
    category: 'Global Banking & Financial Services',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="6 6 18 6 12 12"/><polygon points="6 18 18 18 12 12"/></svg>`,
  },

  // Retail, Consumer & Automotive
  WMT: {
    label: 'WMT',
    color: '#0071DC',
    bgGradient: 'linear-gradient(135deg, #0071DC 0%, #004F9E 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Omnichannel Retail & Supercenters',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFC220" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="22"/><line x1="3.34" y1="7" x2="7.67" y2="9.5"/><line x1="16.33" y1="14.5" x2="20.66" y2="17"/><line x1="3.34" y1="17" x2="7.67" y2="14.5"/><line x1="16.33" y1="9.5" x2="20.66" y2="7"/></svg>`,
  },
  COST: {
    label: 'COS',
    color: '#E31837',
    bgGradient: 'linear-gradient(135deg, #E31837 0%, #8E0011 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Membership Wholesale Club Retail',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
  },
  DIS: {
    label: 'DIS',
    color: '#001A9C',
    bgGradient: 'linear-gradient(135deg, #001A9C 0%, #000B4F 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Media Entertainment, Parks & Disney+',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M5 20V10l3-3 4 4 4-4 3 3v10"/><path d="M12 2v5"/></svg>`,
  },
  SBUX: {
    label: 'SB',
    color: '#00704A',
    bgGradient: 'linear-gradient(135deg, #00704A 0%, #00432C 100%)',
    providerTag: 'NASDAQ · tvdatafeed',
    category: 'Specialty Coffee Roaster & Retailer',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><polygon points="12 6 13.5 10.5 18 10.5 14.5 13.5 16 18 12 15 8 18 9.5 13.5 6 10.5 10.5 10.5" fill="#FFFFFF"/></svg>`,
  },
  MCD: {
    label: 'MCD',
    color: '#DA291C',
    bgGradient: 'linear-gradient(135deg, #DA291C 0%, #991B1B 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Global Quick Service Restaurant Franchise',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFC72C" stroke-width="2.5"><path d="M4 18c0-7 4-10 4-10s4 3 4 10c0-7 4-10 4-10s4 3 4 10"/></svg>`,
  },
  KO: {
    label: 'KO',
    color: '#F40009',
    bgGradient: 'linear-gradient(135deg, #F40009 0%, #990000 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Non-Alcoholic Beverage Leader',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M3 14c4 4 14-8 18-4"/><circle cx="12" cy="12" r="8"/></svg>`,
  },
  BABA: {
    label: 'BBA',
    color: '#FF6A00',
    bgGradient: 'linear-gradient(135deg, #FF6A00 0%, #B84300 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Global E-Commerce & Alibaba Cloud',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M8 14c2 3 6 3 8 0"/></svg>`,
  },
  TM: {
    label: 'TM',
    color: '#EB0A1E',
    bgGradient: 'linear-gradient(135deg, #EB0A1E 0%, #8B0000 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Global Automotive Manufacturing & Hybrids',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><ellipse cx="12" cy="12" rx="9" ry="6"/><ellipse cx="12" cy="11" rx="4" ry="2.5"/><line x1="12" y1="6" x2="12" y2="18"/></svg>`,
  },

  // Healthcare & Pharmaceuticals
  LLY: {
    label: 'LLY',
    color: '#D52B1E',
    bgGradient: 'linear-gradient(135deg, #D52B1E 0%, #801008 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Metabolic & Oncology Pharmaceuticals',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M9 3h6v4l5 12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2L9 7V3z"/></svg>`,
  },
  UNH: {
    label: 'UNH',
    color: '#002677',
    bgGradient: 'linear-gradient(135deg, #002677 0%, #00123D 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Diversified Healthcare Benefits & Optum',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="14"/><line x1="9" y1="11" x2="15" y2="11"/></svg>`,
  },
  PFE: {
    label: 'PFE',
    color: '#0093D0',
    bgGradient: 'linear-gradient(135deg, #0093D0 0%, #00567A 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Biopharmaceuticals & Vaccines',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M4 6c8 0 8 12 16 12"/><path d="M4 18c8 0 8-12 16-12"/><line x1="8" y1="9" x2="8" y2="15"/><line x1="16" y1="9" x2="16" y2="15"/></svg>`,
  },
  NVO: {
    label: 'NVO',
    color: '#003087',
    bgGradient: 'linear-gradient(135deg, #003087 0%, #001A4E 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Diabetes & Obesity Care Therapeutics',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/></svg>`,
  },

  // Oil & Energy Giants
  XOM: {
    label: 'XOM',
    color: '#ED1B2D',
    bgGradient: 'linear-gradient(135deg, #ED1B2D 0%, #8B0000 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Integrated Global Energy & Petrochemicals',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><line x1="5" y1="6" x2="11" y2="18"/><line x1="11" y1="6" x2="5" y2="18"/><line x1="13" y1="6" x2="19" y2="18"/><line x1="19" y1="6" x2="13" y2="18"/></svg>`,
  },
  CVX: {
    label: 'CVX',
    color: '#0054A6',
    bgGradient: 'linear-gradient(135deg, #0054A6 0%, #002D5A 100%)',
    providerTag: 'NYSE · tvdatafeed',
    category: 'Integrated Exploration & Refining',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4"><polyline points="5 7 12 13 19 7"/><polyline points="5 13 12 19 19 13"/></svg>`,
  },
  '2222.SR': {
    label: 'ARM',
    color: '#007A3D',
    bgGradient: 'linear-gradient(135deg, #007A3D 0%, #004D26 100%)',
    providerTag: 'TADAWUL · tvdatafeed',
    category: 'Saudi Aramco · Integrated Petroleum Giant',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="12 2 15 8 22 9 17 14 18 21 12 18 6 21 7 14 2 9 9 8" fill="rgba(255,255,255,0.3)"/></svg>`,
  },
  '2222SR': {
    label: 'ARM',
    color: '#007A3D',
    bgGradient: 'linear-gradient(135deg, #007A3D 0%, #004D26 100%)',
    providerTag: 'TADAWUL · tvdatafeed',
    category: 'Saudi Aramco · Integrated Petroleum Giant',
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><polygon points="12 2 15 8 22 9 17 14 18 21 12 18 6 21 7 14 2 9 9 8" fill="rgba(255,255,255,0.3)"/></svg>`,
  },
};

export function getAssetBadge(symbolCode) {
  const code = String(symbolCode || '').toUpperCase().trim();
  const directHit = SYMBOL_CATALOG_BADGES[code];
  if (directHit) {
    return directHit;
  }
  const cleanCode = code.replace(/[^A-Z0-9]/g, '');
  if (SYMBOL_CATALOG_BADGES[cleanCode]) {
    return SYMBOL_CATALOG_BADGES[cleanCode];
  }

  // Graceful category-aware fallback for custom symbols added by user
  const assetClass = getAssetClass(code);
  const isCommodity = assetClass === 'COMMODITIES';
  const isCrypto = assetClass === 'CRYPTO';
  const isFx = assetClass === 'FOREX';

  const pal = isCommodity
    ? ['#F59E0B', 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)', 'Commodity']
    : isCrypto
    ? ['#8B5CF6', 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)', 'Crypto Asset']
    : isFx
    ? ['#10B981', 'linear-gradient(135deg, #10B981 0%, #047857 100%)', 'Currencies']
    : ['#2962FF', 'linear-gradient(135deg, #2962FF 0%, #1E40AF 100%)', 'Equity Stock'];

  return {
    label: code.slice(0, 3) || 'SYM',
    color: pal[0],
    bgGradient: pal[1],
    providerTag: 'TradingView (tvdatafeed)',
    category: `${code} · ${pal[2]}`,
    svgIcon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  };
}

export function getInstrumentProfileMeta(symbolCode, providerBadge) {
  const code = String(symbolCode || '').toUpperCase();
  const assetClass = getAssetClass(code);
  if (assetClass === 'COMMODITIES' && (code.includes('XAU') || code.includes('GOLD'))) {
    return {
      assetClass,
      sector: 'Precious Metals',
      industry: 'Spot Bullion (LBMA / OTC)',
      benchmark: `XAU/USD Spot · ${providerBadge}`,
      spec1Label: 'Contract / Unit',
      spec1Val: '1 Troy Ounce (XAU)',
      spec2Label: 'Settlement Hub',
      spec2Val: 'London LBMA / OTC 24h',
      spec3Label: 'Primary Drivers',
      spec3Val: 'US Real Yields • DXY • Central Banks',
      figi: 'BBG000B9XRY4',
      isin: 'XC0009655157',
    };
  }
  if (assetClass === 'COMMODITIES' && (code.includes('BRENT') || code.includes('OIL') || code.includes('WTI'))) {
    const isWti = code.includes('USOIL') || code.includes('WTI');
    return {
      assetClass,
      sector: 'Energy Commodities',
      industry: isWti ? 'WTI Crude Oil (NYMEX Benchmark)' : 'North Sea Brent Crude',
      benchmark: isWti ? `WTI Cushing / NYMEX · ${providerBadge}` : `Dated Brent / ICE · ${providerBadge}`,
      spec1Label: 'Contract / Unit',
      spec1Val: '1 Barrel (42 US Gal)',
      spec2Label: 'Settlement Hub',
      spec2Val: isWti ? 'Cushing OK / NYMEX' : 'North Sea / ICE Futures',
      spec3Label: 'Weekly Catalyst',
      spec3Val: 'EIA Weekly Petroleum Status (Wed)',
      figi: isWti ? 'BBG000F5N218' : 'BBG000G2R5T8',
      isin: isWti ? 'US000WTI0001' : 'EU0009658426',
    };
  }
  if (assetClass === 'COMMODITIES') {
    return {
      assetClass,
      sector: 'Precious & Industrial Metals',
      industry: 'Spot Silver Bullion',
      benchmark: `${code} Spot · ${providerBadge}`,
      spec1Label: 'Contract / Unit',
      spec1Val: '1 Troy Ounce (XAG)',
      spec2Label: 'Settlement Hub',
      spec2Val: 'LBMA / COMEX OTC',
      spec3Label: 'Primary Drivers',
      spec3Val: 'Industrial Demand • Gold/Silver Ratio',
      figi: 'BBG000B9XVV8',
      isin: 'XC0009653103',
    };
  }
  if (assetClass === 'CRYPTO') {
    const isEth = code.includes('ETH');
    return {
      assetClass,
      sector: 'Digital Assets / Crypto',
      industry: isEth ? 'Layer-1 Smart Contract Network' : 'Proof-of-Work Digital Asset',
      benchmark: `${code} Spot · ${providerBadge}`,
      spec1Label: 'Trading Hours',
      spec1Val: '24/7 Continuous Spot',
      spec2Label: 'Quote Currency',
      spec2Val: 'U.S. Dollar (USD)',
      spec3Label: 'Consensus Mechanism',
      spec3Val: isEth ? 'Proof of Stake (Ethereum)' : 'Proof of Work (Bitcoin)',
      figi: isEth ? 'BBG00ZGF7798' : 'BBG00ZGF7771',
      isin: isEth ? 'XTV000ETHUSD' : 'XTV000BTCUSD',
    };
  }
  if (assetClass === 'INDICES') {
    const isNdq = code === 'NDQ' || code.includes('NDX');
    return {
      assetClass,
      sector: 'Equity Index Benchmark',
      industry: isNdq ? 'Nasdaq-100 Large-Cap Growth' : 'S&P 500 US Broad Market',
      benchmark: `${isNdq ? 'NDX' : 'SPX'} Cash / CFD · ${providerBadge}`,
      spec1Label: 'Index Weighting',
      spec1Val: 'Modified Market Cap',
      spec2Label: 'Core Cash Session',
      spec2Val: '14:30 – 21:00 UTC (NYSE/NASDAQ)',
      spec3Label: 'Constituents Scope',
      spec3Val: isNdq ? '100 Non-Financial Leaders' : '500 Large-Cap US Equities',
      figi: isNdq ? 'BBG000K436L4' : 'BBG000H4FSM0',
      isin: isNdq ? 'US6311011026' : 'US78378X1072',
    };
  }
  if (assetClass === 'STOCKS') {
    return {
      assetClass,
      sector: 'US Listed Equities',
      industry: 'Publicly Traded Common Stock',
      benchmark: `NASDAQ / NYSE Primary · ${providerBadge}`,
      spec1Label: 'Primary Venue',
      spec1Val: 'NASDAQ / NYSE Common Equity',
      spec2Label: 'Regulatory Filings',
      spec2Val: 'SEC EDGAR (10-K • 10-Q • 8-K)',
      spec3Label: 'Regular Session',
      spec3Val: '09:30 – 16:00 EST (14:30 – 21:00 UTC)',
      figi: `BBG000${code.slice(0, 6)}`,
      isin: `US${code.slice(0, 6)}0001`,
    };
  }
  return {
    assetClass: 'FX',
    sector: 'Foreign Exchange (G10)',
    industry: 'Spot Interbank Currency Pair',
    benchmark: `${code} Interbank Spot · ${providerBadge}`,
    spec1Label: 'Trading Hours',
    spec1Val: '24/5 Sydney → Tokyo → London → NY',
    spec2Label: 'Quote Precision',
    spec2Val: '4–5 Decimal Pip Feed',
    spec3Label: 'Primary Drivers',
    spec3Val: 'Central Bank Rate Differentials',
    figi: 'BBG0013HG040',
    isin: 'EU0009652759',
  };
}

export function renderSymbolBadge(symbolCode, sizePx = 22) {
  const badge = getAssetBadge(symbolCode);
  return `<span class="tv-wl-icon-badge" style="width: ${sizePx}px; height: ${sizePx}px; min-width: ${sizePx}px; background: ${badge.bgGradient};" title="${badge.category}">${badge.svgIcon}</span>`;
}

function getCandleMs(c) {
  if (!c) return 0;
  return (
    Number(c.open_time_utc_ms) ||
    Number(c.openTimeSec || 0) * 1000 ||
    Date.parse(c.open_time_utc || '') ||
    0
  );
}

export function computeDayStats(s, overrideCandles = null) {
  const hasOverride = Array.isArray(overrideCandles) && overrideCandles.length > 0;
  const candles = hasOverride ? overrideCandles : s.candles || [];
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
  const latestMs = getCandleMs(latestCandle);
  const nowMinuteBucket = Math.floor(Date.now() / 30000);
  const cacheSig = `${candles.length}_${latestMs}_${lastClose}_${s.connectionStatus}_${s.lastSuccessfulFetchMs || 0}_${nowMinuteBucket}`;
  if (!hasOverride && s._dayStatsCache && s._dayStatsCache.sig === cacheSig) {
    return s._dayStatsCache.val;
  }

  const latestDayKey = latestMs > 0 ? PriceFormatter.getSessionDayKey(latestMs, s.symbolCode) : '';

  const sessionBars = [];
  let prevClose = null;
  for (let i = candles.length - 1; i >= 0; i--) {
    const c = candles[i];
    const ms = getCandleMs(c);
    const dk = ms > 0 ? PriceFormatter.getSessionDayKey(ms, s.symbolCode) : latestDayKey;
    if (!latestDayKey || dk === latestDayKey) {
      sessionBars.unshift(c);
    } else {
      prevClose = Number(c.close);
      break;
    }
  }

  const daySlice = sessionBars.length > 0 ? sessionBars : [latestCandle];
  let dayLow = Infinity;
  let dayHigh = -Infinity;
  let volSum = 0;

  for (const c of daySlice) {
    const lo = Number(c.low);
    const hi = Number(c.high);
    if (Number.isFinite(lo) && lo > 0) dayLow = Math.min(dayLow, lo);
    if (Number.isFinite(hi) && hi > 0) dayHigh = Math.max(dayHigh, hi);
    volSum += Number(c.volume || 0);
  }
  if (!Number.isFinite(dayLow)) dayLow = lastClose;
  if (!Number.isFinite(dayHigh)) dayHigh = lastClose;

  if (prevClose === null) {
    const d1Key = `${s.symbolCode}_${s.activeProvider || 'tvdatafeed'}_D1`;
    const d1Candles = state.candleCache && state.candleCache[d1Key];
    if (Array.isArray(d1Candles) && d1Candles.length > 0) {
      for (let i = d1Candles.length - 1; i >= 0; i--) {
        const ms = getCandleMs(d1Candles[i]);
        const dk = ms > 0 ? PriceFormatter.getSessionDayKey(ms, s.symbolCode) : '';
        if (dk && latestDayKey && dk < latestDayKey) {
          prevClose = Number(d1Candles[i].close);
          break;
        }
      }
    }
  }
  if (prevClose === null || !Number.isFinite(prevClose) || prevClose <= 0) {
    prevClose = Number(daySlice[0].open || lastClose);
  }

  const openPrice = Number(daySlice[0].open || latestCandle.open || lastClose);
  const nowMs = Date.now();
  const lastFetchMs = Number(s.lastSuccessfulFetchMs || 0);
  const isLive =
    s.connectionStatus === 'LIVE' &&
    PriceFormatter.isMarketOpen(nowMs, s.symbolCode) &&
    lastFetchMs > 0 &&
    nowMs - lastFetchMs < 180000;

  const result = {
    lastClose,
    prevClose,
    openPrice,
    dayLow,
    dayHigh,
    volume: volSum > 0 ? volSum : Number(latestCandle.volume || 0),
    isLive,
  };
  if (!hasOverride) {
    s._dayStatsCache = { sig: cacheSig, val: result };
  }
  return result;
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

  const allInWatchlist = state.symbols.filter((s) => s.inWatchlist);
  const cleanCatLabel = (key, fallback) =>
    String(i18n.t(key) || fallback).replace(/\s*\([^)]*\)\s*/g, '').trim();
  const categories = [
    { key: 'ALL', label: cleanCatLabel('watchlist_cat_all', 'All') },
    { key: 'METALS', label: cleanCatLabel('watchlist_cat_metals', 'Metals') },
    { key: 'ENERGY', label: cleanCatLabel('watchlist_cat_energy', 'Energy') },
    { key: 'CRYPTO', label: cleanCatLabel('watchlist_cat_crypto', 'Crypto') },
    { key: 'INDICES', label: cleanCatLabel('watchlist_cat_indices', 'Indices') },
    { key: 'STOCKS', label: cleanCatLabel('watchlist_cat_stocks', 'Stocks') },
    { key: 'FX', label: cleanCatLabel('watchlist_cat_fx', 'Forex') },
  ].map((cat) => ({
    ...cat,
    count:
      cat.key === 'ALL'
        ? allInWatchlist.length
        : allInWatchlist.filter((s) => getSymbolCategoryKey(s.symbolCode) === cat.key).length,
  }));

  const catOptionsHtml = categories
    .map(
      (cat) =>
        `<option value="${cat.key}" ${activeCat === cat.key ? 'selected' : ''}>${cat.label} (${cat.count})</option>`
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

      const safeCode = escapeHtml(s.symbolCode);
      return `
        <div
          class="tv-wl-row ${isSelected ? 'active' : ''}"
          draggable="true"
          data-symbol="${safeCode}"
          data-index="${idx}"
          data-action="open-chart"
          dir="ltr"
        >
          <div class="tv-wl-sym-cell">
            <span
              class="tv-wl-drag-handle"
              title="${escapeHtml(i18n.t('watchlist_reorder_hint') || 'Drag to reorder / جابجایی سهم')}"
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
            <span class="tv-wl-ticker ltr-num">${safeCode}</span>
          </div>
          <div class="tv-wl-num ltr-num" style="color: var(--text-strong); font-weight: 600;">
            ${PriceFormatter.formatPrice(d.lastClose, s.decimals)}
          </div>
          <div class="tv-wl-num tv-wl-col-chg ltr-num" style="color: ${isBull ? 'var(--bull)' : 'var(--bear)'};">
            ${sign}${PriceFormatter.formatPrice(diff, s.decimals)}
          </div>
          <div class="tv-wl-num ltr-num" style="color: ${isBull ? 'var(--bull)' : 'var(--bear)'}; font-weight: 600;">
            <span>${pct}</span>
          </div>
          <div class="tv-wl-row-actions">
            <button
              type="button"
              class="tv-wl-move-btn"
              data-action="move-watchlist-symbol"
              data-direction="up"
              data-symbol="${safeCode}"
              title="${escapeHtml(i18n.t('watchlist_move_up'))}"
            >▲</button>
            <button
              type="button"
              class="tv-wl-move-btn"
              data-action="move-watchlist-symbol"
              data-direction="down"
              data-symbol="${safeCode}"
              title="${escapeHtml(i18n.t('watchlist_move_down'))}"
            >▼</button>
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
    const shortCategory = getShortCategoryLabel(sym.symbolCode, i18n);
    const rawTitle = sym.customTitle || i18n.t('symbol_' + sym.symbolCode) || sym.symbolCode;
    const cleanTitle = rawTitle.replace(/\s*\([A-Z0-9_]+\)\s*/g, '').trim() || rawTitle;
    const hasDistinctName = cleanTitle && cleanTitle.toUpperCase() !== sym.symbolCode.toUpperCase();
    const rangeSpan = Math.max(0.00001, d.dayHigh - d.dayLow);
    const posPct = Math.max(4, Math.min(96, Math.round(((d.lastClose - d.dayLow) / rangeSpan) * 100)));

    detailsHtml = `
      <div class="tv-symbol-details-pane" dir="ltr">
        <div class="tv-detail-header-row">
          <div class="tv-detail-title-group">
            ${renderSymbolBadge(sym.symbolCode, 22)}
            <strong class="tv-detail-sym-code ltr-num">${escapeHtml(sym.symbolCode)}</strong>
            ${
              hasDistinctName
                ? `<span class="tv-detail-sym-name-inline" dir="auto" title="${escapeHtml(cleanTitle)}">· ${escapeHtml(cleanTitle)}</span>`
                : ''
            }
          </div>
          <span class="tv-detail-cat-pill" dir="auto">${escapeHtml(shortCategory)}</span>
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
          <span style="flex-shrink: 0;">${i18n.t('nav_watchlist')}</span>
          <input
            id="tv-watchlist-search-input"
            type="text"
            class="tv-wl-header-search"
            placeholder="${escapeHtml(i18n.t('watchlist_search_placeholder'))}"
            value="${escapeHtml(state.watchlistSearchQuery || '')}"
            data-action="watchlist-search"
          />
          <button class="tv-tool-btn" style="flex-shrink: 0;" data-action="open-add-symbol-modal" title="${i18n.t('settings_add_custom_symbol')}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>

        <div class="tv-wl-cat-bar">
          <label class="tv-wl-cat-label" for="tv-wl-category-select">
            ${i18n.getCurrentLanguage() === 'fa' ? 'بازار' : 'Market'}
          </label>
          <select
            id="tv-wl-category-select"
            class="tv-wl-cat-select"
            data-action="set-wl-category-select"
            dir="auto"
          >
            ${catOptionsHtml}
          </select>
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

function computeRealOverviewMetrics(candles = [], decimals = 2, i18n) {
  const n = Array.isArray(candles) ? candles.length : 0;
  if (n === 0) {
    return { hasCandles: false };
  }
  const latest = candles[n - 1];
  const lastClose = Number(latest.close || 0);
  const tailWindow = n > 200 ? candles.slice(-200) : candles;
  const tn = tailWindow.length;
  const rsiArr = TechnicalIndicators.computeRsi(tailWindow, 14);
  const sma20Arr = TechnicalIndicators.computeSma(tailWindow, 20);
  const sma50Arr = TechnicalIndicators.computeSma(tailWindow, 50);
  const atrArr = TechnicalIndicators.computeAtr(tailWindow, 14);

  const rsi14 = rsiArr[tn - 1];
  const sma20 = sma20Arr[tn - 1];
  const sma50 = sma50Arr[tn - 1];
  const atr14 = atrArr[tn - 1];

  let bullCount = 0;
  let bearCount = 0;
  let periodHigh = -Infinity;
  let periodLow = Infinity;
  let volSum = 0;
  for (const c of candles) {
    const o = Number(c.open || 0);
    const cl = Number(c.close || 0);
    const hi = Number(c.high || cl);
    const lo = Number(c.low || cl);
    if (cl >= o) bullCount++;
    else bearCount++;
    if (Number.isFinite(hi) && hi > periodHigh) periodHigh = hi;
    if (Number.isFinite(lo) && lo < periodLow) periodLow = lo;
    volSum += Number(c.volume || 0);
  }
  const bullPct = n > 0 ? Math.round((bullCount / n) * 100) : 50;
  const bearPct = 100 - bullPct;

  const pivotBar = n >= 2 ? candles[n - 2] : latest;
  const ph = Number(pivotBar.high || lastClose);
  const pl = Number(pivotBar.low || lastClose);
  const pc = Number(pivotBar.close || lastClose);
  const pivot = (ph + pl + pc) / 3;
  const r1 = 2 * pivot - pl;
  const r2 = pivot + (ph - pl);
  const s1 = 2 * pivot - ph;
  const s2 = pivot - (ph - pl);

  let score = 0;
  let signals = 0;
  if (sma20 !== null) {
    signals++;
    score += lastClose > sma20 ? 1 : -1;
  }
  if (sma50 !== null) {
    signals++;
    score += lastClose > sma50 ? 1 : -1;
  }
  if (rsi14 !== null) {
    signals++;
    score += rsi14 >= 55 ? 1 : rsi14 <= 45 ? -1 : 0;
  }
  signals++;
  score += bullPct >= 54 ? 1 : bullPct <= 46 ? -1 : 0;

  const normScore = signals > 0 ? score / signals : 0; // -1..+1
  const needleRatio = Math.max(0.08, Math.min(0.92, 0.5 + normScore * 0.4));
  let ratingText = i18n.t('symbol_overview_gauge_neutral') || 'Neutral';
  let ratingColor = '#787B86';
  if (normScore >= 0.55) {
    ratingText = i18n.t('symbol_overview_gauge_strong_buy') || 'Strong Buy';
    ratingColor = '#26A69A';
  } else if (normScore >= 0.15) {
    ratingText = i18n.t('symbol_overview_gauge_buy') || 'Buy';
    ratingColor = '#26A69A';
  } else if (normScore <= -0.55) {
    ratingText = i18n.t('symbol_overview_gauge_strong_sell') || 'Strong Sell';
    ratingColor = '#EF5350';
  } else if (normScore <= -0.15) {
    ratingText = i18n.t('symbol_overview_gauge_sell') || 'Sell';
    ratingColor = '#EF5350';
  }

  return {
    hasCandles: true,
    barCount: n,
    lastClose,
    rsi14,
    sma20,
    sma50,
    atr14,
    bullCount,
    bearCount,
    bullPct,
    bearPct,
    periodHigh: Number.isFinite(periodHigh) ? periodHigh : lastClose,
    periodLow: Number.isFinite(periodLow) ? periodLow : lastClose,
    avgVolume: n > 0 ? volSum / n : 0,
    pivot,
    r1,
    r2,
    s1,
    s2,
    needleRatio,
    ratingText,
    ratingColor,
  };
}

function computeMultiYearSeasonals(d1Candles = []) {
  if (!Array.isArray(d1Candles) || d1Candles.length === 0) {
    return { hasSufficientData: false, distinctMonthCount: 0, yearsDesc: [], cells: {}, monthlyStats: [] };
  }
  const sorted = [...d1Candles].sort(
    (a, b) => Number(a.open_time_utc_ms || 0) - Number(b.open_time_utc_ms || 0)
  );
  const buckets = new Map();
  for (const bar of sorted) {
    const o = Number(bar.open);
    const c = Number(bar.close);
    const ms = Number(bar.open_time_utc_ms || Number(bar.openTimeSec || 0) * 1000);
    if (!Number.isFinite(o) || !Number.isFinite(c) || o <= 0 || ms <= 0) continue;
    const dt = new Date(ms);
    const yr = dt.getUTCFullYear();
    const mo = dt.getUTCMonth() + 1;
    const key = `${yr}-${mo}`;
    if (!buckets.has(key)) {
      buckets.set(key, { year: yr, month: mo, firstOpen: o, lastClose: c });
    } else {
      buckets.get(key).lastClose = c;
    }
  }
  const distinctMonthCount = buckets.size;
  if (distinctMonthCount < 12) {
    return { hasSufficientData: false, distinctMonthCount, yearsDesc: [], cells: {}, monthlyStats: [] };
  }
  const cells = {};
  const perMonth = Array.from({ length: 13 }, () => []);
  const yearsSet = new Set();
  for (const b of buckets.values()) {
    const pct = ((b.lastClose - b.firstOpen) / b.firstOpen) * 100;
    cells[`${b.year}-${b.month}`] = Math.round(pct * 100) / 100;
    perMonth[b.month].push(pct);
    yearsSet.add(b.year);
  }
  const monthlyStats = [];
  for (let m = 1; m <= 12; m++) {
    const arr = perMonth[m];
    if (arr.length === 0) {
      monthlyStats.push({ month: m, avgPct: null, winRatePct: null, n: 0 });
    } else {
      const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
      const wins = arr.filter((v) => v > 0).length;
      monthlyStats.push({
        month: m,
        avgPct: Math.round(avg * 100) / 100,
        winRatePct: Math.round((wins / arr.length) * 1000) / 10,
        n: arr.length,
      });
    }
  }
  return {
    hasSufficientData: true,
    distinctMonthCount,
    yearsDesc: Array.from(yearsSet).sort((a, b) => b - a),
    cells,
    monthlyStats,
  };
}

export function renderSymbolOverviewModal(i18n) {
  const code = state.symbolOverviewCode;
  if (!code) return '';
  const sym = state.symbols.find((s) => s.symbolCode === code);
  if (!sym) return '';

  const matchingTab = state.openTabs.find(
    (t) => t.symbolCode === sym.symbolCode && Array.isArray(t.candles) && t.candles.length > 0
  );
  const fullCandles = matchingTab ? matchingTab.candles : sym.candles || [];
  const activeRange = state.symbolOverviewRange || '5D';
  const rangeBarCount =
    activeRange === '1D'
      ? 24
      : activeRange === '5D'
        ? 72
        : activeRange === '1M'
          ? 160
          : activeRange === '3M'
            ? 320
            : activeRange === 'YTD' || activeRange === '1Y'
              ? 600
              : fullCandles.length;
  const slicedCandles =
    fullCandles.length > rangeBarCount ? fullCandles.slice(-rangeBarCount) : fullCandles;

  const d = computeDayStats(sym, slicedCandles);
  const diff = d.lastClose - d.prevClose;
  const pct = d.prevClose > 0 ? PriceFormatter.formatSignedPct(d.prevClose, d.lastClose) : '+0.00%';
  const isBull = diff >= 0;
  const accentColor = isBull ? '#26A69A' : '#EF5350';
  const badge = getAssetBadge(sym.symbolCode);
  const profileMeta = getInstrumentProfileMeta(sym.symbolCode, badge.providerTag);
  const instSpec = getInstrumentSpec(sym.symbolCode, sym.activeProvider);
  const realMetrics = computeRealOverviewMetrics(slicedCandles, sym.decimals, i18n);
  const rangeSpan = Math.max(0.00001, d.dayHigh - d.dayLow);
  const posPct = Math.max(4, Math.min(96, Math.round(((d.lastClose - d.dayLow) / rangeSpan) * 100)));
  const activeSubTab = state.symbolOverviewSubTab || 'OVERVIEW';

  const miniCandles = slicedCandles.slice(-48);
  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of miniCandles) {
    minP = Math.min(minP, Number(c.low));
    maxP = Math.max(maxP, Number(c.high));
  }
  if (!Number.isFinite(minP) || !Number.isFinite(maxP)) {
    minP = d.lastClose * 0.99;
    maxP = d.lastClose * 1.01;
  }
  const span = Math.max(maxP - minP, 0.0001);
  const svgW = 420;
  const svgH = 122;
  const pToY = (p) => 10 + (svgH - 20) * (1 - (Number(p) - minP) / span);
  const slotW = miniCandles.length > 0 ? svgW / miniCandles.length : 10;
  const bodyW = Math.max(2, Math.min(7, slotW * 0.65));

  const miniCandlesSvg = miniCandles
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

  const subTabs = [
    { key: 'OVERVIEW', label: i18n.t('symbol_overview_tab_overview') || 'Overview' },
    { key: 'NEWS', label: i18n.t('symbol_overview_tab_news') || 'News' },
    { key: 'MINDS', label: i18n.t('symbol_overview_tab_minds') || 'Minds' },
    { key: 'IDEAS', label: i18n.t('symbol_overview_tab_ideas') || 'Ideas' },
  ];

  // Peer instruments in the same Asset Class using real live prices
  const peerSymbols = state.symbols
    .filter((s) => s.symbolCode !== sym.symbolCode && getAssetClass(s.symbolCode) === profileMeta.assetClass)
    .slice(0, 4);

  const intelEntry = state.symbolIntelCache && state.symbolIntelCache[sym.symbolCode];
  const intel = intelEntry ? intelEntry.data : (sym.intel || null);
  const d1ForSeasonals = getCachedOrAggregatedCandles(sym.symbolCode, sym.activeProvider, 'D1');
  const seasonals = computeMultiYearSeasonals(d1ForSeasonals.length > 0 ? d1ForSeasonals : (sym.timeframe === 'D1' ? fullCandles : []));
  const isStockSymbol = getSymbolCategoryKey(sym.symbolCode) === 'STOCKS' || (intel && intel.asset_class === 'STOCKS');
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let tabBodyHtml = '';
  if (activeSubTab === 'NEWS') {
    const isFa = i18n.getCurrentLanguage() === 'fa';
    const feedStatus = d.isLive
      ? (isFa ? 'فید فعال و همگام' : 'Active & Synchronized')
      : (isFa ? 'بازار بسته / آخرین کلوز ذخیره‌شده' : 'Market Closed / Archived Close');
    const newsList = (intel && Array.isArray(intel.news)) ? intel.news : [];
    const secList = (intel && Array.isArray(intel.sec_filings)) ? intel.sec_filings : [];
    const macroList = (intel && Array.isArray(intel.macro_events)) ? intel.macro_events : [];
    const intermarketList = (intel && Array.isArray(intel.intermarket)) ? intel.intermarket : [];

    tabBodyHtml = `
      <div class="card-subtle" style="margin-bottom: 10px;">
        <div class="row-between" style="margin-bottom: 8px; gap: 6px; flex-wrap: wrap;">
          <div style="font-size: 13px; font-weight: 700; color: var(--text-strong);">
            ${sym.symbolCode} — ${i18n.t('symbol_overview_tab_news') || 'Live News & External Intel'}
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="ltr-num" style="font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(56,189,248,0.14); color: #38BDF8;">EXTERNAL_LIVE</span>
            <button type="button" class="btn btn-sm" data-action="refresh-symbol-intel" data-symbol="${escapeHtml(sym.symbolCode)}">↻</button>
          </div>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 6px;">
          <span style="color: var(--text-muted);">Asset Class / Source</span>
          <strong>${profileMeta.assetClass} · ${badge.providerTag} (${feedStatus})</strong>
        </div>
        ${
          !intel
            ? `<div style="font-size: 11.5px; color: var(--text-muted); padding: 8px 0;">${isFa ? 'در حال دریافت فید زنده اخبار و داده‌های کلان...' : 'Fetching live RSS, macro & intermarket feed...'}</div>`
            : newsList.length === 0
              ? `<div style="font-size: 11.5px; color: var(--text-muted); padding: 6px 0;">${isFa ? 'در این لحظه سرفصل خبری تازه‌ای از فید عمومی برای این نماد بازگشت داده نشد.' : 'No live RSS headlines currently returned for this instrument.'}</div>`
              : newsList
                  .map(
                    (n) => `
                  <a href="${escapeHtml(n.url)}" target="_blank" rel="noopener noreferrer" style="display: block; padding: 7px 0; border-top: 1px solid rgba(120,123,134,0.14); text-decoration: none;">
                    <div style="font-size: 12px; font-weight: 600; color: var(--text-strong); line-height: 1.4;">${escapeHtml(n.title)}</div>
                    <div class="ltr-num" style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
                      ${escapeHtml(n.publisher || 'Feed')} · ${escapeHtml(String(n.published_utc || '').replace('T', ' ').slice(0, 16))} UTC · <span style="color: #38BDF8;">${escapeHtml(n.source_type || 'EXTERNAL_LIVE')}</span>
                    </div>
                  </a>
                `
                  )
                  .join('')
        }
      </div>

      ${
        isStockSymbol
          ? `
        <div class="card-subtle" style="margin-bottom: 10px;">
          <div class="row-between" style="margin-bottom: 8px;">
            <strong style="font-size: 12.5px; color: var(--text-strong);">SEC EDGAR Filings (10-K / 10-Q / 8-K)</strong>
            <span class="ltr-num" style="font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(56,189,248,0.14); color: #38BDF8;">EXTERNAL_LIVE</span>
          </div>
          ${
            secList.length > 0
              ? secList
                  .map(
                    (f) => `
                  <a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer" class="row-between ltr-num" style="font-size: 11.5px; padding: 6px 0; border-top: 1px solid rgba(120,123,134,0.14); text-decoration: none; color: var(--text);">
                    <span><strong style="color: var(--primary);">${escapeHtml(f.form)}</strong> · ${escapeHtml(f.description || f.form)}</span>
                    <span style="color: var(--text-muted);">${escapeHtml(f.filing_date)} ↗</span>
                  </a>
                `
                  )
                  .join('')
              : `<div style="font-size: 11px; color: var(--text-muted);">${escapeHtml((intel && intel.sec_notice) || 'SEC EDGAR filings unavailable for this ticker.')}</div>`
          }
        </div>
      `
          : ''
      }

      ${
        macroList.length > 0
          ? `
        <div class="card-subtle" style="margin-bottom: 10px;">
          <div class="row-between" style="margin-bottom: 8px;">
            <strong style="font-size: 12.5px; color: var(--text-strong);">${isFa ? 'تقویم رویدادهای کلان (Macro Schedule)' : 'Macro Release Schedule (UTC)'}</strong>
            <span class="ltr-num" style="font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(56,189,248,0.14); color: #38BDF8;">EXTERNAL_LIVE</span>
          </div>
          ${macroList
            .map(
              (ev) => `
              <div class="row-between ltr-num" style="font-size: 11.5px; padding: 5px 0; border-top: 1px solid rgba(120,123,134,0.12); gap: 8px;">
                <span style="color: var(--text); font-weight: 600;">${escapeHtml(ev.title)}</span>
                <span style="color: ${ev.relevance === 'HIGH' ? 'var(--gold)' : 'var(--text-muted)'}; white-space: nowrap;">${escapeHtml(String(ev.scheduled_utc || '').replace('T', ' ').slice(0, 16))}Z</span>
              </div>
            `
            )
            .join('')}
        </div>
      `
          : ''
      }

      ${
        intermarketList.length > 0
          ? `
        <div class="card-subtle" style="margin-bottom: 10px;">
          <div class="row-between" style="margin-bottom: 8px;">
            <strong style="font-size: 12.5px; color: var(--text-strong);">${isFa ? 'همبستگی بین‌بازاری ۶۰ روزه' : 'Intermarket Benchmarks & 60d Correlation'}</strong>
            <span class="ltr-num" style="font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(56,189,248,0.14); color: #38BDF8;">EXTERNAL_LIVE</span>
          </div>
          ${intermarketList
            .map((im) => {
              const imBull = Number(im.change_pct || 0) >= 0;
              const corrStr = im.corr_60d !== null && im.corr_60d !== undefined ? `r=${Number(im.corr_60d).toFixed(2)}` : 'r=—';
              return `
                <div class="row-between ltr-num" style="font-size: 11.5px; padding: 5px 0; border-top: 1px solid rgba(120,123,134,0.12);">
                  <span style="font-weight: 600; color: var(--text);">${escapeHtml(im.label)} <span style="color: var(--text-muted);">(${escapeHtml(im.ticker)})</span></span>
                  <span>
                    <strong>${Number(im.last_price).toFixed(2)}</strong>
                    <span style="color: ${imBull ? 'var(--bull)' : 'var(--bear)'}; margin-left: 6px;">${imBull ? '+' : ''}${Number(im.change_pct).toFixed(2)}%</span>
                    <span style="color: var(--primary); margin-left: 6px;">${corrStr}</span>
                  </span>
                </div>
              `;
            })
            .join('')}
        </div>
      `
          : ''
      }

      ${
        peerSymbols.length > 0
          ? `
        <div class="card-subtle">
          <div style="font-size: 12.5px; font-weight: 700; color: var(--text-strong); margin-bottom: 8px;">
            ${isFa ? `نمادهای هم‌دسته (${profileMeta.assetClass})` : `Related ${profileMeta.assetClass} Instruments`}
          </div>
          ${peerSymbols
            .map((peer) => {
              const pd = computeDayStats(peer);
              const ppct = pd.prevClose > 0 ? PriceFormatter.formatSignedPct(pd.prevClose, pd.lastClose) : '+0.00%';
              const pBull = pd.lastClose >= pd.prevClose;
              return `
                <div class="row-between ltr-num" style="font-size: 12px; padding: 5px 0; border-bottom: 1px solid rgba(120,123,134,0.12); cursor: pointer;" data-action="open-symbol-overview" data-symbol="${peer.symbolCode}">
                  <span style="font-weight: 700; color: var(--text-strong);">${peer.symbolCode}</span>
                  <span>
                    <strong>${PriceFormatter.formatPrice(pd.lastClose, peer.decimals)}</strong>
                    <span style="color: ${pBull ? 'var(--bull)' : 'var(--bear)'}; margin-left: 8px; font-weight: 700;">${ppct}</span>
                  </span>
                </div>
              `;
            })
            .join('')}
        </div>
      `
          : ''
      }
    `;
  } else if (activeSubTab === 'MINDS') {
    if (!realMetrics.hasCandles) {
      tabBodyHtml = `
        <div class="card-subtle" style="text-align: center; padding: 18px;">
          <div style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 10px;">
            ${i18n.t('overview_no_candles')}
          </div>
          <button class="btn btn-sm btn-primary" data-action="open-chart" data-symbol="${sym.symbolCode}">
            ⛶ ${i18n.t('action_open_chart_view')}
          </button>
        </div>
      `;
    } else {
      tabBodyHtml = `
        <div class="card-subtle" style="margin-bottom: 10px; text-align: center;">
          <div style="font-size: 12.5px; font-weight: 700; color: var(--text-strong); margin-bottom: 6px;">
            ${i18n.t('symbol_overview_technicals_title')} (${realMetrics.barCount} bars)
          </div>
          ${renderSpeedometerSvg(realMetrics.needleRatio, realMetrics.ratingColor)}
          <div style="font-size: 13px; font-weight: 800; color: ${realMetrics.ratingColor}; margin-top: 2px;">
            ${realMetrics.ratingText}
          </div>
          <div class="ltr-num" style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
            RSI(14): ${realMetrics.rsi14 !== null ? realMetrics.rsi14.toFixed(1) : '—'} · SMA(20): ${realMetrics.sma20 !== null ? PriceFormatter.formatPrice(realMetrics.sma20, sym.decimals) : '—'}
          </div>
        </div>

        <div class="card-subtle">
          <div style="font-size: 12.5px; font-weight: 700; color: var(--text-strong); margin-bottom: 8px;">
            ${i18n.t('overview_sentiment_title')}
          </div>
          <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 6px;">
            <span style="color: var(--bull); font-weight: 700;">Bull Bars: ${realMetrics.bullCount} (${realMetrics.bullPct}%)</span>
            <span style="color: var(--bear); font-weight: 700;">Bear Bars: ${realMetrics.bearCount} (${realMetrics.bearPct}%)</span>
          </div>
          <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 10px;">
            <div style="width: ${realMetrics.bullPct}%; background: #26A69A;"></div>
            <div style="width: ${realMetrics.bearPct}%; background: #EF5350;"></div>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">Period High / Low (${activeRange})</span>
            <strong>${PriceFormatter.formatPrice(realMetrics.periodLow, sym.decimals)} — ${PriceFormatter.formatPrice(realMetrics.periodHigh, sym.decimals)}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px;">
            <span style="color: var(--text-muted);">ATR (14) Volatility</span>
            <strong>${realMetrics.atr14 !== null ? PriceFormatter.formatPrice(realMetrics.atr14, sym.decimals) : '—'}</strong>
          </div>
        </div>
      `;
    }
  } else if (activeSubTab === 'IDEAS') {
    if (!realMetrics.hasCandles) {
      tabBodyHtml = `
        <div class="card-subtle" style="text-align: center; padding: 18px;">
          <div style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 10px;">
            ${i18n.t('overview_no_candles')}
          </div>
          <button class="btn btn-sm btn-primary" data-action="open-chart" data-symbol="${sym.symbolCode}">
            ⛶ ${i18n.t('action_open_chart_view')}
          </button>
        </div>
      `;
    } else {
      const dec = sym.decimals;
      tabBodyHtml = `
        <div class="card-subtle" style="margin-bottom: 10px;">
          <div class="row-between" style="margin-bottom: 8px;">
            <strong style="font-size: 13px; color: var(--text-strong);">${i18n.t('overview_real_tech_title')}</strong>
            <button type="button" class="btn btn-sm is-disabled" disabled aria-disabled="true" data-action="open-prediction-from-overview" data-symbol="${sym.symbolCode}">
              ${i18n.t('symbol_overview_see_forecast')}
            </button>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">RSI (14)</span>
            <strong style="color: ${realMetrics.rsi14 !== null ? (realMetrics.rsi14 > 70 ? 'var(--bear)' : realMetrics.rsi14 < 30 ? 'var(--bull)' : 'var(--text-strong)') : 'var(--text-muted)'};">
              ${realMetrics.rsi14 !== null ? realMetrics.rsi14.toFixed(2) : '—'}
            </strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">SMA (20) vs Price</span>
            <strong>${realMetrics.sma20 !== null ? PriceFormatter.formatPrice(realMetrics.sma20, dec) : '—'}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">SMA (50) vs Price</span>
            <strong>${realMetrics.sma50 !== null ? PriceFormatter.formatPrice(realMetrics.sma50, dec) : '—'}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px;">
            <span style="color: var(--text-muted);">ATR (14)</span>
            <strong>${realMetrics.atr14 !== null ? PriceFormatter.formatPrice(realMetrics.atr14, dec) : '—'}</strong>
          </div>
        </div>

        <div class="card-subtle">
          <div style="font-size: 12.5px; font-weight: 700; color: var(--text-strong); margin-bottom: 8px;">
            ${i18n.t('overview_pivots_title')}
          </div>
          <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px;">
            <span style="color: var(--bear);">Resistance 2 (R2)</span>
            <strong>${PriceFormatter.formatPrice(realMetrics.r2, dec)}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px;">
            <span style="color: var(--bear);">Resistance 1 (R1)</span>
            <strong>${PriceFormatter.formatPrice(realMetrics.r1, dec)}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px;">
            <span style="color: var(--primary); font-weight: 700;">Pivot (P)</span>
            <strong>${PriceFormatter.formatPrice(realMetrics.pivot, dec)}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px;">
            <span style="color: var(--bull);">Support 1 (S1)</span>
            <strong>${PriceFormatter.formatPrice(realMetrics.s1, dec)}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px;">
            <span style="color: var(--bull);">Support 2 (S2)</span>
            <strong>${PriceFormatter.formatPrice(realMetrics.s2, dec)}</strong>
          </div>
        </div>
      `;
    }
  } else {
    // OVERVIEW tab (only relevant cards for this AssetClass + real Key Data + Technical Snapshot)
    tabBodyHtml = `
      <!-- Key data points + Visual Day's Range Bar -->
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

      <!-- Asset Class Specifications (Strictly separated by AssetClass: no EDGAR/dividends on Oil/Gold/Crypto/FX) -->
      <div class="card-subtle" style="margin-bottom: 10px;">
        <div class="row-between" style="margin-bottom: 8px;">
          <strong style="font-size: 13px; color: var(--text-strong);">${i18n.t('overview_specs_title')}</strong>
          <span class="ltr-num" style="font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: var(--primary-soft); color: var(--primary);">${profileMeta.assetClass}</span>
        </div>
        <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
          <span style="color: var(--text-muted);">${profileMeta.spec1Label}</span>
          <strong>${profileMeta.spec1Val}</strong>
        </div>
        <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
          <span style="color: var(--text-muted);">${profileMeta.spec2Label}</span>
          <strong>${profileMeta.spec2Val}</strong>
        </div>
        <div class="row-between ltr-num" style="font-size: 11.5px;">
          <span style="color: var(--text-muted);">${profileMeta.spec3Label}</span>
          <strong>${profileMeta.spec3Val}</strong>
        </div>
      </div>

      ${
        realMetrics.hasCandles
          ? `
        <div class="card-subtle" style="margin-bottom: 10px;">
          <div class="row-between" style="margin-bottom: 8px;">
            <strong style="font-size: 13px; color: var(--text-strong);">${i18n.t('overview_real_tech_title')} (${realMetrics.barCount} bars)</strong>
            <button type="button" class="btn btn-sm is-disabled" disabled aria-disabled="true" data-action="open-prediction-from-overview" data-symbol="${sym.symbolCode}">
              ${i18n.t('symbol_overview_see_forecast')}
            </button>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">Technical Consensus</span>
            <strong style="color: ${realMetrics.ratingColor};">${realMetrics.ratingText}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 5px;">
            <span style="color: var(--text-muted);">RSI (14) / ATR (14)</span>
            <strong>${realMetrics.rsi14 !== null ? realMetrics.rsi14.toFixed(1) : '—'} · ${realMetrics.atr14 !== null ? PriceFormatter.formatPrice(realMetrics.atr14, sym.decimals) : '—'}</strong>
          </div>
          <div class="row-between ltr-num" style="font-size: 12px;">
            <span style="color: var(--text-muted);">Bull / Bear Candles</span>
            <strong>${realMetrics.bullCount} (${realMetrics.bullPct}%) / ${realMetrics.bearCount} (${realMetrics.bearPct}%)</strong>
          </div>
        </div>
      `
          : ''
      }

      <!-- Multi-Year Seasonals Heatmap (Strictly derived from >= 12 distinct real D1 months) -->
      <div class="card-subtle" style="margin-bottom: 10px;">
        <div class="row-between" style="margin-bottom: 8px;">
          <strong style="font-size: 13px; color: var(--text-strong);">
            ${i18n.getCurrentLanguage() === 'fa' ? 'نقشه حرارتی فصلی چندساله (Multi-Year Seasonals)' : 'Multi-Year Seasonals Heatmap'}
          </strong>
          <span class="ltr-num" style="font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(38,166,154,0.14); color: var(--bull);">LOCAL_DERIVED</span>
        </div>
        ${
          !seasonals.hasSufficientData
            ? `<div style="font-size: 11.5px; color: var(--text-muted); line-height: 1.5;">
                 ${
                   i18n.getCurrentLanguage() === 'fa'
                     ? `برای محاسبه دقیق فصلی حداقل به ۱۲ ماه تقویمی مجزا در تایم‌فریم روزانه (D1) نیاز است (موجود: ${seasonals.distinctMonthCount} ماه). تایم‌فریم D1 را همگام‌سازی کنید.`
                     : `Requires at least 12 distinct UTC calendar months of D1 candles (currently ${seasonals.distinctMonthCount} months cached). Switch to D1/All to backfill.`
                 }
               </div>`
            : `
              <div style="overflow-x: auto;">
                <table class="ltr-num" style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: center;">
                  <thead>
                    <tr style="color: var(--text-muted); border-bottom: 1px solid var(--border);">
                      <th style="padding: 4px; text-align: left;">Year</th>
                      ${monthLabels.map((m) => `<th style="padding: 4px;">${m}</th>`).join('')}
                    </tr>
                  </thead>
                  <tbody>
                    ${seasonals.yearsDesc
                      .slice(0, 6)
                      .map(
                        (yr) => `
                        <tr style="border-bottom: 1px solid rgba(120,123,134,0.12);">
                          <td style="padding: 4px; font-weight: 700; text-align: left; color: var(--text-strong);">${yr}</td>
                          ${Array.from({ length: 12 }, (_, idx) => idx + 1)
                            .map((mo) => {
                              const val = seasonals.cells[`${yr}-${mo}`];
                              if (val === undefined) return '<td style="padding: 4px; color: var(--text-dim);">—</td>';
                              const bg = val >= 0 ? 'rgba(38,166,154,0.18)' : 'rgba(239,83,80,0.18)';
                              const fg = val >= 0 ? 'var(--bull)' : 'var(--bear)';
                              return `<td style="padding: 4px; background: ${bg}; color: ${fg}; font-weight: 700;">${val >= 0 ? '+' : ''}${val.toFixed(1)}%</td>`;
                            })
                            .join('')}
                        </tr>
                      `
                      )
                      .join('')}
                    <tr style="background: var(--card-bg); font-weight: 700;">
                      <td style="padding: 4px; text-align: left; color: var(--primary);">Avg / Win</td>
                      ${seasonals.monthlyStats
                        .map((st) => {
                          if (st.avgPct === null) return '<td style="padding: 4px;">—</td>';
                          const fg = st.avgPct >= 0 ? 'var(--bull)' : 'var(--bear)';
                          return `<td style="padding: 4px; color: ${fg};">${st.avgPct >= 0 ? '+' : ''}${st.avgPct.toFixed(1)}%<div style="font-size: 9px; color: var(--text-muted);">${st.winRatePct.toFixed(0)}%W</div></td>`;
                        })
                        .join('')}
                    </tr>
                  </tbody>
                </table>
              </div>
            `
        }
      </div>

      <!-- Instrument Profile (with Copyable FIGI, ISIN & GoogleFinance Formula) -->
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
          <strong>${escapeHtml(profileMeta.benchmark)}</strong>
        </div>
        <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
          <span style="color: var(--text-muted);">Provider Ticker</span>
          <strong>${escapeHtml(instSpec.provider)} · ${escapeHtml(instSpec.providerTicker)}</strong>
        </div>
        <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
          <span style="color: var(--text-muted);">Price Basis / Volume</span>
          <strong>${escapeHtml(instSpec.priceBasis)} · ${escapeHtml(instSpec.volumeType)}</strong>
        </div>
        <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
          <span style="color: var(--text-muted);">Session / Timezone</span>
          <strong>${escapeHtml(instSpec.sessionCalendar)} (${escapeHtml(instSpec.timezone)})</strong>
        </div>
        <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
          <span style="color: var(--text-muted);">${i18n.t('symbol_overview_about_figi')}</span>
          <button type="button" class="btn btn-sm" style="padding: 1px 6px; min-height: 20px; font-size: 11px;" data-action="copy-identifier" data-copy="${escapeHtml(profileMeta.figi)}">
            <span>${escapeHtml(profileMeta.figi)}</span>
            <span>⧉</span>
          </button>
        </div>
        <div class="row-between ltr-num" style="font-size: 11.5px; margin-bottom: 5px;">
          <span style="color: var(--text-muted);">${i18n.t('symbol_overview_about_isin')}</span>
          <button type="button" class="btn btn-sm" style="padding: 1px 6px; min-height: 20px; font-size: 11px;" data-action="copy-identifier" data-copy="${escapeHtml(profileMeta.isin)}">
            <span>${escapeHtml(profileMeta.isin)}</span>
            <span>⧉</span>
          </button>
        </div>
        <div class="row-between ltr-num" style="font-size: 11.5px;">
          <span style="color: var(--text-muted);">Google Sheets Formula</span>
          <button type="button" class="btn btn-sm" style="padding: 1px 6px; min-height: 20px; font-size: 11px;" data-action="copy-identifier" data-copy="=GOOGLEFINANCE(&quot;${escapeHtml(sym.symbolCode)}&quot;, &quot;price&quot;)">
            <span>=GOOGLEFINANCE("${escapeHtml(sym.symbolCode)}", "price")</span>
            <span>⧉</span>
          </button>
        </div>
      </div>
    `;
  }

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

        <!-- Mini-Chart + Range Chips + Export -->
        <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px; margin-bottom: 10px;">
          <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="122" style="display: block;">
            <line x1="0" y1="${prevCloseY.toFixed(1)}" x2="${svgW}" y2="${prevCloseY.toFixed(1)}" stroke="#787B86" stroke-dasharray="4 4" stroke-width="1"/>
            ${miniCandlesSvg}
          </svg>
          <div class="row-between" style="margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); gap: 6px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 3px; flex-wrap: wrap;">
              ${ranges
                .map(
                  (r) => `<button class="chip ltr-num ${activeRange === r ? 'active' : ''}" style="font-size: 11px; padding: 2px 7px;" data-action="set-overview-range" data-range="${r}">${r}</button>`
                )
                .join('')}
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <button class="btn btn-sm ltr-num" data-action="export-candles-csv" data-symbol="${sym.symbolCode}" title="Export CSV">CSV</button>
              <button class="btn btn-sm btn-primary" data-action="open-chart" data-symbol="${sym.symbolCode}" title="${i18n.t('action_open_chart_view')}">
                <span>⛶ ${i18n.t('action_open_chart_view')}</span>
              </button>
            </div>
          </div>
        </div>

        ${tabBodyHtml}
      </div>
    </div>
  `;
}

export const renderWatchlistContent = renderRightSplitPanel;
