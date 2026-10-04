import assert from 'node:assert/strict';
import test from 'node:test';
import {quarterlyInputs,fetchRefreshRecord} from '../lib/daily-refresh-data.ts';

const now=new Date('2026-10-03T00:00:00Z');
const end='2026-06-30';
const dates=['2024-09-30','2024-12-31','2025-03-31','2025-06-30','2025-09-30','2025-12-31','2026-03-31',end];
function series(type,points) {
  return {meta:{symbol:['FINITE.TW'],type:[type]},[type]:points.map(([date,value])=>({
    asOfDate:date,periodType:type.startsWith('trailing')?'TTM':'3M',currencyCode:'TWD',reportedValue:{raw:value},
  }))};
}
function payload(priorRevenue=320) {
  const result=[series('quarterlyTotalRevenue',dates.map((date,index)=>[date,[60,80,80,100,90,90,100,120][index]])),
    series('trailingTotalRevenue',[['2025-06-30',priorRevenue],[end,400]])];
  for(const [key,value] of Object.entries({DilutedEPS:2,OperatingCashFlow:50,CapitalExpenditure:-20,NetIncome:20,OperatingIncome:40}))
    result.push(series('trailing'+key,[[end,value]]));
  for(const [key,value] of Object.entries({OrdinarySharesNumber:10,StockholdersEquity:100,TotalAssets:200,TotalLiabilitiesNetMinorityInterest:100}))
    result.push(series('quarterly'+key,[[end,value]]));
  return {timeseries:{result}};
}
const points=(input,type)=>input.timeseries.result.find(row=>row.meta.type[0]===type)[type];
const rawFinite=input=>input.timeseries.result.every(row=>row[row.meta.type[0]].every(point=>Number.isFinite(point.reportedValue.raw)));
const rejected=input=>{
  assert.equal(rawFinite(input),true);
  assert.throws(()=>quarterlyInputs(input,'TWD',now),{message:'NON_FINITE_DERIVED_FINANCIAL_INPUT'});
};

test('finite prior TTM overflow is rejected rather than replaced with available quarterly growth',()=>{
  const input=payload(Number.MIN_VALUE),before=structuredClone(input);
  rejected(input);assert.deepEqual(input,before);
});

test('optional quarterly growth cannot retain Infinity when selected TTM growth is finite',()=>{
  const input=payload();points(input,'quarterlyTotalRevenue').find(point=>point.asOfDate==='2025-06-30').reportedValue.raw=Number.MIN_VALUE;
  rejected(input);
});

test('finite share inputs cannot yield non-finite book or cash-flow per share',()=>{
  const input=payload();points(input,'quarterlyOrdinarySharesNumber')[0].reportedValue.raw=Number.MIN_VALUE;
  rejected(input);
});

test('four finite EPS quarters cannot publish an overflowing sum',()=>{
  const input=payload();input.timeseries.result=input.timeseries.result.filter(row=>row.meta.type[0]!=='trailingDilutedEPS');
  input.timeseries.result.push(series('quarterlyDilutedEPS',dates.slice(-4).map(date=>[date,Number.MAX_VALUE])));
  rejected(input);
});

test('overflowing prior four-quarter revenue cannot be hidden as finite minus-100-percent growth',()=>{
  for(const currency of ['TWD','USD']) {
    const input=payload();input.timeseries.result=input.timeseries.result.filter(row=>row.meta.type[0]!=='trailingTotalRevenue');
    for(const row of input.timeseries.result)for(const point of row[row.meta.type[0]])point.currencyCode=currency;
    for(const point of points(input,'quarterlyTotalRevenue').slice(0,4))point.reportedValue.raw=Number.MAX_VALUE/2;
    assert.equal(rawFinite(input),true);
    assert.throws(()=>quarterlyInputs(input,currency,now),{message:'NON_FINITE_DERIVED_FINANCIAL_INPUT'});
  }
});

test('overflowing average equity cannot be hidden as a finite zero ROE',()=>{
  const input=payload(),equity=Number.MAX_VALUE*.75,netIncome=Number.MAX_VALUE*.15;
  points(input,'quarterlyStockholdersEquity')[0].reportedValue.raw=equity;
  points(input,'quarterlyStockholdersEquity').push({asOfDate:'2025-06-30',periodType:'3M',currencyCode:'TWD',reportedValue:{raw:equity}});
  points(input,'trailingNetIncome')[0].reportedValue.raw=netIncome;
  points(input,'quarterlyOrdinarySharesNumber')[0].reportedValue.raw=1e306;
  points(input,'trailingDilutedEPS')[0].reportedValue.raw=netIncome/1e306;
  rejected(input);
});

test('finite zero, negative and large growth keep their period, reported values and missingness',()=>{
  for(const prior of [400,800,1e-100]) {
    const input=payload(prior),before=structuredClone(input),result=quarterlyInputs(input,'TWD',now);
    assert.equal(result.revenueGrowth,(400/prior-1)*100);
    assert.equal(result.financialMetrics.growthBasis,'ttm-yoy');
    assert.equal(result.financialMetrics.revenueGrowthTtmYoY,result.revenueGrowth);
    assert.equal(result.eps,2);assert.equal(result.bvps,10);assert.equal(result.fcfPerShare,3);
    assert.equal(result.financialMetrics.depreciationPerShare,undefined);
    assert.deepEqual(input,before);
  }
});

test('a derived overflow leaves a single record unavailable with valid price history',async()=>{
  const before=payload(Number.MIN_VALUE);
  const timestamp=Array.from({length:80},(_,i)=>(Date.parse('2026-06-30')-(79-i)*86400000)/1000);
  const prices=timestamp.map((_,i)=>100+i);
  const chart={chart:{result:[{meta:{symbol:'FINITE.TW',currency:'TWD',longName:'Synthetic finite-input counterexample'},timestamp,
    indicators:{quote:[{open:prices,high:prices.map(value=>value+1),low:prices.map(value=>value-1),close:prices,volume:prices.map(()=>1000000)}]}}]}};
  const fetcher=async url=>new Response(JSON.stringify(String(url).includes('/finance/timeseries/')?before:chart),{status:200,headers:{'Content-Type':'application/json'}});
  const record=await fetchRefreshRecord({ticker:'FINITE',name:'Synthetic finite-input counterexample',sector:'Technology',market:'TW'},'2026-06-30',new Date('2026-07-01T00:00:00Z'),fetcher);
  assert.equal(record.status,'unavailable');assert.deepEqual(record.issues,['NON_FINITE_DERIVED_FINANCIAL_INPUT']);
  assert.equal(record.stock,undefined);assert.equal(record.history.candles.length,80);
  assert.equal(record.history.technicalAnalysis.valueTrendResonance,null);
  assert.equal(record.quoteDate,'2026-06-30');assert.equal(record.history.candles.at(-1).close,179);
});
