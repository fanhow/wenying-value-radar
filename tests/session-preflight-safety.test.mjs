import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedSession} from '../lib/daily-refresh-data.ts';
import {verifySessionPreflight,runDailyRefresh} from '../scripts/daily-refresh.mjs';
import {SESSION_DIAGNOSTIC_LIMITS,sessionTrace,beginReference,observeReference,attachSessionDiagnostics,
  safeSessionDiagnostics,safeSessionPreflightFailure} from '../lib/session-reference-diagnostics.ts';
import {observedPayloads,currentObservationClock,completeSyntheticSpy,syntheticChart,sources} from './fixtures/session-preflight/fixtures.mjs';

const now=()=>new Date(currentObservationClock),quote=p=>p.chart.result[0].indicators.quote[0];
const last=p=>p.chart.result[0].timestamp.length-1;
const originalGlobalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('TEST_FORBIDS_REAL_NETWORK');};
test.after(()=>{globalThis.fetch=originalGlobalFetch;});
const denied=async(p,code)=>{
  const f=sources({SPY:p});let error;
  try {await expectedSession('US',now(),f.fetcher);}catch(e){error=e;}
  assert.ok(error);assert.equal(error.message,code);assert.equal(f.calls.length,['REFERENCE_EXPECTED_OHLC_MISSING','REFERENCE_OHLC_INVALID'].includes(code)?3:2);
  assert.ok(f.calls.every(c=>c.method==='GET'&&!c.url.includes('TWII')&&!c.url.includes('2330')));
  return error;
};

test('observed current TW retains exact existing third-reference success contract and original payload bytes',async()=>{
  const before=JSON.stringify(observedPayloads),f=sources(),result=await expectedSession('TW',now(),f.fetcher);
  assert.deepEqual(result,{date:'2026-10-16',source:'https://query1.finance.yahoo.com/v8/finance/chart/2330.TW?interval=1d&range=1mo',
    calendarSource:'https://www.twse.com.tw/holidaySchedule/holidaySchedule?response=json&queryYear=2026',
    basis:'official exchange calendar checked against complete OHLC; fixed 0050.TW then ^TWII, with 2330.TW only after both expected closes are missing; exact date required',
    checkedAt:currentObservationClock,referenceChecks:[
      {symbol:'0050.TW',source:'https://query1.finance.yahoo.com/v8/finance/chart/0050.TW?interval=1d&range=1mo',latest:'2026-10-15',issue:'REFERENCE_EXPECTED_OHLC_MISSING'},
      {symbol:'^TWII',source:'https://query1.finance.yahoo.com/v8/finance/chart/%5ETWII?interval=1d&range=1mo',latest:'2026-10-15',issue:'REFERENCE_EXPECTED_OHLC_MISSING'},
      {symbol:'2330.TW',source:'https://query1.finance.yahoo.com/v8/finance/chart/2330.TW?interval=1d&range=1mo',latest:'2026-10-16',issue:null}]});
  assert.equal(f.calls.length,4);assert.equal(JSON.stringify(observedPayloads),before);
});

test('observed missing primary and equally invalid synthetic secondary stay rejected with both known defects',async()=>{
  const e=await denied(observedPayloads.SPY,'REFERENCE_EXPECTED_OHLC_MISSING'),d=e.sessionDiagnostics,r=d.references[0];
  assert.equal(d.expectedSessionDate,'2026-10-16');assert.equal(d.observedAt,currentObservationClock);
  assert.equal(r.symbol,'SPY');assert.equal(r.rawLatestDate,'2026-10-16');assert.equal(r.parsedLatestDate,'2026-10-15');
  assert.deepEqual(r.expectedOhlc.missingFields,['close']);assert.equal(r.expectedOhlc.ohlcKinds.close,'null');
  assert.ok(r.expectedOhlc.rangeViolations.includes('HIGH_BELOW_OPEN'));
  assert.equal(Object.getOwnPropertyDescriptor(e,'sessionDiagnostics').enumerable,false);assert.equal(JSON.stringify(e),'{}');
});

test('synthetic close-only fill still rejects captured high below open; no metadata price repairs',async()=>{
  const p=structuredClone(observedPayloads.SPY);quote(p).close[last(p)]=763.25;
  const e=await denied(p,'REFERENCE_OHLC_INVALID');assert.ok(e.sessionDiagnostics.references[0].expectedOhlc.rangeViolations.includes('HIGH_BELOW_OPEN'));
});

test('correct complete synthetic SPY USD passes with byte-compatible successful return and no fallback',async()=>{
  const f=sources({SPY:completeSyntheticSpy()});
  assert.deepEqual(await expectedSession('US',now(),f.fetcher),{date:'2026-10-16',
    source:'https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=1mo',
    calendarSource:'https://www.nyse.com/trade/hours-calendars',
    basis:'official exchange holiday calendar checked against completed benchmark OHLC; mismatch fails closed'});
  assert.equal(f.calls.length,2);
});

