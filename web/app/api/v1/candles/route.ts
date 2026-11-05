import { NextRequest, NextResponse } from "next/server";
import { instruments } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const instrumentId = request.nextUrl.searchParams.get("instrumentId");
  const timeframe = request.nextUrl.searchParams.get("timeframe") ?? "M15";
  const instrument = instruments.find((item) => item.id === instrumentId);

  if (!instrument) {
    return NextResponse.json({
      error: { code: "UNKNOWN_INSTRUMENT", message: "The requested instrument is not supported.", retryable: false },
    }, { status: 404 });
  }

  if (timeframe !== "M15") {
    return NextResponse.json({
      error: { code: "UNSUPPORTED_TIMEFRAME", message: "The initial shared data service exposes M15 candles only.", retryable: false },
    }, { status: 400 });
  }

  return NextResponse.json({
    error: {
      code: "MARKET_PROVIDER_NOT_CONFIGURED",
      message: "No verified provider is configured for this instrument. Candles are intentionally withheld.",
      retryable: true,
    },
    instrumentId,
    timeframe,
  }, { status: 503 });
}
