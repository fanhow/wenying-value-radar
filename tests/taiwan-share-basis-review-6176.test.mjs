import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {calculateStock} from '../lib/valuation.ts';
import {prepareTaiwanRefreshGeneration} from '../lib/daily-refresh-generation.ts';
import {dailyValuationState,valuationRankingState,DAILY_VALUATION_VERSION} from '../lib/daily-valuation-state.ts';
import {currentClientInput,persistableInputs,mergeCurrentInputs} from '../lib/daily-client-state.ts';
import {REFRESH_SCHEMA,handleDailyRead,handleRefreshWrite} from '../lib/daily-refresh-store.ts';
import {DAILY_RESEARCH_CACHE_VERSION,DAILY_RESEARCH_SEAL_VERSION,currentDailyResearch,currentDailyResearchCache} from '../lib/daily-research-ranking.ts';
import {readValuationQueryCache,saveValuationQueryCache} from '../lib/valuation-cache.ts';
import {screenFeature} from '../lib/rotation-screen.ts';
import {rotationAudit} from '../lib/rotation-audit-store.ts';
import {analyzeTechnicalSetup} from '../lib/technical-analysis.ts';
import {TAIWAN_SHARE_BASIS_REVIEW_CASES,TAIWAN_SHARE_BASIS_REVIEW_VERSION,TAIWAN_SHARE_BASIS_REVIEW_ISSUE,
  evaluateTaiwanShareBasisReview,getTaiwanShareBasisReview} from '../lib/taiwan-share-basis-review.ts';

const saved=JSON.parse(readFileSync(new URL('./fixtures/taiwan-share-basis-6176-saved.json',import.meta.url),'utf8'));
const date=saved.input.updatedAt,financialDate=saved.input.financialDataDate,runId='tw_cash_reduction_fixture';
const oldReviewVersion='tw-share-basis-review-2026-10-03-v1',secret='synthetic-only-6176-review-000000000000000000';
const savedInput=()=>structuredClone(saved.input);
// Positive synthetic financials prove an independent 4F review gate. The real
// saved 6176 input has negative FCF and already fails the positive-FCF rule.
const synthetic=ticker=>({ticker,market:'TW',name:'Synthetic issuer',sector:'Technology',industry:'Synthetic devices',
  price:100,eps:10,bvps:40,fcfPerShare:9,revenuePerShare:100,ebitPerShare:12,ebitdaPerShare:15,
  revenueGrowth:10,roe:25,debtRatio:30,targetPe:15,targetPb:2,targetFcfMultiple:15,uncertainty:.3,
  dataBasis:'ltm',dataCompleteness:'historical',financialDataDate:financialDate,updatedAt:date,
  priceSource:'Yahoo Finance daily close / daily-refresh-v1',source:'自動資料',financialMetrics:{currency:'TWD',
    periodBasis:'ltm',sharesOutstanding:100000000,shareBasis:'provider-as-of-ordinary',shareAsOfDate:financialDate,
    shareSourceField:'quarterlyOrdinarySharesNumber',roeBasis:'parent-income-average-equity',netIncomePerShare:10,
    nonControllingBookPerShare:0,ebitdaBasis:'operating-income-plus-cashflow-da'}});
function record(stock) {
  // Contract-shaped synthetic bars; never presented as actual issuer OHLC.
  const candles=Array.from({length:80},(_,i)=>({date:new Date(Date.parse(date)-(79-i)*86400000).toISOString().slice(0,10),
    open:stock.price,high:stock.price+2,low:stock.price-1,close:stock.price,volume:1000000}));
  return {ticker:stock.ticker,market:'TW',status:'ready',stock,issues:[],rankingEligible:true,quoteDate:date,financialDate,
    fetchedAt:new Date().toISOString(),sources:['https://example.test/synthetic-integration'],history:{ticker:stock.ticker,
      market:'TW',name:stock.name,quoteSource:stock.priceSource,candles,weeklyCandles:[],monthlyCandles:[],
      technicalAnalysis:{...analyzeTechnicalSetup(candles,null),candlestickPattern:'morning-star',patternStage:'confirmed'}}};
}
function records(useSaved=false,source='自動資料') {
  const target=useSaved?savedInput():synthetic('6176');target.source=source;
  return prepareTaiwanRefreshGeneration([record(target),...Array.from({length:19},(_,i)=>record(synthetic(String(1000+i))))],runId);
}
const manifest=rows=>({valuationVersion:DAILY_VALUATION_VERSION,expectedSessions:{TW:date,US:date},
  targets:rows.map(({ticker,market})=>({ticker,market})),universeSource:['synthetic integration cohort']});
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
      if(row.ticker==='6176')history.technicalAnalysis.valueTrendResonance={status:'confirmed'};
      raw.prepare('INSERT INTO daily_refresh_records(run_id,market,ticker,status,stock,history,issues,upside,signals,eligible) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(runId,'TW',row.ticker,'ready',JSON.stringify(row.stock),JSON.stringify(history),'[]',row.ticker==='6176'?storedUpside:.2,1,1);
    }
  }
  return db;
}
const read=(db,path,body)=>handleDailyRead(new Request('https://fixture'+path,body?{method:'POST',body:JSON.stringify(body)}:{}),db);
const write=(db,body)=>handleRefreshWrite(new Request('https://fixture/api/data-refresh',{method:'POST',
  headers:{'X-WenYing-Refresh-Key':secret},body:JSON.stringify({runId,...body})}),db,secret);
