import { NextResponse } from "next/server";
import { selectMarketCandidates, type MarketScanRow } from "../../../lib/market-scan";
import tpexSnapshot from "../../../lib/tpex-snapshot.json";
import usMarketSnapshot from "../../../lib/us-market-snapshot.json";

type TwseRatioRow = { Date?: string; Code?: string; Name?: string; PEratio?: string; PBratio?: string };
type TwseDailyRow = { Date?: string; Code?: string; Name?: string; ClosingPrice?: string };

async function optionalRows<T>(url: string): Promise<T[]> {
  try {
    const response = await fetch(url, { next: { revalidate: 60 * 60 * 6 } });
    if (!response.ok) return [];
    return response.json() as Promise<T[]>;
  } catch {
    return [];
  }
}

export async function GET() {
  const [twseRatios, twseDaily] = await Promise.all([
    optionalRows<TwseRatioRow>("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"),
    optionalRows<TwseDailyRow>("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"),
  ]);
  const twsePriceByTicker = new Map(twseDaily.map((row) => [row.Code, row]));
  const listed: MarketScanRow[] = twseRatios.map((row) => {
    const quote = twsePriceByTicker.get(row.Code);
    return {
      ticker: row.Code ?? "",
      name: row.Name || quote?.Name || "",
      price: quote?.ClosingPrice ?? 0,
      pe: row.PEratio ?? 0,
      pb: row.PBratio ?? 0,
      date: row.Date || quote?.Date,
      sector: "台灣上市公司",
    };
  });
  const otc: MarketScanRow[] = tpexSnapshot.map((row) => ({
    ticker: row.ticker,
    name: row.name,
    price: row.close,
    pe: row.pe,
    pb: row.pb,
    date: row.date,
    sector: "台灣上櫃公司",
  }));
  const taiwanUniverse = [...listed, ...otc].filter((row) => /^\d{4}$/.test(row.ticker) && Number(row.price) > 0);
  const usUniverse: MarketScanRow[] = usMarketSnapshot.map((row) => ({
    ticker: row.ticker,
    name: row.name,
    price: row.price,
    pe: 0,
    pb: 0,
    eps: row.eps,
    bvps: row.bvps,
    dividendPerShare: row.dividendPerShare,
    marketCap: row.marketCap,
    volume: row.volume,
    date: row.date,
    sector: row.sector,
    market: "US",
  }));

  const candidates = [
    ...selectMarketCandidates(taiwanUniverse, "undervalued"),
    ...selectMarketCandidates(usUniverse, "undervalued"),
  ];
  const overvaluedCandidates = [
    ...selectMarketCandidates(taiwanUniverse, "overvalued"),
    ...selectMarketCandidates(usUniverse, "overvalued"),
  ];

  return NextResponse.json({
    scannedCount: taiwanUniverse.length + usUniverse.length,
    scannedByMarket: { TW: taiwanUniverse.length, US: usUniverse.length },
    candidates,
    overvaluedCandidates,
  });
}
