import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCandidate} from '../test-support/load-candidate.mjs';

const loadedRequest=await loadCandidate('request'),loadedRunner=await loadCandidate('runner');
const request=loadedRequest.module,runner=loadedRunner.module;
const {createRefreshApi,RefreshUploadError,RefreshFinalizeUncertainError,isRetryableRefreshError,
  retryDelayMs,readRefreshStatus,assertRefreshReadback}=request;
const RUN='synthetic_reliability_run',SECRET='SYNTHETIC_PRIVATE_SENTINEL';
const expected={TW:'2026-10-23',US:'2026-10-23'};
const clock=()=>new Date('2026-10-26T06:30:00Z');
const manifest={valuationVersion:'engineering-only',targets:[{ticker:'1101',market:'TW'}],expectedSessions:expected};
const coverage={total:2,TW:{total:1,ready:1,unavailable:0},US:{total:1,ready:1,unavailable:0}};
const validStatus=()=>({runId:RUN,state:'partial',expectedSessions:{...expected},coverage});
const ack=(action,body)=>action==='begin'?{runId:RUN,state:'running'}:action==='batch'?{accepted:body.records.length}
  :action==='finalize'?{runId:RUN,state:'partial',coverage}:{runId:RUN,state:'failed'};
const parsedEvents=logs=>logs.filter(s=>s.startsWith('{')).map(JSON.parse);

function apiFixture(handler) {
  const calls=[],waits=[],logs=[];
  const fetcher=async(url,options={})=>{
    const body=options.body?JSON.parse(options.body):null;
    calls.push({url:String(url),body,wireBody:options.body,options});
    return handler?handler({url:String(url),body,options,index:calls.length,calls})
      :Response.json(body?ack(body.action,body):validStatus());
  };
  const api=createRefreshApi(RUN,{token:SECRET,key:SECRET,fetcher,wait:async ms=>waits.push(ms),
    random:()=>0,now:()=>clock().getTime(),log:s=>logs.push(s)});
  return {api,fetcher,calls,waits,logs};
}

function runnerFixture({post,get,record,session}={}) {
  const calls=[],waits=[],logs=[],records=[];
  const targets=[{ticker:'1101',name:'Engineering TW control',market:'TW'},
    {ticker:'AAPL',name:'Engineering US control',market:'US'}];
  const fetcher=async(url,options={})=>{
    const body=options.body?JSON.parse(options.body):null;
    calls.push({action:body?.action??'readback',body,options});
    if(body)return post?post(body,options,calls):Response.json(ack(body.action,body));
    return get?get(options,calls):Response.json(validStatus());
  };
  const options={token:SECRET,key:SECRET,runId:RUN,clock,fetcher,random:()=>0,
    materializeSnapshot:async()=>({published:true}),
    wait:async ms=>waits.push(ms),log:s=>logs.push(s),loadTargets:async()=>targets,
    verifySession:session??(async()=>({date:expected.TW,source:'synthetic://reference',calendarSource:'synthetic://calendar'})),
    fetchRecord:async target=>{
      records.push(target.ticker);
      return record?record(target):({...target,status:'ready',fetchedAt:clock().toISOString(),issues:[SECRET],
        sources:[SECRET],stock:{privateFinancialValue:SECRET}});
    }};
  return {options,calls,waits,logs,records};
}

function brokenBody(status,error) {
  return new Response(new ReadableStream({start(controller){controller.error(error);}}),
    {status,headers:{'Content-Type':'application/json'}});
}
const bodyTimeout=()=>new DOMException(SECRET,'TimeoutError');
const bodyTransport=()=>new TypeError(SECRET,{cause:Object.assign(new Error(SECRET),{code:'ECONNRESET'})});
const bodyCancellation=()=>new DOMException(SECRET,'AbortError');
function bodyAbortsAtRequestDeadline(signal,status=200) {
  return new Response(new ReadableStream({start(controller){
    const keeper=setTimeout(()=>controller.error(new Error('SYNTHETIC_DEADLINE_NOT_TRIGGERED')),70);
    const abort=()=>{clearTimeout(keeper);controller.error(bodyCancellation());};
    if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
  }}),{status,headers:{'Content-Type':'application/json'}});
}

test('loader executes candidate request/runner and real sanitizers with explicit financial engineering stubs',()=>{
  assert.ok(loadedRequest.sourceInputs.some(p=>p.endsWith('scripts/daily-refresh-request.mjs')));
  assert.ok(loadedRequest.sourceInputs.some(p=>p.endsWith('scripts/daily-refresh-diagnostics.mjs')));
  assert.ok(loadedRequest.sourceInputs.some(p=>p.endsWith('lib/raw-quote-tail-diagnostics.ts')));
  assert.ok(loadedRunner.sourceInputs.some(p=>p.endsWith('lib/session-reference-diagnostics.ts')));
  assert.deepEqual(loadedRunner.stubbedModules,['daily-refresh-data.ts','daily-refresh-generation.ts',
    'daily-valuation-state.ts','verified-held-refresh-scope.ts'].sort());
});

