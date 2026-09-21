// Frozen, research-only issuer holdout study. No network, writes, or engine calls.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {isFinancialCompany} from '../lib/company-classification.ts';
import {
  TAIWAN_BUSINESS_GROUPS, TAIWAN_BUSINESS_REGISTRY_VERSION,
  validTaiwanBusinessGroupReference, withTaiwanBusinessGroup,
} from '../lib/taiwan-business-groups.ts';

export const PB_ROE_STUDY = Object.freeze({
  id:'wenying-pb-roe-v1',
  inputPath:'outputs/taiwan-model-audit/operating-v2/inputs.json',
  inputSha256:'43c2bca489c504ededead8c4f25f0b560d8b78a609537e85eb2184ef4b905c1a',
  protocolPath:'docs/taiwan-pb-roe-study-protocol-20260921.md',
  protocolSha256:'6112af06bec53eed47d63e09336ed2fde03b6468d023f2b48267240245be7d88',
  registryVersion:'2026-09-20-memory-v1',
  roeMeasure:'LTM_ROE_AVERAGE_EQUITY',
  roeBasis:'parent-income-average-equity',
  seed:'wenying-pb-roe-v1|TW|',
});
export const ROE_BUCKETS = Object.freeze(['<=0','(0,5]','(5,10]','(10,15]','>15']);
export const DISCOVERY_TICKERS = Object.freeze([
  '1102','1580','2344','2345','2382','2451','2491','2610','3036','3135',
  '3260','3413','3484','3592','4915','4938','4967','4973','6021','6176',
  '6279','6669','8069','8088','8183','8213','8271','8277','8299',
]);
const discovery = new Set(DISCOVERY_TICKERS);
const DAY = 86400000;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const compareTicker = (a,b) => a.ticker.localeCompare(b.ticker);
const median = values => {
  const a=values.toSorted((x,y)=>x-y),n=a.length;
  if(!n)return null;
  const lower=a[Math.floor((n-1)/2)],upper=a[Math.floor(n/2)];
  // PB inputs are bounded positive ratios; log errors/differences are finite
  // and bounded. This midpoint preserves positive subnormals without overflow.
  return lower+(upper-lower)/2;
};
const mean = values => values.length ? values.reduce((sum,v)=>sum+v/values.length,0) : null;

export function ltmRoeBucket(roe) {
  if(!finite(roe))return null;
  return roe<=0 ? '<=0' : roe<=5 ? '(0,5]' : roe<=10 ? '(5,10]' : roe<=15 ? '(10,15]' : '>15';
}

export function issuerStudySplit(ticker) {
  if(typeof ticker!=='string'||!/^\d{4}$/.test(ticker))throw new Error('INVALID_ISSUER_TICKER');
  if(discovery.has(ticker))return 'discovery';
  return Number.parseInt(sha256(PB_ROE_STUDY.seed+ticker).slice(0,8),16)%5===0 ? 'holdout' : 'train';
}

