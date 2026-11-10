import { state } from '../core/store.js?v=1.29.0';
import { getAssetBadge, renderSymbolBadge } from './watchlistView.js?v=1.29.0';

export function renderLanguageThemeBar(i18n) {
  const isFa = i18n.getCurrentLanguage() === 'fa';
  return `
    <div class="row-between" style="font-size: 13px; gap: 10px; flex-wrap: wrap;">
      <div class="chip-group">
        <button type="button" class="chip ${isFa ? 'active' : ''}" data-action="set-lang" data-lang="fa">فارسی</button>
        <button type="button" class="chip ${!isFa ? 'active' : ''}" data-action="set-lang" data-lang="en">English</button>
      </div>
      <div class="chip-group">
        <button type="button" class="chip ${state.isDarkTheme ? 'active' : ''}" data-action="set-theme" data-theme="dark">🌙 ${i18n.t('settings_theme_dark')}</button>
        <button type="button" class="chip ${!state.isDarkTheme ? 'active' : ''}" data-action="set-theme" data-theme="light">☀️ ${i18n.t('settings_theme_light')}</button>
      </div>
    </div>
  `;
}

export function renderSettingsModal(i18n) {
  if (state.activeModal !== 'settings') return '';
  const p = state.chartPreferences;
  const tab = state.settingsTab || 'sources';

  const symbolsList = state.symbols
    .map((s) => {
      const badge = getAssetBadge(s.symbolCode);
      const rawTitle = s.customTitle || i18n.t('symbol_' + s.symbolCode) || s.symbolCode;
      const cleanTitle = rawTitle.replace(/\s*\([A-Z0-9_]+\)\s*/g, '').trim() || rawTitle;
      return `
        <div class="tv-settings-symbol-row">
          <div class="tv-settings-symbol-left">
            ${renderSymbolBadge(s.symbolCode, 34)}
            <div style="min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <strong style="font-size: 13px; color: var(--text-strong);">${cleanTitle}</strong>
                <span class="ltr-num" style="font-size: 10.5px; font-weight: 700; color: var(--primary); padding: 1px 6px; border-radius: 4px; background: var(--primary-soft);">${s.symbolCode}</span>
                <span class="ltr-num" style="font-size: 10px; color: var(--text-muted);">${badge.category}</span>
              </div>
              <div class="ltr-num" style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                ${(s.candles || []).length} bars · ${s.lastCandleUtc || '—'}
              </div>
            </div>
          </div>

          <div class="tv-settings-symbol-actions">
            <select
              class="input-field ltr-num"
              style="width: 215px; min-height: 30px; padding: 3px 8px; font-size: 11.5px;"
              data-action="select-provider-dropdown"
              data-symbol="${s.symbolCode}"
            >
              ${s.allowedProviders
                .map(
                  (prov) => `
                  <option value="${prov}" ${s.activeProvider === prov ? 'selected' : ''}>
                    ${i18n.t('provider_' + prov) || prov}
                  </option>
                `
                )
                .join('')}
            </select>

            <label class="tv-toggle-label" title="${i18n.t('nav_watchlist')}">
              <input
                type="checkbox"
                class="tv-toggle-input"
                data-action="toggle-watchlist"
                data-symbol="${s.symbolCode}"
                ${s.inWatchlist ? 'checked' : ''}
              />
              <span class="tv-toggle-slider"></span>
              <span style="font-size: 11.5px;">${i18n.t('nav_watchlist')}</span>
            </label>

            ${
              s.isCustom
                ? `<button type="button" class="btn btn-sm" style="color: var(--bear); padding: 2px 7px;" data-action="delete-symbol" data-symbol="${s.symbolCode}" title="Delete">✕</button>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');

  const tvSwitches = [
    { key: 'hideWatchlistLogos', label: i18n.t('tv_hide_logos') },
    { key: 'showSymbolScreen', label: i18n.t('tv_show_symbol_screen') },
    { key: 'chartVibrations', label: i18n.t('tv_chart_vibrations') },
    { key: 'isLogScale', label: i18n.t('tv_log_scale') },
    { key: 'rememberLastChart', label: i18n.t('tv_remember_last_chart') },
    { key: 'hideTabBarInLandscape', label: i18n.t('tv_hide_tab_bar_landscape') },
    { key: 'pickerVibrates', label: i18n.t('tv_picker_vibrates') },
    { key: 'showScrollMagnifier', label: i18n.t('tv_show_scroll_magnifier') },
    { key: 'showCountdownToBarClose', label: i18n.t('tv_show_countdown') },
    { key: 'showPrevCloseLine', label: i18n.t('tv_show_prev_close_line') },
    { key: 'showHighLowLabels', label: i18n.t('tv_show_high_low_labels') },
  ];

  const colorRows = [
    {
      target: 'bullColor',
      label: i18n.t('settings_color_bull'),
      value: p.bullColor || '#26A69A',
      palette: ['#26A69A', '#10B981', '#06B6D4', '#22C55E', '#D1D4DC'],
    },
    {
      target: 'bearColor',
      label: i18n.t('settings_color_bear'),
      value: p.bearColor || '#EF5350',
      palette: ['#EF5350', '#F43F5E', '#E11D48', '#F97316', '#A855F7'],
    },
    {
      target: 'trendColor',
      label: i18n.t('settings_color_trend'),
      value: p.trendColor || '#2962FF',
      palette: ['#2962FF', '#3B82F6', '#06B6D4', '#10B981', '#F59E0B'],
    },
    {
      target: 'hLineColor',
      label: i18n.t('settings_color_hline'),
      value: p.hLineColor || '#F59E0B',
      palette: ['#F59E0B', '#EAB308', '#2962FF', '#EC4899', '#26A69A'],
    },
    {
      target: 'vLineColor',
      label: i18n.t('settings_color_vline'),
      value: p.vLineColor || '#A855F7',
      palette: ['#A855F7', '#8B5CF6', '#EC4899', '#06B6D4', '#94A3B8'],
    },
  ];

  let bodyHtml = '';
  if (tab === 'sources') {
    bodyHtml = `
      <div class="row-between" style="margin-bottom: 12px; gap: 10px; flex-wrap: wrap;">
        <div>
          <h4 style="margin: 0; font-size: 14px; color: var(--text-strong);">${i18n.t('settings_group_sources')}</h4>
          <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">${i18n.t('settings_sources_subtitle')}</div>
        </div>
        <button type="button" class="btn btn-sm btn-primary" data-action="open-add-symbol-modal">
          + ${i18n.t('settings_add_custom_symbol')}
        </button>
      </div>
      ${symbolsList}
    `;
  } else if (tab === 'appearance') {
    bodyHtml = `
      <div class="card-subtle" style="margin-bottom: 12px;">
        <h5 style="margin: 0 0 10px 0; color: var(--text-strong);">${i18n.t('settings_group_appearance')}</h5>
        ${renderLanguageThemeBar(i18n)}
      </div>

      <div class="card-subtle">
        <div class="row-between" style="margin-bottom: 12px;">
          <h5 style="margin: 0; color: var(--text-strong);">${i18n.t('settings_group_colors')}</h5>
          <button type="button" class="btn btn-sm" data-action="reset-chart-colors">
            ↺ ${i18n.t('action_reset_defaults')}
          </button>
        </div>

        <div class="row-between" style="gap: 18px; flex-wrap: wrap; align-items: flex-start;">
          <div style="flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 10px;">
            ${colorRows
              .map(
                (row) => `
                <div class="row-between" style="gap: 10px;">
                  <span style="font-size: 12px; font-weight: 600; color: var(--text);">${row.label}</span>
                  <div class="color-picker-row">
                    ${row.palette
                      .map(
                        (c) =>
                          `<div class="color-dot ${row.value.toUpperCase() === c.toUpperCase() ? 'active' : ''}" style="background: ${c};" data-action="set-color" data-target="${row.target}" data-color="${c}"></div>`
                      )
                      .join('')}
                  </div>
                </div>
              `
              )
              .join('')}
          </div>

          <div style="background: #131722; border: 1px solid #2A2E39; border-radius: 8px; padding: 12px 18px; min-width: 145px; text-align: center;">
            <div class="ltr-num" style="font-size: 10px; color: #787B86; margin-bottom: 6px; font-weight: 700;">LIVE PREVIEW</div>
            <svg width="110" height="84" viewBox="0 0 110 84" style="display: block; margin: 0 auto;">
              <!-- Vertical Reference Line -->
              <line x1="82" y1="4" x2="82" y2="80" stroke="${p.vLineColor || '#A855F7'}" stroke-width="1.2" stroke-dasharray="3 3"/>
              <!-- Horizontal Support/Resistance Line -->
              <line x1="6" y1="44" x2="104" y2="44" stroke="${p.hLineColor || '#F59E0B'}" stroke-width="1.3" stroke-dasharray="4 2"/>
              <!-- Trendline -->
              <line x1="12" y1="68" x2="96" y2="18" stroke="${p.trendColor || '#2962FF'}" stroke-width="2"/>
              <!-- Candle 1 (Bull) -->
              <line x1="22" y1="18" x2="22" y2="66" stroke="${p.bullColor}" stroke-width="1.6"/>
              <rect x="16" y="28" width="12" height="26" fill="${p.bullColor}" rx="1.5"/>
              <!-- Candle 2 (Bear) -->
              <line x1="54" y1="14" x2="54" y2="62" stroke="${p.bearColor}" stroke-width="1.6"/>
              <rect x="48" y="22" width="12" height="28" fill="${p.bearColor}" rx="1.5"/>
              <!-- Candle 3 (Bull) -->
              <line x1="82" y1="10" x2="82" y2="56" stroke="${p.bullColor}" stroke-width="1.6"/>
              <rect x="76" y="16" width="12" height="28" fill="${p.bullColor}" rx="1.5"/>
            </svg>
          </div>
        </div>
      </div>
    `;
  } else if (tab === 'scales') {
    bodyHtml = `
      <div class="card-subtle" style="margin-bottom: 12px;">
        <div class="row-between" style="margin-bottom: 10px;">
          <h5 style="margin: 0; color: var(--text-strong);">${i18n.t('settings_group_params')}</h5>
          <button type="button" class="btn btn-sm" data-action="reset-algo-params">
            ↺ ${i18n.t('action_reset_defaults')}
          </button>
        </div>

        <!-- 1. Candle Fetch Limit -->
        <div style="margin-bottom: 14px;">
          <div class="row-between" style="font-size: 12px; margin-bottom: 4px;">
            <span>${i18n.t('settings_param_fetch_limit')}</span>
            <strong id="fetch-limit-value-label" class="ltr-num" style="color: var(--primary); font-size: 13px;">${p.candleFetchLimit || 500}</strong>
          </div>
          <input
            type="range"
            min="40"
            max="5000"
            step="20"
            value="${p.candleFetchLimit || 500}"
            data-action="set-fetch-limit"
            style="width: 100%; accent-color: var(--primary); cursor: pointer;"
          />
          <div class="row-between ltr-num" style="font-size: 10px; color: var(--text-dim);">
            <span>40</span><span>500</span><span>1500</span><span>3000</span><span>5000</span>
          </div>
        </div>

        <!-- 2. Zoom Step Candles -->
        <div style="margin-bottom: 14px;">
          <div class="row-between" style="font-size: 12px; margin-bottom: 4px;">
            <span>${i18n.t('settings_param_zoom_step')}</span>
            <strong id="zoom-step-value-label" class="ltr-num" style="color: var(--primary); font-size: 13px;">${p.zoomStepCandles || 8}</strong>
          </div>
          <input
            type="range"
            min="2"
            max="30"
            step="1"
            value="${p.zoomStepCandles || 8}"
            data-action="set-zoom-step"
            style="width: 100%; accent-color: var(--primary); cursor: pointer;"
          />
          <div class="row-between ltr-num" style="font-size: 10px; color: var(--text-dim);">
            <span>2</span><span>8</span><span>15</span><span>22</span><span>30</span>
          </div>
        </div>

        <!-- 3. Drawing Hit Tolerance (px) -->
        <div>
          <div class="row-between" style="font-size: 12px; margin-bottom: 4px;">
            <span>${i18n.t('settings_param_hit_tolerance')}</span>
            <strong id="hit-tolerance-value-label" class="ltr-num" style="color: var(--primary); font-size: 13px;">${p.drawingHitTolerancePx || 28} px</strong>
          </div>
          <input
            type="range"
            min="12"
            max="60"
            step="2"
            value="${p.drawingHitTolerancePx || 28}"
            data-action="set-hit-tolerance"
            style="width: 100%; accent-color: var(--primary); cursor: pointer;"
          />
          <div class="row-between ltr-num" style="font-size: 10px; color: var(--text-dim);">
            <span>12px</span><span>28px</span><span>44px</span><span>60px</span>
          </div>
        </div>
      </div>

      <div class="card-subtle">
        <h5 style="margin: 0 0 8px 0; color: var(--text-strong);">${i18n.t('settings_tv_preferences_title')}</h5>
        ${tvSwitches
          .map(
            (sw) => `
          <div class="tv-switch-row">
            <span class="tv-switch-title">${sw.label}</span>
            <label class="tv-toggle-label">
              <input
                type="checkbox"
                class="tv-toggle-input"
                data-action="toggle-tv-pref"
                data-pref-key="${sw.key}"
                ${p[sw.key] ? 'checked' : ''}
              />
              <span class="tv-toggle-slider"></span>
            </label>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  } else {
    bodyHtml = `
      <div class="card-subtle" style="margin-bottom: 12px;">
        <div class="row-between" style="margin-bottom: 12px;">
          <div>
            <h5 style="margin: 0; color: var(--text-strong);">${i18n.t('settings_group_account')}</h5>
            <div class="ltr-num" style="font-size: 11.5px; color: var(--primary); margin-top: 2px;">${state.ownerUsername || 'Owner'}</div>
          </div>
          <button type="button" class="btn btn-sm" style="color: var(--bear); border-color: var(--bear);" data-action="sign-out">
            ${i18n.t('action_sign_out')}
          </button>
        </div>

        <form id="settings-email-form" style="margin-bottom: 12px;">
          <label class="tv-input-label">${i18n.t('label_recovery_email')}</label>
          <div style="display: flex; gap: 8px;">
            <input class="input-field ltr-num" type="email" name="recovery_email" placeholder="${i18n.t('label_recovery_email')}" value="${state.ownerEmail || ''}" required />
            <button type="submit" class="btn btn-sm btn-primary" style="flex-shrink: 0;">
              ${i18n.t('action_save_email')}
            </button>
          </div>
        </form>

        <form id="settings-password-form">
          <label class="tv-input-label">${i18n.t('settings_new_password')}</label>
          <div style="display: flex; gap: 8px;">
            <input class="input-field" type="password" name="new_password" placeholder="${i18n.t('settings_new_password')}" required />
            <button type="submit" class="btn btn-sm" style="flex-shrink: 0;">
              ${i18n.t('settings_change_password')}
            </button>
          </div>
        </form>
      </div>

      <div class="card-subtle">
        <h5 style="margin: 0 0 6px 0; color: var(--text-strong);">${i18n.t('settings_group_about')}</h5>
        <div class="ltr-num" style="font-size: 12px; color: var(--primary); font-weight: 600;">
          ${i18n.t('settings_about_version')}
        </div>
        <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px;">
          ${i18n.t('settings_about_desc')}
        </div>
      </div>
    `;
  }

  return `
    <div class="modal-backdrop" data-action="close-modal-backdrop">
      <div class="modal-card">
        <div class="tv-modal-header">
          <div class="tv-modal-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>${i18n.t('nav_settings')}</span>
          </div>
          <button type="button" class="btn btn-sm btn-icon" data-action="close-modal">✕</button>
        </div>

        <div class="tv-modal-tabs">
          <button type="button" class="tv-modal-tab ${tab === 'sources' ? 'active' : ''}" data-action="set-settings-tab" data-tab="sources">
            ${i18n.t('settings_group_sources')}
          </button>
          <button type="button" class="tv-modal-tab ${tab === 'appearance' ? 'active' : ''}" data-action="set-settings-tab" data-tab="appearance">
            ${i18n.t('settings_group_appearance')}
          </button>
          <button type="button" class="tv-modal-tab ${tab === 'scales' ? 'active' : ''}" data-action="set-settings-tab" data-tab="scales">
            ${i18n.t('settings_group_params')}
          </button>
          <button type="button" class="tv-modal-tab ${tab === 'account' ? 'active' : ''}" data-action="set-settings-tab" data-tab="account">
            ${i18n.t('settings_group_account')}
          </button>
        </div>

        <div class="tv-modal-body">
          ${
            state.statusBannerKey
              ? `<div style="background: rgba(38, 166, 154, 0.14); border: 1px solid var(--bull); color: var(--bull); padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 12px;">
                   ${i18n.t(state.statusBannerKey)}
                 </div>`
              : ''
          }
          ${bodyHtml}
        </div>
      </div>
    </div>
  `;
}

export const renderSettingsContent = renderSettingsModal;
