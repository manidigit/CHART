import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.42.0';
import {
  RENDER_MODES,
  FORECAST_STATUS,
  normalizeRenderMode,
  clampHorizonBars,
} from '../forecast/forecastContract.js?v=1.42.0';
import { defaultForecastRegistry, REMOTE_DL_WORKER_SPEC } from '../forecast/modelRegistry.js?v=1.42.0';
import { defaultForecastLedger } from '../forecast/forecastLedger.js?v=1.42.0';
import { ForecastEngine } from '../forecast/forecastEngine.js?v=1.42.0';
import { state, escapeHtml, getCachedOrAggregatedCandles } from '../core/store.js?v=1.42.0';
import { renderSymbolBadge } from './watchlistView.js?v=1.42.0';

export function buildForecastForTab(activeTab) {
  if (!activeTab) return null;
  const candles =
    Array.isArray(activeTab.candles) && activeTab.candles.length > 0
      ? activeTab.candles
      : getCachedOrAggregatedCandles(activeTab.symbolCode, activeTab.provider, activeTab.timeframe);

  const prefs = state.chartPreferences || {};
  if (prefs.forecastPluginConfig) {
    defaultForecastRegistry.applyConfig(prefs.forecastPluginConfig);
  }
  const horizonBars = clampHorizonBars(activeTab.forecastHorizonBars || prefs.forecastHorizonBars || 30);
  const renderMode = normalizeRenderMode(activeTab.forecastRenderMode || prefs.forecastRenderMode || RENDER_MODES.HYBRID);
  const workerUrl = prefs.forecastWorkerUrl || '';

  return {
    candles,
    result: ForecastEngine.project(candles, {
      symbolCode: activeTab.symbolCode,
      timeframe: activeTab.timeframe,
      horizonBars,
      renderMode,
      registry: defaultForecastRegistry,
      workerUrl,
    }),
  };
}

