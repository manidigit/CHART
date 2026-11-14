package es.manico.chartintelligence.forecast

import es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToLong

enum class ForecastRenderMode(val key: String) {
    HYBRID("HYBRID"),
    FAN_CHART("FAN_CHART"),
    GHOST_CANDLES("GHOST_CANDLES");

    companion object {
        fun parse(raw: String?): ForecastRenderMode {
            val clean = raw?.trim()?.uppercase(Locale.US) ?: "HYBRID"
            return entries.firstOrNull { it.key == clean } ?: HYBRID
        }
    }
}

enum class ForecastStatus {
    VALID,
    PROVISIONAL,
    DATA_NOT_READY
}

enum class MarketRegime {
    TRENDING_UP,
    TRENDING_DOWN,
    RANGING,
    HIGH_VOLATILITY
}

enum class RemoteWorkerStatus {
    LOCAL_STATISTICAL_ONLY,
    UNCONFIGURED,
    CONNECTED,
    ERROR
}

data class ForecastPoint(
    val stepAhead: Int,
    val openTimeUtcMs: Long,
    val open: Double,
    val high: Double,
    val low: Double,
    val close: Double,
    val q10: Double,
    val q25: Double,
    val q50: Double,
    val q75: Double,
    val q90: Double,
    val pctChangeFromLast: Double
)

data class ForecastScenario(
    val id: String,
    val label: String,
    val bias: String,
    val probability: Double,
    val targetPrice: Double,
    val extremePrice: Double,
    val invalidationReference: Double,
    val pctChange: Double
)

data class ModelContribution(
    val modelId: String,
    val modelName: String,
    val family: String,
    val weight: Double,
    val terminalPrice: Double,
    val terminalPctChange: Double
)

data class ModelWalkForwardSummary(
    val modelId: String,
    val modelName: String,
    val family: String,
    val windows: Int,
    val mae: Double,
    val maePct: Double,
    val rmse: Double,
    val directionalAccuracyPct: Double,
    val pinballLoss: Double,
    val coverage80Pct: Double,
    val crps: Double
)

data class WalkForwardReport(
    val evaluatedWindows: Int,
    val evalHorizon: Int,
    val forecastStatus: ForecastStatus,
    val acceptancePassed: Boolean,
    val acceptanceReason: String,
    val ensembleMetrics: ModelWalkForwardSummary?,
    val naiveMetrics: ModelWalkForwardSummary?,
    val modelBenchmarks: List<ModelWalkForwardSummary>,
    val maeImprovementVsNaivePct: Double
)

data class DataReadinessReport(
    val ready: Boolean,
    val barCount: Int,
    val validBarCount: Int,
    val minBars: Int,
    val issues: List<String>
)

data class ForecastFeaturesSummary(
    val atr14: Double,
    val atrPct: Double,
    val ewmaSigmaPct: Double,
    val rsi14: Double,
    val realizedVolRatio: Double,
    val driftZ: Double
)

data class ForecastSummary(
    val terminalStep: Int,
    val terminalQ10: Double,
    val terminalQ25: Double,
    val terminalQ50: Double,
    val terminalQ75: Double,
    val terminalQ90: Double,
    val medianPctChange: Double,
    val corridorWidthPct: Double
)

data class ForecastPluginState(
    val id: String,
    val name: String,
    val family: String,
    val description: String,
    val enabled: Boolean,
    val weight: Double,
    val defaultWeight: Double,
    val params: Map<String, Double>,
    val defaultParams: Map<String, Double>
)

data class ForecastLedgerEntry(
    val seq: Int,
    val contractVersion: String,
    val symbolCode: String,
    val timeframe: String,
    val horizonBars: Int,
    val anchorOpenTimeUtcMs: Long,
    val anchorClose: Double,
    val forecastStatus: String,
    val regime: String,
    val inputHash: String,
    val terminalMedian: Double,
    val terminalQ10: Double,
    val terminalQ90: Double,
    val generatedAtUtcMs: Long,
    val prevForecastHash: String,
    val forecastHash: String,
    val syncedToCloud: Boolean
)

data class LedgerVerifyResult(
    val valid: Boolean,
    val totalEntries: Int,
    val brokenIndex: Int,
    val reason: String
)

