import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,invalidateSelectionAssessment} from '../scripts/daily-selection-report.mjs';

// Fixed synthetic inputs, not issuer filings or market-price targets.
const now=new Date('2026-10-02T12:00:00Z'),date='2026-10-01';
const stock={ticker:'CONTROL',name:'Source-review control',market:'US',sector:'Industrials',price:100,eps:10,bvps:40,
  fcfPerShare:9,revenueGrowth:3,roe:15,debtRatio:30,targetPe:15,targetPb:2,targetFcfMultiple:15,uncertainty:.25,
  dataBasis:'ltm',dataCompleteness:'complete',financialDataDate:'2026-06-30',updatedAt:date,
  priceSource:'Yahoo Finance daily close / daily-refresh-v1',source:'自動資料'};
const history={candles:[{date,close:100}],freshness:{runId:'source_review_fixture'},
  technicalAnalysis:{asOf:date,valueTrendResonance:{status:'confirmed'}}};

test('source-qualified US report preserves valid research estimates without formally selecting low-confidence stocks',()=>{
  const low={...stock,ticker:'LOWCASE',revenueGrowth:10,roe:25},before=structuredClone(history);
  const result=evaluate(low,history,date,now);
  assert.equal(result.status,'RESEARCH_ONLY');assert.equal(result.rankingEligible,false);assert.equal(result.researchOnly,true);
  assert.ok(result.model.fairValue>0);assert.equal(result.model.upside,null);assert.ok(Number.isFinite(result.model.estimatedUpside));
  assert.equal(result.model.confidence,'low');assert.ok(result.issues.includes('LOW_VALUATION_CONFIDENCE'));
  assert.equal(result.technical.valueTrendResonance,null);assert.deepEqual(history,before);
  assert.equal(result.model.provenance,'LOCAL_CURRENT_MODEL_FROM_API_INPUTS');
});

test('source-qualified US control remains ready for source review with the current ranking gate',()=>{
  const result=evaluate(stock,history,date,now);
  assert.equal(result.status,'READY_FOR_SOURCE_REVIEW');assert.equal(result.rankingEligible,true);assert.equal(result.researchOnly,false);
  assert.ok(Number.isFinite(result.model.upside));assert.ok(result.technical.valueTrendResonance);
  assert.equal(result.latestFilingVerified,false);
});

test('final generation or ranking-date rejection clears a previously qualified value-trend signal',()=>{
  for(const [issue,discardModel] of [['GENERATION_MISMATCH',true],['RANKING_STALE',false],['RANKING_UNCONFIRMED_SESSION',false],['RANKING_UNKNOWN',false]]) {
    const before=structuredClone(history),assessment=evaluate(stock,history,date,now);
    assert.equal(assessment.rankingEligible,true);assert.ok(assessment.technical.valueTrendResonance);
    const originalModel=structuredClone(assessment.model);
    assert.equal(invalidateSelectionAssessment(assessment,issue,discardModel),assessment);
    assert.equal(assessment.rankingEligible,false);assert.equal(assessment.status,'DATA_WARNING');
    assert.equal(assessment.technical.valueTrendResonance,null);assert.ok(assessment.issues.includes(issue));
    if(discardModel){assert.equal(assessment.model,null);assert.equal(assessment.researchOnly,false);}
    else assert.deepEqual(assessment.model,originalModel);
    assert.deepEqual(history,before);
  }
});

test('source report never revives reviewed US earnings, absent models, or stale quotes as selections',()=>{
  for(const ticker of ['VISN','KODK']) {
    const result=evaluate({...stock,ticker},history,date,now);
    assert.equal(result.status,'DATA_WARNING');assert.equal(result.rankingEligible,false);assert.equal(result.model,null);
    assert.ok(result.issues.includes('US_EARNINGS_BASIS_REVIEW_REQUIRED'));assert.equal(result.technical.valueTrendResonance,null);
  }
  const missing=evaluate({...stock,ticker:'NONE',eps:0,bvps:0,fcfPerShare:0},history,date,now);
  assert.equal(missing.rankingEligible,false);assert.equal(missing.model,null);
  assert.ok(missing.issues.includes('VALUATION_MODEL_UNAVAILABLE'));
  const stale=evaluate({...stock,updatedAt:'2026-09-30'},history,date,now);
  assert.equal(stale.status,'DATA_WARNING');assert.equal(stale.rankingEligible,false);assert.equal(stale.model,null);
  assert.ok(stale.issues.includes('QUOTE_STALE'));
});
