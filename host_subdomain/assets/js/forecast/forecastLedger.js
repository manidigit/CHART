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
import { evaluatePathQualityVector, MARKET_CONTEXT_ENGINE_VERSION } from './marketContextEngine.js?v=1.47.41';

const LEDGER_STORAGE_KEY = 'ci_forecast_ledger_v1';
const LIFECYCLE_STORAGE_KEY = 'ci_forecast_lifecycle_v1';
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const MAX_LOCAL_LEDGER_ENTRIES = 120;
const MAX_LOCAL_LIFECYCLE_EVENTS = 240;

function resolveTimeframeStepMs(timeframe = 'M15') {
  const tf = String(timeframe || 'M15').trim().toUpperCase();
  if (typeof PriceFormatter?.stepMilliseconds === 'function') {
    const ms = Number(PriceFormatter.stepMilliseconds(tf));
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  if (tf === 'M15') return 900000;
  if (tf === 'M30') return 1800000;
  if (tf === 'H1') return 3600000;
  if (tf === 'H4') return 14400000;
  if (tf === 'D1') return 86400000;
  if (tf === 'W1') return 7 * 86400000;
  return 900000;
}

function classifyDirectionLabel(startPrice, endPrice, neutralThresholdPct = 0.08) {
  const s = Number(startPrice);
  const e = Number(endPrice);
  if (!(s > 0) || !Number.isFinite(e)) return 'FLAT';
  const pct = ((e - s) / s) * 100;
  if (Math.abs(pct) <= neutralThresholdPct) return 'FLAT';
  return pct > 0 ? 'BULLISH' : 'BEARISH';
}

export class ForecastLedger {
  constructor(storageKey = LEDGER_STORAGE_KEY, lifecycleKey = `${storageKey}_lifecycle`) {
    this.storageKey = storageKey;
    this.lifecycleKey = lifecycleKey === `${LEDGER_STORAGE_KEY}_lifecycle` ? LIFECYCLE_STORAGE_KEY : lifecycleKey;
    this.entriesAnchorKey = `${this.storageKey}_anchor`;
    this.lifecycleAnchorKey = `${this.lifecycleKey}_anchor`;
    this.lastStorageStatus = { ok: true, prunedCount: 0, maxEntries: MAX_LOCAL_LEDGER_ENTRIES, error: null };
  }

  getStorageStatus() {
    const entries = this.loadEntries();
    return {
      ...this.lastStorageStatus,
      storedEntriesCount: entries.length,
      maxEntries: MAX_LOCAL_LEDGER_ENTRIES,
      localOnly: true,
    };
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
    if (!this._hasStorage()) {
      this.lastStorageStatus = { ok: false, prunedCount: 0, maxEntries: MAX_LOCAL_LEDGER_ENTRIES, error: 'LOCAL_STORAGE_UNAVAILABLE' };
      return false;
    }
    const prunedCount = Math.max(0, entries.length - MAX_LOCAL_LEDGER_ENTRIES);
    const trimmed = entries.slice(-MAX_LOCAL_LEDGER_ENTRIES);
    if (entries.length > MAX_LOCAL_LEDGER_ENTRIES && trimmed.length > 0) {
      this._saveAnchorPrevHash(this.entriesAnchorKey, trimmed[0].seq, trimmed[0].prevForecastHash);
    } else if (trimmed.length === 0 || Number(trimmed[0].seq || 1) === 1) {
      this._saveAnchorPrevHash(this.entriesAnchorKey, 1, null);
    }
    const ok = safeLocalStorageSet(this.storageKey, JSON.stringify(trimmed));
    this.lastStorageStatus = {
      ok: ok !== false,
      prunedCount,
      maxEntries: MAX_LOCAL_LEDGER_ENTRIES,
      error: ok === false ? 'LOCAL_STORAGE_QUOTA_OR_WRITE_ERROR' : null,
    };
    return ok !== false;
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

  /**
   * Finds an existing snapshot matching the same symbol, timeframe, horizon, and model
   * recorded on the same closed candle anchor or within the deduplication time window.
   */
  findRecentDuplicateEntry(
    {
      symbolCode,
      timeframe,
      horizonBars,
      modelId,
      anchorOpenTimeUtcMs = 0,
      recordedAtUtcMs = Date.now(),
      windowMs = 5 * 60 * 1000,
    },
    entriesOverride = null
  ) {
    const entries = Array.isArray(entriesOverride) ? entriesOverride : this.loadEntries();
    const normSym = String(symbolCode || '').trim();
    const normTf = String(timeframe || '').trim();
    const normH = Math.max(1, Number(horizonBars || 15));
    const normModel = String(modelId || 'AUTO').trim();
    const targetAnchor = Number(anchorOpenTimeUtcMs || 0);
    const targetRecMs = Number(recordedAtUtcMs || Date.now());
    const safeWindowMs = Math.max(0, Number(windowMs ?? 5 * 60 * 1000));

    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (!e) continue;
      if (String(e.symbolCode || '') !== normSym) continue;
      if (String(e.timeframe || '') !== normTf) continue;
      if (Number(e.horizonBars || 0) !== normH) continue;
      if (String(e.modelId || 'AUTO') !== normModel) continue;

      const sameAnchor = targetAnchor > 0 && Number(e.anchorOpenTimeUtcMs || 0) === targetAnchor;
      const prevRecMs = Number(e.recordedAtUtcMs || e.generatedAtUtcMs || 0);
      const withinWindow = safeWindowMs > 0 && prevRecMs > 0 && Math.abs(targetRecMs - prevRecMs) <= safeWindowMs;
      if (sameAnchor || withinWindow) {
        return e;
      }
    }
    return null;
  }

  appendFromForecast(forecastResult, options = {}) {
    if (!forecastResult || forecastResult.status === 'DATA_NOT_READY') {
      return null;
    }
    const entries = this.loadEntries();
    const last = entries.length > 0 ? entries[entries.length - 1] : null;
    const prevForecastHash = last ? last.forecastHash : GENESIS_HASH;
    const seq = last ? Number(last.seq || entries.length) + 1 : 1;

    const hasCustomPoints = Array.isArray(options.points) && options.points.length > 0;
    const rawPoints = hasCustomPoints
      ? options.points
      : Array.isArray(forecastResult.points)
        ? forecastResult.points
        : [];
    const lastPoint = rawPoints.length > 0 ? rawPoints[rawPoints.length - 1] : null;
    const terminalMedian =
      options.terminalMedian ??
      (hasCustomPoints && lastPoint ? Number(lastPoint.q50 ?? lastPoint.q50_median ?? 0) : null) ??
      forecastResult.summary?.terminalQ50 ??
      (lastPoint ? Number(lastPoint.q50 ?? lastPoint.q50_median ?? 0) : 0);
    const terminalQ10 =
      options.terminalQ10 ??
      (hasCustomPoints && lastPoint ? Number(lastPoint.q10 ?? 0) : null) ??
      forecastResult.summary?.terminalQ10 ??
      (lastPoint ? Number(lastPoint.q10 ?? 0) : 0);
    const terminalQ90 =
      options.terminalQ90 ??
      (hasCustomPoints && lastPoint ? Number(lastPoint.q90 ?? 0) : null) ??
      forecastResult.summary?.terminalQ90 ??
      (lastPoint ? Number(lastPoint.q90 ?? 0) : 0);
    const generatedAtUtcMs = Number(options.generatedAtUtcMs ?? forecastResult.generatedAtUtcMs ?? Date.now());
    const recordedAtUtcMs = Number(options.recordedAtUtcMs ?? options.generatedAtUtcMs ?? Date.now());
    const horizonBars = Math.max(1, Number(options.horizonBars || (hasCustomPoints ? rawPoints.length : 0) || forecastResult.horizonBars || rawPoints.length || 15));
    const anchorOpenTimeUtcMs = Number(forecastResult.anchorOpenTimeUtcMs || 0);
    const anchorClose = Number(forecastResult.anchorClose || 0);
    const tfStepMs = resolveTimeframeStepMs(forecastResult.timeframe || 'M15');
    const lastPointMs = Number(lastPoint?.openTimeUtcMs ?? lastPoint?.open_time_utc_ms ?? 0);
    const maturesAtUtcMs =
      lastPointMs > anchorOpenTimeUtcMs
        ? lastPointMs + tfStepMs
        : anchorOpenTimeUtcMs > 0
          ? anchorOpenTimeUtcMs + horizonBars * tfStepMs
          : generatedAtUtcMs + horizonBars * tfStepMs;

    const previewModelId = String(
      options.modelId || forecastResult.selectedChartModelId || forecastResult.model?.id || 'AUTO'
    );
    if (options.preventDuplicate) {
      const existingDup = this.findRecentDuplicateEntry(
        {
          symbolCode: forecastResult.symbolCode,
          timeframe: forecastResult.timeframe,
          horizonBars,
          modelId: previewModelId,
          anchorOpenTimeUtcMs,
          recordedAtUtcMs,
          windowMs: options.dedupeWindowMs ?? 5 * 60 * 1000,
        },
        entries
      );
      if (existingDup) {
        return { ...existingDup, duplicateSkipped: true };
      }
    }

    const candidate = {
      seq,
      contractVersion: forecastResult.contractVersion || CONTRACT_VERSION,
      engineVersion: forecastResult.engineVersion || ENGINE_VERSION,
      symbolCode: forecastResult.symbolCode,
      timeframe: forecastResult.timeframe,
      horizonBars,
      anchorOpenTimeUtcMs,
      anchorClose,
      forecastStatus: forecastResult.status,
      regime: forecastResult.regime,
      inputHash: forecastResult.inputHash,
      terminalMedian,
      terminalQ10,
      terminalQ90,
      wisModel: options.wisModel ?? forecastResult.walkForward?.wisModel ?? null,
      calibrationStatus: forecastResult.conformalCalibration?.calibrationStatus || 'UNDER_SAMPLED',
      generatedAtUtcMs,
    };

    const isLegacy = candidate.contractVersion === LEGACY_CONTRACT_VERSION;
    const hashableBody = this._buildHashableBody(candidate);
    const forecastHash = this.computeEntryHash(prevForecastHash, hashableBody, isLegacy);

    const checkpointQuantiles = {};
    const stepPoints = [];
    if (rawPoints.length > 0) {
      const cpSteps = [5, 10, candidate.horizonBars].filter(
        (s, idx, arr) => s >= 1 && s <= rawPoints.length && arr.indexOf(s) === idx
      );
      for (const step of cpSteps) {
        const pt = rawPoints[step - 1];
        const q10Val = Number(pt?.q10);
        const q50Val = Number(pt?.q50 ?? pt?.q50_median);
        const q90Val = Number(pt?.q90);
        if (pt && Number.isFinite(q10Val) && Number.isFinite(q50Val) && Number.isFinite(q90Val)) {
          checkpointQuantiles[String(step)] = {
            q10: q10Val,
            q50: q50Val,
            q90: q90Val,
          };
        }
      }
      for (let idx = 0; idx < rawPoints.length; idx++) {
        const pt = rawPoints[idx];
        const q50Val = Number(pt?.q50 ?? pt?.q50_median);
        if (!Number.isFinite(q50Val)) continue;
        stepPoints.push({
          step: idx + 1,
          openTimeUtcMs: Number(pt?.openTimeUtcMs ?? pt?.open_time_utc_ms ?? 0),
          q10: Number.isFinite(Number(pt?.q10)) ? Number(pt.q10) : q50Val,
          q25: Number.isFinite(Number(pt?.q25)) ? Number(pt.q25) : q50Val,
          q50: q50Val,
          q75: Number.isFinite(Number(pt?.q75)) ? Number(pt.q75) : q50Val,
          q90: Number.isFinite(Number(pt?.q90)) ? Number(pt.q90) : q50Val,
        });
      }
    }

    const MODEL_FRIENDLY_NAMES = {
      structural_wave_js: 'Structural JS',
      smc_prediction_js: 'SMC Prediction Engine',
      empirical_analogs: 'Causal Historical Analogs',
      ensemble: 'Calibrated Ensemble (V2)',
      AUTO: 'Auto (OOS Best)',
    };
    const resolvedModelId = String(
      options.modelId || forecastResult.selectedChartModelId || forecastResult.model?.id || 'AUTO'
    );
    const matchedTraj = (forecastResult.modelTrajectories || []).find((t) => t.modelId === resolvedModelId);
    const resolvedModelName = String(
      options.modelName ||
        matchedTraj?.modelName ||
        MODEL_FRIENDLY_NAMES[resolvedModelId] ||
        (resolvedModelId === (forecastResult.selectedChartModelId || forecastResult.model?.id) ? forecastResult.model?.name : '') ||
        resolvedModelId
    );
    const batchId = String(options.batchId || `SNAP-${recordedAtUtcMs}-${seq}`);
    const batchSize = Math.max(1, Number(options.batchSize || 1));

    const atrPct = Number(forecastResult.featuresSummary?.atrPct ?? 0);
    const ewmaSigmaPct = Number(forecastResult.featuresSummary?.ewmaSigmaPct ?? 0);
    const atrAtAnchor =
      Number(options.atrAtAnchor) > 0
        ? Number(options.atrAtAnchor)
        : Number(forecastResult.featuresSummary?.atr14) > 0
          ? Number(forecastResult.featuresSummary.atr14)
          : atrPct > 0 && anchorClose > 0
            ? (anchorClose * atrPct) / 100
            : ewmaSigmaPct > 0 && anchorClose > 0
              ? (anchorClose * ewmaSigmaPct) / 100
              : Math.max(1e-6, Math.abs(terminalQ90 - terminalQ10) / 3.2);

    const naiveTraj = (forecastResult.modelTrajectories || []).find((t) => t.modelId === 'naive_persistence');
    const driftTraj = (forecastResult.modelTrajectories || []).find((t) => t.modelId === 'damped_drift');
    const baselineTerminalQ50 = Number(
      options.baselineTerminalQ50 ??
        naiveTraj?.points?.[naiveTraj.points.length - 1]?.q50 ??
        anchorClose
    );
    const driftBaselineTerminalQ50 = Number(
      options.driftBaselineTerminalQ50 ??
        driftTraj?.points?.[driftTraj.points.length - 1]?.q50 ??
        anchorClose
    );

    const rawZones = Array.isArray(options.keyZones)
      ? options.keyZones
      : Array.isArray(forecastResult.keyZones)
        ? forecastResult.keyZones
        : [];
    const keyZones = rawZones.slice(0, 6).map((z) => ({
      zoneId: String(z.zoneId || z.id || z.zoneType || 'ZONE'),
      zoneType: String(z.zoneType || (z.polarity === 'RESISTANCE' ? 'RESISTANCE_ZONE' : 'SUPPORT_ZONE')),
      lowPrice: Number(z.lowPrice ?? z.price_low ?? z.price ?? 0),
      highPrice: Number(z.highPrice ?? z.price_high ?? z.price ?? 0),
      invalidationPrice: Number(z.invalidationPrice ?? 0),
      strength: Number(z.strength ?? 0.5),
    }));

    const noEdgeGateState = forecastResult.noEdgeGate?.gateState || 'NO_EDGE_DETECTED';
    const hasStatisticalEdge =
      Boolean(forecastResult.noEdgeGate?.hasEdge) ||
      noEdgeGateState === 'EDGE_SUPPORTED' ||
      forecastResult.status === 'VALID';
    const regimeStr = String(forecastResult.regime || 'RANGING').toUpperCase();
    const isTrendingRegime = regimeStr.includes('TREND') || regimeStr.includes('BULL') || regimeStr.includes('BEAR');
    const marketConditionTag =
      isTrendingRegime && hasStatisticalEdge
        ? 'TRENDING_EDGE'
        : isTrendingRegime
          ? 'TRENDING_NO_EDGE'
          : hasStatisticalEdge
            ? 'RANGING_EDGE'
            : 'RANGING_NO_EDGE';

    const entry = {
      ...hashableBody,
      prevForecastHash,
      forecastHash,
      batchId,
      batchSize,
      modelId: resolvedModelId,
      modelName: resolvedModelName,
      providerId: String(forecastResult.providerId || forecastResult.series?.provider || 'tvdatafeed'),
      recordedAtUtcMs,
      maturesAtUtcMs,
      atrAtAnchor,
      baselineTerminalQ50,
      driftBaselineTerminalQ50,
      marketConditionTag,
      checkpointQuantiles,
      stepPoints,
      keyZones,
      noEdgeGateState,
      oodStatus: forecastResult.uncertainty?.oodStatus || 'IN_DISTRIBUTION',
      marketContextVersion: forecastResult.marketContext?.schemaVersion || MARKET_CONTEXT_ENGINE_VERSION,
      decisionReasonCode: forecastResult.decisionSummary?.reasonCode || null,
      pathSemantics: forecastResult.decisionSummary?.pathSemantics || null,
      pathEvents: Array.isArray(forecastResult.pathEvents)
        ? forecastResult.pathEvents.slice(0, 8).map((ev) => ({
            eventId: ev.eventId,
            type: ev.type,
            sourceType: ev.sourceType,
            direction: ev.direction,
            stepStart: ev.stepStart,
            stepEnd: ev.stepEnd,
            priceLevel: ev.priceLevel,
            invalidationLevel: ev.invalidationLevel,
          }))
        : [],
      behaviorScenarios: forecastResult.behaviorScenarios || null,
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
      .find(
        (e) =>
          e.symbolCode === entry.symbolCode &&
          e.timeframe === entry.timeframe &&
          (e.modelId || 'AUTO') === entry.modelId &&
          e.batchId !== entry.batchId
      );
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

  /**
   * Records multiple selected models simultaneously under a shared Batch ID and anchor timestamp.
   */
  appendBatchFromForecast(forecastResult, modelIds = [], options = {}) {
    if (!forecastResult || forecastResult.status === 'DATA_NOT_READY') {
      return { batchId: null, entries: [] };
    }
    const trajectories = Array.isArray(forecastResult.modelTrajectories) ? forecastResult.modelTrajectories : [];
    const rawRequested = Array.isArray(modelIds) && modelIds.length > 0
      ? modelIds.map((m) => String(m || '').trim()).filter(Boolean)
      : [String(forecastResult.selectedChartModelId || 'AUTO')];

    // Resolve 'AUTO' to actual winning modelId before deduplicating so AUTO + winner never duplicate
    const resolvedSelectedId = String(forecastResult.selectedChartModelId || 'AUTO');
    const requested = [];
    const seenRequested = new Set();
    for (const rawId of rawRequested) {
      const normalizedId = rawId === 'AUTO' && resolvedSelectedId !== 'AUTO' ? resolvedSelectedId : rawId;
      if (seenRequested.has(normalizedId)) continue;
      seenRequested.add(normalizedId);
      requested.push(normalizedId);
    }

    const validModels = [];
    const seenValidIds = new Set();
    for (const id of requested) {
      if (seenValidIds.has(id)) continue;
      if (id === forecastResult.selectedChartModelId && Array.isArray(forecastResult.points) && forecastResult.points.length > 0) {
        const tr = trajectories.find((t) => t.modelId === id);
        seenValidIds.add(id);
        validModels.push({
          modelId: id,
          modelName: tr?.modelName || forecastResult.selectedChartModelName || id,
          points: forecastResult.points,
          keyZones: tr?.meta?.smcZones || forecastResult.keyZones || [],
        });
        continue;
      }
      const tr = trajectories.find(
        (t) => t.modelId === id && t.status === 'SUCCESS' && Array.isArray(t.points) && t.points.length > 0
      );
      if (tr) {
        seenValidIds.add(tr.modelId);
        validModels.push({
          modelId: tr.modelId,
          modelName: tr.modelName || tr.modelId,
          points: tr.points,
          keyZones: tr.meta?.smcZones || forecastResult.keyZones || [],
        });
      }
    }

    if (options.requireMultiple && validModels.length < 2) {
      return { batchId: null, entries: [], reason: 'NEED_AT_LEAST_2_MODELS' };
    }

    if (validModels.length === 0 && Array.isArray(forecastResult.points) && forecastResult.points.length > 0) {
      const fallbackId = String(forecastResult.selectedChartModelId || 'AUTO');
      validModels.push({
        modelId: fallbackId,
        modelName: forecastResult.selectedChartModelName || fallbackId,
        points: forecastResult.points,
        keyZones: forecastResult.keyZones || [],
      });
    }

    const existingEntries = this.loadEntries();
    const nextSeq = existingEntries.length > 0 ? Number(existingEntries[existingEntries.length - 1].seq || existingEntries.length) + 1 : 1;
    const batchTimestampMs = Number(options.batchTimestampMs ?? options.recordedAtUtcMs ?? Date.now());
    const dedupeWindowMs = options.dedupeWindowMs ?? 5 * 60 * 1000;

    let modelsToRecord = validModels;
    const skippedDuplicates = [];
    if (options.preventDuplicate) {
      modelsToRecord = [];
      for (const item of validModels) {
        const dup = this.findRecentDuplicateEntry(
          {
            symbolCode: forecastResult.symbolCode,
            timeframe: forecastResult.timeframe,
            horizonBars: item.points.length,
            modelId: item.modelId,
            anchorOpenTimeUtcMs: Number(forecastResult.anchorOpenTimeUtcMs || 0),
            recordedAtUtcMs: batchTimestampMs,
            windowMs: dedupeWindowMs,
          },
          existingEntries
        );
        if (dup) skippedDuplicates.push(dup);
        else modelsToRecord.push(item);
      }
      if (modelsToRecord.length === 0) {
        const sharedBatchId = skippedDuplicates[0]?.batchId || null;
        return {
          batchId: sharedBatchId,
          entries: [],
          skippedDuplicates,
          comparisonHashes: skippedDuplicates.map((e) => e.forecastHash),
          reason: 'ALL_DUPLICATE',
        };
      }
    }

    const batchId =
      modelsToRecord.length >= 2
        ? `BATCH-${forecastResult.symbolCode || 'SYM'}-${forecastResult.timeframe || 'M15'}-${batchTimestampMs}-${nextSeq}`
        : `SNAP-${batchTimestampMs}-${nextSeq}`;
    const recorded = [];
    for (let i = 0; i < modelsToRecord.length; i++) {
      const item = modelsToRecord[i];
      const lastPt = item.points[item.points.length - 1];
      const entry = this.appendFromForecast(forecastResult, {
        batchId,
        batchSize: modelsToRecord.length,
        modelId: item.modelId,
        modelName: item.modelName,
        points: item.points,
        keyZones: item.keyZones,
        horizonBars: item.points.length,
        terminalMedian: Number(lastPt?.q50 ?? lastPt?.q50_median ?? forecastResult.summary?.terminalQ50 ?? 0),
        terminalQ10: Number(lastPt?.q10 ?? forecastResult.summary?.terminalQ10 ?? 0),
        terminalQ90: Number(lastPt?.q90 ?? forecastResult.summary?.terminalQ90 ?? 0),
        generatedAtUtcMs: batchTimestampMs + i,
        recordedAtUtcMs: batchTimestampMs,
      });
      if (entry) recorded.push(entry);
    }

    const comparisonHashes = [...recorded, ...skippedDuplicates].map((e) => e.forecastHash);
    return { batchId, entries: recorded, skippedDuplicates, comparisonHashes };
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
    evaluationDetails = null,
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
      evaluationDetails,
      prevEventHash,
      eventHash,
    };
    events.push(ev);
    this.saveLifecycleEvents(events);
    return ev;
  }

  /**
   * Computes 5-dimensional evaluation + 4 analytical intelligence metrics for a slice of realized bars.
   */
  _computeMultiDimensionalEvaluation(entry, slice, step) {
    const anchorClose = Number(entry.anchorClose || 0);
    const obsClose = Number(slice[slice.length - 1].close);
    const cpBand = entry.checkpointQuantiles && entry.checkpointQuantiles[String(step)];
    const stepPt = Array.isArray(entry.stepPoints) ? entry.stepPoints[step - 1] : null;
    const stepQ10 = Number(cpBand?.q10 ?? stepPt?.q10 ?? entry.terminalQ10);
    const stepQ50 = Number(cpBand?.q50 ?? stepPt?.q50 ?? entry.terminalMedian);
    const stepQ90 = Number(cpBand?.q90 ?? stepPt?.q90 ?? entry.terminalQ90);

    // 1. Trend / Direction Accuracy
    const predDir = classifyDirectionLabel(anchorClose, stepQ50);
    const actualDir = classifyDirectionLabel(anchorClose, obsClose);
    const predPctChange = anchorClose > 0 ? ((stepQ50 - anchorClose) / anchorClose) * 100 : 0;
    const actualPctChange = anchorClose > 0 ? ((obsClose - anchorClose) / anchorClose) * 100 : 0;
    const directionHit =
      predDir === actualDir ||
      ((stepQ50 >= anchorClose) === (obsClose >= anchorClose) && Math.abs(actualPctChange) > 0.02);

    // 2. Candle-by-Candle Hit Rate & Q50 MAE + Early Invalidation Detection
    const hasStepPoints = Array.isArray(entry.stepPoints) && entry.stepPoints.length >= step;
    let insideCount = 0;
    let maeSum = 0;
    let maePctSum = 0;
    let consecutiveOutside = 0;
    let earlyInvalidated = false;
    let earlyInvalidatedAtStep = null;
    let earlyInvalidationDirection = null;
    const atrUnit = Math.max(
      1e-6,
      Number(entry.atrAtAnchor) > 0
        ? Number(entry.atrAtAnchor)
        : Math.abs(stepQ90 - stepQ10) / 3.2 || anchorClose * 0.005
    );

    for (let i = 0; i < slice.length; i++) {
      const barClose = Number(slice[i].close);
      const frac = (i + 1) / Math.max(1, step);
      const pt = hasStepPoints ? entry.stepPoints[i] : null;
      const bQ50 = pt && Number.isFinite(Number(pt.q50))
        ? Number(pt.q50)
        : anchorClose + (stepQ50 - anchorClose) * frac;
      const bQ10 = pt && Number.isFinite(Number(pt.q10))
        ? Number(pt.q10)
        : anchorClose + (stepQ10 - anchorClose) * frac;
      const bQ90 = pt && Number.isFinite(Number(pt.q90))
        ? Number(pt.q90)
        : anchorClose + (stepQ90 - anchorClose) * frac;

      const absErr = Math.abs(barClose - bQ50);
      maeSum += absErr;
      if (anchorClose > 0) maePctSum += (absErr / anchorClose) * 100;

      const isInside = barClose >= bQ10 && barClose <= bQ90;
      if (isInside) {
        insideCount += 1;
        consecutiveOutside = 0;
      } else {
        consecutiveOutside += 1;
        const breachDist = barClose > bQ90 ? barClose - bQ90 : bQ10 - barClose;
        if (!earlyInvalidated && i + 1 < step && (consecutiveOutside >= 2 || breachDist >= 0.35 * atrUnit)) {
          earlyInvalidated = true;
          earlyInvalidatedAtStep = i + 1;
          earlyInvalidationDirection = barClose > bQ90 ? 'UPSIDE_BREAKOUT' : 'DOWNSIDE_BREAKDOWN';
        }
      }
    }

    const totalBars = slice.length;
    const hitRatePct = totalBars > 0 ? (insideCount / totalBars) * 100 : 0;
    const q50Mae = totalBars > 0 ? maeSum / totalBars : Math.abs(obsClose - stepQ50);
    const q50MaePct = totalBars > 0 ? maePctSum / totalBars : Math.abs(actualPctChange - predPctChange);
    const terminalAbsError = Math.abs(obsClose - stepQ50);
    const terminalErrorPct = anchorClose > 0 ? (terminalAbsError / anchorClose) * 100 : 0;

    // 3. Support / Resistance Accuracy (Touch / Bounce / Breakout)
    const zones = Array.isArray(entry.keyZones) ? entry.keyZones : [];
    const zoneEvaluations = [];
    for (const z of zones) {
      const zLow = Math.min(Number(z.lowPrice || 0), Number(z.highPrice || 0));
      const zHigh = Math.max(Number(z.lowPrice || 0), Number(z.highPrice || 0));
      if (!(zHigh > 0)) continue;
      const isRes = String(z.zoneType || '').includes('RESISTANCE');
      let touchedAtStep = null;
      let reaction = 'UNTESTED';
      for (let i = 0; i < slice.length; i++) {
        const b = slice[i];
        const bHi = Number(b.high);
        const bLo = Number(b.low);
        const bCl = Number(b.close);
        if (touchedAtStep === null && bHi >= zLow && bLo <= zHigh) {
          touchedAtStep = i + 1;
        }
        if (touchedAtStep !== null) {
          if (isRes && bCl > zHigh + 0.1 * atrUnit) {
            reaction = 'BREAKOUT';
            break;
          }
          if (!isRes && bCl < zLow - 0.1 * atrUnit) {
            reaction = 'BREAKOUT';
            break;
          }
        }
      }
      if (touchedAtStep !== null && reaction !== 'BREAKOUT') {
        const postSlice = slice.slice(touchedAtStep - 1);
        const lastCl = Number(postSlice[postSlice.length - 1]?.close ?? obsClose);
        if (isRes && lastCl <= zHigh) reaction = 'BOUNCE';
        else if (!isRes && lastCl >= zLow) reaction = 'BOUNCE';
        else reaction = 'TOUCHED';
      }
      zoneEvaluations.push({
        zoneId: z.zoneId,
        zoneType: isRes ? 'RESISTANCE_ZONE' : 'SUPPORT_ZONE',
        lowPrice: zLow,
        highPrice: zHigh,
        touched: touchedAtStep !== null,
        touchedAtStep,
        reaction,
      });
    }
    const touchedZones = zoneEvaluations.filter((z) => z.touched);
    const bounceZones = touchedZones.filter((z) => z.reaction === 'BOUNCE');
    const breakoutZones = touchedZones.filter((z) => z.reaction === 'BREAKOUT');
    const srSummaryStatus =
      zoneEvaluations.length === 0
        ? 'NO_ZONES'
        : bounceZones.length > 0
          ? 'BOUNCE_HELD'
          : breakoutZones.length > 0
            ? 'BROKEN'
            : touchedZones.length > 0
              ? 'TOUCHED'
              : 'UNTESTED';

    // 4. Interval Containment (Terminal Close in [q10, q90])
    const terminalInsideBand = obsClose >= stepQ10 && obsClose <= stepQ90;

    // Volatility-Adjusted Error (in ATR units) & Baseline Benchmark (vs Naive Persistence)
    const volAdjustedMaeAtr = q50Mae / atrUnit;
    const volAdjustedTerminalErrAtr = terminalAbsError / atrUnit;
    const naiveBaselinePrice = Number(entry.baselineTerminalQ50 || anchorClose);
    const naiveTerminalError = Math.abs(obsClose - naiveBaselinePrice);
    const edgeVsNaivePct =
      naiveTerminalError > 1e-8
        ? ((naiveTerminalError - terminalAbsError) / naiveTerminalError) * 100
        : terminalAbsError <= 1e-8
          ? 0
          : -100;
    const beatsBaseline = terminalAbsError <= naiveTerminalError;

    // 5. 7-Dimensional Path Quality Vector (Master Plan §5.2)
    const synthTrajPoints = [];
    for (let i = 0; i < slice.length; i++) {
      const frac = (i + 1) / Math.max(1, step);
      const pt = hasStepPoints ? entry.stepPoints[i] : null;
      synthTrajPoints.push({
        q10: pt && Number.isFinite(Number(pt.q10)) ? Number(pt.q10) : anchorClose + (stepQ10 - anchorClose) * frac,
        q50: pt && Number.isFinite(Number(pt.q50)) ? Number(pt.q50) : anchorClose + (stepQ50 - anchorClose) * frac,
        q90: pt && Number.isFinite(Number(pt.q90)) ? Number(pt.q90) : anchorClose + (stepQ90 - anchorClose) * frac,
      });
    }
    const pathQuality = evaluatePathQualityVector({
      anchorClose,
      trajPoints: synthTrajPoints,
      actualCandles: slice,
      atrAtAnchor: atrUnit,
    });

    // 6. Overall Score (0..100)
    const dirPts = directionHit ? 20 : 0;
    const hitPts = Math.min(25, (hitRatePct / 100) * 25);
    const containPts = terminalInsideBand ? 15 : 0;
    const volErrPts = Math.max(0, 15 * (1 - Math.min(1, volAdjustedMaeAtr / 2.2)));
    const pqPts = pathQuality ? (pathQuality.pathQualityScore / 100) * 15 : 8;
    const srPts =
      srSummaryStatus === 'BOUNCE_HELD'
        ? 10
        : srSummaryStatus === 'TOUCHED'
          ? 7
          : srSummaryStatus === 'UNTESTED' || srSummaryStatus === 'NO_ZONES'
            ? 5
            : 2;
    const overallScore = Math.max(0, Math.min(100, Math.round(dirPts + hitPts + containPts + volErrPts + pqPts + srPts)));

    return {
      step,
      anchorClose,
      observedClose: obsClose,
      stepQ10,
      stepQ50,
      stepQ90,
      predDir,
      actualDir,
      predPctChange: Number(predPctChange.toFixed(3)),
      actualPctChange: Number(actualPctChange.toFixed(3)),
      directionHit,
      insideCount,
      totalBars,
      hitRatePct: Number(hitRatePct.toFixed(1)),
      q50Mae: Number(q50Mae.toFixed(6)),
      q50MaePct: Number(q50MaePct.toFixed(3)),
      terminalAbsError: Number(terminalAbsError.toFixed(6)),
      terminalErrorPct: Number(terminalErrorPct.toFixed(3)),
      terminalInsideBand,
      volAdjustedMaeAtr: Number(volAdjustedMaeAtr.toFixed(3)),
      volAdjustedTerminalErrAtr: Number(volAdjustedTerminalErrAtr.toFixed(3)),
      naiveTerminalError: Number(naiveTerminalError.toFixed(6)),
      edgeVsNaivePct: Number(edgeVsNaivePct.toFixed(2)),
      beatsBaseline,
      earlyInvalidated,
      earlyInvalidatedAtStep,
      earlyInvalidationDirection,
      srSummaryStatus,
      zoneEvaluations,
      pathQuality,
      pathQualityScore: pathQuality ? pathQuality.pathQualityScore : overallScore,
      turningPointAgreementPct: pathQuality ? pathQuality.turningPointAgreementPct : null,
      segmentDirectionSimilarityPct: pathQuality ? pathQuality.segmentDirectionSimilarityPct : null,
      pullbackDepthErrorAtr: pathQuality ? pathQuality.pullbackDepthErrorAtr : null,
      pullbackDurationErrorBars: pathQuality ? pathQuality.pullbackDurationErrorBars : null,
      amplitudeRatio: pathQuality ? pathQuality.amplitudeRatio : null,
      overallScore,
      marketConditionTag: entry.marketConditionTag || 'RANGING_NO_EDGE',
    };
  }

  /**
   * Evaluates matured forecasts against subsequent closed candles per independent horizon
   * and preserves AMBIGUOUS inside-bar target+invalidation hits while computing 5-dimensional metrics.
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

    let allEvents = this.loadLifecycleEvents();
    let backfilledMissingDetails = false;

    for (const entry of entries) {
      const subBars = clean.filter((c) => Number(c.open_time_utc_ms ?? c.openTimeUtcMs ?? 0) > entry.anchorOpenTimeUtcMs);
      if (subBars.length === 0) continue;

      const checkpoints = [5, 10, entry.horizonBars].filter((s, idx, arr) => s <= entry.horizonBars && arr.indexOf(s) === idx);
      for (const step of checkpoints) {
        const existingTerminal = allEvents.find(
          (ev) =>
            ev.forecastHash === entry.forecastHash &&
            ev.horizonStep === step &&
            [LIFECYCLE_STATUS.MATURED, LIFECYCLE_STATUS.CANCELLED].includes(ev.lifecycleStatus)
        );
        if (existingTerminal) {
          if (
            existingTerminal.lifecycleStatus === LIFECYCLE_STATUS.MATURED &&
            !existingTerminal.evaluationDetails &&
            subBars.length >= step
          ) {
            existingTerminal.evaluationDetails = this._computeMultiDimensionalEvaluation(entry, subBars.slice(0, step), step);
            backfilledMissingDetails = true;
          }
          continue;
        }
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

        const evalDetails = this._computeMultiDimensionalEvaluation(entry, slice, step);

        let outcome = EVALUATION_OUTCOME.FAILED;
        let reason = `Observed close ${obsClose.toFixed(4)} outside +${step}b 80% corridor [${stepQ10.toFixed(4)}, ${stepQ90.toFixed(4)}] | Score ${evalDetails.overallScore}/100`;
        if (ambiguousHit) {
          outcome = EVALUATION_OUTCOME.AMBIGUOUS;
          reason = 'Simultaneous upper/lower corridor touch inside single bar without sub-TF order';
        } else if (obsClose >= stepQ10 && obsClose <= stepQ90) {
          outcome = EVALUATION_OUTCOME.SUCCESS;
          reason = `Observed close inside [q10, q90] at +${step}b maturity | Hit ${evalDetails.insideCount}/${evalDetails.totalBars} | Score ${evalDetails.overallScore}/100`;
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
          evaluationDetails: evalDetails,
        });
        appended.push(ev);
        allEvents = this.loadLifecycleEvents();
      }
    }
    if (backfilledMissingDetails) {
      this.saveLifecycleEvents(allEvents);
    }
    return appended;
  }

  /**
   * Builds a rolling Model Scorecard over the last N (default 20) matured forecasts per model.
   */
  buildModelScorecards(maxRecentPerModel = 20, filterSymbol = '') {
    const entries = this.loadEntries().filter((e) => !filterSymbol || e.symbolCode === filterSymbol);
    const events = this.loadLifecycleEvents();
    const terminalEventByHash = new Map();
    for (const ev of events) {
      if (ev.lifecycleStatus === LIFECYCLE_STATUS.MATURED) {
        const prev = terminalEventByHash.get(ev.forecastHash);
        if (!prev || Number(ev.horizonStep) >= Number(prev.horizonStep)) {
          terminalEventByHash.set(ev.forecastHash, ev);
        }
      }
    }

    const byModel = new Map();
    for (const entry of entries) {
      const mId = String(entry.modelId || 'AUTO');
      if (!byModel.has(mId)) {
        byModel.set(mId, {
          modelId: mId,
          modelName: entry.modelName || mId,
          totalRecorded: 0,
          pendingCount: 0,
          maturedRecords: [],
        });
      }
      const bucket = byModel.get(mId);
      bucket.totalRecorded += 1;
      const matEv = terminalEventByHash.get(entry.forecastHash);
      if (matEv && Number(matEv.horizonStep) === Number(entry.horizonBars)) {
        bucket.maturedRecords.push({ entry, event: matEv, details: matEv.evaluationDetails || null });
      } else {
        bucket.pendingCount += 1;
      }
    }

    const scorecards = [];
    for (const bucket of byModel.values()) {
      const recent = bucket.maturedRecords.slice(-Math.max(1, maxRecentPerModel));
      if (recent.length === 0) {
        scorecards.push({
          modelId: bucket.modelId,
          modelName: bucket.modelName,
          totalRecorded: bucket.totalRecorded,
          maturedCount: 0,
          pendingCount: bucket.pendingCount,
          meanScore: null,
          meanHitRatePct: null,
          directionAccuracyPct: null,
          containmentRatePct: null,
          meanVolAdjErrorAtr: null,
          baselineBeatRatePct: null,
          meanPathQualityScore: null,
          meanTurningAgreementPct: null,
          meanSegmentSimilarityPct: null,
          bestContext: '—',
        });
        continue;
      }

      let scoreSum = 0;
      let hitRateSum = 0;
      let dirHits = 0;
      let containHits = 0;
      let volErrSum = 0;
      let volErrCount = 0;
      let baselineBeats = 0;
      let pqScoreSum = 0;
      let pqCount = 0;
      let turnAgreeSum = 0;
      let segSimSum = 0;
      const contextScores = new Map();

      for (const item of recent) {
        const d = item.details;
        const isContained =
          d?.terminalInsideBand ?? item.event.evaluationOutcome === EVALUATION_OUTCOME.SUCCESS;
        const score = Number.isFinite(Number(d?.overallScore))
          ? Number(d.overallScore)
          : isContained
            ? 75
            : 30;
        const hitRate = Number.isFinite(Number(d?.hitRatePct))
          ? Number(d.hitRatePct)
          : isContained
            ? 80
            : 25;
        const dirHit =
          d?.directionHit ??
          (item.entry.terminalMedian >= item.entry.anchorClose) ===
            (Number(item.event.observedClose) >= item.entry.anchorClose);

        scoreSum += score;
        hitRateSum += hitRate;
        if (dirHit) dirHits += 1;
        if (isContained) containHits += 1;
        if (Number.isFinite(Number(d?.volAdjustedMaeAtr))) {
          volErrSum += Number(d.volAdjustedMaeAtr);
          volErrCount += 1;
        }
        if (Number.isFinite(Number(d?.pathQualityScore))) {
          pqScoreSum += Number(d.pathQualityScore);
          turnAgreeSum += Number(d.turningPointAgreementPct ?? 100);
          segSimSum += Number(d.segmentDirectionSimilarityPct ?? 100);
          pqCount += 1;
        }
        if (d?.beatsBaseline ?? isContained) baselineBeats += 1;

        const ctxKey = `${item.entry.timeframe || 'M15'} | +${item.entry.horizonBars}b`;
        const prevCtx = contextScores.get(ctxKey) || { sum: 0, count: 0 };
        prevCtx.sum += score;
        prevCtx.count += 1;
        contextScores.set(ctxKey, prevCtx);
      }

      let bestContext = '—';
      let bestAvg = -1;
      for (const [ctxKey, val] of contextScores.entries()) {
        const avg = val.sum / val.count;
        if (avg > bestAvg) {
          bestAvg = avg;
          bestContext = ctxKey;
        }
      }

      scorecards.push({
        modelId: bucket.modelId,
        modelName: bucket.modelName,
        totalRecorded: bucket.totalRecorded,
        maturedCount: bucket.maturedRecords.length,
        recentWindowCount: recent.length,
        pendingCount: bucket.pendingCount,
        meanScore: Number((scoreSum / recent.length).toFixed(1)),
        meanHitRatePct: Number((hitRateSum / recent.length).toFixed(1)),
        directionAccuracyPct: Number(((dirHits / recent.length) * 100).toFixed(1)),
        containmentRatePct: Number(((containHits / recent.length) * 100).toFixed(1)),
        meanVolAdjErrorAtr: volErrCount > 0 ? Number((volErrSum / volErrCount).toFixed(2)) : null,
        baselineBeatRatePct: Number(((baselineBeats / recent.length) * 100).toFixed(1)),
        meanPathQualityScore: pqCount > 0 ? Number((pqScoreSum / pqCount).toFixed(1)) : Number((scoreSum / recent.length).toFixed(1)),
        meanTurningAgreementPct: pqCount > 0 ? Number((turnAgreeSum / pqCount).toFixed(1)) : null,
        meanSegmentSimilarityPct: pqCount > 0 ? Number((segSimSum / pqCount).toFixed(1)) : null,
        bestContext,
      });
    }

    return scorecards.sort((a, b) => Number(b.meanScore ?? -1) - Number(a.meanScore ?? -1));
  }

  verifyLifecycleChain(customEvents = null) {
    const events = Array.isArray(customEvents) ? customEvents : this.loadLifecycleEvents();
    if (events.length === 0) {
      return { valid: true, totalEvents: 0, brokenIndex: -1, error: null, reason: 'Empty lifecycle log' };
    }
    const storedAnchor = !Array.isArray(customEvents) ? this._loadAnchorPrevHash(this.lifecycleAnchorKey) : null;
    const knownEventHashes = new Set(events.map((x) => x && x.eventHash).filter(Boolean));
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const expectedPrev =
        i === 0
          ? storedAnchor && Number(ev.seq) === storedAnchor.firstSeq
            ? storedAnchor.prevHash
            : GENESIS_HASH
          : events[i - 1].eventHash;
      const isMultiDeviceChainLink =
        ev.prevEventHash === GENESIS_HASH ||
        knownEventHashes.has(ev.prevEventHash) ||
        (storedAnchor && ev.prevEventHash === storedAnchor.prevHash);
      if (ev.prevEventHash !== expectedPrev && !isMultiDeviceChainLink) {
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
      if (!forecastHash || item.forecastHash === forecastHash) {
        if (!item.syncedToCloud) {
          item.syncedToCloud = true;
          updated = true;
        }
      }
    }
    if (updated) this.saveEntries(entries);
    return updated;
  }

  /**
   * Bidirectional lossless merge of cloud entries and lifecycle events into local storage.
   * Deduplicates entries by forecastHash and lifecycle events by eventHash while preserving
   * multi-model batchId, evaluationDetails, and original cryptographic hash links.
   */
  mergeCloudSnapshot(remoteEntries = [], remoteEvents = []) {
    const localEntries = this.loadEntries();
    const localEvents = this.loadLifecycleEvents();

    const entriesByHash = new Map();
    for (const item of localEntries) {
      if (item && item.forecastHash) {
        entriesByHash.set(String(item.forecastHash), { ...item });
      }
    }

    let addedEntries = 0;
    for (const remote of Array.isArray(remoteEntries) ? remoteEntries : []) {
      if (!remote || !remote.forecastHash) continue;
      const hash = String(remote.forecastHash);
      const isLegacy = remote.contractVersion === LEGACY_CONTRACT_VERSION;
      const expectedHash = this.computeEntryHash(
        remote.prevForecastHash || GENESIS_HASH,
        this._buildHashableBody(remote),
        isLegacy
      );
      if (expectedHash !== hash) continue;

      const existing = entriesByHash.get(hash);
      if (existing) {
        entriesByHash.set(hash, {
          ...remote,
          ...existing,
          syncedToCloud: true,
        });
      } else {
        entriesByHash.set(hash, {
          ...remote,
          syncedToCloud: true,
        });
        addedEntries += 1;
      }
    }

    const mergedEntries = Array.from(entriesByHash.values()).sort((a, b) => {
      const tA = Number(a.recordedAtUtcMs || a.generatedAtUtcMs || 0);
      const tB = Number(b.recordedAtUtcMs || b.generatedAtUtcMs || 0);
      if (tA !== tB) return tA - tB;
      return Number(a.seq || 0) - Number(b.seq || 0);
    });
    this.saveEntries(mergedEntries);

    const eventsByHash = new Map();
    for (const ev of localEvents) {
      if (ev && ev.eventHash) {
        eventsByHash.set(String(ev.eventHash), { ...ev });
      }
    }

    let addedEvents = 0;
    for (const remoteEv of Array.isArray(remoteEvents) ? remoteEvents : []) {
      if (!remoteEv || !remoteEv.eventHash) continue;
      const eHash = String(remoteEv.eventHash);
      const body = {
        seq: remoteEv.seq,
        forecastHash: remoteEv.forecastHash,
        symbolCode: remoteEv.symbolCode,
        timeframe: remoteEv.timeframe,
        horizonStep: remoteEv.horizonStep,
        lifecycleStatus: remoteEv.lifecycleStatus,
        evaluationOutcome: remoteEv.evaluationOutcome,
        recordedAtUtcMs: remoteEv.recordedAtUtcMs,
      };
      const expectedV2 = this.computeEntryHash(remoteEv.prevEventHash || GENESIS_HASH, body, false);
      const expectedV1 = this.computeEntryHash(remoteEv.prevEventHash || GENESIS_HASH, body, true);
      if (eHash !== expectedV2 && eHash !== expectedV1) continue;

      const existingEv = eventsByHash.get(eHash);
      if (existingEv) {
        eventsByHash.set(eHash, {
          ...remoteEv,
          ...existingEv,
          evaluationDetails: existingEv.evaluationDetails || remoteEv.evaluationDetails || null,
        });
      } else {
        eventsByHash.set(eHash, { ...remoteEv });
        addedEvents += 1;
      }
    }

    const mergedEvents = Array.from(eventsByHash.values()).sort((a, b) => {
      const tA = Number(a.recordedAtUtcMs || 0);
      const tB = Number(b.recordedAtUtcMs || 0);
      if (tA !== tB) return tA - tB;
      return Number(a.seq || 0) - Number(b.seq || 0);
    });
    this.saveLifecycleEvents(mergedEvents);

    return {
      entries: this.loadEntries(),
      lifecycleEvents: this.loadLifecycleEvents(),
      addedEntries,
      addedEvents,
      totalEntries: mergedEntries.length,
      totalEvents: mergedEvents.length,
    };
  }

  verifyChain(customEntries = null) {
    const entries = Array.isArray(customEntries) ? customEntries : this.loadEntries();
    if (entries.length === 0) {
      return { valid: true, totalEntries: 0, brokenIndex: -1, error: null, reason: 'Empty ledger (SHA-256 Hash Chain Integrity idle)' };
    }

    const storedAnchor = !Array.isArray(customEntries) ? this._loadAnchorPrevHash(this.entriesAnchorKey) : null;
    const knownEntryHashes = new Set(entries.map((x) => x && x.forecastHash).filter(Boolean));
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const expectedPrev =
        i === 0
          ? storedAnchor && Number(e.seq) === storedAnchor.firstSeq
            ? storedAnchor.prevHash
            : GENESIS_HASH
          : entries[i - 1].forecastHash;
      const isMultiDeviceChainLink =
        e.prevForecastHash === GENESIS_HASH ||
        knownEntryHashes.has(e.prevForecastHash) ||
        (storedAnchor && e.prevForecastHash === storedAnchor.prevHash);
      if (e.prevForecastHash !== expectedPrev && !isMultiDeviceChainLink) {
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

