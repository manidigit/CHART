import { PriceFormatter } from '../algorithms/priceFormatter.js?v=1.37.0';
import { TimeframeAggregator } from '../algorithms/timeframeAggregator.js?v=1.37.0';

const STORAGE_KEY_THEME = 'ci_theme_dark';
const STORAGE_KEY_PREFS = 'ci_chart_prefs_v4';
const STORAGE_KEY_SYMBOLS = 'ci_symbols_v5';
const STORAGE_KEY_DRAWINGS = 'ci_drawings_v2';
const STORAGE_KEY_LAST_SYMBOL = 'ci_last_opened_symbol';
const STORAGE_KEY_OPEN_TABS = 'ci_open_tabs_v2';
const STORAGE_CANDLES_PREFIX = 'ci_candles_v4_';

export const DEFAULT_PREFS = {
  bullColor: '#26A69A',
  bearColor: '#EF5350',
  trendColor: '#2962FF',
  hLineColor: '#F59E0B',
  vLineColor: '#A855F7',
  candleFetchLimit: 2500,
  zoomStepCandles: 8,
  drawingHitTolerancePx: 28,
  hideWatchlistLogos: false,
  showSymbolScreen: true,
  chartVibrations: true,
  isLogScale: false,
  rememberLastChart: true,
  hideTabBarInLandscape: true,
  pickerVibrates: true,
  showScrollMagnifier: true,
  showCountdownToBarClose: true,
  showPrevCloseLine: true,
  showHighLowLabels: true,
  defaultDrawingColorHex: '#2962FF',
  defaultDrawingWidthPx: 2.0,
  timezoneMode: 'UTC',
  bollingerPeriod: 20,
  bollingerStdDev: 2.0,
  showSma20: false,
  showSma50: false,
  showEma200: false,
  showBollinger: false,
  showOverlayMacd: false,
  showRsi14: false,
  showMacd: false,
  showAtr14: false,
  showStoch14: false,
  showCci20: false,
  showWillR14: false,
  showRoc12: false,
};

