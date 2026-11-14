package es.manico.chartintelligence.algorithms

import es.manico.chartintelligence.data.model.ProviderId
import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

enum class MarketStatus {
    LIVE,
    MARKET_CLOSED,
    DELAYED,
    CACHED,
    ERROR
}

enum class SessionCalendar {
    CRYPTO_24_7,
    OTC_FX_METALS,
    US_EQUITIES
}

enum class VolumeType {
    REAL_EXCHANGE,
    TICK_ESTIMATED,
    NONE
}

enum class ConnectionStatus {
    CONNECTED_LIVE,
    SYNCING,
    MARKET_CLOSED,
    CACHED_OFFLINE,
    SYNC_ERROR
}

data class InstrumentSpec(
    val symbolCode: String,
    val providerId: String,
    val providerTicker: String,
    val priceBasis: String,
    val timezone: String,
    val sessionCalendar: SessionCalendar,
    val volumeType: VolumeType
)

data class BucketBounds(
    val openMs: Long,
    val closeMs: Long,
    val sessionAnchored: Boolean
)

/**
 * Independent Algorithm Library Module:
 * Anchors all candle timestamps to 00:00:00 UTC (with Monday-anchored W1 weeks),
 * filters out incomplete (still-open) candles, computes DST-aware session day keys,
 * and evaluates session-calendar-aware market status & countdowns.
 */
object UtcTimeAnchorAlgorithm {

    private const val EPOCH_MONDAY_OFFSET_MS = 259_200_000L // 3 days * 86400s * 1000ms (1970-01-01 was Thursday)

    private val nyZone: ZoneId = ZoneId.of("America/New_York")

    private val isoUtcFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm 'UTC'").withZone(ZoneOffset.UTC)

    private val dayKeyFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd")

    private val otcWeekendSymbols = setOf(
        "XAUUSD",
        "XAGUSD",
        "EURUSD",
        "GBPUSD",
        "USDJPY",
        "SPOTBRENT",
        "BRENT_FUTURES",
        "USOIL"
    )

    private val usEquitiesSymbols = setOf(
        "SPX500USD",
        "NDQ",
        "NVDA",
        "AMZN",
        "TSLA",
        "AAPL",
        "GOOGL",
        "MSFT",
        "META",
        "NFLX",
        "AMD",
        "UBER",
        "NKE",
        "IBM",
        "SAN"
    )

    private val legacyChartIdMap = mapOf(
        "SPOTBRENT" to "chart_spotbrent_main",
        "XAUUSD" to "chart_xauusd_main",
        "BRENT_FUTURES" to "chart_brent_futures",
        "SPX500USD" to "chart_spx500usd_index",
        "NDQ" to "chart_ndq_index",
        "ETHUSD" to "chart_ethusd_spot",
        "BTCUSD" to "chart_btcusd_spot",
        "XAGUSD" to "chart_xagusd_spot",
        "EURUSD" to "chart_eurusd_spot",
        "USOIL" to "chart_usoil_spot",
        "GBPUSD" to "chart_gbpusd_spot",
        "USDJPY" to "chart_usdjpy_spot",
        "NVDA" to "chart_nvda_stock",
        "AMZN" to "chart_amzn_stock",
        "TSLA" to "chart_tsla_stock",
        "AAPL" to "chart_aapl_stock",
        "GOOGL" to "chart_googl_stock",
        "MSFT" to "chart_msft_stock",
        "META" to "chart_meta_stock",
        "NFLX" to "chart_nflx_stock",
        "AMD" to "chart_amd_stock",
        "UBER" to "chart_uber_stock",
        "NKE" to "chart_nke_stock",
        "IBM" to "chart_ibm_stock",
        "SAN" to "chart_san_stock"
    )

    fun canonicalChartKey(symbolCode: String, timeframe: String): String {
        val sym = symbolCode.trim().uppercase()
        val tf = timeframe.trim().uppercase().ifBlank { "M15" }
        return "${sym}_${tf}"
    }

    fun legacyChartId(symbolCode: String): String {
        val clean = symbolCode.trim().uppercase().replace(Regex("[^A-Z0-9_]"), "")
        return legacyChartIdMap[clean] ?: "chart_${clean.lowercase()}_custom"
    }

