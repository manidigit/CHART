import {
  state,
  PROVIDER_METHODS_CATALOG,
  getCachedOrAggregatedCandles,
  escapeHtml,
  getLocalByokKeys,
  getInstrumentSpec,
} from '../core/store.js?v=1.40.1';
import { renderSymbolBadge, getSymbolCategoryKey, getShortCategoryLabel } from './watchlistView.js?v=1.40.1';

export function renderLanguageThemeBar(i18n) {
  const isFa = i18n.getCurrentLanguage() === 'fa';
  return `
    <div class="row-between" style="font-size: 13px; gap: 10px; flex-wrap: wrap;">
      <div class="chip-group">
        <button type="button" class="chip ${isFa ? 'active' : ''}" data-action="set-lang" data-lang="fa">فارسی</button>
        <button type="button" class="chip ${!isFa ? 'active' : ''}" data-action="set-lang" data-lang="en">English</button>
      </div>
      <div class="chip-group">
        <button type="button" class="chip ${state.isDarkTheme ? 'active' : ''}" data-action="set-theme" data-theme="dark">${i18n.t('settings_theme_dark')}</button>
        <button type="button" class="chip ${!state.isDarkTheme ? 'active' : ''}" data-action="set-theme" data-theme="light">${i18n.t('settings_theme_light')}</button>
      </div>
    </div>
  `;
}

