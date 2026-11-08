const DRAWING_COLORS = ['#2962FF', '#26A69A', '#EF5350', '#F59E0B', '#D1D4DC', '#758696'];
const DRAWING_WIDTHS = [1, 2, 3, 4];

export function renderLeftToolRail(activeTab, i18n) {
  const activeCol = (activeTab && activeTab.activeDrawingColor) || '#2962FF';
  const activeW = Number((activeTab && activeTab.activeDrawingWidth) || 2);

  const colorButtons = DRAWING_COLORS.map(
    (c) => `
      <button
        class="rail-color-swatch ${activeCol.toLowerCase() === c.toLowerCase() ? 'active' : ''}"
        style="background:${c};"
        data-action="set-draw-color"
        data-color="${c}"
        title="${i18n.t('draw_color_label')} ${c}">
      </button>
    `
  ).join('');

  const widthButtons = DRAWING_WIDTHS.map(
    (w) => `
      <button
        class="tool-rail-btn ltr-num ${activeW === w ? 'active' : ''}"
        style="height:24px;font-size:10px;"
        data-action="set-draw-width"
        data-width="${w}"
        title="${i18n.t('draw_width_label')} ${w}px">
        ${w}px
      </button>
    `
  ).join('');

  return `
    <aside class="left-tool-rail">
      <button class="tool-rail-btn ${activeTab && activeTab.activeDrawingTool === 'cursor' ? 'active' : ''}" data-action="set-draw-tool" data-tool="cursor" title="${i18n.t('draw_tool_cursor')}">
        ✢
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
      <div class="rail-color-grid">
        ${colorButtons}
      </div>
      <div class="tool-rail-divider"></div>
      ${widthButtons}
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
    </aside>
  `;
}

export function renderMobileChartTools(activeTab, i18n) {
  const activeTool = (activeTab && activeTab.activeDrawingTool) || 'cursor';
  const hasSelection = Boolean(activeTab && activeTab.selectedDrawingId);
  const autoShowStyle = activeTool !== 'cursor' || hasSelection || Boolean(activeTab && activeTab.mobileStyleExpanded);
  const isCollapsed = activeTab && activeTab.mobileDockCollapsed === true && !autoShowStyle;
  const activeCol = (activeTab && activeTab.activeDrawingColor) || '#2962FF';
  const activeW = Number((activeTab && activeTab.activeDrawingWidth) || 2);

  return `
    <div class="mobile-floating-dock ltr-num">
      <div class="mobile-dock-main">
        <button
          class="tool-rail-btn ${!isCollapsed ? 'active' : ''}"
          style="width:36px;height:36px;border-radius:50%;background:var(--surface);border:1px solid var(--border);"
          data-action="toggle-mobile-dock"
          title="${i18n.t('draw_tools_toggle')}">
          ✏️
        </button>
        ${
          !isCollapsed
            ? `
          <button class="tool-rail-btn ${activeTool === 'cursor' ? 'active' : ''}" data-action="set-draw-tool" data-tool="cursor" title="${i18n.t('draw_tool_cursor')}">✢</button>
          <button class="tool-rail-btn ${activeTool === 'trend_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="trend_line" title="${i18n.t('draw_tool_trend')}">╱</button>
          <button class="tool-rail-btn ${activeTool === 'horizontal_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="horizontal_line" title="${i18n.t('draw_tool_hline')}">―</button>
          <button class="tool-rail-btn ${activeTool === 'vertical_line' ? 'active' : ''}" data-action="set-draw-tool" data-tool="vertical_line" title="${i18n.t('draw_tool_vline')}">│</button>
          ${
            hasSelection
              ? `<button class="tool-rail-btn danger" data-action="delete-drawing" title="${i18n.t('draw_delete_selected')}">🗑</button>`
              : ''
          }
          ${
            activeTab && (activeTab.drawings || []).length > 0
              ? `<button class="tool-rail-btn" data-action="clear-drawings" title="${i18n.t('draw_clear_all')}">✕</button>`
              : ''
          }
        `
            : ''
        }
      </div>
      ${
        !isCollapsed && autoShowStyle
          ? `
        <div class="mobile-dock-style-row">
          ${DRAWING_COLORS.map(
            (c) => `
            <button
              class="rail-color-swatch ${activeCol.toLowerCase() === c.toLowerCase() ? 'active' : ''}"
              style="background:${c};width:20px;height:20px;"
              data-action="set-draw-color"
              data-color="${c}">
            </button>
          `
          ).join('')}
          <div class="subbar-divider"></div>
          ${DRAWING_WIDTHS.map(
            (w) => `
            <button
              class="chip ltr-num ${activeW === w ? 'active' : ''}"
              style="min-height:24px;padding:2px 6px;"
              data-action="set-draw-width"
              data-width="${w}">
              ${w}px
            </button>
          `
          ).join('')}
        </div>
      `
          : ''
      }
    </div>
  `;
}
