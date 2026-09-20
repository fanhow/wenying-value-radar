import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {prepareTaiwanRefreshGeneration} from '../lib/daily-refresh-generation.ts';
import {dailyValuationState,DAILY_VALUATION_VERSION} from '../lib/daily-valuation-state.ts';
import {currentClientInput,persistableInputs,withoutDailyInstrument,mergeCurrentInputs} from '../lib/daily-client-state.ts';
import {refreshUploadBatches} from '../scripts/daily-refresh.mjs';
import {handleRefreshWrite,handleDailyRead,validateRecord} from '../lib/daily-refresh-store.ts';
import {analyzeTechnicalSetup} from '../lib/technical-analysis.ts';

// Fully synthetic daily observations; not a market backtest or source evidence.
const date=new Date().toISOString().slice(0,10),runId='generation_test_1';
const secret='fixture-only-000000000000000000000000';
function records(){return Array.from({length:20},(_,i)=>{
  const ticker=String(1000+i),candles=Array.from({length:400},(_,j)=>({date:new Date(Date.parse(date)-(399-j)*86400000).toISOString().slice(0,10),open:100,high:101,low:99,close:100,volume:1000000}));
  const stock={ticker,market:'TW',name:'Synthetic issuer',sector:'Technology',industry:'Synthetic devices',price:100,eps:10,bvps:40,fcfPerShare:8,revenueGrowth:10,roe:25,debtRatio:30,targetPe:15,targetPb:2,targetFcfMultiple:15,uncertainty:.3,financialDataDate:date,updatedAt:date,priceSource:'Yahoo Finance daily close / daily-refresh-v1',source:'自動資料',dataBasis:'ltm',revenuePerShare:100,ebitPerShare:12,ebitdaPerShare:15,cashPerShare:10,debtPerShare:10,financialMetrics:{currency:'TWD',periodBasis:'ltm',sharesOutstanding:100000000,nonControllingBookPerShare:0,netIncomePerShare:10,ebitdaBasis:'operating-income-plus-cashflow-da'}};
  const technicalAnalysis=analyzeTechnicalSetup(candles,null);
  technicalAnalysis.candlestickPattern='morning-star';technicalAnalysis.patternStage='confirmed';
  return {ticker,market:'TW',status:'ready',stock,issues:[],rankingEligible:true,quoteDate:date,financialDate:date,fetchedAt:new Date().toISOString(),sources:['https://example.test/synthetic'],history:{ticker,market:'TW',name:stock.name,quoteSource:stock.priceSource,candles,weeklyCandles:[],monthlyCandles:[],technicalAnalysis}};
});}
const manifest=rows=>({valuationVersion:DAILY_VALUATION_VERSION,targets:rows.map(({ticker,market})=>({ticker,market})),expectedSessions:{TW:date,US:date},universeSource:['synthetic fixture']});
function database(){
  const raw=new DatabaseSync(':memory:');
  const prepare=(sql,args=[])=>({bind:(...a)=>prepare(sql,a),run:async()=>raw.prepare(sql).run(...args),all:async()=>({results:raw.prepare(sql).all(...args)}),first:async()=>raw.prepare(sql).get(...args)??null});
  return {raw,prepare,batch:async statements=>{raw.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());raw.exec('COMMIT');return result;}catch(e){raw.exec('ROLLBACK');throw e;}}};
}
const write=(db,body,id=runId)=>handleRefreshWrite(new Request('https://fixture/api/data-refresh',{method:'POST',headers:{'X-WenYing-Refresh-Key':secret},body:JSON.stringify({runId:id,...body})}),db,secret);
const read=(db,path)=>handleDailyRead(new Request('https://fixture'+path),db);
async function upload(db,rows,id=runId){
  assert.equal((await write(db,{action:'begin',manifest:manifest(rows)},id)).status,200);
  for(const batch of refreshUploadBatches(rows,id))assert.equal((await write(db,{action:'batch',records:batch},id)).status,200);
}

test('complete-cohort peers are order independent, retain 400 bars and pure technical fields',()=>{
  const input=records(),before=structuredClone(input),a=prepareTaiwanRefreshGeneration(input,runId),b=prepareTaiwanRefreshGeneration([...input].reverse(),runId).reverse();
  assert.deepEqual(input,before);assert.deepEqual(a,b);
  for(let i=0;i<a.length;i++){
    assert.equal(a[i].stock.comparableMultiples.peerCount,19);
    assert.equal(a[i].history.candles.length,400);
    assert.deepEqual({...a[i].history.technicalAnalysis,valueTrendResonance:null},before[i].history.technicalAnalysis);
    assert.equal(dailyValuationState(a[i].stock,runId).rankingEligible,true);
  }
  assert.throws(()=>prepareTaiwanRefreshGeneration([...input,input[0]],runId),/DUPLICATE/);
  input[0].stock.updatedAt='2020-01-01';assert.throws(()=>prepareTaiwanRefreshGeneration(input,runId),/MIXED_TAIWAN/);
});