export const PROVIDER_METHODS_CATALOG = [
  {
    providerId: 'tvdatafeed',
    badgeLabel: 'TradingView Wick',
    titleFa: 'الگوریتم استخراج کندل و شدو از TradingView (tvdatafeed)',
    titleEn: 'TradingView Wick & WebSocket Engine (tvdatafeed)',
    methodType: 'WSS_STREAM_AND_SEED',
    requiresApiKey: false,
    formulaFa: 'آرشیو پایه ۵۰۰۰ کندل در دیتابیس مرکزی + دریافت افزایشی کندل‌های جدید از سوکت زنده wss://data.tradingview.com با تراز دقیق UTC 00:00 و حفظ کامل شدوها (Wicks).',
    formulaEn: '5,000-bar base archive in MariaDB + incremental delta sync via wss://data.tradingview.com WebSocket with exact 00:00 UTC alignment and full wick preservation.',
    supportedTimeframes: ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'],
    storageKeyRule: 'UNIQUE(chart_id, "tvdatafeed", timeframe, open_time_utc)',
    symbols: [
      { symbolCode: 'SPOTBRENT', providerTicker: 'PEPPERSTONE:SPOTBRENT', titleFa: 'نفت برنت اسپات', titleEn: 'Brent Crude (Spot)', category: 'ENERGY', decimals: 3 },
      { symbolCode: 'ETHUSD', providerTicker: 'BITSTAMP:ETHUSD', titleFa: 'اتریوم / دلار آمریکا', titleEn: 'Ethereum / U.S. Dollar', category: 'CRYPTO', decimals: 2 },
      { symbolCode: 'BTCUSD', providerTicker: 'BITSTAMP:BTCUSD', titleFa: 'بیت‌کوین / دلار آمریکا', titleEn: 'Bitcoin / U.S. Dollar', category: 'CRYPTO', decimals: 2 },
      { symbolCode: 'XAGUSD', providerTicker: 'OANDA:XAGUSD', titleFa: 'نقره جهانی / دلار آمریکا', titleEn: 'Silver / U.S. Dollar', category: 'METALS', decimals: 3 },
      { symbolCode: 'XAUUSD', providerTicker: 'OANDA:XAUUSD', titleFa: 'طلای جهانی اسپات / دلار', titleEn: 'Gold Spot / U.S. Dollar', category: 'METALS', decimals: 2 },
      { symbolCode: 'SPX500USD', providerTicker: 'OANDA:SPX500USD', titleFa: 'شاخص S&P 500 آمریکا', titleEn: 'US SPX 500', category: 'INDICES', decimals: 2 },
      { symbolCode: 'NDQ', providerTicker: 'NASDAQ:NDX', titleFa: 'شاخص نزدک ۱۰۰ آمریکا', titleEn: 'US 100 Index (Nasdaq 100)', category: 'INDICES', decimals: 2 },
      { symbolCode: 'EURUSD', providerTicker: 'OANDA:EURUSD', titleFa: 'یورو / دلار آمریکا', titleEn: 'Euro / U.S. Dollar', category: 'FX', decimals: 4 },
      { symbolCode: 'USOIL', providerTicker: 'TVC:USOIL', titleFa: 'نفت خام سبک تگزاس (WTI)', titleEn: 'CFDs on WTI Crude Oil', category: 'ENERGY', decimals: 2 },
      { symbolCode: 'NVDA', providerTicker: 'NASDAQ:NVDA', titleFa: 'سهام انویدیا (NVIDIA)', titleEn: 'NVIDIA Corporation', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'AMZN', providerTicker: 'NASDAQ:AMZN', titleFa: 'سهام آمازون (Amazon)', titleEn: 'Amazon.com, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'TSLA', providerTicker: 'NASDAQ:TSLA', titleFa: 'سهام تسلا (Tesla)', titleEn: 'Tesla, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'AAPL', providerTicker: 'NASDAQ:AAPL', titleFa: 'سهام اپل (Apple)', titleEn: 'Apple Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'GOOGL', providerTicker: 'NASDAQ:GOOGL', titleFa: 'سهام آلفابت / گوگل (Google)', titleEn: 'Alphabet Inc (Google) Class A', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'MSFT', providerTicker: 'NASDAQ:MSFT', titleFa: 'سهام مایکروسافت (Microsoft)', titleEn: 'Microsoft Corp.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'META', providerTicker: 'NASDAQ:META', titleFa: 'سهام متا / فیسبوک (Meta)', titleEn: 'Meta Platforms, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'NFLX', providerTicker: 'NASDAQ:NFLX', titleFa: 'سهام نتفلیکس (Netflix)', titleEn: 'Netflix, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'AMD', providerTicker: 'NASDAQ:AMD', titleFa: 'سهام ای‌ام‌دی (AMD)', titleEn: 'Advanced Micro Devices Inc', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'UBER', providerTicker: 'NYSE:UBER', titleFa: 'سهام اوبر (Uber)', titleEn: 'Uber Technologies, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'NKE', providerTicker: 'NYSE:NKE', titleFa: 'سهام نایکی (Nike)', titleEn: 'Nike, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'IBM', providerTicker: 'NYSE:IBM', titleFa: 'سهام آی‌بی‌ام (IBM)', titleEn: 'International Business Machines', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'SAN', providerTicker: 'NYSE:SAN', titleFa: 'سهام بانک سانتاندر (Santander)', titleEn: 'Banco Santander, S.A.', category: 'STOCKS', decimals: 2 },
    ],
  },
  {
    providerId: 'biquote',
    badgeLabel: 'biquote Feed',
    titleFa: 'فید چنددارایی سریع و رایگان biquote (کریپتو، فلزات، انرژی و فارکس)',
    titleEn: 'biquote Multi-Asset Feed (Crypto, Metals, Energy & FX)',
    methodType: 'MULTI_ASSET_PUBLIC_FEED',
    requiresApiKey: false,
    formulaFa: 'اولویت اول برای بیت‌کوین، اتریوم و نقره؛ دریافت سریع کندل‌های بسته‌شده UTC بدون نیاز به کلید API پولی و ذخیره افزایشی فقط کندل‌های جدید در MariaDB.',
    formulaEn: 'Primary free feed for BTCUSD, ETHUSD, and XAGUSD; fetches closed UTC candles without paid API keys and appends only incremental delta bars to MariaDB.',
    supportedTimeframes: ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'],
    storageKeyRule: 'UNIQUE(chart_id, "biquote", timeframe, open_time_utc)',
    symbols: [
      { symbolCode: 'SPOTBRENT', providerTicker: 'BIQUOTE:UKOIL', titleFa: 'نفت برنت اسپات', titleEn: 'Brent Crude (Spot)', category: 'ENERGY', decimals: 3 },
      { symbolCode: 'ETHUSD', providerTicker: 'BIQUOTE:ETHUSD', titleFa: 'اتریوم / دلار آمریکا', titleEn: 'Ethereum / U.S. Dollar', category: 'CRYPTO', decimals: 2 },
      { symbolCode: 'BTCUSD', providerTicker: 'BIQUOTE:BTCUSD', titleFa: 'بیت‌کوین / دلار آمریکا', titleEn: 'Bitcoin / U.S. Dollar', category: 'CRYPTO', decimals: 2 },
      { symbolCode: 'XAGUSD', providerTicker: 'BIQUOTE:XAGUSD', titleFa: 'نقره جهانی / دلار آمریکا', titleEn: 'Silver / U.S. Dollar', category: 'METALS', decimals: 3 },
      { symbolCode: 'XAUUSD', providerTicker: 'BIQUOTE:XAUUSD', titleFa: 'طلای جهانی اسپات / دلار', titleEn: 'Gold Spot / U.S. Dollar', category: 'METALS', decimals: 2 },
      { symbolCode: 'EURUSD', providerTicker: 'BIQUOTE:EURUSD', titleFa: 'یورو / دلار آمریکا', titleEn: 'Euro / U.S. Dollar', category: 'FX', decimals: 4 },
      { symbolCode: 'USOIL', providerTicker: 'BIQUOTE:USOIL', titleFa: 'نفت خام سبک تگزاس (WTI)', titleEn: 'CFDs on WTI Crude Oil', category: 'ENERGY', decimals: 2 },
    ],
  },
  {
    providerId: 'twelve_data',
    badgeLabel: 'Twelve Data API',
    titleFa: 'وب‌سرویس رسمی Twelve Data REST API',
    titleEn: 'Twelve Data REST Time-Series API',
    methodType: 'REST_API_KEY',
    requiresApiKey: true,
    formulaFa: 'اولویت اول برای طلای جهانی (XAUUSD)؛ فراخوانی اندپوینت api.twelvedata.com/time_series با کلید اختصاصی و دریافت صرفاً کندل‌های جدید جاافتاده (outputsize = deltaBars).',
    formulaEn: 'Primary feed for XAUUSD; queries api.twelvedata.com/time_series with API key using incremental outputsize = deltaBars after initial history is stored in MariaDB.',
    supportedTimeframes: ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'],
    storageKeyRule: 'UNIQUE(chart_id, "twelve_data", timeframe, open_time_utc)',
    symbols: [
      { symbolCode: 'SPOTBRENT', providerTicker: 'XBR/USD', titleFa: 'نفت برنت اسپات', titleEn: 'Brent Crude (Spot)', category: 'ENERGY', decimals: 3 },
      { symbolCode: 'ETHUSD', providerTicker: 'ETH/USD', titleFa: 'اتریوم / دلار آمریکا', titleEn: 'Ethereum / U.S. Dollar', category: 'CRYPTO', decimals: 2 },
      { symbolCode: 'BTCUSD', providerTicker: 'BTC/USD', titleFa: 'بیت‌کوین / دلار آمریکا', titleEn: 'Bitcoin / U.S. Dollar', category: 'CRYPTO', decimals: 2 },
      { symbolCode: 'XAGUSD', providerTicker: 'XAG/USD', titleFa: 'نقره جهانی / دلار آمریکا', titleEn: 'Silver / U.S. Dollar', category: 'METALS', decimals: 3 },
      { symbolCode: 'XAUUSD', providerTicker: 'XAU/USD', titleFa: 'طلای جهانی اسپات / دلار', titleEn: 'Gold Spot / U.S. Dollar', category: 'METALS', decimals: 2 },
      { symbolCode: 'SPX500USD', providerTicker: 'SPX', titleFa: 'شاخص S&P 500 آمریکا', titleEn: 'US SPX 500', category: 'INDICES', decimals: 2 },
      { symbolCode: 'NDQ', providerTicker: 'NDX', titleFa: 'شاخص نزدک ۱۰۰ آمریکا', titleEn: 'US 100 Index (Nasdaq 100)', category: 'INDICES', decimals: 2 },
      { symbolCode: 'EURUSD', providerTicker: 'EUR/USD', titleFa: 'یورو / دلار آمریکا', titleEn: 'Euro / U.S. Dollar', category: 'FX', decimals: 4 },
      { symbolCode: 'USOIL', providerTicker: 'WTI/USD', titleFa: 'نفت خام سبک تگزاس (WTI)', titleEn: 'CFDs on WTI Crude Oil', category: 'ENERGY', decimals: 2 },
      { symbolCode: 'NVDA', providerTicker: 'NVDA', titleFa: 'سهام انویدیا (NVIDIA)', titleEn: 'NVIDIA Corporation', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'AMZN', providerTicker: 'AMZN', titleFa: 'سهام آمازون (Amazon)', titleEn: 'Amazon.com, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'TSLA', providerTicker: 'TSLA', titleFa: 'سهام تسلا (Tesla)', titleEn: 'Tesla, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'AAPL', providerTicker: 'AAPL', titleFa: 'سهام اپل (Apple)', titleEn: 'Apple Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'GOOGL', providerTicker: 'GOOGL', titleFa: 'سهام آلفابت / گوگل (Google)', titleEn: 'Alphabet Inc (Google) Class A', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'MSFT', providerTicker: 'MSFT', titleFa: 'سهام مایکروسافت (Microsoft)', titleEn: 'Microsoft Corp.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'META', providerTicker: 'META', titleFa: 'سهام متا / فیسبوک (Meta)', titleEn: 'Meta Platforms, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'NFLX', providerTicker: 'NFLX', titleFa: 'سهام نتفلیکس (Netflix)', titleEn: 'Netflix, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'AMD', providerTicker: 'AMD', titleFa: 'سهام ای‌ام‌دی (AMD)', titleEn: 'Advanced Micro Devices Inc', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'UBER', providerTicker: 'UBER', titleFa: 'سهام اوبر (Uber)', titleEn: 'Uber Technologies, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'NKE', providerTicker: 'NKE', titleFa: 'سهام نایکی (Nike)', titleEn: 'Nike, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'IBM', providerTicker: 'IBM', titleFa: 'سهام آی‌بی‌ام (IBM)', titleEn: 'International Business Machines', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'SAN', providerTicker: 'SAN', titleFa: 'سهام بانک سانتاندر (Santander)', titleEn: 'Banco Santander, S.A.', category: 'STOCKS', decimals: 2 },
    ],
  },
  {
    providerId: 'dukascopy',
    badgeLabel: 'Dukascopy Swiss',
    titleFa: 'فید بین‌بانکی دوکاسکپی سوئیس (Dukascopy Bank)',
    titleEn: 'Dukascopy Swiss Bank Historical Feed',
    methodType: 'SWISS_BANK_FEED',
    requiresApiKey: false,
    formulaFa: 'استخراج کندل‌های استاندارد بین‌بانکی با حذف کامل کندل‌های مصنوعی تعطیلات آخر هفته (volume = 0) و ذخیره‌سازی ماندگار در جدول candles.',
    formulaEn: 'Interbank historical OHLC feed with strict weekend synthetic tick filtering and permanent MariaDB persistence.',
    supportedTimeframes: ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'],
    storageKeyRule: 'UNIQUE(chart_id, "dukascopy", timeframe, open_time_utc)',
    symbols: [
      { symbolCode: 'SPOTBRENT', providerTicker: 'BRENT.CMD/USD', titleFa: 'نفت برنت اسپات', titleEn: 'Brent Crude (Spot)', category: 'ENERGY', decimals: 3 },
      { symbolCode: 'XAGUSD', providerTicker: 'XAG/USD', titleFa: 'نقره جهانی / دلار آمریکا', titleEn: 'Silver / U.S. Dollar', category: 'METALS', decimals: 3 },
      { symbolCode: 'XAUUSD', providerTicker: 'XAU/USD', titleFa: 'طلای جهانی اسپات / دلار', titleEn: 'Gold Spot / U.S. Dollar', category: 'METALS', decimals: 2 },
      { symbolCode: 'EURUSD', providerTicker: 'EUR/USD', titleFa: 'یورو / دلار آمریکا', titleEn: 'Euro / U.S. Dollar', category: 'FX', decimals: 4 },
    ],
  },
  {
    providerId: 'yahoo_finance',
    badgeLabel: 'Yahoo Finance v8',
    titleFa: 'موتور عمومی یاهو فایننس (Yahoo Finance Chart v8 — اولویت اول سهام و شاخص‌ها)',
    titleEn: 'Yahoo Finance v8 Chart Engine (Primary for US Equities & Indices)',
    methodType: 'PUBLIC_REST_V8',
    requiresApiKey: false,
    formulaFa: 'اولویت اول برای سهام آمریکا (NVDA تا SAN) و شاخص‌ها (SPX500USD، NDQ)؛ دریافت کندل از query1.finance.yahoo.com/v8/finance/chart با انتخاب هوشمند بازه کوتاه در حالت Delta Sync.',
    formulaEn: 'Primary free engine for US Equities (NVDA..SAN) and Indices (SPX500USD, NDQ); fetches from query1.finance.yahoo.com/v8/finance/chart with short delta windows.',
    supportedTimeframes: ['M15', 'M30', 'H1', 'H4', 'D1', 'W1'],
    storageKeyRule: 'UNIQUE(chart_id, "yahoo_finance", timeframe, open_time_utc)',
    symbols: [
      { symbolCode: 'SPOTBRENT', providerTicker: 'BZ=F', titleFa: 'نفت برنت اسپات', titleEn: 'Brent Crude (Spot)', category: 'ENERGY', decimals: 3 },
      { symbolCode: 'ETHUSD', providerTicker: 'ETH-USD', titleFa: 'اتریوم / دلار آمریکا', titleEn: 'Ethereum / U.S. Dollar', category: 'CRYPTO', decimals: 2 },
      { symbolCode: 'BTCUSD', providerTicker: 'BTC-USD', titleFa: 'بیت‌کوین / دلار آمریکا', titleEn: 'Bitcoin / U.S. Dollar', category: 'CRYPTO', decimals: 2 },
      { symbolCode: 'XAGUSD', providerTicker: 'SI=F', titleFa: 'نقره جهانی / دلار آمریکا', titleEn: 'Silver / U.S. Dollar', category: 'METALS', decimals: 3 },
      { symbolCode: 'XAUUSD', providerTicker: 'GC=F', titleFa: 'طلای جهانی اسپات / دلار', titleEn: 'Gold Spot / U.S. Dollar', category: 'METALS', decimals: 2 },
      { symbolCode: 'SPX500USD', providerTicker: '^GSPC', titleFa: 'شاخص S&P 500 آمریکا', titleEn: 'US SPX 500', category: 'INDICES', decimals: 2 },
      { symbolCode: 'NDQ', providerTicker: '^NDX', titleFa: 'شاخص نزدک ۱۰۰ آمریکا', titleEn: 'US 100 Index (Nasdaq 100)', category: 'INDICES', decimals: 2 },
      { symbolCode: 'EURUSD', providerTicker: 'EURUSD=X', titleFa: 'یورو / دلار آمریکا', titleEn: 'Euro / U.S. Dollar', category: 'FX', decimals: 4 },
      { symbolCode: 'USOIL', providerTicker: 'CL=F', titleFa: 'نفت خام سبک تگزاس (WTI)', titleEn: 'CFDs on WTI Crude Oil', category: 'ENERGY', decimals: 2 },
      { symbolCode: 'NVDA', providerTicker: 'NVDA', titleFa: 'سهام انویدیا (NVIDIA)', titleEn: 'NVIDIA Corporation', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'AMZN', providerTicker: 'AMZN', titleFa: 'سهام آمازون (Amazon)', titleEn: 'Amazon.com, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'TSLA', providerTicker: 'TSLA', titleFa: 'سهام تسلا (Tesla)', titleEn: 'Tesla, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'AAPL', providerTicker: 'AAPL', titleFa: 'سهام اپل (Apple)', titleEn: 'Apple Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'GOOGL', providerTicker: 'GOOGL', titleFa: 'سهام آلفابت / گوگل (Google)', titleEn: 'Alphabet Inc (Google) Class A', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'MSFT', providerTicker: 'MSFT', titleFa: 'سهام مایکروسافت (Microsoft)', titleEn: 'Microsoft Corp.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'META', providerTicker: 'META', titleFa: 'سهام متا / فیسبوک (Meta)', titleEn: 'Meta Platforms, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'NFLX', providerTicker: 'NFLX', titleFa: 'سهام نتفلیکس (Netflix)', titleEn: 'Netflix, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'AMD', providerTicker: 'AMD', titleFa: 'سهام ای‌ام‌دی (AMD)', titleEn: 'Advanced Micro Devices Inc', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'UBER', providerTicker: 'UBER', titleFa: 'سهام اوبر (Uber)', titleEn: 'Uber Technologies, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'NKE', providerTicker: 'NKE', titleFa: 'سهام نایکی (Nike)', titleEn: 'Nike, Inc.', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'IBM', providerTicker: 'IBM', titleFa: 'سهام آی‌بی‌ام (IBM)', titleEn: 'International Business Machines', category: 'STOCKS', decimals: 2 },
      { symbolCode: 'SAN', providerTicker: 'SAN', titleFa: 'سهام بانک سانتاندر (Santander)', titleEn: 'Banco Santander, S.A.', category: 'STOCKS', decimals: 2 },
    ],
  },
  {
    providerId: 'eia_brent_spot',
    badgeLabel: 'EIA FOB D1',
    titleFa: 'مرجع رسمی روزانه نفت برنت اداره اطلاعات انرژی آمریکا (EIA FOB)',
    titleEn: 'U.S. EIA Official Daily Brent Spot FOB Benchmark',
    methodType: 'OFFICIAL_BENCHMARK_CSV',
    requiresApiKey: false,
    formulaFa: 'سری زمانی رسمی روزانه (D1) قیمت نقدی نفت برنت دریای شمال (Europe Brent Spot Price FOB)؛ ذخیره دائمی کندل‌های روزهای گذشته و دریافت فقط روزهای جدید.',
    formulaEn: 'Official daily (D1) Europe Brent Spot Price FOB benchmark; permanently caches past daily bars and appends only newly published sessions.',
    supportedTimeframes: ['D1'],
    storageKeyRule: 'UNIQUE(chart_id, "eia_brent_spot", "D1", open_time_utc)',
    symbols: [
      { symbolCode: 'SPOTBRENT', providerTicker: 'EIA:RBRTE', titleFa: 'نفت برنت اسپات', titleEn: 'Brent Crude (Spot)', category: 'ENERGY', decimals: 3 },
    ],
  },
];

export function getAssetClass(symbolCode) {
  const code = String(symbolCode || '').trim().toUpperCase();
  if (['SPOTBRENT', 'BRENT_FUTURES', 'USOIL', 'XAUUSD', 'XAGUSD'].includes(code) || code.includes('BRENT') || code.includes('OIL') || code.startsWith('XAU') || code.startsWith('XAG')) {
    return 'COMMODITIES';
  }
  if (['BTCUSD', 'ETHUSD'].includes(code) || code.endsWith('USDT') || (code.endsWith('USD') && (code.startsWith('BTC') || code.startsWith('ETH') || code.startsWith('SOL') || code.startsWith('XRP')))) {
    return 'CRYPTO';
  }
  if (['SPX500USD', 'NDQ'].includes(code) || code.includes('SPX') || code.includes('NDX') || code.includes('US100') || code.includes('US500')) {
    return 'INDICES';
  }
  if (['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF'].includes(code) || (code.length === 6 && (code.startsWith('EUR') || code.startsWith('GBP') || code.endsWith('JPY')))) {
    return 'FX';
  }
  return 'STOCKS';
}

function createDefaultSymbolEntry(symbolCode, decimals, activeProvider, allowedProviders) {
  return {
    symbolCode,
    decimals,
    inWatchlist: true,
    activeProvider,
    allowedProviders,
    timeframe: 'M15',
    lastClose: 0,
    lastCandleUtc: '',
    lastSyncMode: 'DB_CACHE_HIT',
    fetchedNewBars: 0,
    candles: [],
    isSyncing: false,
    syncError: false,
  };
}

const DEFAULT_SYMBOLS = [
  // 1. SPOTBRENT — Brent Crude (Spot)
  createDefaultSymbolEntry('SPOTBRENT', 3, 'tvdatafeed', ['tvdatafeed', 'dukascopy', 'biquote', 'yahoo_finance', 'twelve_data', 'eia_brent_spot']),
  // 2. ETHUSD — Ethereum / U.S. Dollar
  createDefaultSymbolEntry('ETHUSD', 2, 'biquote', ['biquote', 'yahoo_finance', 'twelve_data', 'tvdatafeed']),
  // 3. BTCUSD — Bitcoin / U.S. Dollar
  createDefaultSymbolEntry('BTCUSD', 2, 'biquote', ['biquote', 'yahoo_finance', 'twelve_data', 'tvdatafeed']),
  // 4. XAGUSD — Silver / U.S. Dollar
  createDefaultSymbolEntry('XAGUSD', 3, 'biquote', ['biquote', 'twelve_data', 'yahoo_finance', 'dukascopy', 'tvdatafeed']),
  // 5. XAUUSD — Gold Spot / U.S. Dollar
  createDefaultSymbolEntry('XAUUSD', 2, 'twelve_data', ['twelve_data', 'biquote', 'dukascopy', 'yahoo_finance', 'tvdatafeed']),
  // 6. SPX500USD — US SPX 500
  createDefaultSymbolEntry('SPX500USD', 2, 'yahoo_finance', ['yahoo_finance', 'tvdatafeed', 'twelve_data']),
  // 7. NDQ — US 100 Index (Nasdaq 100)
  createDefaultSymbolEntry('NDQ', 2, 'yahoo_finance', ['yahoo_finance', 'tvdatafeed', 'twelve_data']),
  // 8. EURUSD — Euro / U.S. Dollar
  createDefaultSymbolEntry('EURUSD', 4, 'tvdatafeed', ['tvdatafeed', 'twelve_data', 'biquote', 'dukascopy', 'yahoo_finance']),
  // 9. USOIL — CFDs on WTI Crude Oil
  createDefaultSymbolEntry('USOIL', 2, 'tvdatafeed', ['tvdatafeed', 'yahoo_finance', 'biquote', 'twelve_data']),
  // 10. NVDA — NVIDIA Corporation
  createDefaultSymbolEntry('NVDA', 2, 'yahoo_finance', ['yahoo_finance', 'twelve_data', 'tvdatafeed']),
  // 11. AMZN — Amazon.com, Inc.
  createDefaultSymbolEntry('AMZN', 2, 'yahoo_finance', ['yahoo_finance', 'twelve_data', 'tvdatafeed']),
  // 12. TSLA — Tesla, Inc.
  createDefaultSymbolEntry('TSLA', 2, 'yahoo_finance', ['yahoo_finance', 'twelve_data', 'tvdatafeed']),
  // 13. AAPL — Apple Inc.
  createDefaultSymbolEntry('AAPL', 2, 'yahoo_finance', ['yahoo_finance', 'twelve_data', 'tvdatafeed']),
  // 14. GOOGL — Alphabet Inc (Google) Class A
  createDefaultSymbolEntry('GOOGL', 2, 'yahoo_finance', ['yahoo_finance', 'twelve_data', 'tvdatafeed']),
  // 15. MSFT — Microsoft Corp.
  createDefaultSymbolEntry('MSFT', 2, 'yahoo_finance', ['yahoo_finance', 'twelve_data', 'tvdatafeed']),
  // 16. META — Meta Platforms, Inc.
  createDefaultSymbolEntry('META', 2, 'yahoo_finance', ['yahoo_finance', 'twelve_data', 'tvdatafeed']),
  // 17. NFLX — Netflix, Inc.
  createDefaultSymbolEntry('NFLX', 2, 'yahoo_finance', ['yahoo_finance', 'twelve_data', 'tvdatafeed']),
  // 18. AMD — Advanced Micro Devices Inc
  createDefaultSymbolEntry('AMD', 2, 'yahoo_finance', ['yahoo_finance', 'twelve_data', 'tvdatafeed']),
  // 19. UBER — Uber Technologies, Inc.
  createDefaultSymbolEntry('UBER', 2, 'yahoo_finance', ['yahoo_finance', 'twelve_data', 'tvdatafeed']),
  // 20. NKE — Nike, Inc.
  createDefaultSymbolEntry('NKE', 2, 'yahoo_finance', ['yahoo_finance', 'twelve_data', 'tvdatafeed']),
  // 21. IBM — International Business Machines
  createDefaultSymbolEntry('IBM', 2, 'yahoo_finance', ['yahoo_finance', 'twelve_data', 'tvdatafeed']),
  // 22. SAN — Banco Santander, S.A.
  createDefaultSymbolEntry('SAN', 2, 'yahoo_finance', ['yahoo_finance', 'twelve_data', 'tvdatafeed']),
];

export function normalizeCandle(raw, timeframe = 'M15', nowMs = Date.now()) {
  if (!raw) return null;
  const stepMs = PriceFormatter.stepMilliseconds(timeframe);
  let openMs = Number(
    raw.open_time_utc_ms ||
      (raw.openTimeSec ? Number(raw.openTimeSec) * 1000 : 0) ||
      (raw.time ? Number(raw.time) * 1000 : 0)
  );
  if (!openMs && raw.open_time_utc_iso) {
    const parsed = Date.parse(String(raw.open_time_utc_iso).replace(' UTC', 'Z'));
    if (!isNaN(parsed)) openMs = parsed;
  }
  if (!openMs || openMs <= 0) return null;
  openMs = Math.floor(openMs / stepMs) * stepMs;
  if (openMs + stepMs > nowMs) return null;

  if (String(timeframe).toUpperCase() === 'D1') {
    const symUpper = String(raw.symbol || raw.symbol_code || raw.symbolCode || '').toUpperCase();
    const isCrypto24x7 = symUpper === 'BTCUSD' || symUpper === 'ETHUSD' || symUpper.endsWith('USDT');
    if (!isCrypto24x7) {
      const dow = new Date(openMs).getUTCDay();
      if (dow === 0 || dow === 6) return null;
    }
  }

  const o = Number(raw.open);
  const h = Number(raw.high);
  const l = Number(raw.low);
  const c = Number(raw.close);
  const v = Math.max(0, Number(raw.volume || 0));
  if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) return null;
  if (Math.min(o, h, l, c) <= 0) return null;

  const high = Math.max(o, h, l, c);
  const low = Math.min(o, h, l, c);
  const iso = new Date(openMs).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

  return {
    open_time_utc_ms: openMs,
    open_time_utc_iso: iso,
    openTimeSec: Math.floor(openMs / 1000),
    openTimeUtc: iso,
    open: o,
    high,
    low,
    close: c,
    volume: v,
    is_closed: true,
  };
}

