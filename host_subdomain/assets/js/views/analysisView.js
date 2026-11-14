import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.42.0';
import { TechnicalIndicators } from '../algorithms/technicalIndicators.js?v=1.42.0';
import { state, escapeHtml } from '../core/store.js?v=1.42.0';
import { renderSymbolBadge } from './watchlistView.js?v=1.42.0';

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
  const activeCode = activeTab ? activeTab.symbolCode : watchlist[0]?.symbolCode || 'SPOTBRENT';
  const symbolOptions = watchlist
    .map(
      (s) =>
        `<option value="${escapeHtml(s.symbolCode)}" ${activeCode === s.symbolCode ? 'selected' : ''}>${escapeHtml(s.symbolCode)} — ${escapeHtml(s.customTitle || i18n.t('symbol_' + s.symbolCode) || s.symbolCode)}</option>`
    )
    .join('');

  const allowedTfs =
    activeTab && (activeTab.provider === 'eia_brent_spot' || activeTab.provider === 'stooq')
      ? ['D1', 'W1']
      : ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
  const tfChips = allowedTfs
    .map((tf) => {
      const isAct = activeTab && activeTab.timeframe === tf;
      return `<button class="chip ltr-num ${isAct ? 'active' : ''}" data-action="set-timeframe" data-tf="${tf}" style="font-size: 11.5px; padding: 3px 10px;">${PriceFormatter.displayTimeframeLabel(tf)}</button>`;
    })
    .join('');

  const selectorBar = `
    <div class="row-between" style="margin-bottom: 14px; gap: 10px; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 8px;">
        ${renderSymbolBadge(activeCode, 28)}
        <select class="input-field ltr-num" style="width: auto; min-width: 210px; min-height: 34px; padding: 4px 10px; font-weight: 700;" data-action="select-prediction-symbol">
          ${symbolOptions}
        </select>
      </div>
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
        <!-- Bullish Scenario Card -->
        <div class="card-subtle" style="border-color: rgba(38, 166, 154, 0.4);">
          <div class="row-between ltr-num" style="font-weight: 700; font-size: 13px; color: var(--bull); margin-bottom: 8px;">
            <span>▲ Upside Structure Scenario</span>
            <span>${PriceFormatter.formatPrice(stats.r1, dec)} → ${PriceFormatter.formatPrice(stats.r2, dec)}</span>
          </div>
          <div class="ltr-num" style="font-size: 12px;">
            <div class="row-between" style="margin-bottom: 5px;"><span style="color: var(--text-muted);">Structural Pivot Anchor (P)</span><strong>${PriceFormatter.formatPrice(stats.pivot, dec)}</strong></div>
            <div class="row-between" style="margin-bottom: 5px; color: var(--bull);"><span>Upper Variance Ref 1 (R1)</span><strong>${PriceFormatter.formatPrice(stats.r1, dec)}</strong></div>
            <div class="row-between" style="margin-bottom: 5px; color: var(--bull);"><span>Upper Variance Ref 2 (R2)</span><strong>${PriceFormatter.formatPrice(stats.r2, dec)}</strong></div>
            <div class="row-between" style="color: var(--bear); margin-bottom: 10px;"><span>Structure Reversal Ref (S1)</span><strong>${PriceFormatter.formatPrice(stats.s1, dec)}</strong></div>
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

        <!-- Bearish Scenario Card -->
        <div class="card-subtle" style="border-color: rgba(239, 83, 80, 0.4);">
          <div class="row-between ltr-num" style="font-weight: 700; font-size: 13px; color: var(--bear); margin-bottom: 8px;">
            <span>▼ Downside Structure Scenario</span>
            <span>${PriceFormatter.formatPrice(stats.s1, dec)} → ${PriceFormatter.formatPrice(stats.s2, dec)}</span>
          </div>
          <div class="ltr-num" style="font-size: 12px;">
            <div class="row-between" style="margin-bottom: 5px;"><span style="color: var(--text-muted);">Structural Pivot Anchor (P)</span><strong>${PriceFormatter.formatPrice(stats.pivot, dec)}</strong></div>
            <div class="row-between" style="margin-bottom: 5px; color: var(--bear);"><span>Lower Variance Ref 1 (S1)</span><strong>${PriceFormatter.formatPrice(stats.s1, dec)}</strong></div>
            <div class="row-between" style="margin-bottom: 5px; color: var(--bear);"><span>Lower Variance Ref 2 (S2)</span><strong>${PriceFormatter.formatPrice(stats.s2, dec)}</strong></div>
            <div class="row-between" style="color: var(--bull); margin-bottom: 10px;"><span>Structure Reversal Ref (R1)</span><strong>${PriceFormatter.formatPrice(stats.r1, dec)}</strong></div>
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

      <!-- 30-Period Multi-Step Future Candlestick Projection (PRED-09 & PRED-10: >= 10 candles on every TF) -->
      ${(() => {
        const isFa = i18n.getCurrentLanguage() === 'fa';
        const tfStr = PriceFormatter.displayTimeframeLabel(activeTab.timeframe || 'M15');
        const futCandles = TechnicalIndicators.computeFutureCandlestickProjection(
          activeTab.candles || [],
          activeTab.timeframe || 'M15',
          30
        );
        const steps = [5, 10, 15, 20, 25, 30]
          .map((s) => futCandles[s - 1])
          .filter(Boolean);
        const isProjActive = Boolean(activeTab.showFutureProjection);
        return `
          <div class="card-subtle" style="margin-bottom: 12px; border-color: rgba(245, 158, 11, 0.45);">
            <div class="row-between" style="margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
              <div>
                <div style="font-size: 12.5px; font-weight: 800; color: var(--gold);">
                  ${
                    isFa
                      ? `پیش‌بینی ۳۰ کندل آینده روی چارت (${tfStr} — حداقل ۱۰ کندل)`
                      : `Probabilistic Horizon Projection (30 Periods on ${tfStr})`
                  }
                </div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                  ${
                    isFa
                      ? 'بازده لگاریتمی GARCH(1,1) + Kalman + AR(2)/GP همراه با خط جداکننده PAST | Forecast'
                      : 'Log-Return Ensemble (Kalman + GARCH(1,1) + AR(2)/GP) with Present Bar Divider'
                  }
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  data-action="open-forecast-studio"
                >
                  ${isFa ? 'باز کردن آزمایشگاه پیش‌بینی' : 'Open Forecast Studio'}
                </button>
                <button
                  type="button"
                  class="btn btn-sm ${isProjActive ? 'btn-primary' : ''}"
                  data-action="toggle-future-projection-from-modal"
                >
                  ${
                    isProjActive
                      ? isFa
                        ? 'نمایش ۳۰ کندل آینده روی چارت: فعال ✓'
                        : 'Future Overlay Active ✓'
                      : isFa
                        ? 'ترسیم ۳۰ کندل آینده روی چارت'
                        : 'Render Future on Chart'
                  }
                </button>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; text-align: center;" class="ltr-num">
              ${steps
                .map((fp) => {
                  const pct = Number(fp.pctChangeFromLast || 0);
                  const pctStr = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
                  const col = pct >= 0 ? 'var(--bull)' : 'var(--bear)';
                  return `
                    <div style="padding: 6px 4px; background: var(--bg); border-radius: 4px; border: 1px solid var(--border);">
                      <div style="font-size: 10px; font-weight: 700; color: var(--gold);">+${fp.stepIndex}</div>
                      <strong style="font-size: 11.5px; display: block; margin: 2px 0;">${PriceFormatter.formatPrice(fp.close, dec)}</strong>
                      <span style="font-size: 10px; color: ${col}; font-weight: 600;">${pctStr}</span>
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>
        `;
      })()}

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

