// Dukascopy market-data POC (smoke test).
// Goal: check that M15 candles for XAU/USD and BRENT.CMD/USD can be downloaded,
// how deep the history is, and whether candles are continuous and valid.
// No API key is needed. Output: dukascopy_report.json + console summary.

const { getHistoricalRates, instrumentMetaData } = require('dukascopy-node');
const fs = require('fs');

const INSTRUMENTS = ['xauusd', 'brentcmdusd'];
const M15 = 15 * 60 * 1000;
const now = Date.now();
const day = 24 * 3600 * 1000;

const PROBES = [
  { label: 'week_2011', from: '2011-06-06', to: '2011-06-13' },
  { label: 'week_2015', from: '2015-06-01', to: '2015-06-08' },
  { label: 'week_2020_volatile', from: '2020-03-02', to: '2020-03-09' },
  { label: 'week_2024', from: '2024-06-03', to: '2024-06-10' },
  { label: 'recent_7d', from: new Date(now - 8 * day), to: new Date(now - 1 * day) },
  { label: 'recent_30d_timing', from: new Date(now - 31 * day), to: new Date(now - 1 * day) },
];

function analyse(rows) {
  const out = { count: rows.length };
  if (!rows.length) return out;
  out.first = new Date(rows[0].timestamp).toISOString();
  out.last = new Date(rows[rows.length - 1].timestamp).toISOString();
  let badOhlc = 0, unordered = 0, dup = 0, nonPositive = 0;
  const gaps = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const hi = Math.max(r.open, r.close), lo = Math.min(r.open, r.close);
    if (r.high < hi || r.low > lo) badOhlc++;
    if (!(r.open > 0 && r.high > 0 && r.low > 0 && r.close > 0)) nonPositive++;
    if (i > 0) {
      const d = r.timestamp - rows[i - 1].timestamp;
      if (d < 0) unordered++;
      else if (d === 0) dup++;
      else if (d > M15) gaps.push({ from: new Date(rows[i - 1].timestamp).toISOString(), minutes: d / 60000 });
    }
  }
  out.invalid_ohlc = badOhlc;
  out.non_positive_prices = nonPositive;
  out.unordered = unordered;
  out.duplicates = dup;
  out.gap_count = gaps.length;
  out.largest_gaps = gaps.sort((a, b) => b.minutes - a.minutes).slice(0, 5);
  return out;
}

(async () => {
  const report = { generated_at: new Date().toISOString(), package: 'dukascopy-node', results: [] };
  for (const inst of INSTRUMENTS) {
    const meta = instrumentMetaData[inst];
    const start = new Date(meta.startDayForMinuteCandles).getTime();
    for (const p of PROBES) {
      const from = new Date(p.from), to = new Date(p.to);
      const entry = { instrument: inst, name: meta.name, description: meta.description, probe: p.label };
      if (from.getTime() < start) {
        entry.status = 'before_instrument_start';
        report.results.push(entry);
        continue;
      }
      const t0 = Date.now();
      try {
        const rows = await getHistoricalRates({
          instrument: inst,
          dates: { from, to },
          timeframe: 'm15',
          priceType: 'bid',
          format: 'json',
          volumes: true,
          ignoreFlats: false,
          batchSize: 5,
          pauseBetweenBatchesMs: 1000,
          retryCount: 3,
        });
        entry.status = 'ok';
        entry.seconds = Math.round((Date.now() - t0) / 100) / 10;
        Object.assign(entry, analyse(rows));
      } catch (e) {
        entry.status = 'error';
        entry.error_name = e && e.name;
        entry.error_message = String((e && e.message) || e).slice(0, 300);
      }
      report.results.push(entry);
      console.log(JSON.stringify(entry));
    }
  }
  fs.writeFileSync('dukascopy_report.json', JSON.stringify(report, null, 2));
  const ok = report.results.filter(r => r.status === 'ok').length;
  console.log(`done: ${ok}/${report.results.length} probes ok`);
})();
