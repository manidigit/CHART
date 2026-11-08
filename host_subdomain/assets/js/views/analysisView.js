import { PriceFormatter } from '../algorithms/priceFormatter.js';
import { state } from '../core/store.js';

export function computeTechnicalAnalytics(candles) {
  if (!candles || candles.length === 0) return null;
  const slice = candles.slice(-24);
  let highest = -Infinity;
  let lowest = Infinity;
  let bullCount = 0;
  let bearCount = 0;
  let totalVol = 0;

  for (const c of slice) {
    highest = Math.max(highest, Number(c.high));
    lowest = Math.min(lowest, Number(c.low));
    if (Number(c.close) >= Number(c.open)) bullCount++;
    else bearCount++;
    totalVol += Number(c.volume || 0);
  }

  // ATR (14 period)
  let atr = 0;
  if (candles.length >= 2) {
    const atrSlice = candles.slice(-15);
    let trSum = 0;
    for (let i = 1; i < atrSlice.length; i++) {
      const cur = atrSlice[i];
      const prev = atrSlice[i - 1];
      const hl = Number(cur.high) - Number(cur.low);
      const hc = Math.abs(Number(cur.high) - Number(prev.close));
      const lc = Math.abs(Number(cur.low) - Number(prev.close));
      trSum += Math.max(hl, hc, lc);
    }
    atr = trSum / (atrSlice.length - 1);
  }

  // Classic Floor Pivot Points
  const lastBar = candles[candles.length - 1];
  const h = Number(lastBar.high);
  const l = Number(lastBar.low);
  const c = Number(lastBar.close);
  const p = (h + l + c) / 3;
  const r1 = 2 * p - l;
  const s1 = 2 * p - h;
  const r2 = p + (h - l);
  const s2 = p - (h - l);

  return {
    periodHigh: highest,
    periodLow: lowest,
    spread: highest - lowest,
    atr14: atr,
    bullCount,
    bearCount,
    totalBars: slice.length,
    bullRatio: Math.round((bullCount / Math.max(1, slice.length)) * 100),
    pivot: p,
    r1,
    s1,
    r2,
    s2,
    lastClose: c,
    volume: totalVol,
  };
}

