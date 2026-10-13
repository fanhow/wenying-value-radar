import test from 'node:test';
import assert from 'node:assert/strict';
import {runDailyRefresh,createRefreshApi,RefreshUploadError} from '../scripts/daily-refresh.mjs';
import {summarizeCollector,safeCoverageDiagnostics} from '../scripts/daily-refresh-diagnostics.mjs';

// Synthetic metadata only; none of these observations came from a market provider.
const expected='2026-10-12',clock=()=>new Date('2026-10-13T03:06:40Z');
const targets=[{market:'TW',ticker:'1101',listingBoard:'TWSE'},
  {market:'TW',ticker:'6488',listingBoard:'TPEx'},{market:'US',ticker:'AAPL'}];
const secret='PRIVATE_TEST_SENTINEL';
const quote=(observed,reason)=>({expectedSessionDate:expected,observedQuoteDate:observed,
  rawLatestTimestamp:1791766800,rawLatestDate:expected,parsedLatestDate:observed,rawBarCount:81,
  parsedBarCount:80,completedBarCount:80,minimumBars:60,missingOhlcByField:{open:0,high:0,low:0,close:1},
  invalidOhlcRangeCount:0,expectedSessionRawBars:1,expectedSessionIncompleteOhlcBars:observed===expected?0:1,
  invalidTimestampCount:0,failureReason:reason,headers:{authorization:secret},financialPayload:{secret}});
const rows=targets.map((target,index)=>({...target,status:index===2?'ready':'unavailable',
  fetchedAt:clock().toISOString(),sources:[secret],issues:index===2?[]:['QUOTE_NOT_LATEST_COMPLETED_SESSION'],
  quoteDiagnostics:quote(index===2?expected:'2026-10-08',index===2?null:'LATEST_COMPLETED_SESSION_MISMATCH'),
  stock:index===2?{privateFinancialValue:secret}:undefined}));
const finalizeDiagnostics={phase:'finalize',failingMarket:'TW',
  coverage:{total:3,TW:{total:2,ready:0,unavailable:2},US:{total:1,ready:1,unavailable:0}},
  requiredReady:{TW:1,US:1},expectedSessions:{TW:expected,US:expected},
  requestBody:{token:secret},responseBody:secret,headers:{authorization:secret}};

function fixture(finalizeStatus=400) {
  const logs=[],calls=[],waits=[];
  const fetcher=async(url,options)=>{
    if(String(url).endsWith('/api/daily-status')) {
      calls.push({action:'readback'});
      return Response.json({runId:'offline_collector_run',state:'partial'});
    }
    const body=JSON.parse(options.body);calls.push(body);
    assert.ok(['begin','batch','finalize','fail'].includes(body.action));
    if(body.action==='finalize')return Response.json(finalizeStatus===400
      ?{error:'INSUFFICIENT_MARKET_COVERAGE',diagnostics:finalizeDiagnostics,secret}
      :{runId:body.runId,state:'partial',coverage:finalizeDiagnostics.coverage,secret},{status:finalizeStatus});
    return Response.json({accepted:body.records?.length??0,state:'running'});
  };
  const options={token:secret,key:secret,runId:'offline_collector_run',clock,fetcher,
    verifySession:async()=>({date:expected,source:'synthetic',calendarSource:'synthetic'}),
    loadTargets:async()=>targets,fetchRecord:async target=>rows.find(row=>row.ticker===target.ticker),
    wait:async ms=>waits.push(ms),log:line=>logs.push(line)};
  return {options,logs,calls,waits};
}

test('finalize rejection preserves collector counts, three sample dates and safe response diagnostics',async()=>{
  const {options,logs,calls,waits}=fixture();
  await assert.rejects(runDailyRefresh(options),error=>error instanceof RefreshUploadError
    &&error.message==='UPLOAD_400_INSUFFICIENT_MARKET_COVERAGE');
  const events=logs.map(line=>JSON.parse(line));
  const completed=events.find(event=>event.event==='collector_complete');
  const failed=events.find(event=>event.event==='refresh_failed');
  assert.deepEqual(completed.coverage.TW,{total:2,checked:2,ready:0,unavailable:2,missing:0});
  assert.deepEqual(completed.coverage.US,{total:1,checked:1,ready:1,unavailable:0,missing:0});
  assert.equal(completed.quoteDates.TW.completed['2026-10-08'],2);
  assert.equal(completed.quoteDates.US.completed[expected],1);
  assert.equal(completed.quoteFailureReasons.TW.LATEST_COMPLETED_SESSION_MISMATCH,2);
  assert.deepEqual(completed.quoteSamples.map(row=>[row.market,row.ticker,row.expectedSessionDate,
    row.quoteDiagnostics.observedQuoteDate]),[['TW','1101',expected,'2026-10-08'],
    ['TW','6488',expected,'2026-10-08'],['US','AAPL',expected,expected]]);
  assert.deepEqual(failed.coverage,completed.coverage);
  assert.equal(failed.finalizeDiagnostics.failingMarket,'TW');
  assert.equal(failed.finalizeDiagnostics.requiredReady.TW,1);
  assert.ok(events.findIndex(event=>event.event==='collector_complete')<events.findIndex(event=>event.event==='refresh_failed'));
  assert.equal(events.some(event=>event.event==='published'),false);
  assert.equal(calls.filter(call=>call.action==='finalize').length,3);
  assert.equal(calls.at(-1).action,'fail');
  assert.equal(calls.some(call=>call.action==='readback'),false);
  assert.deepEqual(waits,[150,3000,6000]);
  assert.ok(!logs.join('\n').includes(secret));
  assert.ok(!logs.join('\n').includes('privateFinancialValue'));
});