test('known v120 server diagnostics survive while arbitrary valid-format private codes remain unknown',()=>{
  const known=['GENERATION_HEAD_ACTIVATION_NOT_CONFIRMED','GENERATION_SOURCE_POLICY_MISMATCH',
    'PRODUCER_POLICY_SELECTION_FORBIDDEN','DERIVATION_CERTIFICATE_MISMATCH','ACTIVE_GENERATION_REBUILD_FORBIDDEN'];
  for(const code of known) {
    const upload=new RefreshUploadError(400,{error:code+' '+SECRET,headers:{authorization:SECRET}});
    assert.equal(upload.message,`UPLOAD_400_${code}`);
    assert.equal(request.safeRefreshFailure(new Error(code+' '+SECRET)).error,code);
    assert.ok(!JSON.stringify(request.safeRefreshFailure(upload)).includes(SECRET));
  }
  const privateCode='SYNTHETIC_PRIVATE_UNKNOWN_CODE';
  assert.equal(new RefreshUploadError(400,{error:privateCode}).message,'UPLOAD_400_UNCLASSIFIED_ERROR');
  assert.deepEqual(request.safeRefreshFailure(Object.assign(new Error(privateCode),{name:SECRET})),
    {error:'UNCLASSIFIED_ERROR',errorName:'Error'});
});

test('authentication and permanent contract errors fail fast without waits',async()=>{
  for(const status of [400,401,403,404,409,413,422]) {
    const f=apiFixture(()=>Response.json({error:'UNAUTHORIZED',payload:SECRET},{status}));
    await assert.rejects(f.api({action:'begin',manifest}),e=>e instanceof RefreshUploadError&&e.status===status);
    assert.equal(f.calls.length,1);assert.deepEqual(f.waits,[]);
    assert.ok(!f.logs.join('\n').includes(SECRET));
  }
});

test('transient HTTP errors retry boundedly; redirect handling never follows another origin',async()=>{
  for(const status of [408,429,500,502,503,504]) {
    const f=apiFixture(({body,index})=>index===1?Response.json({error:'DATABASE_UNAVAILABLE'},{status})
      :Response.json(ack(body.action,body)));
    await f.api({action:'begin',manifest});
    assert.equal(f.calls.length,2);assert.equal(f.waits.length,1);
    assert.ok(f.waits[0]>=3000&&f.waits[0]<=30000);
    assert.equal(f.calls[0].options.redirect,'manual');assert.equal(f.calls[1].options.redirect,'manual');
  }
  const redirect=apiFixture(()=>new Response(null,{status:302,headers:{Location:'https://example.invalid/'+SECRET}}));
  await assert.rejects(redirect.api({action:'begin',manifest}),/UPLOAD_302_/);
  assert.equal(redirect.calls.length,1);assert.deepEqual(redirect.waits,[]);
  assert.ok(!redirect.logs.join('\n').includes(SECRET));
});

test('three attempts are the hard limit and payload identity is frozen before the first await',async()=>{
  const body={action:'batch',records:[{ticker:'1101',market:'TW',synthetic:1}]};
  const f=apiFixture(()=>Response.json({error:'DATABASE_UNAVAILABLE'},{status:503}));
  const promise=f.api(body);body.records[0].synthetic=99;body.records.push({ticker:'9999'});
  await assert.rejects(promise,/UPLOAD_503_/);
  assert.equal(f.calls.length,3);assert.equal(f.waits.length,2);
  assert.equal(new Set(f.calls.map(c=>c.wireBody)).size,1);
  assert.equal(f.calls[0].body.runId,RUN);assert.equal(f.calls[0].body.records.length,1);
  assert.equal(f.calls[0].body.records[0].synthetic,1);
  const before=f.calls.length;
  await assert.rejects(f.api({action:'begin',runId:'different_generation',manifest}),/REFRESH_REQUEST_ID_OVERRIDE/);
  assert.equal(f.calls.length,before);
});

test('Retry-After seconds/date are honored, malformed values are sanitized, and over-budget requests stop',async()=>{
  for(const value of ['10','Mon, 26 Oct 2026 06:30:10 GMT']) {
    const e=new RefreshUploadError(429,{error:'HTTP_429'},value);
    const delay=retryDelayMs(e,0,{random:()=>0,now:()=>clock().getTime()});
    assert.ok(delay>=10000&&delay<=30000);
  }
  const malformed=new RefreshUploadError(429,{error:'HTTP_429'},SECRET);
  assert.ok(!JSON.stringify(malformed).includes(SECRET));
  assert.ok(retryDelayMs(malformed,0,{random:()=>0,now:()=>clock().getTime()})>=0);
  for(const value of ['31','120','9'.repeat(400)]) {
    const f=apiFixture(()=>Response.json({error:'HTTP_429'},{status:429,headers:{'Retry-After':value}}));
    await assert.rejects(f.api({action:'begin',manifest}),/UPLOAD_429_/);
    assert.equal(f.calls.length,1,'Retry-After beyond budget must not trigger an early retry');
    assert.deepEqual(f.waits,[]);
  }
});