    fun timeframeStepMillis(timeframe: String): Long {
        return when (timeframe.uppercase()) {
            "M15" -> 15L * 60L * 1000L
            "M30" -> 30L * 60L * 1000L
            "H1" -> 60L * 60L * 1000L
            "H4" -> 4L * 60L * 60L * 1000L
            "D1", "1D", "D" -> 24L * 60L * 60L * 1000L
            "W1", "1W", "W" -> 7L * 24L * 60L * 60L * 1000L
            else -> 15L * 60L * 1000L
        }
    }

    /**
     * Floors any epoch millisecond timestamp to its canonical candle open boundary
     * anchored at 00:00:00 UTC (with W1 anchored to Monday 00:00:00 UTC).
     */
    fun snapToCandleOpenUtc(epochMillis: Long, timeframe: String): Long {
        val normTf = timeframe.uppercase()
        val step = timeframeStepMillis(normTf)
        return if (normTf == "W1" || normTf == "1W" || normTf == "W") {
            Math.floorDiv(epochMillis + EPOCH_MONDAY_OFFSET_MS, step) * step - EPOCH_MONDAY_OFFSET_MS
        } else {
            Math.floorDiv(epochMillis, step) * step
        }
    }

    /**
     * DST-aware session-anchored bucket boundaries (ENG-01 parity with UtcTimeAnchor.php & priceFormatter.js).
     * - US_EQUITIES (H4, D1): anchored to 09:30–16:00 America/New_York RTH session.
     * - OTC_FX_METALS (D1): anchored to 17:00 America/New_York rollover.
     * - All other timeframes/calendars: canonical 00:00 UTC / Mon 00:00 UTC.
     */
    fun getSessionBucketBounds(
        epochMillis: Long,
        timeframe: String,
        symbolCode: String = "XAUUSD"
    ): BucketBounds {
        val normTf = timeframe.uppercase()
        val step = timeframeStepMillis(normTf)
        val cal = getSessionCalendar(symbolCode)

        if (cal == SessionCalendar.US_EQUITIES && (normTf == "H1" || normTf == "H4" || normTf == "D1" || normTf == "1D" || normTf == "D")) {
            val nyZdt = ZonedDateTime.ofInstant(Instant.ofEpochMilli(epochMillis), nyZone)
            val date = nyZdt.toLocalDate()
            val rthOpen = date.atTime(9, 30).atZone(nyZone).toInstant().toEpochMilli()
            val rthClose = date.atTime(16, 0).atZone(nyZone).toInstant().toEpochMilli()
            if (normTf == "D1" || normTf == "1D" || normTf == "D") {
                val utcDayOpenMs = snapToCandleOpenUtc(epochMillis, "D1")
                return BucketBounds(
                    openMs = utcDayOpenMs,
                    closeMs = maxOf(utcDayOpenMs + 1, rthClose),
                    sessionAnchored = true
                )
            }
            if (epochMillis in rthOpen until rthClose) {
                val idx = (epochMillis - rthOpen) / step
                val openMs = rthOpen + idx * step
                val closeMs = minOf(rthClose, openMs + step)
                return BucketBounds(openMs = openMs, closeMs = closeMs, sessionAnchored = true)
            }
            val idx = Math.floorDiv(epochMillis - rthOpen, step)
            val openMs = rthOpen + idx * step
            return BucketBounds(openMs = openMs, closeMs = openMs + step, sessionAnchored = true)
        }

        if (cal == SessionCalendar.OTC_FX_METALS && (normTf == "D1" || normTf == "1D" || normTf == "D")) {
            val shifted = Instant.ofEpochMilli(epochMillis).atZone(nyZone).plusHours(7)
            val tradeDate = shifted.toLocalDate()
            val closeZdt = tradeDate.atTime(17, 0).atZone(nyZone)
            val utcDayOpenMs = tradeDate.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
            return BucketBounds(
                openMs = utcDayOpenMs,
                closeMs = closeZdt.toInstant().toEpochMilli(),
                sessionAnchored = true
            )
        }

        val canonicalOpen = snapToCandleOpenUtc(epochMillis, normTf)
        return BucketBounds(openMs = canonicalOpen, closeMs = canonicalOpen + step, sessionAnchored = false)
    }

    fun snapToSessionOpenUtc(
        epochMillis: Long,
        timeframe: String,
        symbolCode: String = "XAUUSD"
    ): Long {
        return getSessionBucketBounds(epochMillis, timeframe, symbolCode).openMs
    }

