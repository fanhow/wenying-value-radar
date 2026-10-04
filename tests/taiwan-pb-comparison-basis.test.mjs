import test from 'node:test';
import assert from 'node:assert/strict';
import {assessTaiwanPbComparisonBasis,buildUnverifiedTaiwanPbBasisEvidence,PB_BASIS_ACTION_KINDS} from '../lib/taiwan-pb-comparison-basis.ts';

// All observations and source attestations here are synthetic, not audited filings.
const instrument={ticker:'1000',exchange:'TWSE',securityType:'ordinary-share'};
function fixture() {
  const observation={instrument:{...instrument},currency:'TWD',financialPeriodEnd:'2026-06-30',
    equityScope:'parent-ordinary',denominator:'ordinary-outstanding',bookBasisDate:'2026-06-30',
    shareBasisDate:'2026-06-30',quoteBasisDate:'2026-10-02',bookTreatment:'reported-period-end',
    shareTreatment:'period-end',appliedShareActionIds:[],appliedBookActionIds:[],sourceIds:['source']};
  return {instrument:{...instrument},financialPeriodEnd:'2026-06-30',quoteDate:'2026-10-02',
    left:structuredClone(observation),right:structuredClone(observation),sources:[{id:'source',
      url:'https://example.test/synthetic',rawSha256:'a'.repeat(64),retrievedAt:'2026-10-03T00:00:00Z',publishedAt:null}],
    actionCoverage:{instrument:{...instrument},fromDate:'2026-06-30',toDate:'2026-10-02',
      eventKinds:[...PB_BASIS_ACTION_KINDS],sourceIds:['source'],events:[]}};
}
test('matched means supplied comparison basis only; input is not mutated',()=>{
  const input=fixture(),before=JSON.stringify(input),result=assessTaiwanPbComparisonBasis(input);
  assert.equal(result.status,'matched');assert.equal(result.comparisonEligible,true);
  assert.deepEqual(result.reasons,[]);assert.equal(JSON.stringify(input),before);
  assert.equal('fairValue' in result,false);assert.equal('rankingEligible' in result,false);
});
test('provider dates and an empty search do not establish effective basis or no actions',()=>{
  const input=fixture();input.left=buildUnverifiedTaiwanPbBasisEvidence(input);
  input.right=buildUnverifiedTaiwanPbBasisEvidence(input);input.actionCoverage=null;
  const r=assessTaiwanPbComparisonBasis(input);assert.equal(r.status,'unverified');assert.equal(r.comparisonEligible,false);
  assert.ok(r.reasons.includes('UNVERIFIED_EFFECTIVE_BASIS'));assert.ok(r.reasons.includes('MISSING_ACTION_COVERAGE'));
  const incomplete=fixture();incomplete.actionCoverage.eventKinds=['split'];
  assert.ok(assessTaiwanPbComparisonBasis(incomplete).reasons.includes('INCOMPLETE_ACTION_COVERAGE'));
});
test('known contradiction takes precedence over missing event coverage',()=>{
  const input=fixture();input.actionCoverage=null;input.left.shareTreatment='action-reconciled';
  input.left.shareBasisDate='2026-08-24';const r=assessTaiwanPbComparisonBasis(input);
  assert.equal(r.status,'mismatched');assert.ok(r.reasons.includes('BOOK_SHARE_BASIS_MISMATCH'));
});
test('same post-action shares cannot certify pre-cash book or infer recognition from payment',()=>{
  const input=fixture();input.actionCoverage.events=[{id:'cash-reduction',kind:'cash-capital-reduction',
    effectiveDate:'2026-08-24',equityRecognitionDate:null,sourceIds:['source']}];
  for(const e of [input.left,input.right])Object.assign(e,{shareTreatment:'action-reconciled',
    shareBasisDate:'2026-08-24',appliedShareActionIds:['cash-reduction']});
  assert.ok(assessTaiwanPbComparisonBasis(input).reasons.includes('CASH_REDUCTION_BOOK_RECONCILIATION_REQUIRED'));
  for(const e of [input.left,input.right])Object.assign(e,{bookTreatment:'action-reconciled',
    bookBasisDate:'2026-08-31',appliedBookActionIds:['cash-reduction']});
  // Payment-day-looking dates do not replace the missing recognition evidence.
  assert.equal(assessTaiwanPbComparisonBasis(input).status,'unverified');
  input.actionCoverage.events[0].equityRecognitionDate='2026-07-16';
  assert.equal(assessTaiwanPbComparisonBasis(input).status,'matched');
});
test('malformed dates, foreign event identity, sparse arrays and bare booleans fail closed',()=>{
  assert.equal(assessTaiwanPbComparisonBasis(null).status,'invalid');
  for(const change of [i=>{i.quoteDate='2026-09-31';},i=>{i.sources=[,];},i=>{i.actionCoverage=true;},
    i=>{i.left.denominator=true;},i=>{i.actionCoverage.events=[{id:'split',kind:'split',effectiveDate:'2026-08-24',
      equityRecognitionDate:null,sourceIds:['source'],instrument:{...instrument,ticker:'2000'}}];}]) {
    const input=fixture();change(input);assert.equal(assessTaiwanPbComparisonBasis(input).status,'invalid');
  }
});
test('unknown or duplicate source/action references cannot create eligibility',()=>{
  for(const change of [i=>{i.left.sourceIds=['missing'];},i=>{i.sources.push(i.sources[0]);},
    i=>{i.left.appliedShareActionIds=['missing'];},i=>{i.actionCoverage.events=[,];}]) {
    const input=fixture();change(input);assert.equal(assessTaiwanPbComparisonBasis(input).status,'invalid');
  }
  const missing=fixture();missing.left.sourceIds=[];
  assert.ok(assessTaiwanPbComparisonBasis(missing).reasons.includes('MISSING_BASIS_SOURCES'));
});
test('issuance and treasury changes require equity reconciliation, not only new shares',()=>{
  for(const kind of ['equity-issuance','treasury-share-change']) {
    const input=fixture();input.actionCoverage.events=[{id:'action',kind,effectiveDate:'2026-08-24',equityRecognitionDate:null,sourceIds:['source']}];
    for(const e of [input.left,input.right])Object.assign(e,{shareTreatment:'action-reconciled',shareBasisDate:'2026-08-24',appliedShareActionIds:['action']});
    assert.ok(assessTaiwanPbComparisonBasis(input).reasons.includes('EQUITY_ACTION_BOOK_RECONCILIATION_REQUIRED'));
    input.actionCoverage.events[0].equityRecognitionDate='2026-08-24';
    for(const e of [input.left,input.right])Object.assign(e,{bookTreatment:'action-reconciled',bookBasisDate:'2026-08-24',appliedBookActionIds:['action']});
    assert.equal(assessTaiwanPbComparisonBasis(input).status,'matched');
    input.actionCoverage.events[0].equityRecognitionDate='2026-10-03';
    assert.equal(assessTaiwanPbComparisonBasis(input).status,'invalid');
  }
});
test('event types must be declared within their coverage scope',()=>{
  const input=fixture();input.actionCoverage.eventKinds=['split'];
  input.actionCoverage.events=[{id:'cash',kind:'cash-capital-reduction',effectiveDate:'2026-08-24',equityRecognitionDate:null,sourceIds:['source']}];
  assert.equal(assessTaiwanPbComparisonBasis(input).status,'invalid');
});
test('an action effective at the financial cutoff cannot conceal later or unknown equity recognition',()=>{
  for(const kind of ['cash-capital-reduction','equity-issuance','treasury-share-change']) {
    const input=fixture();input.actionCoverage.events=[{id:'cutoff-action',kind,effectiveDate:'2026-06-30',
      equityRecognitionDate:'2026-08-31',sourceIds:['source']}];
    const result=assessTaiwanPbComparisonBasis(input);
    assert.equal(result.status,'unverified');assert.equal(result.comparisonEligible,false);
    assert.ok(result.reasons.includes(kind==='cash-capital-reduction'
      ?'CASH_REDUCTION_BOOK_RECONCILIATION_REQUIRED':'EQUITY_ACTION_BOOK_RECONCILIATION_REQUIRED'));
    input.actionCoverage.events[0].equityRecognitionDate=null;
    assert.ok(assessTaiwanPbComparisonBasis(input).reasons.includes('UNVERIFIED_EQUITY_RECOGNITION_DATE'));
  }
});
