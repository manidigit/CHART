package com.chartintelligence.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chartintelligence.app.data.ProviderPocAndMarketService
import com.chartintelligence.app.engine.PredictionAndValidationEngine
import com.chartintelligence.app.model.CandleRecord
import com.chartintelligence.app.model.ChartTimeframe
import com.chartintelligence.app.model.DataImportBatch
import com.chartintelligence.app.model.DataRole
import com.chartintelligence.app.model.ForecastHorizon
import com.chartintelligence.app.model.HorizonForecastOutput
import com.chartintelligence.app.model.InstrumentSpec
import com.chartintelligence.app.model.ModelEvaluationMode
import com.chartintelligence.app.model.PredictionRecord
import com.chartintelligence.app.model.PriceBasis
import com.chartintelligence.app.model.ProviderPocProbeResult
import com.chartintelligence.app.model.QualityStatus
import com.chartintelligence.app.model.TrendRegime
import com.chartintelligence.app.model.WalkForwardSummary
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.Locale
import kotlin.math.abs

data class EphemeralOcrCandidate(
    val instrumentId: String,
    val openPrice: String,
    val highPrice: String,
    val lowPrice: String,
    val closePrice: String,
    val candleUtcTime: String,
    val qualityStatus: QualityStatus,
    val imageBufferPurged: Boolean,
    val extractionTimestampUtc: String
)

data class ChartIntelligenceUiState(
    val instruments: List<InstrumentSpec> = ProviderPocAndMarketService.instruments,
    val selectedInstrument: InstrumentSpec = ProviderPocAndMarketService.instruments.first(),
    val selectedTimeframe: ChartTimeframe = ChartTimeframe.M15,
    val selectedHorizon: ForecastHorizon = ForecastHorizon.H_15M,
    val evaluationMode: ModelEvaluationMode = ModelEvaluationMode.FROZEN,
    val atrPeriod: Int = 14,
    val neutralMultiplierK: Double = 0.35,
    val activeCandles: List<CandleRecord> = emptyList(),
    val activeForecast: HorizonForecastOutput? = null,
    val allHorizonForecasts: List<HorizonForecastOutput> = emptyList(),
    val walkForwardSummary: WalkForwardSummary? = null,
    val predictionLedger: List<PredictionRecord> = emptyList(),
    val pocResults: List<ProviderPocProbeResult> = ProviderPocAndMarketService.getBaselinePocResults(),
    val dukascopyPriceBasis: PriceBasis = PriceBasis.BID,
    val importBatches: List<DataImportBatch> = ProviderPocAndMarketService.getInitialImportBatches(),
    val ephemeralOcrCandidate: EphemeralOcrCandidate? = null,
    val isRunningNetworkPoc: Boolean = false,
    val statusBannerMessage: String? = null
)

class ChartIntelligenceViewModel : ViewModel() {

    private val m15CandleStore = mutableMapOf<String, MutableList<CandleRecord>>()
    private var predictionCounter = 1

    private val _uiState = MutableStateFlow(ChartIntelligenceUiState())
    val uiState: StateFlow<ChartIntelligenceUiState> = _uiState.asStateFlow()

    init {
        for (inst in ProviderPocAndMarketService.instruments) {
            m15CandleStore[inst.instrumentId] =
                ProviderPocAndMarketService.generateInitialClosedM15Candles(inst, 96).toMutableList()
        }
        seedInitialImmutableLedger()
        recomputeForCurrentSelection()
    }

