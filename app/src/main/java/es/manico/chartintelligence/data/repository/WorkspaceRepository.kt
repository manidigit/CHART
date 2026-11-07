package es.manico.chartintelligence.data.repository

import android.content.Context
import android.content.SharedPreferences
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.algorithms.PasswordHashAlgorithm
import es.manico.chartintelligence.algorithms.TimeframeAggregatorAlgorithm
import es.manico.chartintelligence.config.AppConfig
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartDrawing
import es.manico.chartintelligence.data.model.ProviderId
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.i18n.AppLanguage
import es.manico.chartintelligence.providers.CandleProviderAdapter
import es.manico.chartintelligence.providers.DukascopyAdapter
import es.manico.chartintelligence.providers.EiaBenchmarkAdapter
import es.manico.chartintelligence.providers.TwelveDataAdapter
import es.manico.chartintelligence.providers.YahooFinanceAdapter
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal

/**
 * Repository managing Phase 1 state & local persistence:
 * - Language (defaults to Persian FA RTL) & Theme (defaults to Financial Dark)
 * - Personal Owner Account setup (first-run registration + login verification)
 * - Open symbol catalog with Gold (XAUUSD) and Brent (SPOTBRENT) pre-populated in Watchlist
 * - Idempotent closed-candle storage per (symbolCode, provider, timeframe) with zero fake data
 * - Persistent market-coordinate-anchored chart drawings per chartId
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
    private val drawingsMemoryStore = HashMap<String, List<ChartDrawing>>()

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
                val map = HashMap<String, Triple<Boolean, ProviderId, String>>()
                val arr = JSONArray(savedJson)
                for (i in 0 until arr.length()) {
                    val obj = arr.getJSONObject(i)
                    val code = obj.optString("symbolCode")
                    val inWatchlist = obj.optBoolean("inWatchlist", false)
                    val provider = ProviderId.fromId(obj.optString("activeProvider"))
                    val tf = obj.optString("timeframe", "M15").ifBlank { "M15" }
                    map[code] = Triple(inWatchlist, provider, tf)
                }
                defaults.map { base ->
                    val saved = map[base.symbolCode]
                    if (saved != null) {
                        val validProvider = if (saved.second in base.allowedProviders) saved.second else base.activeProvider
                        val tf = if (validProvider == ProviderId.EIA_BRENT_SPOT) {
                            "D1"
                        } else if (saved.third in AppConfig.SUPPORTED_TIMEFRAMES) {
                            saved.third
                        } else {
                            "M15"
                        }
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

        return merged.map { symbol ->
            val candles = getCachedOrAggregatedCandles(symbol.symbolCode, symbol.activeProvider, symbol.timeframe)
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
            obj.put("timeframe", s.timeframe)
            arr.put(obj)
        }
        prefs.edit().putString(AppConfig.KEY_SYMBOLS_CONFIG_JSON, arr.toString()).apply()
    }

    /**
     * Loads real cached candles for (symbolCode, provider, timeframe).
     * If the target timeframe is H1, H4, or D1 and not yet cached directly, aggregates any cached
     * M15 or H1 real candles using [TimeframeAggregatorAlgorithm] so the chart updates immediately.
     * Never generates synthetic candles.
     */
    fun getCachedOrAggregatedCandles(
        symbolCode: String,
        provider: ProviderId,
        timeframe: String
    ): List<CandleBar> {
        val normTf = if (provider == ProviderId.EIA_BRENT_SPOT) "D1" else timeframe.uppercase()
        val exactKey = "${symbolCode}_${provider.id}_${normTf}"
        val inMem = candleMemoryStore[exactKey]
        if (!inMem.isNullOrEmpty()) return inMem

        val fromDisk = loadCandlesFromPrefs(exactKey, normTf)
        if (fromDisk.isNotEmpty()) {
            candleMemoryStore[exactKey] = fromDisk
            return fromDisk
        }

        // Check if lower-timeframe real candles exist in cache to aggregate accurately
        if (normTf in listOf("H1", "H4", "D1")) {
            val m15Key = "${symbolCode}_${provider.id}_M15"
            val m15Candles = candleMemoryStore[m15Key] ?: loadCandlesFromPrefs(m15Key, "M15")
            if (m15Candles.isNotEmpty()) {
                val aggregated = TimeframeAggregatorAlgorithm.aggregateCandles(m15Candles, normTf)
                if (aggregated.isNotEmpty()) {
                    return aggregated
                }
            }
            if (normTf in listOf("H4", "D1")) {
                val h1Key = "${symbolCode}_${provider.id}_H1"
                val h1Candles = candleMemoryStore[h1Key] ?: loadCandlesFromPrefs(h1Key, "H1")
                if (h1Candles.isNotEmpty()) {
                    val aggregated = TimeframeAggregatorAlgorithm.aggregateCandles(h1Candles, normTf)
                    if (aggregated.isNotEmpty()) {
                        return aggregated
                    }
                }
            }
        }

        return emptyList()
    }

    suspend fun syncSymbolUpToNow(
        symbol: SymbolConfig,
        requestedTimeframe: String = symbol.timeframe
    ): Pair<SymbolConfig, List<CandleBar>> {
        val adapter = adapters[symbol.activeProvider] ?: DukascopyAdapter()
        val effectiveTimeframe = if (symbol.activeProvider == ProviderId.EIA_BRENT_SPOT) {
            "D1"
        } else {
            requestedTimeframe.uppercase()
        }
        val key = "${symbol.symbolCode}_${symbol.activeProvider.id}_${effectiveTimeframe}"
        val existing = getCachedOrAggregatedCandles(symbol.symbolCode, symbol.activeProvider, effectiveTimeframe)

        val syncResult = adapter.fetchClosedCandlesUpToNow(
            symbolCode = symbol.symbolCode,
            timeframe = effectiveTimeframe,
            limit = AppConfig.DEFAULT_CANDLE_FETCH_LIMIT
        )

        val merged = if (syncResult.candles.isNotEmpty()) {
            val combined = CandleValidatorAlgorithm.mergeIdempotent(
                existing = existing,
                incoming = syncResult.candles,
                timeframe = effectiveTimeframe
            )
            candleMemoryStore[key] = combined
            saveCandlesToPrefs(key, combined)
            combined
        } else {
            existing
        }

        val latest = merged.lastOrNull()
        val updatedSymbol = symbol.copy(
            timeframe = effectiveTimeframe,
            lastClose = latest?.close,
            lastCandleUtc = latest?.openTimeUtcIso,
            storedCandleCount = merged.size,
            isSyncing = false,
            syncErrorText = if (merged.isEmpty()) "ERR_NO_REAL_DATA" else null
        )
        return updatedSymbol to merged
    }

    fun loadDrawingsForChart(chartId: String): List<ChartDrawing> {
        val inMem = drawingsMemoryStore[chartId]
        if (inMem != null) return inMem
        val raw = prefs.getString("${AppConfig.KEY_DRAWINGS_CACHE_PREFIX}$chartId", null)
            ?: return emptyList()
        val parsed = runCatching {
            val arr = JSONArray(raw)
            val list = ArrayList<ChartDrawing>(arr.length())
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val id = obj.optString("id")
                when (obj.optString("type")) {
                    "horizontal_line" -> {
                        list.add(
                            ChartDrawing.HorizontalLine(
                                id = id,
                                price = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal(obj.optString("price", "0")))
                            )
                        )
                    }
                    "vertical_line" -> {
                        list.add(
                            ChartDrawing.VerticalLine(
                                id = id,
                                timeUtcMillis = obj.optLong("timeUtcMillis", 0L)
                            )
                        )
                    }
                    "trend_line" -> {
                        list.add(
                            ChartDrawing.TrendLine(
                                id = id,
                                startTimeUtcMillis = obj.optLong("startTimeUtcMillis", 0L),
                                startPrice = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal(obj.optString("startPrice", "0"))),
                                endTimeUtcMillis = obj.optLong("endTimeUtcMillis", 0L),
                                endPrice = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal(obj.optString("endPrice", "0")))
                            )
                        )
                    }
                }
            }
            list
        }.getOrDefault(emptyList())
        drawingsMemoryStore[chartId] = parsed
        return parsed
    }

    fun saveDrawingsForChart(chartId: String, drawings: List<ChartDrawing>) {
        drawingsMemoryStore[chartId] = drawings
        val arr = JSONArray()
        for (d in drawings) {
            val obj = JSONObject()
            obj.put("id", d.id)
            when (d) {
                is ChartDrawing.HorizontalLine -> {
                    obj.put("type", "horizontal_line")
                    obj.put("price", d.price.toPlainString())
                }
                is ChartDrawing.VerticalLine -> {
                    obj.put("type", "vertical_line")
                    obj.put("timeUtcMillis", d.timeUtcMillis)
                }
                is ChartDrawing.TrendLine -> {
                    obj.put("type", "trend_line")
                    obj.put("startTimeUtcMillis", d.startTimeUtcMillis)
                    obj.put("startPrice", d.startPrice.toPlainString())
                    obj.put("endTimeUtcMillis", d.endTimeUtcMillis)
                    obj.put("endPrice", d.endPrice.toPlainString())
                }
            }
            arr.put(obj)
        }
        prefs.edit().putString("${AppConfig.KEY_DRAWINGS_CACHE_PREFIX}$chartId", arr.toString()).apply()
    }

    private fun loadCandlesFromPrefs(key: String, timeframe: String): List<CandleBar> {
        val raw = prefs.getString("${AppConfig.KEY_CANDLES_CACHE_PREFIX}$key", null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            val result = ArrayList<CandleBar>(arr.length())
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                CandleValidatorAlgorithm.sanitizeAndValidate(
                    rawOpenTimeMillis = obj.optLong("t"),
                    timeframe = timeframe,
                    open = BigDecimal(obj.optString("o")),
                    high = BigDecimal(obj.optString("h")),
                    low = BigDecimal(obj.optString("l")),
                    close = BigDecimal(obj.optString("c")),
                    volume = BigDecimal(obj.optString("v", "0"))
                )?.let { result.add(it) }
            }
            result.sortedBy { it.openTimeUtcMillis }
        }.getOrDefault(emptyList())
    }

    private fun saveCandlesToPrefs(key: String, candles: List<CandleBar>) {
        val arr = JSONArray()
        for (c in candles.takeLast(AppConfig.DEFAULT_CANDLE_FETCH_LIMIT)) {
            val obj = JSONObject()
            obj.put("t", c.openTimeUtcMillis)
            obj.put("o", c.open.toPlainString())
            obj.put("h", c.high.toPlainString())
            obj.put("l", c.low.toPlainString())
            obj.put("c", c.close.toPlainString())
            obj.put("v", c.volume.toPlainString())
            arr.put(obj)
        }
        prefs.edit().putString("${AppConfig.KEY_CANDLES_CACHE_PREFIX}$key", arr.toString()).apply()
    }

    private fun defaultSymbolCatalog(): List<SymbolConfig> {
        return listOf(
            SymbolConfig(
                chartId = "chart_xauusd_main",
                symbolCode = "XAUUSD",
                titleResId = R.string.symbol_xauusd_name,
                decimals = 2,
                inWatchlist = true,
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
                inWatchlist = true,
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
