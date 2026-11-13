const PHASE2_TOOL_DEFS = [
  { id: 'avwap', shortLabel: 'AVWAP', anchors: 1 },
  { id: 'regression_channel', shortLabel: 'Reg Ch.', anchors: 2 },
  { id: 'frvp', shortLabel: 'FRVP', anchors: 2 },
  { id: 'gann_fan', shortLabel: 'Gann Fan', anchors: 2 },
  { id: 'gann_box', shortLabel: 'Gann Box', anchors: 2 },
  { id: 'pitchfork', shortLabel: 'Pitchfork', anchors: 3 },
  { id: 'fib_time_zone', shortLabel: 'Fib Time', anchors: 2 },
  { id: 'cyclic_lines', shortLabel: 'Cycles', anchors: 2 },
  { id: 'fib_speed_fan', shortLabel: 'Speed Fan', anchors: 2 },
  { id: 'abcd_pattern', shortLabel: 'ABCD', anchors: 4 },
  { id: 'xabcd_pattern', shortLabel: 'XABCD', anchors: 5 },
  { id: 'head_shoulders', shortLabel: 'H & S', anchors: 5 },
];

const PITCHFORK_VARIANTS = [
  { id: 'original', label: 'Original' },
  { id: 'schiff', label: 'Schiff' },
  { id: 'mod_schiff', label: 'Mod Schiff' },
  { id: 'inside', label: 'Inside' },
];