    /**
     * Returns true only if the candle's session or canonical bucket close is <= [nowUtcMillis],
     * guaranteeing no incomplete/unclosed candle contaminates storage or indicators.
     */
    fun isCandleClosed(
        openTimeUtcMillis: Long,
        timeframe: String,
        nowUtcMillis: Long = System.currentTimeMillis(),
        symbolCode: String? = null
    ): Boolean {
        if (!symbolCode.isNullOrBlank()) {
            val bounds = getSessionBucketBounds(openTimeUtcMillis, timeframe, symbolCode)
            if (bounds.sessionAnchored) {
                return bounds.closeMs <= nowUtcMillis
            }
        }
        val step = timeframeStepMillis(timeframe)
        return (openTimeUtcMillis + step) <= nowUtcMillis
    }

    fun getSessionCalendar(symbolCode: String = "XAUUSD"): SessionCalendar {
        val code = symbolCode.trim().uppercase()
        val cryptoPrefixes = listOf(
            "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "BNB", "AVAX",
            "DOT", "LINK", "LTC", "MATIC", "SHIB", "TON", "TRX", "UNI"
        )
        if (code in setOf("BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "ADAUSD", "BNBUSD") ||
            code.endsWith("USDT") ||
            (cryptoPrefixes.any { code.startsWith(it) } && (code.endsWith("USD") || code.endsWith("USDT") || code.endsWith("EUR")))
        ) {
            return SessionCalendar.CRYPTO_24_7
        }
        if (code in usEquitiesSymbols ||
            code.contains("SPX") || code.contains("NAS") || code.contains("NDQ") ||
            code.contains("NDX") || code.contains("US100") || code.contains("US500") ||
            code.contains("US30") || code.contains("DJ30")
        ) {
            return SessionCalendar.US_EQUITIES
        }
        return SessionCalendar.OTC_FX_METALS
    }

    fun getInstrumentTimezone(symbolCode: String = "XAUUSD"): String {
        return when (getSessionCalendar(symbolCode)) {
            SessionCalendar.CRYPTO_24_7 -> "UTC"
            SessionCalendar.US_EQUITIES -> "America/New_York"
            SessionCalendar.OTC_FX_METALS -> "Etc/GMT+0 (NY 17:00 Rollover)"
        }
    }

    fun getVolumeType(symbolCode: String, provider: ProviderId): VolumeType {
        if (provider == ProviderId.EIA_BRENT_SPOT) return VolumeType.NONE
        val cal = getSessionCalendar(symbolCode)
        if (cal == SessionCalendar.CRYPTO_24_7 || cal == SessionCalendar.US_EQUITIES) {
            return when (provider) {
                ProviderId.YAHOO_FINANCE,
                ProviderId.TWELVE_DATA,
                ProviderId.STOOQ,
                ProviderId.TVDATAFEED,
                ProviderId.BIQUOTE -> VolumeType.REAL_EXCHANGE
                else -> VolumeType.TICK_ESTIMATED
            }
        }
        return VolumeType.TICK_ESTIMATED
    }

    fun resolvePriceBasis(symbolCode: String, provider: ProviderId): String {
        val sym = symbolCode.trim().uppercase()
        return when (provider) {
            ProviderId.EIA_BRENT_SPOT -> "Official FOB Spot"
            ProviderId.DUKASCOPY -> "Interbank Spot"
            ProviderId.BIQUOTE -> "CFD / MT5 Feed"
            ProviderId.STOOQ -> "EOD Historical"
            ProviderId.TWELVE_DATA -> if (sym in usEquitiesSymbols && sym != "SPX500USD" && sym != "NDQ") {
                "Official Exchange"
            } else {
                "Spot REST"
            }
            ProviderId.YAHOO_FINANCE -> when (sym) {
                "SPOTBRENT", "USOIL", "XAUUSD", "XAGUSD", "BRENT_FUTURES" -> "Futures Ref"
                "BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY" -> "Spot FX/Crypto"
                else -> "Official Exchange"
            }
            ProviderId.TVDATAFEED -> when (sym) {
                "SPOTBRENT", "USOIL", "SPX500USD" -> "CFD Feed"
                "XAUUSD", "XAGUSD", "EURUSD", "BTCUSD", "ETHUSD", "GBPUSD", "USDJPY" -> "Spot Feed"
                else -> "Official Exchange"
            }
            ProviderId.LOCAL_CSV -> "Imported Archive"
        }
    }

    fun resolveProviderTicker(symbolCode: String, provider: ProviderId): String {
        val sym = symbolCode.trim().uppercase()
        return when (provider) {
            ProviderId.TVDATAFEED -> when (sym) {
                "SPOTBRENT" -> "PEPPERSTONE:SPOTBRENT"
                "BRENT_FUTURES" -> "NYMEX:BZ1!"
                "USOIL" -> "TVC:USOIL"
                "XAUUSD" -> "OANDA:XAUUSD"
                "XAGUSD" -> "OANDA:XAGUSD"
                "EURUSD" -> "OANDA:EURUSD"
                "GBPUSD" -> "OANDA:GBPUSD"
                "USDJPY" -> "OANDA:USDJPY"
                "BTCUSD" -> "BITSTAMP:BTCUSD"
                "ETHUSD" -> "BITSTAMP:ETHUSD"
                "SPX500USD" -> "OANDA:SPX500USD"
                "NDQ" -> "NASDAQ:NDX"
                "UBER", "NKE", "IBM", "SAN" -> "NYSE:$sym"
                else -> "NASDAQ:$sym"
            }
            ProviderId.BIQUOTE -> if (sym == "SPOTBRENT") "BIQUOTE:UKOIL" else "BIQUOTE:$sym"
            ProviderId.TWELVE_DATA -> when (sym) {
                "XAUUSD" -> "XAU/USD"
                "SPOTBRENT", "BRENT_FUTURES" -> "XBR/USD"
                "USOIL" -> "WTI/USD"
                "XAGUSD" -> "XAG/USD"
                "EURUSD" -> "EUR/USD"
                "GBPUSD" -> "GBP/USD"
                "USDJPY" -> "USD/JPY"
                "BTCUSD" -> "BTC/USD"
                "ETHUSD" -> "ETH/USD"
                "SPX500USD" -> "SPX"
                "NDQ" -> "NDX"
                else -> sym
            }
            ProviderId.DUKASCOPY -> when (sym) {
                "SPOTBRENT" -> "BRENT.CMD/USD"
                "XAUUSD" -> "XAU/USD"
                "XAGUSD" -> "XAG/USD"
                "EURUSD" -> "EUR/USD"
                else -> sym
            }
            ProviderId.YAHOO_FINANCE -> when (sym) {
                "SPOTBRENT", "BRENT_FUTURES" -> "BZ=F"
                "USOIL" -> "CL=F"
                "XAUUSD" -> "GC=F"
                "XAGUSD" -> "SI=F"
                "EURUSD" -> "EURUSD=X"
                "GBPUSD" -> "GBPUSD=X"
                "USDJPY" -> "JPY=X"
                "BTCUSD" -> "BTC-USD"
                "ETHUSD" -> "ETH-USD"
                "SPX500USD" -> "^GSPC"
                "NDQ" -> "^NDX"
                else -> sym
            }
            ProviderId.STOOQ -> when (sym) {
                "SPOTBRENT", "BRENT_FUTURES" -> "CB.F"
                "USOIL" -> "CL.F"
                "SPX500USD" -> "^SPX"
                "NDQ" -> "^NDX"
                "XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "ETHUSD" -> sym
                else -> "$sym.US"
            }
            ProviderId.EIA_BRENT_SPOT -> "EIA:RBRTE"
            ProviderId.LOCAL_CSV -> "LOCAL:$sym"
        }
    }

    fun getInstrumentSpec(symbolCode: String, provider: ProviderId): InstrumentSpec {
        val sym = symbolCode.trim().uppercase()
        return InstrumentSpec(
            symbolCode = sym,
            providerId = provider.id,
            providerTicker = resolveProviderTicker(sym, provider),
            priceBasis = resolvePriceBasis(sym, provider),
            timezone = getInstrumentTimezone(sym),
            sessionCalendar = getSessionCalendar(sym),
            volumeType = getVolumeType(sym, provider)
        )
    }

    /**
     * DST-aware session trading day key (`YYYY-MM-DD`).
     * - Crypto: UTC calendar day
     * - US Equities / Indices: America/New_York calendar day
     * - OTC FX/Metals/Energy: NY 17:00 rollover shifted (+7h from America/New_York)
     */
    fun getSessionDayKey(epochMillis: Long, symbolCode: String = "XAUUSD"): String {
        val instant = Instant.ofEpochMilli(epochMillis)
        return when (getSessionCalendar(symbolCode)) {
            SessionCalendar.CRYPTO_24_7 -> {
                dayKeyFormatter.format(instant.atZone(ZoneOffset.UTC).toLocalDate())
            }
            SessionCalendar.US_EQUITIES -> {
                dayKeyFormatter.format(instant.atZone(nyZone).toLocalDate())
            }
            SessionCalendar.OTC_FX_METALS -> {
                dayKeyFormatter.format(instant.atZone(nyZone).plusHours(7).toLocalDate())
            }
        }
    }

    private fun isUsEquitySessionOpen(epochMillis: Long): Boolean {
        val nyZdt = ZonedDateTime.ofInstant(Instant.ofEpochMilli(epochMillis), nyZone)
        val dow = nyZdt.dayOfWeek
        if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) return false
        val mins = nyZdt.hour * 60 + nyZdt.minute
        return mins in (9 * 60 + 30) until (16 * 60)
    }