export function renderForecastStudioFanCanvas(canvas, candles = [], forecast = null, decimals = 2, isDark = true) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(320, Math.floor(rect.width || 680));
  const h = Math.max(220, Math.floor(rect.height || 300));
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bg = isDark ? '#131722' : '#FFFFFF';
  const gridCol = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.07)';
  const textCol = isDark ? '#94A3B8' : '#475569';
  const bullCol = '#26A69A';
  const bearCol = '#EF5350';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const hist = candles.slice(-48);
  const pts = forecast && Array.isArray(forecast.points) ? forecast.points : [];
  if (hist.length === 0) {
    ctx.fillStyle = textCol;
    ctx.font = '600 13px "Vazirmatn", "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No candle history loaded for selected symbol / timeframe', w / 2, h / 2);
    return;
  }

  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of hist) {
    minP = Math.min(minP, Number(c.low));
    maxP = Math.max(maxP, Number(c.high));
  }
  for (const p of pts) {
    minP = Math.min(minP, Number(p.q10), Number(p.low));
    maxP = Math.max(maxP, Number(p.q90), Number(p.high));
  }
  const padPrice = Math.max(1e-6, (maxP - minP) * 0.08);
  minP -= padPrice;
  maxP += padPrice;

  const padL = 14;
  const padR = 72;
  const padT = 20;
  const padB = 26;
  const plotW = Math.max(100, w - padL - padR);
  const plotH = Math.max(80, h - padT - padB);
  const totalSlots = hist.length + pts.length;
  const slotW = plotW / Math.max(1, totalSlots);

  const xOf = (idx) => padL + (idx + 0.5) * slotW;
  const yOf = (price) => padT + ((maxP - price) / Math.max(1e-8, maxP - minP)) * plotH;

  // Horizontal grid + Y labels
  ctx.strokeStyle = gridCol;
  ctx.lineWidth = 1;
  ctx.font = '600 10.5px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  for (let g = 0; g <= 4; g++) {
    const frac = g / 4;
    const py = padT + frac * plotH;
    const pv = maxP - frac * (maxP - minP);
    ctx.beginPath();
    ctx.moveTo(padL, py);
    ctx.lineTo(w - padR, py);
    ctx.stroke();
    ctx.fillStyle = textCol;
    ctx.fillText(PriceFormatter.formatPrice(pv, decimals), w - padR + 6, py + 3);
  }

  // Historical candlesticks
  const bodyW = Math.max(2, Math.min(11, slotW * 0.64));
  hist.forEach((c, i) => {
    const x = xOf(i);
    const col = Number(c.close) >= Number(c.open) ? bullCol : bearCol;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, yOf(Number(c.high)));
    ctx.lineTo(x, yOf(Number(c.low)));
    ctx.stroke();
    const oY = yOf(Number(c.open));
    const cY = yOf(Number(c.close));
    ctx.fillStyle = col;
    ctx.fillRect(x - bodyW / 2, Math.min(oY, cY), bodyW, Math.max(1.5, Math.abs(cY - oY)));
  });

  if (pts.length > 0) {
    const mode = normalizeRenderMode(forecast.renderMode);
    const dividerX = padL + hist.length * slotW;

    // Fan clouds (FAN_CHART or HYBRID)
    if (mode === RENDER_MODES.FAN_CHART || mode === RENDER_MODES.HYBRID) {
      ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.13)' : 'rgba(41, 98, 255, 0.12)';
      ctx.beginPath();
      ctx.moveTo(xOf(hist.length - 1), yOf(Number(hist[hist.length - 1].close)));
      pts.forEach((p, idx) => ctx.lineTo(xOf(hist.length + idx), yOf(p.q90)));
      for (let idx = pts.length - 1; idx >= 0; idx--) {
        ctx.lineTo(xOf(hist.length + idx), yOf(pts[idx].q10));
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isDark ? 'rgba(245, 158, 11, 0.22)' : 'rgba(245, 158, 11, 0.2)';
      ctx.beginPath();
      ctx.moveTo(xOf(hist.length - 1), yOf(Number(hist[hist.length - 1].close)));
      pts.forEach((p, idx) => ctx.lineTo(xOf(hist.length + idx), yOf(p.q75)));
      for (let idx = pts.length - 1; idx >= 0; idx--) {
        ctx.lineTo(xOf(hist.length + idx), yOf(pts[idx].q25));
      }
      ctx.closePath();
      ctx.fill();
    }

    // Ghost OHLC candles (GHOST_CANDLES or HYBRID)
    if (mode === RENDER_MODES.GHOST_CANDLES || mode === RENDER_MODES.HYBRID) {
      pts.forEach((p, idx) => {
        const x = xOf(hist.length + idx);
        const bull = p.close >= p.open;
        ctx.strokeStyle = isDark ? 'rgba(167, 150, 212, 0.62)' : 'rgba(124, 105, 172, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, yOf(p.high));
        ctx.lineTo(x, yOf(p.low));
        ctx.stroke();
        const oY = yOf(p.open);
        const cY = yOf(p.close);
        ctx.fillStyle = bull
          ? isDark
            ? 'rgba(167, 150, 212, 0.68)'
            : 'rgba(124, 105, 172, 0.64)'
          : isDark
            ? 'rgba(122, 108, 162, 0.45)'
            : 'rgba(100, 86, 145, 0.45)';
        ctx.fillRect(x - bodyW / 2, Math.min(oY, cY), bodyW, Math.max(2, Math.abs(cY - oY)));
      });
    }

    // Median q50 line
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(xOf(hist.length - 1), yOf(Number(hist[hist.length - 1].close)));
    pts.forEach((p, idx) => ctx.lineTo(xOf(hist.length + idx), yOf(p.q50)));
    ctx.stroke();
    ctx.setLineDash([]);

    // Present divider line
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.75)' : 'rgba(15,23,42,0.7)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(dividerX, padT);
    ctx.lineTo(dividerX, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Terminal quantile badges
    const lastPt = pts[pts.length - 1];
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#38BDF8';
    ctx.fillText(`q90 ${PriceFormatter.formatPrice(lastPt.q90, decimals)}`, Math.max(padL, xOf(totalSlots - 1) - 62), Math.max(padT + 10, yOf(lastPt.q90) - 4));
    ctx.fillStyle = '#F59E0B';
    ctx.fillText(`q50 ${PriceFormatter.formatPrice(lastPt.q50, decimals)}`, Math.max(padL, xOf(totalSlots - 1) - 62), yOf(lastPt.q50) - 4);
    ctx.fillStyle = '#38BDF8';
    ctx.fillText(`q10 ${PriceFormatter.formatPrice(lastPt.q10, decimals)}`, Math.max(padL, xOf(totalSlots - 1) - 62), Math.min(padT + plotH - 4, yOf(lastPt.q10) + 12));
  }
}

