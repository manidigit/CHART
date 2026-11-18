import {
  CALENDAR_PROFILES,
  CALENDAR_REGISTRY_VERSION,
  advanceFutureTimestampsWithCalendar,
  getCandleCloseMsForCalendar,
  inspectCalendarGaps,
  resolveCalendarSpec,
} from './calendarRegistry.js?v=2.0.0';

export const CONTRACT_VERSION = 'forecast-contract/v2';
export const LEGACY_CONTRACT_VERSION = 'forecast-contract/v1';
export const SPEC_VERSION = '2.1.0';
export const ENGINE_VERSION = '2.0.0';
export const FEATURE_PIPELINE_VERSION = '2.1.0';
export const MODEL_REGISTRY_VERSION = '2.1.0';

export const RENDER_MODES = Object.freeze({
  FAN_CHART: 'FAN_CHART',
  HYBRID: 'HYBRID',
  GHOST_CANDLES: 'GHOST_CANDLES',
});

export const FORECAST_STATUS = Object.freeze({
  VALID: 'VALID',
  PROVISIONAL: 'PROVISIONAL',
  NO_EDGE: 'NO_EDGE',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  DATA_NOT_READY: 'DATA_NOT_READY',
});

export const SCENARIO_STATUS = Object.freeze({
  ESTIMABLE: 'ESTIMABLE',
  NOT_ESTIMABLE: 'NOT_ESTIMABLE',
});

export const SCENARIO_IDS = Object.freeze({
  BULLISH_EXPANSION: 'BULLISH_EXPANSION',
  RANGE_CONTAINMENT: 'RANGE_CONTAINMENT',
  BEARISH_CONTRACTION: 'BEARISH_CONTRACTION',
});

export const REMOTE_WORKER_STATUS = Object.freeze({
  LOCAL_STATISTICAL_ONLY: 'LOCAL_STATISTICAL_ONLY',
  UNCONFIGURED: 'UNCONFIGURED',
  CONNECTED: 'CONNECTED',
  ERROR: 'ERROR',
});

export const OOD_STATUS = Object.freeze({
  IN_DISTRIBUTION: 'IN_DISTRIBUTION',
  ELEVATED: 'ELEVATED',
  EXTREME: 'EXTREME',
});

export const NO_EDGE_GATE_STATE = Object.freeze({
  EDGE_SUPPORTED: 'EDGE_SUPPORTED',
  NO_EDGE_DETECTED: 'NO_EDGE_DETECTED',
});

export const MTF_ALIGNMENT_STATE = Object.freeze({
  ALIGNED: 'ALIGNED',
  NATURAL_HORIZON_DIVERGENCE: 'NATURAL_HORIZON_DIVERGENCE',
  STRUCTURAL_CONFLICT: 'STRUCTURAL_CONFLICT',
  SINGLE_TIMEFRAME: 'SINGLE_TIMEFRAME',
});

export const LIFECYCLE_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  MATURED: 'MATURED',
  SUPERSEDED: 'SUPERSEDED',
  CANCELLED: 'CANCELLED',
});

export const EVALUATION_OUTCOME = Object.freeze({
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  AMBIGUOUS: 'AMBIGUOUS',
  INCOMPLETE_DATA: 'INCOMPLETE_DATA',
});

export const MODEL_EXECUTION_STATUS = Object.freeze({
  SUCCESS: 'SUCCESS',
  SKIPPED_LOW_DATA: 'SKIPPED_LOW_DATA',
  FAILED: 'FAILED',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
});

export const EXECUTION_RUNTIME = Object.freeze({
  NATIVE_JS: 'NATIVE_JS',
  NATIVE_KOTLIN: 'NATIVE_KOTLIN',
  NATIVE_PHP: 'NATIVE_PHP',
  PYTHON_WORKER: 'PYTHON_WORKER',
});

export const SELECTION_MODE = Object.freeze({
  AUTO_OOS_BEST: 'AUTO_OOS_BEST',
  MANUAL_OVERRIDE: 'MANUAL_OVERRIDE',
  NO_CLEAR_WINNER_BASELINE: 'NO_CLEAR_WINNER_BASELINE',
  INSUFFICIENT_EVIDENCE_BASELINE: 'INSUFFICIENT_EVIDENCE_BASELINE',
});

export const EVENT_DICTIONARY_DEFAULTS = Object.freeze({
  priceBasis: 'MID_OHLC',
  evaluationRule: 'HIGH_LOW_AND_CLOSE',
  penetrationAtrMult: 0.2,
  reclaimWindowBars: 3,
  confirmedBreakoutCloses: 2,
});

