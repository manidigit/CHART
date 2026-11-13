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

  getDateParts(epochMs, timezoneMode = 'UTC') {
    const d = new Date(Number(epochMs));
    const isLocal = String(timezoneMode || 'UTC').toUpperCase() === 'LOCAL';
    return {
      yr: isLocal ? d.getFullYear() : d.getUTCFullYear(),
      mo: isLocal ? d.getMonth() : d.getUTCMonth(),
      day: isLocal ? d.getDate() : d.getUTCDate(),
      hr: isLocal ? d.getHours() : d.getUTCHours(),
      mn: isLocal ? d.getMinutes() : d.getUTCMinutes(),
      sec: isLocal ? d.getSeconds() : d.getUTCSeconds(),
      dow: isLocal ? d.getDay() : d.getUTCDay(),
      tzOffsetMin: isLocal ? -d.getTimezoneOffset() : 0,
    };
  },

  formatLiveClock(timezoneMode = 'UTC', nowMs = Date.now()) {
    const isLocal = String(timezoneMode || 'UTC').toUpperCase() === 'LOCAL';
    const p = this.getDateParts(nowMs, isLocal ? 'LOCAL' : 'UTC');
    const pad = (n) => String(n).padStart(2, '0');
    const timeStr = `${pad(p.hr)}:${pad(p.mn)}:${pad(p.sec)}`;
    if (!isLocal) return `${timeStr} UTC`;
    const offMin = p.tzOffsetMin;
    const sign = offMin >= 0 ? '+' : '-';
    const absM = Math.abs(offMin);
    const oh = pad(Math.floor(absM / 60));
    const om = pad(absM % 60);
    return `${timeStr} (${sign}${oh}:${om})`;
  },

  /**
   * TradingView-Grade Smart Calendar-Aligned X-Axis Tick Generator.
   * Inspects both the active timeframe AND the actual visible calendar span (days/months/years)
   * to snap grid lines and labels onto true Year, Month, Day, or Round-Hour boundaries.
   */
  computeSmartTimeAxisTicks(visible = [], chartW = 800, timeframe = 'M15', timezoneMode = 'UTC') {
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
      const p = this.getDateParts(ms, timezoneMode);
      const { yr, mo, day, hr, mn, dow } = p;

      const prevMs = i > 0 ? getMs(visible[i - 1]) : null;
      const prevP = prevMs ? this.getDateParts(prevMs, timezoneMode) : null;

      const isNewYear = !prevP || prevP.yr !== yr;
      const isNewMonth = !prevP || isNewYear || prevP.mo !== mo;
      const isNewDay = !prevP || isNewMonth || prevP.day !== day;

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
          (!prevP || prevP.day < 14)
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
        } else if (isNewDay && (dow === 1 || day % 5 === 1)) {
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
        const fp = this.getDateParts(ms, timezoneMode);
        const label =
          tf === 'D1' || tf === 'W1' || spanDays > 12
            ? `${fp.day} ${months[fp.mo]}`
            : `${pad(fp.hr)}:${pad(fp.mn)}`;
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

  isCrypto24x7(symbolCode = '') {
    const code = String(symbolCode || '').trim().toUpperCase();
    const cryptoPrefixes = [
      'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'BNB', 'AVAX',
      'DOT', 'LINK', 'LTC', 'MATIC', 'SHIB', 'TON', 'TRX', 'UNI',
    ];
    return (
      ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'DOGEUSD', 'ADAUSD', 'BNBUSD'].includes(code) ||
      code.endsWith('USDT') ||
      (cryptoPrefixes.some((p) => code.startsWith(p)) &&
        (code.endsWith('USD') || code.endsWith('USDT') || code.endsWith('EUR')))
    );
  },

  getSessionCalendar(symbolCode = 'XAUUSD') {
    const code = String(symbolCode || '').trim().toUpperCase();
    if (this.isCrypto24x7(code)) return 'CRYPTO_24_7';
    const usEquities = [
      'SPX500USD', 'NAS100', 'NAS100USD', 'US30', 'US500', 'US100',
      'NDQ', 'NVDA', 'AMZN', 'TSLA', 'AAPL', 'GOOGL', 'MSFT',
      'META', 'NFLX', 'AMD', 'UBER', 'NKE', 'IBM', 'SAN',
    ];
    if (
      usEquities.includes(code) ||
      code.includes('SPX') ||
      code.includes('NAS') ||
      code.includes('NDQ') ||
      code.includes('NDX') ||
      code.includes('US100') ||
      code.includes('US500') ||
      code.includes('US30') ||
      code.includes('DJ30')
    ) {
      return 'US_EQUITIES';
    }
    return 'OTC_FX_METALS';
  },

  getInstrumentTimezone(symbolCode = 'XAUUSD') {
    const cal = this.getSessionCalendar(symbolCode);
    if (cal === 'CRYPTO_24_7') return 'UTC';
    if (cal === 'US_EQUITIES') return 'America/New_York';
    return 'Etc/GMT+0 (NY 17:00 Rollover)';
  },

  getVolumeType(symbolCode = 'XAUUSD', providerId = '') {
    const prov = String(providerId || '').trim().toLowerCase();
    if (prov === 'eia_brent_spot') return 'NONE';
    const cal = this.getSessionCalendar(symbolCode);
    if (cal === 'CRYPTO_24_7' || cal === 'US_EQUITIES') {
      return ['yahoo_finance', 'twelve_data', 'stooq', 'tvdatafeed', 'biquote'].includes(prov)
        ? 'REAL_EXCHANGE'
        : 'TICK_ESTIMATED';
    }
    return 'TICK_ESTIMATED';
  },

  snapToOpenUtcMs(epochMs, timeframe = 'M15') {
    const ms = Number(epochMs || 0);
    if (!isFinite(ms) || ms <= 0) return 0;
    const tf = String(timeframe || 'M15').toUpperCase();
    const step = this.stepMilliseconds(tf);
    if (tf === 'W1') {
      const mondayOffsetMs = 259200000; // 3 days * 86400s * 1000ms (1970-01-01 was Thursday)
      return Math.floor((ms + mondayOffsetMs) / step) * step - mondayOffsetMs;
    }
    return Math.floor(ms / step) * step;
  },

  _nyDstCache: new Map(),

  _getNewYorkDstBoundsUtcMs(year) {
    let cached = this._nyDstCache.get(year);
    if (cached) return cached;
    // US Daylight Saving Time (since 2007):
    // Starts 2nd Sunday in March at 02:00 EST (07:00 UTC)
    // Ends 1st Sunday in November at 02:00 EDT (06:00 UTC)
    const mar1Dow = new Date(Date.UTC(year, 2, 1)).getUTCDay();
    const secondSunMarDay = 8 + ((7 - mar1Dow) % 7);
    const dstStartUtcMs = Date.UTC(year, 2, secondSunMarDay, 7, 0, 0, 0);

    const nov1Dow = new Date(Date.UTC(year, 10, 1)).getUTCDay();
    const firstSunNovDay = 1 + ((7 - nov1Dow) % 7);
    const dstEndUtcMs = Date.UTC(year, 10, firstSunNovDay, 6, 0, 0, 0);

    cached = { dstStartUtcMs, dstEndUtcMs };
    this._nyDstCache.set(year, cached);
    return cached;
  },

  _isNewYorkDst(utcEpochMs) {
    const approxYear = new Date(utcEpochMs).getUTCFullYear();
    const { dstStartUtcMs, dstEndUtcMs } = this._getNewYorkDstBoundsUtcMs(approxYear);
    return utcEpochMs >= dstStartUtcMs && utcEpochMs < dstEndUtcMs;
  },

  _getNewYorkParts(epochMs) {
    const ms = Number(epochMs || 0);
    const offsetHours = this._isNewYorkDst(ms) ? -4 : -5;
    const nyShiftedMs = ms + offsetHours * 3600000;
    const d = new Date(nyShiftedMs);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      weekday: days[d.getUTCDay()],
    };
  },

  _nyWallClockToUtcMs(year, month, day, hour, minute) {
    // Try EST (-5h -> +5h UTC) first, then check if that instant falls in EDT (-4h -> +4h UTC)
    const estGuessUtcMs = Date.UTC(year, month - 1, day, hour + 5, minute, 0, 0);
    if (this._isNewYorkDst(estGuessUtcMs)) {
      return Date.UTC(year, month - 1, day, hour + 4, minute, 0, 0);
    }
    return estGuessUtcMs;
  },

  getSessionBucketBounds(epochMs, timeframe = 'M15', symbolCode = 'XAUUSD') {
    const ms = Number(epochMs || 0);
    const tf = String(timeframe || 'M15').toUpperCase();
    const step = this.stepMilliseconds(tf);
    const cal = this.getSessionCalendar(symbolCode);

    if (!isFinite(ms) || ms <= 0) {
      return { openMs: 0, closeMs: 0, sessionAnchored: false };
    }
    if (tf === 'W1' || cal === 'CRYPTO_24_7' || tf === 'M15' || tf === 'M30') {
      const openMs = this.snapToOpenUtcMs(ms, tf);
      return { openMs, closeMs: openMs + step, sessionAnchored: false };
    }

    if (cal === 'US_EQUITIES') {
      const ny = this._getNewYorkParts(ms);
      const sessionStartMs = this._nyWallClockToUtcMs(ny.year, ny.month, ny.day, 9, 30);
      const sessionEndMs = this._nyWallClockToUtcMs(ny.year, ny.month, ny.day, 16, 0);
      if (tf === 'D1') {
        const utcDayOpenMs = this.snapToOpenUtcMs(ms, 'D1');
        return {
          openMs: utcDayOpenMs,
          closeMs: Math.max(utcDayOpenMs + 1, sessionEndMs),
          sessionAnchored: true,
        };
      }
      if (ms >= sessionStartMs && ms < sessionEndMs) {
        const idx = Math.floor((ms - sessionStartMs) / step);
        const openMs = sessionStartMs + idx * step;
        return {
          openMs,
          closeMs: Math.min(sessionEndMs, openMs + step),
          sessionAnchored: true,
        };
      }
      const idx = Math.floor((ms - sessionStartMs) / step);
      const openMs = sessionStartMs + idx * step;
      return { openMs, closeMs: openMs + step, sessionAnchored: true };
    }

    if (cal === 'OTC_FX_METALS' && tf === 'D1') {
      const shiftedNy = this._getNewYorkParts(ms + 7 * 3600000);
      const utcDayOpenMs = Date.UTC(shiftedNy.year, shiftedNy.month - 1, shiftedNy.day, 0, 0, 0, 0);
      const rolloverCloseMs = this._nyWallClockToUtcMs(shiftedNy.year, shiftedNy.month, shiftedNy.day, 17, 0);
      return {
        openMs: utcDayOpenMs,
        closeMs: rolloverCloseMs,
        sessionAnchored: true,
      };
    }

    const openMs = this.snapToOpenUtcMs(ms, tf);
    return { openMs, closeMs: openMs + step, sessionAnchored: false };
  },

  snapToSessionOpenUtcMs(epochMs, timeframe = 'M15', symbolCode = 'XAUUSD') {
    return this.getSessionBucketBounds(epochMs, timeframe, symbolCode).openMs;
  },

  isCandleClosed(openTimeUtcMs, timeframe = 'M15', nowUtcMs = Date.now(), symbolCode = 'XAUUSD') {
    const openMs = Number(openTimeUtcMs || 0);
    const nowMs = Number(nowUtcMs || Date.now());
    const bounds = this.getSessionBucketBounds(openMs, timeframe, symbolCode);
    if (bounds.sessionAnchored) {
      return bounds.closeMs <= nowMs;
    }
    const step = this.stepMilliseconds(timeframe);
    return openMs + step <= nowMs;
  },

  getSessionDayKey(epochMs, symbolCode = 'XAUUSD') {
    const ms = Number(epochMs || 0);
    const cal = this.getSessionCalendar(symbolCode);
    if (cal === 'CRYPTO_24_7') {
      const d = new Date(ms);
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      return `${y}-${m < 10 ? '0' + m : m}-${day < 10 ? '0' + day : day}`;
    }
    // For OTC_FX_METALS (NY 17:00 rollover) add 7h to NY time so 17:00 NY flips to next day
    // For US_EQUITIES use exact America/New_York calendar date
    const shiftedMs = cal === 'OTC_FX_METALS' ? ms + 7 * 3600000 : ms;
    const ny = this._getNewYorkParts(shiftedMs);
    return `${ny.year}-${ny.month < 10 ? '0' + ny.month : ny.month}-${ny.day < 10 ? '0' + ny.day : ny.day}`;
  },

  isOtcWeekendClosed(epochMs = Date.now(), symbolCode = 'XAUUSD') {
    return !this.isMarketOpen(epochMs, symbolCode);
  },

  isMarketOpen(epochMs = Date.now(), symbolCode = 'XAUUSD') {
    const cal = this.getSessionCalendar(symbolCode);
    if (cal === 'CRYPTO_24_7') return true;
    const ny = this._getNewYorkParts(epochMs);
    if (cal === 'US_EQUITIES') {
      if (ny.weekday === 'Sat' || ny.weekday === 'Sun') return false;
      const mins = ny.hour * 60 + ny.minute;
      return mins >= 9 * 60 + 30 && mins < 16 * 60;
    }
    if (ny.weekday === 'Sat') return false;
    if (ny.weekday === 'Sun') return ny.hour >= 17;
    if (ny.weekday === 'Fri') return ny.hour < 17;
    return true;
  },

  formatAdaptiveAxisTick(epochMs, prevTickEpochMs = null, timeframe = 'M15', timezoneMode = 'UTC') {
    if (!epochMs) return { text: '', isMajor: false };
    const d = new Date(Number(epochMs));
    if (isNaN(d.getTime())) return { text: String(epochMs), isMajor: false };

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = (n) => String(n).padStart(2, '0');
    const tf = String(timeframe).toUpperCase();

    const p = this.getDateParts(Number(epochMs), timezoneMode);
    const year = p.yr;
    const monthIdx = p.mo;
    const monthName = months[monthIdx];
    const day = p.day;
    const hh = pad(p.hr);
    const mm = pad(p.mn);

    const prevP = prevTickEpochMs ? this.getDateParts(Number(prevTickEpochMs), timezoneMode) : null;
    const isNewYear = !prevP || prevP.yr !== year;
    const isNewMonth = !prevP || isNewYear || prevP.mo !== monthIdx;
    const isNewDay = !prevP || isNewMonth || prevP.day !== day;

    if (tf === 'D1' || tf === 'W1') {
      if (isNewYear && prevP) {
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
      if (p.hr === 0 && p.mn === 0) {
        return { text: `${day} ${monthName}`, isMajor: true };
      }
      return { text: `${day} ${monthName} ${hh}:${mm}`, isMajor: true };
    }
    return { text: `${hh}:${mm}`, isMajor: false };
  },

  formatAxisTimestamp(epochMs, timeframe = 'M15', timezoneMode = 'UTC') {
    const res = this.formatAdaptiveAxisTick(epochMs, null, timeframe, timezoneMode);
    return res.text;
  },

  formatCompactAxisUtc(utcInput, timeframe = 'M15', prevUtcInput = null, timezoneMode = 'UTC') {
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
      return this.formatAdaptiveAxisTick(curMs, prevMs, timeframe, timezoneMode).text;
    }
    return String(utcInput).slice(5, 16);
  },

  formatCandleUtc(utcInput, timeframe = 'M15', timezoneMode = 'UTC') {
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
      const p = this.getDateParts(ms, timezoneMode);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const pad = (n) => String(n).padStart(2, '0');
      const day = pad(p.day);
      const mon = months[p.mo];
      const yr = String(p.yr).slice(-2);
      const tf = String(timeframe).toUpperCase();
      if (tf === 'D1' || tf === 'W1') {
        return `${day} ${mon} '${yr}`;
      }
      const isLocal = String(timezoneMode || 'UTC').toUpperCase() === 'LOCAL';
      const tzLabel = isLocal ? 'Local' : 'UTC';
      return `${day} ${mon} '${yr}  ${pad(p.hr)}:${pad(p.mn)} ${tzLabel}`;
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
