package com.chartintelligence.app.model

import java.math.BigDecimal

enum class MarketType(val label: String) {
    SPOT("Spot"),
    CFD("CFD"),
    FUTURES("Futures"),
    CRYPTO_SPOT("Crypto Spot"),
    EQUITY("Equity")
}

enum class PriceBasis(val code: String) {
    BID("bid"),
    ASK("ask"),
    MID("mid"),
    LAST("last"),
    UNKNOWN("unknown")
}

enum class VolumeType(val code: String) {
    REAL("real"),
    TICK("tick"),
    NONE("none")
}

enum class TimestampUnit(val code: String) {
    SECONDS("seconds"),
    MILLISECONDS("milliseconds"),
    MICROSECONDS("microseconds")
}

enum class DataRole(val code: String) {
    HISTORICAL("historical"),
    LIVE("live")
}

enum class QualityStatus(val label: String, val eligibleForTraining: Boolean) {
    VERIFIED("Verified", true),
    ESTIMATED("Estimated", false),
    UNCERTAIN("Uncertain", false),
    REJECTED("Rejected", false)
}

enum class DecisionStatus(val tag: String) {
    DECIDED("DECIDED"),
    PROPOSED("PROPOSED"),
    TO_VERIFY("TO VERIFY"),
    OPEN("OPEN"),
    PLAN_RESTRICTED("PLAN_RESTRICTED")
}

enum class ChartTimeframe(
    val id: String,
    val label: String,
    val minutes: Int,
    val m15Factor: Int
) {
    M15("M15", "15m", 15, 1),
    M30("M30", "30m", 30, 2),
    H1("H1", "1H", 60, 4),
    H4("H4", "4H", 240, 16),
    D1("D1", "1D", 1440, 96)
}

enum class ForecastHorizon(
    val id: String,
    val label: String,
    val m15Steps: Int,
    val targetHistoryNote: String
) {
    H_15M("15m", "+15 Min", 1, "1Y initial M15 history"),
    H_1H("1h", "+1 Hour", 4, "1Y initial M15 history"),
    H_4H("4h", "+4 Hours", 16, "3–5Y target history"),
    H_1D("1d", "+1 Trading Day", 96, "3–5Y target history")
}

enum class TrendRegime(val label: String, val persianLabel: String) {
    BULLISH("BULLISH", "صعودی"),
    BEARISH("BEARISH", "نزولی"),
    NEUTRAL("NEUTRAL", "خنثی")
}

enum class ModelHealthStatus(val label: String, val description: String) {
    ACTIVE("ACTIVE", "Outperforms baselines within statistical evaluation window"),
    SUSPENDED("SUSPENDED", "Degradation detected vs baseline; forecasts hidden from official output"),
    INVALID("INVALID", "Insufficient verified candles or failed parity check")
}

enum class ModelEvaluationMode(val label: String) {
    FROZEN("Frozen Model"),
    ADAPTIVE("Adaptive Model")
}

data class InstrumentSpec(
    val instrumentId: String,
    val displayName: String,
    val persianName: String,
    val tradingViewSymbol: String,
    val providerName: String,
    val providerSymbol: String,
    val marketType: MarketType,
    val providerInstrumentType: String,
    val quoteCurrency: String,
    val decimals: Int,
    val priceBasis: PriceBasis,
    val volumeType: VolumeType,
    val timestampUnit: TimestampUnit,
    val sessionScheduleUtc: String,
    val inputMethod: String,
    val status: DecisionStatus,
    val isolationRuleNote: String,
    val isInitialPrimary: Boolean
)

data class CandleRecord(
    val instrumentId: String,
    val sourceId: String,
    val timeframe: ChartTimeframe,
    val openTimeUtcMs: Long,
    val closeTimeUtcMs: Long,
    val open: BigDecimal,
    val high: BigDecimal,
    val low: BigDecimal,
    val close: BigDecimal,
    val volume: BigDecimal,
    val isComplete: Boolean,
    val qualityStatus: QualityStatus,
    val volumeType: VolumeType,
    val priceBasis: PriceBasis,
    val timestampUnit: TimestampUnit,
    val dataRole: DataRole,
    val providerInstrumentType: String,
    val importBatchId: String
)

