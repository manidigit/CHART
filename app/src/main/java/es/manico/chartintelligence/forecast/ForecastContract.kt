package es.manico.chartintelligence.forecast

import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode
import java.security.MessageDigest
import java.util.Locale
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/**
 * CHART Forecast Engine V2 (Rev 2.1) — Canonical Contract & Shared Types.
 * Bit-exact parity with host_subdomain/assets/js/forecast/forecastContract.js
 */

const val FORECAST_CONTRACT_VERSION = "forecast-contract/v2"
const val FORECAST_LEGACY_CONTRACT_VERSION = "forecast-contract/v1"
const val FORECAST_SPEC_VERSION = "2.1.0"
const val FORECAST_ENGINE_VERSION = "2.0.0"
const val FORECAST_FEATURE_PIPELINE_VERSION = "2.1.0"
const val FORECAST_MODEL_REGISTRY_VERSION = "2.1.0"

enum class ForecastRenderMode(val key: String) {
    FAN_CHART("FAN_CHART"),
    HYBRID("HYBRID"),
    GHOST_CANDLES("GHOST_CANDLES");

    companion object {
        fun parse(raw: String?): ForecastRenderMode {
            val clean = raw?.trim()?.uppercase(Locale.US) ?: "FAN_CHART"
            return entries.firstOrNull { it.key == clean } ?: FAN_CHART
        }
    }
}

enum class ForecastStatus {
    VALID,
    PROVISIONAL,
    NO_EDGE,
    INSUFFICIENT_EVIDENCE,
    DATA_NOT_READY
}

enum class ScenarioStatus {
    ESTIMABLE,
    NOT_ESTIMABLE
}

object ScenarioIds {
    const val BULLISH_EXPANSION = "BULLISH_EXPANSION"
    const val RANGE_CONTAINMENT = "RANGE_CONTAINMENT"
    const val BEARISH_CONTRACTION = "BEARISH_CONTRACTION"
}

enum class MarketRegime {
    TRENDING_BULL,
    TRENDING_BEAR,
    RANGING,
    HIGH_VOLATILITY;

    val isTrendingUp: Boolean get() = this == TRENDING_BULL
    val isTrendingDown: Boolean get() = this == TRENDING_BEAR

    companion object {
        // Compatibility aliases for legacy callers
        val TRENDING_UP = TRENDING_BULL
        val TRENDING_DOWN = TRENDING_BEAR
    }
}

enum class RemoteWorkerStatus {
    LOCAL_STATISTICAL_ONLY,
    UNCONFIGURED,
    CONNECTED,
    ERROR
}

enum class OodStatus {
    IN_DISTRIBUTION,
    ELEVATED,
    EXTREME
}

enum class NoEdgeGateState {
    EDGE_SUPPORTED,
    NO_EDGE_DETECTED
}

enum class MtfAlignmentState {
    ALIGNED,
    NATURAL_HORIZON_DIVERGENCE,
    STRUCTURAL_CONFLICT,
    SINGLE_TIMEFRAME
}

enum class ForecastLifecycleStatus {
    ACTIVE,
    MATURED,
    SUPERSEDED,
    CANCELLED
}

enum class ForecastEvaluationOutcome {
    PENDING,
    SUCCESS,
    FAILED,
    AMBIGUOUS,
    INCOMPLETE_DATA
}

enum class ModelExecutionStatus {
    SUCCESS,
    SKIPPED_LOW_DATA,
    FAILED,
    MODEL_UNAVAILABLE
}

enum class ExecutionRuntime {
    NATIVE_JS,
    NATIVE_KOTLIN,
    NATIVE_PHP,
    PYTHON_WORKER
}

enum class SelectionMode {
    AUTO_OOS_BEST,
    MANUAL_OVERRIDE,
    NO_CLEAR_WINNER_BASELINE,
    INSUFFICIENT_EVIDENCE_BASELINE;

    companion object {
        // Compatibility alias for legacy callers
        val SMC_STRUCTURAL_DEFAULT = NO_CLEAR_WINNER_BASELINE
    }
}

