package es.manico.chartintelligence.algorithms

import es.manico.chartintelligence.data.model.CandleBar
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Phase 3 Historical Data Import & Normalization Engine (Kotlin Mirror).
 * Supports CSV/TSV (OHLCV & DataHub 2-column daily series), EIA RBRTEd.xls
 * (Binary BIFF8 OLE2, SpreadsheetML XML, HTML table, TSV), Canonical JSON, and Manual OHLC.
 *
 * Security Policy: Strictly rejects image uploads (PNG, JPEG, WEBP, GIF, BMP, SVG).
 * Never fabricates intraday bars from 2-column daily series.
 */
object CandleImportAlgorithm {

    data class ImportParseResult(
        val ok: Boolean,
        val errorCode: String? = null,
        val detectedFormat: String = "UNKNOWN",
        val forcedDailyOnly: Boolean = false,
        val effectiveTimeframe: String = "D1",
        val rowsTotal: Int = 0,
        val rowsSkipped: Int = 0,
        val candles: List<CandleBar> = emptyList()
    )

    fun isImagePayload(bytes: ByteArray, fileName: String = "", mimeType: String = ""): Boolean {
        val mime = mimeType.trim().lowercase(Locale.US)
        if (mime.startsWith("image/")) return true
        val ext = fileName.substringAfterLast('.', "").lowercase(Locale.US)
        if (ext in setOf("png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "ico", "heic", "avif", "tif", "tiff")) {
            return true
        }
        if (bytes.size >= 4) {
            if (bytes[0] == 0x89.toByte() && bytes[1] == 0x50.toByte() && bytes[2] == 0x4E.toByte() && bytes[3] == 0x47.toByte()) return true
            if (bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() && bytes[2] == 0xFF.toByte()) return true
            if (bytes[0] == 0x47.toByte() && bytes[1] == 0x49.toByte() && bytes[2] == 0x46.toByte() && bytes[3] == 0x38.toByte()) return true
            if (bytes.size >= 12 &&
                bytes[0] == 0x52.toByte() && bytes[1] == 0x49.toByte() && bytes[2] == 0x46.toByte() && bytes[3] == 0x46.toByte() &&
                bytes[8] == 0x57.toByte() && bytes[9] == 0x45.toByte() && bytes[10] == 0x42.toByte() && bytes[11] == 0x50.toByte()
            ) return true
            if (bytes[0] == 0x42.toByte() && bytes[1] == 0x4D.toByte() && bytes.size > 14 && bytes[6] == 0.toByte() && bytes[7] == 0.toByte()) return true
        }
        val head = String(bytes, 0, min(bytes.size, 256), StandardCharsets.UTF_8).trimStart().lowercase(Locale.US)
        if (head.startsWith("<svg") || Regex("^<\\?xml[^>]*>\\s*<svg\\b", RegexOption.IGNORE_CASE).containsMatchIn(head)) return true
        return false
    }

    fun parseHistoricalBytes(
        bytes: ByteArray,
        fileName: String = "",
        requestedTf: String = "D1",
        mimeType: String = ""
    ): ImportParseResult {
        if (isImagePayload(bytes, fileName, mimeType)) {
            return ImportParseResult(
                ok = false,
                errorCode = "ERR_IMAGE_UPLOAD_FORBIDDEN",
                detectedFormat = "IMAGE_REJECTED",
                effectiveTimeframe = requestedTf
            )
        }
        val tf = requestedTf.trim().uppercase(Locale.US).let {
            if (it in setOf("M15", "M30", "H1", "H4", "D1", "W1")) it else "D1"
        }
        if (bytes.isEmpty()) {
            return ImportParseResult(ok = false, errorCode = "EMPTY_INPUT", detectedFormat = "EMPTY", effectiveTimeframe = tf)
        }

        // Binary BIFF8 OLE2 (.xls): D0 CF 11 E0 A1 B1 1A E1
        if (bytes.size >= 512 &&
            bytes[0] == 0xD0.toByte() && bytes[1] == 0xCF.toByte() && bytes[2] == 0x11.toByte() && bytes[3] == 0xE0.toByte() &&
            bytes[4] == 0xA1.toByte() && bytes[5] == 0xB1.toByte() && bytes[6] == 0x1A.toByte() && bytes[7] == 0xE1.toByte()
        ) {
            return normalizeTabularRows(parseBiff8Ole2Rows(bytes), "XLS_BIFF8", tf)
        }

        var text = String(bytes, StandardCharsets.UTF_8)
        if (text.startsWith("\uFEFF")) text = text.substring(1)
        val head = text.take(4096).trimStart()

        if (head.startsWith("{") || head.startsWith("[")) {
            val jsonRes = runCatching { parseJsonText(text, tf) }.getOrNull()
            if (jsonRes != null) return jsonRes
        }

        if (Regex("<(?:ss:)?Workbook\\b|<Worksheet\\b", RegexOption.IGNORE_CASE).containsMatchIn(head)) {
            return normalizeTabularRows(parseSpreadsheetMlRows(text), "XLS_XML", tf)
        }

        if (Regex("<table\\b|<tr\\b", RegexOption.IGNORE_CASE).containsMatchIn(head)) {
            return normalizeTabularRows(parseHtmlTableRows(text), "XLS_HTML", tf)
        }

        return normalizeTabularRows(parseDelimitedRows(text), "CSV", tf)
    }

    fun buildManualCandle(
        dateTimeInput: String,
        open: Double?,
        high: Double?,
        low: Double?,
        close: Double,
        volume: Double = 0.0,
        timeframe: String = "D1"
    ): CandleBar? {
        val openMs = parseTimestampMs(dateTimeInput) ?: return null
        if (!close.isFinite() || close <= 0.0) return null
        val o = open?.takeIf { it.isFinite() && it > 0.0 } ?: close
        val h = high?.takeIf { it.isFinite() } ?: max(o, close)
        val l = low?.takeIf { it.isFinite() } ?: min(o, close)
        val tf = timeframe.trim().uppercase(Locale.US).let {
            if (it in setOf("M15", "M30", "H1", "H4", "D1", "W1")) it else "D1"
        }
        val aligned = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(openMs, tf)
        return CandleValidatorAlgorithm.sanitizeAndValidate(
            rawOpenTimeMillis = aligned,
            timeframe = tf,
            open = BigDecimal.valueOf(o),
            high = BigDecimal.valueOf(max(h, max(o, close))),
            low = BigDecimal.valueOf(min(l, min(o, close))),
            close = BigDecimal.valueOf(close),
            volume = BigDecimal.valueOf(max(0.0, volume))
        )
    }

    private fun parseJsonText(text: String, requestedTf: String): ImportParseResult {
        val trimmed = text.trim()
        val arr = if (trimmed.startsWith("[")) {
            JSONArray(trimmed)
        } else {
            val root = JSONObject(trimmed)
            root.optJSONArray("candles")
                ?: root.optJSONObject("data")?.optJSONArray("candles")
                ?: return ImportParseResult(ok = false, errorCode = "INVALID_JSON_SCHEMA", detectedFormat = "JSON", effectiveTimeframe = requestedTf)
        }
        val byTime = LinkedHashMap<Long, CandleBar>()
        var skipped = 0
        var prevClose: Double? = null
        var sawFullOhlc = false
        for (i in 0 until arr.length()) {
            val item = arr.optJSONObject(i)
            if (item == null) {
                skipped++
                continue
            }
            val tRaw: Any? = item.opt("open_time_utc_ms")
                ?: item.opt("open_time_utc_iso")
                ?: item.opt("t")
                ?: item.opt("time")
                ?: item.opt("date")
                ?: item.opt("timestamp")
            val openMs = parseTimestampMs(tRaw)
            val cVal = parseNumeric(item.opt("close") ?: item.opt("c") ?: item.opt("price") ?: item.opt("value"))
            if (openMs == null || cVal == null || cVal <= 0.0) {
                skipped++
                continue
            }
            if (item.has("open") || item.has("o")) sawFullOhlc = true
            val oVal = parseNumeric(item.opt("open") ?: item.opt("o")) ?: prevClose ?: cVal
            val hVal = parseNumeric(item.opt("high") ?: item.opt("h")) ?: max(oVal, cVal)
            val lVal = parseNumeric(item.opt("low") ?: item.opt("l")) ?: min(oVal, cVal)
            val vVal = max(0.0, parseNumeric(item.opt("volume") ?: item.opt("v")) ?: 0.0)
            prevClose = cVal
            val tf = if (sawFullOhlc) requestedTf else "D1"
            val san = CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = openMs,
                timeframe = tf,
                open = BigDecimal.valueOf(oVal),
                high = BigDecimal.valueOf(hVal),
                low = BigDecimal.valueOf(lVal),
                close = BigDecimal.valueOf(cVal),
                volume = BigDecimal.valueOf(vVal)
            )
            if (san != null) byTime[san.openTimeUtcMillis] = san else skipped++
        }
        val candles = byTime.values.sortedBy { it.openTimeUtcMillis }
        val forcedDailyOnly = !sawFullOhlc && candles.isNotEmpty()
        return ImportParseResult(
            ok = candles.isNotEmpty(),
            errorCode = if (candles.isNotEmpty()) null else "NO_VALID_CANDLES",
            detectedFormat = "JSON",
            forcedDailyOnly = forcedDailyOnly,
            effectiveTimeframe = if (forcedDailyOnly) "D1" else requestedTf,
            rowsTotal = arr.length(),
            rowsSkipped = skipped,
            candles = candles
        )
    }

