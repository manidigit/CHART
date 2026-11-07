import { state } from '../core/store.js';
import { renderLanguageThemeBar } from './settingsView.js';

export function renderLoginScreen(i18n) {
  const isReg = state.isOwnerRegistered;
  return `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;">
      <div class="card" style="max-width: 440px; width: 100%; padding: 28px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-size: 26px; font-weight: 800; letter-spacing: 1px; color: var(--primary);">${i18n.t('app_name')}</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-top: 6px;">${i18n.t('app_subtitle')}</div>
        </div>
        <h3 style="margin: 0 0 8px 0;">${isReg ? i18n.t('login_signin_title') : i18n.t('login_setup_title')}</h3>
        <p style="font-size: 13px; color: var(--text-muted); margin: 0 0 20px 0;">
          ${isReg ? i18n.t('login_signin_subtitle') : i18n.t('login_setup_subtitle')}
        </p>
        ${
          state.authErrorKey
            ? `<div style="background: var(--bear-bg); border: 1px solid var(--bear); color: var(--bear); padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; margin-bottom: 16px;">
                 ${i18n.t(state.authErrorKey)}
               </div>`
            : ''
        }
        <form id="auth-form">
          <input class="input-field" type="text" name="username" placeholder="${i18n.t('label_username')}" value="${state.ownerUsername}" required autocomplete="username" />
          <input class="input-field" type="password" name="password" placeholder="${i18n.t('label_password')}" required autocomplete="current-password" />
          ${
            !isReg
              ? `<input class="input-field" type="password" name="confirm_password" placeholder="${i18n.t('label_confirm_password')}" required autocomplete="new-password" />`
              : ''
          }
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px;">
            ${isReg ? i18n.t('action_sign_in') : i18n.t('action_create_owner_account')}
          </button>
        </form>
        <div style="margin-top: 24px; border-top: 1px solid var(--border); padding-top: 16px;">
          ${renderLanguageThemeBar(i18n)}
        </div>
      </div>
    </div>
  `;
}
