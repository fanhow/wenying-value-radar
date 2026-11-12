import test from 'node:test';
import assert from 'node:assert/strict';
import {officialSession, parseTwseHolidays, latestCalendarSession, NYSE_CALENDAR} from '../lib/refresh-calendar.ts';
import {runDailyRefresh,verifySessionPreflight} from '../scripts/daily-refresh.mjs';
const at = new Date('2026-11-12T03:14:01.754Z');
const calendar = year => ({stat:'ok',queryYear:year,data:
 ['01-01','02-16','02-17','02-18','02-19','02-20','04-06','05-01','09-25','09-28']
 .map(d=>[`${year}-${d}`,'放假',''])});
const urlFor = year => `https://www.twse.com.tw/holidaySchedule/holidaySchedule?response=json&date=${year}0101`;
function source(make) {
 const calls=[];
 return {calls,fetcher:async(url,init)=>{calls.push({url:String(url),method:init?.method??'GET'}); return make(String(url),calls.length);}};
}
test('incident replay: ignored queryYear returns next-year payload, date explicitly selects 2026',async()=>{
 const f=source(url=>Response.json(calendar(new URL(url).searchParams.get('date')==='20260101'?2026:2027)));
 const result=await officialSession('TW',at,f.fetcher);
 assert.deepEqual(result,{date:'2026-11-11',source:urlFor(2026)});
 assert.deepEqual(f.calls,[{url:urlFor(2026),method:'GET'}]);
});
test('2027 selection uses its own explicit date, not a hard-coded current year',async()=>{
 const f=source(()=>Response.json(calendar(2027)));
 assert.equal((await officialSession('TW',new Date('2027-11-12T03:14:01Z'),f.fetcher)).date,'2027-11-11');
 assert.equal(f.calls[0].url,urlFor(2027));
});
for(const [name,mutate] of [
 ['wrong year',p=>({...p,queryYear:2027})],['string year',p=>({...p,queryYear:'2026'})],
 ['missing year',p=>({...p,queryYear:undefined})],['bad stat',p=>({...p,stat:'failed'})],
 ['empty data',p=>({...p,data:[]})],['too few rows',p=>({...p,data:p.data.slice(0,9)})],
 ['missing data',p=>({...p,data:undefined})]]) {
 test(`fail closed: ${name}`,async()=>{
  const f=source(()=>Response.json(mutate(calendar(2026))));
  await assert.rejects(officialSession('TW',at,f.fetcher),/TWSE_CALENDAR_UNAVAILABLE/);
  assert.equal(f.calls.length,1);
 });
}
for(const status of [401,403,429,500,503])test(`HTTP ${status} fails even with valid-looking JSON body`,async()=>{
 const f=source(()=>Response.json(calendar(2026),{status}));
 await assert.rejects(officialSession('TW',at,f.fetcher),/EXCHANGE_CALENDAR_FETCH_FAILED/);
 assert.equal(f.calls.length,1);
});
test('non JSON and timeout remain terminal',async()=>{
 for(const make of [()=>new Response('<html>unavailable</html>'),()=>{throw new Error('simulated timeout');}]) {
  const f=source(make);await assert.rejects(officialSession('TW',at,f.fetcher));assert.equal(f.calls.length,1);
 }
});
test('Taipei year boundary requests current then previous year, including previous-year holiday',async()=>{
 const prior=calendar(2026);prior.data.push(['2026-12-31','無交易','synthetic boundary fixture']);
 const f=source(url=>Response.json(url===urlFor(2027)?calendar(2027):prior));
 assert.equal((await officialSession('TW',new Date('2026-12-31T16:00:00Z'),f.fetcher)).date,'2026-12-30');
 assert.deepEqual(f.calls.map(c=>c.url),[urlFor(2027),urlFor(2026)]);
 const before=source(()=>Response.json(prior));
 assert.equal((await officialSession('TW',new Date('2026-12-31T15:59:59Z'),before.fetcher)).date,'2026-12-30');
 assert.deepEqual(before.calls.map(c=>c.url),[urlFor(2026)]);
});
test('cross-year second request also rejects non-2xx with otherwise valid payload',async()=>{
 const f=source((url,n)=>Response.json(calendar(n===1?2027:2026),{status:n===1?200:503}));
 await assert.rejects(officialSession('TW',new Date('2027-01-01T00:00:00Z'),f.fetcher),/EXCHANGE_CALENDAR_FETCH_FAILED/);
 assert.equal(f.calls.length,2);
});
test('cross-year second request still requires correct year and parsable JSON',async()=>{
 for(const prior of [()=>Response.json(calendar(2027)),()=>new Response('not JSON')]){
  const f=source((url,n)=>n===1?Response.json(calendar(2027)):prior());
  await assert.rejects(officialSession('TW',new Date('2027-01-01T00:00:00Z'),f.fetcher));assert.equal(f.calls.length,2);
 }
});
test('holiday, weekend and Taiwan 13:30 close cutoff retain exact behavior',()=>{
 const h=parseTwseHolidays(calendar(2026),2026);
 for(const [now,date] of [
  ['2026-11-12T05:29:59Z','2026-11-11'],['2026-11-12T05:30:00Z','2026-11-12'],
  ['2026-11-14T10:00:00Z','2026-11-13'],['2026-09-25T10:00:00Z','2026-09-24'],
  ['2026-09-28T10:00:00Z','2026-09-24']])assert.equal(latestCalendarSession('TW',new Date(now),h),date);
});
test('NYSE URL and verified normal-session behavior remain unchanged',async()=>{
 const rows=['January 1','January 19','February 16','April 3','May 25','June 19','July 3','September 7','November 26','December 25'];
 const html='<table><tr><th>Holiday</th><th>2026</th></tr>'+rows.map((d,i)=>`<tr><td>${i===3?'Good Friday':'Holiday'}</td><td>${d}</td></tr>`).join('')+'</table>';
 const f=source(()=>new Response(html));const result=await officialSession('US',at,f.fetcher);
 assert.deepEqual(result,{date:'2026-11-11',source:NYSE_CALENDAR});assert.equal(f.calls.length,1);
});
test('wrong-year preflight does not load universe, collect, write Sites or wait/retry',async()=>{
 const calls=[],logs=[];
 const fetcher=async url=>{calls.push(String(url));assert.equal(String(url),urlFor(2026));return Response.json(calendar(2027));};
 await assert.rejects(runDailyRefresh({token:'synthetic',key:'synthetic',runId:'synthetic-run73',clock:()=>at,fetcher,
  verifySession:async(m,n,f)=>m==='TW'?officialSession(m,n,f):{date:'2026-11-11'},
  loadTargets:async()=>assert.fail('universe must not load'),fetchRecord:async()=>assert.fail('no collect'),
  materializeSnapshot:async()=>assert.fail('no snapshot'),wait:async()=>assert.fail('no retry'),log:x=>logs.push(x)}),/TWSE_CALENDAR_UNAVAILABLE/);
 assert.equal(calls.length,1);const fail=logs.map(x=>JSON.parse(x)).find(x=>x.event==='refresh_failed');
 assert.equal(fail.phase,'preflight');assert.equal(fail.coverage.total,0);
});
test('correct explicit selection passes preflight without a live refresh',async()=>{
 const f=source(()=>Response.json(calendar(2026)));
 const result=await verifySessionPreflight(at,f.fetcher,async(m,n,fetcher)=>m==='TW'?officialSession(m,n,fetcher):{date:'2026-11-11'},()=>{},()=>assert.fail('no retry'));
 assert.deepEqual(result.map(r=>r.date),['2026-11-11','2026-11-11']);assert.equal(f.calls.length,1);
});
