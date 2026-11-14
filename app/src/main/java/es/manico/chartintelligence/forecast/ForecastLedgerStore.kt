package es.manico.chartintelligence.forecast

import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

class ForecastLedgerStore(
    private val prefs: SharedPreferences? = null
) {
    companion object {
        private const val KEY_LEDGER = "ci_forecast_ledger_v1"
        private const val MAX_ENTRIES = 120
    }

    private val inMemoryFallback = ArrayList<ForecastLedgerEntry>()

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
                        syncedToCloud = o.optBoolean("syncedToCloud", false)
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
                    }
                )
            }
            prefs.edit().putString(KEY_LEDGER, arr.toString()).apply()
        }
    }

    fun computeEntryHash(prevHash: String, bodyMap: Map<String, Any?>): String =
        ForecastSha256.sha256Hex("$prevHash|${ForecastSha256.canonicalJson(bodyMap)}")

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
            syncedToCloud = false
        )
        entries.add(entry)
        saveEntries(entries)
        return entry
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
