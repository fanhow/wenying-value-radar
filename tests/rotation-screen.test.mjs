import test from 'node:test';
import assert from 'node:assert/strict';
import {screenFeature,rankResearch,inResearchScope} from '../lib/rotation-screen.ts';
import {VALUE_REFERENCES,compareReference,summarizeComparisons} from '../lib/value-reference-audit.ts';
const input={stock:{ticker:'TEST',name:'Test',market:'US',sector:'Technology',price:100,eps:5,fcfPerShare:4,roe:20,debtRatio:40,revenueGrowth:12,updatedAt:'2026-09-18'},eligible:true,bars:120,close21:95,close63:90};
test('technology scope uses market-specific supplied classifications, not company-name guesses',()=>{
  assert.equal(inResearchScope({market:'TW',sector:'台灣上市公司',industry:'半導體業'},'technology'),true);
  assert.equal(inResearchScope({market:'TW',sector:'台灣上市公司',industry:'建材營造業'},'technology'),false);
  assert.equal(inResearchScope({market:'TW',sector:'Technology'},'technology'),false);
  assert.equal(inResearchScope({market:'US',sector:'Technology'},'technology'),true);
  assert.equal(inResearchScope({market:'US',sector:'Finance'},'technology'),false);
});
test('research screen excludes missing data, financial companies and incomplete history',()=>{
  assert.ok(screenFeature(input));
  for(const change of [{bars:63},{close63:null},{eligible:false},{stock:{...input.stock,fcfPerShare:0}},{stock:{...input.stock,sector:'Finance'}},{stock:{...input.stock,roe:NaN}}])assert.equal(screenFeature({...input,...change}),null);
});
test('independent ranks use equal-weight factors, deterministic ties, and no padded picks',()=>{
  const f=screenFeature(input),rows=Array.from({length:12},(_,i)=>({...f,ticker:`T${String(i).padStart(2,'0')}`,growth:i}));
  const ranked=rankResearch(rows,'US');assert.equal(ranked[0].ticker,'T11');assert.equal(ranked.length,12);
  assert.equal(ranked[0].score,(ranked[0].valueScore+ranked[0].qualityScore+ranked[0].growthScore+ranked[0].momentumScore)/4);
  assert.deepEqual(rankResearch(rows.toReversed(),'US'),ranked);assert.deepEqual(rankResearch(rows.slice(0,9),'US'),[]);assert.deepEqual(rankResearch(rows,'TW'),[]);
});
test('comparison keeps missing values null and excludes date/quote mismatches from error denominator',()=>{
  const ref=VALUE_REFERENCES[0],actual={ticker:ref.ticker,market:ref.market,price:ref.price,fairValue:ref.fairValue*1.1,quoteDate:'2026-09-18',modelCount:5};
  const valid=compareReference(ref,actual),missing=compareReference(ref,null),stale=compareReference(ref,{...actual,quoteDate:'2026-09-17'}),priceMismatch=compareReference(ref,{...actual,price:ref.price*2});
  const summary=summarizeComparisons([valid,missing,stale,priceMismatch]);
  assert.equal(summary.matched,1);assert.equal(summary.available,3);assert.equal(missing.gapPct,null);assert.equal(stale.upsideGapPp,null);assert.equal(priceMismatch.upsideGapPp,null);
  assert.ok(Math.abs(summary.meanAbsoluteGapPct-10)<1e-10);
});
