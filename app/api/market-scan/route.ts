import { NextResponse } from "next/server";
import { selectMarketCandidates, type MarketScanRow } from "../../../lib/market-scan";
import tpexSnapshot from "../../../lib/tpex-snapshot.json";
import usMarketSnapshot from "../../../lib/us-market-snapshot.json";
import {
  readFinancialSnapshots,
  readLatestSnapshotRun,
  readMarketPriceSnapshots,
  type FinancialSnapshot,
  type MarketPriceSnapshot,
} from "../../../lib/snapshot-store";

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
      market: "TW",
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
    market: "TW",
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
    revenueGrowth: row.revenueGrowth,
    fcfPerShare: row.fcfPerShare,
    debtRatio: row.debtRatio,
    dividendPerShare: row.dividendPerShare,
    marketCap: row.marketCap,
    volume: row.volume,
    date: row.date,
    sector: row.sector,
    market: "US",
  }));

  // A scheduled Worker writes fresh prices and selected quarterly financial
  // payloads to D1. Keep bundled JSON as the safe fallback for local previews
  // and for rows that the background run could not refresh.
  const [priceSnapshots, financialSnapshots, latestSnapshotRun] = await Promise.all([
    readMarketPriceSnapshots(),
    readFinancialSnapshots(),
    readLatestSnapshotRun(),
  ]);
  const prices = new Map(priceSnapshots.map((row: MarketPriceSnapshot) => [`${row.market}:${row.ticker}`, row]));
  const financials = new Map(financialSnapshots.map((row: FinancialSnapshot) => [`${row.market}:${row.ticker}`, row]));
  const applySnapshots = (rows: MarketScanRow[], market: "TW" | "US") => rows.map((row) => {
    const price = prices.get(`${market}:${row.ticker}`);
    const financial = financials.get(`${market}:${row.ticker}`);
    let parsedFinancial: Record<string, unknown> = {};
    if (financial?.payload) {
      try {
        parsedFinancial = JSON.parse(financial.payload) as Record<string, unknown>;
      } catch {
        parsedFinancial = {};
      }
    }
    return {
      ...row,
      ...Object.fromEntries([
        "eps", "bvps", "revenueGrowth", "fcfPerShare", "debtRatio", "revenuePerShare",
        "ebitPerShare", "ebitdaPerShare", "cashPerShare", "debtPerShare", "netMargin",
        "assetTurnover", "financialLeverage", "dividendPerShare", "dataBasis", "financialDataDate",
      ].filter((key) => parsedFinancial[key] !== undefined).map((key) => [key, parsedFinancial[key]])),
      name: price?.name || String(parsedFinancial.name ?? row.name),
      price: (price?.price ?? parsedFinancial.price ?? row.price) as string | number,
      marketCap: price?.marketCap ?? row.marketCap,
      volume: price?.volume ?? row.volume,
      date: price?.priceDate ?? row.date,
    };
  });
  const refreshedTaiwanUniverse = applySnapshots(taiwanUniverse, "TW");
  const refreshedUsUniverse = applySnapshots(usUniverse, "US");

  const candidates = [
    ...selectMarketCandidates(refreshedTaiwanUniverse, "undervalued"),
    ...selectMarketCandidates(refreshedUsUniverse, "undervalued"),
  ];
  const overvaluedCandidates = [
    ...selectMarketCandidates(refreshedTaiwanUniverse, "overvalued"),
    ...selectMarketCandidates(refreshedUsUniverse, "overvalued"),
  ];

  return NextResponse.json({
    scannedCount: taiwanUniverse.length + usUniverse.length,
    scannedByMarket: { TW: taiwanUniverse.length, US: usUniverse.length },
    candidates,
    overvaluedCandidates,
    snapshotRun: latestSnapshotRun,
  });
}
