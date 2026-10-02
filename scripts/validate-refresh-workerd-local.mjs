import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildRefreshLoadFixture,refreshLoadFixtureFingerprint} from './refresh-load-fixture.mjs';
import {prepareTaiwanRefreshGeneration} from '../lib/daily-refresh-generation.ts';
import {refreshUploadBatches} from './daily-refresh.mjs';
import {DAILY_VALUATION_VERSION,dailyValuationState} from '../lib/daily-valuation-state.ts';

export const WORKERD_LOCAL_PROTOCOL='synthetic-local-workerd-refresh-v1';
export const WORKERD_LOCAL_SECRET='synthetic-local-only-workerd-20261002';
export const WORKERD_COMPATIBILITY_DATE='2026-05-15';
export const WORKERD_REQUEST_TIMEOUT_MS=30000;
const root=fileURLToPath(new URL('../',import.meta.url));
const script=fileURLToPath(import.meta.url),MiB=1048576;
const sha=value=>createHash('sha256').update(value).digest('hex');
const report=value=>process.stdout.write(JSON.stringify(value)+'\n');

export function localWorkerdOptions(bundlePath,blocked={count:0}) {
  return {name:'wenying-refresh-local',modules:true,scriptPath:bundlePath,modulesRoot:path.dirname(bundlePath),host:'127.0.0.1',port:0,inspectorPort:0,unsafeInspectorProxy:false,
    compatibilityDate:WORKERD_COMPATIBILITY_DATE,compatibilityFlags:['nodejs_compat'],cf:false,
    d1Databases:{DB:'synthetic-local-'+randomUUID()},d1Persist:false,
    outboundService:async()=>{blocked.count++;return new Response('LOCAL_NETWORK_DISABLED',{status:503});}};
}

export function validateWorkerdLevels(levels) {
  assert.ok(Array.isArray(levels)&&levels.length>0&&levels.length<=2);
  assert.deepEqual(levels,['dense185','groups740'].slice(0,levels.length),'Only the ordered 185/740 local safety prefix is allowed');
  return levels;
}

export function workerdScaleAllowed(previous) {
  // CDP checkpoint samples cannot prove a peak or isolate headroom. Do not
  // scale from them alone; an instrumented peak/limit proof is required.
  return previous?.status==='passed'&&previous?.isolatePeakHeapVerified===true
    &&Number.isFinite(previous.isolatePeakHeapBytes)&&previous.isolatePeakHeapBytes<64*MiB;
}

export function preparedPeerDigest(records) {
  const members=records.filter(row=>row.market==='TW').map(row=>[row.ticker,sha(JSON.stringify(row.stock.comparableMultiples??null))]);
  return sha(JSON.stringify(members));
}

export function localWorkerSource() {
  return `import {handleRefreshWrite,handleDailyRead} from './lib/daily-refresh-store.ts';
import {prepareTaiwanRefreshGeneration} from './lib/daily-refresh-generation.ts';
const secret=${JSON.stringify(WORKERD_LOCAL_SECRET)};
globalThis.fetch=async()=>{throw new Error('LOCAL_NETWORK_DISABLED');};
const bytes=value=>new TextEncoder().encode(value).byteLength;
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');
function measuredDatabase(db,metrics) {
  const wrap=statement=>({native:statement,bind:(...values)=>wrap(statement.bind(...values)),
    run:async()=>{metrics.queries++;return statement.run();},
    first:async()=>{metrics.queries++;return statement.first();},
    all:async()=>{metrics.queries++;const result=await statement.all();let total=0;
      for(const row of result.results??[])if(typeof row.stock==='string')total+=bytes(row.stock);
      metrics.maxStockPageBytes=Math.max(metrics.maxStockPageBytes,total);return result;}});
  return {prepare:sql=>wrap(db.prepare(sql)),batch:async statements=>{metrics.queries+=statements.length;return db.batch(statements.map(statement=>statement.native));}};
}
export default {async fetch(request,env) {
  const metrics={queries:0,maxStockPageBytes:0};let response;
  if(request.headers.get('X-WenYing-Refresh-Key')!==secret)return new Response('LOCAL_KEY_REQUIRED',{status:403});
  const url=new URL(request.url);if(!['localhost','127.0.0.1'].includes(url.hostname))return new Response('LOCALHOST_ONLY',{status:403});
  if(url.pathname==='/__local_prepare') {
    const body=await request.json(),prepared=prepareTaiwanRefreshGeneration(body.records,body.runId),members=[];
    let maxPeers=0,maxStockBytes=0;
    for(const row of prepared)if(row.market==='TW') {members.push([row.ticker,await digest(JSON.stringify(row.stock.comparableMultiples??null))]);
      maxPeers=Math.max(maxPeers,row.stock.comparableMultiples?.peerCount??0);maxStockBytes=Math.max(maxStockBytes,bytes(JSON.stringify(row.stock)));}
    response=Response.json({prepared:prepared.length,tw:members.length,maxPeers,maxStockBytes,peerDigest:await digest(JSON.stringify(members))});
  } else if(url.pathname==='/api/data-refresh')response=await handleRefreshWrite(request,measuredDatabase(env.DB,metrics),secret);
  else response=await handleDailyRead(request,measuredDatabase(env.DB,metrics))??new Response('LOCAL_PATH_UNKNOWN',{status:404});
  const headers=new Headers(response.headers);headers.set('X-Local-D1-Statements',String(metrics.queries));
  headers.set('X-Local-Stock-Page-Bytes',String(metrics.maxStockPageBytes));
  return new Response(response.body,{status:response.status,headers});
}};`;
}