    private data class ColMap(
        val time: Int,
        val open: Int?,
        val high: Int?,
        val low: Int?,
        val close: Int,
        val volume: Int?
    )

    private fun normalizeTabularRows(rows: List<List<Any>>, format: String, requestedTf: String): ImportParseResult {
        val total = rows.size
        if (total == 0) {
            return ImportParseResult(ok = false, errorCode = "NO_PARSABLE_ROWS", detectedFormat = format, effectiveTimeframe = requestedTf)
        }
        var colMap: ColMap? = null
        var headerIdx = -1
        val scanLimit = min(20, total)
        for (i in 0 until scanLimit) {
            val mapped = detectHeaderColumns(rows[i])
            if (mapped != null) {
                colMap = mapped
                headerIdx = i
                break
            }
        }
        var isTwoColDaily = false
        if (colMap != null) {
            isTwoColDaily = colMap.open == null && colMap.high == null && colMap.low == null
        } else {
            for (i in 0 until scanLimit) {
                val r = rows[i]
                if (r.size >= 5 && parseTimestampMs(r[0]) != null &&
                    parseNumeric(r[1]) != null && parseNumeric(r[2]) != null && parseNumeric(r[3]) != null && parseNumeric(r[4]) != null
                ) {
                    colMap = ColMap(0, 1, 2, 3, 4, if (r.size > 5) 5 else null)
                    headerIdx = i - 1
                    break
                }
                if (r.size >= 2 && parseTimestampMs(r[0]) != null && parseNumeric(r[1]) != null) {
                    colMap = ColMap(0, null, null, null, 1, null)
                    headerIdx = i - 1
                    isTwoColDaily = true
                    break
                }
            }
        }
        if (colMap == null) {
            return ImportParseResult(
                ok = false,
                errorCode = "UNRECOGNIZED_SCHEMA",
                detectedFormat = format,
                effectiveTimeframe = requestedTf,
                rowsTotal = total,
                rowsSkipped = total
            )
        }

        val forcedDailyOnly = isTwoColDaily
        val effectiveTf = if (forcedDailyOnly) "D1" else requestedTf
        val startIdx = max(0, headerIdx + 1)

        data class RawBar(val openMs: Long, val open: Double, val high: Double, val low: Double, val close: Double, val vol: Double)
        val rawByMs = LinkedHashMap<Long, RawBar>()
        var skipped = 0
        for (i in startIdx until total) {
            val r = rows[i]
            if (r.size < 2) continue
            val openMs = parseTimestampMs(r.getOrNull(colMap.time))
            val cVal = parseNumeric(r.getOrNull(colMap.close))
            if (openMs == null || openMs <= 0L || cVal == null || cVal <= 0.0) {
                skipped++
                continue
            }
            if (isTwoColDaily) {
                rawByMs[openMs] = RawBar(openMs, cVal, cVal, cVal, cVal, 0.0)
            } else {
                val oVal = parseNumeric(colMap.open?.let { r.getOrNull(it) }) ?: cVal
                val hVal = parseNumeric(colMap.high?.let { r.getOrNull(it) }) ?: max(oVal, cVal)
                val lVal = parseNumeric(colMap.low?.let { r.getOrNull(it) }) ?: min(oVal, cVal)
                val vVal = max(0.0, parseNumeric(colMap.volume?.let { r.getOrNull(it) }) ?: 0.0)
                rawByMs[openMs] = RawBar(openMs, oVal, hVal, lVal, cVal, vVal)
            }
        }

        val sorted = rawByMs.values.sortedBy { it.openMs }
        val candles = ArrayList<CandleBar>(sorted.size)
        var prevClose: Double? = null
        for (rb in sorted) {
            val open = if (isTwoColDaily) (prevClose ?: rb.close) else rb.open
            val close = rb.close
            val high = if (isTwoColDaily) max(open, close) else rb.high
            val low = if (isTwoColDaily) min(open, close) else rb.low
            val vol = if (isTwoColDaily) 0.0 else rb.vol
            prevClose = close
            val san = CandleValidatorAlgorithm.sanitizeAndValidate(
                rawOpenTimeMillis = rb.openMs,
                timeframe = effectiveTf,
                open = BigDecimal.valueOf(open),
                high = BigDecimal.valueOf(high),
                low = BigDecimal.valueOf(low),
                close = BigDecimal.valueOf(close),
                volume = BigDecimal.valueOf(vol)
            )
            if (san != null) candles.add(san) else skipped++
        }

        return ImportParseResult(
            ok = candles.isNotEmpty(),
            errorCode = if (candles.isNotEmpty()) null else "NO_VALID_CANDLES",
            detectedFormat = format,
            forcedDailyOnly = forcedDailyOnly,
            effectiveTimeframe = effectiveTf,
            rowsTotal = max(0, total - startIdx),
            rowsSkipped = skipped,
            candles = candles
        )
    }