function commonExclusions(record) {
  const reasons=[];
  if(record?.status!=='ready')return ['RECORD_NOT_READY'];
  const s=record.stock;
  if(!s||s.ticker!==record.ticker||s.market!==record.market)throw new Error('READY_RECORD_IDENTITY_MISMATCH');
  if(s.market!=='TW')reasons.push('NOT_TAIWAN');
  if(typeof s.ticker!=='string'||!/^\d{4}$/.test(s.ticker))reasons.push('NOT_FOUR_DIGIT_ISSUER');
  if(s.financialMetrics?.currency!=='TWD')reasons.push('NOT_TWD');
  if(s.dataBasis!=='ltm'||s.financialMetrics?.periodBasis!=='ltm')reasons.push('NOT_LTM');
  if(s.financialMetrics?.shareBasis!=='period-end-ordinary')reasons.push('NOT_PERIOD_END_ORDINARY_SHARES');
  if(!validDate(s.updatedAt)||!validDate(s.financialDataDate))reasons.push('INVALID_QUOTE_OR_FINANCIAL_DATE');
  else {
    const age=(Date.parse(s.updatedAt)-Date.parse(s.financialDataDate))/DAY;
    if(age<0||age>180)reasons.push('FINANCIAL_AGE_OUTSIDE_0_180_DAYS');
  }
  if(!positive(s.price))reasons.push('INVALID_PRICE');
  if(!positive(s.financialMetrics?.sharesOutstanding))reasons.push('INVALID_SHARES');
  // Division avoids overflow in price * shares; it is the same market-cap gate.
  if(positive(s.price)&&positive(s.financialMetrics?.sharesOutstanding)
    &&s.price<1e9/s.financialMetrics.sharesOutstanding)reasons.push('MARKET_CAP_BELOW_1B_TWD');
  if(!positive(s.bvps))reasons.push('INVALID_BVPS');
  if(typeof s.industry!=='string'||!s.industry.trim()
    ||/^(其他|未分類)$|上市公司|上櫃公司/.test(s.industry.trim()))reasons.push('INVALID_INDUSTRY');
  if(isFinancialCompany(s))reasons.push('FINANCIAL_COMPANY');
  if(s.financialMetrics?.roeBasis!==PB_ROE_STUDY.roeBasis)reasons.push('UNSUPPORTED_ROE_BASIS');
  if(!finite(s.roe))reasons.push('INVALID_ROE');
  if(s.taiwanBusinessGroup!==undefined&&!validTaiwanBusinessGroupReference(s))reasons.push('INVALID_EXPLICIT_BUSINESS_GROUP');
  return reasons;
}

function predictPb(target,train,sameBucket) {
  const matched=train.filter(peer=>peer.ticker!==target.ticker
    &&peer.groupKey===target.groupKey&&peer.quoteDate===target.quoteDate
    &&peer.financialDate===target.financialDate&&peer.roeBasis===target.roeBasis
    &&(!sameBucket||peer.roeBucket===target.roeBucket));
  const observations=matched.map(peer=>({ticker:peer.ticker,pb:peer.price/peer.bvps}))
    .filter(peer=>positive(peer.pb)&&peer.pb<=30).sort(compareTicker);
  const values=observations.map(peer=>peer.pb).sort((a,b)=>a-b),n=values.length;
  const q1=n ? values[Math.floor((n-1)*.25)] : null;
  const q3=n ? values[Math.ceil((n-1)*.75)] : null;
  const reasons=n<5 ? ['INSUFFICIENT_TRAIN_PEERS'] : q3/q1>4 ? ['TRAIN_PB_IQR_TOO_WIDE'] : [];
  const predictedPb=reasons.length ? null : median(values);
  // log(a)-log(b) is algebraically log(a/b), without ratio overflow/underflow.
  const absoluteLogError=predictedPb===null ? null : Math.abs(Math.log(predictedPb)-target.observedLogPb);
  return {status:predictedPb===null?'abstained':'predicted',predictedPb,absoluteLogError,
    reasons,peerCount:n,peerTickers:observations.map(peer=>peer.ticker),
    matchingTrainCount:matched.length,invalidTrainPbCount:matched.length-n,q1,q3,
    iqrRatio:n&&finite(q3/q1)?q3/q1:null,
    iqrRatioRepresentable:n>0&&finite(q3/q1)};
}

function summarizeRows(rows) {
  const denominator=rows.length;
  const countA=rows.filter(r=>r.A.predictedPb!==null).length;
  const countB=rows.filter(r=>r.B.predictedPb!==null).length;
  const paired=rows.filter(r=>r.pairedDifference!==null);
  const ratio=n=>denominator?n/denominator:null;
  const arm=n=>({count:n,coverage:ratio(n),abstained:denominator-n,abstentionRate:ratio(denominator-n)});
  const errors=key=>({mean:mean(paired.map(r=>r[key].absoluteLogError)),median:median(paired.map(r=>r[key].absoluteLogError))});
  const diffs=paired.map(r=>r.pairedDifference);
  return {denominator,A:arm(countA),B:arm(countB),common:paired.length,commonCoverage:ratio(paired.length),
    aOnly:countA-paired.length,bOnly:countB-paired.length,neither:denominator-countA-countB+paired.length,
    nonPositiveRoe:{zero:rows.filter(r=>r.roe===0).length,negative:rows.filter(r=>r.roe<0).length},
    paired:{count:paired.length,A:errors('A'),B:errors('B'),
      difference:{mean:mean(diffs),median:median(diffs)},
      improved:diffs.filter(d=>d<0).length,worsened:diffs.filter(d=>d>0).length,unchanged:diffs.filter(d=>d===0).length}};
}

