package es.manico.chartintelligence.data.repository

import android.content.Context
import android.content.SharedPreferences
import es.manico.chartintelligence.R
import es.manico.chartintelligence.algorithms.CandleImportAlgorithm
import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.algorithms.PasswordHashAlgorithm
import es.manico.chartintelligence.algorithms.TimeframeAggregatorAlgorithm
import es.manico.chartintelligence.config.AppConfig
import es.manico.chartintelligence.data.model.CandleBar
import es.manico.chartintelligence.data.model.ChartDrawing
import es.manico.chartintelligence.data.model.ChartPreferences
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.data.model.ChartType
import es.manico.chartintelligence.data.model.DrawingAnchor
import es.manico.chartintelligence.data.model.DrawingTool
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
import java.util.Base64
import java.util.concurrent.TimeUnit

data class ServerOwnerStatus(
    val isRegistered: Boolean,
    val username: String,
    val email: String
)

data class SystemStatusDto(
    val isHealthy: Boolean = false,
    val version: String = "1.41.0",
    val serverTimeUtc: String = "",
    val dbConnected: Boolean = false,
    val dbVersion: String = "MariaDB",
    val totalCandles: Long = 0L,
    val registeredOwner: Boolean = false,
    val phpRuntimeSummary: String = ""
)

data class LiveQuoteResult(
    val price: BigDecimal,
    val mode: String, // "LIVE_TICK" | "LAST_CLOSED_FALLBACK"
    val updatedAtUtc: String,
    val formingBar: CandleBar? = null
)

data class ImportBatchDto(
    val id: Long,
    val symbolCode: String,
    val providerId: String,
    val timeframe: String,
    val sourceType: String,
    val fileName: String,
    val qualityStatus: String,
    val rowsInserted: Int,
    val rowsCorrected: Int,
    val importedAtUtc: String
)

