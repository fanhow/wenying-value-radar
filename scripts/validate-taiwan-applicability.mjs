// Fixed offline applicability validation. No network, credentials or production writes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildTaiwanComparableMap} from '../lib/taiwan-comparables.ts';
import {calculateStock} from '../lib/valuation.ts';
import {valuationRankingState} from '../lib/daily-valuation-state.ts';
import {taiwanPerShareIssue} from '../lib/daily-refresh-data.ts';

export const VALIDATION_PROTOCOL=Object.freeze({
  version:'taiwan-applicability-validation-20261002-v2',
  seed:'wenying-applicability-engineering-v1|',
  syntheticIssuerCount:1100,
  quoteDates:['2026-09-18','2026-10-01'],
  financialDate:'2026-06-30',
  profitabilityRatioLimit:2,
  minimumPeers:5,
  maximumIqrRatio:4,
  studyPurpose:'Engineering invariants and abstention coverage, not real fair-value accuracy.',
});
const IDS=['pe','pb','p-sales','ev-revenue','ev-ebitda','ev-ebit'];
const FIELDS={pe:['peMedian','pePeerCount'],pb:['pbMedian','pbPeerCount'],
  'p-sales':['psMedian','psPeerCount'],'ev-revenue':['evRevenueMedian','evRevenuePeerCount'],
  'ev-ebitda':['evEbitdaMedian','evEbitdaPeerCount'],'ev-ebit':['evEbitMedian','evEbitPeerCount']};
const CAPS={pe:300,pb:30,'p-sales':50,'ev-revenue':50,'ev-ebitda':100,'ev-ebit':100};
const sha=v=>createHash('sha256').update(v).digest('hex');
const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)
  &&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const sortedMap=map=>[...map].sort(([a],[b])=>a.localeCompare(b));
const compatible=(a,b)=>positive(a)&&positive(b)&&b/a>=.5&&b/a<=2;
export const validationIssuerSplit=ticker=>Number.parseInt(sha(VALIDATION_PROTOCOL.seed+ticker).slice(0,8),16)%5===0?'holdout':'train';

/** Explicitly synthetic, with predetermined missing/unsupported input branches. */
export function syntheticApplicabilityStocks(quoteDate=VALIDATION_PROTOCOL.quoteDates[0]) {
  assert.ok(VALIDATION_PROTOCOL.quoteDates.includes(quoteDate));
  return Array.from({length:VALIDATION_PROTOCOL.syntheticIssuerCount},(_,i)=>{
    const ticker=String(1000+i),roe=[3,7,12,22][i%4],bvps=20+(i%11),sps=80+(i%13);
    const net=roe*bvps/100,price=bvps*(.5+roe/15)*(1+(i%7)/100)
      *(quoteDate===VALIDATION_PROTOCOL.quoteDates[1]?1.03+(i%3)/100:1);
    return {ticker,name:'合成驗證 '+ticker,market:'TW',sector:'合成資料',industry:'驗證產業 '+String(Math.floor(i/50)).padStart(2,'0'),listingBoard:'TWSE',
      price,eps:net,bvps,revenuePerShare:sps,fcfPerShare:1.5,ebitPerShare:i%41===0?-.5:net*1.3,ebitdaPerShare:net*1.3+1,
      cashPerShare:3,debtPerShare:4,revenueGrowth:4,roe,debtRatio:30,targetPe:15,targetPb:1.5,targetFcfMultiple:15,
      netMargin:net/sps*100,netMarginUnit:'percent',uncertainty:.25,dataBasis:'ltm',dataCompleteness:'historical',qualityAvailable:i%53!==0,
      financialDataDate:VALIDATION_PROTOCOL.financialDate,updatedAt:quoteDate,priceSource:'Yahoo Finance daily close / daily-refresh-v1',
      sourceNote:'Synthetic engineering fixture; never a real issuer quote or financial statement.',
      financialMetrics:{currency:'TWD',periodBasis:'ltm',shareBasis:'provider-as-of-ordinary',
        shareAsOfDate:VALIDATION_PROTOCOL.financialDate,shareSourceField:'quarterlyOrdinarySharesNumber',sharesOutstanding:1e8,
        roeBasis:i%37===0?'parent-income-ending-equity':'parent-income-average-equity',growthBasis:'ttm-yoy',
        netIncomePerShare:i%43===0?undefined:net,nonControllingBookPerShare:i%47===0?undefined:0,
        ebitdaBasis:'operating-income-plus-cashflow-da'},};
  });
}