async function published() {
  const db=database(),rows=records(true);
  const began=await write(db,{action:'begin',manifest:manifest(rows)});assert.equal(began.status,200,await began.text());
  const batch=await write(db,{action:'batch',records:rows});assert.equal(batch.status,200,await batch.text());
  const finalized=await write(db,{action:'finalize'});assert.equal(finalized.status,200,await finalized.text());
  return {db,rows};
}

test('6176 cash reduction has distinct announced dates and unknown financial publication cannot clear the source review',()=>{
  const review=getTaiwanShareBasisReview(savedInput()),known=TAIWAN_SHARE_BASIS_REVIEW_CASES.find(item=>item.ticker==='6176');
  assert.ok(review&&known);assert.notEqual(TAIWAN_SHARE_BASIS_REVIEW_VERSION,oldReviewVersion);
  assert.equal(review.eventKind,'cash-capital-reduction');assert.equal(review.eventDate,'2026-07-01');
  assert.equal(review.eventDateBasis,'announced-capital-reduction-basis-date');
  assert.equal(review.scheduledNewShareListingDate,'2026-08-24');assert.equal(review.reportedPeriodEnd,'2026-06-30');
  assert.equal(review.actualTradingResumptionVerified,false);assert.equal(review.coverage,'source-reviewed-cases-only');
  const financialSource=known.sources.find(source=>source.publicationDate===null);assert.ok(financialSource);
  assert.ok(known.sources.some(source=>source.publicationDate==='2026-06-30'));
  const resolution={action:'clear-review',caseId:known.caseId,ticker:known.ticker,listingBoard:known.listingBoard,
    reviewedOn:known.reviewedOn,reasonZh:'Synthetic attempted resolution; no actual clearance.',
    bridge:'price-and-all-per-share-inputs',sources:[financialSource]};
  assert.ok(evaluateTaiwanShareBasisReview(savedInput(),[{...known,disposition:'resolved',resolution}]));
  assert.ok(Object.isFrozen(review)&&Object.isFrozen(review.sources)&&Object.isFrozen(known));
  for(const key of ['fairValue','adjustedBvps','adjustedEps','currentOutstandingShares'])assert.equal(review[key],undefined);
});

test('saved 6176 financial excerpt keeps its exact reported inputs while the historical displayed estimate is withheld',()=>{
  assert.equal(saved.source.sha256,'eca151e1b5a25396bdbd9699181ea49cdf3bc285a7ab689a3dd2c3c84bb32ebc');
  assert.equal(saved.historicalDisplayedEstimate.nativeFairValue,231.38710895372157);
  assert.equal(saved.historicalDisplayedEstimate.estimatedUpside,1.506902505994174);
  assert.equal(saved.historicalDisplayedEstimate.rankingEligible,false);
  assert.equal(saved.sourceComparison.fullBookCashTreasuryPriceBridgeVerified,false);
  assert.equal(saved.sourceComparison.ratioOnlyRepairPermitted,false);
  const input=savedInput(),before=structuredClone(input),shares=input.financialMetrics.sharesOutstanding;
  assert.equal(shares,345180947);assert.equal(shares,saved.sourceComparison.july21AfterOutstandingExactNotice);
  assert.ok(Math.abs(input.bvps*shares-saved.sourceComparison.q2ParentEquityTwdThousands*1000)<.01);
  assert.ok(input.fcfPerShare<0); // Not a claim that the real stock previously passed 4F.
  const state=dailyValuationState(input,input.dailyRunId);assert.equal(state.stock,null);assert.equal(state.review,null);
  assert.equal(state.hasModel,false);assert.equal(state.rankingEligible,false);
  assert.deepEqual(state.issues,[TAIWAN_SHARE_BASIS_REVIEW_ISSUE]);
  for(const key of ['estimatedFairValue','estimatedUpside','estimatedCalibratedUpside','upside'])assert.equal(state[key],null);
  const calculated=calculateStock(input);assert.deepEqual(calculated.models,[]);
  assert.equal(valuationRankingState(calculated).hasModel,false);
  for(const key of ['price','eps','bvps','fcfPerShare','cashPerShare','debtPerShare'])assert.equal(calculated[key],before[key]);
  assert.deepEqual(input,before);assert.equal(input.bvps,105.16043343493116);
});