export function mergeCandlesIdempotent(existing = [], incoming = [], timeframe = 'M15', nowMs = Date.now()) {
  const map = new Map();
  for (const item of existing) {
    const norm = normalizeCandle(item, timeframe, nowMs);
    if (norm) map.set(norm.open_time_utc_ms, norm);
  }
  for (const item of incoming) {
    const norm = normalizeCandle(item, timeframe, nowMs);
    if (norm) map.set(norm.open_time_utc_ms, norm);
  }
  return Array.from(map.values()).sort((a, b) => a.open_time_utc_ms - b.open_time_utc_ms);
}

export function resolvePriceBasis(symbolCode = '', providerId = '') {
  const prov = String(providerId || '').toLowerCase();
  if (prov === 'eia_brent_spot') return 'Official FOB Spot';
  if (prov === 'dukascopy') return 'Interbank Spot';
  if (prov === 'biquote') return 'CFD / MT5 Feed';
  if (prov === 'stooq') return 'EOD Historical';
  if (prov === 'yahoo_finance') {
    const sym = String(symbolCode || '').toUpperCase();
    if (['NVDA', 'AMZN', 'TSLA', 'AAPL', 'GOOGL', 'MSFT', 'META', 'NFLX', 'AMD', 'UBER', 'NKE', 'IBM', 'SAN', 'SPX500USD', 'NDQ'].includes(sym)) {
      return 'Official Exchange';
    }
    return 'Spot REST';
  }
  if (prov === 'twelve_data') return 'Spot REST';
  if (prov === 'tvdatafeed') {
    const sym = String(symbolCode || '').toUpperCase();
    if (sym === 'SPOTBRENT' || sym === 'BRENT_FUTURES') return 'Futures Ref';
    return 'CFD Feed';
  }
  return 'Spot Feed';
}

