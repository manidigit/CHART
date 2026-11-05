import { NextRequest, NextResponse } from "next/server";
import { instruments } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const instrumentId = request.nextUrl.searchParams.get("instrumentId");
  if (!instruments.some((item) => item.id === instrumentId)) {
    return NextResponse.json({ error: { code: "UNKNOWN_INSTRUMENT", message: "The requested instrument is not supported.", retryable: false } }, { status: 404 });
  }
  return NextResponse.json({
    error: {
      code: "FORECAST_ENGINE_NOT_READY",
      message: "Official forecasts require verified history, an approved shared model and server-side validation.",
      retryable: true
    },
    instrumentId
  }, { status: 503 });
}
