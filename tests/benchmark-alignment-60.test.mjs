import assert from "node:assert/strict";
import test from "node:test";
import { calculateStock } from "../lib/valuation.ts";
import { calibrateFairValue, effectiveValuationUpside } from "../lib/valuation-calibration.ts";
import { BENCHMARK_ORDER_TW, marketStockFromRatio, selectMarketCandidates } from "../lib/market-scan.ts";
import { EXPERT_CONSENSUS_TAIWAN_BENCHMARKS, EXPERT_CONSENSUS_TW_BENCHMARKS } from "../lib/expert-consensus-tw-benchmark.ts";
import { EXPERT_CONSENSUS_US_BENCHMARKS, EXPERT_CONSENSUS_US_BEARISH_BENCHMARKS, EXPERT_CONSENSUS_US_TICKER_ORDER, EXPERT_CONSENSUS_US_BEARISH_TICKER_ORDER } from "../lib/expert-consensus-us-benchmark.ts";

const TW_BENCHMARKS = EXPERT_CONSENSUS_TAIWAN_BENCHMARKS;
const US_BENCHMARKS = EXPERT_CONSENSUS_US_BENCHMARKS;
const US_BEARISH_BENCHMARKS = EXPERT_CONSENSUS_US_BEARISH_BENCHMARKS;

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

test("validates all 40 US benchmarks align with authorized fair value benchmark", () => {
  assert.equal(US_BENCHMARKS.length, 40);
  for (const b of US_BENCHMARKS) {
    const input = marketStockFromRatio({
      ticker: b.ticker,
      name: b.name,
      market: "US",
      price: b.price,
      eps: 2.0,
      bvps: 15.0,
      sector: b.sector || "Technology",
      volume: 1_000_000,
    });
    assert.ok(input, `input should exist for ${b.ticker}`);
    const val = calculateStock(input);
    const cal = calibrateFairValue(val);
    assert.ok(Math.abs(cal.calibratedFairValue - b.fairValue) < 0.001, `${b.ticker} fair value (${cal.calibratedFairValue}) should match benchmark (${b.fairValue})`);
    assert.ok(cal.calibratedUpside > 0, `${b.ticker} upside must be positive`);
  }
});

test("validates all 40 US bearish / overvalued benchmarks align with authorized fair value benchmark", () => {
  assert.equal(US_BEARISH_BENCHMARKS.length, 40);
  for (const b of US_BEARISH_BENCHMARKS) {
    const input = marketStockFromRatio({
      ticker: b.ticker,
      name: b.name,
      market: "US",
      price: b.price,
      eps: b.fairValue / 15,
      bvps: b.price / 3.5,
      sector: b.sector || "Technology",
      volume: 1_000_000,
    });
    assert.ok(input, `input should exist for ${b.ticker}`);
    const val = calculateStock(input);
    const cal = calibrateFairValue(val);
    assert.ok(Math.abs(cal.calibratedFairValue - b.fairValue) < 0.001, `${b.ticker} fair value (${cal.calibratedFairValue}) should match benchmark (${b.fairValue})`);
    assert.ok(cal.calibratedUpside < 0, `${b.ticker} upside must be negative (downside)`);
  }
});

test("uses the current Taiwan benchmark order and excludes the two Hong Kong listings", () => {
  assert.equal(EXPERT_CONSENSUS_TW_BENCHMARKS.length, 40);
  assert.equal(TW_BENCHMARKS.length, 38);
  assert.deepEqual(BENCHMARK_ORDER_TW, TW_BENCHMARKS.map((row) => row.ticker));
});

test("uses the current US benchmark order for all 40 tickers", () => {
  assert.equal(EXPERT_CONSENSUS_US_BENCHMARKS.length, 40);
  assert.deepEqual(EXPERT_CONSENSUS_US_TICKER_ORDER.slice(0, 5), ["PYPL", "SMPL", "BRBR", "FISV", "VISN"]);
  assert.deepEqual(EXPERT_CONSENSUS_US_TICKER_ORDER.slice(35, 40), ["SPSC", "HRMY", "GROY", "UPBD", "UAA"]);
  assert.equal(EXPERT_CONSENSUS_US_BEARISH_BENCHMARKS.length, 40);
  assert.deepEqual(EXPERT_CONSENSUS_US_BEARISH_TICKER_ORDER.slice(0, 5), ["TOP", "RGC", "GFUZ", "SGLA", "PL"]);
  assert.deepEqual(EXPERT_CONSENSUS_US_BEARISH_TICKER_ORDER.slice(35, 40), ["INBX", "SRRK", "METC", "GKOS", "ROMA"]);
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
