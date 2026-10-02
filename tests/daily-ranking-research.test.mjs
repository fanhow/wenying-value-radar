import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {calculateStock} from '../lib/valuation.ts';
import {dailyValuationState,valuationRankingState,effectiveValuationConfidence,DAILY_VALUATION_VERSION} from '../lib/daily-valuation-state.ts';
import {currentClientInput,mergeCurrentInputs} from '../lib/daily-client-state.ts';
import {prepareTaiwanRefreshGeneration} from '../lib/daily-refresh-generation.ts';
import {REFRESH_SCHEMA,handleDailyRead} from '../lib/daily-refresh-store.ts';
import {analyzeTechnicalSetup} from '../lib/technical-analysis.ts';

// Synthetic cases exercise fixed disposition rules; none are external targets.
const base={ticker:'CONTROL',name:'Synthetic control',market:'US',sector:'Industrials',price:100,eps:10,bvps:40,
  fcfPerShare:9,revenueGrowth:3,roe:15,debtRatio:30,targetPe:15,targetPb:2,targetFcfMultiple:15,
  uncertainty:.25,dataBasis:'ltm',dataCompleteness:'complete',financialDataDate:'2026-06-30',updatedAt:'2026-10-01',
  priceSource:'Yahoo Finance daily close / daily-refresh-v1',source:'自動資料'};
const status={state:'complete',runId:'ranking_research_fixture',valuationVersion:DAILY_VALUATION_VERSION,taiwanValuationCurrent:true};
function taiwanInputs(quoteDate) {
  const inputs=Array.from({length:20},(_,i)=>({...base,ticker:String(9000+i),market:'TW',industry:'Synthetic disposition devices',
    roe:25,revenueGrowth:10,revenuePerShare:100,ebitPerShare:12,updatedAt:quoteDate,
    financialMetrics:{currency:'TWD',periodBasis:'ltm',sharesOutstanding:100000000,shareBasis:'provider-as-of-ordinary',
      shareAsOfDate:'2026-06-30',shareSourceField:'quarterlyOrdinarySharesNumber',roeBasis:'parent-income-average-equity',
      netIncomePerShare:10,nonControllingBookPerShare:0}}));
  const candles=Array.from({length:80},(_,i)=>({date:new Date(Date.parse(quoteDate)-(79-i)*86400000).toISOString().slice(0,10),open:100,high:101,low:99,close:100,volume:1000000}));
  return prepareTaiwanRefreshGeneration(inputs.map(stock=>({ticker:stock.ticker,market:'TW',status:'ready',stock,issues:[],
    rankingEligible:true,history:{ticker:stock.ticker,market:'TW',candles,technicalAnalysis:analyzeTechnicalSetup(candles,null)}})),status.runId);
}

test('either low native or calibrated confidence excludes all positive and negative research gaps',()=>{
  const calculated=calculateStock(base);
  assert.equal(valuationRankingState(calculated).rankingEligible,true);
  for(const ticker of ['SYNTHA','SYNTHB','SYNTHC','SYNTHD'])for(const native of ['low','medium'])for(const calibrated of ['low','medium'])for(const upside of [-.8,2]) {
    const stock={...calculated,ticker,valuationConfidence:native,calibrationConfidence:calibrated,
      fairValue:100*(1+upside),calibratedFairValue:100*(1+upside),upside,calibratedUpside:upside};
    const before=structuredClone(stock),state=valuationRankingState(stock),low=native==='low'||calibrated==='low';
    assert.equal(state.hasModel,true);assert.equal(state.rankingEligible,!low);assert.equal(state.upside,low?null:upside);
    assert.equal(state.estimatedUpside,upside);assert.equal(state.estimatedCalibratedUpside,upside);
    assert.equal(effectiveValuationConfidence(stock),low?'low':'medium');assert.deepEqual(stock,before);
    if(native==='low')assert.ok(state.issues.includes('LOW_VALUATION_CONFIDENCE'));
    if(calibrated==='low')assert.ok(state.issues.includes('LOW_CALIBRATION_CONFIDENCE'));
  }
});

test('missing models never expose a zero fair value or minus-100-percent estimate',()=>{
  const stock={...calculateStock(base),models:[],fairValue:0,upside:-1,calibratedFairValue:100,calibratedUpside:0};
  const state=valuationRankingState(stock);
  assert.equal(state.hasModel,false);assert.equal(state.rankingEligible,false);assert.equal(state.estimatedFairValue,null);
  assert.equal(state.estimatedUpside,null);assert.equal(state.estimatedCalibratedUpside,null);assert.equal(state.upside,null);
  assert.deepEqual(state.issues,['VALUATION_MODEL_UNAVAILABLE']);
});

