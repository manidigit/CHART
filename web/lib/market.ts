export type InstrumentId = "XAUUSD_SPOT" | "SPOTBRENT";

export type MarketInstrument = {
  id: InstrumentId;
  symbol: string;
  name: string;
  assetClass: "SPOT";
  timeframe: "M15";
  providerStatus: "not_configured" | "connected" | "degraded";
};

export const instruments: MarketInstrument[] = [
  {
    id: "XAUUSD_SPOT",
    symbol: "XAUUSD",
    name: "Gold Spot / U.S. Dollar",
    assetClass: "SPOT",
    timeframe: "M15",
    providerStatus: "not_configured",
  },
  {
    id: "SPOTBRENT",
    symbol: "SPOTBRENT",
    name: "Brent Crude (Spot)",
    assetClass: "SPOT",
    timeframe: "M15",
    providerStatus: "not_configured",
  },
];

export type ApiError = {
  code: string;
  message: string;
  retryable: boolean;
};