test('known transport/timeouts retry; active cancellation and unknown programming errors do not',async()=>{
  const transient=[new DOMException('synthetic timeout','TimeoutError'),
    new TypeError('fetch failed',{cause:Object.assign(new Error('synthetic transport'),{code:'ECONNRESET'})})];
  for(const error of transient) {
    assert.equal(isRetryableRefreshError(error),true);
    const f=apiFixture(()=>{throw error;});
    await assert.rejects(f.api({action:'begin',manifest}));
    assert.equal(f.calls.length,3);assert.equal(f.waits.length,2);
  }
  for(const error of [new DOMException('synthetic cancellation','AbortError'),new TypeError(SECRET),new Error(SECRET)]) {
    assert.equal(Boolean(isRetryableRefreshError(error)),false);
    const f=apiFixture(()=>{throw error;});
    await assert.rejects(f.api({action:'begin',manifest}));
    assert.equal(f.calls.length,1);assert.deepEqual(f.waits,[]);
  }
});

test('HTTP200 headers followed by body timeout or connection reset reach begin/batch retry policy',async()=>{
  for(const makeError of [bodyTimeout,bodyTransport])for(const body of [
    {action:'begin',manifest},{action:'batch',records:[{synthetic:true}]}]) {
    const f=apiFixture(({body,index})=>index===1?brokenBody(200,makeError()):Response.json(ack(body.action,body)));
    await f.api(body);
    assert.equal(f.calls.length,2);assert.equal(f.waits.length,1);
    assert.equal(new Set(f.calls.map(c=>c.wireBody)).size,1);
    const retry=parsedEvents(f.logs).find(e=>e.event==='refresh_request_retry');
    assert.ok(['REFRESH_REQUEST_TIMEOUT','REFRESH_TRANSPORT_FAILED'].includes(retry.error));
    assert.ok(!f.logs.join('\n').includes(SECRET));
  }
});

test('HTTP200 body transport failures preserve single-read default and allow the runner bounded second GET',async()=>{
  for(const makeError of [bodyTimeout,bodyTransport]) {
    let reads=0;
    await assert.rejects(readRefreshStatus({token:SECRET,fetcher:async()=>{reads++;return brokenBody(200,makeError());}}));
    assert.equal(reads,1);
    reads=0;
    const f=runnerFixture({get:()=>++reads===1?brokenBody(200,makeError()):Response.json(validStatus())});
    await runner.runDailyRefresh(f.options);
    assert.equal(reads,2);assert.equal(f.calls.filter(c=>c.action==='finalize').length,1);
    assert.equal(f.calls.some(c=>c.action==='fail'),false);
    assert.equal(parsedEvents(f.logs).filter(e=>e.event==='published').length,1);
    assert.ok(!f.logs.join('\n').includes(SECRET));
  }
});

test('HTTP200 finalize body failures recover only by reading the same head, including one broken readback body',async()=>{
  for(const makeError of [bodyTimeout,bodyTransport]) {
    let reads=0;
    const f=apiFixture(({body})=>body?brokenBody(200,makeError())
      :++reads===1?brokenBody(200,makeError()):Response.json(validStatus()));
    const result=await f.api({action:'finalize'});
    assert.equal(result.runId,RUN);assert.equal(result.state,'partial');
    assert.equal(f.calls.filter(c=>c.body).length,1);assert.equal(reads,2);
    assert.deepEqual(f.waits,[1000]);
    const events=parsedEvents(f.logs);
    assert.equal(events.filter(e=>e.event==='refresh_finalize_reconcile').length,1);
    assert.equal(events.filter(e=>e.event==='refresh_finalize_readback_failed').length,1);
    assert.ok(!f.logs.join('\n').includes(SECRET));
  }
});

test('401/403 remain authoritative and fail fast even when their response bodies are broken',async()=>{
  for(const status of [401,403])for(const makeError of [bodyTimeout,bodyTransport,bodyCancellation])
    for(const action of ['begin','batch','finalize']) {
      const f=apiFixture(()=>brokenBody(status,makeError()));
      await assert.rejects(f.api({action,manifest,records:[{synthetic:true}]}),e=>e instanceof RefreshUploadError
        &&e.status===status&&e.message===`UPLOAD_${status}_HTTP_${status}`);
      assert.equal(f.calls.length,1);assert.deepEqual(f.waits,[]);
      assert.ok(!f.logs.join('\n').includes(SECRET));
    }
});

