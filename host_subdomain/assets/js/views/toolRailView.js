export function renderLeftToolRail(activeTab, i18n) {
  if (!activeTab) return '';
  const tool = activeTab.activeTool || 'cursor';
  const curColor = activeTab.activeDrawingColorHex || '#2962FF';
  const curWidth = Number(activeTab.activeDrawingWidthPx || 2.0);
  const colors = ['#2962FF', '#26A69A', '#F59E0B', '#EF5350', '#A855F7', '#D1D4DC'];
  const widths = [1.0, 2.0, 3.0, 4.0];

  return `
    <aside class="left-tool-rail">
      <button class="btn btn-icon ${tool === 'cursor' ? 'active' : ''}" data-action="set-tool" data-tool="cursor" title="${i18n.t('draw_tool_cursor')}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v6m0 8v6M2 12h6m8 0h6"/></svg>
      </button>
      <button class="btn btn-icon ${tool === 'trend' ? 'active' : ''}" data-action="set-tool" data-tool="trend" title="${i18n.t('draw_tool_trend')}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/></svg>
      </button>
      <button class="btn btn-icon ${tool === 'hline' ? 'active' : ''}" data-action="set-tool" data-tool="hline" title="${i18n.t('draw_tool_hline')}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="2"/></svg>
      </button>
      <button class="btn btn-icon ${tool === 'vline' ? 'active' : ''}" data-action="set-tool" data-tool="vline" title="${i18n.t('draw_tool_vline')}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="3" x2="12" y2="21"/><circle cx="12" cy="12" r="2"/></svg>
      </button>

      <div style="width: 24px; height: 1px; background: var(--border); margin: 4px 0;"></div>

      <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;" title="${i18n.t('draw_color_label')}">
        ${colors
          .map(
            (c) => `
          <div
            class="color-dot ${curColor.toUpperCase() === c.toUpperCase() ? 'active' : ''}"
            style="width: 14px; height: 14px; background: ${c};"
            data-action="set-draw-color"
            data-color="${c}"
          ></div>
        `
          )
          .join('')}
      </div>

      <div style="width: 24px; height: 1px; background: var(--border); margin: 4px 0;"></div>

      <div style="display: flex; flex-direction: column; gap: 3px; align-items: center;" title="${i18n.t('draw_width_label')}">
        ${widths
          .map(
            (w) => `
          <button
            class="btn btn-icon ltr-num ${curWidth === w ? 'active' : ''}"
            style="width: 28px; height: 22px; min-height: 22px; font-size: 10px;"
            data-action="set-draw-width"
            data-width="${w}"
          >${w}px</button>
        `
          )
          .join('')}
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
