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
import es.manico.chartintelligence.data.model.ChartPreferences
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.ChartType
import es.manico.chartintelligence.data.model.ProviderId
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.i18n.AppLanguage
import es.manico.chartintelligence.providers.BiquoteAdapter
import es.manico.chartintelligence.providers.CandleProviderAdapter
import es.manico.chartintelligence.providers.DukascopyAdapter
import es.manico.chartintelligence.providers.EiaBenchmarkAdapter
import es.manico.chartintelligence.providers.StooqAdapter
import es.manico.chartintelligence.providers.TvDatafeedAdapter
import es.manico.chartintelligence.providers.TwelveDataAdapter
import es.manico.chartintelligence.providers.YahooFinanceAdapter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.util.concurrent.TimeUnit

data class ServerOwnerStatus(
    val isRegistered: Boolean,
    val username: String,
    val email: String
)

data class SystemStatusDto(
    val isHealthy: Boolean = false,
    val version: String = "1.35.0",
    val serverTimeUtc: String = "",
    val dbConnected: Boolean = false,
    val dbVersion: String = "MariaDB",
    val totalCandles: Long = 0L,
    val registeredOwner: Boolean = false
)

/**
 * Repository managing Phase 1 state & local/remote persistence:
 * - Language (defaults to Persian FA RTL) & Theme (defaults to Financial Dark)
 * - Unified Personal Owner Account setup (synced across Android & Web via auth.php + local cache)
 * - Open symbol catalog with Gold (XAUUSD) and Brent (SPOTBRENT) pre-populated in Watchlist
 * - Idempotent closed-candle storage per (symbolCode, provider, timeframe) with zero fake data
 * - Persistent market-coordinate-anchored chart drawings per chartId
 */
