import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.28.5';
import { state } from '../core/store.js?v=1.28.5';

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

export function renderPredictionModal(activeTab, i18n) {
  if (state.activeModal !== 'prediction') return '';

  const watchlist = state.symbols.filter((s) => s.inWatchlist);
  const symbolOptions = watchlist
    .map(
      (s) =>
        `<option value="${s.symbolCode}" ${activeTab && activeTab.symbolCode === s.symbolCode ? 'selected' : ''}>${s.symbolCode} — ${s.customTitle || i18n.t('symbol_' + s.symbolCode) || s.symbolCode}</option>`
    )
    .join('');

  const allowedTfs =
    activeTab && activeTab.provider === 'eia_brent_spot' ? ['D1'] : ['M15', 'H1', 'H4', 'D1'];
  const tfChips = allowedTfs
    .map((tf) => {
      const isAct = activeTab && activeTab.timeframe === tf;
      return `<button class="chip ltr-num ${isAct ? 'active' : ''}" data-action="set-timeframe" data-tf="${tf}" style="font-size: 11.5px; padding: 3px 10px;">${PriceFormatter.displayTimeframeLabel(tf)}</button>`;
    })
    .join('');

  const selectorBar = `
    <div class="row-between" style="margin-bottom: 14px; gap: 10px; flex-wrap: wrap;">
      <select class="input-field ltr-num" style="width: auto; min-width: 220px; min-height: 34px; padding: 4px 10px; font-weight: 700;" data-action="select-prediction-symbol">
        ${symbolOptions}
      </select>
      <div class="chip-group">
        ${tfChips}
      </div>
    </div>
  `;

  const stats = activeTab && activeTab.candles ? computeTechnicalAnalytics(activeTab.candles) : null;
  let bodyContent = '';

  if (!stats) {
    bodyContent = `
      ${selectorBar}
      <div class="card-subtle" style="text-align: center; padding: 24px;">
        <p style="color: var(--text-muted); font-size: 13px; margin: 0;">${i18n.t('analysis_no_data')}</p>
      </div>
    `;
  } else {
    const dec = activeTab.decimals;
    const ladderSpan = Math.max(0.00001, stats.r2 - stats.s2);
    const pricePosPct = Math.max(4, Math.min(96, Math.round(((stats.lastClose - stats.s2) / ladderSpan) * 100)));

    bodyContent = `
      ${selectorBar}

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; margin-bottom: 12px;">
        <!-- Bullish Breakout Card -->
        <div class="card-subtle" style="border-color: rgba(38, 166, 154, 0.4);">
          <div class="row-between ltr-num" style="font-weight: 700; font-size: 13px; color: var(--bull); margin-bottom: 8px;">
            <span>▲ Bullish Breakout</span>
            <span>${PriceFormatter.formatPrice(stats.r1, dec)} → ${PriceFormatter.formatPrice(stats.r2, dec)}</span>
          </div>
          <div class="ltr-num" style="font-size: 12px;">
            <div class="row-between" style="margin-bottom: 5px;"><span style="color: var(--text-muted);">Entry Trigger (P)</span><strong>${PriceFormatter.formatPrice(stats.pivot, dec)}</strong></div>
            <div class="row-between" style="margin-bottom: 5px; color: var(--bull);"><span>Target 1 (R1)</span><strong>${PriceFormatter.formatPrice(stats.r1, dec)}</strong></div>
            <div class="row-between" style="margin-bottom: 5px; color: var(--bull);"><span>Target 2 (R2)</span><strong>${PriceFormatter.formatPrice(stats.r2, dec)}</strong></div>
            <div class="row-between" style="color: var(--bear); margin-bottom: 10px;"><span>Invalidation (S1)</span><strong>${PriceFormatter.formatPrice(stats.s1, dec)}</strong></div>
            <button
              class="btn btn-sm btn-primary"
              style="width: 100%;"
              data-action="project-scenario-levels"
              data-bias="bull"
              data-entry="${stats.pivot}"
              data-t1="${stats.r1}"
              data-t2="${stats.r2}"
              data-stop="${stats.s1}"
            >
              ${i18n.t('analysis_project_levels')}
            </button>
          </div>
        </div>

        <!-- Bearish Breakdown Card -->
        <div class="card-subtle" style="border-color: rgba(239, 83, 80, 0.4);">
          <div class="row-between ltr-num" style="font-weight: 700; font-size: 13px; color: var(--bear); margin-bottom: 8px;">
            <span>▼ Bearish Breakdown</span>
            <span>${PriceFormatter.formatPrice(stats.s1, dec)} → ${PriceFormatter.formatPrice(stats.s2, dec)}</span>
          </div>
          <div class="ltr-num" style="font-size: 12px;">
            <div class="row-between" style="margin-bottom: 5px;"><span style="color: var(--text-muted);">Breakdown Trigger (P)</span><strong>${PriceFormatter.formatPrice(stats.pivot, dec)}</strong></div>
            <div class="row-between" style="margin-bottom: 5px; color: var(--bear);"><span>Target 1 (S1)</span><strong>${PriceFormatter.formatPrice(stats.s1, dec)}</strong></div>
            <div class="row-between" style="margin-bottom: 5px; color: var(--bear);"><span>Target 2 (S2)</span><strong>${PriceFormatter.formatPrice(stats.s2, dec)}</strong></div>
            <div class="row-between" style="color: var(--bull); margin-bottom: 10px;"><span>Invalidation (R1)</span><strong>${PriceFormatter.formatPrice(stats.r1, dec)}</strong></div>
            <button
              class="btn btn-sm btn-primary"
              style="width: 100%;"
              data-action="project-scenario-levels"
              data-bias="bear"
              data-entry="${stats.pivot}"
              data-t1="${stats.s1}"
              data-t2="${stats.s2}"
              data-stop="${stats.r1}"
            >
              ${i18n.t('analysis_project_levels')}
            </button>
          </div>
        </div>
      </div>

      <!-- Visual Pivot Ladder -->
      <div class="card-subtle" style="margin-bottom: 12px;">
        <div class="row-between" style="margin-bottom: 8px;">
          <span style="font-size: 12px; font-weight: 700; color: var(--text);">${i18n.t('analysis_pivot_points')}</span>
          <span class="ltr-num" style="font-size: 11.5px; color: var(--primary);">Last: ${PriceFormatter.formatPrice(stats.lastClose, dec)}</span>
        </div>
        <div style="position: relative; height: 8px; background: linear-gradient(90deg, rgba(38,166,154,0.35), rgba(245,158,11,0.35), rgba(239,83,80,0.35)); border-radius: 4px; margin: 10px 0 14px 0;">
          <div title="Close: ${PriceFormatter.formatPrice(stats.lastClose, dec)}" style="position: absolute; left: ${pricePosPct}%; top: -4px; width: 14px; height: 16px; margin-left: -7px; border-radius: 3px; background: var(--primary); border: 2px solid #fff;"></div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; text-align: center;" class="ltr-num">
          <div style="padding: 6px; background: var(--bg); border-radius: 4px; border: 1px solid var(--border);">
            <div style="font-size: 10px; color: var(--bull);">S2</div>
            <strong style="font-size: 12px;">${PriceFormatter.formatPrice(stats.s2, dec)}</strong>
          </div>
          <div style="padding: 6px; background: var(--bg); border-radius: 4px; border: 1px solid var(--border);">
            <div style="font-size: 10px; color: var(--bull);">S1</div>
            <strong style="font-size: 12px;">${PriceFormatter.formatPrice(stats.s1, dec)}</strong>
          </div>
          <div style="padding: 6px; background: var(--bg); border-radius: 4px; border: 1px solid var(--gold);">
            <div style="font-size: 10px; color: var(--gold);">PIVOT (P)</div>
            <strong style="font-size: 12px; color: var(--gold);">${PriceFormatter.formatPrice(stats.pivot, dec)}</strong>
          </div>
          <div style="padding: 6px; background: var(--bg); border-radius: 4px; border: 1px solid var(--border);">
            <div style="font-size: 10px; color: var(--bear);">R1</div>
            <strong style="font-size: 12px;">${PriceFormatter.formatPrice(stats.r1, dec)}</strong>
          </div>
          <div style="padding: 6px; background: var(--bg); border-radius: 4px; border: 1px solid var(--border);">
            <div style="font-size: 10px; color: var(--bear);">R2</div>
            <strong style="font-size: 12px;">${PriceFormatter.formatPrice(stats.r2, dec)}</strong>
          </div>
        </div>
      </div>

      <!-- 24-Bar Key Volatility & Sentiment -->
      <div class="card-subtle">
        <div style="font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 8px;">${i18n.t('analysis_key_stats')} (24 Bars)</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;" class="ltr-num">
          <div>
            <div style="font-size: 10.5px; color: var(--text-muted);">High / Low</div>
            <strong style="font-size: 12px;">${PriceFormatter.formatPrice(stats.periodHigh, dec)} / ${PriceFormatter.formatPrice(stats.periodLow, dec)}</strong>
          </div>
          <div>
            <div style="font-size: 10.5px; color: var(--text-muted);">ATR (14)</div>
            <strong style="font-size: 12px; color: var(--gold);">${PriceFormatter.formatPrice(stats.atr14, dec)}</strong>
          </div>
          <div>
            <div style="font-size: 10.5px; color: var(--text-muted);">Sentiment</div>
            <strong style="font-size: 12px; color: ${stats.bullRatio >= 50 ? 'var(--bull)' : 'var(--bear)'};">
              ${stats.bullRatio}% Bull (${stats.bullCount}/${stats.totalBars})
            </strong>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="modal-backdrop" data-action="close-modal-backdrop">
      <div class="modal-card">
        <div class="tv-modal-header">
          <div class="tv-modal-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            <span>${i18n.t('nav_prediction')}</span>
          </div>
          <button class="btn btn-sm btn-icon" data-action="close-modal">✕</button>
        </div>
        <div class="tv-modal-body">
          ${bodyContent}
        </div>
      </div>
    </div>
  `;
}

export const renderAnalysisContent = renderPredictionModal;

