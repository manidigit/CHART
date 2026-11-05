import { NextResponse } from "next/server";
import { instruments } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    refreshIntervalMinutes: 60,
    status: "provider_not_configured",
    instruments: instruments.map((instrument) => ({
      ...instrument,
      quote: null,
      lastClosedCandleAt: null,
      freshness: "unavailable",
      message: "A verified market-data provider has not been connected.",
    })),
    notice: "No synthetic or placeholder prices are presented as live market data.",
  }, { status: 503 });
}
