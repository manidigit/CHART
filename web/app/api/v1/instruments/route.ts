import { NextResponse } from "next/server";
import { instruments } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    instruments,
    dataPolicy: {
      minimumTimeframe: "M15",
      analysisUsesClosedCandlesOnly: true,
      refreshIntervalMinutes: 60,
      brokerConnections: false,
      orderExecution: false,
    },
  });
}