function makePanel(eligible,kind) {
  const business=kind==='business';
  const accepted=eligible.filter(s=>!business||s.businessGroup!==null);
  const excluded=eligible.filter(s=>business&&s.businessGroup===null)
    .map(s=>({ticker:s.ticker,reason:'NO_EXISTING_BUSINESS_GROUP'}));
  const members=accepted.map(s=>({...s,groupKey:business?'business:'+s.businessGroup:'industry:'+s.industry}));
  const train=members.filter(s=>s.split==='train');
  const holdout=members.filter(s=>s.split==='holdout');
  const rows=holdout.map(target=>{
    const A=predictPb(target,train,false),B=predictPb(target,train,true);
    return {ticker:target.ticker,name:target.name,groupKey:target.groupKey,quoteDate:target.quoteDate,
      financialDate:target.financialDate,roeBasis:target.roeBasis,roe:target.roe,roeBucket:target.roeBucket,
      observedPb:target.observedPb,observedLogPb:target.observedLogPb,
      observedPbRepresentable:target.observedPb!==null,A,B,
      pairedDifference:A.absoluteLogError!==null&&B.absoluteLogError!==null ? B.absoluteLogError-A.absoluteLogError : null};
  });
  // Include train-only groups and every fixed bucket, not just usable/improved cells.
  const groups=business ? TAIWAN_BUSINESS_GROUPS.map(g=>'business:'+g.id)
    : [...new Set(members.map(s=>s.groupKey))].sort();
  const cell=(filter)=>{
    const subset=members.filter(filter),targets=rows.filter(filter);
    return {eligible:subset.length,train:subset.filter(s=>s.split==='train').length,...summarizeRows(targets)};
  };
  return {kind:business?'existing-business-group':'accounting-industry',
    counts:{eligible:members.length,train:train.length,holdout:holdout.length,excluded:excluded.length},
    summary:summarizeRows(rows),
    byGroup:groups.map(groupKey=>({groupKey,...cell(s=>s.groupKey===groupKey)})),
    byRoeBucket:ROE_BUCKETS.map(roeBucket=>({roeBucket,...cell(s=>s.roeBucket===roeBucket)})),
    excluded,trainTickers:train.map(s=>s.ticker),rows};
}