data class HorizonForecastOutput(
    val instrumentId: String,
    val timeframe: ChartTimeframe,
    val horizon: ForecastHorizon,
    val currentTrend: TrendRegime,
    val predictedDirection: TrendRegime,
    val bullishProbability: Double,
    val bearishProbability: Double,
    val neutralProbability: Double,
    val lastClosePrice: BigDecimal,
    val pointTargetPrice: BigDecimal,
    val intervalLowerQ10: BigDecimal,
    val intervalMedianQ50: BigDecimal,
    val intervalUpperQ90: BigDecimal,
    val expectedHigh: BigDecimal,
    val expectedLow: BigDecimal,
    val persistenceBaselineTarget: BigDecimal,
    val smaBaselineTarget: BigDecimal,
    val previousDirectionBaseline: TrendRegime,
    val atrValue: BigDecimal,
    val neutralThresholdValue: BigDecimal,
    val confidenceScore: Double,
    val sma20: BigDecimal,
    val ema50: BigDecimal,
    val rsi14: Double
)

data class PredictionRecord(
    val recordId: String,
    val instrumentId: String,
    val timeframe: ChartTimeframe,
    val horizon: ForecastHorizon,
    val deviceClaimedAtUtc: String,
    val serverReceivedAtUtc: String,
    val horizonEndUtc: String,
    val lastClosedCandleUtc: String,
    val currentTrend: TrendRegime,
    val predictedDirection: TrendRegime,
    val bullishProb: Double,
    val bearishProb: Double,
    val neutralProb: Double,
    val lastClosedPrice: BigDecimal,
    val pointTargetPrice: BigDecimal,
    val intervalLowerQ10: BigDecimal,
    val intervalUpperQ90: BigDecimal,
    val expectedHigh: BigDecimal,
    val expectedLow: BigDecimal,
    val modelId: String,
    val modelVersion: String,
    val evaluationMode: ModelEvaluationMode,
    val qualityStatus: QualityStatus,
    val recordHash: String,
    val prevRecordHash: String,
    val acceptedBeforeDeadline: Boolean,
    val actualOutcomeClose: BigDecimal? = null,
    val actualOutcomeDirection: TrendRegime? = null,
    val directionalHit: Boolean? = null,
    val intervalCovered: Boolean? = null,
    val absoluteError: BigDecimal? = null
)

data class WalkForwardStepResult(
    val stepIndex: Int,
    val candleCloseTimeUtcMs: Long,
    val actualNow: BigDecimal,
    val predictedTarget: BigDecimal,
    val lowerQ10: BigDecimal,
    val upperQ90: BigDecimal,
    val actualOutcome: BigDecimal,
    val predictedDirection: TrendRegime,
    val actualDirection: TrendRegime,
    val modelCorrect: Boolean,
    val persistenceCorrect: Boolean,
    val prevDirCorrect: Boolean,
    val smaCorrect: Boolean,
    val intervalCovered: Boolean,
    val brierContribution: Double,
    val quantileLossContribution: Double
)

data class WalkForwardSummary(
    val instrumentId: String,
    val timeframe: ChartTimeframe,
    val horizon: ForecastHorizon,
    val evaluationMode: ModelEvaluationMode,
    val rawPredictionsCount: Int,
    val effectiveSampleSize: Int,
    val purgeWindowCandles: Int,
    val embargoCandles: Int,
    val directionalAccuracyPct: Double,
    val persistenceBaselineAccPct: Double,
    val prevDirectionBaselineAccPct: Double,
    val smaBaselineAccPct: Double,
    val mae: BigDecimal,
    val rmse: BigDecimal,
    val brierScore: Double,
    val quantileLoss: Double,
    val intervalCoveragePct: Double,
    val bullishRegimeAccuracyPct: Double,
    val bearishRegimeAccuracyPct: Double,
    val neutralRegimeAccuracyPct: Double,
    val modelHealthStatus: ModelHealthStatus,
    val steps: List<WalkForwardStepResult>
)

data class ProviderPocProbeResult(
    val id: String,
    val provider: String,
    val instrumentName: String,
    val providerSymbol: String,
    val probeLabel: String,
    val timeframe: String,
    val priceBasis: PriceBasis,
    val status: String,
    val candleCount: Int,
    val firstCandleUtc: String,
    val lastCandleUtc: String,
    val exact15mTransitions: Int,
    val gapCount: Int,
    val sessionExpectedGaps: Int,
    val unexpectedDataGaps: Int,
    val invalidOhlcCount: Int,
    val duplicateTimestamps: Int,
    val nonPositivePrices: Int,
    val notes: String,
    val isLiveExecuted: Boolean = false
)

data class DataImportBatch(
    val batchId: String,
    val instrumentId: String,
    val sourceMethod: String,
    val importedAtUtc: String,
    val recordCount: Int,
    val qualityStatus: QualityStatus,
    val imagePurgedImmediately: Boolean,
    val summaryNote: String
)