export function renderSettingsModal(i18n) {
  if (state.activeModal !== 'settings') return '';
  const p = state.chartPreferences;
  const isFa = i18n.getCurrentLanguage() === 'fa';
  const rawTab = state.settingsTab || 'sync';
  const tab =
    rawTab === 'sources' || rawTab === 'health'
      ? 'sync'
      : rawTab === 'appearance'
        ? 'theme'
        : rawTab === 'scales' || rawTab === 'params'
          ? 'chart'
          : rawTab;

  const explorerMode = state.sourceExplorerMode || 'by_source';
  const activeMethodId = state.selectedExplorerProvider || 'tvdatafeed';
  const activeMethod =
    PROVIDER_METHODS_CATALOG.find((m) => m.providerId === activeMethodId) || PROVIDER_METHODS_CATALOG[0];
  const searchQuery = String(state.symbolExplorerSearchQuery || '').trim().toUpperCase();

  const marketCat = state.settingsSourceCategory || 'ALL';
  const cleanCatLabel = (key, fallback) =>
    String(i18n.t(key) || fallback).replace(/\s*\([^)]*\)\s*/g, '').trim();
  const catScopeList = explorerMode === 'by_source' ? activeMethod.symbols : state.symbols;
  const marketCategories = [
    { key: 'ALL', label: cleanCatLabel('watchlist_cat_all', 'All') },
    { key: 'METALS', label: cleanCatLabel('watchlist_cat_metals', 'Metals') },
    { key: 'ENERGY', label: cleanCatLabel('watchlist_cat_energy', 'Energy') },
    { key: 'CRYPTO', label: cleanCatLabel('watchlist_cat_crypto', 'Crypto') },
    { key: 'INDICES', label: cleanCatLabel('watchlist_cat_indices', 'Indices') },
    { key: 'STOCKS', label: cleanCatLabel('watchlist_cat_stocks', 'Stocks') },
    { key: 'FX', label: cleanCatLabel('watchlist_cat_fx', 'Forex') },
  ].map((cat) => ({
    ...cat,
    count:
      cat.key === 'ALL'
        ? catScopeList.length
        : catScopeList.filter((item) => (item.category || getSymbolCategoryKey(item.symbolCode)) === cat.key).length,
  }));

  const marketCategoryOptionsHtml = marketCategories
    .map(
      (cat) => `
      <option value="${cat.key}" ${marketCat === cat.key ? 'selected' : ''}>
        ${cat.label} (${cat.count})
      </option>
    `
    )
    .join('');

  // Mode 1: Filter by Collection Method (Source -> Symbols filtered by Market Category)
  const providerOptionsHtml = PROVIDER_METHODS_CATALOG.map((m) => {
    const isSel = m.providerId === activeMethod.providerId;
    const catCount =
      marketCat === 'ALL'
        ? m.symbols.length
        : m.symbols.filter((s) => (s.category || getSymbolCategoryKey(s.symbolCode)) === marketCat).length;
    return `
      <option value="${m.providerId}" ${isSel ? 'selected' : ''}>
        ${m.badgeLabel} (${catCount})
      </option>
    `;
  }).join('');

  const filteredMethodSymbols = activeMethod.symbols.filter(
    (item) => marketCat === 'ALL' || (item.category || getSymbolCategoryKey(item.symbolCode)) === marketCat
  );

  const methodSpecCardHtml = `
    <details class="tv-accordion">
      <summary>
        <span>${isFa ? activeMethod.titleFa : activeMethod.titleEn} <span class="ltr-num" style="color: var(--primary); font-size: 11px; margin-inline-start: 6px;">${activeMethod.providerId}</span></span>
      </summary>
      <div class="tv-accordion-body" style="padding-top: 8px;">
        <div class="row-between" style="font-size: 11px; margin-bottom: 6px; color: var(--text-muted); flex-wrap: wrap; gap: 6px;">
          <span class="ltr-num">${activeMethod.methodType}</span>
          <span class="ltr-num">TF: <strong>${activeMethod.supportedTimeframes.join(' · ')}</strong></span>
        </div>
        <div style="font-size: 11.5px; color: var(--text); line-height: 1.5; margin-bottom: 6px;">
          ${isFa ? activeMethod.formulaFa : activeMethod.formulaEn}
        </div>
        <div class="ltr-num" style="font-size: 10px; color: var(--text-muted);">
          DB Key: <code>${activeMethod.storageKeyRule}</code>
        </div>
      </div>
    </details>
  `;

  const sourceSymbolsRowsHtml =
    tab !== 'sync'
      ? ''
      : filteredMethodSymbols.length === 0
        ? `<div style="padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center;">${isFa ? 'هیچ نمادی از این بازار در منبع انتخاب‌شده وجود ندارد.' : 'No symbols from this market category are available in this provider.'}</div>`
        : filteredMethodSymbols
            .map((item) => {
              const existingSym = state.symbols.find((s) => s.symbolCode === item.symbolCode);
              const tf = activeMethod.providerId === 'eia_brent_spot' ? 'D1' : (existingSym ? existingSym.timeframe : 'M15');
              const directCacheKey = `${item.symbolCode}_${activeMethod.providerId}_${tf}`;
              const directCached = state.candleCache && state.candleCache[directCacheKey];
              const barCount =
                existingSym && existingSym.activeProvider === activeMethod.providerId && existingSym.candles?.length
                  ? existingSym.candles.length
                  : Array.isArray(directCached)
                    ? directCached.length
                    : 0;
              const isInWatchlistWithThisSource =
                Boolean(existingSym && existingSym.inWatchlist && existingSym.activeProvider === activeMethod.providerId);
              const isInWatchlistOtherSource =
                Boolean(existingSym && existingSym.inWatchlist && existingSym.activeProvider !== activeMethod.providerId);
              const spec = getInstrumentSpec(item.symbolCode, activeMethod.providerId);
              const safeCode = escapeHtml(item.symbolCode);
              const safeItemTitle = escapeHtml(isFa ? item.titleFa : item.titleEn);

              return `
            <div class="tv-settings-symbol-row" style="padding: 8px 10px; margin-bottom: 6px;">
              <div class="tv-settings-symbol-left">
                ${renderSymbolBadge(item.symbolCode, 28)}
                <div style="min-width: 0;">
                  <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <strong style="font-size: 12.5px; color: var(--text-strong);">${safeItemTitle}</strong>
                    <span class="ltr-num" style="font-size: 10px; font-weight: 700; color: var(--primary); padding: 1px 5px; border-radius: 4px; background: var(--primary-soft);">${safeCode}</span>
                  </div>
                  <div class="ltr-num" style="font-size: 10.5px; color: var(--text-muted); margin-top: 1px;">
                    ${barCount > 0 ? `${barCount} bars cached` : (isFa ? 'آماده همگام‌سازی' : 'Ready to sync')} · ${escapeHtml(spec.providerTicker)} · ${escapeHtml(spec.priceBasis)} · ${escapeHtml(spec.sessionCalendar)} · ${escapeHtml(spec.volumeType)}
                  </div>
                </div>
              </div>

              <div class="tv-settings-symbol-actions">
                ${
                  isInWatchlistWithThisSource
                    ? `
                      <span style="font-size: 10.5px; font-weight: 700; color: var(--bull); padding: 2px 7px; border-radius: 5px; background: rgba(8,153,129,0.14);">
                        ✓ ${isFa ? 'فعال' : 'Active'}
                      </span>
                      <button
                        type="button"
                        class="btn btn-sm"
                        data-action="delta-sync-symbol"
                        data-symbol="${safeCode}"
                        title="${isFa ? 'دریافت کندل‌های جدید' : 'Delta Sync'}"
                      >
                        ↻
                      </button>
                    `
                    : `
                      <button
                        type="button"
                        class="btn btn-sm btn-primary"
                        data-action="activate-source-symbol"
                        data-provider="${escapeHtml(activeMethod.providerId)}"
                        data-symbol="${safeCode}"
                      >
                        ${
                          isInWatchlistOtherSource
                            ? (isFa ? `انتخاب ${escapeHtml(activeMethod.badgeLabel)}` : `Use ${escapeHtml(activeMethod.badgeLabel)}`)
                            : (isFa ? '+ افزودن' : '+ Add')
                        }
                      </button>
                    `
                }
              </div>
            </div>
          `;
            })
            .join('');

  // Mode 2: Search / Filter by Symbol (Filtered by Market Category + Query)
  const filteredSymbols =
    tab !== 'sync'
      ? []
      : state.symbols.filter((s) => {
          const matchesCat = marketCat === 'ALL' || getSymbolCategoryKey(s.symbolCode) === marketCat;
          if (!matchesCat) return false;
          if (!searchQuery) return true;
          const rawTitle = (s.customTitle || i18n.t('symbol_' + s.symbolCode) || '').toUpperCase();
          return s.symbolCode.toUpperCase().includes(searchQuery) || rawTitle.includes(searchQuery);
        });

  const symbolsList = filteredSymbols
    .map((s) => {
      const shortCategory = getShortCategoryLabel(s.symbolCode, i18n);
      const rawTitle = s.customTitle || i18n.t('symbol_' + s.symbolCode) || s.symbolCode;
      const cleanTitle = rawTitle.replace(/\s*\([A-Z0-9_]+\)\s*/g, '').trim() || rawTitle;
      const safeCode = escapeHtml(s.symbolCode);
      const safeTitle = escapeHtml(cleanTitle);
      const spec = getInstrumentSpec(s.symbolCode, s.activeProvider);
      return `
        <div class="tv-settings-symbol-row" style="padding: 8px 10px; margin-bottom: 6px;">
          <div class="tv-settings-symbol-left">
            ${renderSymbolBadge(s.symbolCode, 28)}
            <div style="min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <strong style="font-size: 12.5px; color: var(--text-strong);">${safeTitle}</strong>
                <span class="ltr-num" style="font-size: 10px; font-weight: 700; color: var(--primary); padding: 1px 5px; border-radius: 4px; background: var(--primary-soft);">${safeCode}</span>
              </div>
              <div class="ltr-num" style="font-size: 10.5px; color: var(--text-muted); margin-top: 1px;">
                ${escapeHtml(shortCategory)} · ${(s.candles || []).length} bars · ${escapeHtml(spec.providerTicker)} · ${escapeHtml(spec.timezone)} · ${escapeHtml(spec.volumeType)}
              </div>
            </div>
          </div>

          <div class="tv-settings-symbol-actions">
            <select
              class="input-field ltr-num"
              style="width: 175px; min-height: 28px; padding: 2px 6px; font-size: 11px;"
              data-action="select-provider-dropdown"
              data-symbol="${safeCode}"
            >
              ${s.allowedProviders
                .map(
                  (prov) => `
                  <option value="${escapeHtml(prov)}" ${s.activeProvider === prov ? 'selected' : ''}>
                    ${escapeHtml(i18n.t('provider_' + prov) || prov)}
                  </option>
                `
                )
                .join('')}
            </select>

            <button
              type="button"
              class="btn btn-sm"
              data-action="delta-sync-symbol"
              data-symbol="${safeCode}"
              title="${isFa ? 'دریافت کندل‌های جدید (Delta)' : 'Delta Sync'}"
            >
              ↻
            </button>

            <label class="tv-toggle-label" title="${i18n.t('nav_watchlist')}">
              <input
                type="checkbox"
                class="tv-toggle-input"
                data-action="toggle-watchlist"
                data-symbol="${safeCode}"
                ${s.inWatchlist ? 'checked' : ''}
              />
              <span class="tv-toggle-slider"></span>
            </label>

            ${
              s.isCustom
                ? `<button type="button" class="btn btn-sm" style="color: var(--bear); padding: 2px 7px;" data-action="delete-symbol" data-symbol="${safeCode}" title="Delete">✕</button>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');

  const chartSwitches = [
    { key: 'isLogScale', label: i18n.t('tv_log_scale') },
    { key: 'rememberLastChart', label: i18n.t('tv_remember_last_chart') },
    { key: 'hideTabBarInLandscape', label: i18n.t('tv_hide_tab_bar_landscape') },
    { key: 'showCountdownToBarClose', label: i18n.t('tv_show_countdown') },
    { key: 'showPrevCloseLine', label: i18n.t('tv_show_prev_close_line') },
    { key: 'showHighLowLabels', label: i18n.t('tv_show_high_low_labels') },
  ];

  const notificationSwitches = [
    { key: 'chartVibrations', label: i18n.t('tv_chart_vibrations') },
    { key: 'pickerVibrates', label: i18n.t('tv_picker_vibrates') },
    { key: 'showScrollMagnifier', label: i18n.t('tv_show_scroll_magnifier') },
    { key: 'showSymbolScreen', label: i18n.t('tv_show_symbol_screen') },
    { key: 'hideWatchlistLogos', label: i18n.t('tv_hide_logos') },
  ];

  const colorRows = [
    {
      target: 'bullColor',
      label: i18n.t('settings_color_bull'),
      value: p.bullColor || '#26A69A',
      palette: ['#26A69A', '#10B981', '#06B6D4', '#22C55E', '#D1D4DC'],
    },
    {
      target: 'bearColor',
      label: i18n.t('settings_color_bear'),
      value: p.bearColor || '#EF5350',
      palette: ['#EF5350', '#F43F5E', '#E11D48', '#F97316', '#A855F7'],
    },
    {
      target: 'trendColor',
      label: i18n.t('settings_color_trend'),
      value: p.trendColor || '#2962FF',
      palette: ['#2962FF', '#3B82F6', '#06B6D4', '#10B981', '#F59E0B'],
    },
    {
      target: 'hLineColor',
      label: i18n.t('settings_color_hline'),
      value: p.hLineColor || '#F59E0B',
      palette: ['#F59E0B', '#EAB308', '#2962FF', '#EC4899', '#26A69A'],
    },
    {
      target: 'vLineColor',
      label: i18n.t('settings_color_vline'),
      value: p.vLineColor || '#A855F7',
      palette: ['#A855F7', '#8B5CF6', '#EC4899', '#06B6D4', '#94A3B8'],
    },
  ];

  const sys = state.systemStatus;
  const isDbOnline = Boolean(sys && sys.database && sys.database.connected);
  const dbVer = sys && sys.database ? (sys.database.version || 'MariaDB 10.6.28') : 'MariaDB (Host cPanel)';
  const totalCandles = sys ? Number(sys.total_candles || 0).toLocaleString() : '5,000+';
  const serverUtc = sys ? (sys.server_time_utc || 'UTC Connected') : (new Date().toISOString().slice(11, 19) + ' UTC');
  const wsSynced = state.lastWorkspaceSyncedAt
    ? new Date(state.lastWorkspaceSyncedAt).toLocaleTimeString()
    : (isFa ? 'همگام‌سازی محلی' : 'Local Synced');

  const serverDiagCard = `
    <div class="card-subtle" style="margin-bottom: 10px; background: var(--bg); border: 1px solid var(--border); padding: 10px 14px; border-radius: 8px;">
      <div class="row-between" style="flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: ${isDbOnline ? 'var(--bull)' : 'var(--gold)'}; display: inline-block;"></span>
          <span style="font-size: 12.5px; font-weight: 700; color: var(--text-strong);">${isFa ? 'وضعیت سرور و همگام‌سازی ابری' : 'Server & Cloud Sync Status'}</span>
          <span class="ltr-num" style="font-size: 11px; color: var(--bull); font-weight: 700;">${totalCandles} bars</span>
          <span class="ltr-num" style="font-size: 11px; color: var(--primary);">· ${wsSynced}</span>
        </div>
        <button type="button" class="btn btn-sm btn-primary" data-action="sync-cloud-workspace" title="${isFa ? 'همگام‌سازی ابری خطوط، واچ‌لیست و تنظیمات' : 'Sync workspace to cloud'}">
          ${state.isWorkspaceSyncing ? (isFa ? 'در حال همگام‌سازی...' : 'Syncing...') : (isFa ? 'همگام‌سازی ابری' : 'Sync Cloud')}
        </button>
      </div>
    </div>

    <details class="tv-accordion">
      <summary>
        <span>${i18n.t('settings_technical_accordion') || 'Advanced Database & Technical Diagnostics'}</span>
      </summary>
      <div class="tv-accordion-body" style="padding-top: 10px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 8px; font-size: 11px;">
          <div style="background: var(--card-bg); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border);">
            <div style="color: var(--text-muted); font-size: 10px;">Database Engine</div>
            <div class="ltr-num" style="font-weight: 700; color: var(--text-strong);">${dbVer}</div>
          </div>
          <div style="background: var(--card-bg); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border);">
            <div style="color: var(--text-muted); font-size: 10px;">${isFa ? 'سیاست دریافت تاریخچه' : 'History Fetch Policy'}</div>
            <div class="ltr-num" style="font-weight: 700; color: var(--primary);">DB-First Delta Only</div>
          </div>
          <div style="background: var(--card-bg); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border);">
            <div style="color: var(--text-muted); font-size: 10px;">${isFa ? 'ساعت سرور UTC' : 'Server UTC'}</div>
            <div class="ltr-num" style="font-weight: 600; color: var(--text);">${serverUtc}</div>
          </div>
        </div>
        ${(() => {
          const activeTabObj = state.openTabs.find((t) => t.tabId === state.activeTabId) || state.openTabs[0];
          const diagSym = activeTabObj ? state.symbols.find((s) => s.symbolCode === activeTabObj.symbolCode) : state.symbols[0];
          const gap = (activeTabObj && activeTabObj.gapSummary) || (diagSym && diagSym.gapSummary) || null;
          const gapsFound = gap ? Number(gap.gaps_found ?? gap.gap_count ?? 0) : 0;
          const missingTotal = gap ? Number(gap.missing_bars_total ?? gap.totalMissingBars ?? 0) : 0;
          const integrityStr = gap && Number.isFinite(Number(gap.integrity_ratio))
            ? `${(Number(gap.integrity_ratio) * 100).toFixed(2)}%`
            : '—';
          const statusLabel = gap ? escapeHtml(String(gap.status || 'AUDITED')) : (isFa ? 'نیاز به بررسی' : 'Not Audited');
          return `
            <div class="row-between" style="margin-top: 10px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--card-bg); flex-wrap: wrap; gap: 8px;">
              <div style="font-size: 11px;">
                <div style="font-weight: 700; color: var(--text-strong);">
                  ${isFa ? 'ممیزی سلامت و گپ داده (ENG-03)' : 'Gap & Data Integrity Audit (ENG-03)'}
                </div>
                <div class="ltr-num" style="color: var(--text-muted); margin-top: 2px;">
                  ${diagSym ? escapeHtml(diagSym.symbolCode) : '—'} · ${activeTabObj ? escapeHtml(activeTabObj.timeframe) : 'M15'} · Status: <strong>${statusLabel}</strong> · Gaps: <strong>${gapsFound}</strong> (${missingTotal} bars) · Integrity: <strong>${integrityStr}</strong>
                </div>
              </div>
              <button type="button" class="btn btn-sm" data-action="audit-active-gap">
                🔍 ${isFa ? 'بررسی گپ و یکپارچگی' : 'Audit Gaps'}
              </button>
            </div>
          `;
        })()}
      </div>
    </details>

    <details class="tv-accordion">
      <summary>
        <span>🛡️ ${i18n.t('settings_backup_title') || (isFa ? 'پشتیبان‌گیری و بازیابی رمزنگاری‌شده (AES-256-GCM)' : 'Encrypted Backup & Restore (AES-256-GCM)')}</span>
      </summary>
      <div class="tv-accordion-body" style="padding-top: 8px;">
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">
          ${i18n.t('settings_backup_subtitle') || (isFa ? 'خروجی و بازیابی کل فضای کاری با رمزنگاری PBKDF2-HMAC-SHA256 + AES-256-GCM بدون ذخیره کلیدهای API.' : 'Export/restore full workspace archive using PBKDF2-HMAC-SHA256 + AES-256-GCM; BYOK keys remain strictly device-local.')}
        </div>
        ${
          state.backupStatusMessage
            ? `<div class="ltr-num" style="font-size: 11px; padding: 6px 10px; border-radius: 6px; margin-bottom: 8px; background: rgba(38,166,154,0.12); border: 1px solid var(--bull); color: var(--text-strong);">${escapeHtml(state.backupStatusMessage)}</div>`
            : ''
        }
        <form id="backup-export-form" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 10px;">
          <input id="backup-export-passphrase" type="password" minlength="8" class="input-field ltr-num" style="flex: 1; min-width: 180px; height: 32px; font-size: 11.5px;" placeholder="${isFa ? 'عبارت عبور پشتیبان (حداقل ۸ کاراکتر)' : 'Backup passphrase (min 8 chars)'}" required autocomplete="off" />
          <button type="submit" class="btn btn-sm btn-primary">
            🔒 ${i18n.t('settings_backup_export_btn') || (isFa ? 'دانلود پشتیبان (.cibak.json)' : 'Export Backup (.cibak.json)')}
          </button>
        </form>
        <form id="backup-restore-form" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding-top: 8px; border-top: 1px dashed var(--border);">
          <input id="backup-restore-file" type="file" accept=".json,.cibak.json,application/json" class="input-field" style="flex: 1; min-width: 180px; font-size: 11px; padding: 4px;" required />
          <input id="backup-restore-passphrase" type="password" minlength="8" class="input-field ltr-num" style="flex: 1; min-width: 160px; height: 32px; font-size: 11.5px;" placeholder="${isFa ? 'رمز فایل پشتیبان' : 'Restore passphrase'}" required autocomplete="off" />
          <button type="submit" class="btn btn-sm">
            🔓 ${i18n.t('settings_backup_restore_btn') || (isFa ? 'بازیابی نسخه پشتیبان' : 'Restore Backup')}
          </button>
        </form>
      </div>
    </details>
  `;

  const localByok = getLocalByokKeys();
  const byokCard = `
    <details class="tv-accordion">
      <summary>
        <span>🔑 ${i18n.t('settings_byok_title')}</span>
      </summary>
      <div class="tv-accordion-body" style="padding-top: 8px;">
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">${i18n.t('settings_byok_subtitle')}</div>
        <form id="settings-byok-form" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px;">
          <div>
            <label style="display: block; font-size: 10.5px; color: var(--text-muted); margin-bottom: 3px;">Twelve Data API Key (XAUUSD / Global)</label>
            <input id="byok-twelve-data" type="password" class="input-field ltr-num" style="height: 30px; font-size: 11.5px;" placeholder="e.g. 9f8a7b6c5d4e..." value="${escapeHtml(localByok.twelveDataApiKey || '')}" autocomplete="off" />
          </div>
          <div>
            <label style="display: block; font-size: 10.5px; color: var(--text-muted); margin-bottom: 3px;">Stooq API Key (Optional EOD D1/W1)</label>
            <input id="byok-stooq" type="password" class="input-field ltr-num" style="height: 30px; font-size: 11.5px;" placeholder="Optional Stooq Key..." value="${escapeHtml(localByok.stooqApiKey || '')}" autocomplete="off" />
          </div>
          <div>
            <label style="display: block; font-size: 10.5px; color: var(--text-muted); margin-bottom: 3px;">Alpha Vantage API Key (Backup)</label>
            <input id="byok-alphavantage" type="password" class="input-field ltr-num" style="height: 30px; font-size: 11.5px;" placeholder="Optional Alpha Vantage Key..." value="${escapeHtml(localByok.alphaVantageApiKey || '')}" autocomplete="off" />
          </div>
          <div>
            <label style="display: block; font-size: 10.5px; color: var(--text-muted); margin-bottom: 3px;">Finnhub API Key (Backup)</label>
            <input id="byok-finnhub" type="password" class="input-field ltr-num" style="height: 30px; font-size: 11.5px;" placeholder="Optional Finnhub Key..." value="${escapeHtml(localByok.finnhubApiKey || '')}" autocomplete="off" />
          </div>
          <div style="grid-column: 1 / -1; display: flex; justify-content: flex-end; margin-top: 2px;">
            <button type="submit" class="btn btn-sm btn-primary">${i18n.t('settings_byok_save')}</button>
          </div>
        </form>
      </div>
    </details>
  `;

  let bodyHtml = '';
  if (tab === 'sync') {
    bodyHtml = `
      ${serverDiagCard}
      ${byokCard}

      <div class="card-subtle" style="margin-bottom: 10px;">
        <div class="row-between" style="margin-bottom: 8px; gap: 8px; flex-wrap: wrap;">
          <h4 style="margin: 0; font-size: 13.5px; color: var(--text-strong);">${i18n.t('settings_group_sources')}</h4>
          <div class="chip-group">
            <button
              type="button"
              class="chip ${explorerMode === 'by_source' ? 'active' : ''}"
              data-action="set-explorer-mode"
              data-mode="by_source"
            >
              ${isFa ? 'بر اساس منبع' : 'By Source'}
            </button>
            <button
              type="button"
              class="chip ${explorerMode === 'by_symbol' ? 'active' : ''}"
              data-action="set-explorer-mode"
              data-mode="by_symbol"
            >
              ${isFa ? 'بر اساس نماد' : 'By Symbol'}
            </button>
          </div>
        </div>

        <div class="tv-source-filters-grid">
          <div class="tv-combo-field">
            <label class="tv-combo-label" for="settings-source-category-select">
              ${i18n.t('settings_source_category_label') || (isFa ? 'دسته‌بندی بازار' : 'Market Category')}
            </label>
            <select
              id="settings-source-category-select"
              class="input-field tv-combo-select"
              data-action="set-settings-source-category-select"
              dir="auto"
            >
              ${marketCategoryOptionsHtml}
            </select>
          </div>
          ${
            explorerMode === 'by_source'
              ? `
                <div class="tv-combo-field">
                  <label class="tv-combo-label" for="settings-source-provider-select">
                    ${isFa ? 'منبع جمع‌آوری داده' : 'Data Source / Provider'}
                  </label>
                  <select
                    id="settings-source-provider-select"
                    class="input-field tv-combo-select ltr-num"
                    data-action="select-explorer-provider-select"
                  >
                    ${providerOptionsHtml}
                  </select>
                </div>
              `
              : `
                <div class="tv-combo-field">
                  <label class="tv-combo-label" for="settings-symbol-search-input">
                    ${isFa ? 'جستجو و افزودن نماد' : 'Search & Add Symbol'}
                  </label>
                  <div style="display: flex; gap: 6px; align-items: center;">
                    <input
                      id="settings-symbol-search-input"
                      type="text"
                      class="input-field"
                      style="flex: 1; min-width: 120px; min-height: 34px; font-size: 12px;"
                      placeholder="${isFa ? 'جستجوی کد یا نام نماد...' : 'Search symbol code or name...'}"
                      value="${escapeHtml(state.symbolExplorerSearchQuery || '')}"
                      data-action="search-explorer-symbol"
                    />
                    <button type="button" class="btn btn-primary" style="min-height: 34px;" data-action="open-add-symbol-modal">
                      + ${i18n.t('settings_add_custom_symbol')}
                    </button>
                  </div>
                </div>
              `
          }
        </div>

        ${
          explorerMode === 'by_source'
            ? `
              ${methodSpecCardHtml}
              <div class="row-between" style="margin-bottom: 8px; gap: 8px; flex-wrap: wrap;">
                <span style="font-size: 12px; font-weight: 700; color: var(--text-strong);">
                  ${activeMethod.badgeLabel} (${filteredMethodSymbols.length})
                </span>
                ${
                  marketCat !== 'ALL' && filteredMethodSymbols.length > 0
                    ? `<button type="button" class="btn btn-sm" data-action="apply-category-provider" data-provider="${activeMethod.providerId}" data-category="${marketCat}">
                         ✓ ${i18n.t('settings_source_batch_label')}: ${marketCat} → ${activeMethod.badgeLabel}
                       </button>`
                    : ''
                }
              </div>
              ${sourceSymbolsRowsHtml}
            `
            : `
              ${symbolsList}
            `
        }
      </div>
    `;
  } else if (tab === 'theme') {
    bodyHtml = `
      <div class="card-subtle" style="margin-bottom: 12px;">
        <h5 style="margin: 0 0 10px 0; color: var(--text-strong);">${i18n.t('settings_group_appearance')}</h5>
        ${renderLanguageThemeBar(i18n)}
      </div>

      <div class="card-subtle" style="margin-bottom: 12px;">
        <div class="row-between" style="margin-bottom: 12px;">
          <h5 style="margin: 0; color: var(--text-strong);">${i18n.t('settings_group_colors')}</h5>
          <button type="button" class="btn btn-sm" data-action="reset-chart-colors">
            ↺ ${i18n.t('action_reset_defaults')}
          </button>
        </div>

        <div class="row-between" style="gap: 18px; flex-wrap: wrap; align-items: flex-start;">
          <div style="flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 10px;">
            ${colorRows
              .map(
                (row) => `
                <div class="row-between" style="gap: 10px;">
                  <span style="font-size: 12px; font-weight: 600; color: var(--text);">${row.label}</span>
                  <div class="color-picker-row">
                    ${row.palette
                      .map(
                        (c) =>
                          `<div class="color-dot ${row.value.toUpperCase() === c.toUpperCase() ? 'active' : ''}" style="background: ${c};" data-action="set-color" data-target="${row.target}" data-color="${c}"></div>`
                      )
                      .join('')}
                  </div>
                </div>
              `
              )
              .join('')}
          </div>

          <div style="background: #131722; border: 1px solid #2A2E39; border-radius: 8px; padding: 12px 18px; min-width: 145px; text-align: center;">
            <div class="ltr-num" style="font-size: 10px; color: #787B86; margin-bottom: 6px; font-weight: 700;">LIVE PREVIEW</div>
            <svg width="110" height="84" viewBox="0 0 110 84" style="display: block; margin: 0 auto;">
              <line x1="82" y1="4" x2="82" y2="80" stroke="${p.vLineColor || '#A855F7'}" stroke-width="1.2" stroke-dasharray="3 3"/>
              <line x1="6" y1="44" x2="104" y2="44" stroke="${p.hLineColor || '#F59E0B'}" stroke-width="1.3" stroke-dasharray="4 2"/>
              <line x1="12" y1="68" x2="96" y2="18" stroke="${p.trendColor || '#2962FF'}" stroke-width="2"/>
              <line x1="22" y1="18" x2="22" y2="66" stroke="${p.bullColor}" stroke-width="1.6"/>
              <rect x="16" y="28" width="12" height="26" fill="${p.bullColor}" rx="1.5"/>
              <line x1="54" y1="14" x2="54" y2="62" stroke="${p.bearColor}" stroke-width="1.6"/>
              <rect x="48" y="22" width="12" height="28" fill="${p.bearColor}" rx="1.5"/>
              <line x1="82" y1="10" x2="82" y2="56" stroke="${p.bullColor}" stroke-width="1.6"/>
              <rect x="76" y="16" width="12" height="28" fill="${p.bullColor}" rx="1.5"/>
            </svg>
          </div>
        </div>

        <div class="row-between" style="margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); flex-wrap: wrap; gap: 8px;">
          <span style="font-size: 12px; font-weight: 600; color: var(--text);">
            ${isFa ? 'ضخامت پیش‌فرض خطوط ترسیمی (پایدار در حافظه):' : 'Default Drawing Line Width (Persistent):'}
          </span>
          <div class="chip-group ltr-num">
            ${[1, 2, 3, 4]
              .map(
                (wVal) =>
                  `<button type="button" class="chip ${Math.round(Number(p.defaultDrawingWidthPx || 2)) === wVal ? 'active' : ''}" data-action="set-default-draw-width" data-width="${wVal}">${wVal}px</button>`
              )
              .join('')}
          </div>
        </div>

        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end;">
          <button type="button" class="btn btn-sm" style="color: var(--bear); border-color: var(--bear);" data-action="reset-all-defaults">
            ↺ ${isFa ? 'بازنشانی تمامی تنظیمات و رنگ‌ها به حالت اولیه (Reset All)' : 'Reset All Settings & Colors to Factory Defaults'}
          </button>
        </div>
      </div>

      <div class="card-subtle">
        <h5 style="margin: 0 0 6px 0; color: var(--text-strong);">${i18n.t('settings_group_about')}</h5>
        <div class="ltr-num" style="font-size: 12px; color: var(--primary); font-weight: 600;">
          ${i18n.t('settings_about_version')}
        </div>
        <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px;">
          ${i18n.t('settings_about_desc')}
        </div>
      </div>
    `;
  } else if (tab === 'chart') {
    bodyHtml = `
      <div class="card-subtle" style="margin-bottom: 12px;">
        <div class="row-between" style="margin-bottom: 10px;">
          <h5 style="margin: 0; color: var(--text-strong);">${i18n.t('settings_group_params')}</h5>
          <button type="button" class="btn btn-sm" data-action="reset-algo-params">
            ↺ ${i18n.t('action_reset_defaults')}
          </button>
        </div>

        <div style="margin-bottom: 14px;">
          <div class="row-between" style="font-size: 12px; margin-bottom: 4px;">
            <span>${i18n.t('settings_param_fetch_limit')}</span>
            <strong id="fetch-limit-value-label" class="ltr-num" style="color: var(--primary); font-size: 13px;">${p.candleFetchLimit || 500}</strong>
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
          <div class="row-between ltr-num" style="font-size: 10px; color: var(--text-dim);">
            <span>40</span><span>500</span><span>1500</span><span>3000</span><span>5000</span>
          </div>
        </div>

        <div style="margin-bottom: 14px;">
          <div class="row-between" style="font-size: 12px; margin-bottom: 4px;">
            <span>${i18n.t('settings_param_zoom_step')}</span>
            <strong id="zoom-step-value-label" class="ltr-num" style="color: var(--primary); font-size: 13px;">${p.zoomStepCandles || 8}</strong>
          </div>
          <input
            type="range"
            min="2"
            max="30"
            step="1"
            value="${p.zoomStepCandles || 8}"
            data-action="set-zoom-step"
            style="width: 100%; accent-color: var(--primary); cursor: pointer;"
          />
          <div class="row-between ltr-num" style="font-size: 10px; color: var(--text-dim);">
            <span>2</span><span>8</span><span>15</span><span>22</span><span>30</span>
          </div>
        </div>

        <div>
          <div class="row-between" style="font-size: 12px; margin-bottom: 4px;">
            <span>${i18n.t('settings_param_hit_tolerance')}</span>
            <strong id="hit-tolerance-value-label" class="ltr-num" style="color: var(--primary); font-size: 13px;">${p.drawingHitTolerancePx || 28} px</strong>
          </div>
          <input
            type="range"
            min="12"
            max="60"
            step="2"
            value="${p.drawingHitTolerancePx || 28}"
            data-action="set-hit-tolerance"
            style="width: 100%; accent-color: var(--primary); cursor: pointer;"
          />
          <div class="row-between ltr-num" style="font-size: 10px; color: var(--text-dim);">
            <span>12px</span><span>28px</span><span>44px</span><span>60px</span>
          </div>
        </div>

        <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--border);">
          <div class="row-between" style="font-size: 12px; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
            <span>${isFa ? 'دوره پیش‌فرض باند بولینگر (Bollinger Period):' : 'Default Bollinger Bands Period:'}</span>
            <div class="chip-group ltr-num">
              ${[10, 14, 20, 30, 50]
                .map(
                  (pVal) =>
                    `<button type="button" class="chip ${Number(p.bollingerPeriod || 20) === pVal ? 'active' : ''}" data-action="set-bb-period" data-period="${pVal}">${pVal}</button>`
                )
                .join('')}
            </div>
          </div>
          <div class="row-between" style="font-size: 12px; flex-wrap: wrap; gap: 6px;">
            <span>${isFa ? 'ضریب انحراف معیار بولینگر (StdDev Multiplier):' : 'Bollinger StdDev Multiplier:'}</span>
            <div class="chip-group ltr-num">
              ${[1.5, 2.0, 2.5, 3.0]
                .map(
                  (sdVal) =>
                    `<button type="button" class="chip ${Math.abs(Number(p.bollingerStdDev || 2.0) - sdVal) < 0.05 ? 'active' : ''}" data-action="set-bb-stddev" data-stddev="${sdVal}">${sdVal}σ</button>`
                )
                .join('')}
            </div>
          </div>
        </div>

        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end;">
          <button type="button" class="btn btn-sm" style="color: var(--bear); border-color: var(--bear);" data-action="reset-all-defaults">
            ↺ ${isFa ? 'بازنشانی تمامی تنظیمات و رنگ‌ها به حالت اولیه (Reset All)' : 'Reset All Settings & Colors to Factory Defaults'}
          </button>
        </div>
      </div>

      <div class="card-subtle">
        <h5 style="margin: 0 0 8px 0; color: var(--text-strong);">${i18n.t('settings_tv_preferences_title')}</h5>

        <div class="tv-switch-row" style="padding: 6px 0;">
          <span class="tv-switch-title">${i18n.t('settings_timezone_label') || 'Chart Clock & X-Axis Timezone'}</span>
          <div class="chip-group ltr-num">
            <button
              type="button"
              class="chip ${(p.timezoneMode || 'UTC') !== 'LOCAL' ? 'active' : ''}"
              data-action="set-timezone-mode"
              data-tz="UTC"
            >
              ${i18n.t('settings_timezone_utc') || 'UTC'}
            </button>
            <button
              type="button"
              class="chip ${(p.timezoneMode || 'UTC') === 'LOCAL' ? 'active' : ''}"
              data-action="set-timezone-mode"
              data-tz="LOCAL"
            >
              ${i18n.t('settings_timezone_local') || 'Local'}
            </button>
          </div>
        </div>

        ${chartSwitches
          .map(
            (sw) => `
          <div class="tv-switch-row">
            <span class="tv-switch-title">${sw.label}</span>
            <label class="tv-toggle-label">
              <input
                type="checkbox"
                class="tv-toggle-input"
                data-action="toggle-tv-pref"
                data-pref-key="${sw.key}"
                ${p[sw.key] ? 'checked' : ''}
              />
              <span class="tv-toggle-slider"></span>
            </label>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  } else if (tab === 'notifications') {
    bodyHtml = `
      <div class="card-subtle">
        <h5 style="margin: 0 0 4px 0; color: var(--text-strong);">${i18n.t('settings_section_notifications_title')}</h5>
        <div style="font-size: 11.5px; color: var(--text-muted); margin-bottom: 10px;">${i18n.t('settings_section_notifications_hint')}</div>
        ${notificationSwitches
          .map(
            (sw) => `
          <div class="tv-switch-row">
            <span class="tv-switch-title">${sw.label}</span>
            <label class="tv-toggle-label">
              <input
                type="checkbox"
                class="tv-toggle-input"
                data-action="toggle-tv-pref"
                data-pref-key="${sw.key}"
                ${p[sw.key] ? 'checked' : ''}
              />
              <span class="tv-toggle-slider"></span>
            </label>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  } else {
    bodyHtml = `
      <div class="card-subtle" style="margin-bottom: 12px;">
        <div class="row-between" style="margin-bottom: 12px;">
          <div>
            <h5 style="margin: 0; color: var(--text-strong);">${i18n.t('settings_group_account')}</h5>
            <div class="ltr-num" style="font-size: 11.5px; color: var(--primary); margin-top: 2px;">${escapeHtml(state.ownerUsername || 'Owner')}</div>
          </div>
          <button type="button" class="btn btn-sm" style="color: var(--bear); border-color: var(--bear);" data-action="sign-out">
            ${i18n.t('action_sign_out')}
          </button>
        </div>

        <form id="settings-email-form" style="margin-bottom: 12px;">
          <label class="tv-input-label">${i18n.t('label_recovery_email')}</label>
          <div style="display: flex; gap: 8px;">
            <input class="input-field ltr-num" type="email" name="recovery_email" placeholder="${i18n.t('label_recovery_email')}" value="${escapeHtml(state.ownerEmail || '')}" required />
            <button type="submit" class="btn btn-sm btn-primary" style="flex-shrink: 0;">
              ${i18n.t('action_save_email')}
            </button>
          </div>
        </form>

        <form id="settings-password-form">
          <label class="tv-input-label">${i18n.t('settings_new_password')}</label>
          <div style="display: flex; gap: 8px;">
            <input class="input-field" type="password" name="new_password" placeholder="${i18n.t('settings_new_password')}" required />
            <button type="submit" class="btn btn-sm" style="flex-shrink: 0;">
              ${i18n.t('settings_change_password')}
            </button>
          </div>
        </form>
      </div>
    `;
  }

  return `
    <div class="modal-backdrop" data-action="close-modal-backdrop">
      <div class="modal-card">
        <div class="tv-modal-header">
          <div class="tv-modal-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>${i18n.t('nav_settings')}</span>
          </div>
          <button type="button" class="btn btn-sm btn-icon" data-action="close-modal">✕</button>
        </div>

        <div class="tv-modal-tabs">
          <button type="button" class="tv-modal-tab ${tab === 'sync' ? 'active' : ''}" data-action="set-settings-tab" data-tab="sync">
            ${i18n.t('settings_cat_sync')}
          </button>
          <button type="button" class="tv-modal-tab ${tab === 'chart' ? 'active' : ''}" data-action="set-settings-tab" data-tab="chart">
            ${i18n.t('settings_cat_chart')}
          </button>
          <button type="button" class="tv-modal-tab ${tab === 'notifications' ? 'active' : ''}" data-action="set-settings-tab" data-tab="notifications">
            ${i18n.t('settings_cat_notifications')}
          </button>
          <button type="button" class="tv-modal-tab ${tab === 'theme' ? 'active' : ''}" data-action="set-settings-tab" data-tab="theme">
            ${i18n.t('settings_cat_theme')}
          </button>
          <button type="button" class="tv-modal-tab ${tab === 'account' ? 'active' : ''}" data-action="set-settings-tab" data-tab="account">
            ${i18n.t('settings_cat_account')}
          </button>
        </div>

        <div class="tv-modal-body">
          ${
            state.statusBannerKey
              ? `<div style="background: rgba(38, 166, 154, 0.14); border: 1px solid var(--bull); color: var(--bull); padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 12px;">
                   ${i18n.t(state.statusBannerKey)}
                 </div>`
              : ''
          }
          ${bodyHtml}
        </div>
      </div>
    </div>
  `;
}

export const renderSettingsContent = renderSettingsModal;
