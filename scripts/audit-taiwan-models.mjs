// Public-source research only: no upload, refresh credential or production write.
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadUniverse} from './daily-refresh.mjs';
import {fetchRefreshRecord,expectedSession,taiwanPerShareIssue} from '../lib/daily-refresh-data.ts';
import {buildTaiwanComparableMap} from '../lib/taiwan-comparables.ts';
import {withTaiwanBusinessGroup,TAIWAN_BUSINESS_REGISTRY_VERSION} from '../lib/taiwan-business-groups.ts';
import {calculateStock} from '../lib/valuation.ts';
import {VALUE_REFERENCES,REFERENCE_REVIEW_DATE,compareReference,summarizeComparisons} from '../lib/value-reference-audit.ts';
const captureArg=process.argv.indexOf('--capture');
const capture=captureArg<0?'':process.argv[captureArg+1];
if(capture && !/^[a-z0-9-]+$/.test(capture))throw new Error('INVALID_CAPTURE_NAME');
const directory=new URL('../outputs/taiwan-model-audit/'+(capture?capture+'/':''),import.meta.url);
await mkdir(directory,{recursive:true});
const replay=process.argv.includes('--replay');
const businessGroups=process.argv.includes('--business-groups');
if(businessGroups&&!replay)throw new Error('BUSINESS_COMPARISON_REQUIRES_FROZEN_REPLAY');
let data;
if(replay)data=JSON.parse(await readFile(new URL('inputs.json',directory),'utf8'));
else {
  try {await stat(new URL('inputs.json',directory));throw new Error('CAPTURE_EXISTS_USE_REPLAY_OR_NEW_CAPTURE');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const observedAt=new Date(),session=await expectedSession('TW',observedAt);
  const targets=(await loadUniverse()).filter(t=>t.market==='TW');
  data={observedAt:observedAt.toISOString(),session,records:[]};
  for(let i=0;i<targets.length;i+=8) {
    data.records.push(...await Promise.all(targets.slice(i,i+8).map(t=>fetchRefreshRecord(t,session.date,observedAt))));
    if(data.records.filter(r=>r.issues.includes('UPSTREAM_HTTP_429')).length>30)throw new Error('PROVIDER_RATE_LIMITED');
    if((i+8)%200===0)console.log(JSON.stringify({checked:data.records.length,total:targets.length}));
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  await writeFile(new URL('inputs.json',directory),JSON.stringify(data),{flag:'wx'});
}
const sha=value=>createHash('sha256').update(value).digest('hex');
const inputSha256=sha(JSON.stringify(data));
const modelFiles=['valuation.ts','valuation-calibration.ts','taiwan-comparables.ts','taiwan-business-groups.ts','taiwan-valuation-evidence.ts','company-classification.ts','daily-refresh-data.ts'];
const modelSha256=sha((await Promise.all(modelFiles.map(file=>readFile(new URL('../lib/'+file,import.meta.url),'utf8')))).join('\n'));
const stocks=data.records.filter(r=>r.status==='ready'&&!taiwanPerShareIssue(r.stock)).map(r=>r.stock);
// Replay old captures using their already-recorded accounting identities only;
// do not fetch new financial values into a frozen comparison.
for(const s of stocks)if(s.financialMetrics.nonControllingBookPerShare===undefined) {
  const nci=s.bvps*s.financialLeverage*(1-s.debtRatio/100)-s.bvps;
  s.financialMetrics.nonControllingBookPerShare=Math.abs(nci)<1e-8?0:nci;
}
const candidateStocks=businessGroups?stocks.map(withTaiwanBusinessGroup):stocks;
const peers=buildTaiwanComparableMap(candidateStocks);
const rows=candidateStocks.map(stock=>{
  const current=calculateStock(stock),comparableMultiples=peers.get(stock.ticker);
  const candidate=calculateStock({...stock,comparableMultiples,valuationPolicy:'tw-comparables-v1'});
  return {ticker:stock.ticker,name:stock.name,stock,comparableMultiples,
    current:{fairValue:current.calibratedFairValue,models:current.models},
    candidate:{fairValue:candidate.calibratedFairValue,models:candidate.models,reviewRequired:candidate.valuationReviewRequired,reasons:candidate.historicalCautionReasons}};
});
const comparisons=VALUE_REFERENCES.filter(r=>r.market==='TW').map(reference=>{
  const row=rows.find(r=>r.ticker===reference.ticker);
  return {...compareReference(reference,row?{ticker:row.ticker,market:'TW',price:row.stock.price,fairValue:row.candidate.fairValue,
    quoteDate:row.stock.updatedAt,modelCount:row.candidate.models.length,financialDate:row.stock.financialDataDate}:null),reviewRequired:row?.candidate.reviewRequired??true};
});
const discoverySummary=summarizeComparisons(comparisons);
const output=businessGroups?'comparison-business-groups.json':'comparison.json';
await writeFile(new URL(output,directory),JSON.stringify({observedAt:data.observedAt,session:data.session,inputSha256,modelSha256,
  peerClassification:businessGroups?TAIWAN_BUSINESS_REGISTRY_VERSION:'industry',
  referenceReviewedAt:REFERENCE_REVIEW_DATE,discoverySetOnly:true,discoverySummary,comparisons,rows},null,2));
console.log(JSON.stringify({ready:stocks.length,withPeers:peers.size,total:data.records.length,discoverySummary,output:new URL(output,directory).pathname}));