/** Independent checks against emitted observations, rather than calling the matching helper. */
export function assertObservationContract(stock,peers,allowedTickers) {
  if(!peers)return 0;
  const evidence=peers.taiwanApplicabilityEvidence;
  assert.ok(evidence,'Versioned observations are required');
  assert.equal(evidence.profitabilityRatioLimit,VALIDATION_PROTOCOL.profitabilityRatioLimit);
  assert.equal(peers.quoteDate,stock.updatedAt);
  assert.equal(evidence.target.financialDate,stock.financialDataDate);
  assert.equal(evidence.target.shareBasis,stock.financialMetrics.shareBasis);
  let checked=0;
  for(const id of IDS) {
    const model=evidence.models[id],observations=model.observations;
    const [valueField,countField]=FIELDS[id];
    assert.equal(peers[countField],observations.length);
    assert.equal(new Set(observations.map(o=>o.ticker)).size,observations.length);
    assert.deepEqual(observations.map(o=>o.ticker),observations.map(o=>o.ticker).toSorted());
    for(const o of observations) {
      assert.notEqual(o.ticker,stock.ticker,'Self must never be an observation');
      assert.ok(!allowedTickers||allowedTickers.has(o.ticker),'Held-out peer leakage');
      assert.ok(positive(o.value)&&o.value<=CAPS[id]);
      assert.equal(o.profile.financialDate,evidence.target.financialDate);
      assert.equal(o.profile.shareBasis,evidence.target.shareBasis);
      assert.equal(o.profile.financial,evidence.target.financial);
      if(!o.profile.financial)assert.ok(positive(o.profile.operatingMargin)&&positive(evidence.target.operatingMargin));
      if(id==='pb') {
        assert.equal(o.profile.roeBasis,'parent-income-average-equity');
        assert.equal(evidence.target.roeBasis,'parent-income-average-equity');
        assert.ok(compatible(evidence.target.roe,o.profile.roe));
      }
      if((id==='pe'&&!o.profile.financial)||id==='p-sales') {
        assert.ok(compatible(evidence.target.netMargin,o.profile.netMargin));
        assert.ok(compatible(evidence.target.operatingMargin,o.profile.operatingMargin));
      }
      if(id==='p-sales') {
        for(const p of [evidence.target,o.profile])assert.ok(typeof p.minorityBookRatio==='number'&&p.minorityBookRatio>=0&&p.minorityBookRatio<=.25);
      }
      if(id==='ev-revenue')assert.ok(compatible(evidence.target.operatingMargin,o.profile.operatingMargin));
      checked++;
    }
    if(peers[valueField]!==null&&peers[valueField]!==undefined) {
      assert.ok(observations.length>=VALIDATION_PROTOCOL.minimumPeers);
      assert.equal(model.issues.length,0);
      const values=observations.map(o=>o.value).toSorted((a,b)=>a-b),n=values.length;
      assert.ok(values[Math.ceil((n-1)*.75)]/values[Math.floor((n-1)*.25)]<=VALIDATION_PROTOCOL.maximumIqrRatio);
      assert.equal(peers[valueField],values[Math.floor((n-1)/2)]/2+values[Math.floor(n/2)]/2);
    } else assert.ok(model.issues.length>0,'An unavailable multiple must disclose a reason');
  }
  return checked;
}
function outcome(stock,peers) {
  const calculated=calculateStock({...stock,comparableMultiples:peers,valuationPolicy:'tw-comparables-v1'});
  const ranking=valuationRankingState(calculated);
  assert.ok(!(calculated.valuationConfidence==='low'||calculated.calibrationConfidence==='low')||!ranking.rankingEligible);
  assert.ok(!calculated.valuationReviewRequired||!ranking.rankingEligible);
  if(!ranking.rankingEligible)assert.equal(ranking.upside,null);
  return {ticker:stock.ticker,name:stock.name,quoteDate:stock.updatedAt,financialDate:stock.financialDataDate,
    modelIds:calculated.models.map(m=>m.id),estimatedFairValue:ranking.estimatedFairValue,
    confidence:calculated.valuationConfidence,calibrationConfidence:calculated.calibrationConfidence,
    reviewRequired:calculated.valuationReviewRequired===true,rankingEligible:ranking.rankingEligible,rankingIssues:ranking.issues,
    modelIssues:peers?Object.fromEntries(IDS.map(id=>[id,peers.taiwanApplicabilityEvidence.models[id].issues.map(issue=>issue.code)])):{},
    matchedPeerCounts:peers?Object.fromEntries(IDS.map(id=>[id,peers[FIELDS[id][1]]])):{}};
}
function summarize(rows) {
  const issueCounts={};
  for(const row of rows)for(const [id,codes] of Object.entries(row.modelIssues))for(const code of codes) {
    const key=id+':'+code;issueCounts[key]=(issueCounts[key]??0)+1;
  }
  return {targets:rows.length,calculable:rows.filter(r=>r.estimatedFairValue!==null).length,
    rankingEligible:rows.filter(r=>r.rankingEligible).length,
    reviewRequired:rows.filter(r=>r.reviewRequired).length,
    confidenceCounts:Object.fromEntries(['high','medium','low'].map(c=>[c,rows.filter(r=>r.confidence===c).length])),
    modelCoverage:Object.fromEntries(IDS.map(id=>[id,rows.filter(r=>r.modelIds.includes(id)).length])),
    issueCounts,limitations:'Counts measure engineering coverage/abstention; they do not establish valuation accuracy.'};
}

