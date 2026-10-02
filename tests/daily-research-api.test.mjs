import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {DAILY_VALUATION_VERSION,dailyValuationState} from '../lib/daily-valuation-state.ts';
import {DAILY_RESEARCH_CACHE_VERSION,withDailyResearchCache,currentDailyResearch,dailyResearchStockDigest,dailyResearchCohortDigest} from '../lib/daily-research-ranking.ts';
import {prepareTaiwanRefreshGeneration} from '../lib/daily-refresh-generation.ts';
import {REFRESH_SCHEMA,handleDailyRead,handleRefreshWrite,researchCohortIntegrity,verifyTaiwanGenerationPeers,
  RESEARCH_INTEGRITY_PAGE_BYTES,RESEARCH_INTEGRITY_PAGE_ROWS,RESEARCH_INTEGRITY_HASH_CONCURRENCY} from '../lib/daily-refresh-store.ts';
import {analyzeTechnicalSetup} from '../lib/technical-analysis.ts';

// Full synthetic cohorts exercise ordering and provenance, not price accuracy.
const date='2026-10-01',runId='research_cohort_fixture',secret='synthetic-only-000000000000000000000';
const base={name:'Synthetic issuer',sector:'Industrials',industry:'Synthetic devices',price:100,eps:10,bvps:40,
  fcfPerShare:9,revenueGrowth:20,roe:25,debtRatio:30,targetPe:15,targetPb:2,targetFcfMultiple:15,
  uncertainty:.3,dataBasis:'ltm',dataCompleteness:'complete',financialDataDate:'2026-06-30',updatedAt:date,
  priceSource:'Yahoo Finance daily close / daily-refresh-v1',source:'自動資料'};
function record(stock) {
  const candles=Array.from({length:80},(_,i)=>({date:new Date(Date.parse(date)-(79-i)*86400000).toISOString().slice(0,10),
    open:stock.price,high:stock.price+1,low:stock.price-1,close:stock.price,volume:1000000}));
  return {ticker:stock.ticker,market:stock.market,status:'ready',stock,issues:[],rankingEligible:true,quoteDate:date,
    financialDate:stock.financialDataDate,fetchedAt:new Date().toISOString(),sources:['https://example.test/synthetic'],
    history:{ticker:stock.ticker,market:stock.market,name:stock.name,quoteSource:stock.priceSource,candles,
      weeklyCandles:[],monthlyCandles:[],technicalAnalysis:analyzeTechnicalSetup(candles,null)}};
}
function records(id=runId) {
  const tw=Array.from({length:25},(_,i)=>record({...base,market:'TW',ticker:i===24?'9999':String(1000+i),price:i===24?60:100,
    revenueGrowth:10,revenuePerShare:100,ebitPerShare:12,
    financialMetrics:{currency:'TWD',periodBasis:'ltm',sharesOutstanding:100000000,shareBasis:'provider-as-of-ordinary',
      shareAsOfDate:'2026-06-30',shareSourceField:'quarterlyOrdinarySharesNumber',roeBasis:'parent-income-average-equity',
      netIncomePerShare:10,nonControllingBookPerShare:0}}));
  const us=Array.from({length:25},(_,i)=>record({...base,market:'US',ticker:i===24?'ZZZ':`U${String(i).padStart(2,'0')}`,price:i===24?20:100}));
  us[21]=record({...us[21].stock,debtRatio:95});
  us[22]=record({...us[22].stock,roe:50,debtRatio:10,revenueGrowth:30,fcfPerShare:15});
  us[23]=record({...us[23].stock,price:500});
  us.push(record({...base,market:'US',ticker:'CONTROL',revenueGrowth:3,roe:15}));
  us.push(record({...base,market:'US',ticker:'VISN',price:10}));
  us.push(record({...base,market:'US',ticker:'EMPTY',name:'Synthetic REIT',sector:'Real Estate',industry:'REIT',eps:0,bvps:0,fcfPerShare:0}));
  tw.push(record({...tw[0].stock,ticker:'8888',industry:''}));
  return prepareTaiwanRefreshGeneration([...tw,...us],id);
}
function database() {
  const raw=new DatabaseSync(':memory:');
  const prepare=(sql,args=[])=>({bind:(...a)=>prepare(sql,a),run:async()=>raw.prepare(sql).run(...args),
    all:async()=>({results:raw.prepare(sql).all(...args)}),first:async()=>raw.prepare(sql).get(...args)??null});
  return {raw,prepare,batch:async statements=>{raw.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());raw.exec('COMMIT');return out;}catch(e){raw.exec('ROLLBACK');throw e;}}};
}
const write=(db,body,id=runId)=>handleRefreshWrite(new Request('https://fixture/api/data-refresh',{method:'POST',
  headers:{'X-WenYing-Refresh-Key':secret},body:JSON.stringify({runId:id,...body})}),db,secret);