function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFS);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_PREFS, ...parsed };
    if (Number(merged.candleFetchLimit || 0) <= 500) {
      merged.candleFetchLimit = 2500;
    }
    return merged;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function loadSymbols() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SYMBOLS);
    if (!raw) return DEFAULT_SYMBOLS.map((s) => ({ ...s }));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_SYMBOLS.map((s) => ({ ...s }));
    }
    const byCode = new Map();
    for (const def of DEFAULT_SYMBOLS) {
      byCode.set(def.symbolCode, { ...def });
    }
    for (const item of parsed) {
      if (!item || !item.symbolCode) continue;
      const def = DEFAULT_SYMBOLS.find((d) => d.symbolCode === item.symbolCode);
      const allowed = def
        ? def.allowedProviders
        : ['tvdatafeed', 'dukascopy', 'twelve_data', 'yahoo_finance', 'stooq'];
      const activeProv = item.activeProvider || (def ? def.activeProvider : 'tvdatafeed');
      byCode.set(item.symbolCode, {
        ...(def || {}),
        ...item,
        allowedProviders: allowed,
        candles: Array.isArray(item.candles) ? item.candles : [],
        lastSyncMode: item.lastSyncMode || 'DB_CACHE_HIT',
        priceBasis: item.priceBasis || resolvePriceBasis(item.symbolCode, activeProv),
        fetchedNewBars: Number(item.fetchedNewBars || 0),
        isSyncing: false,
        syncError: false,
      });
    }
    return Array.from(byCode.values());
  } catch {
    return DEFAULT_SYMBOLS.map((s) => ({ ...s }));
  }
}