/** Object entry point for explicitly synthetic tests; CLI verifies frozen raw bytes. */
export function studyTaiwanPbRoe(data,provenance={}) {
  if(!Array.isArray(data?.records))throw new Error('INVALID_RECORDS');
  if(TAIWAN_BUSINESS_REGISTRY_VERSION!==PB_ROE_STUDY.registryVersion)throw new Error('BUSINESS_REGISTRY_VERSION_CHANGED');
  const seen=new Set();
  for(const record of data.records) {
    if(typeof record?.ticker==='string') {
      if(seen.has(record.ticker))throw new Error('DUPLICATE_ISSUER_TICKER');
      seen.add(record.ticker);
    }
  }
  const excluded=[],common=[];
  for(const record of data.records) {
    const reasons=commonExclusions(record);
    if(reasons.length) {excluded.push({ticker:record?.ticker??null,market:record?.market??null,reasons});continue;}
    const s=withTaiwanBusinessGroup(record.stock),pb=s.price/s.bvps;
    common.push({ticker:s.ticker,name:s.name,industry:s.industry.trim(),price:s.price,bvps:s.bvps,
      quoteDate:s.updatedAt,financialDate:s.financialDataDate,roeBasis:s.financialMetrics.roeBasis,
      roe:s.roe,roeBucket:ltmRoeBucket(s.roe),observedPb:positive(pb)?pb:null,
      observedLogPb:positive(pb)?Math.log(pb):Math.log(s.price)-Math.log(s.bvps),split:issuerStudySplit(s.ticker),
      businessGroup:s.taiwanBusinessGroup?.id??null});
  }
  common.sort(compareTicker);
  excluded.sort((a,b)=>String(a.ticker).localeCompare(String(b.ticker)));
  const reasonCounts={};
  for(const row of excluded)for(const reason of row.reasons)reasonCounts[reason]=(reasonCounts[reason]??0)+1;
  const discoveryExcluded=common.filter(s=>s.split==='discovery').map(s=>s.ticker);
  const eligible=common.filter(s=>s.split!=='discovery');
  return {studyId:PB_ROE_STUDY.id,researchOnly:true,roeMeasure:PB_ROE_STUDY.roeMeasure,
    provenance:{inputSha256:null,protocolSha256:null,scriptSha256:null,...provenance,
      registryVersion:TAIWAN_BUSINESS_REGISTRY_VERSION,observedAt:data.observedAt??null,quoteSession:data.session?.date??null},
    parameters:{seed:PB_ROE_STUDY.seed,split:'unsigned-first-8-sha256-hex-mod-5; 0=holdout',
      roeBasis:PB_ROE_STUDY.roeBasis,roeUnit:'percentage-points',roeBuckets:[...ROE_BUCKETS],
      minimumTrainPeers:5,maximumPeerPb:30,maximumIqrRatio:4,minimumMarketCapTwd:1e9,
      maximumFinancialAgeDays:180,discoveryTickers:[...DISCOVERY_TICKERS],
      metric:'abs(log(predictedPB/observedPB))',pairedDifference:'B_error-A_error',
      noFairValueTruth:true,noForwardRoe:true,noPointInTimeBacktest:true},
    counts:{records:data.records.length,ready:data.records.filter(r=>r?.status==='ready').length,
      commonEligible:common.length,commonExcluded:excluded.length,discovery:discoveryExcluded.length,
      train:eligible.filter(s=>s.split==='train').length,holdout:eligible.filter(s=>s.split==='holdout').length},
    exclusionReasonCounts:Object.fromEntries(Object.entries(reasonCounts).sort(([a],[b])=>a.localeCompare(b))),
    exclusionCountsAreNonExclusive:true,excluded,discoveryExcluded,
    panels:{primaryIndustry:makePanel(eligible,'industry'),secondaryBusinessGroup:makePanel(eligible,'business')}};
}

export function summarizePbRoeStudy(result) {
  const panels=Object.fromEntries(Object.entries(result.panels).map(([key,panel])=>[key,{
    kind:panel.kind,counts:panel.counts,summary:panel.summary,byGroup:panel.byGroup,byRoeBucket:panel.byRoeBucket,
  }]));
  return {...result,excluded:undefined,discoveryExcluded:undefined,panels};
}

async function main() {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help') {
    console.log('Research only: node --experimental-strip-types scripts/study-taiwan-pb-roe.mjs [--summary]\nReads only the protocol-pinned frozen input; prints JSON to stdout.');return;
  }
  if(args.some(a=>a!=='--summary')||args.length>1)throw new Error('INVALID_ARGUMENTS');
  const root=new URL('../',import.meta.url);
  const [inputBytes,protocolBytes,scriptBytes,registryBytes,classificationBytes]=await Promise.all([
    readFile(new URL(PB_ROE_STUDY.inputPath,root)),readFile(new URL(PB_ROE_STUDY.protocolPath,root)),
    readFile(new URL(import.meta.url)),readFile(new URL('../lib/taiwan-business-groups.ts',import.meta.url)),
    readFile(new URL('../lib/company-classification.ts',import.meta.url)),
  ]);
  const inputSha256=sha256(inputBytes),protocolSha256=sha256(protocolBytes);
  if(inputSha256!==PB_ROE_STUDY.inputSha256)throw new Error('FROZEN_INPUT_BYTES_HASH_MISMATCH');
  if(protocolSha256!==PB_ROE_STUDY.protocolSha256)throw new Error('FROZEN_PROTOCOL_BYTES_HASH_MISMATCH');
  const result=studyTaiwanPbRoe(JSON.parse(inputBytes.toString('utf8')),{inputSha256,protocolSha256,
    scriptSha256:sha256(scriptBytes),registrySha256:sha256(registryBytes),classificationSha256:sha256(classificationBytes)});
  console.log(JSON.stringify(args.includes('--summary')?summarizePbRoeStudy(result):result,null,2));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
