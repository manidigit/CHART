import { state } from '../core/store.js';

export function renderLanguageThemeBar(i18n) {
  const isFa = i18n.getCurrentLanguage() === 'fa';
  return `
    <div class="row-between" style="font-size: 13px;">
      <div class="chip-group">
        <button class="chip ${isFa ? 'active' : ''}" data-action="set-lang" data-lang="fa">فارسی</button>
        <button class="chip ${!isFa ? 'active' : ''}" data-action="set-lang" data-lang="en">English</button>
      </div>
      <div class="chip-group">
        <button class="chip ${state.isDarkTheme ? 'active' : ''}" data-action="set-theme" data-theme="dark">Dark</button>
        <button class="chip ${!state.isDarkTheme ? 'active' : ''}" data-action="set-theme" data-theme="light">Light</button>
      </div>
    </div>
  `;
}

export function renderSettingsContent(i18n) {
  const p = state.chartPreferences;
  const symbolsList = state.symbols
    .map(
      (s) => `
      <div class="card-subtle" style="margin-bottom: 8px; padding: 9px 11px;">
        <div class="row-between">
          <div>
            <strong>${s.customTitle || i18n.t('symbol_' + s.symbolCode) || s.symbolCode}</strong>
            <div class="ltr-num" style="font-size: 11px; color: var(--primary);">${s.symbolCode} · ${i18n.t('provider_' + s.activeProvider) || s.activeProvider}</div>
            <div class="ltr-num" style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
              ${(s.candles || []).length} bars · ${s.lastCandleUtc || '—'}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <select class="input-field ltr-num" style="width: auto; min-height: 28px; padding: 2px 7px; font-size: 11px;" data-action="select-provider-dropdown" data-symbol="${s.symbolCode}">
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
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 12px;">
              <input type="checkbox" data-action="toggle-watchlist" data-symbol="${s.symbolCode}" ${s.inWatchlist ? 'checked' : ''} />
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

  return `
    <div>
      ${
        state.statusBannerKey
          ? `<div style="background: rgba(38, 166, 154, 0.14); border: 1px solid var(--bull); color: var(--bull); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 12px; margin-bottom: 12px;">
               ${i18n.t(state.statusBannerKey)}
             </div>`
          : ''
      }

      <!-- Group 1: User Account -->
      <div class="card-subtle" style="margin-bottom: 12px;">
        <div class="row-between" style="margin-bottom: 10px;">
          <h5 style="margin: 0;">${i18n.t('settings_group_account')} (${state.ownerUsername || 'Owner'})</h5>
          <button class="btn btn-sm" style="color: var(--bear); border-color: var(--bear);" data-action="sign-out">
            ${i18n.t('action_sign_out')}
          </button>
        </div>
        <form id="settings-email-form" style="margin-bottom: 10px;">
          <input class="input-field ltr-num" type="email" name="recovery_email" placeholder="${i18n.t('label_recovery_email')}" value="${state.ownerEmail || ''}" required />
          <button type="submit" class="btn btn-sm btn-primary" style="width: 100%; margin-top: 6px;">
            ${i18n.t('action_save_email')}
          </button>
        </form>
        <form id="settings-password-form">
          <input class="input-field" type="password" name="new_password" placeholder="${i18n.t('settings_new_password')}" required />
          <button type="submit" class="btn btn-sm" style="width: 100%; margin-top: 6px;">
            ${i18n.t('settings_change_password')}
          </button>
        </form>
      </div>

      <!-- Group 2: Appearance, Language & Live 3-Candle Color Preview -->
      <div class="card-subtle" style="margin-bottom: 12px;">
        <h5 style="margin: 0 0 8px 0;">${i18n.t('settings_group_appearance')}</h5>
        ${renderLanguageThemeBar(i18n)}
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border);">
          <div class="row-between" style="margin-bottom: 8px;">
            <div>
              <div style="font-size: 12px; margin-bottom: 4px;">Bullish Candle</div>
              <div class="color-picker-row">
                ${['#26A69A', '#10B981', '#06B6D4', '#22C55E', '#D1D4DC']
                  .map(
                    (c) => `<div class="color-dot ${p.bullColor === c ? 'active' : ''}" style="background: ${c};" data-action="set-color" data-target="bullColor" data-color="${c}"></div>`
                  )
                  .join('')}
              </div>
              <div style="font-size: 12px; margin: 8px 0 4px 0;">Bearish Candle</div>
              <div class="color-picker-row">
                ${['#EF5350', '#F43F5E', '#E11D48', '#F97316', '#A855F7']
                  .map(
                    (c) => `<div class="color-dot ${p.bearColor === c ? 'active' : ''}" style="background: ${c};" data-action="set-color" data-target="bearColor" data-color="${c}"></div>`
                  )
                  .join('')}
              </div>
            </div>
            <!-- Live 3-Candle Mini Preview -->
            <div style="background: #131722; border: 1px solid #2A2E39; border-radius: 6px; padding: 6px 10px;">
              <svg width="64" height="54" viewBox="0 0 64 54">
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
      </div>

      <!-- Group 3: Data Sources & Symbols -->
      <div class="card-subtle" style="margin-bottom: 12px;">
        <div class="row-between" style="margin-bottom: 10px;">
          <h5 style="margin: 0;">${i18n.t('settings_group_sources')}</h5>
          <button class="btn btn-sm btn-primary" data-action="open-add-symbol-modal">
            + ${i18n.t('settings_add_custom_symbol')}
          </button>
        </div>
        ${symbolsList}
      </div>

      <!-- Group 4: Analysis Parameters & TradingView Pro Switches -->
      <div class="card-subtle" style="margin-bottom: 12px;">
        <h5 style="margin: 0 0 10px 0;">${i18n.t('settings_group_params')}</h5>
        <div class="row-between" style="font-size: 12px; margin-bottom: 6px;">
          <span>${i18n.t('settings_param_fetch_limit')}</span>
          <strong id="fetch-limit-value-label" class="ltr-num" style="color: var(--primary);">${p.candleFetchLimit || 500}</strong>
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
        <div class="row-between ltr-num" style="font-size: 10px; color: var(--text-dim); margin: 4px 0 10px 0;">
          <span>40</span>
          <span>500</span>
          <span>1500</span>
          <span>3000</span>
          <span>5000</span>
        </div>

        <div style="border-top: 1px solid var(--border); padding-top: 6px;">
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
      </div>

      <!-- Group 5: About & Support -->
      <div class="card-subtle">
        <h5 style="margin: 0 0 6px 0;">${i18n.t('settings_group_about')}</h5>
        <div class="ltr-num" style="font-size: 12px; color: var(--primary); font-weight: 600;">
          ${i18n.t('settings_about_version')}
        </div>
      </div>
    </div>
  `;
}
