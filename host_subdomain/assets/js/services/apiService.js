import {
  state,
  saveCandlesToCache,
  getCachedOrAggregatedCandles,
  saveSymbolsToStorage,
  savePreferences,
  saveOpenTabsToStorage,
  mergeCandlesIdempotent,
  normalizeCandle,
  normalizeCanonicalChartKey,
  normalizeDrawingObject,
  normalizeHexForWeb,
  normalizeHexForAndroid,
  resolvePriceBasis,
} from '../core/store.js?v=1.35.0';
import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.35.0';
import { TimeframeAggregator } from '../algorithms/timeframeAggregator.js?v=1.35.0';

export async function syncServerAuthStatus() {
  const token = localStorage.getItem('ci_session_token');
  const remember = state.rememberCredentials;

  // First, if user opted into Remember Me and has a stored session token, validate the persistent token
  if (remember && token) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
      const res = await fetch('./api/v1/auth.php?action=validate_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: token }),
        signal: controller ? controller.signal : undefined,
      });
      if (timer) clearTimeout(timer);
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
    const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
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
        localStorage.getItem('ci_auto_authenticated') === 'true' &&
        state.ownerUsername
      ) {
        state.isAuthenticated = true;
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
    const res = await fetch(`./api/v1/auth.php?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
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

      if (state.rememberCredentials) {
        state.savedPassword = password;
        localStorage.setItem('ci_saved_password', password);
        localStorage.setItem('ci_auto_authenticated', 'true');
      } else {
        state.savedPassword = '';
        localStorage.removeItem('ci_saved_password');
        localStorage.removeItem('ci_auto_authenticated');
        localStorage.removeItem('ci_session_token');
      }
      return { ok: true };
    }
    return {
      ok: false,
      errorKey:
        json && json.error && json.error.code === 'ERR_INVALID_CREDENTIALS'
          ? 'login_error_invalid_credentials'
          : 'login_error_invalid_credentials',
    };
  } catch {
    // Fallback offline verification if server is temporarily unreachable
    if (
      state.ownerUsername &&
      username.toLowerCase() === state.ownerUsername.toLowerCase() &&
      state.savedPassword &&
      password === state.savedPassword
    ) {
      state.isAuthenticated = true;
      localStorage.setItem('ci_auto_authenticated', 'true');
      return { ok: true };
    }
    return { ok: false, errorKey: 'login_error_invalid_credentials' };
  }
}

export async function updateOwnerEmailOnServer(email) {
  try {
    const res = await fetch('./api/v1/auth.php?action=update_profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const json = await res.json();
    if (json && json.ok) {
      state.ownerEmail = email;
      localStorage.setItem('ci_owner_email', email);
      return true;
    }
  } catch {
    // Fallback local
  }
  state.ownerEmail = email;
  localStorage.setItem('ci_owner_email', email);
  return true;
}

export async function updateOwnerPasswordOnServer(newPassword) {
  try {
    const res = await fetch('./api/v1/auth.php?action=change_password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword }),
    });
    const json = await res.json();
    if (json && json.ok && state.rememberCredentials) {
      state.savedPassword = newPassword;
      localStorage.setItem('ci_saved_password', newPassword);
    }
    return Boolean(json && json.ok);
  } catch {
    return false;
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
    return Boolean(json && json.ok);
  } catch {
    return false;
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
    if (json && json.ok && state.rememberCredentials) {
      state.savedPassword = newPassword;
      localStorage.setItem('ci_saved_password', newPassword);
    }
    return Boolean(json && json.ok);
  } catch {
    return false;
  }
}

export async function logoutOwnerOnServer() {
  const token = localStorage.getItem('ci_session_token');
  try {
    await fetch('./api/v1/auth.php?action=logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_token: token }),
    });
  } catch {
    // Ignore network error on logout
  }
  localStorage.removeItem('ci_session_token');
  localStorage.setItem('ci_auto_authenticated', 'false');
  state.isAuthenticated = false;
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
  if (state.isWorkspaceSyncing) return false;
  state.isWorkspaceSyncing = true;
  const token = localStorage.getItem('ci_session_token') || '';
  try {
    const p = state.chartPreferences || {};
    const unifiedPrefs = {
      ...p,
      bullCandleColorHex: normalizeHexForAndroid(p.bullColor, 'FF26A69A'),
      bearCandleColorHex: normalizeHexForAndroid(p.bearColor, 'FFEF5350'),
      trendLineColorHex: normalizeHexForAndroid(p.trendColor, 'FF2962FF'),
      horizontalLineColorHex: normalizeHexForAndroid(p.hLineColor, 'FFF59E0B'),
      verticalLineColorHex: normalizeHexForAndroid(p.vLineColor, 'FFA855F7'),
      defaultDrawingColorHex: normalizeHexForAndroid(p.defaultDrawingColorHex || p.trendColor, 'FF2962FF'),
      defaultDrawingWidthDp: Number(p.defaultDrawingWidthPx || 2.0),
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
        activeProvider: s.activeProvider,
        timeframe: s.timeframe || 'M15',
        isCustom: Boolean(s.isCustom),
      })),
      open_tabs: {
        lastOpenedSymbolCode: state.lastOpenedSymbolCode || 'SPOTBRENT',
        tabs: (state.openTabs || []).map((t) => ({
          tabId: t.tabId,
          symbolCode: t.symbolCode,
          provider: t.provider,
          timeframe: t.timeframe,
          chartType: t.chartType === 'line' ? 'line' : 'candlestick',
          visibleCount: t.visibleCount,
          scrollOffset: t.scrollOffset,
          showSma20: Boolean(t.showSma20),
          showSma50: Boolean(t.showSma50),
          showSma200: Boolean(t.showSma200),
          showEma20: Boolean(t.showEma20),
          showEma50: Boolean(t.showEma50),
          showSupertrend: Boolean(t.showSupertrend),
          showVwap: Boolean(t.showVwap),
          showBollinger: Boolean(t.showBollinger),
          showOverlayMacd: Boolean(t.showOverlayMacd),
          showRsi14: Boolean(t.showRsi14),
          showMacd: Boolean(t.showMacd),
          showAtr14: Boolean(t.showAtr14),
          showSmcStructure: Boolean(t.showSmcStructure),
          showFvg: Boolean(t.showFvg),
          showVolumeProfile: Boolean(t.showVolumeProfile),
          showVolume: t.showVolume !== false,
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({ session_token: token, workspace }),
    });
    const json = await res.json();
    if (json && json.ok) {
      state.lastWorkspaceSyncedAt = (json.data && json.data.updated_at_utc) || new Date().toISOString();
      return true;
    }
  } catch {
    // Non-fatal
  } finally {
    state.isWorkspaceSyncing = false;
  }
  return false;
}

export async function downloadWorkspaceSync() {
  const token = localStorage.getItem('ci_session_token') || '';
  try {
    const res = await fetch(`./api/v1/workspace_sync.php?_t=${Date.now()}`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
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
        const mappedPrefs = { ...state.chartPreferences, ...p };
        if (p.bullCandleColorHex && !p.bullColor) mappedPrefs.bullColor = normalizeHexForWeb(p.bullCandleColorHex, '#26A69A');
        if (p.bearCandleColorHex && !p.bearColor) mappedPrefs.bearColor = normalizeHexForWeb(p.bearCandleColorHex, '#EF5350');
        if (p.trendLineColorHex && !p.trendColor) mappedPrefs.trendColor = normalizeHexForWeb(p.trendLineColorHex, '#2962FF');
        if (p.horizontalLineColorHex && !p.hLineColor) mappedPrefs.hLineColor = normalizeHexForWeb(p.horizontalLineColorHex, '#F59E0B');
        if (p.verticalLineColorHex && !p.vLineColor) mappedPrefs.vLineColor = normalizeHexForWeb(p.verticalLineColorHex, '#A855F7');
        if (p.defaultDrawingColorHex) mappedPrefs.defaultDrawingColorHex = normalizeHexForWeb(p.defaultDrawingColorHex, '#2962FF');
        if (p.defaultDrawingWidthDp !== undefined) mappedPrefs.defaultDrawingWidthPx = Number(p.defaultDrawingWidthDp || 2.0);
        if (p.bollingerPeriod !== undefined) mappedPrefs.bollingerPeriod = Math.max(5, Math.min(200, Number(p.bollingerPeriod || 20)));
        if (p.bollingerStdDev !== undefined) mappedPrefs.bollingerStdDev = Math.max(0.5, Math.min(5.0, Number(p.bollingerStdDev || 2.0)));
        if (p.logarithmicScaleDefault !== undefined && p.isLogScale === undefined) mappedPrefs.isLogScale = Boolean(p.logarithmicScaleDefault);
        if (p.rememberLastChartOnDevice !== undefined && p.rememberLastChart === undefined) mappedPrefs.rememberLastChart = Boolean(p.rememberLastChartOnDevice);
        if (p.pickerVibrations !== undefined && p.pickerVibrates === undefined) mappedPrefs.pickerVibrates = Boolean(p.pickerVibrations);
        if (p.showPickerScrollMagnifiers !== undefined && p.showScrollMagnifier === undefined) mappedPrefs.showScrollMagnifier = Boolean(p.showPickerScrollMagnifiers);
        state.chartPreferences = mappedPrefs;
        savePreferences(true);
      }

      if (Array.isArray(ws.symbols) && ws.symbols.length > 0) {
        const byCode = new Map(state.symbols.map((s) => [s.symbolCode, s]));
        for (const incoming of ws.symbols) {
          if (!incoming || !incoming.symbolCode) continue;
          const code = String(incoming.symbolCode).toUpperCase();
          const existing = byCode.get(code);
          if (existing) {
            existing.inWatchlist = incoming.inWatchlist !== undefined ? Boolean(incoming.inWatchlist) : existing.inWatchlist;
            existing.activeProvider = incoming.activeProvider || existing.activeProvider;
            existing.timeframe = incoming.timeframe || existing.timeframe;
            if (incoming.customTitle) existing.customTitle = incoming.customTitle;
          } else {
            byCode.set(code, {
              symbolCode: code,
              customTitle: incoming.customTitle || code,
              decimals: Number(incoming.decimals || 2),
              inWatchlist: Boolean(incoming.inWatchlist),
              activeProvider: incoming.activeProvider || 'tvdatafeed',
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
        localStorage.setItem('ci_last_opened_symbol_v2', state.lastOpenedSymbolCode);
      }
      if (incomingOpenTabs.length > 0 && (!state.openTabs || state.openTabs.length === 0)) {
        state.openTabs = incomingOpenTabs.map((t, idx) => {
          const code = String(t.symbolCode || 'SPOTBRENT').toUpperCase();
          const tf = String(t.timeframe || 'M15').toUpperCase();
          const sym = state.symbols.find((s) => s.symbolCode === code);
          const resolvedColor = normalizeHexForWeb(
            t.activeDrawingColorHex || t.activeDrawingColor || state.chartPreferences.defaultDrawingColorHex,
            '#2962FF'
          );
          return {
            tabId: t.tabId || `tab_${code}_${tf}_${idx}`,
            symbolCode: code,
            provider: t.provider || (sym ? sym.activeProvider : 'tvdatafeed'),
            timeframe: tf,
            decimals: sym ? sym.decimals : 2,
            candles: [],
            chartType: String(t.chartType || '').toLowerCase() === 'line' ? 'line' : 'candles',
            showVolume: t.showVolume !== false,
            volumePaneRatio: 0.22,
            showSma20: Boolean(t.showSma20),
            showSma50: Boolean(t.showSma50),
            showSma200: Boolean(t.showSma200),
            showEma20: Boolean(t.showEma20),
            showEma50: Boolean(t.showEma50),
            showSupertrend: Boolean(t.showSupertrend),
            showVwap: Boolean(t.showVwap),
            showBollinger: Boolean(t.showBollinger),
            showOverlayMacd: Boolean(t.showOverlayMacd),
            showRsi14: Boolean(t.showRsi14),
            showMacd: Boolean(t.showMacd),
            showAtr14: Boolean(t.showAtr14),
            showSmcStructure: Boolean(t.showSmcStructure),
            showFvg: Boolean(t.showFvg),
            showVolumeProfile: Boolean(t.showVolumeProfile),
            isMagnetMode: Boolean(t.isMagnetMode),
            isLogScale: Boolean(state.chartPreferences.isLogScale),
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
        saveOpenTabsToStorage(true);
      }

      if (state.openTabs && state.openTabs.length > 0) {
        state.openTabs.forEach((tab) => {
          const key = `${tab.symbolCode}_${tab.timeframe || 'M15'}`;
          if (state.drawingsByChartId[key]) {
            tab.drawings = state.drawingsByChartId[key];
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

function computeExpectedLastClosedOpenMs(timeframe, nowMs = Date.now()) {
  const normTf = String(timeframe || 'M15').toUpperCase();
  const stepMs = PriceFormatter.stepMilliseconds(normTf);
  const currentBucketOpenMs = Math.floor(nowMs / stepMs) * stepMs;
  const candidateOpenMs = currentBucketOpenMs - stepMs;

  const d = new Date(nowMs);
  const dow = d.getUTCDay();
  const hour = d.getUTCHours();

  if (normTf === 'D1') {
    const todayMidnightMs = Math.floor(nowMs / 86400000) * 86400000;
    if (dow === 1) return todayMidnightMs - 3 * 86400000;
    if (dow === 0) return todayMidnightMs - 2 * 86400000;
    if (dow === 6) return todayMidnightMs - 86400000;
    return todayMidnightMs - 86400000;
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
      normTf === 'M15' ? '15' : normTf === 'H1' ? '60' : normTf === 'H4' ? '240' : '1D';
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
                  openMs = Math.floor(adjustedMs / stepMs) * stepMs;
                  if (rawMs + stepMs > nowMs || openMs + stepMs > nowMs) continue;
                } else if (normTf === 'H4') {
                  openMs = Math.floor(rawMs / stepMs) * stepMs;
                  if (rawMs + stepMs > nowMs || openMs + stepMs > nowMs) continue;
                } else {
                  openMs = Math.floor(rawMs / stepMs) * stepMs;
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
                  nowMs
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

async function fetchFromBackend(symbolCode, provider, timeframe, limit = 500, forceBackfill = false) {
  const rawTf = String(timeframe || 'M15').toUpperCase();
  const normTf =
    provider === 'eia_brent_spot'
      ? 'D1'
      : provider === 'stooq' && rawTf !== 'W1'
        ? 'D1'
        : rawTf;
  const safeLimit = Math.max(40, Math.min(5000, Number(limit) || 500));
  const nowMs = Date.now();
  const cacheKey = `${symbolCode}_${provider}_${normTf}`;
  const exactCached = state.candleCache[cacheKey];
  const existingCached = exactCached || getCachedOrAggregatedCandles(symbolCode, provider, normTf);
  const minBarsForDelta =
    normTf === 'M15'
      ? 300
      : normTf === 'M30' || normTf === 'H1'
        ? 240
        : normTf === 'H4'
          ? 180
          : normTf === 'D1'
            ? 250
            : 140;
  const lastLocalOpenMs =
    !forceBackfill && exactCached && exactCached.length >= minBarsForDelta
      ? Number(exactCached[exactCached.length - 1].open_time_utc_ms || 0)
      : 0;

  const prefs = state.chartPreferences || {};
  let userApiKey = '';
  if (provider === 'twelve_data' && prefs.twelveDataApiKey) {
    userApiKey = String(prefs.twelveDataApiKey).trim();
  } else if (provider === 'stooq' && prefs.stooqApiKey) {
    userApiKey = String(prefs.stooqApiKey).trim();
  }
  const apiKeyParam = userApiKey ? `&api_key=${encodeURIComponent(userApiKey)}` : '';
  const sinceParam = !forceBackfill && lastLocalOpenMs > 0 ? `&since_ms=${lastLocalOpenMs}` : '';
  const backfillParam = forceBackfill || lastLocalOpenMs === 0 ? '&backfill=1' : '';
  const url = `./api/v1/candles_sync.php?symbol=${encodeURIComponent(
    symbolCode
  )}&provider=${encodeURIComponent(provider)}&timeframe=${encodeURIComponent(
    normTf
  )}&limit=${safeLimit}${sinceParam}${backfillParam}${apiKeyParam}&_t=${nowMs}`;

  let candles = existingCached ? [...existingCached] : [];
  let syncMeta = {
    sync_mode: lastLocalOpenMs > 0 ? 'DB_CACHE_HIT' : 'INITIAL_BACKFILL',
    fetched_new_bars: 0,
    stored_total_bars: candles.length,
    provider_status: 'READY',
    price_basis: resolvePriceBasis(symbolCode, provider),
  };

  try {
    const res = await fetch(url, { cache: 'no-store' });
    const json = await res.json();
    if (json && json.ok && json.data) {
      if (json.data.sync_meta) {
        syncMeta = { ...syncMeta, ...json.data.sync_meta };
      }
      if (Array.isArray(json.data.candles) && json.data.candles.length > 0) {
        candles = mergeCandlesIdempotent(candles, json.data.candles, normTf, nowMs);
      }
    }
  } catch {
    // Keep existingCached on network error
  }

  if (candles.length === 0 && provider === 'tvdatafeed') {
    try {
      const staticRes = await fetch(
        `./data/tvdatafeed/${encodeURIComponent(symbolCode)}_${encodeURIComponent(normTf)}.json?_t=${nowMs}`,
        { cache: 'no-store' }
      );
      const staticJson = await staticRes.json();
      if (staticJson && Array.isArray(staticJson.candles)) {
        candles = mergeCandlesIdempotent([], staticJson.candles, normTf, nowMs).slice(-safeLimit);
      }
    } catch {
      // Ignore static fallback error
    }
  }

  const lastStoredOpenMs = candles.length > 0 ? Number(candles[candles.length - 1].open_time_utc_ms) : 0;
  const expectedLastClosedOpenMs = computeExpectedLastClosedOpenMs(normTf, nowMs);
  const hasShallowHistory = forceBackfill || candles.length < minBarsForDelta;

  // Connect to TradingView WebSocket if history is shallow OR latest closed bar is behind expectedLastClosedOpenMs
  if (
    provider === 'tvdatafeed' &&
    (candles.length === 0 || hasShallowHistory || lastStoredOpenMs < expectedLastClosedOpenMs)
  ) {
    const stepMs = PriceFormatter.stepMilliseconds(normTf);
    const gapBars =
      hasShallowHistory || lastStoredOpenMs <= 0
        ? Math.min(1500, Math.max(500, safeLimit))
        : Math.min(1500, Math.max(20, Math.ceil((nowMs - lastStoredOpenMs) / stepMs) + 12));

    const liveWsBars = await fetchDirectFromTradingViewBrowserWs(symbolCode, normTf, gapBars, nowMs);
    if (liveWsBars.length > 0) {
      const prevCount = candles.length;
      candles = mergeCandlesIdempotent(candles, liveWsBars, normTf, nowMs);
      const addedCount = Math.max(
        0,
        candles.length - prevCount,
        liveWsBars.filter((b) => Number(b.open_time_utc_ms || 0) > lastStoredOpenMs).length
      );
      syncMeta.sync_mode = !hasShallowHistory && lastStoredOpenMs > 0 ? 'DELTA_SYNC' : 'INITIAL_BACKFILL';
      syncMeta.fetched_new_bars = Number(syncMeta.fetched_new_bars || 0) + addedCount;
    }
    if (normTf === 'H4') {
      const liveH1Bars = await fetchDirectFromTradingViewBrowserWs(
        symbolCode,
        'H1',
        Math.min(1500, Math.max(500, gapBars * 4)),
        nowMs
      );
      if (liveH1Bars.length > 0) {
        const aggH4 = TimeframeAggregator.aggregateCandles(liveH1Bars, 'H4', nowMs);
        candles = mergeCandlesIdempotent(candles, aggH4, 'H4', nowMs);
      }
    }
  }

  const finalCandles = candles.slice(-safeLimit);
  syncMeta.stored_total_bars = Math.max(Number(syncMeta.stored_total_bars || 0), finalCandles.length);
  return { candles: finalCandles, syncMeta };
}

export async function syncSymbolNow(symbolCode, requestedTf, renderCallback, forceBackfill = false) {
  const sym = state.symbols.find((s) => s.symbolCode === symbolCode);
  if (!sym) return;

  sym.isSyncing = true;
  sym.syncError = false;
  if (typeof renderCallback === 'function') renderCallback();

  const rawRequestedTf = String(requestedTf || sym.timeframe || 'M15').toUpperCase();
  const effectiveTf =
    sym.activeProvider === 'eia_brent_spot'
      ? 'D1'
      : sym.activeProvider === 'stooq' && rawRequestedTf !== 'W1'
        ? 'D1'
        : rawRequestedTf;
  const fetchLimit = Math.max(40, Math.min(5000, Number(state.chartPreferences.candleFetchLimit) || 500));

  const timeframesToSync =
    sym.activeProvider === 'eia_brent_spot'
      ? ['D1']
      : sym.activeProvider === 'stooq'
        ? Array.from(new Set(['D1', effectiveTf]))
        : Array.from(new Set(['M15', 'H1', 'H4', effectiveTf]));

  try {
    const results = await Promise.all(
      timeframesToSync.map(async (tf) => {
        const res = await fetchFromBackend(symbolCode, sym.activeProvider, tf, fetchLimit, forceBackfill);
        return [tf, res.candles, res.syncMeta];
      })
    );

    const syncedByTf = {};
    let activeMeta = null;
    for (const [tf, incoming, meta] of results) {
      if (tf === effectiveTf) activeMeta = meta;
      const cacheKey = `${symbolCode}_${sym.activeProvider}_${tf}`;
      const existing = state.candleCache[cacheKey] || getCachedOrAggregatedCandles(symbolCode, sym.activeProvider, tf);
      const merged =
        incoming && incoming.length > 0
          ? mergeCandlesIdempotent(existing, incoming, tf).slice(-fetchLimit)
          : existing;
      syncedByTf[tf] = merged;
    }

    const m15Bars = syncedByTf.M15 || [];
    if (m15Bars.length > 0) {
      saveCandlesToCache(`${symbolCode}_${sym.activeProvider}_M15`, m15Bars, fetchLimit);
      const aggH1 = TimeframeAggregator.aggregateCandles(m15Bars, 'H1');
      syncedByTf.H1 = mergeCandlesIdempotent(syncedByTf.H1 || [], aggH1, 'H1').slice(-fetchLimit);
    }

    const h1Bars = syncedByTf.H1 || [];
    if (h1Bars.length > 0) {
      saveCandlesToCache(`${symbolCode}_${sym.activeProvider}_H1`, h1Bars, fetchLimit);
      const aggH4 = TimeframeAggregator.aggregateCandles(h1Bars, 'H4');
      syncedByTf.H4 = mergeCandlesIdempotent(syncedByTf.H4 || [], aggH4, 'H4').slice(-fetchLimit);
    }

    for (const tf of Object.keys(syncedByTf)) {
      const bars = syncedByTf[tf] || [];
      if (bars.length > 0) {
        saveCandlesToCache(`${symbolCode}_${sym.activeProvider}_${tf}`, bars, fetchLimit);
      }
    }

    const activeCandles =
      syncedByTf[effectiveTf] || getCachedOrAggregatedCandles(symbolCode, sym.activeProvider, effectiveTf);

    sym.timeframe = effectiveTf;
    sym.candles = activeCandles;
    sym.priceBasis =
      (activeMeta && activeMeta.price_basis) || resolvePriceBasis(symbolCode, sym.activeProvider);
    if (activeMeta) {
      sym.lastSyncMode = activeMeta.sync_mode || 'DB_CACHE_HIT';
      sym.fetchedNewBars = Number(activeMeta.fetched_new_bars || 0);
    }
    const latestQuoteBar =
      effectiveTf === 'D1' && m15Bars.length > 0
        ? m15Bars[m15Bars.length - 1]
        : activeCandles[activeCandles.length - 1];

    if (latestQuoteBar) {
      sym.lastClose = Number(latestQuoteBar.close);
      sym.lastCandleUtc =
        (activeCandles[activeCandles.length - 1] &&
          activeCandles[activeCandles.length - 1].open_time_utc_iso) ||
        latestQuoteBar.open_time_utc_iso;
      sym.syncError = false;
    } else {
      sym.syncError = true;
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
        tab.timeframe = tabTf;
        tab.candles =
          syncedByTf[tabTf] || getCachedOrAggregatedCandles(symbolCode, sym.activeProvider, tabTf);
      }
    }

    saveSymbolsToStorage();
  } catch {
    sym.syncError = true;
  } finally {
    sym.isSyncing = false;
    if (typeof renderCallback === 'function') renderCallback();
  }
}

export async function syncAllWatchlistSymbols(renderCallback) {
  const watchlist = state.symbols.filter((s) => s.inWatchlist);
  for (const sym of watchlist) {
    const activeTab = state.openTabs.find(
      (t) => t.tabId === state.activeTabId && t.symbolCode === sym.symbolCode
    );
    const tf = activeTab ? activeTab.timeframe : sym.timeframe || 'M15';
    await syncSymbolNow(sym.symbolCode, tf, renderCallback, false);
  }
}
