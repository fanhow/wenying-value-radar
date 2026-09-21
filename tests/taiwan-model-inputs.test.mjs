import test from 'node:test';
import assert from 'node:assert/strict';
import {quarterlyInputs,taiwanPerShareIssue} from '../lib/daily-refresh-data.ts';
import {buildTaiwanComparableMap,taiwanEnterpriseAdjustment} from '../lib/taiwan-comparables.ts';
import {calculateStock} from '../lib/valuation.ts';
import {isFinancialCompany} from '../lib/company-classification.ts';
import {taiwanAnnualEarnings,validTaiwanEnterpriseBridgeEvidence} from '../lib/taiwan-valuation-evidence.ts';

const now=new Date('2026-09-20T00:00:00Z');
const point=(asOfDate,value,periodType='3M',currencyCode='TWD')=>({asOfDate,periodType,currencyCode,reportedValue:{raw:value}});
const series=(name,points)=>({meta:{type:[name]},[name]:points});
function payload(extra=[]) {
  const dates=['2025-09-30','2025-12-31','2026-03-31','2026-06-30'];
  const flows={TotalRevenue:50,OperatingCashFlow:10,CapitalExpenditure:-2,DilutedEPS:1,NetIncome:10};
  const balances={StockholdersEquity:200,TotalAssets:400,TotalLiabilitiesNetMinorityInterest:200,OrdinarySharesNumber:10};
  return {timeseries:{result:[...Object.entries(flows).map(([k,v])=>series('quarterly'+k,dates.map(d=>point(d,v)))),
    ...Object.entries(balances).map(([k,v])=>series('quarterly'+k,[point('2026-06-30',v)])),
    series('quarterlyStockholdersEquity',[point('2025-06-30',100)]),
    series('quarterlyTotalRevenue',[point('2025-06-30',25)]),
    series('trailingTotalRevenue',[point('2025-06-30',100,'TTM')]),...extra]}};
}
test('TW ROE uses parent TTM income and average equity; keeps growth bases separate',()=>{
  const s=quarterlyInputs(payload(),'TWD',now);
  assert.equal(s.eps,4);assert.equal(s.bvps,20);assert.equal(s.roe,40/150*100);
  assert.equal(s.financialMetrics.roeBasis,'parent-income-average-equity');
  assert.equal(s.financialMetrics.revenueGrowthTtmYoY,100);assert.equal(s.financialMetrics.revenueGrowthQuarterYoY,100);
  assert.equal(s.financialMetrics.growthBasis,'ttm-yoy');assert.equal(s.netMarginUnit,'percent');
});
test('annual series are merged, retain losses/zero, reject wrong currency/period/future/shifted year',()=>{
  const a=series('annualDilutedEPS',[point('2022-12-31',-3,'12M'),point('2023-12-31',0,'12M')]);
  const b=series('annualDilutedEPS',[point('2024-12-31',2,'12M'),point('2025-12-31',3,'12M'),point('2026-12-31',99,'12M'),point('2025-02-04',99,'12M'),point('2021-12-31',99,'3M'),point('2020-12-31',99,'12M','USD')]);
  const forward=quarterlyInputs(payload([a,b]),'TWD',now),reverse=quarterlyInputs(payload([b,a]),'TWD',now);
  assert.deepEqual(forward.epsHistory.map(p=>p.value),[3,2,0,-3]);assert.deepEqual(forward.epsHistory,reverse.epsHistory);
});
test('conflicting same-date annual observations are excluded independent of ordering',()=>{
  const a=series('annualDilutedEPS',[point('2025-12-31',3,'12M')]),b=series('annualDilutedEPS',[point('2025-12-31',30,'12M')]);
  assert.deepEqual(quarterlyInputs(payload([a,b]),'TWD',now).epsHistory,[]);
  assert.deepEqual(quarterlyInputs(payload([b,a]),'TWD',now).epsHistory,[]);
});
test('direct annual evidence rejects duplicate, impossible, shifted and stale years',()=>{
  const p={basis:'annual',end:'2025-12-31',value:1};
  assert.deepEqual(taiwanAnnualEarnings([p,p,p],'2026-06-30'),[p]);
  assert.deepEqual(taiwanAnnualEarnings([p,{...p,value:2},p],'2026-06-30'),[]);
  for(const end of ['2025-02-31','2025-06-30','2000-12-31','2026-12-31'])assert.deepEqual(taiwanAnnualEarnings([{...p,end}],'2026-06-30'),[]);
});
test('TW operating EBITDA excludes provider non-operating EBIT and preserves both source fields',()=>{
  const extras=Object.entries({OperatingIncome:14,DepreciationAndAmortization:15,EBIT:29,EBITDA:44}).map(([name,value])=>series('trailing'+name,[point('2026-06-30',value,'TTM')]));
  const s=quarterlyInputs(payload(extras),'TWD',now);
  assert.equal(s.ebitPerShare,1.4);assert.equal(s.ebitdaPerShare,2.9);
  assert.equal(s.financialMetrics.providerEbitdaPerShare,4.4);assert.equal(s.financialMetrics.providerEbitPerShare,2.9);
  assert.equal(s.financialMetrics.ebitdaBasis,'operating-income-plus-cashflow-da');
  for(const invalid of [undefined,-1]) {
    const entries=extras.filter(r=>r.meta.type[0]!=='trailingDepreciationAndAmortization');
    if(invalid!==undefined)entries.push(series('trailingDepreciationAndAmortization',[point('2026-06-30',invalid,'TTM')]));
    const missing=quarterlyInputs(payload(entries),'TWD',now);
    assert.equal(missing.ebitdaPerShare,undefined);assert.equal(missing.financialMetrics.ebitdaBasis,'unavailable');
  }
});
test('operating EBITDA requires aligned complete D&A and operating-income periods',()=>{
  const op=series('trailingOperatingIncome',[point('2026-06-30',14,'TTM')]);
  const dates=['2025-09-30','2025-12-31','2026-03-31','2026-06-30'];
  const da=series('quarterlyDepreciationAndAmortization',dates.map(d=>point(d,1)));
  assert.equal(quarterlyInputs(payload([op,da]),'TWD',now).ebitdaPerShare,1.8);
  assert.equal(quarterlyInputs(payload([da]),'TWD',now).ebitdaPerShare,undefined);
  const partial=series('quarterlyDepreciationAndAmortization',dates.slice(1).map(d=>point(d,1)));
  assert.equal(quarterlyInputs(payload([op,partial]),'TWD',now).ebitdaPerShare,undefined);
  assert.equal(quarterlyInputs(payload([op,series('trailingDepreciationAndAmortization',[point('2026-03-31',10,'TTM')])]),'TWD',now).ebitdaPerShare,undefined);
  const us=payload([series('trailingEBITDA',[point('2026-06-30',44,'TTM')])]);
  for(const item of us.timeseries.result)for(const p of item[item.meta.type[0]])p.currencyCode='USD';
  assert.equal(quarterlyInputs(us,'USD',now).ebitdaPerShare,4.4);
});
// Explicitly synthetic evidence; never attached to captured market inputs.
const bridgeEvidence=(cash=5,debt=10)=>({sourceType:'issuer-filing',sourceUrl:'https://example.test/synthetic-filing.pdf',publishedDate:'2026-08-15',periodEnd:'2026-06-30',currency:'TWD',sharesOutstanding:1e8,cashAndInvestments:cash*1e8,debtIncludingLeases:debt*1e8,cashScope:'unrestricted-cash-and-short-term-investments-excluding-factoring',debtScope:'interest-bearing-with-current-and-noncurrent-leases'});
const stock=(ticker,price=100)=>({ticker,name:'測試公司',market:'TW',sector:'台灣上市公司',industry:'電子零組件業',price,
  eps:5,bvps:40,fcfPerShare:3,revenuePerShare:100,ebitPerShare:8,ebitdaPerShare:10,cashPerShare:5,debtPerShare:10,
  targetPe:36,targetPb:5,targetFcfMultiple:20,netMargin:5,netMarginUnit:'percent',revenueGrowth:10,roe:15,debtRatio:40,uncertainty:.3,
  dataBasis:'ltm',dataCompleteness:'historical',financialDataDate:'2026-06-30',updatedAt:'2026-09-18',priceSource:'Yahoo Finance daily close / daily-refresh-v1',
  financialMetrics:{currency:'TWD',periodBasis:'ltm',shareBasis:'period-end-ordinary',roeBasis:'parent-income-average-equity',growthBasis:'ttm-yoy',sharesOutstanding:1e8,netIncomePerShare:5,nonControllingBookPerShare:0,ebitdaBasis:'operating-income-plus-cashflow-da',enterpriseBridgeEvidence:bridgeEvidence()}});
