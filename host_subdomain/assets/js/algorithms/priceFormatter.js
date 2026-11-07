export const PriceFormatter = {
  formatPrice(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(Number(val))) return '—';
    return Number(val).toFixed(decimals);
  },

  formatSignedPct(open, close) {
    const o = Number(open);
    const c = Number(close);
    if (!o) return '0.00%';
    const pct = ((c - o) / o) * 100;
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  },

  stepMilliseconds(timeframe = 'M15') {
    const tf = String(timeframe).toUpperCase();
    if (tf === 'D1') return 86400000;
    if (tf === 'H4') return 14400000;
    if (tf === 'H1') return 3600000;
    return 900000;
  },

  formatAxisTimestamp(epochMs, timeframe = 'M15') {
    if (!epochMs) return '';
    const iso = new Date(Number(epochMs)).toISOString();
    if (String(timeframe).toUpperCase() === 'D1') {
      return iso.slice(0, 10);
    }
    return iso.slice(5, 16).replace('T', ' ');
  },
};
