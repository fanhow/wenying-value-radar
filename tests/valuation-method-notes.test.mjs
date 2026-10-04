import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const NativeDate=globalThis.Date;
const epoch=NativeDate.parse('2026-10-03T00:00:00.000Z');
globalThis.Date=class extends NativeDate {
  constructor(...args){super(...(args.length?args:[epoch]));}
  static now(){return epoch;}
};
const {calculateStock}=await import('../lib/valuation.ts');
const {dailyValuationState,valuationRankingState,DAILY_VALUATION_VERSION}=await import('../lib/daily-valuation-state.ts');
const {buildTaiwanComparableMap,validTaiwanComparableEvidence}=await import('../lib/taiwan-comparables.ts');
const {withTaiwanBusinessGroup}=await import('../lib/taiwan-business-groups.ts');
const runId='synthetic_method_note_unit_fixture';

// Every financial value and filing URL below is SYNTHETIC UNIT EVIDENCE ONLY.
// Registry IDs exercise the existing legal business-group branch. This fixture
// is not captured market data, issuer certification, or a market positive control.
function syntheticOnlyRows(){
  return ['2451','3135','3260','4967','4973','8088','8271'].map(ticker=>withTaiwanBusinessGroup({
    ticker,name:`Synthetic-only method fixture ${ticker}`,market:'TW',sector:'台灣上市公司',industry:'電子零組件業',
    price:100,eps:10,bvps:40,fcfPerShare:8,revenuePerShare:100,ebitPerShare:12,ebitdaPerShare:15,
    cashPerShare:10,debtPerShare:10,targetPe:10,targetPb:2.5,targetFcfMultiple:12,
    revenueGrowth:3,roe:25,debtRatio:30,uncertainty:.5,netMargin:10,netMarginUnit:'percent',
    dataCompleteness:'complete',dataBasis:'ltm',financialDataDate:'2026-06-30',updatedAt:'2026-10-03',
    valuationPolicy:'tw-comparables-v1',dailyValuationVersion:DAILY_VALUATION_VERSION,dailyRunId:runId,
    financialMetrics:{currency:'TWD',periodBasis:'ltm',shareBasis:'period-end-ordinary',sharesOutstanding:1e8,
      roeBasis:'parent-income-average-equity',growthBasis:'ttm-yoy',netIncomePerShare:10,
      nonControllingBookPerShare:0,ebitdaBasis:'operating-income-plus-cashflow-da',
      enterpriseBridgeEvidence:{sourceType:'issuer-filing',sourceUrl:'https://example.test/synthetic-unit-fixture-only',
        publishedDate:'2026-07-30',periodEnd:'2026-06-30',currency:'TWD',sharesOutstanding:1e8,
        cashAndInvestments:1e9,debtIncludingLeases:1e9,
        cashScope:'unrestricted-cash-and-short-term-investments-excluding-factoring',
        debtScope:'interest-bearing-with-current-and-noncurrent-leases'}}}));
}
function nativeInput(rows=syntheticOnlyRows()){
  return {...rows[0],comparableMultiples:buildTaiwanComparableMap(rows).get(rows[0].ticker)};
}
const isMethodNote=reason=>reason.startsWith('台股')&&reason.includes('相對估值研究；');

