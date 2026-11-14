import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.42.0';
import {
  RENDER_MODES,
  FORECAST_STATUS,
  NO_EDGE_GATE_STATE,
  OOD_STATUS,
  LIFECYCLE_STATUS,
  EVALUATION_OUTCOME,
  normalizeRenderMode,
  clampHorizonBars,
} from '../forecast/forecastContract.js?v=1.42.0';
import { defaultForecastRegistry, REMOTE_DL_WORKER_SPEC } from '../forecast/modelRegistry.js?v=1.42.0';
import { defaultForecastLedger } from '../forecast/forecastLedger.js?v=1.42.0';
import { ForecastEngine } from '../forecast/forecastEngine.js?v=1.42.0';
import { state, escapeHtml, getCachedOrAggregatedCandles } from '../core/store.js?v=1.42.0';
import { renderSymbolBadge } from './watchlistView.js?v=1.42.0';

export function resolveHigherTimeframe(tf = 'M15') {
  const norm = String(tf || 'M15').toUpperCase();
  if (norm === 'M15') return 'H1';
  if (norm === 'M30') return 'H4';
  if (norm === 'H1') return 'H4';
  if (norm === 'H4') return 'D1';
  if (norm === 'D1') return 'W1';
  return '';
}

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

  const higherTf = resolveHigherTimeframe(activeTab.timeframe);
  const higherCandles = higherTf
    ? getCachedOrAggregatedCandles(activeTab.symbolCode, activeTab.provider, higherTf)
    : [];

  if (!state._prevForecastByKey) state._prevForecastByKey = {};
  const cacheKey = `${activeTab.symbolCode}_${activeTab.timeframe}_${horizonBars}`;
  const lastStored = state._prevForecastByKey[cacheKey] || null;

  const result = ForecastEngine.project(candles, {
    symbolCode: activeTab.symbolCode,
    timeframe: activeTab.timeframe,
    horizonBars,
    renderMode,
    registry: defaultForecastRegistry,
    workerUrl,
    higherTimeframe: higherTf,
    higherTimeframeCandles: higherCandles,
    previousForecast:
      lastStored && lastStored.inputHash !== undefined
        ? lastStored
        : null,
  });

  if (result && result.status !== FORECAST_STATUS.DATA_NOT_READY) {
    if (!lastStored || lastStored.inputHash !== result.inputHash) {
      state._prevForecastByKey[cacheKey] = result;
    }
  }

  return {
    candles,
    result,
  };
}

export function renderForecastStudioFanCanvas(
  canvas,
  candles = [],
  forecast = null,
  decimals = 2,
  isDark = true,
  coordMode = 'independent'
) {
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
  const useCoord =
    coordMode === 'coordinated' &&
    forecast?.mtfCoordination &&
    Array.isArray(forecast.mtfCoordination.coordinatedPoints) &&
    forecast.mtfCoordination.coordinatedPoints.length > 0;
  const pts = useCoord
    ? forecast.mtfCoordination.coordinatedPoints
    : forecast && Array.isArray(forecast.points)
      ? forecast.points
      : [];

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

  // Key Price Zones horizontal shaded bands (v1.3.0)
  const zones = Array.isArray(forecast?.keyZones) ? forecast.keyZones : [];
  for (const z of zones) {
    const yTop = yOf(z.highPrice);
    const yBot = yOf(z.lowPrice);
    const isRes = z.zoneType === 'RESISTANCE_ZONE';
    ctx.fillStyle = isRes ? 'rgba(239, 83, 80, 0.08)' : 'rgba(38, 166, 154, 0.08)';
    ctx.fillRect(padL, Math.min(yTop, yBot), plotW, Math.max(2, Math.abs(yBot - yTop)));
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
      ctx.fillStyle = useCoord
        ? isDark
          ? 'rgba(168, 85, 247, 0.14)'
          : 'rgba(147, 51, 234, 0.12)'
        : isDark
          ? 'rgba(56, 189, 248, 0.13)'
          : 'rgba(41, 98, 255, 0.12)';
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
    ctx.strokeStyle = useCoord ? '#A855F7' : '#F59E0B';
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
    ctx.fillStyle = useCoord ? '#C084FC' : '#38BDF8';
    ctx.fillText(
      `q90 ${PriceFormatter.formatPrice(lastPt.q90, decimals)}`,
      Math.max(padL, xOf(totalSlots - 1) - 62),
      Math.max(padT + 10, yOf(lastPt.q90) - 4)
    );
    ctx.fillStyle = useCoord ? '#A855F7' : '#F59E0B';
    ctx.fillText(
      `q50 ${PriceFormatter.formatPrice(lastPt.q50, decimals)}`,
      Math.max(padL, xOf(totalSlots - 1) - 62),
      yOf(lastPt.q50) - 4
    );
    ctx.fillStyle = useCoord ? '#C084FC' : '#38BDF8';
    ctx.fillText(
      `q10 ${PriceFormatter.formatPrice(lastPt.q10, decimals)}`,
      Math.max(padL, xOf(totalSlots - 1) - 62),
      Math.min(padT + plotH - 4, yOf(lastPt.q10) + 12)
    );
  }
}

