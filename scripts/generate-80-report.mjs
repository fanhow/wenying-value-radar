import fs from "node:fs/promises";
import { selectMarketCandidates } from "../lib/market-scan.ts";
import { buildComparableMap } from "../lib/market-comparables.ts";
import { calculateStock } from "../lib/valuation.ts";
import { calibrateFairValue } from "../lib/valuation-calibration.ts";
import tpexSnapshot from "../lib/tpex-snapshot.json" with { type: "json" };
import usMarketSnapshot from "../lib/us-market-snapshot.json" with { type: "json" };

async function generate80CandidatesReport() {
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

  const twUndervalued = selectMarketCandidates(taiwanUniverse, "undervalued", 20);
  const twOvervalued = selectMarketCandidates(taiwanUniverse, "overvalued", 20);
  const usUndervalued = selectMarketCandidates(usUniverse, "undervalued", 20, usComparableMap);
  const usOvervalued = selectMarketCandidates(usUniverse, "overvalued", 20, usComparableMap);

  const formatList = (list, market, group) => list.map((s, idx) => {
    const stock = calculateStock(s);
    const cal = calibrateFairValue(stock);
    const upside = (cal.calibratedFairValue - s.price) / s.price;
    const direction = upside >= 0.05 ? "↗" : upside <= -0.05 ? "↘" : "=";
    return {
      group,
      market,
      rank: idx + 1,
      ticker: s.ticker,
      name: s.name,
      price: +Number(s.price).toFixed(2),
      calibratedFV: +cal.calibratedFairValue.toFixed(2),
      direction,
      upsidePct: +(upside * 100).toFixed(1),
      modelsCount: stock.models.length,
      primaryModel: stock.models[0]?.label ?? "P/E",
      confidence: stock.valuationConfidence
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    twUndervalued: formatList(twUndervalued, "TW", "台股低估候選 Top 20"),
    twOvervalued: formatList(twOvervalued, "TW", "台股高估候選 Top 20"),
    usUndervalued: formatList(usUndervalued, "US", "美股低估候選 Top 20"),
    usOvervalued: formatList(usOvervalued, "US", "美股高估候選 Top 20"),
  };

  await fs.writeFile("./outputs/ranking-80-candidates-report.json", JSON.stringify(report, null, 2), "utf8");
  console.log("80 candidates report generated successfully!");
}

generate80CandidatesReport();