test('positive synthetic controls remain calculable and 4F eligible while reviewed 6176 cannot poison peers or clear through source labels',()=>{
  const baseline=records(),target=baseline[0].stock,control=baseline[1].stock;
  const feature={stock:target,eligible:true,bars:80,close21:95,close63:90};
  assert.ok(target.eps>0&&target.fcfPerShare>0);assert.equal(screenFeature(feature),null);
  assert.ok(screenFeature({...feature,stock:control}));assert.equal(dailyValuationState(control,runId).hasModel,true);
  for(const source of ['自動資料','手動輸入','方舟截圖']) {
    const rows=records(false,source);
    for(const row of rows.slice(1)) {
      assert.deepEqual(row.stock.comparableMultiples,baseline.find(item=>item.ticker===row.ticker).stock.comparableMultiples);
      assert.ok(!row.stock.comparableMultiples.peerTickers.includes('6176'));
    }
    const asserted={...rows[0].stock,valuationReviewRequired:false,resolution:{action:'clear-review'},shareBasisReview:{disposition:'resolved'}};
    assert.equal(dailyValuationState(asserted,runId).shareBasisReview.issue,TAIWAN_SHARE_BASIS_REVIEW_ISSUE);
    assert.equal(screenFeature({...feature,stock:asserted}),null);
    if(source==='自動資料') {
      assert.equal(currentClientInput(asserted,{state:'complete',runId,valuationVersion:DAILY_VALUATION_VERSION,taiwanValuationCurrent:true}),false);
      assert.deepEqual(mergeCurrentInputs([asserted],[asserted],null),[]);
    } else {
      const owned={...savedInput(),source,valuationPolicy:undefined};
      assert.equal(currentClientInput(owned,null),true);assert.deepEqual(persistableInputs([owned]),[owned]);
      assert.ok(calculateStock(owned).models.length>0);assert.equal(getTaiwanShareBasisReview(owned),null);
    }
  }
});

test('6176 legacy stored upside cannot revive estimates or financial ranks while original rows and pure technicals survive',async()=>{
  for(const storedUpside of [30,-30]) {
    const db=database(true,storedUpside);
    try {
      const before=db.raw.prepare('SELECT stock,history,upside,eligible FROM daily_refresh_records WHERE ticker=?').get('6176');
      const valuation=await read(db,'/api/valuation',{ticker:'6176',market:'TW'});assert.equal(valuation.status,422);
      const payload=await valuation.json();assert.deepEqual(payload.issues,[TAIWAN_SHARE_BASIS_REVIEW_ISSUE]);
      assert.equal(payload.shareBasisReview.eventKind,'cash-capital-reduction');assert.equal(payload.stock,undefined);
      assert.equal(payload.earningsReview,undefined);assert.equal(payload.estimatedUpside,undefined);
      const control=await read(db,'/api/valuation',{ticker:'1000',market:'TW'});assert.equal(control.status,200);
      const history=await (await read(db,'/api/price-history?ticker=6176&market=TW')).json();
      assert.deepEqual(history.candles,JSON.parse(before.history).candles);assert.equal(history.valuationAvailable,false);
      assert.equal(history.technicalAnalysis.valueTrendResonance,null);assert.equal(history.technicalAnalysis.candlestickPattern,'morning-star');
      assert.equal(history.shareBasisReview.eventKind,'cash-capital-reduction');
      const scan=await (await read(db,'/api/market-scan')).json();
      assert.ok(![...scan.candidates,...scan.overvaluedCandidates].some(input=>input.ticker==='6176'));
      const technical=await (await read(db,'/api/technical-scan')).json(),signal=technical.morningStar.find(row=>row.ticker==='6176');
      assert.ok(signal);assert.equal(signal.fairValue,null);assert.equal(signal.upside,null);
      assert.ok(!technical.valueTrend.some(row=>row.ticker==='6176'));
      const rotation=await rotationAudit(db,runId,'TW');assert.equal(rotation.screen.eligible,19);
      assert.equal(rotation.screen.candidates.length,10);assert.ok(!rotation.screen.candidates.some(row=>row.ticker==='6176'));
      assert.deepEqual(db.raw.prepare('SELECT stock,history,upside,eligible FROM daily_refresh_records WHERE ticker=?').get('6176'),before);
    } finally {db.raw.close();}
  }
});