test('body AbortError caused by the same request deadline is treated as TimeoutError without hiding permanent HTTP status',async t=>{
  const nativeTimeout=AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal,'timeout',()=>nativeTimeout(5));
  for(const body of [{action:'begin',manifest},{action:'batch',records:[{synthetic:true}]}]) {
    const f=apiFixture(({body,index,options})=>index===1?bodyAbortsAtRequestDeadline(options.signal)
      :Response.json(ack(body.action,body)));
    await f.api(body);assert.equal(f.calls.length,2);
    assert.equal(parsedEvents(f.logs).find(e=>e.event==='refresh_request_retry').error,'REFRESH_REQUEST_TIMEOUT');
  }
  let reads=0;
  const status=await readRefreshStatus({token:SECRET,attempts:2,wait:async()=>{},random:()=>0,
    fetcher:async(_url,options)=>++reads===1?bodyAbortsAtRequestDeadline(options.signal):Response.json(validStatus())});
  assert.equal(status.runId,RUN);assert.equal(reads,2);
  const finalize=apiFixture(({body,options})=>body?bodyAbortsAtRequestDeadline(options.signal):Response.json(validStatus()));
  assert.equal((await finalize.api({action:'finalize'})).state,'partial');
  assert.equal(finalize.calls.filter(c=>c.body).length,1);assert.equal(finalize.calls.filter(c=>!c.body).length,1);
  for(const statusCode of [401,403]) {
    const f=apiFixture(({options})=>bodyAbortsAtRequestDeadline(options.signal,statusCode));
    await assert.rejects(f.api({action:'begin',manifest}),e=>e instanceof RefreshUploadError&&e.status===statusCode);
    assert.equal(f.calls.length,1);assert.deepEqual(f.waits,[]);
  }
});

test('body cancellation is not retried; cancelling an uncertain-finalize GET stops after that one GET',async()=>{
  const ordinary=apiFixture(()=>brokenBody(200,bodyCancellation()));
  await assert.rejects(ordinary.api({action:'begin',manifest}),e=>e.name==='AbortError');
  assert.equal(ordinary.calls.length,1);assert.deepEqual(ordinary.waits,[]);
  let reads=0;
  await assert.rejects(readRefreshStatus({token:SECRET,attempts:2,wait:async()=>{throw new Error('unexpected retry');},
    fetcher:async()=>{reads++;return brokenBody(200,bodyCancellation());}}),e=>e.name==='AbortError');
  assert.equal(reads,1);
  const finalize=apiFixture(()=>brokenBody(200,bodyCancellation()));
  await assert.rejects(finalize.api({action:'finalize'}),e=>e.preserveRun===true);
  assert.equal(finalize.calls.length,1);assert.deepEqual(finalize.waits,[]);
  const uncertain=runnerFixture({post:body=>body.action==='finalize'?brokenBody(200,bodyTimeout())
    :Response.json(ack(body.action,body)),get:()=>brokenBody(200,bodyCancellation())});
  await assert.rejects(runner.runDailyRefresh(uncertain.options),/FINALIZE_OUTCOME_UNCONFIRMED/);
  assert.equal(uncertain.calls.filter(c=>c.action==='finalize').length,1);
  assert.equal(uncertain.calls.filter(c=>c.action==='readback').length,1);
  assert.equal(uncertain.calls.some(c=>c.action==='fail'),false);
  assert.ok(!uncertain.logs.join('\n').includes(SECRET));
});

test('malformed JSON and unknown body errors are content/programming failures rather than transient ordinary retries',async()=>{
  const unknown=apiFixture(()=>brokenBody(200,new TypeError(SECRET)));
  await assert.rejects(unknown.api({action:'begin',manifest}),e=>e.name==='TypeError');
  assert.equal(unknown.calls.length,1);assert.deepEqual(unknown.waits,[]);
  const f=runnerFixture({get:()=>new Response('synthetic-invalid-json',{status:200})});
  await assert.rejects(runner.runDailyRefresh(f.options),/READBACK_VERIFICATION_FAILED/);
  assert.equal(f.calls.filter(c=>c.action==='readback').length,1);
  assert.equal(f.calls.some(c=>c.action==='fail'),false);
  assert.equal(parsedEvents(f.logs).some(e=>e.event==='published'),false);
});

test('begin/batch/fail acknowledgments validate contents instead of treating HTTP200 as success',async()=>{
  const cases=[
    [{action:'begin',manifest},{runId:'other',state:'running'}],
    [{action:'begin',manifest},{runId:RUN,state:'failed'}],
    [{action:'batch',records:[{synthetic:true}]},{accepted:0}],
    [{action:'fail',error:'FAILED'},{state:'validating'}],
  ];
  for(const [body,response]of cases) {
    const f=apiFixture(()=>Response.json(response));
    await assert.rejects(f.api(body),/REFRESH_ACK_STATE_MISMATCH/);
    assert.equal(f.calls.length,1);assert.deepEqual(f.waits,[]);
  }
  const malformed=apiFixture(()=>new Response(SECRET,{status:200}));
  await assert.rejects(malformed.api({action:'begin',manifest}),/REFRESH_ACK_STATE_MISMATCH/);
  assert.equal(malformed.calls.length,1);
});

