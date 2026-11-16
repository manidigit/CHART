package es.manico.chartintelligence.forecast

import es.manico.chartintelligence.data.model.CandleBar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class RemoteWorkerResponseWrap(
    val status: RemoteWorkerStatus,
    val url: String,
    val error: String = "",
    val inputHash: String = "",
    val trajectories: List<ModelTrajectory> = emptyList(),
    val benchmarks: List<ModelWalkForwardSummary> = emptyList()
)

object ForecastWorkerClient {
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(4, TimeUnit.SECONDS)
        .build()

    private val cache = object : LinkedHashMap<String, RemoteWorkerResponseWrap>(32, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, RemoteWorkerResponseWrap>?): Boolean = size > 32
    }

    suspend fun infer(
        workerUrl: String,
        symbolCode: String,
        timeframe: String,
        horizonBars: Int,
        candles: List<CandleBar>,
        inputHash: String
    ): RemoteWorkerResponseWrap = withContext(Dispatchers.IO) {
        val base = workerUrl.trim().trimEnd('/')
        if (base.isEmpty()) {
            return@withContext RemoteWorkerResponseWrap(RemoteWorkerStatus.LOCAL_STATISTICAL_ONLY, "")
        }
        val cacheKey = "$base|$symbolCode|$timeframe|$horizonBars|$inputHash"
        synchronized(cache) {
            cache[cacheKey]?.let { return@withContext it }
        }

        val payload = JSONObject().apply {
            put("contractVersion", ForecastSha256.CONTRACT_VERSION)
            put("specVersion", ForecastSha256.SPEC_VERSION)
            put("symbolCode", symbolCode)
            put("timeframe", timeframe)
            put("horizonBars", horizonBars)
            put("inputHash", inputHash)
            val arr = JSONArray()
            candles.takeLast(2500).forEach { c ->
                arr.put(
                    JSONObject().apply {
                        put("open_time_utc_ms", c.openTimeUtcMillis)
                        put("open", c.open.toDouble())
                        put("high", c.high.toDouble())
                        put("low", c.low.toDouble())
                        put("close", c.close.toDouble())
                        put("volume", c.volume.toDouble())
                    }
                )
            }
            put("candles", arr)
        }

        val req = Request.Builder()
            .url("$base/forecast/infer")
            .post(payload.toString().toRequestBody(jsonMediaType))
            .build()

        val wrapped = try {
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    RemoteWorkerResponseWrap(
                        status = RemoteWorkerStatus.ERROR,
                        url = base,
                        error = "Worker HTTP ${resp.code}"
                    )
                } else {
                    val bodyStr = resp.body?.string().orEmpty()
                    val obj = JSONObject(bodyStr)
                    val respHash = obj.optString("inputHash", "")
                    if (respHash.isNotEmpty() && inputHash.isNotEmpty() && respHash != inputHash) {
                        RemoteWorkerResponseWrap(
                            status = RemoteWorkerStatus.ERROR,
                            url = base,
                            error = "WORKER_INPUT_HASH_MISMATCH: expected ${inputHash.take(12)}, got ${respHash.take(12)}",
                            inputHash = respHash
                        )
                    } else {
                        val trajs = parseTrajectories(obj.optJSONArray("modelTrajectories"))
                        val benches = parseBenchmarks(obj.optJSONArray("modelBenchmarks"))
                        RemoteWorkerResponseWrap(
                            status = RemoteWorkerStatus.CONNECTED,
                            url = base,
                            inputHash = respHash,
                            trajectories = trajs,
                            benchmarks = benches
                        )
                    }
                }
            }
        } catch (t: Throwable) {
            RemoteWorkerResponseWrap(
                status = RemoteWorkerStatus.ERROR,
                url = base,
                error = t.message ?: "Worker unreachable"
            )
        }

        if (wrapped.status == RemoteWorkerStatus.CONNECTED) {
            synchronized(cache) {
                cache[cacheKey] = wrapped
            }
        }
        wrapped
    }

    private fun parseTrajectories(arr: JSONArray?): List<ModelTrajectory> {
        if (arr == null) return emptyList()
        val out = ArrayList<ModelTrajectory>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val ptsArr = o.optJSONArray("points")
            val pts = ArrayList<ForecastPoint>(ptsArr?.length() ?: 0)
            if (ptsArr != null) {
                for (k in 0 until ptsArr.length()) {
                    val p = ptsArr.optJSONObject(k) ?: continue
                    val q10 = p.optDouble("q10", Double.NaN)
                    val q25 = p.optDouble("q25", Double.NaN)
                    val q50 = p.optDouble("q50", Double.NaN)
                    val q75 = p.optDouble("q75", Double.NaN)
                    val q90 = p.optDouble("q90", Double.NaN)
                    pts.add(
                        ForecastPoint(
                            stepAhead = p.optInt("stepAhead", k + 1),
                            openTimeUtcMs = p.optLong("openTimeUtcMs", 0L),
                            open = p.optDouble("open", q50),
                            high = p.optDouble("high", q75),
                            low = p.optDouble("low", q25),
                            close = p.optDouble("close", q50),
                            q10 = q10,
                            q25 = q25,
                            q50 = q50,
                            q75 = q75,
                            q90 = q90,
                            pctChangeFromLast = p.optDouble("pctChangeFromLast", 0.0),
                            volume = 0.0,
                            rejectionWick = false,
                            wavePhase = "IMPULSE",
                            upperBand = p.optDouble("upperBand", q90),
                            lowerBand = p.optDouble("lowerBand", q10)
                        )
                    )
                }
            }
            out.add(
                ModelTrajectory(
                    modelId = o.optString("modelId"),
                    modelName = o.optString("modelName", o.optString("modelId")),
                    family = o.optString("family", "PYTHON_ML"),
                    modelVersion = o.optString("modelVersion", "2.0.0"),
                    executionRuntime = ExecutionRuntime.PYTHON_WORKER,
                    isApproximation = o.optBoolean("isApproximation", false),
                    isCalibratedInterval = o.optBoolean("isCalibratedInterval", true),
                    status = parseExecStatus(o.optString("status", "SUCCESS")),
                    reason = o.optString("reason", ""),
                    trainingStartUtcMs = o.optLong("trainingStartUtcMs", 0L),
                    trainingEndUtcMs = o.optLong("trainingEndUtcMs", 0L),
                    trainingSampleCount = o.optInt("trainingSampleCount", 0),
                    points = pts
                )
            )
        }
        return out
    }

    private fun parseBenchmarks(arr: JSONArray?): List<ModelWalkForwardSummary> {
        if (arr == null) return emptyList()
        val out = ArrayList<ModelWalkForwardSummary>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val wins = o.optInt("windows", 0)
            out.add(
                ModelWalkForwardSummary(
                    modelId = o.optString("modelId"),
                    modelName = o.optString("modelName", o.optString("modelId")),
                    family = o.optString("family", "PYTHON_ML"),
                    experimentalOnly = o.optBoolean("experimentalOnly", false),
                    windows = wins,
                    evaluatedWindows = o.optInt("evaluatedWindows", wins),
                    status = parseExecStatus(o.optString("status", "SUCCESS")),
                    reason = o.optString("reason", ""),
                    mae = o.optDouble("mae", 0.0),
                    maePct = o.optDouble("maePct", 0.0),
                    rmse = o.optDouble("rmse", 0.0),
                    rMae = o.optDouble("rMae", 1.0),
                    mase = o.optDouble("mase", 1.0),
                    wis = o.optDouble("wis", 0.0),
                    pinballLoss = o.optDouble("pinballLoss", 0.0),
                    coverage80Pct = o.optDouble("coverage80Pct", 0.0),
                    coverage50Pct = o.optDouble("coverage50Pct", 0.0),
                    avgIntervalWidthPct = o.optDouble("avgIntervalWidthPct", 0.0),
                    directionalAccuracyPct = o.optDouble("directionalAccuracyPct", 0.0),
                    skillVsNaivePct = o.optDouble("skillVsNaivePct", 0.0),
                    dmStat = o.optDouble("dmStat", 0.0),
                    dmPValue = o.optDouble("dmPValue", 1.0),
                    bootPValue = o.optDouble("bootPValue", 1.0),
                    nEff = o.optDouble("nEff", 0.0),
                    executionRuntime = ExecutionRuntime.PYTHON_WORKER,
                    isApproximation = o.optBoolean("isApproximation", false),
                    isCalibratedInterval = o.optBoolean("isCalibratedInterval", true),
                    crps = o.optDouble("crps", 0.0),
                    safeMapePct = if (o.isNull("safeMapePct")) null else o.optDouble("safeMapePct"),
                    safeMapeValidCount = o.optInt("safeMapeValidCount", 0)
                )
            )
        }
        return out
    }

    private fun parseExecStatus(raw: String): ModelExecutionStatus = when (raw.uppercase()) {
        "SKIPPED_LOW_DATA" -> ModelExecutionStatus.SKIPPED_LOW_DATA
        "FAILED" -> ModelExecutionStatus.FAILED
        else -> ModelExecutionStatus.SUCCESS
    }
}
