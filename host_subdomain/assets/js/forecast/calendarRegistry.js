/**
 * Hierarchical Trading Calendar Registry (v1.0.0)
 * Strictly decoupled from external market-data API providers.
 * Accepts (symbolCode, providerId) or explicit CalendarSpec and exposes deterministic
 * NY DST-aware session open checks, maintenance breaks, holiday closures, and gap counts.
 */

export const CALENDAR_REGISTRY_VERSION = '1.0.0';

const FIXED_HOLIDAYS = Object.freeze({
  US_MAJOR: Object.freeze([
    '01-01', // New Year's Day
    '12-25', // Christmas Day
  ]),
});

// Compute Western (Gregorian) Easter Sunday UTC date for Good Friday holiday detection
function getGoodFridayKey(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mar, 4=Apr
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easterMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const gf = new Date(easterMs - 2 * 86400000);
  const mm = String(gf.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(gf.getUTCDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

export const CALENDAR_PROFILES = Object.freeze({
  OTC_SPOT_XAU_TWELVEDATA: Object.freeze({
    calendarId: 'OTC_SPOT_XAU_TWELVEDATA',
    calendarVersion: CALENDAR_REGISTRY_VERSION,
    ianaTimezone: 'America/New_York',
    dstAware: true,
    sundayOpenHourEt: 18,
    sundayOpenMinuteEt: 0,
    fridayCloseHourEt: 17,
    fridayCloseMinuteEt: 0,
    maintenanceStartHourEt: 17,
    maintenanceEndHourEt: 18,
    usesUsHolidays: true,
    sessionMode: 'FUTURES_OTC_23_5',
  }),
  COMEX_GOLD_FUTURES: Object.freeze({
    calendarId: 'COMEX_GOLD_FUTURES',
    calendarVersion: CALENDAR_REGISTRY_VERSION,
    ianaTimezone: 'America/New_York',
    dstAware: true,
    sundayOpenHourEt: 18,
    sundayOpenMinuteEt: 0,
    fridayCloseHourEt: 17,
    fridayCloseMinuteEt: 0,
    maintenanceStartHourEt: 17,
    maintenanceEndHourEt: 18,
    usesUsHolidays: true,
    sessionMode: 'FUTURES_OTC_23_5',
  }),
  ICE_BRENT_CFD: Object.freeze({
    calendarId: 'ICE_BRENT_CFD',
    calendarVersion: CALENDAR_REGISTRY_VERSION,
    ianaTimezone: 'America/New_York',
    dstAware: true,
    sundayOpenHourEt: 18,
    sundayOpenMinuteEt: 0,
    fridayCloseHourEt: 17,
    fridayCloseMinuteEt: 0,
    maintenanceStartHourEt: 17,
    maintenanceEndHourEt: 20,
    usesUsHolidays: true,
    sessionMode: 'BRENT_CFD',
  }),
  OTC_FX_GENERIC: Object.freeze({
    calendarId: 'OTC_FX_GENERIC',
    calendarVersion: CALENDAR_REGISTRY_VERSION,
    ianaTimezone: 'America/New_York',
    dstAware: true,
    sundayOpenHourEt: 17,
    sundayOpenMinuteEt: 0,
    fridayCloseHourEt: 17,
    fridayCloseMinuteEt: 0,
    maintenanceStartHourEt: -1,
    maintenanceEndHourEt: -1,
    usesUsHolidays: false,
    sessionMode: 'FX_24_5',
  }),
  US_EQUITIES: Object.freeze({
    calendarId: 'US_EQUITIES',
    calendarVersion: CALENDAR_REGISTRY_VERSION,
    ianaTimezone: 'America/New_York',
    dstAware: true,
    sundayOpenHourEt: -1,
    sundayOpenMinuteEt: 0,
    fridayCloseHourEt: 16,
    fridayCloseMinuteEt: 0,
    maintenanceStartHourEt: -1,
    maintenanceEndHourEt: -1,
    usesUsHolidays: true,
    sessionMode: 'US_EQUITIES_RTH',
  }),
  CRYPTO_24_7: Object.freeze({
    calendarId: 'CRYPTO_24_7',
    calendarVersion: CALENDAR_REGISTRY_VERSION,
    ianaTimezone: 'UTC',
    dstAware: false,
    sundayOpenHourEt: 0,
    sundayOpenMinuteEt: 0,
    fridayCloseHourEt: 24,
    fridayCloseMinuteEt: 0,
    maintenanceStartHourEt: -1,
    maintenanceEndHourEt: -1,
    usesUsHolidays: false,
    sessionMode: 'CONTINUOUS_24_7',
  }),
});

const CRYPTO_PREFIXES = [
  'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'BNB', 'AVAX',
  'DOT', 'LINK', 'LTC', 'MATIC', 'SHIB', 'TON', 'TRX', 'UNI',
];

const US_EQUITY_SYMBOLS = new Set([
  'SPX500USD', 'NAS100', 'NAS100USD', 'US30', 'US500', 'US100',
  'NDQ', 'NVDA', 'AMZN', 'TSLA', 'AAPL', 'GOOGL', 'MSFT',
  'META', 'NFLX', 'AMD', 'UBER', 'NKE', 'IBM', 'SAN',
  'AVGO', 'MU', 'INTC', 'MRVL', 'AMAT', 'LRCX', 'QCOM', 'SMCI', 'DELL', 'SNDK', 'ANET',
  'PLTR', 'ORCL', 'CRM', 'ADBE', 'CRWD', 'CSCO', 'APP', 'NBIS', 'CRWV',
  'SPCX', 'RKLB', 'GEV', 'BE', 'IONQ', 'RIVN',
  'JPM', 'BAC', 'GS', 'V', 'MA', 'BRK.B', 'BRKB', 'HOOD', 'MSTR', 'PYPL', 'COIN',
  'WMT', 'COST', 'DIS', 'SBUX', 'MCD', 'KO',
  'LLY', 'UNH', 'PFE', 'XOM', 'CVX',
  'TSM', 'ASML', 'SSNLF', 'SKHY', 'BABA', 'NVO', 'TM', 'SAP', 'HSBC', '2222.SR', '2222SR',
]);

export function resolveCalendarSpec(symbolCode = 'XAUUSD', providerId = '', customCalendar = null) {
  if (customCalendar && typeof customCalendar === 'object' && customCalendar.calendarId) {
    const base = CALENDAR_PROFILES[customCalendar.calendarId] || CALENDAR_PROFILES.OTC_SPOT_XAU_TWELVEDATA;
    return Object.freeze({ ...base, ...customCalendar });
  }
  const code = String(symbolCode || 'XAUUSD').trim().toUpperCase();
  const prov = String(providerId || '').trim().toLowerCase();

  if (
    code === 'SAMPLE' ||
    code.endsWith('USDT') ||
    ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'DOGEUSD', 'ADAUSD', 'BNBUSD'].includes(code) ||
    (CRYPTO_PREFIXES.some((p) => code.startsWith(p)) && (code.endsWith('USD') || code.endsWith('EUR')))
  ) {
    return CALENDAR_PROFILES.CRYPTO_24_7;
  }

  if (
    US_EQUITY_SYMBOLS.has(code) ||
    code.includes('SPX') ||
    code.includes('NAS') ||
    code.includes('NDQ') ||
    code.includes('NDX') ||
    code.includes('US100') ||
    code.includes('US500') ||
    code.includes('US30') ||
    code.includes('DJ30')
  ) {
    return CALENDAR_PROFILES.US_EQUITIES;
  }

  if (code === 'SPOTBRENT' || code === 'BRENT_FUTURES' || code.includes('BRENT')) {
    return CALENDAR_PROFILES.ICE_BRENT_CFD;
  }

  if (code.startsWith('XAU') || code.startsWith('XAG') || code === 'USOIL') {
    if (prov.includes('comex') || prov.includes('cme') || prov === 'yahoo_finance') {
      return CALENDAR_PROFILES.COMEX_GOLD_FUTURES;
    }
    return CALENDAR_PROFILES.OTC_SPOT_XAU_TWELVEDATA;
  }

  return CALENDAR_PROFILES.OTC_FX_GENERIC;
}

const nyDstCache = new Map();

export function getNewYorkDstBoundsUtcMs(year) {
  let cached = nyDstCache.get(year);
  if (cached) return cached;
  const mar1Dow = new Date(Date.UTC(year, 2, 1)).getUTCDay();
  const secondSunMarDay = 8 + ((7 - mar1Dow) % 7);
  const dstStartUtcMs = Date.UTC(year, 2, secondSunMarDay, 7, 0, 0, 0);

  const nov1Dow = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const firstSunNovDay = 1 + ((7 - nov1Dow) % 7);
  const dstEndUtcMs = Date.UTC(year, 10, firstSunNovDay, 6, 0, 0, 0);

  cached = { dstStartUtcMs, dstEndUtcMs };
  nyDstCache.set(year, cached);
  return cached;
}

export function isNewYorkDst(utcEpochMs) {
  const approxYear = new Date(utcEpochMs).getUTCFullYear();
  const { dstStartUtcMs, dstEndUtcMs } = getNewYorkDstBoundsUtcMs(approxYear);
  return utcEpochMs >= dstStartUtcMs && utcEpochMs < dstEndUtcMs;
}

export function getNewYorkParts(epochMs) {
  const ms = Number(epochMs || 0);
  const offsetHours = isNewYorkDst(ms) ? -4 : -5;
  const d = new Date(ms + offsetHours * 3600000);
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return {
    year: d.getUTCFullYear(),
    month,
    day,
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dow: d.getUTCDay(), // 0=Sun..6=Sat
    mmdd: `${mm}-${dd}`,
  };
}

export function stepMillisecondsForTimeframe(timeframe = 'M15') {
  const tf = String(timeframe || 'M15').trim().toUpperCase();
  if (tf === 'W1') return 7 * 86400000;
  if (tf === 'D1') return 86400000;
  if (tf === 'H4') return 14400000;
  if (tf === 'H1') return 3600000;
  if (tf === 'M30') return 1800000;
  return 900000;
}

export function isCalendarHoliday(nyParts, spec) {
  if (!spec.usesUsHolidays) return false;
  if (FIXED_HOLIDAYS.US_MAJOR.includes(nyParts.mmdd)) return true;
  return nyParts.mmdd === getGoodFridayKey(nyParts.year);
}

export function isMarketOpenForCalendar(epochMs, calendarSpec) {
  const spec = calendarSpec || CALENDAR_PROFILES.OTC_SPOT_XAU_TWELVEDATA;
  if (spec.sessionMode === 'CONTINUOUS_24_7' || !spec.dstAware && spec.ianaTimezone === 'UTC') {
    return true;
  }

  const ny = getNewYorkParts(epochMs);
  if (spec.sessionMode === 'US_EQUITIES_RTH') {
    if (ny.dow === 0 || ny.dow === 6) return false;
    if (isCalendarHoliday(ny, spec)) return false;
    const mins = ny.hour * 60 + ny.minute;
    return mins >= 9 * 60 + 30 && mins < 16 * 60;
  }

  if (ny.dow === 6) return false;
  if (ny.dow === 5) {
    const mins = ny.hour * 60 + ny.minute;
    const closeMins = spec.fridayCloseHourEt * 60 + (spec.fridayCloseMinuteEt || 0);
    if (mins >= closeMins) return false;
  }
  if (ny.dow === 0) {
    const mins = ny.hour * 60 + ny.minute;
    const openMins = spec.sundayOpenHourEt * 60 + (spec.sundayOpenMinuteEt || 0);
    return mins >= openMins;
  }

  if (isCalendarHoliday(ny, spec)) return false;

  if (spec.maintenanceStartHourEt >= 0 && spec.maintenanceEndHourEt > spec.maintenanceStartHourEt) {
    if (ny.hour >= spec.maintenanceStartHourEt && ny.hour < spec.maintenanceEndHourEt) {
      return false;
    }
  }
  return true;
}

export function getCandleCloseMsForCalendar(openTimeUtcMs, timeframe = 'M15', calendarSpec = null) {
  const step = stepMillisecondsForTimeframe(timeframe);
  return Number(openTimeUtcMs) + step;
}

export function isCandleClosedForCalendar(openTimeUtcMs, timeframe = 'M15', nowUtcMs = Date.now(), calendarSpec = null) {
  return getCandleCloseMsForCalendar(openTimeUtcMs, timeframe, calendarSpec) <= Number(nowUtcMs);
}

export function advanceFutureTimestampsWithCalendar(
  lastOpenMs,
  timeframe = 'M15',
  horizon = 30,
  symbolCode = '',
  providerId = '',
  customCalendar = null
) {
  const spec = customCalendar || resolveCalendarSpec(symbolCode, providerId);
  const stepMs = stepMillisecondsForTimeframe(timeframe);
  const start = Number.isFinite(lastOpenMs) && lastOpenMs > 0 ? lastOpenMs : Date.now();
  const timestamps = [];
  let cursor = start;
  const maxIterations = horizon * 24 + 480;
  let guard = 0;

  while (timestamps.length < horizon && guard < maxIterations) {
    guard++;
    cursor += stepMs;
    if (spec.sessionMode === 'CONTINUOUS_24_7' || isMarketOpenForCalendar(cursor, spec)) {
      timestamps.push(cursor);
    }
  }
  while (timestamps.length < horizon) {
    cursor += stepMs;
    timestamps.push(cursor);
  }
  return timestamps;
}

/**
 * Counts unexpected missing-bar gaps during officially open market hours.
 * Weekend closures, daily maintenance breaks (e.g. 17:00-18:00 ET), DST shifts, and holidays produce 0 false gaps.
 */
export function inspectCalendarGaps(candles = [], timeframe = 'M15', calendarSpec = null) {
  const spec = calendarSpec || CALENDAR_PROFILES.OTC_SPOT_XAU_TWELVEDATA;
  const stepMs = stepMillisecondsForTimeframe(timeframe);
  const gaps = [];
  if (!Array.isArray(candles) || candles.length < 2) {
    return { gapCount: 0, totalMissingBars: 0, gaps };
  }

  for (let i = 1; i < candles.length; i++) {
    const prevMs = Number(candles[i - 1].openTimeUtcMs ?? candles[i - 1].open_time_utc_ms ?? 0);
    const curMs = Number(candles[i].openTimeUtcMs ?? candles[i].open_time_utc_ms ?? 0);
    if (!Number.isFinite(prevMs) || !Number.isFinite(curMs) || curMs <= prevMs) continue;
    const diff = curMs - prevMs;
    if (diff <= stepMs) continue;

    let missingOpenBars = 0;
    const maxCheck = Math.min(Math.floor(diff / stepMs) - 1, 500);
    for (let k = 1; k <= maxCheck; k++) {
      const probe = prevMs + k * stepMs;
      if (isMarketOpenForCalendar(probe, spec)) {
        missingOpenBars++;
      }
    }
    if (missingOpenBars > 0) {
      gaps.push({
        index: i,
        prevOpenMs: prevMs,
        curOpenMs: curMs,
        missingOpenBars,
      });
    }
  }

  return {
    gapCount: gaps.length,
    totalMissingBars: gaps.reduce((s, g) => s + g.missingOpenBars, 0),
    gaps,
  };
}