const group=()=>Array.from({length:7},(_,i)=>stock(String(1000+i),100+i));
test('Taiwan peers exclude self, cross-industry/session, malformed/stale dates and unknown basis',()=>{
  const rows=group(),map=buildTaiwanComparableMap(rows),s=map.get('1000');assert.equal(s.peerCount,6);assert.ok(!s.peerTickers.includes('1000'));
  for(const patch of [{industry:'金融業'},{updatedAt:'2026-09-17'},{financialDataDate:'2026-02-31'},{financialDataDate:'2025-12-31'},{dataBasis:undefined}]) {
    const changed=rows.map((r,i)=>i===6?{...r,...patch}:r);assert.equal(buildTaiwanComparableMap(changed).get('1000').peerCount,5);
  }
});
test('conflicting duplicate peers are excluded without order-dependent medians',()=>{
  const rows=group(),conflict={...rows[6],price:400};
  const a=buildTaiwanComparableMap([...rows,conflict]),b=buildTaiwanComparableMap([conflict,...rows]);
  assert.deepEqual(a.get('1000'),b.get('1000'));assert.equal(a.get('1000').peerCount,5);assert.equal(a.has('1006'),false);
});
test('EV requires known nonnegative cash/debt; zero is valid',()=>{
  for(const debtPerShare of [undefined,-500]) {
    const peers=buildTaiwanComparableMap(group().map(s=>({...s,debtPerShare}))).get('1000');
    assert.equal(peers.evEbitdaMedian,null);assert.ok(peers.peMedian>0);
  }
  assert.ok(buildTaiwanComparableMap(group().map(s=>({...s,cashPerShare:0,debtPerShare:0,financialMetrics:{...s.financialMetrics,enterpriseBridgeEvidence:bridgeEvidence(0,0)}}))).get('1000').evEbitdaMedian>0);
});