const read=(db,query='')=>handleDailyRead(new Request('https://fixture/api/market-scan'+query),db);
async function published(id=runId) {
  const db=database(),rows=records(id),manifest={valuationVersion:DAILY_VALUATION_VERSION,
    expectedSessions:{TW:date,US:date},targets:rows.map(({ticker,market})=>({ticker,market})),universeSource:['synthetic full cohort']};
  assert.equal((await write(db,{action:'begin',manifest},id)).status,200);
  // Collector cache assertions are overwritten by independently computed state.
  rows[0].stock.dailyResearch={estimatedUpside:999,rankingEligible:true};
  for(let i=0;i<rows.length;i+=20)assert.equal((await write(db,{action:'batch',records:rows.slice(i,i+20)},id)).status,200);
  const sealed=await write(db,{action:'finalize'},id);assert.equal(sealed.status,200,JSON.stringify(await sealed.json()));
  return {db,rows};
}
function updateInput(db,ticker,change,market='TW') {
  const input=JSON.parse(db.raw.prepare('SELECT stock FROM daily_refresh_records WHERE run_id=? AND market=? AND ticker=?').get(runId,market,ticker).stock);
  change(input);db.raw.prepare('UPDATE daily_refresh_records SET stock=? WHERE run_id=? AND market=? AND ticker=?').run(JSON.stringify(input),runId,market,ticker);
}

test('same-generation full-cohort native research sort retains both markets and highest late symbols',async()=>{
  const {db,rows}=await published();
  try {
    const data=await (await read(db)).json();
    assert.equal(data.researchStatus,'current');assert.equal(data.researchCacheVersion,DAILY_RESEARCH_CACHE_VERSION);
    assert.deepEqual(data.researchCounts,{TW:25,US:25});
    for(const market of ['TW','US']) {
      const actual=data.researchCandidates.filter(stock=>stock.market===market);
      const expected=rows.filter(row=>row.market===market).map(row=>row.stock)
        .filter(stock=>{const state=dailyValuationState(stock,runId);return state.hasModel&&!state.rankingEligible;})
        .sort((a,b)=>dailyValuationState(b,runId).estimatedUpside-dailyValuationState(a,runId).estimatedUpside||a.ticker.localeCompare(b.ticker));
      assert.equal(actual.length,20);assert.deepEqual(actual.map(stock=>stock.ticker),expected.slice(0,20).map(stock=>stock.ticker));
      assert.equal(actual[0].ticker,market==='TW'?'9999':'ZZZ');
      for(const input of actual) {
        const state=dailyValuationState(input,runId),stored=db.raw.prepare('SELECT upside FROM daily_refresh_records WHERE run_id=? AND market=? AND ticker=?').get(runId,market,input.ticker);
        assert.equal(state.stock.valuationConfidence,'low');assert.equal(state.rankingEligible,false);assert.equal(state.upside,null);
        assert.equal(stored.upside,null);assert.equal(input.dailyResearch.estimatedUpside,state.stock.upside);
        assert.ok(await currentDailyResearch(input,runId,date));
      }
    }
    assert.deepEqual(data.candidates.map(input=>input.ticker),['CONTROL']);
    assert.ok(![...data.candidates,...data.overvaluedCandidates].some(input=>data.researchCandidates.some(research=>research.ticker===input.ticker)));
    assert.ok(!data.researchCandidates.some(input=>['VISN','EMPTY','8888'].includes(input.ticker)));
    const page=await (await read(db,`?scope=research&market=TW&offset=20&limit=20&runId=${runId}`)).json();
    assert.equal(page.researchCandidates.length,5);assert.ok(page.researchCandidates.every(input=>input.market==='TW'));
    assert.equal(new Set([...data.researchCandidates.filter(input=>input.market==='TW'),...page.researchCandidates].map(input=>input.ticker)).size,25);
    assert.equal(page.candidates,undefined);
    for(const query of ['?scope=wrong','?market=OTHER','?limit=0','?limit=101','?offset=-1','?offset=1.5','?sort=bad','?filter=bad',`?query=${'a'.repeat(81)}`])assert.equal((await read(db,query)).status,400);
    const changed=await read(db,'?scope=research&market=TW&runId=previous_generation');
    assert.equal(changed.status,409);assert.equal((await changed.json()).error,'DATA_GENERATION_CHANGED');
  }finally {db.raw.close();}
});