    private fun detectHeaderColumns(row: List<Any>): ColMap? {
        var time: Int? = null
        var open: Int? = null
        var high: Int? = null
        var low: Int? = null
        var close: Int? = null
        var volume: Int? = null
        row.forEachIndexed { idx, cell ->
            val norm = cell.toString().trim().lowercase(Locale.US).replace(Regex("\\s+"), " ")
            if (norm.isEmpty()) return@forEachIndexed
            if (time == null && (norm in setOf("date", "time", "datetime", "timestamp", "open_time_utc_ms", "open_time_utc_iso", "open_time_utc", "period") || norm.contains("date"))) {
                time = idx
                return@forEachIndexed
            }
            if (open == null && (norm == "open" || norm == "o" || norm.startsWith("open "))) {
                open = idx
                return@forEachIndexed
            }
            if (high == null && (norm == "high" || norm == "h" || norm.startsWith("high "))) {
                high = idx
                return@forEachIndexed
            }
            if (low == null && (norm == "low" || norm == "l" || norm.startsWith("low "))) {
                low = idx
                return@forEachIndexed
            }
            if (close == null && (norm in setOf("close", "c", "price", "value", "spot", "brent", "rbrte") || norm.contains("brent") || norm.contains("spot price") || norm.contains("dollars per barrel"))) {
                close = idx
                return@forEachIndexed
            }
            if (volume == null && (norm == "volume" || norm == "vol" || norm == "v")) {
                volume = idx
            }
        }
        return if (time != null && close != null) ColMap(time!!, open, high, low, close!!, volume) else null
    }

