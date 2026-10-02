// Fixed real public captures through the exact native refresh/read handlers.
// SQLite is isolated in memory. No credential lookup or network is permitted.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {evaluatePublicCapture} from './capture-taiwan-pcb-public.mjs';
import {prepareTaiwanRefreshGeneration} from '../lib/daily-refresh-generation.ts';
import {DAILY_VALUATION_VERSION,dailyValuationState} from '../lib/daily-valuation-state.ts';
import {DAILY_RESEARCH_CACHE_VERSION,currentDailyResearchCache,withDailyResearchCache} from '../lib/daily-research-ranking.ts';
import {handleDailyRead,handleRefreshWrite} from '../lib/daily-refresh-store.ts';
import {analyzeTechnicalSetup} from '../lib/technical-analysis.ts';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const PUBLIC_GENERATION_PROTOCOL=Object.freeze({
  version:'fixed-public-generation-integration-v1',quoteDate:'2026-10-01',financialDate:'2026-06-30',
  valuationVersion:DAILY_VALUATION_VERSION,researchVersion:DAILY_RESEARCH_CACHE_VERSION,
  trueStockCount:17,rawBodyCount:46,syntheticControlTickers:['SYNLOW','SYNFORMAL','SYNNONE'],
  batches:[8,8,4],sorts:['upside','upside_asc','quality','price'],
  filters:['all','undervalued','overvalued','quality','risk'],pageLimit:1,
  sourcePins:{
    pcb:{directory:'pcb-public-20261002',records:10,bodies:27,
      input:'fb2df45daba04743f54e443d8c1e6480540bd97b570d20f51d97e5cf0c20a9d1',
      manifest:'a70f4e17cb716d8cb45e03a9eb6e8e189857deb6f58c3f678f0e1c2ca2034cb8'},
    memory:{directory:'memory-public-20261002',records:7,bodies:19,
      input:'25055b6d31ef9929efd595d3495f4f9a12ea0a10ed9262960687e29d9e0422d8',
      manifest:'945b8e6a545606000c4f1b812227c002f0c6f8dbe4c1b06bdc2ab55441ee9702'},
  },
});
const date=PUBLIC_GENERATION_PROTOCOL.quoteDate,oldId='public_real_previous_run',runId='public_real_current_run';
const secret='LOCAL_SYNTHETIC_AUTH_ONLY_00000000000000000';
const syntheticBase={name:'Explicit SYNTHETIC US control',market:'US',sector:'Industrials',industry:'Synthetic devices',
  price:100,eps:10,bvps:40,fcfPerShare:9,revenueGrowth:20,roe:25,debtRatio:30,
  targetPe:15,targetPb:2,targetFcfMultiple:15,uncertainty:.3,dataBasis:'ltm',dataCompleteness:'complete',
  financialDataDate:PUBLIC_GENERATION_PROTOCOL.financialDate,updatedAt:date,
  priceSource:'Yahoo Finance daily close / daily-refresh-v1',source:'EXPLICIT SYNTHETIC CONTROL; NO PROVIDER DATA',
  sourceNote:'Synthetic engineering control only. All values and candles are fabricated and are not public issuer evidence.'};
export function publicGenerationSyntheticControls() {
  const stocks=[{...syntheticBase,ticker:'SYNLOW'},
    {...syntheticBase,ticker:'SYNFORMAL',revenueGrowth:3,roe:15},
    {...syntheticBase,ticker:'SYNNONE',sector:'Real Estate',industry:'REIT',eps:0,bvps:0,fcfPerShare:0}];
  return stocks.map(stock=>{
    const candles=Array.from({length:80},(_,i)=>({date:new Date(Date.parse(date)-(79-i)*86400000).toISOString().slice(0,10),
      open:stock.price,high:stock.price+1,low:stock.price-1,close:stock.price,volume:1000000}));
    return {ticker:stock.ticker,market:'US',status:'ready',stock,issues:[],rankingEligible:true,quoteDate:date,
      financialDate:stock.financialDataDate,fetchedAt:'2026-10-02T00:00:00.000Z',
      sources:['https://example.invalid/explicit-synthetic-control'],history:{ticker:stock.ticker,market:'US',name:stock.name,
        quoteSource:stock.priceSource,candles,weeklyCandles:[],monthlyCandles:[],technicalAnalysis:analyzeTechnicalSetup(candles,null)}};
  });
}
function database() {
  const raw=new DatabaseSync(':memory:');
  const prepare=(sql,args=[])=>({bind:(...values)=>prepare(sql,values),run:async()=>raw.prepare(sql).run(...args),
    all:async()=>({results:raw.prepare(sql).all(...args)}),first:async()=>raw.prepare(sql).get(...args)??null});
  return {raw,prepare,batch:async statements=>{
    raw.exec('BEGIN');try {const values=[];for(const statement of statements)values.push(await statement.run());raw.exec('COMMIT');return values;}
    catch(error){raw.exec('ROLLBACK');throw error;}
  }};
}
const write=(db,body,id=runId)=>handleRefreshWrite(new Request('https://isolated.invalid/api/data-refresh',{
  method:'POST',headers:{'X-WenYing-Refresh-Key':secret},body:JSON.stringify({runId:id,...body})}),db,secret);