test('a genuinely calculated manual TW control can qualify without asserting automatic TW peer inputs are qualified',()=>{
  const manual={...base,ticker:'9998',name:'Synthetic manual Taiwan control',market:'TW',source:'手動輸入',
    priceSource:undefined,valuationPolicy:undefined};
  const before=structuredClone(manual),calculated=calculateStock(manual),state=valuationRankingState(calculated);
  assert.ok(calculated.models.length>=2);assert.notEqual(calculated.valuationConfidence,'low');
  assert.notEqual(calculated.calibrationConfidence,'low');assert.notEqual(calculated.valuationReviewRequired,true);
  assert.equal(state.hasModel,true);assert.equal(state.rankingEligible,true);assert.ok(Number.isFinite(state.upside));
  assert.ok(state.upside>0);assert.deepEqual(state.issues,[]);assert.equal(currentClientInput(manual,null),true);
  assert.deepEqual(manual,before);
  // The positive control is manual/native. It cannot certify a daily TW input
  // lacking the current version, generation and matched peer evidence.
  const unversionedAutomatic={...manual,source:'自動資料',priceSource:'Yahoo Finance daily close / daily-refresh-v1'};
  assert.equal(currentClientInput(unversionedAutomatic,status),false);
  assert.equal(dailyValuationState(unversionedAutomatic,status.runId).rankingEligible,false);
});

test('fixed rules retain current low-confidence TW research across a development and held-out quote date',()=>{
  for(const date of ['2026-09-18','2026-10-01']) {
    const rows=taiwanInputs(date);
    assert.equal(rows.length,20);
    for(const {stock} of rows) {
      const state=dailyValuationState(stock,status.runId);
      assert.equal(state.hasModel,true);assert.equal(state.stock.valuationConfidence,'low');
      assert.equal(state.rankingEligible,false);assert.equal(state.upside,null);
      assert.ok(Number.isFinite(state.estimatedUpside));assert.equal(state.estimatedUpside,state.stock.upside);
      assert.equal(currentClientInput(stock,status),true);assert.deepEqual(mergeCurrentInputs([],[stock],status),[stock]);
      assert.equal(currentClientInput(stock,{...status,runId:'different-generation'}),false);
      assert.equal(dailyValuationState({...stock,dailyValuationVersion:'tw-comparables-2026-09-21-bridge-v1'},status.runId).estimatedUpside,null);
    }
  }
});

test('read-time ranking checks reject cached low-confidence candidates while valuation API returns their research inputs',async()=>{
  const raw=new DatabaseSync(':memory:');for(const sql of REFRESH_SCHEMA)raw.exec(sql);
  const prepare=(sql,args=[])=>({bind:(...a)=>prepare(sql,a),all:async()=>({results:raw.prepare(sql).all(...args)}),first:async()=>raw.prepare(sql).get(...args)??null});
  const db={raw,prepare},rows=taiwanInputs('2026-10-01'),input=rows[0].stock;
  const manifest={valuationVersion:DAILY_VALUATION_VERSION,expectedSessions:{TW:'2026-10-01',US:'2026-10-01'}};
  const summary={total:21,TW:{total:20,ready:20,unavailable:0},US:{total:1,ready:1,unavailable:0}};
  raw.prepare('INSERT INTO daily_refresh_runs(id,started_at,state,manifest,summary) VALUES(?,?,?,?,?)').run(status.runId,new Date().toISOString(),'complete',JSON.stringify(manifest),JSON.stringify(summary));
  raw.prepare('INSERT INTO daily_refresh_head(id,run_id) VALUES(1,?)').run(status.runId);
  const insert=raw.prepare('INSERT INTO daily_refresh_records(run_id,market,ticker,status,stock,history,issues,upside,signals,eligible) VALUES(?,?,?,?,?,?,?,?,?,?)');
  for(const row of rows)insert.run(status.runId,'TW',row.ticker,'ready',JSON.stringify(row.stock),JSON.stringify(row.history),'[]',3,0,1);
  insert.run(status.runId,'US',base.ticker,'ready',JSON.stringify(base),null,'[]',.2,0,1);
  const read=(path,body)=>handleDailyRead(new Request('https://fixture'+path,body?{method:'POST',body:JSON.stringify(body)}:{}),db);
  try {
    const ranked=await (await read('/api/market-scan')).json();assert.deepEqual(ranked.candidates.map(s=>s.ticker),['CONTROL']);
    assert.equal(ranked.overvaluedCandidates.length,0);
    const response=await read('/api/valuation',{ticker:input.ticker,market:'TW'});assert.equal(response.status,200);
    const research=await response.json();assert.deepEqual(research.stock,input);assert.equal(research.researchOnly,true);
    assert.equal(research.rankingEligible,false);assert.equal(research.upside,null);
    assert.equal(research.estimatedUpside,dailyValuationState(input,status.runId).stock.upside);
    assert.ok(research.issues.includes('LOW_VALUATION_CONFIDENCE'));
    const history=await (await read(`/api/price-history?ticker=${input.ticker}&market=TW`)).json();
    assert.equal(history.valuationAvailable,true);assert.equal(history.valuationRankingEligible,false);
    assert.equal(raw.prepare('SELECT upside FROM daily_refresh_records WHERE ticker=?').get(input.ticker).upside,3);
  } finally {raw.close();}
});
