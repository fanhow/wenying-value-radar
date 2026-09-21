import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PB_ROE_STUDY,ROE_BUCKETS,DISCOVERY_TICKERS,ltmRoeBucket,issuerStudySplit,
  studyTaiwanPbRoe,summarizePbRoeStudy} from '../scripts/study-taiwan-pb-roe.mjs';

// Synthetic company/financial values only. No frozen market input is read.
const candidates=Array.from({length:200},(_,i)=>String(1000+i));
const trainIds=candidates.filter(t=>issuerStudySplit(t)==='train');
const holdoutIds=candidates.filter(t=>issuerStudySplit(t)==='holdout');
function record(ticker,{pb=2,roe=8,industry='Synthetic devices',...patch}={}) {
  return {ticker,market:'TW',status:'ready',stock:{ticker,name:'Synthetic issuer '+ticker,market:'TW',
    industry,sector:'Synthetic technology',price:pb*50,bvps:50,roe,dataBasis:'ltm',updatedAt:'2026-09-18',
    financialDataDate:'2026-06-30',financialMetrics:{currency:'TWD',periodBasis:'ltm',
      shareBasis:'period-end-ordinary',sharesOutstanding:1e9,roeBasis:'parent-income-average-equity'},...patch}};
}
const fixture=(trainCount=6)=>({observedAt:'2026-09-20T00:00:00Z',session:{date:'2026-09-18'},
  records:[...trainIds.slice(0,trainCount).map(t=>record(t)),record(holdoutIds[0],{pb:3})]});
const run=data=>studyTaiwanPbRoe(data);
const panel=data=>run(data).panels.primaryIndustry;
const target=data=>panel(data).rows.find(r=>r.ticker===holdoutIds[0]);

test('fixed seed, unsigned split and discovery are deterministic',()=>{
  assert.equal(PB_ROE_STUDY.seed,'wenying-pb-roe-v1|TW|');
  for(const ticker of candidates) {
    const hash=createHash('sha256').update('wenying-pb-roe-v1|TW|'+ticker).digest('hex');
    const expected=DISCOVERY_TICKERS.includes(ticker)?'discovery':Number.parseInt(hash.slice(0,8),16)%5===0?'holdout':'train';
    assert.equal(issuerStudySplit(ticker),expected);
  }
  for(const ticker of DISCOVERY_TICKERS)assert.equal(issuerStudySplit(ticker),'discovery');
  for(const ticker of ['123','12345',1234,null])assert.throws(()=>issuerStudySplit(ticker),/INVALID_ISSUER/);
});

test('LTM ROE buckets preserve negative, zero and closed upper boundaries',()=>{
  for(const [value,bucket] of [[-10,'<=0'],[0,'<=0'],[.1,'(0,5]'],[5,'(0,5]'],[5.01,'(5,10]'],[10,'(5,10]'],[10.01,'(10,15]'],[15,'(10,15]'],[15.01,'>15']])assert.equal(ltmRoeBucket(value),bucket);
  for(const value of [undefined,null,NaN,Infinity,-Infinity,'5'])assert.equal(ltmRoeBucket(value),null);
});

test('raw train PB produces both predictions and exact paired denominator',()=>{
  const data=fixture(),before=structuredClone(data),r=run(data),p=r.panels.primaryIndustry,row=p.rows[0];
  assert.deepEqual(data,before);assert.equal(r.counts.commonEligible,7);assert.equal(r.counts.train,6);assert.equal(r.counts.holdout,1);
  assert.equal(row.A.predictedPb,2);assert.equal(row.B.predictedPb,2);assert.equal(row.A.peerCount,6);
  assert.ok(Math.abs(row.A.absoluteLogError-Math.abs(Math.log(2/3)))<1e-12);
  assert.equal(row.pairedDifference,0);assert.equal(p.summary.paired.unchanged,1);
  assert.equal(p.summary.denominator,1);assert.equal(p.summary.commonCoverage,1);
  assert.equal(p.summary.paired.A.mean,row.A.absoluteLogError);
});