    private fun parseDelimitedRows(text: String): List<List<Any>> {
        val lines = text.split(Regex("\r\n|\n|\r"))
        var delim = ','
        for (sample in lines.take(10)) {
            if (sample.contains('\t') && !sample.contains(',')) { delim = '\t'; break }
            if (sample.contains(';') && !sample.contains(',')) { delim = ';'; break }
        }
        val rows = ArrayList<List<Any>>()
        for (line in lines) {
            val t = line.trim()
            if (t.isNotEmpty()) rows.add(parseCsvLine(t, delim))
        }
        return rows
    }

    private fun parseCsvLine(line: String, delim: Char): List<String> {
        val cells = ArrayList<String>()
        val cur = StringBuilder()
        var inQuotes = false
        var i = 0
        while (i < line.length) {
            val ch = line[i]
            if (ch == '"') {
                if (inQuotes && i + 1 < line.length && line[i + 1] == '"') {
                    cur.append('"')
                    i++
                } else {
                    inQuotes = !inQuotes
                }
            } else if (ch == delim && !inQuotes) {
                cells.add(cur.toString().trim())
                cur.setLength(0)
            } else {
                cur.append(ch)
            }
            i++
        }
        cells.add(cur.toString().trim())
        return cells
    }

    private fun parseSpreadsheetMlRows(xml: String): List<List<Any>> {
        val rows = ArrayList<List<Any>>()
        val rowRe = Regex("<(?:\\w+:)?Row\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?Row>", RegexOption.IGNORE_CASE)
        val cellRe = Regex("<(?:\\w+:)?Cell\\b([^>]*)>([\\s\\S]*?)</(?:\\w+:)?Cell>", RegexOption.IGNORE_CASE)
        val dataRe = Regex("<(?:\\w+:)?Data\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?Data>", RegexOption.IGNORE_CASE)
        val idxRe = Regex("(?:ss:)?Index=[\"'](\\d+)[\"']", RegexOption.IGNORE_CASE)
        for (rm in rowRe.findAll(xml)) {
            val cells = ArrayList<String>()
            var colCursor = 0
            for (cm in cellRe.findAll(rm.groupValues[1])) {
                val im = idxRe.find(cm.groupValues[1])
                if (im != null) {
                    val target = max(0, (im.groupValues[1].toIntOrNull() ?: 1) - 1)
                    while (colCursor < target) { cells.add(""); colCursor++ }
                }
                val dm = dataRe.find(cm.groupValues[2])
                val raw = dm?.groupValues?.get(1)?.replace(Regex("<[^>]+>"), "")?.trim().orEmpty()
                cells.add(raw)
                colCursor++
            }
            if (cells.isNotEmpty()) rows.add(cells)
        }
        return rows
    }