test('wrong identity, wrong or missing currency can no longer certify a US session from same-date OHLC',async()=>{
  for(const edit of [r=>r.meta.symbol='QQQ',r=>r.meta.currency='TWD',r=>delete r.meta.currency]){
    const p=completeSyntheticSpy();edit(p.chart.result[0]);await denied(p,'REFERENCE_IDENTITY_INVALID');
  }
});

test('finite positive/range sanity is enforced independently of same-date selection',async()=>{
  for(const edit of [q=>q.close=0,q=>q.open=-1,q=>q.open=775,q=>q.close=775,q=>q.low=764,q=>q.high=759]){
    const p=completeSyntheticSpy(),i=last(p),q=quote(p),v=Object.fromEntries(['open','high','low','close'].map(k=>[k,q[k][i]]));
    edit(v);for(const k of Object.keys(v))q[k][i]=v[k];await denied(p,'REFERENCE_OHLC_INVALID');
  }
});

test('expected OHLC absent/null remains a missing observation rather than a substituted earlier close',async()=>{
  for(const field of ['open','high','low','close']){
    for(const missing of [null,undefined]){
      const p=completeSyntheticSpy();quote(p)[field][last(p)]=missing;
      const e=await denied(p,'REFERENCE_EXPECTED_OHLC_MISSING');assert.ok(e.sessionDiagnostics.references[0].expectedOhlc.missingFields.includes(field));
    }
  }
});

test('US malformed, duplicate or unordered timestamps are rejected without accepting a final matching date',async()=>{
  for(const edit of [a=>a.push(a.at(-1)),a=>a.reverse(),a=>a[0]='bad',a=>a[0]=1e30]){
    const p=completeSyntheticSpy();edit(p.chart.result[0].timestamp);await denied(p,'REFERENCE_TIMESTAMPS_INVALID');
  }
});

test('access/rate/provider denial remains terminal, with one SPY request and safe typed diagnostics',async()=>{
  for(const status of [401,403,429])await denied(new Response('private upstream response',{status}),`UPSTREAM_HTTP_${status}`);
  const e=await denied({chart:{error:{description:'TOKEN_OR_EMAIL_MUST_NOT_LEAK'}}},'REFERENCE_PROVIDER_ERROR');
  assert.ok(!JSON.stringify(e.sessionDiagnostics).includes('TOKEN_OR_EMAIL'));
});

test('a genuinely stale reference still cannot move the official expected date backward',async()=>{
  const p=syntheticChart('SPY','USD',['2026-10-14','2026-10-15']);
  const e=await denied(p,'REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR');
  assert.equal(e.sessionDiagnostics.expectedSessionDate,'2026-10-16');assert.equal(e.sessionDiagnostics.references[0].parsedLatestDate,'2026-10-15');
});

test('fixed historical Oct10 clock retains holiday TW Oct8 / US Oct9 with correct synthetic references',async()=>{
  const moment=new Date('2026-10-10T01:51:22Z'),f=sources({'0050.TW':syntheticChart('0050.TW','TWD',['2026-10-07','2026-10-08']),
    SPY:syntheticChart('SPY','USD',['2026-10-08','2026-10-09'])});
  const result=await verifySessionPreflight(moment,f.fetcher,expectedSession,()=>assert.fail('success must not add failure log'));
  assert.deepEqual(result.map(r=>r.date),['2026-10-08','2026-10-09']);assert.equal(f.calls.length,4);
});

for(const scenario of ['US-fail-TW-pass','TW-fail-US-pass','both-fail'])
test(`actual injected ${scenario} blocks universe/body and all begin/batch/finalize/fail actions`,async()=>{
  const payloads=structuredClone(observedPayloads);
  if(scenario==='TW-fail-US-pass')payloads.SPY=completeSyntheticSpy();
  if(scenario!=='US-fail-TW-pass')quote(payloads['2330.TW']).close[last(payloads['2330.TW'])]=null;
  const f=sources(payloads),logs=[];let targets=0,records=0;
  await assert.rejects(runDailyRefresh({token:'SYNTHETIC_ONLY',key:'SYNTHETIC_ONLY',fetcher:f.fetcher,clock:now,wait:async()=>{},
    loadTargets:async()=>{targets++;return[];},fetchRecord:async()=>{records++;throw Error('must not collect');},log:s=>logs.push(s)}),/REFERENCE_/);
  assert.equal(targets,0);assert.equal(records,0);assert.equal(f.calls.filter(c=>c.method!=='GET').length,0);
  const failures=logs.map(JSON.parse).filter(log=>log.event==='session_preflight_failed');
  assert.equal(failures.length,1);const log=failures[0];
  assert.equal(logs.map(JSON.parse).filter(log=>log.event==='refresh_failed').length,1);
  assert.deepEqual(log.markets.map(m=>m.status),scenario==='US-fail-TW-pass'?['verified','failed']:scenario==='TW-fail-US-pass'?['failed','verified']:['failed','failed']);
  if(scenario!=='TW-fail-US-pass')assert.equal(log.markets[1].diagnostics.references[0].expectedOhlc.ohlcKinds.close,'null');
  if(scenario!=='US-fail-TW-pass')assert.equal(log.markets[0].diagnostics.references.length,3);
  assert.deepEqual(f.writes,{begin:0,batch:0,finalize:0,fail:0,unknown:0});
  assert.ok(Buffer.byteLength(JSON.stringify(log))<=SESSION_DIAGNOSTIC_LIMITS.maxJsonBytes);
  assert.ok(!logs.join('\n').includes('https://')&&!logs.join('\n').includes('SYNTHETIC_ONLY'));
});

