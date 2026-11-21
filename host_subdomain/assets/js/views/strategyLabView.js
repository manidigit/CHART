import {
  state,
  escapeHtml,
  getCachedOrAggregatedCandles,
} from '../core/store.js?v=1.47.41';
import {
  StrategySimulator,
  STRATEGY_PRESETS,
  DEFAULT_STRATEGY_CONFIG,
} from '../algorithms/strategySimulator.js?v=1.47.41';

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

  // Downsample visually to <= 180 points for crisp SVG rendering
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

export function renderStrategyLabModal(activeTab, i18n) {
  if (state.activeModal !== 'strategy-lab') return '';
  const isFa = i18n.getCurrentLanguage() === 'fa';
  const symbolCode = activeTab?.symbolCode || 'SPOTBRENT';
  const timeframe = activeTab?.timeframe || 'M15';
  const provider = activeTab?.provider || 'tvdatafeed';
  const chartId = `${symbolCode}_${provider}_${timeframe}`;

  const cfg = StrategySimulator.normalizeConfig({
    ...DEFAULT_STRATEGY_CONFIG,
    ...(state.strategySimConfig || {}),
  });

  const candles = getCachedOrAggregatedCandles(symbolCode, provider, timeframe) || [];
  const result = StrategySimulator.runSimulation(candles, {
    ...cfg,
    symbolCode,
    timeframe,
    chartId,
    includeSensitivity: true,
  });

  const m = result.metrics;
  const netColor = m.netProfitEur >= 0 ? 'var(--bull)' : 'var(--bear)';
  const selectedPreset = STRATEGY_PRESETS.find((p) => p.id === cfg.presetId) || STRATEGY_PRESETS[0];

  const presetOptionsHtml = STRATEGY_PRESETS.map(
    (p) => `<option value="${escapeHtml(p.id)}" ${p.id === cfg.presetId ? 'selected' : ''}>${escapeHtml(isFa ? p.nameFa : p.nameEn)}</option>`
  ).join('');

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
      label: isFa ? 'سود/زیان خالص' : 'Net Return',
      val: `${m.netProfitEur >= 0 ? '+' : ''}€${m.netProfitEur.toFixed(2)} (${m.netReturnPct >= 0 ? '+' : ''}${m.netReturnPct.toFixed(2)}%)`,
      color: netColor,
    },
    {
      label: isFa ? 'سرمایه نهایی' : 'Final Equity',
      val: `€${m.finalEquity.toFixed(2)}`,
      color: 'var(--text-strong)',
    },
    {
      label: isFa ? 'نرخ برد / تعداد معامله' : 'Win Rate / Trades',
      val: `${m.winRatePct.toFixed(1)}% (${m.winCount}W / ${m.lossCount}L · ${m.totalTrades})`,
      color: 'var(--text-strong)',
    },
    {
      label: isFa ? 'ضریب سود (PF)' : 'Profit Factor',
      val: m.profitFactor.toFixed(2),
      color: m.profitFactor >= 1.2 ? 'var(--bull)' : m.profitFactor >= 1.0 ? 'var(--gold)' : 'var(--bear)',
    },
    {
      label: isFa ? 'حداکثر افت سرمایه' : 'Max Drawdown',
      val: `-${m.maxDrawdownPct.toFixed(2)}% (-€${m.maxDrawdownEur.toFixed(2)})`,
      color: 'var(--bear)',
    },
    {
      label: isFa ? 'امید ریاضی / میانگین R' : 'Expectancy / Avg R',
      val: `€${m.expectancyEur.toFixed(2)} · ${m.averageR >= 0 ? '+' : ''}${m.averageR.toFixed(2)}R`,
      color: m.expectancyEur >= 0 ? 'var(--bull)' : 'var(--bear)',
    },
    {
      label: isFa ? 'شارپ / سورتینو' : 'Sharpe / Sortino',
      val: `${m.sharpeRatio.toFixed(2)} / ${m.sortinoRatio.toFixed(2)}`,
      color: 'var(--primary)',
    },
    {
      label: isFa ? 'مجموع کارمزد و اسپرد / ضرر متوالی' : 'Total Costs / Max Loss Streak',
      val: `€${m.totalFeesEur.toFixed(2)} · ${m.maxConsecutiveLosses}L`,
      color: 'var(--text-muted)',
    },
  ];

  const sensitivityHtml =
    result.costSensitivity.length > 0
      ? `
      <div class="card-subtle" style="margin-bottom: 12px;">
        <div class="row-between" style="margin-bottom: 6px;">
          <strong style="font-size: 12px; color: var(--text-strong);">${isFa ? 'تحلیل حساسیت هزینه معاملاتی (اسپرد + کارمزد + لغزش + سوآپ)' : 'Cost Sensitivity Analysis (Spread + Comm + Slippage + Swap)'}</strong>
        </div>
        <div style="overflow-x: auto;">
          <table class="ltr-num" style="width:100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border); color: var(--text-muted); text-align: left;">
                <th style="padding: 5px 6px;">${isFa ? 'سناریو' : 'Scenario'}</th>
                <th style="padding: 5px 6px;">${isFa ? 'بازده %' : 'Return %'}</th>
                <th style="padding: 5px 6px;">${isFa ? 'سود خالص' : 'Net EUR'}</th>
                <th style="padding: 5px 6px;">PF</th>
                <th style="padding: 5px 6px;">Max DD</th>
                <th style="padding: 5px 6px;">${isFa ? 'هزینه کل' : 'Total Costs'}</th>
              </tr>
            </thead>
            <tbody>
              ${result.costSensitivity
                .map(
                  (row) => `
                <tr style="border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.06));">
                  <td style="padding: 5px 6px; font-weight: 600;">${escapeHtml(row.label)}</td>
                  <td style="padding: 5px 6px; color: ${row.netReturnPct >= 0 ? 'var(--bull)' : 'var(--bear)'};">${row.netReturnPct >= 0 ? '+' : ''}${row.netReturnPct.toFixed(2)}%</td>
                  <td style="padding: 5px 6px; color: ${row.netProfitEur >= 0 ? 'var(--bull)' : 'var(--bear)'};">€${row.netProfitEur.toFixed(2)}</td>
                  <td style="padding: 5px 6px;">${row.profitFactor.toFixed(2)}</td>
                  <td style="padding: 5px 6px; color: var(--bear);">-${row.maxDrawdownPct.toFixed(2)}%</td>
                  <td style="padding: 5px 6px; color: var(--text-muted);">€${row.totalFeesEur.toFixed(2)}</td>
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
              ? 'برای اجرای شبیه‌سازی حداقل ۳۰ کندل بسته نیاز است.'
              : 'At least 30 closed candles are required to run simulation.'
            : isFa
              ? 'در این بازه و با این پارامترها معامله‌ای فعال نشد.'
              : 'No trades were triggered on this history with current parameters.'
        }</div>`
      : `
      <div style="overflow-x: auto; max-height: 220px; overflow-y: auto;">
        <table class="ltr-num" style="width:100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border); color: var(--text-muted); text-align: left;">
              <th style="padding: 5px;">#</th>
              <th style="padding: 5px;">Side</th>
              <th style="padding: 5px;">Entry</th>
              <th style="padding: 5px;">Exit</th>
              <th style="padding: 5px;">R</th>
              <th style="padding: 5px;">Net (€)</th>
              <th style="padding: 5px;">Reason</th>
            </tr>
          </thead>
          <tbody>
            ${recentTrades
              .map(
                (t) => `
              <tr style="border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.06));">
                <td style="padding: 4px 5px; color: var(--text-muted);">${t.id}</td>
                <td style="padding: 4px 5px; font-weight: 700; color: ${t.side === 'LONG' ? 'var(--bull)' : 'var(--bear)'};">${t.side}</td>
                <td style="padding: 4px 5px;">${t.entryPrice} <span style="color:var(--text-dim); font-size:9.5px;">${formatUtcShort(t.entryTimeMs)}</span></td>
                <td style="padding: 4px 5px;">${t.exitPrice} <span style="color:var(--text-dim); font-size:9.5px;">${t.exitReason}</span></td>
                <td style="padding: 4px 5px; color: ${t.rMultiple >= 0 ? 'var(--bull)' : 'var(--bear)'};">${t.rMultiple >= 0 ? '+' : ''}${t.rMultiple.toFixed(2)}R</td>
                <td style="padding: 4px 5px; font-weight: 600; color: ${t.netPnlEur >= 0 ? 'var(--bull)' : 'var(--bear)'};">${t.netPnlEur >= 0 ? '+' : ''}€${t.netPnlEur.toFixed(2)}</td>
                <td style="padding: 4px 5px; color: var(--text-muted);">${escapeHtml(t.signalReason)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`;

  return `
    <div class="modal-backdrop" data-action="close-modal-backdrop">
      <div class="modal-card" style="max-width: 780px; width: 96vw;" dir="${isFa ? 'rtl' : 'ltr'}">
        <div class="tv-modal-header">
          <div class="tv-modal-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
            <span>${isFa ? 'آزمایشگاه شبیه‌سازی استراتژی (آفلاین)' : 'Offline Strategy Simulator (Phase 6)'}</span>
            <span class="ltr-num" style="font-size: 11px; color: var(--primary); padding: 1px 6px; border-radius: 4px; background: var(--primary-soft);">${escapeHtml(symbolCode)} · ${escapeHtml(timeframe)}</span>
          </div>
          <button type="button" class="btn btn-sm btn-icon" data-action="close-modal" aria-label="Close">✕</button>
        </div>

        <div class="tv-modal-body" style="max-height: 78vh; overflow-y: auto;">
          <div style="background: rgba(41, 98, 255, 0.10); border: 1px solid var(--primary); border-radius: 8px; padding: 8px 10px; font-size: 11.5px; color: var(--text); margin-bottom: 12px;">
            <strong>${isFa ? 'محیط صرفاً پژوهشی و آفلاین:' : 'Offline Research Simulation Only:'}</strong>
            ${
              isFa
                ? `مستقل برای هر چارت (${result.candleCount} کندل بسته) · بدون اتصال بروکر یا سفارش زنده · اجرای علّی روی اوپن کندل بعدی · قاعده محافظه‌کارانه اولویت حد ضرر (SL) بر حد سود (TP).`
                : `Independent per chart (${result.candleCount} closed bars) · Zero broker/live orders · Causal next-bar open fills · Conservative SL-before-TP intrabar rule.`
            }
          </div>

          <div class="card-subtle" style="margin-bottom: 12px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 10px;">
              <div>
                <label class="tv-input-label">${isFa ? 'الگوی استراتژی (TA Core)' : 'Strategy Preset (TA Core)'}</label>
                <select class="input-field" data-action="strategy-sim-select-preset">${presetOptionsHtml}</select>
              </div>
              <div>
                <label class="tv-input-label">${isFa ? 'جهت معاملات' : 'Trade Direction'}</label>
                <div class="chip-group" style="margin-top: 2px;">${directionBtnsHtml}</div>
              </div>
            </div>
            <div style="font-size: 11.5px; color: var(--text-muted); margin-bottom: 10px;">
              ${escapeHtml(isFa ? selectedPreset.descFa : selectedPreset.descEn)}
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px;">
              <div>
                <label class="tv-input-label ltr-num">${isFa ? 'سرمایه (€)' : 'Equity (€)'}</label>
                <input type="number" min="100" step="100" class="input-field ltr-num" value="${cfg.initialEquity}" data-action="strategy-sim-input" data-field="initialEquity" />
              </div>
              <div>
                <label class="tv-input-label ltr-num">${isFa ? 'ریسک (%)' : 'Risk (%)'}</label>
                <input type="number" min="0.1" max="10" step="0.25" class="input-field ltr-num" value="${cfg.riskPerTradePct}" data-action="strategy-sim-input" data-field="riskPerTradePct" />
              </div>
              <div>
                <label class="tv-input-label ltr-num">${isFa ? 'نسبت R:R' : 'R:R Ratio'}</label>
                <input type="number" min="0.5" max="10" step="0.25" class="input-field ltr-num" value="${cfg.rrRatio}" data-action="strategy-sim-input" data-field="rrRatio" />
              </div>
              <div>
                <label class="tv-input-label ltr-num">${isFa ? 'ضریب ATR SL' : 'ATR SL ×'}</label>
                <input type="number" min="0.5" max="6" step="0.25" class="input-field ltr-num" value="${cfg.atrStopMult}" data-action="strategy-sim-input" data-field="atrStopMult" />
              </div>
              <div>
                <label class="tv-input-label ltr-num">${isFa ? 'اسپرد (bps)' : 'Spread (bps)'}</label>
                <input type="number" min="0" max="100" step="1" class="input-field ltr-num" value="${cfg.spreadBps}" data-action="strategy-sim-input" data-field="spreadBps" />
              </div>
              <div>
                <label class="tv-input-label ltr-num">${isFa ? 'کارمزد (bps)' : 'Comm (bps)'}</label>
                <input type="number" min="0" max="100" step="1" class="input-field ltr-num" value="${cfg.commissionBps}" data-action="strategy-sim-input" data-field="commissionBps" />
              </div>
              <div>
                <label class="tv-input-label ltr-num">${isFa ? 'لغزش (bps)' : 'Slip (bps)'}</label>
                <input type="number" min="0" max="100" step="0.5" class="input-field ltr-num" value="${cfg.slippageBps}" data-action="strategy-sim-input" data-field="slippageBps" />
              </div>
              <div>
                <label class="tv-input-label ltr-num">${isFa ? 'حداکثر کندل' : 'Max Bars'}</label>
                <input type="number" min="4" max="500" step="4" class="input-field ltr-num" value="${cfg.maxHoldBars}" data-action="strategy-sim-input" data-field="maxHoldBars" />
              </div>
            </div>
            <div style="margin-top: 8px; display: flex; justify-content: flex-end;">
              <button type="button" class="btn btn-sm" data-action="strategy-sim-reset">↺ ${isFa ? 'بازنشانی پیش‌فرض‌ها (€1,000 · 1%)' : 'Reset Defaults (€1,000 · 1%)'}</button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); gap: 8px; margin-bottom: 12px;">
            ${kpiCards
              .map(
                (k) => `
              <div class="card-subtle" style="padding: 8px 10px;">
                <div style="font-size: 10.5px; color: var(--text-muted); margin-bottom: 3px;">${k.label}</div>
                <div class="ltr-num" style="font-size: 12.5px; font-weight: 700; color: ${k.color};">${k.val}</div>
              </div>`
              )
              .join('')}
          </div>

          ${
            result.equityCurve.length >= 2
              ? `<div style="margin-bottom: 12px;">
                  <div style="font-size: 11.5px; font-weight: 600; color: var(--text-strong); margin-bottom: 6px;">${isFa ? 'منحنی سرمایه (Equity Curve)' : 'Equity Curve (EUR)'}</div>
                  ${buildEquityCurveSvg(result.equityCurve, cfg.initialEquity)}
                </div>`
              : ''
          }

          ${sensitivityHtml}

          <div class="card-subtle">
            <div class="row-between" style="margin-bottom: 6px;">
              <strong style="font-size: 12px; color: var(--text-strong);">${isFa ? 'دفتر معاملات شبیه‌سازی‌شده (آخرین ۴۰ معامله)' : 'Simulated Trade Ledger (Latest 40 Trades)'}</strong>
              <span class="ltr-num" style="font-size: 11px; color: var(--text-muted);">${result.trades.length} total</span>
            </div>
            ${tradeLedgerHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}