    private fun parseHtmlTableRows(html: String): List<List<Any>> {
        val rows = ArrayList<List<Any>>()
        val trRe = Regex("<tr\\b[^>]*>([\\s\\S]*?)</tr>", RegexOption.IGNORE_CASE)
        val tdRe = Regex("<t[dh]\\b[^>]*>([\\s\\S]*?)</t[dh]>", RegexOption.IGNORE_CASE)
        for (trm in trRe.findAll(html)) {
            val cells = ArrayList<String>()
            for (tdm in tdRe.findAll(trm.groupValues[1])) {
                cells.add(tdm.groupValues[1].replace(Regex("<[^>]+>"), "").replace("&nbsp;", " ", ignoreCase = true).trim())
            }
            if (cells.isNotEmpty()) rows.add(cells)
        }
        return rows
    }

    /**
     * Pure Kotlin BIFF8 OLE2 (.xls) parser supporting regular FAT + DIFAT + MiniFAT streams.
     */
    fun parseBiff8Ole2Rows(bytes: ByteArray): List<List<Any>> {
        if (bytes.size < 512) return emptyList()
        val rawShift = u16(bytes, 30)
        val sectorShift = if (rawShift in 9..12) rawShift else 9
        val sectorSize = 1 shl sectorShift
        val miniShift = u16(bytes, 32)
        val miniSize = if (miniShift in 6..9) (1 shl miniShift) else 64

        val numFatSectors = u32(bytes, 44).toInt()
        val dirFirstSector = i32(bytes, 48)
        val miniCutoff = u32(bytes, 56).let { if (it == 0L) 4096L else it }.toInt()
        val miniFatFirst = i32(bytes, 60)
        val numMiniFat = u32(bytes, 64).toInt()
        var difatSec = i32(bytes, 68)
        val numDifat = u32(bytes, 72).toInt()

        val fatSectors = ArrayList<Int>()
        for (i in 0 until 109) {
            if (fatSectors.size >= numFatSectors) break
            val s = i32(bytes, 76 + i * 4)
            if (s >= 0) fatSectors.add(s)
        }
        val perDifat = (sectorSize / 4) - 1
        var dGuard = 0
        while (difatSec >= 0 && fatSectors.size < numFatSectors && dGuard < numDifat + 4) {
            dGuard++
            val off = 512 + difatSec * sectorSize
            if (off + sectorSize > bytes.size) break
            for (i in 0 until perDifat) {
                if (fatSectors.size >= numFatSectors) break
                val s = i32(bytes, off + i * 4)
                if (s >= 0) fatSectors.add(s)
            }
            difatSec = i32(bytes, off + sectorSize - 4)
        }

        val fat = ArrayList<Int>(fatSectors.size * (sectorSize / 4))
        for (fSec in fatSectors) {
            val off = 512 + fSec * sectorSize
            if (off + sectorSize > bytes.size) break
            var i = 0
            while (i < sectorSize) {
                fat.add(i32(bytes, off + i))
                i += 4
            }
        }

        fun readChain(startSec: Int, maxBytes: Int = 0): ByteArray {
            if (startSec < 0) return ByteArray(0)
            val chunks = ArrayList<ByteArray>()
            var total = 0
            var sec = startSec
            var steps = 0
            while (sec >= 0 && steps < 200000) {
                steps++
                val off = 512 + sec * sectorSize
                if (off >= bytes.size) break
                val end = min(bytes.size, off + sectorSize)
                val slice = bytes.copyOfRange(off, end)
                chunks.add(slice)
                total += slice.size
                if (maxBytes > 0 && total >= maxBytes) break
                sec = if (sec < fat.size) fat[sec] else -2
            }
            val targetLen = if (maxBytes > 0) min(total, maxBytes) else total
            val out = ByteArray(targetLen)
            var pos = 0
            for (c in chunks) {
                val rem = targetLen - pos
                if (rem <= 0) break
                val take = min(c.size, rem)
                System.arraycopy(c, 0, out, pos, take)
                pos += take
            }
            return out
        }

        val dirBytes = readChain(dirFirstSector, 0)
        if (dirBytes.size < 128) return emptyList()
        var rootStart = -1
        var rootSize = 0
        var wbStart = -1
        var wbSize = 0

        var off = 0
        while (off + 128 <= dirBytes.size) {
            val objType = dirBytes[off + 66].toInt() and 0xFF
            val nameLen = u16(dirBytes, off + 64)
            val sb = StringBuilder()
            var c = 0
            while (c + 1 < min(nameLen, 64)) {
                val ch = u16(dirBytes, off + c)
                if (ch == 0) break
                sb.append(ch.toChar())
                c += 2
            }
            val lower = sb.toString().lowercase(Locale.US)
            val startSec = i32(dirBytes, off + 116)
            val sSize = u32(dirBytes, off + 120).toInt()
            if (objType == 5) {
                rootStart = startSec
                rootSize = sSize
            } else if (objType == 2 && (lower == "workbook" || lower == "book")) {
                wbStart = startSec
                wbSize = sSize
            }
            off += 128
        }
        if (wbStart < 0 || wbSize <= 0) return emptyList()

        val wbBytes = if (wbSize < miniCutoff && rootStart >= 0) {
            val miniContainer = readChain(rootStart, rootSize)
            val miniFatRaw = if (miniFatFirst >= 0 && numMiniFat > 0) readChain(miniFatFirst, numMiniFat * sectorSize) else ByteArray(0)
            val miniFat = ArrayList<Int>(miniFatRaw.size / 4)
            var i = 0
            while (i + 4 <= miniFatRaw.size) {
                miniFat.add(i32(miniFatRaw, i))
                i += 4
            }
            val out = ByteArray(wbSize)
            var sec = wbStart
            var pos = 0
            var steps = 0
            while (sec >= 0 && steps < 200000 && pos < wbSize) {
                steps++
                val mOff = sec * miniSize
                if (mOff >= miniContainer.size) break
                val take = min(miniSize, min(wbSize - pos, miniContainer.size - mOff))
                System.arraycopy(miniContainer, mOff, out, pos, take)
                pos += take
                sec = if (sec < miniFat.size) miniFat[sec] else -2
            }
            out
        } else {
            readChain(wbStart, wbSize)
        }

        return parseBiff8WorkbookRecords(wbBytes)
    }

