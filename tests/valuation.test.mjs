import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateStock,
  calculateWacc,
  discountedCashFlowPerShare,
  fadingGrowthDcfPerShare,
  valuationTargets,
} from "../lib/valuation.ts";

const base = {
  ticker: "TEST",
  name: "Test",
  market: "US",
  sector: "Industrials",
  price: 100,
  eps: 5,
  bvps: 20,
  fcfPerShare: 4,
  dividendPerShare: 0,
  targetPe: 20,
  targetPb: 2,
  targetFcfMultiple: 20,
  revenueGrowth: 10,
  roe: 20,
  debtRatio: 30,
  uncertainty: 0.2,
};

function modelSnapshot(stock) {
  return stock.models.map((model) => ({
    id: model.id,
    category: model.category,
    status: model.status,
    value: model.value,
    weight: model.weight,
    rangeLow: model.rangeLow,
    rangeHigh: model.rangeHigh,
  }));
}

function closeTo(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, actual + " is not close to " + expected);
}

test("fair value and valuation models are independent of the current market price", () => {
  const lowPrice = calculateStock({ ...base, price: 20 });
  const highPrice = calculateStock({ ...base, price: 2_000 });

  assert.equal(lowPrice.fairValue, highPrice.fairValue);
  assert.deepEqual(modelSnapshot(lowPrice), modelSnapshot(highPrice));
  assert.notEqual(lowPrice.upside, highPrice.upside);
});

test("calculates CAPM cost of equity and a capital-structure WACC", () => {
  const result = calculateWacc({
    ...base,
    beta: 1.1,
    riskFreeRate: 0.04,
    marketRiskPremium: 0.05,
    countryRiskPremium: 0.005,
    preTaxCostOfDebt: 0.06,
    taxRate: 0.2,
    debtPerShare: 20,
    bvps: 80,
  });

  closeTo(result.costOfEquity, 0.1);
  closeTo(result.debtWeight, 1 / 6);
  closeTo(result.equityWeight, 5 / 6);
  closeTo(result.afterTaxCostOfDebt, 0.048);
  closeTo(result.wacc, 0.1 * (5 / 6) + 0.048 * (1 / 6));
});

test("discounts FCFE, EPV and dividends with cost of equity rather than WACC", () => {
  const common = {
    ...base,
    revenueGrowth: 3,
    normalizedFcfPerShare: 4.5,
    dividendPerShare: 2,
    beta: 1.1,
    riskFreeRate: 0.04,
    marketRiskPremium: 0.05,
    countryRiskPremium: 0.005,
    preTaxCostOfDebt: 0.06,
    taxRate: 0.2,
  };
  const unlevered = calculateStock({ ...common, debtPerShare: 0 });
  const debtWeighted = calculateStock({ ...common, debtPerShare: 100 });

  assert.notEqual(unlevered.wacc, debtWeighted.wacc);
  assert.equal(unlevered.assumptions.costOfEquity, debtWeighted.assumptions.costOfEquity);
  for (const id of ["dcf-fcf-5y", "dcf-fcf-10y", "epv", "ddm-stable"]) {
    const first = unlevered.models.find((model) => model.id === id);
    const second = debtWeighted.models.find((model) => model.id === id);
    assert.ok(first, id + " missing from unlevered fixture");
    assert.ok(second, id + " missing from debt-weighted fixture");
    closeTo(first.value, second.value);
  }

  const lowerCost = calculateStock({ ...common, debtPerShare: 0, beta: 0.8 });
  const higherCost = calculateStock({ ...common, debtPerShare: 0, beta: 1.4 });
  assert.ok(lowerCost.assumptions.costOfEquity < higherCost.assumptions.costOfEquity);
  assert.ok(
    lowerCost.models.find((model) => model.id === "dcf-fcf-5y").value
      > higherCost.models.find((model) => model.id === "dcf-fcf-5y").value,
  );
});

