import { state, saveCandlesToCache, getCachedOrAggregatedCandles, saveSymbolsToStorage } from '../core/store.js';

export async function checkBackendOwnerStatus() {
  try {
    const res = await fetch('./api/v1/auth.php?action=status');
    const json = await res.json();
    if (json && json.ok && json.data && json.data.is_owner_registered) {
      state.isOwnerRegistered = true;
      state.ownerUsername = json.data.owner_username || state.ownerUsername;
    }
  } catch (_) {}
}

export async function registerOwner(username, password) {
  const res = await fetch('./api/v1/auth.php?action=register_owner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return res.json().catch(() => ({ ok: false }));
}

export async function loginOwner(username, password) {
  try {
    const res = await fetch('./api/v1/auth.php?action=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json();
    if (json && json.ok) return true;
  } catch (_) {}

  // Fallback for offline/local personal owner
  const savedPass = localStorage.getItem('ci_owner_pass_b64');
  if (
    username.toLowerCase() === (state.ownerUsername || '').toLowerCase() &&
    savedPass === btoa(unescape(encodeURIComponent(password)))
  ) {
    return true;
  }
  return false;
}

export async function syncSymbolNow(symbolCode, requestedTimeframe = null, onUpdate = null) {
  const sym = state.symbols.find((s) => s.symbolCode === symbolCode);
  if (!sym) return;
  const tf =
    sym.activeProvider === 'eia_brent_spot'
      ? 'D1'
      : String(requestedTimeframe || sym.timeframe || 'M15').toUpperCase();
  sym.timeframe = tf;
  sym.isSyncing = true;
  sym.hasError = false;

  const tabId = `${sym.symbolCode}_${sym.activeProvider}`;
  const openTab = state.openTabs.find((t) => t.tabId === tabId);
  if (openTab) {
    openTab.isLoading = openTab.candles.length === 0;
    openTab.hasError = false;
  }
  if (onUpdate) onUpdate();

  let fetchedCandles = [];
  try {
    const limit = state.chartPreferences.candleFetchLimit || 160;
    const url = `./api/v1/candles_sync.php?symbol=${encodeURIComponent(
      sym.symbolCode
    )}&provider=${encodeURIComponent(sym.activeProvider)}&timeframe=${encodeURIComponent(
      tf
    )}&limit=${limit}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json && json.ok && json.data && Array.isArray(json.data.candles)) {
      fetchedCandles = json.data.candles;
    }
  } catch (_) {}

  if (fetchedCandles.length > 0) {
    saveCandlesToCache(sym.symbolCode, sym.activeProvider, tf, fetchedCandles);
    sym.candles = fetchedCandles;
    sym.hasError = false;
    state.statusBannerKey = 'status_synced_ok';
  } else {
    sym.candles = getCachedOrAggregatedCandles(sym.symbolCode, sym.activeProvider, tf);
    sym.hasError = sym.candles.length === 0;
  }

  const latest = sym.candles[sym.candles.length - 1];
  sym.lastClose = latest ? latest.close : null;
  sym.lastCandleUtc = latest ? latest.open_time_utc_iso : null;
  sym.isSyncing = false;

  if (openTab) {
    const oldLen = (openTab.candles || []).length;
    const newLen = sym.candles.length;
    if (openTab.timeframe === tf && openTab.scrollOffset > 0 && oldLen > 0 && newLen >= oldLen) {
      openTab.scrollOffset += newLen - oldLen;
    }
    openTab.timeframe = tf;
    openTab.candles = sym.candles;
    openTab.isLoading = false;
    openTab.hasError = sym.candles.length === 0;
  }
  saveSymbolsToStorage();
  if (onUpdate) onUpdate();
}