test('vendor aggregate cash/debt is not certified by presence, even when positive or zero',()=>{
  const raw=quarterlyInputs(payload([series('quarterlyCashCashEquivalentsAndShortTermInvestments',[point('2026-06-30',100)]),series('quarterlyTotalDebt',[point('2026-06-30',20)])]),'TWD',now);
  assert.equal(raw.cashPerShare,10);assert.equal(raw.debtPerShare,2);
  assert.equal(raw.financialMetrics.enterpriseBridgeEvidence,undefined);
  assert.match(raw.sourceNote,/尚未核證/);
  const rows=group(),prior=buildTaiwanComparableMap(rows).get('1000');
  const unverified=rows.map(s=>({...s,financialMetrics:{...s.financialMetrics,enterpriseBridgeEvidence:undefined}}));
  const peers=buildTaiwanComparableMap(unverified).get('1000');
  for(const field of ['evRevenueMedian','evEbitdaMedian','evEbitMedian'])assert.equal(peers[field],null);
  for(const field of ['peMedian','pbMedian','psMedian'])assert.equal(peers[field],prior[field]);
  const target=calculateStock({...unverified[0],comparableMultiples:prior,valuationPolicy:'tw-comparables-v1'});
  assert.equal(target.models.some(m=>m.id.startsWith('ev-')),false);
  assert.equal(target.models.length,3);assert.ok(target.historicalCautionReasons.some(r=>/EV 橋接待核證/.test(r)));
  assert.equal(taiwanEnterpriseAdjustment({...unverified[0],cashPerShare:0,debtPerShare:0}),null);
});

