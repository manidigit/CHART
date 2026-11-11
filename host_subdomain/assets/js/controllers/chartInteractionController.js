import { computeChartGeometry, renderCandlestickCanvas } from '../components/chartRenderer.js?v=1.30.0';
import { DrawingGeometry } from '../algorithms/drawingGeometry.js?v=1.30.0';
import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.30.0';
import { state, saveDrawings } from '../core/store.js?v=1.30.0';

export function attachCanvasInteractions(canvas, activeTab, onRenderApp, i18n = null) {
  let isDragging = false;
  let isScalingY = false;
  let isDraggingDrawing = false;
  let pointerMoved = false;
  let lastX = 0;
  let lastY = 0;
  let panCarryPx = 0;
  let pinchStartDist = null;
  let pinchStartVisible = activeTab.visibleCount || 56;

  const getDefaultColorForTool = (tool) => {
    if (activeTab.activeDrawingColor) return activeTab.activeDrawingColor;
    const prefs = state.chartPreferences || {};
    if (tool === 'horizontal_line') return prefs.hlineColor || '#38BDF8';
    if (tool === 'vertical_line') return prefs.vlineColor || '#F59E0B';
    return prefs.trendColor || '#A855F7';
  };

  const handleTap = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const geom = computeChartGeometry(canvas, activeTab);
    if (x > geom.padLeft + geom.plotW || y > geom.padTop + geom.pricePlotH) return;

    let tappedTime = geom.xToTime(x);
    let tappedPrice = geom.yToPrice(y);

    if (activeTab.isMagnetMode && geom.slice && geom.slice.length > 0) {
      const slotW = Math.max(1, geom.plotW / Math.max(1, geom.slice.length));
      const localIdx = Math.max(
        0,
        Math.min(geom.slice.length - 1, Math.floor((x - geom.padLeft) / slotW))
      );
      const candle = geom.slice[localIdx];
      if (candle) {
        tappedPrice = DrawingGeometry.snapToCandleOhlc(
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          tappedPrice
        );
        tappedTime = Number(
          candle.open_time_utc_ms || (candle.openTimeSec ? candle.openTimeSec * 1000 : tappedTime)
        );
      }
    }

    const strokeW = Number(activeTab.activeDrawingWidth || 2);
    const color = getDefaultColorForTool(activeTab.activeDrawingTool);

    if (activeTab.activeDrawingTool === 'horizontal_line') {
      const d = {
        id: 'hl_' + Date.now(),
        type: 'horizontal_line',
        price: tappedPrice,
        color,
        strokeWidth: strokeW,
      };
      activeTab.drawings = [...(activeTab.drawings || []), d];
      activeTab.selectedDrawingId = d.id;
      activeTab.activeDrawingTool = 'cursor';
      saveDrawings(activeTab.chartId, activeTab.drawings);
      onRenderApp();
    } else if (activeTab.activeDrawingTool === 'vertical_line') {
      const d = {
        id: 'vl_' + Date.now(),
        type: 'vertical_line',
        timeUtcMillis: tappedTime,
        color,
        strokeWidth: strokeW,
      };
      activeTab.drawings = [...(activeTab.drawings || []), d];
      activeTab.selectedDrawingId = d.id;
      activeTab.activeDrawingTool = 'cursor';
      saveDrawings(activeTab.chartId, activeTab.drawings);
      onRenderApp();
    } else if (activeTab.activeDrawingTool === 'trend_line') {
      if (!activeTab.pendingTrendPoint) {
        activeTab.pendingTrendPoint = { timeUtcMillis: tappedTime, price: tappedPrice };
        renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme, i18n);
      } else {
        const d = {
          id: 'tl_' + Date.now(),
          type: 'trend_line',
          startTimeUtcMillis: activeTab.pendingTrendPoint.timeUtcMillis,
          startPrice: activeTab.pendingTrendPoint.price,
          endTimeUtcMillis: tappedTime,
          endPrice: tappedPrice,
          color,
          strokeWidth: strokeW,
        };
        activeTab.drawings = [...(activeTab.drawings || []), d];
        activeTab.selectedDrawingId = d.id;
        activeTab.pendingTrendPoint = null;
        activeTab.activeDrawingTool = 'cursor';
        saveDrawings(activeTab.chartId, activeTab.drawings);
        onRenderApp();
      }
    } else if (activeTab.activeDrawingTool === 'fib' || activeTab.activeDrawingTool === 'fib_retracement') {
      if (!activeTab.pendingTrendPoint) {
        activeTab.pendingTrendPoint = { timeUtcMillis: tappedTime, price: tappedPrice };
        renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme, i18n);
      } else {
        const d = {
          id: 'fib_' + Date.now(),
          type: 'fib_retracement',
          startTimeUtcMillis: activeTab.pendingTrendPoint.timeUtcMillis,
          startPrice: activeTab.pendingTrendPoint.price,
          endTimeUtcMillis: tappedTime,
          endPrice: tappedPrice,
          color: color || '#2962FF',
          strokeWidth: strokeW,
        };
        activeTab.drawings = [...(activeTab.drawings || []), d];
        activeTab.selectedDrawingId = d.id;
        activeTab.pendingTrendPoint = null;
        activeTab.activeDrawingTool = 'cursor';
        saveDrawings(activeTab.chartId, activeTab.drawings);
        onRenderApp();
      }
    } else if (activeTab.activeDrawingTool === 'long_position') {
      const stepMs = PriceFormatter.stepMilliseconds(activeTab.timeframe);
      const dec = activeTab.decimals || 2;
      const target = Number((tappedPrice * 1.02).toFixed(dec));
      const stop = Number((tappedPrice * 0.99).toFixed(dec));
      const d = {
        id: 'long_' + Date.now(),
        type: 'long_position',
        startTimeUtcMillis: tappedTime,
        endTimeUtcMillis: tappedTime + 16 * stepMs,
        entryPrice: tappedPrice,
        targetPrice: target,
        stopPrice: stop,
        color: '#26A69A',
        strokeWidth: strokeW,
      };
      activeTab.drawings = [...(activeTab.drawings || []), d];
      activeTab.selectedDrawingId = d.id;
      activeTab.activeDrawingTool = 'cursor';
      saveDrawings(activeTab.chartId, activeTab.drawings);
      onRenderApp();
    } else if (activeTab.activeDrawingTool === 'short_position') {
      const stepMs = PriceFormatter.stepMilliseconds(activeTab.timeframe);
      const dec = activeTab.decimals || 2;
      const target = Number((tappedPrice * 0.98).toFixed(dec));
      const stop = Number((tappedPrice * 1.01).toFixed(dec));
      const d = {
        id: 'short_' + Date.now(),
        type: 'short_position',
        startTimeUtcMillis: tappedTime,
        endTimeUtcMillis: tappedTime + 16 * stepMs,
        entryPrice: tappedPrice,
        targetPrice: target,
        stopPrice: stop,
        color: '#EF5350',
        strokeWidth: strokeW,
      };
      activeTab.drawings = [...(activeTab.drawings || []), d];
      activeTab.selectedDrawingId = d.id;
      activeTab.activeDrawingTool = 'cursor';
      saveDrawings(activeTab.chartId, activeTab.drawings);
      onRenderApp();
    } else {
      const hit = DrawingGeometry.hitTestDrawing(
        activeTab.drawings || [],
        x,
        y,
        geom.timeToX,
        geom.priceToY,
        20
      );
      if (hit) {
        activeTab.selectedDrawingId = hit.id;
        activeTab.activeDrawingColor = hit.color || getDefaultColorForTool(hit.type);
        activeTab.activeDrawingWidth = Number(hit.strokeWidth || 2);
      } else {
        activeTab.selectedDrawingId = null;
        const slotW = Math.max(1, geom.plotW / Math.max(1, geom.slice.length));
        const localIdx = Math.max(
          0,
          Math.min(geom.slice.length - 1, Math.floor((x - geom.padLeft) / slotW))
        );
        activeTab.selectedCandleIndex = geom.startIdx + localIdx;
        activeTab.crosshair = { active: true, x, y };
      }
      onRenderApp();
    }
  };

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastX = e.clientX;
    lastY = e.clientY;
    panCarryPx = 0;
    pointerMoved = false;
    const geom = computeChartGeometry(canvas, activeTab);
    if (x >= geom.padLeft + geom.plotW) {
      isScalingY = true;
    } else if (
      activeTab.activeDrawingTool === 'cursor' &&
      activeTab.selectedDrawingId &&
      DrawingGeometry.hitTestDrawing(activeTab.drawings || [], x, y, geom.timeToX, geom.priceToY, 22)
    ) {
      isDraggingDrawing = true;
    } else {
      isDragging = true;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const geom = computeChartGeometry(canvas, activeTab);
    const slotW = Math.max(3, geom.plotW / Math.max(1, geom.slice.length));

    if (!isDragging && !isScalingY && !isDraggingDrawing) {
      if (x >= geom.padLeft && x <= geom.padLeft + geom.plotW && y >= geom.padTop && y <= geom.padTop + geom.pricePlotH) {
        const localIdx = Math.max(0, Math.min(geom.slice.length - 1, Math.floor((x - geom.padLeft) / slotW)));
        activeTab.selectedCandleIndex = geom.startIdx + localIdx;
        activeTab.crosshair = { active: true, x, y };
        renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme, i18n);
      }
      return;
    }

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      pointerMoved = true;
    }
    if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) return;

    if (isScalingY) {
      activeTab.isAutoScaleY = false;
      activeTab.yPriceScaleFactor = Math.max(
        0.2,
        Math.min(4.5, (activeTab.yPriceScaleFactor || 1.0) + dy * 0.005)
      );
      lastY = e.clientY;
      renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme, i18n);
    } else if (isDraggingDrawing && activeTab.selectedDrawingId) {
      const deltaSlots = Math.round(dx / slotW);
      const deltaTimeMs = deltaSlots * geom.stepMs;
      const deltaPrice = (-dy / Math.max(1, geom.pricePlotH)) * geom.fullSpan;
      activeTab.drawings = (activeTab.drawings || []).map((d) =>
        d.id === activeTab.selectedDrawingId
          ? DrawingGeometry.translateDrawing(d, deltaTimeMs, deltaPrice)
          : d
      );
      saveDrawings(activeTab.chartId, activeTab.drawings);
      lastX = e.clientX;
      lastY = e.clientY;
      renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme, i18n);
    } else if (isDragging) {
      panCarryPx += dx;
      lastX = e.clientX;
      const deltaBars = Math.round(panCarryPx / slotW);
      if (deltaBars !== 0) {
        panCarryPx -= deltaBars * slotW;
        const maxOff = Math.max(0, activeTab.candles.length - (activeTab.visibleCount || 56));
        activeTab.scrollOffset = Math.max(0, Math.min(maxOff, (activeTab.scrollOffset || 0) + deltaBars));
        activeTab.activeDateRange = null;
        renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme, i18n);
      }
    }
  });

  canvas.addEventListener('pointerleave', () => {
    if (activeTab.crosshair && activeTab.crosshair.active && !isDragging) {
      activeTab.crosshair = { active: false, x: 0, y: 0 };
      renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme, i18n);
    }
  });

  window.addEventListener('pointerup', () => {
    isDragging = false;
    isScalingY = false;
    isDraggingDrawing = false;
  });

  canvas.addEventListener('click', (e) => {
    if (!pointerMoved) {
      handleTap(e.clientX, e.clientY);
    }
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
      const maxCap = Math.max(8, activeTab.candles.length);
      activeTab.visibleCount = Math.max(8, Math.min(maxCap, (activeTab.visibleCount || 56) + delta));
      activeTab.activeDateRange = null;
      renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme, i18n);
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
        pinchStartVisible = activeTab.visibleCount || 56;
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
        const maxCap = Math.max(8, activeTab.candles.length);
        activeTab.visibleCount = Math.max(8, Math.min(maxCap, Math.round(pinchStartVisible / factor)));
        activeTab.activeDateRange = null;
        renderCandlestickCanvas(canvas, activeTab, state.isDarkTheme, i18n);
      }
    },
    { passive: false }
  );
}