test('every research sort, filter and literal search is applied to the full cohort before paging',async()=>{
  const {db,rows}=await published();
  const filters={all:()=>true,undervalued:state=>state.estimatedUpside>=.1,overvalued:state=>state.estimatedUpside<=-.1,
    quality:state=>state.stock.qualityScore>=75,risk:state=>state.stock.valuationReviewRequired||state.stock.risk==='高'};
  const sorts={upside:(a,b)=>b.state.estimatedUpside-a.state.estimatedUpside,
    upside_asc:(a,b)=>a.state.estimatedUpside-b.state.estimatedUpside,
    quality:(a,b)=>b.state.stock.qualityScore-a.state.stock.qualityScore,price:(a,b)=>b.input.price-a.input.price};
  try {
    for(const market of ['TW','US'])for(const filter of Object.keys(filters))for(const sort of Object.keys(sorts)) {
      const all=rows.filter(row=>row.market===market).map(row=>({input:row.stock,state:dailyValuationState(row.stock,runId)}))
        .filter(({state})=>state.hasModel&&!state.rankingEligible);
      const expected=all.filter(({state})=>filters[filter](state)).sort((a,b)=>sorts[sort](a,b)||a.input.ticker.localeCompare(b.input.ticker));
      const data=await (await read(db,`?scope=research&market=${market}&filter=${filter}&sort=${sort}&offset=1&limit=3`)).json();
      assert.equal(data.researchStatus,'current');assert.equal(data.researchCounts[market],expected.length);
      assert.equal(data.researchTotalCounts[market],all.length);
      assert.deepEqual(data.researchCandidates.map(input=>input.ticker),expected.slice(1,4).map(({input})=>input.ticker));
    }
    const negative=await (await read(db,'?scope=research&market=US&filter=overvalued&sort=upside_asc')).json();
    assert.ok(negative.researchCandidates.some(input=>input.ticker==='U23'));
    const highestPrice=await (await read(db,'?scope=research&market=US&sort=price&limit=1')).json();
    assert.equal(highestPrice.researchCandidates[0].ticker,'U23');
    const highestQuality=await (await read(db,'?scope=research&market=US&sort=quality&limit=1')).json();
    assert.equal(highestQuality.researchCandidates[0].ticker,'U22');
    for(const query of ['u23','U23','synthetic devices','industrials','synthetic issuer','%']) {
      const expected=rows.filter(row=>row.market==='US').filter(({stock})=>{const state=dailyValuationState(stock,runId);
        return state.hasModel&&!state.rankingEligible&&[stock.ticker,stock.name,stock.sector,stock.industry].join(' ').toLowerCase().includes(query.toLowerCase());});
      const data=await (await read(db,`?scope=research&market=US&query=${encodeURIComponent(query)}`)).json();
      assert.equal(data.researchCounts.US,expected.length);assert.equal(data.researchStatusByMarket.US,'current');
      if(query.toLowerCase()==='u23')assert.deepEqual(data.researchCandidates.map(input=>input.ticker),['U23']);
      if(query==='%')assert.deepEqual(data.researchCandidates,[]);
    }
  }finally {db.raw.close();}
});

test('missing, legacy, wrong-run and wrong-date cache invalidate the entire market rather than returning a partial ranking',async()=>{
  for(const change of [input=>delete input.dailyResearch,input=>input.dailyResearch.version='old-cache',
    input=>input.dailyResearch.runId='different-run',input=>input.dailyResearch.valuationVersion='old-model',
    input=>input.dailyResearch.usReviewVersion='old-review',
    input=>input.dailyResearch.quoteDate='2026-09-18',input=>input.dailyRunId='different-run',input=>input.dailyValuationVersion='old-model']) {
    const {db}=await published();
    try {
      // This symbol is outside the first page: coverage must precede LIMIT.
      updateInput(db,'1023',change);
      const data=await (await read(db)).json();assert.equal(data.researchStatus,'refresh_required');
      assert.equal(data.researchStatusByMarket.TW,'refresh_required');assert.equal(data.researchCounts.TW,0);
      assert.deepEqual(data.researchCandidates.filter(input=>input.market==='TW'),[]);
      assert.equal(data.researchStatusByMarket.US,'current');assert.equal(data.researchCounts.US,25);
      assert.equal(data.researchCandidates.filter(input=>input.market==='US').length,20);
    }finally {db.raw.close();}
  }
});

