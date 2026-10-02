import test from 'node:test';
import assert from 'node:assert/strict';
import { taiwanTargetApplicabilityIssues, summarizeTaiwanMultiple } from '../lib/taiwan-multiple-applicability.ts';

// Unit profiles isolate classification. They are not real provider evidence.
const profile = {
  financialDate: '2026-06-30', shareBasis: 'provider-as-of-ordinary', financial: false,
  roeBasis: 'parent-income-average-equity', roe: 15, netMargin: .05,
  operatingMargin: .08, minorityBookRatio: 0,
};
const issueFor = (model, patch, code) => taiwanTargetApplicabilityIssues(model, { ...profile, ...patch }).find(issue => issue.code === code);
const observations = values => values.map((value, index) => ({ ticker: String(2000 + index), value, numerator: value, denominator: 1, profile }));

test('PB missing or mismatched ROE evidence is a source-data gap; observed nonpositive ROE is a model assumption limit', () => {
  for (const patch of [{ roe: null }, { roe: NaN }, { roeBasis: 'parent-income-ending-equity' }]) {
    const issue = issueFor('pb', patch, 'PROFITABILITY_BASIS_UNAVAILABLE');
    assert.equal(issue.category, 'source-data');
  }
  for (const roe of [0, -1]) {
    const issue = issueFor('pb', { roe }, 'PROFITABILITY_BASIS_UNAVAILABLE');
    assert.equal(issue.category, 'assumption');
    assert.match(issue.reason, /傳統.*模型適用限制.*非資料來源缺漏/);
  }
});

test('unknown and observed nonpositive operating/parent margins are classified differently without changing rejection', () => {
  for (const [field, code] of [['operatingMargin', 'OPERATING_PROFITABILITY_UNAVAILABLE'], ['netMargin', 'PARENT_PROFITABILITY_UNAVAILABLE']]) {
    assert.equal(issueFor('p-sales', { [field]: null }, code).category, 'source-data');
    for (const value of [0, -.01]) {
      const issue = issueFor('p-sales', { [field]: value }, code);
      assert.equal(issue.category, 'assumption');
      assert.match(issue.reason, /模型適用限制.*非資料來源缺漏/);
    }
  }
});

test('unknown or invalid minority scope is source-data; known material claims fail the direct-sales assumption', () => {
  for (const minorityBookRatio of [null, NaN, -.01]) {
    assert.equal(issueFor('p-sales', { minorityBookRatio }, 'MINORITY_SCOPE_UNVERIFIED').category, 'source-data');
  }
  const issue = issueFor('p-sales', { minorityBookRatio: .250001 }, 'MINORITY_SCOPE_UNVERIFIED');
  assert.equal(issue.category, 'assumption');
  assert.match(issue.reason, /歸屬假設尚不適用.*非資料來源缺漏/);
  assert.equal(issueFor('p-sales', { minorityBookRatio: .25 }, 'MINORITY_SCOPE_UNVERIFIED'), undefined);
});

test('insufficient or dispersed matched peers indicate comparability, while invalid observations indicate data', () => {
  const sparse = summarizeTaiwanMultiple('pb', profile, observations([1, 1.1, 1.2, 1.3]));
  assert.equal(sparse.value, null);
  assert.equal(sparse.issues.find(issue => issue.code === 'INSUFFICIENT_MATCHED_PEERS').category, 'peer-comparability');
  const dispersed = summarizeTaiwanMultiple('pb', profile, observations([1, 1, 1, 10, 10, 10, 10]));
  assert.equal(dispersed.value, null);
  assert.equal(dispersed.issues.find(issue => issue.code === 'PEER_MULTIPLE_DISPERSION').category, 'peer-comparability');
  const malformed = summarizeTaiwanMultiple('pb', profile, [...observations([1, 1.1, 1.2, 1.3, 1.4]), undefined]);
  assert.equal(malformed.value, null);
  assert.equal(malformed.count, 5);
  assert.equal(malformed.issues.find(issue => issue.code === 'INVALID_PEER_OBSERVATION').category, 'source-data');
});
