import {DAILY_VALUATION_VERSION} from '../lib/daily-valuation-state.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fetchRefreshRecord} from '../lib/daily-refresh-data.ts';
import {prepareTaiwanRefreshGeneration} from '../lib/daily-refresh-generation.ts';
import {refreshUploadBatches,runDailyRefresh} from '../scripts/daily-refresh.mjs';
import {observeRawQuoteTail,safeRawQuoteTail} from '../lib/raw-quote-tail-diagnostics.ts';
import {boundedQuoteFailureSamples,safeQuoteDiagnostics,QUOTE_FAILURE_SAMPLE_LIMITS} from '../scripts/daily-refresh-diagnostics.mjs';
import {caseNames,fixtureCase,expected,refreshTime} from './fixtures/quote-tail-diagnostics/synthetic-cases.mjs';
const golden=JSON.parse(await readFile(new URL('./fixtures/quote-tail-diagnostics/baseline-50015150-transport.json',import.meta.url),'utf8'));
const tail=name=>observeRawQuoteTail(fixtureCase(name,0).chart);
const last=name=>tail(name).rows.at(-1);

test('tail type descriptors distinguish missing, undefined, null, strings, NaN and infinity after JSON serialization',()=>{
  for(const [name,kind] of [['missing-close-index','missing'],['undefined-close','undefined'],['null-close','null'],
    ['string-close','string'],['nan-close','nan'],['infinity-close','positive-infinity']]) {
    const result=last(name);assert.equal(result.ohlcKinds.close,kind);assert.equal(result.parserRowOutcome,'reject-nonfinite-ohlc');
    assert.deepEqual(JSON.parse(JSON.stringify(result)),result);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_STRING'));
  }
  const c=fixtureCase('ready',0);c.chart.chart.result[0].indicators.quote[0].close[79]=-Infinity;
  assert.equal(observeRawQuoteTail(c.chart).rows.at(-1).ohlcKinds.close,'negative-infinity');
});
test('array lengths and non-array/missing column shapes locate alignment gaps without logging values',()=>{
  assert.equal(tail('short-column').columns.close.length,79);assert.equal(last('short-column').ohlcKinds.close,'missing');
  assert.equal(tail('wrong-column-shape').columns.close.kind,'object');
  assert.equal(tail('missing-quote').quote.kind,'missing');assert.equal(last('missing-quote').parserRowOutcome,'missing-parser-container');
  const c=fixtureCase('ready',0);delete c.chart.chart.result[0].indicators.quote[0].close;
  assert.equal(observeRawQuoteTail(c.chart).columns.close.kind,'missing');
  assert.equal(observeRawQuoteTail({chart:{result:[{timestamp:{length:80}}]}}).timestamp.kind,'object');
});
test('parser high/low rejection is distinct from emitted but later-invalid OHLC envelope',()=>{
  assert.equal(last('high-below-low').parserRowOutcome,'reject-high-below-low');assert.equal(last('high-below-low').highBelowLow,true);
  assert.equal(last('outside-envelope').parserRowOutcome,'emits-row-before-session-validation');
  assert.equal(last('outside-envelope').outsideHighLowEnvelope,true);
  const c=fixtureCase('ready',0),q=c.chart.chart.result[0].indicators.quote[0];q.low[79]=-1;
  const row=observeRawQuoteTail(c.chart).rows.at(-1);assert.equal(row.nonpositiveOhlc,true);assert.equal(row.parserRowOutcome,'emits-row-before-session-validation');
});
test('raw date-order observations preserve duplicates/decreases and invalid timestamps rather than repairing order',()=>{
  assert.equal(last('ready').dateOrderVsPreviousRawRow,'increasing-date');
  assert.equal(last('duplicate-date').dateOrderVsPreviousRawRow,'duplicate-date');
  assert.equal(last('decreasing-date').dateOrderVsPreviousRawRow,'decreasing-date');
  assert.equal(last('invalid-timestamp').timestampKind,'nan');assert.equal(last('invalid-timestamp').parserUtcDate,null);
  assert.equal(last('invalid-timestamp').parserRowOutcome,'throws-invalid-timestamp');
  const c=fixtureCase('ready',0);delete c.chart.chart.result[0].timestamp[79];
  const row=observeRawQuoteTail(c.chart).rows.at(-1);assert.equal(row.timestampKind,'missing');assert.equal(row.parserRowOutcome,'skips-sparse-timestamp-index');
});
test('only the last three raw indices are retained and the observer leaves the entire payload unchanged',()=>{
  for(const name of caseNames) {const c=fixtureCase(name,0),before=structuredClone(c.chart),observed=observeRawQuoteTail(c.chart);
    assert.ok(observed.rows.length<=3);assert.deepEqual(c.chart,before);assert.deepEqual(safeRawQuoteTail(observed),observed);}
  assert.deepEqual(tail('ready').rows.map(r=>r.index),[77,78,79]);
});
test('log-boundary allowlist strips injected raw strings, URLs, values, extra rows and private properties',()=>{
  const v=tail('ready'),privateValue='PRIVATE_URL_OR_SECRET';
  v.headers=privateValue;v.quote.raw=privateValue;v.columns.close.value=privateValue;
  v.rows=Array.from({length:20},(_,i)=>({...v.rows[0],index:i,rawClose:privateValue,timestampKind:privateValue,ohlcKinds:{...v.rows[0].ohlcKinds,open:privateValue}}));
  const safe=safeRawQuoteTail(v);assert.equal(safe.rows.length,3);assert.ok(!JSON.stringify(safe).includes(privateValue));
  assert.equal(safe.rows[0].timestampKind,'other');assert.equal(safe.rows[0].ohlcKinds.open,'other');
  assert.equal(safeRawQuoteTail({version:2,rows:[]}),null);
});
function sampleRecord(ticker,reason,market='US') {return {market,ticker,status:'unavailable',issues:['QUOTE_NOT_LATEST_COMPLETED_SESSION'],
  quoteDiagnostics:{expectedSessionDate:expected,failureReason:reason,rawTail:tail('null-close')}};}
