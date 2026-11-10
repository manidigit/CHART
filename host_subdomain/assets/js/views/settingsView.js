import { state } from '../core/store.js?v=1.28.8';

export function renderLanguageThemeBar(i18n) {
  const isFa = i18n.getCurrentLanguage() === 'fa';
  return `
    <div class="row-between" style="font-size: 13px; gap: 10px; flex-wrap: wrap;">
      <div class="chip-group">
        <button type="button" class="chip ${isFa ? 'active' : ''}" data-action="set-lang" data-lang="fa">فارسی</button>
        <button type="button" class="chip ${!isFa ? 'active' : ''}" data-action="set-lang" data-lang="en">English</button>
      </div>
      <div class="chip-group">
        <button type="button" class="chip ${state.isDarkTheme ? 'active' : ''}" data-action="set-theme" data-theme="dark">🌙 Dark</button>
        <button type="button" class="chip ${!state.isDarkTheme ? 'active' : ''}" data-action="set-theme" data-theme="light">☀️ Light</button>
      </div>
    </div>
  `;
}

export function renderSettingsModal(i18n) {
  if (state.activeModal !== 'settings') return '';
  const p = state.chartPreferences;
  const tab = state.settingsTab || 'sources';

  const symbolsList = state.symbols
    .map(
      (s) => `
      <div class="card-subtle" style="margin-bottom: 8px; padding: 10px 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
          <div style="min-width: 160px; flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong style="font-size: 13px; color: var(--text);">${s.customTitle || i18n.t('symbol_' + s.symbolCode) || s.symbolCode}</strong>
              <span class="ltr-num" style="font-size: 11px; font-weight: 700; color: var(--primary); padding: 1px 6px; border-radius: 4px; background: var(--primary-soft);">${s.symbolCode}</span>
            </div>
            <div class="ltr-num" style="font-size: 11px; color: var(--text-muted); margin-top: 3px;">
              ${(s.candles || []).length} bars · ${s.lastCandleUtc || '—'}
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <select
              class="input-field ltr-num"
              style="width: 220px; min-height: 32px; padding: 4px 8px; font-size: 11.5px;"
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

            <label style="display: inline-flex; align-items: center; gap: 5px; cursor: pointer; font-size: 12px; color: var(--text);">
              <input type="checkbox" data-action="toggle-watchlist" data-symbol="${s.symbolCode}" ${s.inWatchlist ? 'checked' : ''} style="accent-color: var(--primary); width: 15px; height: 15px;" />
              <span>${i18n.t('nav_watchlist')}</span>
            </label>

            ${
              s.isCustom
                ? `<button class="btn btn-sm" style="color: var(--bear);" data-action="delete-symbol" data-symbol="${s.symbolCode}">✕</button>`
                : ''
            }
          </div>
        </div>
      </div>
    `
    )
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
  ];

  let bodyHtml = '';
  if (tab === 'sources') {
    bodyHtml = `
      <div class="row-between" style="margin-bottom: 12px;">
        <div>
          <h4 style="margin: 0; font-size: 14px;">${i18n.t('settings_group_sources')}</h4>
          <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">${i18n.t('settings_sources_subtitle')}</div>
        </div>
        <button class="btn btn-sm btn-primary" data-action="open-add-symbol-modal">
          + ${i18n.t('settings_add_custom_symbol')}
        </button>
      </div>
      ${symbolsList}
    `;
  } else if (tab === 'appearance') {
    bodyHtml = `
      <div class="card-subtle" style="margin-bottom: 12px;">
        <h5 style="margin: 0 0 10px 0;">${i18n.t('settings_group_appearance')}</h5>
        ${renderLanguageThemeBar(i18n)}
      </div>

      <div class="card-subtle">
        <div class="row-between" style="gap: 16px; flex-wrap: wrap;">
          <div>
            <div style="font-size: 12.5px; font-weight: 600; margin-bottom: 6px;">${i18n.t('settings_color_bull')}</div>
            <div class="color-picker-row">
              ${['#26A69A', '#10B981', '#06B6D4', '#22C55E', '#D1D4DC']
                .map(
                  (c) => `<div class="color-dot ${p.bullColor === c ? 'active' : ''}" style="background: ${c};" data-action="set-color" data-target="bullColor" data-color="${c}"></div>`
                )
                .join('')}
            </div>

            <div style="font-size: 12.5px; font-weight: 600; margin: 12px 0 6px 0;">${i18n.t('settings_color_bear')}</div>
            <div class="color-picker-row">
              ${['#EF5350', '#F43F5E', '#E11D48', '#F97316', '#A855F7']
                .map(
                  (c) => `<div class="color-dot ${p.bearColor === c ? 'active' : ''}" style="background: ${c};" data-action="set-color" data-target="bearColor" data-color="${c}"></div>`
                )
                .join('')}
            </div>
          </div>

          <div style="background: #131722; border: 1px solid #2A2E39; border-radius: 6px; padding: 10px 16px;">
            <div class="ltr-num" style="font-size: 10px; color: #787B86; margin-bottom: 4px; text-align: center;">LIVE PREVIEW</div>
            <svg width="86" height="64" viewBox="0 0 64 54">
              <line x1="12" y1="8" x2="12" y2="46" stroke="${p.bullColor}" stroke-width="1.5"/>
              <rect x="7" y="16" width="10" height="20" fill="${p.bullColor}" rx="1"/>
              <line x1="32" y1="6" x2="32" y2="44" stroke="${p.bearColor}" stroke-width="1.5"/>
              <rect x="27" y="14" width="10" height="22" fill="${p.bearColor}" rx="1"/>
              <line x1="52" y1="4" x2="52" y2="42" stroke="${p.bullColor}" stroke-width="1.5"/>
              <rect x="47" y="10" width="10" height="22" fill="${p.bullColor}" rx="1"/>
            </svg>
          </div>
        </div>
      </div>
    `;
  } else if (tab === 'scales') {
    bodyHtml = `
      <div class="card-subtle" style="margin-bottom: 12px;">
        <div class="row-between" style="font-size: 12.5px; margin-bottom: 6px;">
          <span>${i18n.t('settings_param_fetch_limit')}</span>
          <strong id="fetch-limit-value-label" class="ltr-num" style="color: var(--primary); font-size: 13.5px;">${p.candleFetchLimit || 500}</strong>
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
        <div class="row-between ltr-num" style="font-size: 10.5px; color: var(--text-dim); margin-top: 4px;">
          <span>40</span>
          <span>500</span>
          <span>1500</span>
          <span>3000</span>
          <span>5000</span>
        </div>
      </div>

      <div class="card-subtle">
        ${tvSwitches
          .map(
            (sw) => `
          <label class="tv-switch-row" style="cursor: pointer;">
            <span class="tv-switch-title">${sw.label}</span>
            <input
              type="checkbox"
              data-action="toggle-tv-pref"
              data-pref-key="${sw.key}"
              ${p[sw.key] ? 'checked' : ''}
            />
          </label>
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
            <h5 style="margin: 0;">${i18n.t('settings_group_account')}</h5>
            <div class="ltr-num" style="font-size: 11.5px; color: var(--primary); margin-top: 2px;">${state.ownerUsername || 'Owner'}</div>
          </div>
          <button class="btn btn-sm" style="color: var(--bear); border-color: var(--bear);" data-action="sign-out">
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
        <h5 style="margin: 0 0 6px 0;">${i18n.t('settings_group_about')}</h5>
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
          <button class="btn btn-sm btn-icon" data-action="close-modal">✕</button>
        </div>

        <div class="tv-modal-tabs">
          <button class="tv-modal-tab ${tab === 'sources' ? 'active' : ''}" data-action="set-settings-tab" data-tab="sources">
            ${i18n.t('settings_group_sources')}
          </button>
          <button class="tv-modal-tab ${tab === 'appearance' ? 'active' : ''}" data-action="set-settings-tab" data-tab="appearance">
            ${i18n.t('settings_group_appearance')}
          </button>
          <button class="tv-modal-tab ${tab === 'scales' ? 'active' : ''}" data-action="set-settings-tab" data-tab="scales">
            ${i18n.t('settings_group_params')}
          </button>
          <button class="tv-modal-tab ${tab === 'account' ? 'active' : ''}" data-action="set-settings-tab" data-tab="account">
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

