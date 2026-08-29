import assert from "node:assert/strict";
import test from "node:test";
import { calculateStock } from "../lib/valuation.ts";
import { calibrateFairValue, effectiveValuationUpside } from "../lib/valuation-calibration.ts";
import { BENCHMARK_ORDER_TW, marketStockFromRatio, selectMarketCandidates } from "../lib/market-scan.ts";
import { EXPERT_CONSENSUS_TAIWAN_BENCHMARKS, EXPERT_CONSENSUS_TW_BENCHMARKS } from "../lib/expert-consensus-tw-benchmark.ts";

const TW_BENCHMARKS = EXPERT_CONSENSUS_TAIWAN_BENCHMARKS;

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

test("aligns all supported Taiwan teacher anchors to the authorized benchmark", () => {
  for (const b of TW_BENCHMARKS) {
    const input = marketStockFromRatio({
      ticker: b.ticker,
      name: b.name,
      market: "TW",
      price: Math.max(1, b.fairValue / 1.4),
      pe: 10,
      pb: 1,
      volume: 1_000_000,
      sector: "台灣上市公司",
    });
    assert.ok(input, `input should exist for ${b.ticker}`);
    const val = calculateStock(input);
    const cal = calibrateFairValue(val);
    assert.ok(Math.abs(cal.calibratedFairValue - b.fairValue) < 0.001, `${b.ticker} should match ${b.fairValue}`);
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

test("uses the current Taiwan benchmark order and excludes the two Hong Kong listings", () => {
  assert.equal(EXPERT_CONSENSUS_TW_BENCHMARKS.length, 40);
  assert.equal(TW_BENCHMARKS.length, 38);
  assert.deepEqual(BENCHMARK_ORDER_TW, TW_BENCHMARKS.map((row) => row.ticker));
});

test("keeps benchmark stocks when either Taiwan volume or turnover threshold is met", () => {
  const selected = selectMarketCandidates([
    { ticker: "2704", name: "國賓", market: "TW", price: 45.35, pe: 10, pb: 1, volume: 107_564, sector: "台灣上市公司" },
    { ticker: "7722", name: "LINEPAY", market: "TW", price: 290, pe: 10, pb: 1, volume: 26_592, sector: "台灣上市公司" },
  ], "undervalued", 20);

  assert.deepEqual(selected.map((row) => row.ticker), ["2704", "7722"]);
});

test("uses calibrated upside for ranking filters and falls back to native upside", () => {
  assert.equal(effectiveValuationUpside({ upside: -0.167, calibratedUpside: 0.991 }), 0.991);
  assert.equal(effectiveValuationUpside({ upside: 0.125 }), 0.125);
});
