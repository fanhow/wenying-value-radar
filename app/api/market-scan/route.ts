import { NextResponse } from "next/server.js";
import { buildComparableMap } from "../../../lib/market-comparables.ts";
import { selectMarketCandidates, type MarketScanRow } from "../../../lib/market-scan.ts";
import type { StockInput } from "../../../lib/valuation.ts";
import { buildTaiwanIndustryMap } from "../../../lib/taiwan-industry.ts";
import { optionalPublicRows } from "../../../lib/optional-public-rows.ts";
import { getRuntimeMarketScanMode } from "../../../lib/runtime-env.ts";
import marketScanSnapshot from "../../../lib/market-scan-snapshot.json" with { type: "json" };
import tpexSnapshot from "../../../lib/tpex-snapshot.json" with { type: "json" };
import usMarketSnapshot from "../../../lib/us-market-snapshot.json" with { type: "json" };
import {
  readFinancialSnapshots,
  readLatestSnapshotRun,
  readMarketPriceSnapshots,
  type FinancialSnapshot,
  type MarketPriceSnapshot,
} from "../../../lib/snapshot-store.ts";

type TwseRatioRow = { Date?: string; Code?: string; Name?: string; PEratio?: string; PBratio?: string };
type TwseDailyRow = { Date?: string; Code?: string; Name?: string; ClosingPrice?: string; TradeVolume?: string };
type TaiwanCompanyRow = Record<string, unknown>;

export async function buildLiveMarketScan() {
  const [twseRatios, twseDaily, twseCompanyData, tpexCompanyData] = await Promise.all([
    optionalPublicRows<TwseRatioRow>("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"),
    optionalPublicRows<TwseDailyRow>("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"),
    optionalPublicRows<TaiwanCompanyRow>("https://openapi.twse.com.tw/v1/opendata/t187ap03_L"),
    optionalPublicRows<TaiwanCompanyRow>("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O"),
  ]);
  const twseIndustryByTicker = buildTaiwanIndustryMap(twseCompanyData, "TWSE");
  const tpexIndustryByTicker = buildTaiwanIndustryMap(tpexCompanyData, "TPEx");
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
      industry: twseIndustryByTicker.get(row.Code ?? ""),
      listingBoard: "TWSE",
      volume: quote?.TradeVolume ?? 0,
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
    industry: tpexIndustryByTicker.get(row.ticker),
    listingBoard: "TPEx",
    volume: row.volume,
  }));
  const taiwanUniverse = [...listed, ...otc].filter((row) => /^\d{4}$/.test(row.ticker) && Number(row.price) > 0);
  const usUniverse: MarketScanRow[] = usMarketSnapshot.map((row) => ({
    ...row,
    dataBasis: row.dataBasis as StockInput["dataBasis"],
    pe: 0,
    pb: 0,
    market: "US" as const,
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
        "epsHistory",
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
  const usComparableMap = buildComparableMap(refreshedUsUniverse);

  const candidates = [
    ...selectMarketCandidates(refreshedTaiwanUniverse, "undervalued", 100),
    ...selectMarketCandidates(refreshedUsUniverse, "undervalued", 100, usComparableMap),
  ];
  const overvaluedCandidates = [
    ...selectMarketCandidates(refreshedTaiwanUniverse, "overvalued", 100),
    ...selectMarketCandidates(refreshedUsUniverse, "overvalued", 100, usComparableMap),
  ];

  const payload = {
    scannedCount: taiwanUniverse.length + usUniverse.length,
    scannedByMarket: { TW: taiwanUniverse.length, US: usUniverse.length },
    candidates,
    overvaluedCandidates,
    snapshotRun: latestSnapshotRun,
  };

  return { payload, taiwanUniverse: refreshedTaiwanUniverse };
}

export async function GET() {
  if (getRuntimeMarketScanMode() === "snapshot") {
    return NextResponse.json(marketScanSnapshot);
  }

  const { payload } = await buildLiveMarketScan();
  return NextResponse.json(payload);
}