test('missing, null, nonfinite and string ROE never become zero observations',()=>{
  for(const value of [undefined,null,NaN,Infinity,-Infinity,'8']) {
    const data=fixture();data.records.at(-1).stock.roe=value;
    const r=run(data);assert.equal(r.counts.holdout,0);assert.equal(r.exclusionReasonCounts.INVALID_ROE,1);
  }
});

test('ending-equity and missing ROE bases are excluded instead of mixed or filled',()=>{
  for(const basis of [undefined,'parent-income-ending-equity','eps-ending-bvps']) {
    const data=fixture();data.records[0].stock.financialMetrics.roeBasis=basis;
    const r=run(data);assert.equal(r.exclusionReasonCounts.UNSUPPORTED_ROE_BASIS,1);
    assert.equal(r.panels.primaryIndustry.rows[0].A.peerCount,5);
  }
});

test('holdout and discovery issuers never enter either peer pool',()=>{
  const data=fixture();data.records.push(record(holdoutIds[1],{pb:30}),record('8213',{pb:30}),record('2451',{pb:30}));
  const r=run(data);assert.deepEqual(r.discoveryExcluded,['2451','8213']);
  assert.equal(r.counts.discovery,2);assert.equal(r.counts.holdout,2);
  for(const row of r.panels.primaryIndustry.rows)for(const arm of [row.A,row.B]) {
    assert.equal(arm.predictedPb,2);assert.deepEqual(arm.peerTickers,trainIds.slice(0,6).sort());
    assert.ok(!arm.peerTickers.includes(row.ticker));
  }
});

test('target price does not change predictions and target PB above 30 remains evaluated',()=>{
  const data=fixture(),before=target(data);data.records.at(-1).stock.price=5000;
  const after=target(data);assert.equal(after.observedPb,100);
  assert.equal(before.A.predictedPb,after.A.predictedPb);assert.equal(before.B.predictedPb,after.B.predictedPb);
  assert.notEqual(before.A.absoluteLogError,after.A.absoluteLogError);
});

test('fewer than five peers abstain without substituting an industry fallback for B',()=>{
  const data=fixture(5);data.records[0].stock.roe=12;
  const p=panel(data),row=p.rows[0];assert.equal(row.A.predictedPb,2);assert.equal(row.B.predictedPb,null);
  assert.deepEqual(row.B.reasons,['INSUFFICIENT_TRAIN_PEERS']);assert.equal(row.B.peerCount,4);
  assert.equal(p.summary.aOnly,1);assert.equal(p.summary.B.abstentionRate,1);
  assert.equal(p.summary.paired.count,0);assert.equal(p.summary.paired.A.mean,null);assert.equal(row.pairedDifference,null);
});

test('IQR uses the specified floor/ceil indices and permits equality at four',()=>{
  for(const [values,expected] of [[[1,1,1,4,4],1],[[1,1,1,4.01,4.01],null]]) {
    const data=fixture(5);values.forEach((pb,i)=>data.records[i].stock.price=pb*50);
    const row=target(data);assert.equal(row.A.predictedPb,expected);
    assert.equal(row.A.q1,1);assert.equal(row.A.q3,values.at(-1));
    if(expected===null)assert.deepEqual(row.A.reasons,['TRAIN_PB_IQR_TOO_WIDE']);
  }
});

test('B-only cases are retained when heterogeneous A fails IQR',()=>{
  const data=fixture(10);data.records.slice(5,10).forEach(r=>{r.stock.price=500;r.stock.roe=20;});
  const p=panel(data),row=p.rows[0];assert.equal(row.A.predictedPb,null);assert.equal(row.B.predictedPb,2);
  assert.equal(p.summary.bOnly,1);assert.equal(p.summary.common,0);assert.equal(p.summary.paired.B.mean,null);
});

