import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fetchRefreshRecord,expectedSession} from '../lib/daily-refresh-data.ts';
import {prepareTaiwanRefreshGeneration} from '../lib/daily-refresh-generation.ts';
import {DAILY_VALUATION_VERSION} from '../lib/daily-valuation-state.ts';
import {summarizeCollector,safeCoverageDiagnostics,safePublishedResult,diagnosticErrorCode} from './daily-refresh-diagnostics.mjs';

const base='https://stable-value.fanhow.chatgpt.site';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export class RefreshUploadError extends Error {
  constructor(status,result) {
    const code=result?.error==null?'FAILED':diagnosticErrorCode(result.error);
    super(`UPLOAD_${status}_${code}`);
    this.name='RefreshUploadError';
    this.diagnostics=safeCoverageDiagnostics(result?.diagnostics);
  }
}
export function createRefreshApi(runId,{token,key,fetcher=fetch,wait=sleep}) {
  return async function api(body) {
    for(let attempt=0;attempt<3;attempt++) {
      try {
        // Complete-cohort validation can outlast an ordinary upload; keep its acknowledgement wait bounded.
        const r=await fetcher(base+'/api/data-refresh',{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':`Bearer ${token}`,'X-WenYing-Refresh-Key':key},body:JSON.stringify({runId,...body}),signal:AbortSignal.timeout(body.action==='finalize'?180000:45000)});
        const result=await r.json().catch(()=>({error:`HTTP_${r.status}`}));
        if(!r.ok)throw new RefreshUploadError(r.status,result);
        return result;
      }catch(e){if(attempt===2)throw e;await wait((attempt+1)*3000);}
    }
  };
}
export async function loadUniverse() {
  const snapshot=JSON.parse(await readFile(new URL('../lib/market-scan-snapshot.json',import.meta.url),'utf8'));
  const us=JSON.parse(await readFile(new URL('../lib/us-market-snapshot.json',import.meta.url),'utf8'));
  const rows=[...snapshot.taiwanUniverse.map(s=>({...s,market:'TW'})),...us.map(s=>({...s,market:'US'}))];
  const targets=[...new Map(rows.filter(s=>s.market==='TW'?/^\d{4}$/.test(s.ticker):/^[A-Z][A-Z0-9.-]{0,11}$/.test(s.ticker)).map(s=>[`${s.market}:${s.ticker}`,{ticker:s.ticker,name:s.name,market:s.market,sector:s.sector??(s.market==='TW'?'台灣上市公司':'Other'),industry:s.industry,listingBoard:s.listingBoard}])).values()];
  return targets;
}
export async function runDailyRefresh({token=process.env.WENYING_SITE_TOKEN,key=process.env.WENYING_REFRESH_SECRET,
  runId=`daily_${randomUUID()}`,fetcher=fetch,wait=sleep,clock=()=>new Date(),verifySession=expectedSession,
  loadTargets=loadUniverse,fetchRecord=fetchRefreshRecord,log=message=>console.log(message)}={}) {
  if(!token||!key)throw new Error('MISSING_REFRESH_CREDENTIALS');
  const api=createRefreshApi(runId,{token,key,fetcher,wait});
  const now=clock(),[tw,us]=await Promise.all([verifySession('TW',now,fetcher),verifySession('US',now,fetcher)]);
  log(JSON.stringify({event:'sessions_verified',TW:tw,US:us}));
  const targets=await loadTargets();
  const manifest={valuationVersion:DAILY_VALUATION_VERSION,targets:targets.map(({ticker,market})=>({ticker,market})),expectedSessions:{TW:tw.date,US:us.date},
    universeSource:['Existing WenYing Taiwan equity directory and US equity directory; new listings require directory maintenance',tw.source,us.source,tw.calendarSource,us.calendarSource]};
  let began=false;const collected=[];
  try {
    await api({action:'begin',manifest});began=true;
    let done=0,ready=0;const reasons={};
    // A fixed, small pool and pause avoid an unbounded burst to the public data provider.
    for(let offset=0;offset<targets.length;offset+=8) {
      const records=await Promise.all(targets.slice(offset,offset+8).map(t=>fetchRecord(t,manifest.expectedSessions[t.market],clock(),fetcher)));
      collected.push(...records);
      done+=records.length;ready+=records.filter(r=>r.status==='ready').length;
      for(const r of records)for(const issue of r.issues)reasons[issue]=(reasons[issue]??0)+1;
      if(done%200===0||done===targets.length)log(JSON.stringify({event:'progress',checked:done,total:targets.length,ready,unavailable:done-ready}));
      // Abort clearly on sustained rate limiting instead of publishing mostly failed data.
      if((reasons.UPSTREAM_HTTP_429??0)>100)throw new Error('PROVIDER_RATE_LIMITED');
      await wait(150);
    }
    log(JSON.stringify({event:'collector_complete',runId,...summarizeCollector(collected,targets,manifest.expectedSessions)}));
    const generation=prepareTaiwanRefreshGeneration(collected,runId);
    for(const records of refreshUploadBatches(generation,runId))await api({action:'batch',records});
    const result=await api({action:'finalize'});
    log(JSON.stringify({event:'published',...safePublishedResult(result,reasons,runId)}));
    const check=await fetcher(base+'/api/daily-status',{headers:{'OAI-Sites-Authorization':`Bearer ${token}`},cache:'no-store'});
    const status=await check.json();if(!check.ok||status.runId!==runId||!['complete','partial'].includes(status.state))throw new Error('READBACK_VERIFICATION_FAILED');
    log('Private website readback verified. Only allowlisted diagnostic metadata is written to CI logs; no stock payloads or credentials.');
  } catch(e) {
    log(JSON.stringify({event:'refresh_failed',runId,error:diagnosticErrorCode(e.message),
      ...summarizeCollector(collected,targets,manifest.expectedSessions),
      finalizeDiagnostics:e instanceof RefreshUploadError?e.diagnostics:null}));
    if(began)await api({action:'fail',error:e.message}).catch(()=>{});throw e;
  }
}
export function refreshUploadBatches(records,runId) {
  const batches=[];let batch=[];
  const bytes=items=>Buffer.byteLength(JSON.stringify({runId,action:'batch',records:items}),'utf8');
  for(const record of records) {
    if(bytes([record])>1400000)throw new Error('RECORD_PAYLOAD_TOO_LARGE');
    if(batch.length===8||bytes([...batch,record])>1400000){batches.push(batch);batch=[];}
    batch.push(record);
  }
  if(batch.length)batches.push(batch);
  return batches;
}
if(process.argv[1]===fileURLToPath(import.meta.url))runDailyRefresh().catch(e=>{console.error(diagnosticErrorCode(e.message));process.exitCode=1;});
