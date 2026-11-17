package es.manico.chartintelligence.forecast

import java.time.Instant
import java.time.ZoneOffset
import java.util.Locale
import kotlin.math.floor
import kotlin.math.min

/**
 * Hierarchical Trading Calendar Registry (v1.0.0)
 * Strictly decoupled from external market-data API providers.
 * Mirrored 1:1 from host_subdomain/assets/js/forecast/calendarRegistry.js.
 */
object ForecastCalendarRegistry {

    const val CALENDAR_REGISTRY_VERSION = "1.0.0"

    private val FIXED_US_HOLIDAYS = setOf("01-01", "12-25")

    data class CalendarSpec(
        val calendarId: String,
        val calendarVersion: String = CALENDAR_REGISTRY_VERSION,
        val ianaTimezone: String,
        val dstAware: Boolean,
        val sundayOpenHourEt: Int,
        val sundayOpenMinuteEt: Int,
        val fridayCloseHourEt: Int,
        val fridayCloseMinuteEt: Int,
        val maintenanceStartHourEt: Int,
        val maintenanceEndHourEt: Int,
        val usesUsHolidays: Boolean,
        val sessionMode: String
    )

    data class NewYorkParts(
        val year: Int,
        val month: Int,
        val day: Int,
        val hour: Int,
        val minute: Int,
        val dow: Int, // 0 = Sun .. 6 = Sat
        val mmdd: String
    )

    data class DstBounds(
        val dstStartUtcMs: Long,
        val dstEndUtcMs: Long
    )

    data class CalendarGapEntry(
        val index: Int,
        val prevOpenMs: Long,
        val curOpenMs: Long,
        val missingOpenBars: Int
    )

    data class CalendarGapReport(
        val gapCount: Int,
        val totalMissingBars: Int,
        val gaps: List<CalendarGapEntry>
    )

    val OTC_SPOT_XAU_TWELVEDATA = CalendarSpec(
        calendarId = "OTC_SPOT_XAU_TWELVEDATA",
        ianaTimezone = "America/New_York",
        dstAware = true,
        sundayOpenHourEt = 18,
        sundayOpenMinuteEt = 0,
        fridayCloseHourEt = 17,
        fridayCloseMinuteEt = 0,
        maintenanceStartHourEt = 17,
        maintenanceEndHourEt = 18,
        usesUsHolidays = true,
        sessionMode = "FUTURES_OTC_23_5"
    )

    val COMEX_GOLD_FUTURES = CalendarSpec(
        calendarId = "COMEX_GOLD_FUTURES",
        ianaTimezone = "America/New_York",
        dstAware = true,
        sundayOpenHourEt = 18,
        sundayOpenMinuteEt = 0,
        fridayCloseHourEt = 17,
        fridayCloseMinuteEt = 0,
        maintenanceStartHourEt = 17,
        maintenanceEndHourEt = 18,
        usesUsHolidays = true,
        sessionMode = "FUTURES_OTC_23_5"
    )

    val ICE_BRENT_CFD = CalendarSpec(
        calendarId = "ICE_BRENT_CFD",
        ianaTimezone = "America/New_York",
        dstAware = true,
        sundayOpenHourEt = 18,
        sundayOpenMinuteEt = 0,
        fridayCloseHourEt = 17,
        fridayCloseMinuteEt = 0,
        maintenanceStartHourEt = 17,
        maintenanceEndHourEt = 20,
        usesUsHolidays = true,
        sessionMode = "BRENT_CFD"
    )

    val OTC_FX_GENERIC = CalendarSpec(
        calendarId = "OTC_FX_GENERIC",
        ianaTimezone = "America/New_York",
        dstAware = true,
        sundayOpenHourEt = 17,
        sundayOpenMinuteEt = 0,
        fridayCloseHourEt = 17,
        fridayCloseMinuteEt = 0,
        maintenanceStartHourEt = -1,
        maintenanceEndHourEt = -1,
        usesUsHolidays = false,
        sessionMode = "FX_24_5"
    )

    val US_EQUITIES = CalendarSpec(
        calendarId = "US_EQUITIES",
        ianaTimezone = "America/New_York",
        dstAware = true,
        sundayOpenHourEt = -1,
        sundayOpenMinuteEt = 0,
        fridayCloseHourEt = 16,
        fridayCloseMinuteEt = 0,
        maintenanceStartHourEt = -1,
        maintenanceEndHourEt = -1,
        usesUsHolidays = true,
        sessionMode = "US_EQUITIES_RTH"
    )