export function renderForecastStudioView(activeTab, i18n) {
  const isFa = i18n.getCurrentLanguage() === 'fa';
  const watchlist = state.symbols.filter((s) => s.inWatchlist);
  const activeCode = activeTab ? activeTab.symbolCode : watchlist[0]?.symbolCode || 'SPOTBRENT';
  const decimals = activeTab ? Number(activeTab.decimals || 2) : 2;
  const subTab = state.forecastStudioTab || 'overview';
  const coordView = state.forecastCoordView === 'coordinated' ? 'coordinated' : 'independent';
  const horizonBars = clampHorizonBars(
    (activeTab && activeTab.forecastHorizonBars) || state.chartPreferences.forecastHorizonBars || 30
  );
  const renderMode = normalizeRenderMode(
    (activeTab && activeTab.forecastRenderMode) || state.chartPreferences.forecastRenderMode || RENDER_MODES.HYBRID
  );

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
      ? isFa
        ? 'تأییدشده (VALID)'
        : 'VALID'
      : fc && fc.status === FORECAST_STATUS.PROVISIONAL
        ? isFa
          ? 'موقت / آزمایشی (PROVISIONAL)'
          : 'PROVISIONAL'
        : isFa
          ? 'داده ناکافی (DATA_NOT_READY)'
          : 'DATA_NOT_READY';

  const edgeGate = fc?.noEdgeGate;
  const edgeBadge = edgeGate
    ? `<span class="ci-fc-status-badge ${edgeGate.hasEdge ? 'ci-fc-badge-edge' : 'ci-fc-badge-no-edge'} ltr-num">${escapeHtml(edgeGate.gateState)}</span>`
    : '';

  const unc = fc?.uncertainty;
  const oodBadge = unc
    ? `<span class="ci-fc-status-badge ${
        unc.oodStatus === OOD_STATUS.EXTREME
          ? 'ci-fc-badge-ood-extreme'
          : unc.oodStatus === OOD_STATUS.ELEVATED
            ? 'ci-fc-badge-provisional'
            : 'ci-fc-badge-valid'
      } ltr-num">OOD: ${escapeHtml(unc.oodStatus)}</span>`
    : '';

  const tabsNav = [
    { id: 'overview', label: isFa ? 'پیش‌بینی و سناریوها (v1.3.0)' : 'Projection & Event Tree' },
    { id: 'models', label: isFa ? 'مدل‌های پلاگینی' : 'Plugin Models' },
    { id: 'backtest', label: isFa ? 'Walk-Forward و حساسیت' : 'Walk-Forward & Sensitivity' },
    { id: 'ledger', label: isFa ? 'دفتر کل SHA-256 و چرخه عمر' : 'SHA-256 Ledger & Lifecycle' },
  ]
    .map(
      (t) =>
        `<button type="button" class="ci-fc-subtab ${subTab === t.id ? 'active' : ''}" data-action="set-forecast-subtab" data-tab="${t.id}">${t.label}</button>`
    )
    .join('');

  let panelHtml = '';
  if (subTab === 'overview') {
    panelHtml = renderOverviewPanel(fc, activeTab, decimals, isFa, coordView);
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
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${renderSymbolBadge(activeCode, 30)}
            <select class="input-field ltr-num ci-fc-sym-select" data-action="select-prediction-symbol">
              ${symbolOptions}
            </select>
            <span class="ci-fc-status-badge ${statusBadgeClass} ltr-num">${statusLabel}</span>
            ${edgeBadge}
            ${oodBadge}
            ${fc && fc.regime ? `<span class="ci-fc-regime-badge ltr-num">${escapeHtml(fc.regime)}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button
              type="button"
              class="btn btn-sm ${activeTab?.showFutureProjection ? 'btn-primary' : ''}"
              data-action="apply-forecast-to-chart"
              title="${activeTab?.showFutureProjection ? (isFa ? 'برای حذف پیش‌بینی از روی چارت کلیک کنید' : 'Click to remove forecast overlay from chart') : (isFa ? 'برای نمایش پیش‌بینی روی چارت کلیک کنید' : 'Click to project forecast onto chart')}"
            >
              ${activeTab?.showFutureProjection ? (isFa ? '✓ نمایش روی چارت فعال (حذف)' : '✓ Applied to Chart (Hide)') : isFa ? 'اعمال روی چارت و مشاهده' : 'Apply & View on Chart'}
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
          <div class="ci-fc-control-group">
            <span class="ci-fc-ctrl-label">${isFa ? 'لایه MTF:' : 'MTF Layer:'}</span>
            <div class="chip-group">
              <button type="button" class="chip ${coordView === 'independent' ? 'active' : ''}" data-action="set-forecast-coord-mode" data-coord="independent">${isFa ? 'مستقل (Independent)' : 'Independent'}</button>
              <button type="button" class="chip ${coordView === 'coordinated' ? 'active' : ''}" data-action="set-forecast-coord-mode" data-coord="coordinated">${isFa ? 'هماهنگ (Coordinated)' : 'Coordinated'}</button>
            </div>
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

function renderOverviewPanel(fc, activeTab, decimals, isFa, coordView) {
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

  const mtf = fc.mtfCoordination;
  const activePts =
    coordView === 'coordinated' && mtf?.coordinatedPoints?.length
      ? mtf.coordinatedPoints
      : fc.points || [];
  const stepMarks = [5, 10, 15, 20, 25, 30, 45, 60].filter((m) => m <= fc.horizonBars);
  const ladderCards = stepMarks
    .map((step) => {
      const p = activePts[step - 1];
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

  const unc = fc.uncertainty;
  const uncertaintyCardHtml = unc
    ? `
      <div class="ci-fc-card" style="margin-bottom:12px;">
        <div class="row-between" style="flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          <strong style="font-size:13px;">${isFa ? 'تفکیک عدم‌قطعیت (Aleatoric در برابر Epistemic) و تشخیص OOD' : 'Uncertainty Decomposition (Aleatoric vs Epistemic) & OOD Gate'}</strong>
          <span class="ci-fc-family-tag ltr-num">OOD Distance ${unc.oodDistance} · Spread ×${unc.spreadMultiplierApplied}</span>
        </div>
        <div class="ci-fc-meter-track" title="Aleatoric ${(unc.aleatoricShare * 100).toFixed(1)}% vs Epistemic ${(unc.epistemicShare * 100).toFixed(1)}%">
          <div class="ci-fc-meter-aleatoric" style="width:${Math.round(unc.aleatoricShare * 100)}%;"></div>
          <div class="ci-fc-meter-epistemic" style="width:${Math.round(unc.epistemicShare * 100)}%;"></div>
        </div>
        <div class="row-between ltr-num" style="font-size:11.5px;margin-top:8px;flex-wrap:wrap;gap:8px;">
          <span>Aleatoric (Market σ): <strong>${unc.aleatoricPct.toFixed(2)}%</strong> (${(unc.aleatoricShare * 100).toFixed(1)}%)</span>
          <span>Epistemic (Model/Sparsity/OOD): <strong>${unc.epistemicPct.toFixed(2)}%</strong> (${(unc.epistemicShare * 100).toFixed(1)}%)</span>
          <span>Total Horizon σ: <strong>${unc.totalPct.toFixed(2)}%</strong></span>
        </div>
        ${
          unc.oodReasons?.length
            ? `<div style="margin-top:6px;font-size:11px;color:var(--gold);" class="ltr-num">${unc.oodReasons.map(escapeHtml).join(' · ')}</div>`
            : ''
        }
      </div>
    `
    : '';

  const mtfBannerHtml = mtf
    ? `
      <div class="ci-fc-card" style="margin-bottom:12px;">
        <div class="row-between" style="flex-wrap:wrap;gap:8px;">
          <div>
            <strong style="font-size:12.5px;">${isFa ? 'هماهنگ‌سازی چندتایم‌فریمی (Independent vs Coordinated)' : 'Multi-Timeframe Coordination Check'}</strong>
            <div style="font-size:11px;color:var(--text-muted);" class="ltr-num">
              Higher TF: ${escapeHtml(mtf.referenceTimeframe)} · OHLC Consistent: ${mtf.ohlcConsistent ? 'YES' : 'NO'} · Independent q50: ${mtf.independentMedianPct >= 0 ? '+' : ''}${mtf.independentMedianPct}% vs Coordinated q50: ${mtf.coordinatedMedianPct >= 0 ? '+' : ''}${mtf.coordinatedMedianPct}%
            </div>
          </div>
          <span class="ci-fc-status-badge ${mtf.alignmentState === 'ALIGNED' ? 'ci-fc-badge-valid' : mtf.alignmentState === 'STRUCTURAL_CONFLICT' ? 'ci-fc-badge-blocked' : 'ci-fc-badge-provisional'} ltr-num">
            ${escapeHtml(mtf.alignmentState)}
          </span>
        </div>
        ${
          mtf.conflictReasons?.length
            ? `<div style="margin-top:6px;font-size:11px;color:var(--text-muted);" class="ltr-num">${mtf.conflictReasons.map(escapeHtml).join(' · ')}</div>`
            : ''
        }
      </div>
    `
    : '';

  const edgeGate = fc.noEdgeGate;
  const edgeBannerHtml =
    edgeGate && !edgeGate.hasEdge
      ? `<div class="ci-fc-warning-banner ltr-num">⊘ NO_EDGE_DETECTED (${escapeHtml(edgeGate.gateState)}): ${edgeGate.reasons.map(escapeHtml).join(' | ')}</div>`
      : '';

  const scenariosHtml = (fc.scenarios || [])
    .map((sc) => {
      const borderCol =
        sc.bias === 'bull'
          ? 'rgba(38,166,154,0.45)'
          : sc.bias === 'bear'
            ? 'rgba(239,83,80,0.45)'
            : 'rgba(245,158,11,0.45)';
      const accentCol = sc.bias === 'bull' ? 'var(--bull)' : sc.bias === 'bear' ? 'var(--bear)' : 'var(--gold)';
      const probPct = (Number(sc.probability || 0) * 100).toFixed(1);
      return `
        <div class="ci-fc-card" style="border-color:${borderCol};">
          <div class="row-between" style="margin-bottom:6px;gap:6px;">
            <strong style="color:${accentCol};font-size:12.5px;">${escapeHtml(sc.label)}</strong>
            <span class="ci-fc-prob-pill ltr-num">${probPct}%</span>
          </div>
          <div style="margin-bottom:6px;display:flex;gap:6px;flex-wrap:wrap;" class="ltr-num">
            <span class="ci-fc-family-tag">${escapeHtml(sc.parentBranch || 'TREE')}</span>
            ${sc.lowSampleWarning ? `<span class="ci-fc-low-sample-tag">LOW_SAMPLE</span>` : ''}
          </div>
          <div class="ltr-num" style="font-size:11.5px;display:flex;flex-direction:column;gap:4px;">
            <div class="row-between"><span style="color:var(--text-muted);">${isFa ? 'مرجع میانی (Target)' : 'Statistical Target'}</span><strong>${PriceFormatter.formatPrice(sc.targetPrice, decimals)}</strong></div>
            <div class="row-between"><span style="color:var(--text-muted);">${isFa ? 'مرز کوانتایل بیرونی' : 'Outer Quantile Bound'}</span><strong>${PriceFormatter.formatPrice(sc.extremePrice, decimals)}</strong></div>
            <div class="row-between"><span style="color:var(--text-muted);">${isFa ? 'مرجع تغییر ساختار' : 'Structure Pivot Ref'}</span><strong>${PriceFormatter.formatPrice(sc.invalidationReference, decimals)}</strong></div>
          </div>
          <div class="ci-fc-condition-box ltr-num">
            <div><span style="color:var(--text-muted);">Trigger:</span> ${escapeHtml(sc.entryCondition || '-')}</div>
            <div><span style="color:var(--text-muted);">Event:</span> ${escapeHtml(sc.intermediateEvent || '-')}</div>
            <div><span style="color:var(--text-muted);">Invalidation:</span> ${escapeHtml(sc.invalidationCondition || '-')}</div>
          </div>
          <button
            type="button"
            class="btn btn-sm"
            style="width:100%;margin-top:8px;"
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

  const keyZonesHtml = (fc.keyZones || [])
    .map(
      (z) => `
      <div class="ci-fc-card">
        <div class="row-between" style="margin-bottom:6px;">
          <strong style="font-size:12.5px;color:${z.zoneType === 'RESISTANCE_ZONE' ? 'var(--bear)' : 'var(--bull)'};">${escapeHtml(z.zoneType)} (${escapeHtml(z.zoneId)})</strong>
          <span class="ci-fc-family-tag ltr-num">Strength ${(z.strength * 100).toFixed(0)}%</span>
        </div>
        <div class="ltr-num" style="font-size:11.5px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;">
          <div>Bounds: <strong>[${PriceFormatter.formatPrice(z.lowPrice, decimals)} .. ${PriceFormatter.formatPrice(z.highPrice, decimals)}]</strong></div>
          <div>Pivot Ref: <strong>${PriceFormatter.formatPrice(z.invalidationPrice, decimals)}</strong></div>
          <div>Touch Prob: <strong>${(z.touchProbability * 100).toFixed(1)}%</strong></div>
          <div>Penetration Prob: <strong>${(z.penetrationProbability * 100).toFixed(1)}%</strong></div>
          <div>Reclaim Prob: <strong>${(z.reclaimProbability * 100).toFixed(1)}%</strong></div>
          <div>Breakout Prob: <strong>${(z.confirmedBreakoutProbability * 100).toFixed(1)}%</strong></div>
          <div style="color:var(--bull);">Reach Before Inv: <strong>${(z.reachBeforeInvalidationProb * 100).toFixed(1)}%</strong></div>
          <div style="color:var(--bear);">Invalidation First: <strong>${(z.invalidationBeforeReachProb * 100).toFixed(1)}%</strong></div>
          <div style="grid-column:span 2;color:var(--text-muted);">Censoring-Aware Expected Bars: <strong>+${z.expectedBarsToReachCensored}</strong> (horizon ${z.horizonBars})</div>
        </div>
      </div>
    `
    )
    .join('');

  return `
    <div class="ci-fc-canvas-wrap ci-fc-card">
      <div class="row-between" style="margin-bottom:8px;flex-wrap:wrap;gap:8px;">
        <div>
          <strong style="font-size:13.5px;">${isFa ? 'نمای مخروط عدم‌قطعیت (q10..q90) + نواحی کلیدی + کندل سایه‌ای' : 'Probabilistic Quantile Fan (q10..q90), Key Zones & Ghost Trajectory'}</strong>
          <div style="font-size:11px;color:var(--text-muted);" class="ltr-num">
            ${escapeHtml(fc.contractVersion)} · spec v${escapeHtml(fc.specVersion || '1.3.0')} · Anchor ${PriceFormatter.formatPrice(fc.anchorClose, decimals)} · EWMA σ ${fc.featuresSummary.ewmaSigmaPct.toFixed(3)}% · Layer: ${coordView.toUpperCase()}
          </div>
        </div>
        <span style="font-size:11px;color:var(--text-muted);" class="ltr-num">
          ${isFa ? 'پهنای کریدور پایانی:' : 'Terminal Corridor:'} ${fc.summary.corridorWidthPct.toFixed(2)}%
        </span>
      </div>
      <canvas id="forecast-studio-canvas" class="ci-fc-preview-canvas"></canvas>
    </div>

    ${edgeBannerHtml}
    ${uncertaintyCardHtml}
    ${mtfBannerHtml}

    <div class="ci-fc-grid-3">${scenariosHtml}</div>

    ${keyZonesHtml ? `<div class="ci-fc-grid-2" style="margin-bottom:12px;">${keyZonesHtml}</div>` : ''}

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
              <span>${p.enabled ? (isFa ? 'فعال' : 'Enabled') : isFa ? 'خاموش' : 'Off'}</span>
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
          <td class="ltr-num">${Number(m.mae ?? 0).toFixed(decimals >= 3 ? 4 : 3)} (${Number(m.maePct ?? 0).toFixed(2)}%)</td>
          <td class="ltr-num">${Number(m.rmse ?? 0).toFixed(decimals >= 3 ? 4 : 3)}</td>
          <td class="ltr-num">${Number(m.directionalAccuracyPct ?? 0).toFixed(1)}%</td>
          <td class="ltr-num">${Number(m.coverage80Pct ?? 0).toFixed(1)}%</td>
          <td class="ltr-num">${Number(m.pinballLoss ?? 0).toFixed(4)}</td>
          <td class="ltr-num">${Number(m.crps ?? 0).toFixed(4)}</td>
        </tr>
      `;
    })
    .join('');

  const pv = wf.pathEventStats;
  const stab = fc.stability;
  const sensGrid = fc.eventDictionary?.sensitivityGrid || [];
  const sensRows = sensGrid
    .map(
      (s) => `
      <tr>
        <td class="ltr-num">${Number(s.penetrationAtrMult ?? 0).toFixed(2)}× ATR</td>
        <td class="ltr-num">${Number(s.reclaimWindowBars ?? 0)} bars</td>
        <td class="ltr-num">${Number(s.breakoutCloses ?? 0)} closes</td>
        <td class="ltr-num">${Number(s.touchFreqPct ?? 0).toFixed(1)}%</td>
        <td class="ltr-num">${Number(s.reclaimFreqPct ?? 0).toFixed(1)}%</td>
        <td class="ltr-num">${Number(s.breakoutFreqPct ?? 0).toFixed(1)}%</td>
        <td class="ltr-num">${Number(s.ambiguousRatePct ?? 0).toFixed(1)}%</td>
      </tr>
    `
    )
    .join('');

  return `
    <div class="ci-fc-card" style="margin-bottom:12px;">
      <div class="row-between" style="flex-wrap:wrap;gap:8px;margin-bottom:8px;">
        <strong style="font-size:13.5px;">${isFa ? 'دروازه پذیرش Walk-Forward (بدون نشت داده آینده)' : 'Strict Purged Walk-Forward Acceptance Gate (Zero Leakage)'}</strong>
        <span class="ci-fc-status-badge ${wf.acceptancePassed ? 'ci-fc-badge-valid' : 'ci-fc-badge-provisional'} ltr-num">
          ${wf.acceptancePassed ? 'PASS' : 'PROVISIONAL'} · ${wf.evaluatedWindows} windows × +${wf.evalHorizon} bars
        </span>
      </div>
      <p style="font-size:12px;margin:0 0 8px 0;color:var(--text-muted);" class="ltr-num">${escapeHtml(wf.acceptanceReason)}</p>
      <div class="ci-fc-ladder-grid ltr-num">
        <div class="ci-fc-mini-stat"><span>N_eff (Independent)</span><strong>${Number(wf.effectiveSampleSize || 0).toFixed(1)}</strong></div>
        <div class="ci-fc-mini-stat"><span>Skill vs Naive</span><strong>${(Number(wf.skillScoreVsNaive || 0) * 100).toFixed(2)}%</strong></div>
        <div class="ci-fc-mini-stat"><span>Ambiguous Inside-Bar</span><strong>${wf.ambiguousOutcomeCount || 0} (${Number(wf.ambiguousRatePct || 0).toFixed(1)}%)</strong></div>
        ${
          stab
            ? `<div class="ci-fc-mini-stat"><span>Stability Drift</span><strong>${Number(stab.medianDriftPct ?? 0).toFixed(2)}% (${stab.stable ? 'STABLE' : 'SHIFT'})</strong></div>`
            : ''
        }
      </div>
    </div>

    ${
      pv
        ? `
      <div class="ci-fc-card" style="margin-bottom:12px;">
        <strong style="font-size:13px;display:block;margin-bottom:8px;">${isFa ? 'بردار رویدادهای مسیر مستقل (بدون ادغام مصنوعی در یک عدد)' : 'Independent Path Event Vector (Empirical Telemetry)'}</strong>
        <div class="ci-fc-ladder-grid ltr-num">
          <div class="ci-fc-mini-stat"><span>Touch Rate</span><strong>${Number(pv.touchRatePct ?? pv.targetReachedRatePct ?? 0).toFixed(1)}%</strong></div>
          <div class="ci-fc-mini-stat"><span>Reclaim Rate</span><strong>${Number(pv.reclaimRatePct ?? 0).toFixed(1)}%</strong></div>
          <div class="ci-fc-mini-stat"><span>Confirmed Breakout</span><strong>${Number(pv.breakoutRatePct ?? pv.confirmedBreakoutRatePct ?? 0).toFixed(1)}%</strong></div>
          <div class="ci-fc-mini-stat"><span>Reach Before Inv</span><strong>${Number(pv.reachBeforeInvalidationPct ?? pv.targetReachedRatePct ?? 0).toFixed(1)}%</strong></div>
          <div class="ci-fc-mini-stat"><span>Ambiguous Rate</span><strong>${Number(pv.ambiguousRatePct ?? 0).toFixed(1)}%</strong></div>
          <div class="ci-fc-mini-stat"><span>Censoring Rate</span><strong>${Number(pv.censoringRatePct ?? 0).toFixed(1)}%</strong></div>
        </div>
      </div>
    `
        : ''
    }

    <div class="ci-fc-card" style="overflow-x:auto;margin-bottom:12px;">
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

    ${
      sensRows
        ? `
      <div class="ci-fc-card" style="overflow-x:auto;">
        <div style="font-size:12.5px;font-weight:700;margin-bottom:8px;">${isFa ? 'ماتریس حساسیت فرهنگ رویداد (ATR Penetration × Reclaim Window)' : 'Event Dictionary Sensitivity Grid (ATR Penetration × Reclaim Window)'}</div>
        <table class="ci-fc-table">
          <thead>
            <tr>
              <th>Penetration</th>
              <th>Reclaim Window</th>
              <th>Confirm Closes</th>
              <th>Touch %</th>
              <th>Reclaim %</th>
              <th>Breakout %</th>
              <th>Ambiguous %</th>
            </tr>
          </thead>
          <tbody>${sensRows}</tbody>
        </table>
      </div>
    `
        : ''
    }
  `;
}

