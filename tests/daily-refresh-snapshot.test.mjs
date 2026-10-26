import test from 'node:test';
import assert from 'node:assert/strict';
import {materializeResearchSnapshot,SnapshotMaterializationError,RESEARCH_SNAPSHOT_VERSION,
  RESEARCH_PEER_VERSION,REFRESH_SITE_BASE_URL} from '../scripts/daily-refresh-snapshot.mjs';

// Every response is synthetic. This suite never contacts a service or provider.
const runId='synthetic_snapshot_collector_run',jobId='tws_synthetic_collector_job';
const token='SYNTHETIC_SITE_TOKEN_PRIVATE',key='SYNTHETIC_REFRESH_KEY_PRIVATE';
const privateValue='SYNTHETIC_PRIVATE_STOCK_RESPONSE_AND_ERROR';
const expectedSessions={TW:'2026-10-23',US:'2026-10-23'};
const progress=(revision,phase,scanCount=0,verifiedCount=0)=>({jobId,phase,revision,
  published:phase==='published',scanCount,verifiedCount,expectedCount:2});
const stages=[progress(0,'anchors'),progress(1,'scan'),progress(2,'scan',2),
  progress(3,'verify',2),progress(4,'verify',2,2),progress(5,'published',2,2)];
const cold=()=>({researchSnapshotVersion:RESEARCH_SNAPSHOT_VERSION,
  researchSnapshot:{snapshotId:jobId,runId,version:RESEARCH_SNAPSHOT_VERSION,
    policyVersion:'b'.repeat(64),quoteDate:expectedSessions.TW},researchTotalCounts:{TW:2},
  researchStatus:'current',researchStatusByMarket:{TW:'current',US:'refresh_required'},
  formalStatusByMarket:{TW:'current'},researchRequestedMarkets:['TW'],
  researchPage:{limit:1,offset:0,market:'TW',sort:'upside',filter:'all',query:''},
  freshness:{runId,state:'partial',expectedSessions,valuationVersion:'test-valuations',
    taiwanValuationCurrent:true,sourcePolicyCurrent:true},
  effectivePeerContext:{runId,quoteDate:expectedSessions.TW,version:RESEARCH_PEER_VERSION,
    sealDigest:'a'.repeat(64),anchors:{private:privateValue}},
  researchCandidates:[{privateFinancialValue:privateValue}],privateInput:privateValue});

function fixture({intercept,advance}={}) {
  let current=structuredClone(stages[0]),at=0,time=0;
  const calls=[],logs=[],waits=[];
  const options={runId,token,key,expectedSessions,expectedValuationVersion:'test-valuations',
    expectedCount:2,maxDurationMs:900000,now:()=>time,wait:async ms=>waits.push(ms),
    log:line=>logs.push(line),fetcher:async(url,request)=>{
      const body=request.body?JSON.parse(request.body):null;
      const call={url:String(url),request,body};calls.push(call);
      const overridden=await intercept?.({call,calls,current:structuredClone(current),
        setCurrent:value=>{current=structuredClone(value);},setTime:value=>{time=value;}});
      if(overridden!==undefined)return overridden;
      if(body?.action==='snapshot-prepare')return Response.json(current);
      if(body?.action==='snapshot-status')return Response.json({...current,runId,sourceCurrent:true});
      if(body?.action==='snapshot-advance') {
        assert.equal(body.expectedRevision,current.revision,'writer uses the last confirmed revision');
        current=advance?advance(current):structuredClone(stages[++at]);
        return Response.json(current);
      }
      assert.equal(body,null,'cold snapshot is a GET');
      return Response.json(cold());
    }};
  return {options,calls,logs,waits};
}
const actions=calls=>calls.map(call=>call.body?.action??'cold-readback');
const materializationFailure=async options=>{
  let caught;
  await assert.rejects(materializeResearchSnapshot(options),error=>{
    caught=error;return error instanceof SnapshotMaterializationError;
  });
  for(const secret of [token,key,privateValue])assert.ok(!String(caught?.message).includes(secret));
  for(const secret of [token,key,privateValue])assert.ok(!JSON.stringify(caught).includes(secret));
  return caught;
};

