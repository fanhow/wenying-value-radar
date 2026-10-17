import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expectedSession} from '../lib/daily-refresh-data.ts';
import {runDailyRefresh,verifySessionPreflight} from '../scripts/daily-refresh.mjs';
import {observedPayloads,observedSpy5d,currentObservationClock,completeSyntheticSpy,syntheticChart,sources} from './fixtures/session-preflight/fixtures.mjs';
const now=()=>new Date(currentObservationClock),primary='https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=1mo',secondary='https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=5d';
const field=(p,k)=>p.chart.result[0].indicators.quote[0][k],last=p=>p.chart.result[0].timestamp.length-1;
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail('NO_REAL_NETWORK');test.after(()=>globalThis.fetch=originalFetch);
function fixture(overrides={}){return sources({...observedPayloads,'SPY-5d':observedSpy5d,...overrides});}
async function fail(f,code){let caught;try{await expectedSession('US',now(),f.fetcher);}catch(e){caught=e;}assert.ok(caught);assert.equal(caught.message,code);return caught;}
const chartRequests=f=>f.calls.filter(c=>c.url.includes('/chart/'));

test('real observed5d raw text equals JSON fixture and actual secondary returns its complete original row',async()=>{
 assert.deepEqual(JSON.parse(readFileSync(new URL('./fixtures/session-preflight/SPY-5d-visible-json.txt',import.meta.url),'utf8')),observedSpy5d);
 const before=JSON.stringify({observedPayloads,observedSpy5d}),f=fixture(),r=await expectedSession('US',now(),f.fetcher);
 assert.deepEqual(r,{date:'2026-10-16',source:secondary,calendarSource:'https://www.nyse.com/trade/hours-calendars',basis:'official exchange holiday calendar checked against completed benchmark OHLC; mismatch fails closed'});
 assert.deepEqual(chartRequests(f).map(c=>c.url),[primary,secondary]);assert.equal(f.calls.length,3);
 assert.equal(JSON.stringify({observedPayloads,observedSpy5d}),before);assert.notEqual(observedSpy5d.chart.result[0].meta.regularMarketDayHigh,field(observedSpy5d,'high')[4]);
});

test('valid primary keeps exact original success contract and never requests the available secondary',async()=>{
 const f=fixture({SPY:completeSyntheticSpy(),'SPY-5d':new Error('MUST_NOT_REQUEST')});
 assert.deepEqual(await expectedSession('US',now(),f.fetcher),{date:'2026-10-16',source:primary,calendarSource:'https://www.nyse.com/trade/hours-calendars',basis:'official exchange holiday calendar checked against completed benchmark OHLC; mismatch fails closed'});
 assert.deepEqual(chartRequests(f).map(c=>c.url),[primary]);assert.equal(f.calls.length,2);
});

test('complete but inconsistent primary OHLC permits one independent legal same-SPY secondary',async()=>{
 const p=structuredClone(observedPayloads.SPY);field(p,'close')[last(p)]=763.25;
 const f=fixture({SPY:p});assert.equal((await expectedSession('US',now(),f.fetcher)).source,secondary);assert.equal(chartRequests(f).length,2);
});

test('primary access, provider, identity, currency, timestamp and absent expected-date failures never request5d',async()=>{
 const cases=[];
 for(const status of [401,403,429,500])cases.push([new Response('private upstream',{status}),`UPSTREAM_HTTP_${status}`]);
 cases.push([{chart:{error:{description:'DO_NOT_LOG'}}},'REFERENCE_PROVIDER_ERROR']);
 for(const edit of [r=>r.meta.symbol='QQQ',r=>r.meta.currency='TWD',r=>delete r.meta.currency]){
  const p=completeSyntheticSpy();edit(p.chart.result[0]);cases.push([p,'REFERENCE_IDENTITY_INVALID']);
 }
 const unordered=completeSyntheticSpy();unordered.chart.result[0].timestamp.reverse();cases.push([unordered,'REFERENCE_TIMESTAMPS_INVALID']);
 cases.push([syntheticChart('SPY','USD',['2026-10-14','2026-10-15']),'REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR']);
 for(const [p,code] of cases){const f=fixture({SPY:p});await fail(f,code);assert.deepEqual(chartRequests(f).map(c=>c.url),[primary]);assert.equal(f.calls.length,2);}
});

