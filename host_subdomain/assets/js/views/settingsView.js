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
      <div class="card-subtle" style="margin-bottom: 8px;">
        <div class="row-between">
          <div>
            <strong>${s.customTitle || i18n.t('symbol_' + s.symbolCode) || s.symbolCode}</strong>
            <div class="ltr-num" style="font-size: 11px; color: var(--primary);">${s.symbolCode} · ${s.timeframe} · ${s.decimals} dec</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
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
        <div class="chip-group" style="margin-top: 6px;">
          ${s.allowedProviders
            .map(
              (prov) => `
              <button class="chip ${s.activeProvider === prov ? 'active' : ''}" style="font-size: 11px; min-height: 26px; padding: 2px 8px;" data-action="select-provider" data-symbol="${s.symbolCode}" data-provider="${prov}">
                ${i18n.t('provider_' + prov)}
              </button>
            `
            )
            .join('')}
        </div>
      </div>
    `
    )
    .join('');

  return `
    <div>
      ${
        state.statusBannerKey
          ? `<div style="background: rgba(16, 185, 129, 0.14); border: 1px solid var(--bull); color: var(--bull); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 12px; margin-bottom: 12px;">
               ${i18n.t(state.statusBannerKey)}
             </div>`
          : ''
      }
      <div class="row-between" style="margin-bottom: 12px;">
        <h4 style="margin: 0;">${i18n.t('settings_symbols_section')}</h4>
        <button class="btn btn-sm btn-primary" data-action="open-add-symbol-modal">
          + ${i18n.t('settings_add_custom_symbol')}
        </button>
      </div>
      ${symbolsList}

      <div class="card-subtle" style="margin-top: 14px;">
        <h5 style="margin: 0 0 10px 0;">${i18n.t('settings_chart_colors')}</h5>
        <div style="font-size: 12px; margin-bottom: 4px;">Bullish Candle</div>
        <div class="color-picker-row">
          ${['#10B981', '#84CC16', '#06B6D4', '#22C55E', '#FFFFFF']
            .map(
              (c) => `<div class="color-dot ${p.bullColor === c ? 'active' : ''}" style="background: ${c};" data-action="set-color" data-target="bullColor" data-color="${c}"></div>`
            )
            .join('')}
        </div>
        <div style="font-size: 12px; margin: 10px 0 4px 0;">Bearish Candle</div>
        <div class="color-picker-row">
          ${['#F43F5E', '#E11D48', '#F97316', '#EC4899', '#A855F7']
            .map(
              (c) => `<div class="color-dot ${p.bearColor === c ? 'active' : ''}" style="background: ${c};" data-action="set-color" data-target="bearColor" data-color="${c}"></div>`
            )
            .join('')}
        </div>
      </div>

      <div class="card-subtle" style="margin-top: 14px;">
        <h5 style="margin: 0 0 10px 0;">${i18n.t('settings_algo_params_section')}</h5>
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
        <div class="row-between ltr-num" style="font-size: 10px; color: var(--text-dim); margin-top: 4px;">
          <span>40</span>
          <span>500</span>
          <span>1500</span>
          <span>3000</span>
          <span>5000</span>
        </div>
      </div>

      <div class="card-subtle" style="margin-top: 14px;">
        <h5 style="margin: 0 0 8px 0;">${i18n.t('settings_appearance_section')}</h5>
        ${renderLanguageThemeBar(i18n)}
      </div>

      <div class="card-subtle" style="margin-top: 14px;">
        <h5 style="margin: 0 0 10px 0;">${i18n.t('settings_account_section')} (${state.ownerUsername || 'Owner'})</h5>
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

      <button class="btn" style="width: 100%; margin-top: 14px; color: var(--bear); border-color: var(--bear);" data-action="sign-out">
        ${i18n.t('action_sign_out')} (${state.ownerUsername})
      </button>
    </div>
  `;
}