test('bridge evidence binds filing scope, aligned dates, currency, shares and amounts',()=>{
  const s=stock('1000');assert.equal(validTaiwanEnterpriseBridgeEvidence(s),true);
  for(const patch of [{sourceType:'vendor-aggregate'},{sourceUrl:'http://example.test/filing'},{sourceUrl:'https://user:secret@example.test/filing'},
    {cashScope:'all-current-financial-assets'},{debtScope:'borrowings-only'},{periodEnd:'2026-03-31'},
    {periodEnd:'2026-02-31'},{publishedDate:'2026-09-19'},{publishedDate:'2026-06-01'},{currency:'USD'},
    {sharesOutstanding:1e7},{cashAndInvestments:0},{debtIncludingLeases:0},{cashAndInvestments:NaN},
    {debtIncludingLeases:-1},{cashAndInvestments:undefined}]) {
    assert.equal(taiwanEnterpriseAdjustment({...s,financialMetrics:{...s.financialMetrics,enterpriseBridgeEvidence:{...bridgeEvidence(),...patch}}}),null);
  }
  const zero={...s,cashPerShare:0,debtPerShare:0,financialMetrics:{...s.financialMetrics,enterpriseBridgeEvidence:bridgeEvidence(0,0)}};
  assert.equal(taiwanEnterpriseAdjustment(zero),0);
  assert.equal(taiwanEnterpriseAdjustment({...s,cashPerShare:6}),null);
  assert.equal(taiwanEnterpriseAdjustment({...s,debtPerShare:11}),null);
  assert.equal(taiwanEnterpriseAdjustment({...s,financialMetrics:{...s.financialMetrics,sharesOutstanding:2e8}}),null);
  for(const shareBasis of [undefined,'diluted-average'])assert.equal(taiwanEnterpriseAdjustment({...s,financialMetrics:{...s.financialMetrics,shareBasis}}),null);
});

test('conflicting bridge proof cannot select a duplicate by ordering or re-enable a small peer pool',()=>{
  const rows=group(),unverified={...rows[6],financialMetrics:{...rows[6].financialMetrics,enterpriseBridgeEvidence:undefined}};
  assert.deepEqual(buildTaiwanComparableMap([...rows,unverified]),buildTaiwanComparableMap([unverified,...rows]));
  assert.equal(buildTaiwanComparableMap([...rows,unverified]).has(rows[6].ticker),false);
  const thin=rows.map((s,i)=>i>=5?{...s,financialMetrics:{...s.financialMetrics,enterpriseBridgeEvidence:undefined}}:s);
  assert.equal(buildTaiwanComparableMap(thin).get('1000').evEbitdaMedian,null);
  assert.equal(buildTaiwanComparableMap(thin).get('1000').evEbitdaPeerCount,4);
  const reordered={...rows[6],financialMetrics:{...rows[6].financialMetrics,enterpriseBridgeEvidence:Object.fromEntries(Object.entries(bridgeEvidence()).reverse())}};
  assert.deepEqual(buildTaiwanComparableMap([...rows,reordered]),buildTaiwanComparableMap(rows));
  const wrongBasis={...rows[6],financialMetrics:{...rows[6].financialMetrics,shareBasis:'diluted-average'}};
  assert.deepEqual(buildTaiwanComparableMap([...rows,wrongBasis]),buildTaiwanComparableMap([wrongBasis,...rows]));
  assert.equal(buildTaiwanComparableMap([...rows,wrongBasis]).has(rows[6].ticker),false);
});

