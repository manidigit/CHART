package es.manico.chartintelligence.algorithms

import es.manico.chartintelligence.data.model.CandleBar
import java.time.Instant
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.util.Locale
import kotlin.math.roundToInt

data class MonthlySeasonalStat(
    val month: Int, // 1..12
    val avgReturnPct: Double,
    val winRatePct: Double,
    val sampleYears: Int
)

data class SeasonalsReport(
    val hasSufficientData: Boolean,
    val distinctMonthCount: Int,
    val yearCount: Int,
    val cells: Map<Pair<Int, Int>, Double>, // (year, month 1..12) -> return %
    val yearsDesc: List<Int>,
    val monthlyStats: List<MonthlySeasonalStat>
)

/**
 * §2.3 · Honest Multi-Year Seasonals + RFC 4180 CSV & Canonical JSON Candle Export.
 * Zero fake numbers: Seasonals requires >= 12 real distinct D1 calendar months.
 */
object CandleExportAlgorithm {

    fun computeMultiYearSeasonals(d1Candles: List<CandleBar>): SeasonalsReport {
        if (d1Candles.isEmpty()) {
            return SeasonalsReport(
                hasSufficientData = false,
                distinctMonthCount = 0,
                yearCount = 0,
                cells = emptyMap(),
                yearsDesc = emptyList(),
                monthlyStats = emptyList()
            )
        }
        val sorted = d1Candles.sortedBy { it.openTimeUtcMillis }
        data class MonthBucket(var firstOpen: Double, var lastClose: Double)
        val buckets = LinkedHashMap<Pair<Int, Int>, MonthBucket>()
        for (bar in sorted) {
            val o = bar.open.toDouble()
            val c = bar.close.toDouble()
            if (o <= 0.0 || c <= 0.0) continue
            val zdt = ZonedDateTime.ofInstant(Instant.ofEpochMilli(bar.openTimeUtcMillis), ZoneOffset.UTC)
            val key = zdt.year to zdt.monthValue
            val existing = buckets[key]
            if (existing == null) {
                buckets[key] = MonthBucket(firstOpen = o, lastClose = c)
            } else {
                existing.lastClose = c
            }
        }

        val distinctCount = buckets.size
        if (distinctCount < 12) {
            return SeasonalsReport(
                hasSufficientData = false,
                distinctMonthCount = distinctCount,
                yearCount = buckets.keys.map { it.first }.distinct().size,
                cells = emptyMap(),
                yearsDesc = emptyList(),
                monthlyStats = emptyList()
            )
        }

        val cells = HashMap<Pair<Int, Int>, Double>()
        val perMonth = Array(13) { ArrayList<Double>() }
        val yearsSet = HashSet<Int>()

        for ((ym, b) in buckets) {
            if (b.firstOpen <= 0.0) continue
            val pct = ((b.lastClose - b.firstOpen) / b.firstOpen) * 100.0
            cells[ym] = (pct * 100.0).roundToInt() / 100.0
            perMonth[ym.second].add(pct)
            yearsSet.add(ym.first)
        }

        val stats = (1..12).map { m ->
            val list = perMonth[m]
            if (list.isEmpty()) {
                MonthlySeasonalStat(m, 0.0, 0.0, 0)
            } else {
                val avg = list.average()
                val wins = list.count { it > 0.0 }
                MonthlySeasonalStat(
                    month = m,
                    avgReturnPct = (avg * 100.0).roundToInt() / 100.0,
                    winRatePct = ((wins * 1000.0) / list.size).roundToInt() / 10.0,
                    sampleYears = list.size
                )
            }
        }

        return SeasonalsReport(
            hasSufficientData = true,
            distinctMonthCount = distinctCount,
            yearCount = yearsSet.size,
            cells = cells,
            yearsDesc = yearsSet.sortedDescending(),
            monthlyStats = stats
        )
    }

    fun formatCandlesCsv(
        symbolCode: String,
        providerId: String,
        timeframe: String,
        candles: List<CandleBar>
    ): String {
        val sb = StringBuilder(candles.size * 64 + 128)
        sb.append("symbol,provider,timeframe,open_time_utc_ms,open_time_utc_iso,open,high,low,close,volume\n")
        for (c in candles) {
            val iso = Instant.ofEpochMilli(c.openTimeUtcMillis).toString()
            sb.append(csvField(symbolCode)).append(',')
                .append(csvField(providerId)).append(',')
                .append(csvField(timeframe)).append(',')
                .append(c.openTimeUtcMillis).append(',')
                .append(csvField(iso)).append(',')
                .append(c.open.toPlainString()).append(',')
                .append(c.high.toPlainString()).append(',')
                .append(c.low.toPlainString()).append(',')
                .append(c.close.toPlainString()).append(',')
                .append(c.volume.toPlainString()).append('\n')
        }
        return sb.toString()
    }

    fun formatCandlesJson(
        symbolCode: String,
        providerId: String,
        timeframe: String,
        candles: List<CandleBar>
    ): String {
        val root = org.json.JSONObject().apply {
            put("schema", "ci_candles_export_v1")
            put("symbol", symbolCode)
            put("provider", providerId)
            put("timeframe", timeframe)
            put("count", candles.size)
            put("exported_at_utc", Instant.now().toString())
            val arr = org.json.JSONArray()
            for (c in candles) {
                arr.put(org.json.JSONObject().apply {
                    put("open_time_utc_ms", c.openTimeUtcMillis)
                    put("open_time_utc_iso", Instant.ofEpochMilli(c.openTimeUtcMillis).toString())
                    put("open", c.open.toDouble())
                    put("high", c.high.toDouble())
                    put("low", c.low.toDouble())
                    put("close", c.close.toDouble())
                    put("volume", c.volume.toDouble())
                })
            }
            put("candles", arr)
        }
        return root.toString(2)
    }

    private fun csvField(raw: String): String {
        if (raw.contains(',') || raw.contains('"') || raw.contains('\n')) {
            return "\"" + raw.replace("\"", "\"\"") + "\""
        }
        return raw
    }
}