    fun isMarketOpen(epochMillis: Long = System.currentTimeMillis(), symbolCode: String = "XAUUSD"): Boolean {
        return !isOtcWeekendClosed(epochMillis, symbolCode)
    }

    /**
     * Returns true if [epochMillis] falls outside active trading hours for [symbolCode]:
     * - CRYPTO_24_7: always open (false)
     * - US_EQUITIES: closed outside Mon–Fri 09:30–16:00 America/New_York
     * - OTC_FX_METALS: closed Friday >= 17:00 America/New_York, Saturday all day, Sunday < 17:00 America/New_York (DST-aware)
     */
    fun isOtcWeekendClosed(epochMillis: Long, symbolCode: String = "XAUUSD"): Boolean {
        return when (getSessionCalendar(symbolCode)) {
            SessionCalendar.CRYPTO_24_7 -> false
            SessionCalendar.US_EQUITIES -> !isUsEquitySessionOpen(epochMillis)
            SessionCalendar.OTC_FX_METALS -> {
                val nyZdt = ZonedDateTime.ofInstant(Instant.ofEpochMilli(epochMillis), nyZone)
                when (nyZdt.dayOfWeek) {
                    DayOfWeek.SATURDAY -> true
                    DayOfWeek.SUNDAY -> nyZdt.hour < 17
                    DayOfWeek.FRIDAY -> nyZdt.hour >= 17
                    else -> false
                }
            }
        }
    }

