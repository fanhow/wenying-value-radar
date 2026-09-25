import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {REFRESH_SCHEMA,handleDailyRead,handleRefreshWrite} from '../lib/daily-refresh-store.ts';
import {dailyValuationState,DAILY_VALUATION_VERSION} from '../lib/daily-valuation-state.ts';
import {currentClientInput,persistableInputs,mergeCurrentInputs} from '../lib/daily-client-state.ts';
import {screenFeature} from '../lib/rotation-screen.ts';
import {rotationAudit} from '../lib/rotation-audit-store.ts';
import {analyzeTechnicalSetup} from '../lib/technical-analysis.ts';

const date=new Date().toISOString().slice(0,10),runId='us_review_fixture_1';
// Synthetic integration inputs, not issuer financial statements or market bars.
const template={ticker:'VISN',market:'US',name:'Old directory name',sector:'Technology',price:100,eps:10,bvps:40,fcfPerShare:9,cashPerShare:3,debtPerShare:2,revenueGrowth:10,roe:25,debtRatio:30,targetPe:15,targetPb:2,targetFcfMultiple:15,uncertainty:.3,financialDataDate:date,updatedAt:date,priceSource:'Yahoo Finance daily close / daily-refresh-v1',source:'自動資料'};
const candles=Array.from({length:80},(_,i)=>({date:new Date(Date.parse(date)-(79-i)*86400000).toISOString().slice(0,10),open:100,high:102,low:99,close:100,volume:1000000}));
function history(stock){return {ticker:stock.ticker,market:'US',name:stock.name,quoteSource:stock.priceSource,candles,weeklyCandles:[],monthlyCandles:[],technicalAnalysis:{...analyzeTechnicalSetup(candles,null),candlestickPattern:'morning-star',patternStage:'confirmed'}};}
function database(seed=false,reviewedStock=template){
  const raw=new DatabaseSync(':memory:');for(const sql of REFRESH_SCHEMA)raw.exec(sql);
  const prepare=(sql,args=[])=>({bind:(...a)=>prepare(sql,a),run:async()=>raw.prepare(sql).run(...args),all:async()=>({results:raw.prepare(sql).all(...args)}),first:async()=>raw.prepare(sql).get(...args)??null});
  const db={raw,prepare,batch:async statements=>{raw.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());raw.exec('COMMIT');return results;}catch(e){raw.exec('ROLLBACK');throw e;}}};
  if(seed){
    const manifest={valuationVersion:DAILY_VALUATION_VERSION,expectedSessions:{TW:date,US:date}},summary={total:11,TW:{total:0,ready:0,unavailable:0},US:{total:11,ready:11,unavailable:0}};
    raw.prepare('INSERT INTO daily_refresh_runs(id,started_at,completed_at,state,manifest,summary) VALUES(?,?,?,?,?,?)').run(runId,new Date().toISOString(),new Date().toISOString(),'complete',JSON.stringify(manifest),JSON.stringify(summary));
    raw.prepare('INSERT INTO daily_refresh_head(id,run_id) VALUES(1,?)').run(runId);
    for(const ticker of [reviewedStock.ticker,...Array.from({length:10},(_,i)=>`T${i}`)]){
      const stock={...reviewedStock,ticker};
      raw.prepare('INSERT INTO daily_refresh_records(run_id,market,ticker,status,stock,history,issues,upside,signals,eligible) VALUES(?,?,?,?,?,?,?,?,?,?)').run(runId,'US',ticker,'ready',JSON.stringify(stock),JSON.stringify(history(stock)),'[]',ticker===reviewedStock.ticker?30:.2,1,1);
    }
  }
  return db;
}
const read=(db,path,body)=>handleDailyRead(new Request('https://fixture'+path,body?{method:'POST',body:JSON.stringify(body)}:{}),db);

