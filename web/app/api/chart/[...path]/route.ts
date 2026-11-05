import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const origin = process.env.CHART_API_ORIGIN;
  const token = process.env.CHART_API_READ_TOKEN;
  if (!origin || !token) {
    return NextResponse.json({ error: "server_api_not_configured" }, { status: 503 });
  }
  const { path } = await context.params;
  const safePath = path.map((part) => encodeURIComponent(part)).join("/");
  const target = new URL(`/api/v1/${safePath}`, origin);
  target.search = request.nextUrl.search;
  try {
    const upstream = await fetch(target, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "upstream_api_unavailable" }, { status: 502 });
  }
}
