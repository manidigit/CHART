import { state } from '../core/store.js?v=1.28.6';

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

        <!-- Open Symbol Overview & Seasonals Modal -->
        <button
          class="tv-rail-btn ${state.symbolOverviewCode ? 'active' : ''}"
          data-action="open-active-symbol-overview"
          title="${i18n.t('symbol_overview_seasonals')}"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        </button>
      </div>

      <div class="tv-right-rail-bottom">
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