test("supports five- and ten-year fading-growth FCF DCF models", () => {
  const fiveYear = fadingGrowthDcfPerShare(10, 0.12, 0.1, 0.025, 5);
  const tenYear = fadingGrowthDcfPerShare(10, 0.12, 0.1, 0.025, 10);
  assert.ok(fiveYear > 0);
  assert.ok(tenYear > fiveYear);

  const stock = calculateStock({ ...base, discountRate: 0.1, terminalGrowth: 0.025 });
  assert.ok(stock.models.some((model) => model.id === "dcf-fcf-5y"));
  assert.ok(stock.models.some((model) => model.id === "dcf-fcf-10y"));
});

test("keeps the legacy constant-growth DCF helper compatible", () => {
  const value = discountedCashFlowPerShare(10, 0, 0.1, 0.02);
  assert.ok(value > 115 && value < 120);
});

test("excludes EPV and DDM when growth and payout assumptions are not mature", () => {
  const stock = calculateStock({
    ...base,
    revenueGrowth: 25,
    roe: 45,
    normalizedFcfPerShare: 4.5,
    dividendPerShare: 0.5,
  });
  assert.ok(!stock.models.some((model) => model.id === "epv"));
  assert.ok(!stock.models.some((model) => model.id === "ddm-stable"));
  assert.ok(stock.excludedModels.some((model) => model.id === "epv"));
  assert.ok(stock.excludedModels.some((model) => model.id === "ddm-stable"));
});

test("uses normalized FCF for EPV and sustainable payout for DDM", () => {
  const stock = calculateStock({
    ...base,
    revenueGrowth: 3,
    dividendPerShare: 2,
    normalizedFcfPerShare: 4.5,
    discountRate: 0.1,
  });
  const epv = stock.models.find((model) => model.id === "epv");
  assert.ok(epv);
  closeTo(epv.value, 45);
  assert.ok(stock.models.some((model) => model.id === "ddm-stable"));
});

test("gives every applicable model a simple equal weight", () => {
  const stock = calculateStock({
    ...base,
    revenuePerShare: 25,
    ebitdaPerShare: 7,
    ebitPerShare: 6,
    netMargin: 0.2,
  });
  assert.ok(stock.models.length >= 6);
  const expected = 1 / stock.models.length;
  for (const model of stock.models) closeTo(model.weight, expected);
  closeTo(stock.models.reduce((sum, model) => sum + model.weight, 0), 1);
});

test("excludes EV models when no independent multiple is explicitly provided", () => {
  const stock = calculateStock({
    ...base,
    revenuePerShare: 25,
    ebitdaPerShare: 7,
    ebitPerShare: 6,
  });
  for (const id of ["ev-revenue", "ev-ebitda", "ev-ebit"]) {
    assert.ok(!stock.models.some((model) => model.id === id));
    const excluded = stock.excludedModels.find((model) => model.id === id);
    assert.ok(excluded);
    assert.ok(excluded.reason.includes("獨立且可驗證"));
  }
});

test("explicit EV multiples convert enterprise value to equity value by deducting net debt once", () => {
  const stock = calculateStock({
    ...base,
    eps: 0,
    bvps: 0,
    fcfPerShare: 0,
    revenuePerShare: 25,
    ebitdaPerShare: 7,
    ebitPerShare: 6,
    targetEvRevenueMultiple: 3.2,
    targetEvEbitdaMultiple: 11.5,
    targetEvEbitMultiple: 13.3,
    debtPerShare: 3,
    cashPerShare: 1,
  });
  const expected = new Map([
    ["ev-revenue", 25 * 3.2 - 2],
    ["ev-ebitda", 7 * 11.5 - 2],
    ["ev-ebit", 6 * 13.3 - 2],
  ]);
  for (const [id, value] of expected) {
    const model = stock.models.find((candidate) => candidate.id === id);
    assert.ok(model, id + " was not applied");
    closeTo(model.value, value);
    assert.ok(model.explanation.includes("扣除每股淨負債 2"));
  }
});

test("uses model distribution rather than market price to remove an extreme result", () => {
  const input = {
    ...base,
    revenuePerShare: 1_000,
    targetEvRevenueMultiple: 12,
    netMargin: 0.5,
  };
  const first = calculateStock({ ...input, price: 1 });
  const second = calculateStock({ ...input, price: 10_000 });
  assert.deepEqual(modelSnapshot(first), modelSnapshot(second));
  assert.ok(first.excludedModels.some((model) => (
    model.id === "ev-revenue" && model.reason.includes("不使用目前股價")
  )));
});