export function validateSyntheticApplicability() {
  const panels=[];
  let observationsChecked=0;
  for(const date of VALIDATION_PROTOCOL.quoteDates) {
    const stocks=syntheticApplicabilityStocks(date),before=JSON.stringify(stocks);
    const train=stocks.filter(s=>validationIssuerSplit(s.ticker)==='train'),holdout=stocks.filter(s=>validationIssuerSplit(s.ticker)==='holdout');
    const allowed=new Set(train.map(s=>s.ticker)),rows=[];
    const map=buildTaiwanComparableMap(stocks);
    assert.deepEqual(sortedMap(map),sortedMap(buildTaiwanComparableMap(stocks.toReversed())),'Input order must not change evidence');
    for(const target of holdout) {
      const cohort=[...train.filter(s=>s.industry===target.industry),target];
      const peers=buildTaiwanComparableMap(cohort).get(target.ticker);
      observationsChecked+=assertObservationContract(target,peers,allowed);
      rows.push(outcome(target,peers));
    }
    assert.equal(JSON.stringify(stocks),before,'Validation must preserve source inputs');
    panels.push({quoteDate:date,synthetic:true,train:train.length,holdout:holdout.length,summary:summarize(rows)});
  }
  const stocks=syntheticApplicabilityStocks(),target=stocks[12],cohort=stocks.filter(s=>s.industry===target.industry);
  const intrusions=[
    {...stocks[13],ticker:'9000',updatedAt:'2026-09-17'},
    {...stocks[13],ticker:'9001',financialDataDate:'2026-03-31',financialMetrics:{...stocks[13].financialMetrics,shareAsOfDate:'2026-03-31'}},
    {...stocks[13],ticker:'9002',financialMetrics:{...stocks[13].financialMetrics,shareBasis:'period-end-ordinary',shareAsOfDate:undefined,shareSourceField:undefined}},
  ];
  const a=buildTaiwanComparableMap(cohort).get(target.ticker),b=buildTaiwanComparableMap([...cohort,...intrusions]).get(target.ticker);
  assert.deepEqual(a.taiwanApplicabilityEvidence,b.taiwanApplicabilityEvidence,'Cross-session/cutoff/share-basis observations must be excluded');
  assertObservationContract(target,b,new Set(cohort.filter(s=>s.ticker!==target.ticker).map(s=>s.ticker)));
  const insufficient=buildTaiwanComparableMap([target,...cohort.filter(s=>s.ticker!==target.ticker).slice(0,4)]).get(target.ticker);
  assert.ok(insufficient,'Abstention should retain its diagnostic evidence');
  for(const id of IDS) {
    assert.equal(insufficient[FIELDS[id][0]],null,'A pool with fewer than five candidate peers must abstain');
    assert.ok(insufficient.taiwanApplicabilityEvidence.models[id].issues.some(i=>i.code==='INSUFFICIENT_MATCHED_PEERS'));
  }
  assert.equal(outcome(target,insufficient).estimatedFairValue,null);
  const unidentified=structuredClone(target);delete unidentified.financialMetrics.shareAsOfDate;
  assert.equal(buildTaiwanComparableMap([...cohort.filter(s=>s.ticker!==target.ticker),unidentified]).has(target.ticker),false);
  const captureContracts=validateSyntheticCaptureContracts();
  return {status:'PASS',synthetic:true,fixtureSha256:sha(JSON.stringify(syntheticApplicabilityStocks())),observationsChecked,
    checks:['reversed-order invariance','immutable input','self/issuer holdout exclusion','same quote/financial/share-basis isolation',
      'five-peer abstention','missing provider share metadata abstention','low-confidence/review ranking exclusion'],captureContracts,panels};
}

