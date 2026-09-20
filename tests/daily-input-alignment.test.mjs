import test from 'node:test';
import assert from 'node:assert/strict';
import {quarterlyInputs,completedCandles} from '../lib/daily-refresh-data.ts';
const now=new Date('2026-09-20T15:00:00Z'),end='2026-06-30';
function series(type,points){return {meta:{type:[type]},[type]:points.map(([asOfDate,raw])=>({asOfDate,periodType:type.startsWith('trailing')?'TTM':'3M',currencyCode:'USD',reportedValue:{raw}}))};}
function fixture(){return {timeseries:{result:[
  series('quarterlyTotalRevenue',[['2025-06-30',70],['2025-12-31',90],['2026-03-31',100],[end,110]]),
  ...Object.entries({TotalRevenue:400,DilutedEPS:8,OperatingCashFlow:80,CapitalExpenditure:-20,EBITDA:100}).map(([k,v])=>series('trailing'+k,[[end,v]])),
  series('trailingTotalRevenue',[['2025-06-30',300],[end,400]]),
  ...Object.entries({OrdinarySharesNumber:10,StockholdersEquity:200,TotalAssets:400,TotalLiabilitiesNetMinorityInterest:200}).map(([k,v])=>series('quarterly'+k,[[end,v]])),
]}};}
test('aligned provider TTM is accepted when an intermediate quarter is absent',()=>{
  const r=quarterlyInputs(fixture(),'USD',now);
  assert.equal(r.eps,8);assert.equal(r.fcfPerShare,6);assert.equal(r.ebitdaPerShare,10);
  assert.equal(r.financialDataDate,end);assert.ok(Math.abs(r.revenueGrowth-100/3)<1e-10);
});
test('missing quarter plus missing TTM flow is never filled from an older quarter',()=>{
  const p=fixture();p.timeseries.result=p.timeseries.result.filter(r=>r.meta.type[0]!=='trailingOperatingCashFlow');
  p.timeseries.result.push(series('quarterlyOperatingCashFlow',[['2025-06-30',20],['2025-12-31',20],['2026-03-31',20],[end,20]]));
  assert.throws(()=>quarterlyInputs(p,'USD',now),/CORE_FINANCIAL_FIELDS_MISSING/);
});
test('four contiguous quarters may fill a missing TTM flow',()=>{
  const p=fixture();p.timeseries.result=p.timeseries.result.filter(r=>!['trailingOperatingCashFlow','quarterlyTotalRevenue'].includes(r.meta.type[0]));
  const dates=['2025-09-30','2025-12-31','2026-03-31',end];
  p.timeseries.result.push(series('quarterlyTotalRevenue',dates.map(d=>[d,100])),series('quarterlyOperatingCashFlow',dates.map(d=>[d,20])));
  assert.equal(quarterlyInputs(p,'USD',now).fcfPerShare,6);
});
test('newer partial TTM cannot be mixed with previous-quarter balances',()=>{
  const p=fixture();for(const r of p.timeseries.result.filter(r=>r.meta.type[0].startsWith('trailing'))){const type=r.meta.type[0];r[type].push({...r[type].at(-1),asOfDate:'2026-08-31',reportedValue:{raw:99999}});}
  const r=quarterlyInputs(p,'USD',now);assert.equal(r.financialDataDate,end);assert.equal(r.eps,8);assert.equal(r.ebitdaPerShare,10);
});
test('currency, future and stale financial periods fail closed',()=>{
  assert.throws(()=>quarterlyInputs(fixture(),'TWD',now));
  assert.throws(()=>quarterlyInputs(fixture(),'USD',new Date('2026-06-01')),/STALE_OR_FUTURE/);
  assert.throws(()=>quarterlyInputs(fixture(),'USD',new Date('2027-02-01')),/STALE_OR_FUTURE/);
});
test('official session ceiling excludes a spurious Sunday candle without inventing Friday',()=>{
  const payload={chart:{result:[{timestamp:['2026-09-17T01:00:00Z','2026-09-18T01:00:00Z','2026-09-20T04:00:00Z'].map(d=>Date.parse(d)/1000),indicators:{quote:[{open:[10,11,99],high:[11,12,100],low:[9,10,98],close:[10,11,99],volume:[100,200,300]}]}}]}};
  assert.deepEqual(completedCandles(payload,'TW',now,'2026-09-18').map(c=>c.date),['2026-09-17','2026-09-18']);
  assert.equal(completedCandles(payload,'TW',new Date('2026-09-18T03:00:00Z'),'2026-09-18').at(-1).date,'2026-09-17');
});
