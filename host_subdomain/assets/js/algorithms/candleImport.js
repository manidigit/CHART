import { PriceFormatter } from './priceFormatter.js?v=1.42.0';

function sanitizeImportedCandle(rawMs, tf, open, high, low, close, volume) {
  if (!Number.isFinite(open) || !Number.isFinite(close) || open <= 0 || close <= 0) return null;
  const openMs = PriceFormatter.snapToOpenUtcMs(rawMs, tf);
  if (!Number.isFinite(openMs) || openMs <= 0) return null;
  const h = Number.isFinite(high) ? Math.max(high, open, close) : Math.max(open, close);
  const l = Number.isFinite(low) ? Math.min(low, open, close) : Math.min(open, close);
  const v = Number.isFinite(volume) ? Math.max(0, volume) : 0;
  const iso = new Date(openMs).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  return {
    open_time_utc_ms: openMs,
    open_time_utc_iso: iso,
    openTimeSec: Math.floor(openMs / 1000),
    openTimeUtc: iso,
    open,
    high: h,
    low: l,
    close,
    volume: v,
    is_closed: true,
  };
}

/**
 * Phase 3 Historical Data Import & Normalization Engine (ES6 Client Mirror).
 * Supports CSV, DataHub 2-column daily CSV, EIA RBRTEd.xls (BIFF8 OLE2, SpreadsheetML XML,
 * HTML table, TSV), Canonical JSON, and Manual OHLC entry.
 *
 * Security Policy: Strictly rejects image uploads (PNG, JPEG, WEBP, GIF, BMP, SVG).
 * Never fabricates intraday bars from 2-column daily series.
 */

export function isImageBytesOrFilename(bytes, fileName = '', mimeType = '') {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const ext = String(fileName || '').toLowerCase().split('.').pop() || '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'heic', 'avif', 'tif', 'tiff'].includes(ext)) {
    return true;
  }
  if (!bytes || bytes.length < 4) return false;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true; // PNG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true; // JPEG
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true; // GIF
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return true; // WEBP
  }
  if (bytes[0] === 0x42 && bytes[1] === 0x4d && bytes.length > 14 && bytes[6] === 0 && bytes[7] === 0) {
    return true; // BMP
  }
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 256)).trimStart().toLowerCase();
  if (head.startsWith('<svg') || /^<\?xml[^>]*>\s*<svg\b/i.test(head)) return true;
  return false;
}

export function parseHistoricalBytes(input, fileName = '', requestedTf = 'D1', symbolCode = 'SPOTBRENT', mimeType = '') {
  const bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input || ''));
  if (isImageBytesOrFilename(bytes, fileName, mimeType)) {
    return {
      ok: false,
      errorCode: 'ERR_IMAGE_UPLOAD_FORBIDDEN',
      detectedFormat: 'IMAGE_REJECTED',
      forcedDailyOnly: false,
      effectiveTimeframe: requestedTf,
      rowsTotal: 0,
      rowsSkipped: 0,
      candles: [],
    };
  }

  const tf = ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'].includes(String(requestedTf).toUpperCase())
    ? String(requestedTf).toUpperCase()
    : 'D1';

  if (bytes.length === 0) {
    return {
      ok: false,
      errorCode: 'EMPTY_INPUT',
      detectedFormat: 'EMPTY',
      forcedDailyOnly: false,
      effectiveTimeframe: tf,
      rowsTotal: 0,
      rowsSkipped: 0,
      candles: [],
    };
  }

  // Binary BIFF8 OLE2 (.xls): D0 CF 11 E0 A1 B1 1A E1
  if (
    bytes.length >= 512 &&
    bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1
  ) {
    const rows = parseBiff8Ole2Rows(bytes);
    return normalizeTabularRows(rows, 'XLS_BIFF8', tf, symbolCode);
  }

  let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const head = text.slice(0, 4096).trimStart();

  if (head.startsWith('{') || head.startsWith('[')) {
    try {
      const parsedJson = JSON.parse(text);
      return normalizeJsonPayload(parsedJson, tf);
    } catch {
      // fall through
    }
  }

  if (/<(?:ss:)?Workbook\b|<Worksheet\b/i.test(head)) {
    const rows = parseSpreadsheetMlRows(text);
    return normalizeTabularRows(rows, 'XLS_XML', tf, symbolCode);
  }

  if (/<table\b|<tr\b/i.test(head)) {
    const rows = parseHtmlTableRows(text);
    return normalizeTabularRows(rows, 'XLS_HTML', tf, symbolCode);
  }

  const rows = parseDelimitedRows(text);
  return normalizeTabularRows(rows, 'CSV', tf, symbolCode);
}

