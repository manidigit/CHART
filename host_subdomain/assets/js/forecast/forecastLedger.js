import {
  CONTRACT_VERSION,
  ENGINE_VERSION,
  EVALUATION_OUTCOME,
  LEGACY_CONTRACT_VERSION,
  LIFECYCLE_STATUS,
  canonicalJson,
  canonicalJsonV1Legacy,
  sha256Hex,
} from './forecastContract.js?v=1.47.41';
import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.47.41';
import { safeLocalStorageSet } from '../core/store.js?v=1.47.41';

const LEDGER_STORAGE_KEY = 'ci_forecast_ledger_v1';
const LIFECYCLE_STORAGE_KEY = 'ci_forecast_lifecycle_v1';
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const MAX_LOCAL_LEDGER_ENTRIES = 120;
const MAX_LOCAL_LIFECYCLE_EVENTS = 240;

export class ForecastLedger {
  constructor(storageKey = LEDGER_STORAGE_KEY, lifecycleKey = `${storageKey}_lifecycle`) {
    this.storageKey = storageKey;
    this.lifecycleKey = lifecycleKey === `${LEDGER_STORAGE_KEY}_lifecycle` ? LIFECYCLE_STORAGE_KEY : lifecycleKey;
    this.entriesAnchorKey = `${this.storageKey}_anchor`;
    this.lifecycleAnchorKey = `${this.lifecycleKey}_anchor`;
  }

  _hasStorage() {
    try {
      return typeof globalThis !== 'undefined' && Boolean(globalThis.localStorage);
    } catch (_) {
      return false;
    }
  }