test('no model, review and old provenance never become zero or minus-100-percent rankings',()=>{
  const input=records();input[0].stock.industry='';input[1].stock.financialMetrics.nonControllingBookPerShare=100;
  const rows=prepareTaiwanRefreshGeneration(input,runId);
  assert.equal(dailyValuationState(rows[0].stock,runId).hasModel,false);
  assert.equal(dailyValuationState(rows[1].stock,runId).hasModel,true);
  for(const row of rows.slice(0,2))assert.equal(dailyValuationState(row.stock,runId).upside,null);
  for(const stock of [{...rows[2].stock,dailyRunId:'wrong-run'},{...rows[2].stock,dailyValuationVersion:undefined},{...rows[2].stock,valuationPolicy:undefined}]){
    const state=dailyValuationState(stock,runId);assert.equal(state.stock,null);assert.equal(state.upside,null);
  }
});

test('shared ready/unavailable history validation rejects incomplete and malformed causal data',()=>{
  const rows=prepareTaiwanRefreshGeneration(records(),runId),m=manifest(rows);
  const edits=[r=>r.history.candles=r.history.candles.slice(-59),r=>r.history.candles.push(r.history.candles.at(-1)),r=>r.history.ticker='9999',r=>r.history.market='US',r=>r.history.quoteSource='snapshot',r=>r.history.candles[1].date=r.history.candles[0].date,r=>r.history.candles[0].close=-1];
  for(const edit of edits)for(const ready of [true,false]){
    const r=structuredClone(rows[0]);if(!ready){r.status='unavailable';delete r.stock;r.issues=['TEST'];}
    edit(r);assert.throws(()=>validateRecord(r,m,runId));
  }
  const r=structuredClone(rows[0]);r.stock.price=101;assert.throws(()=>validateRecord(r,m,runId),/PRICE_HISTORY/);
});

test('uploads are bounded by UTF-8 envelope bytes, not character count',()=>{
  const rows=prepareTaiwanRefreshGeneration(records(),runId);
  for(const row of rows)row.issues=['中'.repeat(80000)];
  const batches=refreshUploadBatches(rows,runId);
  assert.equal(batches.flat().length,20);
  assert.ok(batches.every(records=>records.length<=8&&Buffer.byteLength(JSON.stringify({runId,action:'batch',records}))<=1400000));
  assert.throws(()=>refreshUploadBatches([{issues:['中'.repeat(500000)]}],runId),/PAYLOAD_TOO_LARGE/);
});

test('review stocks retain financials and technicals, with SQL NULL upside and no valuation recommendation',async()=>{
  const input=records();input[0].stock.industry='';input[1].stock.financialMetrics.nonControllingBookPerShare=100;
  const rows=prepareTaiwanRefreshGeneration(input,runId),db=database();await upload(db,rows);
  assert.equal((await write(db,{action:'finalize'})).status,200);
  for(const ticker of ['1000','1001']){
    const stored=db.raw.prepare('SELECT * FROM daily_refresh_records WHERE ticker=?').get(ticker);
    assert.equal(stored.status,'ready');assert.equal(stored.eligible,1);assert.equal(stored.upside,null);assert.ok(stored.stock);
    const history=await (await read(db,`/api/price-history?ticker=${ticker}&market=TW`)).json();
    assert.equal(history.valuationAvailable,false);assert.equal(history.candles.length,400);assert.equal(history.technicalAnalysis.valueTrendResonance,null);
    const response=await handleDailyRead(new Request('https://fixture/api/valuation',{method:'POST',body:JSON.stringify({ticker,market:'TW'})}),db);assert.equal(response.status,422);assert.equal((await response.json()).stock,undefined);
  }
  const technical=await (await read(db,'/api/technical-scan')).json();assert.ok(technical.morningStar.some(r=>r.ticker==='1000'&&r.upside===null));
  const ranked=await (await read(db,'/api/market-scan')).json();assert.ok(![...ranked.candidates,...ranked.overvaluedCandidates].some(r=>['1000','1001'].includes(r.ticker)));
  db.raw.close();
});