export function buildManualCandle({ dateTimeInput, open, high, low, close, volume = 0, timeframe = 'D1' }) {
  const openMs = parseTimestampMs(dateTimeInput);
  const cVal = parseNumeric(close);
  if (openMs === null || cVal === null || cVal <= 0) return null;
  const oVal = parseNumeric(open) ?? cVal;
  const hVal = parseNumeric(high) ?? Math.max(oVal, cVal);
  const lVal = parseNumeric(low) ?? Math.min(oVal, cVal);
  const vVal = Math.max(0, parseNumeric(volume) ?? 0);
  const tf = ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'].includes(String(timeframe).toUpperCase())
    ? String(timeframe).toUpperCase()
    : 'D1';
  const aligned = PriceFormatter.snapToOpenUtcMs(openMs, tf);
  return sanitizeImportedCandle(aligned, tf, oVal, Math.max(hVal, oVal, cVal), Math.min(lVal, oVal, cVal), cVal, vVal);
}

function normalizeJsonPayload(decoded, requestedTf) {
  const items = Array.isArray(decoded)
    ? decoded
    : Array.isArray(decoded && decoded.candles)
      ? decoded.candles
      : decoded && decoded.data && Array.isArray(decoded.data.candles)
        ? decoded.data.candles
        : null;
  if (!items) {
    return {
      ok: false,
      errorCode: 'INVALID_JSON_SCHEMA',
      detectedFormat: 'JSON',
      forcedDailyOnly: false,
      effectiveTimeframe: requestedTf,
      rowsTotal: 0,
      rowsSkipped: 0,
      candles: [],
    };
  }
  const byTime = new Map();
  let skipped = 0;
  let prevClose = null;
  let sawFullOhlc = false;
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      skipped++;
      continue;
    }
    const tRaw = item.open_time_utc_ms ?? item.open_time_utc_iso ?? item.t ?? item.time ?? item.date ?? item.timestamp;
    const openMs = parseTimestampMs(tRaw);
    const cVal = parseNumeric(item.close ?? item.c ?? item.price ?? item.value);
    if (openMs === null || cVal === null || cVal <= 0) {
      skipped++;
      continue;
    }
    if (item.open !== undefined || item.o !== undefined) sawFullOhlc = true;
    const oVal = parseNumeric(item.open ?? item.o) ?? (prevClose !== null ? prevClose : cVal);
    const hVal = parseNumeric(item.high ?? item.h) ?? Math.max(oVal, cVal);
    const lVal = parseNumeric(item.low ?? item.l) ?? Math.min(oVal, cVal);
    const vVal = Math.max(0, parseNumeric(item.volume ?? item.v) ?? 0);
    prevClose = cVal;
    const tf = sawFullOhlc ? requestedTf : 'D1';
    const san = sanitizeImportedCandle(openMs, tf, oVal, hVal, lVal, cVal, vVal);
    if (san) byTime.set(san.open_time_utc_ms, san);
    else skipped++;
  }
  const candles = Array.from(byTime.values()).sort((a, b) => a.open_time_utc_ms - b.open_time_utc_ms);
  const forcedDailyOnly = !sawFullOhlc && candles.length > 0;
  return {
    ok: candles.length > 0,
    errorCode: candles.length > 0 ? null : 'NO_VALID_CANDLES',
    detectedFormat: 'JSON',
    forcedDailyOnly,
    effectiveTimeframe: forcedDailyOnly ? 'D1' : requestedTf,
    rowsTotal: items.length,
    rowsSkipped: skipped,
    candles,
  };
}

