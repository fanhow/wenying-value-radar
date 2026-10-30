import {diagnosticErrorCode,safeCoverageDiagnostics,safeFinalizeDiagnostics} from './daily-refresh-diagnostics.mjs';
import {REFRESH_SITE_BASE_URL} from './daily-refresh-snapshot.mjs';

const base=REFRESH_SITE_BASE_URL;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const transportCodes=new Set(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN','ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET']);
const actions=new Set(['begin','batch','finalize','fail']);
const terminal=new Set(['complete','partial']);

async function responseBody(response,signal) {
  try {return await response.json();}
  catch(error) {
    // A permanent HTTP status remains authoritative even if its body is broken.
    // On HTTP200, transport/body timeouts must reach the bounded retry policy;
    // only malformed JSON is treated as a content/acknowledgment failure.
    if(!response.ok||error?.name==='SyntaxError')return {error:`HTTP_${response.status}`};
    if(error?.name==='AbortError'&&signal?.aborted&&signal.reason?.name==='TimeoutError')throw signal.reason;
    throw error;
  }
}

export class RefreshUploadError extends Error {
  constructor(status,result,retryAfter=null) {
    super(`UPLOAD_${status}_${result?.error==null?'FAILED':diagnosticErrorCode(result.error)}`);
    this.name='RefreshUploadError';this.status=status;
    this.diagnostics=safeCoverageDiagnostics(result?.diagnostics);
    this.finalize=safeFinalizeDiagnostics(result?.finalize);
    // Retain parsed numbers only, never arbitrary response-header text.
    if(typeof retryAfter==='string'&&/^\d+(?:\.\d+)?$/.test(retryAfter.trim())) {
      const seconds=Number(retryAfter.trim());
      if(Number.isFinite(seconds))this.retryAfterSeconds=seconds;
      else this.retryAfterBeyondBudget=true;
    }
    else if(typeof retryAfter==='string'&&/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(retryAfter)) {
      const at=Date.parse(retryAfter);if(Number.isFinite(at))this.retryAfterAt=at;
    }
  }
}

export class RefreshFinalizeUncertainError extends Error {
  constructor() {super('FINALIZE_OUTCOME_UNCONFIRMED');this.name='RefreshFinalizeUncertainError';this.preserveRun=true;}
}

export function isRetryableRefreshError(error) {
  if(error instanceof RefreshUploadError)return error.status===408||error.status===429||error.status>=500&&error.status<=599;
  return error?.name==='TimeoutError'||error?.name!=='AbortError'&&transportCodes.has(error?.cause?.code??error?.code);
}

export function retryDelayMs(error,attempt,{random=Math.random,now=Date.now}={}) {
  if(error?.retryAfterBeyondBudget)return null;
  let minimum=0;
  if(Number.isFinite(error?.retryAfterSeconds))minimum=error.retryAfterSeconds*1000;
  else if(Number.isFinite(error?.retryAfterAt))minimum=Math.max(0,error.retryAfterAt-now());
  if(!Number.isFinite(minimum)||minimum>30000)return null;
  const backoff=3000*2**attempt;
  const sampled=Number(random());const jitter=Number.isFinite(sampled)?Math.min(1,Math.max(0,sampled))*backoff*.25:0;
  return Math.min(30000,Math.max(minimum,backoff)+jitter);
}

export function safeRefreshFailure(error) {
  const knownName=new Set(['Error','TypeError','TimeoutError','AbortError','RefreshUploadError','RefreshFinalizeUncertainError']);
  const nativeCode=error?.name==='TimeoutError'?'REFRESH_REQUEST_TIMEOUT'
    :transportCodes.has(error?.cause?.code??error?.code)?'REFRESH_TRANSPORT_FAILED':null;
  return {error:nativeCode??diagnosticErrorCode(error?.message),
    errorName:knownName.has(error?.name)?error.name:'Error',
    ...(error instanceof RefreshUploadError?{httpStatus:error.status,...(error.finalize?{finalize:error.finalize}:{})}:{}),
    ...(error?.preserveRun?{outcome:'uncertain',preservedRun:true}:{})};
}

export async function readRefreshStatus({token,fetcher=fetch,timeoutMs=15000,attempts=1,wait=sleep,random=Math.random,now=Date.now,log=()=>{}}) {
  const limit=attempts===2?2:1;
  for(let attempt=0;attempt<limit;attempt++) {
    try {
      const signal=AbortSignal.timeout(timeoutMs);
      const response=await fetcher(base+'/api/daily-status',{headers:{'OAI-Sites-Authorization':`Bearer ${token}`},
        signal,cache:'no-store',redirect:'manual'});
      const body=await responseBody(response,signal);
      if(!response.ok)throw new RefreshUploadError(response.status,body,response.headers.get('Retry-After'));
      return body;
    }catch(error) {
      if(attempt===limit-1||!isRetryableRefreshError(error))throw error;
      const delay=retryDelayMs(error,attempt,{random,now});
      if(delay===null)throw error;
      log(JSON.stringify({event:'refresh_request_retry',phase:'readback',attempt:attempt+1,waitMs:delay,...safeRefreshFailure(error)}));
      await wait(delay);
    }
  }
}

export function assertRefreshReadback(status,runId,expectedSessions,expectedValuationVersion) {
  if(!status||status.runId!==runId||!terminal.has(status.state)
    ||expectedSessions&&['TW','US'].some(market=>status.expectedSessions?.[market]!==expectedSessions[market])
    ||expectedValuationVersion&&status.valuationVersion!==expectedValuationVersion)
    throw new Error('READBACK_VERIFICATION_FAILED');
  return status;
}

function validAck(body,result,runId) {
  if(body.action==='begin')return result?.runId===runId&&result.state==='running';
  if(body.action==='batch')return Array.isArray(body.records)&&result?.accepted===body.records.length;
  if(body.action==='fail')return ['failed','complete','partial'].includes(result?.state);
  return result?.runId===runId&&terminal.has(result.state)
    &&(!Object.hasOwn(result,'activeRunId')||result.activeRunId===runId)
    &&(!Object.hasOwn(result,'finalize')||safeFinalizeDiagnostics(result.finalize)?.outcome==='published');
}

export function createRefreshApi(runId,{token,key,fetcher=fetch,wait=sleep,random=Math.random,now=Date.now,log=()=>{}}) {
  // Capture the accepted begin payload, not later mutable caller objects.
  let expectedSessions,expectedValuationVersion;
  async function reconcile(reason=new Error('REFRESH_ACK_STATE_MISMATCH')) {
    log(JSON.stringify({event:'refresh_finalize_reconcile',phase:'finalize',...safeRefreshFailure(reason)}));
    for(let attempt=0;attempt<2;attempt++) {
      try {
        const status=assertRefreshReadback(await readRefreshStatus({token,fetcher}),runId,expectedSessions,expectedValuationVersion);
        return {runId,state:status.state,coverage:status.coverage};
      }catch(error) {
        log(JSON.stringify({event:'refresh_finalize_readback_failed',phase:'finalize',attempt:attempt+1,...safeRefreshFailure(error)}));
        if(error?.name==='AbortError')break;
        if(error instanceof RefreshUploadError&&!isRetryableRefreshError(error))break;
        if(attempt===0) {
          const delay=error instanceof RefreshUploadError?retryDelayMs(error,0,{random,now}):1000;
          if(delay===null)break;
          await wait(delay);
        }
      }
    }
    throw new RefreshFinalizeUncertainError();
  }
  return async function api(body) {
    if(!body||!actions.has(body.action))throw new Error('REFRESH_ACK_STATE_MISMATCH');
    if(Object.hasOwn(body,'runId')&&body.runId!==runId)throw new Error('REFRESH_REQUEST_ID_OVERRIDE');
    // Freeze both identity and exact payload bytes before the first await.
    const wireBody=JSON.stringify({...body,runId});
    const requestBody=JSON.parse(wireBody);
    for(let attempt=0;attempt<3;attempt++) {
      try {
        const signal=AbortSignal.timeout(requestBody.action==='finalize'?180000:45000);
        const response=await fetcher(base+'/api/data-refresh',{method:'POST',
          headers:{'Content-Type':'application/json','OAI-Sites-Authorization':`Bearer ${token}`,'X-WenYing-Refresh-Key':key},
          body:wireBody,redirect:'manual',signal});
        const result=await responseBody(response,signal);
        if(!response.ok)throw new RefreshUploadError(response.status,result,response.headers.get('Retry-After'));
        if(!validAck(requestBody,result,runId)) {
          if(requestBody.action==='finalize'&&!(result?.runId===runId&&result?.state==='failed'))return await reconcile();
          throw new Error('REFRESH_ACK_STATE_MISMATCH');
        }
        if(requestBody.action==='begin') {
          expectedSessions=requestBody.manifest?.expectedSessions;
          expectedValuationVersion=requestBody.manifest?.valuationVersion;
        }
        if(requestBody.action==='finalize'&&Array.isArray(result.warnings)&&result.warnings.includes('FINALIZE_CLEANUP_DEFERRED'))
          log(JSON.stringify({event:'refresh_finalize_warning',phase:'finalize',warning:'FINALIZE_CLEANUP_DEFERRED'}));
        return result;
      }catch(error) {
        if(error?.preserveRun)throw error;
        // A timeout or proxy error can arrive after finalization committed.
        // Reconcile the same head; never blindly resubmit this write or fail it.
        // An unknown client error after invoking fetch cannot prove non-delivery.
        const legacyUncertain400=error instanceof RefreshUploadError&&error.status===400
          &&['UPLOAD_400_UNCLASSIFIED_ERROR','UPLOAD_400_GENERATION_HEAD_ACTIVATION_NOT_CONFIRMED',
            'UPLOAD_400_FINALIZE_OUTCOME_UNCONFIRMED'].includes(error.message);
        if(requestBody.action==='finalize'&&(isRetryableRefreshError(error)||legacyUncertain400
          ||!(error instanceof RefreshUploadError)&&error?.message!=='REFRESH_ACK_STATE_MISMATCH')) {
          if(error?.name==='AbortError')throw new RefreshFinalizeUncertainError();
          if(error instanceof RefreshUploadError&&('retryAfterSeconds' in error||'retryAfterAt' in error||error.retryAfterBeyondBudget)) {
            const delay=retryDelayMs(error,0,{random,now});
            if(delay===null)throw new RefreshFinalizeUncertainError();
            await wait(delay);
          }
          return await reconcile(error);
        }
        if(!isRetryableRefreshError(error))throw error;
        const delay=retryDelayMs(error,attempt,{random,now});
        if(attempt===2||delay===null)throw error;
        log(JSON.stringify({event:'refresh_request_retry',phase:requestBody.action,attempt:attempt+1,
          waitMs:delay,...safeRefreshFailure(error)}));
        await wait(delay);
      }
    }
  };
}
