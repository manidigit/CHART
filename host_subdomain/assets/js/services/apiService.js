import {
  state,
  saveCandlesToCache,
  getCachedOrAggregatedCandles,
  saveSymbolsToStorage,
  savePreferences,
  saveOpenTabsToStorage,
  saveActiveTabId,
  getLocalByokKeys,
  getInstrumentSpec,
  mergeCandlesIdempotent,
  normalizeCandle,
  normalizeCanonicalChartKey,
  normalizeDrawingObject,
  normalizeHexForWeb,
  normalizeHexForAndroid,
  resolvePriceBasis,
} from '../core/store.js?v=1.42.0';
import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.42.0';
import { TimeframeAggregator } from '../algorithms/timeframeAggregator.js?v=1.42.0';

const STORAGE_OFFLINE_SALT = 'ci_offline_pw_salt';
const STORAGE_OFFLINE_HASH = 'ci_offline_pw_hash';
let pendingWorkspaceSync = false;

function clearLocalAuthSession(clearOfflineVerifier = false) {
  localStorage.removeItem('ci_session_token');
  localStorage.removeItem('ci_saved_password');
  localStorage.setItem('ci_auto_authenticated', 'false');
  state.isAuthenticated = false;
  if (clearOfflineVerifier) {
    localStorage.removeItem(STORAGE_OFFLINE_SALT);
    localStorage.removeItem(STORAGE_OFFLINE_HASH);
  }
}

async function computeSaltedPasswordDigest(password, saltHex) {
  if (typeof crypto === 'undefined' || !crypto.subtle || typeof TextEncoder === 'undefined') {
    return '';
  }
  const enc = new TextEncoder();
  const data = enc.encode(`${saltHex}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function saveOfflinePasswordVerifier(password) {
  try {
    if (typeof crypto === 'undefined' || !crypto.getRandomValues || !crypto.subtle) return;
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const saltHex = Array.from(saltBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const hashHex = await computeSaltedPasswordDigest(password, saltHex);
    if (hashHex) {
      localStorage.setItem(STORAGE_OFFLINE_SALT, saltHex);
      localStorage.setItem(STORAGE_OFFLINE_HASH, hashHex);
    }
  } catch {
    // Ignore WebCrypto unavailable
  }
}

async function verifyOfflinePassword(password) {
  try {
    const saltHex = localStorage.getItem(STORAGE_OFFLINE_SALT) || '';
    const storedHash = localStorage.getItem(STORAGE_OFFLINE_HASH) || '';
    if (!saltHex || !storedHash) return false;
    const candidate = await computeSaltedPasswordDigest(password, saltHex);
    return Boolean(candidate && candidate === storedHash);
  } catch {
    return false;
  }
}

function mapAuthErrorKey(resStatus, json, fallbackKey = 'error_invalid_credentials') {
  if (resStatus === 429 || (json && json.error_code === 'RATE_LIMITED')) {
    return 'error_rate_limited';
  }
  if (resStatus === 401 || (json && json.error_code === 'UNAUTHORIZED')) {
    return 'error_unauthorized';
  }
  if (json && json.message_key) {
    return String(json.message_key);
  }
  if (json && json.error_code === 'PASSWORD_SHORT') {
    return 'error_password_short';
  }
  return fallbackKey;
}

export async function syncServerAuthStatus() {
  localStorage.removeItem('ci_saved_password');
  const token = localStorage.getItem('ci_session_token');
  const remember = state.rememberCredentials;

  // First, if user opted into Remember Me and has a stored session token, validate the persistent token
  if (remember && token) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 6500) : null;
      const res = await fetch('./api/v1/auth.php?action=validate_session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_token: token }),
        signal: controller ? controller.signal : undefined,
      });
      if (timer) clearTimeout(timer);
      if (res.status === 401) {
        clearLocalAuthSession(false);
        state.isOwnerRegistered = true;
        return;
      }
      const json = await res.json();
      if (json && json.ok && json.data) {
        state.isAuthenticated = true;
        state.isOwnerRegistered = true;
        state.ownerUsername = json.data.owner_username || state.ownerUsername;
        state.ownerEmail = json.data.owner_email || state.ownerEmail;
        localStorage.setItem('ci_auto_authenticated', 'true');
        return;
      }
    } catch {
      // Offline fallback: if previously auto-authenticated, stay logged in
      if (localStorage.getItem('ci_auto_authenticated') === 'true' && state.ownerUsername) {
        state.isAuthenticated = true;
        state.isOwnerRegistered = true;
        return;
      }
    }
  }

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 6500) : null;
    const res = await fetch('./api/v1/auth.php?action=status&_t=' + Date.now(), {
      signal: controller ? controller.signal : undefined,
    });
    if (timer) clearTimeout(timer);
    const json = await res.json();
    if (json && json.ok && json.data) {
      state.isOwnerRegistered = Boolean(json.data.is_owner_registered);
      if (json.data.owner_username) {
        state.ownerUsername = json.data.owner_username;
        localStorage.setItem('ci_owner_username', state.ownerUsername);
      }
      if (json.data.owner_email) {
        state.ownerEmail = json.data.owner_email;
        localStorage.setItem('ci_owner_email', state.ownerEmail);
      }
      if (json.data.is_authenticated) {
        state.isAuthenticated = true;
      } else if (
        state.rememberCredentials &&
        token &&
        localStorage.getItem('ci_auto_authenticated') === 'true' &&
        state.ownerUsername
      ) {
        state.isAuthenticated = true;
      } else {
        state.isAuthenticated = false;
      }
    }
  } catch {
    state.isOwnerRegistered = Boolean(localStorage.getItem('ci_owner_username'));
    if (state.rememberCredentials && localStorage.getItem('ci_auto_authenticated') === 'true') {
      state.isAuthenticated = true;
    }
  }
}

export async function loginOrRegisterOwner(username, email, password) {
  const action = state.isOwnerRegistered ? 'login' : 'register_owner';
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 6500) : null;
    const res = await fetch(`./api/v1/auth.php?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
      signal: controller ? controller.signal : undefined,
    });
    if (timer) clearTimeout(timer);
    const json = await res.json();
    if (json && json.ok) {
      state.isOwnerRegistered = true;
      state.isAuthenticated = true;
      state.ownerUsername = (json.data && json.data.owner_username) || username;
      state.ownerEmail = (json.data && json.data.owner_email) || email || state.ownerEmail;
      localStorage.setItem('ci_owner_username', state.ownerUsername);
      if (state.ownerEmail) localStorage.setItem('ci_owner_email', state.ownerEmail);

      const token = json.data && json.data.session_token;
      if (token) {
        localStorage.setItem('ci_session_token', token);
      }
      localStorage.removeItem('ci_saved_password');

      if (state.rememberCredentials) {
        localStorage.setItem('ci_auto_authenticated', 'true');
        await saveOfflinePasswordVerifier(password);
      } else {
        localStorage.removeItem('ci_auto_authenticated');
        localStorage.removeItem(STORAGE_OFFLINE_SALT);
        localStorage.removeItem(STORAGE_OFFLINE_HASH);
      }
      return { ok: true };
    }
    return {
      ok: false,
      errorKey: mapAuthErrorKey(res.status, json, 'error_invalid_credentials'),
    };
  } catch {
    // Fallback offline verification against salted SHA-256 verifier when server is unreachable
    if (
      state.rememberCredentials &&
      state.ownerUsername &&
      username.toLowerCase() === state.ownerUsername.toLowerCase() &&
      (await verifyOfflinePassword(password))
    ) {
      state.isAuthenticated = true;
      localStorage.setItem('ci_auto_authenticated', 'true');
      return { ok: true };
    }
    return { ok: false, errorKey: 'error_invalid_credentials' };
  }
}

export async function updateOwnerEmailOnServer(email) {
  const token = localStorage.getItem('ci_session_token') || '';
  try {
    const res = await fetch('./api/v1/auth.php?action=update_profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ email, session_token: token }),
    });
    if (res.status === 401) {
      clearLocalAuthSession(false);
      return { ok: false, errorKey: 'error_unauthorized' };
    }
    const json = await res.json();
    if (json && json.ok) {
      state.ownerEmail = email;
      localStorage.setItem('ci_owner_email', email);
      return { ok: true };
    }
    return { ok: false, errorKey: mapAuthErrorKey(res.status, json, 'error_invalid_email') };
  } catch {
    return { ok: false, errorKey: 'chart_state_error' };
  }
}

