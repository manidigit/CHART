import { computeChartGeometry, renderCandlestickCanvas } from '../components/chartRenderer.js';
import { DrawingGeometry } from '../algorithms/drawingGeometry.js';
import { state, saveDrawings } from '../core/store.js';

export function attachCanvasInteractions(canvas, activeTab, onRenderApp) {
  let isDragging = false;
  let isScalingY = false;
  let isDraggingDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let pinchStartDist = null;
  let pinchStartVisible = activeTab.visibleCount || 48;

  const handleTap = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const geom = computeChartGeometry(canvas, activeTab);
    if (x > geom.padLeft + geom.plotW) return;

    const tappedTime = geom.xToTime(x);
    const tappedPrice = geom.yToPrice(y);

    if (activeTab.activeDrawingTool === 'horizontal_line') {
      const d = { id: 'hl_' + Date.now(), type: 'horizontal_line', price: tappedPrice };
      activeTab.drawings = [...(activeTab.drawings || []), d];
      activeTab.selectedDrawingId = d.id;
      activeTab.activeDrawingTool = 'cursor';
      saveDrawings(activeTab.chartId, activeTab.drawings);
      onRenderApp();
    } else if (activeTab.activeDrawingTool === 'vertical_line') {
      const d = { id: 'vl_' + Date.now(), type: 'vertical_line', timeUtcMillis: tappedTime };
      activeTab.drawings = [...(activeTab.drawings || []), d];
      activeTab.selectedDrawingId = d.id;
      activeTab.activeDrawingTool = 'cursor';
      saveDrawings(activeTab.chartId, activeTab.drawings);
      onRenderApp();
    } else if (activeTab.activeDrawingTool === 'trend_line') {
      if (!activeTab.pendingTrendPoint) {
        activeTab.pendingTrendPoint = { timeUtcMillis: tappedTime, price: tappedPrice };
        renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
      } else {
        const d = {
          id: 'tl_' + Date.now(),
          type: 'trend_line',
          startTimeUtcMillis: activeTab.pendingTrendPoint.timeUtcMillis,
          startPrice: activeTab.pendingTrendPoint.price,
          endTimeUtcMillis: tappedTime,
          endPrice: tappedPrice,
        };
        activeTab.drawings = [...(activeTab.drawings || []), d];
        activeTab.selectedDrawingId = d.id;
        activeTab.pendingTrendPoint = null;
        activeTab.activeDrawingTool = 'cursor';
        saveDrawings(activeTab.chartId, activeTab.drawings);
        onRenderApp();
      }
    } else {
      const hit = DrawingGeometry.hitTestDrawing(
        activeTab.drawings || [],
        x,
        y,
        geom.timeToX,
        geom.priceToY
      );
      if (hit) {
        activeTab.selectedDrawingId = hit.id;
      } else {
        activeTab.selectedDrawingId = null;
        const slotW = Math.max(1, geom.plotW / Math.max(1, geom.slice.length));
        const localIdx = Math.max(0, Math.min(geom.slice.length - 1, Math.floor((x - geom.padLeft) / slotW)));
        activeTab.selectedCandleIndex = geom.startIdx + localIdx;
      }
      onRenderApp();
    }
  };

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    lastX = e.clientX;
    lastY = e.clientY;
    const geom = computeChartGeometry(canvas, activeTab);
    if (x >= geom.padLeft + geom.plotW) {
      isScalingY = true;
    } else if (activeTab.activeDrawingTool === 'cursor' && activeTab.selectedDrawingId) {
      isDraggingDrawing = true;
    } else {
      isDragging = true;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!isDragging && !isScalingY && !isDraggingDrawing) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    const geom = computeChartGeometry(canvas, activeTab);
    const slotW = Math.max(3, geom.plotW / Math.max(1, geom.slice.length));

    if (isScalingY) {
      activeTab.isAutoScaleY = false;
      activeTab.yPriceScaleFactor = Math.max(
        0.25,
        Math.min(4.0, (activeTab.yPriceScaleFactor || 1.0) + dy * 0.005)
      );
      lastY = e.clientY;
      renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
    } else if (isDraggingDrawing && activeTab.selectedDrawingId) {
      const deltaSlots = Math.round(dx / slotW);
      const deltaTimeMs = deltaSlots * geom.stepMs;
      const deltaPrice = (-dy / Math.max(1, geom.plotH)) * geom.fullSpan;
      activeTab.drawings = (activeTab.drawings || []).map((d) =>
        d.id === activeTab.selectedDrawingId
          ? DrawingGeometry.translateDrawing(d, deltaTimeMs, deltaPrice)
          : d
      );
      saveDrawings(activeTab.chartId, activeTab.drawings);
      lastX = e.clientX;
      lastY = e.clientY;
      renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
    } else if (isDragging) {
      const deltaBars = Math.round(dx / slotW);
      if (deltaBars !== 0) {
        const maxOff = Math.max(0, activeTab.candles.length - (activeTab.visibleCount || 48));
        activeTab.scrollOffset = Math.max(0, Math.min(maxOff, (activeTab.scrollOffset || 0) + deltaBars));
        lastX = e.clientX;
        renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
      }
    }
  });

  window.addEventListener('pointerup', () => {
    isDragging = false;
    isScalingY = false;
    isDraggingDrawing = false;
  });

  canvas.addEventListener('click', (e) => {
    handleTap(e.clientX, e.clientY);
  });

  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const geom = computeChartGeometry(canvas, activeTab);
    if (x >= geom.padLeft + geom.plotW) {
      activeTab.isAutoScaleY = true;
      activeTab.yPriceScaleFactor = 1.0;
      onRenderApp();
    }
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 6 : -6;
      const maxCap = Math.max(12, Math.min(160, activeTab.candles.length));
      activeTab.visibleCount = Math.max(12, Math.min(maxCap, (activeTab.visibleCount || 48) + delta));
      renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
    },
    { passive: false }
  );

  canvas.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 2) {
        pinchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        pinchStartVisible = activeTab.visibleCount || 48;
      }
    },
    { passive: true }
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length === 2 && pinchStartDist) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = Math.max(0.25, dist / pinchStartDist);
        const maxCap = Math.max(12, Math.min(160, activeTab.candles.length));
        activeTab.visibleCount = Math.max(12, Math.min(maxCap, Math.round(pinchStartVisible / factor)));
        renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme);
      }
    },
    { passive: false }
  );
}