test('train PB outside the cap is excluded, while target eligibility is separate',()=>{
  const data=fixture(6);data.records[0].stock.price=1550;
  const row=target(data);assert.equal(row.A.peerCount,5);assert.equal(row.A.invalidTrainPbCount,1);
  assert.ok(!row.A.peerTickers.includes(trainIds[0]));assert.equal(row.A.predictedPb,2);
});

test('all duplicate ticker records reject the study independent of status and order',()=>{
  for(const first of [true,false])for(const status of ['ready','unavailable']) {
    const data=fixture(),duplicate=structuredClone(data.records[0]);duplicate.status=status;
    data.records[first?'unshift':'push'](duplicate);assert.throws(()=>run(data),/DUPLICATE_ISSUER/);
  }
});

test('ready wrapper and stock identities must match',()=>{
  for(const patch of [{ticker:'9999'},{market:'US'}]) {
    const data=fixture();Object.assign(data.records[0].stock,patch);assert.throws(()=>run(data),/IDENTITY_MISMATCH/);
  }
  const data=fixture();delete data.records[0].stock;assert.throws(()=>run(data),/IDENTITY_MISMATCH/);
});

test('all record and ready counts retain unavailable and non-Taiwan exclusions',()=>{
  const data=fixture();data.records.push({ticker:'9999',market:'TW',status:'unavailable'});
  const us=record('USXX');us.market='US';us.stock.market='US';data.records.push(us);
  const r=run(data);assert.equal(r.counts.records,9);assert.equal(r.counts.ready,8);
  assert.equal(r.counts.commonEligible,7);assert.equal(r.counts.commonExcluded,2);
  assert.equal(r.exclusionReasonCounts.RECORD_NOT_READY,1);assert.equal(r.exclusionReasonCounts.NOT_TAIWAN,1);
  assert.equal(r.counts.commonEligible,r.counts.discovery+r.counts.train+r.counts.holdout);
});

test('same industry, quote date and exact financial end are independent peer gates',()=>{
  for(const patch of [{industry:'Different devices'},{updatedAt:'2026-09-17'},{financialDataDate:'2026-03-31'}]) {
    const data=fixture();Object.assign(data.records[0].stock,patch);
    const row=target(data);assert.equal(row.A.peerCount,5);assert.ok(!row.A.peerTickers.includes(trainIds[0]));
  }
});

test('invalid explicit business reference is excluded from both panels',()=>{
  for(const reference of [null,{id:'unknown',registryVersion:PB_ROE_STUDY.registryVersion},
    {id:'tw-memory-module-storage-products',registryVersion:'wrong-version'},
    {id:'tw-memory-module-storage-products',registryVersion:PB_ROE_STUDY.registryVersion}]) {
    const data=fixture();data.records[0].stock.taiwanBusinessGroup=reference;
    const r=run(data);assert.equal(r.exclusionReasonCounts.INVALID_EXPLICIT_BUSINESS_GROUP,1);
    assert.equal(r.panels.primaryIndustry.rows[0].A.peerCount,5);
  }
});

test('secondary panel retains empty registered groups and never falls back to industry',()=>{
  const data=fixture();data.records.push(record('2451'),record('3135'));
  for(const r of data.records)r.stock.industry='tw-memory-module-storage-products';
  const r=run(data),p=r.panels.secondaryBusinessGroup;
  assert.equal(p.counts.eligible,0);assert.equal(p.counts.excluded,7);assert.equal(p.summary.denominator,0);
  assert.equal(p.summary.A.coverage,null);assert.equal(p.summary.paired.A.mean,null);
  assert.deepEqual(p.rows,[]);assert.equal(p.byGroup[0].groupKey,'business:tw-memory-module-storage-products');
  assert.equal(p.byGroup[0].eligible,0);
  assert.equal(r.panels.primaryIndustry.byGroup[0].groupKey,'industry:tw-memory-module-storage-products');
});