test('finalize timeout or ambiguous acknowledgment reconciles the same accepted head without another write',async()=>{
  for(const mode of ['timeout','503','validating','nonJSON']) {
    const f=apiFixture(({body})=>{
      if(!body)return Response.json(validStatus());
      if(mode==='timeout')throw new DOMException('synthetic timeout','TimeoutError');
      if(mode==='503')return Response.json({error:'DATABASE_UNAVAILABLE'},{status:503});
      if(mode==='nonJSON')return new Response(SECRET,{status:200});
      return Response.json({runId:RUN,state:'validating'});
    });
    const result=await f.api({action:'finalize'});
    assert.equal(result.runId,RUN);assert.equal(result.state,'partial');
    assert.equal(f.calls.filter(c=>c.body).length,1);
    assert.equal(f.calls.filter(c=>!c.body).length,1);
    assert.ok(f.calls.every(c=>c.options.redirect==='manual'));
    assert.ok(!f.logs.join('\n').includes(SECRET));
  }
});

test('finalize Retry-After beyond the budget preserves uncertainty without an early GET',async()=>{
  for(const header of ['60','9'.repeat(400)]) {
    const f=apiFixture(()=>Response.json({error:'HTTP_429'},{status:429,headers:{'Retry-After':header}}));
    await assert.rejects(f.api({action:'finalize'}),e=>e.message==='FINALIZE_OUTCOME_UNCONFIRMED'&&e.preserveRun===true);
    assert.equal(f.calls.length,1);assert.deepEqual(f.waits,[]);
  }
});

test('finalize transient response waits for its bounded Retry-After before reconciling',async()=>{
  for(const status of [429,503]) {
    const order=[];
    const api=createRefreshApi(RUN,{token:SECRET,key:SECRET,random:()=>0,now:()=>clock().getTime(),
      wait:async ms=>order.push({waitMs:ms}),fetcher:async(_url,options)=>{
        if(options.body) {order.push('POST');return Response.json({error:`HTTP_${status}`},
          {status,headers:{'Retry-After':'5'}});}
        order.push('GET');return Response.json(validStatus());
      }});
    assert.equal((await api({action:'finalize'})).state,'partial');
    assert.equal(order[0],'POST');assert.equal(order[2],'GET');assert.equal(order.length,3);
    assert.ok(order[1].waitMs>=5000&&order[1].waitMs<=30000);
  }
});

test('transient readback honors Retry-After before the second bounded GET; over-budget readback stops',async()=>{
  for(const status of [429,503]) {
    let reads=0;
    const f=apiFixture(({body})=>{
      if(body)throw new DOMException('synthetic timeout','TimeoutError');
      if(++reads===1)return Response.json({error:`HTTP_${status}`},{status,headers:{'Retry-After':'5'}});
      return Response.json(validStatus());
    });
    assert.equal((await f.api({action:'finalize'})).state,'partial');
    assert.equal(f.calls.filter(c=>c.body).length,1);assert.equal(reads,2);
    assert.equal(f.waits.length,1);assert.ok(f.waits[0]>=5000&&f.waits[0]<=30000);
  }
  const overBudget=apiFixture(({body})=>{
    if(body)throw new DOMException('synthetic timeout','TimeoutError');
    return Response.json({error:'HTTP_429'},{status:429,headers:{'Retry-After':'60'}});
  });
  await assert.rejects(overBudget.api({action:'finalize'}),/FINALIZE_OUTCOME_UNCONFIRMED/);
  assert.equal(overBudget.calls.filter(c=>!c.body).length,1);assert.deepEqual(overBudget.waits,[]);
});

test('permanent readback rejection stops reconciliation even when a Retry-After header is present',async()=>{
  for(const status of [302,400,401,403,404]) {
    const f=apiFixture(({body})=>{
      if(body)throw new DOMException('synthetic timeout','TimeoutError');
      return new Response(null,{status,headers:{'Retry-After':'5'}});
    });
    await assert.rejects(f.api({action:'finalize'}),/FINALIZE_OUTCOME_UNCONFIRMED/);
    assert.equal(f.calls.filter(c=>c.body).length,1);assert.equal(f.calls.filter(c=>!c.body).length,1);
    assert.deepEqual(f.waits,[]);
  }
});

test('unknown finalize fetch failure remains uncertain and reconciles rather than marking a possibly active run failed',async()=>{
  const f=apiFixture(({body})=>{if(body)throw new TypeError(SECRET);return Response.json(validStatus());});
  const result=await f.api({action:'finalize'});
  assert.equal(result.state,'partial');assert.equal(f.calls.filter(c=>c.body).length,1);
  assert.equal(f.calls.filter(c=>!c.body).length,1);
});

test('unconfirmed finalize is bounded, preserves the run and never fabricates success from the prior head',async()=>{
  for(const status of [{...validStatus(),runId:'prior_generation'},
    {...validStatus(),state:'validating'},{...validStatus(),state:'failed'}]) {
    const f=apiFixture(({body})=>{if(body)throw new DOMException('synthetic timeout','TimeoutError');return Response.json(status);});
    await assert.rejects(f.api({action:'finalize'}),e=>e instanceof RefreshFinalizeUncertainError
      &&e.preserveRun===true&&e.message==='FINALIZE_OUTCOME_UNCONFIRMED');
    assert.equal(f.calls.filter(c=>c.body).length,1);
    assert.equal(f.calls.filter(c=>!c.body).length,2);assert.deepEqual(f.waits,[1000]);
  }
  const denied=apiFixture(({body})=>{if(body)throw new DOMException('synthetic timeout','TimeoutError');return Response.json({error:'UNAUTHORIZED'},{status:401});});
  await assert.rejects(denied.api({action:'finalize'}),/FINALIZE_OUTCOME_UNCONFIRMED/);
  assert.equal(denied.calls.filter(c=>!c.body).length,1);assert.deepEqual(denied.waits,[]);
});

