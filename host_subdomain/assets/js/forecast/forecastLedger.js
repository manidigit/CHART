import {
  EVALUATION_OUTCOME,
  LIFECYCLE_STATUS,
  canonicalJson,
  sha256Hex,
} from './forecastContract.js?v=1.42.0';

const LEDGER_STORAGE_KEY = 'ci_forecast_ledger_v1';
const LIFECYCLE_STORAGE_KEY = 'ci_forecast_lifecycle_v1';
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const MAX_LOCAL_LEDGER_ENTRIES = 120;

export class ForecastLedger {
  constructor(storageKey = LEDGER_STORAGE_KEY, lifecycleKey = `${storageKey}_lifecycle`) {
    this.storageKey = storageKey;
    this.lifecycleKey = lifecycleKey === `${LEDGER_STORAGE_KEY}_lifecycle` ? LIFECYCLE_STORAGE_KEY : lifecycleKey;
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

  saveEntries(entries) {
    if (!this._hasStorage()) return;
    try {
      const trimmed = entries.slice(-MAX_LOCAL_LEDGER_ENTRIES);
      globalThis.localStorage.setItem(this.storageKey, JSON.stringify(trimmed));
    } catch (_) {
      // Ignore quota errors gracefully
    }
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
    try {
      const trimmed = events.slice(-240);
      globalThis.localStorage.setItem(this.lifecycleKey, JSON.stringify(trimmed));
    } catch (_) {}
  }

  clear() {
    if (this._hasStorage()) {
      globalThis.localStorage.removeItem(this.storageKey);
      globalThis.localStorage.removeItem(this.lifecycleKey);
    }
  }

  computeEntryHash(prevHash, canonicalPayloadObj) {
    const serialized = canonicalJson(canonicalPayloadObj);
    return sha256Hex(`${prevHash}|${serialized}`);
  }

  appendFromForecast(forecastResult) {
    if (!forecastResult || forecastResult.status === 'DATA_NOT_READY') {
      return null;
    }
    const entries = this.loadEntries();
    const last = entries.length > 0 ? entries[entries.length - 1] : null;
    const prevForecastHash = last ? last.forecastHash : GENESIS_HASH;
    const seq = last ? Number(last.seq || entries.length) + 1 : 1;

    const hashableBody = {
      seq,
      contractVersion: forecastResult.contractVersion,
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
      generatedAtUtcMs: forecastResult.generatedAtUtcMs,
    };

    const forecastHash = this.computeEntryHash(prevForecastHash, hashableBody);
    const entry = {
      ...hashableBody,
      prevForecastHash,
      forecastHash,
      noEdgeGateState: forecastResult.noEdgeGate?.gateState || 'NO_EDGE_DETECTED',
      oodStatus: forecastResult.uncertainty?.oodStatus || 'IN_DISTRIBUTION',
      scenarios: (forecastResult.scenarios || []).map((s) => ({
        id: s.id,
        label: s.label,
        probability: s.probability,
        targetPrice: s.targetPrice,
      })),
      syncedToCloud: false,
    };

    entries.push(entry);
    this.saveEntries(entries);

    // Record initial append-only lifecycle ACTIVE / PENDING event without mutating prior runs
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
    const eventHash = this.computeEntryHash(prevEventHash, body);
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
   * and preserves AMBIGUOUS inside-bar target+invalidation hits (§5.3, §5.4, §9.4).
   */
  evaluateMaturedForecasts(candles = [], symbolCode = '', timeframe = '') {
    const clean = (candles || []).filter((c) => Number(c?.close) > 0);
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
        const upperBound = Math.max(entry.anchorClose, entry.terminalQ90);
        const lowerBound = Math.min(entry.anchorClose, entry.terminalQ10);

        let ambiguousHit = false;
        for (const bar of slice) {
          if (Number(bar.high) >= upperBound && Number(bar.low) <= lowerBound) {
            ambiguousHit = true;
            break;
          }
        }

        let outcome = EVALUATION_OUTCOME.FAILED;
        let reason = `Observed close ${obsClose.toFixed(4)} outside 80% corridor`;
        if (ambiguousHit) {
          outcome = EVALUATION_OUTCOME.AMBIGUOUS;
          reason = 'Simultaneous upper/lower corridor touch inside single bar without sub-TF order';
        } else if (obsClose >= entry.terminalQ10 && obsClose <= entry.terminalQ90) {
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
      return { valid: true, totalEvents: 0, brokenIndex: -1, reason: 'Empty lifecycle log' };
    }
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const expectedPrev = i === 0 ? GENESIS_HASH : events[i - 1].eventHash;
      if (ev.prevEventHash !== expectedPrev) {
        return { valid: false, totalEvents: events.length, brokenIndex: i, reason: `Lifecycle chain break at index ${i}` };
      }
      const expected = this.computeEntryHash(ev.prevEventHash, {
        seq: ev.seq,
        forecastHash: ev.forecastHash,
        symbolCode: ev.symbolCode,
        timeframe: ev.timeframe,
        horizonStep: ev.horizonStep,
        lifecycleStatus: ev.lifecycleStatus,
        evaluationOutcome: ev.evaluationOutcome,
        recordedAtUtcMs: ev.recordedAtUtcMs,
      });
      if (ev.eventHash !== expected) {
        return { valid: false, totalEvents: events.length, brokenIndex: i, reason: `Lifecycle SHA-256 tamper at seq #${ev.seq}` };
      }
    }
    return { valid: true, totalEvents: events.length, brokenIndex: -1, reason: `All ${events.length} append-only lifecycle events verified` };
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
      return { valid: true, totalEntries: 0, brokenIndex: -1, reason: 'Empty ledger' };
    }

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const expectedPrev = i === 0 ? GENESIS_HASH : entries[i - 1].forecastHash;
      if (e.prevForecastHash !== expectedPrev) {
        return {
          valid: false,
          totalEntries: entries.length,
          brokenIndex: i,
          reason: `Chain link mismatch at index ${i}`,
        };
      }
      const hashableBody = {
        seq: e.seq,
        contractVersion: e.contractVersion,
        symbolCode: e.symbolCode,
        timeframe: e.timeframe,
        horizonBars: e.horizonBars,
        anchorOpenTimeUtcMs: e.anchorOpenTimeUtcMs,
        anchorClose: e.anchorClose,
        forecastStatus: e.forecastStatus,
        regime: e.regime,
        inputHash: e.inputHash,
        terminalMedian: e.terminalMedian,
        terminalQ10: e.terminalQ10,
        terminalQ90: e.terminalQ90,
        generatedAtUtcMs: e.generatedAtUtcMs,
      };
      const expectedHash = this.computeEntryHash(e.prevForecastHash, hashableBody);
      if (e.forecastHash !== expectedHash) {
        return {
          valid: false,
          totalEntries: entries.length,
          brokenIndex: i,
          reason: `SHA-256 payload tamper detected at seq #${e.seq}`,
        };
      }
    }

    return {
      valid: true,
      totalEntries: entries.length,
      brokenIndex: -1,
      reason: `All ${entries.length} SHA-256 hash-chain entries verified`,
    };
  }
}

export const defaultForecastLedger = new ForecastLedger();
