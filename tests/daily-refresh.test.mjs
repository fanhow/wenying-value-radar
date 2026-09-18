import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {quarterlyInputs} from '../lib/daily-refresh-data.ts';
import {handleRefreshWrite,handleDailyRead,refreshIsCurrent} from '../lib/daily-refresh-store.ts';
import {calculateStock} from '../lib/valuation.ts';
import {latestCalendarSession,parseNyseHolidays} from '../lib/refresh-calendar.ts';
const secret='test-only-credential-00000000000000000000';
function database() {
  const raw=new DatabaseSync(':memory:');
  const prepare=(sql,args=[])=>({bind:(...a)=>prepare(sql,a),run:async()=>raw.prepare(sql).run(...args),all:async()=>({results:raw.prepare(sql).all(...args)}),first:async()=>raw.prepare(sql).get(...args)??null});
  return {prepare,batch:async statements=>{raw.exec('BEGIN');try {const r=[];for(const s of statements)r.push(await s.run());raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}}};
}
const date=new Date().toISOString().slice(0,10);
const stock={ticker:'2330',market:'TW',name:'Fixture',sector:'Technology',price:100,eps:10,bvps:40,fcfPerShare:9,revenueGrowth:10,roe:25,debtRatio:30,targetPe:15,targetPb:2,targetFcfMultiple:15,uncertainty:0.3,financialDataDate:date,updatedAt:date,priceSource:'Yahoo Finance daily close / daily-refresh-v1'};
function manifest(){return {expectedSessions:{TW:date,US:date},universeSource:['fixture'],targets:['TW','US'].flatMap(market=>Array.from({length:10},(_,i)=>({market,ticker:market==='TW'?String(1000+i):`T${i}`})))};}
function record(t,ready){return {ticker:t.ticker,market:t.market,status:ready?'ready':'unavailable',issues:ready?[]:['CORE_FINANCIAL_FIELDS_MISSING'],fetchedAt:new Date().toISOString(),sources:[],rankingEligible:true,...(ready?{stock:{...stock,...t},history:{candles:[{date,open:100,high:101,low:99,close:100,volume:1000000}],weeklyCandles:[],monthlyCandles:[],technicalAnalysis:{asOf:date,candlestickPattern:'none'}}}:{})};}
const post=(db,body,key=secret)=>handleRefreshWrite(new Request('https://test/api/data-refresh',{method:'POST',headers:{'X-WenYing-Refresh-Key':key},body:JSON.stringify({runId:'fixture_run_1',...body})}),db,secret);
test('private write rejects absent and incorrect credentials',async()=>{
  assert.equal((await post(database(),{action:'begin'},'')).status,401);
  assert.equal((await post(database(),{action:'begin'},'incorrect-key-000000000000000000000')).status,401);
});
test('missing batches never publish; complete accounting publishes only usable records',async()=>{
  const db=database(),m=manifest();
  assert.equal((await post(db,{action:'begin',manifest:m})).status,200);
  await post(db,{action:'batch',records:m.targets.slice(0,10).map((t,i)=>record(t,i<3))});
  assert.equal((await post(db,{action:'finalize'})).status,400);
  assert.equal((await handleDailyRead(new Request('https://test/api/market-scan'),db)).status,503);
  await post(db,{action:'batch',records:m.targets.slice(10).map((t,i)=>record(t,i<3))});
  const done=await (await post(db,{action:'finalize'})).json();assert.equal(done.state,'partial');assert.equal(done.coverage.TW.ready,3);
  const bad=await handleDailyRead(new Request('https://test/api/valuation',{method:'POST',body:JSON.stringify({ticker:'1009',market:'TW'})}),db);
  assert.equal(bad.status,422);assert.match((await bad.json()).error,/未使用舊估值/);
  const fresh=await (await handleDailyRead(new Request('https://test/api/valuation',{method:'POST',body:JSON.stringify({ticker:'1000',market:'TW'})}),db)).json();assert.equal(fresh.cache,'daily-refresh');
  await db.prepare("UPDATE daily_refresh_runs SET started_at='2020-01-01T00:00:00Z'").run();
  assert.equal((await handleDailyRead(new Request('https://test/api/market-scan'),db)).status,503);
});
test('foreign target and wrong quote date cannot enter a generation',async()=>{
  const db=database(),m=manifest();await post(db,{action:'begin',manifest:m});
  const bad=record(m.targets[0],true);bad.stock.updatedAt='2020-01-01';
  assert.equal((await post(db,{action:'batch',records:[bad]})).status,400);
  assert.equal((await post(db,{action:'batch',records:[record({ticker:'EVIL',market:'US'},true)]})).status,400);
});
test('Taipei 08:00 freshness boundary rejects yesterday even on a weekend',()=>{
  assert.equal(refreshIsCurrent('2026-09-18T22:30:00Z',new Date('2026-09-19T00:00:00Z')),true);
  assert.equal(refreshIsCurrent('2026-09-17T22:30:00Z',new Date('2026-09-19T00:00:00Z')),false);
  assert.equal(refreshIsCurrent('2026-09-17T22:30:00Z',new Date('2026-09-18T23:00:00Z')),true);
});
test('financial parser rejects incomplete quarter histories',()=>{
  assert.throws(()=>quarterlyInputs({timeseries:{result:[]}},'USD'),/FOUR_QUARTERS/);
});
test('holiday and DST-aware session checks retain the previous completed market day',()=>{
  assert.equal(latestCalendarSession('TW',new Date('2026-09-29T00:00:00Z'),['2026-09-25','2026-09-28']),'2026-09-24');
  assert.equal(latestCalendarSession('US',new Date('2026-09-08T00:00:00Z'),['2026-09-07']),'2026-09-04');
  assert.equal(latestCalendarSession('US',new Date('2026-12-02T00:00:00Z'),[]),'2026-12-01');
  assert.throws(()=>parseNyseHolidays('<html>temporary failure</html>',2026),/UNAVAILABLE/);
});
test('daily recalculation responds to changed inputs instead of historical fixed target',()=>{
  const base={...stock,ticker:'2890'};
  const first=calculateStock(base),second=calculateStock({...base,eps:20,bvps:80,fcfPerShare:18});
  assert.notEqual(first.calibratedFairValue,second.calibratedFairValue);
  const historical=calculateStock({...base,priceSource:'old'}),historicalChanged=calculateStock({...base,priceSource:'old',eps:20});
  assert.equal(historical.calibratedFairValue,historicalChanged.calibratedFairValue);
});