export async function updateOwnerPasswordOnServer(newPassword) {
  const token = localStorage.getItem('ci_session_token') || '';
  try {
    const res = await fetch('./api/v1/auth.php?action=change_password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ new_password: newPassword, session_token: token }),
    });
    if (res.status === 401) {
      clearLocalAuthSession(false);
      return { ok: false, errorKey: 'error_unauthorized' };
    }
    const json = await res.json();
    if (json && json.ok) {
      const nextToken = json.data && json.data.session_token;
      if (nextToken) {
        localStorage.setItem('ci_session_token', nextToken);
      }
      localStorage.removeItem('ci_saved_password');
      if (state.rememberCredentials) {
        await saveOfflinePasswordVerifier(newPassword);
      }
      return { ok: true };
    }
    return { ok: false, errorKey: mapAuthErrorKey(res.status, json, 'error_password_short') };
  } catch {
    return { ok: false, errorKey: 'chart_state_error' };
  }
}

export async function requestPasswordResetCode(email) {
  try {
    const res = await fetch('./api/v1/auth.php?action=request_password_reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const json = await res.json();
    if (json && json.ok) return { ok: true };
    return { ok: false, errorKey: mapAuthErrorKey(res.status, json, 'error_email_not_found') };
  } catch {
    return { ok: false, errorKey: 'error_email_not_found' };
  }
}

export async function confirmPasswordResetCode(email, code, newPassword) {
  try {
    const res = await fetch('./api/v1/auth.php?action=confirm_password_reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, new_password: newPassword }),
    });
    const json = await res.json();
    if (json && json.ok) {
      const nextToken = json.data && json.data.session_token;
      if (nextToken) {
        localStorage.setItem('ci_session_token', nextToken);
      }
      localStorage.removeItem('ci_saved_password');
      if (state.rememberCredentials) {
        await saveOfflinePasswordVerifier(newPassword);
      }
      return { ok: true };
    }
    return { ok: false, errorKey: mapAuthErrorKey(res.status, json, 'error_invalid_recovery_code') };
  } catch {
    return { ok: false, errorKey: 'error_invalid_recovery_code' };
  }
}

export async function logoutOwnerOnServer() {
  const token = localStorage.getItem('ci_session_token');
  try {
    await fetch('./api/v1/auth.php?action=logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ session_token: token }),
    });
  } catch {
    // Ignore network error on logout
  }
  clearLocalAuthSession(true);
}

export async function fetchSystemStatus() {
  try {
    const res = await fetch(`./api/v1/system/status.php?_t=${Date.now()}`);
    const json = await res.json();
    if (json && json.ok && json.data) {
      state.systemStatus = json.data;
      return json.data;
    }
  } catch {
    // Offline or fallback
  }
  return state.systemStatus;
}

export async function uploadWorkspaceSync() {
  if (state.isWorkspaceSyncing) {
    pendingWorkspaceSync = true;
    return false;
  }
  state.isWorkspaceSyncing = true;
  pendingWorkspaceSync = false;
  const token = localStorage.getItem('ci_session_token') || '';
  try {
    const p = { ...(state.chartPreferences || {}) };
    delete p.twelveDataApiKey;
    delete p.stooqApiKey;
    delete p.alphaVantageApiKey;
    delete p.finnhubApiKey;

    const normalizedCustomColors = {};
    if (p.indicatorCustomColors && typeof p.indicatorCustomColors === 'object') {
      for (const [ck, cv] of Object.entries(p.indicatorCustomColors)) {
        if (ck && typeof cv === 'string') {
          const normHex = normalizeHexForWeb(cv, '');
          if (/^#[0-9A-F]{6}$/.test(normHex)) {
            normalizedCustomColors[ck] = normHex;
          }
        }
      }
    }

    const unifiedPrefs = {
      ...p,
      indicatorCustomColors: normalizedCustomColors,
      preferencesUpdatedAtMs: Number(p.preferencesUpdatedAtMs || Date.now()),
      bullCandleColorHex: normalizeHexForAndroid(p.bullColor, 'FF26A69A'),
      bearCandleColorHex: normalizeHexForAndroid(p.bearColor, 'FFEF5350'),
      trendLineColorHex: normalizeHexForAndroid(p.trendColor, 'FF2962FF'),
      horizontalLineColorHex: normalizeHexForAndroid(p.hLineColor, 'FFF59E0B'),
      verticalLineColorHex: normalizeHexForAndroid(p.vLineColor, 'FFA855F7'),
      defaultDrawingColorHex: normalizeHexForAndroid(p.defaultDrawingColorHex || p.trendColor, 'FF2962FF'),
      defaultDrawingWidthDp: Number(p.defaultDrawingWidthPx || 2.0),
      timezoneMode: p.timezoneMode === 'LOCAL' ? 'LOCAL' : 'UTC',
      volumePaneRatio: Math.max(0.12, Math.min(0.35, Number(p.volumePaneRatio || 0.22))),
      bollingerPeriod: Number(p.bollingerPeriod || 20),
      bollingerStdDev: Number(p.bollingerStdDev || 2.0),
      logarithmicScaleDefault: Boolean(p.isLogScale),
      rememberLastChartOnDevice: Boolean(p.rememberLastChart),
      pickerVibrations: Boolean(p.pickerVibrates),
      showPickerScrollMagnifiers: Boolean(p.showScrollMagnifier),
    };

    const canonicalDrawings = {};
    for (const [k, list] of Object.entries(state.drawingsByChartId || {})) {
      if (Array.isArray(list)) {
        const normKey = normalizeCanonicalChartKey(k);
        canonicalDrawings[normKey] = list.map(normalizeDrawingObject).filter(Boolean);
      }
    }

    const workspace = {
      drawings: canonicalDrawings,
      preferences: unifiedPrefs,
      symbols: (state.symbols || []).map((s) => ({
        symbolCode: s.symbolCode,
        customTitle: s.customTitle || '',
        decimals: s.decimals,
        inWatchlist: Boolean(s.inWatchlist),
        activeProvider: 'tvdatafeed',
        timeframe: s.timeframe || 'M15',
        isCustom: Boolean(s.isCustom),
      })),
      open_tabs: {
        lastOpenedSymbolCode: state.lastOpenedSymbolCode || 'SPOTBRENT',
        activeTabId: state.activeTabId || '',
        tabs: (state.openTabs || []).map((t) => ({
          tabId: t.tabId,
          symbolCode: t.symbolCode,
          provider: 'tvdatafeed',
          timeframe: t.timeframe,
          chartType: t.chartType === 'line' ? 'line' : 'candlestick',
          visibleCount: t.visibleCount,
          scrollOffset: t.scrollOffset,
          showVolume: t.showVolume !== false,
          volumePaneRatio: Math.max(
            0.12,
            Math.min(0.35, Number(t.volumePaneRatio || p.volumePaneRatio || 0.22))
          ),
          showSma20: Boolean(t.showSma20),
          showSma50: Boolean(t.showSma50),
          showSma200: Boolean(t.showSma200),
          showEma20: Boolean(t.showEma20),
          showEma50: Boolean(t.showEma50),
          showEma200: Boolean(t.showEma200),
          showSupertrend: Boolean(t.showSupertrend),
          showVwap: Boolean(t.showVwap),
          showPsar: Boolean(t.showPsar),
          showIchimoku: Boolean(t.showIchimoku),
          showKeltner: Boolean(t.showKeltner),
          showDonchian: Boolean(t.showDonchian),
          showMtfEma: Boolean(t.showMtfEma),
          showKillzones: Boolean(t.showKillzones),
          showBollinger: Boolean(t.showBollinger),
          showOverlayMacd: Boolean(t.showOverlayMacd),
          showRsi14: Boolean(t.showRsi14),
          showMacd: Boolean(t.showMacd),
          showAtr14: Boolean(t.showAtr14),
          showAdx14: Boolean(t.showAdx14),
          showStoch14: Boolean(t.showStoch14),
          showCci20: Boolean(t.showCci20),
          showWillR14: Boolean(t.showWillR14),
          showObv: Boolean(t.showObv),
          showCmf20: Boolean(t.showCmf20),
          showRoc12: Boolean(t.showRoc12),
          showSmcStructure: Boolean(t.showSmcStructure),
          showFvg: Boolean(t.showFvg),
          showVolumeProfile: Boolean(t.showVolumeProfile),
          showPivotPoints: Boolean(t.showPivotPoints),
          pivotType: String(t.pivotType || p.pivotType || 'STANDARD').toUpperCase(),
          showFutureProjection: Boolean(t.showFutureProjection),
          pitchforkVariant: t.pitchforkVariant || p.pitchforkVariant || 'original',
          isLogScale: Boolean(t.isLogScale),
          isMagnetMode: Boolean(t.isMagnetMode),
          activeDrawingColorHex: normalizeHexForAndroid(
            t.activeDrawingColorHex || t.activeDrawingColor || p.defaultDrawingColorHex,
            'FF2962FF'
          ),
          activeDrawingWidthDp: Number(t.activeDrawingWidthPx || p.defaultDrawingWidthPx || 2.0),
        })),
      },
    };
    const res = await fetch('./api/v1/workspace_sync.php', {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ session_token: token, workspace }),
    });
    if (res.status === 401) {
      clearLocalAuthSession(false);
      return false;
    }
    const json = await res.json();
    if (json && json.ok) {
      state.lastWorkspaceSyncedAt = (json.data && json.data.updated_at_utc) || new Date().toISOString();
      return true;
    }
  } catch {
    // Non-fatal
  } finally {
    state.isWorkspaceSyncing = false;
    if (pendingWorkspaceSync && state.isAuthenticated) {
      pendingWorkspaceSync = false;
      setTimeout(() => {
        uploadWorkspaceSync().catch(() => {});
      }, 150);
    }
  }
  return false;
}