test("all model and aggregate ranges are ordered and finite", () => {
  const stock = calculateStock({
    ...base,
    revenuePerShare: 25,
    ebitdaPerShare: 7,
    ebitPerShare: 6,
    netMargin: 20,
    assetTurnover: 1.2,
    financialLeverage: 2,
    debtPerShare: 3,
    cashPerShare: 5,
  });

  for (const value of [
    stock.fairValue,
    stock.rangeLow,
    stock.rangeHigh,
    stock.upside,
    stock.wacc,
    stock.discountRate,
    stock.terminalGrowth,
    stock.uncertainty,
  ]) assert.ok(Number.isFinite(value));
  assert.ok(stock.rangeLow <= stock.fairValue);
  assert.ok(stock.fairValue <= stock.rangeHigh);
  for (const model of stock.models) {
    assert.ok(Number.isFinite(model.value));
    assert.ok(Number.isFinite(model.rangeLow));
    assert.ok(Number.isFinite(model.rangeHigh));
    assert.ok(model.rangeLow <= model.value);
    assert.ok(model.value <= model.rangeHigh);
  }
  for (const value of Object.values(stock.assumptions)) {
    if (typeof value === "number") assert.ok(Number.isFinite(value));
  }
});

test("does not apply DCF, FCF or EV operating models to financial companies", () => {
  const stock = calculateStock({
    ...base,
    sector: "Commercial Banks",
    revenueGrowth: 4,
    dividendPerShare: 2,
    revenuePerShare: 20,
    ebitdaPerShare: 8,
    ebitPerShare: 7,
  });
  const prohibited = new Set([
    "p-fcf",
    "dcf-fcf-5y",
    "dcf-fcf-10y",
    "ev-revenue",
    "ev-ebitda",
    "ev-ebit",
  ]);
  assert.ok(stock.models.every((model) => !prohibited.has(model.id)));
  assert.ok(stock.models.some((model) => model.id === "ddm-stable"));
  for (const id of prohibited) assert.ok(stock.excludedModels.some((model) => model.id === id));
});

test("uses iNAV only for ETFs and retains an explicit risk override", () => {
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
  assert.equal(stock.models.length, 1);
  assert.equal(stock.models[0].id, "etf-inav");
  assert.equal(stock.models[0].weight, 1);
  assert.equal(stock.risk, "高");
});

test("keeps legacy StockInput fields compatible while exposing assumptions", () => {
  const stock = calculateStock(base);
  assert.ok(stock.fairValue > 0);
  assert.ok(stock.models.length >= 2);
  assert.ok(stock.models.every((model) => model.id && model.category && model.status === "applied"));
  assert.ok(Array.isArray(stock.excludedModels));
  assert.ok(stock.assumptions.defaulted.includes("beta（市場／產業預設）"));
  assert.equal(stock.assumptions.aggregationMethod, "median");
  assert.equal(stock.discountRate, stock.wacc);
});

test("uses the model median as the central fair value", () => {
  const stock = calculateStock(base);
  const values = stock.models.map((model) => model.value).sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  const expected = values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
  closeTo(stock.fairValue, expected);
});

test("keeps an AAPL-like LTM valuation near a broad historical model cluster", () => {
  const stock = calculateStock({
    ticker: "AAPL",
    name: "Apple Inc.",
    market: "US",
    sector: "Technology Hardware",
    price: 308.26,
    eps: 8.72,
    bvps: 7.3673,
    fcfPerShare: 9.3656,
    targetPe: 27.7848,
    targetPb: 4,
    targetFcfMultiple: 24.1848,
    revenueGrowth: 14.2424,
    roe: 119.91,
    debtRatio: 71.946,
    uncertainty: 0.24,
    beta: 1,
    debtPerShare: 5.6392,
    cashPerShare: 4.2756,
    revenuePerShare: 31.9869,
    ebitPerShare: 10.611,
    ebitdaPerShare: 11.5086,
    netMargin: 0.276186,
    source: "自動資料",
    dataBasis: "ltm",
    dataCompleteness: "historical",
  });
  assert.ok(stock.models.some((model) => model.id === "ev-revenue"));
  assert.ok(stock.fairValue >= 250 && stock.fairValue <= 280, "AAPL-like fair value was " + stock.fairValue);
  assert.ok(stock.upside >= -0.2 && stock.upside <= -0.08, "AAPL-like gap was " + stock.upside);
});

