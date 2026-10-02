import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTaiwanComparableMap,validTaiwanComparableEvidence} from '../lib/taiwan-comparables.ts';
import {calculateStock} from '../lib/valuation.ts';
import {summarizeTaiwanMultiple,taiwanApplicabilityProfile} from '../lib/taiwan-multiple-applicability.ts';

// Synthetic inputs exercise rule boundaries; they are not captured quotations.
const row=(ticker,patch={})=>({ticker,name:'測試製造商',market:'TW',sector:'台股',industry:'電子零組件業',
  price:100,eps:5,bvps:40,fcfPerShare:2,revenuePerShare:100,ebitPerShare:8,
  targetPe:99,targetPb:99,targetFcfMultiple:99,roe:10,revenueGrowth:5,debtRatio:40,uncertainty:.3,
  updatedAt:'2026-10-01',financialDataDate:'2026-06-30',dataBasis:'ltm',dataCompleteness:'historical',
  valuationPolicy:'tw-comparables-v1',qualityAvailable:true,
  financialMetrics:{currency:'TWD',periodBasis:'ltm',shareBasis:'provider-as-of-ordinary',shareAsOfDate:'2026-06-30',
    shareSourceField:'quarterlyOrdinarySharesNumber',roeBasis:'parent-income-average-equity',growthBasis:'ttm-yoy',
    sharesOutstanding:1e8,netIncomePerShare:5,nonControllingBookPerShare:0},...patch});
const rows=()=>Array.from({length:8},(_,i)=>row(String(1000+i),{price:100+i}));
const input=(r,p)=>({...r,comparableMultiples:p});
const clone=v=>structuredClone(v);

test('low-profitability targets never receive unmatched high-profitability industry PB',()=>{
  const pool=rows();pool[0].roe=2;
  const p=buildTaiwanComparableMap(pool).get('1000');
  assert.equal(p.pbMedian,null);assert.equal(p.pbPeerCount,0);
  assert.ok(p.peMedian>0);assert.equal(p.psPeerCount,7);
  assert.ok(p.taiwanApplicabilityEvidence.models.pb.issues.some(i=>i.code==='INSUFFICIENT_MATCHED_PEERS'));
  assert.equal(validTaiwanComparableEvidence(input(pool[0],p)),true);
  const s=calculateStock(input(pool[0],p));
  assert.deepEqual(s.models.map(m=>m.id),['pe','p-sales']);
  assert.equal(s.valuationReviewRequired,true);
  assert.match(s.excludedModels.find(m=>m.id==='pb').reason,/少於 5/);
});

test('ROE is an applicability check with fixed factor-two boundaries, not a PB discount',()=>{
  for(const [roe,applicable] of [[5,true],[20,true],[4.999,false],[20.001,false]]) {
    const pool=rows().map((r,i)=>i?{...r,roe}:r),p=buildTaiwanComparableMap(pool).get('1000');
    assert.equal(p.pbPeerCount,applicable?7:0);
    assert.equal(p.pbMedian,applicable?104/40:null);
  }
});

test('missing, zero, negative, nonfinite and wrong-basis ROE fail closed',()=>{
  for(const roe of [undefined,null,0,-2,NaN,Infinity]) {
    const pool=rows();pool[0].roe=roe;
    const p=buildTaiwanComparableMap(pool).get('1000');
    assert.equal(p.pbMedian,null);assert.ok(p.peMedian>0);
    assert.ok(p.taiwanApplicabilityEvidence.models.pb.issues.some(i=>i.code==='PROFITABILITY_BASIS_UNAVAILABLE'));
  }
  for(const basis of ['parent-income-ending-equity','eps-ending-bvps',undefined]) {
    const pool=rows();pool[0].financialMetrics.roeBasis=basis;
    assert.equal(buildTaiwanComparableMap(pool).get('1000').pbMedian,null);
  }
});

test('PE cannot borrow net/operating margins from a dissimilar business',()=>{
  const pool=rows().map((r,i)=>i?{...r,ebitPerShare:40,financialMetrics:{...r.financialMetrics,netIncomePerShare:25}}:r);
  const p=buildTaiwanComparableMap(pool).get('1000');
  assert.equal(p.peMedian,null);assert.equal(p.psMedian,null);assert.ok(p.pbMedian>0);
});

test('same industry and quote date cannot override financial cutoff or share-basis mismatch',()=>{
  const pool=rows();
  pool[6].financialDataDate='2026-03-31';pool[6].financialMetrics.shareAsOfDate='2026-03-31';
  pool[7].financialMetrics={...pool[7].financialMetrics,shareBasis:'period-end-ordinary',shareAsOfDate:undefined,shareSourceField:undefined};
  const p=buildTaiwanComparableMap(pool).get('1000');assert.equal(p.peerCount,5);
  assert.deepEqual(p.peerTickers,['1001','1002','1003','1004','1005']);
  assert.equal(p.pbPeerCount,5);
});