data class DirectQuantiles(
    val q10: DoubleArray,
    val q25: DoubleArray,
    val q50: DoubleArray,
    val q75: DoubleArray,
    val q90: DoubleArray
)

data class PerHorizonMetric(
    val stepAhead: Int,
    val mae: Double,
    val rmse: Double,
    val coverage80Pct: Double
)

data class ModelTrajectory(
    val modelId: String,
    val modelName: String,
    val family: String,
    val modelVersion: String = "2.0.0",
    val executionRuntime: ExecutionRuntime = ExecutionRuntime.NATIVE_KOTLIN,
    val isApproximation: Boolean = false,
    val isCalibratedInterval: Boolean = true,
    val status: ModelExecutionStatus = ModelExecutionStatus.SUCCESS,
    val reason: String = "",
    val trainingStartUtcMs: Long = 0L,
    val trainingEndUtcMs: Long = 0L,
    val trainingSampleCount: Int = 0,
    val points: List<ForecastPoint> = emptyList(),
    val meta: Map<String, Any?> = emptyMap()
)

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
    val pctChangeFromLast: Double,
    val volume: Double = 0.0,
    val rejectionWick: Boolean = false,
    val wavePhase: String = "IMPULSE",
    val upperBand: Double = q90,
    val lowerBand: Double = q10
)

data class RepresentativePath(
    val id: String,
    val label: String,
    val isIllustrativeOnly: Boolean = true,
    val originIndex: Int,
    val distance: Double,
    val closes: List<Double>
)

data class AnalogDiagnostics(
    val status: String,
    val reason: String,
    val jMax: Int,
    val embargoGap: Int,
    val matchedCount: Int
)

data class ScenarioCalibrationReport(
    val modelType: String = "L2_MULTINOMIAL_LOGIT_TEMP_SCALED",
    val totalTrainAndCalSamples: Int,
    val oosEvaluatedCount: Int,
    val temperature: Double,
    val oosBrierModel: Double,
    val oosBrierClimatology: Double,
    val calibrationPassed: Boolean,
    val notEstimableCount: Int
)

data class ForecastScenario(
    val id: String,
    val label: String,
    val bias: String,
    val status: ScenarioStatus = ScenarioStatus.ESTIMABLE,
    val probability: Double?,
    val rawEmpiricalFrequency: Double = 0.0,
    val sampleCount: Int = 0,
    val targetPrice: Double,
    val extremePrice: Double,
    val invalidationReference: Double,
    val pctChange: Double,
    val leafId: String = id,
    val parentBranch: String = "TREE",
    val entryCondition: String = "",
    val intermediateEvent: String = "",
    val invalidationCondition: String = "",
    val lowSampleWarning: Boolean = false
)

data class UncertaintyBreakdown(
    val aleatoricPct: Double,
    val epistemicPct: Double,
    val totalPct: Double,
    val aleatoricShare: Double,
    val epistemicShare: Double,
    val oodStatus: OodStatus,
    val oodDistance: Double,
    val oodReasons: List<String>,
    val spreadMultiplierApplied: Double,
    val epistemicCumVar: Double
)

data class KeyPriceZone(
    val zoneId: String,
    val zoneType: String,
    val lowPrice: Double,
    val highPrice: Double,
    val centerPrice: Double,
    val detectedAtMs: Long,
    val source: String,
    val strength: Double,
    val touchProbability: Double,
    val penetrationProbability: Double,
    val reclaimProbability: Double,
    val confirmedBreakoutProbability: Double,
    val reachBeforeInvalidationProb: Double,
    val invalidationBeforeReachProb: Double,
    val expectedBarsToReachCensored: Double,
    val invalidationPrice: Double,
    val horizonBars: Int
)

data class SensitivityGridPoint(
    val penetrationAtrMult: Double,
    val reclaimWindowBars: Int,
    val breakoutCloses: Int,
    val touchFreqPct: Double,
    val reclaimFreqPct: Double,
    val breakoutFreqPct: Double,
    val ambiguousRatePct: Double
)

