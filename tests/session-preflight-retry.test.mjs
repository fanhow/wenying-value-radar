import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedSession} from '../lib/daily-refresh-data.ts';
import {verifySessionPreflight} from '../scripts/daily-refresh.mjs';
import {retryableSessionDate,referenceOhlcFacts,sessionTrace,beginReference,attachSessionDiagnostics} from '../lib/session-reference-diagnostics.ts';

// Synthetic calendar/quotes only. Every URL is handled locally; waits advance a
// fake clock and must never sleep, contact a provider or write to Sites.
const AT='2026-10-28T01:32:13.647Z',DAY='2026-10-27',PRIVATE='SYNTHETIC_PRIVATE_SENTINEL';
const missing='REFERENCE_EXPECTED_OHLC_MISSING';
function missingError(market,at=new Date(AT),day=DAY) {
  const trace=sessionTrace(market,at);trace.expectedSessionDate=day;
  const row=beginReference(trace,market==='TW'?'^TWII':'SPY');
  Object.assign(row,{rawBarCount:2,rawLatestDate:day,parsedLatestDate:'2026-10-23',expectedRawIndex:1,
    expectedOhlc:referenceOhlcFacts({open:[100,100],high:[110,110],low:[90,90],close:[105,null]},1),issue:missing});
  return attachSessionDiagnostics(new Error(market==='TW'?'REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR':missing),trace);
}
function chart(symbol,dates,missingFields=[]) {
  const quote={open:[],high:[],low:[],close:[],volume:[]};
  for(const day of dates)for(const [field,value] of Object.entries({open:100,high:110,low:90,close:105,volume:1000}))
    quote[field].push(day===DAY&&missingFields.includes(field)?null:value);
  return {chart:{error:null,result:[{meta:{symbol,currency:symbol==='SPY'?'USD':'TWD'},
    timestamp:dates.map(day=>Date.parse(day+'T13:30:00Z')/1000),indicators:{quote:[quote]}}]}};
}
function actualFixture({persistent=false,missingDateOnly=false,usReady=false}={}) {
  const attempts={TW:0,US:0},requests=[],waits=[],logs=[],observations=[];
  let clock=new Date(AT);
  const fetcher=async input=>{
    const url=new URL(input);requests.push(url.href);
    if(url.hostname==='www.twse.com.tw')return Response.json({stat:'ok',queryYear:2026,
      data:Array.from({length:10},(_,i)=>[`2026-01-${String(i+1).padStart(2,'0')}`,'synthetic 放假',''])});
    if(url.hostname==='www.nyse.com')return new Response('<table><tr><th>Holiday</th><th>2026</th></tr>'
      +Array.from({length:9},(_,i)=>`<tr><td>${i?'Synthetic holiday':'Good Friday'}</td><td>January ${i+1}</td></tr>`).join('')+'</table>');
    if(url.hostname!=='query1.finance.yahoo.com')throw new Error('UNEXPECTED_SYNTHETIC_URL');
    const symbol=decodeURIComponent(url.pathname.split('/').at(-1)),market=symbol==='SPY'?'US':'TW';
    if(!['0050.TW','^TWII','2330.TW','SPY'].includes(symbol))throw new Error('UNEXPECTED_SYNTHETIC_SYMBOL');
    const broken=(persistent||attempts[market]===1)&&!(market==='US'&&usReady);
    if(broken&&(missingDateOnly||symbol==='0050.TW'))return Response.json(chart(symbol,['2026-10-23','2026-10-28']));
    return Response.json(chart(symbol,['2026-10-23',DAY],broken?(market==='TW'?['open','high','low','close']:['close']):[]));
  };
  const verify=async(market,now,read)=>{
    attempts[market]++;observations.push(now.toISOString());
    return expectedSession(market,now,read);
  };
  const wait=async ms=>{waits.push(ms);clock=new Date(clock.getTime()+ms);};
  const run=()=>verifySessionPreflight(clock,fetcher,verify,line=>logs.push(JSON.parse(line)),wait);
  return {attempts,requests,waits,logs,observations,run};
}

