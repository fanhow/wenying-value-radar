import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateStock} from '../lib/valuation.ts';
import {dailyValuationState,valuationRankingState} from '../lib/daily-valuation-state.ts';
import {classifyFinancialFreshness,financialAgeDays} from '../lib/data-freshness.ts';
import {withDailyResearchCache,currentDailyResearchCache} from '../lib/daily-research-ranking.ts';

// Independent synthetic control; no real price target or financial input repair.
const control={ticker:'CONTROL',name:'Observation-date control',market:'US',sector:'Industrials',
 price:100,eps:10,bvps:40,fcfPerShare:9,revenueGrowth:3,roe:15,debtRatio:30,
 targetPe:15,targetPb:2,targetFcfMultiple:15,uncertainty:.25,
 dataBasis:'ltm',dataCompleteness:'complete',financialDataDate:'2026-06-30',updatedAt:'2026-10-01',
 priceSource:'Yahoo Finance daily close / daily-refresh-v1',source:'自動資料'};
const origin=Date.parse('2026-06-30T00:00:00Z'),day=86400000;

test('explicit model and daily-state clocks are independent of wall time and preserve inputs',t=>{
 t.mock.timers.enable({apis:['Date'],now:origin+241*day});
 const before=structuredClone(control),at=origin+120*day;
 const direct=calculateStock(control,undefined,at),state=dailyValuationState(control,'clock-fixture',at);
 assert.equal(direct.financialFreshness,'fresh');assert.equal(direct.financialAgeDays,120);
 assert.equal(direct.assumptions.financialAgeDays,120);assert.deepEqual(state.stock,direct);
 assert.equal(state.rankingEligible,true);assert.deepEqual(control,before);
 assert.equal(calculateStock(control).financialFreshness,'stale');
 assert.equal(dailyValuationState(control).rankingEligible,false);
});

test('120/121 and 240/241 financial-age boundaries remain exact with explicit model clocks',()=>{
 const fresh=calculateStock(control,undefined,origin+120*day);
 for(const [days,expected] of [[120,'fresh'],[121,'aging'],[240,'aging'],[241,'stale']]) {
  const now=origin+days*day,stock=calculateStock(control,undefined,now),state=valuationRankingState(stock);
  assert.equal(financialAgeDays(control.financialDataDate,now),days);
  assert.equal(classifyFinancialFreshness(control.financialDataDate,now),expected);
  assert.equal(stock.financialAgeDays,days);assert.equal(stock.financialFreshness,expected);
  assert.equal(stock.assumptions.financialFreshness,expected);
  assert.equal(state.rankingEligible,days===120);
  if(days>120)assert.equal(state.upside,null);
  assert.equal(stock.fairValue,fresh.fairValue);
  assert.deepEqual(stock.models.map(m=>[m.id,m.value]),fresh.models.map(m=>[m.id,m.value]));
 }
});

test('the reviewed-share early return and legacy financial-date fallback use the supplied clock',t=>{
 t.mock.timers.enable({apis:['Date'],now:origin+241*day});
 const reviewed=calculateStock({...control,ticker:'6949',market:'TW'},undefined,origin+120*day);
 assert.ok(reviewed.shareBasisReview);assert.deepEqual(reviewed.models,[]);
 assert.equal(reviewed.financialAgeDays,120);assert.equal(reviewed.assumptions.financialFreshness,'fresh');
 assert.equal(valuationRankingState(reviewed).rankingEligible,false);
 const legacy=calculateStock({...control,financialDataDate:undefined,updatedAt:'2026-06-30'},undefined,origin+121*day);
 assert.equal(legacy.financialAgeDays,121);assert.equal(legacy.financialFreshness,'aging');
});

// Boundary/default-clock and cache controls adapted after reviewing f0e7ff0f.
test('an omitted observation follows the advancing current clock and excludes aging data',t=>{
 t.mock.timers.enable({apis:['Date'],now:origin+120*day});
 const fresh=dailyValuationState(control);assert.equal(fresh.rankingEligible,true);
 t.mock.timers.setTime(origin+121*day);
 const aging=dailyValuationState(control);assert.equal(aging.rankingEligible,false);
 assert.equal(aging.stock.financialAgeDays,121);assert.equal(aging.stock.valuationConfidence,'low');
 assert.equal(aging.stock.fairValue,fresh.stock.fairValue);
});

test('a cache from before aging cannot certify current eligibility after the boundary',async t=>{
 t.mock.timers.enable({apis:['Date'],now:origin+120*day});
 const run='clock-fixture',cached=await withDailyResearchCache(control,run),before=structuredClone(cached);
 assert.equal(await currentDailyResearchCache(cached,run,control.updatedAt),true);
 assert.equal(cached.dailyResearch.rankingEligible,true);
 t.mock.timers.setTime(origin+121*day);
 assert.equal(await currentDailyResearchCache(cached,run,control.updatedAt),false);
 const updated=await withDailyResearchCache(control,run);
 assert.equal(updated.dailyResearch.rankingEligible,false);
 assert.equal(await currentDailyResearchCache(updated,run,control.updatedAt),true);
 assert.deepEqual(cached,before);
});
