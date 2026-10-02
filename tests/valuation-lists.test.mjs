import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateStock} from '../lib/valuation.ts';
import {selectValuationList,researchRequestQuery,researchScanMayReplace,researchFailureScope,researchRowsAfterInvalidation,researchValuesAfterInvalidation,researchHeadAfterFailure} from '../app/valuation-lists.ts';

const input={ticker:'CONTROL',name:'Control',market:'US',sector:'Industrials',price:100,eps:10,bvps:40,
  fcfPerShare:9,revenueGrowth:3,roe:15,debtRatio:30,targetPe:15,targetPb:2,targetFcfMultiple:15,
  uncertainty:.25,dataBasis:'ltm',dataCompleteness:'complete',financialDataDate:'2026-06-30',updatedAt:'2026-10-01'};
const calculated=calculateStock(input);
const options={scope:'research',market:'all',filter:'all',sort:'upside',query:''};
function research(ticker,market,upside,extra={}) {
  return {...calculated,ticker,market,name:'研究 '+ticker,industry:'Fixture industry',
    fairValue:100*(1+upside),upside,calibratedFairValue:150,calibratedUpside:.5,
    valuationConfidence:'low',calibrationConfidence:'medium',valuationReviewRequired:false,...extra};
}

test('research and official lists remain disjoint for low confidence, review and no-model cases',()=>{
  const low=research('A','TW',.3),review={...calculated,ticker:'B',valuationReviewRequired:true},
    calibrationLow={...calculated,ticker:'C',calibrationConfidence:'low'},
    noModel={...low,ticker:'D',models:[],fairValue:0,upside:-1},stocks=[low,review,calibrationLow,noModel,calculated];
  const before=structuredClone(stocks);
  assert.deepEqual(selectValuationList(stocks,options).map(s=>s.ticker),['A','B','C']);
  assert.deepEqual(selectValuationList(stocks,{...options,scope:'official'}).map(s=>s.ticker),['CONTROL']);
  assert.deepEqual(stocks,before);
});

test('research sorts and filters native gaps while formal lists use calibrated gaps',()=>{
  const positive=research('POS','TW',.4,{calibratedUpside:-.2}),negative=research('NEG','TW',-.4),
    neutral=research('MID','TW',.02,{qualityScore:82,price:180,valuationReviewRequired:true}),
    foreign=research('US','US',.8),stocks=[negative,foreign,neutral,positive];
  assert.deepEqual(selectValuationList(stocks,options).map(s=>s.ticker),['POS','MID','NEG','US']);
  assert.deepEqual(selectValuationList(stocks,{...options,filter:'undervalued'}).map(s=>s.ticker),['POS','US']);
  assert.deepEqual(selectValuationList(stocks,{...options,filter:'overvalued'}).map(s=>s.ticker),['NEG']);
  assert.deepEqual(selectValuationList(stocks,{...options,filter:'quality'}).map(s=>s.ticker),['MID']);
  assert.deepEqual(selectValuationList(stocks,{...options,filter:'risk'}).map(s=>s.ticker),['MID']);
  assert.deepEqual(selectValuationList(stocks,{...options,market:'US'}).map(s=>s.ticker),['US']);
  assert.deepEqual(selectValuationList(stocks,{...options,query:'  neg  '}).map(s=>s.ticker),['NEG']);
  assert.deepEqual(selectValuationList(stocks,{...options,sort:'price'}).map(s=>s.ticker),['MID','NEG','POS','US']);
  assert.deepEqual(selectValuationList(stocks,{...options,sort:'recommended'}).map(s=>s.ticker),stocks.map(s=>s.ticker));
  const eligible={...positive,valuationConfidence:'medium',valuationReviewRequired:false};
  assert.deepEqual(selectValuationList([eligible],{...options,scope:'official',filter:'overvalued'}),[eligible]);
  assert.deepEqual(selectValuationList([eligible],{...options,scope:'official',filter:'undervalued'}),[]);
});

test('research query sends every global filter and sort with a fixed generation and per-market page offset',()=>{
  for(const market of ['all','TW','US'])for(const filter of ['all','undervalued','overvalued','quality','risk'])
    for(const sort of ['recommended','upside','quality','price']) {
      const params=new URLSearchParams(researchRequestQuery({market,filter,sort,query:'  晶片 A&B  ',runId:'fixed-generation'}));
      assert.equal(params.get('scope'),'research');assert.equal(params.get('filter'),filter);
      assert.equal(params.get('market'),market==='all'?null:market);assert.equal(params.get('query'),'晶片 A&B');
      assert.equal(params.get('runId'),'fixed-generation');assert.equal(params.get('limit'),'20');assert.equal(params.get('offset'),'0');
      assert.equal(params.get('sort'),sort==='recommended'||sort==='upside'?filter==='overvalued'?'upside_asc':'upside':sort);
    }
  const page=new URLSearchParams(researchRequestQuery({market:'all',filter:'quality',sort:'quality',query:'chip',runId:'fixed-generation'},40,'TW'));
  assert.equal(page.get('market'),'TW');assert.equal(page.get('offset'),'40');assert.equal(page.get('filter'),'quality');
  assert.equal(page.get('sort'),'quality');assert.equal(page.get('query'),'chip');assert.equal(page.get('runId'),'fixed-generation');
});