const reasons=['NO_VALID_COMPLETED_CANDLES','INSUFFICIENT_COMPLETED_HISTORY','LATEST_COMPLETED_SESSION_MISMATCH','INVALID_CAUSAL_HISTORY','QUOTE_CURRENCY_UNSUPPORTED','QUOTE_PARSE_FAILED'];
test('failure samples are deterministic under completion order and bounded per reason/market and total',()=>{
  const records=reasons.flatMap((r,i)=>['US','TW'].flatMap(m=>[sampleRecord(m==='US'?`Z${i}`:`${7100+i}`,r,m),sampleRecord(m==='US'?`A${i}`:`${6100+i}`,r,m)]));
  const a=boundedQuoteFailureSamples(records),b=boundedQuoteFailureSamples([...records].reverse());assert.deepEqual(a,b);
  assert.equal(a.quoteFailureSamples.length,12);assert.equal(a.quoteFailureSampling.eligibleCount,24);
  assert.equal(a.quoteFailureSampling.representativeness,'not_representative');
  assert.equal(new Set(a.quoteFailureSamples.map(r=>r.market+':'+r.quoteDiagnostics.failureReason)).size,12);
  assert.ok(a.quoteFailureSamples.every(r=>r.market==='US'?r.ticker.startsWith('A'):r.ticker.startsWith('6')));
  assert.ok(Buffer.byteLength(JSON.stringify(a.quoteFailureSamples))<=QUOTE_FAILURE_SAMPLE_LIMITS.maxJsonBytes);
});
test('failure log budget is enforced even for an untrusted oversized issue array; invalid identities and unknown reasons are not sampled',()=>{
  const huge=sampleRecord('A0',reasons[0]);huge.issues=Array.from({length:10000},(_,i)=>`PRIVATE_${i}`);
  const result=boundedQuoteFailureSamples([huge,sampleRecord('https://private.invalid',reasons[1]),sampleRecord('A1','PRIVATE_REASON')]);
  assert.equal(result.quoteFailureSampling.eligibleCount,1);assert.equal(result.quoteFailureSamples.length,0);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
});
test('within each reason the bounded sample prioritizes raw expected-session tails lost during parsing',()=>{
  const old=sampleRecord('A0',reasons[2]),gap=sampleRecord('Z0',reasons[2]);
  old.quoteDiagnostics.rawLatestDate='2026-10-09';old.quoteDiagnostics.parsedLatestDate='2026-10-09';
  gap.quoteDiagnostics.rawLatestDate=expected;gap.quoteDiagnostics.parsedLatestDate='2026-10-09';
  const a=boundedQuoteFailureSamples([old,gap]),b=boundedQuoteFailureSamples([gap,old]);
  assert.deepEqual(a,b);assert.deepEqual(a.quoteFailureSamples.map(r=>r.ticker),['Z0']);
});