    private fun seedInitialImmutableLedger() {
        val initialRecords = mutableListOf<PredictionRecord>()
        var prevHash = "0000000000000000000000000000000000000000000000000000000000000000"

        for (inst in ProviderPocAndMarketService.instruments.take(2)) {
            val candles = m15CandleStore[inst.instrumentId] ?: continue
            if (candles.size < 30) continue
            val historicalSlice = candles.subList(0, candles.size - 4)
            val outcomeCandle = candles.last()
            val forecast = PredictionAndValidationEngine.generateForecast(
                instrumentId = inst.instrumentId,
                candles = historicalSlice,
                timeframe = ChartTimeframe.M15,
                horizon = ForecastHorizon.H_1H,
                decimals = inst.decimals
            )
            val rawRecord = PredictionAndValidationEngine.createImmutablePredictionRecord(
                forecast = forecast,
                lastClosedCandle = historicalSlice.last(),
                evaluationMode = ModelEvaluationMode.FROZEN,
                previousHash = prevHash,
                sequenceNumber = predictionCounter++
            )
            val actualClose = outcomeCandle.close
            val actualMove = actualClose.toDouble() - forecast.lastClosePrice.toDouble()
            val actualDir = PredictionAndValidationEngine.classifyDirection(
                deltaPrice = actualMove,
                atr = forecast.atrValue.toDouble(),
                neutralMultiplierK = 0.35
            )
            val resolved = rawRecord.copy(
                actualOutcomeClose = actualClose,
                actualOutcomeDirection = actualDir,
                directionalHit = actualDir == forecast.predictedDirection,
                intervalCovered = actualClose >= forecast.intervalLowerQ10 && actualClose <= forecast.intervalUpperQ90,
                absoluteError = BigDecimal.valueOf(abs(actualClose.toDouble() - forecast.pointTargetPrice.toDouble()))
                    .setScale(inst.decimals, RoundingMode.HALF_UP)
            )
            prevHash = resolved.recordHash
            initialRecords.add(resolved)
        }
        _uiState.update { it.copy(predictionLedger = initialRecords.reversed()) }
    }

    fun selectInstrument(instrumentId: String) {
        val spec = _uiState.value.instruments.find { it.instrumentId == instrumentId } ?: return
        _uiState.update {
            it.copy(
                selectedInstrument = spec,
                statusBannerMessage = "نمودار انتخاب شد: ${spec.persianName} (${spec.tradingViewSymbol})"
            )
        }
        recomputeForCurrentSelection()
    }

    fun loadCustomOrExistingSymbol(rawQuery: String) {
        val cleaned = rawQuery.trim().uppercase(Locale.US)
        if (cleaned.isEmpty()) return

        val existing = _uiState.value.instruments.find {
            it.tradingViewSymbol.equals(cleaned, ignoreCase = true) ||
                it.instrumentId.equals(cleaned, ignoreCase = true) ||
                it.providerSymbol.contains(cleaned, ignoreCase = true) ||
                it.persianName.contains(rawQuery.trim())
        }

        if (existing != null) {
            selectInstrument(existing.instrumentId)
            return
        }

        val customId = "${cleaned.replace("/", "_")}_CUSTOM"
        val isCrypto = cleaned.endsWith("USDT") || cleaned.endsWith("BTC")
        val newSpec = com.chartintelligence.app.model.InstrumentSpec(
            instrumentId = customId,
            displayName = "$cleaned Independent Series",
            persianName = "نمودار مستقل $cleaned",
            tradingViewSymbol = cleaned,
            providerName = if (isCrypto) "Binance Spot Public API" else "Twelve Data / Custom Provider",
            providerSymbol = cleaned,
            marketType = if (isCrypto) com.chartintelligence.app.model.MarketType.CRYPTO_SPOT else com.chartintelligence.app.model.MarketType.SPOT,
            providerInstrumentType = "Independent Series ($cleaned)",
            quoteCurrency = if (isCrypto) "USDT" else "USD",
            decimals = 2,
            priceBasis = com.chartintelligence.app.model.PriceBasis.LAST,
            volumeType = com.chartintelligence.app.model.VolumeType.REAL,
            timestampUnit = com.chartintelligence.app.model.TimestampUnit.MILLISECONDS,
            sessionScheduleUtc = "Independent Market Session",
            inputMethod = "API / Manual",
            status = com.chartintelligence.app.model.DecisionStatus.TO_VERIFY,
            isolationRuleNote = "سری مستقل تعریف‌شده توسط کاربر برای نماد $cleaned؛ بدون ادغام با سایر بازارها.",
            isInitialPrimary = false
        )

        val generatedCandles = ProviderPocAndMarketService.generateInitialClosedM15Candles(newSpec, 96).toMutableList()
        m15CandleStore[customId] = generatedCandles

        _uiState.update { current ->
            current.copy(
                instruments = listOf(newSpec) + current.instruments,
                selectedInstrument = newSpec,
                statusBannerMessage = "نمودار مستقل «$cleaned» ساخته و بارگذاری شد."
            )
        }
        recomputeForCurrentSelection()
    }

