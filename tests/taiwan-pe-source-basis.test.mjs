import test from 'node:test';
import assert from 'node:assert/strict';
import {quarterlyInputs} from '../lib/daily-refresh-data.ts';
import {buildTaiwanComparableMap,validTaiwanComparableEvidence} from '../lib/taiwan-comparables.ts';
import {calculateStock} from '../lib/valuation.ts';

// Contract fixtures, not real filings. The separate public capture retains
// raw issuer data; these cases isolate a missing source dependency.
const end='2026-06-30',previous='2025-06-30',now=new Date('2026-10-02T00:00:00Z');
function payload({opening=true,net=true,operating=true,shares=true}={}) {
  const item=(type,points)=>({meta:{type:[type]},[type]:points.map(([asOfDate,value])=>({asOfDate,
    periodType:type.startsWith('trailing')?'TTM':'3M',currencyCode:'TWD',reportedValue:{raw:value}}))});
  return {timeseries:{result:[
    item('quarterlyTotalRevenue',[[previous,80e7],[end,100e7]]),
    item('trailingTotalRevenue',[[previous,320e7],[end,400e7]]),
    ...Object.entries({DilutedEPS:.8,OperatingCashFlow:100e6,CapitalExpenditure:-20e6,
      ...(net?{NetIncome:80e6}:{}),...(operating?{OperatingIncome:120e6}:{})})
      .map(([name,value])=>item('trailing'+name,[[end,value]])),
    item('quarterlyStockholdersEquity',[...(opening?[[previous,1600e6]]:[]),[end,2000e6]]),
    ...Object.entries({TotalAssets:4000e6,TotalLiabilitiesNetMinorityInterest:2000e6,
      ...(shares?{OrdinarySharesNumber:100e6}:{})}).map(([name,value])=>item('quarterly'+name,[[end,value]])),
  ]}};
}
function row(ticker,options={}) {
  return {ticker,name:'合成供應契約控制',market:'TW',sector:'台股',industry:'合成同業',price:40,
    uncertainty:.3,updatedAt:'2026-10-01',valuationPolicy:'tw-comparables-v1',...quarterlyInputs(payload(options),'TWD',now)};
}
function evaluate(options) {
  const pool=Array.from({length:7},(_,i)=>row(String(2000+i),i?{}:options));
  const input={...pool[0],comparableMultiples:buildTaiwanComparableMap(pool).get('2000')};
  assert.equal(validTaiwanComparableEvidence(input),true);
  return {input,result:calculateStock(input)};
}

test('missing opening equity blocks PB average-ROE evidence without invalidating available PE earnings',()=>{
  const {input,result}=evaluate({opening:false});
  assert.equal(input.financialDataDate,end);
  assert.equal(input.financialMetrics.shareAsOfDate,end);
  assert.equal(input.financialMetrics.shareBasis,'provider-as-of-ordinary');
  assert.equal(input.financialMetrics.roeBasis,'parent-income-ending-equity');
  assert.equal(input.eps,.8);assert.equal(input.financialMetrics.netIncomePerShare,.8);
  assert.equal(input.comparableMultiples.pePeerCount,6);
  assert.ok(result.models.some(m=>m.id==='pe'));
  assert.equal(result.models.some(m=>m.id==='pb'),false);
  assert.equal(result.valuationConfidence,'low');
});

test('PE still rejects genuinely missing parent/operating profit inputs without inventing values',()=>{
  for(const options of [{net:false},{operating:false}]) {
    const {input,result}=evaluate(options);
    assert.equal(input.eps,.8);
    assert.equal(result.models.some(m=>m.id==='pe'),false);
    const issues=input.comparableMultiples.taiwanApplicabilityEvidence.models.pe.issues;
    assert.ok(issues.some(i=>i.category==='source-data'));
  }
});

test('missing provider ordinary shares is an ingestion failure, not a synthetic share-basis repair',()=>{
  assert.throws(()=>quarterlyInputs(payload({shares:false}),'TWD',now),/CORE_FINANCIAL_FIELDS_MISSING/);
});
