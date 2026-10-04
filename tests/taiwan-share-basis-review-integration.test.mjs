import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {REFRESH_SCHEMA,handleDailyRead,handleRefreshWrite} from '../lib/daily-refresh-store.ts';
import {prepareTaiwanRefreshGeneration} from '../lib/daily-refresh-generation.ts';
import {dailyValuationState,valuationRankingState,DAILY_VALUATION_VERSION} from '../lib/daily-valuation-state.ts';
import {currentClientInput,persistableInputs,mergeCurrentInputs} from '../lib/daily-client-state.ts';
import {calculateStock} from '../lib/valuation.ts';
import {readValuationQueryCache,saveValuationQueryCache} from '../lib/valuation-cache.ts';
import {screenFeature} from '../lib/rotation-screen.ts';
import {rotationAudit} from '../lib/rotation-audit-store.ts';
import {analyzeTechnicalSetup} from '../lib/technical-analysis.ts';
import {DAILY_RESEARCH_CACHE_VERSION,DAILY_RESEARCH_SEAL_VERSION,currentDailyResearch,currentDailyResearchCache} from '../lib/daily-research-ranking.ts';
import {TAIWAN_SHARE_BASIS_REVIEW_VERSION,TAIWAN_SHARE_BASIS_REVIEW_ISSUE,getTaiwanShareBasisReview} from '../lib/taiwan-share-basis-review.ts';

const date=new Date().toISOString().slice(0,10),financialDate='2026-06-30',runId='tw_share_review_fixture';
const secret='synthetic-only-tw-share-review-000000000000000000';
// Synthetic positive-EPS inputs exercise an independent source-review gate.
// They are not 6949 statements, actual market bars, or proof it passed 4F.
const template={market:'TW',name:'Synthetic issuer',sector:'Technology',industry:'Synthetic devices',price:100,
  eps:10,bvps:40,fcfPerShare:9,revenuePerShare:100,ebitPerShare:12,ebitdaPerShare:15,
  cashPerShare:3,debtPerShare:2,revenueGrowth:10,roe:25,debtRatio:30,targetPe:15,targetPb:2,targetFcfMultiple:15,
  uncertainty:.3,dataBasis:'ltm',dataCompleteness:'complete',financialDataDate:financialDate,updatedAt:date,
  priceSource:'Yahoo Finance daily close / daily-refresh-v1',source:'自動資料',financialMetrics:{currency:'TWD',
    periodBasis:'ltm',sharesOutstanding:100000000,shareBasis:'provider-as-of-ordinary',shareAsOfDate:financialDate,
    shareSourceField:'quarterlyOrdinarySharesNumber',roeBasis:'parent-income-average-equity',netIncomePerShare:10,
    nonControllingBookPerShare:0,ebitdaBasis:'operating-income-plus-cashflow-da'}};
function record(ticker) {
  const stock=structuredClone({...template,ticker});
  const candles=Array.from({length:80},(_,i)=>({date:new Date(Date.parse(date)-(79-i)*86400000).toISOString().slice(0,10),
    open:100,high:102,low:99,close:100,volume:1000000}));
  const technicalAnalysis={...analyzeTechnicalSetup(candles,null),candlestickPattern:'morning-star',patternStage:'confirmed'};
  return {ticker,market:'TW',status:'ready',stock,issues:[],rankingEligible:true,quoteDate:date,financialDate,
    fetchedAt:new Date().toISOString(),sources:['https://example.test/synthetic'],history:{ticker,market:'TW',name:stock.name,
      quoteSource:stock.priceSource,candles,weeklyCandles:[],monthlyCandles:[],technicalAnalysis}};
}
function records() {
  return prepareTaiwanRefreshGeneration([record('6949'),...Array.from({length:19},(_,i)=>record(String(1000+i)))],runId);
}
const manifest=rows=>({valuationVersion:DAILY_VALUATION_VERSION,expectedSessions:{TW:date,US:date},
  targets:rows.map(({ticker,market})=>({ticker,market})),universeSource:['synthetic full cohort']});
