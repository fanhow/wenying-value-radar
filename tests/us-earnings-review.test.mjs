import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getUsEarningsReview, evaluateUsEarningsReview, US_EARNINGS_REVIEW_CASES,
  US_EARNINGS_REVIEW_ISSUE, US_EARNINGS_REVIEW_VERSION,
} from '../lib/us-earnings-review.ts';

const input = {market:'US',ticker:'VISN'};
const knownCase = US_EARNINGS_REVIEW_CASES[0];
// Synthetic future registry revision, not actual clearance of the real case.
const clearedFixture = () => ({...knownCase,disposition:'resolved',resolution:{
  action:'clear-review',caseId:knownCase.caseId,issuerCik:knownCase.issuerCik,
  reviewedOn:'2026-09-26',reasonZh:'合成測試：已核對一致的持續營運基礎；不是實際解除。',
  sources:[{url:'https://example.test/synthetic-review',publicationDate:'2026-09-26',descriptionZh:'合成 resolution source，非真實申報。'}],
}});

test('known US case exposes canonical identity, specific issue and recorded primary sources',()=>{
  const review=getUsEarningsReview(input);
  assert.equal(review.issue,US_EARNINGS_REVIEW_ISSUE);
  assert.equal(review.issuerName,'Vistance Networks, Inc.');
  assert.equal(review.issuerCik,'1517228');
  assert.equal(review.eventDate,'2026-01-09');
  assert.equal(review.reportedPeriodEnd,'2026-06-30');
  assert.equal(review.reviewVersion,US_EARNINGS_REVIEW_VERSION);
  assert.match(review.reasonZh,/人工核證/);
  assert.match(review.reasonZh,/保留原始 EPS/);
  assert.equal(review.sourceUrls.length,5);
  assert.equal(review.sources.find(s=>s.url.endsWith('/R2.htm')).publicationDate,null);
  assert.equal(review.sources.find(s=>s.url.endsWith('second-quarter-2026-results/')).publicationDate,'2026-08-06');
  assert.equal(review.sources.find(s=>s.url.endsWith('connectivity-and-cable-solutions')).publicationDate,'2026-01-12');
});

test('matching is limited to the reviewed US symbol, not other market/name/legacy alias',()=>{
  assert.ok(getUsEarningsReview({market:'US',ticker:' visn '}));
  for(const row of [null,undefined,{market:'TW',ticker:'VISN'},{market:'US',ticker:'COMM'},
    {market:'US',ticker:'AAPL',name:'Vistance Networks, Inc.'},{market:'US',ticker:'VISN.TW'},
    {market:'US',ticker:null},{market:'US',ticker:{}},{market:'US',ticker:''}]) {
    assert.equal(getUsEarningsReview(row),null);
  }
  assert.ok(getUsEarningsReview({...input,name:'Visionary Holdings Inc'}));
});

test('unknown/old/new financial or quote dates and refresh cannot clear an unresolved review',()=>{
  for(const date of [undefined,null,'','invalid','2026-02-30',123,'2020-01-01','2026-06-30','2035-12-31']) {
    assert.deepEqual(getUsEarningsReview({...input,financialDataDate:date,updatedAt:date,
      refreshedAt:date,dailyRunId:String(date)}),getUsEarningsReview(input));
  }
});

test('input cannot assert clearance and the helper leaves all raw financial values untouched',()=>{
  const raw={...input,name:'Visionary Holdings Inc',eps:31.42,ebitPerShare:0.28864,fcfPerShare:0.37775,
    fairValue:999,source:'自動資料',earningsQualityEvidence:{disposition:'resolved'},
    valuationReviewRequired:false,financialMetrics:{netIncomePerShare:31.6},resolution:clearedFixture().resolution};
  const before=structuredClone(raw);
  Object.freeze(raw.financialMetrics);Object.freeze(raw);
  const review=getUsEarningsReview(raw);
  assert.ok(review);assert.deepEqual(raw,before);
  assert.equal(Object.hasOwn(review,'eps'),false);assert.equal(Object.hasOwn(review,'fairValue'),false);
});

test('manual and ARK exceptions are deliberately caller-owned, not inferred here',()=>{
  for(const source of ['手動輸入','方舟截圖','自動資料',undefined]) {
    assert.ok(getUsEarningsReview({...input,source}));
  }
});

test('shared registry and returned source data cannot be mutated by a consumer',()=>{
  const first=getUsEarningsReview(input);
  assert.throws(()=>{first.sourceUrls.push('https://example.test/changed');},TypeError);
  assert.throws(()=>{first.sources[0].publicationDate='2000-01-01';},TypeError);
  assert.throws(()=>{US_EARNINGS_REVIEW_CASES[0].disposition='resolved';},TypeError);
  assert.throws(()=>{US_EARNINGS_REVIEW_CASES[0].sources[0].url='https://example.test/changed';},TypeError);
  assert.deepEqual(getUsEarningsReview(input),first);
});

test('explicit source-backed same-case resolution can clear only the supplied registry revision',()=>{
  const resolved=clearedFixture(),before=structuredClone(resolved);
  assert.equal(evaluateUsEarningsReview(input,[resolved]),null);
  assert.deepEqual(resolved,before);
  assert.ok(getUsEarningsReview(input),'production case remains unresolved');
});

test('a resolved label alone, wrong identity, invalid dates or unknown resolution evidence fails closed',()=>{
  const invalid=[
    {...knownCase,disposition:'resolved'},
    {...clearedFixture(),resolution:null},
    ...[
      {action:'clear'}, {caseId:'another-case'}, {issuerCik:'1'},
      {reviewedOn:'2026-02-30'}, {reviewedOn:'2026-09-24'}, {reviewedOn:null},
      {reasonZh:' '}, {sources:[]}, {sources:null},
      {sources:[{url:'https://example.test/unknown',publicationDate:null,descriptionZh:'unknown date'}]},
      {sources:[{url:'https://example.test/future',publicationDate:'2026-09-27',descriptionZh:'after review'}]},
      {sources:[{url:'javascript:alert(1)',publicationDate:'2026-09-26',descriptionZh:'bad URL'}]},
      {sources:[{url:'https://user:password@example.test/',publicationDate:'2026-09-26',descriptionZh:'credentials'}]},
    ].map(fields=>({...clearedFixture(),resolution:{...clearedFixture().resolution,...fields}})),
  ];
  for(const review of invalid)assert.equal(evaluateUsEarningsReview(input,[review]).issue,US_EARNINGS_REVIEW_ISSUE);
});

test('an unresolved duplicate cannot be suppressed by resolved entry order',()=>{
  const resolved=clearedFixture();
  assert.deepEqual(evaluateUsEarningsReview(input,[resolved,knownCase]),evaluateUsEarningsReview(input,[knownCase,resolved]));
  assert.equal(evaluateUsEarningsReview(input,[resolved,knownCase]).issue,US_EARNINGS_REVIEW_ISSUE);
});