test('unknown or material NCI never becomes zero in sales applicability',()=>{
  for(const nci of [undefined,null,NaN,-1,10.001]) {
    const pool=rows();pool[0].financialMetrics.nonControllingBookPerShare=nci;
    const p=buildTaiwanComparableMap(pool).get('1000');
    assert.equal(p.psMedian,null);assert.ok(p.pbMedian>0);
    assert.ok(p.taiwanApplicabilityEvidence.models['p-sales'].issues.some(i=>i.code==='MINORITY_SCOPE_UNVERIFIED'));
  }
  const pool=rows();pool[0].financialMetrics.nonControllingBookPerShare=10;
  assert.ok(buildTaiwanComparableMap(pool).get('1000').psMedian>0);
});

test('positive book and net income cannot wash out a nonfinancial operating loss',()=>{
  const pool=rows();pool[0].ebitPerShare=-1;
  const p=buildTaiwanComparableMap(pool).get('1000');
  for(const k of ['peMedian','pbMedian','psMedian'])assert.equal(p[k],null);
});

test('evidence binds target profitability, peer observations, median, counts and issue decisions',()=>{
  const pool=rows(),p=buildTaiwanComparableMap(pool).get('1000');
  assert.equal(validTaiwanComparableEvidence(input(pool[0],p)),true);
  assert.equal(validTaiwanComparableEvidence(input({...pool[0],roe:1},p)),false);
  for(const mutate of [
    q=>{q.pbMedian=99;},q=>{q.pbPeerCount--;},q=>{q.taiwanApplicabilityEvidence.version='old';},
    q=>{q.financialDateRange=['2026-09-18','2026-09-18'];},
    q=>{q.taiwanApplicabilityEvidence.models.pb.observations[0].profile.roe=100;},
    q=>{q.taiwanApplicabilityEvidence.models.pb.observations[0].profile.financialDate='2026-03-31';},
    q=>{q.taiwanApplicabilityEvidence.models.pb.observations[0].profile.roeBasis='eps-ending-bvps';},
    q=>{q.taiwanApplicabilityEvidence.models.pb.observations[0].profile.minorityBookRatio=undefined;},
    q=>{q.taiwanApplicabilityEvidence.models.pb.observations[0].profile.minorityBookRatio=-1;},
    q=>{q.taiwanApplicabilityEvidence.models.pb.observations=q.taiwanApplicabilityEvidence.models.pb.observations.slice(0,4);q.taiwanApplicabilityEvidence.models.pb.observations.length=5;q.pbPeerCount=5;q.pbMedian=103/40;},
    q=>{q.taiwanApplicabilityEvidence.models.pb.observations.forEach(o=>{o.value=20;});q.pbMedian=20;},
    q=>{q.taiwanApplicabilityEvidence.models.pb.observations[0].ticker='9999';},
    q=>{q.taiwanApplicabilityEvidence.models.pb.issues=[{code:'x',reason:'forged'}];},
  ]) {
    const q=clone(p);mutate(q);assert.equal(validTaiwanComparableEvidence(input(pool[0],q)),false);
  }
});

test('duplicate economic conflicts cannot be selected by order and JSON evidence survives round trip',()=>{
  const pool=rows(),conflict={...pool[7],roe:30};
  const a=buildTaiwanComparableMap([...pool,conflict]),b=buildTaiwanComparableMap([conflict,...pool].reverse());
  assert.deepEqual(a.get('1000'),b.get('1000'));assert.equal(a.has('1007'),false);
  assert.equal(validTaiwanComparableEvidence(input(pool[0],JSON.parse(JSON.stringify(a.get('1000'))))),true);
});

test('target price and target multiples do not select or discount peer observations',()=>{
  const pool=rows(),before=buildTaiwanComparableMap(pool).get('1000');
  pool[0]={...pool[0],price:1000,targetPe:1,targetPb:1};
  const after=buildTaiwanComparableMap(pool).get('1000');
  assert.deepEqual(after,before);
});

test('a small valid candidate pool retains exclusion evidence without inventing a model',()=>{
  const pool=rows().slice(0,5),p=buildTaiwanComparableMap(pool).get('1000');
  assert.equal(validTaiwanComparableEvidence(input(pool[0],p)),true);
  assert.equal(p.pbPeerCount,4);assert.equal(p.pbMedian,null);
  const s=calculateStock(input(pool[0],p));assert.equal(s.models.length,0);assert.equal(s.modelDispersion,null);
  assert.equal(s.upside,0);
});

test('subnormal positive observations retain a positive median without rounding to zero',()=>{
  const profile=taiwanApplicabilityProfile(row('1000'));
  const observations=Array.from({length:5},(_,i)=>({ticker:String(1001+i),value:Number.MIN_VALUE,numerator:Number.MIN_VALUE,denominator:1,profile}));
  assert.equal(summarizeTaiwanMultiple('pb',profile,observations).value,Number.MIN_VALUE);
  observations.length=6;
  assert.equal(summarizeTaiwanMultiple('pb',profile,observations).value,null);
});