    val CRYPTO_24_7 = CalendarSpec(
        calendarId = "CRYPTO_24_7",
        ianaTimezone = "UTC",
        dstAware = false,
        sundayOpenHourEt = 0,
        sundayOpenMinuteEt = 0,
        fridayCloseHourEt = 24,
        fridayCloseMinuteEt = 0,
        maintenanceStartHourEt = -1,
        maintenanceEndHourEt = -1,
        usesUsHolidays = false,
        sessionMode = "CONTINUOUS_24_7"
    )

    val CALENDAR_PROFILES: Map<String, CalendarSpec> = mapOf(
        "OTC_SPOT_XAU_TWELVEDATA" to OTC_SPOT_XAU_TWELVEDATA,
        "COMEX_GOLD_FUTURES" to COMEX_GOLD_FUTURES,
        "ICE_BRENT_CFD" to ICE_BRENT_CFD,
        "OTC_FX_GENERIC" to OTC_FX_GENERIC,
        "US_EQUITIES" to US_EQUITIES,
        "CRYPTO_24_7" to CRYPTO_24_7
    )

    private val CRYPTO_PREFIXES = listOf(
        "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "BNB", "AVAX",
        "DOT", "LINK", "LTC", "MATIC", "SHIB", "TON", "TRX", "UNI"
    )

    private val EXACT_CRYPTO = setOf(
        "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "ADAUSD", "BNBUSD"
    )

    private val US_EQUITY_SYMBOLS = setOf(
        "SPX500USD", "NAS100", "NAS100USD", "US30", "US500", "US100", "NDQ",
        "NVDA", "AMZN", "TSLA", "AAPL", "GOOGL", "MSFT", "META", "NFLX", "AMD", "UBER", "NKE", "IBM", "SAN",
        "AVGO", "MU", "INTC", "MRVL", "AMAT", "LRCX", "QCOM", "SMCI", "DELL", "SNDK", "ANET",
        "PLTR", "ORCL", "CRM", "ADBE", "CRWD", "CSCO", "APP", "NBIS", "CRWV",
        "SPCX", "RKLB", "GEV", "BE", "IONQ", "RIVN",
        "JPM", "BAC", "GS", "V", "MA", "BRK.B", "BRKB", "HOOD", "MSTR", "PYPL", "COIN",
        "WMT", "COST", "DIS", "SBUX", "MCD", "KO",
        "LLY", "UNH", "PFE", "XOM", "CVX",
        "TSM", "ASML", "SSNLF", "SKHY", "BABA", "NVO", "TM", "SAP", "HSBC", "2222.SR", "2222SR"
    )

    private val nyDstCache = java.util.concurrent.ConcurrentHashMap<Int, DstBounds>()

    private fun getGoodFridayKey(year: Int): String {
        val a = year % 19
        val b = year / 100
        val c = year % 100
        val d = b / 4
        val e = b % 4
        val f = (b + 8) / 25
        val g = (b - f + 1) / 3
        val h = (19 * a + b - d - g + 15) % 30
        val i = c / 4
        val k = c % 4
        val l = (32 + 2 * e + 2 * i - h - k) % 7
        val m = (a + 11 * h + 22 * l) / 451
        val month = (h + l - 7 * m + 114) / 31
        val day = ((h + l - 7 * m + 114) % 31) + 1
        val easterMs = Instant.from(
            java.time.LocalDate.of(year, month, day).atStartOfDay(ZoneOffset.UTC)
        ).toEpochMilli()
        val gfDt = Instant.ofEpochMilli(easterMs - 2L * 86_400_000L).atZone(ZoneOffset.UTC)
        return String.format(Locale.US, "%02d-%02d", gfDt.monthValue, gfDt.dayOfMonth)
    }