data class EventDictionarySpec(
    val priceBasis: String = "MID_OHLC",
    val evaluationRule: String = "HIGH_LOW_AND_CLOSE",
    val penetrationAtrMult: Double = 0.20,
    val reclaimWindowBars: Int = 3,
    val confirmedBreakoutCloses: Int = 2,
    val sensitivityGrid: List<SensitivityGridPoint> = emptyList()
)

data class PathEventStats(
    val touchRatePct: Double,
    val penetrationRatePct: Double,
    val reclaimRatePct: Double,
    val breakoutRatePct: Double,
    val reachBeforeInvalidationPct: Double,
    val ambiguousRatePct: Double,
    val censoringRatePct: Double
)

data class NoEdgeGateReport(
    val gateState: NoEdgeGateState,
    val hasEdge: Boolean,
    val effectiveSampleSize: Double,
    val skillScoreVsBaseline: Double,
    val reasons: List<String>
)

data class MtfCoordinationReport(
    val referenceTimeframe: String,
    val alignmentState: MtfAlignmentState,
    val ohlcConsistent: Boolean,
    val independentMedianPct: Double,
    val coordinatedMedianPct: Double,
    val coordinatedPoints: List<ForecastPoint>,
    val coordinatedScenarios: List<ForecastScenario>,
    val conflictReasons: List<String>,
    val uncertaintyAdjustmentFactor: Double
)

data class ForecastStabilityReport(
    val previousForecastHash: String?,
    val medianDriftPct: Double,
    val corridorShiftPct: Double,
    val stable: Boolean
)

data class ForecastLifecycleEvent(
    val seq: Int,
    val forecastHash: String,
    val symbolCode: String,
    val timeframe: String,
    val horizonStep: Int,
    val lifecycleStatus: ForecastLifecycleStatus,
    val evaluationOutcome: ForecastEvaluationOutcome,
    val reason: String,
    val observedClose: Double?,
    val recordedAtUtcMs: Long,
    val prevEventHash: String,
    val eventHash: String
)

data class LifecycleVerifyResult(
    val valid: Boolean,
    val totalEvents: Int,
    val brokenIndex: Int,
    val reason: String
)

data class ModelContribution(
    val modelId: String,
    val modelName: String,
    val family: String,
    val weight: Double,
    val terminalPrice: Double,
    val terminalPctChange: Double,
    val meta: Map<String, Any?> = emptyMap()
)

data class ModelWalkForwardSummary(
    val modelId: String,
    val modelName: String,
    val family: String,
    val experimentalOnly: Boolean = false,
    val windows: Int,
    val evaluatedWindows: Int = windows,
    val status: ModelExecutionStatus = ModelExecutionStatus.SUCCESS,
    val reason: String = "",
    val mae: Double,
    val maePct: Double,
    val rmse: Double,
    val rMae: Double = 1.0,
    val mase: Double = 1.0,
    val wis: Double = 0.0,
    val pinballLoss: Double = 0.0,
    val coverage80Pct: Double = 0.0,
    val coverage50Pct: Double = 0.0,
    val avgIntervalWidthPct: Double = 0.0,
    val directionalAccuracyPct: Double = 0.0,
    val skillVsNaivePct: Double = 0.0,
    val dmStat: Double = 0.0,
    val dmPValue: Double = 1.0,
    val bootPValue: Double = 1.0,
    val nEff: Double = 0.0,
    val executionRuntime: ExecutionRuntime = ExecutionRuntime.NATIVE_KOTLIN,
    val isApproximation: Boolean = false,
    val isCalibratedInterval: Boolean = true,
    val crps: Double = 0.0,
    val safeMapePct: Double? = null,
    val safeMapeValidCount: Int = 0,
    val perHorizonMetrics: List<PerHorizonMetric> = emptyList()
)

data class HorizonRequirements(
    val horizonBars: Int,
    val purgeGap: Int,
    val embargoGap: Int,
    val gapTotal: Int,
    val lTrain: Int,
    val kValStat: Int,
    val sVal: Int,
    val mCalStat: Int,
    val sCal: Int,
    val kOuterStat: Int,
    val sOuter: Int,
    val lPrefixStat: Int,
    val nStatMin: Int,
    val nOpMin: Int
)

