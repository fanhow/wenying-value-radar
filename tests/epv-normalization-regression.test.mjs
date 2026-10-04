import assert from "node:assert/strict";
import test from "node:test";
import { calculateStock } from "../lib/valuation.ts";

// Controlled mature industrial fixture. No peer/calibration/external-EPV
// assumptions; only the existing local reported-FCF bound and equity formula.
// Zero book/multiple inputs keep an extreme erroneous EPV from being hidden by
// the unrelated cross-model outlier filter.
const base = {
  ticker: "EPVTEST",
  name: "EPV normalization control",
  market: "US",
  sector: "Industrials",
  source: "手動輸入",
  price: 40,
  eps: 5,
  bvps: 0,
  fcfPerShare: 4,
  targetPe: 0,
  targetPb: 0,
  targetFcfMultiple: 0,
  revenueGrowth: 3,
  roe: 20,
  debtRatio: 30,
  debtPerShare: 0,
  cashPerShare: 0,
  uncertainty: 0.2,
  dataCompleteness: "complete",
  dataBasis: "ltm",
  updatedAt: "2026-10-03",
  financialDataDate: "2026-09-30",
  beta: 1,
  riskFreeRate: 0.04,
  marketRiskPremium: 0.05,
  countryRiskPremium: 0,
  discountRate: 0.1,
};

function close(actual, expected, message) {
  assert.ok(Number.isFinite(actual), `${message}: nonfinite result`);
  assert.ok(Math.abs(actual - expected) < 1e-10,
    `${message}: expected ${expected}, received ${actual}`);
}

function epv(stock) {
  const model = stock.models.find((candidate) => candidate.id === "epv");
  assert.ok(model, "the controlled mature fixture must retain applied EPV");
  return model;
}

test("EPV uses the upstream reported-FCF bound for an oversized positive normalized input", () => {
  const stock = calculateStock({ ...base, normalizedFcfPerShare: 100 });
  // Existing normalization contract: min(reported4, supplied100)=4.
  close(stock.assumptions.normalizedFcfPerShare, 4, "upstream normalized FCF");
  close(epv(stock).value, 40, "bounded4 / explicit equity cost0.1");
});

test("positive supplied normalization below reported FCF remains an explicit input", () => {
  const stock = calculateStock({ ...base, normalizedFcfPerShare: 2 });
  close(stock.assumptions.normalizedFcfPerShare, 2, "retained normalization");
  const model = epv(stock);
  close(model.value, 20, "explicit2 / equity cost0.1");
  close(model.rangeLow, 2 * 0.9 / 0.11, "existing low recipe");
  close(model.rangeHigh, 2 * 1.1 / 0.095, "existing high recipe");
});

test("supplied normalization above the automatic EPS cap is not silently recapped", () => {
  const stock = calculateStock({ ...base, fcfPerShare: 20, normalizedFcfPerShare: 10 });
  // Existing positive-supplied branch replaces, rather than adds, EPS*1.6.
  // This fix must not create a new <=EPS*1.6 rule for the supplied branch.
  close(stock.assumptions.normalizedFcfPerShare, 10, "supplied10 below reported20");
  close(epv(stock).value, 100, "retained explicit normalization");
});

for (const value of [0, -2]) {
  test(`explicit normalized FCF ${value} remains excluded instead of becoming a fallback`, () => {
    const stock = calculateStock({ ...base, normalizedFcfPerShare: value });
    assert.equal(stock.models.some((candidate) => candidate.id === "epv"), false);
    assert.ok(stock.excludedModels.some((candidate) => candidate.id === "epv"));
  });
}

for (const [label, value] of [["missing", undefined], ["NaN", NaN], ["Infinity", Infinity], ["negative Infinity", -Infinity]]) {
  test(`${label} normalized FCF preserves the existing finite blend fallback`, () => {
    const stock = calculateStock({ ...base, normalizedFcfPerShare: value });
    close(stock.assumptions.normalizedFcfPerShare, 4, "general bounded FCF");
    // Existing fallback: 65% reported/cappedFCF4 +35% EPS5 =4.35.
    close(epv(stock).value, 43.5, "existing blend / equity cost0.1");
  });
}

for (const reported of [0, -1]) {
  test(`positive normalization cannot bypass nonpositive reported FCF ${reported}`, () => {
    const stock = calculateStock({ ...base, fcfPerShare: reported, normalizedFcfPerShare: 2 });
    close(stock.assumptions.normalizedFcfPerShare, 0, "general nonnegative reported-FCF bound");
    assert.equal(stock.models.some((candidate) => candidate.id === "epv"), false);
    assert.ok(stock.excludedModels.some((candidate) => candidate.id === "epv"));
  });
}