const read=(db,path)=>handleDailyRead(new Request('https://isolated.invalid'+path),db);
async function ok(response,expectedStatus=200) {
  assert.ok(response,'Native handler must handle the local request');
  const body=await response.json();assert.equal(response.status,expectedStatus,JSON.stringify(body));return body;
}
const sourceStock=stock=>Object.fromEntries(Object.entries(stock).filter(([key])=>!['valuationPolicy','dailyValuationVersion',
  'dailyRunId','comparableMultiples','taiwanBusinessGroup','dailyResearch'].includes(key)));
const key=row=>row.market+':'+row.ticker;
async function sources(root) {
  const rows=[],proofs=[];
  for(const [cohort,pin] of Object.entries(PUBLIC_GENERATION_PROTOCOL.sourcePins)) {
    const directory=join(root,pin.directory),inputBytes=await readFile(join(directory,'inputs.json')),
      manifestBytes=await readFile(join(directory,'captures.json'));
    assert.equal(sha(inputBytes),pin.input,'Original fixed processed input must retain its pinned hash');
    assert.equal(sha(manifestBytes),pin.manifest,'Original fixed raw manifest must retain its pinned hash');
    const input=JSON.parse(inputBytes),evaluation=await evaluatePublicCapture(directory,input);
    assert.equal(evaluation.sourceReplay.status,'PASS');assert.equal(evaluation.sourceReplay.networkFallback,false);
    assert.equal(evaluation.sourceReplay.regeneratedRecords,pin.records);
    assert.equal(evaluation.sourceReplay.rawBodiesHashVerified,pin.bodies);
    for(const row of input.records) {
      assert.equal(row.status,'ready');assert.equal(row.market,'TW');assert.equal(row.quoteDate,date);
      assert.equal(row.financialDate,PUBLIC_GENERATION_PROTOCOL.financialDate);
      assert.equal(row.stock.updatedAt,date);assert.equal(row.stock.financialDataDate,PUBLIC_GENERATION_PROTOCOL.financialDate);
      assert.equal(row.stock.financialMetrics.shareAsOfDate,PUBLIC_GENERATION_PROTOCOL.financialDate);
      assert.equal(row.stock.financialMetrics.shareBasis,'provider-as-of-ordinary');
      rows.push({...row,sourceCohort:cohort});
    }
    proofs.push({cohort,inputSha256:pin.input,captureManifestSha256:pin.manifest,observedAt:input.observedAt,...evaluation.sourceReplay});
  }
  assert.equal(rows.length,17);assert.equal(new Set(rows.map(key)).size,17);
  return {rows,proofs};
}
function nativeRows(rows,id) {
  return rows.map(record=>({input:record.stock,state:dailyValuationState(record.stock,id)}));
}
const filters={all:()=>true,undervalued:s=>s.estimatedUpside>=.1,overvalued:s=>s.estimatedUpside<=-.1,
  quality:s=>s.stock.qualityScore>=75,risk:s=>s.stock.valuationReviewRequired||s.stock.risk==='高'};
const sorts={upside:(a,b)=>b.state.estimatedUpside-a.state.estimatedUpside,
  upside_asc:(a,b)=>a.state.estimatedUpside-b.state.estimatedUpside,
  quality:(a,b)=>b.state.stock.qualityScore-a.state.stock.qualityScore,price:(a,b)=>b.input.price-a.input.price};