test('HTTP200 failed finalize is authoritative rejection and is never a published result',async()=>{
  const f=apiFixture(()=>Response.json({runId:RUN,state:'failed'}));
  await assert.rejects(f.api({action:'finalize'}),/REFRESH_ACK_STATE_MISMATCH/);
  assert.equal(f.calls.length,1);
});

test('failed acknowledgment with wrong or missing run identity is reconciled, not attributed to the requested run',async()=>{
  for(const identity of ['different_generation',undefined]) {
    const malformed={state:'failed',...(identity?{runId:identity}:{})};
    const f=apiFixture(({body})=>Response.json(body?malformed:validStatus()));
    const result=await f.api({action:'finalize'});
    assert.equal(result.runId,RUN);assert.equal(result.state,'partial');
    assert.equal(f.calls.filter(c=>c.body).length,1);
    assert.equal(f.calls.filter(c=>!c.body).length,1);

    const pipeline=runnerFixture({post:body=>Response.json(body.action==='finalize'?malformed:ack(body.action,body)),
      get:()=>Response.json({...validStatus(),runId:'prior_generation'})});
    await assert.rejects(runner.runDailyRefresh(pipeline.options),e=>e.message==='FINALIZE_OUTCOME_UNCONFIRMED'&&e.preserveRun===true);
    assert.equal(pipeline.calls.filter(c=>c.action==='finalize').length,1);
    assert.equal(pipeline.calls.filter(c=>c.action==='readback').length,2);
    assert.equal(pipeline.calls.some(c=>c.action==='fail'),false);
    assert.equal(parsedEvents(pipeline.logs).some(e=>e.event==='published'),false);
  }
});

test('cancelling a finalize stops new requests and preserves the potentially dispatched run',async()=>{
  const f=apiFixture(()=>{throw new DOMException('synthetic cancellation','AbortError');});
  await assert.rejects(f.api({action:'finalize'}),e=>e.message==='FINALIZE_OUTCOME_UNCONFIRMED'&&e.preserveRun===true);
  assert.equal(f.calls.length,1);assert.deepEqual(f.waits,[]);
  const pipeline=runnerFixture({post:body=>{
    if(body.action==='finalize')throw new DOMException('synthetic cancellation','AbortError');
    return Response.json(ack(body.action,body));
  }});
  await assert.rejects(runner.runDailyRefresh(pipeline.options),/FINALIZE_OUTCOME_UNCONFIRMED/);
  assert.equal(pipeline.calls.some(c=>c.action==='fail'||c.action==='readback'),false);
});

test('ordinary, finalize and readback deadlines remain bounded at their intended budgets',async t=>{
  const budgets=[],nativeTimeout=AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal,'timeout',ms=>{budgets.push(ms);return nativeTimeout(ms);});
  const f=apiFixture();
  await f.api({action:'begin',manifest});
  await f.api({action:'batch',records:[{synthetic:true}]});
  await f.api({action:'fail',error:'FAILED'});
  await f.api({action:'finalize'});
  await readRefreshStatus({token:SECRET,fetcher:f.fetcher});
  assert.deepEqual(budgets,[45000,45000,45000,180000,15000]);
});

test('jitter is injectable and deterministic without violating the bounded wait budget',()=>{
  const error=new RefreshUploadError(503,{error:'DATABASE_UNAVAILABLE'});
  const at=r=>retryDelayMs(error,0,{random:()=>r,now:()=>clock().getTime()});
  assert.equal(at(.5),at(.5));
  assert.ok(at(0)>=0&&at(.5)>=at(0)&&at(1)>=at(.5)&&at(1)<=30000);
  for(const random of [-10,Infinity,NaN,100]) {
    const delay=at(random);assert.ok(Number.isFinite(delay)&&delay>=0&&delay<=30000);
  }
});

test('readback rejects wrong run, state or expected session dates and always has a bounded signal',async()=>{
  assert.equal(assertRefreshReadback(validStatus(),RUN,expected).state,'partial');
  for(const status of [null,{...validStatus(),runId:'prior'}, {...validStatus(),state:'failed'},
    {...validStatus(),expectedSessions:{TW:'2026-10-22',US:'2026-10-23'}}])
    assert.throws(()=>assertRefreshReadback(status,RUN,expected),/READBACK_VERIFICATION_FAILED/);
  let options;
  await readRefreshStatus({token:SECRET,fetcher:async(_url,args)=>{options=args;return Response.json(validStatus());}});
  assert.equal(options.redirect,'manual');assert.ok(options.signal instanceof AbortSignal);
  await assert.rejects(readRefreshStatus({token:SECRET,timeoutMs:3,fetcher:async(_url,args)=>{
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(resolve,30);
      args.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(args.signal.reason);},{once:true});
    });return Response.json(validStatus());
  }}),e=>e.name==='TimeoutError');
});

