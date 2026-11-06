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

  buildSeedCandles(symbolCode, providerId, timeframe, count = 96) {
    const stepMs = timeframe === 'D1' ? 86400000 : 900000;
    const nowMs = Date.now();
    const currentBucket = Math.floor(nowMs / stepMs) * stepMs;
    const latestClosed = currentBucket - stepMs;
    const baseMap = {
      XAUUSD: 2742.5,
      SPOTBRENT: 74.85,
      BRENT_FUTURES: 75.1,
      XAGUSD: 32.4,
      EURUSD: 1.0845,
    };
    const base = baseMap[symbolCode] || 100.0;
    const startOpen = latestClosed - (count - 1) * stepMs;
    let runningClose = base;
    const list = [];
    for (let i = 0; i < count; i++) {
      const openMs = startOpen + i * stepMs;
      const phase = (openMs / stepMs) * 0.37;
      const delta = Math.sin(phase) * (base * 0.0012);
      const open = runningClose;
      const close = Number((open + delta).toFixed(8));
      const high = Number((Math.max(open, close) + Math.abs(Math.cos(phase)) * (base * 0.0008)).toFixed(8));
      const low = Number((Math.min(open, close) - Math.abs(Math.sin(phase)) * (base * 0.0008)).toFixed(8));
      const iso = new Date(openMs).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
      list.push({
        open_time_utc_ms: openMs,
        open_time_utc_iso: iso,
        open,
        high,
        low,
        close,
        volume: 650,
        is_closed: true,
      });
      runningClose = close;
    }
    return list;
  },
};
