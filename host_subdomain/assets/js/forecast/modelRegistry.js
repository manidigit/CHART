import { NaivePersistenceModel, HistoricalDriftModel } from './models/baselineModels.js?v=1.42.0';
import {
  KalmanMomentumModel,
  GarchVolatilityModel,
  ArimaEtsModel,
  GaussianProcessModel,
} from './models/statisticalModels.js?v=1.42.0';
import { REMOTE_WORKER_STATUS } from './forecastContract.js?v=1.42.0';

/**
 * Metadata-only specification for the optional self-hosted Python DL inference worker.
 * Never fabricates deep-learning predictions locally; reports honest UNCONFIGURED status
 * unless an external worker URL is explicitly provided and responds.
 */
export const REMOTE_DL_WORKER_SPEC = Object.freeze({
  id: 'remote_dl_worker',
  name: 'Remote Deep-Learning Worker (Optional)',
  supportedModels: ['Chronos-2 (Apache 2.0)', 'TimesFM 2.5', 'N-HiTS'],
  excludedModels: ['TimesFM 3.0'],
  endpointPath: '/forecast/infer',
});

/**
 * Pluggable Model Registry enabling runtime model registration, weight tuning,
 * enable/disable toggles, and isolated parameter updates.
 */
export class ForecastModelRegistry {
  constructor() {
    this._plugins = new Map();
    this._config = new Map();
    this.registerDefaults();
  }

  registerDefaults() {
    [
      NaivePersistenceModel,
      HistoricalDriftModel,
      KalmanMomentumModel,
      GarchVolatilityModel,
      ArimaEtsModel,
      GaussianProcessModel,
    ].forEach((plugin) => this.register(plugin));
  }

  register(plugin) {
    if (!plugin || !plugin.id || typeof plugin.predict !== 'function') {
      throw new Error('Forecast plugin must expose id and predict(features, horizon, params)');
    }
    this._plugins.set(plugin.id, plugin);
    if (!this._config.has(plugin.id)) {
      this._config.set(plugin.id, {
        id: plugin.id,
        enabled: plugin.defaultEnabled !== false,
        weight: Number(plugin.defaultWeight ?? 0.2),
        params: { ...(plugin.defaultParams || {}) },
      });
    }
    return this;
  }

  unregister(id) {
    this._plugins.delete(id);
    this._config.delete(id);
  }

  getPlugin(id) {
    return this._plugins.get(id) || null;
  }

  getConfig(id) {
    return this._config.get(id) || null;
  }

  list() {
    return Array.from(this._plugins.values()).map((plugin) => {
      const cfg = this._config.get(plugin.id) || {
        id: plugin.id,
        enabled: true,
        weight: Number(plugin.defaultWeight ?? 0.2),
        params: { ...(plugin.defaultParams || {}) },
      };
      return {
        id: plugin.id,
        name: plugin.name,
        family: plugin.family,
        description: plugin.description,
        defaultWeight: Number(plugin.defaultWeight ?? 0.2),
        defaultParams: { ...(plugin.defaultParams || {}) },
        enabled: Boolean(cfg.enabled),
        weight: Number(cfg.weight),
        params: { ...cfg.params },
      };
    });
  }

  getEnabledPlugins() {
    const items = [];
    for (const plugin of this._plugins.values()) {
      const cfg = this._config.get(plugin.id);
      if (cfg && cfg.enabled && Number(cfg.weight) > 0) {
        items.push({ plugin, config: cfg });
      }
    }
    return items;
  }

  setEnabled(id, enabled) {
    const cfg = this._config.get(id);
    if (!cfg) return false;
    cfg.enabled = Boolean(enabled);
    return true;
  }

  setWeight(id, weight) {
    const cfg = this._config.get(id);
    if (!cfg) return false;
    cfg.weight = Math.max(0, Math.min(1, Number(weight) || 0));
    return true;
  }

  setParams(id, patch = {}) {
    const cfg = this._config.get(id);
    if (!cfg) return false;
    cfg.params = { ...cfg.params, ...patch };
    return true;
  }

  resetDefaults() {
    for (const plugin of this._plugins.values()) {
      this._config.set(plugin.id, {
        id: plugin.id,
        enabled: plugin.defaultEnabled !== false,
        weight: Number(plugin.defaultWeight ?? 0.2),
        params: { ...(plugin.defaultParams || {}) },
      });
    }
  }

  serializeConfig() {
    const out = {};
    for (const [id, cfg] of this._config.entries()) {
      out[id] = {
        enabled: Boolean(cfg.enabled),
        weight: Number(cfg.weight),
        params: { ...(cfg.params || {}) },
      };
    }
    return out;
  }

  applyConfig(savedConfig) {
    if (!savedConfig || typeof savedConfig !== 'object') return;
    for (const [id, patch] of Object.entries(savedConfig)) {
      if (!this._config.has(id) || !patch || typeof patch !== 'object') continue;
      const cur = this._config.get(id);
      if (typeof patch.enabled === 'boolean') cur.enabled = patch.enabled;
      if (Number.isFinite(Number(patch.weight))) {
        cur.weight = Math.max(0, Math.min(1, Number(patch.weight)));
      }
      if (patch.params && typeof patch.params === 'object') {
        cur.params = { ...cur.params, ...patch.params };
      }
    }
  }

  static resolveRemoteWorkerStatus(workerUrl) {
    const trimmed = String(workerUrl || '').trim();
    if (!trimmed) {
      return {
        status: REMOTE_WORKER_STATUS.LOCAL_STATISTICAL_ONLY,
        configured: false,
        url: '',
      };
    }
    return {
      status: REMOTE_WORKER_STATUS.UNCONFIGURED,
      configured: true,
      url: trimmed,
    };
  }
}

export const defaultForecastRegistry = new ForecastModelRegistry();
