// This client sends only server-owned job identity/revision. Source records,
// cursors and derived inputs never cross the materializer request boundary.
export const REFRESH_SITE_BASE_URL='https://stable-value.fanhow.chatgpt.site';
export const RESEARCH_SNAPSHOT_VERSION='tw-persistent-research-snapshot-2026-10-26-v2';
export const RESEARCH_PEER_VERSION='tw-peer-source-basis-2026-10-16-v1';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const phases=['anchors','scan','verify','published'];
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const terminal=new Set(['complete','partial']);
const codes=new Set(['SNAPSHOT_INVALID_OPTIONS','SNAPSHOT_REQUEST_FAILED','SNAPSHOT_RESPONSE_INVALID',
  'SNAPSHOT_PROGRESS_INVALID','SNAPSHOT_SOURCE_NOT_CURRENT','SNAPSHOT_OUTCOME_UNCONFIRMED',
  'SNAPSHOT_DEADLINE_EXCEEDED','SNAPSHOT_STEP_LIMIT','SNAPSHOT_READBACK_INVALID']);

export class SnapshotMaterializationError extends Error {
  constructor(code,{status,uncertain=false,retryAfterMs}={}) {
    super(codes.has(code)?code:'SNAPSHOT_REQUEST_FAILED');this.name='SnapshotMaterializationError';
    if(Number.isInteger(status)&&status>=100&&status<=599)this.status=status;
    this.uncertain=uncertain;
    if(retryAfterMs===null||Number.isFinite(retryAfterMs)&&retryAfterMs>=0)this.retryAfterMs=retryAfterMs;
  }
}
const fail=(code,options)=>{throw new SnapshotMaterializationError(code,options);};
export function safeSnapshotFailure(error) {
  return {error:codes.has(error?.message)?error.message:'SNAPSHOT_REQUEST_FAILED',
    ...(error instanceof SnapshotMaterializationError&&error.status?{httpStatus:error.status}:{}),
    ...(error?.uncertain===true?{outcome:'uncertain'}:{})};
}
function progress(value,expectedCount,jobId) {
  if(!value||typeof value!=='object'||typeof value.jobId!=='string'||!/^tws_[a-zA-Z0-9_-]{8,90}$/.test(value.jobId)
    ||jobId&&value.jobId!==jobId||!phases.includes(value.phase)||!integer(value.revision)
    ||value.revision>3*expectedCount+3||value.revision<phases.indexOf(value.phase)
    ||typeof value.published!=='boolean'||value.published!==(value.phase==='published')
    ||value.expectedCount!==expectedCount||!integer(value.scanCount)||!integer(value.verifiedCount)
    ||value.scanCount>expectedCount||value.verifiedCount>value.scanCount
    ||value.phase==='anchors'&&(value.scanCount!==0||value.verifiedCount!==0)
    ||value.phase==='scan'&&value.verifiedCount!==0
    ||['verify','published'].includes(value.phase)&&value.scanCount!==expectedCount
    ||value.phase==='published'&&value.verifiedCount!==expectedCount)fail('SNAPSHOT_PROGRESS_INVALID');
  return {jobId:value.jobId,phase:value.phase,revision:value.revision,published:value.published,
    scanCount:value.scanCount,verifiedCount:value.verifiedCount,expectedCount};
}
function sameProgress(a,b) {
  return ['jobId','phase','revision','published','scanCount','verifiedCount','expectedCount'].every(key=>a[key]===b[key]);
}
function nextProgress(previous,value,expectedCount) {
  const next=progress(value,expectedCount,previous.jobId);
  const before=phases.indexOf(previous.phase),after=phases.indexOf(next.phase);
  if(next.revision!==previous.revision+1||after<before||after>before+1)fail('SNAPSHOT_PROGRESS_INVALID');
  if(after===before) {
    const scanDelta=next.scanCount-previous.scanCount,verifyDelta=next.verifiedCount-previous.verifiedCount;
    if(previous.phase==='anchors'&&(scanDelta!==0||verifyDelta!==0)
      ||previous.phase==='scan'&&!(scanDelta>=1&&scanDelta<=8&&verifyDelta===0)
      ||previous.phase==='verify'&&!(verifyDelta>=1&&verifyDelta<=8&&scanDelta===0)
      ||previous.phase==='published')fail('SNAPSHOT_PROGRESS_INVALID');
  } else if(next.scanCount!==previous.scanCount||next.verifiedCount!==previous.verifiedCount)
    fail('SNAPSHOT_PROGRESS_INVALID');
  return next;
}
// Read a bounded response; the one-row cold read is never written to logs or
// returned. Only its allowlisted generation metadata is consulted below.
async function boundedJson(response,maxBytes,now=Date.now) {
  if(!response.ok) {
    const header=response.headers.get('Retry-After');let retryAfterMs;
    if(typeof header==='string'&&/^\d+(?:\.\d+)?$/.test(header.trim()))retryAfterMs=Number(header.trim())*1000;
    else if(typeof header==='string'&&/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(header))
      retryAfterMs=Math.max(0,Date.parse(header)-now());
    if(retryAfterMs!==undefined&&(!Number.isFinite(retryAfterMs)||retryAfterMs>30000))retryAfterMs=null;
    await response.body?.cancel().catch(()=>{});
    fail('SNAPSHOT_REQUEST_FAILED',{status:response.status,
      uncertain:response.status===408||response.status===429||response.status>=500,retryAfterMs});
  }
  const declared=response.headers.get('Content-Length');
  if(declared&&/^\d+$/.test(declared)&&Number(declared)>maxBytes) {
    await response.body?.cancel().catch(()=>{});fail('SNAPSHOT_RESPONSE_INVALID',{uncertain:true});
  }
  if(!response.body)fail('SNAPSHOT_RESPONSE_INVALID',{uncertain:true});
  const reader=response.body.getReader(),chunks=[];let size=0;
  try {
    for(;;) {
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;if(size>maxBytes){await reader.cancel();fail('SNAPSHOT_RESPONSE_INVALID',{uncertain:true});}
      chunks.push(value);
    }
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    try {
      const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      return JSON.parse(source);
    }
    catch{fail('SNAPSHOT_RESPONSE_INVALID',{uncertain:true});}
  } finally {reader.releaseLock();}
}
function readbackMetadata(value,{runId,jobId,expectedSessions,expectedValuationVersion,expectedCount}) {
  const freshness=value?.freshness,peer=value?.effectivePeerContext,snapshot=value?.researchSnapshot;
  if(!value||value.researchSnapshotVersion!==RESEARCH_SNAPSHOT_VERSION||value.researchStatus!=='current'
    ||value.researchStatusByMarket?.TW!=='current'||value.formalStatusByMarket?.TW!=='current'
    ||!Array.isArray(value.researchRequestedMarkets)||value.researchRequestedMarkets.length!==1
    ||value.researchRequestedMarkets[0]!=='TW'||value.researchPage?.limit!==1||value.researchPage?.offset!==0
    ||value.researchPage?.market!=='TW'||freshness?.runId!==runId||!terminal.has(freshness?.state)
    ||freshness?.expectedSessions?.TW!==expectedSessions.TW||freshness?.expectedSessions?.US!==expectedSessions.US
    ||freshness?.valuationVersion!==expectedValuationVersion||freshness?.taiwanValuationCurrent!==true
    ||freshness?.sourcePolicyCurrent!==true||peer?.runId!==runId||peer?.quoteDate!==expectedSessions.TW
    ||peer?.version!==RESEARCH_PEER_VERSION||typeof peer?.sealDigest!=='string'||!/^[a-f0-9]{64}$/.test(peer.sealDigest)
    ||snapshot?.snapshotId!==jobId||snapshot?.runId!==runId||snapshot?.version!==RESEARCH_SNAPSHOT_VERSION
    ||snapshot?.quoteDate!==expectedSessions.TW||typeof snapshot?.policyVersion!=='string'||!/^[a-f0-9]{64}$/.test(snapshot.policyVersion)
    ||!integer(value.researchTotalCounts?.TW)||value.researchTotalCounts.TW>expectedCount
    ||['snapshotId','researchSnapshotId'].some(key=>Object.hasOwn(value,key)&&value[key]!==jobId))
    fail('SNAPSHOT_READBACK_INVALID');
  return {researchSnapshotVersion:RESEARCH_SNAPSHOT_VERSION,quoteDate:expectedSessions.TW};
}