    private fun parseBiff8WorkbookRecords(stream: ByteArray): List<List<Any>> {
        data class BiffRec(val type: Int, val data: ByteArray, val cont: MutableList<ByteArray> = mutableListOf())
        val records = ArrayList<BiffRec>()
        var pos = 0
        while (pos + 4 <= stream.size) {
            val type = u16(stream, pos)
            val len = u16(stream, pos + 2)
            pos += 4
            if (pos + len > stream.size) break
            val data = stream.copyOfRange(pos, pos + len)
            pos += len
            if (type == 0x003C && records.isNotEmpty()) {
                records.last().cont.add(data)
            } else {
                records.add(BiffRec(type, data))
            }
        }

        var sst: List<String> = emptyList()
        val sheets = ArrayList<MutableMap<Int, MutableMap<Int, Any>>>()
        var currentSheet = -1
        var inGlobals = false

        for (rec in records) {
            val d = rec.data
            if (rec.type == 0x0809) {
                val bofType = if (d.size >= 4) u16(d, 2) else 0
                if (bofType == 0x0005) inGlobals = true
                else if (bofType == 0x0010) {
                    inGlobals = false
                    currentSheet = sheets.size
                    sheets.add(HashMap())
                }
                continue
            }
            if (rec.type == 0x000A) { inGlobals = false; continue }
            if (rec.type == 0x00FC && d.size >= 8) {
                sst = parseBiff8Sst(d, rec.cont)
                continue
            }
            if (inGlobals || currentSheet < 0) continue

            val sheet = sheets[currentSheet]
            fun setCell(r: Int, c: Int, v: Any) {
                sheet.getOrPut(r) { HashMap() }[c] = v
            }

            when {
                rec.type == 0x00FD && d.size >= 10 -> {
                    val idx = u32(d, 6).toInt()
                    if (idx in sst.indices) setCell(u16(d, 0), u16(d, 2), sst[idx])
                }
                rec.type == 0x0203 && d.size >= 14 -> {
                    setCell(u16(d, 0), u16(d, 2), f64(d, 6))
                }
                rec.type == 0x027E && d.size >= 10 -> {
                    setCell(u16(d, 0), u16(d, 2), decodeRk(i32(d, 6)))
                }
                rec.type == 0x00BD && d.size >= 12 -> {
                    val r = u16(d, 0)
                    val colFirst = u16(d, 2)
                    val n = (d.size - 6) / 6
                    for (k in 0 until n) {
                        setCell(r, colFirst + k, decodeRk(i32(d, 4 + k * 6 + 2)))
                    }
                }
                rec.type == 0x0204 && d.size >= 9 -> {
                    val r = u16(d, 0)
                    val c = u16(d, 2)
                    val cch = u16(d, 6)
                    val isUni = (d[8].toInt() and 0x01) != 0
                    setCell(r, c, decodeBiffSlice(d.copyOfRange(9, d.size), cch, isUni))
                }
            }
        }

        var bestRows: List<List<Any>> = emptyList()
        for (s in sheets) {
            if (s.size > bestRows.size) {
                val out = ArrayList<List<Any>>(s.size)
                for (rn in s.keys.sorted()) {
                    val cols = s[rn] ?: continue
                    val maxCol = cols.keys.maxOrNull() ?: 0
                    val rowList = ArrayList<Any>(maxCol + 1)
                    for (c in 0..maxCol) rowList.add(cols[c] ?: "")
                    out.add(rowList)
                }
                bestRows = out
            }
        }
        return bestRows
    }