let directory,Notice;
test.before(async()=>{
  directory=await mkdtemp(new URL('../.wrangler/method-notes-test-',import.meta.url));
  const output=path.join(directory,'page.cjs');
  await build({entryPoints:[new URL('../app/page.tsx',import.meta.url).pathname],outfile:output,
    bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',logLevel:'silent'});
  Notice=createRequire(import.meta.url)(output).ValuationMethodNotice;
});
test.after(async()=>{globalThis.Date=NativeDate;if(directory)await rm(directory,{recursive:true,force:true});});

test('synthetic-only adequate evidence reaches medium through native daily gate while method disclosure remains visible',()=>{
  const input=nativeInput(),before=structuredClone(input),state=dailyValuationState(input,runId),stock=state.stock;
  assert.equal(validTaiwanComparableEvidence(input),true);
  assert.ok(Object.values(input.comparableMultiples.taiwanApplicabilityEvidence.models).every(model=>model.issues.length===0&&model.observations.length===6));
  assert.deepEqual(stock.models.map(model=>model.id),['pe','pb','p-sales','ev-revenue','ev-ebitda','ev-ebit']);
  assert.equal(stock.valuationIndependentEvidenceCount,3);
  assert.equal(stock.valuationReviewRequired,false);
  assert.equal(stock.historicalCaution,false);assert.deepEqual(stock.historicalCautionReasons,[]);
  assert.equal(stock.valuationMethodNotes.length,1);assert.ok(isMethodNote(stock.valuationMethodNotes[0]));
  assert.equal(stock.valuationConfidence,'medium');assert.equal(stock.calibrationConfidence,'medium');
  assert.equal(state.rankingEligible,true);assert.deepEqual(state.issues,[]);
  assert.ok(Math.abs(stock.fairValue-100)<1e-10);assert.equal(stock.calibratedFairValue,stock.fairValue);
  assert.ok(stock.models.every(model=>model.weight===1/6));
  for(const id of ['dcf-fcf-5y','dcf-fcf-10y'])assert.match(stock.excludedModels.find(model=>model.id===id).reason,/缺少逐年前瞻/);
  assert.ok(stock.excludedModels.some(model=>model.id==='ddm-stable'));
  assert.deepEqual(input,before);
});

test('genuine source, business, cashflow, financial-age and earnings warnings remain blocking',()=>{
  const cases=[
    ['unverified EV bridge',rows=>rows.map(row=>({...row,financialMetrics:{...row.financialMetrics,enterpriseBridgeEvidence:undefined}})),/EV 橋接待核證/],
    ['broad industry business',rows=>rows.map(row=>{const broad={...row};delete broad.taiwanBusinessGroup;return broad;}),/未核證產品/],
    ['limited financial data',rows=>rows.map((row,index)=>index?row:{...row,dataCompleteness:'limited'}),/公開財務欄位不完整/],
    ['missing positive cashflow',rows=>rows.map((row,index)=>index?row:{...row,fcfPerShare:0}),/缺少正數自由現金流/],
    ['aging financial period',rows=>rows.map(row=>({...row,updatedAt:'2026-09-18',financialDataDate:'2026-03-31',
      financialMetrics:{...row.financialMetrics,enterpriseBridgeEvidence:{...row.financialMetrics.enterpriseBridgeEvidence,periodEnd:'2026-03-31'}}})),/超過約四個月/],
    ['earnings base shift',rows=>rows.map((row,index)=>index?row:{...row,epsHistory:['2025','2024','2023'].map(year=>({end:`${year}-12-31`,basis:'annual',value:1}))}),/EARNINGS_BASE_SHIFT/],
  ];
  for(const [label,change,reason]of cases){
    const input=nativeInput(change(syntheticOnlyRows())),before=structuredClone(input),state=dailyValuationState(input,runId);
    assert.equal(state.rankingEligible,false,label);
    assert.equal(state.stock.valuationConfidence,'low',label);assert.equal(state.stock.calibrationConfidence,'low',label);
    assert.ok(state.stock.historicalCautionReasons.some(item=>reason.test(item)),label);
    assert.equal(state.stock.historicalCautionReasons.some(isMethodNote),false,label);
    assert.equal(state.stock.valuationMethodNotes.length,1,label);
    assert.ok(state.issues.includes('LOW_VALUATION_CONFIDENCE'),label);
    assert.deepEqual(input,before,label);
  }
});

test('peer coverage and accounting-basis failures still abstain without method-note clearance',()=>{
  const small=syntheticOnlyRows().slice(0,5),wrong=syntheticOnlyRows();
  wrong[0]={...wrong[0],financialMetrics:{...wrong[0].financialMetrics,roeBasis:'eps-ending-bvps'}};
  for(const rows of [small,wrong]){
    const state=dailyValuationState(nativeInput(rows),runId);
    assert.equal(state.rankingEligible,false);assert.equal(state.stock.valuationConfidence,'low');
    assert.ok(state.stock.historicalCautionReasons.some(reason=>reason.startsWith('MODEL_APPLICABILITY:')));
    assert.equal(state.stock.valuationMethodNotes.length,1);
  }
});

test('individual 6176 share-basis review precedes calculation and preserves the supplied financials',()=>{
  const input={...nativeInput(),ticker:'6176',name:'Synthetic-only review-path fixture',source:'手動輸入'},before=structuredClone(input);
  const state=dailyValuationState(input,runId);
  assert.equal(state.stock,null);assert.equal(state.hasModel,false);assert.equal(state.rankingEligible,false);
  assert.deepEqual(state.issues,['TW_SHARE_BASIS_REVIEW_REQUIRED']);assert.deepEqual(input,before);
  const direct=calculateStock({...input,source:'自動資料',valuationMethodNotes:['untrusted caller note']});
  assert.equal(direct.valuationConfidence,'low');assert.deepEqual(direct.valuationMethodNotes,[]);
});

test('native version bump rejects inputs from the former confidence policy',()=>{
  const input=nativeInput();
  assert.equal(dailyValuationState(input,runId).rankingEligible,true);
  assert.equal(DAILY_VALUATION_VERSION,'tw-comparables-2026-10-03-method-notes-v4');
  const old=dailyValuationState({...input,dailyValuationVersion:'tw-comparables-2026-10-02-research-v3'},runId);
  assert.equal(old.stock,null);assert.equal(old.rankingEligible,false);
  assert.deepEqual(old.issues,['TW_DAILY_VALUATION_REFRESH_REQUIRED']);
});

test('caller method notes cannot override source warnings or derived method scope',()=>{
  const rows=syntheticOnlyRows().map(row=>({...row,financialMetrics:{...row.financialMetrics,enterpriseBridgeEvidence:undefined}}));
  const input={...nativeInput(rows),historicalCaution:false,historicalCautionReasons:[],valuationMethodNotes:['pretend source clearance']};
  const stock=calculateStock(input);
  assert.equal(stock.valuationConfidence,'low');assert.equal(valuationRankingState(stock).rankingEligible,false);
  assert.ok(stock.historicalCautionReasons.some(reason=>reason.startsWith('EV 橋接')));
  assert.equal(stock.valuationMethodNotes.some(note=>note==='pretend source clearance'),false);
});

test('method notes render independently for eligible and research estimates in Chinese and English',()=>{
  const eligible=dailyValuationState(nativeInput(),runId).stock;
  const research=dailyValuationState(nativeInput(syntheticOnlyRows().map(row=>({...row,financialMetrics:{...row.financialMetrics,enterpriseBridgeEvidence:undefined}}))),runId).stock;
  assert.equal(valuationRankingState(eligible).rankingEligible,true);assert.equal(valuationRankingState(research).rankingEligible,false);
  for(const stock of [eligible,research])for(const language of ['zh','en']){
    const html=renderToStaticMarkup(React.createElement(Notice,{stock,language}));
    assert.match(html,/role="note"/);assert.match(html,/data-valuation-method-notes/);
    assert.match(html,language==='zh'?/估值方法說明/:/Valuation method notes/);
    assert.match(html,language==='zh'?/同日同業務群相對估值研究/:/same-session business-group relative valuation research/);
    assert.match(html,language==='zh'?/DCF／DDM 尚不計入/:/DCF\/DDM are not included/);
    assert.match(html,language==='zh'?/不能視為外部模型複製/:/does not replicate an external model/);
  }
});

test('legacy notes absence and unrelated ETF branch remain compatible',()=>{
  assert.equal(renderToStaticMarkup(React.createElement(Notice,{stock:{},language:'en'})),'');
  assert.equal(renderToStaticMarkup(React.createElement(Notice,{stock:{valuationMethodNotes:[]},language:'zh'})),'');
  const etf=calculateStock({...nativeInput(),ticker:'0050',assetType:'ETF',nav:100,valuationMethodNotes:['untrusted caller note']});
  assert.deepEqual(etf.valuationMethodNotes,[]);
});