async function coreHashes() {
  return Object.fromEntries(await Promise.all(['lib/taiwan-comparables.ts','lib/daily-refresh-store.ts','lib/daily-refresh-generation.ts',
    'lib/daily-research-ranking.ts','lib/daily-valuation-state.ts','lib/taiwan-multiple-applicability.ts','lib/valuation.ts']
    .map(async filename=>[filename,sha(await readFile(path.join(root,filename)))])));
}

async function heapInspector(mf) {
  let socket;
  try {
    const base=await mf.getInspectorURL();base.protocol='http:';const response=await fetch(new URL('/json/list',base));
    const targets=await response.json(),target=targets.find(item=>(item.id??'').includes('core:user:wenying-refresh-local')||(item.title??'').includes('wenying-refresh-local'));
    if(!target?.webSocketDebuggerUrl)return {sample:async()=>({status:'unavailable',reason:'Named isolate inspector target unavailable'}),close:()=>{}};
    socket=new WebSocket(target.webSocketDebuggerUrl);await Promise.race([
      new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});}),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('INSPECTOR_CONNECT_TIMEOUT')),2000))]);
    let id=0;const pending=new Map();socket.addEventListener('message',event=>{const message=JSON.parse(String(event.data));
      const waiter=pending.get(message.id);if(waiter){pending.delete(message.id);waiter(message);}});
    return {sample:async()=>{const requestId=++id;let timer;
      const reply=await new Promise(resolve=>{timer=setTimeout(()=>{pending.delete(requestId);resolve({error:{message:'Inspector heap command unavailable'}});},1500);
        pending.set(requestId,resolve);socket.send(JSON.stringify({id:requestId,method:'Runtime.getHeapUsage'}));});clearTimeout(timer);
      return reply.error?{status:'unavailable',reason:reply.error.message}:{status:'checkpoint-only',...reply.result};},close:()=>socket.close()};
  }catch(error){socket?.close();return {sample:async()=>({status:'unavailable',reason:error.message}),close:()=>{}};}
}

