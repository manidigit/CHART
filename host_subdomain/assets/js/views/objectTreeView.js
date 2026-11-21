import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.47.41';
import {
  state,
  escapeHtml,
  getIndicatorColorPalette,
} from '../core/store.js?v=1.47.41';

const DRAWING_TYPE_LABELS = {
  horizontal_line: { en: 'Horizontal Line', fa: 'خط افقی' },
  hline: { en: 'Horizontal Line', fa: 'خط افقی' },
  vertical_line: { en: 'Vertical Line', fa: 'خط عمودی' },
  vline: { en: 'Vertical Line', fa: 'خط عمودی' },
  trend_line: { en: 'Trend Line', fa: 'خط روند' },
  trend: { en: 'Trend Line', fa: 'خط روند' },
  fib_retracement: { en: 'Fib Retracement', fa: 'فیبوناچی اصلاحی' },
  fib: { en: 'Fib Retracement', fa: 'فیبوناچی اصلاحی' },
  long_position: { en: 'Long Position', fa: 'پوزیشن خرید (Long)' },
  short_position: { en: 'Short Position', fa: 'پوزیشن فروش (Short)' },
  avwap: { en: 'Anchored VWAP', fa: 'VWAP لنگرانداز' },
  regression_channel: { en: 'Regression Channel', fa: 'کانال رگرسیون' },
  frvp: { en: 'Fixed Range VP', fa: 'پروفایل حجم محدوده' },
  gann_fan: { en: 'Gann Fan', fa: 'بادبزن گن' },
  gann_box: { en: 'Gann Box', fa: 'جعبه گن' },
  pitchfork: { en: 'Pitchfork', fa: 'چنگال اندروز' },
  fib_time_zone: { en: 'Fib Time Zone', fa: 'منطقه زمانی فیبو' },
  cyclic_lines: { en: 'Cyclic Lines', fa: 'خطوط چرخه‌ای' },
  fib_speed_fan: { en: 'Fib Speed Fan', fa: 'بادبزن سرعت فیبو' },
  abcd_pattern: { en: 'ABCD Pattern', fa: 'الگوی ABCD' },
  xabcd_pattern: { en: 'XABCD Harmonic', fa: 'هارمونیک XABCD' },
  head_shoulders: { en: 'Head & Shoulders', fa: 'سر و شانه' },
};

export function describeDrawingForTree(d, decimals = 2, isFa = false) {
  const typeKey = String(d?.type || 'horizontal_line').toLowerCase();
  const labelSpec = DRAWING_TYPE_LABELS[typeKey];
  const baseTitle = labelSpec ? (isFa ? labelSpec.fa : labelSpec.en) : typeKey;
  const title =
    typeKey === 'pitchfork' && d?.variant
      ? `${baseTitle} (${String(d.variant)})`
      : baseTitle;

  const fmt = (val) => PriceFormatter.formatPrice(Number(val || 0), decimals);
  let detail = '';
  if (typeKey === 'horizontal_line' || typeKey === 'hline') {
    const p = d.price !== undefined ? d.price : d.price1;
    detail = `@ ${fmt(p)}`;
  } else if (typeKey === 'vertical_line' || typeKey === 'vline') {
    const ms = Number(d.timeUtcMillis || (d.time1EpochSec ? d.time1EpochSec * 1000 : 0));
    detail = ms > 0 ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—';
  } else if (
    typeKey === 'trend_line' ||
    typeKey === 'trend' ||
    typeKey === 'fib_retracement' ||
    typeKey === 'fib'
  ) {
    const p1 = d.startPrice !== undefined ? d.startPrice : d.price1;
    const p2 = d.endPrice !== undefined ? d.endPrice : d.price2;
    detail = `${fmt(p1)} → ${fmt(p2)}`;
  } else if (typeKey === 'long_position' || typeKey === 'short_position') {
    const entry = Number(d.entryPrice || 0);
    const target = Number(d.targetPrice || 0);
    const stop = Number(d.stopPrice || 0);
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    const rr = risk > 1e-6 ? (reward / risk).toFixed(2) : '0.00';
    detail = `E ${fmt(entry)} · R:R ${rr}`;
  } else if (Array.isArray(d.anchors) && d.anchors.length > 0) {
    const first = d.anchors[0];
    const last = d.anchors[d.anchors.length - 1];
    detail =
      d.anchors.length >= 2
        ? `${d.anchors.length} pts · ${fmt(first.price)} → ${fmt(last.price)}`
        : `1 pt · ${fmt(first.price)}`;
  }
  return { title, detail };
}

