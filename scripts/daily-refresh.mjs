import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fetchRefreshRecord,expectedSession} from '../lib/daily-refresh-data.ts';
import {prepareTaiwanRefreshGeneration} from '../lib/daily-refresh-generation.ts';
import {VERIFIED_HELD_REFRESH_TARGETS} from '../lib/verified-held-refresh-scope.ts';
import {DAILY_VALUATION_VERSION} from '../lib/daily-valuation-state.ts';
import {summarizeCollector,safePublishedResult,diagnosticErrorCode} from './daily-refresh-diagnostics.mjs';
import {safeSessionPreflightFailure,retryableSessionDate,sessionDiagnosticCode,attachSessionDiagnostics} from '../lib/session-reference-diagnostics.ts';
import {createRefreshApi,RefreshUploadError,readRefreshStatus,assertRefreshReadback,safeRefreshFailure} from './daily-refresh-request.mjs';
import {materializeResearchSnapshot,safeSnapshotFailure} from './daily-refresh-snapshot.mjs';
export {createRefreshApi,RefreshUploadError} from './daily-refresh-request.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function loadUniverse() {
  const snapshot=JSON.parse(await readFile(new URL('../lib/market-scan-snapshot.json',import.meta.url),'utf8'));
  const us=JSON.parse(await readFile(new URL('../lib/us-market-snapshot.json',import.meta.url),'utf8'));
  const rows=[...snapshot.taiwanUniverse.map(s=>({...s,market:'TW'})),...us.map(s=>({...s,market:'US'})),...VERIFIED_HELD_REFRESH_TARGETS];
  const targets=[...new Map(rows.filter(s=>s.market==='TW'?/^\d{4}$/.test(s.ticker):/^[A-Z][A-Z0-9.-]{0,11}$/.test(s.ticker)).map(s=>[`${s.market}:${s.ticker}`,{ticker:s.ticker,name:s.name,market:s.market,sector:s.sector??(s.market==='TW'?'台灣上市公司':'Other'),industry:s.industry,listingBoard:s.listingBoard,...('securityIdentity' in s?{securityIdentity:s.securityIdentity}:{})}])).values()];
  return targets;
}
export async function verifySessionPreflight(now,fetcher,verifySession=expectedSession,log=message=>console.log(message),wait=sleep) {
  // This is the only delayed retry owner for preflight. Existing fixed reference
  // fallbacks stay inside expectedSession; no collector or Sites write is retried.
  const at=now.getTime(),anchor=new Date(at),markets=['TW','US'],delays=[30000,90000];
  const results=[],pinnedDates=new Map();
  let pending=[0,1];
  for(let attempt=0;attempt<=delays.length;attempt++) {
    const failureOrder=[];
    const current=await Promise.allSettled(pending.map(async index=>{
      try {
        const market=markets[index],value=await verifySession(market,new Date(at),fetcher);
        if(pinnedDates.has(market)&&value?.date!==pinnedDates.get(market))
          throw new Error('REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR');
        return value;
      } catch(error) {failureOrder.push(index);throw error;}
    }));
    pending.forEach((index,i)=>{results[index]=current[i];});
    const failed=results.flatMap((result,index)=>result.status==='rejected'?[index]:[]);
    if(!failed.length)return results.map(result=>result.value);
    const retryDates=new Map(failed.map(index=>[index,retryableSessionDate(results[index].reason,markets[index],anchor)]));
    // Preserve first-rejection order among terminal failures, as before retries.
    const permanent=failureOrder.find(index=>{
      const date=retryDates.get(index),pinned=pinnedDates.get(markets[index]);
      return !date||pinned&&date!==pinned;
    });
    if(permanent!==undefined||attempt===delays.length) {
      if(permanent!==undefined&&retryDates.get(permanent)&&pinnedDates.has(markets[permanent]))
        results[permanent]={status:'rejected',reason:attachSessionDiagnostics(
          new Error('REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR'),results[permanent].reason.sessionDiagnostics)};
      log(JSON.stringify(safeSessionPreflightFailure(anchor,results.map((r,i)=>({...r,market:markets[i]})))));
      throw results[permanent??failureOrder[0]].reason;
    }
    for(const index of failed)pinnedDates.set(markets[index],retryDates.get(index));
    log(JSON.stringify({event:'session_preflight_retry',observedAt:anchor.toISOString(),clockBasis:'caller-preflight-clock',
      attempt:attempt+1,nextAttempt:attempt+2,waitMs:delays[attempt],markets:failed.map(index=>({
        market:markets[index],expectedSessionDate:pinnedDates.get(markets[index]),error:sessionDiagnosticCode(results[index].reason?.message)}))}));
    await wait(delays[attempt]);
    pending=failed;
  }
}
export async function runDailyRefresh({token=process.env.WENYING_SITE_TOKEN,key=process.env.WENYING_REFRESH_SECRET,
  runId=`daily_${randomUUID()}`,fetcher=fetch,wait=sleep,clock=()=>new Date(),verifySession=expectedSession,
  loadTargets=loadUniverse,fetchRecord=fetchRefreshRecord,random=Math.random,log=message=>console.log(message),
  materializeSnapshot=materializeResearchSnapshot}={}) {
  let phase='preflight',began=false,finalizeAcknowledged=false,targets=[],manifest;
  const collected=[];
  const api=createRefreshApi(runId,{token,key,fetcher,wait,random,now:()=>clock().getTime(),log});
  try {
    if(!token||!key)throw new Error('MISSING_REFRESH_CREDENTIALS');
    const now=clock(),[tw,us]=await verifySessionPreflight(now,fetcher,verifySession,log,wait);
    log(JSON.stringify({event:'sessions_verified',TW:tw,US:us}));
    targets=await loadTargets();
    manifest={valuationVersion:DAILY_VALUATION_VERSION,targets:targets.map(({ticker,market})=>({ticker,market})),expectedSessions:{TW:tw.date,US:us.date},
      universeSource:['Existing WenYing Taiwan equity directory and US equity directory; new listings require directory maintenance',tw.source,us.source,tw.calendarSource,us.calendarSource]};
    phase='begin';await api({action:'begin',manifest});began=true;
    phase='collect';
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
    phase='prepare';const generation=prepareTaiwanRefreshGeneration(collected,runId);
    phase='batch';for(const records of refreshUploadBatches(generation,runId))await api({action:'batch',records});
    phase='finalize';await api({action:'finalize'});finalizeAcknowledged=true;
    phase='readback';const status=assertRefreshReadback(await readRefreshStatus({token,fetcher,attempts:2,wait,random,now:()=>clock().getTime(),log}),runId,manifest.expectedSessions,manifest.valuationVersion);
    log(JSON.stringify({event:'published',publication:'financial',phase,...safePublishedResult(status,reasons,runId)}));
    let snapshotPublished=false;
    try {
      const snapshot=await materializeSnapshot({runId,token,key,fetcher,wait,now:()=>clock().getTime(),
        expectedSessions:manifest.expectedSessions,expectedValuationVersion:DAILY_VALUATION_VERSION,
        expectedCount:status.coverage?.TW?.ready});
      snapshotPublished=snapshot?.published===true;
      if(!snapshotPublished)throw new Error('SNAPSHOT_READBACK_INVALID');
      log(JSON.stringify({event:'research_snapshot_published',runId,financialPublished:true,
        revision:snapshot.revision,scanCount:snapshot.scanCount,verifiedCount:snapshot.verifiedCount,
        expectedCount:snapshot.expectedCount,researchSnapshotVersion:snapshot.researchSnapshotVersion,quoteDate:snapshot.quoteDate}));
    } catch(error) {
      // Financial finalization/readback already succeeded. This additive job
      // must never issue fail or turn an accepted financial head into failure.
      log(JSON.stringify({event:'research_snapshot_failed',runId,financialPublished:true,...safeSnapshotFailure(error)}));
    }
    log('Private website readback verified. Only allowlisted diagnostic metadata is written to CI logs; no stock payloads or credentials.');
    return {runId,financialPublished:true,researchSnapshotPublished:snapshotPublished};
  } catch(e) {
    log(JSON.stringify({event:'refresh_failed',runId,phase,...safeRefreshFailure(e),
      ...summarizeCollector(collected,targets,manifest?.expectedSessions??{}),
      finalizeDiagnostics:e instanceof RefreshUploadError?e.diagnostics:null}));
    if(began&&!finalizeAcknowledged&&!e?.preserveRun
      &&!(e instanceof RefreshUploadError&&[401,403].includes(e.status)))
      await api({action:'fail',error:diagnosticErrorCode(e.message)}).catch(()=>{});
    throw e;
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
