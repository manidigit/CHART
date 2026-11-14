package es.manico.chartintelligence.forecast

import android.content.SharedPreferences
import es.manico.chartintelligence.data.model.CandleBar
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

class ForecastLedgerStore(
    private val prefs: SharedPreferences? = null
) {
    companion object {
        private const val KEY_LEDGER = "ci_forecast_ledger_v1"
        private const val KEY_LIFECYCLE = "ci_forecast_lifecycle_v1"
        private const val MAX_ENTRIES = 120
        private const val MAX_LIFECYCLE_EVENTS = 240
    }

    private val inMemoryFallback = ArrayList<ForecastLedgerEntry>()
    private val inMemoryLifecycleFallback = ArrayList<ForecastLifecycleEvent>()

    @Synchronized
    fun loadEntries(): List<ForecastLedgerEntry> {
        val raw = prefs?.getString(KEY_LEDGER, null)
        if (raw.isNullOrBlank()) return inMemoryFallback.toList()
        return try {
            val arr = JSONArray(raw)
            val list = ArrayList<ForecastLedgerEntry>(arr.length())
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                list.add(
                    ForecastLedgerEntry(
                        seq = o.optInt("seq", i + 1),
                        contractVersion = o.optString("contractVersion", ForecastSha256.CONTRACT_VERSION),
                        symbolCode = o.optString("symbolCode", ""),
                        timeframe = o.optString("timeframe", "M15"),
                        horizonBars = o.optInt("horizonBars", 30),
                        anchorOpenTimeUtcMs = o.optLong("anchorOpenTimeUtcMs", 0L),
                        anchorClose = o.optDouble("anchorClose", 0.0),
                        forecastStatus = o.optString("forecastStatus", ForecastStatus.PROVISIONAL.name),
                        regime = o.optString("regime", MarketRegime.RANGING.name),
                        inputHash = o.optString("inputHash", ""),
                        terminalMedian = o.optDouble("terminalMedian", 0.0),
                        terminalQ10 = o.optDouble("terminalQ10", 0.0),
                        terminalQ90 = o.optDouble("terminalQ90", 0.0),
                        generatedAtUtcMs = o.optLong("generatedAtUtcMs", 0L),
                        prevForecastHash = o.optString("prevForecastHash", ForecastSha256.GENESIS_HASH),
                        forecastHash = o.optString("forecastHash", ""),
                        syncedToCloud = o.optBoolean("syncedToCloud", false),
                        noEdgeGateState = o.optString("noEdgeGateState", "NO_EDGE_DETECTED"),
                        oodStatus = o.optString("oodStatus", "IN_DISTRIBUTION")
                    )
                )
            }
            list
        } catch (_: Throwable) {
            inMemoryFallback.toList()
        }
    }

    @Synchronized
    fun saveEntries(entries: List<ForecastLedgerEntry>) {
        val trimmed = if (entries.size > MAX_ENTRIES) entries.takeLast(MAX_ENTRIES) else entries
        inMemoryFallback.clear()
        inMemoryFallback.addAll(trimmed)
        if (prefs != null) {
            val arr = JSONArray()
            for (e in trimmed) {
                arr.put(
                    JSONObject().apply {
                        put("seq", e.seq)
                        put("contractVersion", e.contractVersion)
                        put("symbolCode", e.symbolCode)
                        put("timeframe", e.timeframe)
                        put("horizonBars", e.horizonBars)
                        put("anchorOpenTimeUtcMs", e.anchorOpenTimeUtcMs)
                        put("anchorClose", e.anchorClose)
                        put("forecastStatus", e.forecastStatus)
                        put("regime", e.regime)
                        put("inputHash", e.inputHash)
                        put("terminalMedian", e.terminalMedian)
                        put("terminalQ10", e.terminalQ10)
                        put("terminalQ90", e.terminalQ90)
                        put("generatedAtUtcMs", e.generatedAtUtcMs)
                        put("prevForecastHash", e.prevForecastHash)
                        put("forecastHash", e.forecastHash)
                        put("syncedToCloud", e.syncedToCloud)
                        put("noEdgeGateState", e.noEdgeGateState)
                        put("oodStatus", e.oodStatus)
                    }
                )
            }
            prefs.edit().putString(KEY_LEDGER, arr.toString()).apply()
        }
    }

    @Synchronized
    fun loadLifecycleEvents(): List<ForecastLifecycleEvent> {
        val raw = prefs?.getString(KEY_LIFECYCLE, null)
        if (raw.isNullOrBlank()) return inMemoryLifecycleFallback.toList()
        return try {
            val arr = JSONArray(raw)
            val list = ArrayList<ForecastLifecycleEvent>(arr.length())
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val statusStr = o.optString("lifecycleStatus", "ACTIVE")
                val outcomeStr = o.optString("evaluationOutcome", "PENDING")
                val obsVal = if (o.has("observedClose") && !o.isNull("observedClose")) o.optDouble("observedClose") else null
                list.add(
                    ForecastLifecycleEvent(
                        seq = o.optInt("seq", i + 1),
                        forecastHash = o.optString("forecastHash", ""),
                        symbolCode = o.optString("symbolCode", ""),
                        timeframe = o.optString("timeframe", "M15"),
                        horizonStep = o.optInt("horizonStep", 0),
                        lifecycleStatus = runCatching { ForecastLifecycleStatus.valueOf(statusStr) }.getOrDefault(ForecastLifecycleStatus.ACTIVE),
                        evaluationOutcome = runCatching { ForecastEvaluationOutcome.valueOf(outcomeStr) }.getOrDefault(ForecastEvaluationOutcome.PENDING),
                        reason = o.optString("reason", ""),
                        observedClose = obsVal,
                        recordedAtUtcMs = o.optLong("recordedAtUtcMs", 0L),
                        prevEventHash = o.optString("prevEventHash", ForecastSha256.GENESIS_HASH),
                        eventHash = o.optString("eventHash", "")
                    )
                )
            }
            list
        } catch (_: Throwable) {
            inMemoryLifecycleFallback.toList()
        }
    }

    @Synchronized
    fun saveLifecycleEvents(events: List<ForecastLifecycleEvent>) {
        val trimmed = if (events.size > MAX_LIFECYCLE_EVENTS) events.takeLast(MAX_LIFECYCLE_EVENTS) else events
        inMemoryLifecycleFallback.clear()
        inMemoryLifecycleFallback.addAll(trimmed)
        if (prefs != null) {
            val arr = JSONArray()
            for (ev in trimmed) {
                arr.put(
                    JSONObject().apply {
                        put("seq", ev.seq)
                        put("forecastHash", ev.forecastHash)
                        put("symbolCode", ev.symbolCode)
                        put("timeframe", ev.timeframe)
                        put("horizonStep", ev.horizonStep)
                        put("lifecycleStatus", ev.lifecycleStatus.name)
                        put("evaluationOutcome", ev.evaluationOutcome.name)
                        put("reason", ev.reason)
                        if (ev.observedClose != null) put("observedClose", ev.observedClose) else put("observedClose", JSONObject.NULL)
                        put("recordedAtUtcMs", ev.recordedAtUtcMs)
                        put("prevEventHash", ev.prevEventHash)
                        put("eventHash", ev.eventHash)
                    }
                )
            }
            prefs.edit().putString(KEY_LIFECYCLE, arr.toString()).apply()
        }
    }

    fun computeEntryHash(prevHash: String, bodyMap: Map<String, Any?>): String =
        ForecastSha256.sha256Hex("$prevHash|${ForecastSha256.canonicalJson(bodyMap)}")

    fun hasTerminalLifecycleStatus(forecastHash: String, horizonStep: Int? = null): Boolean {
        return loadLifecycleEvents().any { ev ->
            ev.forecastHash == forecastHash &&
                (horizonStep == null || ev.horizonStep == horizonStep) &&
                (ev.lifecycleStatus == ForecastLifecycleStatus.MATURED || ev.lifecycleStatus == ForecastLifecycleStatus.CANCELLED)
        }
    }

    @Synchronized
    fun appendLifecycleEvent(
        forecastHash: String,
        symbolCode: String,
        timeframe: String,
        horizonStep: Int = 0,
        lifecycleStatus: ForecastLifecycleStatus = ForecastLifecycleStatus.ACTIVE,
        evaluationOutcome: ForecastEvaluationOutcome = ForecastEvaluationOutcome.PENDING,
        reason: String = "",
        observedClose: Double? = null,
        recordedAtUtcMs: Long = System.currentTimeMillis()
    ): ForecastLifecycleEvent {
        val events = loadLifecycleEvents().toMutableList()
        val last = events.lastOrNull()
        val prevEventHash = last?.eventHash ?: ForecastSha256.GENESIS_HASH
        val seq = (last?.seq ?: events.size) + 1

        val body = linkedMapOf<String, Any?>(
            "seq" to seq,
            "forecastHash" to forecastHash,
            "symbolCode" to symbolCode,
            "timeframe" to timeframe,
            "horizonStep" to horizonStep,
            "lifecycleStatus" to lifecycleStatus.name,
            "evaluationOutcome" to evaluationOutcome.name,
            "recordedAtUtcMs" to recordedAtUtcMs
        )
        val eventHash = computeEntryHash(prevEventHash, body)
        val ev = ForecastLifecycleEvent(
            seq = seq,
            forecastHash = forecastHash,
            symbolCode = symbolCode,
            timeframe = timeframe,
            horizonStep = horizonStep,
            lifecycleStatus = lifecycleStatus,
            evaluationOutcome = evaluationOutcome,
            reason = reason,
            observedClose = observedClose,
            recordedAtUtcMs = recordedAtUtcMs,
            prevEventHash = prevEventHash,
            eventHash = eventHash
        )
        events.add(ev)
        saveLifecycleEvents(events)
        return ev
    }

    @Synchronized
    fun appendFromForecast(result: ForecastResult): ForecastLedgerEntry? {
        if (result.status == ForecastStatus.DATA_NOT_READY || result.summary == null) return null
        val entries = loadEntries().toMutableList()
        val last = entries.lastOrNull()
        val prevHash = last?.forecastHash ?: ForecastSha256.GENESIS_HASH
        val seq = (last?.seq ?: entries.size) + 1

        val body = linkedMapOf<String, Any?>(
            "seq" to seq,
            "contractVersion" to result.contractVersion,
            "symbolCode" to result.symbolCode,
            "timeframe" to result.timeframe,
            "horizonBars" to result.horizonBars,
            "anchorOpenTimeUtcMs" to result.anchorOpenTimeUtcMs,
            "anchorClose" to result.anchorClose,
            "forecastStatus" to result.status.name,
            "regime" to result.regime.name,
            "inputHash" to result.inputHash,
            "terminalMedian" to result.summary.terminalQ50,
            "terminalQ10" to result.summary.terminalQ10,
            "terminalQ90" to result.summary.terminalQ90,
            "generatedAtUtcMs" to result.generatedAtUtcMs
        )

        val hash = computeEntryHash(prevHash, body)
        val entry = ForecastLedgerEntry(
            seq = seq,
            contractVersion = result.contractVersion,
            symbolCode = result.symbolCode,
            timeframe = result.timeframe,
            horizonBars = result.horizonBars,
            anchorOpenTimeUtcMs = result.anchorOpenTimeUtcMs,
            anchorClose = result.anchorClose,
            forecastStatus = result.status.name,
            regime = result.regime.name,
            inputHash = result.inputHash,
            terminalMedian = result.summary.terminalQ50,
            terminalQ10 = result.summary.terminalQ10,
            terminalQ90 = result.summary.terminalQ90,
            generatedAtUtcMs = result.generatedAtUtcMs,
            prevForecastHash = prevHash,
            forecastHash = hash,
            syncedToCloud = false,
            noEdgeGateState = result.noEdgeGate?.gateState?.name ?: "NO_EDGE_DETECTED",
            oodStatus = result.uncertainty?.oodStatus?.name ?: "IN_DISTRIBUTION"
        )
        entries.add(entry)
        saveEntries(entries)

        val prevSame = entries.dropLast(1).lastOrNull { it.symbolCode == entry.symbolCode && it.timeframe == entry.timeframe }
        if (prevSame != null && !hasTerminalLifecycleStatus(prevSame.forecastHash)) {
            appendLifecycleEvent(
                forecastHash = prevSame.forecastHash,
                symbolCode = prevSame.symbolCode,
                timeframe = prevSame.timeframe,
                horizonStep = prevSame.horizonBars,
                lifecycleStatus = ForecastLifecycleStatus.SUPERSEDED,
                evaluationOutcome = ForecastEvaluationOutcome.PENDING,
                reason = "Superseded by forecast #${entry.seq}",
                observedClose = result.anchorClose
            )
        }

        appendLifecycleEvent(
            forecastHash = hash,
            symbolCode = entry.symbolCode,
            timeframe = entry.timeframe,
            horizonStep = entry.horizonBars,
            lifecycleStatus = ForecastLifecycleStatus.ACTIVE,
            evaluationOutcome = ForecastEvaluationOutcome.PENDING,
            reason = "Immutable snapshot anchored pre-outcome",
            observedClose = null
        )

        return entry
    }

    @Synchronized
    fun evaluateMaturedForecasts(
        candles: List<CandleBar>,
        symbolCode: String = "",
        timeframe: String = ""
    ): List<ForecastLifecycleEvent> {
        val clean = candles.filter { it.close.toDouble() > 0.0 }
        if (clean.isEmpty()) return emptyList()

        val entries = loadEntries().filter {
            (symbolCode.isBlank() || it.symbolCode == symbolCode) &&
                (timeframe.isBlank() || it.timeframe == timeframe)
        }
        val appended = ArrayList<ForecastLifecycleEvent>()

        for (entry in entries) {
            val subBars = clean.filter { it.openTimeUtcMillis > entry.anchorOpenTimeUtcMs }
            if (subBars.isEmpty()) continue

            val checkpoints = listOf(5, 10, entry.horizonBars)
                .filter { it <= entry.horizonBars }
                .distinct()

            for (step in checkpoints) {
                if (hasTerminalLifecycleStatus(entry.forecastHash, step)) continue
                if (subBars.size < step) continue

                val slice = subBars.subList(0, step)
                val obsClose = slice.last().close.toDouble()
                val upperBound = max(entry.anchorClose, entry.terminalQ90)
                val lowerBound = min(entry.anchorClose, entry.terminalQ10)

                val ambiguousHit = slice.any { bar ->
                    bar.high.toDouble() >= upperBound && bar.low.toDouble() <= lowerBound
                }

                val outcome: ForecastEvaluationOutcome
                val reason: String
                when {
                    ambiguousHit -> {
                        outcome = ForecastEvaluationOutcome.AMBIGUOUS
                        reason = "Simultaneous upper/lower corridor touch inside single bar without sub-TF order"
                    }
                    obsClose in entry.terminalQ10..entry.terminalQ90 -> {
                        outcome = ForecastEvaluationOutcome.SUCCESS
                        reason = "Observed close inside [q10, q90] at +${step}b maturity"
                    }
                    else -> {
                        outcome = ForecastEvaluationOutcome.FAILED
                        reason = "Observed close ${String.format(Locale.US, "%.4f", obsClose)} outside 80% corridor"
                    }
                }

                val ev = appendLifecycleEvent(
                    forecastHash = entry.forecastHash,
                    symbolCode = entry.symbolCode,
                    timeframe = entry.timeframe,
                    horizonStep = step,
                    lifecycleStatus = ForecastLifecycleStatus.MATURED,
                    evaluationOutcome = outcome,
                    reason = reason,
                    observedClose = obsClose
                )
                appended.add(ev)
            }
        }
        return appended
    }

    fun verifyLifecycleChain(customEvents: List<ForecastLifecycleEvent>? = null): LifecycleVerifyResult {
        val events = customEvents ?: loadLifecycleEvents()
        if (events.isEmpty()) {
            return LifecycleVerifyResult(true, 0, -1, "Empty lifecycle log")
        }
        for (i in events.indices) {
            val ev = events[i]
            val expectedPrev = if (i == 0) ForecastSha256.GENESIS_HASH else events[i - 1].eventHash
            if (ev.prevEventHash != expectedPrev) {
                return LifecycleVerifyResult(false, events.size, i, "Lifecycle chain break at index $i")
            }
            val body = linkedMapOf<String, Any?>(
                "seq" to ev.seq,
                "forecastHash" to ev.forecastHash,
                "symbolCode" to ev.symbolCode,
                "timeframe" to ev.timeframe,
                "horizonStep" to ev.horizonStep,
                "lifecycleStatus" to ev.lifecycleStatus.name,
                "evaluationOutcome" to ev.evaluationOutcome.name,
                "recordedAtUtcMs" to ev.recordedAtUtcMs
            )
            val expected = computeEntryHash(ev.prevEventHash, body)
            if (ev.eventHash != expected) {
                return LifecycleVerifyResult(false, events.size, i, "Lifecycle SHA-256 tamper at seq #${ev.seq}")
            }
        }
        return LifecycleVerifyResult(true, events.size, -1, "All ${events.size} append-only lifecycle events verified")
    }

    @Synchronized
    fun markSynced(forecastHash: String) {
        val entries = loadEntries().map {
            if (it.forecastHash == forecastHash) it.copy(syncedToCloud = true) else it
        }
        saveEntries(entries)
    }

    fun verifyChain(customEntries: List<ForecastLedgerEntry>? = null): LedgerVerifyResult {
        val entries = customEntries ?: loadEntries()
        if (entries.isEmpty()) {
            return LedgerVerifyResult(true, 0, -1, "Empty ledger")
        }
        for (i in entries.indices) {
            val e = entries[i]
            val expectedPrev = if (i == 0) ForecastSha256.GENESIS_HASH else entries[i - 1].forecastHash
            if (e.prevForecastHash != expectedPrev) {
                return LedgerVerifyResult(false, entries.size, i, "Chain link mismatch at index $i")
            }
            val body = linkedMapOf<String, Any?>(
                "seq" to e.seq,
                "contractVersion" to e.contractVersion,
                "symbolCode" to e.symbolCode,
                "timeframe" to e.timeframe,
                "horizonBars" to e.horizonBars,
                "anchorOpenTimeUtcMs" to e.anchorOpenTimeUtcMs,
                "anchorClose" to e.anchorClose,
                "forecastStatus" to e.forecastStatus,
                "regime" to e.regime,
                "inputHash" to e.inputHash,
                "terminalMedian" to e.terminalMedian,
                "terminalQ10" to e.terminalQ10,
                "terminalQ90" to e.terminalQ90,
                "generatedAtUtcMs" to e.generatedAtUtcMs
            )
            val expectedHash = computeEntryHash(e.prevForecastHash, body)
            if (e.forecastHash != expectedHash) {
                return LedgerVerifyResult(false, entries.size, i, "SHA-256 tamper detected at seq #${e.seq}")
            }
        }
        return LedgerVerifyResult(true, entries.size, -1, "All ${entries.size} SHA-256 hash-chain entries verified")
    }
}
