import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateStock,
  calculateWacc,
  discountedCashFlowPerShare,
  fadingGrowthDcfPerShare,
  fadingGrowthOperatingExitDcfPerShare,
  normalizeEarningsPerShare,
  residualIncomePerShare,
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

test("normalizes a clear cyclical EPS trough using public history only", () => {
  const normalized = normalizeEarningsPerShare({
    ticker: "MU",
    name: "Micron Technology",
    sector: "Semiconductors",
    eps: 2,
    dataBasis: "annual",
    epsHistory: [
      { value: 2, end: "2025-11-27" },
      { value: 12, end: "2024-11-27" },
      { value: 10, end: "2023-11-27" },
      { value: 8, end: "2022-11-27" },
    ],
  });
  assert.equal(normalized.applied, true);
  assert.equal(normalized.method, "median-history");
  assert.equal(normalized.normalizedEpsPerShare, 9);
});

test("does not replace stable LTM EPS when history is not an outlier", () => {
  const stock = calculateStock({
    ...base,
    dataBasis: "ltm",
    epsHistory: [
      { value: 4.8, end: "2025-12-31" },
      { value: 5.1, end: "2024-12-31" },
      { value: 4.9, end: "2023-12-31" },
    ],
  });
  assert.equal(stock.epsNormalizationApplied, false);
  assert.equal(stock.normalizedEpsPerShare, 5);
});

