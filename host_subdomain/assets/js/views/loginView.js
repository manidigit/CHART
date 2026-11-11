import { state } from '../core/store.js?v=1.30.0';

export function renderLoginScreen(i18n) {
  const isReg = state.isOwnerRegistered;
  const mode = state.authMode || 'login';
  const isFa = i18n.getCurrentLanguage() === 'fa';
  const pwType = state.showLoginPassword ? 'text' : 'password';

  const userIconSvg = `<span class="tv-input-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>`;
  const mailIconSvg = `<span class="tv-input-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></span>`;
  const lockIconSvg = `<span class="tv-input-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>`;
  const eyeToggleBtn = `
    <button type="button" class="tv-pw-toggle" data-action="toggle-password-vis" title="Show/Hide Password">
      ${
        state.showLoginPassword
          ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
          : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
      }
    </button>
  `;

  let formContent = '';
  if (mode === 'forgot_request') {
    formContent = `
      <div style="margin-bottom: 18px; text-align: center;">
        <div style="font-size: 16px; font-weight: 700; color: var(--text);">${i18n.t('forgot_password_title')}</div>
        <div style="font-size: 12.5px; color: var(--text-muted); margin-top: 4px;">${i18n.t('forgot_password_subtitle')}</div>
      </div>
      <form id="forgot-request-form">
        <div class="tv-input-group">
          <label class="tv-input-label">${i18n.t('label_recovery_email')}</label>
          <div class="tv-input-wrap">
            ${mailIconSvg}
            <input class="tv-input ltr-num" type="email" name="email" placeholder="owner@manico.es" value="${state.ownerEmail || ''}" required autocomplete="email" />
          </div>
        </div>
        <button type="submit" class="tv-auth-submit">
          ${i18n.t('action_send_recovery_code')}
        </button>
        <div style="text-align: center; margin-top: 12px;">
          <button type="button" class="tv-auth-link" data-action="set-auth-mode" data-mode="login">
            ${i18n.t('action_back_to_login')}
          </button>
        </div>
      </form>
    `;
  } else if (mode === 'forgot_verify') {
    formContent = `
      <div style="margin-bottom: 18px; text-align: center;">
        <div style="font-size: 16px; font-weight: 700; color: var(--text);">${i18n.t('forgot_password_title')}</div>
        <div style="font-size: 12.5px; color: var(--text-muted); margin-top: 4px;">${i18n.t('forgot_verify_subtitle')}</div>
      </div>
      <form id="forgot-verify-form">
        <div class="tv-input-group">
          <label class="tv-input-label">${i18n.t('label_recovery_email')}</label>
          <div class="tv-input-wrap">
            ${mailIconSvg}
            <input class="tv-input ltr-num" type="email" name="email" placeholder="${i18n.t('label_recovery_email')}" value="${state.ownerEmail || ''}" required autocomplete="email" />
          </div>
        </div>
        <div class="tv-input-group">
          <label class="tv-input-label">${i18n.t('label_recovery_code')}</label>
          <div class="tv-input-wrap">
            ${lockIconSvg}
            <input class="tv-input ltr-num" type="text" name="recovery_code" placeholder="6-digit code" maxlength="6" required autocomplete="one-time-code" />
          </div>
        </div>
        <div class="tv-input-group">
          <label class="tv-input-label">${i18n.t('settings_new_password')}</label>
          <div class="tv-input-wrap">
            ${lockIconSvg}
            <input class="tv-input" type="${pwType}" name="new_password" placeholder="••••••••" required autocomplete="new-password" />
            ${eyeToggleBtn}
          </div>
        </div>
        <div class="tv-input-group">
          <label class="tv-input-label">${i18n.t('label_confirm_password')}</label>
          <div class="tv-input-wrap">
            ${lockIconSvg}
            <input class="tv-input" type="${pwType}" name="confirm_password" placeholder="••••••••" required autocomplete="new-password" />
          </div>
        </div>
        <button type="submit" class="tv-auth-submit">
          ${i18n.t('action_verify_and_reset')}
        </button>
        <div style="text-align: center; margin-top: 12px;">
          <button type="button" class="tv-auth-link" data-action="set-auth-mode" data-mode="login">
            ${i18n.t('action_back_to_login')}
          </button>
        </div>
      </form>
    `;
  } else {
    formContent = `
      <div style="margin-bottom: 18px; text-align: center;">
        <div style="font-size: 15px; font-weight: 700; color: var(--text);">
          ${isReg ? i18n.t('login_signin_title') : i18n.t('login_setup_title')}
        </div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
          ${isReg ? i18n.t('login_signin_subtitle') : i18n.t('login_setup_subtitle')}
        </div>
      </div>

      <form id="auth-form">
        <div class="tv-input-group">
          <label class="tv-input-label">${i18n.t('label_username')}</label>
          <div class="tv-input-wrap">
            ${userIconSvg}
            <input class="tv-input ltr-num" type="text" name="username" placeholder="${i18n.t('label_username')}" value="${state.ownerUsername}" required autocomplete="username" />
          </div>
        </div>

        ${
          !isReg
            ? `
          <div class="tv-input-group">
            <label class="tv-input-label">${i18n.t('label_email')}</label>
            <div class="tv-input-wrap">
              ${mailIconSvg}
              <input class="tv-input ltr-num" type="email" name="email" placeholder="owner@manico.es" value="${state.ownerEmail || ''}" autocomplete="email" />
            </div>
          </div>
        `
            : ''
        }

        <div class="tv-input-group">
          <label class="tv-input-label">${i18n.t('label_password')}</label>
          <div class="tv-input-wrap">
            ${lockIconSvg}
            <input class="tv-input" type="${pwType}" name="password" placeholder="••••••••" value="${state.rememberCredentials ? state.savedPassword || '' : ''}" required autocomplete="${isReg ? 'current-password' : 'new-password'}" />
            ${eyeToggleBtn}
          </div>
        </div>

        ${
          !isReg
            ? `
          <div class="tv-input-group">
            <label class="tv-input-label">${i18n.t('label_confirm_password')}</label>
            <div class="tv-input-wrap">
              ${lockIconSvg}
              <input class="tv-input" type="${pwType}" name="confirm_password" placeholder="••••••••" required autocomplete="new-password" />
            </div>
          </div>
        `
            : ''
        }

        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12.5px; color: var(--text-muted); margin: 10px 0 4px 0; user-select: none;">
          <input
            type="checkbox"
            data-action="toggle-remember-creds"
            ${state.rememberCredentials ? 'checked' : ''}
            style="accent-color: var(--primary); width: 16px; height: 16px; cursor: pointer;"
          />
          <span>${i18n.t('login_remember_me')}</span>
        </label>

        <button type="submit" class="tv-auth-submit">
          ${isReg ? i18n.t('action_sign_in') : i18n.t('action_create_owner_account')}
        </button>
      </form>

      ${
        isReg
          ? `<div style="text-align: center; margin-top: 14px;">
               <button type="button" class="tv-auth-link" data-action="set-auth-mode" data-mode="forgot_request">
                 ${i18n.t('action_forgot_password')}
               </button>
             </div>`
          : ''
      }
    `;
  }

  return `
    <div class="tv-auth-screen">
      <div class="tv-auth-topbar" dir="ltr">
        <div class="tv-brand">
          <div class="tv-logo">CI</div>
          <span class="ltr-num" style="font-size: 13px; font-weight: 800; letter-spacing: 0.5px; color: var(--text);">CHART INTELLIGENCE</span>
        </div>

        <div class="tv-auth-controls-pill">
          <button type="button" class="tv-pill-btn ${isFa ? 'active' : ''}" data-action="set-lang" data-lang="fa">FA</button>
          <button type="button" class="tv-pill-btn ${!isFa ? 'active' : ''}" data-action="set-lang" data-lang="en">EN</button>
          <span style="width: 1px; height: 14px; background: var(--border); margin: 0 2px;"></span>
          <button type="button" class="tv-pill-btn ${state.isDarkTheme ? 'active' : ''}" data-action="set-theme" data-theme="dark" title="Dark Mode">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
          <button type="button" class="tv-pill-btn ${!state.isDarkTheme ? 'active' : ''}" data-action="set-theme" data-theme="light" title="Light Mode">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
          </button>
        </div>
      </div>

      <div class="tv-auth-card">
        <div class="tv-auth-brand">
          <div class="tv-auth-emblem">CI</div>
          <h1 class="tv-auth-title">${i18n.t('app_name')}</h1>
          <div class="tv-auth-sub">${i18n.t('app_subtitle')}</div>
          <div class="tv-auth-server-badge ltr-num">
            <span>●</span>
            <span>${i18n.t('sync_server_badge')}</span>
          </div>
        </div>

        ${
          state.authInfoKey
            ? `<div style="background: rgba(38, 166, 154, 0.14); border: 1px solid var(--bull); color: var(--bull); padding: 10px 14px; border-radius: 6px; font-size: 12.5px; margin-bottom: 14px;">
                 ${i18n.t(state.authInfoKey)}
               </div>`
            : ''
        }
        ${
          state.authErrorKey
            ? `<div style="background: var(--bear-bg); border: 1px solid var(--bear); color: var(--bear); padding: 10px 14px; border-radius: 6px; font-size: 12.5px; margin-bottom: 14px;">
                 ${i18n.t(state.authErrorKey)}
               </div>`
            : ''
        }

        ${formContent}
      </div>
    </div>
  `;
}