function normalizeTabularRows(rows, format, requestedTf) {
  const rowsTotal = rows.length;
  if (rowsTotal === 0) {
    return {
      ok: false,
      errorCode: 'NO_PARSABLE_ROWS',
      detectedFormat: format,
      forcedDailyOnly: false,
      effectiveTimeframe: requestedTf,
      rowsTotal: 0,
      rowsSkipped: 0,
      candles: [],
    };
  }

  let headerColMap = null;
  let headerRowIdx = -1;
  const maxScan = Math.min(20, rowsTotal);
  for (let i = 0; i < maxScan; i++) {
    const mapped = detectHeaderColumns(rows[i]);
    if (mapped) {
      headerColMap = mapped;
      headerRowIdx = i;
      break;
    }
  }

  let isTwoColDaily = false;
  if (headerColMap) {
    isTwoColDaily = headerColMap.open === null && headerColMap.high === null && headerColMap.low === null && headerColMap.close !== null;
  } else {
    for (let i = 0; i < maxScan; i++) {
      const r = rows[i];
      if (r.length >= 5 && parseTimestampMs(r[0]) !== null && parseNumeric(r[1]) !== null && parseNumeric(r[2]) !== null && parseNumeric(r[3]) !== null && parseNumeric(r[4]) !== null) {
        headerColMap = { time: 0, open: 1, high: 2, low: 3, close: 4, volume: r.length > 5 ? 5 : null };
        headerRowIdx = i - 1;
        break;
      }
      if (r.length >= 2 && parseTimestampMs(r[0]) !== null && parseNumeric(r[1]) !== null) {
        headerColMap = { time: 0, open: null, high: null, low: null, close: 1, volume: null };
        headerRowIdx = i - 1;
        isTwoColDaily = true;
        break;
      }
    }
  }

  if (!headerColMap) {
    return {
      ok: false,
      errorCode: 'UNRECOGNIZED_SCHEMA',
      detectedFormat: format,
      forcedDailyOnly: false,
      effectiveTimeframe: requestedTf,
      rowsTotal,
      rowsSkipped: rowsTotal,
      candles: [],
    };
  }

  const forcedDailyOnly = isTwoColDaily;
  const effectiveTf = forcedDailyOnly ? 'D1' : requestedTf;
  const startIdx = Math.max(0, headerRowIdx + 1);

  const rawByMs = new Map();
  let skipped = 0;
  for (let i = startIdx; i < rowsTotal; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length < 2) continue;
    const openMs = parseTimestampMs(r[headerColMap.time]);
    const cVal = headerColMap.close !== null ? parseNumeric(r[headerColMap.close]) : null;
    if (openMs === null || openMs <= 0 || cVal === null || cVal <= 0) {
      skipped++;
      continue;
    }
    if (isTwoColDaily) {
      rawByMs.set(openMs, { openMs, close: cVal });
    } else {
      const oVal = parseNumeric(r[headerColMap.open]) ?? cVal;
      const hVal = parseNumeric(r[headerColMap.high]) ?? Math.max(oVal, cVal);
      const lVal = parseNumeric(r[headerColMap.low]) ?? Math.min(oVal, cVal);
      const vVal = headerColMap.volume !== null ? Math.max(0, parseNumeric(r[headerColMap.volume]) ?? 0) : 0;
      rawByMs.set(openMs, { openMs, open: oVal, high: hVal, low: lVal, close: cVal, volume: vVal });
    }
  }

  const sorted = Array.from(rawByMs.values()).sort((a, b) => a.openMs - b.openMs);
  const candles = [];
  let prevClose = null;
  for (const row of sorted) {
    const open = isTwoColDaily ? (prevClose !== null ? prevClose : row.close) : row.open;
    const close = row.close;
    const high = isTwoColDaily ? Math.max(open, close) : row.high;
    const low = isTwoColDaily ? Math.min(open, close) : row.low;
    const vol = isTwoColDaily ? 0 : row.volume;
    prevClose = close;
    const san = sanitizeImportedCandle(row.openMs, effectiveTf, open, high, low, close, vol);
    if (san) candles.push(san);
    else skipped++;
  }

  return {
    ok: candles.length > 0,
    errorCode: candles.length > 0 ? null : 'NO_VALID_CANDLES',
    detectedFormat: format,
    forcedDailyOnly,
    effectiveTimeframe: effectiveTf,
    rowsTotal: Math.max(0, rowsTotal - startIdx),
    rowsSkipped: skipped,
    candles,
  };
}

