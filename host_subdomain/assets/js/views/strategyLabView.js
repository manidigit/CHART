import {
  state,
  escapeHtml,
  getCachedOrAggregatedCandles,
} from '../core/store.js?v=1.47.41';
import {
  StrategySimulator,
  STRATEGY_PRESETS,
  DEFAULT_STRATEGY_CONFIG,
  CLASSICAL_STRATEGY_REGISTRY,
  MINIMUM_REQUIRED_RR,
  enforceMinimumRequiredRR,
  SignalBacktester,
  evaluateForecastStrategyBridge,
} from '../algorithms/strategySimulator.js?v=1.47.41';

// Lightweight runtime lookup for one-click "Show on Chart" without serializing large objects into HTML attributes
const _latestRenderedSignalsById = new Map();

export function getCachedStrategySignalById(signalId) {
  return _latestRenderedSignalsById.get(String(signalId || '')) || null;
}

function buildEquityCurveSvg(equityCurve = [], initialEquity = 1000) {
  if (!Array.isArray(equityCurve) || equityCurve.length < 2) {
    return '';
  }
  const width = 560;
  const height = 148;
  const padX = 12;
  const padY = 14;

  let minEq = initialEquity;
  let maxEq = initialEquity;
  for (const pt of equityCurve) {
    if (pt.equity < minEq) minEq = pt.equity;
    if (pt.equity > maxEq) maxEq = pt.equity;
  }
  const span = Math.max(1e-6, maxEq - minEq);
  const toX = (idx) => padX + (idx / Math.max(1, equityCurve.length - 1)) * (width - padX * 2);
  const toY = (val) => height - padY - ((val - minEq) / span) * (height - padY * 2);

  const step = Math.max(1, Math.floor(equityCurve.length / 180));
  const points = [];
  for (let i = 0; i < equityCurve.length; i += step) {
    points.push(`${toX(i).toFixed(1)},${toY(equityCurve[i].equity).toFixed(1)}`);
  }
  const lastIdx = equityCurve.length - 1;
  if (lastIdx % step !== 0) {
    points.push(`${toX(lastIdx).toFixed(1)},${toY(equityCurve[lastIdx].equity).toFixed(1)}`);
  }

  const baseY = toY(initialEquity).toFixed(1);
  const finalEq = equityCurve[lastIdx].equity;
  const lineColor = finalEq >= initialEquity ? 'var(--bull)' : 'var(--bear)';
  const areaPoints = `${toX(0).toFixed(1)},${height - padY} ${points.join(' ')} ${toX(lastIdx).toFixed(1)},${height - padY}`;

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="display:block; background: var(--surface-elevated); border: 1px solid var(--border); border-radius: 8px;" aria-label="Equity Curve">
      <line x1="${padX}" y1="${baseY}" x2="${width - padX}" y2="${baseY}" stroke="var(--text-dim)" stroke-dasharray="4 4" stroke-width="1" opacity="0.6" />
      <polygon points="${areaPoints}" fill="${lineColor}" opacity="0.14" />
      <polyline points="${points.join(' ')}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <text x="${padX + 2}" y="${Math.max(12, Number(baseY) - 4)}" fill="var(--text-muted)" font-size="10" font-family="monospace">€${initialEquity.toFixed(0)}</text>
      <text x="${width - padX}" y="12" text-anchor="end" fill="var(--text-muted)" font-size="10" font-family="monospace">Max €${maxEq.toFixed(1)} · Min €${minEq.toFixed(1)}</text>
    </svg>
  `;
}

function formatUtcShort(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return new Date(ms).toISOString().slice(5, 16).replace('T', ' ');
}

function formatNum(v, decimals = 2) {
  return Number.isFinite(Number(v)) ? Number(v).toFixed(decimals) : '—';
}

function renderStrategySpecificParams(strategyId, params, isFa) {
  if (strategyId === 'trend_pullback_v1') {
    return `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap:8px; margin-top:8px; padding-top:8px; border-top:1px dashed var(--border);">
        <div>
          <label class="tv-input-label">${isFa ? 'بازه پولبک (کندل)' : 'Pullback Lookback (bars)'}</label>
          <input type="number" min="3" max="15" step="1" class="input-field ltr-num" value="${Number(params.pullbackLookback ?? 6)}" data-action="strategy-sim-set-param" data-strategy="${strategyId}" data-param="pullbackLookback" />
        </div>
        <div>
          <label class="tv-input-label">${isFa ? 'بافر ATR حد ضرر' : 'SL ATR Buffer ×'}</label>
          <input type="number" min="0.2" max="1.5" step="0.1" class="input-field ltr-num" value="${Number(params.atrStopBuffer ?? 0.5)}" data-action="strategy-sim-set-param" data-strategy="${strategyId}" data-param="atrStopBuffer" />
        </div>
        <label style="display:flex; align-items:center; gap:6px; font-size:11.5px; cursor:pointer; padding-top:16px;">
          <input type="checkbox" ${params.requirePriorBarBreak !== false ? 'checked' : ''} data-action="strategy-sim-toggle-param" data-strategy="${strategyId}" data-param="requirePriorBarBreak" />
          <span>${isFa ? 'الزام شکست کندل قبلی' : 'Require Prior-Bar Break'}</span>
        </label>
      </div>
    `;
  }

  if (strategyId === 'rsi_reversion_v1') {
    const variant = String(params.variant || 'RSI14').toUpperCase();
    const thr = Number(params.rsiThreshold ?? 30);
    return `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap:8px; margin-top:8px; padding-top:8px; border-top:1px dashed var(--border);">
        <div>
          <label class="tv-input-label">${isFa ? 'واریانت RSI' : 'RSI Variant'}</label>
          <select class="input-field" data-action="strategy-sim-set-param" data-strategy="${strategyId}" data-param="variant" data-type="string">
            <option value="RSI14" ${variant === 'RSI14' ? 'selected' : ''}>RSI(14) Mean Reversion</option>
            <option value="CONNORS_RSI2" ${variant === 'CONNORS_RSI2' ? 'selected' : ''}>Connors RSI(2) + SMA(5) Exit</option>
          </select>
        </div>
        ${
          variant === 'RSI14'
            ? `
            <div>
              <label class="tv-input-label">${isFa ? 'آستانه اشباع RSI(14)' : 'RSI(14) Threshold'}</label>
              <select class="input-field ltr-num" data-action="strategy-sim-set-param" data-strategy="${strategyId}" data-param="rsiThreshold">
                <option value="30" ${thr === 30 ? 'selected' : ''}>30 (Strict)</option>
                <option value="35" ${thr === 35 ? 'selected' : ''}>35 (Balanced)</option>
                <option value="40" ${thr === 40 ? 'selected' : ''}>40 (Active)</option>
              </select>
            </div>`
            : `
            <div>
              <label class="tv-input-label">${isFa ? 'آستانه Connors RSI(2)' : 'Connors RSI(2) <'}</label>
              <input type="number" min="5" max="20" step="1" class="input-field ltr-num" value="${Number(params.connorsRsi2Threshold ?? 10)}" data-action="strategy-sim-set-param" data-strategy="${strategyId}" data-param="connorsRsi2Threshold" />
            </div>`
        }
        <div>
          <label class="tv-input-label">${isFa ? 'بافر ATR حد ضرر' : 'SL ATR Buffer ×'}</label>
          <input type="number" min="0.2" max="1.5" step="0.1" class="input-field ltr-num" value="${Number(params.atrStopBuffer ?? 0.6)}" data-action="strategy-sim-set-param" data-strategy="${strategyId}" data-param="atrStopBuffer" />
        </div>
      </div>
      ${
        variant === 'CONNORS_RSI2'
          ? `<div style="margin-top:6px; font-size:11px; color:var(--primary);">${
              isFa
                ? 'قاعده خروج مجزا فعال است: خروج روی Close > SMA(5) برای خرید (و Close < SMA(5) برای فروش) با حفظ Hard Gate نسبت Net R:R ≥ 2.0.'
                : 'Dedicated exit rule active: exits on Close > SMA(5) for Long (or Close < SMA(5) for Short), while still requiring structural Net R:R ≥ 2.0.'
            }</div>`
          : ''
      }
    `;
  }

  if (strategyId === 'breakout_v1') {
    return `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap:8px; margin-top:8px; padding-top:8px; border-top:1px dashed var(--border);">
        <div>
          <label class="tv-input-label">${isFa ? 'دوره کانال شکست (N)' : 'Channel Period (N bars)'}</label>
          <input type="number" min="10" max="55" step="1" class="input-field ltr-num" value="${Number(params.breakoutPeriod ?? 20)}" data-action="strategy-sim-set-param" data-strategy="${strategyId}" data-param="breakoutPeriod" />
        </div>
        <label style="display:flex; align-items:center; gap:6px; font-size:11.5px; cursor:pointer; padding-top:16px;">
          <input type="checkbox" ${params.useVolumeFilter ? 'checked' : ''} data-action="strategy-sim-toggle-param" data-strategy="${strategyId}" data-param="useVolumeFilter" />
          <span>${isFa ? 'فیلتر حجم (Volume Surge)' : 'Volume Surge Filter'}</span>
        </label>
        <label style="display:flex; align-items:center; gap:6px; font-size:11.5px; cursor:pointer; padding-top:16px;">
          <input type="checkbox" ${params.useAtrTrendFilter !== false ? 'checked' : ''} data-action="strategy-sim-toggle-param" data-strategy="${strategyId}" data-param="useAtrTrendFilter" />
          <span>${isFa ? 'فیلتر ATR و روند' : 'ATR & Trend Filter'}</span>
        </label>
      </div>
    `;
  }

  if (strategyId === 'sma_crossover_v1') {
    const pair = String(params.smaPair || '20_50');
    return `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap:8px; margin-top:8px; padding-top:8px; border-top:1px dashed var(--border);">
        <div>
          <label class="tv-input-label">${isFa ? 'جفت میانگین متحرک' : 'SMA Pair'}</label>
          <select class="input-field ltr-num" data-action="strategy-sim-set-param" data-strategy="${strategyId}" data-param="smaPair" data-type="string">
            <option value="20_50" ${pair === '20_50' ? 'selected' : ''}>SMA 20 / 50</option>
            <option value="50_200" ${pair === '50_200' ? 'selected' : ''}>SMA 50 / 200 (Golden/Death)</option>
          </select>
        </div>
        <label style="display:flex; align-items:center; gap:6px; font-size:11.5px; cursor:pointer; padding-top:16px;">
          <input type="checkbox" ${params.requireCloseAlignment !== false ? 'checked' : ''} data-action="strategy-sim-toggle-param" data-strategy="${strategyId}" data-param="requireCloseAlignment" />
          <span>${isFa ? 'تأیید موقعیت Close' : 'Require Close Alignment'}</span>
        </label>
        <label style="display:flex; align-items:center; gap:6px; font-size:11.5px; cursor:pointer; padding-top:16px;">
          <input type="checkbox" ${params.useTrendStrengthFilter !== false ? 'checked' : ''} data-action="strategy-sim-toggle-param" data-strategy="${strategyId}" data-param="useTrendStrengthFilter" />
          <span>${isFa ? 'فیلتر قدرت روند' : 'Trend Strength Filter'}</span>
        </label>
      </div>
    `;
  }

  // rsi_dip_v1 (Research Comparison Baseline)
  return `
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap:8px; margin-top:8px; padding-top:8px; border-top:1px dashed var(--border);">
      <div>
        <label class="tv-input-label">${isFa ? 'آستانه افت RSI' : 'RSI Dip Threshold'}</label>
        <input type="number" min="20" max="45" step="5" class="input-field ltr-num" value="${Number(params.rsiThreshold ?? 35)}" data-action="strategy-sim-set-param" data-strategy="${strategyId}" data-param="rsiThreshold" />
      </div>
      <div style="grid-column: span 2; font-size:11px; color:var(--text-muted); padding-top:14px;">
        ${
          isFa
            ? 'هشدار پژوهشی: این نسخه عمداً ضعیف‌تر و صرفاً جهت مقایسه صادقانه در کنار استراتژی‌های اصلی است.'
            : 'Research Benchmark Only: Intentionally weaker baseline included transparently for honest side-by-side comparison.'
        }
      </div>
    </div>
  `;
}

function renderLiveDecisionBanner(signalReport, activeTab, isFa) {
  const latest = signalReport?.latestDecision;
  const activeOverlayId = activeTab?.showStrategySignal ? activeTab?.activeStrategySignal?.signal_id : null;

  if (!latest) return '';

  if (latest.status === 'VALID' && latest.signal) {
    const sig = latest.signal;
    const isLong = sig.side === 'long';
    const isPlotted = activeOverlayId === sig.signal_id;
    const tp1 = sig.take_profit_suggested?.[0];
    const tp2 = sig.take_profit_suggested?.[1];
    return `
      <div class="ci-strat-banner ci-strat-banner-valid">
        <div class="row-between" style="gap:8px;">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="ci-strat-badge ci-strat-badge-valid">${isLong ? '▲ VALID LONG' : '▼ VALID SHORT'}</span>
            <span class="ci-strat-badge ci-strat-badge-gate ltr-num">Net R:R 1:${formatNum(sig.risk_reward?.net_rr)} · Gross 1:${formatNum(sig.risk_reward?.gross_rr)}</span>
            <span class="ci-strat-badge ci-strat-badge-research ltr-num">${escapeHtml(sig.risk_reward?.tier || 'VALID')} · ${formatUtcShort(sig.signal_time_utc_ms)} UTC</span>
          </div>
          <button type="button" class="btn btn-sm ${isPlotted ? '' : 'btn-primary'}" data-action="${isPlotted ? 'strategy-sim-clear-chart-signal' : 'strategy-sim-plot-signal'}" data-signal-id="${escapeHtml(sig.signal_id)}">
            ${isPlotted ? (isFa ? '✕ حذف از چارت' : '✕ Hide from Chart') : (isFa ? 'نمایش روی چارت' : 'Show on Chart')}
          </button>
        </div>
        <div class="ltr-num" style="display:flex; gap:14px; flex-wrap:wrap; font-size:11.5px;">
          <span><strong>Entry:</strong> ${sig.entry_price_suggested}</span>
          <span style="color:var(--bear);"><strong>SL:</strong> ${sig.stop_loss_suggested}</span>
          <span style="color:var(--bull);"><strong>TP1:</strong> ${tp1 ?? '—'}</span>
          ${tp2 != null ? `<span style="color:#06b6d4;"><strong>TP2:</strong> ${tp2}</span>` : ''}
          <span style="color:var(--text-muted);"><strong>Strength:</strong> ${(Number(sig.strength || 0) * 100).toFixed(0)}%</span>
        </div>
        <div style="font-size:11.5px; color:var(--text);">${escapeHtml(sig.reason)}</div>
      </div>
    `;
  }

  const lastValid = latest.lastValidSignal || (signalReport.validSignals?.length ? signalReport.validSignals[signalReport.validSignals.length - 1] : null);
  const isLastValidPlotted = Boolean(lastValid && activeOverlayId === lastValid.signal_id);

  return `
    <div class="ci-strat-banner ci-strat-banner-notrade">
      <div class="row-between" style="gap:8px;">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span class="ci-strat-badge ci-strat-badge-notrade">NO TRADE</span>
          <span class="ci-strat-badge ci-strat-badge-gate ltr-num">Hard Gate ≥ 1:${formatNum(latest.minimum_required_rr ?? MINIMUM_REQUIRED_RR)}</span>
          <span class="ltr-num" style="font-size:10.5px; color:var(--text-muted);">${escapeHtml(latest.rejection_code || 'NO_SETUP')}</span>
        </div>
        ${
          lastValid
            ? `<button type="button" class="btn btn-sm" data-action="${isLastValidPlotted ? 'strategy-sim-clear-chart-signal' : 'strategy-sim-plot-signal'}" data-signal-id="${escapeHtml(lastValid.signal_id)}">
                ${isLastValidPlotted ? (isFa ? '✕ حذف آخرین سیگنال از چارت' : '✕ Hide Last Signal') : (isFa ? `نمایش آخرین سیگنال معتبر (1:${formatNum(lastValid.risk_reward?.net_rr)})` : `Plot Last Valid Signal (1:${formatNum(lastValid.risk_reward?.net_rr)})`)}
              </button>`
            : ''
        }
      </div>
      <div style="font-size:11.5px; color:var(--text);">${escapeHtml(latest.reason || 'NO TRADE: No setup passed Risk/Reward Hard Gate.')}</div>
    </div>
  `;
}

function renderCompareTab(compareRes, enabledMap, activeStrategyId, isFa) {
  const togglesHtml = CLASSICAL_STRATEGY_REGISTRY.map((s) => {
    const checked = enabledMap[s.id] !== false;
    return `
      <label style="display:inline-flex; align-items:center; gap:6px; font-size:11.5px; padding:4px 8px; border-radius:6px; border:1px solid var(--border); background:var(--surface-elevated); cursor:pointer;">
        <input type="checkbox" ${checked ? 'checked' : ''} data-action="strategy-sim-toggle-enabled" data-strategy="${escapeHtml(s.id)}" />
        <span>${escapeHtml(isFa ? s.nameFa : s.nameEn)}</span>
        ${s.isResearchBenchmarkOnly ? `<span class="ci-strat-badge ci-strat-badge-research">${isFa ? 'مبنای مقایسه' : 'Research'}</span>` : ''}
      </label>
    `;
  }).join('');

  const rowsHtml = compareRes.rows
    .map((r) => {
      const m = r.metrics;
      const isSelected = r.strategyId === activeStrategyId;
      const netCol = m.netReturnPct >= 0 ? 'var(--bull)' : 'var(--bear)';
      const latestTag =
        r.latestDecision?.status === 'VALID'
          ? `<span class="ci-strat-badge ci-strat-badge-valid">${String(r.latestDecision.signal?.side || '').toUpperCase()}</span>`
          : `<span class="ci-strat-badge ci-strat-badge-notrade">NO TRADE</span>`;
      return `
        <tr style="${isSelected ? 'background: rgba(41,98,255,0.08);' : ''}">
          <td>
            <div style="font-weight:700; color:var(--text-strong);">${escapeHtml(isFa ? r.nameFa : r.nameEn)}</div>
            <div style="display:flex; gap:5px; margin-top:2px; align-items:center;">
              <span class="ltr-num" style="font-size:9.5px; color:var(--text-muted);">${escapeHtml(r.strategyId)}</span>
              ${r.isResearchBenchmarkOnly ? `<span class="ci-strat-badge ci-strat-badge-research">${isFa ? 'مبنای پژوهشی' : 'Baseline'}</span>` : ''}
            </div>
          </td>
          <td>${latestTag}</td>
          <td class="ltr-num" style="font-weight:700; color:${netCol};">${m.netReturnPct >= 0 ? '+' : ''}${formatNum(m.netReturnPct)}%</td>
          <td class="ltr-num">${m.grossReturnPct >= 0 ? '+' : ''}${formatNum(m.grossReturnPct)}%</td>
          <td class="ltr-num">${formatNum(m.winRatePct, 1)}% (${m.totalTrades})</td>
          <td class="ltr-num">${formatNum(m.profitFactor)}</td>
          <td class="ltr-num" style="color:var(--bear);">-${formatNum(m.maxDrawdownPct)}%</td>
          <td class="ltr-num">${formatNum(m.sharpeRatio)}</td>
          <td class="ltr-num">${r.validSignalsCount} / <span style="color:#f59e0b;">${r.rejectedByRrCount} RR✕</span></td>
          <td class="ltr-num">${r.metrics.avgAcceptedNetRR > 0 ? `1:${formatNum(r.metrics.avgAcceptedNetRR)}` : '—'}</td>
          <td>
            <button type="button" class="btn btn-sm" data-action="strategy-sim-set-field" data-field="strategyId" data-value="${escapeHtml(r.strategyId)}" data-open-tab="overview">
              ${isFa ? 'انتخاب' : 'Inspect'}
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="card-subtle" style="margin-bottom:12px;">
      <div style="font-size:12px; font-weight:700; color:var(--text-strong); margin-bottom:8px;">
        ${isFa ? 'فعال / غیرفعال‌سازی استراتژی‌ها برای مقایسه هم‌زمان' : 'Enable / Disable Strategies for Side-by-Side Comparison'}
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">${togglesHtml}</div>
    </div>

    <div class="card-subtle">
      <div class="row-between" style="margin-bottom:8px;">
        <strong style="font-size:12px; color:var(--text-strong);">${isFa ? 'مقایسه شفاف تمام استراتژی‌های فعال (با اعمال Hard Gate نسبت Net R:R ≥ 2.0)' : 'Transparent Multi-Strategy Comparison (Hard Gate Net R:R ≥ 2.0 Enforced)'}</strong>
        <span style="font-size:10.5px; color:var(--text-muted);">${isFa ? 'استراتژی‌های ضعیف و زیان‌ده بدون پنهان‌کاری نمایش داده می‌شوند' : 'Weak/losing strategies are reported honestly without hiding'}</span>
      </div>
      ${
        compareRes.rows.length === 0
          ? `<div style="padding:14px; text-align:center; font-size:12px; color:var(--text-muted);">${isFa ? 'حداقل یک استراتژی را فعال کنید.' : 'Enable at least one strategy above.'}</div>`
          : `<div style="overflow-x:auto;">
              <table class="ci-strat-table">
                <thead>
                  <tr>
                    <th>${isFa ? 'استراتژی' : 'Strategy'}</th>
                    <th>${isFa ? 'آخرین کندل' : 'Latest'}</th>
                    <th>Net %</th>
                    <th>Gross %</th>
                    <th>Win% (N)</th>
                    <th>PF</th>
                    <th>Max DD</th>
                    <th>Sharpe</th>
                    <th>Valid / RR✕</th>
                    <th>Avg Net RR</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </div>`
      }
    </div>
  `;
}

function renderValidSignalsTab(validSignals, activeTab, isFa) {
  const activeOverlayId = activeTab?.showStrategySignal ? activeTab?.activeStrategySignal?.signal_id : null;
  if (!validSignals || validSignals.length === 0) {
    return `
      <div class="card-subtle" style="padding:18px; text-align:center; font-size:12px; color:var(--text-muted);">
        ${
          isFa
            ? 'هیچ سیگنالی در این تاریخچه از فیلتر سخت‌گیرانه Net R:R ≥ 2.0 عبور نکرد (وضعیت صادقانه: NO TRADE).'
            : 'No signals in this history passed the mandatory Net R:R ≥ 2.0 Hard Gate (Honest status: NO TRADE).'
        }
      </div>
    `;
  }

  const list = [...validSignals].reverse().slice(0, 50);
  return `
    <div class="card-subtle">
      <div class="row-between" style="margin-bottom:8px;">
        <strong style="font-size:12px; color:var(--text-strong);">${isFa ? `سیگنال‌های معتبر تاییدشده (فقط Net R:R ≥ 2.0) — ${validSignals.length} مورد` : `Validated Signals (Strictly Net R:R ≥ 2.0) — ${validSignals.length} total`}</strong>
        ${
          activeOverlayId
            ? `<button type="button" class="btn btn-sm" data-action="strategy-sim-clear-chart-signal">✕ ${isFa ? 'حذف لایه سیگنال از چارت' : 'Clear Chart Overlay'}</button>`
            : ''
        }
      </div>
      <div style="overflow-x:auto; max-height:380px; overflow-y:auto;">
        <table class="ci-strat-table ltr-num">
          <thead>
            <tr>
              <th>Time (UTC)</th>
              <th>Side</th>
              <th>Entry</th>
              <th>SL</th>
              <th>TP1 / TP2</th>
              <th>Net / Gross RR</th>
              <th>Reason</th>
              <th>Chart</th>
            </tr>
          </thead>
          <tbody>
            ${list
              .map((s) => {
                const isPlotted = activeOverlayId === s.signal_id;
                const isLong = s.side === 'long';
                const tp1 = s.take_profit_suggested?.[0];
                const tp2 = s.take_profit_suggested?.[1];
                return `
                  <tr>
                    <td>${formatUtcShort(s.signal_time_utc_ms)}</td>
                    <td style="font-weight:700; color:${isLong ? 'var(--bull)' : 'var(--bear)'};">${isLong ? '▲ LONG' : '▼ SHORT'}</td>
                    <td>${s.entry_price_suggested}</td>
                    <td style="color:var(--bear);">${s.stop_loss_suggested}</td>
                    <td style="color:var(--bull);">${tp1 ?? '—'}${tp2 != null ? ` <span style="color:#06b6d4;">/ ${tp2}</span>` : ''}</td>
                    <td><strong>1:${formatNum(s.risk_reward?.net_rr)}</strong> <span style="color:var(--text-muted); font-size:10px;">(1:${formatNum(s.risk_reward?.gross_rr)})</span></td>
                    <td style="max-width:220px; white-space:normal; font-size:10.5px; color:var(--text-muted);">${escapeHtml(s.reason)}</td>
                    <td>
                      <button type="button" class="btn btn-sm ${isPlotted ? '' : 'btn-primary'}" data-action="${isPlotted ? 'strategy-sim-clear-chart-signal' : 'strategy-sim-plot-signal'}" data-signal-id="${escapeHtml(s.signal_id)}">
                        ${isPlotted ? (isFa ? 'حذف' : 'Hide') : (isFa ? 'چارت' : 'Plot')}
                      </button>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderDiagnosticsTab(rejections, isFa) {
  if (!rejections || rejections.length === 0) {
    return `
      <div class="card-subtle" style="padding:18px; text-align:center; font-size:12px; color:var(--text-muted);">
        ${isFa ? 'در این بازه هیچ کاندیدای ردشده‌ای ثبت نشده است.' : 'No rejected candidate setups recorded in this history.'}
      </div>
    `;
  }

  const list = [...rejections].reverse().slice(0, 60);
  return `
    <div class="card-subtle">
      <div class="row-between" style="margin-bottom:8px;">
        <strong style="font-size:12px; color:var(--text-strong);">${isFa ? `عیب‌یابی و سیگنال‌های ردشده (NO TRADE) — ${rejections.length} مورد` : `Rejected Candidate Diagnostics (NO TRADE) — ${rejections.length} total`}</strong>
        <span style="font-size:10.5px; color:var(--text-muted);">${isFa ? 'این موارد هرگز به‌عنوان سیگنال خرید/فروش روی چارت رسم نمی‌شوند' : 'Rejected setups are NEVER plotted as buy/sell signals on the chart'}</span>
      </div>
      <div style="overflow-x:auto; max-height:380px; overflow-y:auto;">
        <table class="ci-strat-table ltr-num">
          <thead>
            <tr>
              <th>Time (UTC)</th>
              <th>Side</th>
              <th>Rejection Code</th>
              <th>Gross RR</th>
              <th>Net RR</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            ${list
              .map(
                (r) => `
                <tr>
                  <td>${formatUtcShort(r.signal_time_utc_ms)}</td>
                  <td style="color:${r.side === 'long' ? 'var(--bull)' : 'var(--bear)'}; font-weight:600;">${String(r.side || '').toUpperCase()}</td>
                  <td><span class="ci-strat-badge ci-strat-badge-notrade">${escapeHtml(r.rejection_code || 'REJECTED')}</span></td>
                  <td>${r.risk_reward?.gross_rr ? `1:${formatNum(r.risk_reward.gross_rr)}` : '—'}</td>
                  <td style="color:var(--bear);">${r.risk_reward?.net_rr ? `1:${formatNum(r.risk_reward.net_rr)}` : '—'}</td>
                  <td style="max-width:260px; white-space:normal; font-size:10.5px; color:var(--text-muted);">${escapeHtml(r.reason)}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function renderStrategyLabModal(activeTab, i18n) {
  if (state.activeModal !== 'strategy-lab') return '';
  const isFa = i18n.getCurrentLanguage() === 'fa';
  const symbolCode = activeTab?.symbolCode || 'SPOTBRENT';
  const timeframe = activeTab?.timeframe || 'M15';
  const provider = activeTab?.provider || 'tvdatafeed';
  const chartId = `${symbolCode}_${provider}_${timeframe}`;

  const rawCfg = state.strategySimConfig || {};
  const engineMode = String(rawCfg.engineMode || 'CLASSICAL').toUpperCase();
  const activeLabTab = ['overview', 'compare', 'signals', 'diagnostics'].includes(rawCfg.activeLabTab)
    ? rawCfg.activeLabTab
    : 'overview';
  const candles = getCachedOrAggregatedCandles(symbolCode, provider, timeframe) || [];

  // Legacy strategy-sim/1.0 mode (explicitly selectable for backward compatibility)
  if (engineMode === 'LEGACY') {
    const cfg = StrategySimulator.normalizeConfig({
      ...DEFAULT_STRATEGY_CONFIG,
      ...rawCfg,
    });
    const result = StrategySimulator.runSimulation(candles, {
      ...cfg,
      symbolCode,
      timeframe,
      chartId,
      includeSensitivity: true,
    });
    return renderLegacyModalShell(result, cfg, symbolCode, timeframe, isFa);
  }

  // Primary Engine: Classical Signal Generators + Risk/Reward Hard Gate (`signal-gen/1.0` + `strategy-sim/2.0`)
  const validStratIds = new Set(CLASSICAL_STRATEGY_REGISTRY.map((s) => s.id));
  const selectedStrategyId = validStratIds.has(rawCfg.strategyId) ? rawCfg.strategyId : 'trend_pullback_v1';
  const selectedMeta = CLASSICAL_STRATEGY_REGISTRY.find((s) => s.id === selectedStrategyId) || CLASSICAL_STRATEGY_REGISTRY[0];
  const paramsByStrategy = rawCfg.paramsByStrategy || {};
  const activeStrategyParams = {
    ...selectedMeta.defaultParams,
    ...(paramsByStrategy[selectedStrategyId] || {}),
  };
  const enabledStrategies = {
    trend_pullback_v1: true,
    rsi_reversion_v1: true,
    breakout_v1: true,
    sma_crossover_v1: true,
    rsi_dip_v1: true,
    ...(rawCfg.enabledStrategies || {}),
  };

  const cfg = SignalBacktester.normalizeConfig({
    ...rawCfg,
    strategyId: selectedStrategyId,
    minRequiredRR: enforceMinimumRequiredRR(rawCfg.minRequiredRR ?? MINIMUM_REQUIRED_RR),
    strategyParams: activeStrategyParams,
  });

  const result = SignalBacktester.runBacktest(candles, {
    ...cfg,
    symbolCode,
    timeframe,
    chartId,
    includeSensitivity: true,
    includeSplit: true,
  });

  // Cache validated signals for instant Chart Overlay plotting
  _latestRenderedSignalsById.clear();
  for (const sig of result.signalReport?.validSignals || []) {
    _latestRenderedSignalsById.set(sig.signal_id, sig);
  }

  // Evaluate Controlled One-Way Forecast -> Strategy Bridge (Master Plan §10)
  // Note: Classical strategies run 100% independently above; this bridge card reports whether the
  // latest Forecast for this symbol/timeframe is allowed to emit a Forecast-Guided candidate.
  const bridgeEval = evaluateForecastStrategyBridge(state._lastForecastResult || null, candles, {
    symbolCode,
    timeframe,
    minRequiredRR: cfg.minRequiredRR,
    spreadBps: cfg.spreadBps,
    commissionBps: cfg.commissionBps,
    slippageBps: cfg.slippageBps,
    allowResearchPreview: state.forecastUxMode === 'research',
  });
  if (bridgeEval?.passed && bridgeEval.signal) {
    _latestRenderedSignalsById.set(bridgeEval.signal.signal_id, bridgeEval.signal);
  }

  const compareRes =
    activeLabTab === 'compare'
      ? SignalBacktester.compareAllStrategies(candles, {
          ...cfg,
          symbolCode,
          timeframe,
          chartId,
          enabledStrategies,
          paramsByStrategy,
        })
      : null;

  const m = result.metrics;
  const netColor = m.netProfitEur >= 0 ? 'var(--bull)' : 'var(--bear)';

  const strategyOptionsHtml = CLASSICAL_STRATEGY_REGISTRY.map((s) => {
    const tag = s.isResearchBenchmarkOnly ? (isFa ? ' [مبنای پژوهشی]' : ' [Research Baseline]') : '';
    return `<option value="${escapeHtml(s.id)}" ${s.id === selectedStrategyId ? 'selected' : ''}>${escapeHtml((isFa ? s.nameFa : s.nameEn) + tag)}</option>`;
  }).join('');

  const directionBtnsHtml = [
    { id: 'BOTH', label: isFa ? 'خرید و فروش' : 'Long & Short' },
    { id: 'LONG_ONLY', label: isFa ? 'فقط خرید' : 'Long Only' },
    { id: 'SHORT_ONLY', label: isFa ? 'فقط فروش' : 'Short Only' },
  ]
    .map(
      (d) =>
        `<button type="button" class="chip ${cfg.direction === d.id ? 'active' : ''}" data-action="strategy-sim-set-field" data-field="direction" data-value="${d.id}">${d.label}</button>`
    )
    .join('');

  const kpiCards = [
    {
      label: isFa ? 'بازده خالص / ناخالص' : 'Net / Gross Return',
      val: `${m.netReturnPct >= 0 ? '+' : ''}${formatNum(m.netReturnPct)}% / ${m.grossReturnPct >= 0 ? '+' : ''}${formatNum(m.grossReturnPct)}%`,
      color: netColor,
    },
    {
      label: isFa ? 'سرمایه نهایی / CAGR' : 'Final Equity / CAGR',
      val: `€${formatNum(m.finalEquity)} · ${m.cagrPct != null ? `${m.cagrPct >= 0 ? '+' : ''}${formatNum(m.cagrPct, 1)}%` : 'N/A (<30d)'}`,
      color: 'var(--text-strong)',
    },
    {
      label: isFa ? 'نرخ برد / تعداد معامله' : 'Win Rate / Trades',
      val: `${formatNum(m.winRatePct, 1)}% (${m.winCount}W / ${m.lossCount}L · ${m.totalTrades})`,
      color: 'var(--text-strong)',
    },
    {
      label: isFa ? 'ضریب سود (PF)' : 'Profit Factor',
      val: formatNum(m.profitFactor),
      color: m.profitFactor >= 1.2 ? 'var(--bull)' : m.profitFactor >= 1.0 ? 'var(--gold)' : 'var(--bear)',
    },
    {
      label: isFa ? 'حداکثر افت سرمایه' : 'Max Drawdown',
      val: `-${formatNum(m.maxDrawdownPct)}% (-€${formatNum(m.maxDrawdownEur)})`,
      color: 'var(--bear)',
    },
    {
      label: isFa ? 'امید ریاضی / میانگین R' : 'Expectancy / Avg R',
      val: `€${formatNum(m.expectancyEur)} · ${m.averageR >= 0 ? '+' : ''}${formatNum(m.averageR)}R`,
      color: m.expectancyEur >= 0 ? 'var(--bull)' : 'var(--bear)',
    },
    {
      label: isFa ? 'شارپ / سورتینو' : 'Sharpe / Sortino',
      val: `${formatNum(m.sharpeRatio)} / ${formatNum(m.sortinoRatio)}`,
      color: 'var(--primary)',
    },
    {
      label: isFa ? 'فیلتر RR / میانگین Net RR' : 'RR-Rejected / Avg Net RR',
      val: `${m.rejectedByRrCount}✕ · ${m.avgAcceptedNetRR > 0 ? `1:${formatNum(m.avgAcceptedNetRR)}` : '—'}`,
      color: '#f59e0b',
    },
    {
      label: isFa ? 'هزینه کل / میانگین نگهداری' : 'Total Costs / Avg Hold',
      val: `€${formatNum(m.totalFeesEur)} · ${formatNum(m.avgHoldingBars, 1)} bars`,
      color: 'var(--text-muted)',
    },
    {
      label: isFa ? 'توالی برد / باخت متوالی' : 'Max Win / Loss Streak',
      val: `${m.maxConsecutiveWins}W / ${m.maxConsecutiveLosses}L`,
      color: 'var(--text-muted)',
    },
  ];

  const activeOverlayId = activeTab?.showStrategySignal ? activeTab?.activeStrategySignal?.signal_id : null;
  const bridgeSignal = bridgeEval?.signal || null;
  const isBridgePlotted = Boolean(bridgeSignal && activeOverlayId === bridgeSignal.signal_id);
  const bridgeHtml = `
    <div class="card-subtle" style="margin-bottom:12px; border-left:3px solid ${bridgeEval.passed ? 'var(--bull)' : 'var(--border)'};">
      <div class="row-between" style="margin-bottom:6px; gap:8px;">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <strong style="font-size:12px; color:var(--text-strong);">${isFa ? 'پل کنترل‌شده پیش‌بینی ← استراتژی (One-Way Forecast Bridge)' : 'Controlled Forecast → Strategy Bridge'}</strong>
          <span class="ci-strat-badge ${bridgeEval.passed ? 'ci-strat-badge-valid' : 'ci-strat-badge-notrade'}">${bridgeEval.passed ? 'BRIDGE VALID' : 'NO TRADE'}</span>
          ${bridgeEval.rejection_code ? `<span class="ltr-num" style="font-size:10.5px; color:var(--text-muted);">${escapeHtml(bridgeEval.rejection_code)}</span>` : ''}
        </div>
        ${
          bridgeSignal
            ? `<button type="button" class="btn btn-sm ${isBridgePlotted ? '' : 'btn-primary'}" data-action="${isBridgePlotted ? 'strategy-sim-clear-chart-signal' : 'strategy-sim-plot-signal'}" data-signal-id="${escapeHtml(bridgeSignal.signal_id)}">
                ${isBridgePlotted ? (isFa ? '✕ حذف از چارت' : '✕ Hide from Chart') : (isFa ? 'نمایش روی چارت' : 'Show on Chart')}
              </button>`
            : ''
        }
      </div>
      <div style="font-size:11.5px; color:var(--text);">${escapeHtml(isFa ? bridgeEval.reasonFa || bridgeEval.reason : bridgeEval.reason)}</div>
      ${
        bridgeSignal
          ? `<div class="ltr-num" style="display:flex; gap:12px; flex-wrap:wrap; font-size:11px; margin-top:6px; color:var(--text-muted);">
              <span><strong>Model:</strong> ${escapeHtml(bridgeEval.forecastProvenance?.modelId || '—')}</span>
              <span><strong>Side:</strong> ${escapeHtml(bridgeSignal.side.toUpperCase())}</span>
              <span><strong>Entry:</strong> ${bridgeSignal.entry_price_suggested}</span>
              <span style="color:var(--bear);"><strong>SL:</strong> ${bridgeSignal.stop_loss_suggested}</span>
              <span style="color:var(--bull);"><strong>TP1:</strong> ${bridgeSignal.take_profit_suggested?.[0] ?? '—'}</span>
              <span><strong>Net R:R:</strong> 1:${formatNum(bridgeSignal.risk_reward?.net_rr)}</span>
            </div>`
          : ''
      }
      ${
        !bridgeEval.passed && bridgeEval.researchPreview
          ? `<div style="margin-top:6px; padding:6px 8px; border-radius:6px; background:rgba(245,158,11,0.08); border:1px dashed #f59e0b; font-size:10.5px; color:var(--text-muted);">
              <strong style="color:#f59e0b;">${escapeHtml(isFa ? bridgeEval.researchPreview.warningFa : bridgeEval.researchPreview.warning)}</strong>
              <span class="ltr-num" style="margin-inline-start:8px;">Ref ${escapeHtml(bridgeEval.researchPreview.side?.toUpperCase())} · Hypothetical Net R:R 1:${formatNum(bridgeEval.researchPreview.hypothetical_net_rr)}</span>
            </div>`
          : ''
      }
    </div>
  `;

  const isOosHtml = result.inSampleOutOfSample
    ? `
      <div class="card-subtle" style="margin-bottom:12px;">
        <div class="row-between" style="margin-bottom:6px;">
          <strong style="font-size:12px; color:var(--text-strong);">${isFa ? 'تفکیک زمانی بدون نشت داده (۷۰٪ درون‌نمونه / ۳۰٪ برون‌نمونه)' : 'Chronological Split Validation (70% In-Sample / 30% Out-of-Sample)'}</strong>
          <span class="ltr-num" style="font-size:10.5px; color:var(--text-muted);">Split @ bar #${result.inSampleOutOfSample.splitBarIndex}</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:8px; font-size:11.5px;" class="ltr-num">
          <div style="padding:8px; border-radius:6px; background:var(--surface-elevated); border:1px solid var(--border);">
            <div style="font-size:10.5px; color:var(--text-muted); margin-bottom:4px;">In-Sample (70%)</div>
            <div>Return: <strong style="color:${result.inSampleOutOfSample.inSample.netReturnPct >= 0 ? 'var(--bull)' : 'var(--bear)'};">${result.inSampleOutOfSample.inSample.netReturnPct >= 0 ? '+' : ''}${formatNum(result.inSampleOutOfSample.inSample.netReturnPct)}%</strong> · Trades: ${result.inSampleOutOfSample.inSample.totalTrades} · PF: ${formatNum(result.inSampleOutOfSample.inSample.profitFactor)} · DD: -${formatNum(result.inSampleOutOfSample.inSample.maxDrawdownPct)}%</div>
          </div>
          <div style="padding:8px; border-radius:6px; background:var(--surface-elevated); border:1px solid var(--border);">
            <div style="font-size:10.5px; color:var(--text-muted); margin-bottom:4px;">Out-of-Sample (30%)</div>
            <div>Return: <strong style="color:${result.inSampleOutOfSample.outOfSample.netReturnPct >= 0 ? 'var(--bull)' : 'var(--bear)'};">${result.inSampleOutOfSample.outOfSample.netReturnPct >= 0 ? '+' : ''}${formatNum(result.inSampleOutOfSample.outOfSample.netReturnPct)}%</strong> · Trades: ${result.inSampleOutOfSample.outOfSample.totalTrades} · PF: ${formatNum(result.inSampleOutOfSample.outOfSample.profitFactor)} · DD: -${formatNum(result.inSampleOutOfSample.outOfSample.maxDrawdownPct)}%</div>
          </div>
        </div>
      </div>`
    : '';

  const pwf = result.purgedWalkForward;
  const purgedWfHtml = pwf
    ? `
      <div class="card-subtle" style="margin-bottom:12px;">
        <div class="row-between" style="margin-bottom:6px; flex-wrap:wrap; gap:6px;">
          <strong style="font-size:12px; color:var(--text-strong);">${isFa ? 'اعتبارسنجی Purged Walk-Forward + Embargo و Holdout دست‌نخورده نهایی' : 'Purged Walk-Forward + Embargo & Final Untouched Holdout'}</strong>
          <span class="ltr-num" style="font-size:10.5px; color:var(--text-muted);">Purge=${pwf.purgeBars}b · Embargo=${pwf.embargoBars}b · Positive Folds: ${pwf.positiveFoldsCount}/${pwf.foldsCount}</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:8px; font-size:11.5px;" class="ltr-num">
          <div style="padding:8px; border-radius:6px; background:var(--surface-elevated); border:1px solid var(--border);">
            <div style="font-size:10.5px; color:var(--text-muted); margin-bottom:4px;">Aggregate Purged OOS (${pwf.foldsCount} Folds)</div>
            <div>Net: <strong style="color:${pwf.aggregateOos.netProfitEur >= 0 ? 'var(--bull)' : 'var(--bear)'};">${pwf.aggregateOos.netProfitEur >= 0 ? '+' : ''}€${formatNum(pwf.aggregateOos.netProfitEur)}</strong> · Trades: ${pwf.aggregateOos.totalTrades} · PF: ${formatNum(pwf.aggregateOos.profitFactor)} · Exp: €${formatNum(pwf.aggregateOos.expectancyEur)}</div>
          </div>
          <div style="padding:8px; border-radius:6px; background:var(--surface-elevated); border:1px solid var(--border);">
            <div style="font-size:10.5px; color:var(--text-muted); margin-bottom:4px;">Final Untouched Holdout (bars #${pwf.untouchedHoldout.startBarIndex}..${pwf.untouchedHoldout.endBarIndex})</div>
            <div>Return: <strong style="color:${pwf.untouchedHoldout.metrics.netReturnPct >= 0 ? 'var(--bull)' : 'var(--bear)'};">${pwf.untouchedHoldout.metrics.netReturnPct >= 0 ? '+' : ''}${formatNum(pwf.untouchedHoldout.metrics.netReturnPct)}%</strong> · Trades: ${pwf.untouchedHoldout.metrics.totalTrades} · PF: ${formatNum(pwf.untouchedHoldout.metrics.profitFactor)} · DD: -${formatNum(pwf.untouchedHoldout.metrics.maxDrawdownPct)}%</div>
          </div>
        </div>
      </div>`
    : '';

  const activeRegimes = (result.regimeBreakdown || []).filter((r) => r.tradesCount > 0);
  const regimeBreakdownHtml =
    activeRegimes.length > 0
      ? `
      <div class="card-subtle" style="margin-bottom:12px;">
        <div class="row-between" style="margin-bottom:6px;">
          <strong style="font-size:12px; color:var(--text-strong);">${isFa ? 'تفکیک عملکرد بر اساس رژیم علّی بازار (Market Regime Breakdown)' : 'Causal Market Regime Breakdown'}</strong>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:8px;" class="ltr-num">
          ${activeRegimes
            .map(
              (r) => `
            <div style="padding:6px 10px; border-radius:6px; background:var(--surface-elevated); border:1px solid var(--border); font-size:11px;">
              <strong>${escapeHtml(r.regime)}</strong> (${r.tradesCount}) · Win: ${formatNum(r.winRatePct, 1)}% · AvgR: ${r.averageR >= 0 ? '+' : ''}${formatNum(r.averageR)}R · Net: <span style="color:${r.netProfitEur >= 0 ? 'var(--bull)' : 'var(--bear)'};">${r.netProfitEur >= 0 ? '+' : ''}€${formatNum(r.netProfitEur)}</span>
            </div>`
            )
            .join('')}
        </div>
      </div>`
      : '';

  const sensitivityHtml =
    result.costSensitivity.length > 0
      ? `
      <div class="card-subtle" style="margin-bottom: 12px;">
        <div class="row-between" style="margin-bottom: 6px;">
          <strong style="font-size: 12px; color: var(--text-strong);">${isFa ? 'تحلیل حساسیت هزینه معاملاتی (اسپرد + کارمزد + لغزش + سوآپ)' : 'Cost Sensitivity Analysis (Spread + Comm + Slippage + Swap)'}</strong>
        </div>
        <div style="overflow-x: auto;">
          <table class="ci-strat-table ltr-num">
            <thead>
              <tr>
                <th>${isFa ? 'سناریو' : 'Scenario'}</th>
                <th>${isFa ? 'بازده %' : 'Return %'}</th>
                <th>${isFa ? 'سود خالص' : 'Net EUR'}</th>
                <th>PF</th>
                <th>Max DD</th>
                <th>${isFa ? 'هزینه کل' : 'Total Costs'}</th>
              </tr>
            </thead>
            <tbody>
              ${result.costSensitivity
                .map(
                  (row) => `
                <tr>
                  <td style="font-weight: 600;">${escapeHtml(row.label)}</td>
                  <td style="color: ${row.netReturnPct >= 0 ? 'var(--bull)' : 'var(--bear)'};">${row.netReturnPct >= 0 ? '+' : ''}${formatNum(row.netReturnPct)}%</td>
                  <td style="color: ${row.netProfitEur >= 0 ? 'var(--bull)' : 'var(--bear)'};">€${formatNum(row.netProfitEur)}</td>
                  <td>${formatNum(row.profitFactor)}</td>
                  <td style="color: var(--bear);">-${formatNum(row.maxDrawdownPct)}%</td>
                  <td style="color: var(--text-muted);">€${formatNum(row.totalFeesEur)}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`
      : '';

  const recentTrades = result.trades.slice(-40).reverse();
  const tradeLedgerHtml =
    recentTrades.length === 0
      ? `<div style="padding: 12px; text-align: center; font-size: 12px; color: var(--text-muted);">${
          result.status === 'INSUFFICIENT_DATA'
            ? isFa
              ? 'برای اجرای تحلیل حداقل ۳۰ کندل بسته نیاز است.'
              : 'At least 30 closed candles are required to run simulation.'
            : isFa
              ? 'در این بازه هیچ موقعیتی با نسبت Net R:R ≥ 2.0 به معامله نرسید (نتیجه صادقانه: بدون معامله).'
              : 'No setups met the Net R:R ≥ 2.0 Hard Gate on this history.'
        }</div>`
      : `
      <div style="overflow-x: auto; max-height: 220px; overflow-y: auto;">
        <table class="ci-strat-table ltr-num">
          <thead>
            <tr>
              <th>#</th>
              <th>Side</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>Plan RR</th>
              <th>Realized R</th>
              <th>Net (€)</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            ${recentTrades
              .map(
                (t) => `
              <tr>
                <td style="color: var(--text-muted);">${t.id}</td>
                <td style="font-weight: 700; color: ${t.side === 'LONG' ? 'var(--bull)' : 'var(--bear)'};">${t.side}</td>
                <td>${t.entryPrice} <span style="color:var(--text-dim); font-size:9.5px;">${formatUtcShort(t.entryTimeMs)}</span></td>
                <td>${t.exitPrice} <span style="color:var(--text-dim); font-size:9.5px;">${escapeHtml(t.exitReason)}</span></td>
                <td>1:${formatNum(t.plannedNetRR)}</td>
                <td style="color: ${t.rMultiple >= 0 ? 'var(--bull)' : 'var(--bear)'};">${t.rMultiple >= 0 ? '+' : ''}${formatNum(t.rMultiple)}R</td>
                <td style="font-weight: 600; color: ${t.netPnlEur >= 0 ? 'var(--bull)' : 'var(--bear)'};">${t.netPnlEur >= 0 ? '+' : ''}€${formatNum(t.netPnlEur)}</td>
                <td style="color: var(--text-muted); max-width:210px; white-space:normal; font-size:10px;">${escapeHtml(t.signalReason)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`;

  const overviewBodyHtml = `
    ${renderLiveDecisionBanner(result.signalReport, activeTab, isFa)}
    ${bridgeHtml}

    <div class="card-subtle" style="margin-bottom: 12px;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; margin-bottom: 8px;">
        <div>
          <label class="tv-input-label">${isFa ? 'استراتژی کلاسیک (ta-core/1.1)' : 'Classical Strategy (ta-core/1.1)'}</label>
          <select class="input-field" data-action="strategy-sim-select-preset">${strategyOptionsHtml}</select>
        </div>
        <div>
          <label class="tv-input-label">${isFa ? 'جهت معاملات' : 'Trade Direction'}</label>
          <div class="chip-group" style="margin-top: 2px;">${directionBtnsHtml}</div>
        </div>
      </div>

      <div style="font-size: 11.5px; color: var(--text-muted); margin-bottom: 6px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
        ${selectedMeta.isResearchBenchmarkOnly ? `<span class="ci-strat-badge ci-strat-badge-research">${isFa ? 'مبنای مقایسه پژوهشی' : 'Research Comparison Baseline'}</span>` : ''}
        <span>${escapeHtml(isFa ? selectedMeta.descFa : selectedMeta.descEn)}</span>
      </div>

      ${renderStrategySpecificParams(selectedStrategyId, activeStrategyParams, isFa)}

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); gap: 8px; margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border);">
        <div>
          <label class="tv-input-label ltr-num">${isFa ? 'سرمایه (€)' : 'Equity (€)'}</label>
          <input type="number" min="100" step="100" class="input-field ltr-num" value="${cfg.initialEquity}" data-action="strategy-sim-input" data-field="initialEquity" />
        </div>
        <div>
          <label class="tv-input-label ltr-num">${isFa ? 'ریسک (%)' : 'Risk (%)'}</label>
          <input type="number" min="0.1" max="10" step="0.25" class="input-field ltr-num" value="${cfg.riskPerTradePct}" data-action="strategy-sim-input" data-field="riskPerTradePct" />
        </div>
        <div>
          <label class="tv-input-label ltr-num" title="Immutable Hard Gate: cannot be reduced below 2.00">${isFa ? 'حداقل Net R:R (قفل ≥2)' : 'Min Net R:R (≥2.0)'}</label>
          <input type="number" min="2.0" max="10" step="0.25" class="input-field ltr-num" value="${cfg.minRequiredRR}" data-action="strategy-sim-input" data-field="minRequiredRR" />
        </div>
        <div>
          <label class="tv-input-label ltr-num">${isFa ? 'اسپرد (bps)' : 'Spread (bps)'}</label>
          <input type="number" min="0" max="200" step="1" class="input-field ltr-num" value="${cfg.spreadBps}" data-action="strategy-sim-input" data-field="spreadBps" />
        </div>
        <div>
          <label class="tv-input-label ltr-num">${isFa ? 'کارمزد (bps)' : 'Comm (bps)'}</label>
          <input type="number" min="0" max="200" step="1" class="input-field ltr-num" value="${cfg.commissionBps}" data-action="strategy-sim-input" data-field="commissionBps" />
        </div>
        <div>
          <label class="tv-input-label ltr-num">${isFa ? 'لغزش (bps)' : 'Slip (bps)'}</label>
          <input type="number" min="0" max="200" step="0.5" class="input-field ltr-num" value="${cfg.slippageBps}" data-action="strategy-sim-input" data-field="slippageBps" />
        </div>
        <div>
          <label class="tv-input-label ltr-num">${isFa ? 'حداکثر کندل' : 'Max Bars'}</label>
          <input type="number" min="4" max="500" step="4" class="input-field ltr-num" value="${cfg.maxHoldBars}" data-action="strategy-sim-input" data-field="maxHoldBars" />
        </div>
      </div>

      <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <span style="font-size:10.5px; color:var(--text-muted);">
          ${isFa ? 'قانون غیرقابل‌مذاکره: حد سود (TP) صرفاً از سطوح ساختاری واقعی انتخاب می‌شود و کاهش حداقل Net R:R زیر 1:2 مجاز نیست.' : 'Hard Gate: Take Profit uses real structural S/R & swings only (never fabricated) and Net R:R cannot drop below 1:2.0.'}
        </span>
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn btn-sm" data-action="strategy-sim-set-field" data-field="engineMode" data-value="LEGACY">${isFa ? 'حالت Legacy (v1)' : 'Legacy Presets (v1)'}</button>
          <button type="button" class="btn btn-sm" data-action="strategy-sim-reset">↺ ${isFa ? 'بازنشانی پیش‌فرض‌ها' : 'Reset Defaults'}</button>
        </div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 12px;">
      ${kpiCards
        .map(
          (k) => `
        <div class="card-subtle" style="padding: 8px 10px;">
          <div style="font-size: 10.5px; color: var(--text-muted); margin-bottom: 3px;">${k.label}</div>
          <div class="ltr-num" style="font-size: 12px; font-weight: 700; color: ${k.color};">${k.val}</div>
        </div>`
        )
        .join('')}
    </div>

    ${
      result.equityCurve.length >= 2
        ? `<div style="margin-bottom: 12px;">
            <div style="font-size: 11.5px; font-weight: 600; color: var(--text-strong); margin-bottom: 6px;">${isFa ? 'منحنی سرمایه خالص (Equity Curve)' : 'Net Equity Curve (EUR)'}</div>
            ${buildEquityCurveSvg(result.equityCurve, cfg.initialEquity)}
          </div>`
        : ''
    }

    ${isOosHtml}
    ${purgedWfHtml}
    ${regimeBreakdownHtml}
    ${sensitivityHtml}

    ${
      result.portfolioRiskPolicy || result.sizingLimitationNote
        ? `<div style="font-size:10.5px; color:var(--text-muted); padding:6px 9px; border-radius:6px; background:var(--surface-elevated); border:1px solid var(--border); margin-bottom:10px;">
            ℹ ${escapeHtml(
              isFa
                ? result.portfolioRiskPolicy?.disclaimerFa || result.sizingLimitationNote
                : result.portfolioRiskPolicy?.disclaimer || result.sizingLimitationNote
            )}
          </div>`
        : ''
    }

    <div class="card-subtle">
      <div class="row-between" style="margin-bottom: 6px;">
        <strong style="font-size: 12px; color: var(--text-strong);">${isFa ? 'دفتر معاملات شبیه‌سازی‌شده (آخرین ۴۰ معامله)' : 'Simulated Trade Ledger (Latest 40 Trades)'}</strong>
        <span class="ltr-num" style="font-size: 11px; color: var(--text-muted);">${result.trades.length} total</span>
      </div>
      ${tradeLedgerHtml}
    </div>
  `;

  const validCount = result.signalReport?.validSignals?.length || 0;
  const rejectedCount = result.signalReport?.rejections?.length || 0;

  let tabContentHtml = overviewBodyHtml;
  if (activeLabTab === 'compare' && compareRes) {
    tabContentHtml = renderCompareTab(compareRes, enabledStrategies, selectedStrategyId, isFa);
  } else if (activeLabTab === 'signals') {
    tabContentHtml = renderValidSignalsTab(result.signalReport?.validSignals || [], activeTab, isFa);
  } else if (activeLabTab === 'diagnostics') {
    tabContentHtml = renderDiagnosticsTab(result.signalReport?.rejections || [], isFa);
  }

  return `
    <div class="modal-backdrop" data-action="close-modal-backdrop">
      <div class="modal-card" style="max-width: 880px; width: 96vw;" dir="${isFa ? 'rtl' : 'ltr'}">
        <div class="tv-modal-header">
          <div class="tv-modal-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
            <span>${isFa ? 'سیستم تولید سیگنال کلاسیک و ارزیابی ریسک به ریوارد' : 'Classical Signal Engine & Risk/Reward Intelligence'}</span>
            <span class="ltr-num" style="font-size: 11px; color: var(--primary); padding: 1px 6px; border-radius: 4px; background: var(--primary-soft);">${escapeHtml(symbolCode)} · ${escapeHtml(timeframe)}</span>
            <span class="ci-strat-badge ci-strat-badge-gate ltr-num">Net R:R ≥ 1:${formatNum(cfg.minRequiredRR)}</span>
          </div>
          <button type="button" class="btn btn-sm btn-icon" data-action="close-modal" aria-label="Close">✕</button>
        </div>

        <div class="tv-modal-tabs">
          <button type="button" class="tv-modal-tab ${activeLabTab === 'overview' ? 'active' : ''}" data-action="strategy-lab-set-tab" data-tab="overview">
            ${isFa ? 'سیگنال و بک‌تست' : 'Signal & Backtest'}
          </button>
          <button type="button" class="tv-modal-tab ${activeLabTab === 'compare' ? 'active' : ''}" data-action="strategy-lab-set-tab" data-tab="compare">
            ${isFa ? 'مقایسه ۵ استراتژی' : 'Compare All (5)'}
          </button>
          <button type="button" class="tv-modal-tab ${activeLabTab === 'signals' ? 'active' : ''}" data-action="strategy-lab-set-tab" data-tab="signals">
            ${isFa ? `سیگنال‌های معتبر (${validCount})` : `Valid Signals (${validCount})`}
          </button>
          <button type="button" class="tv-modal-tab ${activeLabTab === 'diagnostics' ? 'active' : ''}" data-action="strategy-lab-set-tab" data-tab="diagnostics">
            ${isFa ? `عیب‌یابی NO TRADE (${rejectedCount})` : `Diagnostics / NO TRADE (${rejectedCount})`}
          </button>
        </div>

        <div class="tv-modal-body" style="max-height: 76vh; overflow-y: auto;">
          <div style="background: rgba(41, 98, 255, 0.10); border: 1px solid var(--primary); border-radius: 8px; padding: 8px 10px; font-size: 11.5px; color: var(--text); margin-bottom: 12px;">
            <strong>${isFa ? 'محیط صرفاً پژوهشی و آفلاین (Offline Research Simulation Only):' : 'Offline Research Simulation Only:'}</strong>
            ${
              isFa
                ? `سیگنال‌دهی و بک‌تست آفلاین روی ${result.candleCount} کندل بسته (ta-core/1.1) · بدون اتصال بروکر، صرافی یا سفارش زنده · اجرای علّی روی اوپن کندل بعدی · اولویت SL بر TP.`
                : `Signal generation & offline backtesting on ${result.candleCount} closed bars (ta-core/1.1) · Zero broker/order APIs · Causal next-bar open fills · Conservative SL-before-TP rule.`
            }
          </div>

          ${tabContentHtml}
        </div>
      </div>
    </div>
  `;
}

function renderLegacyModalShell(result, cfg, symbolCode, timeframe, isFa) {
  const m = result.metrics;
  const netColor = m.netProfitEur >= 0 ? 'var(--bull)' : 'var(--bear)';
  const selectedPreset = STRATEGY_PRESETS.find((p) => p.id === cfg.presetId) || STRATEGY_PRESETS[0];

  const presetOptionsHtml = STRATEGY_PRESETS.map(
    (p) => `<option value="${escapeHtml(p.id)}" ${p.id === cfg.presetId ? 'selected' : ''}>${escapeHtml(isFa ? p.nameFa : p.nameEn)}</option>`
  ).join('');

  return `
    <div class="modal-backdrop" data-action="close-modal-backdrop">
      <div class="modal-card" style="max-width: 780px; width: 96vw;" dir="${isFa ? 'rtl' : 'ltr'}">
        <div class="tv-modal-header">
          <div class="tv-modal-title">
            <span>${isFa ? 'شبیه‌ساز کلاسیک v1 (Legacy TA-Core)' : 'Offline Strategy Simulator (Legacy v1)'}</span>
            <span class="ltr-num" style="font-size: 11px; color: var(--primary); padding: 1px 6px; border-radius: 4px; background: var(--primary-soft);">${escapeHtml(symbolCode)} · ${escapeHtml(timeframe)}</span>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button type="button" class="btn btn-sm btn-primary" data-action="strategy-sim-set-field" data-field="engineMode" data-value="CLASSICAL">${isFa ? 'بازگشت به موتور سیگنال v2 (Hard Gate R:R)' : 'Switch to Classical Signal Engine v2'}</button>
            <button type="button" class="btn btn-sm btn-icon" data-action="close-modal" aria-label="Close">✕</button>
          </div>
        </div>
        <div class="tv-modal-body" style="max-height: 76vh; overflow-y: auto;">
          <div style="background: rgba(41, 98, 255, 0.10); border: 1px solid var(--primary); border-radius: 8px; padding: 8px 10px; font-size: 11.5px; color: var(--text); margin-bottom: 12px;">
            <strong>Offline Research Simulation Only:</strong> Legacy strategy-sim/1.0 (${result.candleCount} closed bars · Net: <span style="color:${netColor};">${m.netReturnPct.toFixed(2)}%</span>).
          </div>
          <div class="card-subtle" style="margin-bottom:12px;">
            <label class="tv-input-label">${isFa ? 'الگوی استراتژی v1' : 'Strategy Preset (v1)'}</label>
            <select class="input-field" data-action="strategy-sim-select-preset">${presetOptionsHtml}</select>
            <div style="font-size:11.5px; color:var(--text-muted); margin-top:6px;">${escapeHtml(isFa ? selectedPreset.descFa : selectedPreset.descEn)}</div>
          </div>
          ${result.equityCurve.length >= 2 ? `<div style="margin-bottom:12px;"><div style="font-size:11.5px; font-weight:600; margin-bottom:6px;">Equity Curve</div>${buildEquityCurveSvg(result.equityCurve, cfg.initialEquity)}</div>` : ''}
          <div class="card-subtle"><strong>Cost Sensitivity Analysis</strong> · Trades: ${m.totalTrades} · PF: ${m.profitFactor.toFixed(2)}</div>
        </div>
      </div>
    </div>
  `;
}
