import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateStock } from '../lib/valuation.ts';
import { valuationRankingState } from '../lib/daily-valuation-state.ts';

// Synthetic annual ordinary dividends: each accounting and assumption source
// is explicit. These fixtures never substitute an external stock target.
const base = {
  ticker: 'DIVIDEND-RESEARCH', name: 'Dividend Research Fixture', market: 'US',
  sector: 'Industrials', price: 100, eps: 5, bvps: 20, fcfPerShare: 4,
  targetPe: 20, targetPb: 2, targetFcfMultiple: 20,
  revenueGrowth: 3, roe: 20, debtRatio: 30, uncertainty: .2,
  dividendPerShare: 2, dataBasis: 'annual', financialDataDate: '2025-12-31',
  updatedAt: '2026-10-01',
};
const period = {
  currency: 'USD', periodBasis: 'annual',
  periodStart: '2025-01-01', periodEnd: '2025-12-31',
  shareBasis: 'ordinary-per-share',
};
const evidence = {
  ...period, kind: 'paid', paymentTiming: 'historical', ordinaryScope: 'ordinary-only',
  source: 'synthetic statement: ordinary cash dividends, full annual period',
};
const earnings = {
  ...period, valuePerShare: 5, basis: 'reported-common',
  source: 'synthetic statement: reported earnings attributable to ordinary shareholders',
};
const assumptions = {
  growthRateAnnualDecimal: .02, costOfEquityAnnualDecimal: .1,
  dividendTiming: 'D0',
  growthSource: 'synthetic documented annual dividend growth assumption',
  costOfEquitySource: 'synthetic documented annual equity discount assumption',
  timingSource: 'synthetic documented historical D0 convention',
  sustainabilitySource: 'synthetic documented continuing ordinary dividend assumption',
};
const complete = (patch = {}) => ({
  ...base, dividendEvidence: evidence, dividendEarnings: earnings,
  ddmResearchAssumptions: assumptions, ...patch,
});
const near = (actual, expected) => assert.ok(
  typeof actual === 'number' && Math.abs(actual - expected) < 1e-10,
  `${actual} != ${expected}`,
);
const formalSnapshot = (stock) => ({
  fairValue: stock.fairValue, rangeLow: stock.rangeLow, rangeHigh: stock.rangeHigh,
  calibratedFairValue: stock.calibratedFairValue,
  models: stock.models.map(({ id, value, weight, rangeLow, rangeHigh }) =>
    ({ id, value, weight, rangeLow, rangeHigh })),
});

test('source-backed D0 yields a research calculation without entering formal models or ranking', () => {
  const plain = calculateStock(base), researched = calculateStock(complete());
  const ddm = researched.ddmResearch;
  assert.equal(ddm.status, 'research-ready');
  near(ddm.dividendPerShare, 2);
  near(ddm.matchedEarningsPerShare, 5);
  near(ddm.payoutRatio, .4);
  near(ddm.growthRateAnnual, .02);
  near(ddm.costOfEquityAnnual, .1);
  near(ddm.fairValue, 25.5);
  assert.equal(ddm.includedInFormalValuation, false);
  assert.equal(researched.models.some(model => model.id === 'ddm-stable'), false);
  assert.ok(researched.excludedModels.some(model => model.id === 'ddm-stable'));
  assert.deepEqual(formalSnapshot(researched), formalSnapshot(plain));
  assert.deepEqual(valuationRankingState(researched), valuationRankingState(plain));
});

test('missing dividend evidence and an evidenced zero are distinct states', () => {
  for (const input of [
    { ...base, dividendPerShare: undefined },
    { ...base, dividendPerShare: 0 },
    { ...base, dividendPerShare: 2 },
  ]) {
    const ddm = calculateStock(input).ddmResearch;
    assert.equal(ddm.status, 'inputs-unavailable');
    assert.equal(ddm.dividendPerShare, input.dividendPerShare ?? null);
    assert.equal(ddm.payoutRatio, null);
    assert.equal(ddm.fairValue, null);
  }
  const zero = calculateStock(complete({ dividendPerShare: 0 })).ddmResearch;
  assert.equal(zero.status, 'zero-dividend');
  assert.equal(zero.dividendPerShare, 0);
  assert.equal(zero.fairValue, null);
  assert.equal(zero.includedInFormalValuation, false);
});

test('mismatched accounting periods, currencies and share bases cannot produce a payout ratio', () => {
  const cases = [
    { ...earnings, periodBasis: 'ltm', periodStart: '2025-07-01', periodEnd: '2026-06-30' },
    { ...earnings, periodStart: '2024-01-01', periodEnd: '2024-12-31' },
    { ...earnings, currency: 'TWD' },
    { ...earnings, shareBasis: 'weighted-average-diluted' },
    { ...earnings, basis: 'normalized-common' },
  ];
  for (const dividendEarnings of cases) {
    const ddm = calculateStock(complete({ dividendEarnings })).ddmResearch;
    assert.equal(ddm.status, 'basis-review');
    assert.equal(ddm.payoutRatio, null);
    assert.equal(ddm.fairValue, null);
    assert.ok(ddm.issues.some(issue => issue.category === 'period-basis'));
  }
});