export function buildActiveIndicatorLayers(activeTab, isFa = false) {
  if (!activeTab) return [];
  const pal = getIndicatorColorPalette(state.chartPreferences);
  const catOverlay = isFa ? 'لایه قیمت' : 'Overlay';
  const catOsc = isFa ? 'اسیلاتور' : 'Oscillator';
  const catStruct = isFa ? 'ساختار' : 'Structure';
  const catVol = isFa ? 'حجم' : 'Volume';
  const bbP = Number(state.chartPreferences.bollingerPeriod || 20);
  const bbSd = Number(state.chartPreferences.bollingerStdDev || 2);
  const pivotType = String(activeTab.pivotType || state.chartPreferences.pivotType || 'STANDARD').toUpperCase();

  const specs = [
    { on: Boolean(activeTab.showSma20), id: 'sma20', label: 'SMA 20', cat: catOverlay, color: pal.sma20, action: 'toggle-sma20' },
    { on: Boolean(activeTab.showSma50), id: 'sma50', label: 'SMA 50', cat: catOverlay, color: pal.sma50, action: 'toggle-sma50' },
    { on: Boolean(activeTab.showSma200), id: 'sma200', label: 'SMA 200', cat: catOverlay, color: pal.sma200, action: 'toggle-sma200' },
    { on: Boolean(activeTab.showEma20), id: 'ema20', label: 'EMA 20', cat: catOverlay, color: pal.ema20, action: 'toggle-ema20' },
    { on: Boolean(activeTab.showEma50), id: 'ema50', label: 'EMA 50', cat: catOverlay, color: pal.ema50, action: 'toggle-ema50' },
    { on: Boolean(activeTab.showEma200), id: 'ema200', label: 'EMA 200', cat: catOverlay, color: pal.ema200, action: 'toggle-ema200' },
    { on: Boolean(activeTab.showMtfEma), id: 'mtfEma', label: 'MTF EMA (20)', cat: catOverlay, color: pal.mtfEma, action: 'toggle-mtf-ema' },
    { on: Boolean(activeTab.showBollinger), id: 'bollinger', label: `Bollinger (${bbP}, ${bbSd})`, cat: catOverlay, color: pal.bollinger, action: 'toggle-bollinger' },
    { on: Boolean(activeTab.showKeltner), id: 'keltner', label: 'Keltner Channel', cat: catOverlay, color: pal.keltner, action: 'toggle-keltner' },
    { on: Boolean(activeTab.showDonchian), id: 'donchian', label: 'Donchian Channel', cat: catOverlay, color: pal.donchian, action: 'toggle-donchian' },
    { on: Boolean(activeTab.showSupertrend), id: 'supertrend', label: 'Supertrend (10, 3)', cat: catOverlay, color: pal.supertrend, action: 'toggle-supertrend' },
    { on: Boolean(activeTab.showVwap), id: 'vwap', label: 'Session VWAP', cat: catOverlay, color: pal.vwap, action: 'toggle-vwap' },
    { on: Boolean(activeTab.showPsar), id: 'psar', label: 'Parabolic SAR', cat: catOverlay, color: pal.psar, action: 'toggle-psar' },
    { on: Boolean(activeTab.showIchimoku), id: 'ichimoku', label: 'Ichimoku Cloud', cat: catOverlay, color: pal.ichimoku, action: 'toggle-ichimoku' },
    { on: Boolean(activeTab.showOverlayMacd), id: 'overlayMacd', label: 'Overlay MACD', cat: catOverlay, color: pal.overlayMacd, action: 'toggle-overlay-macd' },
    { on: Boolean(activeTab.showKillzones), id: 'killzones', label: 'Session Killzones', cat: catStruct, color: pal.killzones, action: 'toggle-killzones' },
    { on: Boolean(activeTab.showSmcStructure), id: 'smc', label: 'SMC (BOS / CHoCH / OB)', cat: catStruct, color: pal.smcBosBull || '#22C55E', action: 'toggle-smc-structure' },
    { on: Boolean(activeTab.showFvg), id: 'fvg', label: 'Fair Value Gaps (FVG)', cat: catStruct, color: pal.fvgBull || '#06B6D4', action: 'toggle-fvg' },
    { on: Boolean(activeTab.showVolumeProfile), id: 'volumeProfile', label: 'Volume Profile (VRVP)', cat: catStruct, color: pal.vrvpPoc || '#F59E0B', action: 'toggle-volume-profile' },
    { on: Boolean(activeTab.showPivotPoints), id: 'pivotPoints', label: `Pivot Points (${pivotType})`, cat: catStruct, color: pal.pivotP || '#8B5CF6', action: 'toggle-pivot-points' },
    { on: Boolean(activeTab.showSrZones), id: 'srZones', label: isFa ? 'نواحی حمایت و مقاومت (S/R)' : 'S/R Zones', cat: catStruct, color: '#10B981', action: 'toggle-sr-zones' },
    { on: Boolean(activeTab.showCandlePatterns), id: 'candlePatterns', label: isFa ? 'الگوهای کندلی' : 'Candlestick Patterns', cat: catStruct, color: '#F97316', action: 'toggle-candle-patterns' },
    { on: activeTab.showVolume !== false, id: 'volume', label: isFa ? 'حجم (Volume)' : 'Volume', cat: catVol, color: '#64748B', action: 'toggle-volume' },
    { on: Boolean(activeTab.showRsi14), id: 'rsi14', label: 'RSI 14', cat: catOsc, color: pal.rsi14, action: 'toggle-rsi14' },
    { on: Boolean(activeTab.showMacd), id: 'macd', label: 'MACD (12, 26, 9)', cat: catOsc, color: pal.macdLine || pal.macd, action: 'toggle-macd' },
    { on: Boolean(activeTab.showAtr14), id: 'atr14', label: 'ATR 14', cat: catOsc, color: pal.atr14, action: 'toggle-atr14' },
    { on: Boolean(activeTab.showAdx14), id: 'adx14', label: 'ADX 14', cat: catOsc, color: pal.adx14, action: 'toggle-adx14' },
    { on: Boolean(activeTab.showStoch14), id: 'stoch14', label: 'Stochastic 14', cat: catOsc, color: pal.stoch14, action: 'toggle-stoch14' },
    { on: Boolean(activeTab.showCci20), id: 'cci20', label: 'CCI 20', cat: catOsc, color: pal.cci20, action: 'toggle-cci20' },
    { on: Boolean(activeTab.showWillR14), id: 'willr14', label: 'Williams %R 14', cat: catOsc, color: pal.willr14, action: 'toggle-willr14' },
    { on: Boolean(activeTab.showObv), id: 'obv', label: 'OBV', cat: catVol, color: pal.obv, action: 'toggle-obv' },
    { on: Boolean(activeTab.showCmf20), id: 'cmf20', label: 'CMF 20', cat: catVol, color: pal.cmf20, action: 'toggle-cmf20' },
    { on: Boolean(activeTab.showRoc12), id: 'roc12', label: 'ROC 12', cat: catOsc, color: pal.roc12, action: 'toggle-roc12' },
  ];

  return specs.filter((item) => item.on);
}

