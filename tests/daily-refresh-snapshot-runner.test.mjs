import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCandidate} from '../test-support/load-candidate.mjs';
import {RESEARCH_SNAPSHOT_VERSION,RESEARCH_PEER_VERSION,REFRESH_SITE_BASE_URL}
  from '../scripts/daily-refresh-snapshot.mjs';

const loaded=await loadCandidate('runner'),{runDailyRefresh}=loaded.module;
const runId='synthetic_runner_snapshot_run',jobId='tws_synthetic_runner_snapshot';
const token='SYNTHETIC_RUNNER_PRIVATE_TOKEN',key='SYNTHETIC_RUNNER_PRIVATE_KEY';
const privateValue='SYNTHETIC_RUNNER_PRIVATE_FINANCIAL_VALUE';
const expectedSessions={TW:'2026-10-23',US:'2026-10-23'};
// The loader explicitly replaces the financial engine/version boundary.
const valuationVersion='tw-comparables-2026-10-03-method-notes-v4';
const coverage={total:3,TW:{total:2,ready:2,unavailable:0},US:{total:1,ready:1,unavailable:0}};
const job=(revision,phase,scanCount=0,verifiedCount=0)=>({jobId,revision,phase,
  published:phase==='published',expectedCount:2,scanCount,verifiedCount});
const jobs=[job(0,'anchors'),job(1,'scan'),job(2,'scan',2),job(3,'verify',2),
  job(4,'verify',2,2),job(5,'published',2,2)];
const cold=()=>({researchSnapshotVersion:RESEARCH_SNAPSHOT_VERSION,
  researchSnapshot:{snapshotId:jobId,runId,version:RESEARCH_SNAPSHOT_VERSION,
    policyVersion:'b'.repeat(64),quoteDate:expectedSessions.TW},
  researchStatus:'current',researchStatusByMarket:{TW:'current',US:'refresh_required'},
  formalStatusByMarket:{TW:'current'},researchRequestedMarkets:['TW'],
  researchPage:{limit:1,offset:0,market:'TW',sort:'upside',filter:'all',query:''},
  // Research candidates may be a strict subset of the ready financial cohort.
  researchTotalCounts:{TW:1},researchCounts:{TW:1},
  freshness:{runId,state:'partial',expectedSessions,valuationVersion,
    taiwanValuationCurrent:true,sourcePolicyCurrent:true},
  effectivePeerContext:{runId,quoteDate:expectedSessions.TW,version:RESEARCH_PEER_VERSION,
    sealDigest:'a'.repeat(64),anchors:{private:privateValue}},
  researchCandidates:[{privateFinancialValue:privateValue}]});
const events=logs=>logs.filter(line=>line.startsWith('{')).map(JSON.parse);
const actions=calls=>calls.map(call=>call.body?.action??
  (new URL(call.url).pathname==='/api/daily-status'?'financial-readback':'snapshot-cold-readback'));

function fixture({intercept}={}) {
  const calls=[],logs=[],waits=[],collected=[],logPositions=[];
  let current=structuredClone(jobs[0]),time=Date.parse('2026-10-26T06:30:00Z');
  const financial={runId:null,state:'running',finalized:false,readbackAccepted:false};
  const targets=[{ticker:'1101',name:'Synthetic TW issuer',market:'TW'},
    {ticker:'6488',name:'Synthetic TW issuer two',market:'TW'},
    {ticker:'AAPL',name:'Synthetic US issuer',market:'US'}];
  const status=()=>({runId:financial.runId,state:financial.state,expectedSessions,coverage,
    valuationVersion,taiwanValuationCurrent:true,sourcePolicyCurrent:true});
  const options={runId,token,key,clock:()=>new Date(time),random:()=>0,
    wait:async ms=>waits.push(ms),log:line=>{logs.push(line);logPositions.push(calls.length);},loadTargets:async()=>targets,
    verifySession:async()=>({date:expectedSessions.TW,source:'synthetic://reference',calendarSource:'synthetic://calendar'}),
    fetchRecord:async target=>{
      collected.push(target.ticker);
      return {...target,status:'ready',fetchedAt:new Date(time).toISOString(),issues:[],
        sources:[privateValue],stock:{privateFinancialValue:privateValue}};
    },fetcher:async(url,request={})=>{
      const body=request.body?JSON.parse(request.body):null,call={url:String(url),request,body};calls.push(call);
      assert.equal(new URL(url).origin,REFRESH_SITE_BASE_URL,'all network traffic is intercepted at the trusted origin');
      const override=await intercept?.({call,calls,current:structuredClone(current),financial,
        status:status(),setJob:value=>{current=structuredClone(value);},setTime:value=>{time=value;}});
      if(override!==undefined)return override;
      switch(body?.action) {
        case 'begin':return Response.json({runId,state:'running'});
        case 'batch':return Response.json({accepted:body.records.length});
        case 'finalize':financial.runId=runId;financial.state='partial';financial.finalized=true;
          return Response.json({runId,state:financial.state,coverage});
        case 'fail':financial.state='failed';return Response.json({runId,state:'failed'});
        case 'snapshot-prepare':
          assert.equal(financial.finalized,true);assert.equal(financial.readbackAccepted,true);
          return Response.json(current);
        case 'snapshot-status':return Response.json({...current,runId,sourceCurrent:true});
        case 'snapshot-advance':
          assert.equal(body.jobId,current.jobId);assert.equal(body.expectedRevision,current.revision);
          current=structuredClone(jobs[current.revision+1]);return Response.json(current);
      }
      assert.equal(body,null,'unrecognized POST is forbidden in the mock');
      if(new URL(url).pathname==='/api/daily-status') {
        assert.equal(financial.finalized,true);financial.readbackAccepted=true;return Response.json(status());
      }
      assert.equal(new URL(url).pathname,'/api/market-scan');return Response.json(cold());
    }};
  return {options,calls,logs,waits,collected,financial,logPositions};
}
function assertRetainedFinancial(h,result) {
  assert.deepEqual(result,{runId,financialPublished:true,researchSnapshotPublished:false});
  assert.equal(h.financial.runId,runId);assert.equal(h.financial.state,'partial');
  assert.equal(actions(h.calls).filter(action=>action==='finalize').length,1);
  assert.equal(actions(h.calls).includes('fail'),false);
  const emitted=events(h.logs),published=emitted.filter(event=>event.event==='published');
  assert.equal(published.length,1);assert.equal(published[0].publication,'financial');
  assert.equal(emitted.some(event=>event.event==='refresh_failed'),false);
  assert.equal(emitted.filter(event=>event.event==='research_snapshot_failed').length,1);
  assert.equal(emitted.some(event=>event.event==='research_snapshot_published'),false);
  const failed=emitted.find(event=>event.event==='research_snapshot_failed');
  assert.equal(failed.financialPublished,true);
  for(const secret of [token,key,privateValue])assert.ok(!h.logs.join('\n').includes(secret));
  return failed;
}