data class HistoricalImportResult(
    val ok: Boolean,
    val effectiveTimeframe: String,
    val importedCount: Int,
    val rowsInserted: Int,
    val rowsCorrected: Int,
    val forcedDailyOnly: Boolean,
    val serverSynced: Boolean,
    val errorMessage: String? = null,
    val candles: List<CandleBar> = emptyList()
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

    init {
        // Security hygiene: scrub any legacy plaintext password saved by older builds.
        if (prefs.contains(AppConfig.KEY_SAVED_PASSWORD)) {
            prefs.edit().remove(AppConfig.KEY_SAVED_PASSWORD).apply()
        }
    }

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
        val editor = prefs.edit()
            .putBoolean(AppConfig.KEY_REMEMBER_CREDENTIALS, remember)
            .remove(AppConfig.KEY_SAVED_PASSWORD)
        if (!remember) {
            editor.putBoolean(AppConfig.KEY_SESSION_AUTHENTICATED, false)
            editor.remove(AppConfig.KEY_SESSION_TOKEN)
        }
        editor.apply()
    }

    fun getSavedPassword(): String {
        // Security: never store or expose plaintext passwords in SharedPreferences or UI state.
        return ""
    }

    fun saveOwnerPasswordIfRemembered(password: String, remember: Boolean) {
        val editor = prefs.edit()
            .putBoolean(AppConfig.KEY_REMEMBER_CREDENTIALS, remember)
            .remove(AppConfig.KEY_SAVED_PASSWORD)
        if (remember) {
            editor.putBoolean(AppConfig.KEY_SESSION_AUTHENTICATED, true)
        } else {
            editor.putBoolean(AppConfig.KEY_SESSION_AUTHENTICATED, false)
            editor.remove(AppConfig.KEY_SESSION_TOKEN)
        }
        editor.apply()
    }

    fun getSessionToken(): String {
        return prefs.getString(AppConfig.KEY_SESSION_TOKEN, "")?.trim().orEmpty()
    }

    fun saveSessionToken(token: String?) {
        val clean = token?.trim().orEmpty()
        val editor = prefs.edit()
        if (clean.isNotEmpty()) {
            editor.putString(AppConfig.KEY_SESSION_TOKEN, clean)
        } else {
            editor.remove(AppConfig.KEY_SESSION_TOKEN)
        }
        editor.apply()
    }

    fun isSessionAuthenticated(): Boolean {
        return loadRememberCredentials() &&
            isOwnerAccountRegistered() &&
            prefs.getBoolean(AppConfig.KEY_SESSION_AUTHENTICATED, false)
    }

    fun setSessionAuthenticated(authenticated: Boolean) {
        val editor = prefs.edit().putBoolean(AppConfig.KEY_SESSION_AUTHENTICATED, authenticated)
        if (!authenticated) {
            editor.remove(AppConfig.KEY_SESSION_TOKEN)
        }
        editor.apply()
    }

    private fun Request.Builder.withOptionalBearerAuth(): Request.Builder {
        val token = getSessionToken()
        if (token.isNotEmpty()) {
            addHeader("Authorization", "Bearer $token")
        }
        return this
    }

    private fun clearLocalSessionOnUnauthorized() {
        prefs.edit()
            .remove(AppConfig.KEY_SESSION_TOKEN)
            .putBoolean(AppConfig.KEY_SESSION_AUTHENTICATED, false)
            .apply()
    }

    /**
     * Validates the stored session token against the server.
     * Returns true if valid, false if explicitly rejected (401), or null on network/timeout failure
     * so offline Remember-Me continues working cleanly.
     */
    suspend fun validateSessionWithServer(): Boolean? = withContext(Dispatchers.IO) {
        val token = getSessionToken()
        if (token.isBlank()) return@withContext null
        runCatching {
            val payload = JSONObject().put("session_token", token)
            val req = Request.Builder()
                .url("${AppConfig.API_BASE_URL}auth.php?action=validate_session")
                .withOptionalBearerAuth()
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            httpClient.newCall(req).execute().use { resp ->
                if (resp.code == 401) {
                    clearLocalSessionOnUnauthorized()
                    false
                } else if (resp.isSuccessful) {
                    val root = JSONObject(resp.body?.string().orEmpty())
                    if (root.optBoolean("ok", false)) {
                        val data = root.optJSONObject("data")
                        val srvUser = data?.optString("owner_username", "").orEmpty().trim()
                        val srvEmail = data?.optString("owner_email", "").orEmpty().trim()
                        if (srvUser.isNotEmpty() || srvEmail.isNotEmpty()) {
                            val editor = prefs.edit()
                            if (srvUser.isNotEmpty()) editor.putString(AppConfig.KEY_OWNER_USERNAME, srvUser)
                            if (srvEmail.isNotEmpty()) editor.putString(AppConfig.KEY_OWNER_EMAIL, srvEmail)
                            editor.apply()
                        }
                        true
                    } else {
                        null
                    }
                } else {
                    null
                }
            }
        }.getOrNull()
    }

    suspend fun logoutOwnerOnServer() = withContext(Dispatchers.IO) {
        val token = getSessionToken()
        clearLocalSessionOnUnauthorized()
        if (token.isBlank()) return@withContext
        runCatching {
            val payload = JSONObject().put("session_token", token)
            val req = Request.Builder()
                .url("${AppConfig.API_BASE_URL}auth.php?action=logout")
                .addHeader("Authorization", "Bearer $token")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            httpClient.newCall(req).execute().close()
        }
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
                    if (!resp.isSuccessful) return@use false
                    val root = JSONObject(resp.body?.string().orEmpty())
                    if (root.optBoolean("ok", false)) {
                        val token = root.optJSONObject("data")?.optString("session_token", "").orEmpty()
                        if (token.isNotBlank()) saveSessionToken(token)
                        true
                    } else {
                        false
                    }
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
                            val token = data?.optString("session_token", "").orEmpty()
                            if (token.isNotBlank()) saveSessionToken(token)
                            registerOwnerAccount(srvUser, password, srvEmail.ifEmpty { getOwnerEmail() })
                            true
                        } else {
                            false
                        }
                    } else if (resp.code == 401 || resp.code == 429) {
                        false
                    } else {
                        null
                    }
                }
            }.getOrNull()

            if (remoteVerified != null) return@withContext remoteVerified
            verifyOwnerCredentials(username, password)
        }

    fun updateOwnerEmailLocal(email: String) {
        prefs.edit().putString(AppConfig.KEY_OWNER_EMAIL, email.trim().lowercase()).apply()
    }

    suspend fun updateOwnerEmailOnServer(email: String): Boolean = withContext(Dispatchers.IO) {
        val cleanEmail = email.trim().lowercase()
        updateOwnerEmailLocal(cleanEmail)
        runCatching {
            val token = getSessionToken()
            val payload = JSONObject().put("email", cleanEmail)
            if (token.isNotEmpty()) payload.put("session_token", token)
            val req = Request.Builder()
                .url("${AppConfig.API_BASE_URL}auth.php?action=update_profile")
                .withOptionalBearerAuth()
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            httpClient.newCall(req).execute().use { resp ->
                if (resp.code == 401) {
                    clearLocalSessionOnUnauthorized()
                    return@use false
                }
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
            val token = getSessionToken()
            val payload = JSONObject().put("new_password", newPassword)
            if (token.isNotEmpty()) payload.put("session_token", token)
            val req = Request.Builder()
                .url("${AppConfig.API_BASE_URL}auth.php?action=change_password")
                .withOptionalBearerAuth()
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            httpClient.newCall(req).execute().use { resp ->
                if (resp.code == 401) {
                    clearLocalSessionOnUnauthorized()
                    return@use false
                }
                if (!resp.isSuccessful) return@use false
                val root = JSONObject(resp.body?.string().orEmpty())
                if (root.optBoolean("ok", false)) {
                    val rotatedToken = root.optJSONObject("data")?.optString("session_token", "").orEmpty()
                    if (rotatedToken.isNotBlank()) saveSessionToken(rotatedToken)
                    true
                } else {
                    false
                }
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
                    if (!resp.isSuccessful) return@use false
                    val root = JSONObject(resp.body?.string().orEmpty())
                    if (root.optBoolean("ok", false)) {
                        val token = root.optJSONObject("data")?.optString("session_token", "").orEmpty()
                        if (token.isNotBlank()) saveSessionToken(token)
                        true
                    } else {
                        false
                    }
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
                indMaFamilyColorHex = normalizeAndroidHex(obj.optString("indMaFamilyColorHex", "FF2962FF"), "FF2962FF"),
                indBandsFamilyColorHex = normalizeAndroidHex(obj.optString("indBandsFamilyColorHex", "FFA855F7"), "FFA855F7"),
                indLevelsFamilyColorHex = normalizeAndroidHex(obj.optString("indLevelsFamilyColorHex", "FFF59E0B"), "FFF59E0B"),
                indTrendFamilyColorHex = normalizeAndroidHex(obj.optString("indTrendFamilyColorHex", "FF14B8A6"), "FF14B8A6"),
                indSmcFamilyColorHex = normalizeAndroidHex(obj.optString("indSmcFamilyColorHex", "FFEC4899"), "FFEC4899"),
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
                twelveDataApiKey = loadByokField("twelveDataApiKey", obj.optString("twelveDataApiKey", "")),
                stooqApiKey = loadByokField("stooqApiKey", obj.optString("stooqApiKey", "")),
                alphaVantageApiKey = loadByokField("alphaVantageApiKey", obj.optString("alphaVantageApiKey", "")),
                finnhubApiKey = loadByokField("finnhubApiKey", obj.optString("finnhubApiKey", "")),
                timezoneMode = obj.optString("timezoneMode", "UTC").uppercase().let { if (it == "LOCAL") "LOCAL" else "UTC" }
            ).also { loaded ->
                // One-time migration: scrub any legacy BYOK keys out of synced KEY_CHART_PREFERENCES_JSON
                if (obj.has("twelveDataApiKey") || obj.has("stooqApiKey") ||
                    obj.has("alphaVantageApiKey") || obj.has("finnhubApiKey")
                ) {
                    saveLocalByokKeys(
                        twelveData = loaded.twelveDataApiKey,
                        stooq = loaded.stooqApiKey,
                        alphaVantage = loaded.alphaVantageApiKey,
                        finnhub = loaded.finnhubApiKey
                    )
                    saveChartPreferences(loaded)
                }
            }
        }.getOrDefault(ChartPreferences())
    }

    private fun loadByokField(field: String, legacyFallback: String = ""): String {
        val raw = prefs.getString(AppConfig.KEY_BYOK_LOCAL_JSON, null)
        if (!raw.isNullOrBlank()) {
            val v = runCatching { JSONObject(raw).optString(field, "") }.getOrDefault("")
            if (v.isNotBlank()) return v
        }
        return legacyFallback
    }

    fun saveLocalByokKeys(
        twelveData: String,
        stooq: String,
        alphaVantage: String,
        finnhub: String
    ): ChartPreferences {
        val localObj = JSONObject()
            .put("twelveDataApiKey", twelveData.trim())
            .put("stooqApiKey", stooq.trim())
            .put("alphaVantageApiKey", alphaVantage.trim())
            .put("finnhubApiKey", finnhub.trim())
        prefs.edit().putString(AppConfig.KEY_BYOK_LOCAL_JSON, localObj.toString()).apply()
        return loadChartPreferences()
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
        obj.put("indMaFamilyColorHex", prefsObj.indMaFamilyColorHex)
        obj.put("indBandsFamilyColorHex", prefsObj.indBandsFamilyColorHex)
        obj.put("indLevelsFamilyColorHex", prefsObj.indLevelsFamilyColorHex)
        obj.put("indTrendFamilyColorHex", prefsObj.indTrendFamilyColorHex)
        obj.put("indSmcFamilyColorHex", prefsObj.indSmcFamilyColorHex)
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
                        .replace(Regex("[^A-Z0-9._:-]"), "").take(20)
                    if (code.length < 2) continue
                    val inWatchlist = obj.optBoolean("inWatchlist", false)
                    val provider = ProviderId.fromId(obj.optString("activeProvider"))
                    val tf = obj.optString("timeframe", "M15").ifBlank { "M15" }
                    val customTitle = obj.optString("customTitle", "").take(64).takeIf { it.isNotBlank() }
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
                                    ProviderId.STOOQ,
                                    ProviderId.LOCAL_CSV
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
            val d1Fallback = if (symbol.timeframe.uppercase() !in setOf("D1", "W1")) {
                getCachedOrAggregatedCandles(symbol.symbolCode, symbol.activeProvider, "D1")
            } else {
                emptyList()
            }
            val latest = candles.lastOrNull()
            val stats = computeSessionStats(candles, symbol.symbolCode, d1Fallback)
            val stepMs = es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm.timeframeStepMillis(symbol.timeframe)
            val lastCloseMs = latest?.let { it.openTimeUtcMillis + stepMs } ?: 0L
            symbol.copy(
                lastClose = latest?.close,
                prevClose = stats.prevClose ?: latest?.open,
                dayOpen = stats.dayOpen,
                dayHigh = stats.dayHigh,
                dayLow = stats.dayLow,
                dayVolume = stats.dayVolume,
                lastCandleUtc = latest?.openTimeUtcIso,
                storedCandleCount = candles.size,
                lastCandleCloseMs = lastCloseMs
            )
        }
    }

    private data class SessionStatsResult(
        val dayOpen: BigDecimal?,
        val dayHigh: BigDecimal?,
        val dayLow: BigDecimal?,
        val dayVolume: BigDecimal?,
        val prevClose: BigDecimal?
    )

    private fun computeSessionStats(
        candles: List<CandleBar>,
        symbolCode: String,
        d1Fallback: List<CandleBar> = emptyList()
    ): SessionStatsResult {
        if (candles.isEmpty()) return SessionStatsResult(null, null, null, null, null)
        val latest = candles.last()
        val activeDayKey = es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm.getSessionDayKey(
            latest.openTimeUtcMillis,
            symbolCode
        )
        var dayOpen: BigDecimal? = null
        var dayHigh: BigDecimal? = null
        var dayLow: BigDecimal? = null
        var dayVol = BigDecimal.ZERO
        var priorSessionClose: BigDecimal? = null

        for (bar in candles) {
            val key = es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm.getSessionDayKey(
                bar.openTimeUtcMillis,
                symbolCode
            )
            if (key == activeDayKey) {
                if (dayOpen == null) dayOpen = bar.open
                if (dayHigh == null || bar.high > dayHigh) dayHigh = bar.high
                if (dayLow == null || bar.low < dayLow) dayLow = bar.low
                dayVol = dayVol.add(bar.volume)
            } else if (key < activeDayKey) {
                priorSessionClose = bar.close
            }
        }

        if (priorSessionClose == null && d1Fallback.isNotEmpty()) {
            for (dBar in d1Fallback) {
                val dKey = es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm.getSessionDayKey(
                    dBar.openTimeUtcMillis,
                    symbolCode
                )
                if (dKey < activeDayKey) {
                    priorSessionClose = dBar.close
                }
            }
        }

        val resolvedPrevClose = priorSessionClose
            ?: candles.getOrNull(candles.size - 2)?.close
            ?: latest.open

        return SessionStatsResult(
            dayOpen = dayOpen,
            dayHigh = dayHigh,
            dayLow = dayLow,
            dayVolume = dayVol,
            prevClose = resolvedPrevClose
        )
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
                val aggregatedFromM15 = TimeframeAggregatorAlgorithm.aggregateCandles(
                    sourceCandles = m15Candles,
                    targetTimeframe = normTf,
                    sourceTimeframe = "M15",
                    symbolCode = symbolCode
                )
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
                    val aggregatedFromH1 = TimeframeAggregatorAlgorithm.aggregateCandles(
                        sourceCandles = h1Candles,
                        targetTimeframe = "H4",
                        sourceTimeframe = "H1",
                        symbolCode = symbolCode
                    )
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
                val aggregated = TimeframeAggregatorAlgorithm.aggregateCandles(
                    sourceCandles = h4Candles,
                    targetTimeframe = "D1",
                    sourceTimeframe = "H4",
                    symbolCode = symbolCode
                )
                if (aggregated.isNotEmpty()) {
                    current = aggregated
                }
            } else {
                val h1Key = "${symbolCode}_${provider.id}_H1"
                val h1Candles = candleMemoryStore[h1Key] ?: loadCandlesFromPrefs(h1Key, "H1")
                if (h1Candles.isNotEmpty()) {
                    val aggregated = TimeframeAggregatorAlgorithm.aggregateCandles(
                        sourceCandles = h1Candles,
                        targetTimeframe = "D1",
                        sourceTimeframe = "H1",
                        symbolCode = symbolCode
                    )
                    if (aggregated.isNotEmpty()) {
                        current = aggregated
                    }
                } else {
                    val m15Key = "${symbolCode}_${provider.id}_M15"
                    val m15Candles = candleMemoryStore[m15Key] ?: loadCandlesFromPrefs(m15Key, "M15")
                    if (m15Candles.isNotEmpty()) {
                        val aggregated = TimeframeAggregatorAlgorithm.aggregateCandles(
                            sourceCandles = m15Candles,
                            targetTimeframe = "D1",
                            sourceTimeframe = "M15",
                            symbolCode = symbolCode
                        )
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
                val aggregated = TimeframeAggregatorAlgorithm.aggregateCandles(
                    sourceCandles = d1Candles,
                    targetTimeframe = "W1",
                    sourceTimeframe = "D1",
                    symbolCode = symbolCode
                )
                if (aggregated.isNotEmpty()) {
                    current = aggregated
                }
            } else {
                val h4Key = "${symbolCode}_${provider.id}_H4"
                val h4Candles = candleMemoryStore[h4Key] ?: loadCandlesFromPrefs(h4Key, "H4")
                if (h4Candles.isNotEmpty()) {
                    val aggregated = TimeframeAggregatorAlgorithm.aggregateCandles(
                        sourceCandles = h4Candles,
                        targetTimeframe = "W1",
                        sourceTimeframe = "H4",
                        symbolCode = symbolCode
                    )
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
                    adapter.fetchClosedCandlesUpToNow(
                        symbolCode = symbol.symbolCode,
                        timeframe = tf,
                        limit = configuredFetchLimit,
                        sinceOpenTimeMs = sinceOpenTimeMs
                    )
                }.fold(
                    onSuccess = { res -> existingTf to res },
                    onFailure = { err ->
                        existingTf to es.manico.chartintelligence.providers.ProviderSyncResult(
                            providerId = symbol.activeProvider,
                            symbolCode = symbol.symbolCode,
                            timeframe = tf,
                            candles = emptyList(),
                            syncedAtUtcIso = es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm.formatUtcIso(System.currentTimeMillis()),
                            syncMode = "SYNC_ERROR",
                            fetchedNewBars = 0,
                            fetchSucceeded = false,
                            errorMessage = err.message ?: "Sync failed"
                        )
                    }
                )
            }
        }

        val syncedByTf = HashMap<String, List<CandleBar>>()
        var effectiveSyncMode = "OFFLINE_CACHE"
        var effectiveFetchedNew = 0
        var effectiveFetchSucceeded = false
        var effectiveErrorMsg: String? = null
        val nowSyncMs = System.currentTimeMillis()
        for ((tf, job) in syncJobs) {
            val (existingTf, syncResult) = job.await()
            if (tf == effectiveTimeframe) {
                effectiveFetchSucceeded = syncResult.fetchSucceeded
                effectiveSyncMode = if (syncResult.fetchSucceeded) {
                    syncResult.syncMode
                } else {
                    if (existingTf.isNotEmpty()) "OFFLINE_CACHE" else "SYNC_ERROR"
                }
                effectiveFetchedNew = syncResult.fetchedNewBars
                effectiveErrorMsg = syncResult.errorMessage
            }
            val combined = if (syncResult.candles.isNotEmpty()) {
                CandleValidatorAlgorithm.mergeIdempotent(
                    existing = existingTf,
                    incoming = syncResult.candles,
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
        val d1Bars = syncedByTf["D1"]
            ?: candleMemoryStore["${symbol.symbolCode}_${symbol.activeProvider.id}_D1"]
            ?: emptyList()

        val merged = syncedByTf[effectiveTimeframe].orEmpty()
        val missingTdKey = symbol.activeProvider == ProviderId.TWELVE_DATA &&
            loadChartPreferences().twelveDataApiKey.isBlank() &&
            merged.isEmpty()

        val connectionStatus = when {
            !effectiveFetchSucceeded && merged.isEmpty() -> es.manico.chartintelligence.algorithms.ConnectionStatus.SYNC_ERROR
            !effectiveFetchSucceeded -> es.manico.chartintelligence.algorithms.ConnectionStatus.CACHED_OFFLINE
            es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm.isOtcWeekendClosed(nowSyncMs, symbol.symbolCode) ->
                es.manico.chartintelligence.algorithms.ConnectionStatus.MARKET_CLOSED
            else -> es.manico.chartintelligence.algorithms.ConnectionStatus.CONNECTED_LIVE
        }
        val nextProviderStatus = when {
            missingTdKey -> "API_KEY_REQUIRED"
            !effectiveFetchSucceeded && merged.isEmpty() -> "SYNC_ERROR"
            !effectiveFetchSucceeded -> "OFFLINE_CACHE"
            else -> "READY"
        }
        // Use the most recent intraday M15 bar for watchlist lastClose if effectiveTimeframe is D1
        val latestForQuote = if (effectiveTimeframe == "D1" && m15Bars.isNotEmpty()) {
            m15Bars.lastOrNull() ?: merged.lastOrNull()
        } else {
            merged.lastOrNull()
        }
        val quoteSeries = if (m15Bars.isNotEmpty() && effectiveTimeframe == "D1") m15Bars else merged
        val stats = computeSessionStats(quoteSeries, symbol.symbolCode, d1Bars)
        val stepMs = es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm.timeframeStepMillis(effectiveTimeframe)
        val lastCandleCloseMs = merged.lastOrNull()?.let { it.openTimeUtcMillis + stepMs } ?: 0L

        val gapReport = if (merged.size >= 2) {
            es.manico.chartintelligence.algorithms.GapDetectorAlgorithm.detectGaps(
                candles = merged,
                timeframe = effectiveTimeframe,
                symbolCode = symbol.symbolCode
            )
        } else {
            symbol.gapSummary
        }

        val updatedSymbol = symbol.copy(
            timeframe = effectiveTimeframe,
            lastClose = latestForQuote?.close,
            prevClose = stats.prevClose ?: latestForQuote?.open,
            dayOpen = stats.dayOpen,
            dayHigh = stats.dayHigh,
            dayLow = stats.dayLow,
            dayVolume = stats.dayVolume,
            lastCandleUtc = merged.lastOrNull()?.openTimeUtcIso ?: latestForQuote?.openTimeUtcIso,
            storedCandleCount = merged.size,
            lastSyncMode = effectiveSyncMode,
            fetchedNewBars = effectiveFetchedNew,
            isSyncing = false,
            syncErrorText = when {
                missingTdKey -> "ERR_API_KEY_REQUIRED"
                !effectiveFetchSucceeded -> effectiveErrorMsg ?: "ERR_SYNC_OFFLINE"
                merged.isEmpty() -> "ERR_NO_REAL_DATA"
                else -> null
            },
            providerStatus = nextProviderStatus,
            lastSuccessfulFetchMs = if (effectiveFetchSucceeded) nowSyncMs else symbol.lastSuccessfulFetchMs,
            lastCandleCloseMs = lastCandleCloseMs,
            connectionStatus = connectionStatus,
            gapSummary = gapReport
        )
        updatedSymbol to merged
    }

    suspend fun fetchLiveQuote(
        symbolCode: String,
        provider: ProviderId,
        timeframe: String
    ): LiveQuoteResult? = withContext(Dispatchers.IO) {
        runCatching {
            val cleanSym = java.net.URLEncoder.encode(symbolCode.trim().uppercase(), "UTF-8")
            val cleanProv = java.net.URLEncoder.encode(provider.id, "UTF-8")
            val cleanTf = java.net.URLEncoder.encode(timeframe.uppercase(), "UTF-8")
            val req = Request.Builder()
                .url("${AppConfig.API_BASE_URL}quote.php?symbol=$cleanSym&provider=$cleanProv&timeframe=$cleanTf")
                .withOptionalBearerAuth()
                .get()
                .build()
            httpClient.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@use null
                val root = JSONObject(resp.body?.string().orEmpty())
                if (!root.optBoolean("ok", false)) return@use null
                val data = root.optJSONObject("data") ?: return@use null
                val priceNum = data.optDouble("price", Double.NaN)
                if (!priceNum.isFinite() || priceNum <= 0.0) return@use null
                val mode = data.optString("mode", "LAST_CLOSED_FALLBACK")
                val updatedAt = data.optString("updated_at_utc", "")
                val fObj = data.optJSONObject("forming_bar")
                val formingBar = if (fObj != null) {
                    val fOpen = fObj.optDouble("open", Double.NaN)
                    val fHigh = fObj.optDouble("high", Double.NaN)
                    val fLow = fObj.optDouble("low", Double.NaN)
                    val fClose = fObj.optDouble("close", Double.NaN)
                    val fTime = fObj.optLong("open_time_utc_ms", 0L)
                    if (fOpen.isFinite() && fHigh.isFinite() && fLow.isFinite() && fClose.isFinite() && fTime > 0L) {
                        CandleValidatorAlgorithm.sanitizeAndValidate(
                            rawOpenTimeMillis = fTime,
                            timeframe = timeframe,
                            open = BigDecimal.valueOf(fOpen),
                            high = BigDecimal.valueOf(fHigh),
                            low = BigDecimal.valueOf(fLow),
                            close = BigDecimal.valueOf(fClose),
                            volume = BigDecimal.valueOf(fObj.optDouble("volume", 0.0).coerceAtLeast(0.0))
                        )
                    } else null
                } else null
                LiveQuoteResult(
                    price = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal.valueOf(priceNum)),
                    mode = mode,
                    updatedAtUtc = updatedAt,
                    formingBar = formingBar
                )
            }
        }.getOrNull()
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

            val rawType = obj.optString("type").lowercase()
            when (rawType) {
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
                else -> {
                    val toolType = DrawingTool.fromId(rawType)
                    if (toolType.isPhase2MultiAnchor) {
                        val anchorsArr = obj.optJSONArray("anchors")
                        val parsedAnchors = ArrayList<DrawingAnchor>()
                        if (anchorsArr != null) {
                            for (ai in 0 until anchorsArr.length()) {
                                val aObj = anchorsArr.optJSONObject(ai) ?: continue
                                parsedAnchors.add(
                                    DrawingAnchor(
                                        timeUtcMillis = aObj.optLong("timeUtcMillis", aObj.optLong("t", 0L)),
                                        price = CandleValidatorAlgorithm.normalizeDecimal(
                                            BigDecimal(aObj.optString("price", aObj.optString("p", "0")))
                                        )
                                    )
                                )
                            }
                        }
                        if (parsedAnchors.isNotEmpty()) {
                            list.add(
                                ChartDrawing.MultiAnchor(
                                    id = id,
                                    toolType = toolType,
                                    anchors = parsedAnchors,
                                    variant = obj.optString("variant", "original"),
                                    colorHex = colorHex,
                                    strokeWidthDp = strokeWidthDp
                                )
                            )
                        }
                    }
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
                is ChartDrawing.MultiAnchor -> {
                    obj.put("type", d.toolType.id)
                    obj.put("variant", d.variant)
                    val aArr = JSONArray()
                    for (a in d.anchors) {
                        aArr.put(
                            JSONObject()
                                .put("timeUtcMillis", a.timeUtcMillis)
                                .put("price", a.price.toPlainString())
                        )
                    }
                    obj.put("anchors", aArr)
                }
            }
            arr.put(obj)
        }
        return arr
    }

    fun loadDrawingsForChart(chartId: String, legacyFallbackId: String? = null): List<ChartDrawing> {
        val inMem = drawingsMemoryStore[chartId]
        if (inMem != null) return inMem
        val raw = prefs.getString("${AppConfig.KEY_DRAWINGS_CACHE_PREFIX}$chartId", null)
        if (raw != null) {
            val parsed = runCatching {
                parseDrawingsArray(JSONArray(raw))
            }.getOrDefault(emptyList())
            drawingsMemoryStore[chartId] = parsed
            return parsed
        }
        if (!legacyFallbackId.isNullOrBlank() && legacyFallbackId != chartId) {
            val legacyRaw = prefs.getString("${AppConfig.KEY_DRAWINGS_CACHE_PREFIX}$legacyFallbackId", null)
            if (legacyRaw != null) {
                val parsed = runCatching {
                    parseDrawingsArray(JSONArray(legacyRaw))
                }.getOrDefault(emptyList())
                drawingsMemoryStore[chartId] = parsed
                return parsed
            }
        }
        return emptyList()
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
                    ProviderId.EIA_BRENT_SPOT,
                    ProviderId.LOCAL_CSV
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
                    ProviderId.STOOQ,
                    ProviderId.LOCAL_CSV
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
        val allKeys = buildSet {
            addAll(chartIds)
            for (prefKey in prefs.all.keys) {
                if (prefKey.startsWith(AppConfig.KEY_DRAWINGS_CACHE_PREFIX)) {
                    add(prefKey.removePrefix(AppConfig.KEY_DRAWINGS_CACHE_PREFIX))
                }
            }
        }
        for (cId in allKeys) {
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
                            val phpObj = data.optJSONObject("php_runtime")
                            val phpSummary = if (phpObj != null) {
                                val pv = phpObj.optString("php_version", "")
                                val mem = phpObj.optString("memory_limit", "")
                                val extObj = phpObj.optJSONObject("extensions")
                                val exts = listOf("pdo_mysql", "curl", "openssl", "mbstring", "json")
                                    .filter { extObj?.optBoolean(it, false) == true }
                                    .joinToString(",")
                                "PHP $pv · mem $mem · ext[$exts]".trim()
                            } else ""
                            SystemStatusDto(
                                isHealthy = data.optString("status") == "healthy",
                                version = data.optString("version", "1.41.0"),
                                serverTimeUtc = data.optString("server_time_utc", ""),
                                dbConnected = isDbConn,
                                dbVersion = dbVer,
                                totalCandles = data.optLong("total_candles", 0L),
                                registeredOwner = data.optBoolean("registered_owner", false),
                                phpRuntimeSummary = phpSummary
                            )
                        } else null
                    } else null
                }
            }.getOrNull()
            if (res != null) return@withContext res
        }
        SystemStatusDto(
            isHealthy = false,
            version = "1.41.0",
            serverTimeUtc = "Offline",
            dbConnected = false,
            dbVersion = "Offline (Local Cache)",
            totalCandles = 0L,
            registeredOwner = isOwnerAccountRegistered(),
            phpRuntimeSummary = ""
        )
    }

    fun loadActiveTabId(): String? {
        return prefs.getString(AppConfig.KEY_ACTIVE_TAB_ID, null)?.takeIf { it.isNotBlank() }
    }

    fun saveActiveTabId(tabId: String?) {
        val clean = tabId?.takeIf { it.isNotBlank() }
        if (clean == null) {
            prefs.edit().remove(AppConfig.KEY_ACTIVE_TAB_ID).apply()
        } else {
            prefs.edit().putString(AppConfig.KEY_ACTIVE_TAB_ID, clean).apply()
        }
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
                val canonicalChartId = es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm.canonicalChartKey(symCode, tf)
                val legacyChartId = def?.chartId ?: es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm.legacyChartId(symCode)
                val tabId = obj.optString("tabId", "tab_${symCode}_${tf}_$i")
                val rawChartType = obj.optString("chartType", "candlestick")
                val parsedChartType = ChartType.entries.find { it.name.equals(rawChartType, ignoreCase = true) } ?: ChartType.CANDLESTICK
                val hydratedCandles = getCachedOrAggregatedCandles(symCode, provId, tf)
                val stepMs = es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm.timeframeStepMillis(tf)
                val lastCloseMs = hydratedCandles.lastOrNull()?.let { it.openTimeUtcMillis + stepMs } ?: 0L
                list.add(
                    ChartTabState(
                        tabId = tabId,
                        chartId = canonicalChartId,
                        symbolCode = symCode,
                        decimals = obj.optInt("decimals", def?.decimals ?: 2),
                        provider = provId,
                        timeframe = tf,
                        chartType = parsedChartType,
                        candles = hydratedCandles,
                        visibleCandleCount = obj.optInt("visibleCount", AppConfig.DEFAULT_VISIBLE_CANDLES).coerceIn(AppConfig.MIN_VISIBLE_CANDLES, AppConfig.MAX_VISIBLE_CANDLES),
                        scrollOffsetFromRight = obj.optInt("scrollOffset", 0),
                        showVolume = obj.optBoolean("showVolume", true),
                        volumePaneRatio = obj.optDouble("volumePaneRatio", 0.22).toFloat().coerceIn(0.12f, 0.35f),
                        showSma20 = obj.optBoolean("showSma20", false),
                        showSma50 = obj.optBoolean("showSma50", false),
                        showSma200 = obj.optBoolean("showSma200", false),
                        showEma20 = obj.optBoolean("showEma20", false),
                        showEma50 = obj.optBoolean("showEma50", false),
                        showEma200 = obj.optBoolean("showEma200", false),
                        showBollinger = obj.optBoolean("showBollinger", false),
                        showSupertrend = obj.optBoolean("showSupertrend", false),
                        showVwap = obj.optBoolean("showVwap", false),
                        showPsar = obj.optBoolean("showPsar", false),
                        showIchimoku = obj.optBoolean("showIchimoku", false),
                        showKeltner = obj.optBoolean("showKeltner", false),
                        showDonchian = obj.optBoolean("showDonchian", false),
                        showMtfEma = obj.optBoolean("showMtfEma", false),
                        showKillzones = obj.optBoolean("showKillzones", false),
                        showRsi14 = obj.optBoolean("showRsi14", false),
                        showMacd = obj.optBoolean("showMacd", false),
                        showOverlayMacd = obj.optBoolean("showOverlayMacd", false),
                        showAtr14 = obj.optBoolean("showAtr14", false),
                        showAdx14 = obj.optBoolean("showAdx14", false),
                        showStoch14 = obj.optBoolean("showStoch14", false),
                        showCci20 = obj.optBoolean("showCci20", false),
                        showWillR14 = obj.optBoolean("showWillR14", false),
                        showObv = obj.optBoolean("showObv", false),
                        showCmf20 = obj.optBoolean("showCmf20", false),
                        showRoc12 = obj.optBoolean("showRoc12", false),
                        showSmcStructure = obj.optBoolean("showSmcStructure", false),
                        showFvg = obj.optBoolean("showFvg", false),
                        showVolumeProfile = obj.optBoolean("showVolumeProfile", false),
                        showPivotPoints = obj.optBoolean("showPivotPoints", false),
                        pivotType = obj.optString("pivotType", "STANDARD").uppercase(),
                        showFutureProjection = obj.optBoolean("showFutureProjection", false),
                        pitchforkVariant = obj.optString("pitchforkVariant", "original"),
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
                        drawings = loadDrawingsForChart(canonicalChartId, legacyChartId),
                        lastCandleCloseMs = lastCloseMs,
                        sessionPrevClose = def?.prevClose
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
                .put("volumePaneRatio", t.volumePaneRatio.toDouble())
                .put("showSma20", t.showSma20)
                .put("showSma50", t.showSma50)
                .put("showSma200", t.showSma200)
                .put("showEma20", t.showEma20)
                .put("showEma50", t.showEma50)
                .put("showEma200", t.showEma200)
                .put("showBollinger", t.showBollinger)
                .put("showSupertrend", t.showSupertrend)
                .put("showVwap", t.showVwap)
                .put("showPsar", t.showPsar)
                .put("showIchimoku", t.showIchimoku)
                .put("showKeltner", t.showKeltner)
                .put("showDonchian", t.showDonchian)
                .put("showMtfEma", t.showMtfEma)
                .put("showKillzones", t.showKillzones)
                .put("showRsi14", t.showRsi14)
                .put("showMacd", t.showMacd)
                .put("showOverlayMacd", t.showOverlayMacd)
                .put("showAtr14", t.showAtr14)
                .put("showAdx14", t.showAdx14)
                .put("showStoch14", t.showStoch14)
                .put("showCci20", t.showCci20)
                .put("showWillR14", t.showWillR14)
                .put("showObv", t.showObv)
                .put("showCmf20", t.showCmf20)
                .put("showRoc12", t.showRoc12)
                .put("showSmcStructure", t.showSmcStructure)
                .put("showFvg", t.showFvg)
                .put("showVolumeProfile", t.showVolumeProfile)
                .put("showPivotPoints", t.showPivotPoints)
                .put("pivotType", t.pivotType)
                .put("showFutureProjection", t.showFutureProjection)
                .put("pitchforkVariant", t.pitchforkVariant)
                .put("isLogScale", t.isLogScale)
                .put("activeDrawingColorHex", t.activeDrawingColorHex)
                .put("activeDrawingWidthDp", t.activeDrawingWidthDp.toDouble())
                .put("isMagnetMode", t.isMagnetMode)
            arr.put(obj)
        }
        prefs.edit().putString(AppConfig.KEY_OPEN_TABS_JSON, arr.toString()).apply()
    }

    fun getHttpClient(): OkHttpClient = httpClient

    fun buildWorkspaceJson(
        symbols: List<SymbolConfig>,
        preferences: ChartPreferences,
        drawingsMap: Map<String, List<ChartDrawing>>,
        openTabs: List<ChartTabState> = emptyList()
    ): JSONObject {
        val drawingsObj = JSONObject()
        val symbolByChartId = symbols.associateBy { it.chartId }
        for ((chartId, dList) in drawingsMap) {
            val arr = serializeDrawingsArray(dList)
            val sym = symbolByChartId[chartId]
            if (sym != null) {
                drawingsObj.put(
                    es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm.canonicalChartKey(sym.symbolCode, sym.timeframe),
                    arr
                )
                drawingsObj.put(chartId, arr)
            } else {
                drawingsObj.put(chartId, arr)
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
            .put("indMaFamilyColorHex", preferences.indMaFamilyColorHex)
            .put("indBandsFamilyColorHex", preferences.indBandsFamilyColorHex)
            .put("indLevelsFamilyColorHex", preferences.indLevelsFamilyColorHex)
            .put("indTrendFamilyColorHex", preferences.indTrendFamilyColorHex)
            .put("indSmcFamilyColorHex", preferences.indSmcFamilyColorHex)
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
            .put("timezoneMode", preferences.timezoneMode)

        val refTab = openTabs.firstOrNull { it.tabId == loadActiveTabId() } ?: openTabs.firstOrNull()
        if (refTab != null) {
            prefsObj
                .put("showVolume", refTab.showVolume)
                .put("volumePaneRatio", refTab.volumePaneRatio.toDouble())
                .put("showSma20", refTab.showSma20)
                .put("showSma50", refTab.showSma50)
                .put("showSma200", refTab.showSma200)
                .put("showEma20", refTab.showEma20)
                .put("showEma50", refTab.showEma50)
                .put("showEma200", refTab.showEma200)
                .put("showBollinger", refTab.showBollinger)
                .put("showSupertrend", refTab.showSupertrend)
                .put("showVwap", refTab.showVwap)
                .put("showPsar", refTab.showPsar)
                .put("showIchimoku", refTab.showIchimoku)
                .put("showKeltner", refTab.showKeltner)
                .put("showDonchian", refTab.showDonchian)
                .put("showMtfEma", refTab.showMtfEma)
                .put("showKillzones", refTab.showKillzones)
                .put("showRsi14", refTab.showRsi14)
                .put("showMacd", refTab.showMacd)
                .put("showOverlayMacd", refTab.showOverlayMacd)
                .put("showAtr14", refTab.showAtr14)
                .put("showAdx14", refTab.showAdx14)
                .put("showStoch14", refTab.showStoch14)
                .put("showCci20", refTab.showCci20)
                .put("showWillR14", refTab.showWillR14)
                .put("showObv", refTab.showObv)
                .put("showCmf20", refTab.showCmf20)
                .put("showRoc12", refTab.showRoc12)
                .put("showSmcStructure", refTab.showSmcStructure)
                .put("showFvg", refTab.showFvg)
                .put("showVolumeProfile", refTab.showVolumeProfile)
                .put("showPivotPoints", refTab.showPivotPoints)
                .put("pivotType", refTab.pivotType)
                .put("showFutureProjection", refTab.showFutureProjection)
                .put("pitchforkVariant", refTab.pitchforkVariant)
        }

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
                .put("volumePaneRatio", t.volumePaneRatio.toDouble())
                .put("showSma20", t.showSma20)
                .put("showSma50", t.showSma50)
                .put("showSma200", t.showSma200)
                .put("showEma20", t.showEma20)
                .put("showEma50", t.showEma50)
                .put("showEma200", t.showEma200)
                .put("showBollinger", t.showBollinger)
                .put("showSupertrend", t.showSupertrend)
                .put("showVwap", t.showVwap)
                .put("showPsar", t.showPsar)
                .put("showIchimoku", t.showIchimoku)
                .put("showKeltner", t.showKeltner)
                .put("showDonchian", t.showDonchian)
                .put("showMtfEma", t.showMtfEma)
                .put("showKillzones", t.showKillzones)
                .put("showRsi14", t.showRsi14)
                .put("showMacd", t.showMacd)
                .put("showOverlayMacd", t.showOverlayMacd)
                .put("showAtr14", t.showAtr14)
                .put("showAdx14", t.showAdx14)
                .put("showStoch14", t.showStoch14)
                .put("showCci20", t.showCci20)
                .put("showWillR14", t.showWillR14)
                .put("showObv", t.showObv)
                .put("showCmf20", t.showCmf20)
                .put("showRoc12", t.showRoc12)
                .put("showSmcStructure", t.showSmcStructure)
                .put("showFvg", t.showFvg)
                .put("showVolumeProfile", t.showVolumeProfile)
                .put("showPivotPoints", t.showPivotPoints)
                .put("pivotType", t.pivotType)
                .put("showFutureProjection", t.showFutureProjection)
                .put("pitchforkVariant", t.pitchforkVariant)
                .put("isLogScale", t.isLogScale)
                .put("activeDrawingColorHex", t.activeDrawingColorHex)
                .put("activeDrawingWidthDp", t.activeDrawingWidthDp.toDouble())
                .put("activeDrawingWidthPx", t.activeDrawingWidthDp.toDouble())
                .put("isMagnetMode", t.isMagnetMode)
            tabsArr.put(tObj)
        }

        val openTabsObj = JSONObject()
            .put("lastOpenedSymbolCode", loadLastOpenedSymbolCode() ?: "SPOTBRENT")
            .put("activeTabId", loadActiveTabId() ?: openTabs.firstOrNull()?.tabId.orEmpty())
            .put("tabs", tabsArr)

        return JSONObject()
            .put("drawings", drawingsObj)
            .put("symbols", symbolsArr)
            .put("preferences", prefsObj)
            .put("open_tabs", openTabsObj)
    }

    suspend fun syncWorkspaceToCloud(
        symbols: List<SymbolConfig>,
        preferences: ChartPreferences,
        drawingsMap: Map<String, List<ChartDrawing>>,
        openTabs: List<ChartTabState> = emptyList()
    ): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            if (openTabs.isNotEmpty()) {
                saveOpenTabsToPrefs(openTabs)
            }
            val workspaceData = buildWorkspaceJson(symbols, preferences, drawingsMap, openTabs)
            val token = getSessionToken()
            val payload = JSONObject().put("workspace", workspaceData)
            if (token.isNotEmpty()) payload.put("session_token", token)
            val req = Request.Builder()
                .url("${AppConfig.API_BASE_URL}workspace_sync.php")
                .withOptionalBearerAuth()
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()

            httpClient.newCall(req).execute().use { resp ->
                if (resp.code == 401) {
                    clearLocalSessionOnUnauthorized()
                    return@use false
                }
                resp.isSuccessful && JSONObject(resp.body?.string().orEmpty()).optBoolean("ok", false)
            }
        }.getOrDefault(false)
    }

    suspend fun fetchCloudWorkspace(): JSONObject? = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder()
                .url("${AppConfig.API_BASE_URL}workspace_sync.php")
                .withOptionalBearerAuth()
                .get()
                .build()
            httpClient.newCall(req).execute().use { resp ->
                if (resp.code == 401) {
                    clearLocalSessionOnUnauthorized()
                    return@use null
                }
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
                    indMaFamilyColorHex = normalizeAndroidHex(
                        prefsJson.optString("indMaFamilyColorHex", ""),
                        cur.indMaFamilyColorHex
                    ),
                    indBandsFamilyColorHex = normalizeAndroidHex(
                        prefsJson.optString("indBandsFamilyColorHex", ""),
                        cur.indBandsFamilyColorHex
                    ),
                    indLevelsFamilyColorHex = normalizeAndroidHex(
                        prefsJson.optString("indLevelsFamilyColorHex", ""),
                        cur.indLevelsFamilyColorHex
                    ),
                    indTrendFamilyColorHex = normalizeAndroidHex(
                        prefsJson.optString("indTrendFamilyColorHex", ""),
                        cur.indTrendFamilyColorHex
                    ),
                    indSmcFamilyColorHex = normalizeAndroidHex(
                        prefsJson.optString("indSmcFamilyColorHex", ""),
                        cur.indSmcFamilyColorHex
                    ),
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

            // 3. Drawings (stores directly under canonical SYMBOL_TF key and maps legacy chartId keys)
            val drawingsObj = workspaceObj.optJSONObject("drawings")
            if (drawingsObj != null) {
                val keys = drawingsObj.keys()
                while (keys.hasNext()) {
                    val rawKey = keys.next()
                    val arr = drawingsObj.optJSONArray(rawKey) ?: continue
                    val parsedDrawings = parseDrawingsArray(arr)
                    if (parsedDrawings.isEmpty()) continue
                    saveDrawingsForChart(rawKey, parsedDrawings)
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
                val activeIdFromCloud = openTabsObj.optString("activeTabId", "").trim()
                if (activeIdFromCloud.isNotEmpty()) {
                    saveActiveTabId(activeIdFromCloud)
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
                    val canonicalChartId = es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm.canonicalChartKey(symCode, tf)
                    val legacyChartId = def?.chartId ?: es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm.legacyChartId(symCode)
                    val tabId = obj.optString("tabId", "tab_${symCode}_${tf}_$i")
                    val rawChartType = obj.optString("chartType", "candlestick")
                    val parsedChartType = ChartType.entries.find { it.name.equals(rawChartType, ignoreCase = true) } ?: ChartType.CANDLESTICK
                    val hydratedCandles = getCachedOrAggregatedCandles(symCode, provId, tf)
                    parsedTabs.add(
                        ChartTabState(
                            tabId = tabId,
                            chartId = canonicalChartId,
                            symbolCode = symCode,
                            decimals = obj.optInt("decimals", def?.decimals ?: 2),
                            provider = provId,
                            timeframe = tf,
                            chartType = parsedChartType,
                            candles = hydratedCandles,
                            visibleCandleCount = obj.optInt("visibleCount", AppConfig.DEFAULT_VISIBLE_CANDLES).coerceIn(AppConfig.MIN_VISIBLE_CANDLES, AppConfig.MAX_VISIBLE_CANDLES),
                            scrollOffsetFromRight = obj.optInt("scrollOffset", 0),
                            showVolume = obj.optBoolean("showVolume", prefsJson?.optBoolean("showVolume", true) ?: true),
                            volumePaneRatio = obj.optDouble(
                                "volumePaneRatio",
                                prefsJson?.optDouble("volumePaneRatio", 0.22) ?: 0.22
                            ).toFloat().coerceIn(0.12f, 0.35f),
                            showSma20 = obj.optBoolean("showSma20", prefsJson?.optBoolean("showSma20", false) ?: false),
                            showSma50 = obj.optBoolean("showSma50", prefsJson?.optBoolean("showSma50", false) ?: false),
                            showSma200 = obj.optBoolean("showSma200", prefsJson?.optBoolean("showSma200", false) ?: false),
                            showEma20 = obj.optBoolean("showEma20", prefsJson?.optBoolean("showEma20", false) ?: false),
                            showEma50 = obj.optBoolean("showEma50", prefsJson?.optBoolean("showEma50", false) ?: false),
                            showEma200 = obj.optBoolean("showEma200", prefsJson?.optBoolean("showEma200", false) ?: false),
                            showBollinger = obj.optBoolean("showBollinger", prefsJson?.optBoolean("showBollinger", false) ?: false),
                            showSupertrend = obj.optBoolean("showSupertrend", prefsJson?.optBoolean("showSupertrend", false) ?: false),
                            showVwap = obj.optBoolean("showVwap", prefsJson?.optBoolean("showVwap", false) ?: false),
                            showPsar = obj.optBoolean("showPsar", prefsJson?.optBoolean("showPsar", false) ?: false),
                            showIchimoku = obj.optBoolean("showIchimoku", prefsJson?.optBoolean("showIchimoku", false) ?: false),
                            showKeltner = obj.optBoolean("showKeltner", prefsJson?.optBoolean("showKeltner", false) ?: false),
                            showDonchian = obj.optBoolean("showDonchian", prefsJson?.optBoolean("showDonchian", false) ?: false),
                            showMtfEma = obj.optBoolean("showMtfEma", prefsJson?.optBoolean("showMtfEma", false) ?: false),
                            showKillzones = obj.optBoolean("showKillzones", prefsJson?.optBoolean("showKillzones", false) ?: false),
                            showRsi14 = obj.optBoolean("showRsi14", prefsJson?.optBoolean("showRsi14", false) ?: false),
                            showMacd = obj.optBoolean("showMacd", prefsJson?.optBoolean("showMacd", false) ?: false),
                            showOverlayMacd = obj.optBoolean("showOverlayMacd", prefsJson?.optBoolean("showOverlayMacd", false) ?: false),
                            showAtr14 = obj.optBoolean("showAtr14", prefsJson?.optBoolean("showAtr14", false) ?: false),
                            showAdx14 = obj.optBoolean("showAdx14", prefsJson?.optBoolean("showAdx14", false) ?: false),
                            showStoch14 = obj.optBoolean("showStoch14", prefsJson?.optBoolean("showStoch14", false) ?: false),
                            showCci20 = obj.optBoolean("showCci20", prefsJson?.optBoolean("showCci20", false) ?: false),
                            showWillR14 = obj.optBoolean("showWillR14", prefsJson?.optBoolean("showWillR14", false) ?: false),
                            showObv = obj.optBoolean("showObv", prefsJson?.optBoolean("showObv", false) ?: false),
                            showCmf20 = obj.optBoolean("showCmf20", prefsJson?.optBoolean("showCmf20", false) ?: false),
                            showRoc12 = obj.optBoolean("showRoc12", prefsJson?.optBoolean("showRoc12", false) ?: false),
                            showSmcStructure = obj.optBoolean("showSmcStructure", prefsJson?.optBoolean("showSmcStructure", false) ?: false),
                            showFvg = obj.optBoolean("showFvg", prefsJson?.optBoolean("showFvg", false) ?: false),
                            showVolumeProfile = obj.optBoolean("showVolumeProfile", prefsJson?.optBoolean("showVolumeProfile", false) ?: false),
                            showPivotPoints = obj.optBoolean("showPivotPoints", prefsJson?.optBoolean("showPivotPoints", false) ?: false),
                            pivotType = obj.optString("pivotType", prefsJson?.optString("pivotType", "STANDARD") ?: "STANDARD").uppercase(),
                            showFutureProjection = obj.optBoolean("showFutureProjection", prefsJson?.optBoolean("showFutureProjection", false) ?: false),
                            pitchforkVariant = obj.optString("pitchforkVariant", prefsJson?.optString("pitchforkVariant", "original") ?: "original"),
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
                            drawings = loadDrawingsForChart(canonicalChartId, legacyChartId),
                            sessionPrevClose = def?.prevClose
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

    suspend fun importHistoricalCandlesToLocalAndServer(
        symbolCode: String,
        providerId: String,
        timeframe: String,
        qualityStatus: String,
        rawBytes: ByteArray,
        fileName: String,
        mimeType: String = ""
    ): HistoricalImportResult = withContext(Dispatchers.IO) {
        val cleanSym = symbolCode.trim().uppercase()
        val prov = ProviderId.fromId(providerId)
        val parsed = CandleImportAlgorithm.parseHistoricalBytes(
            bytes = rawBytes,
            fileName = fileName,
            requestedTf = timeframe,
            mimeType = mimeType
        )
        if (!parsed.ok || parsed.candles.isEmpty()) {
            return@withContext HistoricalImportResult(
                ok = false,
                effectiveTimeframe = parsed.effectiveTimeframe,
                importedCount = 0,
                rowsInserted = 0,
                rowsCorrected = 0,
                forcedDailyOnly = parsed.forcedDailyOnly,
                serverSynced = false,
                errorMessage = parsed.errorCode ?: "PARSE_FAILED"
            )
        }

        val effTf = parsed.effectiveTimeframe
        val tfKey = "${cleanSym}_${prov.id}_$effTf"
        val configuredLimit = loadChartPreferences().candleFetchLimit.coerceIn(500, 5000)
        val existing = candleMemoryStore[tfKey] ?: loadCandlesFromPrefs(tfKey, effTf)
        val merged = CandleValidatorAlgorithm.mergeIdempotent(
            existing = existing,
            incoming = parsed.candles,
            timeframe = effTf
        ).takeLast(configuredLimit)
        candleMemoryStore[tfKey] = merged
        saveCandlesToPrefs(tfKey, merged, configuredLimit)

        var serverSynced = false
        var rowsInserted = parsed.candles.size
        var rowsCorrected = 0
        var finalCandles = merged
        val token = getSessionToken()
        if (token.isNotBlank()) {
            runCatching {
                val payload = JSONObject().apply {
                    put("session_token", token)
                    put("action", "import")
                    put("symbol", cleanSym)
                    put("provider", prov.id)
                    put("timeframe", effTf)
                    put("quality_status", qualityStatus)
                    put("file_name", fileName)
                    put("mime_type", mimeType)
                    put("file_base64", Base64.getEncoder().encodeToString(rawBytes))
                }
                val req = Request.Builder()
                    .url("${AppConfig.API_BASE_URL}import_candles.php")
                    .header("Authorization", "Bearer $token")
                    .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                    .build()
                httpClient.newCall(req).execute().use { resp ->
                    if (resp.isSuccessful) {
                        val root = JSONObject(resp.body?.string().orEmpty())
                        if (root.optBoolean("ok", false)) {
                            serverSynced = true
                            val data = root.optJSONObject("data")
                            val batch = data?.optJSONObject("batch")
                            if (batch != null) {
                                rowsInserted = batch.optInt("rows_inserted", rowsInserted)
                                rowsCorrected = batch.optInt("rows_corrected", 0)
                            }
                        }
                    }
                }
            }
        }

        HistoricalImportResult(
            ok = true,
            effectiveTimeframe = effTf,
            importedCount = parsed.candles.size,
            rowsInserted = rowsInserted,
            rowsCorrected = rowsCorrected,
            forcedDailyOnly = parsed.forcedDailyOnly,
            serverSynced = serverSynced,
            candles = finalCandles
        )
    }

    suspend fun importManualCandleToLocalAndServer(
        symbolCode: String,
        providerId: String,
        timeframe: String,
        qualityStatus: String,
        dateTimeInput: String,
        open: Double,
        high: Double,
        low: Double,
        close: Double,
        volume: Double
    ): HistoricalImportResult = withContext(Dispatchers.IO) {
        val cleanSym = symbolCode.trim().uppercase()
        val prov = ProviderId.fromId(providerId)
        val effTf = timeframe.trim().uppercase().let {
            if (it in AppConfig.SUPPORTED_TIMEFRAMES) it else "D1"
        }
        val candle = CandleImportAlgorithm.buildManualCandle(
            dateTimeInput = dateTimeInput,
            open = open,
            high = high,
            low = low,
            close = close,
            volume = volume,
            timeframe = effTf
        ) ?: return@withContext HistoricalImportResult(
            ok = false,
            effectiveTimeframe = effTf,
            importedCount = 0,
            rowsInserted = 0,
            rowsCorrected = 0,
            forcedDailyOnly = false,
            serverSynced = false,
            errorMessage = "INVALID_MANUAL_OHLC"
        )

        val tfKey = "${cleanSym}_${prov.id}_$effTf"
        val configuredLimit = loadChartPreferences().candleFetchLimit.coerceIn(500, 5000)
        val existing = candleMemoryStore[tfKey] ?: loadCandlesFromPrefs(tfKey, effTf)
        val merged = CandleValidatorAlgorithm.mergeIdempotent(
            existing = existing,
            incoming = listOf(candle),
            timeframe = effTf
        ).takeLast(configuredLimit)
        candleMemoryStore[tfKey] = merged
        saveCandlesToPrefs(tfKey, merged, configuredLimit)

        var serverSynced = false
        var rowsInserted = 1
        var rowsCorrected = 0
        val token = getSessionToken()
        if (token.isNotBlank()) {
            runCatching {
                val barObj = JSONObject().apply {
                    put("open_time_utc_ms", candle.openTimeUtcMillis)
                    put("open", candle.open.toPlainString())
                    put("high", candle.high.toPlainString())
                    put("low", candle.low.toPlainString())
                    put("close", candle.close.toPlainString())
                    put("volume", candle.volume.toPlainString())
                }
                val payload = JSONObject().apply {
                    put("session_token", token)
                    put("action", "manual")
                    put("symbol", cleanSym)
                    put("provider", prov.id)
                    put("timeframe", effTf)
                    put("quality_status", qualityStatus)
                    put("file_name", "manual_ohlc_entry")
                    put("manual_candles", JSONArray().put(barObj))
                }
                val req = Request.Builder()
                    .url("${AppConfig.API_BASE_URL}import_candles.php")
                    .header("Authorization", "Bearer $token")
                    .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                    .build()
                httpClient.newCall(req).execute().use { resp ->
                    if (resp.isSuccessful) {
                        val root = JSONObject(resp.body?.string().orEmpty())
                        if (root.optBoolean("ok", false)) {
                            serverSynced = true
                            val batch = root.optJSONObject("data")?.optJSONObject("batch")
                            if (batch != null) {
                                rowsInserted = batch.optInt("rows_inserted", 1)
                                rowsCorrected = batch.optInt("rows_corrected", 0)
                            }
                        }
                    }
                }
            }
        }

        HistoricalImportResult(
            ok = true,
            effectiveTimeframe = effTf,
            importedCount = 1,
            rowsInserted = rowsInserted,
            rowsCorrected = rowsCorrected,
            forcedDailyOnly = false,
            serverSynced = serverSynced,
            candles = merged
        )
    }

    suspend fun fetchImportBatches(limit: Int = 20): List<ImportBatchDto> = withContext(Dispatchers.IO) {
        val token = getSessionToken()
        runCatching {
            val reqBuilder = Request.Builder()
                .url("${AppConfig.API_BASE_URL}import_candles.php?action=batches&limit=$limit")
                .get()
            if (token.isNotBlank()) {
                reqBuilder.header("Authorization", "Bearer $token")
            }
            httpClient.newCall(reqBuilder.build()).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val root = JSONObject(resp.body?.string().orEmpty())
                if (!root.optBoolean("ok", false)) return@withContext emptyList()
                val arr = root.optJSONObject("data")?.optJSONArray("batches") ?: return@withContext emptyList()
                val list = ArrayList<ImportBatchDto>(arr.length())
                for (i in 0 until arr.length()) {
                    val b = arr.optJSONObject(i) ?: continue
                    list.add(
                        ImportBatchDto(
                            id = b.optLong("id", 0L),
                            symbolCode = b.optString("symbol_code", ""),
                            providerId = b.optString("provider_id", ""),
                            timeframe = b.optString("timeframe", ""),
                            sourceType = b.optString("source_type", ""),
                            fileName = b.optString("file_name", ""),
                            qualityStatus = b.optString("quality_status", "OFFICIAL"),
                            rowsInserted = b.optInt("rows_inserted", 0),
                            rowsCorrected = b.optInt("rows_corrected", 0),
                            importedAtUtc = b.optString("imported_at_utc", "")
                        )
                    )
                }
                list
            }
        }.getOrDefault(emptyList())
    }
}