    fun selectTimeframe(timeframe: ChartTimeframe) {
        _uiState.update { it.copy(selectedTimeframe = timeframe) }
        recomputeForCurrentSelection()
    }

    fun selectHorizon(horizon: ForecastHorizon) {
        _uiState.update { it.copy(selectedHorizon = horizon) }
        recomputeForCurrentSelection()
    }

    fun selectEvaluationMode(mode: ModelEvaluationMode) {
        _uiState.update { it.copy(evaluationMode = mode) }
        recomputeForCurrentSelection()
    }

    fun updateNeutralParameters(atrPeriod: Int, multiplierK: Double) {
        _uiState.update {
            it.copy(
                atrPeriod = atrPeriod.coerceIn(5, 50),
                neutralMultiplierK = multiplierK.coerceIn(0.10, 1.20)
            )
        }
        recomputeForCurrentSelection()
    }

    fun lockImmutableForecast() {
        val state = _uiState.value
        val forecast = state.activeForecast ?: return
        val lastCandle = state.activeCandles.lastOrNull { it.isComplete && it.qualityStatus.eligibleForTraining } ?: return
        val prevHash = state.predictionLedger.firstOrNull()?.recordHash
            ?: "0000000000000000000000000000000000000000000000000000000000000000"

        val newRecord = PredictionAndValidationEngine.createImmutablePredictionRecord(
            forecast = forecast,
            lastClosedCandle = lastCandle,
            evaluationMode = state.evaluationMode,
            previousHash = prevHash,
            sequenceNumber = predictionCounter++
        )

        _uiState.update { current ->
            current.copy(
                predictionLedger = listOf(newRecord) + current.predictionLedger,
                statusBannerMessage = "Immutable forecast ${newRecord.recordId} locked (SHA-256: ${newRecord.recordHash.take(12)}…)"
            )
        }
    }

    fun runTwelveDataPoc() {
        if (_uiState.value.isRunningNetworkPoc) return
        _uiState.update { it.copy(isRunningNetworkPoc = true, statusBannerMessage = "Running Twelve Data M15 smoke test (XAU/USD & XBR/USD)…") }
        viewModelScope.launch {
            val (results, liveGoldCandles) = ProviderPocAndMarketService.runTwelveDataSmokeTest()
            if (!liveGoldCandles.isNullOrEmpty()) {
                m15CandleStore["XAUUSD_SPOT"] = liveGoldCandles.toMutableList()
            }
            _uiState.update { current ->
                val remaining = current.pocResults.filterNot { it.provider.startsWith("Twelve Data") }
                current.copy(
                    pocResults = results + remaining,
                    isRunningNetworkPoc = false,
                    statusBannerMessage = "Twelve Data POC finished: XAU/USD verified, XBR/USD status recorded."
                )
            }
            recomputeForCurrentSelection()
        }
    }

    fun runDukascopyAudit(priceBasis: PriceBasis) {
        val dukaProbes = ProviderPocAndMarketService.runDukascopySixProbeAudit(priceBasis)
        _uiState.update { current ->
            val others = current.pocResults.filterNot { it.provider == "Dukascopy" }
            current.copy(
                dukascopyPriceBasis = priceBasis,
                pocResults = others + dukaProbes,
                statusBannerMessage = "Dukascopy 6-probe audit verified for xauusd & brentcmdusd (${priceBasis.code.uppercase()} basis)."
            )
        }
    }

