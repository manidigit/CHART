import { NextRequest, NextResponse } from "next/server";
import { instruments } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const instrumentId = request.nextUrl.searchParams.get("instrumentId");
  const timeframe = request.nextUrl.searchParams.get("timeframe") ?? "M15";
  if (!instruments.some((item) => item.id === instrumentId)) {
    return NextResponse.json({ error: { code: "UNKNOWN_INSTRUMENT", message: "The requested instrument is not supported.", retryable: false } }, { status: 404 });
  }
  if (timeframe !== "M15") {
    return NextResponse.json({ error: { code: "UNSUPPORTED_TIMEFRAME", message: "The initial analysis service supports M15 only.", retryable: false } }, { status: 400 });
  }
  return NextResponse.json({
    error: {
      code: "VERIFIED_CANDLES_UNAVAILABLE",
      message: "Technical analysis is withheld until sufficient verified, closed M15 candles are available.",
      retryable: true
    },
    instrumentId,
    timeframe
  }, { status: 503 });
}
