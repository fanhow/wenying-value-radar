import { NextResponse } from "next/server";
import fundHoldingsSnapshot from "../../../lib/fund-holdings-snapshot.json";
import usMarketSnapshot from "../../../lib/us-market-snapshot.json";
import {
  readFinancialSnapshots,
  readMarketPriceSnapshots,
  type FinancialSnapshot,
  type MarketPriceSnapshot,
} from "../../../lib/snapshot-store";

type FundHolding = { ticker: string };
type FundSnapshot = { funds: Array<{ holdings: FundHolding[] }> };

function parsePayload(payload: string | undefined) {
  if (!payload) return {} as Record<string, unknown>;
  try {
    const value = JSON.parse(payload) as Record<string, unknown>;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

export async function GET() {
  const snapshot = fundHoldingsSnapshot as FundSnapshot;
  const tickers = [...new Set(snapshot.funds.flatMap((fund) => fund.holdings.map((holding) => holding.ticker.toUpperCase())))];
  const bundled = new Map((usMarketSnapshot as Array<Record<string, unknown>>).map((row) => [String(row.ticker).toUpperCase(), row]));
  const [financialSnapshots, priceSnapshots] = await Promise.all([
    readFinancialSnapshots(),
    readMarketPriceSnapshots(),
  ]);
  const financialByTicker = new Map(financialSnapshots.map((row: FinancialSnapshot) => [row.ticker.toUpperCase(), row]));
  const priceByTicker = new Map(priceSnapshots
    .filter((row: MarketPriceSnapshot) => row.market === "US")
    .map((row: MarketPriceSnapshot) => [row.ticker.toUpperCase(), row]));
  const rows = tickers.flatMap((ticker) => {
    const base = bundled.get(ticker);
    const financial = parsePayload(financialByTicker.get(ticker)?.payload);
    const price = priceByTicker.get(ticker);
    if (!base && !financial.eps) return [];
    return [{
      ...(base ?? {}),
      ...financial,
      ticker,
      price: price?.price ?? financial.price ?? base?.price ?? 0,
      name: price?.name || String(financial.name ?? base?.name ?? ticker),
      date: price?.priceDate ?? financial.updatedAt ?? base?.date,
      financialDataDate: financial.financialDataDate ?? base?.financialDataDate,
    }];
  });
  return NextResponse.json({ rows, source: financialSnapshots.length ? "background-snapshot" : "bundled-fallback" });
}