data class WalkForwardReport(
    val evaluatedWindows: Int,
    val evalHorizon: Int,
    val outerStrideBars: Int = evalHorizon,
    val effectiveSampleSize: Double = 0.0,
    val relativeMaeVsNaive: Double = 1.0,
    val mase: Double = 1.0,
    val scoringRule: String = "WEIGHTED_INTERVAL_SCORE_5Q",
    val wisUnit: String = "PRICE",
    val wisModel: Double = 0.0,
    val wisNaiveDistributional: Double = 0.0,
    val coverage80Pct: Double = 0.0,
    val coverage50Pct: Double = 0.0,
    val primaryTest: String = "HLN_MODIFIED_DIEBOLD_MARIANO",
    val dieboldMarianoStat: Double = 0.0,
    val dieboldMarianoPValue: Double = 1.0,
    val sensitivityBootstrapPValue: Double = 1.0,
    val acceptancePassed: Boolean,
    val forecastStatus: ForecastStatus,
    val acceptanceReason: String,
    val winningModelId: String = "naive_persistence",
    val ensembleMetrics: ModelWalkForwardSummary?,
    val naiveMetrics: ModelWalkForwardSummary?,
    val modelBenchmarks: List<ModelWalkForwardSummary>,
    val maeImprovementVsNaivePct: Double = 0.0,
    val skillScoreVsNaive: Double = 0.0,
    val conformalCalibration: ForecastStatisticalTests.ConformalCalibrationState? = null,
    val frozenWeights: Map<String, Double> = emptyMap(),
    val splits: Map<String, Int> = emptyMap(),
    val ambiguousOutcomeCount: Int = 0,
    val ambiguousRatePct: Double = 0.0,
    val pathEventStats: PathEventStats? = null,
    val winnerModelId: String? = winningModelId,
    val selectionMode: SelectionMode = SelectionMode.NO_CLEAR_WINNER_BASELINE,
    val selectionReason: String = acceptanceReason
)

data class DataReadinessReport(
    val ready: Boolean,
    val statisticallySufficient: Boolean = false,
    val barCount: Int,
    val validBarCount: Int,
    val nOpMin: Int,
    val nStatMin: Int,
    val minBars: Int = nOpMin,
    val errorCodes: List<String> = emptyList(),
    val issues: List<String> = emptyList(),
    val calendarId: String = "",
    val calendarVersion: String = ForecastCalendarRegistry.CALENDAR_REGISTRY_VERSION,
    val disallowedGapCount: Int = 0,
    val disallowedMissingBars: Int = 0,
    val cleanCandles: List<CleanOhlcBar> = emptyList()
)

data class ForecastFeaturesSummary(
    val atr14: Double,
    val atrPct: Double,
    val ewmaSigmaPct: Double,
    val rsi14: Double,
    val realizedVolRatio: Double,
    val driftZ: Double,
    val hasRealVolume: Boolean = false
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
    val defaultParams: Map<String, Double>,
    val modelVersion: String = "2.0.0",
    val experimentalOnly: Boolean = false
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
    val syncedToCloud: Boolean,
    val noEdgeGateState: String = "NO_EDGE_DETECTED",
    val oodStatus: String = "IN_DISTRIBUTION"
)

data class LedgerVerifyResult(
    val valid: Boolean,
    val totalEntries: Int,
    val brokenIndex: Int,
    val reason: String
)

data class DataProvenance(
    val providerId: String,
    val priceBasis: String = "MID_OHLC",
    val hasRealVolume: Boolean
)

data class CalendarSpecSummary(
    val calendarId: String,
    val calendarVersion: String,
    val ianaTimezone: String
)

data class RemoteWorkerSummary(
    val status: RemoteWorkerStatus,
    val configured: Boolean,
    val url: String,
    val error: String = ""
)