function validateSyntheticCaptureContracts() {
  const stocks=syntheticApplicabilityStocks().slice(0,50),date=VALIDATION_PROTOCOL.quoteDates[0];
  const capture={observedAt:'2026-10-02T00:00:00.000Z',session:{date},records:stocks.map(stock=>({
    ticker:stock.ticker,market:'TW',status:'ready',issues:[],quoteDate:date,financialDate:stock.financialDataDate,stock}))};
  const baseline=validateFrozenApplicability(capture,date);
  assert.equal(baseline.taiwanRecords,50);
  const mutations=[
    c=>{c.session.date='2026-10-01';},c=>{c.records[0].quoteDate='2026-10-01';},
    c=>{c.records[0].stock.updatedAt='2026-10-01';},c=>{c.records[0].financialDate='2026-03-31';},
    c=>{delete c.records[0].stock.financialMetrics.shareBasis;},c=>{c.records.push(c.records[0]);},
    c=>{c.observedAt='2026-01-01T00:00:00.000Z';},c=>{c.records=[];},
  ];
  for(const mutate of mutations) {const invalid=structuredClone(capture);mutate(invalid);assert.throws(()=>validateFrozenApplicability(invalid,date));}
  assert.throws(()=>validateFrozenApplicability(capture,'2026-10-01'));
  return {status:'PASS',synthetic:true,validCaptureRecords:50,rejectedSourceContractMutations:9,
    interpretation:'Synthetic schema/identity tests only; no real frozen source is supplied.'};
}

