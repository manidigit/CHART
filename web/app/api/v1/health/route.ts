import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    service: "chart-market-api",
    status: "operational",
    marketData: "not_configured",
    execution: "disabled",
    checkedAt: new Date().toISOString(),
  });
}