test('an old server without diagnostics still yields the collector failure summary',async()=>{
  const {options,logs}=fixture();
  options.fetcher=async(_url,options)=>{
    const body=JSON.parse(options.body);
    return Response.json(body.action==='finalize'?{error:'INSUFFICIENT_MARKET_COVERAGE'}:{},
      {status:body.action==='finalize'?400:200});
  };
  await assert.rejects(runDailyRefresh(options),/UPLOAD_400_INSUFFICIENT_MARKET_COVERAGE/);
  const failed=logs.map(JSON.parse).find(event=>event.event==='refresh_failed');
  assert.equal(failed.finalizeDiagnostics,null);assert.equal(failed.coverage.TW.unavailable,2);
});

test('a successful partial refresh still verifies the matching head after diagnostics',async()=>{
  const {options,logs,calls}=fixture(200);
  await runDailyRefresh(options);
  assert.equal(calls.at(-1).action,'readback');
  assert.equal(calls.filter(call=>call.action==='finalize').length,1);
  assert.equal(calls.some(call=>call.action==='fail'),false);
  const events=logs.slice(0,-1).map(JSON.parse);
  assert.ok(events.find(event=>event.event==='collector_complete'));
  assert.ok(events.find(event=>event.event==='published'&&event.state==='partial'));
  assert.equal(events.some(event=>event.event==='refresh_failed'),false);
  assert.ok(!logs.join('\n').includes(secret));
});

test('a rate-limit abort records missing targets and does not proceed to batch/finalize',async()=>{
  const {options,logs,calls}=fixture();
  const many=Array.from({length:120},(_,index)=>({market:'TW',ticker:String(1100+index)}));
  options.loadTargets=async()=>many;
  options.fetchRecord=async target=>({...target,status:'unavailable',issues:['UPSTREAM_HTTP_429'],sources:[]});
  await assert.rejects(runDailyRefresh(options),/PROVIDER_RATE_LIMITED/);
  const failed=logs.map(JSON.parse).find(event=>event.event==='refresh_failed');
  assert.equal(failed.coverage.TW.checked,104);assert.equal(failed.coverage.TW.missing,16);
  assert.equal(failed.issues.TW.UPSTREAM_HTTP_429,104);
  assert.equal(logs.some(line=>line.includes('collector_complete')),false);
  assert.deepEqual(calls.map(call=>call.action),['begin','fail']);
});

test('a bad readback still fails rather than accepting the published response alone',async()=>{
  const {options,logs}=fixture(200),original=options.fetcher;
  options.fetcher=async(url,args)=>String(url).endsWith('/api/daily-status')
    ?Response.json({runId:'previous_generation',state:'partial'}):original(url,args);
  await assert.rejects(runDailyRefresh(options),/READBACK_VERIFICATION_FAILED/);
  assert.equal(logs.map(JSON.parse).at(-1).error,'READBACK_VERIFICATION_FAILED');
});

test('non-JSON and untrusted response fields cannot leak into diagnostic errors',async()=>{
  const waits=[],api=createRefreshApi('offline_run',{token:secret,key:secret,wait:async ms=>waits.push(ms),
    fetcher:async()=>new Response(secret,{status:400})});
  await assert.rejects(api({action:'finalize'}),/UPLOAD_400_HTTP_400/);
  assert.deepEqual(waits,[3000,6000]);
  const error=new RefreshUploadError(400,{error:secret+' '+secret,diagnostics:finalizeDiagnostics,secret});
  assert.equal(error.message,'UPLOAD_400_UNCLASSIFIED_ERROR');
  assert.ok(!JSON.stringify(error.diagnostics).includes(secret));
  assert.equal(safeCoverageDiagnostics({...finalizeDiagnostics,coverage:{...finalizeDiagnostics.coverage,
    TW:{total:2,ready:secret,unavailable:2}}}),null);
});

test('uncollected samples and omitted raw diagnostics remain explicit unknowns',()=>{
  const summary=summarizeCollector([{market:'TW',ticker:'1101',status:'unavailable',issues:['UPSTREAM_HTTP_403']}],targets,
    {TW:expected,US:expected});
  assert.equal(summary.quoteSamples[0].quoteDiagnostics,null);
  assert.equal(summary.quoteSamples[1].status,'not_collected');
  assert.equal(summary.quoteDates.TW.raw.unknown,1);
  assert.equal(summary.coverage.TW.missing,1);assert.equal(summary.coverage.US.missing,1);
});

test('valid-format private sentinels cannot enter errors, issue labels, failure reasons or published runId',async()=>{
  const sentinel='SYNTHETIC_PRIVATE_SENTINEL';
  const error=new RefreshUploadError(400,{error:sentinel,diagnostics:finalizeDiagnostics});
  assert.equal(error.message,'UPLOAD_400_UNCLASSIFIED_ERROR');
  const {options,logs}=fixture(200),original=options.fetcher;
  options.fetchRecord=async target=>({...rows.find(row=>row.ticker===target.ticker),issues:[sentinel],
    quoteDiagnostics:{...quote(expected,null),failureReason:sentinel}});
  options.fetcher=async(url,args)=>{
    const body=args?.body?JSON.parse(args.body):null;
    return body?.action==='finalize'?Response.json({runId:sentinel,state:'partial',coverage:finalizeDiagnostics.coverage}):original(url,args);
  };
  await runDailyRefresh(options);
  assert.ok(!logs.join('\n').includes(sentinel));
  const events=logs.slice(0,-1).map(JSON.parse);
  const completed=events.find(event=>event.event==='collector_complete');
  assert.equal(completed.issues.TW.UNCLASSIFIED_ERROR,2);
  assert.equal(completed.quoteFailureReasons.TW.UNCLASSIFIED_ERROR,2);
  assert.equal(events.find(event=>event.event==='published').runId,'offline_collector_run');
});
