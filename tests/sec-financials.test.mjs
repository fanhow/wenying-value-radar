import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateDebtValues,
  latestInstantMetric,
  metricFromConcepts,
  metricsAlign,
  selectSecFacts,
  summarizeFinancialBasis,
  trailingTwelveMonthsMetric,
  trailingTwelveMonthsGrowth,
} from "../lib/sec-financials.ts";

const annual = { val: 100, start: "2024-10-01", end: "2025-09-30", filed: "2025-11-01", form: "10-K", frame: "CY2025" };

test("uses the latest annual fact when no newer interim period exists", () => {
  const metric = trailingTwelveMonthsMetric([annual]);
  assert.equal(metric?.basis, "annual");
  assert.equal(metric?.value, 100);
  assert.equal(metric?.end, "2025-09-30");
});

test("builds LTM as latest annual plus current YTD minus prior-year YTD", () => {
  const currentYtd = { val: 90, start: "2025-10-01", end: "2026-06-30", filed: "2026-08-01", form: "10-Q" };
  const priorYtd = { val: 70, start: "2024-10-01", end: "2025-06-30", filed: "2025-08-01", form: "10-Q" };
  const metric = trailingTwelveMonthsMetric([annual, currentYtd, priorYtd]);
  assert.equal(metric?.basis, "ltm");
  assert.equal(metric?.value, 120);
  assert.equal(metric?.end, "2026-06-30");
  assert.equal(metric?.sourceFacts.length, 3);
});

test("calculates period-aligned LTM growth when two annual and three YTD periods exist", () => {
  const priorAnnual = { val: 80, start: "2023-10-01", end: "2024-09-30", filed: "2024-11-01", form: "10-K", frame: "CY2024" };
  const currentYtd = { val: 90, start: "2025-10-01", end: "2026-06-30", filed: "2026-08-01", form: "10-Q" };
  const priorYtd = { val: 70, start: "2024-10-01", end: "2025-06-30", filed: "2025-08-01", form: "10-Q" };
  const priorPriorYtd = { val: 60, start: "2023-10-01", end: "2024-06-30", filed: "2024-08-01", form: "10-Q" };
  const growth = trailingTwelveMonthsGrowth([annual, priorAnnual, currentYtd, priorYtd, priorPriorYtd]);
  assert.equal(growth?.basis, "ltm");
  assert.equal(growth?.currentValue, 120);
  assert.equal(growth?.priorValue, 90);
  assert.ok(Math.abs((growth?.rate ?? 0) - (1 / 3)) < 1e-12);
});

test("falls back to comparable annual growth", () => {
  const priorAnnual = { val: 80, start: "2023-10-01", end: "2024-09-30", filed: "2024-11-01", form: "10-K", frame: "CY2024" };
  const growth = trailingTwelveMonthsGrowth([annual, priorAnnual]);
  assert.equal(growth?.basis, "annual");
  assert.equal(growth?.rate, 0.25);
});

test("falls through to a later concept instead of accepting the wrong unit", () => {
  const facts = {
    facts: {
      "us-gaap": {
        WrongUnitConcept: { units: { shares: [{ ...annual, val: 999 }] } },
        RevenueConcept: { units: { USD: [{ ...annual, val: 123 }] } },
      },
    },
  };
  const selected = selectSecFacts(facts, "us-gaap", ["WrongUnitConcept", "RevenueConcept"], ["USD"]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].val, 123);
});

test("keeps the latest amended filing for the same reporting period", () => {
  const facts = [
    { ...annual, val: 100, filed: "2025-11-01", accn: "a" },
    { ...annual, val: 105, filed: "2025-11-15", accn: "b" },
  ];
  const metric = trailingTwelveMonthsMetric(facts);
  assert.equal(metric?.value, 105);
});

test("selects the newest instant balance-sheet fact", () => {
  const metric = latestInstantMetric([
    { val: 20, end: "2025-09-30", filed: "2025-11-01", form: "10-K" },
    { val: 25, end: "2026-06-30", filed: "2026-08-01", form: "10-Q" },
  ]);
  assert.equal(metric?.value, 25);
  assert.equal(metric?.end, "2026-06-30");
});

test("does not treat a duration fact as an instant metric", () => {
  assert.equal(latestInstantMetric([annual]), null);
});

