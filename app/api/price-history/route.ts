import { NextRequest, NextResponse } from "next/server";
import { parseYahooDailyCandles, yahooHistorySymbols } from "../../../lib/price-history";

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  const market = request.nextUrl.searchParams.get("market") === "TW" ? "TW" : "US";
  if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) return NextResponse.json({ error: "invalid ticker" }, { status: 400 });

  for (const symbol of yahooHistorySymbols(ticker, market)) {
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=6mo&events=history`,
        {
          headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; WenYingValueRadar/1.0)" },
          next: { revalidate: 60 * 60 },
          signal: AbortSignal.timeout(4_000),
        },
      );
      if (!response.ok) continue;
      const candles = parseYahooDailyCandles(await response.json());
      if (candles.length >= 20) return NextResponse.json({ ticker, market, symbol, candles });
    } catch {
      // Try the next exchange suffix. Taiwan listed stocks use .TW while OTC
      // stocks use .TWO, and the valuation object intentionally stays exchange-neutral.
    }
  }

  return NextResponse.json({ ticker, market, candles: [], error: "history unavailable" }, { status: 404 });
}