test('tampered peer medians cannot finalize, and begin cannot replace a run manifest',async()=>{
  const rows=prepareTaiwanRefreshGeneration(records(),runId),db=database();rows[0].stock.comparableMultiples.peMedian*=2;
  await upload(db,rows);
  const result=await (await write(db,{action:'finalize'})).json();assert.equal(result.error,'GENERATION_PEER_EVIDENCE_MISMATCH');
  assert.equal(db.raw.prepare('SELECT * FROM daily_refresh_head').get(),undefined);
  assert.equal((await write(db,{action:'begin',manifest:{...manifest(rows),universeSource:['changed']}})).status,400);
  db.raw.close();
});

test('older completion and newer failed/running attempts cannot delete or replace active head',async()=>{
  const db=database(),input=records(),a=prepareTaiwanRefreshGeneration(input,'generation_old'),b=prepareTaiwanRefreshGeneration(input,'generation_new');
  await upload(db,a,'generation_old');await upload(db,b,'generation_new');
  db.raw.prepare("UPDATE daily_refresh_runs SET started_at='2020-01-01T00:00:00Z' WHERE id='generation_old'").run();
  assert.equal((await write(db,{action:'finalize'},'generation_new')).status,200);
  await write(db,{action:'begin',manifest:manifest(b)},'generation_pending');
  await write(db,{action:'begin',manifest:manifest(b)},'generation_failed');await write(db,{action:'fail'},'generation_failed');
  assert.equal((await write(db,{action:'finalize'},'generation_old')).status,400);
  assert.equal(db.raw.prepare('SELECT run_id FROM daily_refresh_head').get().run_id,'generation_new');
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM daily_refresh_records WHERE run_id='generation_new'").get().n,20);
  assert.equal((await write(db,{action:'finalize'},'generation_new')).status,200);
  db.raw.close();
});

test('an in-flight batch cannot mutate a sealed and published generation',async()=>{
  const db=database(),rows=prepareTaiwanRefreshGeneration(records(),runId);await upload(db,rows);
  const before=db.raw.prepare('SELECT stock,upside FROM daily_refresh_records WHERE ticker=?').get('1000');
  let release,entered;const waiting=new Promise(resolve=>{entered=resolve;});
  const paused={...db,batch:async statements=>{entered();await new Promise(resolve=>{release=resolve;});return db.batch(statements);}};
  const changed=structuredClone(rows[0]);changed.stock.eps=20;
  const late=write(paused,{action:'batch',records:[changed]});await waiting;
  assert.equal((await write(db,{action:'finalize'})).status,200);release();await late;
  assert.deepEqual(db.raw.prepare('SELECT stock,upside FROM daily_refresh_records WHERE ticker=?').get('1000'),before);
  db.raw.close();
});

test('legacy heads keep technical history but never revive old TW fair values',async()=>{
  const rows=prepareTaiwanRefreshGeneration(records(),runId),db=database();await upload(db,rows);await write(db,{action:'finalize'});
  db.raw.prepare('UPDATE daily_refresh_runs SET manifest=?').run(JSON.stringify({...manifest(rows),valuationVersion:undefined}));
  const ranked=await (await read(db,'/api/market-scan')).json();assert.equal(ranked.candidates.length,0);assert.equal(ranked.overvaluedCandidates.length,0);
  const technical=await (await read(db,'/api/technical-scan')).json();assert.ok(technical.morningStar.length);assert.ok(technical.morningStar.every(s=>s.fairValue===null));
  db.raw.close();
});

test('browser persistence preserves manual inputs while rejecting old/changed daily generations',()=>{
  const s=prepareTaiwanRefreshGeneration(records(),runId)[0].stock,manual={...s,source:'手動輸入'},imported={...s,priceSource:'User imported file'};
  const status={state:'partial',runId,valuationVersion:DAILY_VALUATION_VERSION,taiwanValuationCurrent:true};
  assert.deepEqual(persistableInputs([s,manual,imported,null]),[manual,imported]);
  assert.equal(currentClientInput(s,status),true);
  for(const state of [null,{...status,runId:'new-run'},{...status,state:'stale'},{...status,valuationVersion:undefined}])assert.equal(currentClientInput(s,state),false);
  assert.equal(currentClientInput(manual,null),true);
  assert.deepEqual(withoutDailyInstrument([s,manual,imported],s.ticker,s.market),[manual,imported]);
  assert.deepEqual(mergeCurrentInputs([{...s,dailyRunId:'old-run'}],[s],status),[s]);
  assert.deepEqual(mergeCurrentInputs([s],[manual],status),[manual]);
  assert.deepEqual(mergeCurrentInputs([s],[manual,s],status),[manual]);
  assert.deepEqual(mergeCurrentInputs([s,s],[s,s],status),[s]);
  assert.deepEqual(mergeCurrentInputs([],[s,manual,manual],status),[manual]);
});
