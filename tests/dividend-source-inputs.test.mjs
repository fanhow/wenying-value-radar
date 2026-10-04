import assert from "node:assert/strict";
import test from "node:test";
import {
  effectiveDividendPeriod,
  secDividendInputs,
  unclassifiedDividendInputs,
} from "../lib/dividend-source-inputs.ts";
import { metricFactsFromConcepts } from "../lib/sec-financials.ts";

const annual = (value, end = "2025-12-31") => ({
  val: value, start: `${end.slice(0, 4)}-01-01`, end,
  filed: "2026-02-15", form: "10-K", accn: "synthetic-annual",
});
const source = (concepts) => ({ facts: { "us-gaap": concepts } });
const metric = (facts, concepts, units, mode = "duration") =>
  metricFactsFromConcepts(facts, "us-gaap", concepts, units, mode);
const inputs = (facts, extra = {}) => secDividendInputs({
  companyFacts: facts, taxonomy: "us-gaap", currency: "USD", ...extra,
});

test("explicit zero declared DPS is retained when a positive cash-payment fallback exists", () => {
  const facts = source({
    CommonStockDividendsPerShareDeclared: { units: { "USD/shares": [annual(0)] } },
    PaymentsOfDividendsCommonStock: { units: { USD: [annual(100)] } },
  });
  const result = inputs(facts);
  assert.equal(result.dividendPerShare, 0);
  assert.equal(result.dividendEvidence.kind, "declared");
  assert.equal(result.dividendEvidence.ordinaryScope, "unknown");
  assert.match(result.dividendEvidence.source, /CommonStockDividendsPerShareDeclared$/);
  assert.equal(result.dividendBasisMetric.value, 0);
});

test("invalid negative direct DPS is not clamped to zero or replaced by a positive paid amount", () => {
  const facts = source({
    CommonStockDividendsPerShareDeclared: { units: { "USD/shares": [annual(-1)] } },
    PaymentsOfDividendsCommonStock: { units: { USD: [annual(100)] } },
  });
  assert.equal(inputs(facts).dividendPerShare, -1);
});

test("missing SEC dividend observations remain unavailable", () => {
  const result = inputs(source({}));
  assert.equal(result.dividendPerShare, undefined);
  assert.equal(result.dividendEvidence, undefined);
  assert.equal(result.dividendBasisMetric, null);
});

test("the selected newer paid-per-share concept retains its payment identity", () => {
  const facts = source({
    CommonStockDividendsPerShareDeclared: { units: { "USD/shares": [annual(1.2, "2024-12-31")] } },
    CommonStockDividendsPerShareCashPaid: { units: { "USD/shares": [annual(1.8)] } },
  });
  const result = inputs(facts);
  assert.equal(result.dividendPerShare, 1.8);
  assert.equal(result.dividendEvidence.kind, "paid");
  assert.equal(result.dividendEvidence.periodEnd, "2025-12-31");
  assert.equal(result.dividendEvidence.shareBasis, "ordinary-per-share");
  assert.equal(result.dividendEvidence.ordinaryScope, "unknown");
});

test("payment total conversion preserves explicit zero and the actual ending-share source", () => {
  const facts = source({ PaymentsOfDividendsCommonStock: { units: { USD: [annual(0)] } } });
  facts.facts.dei = { EntityCommonStockSharesOutstanding: { units: { shares: [
    { val: 100, end: "2025-12-31", form: "10-K" },
  ] } } };
  const sharesCandidate = metricFactsFromConcepts(facts, "dei", ["EntityCommonStockSharesOutstanding"], ["shares"], "instant");
  const result = inputs(facts, { sharesCandidate });
  assert.equal(result.dividendPerShare, 0);
  assert.equal(result.dividendEvidence.kind, "paid");
  assert.equal(result.dividendEvidence.shareBasis, "ending-ordinary");
  assert.equal(result.dividendEvidence.shareAsOfDate, "2025-12-31");
  assert.match(result.dividendEvidence.shareSource, /dei:EntityCommonStockSharesOutstanding$/);
});

test("cash total is not divided by shares from another reporting date", () => {
  const facts = source({ PaymentsOfDividendsCommonStock: { units: { USD: [annual(100)] } } });
  const sharesCandidate = {
    taxonomy: "dei", conceptName: "EntityCommonStockSharesOutstanding", facts: [],
    metric: { value: 50, end: "2026-06-30", basis: "latest", sourceFacts: [] },
  };
  const result = inputs(facts, { sharesCandidate });
  assert.equal(result.dividendPerShare, undefined);
  assert.equal(result.dividendEvidence.kind, "paid");
  assert.equal(result.dividendEvidence.periodEnd, "2025-12-31");
  assert.equal(result.dividendEvidence.shareAsOfDate, "2026-06-30");
});

test("generic cash dividends are not presented as a precise common-stock DPS", () => {
  const facts = source({
    PaymentsOfDividends: { units: { USD: [annual(100)] } },
    PaymentsOfDividendsPreferredStock: { units: { USD: [annual(40)] } },
  });
  const sharesCandidate = {
    taxonomy: "dei", conceptName: "EntityCommonStockSharesOutstanding", facts: [],
    metric: { value: 50, end: "2025-12-31", basis: "latest", sourceFacts: [] },
  };
  const result = inputs(facts, { sharesCandidate });
  assert.equal(result.dividendPerShare, undefined);
  assert.equal(result.dividendEvidence.shareBasis, "unknown");
  assert.equal(result.dividendEvidence.ordinaryScope, "unknown");
  assert.equal(result.dividendBasisMetric.value, 100);
  assert.match(result.dividendEvidence.source, /:PaymentsOfDividends$/);
});

