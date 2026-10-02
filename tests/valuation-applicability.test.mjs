import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStock,
  valuationModelDispersion,
  VALUATION_MODEL_DISPERSION_REVIEW_THRESHOLD,
} from '../lib/valuation.ts';
import { buildTaiwanComparableMap } from '../lib/taiwan-comparables.ts';

// Synthetic accounting/peer evidence, deliberately independent of the
// externally reviewed stocks and all external fair-value observations.
const stock = (ticker, patch = {}) => ({
  ticker, name: '合成測試公司', market: 'TW', sector: '台灣上市公司', industry: '電子零組件業',
  price: 100, eps: 5, bvps: 40, fcfPerShare: 3, revenuePerShare: 100, ebitPerShare: 8,
  targetPe: 999, targetPb: 999, targetFcfMultiple: 999,
  revenueGrowth: 0, roe: 15, debtRatio: 40, uncertainty: .3,
  dataBasis: 'ltm', dataCompleteness: 'historical',
  updatedAt: '2026-10-01', financialDataDate: '2026-06-30',
  financialMetrics: {
    currency: 'TWD', periodBasis: 'ltm', shareBasis: 'provider-as-of-ordinary',
    shareAsOfDate: '2026-06-30', shareSourceField: 'quarterlyOrdinarySharesNumber',
    roeBasis: 'parent-income-average-equity', growthBasis: 'ttm-yoy',
    sharesOutstanding: 1e8, netIncomePerShare: 5, nonControllingBookPerShare: 0,
  }, ...patch,
});
const group = () => Array.from({ length: 7 }, (_, i) => stock(String(1100 + i)));
const evaluate = (rows) => calculateStock({
  ...rows[0], valuationPolicy: 'tw-comparables-v1',
  comparableMultiples: buildTaiwanComparableMap(rows).get(rows[0].ticker),
});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('35% review threshold uses unrounded weighted deviation, including the display-rounding boundary', () => {
  const displayBoundary = .348649347;
  const below = valuationModelDispersion([
    { value: 100 * (1 - displayBoundary), weight: .5 },
    { value: 100 * (1 + displayBoundary), weight: .5 },
  ]);
  near(below, displayBoundary);
  assert.equal(Math.round(below * 100), 35);
  assert.ok(below < VALUATION_MODEL_DISPERSION_REVIEW_THRESHOLD);
  assert.equal(valuationModelDispersion([{ value: 65, weight: .5 }, { value: 135, weight: .5 }]), .35);
  for (const delta of [-1e-8, 1e-8]) {
    const value = valuationModelDispersion([
      { value: 100 * (1 - (.35 + delta)), weight: .5 },
      { value: 100 * (1 + (.35 + delta)), weight: .5 },
    ]);
    assert.equal(value >= VALUATION_MODEL_DISPERSION_REVIEW_THRESHOLD, delta > 0);
  }
  assert.equal(valuationModelDispersion([]), null);
  assert.equal(valuationModelDispersion([{ value: NaN, weight: 1 }]), null);
});

test('native Taiwan center, model dispersion, PB sample size and calibration remain inspectable and unfitted', () => {
  const rows = group(), result = evaluate(rows);
  assert.deepEqual(result.models.map(model => model.id), ['pe', 'pb', 'p-sales']);
  assert.equal(result.assumptions.comparablePbPeerCount, 6);
  assert.equal(result.valuationIndependentEvidenceCount, 2);
  near(result.modelDispersion, result.models.reduce((sum, model) => sum + Math.abs(model.value - result.fairValue) * model.weight, 0) / result.fairValue);
  near(result.fairValue, result.models.reduce((sum, model) => sum + model.value, 0) / result.models.length);
  assert.equal(result.calibratedFairValue, result.fairValue);
  assert.equal(result.calibrationGap, 0);
  assert.equal(result.calibrationMetadata.sampleSize, 0);
  assert.equal(result.valuationConfidence, 'low');
});