for(const reviewed of [
  {ticker:'VISN',issuerName:'Vistance Networks, Inc.',issuerCik:'1517228',basis:'earnings'},
  {ticker:'KODK',issuerName:'Eastman Kodak Company',issuerCik:'31235',basis:'cash-flow'},
]){
const base={...template,ticker:reviewed.ticker};
test(`${base.ticker} review disposition withholds calculated values without mutating raw financials`,()=>{
  const input=structuredClone(base),before=JSON.stringify(input),state=dailyValuationState(input,runId);
  assert.equal(state.stock,null);assert.equal(state.hasModel,false);assert.equal(state.rankingEligible,false);assert.equal(state.upside,null);
  assert.deepEqual(state.issues,['US_EARNINGS_BASIS_REVIEW_REQUIRED']);assert.equal(state.review.issuerCik,reviewed.issuerCik);assert.equal(state.review.basis,reviewed.basis);assert.equal(JSON.stringify(input),before);
  assert.ok(dailyValuationState({...base,ticker:'CONTROL'},runId).stock);
});
test(`${base.ticker} legacy US automatic inputs cannot revive reviewed values; manual and archives remain intact`,()=>{
  const status={state:'partial'};
  for(const automatic of [base,{...base,priceSource:'SEC'},{...base,source:undefined,priceSource:undefined,financialDataDate:undefined}]){
    assert.equal(currentClientInput(automatic,status),false);
    assert.equal(mergeCurrentInputs([automatic],[automatic],status).length,0);
  }
  const legacy={...base,priceSource:'SEC'};assert.deepEqual(persistableInputs([legacy]),[legacy]);
  for(const source of ['手動輸入','方舟截圖']){
    const owned={...base,source};assert.equal(currentClientInput(owned,null),true);assert.deepEqual(persistableInputs([owned]),[owned]);
  }
  assert.equal(currentClientInput({...legacy,ticker:'CONTROL'},null),true);
});
test(`${base.ticker} review is independent of the valuation engine in the four-factor screen`,()=>{
  const data={stock:base,eligible:true,bars:80,close21:95,close63:90};
  assert.equal(screenFeature(data),null);assert.ok(screenFeature({...data,stock:{...base,ticker:'CONTROL'}}));
});
test(`${base.ticker} read-time review blocks old stored upside and API values while preserving OHLC and pure technicals`,async()=>{
  const db=database(true,base);
  try{
    const valuation=await read(db,'/api/valuation',{ticker:base.ticker,market:'US'});assert.equal(valuation.status,422);
    const v=await valuation.json();assert.deepEqual(v.issues,['US_EARNINGS_BASIS_REVIEW_REQUIRED']);assert.ok(v.earningsReview.sourceUrls.length);assert.equal(v.earningsReview.basis,reviewed.basis);assert.equal(v.stock,undefined);
    const historyResponse=await read(db,`/api/price-history?ticker=${base.ticker}&market=US`);assert.equal(historyResponse.status,200);
    const h=await historyResponse.json();assert.deepEqual(h.candles,candles);assert.equal(h.valuationAvailable,false);assert.equal(h.technicalAnalysis.valueTrendResonance,null);assert.equal(h.name,reviewed.issuerName);
    const scan=await (await read(db,'/api/market-scan')).json();assert.equal(scan.candidates.length,10);assert.ok(!scan.candidates.some(s=>s.ticker===base.ticker));
    const tech=await (await read(db,'/api/technical-scan')).json();const signal=tech.morningStar.find(s=>s.ticker===base.ticker);assert.ok(signal);assert.equal(signal.upside,null);assert.equal(signal.fairValue,null);assert.ok(!tech.valueTrend.some(s=>s.ticker===base.ticker));
    const rotation=await rotationAudit(db,runId,'US');assert.equal(rotation.top10.length,10);assert.equal(rotation.screen.eligible,10);assert.ok(!rotation.top10.some(s=>s.ticker===base.ticker));assert.ok(!rotation.screen.candidates.some(s=>s.ticker===base.ticker));
    const stored=db.raw.prepare('SELECT stock,upside,eligible FROM daily_refresh_records WHERE ticker=?').get(base.ticker);assert.deepEqual(JSON.parse(stored.stock),base);assert.equal(stored.upside,30);assert.equal(stored.eligible,1);
    assert.equal(scan.freshness.usEarningsReviewVersion,'us-earnings-review-2026-09-25-v2');assert.equal(scan.freshness.usEarningsReviewCoverage,'source-reviewed-cases-only');
  }finally{db.raw.close();}
});
test(`${base.ticker} new daily writes persist raw ready inputs and liquidity but no reviewed upside`,async()=>{
  const db=database(),secret='fixture-only-us-review-000000000000000000';
  const targets=Array.from({length:20},(_,i)=>({ticker:i===0?base.ticker:`C${i}`,market:'US'}));
  const manifest={valuationVersion:DAILY_VALUATION_VERSION,expectedSessions:{TW:date,US:date},universeSource:['synthetic-test-only'],targets};
  const post=body=>handleRefreshWrite(new Request('https://fixture/api/data-refresh',{method:'POST',headers:{'X-WenYing-Refresh-Key':secret},body:JSON.stringify({runId,...body})}),db,secret);
  try{
    assert.equal((await post({action:'begin',manifest})).status,200);
    const records=targets.map(t=>{const stock={...base,...t};return {...t,status:'ready',issues:[],fetchedAt:new Date().toISOString(),sources:[],quoteDate:date,financialDate:date,rankingEligible:true,stock,history:history(stock)};});
    assert.equal((await post({action:'batch',records})).status,200);
    const result=await post({action:'finalize'});assert.equal(result.status,200);const summary=await result.json();assert.equal(summary.coverage.US.ready,20);
    const row=db.raw.prepare('SELECT * FROM daily_refresh_records WHERE ticker=?').get(base.ticker);assert.equal(row.status,'ready');assert.equal(row.eligible,1);assert.equal(row.upside,null);assert.deepEqual(JSON.parse(row.stock),base);assert.equal(JSON.parse(row.history).candles.length,80);assert.deepEqual(JSON.parse(row.issues),['US_EARNINGS_BASIS_REVIEW_REQUIRED']);
  }finally{db.raw.close();}
});
test(`${base.ticker} read-time review also removes negative stored upside without rewriting inputs`,async()=>{
  const db=database(true,base);
  try{
    db.raw.prepare('UPDATE daily_refresh_records SET upside=? WHERE ticker=?').run(-30,base.ticker);
    db.raw.prepare('UPDATE daily_refresh_records SET upside=? WHERE ticker=?').run(-.2,'T0');
    const before=db.raw.prepare('SELECT stock,upside,eligible FROM daily_refresh_records WHERE ticker=?').get(base.ticker);
    const scan=await (await read(db,'/api/market-scan')).json();
    assert.equal(scan.candidates.length,9);assert.deepEqual(scan.overvaluedCandidates.map(s=>s.ticker),['T0']);
    assert.ok(![...scan.candidates,...scan.overvaluedCandidates].some(s=>s.ticker===base.ticker));
    assert.deepEqual(db.raw.prepare('SELECT stock,upside,eligible FROM daily_refresh_records WHERE ticker=?').get(base.ticker),before);
    assert.deepEqual(JSON.parse(before.stock),base);
  }finally{db.raw.close();}
});
}