data class ForecastResult(
    val contractVersion: String = FORECAST_CONTRACT_VERSION,
    val specVersion: String = FORECAST_SPEC_VERSION,
    val engineVersion: String = FORECAST_ENGINE_VERSION,
    val status: ForecastStatus,
    val symbolCode: String,
    val timeframe: String,
    val horizonBars: Int,
    val renderMode: ForecastRenderMode,
    val generatedAtUtcMs: Long,
    val anchorOpenTimeUtcMs: Long = 0L,
    val anchorClose: Double = 0.0,
    val regime: MarketRegime = MarketRegime.RANGING,
    val calendarSpec: CalendarSpecSummary? = null,
    val dataProvenance: DataProvenance? = null,
    val featuresSummary: ForecastFeaturesSummary? = null,
    val readiness: DataReadinessReport,
    val remoteWorker: RemoteWorkerSummary? = null,
    val remoteWorkerStatus: RemoteWorkerStatus = remoteWorker?.status ?: RemoteWorkerStatus.LOCAL_STATISTICAL_ONLY,
    val uncertainty: UncertaintyBreakdown? = null,
    val conformalCalibration: ForecastStatisticalTests.ConformalCalibrationState? = null,
    val scenarioCalibration: ScenarioCalibrationReport? = null,
    val noEdgeGate: NoEdgeGateReport? = null,
    val keyZones: List<KeyPriceZone> = emptyList(),
    val eventDictionary: EventDictionarySpec? = null,
    val mtfCoordination: MtfCoordinationReport? = null,
    val stability: ForecastStabilityReport? = null,
    val points: List<ForecastPoint> = emptyList(),
    val scenarios: List<ForecastScenario> = emptyList(),
    val representativePaths: List<RepresentativePath> = emptyList(),
    val analogDiagnostics: AnalogDiagnostics? = null,
    val modelContributions: List<ModelContribution> = emptyList(),
    val modelTrajectories: List<ModelTrajectory> = emptyList(),
    val selectedChartModelId: String = "naive_persistence",
    val selectionMode: SelectionMode = SelectionMode.NO_CLEAR_WINNER_BASELINE,
    val selectionReason: String = "",
    val walkForward: WalkForwardReport? = null,
    val summary: ForecastSummary? = null,
    val inputHash: String = "",
    val remoteWorkerUrl: String = remoteWorker?.url ?: "",
    val remoteWorkerError: String = remoteWorker?.error ?: ""
)

object ForecastSha256 {
    const val CONTRACT_VERSION = FORECAST_CONTRACT_VERSION
    const val LEGACY_CONTRACT_VERSION = FORECAST_LEGACY_CONTRACT_VERSION
    const val SPEC_VERSION = FORECAST_SPEC_VERSION
    const val ENGINE_VERSION = FORECAST_ENGINE_VERSION
    const val FEATURE_PIPELINE_VERSION = FORECAST_FEATURE_PIPELINE_VERSION
    const val MODEL_REGISTRY_VERSION = FORECAST_MODEL_REGISTRY_VERSION
    const val GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