const K_SHA256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(message) {
  const bytes = new TextEncoder().encode(String(message ?? ''));
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const dv = new DataView(padded.buffer);
  const hiBits = Math.floor(bitLen / 0x100000000);
  const loBits = bitLen >>> 0;
  dv.setUint32(paddedLen - 8, hiBits, false);
  dv.setUint32(paddedLen - 4, loBits, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K_SHA256[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((v) => v.toString(16).padStart(8, '0')).join('');
}

/**
 * IEEE-754 12-significant-digit canonicalization without trailing zeroes or -0.
 * Shared bit-exact spec with Kotlin CanonicalJson serializer.
 */
export function roundToSignificant(v, digits = 12) {
  if (!Number.isFinite(v)) {
    throw new Error(`Non-finite numeric value encountered during canonical serialization: ${v}`);
  }
  if (v === 0) return 0;
  const n = Number(v.toPrecision(digits));
  return Object.is(n, -0) ? 0 : n;
}

export function canonicalJson(value) {
  if (value === null || value === undefined) {
    return '"NULL"';
  }
  if (typeof value === 'number') {
    const clean = roundToSignificant(value, 12);
    return String(clean);
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

/**
 * Legacy v1 canonicalJson preserved exclusively for backward-compatible verification of archived v1 ledger records.
 */
export function canonicalJsonV1Legacy(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return JSON.stringify(Number(value.toFixed(8)));
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonV1Legacy(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonV1Legacy(value[k])}`).join(',')}}`;
}

export function normalizeRenderMode(mode) {
  const m = String(mode || '').trim().toUpperCase();
  if (m === RENDER_MODES.FAN_CHART || m === RENDER_MODES.GHOST_CANDLES || m === RENDER_MODES.HYBRID) {
    return m;
  }
  return RENDER_MODES.FAN_CHART;
}

export function clampHorizonBars(horizon) {
  const n = Math.round(Number(horizon) || 30);
  return Math.max(10, Math.min(60, n));
}

export function extractCandleClose(c) {
  return Number(c?.close);
}

export function extractCandleOpenMs(c, fallback = NaN) {
  if (!c) return fallback;
  const rawMs = c.open_time_utc_ms ?? c.openTimeUtcMs ?? c.time;
  if (rawMs !== undefined && rawMs !== null) {
    const num = Number(rawMs);
    if (Number.isFinite(num) && num > 0) {
      return num < 1e12 && !c.open_time_utc_ms && !c.openTimeUtcMs ? num * 1000 : num;
    }
  }
  const rawSec = Number(c.openTimeSec);
  if (Number.isFinite(rawSec) && rawSec > 0) return rawSec * 1000;
  return fallback;
}

/**
 * Rev 2.1 Closed-Form Disjoint 7-Segment Nested Walk-Forward Budget.
 * Zero overlapping indices across Train -> (H+E) -> Val -> (H+E) -> Cal -> (H+E) -> Outer.
 * Matches table exactly:
 *   H=10: N_op_min=155, N_stat_min=465
 *   H=20: N_op_min=232, N_stat_min=852
 *   H=30: N_op_min=318, N_stat_min=1248
 *   H=60: N_op_min=550, N_stat_min=2410
 */
export function computeHorizonRequirements(horizonBars = 30) {
  const H = clampHorizonBars(horizonBars);
  const embargoGap = Math.max(5, Math.ceil(0.25 * H));
  const purgeGap = H;
  const gapTotal = purgeGap + embargoGap;

  const lTrain = H <= 30 ? 60 + 2 * H : 120 + Math.round(((H - 30) * 40) / 30);
  const sVal = Math.max(1, Math.round(H / 5));
  const sCal = Math.max(1, Math.round(H / 10));
  const sOuter = H;

  const computeTotal = (kVal, mCal, kOuter) => {
    const valSpan = (kVal - 1) * sVal + 1;
    const calSpan = (mCal - 1) * sCal + 1;
    const lPrefix = lTrain + gapTotal + valSpan + gapTotal + calSpan + 1;
    return {
      lPrefix,
      total: lPrefix + gapTotal + (kOuter - 1) * sOuter + H,
    };
  };

  const stat = computeTotal(10, 20, 30);
  const op = computeTotal(5, 10, 1);

  return {
    horizonBars: H,
    purgeGap,
    embargoGap,
    gapTotal,
    lTrain,
    kValStat: 10,
    sVal,
    mCalStat: 20,
    sCal,
    kOuterStat: 30,
    sOuter,
    lPrefixStat: stat.lPrefix,
    nStatMin: stat.total,
    nOpMin: op.total,
  };
}

/**
 * Rev 2.1 Zero-Clamping Data Readiness Gate.
 * Rejects corrupted OHLC, out-of-order/duplicate timestamps, unclosed bars, disallowed gaps, or insufficient bars.
 */
export function validateDataReadiness(candles, minBarsOrOptions = {}) {
  const opts =
    typeof minBarsOrOptions === 'number'
      ? { minBars: minBarsOrOptions, horizonBars: 10, symbolCode: 'SAMPLE', providerId: 'internal', enforceCalendarGaps: false }
      : (minBarsOrOptions || {});

  const horizonBars = clampHorizonBars(opts.horizonBars ?? 30);
  const req = computeHorizonRequirements(horizonBars);
  const nOpMin = Number.isFinite(Number(opts.minBars)) ? Math.max(2, Number(opts.minBars)) : req.nOpMin;
  const timeframe = String(opts.timeframe || 'M15').toUpperCase();
  const symbolCode = String(opts.symbolCode || 'XAUUSD').toUpperCase();
  const providerId = String(opts.providerId || 'twelvedata');
  const calendarSpec = opts.calendarSpec || resolveCalendarSpec(symbolCode, providerId);
  const anchorNowMs = opts.anchorNowMs !== undefined && opts.anchorNowMs !== null ? Number(opts.anchorNowMs) : Date.now();

  const issues = [];
  const errorCodes = [];

  if (!Array.isArray(candles) || candles.length === 0) {
    return {
      ready: false,
      statisticallySufficient: false,
      barCount: 0,
      validBarCount: 0,
      nOpMin,
      nStatMin: req.nStatMin,
      minBars: nOpMin,
      errorCodes: ['EMPTY_OR_MISSING'],
      issues: ['No historical candles available'],
      calendarId: calendarSpec.calendarId,
      calendarVersion: calendarSpec.calendarVersion || CALENDAR_REGISTRY_VERSION,
      disallowedGapCount: 0,
      cleanCandles: [],
    };
  }

  let corruptedOhlc = 0;
  let nonMonotonic = 0;
  let prevMs = -Infinity;
  const cleanCandles = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const o = Number(c?.open);
    const h = Number(c?.high);
    const l = Number(c?.low);
    const cl = Number(c?.close);
    const vRaw = c?.volume;
    const v = vRaw === undefined || vRaw === null ? 0 : Number(vRaw);
    const ms = extractCandleOpenMs(c, NaN);

    if (
      !Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(cl) ||
      o <= 0 || h <= 0 || l <= 0 || cl <= 0 ||
      !Number.isFinite(v) || v < 0 ||
      h < l || h < Math.max(o, cl) || l > Math.min(o, cl)
    ) {
      corruptedOhlc++;
      continue;
    }

    if (!Number.isFinite(ms)) {
      corruptedOhlc++;
      continue;
    }

    if (ms <= prevMs) {
      nonMonotonic++;
    }
    prevMs = ms;
    cleanCandles.push({
      open: o,
      high: h,
      low: l,
      close: cl,
      volume: v,
      openTimeUtcMs: ms,
    });
  }

  if (corruptedOhlc > 0) {
    errorCodes.push('OHLC_CORRUPTED');
    issues.push(`OHLC_CORRUPTED: Detected ${corruptedOhlc} bars with invalid/non-finite/inverted OHLC (zero silent clamping)`);
  }
  if (nonMonotonic > 0) {
    errorCodes.push('NON_MONOTONIC_OR_DUPLICATE_TIMESTAMP');
    issues.push(`NON_MONOTONIC_OR_DUPLICATE_TIMESTAMP: Detected ${nonMonotonic} out-of-order or duplicate timestamps`);
  }

  if (cleanCandles.length > 0 && opts.checkClosedBar !== false) {
    const lastMs = cleanCandles[cleanCandles.length - 1].openTimeUtcMs;
    const closeMs = getCandleCloseMsForCalendar(lastMs, timeframe, calendarSpec);
    if (closeMs > anchorNowMs) {
      errorCodes.push('UNCLOSED_BAR_DETECTED');
      issues.push(`UNCLOSED_BAR_DETECTED: Last bar closes at ${closeMs} > anchorNowMs ${anchorNowMs}`);
    }
  }

  let gapReport = { gapCount: 0, totalMissingBars: 0, gaps: [] };
  if (cleanCandles.length >= 2 && nonMonotonic === 0) {
    gapReport = inspectCalendarGaps(cleanCandles, timeframe, calendarSpec);
    if (opts.enforceCalendarGaps === true && gapReport.gapCount > 0) {
      errorCodes.push('DISALLOWED_MARKET_GAP');
      issues.push(`DISALLOWED_MARKET_GAP: ${gapReport.gapCount} unexpected gaps (${gapReport.totalMissingBars} bars) during open session`);
    }
  }

  if (cleanCandles.length < nOpMin) {
    errorCodes.push('BELOW_OPERATIONAL_MIN_BARS');
    issues.push(`Need at least ${nOpMin} clean closed bars for H=${horizonBars} (found ${cleanCandles.length})`);
  }

  const ready = errorCodes.length === 0;
  const statisticallySufficient = ready && cleanCandles.length >= req.nStatMin;

  return {
    ready,
    statisticallySufficient,
    barCount: candles.length,
    validBarCount: cleanCandles.length,
    nOpMin,
    nStatMin: req.nStatMin,
    minBars: nOpMin,
    errorCodes,
    issues,
    calendarId: calendarSpec.calendarId,
    calendarVersion: calendarSpec.calendarVersion || CALENDAR_REGISTRY_VERSION,
    disallowedGapCount: gapReport.gapCount,
    disallowedMissingBars: gapReport.totalMissingBars,
    cleanCandles,
  };
}

export function enforceMonotonicQuantiles(raw, floorPrice = 1e-6) {
  const q10 = Math.max(floorPrice, Number(raw.q10));
  const q25 = Math.max(q10, Number(raw.q25));
  const q50 = Math.max(q25, Number(raw.q50));
  const q75 = Math.max(q50, Number(raw.q75));
  const q90 = Math.max(q75, Number(raw.q90));
  return { q10, q25, q50, q75, q90 };
}

export function advanceFutureTimestamps(lastOpenMs, timeframe = 'M15', horizon = 30, symbolCode = '', providerId = '', customCalendar = null) {
  return advanceFutureTimestampsWithCalendar(lastOpenMs, timeframe, horizon, symbolCode, providerId, customCalendar);
}

const FORBIDDEN_TRADING_PATTERNS = [
  /\bstrong\s+buy\b/i,
  /\bstrong\s+sell\b/i,
  /\bbuy\s+now\b/i,
  /\bsell\s+now\b/i,
  /\bstop[\s_-]?loss\b/i,
  /\btake[\s_-]?profit\b/i,
  /\bposition[\s_-]?size\b/i,
  /\btrade[\s_-]?signal\b/i,
  /\bentry\s+price\b/i,
];

export function containsForbiddenTradingTerms(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
  return FORBIDDEN_TRADING_PATTERNS.some((rx) => rx.test(str));
}

export { CALENDAR_PROFILES, CALENDAR_REGISTRY_VERSION, resolveCalendarSpec };
/** Strict representation adapter for one existing model trajectory. */
export function adaptNativeModelTrajectory(trajectory, context = {}) {
  const modelId = String(trajectory?.modelId || '').trim();
  const points = Array.isArray(trajectory?.points) ? trajectory.points : [];
  const horizonBars = Math.round(Number(context.horizonBars));
  if (!modelId || trajectory?.status !== 'SUCCESS' || !Number.isInteger(horizonBars) || horizonBars < 1 || points.length !== horizonBars) return null;
  const forecast = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i] || {};
    const q10 = Number(p.q10), q25 = Number(p.q25), q50 = Number(p.q50), q75 = Number(p.q75), q90 = Number(p.q90);
    if (![q10,q25,q50,q75,q90].every(Number.isFinite) || !(q10 > 0 && q10 <= q25 && q25 <= q50 && q50 <= q75 && q75 <= q90)) return null;
    forecast.push({ step: i + 1, q10, q25, q50_median: q50, q75, q90, timestamp_utc_ms: Number(p.timestampUtcMs || p.timestamp_utc_ms || 0) || null });
  }
  const symbol = String(context.symbolCode || '').trim().toUpperCase();
  const provider = String(context.provider || 'tvdatafeed').trim().toLowerCase();
  const timeframe = String(context.timeframe || 'M15').trim().toUpperCase();
  const originOpenMs = Number(context.originOpenTimeUtcMs), lastClosedPrice = Number(context.lastClosedPrice);
  if (!symbol || !provider || !timeframe || !(originOpenMs > 0) || !(lastClosedPrice > 0) || !Number.isFinite(lastClosedPrice)) return null;
  return { status: 'READY', forecast, engine: { engine_id: 'native_model_adapter', is_chronos2: false, params: { horizon_bars: horizonBars, model_id: modelId }, model_version: String(trajectory.modelVersion || '') },
    series: { symbol, provider, timeframe, origin_open_time_utc_ms: originOpenMs, last_closed_price: lastClosedPrice },
    model: { id: modelId, name: String(trajectory.modelName || modelId), is_approximation: Boolean(trajectory.isApproximation), is_calibrated_interval: Boolean(trajectory.isCalibratedInterval), execution_runtime: String(trajectory.executionRuntime || ''), source_engine_status: String(context.forecastStatus || '') },
    provenance: { source: 'ForecastEngine.modelTrajectories', status: String(context.forecastStatus || ''), inputHash: String(context.inputHash || ''), illustrative_only: modelId === 'empirical_analogs' } };
}