test('6176 saved financial excerpt remains ready through a new generation with null estimates and current review cache',async()=>{
  const {db,rows}=await published();
  try {
    const row=db.raw.prepare('SELECT * FROM daily_refresh_records WHERE ticker=?').get('6176');
    assert.equal(row.status,'ready');assert.equal(row.eligible,1);assert.equal(row.upside,null);
    const stored=JSON.parse(row.stock),{dailyResearch,...raw}=stored;assert.deepEqual(raw,JSON.parse(JSON.stringify(rows[0].stock)));
    for(const key of ['price','eps','bvps','fcfPerShare','cashPerShare','debtPerShare','financialDataDate','updatedAt'])assert.equal(raw[key],saved.input[key]);
    assert.deepEqual(raw.financialMetrics,saved.input.financialMetrics);
    assert.equal(dailyResearch.version,DAILY_RESEARCH_CACHE_VERSION);assert.equal(dailyResearch.taiwanShareBasisReviewVersion,TAIWAN_SHARE_BASIS_REVIEW_VERSION);
    assert.equal(dailyResearch.hasModel,false);assert.equal(dailyResearch.rankingEligible,false);
    assert.deepEqual(dailyResearch.issues,[TAIWAN_SHARE_BASIS_REVIEW_ISSUE]);
    for(const key of ['nativeFairValue','estimatedFairValue','estimatedUpside','estimatedCalibratedUpside'])assert.equal(dailyResearch[key],null);
    assert.equal(await currentDailyResearchCache(stored,runId,date),true);assert.equal(await currentDailyResearch(stored,runId,date),false);
    const seal=db.raw.prepare('SELECT * FROM daily_refresh_research_seals WHERE market=?').get('TW');
    assert.equal(seal.version,DAILY_RESEARCH_SEAL_VERSION);assert.equal(seal.ready_count,20);
    const scan=await (await read(db,'/api/market-scan?scope=research&market=TW&query=6176')).json();
    assert.equal(scan.researchStatusByMarket.TW,'current');assert.deepEqual(scan.researchCandidates,[]);
    assert.equal(scan.researchTotalCounts.TW,19);assert.equal(JSON.parse(row.history).candles.length,80);
  } finally {db.raw.close();}
});

test('exact old v1 review metadata invalidates the entire market before paging, including an excluded late 6176 row',async()=>{
  for(const ticker of ['6176','1000']) {
    const {db}=await published();
    try {
      const row=db.raw.prepare('SELECT stock FROM daily_refresh_records WHERE ticker=?').get(ticker),input=JSON.parse(row.stock);
      assert.equal(await currentDailyResearchCache(input,runId,date),true);
      input.dailyResearch.taiwanShareBasisReviewVersion=oldReviewVersion;
      assert.equal(await currentDailyResearchCache(input,runId,date),false);
      db.raw.prepare('UPDATE daily_refresh_records SET stock=? WHERE ticker=?').run(JSON.stringify(input),ticker);
      const scan=await (await read(db,'/api/market-scan?scope=research&market=TW&limit=1')).json();
      assert.equal(scan.researchStatusByMarket.TW,'refresh_required');assert.deepEqual(scan.researchCandidates,[]);
      assert.equal(scan.researchCounts.TW,0);
      const history=await (await read(db,'/api/price-history?ticker=6176&market=TW')).json();
      assert.equal(history.candles.length,80);assert.equal(history.valuationAvailable,false);
    } finally {db.raw.close();}
  }
});

test('6176 query caches cannot bypass the new ledger with manual labels and saved payloads remain intact',async()=>{
  const db=database(),now=new Date(),control=records()[1].stock;
  try {
    db.raw.exec('CREATE TABLE valuation_query_cache (market TEXT NOT NULL,ticker TEXT NOT NULL,payload TEXT NOT NULL,cached_at TEXT NOT NULL,expires_at TEXT NOT NULL,PRIMARY KEY(market,ticker))');
    for(const source of ['自動資料','手動輸入','方舟截圖']) {
      const forged={...savedInput(),source,shareBasisReview:{disposition:'resolved'},valuationReviewRequired:false};
      db.raw.prepare('INSERT OR REPLACE INTO valuation_query_cache(market,ticker,payload,cached_at,expires_at) VALUES(?,?,?,?,?)')
        .run('TW','6176',JSON.stringify(forged),now.toISOString(),new Date(now.getTime()+3600000).toISOString());
      const before=db.raw.prepare('SELECT * FROM valuation_query_cache WHERE ticker=?').get('6176');
      assert.equal(await readValuationQueryCache('TW','6176',now,db),null);assert.equal(await saveValuationQueryCache(forged,now,db),false);
      assert.deepEqual(db.raw.prepare('SELECT * FROM valuation_query_cache WHERE ticker=?').get('6176'),before);
    }
    assert.equal(await saveValuationQueryCache(control,now,db),true);
    assert.deepEqual(await readValuationQueryCache('TW',control.ticker,now,db),JSON.parse(JSON.stringify(control)));
  } finally {db.raw.close();}
});