test('publishes bounded server-owned progress then verifies a fresh one-row cold snapshot',async()=>{
  const h=fixture(),result=await materializeResearchSnapshot(h.options);
  assert.deepEqual(result,{published:true,revision:5,scanCount:2,verifiedCount:2,expectedCount:2,
    researchSnapshotVersion:RESEARCH_SNAPSHOT_VERSION,quoteDate:expectedSessions.TW});
  assert.deepEqual(actions(h.calls),['snapshot-prepare','snapshot-status',
    ...Array(5).fill('snapshot-advance'),'snapshot-status','cold-readback']);
  for(const {url,request,body} of h.calls) {
    assert.equal(new URL(url).origin,REFRESH_SITE_BASE_URL);
    assert.equal(request.redirect,'manual');assert.equal(request.cache,'no-store');
    const headers=new Headers(request.headers);
    assert.equal(headers.get('OAI-Sites-Authorization'),`Bearer ${token}`);
    if(body) {
      assert.equal(new URL(url).pathname,'/api/data-refresh');assert.equal(request.method,'POST');
      assert.equal(headers.get('X-WenYing-Refresh-Key'),key);
      assert.equal(body.runId,runId);
      assert.deepEqual(Object.keys(body).sort(),(body.action==='snapshot-prepare'?['action','runId']:
        body.action==='snapshot-status'?['action','jobId','runId']:['action','expectedRevision','jobId','runId']).sort());
    }else {
      const query=new URL(url).searchParams;
      assert.equal(new URL(url).pathname,'/api/market-scan');
      for(const [name,value] of Object.entries({snapshot:'1',scope:'research',market:'TW',runId,limit:'1'}))
        assert.equal(query.get(name),value);
      assert.equal(headers.has('X-WenYing-Refresh-Key'),false);
    }
  }
  assert.deepEqual(h.waits,[]);
  for(const secret of [token,key,privateValue])assert.ok(!JSON.stringify([result,h.logs]).includes(secret));
});

test('an idempotently prepared published job needs no advance and still gets status and cold readback',async()=>{
  const h=fixture({intercept:({call,setCurrent})=>{
    if(call.body?.action==='snapshot-prepare') {
      setCurrent(stages.at(-1));return Response.json(stages.at(-1));
    }
  }});
  assert.equal((await materializeResearchSnapshot(h.options)).published,true);
  assert.equal(actions(h.calls).includes('snapshot-advance'),false);
  assert.equal(actions(h.calls).at(-1),'cold-readback');
});

for(const mode of ['transport','http-503','bad-ack'])test(`uncertain ${mode} advance reconciles once without repeating the write`,async()=>{
  let injected=false;
  const h=fixture({intercept:({call,setCurrent})=>{
    if(call.body?.action==='snapshot-advance'&&!injected) {
      injected=true;setCurrent(stages[1]);
      if(mode==='transport')throw Error(privateValue);
      return mode==='http-503'?Response.json({error:privateValue},{status:503})
        :Response.json({wrong:privateValue});
    }
  },advance:current=>structuredClone(stages[current.revision+1])});
  assert.equal((await materializeResearchSnapshot(h.options)).published,true);
  assert.deepEqual(actions(h.calls).slice(0,5),['snapshot-prepare','snapshot-status',
    'snapshot-advance','snapshot-status','snapshot-advance']);
  assert.deepEqual(h.calls.filter(call=>call.body?.action==='snapshot-advance')
    .map(call=>call.body.expectedRevision),[0,1,2,3,4]);
});

for(const mode of ['unchanged','jumped','wrong-run','wrong-job','stale-source','status-fails'])
  test(`uncertain advance stops on ${mode} status without a duplicate writer`,async()=>{
    let pending=false;
    const h=fixture({intercept:({call,current})=>{
      if(call.body?.action==='snapshot-advance'){pending=true;throw Error(privateValue);}
      if(call.body?.action==='snapshot-status'&&pending) {
        if(mode==='status-fails')return Response.json({error:privateValue},{status:503});
        const next=mode==='unchanged'?current:stages[1];
        return Response.json({...next,runId,sourceCurrent:true,
          ...(mode==='jumped'?{revision:next.revision+1}:{}),
          ...(mode==='wrong-run'?{runId:'synthetic_other_run'}:{}),
          ...(mode==='wrong-job'?{jobId:'tws_synthetic_other_job'}:{}),
          ...(mode==='stale-source'?{sourceCurrent:false}:{})});
      }
    }});
    await materializationFailure(h.options);
    assert.deepEqual(actions(h.calls),['snapshot-prepare','snapshot-status','snapshot-advance','snapshot-status']);
  });

for(const status of [401,403])for(const rejectedAction of ['snapshot-prepare','snapshot-status','snapshot-advance'])
  test(`${status} at ${rejectedAction} stops immediately without reconciliation or retries`,async()=>{
    const h=fixture({intercept:({call})=>call.body?.action===rejectedAction
      ?Response.json({error:privateValue},{status}):undefined});
    await materializationFailure(h.options);
    assert.equal(actions(h.calls).filter(action=>action===rejectedAction).length,1);
    assert.equal(actions(h.calls).at(-1),rejectedAction);
    assert.deepEqual(h.waits,[]);
  });