test('null PB from unmatched ROE exposes its model reason while valid PE remains independent', () => {
  const rows = group(); rows[0] = { ...rows[0], roe: 3 };
  const profile = buildTaiwanComparableMap(rows).get(rows[0].ticker), result = evaluate(rows);
  for (const id of ['pb']) {
    const expected = profile.taiwanApplicabilityEvidence.models[id].issues;
    assert.ok(expected.length > 0);
    assert.equal(result.models.some(model => model.id === id), false);
    const excluded = result.excludedModels.find(model => model.id === id);
    for (const issue of expected) {
      assert.ok(excluded.reason.includes(issue.reason));
      assert.ok(result.historicalCautionReasons.some(reason => reason.includes(`MODEL_APPLICABILITY:${id}:${issue.code}`)));
    }
  }
  assert.ok(result.targetPe > 0); assert.equal(result.targetPb, 0);
  assert.ok(result.models.some(model => model.id === 'pe'));
  assert.ok(result.fairValue < 1_000);
});

test('missing target ROE accounting basis preserves explicit applicability exclusions', () => {
  const rows = group();
  rows[0] = { ...rows[0], financialMetrics: { ...rows[0].financialMetrics, roeBasis: 'eps-ending-bvps' } };
  const result = evaluate(rows);
  for (const id of ['pb']) {
    assert.equal(result.models.some(model => model.id === id), false);
    assert.match(result.excludedModels.find(model => model.id === id).reason, /歸母淨利／平均權益/);
  }
  assert.ok(result.models.some(model => model.id === 'pe'));
});

test('PE and margin-matched PS cannot manufacture two independent information groups', () => {
  const rows = group().map((row, i) => i ? { ...row, bvps: 100 / 31 } : row);
  const result = evaluate(rows);
  assert.deepEqual(result.models.map(model => model.id), ['pe', 'p-sales']);
  assert.equal(result.valuationIndependentEvidenceCount, 1);
  assert.equal(result.valuationReviewRequired, true);
});

test('missing applicability evidence abstains and cannot turn zero-model placeholders into target values', () => {
  const rows = group(), profile = buildTaiwanComparableMap(rows).get(rows[0].ticker);
  const unverified = { ...profile };
  delete unverified.taiwanApplicabilityEvidence;
  const result = calculateStock({ ...rows[0], valuationPolicy: 'tw-comparables-v1', comparableMultiples: unverified });
  assert.equal(result.models.length, 0);
  for (const field of ['fairValue', 'rangeLow', 'rangeHigh', 'upside', 'calibratedFairValue', 'calibratedRangeLow', 'calibratedRangeHigh', 'calibratedUpside']) assert.equal(result[field], 0);
  assert.equal(result.modelDispersion, null);
  assert.equal(result.valuationIndependentEvidenceCount, 0);
  assert.equal(result.valuationReviewRequired, true);
  assert.equal(result.valuationConfidence, 'low');
  assert.ok(result.historicalCautionReasons.some(reason => reason.includes('不可估值占位')));
  assert.equal(result.historicalCautionReasons.includes('適用模型結果分歧偏高。'), false);
});

test('own quote and supplied generic targets do not change a validated relative model center', () => {
  const rows = group(), result = evaluate(rows);
  const changed = evaluate(rows.map((row, i) => i ? row : { ...row, price: 1_000, targetPe: 2, targetPb: .1 }));
  assert.equal(changed.fairValue, result.fairValue);
  assert.deepEqual(changed.models, result.models);
  assert.equal(changed.modelDispersion, result.modelDispersion);
  assert.notEqual(changed.upside, result.upside);
});

test('zero-model US and ETF records cannot acquire market-price or historical calibration estimates', () => {
  const base = stock('AAPL', { market: 'US', eps: 0, bvps: 0, fcfPerShare: 0, revenuePerShare: 0, ebitPerShare: 0, targetPe: 0, targetPb: 0, targetFcfMultiple: 0 });
  for (const input of [base, { ...base, assetType: 'ETF' }]) {
    const result = calculateStock(input);
    assert.equal(result.models.length, 0);
    assert.equal(result.fairValue, 0); assert.equal(result.calibratedFairValue, 0);
    assert.equal(result.upside, 0); assert.equal(result.calibratedUpside, 0);
    assert.equal(result.modelDispersion, null);
    assert.equal(result.valuationReviewRequired, true);
    assert.equal(result.valuationConfidence, 'low'); assert.equal(result.calibrationConfidence, 'low');
  }
});