export function renderObjectTreeModal(activeTab, i18n) {
  if (state.activeModal !== 'object-tree' || !activeTab) return '';
  const isFa = i18n.getCurrentLanguage() === 'fa';
  const drawings = Array.isArray(activeTab.drawings) ? activeTab.drawings : [];
  const activeIndicators = buildActiveIndicatorLayers(activeTab, isFa);
  const allHidden = drawings.length > 0 && drawings.every((d) => d.visible === false);
  const hasUnlocked = drawings.some((d) => !d.locked);
  const decimals = Number(activeTab.decimals || 2);
  const tfLabel = PriceFormatter.displayTimeframeLabel(activeTab.timeframe || 'M15');

  const drawingRowsHtml =
    drawings.length === 0
      ? `<div class="card-subtle" style="padding: 12px; font-size: 12px; color: var(--text-muted);">
          ${
            isFa
              ? 'هنوز ترسیمی روی این چارت ثبت نشده است. از نوار ابزار سمت چپ برای رسم خط روند، فیبوناچی یا پوزیشن استفاده کنید.'
              : 'No drawings on this chart yet. Use the left tool rail to draw trendlines, Fibonacci retracements, or positions.'
          }
        </div>`
      : [...drawings]
          .reverse()
          .map((d) => {
            const isVisible = d.visible !== false;
            const isLocked = Boolean(d.locked);
            const isSel = activeTab.selectedDrawingId === d.id;
            const safeId = escapeHtml(d.id);
            const colorHex = escapeHtml(d.colorHex || d.color || '#2962FF');
            const { title, detail } = describeDrawingForTree(d, decimals, isFa);
            return `
              <div
                class="card-subtle"
                style="padding: 8px 10px; border: 1px solid ${isSel ? 'var(--primary)' : 'var(--border)'}; background: ${isSel ? 'var(--primary-soft)' : 'var(--bg-card)'}; opacity: ${isVisible ? '1' : '0.6'};"
              >
                <div class="row-between" style="gap: 8px;">
                  <button
                    type="button"
                    data-action="object-tree-select-drawing"
                    data-drawing-id="${safeId}"
                    style="flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; background: transparent; border: none; padding: 0; text-align: start; cursor: pointer; color: inherit;"
                    title="${isFa ? 'انتخاب ترسیم روی چارت' : 'Select drawing on chart'}"
                  >
                    <span style="width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; background: ${colorHex};"></span>
                    <span style="min-width: 0; flex: 1;">
                      <span style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <strong style="font-size: 12.5px; color: var(--text-strong);">${escapeHtml(title)}</strong>
                        ${
                          !isVisible
                            ? `<span class="badge" style="font-size: 10px; padding: 1px 6px;">${isFa ? 'مخفی' : 'Hidden'}</span>`
                            : ''
                        }
                        ${
                          isLocked
                            ? `<span class="badge" style="font-size: 10px; padding: 1px 6px; color: var(--gold); border-color: var(--gold);">${isFa ? 'قفل' : 'Locked'}</span>`
                            : ''
                        }
                      </span>
                      <span class="ltr-num" style="display: block; font-size: 11px; color: var(--text-muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${escapeHtml(detail)}
                      </span>
                    </span>
                  </button>
                  <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                    <button
                      type="button"
                      class="btn btn-sm btn-icon ${!isVisible ? 'active' : ''}"
                      data-action="object-tree-toggle-visible"
                      data-drawing-id="${safeId}"
                      title="${isVisible ? (isFa ? 'مخفی‌کردن ترسیم' : 'Hide drawing') : isFa ? 'نمایش ترسیم' : 'Show drawing'}"
                      aria-label="${isVisible ? 'Hide drawing' : 'Show drawing'}"
                    >
                      ${
                        isVisible
                          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
                          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
                      }
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-icon ${isLocked ? 'active' : ''}"
                      data-action="object-tree-toggle-locked"
                      data-drawing-id="${safeId}"
                      title="${isLocked ? (isFa ? 'باز کردن قفل ترسیم' : 'Unlock drawing') : isFa ? 'قفل‌کردن ترسیم' : 'Lock drawing'}"
                      aria-label="${isLocked ? 'Unlock drawing' : 'Lock drawing'}"
                      style="${isLocked ? 'color: var(--gold); border-color: var(--gold);' : ''}"
                    >
                      ${
                        isLocked
                          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
                          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>'
                      }
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-icon"
                      data-action="object-tree-delete-drawing"
                      data-drawing-id="${safeId}"
                      title="${isFa ? 'حذف ترسیم' : 'Delete drawing'}"
                      aria-label="Delete drawing"
                      style="color: var(--bear);"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            `;
          })
          .join('');

  const indicatorRowsHtml =
    activeIndicators.length === 0
      ? `<div class="card-subtle" style="padding: 12px; font-size: 12px; color: var(--text-muted);">
          ${
            isFa
              ? 'در حال حاضر فقط کندل‌های قیمت نمایش داده می‌شوند. از دکمه اندیکاتورها لایه‌های تحلیلی اضافه کنید.'
              : 'Only price candles are currently active. Open Indicators to enable overlays, oscillators, or S/R zones.'
          }
        </div>`
      : activeIndicators
          .map(
            (layer) => `
              <div class="card-subtle" style="padding: 7px 10px;">
                <div class="row-between" style="gap: 8px;">
                  <div style="display: flex; align-items: center; gap: 9px; min-width: 0; flex: 1;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; background: ${escapeHtml(layer.color || '#2962FF')};"></span>
                    <div style="min-width: 0; flex: 1;">
                      <div style="font-size: 12.5px; font-weight: 700; color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${escapeHtml(layer.label)}
                      </div>
                      <div style="font-size: 10.5px; color: var(--text-muted);">
                        ${escapeHtml(layer.cat)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn btn-sm"
                    data-action="${escapeHtml(layer.action)}"
                    title="${isFa ? 'غیرفعال‌کردن اندیکاتور' : 'Disable indicator'}"
                    style="font-size: 11px; flex-shrink: 0;"
                  >
                    ${isFa ? 'خاموش' : 'Hide'}
                  </button>
                </div>
              </div>
            `
          )
          .join('');

  return `
    <div class="modal-backdrop" data-action="close-modal-backdrop">
      <div class="modal-card" style="max-width: 540px; max-height: 84vh; display: flex; flex-direction: column;" dir="${isFa ? 'rtl' : 'ltr'}">
        <div class="tv-modal-header">
          <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.1" style="flex-shrink: 0;"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            <div style="min-width: 0;">
              <div style="font-weight: 800; color: var(--text-strong); font-size: 13.5px;">
                ${isFa ? 'درخت اشیاء (Object Tree)' : 'Object Tree'}
              </div>
              <div class="ltr-num" style="font-size: 11px; color: var(--text-muted);">
                ${escapeHtml(activeTab.symbolCode)} · ${escapeHtml(tfLabel)}
              </div>
            </div>
            <span class="tv-badge-count ltr-num">${drawings.length + activeIndicators.length}</span>
          </div>
          <button type="button" class="btn btn-sm btn-icon" data-action="close-modal" aria-label="Close">✕</button>
        </div>

        <div class="tv-modal-body" style="display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding-bottom: 14px;">
          <div class="row-between" style="flex-wrap: wrap; gap: 6px; padding-top: 2px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="font-size: 12.5px; color: var(--text-strong);">
                ${isFa ? '۱. ترسیم‌های چارت' : '1. Chart Drawings'}
              </strong>
              <span class="tv-badge-count ltr-num">${drawings.length}</span>
            </div>
            ${
              drawings.length > 0
                ? `<div style="display: flex; align-items: center; gap: 6px;">
                    <button
                      type="button"
                      class="btn btn-sm"
                      data-action="object-tree-toggle-all-visible"
                      data-visible="${allHidden ? 'true' : 'false'}"
                      style="font-size: 11px;"
                    >
                      ${allHidden ? (isFa ? 'نمایش همه' : 'Show All') : isFa ? 'مخفی‌کردن همه' : 'Hide All'}
                    </button>
                    ${
                      hasUnlocked
                        ? `<button
                            type="button"
                            class="btn btn-sm"
                            data-action="object-tree-clear-unlocked"
                            style="font-size: 11px; color: var(--bear); border-color: var(--bear);"
                          >
                            ${isFa ? 'پاک‌کردن بازها' : 'Clear Unlocked'}
                          </button>`
                        : ''
                    }
                  </div>`
                : ''
            }
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${drawingRowsHtml}
          </div>

          <div style="height: 1px; background: var(--border); margin: 4px 0;"></div>

          <div style="display: flex; align-items: center; gap: 6px;">
            <strong style="font-size: 12.5px; color: var(--text-strong);">
              ${isFa ? '۲. اندیکاتورها و لایه‌های فعال' : '2. Active Indicators & Overlays'}
            </strong>
            <span class="tv-badge-count ltr-num">${activeIndicators.length}</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${indicatorRowsHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}
