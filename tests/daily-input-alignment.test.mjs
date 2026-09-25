import test from 'node:test';
import assert from 'node:assert/strict';
import {quarterlyInputs,completedCandles,fetchRefreshRecord} from '../lib/daily-refresh-data.ts';
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

test('daily USD and TWD margins retain explicit percent units across the one-percent boundary',()=>{
  for(const currency of ['USD','TWD']) for(const margin of [-2,-1,-0.5,0,0.5,1,1.01,2,40]){
    const p=fixture();p.timeseries.result.push(series('trailingNetIncome',[[end,400*margin/100]]));
    for(const row of p.timeseries.result)for(const point of row[row.meta.type[0]])point.currencyCode=currency;
    const r=quarterlyInputs(p,currency,now);
    assert.equal(r.netMargin,margin,`${currency} ${margin}% must remain a percentage`);
    assert.equal(r.netMarginUnit,'percent');
    assert.equal(r.eps,8);assert.equal(r.bvps,20);assert.equal(r.fcfPerShare,6);
  }
});

test('explicit margin unit does not invent missing net income or margin',()=>{
  for(const currency of ['USD','TWD']){
    const p=fixture();
    for(const row of p.timeseries.result)for(const point of row[row.meta.type[0]])point.currencyCode=currency;
    const r=quarterlyInputs(p,currency,now);
    assert.equal(r.netMargin,undefined);
    assert.equal(r.netMarginUnit,'percent');
  }
});

test('successful US collector preserves percent margin through stock construction and JSON storage',async()=>{
  const p=fixture();p.timeseries.result.push(series('trailingNetIncome',[[end,2]]));
  p.timeseries.result.find(row=>row.meta.type[0]==='trailingDilutedEPS').trailingDilutedEPS[0].reportedValue.raw=.2;
  const session='2026-09-18';
  const timestamp=Array.from({length:80},(_,i)=>(Date.parse(`${session}T20:00:00Z`)-(79-i)*86400000)/1000);
  const chart={chart:{result:[{meta:{currency:'USD'},timestamp,indicators:{quote:[{
    open:timestamp.map(()=>40),high:timestamp.map(()=>41),low:timestamp.map(()=>39),close:timestamp.map(()=>40),volume:timestamp.map(()=>1000000),
  }]}}]}};
  const row=await fetchRefreshRecord({ticker:'UNITFIX',name:'Synthetic unit fixture',market:'US',sector:'Technology'},session,now,
    async url=>Response.json(url.includes('/chart/')?chart:p));
  assert.equal(row.status,'ready',JSON.stringify(row.issues));
  const restored=JSON.parse(JSON.stringify(row));
  assert.equal(restored.stock.netMargin,.5);assert.equal(restored.stock.netMarginUnit,'percent');
  assert.equal(restored.stock.eps,.2);assert.equal(restored.stock.price,40);
});
for(const reviewed of [{ticker:'VISN',name:'Vistance Networks, Inc.'},{ticker:'KODK',name:'Eastman Kodak Company'}])
test(`${reviewed.ticker} reviewed US collector preserves reported inputs and candles but creates no value context`,async()=>{
  const session='2026-09-18',p=fixture();
  p.timeseries.result.find(row=>row.meta.type[0]==='quarterlyOrdinarySharesNumber').quarterlyOrdinarySharesNumber[0].reportedValue.raw=100000000;
  const timestamp=Array.from({length:80},(_,i)=>(Date.parse(`${session}T20:00:00Z`)-(79-i)*86400000)/1000);
  const chart={chart:{result:[{meta:{currency:'USD'},timestamp,indicators:{quote:[{
    open:timestamp.map(()=>40),high:timestamp.map(()=>41),low:timestamp.map(()=>39),close:timestamp.map(()=>40),volume:timestamp.map(()=>1000000),
  }]}}]}};
  const expected=quarterlyInputs(p,'USD',now),before=structuredClone(p);
  const row=await fetchRefreshRecord({ticker:reviewed.ticker,name:'Old directory name',market:'US',sector:'Technology'},session,now,
    async url=>Response.json(url.includes('/chart/')?chart:p));
  assert.equal(row.status,'ready');assert.deepEqual(row.issues,['US_EARNINGS_BASIS_REVIEW_REQUIRED']);
  assert.equal(row.stock.eps,8);assert.equal(row.stock.price,40);assert.equal(row.stock.name,reviewed.name);
  assert.equal(row.stock.fcfPerShare,expected.fcfPerShare);assert.equal(row.stock.bvps,expected.bvps);assert.deepEqual(p,before);
  assert.equal(row.history.candles.length,80);assert.equal(row.history.technicalAnalysis.valueTrendResonance,null);assert.equal(row.rankingEligible,true);
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