export function validateFrozenApplicability(input,expectedDate) {
  assert.ok(validDate(expectedDate),'An exact expected quote date is required');
  assert.ok(Array.isArray(input?.records)&&input.records.length>0,'Frozen capture must contain records');
  assert.equal(input.session?.date,expectedDate,'Frozen session must match the exact expected date');
  assert.ok(typeof input.observedAt==='string'&&Number.isFinite(Date.parse(input.observedAt))
    &&new Date(input.observedAt).toISOString()===input.observedAt&&input.observedAt.slice(0,10)>=expectedDate,'Original capture observation time is required');
  const seen=new Set(),stocks=[],excluded=[];
  for(const record of input.records) {
    if(record.market!=='TW')continue;
    assert.ok(!seen.has(record.ticker),'Duplicate Taiwan record');seen.add(record.ticker);
    if(record.status!=='ready') {excluded.push({ticker:record.ticker,reason:'RECORD_NOT_READY',issues:record.issues??[]});continue;}
    const stock=record.stock;
    assert.equal(stock?.market,'TW');assert.equal(stock?.ticker,record.ticker);
    assert.equal(record.quoteDate,expectedDate);assert.equal(stock.updatedAt,expectedDate);
    assert.equal(record.financialDate,stock.financialDataDate);
    assert.ok(validDate(stock.financialDataDate));
    assert.ok(stock.financialMetrics?.shareBasis,'Original share-basis metadata is required; never add it during replay');
    const issue=taiwanPerShareIssue(stock);
    if(issue)excluded.push({ticker:record.ticker,reason:issue});else stocks.push(stock);
  }
  const before=JSON.stringify(input),map=buildTaiwanComparableMap(stocks),allowed=new Set(stocks.map(s=>s.ticker));
  assert.ok(seen.size>0,'Frozen capture contains no Taiwan records');
  let observationsChecked=0;
  const rows=stocks.map(stock=>{const peers=map.get(stock.ticker);observationsChecked+=assertObservationContract(stock,peers,allowed);return outcome(stock,peers);});
  assert.equal(JSON.stringify(input),before);
  return {status:'PASS',synthetic:false,quoteDate:expectedDate,records:input.records.length,taiwanRecords:seen.size,
    observationsChecked,summary:summarize(rows),excluded,rows,
    universeCoverage:'UNVERIFIED: input record count alone does not prove a complete exchange universe.',
    interpretation:'Frozen source replay only; no future returns, external target matching, or point-in-time availability proof.'};
}

async function main(args) {
  const options={};
  for(let i=0;i<args.length;i+=2) {
    if(!['--input','--expected-date','--out'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Usage: [--input FROZEN_INPUTS.json --expected-date YYYY-MM-DD] [--out NEW_RESULT.json]');
    options[args[i]]=args[i+1];
  }
  if(!!options['--input']!==!!options['--expected-date'])throw new Error('INPUT_AND_EXACT_DATE_REQUIRED_TOGETHER');
  const result={protocol:VALIDATION_PROTOCOL,synthetic:validateSyntheticApplicability(),
    realData:{status:'NOT_RUN',reason:'No complete frozen capture supplied. Local legacy quote/selection snapshots cannot substitute for 2026-10-01 inputs.'}};
  if(options['--input']) {
    try {
      const bytes=await readFile(resolve(options['--input']));
      result.realData={...validateFrozenApplicability(JSON.parse(bytes.toString('utf8')),options['--expected-date']),inputPath:resolve(options['--input']),inputSha256:sha(bytes)};
    } catch(error) {
      if(error.code!=='ENOENT')throw error;
      result.realData={status:'NOT_RUN',reason:'FROZEN_CAPTURE_NOT_FOUND',inputPath:resolve(options['--input']),expectedDate:options['--expected-date']};
    }
  }
  const modelFiles=['lib/taiwan-comparables.ts','lib/taiwan-multiple-applicability.ts','lib/valuation.ts','lib/daily-valuation-state.ts'];
  result.modelHashes=Object.fromEntries(await Promise.all(modelFiles.map(async p=>[p,sha(await readFile(new URL('../'+p,import.meta.url)))])));
  const serialized=JSON.stringify(result,null,2)+'\n';
  if(options['--out'])await writeFile(resolve(options['--out']),serialized,{flag:'wx'});
  process.stdout.write(JSON.stringify({protocol:result.protocol.version,synthetic:result.synthetic,realData:{...result.realData,rows:undefined},
    outputPath:options['--out']?resolve(options['--out']):null,outputSha256:sha(serialized)},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
