package es.manico.chartintelligence.data.repository

import es.manico.chartintelligence.config.AppConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

data class IntelNewsItem(
    val title: String,
    val url: String,
    val publishedUtc: String,
    val publisher: String,
    val sourceType: String
)

data class IntelSecFiling(
    val form: String,
    val filingDate: String,
    val description: String,
    val url: String,
    val sourceType: String
)

data class IntelMacroEvent(
    val code: String,
    val title: String,
    val scheduledUtc: String,
    val relevance: String,
    val sourceType: String,
    val referenceUrl: String
)

data class IntelIntermarketRow(
    val ticker: String,
    val label: String,
    val lastPrice: Double,
    val changePct: Double,
    val corr60d: Double?,
    val sourceType: String
)

data class SymbolIntelBundle(
    val symbolCode: String,
    val assetClass: String,
    val fetchedAtUtc: String,
    val news: List<IntelNewsItem>,
    val secFilings: List<IntelSecFiling>,
    val secNotice: String?,
    val macroEvents: List<IntelMacroEvent>,
    val intermarket: List<IntelIntermarketRow>
)

/**
 * §2.3: Live External Market Intel Repository querying `symbol_intel.php`
 * (Yahoo Finance RSS, EIA Today in Energy, SEC EDGAR filings for US Equities, Macro schedule & Intermarket correlation).
 */
class SymbolIntelRepository(private val httpClient: OkHttpClient) {

    private val memoryCache = HashMap<String, Pair<Long, SymbolIntelBundle>>()

    suspend fun fetchSymbolIntel(symbolCode: String, forceRefresh: Boolean = false): SymbolIntelBundle? =
        withContext(Dispatchers.IO) {
            val code = symbolCode.trim().uppercase()
            val now = System.currentTimeMillis()
            val cached = memoryCache[code]
            if (!forceRefresh && cached != null && (now - cached.first) < 15 * 60 * 1000L) {
                return@withContext cached.second
            }
            val url = "${AppConfig.API_BASE_URL}symbol_intel.php?symbol=$code" +
                if (forceRefresh) "&refresh=1&_t=$now" else "&_t=$now"
            val req = Request.Builder().url(url).get().build()
            runCatching {
                httpClient.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) return@use null
                    val root = JSONObject(resp.body?.string().orEmpty())
                    if (!root.optBoolean("ok", false)) return@use null
                    val data = root.optJSONObject("data") ?: return@use null

                    val newsArr = data.optJSONArray("news")
                    val news = buildList {
                        if (newsArr != null) {
                            for (i in 0 until newsArr.length()) {
                                val o = newsArr.optJSONObject(i) ?: continue
                                add(
                                    IntelNewsItem(
                                        title = o.optString("title"),
                                        url = o.optString("url"),
                                        publishedUtc = o.optString("published_utc"),
                                        publisher = o.optString("publisher"),
                                        sourceType = o.optString("source_type", "EXTERNAL_LIVE")
                                    )
                                )
                            }
                        }
                    }

                    val secArr = data.optJSONArray("sec_filings")
                    val sec = buildList {
                        if (secArr != null) {
                            for (i in 0 until secArr.length()) {
                                val o = secArr.optJSONObject(i) ?: continue
                                add(
                                    IntelSecFiling(
                                        form = o.optString("form"),
                                        filingDate = o.optString("filing_date"),
                                        description = o.optString("description"),
                                        url = o.optString("url"),
                                        sourceType = o.optString("source_type", "EXTERNAL_LIVE")
                                    )
                                )
                            }
                        }
                    }

                    val macroArr = data.optJSONArray("macro_events")
                    val macro = buildList {
                        if (macroArr != null) {
                            for (i in 0 until macroArr.length()) {
                                val o = macroArr.optJSONObject(i) ?: continue
                                add(
                                    IntelMacroEvent(
                                        code = o.optString("code"),
                                        title = o.optString("title"),
                                        scheduledUtc = o.optString("scheduled_utc"),
                                        relevance = o.optString("relevance", "MEDIUM"),
                                        sourceType = o.optString("source_type", "EXTERNAL_LIVE"),
                                        referenceUrl = o.optString("reference_url")
                                    )
                                )
                            }
                        }
                    }

                    val imArr = data.optJSONArray("intermarket")
                    val intermarket = buildList {
                        if (imArr != null) {
                            for (i in 0 until imArr.length()) {
                                val o = imArr.optJSONObject(i) ?: continue
                                add(
                                    IntelIntermarketRow(
                                        ticker = o.optString("ticker"),
                                        label = o.optString("label"),
                                        lastPrice = o.optDouble("last_price", 0.0),
                                        changePct = o.optDouble("change_pct", 0.0),
                                        corr60d = if (o.isNull("corr_60d")) null else o.optDouble("corr_60d"),
                                        sourceType = o.optString("source_type", "EXTERNAL_LIVE")
                                    )
                                )
                            }
                        }
                    }

                    val bundle = SymbolIntelBundle(
                        symbolCode = data.optString("symbol", code),
                        assetClass = data.optString("asset_class", "COMMODITY"),
                        fetchedAtUtc = data.optString("fetched_at_utc"),
                        news = news,
                        secFilings = sec,
                        secNotice = if (data.isNull("sec_notice")) null else data.optString("sec_notice"),
                        macroEvents = macro,
                        intermarket = intermarket
                    )
                    memoryCache[code] = now to bundle
                    bundle
                }
            }.getOrNull() ?: cached?.second
        }
}