export async function downloadWorkspaceSync() {
  const token = localStorage.getItem('ci_session_token') || '';
  try {
    const res = await fetch(`./api/v1/workspace_sync.php?_t=${Date.now()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) {
      clearLocalAuthSession(false);
      return false;
    }
    const json = await res.json();
    if (json && json.ok && json.data && json.data.workspace) {
      const ws = json.data.workspace;

      if (ws.drawings && typeof ws.drawings === 'object') {
        const mergedDrawings = { ...state.drawingsByChartId };
        for (const [k, list] of Object.entries(ws.drawings)) {
          if (Array.isArray(list)) {
            const normKey = normalizeCanonicalChartKey(k);
            mergedDrawings[normKey] = list.map(normalizeDrawingObject).filter(Boolean);
          }
        }
        state.drawingsByChartId = mergedDrawings;
        localStorage.setItem('ci_drawings_v2', JSON.stringify(state.drawingsByChartId));
      }

      if (ws.preferences && typeof ws.preferences === 'object') {
        const p = ws.preferences;
        const localPrefs = { ...(state.chartPreferences || {}) };
        const localUpdatedAt = Number(localPrefs.preferencesUpdatedAtMs || 0);
        const remoteUpdatedAt = Number(p.preferencesUpdatedAtMs || 0);

        const localCustomColors = {};
        if (localPrefs.indicatorCustomColors && typeof localPrefs.indicatorCustomColors === 'object') {
          for (const [ck, cv] of Object.entries(localPrefs.indicatorCustomColors)) {
            const normHex = normalizeHexForWeb(cv, '');
            if (ck && /^#[0-9A-F]{6}$/.test(normHex)) {
              localCustomColors[ck] = normHex;
            }
          }
        }
        const remoteCustomColors = {};
        if (p.indicatorCustomColors && typeof p.indicatorCustomColors === 'object') {
          for (const [ck, cv] of Object.entries(p.indicatorCustomColors)) {
            const normHex = normalizeHexForWeb(cv, '');
            if (ck && /^#[0-9A-F]{6}$/.test(normHex)) {
              remoteCustomColors[ck] = normHex;
            }
          }
        }

        const isLocalNewer = localUpdatedAt > 0 && localUpdatedAt > remoteUpdatedAt;
        const mappedPrefs = isLocalNewer
          ? { ...p, ...localPrefs }
          : { ...localPrefs, ...p };

        delete mappedPrefs.twelveDataApiKey;
        delete mappedPrefs.stooqApiKey;
        delete mappedPrefs.alphaVantageApiKey;
        delete mappedPrefs.finnhubApiKey;

        if (!isLocalNewer) {
          if (p.bullCandleColorHex && !p.bullColor) mappedPrefs.bullColor = normalizeHexForWeb(p.bullCandleColorHex, '#26A69A');
          if (p.bearCandleColorHex && !p.bearColor) mappedPrefs.bearColor = normalizeHexForWeb(p.bearCandleColorHex, '#EF5350');
          if (p.trendLineColorHex && !p.trendColor) mappedPrefs.trendColor = normalizeHexForWeb(p.trendLineColorHex, '#2962FF');
          if (p.horizontalLineColorHex && !p.hLineColor) mappedPrefs.hLineColor = normalizeHexForWeb(p.horizontalLineColorHex, '#F59E0B');
          if (p.verticalLineColorHex && !p.vLineColor) mappedPrefs.vLineColor = normalizeHexForWeb(p.verticalLineColorHex, '#A855F7');
          if (p.defaultDrawingColorHex) mappedPrefs.defaultDrawingColorHex = normalizeHexForWeb(p.defaultDrawingColorHex, '#2962FF');
          if (p.defaultDrawingWidthDp !== undefined) mappedPrefs.defaultDrawingWidthPx = Number(p.defaultDrawingWidthDp || 2.0);
        }
        if (p.volumePaneRatio !== undefined && !isLocalNewer) {
          mappedPrefs.volumePaneRatio = Math.max(0.12, Math.min(0.35, Number(p.volumePaneRatio || 0.22)));
        }
        if (p.bollingerPeriod !== undefined && !isLocalNewer) mappedPrefs.bollingerPeriod = Math.max(5, Math.min(200, Number(p.bollingerPeriod || 20)));
        if (p.bollingerStdDev !== undefined && !isLocalNewer) mappedPrefs.bollingerStdDev = Math.max(0.5, Math.min(5.0, Number(p.bollingerStdDev || 2.0)));
        if (p.logarithmicScaleDefault !== undefined && p.isLogScale === undefined) mappedPrefs.isLogScale = Boolean(p.logarithmicScaleDefault);
        if (p.timezoneMode !== undefined && !isLocalNewer) mappedPrefs.timezoneMode = String(p.timezoneMode).toUpperCase() === 'LOCAL' ? 'LOCAL' : 'UTC';
        if (p.rememberLastChartOnDevice !== undefined && p.rememberLastChart === undefined) mappedPrefs.rememberLastChart = Boolean(p.rememberLastChartOnDevice);
        if (p.pickerVibrations !== undefined && p.pickerVibrates === undefined) mappedPrefs.pickerVibrates = Boolean(p.pickerVibrations);
        if (p.showPickerScrollMagnifiers !== undefined && p.showScrollMagnifier === undefined) mappedPrefs.showScrollMagnifier = Boolean(p.showPickerScrollMagnifiers);

        if (isLocalNewer) {
          mappedPrefs.indicatorCustomColors = localCustomColors;
          mappedPrefs.preferencesUpdatedAtMs = localUpdatedAt;
        } else if (remoteUpdatedAt > 0 && p.indicatorCustomColors && typeof p.indicatorCustomColors === 'object') {
          mappedPrefs.indicatorCustomColors = { ...localCustomColors, ...remoteCustomColors };
          mappedPrefs.preferencesUpdatedAtMs = remoteUpdatedAt;
        } else {
          mappedPrefs.indicatorCustomColors = { ...remoteCustomColors, ...localCustomColors };
          mappedPrefs.preferencesUpdatedAtMs = Math.max(localUpdatedAt, remoteUpdatedAt);
        }

        state.chartPreferences = mappedPrefs;
        savePreferences(true);
        if (isLocalNewer && state.isAuthenticated) {
          setTimeout(() => {
            uploadWorkspaceSync().catch(() => {});
          }, 250);
        }
      }

      if (Array.isArray(ws.symbols) && ws.symbols.length > 0) {
        const byCode = new Map(state.symbols.map((s) => [s.symbolCode, s]));
        for (const incoming of ws.symbols) {
          if (!incoming || !incoming.symbolCode) continue;
          const code = String(incoming.symbolCode).toUpperCase();
          const existing = byCode.get(code);
          if (existing) {
            existing.inWatchlist = incoming.inWatchlist !== undefined ? Boolean(incoming.inWatchlist) : existing.inWatchlist;
            existing.activeProvider = 'tvdatafeed';
            existing.timeframe = incoming.timeframe || existing.timeframe;
            if (incoming.customTitle) existing.customTitle = incoming.customTitle;
          } else {
            byCode.set(code, {
              symbolCode: code,
              customTitle: incoming.customTitle || code,
              decimals: Number(incoming.decimals || 2),
              inWatchlist: Boolean(incoming.inWatchlist),
              activeProvider: 'tvdatafeed',
              allowedProviders: ['tvdatafeed', 'twelve_data', 'dukascopy', 'yahoo_finance'],
              timeframe: incoming.timeframe || 'M15',
              lastClose: 0,
              lastCandleUtc: '',
              candles: [],
              isSyncing: false,
              syncError: false,
              isCustom: true,
            });
          }
        }
        state.symbols = Array.from(byCode.values());
        saveSymbolsToStorage(true);
      }

      const incomingOpenTabs = Array.isArray(ws.open_tabs)
        ? ws.open_tabs
        : ws.open_tabs && Array.isArray(ws.open_tabs.tabs)
          ? ws.open_tabs.tabs
          : [];
      if (ws.open_tabs && typeof ws.open_tabs === 'object' && ws.open_tabs.lastOpenedSymbolCode) {
        state.lastOpenedSymbolCode = String(ws.open_tabs.lastOpenedSymbolCode).trim().toUpperCase();
        localStorage.setItem('ci_last_opened_symbol', state.lastOpenedSymbolCode);
      }
      if (incomingOpenTabs.length > 0) {
        const existingBySym = new Map((state.openTabs || []).map((et) => [et.symbolCode, et]));
        state.openTabs = incomingOpenTabs.map((t, idx) => {
          const code = String(t.symbolCode || 'SPOTBRENT').toUpperCase();
          const tf = String(t.timeframe || 'M15').toUpperCase();
          const prov = 'tvdatafeed';
          const prevLocal = existingBySym.get(code);
          const resolvedColor = normalizeHexForWeb(
            t.activeDrawingColorHex || t.activeDrawingColor || state.chartPreferences.defaultDrawingColorHex,
            '#2962FF'
          );
          const resolvedVolRatio = Math.max(
            0.12,
            Math.min(
              0.35,
              Number(
                t.volumePaneRatio !== undefined
                  ? t.volumePaneRatio
                  : state.chartPreferences.volumePaneRatio !== undefined
                    ? state.chartPreferences.volumePaneRatio
                    : prevLocal?.volumePaneRatio || 0.22
              )
            )
          );
          const cachedCandles = getCachedOrAggregatedCandles(code, prov, tf);
          return {
            tabId: t.tabId || `tab_${code}_${tf}_${idx}`,
            chartId: `${code}_${tf}`,
            symbolCode: code,
            provider: prov,
            timeframe: tf,
            decimals: sym ? sym.decimals : Number(t.decimals || 2),
            candles:
              cachedCandles.length > 0
                ? cachedCandles
                : prevLocal && prevLocal.timeframe === tf && Array.isArray(prevLocal.candles)
                  ? prevLocal.candles
                  : [],
            chartType: String(t.chartType || '').toLowerCase() === 'line' ? 'line' : 'candles',
            showVolume: t.showVolume !== false,
            volumePaneRatio: resolvedVolRatio,
            showSma20: Boolean(t.showSma20),
            showSma50: Boolean(t.showSma50),
            showSma200: Boolean(t.showSma200),
            showEma20: Boolean(t.showEma20),
            showEma50: Boolean(t.showEma50),
            showEma200: Boolean(t.showEma200),
            showSupertrend: Boolean(t.showSupertrend),
            showVwap: Boolean(t.showVwap),
            showPsar: Boolean(t.showPsar),
            showIchimoku: Boolean(t.showIchimoku),
            showKeltner: Boolean(t.showKeltner),
            showDonchian: Boolean(t.showDonchian),
            showMtfEma: Boolean(t.showMtfEma),
            showKillzones: Boolean(t.showKillzones),
            showBollinger: Boolean(t.showBollinger),
            showOverlayMacd: Boolean(t.showOverlayMacd),
            showRsi14: Boolean(t.showRsi14),
            showMacd: Boolean(t.showMacd),
            showAtr14: Boolean(t.showAtr14),
            showAdx14: Boolean(t.showAdx14),
            showStoch14: Boolean(t.showStoch14),
            showCci20: Boolean(t.showCci20),
            showWillR14: Boolean(t.showWillR14),
            showObv: Boolean(t.showObv),
            showCmf20: Boolean(t.showCmf20),
            showRoc12: Boolean(t.showRoc12),
            showSmcStructure: Boolean(t.showSmcStructure),
            showFvg: Boolean(t.showFvg),
            showVolumeProfile: Boolean(t.showVolumeProfile),
            showPivotPoints: Boolean(t.showPivotPoints),
            pivotType: String(t.pivotType || state.chartPreferences.pivotType || 'STANDARD').toUpperCase(),
            showFutureProjection: Boolean(t.showFutureProjection),
            pitchforkVariant: t.pitchforkVariant || 'original',
            isMagnetMode: Boolean(t.isMagnetMode),
            isLogScale: t.isLogScale !== undefined ? Boolean(t.isLogScale) : Boolean(state.chartPreferences.isLogScale),
            selectedRangePreset: null,
            visibleCount: Number(t.visibleCount || 48),
            scrollOffset: Number(t.scrollOffset || 0),
            priceScaleFactor: 1.0,
            verticalPriceOffset: 0.0,
            hoverIndex: null,
            hoverY: null,
            activeTool: 'cursor',
            activeDrawingColor: resolvedColor,
            activeDrawingColorHex: resolvedColor,
            activeDrawingWidthPx: Number(
              t.activeDrawingWidthDp || t.activeDrawingWidthPx || state.chartPreferences.defaultDrawingWidthPx || 2.0
            ),
            selectedDrawingId: null,
            pendingTrendStart: null,
            drawings: state.drawingsByChartId[`${code}_${tf}`] || [],
          };
        });
        const cloudActiveId =
          ws.open_tabs && typeof ws.open_tabs === 'object' && ws.open_tabs.activeTabId
            ? String(ws.open_tabs.activeTabId)
            : '';
        if (cloudActiveId && state.openTabs.some((t) => t.tabId === cloudActiveId)) {
          saveActiveTabId(cloudActiveId);
        } else if (state.lastOpenedSymbolCode) {
          const matchBySym = state.openTabs.find((t) => t.symbolCode === state.lastOpenedSymbolCode);
          if (matchBySym) saveActiveTabId(matchBySym.tabId);
        }
        const sourceTab =
          state.openTabs.find((t) => t.tabId === state.activeTabId) || state.openTabs[0];
        if (sourceTab) {
          for (const k of [
            'showSma20',
            'showSma50',
            'showSma200',
            'showEma20',
            'showEma50',
            'showEma200',
            'showSupertrend',
            'showVwap',
            'showPsar',
            'showIchimoku',
            'showKeltner',
            'showDonchian',
            'showMtfEma',
            'showKillzones',
            'showBollinger',
            'showOverlayMacd',
            'showRsi14',
            'showMacd',
            'showAtr14',
            'showAdx14',
            'showStoch14',
            'showCci20',
            'showWillR14',
            'showObv',
            'showCmf20',
            'showRoc12',
            'showSmcStructure',
            'showFvg',
            'showVolumeProfile',
            'showPivotPoints',
            'showFutureProjection',
          ]) {
            state.chartPreferences[k] = Boolean(sourceTab[k]);
          }
          state.chartPreferences.volumePaneRatio = sourceTab.volumePaneRatio;
          savePreferences(true);
        }
        saveOpenTabsToStorage(true);
      }

      if (state.openTabs && state.openTabs.length > 0) {
        state.openTabs.forEach((tab) => {
          const key = `${tab.symbolCode}_${tab.timeframe || 'M15'}`;
          if (state.drawingsByChartId[key]) {
            tab.drawings = state.drawingsByChartId[key];
          }
          if (!tab.candles || tab.candles.length === 0) {
            tab.candles = getCachedOrAggregatedCandles(tab.symbolCode, tab.provider, tab.timeframe);
          }
        });
      }

      state.lastWorkspaceSyncedAt = json.data.updated_at_utc || new Date().toISOString();
      return true;
    }
  } catch {
    // Non-fatal
  }
  return false;
}

function computeExpectedLastClosedOpenMs(timeframe, nowMs = Date.now(), symbolCode = 'XAUUSD') {
  const normTf = String(timeframe || 'M15').toUpperCase();
  const stepMs = PriceFormatter.stepMilliseconds(normTf);
  const currentBucketOpenMs = PriceFormatter.snapToOpenUtcMs(nowMs, normTf);
  const candidateOpenMs = currentBucketOpenMs - stepMs;
  const cal = PriceFormatter.getSessionCalendar(symbolCode);

  if (cal === 'CRYPTO_24_7') {
    return candidateOpenMs;
  }

  const d = new Date(nowMs);
  const dow = d.getUTCDay();
  const hour = d.getUTCHours();

  if (normTf === 'W1') {
    return candidateOpenMs;
  }

  if (normTf === 'D1') {
    const todayMidnightMs = Math.floor(nowMs / 86400000) * 86400000;
    if (dow === 1) return todayMidnightMs - 3 * 86400000;
    if (dow === 0) return todayMidnightMs - 2 * 86400000;
    return todayMidnightMs - 86400000;
  }

  if (cal === 'US_EQUITIES') {
    if (dow === 6 || dow === 0 || (dow === 1 && hour < 14)) {
      const daysBackToFriday = dow === 6 ? 1 : dow === 0 ? 2 : 3;
      const fridayMidnightMs = Math.floor(nowMs / 86400000) * 86400000 - daysBackToFriday * 86400000;
      if (normTf === 'H4') return fridayMidnightMs + 16 * 3600000;
      if (normTf === 'H1') return fridayMidnightMs + 20 * 3600000;
      return fridayMidnightMs + 20 * 3600000 + 45 * 60000;
    }
    return candidateOpenMs;
  }

  if (dow === 6 || (dow === 0 && hour < 23)) {
    const daysBackToFriday = dow === 6 ? 1 : 2;
    const fridayMidnightMs = Math.floor(nowMs / 86400000) * 86400000 - daysBackToFriday * 86400000;
    if (normTf === 'H4') return fridayMidnightMs + 20 * 3600000;
    if (normTf === 'H1') return fridayMidnightMs + 21 * 3600000;
    return fridayMidnightMs + 21 * 3600000 + 45 * 60000;
  }

  return candidateOpenMs;
}

function fetchDirectFromTradingViewBrowserWs(symbolCode, timeframe, nBars = 300, nowMs = Date.now()) {
  return new Promise((resolve) => {
    if (typeof WebSocket === 'undefined') {
      resolve([]);
      return;
    }
    const normTf = String(timeframe || 'M15').toUpperCase();
    const tvInterval =
      normTf === 'M15'
        ? '15'
        : normTf === 'M30'
          ? '30'
          : normTf === 'H1'
            ? '60'
            : normTf === 'H4'
              ? '240'
              : normTf === 'W1'
                ? '1W'
                : '1D';
    const stepMs = PriceFormatter.stepMilliseconds(normTf);

    let exchange = 'PEPPERSTONE';
    let tvTicker = symbolCode;
    if (symbolCode === 'XAUUSD' || symbolCode === 'XAGUSD' || symbolCode === 'EURUSD') {
      exchange = 'OANDA';
    } else if (symbolCode === 'BRENT_FUTURES') {
      exchange = 'NYMEX';
      tvTicker = 'BZ1!';
    }

    const packMsg = (m, p) => {
      const s = JSON.stringify({ m, p });
      return `~m~${s.length}~m~${s}`;
    };

    let rawBuffer = '';
    let settled = false;
    let ws = null;
    const finish = (bars) => {
      if (settled) return;
      settled = true;
      try {
        if (ws && ws.readyState <= 1) ws.close();
      } catch {
        // Ignore
      }
      resolve(bars);
    };

    const timer = setTimeout(() => finish([]), 6500);

    try {
      ws = new WebSocket('wss://data.tradingview.com/socket.io/websocket?from=chart%2F');
      const chartSession = 'cs_' + Math.random().toString(36).slice(2, 14);
      ws.onopen = () => {
        const symArg = JSON.stringify({
          symbol: `${exchange}:${tvTicker}`,
          adjustment: 'splits',
          session: 'regular',
        });
        ws.send(packMsg('set_auth_token', ['unauthorized_user_token']));
        ws.send(packMsg('chart_create_session', [chartSession, '']));
        ws.send(packMsg('switch_timezone', [chartSession, 'Etc/UTC']));
        ws.send(packMsg('resolve_symbol', [chartSession, 'symbol_1', `=${symArg}`]));
        ws.send(packMsg('create_series', [chartSession, 's1', 's1', 'symbol_1', tvInterval, nBars]));
      };

      ws.onmessage = (ev) => {
        const text = String(ev.data || '');
        if (text.startsWith('~m~') && text.includes('~h~')) {
          ws.send(text);
          return;
        }
        rawBuffer += text;
        if (rawBuffer.includes('"series_completed"') || text.includes('"symbol_error"')) {
          clearTimeout(timer);
          const out = [];
          const regex = /"s":\[(\{"i":.*?\})\]/gs;
          let m;
          while ((m = regex.exec(rawBuffer)) !== null) {
            try {
              const items = JSON.parse('[' + m[1] + ']');
              for (const item of items) {
                const v = item && item.v;
                if (!Array.isArray(v) || v.length < 5) continue;
                const epochSec = Math.round(Number(v[0]));
                const rawMs = epochSec * 1000;
                let openMs;
                if (normTf === 'D1') {
                  const hourUtc = new Date(rawMs).getUTCHours();
                  const adjustedMs = hourUtc >= 21 ? rawMs + 4 * 3600000 : rawMs;
                  openMs = PriceFormatter.snapToOpenUtcMs(adjustedMs, 'D1');
                  if (rawMs + stepMs > nowMs || openMs + stepMs > nowMs) continue;
                } else if (normTf === 'W1') {
                  openMs = PriceFormatter.snapToOpenUtcMs(rawMs, 'W1');
                  if (rawMs + stepMs > nowMs || openMs + stepMs > nowMs) continue;
                } else if (normTf === 'H4') {
                  openMs = PriceFormatter.snapToOpenUtcMs(rawMs, 'H4');
                  if (rawMs + stepMs > nowMs || openMs + stepMs > nowMs) continue;
                } else {
                  openMs = PriceFormatter.snapToOpenUtcMs(rawMs, normTf);
                  if (openMs + stepMs > nowMs) continue;
                }
                const norm = normalizeCandle(
                  {
                    open_time_utc_ms: openMs,
                    open: v[1],
                    high: v[2],
                    low: v[3],
                    close: v[4],
                    volume: v[5] || 0,
                  },
                  normTf,
                  nowMs,
                  symbolCode
                );
                if (norm) out.push(norm);
              }
            } catch {
              // Ignore malformed chunk
            }
          }
          finish(out);
        }
      };

      ws.onerror = () => {
        clearTimeout(timer);
        finish([]);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        finish([]);
      };
    } catch {
      clearTimeout(timer);
      finish([]);
    }
  });
}

async function fetchFromBackend(symbolCode, provider, timeframe, limit = 2500, forceBackfill = false) {
  const rawTf = String(timeframe || 'M15').toUpperCase();
  const normTf =
    provider === 'eia_brent_spot'
      ? 'D1'
      : provider === 'stooq' && rawTf !== 'W1'
        ? 'D1'
        : rawTf;
  const safeLimit = Math.max(40, Math.min(5000, Number(limit) || 2500));
  const nowMs = Date.now();
  const cacheKey = `${symbolCode}_${provider}_${normTf}`;
  const exactCached = state.candleCache[cacheKey];
  const existingCached =
    exactCached && exactCached.length >= 30
      ? exactCached
      : getCachedOrAggregatedCandles(symbolCode, provider, normTf);
  const minBarsForDelta = 30;
  const lastLocalOpenMs =
    !forceBackfill && existingCached && existingCached.length >= minBarsForDelta
      ? Number(existingCached[existingCached.length - 1].open_time_utc_ms || 0)
      : 0;
  const stepMs = PriceFormatter.stepMilliseconds(normTf);
  const expectedLastClosedOpenMs = computeExpectedLastClosedOpenMs(normTf, nowMs, symbolCode);

  const byok = getLocalByokKeys();
  let userApiKey = '';
  if (provider === 'twelve_data' && byok.twelveDataApiKey) {
    userApiKey = String(byok.twelveDataApiKey).trim();
  } else if (provider === 'stooq' && byok.stooqApiKey) {
    userApiKey = String(byok.stooqApiKey).trim();
  }
  const reqLimit =
    !forceBackfill && lastLocalOpenMs > 0
      ? Math.min(safeLimit, Math.max(32, Math.ceil(Math.max(0, nowMs - lastLocalOpenMs) / Math.max(1, stepMs)) + 16))
      : safeLimit;
  const sinceParam = !forceBackfill && lastLocalOpenMs > 0 ? `&since_ms=${lastLocalOpenMs}` : '';
  const backfillParam = forceBackfill ? '&backfill=1' : '';
  const url = `./api/v1/candles_sync.php?symbol=${encodeURIComponent(
    symbolCode
  )}&provider=${encodeURIComponent(provider)}&timeframe=${encodeURIComponent(
    normTf
  )}&limit=${reqLimit}${sinceParam}${backfillParam}&_t=${nowMs}`;

  let candles = existingCached ? [...existingCached] : [];
  let syncOk = false;
  let errorMessage = '';
  let syncMeta = {
    sync_mode: 'NONE',
    fetched_new_bars: 0,
    stored_total_bars: candles.length,
    provider_status: 'UNKNOWN',
    price_basis: resolvePriceBasis(symbolCode, provider),
    instrument_spec: getInstrumentSpec(symbolCode, provider),
  };

  try {
    const reqHeaders = {};
    if (userApiKey) {
      reqHeaders['X-Provider-Api-Key'] = userApiKey;
    }
    const res = await fetch(url, { cache: 'no-store', headers: reqHeaders });
    const json = await res.json();
    if (res.ok && json && json.ok && json.data) {
      syncOk = true;
      if (json.data.sync_meta) {
        syncMeta = { ...syncMeta, ...json.data.sync_meta };
      }
      if (Array.isArray(json.data.candles) && json.data.candles.length > 0) {
        candles = mergeCandlesIdempotent(candles, json.data.candles, normTf, nowMs, symbolCode);
      }
      if (syncMeta.provider_status === 'API_KEY_REQUIRED' || syncMeta.provider_status === 'DEGRADED') {
        syncOk = false;
        errorMessage = syncMeta.error_message || syncMeta.provider_status;
      }
    } else {
      errorMessage = (json && (json.error || json.message)) || `HTTP ${res.status}`;
      syncMeta.provider_status = (json && json.error_code) || 'ERROR';
    }
  } catch (err) {
    errorMessage = (err && err.message) || 'Network unavailable';
    syncMeta.provider_status = 'NETWORK_ERROR';
  }

  if (candles.length === 0 && provider === 'tvdatafeed') {
    try {
      const staticRes = await fetch(
        `./data/tvdatafeed/${encodeURIComponent(symbolCode)}_${encodeURIComponent(normTf)}.json?_t=${nowMs}`,
        { cache: 'no-store' }
      );
      const staticJson = await staticRes.json();
      if (staticJson && Array.isArray(staticJson.candles) && staticJson.candles.length > 0) {
        candles = mergeCandlesIdempotent([], staticJson.candles, normTf, nowMs, symbolCode).slice(-safeLimit);
        if (!syncOk && candles.length > 0 && !errorMessage) {
          syncMeta.sync_mode = 'STATIC_SEED';
        }
      }
    } catch {
      // Ignore static fallback error
    }
  }

  const lastStoredOpenMs = candles.length > 0 ? Number(candles[candles.length - 1].open_time_utc_ms) : 0;
  const hasShallowHistory = (forceBackfill && candles.length < 200) || candles.length < minBarsForDelta;

  if (
    provider === 'tvdatafeed' &&
    (candles.length === 0 || hasShallowHistory || lastStoredOpenMs < expectedLastClosedOpenMs)
  ) {
    const gapBars =
      hasShallowHistory || lastStoredOpenMs <= 0
        ? Math.min(1500, Math.max(500, safeLimit))
        : Math.min(400, Math.max(16, Math.ceil((nowMs - lastStoredOpenMs) / Math.max(1, stepMs)) + 8));

    const liveWsBars = await fetchDirectFromTradingViewBrowserWs(symbolCode, normTf, gapBars, nowMs);
    if (liveWsBars.length > 0) {
      syncOk = true;
      errorMessage = '';
      const prevCount = candles.length;
      candles = mergeCandlesIdempotent(candles, liveWsBars, normTf, nowMs, symbolCode);
      const addedCount = Math.max(
        0,
        candles.length - prevCount,
        liveWsBars.filter((b) => Number(b.open_time_utc_ms || 0) > lastStoredOpenMs).length
      );
      syncMeta.sync_mode = !hasShallowHistory && lastStoredOpenMs > 0 ? 'DELTA_SYNC' : 'INITIAL_BACKFILL';
      syncMeta.provider_status = 'LIVE';
      syncMeta.fetched_new_bars = Number(syncMeta.fetched_new_bars || 0) + addedCount;
    }
  }

  const finalCandles = candles.slice(-safeLimit);
  syncMeta.stored_total_bars = Math.max(Number(syncMeta.stored_total_bars || 0), finalCandles.length);
  return { candles: finalCandles, syncMeta, syncOk, errorMessage };
}

export async function syncSymbolNow(symbolCode, requestedTf, renderCallback, forceBackfill = false, backgroundOnly = false) {
  const sym = state.symbols.find((s) => s.symbolCode === symbolCode);
  if (!sym) return;

  sym.isSyncing = true;
  sym.syncError = false;
  sym.syncErrorMessage = '';
  if (!backgroundOnly && typeof renderCallback === 'function') renderCallback();

  const rawRequestedTf = String(requestedTf || sym.timeframe || 'M15').toUpperCase();
  const effectiveTf =
    sym.activeProvider === 'eia_brent_spot'
      ? 'D1'
      : sym.activeProvider === 'stooq' && rawRequestedTf !== 'W1'
        ? 'D1'
        : rawRequestedTf;
  const baseLimit = Math.max(500, Math.min(5000, Number(state.chartPreferences.candleFetchLimit) || 2500));
  const fetchLimit = backgroundOnly ? Math.min(baseLimit, 600) : baseLimit;

  // Sync only the requested timeframe for instant switching; only include D1 for stooq when needed
  const timeframesToSync =
    sym.activeProvider === 'eia_brent_spot'
      ? ['D1']
      : sym.activeProvider === 'stooq'
        ? [effectiveTf]
        : [effectiveTf];

  try {
    const results = await Promise.all(
      timeframesToSync.map(async (tf) => {
        const res = await fetchFromBackend(symbolCode, sym.activeProvider, tf, fetchLimit, forceBackfill);
        return [tf, res.candles, res.syncMeta, res.syncOk, res.errorMessage];
      })
    );

    const syncedByTf = {};
    let activeMeta = null;
    let activeSyncOk = false;
    let activeErrMsg = '';
    for (const [tf, incoming, meta, syncOk, errMsg] of results) {
      if (tf === effectiveTf) {
        activeMeta = meta;
        activeSyncOk = syncOk;
        activeErrMsg = errMsg || '';
      }
      const cacheKey = `${symbolCode}_${sym.activeProvider}_${tf}`;
      const existing = state.candleCache[cacheKey] || getCachedOrAggregatedCandles(symbolCode, sym.activeProvider, tf);
      const merged =
        incoming && incoming.length > 0
          ? mergeCandlesIdempotent(existing, incoming, tf, Date.now(), symbolCode).slice(-baseLimit)
          : existing;
      syncedByTf[tf] = merged;
    }

    for (const tf of Object.keys(syncedByTf)) {
      const bars = syncedByTf[tf] || [];
      if (bars.length > 0) {
        saveCandlesToCache(`${symbolCode}_${sym.activeProvider}_${tf}`, bars, baseLimit, symbolCode);
      }
    }

    const activeCandles =
      syncedByTf[effectiveTf] || getCachedOrAggregatedCandles(symbolCode, sym.activeProvider, effectiveTf);

    const nowMs = Date.now();
    sym.timeframe = effectiveTf;
    sym.candles = activeCandles;
    sym.providerStatus = (activeMeta && activeMeta.provider_status) || (activeSyncOk ? 'READY' : 'ERROR');
    sym.priceBasis =
      (activeMeta && activeMeta.price_basis) || resolvePriceBasis(symbolCode, sym.activeProvider);
    sym.instrumentSpec =
      (activeMeta && activeMeta.instrument_spec) || getInstrumentSpec(symbolCode, sym.activeProvider);
    if (activeMeta) {
      sym.lastSyncMode = activeMeta.sync_mode || 'NONE';
      sym.fetchedNewBars = Number(activeMeta.fetched_new_bars || 0);
      if (activeMeta.gap_summary) {
        sym.gapSummary = activeMeta.gap_summary;
      }
    }
    const latestQuoteBar =
      effectiveTf === 'D1' && m15Bars.length > 0
        ? m15Bars[m15Bars.length - 1]
        : activeCandles[activeCandles.length - 1];

    if (latestQuoteBar) {
      sym.lastClose = Number(latestQuoteBar.close);
      const activeLastBar = activeCandles[activeCandles.length - 1] || latestQuoteBar;
      sym.lastCandleUtc = activeLastBar.open_time_utc_iso || latestQuoteBar.open_time_utc_iso;
      sym.lastCandleCloseMs =
        Number(activeLastBar.open_time_utc_ms || 0) + PriceFormatter.stepMilliseconds(effectiveTf);
    }

    if (activeSyncOk) {
      sym.lastSuccessfulFetchMs = nowMs;
      sym.syncError = false;
      sym.syncErrorMessage = '';
      sym.connectionStatus = PriceFormatter.isMarketOpen(nowMs, symbolCode) ? 'LIVE' : 'CLOSED';
    } else {
      sym.syncError = true;
      sym.syncErrorMessage = activeErrMsg || sym.providerStatus || 'Sync failed';
      sym.connectionStatus = activeCandles.length > 0 ? 'STALE' : 'ERROR';
    }

    for (const tab of state.openTabs) {
      if (tab.symbolCode === symbolCode) {
        const tabTf =
          sym.activeProvider === 'eia_brent_spot'
            ? 'D1'
            : sym.activeProvider === 'stooq' && tab.timeframe !== 'W1'
              ? 'D1'
              : tab.timeframe;
        tab.provider = sym.activeProvider;
        tab.providerStatus = sym.providerStatus;
        tab.connectionStatus = sym.connectionStatus;
        tab.lastSuccessfulFetchMs = sym.lastSuccessfulFetchMs;
        tab.lastCandleCloseMs = sym.lastCandleCloseMs;
        tab.syncErrorMessage = sym.syncErrorMessage;
        tab.gapSummary = sym.gapSummary || null;
        tab.timeframe = tabTf;
        tab.candles =
          syncedByTf[tabTf] || getCachedOrAggregatedCandles(symbolCode, sym.activeProvider, tabTf);
      }
    }

    if (!backgroundOnly) {
      saveSymbolsToStorage();
    }
  } catch (err) {
    sym.syncError = true;
    sym.syncErrorMessage = (err && err.message) || 'Sync failed';
    sym.connectionStatus = sym.candles && sym.candles.length > 0 ? 'STALE' : 'ERROR';
  } finally {
    sym.isSyncing = false;
    if (!backgroundOnly && typeof renderCallback === 'function') renderCallback();
  }
}

export async function syncAllWatchlistSymbols(renderCallback) {
  const watchlist = state.symbols.filter((s) => s.inWatchlist);
  if (watchlist.length === 0) return;

  // Sync the active tab's symbol first so the primary chart updates immediately
  const activeTab =
    state.openTabs.find((t) => t.tabId === state.activeTabId) || state.openTabs[0] || null;
  if (activeTab) {
    const activeSym = watchlist.find((s) => s.symbolCode === activeTab.symbolCode);
    if (activeSym) {
      await syncSymbolNow(activeSym.symbolCode, activeTab.timeframe || activeSym.timeframe || 'M15', renderCallback, false, false);
    }
  }

  // Sync remaining watchlist symbols quietly in the background without hammering the DOM on every symbol
  const remaining = watchlist.filter((s) => !activeTab || s.symbolCode !== activeTab.symbolCode);
  const BATCH_SIZE = 4;
  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const chunk = remaining.slice(i, i + BATCH_SIZE);
    await Promise.all(
      chunk.map((sym) => {
        const tf = sym.timeframe || 'M15';
        return syncSymbolNow(sym.symbolCode, tf, null, false, true);
      })
    );
    saveSymbolsToStorage();
    if (typeof renderCallback === 'function') {
      renderCallback();
    }
  }
}

/**
 * ENG-02: Read-only live/forming quote poll. Never writes unclosed bars into closed `candles` cache.
 */
export async function fetchLiveQuote(symbolCode, provider, timeframe) {
  const sym = state.symbols.find((s) => s.symbolCode === symbolCode);
  const activeProv = provider || (sym ? sym.activeProvider : 'tvdatafeed');
  const activeTf = String(timeframe || (sym ? sym.timeframe : 'M15') || 'M15').toUpperCase();
  const byok = getLocalByokKeys();
  const headers = {};
  if (activeProv === 'twelve_data' && byok.twelveDataApiKey) {
    headers['X-Provider-Api-Key'] = String(byok.twelveDataApiKey).trim();
  }
  try {
    const url = `./api/v1/quote.php?symbol=${encodeURIComponent(symbolCode)}&provider=${encodeURIComponent(
      activeProv
    )}&timeframe=${encodeURIComponent(activeTf)}&_t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store', headers });
    const json = await res.json();
    if (res.ok && json && json.ok && json.data) {
      const q = json.data;
      const quotePrice = Number(q.live_price || q.close || 0);
      const formingBar = q.forming_bar || null;
      const quoteMode = q.quote_mode || 'LAST_CLOSED_FALLBACK';
      if (sym && quotePrice > 0) {
        sym.liveQuotePrice = quotePrice;
        sym.formingBar = formingBar;
        sym.liveQuoteMode = quoteMode;
        sym.liveQuoteFetchedAtMs = Date.now();
      }
      for (const tab of state.openTabs) {
        if (tab.symbolCode === symbolCode && tab.provider === activeProv) {
          tab.liveQuotePrice = quotePrice > 0 ? quotePrice : null;
          tab.formingBar = formingBar;
          tab.liveQuoteMode = quoteMode;
        }
      }
      return q;
    }
  } catch {
    // Non-blocking quote failure
  }
  return null;
}

/**
 * ENG-03: Fetches gap & completeness diagnostic summary for an isolated (symbol, provider, timeframe).
 */
export async function fetchGapReport(symbolCode, provider, timeframe) {
  const sym = state.symbols.find((s) => s.symbolCode === symbolCode);
  const activeProv = provider || (sym ? sym.activeProvider : 'tvdatafeed');
  const activeTf = String(timeframe || (sym ? sym.timeframe : 'M15') || 'M15').toUpperCase();
  try {
    const url = `./api/v1/gap_report.php?symbol=${encodeURIComponent(symbolCode)}&provider=${encodeURIComponent(
      activeProv
    )}&timeframe=${encodeURIComponent(activeTf)}&_t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok && json && json.ok && json.data) {
      const report = json.data.report || json.data;
      if (sym) sym.gapSummary = report;
      for (const tab of state.openTabs) {
        if (tab.symbolCode === symbolCode && tab.provider === activeProv && tab.timeframe === activeTf) {
          tab.gapSummary = report;
        }
      }
      return report;
    }
  } catch {
    // Ignore non-fatal report fetch error
  }
  return null;
}

/**
 * INF-01: Exports an encrypted AES-256-GCM workspace & account metadata backup (.cibak.json).
 */
export async function exportEncryptedBackup(passphrase) {
  const token = localStorage.getItem('ci_session_token') || '';
  const res = await fetch('./api/v1/backup.php?action=export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ session_token: token, passphrase }),
  });
  if (res.status === 401) {
    clearLocalAuthSession(false);
    return { ok: false, errorKey: 'error_unauthorized' };
  }
  const json = await res.json();
  if (res.ok && json && json.ok && json.data) {
    return { ok: true, backup: json.data };
  }
  return { ok: false, error: (json && json.error) || 'Backup export failed' };
}

/**
 * INF-01: Restores an encrypted .cibak.json backup archive with server-side checksum validation.
 */
export async function restoreEncryptedBackup(backupPayload, passphrase) {
  const token = localStorage.getItem('ci_session_token') || '';
  const res = await fetch('./api/v1/backup.php?action=restore', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ session_token: token, backup: backupPayload, passphrase }),
  });
  if (res.status === 401) {
    clearLocalAuthSession(false);
    return { ok: false, errorKey: 'error_unauthorized' };
  }
  const json = await res.json();
  if (res.ok && json && json.ok && json.data) {
    return { ok: true, data: json.data };
  }
  return { ok: false, error: (json && json.error) || 'Backup restore failed' };
}

/**
 * §2.3: Fetches real cached live News, SEC EDGAR filings, Macro schedule, and Intermarket quotes.
 */
export async function fetchSymbolIntel(symbolCode, forceRefresh = false) {
  const sym = state.symbols.find((s) => s.symbolCode === symbolCode);
  try {
    const refreshParam = forceRefresh ? '&refresh=1' : '';
    const res = await fetch(
      `./api/v1/symbol_intel.php?symbol=${encodeURIComponent(symbolCode)}${refreshParam}&_t=${Date.now()}`,
      { cache: 'no-store' }
    );
    const json = await res.json();
    if (res.ok && json && json.ok && json.data) {
      if (!state.symbolIntelCache) state.symbolIntelCache = {};
      state.symbolIntelCache[symbolCode] = { fetchedAtMs: Date.now(), data: json.data };
      if (sym) sym.intel = json.data;
      return json.data;
    }
  } catch {
    // Non-blocking intel failure
  }
  return (state.symbolIntelCache && state.symbolIntelCache[symbolCode]?.data) || null;
}

/**
 * Phase 3: Upload historical CSV/EIA XLS/JSON file or manual OHLC entry with batch lineage.
 */
export async function uploadHistoricalImport({
  action = 'import',
  symbol = 'SPOTBRENT',
  provider = 'local_csv',
  timeframe = 'D1',
  qualityStatus = 'OFFICIAL',
  fileName = 'upload.csv',
  mimeType = '',
  fileBase64 = '',
  rawText = '',
  manualCandles = null,
  notes = '',
}) {
  const token = localStorage.getItem('ci_session_token') || '';
  const body = {
    session_token: token,
    action,
    symbol,
    provider,
    timeframe,
    quality_status: qualityStatus,
    file_name: fileName,
    mime_type: mimeType,
    notes,
  };
  if (Array.isArray(manualCandles) && manualCandles.length > 0) {
    body.manual_candles = manualCandles;
  } else if (fileBase64) {
    body.file_base64 = fileBase64;
  } else if (rawText) {
    body.raw_text = rawText;
  }

  try {
    const res = await fetch('./api/v1/import_candles.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      clearLocalAuthSession(false);
      return { ok: false, errorCode: 'UNAUTHORIZED', errorKey: 'error_unauthorized' };
    }
    const json = await res.json();
    if (res.ok && json && json.ok && json.data) {
      return { ok: true, data: json.data };
    }
    return {
      ok: false,
      errorCode: (json && json.error_code) || 'IMPORT_FAILED',
      errorKey: (json && json.message_key) || 'error_import_parse_failed',
      error: (json && json.error) || 'Import failed',
    };
  } catch (err) {
    return {
      ok: false,
      errorCode: 'NETWORK_ERROR',
      error: err && err.message ? err.message : 'Network error during historical import',
    };
  }
}

/**
 * Phase 3: Fetch recent historical import lineage batches.
 */
export async function fetchImportBatches(limit = 20) {
  const token = localStorage.getItem('ci_session_token') || '';
  try {
    const res = await fetch(`./api/v1/import_candles.php?action=batches&limit=${limit}&_t=${Date.now()}`, {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) {
      clearLocalAuthSession(false);
      return state.importBatches || [];
    }
    const json = await res.json();
    if (res.ok && json && json.ok && json.data && Array.isArray(json.data.batches)) {
      state.importBatches = json.data.batches;
      return state.importBatches;
    }
  } catch {
    // Non-fatal fallback
  }
  return state.importBatches || [];
}

/**
 * Phase 4: Record a deterministic forecast snapshot or execute backend projection via /api/v1/forecast.php
 */
export async function runForecastOnServer({
  symbolCode,
  timeframe,
  horizonBars = 30,
  candles = [],
  clientForecast = null,
  workerUrl = '',
} = {}) {
  const token = localStorage.getItem('ci_session_token') || '';
  try {
    const res = await fetch('./api/v1/forecast.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        action: clientForecast ? 'append_client_forecast' : 'run_and_record',
        symbol: symbolCode,
        timeframe,
        horizon_bars: horizonBars,
        candles: candles.slice(-180),
        client_forecast: clientForecast,
        worker_url: workerUrl || '',
      }),
    });
    if (res.status === 401) {
      clearLocalAuthSession(false);
      return { ok: false, errorCode: 'UNAUTHORIZED' };
    }
    const json = await res.json();
    if (res.ok && json && json.ok && json.data) {
      return { ok: true, data: json.data };
    }
    return {
      ok: false,
      errorCode: (json && json.error_code) || 'FORECAST_SYNC_FAILED',
      error: (json && json.error) || 'Forecast sync failed',
    };
  } catch (err) {
    return {
      ok: false,
      errorCode: 'NETWORK_ERROR',
      error: err && err.message ? err.message : 'Network error',
    };
  }
}

export async function fetchForecastLedger(symbolCode = '', timeframe = '') {
  const token = localStorage.getItem('ci_session_token') || '';
  try {
    const qs = new URLSearchParams({ action: 'ledger', _t: String(Date.now()) });
    if (symbolCode) qs.set('symbol', symbolCode);
    if (timeframe) qs.set('timeframe', timeframe);
    const res = await fetch(`./api/v1/forecast.php?${qs.toString()}`, {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) {
      clearLocalAuthSession(false);
      return [];
    }
    const json = await res.json();
    if (res.ok && json && json.ok && json.data) {
      if (Array.isArray(json.data.entries)) {
        state.forecastServerLedger = json.data.entries;
      }
      if (Array.isArray(json.data.lifecycle_events)) {
        state.forecastServerLifecycle = json.data.lifecycle_events;
      }
      return state.forecastServerLedger || [];
    }
  } catch {
    // Non-fatal fallback
  }
  return state.forecastServerLedger || [];
}

export async function appendForecastLifecycleEventOnServer(ev = {}) {
  const token = localStorage.getItem('ci_session_token') || '';
  try {
    const res = await fetch('./api/v1/forecast.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        action: 'append_lifecycle_event',
        session_token: token,
        lifecycle_event: {
          forecast_hash: ev.forecastHash || '',
          symbol_code: ev.symbolCode || '',
          timeframe: ev.timeframe || '',
          horizon_step: Number(ev.horizonStep || 0),
          lifecycle_status: ev.lifecycleStatus || 'MATURED',
          evaluation_outcome: ev.evaluationOutcome || 'PENDING',
          reason: ev.reason || '',
          observed_close: ev.observedClose ?? null,
          recorded_at_utc_ms: Number(ev.recordedAtUtcMs || Date.now()),
        },
      }),
    });
    if (res.status === 401) {
      clearLocalAuthSession(false);
      return { ok: false, errorCode: 'UNAUTHORIZED' };
    }
    const json = await res.json();
    if (res.ok && json && json.ok && json.data) {
      return { ok: true, data: json.data };
    }
    return { ok: false, errorCode: (json && json.error_code) || 'LIFECYCLE_APPEND_FAILED' };
  } catch (err) {
    return { ok: false, errorCode: 'NETWORK_ERROR', error: err?.message || 'Network error' };
  }
}

