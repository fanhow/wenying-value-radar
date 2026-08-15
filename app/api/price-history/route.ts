import { NextRequest, NextResponse } from "next/server";
import { loadPublicTechnicalData } from "../../../lib/public-technical-data";

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  const market = request.nextUrl.searchParams.get("market") === "TW" ? "TW" : "US";
  if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) return NextResponse.json({ error: "invalid ticker" }, { status: 400 });

  const result = await loadPublicTechnicalData(ticker, market);
  if (result) return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=900, stale-while-revalidate=3600" } });

  return NextResponse.json({ ticker, market, candles: [], error: "history unavailable" }, { status: 404 });
}