test('record order does not affect split, rows, peers, exclusions or summary',()=>{
  const data=fixture(10);data.records.push(record('8213'),{ticker:'9999',market:'TW',status:'unavailable'});
  const before=run(data);data.records.reverse();assert.deepEqual(run(data),before);
});

test('zero and negative ROE are eligible, counted separately and all buckets reported',()=>{
  const data=fixture();data.records.forEach(r=>r.stock.roe=-3);data.records.at(-1).stock.roe=0;
  data.records.push(record(holdoutIds[1],{roe:-2}));const p=panel(data);
  assert.deepEqual(p.byRoeBucket.map(r=>r.roeBucket),[...ROE_BUCKETS]);
  assert.deepEqual(p.byRoeBucket[0].nonPositiveRoe,{zero:1,negative:1});
  assert.equal(p.byRoeBucket[0].denominator,2);assert.equal(p.byRoeBucket[0].paired.count,2);
  assert.equal(p.byRoeBucket[1].paired.A.mean,null);
});

test('common qualifications reject wrong currency, basis, date, cap, book and financial sector',()=>{
  const mutations=[
    [s=>s.financialMetrics.currency='USD','NOT_TWD'],[s=>s.dataBasis='annual','NOT_LTM'],
    [s=>s.financialMetrics.shareBasis='diluted-average','NOT_PERIOD_END_ORDINARY_SHARES'],
    [s=>s.updatedAt='2026-02-31','INVALID_QUOTE_OR_FINANCIAL_DATE'],
    [s=>s.financialDataDate='2026-09-19','FINANCIAL_AGE_OUTSIDE_0_180_DAYS'],
    [s=>s.financialDataDate='2025-12-31','FINANCIAL_AGE_OUTSIDE_0_180_DAYS'],
    [s=>s.price=0,'INVALID_PRICE'],[s=>s.financialMetrics.sharesOutstanding=null,'INVALID_SHARES'],
    [s=>s.financialMetrics.sharesOutstanding=1,'MARKET_CAP_BELOW_1B_TWD'],
    [s=>s.bvps=0,'INVALID_BVPS'],[s=>s.industry=' ','INVALID_INDUSTRY'],
    [s=>s.name='Synthetic Bank','FINANCIAL_COMPANY'],
  ];
  for(const [mutate,reason] of mutations) {
    const data=fixture();mutate(data.records[0].stock);const r=run(data);
    assert.ok(r.excluded.some(row=>row.reasons.includes(reason)),reason);
    assert.equal(r.counts.commonEligible,6,reason);
  }
});

test('forbidden valuation anchors and EPS histories do not influence either panel',()=>{
  const data=fixture(),before=run(data);
  for(const r of data.records)Object.assign(r.stock,{eps:999,targetPb:999,targetPe:999,
    comparableMultiples:{pbMedian:999},current:{fairValue:999},candidate:{fairValue:999},
    externalFairValue:999,epsHistory:[{end:'2030-12-31',value:999}]});
  assert.deepEqual(run(data),before);
});

test('different holdout coverage cells reconcile and only paired errors share a denominator',()=>{
  const data=fixture(10);
  data.records.slice(5,10).forEach(r=>{r.stock.price=150;r.stock.roe=12;});
  data.records.at(-1).stock.price=100;
  data.records.push(record(holdoutIds[1],{pb:2,roe:20}),record(holdoutIds[2],{pb:2,industry:'No training peers'}));
  const p=panel(data),s=p.summary;
  assert.equal(s.denominator,3);assert.equal(s.common,1);assert.equal(s.aOnly,1);assert.equal(s.neither,1);
  assert.equal(s.A.count,2);assert.equal(s.B.count,1);assert.equal(s.paired.count,1);
  assert.equal(s.paired.improved,1);assert.equal(s.paired.B.mean,0);
  assert.equal(s.common+s.aOnly+s.bOnly+s.neither,s.denominator);
  assert.equal(p.byGroup.find(g=>g.groupKey==='industry:No training peers').denominator,1);
});

