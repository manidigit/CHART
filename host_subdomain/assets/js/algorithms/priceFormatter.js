export const PriceFormatter = {
  formatPrice(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(Number(val))) return '—';
    return Number(val).toFixed(decimals);
  },

  formatSignedDiff(open, close, decimals = 2) {
    const o = Number(open);
    const c = Number(close);
    if (!isFinite(o) || !isFinite(c) || !o) return '0.00';
    const diff = c - o;
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff.toFixed(decimals)}`;
  },

  formatSignedPct(open, close) {
    const o = Number(open);
    const c = Number(close);
    if (!o) return '0.00%';
    const pct = ((c - o) / o) * 100;
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  },

  formatCompactVolume(vol) {
    const n = Number(vol || 0);
    if (!isFinite(n) || n <= 0) return '0';
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(Math.round(n));
  },

  displayTimeframeLabel(tf = 'M15') {
    const norm = String(tf).toUpperCase();
    if (norm === 'M15') return '15m';
    if (norm === 'H1') return '1h';
    if (norm === 'H4') return '4h';
    if (norm === 'D1') return '1D';
    return norm;
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

  /**
   * Computes which Date Range presets (1D, 5D, 1M, 3M, YTD, 1Y, All) have sufficient historical data
   * and how many candles correspond to each range.
   */
  computeAvailableDateRanges(candles = [], timeframe = 'M15') {
    const total = Array.isArray(candles) ? candles.length : 0;
    const presets = [
      { id: '1D', durationMs: 86400000 },
      { id: '5D', durationMs: 5 * 86400000 },
      { id: '1M', durationMs: 30 * 86400000 },
      { id: '3M', durationMs: 90 * 86400000 },
      { id: 'YTD', durationMs: null },
      { id: '1Y', durationMs: 365 * 86400000 },
      { id: 'ALL', durationMs: 0 },
    ];
    if (total === 0) {
      return presets.map((p) => ({ id: p.id, label: p.id === 'ALL' ? 'All' : p.id, enabled: false, count: 12 }));
    }

    const firstMs = Number(candles[0].open_time_utc_ms);
    const lastMs = Number(candles[total - 1].open_time_utc_ms);
    const spanMs = Math.max(0, lastMs - firstMs);
    const lastYearStartMs = Date.UTC(new Date(lastMs).getUTCFullYear(), 0, 1);

    return presets.map((p) => {
      if (p.id === 'ALL') {
        return { id: 'ALL', label: 'All', enabled: total > 0, count: Math.max(12, total) };
      }
      const cutoffMs = p.id === 'YTD' ? lastYearStartMs : lastMs - p.durationMs;
      const reqSpan = p.id === 'YTD' ? Math.max(86400000, lastMs - lastYearStartMs) : p.durationMs;
      // Enable if the loaded history covers at least 45% of the requested window or >= 8 bars inside cutoff
      const matchingBars = candles.filter((c) => Number(c.open_time_utc_ms) >= cutoffMs).length;
      const enabled = matchingBars >= 4 && (spanMs >= reqSpan * 0.45 || (p.id === '1D' && total >= 4));
      return {
        id: p.id,
        label: p.id,
        enabled,
        count: Math.max(8, Math.min(total, matchingBars || 12)),
      };
    });
  },

  computeSmaSeries(candles = [], period = 20) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const out = new Array(candles.length).fill(null);
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
      sum += Number(candles[i].close || 0);
      if (i >= period) {
        sum -= Number(candles[i - period].close || 0);
      }
      if (i >= period - 1) {
        out[i] = sum / period;
      }
    }
    return out;
  },
};
