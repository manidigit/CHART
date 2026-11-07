export function renderLeftToolRail(activeTab, i18n) {
  return `
    <aside class="left-tool-rail">
      <button class="tool-rail-btn ${activeTab && activeTab.activeDrawingTool === 'cursor' ? 'active' : ''}" data-action="set-draw-tool" data-tool="cursor" title="${i18n.t('draw_tool_cursor')}">
        +
      </button>
      <button class="tool-rail-btn ${activeTab && activeTab.activeDrawingTool === 'trend_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="trend_line" title="${i18n.t('draw_tool_trend')}">
        ╱
      </button>
      <button class="tool-rail-btn ${activeTab && activeTab.activeDrawingTool === 'horizontal_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="horizontal_line" title="${i18n.t('draw_tool_hline')}">
        ―
      </button>
      <button class="tool-rail-btn ${activeTab && activeTab.activeDrawingTool === 'vertical_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="vertical_line" title="${i18n.t('draw_tool_vline')}">
        │
      </button>
      <div class="tool-rail-divider"></div>
      ${
        activeTab && activeTab.selectedDrawingId
          ? `<button class="tool-rail-btn danger" data-action="delete-drawing" title="${i18n.t('draw_delete_selected')}">🗑</button>`
          : ''
      }
      ${
        activeTab && (activeTab.drawings || []).length > 0
          ? `<button class="tool-rail-btn" data-action="clear-drawings" title="${i18n.t('draw_clear_all')}">✕</button>`
          : ''
      }
      <div class="tool-rail-divider"></div>
      <button class="tool-rail-btn" data-action="zoom-in" title="${i18n.t('chart_zoom_in')}">🔍+</button>
      <button class="tool-rail-btn" data-action="zoom-out" title="${i18n.t('chart_zoom_out')}">🔍-</button>
      <button class="tool-rail-btn" data-action="fit-content" title="${i18n.t('chart_fit_content')}">⤢</button>
      <button class="tool-rail-btn" data-action="reset-chart" title="${i18n.t('chart_reset_view')}">↦</button>
    </aside>
  `;
}

export function renderMobileChartTools(activeTab, i18n) {
  return `
    <div class="mobile-chart-tools">
      <button class="chip ${activeTab && activeTab.activeDrawingTool === 'cursor' ? 'active' : ''}" data-action="set-draw-tool" data-tool="cursor">${i18n.t('draw_tool_cursor')}</button>
      <button class="chip ${activeTab && activeTab.activeDrawingTool === 'trend_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="trend_line">${i18n.t('draw_tool_trend')}</button>
      <button class="chip ${activeTab && activeTab.activeDrawingTool === 'horizontal_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="horizontal_line">${i18n.t('draw_tool_hline')}</button>
      <button class="chip ${activeTab && activeTab.activeDrawingTool === 'vertical_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="vertical_line">${i18n.t('draw_tool_vline')}</button>
      <button class="chip" data-action="fit-content">${i18n.t('chart_fit_content')}</button>
      <button class="chip" data-action="reset-chart">${i18n.t('chart_reset_view')}</button>
    </div>
  `;
}