test('changed native or calibration inputs and cached state fail closed without skipping into replacement stocks',async()=>{
  for(const change of [input=>input.eps*=2,input=>input.targetPe*=2,input=>input.dailyResearch.estimatedUpside+=.01,
    input=>input.dailyResearch.inputDigest='false-digest',input=>input.dailyResearch.valuationConfidence='high',
    input=>input.dailyResearch.estimatedCalibratedUpside+=.01]) {
    const {db}=await published();
    try {
      updateInput(db,'9999',change);
      const data=await (await read(db,'?scope=research&market=TW')).json();
      assert.equal(data.researchStatusByMarket.TW,'refresh_required');assert.equal(data.researchCounts.TW,0);
      assert.deepEqual(data.researchCandidates,[]);assert.deepEqual(data.researchIssues.TW,['RESEARCH_COHORT_INTEGRITY_MISMATCH']);
    }finally {db.raw.close();}
  }
});

test('page-off suppression or filter/state/source changes invalidate the whole independent sealed cohort',async()=>{
  for(const change of [input=>input.dailyResearch.estimatedUpside=-.99,input=>input.dailyResearch.hasModel=false,
    input=>input.dailyResearch.rankingEligible=true,input=>input.dailyResearch.qualityScore=1,
    input=>input.dailyResearch.risk=input.dailyResearch.risk==='低'?'高':'低',input=>input.dailyResearch.reviewRequired=!input.dailyResearch.reviewRequired,
    input=>input.price=1000,input=>input.eps=1]) {
    const {db}=await published();
    try {
      updateInput(db,'9999',change);
      for(const query of ['?scope=research&market=TW','?scope=research&market=TW&offset=20',
        '?scope=research&market=TW&filter=overvalued','?scope=research&market=TW&query=1000']) {
        const data=await (await read(db,query)).json();assert.equal(data.researchStatusByMarket.TW,'refresh_required');
        assert.equal(data.researchCounts.TW,0);assert.equal(data.researchTotalCounts.TW,0);
        assert.deepEqual(data.researchCandidates,[]);
        assert.deepEqual(data.researchIssues.TW,['RESEARCH_COHORT_INTEGRITY_MISMATCH']);
      }
    }finally {db.raw.close();}
  }
});

test('missing independent seal table or row fails only research and never revives a previous generation',async()=>{
  for(const remove of [db=>db.raw.exec('DROP TABLE daily_refresh_research_seals'),
    db=>db.raw.prepare('DELETE FROM daily_refresh_research_seals WHERE run_id=?').run(runId)]) {
    const {db}=await published();
    try {
      remove(db);const response=await read(db);assert.equal(response.status,200);const data=await response.json();
      assert.deepEqual(data.candidates.map(input=>input.ticker),['CONTROL']);
      assert.deepEqual(data.researchCandidates,[]);assert.deepEqual(data.researchCounts,{TW:0,US:0});
      assert.equal(data.researchStatus,'refresh_required');assert.deepEqual(data.researchIssues.TW,['RESEARCH_SEAL_REQUIRED']);
      assert.deepEqual(data.researchIssues.US,['RESEARCH_SEAL_REQUIRED']);
    }finally {db.raw.close();}
  }
});

test('sealed cache assertions must match recomputed state before finalize and published seals cannot be replaced',async()=>{
  const {db}=await published();
  try {
    const sealed=db.raw.prepare('SELECT * FROM daily_refresh_research_seals ORDER BY market').all();
    assert.equal(sealed.length,2);
    updateInput(db,'9999',input=>input.dailyResearch.estimatedUpside=-.99);
    // A reused completed run cannot re-seal a changed JSON cache.
    assert.equal((await write(db,{action:'finalize'})).status,200);
    assert.deepEqual(db.raw.prepare('SELECT * FROM daily_refresh_research_seals ORDER BY market').all(),sealed);
    assert.equal((await (await read(db)).json()).researchStatusByMarket.TW,'refresh_required');
  }finally {db.raw.close();}
  const unsealed=database(),rows=records(),manifest={valuationVersion:DAILY_VALUATION_VERSION,expectedSessions:{TW:date,US:date},
    targets:rows.map(({ticker,market})=>({ticker,market})),universeSource:['synthetic cohort']};
  try {
    assert.equal((await write(unsealed,{action:'begin',manifest})).status,200);
    for(let i=0;i<rows.length;i+=20)assert.equal((await write(unsealed,{action:'batch',records:rows.slice(i,i+20)})).status,200);
    updateInput(unsealed,'9999',input=>input.dailyResearch.estimatedUpside=-.99);
    const failed=await write(unsealed,{action:'finalize'});assert.equal(failed.status,400);
    assert.equal((await failed.json()).error,'RESEARCH_CACHE_STATE_MISMATCH');
    assert.equal(unsealed.raw.prepare('SELECT COUNT(*) n FROM daily_refresh_head').get().n,0);
    assert.equal(unsealed.raw.prepare('SELECT COUNT(*) n FROM daily_refresh_research_seals').get().n,0);
  }finally {unsealed.raw.close();}
});

