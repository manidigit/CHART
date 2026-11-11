export function renderLeftToolRail(activeTab, i18n, activeRailPopup = null) {
  if (!activeTab) return '';
  const tool = activeTab.activeTool || activeTab.activeDrawingTool || 'cursor';
  const curColor = activeTab.activeDrawingColorHex || activeTab.activeDrawingColor || '#2962FF';
  const curWidth = Number(activeTab.activeDrawingWidthPx || activeTab.activeDrawingWidth || 2.0);
  const isMagnet = !!activeTab.isMagnetMode;
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