export function renderAnalysisContent(activeTab, i18n) {
  const watchlist = state.symbols.filter((s) => s.inWatchlist);
  const symbolOptions = watchlist
    .map(
      (s) =>
        `<option value="${s.symbolCode}" ${activeTab && activeTab.symbolCode === s.symbolCode ? 'selected' : ''}>${s.symbolCode}</option>`
    )
    .join('');

  const allowedTfs =
    activeTab && activeTab.provider === 'eia_brent_spot' ? ['D1'] : ['M15', 'H1', 'H4', 'D1'];
  const tfChips = allowedTfs
    .map((tf) => {
      const isAct = activeTab && activeTab.timeframe === tf;
      return `<button class="chip ltr-num ${isAct ? 'active' : ''}" data-action="set-timeframe" data-tf="${tf}" style="font-size: 11px; padding: 2px 8px;">${PriceFormatter.displayTimeframeLabel(tf)}</button>`;
    })
    .join('');

  const headerHtml = `
    <div class="row-between" style="margin-bottom: 12px; gap: 8px; flex-wrap: wrap;">
      <select class="input-field ltr-num" style="width: auto; min-height: 32px; padding: 2px 10px; font-weight: 700;" data-action="select-prediction-symbol">
        ${symbolOptions}
      </select>
      <div class="chip-group">
        ${tfChips}
      </div>
    </div>
  `;

  if (!activeTab || !activeTab.candles || activeTab.candles.length === 0) {
    return `
      <div>
        ${headerHtml}
        <p style="color: var(--text-muted); font-size: 13px;">${i18n.t('analysis_no_data')}</p>
      </div>
    `;
  }
  const stats = computeTechnicalAnalytics(activeTab.candles);
  if (!stats) {
    return `
      <div>
        ${headerHtml}
        <p style="color: var(--text-muted); font-size: 13px;">${i18n.t('analysis_no_data')}</p>
      </div>
    `;
  }

  const dec = activeTab.decimals;
  return `
    <div>
      ${headerHtml}

      <details class="card-subtle" style="margin-bottom: 10px; cursor: pointer;" open>
        <summary class="row-between ltr-num" style="font-weight: 700; font-size: 13px; color: var(--bull); list-style: none;">
          <span>Bullish Breakout (Above P)</span>
          <span>${PriceFormatter.formatPrice(stats.r1, dec)} → ${PriceFormatter.formatPrice(stats.r2, dec)}</span>
        </summary>
        <div class="ltr-num" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); font-size: 12px;">
          <div class="row-between" style="margin-bottom: 4px;"><span>Entry Trigger (Pivot P)</span><strong>${PriceFormatter.formatPrice(stats.pivot, dec)}</strong></div>
          <div class="row-between" style="margin-bottom: 4px; color: var(--bull);"><span>Target 1 (R1)</span><strong>${PriceFormatter.formatPrice(stats.r1, dec)}</strong></div>
          <div class="row-between" style="margin-bottom: 4px; color: var(--bull);"><span>Target 2 (R2)</span><strong>${PriceFormatter.formatPrice(stats.r2, dec)}</strong></div>
          <div class="row-between" style="color: var(--bear);"><span>Invalidation (S1)</span><strong>${PriceFormatter.formatPrice(stats.s1, dec)}</strong></div>
        </div>
      </details>

      <details class="card-subtle" style="margin-bottom: 10px; cursor: pointer;">
        <summary class="row-between ltr-num" style="font-weight: 700; font-size: 13px; color: var(--bear); list-style: none;">
          <span>Bearish Breakdown (Below P)</span>
          <span>${PriceFormatter.formatPrice(stats.s1, dec)} → ${PriceFormatter.formatPrice(stats.s2, dec)}</span>
        </summary>
        <div class="ltr-num" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); font-size: 12px;">
          <div class="row-between" style="margin-bottom: 4px;"><span>Breakdown Trigger (Pivot P)</span><strong>${PriceFormatter.formatPrice(stats.pivot, dec)}</strong></div>
          <div class="row-between" style="margin-bottom: 4px; color: var(--bear);"><span>Target 1 (S1)</span><strong>${PriceFormatter.formatPrice(stats.s1, dec)}</strong></div>
          <div class="row-between" style="margin-bottom: 4px; color: var(--bear);"><span>Target 2 (S2)</span><strong>${PriceFormatter.formatPrice(stats.s2, dec)}</strong></div>
          <div class="row-between" style="color: var(--bull);"><span>Invalidation (R1)</span><strong>${PriceFormatter.formatPrice(stats.r1, dec)}</strong></div>
        </div>
      </details>

      <div class="card-subtle" style="margin-bottom: 10px;">
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">${i18n.t('analysis_key_stats')} (24 Bars)</div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px;">
          <span>High / Low</span>
          <strong>${PriceFormatter.formatPrice(stats.periodHigh, dec)} / ${PriceFormatter.formatPrice(stats.periodLow, dec)}</strong>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px;">
          <span>ATR (14)</span>
          <strong style="color: var(--gold);">${PriceFormatter.formatPrice(stats.atr14, dec)}</strong>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px;">
          <span>Sentiment</span>
          <strong style="color: ${stats.bullRatio >= 50 ? 'var(--bull)' : 'var(--bear)'};">
            ${stats.bullRatio}% Bullish (${stats.bullCount}/${stats.totalBars})
          </strong>
        </div>
      </div>

      <div class="card-subtle">
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">${i18n.t('analysis_pivot_points')}</div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px;">
          <span style="color: var(--bear);">R2</span>
          <span>${PriceFormatter.formatPrice(stats.r2, dec)}</span>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px;">
          <span style="color: var(--bear);">R1</span>
          <span>${PriceFormatter.formatPrice(stats.r1, dec)}</span>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px; font-weight: 700; color: var(--gold);">
          <span>Pivot (P)</span>
          <span>${PriceFormatter.formatPrice(stats.pivot, dec)}</span>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px; margin-bottom: 4px;">
          <span style="color: var(--bull);">S1</span>
          <span>${PriceFormatter.formatPrice(stats.s1, dec)}</span>
        </div>
        <div class="row-between ltr-num" style="font-size: 12px;">
          <span style="color: var(--bull);">S2</span>
          <span>${PriceFormatter.formatPrice(stats.s2, dec)}</span>
        </div>
      </div>
    </div>
  `;
}
