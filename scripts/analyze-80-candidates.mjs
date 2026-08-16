import fs from "node:fs/promises";
import { calculateStock, valuationTargets } from "../lib/valuation.ts";
import { calibrateFairValue } from "../lib/valuation-calibration.ts";
import { selectMarketCandidates, marketStockFromRatio } from "../lib/market-scan.ts";
import { buildComparableMap } from "../lib/market-comparables.ts";
import tpexSnapshot from "../lib/tpex-snapshot.json" with { type: "json" };
import usMarketSnapshot from "../lib/us-market-snapshot.json" with { type: "json" };

async function analyzeAll80Candidates() {
  const twseRatiosRes = await fetch("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL");
  const twseRatios = await twseRatiosRes.json();
  const twseDailyRes = await fetch("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL");
  const twseDaily = await twseDailyRes.json();

  const twsePriceByTicker = new Map(twseDaily.map((row) => [row.Code, row]));
  const listed = twseRatios.map((row) => {
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
      volume: quote?.TradeVolume ?? 0,
    };
  });
  const otc = tpexSnapshot.map((row) => ({
    ticker: row.ticker,
    name: row.name,
    price: row.close,
    pe: row.pe,
    pb: row.pb,
    date: row.date,
    sector: "台灣上櫃公司",
    market: "TW",
    volume: row.volume,
  }));

  const taiwanUniverse = [...listed, ...otc].filter((row) => /^\d{4}$/.test(row.ticker) && Number(row.price) > 0);
  const usUniverse = usMarketSnapshot.map((row) => ({
    ...row,
    pe: 0,
    pb: 0,
    market: "US",
  }));

  const usComparableMap = buildComparableMap(usUniverse);

  // Look at 2491 specifically
  const jx2491 = taiwanUniverse.find(r => r.ticker === "2491");
  console.log("2491 raw TWSE row:", jx2491);

  const input2491 = marketStockFromRatio(jx2491);
  const stock2491 = calculateStock(input2491);
  const cal2491 = calibrateFairValue(stock2491);
  console.log("2491 current calculated:", {
    price: stock2491.price,
    fairValue: stock2491.fairValue,
    upside: stock2491.upside,
    calibratedFairValue: cal2491.calibratedFairValue,
    calibratedUpside: cal2491.calibratedUpside,
  });
}

analyzeAll80Candidates();