export async function runWorkerdLocal(output,levels=['dense185']) {
  validateWorkerdLevels(levels);const directory=path.resolve(output);
  assert.ok(directory.startsWith(path.join(root,'outputs')+path.sep),'Use a fresh ignored outputs directory');
  await mkdir(directory,{recursive:false});const temporary=await mkdtemp(path.join(tmpdir(),'wenying-workerd-local-'));
  const result={protocol:WORKERD_LOCAL_PROTOCOL,synthetic:true,status:'running',compatibilityDate:WORKERD_COMPATIBILITY_DATE,
    productionCompatibilityDate:'2026-08-16',coreHashes:await coreHashes(),levels:[],externalRequestsBlocked:0,
    interpretation:'Local workerd/D1 engine compatibility only. No formal D1, account quotas, paid/free plan, CPU limit or production peak-memory certification.',
    limitEnforcement:'not-enforced-local-workerd',limitSource:'https://github.com/cloudflare/workerd/blob/v1.20260515.1/src/workerd/server/server.c%2B%2B#L1620',
    sourceSha256:sha(localWorkerSource()),isolatePeakHeapVerified:false};
  let mf,inspector;const blocked={count:0};
  try {
    const {build}=await import('esbuild'),{Miniflare}=await import('miniflare');
    const bundle=path.join(temporary,'core.mjs');
    await build({stdin:{contents:localWorkerSource(),resolveDir:root,sourcefile:'local-refresh-entry.mjs'},outfile:bundle,
      bundle:true,platform:'neutral',format:'esm',target:'es2022',logLevel:'silent',external:['node:*']});
    result.bundleSha256=sha(await readFile(bundle));result.bundleBytes=(await readFile(bundle)).byteLength;
    result.versions={node:process.version,miniflare:JSON.parse(await readFile(path.join(root,'node_modules/miniflare/package.json'))).version,
      workerd:JSON.parse(await readFile(path.join(root,'node_modules/workerd/package.json'))).version};
    mf=new Miniflare(localWorkerdOptions(bundle,blocked));await mf.ready;inspector=await heapInspector(mf);
    for(const level of levels) {
      if(level==='groups740'&&!workerdScaleAllowed(result.levels.at(-1))) {result.levels.push({level,status:'skipped',reason:'No verified isolate peak-memory headroom; checkpoint samples do not authorize scaling'});continue;}
      const runId='workerd_local_'+level,fixture=buildRefreshLoadFixture(level,{runId,valuationVersion:DAILY_VALUATION_VERSION});
      const measured={level,status:'running',synthetic:true,inputFingerprint:refreshLoadFixtureFingerprint(fixture),requests:[],heapSamples:[],isolatePeakHeapVerified:false};
      result.levels.push(measured);
      const invoke=async(name,pathname,body)=>{
        report({event:'workerd_request',level,name});const started=performance.now();let timer;
        try {
          const response=await Promise.race([mf.dispatchFetch('http://localhost'+pathname,{method:body?'POST':'GET',
            headers:{'X-WenYing-Refresh-Key':WORKERD_LOCAL_SECRET},...(body?{body:JSON.stringify(body)}:{})}),
            new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('LOCAL_WORKERD_REQUEST_TIMEOUT')),WORKERD_REQUEST_TIMEOUT_MS);})]);
          const text=await response.text(),measurement={name,status:response.status,wallMilliseconds:performance.now()-started,
            d1Statements:Number(response.headers.get('X-Local-D1-Statements')),maxStockPageBytes:Number(response.headers.get('X-Local-Stock-Page-Bytes')),responseBytes:Buffer.byteLength(text)};
          measured.requests.push(measurement);report({event:'workerd_response',level,...measurement});
          assert.equal(response.status,200,text.slice(0,300));return JSON.parse(text);
        }finally {clearTimeout(timer);measured.heapSamples.push({after:name,...await inspector.sample()});}
      };
      const records=prepareTaiwanRefreshGeneration(fixture.records,runId),preparedDigest=preparedPeerDigest(records);
      const enginePrepared=await invoke('prepare-engine-parity','/__local_prepare',{runId,records:fixture.records});
      assert.equal(enginePrepared.prepared,records.length);assert.equal(enginePrepared.maxPeers,184);
      assert.equal(enginePrepared.peerDigest,preparedDigest);measured.prepare=enginePrepared;
      await invoke('begin','/api/data-refresh',{action:'begin',runId,manifest:fixture.manifest});
      let batchNumber=0;for(const batch of refreshUploadBatches(records,runId))
        await invoke('batch-'+(++batchNumber),'/api/data-refresh',{action:'batch',runId,records:batch});
      const finalized=await invoke('finalize','/api/data-refresh',{action:'finalize',runId});assert.equal(finalized.state,'complete');
      assert.equal(finalized.coverage.TW.ready,fixture.meta.twCount);assert.equal(finalized.coverage.US.ready,8);measured.finalized=finalized;
      const formal=await invoke('formal-gate','/api/market-scan?runId='+runId+'&market=TW');
      assert.equal(formal.candidates.filter(stock=>stock.market==='TW').length,0);
      assert.equal(formal.overvaluedCandidates.filter(stock=>stock.market==='TW').length,0);
      const ids=[],researchBase='/api/market-scan?scope=research&market=TW&runId='+runId+'&limit=20';
      for(let offset=0;offset<fixture.meta.twCount;offset+=20) {
        const page=await invoke('research-page-'+offset,researchBase+'&offset='+offset+'&sort=upside');
        assert.equal(page.freshness.runId,runId);assert.equal(page.researchStatus,'current');assert.equal(page.researchCounts.TW,fixture.meta.twCount);
        for(const stock of page.researchCandidates){const state=dailyValuationState(stock,runId);
          assert.ok(state.hasModel&&!state.rankingEligible);assert.equal(stock.dailyResearch.estimatedUpside,state.estimatedUpside);ids.push(stock.ticker);}
      }
      const expected=records.filter(row=>row.market==='TW').map(row=>({ticker:row.ticker,gap:dailyValuationState(row.stock,runId).estimatedUpside}))
        .sort((a,b)=>b.gap-a.gap||a.ticker.localeCompare(b.ticker)).map(row=>row.ticker);
      assert.deepEqual(ids,expected);assert.equal(new Set(ids).size,fixture.meta.twCount);assert.equal(ids[0],fixture.meta.highestNativeGapTicker);
      const maximumPage=await invoke('research-max-page','/api/market-scan?scope=research&market=TW&runId='+runId+'&limit=100');
      assert.equal(maximumPage.researchStatus,'current');assert.deepEqual(maximumPage.researchCandidates.map(stock=>stock.ticker),expected.slice(0,100));
      const localDb=await mf.getD1Database('DB');
      const seals=await localDb.prepare('SELECT market,ready_count FROM daily_refresh_research_seals WHERE run_id=? ORDER BY market').bind(runId).all();
      assert.deepEqual(seals.results,[{market:'TW',ready_count:fixture.meta.twCount},{market:'US',ready_count:8}]);
      await localDb.prepare("UPDATE daily_refresh_records SET stock=json_set(stock,'$.dailyResearch.estimatedUpside',-.99) WHERE run_id=? AND market='TW' AND ticker=?")
        .bind(runId,fixture.meta.highestNativeGapTicker).run();
      const suppressed=await invoke('off-page-seal-tamper',researchBase+'&offset=0&sort=upside');
      assert.equal(suppressed.researchStatusByMarket.TW,'refresh_required');assert.deepEqual(suppressed.researchCandidates,[]);
      measured.correctness={preparePeerDigestParity:true,completePublication:true,fullCohortSortedAndPaged:true,lowConfidenceExcludedFromFormal:true,
        maximumPermittedPageSorted:true,independentSealOffPageTamperRejected:true,
        identifiersDigest:sha(JSON.stringify(ids))};measured.maxD1StatementsPerInvocation=Math.max(...measured.requests.map(request=>request.d1Statements));
      measured.status='passed';
    }
    assert.deepEqual(await coreHashes(),result.coreHashes,'Core changed while bundle was measured');
    assert.equal(blocked.count,0,'Core attempted an external request');result.status='passed';
  }catch(error){result.status='failed';result.error=error.message;report({event:'workerd_failed',error:error.message});}
  finally {
    inspector?.close();if(mf)try{await mf.dispose();}catch(error){result.cleanupError=error.message;}result.externalRequestsBlocked=blocked.count;
    await rm(temporary,{recursive:true,force:true});await writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  }
  report({event:'workerd_summary',status:result.status,output:directory});return result;
}

if(process.argv[1]===script) {
  const options=Object.fromEntries(process.argv.slice(2).map(argument=>{const at=argument.indexOf('=');assert.ok(at>2,'Use --name=value');return [argument.slice(2,at),argument.slice(at+1)];}));
  assert.ok(Object.keys(options).every(key=>['levels','output'].includes(key)),'Unknown option');
  const outcome=await runWorkerdLocal(options.output??path.join(root,'outputs','refresh-workerd-'+randomUUID()),(options.levels??'dense185').split(','));
  process.exitCode=outcome.status==='passed'?0:1;
}