test('runner success publishes only after matching dated readback; secrets and finance fields stay out of logs',async()=>{
  const f=runnerFixture();await runner.runDailyRefresh(f.options);
  const actions=f.calls.map(c=>c.action);
  assert.deepEqual(actions,['begin','batch','finalize','readback']);
  assert.equal(f.records.length,2);assert.ok(f.calls.every(c=>c.options.redirect==='manual'));
  const events=parsedEvents(f.logs),published=events.find(e=>e.event==='published');
  assert.equal(published.runId,RUN);assert.equal(published.state,'partial');assert.equal(published.phase,'readback');
  assert.ok(events.find(e=>e.event==='collector_complete'));
  assert.ok(!f.logs.join('\n').includes(SECRET));assert.ok(!f.logs.join('\n').includes('privateFinancialValue'));
});

test('runner recovers one transient post-finalize readback failure and publishes exactly once after the matching GET',async()=>{
  let reads=0;
  const f=runnerFixture({get:()=>++reads===1
    ?Response.json({error:'DATABASE_UNAVAILABLE',secret:SECRET},{status:503})
    :Response.json(validStatus())});
  f.options.log=line=>{
    f.logs.push(line);
    if(line.startsWith('{')&&JSON.parse(line).event==='published')assert.equal(reads,2);
  };
  await runner.runDailyRefresh(f.options);
  assert.equal(f.calls.filter(c=>c.action==='finalize').length,1);
  assert.equal(f.calls.filter(c=>c.action==='readback').length,2);
  assert.equal(f.calls.some(c=>c.action==='fail'),false);
  const events=parsedEvents(f.logs);
  assert.equal(events.filter(e=>e.event==='published').length,1);
  assert.equal(events.some(e=>e.event==='refresh_failed'),false);
  assert.equal(events.filter(e=>e.event==='refresh_request_retry'&&e.phase==='readback').length,1);
  assert.equal(f.waits.length,2);assert.equal(f.waits[0],150);
  assert.ok(f.waits[1]>=3000&&f.waits[1]<=30000);
  assert.ok(!f.logs.join('\n').includes(SECRET));
});

test('runner persistent post-finalize 503 stops after two GETs without failing an acknowledged run or publishing',async()=>{
  const f=runnerFixture({get:()=>Response.json({error:'DATABASE_UNAVAILABLE'},{status:503})});
  await assert.rejects(runner.runDailyRefresh(f.options),/UPLOAD_503_DATABASE_UNAVAILABLE/);
  assert.equal(f.calls.filter(c=>c.action==='finalize').length,1);
  assert.equal(f.calls.filter(c=>c.action==='readback').length,2);
  assert.equal(f.calls.some(c=>c.action==='fail'),false);
  const events=parsedEvents(f.logs);
  assert.equal(events.some(e=>e.event==='published'),false);
  assert.equal(events.find(e=>e.event==='refresh_failed').phase,'readback');
  assert.equal(f.waits.length,2);
});

test('runner wrong head, nonterminal state or mismatched dates are not transient readback retries',async()=>{
  for(const body of [{...validStatus(),runId:'prior_generation'},
    {...validStatus(),state:'validating'},{...validStatus(),state:'failed'},
    {...validStatus(),expectedSessions:{...expected,US:'2026-10-22'}}]) {
    const f=runnerFixture({get:()=>Response.json(body)});
    await assert.rejects(runner.runDailyRefresh(f.options),/READBACK_VERIFICATION_FAILED/);
    assert.equal(f.calls.filter(c=>c.action==='readback').length,1);
    assert.equal(f.calls.some(c=>c.action==='fail'),false);
    assert.deepEqual(f.waits,[150]);
    assert.equal(parsedEvents(f.logs).some(e=>e.event==='published'),false);
  }
});

test('runner post-finalize readback respects Retry-After budget and permanent rejection without extra GETs',async()=>{
  for(const [status,header] of [[429,'60'],[503,'9'.repeat(400)],[401,'5'],[403,'5']]) {
    const f=runnerFixture({get:()=>Response.json({error:`HTTP_${status}`},
      {status,headers:{'Retry-After':header}})});
    await assert.rejects(runner.runDailyRefresh(f.options),e=>e.message.startsWith(`UPLOAD_${status}_`));
    assert.equal(f.calls.filter(c=>c.action==='readback').length,1);
    assert.equal(f.calls.some(c=>c.action==='fail'),false);
    assert.deepEqual(f.waits,[150]);
    assert.equal(parsedEvents(f.logs).some(e=>e.event==='published'),false);
  }
});