test('the default runner materializes only after financial acceptance and emits snapshot success after a cold GET',async()=>{
  assert.ok(loaded.sourceInputs.some(path=>path.endsWith('scripts/daily-refresh-snapshot.mjs')));
  const h=fixture();assert.equal(Object.hasOwn(h.options,'materializeSnapshot'),false);
  const result=await runDailyRefresh(h.options);
  assert.deepEqual(result,{runId,financialPublished:true,researchSnapshotPublished:true});
  assert.deepEqual(h.collected,['1101','6488','AAPL']);
  assert.deepEqual(actions(h.calls),['begin','batch','finalize','financial-readback',
    'snapshot-prepare','snapshot-status',...Array(5).fill('snapshot-advance'),
    'snapshot-status','snapshot-cold-readback']);
  const emitted=events(h.logs),financial=emitted.findIndex(event=>event.event==='published');
  const snapshot=emitted.findIndex(event=>event.event==='research_snapshot_published');
  assert.equal(emitted[financial].publication,'financial');assert.ok(snapshot>financial);
  assert.equal(emitted[snapshot].financialPublished,true);
  assert.equal(emitted[snapshot].researchSnapshotVersion,RESEARCH_SNAPSHOT_VERSION);
  const publicationLog=h.logs.findIndex(line=>line.includes('"event":"research_snapshot_published"'));
  assert.equal(h.logPositions[publicationLog],h.calls.length,'snapshot success is logged only after the cold response');
  assert.equal(emitted.some(event=>event.event==='research_snapshot_failed'||event.event==='refresh_failed'),false);
  for(const {url,request,body} of h.calls) {
    const headers=new Headers(request.headers);assert.equal(headers.get('OAI-Sites-Authorization'),`Bearer ${token}`);
    assert.equal(request.redirect,'manual');
    if(body)assert.equal(headers.get('X-WenYing-Refresh-Key'),key);
    else assert.equal(headers.has('X-WenYing-Refresh-Key'),false);
    if(body?.action.startsWith('snapshot-')||new URL(url).pathname==='/api/market-scan')
      assert.equal(request.cache,'no-store');
    if(new URL(url).pathname==='/api/market-scan') {
      const query=new URL(url).searchParams;
      for(const [name,value] of Object.entries({snapshot:'1',scope:'research',market:'TW',runId,limit:'1'}))
        assert.equal(query.get(name),value);
    }
  }
  assert.deepEqual(h.waits,[150]);
  for(const secret of [token,key,privateValue])assert.ok(!h.logs.join('\n').includes(secret));
});

for(const status of [401,403])for(const rejectedAction of ['snapshot-prepare','snapshot-status','snapshot-advance'])
  test(`runner retains the accepted financial head when ${rejectedAction} returns ${status}`,async()=>{
    const h=fixture({intercept:({call})=>call.body?.action===rejectedAction
      ?Response.json({error:privateValue},{status}):undefined});
    const failed=assertRetainedFinancial(h,await runDailyRefresh(h.options));
    assert.equal(failed.httpStatus,status);
    assert.equal(actions(h.calls).filter(action=>action===rejectedAction).length,1);
    assert.equal(actions(h.calls).at(-1),rejectedAction);
  });