test('a self-consistent replacement cache and its source digest cannot authenticate itself against the independent seal',async()=>{
  const {db}=await published();
  try {
    const input=JSON.parse(db.raw.prepare('SELECT stock FROM daily_refresh_records WHERE run_id=? AND market=? AND ticker=?').get(runId,'TW','9999').stock);
    const replacement=await withDailyResearchCache({...input,price:1000},runId);
    assert.ok(await currentDailyResearch(replacement,runId,date));
    db.raw.prepare('UPDATE daily_refresh_records SET stock=? WHERE run_id=? AND market=? AND ticker=?').run(JSON.stringify(replacement),runId,'TW','9999');
    const data=await (await read(db,'?scope=research&market=TW&query=1000')).json();
    assert.equal(data.researchStatusByMarket.TW,'refresh_required');assert.deepEqual(data.researchCandidates,[]);
    assert.deepEqual(data.researchIssues.TW,['RESEARCH_COHORT_INTEGRITY_MISMATCH']);
  }finally {db.raw.close();}
});

test('research digest survives key ordering but binds held-out dates and every source input',async()=>{
  for(const quoteDate of ['2026-09-18','2026-10-01']) {
    const input={...base,market:'US',ticker:'HOLDOUT',updatedAt:quoteDate},cached=await withDailyResearchCache(input,'heldout-run');
    assert.ok(await currentDailyResearch(cached,'heldout-run',quoteDate));
    const reordered=Object.fromEntries(Object.entries(cached).reverse());
    assert.ok(await currentDailyResearch(reordered,'heldout-run',quoteDate));
    assert.equal(await currentDailyResearch({...cached,cashPerShare:5},'heldout-run',quoteDate),false);
    assert.equal(await currentDailyResearch(cached,'another-run',quoteDate),false);
    assert.equal(await currentDailyResearch(cached,'heldout-run','2026-10-02'),false);
  }
});

