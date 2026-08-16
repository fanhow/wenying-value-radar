import fs from "node:fs/promises";
import { calculateStock } from "../lib/valuation.ts";
import { marketStockFromRatio } from "../lib/market-scan.ts";
import { calibrateFairValue } from "../lib/valuation-calibration.ts";

async function main() {
  const snapshot = JSON.parse(await fs.readFile("./lib/fund-holdings-snapshot.json", "utf8"));
  const usSnapshot = JSON.parse(await fs.readFile("./lib/us-market-snapshot.json", "utf8"));
  const byTicker = new Map(usSnapshot.map(r => [r.ticker.toUpperCase(), r]));

  const allHoldings = snapshot.funds.flatMap(f => f.holdings.map(h => ({ ...h, fundName: f.name, fundRank: f.rank })));
  const uniqueTickers = [...new Set(allHoldings.map(h => h.ticker.toUpperCase()))].sort();

  console.log(`Auditing ${uniqueTickers.length} unique fund holdings...`);

  // Target benchmarks from InvestingPro
  const investingProBenchmarks = {
    AVGO: { fv: 443.00, direction: "UP", upsidePct: 12.7, models: 14, notes: "Non-GAAP EPS $16.50, Cash FCF $17.50, AI ASIC & VMware scale" },
    TSLA: { fv: 245.62, direction: "DOWN", upsidePct: -28.2, models: 12, notes: "EV auto margin compression vs AI optionality" },
    NVDA: { fv: 195.80, direction: "DOWN", upsidePct: -10.0, models: 13, notes: "Data center GPU dominance, high baseline" },
    AAPL: { fv: 276.74, direction: "DOWN", upsidePct: -10.2, models: 14, notes: "Services + Apple Intelligence cash generation" },
    AMZN: { fv: 248.50, direction: "DOWN", upsidePct: -10.6, models: 13, notes: "AWS + Ads high margin cash flow" },
    MSFT: { fv: 465.00, direction: "DOWN", upsidePct: -8.1, models: 14, notes: "Azure cloud + Copilot recurring revenue" },
    GOOGL: { fv: 210.00, direction: "DOWN", upsidePct: -41.2, models: 14, notes: "GCP cloud profitability + search ads" },
    GOOG: { fv: 210.00, direction: "DOWN", upsidePct: -41.0, models: 14, notes: "Alphabet Class C" },
    META: { fv: 625.00, direction: "UP", upsidePct: 5.1, models: 13, notes: "Advantage+ AI ads + Family of Apps margin" },
    MU: { fv: 135.00, direction: "DOWN", upsidePct: -84.3, models: 12, notes: "HBM3E memory cycle expansion" },
    AMD: { fv: 168.50, direction: "DOWN", upsidePct: -64.1, models: 12, notes: "MI300/MI350 data center GPU + EPYC CPU" },
    LRCX: { fv: 195.00, direction: "DOWN", upsidePct: -8.7, models: 12, notes: "Cryo etch & advanced packaging equipment" },
    BSX: { fv: 58.20, direction: "UP", upsidePct: 15.3, models: 11, notes: "Farapulse PFA cardiovascular device growth" },
    HD: { fv: 382.50, direction: "UP", upsidePct: 9.0, models: 12, notes: "Home improvement repair & remodel stability" },
    GEV: { fv: 365.00, direction: "DOWN", upsidePct: -63.2, models: 10, notes: "Power grid electrification & gas turbines" },
    NEM: { fv: 124.50, direction: "UP", upsidePct: 6.2, models: 11, notes: "Gold mining cash generation" },
    NSC: { fv: 265.00, direction: "DOWN", upsidePct: -20.6, models: 11, notes: "Rail transportation operating ratio improvements" },
    FCX: { fv: 48.50, direction: "DOWN", upsidePct: -31.2, models: 11, notes: "Grasberg copper electrification demand" },
    BAC: { fv: 48.20, direction: "DOWN", upsidePct: -24.5, models: 4, notes: "NII sensitivity + tier 1 capital strength" },
    GE: { fv: 198.50, direction: "DOWN", upsidePct: -45.8, models: 12, notes: "LEAP engine commercial aerospace aftermarket" },
    VZ: { fv: 52.80, direction: "UP", upsidePct: 12.3, models: 13, notes: "Broadband FWA subscriber growth & high dividend" },
    MCO: { fv: 445.00, direction: "DOWN", upsidePct: -6.9, models: 12, notes: "Corporate bond issuance rating recovery" },
    SPGI: { fv: 495.00, direction: "UP", upsidePct: 20.5, models: 12, notes: "Ratings + Market Intelligence subscription recurring" },
    CNR: { fv: 112.50, direction: "UP", upsidePct: 19.5, models: 11, notes: "Canadian transcontinental rail network" },
    PSX: { fv: 148.00, direction: "DOWN", upsidePct: -31.3, models: 12, notes: "Midstream pipeline and refining throughput" },
    LUV: { fv: 34.50, direction: "DOWN", upsidePct: -23.2, models: 11, notes: "Elliott activist turnaround + assigned seating" },
    HPE: { fv: 24.80, direction: "DOWN", upsidePct: -54.6, models: 13, notes: "Juniper Networks networking acquisition synergy" },
    UNIT: { fv: 9.85, direction: "UP", upsidePct: 5.0, models: 2, notes: "Telecom fiber REIT P/FFO" },
    PINS: { fv: 36.20, direction: "UP", upsidePct: 48.5, models: 11, notes: "Amazon/Google ad partnership monetization" },
    ETSY: { fv: 65.50, direction: "DOWN", upsidePct: -18.5, models: 11, notes: "GMS stabilization & search AI improvements" },
    PEP: { fv: 175.00, direction: "UP", upsidePct: 27.1, models: 13, notes: "Frito-Lay snacks & international beverage volume" },
    EQIX: { fv: 945.00, direction: "DOWN", upsidePct: -9.4, models: 2, notes: "Data center interconnect colocation REIT" },
    ORN: { fv: 11.50, direction: "UP", upsidePct: 17.5, models: 10, notes: "Marine construction & port dredging backlog" },
    CCI: { fv: 112.00, direction: "UP", upsidePct: 52.2, models: 2, notes: "Cell tower REIT lease escalators" },
    SIMO: { fv: 86.50, direction: "DOWN", upsidePct: -62.5, models: 11, notes: "SSD controller market share expansion" },
    SNDK: { fv: 92.00, direction: "DOWN", upsidePct: -92.6, models: 10, notes: "NAND flash memory cycle pricing" },
    WBD: { fv: 12.80, direction: "DOWN", upsidePct: -52.4, models: 9, notes: "Max streaming DTC profitability & debt reduction" }
  };

  const comparisons = [];
  for (const ticker of uniqueTickers) {
    const row = byTicker.get(ticker);
    const bench = investingProBenchmarks[ticker];
    if (!row) {
      comparisons.push({ ticker, status: "MISSING_IN_SNAPSHOT" });
      continue;
    }
    const input = marketStockFromRatio({ ...row, market: "US" });
    const stock = calculateStock(input);
    const cal = calibrateFairValue(stock);
    const diffPct = bench ? ((cal.calibratedFairValue - bench.fv) / bench.fv * 100).toFixed(1) + "%" : "N/A";
    comparisons.push({
      ticker,
      name: row.name.slice(0, 18),
      price: row.price,
      ourCalibratedFV: +cal.calibratedFairValue.toFixed(2),
      ourCalibratedUpside: ((cal.calibratedFairValue - row.price) / row.price * 100).toFixed(1) + "%",
      investingProFV: bench?.fv ?? null,
      investingProUpside: bench?.upsidePct ? bench.upsidePct + "%" : "N/A",
      gapVsInvestingPro: diffPct,
      models: stock.models.length
    });
  }

  console.table(comparisons);
}

main();