    fun formatCountdownToBarClose(
        symbolCode: String,
        timeframe: String,
        nowUtcMillis: Long = System.currentTimeMillis(),
        closedLabel: String = "Closed"
    ): String {
        if (!isMarketOpen(nowUtcMillis, symbolCode)) return closedLabel
        val bounds = getSessionBucketBounds(nowUtcMillis, timeframe, symbolCode)
        val remainingSec = ((bounds.closeMs - nowUtcMillis) / 1000L).coerceAtLeast(0L)
        val days = remainingSec / 86400L
        val hours = (remainingSec % 86400L) / 3600L
        val mins = (remainingSec % 3600L) / 60L
        val secs = remainingSec % 60L
        return when {
            days > 0L -> String.format(java.util.Locale.US, "%dd %02d:%02d", days, hours, mins)
            hours > 0L -> String.format(java.util.Locale.US, "%02d:%02d:%02d", hours, mins, secs)
            else -> String.format(java.util.Locale.US, "%02d:%02d", mins, secs)
        }
    }

    /**
     * Evaluates the honest semantic market status for the Top Bar and Status Pill.
     */
    fun determineMarketStatus(
        symbolCode: String,
        timeframe: String,
        lastCandleOpenUtcMillis: Long?,
        nowUtcMillis: Long = System.currentTimeMillis(),
        hasError: Boolean = false
    ): MarketStatus {
        if (hasError) return MarketStatus.ERROR
        if (lastCandleOpenUtcMillis == null || lastCandleOpenUtcMillis <= 0L) {
            return MarketStatus.CACHED
        }
        if (isOtcWeekendClosed(nowUtcMillis, symbolCode)) {
            return MarketStatus.MARKET_CLOSED
        }
        val step = timeframeStepMillis(timeframe)
        val latestExpectedClosedOpen = snapToCandleOpenUtc(nowUtcMillis, timeframe) - step
        val ageSteps = ((latestExpectedClosedOpen - lastCandleOpenUtcMillis) / step).coerceAtLeast(0L)
        return when {
            ageSteps <= 2L -> MarketStatus.LIVE
            ageSteps <= 8L -> MarketStatus.DELAYED
            else -> MarketStatus.CACHED
        }
    }

    fun formatUtcIso(epochMillis: Long): String {
        return isoUtcFormatter.format(Instant.ofEpochMilli(epochMillis))
    }
}