    fun resolveCalendarSpec(
        symbolCode: String = "XAUUSD",
        providerId: String = "",
        customCalendar: CalendarSpec? = null
    ): CalendarSpec {
        if (customCalendar != null && customCalendar.calendarId.isNotBlank()) {
            return customCalendar
        }
        val code = symbolCode.trim().uppercase(Locale.US).ifEmpty { "XAUUSD" }
        val prov = providerId.trim().lowercase(Locale.US)

        if (code == "SAMPLE" ||
            code.endsWith("USDT") ||
            code in EXACT_CRYPTO ||
            (CRYPTO_PREFIXES.any { code.startsWith(it) } && (code.endsWith("USD") || code.endsWith("EUR")))
        ) {
            return CRYPTO_24_7
        }

        if (code in US_EQUITY_SYMBOLS ||
            code.contains("SPX") ||
            code.contains("NAS") ||
            code.contains("NDQ") ||
            code.contains("NDX") ||
            code.contains("US100") ||
            code.contains("US500") ||
            code.contains("US30") ||
            code.contains("DJ30")
        ) {
            return US_EQUITIES
        }

        if (code == "SPOTBRENT" || code == "BRENT_FUTURES" || code.contains("BRENT")) {
            return ICE_BRENT_CFD
        }

        if (code.startsWith("XAU") || code.startsWith("XAG") || code == "USOIL") {
            return if (prov.contains("comex") || prov.contains("cme") || prov == "yahoo_finance") {
                COMEX_GOLD_FUTURES
            } else {
                OTC_SPOT_XAU_TWELVEDATA
            }
        }

        return OTC_FX_GENERIC
    }

    fun getNewYorkDstBoundsUtcMs(year: Int): DstBounds {
        return nyDstCache.getOrPut(year) {
            val mar1 = java.time.LocalDate.of(year, 3, 1).atStartOfDay(ZoneOffset.UTC)
            val mar1Dow = mar1.dayOfWeek.value % 7
            val secondSunMarDay = 8 + ((7 - mar1Dow) % 7)
            val dstStartUtcMs = java.time.ZonedDateTime.of(year, 3, secondSunMarDay, 7, 0, 0, 0, ZoneOffset.UTC)
                .toInstant().toEpochMilli()

            val nov1 = java.time.LocalDate.of(year, 11, 1).atStartOfDay(ZoneOffset.UTC)
            val nov1Dow = nov1.dayOfWeek.value % 7
            val firstSunNovDay = 1 + ((7 - nov1Dow) % 7)
            val dstEndUtcMs = java.time.ZonedDateTime.of(year, 11, firstSunNovDay, 6, 0, 0, 0, ZoneOffset.UTC)
                .toInstant().toEpochMilli()

            DstBounds(dstStartUtcMs = dstStartUtcMs, dstEndUtcMs = dstEndUtcMs)
        }
    }

    fun isNewYorkDst(utcEpochMs: Long): Boolean {
        val approxYear = Instant.ofEpochMilli(utcEpochMs).atZone(ZoneOffset.UTC).year
        val bounds = getNewYorkDstBoundsUtcMs(approxYear)
        return utcEpochMs >= bounds.dstStartUtcMs && utcEpochMs < bounds.dstEndUtcMs
    }

    fun getNewYorkParts(epochMs: Long): NewYorkParts {
        val offsetHours = if (isNewYorkDst(epochMs)) -4L else -5L
        val dt = Instant.ofEpochMilli(epochMs + offsetHours * 3_600_000L).atZone(ZoneOffset.UTC)
        val month = dt.monthValue
        val day = dt.dayOfMonth
        return NewYorkParts(
            year = dt.year,
            month = month,
            day = day,
            hour = dt.hour,
            minute = dt.minute,
            dow = dt.dayOfWeek.value % 7,
            mmdd = String.format(Locale.US, "%02d-%02d", month, day)
        )
    }

    fun stepMillisecondsForTimeframe(timeframe: String = "M15"): Long {
        return when (timeframe.trim().uppercase(Locale.US)) {
            "W1" -> 7L * 86_400_000L
            "D1" -> 86_400_000L
            "H4" -> 14_400_000L
            "H1" -> 3_600_000L
            "M30" -> 1_800_000L
            else -> 900_000L
        }
    }

    fun isCalendarHoliday(nyParts: NewYorkParts, spec: CalendarSpec): Boolean {
        if (!spec.usesUsHolidays) return false
        if (nyParts.mmdd in FIXED_US_HOLIDAYS) return true
        return nyParts.mmdd == getGoodFridayKey(nyParts.year)
    }