for(const [name,patch] of [
  ['invalid job namespace',{jobId:'private-secret-or-untrusted-job'}],
  ['negative revision',{revision:-1}],['fractional revision',{revision:0.5}],
  ['unknown phase',{phase:'done'}],['published flag mismatch',{published:true}],
  ['wrong ready count',{expectedCount:3}],['oversized count',{expectedCount:10001}],
  ['unverified anchor counts',{scanCount:1}],['negative count',{verifiedCount:-1}],
])test(`prepare rejects ${name} before an advance`,async()=>{
  const h=fixture({intercept:({call})=>call.body?.action==='snapshot-prepare'
    ?Response.json({...stages[0],...patch,privateInput:privateValue}):undefined});
  await materializationFailure(h.options);
  assert.equal(actions(h.calls).includes('snapshot-advance'),false);
});

for(const [name,patch] of [
  ['revision jump',{revision:2}],['phase skip',{phase:'verify'}],
  ['scan before its phase',{scanCount:1}],['verification before scan',{verifiedCount:1}],
  ['job identity change',{jobId:'tws_synthetic_other_job'}],
  ['expected count change',{expectedCount:3}],
])test(`tampered ${name} advance cannot become confirmed progress`,async()=>{
  let bad=false;
  const h=fixture({intercept:({call})=>{
    if(call.body?.action==='snapshot-advance') {bad=true;return Response.json({...stages[1],...patch});}
    if(bad&&call.body?.action==='snapshot-status')return Response.json({...stages[1],...patch,runId,sourceCurrent:true});
  }});
  await materializationFailure(h.options);
  assert.equal(actions(h.calls).filter(action=>action==='snapshot-advance').length,1);
  assert.equal(actions(h.calls).includes('cold-readback'),false);
});

test('a configured step limit bounds a job that remains in anchors',async()=>{
  const h=fixture({advance:current=>({...current,revision:current.revision+1})});
  await materializationFailure({...h.options,maxSteps:2});
  assert.equal(actions(h.calls).filter(action=>action==='snapshot-advance').length,2);
  assert.equal(actions(h.calls).includes('cold-readback'),false);
});

test('the derived hard step ceiling bounds valid-looking endless anchor progress',async()=>{
  const h=fixture({advance:current=>({...current,revision:current.revision+1})});
  await materializationFailure({...h.options,maxSteps:1000000});
  assert.ok(actions(h.calls).filter(action=>action==='snapshot-advance').length<=3*2+3);
});

test('elapsed wall time stops work before another write even with a fixed number of steps left',async()=>{
  const h=fixture({intercept:({call,setTime})=>{
    if(call.body?.action==='snapshot-status')setTime(100);
  }});
  await materializationFailure({...h.options,maxDurationMs:50});
  assert.equal(actions(h.calls).includes('snapshot-advance'),false);
});

test('a scan chunk exceeding eight rows is rejected even below the total cohort count',async()=>{
  const h=fixture({intercept:({call,setCurrent,current})=>{
    if(call.body?.action==='snapshot-prepare') {
      const initial={...stages[0],expectedCount:16};setCurrent(initial);return Response.json(initial);
    }
    if(call.body?.action==='snapshot-advance') {
      const next={...current,revision:current.revision+1,phase:'scan',
        scanCount:current.phase==='anchors'?0:9};
      setCurrent(next);return Response.json(next);
    }
  }});
  await materializationFailure({...h.options,expectedCount:16});
  assert.equal(actions(h.calls).filter(action=>action==='snapshot-advance').length,2);
  assert.equal(actions(h.calls).includes('cold-readback'),false);
});

test('scan counters cannot regress in either an acknowledgement or its reconciliation',async()=>{
  const h=fixture({intercept:({call,current,setCurrent})=>{
    if(call.body?.action==='snapshot-advance'&&current.revision===2) {
      const next={...current,revision:3,scanCount:1};setCurrent(next);return Response.json(next);
    }
  }});
  await materializationFailure(h.options);
  assert.equal(actions(h.calls).filter(action=>action==='snapshot-advance').length,3);
  assert.equal(actions(h.calls).includes('cold-readback'),false);
});