test("same-date common-stock payments convert using the disclosed ending shares", () => {
  const facts = source({ PaymentsOfDividendsCommonStock: { units: { USD: [annual(100)] } } });
  const sharesCandidate = {
    taxonomy: "dei", conceptName: "EntityCommonStockSharesOutstanding", facts: [],
    metric: { value: 50, end: "2025-12-31", basis: "latest", sourceFacts: [] },
  };
  const result = inputs(facts, { sharesCandidate });
  assert.equal(result.dividendPerShare, 2);
  assert.equal(result.dividendEvidence.shareBasis, "ending-ordinary");
  assert.equal(result.dividendEvidence.paymentTiming, "historical");
  assert.equal(result.dividendEvidence.ordinaryScope, "unknown");
});

test("a negative common-stock payment observation is not made positive by absolute value", () => {
  const facts = source({ PaymentsOfDividendsCommonStock: { units: { USD: [annual(-100)] } } });
  const sharesCandidate = {
    taxonomy: "dei", conceptName: "EntityCommonStockSharesOutstanding", facts: [],
    metric: { value: 50, end: "2025-12-31", basis: "latest", sourceFacts: [] },
  };
  assert.equal(inputs(facts, { sharesCandidate }).dividendPerShare, -2);
});

test("LTM dividend evidence dates reflect the bridge coverage and retain the source periods", () => {
  const current = { val: 0.9, start: "2026-01-01", end: "2026-06-30", form: "10-Q", accn: "current" };
  const prior = { val: 0.8, start: "2025-01-01", end: "2025-06-30", form: "10-Q", accn: "prior" };
  const facts = source({ CommonStockDividendsPerShareCashPaid: { units: { "USD/shares": [annual(1.6), current, prior] } } });
  const result = inputs(facts);
  assert.equal(result.dividendPerShare, 1.7);
  assert.equal(result.dividendEvidence.periodBasis, "ltm");
  assert.equal(result.dividendEvidence.periodStart, "2025-07-01");
  assert.equal(result.dividendEvidence.periodEnd, "2026-06-30");
  assert.deepEqual(result.dividendEvidence.sourceFacts.map((fact) => fact.accn), ["synthetic-annual", "current", "prior"]);
});

test("an unavailable prior-YTD end is not replaced with the annual start", () => {
  const period = effectiveDividendPeriod({
    value: 1, basis: "ltm", start: "2025-01-01", end: "2026-06-30",
    sourceFacts: [annual(1), { val: 1 }, { val: 1 }],
  });
  assert.equal(period.periodStart, undefined);
});

test("a stale annual fact is not relabelled as a valid current LTM dividend", () => {
  const current = { val: 0.9, start: "2026-01-01", end: "2026-06-30", form: "10-Q" };
  const prior = { val: 0.8, start: "2025-01-01", end: "2025-06-30", form: "10-Q" };
  const facts = source({ CommonStockDividendsPerShareCashPaid: { units: { "USD/shares": [annual(1.6, "2023-12-31"), current, prior] } } });
  const result = inputs(facts);
  assert.equal(result.dividendPerShare, undefined);
  assert.equal(result.dividendEvidence.periodStart, undefined);
  assert.equal(result.dividendEvidence.sourceFacts[0].end, "2023-12-31");
});

test("reported EPS remains the payout denominator rather than a normalized earnings guess", () => {
  const facts = source({
    CommonStockDividendsPerShareDeclared: { units: { "USD/shares": [annual(1.5)] } },
    EarningsPerShareBasic: { units: { "USD/shares": [annual(2)] } },
  });
  const result = inputs(facts, { epsCandidate: metric(facts, ["EarningsPerShareBasic"], ["USD/shares"]) });
  assert.equal(result.dividendEarnings.valuePerShare, 2);
  assert.equal(result.dividendEarnings.basis, "reported-common");
  assert.equal(result.dividendEarnings.shareBasis, "weighted-average-basic");
  assert.equal(result.dividendEarnings.periodStart, "2025-01-01");
  assert.equal(result.dividendEarnings.periodEnd, "2025-12-31");
});

test("different dividend and earnings periods remain visibly different", () => {
  const facts = source({
    CommonStockDividendsPerShareDeclared: { units: { "USD/shares": [annual(1.5, "2024-12-31")] } },
    EarningsPerShareDiluted: { units: { "USD/shares": [annual(3)] } },
  });
  const result = inputs(facts, { epsCandidate: metric(facts, ["EarningsPerShareDiluted"], ["USD/shares"]) });
  assert.equal(result.dividendEvidence.periodEnd, "2024-12-31");
  assert.equal(result.dividendEarnings.periodEnd, "2025-12-31");
  assert.equal(result.dividendEarnings.shareBasis, "weighted-average-diluted");
});

test("wrong-currency per-share data are not silently relabelled USD", () => {
  const result = inputs(source({ CommonStockDividendsPerShareDeclared: { units: { "TWD/shares": [annual(1.14)] } } }));
  assert.equal(result.dividendPerShare, undefined);
  assert.equal(result.dividendEvidence, undefined);
});

test("snapshot and scan values preserve missing, explicit zero and negatives without claiming a duration", () => {
  for (const value of [undefined, null, "", " ", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(unclassifiedDividendInputs(value, "TWD", "snapshot").dividendPerShare, undefined);
  }
  for (const [raw, expected] of [[0, 0], ["0", 0], [1.38, 1.38], [-1, -1]]) {
    const result = unclassifiedDividendInputs(raw, "TWD", "snapshot");
    assert.equal(result.dividendPerShare, expected);
    assert.equal(result.dividendEvidence.kind, "unknown");
    assert.equal(result.dividendEvidence.periodBasis, "unknown");
    assert.equal(result.dividendEvidence.ordinaryScope, "unknown");
  }
});