    fun sha256Hex(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    /**
     * IEEE-754 12-significant-digit canonicalization without trailing zeroes or -0.
     * Mirrors host_subdomain/assets/js/forecast/forecastContract.js roundToSignificant & canonicalJson
     */
    fun roundToSignificant(v: Double, digits: Int = 12): String {
        if (!v.isFinite()) throw IllegalArgumentException("Non-finite numeric value: $v")
        if (v == 0.0) return "0"
        val bd = BigDecimal.valueOf(v).round(MathContext(digits, RoundingMode.HALF_UP))
        val d = bd.toDouble()
        if (d == 0.0) return "0"
        if (d % 1.0 == 0.0 && abs(d) < 1e15) {
            return d.toLong().toString()
        }
        val absD = abs(d)
        if (absD < 1e-6 && absD > 0.0) {
            return d.toString().lowercase(Locale.US).replace("e-0", "e-").replace("e+0", "e+")
        }
        if (absD >= 1e21) {
            return d.toString().lowercase(Locale.US).replace("e-0", "e-").replace("e+0", "e+")
        }
        return BigDecimal.valueOf(d).stripTrailingZeros().toPlainString()
    }

    fun canonicalJson(value: Any?): String {
        return when (value) {
            null -> "\"NULL\""
            is Boolean -> value.toString()
            is Int -> value.toString()
            is Long -> value.toString()
            is Double -> roundToSignificant(value, 12)
            is Float -> roundToSignificant(value.toDouble(), 12)
            is String -> JSONObject.quote(value)
            is List<*> -> value.joinToString(",", "[", "]") { canonicalJson(it) }
            is Array<*> -> value.joinToString(",", "[", "]") { canonicalJson(it) }
            is DoubleArray -> value.joinToString(",", "[", "]") { roundToSignificant(it, 12) }
            is LongArray -> value.joinToString(",", "[", "]") { it.toString() }
            is IntArray -> value.joinToString(",", "[", "]") { it.toString() }
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

    /**
     * Legacy v1 canonicalJson preserved exclusively for backward-compatible verification of archived v1 ledger records.
     */
    fun canonicalJsonV1Legacy(value: Any?): String {
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
            is Float -> canonicalJsonV1Legacy(value.toDouble())
            is String -> JSONObject.quote(value)
            is List<*> -> value.joinToString(",", "[", "]") { canonicalJsonV1Legacy(it) }
            is Map<*, *> -> {
                val keys = value.keys.mapNotNull { it?.toString() }.sorted()
                keys.joinToString(",", "{", "}") { k ->
                    "${JSONObject.quote(k)}:${canonicalJsonV1Legacy(value[k])}"
                }
            }
            is JSONObject -> {
                val keys = value.keys().asSequence().toList().sorted()
                keys.joinToString(",", "{", "}") { k ->
                    "${JSONObject.quote(k)}:${canonicalJsonV1Legacy(value.opt(k))}"
                }
            }
            is JSONArray -> {
                val parts = ArrayList<String>(value.length())
                for (i in 0 until value.length()) parts.add(canonicalJsonV1Legacy(value.opt(i)))
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
        floorPrice: Double = 1e-6
    ): DoubleArray {
        val q10 = max(floorPrice, rawQ10)
        val q25 = max(q10, rawQ25)
        val q50 = max(q25, rawQ50)
        val q75 = max(q50, rawQ75)
        val q90 = max(q75, rawQ90)
        return doubleArrayOf(q10, q25, q50, q75, q90)
    }

    fun computeHorizonRequirements(horizonBars: Int = 30): HorizonRequirements {
        val h = clampHorizonBars(horizonBars)
        val embargoGap = max(5, ceil(0.25 * h).toInt())
        val purgeGap = h
        val gapTotal = purgeGap + embargoGap

        val lTrain = if (h <= 30) 60 + 2 * h else 120 + ((h - 30) * 40.0 / 30.0).roundToInt()
        val sVal = max(1, (h / 5.0).roundToInt())
        val sCal = max(1, (h / 10.0).roundToInt())
        val sOuter = h

        fun computeTotal(kVal: Int, mCal: Int, kOuter: Int): Pair<Int, Int> {
            val valSpan = (kVal - 1) * sVal + 1
            val calSpan = (mCal - 1) * sCal + 1
            val lPrefix = lTrain + gapTotal + valSpan + gapTotal + calSpan + 1
            return Pair(lPrefix, lPrefix + gapTotal + (kOuter - 1) * sOuter + h)
        }

        val stat = computeTotal(10, 20, 30)
        val op = computeTotal(5, 10, 1)

        return HorizonRequirements(
            horizonBars = h,
            purgeGap = purgeGap,
            embargoGap = embargoGap,
            gapTotal = gapTotal,
            lTrain = lTrain,
            kValStat = 10,
            sVal = sVal,
            mCalStat = 20,
            sCal = sCal,
            kOuterStat = 30,
            sOuter = sOuter,
            lPrefixStat = stat.first,
            nStatMin = stat.second,
            nOpMin = op.second
        )
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