test("normalizes extreme FCF conversion before it can amplify several models", () => {
  const stock = calculateStock({
    ticker: "GDDY",
    name: "GoDaddy Inc.",
    market: "US",
    sector: "Technology",
    price: 91.49,
    eps: 6.73,
    bvps: 0.1,
    fcfPerShare: 13.446,
    targetPe: 25,
    targetPb: 4,
    targetFcfMultiple: 21.79,
    revenueGrowth: 7.4073,
    roe: 200,
    debtRatio: 99,
    uncertainty: 0.3,
    beta: 1,
    debtPerShare: 29.8024,
    cashPerShare: 7.633,
    revenuePerShare: 40.3016,
    ebitPerShare: 10.0018,
    ebitdaPerShare: 10.7337,
    netMargin: 0.178347,
    source: "自動資料",
    dataBasis: "estimated",
    dataCompleteness: "limited",
  });
  assert.equal(stock.fcfPerShare, 13.446);
  assert.equal(stock.assumptions.fcfNormalizationApplied, true);
  closeTo(stock.assumptions.normalizedFcfPerShare, 6.73 * 1.25);
  assert.ok(stock.upside >= 0.35 && stock.upside <= 0.6, "GDDY-like gap was " + stock.upside);
  assert.ok(stock.historicalCautionReasons.some((reason) => reason.includes("正規化")));
});

test("does not compress an AAPL-like public LTM fixture toward 100", () => {
  const stock = calculateStock({
    ticker: "AAPL",
    name: "Apple Inc.",
    market: "US",
    sector: "Technology Hardware",
    price: 308.26,
    eps: 8.84,
    bvps: 4.6,
    fcfPerShare: 9.37,
    dividendPerShare: 1.08,
    targetPe: 28,
    targetPb: 4,
    targetFcfMultiple: 26,
    revenueGrowth: 12.2,
    roe: 171,
    debtRatio: 83,
    uncertainty: 0.22,
    beta: 1.1,
    riskFreeRate: 0.0425,
    marketRiskPremium: 0.0525,
    countryRiskPremium: 0,
    preTaxCostOfDebt: 0.06,
    taxRate: 0.17,
    debtPerShare: 6,
    cashPerShare: 4,
    revenuePerShare: 31.99,
    ebitdaPerShare: 11.5,
    ebitPerShare: 10.5,
    targetEvRevenueMultiple: 7.7,
    targetEvEbitdaMultiple: 22,
    targetEvEbitMultiple: 24.5,
    netMargin: 0.276,
    dataBasis: "ltm",
    financialDataDate: "2026-06-30",
    dataCompleteness: "historical",
  });
  assert.ok(stock.fairValue > 200, "AAPL-like fair value was " + stock.fairValue);
  assert.equal(stock.historicalCaution, true);
  assert.ok(stock.historicalCautionReasons.some((reason) => reason.includes("歷史增速")));
  assert.equal(stock.valuationConfidence, "low");
  assert.ok(stock.models.some((model) => model.id === "ev-revenue"));
  assert.ok(stock.models.some((model) => model.id === "ev-ebitda"));
  assert.ok(stock.models.some((model) => model.id === "ev-ebit"));
  assert.ok(!stock.models.some((model) => model.id === "ddm-stable"));
  assert.ok(!stock.models.some((model) => model.id === "epv"));
});

test("downgrades a high-multiple asset-light annual snapshot and excludes zero-growth EPV", () => {
  const stock = calculateStock({
    ...base,
    ticker: "AAPL",
    name: "Apple Inc.",
    sector: "Technology",
    price: 308.26,
    eps: 7.46,
    bvps: 6.01,
    fcfPerShare: 6.73,
    revenueGrowth: 6.4,
    roe: 124,
    debtRatio: 77,
    dataBasis: "annual",
    dataCompleteness: "historical",
  });
  assert.equal(stock.historicalCaution, true);
  assert.ok(stock.historicalCautionReasons.some((reason) => reason.includes("單一年度")));
  assert.equal(stock.valuationConfidence, "low");
  assert.ok(!stock.models.some((model) => model.id === "epv"));
  assert.ok(stock.excludedModels.some((model) => model.id === "epv"));
});

