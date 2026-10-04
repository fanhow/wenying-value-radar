import test from 'node:test';
import assert from 'node:assert/strict';
import {TAIWAN_SHARE_BASIS_REVIEW_CASES,TAIWAN_SHARE_BASIS_REVIEW_VERSION,evaluateTaiwanShareBasisReview,getTaiwanShareBasisReview} from '../lib/taiwan-share-basis-review.ts';
import {calculateStock} from '../lib/valuation.ts';
import {dailyValuationState} from '../lib/daily-valuation-state.ts';
import {screenFeature} from '../lib/rotation-screen.ts';
const original=TAIWAN_SHARE_BASIS_REVIEW_CASES[0];
const input={ticker:'6949',market:'TW',name:'synthetic',sector:'Technology',price:100,eps:10,bvps:40,fcfPerShare:9,targetPe:15,targetPb:2,targetFcfMultiple:15,revenueGrowth:10,roe:25,debtRatio:30,uncertainty:.3,source:'自動資料'};
const clear={action:'clear-review',caseId:original.caseId,ticker:original.ticker,listingBoard:original.listingBoard,reviewedOn:'2026-10-03',reasonZh:'Code-reviewed full per-share bridge',bridge:'price-and-all-per-share-inputs',sources:original.sources};
test('review identifies canonical/provider aliases without guessing non-covered coverage',()=>{
  for(const ticker of ['6949','6949.TW','6949.TWO',' 6949.tw '])assert.equal(getTaiwanShareBasisReview({market:'TW',ticker}).caseId,original.caseId);
  assert.equal(getTaiwanShareBasisReview({market:'US',ticker:'6949'}),null);
  assert.equal(getTaiwanShareBasisReview({market:'TW',ticker:'6948'}),null);
  assert.equal(getTaiwanShareBasisReview(input).coverage,'source-reviewed-cases-only');
  assert.equal(getTaiwanShareBasisReview(input).reviewVersion,TAIWAN_SHARE_BASIS_REVIEW_VERSION);
});
test('new quote/financial dates and incoming full-share bridge never clear a source case',()=>{
  const forged={...input,updatedAt:'2035-12-31',financialDataDate:'2035-12-31',resolution:clear,shareBasisReview:null,reviewRequired:false,financialMetrics:{sharesOutstanding:1311601000,shareBasis:'period-end-ordinary',validatedBridge:true}};
  assert.equal(getTaiwanShareBasisReview(forged).caseId,original.caseId);
  assert.deepEqual(calculateStock(forged).models,[]);
});
test('a trusted resolved ledger requires same issuer, board, case, full per-share bridge and dated source hashes',()=>{
  const resolved={...original,disposition:'resolved',resolution:clear};
  assert.equal(evaluateTaiwanShareBasisReview(input,[resolved]),null);
  for(const patch of [{caseId:'another'},{ticker:'1234'},{listingBoard:'TPEX'},{bridge:'book-only'},{reviewedOn:'2026-10-01'},{sources:[]},{sources:[{...original.sources[0],sha256:'bad'}]},{sources:[{...original.sources[0],publicationDate:'2030-01-01'}]}]){
    assert.ok(evaluateTaiwanShareBasisReview(input,[{...resolved,resolution:{...clear,...patch}}]));
  }
  assert.ok(evaluateTaiwanShareBasisReview(input,[{...original,disposition:'resolved'}]));
  assert.ok(evaluateTaiwanShareBasisReview(input,[resolved,original]));
});
test('manual and ARK re-entry is reversible but cannot masquerade as a server daily or financial factor clearance',()=>{
  const reviewed=calculateStock(input);
  for(const source of ['手動輸入','方舟截圖']){
    const manual={...reviewed,source};
    assert.equal(getTaiwanShareBasisReview(manual),null);
    const value=calculateStock(manual);assert.ok(value.models.length);assert.equal(value.shareBasisReview,undefined);
    assert.equal(dailyValuationState(manual).hasModel,false);
    assert.equal(dailyValuationState(manual).shareBasisReview.caseId,original.caseId);
    assert.equal(screenFeature({stock:manual,bars:80,close21:95,close63:90,eligible:true}),null);
  }
});
test('code-owned source evidence is immutable and exposes no adjusted targets',()=>{
  assert.ok(Object.isFrozen(TAIWAN_SHARE_BASIS_REVIEW_CASES)&&Object.isFrozen(original)&&Object.isFrozen(original.sources));
  const review=getTaiwanShareBasisReview(input);assert.ok(Object.isFrozen(review)&&Object.isFrozen(review.sources));
  assert.equal(review.fairValue,undefined);assert.equal(review.adjustedEps,undefined);assert.equal(review.adjustedBvps,undefined);
});