test("uses normalized EPS in PE while retaining reported EPS for display", () => {
  const stock = calculateStock({
    ...base,
    ticker: "TSLA",
    name: "Tesla",
    sector: "Cyclical Automotive",
    eps: 1,
    targetPe: 20,
    dataBasis: "annual",
    epsHistory: [
      { value: 1, end: "2025-12-31" },
      { value: 3, end: "2024-12-31" },
      { value: 2, end: "2023-12-31" },
    ],
  });
  assert.equal(stock.reportedEpsPerShare, 1);
  assert.equal(stock.normalizedEpsPerShare, 2);
  assert.equal(stock.models.find((model) => model.id === "pe")?.value, 40);
  assert.ok(stock.models.find((model) => model.id === "pe")?.explanation.includes("報告 EPS"));
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

test("supports a price-independent ROE residual-income cross-check", () => {
  const value = residualIncomePerShare(20, 5, 0.1, 0.08, 0.025, 5);
  assert.ok(value > 20);
  const lowPrice = calculateStock({ ...base, price: 20, eps: 5, bvps: 20, roe: 25 });
  const highPrice = calculateStock({ ...base, price: 2_000, eps: 5, bvps: 20, roe: 25 });
  assert.ok(lowPrice.models.some((model) => model.id === "roe-residual"));
  assert.equal(lowPrice.fairValue, highPrice.fairValue);
  assert.equal(lowPrice.models.find((model) => model.id === "roe-residual")?.value,
    highPrice.models.find((model) => model.id === "roe-residual")?.value);
});

test("does not use ROE residual income when earnings do not cover the cost of equity", () => {
  const stock = calculateStock({ ...base, eps: 1, bvps: 20, roe: 5 });
  assert.equal(stock.models.some((model) => model.id === "roe-residual"), false);
  assert.ok(stock.excludedModels.some((model) => model.id === "roe-residual"));
});

test("supports five- and ten-year EBITDA and revenue exit DCF models", () => {
  const exit = fadingGrowthOperatingExitDcfPerShare(6, 20, 0.12, 0.1, 0.025, 14, 2, 5);
  assert.ok(exit > 0);

  const stock = calculateStock({
    ...base,
    revenuePerShare: 25,
    ebitdaPerShare: 8,
    ebitPerShare: 6,
    cashPerShare: 1,
    debtPerShare: 3,
    targetEvRevenueMultiple: 6,
    targetEvEbitdaMultiple: 14,
    targetEvEbitMultiple: 18,
    netMargin: 20,
  });
  for (const id of [
    "dcf-ebitda-5y",
    "dcf-ebitda-10y",
    "dcf-revenue-5y",
    "dcf-revenue-10y",
  ]) {
    const model = stock.models.find((candidate) => candidate.id === id);
    assert.ok(model, id + " missing");
    assert.ok(model.explanation.includes("WACC"));
    assert.ok(model.explanation.includes("不含分析師"));
  }

  const incomplete = calculateStock({
    ...base,
    revenuePerShare: 25,
    ebitdaPerShare: 8,
    targetEvRevenueMultiple: 6,
    targetEvEbitdaMultiple: 14,
  });
  for (const id of ["dcf-ebitda-5y", "dcf-revenue-5y"]) {
    assert.ok(!incomplete.models.some((model) => model.id === id));
    assert.ok(incomplete.excludedModels.some((model) => model.id === id));
  }
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

test("balances weights by model family instead of repeating DCF horizons", () => {
  const stock = calculateStock({
    ...base,
    revenuePerShare: 25,
    ebitdaPerShare: 7,
    ebitPerShare: 6,
    netMargin: 0.2,
  });
  assert.ok(stock.models.length >= 6);
  const familyCounts = new Map();
  for (const model of stock.models) familyCounts.set(model.family, (familyCounts.get(model.family) ?? 0) + 1);
  const expectedFamilyWeight = 1 / familyCounts.size;
  for (const family of familyCounts.keys()) {
    const familyWeight = stock.models
      .filter((model) => model.family === family)
      .reduce((sum, model) => sum + model.weight, 0);
    closeTo(familyWeight, expectedFamilyWeight);
  }
  assert.ok(new Set(stock.models.map((model) => model.weight)).size > 1);
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

test("does not derive an EV multiple from the same PE and margin inputs", () => {
  const stock = calculateStock({
    ...base,
    revenuePerShare: 25,
    ebitdaPerShare: 7,
    ebitPerShare: 6,
    cashPerShare: 2,
    debtPerShare: 3,
    netMargin: 20,
    dataBasis: "ltm",
  });
  for (const id of ["ev-revenue", "ev-ebitda", "ev-ebit"]) {
    assert.ok(!stock.models.some((model) => model.id === id));
    const excluded = stock.excludedModels.find((model) => model.id === id);
    assert.ok(excluded, id + " was unexpectedly applied");
    assert.ok(excluded.reason.includes("獨立") || excluded.reason.includes("independent"));
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

test("applies public peer P/S and EV medians as separate relative models", () => {
  const comparableMultiples = {
    sector: "Technology",
    market: "US",
    peerCount: 12,
    pePeerCount: 12,
    psPeerCount: 12,
    evRevenuePeerCount: 12,
    evEbitdaPeerCount: 12,
    evEbitPeerCount: 12,
    peMedian: 24,
    psMedian: 5,
    evRevenueMedian: 6,
    evEbitdaMedian: 14,
    evEbitMedian: 18,
    dataBasis: "annual",
    asOf: "2025-12-31",
    method: "sector-trimmed-median",
  };
  const stock = calculateStock({
    ...base,
    eps: 5,
    revenuePerShare: 20,
    ebitdaPerShare: 8,
    ebitPerShare: 6,
    cashPerShare: 1,
    debtPerShare: 3,
    netMargin: 20,
    comparableMultiples,
  });
  assert.equal(stock.models.find((model) => model.id === "p-sales")?.value, 100);
  assert.equal(stock.models.find((model) => model.id === "ev-revenue")?.value, 118);
  assert.equal(stock.models.find((model) => model.id === "ev-ebitda")?.value, 110);
  assert.equal(stock.models.find((model) => model.id === "ev-ebit")?.value, 106);
  assert.equal(stock.assumptions.comparablePeerCount, 12);
  assert.equal(stock.assumptions.comparablePePeerCount, 12);
  assert.equal(stock.assumptions.comparablePsPeerCount, 12);
  assert.equal(stock.assumptions.comparableEvRevenuePeerCount, 12);
  assert.equal(stock.assumptions.comparableEvEbitdaPeerCount, 12);
  assert.equal(stock.assumptions.comparableEvEbitPeerCount, 12);
  assert.equal(stock.assumptions.comparableAsOf, "2025-12-31");
});

test("applies an independent peer P/E model only with enough peers", () => {
  const comparableMultiples = {
    sector: "Technology",
    market: "US",
    peerCount: 8,
    pePeerCount: 8,
    psPeerCount: 8,
    evRevenuePeerCount: 8,
    evEbitdaPeerCount: 8,
    evEbitPeerCount: 8,
    peMedian: 30,
    psMedian: null,
    evRevenueMedian: null,
    evEbitdaMedian: null,
    evEbitMedian: null,
    dataBasis: "annual",
    asOf: "2025-12-31",
    method: "sector-trimmed-median",
  };
  const stock = calculateStock({ ...base, eps: 5, comparableMultiples });
  assert.equal(stock.models.find((model) => model.id === "pe-peer")?.value, 150);

  const insufficient = calculateStock({
    ...base,
    comparableMultiples: { ...comparableMultiples, pePeerCount: 4 },
  });
  assert.equal(insufficient.models.some((model) => model.id === "pe-peer"), false);
  assert.ok(insufficient.excludedModels.some((model) => model.id === "pe-peer"));
  assert.equal(insufficient.assumptions.comparablePePeerCount, 4);
  assert.equal(insufficient.assumptions.comparablePsPeerCount, 8);
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
  assert.equal(stock.assumptions.aggregationMethod, "family-balanced-average");
  assert.equal(stock.discountRate, stock.assumptions.costOfEquity);
});

test("uses the family-weighted average of validated models as the central fair value", () => {
  const stock = calculateStock(base);
  const expected = stock.models.reduce((sum, model) => sum + model.value * model.weight, 0);
  closeTo(stock.fairValue, expected);
});

test("uses P/FFO for REITs and excludes enterprise and EPS models", () => {
  const stock = calculateStock({
    ...base,
    ticker: "REIT",
    name: "Example Property Trust",
    sector: "Real Estate Investment Trust",
    eps: 1.2,
    ffoPerShare: 2.4,
    targetFfoMultiple: 18,
    targetPsMultiple: 4,
    revenuePerShare: 12,
    ebitdaPerShare: 7,
    ebitPerShare: 5,
    dividendPerShare: 1.4,
  });
  assert.ok(stock.models.some((model) => model.id === "p-ffo"));
  closeTo(stock.models.find((model) => model.id === "p-ffo")?.value ?? 0, 43.2);
  for (const id of ["pe", "pe-peer", "p-sales", "p-fcf", "dcf-fcf-5y", "dcf-fcf-10y", "ev-revenue", "ev-ebitda", "ev-ebit", "epv", "graham", "ddm-stable"]) {
    assert.ok(!stock.models.some((model) => model.id === id), id + " should be excluded for REIT");
    assert.ok(stock.excludedModels.some((model) => model.id === id), id + " should be recorded as excluded");
  }
});

test("does not substitute EPS when a REIT lacks FFO/AFFO", () => {
  const stock = calculateStock({
    ...base,
    ticker: "REIT-NO-FFO",
    name: "Example Property Trust",
    sector: "Real Estate Investment Trust",
    eps: 4,
    ffoPerShare: 0,
    targetFfoMultiple: 18,
  });
  assert.ok(!stock.models.some((model) => model.id === "p-ffo"));
  assert.match(stock.excludedModels.find((model) => model.id === "p-ffo")?.reason ?? "", /FFO/);
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
    targetEvRevenueMultiple: 7.7,
    targetEvEbitdaMultiple: 22,
    targetEvEbitMultiple: 24.5,
    netMargin: 0.276186,
    source: "自動資料",
    dataBasis: "ltm",
    dataCompleteness: "historical",
  });
  assert.ok(stock.models.some((model) => model.id === "ev-revenue"));
  assert.ok(stock.fairValue >= 220 && stock.fairValue <= 270, "AAPL-like fair value was " + stock.fairValue);
  assert.ok(stock.upside >= -0.3 && stock.upside <= -0.1, "AAPL-like gap was " + stock.upside);
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

test("builds a separate high-growth market pricing reference without using analyst data", () => {
  const fundPortfolioPe = {
    sampleSize: 56,
    averagePe: 68.6,
    medianPe: 41.3,
    lowerQuartilePe: 32.9,
    upperQuartilePe: 88.6,
    p90Pe: 113.4,
    p95Pe: 253.4,
    valueWeightedAveragePe: 48.4,
    lowestPe: 1.9,
    highestPe: 306.4,
  };
  const input = {
    ...base,
    ticker: "TSLA",
    name: "Tesla Inc.",
    sector: "Automotive",
    eps: 1.08,
    revenueGrowth: -3,
    institutionalSignal: { heldByCount: 2, increasedByCount: 2 },
    fundPortfolioPe,
  };
  const stock = calculateStock(input);
  assert.equal(stock.marketPricing?.enabled, true);
  assert.ok(stock.marketPricing?.selectedPe > 180 && stock.marketPricing?.selectedPe < 220);
  assert.ok(stock.marketPricing?.fairValue > 190);
  assert.equal(stock.marketPricing?.fairValue, calculateStock({ ...input, price: 2_000 }).marketPricing?.fairValue);
  assert.equal(stock.fairValue, calculateStock({ ...input, price: 2_000 }).fairValue);
  assert.ok(stock.assumptions.marketPricingNote.includes("分析師"));
});

test("keeps fund-held sector references distinct across cyclical, AI, mature and optionality names", () => {
  const fundPortfolioPe = {
    sampleSize: 56,
    averagePe: 68.6,
    medianPe: 41.3217,
    lowerQuartilePe: 33.0342,
    upperQuartilePe: 88.5535,
    p90Pe: 138.3,
    p95Pe: 253.4176,
    valueWeightedAveragePe: 48.3836,
    lowestPe: 1.9,
    highestPe: 306.4,
  };
  const common = { ...base, fundPortfolioPe, institutionalSignal: { heldByCount: 2, increasedByCount: 1 } };
  const tsla = calculateStock({ ...common, ticker: "TSLA", name: "Tesla Inc.", sector: "Automotive", eps: 1.08, revenueGrowth: -3, roe: 4, netMargin: 4 });
  const mu = calculateStock({ ...common, ticker: "MU", name: "Micron Technology", sector: "Semiconductors", eps: 7.59, revenueGrowth: 49, roe: 23, netMargin: 23 });
  const nvda = calculateStock({ ...common, ticker: "NVDA", name: "NVIDIA Corporation", sector: "Technology", eps: 4.9, revenueGrowth: 65, roe: 85, netMargin: 56 });
  const amzn = calculateStock({ ...common, ticker: "AMZN", name: "Amazon.com Inc.", sector: "Consumer Discretionary", eps: 7.17, revenueGrowth: 12, roe: 18, netMargin: 11 });

  assert.ok(tsla.marketPricing?.selectedPe > 180 && tsla.marketPricing?.selectedPe < 220);
  assert.ok(mu.marketPricing?.selectedPe >= 100 && mu.marketPricing?.selectedPe <= 140);
  assert.ok(nvda.marketPricing?.selectedPe >= nvda.assumptions.baseTargetPe && nvda.marketPricing?.selectedPe < 55);
  assert.ok(amzn.marketPricing?.selectedPe > 20 && amzn.marketPricing?.selectedPe < 30);
  assert.ok(tsla.marketPricing?.source.includes("P95"));
  assert.match(mu.marketPricing?.source ?? "", /AI/);
  assert.match(mu.assumptions.marketPricingNote ?? "", /P95/);
});

test("prefers a sufficiently broad business-model P/E band over a mixed sector", () => {
  const stock = calculateStock({
    ...base,
    ticker: "MU",
    name: "Micron Technology",
    sector: "Technology",
    eps: 7.59,
    revenueGrowth: 49,
    roe: 23,
    netMargin: 23,
    institutionalSignal: { heldByCount: 3, increasedByCount: 3 },
    fundPortfolioPe: {
      sampleSize: 56,
      medianPe: 41.3,
      lowerQuartilePe: 33,
      upperQuartilePe: 88.6,
      p95Pe: 253.4,
    },
    fundSectorPe: {
      sector: "Technology",
      sampleSize: 20,
      medianPe: 42,
      lowerQuartilePe: 35,
      upperQuartilePe: 95,
      p95Pe: 220,
      totalValueUsd: 1,
      increasedCount: 1,
      reducedCount: 1,
    },
    fundBusinessPe: {
      group: "memory-cycle",
      sampleSize: 5,
      uniqueSampleSize: 2,
      averagePe: 150,
      medianPe: 113.4,
      lowerQuartilePe: 113.4,
      upperQuartilePe: 253.4,
      p95Pe: 253.4,
      increasedCount: 4,
      reducedCount: 1,
      freshSampleSize: 0,
      agingSampleSize: 2,
      staleSampleSize: 3,
      unknownSampleSize: 0,
      medianFinancialAgeDays: 258,
      dataQuality: "mixed",
      tickers: ["MU", "SIMO"],
    },
  });
  assert.equal(stock.marketPricing?.referenceBusinessGroup, "memory-cycle");
  assert.equal(stock.marketPricing?.referenceSector, "Technology");
  assert.equal(stock.assumptions.marketPeAnchor, 113.4);
  assert.ok((stock.marketPricing?.fairValue ?? 0) > 1_000);
  assert.equal(stock.fairValue, calculateStock({ ...stock, price: 2_000 }).fairValue);
});

test("keeps the AI-cycle premium gated by institutional conviction", () => {
  const fundPortfolioPe = {
    sampleSize: 56,
    medianPe: 41.3217,
    upperQuartilePe: 88.5535,
    p95Pe: 253.4176,
  };
  const stock = calculateStock({
    ...base,
    ticker: "MEMX",
    name: "Memory Supplier",
    sector: "Semiconductors",
    eps: 7.59,
    revenueGrowth: 49,
    institutionalSignal: { heldByCount: 0, increasedByCount: 0 },
    roe: 25,
    netMargin: 25,
    fundPortfolioPe,
  });
  // A cyclical name without the three-part gate (AI theme, growth, and
  // multi-fund conviction) remains conservative rather than inheriting the
  // portfolio upper tail.
  assert.ok((stock.marketPricing?.selectedPe ?? Infinity) < 30);
  assert.doesNotMatch(stock.marketPricing?.source ?? "", /AI/);
});

test("rejects a highly dispersed sector profile instead of applying a misleading median", () => {
  const globalProfile = {
    sampleSize: 56,
    averagePe: 68.6,
    medianPe: 41.3217,
    lowerQuartilePe: 33.0342,
    upperQuartilePe: 88.5535,
    p90Pe: 138.3,
    p95Pe: 253.4176,
    valueWeightedAveragePe: 48.3836,
    lowestPe: 1.9,
    highestPe: 306.4,
  };
  const industrialProfile = {
    sector: "Industrials",
    sampleSize: 6,
    averagePe: 150.5,
    medianPe: 109.5893,
    lowerQuartilePe: 47.7898,
    upperQuartilePe: 270.5694,
    p95Pe: 306.3704,
    valueWeightedAveragePe: 80.0844,
    totalValueUsd: 17_693_246_217,
    increasedCount: 3,
    reducedCount: 1,
  };
  const input = {
    ...base,
    ticker: "TSLA",
    name: "Tesla Inc.",
    sector: "Industrials",
    eps: 1.08,
    revenueGrowth: -3,
    institutionalSignal: { heldByCount: 2, increasedByCount: 2 },
    fundPortfolioPe: globalProfile,
    fundSectorPe: industrialProfile,
  };
  const stock = calculateStock(input);
  assert.equal(stock.marketPricing?.referenceSector, undefined);
  assert.equal(stock.marketPricing?.referenceSampleSize, undefined);
  assert.ok(stock.marketPricing?.selectedPe > 190 && stock.marketPricing?.selectedPe < 220);
  assert.equal(stock.assumptions.marketPeAnchor, globalProfile.medianPe);
  assert.equal(stock.assumptions.marketPeReferenceSector, undefined);
  assert.match(stock.marketPricing?.source ?? "", /產業樣本分歧過大/);
});

test("uses a maturity-discounted sector reference for profitable multi-fund holdings", () => {
  const stock = calculateStock({
    ...base,
    ticker: "AAPL",
    name: "Apple Inc.",
    sector: "Technology",
    price: 308.26,
    eps: 7.46,
    bvps: 6,
    fcfPerShare: 6.7,
    revenueGrowth: 6.4,
    roe: 100,
    netMargin: 26.9,
    institutionalSignal: { heldByCount: 3, increasedByCount: 1 },
    fundPortfolioPe: {
      sampleSize: 56,
      averagePe: 68.6,
      medianPe: 41.3,
      lowerQuartilePe: 33,
      upperQuartilePe: 88.6,
      p90Pe: 138.3,
      p95Pe: 253.4,
      valueWeightedAveragePe: 48.4,
      lowestPe: 1.9,
      highestPe: 306.4,
    },
    fundSectorPe: {
      sector: "Technology",
      sampleSize: 32,
      averagePe: 68.4,
      medianPe: 41.3217,
      lowerQuartilePe: 36.0941,
      upperQuartilePe: 88.5535,
      p95Pe: 211.4938,
      valueWeightedAveragePe: 51.7,
      totalValueUsd: 20_000_000_000,
      increasedCount: 17,
      reducedCount: 14,
    },
  });

  assert.equal(stock.marketPricing?.enabled, true);
  assert.equal(stock.marketPricing?.referenceSector, "Technology");
  assert.ok(stock.marketPricing?.selectedPe > 34 && stock.marketPricing?.selectedPe < 38);
  assert.ok(stock.marketPricing?.fairValue > 250 && stock.marketPricing?.fairValue < 285);
  assert.ok(stock.marketPricing?.source.includes("成熟品質"));
});

test("keeps current cyclical EPS in the market layer while normalizing intrinsic models", () => {
  const stock = calculateStock({
    ...base,
    ticker: "MU",
    name: "Micron Technology",
    sector: "Semiconductors",
    price: 861,
    eps: 44.24,
    bvps: 40,
    fcfPerShare: 25,
    revenueGrowth: 49,
    roe: 30,
    netMargin: 25,
    dataBasis: "ltm",
    epsHistory: [
      { value: 7.59, end: "2025-08-28", basis: "annual" },
      { value: 0.7, end: "2024-08-29", basis: "annual" },
      { value: 1.5, end: "2022-08-31", basis: "annual" },
      { value: -0.4, end: "2023-08-31", basis: "annual" },
    ],
    institutionalSignal: { heldByCount: 3, increasedByCount: 3 },
    fundSectorPe: {
      sector: "Technology",
      sampleSize: 32,
      averagePe: 68.4,
      medianPe: 41.3217,
      lowerQuartilePe: 36.0941,
      upperQuartilePe: 88.5535,
      p95Pe: 211.4938,
      valueWeightedAveragePe: 51.7,
      totalValueUsd: 20_000_000_000,
      increasedCount: 17,
      reducedCount: 14,
    },
  });

  assert.ok(stock.epsNormalizationApplied);
  assert.ok(stock.normalizedEpsPerShare < stock.reportedEpsPerShare);
  assert.ok(stock.marketPricing?.selectedPe >= 100 && stock.marketPricing?.selectedPe <= 140);
  assert.ok((stock.marketPricing?.fairValue ?? 0) > 4_000);
  assert.match(stock.marketPricing?.note ?? "", /P95/);
  assert.ok(stock.fairValue < (stock.marketPricing?.fairValue ?? Number.POSITIVE_INFINITY));
});

test("does not classify aerospace as the space-economy optionality theme", () => {
  const stock = calculateStock({
    ...base,
    ticker: "GE",
    name: "GE Aerospace",
    sector: "Industrials",
    price: 100,
    eps: 5,
    bvps: 20,
    fcfPerShare: 4,
    revenueGrowth: 8,
    roe: 25,
    debtRatio: 30,
    institutionalSignal: {
      trackedFundCount: 6,
      heldByCount: 2,
      increasedByCount: 1,
      reducedByCount: 0,
      newByCount: 0,
      unchangedByCount: 1,
      holdings: [],
    },
    fundPortfolioPe: {
      sampleSize: 20,
      averagePe: 40,
      medianPe: 40,
      lowerQuartilePe: 30,
      upperQuartilePe: 70,
      p90Pe: 100,
      p95Pe: 200,
      valueWeightedAveragePe: 35,
      lowestPe: 10,
      highestPe: 220,
    },
  });

  assert.ok(!stock.marketPricing?.triggers.includes("optionality"));
  assert.ok(!stock.marketPricing?.source.includes("P95"));
});

test("marks old annual snapshots as stale instead of presenting them as current", () => {
  const stock = calculateStock({
    ...base,
    financialDataDate: "2025-01-01",
    dataBasis: "annual",
  });
  assert.equal(stock.financialFreshness, "stale");
  assert.ok((stock.financialAgeDays ?? 0) > 365);
  assert.ok(stock.historicalCautionReasons.some((reason) => reason.includes("超過約八個月")));
  assert.equal(stock.valuationConfidence, "low");
});
