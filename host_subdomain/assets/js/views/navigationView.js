import { state } from '../core/store.js';

export function renderBottomNav(i18n) {
  return `
    <nav class="bottom-nav">
      <button class="nav-item ${state.currentScreen === 'watchlist' ? 'active' : ''}" data-action="nav" data-screen="watchlist">
        <div class="nav-icon-pill">
          <svg viewBox="0 0 24 24"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>
        </div>
        <span>${i18n.t('nav_watchlist')}</span>
      </button>
      <button class="nav-item ${state.currentScreen === 'chart_view' ? 'active' : ''}" data-action="nav" data-screen="chart_view">
        <div class="nav-icon-pill">
          <svg viewBox="0 0 24 24"><path d="M9 4H7v2H5v12h2v2h2v-2h2V6H9V4zm0 12H7V8h2v8zm10-8h-2V4h-2v2h-2v8h2v6h2v-6h2V8zm-2 4h-2v-2h2v2z"/></svg>
        </div>
        <span>${i18n.t('nav_chart_view')}</span>
      </button>
      <button class="nav-item ${state.currentScreen === 'analysis' ? 'active' : ''}" data-action="nav" data-screen="analysis">
        <div class="nav-icon-pill">
          <svg viewBox="0 0 24 24"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>
        </div>
        <span>${i18n.t('nav_analysis')}</span>
      </button>
      <button class="nav-item ${state.currentScreen === 'settings' ? 'active' : ''}" data-action="nav" data-screen="settings">
        <div class="nav-icon-pill">
          <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
        </div>
        <span>${i18n.t('nav_settings')}</span>
      </button>
    </nav>
  `;
}