    private fun parseBiff8Sst(firstChunk: ByteArray, contChunks: List<ByteArray>): List<String> {
        val chunks = ArrayList<ByteArray>(1 + contChunks.size).apply {
            add(firstChunk)
            addAll(contChunks)
        }
        val uniqueCount = u32(firstChunk, 4).toInt()
        var cIdx = 0
        var off = 8

        fun readBytes(n: Int): ByteArray {
            val out = ByteArray(n)
            var w = 0
            while (w < n && cIdx < chunks.size) {
                val cur = chunks[cIdx]
                val avail = cur.size - off
                if (avail <= 0) { cIdx++; off = 0; continue }
                val take = min(n - w, avail)
                System.arraycopy(cur, off, out, w, take)
                w += take
                off += take
            }
            return if (w == n) out else out.copyOfRange(0, w)
        }

        val out = ArrayList<String>(uniqueCount.coerceIn(0, 50000))
        var i = 0
        while (i < uniqueCount && cIdx < chunks.size) {
            i++
            if (off >= chunks[cIdx].size) { cIdx++; off = 0; if (cIdx >= chunks.size) break }
            val hdr = readBytes(3)
            if (hdr.size < 3) break
            val cch = (hdr[0].toInt() and 0xFF) or ((hdr[1].toInt() and 0xFF) shl 8)
            val flags = hdr[2].toInt() and 0xFF
            var isUni = (flags and 0x01) != 0
            val hasExt = (flags and 0x04) != 0
            val hasRich = (flags and 0x08) != 0
            val richRuns = if (hasRich) readBytes(2).let { if (it.size >= 2) u16(it, 0) else 0 } else 0
            val extBytes = if (hasExt) readBytes(4).let { if (it.size >= 4) u32(it, 0).toInt() else 0 } else 0

            val sb = StringBuilder()
            var rem = cch
            while (rem > 0 && cIdx < chunks.size) {
                if (off >= chunks[cIdx].size) {
                    cIdx++
                    off = 0
                    if (cIdx >= chunks.size) break
                    isUni = (chunks[cIdx][0].toInt() and 0x01) != 0
                    off = 1
                }
                val avail = chunks[cIdx].size - off
                val bpc = if (isUni) 2 else 1
                val canChars = min(rem, avail / bpc)
                if (canChars <= 0) { cIdx++; off = 0; continue }
                sb.append(decodeBiffSlice(chunks[cIdx].copyOfRange(off, off + canChars * bpc), canChars, isUni))
                off += canChars * bpc
                rem -= canChars
            }
            if (richRuns > 0) readBytes(richRuns * 4)
            if (extBytes > 0) readBytes(extBytes)
            out.add(sb.toString())
        }
        return out
    }

