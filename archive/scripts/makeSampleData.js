#!/usr/bin/env node
/**
 * شبیه‌ساز داده تاریخی M15 برای ارزیابی Walk-Forward و Backtest
 * 
 * ویژگی‌ها:
 * - تولید ۶۰۰ تا ۱۲۰۰ کندل ۱۵ دقیقه‌ای واقع‌گرایانه
 * - شبیه‌سازی رژیم‌های روند (Bull/Bear)، رنج (Mean-Reverting) و شوک نوسانی
 * - حفظ ساختار زمانی UTC (گام ۹۰۰,۰۰۰ میلی‌ثانیه‌ای)
 * - رعایت هندسه OHLCV واقعی با نسبت‌های بدنه و سایه تصادفی بر پایه ATR
 * 
 * اجرا:
 *   node scripts/makeSampleData.js
 *   node scripts/makeSampleData.js --count 1000 --out data/sample_M15.json --basePrice 2450
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      out[key] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const COUNT = parseInt(args.count || '960', 10); // ۱۰ روز سشن پیوسته ۱۵ دقیقه‌ای
const OUT_FILE = args.out || path.join(__dirname, '../data/sample_M15.json');
const BASE_PRICE = parseFloat(args.basePrice || '2450.0'); // مبنای قیمت طلا (XAUUSD)
const STEP_MS = 15 * 60 * 1000; // ۱۵ دقیقه = ۹۰۰,۰۰۰ میلی‌ثانیه

// ژنراتور شبه‌تصادفی قطعی (Mulberry32)
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// توزیع نرمال استاندارد Box-Muller
function boxMuller(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function generateCandles(count = 960, basePrice = 2450.0) {
  const rng = mulberry32(42);
  const startTime = Date.parse('2026-06-01T00:00:00Z');
  const candles = [];

  let currentPrice = basePrice;
  let currentVol = 0.0018; // 0.18% نوسان پایه در هر کندل
  let regime = 'RANGING'; // RANGING, TREND_UP, TREND_DOWN, VOLATILE
  let regimeBarsLeft = 60;

  for (let i = 0; i < count; i++) {
    if (--regimeBarsLeft <= 0) {
      const pick = rng();
      if (pick < 0.40) {
        regime = 'RANGING';
        regimeBarsLeft = 40 + Math.floor(rng() * 40);
        currentVol = 0.0014 + rng() * 0.0006;
      } else if (pick < 0.70) {
        regime = 'TREND_UP';
        regimeBarsLeft = 30 + Math.floor(rng() * 30);
        currentVol = 0.0020 + rng() * 0.0008;
      } else if (pick < 0.90) {
        regime = 'TREND_DOWN';
        regimeBarsLeft = 25 + Math.floor(rng() * 25);
        currentVol = 0.0022 + rng() * 0.0010;
      } else {
        regime = 'VOLATILE';
        regimeBarsLeft = 15 + Math.floor(rng() * 15);
        currentVol = 0.0035 + rng() * 0.0015;
      }
    }

    // رانش متناسب با رژیم در فضای لگاریتمی
    let drift = 0;
    if (regime === 'TREND_UP') {
      drift = 0.00040 + rng() * 0.00030;
    } else if (regime === 'TREND_DOWN') {
      drift = -0.00045 - rng() * 0.00030;
    } else if (regime === 'RANGING') {
      // کشش بازگشت به میانگین در مقیاس درصدی
      const logDev = Math.log(basePrice / Math.max(1, currentPrice));
      drift = Math.max(-0.002, Math.min(0.002, logDev * 0.025));
    }

    const shock = boxMuller(rng) * currentVol;
    const returnStep = drift + shock;
    const open = currentPrice;
    const close = Number((open * Math.exp(returnStep)).toFixed(2));

    const atrEst = currentPrice * currentVol;
    const spread = Math.abs(close - open);
    const upperWick = Math.max(atrEst * 0.15, spread * (0.2 + rng() * 0.5) + atrEst * 0.25 * rng());
    const lowerWick = Math.max(atrEst * 0.15, spread * (0.2 + rng() * 0.5) + atrEst * 0.25 * rng());

    const high = Number((Math.max(open, close) + upperWick).toFixed(2));
    const low = Number(Math.max(1.0, Math.min(open, close) - lowerWick).toFixed(2));

    const baseVol = regime === 'VOLATILE' ? 2400 : 950;
    const volume = Math.floor(baseVol * (0.65 + rng() * 0.70) * (1 + Math.abs(returnStep) * 40));

    candles.push({
      time: startTime + i * STEP_MS,
      open_time_utc_ms: startTime + i * STEP_MS,
      open,
      high,
      low,
      close,
      volume,
    });

    currentPrice = close;
  }

  return candles;
}

console.log(`Generating ${COUNT} synthetic M15 candles...`);
const candles = generateCandles(COUNT, BASE_PRICE);

const outDir = path.dirname(OUT_FILE);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(OUT_FILE, JSON.stringify(candles, null, 2), 'utf-8');
const stats = fs.statSync(OUT_FILE);

console.log(`✅ Saved ${candles.length} candles to ${OUT_FILE} (${(stats.size / 1024).toFixed(1)} KB)`);
console.log(`   First candle: ${new Date(candles[0].time).toISOString()} @ Close ${candles[0].close}`);
console.log(`   Last candle:  ${new Date(candles[candles.length - 1].time).toISOString()} @ Close ${candles[candles.length - 1].close}`);
console.log(`   Price Range:  Min ${Math.min(...candles.map(c => c.low))} - Max ${Math.max(...candles.map(c => c.high))}`);
