import { NextRequest, NextResponse } from "next/server";
import { loadUsEarningsReport } from "../../../lib/us-earnings";

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  if (!ticker || /^\d/.test(ticker) || !/^[A-Z.-]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid US ticker symbol" }, { status: 400 });
  }

  try {
    const report = await loadUsEarningsReport(ticker);
    if (!report) {
      return NextResponse.json({ error: "Earnings report not available for this ticker" }, { status: 404 });
    }
    return NextResponse.json(report, {
      headers: { "Cache-Control": "public, max-age=900, stale-while-revalidate=3600" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load earnings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