    fun isMarketOpenForCalendar(epochMs: Long, calendarSpec: CalendarSpec?): Boolean {
        val spec = calendarSpec ?: OTC_SPOT_XAU_TWELVEDATA
        if (spec.sessionMode == "CONTINUOUS_24_7" || (!spec.dstAware && spec.ianaTimezone == "UTC")) {
            return true
        }

        val ny = getNewYorkParts(epochMs)
        if (spec.sessionMode == "US_EQUITIES_RTH") {
            if (ny.dow == 0 || ny.dow == 6) return false
            if (isCalendarHoliday(ny, spec)) return false
            val mins = ny.hour * 60 + ny.minute
            return mins >= 9 * 60 + 30 && mins < 16 * 60
        }

        if (ny.dow == 6) return false
        if (ny.dow == 5) {
            val mins = ny.hour * 60 + ny.minute
            val closeMins = spec.fridayCloseHourEt * 60 + spec.fridayCloseMinuteEt
            if (mins >= closeMins) return false
        }
        if (ny.dow == 0) {
            val mins = ny.hour * 60 + ny.minute
            val openMins = spec.sundayOpenHourEt * 60 + spec.sundayOpenMinuteEt
            return mins >= openMins
        }

        if (isCalendarHoliday(ny, spec)) return false

        if (spec.maintenanceStartHourEt >= 0 && spec.maintenanceEndHourEt > spec.maintenanceStartHourEt) {
            if (ny.hour >= spec.maintenanceStartHourEt && ny.hour < spec.maintenanceEndHourEt) {
                return false
            }
        }
        return true
    }

    fun getCandleCloseMsForCalendar(
        openTimeUtcMs: Long,
        timeframe: String = "M15",
        @Suppress("UNUSED_PARAMETER") calendarSpec: CalendarSpec? = null
    ): Long = openTimeUtcMs + stepMillisecondsForTimeframe(timeframe)

    fun isCandleClosedForCalendar(
        openTimeUtcMs: Long,
        timeframe: String = "M15",
        nowUtcMs: Long = System.currentTimeMillis(),
        calendarSpec: CalendarSpec? = null
    ): Boolean = getCandleCloseMsForCalendar(openTimeUtcMs, timeframe, calendarSpec) <= nowUtcMs

    fun advanceFutureTimestampsWithCalendar(
        lastOpenMs: Long,
        timeframe: String = "M15",
        horizon: Int = 30,
        symbolCode: String = "",
        providerId: String = "",
        customCalendar: CalendarSpec? = null
    ): LongArray {
        val spec = customCalendar ?: resolveCalendarSpec(symbolCode, providerId)
        val stepMs = stepMillisecondsForTimeframe(timeframe)
        val start = if (lastOpenMs > 0L) lastOpenMs else System.currentTimeMillis()
        val out = LongArray(horizon)
        var filled = 0
        var cursor = start
        val maxIterations = horizon * 24 + 480
        var guard = 0

        while (filled < horizon && guard < maxIterations) {
            guard++
            cursor += stepMs
            if (spec.sessionMode == "CONTINUOUS_24_7" || isMarketOpenForCalendar(cursor, spec)) {
                out[filled++] = cursor
            }
        }
        while (filled < horizon) {
            cursor += stepMs
            out[filled++] = cursor
        }
        return out
    }

    fun inspectCalendarGaps(
        openTimesMs: List<Long>,
        timeframe: String = "M15",
        calendarSpec: CalendarSpec? = null
    ): CalendarGapReport {
        val spec = calendarSpec ?: OTC_SPOT_XAU_TWELVEDATA
        val stepMs = stepMillisecondsForTimeframe(timeframe)
        if (openTimesMs.size < 2) {
            return CalendarGapReport(gapCount = 0, totalMissingBars = 0, gaps = emptyList())
        }
        val gaps = ArrayList<CalendarGapEntry>()
        for (i in 1 until openTimesMs.size) {
            val prevMs = openTimesMs[i - 1]
            val curMs = openTimesMs[i]
            if (prevMs <= 0L || curMs <= prevMs) continue
            val diff = curMs - prevMs
            if (diff <= stepMs) continue

            var missingOpenBars = 0
            val maxCheck = min(floor(diff.toDouble() / stepMs.toDouble()).toInt() - 1, 500)
            for (k in 1..maxCheck) {
                val probe = prevMs + k * stepMs
                if (isMarketOpenForCalendar(probe, spec)) {
                    missingOpenBars++
                }
            }
            if (missingOpenBars > 0) {
                gaps.add(
                    CalendarGapEntry(
                        index = i,
                        prevOpenMs = prevMs,
                        curOpenMs = curMs,
                        missingOpenBars = missingOpenBars
                    )
                )
            }
        }
        return CalendarGapReport(
            gapCount = gaps.size,
            totalMissingBars = gaps.sumOf { it.missingOpenBars },
            gaps = gaps
        )
    }
}