    private fun decodeBiffSlice(bytes: ByteArray, cch: Int, isUni: Boolean): String {
        if (cch <= 0 || bytes.isEmpty()) return ""
        return if (isUni) {
            val take = min(bytes.size, cch * 2)
            String(bytes, 0, take, StandardCharsets.UTF_16LE)
        } else {
            val take = min(bytes.size, cch)
            String(bytes, 0, take, StandardCharsets.ISO_8859_1)
        }
    }

    private fun decodeRk(rk: Int): Double {
        val isDiv100 = (rk and 0x01) != 0
        val isInt = (rk and 0x02) != 0
        val v = if (isInt) {
            (rk shr 2).toDouble()
        } else {
            val longBits = ((rk and 0xFFFFFFFC.toInt()).toLong()) shl 32
            java.lang.Double.longBitsToDouble(longBits)
        }
        return if (isDiv100) v / 100.0 else v
    }

    fun parseTimestampMs(raw: Any?): Long? {
        if (raw == null) return null
        if (raw is Number) {
            val d = raw.toDouble()
            if (!d.isFinite()) return null
            if (d in 20000.0..75000.0) {
                return (floor(d).toLong() - 25569L) * 86400000L
            }
            if (d >= 1000000000000.0) return kotlin.math.round(d).toLong()
            if (d >= 100000000.0 && d < 100000000000.0) return kotlin.math.round(d * 1000.0).toLong()
            return null
        }
        val s = raw.toString().trim()
        if (s.isEmpty()) return null
        s.toDoubleOrNull()?.let { return parseTimestampMs(it) }
        val normalized = s.replace(Regex("(?:\\.\\d+)?\\s*(?:UTC|GMT)\\s*$", RegexOption.IGNORE_CASE), "")
            .replace(Regex("\\.\\d+(?=Z?$)"), "")
            .trim()
        val formats = listOf(
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-dd HH:mm",
            "yyyy-MM-dd",
            "yyyy/MM/dd",
            "MM/dd/yyyy",
            "MMM d, yyyy",
            "MMM dd, yyyy"
        )
        for (pattern in formats) {
            val sdf = SimpleDateFormat(pattern, Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
                isLenient = false
            }
            val parsed = runCatching { sdf.parse(normalized) }.getOrNull()
            if (parsed != null) return parsed.time
        }
        return null
    }

    private fun parseNumeric(raw: Any?): Double? {
        if (raw == null) return null
        if (raw is Number) return raw.toDouble().takeIf { it.isFinite() }
        val clean = raw.toString().trim().replace(Regex("[$,\\s]"), "")
        if (clean.isEmpty() || clean == "." || clean.equals("na", true) || clean.equals("n/a", true) || clean.equals("null", true)) {
            return null
        }
        return clean.toDoubleOrNull()?.takeIf { it.isFinite() }
    }

    private fun u16(b: ByteArray, o: Int): Int =
        (b[o].toInt() and 0xFF) or ((b[o + 1].toInt() and 0xFF) shl 8)

    private fun u32(b: ByteArray, o: Int): Long =
        ((b[o].toInt() and 0xFF).toLong()) or
            ((b[o + 1].toInt() and 0xFF).toLong() shl 8) or
            ((b[o + 2].toInt() and 0xFF).toLong() shl 16) or
            ((b[o + 3].toInt() and 0xFF).toLong() shl 24)

    private fun i32(b: ByteArray, o: Int): Int =
        ByteBuffer.wrap(b, o, 4).order(ByteOrder.LITTLE_ENDIAN).int

    private fun f64(b: ByteArray, o: Int): Double =
        ByteBuffer.wrap(b, o, 8).order(ByteOrder.LITTLE_ENDIAN).double
}