test('ordinary scope and an earnings-adjusted dividend remain explicit unresolved bases', () => {
  for (const dividendEvidence of [
    { ...evidence, ordinaryScope: 'includes-special' },
    { ...evidence, ordinaryScope: 'unknown' },
    { ...evidence, kind: 'earnings-adjusted' },
  ]) {
    const ddm = calculateStock(complete({ dividendEvidence })).ddmResearch;
    assert.equal(ddm.status, 'basis-review');
    assert.equal(ddm.dividendPerShare, 2);
    assert.equal(ddm.payoutRatio, null);
    assert.equal(ddm.fairValue, null);
    assert.ok(ddm.issues.length > 0);
  }
});

test('documented forward D1 is distinct from historical paid D0', () => {
  const forwardPeriod = { periodStart: '2026-01-01', periodEnd: '2026-12-31' };
  const forward = calculateStock(complete({
    dividendEvidence: {
      ...evidence, ...forwardPeriod, kind: 'declared', paymentTiming: 'forward',
      source: 'synthetic future ordinary dividend declared for the next annual period',
    },
    dividendEarnings: { ...earnings, ...forwardPeriod },
    ddmResearchAssumptions: {
      ...assumptions, dividendTiming: 'D1',
      timingSource: 'synthetic documented next annual dividend D1 convention',
    },
  })).ddmResearch;
  assert.equal(forward.status, 'research-ready');
  near(forward.fairValue, 25);
  assert.equal(forward.includedInFormalValuation, false);
  const relabeledHistory = calculateStock(complete({
    ddmResearchAssumptions: { ...assumptions, dividendTiming: 'D1' },
  })).ddmResearch;
  assert.notEqual(relabeledHistory.status, 'research-ready');
  assert.equal(relabeledHistory.fairValue, null);
  const unknownPayment = calculateStock(complete({
    dividendEvidence: { ...evidence, paymentTiming: 'unknown' },
  })).ddmResearch;
  assert.notEqual(unknownPayment.status, 'research-ready');
  assert.equal(unknownPayment.fairValue, null);
});

test('a historical EPS normalization cannot silently change the dividend payout denominator', () => {
  const stock = calculateStock(complete({
    ticker: 'DIVIDEND-CYCLE', name: 'Cyclical Dividend Fixture', sector: 'Cyclical Automotive',
    eps: 1,
    epsHistory: [
      { value: 1, end: '2025-12-31', basis: 'annual' },
      { value: 3, end: '2024-12-31', basis: 'annual' },
      { value: 2, end: '2023-12-31', basis: 'annual' },
    ],
  }));
  assert.equal(stock.epsNormalizationApplied, true);
  assert.equal(stock.normalizedEpsPerShare, 2);
  near(stock.ddmResearch.matchedEarningsPerShare, 5);
  near(stock.ddmResearch.payoutRatio, .4);
  assert.notEqual(stock.ddmResearch.payoutRatio, base.dividendPerShare / stock.normalizedEpsPerShare);
});

test('missing dividend assumptions do not fall back to revenue growth or native CAPM defaults', () => {
  const sourceBacked = complete({ ddmResearchAssumptions: undefined });
  for (const revenueGrowth of [-25, 0, 50]) {
    const ddm = calculateStock({ ...sourceBacked, revenueGrowth }).ddmResearch;
    assert.equal(ddm.status, 'assumptions-unavailable');
    near(ddm.payoutRatio, .4);
    assert.equal(ddm.growthRateAnnual, null);
    assert.equal(ddm.costOfEquityAnnual, null);
    assert.equal(ddm.fairValue, null);
  }
  const invalid = calculateStock(complete({
    ddmResearchAssumptions: { ...assumptions, growthRateAnnualDecimal: .1 },
  })).ddmResearch;
  assert.equal(invalid.status, 'assumptions-invalid');
  assert.equal(invalid.fairValue, null);
  assert.ok(invalid.issues.some(issue => issue.category === 'assumption'));
});

test('a fixed research dividend is independent of quote and revenue growth across stock fixtures', () => {
  for (const patch of [
    { ticker: 'DIVIDEND-MATURE', market: 'US', sector: 'Industrials', price: 20, revenueGrowth: -10 },
    { ticker: 'DIVIDEND-BANK', market: 'US', sector: 'Commercial Banks', price: 200, revenueGrowth: 30 },
    { ticker: '9001', market: 'TW', sector: '台灣上市公司', price: 1_000, revenueGrowth: 50 },
  ]) {
    const plain = calculateStock({ ...base, ...patch });
    const researched = calculateStock(complete(patch));
    near(researched.ddmResearch.fairValue, 25.5);
    near(researched.ddmResearch.growthRateAnnual, .02);
    assert.equal(researched.ddmResearch.includedInFormalValuation, false);
    assert.deepEqual(formalSnapshot(researched), formalSnapshot(plain));
    assert.deepEqual(valuationRankingState(researched), valuationRankingState(plain));
  }
});
