import {spawn,execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createWriteStream,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {LOAD_LEVELS,buildRefreshLoadFixture,refreshLoadFixtureFingerprint} from './refresh-load-fixture.mjs';

export const LOAD_PROTOCOL_VERSION='synthetic-local-refresh-20261002-v1';
export const PINNED_BASELINE='f969a89';
// GitHub Git Data API preserves the exact tree but assigns new commit metadata.
export const PUBLISHED_BASELINE='28d543cf162a7944286716652ce014d84d7cc5a8';
export const BASELINE_TREE='2b9f1b681cec31aa6fa34ea84d3f2099d5574abc';
export const BASELINE_SOURCE_DIGEST='516efe0154b05c64ceb2c159c050dd9d1e37c3859fb694457c1c9b15cd1aeb86';
export const LOCAL_BUDGETS=Object.freeze({heapMiB:256,rssMiB:640,timeoutSeconds:180,sampleMilliseconds:250,
  workerConceptMiB:128,scaleHeadroomRatio:.8});
const MiB=1048576,root=fileURLToPath(new URL('../',import.meta.url)),script=fileURLToPath(import.meta.url);
const cleanEnv=()=>Object.fromEntries(['PATH','LANG','TMPDIR'].flatMap(key=>process.env[key]===undefined?[]:[[key,process.env[key]]]));
const sha=value=>createHash('sha256').update(value).digest('hex');
const report=value=>process.stdout.write(JSON.stringify(value)+'\n');

export function nativeLoadOutput(record,state) {
  const stock=state.stock;
  return {market:record.market,ticker:record.ticker,hasModel:state.hasModel,rankingEligible:state.rankingEligible,
    nativeFairValue:stock?.fairValue??null,nativeUpside:stock?.upside??null,confidence:stock?.valuationConfidence??null,
    reviewRequired:stock?.valuationReviewRequired??null,
    models:stock?.models.map(model=>({id:model.id,value:model.value,rangeLow:model.rangeLow,rangeHigh:model.rangeHigh,weight:model.weight}))??[]};
}

/** Real SQLite execution metrics, never substituted runtime measurements. */
export function measuredDatabase(sample=()=>{}) {
  const raw=new DatabaseSync(':memory:'),metrics={queries:0,queryStockRows:0,queryStockBytes:0,maxQueryStockBytes:0,maxQueryStockRows:0,integrityPages:0,maxIntegrityPageBytes:0,sourceProjection:{pages:0,rows:0,totalBytes:0,maxBytes:0},fullStored:{pages:0,rows:0,totalBytes:0,maxBytes:0}};
  function prepare(sql,args=[]) {
    const executed=rows=>{
      metrics.queries++;sample();
      if(Array.isArray(rows)) {
        let bytes=0,stockRows=0;
        for(const row of rows)if(typeof row.stock==='string') {bytes+=Buffer.byteLength(row.stock);stockRows++;}
        metrics.queryStockRows+=stockRows;metrics.queryStockBytes+=bytes;
        if(stockRows) {const category=sql.includes('json_remove')?'sourceProjection':'fullStored',group=metrics[category];
          group.pages++;group.rows+=stockRows;group.totalBytes+=bytes;group.maxBytes=Math.max(group.maxBytes,bytes);}
        metrics.maxQueryStockBytes=Math.max(metrics.maxQueryStockBytes,bytes);metrics.maxQueryStockRows=Math.max(metrics.maxQueryStockRows,stockRows);
        if(sql.includes('research_integrity_candidates')||sql.includes('research_stock_candidates')) {
          metrics.integrityPages++;metrics.maxIntegrityPageBytes=Math.max(metrics.maxIntegrityPageBytes,bytes);
        }
      }
      return rows;
    };
    return {bind:(...values)=>prepare(sql,values),
      run:async()=>executed(raw.prepare(sql).run(...args)),
      all:async()=>({results:executed(raw.prepare(sql).all(...args))}),
      first:async()=>executed(raw.prepare(sql).get(...args)??null)};
  }
  return {raw,prepare,metrics,batch:async statements=>{raw.exec('BEGIN');try {
    const result=[];for(const statement of statements)result.push(await statement.run());raw.exec('COMMIT');return result;
  }catch(error){raw.exec('ROLLBACK');throw error;}}};
}

async function treeDigest(directory) {
  const entries=[];
  async function walk(dir) {for(const item of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const filename=path.join(dir,item.name);if(item.isDirectory())await walk(filename);
    else entries.push([path.relative(directory,filename),sha(await readFile(filename))]);
  }}
  await walk(path.join(directory,'lib'));entries.push(['scripts/daily-refresh.mjs',sha(await readFile(path.join(directory,'scripts/daily-refresh.mjs')))]);
  return sha(JSON.stringify(entries));
}

async function exportBaseline(output) {
  const directory=path.join(output,'baseline-f969a89');await mkdir(directory);
  let commit;
  try {commit=execFileSync('git',['rev-parse',PINNED_BASELINE+'^{commit}'],{cwd:root,env:cleanEnv(),encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
  catch {commit=execFileSync('git',['rev-parse',PUBLISHED_BASELINE+'^{commit}'],{cwd:root,env:cleanEnv(),encoding:'utf8'}).trim();}
  assert.equal(execFileSync('git',['rev-parse',commit+'^{tree}'],{cwd:root,env:cleanEnv(),encoding:'utf8'}).trim(),BASELINE_TREE,'Pinned baseline tree changed');
  const files=execFileSync('git',['ls-tree','-r','--name-only',commit,'lib','scripts/daily-refresh.mjs'],{cwd:root,env:cleanEnv(),encoding:'utf8'}).trim().split('\n');
  for(const filename of files) {
    const target=path.join(directory,filename);await mkdir(path.dirname(target),{recursive:true});
    await writeFile(target,execFileSync('git',['show',commit+':'+filename],{cwd:root,env:cleanEnv(),maxBuffer:32*MiB}),{flag:'wx'});
  }
  const sourceDigest=await treeDigest(directory);assert.equal(sourceDigest,BASELINE_SOURCE_DIGEST,'Pinned baseline runtime changed');
  return {directory,commit,sourceDigest};
}

async function worker(config) {
  // Even an accidental upstream call fails. No credentials are inherited.
  globalThis.fetch=async()=>{throw new Error('LOCAL_LOAD_NETWORK_DISABLED');};
  const load=file=>import(pathToFileURL(path.join(config.sourceDirectory,file)).href);
  const {prepareTaiwanRefreshGeneration}=await load('lib/daily-refresh-generation.ts');
  const {handleRefreshWrite,handleDailyRead}=await load('lib/daily-refresh-store.ts');
  const {DAILY_VALUATION_VERSION,dailyValuationState}=await load('lib/daily-valuation-state.ts');
  const {refreshUploadBatches}=await load('scripts/daily-refresh.mjs');
  const secret='synthetic-local-only-0000000000000000000000',runId='local_load_'+config.level.id;
  const result={protocol:LOAD_PROTOCOL_VERSION,arm:config.arm,level:config.level,runId,status:'running',budgets:LOCAL_BUDGETS,
    goal:config.nativeProofOnly?'native-output-proof-only':'complete-local-refresh',
    interpretation:'Synthetic Node/SQLite measurements; neither official market inputs nor D1/Worker capacity.',
    node:process.version,platform:process.platform,architecture:process.arch,sourceDigestBefore:await treeDigest(config.sourceDirectory),
    stages:[],invocations:[],maxQueriesPerInvocation:0,queriesByInvocationKind:{},uploads:{batches:0,records:0,totalBytes:0,maxBatchBytes:0},reads:{requests:0,responseBytes:0,maxResponseBytes:0},correctness:{}};
  let peakHeap=0,peakRss=0,stagePeakHeap=0,stagePeakRss=0,lastMemoryReport=0,activeStage='setup';
  const sample=()=>{const memory=process.memoryUsage();peakHeap=Math.max(peakHeap,memory.heapUsed);peakRss=Math.max(peakRss,memory.rss);stagePeakHeap=Math.max(stagePeakHeap,memory.heapUsed);stagePeakRss=Math.max(stagePeakRss,memory.rss);
    if(performance.now()-lastMemoryReport>=LOCAL_BUDGETS.sampleMilliseconds) {lastMemoryReport=performance.now();
      report({event:'memory_sample',rssBytes:memory.rss,heapBytes:memory.heapUsed,kernelMaxRssBytes:process.resourceUsage().maxRSS*1024});}
  };
  const db=measuredDatabase(()=>{sample();if(peakRss>LOCAL_BUDGETS.rssMiB*MiB)throw new Error('LOCAL_RSS_BUDGET');});const timer=setInterval(sample,20);timer.unref();
  async function stage(name,action) {
    activeStage=name;stagePeakHeap=0;stagePeakRss=0;sample();const wall=performance.now(),cpu=process.cpuUsage(),queries=db.metrics.queries;
    report({event:'stage_start',arm:config.arm,level:config.level.id,stage:name});
    try {return await action();}finally {
      sample();const consumed=process.cpuUsage(cpu),memory=process.memoryUsage();
      const metrics={name,wallMilliseconds:performance.now()-wall,cpuUserMilliseconds:consumed.user/1000,cpuSystemMilliseconds:consumed.system/1000,
        endHeapBytes:memory.heapUsed,endRssBytes:memory.rss,sampledPeakHeapBytes:stagePeakHeap,sampledPeakRssBytes:stagePeakRss,
        processKernelMaxRssBytes:process.resourceUsage().maxRSS*1024,queries:db.metrics.queries-queries};
      result.stages.push(metrics);report({event:'stage_end',arm:config.arm,level:config.level.id,...metrics});
      if(peakRss>LOCAL_BUDGETS.rssMiB*MiB)throw new Error('LOCAL_RSS_BUDGET');
    }
  }
  const write=async body=>{
    const json=JSON.stringify({runId,...body});
    if(body.action==='batch') {const bytes=Buffer.byteLength(json);result.uploads.batches++;result.uploads.records+=body.records.length;
      result.uploads.totalBytes+=bytes;result.uploads.maxBatchBytes=Math.max(result.uploads.maxBatchBytes,bytes);}
    const queriesBefore=db.metrics.queries,wallBefore=performance.now();
    const response=await handleRefreshWrite(new Request('https://synthetic.invalid/api/data-refresh',{method:'POST',
      headers:{'X-WenYing-Refresh-Key':secret},body:json}),db,secret),payload=await response.json();
    const queries=db.metrics.queries-queriesBefore;result.invocations.push({kind:body.action,status:response.status,queries,wallMilliseconds:performance.now()-wallBefore});
    result.maxQueriesPerInvocation=Math.max(result.maxQueriesPerInvocation,queries);
    result.queriesByInvocationKind[body.action]=Math.max(result.queriesByInvocationKind[body.action]??0,queries);
    report({event:'invocation',...result.invocations.at(-1),uploads:result.uploads});
    assert.equal(response.status,200,JSON.stringify(payload));return payload;
  };
  const read=async query=>{
    const queriesBefore=db.metrics.queries,wallBefore=performance.now();
    const response=await handleDailyRead(new Request('https://synthetic.invalid/api/market-scan?'+query),db),text=await response.text();
    const bytes=Buffer.byteLength(text);result.reads.requests++;result.reads.responseBytes+=bytes;
    result.reads.maxResponseBytes=Math.max(result.reads.maxResponseBytes,bytes);
    const queries=db.metrics.queries-queriesBefore;result.invocations.push({kind:'research-read',query,status:response.status,queries,wallMilliseconds:performance.now()-wallBefore});
    result.maxQueriesPerInvocation=Math.max(result.maxQueriesPerInvocation,queries);result.queriesByInvocationKind['research-read']=Math.max(result.queriesByInvocationKind['research-read']??0,queries);
    report({event:'invocation',...result.invocations.at(-1),reads:result.reads});
    assert.equal(response.status,200,text.slice(0,250));const payload=JSON.parse(text);
    assert.equal(payload.freshness.runId,runId);assert.equal(payload.researchStatus,'current');return payload;
  };
  try {
    let fixture=buildRefreshLoadFixture(config.level,{valuationVersion:DAILY_VALUATION_VERSION,runId});
    result.fixture=fixture.meta;result.inputFingerprint=refreshLoadFixtureFingerprint(fixture);
    report({event:'fixture_ready',inputFingerprint:result.inputFingerprint,fixture:result.fixture,level:config.level,sourceDigestBefore:result.sourceDigestBefore});
    let records=await stage('prepare',()=>prepareTaiwanRefreshGeneration(fixture.records,runId));
    const manifest=fixture.manifest;fixture=null;
    result.correctness.preparedIdentities=records.length;
    result.correctness.maxPeers=Math.max(...records.filter(record=>record.market==='TW').map(record=>record.stock.comparableMultiples.peerCount));
    assert.equal(result.correctness.maxPeers,config.level.groupSize-1);
    await stage('verify_prepared_native_outputs',async()=>{
      const hash=createHash('sha256'),nativeOutputs=config.nativeProofOnly?[]:null;
      for(const record of records) {
        const state=dailyValuationState(record.stock,runId);
        const output=nativeLoadOutput(record,state);hash.update(JSON.stringify(output)+'\n');
        if(nativeOutputs)nativeOutputs.push(output);
      }
      result.correctness.preparedNativeOutputsDigest=hash.digest('hex');
      if(nativeOutputs) {
        result.nativeOutputsPath=config.resultPath.replace(/\.json$/,'.native-outputs.json');
        await writeFile(result.nativeOutputsPath,JSON.stringify(nativeOutputs)+'\n',{flag:'wx'});
      }
      report({event:'prepared_correctness',correctness:result.correctness});
    });
    if(!config.nativeProofOnly) {
    await stage('upload',async()=>{
      await write({action:'begin',manifest});
      for(const batch of refreshUploadBatches(records,runId))await write({action:'batch',records:batch});
    });
    records=null;
    const published=await stage('finalize',()=>write({action:'finalize'}));
    assert.equal(published.state,'complete');
    result.correctness.publishedCoverage=published.coverage;
    result.storedStockBytesByMarket=Object.fromEntries((await db.prepare('SELECT market,SUM(length(CAST(stock AS BLOB))) AS bytes FROM daily_refresh_records WHERE run_id=? GROUP BY market').bind(runId).all()).results.map(row=>[row.market,row.bytes]));
    result.storedHistoryBytesByMarket=Object.fromEntries((await db.prepare('SELECT market,SUM(length(CAST(history AS BLOB))) AS bytes FROM daily_refresh_records WHERE run_id=? GROUP BY market').bind(runId).all()).results.map(row=>[row.market,row.bytes]));
    const seals=await db.prepare('SELECT market,version,digest,ready_count FROM daily_refresh_research_seals WHERE run_id=? ORDER BY market').bind(runId).all();
    assert.equal(seals.results.length,2);result.seals=seals.results;
    await stage('research_sort_and_paging',async()=>{
      const byMarket={};
      for(const market of ['TW','US']) {
        const expected=(await db.prepare(`SELECT ticker,json_extract(stock,'$.dailyResearch.estimatedUpside') AS gap,
          json_extract(stock,'$.dailyResearch.qualityScore') AS quality,json_extract(stock,'$.price') AS price
          FROM daily_refresh_records WHERE run_id=? AND market=? AND json_extract(stock,'$.dailyResearch.hasModel')=1
            AND json_extract(stock,'$.dailyResearch.rankingEligible')=0 ORDER BY gap DESC,ticker`).bind(runId,market).all()).results;
        const identifiers=[];const base=new URLSearchParams({scope:'research',runId,market,limit:'20',sort:'upside'});
        for(let offset=0;offset<Math.max(expected.length,1);offset+=20) {
          base.set('offset',String(offset));const payload=await read(base.toString());
          assert.equal(payload.researchCounts[market],expected.length);
          for(const input of payload.researchCandidates) {
            const state=dailyValuationState(input,runId);assert.equal(state.hasModel,true);assert.equal(state.rankingEligible,false);
            assert.equal(input.dailyResearch.estimatedUpside,state.estimatedUpside);identifiers.push(input.ticker);
          }
        }
        assert.deepEqual(identifiers,expected.map(row=>row.ticker));assert.equal(new Set(identifiers).size,identifiers.length);
        for(const [sort,field,ascending] of [['upside_asc','gap',true],['quality','quality',false],['price','price',false]]) {
          const sorted=[...expected].sort((a,b)=>(ascending?a[field]-b[field]:b[field]-a[field])||a.ticker.localeCompare(b.ticker));
          base.set('offset','0');base.set('sort',sort);const payload=await read(base.toString());
          assert.deepEqual(payload.researchCandidates.map(input=>input.ticker),sorted.slice(0,20).map(row=>row.ticker));
        }
        byMarket[market]={expected:expected.length,visited:identifiers.length,identifiersDigest:sha(JSON.stringify(identifiers))};
      }
      result.correctness.research=byMarket;
      result.correctness.sortedAndPagedEntireResearchCohort=true;
    });
    }else result.verificationOnly=true;
    result.sourceDigestAfter=await treeDigest(config.sourceDirectory);
    assert.equal(result.sourceDigestAfter,result.sourceDigestBefore,'Runtime source changed during measurement');
    result.status='passed';
  }catch(error) {result.status='failed';result.error=error instanceof Error?error.message:String(error);result.failedStage=activeStage;}
  finally {
    clearInterval(timer);sample();result.database={...db.metrics};result.sampledPeakHeapBytes=peakHeap;result.sampledPeakRssBytes=peakRss;
    result.processKernelMaxRssBytes=process.resourceUsage().maxRSS*1024;db.raw.close();
    writeFileSync(config.resultPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  }
  report({event:'arm_result',arm:config.arm,level:config.level.id,status:result.status,resultPath:config.resultPath});
  process.exitCode=result.status==='passed'?0:1;
}

async function runBounded(config) {
  const stdoutPath=path.join(config.output,config.arm+'-'+config.level.id+'.stdout.jsonl'),stderrPath=path.join(config.output,config.arm+'-'+config.level.id+'.stderr.log');
  const out=createWriteStream(stdoutPath,{flags:'wx'}),err=createWriteStream(stderrPath,{flags:'wx'});
  const child=spawn(process.execPath,['--max-old-space-size='+LOCAL_BUDGETS.heapMiB,'--experimental-strip-types',script,'--worker',JSON.stringify(config)],
    {cwd:root,env:cleanEnv(),stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(out);child.stderr.pipe(err);let lineBuffer='',latestStage=null,observedPeakRss=0,observedPeakHeap=0,observedKernelRss=0,stopReason=null;
  const completedStages=[],observedInvocations=[];let fixtureMetadata=null,partialUploads=null,partialReads=null;
  child.stdout.on('data',chunk=>{lineBuffer+=chunk.toString();let newline;
    while((newline=lineBuffer.indexOf('\n'))>=0) {const line=lineBuffer.slice(0,newline);lineBuffer=lineBuffer.slice(newline+1);
      try {const event=JSON.parse(line);if(event.event==='stage_start')latestStage=event.stage;
        if(event.event==='fixture_ready')fixtureMetadata=event;
        if(event.event==='prepared_correctness')fixtureMetadata={...fixtureMetadata,correctness:event.correctness};
        if(event.event==='invocation'){observedInvocations.push(event);if(event.uploads)partialUploads=event.uploads;if(event.reads)partialReads=event.reads;}if(event.event==='stage_end'){completedStages.push(event);report(event);}
        if(event.event==='memory_sample'){observedPeakRss=Math.max(observedPeakRss,event.rssBytes);observedPeakHeap=Math.max(observedPeakHeap,event.heapBytes);
          observedKernelRss=Math.max(observedKernelRss,event.kernelMaxRssBytes);
          if(event.rssBytes>LOCAL_BUDGETS.rssMiB*MiB&&!stopReason){stopReason='LOCAL_RSS_BUDGET';child.kill('SIGTERM');}}}catch {/* Preserve raw stdout log. */}}
  });
  const started=performance.now(),timeout=setTimeout(()=>{stopReason='LOCAL_TIMEOUT';child.kill('SIGTERM');},LOCAL_BUDGETS.timeoutSeconds*1000);
  const progress=setInterval(()=>report({event:'progress',arm:config.arm,level:config.level.id,stage:latestStage,
    elapsedSeconds:+((performance.now()-started)/1000).toFixed(1),observedWorkerPeakRssMiB:+(observedPeakRss/MiB).toFixed(1)}),3000);
  const closed=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));});
  clearInterval(progress);clearTimeout(timeout);out.end();err.end();
  const observation={arm:config.arm,level:config.level.id,...closed,stopReason,observedWorkerSampledPeakRssBytes:observedPeakRss,observedWorkerSampledPeakHeapBytes:observedPeakHeap,observedKernelMaxRssBytes:observedKernelRss,completedStages,observedInvocations,rssObservation:'Worker telemetry plus kernel process maxRSS; no external ps polling.',
    wallMilliseconds:performance.now()-started,latestStage,stdoutPath,stderrPath,resultPath:config.resultPath};
  try {observation.measurement=JSON.parse(await readFile(config.resultPath,'utf8'));}
  catch {observation.measurement={...fixtureMetadata,uploads:partialUploads,reads:partialReads,status:'aborted',error:stopReason??(closed.signal==='SIGABRT'?'NODE_HEAP_OR_PROCESS_ABORT':'CHILD_EXIT_WITHOUT_RESULT')};}
  if(stopReason)observation.measurement.status='aborted';
  return observation;
}

export function loadScaleAllowed(previous,budgets=LOCAL_BUDGETS) {
  if(!previous||previous.measurement.status!=='passed'||previous.stopReason)return false;
  return Math.max(previous.observedWorkerSampledPeakRssBytes,previous.measurement.processKernelMaxRssBytes)<budgets.rssMiB*MiB*budgets.scaleHeadroomRatio
    &&previous.measurement.sampledPeakHeapBytes<budgets.heapMiB*MiB*budgets.scaleHeadroomRatio
    &&previous.wallMilliseconds<budgets.timeoutSeconds*1000*budgets.scaleHeadroomRatio;
}

/** A conservative local abort gate, not a measured capacity prediction. */
export function loadScalePreflight(previous,nextLevel,budgets=LOCAL_BUDGETS) {
  const measured=previous?.measurement;
  if(!loadScaleAllowed(previous,budgets))return {allowed:false,reason:'PREVIOUS_LEVEL_FAILED_OR_INSUFFICIENT_LOCAL_HEADROOM'};
  if(nextLevel.id!=='usefulReady6165')return {allowed:true};
  if(!measured.storedStockBytesByMarket||!measured.storedHistoryBytesByMarket)return {allowed:false,reason:'MISSING_MEASURED_FOOTPRINT'};
  const previousLevel=measured.level;
  let additionalStockBytes=0,additionalHistoryBytes=0;
  for(const [market,countKey] of [['TW','twCount'],['US','usCount']]) {
    const ratio=nextLevel[countKey]/previousLevel[countKey]-1;
    additionalStockBytes+=Math.max(0,ratio)*measured.storedStockBytesByMarket[market];
    additionalHistoryBytes+=Math.max(0,ratio)*measured.storedHistoryBytesByMarket[market];
  }
  // Two additional stock representations plus one history representation are
  // deliberately conservative. Do not call this a platform memory forecast.
  const projectedLocalRssBytes=measured.processKernelMaxRssBytes+2*additionalStockBytes+additionalHistoryBytes;
  return {allowed:projectedLocalRssBytes<budgets.rssMiB*MiB,reason:'CONSERVATIVE_LOCAL_RSS_PREFLIGHT',
    projectedLocalRssBytes,additionalStockBytes,additionalHistoryBytes};
}

async function main() {
  const options=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');assert.ok(at>2,'Use --name=value');return [arg.slice(2,at),arg.slice(at+1)];}));
  assert.ok(Object.keys(options).every(key=>['levels','arms','output','native-proof-only'].includes(key)),'Unknown option');
  assert.ok(options['native-proof-only']===undefined||options['native-proof-only']==='true','native-proof-only must be true or omitted');
  const levels=(options.levels??'dense185,groups740').split(',').map(id=>{const level=LOAD_LEVELS.find(level=>level.id===id);assert.ok(level,'Unknown fixed load level: '+id);return level;});
  assert.deepEqual(levels.map(level=>level.id),LOAD_LEVELS.slice(0,levels.length).map(level=>level.id),'Use the ordered fixed-level prefix starting at dense185');
  const nativeProofOnly=options['native-proof-only']==='true';
  assert.ok(!nativeProofOnly||levels.length<=2,'Native-only proof is bounded to dense185/groups740');
  const arms=(options.arms??'baseline,candidate').split(',');assert.ok(arms.length>0&&new Set(arms).size===arms.length&&arms.every(arm=>['baseline','candidate'].includes(arm)));
  const output=path.resolve(options.output??path.join(root,'outputs','refresh-load-20261002-'+randomUUID()));
  assert.ok(output.startsWith(path.join(root,'outputs')+path.sep),'Output must be a new ignored outputs subdirectory');await mkdir(output,{recursive:false});
  const baseline=await exportBaseline(output),candidateDigest=await treeDigest(root),results=[],previous={};
  for(const level of levels)for(const arm of arms) {
    const preflight=level.id==='dense185'?{allowed:true}:loadScalePreflight(previous[arm],level);
    if(!preflight.allowed) {const skipped={arm,level:level.id,preflight,measurement:{status:'skipped',error:'NOT_RUN_'+preflight.reason}};results.push(skipped);report(skipped);continue;}
    const observation=await runBounded({arm,level,output,nativeProofOnly,sourceDirectory:arm==='baseline'?baseline.directory:root,resultPath:path.join(output,arm+'-'+level.id+'.json')});
    previous[arm]=observation;results.push(observation);report({event:'finished',arm,level:level.id,status:observation.measurement.status});
  }
  const comparisons=await Promise.all(levels.map(async level=>{
    const records=results.filter(result=>result.level===level.id&&result.measurement.inputFingerprint);
    let nativeDeepEqual=null;
    if(nativeProofOnly&&records.length===2) {
      const outputs=await Promise.all(records.map(record=>readFile(record.measurement.nativeOutputsPath,'utf8').then(JSON.parse)));
      assert.deepEqual(outputs[0],outputs[1],'Baseline/candidate native model values or ranges differ');nativeDeepEqual=true;
    }
      return {level:level.id,armsMeasured:records.length,
        sameInputs:records.length===2?records[0].measurement.inputFingerprint===records[1].measurement.inputFingerprint:null,
        samePreparedNativeOutputs:records.length===2?records[0].measurement.correctness?.preparedNativeOutputsDigest===records[1].measurement.correctness?.preparedNativeOutputsDigest:null,
        nativeDeepEqual};}));
  const summary={protocol:LOAD_PROTOCOL_VERSION,goal:nativeProofOnly?'native-output-proof-only':'complete-local-refresh',baseline,candidateDigest,budgets:LOCAL_BUDGETS,results,sameInputComparisons:comparisons};
  await writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});report({event:'summary',output});
}

if(process.argv[1]===script) {
  if(process.argv[2]==='--worker')await worker(JSON.parse(process.argv[3]));
  else await main().catch(error=>{report({event:'failed',error:error.message});process.exitCode=1;});
}
