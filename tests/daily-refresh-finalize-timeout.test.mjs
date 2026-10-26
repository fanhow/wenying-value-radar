import test from 'node:test';
import assert from 'node:assert/strict';
import {createRefreshApi,RefreshUploadError} from '../scripts/daily-refresh.mjs';

const token='synthetic-token-not-a-real-credential',key='synthetic-refresh-key-not-real';
const nativeTimeout=AbortSignal.timeout.bind(AbortSignal);

function scaledBudgets(t) {
  const budgets=[];
  // Exercise real abort signals at 1/1000 of the production waiting times.
  t.mock.method(AbortSignal,'timeout',ms=>{budgets.push(ms);return nativeTimeout(ms/1000);});
  return budgets;
}
async function delayedResponse(signal,payload,delayMs=80) {
  await new Promise((resolve,reject)=>{
    if(signal.aborted){reject(signal.reason);return;}
    const abort=()=>{clearTimeout(timer);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},delayMs);
    signal.addEventListener('abort',abort,{once:true});
  });
  return Response.json(payload);
}

test('finalize receives a slow acknowledgement after the ordinary budget without changing credentials or payload',async t=>{
  const budgets=scaledBudgets(t),requests=[],waits=[];
  const payload={runId:'synthetic_slow_finalize',state:'partial',coverage:{total:20,
    TW:{total:10,ready:8,unavailable:2},US:{total:10,ready:9,unavailable:1}}};
  const api=createRefreshApi(payload.runId,{token,key,wait:async ms=>waits.push(ms),fetcher:async(url,options)=>{
    requests.push({url,headers:options.headers,body:JSON.parse(options.body)});
    return delayedResponse(options.signal,payload);
  }});
  assert.deepEqual(await api({action:'finalize'}),payload);
  assert.deepEqual(budgets,[180000]);
  assert.deepEqual(waits,[]);
  assert.deepEqual(requests,[{url:'https://stable-value.fanhow.chatgpt.site/api/data-refresh',
    headers:{'Content-Type':'application/json','OAI-Sites-Authorization':`Bearer ${token}`,'X-WenYing-Refresh-Key':key},
    body:{runId:payload.runId,action:'finalize'}}]);
});

test('begin, batch and fail still abort slow responses and stop after the existing three attempts',async t=>{
  const budgets=scaledBudgets(t),waits=[],actions=[];
  const api=createRefreshApi('synthetic_ordinary_budget',{token,key,random:()=>0,wait:async ms=>waits.push(ms),fetcher:async(_url,options)=>{
    actions.push(JSON.parse(options.body).action);
    return delayedResponse(options.signal,{ok:true});
  }});
  for(const action of ['begin','batch','fail'])await assert.rejects(api({action}),error=>error.name==='TimeoutError');
  assert.deepEqual(budgets,Array(9).fill(45000));
  assert.deepEqual(waits,[3000,6000,3000,6000,3000,6000]);
  assert.deepEqual(actions,['begin','begin','begin','batch','batch','batch','fail','fail','fail']);
});

test('a longer finalize wait preserves authoritative rejection without retrying a permanent contract failure',async t=>{
  const budgets=scaledBudgets(t),waits=[];let requests=0;
  const api=createRefreshApi('synthetic_rejected_finalize',{token,key,wait:async ms=>waits.push(ms),fetcher:async()=>{
    requests++;return Response.json({error:'GENERATION_PEER_EVIDENCE_MISMATCH'},{status:400});
  }});
  await assert.rejects(api({action:'finalize'}),error=>error instanceof RefreshUploadError
    &&error.message==='UPLOAD_400_GENERATION_PEER_EVIDENCE_MISMATCH'&&error.diagnostics===null);
  assert.equal(requests,1);
  assert.deepEqual(budgets,[180000]);
  assert.deepEqual(waits,[]);
});

test('a finalize timeout reads back the same accepted run without another finalize or fail',async t=>{
  const budgets=scaledBudgets(t),waits=[],actions=[],runId='synthetic_uncertain_finalize';
  const payload={runId,state:'partial',coverage:{total:20,TW:{total:10,ready:8,unavailable:2},US:{total:10,ready:9,unavailable:1}}};
  const api=createRefreshApi(runId,{token,key,random:()=>0,wait:async ms=>waits.push(ms),fetcher:async(_url,options)=>{
    if(options.body){actions.push(JSON.parse(options.body).action);return delayedResponse(options.signal,payload,250);}
    actions.push('readback');return Response.json(payload);
  }});
  assert.deepEqual(await api({action:'finalize'}),payload);
  assert.deepEqual(actions,['finalize','readback']);
  assert.deepEqual(budgets,[180000,15000]);assert.deepEqual(waits,[]);
});