test('actual TW missing ETF date plus null index OHLC and SPY null close recover in one bounded round',async()=>{
  const f=actualFixture(),sessions=await f.run();
  assert.deepEqual(sessions.map(s=>s.date),[DAY,DAY]);
  assert.deepEqual(f.attempts,{TW:2,US:2});assert.deepEqual(f.waits,[30000]);
  assert.ok(f.observations.every(at=>at===AT));
  const charts=f.requests.filter(url=>url.includes('/finance/chart/'));
  assert.equal(charts.length,6);
  assert.equal(charts.filter(url=>url.includes('SPY')&&url.includes('range=5d')).length,1);
  assert.equal(charts.some(url=>url.includes('2330')),false);
  assert.equal(f.logs.filter(event=>event.event==='session_preflight_retry').length,1);
  assert.equal(f.logs.some(event=>event.event==='session_preflight_failed'),false);
});
test('successful market is retained; persistent empty OHLC stops after three rounds',async()=>{
  const f=actualFixture({persistent:true,usReady:true});
  await assert.rejects(f.run(),/REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR/);
  assert.deepEqual(f.attempts,{TW:3,US:1});assert.deepEqual(f.waits,[30000,90000]);
  const failed=f.logs.find(event=>event.event==='session_preflight_failed');
  assert.equal(failed.markets.find(m=>m.market==='US').status,'verified');
  assert.equal(failed.markets.find(m=>m.market==='US').verifiedSessionDate,DAY);
  assert.equal(f.logs.filter(event=>event.event==='session_preflight_retry').length,2);
});
test('absent expected dates alone never authorize a delayed retry',async()=>{
  const f=actualFixture({missingDateOnly:true});
  await assert.rejects(f.run());assert.deepEqual(f.attempts,{TW:1,US:1});assert.deepEqual(f.waits,[]);
});
test('classifier rejects wrong types, invalid prices and malformed or mixed diagnostic evidence',()=>{
  const at=new Date(AT),valid=missingError('TW',at);
  assert.equal(retryableSessionDate(valid,'TW',at),DAY);
  const mutations=[
    e=>{e.sessionDiagnostics.references[0].expectedRawIndex=null;e.sessionDiagnostics.references[0].expectedOhlc=null;},
    e=>{e.sessionDiagnostics.references[0].expectedOhlc.ohlcKinds.close='string';},
    e=>{e.sessionDiagnostics.references[0].expectedOhlc.ohlcKinds.close='nonfinite-number';},
    e=>{e.sessionDiagnostics.references[0].expectedOhlc.nonPositiveFields=['low'];},
    e=>{e.sessionDiagnostics.references[0].expectedOhlc.rangeViolations=['HIGH_BELOW_OPEN'];},
    e=>{e.sessionDiagnostics.references[0].issue='REFERENCE_IDENTITY_INVALID';},
    e=>{e.sessionDiagnostics.references[0].issue='REFERENCE_TIMESTAMPS_INVALID';},
    e=>{e.sessionDiagnostics.references[0].issue='REFERENCE_PROVIDER_ERROR';},
    e=>{e.sessionDiagnostics.references.push({...e.sessionDiagnostics.references[0],symbol:'0050.TW',issue:'UPSTREAM_HTTP_403'});},
    e=>{e.sessionDiagnostics.references.push({...e.sessionDiagnostics.references[0],symbol:'UNALLOWLISTED',issue:'REFERENCE_IDENTITY_INVALID'});},
    e=>{e.sessionDiagnostics.expectedSessionDate=null;},
    e=>{e.sessionDiagnostics.market='US';},
    e=>{e.sessionDiagnostics.observedAt='2026-10-28T02:00:00.000Z';},
    e=>{e.sessionDiagnostics.references[0].expectedRawIndex=2;},
    e=>{e.sessionDiagnostics.references[0].expectedOhlc.missingFields=['close','close'];},
  ];
  for(const mutate of mutations) {
    const error=missingError('TW',at);mutate(error);
    assert.equal(retryableSessionDate(error,'TW',at),null);
  }
  for(const code of ['UPSTREAM_HTTP_401','UPSTREAM_HTTP_403','UPSTREAM_HTTP_429','UPSTREAM_HTTP_503',
    'EXCHANGE_CALENDAR_FETCH_FAILED','REFERENCE_IDENTITY_INVALID','REFERENCE_TIMESTAMPS_INVALID',
    'REFERENCE_OHLC_INVALID','REFERENCE_PROVIDER_ERROR','UNCLASSIFIED_ERROR']) {
    const error=missingError('TW',at);error.message=code;
    assert.equal(retryableSessionDate(error,'TW',at),null);
  }
  const usConflict=missingError('US',at);usConflict.message='REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR';
  assert.equal(retryableSessionDate(usConflict,'US',at),null);
});
test('one permanent market error stops the entire preflight without waiting for another round',async()=>{
  const seen=[],waits=[],logs=[];
  await assert.rejects(verifySessionPreflight(new Date(AT),()=>{throw new Error('NO_NETWORK');},async(market,now)=>{
    seen.push(market);if(market==='TW')throw missingError(market,now);
    throw new Error('REFERENCE_IDENTITY_INVALID '+PRIVATE);
  },line=>logs.push(JSON.parse(line)),async ms=>waits.push(ms)),/REFERENCE_IDENTITY_INVALID/);
  assert.deepEqual(seen,['TW','US']);assert.deepEqual(waits,[]);
  assert.equal(JSON.stringify(logs).includes(PRIVATE),false);
});
test('fake clock crosses US close but verifier time and expected sessions remain pinned',async()=>{
  const initial=new Date('2026-10-27T19:59:50.000Z'),seen=[],waits=[],attempts={TW:0,US:0};
  const sessions=await verifySessionPreflight(initial,()=>{throw new Error('NO_NETWORK');},async(market,now)=>{
    attempts[market]++;seen.push(now.toISOString());
    if(market==='US'&&attempts.US===1)throw missingError(market,now,'2026-10-26');
    return {date:market==='TW'?DAY:'2026-10-26'};
  },()=>{},async ms=>{waits.push(ms);initial.setTime(initial.getTime()+ms);});
  assert.deepEqual(sessions.map(s=>s.date),[DAY,'2026-10-26']);
  assert.deepEqual(attempts,{TW:1,US:2});assert.deepEqual(waits,[30000]);
  assert.ok(seen.every(at=>at==='2026-10-27T19:59:50.000Z'));
});
test('changed calendar date after waiting is rejected even if the verifier returns success',async()=>{
  const attempts={TW:0,US:0},waits=[];
  await assert.rejects(verifySessionPreflight(new Date(AT),()=>{throw new Error('NO_NETWORK');},async(market,now)=>{
    attempts[market]++;
    if(market==='TW'&&attempts.TW===1)throw missingError(market,now);
    return {date:market==='TW'?'2026-10-26':DAY};
  },()=>{},async ms=>waits.push(ms)),/REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR/);
  assert.deepEqual(attempts,{TW:2,US:1});assert.deepEqual(waits,[30000]);
});
test('changed calendar date in later missing-OHLC diagnostics is a date conflict, not another retry',async()=>{
  const attempts={TW:0,US:0},waits=[],logs=[];
  await assert.rejects(verifySessionPreflight(new Date(AT),()=>{throw new Error('NO_NETWORK');},async(market,now)=>{
    attempts[market]++;
    if(market==='TW')throw missingError(market,now,attempts.TW===1?DAY:'2026-10-26');
    return {date:DAY};
  },line=>logs.push(JSON.parse(line)),async ms=>waits.push(ms)),/REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR/);
  assert.deepEqual(attempts,{TW:2,US:1});assert.deepEqual(waits,[30000]);
  assert.equal(logs.at(-1).markets[0].error,'REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR');
});
