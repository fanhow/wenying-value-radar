import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {quarterlyInputs,fetchRefreshRecord} from '../lib/daily-refresh-data.ts';
import {handleRefreshWrite,handleDailyRead,refreshIsCurrent,validateRecord} from '../lib/daily-refresh-store.ts';
import {analyzeTechnicalSetup,detectValueTrendResonance} from '../lib/technical-analysis.ts';
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
function record(t,ready){return {ticker:t.ticker,market:t.market,status:ready?'ready':'unavailable',issues:ready?[]:['CORE_FINANCIAL_FIELDS_MISSING'],fetchedAt:new Date().toISOString(),sources:[],rankingEligible:ready,...(ready?{stock:{...stock,...t},history:{candles:[{date,open:100,high:101,low:99,close:100,volume:1000000}],weeklyCandles:[],monthlyCandles:[],technicalAnalysis:{asOf:date,candlestickPattern:'none'}}}:{})};}
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

function candlesTo(end) {
  return Array.from({length:80},(_,i)=>({date:new Date(Date.parse(end)-(79-i)*86400000).toISOString().slice(0,10),open:100+i,high:102+i,low:99+i,close:101+i,volume:1000000}));
}
function technicalOnly(t) {
  const candles=candlesTo(date),a=analyzeTechnicalSetup(candles,null);
  // Named test fixture for an independent candlestick signal; not market data.
  a.candlestickPattern='morning-star';a.patternStage='confirmed';
  return {...record(t,false),quoteDate:date,rankingEligible:true,history:{...t,name:'Technical fixture',symbol:t.ticker,quoteSource:stock.priceSource,candles,weeklyCandles:[],monthlyCandles:[],technicalAnalysis:a}};
}
test('missing or non-finite fair value never invents a value-trend signal',()=>{
  const candles=candlesTo(date);
  assert.ok(detectValueTrendResonance(candles,.3));
  for(const value of [undefined,null,NaN,Infinity,-Infinity]) {
    assert.equal(detectValueTrendResonance(candles,value),null);
    assert.equal(analyzeTechnicalSetup(candles,value).valueTrendResonance,null);
  }
});
test('financially unavailable stocks retain causal price history and pure technical signals, never valuation',async()=>{
  const db=database(),m=manifest();await post(db,{action:'begin',manifest:m});
  const only=technicalOnly(m.targets[9]);
  const records=m.targets.map(t=>t===m.targets[9]?only:record(t,true));
  assert.equal((await post(db,{action:'batch',records})).status,200);
  assert.equal((await post(db,{action:'finalize'})).status,200);
  const history=await handleDailyRead(new Request(`https://test/api/price-history?ticker=${only.ticker}&market=TW`),db);
  assert.equal(history.status,200);const h=await history.json();assert.equal(h.valuationAvailable,false);assert.equal(h.technicalAnalysis.valueTrendResonance,null);assert.equal(h.candles.length,80);
  const technical=await (await handleDailyRead(new Request('https://test/api/technical-scan'),db)).json();
  const found=technical.morningStar.find(s=>s.ticker===only.ticker);assert.ok(found);assert.equal(found.price,180);assert.equal(found.fairValue,null);assert.equal(found.upside,null);
  assert.ok(!technical.valueTrend.some(s=>s.ticker===only.ticker));
  const ranking=await (await handleDailyRead(new Request('https://test/api/market-scan'),db)).json();
  assert.ok(![...ranking.candidates,...ranking.overvaluedCandidates].some(s=>s.ticker===only.ticker));
  const valuation=await handleDailyRead(new Request('https://test/api/valuation',{method:'POST',body:JSON.stringify({ticker:only.ticker,market:'TW'})}),db);assert.equal(valuation.status,422);
  const stored=await db.prepare('SELECT stock,upside FROM daily_refresh_records WHERE ticker=?').bind(only.ticker).first();assert.equal(stored.stock,null);assert.equal(stored.upside,null);
});
test('technical-only records still reject stale, mismatched, malformed or fabricated value context',()=>{
  const m=manifest(),base=technicalOnly(m.targets[9]);assert.doesNotThrow(()=>validateRecord(base,m));
  const edits=[r=>r.quoteDate='2000-01-01',r=>r.history.market='US',r=>r.history.quoteSource='snapshot',r=>r.history.name='',r=>r.history.candles[1].date=r.history.candles[0].date,r=>r.history.candles[0].close=-1,r=>r.history.technicalAnalysis.valueTrendResonance={status:'confirmed'},r=>r.stock=stock];
  for(const edit of edits){const bad=structuredClone(base);edit(bad);assert.throws(()=>validateRecord(bad,m));}
});
test('bounded technical samples retain both markets without ranking on unavailable valuations',async()=>{
  const db=database(),m=manifest();await post(db,{action:'begin',manifest:m});
  const tw=technicalOnly({ticker:'1000',market:'TW'}),us=technicalOnly({ticker:'ZZZ',market:'US'});
  // Deliberately put more Taiwan symbols before the US symbol lexicographically.
  for(let i=0;i<260;i++)await db.prepare('INSERT INTO daily_refresh_records(run_id,market,ticker,status,history,issues,signals,eligible) VALUES(?,?,?,?,?,?,1,1)').bind('fixture_run_1','TW',String(1000+i),'unavailable',JSON.stringify(tw.history),'["TEST_ONLY"]').run();
  await db.prepare('INSERT INTO daily_refresh_records(run_id,market,ticker,status,history,issues,signals,eligible) VALUES(?,?,?,?,?,?,1,1)').bind('fixture_run_1','US','ZZZ','unavailable',JSON.stringify(us.history),'["TEST_ONLY"]').run();
  await db.prepare("UPDATE daily_refresh_runs SET state='partial',summary='{}' WHERE id=?").bind('fixture_run_1').run();
  await db.prepare('INSERT INTO daily_refresh_head(id,run_id) VALUES(1,?)').bind('fixture_run_1').run();
  const data=await (await handleDailyRead(new Request('https://test/api/technical-scan'),db)).json();
  assert.ok(data.morningStar.some(s=>s.market==='US'&&s.ticker==='ZZZ'));assert.ok(data.morningStar.some(s=>s.market==='TW'));
  assert.ok(data.morningStar.every(s=>s.upside===null&&s.fairValue===null));assert.equal(data.valueTrend.length,0);
});
test('collector retains completed OHLC after finance HTTP errors or per-share reconciliation failure',async()=>{
  const end='2026-09-18',now=new Date('2026-09-20T15:00:00Z'),candles=candlesTo(end);
  const chart={chart:{result:[{meta:{currency:'TWD'},timestamp:candles.map(c=>Date.parse(c.date+'T01:00:00Z')/1000),indicators:{quote:[Object.fromEntries(['open','high','low','close','volume'].map(k=>[k,candles.map(c=>c[k])]))]}}]}};
  const makeSeries=(type,value)=>({meta:{type:[type]},[type]:[{asOfDate:'2026-06-30',periodType:type.startsWith('trailing')?'TTM':'3M',currencyCode:'TWD',reportedValue:{raw:value}}]});
  const financial={timeseries:{result:[makeSeries('quarterlyTotalRevenue',100),...Object.entries({TotalRevenue:400,DilutedEPS:1000,NetIncome:40,OperatingCashFlow:80,CapitalExpenditure:-20}).map(([k,v])=>makeSeries('trailing'+k,v)),...Object.entries({OrdinarySharesNumber:10,StockholdersEquity:200,TotalAssets:400,TotalLiabilitiesNetMinorityInterest:200}).map(([k,v])=>makeSeries('quarterly'+k,v))]}};
  const prior=makeSeries('trailingTotalRevenue',200);prior.trailingTotalRevenue[0].asOfDate='2025-06-30';financial.timeseries.result.push(prior);
  for(const failure of ['http','shares']) {
    const fetcher=async url=>url.includes('/chart/')?Response.json(chart):failure==='http'?new Response('',{status:503}):Response.json(financial);
    const r=await fetchRefreshRecord({ticker:'1000',name:'Test only',sector:'Technology',market:'TW'},end,now,fetcher);
    assert.equal(r.status,'unavailable');assert.match(r.issues[0],failure==='http'?/UPSTREAM_HTTP_503/:/EPS_SHARE_BASIS_RECONCILIATION_REQUIRED/);
    assert.equal(r.stock,undefined);assert.equal(r.history.candles.at(-1).date,end);assert.equal(r.history.technicalAnalysis.valueTrendResonance,null);assert.equal(r.rankingEligible,true);
  }
  const stale=await fetchRefreshRecord({ticker:'1000',name:'Test only',sector:'Technology',market:'TW'},'2026-09-21',now,async()=>Response.json(chart));
  assert.equal(stale.status,'unavailable');assert.equal(stale.history,undefined);
});