data class ForecastResult(
    val contractVersion: String,
    val status: ForecastStatus,
    val symbolCode: String,
    val timeframe: String,
    val horizonBars: Int,
    val renderMode: ForecastRenderMode,
    val generatedAtUtcMs: Long,
    val anchorOpenTimeUtcMs: Long,
    val anchorClose: Double,
    val regime: MarketRegime,
    val remoteWorkerStatus: RemoteWorkerStatus,
    val readiness: DataReadinessReport,
    val featuresSummary: ForecastFeaturesSummary?,
    val points: List<ForecastPoint>,
    val scenarios: List<ForecastScenario>,
    val modelContributions: List<ModelContribution>,
    val walkForward: WalkForwardReport?,
    val summary: ForecastSummary?,
    val inputHash: String
)

object ForecastSha256 {
    const val CONTRACT_VERSION = "forecast-contract/v1"
    const val GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

    fun sha256Hex(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    fun canonicalJson(value: Any?): String {
        return when (value) {
            null -> "null"
            is Boolean -> value.toString()
            is Int, is Long -> value.toString()
            is Double -> {
                if (!value.isFinite()) "0"
                else {
                    val rounded = (value * 100_000_000.0).roundToLong() / 100_000_000.0
                    String.format(Locale.US, "%.8f", rounded).trimEnd('0').trimEnd('.').ifEmpty { "0" }
                }
            }
            is Float -> canonicalJson(value.toDouble())
            is String -> JSONObject.quote(value)
            is List<*> -> value.joinToString(",", "[", "]") { canonicalJson(it) }
            is Map<*, *> -> {
                val keys = value.keys.mapNotNull { it?.toString() }.sorted()
                keys.joinToString(",", "{", "}") { k ->
                    "${JSONObject.quote(k)}:${canonicalJson(value[k])}"
                }
            }
            is JSONObject -> {
                val keys = value.keys().asSequence().toList().sorted()
                keys.joinToString(",", "{", "}") { k ->
                    "${JSONObject.quote(k)}:${canonicalJson(value.opt(k))}"
                }
            }
            is JSONArray -> {
                val parts = ArrayList<String>(value.length())
                for (i in 0 until value.length()) parts.add(canonicalJson(value.opt(i)))
                parts.joinToString(",", "[", "]")
            }
            else -> JSONObject.quote(value.toString())
        }
    }
}

object ForecastCalendarHelper {
    fun clampHorizonBars(horizon: Int): Int = horizon.coerceIn(10, 60)

    fun enforceMonotonicQuantiles(
        rawQ10: Double,
        rawQ25: Double,
        rawQ50: Double,
        rawQ75: Double,
        rawQ90: Double,
        floorPrice: Double
    ): DoubleArray {
        val q10 = max(floorPrice, rawQ10)
        val q25 = max(q10, rawQ25)
        val q50 = max(q25, rawQ50)
        val q75 = max(q50, rawQ75)
        val q90 = max(q75, rawQ90)
        return doubleArrayOf(q10, q25, q50, q75, q90)
    }

    fun advanceFutureTimestamps(
        lastOpenMs: Long,
        timeframe: String,
        horizon: Int,
        symbolCode: String
    ): LongArray {
        val stepMs = UtcTimeAnchorAlgorithm.timeframeStepMillis(timeframe)
        val start = if (lastOpenMs > 0L) lastOpenMs else System.currentTimeMillis()
        val out = LongArray(horizon)
        var filled = 0
        var cursor = start
        val maxIter = horizon * 16 + 64
        var guard = 0
        while (filled < horizon && guard < maxIter) {
            guard++
            cursor += stepMs
            if (symbolCode.isBlank() || UtcTimeAnchorAlgorithm.isMarketOpen(cursor, symbolCode)) {
                out[filled++] = cursor
            }
        }
        while (filled < horizon) {
            cursor += stepMs
            out[filled++] = cursor
        }
        return out
    }
}

object ForecastComplianceGuard {
    private val forbidden = listOf(
        Regex("\\bstrong\\s+buy\\b", RegexOption.IGNORE_CASE),
        Regex("\\bstrong\\s+sell\\b", RegexOption.IGNORE_CASE),
        Regex("\\bbuy\\s+now\\b", RegexOption.IGNORE_CASE),
        Regex("\\bsell\\s+now\\b", RegexOption.IGNORE_CASE),
        Regex("\\bstop[\\s_-]?loss\\b", RegexOption.IGNORE_CASE),
        Regex("\\btake[\\s_-]?profit\\b", RegexOption.IGNORE_CASE),
        Regex("\\bposition[\\s_-]?size\\b", RegexOption.IGNORE_CASE),
        Regex("\\bentry\\s+price\\b", RegexOption.IGNORE_CASE)
    )

    fun containsForbiddenTradingTerms(text: String): Boolean =
        forbidden.any { it.containsMatchIn(text) }
}
