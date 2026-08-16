import test from "node:test";
import assert from "node:assert/strict";
import { calculateStock } from "../lib/valuation.ts";
import { calibrateFairValue, detectOutOfDistribution, getCalibrationMetadata } from "../lib/valuation-calibration.ts";

test("valuation calibration metadata is complete and reproducible", () => {
  const meta = getCalibrationMetadata();
  assert.ok(meta.modelVersion);
  assert.ok(meta.trainingDate);
  assert.ok(meta.sampleSize >= 77);
  assert.ok(meta.datasetHash);
  assert.ok(meta.fallbackMethod);
  assert.ok(meta.metricSummary.holdoutMdApe < 0.05);
});

test("calibrates standard profitable large caps with finite and reasonable bounds", () => {
  const aapl = calculateStock({
    ticker: "AAPL",
    name: "Apple Inc",
    market: "US",
    sector: "Technology",
    price: 305.93,
    eps: 6.5,
    bvps: 5.2,
    fcfPerShare: 6.8,
    targetPe: 30,
    targetPb: 40,
    targetFcfMultiple: 28,
    revenueGrowth: 9.5,
    roe: 140,
    debtRatio: 80,
    uncertainty: 0.15,
  });

  assert.ok(Number.isFinite(aapl.calibratedFairValue));
  assert.ok(aapl.calibratedFairValue > 0);
  assert.ok(aapl.calibratedRangeLow < aapl.calibratedFairValue);
  assert.ok(aapl.calibratedRangeHigh > aapl.calibratedFairValue);
  assert.ok(Number.isFinite(aapl.calibratedUpside));
  assert.ok(Number.isFinite(aapl.calibrationGap));
  assert.equal(typeof aapl.isOutOfDistribution, "boolean");
});

test("preserves specialized financial treatment for banks without invalid models", () => {
  const bank = calculateStock({
    ticker: "BAC",
    name: "Bank of America",
    market: "US",
    sector: "Financials",
    price: 40.0,
    eps: 3.5,
    bvps: 34.0,
    fcfPerShare: 0,
    targetPe: 12,
    targetPb: 1.2,
    targetFcfMultiple: 0,
    revenueGrowth: 4.0,
    roe: 10.5,
    debtRatio: 88,
    uncertainty: 0.2,
  });

  assert.ok(bank.calibratedFairValue > 0);
  assert.ok(Number.isFinite(bank.calibratedFairValue));
  assert.equal(bank.models.some((m) => m.id.startsWith("dcf-fcf")), false);
  assert.equal(bank.models.some((m) => m.id.startsWith("ev-")), false);
  assert.ok(bank.models.some((m) => m.id === "pe" || m.id === "pb"));
});

test("retains P/FFO focus for REITs and excludes normal corporate DCF", () => {
  const reit = calculateStock({
    ticker: "O",
    name: "Realty Income",
    market: "US",
    sector: "Real Estate",
    price: 55.0,
    eps: 1.2,
    bvps: 28.0,
    fcfPerShare: 0,
    ffoPerShare: 4.2,
    targetFfoMultiple: 15,
    targetPe: 0,
    targetPb: 0,
    targetFcfMultiple: 0,
    revenueGrowth: 5.0,
    roe: 4.5,
    debtRatio: 42,
    uncertainty: 0.15,
  });

  assert.ok(reit.calibratedFairValue > 0);
  assert.ok(Number.isFinite(reit.calibratedFairValue));
  assert.equal(reit.models.some((m) => m.id.startsWith("dcf-fcf")), false);
  assert.ok(reit.models.some((m) => m.id === "p-ffo"));
});

test("handles high-growth and temporarily unprofitable companies gracefully", () => {
  const growth = calculateStock({
    ticker: "GROW",
    name: "Growth Corp",
    market: "US",
    sector: "Technology",
    price: 25.0,
    eps: -0.5,
    bvps: 8.0,
    fcfPerShare: -0.8,
    revenuePerShare: 12.0,
    targetPsMultiple: 4.5,
    targetPe: 0,
    targetPb: 0,
    targetFcfMultiple: 0,
    revenueGrowth: 45.0,
    roe: -6.0,
    debtRatio: 20,
    uncertainty: 0.35,
  });

  assert.ok(Number.isFinite(growth.calibratedFairValue));
  assert.ok(growth.calibratedFairValue > 0);
  assert.ok(growth.models.some((m) => m.id === "p-sales"));
});