test('runner 401 during begin collects no records and performs no cleanup write',async()=>{
  const f=runnerFixture({post:()=>Response.json({error:'HTTP_401'},{status:401})});
  await assert.rejects(runner.runDailyRefresh(f.options),/UPLOAD_401_/);
  assert.deepEqual(f.calls.map(c=>c.action),['begin']);assert.equal(f.records.length,0);
  const failed=parsedEvents(f.logs).find(e=>e.event==='refresh_failed');assert.equal(failed.phase,'begin');
  assert.equal(failed.httpStatus,401);assert.ok(!f.logs.join('\n').includes(SECRET));
});

test('runner records preflight/collection/prepare phases without exposing arbitrary error text',async()=>{
  const cases=[
    ['preflight',{session:async()=>{throw new Error(SECRET);}}],
    ['collect',{record:async()=>{throw new TypeError(SECRET);}}],
    ['prepare',{record:target=>({...target,status:'ready',issues:[],sources:[],syntheticPrepareFailure:true})}],
  ];
  for(const [phase,overrides]of cases) {
    const f=runnerFixture(overrides);
    await assert.rejects(runner.runDailyRefresh(f.options));
    const failed=parsedEvents(f.logs).find(e=>e.event==='refresh_failed');
    assert.equal(failed.phase,phase);assert.equal(failed.error,'UNCLASSIFIED_ERROR');
    assert.ok(!f.logs.join('\n').includes(SECRET));assert.equal(parsedEvents(f.logs).some(e=>e.event==='published'),false);
    if(phase==='preflight')assert.equal(f.calls.length,0);
    else assert.equal(f.calls.at(-1).action,'fail');
  }
});

test('runner identifies an upload-batch failure and preserves the original safe cause',async()=>{
  const f=runnerFixture({post:body=>{
    if(body.action==='batch')throw new TypeError(SECRET);
    return Response.json(ack(body.action,body));
  }});
  await assert.rejects(runner.runDailyRefresh(f.options));
  assert.equal(f.calls.filter(c=>c.action==='batch').length,1);
  assert.equal(f.calls.at(-1).action,'fail');
  const failed=parsedEvents(f.logs).find(e=>e.event==='refresh_failed');
  assert.equal(failed.phase,'batch');assert.equal(failed.error,'UNCLASSIFIED_ERROR');
  assert.ok(!f.logs.join('\n').includes(SECRET));
  assert.equal(parsedEvents(f.logs).some(e=>e.event==='published'),false);
});

test('runner definitive finalize rejection keeps diagnostics and never publishes',async()=>{
  const f=runnerFixture({post:body=>body.action==='finalize'
    ?Response.json({error:'INSUFFICIENT_MARKET_COVERAGE',diagnostics:{phase:'finalize',failingMarket:'TW',coverage,
      requiredReady:{TW:1,US:1},expectedSessions:expected,secret:SECRET}},{status:400})
    :Response.json(ack(body.action,body))});
  await assert.rejects(runner.runDailyRefresh(f.options),/UPLOAD_400_INSUFFICIENT_MARKET_COVERAGE/);
  assert.equal(f.calls.filter(c=>c.action==='finalize').length,1);assert.equal(f.calls.at(-1).action,'fail');
  const events=parsedEvents(f.logs),failed=events.find(e=>e.event==='refresh_failed');
  assert.equal(failed.phase,'finalize');assert.equal(failed.finalizeDiagnostics.failingMarket,'TW');
  assert.equal(events.some(e=>e.event==='published'),false);assert.ok(!f.logs.join('\n').includes(SECRET));
});

test('runner uncertain finalize never issues fail and retains no false publication',async()=>{
  const f=runnerFixture({post:body=>{
    if(body.action==='finalize')throw new DOMException('synthetic timeout','TimeoutError');
    return Response.json(ack(body.action,body));
  },get:()=>Response.json({...validStatus(),runId:'prior_generation'})});
  await assert.rejects(runner.runDailyRefresh(f.options),/FINALIZE_OUTCOME_UNCONFIRMED/);
  assert.equal(f.calls.filter(c=>c.action==='finalize').length,1);
  assert.equal(f.calls.filter(c=>c.action==='readback').length,2);
  assert.equal(f.calls.some(c=>c.action==='fail'),false);
  const failed=parsedEvents(f.logs).find(e=>e.event==='refresh_failed');
  assert.equal(failed.phase,'finalize');assert.equal(failed.preservedRun,true);
  assert.equal(parsedEvents(f.logs).some(e=>e.event==='published'),false);
});

test('runner acknowledged finalize plus wrong dated readback remains failed but does not fail an accepted run',async()=>{
  const f=runnerFixture({get:()=>Response.json({...validStatus(),expectedSessions:{...expected,TW:'2026-10-22'}})});
  await assert.rejects(runner.runDailyRefresh(f.options),/READBACK_VERIFICATION_FAILED/);
  assert.equal(f.calls.some(c=>c.action==='fail'),false);
  const events=parsedEvents(f.logs);assert.equal(events.some(e=>e.event==='published'),false);
  assert.equal(events.find(e=>e.event==='refresh_failed').phase,'readback');
});