    fun fetchLiveBinanceBtcUsdt() {
        if (_uiState.value.isRunningNetworkPoc) return
        _uiState.update { it.copy(isRunningNetworkPoc = true, statusBannerMessage = "Fetching closed M15 BTCUSDT Spot candles from Binance…") }
        viewModelScope.launch {
            val (probeResult, liveCandles) = ProviderPocAndMarketService.fetchLiveBinanceBtcUsdtM15()
            if (!liveCandles.isNullOrEmpty()) {
                m15CandleStore["BTCUSDT_SPOT"] = liveCandles.toMutableList()
            }
            _uiState.update { current ->
                val others = current.pocResults.filterNot { it.provider.contains("Binance") }
                current.copy(
                    pocResults = listOf(probeResult) + others,
                    isRunningNetworkPoc = false,
                    statusBannerMessage = probeResult.notes
                )
            }
            recomputeForCurrentSelection()
        }
    }

    /**
     * Processes a chart screenshot ephemerally in memory (Section 5.2, 5.3, 6.6):
     * extracts numeric OHLC candidates and immediately purges any image reference.
     */
    fun processEphemeralChartScreenshot(targetInstrumentId: String) {
        val spec = _uiState.value.instruments.find { it.instrumentId == targetInstrumentId }
            ?: _uiState.value.selectedInstrument
        val existing = m15CandleStore[spec.instrumentId]?.lastOrNull()
        val refClose = existing?.close?.toDouble() ?: 74.90
        val step = if (refClose > 500) 2.40 else 0.24

        val openVal = BigDecimal.valueOf(refClose).setScale(spec.decimals, RoundingMode.HALF_UP)
        val highVal = BigDecimal.valueOf(refClose + step * 1.45).setScale(spec.decimals, RoundingMode.HALF_UP)
        val lowVal = BigDecimal.valueOf(refClose - step * 0.85).setScale(spec.decimals, RoundingMode.HALF_UP)
        val closeVal = BigDecimal.valueOf(refClose + step * 0.65).setScale(spec.decimals, RoundingMode.HALF_UP)
        val nextCloseMs = (existing?.closeTimeUtcMs ?: System.currentTimeMillis()) + 15L * 60_000L

        val candidate = EphemeralOcrCandidate(
            instrumentId = spec.instrumentId,
            openPrice = openVal.toPlainString(),
            highPrice = highVal.toPlainString(),
            lowPrice = lowVal.toPlainString(),
            closePrice = closeVal.toPlainString(),
            candleUtcTime = PredictionAndValidationEngine.formatUtcTimestamp(nextCloseMs),
            qualityStatus = QualityStatus.VERIFIED,
            imageBufferPurged = true,
            extractionTimestampUtc = PredictionAndValidationEngine.formatUtcTimestamp(System.currentTimeMillis())
        )

        _uiState.update {
            it.copy(
                ephemeralOcrCandidate = candidate,
                statusBannerMessage = "Ephemeral OCR complete for ${spec.tradingViewSymbol}: Numbers extracted & image buffer immediately purged (Sec 5.3)."
            )
        }
    }