export function renderForecastStudioView(activeTab, i18n) {
  const isFa = i18n.getCurrentLanguage() === 'fa';
  const watchlist = state.symbols.filter((s) => s.inWatchlist);
  const activeCode = activeTab ? activeTab.symbolCode : watchlist[0]?.symbolCode || 'SPOTBRENT';
  const decimals = activeTab ? Number(activeTab.decimals || 2) : 2;
  const subTab = state.forecastStudioTab || 'overview';
  const horizonBars = clampHorizonBars((activeTab && activeTab.forecastHorizonBars) || state.chartPreferences.forecastHorizonBars || 30);
  const renderMode = normalizeRenderMode((activeTab && activeTab.forecastRenderMode) || state.chartPreferences.forecastRenderMode || RENDER_MODES.HYBRID);

  const built = buildForecastForTab(activeTab);
  const fc = built ? built.result : null;
  state._lastForecastResult = fc;

  const symbolOptions = watchlist
    .map(
      (s) =>
        `<option value="${escapeHtml(s.symbolCode)}" ${activeCode === s.symbolCode ? 'selected' : ''}>${escapeHtml(s.symbolCode)} — ${escapeHtml(s.customTitle || s.symbolCode)}</option>`
    )
    .join('');

  const allowedTfs =
    activeTab && (activeTab.provider === 'eia_brent_spot' || activeTab.provider === 'stooq')
      ? ['D1', 'W1']
      : ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
  const tfButtons = allowedTfs
    .map((tf) => {
      const isAct = activeTab && activeTab.timeframe === tf;
      return `<button type="button" class="chip ltr-num ${isAct ? 'active' : ''}" data-action="set-timeframe" data-tf="${tf}">${PriceFormatter.displayTimeframeLabel(tf)}</button>`;
    })
    .join('');

  const horizons = [10, 15, 20, 30, 45, 60];
  const horizonButtons = horizons
    .map(
      (h) =>
        `<button type="button" class="chip ltr-num ${horizonBars === h ? 'active' : ''}" data-action="set-forecast-horizon" data-horizon="${h}">+${h}</button>`
    )
    .join('');

  const modes = [
    { id: RENDER_MODES.HYBRID, label: isFa ? 'ترکیبی (Fan + Ghost)' : 'Hybrid (Fan + Ghost)' },
    { id: RENDER_MODES.FAN_CHART, label: isFa ? 'ابری کوانتایل (Fan)' : 'Quantile Fan' },
    { id: RENDER_MODES.GHOST_CANDLES, label: isFa ? 'کندل سایه‌ای (Ghost)' : 'Ghost Candles' },
  ];
  const modeButtons = modes
    .map(
      (m) =>
        `<button type="button" class="chip ${renderMode === m.id ? 'active' : ''}" data-action="set-forecast-render-mode" data-mode="${m.id}">${m.label}</button>`
    )
    .join('');

  const statusBadgeClass =
    fc && fc.status === FORECAST_STATUS.VALID
      ? 'ci-fc-badge-valid'
      : fc && fc.status === FORECAST_STATUS.PROVISIONAL
        ? 'ci-fc-badge-provisional'
        : 'ci-fc-badge-blocked';

  const statusLabel =
    fc && fc.status === FORECAST_STATUS.VALID
      ? isFa ? 'تأییدشده (VALID)' : 'VALID'
      : fc && fc.status === FORECAST_STATUS.PROVISIONAL
        ? isFa ? 'موقت / آزمایشی (PROVISIONAL)' : 'PROVISIONAL'
        : isFa ? 'داده ناکافی (DATA_NOT_READY)' : 'DATA_NOT_READY';

  const tabsNav = [
    { id: 'overview', label: isFa ? 'پیش‌بینی و سناریوها' : 'Projection & Scenarios' },
    { id: 'models', label: isFa ? 'مدل‌های پلاگینی' : 'Plugin Models' },
    { id: 'backtest', label: isFa ? 'اعتبارسنجی Walk-Forward' : 'Walk-Forward Gate' },
    { id: 'ledger', label: isFa ? 'دفتر کل SHA-256' : 'SHA-256 Ledger' },
  ]
    .map(
      (t) =>
        `<button type="button" class="ci-fc-subtab ${subTab === t.id ? 'active' : ''}" data-action="set-forecast-subtab" data-tab="${t.id}">${t.label}</button>`
    )
    .join('');

  let panelHtml = '';
  if (subTab === 'overview') {
    panelHtml = renderOverviewPanel(fc, activeTab, decimals, isFa, i18n);
  } else if (subTab === 'models') {
    panelHtml = renderModelsPanel(fc, decimals, isFa);
  } else if (subTab === 'backtest') {
    panelHtml = renderBacktestPanel(fc, decimals, isFa);
  } else {
    panelHtml = renderLedgerPanel(decimals, isFa);
  }

  return `
    <section class="ci-forecast-studio">
      <div class="ci-fc-header">
        <div class="ci-fc-title-row">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            ${renderSymbolBadge(activeCode, 30)}
            <select class="input-field ltr-num ci-fc-sym-select" data-action="select-prediction-symbol">
              ${symbolOptions}
            </select>
            <span class="ci-fc-status-badge ${statusBadgeClass} ltr-num">${statusLabel}</span>
            ${fc && fc.regime ? `<span class="ci-fc-regime-badge ltr-num">${escapeHtml(fc.regime)}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-sm ${activeTab?.showFutureProjection ? 'btn-primary' : ''}" data-action="apply-forecast-to-chart">
              ${activeTab?.showFutureProjection ? (isFa ? 'نمایش روی چارت: فعال ✓' : 'Applied to Chart ✓') : (isFa ? 'اعمال روی چارت و مشاهده' : 'Apply & View on Chart')}
            </button>
            <button type="button" class="btn btn-sm" data-action="record-forecast-snapshot">
              ${isFa ? 'ثبت در دفتر کل + همگام‌سازی' : 'Record & Sync Snapshot'}
            </button>
            <button type="button" class="btn btn-sm" data-action="set-workspace-view" data-view="chart">
              ${isFa ? 'بازگشت به چارت' : 'Back to Chart'}
            </button>
          </div>
        </div>

        <div class="ci-fc-controls-row">
          <div class="ci-fc-control-group">
            <span class="ci-fc-ctrl-label">${isFa ? 'تایم‌فریم:' : 'Timeframe:'}</span>
            <div class="chip-group">${tfButtons}</div>
          </div>
          <div class="ci-fc-control-group">
            <span class="ci-fc-ctrl-label">${isFa ? 'افق پیش‌بینی (کندل):' : 'Horizon (bars):'}</span>
            <div class="chip-group">${horizonButtons}</div>
          </div>
          <div class="ci-fc-control-group">
            <span class="ci-fc-ctrl-label">${isFa ? 'حالت نمایش:' : 'Render Mode:'}</span>
            <div class="chip-group">${modeButtons}</div>
          </div>
        </div>

        <div class="ci-fc-subtabs-bar">
          ${tabsNav}
        </div>
      </div>

      <div class="ci-fc-body">
        ${panelHtml}
      </div>
    </section>
  `;
}

function renderOverviewPanel(fc, activeTab, decimals, isFa) {
  if (!fc || fc.status === FORECAST_STATUS.DATA_NOT_READY) {
    const reasons = (fc?.readiness?.issues || []).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
    return `
      <div class="ci-fc-card" style="text-align:center;padding:32px;">
        <h3 style="margin:0 0 8px 0;color:var(--bear);">${isFa ? 'دروازه آماده بودن داده: کندل کافی موجود نیست' : 'Data Readiness Gate: DATA_NOT_READY'}</h3>
        <p style="margin:0 0 12px 0;color:var(--text-muted);font-size:13px;">
          ${isFa ? 'برای مدل‌سازی بازده لگاریتمی و ارزیابی Walk-Forward حداقل ۲۴ کندل معتبر لازم است.' : 'At least 24 valid OHLC bars are required for log-return modeling and walk-forward auditing.'}
        </p>
        <ul style="list-style:none;padding:0;margin:0;color:var(--text-muted);font-size:12px;" class="ltr-num">${reasons}</ul>
      </div>
    `;
  }

  const pts = fc.points || [];
  const stepMarks = [5, 10, 15, 20, 25, 30, 45, 60].filter((m) => m <= fc.horizonBars);
  const ladderCards = stepMarks
    .map((step) => {
      const p = pts[step - 1];
      if (!p) return '';
      const pct = Number(p.pctChangeFromLast || 0);
      const col = pct >= 0 ? 'var(--bull)' : 'var(--bear)';
      return `
        <div class="ci-fc-mini-stat ltr-num">
          <div style="font-size:10.5px;font-weight:700;color:var(--gold);">+${step}</div>
          <strong style="font-size:12.5px;">${PriceFormatter.formatPrice(p.q50, decimals)}</strong>
          <div style="font-size:10px;color:var(--text-muted);">[${PriceFormatter.formatPrice(p.q10, decimals)} .. ${PriceFormatter.formatPrice(p.q90, decimals)}]</div>
          <span style="font-size:10.5px;color:${col};font-weight:700;">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>
        </div>
      `;
    })
    .join('');

  const scenariosHtml = (fc.scenarios || [])
    .map((sc) => {
      const borderCol = sc.bias === 'bull' ? 'rgba(38,166,154,0.45)' : sc.bias === 'bear' ? 'rgba(239,83,80,0.45)' : 'rgba(245,158,11,0.45)';
      const accentCol = sc.bias === 'bull' ? 'var(--bull)' : sc.bias === 'bear' ? 'var(--bear)' : 'var(--gold)';
      const probPct = (Number(sc.probability || 0) * 100).toFixed(1);
      return `
        <div class="ci-fc-card" style="border-color:${borderCol};">
          <div class="row-between" style="margin-bottom:8px;">
            <strong style="color:${accentCol};font-size:13px;">${escapeHtml(sc.label)}</strong>
            <span class="ci-fc-prob-pill ltr-num">${probPct}%</span>
          </div>
          <div class="ltr-num" style="font-size:12px;display:flex;flex-direction:column;gap:5px;">
            <div class="row-between"><span style="color:var(--text-muted);">${isFa ? 'مرجع میانی (Target)' : 'Statistical Target'}</span><strong>${PriceFormatter.formatPrice(sc.targetPrice, decimals)}</strong></div>
            <div class="row-between"><span style="color:var(--text-muted);">${isFa ? 'مرز کوانتایل بیرونی' : 'Outer Quantile Bound'}</span><strong>${PriceFormatter.formatPrice(sc.extremePrice, decimals)}</strong></div>
            <div class="row-between"><span style="color:var(--text-muted);">${isFa ? 'مرجع تغییر ساختار' : 'Structure Pivot Ref'}</span><strong>${PriceFormatter.formatPrice(sc.invalidationReference, decimals)}</strong></div>
          </div>
          <button
            type="button"
            class="btn btn-sm"
            style="width:100%;margin-top:10px;"
            data-action="project-scenario-levels"
            data-bias="${escapeHtml(sc.bias)}"
            data-entry="${fc.anchorClose}"
            data-t1="${sc.targetPrice}"
            data-t2="${sc.extremePrice}"
            data-stop="${sc.invalidationReference}"
          >
            ${isFa ? 'رسم سطوح آماری روی چارت' : 'Plot Reference Bands on Chart'}
          </button>
        </div>
      `;
    })
    .join('');

  return `
    <div class="ci-fc-canvas-wrap ci-fc-card">
      <div class="row-between" style="margin-bottom:8px;flex-wrap:wrap;gap:8px;">
        <div>
          <strong style="font-size:13.5px;">${isFa ? 'نمای مخروط عدم‌قطعیت (q10 / q25 / q50 / q75 / q90) + کندل سایه‌ای' : 'Probabilistic Quantile Fan (q10..q90) & Ghost Trajectory'}</strong>
          <div style="font-size:11px;color:var(--text-muted);" class="ltr-num">
            ${escapeHtml(fc.contractVersion)} · Anchor ${PriceFormatter.formatPrice(fc.anchorClose, decimals)} · EWMA σ ${fc.featuresSummary.ewmaSigmaPct.toFixed(3)}% · RSI(14) ${fc.featuresSummary.rsi14.toFixed(1)} · Input ${fc.inputHash.slice(0, 10)}…
          </div>
        </div>
        <span style="font-size:11px;color:var(--text-muted);" class="ltr-num">
          ${isFa ? 'پهنای کریدور پایانی:' : 'Terminal Corridor:'} ${fc.summary.corridorWidthPct.toFixed(2)}%
        </span>
      </div>
      <canvas id="forecast-studio-canvas" class="ci-fc-preview-canvas"></canvas>
    </div>

    ${
      fc.walkForward && !fc.walkForward.acceptancePassed
        ? `<div class="ci-fc-warning-banner ltr-num">⚠ ${escapeHtml(fc.walkForward.acceptanceReason)}</div>`
        : ''
    }

    <div class="ci-fc-grid-3">${scenariosHtml}</div>

    <div class="ci-fc-card">
      <div style="font-size:12.5px;font-weight:700;margin-bottom:8px;">${isFa ? 'نردبان افق پیش‌بینی (میانه q50 و بازه ۸۰٪)' : 'Horizon Step Quantile Ladder (Median q50 & 80% Corridor)'}</div>
      <div class="ci-fc-ladder-grid">${ladderCards}</div>
    </div>
  `;
}

function renderModelsPanel(fc, decimals, isFa) {
  const plugins = defaultForecastRegistry.list();
  const contribMap = new Map((fc?.modelContributions || []).map((c) => [c.modelId, c]));
  const workerUrl = state.chartPreferences.forecastWorkerUrl || '';
  const workerInfo = fc?.remoteWorker || { status: 'LOCAL_STATISTICAL_ONLY', configured: Boolean(workerUrl) };

  const cards = plugins
    .map((p) => {
      const c = contribMap.get(p.id);
      const paramRows = Object.entries(p.params || {})
        .map(
          ([k, v]) => `
            <label class="ci-fc-param-item ltr-num">
              <span>${escapeHtml(k)}</span>
              <input type="number" step="0.01" class="input-field ci-fc-param-input" data-action="set-forecast-model-param" data-model-id="${escapeHtml(p.id)}" data-param-key="${escapeHtml(k)}" value="${Number(v)}" />
            </label>
          `
        )
        .join('');

      return `
        <div class="ci-fc-card ${p.enabled ? '' : 'is-disabled'}">
          <div class="row-between" style="margin-bottom:6px;gap:8px;">
            <div>
              <strong style="font-size:13px;">${escapeHtml(p.name)}</strong>
              <span class="ci-fc-family-tag ltr-num">${escapeHtml(p.family)}</span>
            </div>
            <label class="ci-fc-toggle ltr-num">
              <input type="checkbox" data-action="toggle-forecast-model" data-model-id="${escapeHtml(p.id)}" ${p.enabled ? 'checked' : ''} />
              <span>${p.enabled ? (isFa ? 'فعال' : 'Enabled') : (isFa ? 'خاموش' : 'Off')}</span>
            </label>
          </div>
          <p style="font-size:11.5px;color:var(--text-muted);margin:0 0 10px 0;">${escapeHtml(p.description)}</p>
          <div class="row-between ltr-num" style="font-size:11.5px;margin-bottom:6px;">
            <span>Weight: ${(p.weight * 100).toFixed(0)}%</span>
            ${
              c
                ? `<span style="color:${c.terminalPctChange >= 0 ? 'var(--bull)' : 'var(--bear)'};">→ ${PriceFormatter.formatPrice(c.terminalPrice, decimals)} (${c.terminalPctChange >= 0 ? '+' : ''}${c.terminalPctChange.toFixed(2)}%)</span>`
                : '<span style="color:var(--text-muted);">Inactive</span>'
            }
          </div>
          <input type="range" min="0" max="1" step="0.02" value="${p.weight}" data-action="set-forecast-model-weight" data-model-id="${escapeHtml(p.id)}" style="width:100%;margin-bottom:8px;" />
          <div class="ci-fc-params-grid">${paramRows}</div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="row-between" style="margin-bottom:10px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:12.5px;color:var(--text-muted);">
        ${isFa ? 'موتور پلاگینی مستقل بر پایه بازده لگاریتمی — قابل توسعه با مدل‌های جدید بدون تغییر در چارت یا UI.' : 'Modular log-return plugin architecture — tune weights/hyperparameters independently or reset defaults.'}
      </div>
      <button type="button" class="btn btn-sm" data-action="reset-forecast-models">${isFa ? 'بازگردانی وزن‌های پیش‌فرض' : 'Reset Default Weights'}</button>
    </div>

    <div class="ci-fc-grid-2">${cards}</div>

    <div class="ci-fc-card" style="margin-top:12px;">
      <div class="row-between" style="margin-bottom:6px;flex-wrap:wrap;gap:8px;">
        <strong style="font-size:13px;">${escapeHtml(REMOTE_DL_WORKER_SPEC.name)}</strong>
        <span class="ci-fc-family-tag ltr-num">${escapeHtml(workerInfo.status)}</span>
      </div>
      <p style="font-size:11.5px;color:var(--text-muted);margin:0 0 8px 0;">
        ${
          isFa
            ? 'پشتیبانی اختیاری از سرور استنتاج Python خارجی (Chronos-2 Apache 2.0 / TimesFM 2.5 / N-HiTS). در نبود سرویس خارجی، وضعیت صادقانه LOCAL_STATISTICAL_ONLY نمایش داده می‌شود و هیچ خروجی مصنوعی تولید نمی‌گردد.'
            : 'Optional external Python inference worker bridge (Chronos-2 Apache 2.0 / TimesFM 2.5 / N-HiTS). Never simulates DL weights when unconfigured.'
        }
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input type="url" class="input-field ltr-num" id="ci-forecast-worker-url" style="flex:1;min-width:220px;" placeholder="https://worker.example.com" value="${escapeHtml(workerUrl)}" />
        <button type="button" class="btn btn-sm btn-primary" data-action="save-forecast-worker-url">${isFa ? 'ذخیره آدرس Worker' : 'Save Worker URL'}</button>
      </div>
    </div>
  `;
}

function renderBacktestPanel(fc, decimals, isFa) {
  const wf = fc?.walkForward;
  if (!wf || wf.evaluatedWindows === 0 || !wf.ensembleMetrics) {
    return `
      <div class="ci-fc-card" style="padding:24px;text-align:center;">
        <strong>${isFa ? 'ارزیابی Walk-Forward نیاز به تاریخچه بیشتر دارد' : 'Walk-Forward Backtest Unavailable'}</strong>
        <p style="color:var(--text-muted);font-size:12.5px;">${escapeHtml(wf?.acceptanceReason || 'Load at least 40 historical candles to execute rolling purged out-of-sample tests.')}</p>
      </div>
    `;
  }

  const rows = [wf.ensembleMetrics, ...(wf.modelBenchmarks || [])]
    .map((m) => {
      const isEns = m.modelId === 'ensemble';
      return `
        <tr class="${isEns ? 'ci-fc-row-highlight' : ''}">
          <td><strong>${escapeHtml(m.modelName)}</strong></td>
          <td class="ltr-num">${escapeHtml(m.family)}</td>
          <td class="ltr-num">${m.mae.toFixed(decimals >= 3 ? 4 : 3)} (${m.maePct.toFixed(2)}%)</td>
          <td class="ltr-num">${m.rmse.toFixed(decimals >= 3 ? 4 : 3)}</td>
          <td class="ltr-num">${m.directionalAccuracyPct.toFixed(1)}%</td>
          <td class="ltr-num">${m.coverage80Pct.toFixed(1)}%</td>
          <td class="ltr-num">${m.pinballLoss.toFixed(4)}</td>
          <td class="ltr-num">${m.crps.toFixed(4)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="ci-fc-card" style="margin-bottom:12px;">
      <div class="row-between" style="flex-wrap:wrap;gap:8px;margin-bottom:8px;">
        <strong style="font-size:13.5px;">${isFa ? 'دروازه پذیرش Walk-Forward (بدون نشت داده آینده)' : 'Strict Purged Walk-Forward Acceptance Gate (Zero Leakage)'}</strong>
        <span class="ci-fc-status-badge ${wf.acceptancePassed ? 'ci-fc-badge-valid' : 'ci-fc-badge-provisional'} ltr-num">
          ${wf.acceptancePassed ? 'PASS' : 'PROVISIONAL'} · ${wf.evaluatedWindows} windows × +${wf.evalHorizon} bars
        </span>
      </div>
      <p style="font-size:12.5px;margin:0;color:var(--text-muted);" class="ltr-num">${escapeHtml(wf.acceptanceReason)}</p>
    </div>

    <div class="ci-fc-card" style="overflow-x:auto;">
      <table class="ci-fc-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Family</th>
            <th>MAE</th>
            <th>RMSE</th>
            <th>Dir Acc</th>
            <th>80% Cov</th>
            <th>Pinball</th>
            <th>CRPS</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderLedgerPanel(decimals, isFa) {
  const entries = defaultForecastLedger.loadEntries().slice().reverse();
  const audit = defaultForecastLedger.verifyChain();
  const serverEntries = Array.isArray(state.forecastServerLedger) ? state.forecastServerLedger : [];

  const rowsHtml =
    entries.length === 0
      ? `<div style="padding:18px;text-align:center;color:var(--text-muted);font-size:12.5px;">${isFa ? 'هنوز هیچ پیش‌بینی‌ای در دفتر کل محلی ثبت نشده است.' : 'No immutable forecast snapshots recorded yet.'}</div>`
      : entries
          .map(
            (e) => `
          <tr>
            <td class="ltr-num">#${e.seq}</td>
            <td class="ltr-num"><strong>${escapeHtml(e.symbolCode)}</strong> · ${escapeHtml(e.timeframe)} (+${e.horizonBars})</td>
            <td class="ltr-num">${escapeHtml(e.forecastStatus)}</td>
            <td class="ltr-num">${PriceFormatter.formatPrice(e.terminalMedian, decimals)}</td>
            <td class="ltr-num">[${PriceFormatter.formatPrice(e.terminalQ10, decimals)} .. ${PriceFormatter.formatPrice(e.terminalQ90, decimals)}]</td>
            <td class="ltr-num" title="${escapeHtml(e.prevForecastHash)} → ${escapeHtml(e.forecastHash)}">${escapeHtml(String(e.prevForecastHash).slice(0, 8))}… → <strong>${escapeHtml(String(e.forecastHash).slice(0, 12))}…</strong></td>
            <td class="ltr-num">${e.syncedToCloud ? '✓ Synced' : 'Local'}</td>
          </tr>
        `
          )
          .join('');

  return `
    <div class="ci-fc-card" style="margin-bottom:12px;">
      <div class="row-between" style="flex-wrap:wrap;gap:8px;">
        <div>
          <strong style="font-size:13px;">${isFa ? 'دفتر کل زنجیره هش SHA-256 (مقاوم در برابر دستکاری)' : 'Append-Only SHA-256 Hash-Chained Ledger'}</strong>
          <div style="font-size:11.5px;color:${audit.valid ? 'var(--bull)' : 'var(--bear)'};" class="ltr-num">${escapeHtml(audit.reason)}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-sm btn-primary" data-action="record-forecast-snapshot">${isFa ? 'ثبت اسنپ‌شات فعلی' : 'Record Current Snapshot'}</button>
          <button type="button" class="btn btn-sm" data-action="refresh-forecast-ledger">${isFa ? 'دریافت از سرور' : 'Refresh Server Ledger'}</button>
        </div>
      </div>
    </div>

    <div class="ci-fc-card" style="overflow-x:auto;">
      <table class="ci-fc-table">
        <thead>
          <tr>
            <th>Seq</th>
            <th>Symbol / Horizon</th>
            <th>Status</th>
            <th>q50 Target</th>
            <th>80% Interval</th>
            <th>Hash Chain</th>
            <th>Sync</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${
        serverEntries.length > 0
          ? `<div style="margin-top:10px;font-size:11.5px;color:var(--text-muted);" class="ltr-num">Server MariaDB verified ledger records: ${serverEntries.length}</div>`
          : ''
      }
    </div>
  `;
}