test("renormalizes to one surviving legacy model without producing NaN", () => {
  const stock = calculateStock({ ...base, eps: 0, fcfPerShare: 0 });
  assert.equal(stock.models.length, 1);
  assert.equal(stock.models[0].id, "pb");
  assert.equal(stock.models[0].weight, 1);
  assert.ok(stock.uncertainty >= 0.4);
  assert.ok(Number.isFinite(stock.fairValue));
});

test("caps heuristic target multiples within documented bounds", () => {
  const targets = valuationTargets(500, 500, 0);
  assert.equal(targets.targetPe, 36);
  closeTo(targets.targetPb, 9.2);
  assert.equal(targets.targetFcfMultiple, 32);
});

test("marks limited inputs and high-growth historical inputs as low confidence", () => {
  const limited = calculateStock({ ...base, dataCompleteness: "limited", qualityAvailable: false });
  assert.equal(limited.valuationConfidence, "low");

  const growth = calculateStock({
    ...base,
    revenueGrowth: 35,
    dataBasis: "historical",
    dataCompleteness: "historical",
  });
  assert.equal(growth.historicalCaution, true);
  assert.equal(growth.valuationConfidence, "low");
});

test("keeps a stable mature historical record at medium confidence", () => {
  const stock = calculateStock({
    ...base,
    revenueGrowth: 6,
    dataCompleteness: "historical",
  });
  assert.equal(stock.historicalCaution, false);
  assert.equal(stock.valuationConfidence, "medium");
});

test("blends a bounded structural theme prior only into DCF starting growth", () => {
  const themedInput = {
    ...base,
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    sector: "Semiconductors",
    revenueGrowth: 5,
    dataBasis: "ltm",
    dataCompleteness: "historical",
  };
  const themed = calculateStock(themedInput);
  const plain = calculateStock({ ...themedInput, ticker: "NONE", name: "Generic Components", sector: "Semiconductors" });

  assert.equal(themed.assumptions.structuralThemes[0]?.id, "ai-infrastructure");
  assert.equal(themed.assumptions.structuralGrowthPrior, 0.1);
  assert.equal(themed.assumptions.structuralBlendWeight, 0.25);
  closeTo(themed.assumptions.startingGrowth, themed.assumptions.historicalStartingGrowth * 0.75 + 0.1 * 0.25);
  assert.equal(plain.assumptions.structuralBlendWeight, 0);
  assert.equal(themed.models.find((model) => model.id === "dcf-fcf-5y").value
    > plain.models.find((model) => model.id === "dcf-fcf-5y").value, true);
  assert.equal(themed.models.find((model) => model.id === "pe").value, plain.models.find((model) => model.id === "pe").value);
});

test("does not apply the structural theme prior without usable operating evidence", () => {
  const stock = calculateStock({
    ...base,
    ticker: "RKLB",
    name: "Rocket Lab USA Inc.",
    sector: "Space Systems",
    eps: -1,
    fcfPerShare: -2,
    dataBasis: "annual",
    dataCompleteness: "historical",
  });
  assert.equal(stock.assumptions.structuralThemes[0]?.id, "space-economy");
  assert.equal(stock.assumptions.structuralBlendWeight, 0);
  assert.equal(stock.assumptions.startingGrowth, stock.assumptions.historicalStartingGrowth);
});

test("keeps theme-adjusted fair value independent of the current price", () => {
  const input = {
    ...base,
    ticker: "GEV",
    name: "GE Vernova Inc.",
    sector: "Grid Equipment",
    dataBasis: "annual",
    dataCompleteness: "historical",
  };
  const low = calculateStock({ ...input, price: 20 });
  const high = calculateStock({ ...input, price: 2_000 });
  assert.equal(low.assumptions.structuralBlendWeight, 0.15);
  assert.equal(low.fairValue, high.fairValue);
});