test('all 18 synthetic collection results, generation and upload batches are byte-identical to pinned prepatch 50015150',async()=>{
  assert.deepEqual(caseNames,golden.caseNames);const records=[];
  for(const [i,name] of caseNames.entries()) {const c=fixtureCase(name,i),before=structuredClone(c.chart);
    const record=await fetchRefreshRecord(c.target,expected,refreshTime,c.fetcher);records.push(record);
    assert.equal(JSON.stringify(record),golden.recordJson[i],name);assert.deepEqual(c.chart,before,name);
    if(record.quoteDiagnostics) {assert.equal(Object.getOwnPropertyDescriptor(record,'quoteDiagnostics').enumerable,false);
      assert.ok(!JSON.stringify(record).includes('rawTail'));assert.ok(!JSON.stringify(record).includes('quoteDiagnostics'));}
  }
  const generation=prepareTaiwanRefreshGeneration(records,golden.runId);
  assert.equal(JSON.stringify(generation),golden.generationJson);assert.equal(JSON.stringify(refreshUploadBatches(generation,golden.runId)),golden.batchJson);
});
test('actual collector entry preserves baseline payloads with the established request identity serialization',async()=>{
  const cases=caseNames.map((n,i)=>fixtureCase(n,i)),logs=[],requests=[];
  await runDailyRefresh({token:'SYNTHETIC_TOKEN',key:'SYNTHETIC_KEY',runId:golden.runId,clock:()=>refreshTime,wait:async()=>{},log:line=>logs.push(line),
    verifySession:async()=>({date:expected,source:'synthetic',calendarSource:'synthetic'}),loadTargets:async()=>cases.map(c=>c.target),
    fetchRecord:async target=>{const c=cases.find(c=>c.target.ticker===target.ticker);return fetchRefreshRecord(c.target,expected,refreshTime,c.fetcher);},
    fetcher:async(url,opts)=>{
      if(String(url).endsWith('/api/daily-status'))return Response.json({valuationVersion:DAILY_VALUATION_VERSION,runId:golden.runId,state:'partial',expectedSessions:{TW:expected,US:expected}});
      const body=JSON.parse(opts.body);requests.push(opts.body);
      if(body.action==='begin')return Response.json({runId:golden.runId,state:'running'});
      return Response.json(body.action==='finalize'?{runId:golden.runId,state:'partial',coverage:{total:cases.length,TW:{total:0,ready:0,unavailable:0},US:{total:cases.length,ready:1,unavailable:cases.length-1}}}:{accepted:body.records?.length??0});
    },materializeSnapshot:async()=>({published:true})});
  // The later reliability layer freezes the payload before retry and writes
  // runId last. Preserve every pinned payload field and exact remaining bytes.
  const wireBaseline=golden.apiRequestBodies.map(raw=>{
    const {runId,...payload}=JSON.parse(raw);return JSON.stringify({...payload,runId});
  });
  assert.deepEqual(requests,wireBaseline);
  assert.deepEqual(requests.map(JSON.parse),golden.apiRequestBodies.map(JSON.parse));
  const complete=logs.filter(l=>l.startsWith('{')).map(JSON.parse).find(e=>e.event==='collector_complete');
  assert.ok(complete.quoteFailureSamples.length>0);assert.ok(complete.quoteFailureSamples.length<=12);
  assert.ok(complete.quoteFailureSamples.some(r=>r.quoteDiagnostics.rawTail.rows.some(row=>row.ohlcKinds.close==='null')));
  assert.ok(!logs.join('\n').includes('SYNTHETIC_TOKEN'));assert.ok(!logs.join('\n').includes('SYNTHETIC_KEY'));
  assert.ok(!logs.join('\n').includes('PRIVATE_STRING'));assert.ok(!logs.join('\n').includes('https://'));
  assert.deepEqual(safeQuoteDiagnostics(null),null);
});