test('official calendar failure cannot be rescued by the available secondary',async()=>{
 const f=sources({...observedPayloads,'SPY-5d':observedSpy5d},{nyseCalendar:'<html>No verified holiday table</html>'});
 await fail(f,'NYSE_CALENDAR_UNAVAILABLE');assert.deepEqual(chartRequests(f).map(c=>c.url),[primary]);
});

test('secondary access denial is terminal and preserves both bounded range-specific reasons',async()=>{
 for(const status of [401,403,429,500]){
  const f=fixture({'SPY-5d':new Response('SECRET_RESPONSE',{status})}),e=await fail(f,`UPSTREAM_HTTP_${status}`);
  assert.deepEqual(chartRequests(f).map(c=>c.url),[primary,secondary]);assert.equal(f.calls.length,3);
  assert.deepEqual(e.sessionDiagnostics.references.map(r=>[r.range,r.issue]),[['1mo','REFERENCE_EXPECTED_OHLC_MISSING'],['5d',`UPSTREAM_HTTP_${status}`]]);
  assert.ok(!JSON.stringify(e.sessionDiagnostics).includes('SECRET_RESPONSE'));
 }
});

test('secondary independently enforces provider, identity, currency, timestamps, expected date and OHLC with no third request',async()=>{
 const cases=[[{chart:{error:{code:'Denied',description:'SECRET'}}},'REFERENCE_PROVIDER_ERROR']];
 for(const edit of [r=>r.meta.symbol='QQQ',r=>r.meta.currency='TWD']){const p=structuredClone(observedSpy5d);edit(p.chart.result[0]);cases.push([p,'REFERENCE_IDENTITY_INVALID']);}
 const badOrder=structuredClone(observedSpy5d);badOrder.chart.result[0].timestamp.reverse();cases.push([badOrder,'REFERENCE_TIMESTAMPS_INVALID']);
 const missing=structuredClone(observedSpy5d);field(missing,'open')[4]=null;cases.push([missing,'REFERENCE_EXPECTED_OHLC_MISSING']);
 const range=structuredClone(observedSpy5d);field(range,'high')[4]=770;cases.push([range,'REFERENCE_OHLC_INVALID']);
 cases.push([syntheticChart('SPY','USD',['2026-10-14','2026-10-15']),'REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR']);
 for(const [p,code] of cases){const f=fixture({'SPY-5d':p});await fail(f,code);assert.equal(chartRequests(f).length,2);assert.equal(f.calls.length,3);}
});

test('complementary incomplete rows cannot be stitched or filled from metadata/adjusted close',async()=>{
 const second=structuredClone(observedSpy5d);field(second,'open')[4]=null;
 second.chart.result[0].meta.regularMarketPrice=763.25;
 const f=fixture({'SPY-5d':second});const e=await fail(f,'REFERENCE_EXPECTED_OHLC_MISSING');
 assert.deepEqual(e.sessionDiagnostics.references[0].expectedOhlc.missingFields,['close']);
 assert.deepEqual(e.sessionDiagnostics.references[1].expectedOhlc.missingFields,['open']);assert.equal(chartRequests(f).length,2);
});

test('actual current captured TW+US preflight succeeds with fixed restricted references and no extra requests',async()=>{
 const f=fixture(),logs=[];const result=await verifySessionPreflight(now(),f.fetcher,expectedSession,s=>logs.push(s));
 assert.deepEqual(result.map(r=>[r.date,r.source]),[['2026-10-16','https://query1.finance.yahoo.com/v8/finance/chart/2330.TW?interval=1d&range=1mo'],['2026-10-16',secondary]]);
 assert.deepEqual(logs,[]);assert.equal(f.calls.length,7);assert.equal(chartRequests(f).length,5);
});

test('secondary failure in actual injected run still blocks universe/body and every production action',async()=>{
 const f=fixture({'SPY-5d':new Response('RATE_LIMIT',{status:429})}),logs=[];let targets=0,records=0;
 await assert.rejects(runDailyRefresh({token:'FIXTURE_ONLY',key:'FIXTURE_ONLY',fetcher:f.fetcher,clock:now,loadTargets:async()=>{targets++;return[];},fetchRecord:async()=>{records++;return{};},log:s=>logs.push(s)}),/UPSTREAM_HTTP_429/);
 assert.equal(targets,0);assert.equal(records,0);assert.deepEqual(f.writes,{begin:0,batch:0,finalize:0,fail:0,unknown:0});
 const e=JSON.parse(logs[0]);assert.deepEqual(e.markets.map(m=>m.status),['verified','failed']);assert.deepEqual(e.markets[1].diagnostics.references.map(r=>r.range),['1mo','5d']);
});
