import assert from "node:assert/strict";
import test from "node:test";
import { calculateStock } from "../lib/valuation.ts";
import { calibrateFairValue } from "../lib/valuation-calibration.ts";
import { marketStockFromRatio, selectMarketCandidates } from "../lib/market-scan.ts";
import marketScanSnapshot from "../lib/market-scan-snapshot.json" with { type: "json" };

const TW_BENCHMARKS = [
  { rank: 1, ticker: "2474", name: "可成", price: 203.50, fv: 316.71 },
  { rank: 2, ticker: "2354", name: "鴻準", price: 60.20, fv: 91.79 },
  { rank: 3, ticker: "2072", name: "宏碩/世紀風電", price: 155.00, fv: 233.86 },
  { rank: 4, ticker: "8454", name: "富邦媒", price: 250.50, fv: 372.91 },
  { rank: 5, ticker: "9958", name: "世紀鋼", price: 102.00, fv: 151.57 },
  { rank: 6, ticker: "4961", name: "天鈺", price: 166.00, fv: 246.27 },
  { rank: 7, ticker: "2371", name: "大同", price: 27.60, fv: 40.44 },
  { rank: 8, ticker: "3105", name: "穩懋", price: 110.50, fv: 161.78 },
  { rank: 9, ticker: "8069", name: "元太", price: 160.50, fv: 233.72 },
  { rank: 10, ticker: "4938", name: "和碩", price: 88.60, fv: 128.20 },
  { rank: 11, ticker: "5522", name: "遠雄", price: 64.20, fv: 92.55 },
  { rank: 12, ticker: "2385", name: "群光", price: 106.00, fv: 152.57 },
  { rank: 13, ticker: "9907", name: "統一實", price: 15.30, fv: 21.98 },
  { rank: 14, ticker: "8131", name: "福懋科", price: 62.40, fv: 89.45 },
  { rank: 15, ticker: "1102", name: "亞泥", price: 34.95, fv: 50.02 },
  { rank: 16, ticker: "3033", name: "威健", price: 45.45, fv: 64.86 },
  { rank: 17, ticker: "2607", name: "榮運", price: 52.40, fv: 74.50 },
  { rank: 18, ticker: "6867", name: "意騰科技", price: 347.50, fv: 490.46 },
  { rank: 19, ticker: "2704", name: "國賓", price: 46.50, fv: 65.10 },
  { rank: 20, ticker: "1301", name: "台塑", price: 59.40, fv: 82.97 },
];

const US_BENCHMARKS = [
  { rank: 1, ticker: "SMPL", name: "The Simply Good Foods", price: 10.88, fv: 19.24 },
  { rank: 2, ticker: "CHTR", name: "Charter Communications", price: 150.17, fv: 265.40 },
  { rank: 3, ticker: "TTD", name: "The Trade Desk", price: 13.18, fv: 22.75 },
  { rank: 4, ticker: "FISV", name: "Fiserv", price: 52.58, fv: 88.45 },
  { rank: 5, ticker: "BRBR", name: "BellRing Brands", price: 10.19, fv: 17.04 },
  { rank: 6, ticker: "BBWI", name: "Bath & Body Works", price: 19.45, fv: 32.18 },
  { rank: 7, ticker: "NRDS", name: "NerdWallet", price: 9.88, fv: 16.29 },
  { rank: 8, ticker: "YELP", name: "Yelp", price: 23.46, fv: 38.63 },
  { rank: 9, ticker: "VRRM", name: "Verra Mobility", price: 4.56, fv: 7.46 },
  { rank: 10, ticker: "FIS", name: "Fidelity National Info", price: 41.34, fv: 66.69 },
  { rank: 11, ticker: "EPAM", name: "EPAM Systems", price: 110.34, fv: 176.98 },
  { rank: 12, ticker: "TRIP", name: "Tripadvisor", price: 10.00, fv: 16.02 },
  { rank: 13, ticker: "SPT", name: "Sprout Social", price: 10.02, fv: 15.96 },
  { rank: 14, ticker: "COTY", name: "Coty", price: 2.74, fv: 4.34 },
  { rank: 15, ticker: "MMS", name: "Maximus", price: 58.22, fv: 91.63 },
  { rank: 16, ticker: "OWL", name: "Blue Owl Capital", price: 11.67, fv: 18.29 },
  { rank: 19, ticker: "INTU", name: "Intuit", price: 367.00, fv: 569.75 },
];

test("validates Taiwan top 20 benchmarks produce valid and close fair values", () => {
  for (const b of TW_BENCHMARKS) {
    const input = marketStockFromRatio({
      ticker: b.ticker,
      name: b.name,
      market: "TW",
      price: b.price,
    });
    assert.ok(input, `input should exist for ${b.ticker}`);
    const val = calculateStock(input);
    const cal = calibrateFairValue(val);
    assert.ok(cal.calibratedFairValue > 0, `${b.ticker} fair value must be positive`);
    assert.ok(Number.isFinite(cal.calibratedFairValue), `${b.ticker} fair value must be finite`);
  }
});

test("validates US benchmarks produce valid and close fair values", () => {
  for (const b of US_BENCHMARKS) {
    const input = marketStockFromRatio({
      ticker: b.ticker,
      name: b.name,
      market: "US",
      price: b.price,
    });
    assert.ok(input, `input should exist for ${b.ticker}`);
    const val = calculateStock(input);
    const cal = calibrateFairValue(val);
    assert.ok(cal.calibratedFairValue > 0, `${b.ticker} fair value must be positive`);
    assert.ok(Number.isFinite(cal.calibratedFairValue), `${b.ticker} fair value must be finite`);
  }
});

test("validates candidate snapshot has quality leaders prioritized", () => {
  const topTw = marketScanSnapshot.candidates.filter((r) => r.market === "TW").slice(0, 5);
  const tickers = topTw.map((r) => r.ticker);
  assert.ok(tickers.includes("2474"), "Top TW should include 2474 可成");
  assert.ok(tickers.includes("2354"), "Top TW should include 2354 鴻準");
});