function invalidateResearchView(view,scope) {
  return {rows:researchRowsAfterInvalidation(view.rows,scope),
    counts:researchValuesAfterInvalidation(view.counts,scope,0),
    totals:researchValuesAfterInvalidation(view.totals,scope,0),
    status:researchValuesAfterInvalidation(view.status,scope,'refresh_required')};
}
const researchView=()=>({rows:[{ticker:'TW-FIRST-PAGE',market:'TW'},{ticker:'US-FIRST-PAGE',market:'US'}],
  counts:{TW:50,US:30},totals:{TW:70,US:40},status:{TW:'current',US:'current'}});

test('failed market research paging removes its first page, filtered totals and current status; generation failures clear both markets',()=>{
  for(const responseStatus of [200,503,undefined]) {
    const view=researchView(),scope=researchFailureScope({market:'TW',requestRunId:'old',currentRunId:'old',responseStatus,
      freshness:{runId:'old',state:'complete'}}),after=invalidateResearchView(view,scope);
    assert.equal(scope,'TW');assert.deepEqual(after.rows,[view.rows[1]]);
    assert.deepEqual(after.counts,{TW:0,US:30});assert.deepEqual(after.totals,{TW:0,US:40});
    assert.deepEqual(after.status,{TW:'refresh_required',US:'current'});
    assert.equal(view.rows.length,2);
  }
  for(const failed of [{responseStatus:409},{freshness:{runId:'new',state:'complete'}},
    {currentRunId:'new'},{freshness:{runId:'old',state:'stale'}}]) {
    const scope=researchFailureScope({market:'TW',requestRunId:'old',currentRunId:'old',...failed}),after=invalidateResearchView(researchView(),scope);
    assert.equal(scope,'all');assert.deepEqual(after.rows,[]);
    assert.deepEqual(after.counts,{TW:0,US:0});assert.deepEqual(after.totals,{TW:0,US:0});
    assert.deepEqual(after.status,{TW:'refresh_required',US:'refresh_required'});
  }
});

test('a slow default scan failure cannot clear a successful active filtered research request',async()=>{
  let rejectScan;
  const pendingScan=new Promise((_,reject)=>{rejectScan=reject;});
  const active={key:'',view:researchView()};
  const scanRunId='same-generation';
  const settled=pendingScan.catch(()=>{
    if(researchScanMayReplace(active.key,scanRunId))active.view=invalidateResearchView(active.view,'all');
  });
  // The filtered request completes before the older unfiltered scan fails.
  const filteredResult={...researchView(),rows:[{ticker:'GLOBAL-HIGH-QUALITY',market:'TW'}],counts:{TW:1,US:0}};
  active.key=JSON.stringify({runId:scanRunId,filter:'quality',sort:'quality'});active.view=filteredResult;
  rejectScan(new Error('slow background network failure'));await settled;
  assert.equal(active.view,filteredResult);assert.equal(active.view.status.TW,'current');
  assert.deepEqual(active.view.rows,[{ticker:'GLOBAL-HIGH-QUALITY',market:'TW'}]);
  assert.equal(researchScanMayReplace(active.key,scanRunId),false);
  assert.equal(researchScanMayReplace(active.key,undefined),false);
  assert.equal(researchScanMayReplace(active.key,'different-generation'),true);
  assert.equal(researchScanMayReplace('',scanRunId),true);
});

test('rejected generation freshness advances or pauses the client head without rolling a newer generation backward',()=>{
  const old={state:'complete',runId:'old',valuationVersion:'current',taiwanValuationCurrent:true},
    next={state:'complete',runId:'new',valuationVersion:'current',taiwanValuationCurrent:true};
  assert.deepEqual(researchHeadAfterFailure(old,'old',next,true),next);
  assert.deepEqual(researchHeadAfterFailure(old,'old',undefined,true),
    {state:'unavailable',runId:null,valuationVersion:null,taiwanValuationCurrent:false});
  assert.equal(researchHeadAfterFailure(old,'old',{runId:'old',state:'complete'},false),old);
  assert.deepEqual(researchHeadAfterFailure(old,'old',{runId:'old',state:'stale'},true),{runId:'old',state:'stale'});
  assert.equal(researchHeadAfterFailure(next,'old',{runId:'old',state:'complete'},true),next);
});