  loadEntries() {
    if (!this._hasStorage()) return [];
    try {
      const raw = globalThis.localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  _loadAnchorPrevHash(anchorKey) {
    if (!this._hasStorage()) return null;
    try {
      const raw = globalThis.localStorage.getItem(anchorKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.prevHash === 'string' && parsed.prevHash.length === 64 && Number(parsed.firstSeq) > 1) {
        return parsed;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  _saveAnchorPrevHash(anchorKey, firstSeq, prevHash) {
    if (!this._hasStorage()) return;
    if (Number(firstSeq) > 1 && typeof prevHash === 'string' && prevHash.length === 64) {
      safeLocalStorageSet(anchorKey, JSON.stringify({ firstSeq: Number(firstSeq), prevHash }));
    } else {
      try {
        globalThis.localStorage.removeItem(anchorKey);
      } catch (_) {}
    }
  }

  saveEntries(entries) {
    if (!this._hasStorage()) return;
    const trimmed = entries.slice(-MAX_LOCAL_LEDGER_ENTRIES);
    if (entries.length > MAX_LOCAL_LEDGER_ENTRIES && trimmed.length > 0) {
      this._saveAnchorPrevHash(this.entriesAnchorKey, trimmed[0].seq, trimmed[0].prevForecastHash);
    } else if (trimmed.length === 0 || Number(trimmed[0].seq || 1) === 1) {
      this._saveAnchorPrevHash(this.entriesAnchorKey, 1, null);
    }
    safeLocalStorageSet(this.storageKey, JSON.stringify(trimmed));
  }

  loadLifecycleEvents() {
    if (!this._hasStorage()) return [];
    try {
      const raw = globalThis.localStorage.getItem(this.lifecycleKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  saveLifecycleEvents(events) {
    if (!this._hasStorage()) return;
    const trimmed = events.slice(-MAX_LOCAL_LIFECYCLE_EVENTS);
    if (events.length > MAX_LOCAL_LIFECYCLE_EVENTS && trimmed.length > 0) {
      this._saveAnchorPrevHash(this.lifecycleAnchorKey, trimmed[0].seq, trimmed[0].prevEventHash);
    } else if (trimmed.length === 0 || Number(trimmed[0].seq || 1) === 1) {
      this._saveAnchorPrevHash(this.lifecycleAnchorKey, 1, null);
    }
    safeLocalStorageSet(this.lifecycleKey, JSON.stringify(trimmed));
  }

  clear() {
    if (this._hasStorage()) {
      globalThis.localStorage.removeItem(this.storageKey);
      globalThis.localStorage.removeItem(this.lifecycleKey);
      globalThis.localStorage.removeItem(this.entriesAnchorKey);
      globalThis.localStorage.removeItem(this.lifecycleAnchorKey);
    }
  }

  computeEntryHash(prevHash, canonicalPayloadObj, isLegacyV1 = false) {
    const serialized = isLegacyV1
      ? canonicalJsonV1Legacy(canonicalPayloadObj)
      : canonicalJson(canonicalPayloadObj);
    return sha256Hex(`${prevHash}|${serialized}`);
  }

  _buildHashableBody(entryLike) {
    const base = {
      seq: entryLike.seq,
      contractVersion: entryLike.contractVersion,
      symbolCode: entryLike.symbolCode,
      timeframe: entryLike.timeframe,
      horizonBars: entryLike.horizonBars,
      anchorOpenTimeUtcMs: entryLike.anchorOpenTimeUtcMs,
      anchorClose: entryLike.anchorClose,
      forecastStatus: entryLike.forecastStatus,
      regime: entryLike.regime,
      inputHash: entryLike.inputHash,
      terminalMedian: entryLike.terminalMedian ?? 0,
      terminalQ10: entryLike.terminalQ10 ?? 0,
      terminalQ90: entryLike.terminalQ90 ?? 0,
      generatedAtUtcMs: entryLike.generatedAtUtcMs,
    };
    if (entryLike.contractVersion === LEGACY_CONTRACT_VERSION) {
      return base;
    }
    return {
      ...base,
      engineVersion: entryLike.engineVersion || ENGINE_VERSION,
      wisModel: entryLike.wisModel ?? null,
      calibrationStatus: entryLike.calibrationStatus || 'UNDER_SAMPLED',
    };
  }

  appendFromForecast(forecastResult) {
    if (!forecastResult || forecastResult.status === 'DATA_NOT_READY') {
      return null;
    }
    const entries = this.loadEntries();
    const last = entries.length > 0 ? entries[entries.length - 1] : null;
    const prevForecastHash = last ? last.forecastHash : GENESIS_HASH;
    const seq = last ? Number(last.seq || entries.length) + 1 : 1;

    const candidate = {
      seq,
      contractVersion: forecastResult.contractVersion || CONTRACT_VERSION,
      engineVersion: forecastResult.engineVersion || ENGINE_VERSION,
      symbolCode: forecastResult.symbolCode,
      timeframe: forecastResult.timeframe,
      horizonBars: forecastResult.horizonBars,
      anchorOpenTimeUtcMs: forecastResult.anchorOpenTimeUtcMs,
      anchorClose: forecastResult.anchorClose,
      forecastStatus: forecastResult.status,
      regime: forecastResult.regime,
      inputHash: forecastResult.inputHash,
      terminalMedian: forecastResult.summary?.terminalQ50 ?? 0,
      terminalQ10: forecastResult.summary?.terminalQ10 ?? 0,
      terminalQ90: forecastResult.summary?.terminalQ90 ?? 0,
      wisModel: forecastResult.walkForward?.wisModel ?? null,
      calibrationStatus: forecastResult.conformalCalibration?.calibrationStatus || 'UNDER_SAMPLED',
      generatedAtUtcMs: forecastResult.generatedAtUtcMs,
    };

    const isLegacy = candidate.contractVersion === LEGACY_CONTRACT_VERSION;
    const hashableBody = this._buildHashableBody(candidate);
    const forecastHash = this.computeEntryHash(prevForecastHash, hashableBody, isLegacy);

    const checkpointQuantiles = {};
    if (Array.isArray(forecastResult.points) && forecastResult.points.length > 0) {
      const cpSteps = [5, 10, candidate.horizonBars].filter(
        (s, idx, arr) => s >= 1 && s <= forecastResult.points.length && arr.indexOf(s) === idx
      );
      for (const step of cpSteps) {
        const pt = forecastResult.points[step - 1];
        if (pt && Number.isFinite(Number(pt.q10)) && Number.isFinite(Number(pt.q50)) && Number.isFinite(Number(pt.q90))) {
          checkpointQuantiles[String(step)] = {
            q10: Number(pt.q10),
            q50: Number(pt.q50),
            q90: Number(pt.q90),
          };
        }
      }
    }

    const entry = {
      ...hashableBody,
      prevForecastHash,
      forecastHash,
      modelId: String(forecastResult.selectedChartModelId || forecastResult.model?.id || 'AUTO'),
      providerId: String(forecastResult.providerId || forecastResult.series?.provider || 'tvdatafeed'),
      checkpointQuantiles,
      noEdgeGateState: forecastResult.noEdgeGate?.gateState || 'NO_EDGE_DETECTED',
      oodStatus: forecastResult.uncertainty?.oodStatus || 'IN_DISTRIBUTION',
      scenarios: (forecastResult.scenarios || []).map((s) => ({
        id: s.id,
        label: s.label,
        status: s.status || 'ESTIMABLE',
        probability: s.probability ?? null,
        rawEmpiricalFrequency: s.rawEmpiricalFrequency ?? 0,
        targetPrice: s.targetPrice,
      })),
      syncedToCloud: false,
    };

    entries.push(entry);
    this.saveEntries(entries);

    const prevActiveSame = entries
      .slice(0, -1)
      .reverse()
      .find((e) => e.symbolCode === entry.symbolCode && e.timeframe === entry.timeframe);
    if (prevActiveSame && !this.hasTerminalLifecycleStatus(prevActiveSame.forecastHash)) {
      this.appendLifecycleEvent({
        forecastHash: prevActiveSame.forecastHash,
        symbolCode: prevActiveSame.symbolCode,
        timeframe: prevActiveSame.timeframe,
        horizonStep: prevActiveSame.horizonBars,
        lifecycleStatus: LIFECYCLE_STATUS.SUPERSEDED,
        evaluationOutcome: EVALUATION_OUTCOME.PENDING,
        reason: `Superseded by forecast #${entry.seq}`,
        observedClose: forecastResult.anchorClose,
      });
    }

    this.appendLifecycleEvent({
      forecastHash,
      symbolCode: entry.symbolCode,
      timeframe: entry.timeframe,
      horizonStep: entry.horizonBars,
      lifecycleStatus: LIFECYCLE_STATUS.ACTIVE,
      evaluationOutcome: EVALUATION_OUTCOME.PENDING,
      reason: 'Immutable snapshot anchored pre-outcome',
      observedClose: null,
    });

    return entry;
  }

  hasTerminalLifecycleStatus(forecastHash, horizonStep = null) {
    return this.loadLifecycleEvents().some(
      (ev) =>
        ev.forecastHash === forecastHash &&
        (horizonStep === null || ev.horizonStep === horizonStep) &&
        [LIFECYCLE_STATUS.MATURED, LIFECYCLE_STATUS.CANCELLED].includes(ev.lifecycleStatus)
    );
  }

  appendLifecycleEvent({
    forecastHash,
    symbolCode,
    timeframe,
    horizonStep = 0,
    lifecycleStatus = LIFECYCLE_STATUS.ACTIVE,
    evaluationOutcome = EVALUATION_OUTCOME.PENDING,
    reason = '',
    observedClose = null,
    recordedAtUtcMs = Date.now(),
  }) {
    const events = this.loadLifecycleEvents();
    const last = events.length > 0 ? events[events.length - 1] : null;
    const prevEventHash = last ? last.eventHash : GENESIS_HASH;
    const seq = last ? Number(last.seq || events.length) + 1 : 1;

    const body = {
      seq,
      forecastHash,
      symbolCode,
      timeframe,
      horizonStep,
      lifecycleStatus,
      evaluationOutcome,
      recordedAtUtcMs,
    };
    const eventHash = this.computeEntryHash(prevEventHash, body, false);
    const ev = {
      ...body,
      reason,
      observedClose,
      prevEventHash,
      eventHash,
    };
    events.push(ev);
    this.saveLifecycleEvents(events);
    return ev;
  }

  /**
   * Evaluates matured forecasts against subsequent closed candles per independent horizon
   * and preserves AMBIGUOUS inside-bar target+invalidation hits.
   */
  evaluateMaturedForecasts(candles = [], symbolCode = '', timeframe = '') {
    const byOpenTime = new Map();
    for (const candle of Array.isArray(candles) ? candles : []) {
      const openMs = Number(candle?.open_time_utc_ms ?? candle?.openTimeUtcMs ?? 0);
      const close = Number(candle?.close);
      if (
        !(openMs > 0) ||
        !(close > 0) ||
        candle?.is_closed === false ||
        !PriceFormatter.isCandleClosed(openMs, timeframe || 'M15', Date.now(), symbolCode || 'XAUUSD')
      ) continue;
      byOpenTime.set(openMs, candle);
    }
    const clean = Array.from(byOpenTime.values()).sort(
      (a, b) => Number(a.open_time_utc_ms ?? a.openTimeUtcMs) - Number(b.open_time_utc_ms ?? b.openTimeUtcMs)
    );
    if (clean.length === 0) return [];
    const entries = this.loadEntries().filter(
      (e) =>
        (!symbolCode || e.symbolCode === symbolCode) &&
        (!timeframe || e.timeframe === timeframe)
    );
    const appended = [];

    for (const entry of entries) {
      const subBars = clean.filter((c) => Number(c.open_time_utc_ms ?? c.openTimeUtcMs ?? 0) > entry.anchorOpenTimeUtcMs);
      if (subBars.length === 0) continue;

      const checkpoints = [5, 10, entry.horizonBars].filter((s, idx, arr) => s <= entry.horizonBars && arr.indexOf(s) === idx);
      for (const step of checkpoints) {
        if (this.hasTerminalLifecycleStatus(entry.forecastHash, step)) continue;
        if (subBars.length < step) continue;

        const slice = subBars.slice(0, step);
        const obsClose = Number(slice[slice.length - 1].close);
        const cpBand = entry.checkpointQuantiles && entry.checkpointQuantiles[String(step)];
        const stepQ10 = cpBand && Number.isFinite(Number(cpBand.q10)) ? Number(cpBand.q10) : Number(entry.terminalQ10);
        const stepQ90 = cpBand && Number.isFinite(Number(cpBand.q90)) ? Number(cpBand.q90) : Number(entry.terminalQ90);
        const upperBound = Math.max(entry.anchorClose, stepQ90);
        const lowerBound = Math.min(entry.anchorClose, stepQ10);

        let ambiguousHit = false;
        for (const bar of slice) {
          if (Number(bar.high) >= upperBound && Number(bar.low) <= lowerBound) {
            ambiguousHit = true;
            break;
          }
        }

        let outcome = EVALUATION_OUTCOME.FAILED;
        let reason = `Observed close ${obsClose.toFixed(4)} outside +${step}b 80% corridor [${stepQ10.toFixed(4)}, ${stepQ90.toFixed(4)}]`;
        if (ambiguousHit) {
          outcome = EVALUATION_OUTCOME.AMBIGUOUS;
          reason = 'Simultaneous upper/lower corridor touch inside single bar without sub-TF order';
        } else if (obsClose >= stepQ10 && obsClose <= stepQ90) {
          outcome = EVALUATION_OUTCOME.SUCCESS;
          reason = `Observed close inside [q10, q90] at +${step}b maturity`;
        }

        const ev = this.appendLifecycleEvent({
          forecastHash: entry.forecastHash,
          symbolCode: entry.symbolCode,
          timeframe: entry.timeframe,
          horizonStep: step,
          lifecycleStatus: LIFECYCLE_STATUS.MATURED,
          evaluationOutcome: outcome,
          reason,
          observedClose: obsClose,
        });
        appended.push(ev);
      }
    }
    return appended;
  }

  verifyLifecycleChain(customEvents = null) {
    const events = Array.isArray(customEvents) ? customEvents : this.loadLifecycleEvents();
    if (events.length === 0) {
      return { valid: true, totalEvents: 0, brokenIndex: -1, error: null, reason: 'Empty lifecycle log' };
    }
    const storedAnchor = !Array.isArray(customEvents) ? this._loadAnchorPrevHash(this.lifecycleAnchorKey) : null;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const expectedPrev =
        i === 0
          ? storedAnchor && Number(ev.seq) === storedAnchor.firstSeq
            ? storedAnchor.prevHash
            : GENESIS_HASH
          : events[i - 1].eventHash;
      if (ev.prevEventHash !== expectedPrev) {
        const msg = `SHA-256 Hash Chain Integrity Mismatch: lifecycle break at index ${i}`;
        return { valid: false, totalEvents: events.length, brokenIndex: i, error: msg, reason: msg };
      }
      const body = {
        seq: ev.seq,
        forecastHash: ev.forecastHash,
        symbolCode: ev.symbolCode,
        timeframe: ev.timeframe,
        horizonStep: ev.horizonStep,
        lifecycleStatus: ev.lifecycleStatus,
        evaluationOutcome: ev.evaluationOutcome,
        recordedAtUtcMs: ev.recordedAtUtcMs,
      };
      const expectedV2 = this.computeEntryHash(ev.prevEventHash, body, false);
      const expectedV1 = this.computeEntryHash(ev.prevEventHash, body, true);
      if (ev.eventHash !== expectedV2 && ev.eventHash !== expectedV1) {
        const msg = `SHA-256 Hash Chain Integrity Mismatch: lifecycle tamper at seq #${ev.seq}`;
        return { valid: false, totalEvents: events.length, brokenIndex: i, error: msg, reason: msg };
      }
    }
    return { valid: true, totalEvents: events.length, brokenIndex: -1, error: null, reason: `All ${events.length} SHA-256 Hash Chain Integrity checks passed` };
  }

  markSynced(forecastHash) {
    const entries = this.loadEntries();
    let updated = false;
    for (const item of entries) {
      if (item.forecastHash === forecastHash) {
        item.syncedToCloud = true;
        updated = true;
      }
    }
    if (updated) this.saveEntries(entries);
    return updated;
  }

  verifyChain(customEntries = null) {
    const entries = Array.isArray(customEntries) ? customEntries : this.loadEntries();
    if (entries.length === 0) {
      return { valid: true, totalEntries: 0, brokenIndex: -1, error: null, reason: 'Empty ledger (SHA-256 Hash Chain Integrity idle)' };
    }

    const storedAnchor = !Array.isArray(customEntries) ? this._loadAnchorPrevHash(this.entriesAnchorKey) : null;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const expectedPrev =
        i === 0
          ? storedAnchor && Number(e.seq) === storedAnchor.firstSeq
            ? storedAnchor.prevHash
            : GENESIS_HASH
          : entries[i - 1].forecastHash;
      if (e.prevForecastHash !== expectedPrev) {
        const msg = `SHA-256 Hash Chain Integrity Mismatch: chain link mismatch at index ${i}`;
        return {
          valid: false,
          totalEntries: entries.length,
          brokenIndex: i,
          error: msg,
          reason: msg,
        };
      }
      const isLegacy = e.contractVersion === LEGACY_CONTRACT_VERSION;
      const hashableBody = this._buildHashableBody(e);
      const expectedHash = this.computeEntryHash(e.prevForecastHash, hashableBody, isLegacy);
      if (e.forecastHash !== expectedHash) {
        const msg = `SHA-256 Hash Chain Integrity Mismatch: payload tamper detected at seq #${e.seq}`;
        return {
          valid: false,
          totalEntries: entries.length,
          brokenIndex: i,
          error: msg,
          reason: msg,
        };
      }
    }

    return {
      valid: true,
      totalEntries: entries.length,
      brokenIndex: -1,
      error: null,
      reason: `All ${entries.length} entries verified (SHA-256 Hash Chain Integrity)`,
    };
  }
}

export const defaultForecastLedger = new ForecastLedger();