function detectHeaderColumns(row) {
  let time = null;
  let open = null;
  let high = null;
  let low = null;
  let close = null;
  let volume = null;

  for (let idx = 0; idx < row.length; idx++) {
    const norm = String(row[idx] ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!norm) continue;
    if (time === null && (['date', 'time', 'datetime', 'timestamp', 'open_time_utc_ms', 'open_time_utc_iso', 'open_time_utc', 'period'].includes(norm) || norm.includes('date'))) {
      time = idx;
      continue;
    }
    if (open === null && (norm === 'open' || norm === 'o' || norm.startsWith('open '))) {
      open = idx;
      continue;
    }
    if (high === null && (norm === 'high' || norm === 'h' || norm.startsWith('high '))) {
      high = idx;
      continue;
    }
    if (low === null && (norm === 'low' || norm === 'l' || norm.startsWith('low '))) {
      low = idx;
      continue;
    }
    if (close === null && (['close', 'c', 'price', 'value', 'spot', 'brent', 'rbrte'].includes(norm) || norm.includes('brent') || norm.includes('spot price') || norm.includes('dollars per barrel'))) {
      close = idx;
      continue;
    }
    if (volume === null && (norm === 'volume' || norm === 'vol' || norm === 'v')) {
      volume = idx;
    }
  }
  if (time !== null && close !== null) {
    return { time, open, high, low, close, volume };
  }
  return null;
}

function parseDelimitedRows(text) {
  const lines = text.split(/\r\n|\n|\r/);
  let delim = ',';
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const s = lines[i];
    if (s.includes('\t') && !s.includes(',')) { delim = '\t'; break; }
    if (s.includes(';') && !s.includes(',')) { delim = ';'; break; }
  }
  const rows = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    rows.push(parseCsvLine(t, delim));
  }
  return rows;
}

