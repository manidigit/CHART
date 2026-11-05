package com.chartintelligence.app.data

import com.chartintelligence.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.util.concurrent.TimeUnit

/**
 * Read-only Android adapter for the shared CHART market service.
 *
 * The API base URL is injected at build time through the Gradle property
 * CHART_API_BASE_URL. No provider credentials are stored in the Android app.
 */
class SharedMarketApiClient(
    private val baseUrl: String = BuildConfig.CHART_API_BASE_URL
) {
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    suspend fun getInstruments(): SharedApiResult<List<SharedInstrument>> =
        get("/api/v1/instruments") { json ->
            val array = json.optJSONArray("instruments") ?: JSONArray()
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.getJSONObject(index)
                    add(
                        SharedInstrument(
                            id = item.getString("id"),
                            symbol = item.getString("symbol"),
                            name = item.getString("name"),
                            timeframe = item.optString("timeframe", "M15"),
                            providerStatus = item.optString("providerStatus", "not_configured")
                        )
                    )
                }
            }
        }

    suspend fun getCandles(
        instrumentId: String,
        timeframe: String = "M15",
        limit: Int = 500
    ): SharedApiResult<List<SharedCandle>> {
        val safeId = instrumentId.trim()
        require(safeId.matches(Regex("[A-Z0-9_]+"))) { "Invalid instrument identifier" }
        require(timeframe == "M15") { "Only M15 is enabled in the initial shared API contract" }
        val safeLimit = limit.coerceIn(1, 2000)
        return get(
            "/api/v1/candles?instrumentId=$safeId&timeframe=$timeframe&limit=$safeLimit"
        ) { json ->
            val array = json.optJSONArray("candles") ?: JSONArray()
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.getJSONObject(index)
                    add(
                        SharedCandle(
                            openTimeUtcMs = item.getLong("openTimeUtcMs"),
                            closeTimeUtcMs = item.getLong("closeTimeUtcMs"),
                            open = BigDecimal(item.getString("open")),
                            high = BigDecimal(item.getString("high")),
                            low = BigDecimal(item.getString("low")),
                            close = BigDecimal(item.getString("close")),
                            isComplete = item.optBoolean("isComplete", false),
                            sourceId = item.getString("sourceId"),
                            qualityStatus = item.optString("qualityStatus", "UNKNOWN")
                        )
                    )
                }
            }
        }
    }

    private suspend fun <T> get(path: String, parse: (JSONObject) -> T): SharedApiResult<T> =
        withContext(Dispatchers.IO) {
            if (baseUrl.isBlank()) {
                return@withContext SharedApiResult.Unavailable(
                    "CHART_API_BASE_URL is not configured for this Android build."
                )
            }
            val request = Request.Builder()
                .url(baseUrl.trimEnd('/') + path)
                .get()
                .header("Accept", "application/json")
                .build()
            try {
                http.newCall(request).execute().use { response ->
                    val body = response.body?.string().orEmpty()
                    val json = if (body.isBlank()) JSONObject() else JSONObject(body)
                    if (!response.isSuccessful) {
                        val error = json.optJSONObject("error")
                        val message = error?.optString("message")
                            ?: json.optString("notice", "Shared market API returned HTTP ${response.code}.")
                        SharedApiResult.Unavailable(message, response.code)
                    } else {
                        SharedApiResult.Success(parse(json))
                    }
                }
            } catch (exception: Exception) {
                SharedApiResult.Unavailable(
                    exception.message ?: "Unable to reach the shared market API."
                )
            }
        }
}

data class SharedInstrument(
    val id: String,
    val symbol: String,
    val name: String,
    val timeframe: String,
    val providerStatus: String
)

data class SharedCandle(
    val openTimeUtcMs: Long,
    val closeTimeUtcMs: Long,
    val open: BigDecimal,
    val high: BigDecimal,
    val low: BigDecimal,
    val close: BigDecimal,
    val isComplete: Boolean,
    val sourceId: String,
    val qualityStatus: String
)

sealed interface SharedApiResult<out T> {
    data class Success<T>(val value: T) : SharedApiResult<T>
    data class Unavailable(val message: String, val httpCode: Int? = null) : SharedApiResult<Nothing>
}
