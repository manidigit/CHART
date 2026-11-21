import { state, escapeHtml } from '../core/store.js?v=1.47.41';

/**
 * Multi-User Admin UI Card for Web Settings (Account tab).
 * Strictly visible only to authenticated `owner` or `admin` roles;
 * all privileged mutations are verified server-side by `api/v1/admin_users.php`.
 */
export function renderAdminUsersCard(i18n) {
  const role = String(state.userRole || 'owner').toLowerCase();
  if (role !== 'owner' && role !== 'admin') {
    return '';
  }

  const isFa = i18n.getCurrentLanguage() === 'fa';
  const adminState = state.adminUsers || {
    loading: false,
    loaded: false,
    error: '',
    users: [],
  };

  const roleBadge = (r) => {
    const clean = String(r || 'viewer').toLowerCase();
    const bg =
      clean === 'owner'
        ? 'rgba(41,98,255,0.16)'
        : clean === 'admin'
          ? 'rgba(245,158,11,0.16)'
          : 'rgba(148,163,184,0.16)';
    const color =
      clean === 'owner' ? 'var(--primary)' : clean === 'admin' ? 'var(--gold)' : 'var(--text-muted)';
    return `<span class="ltr-num" style="font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; background:${bg}; color:${color}; text-transform:uppercase;">${escapeHtml(clean)}</span>`;
  };

  const rowsHtml = adminState.loading
    ? `<div style="padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center;">${isFa ? 'در حال بارگذاری فهرست کاربران...' : 'Loading users...'}</div>`
    : !Array.isArray(adminState.users) || adminState.users.length === 0
      ? `<div style="padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center;">${
          adminState.loaded
            ? isFa
              ? 'کاربری در پایگاه‌داده ثبت نشده است.'
              : 'No users found in database.'
            : isFa
              ? 'برای مشاهده و مدیریت کاربران، دکمه «بروزرسانی» را بزنید.'
              : 'Click Refresh to load users from MariaDB.'
        }</div>`
      : adminState.users
          .map((u) => {
            const isOwnerRow = u.role === 'owner';
            const isSelf =
              String(u.username || '').toLowerCase() === String(state.ownerUsername || '').toLowerCase();
            const canManage =
              !isOwnerRow && !isSelf && (role === 'owner' || u.role === 'viewer');
            const safeUser = escapeHtml(u.username);
            const safeEmail = escapeHtml(u.email || '—');
            const safeId = Number(u.id) || 0;
            return `
              <div class="tv-settings-symbol-row" style="padding: 8px 10px; margin-bottom: 6px; align-items: flex-start; gap: 8px; flex-wrap: wrap;">
                <div style="min-width: 0; flex: 1 1 180px;">
                  <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <strong class="ltr-num" style="font-size: 12.5px; color: var(--text-strong);">${safeUser}</strong>
                    ${roleBadge(u.role)}
                    <span style="font-size:10px; font-weight:700; color:${u.is_active ? 'var(--bull)' : 'var(--bear)'};">
                      ${u.is_active ? (isFa ? '● فعال' : '● Active') : (isFa ? '● غیرفعال' : '● Disabled')}
                    </span>
                    ${isSelf ? `<span style="font-size:10px; color:var(--primary);">(${isFa ? 'شما' : 'You'})</span>` : ''}
                  </div>
                  <div class="ltr-num" style="font-size: 10.5px; color: var(--text-muted); margin-top: 2px;">
                    ${safeEmail} · ${isFa ? 'نشست‌های فعال:' : 'Sessions:'} ${Number(u.active_sessions || 0)}
                  </div>
                </div>

                ${
                  canManage
                    ? `
                  <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    ${
                      role === 'owner'
                        ? `<select class="input-field ltr-num" style="width:auto; min-height:28px; padding:2px 6px; font-size:11px;" data-action="admin-update-user-role" data-user-id="${safeId}">
                            <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>viewer</option>
                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
                          </select>`
                        : ''
                    }
                    <button type="button" class="btn btn-sm" data-action="admin-toggle-user-active" data-user-id="${safeId}" data-next-active="${u.is_active ? '0' : '1'}">
                      ${u.is_active ? (isFa ? 'غیرفعال‌سازی' : 'Disable') : (isFa ? 'فعال‌سازی' : 'Enable')}
                    </button>
                    <button type="button" class="btn btn-sm" data-action="admin-revoke-user-sessions" data-user-id="${safeId}" title="${isFa ? 'ابطال نشست‌ها' : 'Revoke sessions'}">
                      ${isFa ? 'خروج اجباری' : 'Revoke'}
                    </button>
                    <button type="button" class="btn btn-sm" style="color: var(--bear); border-color: var(--bear);" data-action="admin-delete-user" data-user-id="${safeId}" data-username="${safeUser}">
                      ${isFa ? 'حذف' : 'Delete'}
                    </button>
                  </div>`
                    : ''
                }
              </div>
            `;
          })
          .join('');

  return `
    <div class="card-subtle" style="margin-bottom: 12px;" data-testid="admin-users-card">
      <div class="row-between" style="margin-bottom: 10px; gap: 8px; flex-wrap: wrap;">
        <div>
          <h5 style="margin: 0; color: var(--text-strong);">${isFa ? 'مدیریت چندکاربره و نقش‌ها (Admin)' : 'Multi-User Access & Roles (Admin)'}</h5>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            ${isFa ? 'سطح دسترسی شما:' : 'Your role:'} ${roleBadge(role)}
          </div>
        </div>
        <button type="button" class="btn btn-sm" data-action="admin-refresh-users">
          ↻ ${isFa ? 'بروزرسانی فهرست' : 'Refresh Roster'}
        </button>
      </div>

      ${
        adminState.error
          ? `<div style="background: rgba(239, 83, 80, 0.14); border: 1px solid var(--bear); color: var(--bear); padding: 7px 10px; border-radius: 6px; font-size: 11.5px; margin-bottom: 10px;">
               ${escapeHtml(adminState.error)}
             </div>`
          : ''
      }

      <form id="admin-create-user-form" style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
        <div style="font-size: 11.5px; font-weight: 600; color: var(--text-strong); margin-bottom: 6px;">
          ${isFa ? 'افزودن کاربر جدید' : 'Add New User'}
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 8px; margin-bottom: 8px;">
          <input class="input-field ltr-num" type="text" name="username" minlength="3" maxlength="40" placeholder="${isFa ? 'نام کاربری (انگلیسی)' : 'Username'}" required />
          <input class="input-field ltr-num" type="email" name="email" placeholder="${isFa ? 'ایمیل (اختیاری)' : 'Email (optional)'}" />
          <input class="input-field" type="password" name="password" minlength="8" placeholder="${isFa ? 'رمز عبور (حداقل ۸ کاراکتر)' : 'Password (min 8 chars)'}" required />
          <select class="input-field ltr-num" name="role">
            <option value="viewer" selected>${isFa ? 'بیننده (viewer)' : 'Viewer (viewer)'}</option>
            ${role === 'owner' ? `<option value="admin">${isFa ? 'مدیر (admin)' : 'Admin (admin)'}</option>` : ''}
          </select>
        </div>
        <button type="submit" class="btn btn-sm btn-primary">
          + ${isFa ? 'ایجاد حساب کاربری' : 'Create User Account'}
        </button>
      </form>

      <div>${rowsHtml}</div>
    </div>
  `;
}