function expectedResearch(native,market,filter,sort,query='') {
  return native.filter(({input,state})=>input.market===market&&state.hasModel&&!state.rankingEligible
    &&filters[filter](state)&&[input.ticker,input.name,input.sector,input.industry].join(' ').toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>sorts[sort](a,b)||a.input.ticker.localeCompare(b.input.ticker));
}
async function beginAndBatch(db,original,id,beforeFinalize=()=>{}) {
  const rows=prepareTaiwanRefreshGeneration(structuredClone(original),id),originalById=new Map(original.map(row=>[key(row),row]));
  for(const row of rows)assert.deepEqual(sourceStock(row.stock),sourceStock(originalById.get(key(row)).stock),
    'Prepare must not change original financial/price/share/source values');
  const manifest={valuationVersion:DAILY_VALUATION_VERSION,expectedSessions:{TW:date,US:date},
    targets:rows.map(({ticker,market})=>({ticker,market})),universeSource:[
      'FIXED 17 real public captures: source SHA-pinned and offline raw-replayed',
      'THREE EXPLICIT SYNTHETIC US engineering controls; no real US coverage',
      'Quotes retain 2026-10-01; finance/shares retain 2026-06-30. Not current-market or publication-time evidence.']};
  await ok(await write(db,{action:'begin',manifest},id));
  const batchSizes=[];
  for(let i=0;i<rows.length;i+=8) {
    const batch=rows.slice(i,i+8);assert.ok(Buffer.byteLength(JSON.stringify({runId:id,action:'batch',records:batch}))<1400000);
    const accepted=await ok(await write(db,{action:'batch',records:batch},id));assert.equal(accepted.accepted,batch.length);batchSizes.push(batch.length);
    await beforeFinalize(i);
  }
  assert.deepEqual(batchSizes,PUBLIC_GENERATION_PROTOCOL.batches);return rows;
}
async function mutateAndRejectRead(db,ticker,change,issue,query) {
  const original=db.raw.prepare('SELECT stock FROM daily_refresh_records WHERE run_id=? AND market=? AND ticker=?').get(runId,'TW',ticker).stock;
  try {
    const altered=await change(JSON.parse(original));
    db.raw.prepare('UPDATE daily_refresh_records SET stock=? WHERE run_id=? AND market=? AND ticker=?').run(JSON.stringify(altered),runId,'TW',ticker);
    const page=await ok(await read(db,'/api/market-scan?scope=research&market=TW&limit=1&query='+encodeURIComponent(query)));
    assert.equal(page.researchStatusByMarket.TW,'refresh_required');assert.deepEqual(page.researchCandidates,[]);
    assert.ok(page.researchIssues.TW.includes(issue),JSON.stringify(page.researchIssues));
  } finally {db.raw.prepare('UPDATE daily_refresh_records SET stock=? WHERE run_id=? AND market=? AND ticker=?').run(original,runId,'TW',ticker);}
}

