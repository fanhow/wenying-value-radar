import assert from "node:assert/strict";
import test from "node:test";
import { calculateStock, discountedCashFlowPerShare, valuationTargets } from "../lib/valuation.ts";

const base = {
  ticker: "TEST",
  name: "Test",
  market: "US",
  sector: "Test",
  price: 100,
  eps: 5,
  bvps: 20,
  fcfPerShare: 4,
  targetPe: 20,
  targetPb: 2,
  targetFcfMultiple: 20,
  revenueGrowth: 10,
  roe: 20,
  debtRatio: 30,
  uncertainty: 0.2,
};

test("calculates and weights all available valuation models", () => {
  const stock = calculateStock(base);
  assert.equal(stock.models.length, 6);
  assert.equal(stock.models.reduce((sum, model) => sum + model.weight, 0), 1);
  assert.ok(stock.models.some((model) => model.label === "折現現金流法"));
  assert.ok(stock.models.some((model) => model.label === "盈餘能力價值法"));
  assert.ok(stock.models.some((model) => model.label === "Graham 防禦估值"));
  assert.ok(stock.fairValue > 0);
});

test("renormalizes weights when a model is unavailable", () => {
  const stock = calculateStock({ ...base, eps: 0, fcfPerShare: 0 });
  assert.equal(stock.models.length, 1);
  assert.equal(stock.models.reduce((sum, model) => sum + model.weight, 0), 1);
  assert.equal(stock.models[0].label, "股價淨值比法");
  assert.ok(stock.uncertainty >= 0.4);
});

test("calculates a five-year discounted cash flow with terminal value", () => {
  const value = discountedCashFlowPerShare(10, 0, 0.1, 0.02);
  assert.ok(value > 115 && value < 120);
});

test("removes extreme market-anchored model outliers when alternatives exist", () => {
  const stock = calculateStock({ ...base, price: 50, fcfPerShare: 1000 });
  assert.ok(!stock.models.some((model) => model.label === "折現現金流法"));
  assert.ok(!stock.models.some((model) => model.label === "自由現金流倍數法"));
  assert.ok(stock.models.length >= 2);
});

test("does not apply cash-flow models to financial companies", () => {
  const stock = calculateStock({ ...base, sector: "Commercial Banks", dividendPerShare: 8 });
  assert.ok(!stock.models.some((model) => model.label === "折現現金流法"));
  assert.ok(!stock.models.some((model) => model.label === "自由現金流倍數法"));
  assert.ok(stock.models.some((model) => model.label === "股利折現法"));
});

test("does not apply asset-heavy defensive models to high-ROE non-financial companies", () => {
  const stock = calculateStock({ ...base, roe: 40, dividendPerShare: 1 });
  assert.ok(!stock.models.some((model) => model.label === "股價淨值比法"));
  assert.ok(!stock.models.some((model) => model.label === "Graham 防禦估值"));
  assert.ok(stock.models.some((model) => model.label === "折現現金流法"));
});

test("does not label leveraged ETF as low risk", () => {
  const stock = calculateStock({
    ...base,
    ticker: "00631L",
    market: "TW",
    assetType: "ETF",
    eps: 100,
    uncertainty: 0.02,
    riskOverride: "高",
  });
  assert.equal(stock.fairValue, 100);
  assert.equal(stock.risk, "高");
});

test("caps target multiples within documented model bounds", () => {
  const targets = valuationTargets(500, 500, 0);
  assert.equal(targets.targetPe, 28);
  assert.equal(targets.targetPb, 4);
  assert.equal(targets.targetFcfMultiple, 26);
});

test("marks limited historical inputs as low-confidence estimates", () => {
  const stock = calculateStock({ ...base, dataCompleteness: "limited", qualityAvailable: false });
  assert.equal(stock.valuationConfidence, "low");
});

test("requires forward data before making a firm call on high-multiple growth stocks", () => {
  const stock = calculateStock({
    ...base,
    price: 300,
    revenueGrowth: 35,
    dataCompleteness: "historical",
    forwardDataAvailable: false,
  });
  assert.equal(stock.requiresForwardData, true);
  assert.equal(stock.valuationConfidence, "low");
});

test("keeps a mature company with complete historical inputs at medium confidence without forecasts", () => {
  const stock = calculateStock({
    ...base,
    dataCompleteness: "historical",
    forwardDataAvailable: false,
  });
  assert.equal(stock.requiresForwardData, false);
  assert.equal(stock.valuationConfidence, "medium");
});