const LEGACY_CHART_ID_MAP = {
  chart_xauusd_main: 'XAUUSD_M15',
  chart_spotbrent_main: 'SPOTBRENT_M15',
  chart_brent_futures: 'BRENT_FUTURES_M15',
  chart_xagusd_spot: 'XAGUSD_M15',
  chart_eurusd_spot: 'EURUSD_M15',
};

export function normalizeCanonicalChartKey(rawKey) {
  if (!rawKey) return 'SPOTBRENT_M15';
  const str = String(rawKey).trim();
  if (LEGACY_CHART_ID_MAP[str]) return LEGACY_CHART_ID_MAP[str];
  if (str.startsWith('chart_custom_')) {
    const code = str.replace('chart_custom_', '').toUpperCase();
    return `${code}_M15`;
  }
  return str;
}

export function normalizeHexForWeb(rawHex, fallback = '#2962FF') {
  if (!rawHex || typeof rawHex !== 'string') return fallback;
  const clean = rawHex.trim().replace(/^#/, '');
  if (clean.length === 8) return '#' + clean.slice(2).toUpperCase();
  if (clean.length === 6) return '#' + clean.toUpperCase();
  return fallback;
}

export function normalizeHexForAndroid(rawHex, fallback = 'FF2962FF') {
  if (!rawHex || typeof rawHex !== 'string') return fallback;
  const clean = rawHex.trim().replace(/^#/, '').toUpperCase();
  if (clean.length === 6) return 'FF' + clean;
  if (clean.length === 8) return clean;
  return fallback;
}

export function normalizeDrawingObject(d) {
  if (!d || typeof d !== 'object') return null;
  const rawType = String(d.type || 'horizontal_line');
  const type =
    rawType === 'hline'
      ? 'horizontal_line'
      : rawType === 'vline'
        ? 'vertical_line'
        : rawType === 'trend'
          ? 'trend_line'
          : rawType === 'fib'
            ? 'fib_retracement'
            : rawType;
  const colorHex = normalizeHexForWeb(d.colorHex || d.color, '#2962FF');
  const strokeW = Number(d.strokeWidthDp || d.strokeWidth || d.lineWidthPx || d.strokeWidthPx || 2);
  const base = {
    id: String(d.id || `${type}_${Date.now()}`),
    type,
    color: colorHex,
    colorHex,
    strokeWidth: strokeW,
    strokeWidthDp: strokeW,
    lineWidthPx: strokeW,
    label: d.label || '',
  };
  if (type === 'horizontal_line') {
    const p = Number(d.price !== undefined ? d.price : d.price1 || 0);
    return { ...base, price: p, price1: p };
  }
  if (type === 'vertical_line') {
    const t = Number(d.timeUtcMillis || (d.time1EpochSec ? d.time1EpochSec * 1000 : 0));
    return { ...base, timeUtcMillis: t };
  }
  if (type === 'trend_line' || type === 'fib_retracement') {
    const t1 = Number(d.startTimeUtcMillis || d.t1 || (d.time1EpochSec ? d.time1EpochSec * 1000 : 0));
    const t2 = Number(d.endTimeUtcMillis || d.t2 || (d.time2EpochSec ? d.time2EpochSec * 1000 : 0));
    const p1 = Number(d.startPrice !== undefined ? d.startPrice : d.p1 !== undefined ? d.p1 : d.price1 || 0);
    const p2 = Number(d.endPrice !== undefined ? d.endPrice : d.p2 !== undefined ? d.p2 : d.price2 || 0);
    return {
      ...base,
      startTimeUtcMillis: t1,
      endTimeUtcMillis: t2,
      startPrice: p1,
      endPrice: p2,
    };
  }
  if (type === 'long_position' || type === 'short_position') {
    return {
      ...base,
      startTimeUtcMillis: Number(d.startTimeUtcMillis || 0),
      endTimeUtcMillis: Number(d.endTimeUtcMillis || 0),
      entryPrice: Number(d.entryPrice || 0),
      targetPrice: Number(d.targetPrice || 0),
      stopPrice: Number(d.stopPrice || 0),
    };
  }
  return base;
}

function loadDrawingsByKey() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DRAWINGS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result = {};
    for (const [k, list] of Object.entries(parsed)) {
      if (Array.isArray(list)) {
        const normKey = normalizeCanonicalChartKey(k);
        result[normKey] = list.map(normalizeDrawingObject).filter(Boolean);
      }
    }
    return result;
  } catch {
    return {};
  }
}

function loadOpenTabsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OPEN_TABS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

const isAutoAuthSaved =
  localStorage.getItem('ci_remember_creds') !== 'false' &&
  localStorage.getItem('ci_auto_authenticated') === 'true' &&
  Boolean(localStorage.getItem('ci_owner_username'));

export const state = {
  isDarkTheme: localStorage.getItem(STORAGE_KEY_THEME) !== 'false',
  isAuthenticated: isAutoAuthSaved,
  isOwnerRegistered: Boolean(localStorage.getItem('ci_owner_username')),
  ownerUsername: localStorage.getItem('ci_owner_username') || '',
  ownerEmail: localStorage.getItem('ci_owner_email') || '',
  savedPassword: localStorage.getItem('ci_saved_password') || '',
  rememberCredentials: localStorage.getItem('ci_remember_creds') !== 'false',
  authMode: 'login',
  authErrorKey: '',
  authInfoKey: '',
  statusBannerKey: '',

  currentScreen: 'watchlist',
  activeNav: 'watchlist',
  isSideDrawerOpen: true,
  isFullscreen: false,
  activeModal: null,
  settingsTab: 'sources',
  showLoginPassword: false,

  watchlistSearchQuery: '',
  watchlistCategory: 'ALL',
  symbolOverviewCode: null,
  symbolOverviewRange: '5D',
  isAddSymbolModalOpen: false,
  activeRailPopup: null,

  chartPreferences: loadPreferences(),
  symbols: loadSymbols(),
  drawingsByChartId: loadDrawingsByKey(),
  candleCache: {},

  openTabs: loadOpenTabsFromStorage(),
  activeTabId: null,
  lastOpenedSymbolCode: localStorage.getItem(STORAGE_KEY_LAST_SYMBOL) || 'SPOTBRENT',

  systemStatus: null,
  isWorkspaceSyncing: false,
  lastWorkspaceSyncedAt: null,

  sourceExplorerMode: 'by_source',
  selectedExplorerProvider: 'tvdatafeed',
  symbolExplorerSearchQuery: '',
  settingsSourceCategory: 'ALL',
  providerCatalogStats: [],

  rightPanelWidth: Math.max(
    185,
    Math.min(520, Number(localStorage.getItem('ci_right_panel_w') || 310))
  ),
  watchlistTopRatio: Math.max(
    0.22,
    Math.min(0.78, Number(localStorage.getItem('ci_wl_top_ratio') || 0.52))
  ),
};