export async function materializeResearchSnapshot({runId,token,key,expectedSessions,expectedValuationVersion,expectedCount,
  fetcher=fetch,wait=sleep,now=Date.now,maxDurationMs=900000,maxSteps}={}) {
  if(typeof runId!=='string'||!/^[a-zA-Z0-9_-]{8,90}$/.test(runId)||!token||!key
    ||!integer(expectedCount)||expectedCount>10000||typeof expectedValuationVersion!=='string'||!expectedValuationVersion
    ||!['TW','US'].every(m=>/^\d{4}-\d{2}-\d{2}$/.test(expectedSessions?.[m]??''))
    ||!Number.isSafeInteger(maxDurationMs)||maxDurationMs<1||maxDurationMs>900000
    ||maxSteps!==undefined&&(!Number.isSafeInteger(maxSteps)||maxSteps<1))fail('SNAPSHOT_INVALID_OPTIONS');
  // A byte-limited page can contain one row: anchors are a subset of ready
  // rows, then scan/verify each visit all ready rows, plus three transitions.
  const stepLimit=Math.min(maxSteps??30003,3*expectedCount+3,30003);
  const started=now();let last=started;
  function remaining() {
    const current=now();
    if(!Number.isFinite(started)||!Number.isFinite(current)||current<last||current-started>=maxDurationMs)
      fail('SNAPSHOT_DEADLINE_EXCEEDED');
    last=current;return Math.max(1,Math.floor(maxDurationMs-(current-started)));
  }
  async function request(action,job,timeoutMs=45000) {
    const signal=AbortSignal.timeout(Math.min(timeoutMs,remaining()));
    try {
      const body={action,runId,...(job?{jobId:job.jobId}:{}),
        ...(action==='snapshot-advance'?{expectedRevision:job.revision}:{})};
      const response=await fetcher(REFRESH_SITE_BASE_URL+'/api/data-refresh',{method:'POST',
        headers:{'Content-Type':'application/json','OAI-Sites-Authorization':`Bearer ${token}`,'X-WenYing-Refresh-Key':key},
        body:JSON.stringify(body),signal,redirect:'manual',cache:'no-store'});
      const result=await boundedJson(response,16384,now);remaining();return result;
    }catch(error) {
      remaining();
      if(error instanceof SnapshotMaterializationError)throw error;
      fail('SNAPSHOT_REQUEST_FAILED',{uncertain:true});
    }
  }
  async function status(job) {
    const result=await request('snapshot-status',job,15000);
    if(result?.runId!==runId||result?.sourceCurrent!==true)fail('SNAPSHOT_SOURCE_NOT_CURRENT');
    return progress(result,expectedCount,job.jobId);
  }
  async function boundedWait(delay) {
    if(delay===null)fail('SNAPSHOT_OUTCOME_UNCONFIRMED',{uncertain:true});
    if(remaining()<=delay)fail('SNAPSHOT_DEADLINE_EXCEEDED');
    if(delay>0)await wait(delay);
    remaining();
  }
  let current=progress(await request('snapshot-prepare'),expectedCount);
  if(!sameProgress(current,await status(current)))fail('SNAPSHOT_OUTCOME_UNCONFIRMED',{uncertain:true});
  let steps=0;
  while(!current.published) {
    remaining();if(steps++>=stepLimit)fail('SNAPSHOT_STEP_LIMIT');
    try {current=nextProgress(current,await request('snapshot-advance',current),expectedCount);}
    catch(error) {
      if(error instanceof SnapshotMaterializationError&&error.status&&!error.uncertain)throw error;
      if(error?.message==='SNAPSHOT_DEADLINE_EXCEEDED')throw error;
      // An HTTP proxy error, body failure or malformed acknowledgment may
      // follow a committed step. Read once; never resubmit an uncertain write.
      if(error?.retryAfterMs!==undefined)await boundedWait(error.retryAfterMs);
      let reconciled;
      try {reconciled=await status(current);reconciled=nextProgress(current,reconciled,expectedCount);}
      catch(error) {
        if(error?.message==='SNAPSHOT_DEADLINE_EXCEEDED')throw error;
        fail('SNAPSHOT_OUTCOME_UNCONFIRMED',{uncertain:true});
      }
      current=reconciled;
    }
  }
  if(!sameProgress(current,await status(current)))fail('SNAPSHOT_OUTCOME_UNCONFIRMED',{uncertain:true});
  let metadata;
  for(let attempt=0;attempt<2;attempt++) {
    remaining();
    try {
      const query=new URLSearchParams({snapshot:'1',scope:'research',market:'TW',runId,limit:'1',offset:'0',sort:'upside',filter:'all'});
      const response=await fetcher(REFRESH_SITE_BASE_URL+'/api/market-scan?'+query,{
        headers:{'OAI-Sites-Authorization':`Bearer ${token}`},signal:AbortSignal.timeout(Math.min(15000,remaining())),
        redirect:'manual',cache:'no-store'});
      const body=await boundedJson(response,512*1024,now);remaining();
      metadata=readbackMetadata(body,{runId,jobId:current.jobId,expectedSessions,expectedValuationVersion,expectedCount});break;
    }catch(error) {
      remaining();
      if(attempt||error instanceof SnapshotMaterializationError&&!error.uncertain) {
        if(error instanceof SnapshotMaterializationError)throw error;
        fail('SNAPSHOT_REQUEST_FAILED');
      }
      if(error?.retryAfterMs===null)throw error;
      await boundedWait(Math.max(1000,error?.retryAfterMs??0));
    }
  }
  return {published:true,revision:current.revision,scanCount:current.scanCount,verifiedCount:current.verifiedCount,
    expectedCount,...metadata};
}