function parseCsvLine(line, delim) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseSpreadsheetMlRows(xml) {
  const rows = [];
  const rowRe = /<(?:\w+:)?Row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Row>/gi;
  const cellRe = /<(?:\w+:)?Cell\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Cell>/gi;
  const dataRe = /<(?:\w+:)?Data\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Data>/i;
  let rm;
  while ((rm = rowRe.exec(xml)) !== null) {
    const cells = [];
    let colCursor = 0;
    cellRe.lastIndex = 0;
    let cm;
    while ((cm = cellRe.exec(rm[1])) !== null) {
      const idxM = /(?:ss:)?Index=["'](\d+)["']/i.exec(cm[1]);
      if (idxM) {
        const target = Math.max(0, Number(idxM[1]) - 1);
        while (colCursor < target) { cells.push(''); colCursor++; }
      }
      const dm = dataRe.exec(cm[2]);
      const raw = dm ? dm[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
      cells.push(raw.trim());
      colCursor++;
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function parseHtmlTableRows(html) {
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let trm;
  while ((trm = trRe.exec(html)) !== null) {
    const cells = [];
    tdRe.lastIndex = 0;
    let tdm;
    while ((tdm = tdRe.exec(trm[1])) !== null) {
      cells.push(tdm[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim());
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

/**
 * Pure JavaScript BIFF8 OLE2 (.xls) parser supporting regular FAT + DIFAT + MiniFAT streams.
 */
export function parseBiff8Ole2Rows(bytes) {
  if (!bytes || bytes.length < 512) return [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sectorShift = dv.getUint16(30, true);
  if (sectorShift < 9 || sectorShift > 12) sectorShift = 9;
  const sectorSize = 1 << sectorShift;
  const miniShift = dv.getUint16(32, true);
  const miniSize = miniShift >= 6 && miniShift <= 9 ? (1 << miniShift) : 64;

  const numFatSectors = dv.getUint32(44, true);
  const dirFirstSector = dv.getInt32(48, true);
  const miniCutoff = dv.getUint32(56, true) || 4096;
  const miniFatFirst = dv.getInt32(60, true);
  const numMiniFat = dv.getUint32(64, true);
  let difatSec = dv.getInt32(68, true);
  const numDifat = dv.getUint32(72, true);

  const fatSectors = [];
  for (let i = 0; i < 109 && fatSectors.length < numFatSectors; i++) {
    const s = dv.getInt32(76 + i * 4, true);
    if (s >= 0) fatSectors.push(s);
  }
  const perDifat = (sectorSize >> 2) - 1;
  let dGuard = 0;
  while (difatSec >= 0 && fatSectors.length < numFatSectors && dGuard < numDifat + 4) {
    dGuard++;
    const off = 512 + difatSec * sectorSize;
    if (off + sectorSize > bytes.length) break;
    for (let i = 0; i < perDifat && fatSectors.length < numFatSectors; i++) {
      const s = dv.getInt32(off + i * 4, true);
      if (s >= 0) fatSectors.push(s);
    }
    difatSec = dv.getInt32(off + sectorSize - 4, true);
  }

  const fat = [];
  for (const fSec of fatSectors) {
    const off = 512 + fSec * sectorSize;
    if (off + sectorSize > bytes.length) break;
    for (let i = 0; i < sectorSize; i += 4) {
      fat.push(dv.getInt32(off + i, true));
    }
  }

  const readChain = (startSec, maxBytes = 0) => {
    if (startSec < 0) return new Uint8Array(0);
    const chunks = [];
    let total = 0;
    let sec = startSec;
    let steps = 0;
    while (sec >= 0 && steps < 200000) {
      steps++;
      const off = 512 + sec * sectorSize;
      if (off >= bytes.length) break;
      const slice = bytes.subarray(off, Math.min(bytes.length, off + sectorSize));
      chunks.push(slice);
      total += slice.length;
      if (maxBytes > 0 && total >= maxBytes) break;
      sec = sec < fat.length ? fat[sec] : -2;
    }
    const out = new Uint8Array(maxBytes > 0 ? Math.min(total, maxBytes) : total);
    let pos = 0;
    for (const c of chunks) {
      const remain = out.length - pos;
      if (remain <= 0) break;
      out.set(c.subarray(0, remain), pos);
      pos += Math.min(c.length, remain);
    }
    return out;
  };

  const dirBytes = readChain(dirFirstSector, 0);
  if (dirBytes.length < 128) return [];
  const dirDv = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);

  let rootStart = -1;
  let rootSize = 0;
  let wbStart = -1;
  let wbSize = 0;

  for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
    const objType = dirBytes[off + 66];
    const nameLen = dirDv.getUint16(off + 64, true);
    let name = '';
    for (let c = 0; c + 1 < Math.min(nameLen, 64); c += 2) {
      const ch = dirDv.getUint16(off + c, true);
      if (ch === 0) break;
      name += String.fromCharCode(ch);
    }
    const lower = name.toLowerCase();
    const startSec = dirDv.getInt32(off + 116, true);
    const sSize = dirDv.getUint32(off + 120, true);
    if (objType === 5) {
      rootStart = startSec;
      rootSize = sSize;
    } else if (objType === 2 && (lower === 'workbook' || lower === 'book')) {
      wbStart = startSec;
      wbSize = sSize;
    }
  }
  if (wbStart < 0 || wbSize <= 0) return [];

  let wbBytes;
  if (wbSize < miniCutoff && rootStart >= 0) {
    const miniContainer = readChain(rootStart, rootSize);
    const miniFatBytes = miniFatFirst >= 0 && numMiniFat > 0 ? readChain(miniFatFirst, numMiniFat * sectorSize) : new Uint8Array(0);
    const miniDv = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
    const miniFat = [];
    for (let i = 0; i + 4 <= miniFatBytes.length; i += 4) miniFat.push(miniDv.getInt32(i, true));
    wbBytes = new Uint8Array(wbSize);
    let sec = wbStart;
    let pos = 0;
    let steps = 0;
    while (sec >= 0 && steps < 200000 && pos < wbSize) {
      steps++;
      const mOff = sec * miniSize;
      if (mOff >= miniContainer.length) break;
      const take = Math.min(miniSize, wbSize - pos, miniContainer.length - mOff);
      wbBytes.set(miniContainer.subarray(mOff, mOff + take), pos);
      pos += take;
      sec = sec < miniFat.length ? miniFat[sec] : -2;
    }
  } else {
    wbBytes = readChain(wbStart, wbSize);
  }

  return parseBiff8WorkbookRecords(wbBytes);
}

function parseBiff8WorkbookRecords(stream) {
  const dv = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const records = [];
  let pos = 0;
  while (pos + 4 <= stream.length) {
    const type = dv.getUint16(pos, true);
    const len = dv.getUint16(pos + 2, true);
    pos += 4;
    if (pos + len > stream.length) break;
    const data = stream.subarray(pos, pos + len);
    pos += len;
    if (type === 0x003c && records.length > 0) {
      records[records.length - 1].cont.push(data);
    } else {
      records.push({ type, data, cont: [] });
    }
  }

  let sst = [];
  const sheets = [];
  let currentSheet = -1;
  let inGlobals = false;

  for (const rec of records) {
    const { type, data } = rec;
    const rdv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (type === 0x0809) {
      const bofType = data.length >= 4 ? rdv.getUint16(2, true) : 0;
      if (bofType === 0x0005) inGlobals = true;
      else if (bofType === 0x0010) {
        inGlobals = false;
        currentSheet = sheets.length;
        sheets.push(new Map());
      }
      continue;
    }
    if (type === 0x000a) { inGlobals = false; continue; }
    if (type === 0x00fc && data.length >= 8) {
      sst = parseBiff8Sst(data, rec.cont);
      continue;
    }
    if (inGlobals || currentSheet < 0) continue;

    const sheet = sheets[currentSheet];
    const setCell = (r, c, v) => {
      if (!sheet.has(r)) sheet.set(r, new Map());
      sheet.get(r).set(c, v);
    };

    if (type === 0x00fd && data.length >= 10) {
      const r = rdv.getUint16(0, true);
      const c = rdv.getUint16(2, true);
      const idx = rdv.getUint32(6, true);
      if (idx < sst.length) setCell(r, c, sst[idx]);
    } else if (type === 0x0203 && data.length >= 14) {
      setCell(rdv.getUint16(0, true), rdv.getUint16(2, true), rdv.getFloat64(6, true));
    } else if (type === 0x027e && data.length >= 10) {
      setCell(rdv.getUint16(0, true), rdv.getUint16(2, true), decodeRk(rdv.getUint32(6, true)));
    } else if (type === 0x00bd && data.length >= 12) {
      const r = rdv.getUint16(0, true);
      const colFirst = rdv.getUint16(2, true);
      const n = Math.floor((data.length - 6) / 6);
      for (let k = 0; k < n; k++) {
        setCell(r, colFirst + k, decodeRk(rdv.getUint32(4 + k * 6 + 2, true)));
      }
    } else if (type === 0x0204 && data.length >= 9) {
      const r = rdv.getUint16(0, true);
      const c = rdv.getUint16(2, true);
      const cch = rdv.getUint16(6, true);
      const isUni = (data[8] & 0x01) !== 0;
      setCell(r, c, decodeBiffSlice(data.subarray(9), cch, isUni));
    }
  }

  let bestRows = [];
  for (const s of sheets) {
    if (s.size > bestRows.length) {
      const rowNums = Array.from(s.keys()).sort((a, b) => a - b);
      const out = [];
      for (const rn of rowNums) {
        const cols = s.get(rn);
        const maxCol = Math.max(...Array.from(cols.keys()));
        const rowArr = [];
        for (let c = 0; c <= maxCol; c++) rowArr.push(cols.has(c) ? cols.get(c) : '');
        out.push(rowArr);
      }
      bestRows = out;
    }
  }
  return bestRows;
}

function parseBiff8Sst(firstChunk, contChunks) {
  const chunks = [firstChunk, ...contChunks];
  const firstDv = new DataView(firstChunk.buffer, firstChunk.byteOffset, firstChunk.byteLength);
  const uniqueCount = firstDv.getUint32(4, true);
  let cIdx = 0;
  let off = 8;

  const readBytes = (n) => {
    const out = new Uint8Array(n);
    let w = 0;
    while (w < n && cIdx < chunks.length) {
      const cur = chunks[cIdx];
      const avail = cur.length - off;
      if (avail <= 0) { cIdx++; off = 0; continue; }
      const take = Math.min(n - w, avail);
      out.set(cur.subarray(off, off + take), w);
      w += take;
      off += take;
    }
    return w === n ? out : out.subarray(0, w);
  };

  const out = [];
  for (let i = 0; i < uniqueCount && cIdx < chunks.length; i++) {
    if (off >= chunks[cIdx].length) { cIdx++; off = 0; if (cIdx >= chunks.length) break; }
    const hdr = readBytes(3);
    if (hdr.length < 3) break;
    const cch = hdr[0] | (hdr[1] << 8);
    const flags = hdr[2];
    let isUni = (flags & 0x01) !== 0;
    const hasExt = (flags & 0x04) !== 0;
    const hasRich = (flags & 0x08) !== 0;
    const richRuns = hasRich ? ((b => b.length >= 2 ? (b[0] | (b[1] << 8)) : 0)(readBytes(2))) : 0;
    const extBytes = hasExt ? ((b => b.length >= 4 ? (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0 : 0)(readBytes(4))) : 0;

    let text = '';
    let rem = cch;
    while (rem > 0 && cIdx < chunks.length) {
      if (off >= chunks[cIdx].length) {
        cIdx++;
        off = 0;
        if (cIdx >= chunks.length) break;
        isUni = (chunks[cIdx][0] & 0x01) !== 0;
        off = 1;
      }
      const avail = chunks[cIdx].length - off;
      const bpc = isUni ? 2 : 1;
      const canChars = Math.min(rem, Math.floor(avail / bpc));
      if (canChars <= 0) { cIdx++; off = 0; continue; }
      text += decodeBiffSlice(chunks[cIdx].subarray(off, off + canChars * bpc), canChars, isUni);
      off += canChars * bpc;
      rem -= canChars;
    }
    if (richRuns > 0) readBytes(richRuns * 4);
    if (extBytes > 0) readBytes(extBytes);
    out.push(text);
  }
  return out;
}

function decodeBiffSlice(bytes, cch, isUni) {
  if (cch <= 0 || bytes.length === 0) return '';
  if (isUni) {
    const take = Math.min(bytes.length, cch * 2);
    return new TextDecoder('utf-16le', { fatal: false }).decode(bytes.subarray(0, take));
  }
  const take = Math.min(bytes.length, cch);
  return new TextDecoder('latin1', { fatal: false }).decode(bytes.subarray(0, take));
}

function decodeRk(rk) {
  const isDiv100 = (rk & 0x01) !== 0;
  const isInt = (rk & 0x02) !== 0;
  let val;
  if (isInt) {
    val = rk >> 2;
  } else {
    const buf = new ArrayBuffer(8);
    const dv = new DataView(buf);
    dv.setUint32(0, 0, true);
    dv.setUint32(4, rk & ~0x03, true);
    val = dv.getFloat64(0, true);
  }
  return isDiv100 ? val / 100.0 : val;
}

export function parseTimestampMs(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    if (raw >= 20000 && raw <= 75000) {
      return (Math.floor(raw) - 25569) * 86400000;
    }
    if (raw >= 1000000000000) return Math.round(raw);
    if (raw >= 100000000 && raw < 100000000000) return Math.round(raw * 1000);
    return null;
  }
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return parseTimestampMs(Number(s));
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const ms = Date.parse(`${s}T00:00:00Z`);
    return Number.isFinite(ms) ? ms : null;
  }
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$|\b(?:UTC|GMT)\s*$/i.test(s);
  const ms = Date.parse(hasTz ? s : s.includes('T') ? `${s}Z` : `${s} UTC`);
  return Number.isFinite(ms) ? ms : null;
}

function parseNumeric(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim().replace(/[$,\s]/g, '');
  if (!s || s === '.' || /^(na|n\/a|null)$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
