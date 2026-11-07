import { state } from '../core/store.js';
import { renderLanguageThemeBar } from './settingsView.js';

export function renderLoginScreen(i18n) {
  const isReg = state.isOwnerRegistered;
  const mode = state.authMode || 'login';

  let formContent = '';
  if (mode === 'forgot_request') {
    formContent = `
      <h3 style="margin: 0 0 8px 0;">${i18n.t('forgot_password_title')}</h3>
      <p style="font-size: 13px; color: var(--text-muted); margin: 0 0 20px 0;">
        ${i18n.t('forgot_password_subtitle')}
      </p>
      <form id="forgot-request-form">
        <input class="input-field ltr-num" type="email" name="email" placeholder="${i18n.t('label_recovery_email')}" value="${state.ownerEmail || ''}" required autocomplete="email" />
        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px;">
          ${i18n.t('action_send_recovery_code')}
        </button>
        <button type="button" class="btn" style="width: 100%; margin-top: 8px;" data-action="set-auth-mode" data-mode="login">
          ${i18n.t('action_back_to_login')}
        </button>
      </form>
    `;
  } else if (mode === 'forgot_verify') {
    formContent = `
      <h3 style="margin: 0 0 8px 0;">${i18n.t('forgot_password_title')}</h3>
      <p style="font-size: 13px; color: var(--text-muted); margin: 0 0 20px 0;">
        ${i18n.t('forgot_verify_subtitle')}
      </p>
      <form id="forgot-verify-form">
        <input class="input-field ltr-num" type="email" name="email" placeholder="${i18n.t('label_recovery_email')}" value="${state.ownerEmail || ''}" required autocomplete="email" />
        <input class="input-field ltr-num" type="text" name="recovery_code" placeholder="${i18n.t('label_recovery_code')}" maxlength="6" required autocomplete="one-time-code" />
        <input class="input-field" type="password" name="new_password" placeholder="${i18n.t('settings_new_password')}" required autocomplete="new-password" />
        <input class="input-field" type="password" name="confirm_password" placeholder="${i18n.t('label_confirm_password')}" required autocomplete="new-password" />
        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px;">
          ${i18n.t('action_verify_and_reset')}
        </button>
        <button type="button" class="btn" style="width: 100%; margin-top: 8px;" data-action="set-auth-mode" data-mode="login">
          ${i18n.t('action_back_to_login')}
        </button>
      </form>
    `;
  } else {
    formContent = `
      <h3 style="margin: 0 0 8px 0;">${isReg ? i18n.t('login_signin_title') : i18n.t('login_setup_title')}</h3>
      <p style="font-size: 13px; color: var(--text-muted); margin: 0 0 16px 0;">
        ${isReg ? i18n.t('login_signin_subtitle') : i18n.t('login_setup_subtitle')}
      </p>
      <form id="auth-form">
        <input class="input-field" type="text" name="username" placeholder="${i18n.t('label_username')}" value="${state.ownerUsername}" required autocomplete="username" />
        ${
          !isReg
            ? `<input class="input-field ltr-num" type="email" name="email" placeholder="${i18n.t('label_email')}" value="${state.ownerEmail || ''}" autocomplete="email" />`
            : ''
        }
        <input class="input-field" type="password" name="password" placeholder="${i18n.t('label_password')}" required autocomplete="${isReg ? 'current-password' : 'new-password'}" />
        ${
          !isReg
            ? `<input class="input-field" type="password" name="confirm_password" placeholder="${i18n.t('label_confirm_password')}" required autocomplete="new-password" />`
            : ''
        }
        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px;">
          ${isReg ? i18n.t('action_sign_in') : i18n.t('action_create_owner_account')}
        </button>
      </form>
      ${
        isReg
          ? `<div style="text-align: center; margin-top: 12px;">
               <button type="button" class="btn btn-sm" style="background: transparent; border: none; color: var(--primary); cursor: pointer;" data-action="set-auth-mode" data-mode="forgot_request">
                 ${i18n.t('action_forgot_password')}
               </button>
             </div>`
          : ''
      }
    `;
  }

  return `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;">
      <div class="card" style="max-width: 460px; width: 100%; padding: 28px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 26px; font-weight: 800; letter-spacing: 1px; color: var(--primary);">${i18n.t('app_name')}</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-top: 6px;">${i18n.t('app_subtitle')}</div>
          <div style="font-size: 11px; color: var(--bull); margin-top: 6px;">● ${i18n.t('sync_server_badge')}</div>
        </div>
        ${
          state.authInfoKey
            ? `<div style="background: rgba(16, 185, 129, 0.14); border: 1px solid var(--bull); color: var(--bull); padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; margin-bottom: 16px;">
                 ${i18n.t(state.authInfoKey)}
               </div>`
            : ''
        }
        ${
          state.authErrorKey
            ? `<div style="background: var(--bear-bg); border: 1px solid var(--bear); color: var(--bear); padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; margin-bottom: 16px;">
                 ${i18n.t(state.authErrorKey)}
               </div>`
            : ''
        }
        ${formContent}
        <div style="margin-top: 24px; border-top: 1px solid var(--border); padding-top: 16px;">
          ${renderLanguageThemeBar(i18n)}
        </div>
      </div>
    </div>
  `;
}
