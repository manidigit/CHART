export type ChartCandle = {
  openTimeUtcMs: number;
  closeTimeUtcMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Props = {
  candles: ChartCandle[];
  height?: number;
};

export default function MarketCandlestickChart({ candles, height = 280 }: Props) {
  if (candles.length === 0) return null;

  const width = 1000;
  const left = 12;
  const right = 74;
  const top = 14;
  const bottom = height - 28;
  const values = candles.flatMap((candle) => [candle.high, candle.low]);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.0001, 0.000001);
  const min = rawMin - spread * 0.08;
  const max = rawMax + spread * 0.08;
  const plotHeight = bottom - top;
  const plotWidth = width - left - right;
  const y = (price: number) => bottom - ((price - min) / (max - min)) * plotHeight;
  const slot = plotWidth / candles.length;
  const bodyWidth = Math.max(2, Math.min(12, slot * 0.62));

  return (
    <svg className="market-candles" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="M15 candlestick price chart">
      {Array.from({ length: 5 }, (_, index) => {
        const yy = top + (plotHeight / 4) * index;
        const price = max - ((max - min) / 4) * index;
        return (
          <g key={index}>
            <line x1={left} x2={width - right + 8} y1={yy} y2={yy} stroke="#243448" strokeDasharray="3 5" />
            <text x={width - right + 14} y={yy + 4} fill="#8092a8" fontSize="11" fontFamily="monospace">{price.toFixed(2)}</text>
          </g>
        );
      })}
      {candles.map((candle, index) => {
        const center = left + slot * (index + 0.5);
        const bullish = candle.close >= candle.open;
        const color = bullish ? "#42d6a0" : "#ed7180";
        const bodyTop = y(Math.max(candle.open, candle.close));
        const bodyBottom = y(Math.min(candle.open, candle.close));
        return (
          <g key={candle.openTimeUtcMs}>
            <line x1={center} x2={center} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1.4" />
            <rect
              x={center - bodyWidth / 2}
              y={bodyTop}
              width={bodyWidth}
              height={Math.max(1.5, bodyBottom - bodyTop)}
              rx="1"
              fill={bullish ? color : "#ed7180"}
              opacity="0.9"
            />
          </g>
        );
      })}
    </svg>
  );
}