for(const [name,change] of [
  ['missing snapshot identity',body=>{delete body.researchSnapshot;}],
  ['snapshot job identity',body=>{body.researchSnapshot.snapshotId='tws_synthetic_other_job';}],
  ['snapshot run identity',body=>{body.researchSnapshot.runId='synthetic_other_run';}],
  ['snapshot identity version',body=>{body.researchSnapshot.version='old-version';}],
  ['snapshot policy digest',body=>{body.researchSnapshot.policyVersion=privateValue;}],
  ['snapshot identity date',body=>{body.researchSnapshot.quoteDate='2026-10-22';}],
  ['snapshot cohort count',body=>{body.researchTotalCounts.TW=3;}],
  ['snapshot version',body=>{body.researchSnapshotVersion='old-version';}],
  ['generation',body=>{body.freshness.runId='synthetic_other_run';}],
  ['TW session',body=>{body.freshness.expectedSessions={...expectedSessions,TW:'2026-10-22'};}],
  ['US session',body=>{body.freshness.expectedSessions={...expectedSessions,US:'2026-10-22'};}],
  ['valuation version',body=>{body.freshness.valuationVersion='old-valuations';}],
  ['TW current flag',body=>{body.freshness.taiwanValuationCurrent=false;}],
  ['source current flag',body=>{body.freshness.sourcePolicyCurrent=false;}],
  ['TW research current flag',body=>{body.researchStatusByMarket.TW='refresh_required';}],
  ['requested market',body=>{body.researchRequestedMarkets=['US'];}],
  ['page limit',body=>{body.researchPage.limit=100;}],
  ['peer generation',body=>{body.effectivePeerContext.runId='synthetic_other_run';}],
  ['peer quote date',body=>{body.effectivePeerContext.quoteDate='2026-10-22';}],
  ['peer version',body=>{body.effectivePeerContext.version='old-peers';}],
  ['peer seal',body=>{body.effectivePeerContext.sealDigest=privateValue;}],
  ['exposed snapshot identity',body=>{body.snapshotId='tws_synthetic_other_job';}],
])test(`cold readback rejects mismatched ${name}`,async()=>{
  const h=fixture({intercept:({call})=>{
    if(!call.body){const body=cold();change(body);return Response.json(body);}
  }});
  await materializationFailure(h.options);
  assert.equal(actions(h.calls).at(-1),'cold-readback');
  assert.equal(actions(h.calls).filter(action=>action==='snapshot-advance').length,5);
});

test('a cold transport error and arbitrary response extras cannot leak into errors or logs',async()=>{
  const h=fixture({intercept:({call})=>{
    if(!call.body)throw Error(`${privateValue} ${token} ${key}`);
  }});
  await materializationFailure(h.options);
  for(const secret of [privateValue,token,key])assert.ok(!h.logs.join('\n').includes(secret));
});

test('one transient cold readback retries after a bounded Retry-After and still validates metadata',async()=>{
  let reads=0;
  const h=fixture({intercept:({call})=>!call.body&&++reads===1
    ?Response.json({error:privateValue},{status:503,headers:{'Retry-After':'5'}}):undefined});
  assert.equal((await materializeResearchSnapshot(h.options)).published,true);
  assert.equal(reads,2);assert.deepEqual(h.waits,[5000]);
});

test('an advance Retry-After waits before its single status read and never repeats the write',async()=>{
  let injected=false;
  const h=fixture({intercept:({call,setCurrent})=>{
    if(call.body?.action==='snapshot-advance'&&!injected) {
      injected=true;setCurrent(stages[1]);
      return Response.json({error:privateValue},{status:429,headers:{'Retry-After':'5'}});
    }
  },advance:current=>structuredClone(stages[current.revision+1])});
  assert.equal((await materializeResearchSnapshot(h.options)).published,true);
  assert.deepEqual(h.waits,[5000]);
  assert.equal(h.calls.filter(call=>call.body?.expectedRevision===0).length,1);
});

test('an over-budget Retry-After stops without an early status read or cold retry',async()=>{
  for(const action of ['snapshot-advance','cold-readback']) {
    const h=fixture({intercept:({call})=>(call.body?.action??'cold-readback')===action
      ?Response.json({error:privateValue},{status:503,headers:{'Retry-After':'60'}}):undefined});
    await materializationFailure(h.options);
    assert.equal(actions(h.calls).at(-1),action);assert.deepEqual(h.waits,[]);
  }
});

test('cold authentication denial stops after one read and no retry',async()=>{
  for(const status of [401,403]) {
    const h=fixture({intercept:({call})=>!call.body?Response.json({error:privateValue},{status}):undefined});
    await materializationFailure(h.options);
    assert.equal(actions(h.calls).filter(action=>action==='cold-readback').length,1);
    assert.deepEqual(h.waits,[]);
  }
});

test('oversized progress responses stop before starting any snapshot advance',async()=>{
  const h=fixture({intercept:({call})=>call.body?.action==='snapshot-prepare'
    ?Response.json({...stages[0],privateInput:privateValue.repeat(1000)}):undefined});
  await materializationFailure(h.options);
  assert.deepEqual(actions(h.calls),['snapshot-prepare']);
});

test('a backwards test clock stops work rather than extending the deadline',async()=>{
  const h=fixture({intercept:({call,setTime})=>{
    if(call.body?.action==='snapshot-status')setTime(-1);
  }});
  const error=await materializationFailure(h.options);
  assert.equal(error.message,'SNAPSHOT_DEADLINE_EXCEEDED');
  assert.equal(actions(h.calls).includes('snapshot-advance'),false);
});