let autoSyncCallback = null;
let autoSyncTimerId = null;

export function registerAutoSyncCallback(cb) {
  autoSyncCallback = cb;
}

export function scheduleDebouncedCloudSync() {
  if (typeof autoSyncCallback !== 'function') return;
  if (autoSyncTimerId) clearTimeout(autoSyncTimerId);
  autoSyncTimerId = setTimeout(() => {
    autoSyncTimerId = null;
    autoSyncCallback();
  }, 800);
}

export function saveLastOpenedSymbol(symbolCode) {
  if (!symbolCode) return;
  state.lastOpenedSymbolCode = String(symbolCode).trim().toUpperCase();
  localStorage.setItem(STORAGE_KEY_LAST_SYMBOL, state.lastOpenedSymbolCode);
}

export function savePanelLayout() {
  localStorage.setItem('ci_right_panel_w', String(Math.round(state.rightPanelWidth || 310)));
  localStorage.setItem('ci_wl_top_ratio', String(Number(state.watchlistTopRatio || 0.52).toFixed(3)));
}

export function savePreferences(skipCloudSync = false) {
  localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(state.chartPreferences));
  if (!skipCloudSync) scheduleDebouncedCloudSync();
}

export const INDICATOR_FLAG_KEYS = [
  'showSma20',
  'showSma50',
  'showSma200',
  'showEma20',
  'showEma50',
  'showEma200',
  'showSupertrend',
  'showVwap',
  'showBollinger',
  'showOverlayMacd',
  'showRsi14',
  'showMacd',
  'showAtr14',
  'showSmcStructure',
  'showFvg',
  'showVolumeProfile',
  'showStoch14',
  'showCci20',
  'showWillR14',
  'showRoc12',
];

export function syncIndicatorsAcrossTabsAndPrefs(sourceTab, skipSave = false) {
  if (!sourceTab) return;
  for (const k of INDICATOR_FLAG_KEYS) {
    const val = Boolean(sourceTab[k]);
    state.chartPreferences[k] = val;
    for (const tab of state.openTabs) {
      tab[k] = val;
    }
  }
  if (sourceTab.bollingerPeriod !== undefined) {
    const bp = Math.max(2, Math.min(200, Math.round(Number(sourceTab.bollingerPeriod) || 20)));
    state.chartPreferences.bollingerPeriod = bp;
    for (const tab of state.openTabs) {
      tab.bollingerPeriod = bp;
    }
  }
  if (sourceTab.bollingerStdDev !== undefined) {
    const bsd = Math.max(0.5, Math.min(5.0, Number(sourceTab.bollingerStdDev) || 2.0));
    state.chartPreferences.bollingerStdDev = bsd;
    for (const tab of state.openTabs) {
      tab.bollingerStdDev = bsd;
    }
  }
  if (!skipSave) {
    savePreferences();
    saveOpenTabsToStorage();
  }
}

export function resetColorsToDefault() {
  state.chartPreferences.bullColor = DEFAULT_PREFS.bullColor;
  state.chartPreferences.bearColor = DEFAULT_PREFS.bearColor;
  state.chartPreferences.trendColor = DEFAULT_PREFS.trendColor;
  state.chartPreferences.hLineColor = DEFAULT_PREFS.hLineColor;
  state.chartPreferences.vLineColor = DEFAULT_PREFS.vLineColor;
  state.chartPreferences.defaultDrawingColorHex = DEFAULT_PREFS.defaultDrawingColorHex;
  state.chartPreferences.defaultDrawingWidthPx = DEFAULT_PREFS.defaultDrawingWidthPx;
  for (const tab of state.openTabs) {
    tab.activeDrawingColor = DEFAULT_PREFS.defaultDrawingColorHex;
    tab.activeDrawingColorHex = DEFAULT_PREFS.defaultDrawingColorHex;
    tab.activeDrawingWidthPx = DEFAULT_PREFS.defaultDrawingWidthPx;
  }
  savePreferences();
  saveOpenTabsToStorage();
}

export function resetAlgoParamsToDefault() {
  state.chartPreferences.candleFetchLimit = DEFAULT_PREFS.candleFetchLimit;
  state.chartPreferences.zoomStepCandles = DEFAULT_PREFS.zoomStepCandles;
  state.chartPreferences.drawingHitTolerancePx = DEFAULT_PREFS.drawingHitTolerancePx;
  state.chartPreferences.bollingerPeriod = DEFAULT_PREFS.bollingerPeriod;
  state.chartPreferences.bollingerStdDev = DEFAULT_PREFS.bollingerStdDev;
  savePreferences();
}

export function resetAllPreferencesToDefault() {
  Object.assign(state.chartPreferences, { ...DEFAULT_PREFS });
  for (const tab of state.openTabs) {
    tab.activeDrawingColor = DEFAULT_PREFS.defaultDrawingColorHex;
    tab.activeDrawingColorHex = DEFAULT_PREFS.defaultDrawingColorHex;
    tab.activeDrawingWidthPx = DEFAULT_PREFS.defaultDrawingWidthPx;
  }
  savePreferences();
  saveOpenTabsToStorage();
}

export function saveSymbolsToStorage(skipCloudSync = false) {
  const clean = state.symbols.map((s) => ({
    symbolCode: s.symbolCode,
    customTitle: s.customTitle || '',
    decimals: s.decimals,
    inWatchlist: s.inWatchlist,
    activeProvider: s.activeProvider,
    timeframe: s.timeframe,
    lastClose: s.lastClose,
    lastCandleUtc: s.lastCandleUtc,
    isCustom: Boolean(s.isCustom),
  }));
  localStorage.setItem(STORAGE_KEY_SYMBOLS, JSON.stringify(clean));
  if (!skipCloudSync) scheduleDebouncedCloudSync();
}

export const saveSymbols = saveSymbolsToStorage;