test("builds LTM from four consecutive non-overlapping quarters", () => {
  const quarters = [
    { val: 10, start: "2025-10-01", end: "2025-12-31", filed: "2026-02-01", form: "10-Q" },
    { val: 20, start: "2026-01-01", end: "2026-03-31", filed: "2026-05-01", form: "10-Q" },
    { val: 30, start: "2026-04-01", end: "2026-06-30", filed: "2026-08-01", form: "10-Q" },
    { val: 40, start: "2026-07-01", end: "2026-09-30", filed: "2026-11-01", form: "10-Q" },
  ];
  const metric = trailingTwelveMonthsMetric([annual, ...quarters]);
  assert.equal(metric?.basis, "ltm");
  assert.equal(metric?.value, 100);
  assert.equal(metric?.sourceFacts.length, 4);
});

test("rejects overlapping quarters when constructing four-quarter LTM", () => {
  const quarters = [
    { val: 10, start: "2025-10-01", end: "2025-12-31", filed: "2026-02-01", form: "10-Q" },
    { val: 20, start: "2025-12-15", end: "2026-03-31", filed: "2026-05-01", form: "10-Q" },
    { val: 30, start: "2026-04-01", end: "2026-06-30", filed: "2026-08-01", form: "10-Q" },
    { val: 40, start: "2026-07-01", end: "2026-09-30", filed: "2026-11-01", form: "10-Q" },
  ];
  const metric = trailingTwelveMonthsMetric([annual, ...quarters]);
  assert.equal(metric?.basis, "annual");
  assert.equal(metric?.value, 100);
});

test("prefers reported total debt over partial or complete debt components", () => {
  assert.equal(aggregateDebtValues({ total: 100, current: 20, noncurrent: 80 }), 100);
  assert.equal(aggregateDebtValues({ total: 100, current: 20 }), 100);
  assert.equal(aggregateDebtValues({ current: 20, noncurrent: 80 }), 100);
  assert.equal(aggregateDebtValues({ current: 20 }), 20);
  assert.equal(aggregateDebtValues({}), null);
});

test("requires matching basis and end date for derived metrics", () => {
  const ltm = { value: 120, basis: "ltm", end: "2026-06-30", sourceFacts: [] };
  const alignedLtm = { value: 20, basis: "ltm", end: "2026-06-30", sourceFacts: [] };
  const annualAtSameEnd = { value: 100, basis: "annual", end: "2026-06-30", sourceFacts: [] };
  const ltmAtOtherEnd = { value: 20, basis: "ltm", end: "2026-03-31", sourceFacts: [] };
  assert.equal(metricsAlign(ltm, alignedLtm), true);
  assert.equal(metricsAlign(ltm, annualAtSameEnd), false);
  assert.equal(metricsAlign(ltm, ltmAtOtherEnd), false);
  assert.equal(metricsAlign(ltm, null), false);
});

test("marks mixed duration inputs as estimated instead of LTM", () => {
  const ltm = { value: 120, basis: "ltm", end: "2026-06-30", sourceFacts: [] };
  const alignedLtm = { value: 20, basis: "ltm", end: "2026-06-30", sourceFacts: [] };
  const annual = { value: 100, basis: "annual", end: "2025-12-31", sourceFacts: [] };
  assert.deepEqual(summarizeFinancialBasis([ltm, alignedLtm]), {
    basis: "ltm",
    end: "2026-06-30",
    aligned: true,
  });
  assert.deepEqual(summarizeFinancialBasis([ltm, annual]), {
    basis: "estimated",
    end: "2026-06-30",
    aligned: false,
  });
});

test("extracts a duration metric through the public concept helper", () => {
  const companyFacts = {
    facts: {
      "us-gaap": {
        Revenue: { units: { USD: [annual] } },
      },
    },
  };
  const metric = metricFromConcepts(companyFacts, "us-gaap", ["Revenue"], ["USD"], "duration");
  assert.equal(metric?.value, 100);
  assert.equal(metric?.basis, "annual");
});

test("falls through when the first same-unit concept cannot produce an annual metric", () => {
  const companyFacts = {
    facts: {
      "us-gaap": {
        QuarterlyOnly: { units: { USD: [{ val: 9, start: "2026-04-01", end: "2026-06-30", form: "10-Q" }] } },
        AnnualRevenue: { units: { USD: [annual] } },
      },
    },
  };
  const metric = metricFromConcepts(companyFacts, "us-gaap", ["QuarterlyOnly", "AnnualRevenue"], ["USD"], "duration");
  assert.equal(metric?.value, 100);
  assert.equal(metric?.basis, "annual");
});
