import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.42.0';

export const CONTRACT_VERSION = 'forecast-contract/v1';
export const SPEC_VERSION = '1.3.0';

export const RENDER_MODES = Object.freeze({
  HYBRID: 'HYBRID',
  FAN_CHART: 'FAN_CHART',
  GHOST_CANDLES: 'GHOST_CANDLES',
});

export const FORECAST_STATUS = Object.freeze({
  VALID: 'VALID',
  PROVISIONAL: 'PROVISIONAL',
  DATA_NOT_READY: 'DATA_NOT_READY',
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

/**
 * Pure synchronous FIPS 180-4 SHA-256 hex digest for deterministic forecast ledger chaining.
 */
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
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K_SHA256[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('');
}

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return JSON.stringify(Number(value.toFixed(8)));
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export function normalizeRenderMode(mode) {
  const m = String(mode || '').trim().toUpperCase();
  if (m === RENDER_MODES.FAN_CHART || m === RENDER_MODES.GHOST_CANDLES || m === RENDER_MODES.HYBRID) {
    return m;
  }
  return RENDER_MODES.HYBRID;
}

export function clampHorizonBars(horizon) {
  const n = Math.round(Number(horizon) || 30);
  return Math.max(10, Math.min(60, n));
}

export function extractCandleClose(c) {
  return Number(c?.close ?? 0);
}

export function extractCandleOpenMs(c, fallback = 0) {
  if (!c) return fallback;
  const rawMs = Number(c.open_time_utc_ms ?? c.openTimeUtcMs ?? 0);
  if (Number.isFinite(rawMs) && rawMs > 0) return rawMs;
  const rawSec = Number(c.openTimeSec ?? 0);
  if (Number.isFinite(rawSec) && rawSec > 0) return rawSec * 1000;
  return fallback;
}

/**
 * DataReadinessGate: blocks projection cleanly when history is insufficient or corrupted.
 */
export function validateDataReadiness(candles, minBars = 24) {
  const issues = [];
  if (!Array.isArray(candles) || candles.length === 0) {
    return {
      ready: false,
      barCount: 0,
      validBarCount: 0,
      minBars,
      issues: ['No historical candles available'],
    };
  }

  let validCount = 0;
  let nonPositive = 0;
  let nonMonotonic = 0;
  let prevMs = -Infinity;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const o = Number(c?.open);
    const h = Number(c?.high);
    const l = Number(c?.low);
    const cl = Number(c?.close);
    if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(cl) || cl <= 0 || o <= 0) {
      nonPositive++;
      continue;
    }
    const ms = extractCandleOpenMs(c, prevMs + 1);
    if (ms < prevMs) nonMonotonic++;
    prevMs = ms;
    validCount++;
  }

  if (validCount < minBars) {
    issues.push(`Need at least ${minBars} valid bars (found ${validCount})`);
  }
  if (nonPositive > Math.max(2, candles.length * 0.1)) {
    issues.push(`Detected ${nonPositive} bars with non-positive or non-finite OHLC`);
  }
  if (nonMonotonic > 0) {
    issues.push(`Detected ${nonMonotonic} out-of-order timestamps`);
  }

  return {
    ready: validCount >= minBars && nonPositive <= Math.max(2, candles.length * 0.1),
    barCount: candles.length,
    validBarCount: validCount,
    minBars,
    issues,
  };
}

/**
 * Enforces q10 <= q25 <= q50 <= q75 <= q90 and positive floor.
 */
export function enforceMonotonicQuantiles(raw, floorPrice = 1e-6) {
  const q10 = Math.max(floorPrice, Number(raw.q10));
  const q25 = Math.max(q10, Number(raw.q25));
  const q50 = Math.max(q25, Number(raw.q50));
  const q75 = Math.max(q50, Number(raw.q75));
  const q90 = Math.max(q75, Number(raw.q90));
  return { q10, q25, q50, q75, q90 };
}

/**
 * Advances h future bar timestamps using instrument calendar rules so closed weekend sessions are skipped.
 */
export function advanceFutureTimestamps(lastOpenMs, timeframe = 'M15', horizon = 30, symbolCode = '') {
  const stepMs = PriceFormatter.stepMilliseconds(timeframe);
  const start = Number.isFinite(lastOpenMs) && lastOpenMs > 0 ? lastOpenMs : Date.now();
  const timestamps = [];
  let cursor = start;
  const maxIterations = horizon * 16 + 64;
  let guard = 0;

  while (timestamps.length < horizon && guard < maxIterations) {
    guard++;
    cursor += stepMs;
    if (!symbolCode || PriceFormatter.isMarketOpen(cursor, symbolCode)) {
      timestamps.push(cursor);
    }
  }

  while (timestamps.length < horizon) {
    cursor += stepMs;
    timestamps.push(cursor);
  }
  return timestamps;
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
