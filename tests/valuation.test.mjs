import assert from "node:assert/strict";
import test from "node:test";
import { calculateStock, valuationTargets } from "../lib/valuation.ts";

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
  assert.equal(stock.models.length, 3);
  assert.equal(stock.models.reduce((sum, model) => sum + model.weight, 0), 1);
  assert.equal(stock.fairValue, 79);
  assert.equal(stock.upside, -0.21);
});

test("renormalizes weights when a model is unavailable", () => {
  const stock = calculateStock({ ...base, fcfPerShare: 0 });
  assert.equal(stock.models.length, 2);
  assert.equal(stock.models.reduce((sum, model) => sum + model.weight, 0), 1);
  assert.ok(Math.abs(stock.fairValue - 78.5714285714) < 0.00001);
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
