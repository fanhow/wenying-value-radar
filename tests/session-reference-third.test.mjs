import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedSession} from '../lib/daily-refresh-data.ts';

// Synthetic protocol counterexamples; public captures are replayed separately
// in the repair evidence, never substituted for a missing quote close.
const now=new Date('2026-10-14T00:00:00Z');
const holidays={stat:'ok',queryYear:2026,data:['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-02-20','2026-04-06','2026-05-01','2026-09-25','2026-09-28'].map(d=>[d,'放假',''])};
const chart=(symbol,dates=['2026-10-12','2026-10-13'])=>({chart:{result:[{meta:{symbol,currency:'TWD'},timestamp:dates.map(d=>Date.parse(d+'T01:00:00Z')/1000),indicators:{quote:[{open:dates.map(()=>100),high:dates.map(()=>102),low:dates.map(()=>99),close:dates.map(()=>101),volume:dates.map(()=>100)}]}}]}});
const quote=p=>p.chart.result[0].indicators.quote[0];
const missing=symbol=>{const p=chart(symbol);quote(p).close[1]=null;return p;};
function source(first=missing('0050.TW'),second=missing('^TWII'),third=chart('2330.TW'),calendar=holidays){
 const calls=[];
 const fetcher=async url=>{calls.push(String(url));if(String(url).includes('holidaySchedule'))return calendar instanceof Response?calendar.clone():Response.json(calendar);
  const symbol=decodeURIComponent(String(url).match(/\/chart\/([^?]+)/)?.[1]??'');
  const body={'0050.TW':first,'^TWII':second,'2330.TW':third}[symbol];
  assert.notEqual(body,undefined,'Only predefined reference URLs may be fetched');
  if(body instanceof Error)throw body;
  return body instanceof Response?body.clone():Response.json(body);
 };
 return {calls,fetcher};
}

test('both explicit missing closes permit one fixed third reference without rewriting prices or lowering the day',async()=>{
 const a=missing('0050.TW'),b=missing('^TWII'),c=chart('2330.TW'),before=JSON.stringify([a,b,c]),f=source(a,b,c);
 const result=await expectedSession('TW',now,f.fetcher);
 assert.equal(result.date,'2026-10-13');assert.equal(result.source,'https://query1.finance.yahoo.com/v8/finance/chart/2330.TW?interval=1d&range=1mo');
 assert.deepEqual(result.referenceChecks.map(x=>[x.symbol,x.issue]),[['0050.TW','REFERENCE_EXPECTED_OHLC_MISSING'],['^TWII','REFERENCE_EXPECTED_OHLC_MISSING'],['2330.TW',null]]);
 assert.equal(f.calls.length,4);assert.equal(JSON.stringify([a,b,c]),before);assert.equal(result.close,undefined);
});

test('primary or index success never fetches the third quote',async()=>{
 for(const [a,b,count] of [[chart('0050.TW'),missing('^TWII'),2],[missing('0050.TW'),chart('^TWII'),3]]){
  const f=source(a,b);assert.equal((await expectedSession('TW',now,f.fetcher)).date,'2026-10-13');
  assert.equal(f.calls.length,count);assert.ok(f.calls.every(u=>!u.includes('/2330.TW?')));
 }
});

test('stale, malformed, identity or currency failures are never recast as two explicit missing closes',async()=>{
 const wrongSymbol=missing('0050.TW');wrongSymbol.chart.result[0].meta.symbol='UNRELATED.TW';
 const wrongCurrency=missing('0050.TW');wrongCurrency.chart.result[0].meta.currency='USD';
 const zeroClose=chart('0050.TW');quote(zeroClose).close[1]=0;
 for(const first of [chart('0050.TW',['2026-10-12']),wrongSymbol,wrongCurrency,zeroClose,new Error('network unavailable'),new Response('',{status:503})]){
  const f=source(first);await assert.rejects(expectedSession('TW',now,f.fetcher),/REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR/);
  assert.equal(f.calls.length,3);assert.ok(f.calls.every(u=>!u.includes('/2330.TW?')));
 }
});

test('third quote retains exact identity, currency, timestamp and complete OHLC checks',async()=>{
 const edits=[p=>p.chart.result[0].meta.symbol='3036.TW',p=>p.chart.result[0].meta.currency='USD',p=>quote(p).close[1]=null,p=>quote(p).close[1]=0,
  p=>quote(p).open[1]=null,p=>quote(p).high[1]=98,p=>quote(p).low[1]=103,p=>quote(p).close[1]=103,
  p=>p.chart.result[0].timestamp.reverse(),p=>p.chart.result[0].timestamp[1]=p.chart.result[0].timestamp[0],p=>p.chart.result[0].timestamp[1]='invalid'];
 for(const edit of edits){const third=chart('2330.TW');edit(third);const f=source(undefined,undefined,third);
  await assert.rejects(expectedSession('TW',now,f.fetcher),/REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR TW expected=2026-10-13/);assert.equal(f.calls.length,4);
 }
 const f=source(undefined,undefined,chart('2330.TW',['2026-10-12']));
 await assert.rejects(expectedSession('TW',now,f.fetcher),/expected=2026-10-13/);assert.equal(f.calls.length,4);
});

test('authorization, provider denial and rate limits remain terminal in every reference position',async()=>{
 for(const denial of [new Response('',{status:401}),new Response('',{status:403}),new Response('',{status:429}),{chart:{error:{code:'Forbidden'}}}]){
  for(const pos of [0,1,2]){const bodies=[missing('0050.TW'),missing('^TWII'),chart('2330.TW')];bodies[pos]=denial;const f=source(...bodies);
   await assert.rejects(expectedSession('TW',now,f.fetcher),/UPSTREAM_HTTP_(401|403|429)|REFERENCE_PROVIDER_ERROR/);assert.equal(f.calls.length,pos+2);
  }
 }
});

test('an invalid official calendar still prevents every benchmark request',async()=>{
 const f=source(undefined,undefined,undefined,{...holidays,stat:'failed'});
 await assert.rejects(expectedSession('TW',now,f.fetcher),/CALENDAR/);assert.equal(f.calls.length,1);
});