function database(seed=false,storedUpside=30) {
  const raw=new DatabaseSync(':memory:');for(const sql of REFRESH_SCHEMA)raw.exec(sql);
  const prepare=(sql,args=[])=>({bind:(...a)=>prepare(sql,a),run:async()=>raw.prepare(sql).run(...args),
    all:async()=>({results:raw.prepare(sql).all(...args)}),first:async()=>raw.prepare(sql).get(...args)??null});
  const db={raw,prepare,batch:async statements=>{raw.exec('BEGIN');try {const result=[];
    for(const statement of statements)result.push(await statement.run());raw.exec('COMMIT');return result;
  } catch(error) {raw.exec('ROLLBACK');throw error;}}};
  if(seed) {
    const rows=records(),summary={total:20,TW:{total:20,ready:20,unavailable:0},US:{total:0,ready:0,unavailable:0}};
    raw.prepare('INSERT INTO daily_refresh_runs(id,started_at,completed_at,state,manifest,summary) VALUES(?,?,?,?,?,?)')
      .run(runId,new Date().toISOString(),new Date().toISOString(),'complete',JSON.stringify(manifest(rows)),JSON.stringify(summary));
    raw.prepare('INSERT INTO daily_refresh_head(id,run_id) VALUES(1,?)').run(runId);
    for(const row of rows) {
      const history=structuredClone(row.history);
      // A stored value-trend assertion is derived output, not clearance evidence.
      if(row.ticker==='6949')history.technicalAnalysis.valueTrendResonance={status:'confirmed'};
      raw.prepare('INSERT INTO daily_refresh_records(run_id,market,ticker,status,stock,history,issues,upside,signals,eligible) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(runId,'TW',row.ticker,'ready',JSON.stringify(row.stock),JSON.stringify(history),'[]',row.ticker==='6949'?storedUpside:.2,1,1);
    }
  }
  return db;
}
const read=(db,path,body)=>handleDailyRead(new Request('https://fixture'+path,body?{method:'POST',body:JSON.stringify(body)}:{}),db);
const write=(db,body)=>handleRefreshWrite(new Request('https://fixture/api/data-refresh',{method:'POST',
  headers:{'X-WenYing-Refresh-Key':secret},body:JSON.stringify({runId,...body})}),db,secret);
async function published() {
  const db=database(),rows=records();
  assert.equal((await write(db,{action:'begin',manifest:manifest(rows)})).status,200);
  const batch=await write(db,{action:'batch',records:rows});assert.equal(batch.status,200,await batch.text());
  const finalized=await write(db,{action:'finalize'});assert.equal(finalized.status,200,await finalized.text());
  return {db,rows};
}

test('TW share review withholds daily and direct automatic estimates without changing raw inputs',()=>{
  const rows=records(),stock=rows[0].stock,before=structuredClone(stock),state=dailyValuationState(stock,runId);
  assert.equal(state.stock,null);assert.equal(state.hasModel,false);assert.equal(state.rankingEligible,false);
  for(const key of ['estimatedFairValue','estimatedUpside','estimatedCalibratedUpside','upside'])assert.equal(state[key],null);
  assert.deepEqual(state.issues,[TAIWAN_SHARE_BASIS_REVIEW_ISSUE]);assert.equal(state.review,null);
  assert.deepEqual(state.shareBasisReview,getTaiwanShareBasisReview(stock));
  const automatic=calculateStock(stock);assert.deepEqual(automatic.models,[]);
  assert.equal(valuationRankingState(automatic).hasModel,false);assert.deepEqual(stock,before);
  const control=dailyValuationState(rows[1].stock,runId);assert.equal(control.hasModel,true);
  assert.ok(control.stock.models.length>0);assert.equal(control.shareBasisReview,null);
});

test('TW peer evidence does not propagate a reviewed share basis into control valuations',()=>{
  const rows=records(),controls=rows.slice(1);
  for(const row of controls) {
    assert.ok(row.stock.comparableMultiples.peerTickers.length>=5);
    assert.ok(!row.stock.comparableMultiples.peerTickers.includes('6949'));
    for(const evidence of Object.values(row.stock.comparableMultiples.taiwanApplicabilityEvidence.models))
      assert.ok(!evidence.observations.some(observation=>observation.ticker==='6949'));
    assert.equal(dailyValuationState(row.stock,runId).hasModel,true);
  }
});

test('input metadata and legacy automatic caches cannot clear the review; manual and ARK inputs remain usable',()=>{
  const stock=records()[0].stock,status={state:'complete',runId,valuationVersion:DAILY_VALUATION_VERSION,taiwanValuationCurrent:true};
  const forged={...stock,valuationReviewRequired:false,shareBasisReview:{disposition:'resolved'},
    resolution:{action:'clear-review',caseId:'caller-asserted'},financialMetrics:{...stock.financialMetrics,shareBasisReviewRequired:false}};
  const before=structuredClone(forged);
  for(const automatic of [stock,forged,{...stock,priceSource:'SEC'},
    {...stock,priceSource:undefined,source:undefined,financialDataDate:undefined},
    {...forged,updatedAt:'2035-12-31',financialDataDate:'2035-12-31'}]) {
    assert.equal(currentClientInput(automatic,status),false);
    assert.deepEqual(mergeCurrentInputs([automatic],[automatic],status),[]);
    assert.equal(dailyValuationState(automatic,runId).shareBasisReview.issue,TAIWAN_SHARE_BASIS_REVIEW_ISSUE);
  }
  assert.deepEqual(forged,before);
  const legacy={...stock,priceSource:'User imported file'};assert.deepEqual(persistableInputs([legacy]),[legacy]);
  for(const source of ['手動輸入','方舟截圖']) {
    const owned={...stock,source,valuationPolicy:undefined,comparableMultiples:undefined};
    assert.equal(currentClientInput(owned,null),true);assert.deepEqual(persistableInputs([owned]),[owned]);
    assert.ok(calculateStock(owned).models.length>0);
  }
});

test('positive synthetic EPS and FCF cannot bypass the financial four-factor review gate',()=>{
  const reviewed=records()[0].stock,control=records()[1].stock;
  const feature={stock:reviewed,eligible:true,bars:80,close21:95,close63:90};
  assert.ok(reviewed.eps>0&&reviewed.fcfPerShare>0&&reviewed.roe>0);
  assert.equal(screenFeature(feature),null);assert.ok(screenFeature({...feature,stock:control}));
});

for(const storedUpside of [30,-30])test(`TW read-time review rejects legacy stored upside ${storedUpside} while preserving OHLC and pure technicals`,async()=>{
  const db=database(true,storedUpside);
  try {
    const before=db.raw.prepare('SELECT stock,history,upside,eligible FROM daily_refresh_records WHERE ticker=?').get('6949');
    const valuation=await read(db,'/api/valuation',{ticker:'6949',market:'TW'});assert.equal(valuation.status,422);
    const payload=await valuation.json();assert.deepEqual(payload.issues,[TAIWAN_SHARE_BASIS_REVIEW_ISSUE]);
    assert.equal(payload.shareBasisReview.reviewVersion,TAIWAN_SHARE_BASIS_REVIEW_VERSION);
    assert.ok(payload.shareBasisReview.sourceUrls.length>0);assert.equal(payload.earningsReview,undefined);
    for(const key of ['stock','fairValue','estimatedFairValue','estimatedUpside','upside'])assert.equal(payload[key],undefined);
    const control=await read(db,'/api/valuation',{ticker:'1000',market:'TW'});assert.equal(control.status,200);
    assert.equal((await control.json()).stock.ticker,'1000');
    const historyResponse=await read(db,'/api/price-history?ticker=6949&market=TW');assert.equal(historyResponse.status,200);
    const history=await historyResponse.json();assert.deepEqual(history.candles,JSON.parse(before.history).candles);
    assert.equal(history.valuationAvailable,false);assert.equal(history.valuationRankingEligible,false);
    assert.equal(history.technicalAnalysis.valueTrendResonance,null);
    assert.equal(history.technicalAnalysis.candlestickPattern,'morning-star');
    assert.equal(history.shareBasisReview.issue,TAIWAN_SHARE_BASIS_REVIEW_ISSUE);
    const scan=await (await read(db,'/api/market-scan')).json();
    assert.ok(![...scan.candidates,...scan.overvaluedCandidates].some(stock=>stock.ticker==='6949'));
    assert.equal(scan.freshness.taiwanShareBasisReviewVersion,TAIWAN_SHARE_BASIS_REVIEW_VERSION);
    assert.equal(scan.freshness.taiwanShareBasisReviewCoverage,'source-reviewed-cases-only');
    const technical=await (await read(db,'/api/technical-scan')).json();
    const signal=technical.morningStar.find(stock=>stock.ticker==='6949');assert.ok(signal);
    assert.equal(signal.fairValue,null);assert.equal(signal.upside,null);
    assert.ok(!technical.valueTrend.some(stock=>stock.ticker==='6949'));
    const rotation=await rotationAudit(db,runId,'TW');assert.equal(rotation.screen.eligible,19);
    assert.equal(rotation.screen.candidates.length,10);
    assert.ok(![...rotation.top10,...rotation.screen.candidates].some(stock=>stock.ticker==='6949'));
    assert.deepEqual(db.raw.prepare('SELECT stock,history,upside,eligible FROM daily_refresh_records WHERE ticker=?').get('6949'),before);
  } finally {db.raw.close();}
});

test('new TW batches preserve ready raw financials and liquidity with null review estimates and a versioned research seal',async()=>{
  const {db,rows}=await published();
  try {
    const row=db.raw.prepare('SELECT * FROM daily_refresh_records WHERE ticker=?').get('6949');
    assert.equal(row.status,'ready');assert.equal(row.eligible,1);assert.equal(row.upside,null);
    const stored=JSON.parse(row.stock),{dailyResearch,...raw}=stored;
    assert.deepEqual(raw,JSON.parse(JSON.stringify(rows[0].stock)));
    assert.equal(dailyResearch.version,DAILY_RESEARCH_CACHE_VERSION);assert.equal(dailyResearch.valuationVersion,DAILY_VALUATION_VERSION);
    assert.equal(dailyResearch.taiwanShareBasisReviewVersion,TAIWAN_SHARE_BASIS_REVIEW_VERSION);
    assert.equal(dailyResearch.runId,runId);assert.equal(dailyResearch.quoteDate,date);
    assert.match(dailyResearch.inputDigest,/^[a-f0-9]{64}$/);assert.equal(dailyResearch.hasModel,false);
    assert.equal(dailyResearch.rankingEligible,false);assert.deepEqual(dailyResearch.issues,[TAIWAN_SHARE_BASIS_REVIEW_ISSUE]);
    for(const field of ['nativeFairValue','estimatedFairValue','estimatedUpside','estimatedCalibratedUpside',
      'qualityScore','valuationConfidence','calibrationConfidence'])assert.equal(dailyResearch[field],null);
    assert.equal(await currentDailyResearchCache(stored,runId,date),true);
    assert.equal(await currentDailyResearch(stored,runId,date),false);
    assert.equal(JSON.parse(row.history).candles.length,80);
    assert.deepEqual(JSON.parse(row.issues),[TAIWAN_SHARE_BASIS_REVIEW_ISSUE]);
    const seal=db.raw.prepare('SELECT * FROM daily_refresh_research_seals WHERE market=?').get('TW');
    assert.equal(seal.version,DAILY_RESEARCH_SEAL_VERSION);assert.equal(seal.ready_count,20);assert.match(seal.digest,/^[a-f0-9]{64}$/);
    const scan=await (await read(db,'/api/market-scan?scope=research&market=TW&query=6949')).json();
    assert.equal(scan.researchStatusByMarket.TW,'current');assert.deepEqual(scan.researchCandidates,[]);
    assert.equal(scan.researchCounts.TW,0);assert.equal(scan.researchTotalCounts.TW,19);
  } finally {db.raw.close();}
});

test('old review cache metadata on an excluded late row invalidates the full research cohort before pagination',async()=>{
  const {db}=await published();
  try {
    const row=db.raw.prepare('SELECT stock FROM daily_refresh_records WHERE ticker=?').get('6949'),stock=JSON.parse(row.stock);
    stock.dailyResearch.taiwanShareBasisReviewVersion='old-review';
    assert.equal(await currentDailyResearchCache(stock,runId,date),false);
    db.raw.prepare('UPDATE daily_refresh_records SET stock=? WHERE ticker=?').run(JSON.stringify(stock),'6949');
    const scan=await (await read(db,'/api/market-scan?scope=research&market=TW&limit=1')).json();
    assert.equal(scan.researchStatusByMarket.TW,'refresh_required');assert.deepEqual(scan.researchCandidates,[]);
    assert.equal(scan.researchCounts.TW,0);
    const history=await (await read(db,'/api/price-history?ticker=6949&market=TW')).json();
    assert.equal(history.candles.length,80);assert.equal(history.valuationAvailable,false);
  } finally {db.raw.close();}
});

test('automatic query-cache identity blocks legacy values and caller-asserted manual sources without erasing saved raw payloads',async()=>{
  const db=database(),now=new Date(),rows=records(),reviewed=rows[0].stock,control=rows[1].stock;
  try {
    db.raw.exec('CREATE TABLE valuation_query_cache (market TEXT NOT NULL,ticker TEXT NOT NULL,payload TEXT NOT NULL,cached_at TEXT NOT NULL,expires_at TEXT NOT NULL,PRIMARY KEY(market,ticker))');
    for(const source of ['自動資料','手動輸入','方舟截圖']) {
      const forged={...reviewed,source,shareBasisReview:{disposition:'resolved'},valuationReviewRequired:false};
      const payload=JSON.stringify(forged),cachedAt=now.toISOString(),expiresAt=new Date(now.getTime()+3600000).toISOString();
      db.raw.prepare('INSERT OR REPLACE INTO valuation_query_cache(market,ticker,payload,cached_at,expires_at) VALUES(?,?,?,?,?)')
        .run('TW','6949',payload,cachedAt,expiresAt);
      const before=db.raw.prepare('SELECT * FROM valuation_query_cache WHERE ticker=?').get('6949');
      assert.equal(await readValuationQueryCache('TW','6949',now,db),null);
      assert.equal(await saveValuationQueryCache(forged,now,db),false);
      assert.deepEqual(db.raw.prepare('SELECT * FROM valuation_query_cache WHERE ticker=?').get('6949'),before);
    }
    assert.equal(await saveValuationQueryCache(control,now,db),true);
    assert.deepEqual(await readValuationQueryCache('TW',control.ticker,now,db),JSON.parse(JSON.stringify(control)));
  } finally {db.raw.close();}
});


test('server peer assembly ignores manual-looking source labels without poisoning healthy controls',()=>{
  const baseline=records(),expected=baseline[1].stock.comparableMultiples;
  for(const source of ['手動輸入','方舟截圖']){
    const raw=[record('6949'),...Array.from({length:19},(_,i)=>record(String(1000+i)))];
    raw[0].stock.source=source;
    const prepared=prepareTaiwanRefreshGeneration(raw,runId);
    assert.equal(prepared[0].stock.source,source); // raw audit field is preserved
    const reviewed=dailyValuationState(prepared[0].stock,runId);
    assert.equal(reviewed.hasModel,false);assert.equal(reviewed.shareBasisReview.issue,TAIWAN_SHARE_BASIS_REVIEW_ISSUE);
    assert.deepEqual(prepared[1].stock.comparableMultiples,expected);
    assert.equal(dailyValuationState(prepared[1].stock,runId).hasModel,true);
    assert.ok(!prepared[1].stock.comparableMultiples.peerTickers.includes('6949'));
  }
});
