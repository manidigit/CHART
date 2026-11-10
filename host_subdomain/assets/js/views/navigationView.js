import { state } from '../core/store.js?v=1.28.7';

export function renderRightIconRail(i18n) {
  const isFa = i18n.getCurrentLanguage() === 'fa';
  return `
    <aside class="tv-right-rail" dir="ltr">
      <div class="tv-rail-group">
        <!-- 1. Watchlist & Symbol Details Split Panel Toggle -->
        <button
          class="tv-rail-btn ${state.isSideDrawerOpen ? 'active' : ''}"
          data-action="toggle-right-panel"
          title="${i18n.t('nav_watchlist')}"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="7" y1="8" x2="12" y2="8"/><line x1="7" y1="12" x2="12" y2="12"/><line x1="7" y1="16" x2="12" y2="16"/></svg>
        </button>

        <!-- 2. Chart & Symbol Seasonals Overview -->
        <button
          class="tv-rail-btn ${state.symbolOverviewCode ? 'active' : ''}"
          data-action="open-active-symbol-overview"
          title="${i18n.t('symbol_overview_seasonals')}"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        </button>

        <!-- 3. Prediction & Multi-Scenario Analysis -->
        <button
          class="tv-rail-btn ${state.activeModal === 'prediction' ? 'active' : ''}"
          data-action="open-modal"
          data-modal="prediction"
          title="${i18n.t('nav_prediction')}"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        </button>

        <!-- 4. Settings (Centered TradingView Modal) -->
        <button
          class="tv-rail-btn ${state.activeModal === 'settings' ? 'active' : ''}"
          data-action="open-modal"
          data-modal="settings"
          title="${i18n.t('nav_settings')}"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>

      <div class="tv-rail-group">
        <!-- Quick Language Switch (FA / EN) -->
        <button
          class="tv-rail-btn ltr-num"
          style="font-size: 11px; font-weight: 800;"
          data-action="toggle-lang-quick"
          title="Switch Language (FA / EN)"
        >
          ${isFa ? 'FA' : 'EN'}
        </button>

        <!-- Quick Theme Switch (Dark / Light) -->
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

export function renderBottomNav() {
  return '';
}
