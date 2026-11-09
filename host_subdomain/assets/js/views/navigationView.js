import { state } from '../core/store.js?v=1.28.4';

export function renderRightIconRail(i18n) {
  const isFa = i18n.getCurrentLanguage() === 'fa';
  return `
    <aside class="tv-right-rail" dir="ltr">
      <div class="tv-right-rail-top">
        <!-- Toggle Collapsible Watchlist & Details Panel -->
        <button
          class="tv-rail-btn ${state.isSideDrawerOpen ? 'active' : ''}"
          data-action="toggle-right-panel"
          title="${i18n.t('nav_watchlist')}"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="7" y1="8" x2="12" y2="8"/><line x1="7" y1="12" x2="12" y2="12"/><line x1="7" y1="16" x2="12" y2="16"/></svg>
        </button>

        <!-- Open Prediction & Pivot Scenarios Modal -->
        <button
          class="tv-rail-btn ${state.activeModal === 'prediction' ? 'active' : ''}"
          data-action="open-modal"
          data-modal="prediction"
          title="${i18n.t('nav_prediction')}"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        </button>

        <!-- Open Symbol Overview & Seasonals Modal -->
        <button
          class="tv-rail-btn ${state.symbolOverviewCode ? 'active' : ''}"
          data-action="open-active-symbol-overview"
          title="${i18n.t('symbol_overview_seasonals')}"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        </button>

        <!-- Open Settings Modal -->
        <button
          class="tv-rail-btn ${state.activeModal === 'settings' ? 'active' : ''}"
          data-action="open-modal"
          data-modal="settings"
          title="${i18n.t('nav_settings')}"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>

      <div class="tv-right-rail-bottom">
        <!-- Quick Language Switch -->
        <button
          class="tv-rail-btn ltr-num"
          style="font-size: 10.5px; font-weight: 800;"
          data-action="toggle-lang-quick"
          title="Switch Language (FA / EN)"
        >
          ${isFa ? 'FA' : 'EN'}
        </button>

        <!-- Quick Theme Switch -->
        <button
          class="tv-rail-btn"
          data-action="toggle-theme-quick"
          title="Toggle Dark / Light Theme"
        >
          ${state.isDarkTheme ? '🌙' : '☀️'}
        </button>

        <!-- Sign Out -->
        <button
          class="tv-rail-btn"
          style="color: var(--bear);"
          data-action="sign-out"
          title="${i18n.t('action_sign_out')}"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
      </div>
    </aside>
  `;
}

export function renderBottomNav(i18n) {
  return `
    <nav class="bottom-nav">
      <button class="nav-item ${state.isSideDrawerOpen ? 'active' : ''}" data-action="toggle-right-panel">
        <div class="nav-icon-pill">
          <svg viewBox="0 0 24 24"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>
        </div>
        <span>${i18n.t('nav_watchlist')}</span>
      </button>
      <button class="nav-item ${!state.isSideDrawerOpen && !state.activeModal ? 'active' : ''}" data-action="close-modal">
        <div class="nav-icon-pill">
          <svg viewBox="0 0 24 24"><path d="M9 4H7v2H5v12h2v2h2v-2h2V6H9V4zm0 12H7V8h2v8zm10-8h-2V4h-2v2h-2v8h2v6h2v-6h2V8zm-2 4h-2v-2h2v2z"/></svg>
        </div>
        <span>${i18n.t('nav_chart_view')}</span>
      </button>
      <button class="nav-item ${state.activeModal === 'prediction' ? 'active' : ''}" data-action="open-modal" data-modal="prediction">
        <div class="nav-icon-pill">
          <svg viewBox="0 0 24 24"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>
        </div>
        <span>${i18n.t('nav_prediction')}</span>
      </button>
      <button class="nav-item ${state.activeModal === 'settings' ? 'active' : ''}" data-action="open-modal" data-modal="settings">
        <div class="nav-icon-pill">
          <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
        </div>
        <span>${i18n.t('nav_settings')}</span>
      </button>
    </nav>
  `;
}