export async function validatePublicGeneration(captureRoot) {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('NETWORK_FORBIDDEN_IN_LOCAL_PUBLIC_GENERATION_VALIDATION');};
  const db=database();
  try {
    const source=await sources(resolve(captureRoot)),controls=publicGenerationSyntheticControls(),original=[...source.rows,...controls];
    assert.equal(original.length,20);assert.ok(controls.every(row=>row.market==='US'&&row.stock.source.includes('SYNTHETIC')));
    const sourceBefore=JSON.stringify(source.rows);
    await beginAndBatch(db,original,oldId);await ok(await write(db,{action:'finalize'},oldId));
    assert.equal(db.raw.prepare('SELECT run_id FROM daily_refresh_head').get().run_id,oldId);
    // A local pre-upgrade head is retained while the next complete generation
    // uploads. Alter only this derived manifest version, never captured inputs.
    const previousManifest=JSON.parse(db.raw.prepare('SELECT manifest FROM daily_refresh_runs WHERE id=?').get(oldId).manifest);
    previousManifest.valuationVersion='explicit-local-preupgrade-version';
    db.raw.prepare('UPDATE daily_refresh_runs SET manifest=?,started_at=? WHERE id=?').run(JSON.stringify(previousManifest),new Date(Date.now()-1000).toISOString(),oldId);
    const nativeGeneration=await beginAndBatch(db,original,runId,async()=>{
      assert.equal(db.raw.prepare('SELECT run_id FROM daily_refresh_head').get().run_id,oldId,'Partial uploads must not replace the old head');
      const pending=await ok(await read(db,'/api/market-scan?scope=research&market=TW'));
      assert.equal(pending.freshness.runId,oldId);assert.equal(pending.researchStatus,'refresh_required');
      assert.deepEqual(pending.researchCandidates,[]);
    });
    const final=await ok(await write(db,{action:'finalize'}));assert.equal(final.state,'complete');
    assert.deepEqual(final.coverage,{total:20,TW:{total:17,ready:17,unavailable:0},US:{total:3,ready:3,unavailable:0}});
    assert.equal(db.raw.prepare('SELECT run_id FROM daily_refresh_head').get().run_id,runId);
    const native=nativeRows(nativeGeneration,runId),stored=db.raw.prepare('SELECT market,ticker,stock,upside FROM daily_refresh_records WHERE run_id=? ORDER BY market,ticker').all(runId);
    const originalById=new Map(original.map(row=>[key(row),row]));
    for(const row of stored) {
      const input=JSON.parse(row.stock),state=dailyValuationState(input,runId);
      assert.deepEqual(sourceStock(input),sourceStock(originalById.get(key(row)).stock));
      assert.equal(input.dailyResearch.runId,runId);assert.equal(input.dailyResearch.quoteDate,date);
      assert.ok(await currentDailyResearchCache(input,runId,date));
      assert.equal(row.upside,state.upside);
      if(row.market==='TW') {
        assert.equal(input.dailyRunId,runId);assert.equal(input.dailyValuationVersion,DAILY_VALUATION_VERSION);
        assert.equal(state.rankingEligible,false);assert.equal(state.upside,null);
        assert.equal(state.stock.valuationConfidence,'low');
      }
    }
    const main=await ok(await read(db,'/api/market-scan'));
    assert.equal(main.freshness.runId,runId);assert.equal(main.researchStatus,'current');
    assert.deepEqual(main.candidates.map(stock=>stock.ticker),['SYNFORMAL']);assert.deepEqual(main.overvaluedCandidates,[]);
    assert.ok(main.researchCandidates.every(stock=>!stock.dailyResearch.rankingEligible));
    assert.ok(main.researchCandidates.every(stock=>![...main.candidates,...main.overvaluedCandidates].some(formal=>key(formal)===key(stock))));
    assert.equal(main.researchTotalCounts.TW,native.filter(({input,state})=>input.market==='TW'&&state.hasModel&&!state.rankingEligible).length);
    const controlsStates=native.filter(row=>row.input.market==='US');
    assert.equal(controlsStates.find(row=>row.input.ticker==='SYNLOW').state.rankingEligible,false);
    assert.equal(controlsStates.find(row=>row.input.ticker==='SYNLOW').state.hasModel,true);
    assert.equal(controlsStates.find(row=>row.input.ticker==='SYNFORMAL').state.rankingEligible,true);
    assert.equal(controlsStates.find(row=>row.input.ticker==='SYNNONE').state.hasModel,false);
    let pageChecks=0;
    for(const market of ['TW','US'])for(const filter of PUBLIC_GENERATION_PROTOCOL.filters)for(const sort of PUBLIC_GENERATION_PROTOCOL.sorts) {
      const expected=expectedResearch(native,market,filter,sort),all=expectedResearch(native,market,'all','upside');
      const seen=[];
      for(let offset=0;offset<=expected.length;offset++) {
        const data=await ok(await read(db,`/api/market-scan?scope=research&market=${market}&filter=${filter}&sort=${sort}&offset=${offset}&limit=1&runId=${runId}`));
        assert.equal(data.freshness.runId,runId);assert.equal(data.researchStatus,'current');
        assert.equal(data.researchCounts[market],expected.length);assert.equal(data.researchTotalCounts[market],all.length);
        assert.deepEqual(data.researchCandidates.map(stock=>stock.ticker),expected.slice(offset,offset+1).map(row=>row.input.ticker));
        seen.push(...data.researchCandidates.map(stock=>stock.ticker));pageChecks++;
      }
      assert.deepEqual(seen,expected.map(row=>row.input.ticker));
    }
    const queryChecks=[];
    for(const query of ['3135','凌航','記憶體','SYNLOW','no-such-fixed-issuer']) {
      const market=query==='SYNLOW'?'US':'TW',expected=expectedResearch(native,market,'all','upside',query);
      const data=await ok(await read(db,`/api/market-scan?scope=research&market=${market}&query=${encodeURIComponent(query)}&limit=1`));
      assert.equal(data.researchCounts[market],expected.length);
      assert.deepEqual(data.researchCandidates.map(stock=>stock.ticker),expected.slice(0,1).map(row=>row.input.ticker));queryChecks.push({query,matches:expected.length});
    }
    const changed=await ok(await read(db,'/api/market-scan?scope=research&market=TW&runId='+oldId),409);
    assert.equal(changed.error,'DATA_GENERATION_CHANGED');
    await ok(await write(db,{action:'finalize'},oldId));assert.equal(db.raw.prepare('SELECT run_id FROM daily_refresh_head').get().run_id,runId);
    const lowRows=native.filter(({input,state})=>input.market==='TW'&&state.hasModel),noneRows=native.filter(({input,state})=>input.market==='TW'&&!state.hasModel);
    assert.ok(lowRows.length>0&&noneRows.length>0,'Fixed real cohort must cover low-model and abstaining cases');
    for(const {input,state} of native.filter(row=>row.input.market==='TW')) {
      const response=await handleDailyRead(new Request('https://isolated.invalid/api/valuation',{method:'POST',body:JSON.stringify({ticker:input.ticker,market:'TW'})}),db);
      const body=await ok(response,state.hasModel?200:422);
      assert.equal(body.freshness.runId,runId);
      if(state.hasModel){assert.equal(body.researchOnly,true);assert.equal(body.rankingEligible,false);assert.equal(body.upside,null);assert.equal(body.estimatedUpside,state.estimatedUpside);}
      const history=await ok(await read(db,`/api/price-history?market=TW&ticker=${input.ticker}`));
      assert.equal(history.valuationAvailable,state.hasModel);assert.equal(history.valuationRankingEligible,false);
      assert.equal(history.technicalAnalysis.valueTrendResonance,null);
    }
    const visible=lowRows[0].input.ticker,offpage=noneRows[0].input.ticker;
    await mutateAndRejectRead(db,offpage,input=>({...input,price:input.price+1}),'RESEARCH_COHORT_INTEGRITY_MISMATCH',visible);
    await mutateAndRejectRead(db,visible,input=>({...input,dailyResearch:{...input.dailyResearch,estimatedUpside:999}}),'RESEARCH_COHORT_INTEGRITY_MISMATCH','no-such-fixed-issuer');
    await mutateAndRejectRead(db,offpage,async input=>{
      const replacement=await withDailyResearchCache({...input,price:input.price+1},runId);
      assert.ok(await currentDailyResearchCache(replacement,runId,date));return replacement;
    },'RESEARCH_COHORT_INTEGRITY_MISMATCH',visible);
    const forgedId='public_real_forged_pending';await beginAndBatch(db,original,forgedId);
    const forged=db.raw.prepare('SELECT stock FROM daily_refresh_records WHERE run_id=? AND market=? AND ticker=?').get(forgedId,'TW',visible);
    const forgedInput=JSON.parse(forged.stock);forgedInput.comparableMultiples.peerGroup='EXPLICIT FORGED LOCAL PEER GROUP';
    db.raw.prepare('UPDATE daily_refresh_records SET stock=? WHERE run_id=? AND market=? AND ticker=?').run(JSON.stringify(forgedInput),forgedId,'TW',visible);
    const rejected=await ok(await write(db,{action:'finalize'},forgedId),400);assert.equal(rejected.error,'GENERATION_PEER_EVIDENCE_MISMATCH');
    assert.equal(db.raw.prepare('SELECT run_id FROM daily_refresh_head').get().run_id,runId);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM daily_refresh_research_seals WHERE run_id=?').get(forgedId).n,0);
    assert.equal((await ok(await read(db,'/api/market-scan?scope=research&market=TW'))).researchStatus,'current');
    assert.equal(JSON.stringify(source.rows),sourceBefore,'Frozen real rows must remain unchanged');
    const sourceCohortByTicker=new Map(source.rows.map(row=>[row.ticker,row.sourceCohort]));
    const rows=native.filter(row=>row.input.market==='TW').map(({input,state})=>({ticker:input.ticker,name:input.name,
      sourceCohort:sourceCohortByTicker.get(input.ticker),listingBoard:input.listingBoard,
      quoteDate:input.updatedAt,financialDate:input.financialDataDate,price:input.price,eps:input.eps,bvps:input.bvps,sps:input.revenuePerShare,
      shareBasis:input.financialMetrics.shareBasis,sharesOutstanding:input.financialMetrics.sharesOutstanding,
      shareAsOfDate:input.financialMetrics.shareAsOfDate,models:state.stock.models.map(model=>({id:model.id,value:model.value})),
      nativeFairValue:state.hasModel?state.stock.fairValue:null,estimatedFairValue:state.estimatedFairValue,
      estimatedUpside:state.estimatedUpside,valuationConfidence:state.stock.valuationConfidence,
      calibrationConfidence:state.stock.calibrationConfidence,rankingEligible:state.rankingEligible,formalUpside:state.upside,issues:state.issues,
      matchedPeerCounts:Object.fromEntries(Object.entries(input.comparableMultiples.taiwanApplicabilityEvidence.models).map(([id,evidence])=>[id,evidence.observations.length]))}));
    const codeFiles=['lib/daily-refresh-generation.ts','lib/daily-refresh-store.ts','lib/daily-research-ranking.ts','lib/taiwan-comparables.ts',
      'lib/taiwan-multiple-applicability.ts','lib/valuation.ts','lib/daily-valuation-state.ts','scripts/validate-taiwan-public-generation.mjs'];
    const codeHashes=Object.fromEntries(await Promise.all(codeFiles.map(async file=>[file,sha(await readFile(new URL('../'+file,import.meta.url)))])));
    return {protocol:PUBLIC_GENERATION_PROTOCOL,status:'PASS',sourceReplay:source.proofs,networkForbidden:true,
      database:'isolated node:sqlite :memory:',runtimeBindingsUsed:false,codeHashes,
      actualQuoteDate:date,actualFinancialDate:PUBLIC_GENERATION_PROTOCOL.financialDate,
      localGeneration:{current:runId,previous:oldId,headReplacement:'PASS',oldRunIdRead:'409 DATA_GENERATION_CHANGED',coverage:final.coverage,
        seals:db.raw.prepare('SELECT run_id,market,version,ready_count,digest FROM daily_refresh_research_seals WHERE run_id=? ORDER BY market').all(runId)},
      trueSummary:{ready:17,calculable:rows.filter(row=>row.models.length>0).length,lowConfidence:rows.filter(row=>row.valuationConfidence==='low').length,
        rankingEligible:rows.filter(row=>row.rankingEligible).length},trueRows:rows,
      syntheticControls:controlsStates.map(({input,state})=>({ticker:input.ticker,source:input.source,hasModel:state.hasModel,rankingEligible:state.rankingEligible})),
      research:{counts:main.researchTotalCounts,pageChecks,queryChecks,sortingFilteringPaging:'PASS',sameGeneration:'PASS'},
      rejectionChecks:[{id:'offpage-excluded-source-change',status:'PASS'},{id:'offpage-cache-change',status:'PASS'},
        {id:'self-consistent-unsealed-replacement-cache',status:'PASS'},{id:'forged-peer-finalize-no-head-or-seal',status:'PASS'}],
      limitations:['17 real TW observations form a fixed bounded public capture, not market capacity or full market coverage.',
        'Three US controls are synthetic; neither their prices nor their fundamentals represent US issuer evidence.',
        'Current means the sealed isolated local generation. Original 2026-10-01 quote and 2026-06-30 finance/share dates are not relabelled.',
        'Current retrieval is not point-in-time publication evidence; true historical date holdout is NOT_RUN.',
        'Provider-as-of shares are not independently verified effective shares; official parent-equity/NCI and treasury/pending shares remain incomplete.',
        'Low-confidence native research outputs and coverage changes do not establish valuation accuracy.']};
  } finally {db.raw.close();globalThis.fetch=originalFetch;}
}
async function main(args) {
  const options={};
  for(let i=0;i<args.length;i+=2) {
    if(!['--capture-root','--out'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Usage: --capture-root FIXED_PARENT_DIRECTORY --out NEW_REPORT.json');
    options[args[i]]=args[i+1];
  }
  if(!options['--capture-root']||!options['--out'])throw new Error('CAPTURE_ROOT_AND_NEW_REPORT_REQUIRED');
  const report=await validatePublicGeneration(options['--capture-root']),out=resolve(options['--out']),bytes=JSON.stringify(report,null,2)+'\n';
  await mkdir(dirname(out),{recursive:true});await writeFile(out,bytes,{flag:'wx'});
  process.stdout.write(JSON.stringify({outputPath:out,sha256:sha(bytes),status:report.status,trueSummary:report.trueSummary,
    research:report.research,syntheticControls:report.syntheticControls})+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