export function renderLeftToolRail(activeTab, i18n, activeRailPopup = null) {
  if (!activeTab) return '';
  const tool = activeTab.activeTool || activeTab.activeDrawingTool || 'cursor';
  const curColor = activeTab.activeDrawingColorHex || activeTab.activeDrawingColor || '#2962FF';
  const curWidth = Number(activeTab.activeDrawingWidthPx || activeTab.activeDrawingWidth || 2.0);
  const isMagnet = !!activeTab.isMagnetMode;
  const pfVariant = String(activeTab.pitchforkVariant || 'original');
  const isPhase2Active = PHASE2_TOOL_DEFS.some((p) => p.id === tool);
  const pendingCount = Array.isArray(activeTab.pendingAnchors) ? activeTab.pendingAnchors.length : 0;
  const colors = ['#2962FF', '#26A69A', '#F59E0B', '#EF5350', '#A855F7', '#D1D4DC'];
  const widths = [1.0, 2.0, 3.0, 4.0];

  return `
    <aside class="left-tool-rail">
      <button class="btn btn-icon ${tool === 'cursor' ? 'active' : ''}" data-action="set-tool" data-tool="cursor" title="${i18n.t('draw_tool_cursor')}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v6m0 8v6M2 12h6m8 0h6"/></svg>
      </button>
      <button class="btn btn-icon ${tool === 'trend' || tool === 'trend_line' ? 'active' : ''}" data-action="set-tool" data-tool="trend_line" title="${i18n.t('draw_tool_trend')}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/></svg>
      </button>
      <button class="btn btn-icon ${tool === 'fib' || tool === 'fib_retracement' ? 'active' : ''}" data-action="set-tool" data-tool="fib_retracement" title="${i18n.t('draw_tool_fib')}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="3" y1="5" x2="21" y2="5"/><line x1="3" y1="10" x2="21" y2="10" stroke="#F59E0B"/><line x1="3" y1="14" x2="21" y2="14" stroke="#F59E0B"/><line x1="3" y1="19" x2="21" y2="19"/><line x1="4" y1="19" x2="20" y2="5" stroke="#2962FF" stroke-dasharray="2 2"/></svg>
      </button>
      <button class="btn btn-icon ${tool === 'long_position' ? 'active' : ''}" data-action="set-tool" data-tool="long_position" title="${i18n.t('draw_tool_long_pos')}">
        <svg width="16" height="16" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="9" fill="#26A69A" opacity="0.9" rx="1"/><rect x="3" y="12" width="18" height="9" fill="#EF5350" opacity="0.9" rx="1"/><line x1="3" y1="12" x2="21" y2="12" stroke="#FFFFFF" stroke-width="1.5"/></svg>
      </button>
      <button class="btn btn-icon ${tool === 'short_position' ? 'active' : ''}" data-action="set-tool" data-tool="short_position" title="${i18n.t('draw_tool_short_pos')}">
        <svg width="16" height="16" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="9" fill="#EF5350" opacity="0.9" rx="1"/><rect x="3" y="12" width="18" height="9" fill="#26A69A" opacity="0.9" rx="1"/><line x1="3" y1="12" x2="21" y2="12" stroke="#FFFFFF" stroke-width="1.5"/></svg>
      </button>
      <button class="btn btn-icon ${tool === 'hline' || tool === 'horizontal_line' ? 'active' : ''}" data-action="set-tool" data-tool="horizontal_line" title="${i18n.t('draw_tool_hline')}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="2"/></svg>
      </button>
      <button class="btn btn-icon ${tool === 'vline' || tool === 'vertical_line' ? 'active' : ''}" data-action="set-tool" data-tool="vertical_line" title="${i18n.t('draw_tool_vline')}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="3" x2="12" y2="21"/><circle cx="12" cy="12" r="2"/></svg>
      </button>

      <!-- Phase 2 Pro Tools Flyout Trigger (12 Families: Pitchfork, Gann, Harmonic, AVWAP, FRVP, Reg Channel, Cycles) -->
      <div class="tool-rail-picker-wrap">
        <button
          type="button"
          class="btn btn-icon ${activeRailPopup === 'phase2_tools' || isPhase2Active ? 'active' : ''}"
          data-action="toggle-rail-popup"
          data-popup="phase2_tools"
          title="${i18n.t('draw_pro_tools_title') || 'Pro Pattern, Pitchfork & Gann Tools'}"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 17 8 9 13 14 21 5"/>
            <line x1="3" y1="21" x2="21" y2="21" stroke-dasharray="2 2"/>
          </svg>
        </button>

        ${
          activeRailPopup === 'phase2_tools'
            ? `
          <div class="rail-flyout-menu" dir="ltr" style="min-width: 248px;">
            <div class="rail-flyout-title">${i18n.t('draw_pro_tools_title') || 'PRO TOOLS'} ${pendingCount > 0 ? `(${pendingCount})` : ''}</div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 8px;">
              ${PHASE2_TOOL_DEFS.map(
                (pt) => `
                <button
                  type="button"
                  class="btn btn-sm ${tool === pt.id ? 'btn-primary' : ''}"
                  style="justify-content: space-between; font-size: 11px; padding: 5px 8px;"
                  data-action="set-tool"
                  data-tool="${pt.id}"
                >
                  <span>${i18n.t(`draw_tool_${pt.id}`) || pt.shortLabel}</span>
                  <span class="ltr-num" style="opacity: 0.7; font-size: 9.5px;">${pt.anchors}p</span>
                </button>`
              ).join('')}
            </div>
            <div class="rail-flyout-title" style="margin-top: 4px;">PITCHFORK VARIANT</div>
            <div class="chip-group ltr-num" style="flex-wrap: wrap;">
              ${PITCHFORK_VARIANTS.map(
                (v) => `
                <button
                  type="button"
                  class="chip ${pfVariant === v.id ? 'active' : ''}"
                  style="font-size: 10px; padding: 3px 6px;"
                  data-action="set-pitchfork-variant"
                  data-variant="${v.id}"
                >${v.label}</button>`
              ).join('')}
            </div>
          </div>
        `
            : ''
        }
      </div>

      <!-- Magnet Mode Toggle -->
      <button class="btn btn-icon ${isMagnet ? 'active' : ''}" style="${isMagnet ? 'background: rgba(41, 98, 255, 0.25); border-color: var(--primary);' : ''}" data-action="toggle-magnet" title="${i18n.t('draw_tool_magnet')}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${isMagnet ? '#2962FF' : 'currentColor'}" stroke-width="2" stroke-linecap="round"><path d="M4 5v6a8 8 0 0 0 16 0V5"/><line x1="4" y1="5" x2="8" y2="5" stroke="#EF5350" stroke-width="3"/><line x1="16" y1="5" x2="20" y2="5" stroke="#2962FF" stroke-width="3"/></svg>
      </button>

      <div style="width: 24px; height: 1px; background: var(--border); margin: 4px 0;"></div>

      <!-- Color Picker Trigger + Flyout -->
      <div class="tool-rail-picker-wrap">
        <button
          type="button"
          class="btn btn-icon ${activeRailPopup === 'color' ? 'active' : ''}"
          data-action="toggle-rail-popup"
          data-popup="color"
          title="${i18n.t('draw_color_label')}"
          style="position: relative;"
        >
          <span
            style="width: 16px; height: 16px; border-radius: 50%; background: ${curColor}; box-shadow: 0 0 0 1.5px var(--border); display: inline-block;"
          ></span>
        </button>

        ${
          activeRailPopup === 'color'
            ? `
          <div class="rail-flyout-menu rail-color-flyout" dir="ltr">
            <div class="rail-flyout-title">${i18n.t('draw_color_label')}</div>
            <div class="rail-color-grid">
              ${colors
                .map(
                  (c) => `
                <button
                  type="button"
                  class="rail-color-btn ${curColor.toUpperCase() === c.toUpperCase() ? 'selected' : ''}"
                  style="background: ${c};"
                  data-action="set-draw-color"
                  data-color="${c}"
                  title="${c}"
                ></button>
              `
                )
                .join('')}
            </div>
          </div>
        `
            : ''
        }
      </div>

      <!-- Stroke Width Trigger + Flyout -->
      <div class="tool-rail-picker-wrap">
        <button
          type="button"
          class="btn btn-icon ltr-num ${activeRailPopup === 'width' ? 'active' : ''}"
          data-action="toggle-rail-popup"
          data-popup="width"
          title="${i18n.t('draw_width_label')}"
          style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 2px;"
        >
          <svg width="18" height="6" viewBox="0 0 24 6" fill="none">
            <line x1="2" y1="3" x2="22" y2="3" stroke="currentColor" stroke-width="${Math.max(1.8, curWidth * 1.4)}" stroke-linecap="round"/>
          </svg>
          <span style="font-size: 8.5px; font-weight: 700; line-height: 1;">${curWidth}px</span>
        </button>

        ${
          activeRailPopup === 'width'
            ? `
          <div class="rail-flyout-menu rail-width-flyout" dir="ltr">
            <div class="rail-flyout-title">${i18n.t('draw_width_label')}</div>
            <div class="rail-width-list">
              ${widths
                .map(
                  (w) => `
                <button
                  type="button"
                  class="rail-width-btn ltr-num ${curWidth === w ? 'selected' : ''}"
                  data-action="set-draw-width"
                  data-width="${w}"
                >
                  <svg width="28" height="8" viewBox="0 0 32 8" fill="none">
                    <line x1="2" y1="4" x2="30" y2="4" stroke="currentColor" stroke-width="${Math.max(1.5, w * 1.5)}" stroke-linecap="round"/>
                  </svg>
                  <span>${w}px</span>
                </button>
              `
                )
                .join('')}
            </div>
          </div>
        `
            : ''
        }
      </div>

      <div style="width: 24px; height: 1px; background: var(--border); margin: 4px 0;"></div>

      <button class="btn btn-icon" data-action="zoom-in" title="${i18n.t('chart_zoom_in')}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
      </button>
      <button class="btn btn-icon" data-action="zoom-out" title="${i18n.t('chart_zoom_out')}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
      </button>

      ${
        activeTab.selectedDrawingId
          ? `<button class="btn btn-icon" style="color: var(--bear); border-color: var(--bear);" data-action="delete-drawing" title="${i18n.t('draw_delete_selected')}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>`
          : ''
      }
      ${
        activeTab.drawings && activeTab.drawings.length > 0
          ? `<button class="btn btn-icon" style="color: var(--text-muted);" data-action="clear-drawings" title="${i18n.t('draw_clear_all')}">✕</button>`
          : ''
      }
    </aside>
  `;
}

export function renderMobileBottomSheet(activeTab, mobileSheet, i18n) {
  if (!activeTab || !mobileSheet) return '';
  const isFa = i18n.getCurrentLanguage() === 'fa';
  const tool = activeTab.activeTool || activeTab.activeDrawingTool || 'cursor';
  const curColor = activeTab.activeDrawingColorHex || activeTab.activeDrawingColor || '#2962FF';
  const curWidth = Number(activeTab.activeDrawingWidthPx || 2.0);
  const isMagnet = Boolean(activeTab.isMagnetMode);
  const pfVariant = String(activeTab.pitchforkVariant || 'original');
  const colors = ['#2962FF', '#26A69A', '#F59E0B', '#EF5350', '#A855F7', '#D1D4DC'];
  const widths = [1.0, 2.0, 3.0, 4.0];

  if (mobileSheet === 'tools') {
    const toolsList = [
      { id: 'cursor', label: i18n.t('draw_tool_cursor') },
      { id: 'trend_line', label: i18n.t('draw_tool_trend') },
      { id: 'fib_retracement', label: i18n.t('draw_tool_fib') },
      { id: 'horizontal_line', label: i18n.t('draw_tool_hline') },
      { id: 'vertical_line', label: i18n.t('draw_tool_vline') },
      { id: 'long_position', label: i18n.t('draw_tool_long_pos') },
      { id: 'short_position', label: i18n.t('draw_tool_short_pos') },
      ...PHASE2_TOOL_DEFS.map((pt) => ({
        id: pt.id,
        label: i18n.t(`draw_tool_${pt.id}`) || pt.shortLabel,
      })),
    ];
    return `
      <div class="ci-mobile-sheet-backdrop" data-action="close-mobile-sheet">
        <div class="ci-mobile-sheet" dir="${isFa ? 'rtl' : 'ltr'}" style="max-height: 78vh; overflow-y: auto;">
          <div class="row-between" style="margin-bottom: 10px;">
            <strong style="font-size: 13.5px; color: var(--text-strong);">${i18n.t('mobile_sheet_tools') || i18n.t('draw_tools_toggle')}</strong>
            <button type="button" class="btn btn-sm btn-icon" data-action="close-mobile-sheet">✕</button>
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 12px;">
            ${toolsList
              .map(
                (t) => `<button type="button" class="btn btn-sm ${tool === t.id ? 'btn-primary' : ''}" data-action="set-tool" data-tool="${t.id}">${t.label}</button>`
              )
              .join('')}
            <button type="button" class="btn btn-sm ${isMagnet ? 'btn-primary' : ''}" data-action="toggle-magnet">${i18n.t('draw_tool_magnet')}</button>
          </div>
          ${
            tool === 'pitchfork'
              ? `
            <div class="row-between" style="margin-bottom: 10px; flex-wrap: wrap; gap: 6px;">
              <span style="font-size: 12px; color: var(--text-muted);">Pitchfork</span>
              <div class="chip-group ltr-num">
                ${PITCHFORK_VARIANTS.map(
                  (v) => `<button type="button" class="chip ${pfVariant === v.id ? 'active' : ''}" data-action="set-pitchfork-variant" data-variant="${v.id}">${v.label}</button>`
                ).join('')}
              </div>
            </div>`
              : ''
          }
          <div class="row-between" style="margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
            <span style="font-size: 12px; color: var(--text-muted);">${i18n.t('draw_color_label')}</span>
            <div class="color-picker-row">
              ${colors
                .map(
                  (c) => `<button type="button" class="color-dot ${curColor.toUpperCase() === c ? 'active' : ''}" style="background: ${c};" data-action="set-draw-color" data-color="${c}"></button>`
                )
                .join('')}
            </div>
          </div>
          <div class="row-between" style="margin-bottom: 12px;">
            <span style="font-size: 12px; color: var(--text-muted);">${i18n.t('draw_width_label')}</span>
            <div class="chip-group ltr-num">
              ${widths
                .map(
                  (w) => `<button type="button" class="chip ${Math.round(curWidth) === w ? 'active' : ''}" data-action="set-draw-width" data-width="${w}">${w}px</button>`
                )
                .join('')}
            </div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="btn" style="flex: 1;" data-action="zoom-in">+ ${i18n.t('chart_zoom_in')}</button>
            <button type="button" class="btn" style="flex: 1;" data-action="zoom-out">- ${i18n.t('chart_zoom_out')}</button>
            ${
              activeTab.selectedDrawingId
                ? `<button type="button" class="btn" style="color: var(--bear); border-color: var(--bear);" data-action="delete-drawing">${i18n.t('draw_delete_selected')}</button>`
                : ''
            }
            ${
              activeTab.drawings && activeTab.drawings.length > 0
                ? `<button type="button" class="btn" data-action="clear-drawings">${i18n.t('draw_clear_all')}</button>`
                : ''
            }
          </div>
        </div>
      </div>
    `;
  }

  if (mobileSheet === 'indicators') {
    const items = [
      { key: 'showSma20', action: 'toggle-sma20', label: 'SMA 20' },
      { key: 'showSma50', action: 'toggle-sma50', label: 'SMA 50' },
      { key: 'showSma200', action: 'toggle-sma200', label: 'SMA 200' },
      { key: 'showEma20', action: 'toggle-ema20', label: 'EMA 20' },
      { key: 'showEma50', action: 'toggle-ema50', label: 'EMA 50' },
      { key: 'showEma200', action: 'toggle-ema200', label: 'EMA 200' },
      { key: 'showSupertrend', action: 'toggle-supertrend', label: 'Supertrend' },
      { key: 'showVwap', action: 'toggle-vwap', label: 'Session VWAP' },
      { key: 'showBollinger', action: 'toggle-bollinger', label: 'Bollinger' },
      { key: 'showPsar', action: 'toggle-psar', label: 'PSAR' },
      { key: 'showIchimoku', action: 'toggle-ichimoku', label: 'Ichimoku' },
      { key: 'showKeltner', action: 'toggle-keltner', label: 'Keltner' },
      { key: 'showDonchian', action: 'toggle-donchian', label: 'Donchian' },
      { key: 'showMtfEma', action: 'toggle-mtf-ema', label: 'MTF EMA' },
      { key: 'showKillzones', action: 'toggle-killzones', label: 'Killzones' },
      { key: 'showVolumeProfile', action: 'toggle-volume-profile', label: 'Vol Profile' },
      { key: 'showSmcStructure', action: 'toggle-smc-structure', label: 'SMC (BOS)' },
      { key: 'showFvg', action: 'toggle-fvg', label: 'FVG' },
      { key: 'showRsi14', action: 'toggle-rsi14', label: 'RSI 14' },
      { key: 'showMacd', action: 'toggle-macd', label: 'MACD' },
      { key: 'showAtr14', action: 'toggle-atr14', label: 'ATR 14' },
      { key: 'showAdx14', action: 'toggle-adx14', label: 'ADX/DMI' },
      { key: 'showStoch14', action: 'toggle-stoch14', label: 'Stoch' },
      { key: 'showCci20', action: 'toggle-cci20', label: 'CCI 20' },
      { key: 'showWillR14', action: 'toggle-willr14', label: 'Will %R' },
      { key: 'showObv', action: 'toggle-obv', label: 'OBV' },
      { key: 'showCmf20', action: 'toggle-cmf20', label: 'CMF 20' },
      { key: 'showRoc12', action: 'toggle-roc12', label: 'ROC 12' },
    ];
    return `
      <div class="ci-mobile-sheet-backdrop" data-action="close-mobile-sheet">
        <div class="ci-mobile-sheet" dir="${isFa ? 'rtl' : 'ltr'}" style="max-height: 78vh; overflow-y: auto;">
          <div class="row-between" style="margin-bottom: 10px;">
            <strong style="font-size: 13.5px; color: var(--text-strong);">${i18n.t('mobile_sheet_indicators') || (isFa ? 'اندیکاتورها' : 'Indicators')}</strong>
            <button type="button" class="btn btn-sm btn-icon" data-action="close-mobile-sheet">✕</button>
          </div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 10px;">
            ${items
              .map(
                (it) => `<button type="button" class="btn btn-sm ${activeTab[it.key] ? 'btn-primary' : ''}" data-action="${it.action}">${it.label}</button>`
              )
              .join('')}
          </div>
          <button type="button" class="btn" style="width: 100%;" data-action="open-modal" data-modal="indicators">
            ${isFa ? 'تنظیمات کامل اندیکاتورها...' : 'All Indicator Parameters...'}
          </button>
        </div>
      </div>
    `;
  }
  return '';
}
