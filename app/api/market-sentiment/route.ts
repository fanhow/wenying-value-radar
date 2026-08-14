import { NextResponse } from "next/server";
import {
  classifyVix,
  parseYahooSentimentSeries,
  volatilityCurveLabel,
  type SentimentSeries,
  type YahooSentimentPayload,
} from "../../../lib/market-sentiment";

const SERIES = [
  ["^VIX9D", "Cboe 9-Day Volatility Index"],
  ["^VIX", "Cboe Volatility Index"],
  ["^VIX3M", "Cboe 3-Month Volatility Index"],
  ["^GSPC", "S&P 500"],
  ["^IXIC", "Nasdaq Composite"],
  ["^RUT", "Russell 2000"],
] as const;

async function fetchSeries(symbol: string, label: string) {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=6mo`,
    {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; WenYingValueRadar/1.0)" },
      next: { revalidate: 15 * 60 },
      signal: AbortSignal.timeout(4_500),
    },
  );
  if (!response.ok) throw new Error(`${symbol} unavailable`);
  return parseYahooSentimentSeries(await response.json() as YahooSentimentPayload, symbol, label);
}

export async function GET() {
  const settled = await Promise.allSettled(SERIES.map(([symbol, label]) => fetchSeries(symbol, label)));
  const series = settled.flatMap((result): SentimentSeries[] => result.status === "fulfilled" && result.value ? [result.value] : []);
  const bySymbol = Object.fromEntries(series.map((item) => [item.symbol, item]));
  const vix9d = bySymbol["^VIX9D"];
  const vix = bySymbol["^VIX"];
  const vix3m = bySymbol["^VIX3M"];

  const curve = vix9d && vix && vix3m ? volatilityCurveLabel(vix9d.current, vix.current, vix3m.current) : null;
  const signal = vix ? classifyVix(vix.current, curve?.shortTermRatio ?? null) : null;
  if (!vix) return NextResponse.json({ error: "VIX unavailable", series }, { status: 503 });

  return NextResponse.json({
    asOf: new Date().toISOString(),
    signal,
    curve,
    series,
    sources: {
      marketData: "Yahoo Finance chart API",
      methodology: "Cboe Volatility Index methodology",
    },
  }, {
    headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
  });
}