test('paired improvement and worsening are both retained with the same error denominator',()=>{
  const data=fixture(10);data.records.slice(5,10).forEach(r=>{r.stock.price=200;r.stock.roe=12;});
  data.records.at(-1).stock.price=100;
  data.records.push(record(holdoutIds[1],{pb:3}));
  const p=panel(data),s=p.summary;
  assert.equal(s.paired.count,2);assert.equal(s.paired.improved,1);assert.equal(s.paired.worsened,1);
  assert.equal(s.paired.unchanged,0);
  for(const arm of ['A','B'])assert.ok(Math.abs(s.paired[arm].mean-Math.log(1.5)/2)<1e-12);
  assert.ok(Math.abs(s.paired.difference.mean)<1e-12);
});

test('empty input yields null rates/errors and explicit empty panels',()=>{
  const r=run({records:[]});assert.equal(r.counts.records,0);
  for(const p of Object.values(r.panels)) {
    assert.equal(p.summary.denominator,0);assert.equal(p.summary.A.coverage,null);
    assert.equal(p.summary.paired.A.mean,null);assert.equal(p.summary.paired.difference.mean,null);
  }
  assert.throws(()=>run({}),/INVALID_RECORDS/);
});

test('log-domain error survives unrepresentable target PB without dropping the holdout',()=>{
  const data=fixture();Object.assign(data.records.at(-1).stock,{price:1e308,bvps:1e-308});
  const row=target(data);assert.equal(row.observedPb,null);assert.equal(row.observedPbRepresentable,false);
  assert.ok(Number.isFinite(row.observedLogPb));assert.ok(Number.isFinite(row.A.absoluteLogError));
  assert.ok(Number.isFinite(row.pairedDifference));assert.doesNotMatch(JSON.stringify(panel(data)),/Infinity|NaN/);
});

test('subnormal positive peer PB survives median and all paired statistics serialize as finite values',()=>{
  const data=fixture(5);
  for(const r of data.records.slice(0,5)) {
    Object.assign(r.stock,{price:1e-100,bvps:2e223});
    r.stock.financialMetrics.sharesOutstanding=1e110;
    assert.equal(r.stock.price/r.stock.bvps,Number.MIN_VALUE);
  }
  const p=panel(data),row=p.rows[0];
  for(const arm of [row.A,row.B]) {
    assert.equal(arm.predictedPb,Number.MIN_VALUE);assert.ok(arm.predictedPb>0);
    assert.ok(Number.isFinite(arm.absoluteLogError));assert.equal(arm.status,'predicted');
  }
  assert.ok(Number.isFinite(row.pairedDifference));assert.equal(row.pairedDifference,0);
  const paired=p.summary.paired;
  assert.equal(paired.count,paired.improved+paired.worsened+paired.unchanged);
  for(const value of [paired.A.mean,paired.A.median,paired.B.mean,paired.B.median,
    paired.difference.mean,paired.difference.median])assert.ok(Number.isFinite(value));
  const serialized=JSON.parse(JSON.stringify(p));
  assert.deepEqual(serialized,p);
  assert.ok(serialized.rows[0].A.predictedPb>0);
  assert.ok(Number.isFinite(serialized.summary.paired.A.mean));
});

test('summary omits issuer details while preserving all group/bucket coverage and paired statistics',()=>{
  const r=run(fixture()),s=summarizePbRoeStudy(r);
  assert.deepEqual(s.counts,r.counts);assert.deepEqual(s.panels.primaryIndustry.summary,r.panels.primaryIndustry.summary);
  assert.deepEqual(s.panels.primaryIndustry.byGroup,r.panels.primaryIndustry.byGroup);
  assert.deepEqual(s.panels.primaryIndustry.byRoeBucket,r.panels.primaryIndustry.byRoeBucket);
  assert.equal(s.panels.primaryIndustry.rows,undefined);assert.equal(s.excluded,undefined);
  assert.equal(r.panels.primaryIndustry.rows.length,1);
});
