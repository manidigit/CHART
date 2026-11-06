import { PriceFormatter } from '../algorithms/priceFormatter.js';

export function renderCandlestickCanvas(canvas, tab, isDarkTheme) {
  if (!canvas || !tab || !tab.candles || tab.candles.length === 0) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(300, rect.width || 680);
  const height = 320;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const bg = isDarkTheme ? '#131A26' : '#FFFFFF';
  const grid = isDarkTheme ? '#1E293B' : '#E2E8F0';
  const textCol = isDarkTheme ? '#94A3B8' : '#475569';
  const bull = isDarkTheme ? '#10B981' : '#059669';
  const bear = isDarkTheme ? '#F43F5E' : '#E11D48';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const total = tab.candles.length;
  const visibleCount = Math.min(Math.max(16, tab.visibleCount || 48), total);
  const endIdx = Math.max(1, total - (tab.scrollOffset || 0));
  const startIdx = Math.max(0, endIdx - visibleCount);
  const slice = tab.candles.slice(startIdx, endIdx);
  if (slice.length === 0) return;

  const padRight = 68;
  const padBottom = 26;
  const padTop = 14;
  const padLeft = 10;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of slice) {
    minP = Math.min(minP, Number(c.low));
    maxP = Math.max(maxP, Number(c.high));
  }
  const span = Math.max(1e-6, maxP - minP);
  minP -= span * 0.06;
  maxP += span * 0.06;
  const fullSpan = maxP - minP;

  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.font = '11px monospace';
  ctx.fillStyle = textCol;

  for (let g = 0; g <= 4; g++) {
    const y = padTop + (plotH * g) / 4;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();

    const priceVal = maxP - (fullSpan * g) / 4;
    ctx.fillText(PriceFormatter.formatPrice(priceVal, tab.decimals), padLeft + plotW + 6, y + 4);
  }

  const slotW = plotW / slice.length;
  const bodyW = Math.min(16, Math.max(2.5, slotW * 0.68));
  const priceToY = (p) => padTop + ((maxP - Number(p)) / fullSpan) * plotH;

  slice.forEach((c, idx) => {
    const cx = padLeft + (idx + 0.5) * slotW;
    const oY = priceToY(c.open);
    const cY = priceToY(c.close);
    const hY = priceToY(c.high);
    const lY = priceToY(c.low);
    const isBull = Number(c.close) >= Number(c.open);
    ctx.strokeStyle = isBull ? bull : bear;
    ctx.fillStyle = isBull ? bull : bear;

    ctx.beginPath();
    ctx.moveTo(cx, hY);
    ctx.lineTo(cx, lY);
    ctx.stroke();

    const top = Math.min(oY, cY);
    const bh = Math.max(2, Math.abs(cY - oY));
    ctx.fillRect(cx - bodyW / 2, top, bodyW, bh);
  });

  ctx.fillStyle = textCol;
  const firstIso = (slice[0].open_time_utc_iso || '').slice(5, 16);
  const lastIso = (slice[slice.length - 1].open_time_utc_iso || '').slice(5, 16);
  ctx.fillText(firstIso, padLeft, height - 8);
  ctx.fillText(lastIso, Math.max(padLeft + 90, padLeft + plotW - 85), height - 8);
}