test('dense 184-peer evidence uses byte-bounded complete pages and one canonical hash at a time',async t=>{
  const db=database();for(const sql of REFRESH_SCHEMA)db.raw.exec(sql);
  const source=records().find(row=>row.market==='TW').stock;
  // Build genuine evidence shapes with 184 observations per applicable model.
  const dense=prepareTaiwanRefreshGeneration(Array.from({length:185},(_,i)=>record({...source,ticker:String(7000+i),
    price:100,comparableMultiples:undefined,dailyResearch:undefined})),runId);
  assert.equal(dense[0].stock.comparableMultiples.peerCount,184);
  const insert=db.raw.prepare('INSERT INTO daily_refresh_records(run_id,market,ticker,status,stock,issues) VALUES(?,?,?,?,?,?)');
  const members=[];let largestRow=0;
  for(const row of dense) {
    const stock=await withDailyResearchCache(row.stock,runId),json=JSON.stringify(stock);
    largestRow=Math.max(largestRow,Buffer.byteLength(json));insert.run(runId,'TW',stock.ticker,'ready',json,'[]');
    members.push([stock.ticker,await dailyResearchStockDigest(stock)]);
  }
  assert.ok(largestRow>140000,'Fixture must exercise dense native applicability evidence, not padded source prose.');
  const expected=await dailyResearchCohortDigest(runId,'TW',date,members),pages=[];
  const originalPrepare=db.prepare;
  db.prepare=(sql,args=[])=>{
    const statement=originalPrepare(sql,args);
    if(!sql.includes('research_integrity_candidates'))return statement;
    return {bind:(...values)=>db.prepare(sql,values),all:async()=>{
      const result=await statement.all(),rows=result.results??[];
      pages.push({rows:rows.length,bytes:rows.reduce((sum,row)=>sum+row.stock_bytes,0),peerSources:sql.includes('json_remove')});return result;
    }};
  };
  // Both finalize passes must use the same real byte boundary. No full derived
  // map or legacy 500-full-JSON request is needed to reproduce every target.
  assert.equal(await verifyTaiwanGenerationPeers(db,runId),185);
  assert.equal(pages.filter(page=>page.peerSources).length,1);
  assert.equal(pages.filter(page=>!page.peerSources).length,15);
  assert.equal(pages.find(page=>page.peerSources).rows,185);
  assert.ok(pages.find(page=>page.peerSources).bytes<300000);
  assert.ok(pages.every(page=>page.rows<=RESEARCH_INTEGRITY_PAGE_ROWS&&page.bytes<=RESEARCH_INTEGRITY_PAGE_BYTES));
  pages.length=0;
  const originalDigest=crypto.subtle.digest.bind(crypto.subtle);
  let active=0,maxActive=0,peakHeap=process.memoryUsage().heapUsed;
  const initialHeap=peakHeap,start=performance.now();
  crypto.subtle.digest=async (...args)=>{
    active++;maxActive=Math.max(maxActive,active);peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed);
    try{return await originalDigest(...args);}finally {active--;}
  };
  try {
    const actual=await researchCohortIntegrity(db,runId,'TW',date);
    assert.equal(actual.ready_count,185);assert.equal(actual.digest,expected);
    assert.ok(pages.length>1);assert.ok(pages.every(page=>page.rows<=RESEARCH_INTEGRITY_PAGE_ROWS&&page.bytes<=RESEARCH_INTEGRITY_PAGE_BYTES));
    assert.equal(maxActive,RESEARCH_INTEGRITY_HASH_CONCURRENCY);assert.equal(maxActive,1);
    t.diagnostic(JSON.stringify({denseRows:185,largestStockBytes:largestRow,integrityPages:pages.length,
      maxPageBytes:Math.max(...pages.map(page=>page.bytes)),maxCanonicalHashConcurrency:maxActive,
      localIntegrityMs:Math.round(performance.now()-start),sampledHeapDeltaMiB:+((peakHeap-initialHeap)/1048576).toFixed(2)}));
  }finally {crypto.subtle.digest=originalDigest;db.raw.close();}
});

test('byte boundary still advances on one oversized first record and never truncates later records',async()=>{
  const db=database();for(const sql of REFRESH_SCHEMA)db.raw.exec(sql);
  const insert=db.raw.prepare('INSERT INTO daily_refresh_records(run_id,market,ticker,status,stock,issues) VALUES(?,?,?,?,?,?)'),members=[];
  // Deliberately exceeds the real D1 single-row limit; local-only cursor guard.
  for(const [ticker,note] of [['A','x'.repeat(RESEARCH_INTEGRITY_PAGE_BYTES+1)],['B','small']]) {
    const input={...base,market:'US',ticker,sourceNote:note};insert.run(runId,'US',ticker,'ready',JSON.stringify(input),'[]');
    members.push([ticker,await dailyResearchStockDigest(input)]);
  }
  try {
    const actual=await researchCohortIntegrity(db,runId,'US',date);
    assert.equal(actual.ready_count,2);assert.equal(actual.digest,await dailyResearchCohortDigest(runId,'US',date,members));
  }finally {db.raw.close();}
});

test('research query resource failures fail closed while previously validated formal rows remain available',async()=>{
  for(const phase of ['coverage','integrity']) {
    const {db}=await published(),originalPrepare=db.prepare;
    db.prepare=(sql,args=[])=>{
      if(phase==='coverage'?sql.includes('AS filtered'):sql.includes('research_integrity_candidates'))throw new Error('Synthetic D1 query budget exhausted');
      return originalPrepare(sql,args);
    };
    try {
      const response=await read(db);assert.equal(response.status,200);const data=await response.json();
      assert.deepEqual(data.candidates.map(input=>input.ticker),['CONTROL']);assert.equal(data.researchStatus,'refresh_required');
      assert.deepEqual(data.researchCandidates,[]);assert.deepEqual(data.researchCounts,{TW:0,US:0});
      assert.deepEqual(data.researchIssues.TW,['RESEARCH_INTEGRITY_UNAVAILABLE']);assert.deepEqual(data.researchIssues.US,['RESEARCH_INTEGRITY_UNAVAILABLE']);
    }finally {db.raw.close();}
  }
});
