import { sha256Hex, canonicalJson } from './forecastContract.js?v=1.42.0';

const LEDGER_STORAGE_KEY = 'ci_forecast_ledger_v1';
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const MAX_LOCAL_LEDGER_ENTRIES = 120;

export class ForecastLedger {
  constructor(storageKey = LEDGER_STORAGE_KEY) {
    this.storageKey = storageKey;
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

  clear() {
    if (this._hasStorage()) {
      globalThis.localStorage.removeItem(this.storageKey);
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
    return entry;
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