test('two market failures retain both outcomes and original first rejection without raw messages in logs',async()=>{
  const first=new Error('UPSTREAM_HTTP_403 https://private.test token=SECRET_SENTINEL user@example.test');
  const second=new Error('REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR private-settings');
  let finishedTW=false;const logs=[];
  const verify=async market=>{if(market==='US')throw first;await Promise.resolve();finishedTW=true;throw second;};
  await assert.rejects(verifySessionPreflight(now(),async()=>assert.fail('no request'),verify,s=>logs.push(s)),e=>e===first);
  assert.ok(finishedTW);const log=JSON.parse(logs[0]);assert.deepEqual(log.markets.map(m=>m.error),['REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR','UPSTREAM_HTTP_403']);
  assert.ok(!logs[0].includes('SECRET')&&!logs[0].includes('@')&&!logs[0].includes('https://')&&!logs[0].includes('private-settings'));
});

test('diagnostic boundary distinguishes absent/null/nonfinite/shape and checks known ranges even while incomplete',()=>{
  const t=sessionTrace('US',now());t.expectedSessionDate='2026-10-16';const r=beginReference(t,'SPY');
  const p={chart:{result:[{timestamp:[Date.parse('2026-10-16T13:30:00Z')/1000],indicators:{quote:[{open:[10],high:[9],low:[Number.NaN],close:[null]}]}}]}};
  observeReference(t,r,p);const d=safeSessionDiagnostics(t),f=d.references[0].expectedOhlc;
  assert.equal(f.ohlcKinds.low,'nonfinite-number');assert.equal(f.ohlcKinds.close,'null');assert.ok(f.rangeViolations.includes('HIGH_BELOW_OPEN'));
  delete p.chart.result[0].indicators.quote[0].close;observeReference(t,r,p);assert.equal(safeSessionDiagnostics(t).references[0].expectedOhlc.ohlcKinds.close,'absent');
  p.chart.result[0].indicators.quote[0].close=[{unexpected:'shape'}];observeReference(t,r,p);
  assert.equal(safeSessionDiagnostics(t).references[0].expectedOhlc.ohlcKinds.close,'object');
  const e=attachSessionDiagnostics(Object.freeze(new Error('REFERENCE_OHLC_INVALID')),t);assert.equal(e.sessionDiagnostics.market,'US');
});

test('strict allowlists bound poisoned diagnostics and never serialize arbitrary fields or reference symbols',()=>{
  const secret='DO_NOT_SERIALIZE_SECRET_OR_EMAIL@example.test',trace=sessionTrace('TW',now());
  trace.expectedSessionDate='2026-10-16';trace.headers={authorization:secret};trace.references=Array.from({length:500},(_,i)=>({symbol:i%2?'0050.TW':secret,
    rawBarCount:Infinity,rawLatestDate:secret,parsedLatestDate:'2026-10-16',issue:secret,rawTail:Array.from({length:10},()=>({
      index:1,timestampKind:secret,utcDate:secret,rawResponse:secret,ohlcKinds:{open:secret},missingFields:['close',secret],rangeViolations:[secret]}))}));
  const d=safeSessionDiagnostics(trace),e=attachSessionDiagnostics(new Error(secret),trace);
  const log=safeSessionPreflightFailure(now(),[{market:'TW',status:'rejected',reason:e},{market:secret,status:'rejected',reason:e}]);
  const s=JSON.stringify(log);assert.ok(!s.includes(secret));assert.ok(Buffer.byteLength(s)<=SESSION_DIAGNOSTIC_LIMITS.maxJsonBytes);
  assert.equal(d.references.length,3);assert.ok(d.references.every(r=>r.rawTail.length===3));assert.equal(log.markets.length,1);
});
