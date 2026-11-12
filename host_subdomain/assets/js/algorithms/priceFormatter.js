export const PriceFormatter = {
  formatPrice(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(Number(val))) return '—';
    return Number(val).toFixed(decimals);
  },

  formatAxisRoundPrice(val, decimals = 2, niceStep = 1) {
    if (val === null || val === undefined || isNaN(Number(val))) return '—';
    const num = Number(val);
    if (niceStep >= 1 && Math.abs(num - Math.round(num)) < 1e-6) {
      return num.toFixed(Math.min(decimals, 2));
    }
    if (niceStep >= 0.1 && Math.abs(num * 10 - Math.round(num * 10)) < 1e-6) {
      return num.toFixed(Math.min(decimals, 2));
    }
    return num.toFixed(decimals);
  },

  /**
   * Heckbert Nice Numbers Algorithm for institutional round Y-axis price ticks.
   * Guarantees clean multiples of {1, 2, 2.5, 5, 10} * 10^k instead of arbitrary fractions.
   */
  computeNicePriceTicks(minP, maxP, targetTickCount = 6) {
    const low = Number(minP);
    const high = Number(maxP);
    if (!isFinite(low) || !isFinite(high) || high <= low) {
      return { ticks: [low || 0], step: 1 };
    }
    const rawRange = high - low;
    const roughStep = rawRange / Math.max(2, targetTickCount);
    const mag = Math.floor(Math.log10(roughStep));
    const magPow = Math.pow(10, mag);
    const residual = roughStep / magPow;

    let niceFraction;
    if (residual <= 1.2) niceFraction = 1;
    else if (residual <= 2.2) niceFraction = 2;
    else if (residual <= 3.0) niceFraction = 2.5;
    else if (residual <= 6.0) niceFraction = 5;
    else niceFraction = 10;

    const niceStep = niceFraction * magPow;
    const firstTick = Math.ceil(low / niceStep) * niceStep;
    const ticks = [];
    for (let t = firstTick, guard = 0; t <= high + niceStep * 0.001 && guard < 30; t += niceStep, guard++) {
      const cleanVal = Number(t.toPrecision(12));
      if (cleanVal >= low - niceStep * 0.02 && cleanVal <= high + niceStep * 0.02) {
        ticks.push(cleanVal);
      }
    }
    return { ticks, step: niceStep };
  },

  /**
   * TradingView-Grade Smart Calendar-Aligned X-Axis Tick Generator.
   * Inspects both the active timeframe AND the actual visible calendar span (days/months/years)
   * to snap grid lines and labels onto true Year, Month, Day, or Round-Hour boundaries.
   */
  computeSmartTimeAxisTicks(visible = [], chartW = 800, timeframe = 'M15') {
    if (!Array.isArray(visible) || visible.length === 0) return [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = (n) => String(n).padStart(2, '0');
    const tf = String(timeframe || 'M15').toUpperCase();

    const getMs = (c) =>
      Number(c.open_time_utc_ms || (c.openTimeSec ? c.openTimeSec * 1000 : 0));

    const firstMs = getMs(visible[0]);
    const lastMs = getMs(visible[visible.length - 1]);
    const stepMs = this.stepMilliseconds(tf);
    const spanMs = Math.max(stepMs * visible.length, lastMs - firstMs);
    const spanDays = spanMs / 86400000;

    const candidates = [];

    for (let i = 0; i < visible.length; i++) {
      const ms = getMs(visible[i]);
      if (!ms) continue;
      const d = new Date(ms);
      const yr = d.getUTCFullYear();
      const mo = d.getUTCMonth();
      const day = d.getUTCDate();
      const hr = d.getUTCHours();
      const mn = d.getUTCMinutes();

      const prevMs = i > 0 ? getMs(visible[i - 1]) : null;
      const prevD = prevMs ? new Date(prevMs) : null;

      const isNewYear = !prevD || prevD.getUTCFullYear() !== yr;
      const isNewMonth = !prevD || isNewYear || prevD.getUTCMonth() !== mo;
      const isNewDay = !prevD || isNewMonth || prevD.getUTCDate() !== day;

      // 1. Multi-Year Span (> 420 days, e.g., 5Y / All)
      if (spanDays > 420) {
        if (isNewYear && i > 0) {
          candidates.push({ index: i, text: String(yr), isMajor: true, priority: 4 });
        } else if (isNewMonth && (mo === 3 || mo === 6 || mo === 9)) {
          candidates.push({ index: i, text: months[mo], isMajor: false, priority: 2 });
        }
        continue;
      }

      // 2. Multi-Month to 1.2-Year Span (55..420 days, e.g., 3M, 6M, 9M, YTD, 1Y)
      if (spanDays > 55 || tf === 'W1') {
        if (isNewYear && i > 0) {
          candidates.push({ index: i, text: String(yr), isMajor: true, priority: 4 });
        } else if (isNewMonth && (i > 0 || day <= 5)) {
          candidates.push({ index: i, text: months[mo], isMajor: true, priority: 3 });
        } else if (
          spanDays <= 140 &&
          isNewDay &&
          day >= 14 &&
          day <= 17 &&
          (!prevD || prevD.getUTCDate() < 14)
        ) {
          // Clean mid-month day number (like TradingView: "Jul", "15", "Aug", "15")
          candidates.push({ index: i, text: String(day), isMajor: false, priority: 1 });
        }
        continue;
      }

      // 3. 2-Week to 2-Month Span (12..55 days, e.g., 1M on H4 or D1)
      if (spanDays > 12 || tf === 'D1') {
        if (isNewYear && i > 0) {
          candidates.push({ index: i, text: String(yr), isMajor: true, priority: 4 });
        } else if (isNewMonth && day <= 4) {
          candidates.push({ index: i, text: months[mo], isMajor: true, priority: 3 });
        } else if (isNewDay && (d.getUTCDay() === 1 || day % 5 === 1)) {
          candidates.push({ index: i, text: `${day} ${months[mo]}`, isMajor: false, priority: 2 });
        }
        continue;
      }

      // 4. Multi-Day / 1-Week Span (2.2..12 days, e.g., 5D / 1W on H1 or H4)
      if (spanDays > 2.2 || tf === 'H4') {
        if (isNewDay) {
          candidates.push({
            index: i,
            text: `${day} ${months[mo]}`,
            isMajor: true,
            priority: 3,
          });
        } else if (hr === 12 && mn === 0 && spanDays <= 6) {
          candidates.push({ index: i, text: '12:00', isMajor: false, priority: 1 });
        }
        continue;
      }

      // 5. Intraday Span (<= 2.2 days, e.g., 1D on M15 or H1)
      if (isNewDay) {
        candidates.push({
          index: i,
          text: hr === 0 && mn === 0 ? `${day} ${months[mo]}` : `${day} ${months[mo]} ${pad(hr)}:${pad(mn)}`,
          isMajor: true,
          priority: 4,
        });
      } else if (mn === 0 && (hr % 3 === 0 || (spanDays <= 1 && hr % 2 === 0))) {
        candidates.push({
          index: i,
          text: `${pad(hr)}:00`,
          isMajor: false,
          priority: hr % 6 === 0 ? 2 : 1,
        });
      }
    }

    // Fallback if very few candles are visible and no boundary was crossed
    if (candidates.length < 3) {
      const targetCount = Math.max(3, Math.min(7, Math.floor(chartW / 120)));
      const step = Math.max(1, Math.floor(visible.length / targetCount));
      for (let i = 0; i < visible.length; i += step) {
        const ms = getMs(visible[i]);
        const d = new Date(ms);
        const label =
          tf === 'D1' || tf === 'W1' || spanDays > 12
            ? `${d.getUTCDate()} ${months[d.getUTCMonth()]}`
            : `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
        candidates.push({ index: i, text: label, isMajor: i === 0, priority: 1 });
      }
    }

    // Filter candidates so labels never collide horizontally, prioritizing higher-priority boundaries (Year/Month > Day > Hour)
    const slotW = chartW / Math.max(1, visible.length);
    const minPxGap = 86;
    const sortedByPriority = [...candidates].sort((a, b) => b.priority - a.priority || a.index - b.index);
    const accepted = [];

    for (const cand of sortedByPriority) {
      const x = (cand.index + 0.5) * slotW;
      if (x < 24 || x > chartW - 24) continue;
      const collides = accepted.some((acc) => Math.abs((acc.index - cand.index) * slotW) < minPxGap);
      if (!collides) {
        accepted.push(cand);
      }
    }

    return accepted.sort((a, b) => a.index - b.index);
  },

  formatSignedDiff(open, close, decimals = 2) {
    const o = Number(open);
    const c = Number(close);
    if (!isFinite(o) || !isFinite(c) || !o) return '0.00';
    const diff = c - o;
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff.toFixed(decimals)}`;
  },

  formatSignedPct(open, close) {
    const o = Number(open);
    const c = Number(close);
    if (!o) return '0.00%';
    const pct = ((c - o) / o) * 100;
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  },

  formatCompactVolume(vol) {
    const n = Number(vol || 0);
    if (!isFinite(n) || n <= 0) return '0';
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(Math.round(n));
  },

  formatVolume(vol) {
    return this.formatCompactVolume(vol);
  },

  displayTimeframeLabel(tf = 'M15') {
    const norm = String(tf).toUpperCase();
    if (norm === 'M15') return '15m';
    if (norm === 'M30') return '30m';
    if (norm === 'H1') return '1h';
    if (norm === 'H4') return '4h';
    if (norm === 'D1') return '1D';
    if (norm === 'W1') return '1W';
    return norm;
  },

  stepMilliseconds(timeframe = 'M15') {
    const tf = String(timeframe).toUpperCase();
    if (tf === 'W1') return 7 * 86400000;
    if (tf === 'D1') return 86400000;
    if (tf === 'H4') return 14400000;
    if (tf === 'H1') return 3600000;
    if (tf === 'M30') return 1800000;
    return 900000;
  },

  formatAdaptiveAxisTick(epochMs, prevTickEpochMs = null, timeframe = 'M15') {
    if (!epochMs) return { text: '', isMajor: false };
    const d = new Date(Number(epochMs));
    if (isNaN(d.getTime())) return { text: String(epochMs), isMajor: false };

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = (n) => String(n).padStart(2, '0');
    const tf = String(timeframe).toUpperCase();

    const year = d.getUTCFullYear();
    const monthIdx = d.getUTCMonth();
    const monthName = months[monthIdx];
    const day = d.getUTCDate();
    const hh = pad(d.getUTCHours());
    const mm = pad(d.getUTCMinutes());

    const prevD = prevTickEpochMs ? new Date(Number(prevTickEpochMs)) : null;
    const isNewYear = !prevD || prevD.getUTCFullYear() !== year;
    const isNewMonth = !prevD || isNewYear || prevD.getUTCMonth() !== monthIdx;
    const isNewDay = !prevD || isNewMonth || prevD.getUTCDate() !== day;

    if (tf === 'D1' || tf === 'W1') {
      if (isNewYear && prevD) {
        return { text: String(year), isMajor: true };
      }
      if (isNewMonth && day <= 7) {
        return { text: monthName, isMajor: true };
      }
      return { text: `${day} ${monthName}`, isMajor: false };
    }

    if (tf === 'H4') {
      if (isNewDay) {
        return { text: `${day} ${monthName}`, isMajor: true };
      }
      return { text: `${hh}:${mm}`, isMajor: false };
    }

    if (isNewDay) {
      if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
        return { text: `${day} ${monthName}`, isMajor: true };
      }
      return { text: `${day} ${monthName} ${hh}:${mm}`, isMajor: true };
    }
    return { text: `${hh}:${mm}`, isMajor: false };
  },

  formatAxisTimestamp(epochMs, timeframe = 'M15') {
    const res = this.formatAdaptiveAxisTick(epochMs, null, timeframe);
    return res.text;
  },

  formatCompactAxisUtc(utcInput, timeframe = 'M15', prevUtcInput = null) {
    if (!utcInput) return '';
    const parseToMs = (val) => {
      if (!val) return null;
      if (typeof val === 'number') return val;
      const clean = String(val).replace(' UTC', 'Z').replace(' ', 'T');
      const p = Date.parse(clean);
      return isNaN(p) ? null : p;
    };
    const curMs = parseToMs(utcInput);
    const prevMs = parseToMs(prevUtcInput);
    if (curMs !== null) {
      return this.formatAdaptiveAxisTick(curMs, prevMs, timeframe).text;
    }
    return String(utcInput).slice(5, 16);
  },

  formatCandleUtc(utcInput, timeframe = 'M15') {
    if (!utcInput) return '';
    let ms = null;
    if (typeof utcInput === 'number') {
      ms = utcInput;
    } else {
      const clean = String(utcInput).replace(' UTC', 'Z').replace(' ', 'T');
      const p = Date.parse(clean);
      if (!isNaN(p)) ms = p;
    }
    if (ms !== null) {
      const d = new Date(ms);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const pad = (n) => String(n).padStart(2, '0');
      const day = pad(d.getUTCDate());
      const mon = months[d.getUTCMonth()];
      const yr = String(d.getUTCFullYear()).slice(-2);
      const tf = String(timeframe).toUpperCase();
      if (tf === 'D1' || tf === 'W1') {
        return `${day} ${mon} '${yr}`;
      }
      return `${day} ${mon} '${yr}  ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
    }
    const s = String(utcInput);
    if (s.endsWith(' UTC')) return s;
    return s.slice(0, 16).replace('T', ' ') + ' UTC';
  },

  computeAvailableDateRanges(candles = []) {
    const total = Array.isArray(candles) ? candles.length : 0;
    const presets = [
      { id: '1D', durationMs: 86400000 },
      { id: '5D', durationMs: 5 * 86400000 },
      { id: '1W', durationMs: 7 * 86400000 },
      { id: '1M', durationMs: 30 * 86400000 },
      { id: '3M', durationMs: 90 * 86400000 },
      { id: '6M', durationMs: 180 * 86400000 },
      { id: '9M', durationMs: 270 * 86400000 },
      { id: 'YTD', durationMs: null },
      { id: '1Y', durationMs: 365 * 86400000 },
      { id: '5Y', durationMs: 5 * 365 * 86400000 },
      { id: 'ALL', durationMs: 0 },
    ];
    if (total === 0) {
      return presets.map((p) => ({
        id: p.id,
        label: p.id === 'ALL' ? 'All' : p.id,
        enabled: false,
        count: 12,
      }));
    }

    const firstMs = Number(candles[0].open_time_utc_ms || candles[0].openTimeSec * 1000 || 0);
    const lastMs = Number(
      candles[total - 1].open_time_utc_ms || candles[total - 1].openTimeSec * 1000 || 0
    );
    const spanMs = Math.max(0, lastMs - firstMs);
    const lastYearStartMs = Date.UTC(new Date(lastMs).getUTCFullYear(), 0, 1);

    return presets.map((p) => {
      if (p.id === 'ALL') {
        return { id: 'ALL', label: 'All', enabled: total > 0, count: Math.max(12, total) };
      }
      const cutoffMs = p.id === 'YTD' ? lastYearStartMs : lastMs - p.durationMs;
      const reqSpan = p.id === 'YTD' ? Math.max(86400000, lastMs - lastYearStartMs) : p.durationMs;
      const matchingBars = candles.filter(
        (c) => Number(c.open_time_utc_ms || c.openTimeSec * 1000 || 0) >= cutoffMs
      ).length;
      const enabled = matchingBars >= 4 && (spanMs >= reqSpan * 0.45 || (p.id === '1D' && total >= 4));
      return {
        id: p.id,
        label: p.id,
        enabled,
        count: Math.max(8, Math.min(total, matchingBars || 12)),
      };
    });
  },

  computeSmaSeries(candles = [], period = 20) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const out = new Array(candles.length).fill(null);
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
      sum += Number(candles[i].close || 0);
      if (i >= period) {
        sum -= Number(candles[i - period].close || 0);
      }
      if (i >= period - 1) {
        out[i] = sum / period;
      }
    }
    return out;
  },
};