export function saveDrawings(chartKey, drawingsList, skipCloudSync = false) {
  const normKey = normalizeCanonicalChartKey(chartKey);
  if (normKey && Array.isArray(drawingsList)) {
    state.drawingsByChartId[normKey] = drawingsList.map(normalizeDrawingObject).filter(Boolean);
  }
  localStorage.setItem(STORAGE_KEY_DRAWINGS, JSON.stringify(state.drawingsByChartId));
  if (!skipCloudSync) scheduleDebouncedCloudSync();
}

export function saveOpenTabsToStorage(skipCloudSync = false) {
  const clean = state.openTabs.map((t) => ({
    tabId: t.tabId,
    symbolCode: t.symbolCode,
    provider: t.provider,
    timeframe: t.timeframe,
    chartType: t.chartType || 'candles',
    visibleCount: t.visibleCount || 48,
    scrollOffset: t.scrollOffset || 0,
    priceScaleFactor: t.priceScaleFactor || 1.0,
    verticalPriceOffset: t.verticalPriceOffset || 0.0,
    isLogScale: Boolean(t.isLogScale),
    selectedRangePreset: t.selectedRangePreset || null,
    showSma20: Boolean(t.showSma20),
    showSma50: Boolean(t.showSma50),
    showSma200: Boolean(t.showSma200),
    showEma20: Boolean(t.showEma20),
    showEma50: Boolean(t.showEma50),
    showSupertrend: Boolean(t.showSupertrend),
    showVwap: Boolean(t.showVwap),
    showBollinger: Boolean(t.showBollinger),
    showOverlayMacd: Boolean(t.showOverlayMacd),
    showVolume: t.showVolume !== false,
    showRsi14: Boolean(t.showRsi14),
    showMacd: Boolean(t.showMacd),
    showAtr14: Boolean(t.showAtr14),
    showSmcStructure: Boolean(t.showSmcStructure),
    showFvg: Boolean(t.showFvg),
    showVolumeProfile: Boolean(t.showVolumeProfile),
    isMagnetMode: Boolean(t.isMagnetMode),
    activeDrawingColor:
      t.activeDrawingColorHex || t.activeDrawingColor || state.chartPreferences.defaultDrawingColorHex || '#2962FF',
    activeDrawingColorHex:
      t.activeDrawingColorHex || t.activeDrawingColor || state.chartPreferences.defaultDrawingColorHex || '#2962FF',
    activeDrawingWidthPx: Number(t.activeDrawingWidthPx || state.chartPreferences.defaultDrawingWidthPx || 2.0),
  }));
  localStorage.setItem(STORAGE_KEY_OPEN_TABS, JSON.stringify(clean));
  if (!skipCloudSync) scheduleDebouncedCloudSync();
}

export const saveOpenTabs = saveOpenTabsToStorage;

function loadCandlesFromLocalStorage(key, timeframe) {
  try {
    const raw = localStorage.getItem(STORAGE_CANDLES_PREFIX + key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return mergeCandlesIdempotent([], parsed, timeframe);
  } catch {
    return [];
  }
}

export function saveCandlesToCache(key, candles, maxLimit = 5000) {
  const parts = String(key).split('_');
  const tf = parts[parts.length - 1] || 'M15';
  const normalized = mergeCandlesIdempotent([], candles, tf).slice(-Math.max(40, Math.min(5000, maxLimit)));
  state.candleCache[key] = normalized;
  try {
    localStorage.setItem(STORAGE_CANDLES_PREFIX + key, JSON.stringify(normalized.slice(-1500)));
  } catch {
    // Ignore storage quota warnings
  }
}

export function getCachedOrAggregatedCandles(symbolCode, provider, timeframe) {
  const rawTf = String(timeframe || 'M15').toUpperCase();
  const normTf = provider === 'eia_brent_spot' ? 'D1' : provider === 'stooq' && rawTf !== 'W1' ? 'D1' : rawTf;
  const exactKey = `${symbolCode}_${provider}_${normTf}`;
  let current = state.candleCache[exactKey];
  if (!current || current.length === 0) {
    current = loadCandlesFromLocalStorage(exactKey, normTf);
    if (current.length > 0) {
      state.candleCache[exactKey] = current;
    }
  }

  const minNativeBars =
    normTf === 'M15'
      ? 300
      : normTf === 'M30' || normTf === 'H1'
        ? 240
        : normTf === 'H4'
          ? 180
          : normTf === 'D1'
            ? 250
            : 140;
  const hasFullNativeCache = Array.isArray(current) && current.length >= minNativeBars;

  if (normTf === 'M30' || normTf === 'H1' || normTf === 'H4') {
    const m15Key = `${symbolCode}_${provider}_M15`;
    const m15 = state.candleCache[m15Key] || loadCandlesFromLocalStorage(m15Key, 'M15');
    if (m15 && m15.length > 0) {
      const aggFromM15 = TimeframeAggregator.aggregateCandles(m15, normTf);
      if (aggFromM15.length > 0) {
        current = mergeCandlesIdempotent(current || [], aggFromM15, normTf);
        if (hasFullNativeCache) {
          state.candleCache[exactKey] = current;
        }
      }
    }
    if (normTf === 'H4') {
      const h1Key = `${symbolCode}_${provider}_H1`;
      const h1 = state.candleCache[h1Key] || loadCandlesFromLocalStorage(h1Key, 'H1');
      if (h1 && h1.length > 0) {
        const aggFromH1 = TimeframeAggregator.aggregateCandles(h1, 'H4');
        if (aggFromH1.length > 0) {
          current = mergeCandlesIdempotent(current || [], aggFromH1, 'H4');
          if (hasFullNativeCache) {
            state.candleCache[exactKey] = current;
          }
        }
      }
    }
  } else if (normTf === 'D1' && (!current || current.length === 0)) {
    // Only use intraday-aggregated D1 if it spans at least 60 days; otherwise return empty
    // so syncSymbolNow/fetchFromBackend immediately fetches full multi-year D1 bars from backend.
    const h4Key = `${symbolCode}_${provider}_H4`;
    const h4 = state.candleCache[h4Key] || loadCandlesFromLocalStorage(h4Key, 'H4');
    if (h4 && h4.length >= 360) {
      const agg = TimeframeAggregator.aggregateCandles(h4, 'D1');
      if (agg.length >= 60) current = agg;
    }
  } else if (normTf === 'W1' && (!current || current.length === 0)) {
    const d1Key = `${symbolCode}_${provider}_D1`;
    const d1 = state.candleCache[d1Key] || loadCandlesFromLocalStorage(d1Key, 'D1');
    if (d1 && d1.length > 0) {
      current = TimeframeAggregator.aggregateCandles(d1, 'W1');
    } else {
      const h4Key = `${symbolCode}_${provider}_H4`;
      const h4 = state.candleCache[h4Key] || loadCandlesFromLocalStorage(h4Key, 'H4');
      if (h4 && h4.length > 0) {
        current = TimeframeAggregator.aggregateCandles(h4, 'W1');
      }
    }
  }

  return current || [];
}
