package es.manico.chartintelligence.forecast

import org.json.JSONObject

class ForecastModelRegistry {

    private data class EntryConfig(
        val plugin: ForecastModelPlugin,
        var enabled: Boolean,
        var weight: Double,
        var params: MutableMap<String, Double>
    )

    private val entries = LinkedHashMap<String, EntryConfig>()

    init {
        registerDefaults()
    }

    fun registerDefaults() {
        listOf(
            NaivePersistenceModel(),
            HistoricalDriftModel(),
            KalmanMomentumModel(),
            GarchVolatilityModel(),
            ArimaEtsModel(),
            GaussianProcessModel(),
            NativeArimaDiffModel(),
            NativeProphetDecompModel(),
            NativeSequenceRecurrentModel(),
            NativeQuantileAttentionModel()
        ).forEach { register(it) }
    }

    fun register(plugin: ForecastModelPlugin): ForecastModelRegistry {
        val existing = entries[plugin.id]
        if (existing == null) {
            entries[plugin.id] = EntryConfig(
                plugin = plugin,
                enabled = plugin.defaultEnabled,
                weight = plugin.defaultWeight,
                params = plugin.defaultParams.toMutableMap()
            )
        } else {
            entries[plugin.id] = existing.copy(plugin = plugin)
        }
        return this
    }

    fun unregister(id: String) {
        entries.remove(id)
    }

    fun getPlugin(id: String): ForecastModelPlugin? = entries[id]?.plugin

    fun listStates(): List<ForecastPluginState> = entries.values.map { e ->
        ForecastPluginState(
            id = e.plugin.id,
            name = e.plugin.name,
            family = e.plugin.family,
            description = e.plugin.description,
            enabled = e.enabled,
            weight = e.weight,
            defaultWeight = e.plugin.defaultWeight,
            params = e.params.toMap(),
            defaultParams = e.plugin.defaultParams.toMap(),
            modelVersion = e.plugin.modelVersion,
            experimentalOnly = e.plugin.experimentalOnly
        )
    }

    internal fun getEnabled(): List<Triple<ForecastModelPlugin, Double, Map<String, Double>>> =
        entries.values.filter { it.enabled && it.weight > 0.0 }
            .map { Triple(it.plugin, it.weight, it.params.toMap()) }

    fun setEnabled(id: String, enabled: Boolean) {
        entries[id]?.enabled = enabled
    }

    fun setWeight(id: String, weight: Double) {
        entries[id]?.weight = weight.coerceIn(0.0, 1.0)
    }

    fun setParam(id: String, key: String, value: Double) {
        if (value.isFinite()) {
            entries[id]?.params?.set(key, value)
        }
    }

    fun resetDefaults() {
        for (e in entries.values) {
            e.enabled = e.plugin.defaultEnabled
            e.weight = e.plugin.defaultWeight
            e.params = e.plugin.defaultParams.toMutableMap()
        }
    }

    /**
     * Deterministic sorted representation included in V2 canonical inputHash.
     */
    fun serializeConfigForHash(): Map<String, Any?> {
        val enabledList = ArrayList<Map<String, Any?>>()
        for ((id, e) in entries) {
            if (!e.enabled || e.weight <= 0.0) continue
            val sortedParams = e.params.toSortedMap().mapValues { it.value }
            enabledList.add(
                linkedMapOf(
                    "id" to id,
                    "sortedParams" to sortedParams,
                    "version" to e.plugin.modelVersion,
                    "weight" to e.weight
                )
            )
        }
        enabledList.sortBy { it["id"] as String }
        return linkedMapOf(
            "enabledModels" to enabledList,
            "registryVersion" to FORECAST_MODEL_REGISTRY_VERSION
        )
    }

    fun serializeToJson(): String {
        val root = JSONObject()
        for ((id, e) in entries) {
            val obj = JSONObject()
            obj.put("enabled", e.enabled)
            obj.put("weight", e.weight)
            val pObj = JSONObject()
            e.params.forEach { (k, v) -> pObj.put(k, v) }
            obj.put("params", pObj)
            root.put(id, obj)
        }
        return root.toString()
    }

    fun applyFromJson(jsonStr: String?) {
        if (jsonStr.isNullOrBlank()) return
        try {
            val root = JSONObject(jsonStr)
            for (id in root.keys()) {
                val e = entries[id] ?: continue
                val patch = root.optJSONObject(id) ?: continue
                if (patch.has("enabled")) e.enabled = patch.optBoolean("enabled", e.enabled)
                if (patch.has("weight")) e.weight = patch.optDouble("weight", e.weight).coerceIn(0.0, 1.0)
                val pObj = patch.optJSONObject("params")
                if (pObj != null) {
                    for (pk in pObj.keys()) {
                        val pv = pObj.optDouble(pk, Double.NaN)
                        if (pv.isFinite()) e.params[pk] = pv
                    }
                }
            }
        } catch (_: Throwable) {
            // Keep existing defaults on malformed JSON
        }
    }

    companion object {
        val defaultForecastRegistry = ForecastModelRegistry()

        fun resolveRemoteWorkerStatus(workerUrl: String): RemoteWorkerSummary {
            val trimmed = workerUrl.trim()
            if (trimmed.isEmpty()) {
                return RemoteWorkerSummary(
                    status = RemoteWorkerStatus.LOCAL_STATISTICAL_ONLY,
                    configured = false,
                    url = ""
                )
            }
            return RemoteWorkerSummary(
                status = RemoteWorkerStatus.UNCONFIGURED,
                configured = true,
                url = trimmed
            )
        }
    }
}