test("detects out-of-distribution extremes and provides clear diagnostics", () => {
  const extremeStock = calculateStock({
    ticker: "EXTR",
    name: "Extreme Volatility Corp",
    market: "US",
    sector: "Technology",
    price: 10.0,
    eps: 0.1,
    bvps: 1.0,
    fcfPerShare: 0.05,
    targetPe: 20,
    targetPb: 2,
    targetFcfMultiple: 20,
    revenueGrowth: 250.0, // extreme
    roe: 200.0, // extreme
    debtRatio: 98.0, // extreme
    uncertainty: 0.75, // extreme
  });

  const ood = detectOutOfDistribution(extremeStock);
  assert.equal(ood.isOod, true);
  assert.ok(ood.reasons.length >= 2);
  assert.equal(extremeStock.isOutOfDistribution, true);
  assert.ok((extremeStock.oodReasons ?? []).length >= 2);
  assert.equal(extremeStock.calibrationConfidence, "low");
});

test("supports Taiwan market stocks with verified currency and sanity bounds", () => {
  const tsmc = calculateStock({
    ticker: "2330",
    name: "台積電",
    market: "TW",
    sector: "半導體業",
    price: 1050.0,
    eps: 45.0,
    bvps: 180.0,
    fcfPerShare: 42.0,
    targetPe: 25,
    targetPb: 6.0,
    targetFcfMultiple: 26,
    revenueGrowth: 22.0,
    roe: 28.0,
    debtRatio: 30,
    uncertainty: 0.15,
  });

  assert.ok(tsmc.calibratedFairValue > 800);
  assert.ok(tsmc.calibratedFairValue < 2000);
  assert.ok(Number.isFinite(tsmc.calibratedFairValue));
  assert.ok(tsmc.calibrationConfidence === "medium" || tsmc.calibrationConfidence === "high");
});

test("calibration output is 100% deterministic and reproducible", () => {
  const input = {
    ticker: "MSFT",
    name: "Microsoft Corporation",
    market: "US",
    sector: "Technology",
    price: 450.0,
    eps: 12.0,
    bvps: 38.0,
    fcfPerShare: 11.5,
    targetPe: 34,
    targetPb: 12,
    targetFcfMultiple: 36,
    revenueGrowth: 15.0,
    roe: 35.0,
    debtRatio: 40,
    uncertainty: 0.15,
  };

  const run1 = calculateStock(input);
  const run2 = calculateStock(input);

  assert.equal(run1.calibratedFairValue, run2.calibratedFairValue);
  assert.equal(run1.calibratedRangeLow, run2.calibratedRangeLow);
  assert.equal(run1.calibratedRangeHigh, run2.calibratedRangeHigh);
  assert.equal(run1.calibrationGap, run2.calibrationGap);
});

test("price independence ablation: price variation does not change calibrated fair value", () => {
  const base = {
    ticker: "TEST",
    name: "Test Corp",
    market: "US",
    sector: "Technology",
    eps: 5.0,
    bvps: 25.0,
    fcfPerShare: 4.5,
    targetPe: 20,
    targetPb: 3.0,
    targetFcfMultiple: 22,
    revenueGrowth: 10.0,
    roe: 20.0,
    debtRatio: 35,
    uncertainty: 0.2,
  };

  const lowPrice = calculateStock({ ...base, price: 50.0 });
  const highPrice = calculateStock({ ...base, price: 500.0 });

  // Calibrated fair value must remain independent of market price
  assert.equal(lowPrice.calibratedFairValue, highPrice.calibratedFairValue);
  assert.equal(lowPrice.fairValue, highPrice.fairValue);
});

test("clean fallback when calibration is disabled", () => {
  const stock = calculateStock({
    ticker: "AAPL",
    name: "Apple Inc",
    market: "US",
    sector: "Technology",
    price: 300.0,
    eps: 6.0,
    bvps: 5.0,
    fcfPerShare: 6.0,
    targetPe: 28,
    targetPb: 35,
    targetFcfMultiple: 28,
    revenueGrowth: 8.0,
    roe: 120,
    debtRatio: 75,
    uncertainty: 0.15,
  });

  const disabledResult = calibrateFairValue(stock, { enabled: false });
  assert.equal(disabledResult.calibratedFairValue, stock.fairValue);
  assert.equal(disabledResult.calibrationGap, 0);
});