function renderLedgerPanel(decimals, isFa) {
  const entries = defaultForecastLedger.loadEntries().slice().reverse();
  const audit = defaultForecastLedger.verifyChain();
  const lifecycleEvents = defaultForecastLedger.loadLifecycleEvents().slice().reverse();
  const lcAudit = defaultForecastLedger.verifyLifecycleChain();
  const serverEntries = Array.isArray(state.forecastServerLedger) ? state.forecastServerLedger : [];
  const serverLifecycle = Array.isArray(state.forecastServerLifecycle) ? state.forecastServerLifecycle : [];

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
            <td class="ltr-num">${escapeHtml(e.noEdgeGateState || 'PROVISIONAL')}</td>
            <td class="ltr-num">${PriceFormatter.formatPrice(e.terminalMedian, decimals)}</td>
            <td class="ltr-num">[${PriceFormatter.formatPrice(e.terminalQ10, decimals)} .. ${PriceFormatter.formatPrice(e.terminalQ90, decimals)}]</td>
            <td class="ltr-num" title="${escapeHtml(e.prevForecastHash)} → ${escapeHtml(e.forecastHash)}">${escapeHtml(String(e.prevForecastHash).slice(0, 8))}… → <strong>${escapeHtml(String(e.forecastHash).slice(0, 12))}…</strong></td>
            <td class="ltr-num">${e.syncedToCloud ? '✓ Synced' : 'Local'}</td>
          </tr>
        `
          )
          .join('');

  const lcRowsHtml =
    lifecycleEvents.length === 0
      ? `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">${isFa ? 'هنوز رویداد چرخه عمر ثبت نشده است.' : 'No append-only lifecycle events yet.'}</td></tr>`
      : lifecycleEvents
          .map((ev) => {
            const outCol =
              ev.evaluationOutcome === EVALUATION_OUTCOME.SUCCESS
                ? 'var(--bull)'
                : ev.evaluationOutcome === EVALUATION_OUTCOME.FAILED
                  ? 'var(--bear)'
                  : ev.evaluationOutcome === EVALUATION_OUTCOME.AMBIGUOUS
                    ? 'var(--gold)'
                    : 'var(--text-muted)';
            return `
              <tr>
                <td class="ltr-num">#${ev.seq}</td>
                <td class="ltr-num">${escapeHtml(ev.symbolCode)} ${escapeHtml(ev.timeframe)} (+${ev.horizonStep})</td>
                <td class="ltr-num"><strong>${escapeHtml(ev.lifecycleStatus)}</strong></td>
                <td class="ltr-num" style="color:${outCol};font-weight:700;">${escapeHtml(ev.evaluationOutcome)}</td>
                <td class="ltr-num">${ev.observedClose != null ? PriceFormatter.formatPrice(ev.observedClose, decimals) : '—'}</td>
                <td class="ltr-num">${escapeHtml(String(ev.eventHash || '').slice(0, 12))}…</td>
                <td style="font-size:11px;color:var(--text-muted);">${escapeHtml(ev.reason || '')}</td>
              </tr>
            `;
          })
          .join('');

  return `
    <div class="ci-fc-card" style="margin-bottom:12px;">
      <div class="row-between" style="flex-wrap:wrap;gap:8px;">
        <div>
          <strong style="font-size:13px;">${isFa ? 'دفتر کل زنجیره هش SHA-256 (مقاوم در برابر دستکاری)' : 'Append-Only SHA-256 Hash-Chained Ledger & Lifecycle Log'}</strong>
          <div style="font-size:11.5px;color:${audit.valid ? 'var(--bull)' : 'var(--bear)'};" class="ltr-num">Runs: ${escapeHtml(audit.reason)} · Lifecycle: ${escapeHtml(lcAudit.reason)}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-sm btn-primary" data-action="record-forecast-snapshot">${isFa ? 'ثبت اسنپ‌شات فعلی' : 'Record Current Snapshot'}</button>
          <button type="button" class="btn btn-sm" data-action="evaluate-forecast-outcomes">${isFa ? 'ارزیابی سررسید و Ambiguous' : 'Evaluate Matured Outcomes'}</button>
          <button type="button" class="btn btn-sm" data-action="refresh-forecast-ledger">${isFa ? 'دریافت از سرور' : 'Refresh Server Ledger'}</button>
        </div>
      </div>
    </div>

    <div class="ci-fc-card" style="overflow-x:auto;margin-bottom:12px;">
      <table class="ci-fc-table">
        <thead>
          <tr>
            <th>Seq</th>
            <th>Symbol / Horizon</th>
            <th>Status</th>
            <th>Edge Gate</th>
            <th>q50 Target</th>
            <th>80% Interval</th>
            <th>Hash Chain</th>
            <th>Sync</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${
        serverEntries.length > 0 || serverLifecycle.length > 0
          ? `<div style="margin-top:10px;font-size:11.5px;color:var(--text-muted);" class="ltr-num">Server MariaDB runs: ${serverEntries.length} · Server lifecycle events: ${serverLifecycle.length}</div>`
          : ''
      }
    </div>

    <div class="ci-fc-card" style="overflow-x:auto;">
      <div style="font-size:12.5px;font-weight:700;margin-bottom:8px;">${isFa ? 'گزارش فقط‌افزودنی چرخه عمر و نتایج سررسید (ACTIVE / MATURED / AMBIGUOUS)' : 'Append-Only Lifecycle & Per-Horizon Outcome Log (Never Mutates Runs)'}</div>
      <table class="ci-fc-table">
        <thead>
          <tr>
            <th>Seq</th>
            <th>Symbol / Step</th>
            <th>Lifecycle</th>
            <th>Outcome</th>
            <th>Observed Close</th>
            <th>Event Hash</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>${lcRowsHtml}</tbody>
      </table>
    </div>
  `;
}