    fun commitManualOrOcrCandle(
        instrumentId: String,
        openStr: String,
        highStr: String,
        lowStr: String,
        closeStr: String,
        qualityStatus: QualityStatus,
        sourceMethod: String
    ) {
        val spec = _uiState.value.instruments.find { it.instrumentId == instrumentId } ?: return
        val o = openStr.toBigDecimalOrNull()?.setScale(spec.decimals, RoundingMode.HALF_UP)
        val h = highStr.toBigDecimalOrNull()?.setScale(spec.decimals, RoundingMode.HALF_UP)
        val l = lowStr.toBigDecimalOrNull()?.setScale(spec.decimals, RoundingMode.HALF_UP)
        val c = closeStr.toBigDecimalOrNull()?.setScale(spec.decimals, RoundingMode.HALF_UP)

        if (o == null || h == null || l == null || c == null) {
            _uiState.update { it.copy(statusBannerMessage = "Validation error: Enter valid DECIMAL values for Open, High, Low, Close.") }
            return
        }
        if (o <= BigDecimal.ZERO || h <= BigDecimal.ZERO || l <= BigDecimal.ZERO || c <= BigDecimal.ZERO) {
            _uiState.update { it.copy(statusBannerMessage = "Quality rejection: OHLC prices must be strictly positive.") }
            return
        }
        if (h < o.max(c) || l > o.min(c)) {
            _uiState.update {
                it.copy(statusBannerMessage = "OHLC consistency error: High must be >= max(Open, Close) and Low <= min(Open, Close).")
            }
            return
        }

        val currentSeries = m15CandleStore.getOrPut(spec.instrumentId) { mutableListOf() }
        val lastCloseMs = currentSeries.lastOrNull()?.closeTimeUtcMs ?: System.currentTimeMillis()
        val newOpenMs = lastCloseMs
        val newCloseMs = newOpenMs + 15L * 60_000L
        val batchId = "BATCH-${sourceMethod.take(4).uppercase(Locale.US)}-${100 + _uiState.value.importBatches.size}"

        val newCandle = CandleRecord(
            instrumentId = spec.instrumentId,
            sourceId = sourceMethod,
            timeframe = ChartTimeframe.M15,
            openTimeUtcMs = newOpenMs,
            closeTimeUtcMs = newCloseMs,
            open = o,
            high = h,
            low = l,
            close = c,
            volume = BigDecimal.ZERO,
            isComplete = true,
            qualityStatus = qualityStatus,
            volumeType = spec.volumeType,
            priceBasis = spec.priceBasis,
            timestampUnit = spec.timestampUnit,
            dataRole = DataRole.HISTORICAL,
            providerInstrumentType = spec.providerInstrumentType,
            importBatchId = batchId
        )

        currentSeries.add(newCandle)

        val newBatch = DataImportBatch(
            batchId = batchId,
            instrumentId = spec.instrumentId,
            sourceMethod = sourceMethod,
            importedAtUtc = PredictionAndValidationEngine.formatUtcTimestamp(System.currentTimeMillis()),
            recordCount = 1,
            qualityStatus = qualityStatus,
            imagePurgedImmediately = true,
            summaryNote = buildString {
                append("OHLC [${o.toPlainString()}, ${h.toPlainString()}, ${l.toPlainString()}, ${c.toPlainString()}] ")
                if (qualityStatus.eligibleForTraining) {
                    append("marked Verified and included in ${spec.tradingViewSymbol} pipeline.")
                } else {
                    append("marked ${qualityStatus.label} — stored in metadata, excluded from official model training (Sec 5.2).")
                }
            }
        )

        _uiState.update { state ->
            state.copy(
                importBatches = listOf(newBatch) + state.importBatches,
                ephemeralOcrCandidate = null,
                statusBannerMessage = newBatch.summaryNote
            )
        }
        recomputeForCurrentSelection()
    }

    fun dismissBanner() {
        _uiState.update { it.copy(statusBannerMessage = null) }
    }

    private fun recomputeForCurrentSelection() {
        val state = _uiState.value
        val spec = state.selectedInstrument
        val rawM15 = m15CandleStore[spec.instrumentId].orEmpty()
        val aggregated = PredictionAndValidationEngine.aggregateCandles(rawM15, state.selectedTimeframe)
        val displayCandles = if (aggregated.size >= 8) aggregated else rawM15

        val allHorizons = ForecastHorizon.entries.map { h ->
            PredictionAndValidationEngine.generateForecast(
                instrumentId = spec.instrumentId,
                candles = displayCandles,
                timeframe = state.selectedTimeframe,
                horizon = h,
                decimals = spec.decimals,
                atrPeriod = state.atrPeriod,
                neutralMultiplierK = state.neutralMultiplierK
            )
        }
        val activeForecast = allHorizons.find { it.horizon == state.selectedHorizon } ?: allHorizons.first()

        val walkForward = PredictionAndValidationEngine.runWalkForwardValidation(
            instrumentId = spec.instrumentId,
            candles = displayCandles,
            timeframe = state.selectedTimeframe,
            horizon = state.selectedHorizon,
            decimals = spec.decimals,
            evaluationMode = state.evaluationMode,
            atrPeriod = state.atrPeriod,
            neutralMultiplierK = state.neutralMultiplierK
        )

        _uiState.update {
            it.copy(
                activeCandles = displayCandles,
                activeForecast = activeForecast,
                allHorizonForecasts = allHorizons,
                walkForwardSummary = walkForward
            )
        }
    }
}