test('Taiwan bridge safeguards do not change USD ingestion or US valuation',()=>{
  const usd=payload([series('quarterlyCashCashEquivalentsAndShortTermInvestments',[point('2026-06-30',100)]),series('quarterlyTotalDebt',[point('2026-06-30',20)])]);
  for(const item of usd.timeseries.result)for(const p of item[item.meta.type[0]])p.currencyCode='USD';
  const raw=quarterlyInputs(usd,'USD',now);
  assert.equal(raw.cashPerShare,10);assert.equal(raw.debtPerShare,2);assert.equal(raw.financialMetrics,undefined);
  const input={...stock('TEST'),market:'US',priceSource:undefined,financialMetrics:undefined};
  const a=calculateStock(input),b=calculateStock({...input,financialMetrics:stock('1000').financialMetrics});
  assert.deepEqual(a.models,b.models);assert.equal(a.fairValue,b.fairValue);
});
test('broker industry is shared by raw and calibrated valuation; no ordinary-company DCF',()=>{
  const input={...stock('6021'),name:'美好證',industry:'金融業'};
  assert.equal(isFinancialCompany(input),true);const s=calculateStock(input);
  assert.equal(s.models.some(m=>m.id.startsWith('dcf-')),false);assert.equal(s.calibrationConfidence,s.valuationConfidence);
});
test('same-session relative stage uses peer PE/PB, not heuristic uplift or target anchors',()=>{
  const rows=group(),comparableMultiples=buildTaiwanComparableMap(rows).get('1000');
  const s=calculateStock({...rows[0],comparableMultiples,valuationPolicy:'tw-comparables-v1'});
  assert.equal(s.targetPe,comparableMultiples.peMedian);assert.equal(s.targetPb,comparableMultiples.pbMedian);
  assert.ok(s.models.length>=2);assert.equal(s.models.some(m=>m.id.startsWith('dcf-')||['pe-peer','p-fcf','roe-residual','graham'].includes(m.id)),false);
  assert.equal(s.calibratedFairValue,s.fairValue);assert.equal(s.calibrationMetadata.metricSummary.holdoutMape,null);
  assert.ok(Math.abs(s.fairValue-s.models.reduce((n,m)=>n+m.value,0)/s.models.length)<1e-8);
});
test('missing or stale Taiwan peer evidence never falls back to generic targets',()=>{
  const s=calculateStock({...stock('1000'),valuationPolicy:'tw-comparables-v1',targetPsMultiple:10,targetEvRevenueMultiple:10,targetEvEbitdaMultiple:10,targetEvEbitMultiple:10});
  assert.equal(s.models.length,0);assert.equal(s.valuationReviewRequired,true);assert.equal(s.fairValue,0);assert.equal(s.calibratedFairValue,0);
});
test('Taiwan research policy cannot regain historical target calibration by omitting priceSource',()=>{
  const rows=group(),comparableMultiples=buildTaiwanComparableMap(rows).get('1000');
  const s=calculateStock({...rows[0],priceSource:undefined,valuationPolicy:'tw-comparables-v1',comparableMultiples});
  assert.equal(s.calibratedFairValue,s.fairValue);assert.equal(s.calibrationMetadata.sampleSize,0);
  const empty=calculateStock({...stock('2451'),priceSource:undefined,valuationPolicy:'tw-comparables-v1'});
  assert.equal(empty.models.length,0);assert.equal(empty.calibratedFairValue,0);
});
test('legacy EBITDA without an operating basis cannot enter target or peer EV models',()=>{
  const rows=group(),p=buildTaiwanComparableMap(rows).get('1000');
  const legacy={...rows[0],financialMetrics:{...rows[0].financialMetrics,ebitdaBasis:undefined}};
  assert.equal(calculateStock({...legacy,valuationPolicy:'tw-comparables-v1',comparableMultiples:p}).models.some(m=>m.id==='ev-ebitda'),false);
  const legacyRows=rows.map(s=>({...s,financialMetrics:{...s.financialMetrics,ebitdaBasis:undefined}}));
  assert.equal(buildTaiwanComparableMap(legacyRows).get('1000').evEbitdaMedian,null);
});
test('peer PE and PS apply the same operating-profit and minority-claims exclusions as the target',()=>{
  const rows=group();
  const losses=rows.map((s,i)=>i?{...s,ebitPerShare:-2}:s);
  const pe=buildTaiwanComparableMap(losses).get('1000');assert.equal(pe.peMedian,null);assert.equal(pe.pePeerCount,0);
  const minorities=rows.map((s,i)=>i?{...s,financialMetrics:{...s.financialMetrics,nonControllingBookPerShare:30}}:s);
  const ps=buildTaiwanComparableMap(minorities).get('1000');assert.equal(ps.psMedian,null);assert.equal(ps.psPeerCount,0);
});
test('sales multiples require positive comparable margins without a generic-median fallback',()=>{
  for(const net of [true,false])for(const income of [undefined,-1,.1,20]) {
    const rows=group().map((s,i)=>i?net?{...s,financialMetrics:{...s.financialMetrics,netIncomePerShare:income}}:{...s,ebitPerShare:income}:s);
    const p=buildTaiwanComparableMap(rows).get('1000');
    assert.equal(net?p.psMedian:p.evRevenueMedian,null);
    assert.equal(net?p.psPeerCount:p.evRevenuePeerCount,0);
  }
  const rows=group(),p=buildTaiwanComparableMap(rows).get('1000');
  assert.equal(p.salesMarginRatioLimit,2);assert.ok(p.psMedian>0);assert.ok(p.evRevenueMedian>0);
});
test('matched-margin provenance is invalidated when target economics or membership changes',()=>{
  const rows=group(),p=buildTaiwanComparableMap(rows).get('1000');
  for(const patch of [{financialMetrics:{...rows[0].financialMetrics,netIncomePerShare:50}},{ebitPerShare:80}]) {
    assert.equal(calculateStock({...rows[0],...patch,valuationPolicy:'tw-comparables-v1',comparableMultiples:p}).models.length,0);
  }
  const corrupted={...p,salesMarginEvidence:{...p.salesMarginEvidence,psPeerTickers:['9999',...p.salesMarginEvidence.psPeerTickers.slice(1)]}};
  assert.equal(calculateStock({...rows[0],valuationPolicy:'tw-comparables-v1',comparableMultiples:corrupted}).models.length,0);
  const duplicate={...rows[6],financialMetrics:{...rows[6].financialMetrics,netIncomePerShare:20}};
  assert.equal(buildTaiwanComparableMap([...rows,duplicate]).get('1000').peerCount,5);
});
test('sales comparability includes factor-two boundaries and still requires five observations',()=>{
  for(const factor of [.5,2]) {
    const rows=group().map((s,i)=>i?{...s,ebitPerShare:8*factor,financialMetrics:{...s.financialMetrics,netIncomePerShare:5*factor}}:s);
    const p=buildTaiwanComparableMap(rows).get('1000');assert.equal(p.psPeerCount,6);assert.equal(p.evRevenuePeerCount,6);
    assert.ok(p.psMedian>0);assert.ok(p.evRevenueMedian>0);
  }
  const rows=group().map((s,i)=>i>=5?{...s,ebitPerShare:80,financialMetrics:{...s.financialMetrics,netIncomePerShare:50}}:s);
  const p=buildTaiwanComparableMap(rows).get('1000');assert.equal(p.psPeerCount,4);assert.equal(p.psMedian,null);assert.equal(p.evRevenueMedian,null);
});
test('empty peer provenance cannot activate six models merely by claiming a method and date',()=>{
  const rows=group(),p=buildTaiwanComparableMap(rows).get('1000');
  const s=calculateStock({...rows[0],valuationPolicy:'tw-comparables-v1',comparableMultiples:{...p,peerCount:0,peerTickers:[]}});
  assert.equal(s.models.length,0);assert.equal(s.valuationReviewRequired,true);
});
test('Taiwan EV revenue model uses the reported peer median without a hidden margin cap',()=>{
  const rows=group(),p=buildTaiwanComparableMap(rows).get('1000');
  const input={...rows[0],netMargin:.5,valuationPolicy:'tw-comparables-v1',comparableMultiples:{...p,evRevenueMedian:10}};
  const s=calculateStock(input);assert.equal(s.models.find(m=>m.id==='ev-revenue').value,995);
});
test('non-financial operating loss does not turn positive net income into a normal PE',()=>{
  const rows=group(),comparableMultiples=buildTaiwanComparableMap(rows).get('1000');
  const s=calculateStock({...rows[0],eps:32,ebitPerShare:-2,comparableMultiples,valuationPolicy:'tw-comparables-v1'});
  assert.equal(s.eps,32);assert.equal(s.models.some(m=>m.id==='pe'),false);assert.equal(s.valuationReviewRequired,true);
});
test('per-share reconciliation rejects a material unit/basis mismatch without guessing a conversion',()=>{
  assert.equal(taiwanPerShareIssue({eps:93.931917,financialMetrics:{netIncomePerShare:1168.270833}}),'EPS_SHARE_BASIS_RECONCILIATION_REQUIRED');
  assert.equal(taiwanPerShareIssue({eps:5,financialMetrics:{netIncomePerShare:5.1}}),null);
  assert.equal(taiwanPerShareIssue({eps:-1,financialMetrics:{netIncomePerShare:1}}),'EPS_SHARE_BASIS_RECONCILIATION_REQUIRED');
});
test('explicit 0.5 percent margin is not interpreted as 50 percent',()=>{
  const a=calculateStock({...stock('1000'),targetPe:10,netMargin:.5,assetTurnover:1,financialLeverage:2}),b=calculateStock({...stock('1000'),targetPe:10,netMargin:50,assetTurnover:1,financialLeverage:2});
  assert.ok(a.targetPe<b.targetPe);assert.ok(a.qualityScore<b.qualityScore);
});
test('correlated FCF horizons do not delete an independent earnings view',()=>{
  const s=calculateStock({...stock('1000'),roe:30,eps:60,targetPe:36,fcfPerShare:5,revenuePerShare:undefined,ebitdaPerShare:undefined});
  assert.ok(s.models.some(m=>m.id==='pe'));assert.ok(s.models.some(m=>m.id==='dcf-fcf-5y'));
  assert.equal(s.calibrationConfidence,s.valuationConfidence);
});
test('enterprise bridge includes disclosed small NCI and rejects material or missing NCI',()=>{
  const s=stock('1000');assert.equal(taiwanEnterpriseAdjustment(s),5);
  assert.equal(taiwanEnterpriseAdjustment({...s,financialMetrics:{...s.financialMetrics,nonControllingBookPerShare:2}}),7);
  for(const nci of [undefined,-1,20])assert.equal(taiwanEnterpriseAdjustment({...s,financialMetrics:{...s.financialMetrics,nonControllingBookPerShare:nci}}),null);
});
test('peer admission rejects another industry, invalid dates and stale financial ranges',()=>{
  const rows=group(),p=buildTaiwanComparableMap(rows).get('1000');
  for(const patch of [{sector:'化學工業'},{peerGroup:'化學工業'},{asOf:'2026-09-17'},{financialDateRange:['2025-06-30','2026-06-30']},... [[],['2026-06-30'],['2026-06-30','2026-06-30','2026-06-30']].map(financialDateRange=>({financialDateRange}))]) {
    const s=calculateStock({...rows[0],valuationPolicy:'tw-comparables-v1',comparableMultiples:{...p,...patch}});
    assert.equal(s.models.length,0);
  }
  const s=calculateStock({...rows[0],updatedAt:'not-a-date',valuationPolicy:'tw-comparables-v1',comparableMultiples:{...p,quoteDate:'not-a-date',asOf:'not-a-date'}});
  assert.equal(s.models.length,0);
  for(const patch of [{financialDataDate:'2027-06-30'},{financialDataDate:'2025-06-30'},{price:0},{financialMetrics:{...rows[0].financialMetrics,sharesOutstanding:0}}]) {
    const invalid=calculateStock({...rows[0],...patch,valuationPolicy:'tw-comparables-v1',comparableMultiples:p});
    assert.equal(invalid.models.length,0);
  }
});
test('material minority claims require review and cannot enter a sales or EV valuation',()=>{
  const rows=group(),p=buildTaiwanComparableMap(rows).get('1000');
  const s=calculateStock({...rows[0],financialMetrics:{...rows[0].financialMetrics,nonControllingBookPerShare:30},valuationPolicy:'tw-comparables-v1',comparableMultiples:p});
  assert.equal(s.valuationReviewRequired,true);assert.deepEqual(s.models.map(m=>m.id),['pe','pb']);
});
test('a large earnings-base shift remains a reported-value scenario, not a fabricated normalization',()=>{
  const rows=group(),p=buildTaiwanComparableMap(rows).get('1000');
  const s=calculateStock({...rows[0],eps:50,epsHistory:[{end:'2025-12-31',value:10,basis:'annual'},{end:'2024-12-31',value:5,basis:'annual'},{end:'2023-12-31',value:-2,basis:'annual'}],valuationPolicy:'tw-comparables-v1',comparableMultiples:p});
  assert.equal(s.eps,50);assert.equal(s.normalizedEpsPerShare,50);assert.equal(s.epsNormalizationApplied,false);
  assert.equal(s.valuationReviewRequired,true);assert.ok(s.historicalCautionReasons.some(r=>r.startsWith('EARNINGS_BASE_SHIFT')));
});