test('runner retains the financial head when an uncertain advance cannot be confirmed',async()=>{
  const h=fixture({intercept:({call})=>{
    if(call.body?.action==='snapshot-advance')throw Error(`${privateValue} ${token} ${key}`);
  }});
  const failed=assertRetainedFinancial(h,await runDailyRefresh(h.options));
  assert.equal(failed.error,'SNAPSHOT_OUTCOME_UNCONFIRMED');assert.equal(failed.outcome,'uncertain');
  assert.deepEqual(actions(h.calls).slice(-2),['snapshot-advance','snapshot-status']);
  assert.equal(actions(h.calls).filter(action=>action==='snapshot-advance').length,1);
});

test('runner can finish a committed advance after its response was lost without repeating the write',async()=>{
  let lost=false;
  const h=fixture({intercept:({call,setJob})=>{
    if(call.body?.action==='snapshot-advance'&&!lost) {
      lost=true;setJob(jobs[1]);throw Error(privateValue);
    }
  }});
  assert.equal((await runDailyRefresh(h.options)).researchSnapshotPublished,true);
  assert.deepEqual(h.calls.filter(call=>call.body?.action==='snapshot-advance')
    .map(call=>call.body.expectedRevision),[0,1,2,3,4]);
  assert.equal(events(h.logs).some(event=>event.event==='research_snapshot_failed'),false);
  assert.equal(actions(h.calls).includes('fail'),false);
});

test('runner does not claim snapshot publication when the cold identity was tampered',async()=>{
  const h=fixture({intercept:({call})=>{
    if(new URL(call.url).pathname==='/api/market-scan') {
      const value=cold();value.researchSnapshot.snapshotId='tws_synthetic_wrong_snapshot';
      value.privateError=privateValue;return Response.json(value);
    }
  }});
  const failed=assertRetainedFinancial(h,await runDailyRefresh(h.options));
  assert.equal(failed.error,'SNAPSHOT_READBACK_INVALID');
  assert.equal(actions(h.calls).at(-1),'snapshot-cold-readback');
});

test('runner stops before advancing a snapshot whose source is no longer current',async()=>{
  const h=fixture({intercept:({call,current})=>call.body?.action==='snapshot-status'
    ?Response.json({...current,runId,sourceCurrent:false,privateInput:privateValue}):undefined});
  const failed=assertRetainedFinancial(h,await runDailyRefresh(h.options));
  assert.equal(failed.error,'SNAPSHOT_SOURCE_NOT_CURRENT');
  assert.equal(actions(h.calls).includes('snapshot-advance'),false);
});

test('runner preserves financial publication when snapshot wall time expires',async()=>{
  const h=fixture({intercept:({call,setTime})=>{
    if(call.body?.action==='snapshot-status')setTime(Date.parse('2026-10-26T06:30:00Z')+900001);
  }});
  const failed=assertRetainedFinancial(h,await runDailyRefresh(h.options));
  assert.equal(failed.error,'SNAPSHOT_DEADLINE_EXCEEDED');
  assert.equal(actions(h.calls).includes('snapshot-advance'),false);
});

for(const [name,patch] of [
  ['wrong generation',{runId:'synthetic_wrong_financial_head'}],
  ['nonterminal state',{state:'running'}],
  ['wrong sessions',{expectedSessions:{...expectedSessions,TW:'2026-10-22'}}],
])test(`a ${name} financial readback prevents every snapshot action after acknowledged finalization`,async()=>{
  const h=fixture({intercept:({call,status})=>new URL(call.url).pathname==='/api/daily-status'
    ?Response.json({...status,...patch}):undefined});
  await assert.rejects(runDailyRefresh(h.options),/READBACK_VERIFICATION_FAILED/);
  assert.equal(actions(h.calls).some(action=>action.startsWith('snapshot-')),false);
  assert.equal(actions(h.calls).includes('fail'),false);
  assert.equal(h.financial.state,'partial');assert.equal(h.financial.runId,runId);
  assert.equal(events(h.logs).some(event=>event.event==='published'),false);
});

test('an injected arbitrary snapshot error is sanitized after financial acceptance',async()=>{
  const h=fixture();let invoked=false;
  h.options.materializeSnapshot=async supplied=>{
    invoked=true;assert.equal(h.financial.readbackAccepted,true);
    assert.equal(supplied.expectedCount,2);assert.equal(supplied.runId,runId);
    assert.deepEqual(supplied.expectedSessions,expectedSessions);
    assert.equal(supplied.token,token);assert.equal(supplied.key,key);
    throw Object.assign(Error(`${privateValue} ${token} ${key}`),{name:privateValue,payload:privateValue});
  };
  const failed=assertRetainedFinancial(h,await runDailyRefresh(h.options));
  assert.equal(invoked,true);assert.equal(failed.error,'SNAPSHOT_REQUEST_FAILED');
  assert.deepEqual(actions(h.calls),['begin','batch','finalize','financial-readback']);
  assert.equal(Object.hasOwn(failed,'payload'),false);assert.equal(Object.hasOwn(failed,'errorName'),false);
});