class WorkspaceRepository(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(AppConfig.PREFS_FILE_NAME, Context.MODE_PRIVATE)

    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    private val adapters: Map<ProviderId, CandleProviderAdapter> = mapOf(
        ProviderId.TWELVE_DATA to TwelveDataAdapter(httpClient) { loadChartPreferences().twelveDataApiKey },
        ProviderId.TVDATAFEED to TvDatafeedAdapter(httpClient),
        ProviderId.BIQUOTE to BiquoteAdapter(httpClient),
        ProviderId.DUKASCOPY to DukascopyAdapter(httpClient),
        ProviderId.EIA_BRENT_SPOT to EiaBenchmarkAdapter(),
        ProviderId.YAHOO_FINANCE to YahooFinanceAdapter(httpClient),
        ProviderId.STOOQ to StooqAdapter(httpClient) { loadChartPreferences().stooqApiKey }
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
        return !username.isNullOrBlank()
    }

    fun getOwnerUsername(): String {
        return prefs.getString(AppConfig.KEY_OWNER_USERNAME, "") ?: ""
    }

    fun getOwnerEmail(): String {
        return prefs.getString(AppConfig.KEY_OWNER_EMAIL, "") ?: ""
    }

    fun loadRememberCredentials(): Boolean {
        return prefs.getBoolean(AppConfig.KEY_REMEMBER_CREDENTIALS, true)
    }

    fun saveRememberCredentials(remember: Boolean) {
        val editor = prefs.edit().putBoolean(AppConfig.KEY_REMEMBER_CREDENTIALS, remember)
        if (!remember) {
            editor.remove(AppConfig.KEY_SAVED_PASSWORD)
            editor.putBoolean(AppConfig.KEY_SESSION_AUTHENTICATED, false)
        }
        editor.apply()
    }

    fun getSavedPassword(): String {
        if (!loadRememberCredentials()) return ""
        return prefs.getString(AppConfig.KEY_SAVED_PASSWORD, "") ?: ""
    }

    fun saveOwnerPasswordIfRemembered(password: String, remember: Boolean) {
        val editor = prefs.edit().putBoolean(AppConfig.KEY_REMEMBER_CREDENTIALS, remember)
        if (remember) {
            editor.putString(AppConfig.KEY_SAVED_PASSWORD, password)
            editor.putBoolean(AppConfig.KEY_SESSION_AUTHENTICATED, true)
        } else {
            editor.remove(AppConfig.KEY_SAVED_PASSWORD)
            editor.putBoolean(AppConfig.KEY_SESSION_AUTHENTICATED, false)
        }
        editor.apply()
    }

    fun isSessionAuthenticated(): Boolean {
        return loadRememberCredentials() &&
            isOwnerAccountRegistered() &&
            prefs.getBoolean(AppConfig.KEY_SESSION_AUTHENTICATED, false)
    }

    fun setSessionAuthenticated(authenticated: Boolean) {
        prefs.edit().putBoolean(AppConfig.KEY_SESSION_AUTHENTICATED, authenticated).apply()
    }

    suspend fun syncOwnerStatusFromServer(): ServerOwnerStatus = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder()
                .url("${AppConfig.API_BASE_URL}auth.php?action=status")
                .get()
                .build()
            httpClient.newCall(req).execute().use { resp ->
                if (resp.isSuccessful) {
                    val root = JSONObject(resp.body?.string().orEmpty())
                    if (root.optBoolean("ok", false)) {
                        val data = root.optJSONObject("data")
                        val isReg = data?.optBoolean("is_owner_registered", false) == true
                        val user = data?.optString("owner_username", "").orEmpty().trim()
                        val email = data?.optString("owner_email", "").orEmpty().trim()
                        if (isReg && user.isNotEmpty()) {
                            val editor = prefs.edit().putString(AppConfig.KEY_OWNER_USERNAME, user)
                            if (email.isNotEmpty()) {
                                editor.putString(AppConfig.KEY_OWNER_EMAIL, email)
                            }
                            editor.apply()
                            return@withContext ServerOwnerStatus(true, user, email.ifEmpty { getOwnerEmail() })
                        }
                    }
                }
            }
        }
        ServerOwnerStatus(
            isRegistered = isOwnerAccountRegistered(),
            username = getOwnerUsername(),
            email = getOwnerEmail()
        )
    }

    fun registerOwnerAccount(username: String, password: String, email: String = "") {
        val cleanUser = username.trim()
        val cleanEmail = email.trim().lowercase()
        val salt = PasswordHashAlgorithm.generateSaltBase64()
        val hash = PasswordHashAlgorithm.hashPassword(password, salt)
        prefs.edit()
            .putString(AppConfig.KEY_OWNER_USERNAME, cleanUser)
            .putString(AppConfig.KEY_OWNER_EMAIL, cleanEmail)
            .putString(AppConfig.KEY_OWNER_PASSWORD_SALT, salt)
            .putString(AppConfig.KEY_OWNER_PASSWORD_HASH, hash)
            .apply()
    }

    suspend fun registerOwnerOnServer(username: String, email: String, password: String): Boolean =
        withContext(Dispatchers.IO) {
            registerOwnerAccount(username, password, email)
            runCatching {
                val payload = JSONObject()
                    .put("username", username.trim())
                    .put("email", email.trim().lowercase())
                    .put("password", password)
                val req = Request.Builder()
                    .url("${AppConfig.API_BASE_URL}auth.php?action=register_owner")
                    .post(payload.toString().toRequestBody(jsonMediaType))
                    .build()
                httpClient.newCall(req).execute().use { resp ->
                    resp.isSuccessful && JSONObject(resp.body?.string().orEmpty()).optBoolean("ok", false)
                }
            }.getOrDefault(false)
        }

    fun verifyOwnerCredentials(username: String, password: String): Boolean {
        val storedUser = prefs.getString(AppConfig.KEY_OWNER_USERNAME, null) ?: return false
        val storedEmail = prefs.getString(AppConfig.KEY_OWNER_EMAIL, null).orEmpty()
        val salt = prefs.getString(AppConfig.KEY_OWNER_PASSWORD_SALT, null) ?: return false
        val expectedHash = prefs.getString(AppConfig.KEY_OWNER_PASSWORD_HASH, null) ?: return false
        val input = username.trim()
        val matchesIdentity = storedUser.equals(input, ignoreCase = true) ||
            (storedEmail.isNotEmpty() && storedEmail.equals(input, ignoreCase = true))
        if (!matchesIdentity) return false
        return PasswordHashAlgorithm.verifyPassword(password, salt, expectedHash)
    }

    suspend fun verifyOwnerCredentialsWithServer(username: String, password: String): Boolean =
        withContext(Dispatchers.IO) {
            val remoteVerified = runCatching {
                val payload = JSONObject()
                    .put("username", username.trim())
                    .put("password", password)
                val req = Request.Builder()
                    .url("${AppConfig.API_BASE_URL}auth.php?action=login")
                    .post(payload.toString().toRequestBody(jsonMediaType))
                    .build()
                httpClient.newCall(req).execute().use { resp ->
                    val bodyStr = resp.body?.string().orEmpty()
                    if (resp.isSuccessful) {
                        val root = JSONObject(bodyStr)
                        if (root.optBoolean("ok", false)) {
                            val data = root.optJSONObject("data")
                            val srvUser = data?.optString("owner_username", "").orEmpty().ifBlank { username.trim() }
                            val srvEmail = data?.optString("owner_email", "").orEmpty()
                            registerOwnerAccount(srvUser, password, srvEmail.ifEmpty { getOwnerEmail() })
                            true
                        } else {
                            false
                        }
                    } else if (resp.code == 401) {
                        false
                    } else {
                        null
                    }
                }
            }.getOrNull()

            if (remoteVerified == true) return@withContext true
            verifyOwnerCredentials(username, password)
        }

    fun updateOwnerEmailLocal(email: String) {
        prefs.edit().putString(AppConfig.KEY_OWNER_EMAIL, email.trim().lowercase()).apply()
    }

    suspend fun updateOwnerEmailOnServer(email: String): Boolean = withContext(Dispatchers.IO) {
        val cleanEmail = email.trim().lowercase()
        updateOwnerEmailLocal(cleanEmail)
        runCatching {
            val payload = JSONObject().put("email", cleanEmail)
            val req = Request.Builder()
                .url("${AppConfig.API_BASE_URL}auth.php?action=update_profile")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            httpClient.newCall(req).execute().use { resp ->
                resp.isSuccessful && JSONObject(resp.body?.string().orEmpty()).optBoolean("ok", false)
            }
        }.getOrDefault(false)
    }

    fun updateOwnerPassword(newPassword: String) {
        val salt = PasswordHashAlgorithm.generateSaltBase64()
        val hash = PasswordHashAlgorithm.hashPassword(newPassword, salt)
        prefs.edit()
            .putString(AppConfig.KEY_OWNER_PASSWORD_SALT, salt)
            .putString(AppConfig.KEY_OWNER_PASSWORD_HASH, hash)
            .apply()
    }

    suspend fun updateOwnerPasswordOnServer(newPassword: String): Boolean = withContext(Dispatchers.IO) {
        updateOwnerPassword(newPassword)
        runCatching {
            val payload = JSONObject().put("new_password", newPassword)
            val req = Request.Builder()
                .url("${AppConfig.API_BASE_URL}auth.php?action=change_password")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            httpClient.newCall(req).execute().use { resp ->
                resp.isSuccessful && JSONObject(resp.body?.string().orEmpty()).optBoolean("ok", false)
            }
        }.getOrDefault(false)
    }

    suspend fun requestPasswordResetOnServer(email: String): Boolean = withContext(Dispatchers.IO) {
        val cleanEmail = email.trim().lowercase()
        val remoteOk = runCatching {
            val payload = JSONObject().put("email", cleanEmail)
            val req = Request.Builder()
                .url("${AppConfig.API_BASE_URL}auth.php?action=request_password_reset")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            httpClient.newCall(req).execute().use { resp ->
                resp.isSuccessful && JSONObject(resp.body?.string().orEmpty()).optBoolean("ok", false)
            }
        }.getOrDefault(false)
        remoteOk
    }

    suspend fun confirmPasswordResetOnServer(email: String, code: String, newPassword: String): Boolean =
        withContext(Dispatchers.IO) {
            val cleanEmail = email.trim().lowercase()
            val remoteOk = runCatching {
                val payload = JSONObject()
                    .put("email", cleanEmail)
                    .put("code", code.trim())
                    .put("new_password", newPassword)
                val req = Request.Builder()
                    .url("${AppConfig.API_BASE_URL}auth.php?action=confirm_password_reset")
                    .post(payload.toString().toRequestBody(jsonMediaType))
                    .build()
                httpClient.newCall(req).execute().use { resp ->
                    resp.isSuccessful && JSONObject(resp.body?.string().orEmpty()).optBoolean("ok", false)
                }
            }.getOrDefault(false)

            if (remoteOk) {
                updateOwnerPassword(newPassword)
                updateOwnerEmailLocal(cleanEmail)
            }
            remoteOk
        }

    fun loadLastOpenedSymbolCode(): String? {
        return prefs.getString("last_opened_symbol_code", null)?.takeIf { it.isNotBlank() }
    }

    fun saveLastOpenedSymbolCode(symbolCode: String) {
        prefs.edit().putString("last_opened_symbol_code", symbolCode.trim().uppercase()).apply()
    }

    fun loadChartPreferences(): ChartPreferences {
        val raw = prefs.getString(AppConfig.KEY_CHART_PREFERENCES_JSON, null) ?: return ChartPreferences()
        return runCatching {
            val obj = JSONObject(raw)
            val rawBull = obj.optString("bullCandleColorHex", "FF26A69A")
            val rawBear = obj.optString("bearCandleColorHex", "FFEF5350")
            val rawGrid = obj.optString("chartGridColorHex", "FF2A2E39")
            ChartPreferences(
                bullCandleColorHex = if (rawBull == "FF10B981") "FF26A69A" else rawBull,
                bearCandleColorHex = if (rawBear == "FFF43F5E") "FFEF5350" else rawBear,
                trendLineColorHex = obj.optString("trendLineColorHex", "FF2962FF"),
                horizontalLineColorHex = obj.optString("horizontalLineColorHex", "FF38BDF8"),
                verticalLineColorHex = obj.optString("verticalLineColorHex", "FFF59E0B"),
                chartGridColorHex = if (rawGrid == "FF1E293B") "FF2A2E39" else rawGrid,
                defaultDrawingColorHex = normalizeAndroidHex(
                    obj.optString("defaultDrawingColorHex", "FF2962FF"),
                    "FF2962FF"
                ),
                defaultDrawingWidthDp = obj.optDouble("defaultDrawingWidthDp", 2.0).toFloat().coerceIn(1.0f, 8.0f),
                candleFetchLimit = obj.optInt("candleFetchLimit", AppConfig.DEFAULT_CANDLE_FETCH_LIMIT).coerceIn(40, 5000),
                minVisibleCandles = obj.optInt("minVisibleCandles", 12),
                maxVisibleCandles = obj.optInt("maxVisibleCandles", AppConfig.MAX_VISIBLE_CANDLES).coerceAtLeast(5000),
                zoomStepCandles = obj.optInt("zoomStepCandles", 8),
                drawingHitTolerancePx = obj.optDouble("drawingHitTolerancePx", 28.0).toFloat(),
                bollingerPeriod = obj.optInt("bollingerPeriod", 20).coerceIn(5, 200),
                bollingerStdDev = obj.optDouble("bollingerStdDev", 2.0).toFloat().coerceIn(0.5f, 5.0f),
                hideWatchlistLogos = obj.optBoolean("hideWatchlistLogos", false),
                showSymbolScreen = obj.optBoolean("showSymbolScreen", true),
                chartVibrations = obj.optBoolean("chartVibrations", true),
                logarithmicScaleDefault = obj.optBoolean("logarithmicScaleDefault", false),
                rememberLastChartOnDevice = obj.optBoolean("rememberLastChartOnDevice", true),
                hideTabBarInLandscape = obj.optBoolean("hideTabBarInLandscape", true),
                pickerVibrations = obj.optBoolean("pickerVibrations", true),
                showPickerScrollMagnifiers = obj.optBoolean("showPickerScrollMagnifiers", true),
                showCountdownToBarClose = obj.optBoolean("showCountdownToBarClose", true),
                showPrevCloseLine = obj.optBoolean("showPrevCloseLine", true),
                showHighLowLabels = obj.optBoolean("showHighLowLabels", true),
                twelveDataApiKey = obj.optString("twelveDataApiKey", ""),
                stooqApiKey = obj.optString("stooqApiKey", ""),
                alphaVantageApiKey = obj.optString("alphaVantageApiKey", ""),
                finnhubApiKey = obj.optString("finnhubApiKey", ""),
                timezoneMode = obj.optString("timezoneMode", "UTC").uppercase().let { if (it == "LOCAL") "LOCAL" else "UTC" }
            )
        }.getOrDefault(ChartPreferences())
    }

    fun saveChartPreferences(prefsObj: ChartPreferences) {
        val obj = JSONObject()
        obj.put("bullCandleColorHex", prefsObj.bullCandleColorHex)
        obj.put("bearCandleColorHex", prefsObj.bearCandleColorHex)
        obj.put("trendLineColorHex", prefsObj.trendLineColorHex)
        obj.put("horizontalLineColorHex", prefsObj.horizontalLineColorHex)
        obj.put("verticalLineColorHex", prefsObj.verticalLineColorHex)
        obj.put("chartGridColorHex", prefsObj.chartGridColorHex)
        obj.put("defaultDrawingColorHex", prefsObj.defaultDrawingColorHex)
        obj.put("defaultDrawingWidthDp", prefsObj.defaultDrawingWidthDp.toDouble())
        obj.put("candleFetchLimit", prefsObj.candleFetchLimit.coerceIn(40, 5000))
        obj.put("minVisibleCandles", prefsObj.minVisibleCandles)
        obj.put("maxVisibleCandles", prefsObj.maxVisibleCandles.coerceAtLeast(5000))
        obj.put("zoomStepCandles", prefsObj.zoomStepCandles)
        obj.put("drawingHitTolerancePx", prefsObj.drawingHitTolerancePx.toDouble())
        obj.put("bollingerPeriod", prefsObj.bollingerPeriod.coerceIn(5, 200))
        obj.put("bollingerStdDev", prefsObj.bollingerStdDev.coerceIn(0.5f, 5.0f).toDouble())
        obj.put("hideWatchlistLogos", prefsObj.hideWatchlistLogos)
        obj.put("showSymbolScreen", prefsObj.showSymbolScreen)
        obj.put("chartVibrations", prefsObj.chartVibrations)
        obj.put("logarithmicScaleDefault", prefsObj.logarithmicScaleDefault)
        obj.put("rememberLastChartOnDevice", prefsObj.rememberLastChartOnDevice)
        obj.put("hideTabBarInLandscape", prefsObj.hideTabBarInLandscape)
        obj.put("pickerVibrations", prefsObj.pickerVibrations)
        obj.put("showPickerScrollMagnifiers", prefsObj.showPickerScrollMagnifiers)
        obj.put("showCountdownToBarClose", prefsObj.showCountdownToBarClose)
        obj.put("showPrevCloseLine", prefsObj.showPrevCloseLine)
        obj.put("showHighLowLabels", prefsObj.showHighLowLabels)
        obj.put("twelveDataApiKey", prefsObj.twelveDataApiKey)
        obj.put("stooqApiKey", prefsObj.stooqApiKey)
        obj.put("alphaVantageApiKey", prefsObj.alphaVantageApiKey)
        obj.put("finnhubApiKey", prefsObj.finnhubApiKey)
        obj.put("timezoneMode", prefsObj.timezoneMode)
        prefs.edit().putString(AppConfig.KEY_CHART_PREFERENCES_JSON, obj.toString()).apply()
    }

    fun loadSymbolCatalog(): List<SymbolConfig> {
        val defaults = defaultSymbolCatalog()
        val savedJson = prefs.getString(AppConfig.KEY_SYMBOLS_CONFIG_JSON, null)
        val migratedSpotBrentTv = prefs.getBoolean(AppConfig.KEY_SPOTBRENT_TV_MIGRATED, false)
        val loadedList = if (savedJson.isNullOrBlank()) {
            prefs.edit().putBoolean(AppConfig.KEY_SPOTBRENT_TV_MIGRATED, true).apply()
            defaults
        } else {
            runCatching {
                val arr = JSONArray(savedJson)
                val list = ArrayList<SymbolConfig>()
                val defaultMap = defaults.associateBy { it.symbolCode }

                for (i in 0 until arr.length()) {
                    val obj = arr.getJSONObject(i)
                    val code = obj.optString("symbolCode").trim().uppercase()
                    val inWatchlist = obj.optBoolean("inWatchlist", false)
                    val provider = ProviderId.fromId(obj.optString("activeProvider"))
                    val tf = obj.optString("timeframe", "M15").ifBlank { "M15" }
                    val customTitle = obj.optString("customTitle", "").takeIf { it.isNotBlank() }
                    val decimals = obj.optInt("decimals", 2)
                    val base = defaultMap[code]

                    if (base != null) {
                        val validProvider = if (code == "SPOTBRENT" && !migratedSpotBrentTv) {
                            ProviderId.TVDATAFEED
                        } else if (provider in base.allowedProviders) {
                            provider
                        } else {
                            base.activeProvider
                        }
                        val validTf = if (validProvider == ProviderId.EIA_BRENT_SPOT) "D1" else if (validProvider == ProviderId.STOOQ) {
                            if (tf == "W1") "W1" else "D1"
                        } else if (tf in AppConfig.SUPPORTED_TIMEFRAMES) tf else "M15"
                        list.add(
                            base.copy(
                                inWatchlist = inWatchlist,
                                activeProvider = validProvider,
                                timeframe = validTf,
                                customTitle = customTitle
                            )
                        )
                    } else {
                        // User-defined custom symbol
                        list.add(
                            SymbolConfig(
                                chartId = "chart_${code.lowercase()}_custom",
                                symbolCode = code,
                                titleResId = null,
                                customTitle = customTitle ?: code,
                                decimals = decimals,
                                inWatchlist = inWatchlist,
                                activeProvider = provider,
                                allowedProviders = listOf(
                                    ProviderId.YAHOO_FINANCE,
                                    ProviderId.TWELVE_DATA,
                                    ProviderId.TVDATAFEED,
                                    ProviderId.BIQUOTE,
                                    ProviderId.DUKASCOPY,
                                    ProviderId.STOOQ
                                ),
                                timeframe = if (tf in AppConfig.SUPPORTED_TIMEFRAMES) tf else "M15"
                            )
                        )
                    }
                }
                val existingCodes = list.map { it.symbolCode }.toSet()
                var addedMissingDefaults = false
                for (defSym in defaults) {
                    if (defSym.symbolCode !in existingCodes) {
                        list.add(defSym)
                        addedMissingDefaults = true
                    }
                }
                if (!migratedSpotBrentTv || addedMissingDefaults) {
                    prefs.edit().putBoolean(AppConfig.KEY_SPOTBRENT_TV_MIGRATED, true).apply()
                    saveSymbolCatalog(list)
                }
                if (list.isEmpty()) defaults else list
            }.getOrDefault(defaults)
        }

        return loadedList.map { symbol ->
            val candles = getCachedOrAggregatedCandles(symbol.symbolCode, symbol.activeProvider, symbol.timeframe)
            val latest = candles.lastOrNull()
            val prev = if (candles.size >= 2) candles[candles.size - 2].close else latest?.open
            symbol.copy(
                lastClose = latest?.close,
                prevClose = prev,
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
            obj.put("decimals", s.decimals)
            if (!s.customTitle.isNullOrBlank()) {
                obj.put("customTitle", s.customTitle)
            }
            arr.put(obj)
        }
        prefs.edit().putString(AppConfig.KEY_SYMBOLS_CONFIG_JSON, arr.toString()).apply()
    }

    /**
     * Loads real cached candles for (symbolCode, provider, timeframe).
     * For H1 and H4, also merges any newer closed candles aggregated from cached M15 or H1
     * so switching between M15, H1, and H4 always includes every closed candle up to now.
     * Never generates synthetic candles.
     */
    fun getCachedOrAggregatedCandles(
        symbolCode: String,
        provider: ProviderId,
        timeframe: String
    ): List<CandleBar> {
        val normTf = when (provider) {
            ProviderId.EIA_BRENT_SPOT -> "D1"
            ProviderId.STOOQ -> if (timeframe.uppercase() == "W1") "W1" else "D1"
            else -> timeframe.uppercase()
        }
        val exactKey = "${symbolCode}_${provider.id}_${normTf}"
        var current = candleMemoryStore[exactKey]
        if (current.isNullOrEmpty()) {
            current = loadCandlesFromPrefs(exactKey, normTf)
            if (current.isNotEmpty()) {
                candleMemoryStore[exactKey] = current
            }
        }

        // For M30, H1 and H4, merge any newer closed bars aggregated from cached M15 / H1
        // for immediate zero-flicker display, without overwriting candleMemoryStore[exactKey]
        // if exactKey does not yet hold full native timeframe history.
        if (normTf in listOf("M30", "H1", "H4")) {
            val minNativeBars = if (normTf == "H4") 180 else 240
            val hasFullNativeCache = (current?.size ?: 0) >= minNativeBars
            val m15Key = "${symbolCode}_${provider.id}_M15"
            val m15Candles = candleMemoryStore[m15Key] ?: loadCandlesFromPrefs(m15Key, "M15")
            if (m15Candles.isNotEmpty()) {
                val aggregatedFromM15 = TimeframeAggregatorAlgorithm.aggregateCandles(m15Candles, normTf)
                if (aggregatedFromM15.isNotEmpty()) {
                    current = if (current.isNullOrEmpty()) {
                        aggregatedFromM15
                    } else {
                        CandleValidatorAlgorithm.mergeIdempotent(current, aggregatedFromM15, normTf)
                    }
                    if (hasFullNativeCache) {
                        candleMemoryStore[exactKey] = current
                    }
                }
            }
            if (normTf == "H4") {
                val h1Key = "${symbolCode}_${provider.id}_H1"
                val h1Candles = candleMemoryStore[h1Key] ?: loadCandlesFromPrefs(h1Key, "H1")
                if (h1Candles.isNotEmpty()) {
                    val aggregatedFromH1 = TimeframeAggregatorAlgorithm.aggregateCandles(h1Candles, "H4")
                    if (aggregatedFromH1.isNotEmpty()) {
                        current = if (current.isNullOrEmpty()) {
                            aggregatedFromH1
                        } else {
                            CandleValidatorAlgorithm.mergeIdempotent(current, aggregatedFromH1, "H4")
                        }
                        if (hasFullNativeCache) {
                            candleMemoryStore[exactKey] = current
                        }
                    }
                }
            }
        } else if (normTf == "D1" && current.isNullOrEmpty()) {
            val h4Key = "${symbolCode}_${provider.id}_H4"
            val h4Candles = candleMemoryStore[h4Key] ?: loadCandlesFromPrefs(h4Key, "H4")
            if (h4Candles.isNotEmpty()) {
                val aggregated = TimeframeAggregatorAlgorithm.aggregateCandles(h4Candles, "D1")
                if (aggregated.isNotEmpty()) {
                    current = aggregated
                }
            } else {
                val h1Key = "${symbolCode}_${provider.id}_H1"
                val h1Candles = candleMemoryStore[h1Key] ?: loadCandlesFromPrefs(h1Key, "H1")
                if (h1Candles.isNotEmpty()) {
                    val aggregated = TimeframeAggregatorAlgorithm.aggregateCandles(h1Candles, "D1")
                    if (aggregated.isNotEmpty()) {
                        current = aggregated
                    }
                } else {
                    val m15Key = "${symbolCode}_${provider.id}_M15"
                    val m15Candles = candleMemoryStore[m15Key] ?: loadCandlesFromPrefs(m15Key, "M15")
                    if (m15Candles.isNotEmpty()) {
                        val aggregated = TimeframeAggregatorAlgorithm.aggregateCandles(m15Candles, "D1")
                        if (aggregated.isNotEmpty()) {
                            current = aggregated
                        }
                    }
                }
            }
        } else if (normTf == "W1" && current.isNullOrEmpty()) {
            val d1Key = "${symbolCode}_${provider.id}_D1"
            val d1Candles = candleMemoryStore[d1Key] ?: loadCandlesFromPrefs(d1Key, "D1")
            if (d1Candles.isNotEmpty()) {
                val aggregated = TimeframeAggregatorAlgorithm.aggregateCandles(d1Candles, "W1")
                if (aggregated.isNotEmpty()) {
                    current = aggregated
                }
            } else {
                val h4Key = "${symbolCode}_${provider.id}_H4"
                val h4Candles = candleMemoryStore[h4Key] ?: loadCandlesFromPrefs(h4Key, "H4")
                if (h4Candles.isNotEmpty()) {
                    val aggregated = TimeframeAggregatorAlgorithm.aggregateCandles(h4Candles, "W1")
                    if (aggregated.isNotEmpty()) {
                        current = aggregated
                    }
                }
            }
        }

        return current ?: emptyList()
    }

    suspend fun syncSymbolUpToNow(
        symbol: SymbolConfig,
        requestedTimeframe: String = symbol.timeframe,
        forceBackfill: Boolean = false
    ): Pair<SymbolConfig, List<CandleBar>> = coroutineScope {
        val adapter = adapters[symbol.activeProvider] ?: DukascopyAdapter(httpClient)
        val effectiveTimeframe = when (symbol.activeProvider) {
            ProviderId.EIA_BRENT_SPOT -> "D1"
            ProviderId.STOOQ -> if (requestedTimeframe.uppercase() == "W1") "W1" else "D1"
            else -> requestedTimeframe.uppercase()
        }
        val configuredFetchLimit = loadChartPreferences().candleFetchLimit.coerceIn(40, 5000)

        // Sync the requested timeframe directly (and M15 if not already cached) to avoid WebSocket congestion
        // while guaranteeing deep historical backfill on whichever timeframe the user is viewing.
        val timeframesToSync = when (symbol.activeProvider) {
            ProviderId.EIA_BRENT_SPOT -> listOf("D1")
            ProviderId.STOOQ -> listOf("D1", effectiveTimeframe).distinct()
            else -> buildSet {
                add(effectiveTimeframe)
                val m15Key = "${symbol.symbolCode}_${symbol.activeProvider.id}_M15"
                if (candleMemoryStore[m15Key].isNullOrEmpty()) {
                    add("M15")
                }
            }.toList()
        }

        val syncJobs = timeframesToSync.associateWith { tf ->
            val tfKey = "${symbol.symbolCode}_${symbol.activeProvider.id}_${tf}"
            val existingTf = candleMemoryStore[tfKey] ?: loadCandlesFromPrefs(tfKey, tf)
            val minBarsForDelta = when (tf) {
                "M15" -> 300
                "M30", "H1" -> 240
                "H4" -> 180
                "D1" -> 250
                "W1" -> 140
                else -> 240
            }
            val sinceOpenTimeMs = if (!forceBackfill && existingTf.size >= minBarsForDelta) {
                existingTf.lastOrNull()?.openTimeUtcMillis ?: 0L
            } else {
                0L
            }
            async(Dispatchers.IO) {
                runCatching {
                    val res = adapter.fetchClosedCandlesUpToNow(
                        symbolCode = symbol.symbolCode,
                        timeframe = tf,
                        limit = configuredFetchLimit,
                        sinceOpenTimeMs = sinceOpenTimeMs
                    )
                    Triple(existingTf, res.candles, res.syncMode to res.fetchedNewBars)
                }.getOrDefault(Triple(existingTf, emptyList(), "DB_CACHE_HIT" to 0))
            }
        }

        val syncedByTf = HashMap<String, List<CandleBar>>()
        var effectiveSyncMode = "DB_CACHE_HIT"
        var effectiveFetchedNew = 0
        for ((tf, job) in syncJobs) {
            val (existingTf, incoming, metaPair) = job.await()
            if (tf == effectiveTimeframe) {
                effectiveSyncMode = metaPair.first
                effectiveFetchedNew = metaPair.second
            }
            val combined = if (incoming.isNotEmpty()) {
                CandleValidatorAlgorithm.mergeIdempotent(
                    existing = existingTf,
                    incoming = incoming,
                    timeframe = tf
                ).takeLast(configuredFetchLimit)
            } else {
                existingTf
            }
            syncedByTf[tf] = combined
        }

        // Persist only genuinely synced timeframes so short aggregated bars never masquerade as full native history
        for ((tf, bars) in syncedByTf) {
            if (bars.isNotEmpty()) {
                val tfKey = "${symbol.symbolCode}_${symbol.activeProvider.id}_${tf}"
                candleMemoryStore[tfKey] = bars
                saveCandlesToPrefs(tfKey, bars, configuredFetchLimit)
            }
        }

        val m15Bars = syncedByTf["M15"]
            ?: candleMemoryStore["${symbol.symbolCode}_${symbol.activeProvider.id}_M15"]
            ?: emptyList()

        val merged = syncedByTf[effectiveTimeframe].orEmpty()
        // Use the most recent intraday M15/H1 bar for watchlist lastClose if effectiveTimeframe is D1 (still open today)
        val latestForQuote = if (effectiveTimeframe == "D1" && m15Bars.isNotEmpty()) {
            m15Bars.lastOrNull() ?: merged.lastOrNull()
        } else {
            merged.lastOrNull()
        }
        val prev = if (merged.size >= 2) merged[merged.size - 2].close else latestForQuote?.open
        val updatedSymbol = symbol.copy(
            timeframe = effectiveTimeframe,
            lastClose = latestForQuote?.close,
            prevClose = prev,
            lastCandleUtc = merged.lastOrNull()?.openTimeUtcIso ?: latestForQuote?.openTimeUtcIso,
            storedCandleCount = merged.size,
            lastSyncMode = effectiveSyncMode,
            fetchedNewBars = effectiveFetchedNew,
            isSyncing = false,
            syncErrorText = if (merged.isEmpty()) "ERR_NO_REAL_DATA" else null
        )
        updatedSymbol to merged
    }

    private fun normalizeAndroidHex(raw: String?, fallback: String): String {
        val cleaned = raw.orEmpty().trim().removePrefix("#").uppercase()
        return when {
            cleaned.length == 6 && cleaned.all { it.isDigit() || it in 'A'..'F' } -> "FF$cleaned"
            cleaned.length == 8 && cleaned.all { it.isDigit() || it in 'A'..'F' } -> cleaned
            else -> fallback
        }
    }

    private fun parseDrawingsArray(arr: JSONArray): List<ChartDrawing> {
        val list = ArrayList<ChartDrawing>(arr.length())
        for (i in 0 until arr.length()) {
            val obj = arr.optJSONObject(i) ?: continue
            val id = obj.optString("id").ifBlank { "d_${System.currentTimeMillis()}_$i" }
            val rawColor = obj.optString("colorHex", obj.optString("color", ""))
            val colorHex = rawColor.takeIf { it.isNotBlank() }?.let { normalizeAndroidHex(it, "FF2962FF") }
            val strokeWidthDp = obj.optDouble(
                "strokeWidthDp",
                obj.optDouble("width", 2.2)
            ).toFloat().coerceIn(1.0f, 6.0f)

            when (obj.optString("type").lowercase()) {
                "horizontal_line", "hline" -> {
                    list.add(
                        ChartDrawing.HorizontalLine(
                            id = id,
                            price = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal(obj.optString("price", "0"))),
                            colorHex = colorHex,
                            strokeWidthDp = strokeWidthDp
                        )
                    )
                }
                "vertical_line", "vline" -> {
                    list.add(
                        ChartDrawing.VerticalLine(
                            id = id,
                            timeUtcMillis = obj.optLong("timeUtcMillis", obj.optLong("time", 0L)),
                            colorHex = colorHex,
                            strokeWidthDp = strokeWidthDp
                        )
                    )
                }
                "trend_line", "trend" -> {
                    list.add(
                        ChartDrawing.TrendLine(
                            id = id,
                            startTimeUtcMillis = obj.optLong("startTimeUtcMillis", obj.optLong("t1", 0L)),
                            startPrice = CandleValidatorAlgorithm.normalizeDecimal(
                                BigDecimal(obj.optString("startPrice", obj.optString("p1", "0")))
                            ),
                            endTimeUtcMillis = obj.optLong("endTimeUtcMillis", obj.optLong("t2", 0L)),
                            endPrice = CandleValidatorAlgorithm.normalizeDecimal(
                                BigDecimal(obj.optString("endPrice", obj.optString("p2", "0")))
                            ),
                            colorHex = colorHex,
                            strokeWidthDp = strokeWidthDp
                        )
                    )
                }
                "fib_retracement", "fib" -> {
                    list.add(
                        ChartDrawing.FibRetracement(
                            id = id,
                            startTimeUtcMillis = obj.optLong("startTimeUtcMillis", obj.optLong("t1", 0L)),
                            startPrice = CandleValidatorAlgorithm.normalizeDecimal(
                                BigDecimal(obj.optString("startPrice", obj.optString("p1", "0")))
                            ),
                            endTimeUtcMillis = obj.optLong("endTimeUtcMillis", obj.optLong("t2", 0L)),
                            endPrice = CandleValidatorAlgorithm.normalizeDecimal(
                                BigDecimal(obj.optString("endPrice", obj.optString("p2", "0")))
                            ),
                            colorHex = colorHex,
                            strokeWidthDp = strokeWidthDp
                        )
                    )
                }
                "long_position", "long_pos" -> {
                    list.add(
                        ChartDrawing.LongPosition(
                            id = id,
                            startTimeUtcMillis = obj.optLong("startTimeUtcMillis", obj.optLong("t1", 0L)),
                            endTimeUtcMillis = obj.optLong("endTimeUtcMillis", obj.optLong("t2", 0L)),
                            entryPrice = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal(obj.optString("entryPrice", "0"))),
                            targetPrice = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal(obj.optString("targetPrice", "0"))),
                            stopPrice = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal(obj.optString("stopPrice", "0"))),
                            colorHex = colorHex,
                            strokeWidthDp = strokeWidthDp
                        )
                    )
                }
                "short_position", "short_pos" -> {
                    list.add(
                        ChartDrawing.ShortPosition(
                            id = id,
                            startTimeUtcMillis = obj.optLong("startTimeUtcMillis", obj.optLong("t1", 0L)),
                            endTimeUtcMillis = obj.optLong("endTimeUtcMillis", obj.optLong("t2", 0L)),
                            entryPrice = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal(obj.optString("entryPrice", "0"))),
                            targetPrice = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal(obj.optString("targetPrice", "0"))),
                            stopPrice = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal(obj.optString("stopPrice", "0"))),
                            colorHex = colorHex,
                            strokeWidthDp = strokeWidthDp
                        )
                    )
                }
            }
        }
        return list
    }

    private fun serializeDrawingsArray(drawings: List<ChartDrawing>): JSONArray {
        val arr = JSONArray()
        for (d in drawings) {
            val obj = JSONObject()
            obj.put("id", d.id)
            if (!d.colorHex.isNullOrBlank()) {
                obj.put("colorHex", d.colorHex)
            }
            obj.put("strokeWidthDp", d.strokeWidthDp.toDouble())
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
                is ChartDrawing.FibRetracement -> {
                    obj.put("type", "fib_retracement")
                    obj.put("startTimeUtcMillis", d.startTimeUtcMillis)
                    obj.put("startPrice", d.startPrice.toPlainString())
                    obj.put("endTimeUtcMillis", d.endTimeUtcMillis)
                    obj.put("endPrice", d.endPrice.toPlainString())
                }
                is ChartDrawing.LongPosition -> {
                    obj.put("type", "long_position")
                    obj.put("startTimeUtcMillis", d.startTimeUtcMillis)
                    obj.put("endTimeUtcMillis", d.endTimeUtcMillis)
                    obj.put("entryPrice", d.entryPrice.toPlainString())
                    obj.put("targetPrice", d.targetPrice.toPlainString())
                    obj.put("stopPrice", d.stopPrice.toPlainString())
                }
                is ChartDrawing.ShortPosition -> {
                    obj.put("type", "short_position")
                    obj.put("startTimeUtcMillis", d.startTimeUtcMillis)
                    obj.put("endTimeUtcMillis", d.endTimeUtcMillis)
                    obj.put("entryPrice", d.entryPrice.toPlainString())
                    obj.put("targetPrice", d.targetPrice.toPlainString())
                    obj.put("stopPrice", d.stopPrice.toPlainString())
                }
            }
            arr.put(obj)
        }
        return arr
    }

    fun loadDrawingsForChart(chartId: String): List<ChartDrawing> {
        val inMem = drawingsMemoryStore[chartId]
        if (inMem != null) return inMem
        val raw = prefs.getString("${AppConfig.KEY_DRAWINGS_CACHE_PREFIX}$chartId", null)
            ?: return emptyList()
        val parsed = runCatching {
            parseDrawingsArray(JSONArray(raw))
        }.getOrDefault(emptyList())
        drawingsMemoryStore[chartId] = parsed
        return parsed
    }

    fun saveDrawingsForChart(chartId: String, drawings: List<ChartDrawing>) {
        drawingsMemoryStore[chartId] = drawings
        val arr = serializeDrawingsArray(drawings)
        prefs.edit().putString("${AppConfig.KEY_DRAWINGS_CACHE_PREFIX}$chartId", arr.toString()).apply()
    }

    private fun loadCandlesFromPrefs(key: String, timeframe: String): List<CandleBar> {
        val raw = prefs.getString("${AppConfig.KEY_CANDLES_CACHE_PREFIX}$key", null) ?: return emptyList()
        val symbolCode = key.substringBefore("_")
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
            CandleValidatorAlgorithm.filterSyntheticWeekendAndCombCandles(
                result.sortedBy { it.openTimeUtcMillis },
                symbolCode,
                timeframe
            )
        }.getOrDefault(emptyList())
    }

    private fun saveCandlesToPrefs(
        key: String,
        candles: List<CandleBar>,
        maxLimit: Int = AppConfig.MAX_VISIBLE_CANDLES
    ) {
        val arr = JSONArray()
        for (c in candles.takeLast(maxLimit.coerceIn(40, 5000))) {
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
        val stockProviders = listOf(
            ProviderId.YAHOO_FINANCE,
            ProviderId.TWELVE_DATA,
            ProviderId.TVDATAFEED,
            ProviderId.STOOQ
        )
        return listOf(
            // 1. SPOTBRENT (Energy): TradingView -> Dukascopy -> biquote -> Yahoo -> TwelveData -> Stooq -> EIA
            SymbolConfig(
                chartId = "chart_spotbrent_main",
                symbolCode = "SPOTBRENT",
                titleResId = R.string.symbol_spotbrent_name,
                decimals = 3,
                inWatchlist = true,
                activeProvider = ProviderId.TVDATAFEED,
                allowedProviders = listOf(
                    ProviderId.TVDATAFEED,
                    ProviderId.DUKASCOPY,
                    ProviderId.BIQUOTE,
                    ProviderId.YAHOO_FINANCE,
                    ProviderId.TWELVE_DATA,
                    ProviderId.STOOQ,
                    ProviderId.EIA_BRENT_SPOT
                ),
                timeframe = "M15"
            ),
            // 2. ETHUSD (Crypto): biquote -> Yahoo -> TwelveData -> TradingView -> Stooq
            SymbolConfig(
                chartId = "chart_ethusd_spot",
                symbolCode = "ETHUSD",
                titleResId = R.string.symbol_ethusd_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.BIQUOTE,
                allowedProviders = listOf(
                    ProviderId.BIQUOTE,
                    ProviderId.YAHOO_FINANCE,
                    ProviderId.TWELVE_DATA,
                    ProviderId.TVDATAFEED,
                    ProviderId.STOOQ
                ),
                timeframe = "M15"
            ),
            // 3. BTCUSD (Crypto): biquote -> Yahoo -> TwelveData -> TradingView -> Stooq
            SymbolConfig(
                chartId = "chart_btcusd_spot",
                symbolCode = "BTCUSD",
                titleResId = R.string.symbol_btcusd_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.BIQUOTE,
                allowedProviders = listOf(
                    ProviderId.BIQUOTE,
                    ProviderId.YAHOO_FINANCE,
                    ProviderId.TWELVE_DATA,
                    ProviderId.TVDATAFEED,
                    ProviderId.STOOQ
                ),
                timeframe = "M15"
            ),
            // 4. XAGUSD (Metals): biquote -> TwelveData -> Yahoo -> Dukascopy -> TradingView -> Stooq
            SymbolConfig(
                chartId = "chart_xagusd_spot",
                symbolCode = "XAGUSD",
                titleResId = R.string.symbol_xagusd_name,
                decimals = 3,
                inWatchlist = true,
                activeProvider = ProviderId.BIQUOTE,
                allowedProviders = listOf(
                    ProviderId.BIQUOTE,
                    ProviderId.TWELVE_DATA,
                    ProviderId.YAHOO_FINANCE,
                    ProviderId.DUKASCOPY,
                    ProviderId.TVDATAFEED,
                    ProviderId.STOOQ
                ),
                timeframe = "M15"
            ),
            // 5. XAUUSD (Metals): TwelveData -> biquote -> Dukascopy -> Yahoo -> TradingView -> Stooq
            SymbolConfig(
                chartId = "chart_xauusd_main",
                symbolCode = "XAUUSD",
                titleResId = R.string.symbol_xauusd_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.TWELVE_DATA,
                allowedProviders = listOf(
                    ProviderId.TWELVE_DATA,
                    ProviderId.BIQUOTE,
                    ProviderId.DUKASCOPY,
                    ProviderId.YAHOO_FINANCE,
                    ProviderId.TVDATAFEED,
                    ProviderId.STOOQ
                ),
                timeframe = "M15"
            ),
            // 6. SPX500USD (Indices): Yahoo -> TradingView -> TwelveData -> Stooq
            SymbolConfig(
                chartId = "chart_spx500usd_index",
                symbolCode = "SPX500USD",
                titleResId = R.string.symbol_spx500usd_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = stockProviders,
                timeframe = "M15"
            ),
            // 7. NDQ (Indices): Yahoo -> TradingView -> TwelveData -> Stooq
            SymbolConfig(
                chartId = "chart_ndq_index",
                symbolCode = "NDQ",
                titleResId = R.string.symbol_ndq_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = stockProviders,
                timeframe = "M15"
            ),
            // 8. EURUSD (FX): TradingView -> TwelveData -> biquote -> Dukascopy -> Yahoo -> Stooq
            SymbolConfig(
                chartId = "chart_eurusd_spot",
                symbolCode = "EURUSD",
                titleResId = R.string.symbol_eurusd_name,
                decimals = 4,
                inWatchlist = true,
                activeProvider = ProviderId.TVDATAFEED,
                allowedProviders = listOf(
                    ProviderId.TVDATAFEED,
                    ProviderId.TWELVE_DATA,
                    ProviderId.BIQUOTE,
                    ProviderId.DUKASCOPY,
                    ProviderId.YAHOO_FINANCE,
                    ProviderId.STOOQ
                ),
                timeframe = "M15"
            ),
            // 9. USOIL (Energy): TradingView -> Yahoo -> biquote -> TwelveData -> Stooq
            SymbolConfig(
                chartId = "chart_usoil_spot",
                symbolCode = "USOIL",
                titleResId = R.string.symbol_usoil_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.TVDATAFEED,
                allowedProviders = listOf(
                    ProviderId.TVDATAFEED,
                    ProviderId.YAHOO_FINANCE,
                    ProviderId.BIQUOTE,
                    ProviderId.TWELVE_DATA,
                    ProviderId.STOOQ
                ),
                timeframe = "M15"
            ),
            // 10. NVDA (US Equities): Yahoo -> TwelveData -> TradingView
            SymbolConfig(
                chartId = "chart_nvda_stock",
                symbolCode = "NVDA",
                titleResId = R.string.symbol_nvda_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = stockProviders,
                timeframe = "M15"
            ),
            // 11. AMZN
            SymbolConfig(
                chartId = "chart_amzn_stock",
                symbolCode = "AMZN",
                titleResId = R.string.symbol_amzn_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = stockProviders,
                timeframe = "M15"
            ),
            // 12. TSLA
            SymbolConfig(
                chartId = "chart_tsla_stock",
                symbolCode = "TSLA",
                titleResId = R.string.symbol_tsla_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = stockProviders,
                timeframe = "M15"
            ),
            // 13. AAPL
            SymbolConfig(
                chartId = "chart_aapl_stock",
                symbolCode = "AAPL",
                titleResId = R.string.symbol_aapl_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = stockProviders,
                timeframe = "M15"
            ),
            // 14. GOOGL
            SymbolConfig(
                chartId = "chart_googl_stock",
                symbolCode = "GOOGL",
                titleResId = R.string.symbol_googl_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = stockProviders,
                timeframe = "M15"
            ),
            // 15. MSFT
            SymbolConfig(
                chartId = "chart_msft_stock",
                symbolCode = "MSFT",
                titleResId = R.string.symbol_msft_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = stockProviders,
                timeframe = "M15"
            ),
            // 16. META
            SymbolConfig(
                chartId = "chart_meta_stock",
                symbolCode = "META",
                titleResId = R.string.symbol_meta_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = stockProviders,
                timeframe = "M15"
            ),
            // 17. NFLX
            SymbolConfig(
                chartId = "chart_nflx_stock",
                symbolCode = "NFLX",
                titleResId = R.string.symbol_nflx_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = stockProviders,
                timeframe = "M15"
            ),
            // 18. AMD
            SymbolConfig(
                chartId = "chart_amd_stock",
                symbolCode = "AMD",
                titleResId = R.string.symbol_amd_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = stockProviders,
                timeframe = "M15"
            ),
            // 19. UBER
            SymbolConfig(
                chartId = "chart_uber_stock",
                symbolCode = "UBER",
                titleResId = R.string.symbol_uber_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = stockProviders,
                timeframe = "M15"
            ),
            // 20. NKE
            SymbolConfig(
                chartId = "chart_nke_stock",
                symbolCode = "NKE",
                titleResId = R.string.symbol_nke_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = stockProviders,
                timeframe = "M15"
            ),
            // 21. IBM
            SymbolConfig(
                chartId = "chart_ibm_stock",
                symbolCode = "IBM",
                titleResId = R.string.symbol_ibm_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = stockProviders,
                timeframe = "M15"
            ),
            // 22. SAN
            SymbolConfig(
                chartId = "chart_san_stock",
                symbolCode = "SAN",
                titleResId = R.string.symbol_san_name,
                decimals = 2,
                inWatchlist = true,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = stockProviders,
                timeframe = "M15"
            ),
            // Secondary catalog symbols (inWatchlist = false)
            SymbolConfig(
                chartId = "chart_brent_futures",
                symbolCode = "BRENT_FUTURES",
                titleResId = R.string.symbol_brent_futures_name,
                decimals = 2,
                inWatchlist = false,
                activeProvider = ProviderId.YAHOO_FINANCE,
                allowedProviders = listOf(
                    ProviderId.YAHOO_FINANCE,
                    ProviderId.TVDATAFEED,
                    ProviderId.DUKASCOPY,
                    ProviderId.EIA_BRENT_SPOT
                ),
                timeframe = "M15"
            ),
            SymbolConfig(
                chartId = "chart_gbpusd_spot",
                symbolCode = "GBPUSD",
                titleResId = R.string.symbol_gbpusd_name,
                decimals = 4,
                inWatchlist = false,
                activeProvider = ProviderId.TVDATAFEED,
                allowedProviders = listOf(
                    ProviderId.TVDATAFEED,
                    ProviderId.TWELVE_DATA,
                    ProviderId.DUKASCOPY,
                    ProviderId.YAHOO_FINANCE
                ),
                timeframe = "M15"
            ),
            SymbolConfig(
                chartId = "chart_usdjpy_spot",
                symbolCode = "USDJPY",
                titleResId = R.string.symbol_usdjpy_name,
                decimals = 2,
                inWatchlist = false,
                activeProvider = ProviderId.TVDATAFEED,
                allowedProviders = listOf(
                    ProviderId.TVDATAFEED,
                    ProviderId.TWELVE_DATA,
                    ProviderId.DUKASCOPY,
                    ProviderId.YAHOO_FINANCE
                ),
                timeframe = "M15"
            )
        )
    }

    fun getAllCachedDrawings(chartIds: List<String>): Map<String, List<ChartDrawing>> {
        val map = HashMap<String, List<ChartDrawing>>()
        for (cId in chartIds) {
            val list = loadDrawingsForChart(cId)
            if (list.isNotEmpty()) {
                map[cId] = list
            }
        }
        return map
    }

    suspend fun fetchSystemStatus(): SystemStatusDto = withContext(Dispatchers.IO) {
        val urls = listOf(
            "${AppConfig.API_BASE_URL}system/status.php",
            "${AppConfig.API_BASE_URL}status.php"
        )
        for (url in urls) {
            val res = runCatching {
                val req = Request.Builder().url(url).get().build()
                httpClient.newCall(req).execute().use { resp ->
                    if (resp.isSuccessful) {
                        val root = JSONObject(resp.body?.string().orEmpty())
                        if (root.optBoolean("ok", false)) {
                            val data = root.optJSONObject("data") ?: JSONObject()
                            val dbObj = data.optJSONObject("database")
                            val isDbConn = dbObj?.optBoolean("connected", false) ?: false
                            val dbVer = dbObj?.optString("version", "MariaDB") ?: "MariaDB"
                            SystemStatusDto(
                                isHealthy = data.optString("status") == "healthy",
                                version = data.optString("version", "1.32.0"),
                                serverTimeUtc = data.optString("server_time_utc", ""),
                                dbConnected = isDbConn,
                                dbVersion = dbVer,
                                totalCandles = data.optLong("total_candles", 0L),
                                registeredOwner = data.optBoolean("registered_owner", false)
                            )
                        } else null
                    } else null
                }
            }.getOrNull()
            if (res != null) return@withContext res
        }
        SystemStatusDto(
            isHealthy = true,
            version = "1.32.0",
            serverTimeUtc = "Local Cached",
            dbConnected = false,
            dbVersion = "MariaDB (Local)",
            totalCandles = 0L,
            registeredOwner = isOwnerAccountRegistered()
        )
    }

    fun loadSavedOpenTabs(): List<ChartTabState> {
        val raw = prefs.getString(AppConfig.KEY_OPEN_TABS_JSON, null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            val catalog = loadSymbolCatalog().associateBy { it.symbolCode.uppercase() }
            val curPrefs = loadChartPreferences()
            val list = ArrayList<ChartTabState>(arr.length())
            for (i in 0 until arr.length()) {
                val obj = arr.optJSONObject(i) ?: continue
                val symCode = obj.optString("symbolCode", "").trim().uppercase()
                if (symCode.isEmpty()) continue
                val def = catalog[symCode]
                val provId = ProviderId.fromId(obj.optString("provider", def?.activeProvider?.id ?: "tvdatafeed"))
                val tf = obj.optString("timeframe", def?.timeframe ?: "M15").uppercase()
                val chartId = def?.chartId ?: "chart_${symCode.lowercase()}_custom"
                val tabId = obj.optString("tabId", "tab_${symCode}_${tf}_$i")
                val rawChartType = obj.optString("chartType", "candlestick")
                val parsedChartType = ChartType.entries.find { it.name.equals(rawChartType, ignoreCase = true) } ?: ChartType.CANDLESTICK
                list.add(
                    ChartTabState(
                        tabId = tabId,
                        chartId = chartId,
                        symbolCode = symCode,
                        decimals = obj.optInt("decimals", def?.decimals ?: 2),
                        provider = provId,
                        timeframe = tf,
                        chartType = parsedChartType,
                        visibleCandleCount = obj.optInt("visibleCount", AppConfig.DEFAULT_VISIBLE_CANDLES).coerceIn(AppConfig.MIN_VISIBLE_CANDLES, AppConfig.MAX_VISIBLE_CANDLES),
                        scrollOffsetFromRight = obj.optInt("scrollOffset", 0),
                        showVolume = obj.optBoolean("showVolume", true),
                        showSma20 = obj.optBoolean("showSma20", false),
                        showSma50 = obj.optBoolean("showSma50", false),
                        showSma200 = obj.optBoolean("showSma200", false),
                        showEma20 = obj.optBoolean("showEma20", false),
                        showEma50 = obj.optBoolean("showEma50", false),
                        showBollinger = obj.optBoolean("showBollinger", false),
                        showSupertrend = obj.optBoolean("showSupertrend", false),
                        showVwap = obj.optBoolean("showVwap", false),
                        showRsi14 = obj.optBoolean("showRsi14", false),
                        showMacd = obj.optBoolean("showMacd", false),
                        showOverlayMacd = obj.optBoolean("showOverlayMacd", false),
                        showAtr14 = obj.optBoolean("showAtr14", false),
                        showSmcStructure = obj.optBoolean("showSmcStructure", false),
                        showFvg = obj.optBoolean("showFvg", false),
                        showVolumeProfile = obj.optBoolean("showVolumeProfile", false),
                        isLogScale = obj.optBoolean("isLogScale", false),
                        activeDrawingColorHex = normalizeAndroidHex(
                            obj.optString("activeDrawingColorHex", curPrefs.defaultDrawingColorHex),
                            curPrefs.defaultDrawingColorHex
                        ),
                        activeDrawingWidthDp = obj.optDouble(
                            "activeDrawingWidthDp",
                            curPrefs.defaultDrawingWidthDp.toDouble()
                        ).toFloat().coerceIn(1.0f, 8.0f),
                        isMagnetMode = obj.optBoolean("isMagnetMode", false),
                        drawings = loadDrawingsForChart(chartId)
                    )
                )
            }
            list
        }.getOrDefault(emptyList())
    }

    fun saveOpenTabsToPrefs(tabs: List<ChartTabState>) {
        val arr = JSONArray()
        for (t in tabs) {
            val obj = JSONObject()
                .put("tabId", t.tabId)
                .put("symbolCode", t.symbolCode)
                .put("provider", t.provider.id)
                .put("timeframe", t.timeframe)
                .put("decimals", t.decimals)
                .put("chartType", t.chartType.name.lowercase())
                .put("visibleCount", t.visibleCandleCount)
                .put("scrollOffset", t.scrollOffsetFromRight)
                .put("showVolume", t.showVolume)
                .put("showSma20", t.showSma20)
                .put("showSma50", t.showSma50)
                .put("showSma200", t.showSma200)
                .put("showEma20", t.showEma20)
                .put("showEma50", t.showEma50)
                .put("showBollinger", t.showBollinger)
                .put("showSupertrend", t.showSupertrend)
                .put("showVwap", t.showVwap)
                .put("showRsi14", t.showRsi14)
                .put("showMacd", t.showMacd)
                .put("showOverlayMacd", t.showOverlayMacd)
                .put("showAtr14", t.showAtr14)
                .put("showSmcStructure", t.showSmcStructure)
                .put("showFvg", t.showFvg)
                .put("showVolumeProfile", t.showVolumeProfile)
                .put("isLogScale", t.isLogScale)
                .put("activeDrawingColorHex", t.activeDrawingColorHex)
                .put("activeDrawingWidthDp", t.activeDrawingWidthDp.toDouble())
                .put("isMagnetMode", t.isMagnetMode)
            arr.put(obj)
        }
        prefs.edit().putString(AppConfig.KEY_OPEN_TABS_JSON, arr.toString()).apply()
    }

    suspend fun syncWorkspaceToCloud(
        symbols: List<SymbolConfig>,
        preferences: ChartPreferences,
        drawingsMap: Map<String, List<ChartDrawing>>,
        openTabs: List<ChartTabState> = emptyList()
    ): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val drawingsObj = JSONObject()
            val symbolByChartId = symbols.associateBy { it.chartId }
            for ((chartId, dList) in drawingsMap) {
                val arr = serializeDrawingsArray(dList)
                drawingsObj.put(chartId, arr)
                // Also write under canonical ${symbolCode}_${timeframe} and ${symbolCode}_M15 keys for Web parity
                val sym = symbolByChartId[chartId]
                if (sym != null) {
                    drawingsObj.put("${sym.symbolCode}_${sym.timeframe.uppercase()}", arr)
                    drawingsObj.put("${sym.symbolCode}_M15", arr)
                }
            }

            val symbolsArr = JSONArray()
            for (s in symbols) {
                val sObj = JSONObject()
                    .put("symbolCode", s.symbolCode)
                    .put("inWatchlist", s.inWatchlist)
                    .put("activeProvider", s.activeProvider.id)
                    .put("timeframe", s.timeframe)
                    .put("decimals", s.decimals)
                if (!s.customTitle.isNullOrBlank()) sObj.put("customTitle", s.customTitle)
                symbolsArr.put(sObj)
            }

            val prefsObj = JSONObject()
                .put("bullCandleColorHex", preferences.bullCandleColorHex)
                .put("bearCandleColorHex", preferences.bearCandleColorHex)
                .put("trendLineColorHex", preferences.trendLineColorHex)
                .put("horizontalLineColorHex", preferences.horizontalLineColorHex)
                .put("verticalLineColorHex", preferences.verticalLineColorHex)
                .put("chartGridColorHex", preferences.chartGridColorHex)
                .put("defaultDrawingColorHex", preferences.defaultDrawingColorHex)
                .put("defaultDrawingWidthDp", preferences.defaultDrawingWidthDp.toDouble())
                .put("defaultDrawingWidthPx", preferences.defaultDrawingWidthDp.toDouble())
                .put("candleFetchLimit", preferences.candleFetchLimit)
                .put("zoomStepCandles", preferences.zoomStepCandles)
                .put("drawingHitTolerancePx", preferences.drawingHitTolerancePx.toDouble())
                .put("bollingerPeriod", preferences.bollingerPeriod)
                .put("bollingerStdDev", preferences.bollingerStdDev.toDouble())
                .put("hideWatchlistLogos", preferences.hideWatchlistLogos)
                .put("showSymbolScreen", preferences.showSymbolScreen)
                .put("chartVibrations", preferences.chartVibrations)
                .put("logarithmicScaleDefault", preferences.logarithmicScaleDefault)
                .put("rememberLastChartOnDevice", preferences.rememberLastChartOnDevice)
                .put("hideTabBarInLandscape", preferences.hideTabBarInLandscape)
                .put("pickerVibrations", preferences.pickerVibrations)
                .put("showPickerScrollMagnifiers", preferences.showPickerScrollMagnifiers)
                .put("showCountdownToBarClose", preferences.showCountdownToBarClose)
                .put("showPrevCloseLine", preferences.showPrevCloseLine)
                .put("showHighLowLabels", preferences.showHighLowLabels)
                .put("twelveDataApiKey", preferences.twelveDataApiKey)
                .put("stooqApiKey", preferences.stooqApiKey)
                .put("alphaVantageApiKey", preferences.alphaVantageApiKey)
                .put("finnhubApiKey", preferences.finnhubApiKey)
                .put("timezoneMode", preferences.timezoneMode)

            val tabsArr = JSONArray()
            for (t in openTabs) {
                val tObj = JSONObject()
                    .put("tabId", t.tabId)
                    .put("symbolCode", t.symbolCode)
                    .put("provider", t.provider.id)
                    .put("timeframe", t.timeframe)
                    .put("decimals", t.decimals)
                    .put("chartType", t.chartType.name.lowercase())
                    .put("visibleCount", t.visibleCandleCount)
                    .put("scrollOffset", t.scrollOffsetFromRight)
                    .put("showVolume", t.showVolume)
                    .put("showSma20", t.showSma20)
                    .put("showSma50", t.showSma50)
                    .put("showSma200", t.showSma200)
                    .put("showEma20", t.showEma20)
                    .put("showEma50", t.showEma50)
                    .put("showBollinger", t.showBollinger)
                    .put("showSupertrend", t.showSupertrend)
                    .put("showVwap", t.showVwap)
                    .put("showRsi14", t.showRsi14)
                    .put("showMacd", t.showMacd)
                    .put("showOverlayMacd", t.showOverlayMacd)
                    .put("showAtr14", t.showAtr14)
                    .put("showSmcStructure", t.showSmcStructure)
                    .put("showFvg", t.showFvg)
                    .put("showVolumeProfile", t.showVolumeProfile)
                    .put("isLogScale", t.isLogScale)
                    .put("activeDrawingColorHex", t.activeDrawingColorHex)
                    .put("activeDrawingWidthDp", t.activeDrawingWidthDp.toDouble())
                    .put("activeDrawingWidthPx", t.activeDrawingWidthDp.toDouble())
                    .put("isMagnetMode", t.isMagnetMode)
                tabsArr.put(tObj)
            }

            val openTabsObj = JSONObject()
                .put("lastOpenedSymbolCode", loadLastOpenedSymbolCode() ?: "SPOTBRENT")
                .put("tabs", tabsArr)

            if (openTabs.isNotEmpty()) {
                saveOpenTabsToPrefs(openTabs)
            }

            val workspaceData = JSONObject()
                .put("drawings", drawingsObj)
                .put("symbols", symbolsArr)
                .put("preferences", prefsObj)
                .put("open_tabs", openTabsObj)

            val payload = JSONObject().put("workspace", workspaceData)
            val req = Request.Builder()
                .url("${AppConfig.API_BASE_URL}workspace_sync.php")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()

            httpClient.newCall(req).execute().use { resp ->
                resp.isSuccessful && JSONObject(resp.body?.string().orEmpty()).optBoolean("ok", false)
            }
        }.getOrDefault(false)
    }

    suspend fun fetchCloudWorkspace(): JSONObject? = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder()
                .url("${AppConfig.API_BASE_URL}workspace_sync.php")
                .get()
                .build()
            httpClient.newCall(req).execute().use { resp ->
                if (resp.isSuccessful) {
                    val root = JSONObject(resp.body?.string().orEmpty())
                    if (root.optBoolean("ok", false)) {
                        val data = root.optJSONObject("data")
                        if (data?.optBoolean("has_saved_workspace", false) == true) {
                            data.optJSONObject("workspace")
                        } else null
                    } else null
                } else null
            }
        }.getOrNull()
    }

    /**
     * Applies a downloaded Central Core workspace JSON payload (from Web or Android)
     * to local storage so both platforms stay 100% synchronized.
     */
    fun applyCloudWorkspaceToLocal(workspaceObj: JSONObject): Boolean {
        return runCatching {
            var changed = false

            // 1. Preferences
            val prefsJson = workspaceObj.optJSONObject("preferences")
            if (prefsJson != null) {
                val cur = loadChartPreferences()
                val updatedPrefs = cur.copy(
                    bullCandleColorHex = normalizeAndroidHex(
                        prefsJson.optString("bullCandleColorHex", prefsJson.optString("bullColor", "")),
                        cur.bullCandleColorHex
                    ),
                    bearCandleColorHex = normalizeAndroidHex(
                        prefsJson.optString("bearCandleColorHex", prefsJson.optString("bearColor", "")),
                        cur.bearCandleColorHex
                    ),
                    trendLineColorHex = normalizeAndroidHex(
                        prefsJson.optString("trendLineColorHex", prefsJson.optString("trendColor", "")),
                        cur.trendLineColorHex
                    ),
                    horizontalLineColorHex = normalizeAndroidHex(
                        prefsJson.optString("horizontalLineColorHex", prefsJson.optString("hLineColor", "")),
                        cur.horizontalLineColorHex
                    ),
                    verticalLineColorHex = normalizeAndroidHex(
                        prefsJson.optString("verticalLineColorHex", prefsJson.optString("vLineColor", "")),
                        cur.verticalLineColorHex
                    ),
                    defaultDrawingColorHex = normalizeAndroidHex(
                        prefsJson.optString("defaultDrawingColorHex", prefsJson.optString("defaultDrawingColor", "")),
                        cur.defaultDrawingColorHex
                    ),
                    defaultDrawingWidthDp = prefsJson.optDouble(
                        "defaultDrawingWidthDp",
                        prefsJson.optDouble("defaultDrawingWidthPx", cur.defaultDrawingWidthDp.toDouble())
                    ).toFloat().coerceIn(1.0f, 8.0f),
                    candleFetchLimit = prefsJson.optInt("candleFetchLimit", cur.candleFetchLimit).coerceIn(40, 5000),
                    zoomStepCandles = prefsJson.optInt("zoomStepCandles", cur.zoomStepCandles).coerceIn(2, 30),
                    drawingHitTolerancePx = prefsJson.optDouble("drawingHitTolerancePx", cur.drawingHitTolerancePx.toDouble()).toFloat().coerceIn(12f, 60f),
                    bollingerPeriod = prefsJson.optInt("bollingerPeriod", cur.bollingerPeriod).coerceIn(5, 200),
                    bollingerStdDev = prefsJson.optDouble("bollingerStdDev", cur.bollingerStdDev.toDouble()).toFloat().coerceIn(0.5f, 5.0f),
                    hideWatchlistLogos = prefsJson.optBoolean("hideWatchlistLogos", cur.hideWatchlistLogos),
                    showSymbolScreen = prefsJson.optBoolean("showSymbolScreen", cur.showSymbolScreen),
                    chartVibrations = prefsJson.optBoolean("chartVibrations", cur.chartVibrations),
                    logarithmicScaleDefault = prefsJson.optBoolean(
                        "logarithmicScaleDefault",
                        prefsJson.optBoolean("isLogScale", cur.logarithmicScaleDefault)
                    ),
                    rememberLastChartOnDevice = prefsJson.optBoolean(
                        "rememberLastChartOnDevice",
                        prefsJson.optBoolean("rememberLastChart", cur.rememberLastChartOnDevice)
                    ),
                    hideTabBarInLandscape = prefsJson.optBoolean("hideTabBarInLandscape", cur.hideTabBarInLandscape),
                    pickerVibrations = prefsJson.optBoolean(
                        "pickerVibrations",
                        prefsJson.optBoolean("pickerVibrates", cur.pickerVibrations)
                    ),
                    showPickerScrollMagnifiers = prefsJson.optBoolean(
                        "showPickerScrollMagnifiers",
                        prefsJson.optBoolean("showScrollMagnifier", cur.showPickerScrollMagnifiers)
                    ),
                    showCountdownToBarClose = prefsJson.optBoolean("showCountdownToBarClose", cur.showCountdownToBarClose),
                    showPrevCloseLine = prefsJson.optBoolean("showPrevCloseLine", cur.showPrevCloseLine),
                    showHighLowLabels = prefsJson.optBoolean("showHighLowLabels", cur.showHighLowLabels),
                    twelveDataApiKey = prefsJson.optString("twelveDataApiKey", cur.twelveDataApiKey),
                    stooqApiKey = prefsJson.optString("stooqApiKey", cur.stooqApiKey),
                    alphaVantageApiKey = prefsJson.optString("alphaVantageApiKey", cur.alphaVantageApiKey),
                    finnhubApiKey = prefsJson.optString("finnhubApiKey", cur.finnhubApiKey),
                    timezoneMode = prefsJson.optString("timezoneMode", cur.timezoneMode).uppercase().let { if (it == "LOCAL") "LOCAL" else "UTC" }
                )
                saveChartPreferences(updatedPrefs)
                changed = true
            }

            // 2. Symbols Catalog
            val symbolsArr = workspaceObj.optJSONArray("symbols")
            if (symbolsArr != null && symbolsArr.length() > 0) {
                prefs.edit().putString(AppConfig.KEY_SYMBOLS_CONFIG_JSON, symbolsArr.toString()).apply()
                changed = true
            }

            // 3. Drawings (maps both canonical SYMBOL_TF keys and Android chartId keys)
            val drawingsObj = workspaceObj.optJSONObject("drawings")
            if (drawingsObj != null) {
                val catalog = loadSymbolCatalog()
                val chartIdBySymbol = catalog.associate { it.symbolCode.uppercase() to it.chartId }
                val keys = drawingsObj.keys()
                while (keys.hasNext()) {
                    val rawKey = keys.next()
                    val arr = drawingsObj.optJSONArray(rawKey) ?: continue
                    val parsedDrawings = parseDrawingsArray(arr)
                    if (parsedDrawings.isEmpty()) continue

                    val targetChartId = when {
                        rawKey.startsWith("chart_") -> rawKey
                        rawKey.contains("_") -> {
                            val symPrefix = rawKey.substringBeforeLast("_").uppercase()
                            chartIdBySymbol[symPrefix] ?: "chart_${symPrefix.lowercase()}_custom"
                        }
                        else -> chartIdBySymbol[rawKey.uppercase()] ?: rawKey
                    }
                    saveDrawingsForChart(targetChartId, parsedDrawings)
                    changed = true
                }
            }

            // 4. Open Tabs / Last Opened Symbol
            val openTabsObj = workspaceObj.optJSONObject("open_tabs")
            val openTabsArr = workspaceObj.optJSONArray("open_tabs") ?: openTabsObj?.optJSONArray("tabs")
            if (openTabsObj != null) {
                val lastSym = openTabsObj.optString("lastOpenedSymbolCode", "").trim().uppercase()
                if (lastSym.isNotEmpty()) {
                    saveLastOpenedSymbolCode(lastSym)
                    changed = true
                }
            }
            if (openTabsArr != null && openTabsArr.length() > 0) {
                val catalog = loadSymbolCatalog().associateBy { it.symbolCode.uppercase() }
                val curPrefs = loadChartPreferences()
                val parsedTabs = ArrayList<ChartTabState>(openTabsArr.length())
                for (i in 0 until openTabsArr.length()) {
                    val obj = openTabsArr.optJSONObject(i) ?: continue
                    val symCode = obj.optString("symbolCode", "").trim().uppercase()
                    if (symCode.isEmpty()) continue
                    val def = catalog[symCode]
                    val provId = ProviderId.fromId(obj.optString("provider", def?.activeProvider?.id ?: "tvdatafeed"))
                    val tf = obj.optString("timeframe", def?.timeframe ?: "M15").uppercase()
                    val chartId = def?.chartId ?: "chart_${symCode.lowercase()}_custom"
                    val tabId = obj.optString("tabId", "tab_${symCode}_${tf}_$i")
                    val rawChartType = obj.optString("chartType", "candlestick")
                    val parsedChartType = ChartType.entries.find { it.name.equals(rawChartType, ignoreCase = true) } ?: ChartType.CANDLESTICK
                    parsedTabs.add(
                        ChartTabState(
                            tabId = tabId,
                            chartId = chartId,
                            symbolCode = symCode,
                            decimals = obj.optInt("decimals", def?.decimals ?: 2),
                            provider = provId,
                            timeframe = tf,
                            chartType = parsedChartType,
                            visibleCandleCount = obj.optInt("visibleCount", AppConfig.DEFAULT_VISIBLE_CANDLES).coerceIn(AppConfig.MIN_VISIBLE_CANDLES, AppConfig.MAX_VISIBLE_CANDLES),
                            scrollOffsetFromRight = obj.optInt("scrollOffset", 0),
                            showVolume = obj.optBoolean("showVolume", true),
                            showSma20 = obj.optBoolean("showSma20", false),
                            showSma50 = obj.optBoolean("showSma50", false),
                            showSma200 = obj.optBoolean("showSma200", false),
                            showEma20 = obj.optBoolean("showEma20", false),
                            showEma50 = obj.optBoolean("showEma50", false),
                            showBollinger = obj.optBoolean("showBollinger", false),
                            showSupertrend = obj.optBoolean("showSupertrend", false),
                            showVwap = obj.optBoolean("showVwap", false),
                            showRsi14 = obj.optBoolean("showRsi14", false),
                            showMacd = obj.optBoolean("showMacd", false),
                            showOverlayMacd = obj.optBoolean("showOverlayMacd", false),
                            showAtr14 = obj.optBoolean("showAtr14", false),
                            showSmcStructure = obj.optBoolean("showSmcStructure", false),
                            showFvg = obj.optBoolean("showFvg", false),
                            showVolumeProfile = obj.optBoolean("showVolumeProfile", false),
                            isLogScale = obj.optBoolean("isLogScale", false),
                            activeDrawingColorHex = normalizeAndroidHex(
                                obj.optString("activeDrawingColorHex", curPrefs.defaultDrawingColorHex),
                                curPrefs.defaultDrawingColorHex
                            ),
                            activeDrawingWidthDp = obj.optDouble(
                                "activeDrawingWidthDp",
                                obj.optDouble("activeDrawingWidthPx", curPrefs.defaultDrawingWidthDp.toDouble())
                            ).toFloat().coerceIn(1.0f, 8.0f),
                            isMagnetMode = obj.optBoolean("isMagnetMode", false),
                            drawings = loadDrawingsForChart(chartId)
                        )
                    )
                }
                if (parsedTabs.isNotEmpty()) {
                    saveOpenTabsToPrefs(parsedTabs)
                    changed = true
                }
            }

            changed
        }.getOrDefault(false)
    }
}