test("automatic EPS conversion caps retain their existing eligibility semantics", () => {
  const complete = calculateStock({ ...base, fcfPerShare: 20 });
  close(complete.assumptions.normalizedFcfPerShare, 5 * 1.6, "complete automatic EPS cap");
  // 1.6 exceeds the existing EPV fallback conversion window's upper1.5.
  assert.equal(complete.models.some((candidate) => candidate.id === "epv"), false);
  const limited = calculateStock({ ...base, fcfPerShare: 20, dataCompleteness: "limited" });
  close(limited.assumptions.normalizedFcfPerShare, 5 * 1.25, "limited automatic EPS cap");
  close(epv(limited).value, (5 * 1.25 * 0.65 + 5 * 0.35) / 0.1, "limited existing blend");
});

test("explicit equity-cost override is labelled as an input rather than CAPM", () => {
  const stock = calculateStock({ ...base, normalizedFcfPerShare: 2 });
  close(stock.assumptions.costOfEquity, 0.1, "explicit equity-cost override");
  const explanation = epv(stock).explanation;
  assert.match(explanation, /(?:明確|指定|輸入).*股權成本|股權成本.*(?:明確|指定|輸入)/);
  assert.doesNotMatch(explanation, /÷ CAPM 股權成本/);
});

test("CAPM calculation and missing-parameter defaults remain distinct from source verification", () => {
  const capm = calculateStock({ ...base, discountRate: undefined, normalizedFcfPerShare: 2 });
  close(capm.assumptions.costOfEquity, 0.04 + 1 * 0.05, "provided-parameter CAPM calculation");
  close(epv(capm).value, 2 / 0.09, "CAPM denominator");
  assert.match(epv(capm).explanation, /CAPM/);
  const defaults = calculateStock({
    ...base, discountRate: undefined, normalizedFcfPerShare: 2,
    beta: undefined, riskFreeRate: undefined,
    marketRiskPremium: undefined, countryRiskPremium: undefined,
  });
  assert.ok(defaults.assumptions.defaulted.some((entry) => entry.includes("beta")));
  assert.ok(defaults.assumptions.defaulted.includes("無風險利率"));
  assert.match(epv(defaults).explanation, /CAPM/);
  // Computational origin labels do not certify these parameters as observed
  // market data or any provider's selected/default capital-cost algorithm.
});

for (const [label, discountRate, expected] of [
  ["percentage", 10, 0.1],
  ["below minimum", 0.01, 0.045],
  ["above maximum", 0.5, 0.25],
]) {
  test(`finite ${label} discount input keeps the existing percentage/clamp contract`, () => {
    const stock = calculateStock({ ...base, normalizedFcfPerShare: 2, discountRate });
    close(stock.assumptions.costOfEquity, expected, "existing rate conversion/clamp");
    close(epv(stock).value, 2 / expected, "EPV uses the computed equity cost");
    assert.ok(stock.assumptions.defaulted.includes("股權成本採用明確輸入值"));
  });
}

for (const [label, discountRate] of [["NaN", NaN], ["Infinity", Infinity], ["negative Infinity", -Infinity]]) {
  test(`${label} discount input falls back to CAPM and is labelled as that calculation`, () => {
    const stock = calculateStock({ ...base, normalizedFcfPerShare: 2, discountRate });
    close(stock.assumptions.costOfEquity, 0.09, "existing nonfinite CAPM fallback");
    close(epv(stock).value, 2 / 0.09, "EPV uses fallback equity cost");
    assert.match(epv(stock).explanation, /CAPM/);
    assert.doesNotMatch(epv(stock).explanation, /明確輸入股權成本/);
    const notes = stock.assumptions.defaulted.join("；");
    assert.doesNotMatch(notes, /股權成本採用明確輸入值/);
    assert.match(notes, /無效.*CAPM|CAPM.*無效/);
  });
}

test("TW market alone can use generic EPV, while the same input with the research policy cannot", () => {
  const input = { ...base, ticker: "9999", market: "TW", normalizedFcfPerShare: 2 };
  const generic = calculateStock(input);
  close(epv(generic).value, 20, "generic TW explicit EPV");
  const research = calculateStock({ ...input, valuationPolicy: "tw-comparables-v1" });
  assert.equal(research.models.some((candidate) => candidate.id === "epv"), false);
  assert.ok(research.excludedModels.some((candidate) => candidate.id === "epv"));
});
