package es.manico.chartintelligence.data.repository

import android.content.Context
import android.content.SharedPreferences
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.algorithms.PasswordHashAlgorithm
import es.manico.chartintelligence.config.AppConfig
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ProviderId
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.i18n.AppLanguage
import es.manico.chartintelligence.providers.CandleProviderAdapter
import es.manico.chartintelligence.providers.DukascopyAdapter
import es.manico.chartintelligence.providers.EiaBenchmarkAdapter
import es.manico.chartintelligence.providers.HistoricalSeedGenerator
import es.manico.chartintelligence.providers.TwelveDataAdapter
import es.manico.chartintelligence.providers.YahooFinanceAdapter
import org.json.JSONArray
import org.json.JSONObject

/**
 * Repository managing Phase 1 state & local persistence:
 * - Language (defaults to Persian FA RTL) & Theme (defaults to Financial Dark)
 * - Personal Owner Account setup (first-run registration + login verification)
 * - Open symbol catalog with Gold (XAUUSD) and Brent (SPOTBRENT) pre-populated in Watchlist
 * - Idempotent closed-candle storage per (symbolCode, provider, timeframe)
 */
class WorkspaceRepository(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(AppConfig.PREFS_FILE_NAME, Context.MODE_PRIVATE)

    private val adapters: Map<ProviderId, CandleProviderAdapter> = mapOf(
        ProviderId.TWELVE_DATA to TwelveDataAdapter(),
        ProviderId.DUKASCOPY to DukascopyAdapter(),
        ProviderId.EIA_BRENT_SPOT to EiaBenchmarkAdapter(),
        ProviderId.YAHOO_FINANCE to YahooFinanceAdapter()
    )

    private val candleMemoryStore = HashMap<String, List<CandleBar>>()

    fun loadLanguage(): AppLanguage {
        val code = prefs.getString(AppConfig.KEY_LANGUAGE, AppConfig.DEFAULT_LANGUAGE_CODE)
        return AppLanguage.fromCode(code)
    }

    fun saveLanguage(language: AppLanguage) {
        prefs.edit().putString(AppConfig.KEY_LANGUAGE, language.code).apply()
    }

    fun loadDarkTheme(): Boolean {
        return prefs.getBoolean(AppConfig.KEY_DARK_THEME, AppConfig.DEFAULT_DARK_THEME)
    }

    fun saveDarkTheme(isDark: Boolean) {
        prefs.edit().putBoolean(AppConfig.KEY_DARK_THEME, isDark).apply()
    }

    fun isOwnerAccountRegistered(): Boolean {
        val username = prefs.getString(AppConfig.KEY_OWNER_USERNAME, null)
        val hash = prefs.getString(AppConfig.KEY_OWNER_PASSWORD_HASH, null)
        return !username.isNullOrBlank() && !hash.isNullOrBlank()
    }

    fun getOwnerUsername(): String {
        return prefs.getString(AppConfig.KEY_OWNER_USERNAME, "") ?: ""
    }

    fun registerOwnerAccount(username: String, password: String) {
        val cleanUser = username.trim()
        val salt = PasswordHashAlgorithm.generateSaltBase64()
        val hash = PasswordHashAlgorithm.hashPassword(password, salt)
        prefs.edit()
            .putString(AppConfig.KEY_OWNER_USERNAME, cleanUser)
            .putString(AppConfig.KEY_OWNER_PASSWORD_SALT, salt)
            .putString(AppConfig.KEY_OWNER_PASSWORD_HASH, hash)
            .apply()
    }

    fun verifyOwnerCredentials(username: String, password: String): Boolean {
        val storedUser = prefs.getString(AppConfig.KEY_OWNER_USERNAME, null) ?: return false
        val salt = prefs.getString(AppConfig.KEY_OWNER_PASSWORD_SALT, null) ?: return false
        val expectedHash = prefs.getString(AppConfig.KEY_OWNER_PASSWORD_HASH, null) ?: return false
        if (!storedUser.equals(username.trim(), ignoreCase = true)) return false
        return PasswordHashAlgorithm.verifyPassword(password, salt, expectedHash)
    }

    fun updateOwnerPassword(newPassword: String) {
        val salt = PasswordHashAlgorithm.generateSaltBase64()
        val hash = PasswordHashAlgorithm.hashPassword(newPassword, salt)
        prefs.edit()
            .putString(AppConfig.KEY_OWNER_PASSWORD_SALT, salt)
            .putString(AppConfig.KEY_OWNER_PASSWORD_HASH, hash)
            .apply()
    }

    fun loadSymbolCatalog(): List<SymbolConfig> {
        val defaults = defaultSymbolCatalog()
        val savedJson = prefs.getString(AppConfig.KEY_SYMBOLS_CONFIG_JSON, null)
        val merged = if (savedJson.isNullOrBlank()) {
            defaults
        } else {
            runCatching {
                val map = HashMap<String, Pair<Boolean, ProviderId>>()
                val arr = JSONArray(savedJson)
                for (i in 0 until arr.length()) {
                    val obj = arr.getJSONObject(i)
                    val code = obj.optString("symbolCode")
                    val inWatchlist = obj.optBoolean("inWatchlist", false)
                    val provider = ProviderId.fromId(obj.optString("activeProvider"))
                    map[code] = inWatchlist to provider
                }
                defaults.map { base ->
                    val saved = map[base.symbolCode]
                    if (saved != null) {
                        val validProvider = if (saved.second in base.allowedProviders) saved.second else base.activeProvider
                        val tf = if (validProvider == ProviderId.EIA_BRENT_SPOT) "D1" else "M15"
                        base.copy(
                            inWatchlist = saved.first,
                            activeProvider = validProvider,
                            timeframe = tf
                        )
                    } else {
                        base
                    }
                }
            }.getOrDefault(defaults)
        }

        // Hydrate initial closed candles for each symbol so Watchlist & Chart View have data ready
        return merged.map { symbol ->
            val candles = getOrSeedCandles(symbol.symbolCode, symbol.activeProvider, symbol.timeframe)
            val latest = candles.lastOrNull()
            symbol.copy(
                lastClose = latest?.close,
                lastCandleUtc = latest?.openTimeUtcIso,
                storedCandleCount = candles.size
            )
        }
    }

    fun saveSymbolCatalog(symbols: List<SymbolConfig>) {
        val arr = JSONArray()
        for (s in symbols) {
            val obj = JSONObject()
            obj.put("symbolCode", s.symbolCode)
            obj.put("inWatchlist", s.inWatchlist)
            obj.put("activeProvider", s.activeProvider.id)
            arr.put(obj)
        }
        prefs.edit().putString(AppConfig.KEY_SYMBOLS_CONFIG_JSON, arr.toString()).apply()
    }

    fun getOrSeedCandles(
        symbolCode: String,
        provider: ProviderId,
        timeframe: String
    ): List<CandleBar> {
        val key = "${symbolCode}_${provider.id}_${timeframe}"
        val existing = candleMemoryStore[key]
        if (!existing.isNullOrEmpty()) return existing
        val seeded = HistoricalSeedGenerator.buildClosedCandlesUpToNow(
            symbolCode = symbolCode,
            providerId = provider.id,
            timeframe = timeframe,
            count = AppConfig.DEFAULT_CANDLE_FETCH_LIMIT
        )
        candleMemoryStore[key] = seeded
        return seeded
    }

    suspend fun syncSymbolUpToNow(symbol: SymbolConfig): Pair<SymbolConfig, List<CandleBar>> {
        val adapter = adapters[symbol.activeProvider] ?: DukascopyAdapter()
        val effectiveTimeframe = if (symbol.activeProvider == ProviderId.EIA_BRENT_SPOT) "D1" else symbol.timeframe
        val key = "${symbol.symbolCode}_${symbol.activeProvider.id}_${effectiveTimeframe}"
        val existing = candleMemoryStore[key].orEmpty()

        val syncResult = adapter.fetchClosedCandlesUpToNow(
            symbolCode = symbol.symbolCode,
            timeframe = effectiveTimeframe,
            limit = AppConfig.DEFAULT_CANDLE_FETCH_LIMIT
        )

        val merged = CandleValidatorAlgorithm.mergeIdempotent(
            existing = existing,
            incoming = syncResult.candles,
            timeframe = effectiveTimeframe
        )
        candleMemoryStore[key] = merged
        val latest = merged.lastOrNull()

        val updatedSymbol = symbol.copy(
            timeframe = effectiveTimeframe,
            lastClose = latest?.close,
            lastCandleUtc = latest?.openTimeUtcIso,
            storedCandleCount = merged.size,
            isSyncing = false,
            syncErrorText = null
        )
        return updatedSymbol to merged
    }

    private fun defaultSymbolCatalog(): List<SymbolConfig> {
        return listOf(
            SymbolConfig(
                chartId = "chart_xauusd_main",
                symbolCode = "XAUUSD",
                titleResId = R.string.symbol_xauusd_name,
                decimals = 2,
                inWatchlist = true, // Pre-populated in Watchlist on first run per user confirmation
                activeProvider = ProviderId.TWELVE_DATA,
                allowedProviders = listOf(
                    ProviderId.TWELVE_DATA,
                    ProviderId.DUKASCOPY,
                    ProviderId.YAHOO_FINANCE
                ),
                timeframe = "M15"
            ),
            SymbolConfig(
                chartId = "chart_spotbrent_main",
                symbolCode = "SPOTBRENT",
                titleResId = R.string.symbol_spotbrent_name,
                decimals = 2,
                inWatchlist = true, // Pre-populated in Watchlist on first run per user confirmation
                activeProvider = ProviderId.DUKASCOPY,
                allowedProviders = listOf(
                    ProviderId.DUKASCOPY,
                    ProviderId.TWELVE_DATA,
                    ProviderId.EIA_BRENT_SPOT,
                    ProviderId.YAHOO_FINANCE
                ),
                timeframe = "M15"
            ),
            SymbolConfig(
                chartId = "chart_brent_futures",
                symbolCode = "BRENT_FUTURES",
                titleResId = R.string.symbol_brent_futures_name,
                decimals = 2,
                inWatchlist = false,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = listOf(
                    ProviderId.YAHOO_FINANCE,
                    ProviderId.DUKASCOPY,
                    ProviderId.EIA_BRENT_SPOT
                ),
                timeframe = "M15"
            ),
            SymbolConfig(
                chartId = "chart_xagusd_spot",
                symbolCode = "XAGUSD",
                titleResId = R.string.symbol_xagusd_name,
                decimals = 3,
                inWatchlist = false,
                activeProvider = ProviderId.TWELVE_DATA,
                allowedProviders = listOf(
                    ProviderId.TWELVE_DATA,
                    ProviderId.DUKASCOPY,
                    ProviderId.YAHOO_FINANCE
                ),
                timeframe = "M15"
            ),
            SymbolConfig(
                chartId = "chart_eurusd_spot",
                symbolCode = "EURUSD",
                titleResId = R.string.symbol_eurusd_name,
                decimals = 4,
                inWatchlist = false,
                activeProvider = ProviderId.TWELVE_DATA,
                allowedProviders = listOf(
                    ProviderId.TWELVE_DATA,
                    ProviderId.DUKASCOPY,
                    ProviderId.YAHOO_FINANCE
                ),
                timeframe = "M15"
            )
        )
    }
}
