import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedSession} from '../lib/daily-refresh-data.ts';

// Synthetic evidence only: fixed holiday dates, never live market-price fixtures.
const now=new Date('2026-09-25T16:00:00Z');
const calendar={stat:'ok',queryYear:2026,data:['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-02-20','2026-04-06','2026-05-01','2026-09-25','2026-09-28'].map(d=>[d,'放假',''])};
function chart(symbol,dates=['2026-09-23','2026-09-24']) {
  return {chart:{result:[{meta:{symbol,currency:'TWD'},timestamp:dates.map(d=>Date.parse(d+'T01:00:00Z')/1000),indicators:{quote:[{open:dates.map(()=>100),high:dates.map(()=>102),low:dates.map(()=>99),close:dates.map(()=>101),volume:dates.map(()=>0)}]}}]}};
}
function source(primary=chart('0050.TW'),backup=chart('^TWII'),holidays=calendar) {
  const calls=[];
  const fetcher=async url=>{calls.push(url);if(url.includes('holidaySchedule'))return holidays instanceof Response?holidays.clone():Response.json(holidays);
    const body=url.includes('0050.TW')?primary:url.includes('%5ETWII')?backup:undefined;
    assert.notEqual(body,undefined,`unexpected source: ${url}`);
    if(body instanceof Error)throw body;
    return body instanceof Response?body.clone():Response.json(body);};
  return {fetcher,calls};
}
const quote=payload=>payload.chart.result[0].indicators.quote[0];

test('complete primary benchmark avoids every fallback request',async()=>{
  const f=source();const result=await expectedSession('TW',now,f.fetcher);
  assert.equal(result.date,'2026-09-24');assert.match(result.source,/0050\.TW/);
  assert.equal(result.referenceChecks.length,1);assert.equal(result.referenceChecks[0].issue,null);assert.equal(f.calls.length,2);
});
test('missing ETF close uses one fixed index with exact-date OHLC and records the failure',async()=>{
  const primary=chart('0050.TW');quote(primary).close[1]=null;
  const f=source(primary);const result=await expectedSession('TW',now,f.fetcher);
  assert.equal(result.date,'2026-09-24');assert.match(result.source,/%5ETWII/);assert.equal(f.calls.length,3);
  assert.equal(result.referenceChecks[0].latest,'2026-09-23');assert.equal(result.referenceChecks[0].issue,'REFERENCE_EXPECTED_OHLC_MISSING');assert.equal(result.referenceChecks[1].issue,null);
});
test('unavailable ETF request uses only the bounded fixed index',async()=>{
  for(const failure of [new Error('network unavailable'),new Response('',{status:503}),new Response('not-json')]){
    const f=source(failure);const result=await expectedSession('TW',now,f.fetcher);
    assert.equal(result.date,'2026-09-24');assert.match(result.source,/%5ETWII/);assert.equal(f.calls.length,3);
  }
});
test('invalid primary OHLC also requires an independently valid benchmark',async()=>{
  for(const edit of [q=>q.close[1]=0,q=>q.open[1]=103,q=>q.close[1]=98,q=>q.low[1]=-1]){
    const primary=chart('0050.TW');edit(quote(primary));const f=source(primary);
    const result=await expectedSession('TW',now,f.fetcher);assert.match(result.source,/%5ETWII/);assert.equal(result.referenceChecks[0].issue,'REFERENCE_OHLC_INVALID');
  }
});
test('invalid index cannot manufacture an expected session from stale or malformed data',async()=>{
  const edits=[p=>quote(p).close[1]=null,p=>quote(p).open[1]=null,p=>quote(p).close[1]=0,p=>quote(p).close[1]=103,
    p=>quote(p).low[1]=-1,p=>quote(p).high[1]=98,p=>p.chart.result[0].meta.symbol='2330.TW',p=>p.chart.result[0].meta.currency='USD',
    p=>p.chart.result[0].timestamp[1]=p.chart.result[0].timestamp[0],p=>p.chart.result[0].timestamp.reverse(),p=>p.chart.result[0].timestamp[1]='bad',p=>p.chart.result[0].timestamp[1]=1e30];
  for(const edit of edits){const backup=chart('^TWII');edit(backup);const f=source(chart('0050.TW',['2026-09-23']),backup);
    await assert.rejects(expectedSession('TW',now,f.fetcher),/REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR TW expected=2026-09-24/);assert.equal(f.calls.length,3);}
});
test('both references stale or inaccessible stay fail-closed without lowering the date',async()=>{
  for(const backup of [chart('^TWII',['2026-09-23']),new Response('',{status:503}),new Error('timeout'),{}]){
    const f=source(chart('0050.TW',['2026-09-23']),backup);
    await assert.rejects(expectedSession('TW',now,f.fetcher),/expected=2026-09-24/);assert.equal(f.calls.length,3);
  }
});
test('explicit authorization, throttling and provider errors never trigger an alternate probe',async()=>{
  for(const primary of [new Response('',{status:401}),new Response('',{status:403}),new Response('',{status:429}),{chart:{error:{code:'Forbidden'}}}]){
    const f=source(primary);await assert.rejects(expectedSession('TW',now,f.fetcher),/UPSTREAM_HTTP_(401|403|429)|REFERENCE_PROVIDER_ERROR/);assert.equal(f.calls.length,2);
  }
  const f=source(chart('0050.TW',['2026-09-23']),new Response('',{status:429}));
  await assert.rejects(expectedSession('TW',now,f.fetcher),/UPSTREAM_HTTP_429/);assert.equal(f.calls.length,3);
});
test('invalid official calendar prevents all benchmark requests',async()=>{
  for(const holidays of [{...calendar,stat:'failed'},new Response('',{status:503})]){
    const f=source(undefined,undefined,holidays);
    await assert.rejects(expectedSession('TW',now,f.fetcher),/CALENDAR/);assert.equal(f.calls.length,1);
  }
});
test('holiday weekend and pre-close decisions exclude later candles in either reference',async()=>{
  const backup=chart('^TWII',['2026-09-24','2026-09-25','2026-09-29']);
  for(const moment of ['2026-09-25T00:40:17Z','2026-09-26T16:00:00Z','2026-09-28T16:00:00Z','2026-09-29T05:29:59Z']){
    const f=source(chart('0050.TW',['2026-09-23']),backup);
    assert.equal((await expectedSession('TW',new Date(moment),f.fetcher)).date,'2026-09-24');
  }
  const f=source(chart('0050.TW',['2026-09-23']),chart('^TWII',['2026-09-24']));
  await assert.rejects(expectedSession('TW',new Date('2026-09-29T05:30:00Z'),f.fetcher),/expected=2026-09-29/);
});
test('US session path retains SPY and never requests Taiwan fallback',async()=>{
  const usCalendar='<table><tr><th>Holiday</th><th>2026</th></tr>'+['January 1','January 19','February 16','April 3','May 25','June 19','July 3','September 7','November 26','December 25'].map(d=>`<tr><td>Good Friday</td><td>${d}</td></tr>`).join('')+'</table>';
  const calls=[];const fetcher=async url=>{calls.push(url);return url.includes('nyse.com')?new Response(usCalendar):Response.json(chart('SPY'));};
  assert.equal((await expectedSession('US',now,fetcher)).date,'2026-09-24');assert.equal(calls.length,2);assert.ok(calls.some(u=>u.includes('/SPY?')));assert.ok(calls.every(u=>!u.includes('TWII')));
});
